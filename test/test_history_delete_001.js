#!/usr/bin/env node
// HISTORY-DELETE-001 (#550): 大会履歴の削除導線。
//   ・removeArchiveEntryByTid（純関数）: tid 一致のみ除去・不一致/空は無変化・壊れ archive も安全。
//   ・deleteArchiveTournamentUI: confirm（大会名入り・不可逆/クラウド非影響の明示）→ shogi_archive のみ setItem
//     → renderHistoryList(flash)。当日 state（'shogi_v4'）には書かない。
//   ・詳細ビューに 🗑 削除ボタン（history-delete-btn）が出る・bind される。
//   データは完全架空のみ。
const fs=require('fs');
const targetPath=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(targetPath,'utf8');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

function extractScripts(html){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;const out=[];let m;while((m=re.exec(html))!==null)out.push(m[1]);return out.join('\n');}
function makeContext(){
  var elements={};
  function makeNode(tag){return {nodeType:1,tagName:String(tag||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_attrs:{},childNodes:[],
    appendChild:function(c){this.childNodes.push(c);return c;},
    setAttribute:function(k,v){this._attrs[k]=String(v);},getAttribute:function(k){return (k in this._attrs)?this._attrs[k]:null;},
    addEventListener:function(ev,cb){(this._ls=this._ls||{});(this._ls[ev]=this._ls[ev]||[]).push(cb);},removeEventListener:function(){},
    querySelector:function(){return null;},querySelectorAll:function(){return [];}};}
  var docMock={getElementById:function(id){if(!elements[id]){var n=makeNode('div');n.id=id;elements[id]=n;}return elements[id];},
    createElement:function(tag){return makeNode(tag);},createTextNode:function(t){return {nodeType:3,textContent:String(t==null?'':t)};},
    body:makeNode('body'),addEventListener:function(){},removeEventListener:function(){},
    querySelector:function(){return null;},querySelectorAll:function(){return [];}};
  var winMock={innerWidth:1024,addEventListener:function(){},removeEventListener:function(){},
    open:function(){return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}};}};
  var setLog=[];
  var localStorageMock={_:{},_setLog:setLog,getItem:function(k){return (k in this._)?this._[k]:null;},
    setItem:function(k,v){this._[k]=String(v);setLog.push(k);},removeItem:function(k){delete this._[k];}};
  return {document:docMock,window:winMock,localStorage:localStorageMock,_elements:elements};
}
function loadEnv(){
  const ctx=makeContext();
  const alerts=[];const confirms=[];let confirmAnswer=true;
  const js=extractScripts(RAW);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    js+';return {removeArchiveEntryByTid:removeArchiveEntryByTid,deleteArchiveTournamentUI:deleteArchiveTournamentUI,renderHistoryDetail:renderHistoryDetail,renderHistoryList:renderHistoryList,normalizeArchive:normalizeArchive,ARCHIVE_KEY:ARCHIVE_KEY,__setAppModalTestResolver:__setAppModalTestResolver};');
  const api=fn(ctx.document,ctx.window,ctx.localStorage,{randomUUID:function(){return '00000000-0000-0000-0000-000000000000';}},
    function(m){alerts.push(String(m));},function(m){confirms.push(String(m));return confirmAnswer;},function(){return '';},
    function(){},function(){return null;},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log:function(){},warn:function(){},error:function(){}},Promise,function(cb){});
  api._ctx=ctx;api._alerts=alerts;api._confirms=confirms;api._setConfirm=function(v){confirmAnswer=v;};
  // IN-APP-MODAL-001 Phase 1b: confirm はアプリ内モーダル化済。テストは同期解決シームで追随（メッセージ捕捉＋回答）。
  api.__setAppModalTestResolver(function(type,message){ confirms.push(String(message)); return confirmAnswer; });
  return api;
}
function fixtureArchive(){
  return {schema_version:1,updated_at:'2026-06-01T00:00:00.000Z',tournaments:[
    {identity:{tournament_id:'t-kakuu-1',title:'架空大会 6月',targetMonthLabel:'2026年6月',heldDate:'2026-06-14',classes:[{id:'A'}],participantCount:8},savedAt:'2026-06-14T10:00:00.000Z',snapshot:{players:{A:[]},results:{},rounds:4}},
    {identity:{tournament_id:'t-kakuu-2',title:'架空大会 5月',targetMonthLabel:'2026年5月',heldDate:'2026-05-10',classes:[{id:'A'}],participantCount:6},savedAt:'2026-05-10T10:00:00.000Z',snapshot:{players:{A:[]},results:{},rounds:4}}
  ]};
}

console.log('=== R: removeArchiveEntryByTid（純関数）===');
const e1=loadEnv();
var r1=e1.removeArchiveEntryByTid(fixtureArchive(),'t-kakuu-1');
ok(r1.removed===1&&r1.archive.tournaments.length===1&&r1.archive.tournaments[0].identity.tournament_id==='t-kakuu-2','R1 tid 一致の1件だけ除去');
var r2=e1.removeArchiveEntryByTid(fixtureArchive(),'t-nai');
ok(r2.removed===0&&r2.archive.tournaments.length===2&&r2.archive.updated_at==='2026-06-01T00:00:00.000Z','R2 不一致は無変化（updated_at も不変）');
var r3=e1.removeArchiveEntryByTid(fixtureArchive(),'');
ok(r3.removed===0&&r3.archive.tournaments.length===2,'R3 空 tid は無変化');
var r4=e1.removeArchiveEntryByTid('壊れた文字列','t-kakuu-1');
ok(r4.removed===0&&Array.isArray(r4.archive.tournaments),'R4 壊れ archive も安全（normalize 経由）');
ok(r1.archive.schema_version===1&&r1.archive.updated_at!=='2026-06-01T00:00:00.000Z','R5 除去時は updated_at 更新');

console.log('=== D: deleteArchiveTournamentUI（confirm→setItem→flash）===');
const e2=loadEnv();
e2._ctx.localStorage._[e2.ARCHIVE_KEY]=JSON.stringify(fixtureArchive());
var d1=e2.deleteArchiveTournamentUI('t-kakuu-1');
ok(e2._ctx.localStorage._setLog.indexOf(e2.ARCHIVE_KEY)>=0,'D1 確認OKで削除実行（ARCHIVE_KEY へ setItem）');
ok(e2._confirms.length===1&&e2._confirms[0].indexOf('2026年6月')>=0,'D2 confirm に対象大会の表示名');
ok(e2._confirms[0].indexOf('元に戻せません')>=0&&e2._confirms[0].indexOf('クラウド')>=0,'D3 confirm に不可逆＋クラウド非影響の明示');
var after1=JSON.parse(e2._ctx.localStorage._[e2.ARCHIVE_KEY]);
ok(after1.tournaments.length===1&&after1.tournaments[0].identity.tournament_id==='t-kakuu-2','D4 shogi_archive から1件消えている');
ok(e2._ctx.localStorage._setLog.indexOf('shogi_v4')<0,'D5 当日 state（shogi_v4）には書かない');
ok(String(e2._ctx._elements['history-content'].innerHTML).indexOf('削除しました')>=0,'D6 削除後は一覧＋flash（結果が見える位置）');
const e3=loadEnv();
e3._ctx.localStorage._[e3.ARCHIVE_KEY]=JSON.stringify(fixtureArchive());
e3._setConfirm(false);
var d2=e3.deleteArchiveTournamentUI('t-kakuu-1');
var after2=JSON.parse(e3._ctx.localStorage._[e3.ARCHIVE_KEY]);
ok(after2.tournaments.length===2&&e3._ctx.localStorage._setLog.indexOf(e3.ARCHIVE_KEY)<0,'D7 確認キャンセルで無変化（setItem なし）');
const e4=loadEnv();
e4._ctx.localStorage._[e4.ARCHIVE_KEY]=JSON.stringify(fixtureArchive());
var d3=e4.deleteArchiveTournamentUI('t-nai');
ok(e4._confirms.length===0,'D8 存在しない tid は確認を出さず一覧へ戻る');

console.log('=== V: 詳細ビューの導線（RAW pin）===');
ok(RAW.indexOf('id="history-delete-btn"')>=0&&RAW.indexOf('🗑 この履歴を削除')>=0,'V1 詳細ビューに削除ボタン');
ok(/history-delete-btn'\);\s*\n\s*if\(delBtn\)delBtn\.addEventListener\('click',function\(\)\{deleteArchiveTournamentUI\(tid\);\}\);/.test(RAW),'V2 削除ボタンを deleteArchiveTournamentUI(tid) に bind');
ok(RAW.indexOf('#A32D2D')>=0,'V3 削除ボタンは危険色（赤系・文字も出ている＝色のみ依存でない）');

console.log('');
console.log('HISTORY-DELETE-001: PASS='+pass+' FAIL='+fail);
process.exit(fail?1:0);
