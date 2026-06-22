#!/usr/bin/env node
// LEFTOVER-ROTATION-GUARD-001: 奇数人数の「待機(leftover)」が回戦をまたいでローテーションし、
//   特定の1人が最後まで一度も対局に入らない事態が起きないことを固定する回帰テスト。
//   背景: 運営実観測で「19人中1人が全回戦 対局なし」が報告された（#272 修正前ビルドのデータと推定）。
//   本テストは #272（generatePairing の sitOut ローテーション＋submitRound の待機許容）が将来の改修で
//   壊れないことを守る。観点:
//     R0  2回戦以降に0卓へ潰れない（進行不能なし）。
//     R1  「1回戦は floor(N/2)卓・末尾1名(=aN)は未対局」状況から2回戦で aN が必ず対局へ入る。
//     R2  4回戦を通して、一度も対局しない参加者が出ない（minPlayed >= 1）。
//     R3  待機回数が均される（出場回数の max-min <= 1＝ローテーション）。
//   完全架空データのみ。shogi_v4.html 無改変（test のみ）。match スキーマ {p1,p2,winner,lastModifiedBy} 不変。
const fs = require('fs');
const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_leftover_rotation_guard_001.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath,'utf8');
function extractScripts(html){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,s=[];while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeNode(tag){return {nodeType:1,tagName:String(tag||'div'),id:'',className:'',value:'',innerHTML:'',disabled:false,checked:false,type:'',style:{},_attrs:{},childNodes:[],_listeners:{},focus(){},blur(){},click(){},appendChild(c){this.childNodes.push(c);return c;},removeChild(){},remove(){},setAttribute(k,v){this._attrs[k]=String(v);},getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},addEventListener(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};}
function makeContext(){const elements={};const docMock={getElementById(id){if(!elements[id]){const n=makeNode('div');n.id=id;elements[id]=n;}return elements[id];},createElement(t){return makeNode(t);},createTextNode(t){return {nodeType:3,textContent:String(t==null?'':t)};},body:makeNode('body'),addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};const winMock={innerWidth:1024,addEventListener(){},removeEventListener(){},open(){return {focus(){},addEventListener(){},print(){},close(){}};}};const localStorageMock={_:{},getItem(k){return (k in this._)?this._[k]:null;},setItem(k,v){this._[k]=String(v);},removeItem(k){delete this._[k];}};return {document:docMock,window:winMock,localStorage:localStorageMock};}
function loadEnv(){const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',`${js};return {normalizeState:normalizeState,generatePairing:generatePairing,submitRound:submitRound,getWins:getWins,getRoundLeftoverPlayers:getRoundLeftoverPlayers,_setState:function(s){state=s;},_getState:function(){return state;}};`);return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){return null;},{createObjectURL(){return 'blob:mock';},revokeObjectURL(){}},{log(){},error(){},warn(){}},Promise,function(){});}
let pass=0,fail=0;
function ok(m){pass++;if(process.env.VERBOSE)console.log('  ✓ '+m);}
function ng(m){fail++;console.error('  ✗ '+m);}
function assert(c,m){if(c)ok(m);else ng(m);}
function makePlayers(cls,n){var a=[];for(var i=1;i<=n;i++)a.push({id:cls.toLowerCase()+i,name:'kakuu'+i,cls:cls,member:'member',grade:'ippan',entry_no:i,yomi:''});return a;}
function setupRound1Done(env,cls,n){var s=env.normalizeState({rounds:4,started:true,classes:[{id:'A',name:'A',started:true}],players:{A:[]},pairings:{A:[]},results:{A:[]}});s.players[cls]=makePlayers(cls,n);var rp=s.players[cls],r1=[],k=Math.floor(rp.length/2);for(var i=0;i<k;i++)r1.push({p1:rp[2*i].id,p2:rp[2*i+1].id,winner:rp[2*i].id,lastModifiedBy:'auto'});s.results[cls]=[r1];s.pairings[cls]=[];env._setState(s);return env._getState();}
function whoPlayedRound(rm){var set={};for(var i=0;i<rm.length;i++){var m=rm[i];if(m.winner){if(m.p1)set[m.p1]=1;if(m.p2)set[m.p2]=1;}}return set;}
[5,7,9,19,21].forEach(function(N){
  var TRIALS=60,ROUNDS=4,cls='A';
  var aNPlaysR2All=true, neverPlayedAny=false, sitOutSkewMax=0, zeroTableAny=false;
  for(var t=0;t<TRIALS;t++){
    var env=loadEnv();setupRound1Done(env,cls,N);
    var st=env._getState();var played={};for(var i=0;i<st.players[cls].length;i++)played[st.players[cls][i].id]=0;
    Object.keys(whoPlayedRound(st.results[cls][0])).forEach(function(id){played[id]++;});
    for(var round=2;round<=ROUNDS;round++){
      env.generatePairing(cls);st=env._getState();var pr=st.pairings[cls];
      if(pr.length===0){zeroTableAny=true;break;}
      if(round===2){var inR2={};for(var p=0;p<pr.length;p++){if(pr[p].p1)inR2[pr[p].p1]=1;if(pr[p].p2)inR2[pr[p].p2]=1;}if(!inR2[cls.toLowerCase()+N])aNPlaysR2All=false;}
      for(var q=0;q<pr.length;q++)pr[q].winner=pr[q].p1;
      env.submitRound(cls);st=env._getState();
      Object.keys(whoPlayedRound(st.results[cls][round-1])).forEach(function(id){played[id]++;});
    }
    var arr=Object.keys(played).map(function(id){return played[id];});
    var minP=Math.min.apply(null,arr),maxP=Math.max.apply(null,arr);
    if(minP===0)neverPlayedAny=true;
    if((maxP-minP)>sitOutSkewMax)sitOutSkewMax=(maxP-minP);
  }
  assert(!zeroTableAny, 'N='+N+' R0 2回戦以降に0卓へ潰れない');
  assert(aNPlaysR2All, 'N='+N+' R1 1回戦未対局の末尾1名が必ず2回戦で対局へ入る');
  assert(!neverPlayedAny, 'N='+N+' R2 4回戦を通して一度も対局しない人が出ない');
  assert(sitOutSkewMax<=1, 'N='+N+' R3 待機回数が均される（max-min<=1）');
});
console.log('LEFTOVER-ROTATION-GUARD-001: pass='+pass+' fail='+fail);
process.exit(fail===0?0:1);
