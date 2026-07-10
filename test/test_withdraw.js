#!/usr/bin/env node
// WITHDRAW-001: 途中棄権（軽量版）。棄権者は以降の generatePairing 対象外（過去成績は残す）。
//   棄権時に現回戦の未結果対局があれば相手を不戦勝(forfeit)にできる。順位表に「棄権」表示。残り奇数は既存待機で吸収。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},focus(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(confirmVal){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {normalizeState:normalizeState,generatePairing:generatePairing,getRoundLeftoverPlayers:getRoundLeftoverPlayers,toggleWithdrawn:toggleWithdrawn,withdrawMarkHtml:withdrawMarkHtml,__setAppModalTestResolver:(typeof __setAppModalTestResolver!=="undefined"?__setAppModalTestResolver:undefined),_get:function(){return state;},_set:function(v){state=v;}};');
  const api=fn(doc,win,ls,{randomUUID:()=>'0'},()=>{},()=>!!confirmVal,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true});
  // IN-APP-MODAL-001 (#606): 不戦勝確認が native confirm→appConfirm に移行。appConfirm を confirmVal で同期解決するよう配線＝既存 T2/T5 を挙動同値のまま維持。
  if(typeof api.__setAppModalTestResolver==='function')api.__setAppModalTestResolver(function(){return !!confirmVal;});
  return api;
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function st(players,extra){
  var s={players:{A:players,B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};
  if(extra)for(var k in extra)s[k]=extra[k];
  return s;
}
function P(n){var a=[];for(var i=1;i<=n;i++)a.push({id:'p'+i,name:'選手'+i,entry_no:i});return a;}

console.log('=== normalizeState が withdrawn を保持（true のみ）===');
var E=makeEnv(true);
var n=E.normalizeState({players:{A:[{id:'p1',name:'一',withdrawn:true},{id:'p2',name:'二'},{id:'p3',name:'三',withdrawn:false}],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'}]});
ok(n.players.A[0].withdrawn===true,'N1 withdrawn:true を保持');
ok(!('withdrawn' in n.players.A[1]),'N2 未指定は withdrawn キーなし');
ok(!('withdrawn' in n.players.A[2]),'N3 withdrawn:false は保持しない（=在籍）');

console.log('=== generatePairing が棄権者を除外 ===');
var E2=makeEnv(true);
var pls=P(4);pls[3].withdrawn=true;   // p4 棄権 → 実働 p1,p2,p3（奇数）
E2._set(st(pls));
E2.generatePairing('A');
var pr=E2._get().pairings.A;
var inP4=pr.some(function(m){return m&&(m.p1==='p4'||m.p2==='p4');});
ok(!inP4,'G1 棄権者(p4)は組み合わせに入らない');
ok(pr.length===1,'G2 実働3人（奇数）→1卓（残り1人は待機）');
var E2b=makeEnv(true);var pls2=P(4);E2b._set(st(pls2));E2b.generatePairing('A');
ok(E2b._get().pairings.A.length===2,'G3 全員在籍4人なら2卓（除外の対比）');

console.log('=== getRoundLeftoverPlayers は棄権者を待機に含めない ===');
var E3=makeEnv(true);
var pls3=P(4);pls3[3].withdrawn=true; // p4棄権, p3は現回戦ペア外の在籍者
E3._set(st(pls3,{results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]],B:[]},pairings:{A:[{p1:'p1',p2:'p2',winner:null}],B:[]}}));
var lo=E3.getRoundLeftoverPlayers('A').map(function(p){return p.id;});
ok(lo.indexOf('p3')>=0,'L1 在籍の未割当者(p3)は待機に出る');
ok(lo.indexOf('p4')<0,'L2 棄権者(p4)は待機に出さない');

console.log('=== toggleWithdrawn（棄権＋不戦勝／復帰）===');
var E4=makeEnv(true); // confirm=YES → 相手を不戦勝
E4._set(st(P(2),{pairings:{A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}],B:[]}}));
E4.toggleWithdrawn('p1','A');
var s4=E4._get();
ok(s4.players.A[0].withdrawn===true,'T1 棄権フラグが立つ');
ok(s4.pairings.A[0].winner==='p2','T2 現回戦の相手を不戦勝（勝ち）に記録');
E4.toggleWithdrawn('p1','A');
ok(!s4.players.A[0].withdrawn,'T3 再トグルで復帰（withdrawn 解除）');

var E5=makeEnv(false); // confirm=NO → 不戦勝を付けない
E5._set(st(P(2),{pairings:{A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}],B:[]}}));
E5.toggleWithdrawn('p1','A');
var s5=E5._get();
ok(s5.players.A[0].withdrawn===true,'T4 棄権フラグは立つ（confirm No でも）');
ok(s5.pairings.A[0].winner===null,'T5 confirm No なら不戦勝を付けない');

console.log('=== withdrawMarkHtml ===');
var E6=makeEnv(true);
E6._set(st([{id:'p1',name:'一',withdrawn:true},{id:'p2',name:'二'}]));
ok(E6.withdrawMarkHtml('p1','A').indexOf('棄権')>=0,'W1 棄権者は「棄権」マーク');
ok(E6.withdrawMarkHtml('p2','A')==='','W2 在籍者はマークなし（既存出力不変）');

console.log('=== 配線（RAW）===');
ok(/if\(p&&p\.withdrawn===true\)pp\.withdrawn=true/.test(RAW),'R1 normalizeState で withdrawn 保持');
ok(/\.filter\(function\(p\)\{return !\(p&&p\.withdrawn\);\}\)/.test(RAW),'R2 generatePairing で棄権者除外');
// REG-TAB-TIDY-001 (#743) ⑤b: 棄権/復帰の導線は行ボタン→「⋯ 編集」シート項目（pes-withdraw）へ移設。
//   意図（開始後のみ棄権導線が出る・呼び先は toggleWithdrawn）は不変のまま、新しい配線を検証する。
ok(/isClassStarted\(cls\)\)\{[\s\S]{0,600}pes-withdraw/.test(RAW)&&RAW.indexOf('toggleWithdrawn(playerId,cls)')>=0,'R3 受付一覧: 開始後のみ棄権導線（編集シート）→toggleWithdrawn');
ok(RAW.indexOf('nameWithNoRubyHtml(f.p.id,cls)+withdrawMarkHtml(f.p.id,cls)')>=0,'R4 順位表(モバイル/PC)に棄権マーク付与');

console.log('WITHDRAW: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
