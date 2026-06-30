#!/usr/bin/env node
// DAYOF-UNENTERED-COUNTER (当日第2弾⑥): 対局管理で未入力（勝者未選択）卓数を表示し、
//   未入力がある間は「確定して次へ」(submitBtn_) を無効化する。setWinner→renderTournament で
//   毎回再描画されるためライブ更新。submitRound の既存ガードは温存（二重防御）。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeNode(t){return {nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',disabled:false,style:{},_attrs:{},childNodes:[],_listeners:{},appendChild(c){this.childNodes.push(c);return c;},setAttribute(k,v){this._attrs[k]=String(v);},getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}};}
function loadEnv(){
  const elements={};
  const doc={getElementById(id){if(!elements[id]){const n=makeNode();n.id=id;elements[id]=n;}return elements[id];},createElement(t){return makeNode(t);},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:makeNode('body'),addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},removeEventListener(){},open(){return{focus(){},print(){},close(){},addEventListener(){}};}};
  const ls={_:{},getItem(k){return (k in this._)?this._[k]:null;},setItem(k,v){this._[k]=String(v);},removeItem(k){delete this._[k];}};
  const js=extractScripts(RAW);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    js+';return {normalizeState:normalizeState,buildCurrentPairingsHtml:buildCurrentPairingsHtml,_setState:function(s){state=s;}};');
  return fn(doc,win,ls,{randomUUID(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){return null;},{createObjectURL(){return 'b';},revokeObjectURL(){}},{log(){},error(){},warn(){}},Promise,function(){return 0;});
}
function players(cls,ids){return ids.map(function(id,i){return {id:id,name:'架空'+id,cls:cls,member:'member',grade:'ippan',entry_no:i+1,yomi:''};});}
function pairs(list){return list.map(function(pr){return {p1:pr[0],p2:pr[1],winner:(pr[2]||null),lastModifiedBy:'auto'};});}
function setup(env,pairsA){
  var s=env.normalizeState({players:{A:players('A',['a1','a2','a3','a4']),B:[]},rounds:4,pairings:{A:pairs(pairsA),B:[]},results:{A:[],B:[]},started:true,classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}});
  env._setState(s);
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

var env=loadEnv();

// 2卓とも未入力
setup(env,[['a1','a2'],['a3','a4']]);
var h0=env.buildCurrentPairingsHtml('A',1,false);
ok(h0.indexOf('残り <strong>2</strong> 卓 未入力')>=0,'U1 未入力2卓のカウンタ表示');
ok(/id="submitBtn_A" disabled/.test(h0),'U2 未入力時は確定ボタン disabled');

// 1卓だけ入力
setup(env,[['a1','a2','a1'],['a3','a4']]);
var h1=env.buildCurrentPairingsHtml('A',1,false);
ok(h1.indexOf('残り <strong>1</strong> 卓 未入力')>=0,'U3 残り1卓のカウンタ');
ok(/id="submitBtn_A" disabled/.test(h1),'U4 残り1卓でも disabled');

// 全卓入力済み
setup(env,[['a1','a2','a1'],['a3','a4','a3']]);
var h2=env.buildCurrentPairingsHtml('A',1,false);
ok(h2.indexOf('全 2 卓 入力済み')>=0,'U5 全卓入力済みの表示');
ok(h2.indexOf('id="submitBtn_A"')>=0 && /id="submitBtn_A" disabled/.test(h2)===false,'U6 全卓入力済みは確定ボタン有効（disabled なし）');

// RAW 配線
ok(/unfinishedCount[\s\S]{0,200}submitBtn_/.test(RAW)||/submitBtn_'\+cls\+'"'\+\(unfinishedCount>0\?' disabled/.test(RAW),'U7 RAW: unfinishedCount で確定ボタンを disabled');
ok(RAW.indexOf('submitRound')>=0,'U8 submitRound の既存ガードは温存（関数存在）');

console.log('DAYOF-UNENTERED: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
