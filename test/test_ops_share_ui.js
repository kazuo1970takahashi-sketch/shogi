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
function loadEnv(confirmImpl){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { issueOpsSharedKey:issueOpsSharedKey, applyOpsSharedKey:applyOpsSharedKey, opsKeyToTournamentId:opsKeyToTournamentId, tournamentIdToOpsKey:tournamentIdToOpsKey, opsRekeyNeedsConfirm:opsRekeyNeedsConfirm, opsKeyDateNote:opsKeyDateNote, refreshOpsKeyDisplay:refreshOpsKeyDisplay, _setState:function(s){ state=s; }, _getState:function(){ return state; } };`);
  const api=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},confirmImpl||function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{});
  api._doc=ctx.document;
  return api;
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

// ===== OPS-SHARED-KEY-REDESIGN-001 Phase C (#585) =====
console.log('=== C: Phase C 張り替え明示確認（opsRekeyNeedsConfirm）===');
var c0=loadEnv();
ok(c0.opsRekeyNeedsConfirm(null,'t_2026_07_05_1234')===false,'C1 state無し→false');
ok(c0.opsRekeyNeedsConfirm({tournament_id:'t_2026_07_05'},'t_2026_07_05_1234')===false,'C2 未送信（cloud_sent_tid無し）→false');
ok(c0.opsRekeyNeedsConfirm({tournament_id:'t_2026_07_05',cloud_sent_tid:'t_2026_07_05'},'t_2026_07_05_1234')===true,'C3 送信済み＋別IDへの張り替え→true');
ok(c0.opsRekeyNeedsConfirm({tournament_id:'t_2026_07_05_1234',cloud_sent_tid:'t_2026_07_05_1234'},'t_2026_07_05_1234')===false,'C4 同一ID→false');
ok(c0.opsRekeyNeedsConfirm({tournament_id:'t_2026_07_05_9999',cloud_sent_tid:'t_2026_07_05_1234'},'t_2026_07_05_0000')===false,'C5 送信記録が現IDと不一致（張り替え後）→false');
// apply: 送信済み＋confirmキャンセル→中止・ID維持
var c1=loadEnv(function(){return false;});
c1._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var kC1=c1.issueOpsSharedKey(function(){}); var tidC1=c1._getState().tournament_id;
c1._getState().cloud_sent_tid=tidC1;
var rC=c1.applyOpsSharedKey(kC1==='0000'?'0001':'0000',function(){});
ok(rC&&rC.ok===false&&rC.step==='cancelled','C6 送信済み＋confirmキャンセル→ok:false/step:cancelled');
ok(c1._getState().tournament_id===tidC1,'C7 キャンセル時は tournament_id 維持');
// apply: confirm OK→張り替え実行
var c2=loadEnv(function(){return true;});
c2._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var kC2=c2.issueOpsSharedKey(function(){}); var tidC2=c2._getState().tournament_id;
c2._getState().cloud_sent_tid=tidC2;
var newK=(kC2==='0000')?'0001':'0000';
var rD=c2.applyOpsSharedKey(newK,function(){});
ok(rD&&rD.ok===true&&c2._getState().tournament_id!==tidC2,'C8 confirm OK→張り替え実行');
// issue: 送信済み（suffix無しID）から発行し直し confirmキャンセル→中止
var c3=loadEnv(function(){return false;});
c3._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var kC3=c3.issueOpsSharedKey(function(){});
var baseTid=c3._getState().tournament_id.replace(/_\d{4}$/,'');
c3._setState({tournament_id:baseTid,cloud_sent_tid:baseTid,classes:[],players:{},results:{},report:{}});
var kC3b=c3.issueOpsSharedKey(function(){});
ok(kC3b===''&&c3._getState().tournament_id===baseTid,'C9 送信済みIDからの発行し直し confirmキャンセル→中止・ID維持');
// 未送信なら confirm 無しで従来どおり（confirm=false でも成功する＝ガード非発火）
var c4=loadEnv(function(){return false;});
c4._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var rE=c4.applyOpsSharedKey('4821',function(){});
ok(rE&&rE.ok===true,'C10 未送信端末は confirm 無しで従来どおり適用');

console.log('=== D: Phase C 日付跨ぎ注意（opsKeyDateNote）===');
ok(c0.opsKeyDateNote('t_2026_07_04_4821','2026-07-05')!=='','D1 別日→注意文言');
ok(c0.opsKeyDateNote('t_2026_07_05_4821','2026-07-05')==='','D2 同日→空');
ok(c0.opsKeyDateNote('t_2026_07_05','2026-07-06')==='','D3 キー無しtid→空');
ok(c0.opsKeyDateNote('','2026-07-05')===''&&c0.opsKeyDateNote(null,'2026-07-05')==='','D4 空/null→空');
ok(c0.opsKeyDateNote('t_2026_07_04_4821','2026-07-05').indexOf('7/4')>=0,'D5 文言に発行日（M/D）を含む');

console.log('=== E: Phase C 発行済みキー再表示（refreshOpsKeyDisplay）===');
var e1=loadEnv();
e1._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var kE=e1.issueOpsSharedKey(function(){});
e1._doc.getElementById('opsKeyDisplay').innerHTML='';
e1.refreshOpsKeyDisplay();
ok(e1._doc.getElementById('opsKeyDisplay').innerHTML.indexOf(kE)>=0,'E1 発行済みキーを復元表示');
e1._setState({tournament_id:'t_2026_07_05',classes:[],players:{},results:{},report:{}});
e1.refreshOpsKeyDisplay();
ok(e1._doc.getElementById('opsKeyDisplay').innerHTML==='','E2 キー無しなら表示を消す');
e1._setState({tournament_id:'t_2020_01_01_4821',classes:[],players:{},results:{},report:{}});
e1.refreshOpsKeyDisplay();
var htmlE3=e1._doc.getElementById('opsKeyDisplay').innerHTML;
ok(htmlE3.indexOf('4821')>=0&&htmlE3.indexOf('別の大会になる')>=0,'E3 別日キーは日付跨ぎ注意を併記');

console.log('=== S: Phase C 静的 pin（送信済み記録・toggle 結線）===');
ok(RAW.indexOf('state.cloud_sent_tid=state.tournament_id')>=0,'S1 送信成功時に cloud_sent_tid を記録');
ok(RAW.indexOf("getElementById('ops-share-details')")>=0,'S2 details 取得');
ok(RAW.indexOf('refreshOpsKeyDisplay')>=0&&RAW.indexOf('function refreshOpsKeyDisplay(')>=0,'S3 再表示関数が存在し結線');
ok(RAW.indexOf('function opsRekeyNeedsConfirm(')>=0&&RAW.indexOf('function opsKeyDateNote(')>=0,'S4 Phase C 純関数が存在');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
