#!/usr/bin/env node
// CLASS-SPLIT-CLOUD-MERGE-001 Phase 1 (#540) — 共有セットアップ（大会IDの共有）検証。
//   normalizeTournamentIdInput（純・貼付値の検証/正規化）／applySpecifiedTournamentId（state.tournament_id セット・検証分岐）／
//   静的 HTML（コピー/指定開始ボタン・入力・status）＋ bindReportEvents 結線。
//   ensureTournamentId の生成規則は無改変（本 Phase は受理側の追加のみ）。node で実走（実クラウドはブラウザ人手確認）。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},select:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var head=n('head');
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];},execCommand:function(){return true;}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { normalizeTournamentIdInput:normalizeTournamentIdInput, applySpecifiedTournamentId:applySpecifiedTournamentId, _setState:function(s){ state=s; }, _getState:function(){ return state; } };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{});
  return {env:env,ctx:ctx};
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

console.log('=== N: normalizeTournamentIdInput（純）===');
var L=loadEnv();var E=L.env;
ok(E.normalizeTournamentIdInput('t_2026_07_04')==='t_2026_07_04','N1 正常形はそのまま');
ok(E.normalizeTournamentIdInput('t_2026_07_04_2')==='t_2026_07_04_2','N2 サフィックス付きも受理');
ok(E.normalizeTournamentIdInput('  t_2026_07_04  ')==='t_2026_07_04','N3 前後半角空白を除去');
ok(E.normalizeTournamentIdInput('　t_2026_07_04　')==='t_2026_07_04','N4 前後全角空白を除去');
ok(E.normalizeTournamentIdInput('')==='','N5 空→空');
ok(E.normalizeTournamentIdInput(null)==='','N6 null→空');
ok(E.normalizeTournamentIdInput('abc')==='','N7 非該当→空');
ok(E.normalizeTournamentIdInput('t_2026_7_4')==='','N8 桁不足→空');
ok(E.normalizeTournamentIdInput('t_2026_07_04 x')==='','N9 内部空白/余分→空');
ok(E.normalizeTournamentIdInput('T_2026_07_04')==='','N10 先頭大文字は不許可（生成規則は小文字 t_）');

console.log('=== A: applySpecifiedTournamentId（検証分岐＋セット）===');
var a=loadEnv(); a.env._setState({tournament_id:'t_2026_07_04',classes:[],players:{},results:{}});
var rBad=a.env.applySpecifiedTournamentId('bad',function(){});
ok(rBad&&rBad.ok===false,'A1 形式不正→ok:false');
ok(a.env._getState().tournament_id==='t_2026_07_04','A2 不正時は tournament_id を変更しない');
var b=loadEnv(); b.env._setState({tournament_id:'t_2026_07_04',classes:[],players:{},results:{}});
var rOk=b.env.applySpecifiedTournamentId(' t_2026_07_04_3 ',function(){});
ok(rOk&&rOk.ok===true&&rOk.tournament_id==='t_2026_07_04_3','A3 正常→ok:true＋正規化ID');
ok(b.env._getState().tournament_id==='t_2026_07_04_3','A4 state.tournament_id を指定値にセット');

console.log('=== H: 静的 HTML＋bindReportEvents 結線 ===');
ok(RAW.indexOf('id="copyTidBtn"')>=0,'H1 大会IDコピーボタン');
ok(RAW.indexOf('id="tidInput"')>=0,'H2 大会ID入力');
ok(RAW.indexOf('id="applyTidBtn"')>=0,'H3 指定して開始ボタン');
ok(RAW.indexOf('id="tidShareStatus"')>=0,'H4 status 表示要素');
ok(RAW.indexOf('大会IDをコピー')>=0&&RAW.indexOf('大会IDを指定して開始')>=0,'H5 ボタンラベル');
ok(RAW.indexOf("getElementById('copyTidBtn')")>=0&&RAW.indexOf('copyCurrentTournamentId(')>=0,'H6 copy 結線');
ok(RAW.indexOf("getElementById('applyTidBtn')")>=0&&RAW.indexOf('applySpecifiedTournamentId(')>=0,'H7 apply 結線');
ok(RAW.indexOf('id="copyTidBtn"')>RAW.indexOf('id="cloudSendBtn"'),'H8 クラウド送信近傍（cloudSend 後）に配置');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
