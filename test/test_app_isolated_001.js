#!/usr/bin/env node
// APP-ISOLATED-001 [PHASE1-ISOLATE-001]: 隔離ヘルパ test/lib/app_isolated.js のセルフテスト。
//   隔離は「欠陥」ではなく**検出装置**なので、装置そのものが壊れたときに黙って緑にならないことを固定する。
//     B-iso1 既定に state を置かない（置くと「state 依存の獲得」が検出できなくなる）
//     B-iso2 prelude と切り出し対象の衝突は throw
//     B-iso3 不足依存を全束から自動補完しない
//     B-iso4 切り出し器は旧 extractFn と byte 一致（対象関数全件・毎回検査）
//     B-iso5 bare 参照は undefined に握り潰さず実際に throw する
//   データは完全架空のみ。
const fs = require('fs');
const os = require('os');
const path = require('path');
const I = require('./lib/app_isolated');

const TARGET = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(TARGET, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };
function throws(fn, re, m) {
  let e = null;
  try { fn(); } catch (err) { e = err; }
  ok(e !== null && re.test(String(e && e.message)), m + (e ? '' : '（例外が出なかった）'));
  return e;
}

// ---------------------------------------------------------------- 参照実装
// 移行前の 7 本が各自複製していた extractFn（7 実装ともアルゴリズム同一・実測）。
// 共通ヘルパの切り出し結果がこれと byte 一致することを、対象関数**全件**で毎回検査する。
function extractFnLegacy(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) return null;
  let depth = 0, i = src.indexOf('{', idx);
  const start = idx;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

// 移行 7 本が extractFn に渡している関数名の全件（隔離実行・ソース検査の両方を含む）。
const TARGET_FUNCTIONS = [
  // test_class_variable_002
  'isSafeClassId', 'isValidEntryNo', 'reconcileEntryNos', 'nextEntryNoForClass', 'normalizePersonName',
  'normalizeYomi', 'normalizeCity', 'normalizeMasterFeeFields', 'addPlayerFromMaster',
  'listClassIdsForMasterSync', 'changePlayerClass', 'generateMemberId', 'createMemberFromParticipant',
  'isValidYmd', 'todayYmd', 'normalizeBranchMaster', 'mergeDerivedStatsIntoMaster',
  // test_player_swap_001
  'countPlayerDecidedGames', 'applyParticipantSwapFromMaster', 'applyParticipantSwapToUnlinked',
  'handlePlayerSwapPick', 'handlePlayerSwapUnlinked', 'playerSwapSentWarning', 'openPlayerSwapPicker',
  // test_player_swap_002
  'openPlayerEditSheet', 'editPlayer', 'renderPlayerSwapCandidates', 'playerSwapWithdrawnNote',
  // test_bulk_entry_001
  'bindBulkEntryEvents', 'bindRegistrationEvents', 'renderRegList', 'parseBulkEntryText',
  'resolveBulkEntryClassId', 'validateBulkEntryRows', 'bulkAddPlayers', 'formatBulkEntryResultToast',
  'getFee', 'confirmBulkEntry', 'updateBulkEntryPreview', 'openBulkEntryFullscreen', 'collectBulkEntryRows',
  'findMemberCandidates', 'attachMemberIdToPlayer', 'addTournamentIdOnce', 'recalcMemberAttendance',
  'attachMasterSyncCounts', 'readMasterSyncCounts', 'updateBranchMasterFromTournament', 'showToast',
  'renderBulkEntryButton', 'bulkEntryErrorLabel', 'addPlayer', 'finalizeAddPastParticipants',
  // test_guest_tournament_001
  'syncBranchMasterOnSave', 'saveData', 'addSelectedPastParticipants', 'buildMasterSyncModalHtml',
  'sendTournamentToCloud', 'onChangeTournamentKind', 'renderTournamentKindControl', 'renderGuestModeUI',
  'resetAll', 'isGuestTournament', 'formatMasterSyncResultToast',
  // test_cloud_history_scoreboard_765（ソース検査のみ）
  'renderCloudTournamentDetail', 'buildCloudResultBlocksHtml',
];

console.log('=== A 切り出し器（旧 extractFn との byte 一致・対象関数全件）===');
{
  const missing = [];
  const diff = [];
  for (const n of TARGET_FUNCTIONS) {
    const a = I.extractFn(RAW, n);
    const b = extractFnLegacy(RAW, n);
    if (b === null) { missing.push(n); continue; }
    if (a !== b) diff.push(n);
  }
  ok(missing.length === 0, 'A1 対象関数が全件アプリに存在する（欠落: ' + missing.join('・') + '）');
  ok(diff.length === 0, 'A2 切り出し結果が旧 extractFn と byte 一致（' + TARGET_FUNCTIONS.length + '件中 不一致: ' + diff.join('・') + '）');
  ok(TARGET_FUNCTIONS.length >= 60, 'A3 検査対象は移行 7 本の全関数名（実測 ' + TARGET_FUNCTIONS.length + ' 件）');
  ok(I.extractFn(RAW, 'thisFunctionDoesNotExist_zzz') === null, 'A4 存在しない名前は null（旧実装と同じ）');
  const one = I.extractFn(RAW, 'isGuestTournament');
  ok(/^function isGuestTournament\(/.test(one) && /\}$/.test(one), 'A5 切り出しは function 宣言の頭から対応する } まで');

  // TARGET_FUNCTIONS が移行 7 本の実態から遅れないようにする（新しい関数を切り出し始めたのに
  // byte 一致検査の対象へ足し忘れる、を機械的に防ぐ）。固定リストの更新を要求するのではなく、
  // 各ファイル中の「アプリに function として実在する引用符つき識別子」を毎回拾って直接検査する
  // （過検出しても検査対象が増えるだけで害がない）。
  const MIGRATED = ['test_class_variable_002.js', 'test_player_swap_001.js', 'test_player_swap_002.js',
    'test_bulk_entry_001.js', 'test_guest_tournament_001.js', 'test_master_sync_clarity_001.js',
    'test_cloud_history_scoreboard_765.js'];
  const used = new Set();
  for (const f of MIGRATED) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    for (const m of src.match(/'[A-Za-z_$][\w$]*'/g) || []) {
      const n = m.slice(1, -1);
      if (RAW.indexOf('function ' + n + '(') >= 0) used.add(n);
    }
  }
  const dyn = [...used].filter((n) => I.extractFn(RAW, n) !== extractFnLegacy(RAW, n));
  ok(dyn.length === 0, 'A6 移行 7 本が名指しするアプリ関数（実測 ' + used.size + ' 件）も全部 byte 一致（不一致: ' + dyn.join('・') + '）');
  const notListed = [...used].filter((n) => TARGET_FUNCTIONS.indexOf(n) < 0).length;
  ok(used.size >= TARGET_FUNCTIONS.length,
    'A7 動的収集は固定リストを覆っている（動的 ' + used.size + ' / 固定 ' + TARGET_FUNCTIONS.length + ' / 固定外 ' + notListed + '）');
}

console.log('=== B 最小コンテキスト（Node グローバルの遮断・JS 標準は見える）===');
{
  const iso = I.loadIsolated(['normalizeCity']);
  const probe = (expr) => {
    try { return String(require('vm').runInContext(expr, iso.ctx)); } catch (e) { return 'THROW:' + e.constructor.name; }
  };
  ok(probe('typeof Object') === 'function' && probe('typeof JSON') === 'object' && probe('typeof Math') === 'object',
    'B1 JS 言語標準（Object/JSON/Math）は見える');
  ok(probe('typeof Date') === 'function' && probe('typeof Promise') === 'function' && probe('typeof RegExp') === 'function',
    'B2 Date / Promise / RegExp も見える（アプリの純関数が使う）');
  ok(probe('console') === 'THROW:ReferenceError', 'B3 console は遮断（vm が既定で注入するので明示的に削除している）');
  ok(probe('process') === 'THROW:ReferenceError' && probe('require') === 'THROW:ReferenceError',
    'B4 process / require は見えない（Node 側へ抜けられない）');
  ok(probe('crypto') === 'THROW:ReferenceError' && probe('fetch') === 'THROW:ReferenceError',
    'B5 crypto / fetch は遮断（旧 new Function 実装では Node の globalThis が透過していた）');
  ok(probe('document') === 'THROW:ReferenceError' && probe('localStorage') === 'THROW:ReferenceError',
    'B6 ブラウザ API も無い（全束評価 loadApp との役割分担）');
  ok(I.NODE_INJECTED_GLOBALS.indexOf('console') >= 0, 'B7 遮断対象は定数として公開されている（増減がレビューで見える）');
}

console.log('=== B-iso5 bare 参照は実際に throw する（undefined に握り潰さない）===');
{
  // 与えていない名前を掴もうとしたら ReferenceError。これが「state 依存の獲得」の検出装置そのもの。
  const iso = I.loadIsolated(['nextEntryNoForClass', 'reconcileEntryNos', 'isValidEntryNo']);
  const e = throws(() => iso.fn('nextEntryNoForClass')('A', null), /state is not defined/,
    'B-iso5-1 未供与のグローバル参照は ReferenceError（undefined を返さない）');
  // vm の別レルムで生まれるので instanceof は使えない（コンストラクタ名で見る）。
  ok(e && e.constructor && e.constructor.name === 'ReferenceError',
    'B-iso5-2 例外の型は ReferenceError（TypeError へ化けない＝undefined 化されていない）');
  ok(iso.missing.indexOf('state') >= 0, 'B-iso5-3 missing に名前が記録される（throw の付随記録・握り潰しではない）');
  // 供与すれば通る（＝「与えた依存だけが見える」ことの対照）
  const iso2 = I.loadIsolated(['nextEntryNoForClass', 'reconcileEntryNos', 'isValidEntryNo'], { prelude: { state: { players: { A: [] } } } });
  ok(iso2.fn('nextEntryNoForClass')('A', null) === 1 && iso2.missing.length === 0,
    'B-iso5-4 prelude で与えた名前だけが見える（missing は空）');
}

console.log('=== B-iso1 既定では state を置かない ===');
{
  const iso = I.loadIsolated(['normalizeCity']);
  ok(Object.prototype.hasOwnProperty.call(iso.ctx, 'state') === false, 'B-iso1-1 既定コンテキストに state が無い');
  ok(iso.preludeNames.length === 0, 'B-iso1-2 prelude を渡さなければ供与名はゼロ');
  const iso2 = I.loadIsolated(['normalizeCity'], { prelude: { state: null } });
  ok(iso2.preludeNames.join(',') === 'state' && iso2.ctx.state === null,
    'B-iso1-3 per-file prelude で明示的に渡したときだけ state が置かれる');
}

console.log('=== B-iso2 prelude と切り出し対象の衝突は throw ===');
{
  throws(() => I.loadIsolated(['normalizeCity'], { prelude: { normalizeCity: () => 'STUB' } }),
    /prelude の名前が切り出し対象と衝突している/, 'B-iso2-1 同名を prelude に渡すと例外（「与えたつもり」の無効化を防ぐ）');
  const e = throws(() => I.loadIsolated(['normalizeCity', 'normalizeYomi'], { prelude: { normalizeYomi: () => '' } }), /./,
    'B-iso2-2 例外は直し方を示す');
  ok(e && /normalizeYomi/.test(e.message), 'B-iso2-3 例外文言に該当名が出る');
  throws(() => I.loadIsolated(['normalizeCity', 'normalizeCity']), /names に重複/, 'B-iso2-4 names の重複も例外');
  throws(() => I.loadIsolated(['thisFunctionDoesNotExist_zzz']), /切り出し失敗/, 'B-iso2-5 存在しない関数名は例外（黙って空環境にならない）');
  throws(() => I.loadIsolated([]), /1 件以上の配列/, 'B-iso2-6 空の names は例外');
}

console.log('=== B-iso3 不足依存を全束から自動補完しない ===');
{
  // bulkAddPlayers だけを隔離すると、全束にしかない名前（saveData / showToast / document …）は見えない。
  // ここが「見えてしまう」実装になると、対象関数が依存を獲得しても検出できなくなる（＝空洞化）。
  const iso = I.loadIsolated(['bulkAddPlayers']);
  const leaked = ['saveData', 'showToast', 'renderRegList', 'loadBranchMaster', 'escapeHtml']
    .filter((n) => typeof iso.ctx[n] !== 'undefined');
  ok(leaked.length === 0, 'B-iso3-1 切り出していないアプリ関数はコンテキストに存在しない（漏れ: ' + leaked.join('・') + '）');
  ok(iso.names.length === 1 && iso.source.indexOf('function bulkAddPlayers(') === 0,
    'B-iso3-2 評価するのは切り出した束だけ（全束を混ぜない）');
  ok(iso.source.indexOf('function saveData(') < 0, 'B-iso3-3 評価コードに全束のソースが混入していない');
}

console.log('=== C 束は束のまま（相互呼出しを保つ）===');
{
  const NAMES = ['isValidEntryNo', 'reconcileEntryNos', 'nextEntryNoForClass', 'normalizePersonName',
    'normalizeYomi', 'isSafeClassId', 'parseBulkEntryText', 'resolveBulkEntryClassId',
    'validateBulkEntryRows', 'bulkAddPlayers', 'formatBulkEntryResultToast'];
  const iso = I.loadIsolated(NAMES);
  const api = iso.api();
  ok(Object.keys(api).length === NAMES.length, 'C1 api() は切り出した全関数を返す（旧 return {a:a,b:b} 相当）');
  const st = { classes: [{ id: 'A', name: 'Aクラス' }], players: { A: [] } };
  const rows = api.validateBulkEntryRows(api.parseBulkEntryText('架空太郎\tかくうたろう\tA'), 'A', 'member', st);
  const r = api.bulkAddPlayers(rows, st);
  ok(r.added === 1 && st.players.A.length === 1 && st.players.A[0].yomi === 'かくうたろう',
    'C2 束の中の相互呼出し（validate→bulkAdd→normalizeYomi/nextEntryNo）が成立する');
  ok(iso.raw('bulkAddPlayers') === iso.ctx.bulkAddPlayers, 'C3 raw(name) はラップしない実体を返す');
  ok(iso.fn('bulkAddPlayers') !== iso.ctx.bulkAddPlayers, 'C4 fn(name) は missing 記録つきのラッパ');
  throws(() => iso.fn('isSafeClassId_zzz'), /関数ではない\/未定義/, 'C5 未定義名の fn は例外');
}

console.log('=== D prelude で与えた stub が実際に効く ===');
{
  // 「マスタを読んだら落ちる」環境（現行 test_bulk_entry_001 F2 と同じ供与）。
  let read = 0;
  const loadBranchMaster = function () { read++; throw new Error('master-must-not-be-read'); };
  const iso = I.loadIsolated(['bulkAddPlayers', 'isValidEntryNo', 'reconcileEntryNos', 'nextEntryNoForClass',
    'normalizePersonName', 'normalizeYomi'], { prelude: { loadBranchMaster } });
  ok(iso.ctx.loadBranchMaster === loadBranchMaster,
    'D1 prelude の名前は評価後もそのまま見える（アプリ定義に潰されていない＝渡した実体そのもの）');
  const st = { classes: [{ id: 'A', name: 'A' }], players: { A: [] } };
  const r = iso.fn('bulkAddPlayers')([{ error: null, name: '架空太郎', yomi: '', clsId: 'A', member: 'other' }], st);
  ok(r.added === 1 && read === 0, 'D2 与えた stub は呼ばれていない（bulkAddPlayers はマスタを読まない）');
  // ホストで作った fixture を vm 側の関数が読み書きできる（レルムをまたぐ配列判定が壊れていない）
  ok(Array.isArray(st.players.A) && st.players.A[0] && st.players.A[0].name === '架空太郎',
    'D3 ホスト側 fixture への書き込みが見える（Array.isArray はレルムをまたいでも真）');
}

console.log('=== E 対象・キャッシュ・const/let census ===');
{
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-isolated-'));
  const alt = path.join(tmpdir, 'alt.html');
  fs.writeFileSync(alt, '<script>function isSafeClassId(x){ return x === "Z"; }</script>', 'utf8');
  const iso = I.loadIsolated(['isSafeClassId'], { target: alt });
  ok(iso.fn('isSafeClassId')('Z') === true && iso.fn('isSafeClassId')('A') === false,
    'E1 target で対象ファイルを差し替えられる（変異注入は別パスに対して行う）');
  ok(iso.target === alt, 'E2 iso.target に対象が出る');
  try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (e) { /* best-effort */ }

  // スライス2からの申し送り①: トップレベル const/let は vm のレキシカルスコープに入り ctx に出ない。
  //   隔離側は関数を切り出すので直接は影響しないが、供与しようとした名前が const/let 由来だと
  //   「与えたつもりで与わっていない」事故になる。全束の現状 0 件をここでも pin する。
  const H = require('./lib/app_harness');
  const topLexical = H.extractScripts(RAW).split('\n').filter((l) => /^(const|let)\s/.test(l)).length;
  ok(topLexical === 0, 'E3 対象のトップレベル const/let は 0 件（増えたら MIGRATION.md §4-1 に戻る・実測 ' + topLexical + '）');
}

console.log('APP-ISOLATED-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
