#!/usr/bin/env node
// OPS-SHARED-KEY-REDESIGN-001 Phase B (#582) — 受付タブ「運営共通キー」UI＋オーケストレーション検証。
//   issueOpsSharedKey（発行→state.tournament_id=t_<当日>_<4桁>・再発行は同キー）／applyOpsSharedKey（4桁→セット・検証分岐）／
//   静的HTML（発行/入力/合わせる・受付タブ配置・旧共有行の撤去）＋ bindReportEvents 結線／ヘルプ更新。node 実走。
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
    `${js};return { issueOpsSharedKey:issueOpsSharedKey, applyOpsSharedKey:applyOpsSharedKey, opsKeyToTournamentId:opsKeyToTournamentId, tournamentIdToOpsKey:tournamentIdToOpsKey, _setState:function(s){ state=s; }, _getState:function(){ return state; } };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{});
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

console.log('=== I: issueOpsSharedKey（発行・再発行は同キー）===');
var i1=loadEnv(); i1._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var key=i1.issueOpsSharedKey(function(){});
ok(/^\d{4}$/.test(key),'I1 4桁キーを発行');
ok(/^t_\d{4}_\d{2}_\d{2}_\d{4}$/.test(i1._getState().tournament_id),'I2 state.tournament_id=t_<当日>_<4桁>');
ok(i1.tournamentIdToOpsKey(i1._getState().tournament_id)===key,'I3 末尾4桁が発行キーと一致');
var key2=i1.issueOpsSharedKey(function(){});
ok(key2===key,'I4 再発行は同じキー（毎回変えない）');

console.log('=== A: applyOpsSharedKey（4桁→セット・検証分岐）===');
var a1=loadEnv(); a1._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var rBad=a1.applyOpsSharedKey('abc',function(){});
ok(rBad&&rBad.ok===false,'A1 4桁でない→ok:false');
ok(a1._getState().tournament_id==='','A2 不正時は tournament_id を変更しない');
var r3=a1.applyOpsSharedKey('482',function(){});
ok(r3&&r3.ok===false,'A3 3桁→ok:false');
var a2=loadEnv(); a2._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var rOk=a2.applyOpsSharedKey(' 4821 ',function(){});
ok(rOk&&rOk.ok===true&&rOk.key==='4821','A4 前後空白除去して4821を受理');
ok(/^t_\d{4}_\d{2}_\d{2}_4821$/.test(a2._getState().tournament_id),'A5 state.tournament_id=t_<当日>_4821');
ok(a2.tournamentIdToOpsKey(a2._getState().tournament_id)==='4821','A6 末尾4桁=4821');
// 発行→別端末で同キーapply が同じ tournament_id を生む（同日前提）
var a3=loadEnv(); a3._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var kk=a3.issueOpsSharedKey(function(){}); var tidIssued=a3._getState().tournament_id;
var a4=loadEnv(); a4._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
a4.applyOpsSharedKey(kk,function(){});
ok(a4._getState().tournament_id===tidIssued,'A7 同キーapplyで発行側と同じtournament_id（＝統合の前提）');

console.log('=== H: 静的HTML＋bind＋撤去 ===');
ok(RAW.indexOf('id="ops-share-details"')>=0,'H1 2台分担の畳みセクション');
ok(RAW.indexOf('id="opsIssueBtn"')>=0,'H2 発行ボタン');
ok(RAW.indexOf('id="opsKeyInput"')>=0,'H3 キー入力');
ok(RAW.indexOf('id="opsApplyBtn"')>=0,'H4 合わせるボタン');
ok(RAW.indexOf('id="opsShareStatus"')>=0,'H5 status');
ok(RAW.indexOf('運営共通キーを発行')>=0&&RAW.indexOf('このキーに合わせる')>=0,'H6 ボタンラベル');
ok(RAW.indexOf("getElementById('opsIssueBtn')")>=0&&RAW.indexOf('issueOpsSharedKey(')>=0,'H7 発行 結線');
ok(RAW.indexOf("getElementById('opsApplyBtn')")>=0&&RAW.indexOf('applyOpsSharedKey(')>=0,'H8 合わせる 結線');
// 受付タブに配置（reg-setup-details の後・参加者を登録するの前）
ok(RAW.indexOf('id="ops-share-details"')>RAW.indexOf('id="reg-setup-details"')&&RAW.indexOf('id="ops-share-details"')<RAW.indexOf('参加者を登録する'),'H9 受付タブ（⚙設定の後・登録の前）に配置');
// 旧共有行・旧関数の撤去
ok(RAW.indexOf('id="copyTidBtn"')<0&&RAW.indexOf('id="tidShareStatus"')<0,'H10 旧共有行（copyTidBtn/tidShareStatus）撤去');
ok(RAW.indexOf('function copyCurrentTournamentId(')<0&&RAW.indexOf('function applySpecifiedTournamentId(')<0,'H11 旧関数撤去');
ok(RAW.indexOf('大会IDをコピー')<0&&RAW.indexOf('大会IDを指定して開始')<0,'H12 旧ラベル撤去');
// ヘルプ更新
ok(RAW.indexOf('運営共通キーを発行')>=0 && RAW.indexOf("1台目で「大会IDをコピー」")<0,'H13 ヘルプ文言を運営共通キーに更新');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
