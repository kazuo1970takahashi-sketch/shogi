#!/usr/bin/env node
// SHOGI-TOUR-HISTORY-STEP1: 過去大会履歴（保存 / 一覧 / read-only 閲覧）単体テスト。
//   設計メモ: docs/notes/20260615_shogi_tour_history_mvp_design_001.md
//   観点（タスク test 要件）:
//     E.  buildArchiveEntryFromState: 架空 state → identity 凍結 + snapshot（deep clone）。global state を汚さない。
//     A.  appendOrReplaceByTournamentId: tournament_id 冪等（同 id 上書き / 別 id 追記 / 新しい順）。
//     N.  normalizeArchive / loadArchive: 不在・壊れ値で「履歴 0 件」（後方互換）。findArchiveEntryByTid。
//     V.  read-only 閲覧 = scoreboard レンダラの sourceState 差し替え。live と同結果・#213 ruby 維持・編集 UI なし・
//         描画後に global state が必ず復元される（現行大会を誤編集しない核心ガード）。
//     Q.  persistArchiveEntry: 成功時は 'shogi_archive' のみ書く（当日 'shogi_v4' は不変）。quota 超過時は
//         ロールバックして直前の archive を壊さず、当日 state も無傷（isQuotaExceededError / notifySaveWarning 再利用）。
//   データは完全架空のみ（架空 …）。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       buildScoreboardClassTableHtml:buildScoreboardClassTableHtml,
       withSourceState:withSourceState,
       buildArchiveEntryFromState:buildArchiveEntryFromState,
       appendOrReplaceByTournamentId:appendOrReplaceByTournamentId,
       findArchiveEntryByTid:findArchiveEntryByTid,
       normalizeArchive:normalizeArchive,
       loadArchive:loadArchive,
       sortArchiveTournaments:sortArchiveTournaments,
       persistArchiveEntry:persistArchiveEntry,
       saveCurrentTournamentToArchive:saveCurrentTournamentToArchive,
       renderHistoryList:renderHistoryList,
       renderHistoryDetail:renderHistoryDetail,
       ARCHIVE_KEY:ARCHIVE_KEY,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_history_step1.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// p1=架空太郎/かくうたろう（勝者・ルビあり）, p2=架空次郎/''（ルビなし）。1回戦 p1 勝ち。
function fxState(){
  return {
    players:{A:[
      {id:'p1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくうたろう'},
      {id:'p2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ],B:[]},
    rounds:1, pairings:{A:[],B:[]},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]],B:[]}, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    report:{date:'2026-06-14',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'架空将棋大会',organizer:'',fax:'',officeName:'',accountingNote:''},
    tournament_id:'t_2026_06_14'
  };
}

// ============================================================
// E. buildArchiveEntryFromState: identity 凍結 + snapshot deep clone + global state 不汚染
// ============================================================
{
  const env = loadEnv();
  const sentinel = {__sentinel:true, players:{}, classes:[], report:{}};
  env._setState(sentinel); // 呼び出し前の global state
  const s = fxState();
  const entry = env.buildArchiveEntryFromState(s, '2026-06-15T01:00:00.000Z');

  assert(entry && entry.schema_version===1, 'E1 schema_version=1');
  assert(entry.savedAt==='2026-06-15T01:00:00.000Z', 'E2 savedAt は引数の凍結時刻');
  assert(entry.identity.tournament_id==='t_2026_06_14', 'E3 identity.tournament_id を凍結');
  assert(String(entry.identity.title).indexOf('架空将棋大会')>=0, 'E4 identity.title を凍結（normalizeReportTitle 経由）');
  assert(entry.identity.heldDate==='2026-06-14', 'E5 identity.heldDate を凍結');
  assert(entry.identity.targetMonthLabel==='2026年6月度', 'E6 identity.targetMonthLabel を凍結（YYYY年M月度）');
  assert(entry.identity.participantCount===2, 'E7 identity.participantCount=2（A クラス 2 名）');
  assert(Array.isArray(entry.identity.classes) && entry.identity.classes.length===1 && entry.identity.classes[0].id==='A',
    'E8 identity.classes は participants を持つクラスのみ（A）');
  assert(Array.isArray(entry.identity.champions) && entry.identity.champions.length===1
    && entry.identity.champions[0].classId==='A' && entry.identity.champions[0].name==='架空太郎',
    'E9 identity.champions: A クラス優勝者=架空太郎（calcFinal 流用）');

  // snapshot は deep clone（書き換えても元 state は不変）
  assert(entry.snapshot && entry.snapshot!==s, 'E10 snapshot は元 state とは別オブジェクト');
  entry.snapshot.players.A[0].name='__CHANGED__';
  assert(s.players.A[0].name==='架空太郎', 'E11 snapshot 書き換えが元 state に波及しない（deep clone）');

  // global state を汚さない（呼び出し後 sentinel に戻る）
  assert(env._getState()===sentinel, 'E12 buildArchiveEntryFromState 後に global state が復元される（汚染なし）');

  // tournament_id 不在でも heldDate から安定 id を合成（state は変更しない）
  const s2 = fxState(); delete s2.tournament_id;
  const e2 = env.buildArchiveEntryFromState(s2, '2026-06-15T01:00:00.000Z');
  assert(e2.identity.tournament_id==='t_2026_06_14', 'E13 tournament_id 不在は heldDate から合成（t_2026_06_14）');
  assert(!('tournament_id' in s2), 'E14 合成時に元 state へ tournament_id を書き戻さない');
}

// ============================================================
// A. appendOrReplaceByTournamentId: 冪等（同 id 上書き / 別 id 追記 / 新しい順）
// ============================================================
{
  const env = loadEnv();
  const eA = env.buildArchiveEntryFromState(fxState(), '2026-06-15T01:00:00.000Z'); // t_2026_06_14
  let arc = env.appendOrReplaceByTournamentId(null, eA);
  assert(arc.tournaments.length===1, 'A1 空 archive へ追記 → 1 件');

  // 同 tournament_id で再保存 → 上書き（件数不変）
  const eA2 = env.buildArchiveEntryFromState(fxState(), '2026-06-16T02:00:00.000Z'); // 同 id・savedAt 違い
  arc = env.appendOrReplaceByTournamentId(arc, eA2);
  assert(arc.tournaments.length===1, 'A2 同 tournament_id 再保存 → 上書き（件数不変）');
  assert(arc.tournaments[0].savedAt==='2026-06-16T02:00:00.000Z', 'A3 上書きで最新内容に置き換わる');

  // 別 tournament_id → 追記（先頭=新しい順）
  const sB = fxState(); sB.tournament_id='t_2026_07_05'; sB.report.date='2026-07-05';
  const eB = env.buildArchiveEntryFromState(sB, '2026-07-06T02:00:00.000Z');
  arc = env.appendOrReplaceByTournamentId(arc, eB);
  assert(arc.tournaments.length===2, 'A4 別 tournament_id → 追記（2 件）');
  assert(arc.tournaments[0].identity.tournament_id==='t_2026_07_05', 'A5 追記は先頭（新しい順 unshift）');
}

// ============================================================
// N. normalizeArchive / loadArchive / findArchiveEntryByTid（後方互換）
// ============================================================
{
  const env = loadEnv();
  assert(env.normalizeArchive(null).tournaments.length===0, 'N1 null → 履歴 0 件');
  assert(env.normalizeArchive('not-json').tournaments.length===0, 'N2 壊れた文字列 → 0 件');
  assert(env.normalizeArchive({}).tournaments.length===0, 'N3 tournaments 不在 object → 0 件');
  assert(env.normalizeArchive('{"schema_version":1,"tournaments":[{"identity":{"tournament_id":"x"}}]}').tournaments.length===1,
    'N4 妥当な JSON 文字列 → parse して件数反映');
  // loadArchive: shogi_archive 不在 → 0 件
  assert(env.loadArchive().tournaments.length===0, 'N5 shogi_archive 不在 → 0 件（後方互換）');
  // findArchiveEntryByTid
  const arc={tournaments:[{identity:{tournament_id:'t_a'}},{identity:{tournament_id:'t_b'}}]};
  assert(env.findArchiveEntryByTid(arc,'t_b').identity.tournament_id==='t_b', 'N6 findArchiveEntryByTid 一致');
  assert(env.findArchiveEntryByTid(arc,'nope')===null, 'N7 未一致 → null');
}

// ============================================================
// V. read-only 閲覧 = scoreboard レンダラ sourceState 差し替え（live 同結果 / #213 ruby 維持 / state 復元）
// ============================================================
{
  const env = loadEnv();
  // live: global state を fx にして描画
  env._setState(fxState());
  const liveHtml = env.buildScoreboardClassTableHtml('A');

  // snapshot 入力: global state を別物にして、fx を sourceState で渡す
  const other = {players:{A:[],B:[]},rounds:0,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,classes:[],report:{}};
  env._setState(other);
  const snapHtml = env.buildScoreboardClassTableHtml('A', fxState());

  assert(snapHtml===liveHtml, 'V1 sourceState 差し替え描画 = live 描画（同一 HTML）');
  assert(snapHtml.indexOf('<ruby>架空太郎<rt>かくうたろう</rt></ruby>')>=0, 'V2 snapshot 由来でも #213 ふりがな ruby が維持される');
  assert(snapHtml.indexOf('架空次郎')>=0 && snapHtml.indexOf('<rt>架空次郎')<0, 'V3 yomi 空は氏名のみ（空 <rt> なし）');
  assert(snapHtml.indexOf('○')>=0, 'V4 星取（○）が維持される（退行なし）');
  assert(snapHtml.indexOf('sb-col-rank')>=0, 'V5 順位列が維持される（退行なし）');

  // 描画後に global state が必ず復元される（現行大会を誤って差し替えたままにしない＝誤編集防止の核心）
  assert(env._getState()===other, 'V6 sourceState 描画後に global state が復元される（現行大会へ波及しない）');

  // 引数なし＝live 経路は従来どおり（後方互換）
  env._setState(fxState());
  assert(env.buildScoreboardClassTableHtml('A').indexOf('<ruby>架空太郎')>=0, 'V7 引数なし live 経路は従来どおり ruby 表示');

  // read-only: 閲覧で描かれる表に編集系コントロールが無い（誤編集経路を持たない）
  assert(snapHtml.indexOf('<input')<0 && snapHtml.indexOf('<select')<0 && snapHtml.indexOf('<textarea')<0,
    'V8 閲覧テーブルに入力系コントロール（input/select/textarea）が無い（read-only）');

  // XSS: snapshot 内の氏名も escape される
  const sx = fxState(); sx.players.A[0].name='<b>x</b>'; sx.players.A[0].yomi='';
  const hx = env.buildScoreboardClassTableHtml('A', sx);
  assert(hx.indexOf('<b>x</b>')<0 && hx.indexOf('&lt;b&gt;')>=0, 'V9 snapshot 氏名の HTML も escape（XSS 安全）');
}

// ============================================================
// Q. persistArchiveEntry: 成功時 'shogi_archive' のみ書く / quota 超過でロールバック・当日 state 無傷
// ============================================================
{
  // Q-success
  const env = loadEnv();
  const entry = env.buildArchiveEntryFromState(fxState(), '2026-06-15T01:00:00.000Z');
  const res = env.persistArchiveEntry(entry);
  assert(res.ok===true, 'Q1 保存成功');
  assert(typeof env._ctx.localStorage._['shogi_archive']==='string', 'Q2 shogi_archive キーに書き込まれる');
  assert(!('shogi_v4' in env._ctx.localStorage._), 'Q3 当日 state キー shogi_v4 には書き込まない（当日データ無傷）');
  assert(env.loadArchive().tournaments.length===1, 'Q4 再読込で 1 件取得できる');
}
{
  // Q-quota: 直前の archive を pre-seed → setItem を quota で失敗させる → ロールバックで直前を保持
  const env = loadEnv();
  const prior = {schema_version:1,updated_at:'2026-06-10T00:00:00.000Z',tournaments:[{schema_version:1,savedAt:'2026-06-10T00:00:00.000Z',identity:{tournament_id:'t_2026_06_10',title:'架空既存大会',heldDate:'2026-06-10',targetMonthLabel:'2026年6月度',classes:[{id:'A',name:'Aクラス'}],participantCount:1,champions:[]},snapshot:{}}]};
  const priorRaw = JSON.stringify(prior);
  env._ctx.localStorage._['shogi_archive'] = priorRaw; // setItem を介さず pre-seed
  // setItem を quota で失敗させる
  env._ctx.localStorage.setItem = function(){ var e=new Error('quota'); e.name='QuotaExceededError'; e.code=22; throw e; };

  const entry = env.buildArchiveEntryFromState(fxState(), '2026-06-15T01:00:00.000Z');
  const res = env.persistArchiveEntry(entry);
  assert(res.ok===false && res.quota===true, 'Q5 quota 超過を検知（isQuotaExceededError 再利用）');
  assert(env._ctx.localStorage._['shogi_archive']===priorRaw, 'Q6 ロールバック：直前の shogi_archive を壊さない');
  assert(!('shogi_v4' in env._ctx.localStorage._), 'Q7 quota 失敗でも当日 state キー shogi_v4 は不変（当日データ無傷）');
}
{
  // Q-quota（pre-seed 無し）: rollback は removeItem 経由 → 何も残らない・当日 state 無傷
  const env = loadEnv();
  env._ctx.localStorage.setItem = function(){ var e=new Error('quota'); e.name='QuotaExceededError'; throw e; };
  const entry = env.buildArchiveEntryFromState(fxState(), '2026-06-15T01:00:00.000Z');
  const res = env.persistArchiveEntry(entry);
  assert(res.ok===false && res.quota===true, 'Q8 pre-seed 無し quota も検知');
  assert(!('shogi_v4' in env._ctx.localStorage._), 'Q9 当日 state キー shogi_v4 は不変');
}

// ============================================================
// 存在確認（UI 配線：保存アクション / 一覧 / 閲覧）
// ============================================================
{
  const env = loadEnv();
  assert(typeof env.saveCurrentTournamentToArchive==='function', 'U1 saveCurrentTournamentToArchive 定義');
  assert(typeof env.renderHistoryList==='function', 'U2 renderHistoryList 定義');
  assert(typeof env.renderHistoryDetail==='function', 'U3 renderHistoryDetail 定義');
  assert(env.ARCHIVE_KEY==='shogi_archive', 'U4 追記専用キーは shogi_archive（既存 shogi_v4 と別）');
  // renderHistoryList が例外なく走り innerHTML を書く（mock DOM）
  env._setState(fxState());
  let threw=false; try{ env.renderHistoryList(); }catch(e){ threw=true; }
  assert(!threw, 'U5 renderHistoryList が mock DOM で例外なく実行される');
}

console.log('');
console.log('  SHOGI-TOUR-HISTORY-STEP1 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
