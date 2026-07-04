#!/usr/bin/env node
// PRESET-REMOVE-001 / HISTORY-DELETE-001 (#550・#551 派生): 登録画面の前回クラス自動プリセット廃止と
//   大会履歴タブの一覧レベル削除（行ごと🗑＋全削除）の単体テスト。
//   観点:
//     PRESET-SRC   前回クラス(last_class)による自動割当が3経路（onSuggestTap/サジェストA/B強調/
//                  過去参加者一括追加の既定クラス）から除去されている（ソース検証）。
//     PRESET-KEEP  参考表示（「前回:Xクラス」テキスト・「前A」バッジ）は残っている（情報は消さない）。
//     HIST-DELALL  clearAllArchiveHistory: 確認OKで shogi_archive を空化・当日 state 無接触・件数0では何もしない。
//     HIST-DEL1    deleteArchiveTournamentUI: 対象1件のみ削除・他は残る・確認キャンセルで無変化。
//     HIST-PURE    removeArchiveEntryByTid（純関数）: tid 一致のみ除去・不一致/空は removed=0。
//   完全架空データのみ（架空 …）。runtime（shogi_v4.html）以外は無改変。

const fs=require('fs');
const targetPath=process.argv[2];
if(!targetPath){console.error('Usage: node test_registration_preset_and_history_delete_001.js <html>');process.exit(1);}
const RAW=fs.readFileSync(targetPath,'utf8');

function extractScripts(html){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeNode(tag){return {nodeType:1,tagName:String(tag||'div'),id:'',className:'',value:'',innerHTML:'',disabled:false,checked:false,type:'',style:{},_attrs:{},childNodes:[],
  focus:function(){},blur:function(){},click:function(){},appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},remove:function(){},
  setAttribute:function(k,v){this._attrs[k]=String(v);},getAttribute:function(k){return (k in this._attrs)?this._attrs[k]:null;},
  addEventListener:function(){},removeEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return [];}};}
function makeContext(){
  const elements={};
  const docMock={getElementById:function(id){if(!elements[id]){const n=makeNode('div');n.id=id;elements[id]=n;}return elements[id];},
    createElement:function(t){return makeNode(t);},createTextNode:function(t){return {nodeType:3,textContent:String(t==null?'':t)};},
    body:makeNode('body'),addEventListener:function(){},removeEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return [];}};
  const winMock={innerWidth:1024,addEventListener:function(){},removeEventListener:function(){},open:function(){return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}};}};
  const localStorageMock={_:{},getItem:function(k){return (k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return {document:docMock,window:winMock,localStorage:localStorageMock};
}
function loadEnv(confirmImpl){
  const ctx=makeContext();
  const consoleMock={log:function(){},error:function(){},warn:function(){}};
  const cryptoMock={randomUUID(){return '00000000-0000-4000-8000-000000000000';}};
  const alerts=[];
  const js=extractScripts(RAW);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       clearAllArchiveHistory:(typeof clearAllArchiveHistory==='function')?clearAllArchiveHistory:null,
       deleteArchiveTournamentUI:(typeof deleteArchiveTournamentUI==='function')?deleteArchiveTournamentUI:null,
       removeArchiveEntryByTid:(typeof removeArchiveEntryByTid==='function')?removeArchiveEntryByTid:null,
       findArchiveEntryByTid:(typeof findArchiveEntryByTid==='function')?findArchiveEntryByTid:null,
       loadArchive:(typeof loadArchive==='function')?loadArchive:null,
       ARCHIVE_KEY:(typeof ARCHIVE_KEY!=='undefined')?ARCHIVE_KEY:'shogi_archive',
       _ls:localStorage
     };`);
  const api=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,
    function(m){alerts.push(String(m));},confirmImpl||function(){return true;},function(){return '';},
    function(){},function(){return null;},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock,Promise,function(){});
  api._alerts=alerts; api._ls=ctx.localStorage;
  return api;
}

let pass=0, fail=0;
function ok(m){pass++; if(process.env.VERBOSE)console.log('  ✓ '+m);}
function ng(m){fail++; console.error('  ✗ '+m);}
function assert(c,m){if(c)ok(m);else ng(m);}

const SRC=extractScripts(RAW);

// ============================================================
// PRESET-SRC: 前回クラス自動割当が3経路から除去されている。
// ============================================================
assert(SRC.indexOf("inpClass.value=member.last_class")===-1,'PRESET-SRC-1 onSuggestTap の last_class 自動入力が除去されている');
assert(/var highlight=false;/.test(SRC)&&SRC.indexOf("var highlight=(m.last_class===cls)")===-1,'PRESET-SRC-2 サジェスト A/B ボタンの last_class 強調が除去（highlight=false）');
assert(SRC.indexOf("var cls=(m.last_class==='A'||m.last_class==='B')?m.last_class:'A';")===-1,'PRESET-SRC-3 過去参加者一括追加の last_class 既定割当が除去');
assert((SRC.match(/PRESET-REMOVE-001/g)||[]).length>=3,'PRESET-SRC-4 3経路すべてに PRESET-REMOVE-001 マーカーがある');

// ============================================================
// PRESET-KEEP: 参考表示（テキスト・バッジ）は残す。
// ============================================================
assert(SRC.indexOf("'前回:'+m.last_class+'クラス'")>=0,'PRESET-KEEP-1 サジェスト行の「前回:Xクラス」参考テキストは残る');
assert(SRC.indexOf("前"+"'+escapeHtml(fm.last_class)")>=0||/前'\+escapeHtml\(fm\.last_class\)/.test(SRC),'PRESET-KEEP-2 「前A/前B」参考バッジは残る');

// ============================================================
// HIST-PURE: removeArchiveEntryByTid 純関数（{archive,removed}）。
// ============================================================
{
  var env=loadEnv();
  var arc={schema_version:1,updated_at:'x',tournaments:[
    {identity:{tournament_id:'t1',title:'架空大会1'}},
    {identity:{tournament_id:'t2',title:'架空大会2'}}
  ]};
  var r=env.removeArchiveEntryByTid(arc,'t1');
  assert(r.removed===1&&r.archive.tournaments.length===1&&r.archive.tournaments[0].identity.tournament_id==='t2','HIST-PURE-1 tid 一致1件のみ除去');
  var r2=env.removeArchiveEntryByTid(arc,'nope');
  assert(r2.removed===0&&r2.archive.tournaments.length===2,'HIST-PURE-2 不一致 tid は removed=0・無変化');
  var r3=env.removeArchiveEntryByTid(arc,'');
  assert(r3.removed===0,'HIST-PURE-3 空 tid は removed=0');
}

// ============================================================
// HIST-DELALL: clearAllArchiveHistory 確認OK→空化 / 件数0→何もしない / キャンセル→無変化。
// ============================================================
{
  var env=loadEnv(function(){return true;});
  env._ls.setItem(env.ARCHIVE_KEY,JSON.stringify({schema_version:1,updated_at:'x',tournaments:[
    {identity:{tournament_id:'t1'}},{identity:{tournament_id:'t2'}},{identity:{tournament_id:'t3'}}
  ]}));
  var res=env.clearAllArchiveHistory();
  var after=env.loadArchive();
  assert(res===true&&after.tournaments.length===0,'HIST-DELALL-1 確認OKで全削除（tournaments 空）');
}
{
  var env=loadEnv(function(){return true;});
  // 履歴0件 → alert して false・localStorage は書かない
  var res=env.clearAllArchiveHistory();
  assert(res===false,'HIST-DELALL-2 履歴0件では false（何もしない）');
}
{
  var callN=0;
  var env=loadEnv(function(){callN++;return false;}); // 一段目でキャンセル
  env._ls.setItem(env.ARCHIVE_KEY,JSON.stringify({schema_version:1,updated_at:'x',tournaments:[{identity:{tournament_id:'t1'}},{identity:{tournament_id:'t2'}}]}));
  var res=env.clearAllArchiveHistory();
  var after=env.loadArchive();
  assert(res===false&&after.tournaments.length===2,'HIST-DELALL-3 確認キャンセルで無変化');
  assert(callN===1,'HIST-DELALL-4 二段階確認：一段目 false で二段目に進まない');
}

// ============================================================
// HIST-DEL1: deleteArchiveTournamentUI 対象1件のみ削除・キャンセルで無変化。
// ============================================================
{
  var env=loadEnv(function(){return true;});
  env._ls.setItem(env.ARCHIVE_KEY,JSON.stringify({schema_version:1,updated_at:'x',tournaments:[
    {identity:{tournament_id:'t1',title:'架空大会1'}},{identity:{tournament_id:'t2',title:'架空大会2'}}
  ]}));
  var res=env.deleteArchiveTournamentUI('t1');
  var after=env.loadArchive();
  assert(res===true&&after.tournaments.length===1&&after.tournaments[0].identity.tournament_id==='t2','HIST-DEL1-1 対象1件のみ削除・他は残る');
}
{
  var env=loadEnv(function(){return false;}); // キャンセル
  env._ls.setItem(env.ARCHIVE_KEY,JSON.stringify({schema_version:1,updated_at:'x',tournaments:[{identity:{tournament_id:'t1',title:'架空大会1'}}]}));
  var res=env.deleteArchiveTournamentUI('t1');
  var after=env.loadArchive();
  assert(res===false&&after.tournaments.length===1,'HIST-DEL1-2 確認キャンセルで無変化');
}

console.log('PRESET-REMOVE-001 / HISTORY-DELETE-001(list): pass='+pass+' fail='+fail);
process.exit(fail>0?1:0);
