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
    `${js};return { issueOpsSharedKey:issueOpsSharedKey, applyOpsSharedKey:applyOpsSharedKey, opsKeyToTournamentId:opsKeyToTournamentId, tournamentIdToOpsKey:tournamentIdToOpsKey, opsRekeyNeedsConfirm:opsRekeyNeedsConfirm, opsKeyDateNote:opsKeyDateNote, opsKeylessTournamentId:opsKeylessTournamentId, joinOpsKeylessTournament:joinOpsKeylessTournament, refreshOpsKeyDisplay:refreshOpsKeyDisplay, normalizeState:normalizeState, __setAppModalTestResolver:(typeof __setAppModalTestResolver==='function'?__setAppModalTestResolver:null), _setState:function(s){ state=s; }, _getState:function(){ return state; } };`);
  const api=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},confirmImpl||function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{});
  api._doc=ctx.document;
  // IN-APP-MODAL-001 (#606): 張り替え確認は native confirm→appConfirm へ移行。テストは __setAppModalTestResolver で
  //   同期解決に切替え、従来の confirmImpl（confirm 戻り値注入）へ配線＝confirm 分岐の C/J 系 assert を挙動同値で維持。
  if(typeof api.__setAppModalTestResolver==='function'){ api.__setAppModalTestResolver(function(type,message){ return (confirmImpl?confirmImpl(message):true); }); }
  return api;
}
// IN-APP-MODAL-001 (#606): 張り替え確認 OK/キャンセルの結果は onDone(result) で返る（confirm 分岐は非同期）。
//   テストは resolver で同期解決されるため、confirm 分岐のケースは onDone を同期捕捉して従来の「戻り値」assert を維持する。
//   （非 confirm 経路は従来どおり戻り値が同期で返るため変更不要。）
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
var rC; c1.applyOpsSharedKey(kC1==='0000'?'0001':'0000',function(){},function(_r){rC=_r;}); // confirm 分岐→onDone 同期捕捉
ok(rC&&rC.ok===false&&rC.step==='cancelled','C6 送信済み＋confirmキャンセル→ok:false/step:cancelled');
ok(c1._getState().tournament_id===tidC1,'C7 キャンセル時は tournament_id 維持');
// apply: confirm OK→張り替え実行
var c2=loadEnv(function(){return true;});
c2._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var kC2=c2.issueOpsSharedKey(function(){}); var tidC2=c2._getState().tournament_id;
c2._getState().cloud_sent_tid=tidC2;
var newK=(kC2==='0000')?'0001':'0000';
var rD; c2.applyOpsSharedKey(newK,function(){},function(_r){rD=_r;}); // confirm 分岐→onDone 同期捕捉
ok(rD&&rD.ok===true&&c2._getState().tournament_id!==tidC2,'C8 confirm OK→張り替え実行');
// issue: 送信済み（suffix無しID）から発行し直し confirmキャンセル→中止
var c3=loadEnv(function(){return false;});
c3._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var kC3=c3.issueOpsSharedKey(function(){});
var baseTid=c3._getState().tournament_id.replace(/_\d{4}$/,'');
c3._setState({tournament_id:baseTid,cloud_sent_tid:baseTid,classes:[],players:{},results:{},report:{}});
var kC3b; c3.issueOpsSharedKey(function(){},function(_r){kC3b=_r;}); // confirm 分岐→onDone 同期捕捉
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

console.log('=== N: Phase C 追補（normalizeState 往復保持・L3 Should-Fix P2）===');
var envN=loadEnv();
var nS=envN.normalizeState({tournament_id:'t_2026_07_05_4821',cloud_sent_tid:'t_2026_07_05_4821'});
ok(nS.cloud_sent_tid==='t_2026_07_05_4821','N1 normalizeState が cloud_sent_tid を保持（reload 後も張り替えガード有効）');
ok(!('cloud_sent_tid' in envN.normalizeState({tournament_id:'t_2026_07_05'})),'N2 無ければ補完しない（default 補完パターン）');
ok(!('cloud_sent_tid' in envN.normalizeState({cloud_sent_tid:''})),'N3 空文字は引き継がない');
ok(!('cloud_sent_tid' in envN.normalizeState({cloud_sent_tid:1234})),'N4 文字列以外は引き継がない');

// ===== OPS-SHARED-KEY-REDESIGN-001 Phase D (#588): キーなし合流（設計 §8-2） =====
console.log('=== K: Phase D 純関数 opsKeylessTournamentId ===');
var k0=loadEnv();
ok(k0.opsKeylessTournamentId('2026-07-05')==='t_2026_07_05','K1 YYYY-MM-DD→t_YYYY_MM_DD（キーなし・ensureTournamentId 基本形と同形）');
ok(k0.opsKeylessTournamentId('2026-02-31')===''&&k0.opsKeylessTournamentId('2026-13-01')==='','K2 暦上実在しない日付→空');
ok(k0.opsKeylessTournamentId('')===''&&k0.opsKeylessTournamentId(null)===''&&k0.opsKeylessTournamentId('20260705')==='','K3 形式不正/空→空');

console.log('=== J: Phase D joinOpsKeylessTournament（合流オーケストレーション）===');
var j1=loadEnv();
j1._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
var rJ1=j1.joinOpsKeylessTournament(function(){});
ok(rJ1&&rJ1.ok===true&&/^t_\d{4}_\d{2}_\d{2}$/.test(j1._getState().tournament_id),'J1 未確定端末の合流→t_<当日>（キーなし）をセット');
ok(j1.tournamentIdToOpsKey(j1._getState().tournament_id)==='','J2 合流IDは運営共通キーを持たない（末尾4桁なし）');
var rJ1b=j1.joinOpsKeylessTournament(function(){});
ok(rJ1b&&rJ1b.ok===true&&rJ1b.tournament_id===j1._getState().tournament_id,'J3 再押下は同一ID維持（冪等）');
// 発行済み（未送信）端末の合流は confirm 無しで張り替え（ガード非発火）
var j2=loadEnv(function(){return false;});
j2._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
j2.issueOpsSharedKey(function(){});
var rJ2=j2.joinOpsKeylessTournament(function(){});
ok(rJ2&&rJ2.ok===true&&/^t_\d{4}_\d{2}_\d{2}$/.test(j2._getState().tournament_id),'J4 発行済み・未送信端末は confirm 無しでキーなしIDへ');
// キー付きIDで送信済み端末の合流→confirm キャンセルで中止・ID維持
var j3=loadEnv(function(){return false;});
j3._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
j3.issueOpsSharedKey(function(){});
var tidJ3=j3._getState().tournament_id; j3._getState().cloud_sent_tid=tidJ3;
var rJ3; j3.joinOpsKeylessTournament(function(){},function(_r){rJ3=_r;}); // confirm 分岐→onDone 同期捕捉
ok(rJ3&&rJ3.ok===false&&rJ3.step==='cancelled'&&j3._getState().tournament_id===tidJ3,'J5 送信済み端末の合流 confirmキャンセル→中止・ID維持');
// confirm OK→合流実行
var j4=loadEnv(function(){return true;});
j4._setState({tournament_id:'',classes:[],players:{},results:{},report:{}});
j4.issueOpsSharedKey(function(){});
j4._getState().cloud_sent_tid=j4._getState().tournament_id;
var rJ4; j4.joinOpsKeylessTournament(function(){},function(_r){rJ4=_r;}); // confirm 分岐→onDone 同期捕捉
ok(rJ4&&rJ4.ok===true&&/^t_\d{4}_\d{2}_\d{2}$/.test(j4._getState().tournament_id),'J6 送信済み端末の合流 confirm OK→キーなしIDへ張り替え');

console.log('=== L: Phase D 1台目側の合流案内表示（refreshOpsKeyDisplay 拡張）===');
var l1=loadEnv();
// P2-1 追補後は「当日の基本形」のみ案内対象＝テストは実行日から動的に組む（日付固定だと当日以外で FAIL する）
var dL=new Date();var todayYmdL=dL.getFullYear()+'-'+('0'+(dL.getMonth()+1)).slice(-2)+'-'+('0'+dL.getDate()).slice(-2);
var todayKeylessL=l1.opsKeylessTournamentId(todayYmdL);
l1._setState({tournament_id:todayKeylessL,cloud_sent_tid:todayKeylessL,classes:[],players:{},results:{},report:{}});
l1.refreshOpsKeyDisplay();
ok(l1._doc.getElementById('opsKeyDisplay').innerHTML.indexOf('今日の大会に合流')>=0,'L1 当日キーなしID送信済み→合流案内を表示');
l1._setState({tournament_id:todayKeylessL,classes:[],players:{},results:{},report:{}});
l1.refreshOpsKeyDisplay();
ok(l1._doc.getElementById('opsKeyDisplay').innerHTML==='','L2 キーなし・未送信は従来どおり表示なし（E2 と同じ既定）');
l1._setState({tournament_id:'t_2026_07_05_4821',cloud_sent_tid:'t_2026_07_05',classes:[],players:{},results:{},report:{}});
l1.refreshOpsKeyDisplay();
ok(l1._doc.getElementById('opsKeyDisplay').innerHTML.indexOf('4821')>=0,'L3 キー付きIDは従来どおりキー表示（案内と排他）');
// L3 P2-1 追補: suffix 付きキーなしID（衝突 _n）や別日のIDで送信済みでも合流案内を出さない（黙って別大会に割れる誤誘導の防止）
l1._setState({tournament_id:'t_2026_07_05_2',cloud_sent_tid:'t_2026_07_05_2',classes:[],players:{},results:{},report:{}});
l1.refreshOpsKeyDisplay();
ok(l1._doc.getElementById('opsKeyDisplay').innerHTML==='','L4 suffix付きキーなしIDで送信済み→合流案内を出さない（P2-1）');
var l2=loadEnv();
var ymdL=new Date();var ymdStr=ymdL.getFullYear()+'-'+('0'+(ymdL.getMonth()+1)).slice(-2)+'-'+('0'+ymdL.getDate()).slice(-2);
var todayTidL=l2.opsKeylessTournamentId(ymdStr);
l2._setState({tournament_id:todayTidL,cloud_sent_tid:todayTidL,classes:[],players:{},results:{},report:{}});
l2.refreshOpsKeyDisplay();
ok(l2._doc.getElementById('opsKeyDisplay').innerHTML.indexOf('今日の大会に合流')>=0,'L5 当日基本形で送信済み→案内は引き続き表示（P2-1 追補後も L1 相当が成立）');
l2._setState({tournament_id:'t_2020_01_01',cloud_sent_tid:'t_2020_01_01',classes:[],players:{},results:{},report:{}});
l2.refreshOpsKeyDisplay();
ok(l2._doc.getElementById('opsKeyDisplay').innerHTML==='','L6 別日のキーなしIDで送信済み→合流案内を出さない（P3-1 同時解消）');

console.log('=== P: Phase D 静的 pin（ボタン・結線・ヘルプ）===');
ok(RAW.indexOf('id="opsKeylessJoinBtn"')>=0,'P1 合流ボタンが存在');
ok(RAW.indexOf('今日の大会に合流')>=0,'P2 ボタンラベル');
ok(RAW.indexOf("getElementById('opsKeylessJoinBtn')")>=0&&RAW.indexOf('joinOpsKeylessTournament(')>=0,'P3 結線');
ok(RAW.indexOf('function opsKeylessTournamentId(')>=0&&RAW.indexOf('function joinOpsKeylessTournament(')>=0,'P4 Phase D 関数が存在');
ok(RAW.indexOf('【あとから2台目を足すとき】')>=0,'P5 ヘルプにキーなし合流手順');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
