#!/usr/bin/env node
// MUTATION-RUNNER [PHASE1-LOADER-001]
//   「読込を共通ヘルパへ寄せても故障検出能力が落ちていない」ことを、アサーション単位で示すための道具。
//   スイートの exit code では、スイート内の空洞化（あるアサーションが常に真になる）が見えないため、
//   落ちたアサーションのラベル集合を旧実装／新実装で突き合わせる。
//
//   使い方（リポジトリ root から）:
//     node test/lib/mutation_runner.js [--base <旧実装の git revision>] [--only <変異ID の前方一致>]
//
//   ※ run_tests.sh の自動発見（test/test_*.js）には一致しないので、スイート集合は変わらない。
//   ※ shogi_v4.html は一切変更しない。変異は tmp のコピーに対してのみ行う。

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TEST_DIR = path.join(ROOT, 'test');
const APP = path.join(ROOT, 'shogi_v4.html');

const argv = process.argv.slice(2);
function opt(name, dflt) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; }
const BASE_REV = opt('--base', '3838f619075d7c1c6c8b0a29fc78359391288b56');
const ONLY = opt('--only', '');

// 移行した 8 本（旧実装は BASE_REV から取り出して同じ変異にかける）
const MIGRATED = [
  'test_backup_guide.js',
  'test_backup_nudge.js',
  'test_dayof_unentered_001.js',
  'test_import_routing.js',
  'test_member_attr_snapshot_city_607.js',
  'test_reset_menu.js',
  'test_start_odd_note.js',
  'test_storage_warn_001.js',
];
const SELF_TEST = 'test_app_harness_001.js';

// ---------------------------------------------------------------- 変異定義
// クラスA: アサーション対象の故障（shogi_v4.html のコピーへ注入）
const CLASS_A = [
  { id: 'A01', test: 'test_backup_guide.js', group: 'G（案内文言）',
    find: '📁 保存先：iPhone', repl: '📁 ほぞん先：iPhone', note: '保存先の見出し文言を変える' },
  { id: 'A02', test: 'test_backup_guide.js', group: 'G（復元手順）',
    find: 'フォルダの指定は不要', repl: 'フォルダの指定が必要', note: '復元手順の文言を反転' },

  { id: 'A03', test: 'test_backup_nudge.js', group: 'M（マークアップ RAW）',
    find: 'id="backup-nudge-do" style="min-height:36px', repl: 'id="backup-nudge-go" style="min-height:36px', note: 'ボタン id を改名' },
  { id: 'A04', test: 'test_backup_nudge.js', group: 'H（節目フック RAW）',
    find: "promptMilestoneBackup('all'", repl: "promptMilestoneBackup('zenbu'", note: '全終了の節目キーを変える' },
  { id: 'A05', test: 'test_backup_nudge.js', group: 'L（開閉ロジック・実行）',
    find: "function hideBackupNudge(){ var el=document.getElementById('backup-nudge'); if(el)el.style.display='none'; }",
    repl: "function hideBackupNudge(){ var el=document.getElementById('backup-nudge'); if(el)el.style.display='flex'; }",
    note: '閉じる処理が閉じなくなる' },

  { id: 'A06', test: 'test_dayof_unentered_001.js', group: 'U（未入力カウンタ・実行）',
    find: '残り <strong>', repl: 'のこり <strong>', note: '未入力カウンタの文言を変える' },
  { id: 'A07', test: 'test_dayof_unentered_001.js', group: 'U（全卓入力済み・実行）',
    find: "✓ 全 '+totalTables+' 卓 入力済みです", repl: "✓ 総 '+totalTables+' 卓 入力済みです", note: '入力済み表示の文言を変える' },
  { id: 'A08', test: 'test_dayof_unentered_001.js', group: 'U（配線 RAW）',
    find: 'unfinishedCount', repl: 'pendingTableCount', all: true, note: '変数名を改名（実行時の挙動は同値・RAW 配線検査だけが落ちる）' },

  { id: 'A09', test: 'test_import_routing.js', group: 'C（内容判別・実行）',
    find: 'if(Array.isArray(parsed.members)&&!parsed.players', repl: 'if(false&&Array.isArray(parsed.members)&&!parsed.players', note: 'master 判定を殺す' },
  { id: 'A10', test: 'test_import_routing.js', group: 'F（ファイル名・実行/RAW）',
    find: 'shogi_meibo_', repl: 'shogi_master_', all: true, note: 'マスタ書き出しの接頭辞を変える' },
  { id: 'A11', test: 'test_import_routing.js', group: 'R（ルーティング RAW）',
    find: 'importTournamentBackupFromText(text)', repl: 'importBackupText(text)', all: true,
    note: 'backup 自動誘導の呼び出し名を変える（loadData / loadFromPaste 両経路）' },

  { id: 'A12', test: 'test_member_attr_snapshot_city_607.js', group: 'S（静的）',
    find: 'city:normalizeCity(member.city)', repl: 'city:normalizeCity(member.shi)', note: 'city 写しの参照元を変える' },
  { id: 'A13', test: 'test_member_attr_snapshot_city_607.js', group: 'E（実行）',
    find: "return value.replace(/^\\s+|\\s+$/g,'').slice(0,20);", repl: "return value.replace(/^\\s+|\\s+$/g,'').slice(0,10);", note: 'normalizeCity の上限を 20→10' },

  { id: 'A14', test: 'test_reset_menu.js', group: 'M（マークアップ RAW）',
    find: 'aria-haspopup="dialog"', repl: 'aria-haspopup="menu"', note: 'a11y 属性を変える' },
  { id: 'A15', test: 'test_reset_menu.js', group: 'L（開閉ロジック・実行）',
    find: "btn.setAttribute('aria-expanded',open?'true':'false');", repl: "btn.setAttribute('aria-controls','header-menu-sheet');", note: 'aria-expanded の更新を落とす' },

  { id: 'A16', test: 'test_start_odd_note.js', group: 'E（偶数・実行）',
    find: 'id="startBtnClass_\'+escapeHtml(cls)+\'" style="width:100%"', repl: 'id="startBtnClass_\'+escapeHtml(cls)+\'"', note: '全幅指定を落とす' },
  { id: 'A17', test: 'test_start_odd_note.js', group: 'O（奇数・実行）',
    find: '">奇数（\'+players.length+\'名）', repl: '">奇数[\'+players.length+\'名]', note: '奇数案内の文言を変える' },
  { id: 'A18', test: 'test_start_odd_note.js', group: 'S（1名・実行）',
    find: 'まだ1名です。', repl: 'いま1名です。', note: '1名案内の文言を変える' },
  { id: 'A19', test: 'test_start_odd_note.js', group: 'D（開始済み・実行）',
    find: "'+escapeHtml(className)+' 開始済み</span>'", repl: "'+escapeHtml(className)+' 開始ずみ</span>'", note: '状態ラベルの文言を変える' },

  { id: 'A20', test: 'test_storage_warn_001.js', group: 'P（probe・実行）',
    find: "var ok=(localStorage.getItem(k)==='1');", repl: 'var ok=true;', note: '読み戻し検査を殺す' },
  { id: 'A21', test: 'test_storage_warn_001.js', group: 'C（バナー・実行）',
    find: "el.style.display=probeStorageWritable()?'none':'block';", repl: "el.style.display=probeStorageWritable()?'none':'flex';", note: 'バナー表示値を変える' },
];

// クラスB: 検出装置（共通ヘルパ）そのものへの攻撃。app_harness.js のコピーへ注入する。
//   旧実装はヘルパを使わないので比較対象が無い＝「新側が必ず落ちること」を確認する。
const CLASS_B = [
  { id: 'B1', kind: 'harness', label: '評価後 stub を無効化（stub() が差し替えない）',
    find: '      const prev = sandbox[name];\n      sandbox[name] = impl;',
    repl: '      const prev = sandbox[name];\n      /* mutated: 差し替えない */',
    expectFailIn: [SELF_TEST] },
  { id: 'B2a', kind: 'harness', label: '抽出漏れ（各 script を先頭200字で打ち切る）',
    find: "    out += m[2] + '\\n';", repl: "    out += m[2].slice(0, 200) + '\\n';",
    expectFailIn: [SELF_TEST].concat(MIGRATED) },
  { id: 'B2b', kind: 'harness', label: '空束（抽出器が何も返さない）',
    find: '  return out;\n}\n\n// 既存テストが使っている素の正規表現', repl: "  return '';\n}\n\n// 既存テストが使っている素の正規表現",
    expectFailIn: [SELF_TEST].concat(MIGRATED) },
  { id: 'B3', kind: 'harness', label: 'clobber ガードを外す（アプリ定義名の評価前 override を素通し）',
    find: '  if (clobbered.length) {', repl: '  if (false && clobbered.length) {',
    expectFailIn: [SELF_TEST] },
];

// ---------------------------------------------------------------- 実行基盤
function applyOnce(src, mut) {
  if (mut.all) {
    const n = src.split(mut.find).length - 1;
    if (n === 0) throw new Error(mut.id + ': find が見つからない');
    return { out: src.split(mut.find).join(mut.repl), hits: n };
  }
  const n = src.split(mut.find).length - 1;
  if (n !== 1) throw new Error(mut.id + ': find の出現回数が ' + n + '（1 でなければ変異が曖昧）');
  return { out: src.replace(mut.find, mut.repl), hits: 1 };
}

function runTest(testPath, targetHtml) {
  const r = cp.spawnSync('node', [testPath, targetHtml], { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*FAIL:\s*(.*)$/);
    if (m) failed.push(m[1].trim());
  }
  const crashed = /Error|Cannot read|is not a function|ReferenceError|TypeError/.test(out) && r.status !== 0 && failed.length === 0;
  // 異常終了はラベルが1つも出ないので、集合比較が「空 vs 空」になって解像度を失う。
  // 例外の種類と名前を疑似ラベルにして、新旧で同じ理由で落ちていることまで突き合わせる。
  if (crashed) {
    const m = out.match(/\b(ReferenceError|TypeError|SyntaxError|RangeError|Error):\s*([^\n]*)/);
    failed.push('CRASH:' + (m ? m[1] + ':' + m[2].trim().replace(/[\s　]+/g, '_').slice(0, 60) : 'unknown'));
  }
  return { status: r.status, failed, crashed, out };
}

// ラベルは「先頭トークン（U1 / M2 / G4 …）」で比較する。旧新でラベル本文は同一のはずだが、
// 期待値埋め込み型（'… → 期待「x」実際「y」'）は実際値が入るので先頭トークンで正規化する。
function keys(failed) { return failed.map((s) => s.split(/[\s　]/)[0]).sort(); }
function sameSet(a, b) { const ka = keys(a), kb = keys(b); return ka.length === kb.length && ka.every((x, i) => x === kb[i]); }
function subsetOf(a, b) { const kb = keys(b); return keys(a).every((x) => kb.indexOf(x) >= 0); }

// ---------------------------------------------------------------- runner 自身の壊れ検出
// 比較器が「常に一致」を返す形に壊れると、変異表は全部 ✓ になり空洞化が見えなくなる。
// 表を1行も出す前に、比較器そのものを既知の入出力で検算して落とす。
(function selfCheck() {
  const bad = [];
  if (keys(['U1 ほげ　ふが']).join(',') !== 'U1') bad.push('keys がラベル先頭トークンを取り出せない');
  if (sameSet(['A1 x'], ['A1 y']) !== true) bad.push('同じ先頭トークンの集合を一致と判定しない');
  if (sameSet(['A1 x'], ['B2 y']) !== false) bad.push('異なる集合を一致と判定した（比較器が常に一致を返す形に壊れている）');
  if (sameSet(['A1 x'], []) !== false) bad.push('空集合と非空集合を一致と判定した');
  if (sameSet([], ['A1 x']) !== false) bad.push('非空集合と空集合を一致と判定した');
  if (sameSet(['A1 x', 'A1 y'], ['A1 x']) !== false) bad.push('件数の違いを見ていない');
  if (subsetOf(['A1 x'], ['A1 y', 'B2 z']) !== true) bad.push('subsetOf が真部分集合を認めない');
  if (subsetOf(['C3 x'], ['A1 y']) !== false) bad.push('subsetOf が常に真を返す');
  if (bad.length) {
    console.error('mutation_runner の比較器が壊れている:\n  - ' + bad.join('\n  - '));
    process.exit(2);
  }
})();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-loader-mut-'));
const oldDir = path.join(tmp, 'old');
fs.mkdirSync(oldDir, { recursive: true });
for (const t of MIGRATED) {
  const src = cp.execSync('git show ' + BASE_REV + ':test/' + t, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(oldDir, t), src);
}
const APP_SRC = fs.readFileSync(APP, 'utf8');

const rows = [];
let mismatches = 0;

console.log('# 変異表（クラスA: アサーション対象の故障）');
console.log('');
console.log('| 変異 | 対象テスト | アサーション群 | 変異内容 | 旧で落ちたアサーション | 新で落ちたアサーション | 一致 |');
console.log('|---|---|---|---|---|---|---|');
for (const mut of CLASS_A) {
  if (ONLY && mut.id.indexOf(ONLY) !== 0) continue;
  const { out, hits } = applyOnce(APP_SRC, mut);
  const mutantPath = path.join(tmp, 'mutant_' + mut.id + '.html');
  fs.writeFileSync(mutantPath, out, 'utf8');
  const oldR = runTest(path.join(oldDir, mut.test), mutantPath);
  const newR = runTest(path.join(TEST_DIR, mut.test), mutantPath);
  const same = sameSet(oldR.failed, newR.failed);
  if (!same) mismatches++;
  const fmt = (r) => (r.crashed ? '(異常終了)' : (r.failed.length ? keys(r.failed).join(' / ') : '（なし）'));
  console.log('| ' + [mut.id, mut.test, mut.group, mut.note + (mut.all ? '（' + hits + '箇所）' : ''), fmt(oldR), fmt(newR), same ? '✓' : '✗'].join(' | ') + ' |');
  rows.push({ mut, oldR, newR, same });
  fs.unlinkSync(mutantPath);
}

console.log('');
console.log('# 変異表（クラスB: 検出装置＝共通ヘルパそのものへの攻撃）');
console.log('');
console.log('| 変異 | 攻撃内容 | 落ちるべきテスト | 実際に落ちたテスト | 判定 |');
console.log('|---|---|---|---|---|');
const HARNESS_SRC = fs.readFileSync(path.join(TEST_DIR, 'lib', 'app_harness.js'), 'utf8');
for (const mut of CLASS_B) {
  if (ONLY && mut.id.indexOf(ONLY) !== 0) continue;
  const { out } = applyOnce(HARNESS_SRC, mut);
  const sandboxDir = path.join(tmp, 'sandbox_' + mut.id);
  fs.mkdirSync(path.join(sandboxDir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(sandboxDir, 'lib', 'app_harness.js'), out, 'utf8');
  for (const t of MIGRATED.concat([SELF_TEST])) {
    fs.copyFileSync(path.join(TEST_DIR, t), path.join(sandboxDir, t));
  }
  const actualFailing = [];
  for (const t of MIGRATED.concat([SELF_TEST])) {
    const r = runTest(path.join(sandboxDir, t), APP);
    if (r.status !== 0) actualFailing.push(t);
  }
  const expected = mut.expectFailIn.slice().sort();
  const actual = actualFailing.slice().sort();
  const okAll = expected.every((t) => actual.indexOf(t) >= 0);
  if (!okAll) mismatches++;
  console.log('| ' + [mut.id, mut.label, expected.length === 1 ? expected[0] : expected.length + '本（セルフテスト＋移行8本）',
    actual.length === 0 ? '（なし＝空洞化）' : (actual.length === 9 ? '9本すべて' : actual.join(', ')),
    okAll ? '✓ 落ちる' : '✗ 空洞化'].join(' | ') + ' |');
}

// ================================================================================
// スライス3（PHASE1-ISOLATE-001）: 隔離モード loadIsolated への移行
// ================================================================================
//   旧実装＝BASE_REV_ISO（スライス2 merge 後の開発本流）の extractFn + new Function。
//   隔離は検出装置なので、判定は「一致」だけでなく**方向**を見る:
//     dir:'same'        新旧のラベル集合が一致すべき（ズレは不合格）
//     dir:'improve'     新側でのみ検出される想定（vm 遮断による検出力向上・不合格にしない）
//     dir:'known-limit' 新旧とも未検出（現行の限界として pin する）
const BASE_REV_ISO = opt('--base-iso', 'd325d389d2892aff902c63d9711c639ea2365409');
const MIGRATED_ISO = [
  'test_class_variable_002.js',
  'test_player_swap_001.js',
  'test_player_swap_002.js',
  'test_bulk_entry_001.js',
  'test_guest_tournament_001.js',
  'test_master_sync_clarity_001.js',
  'test_cloud_history_scoreboard_765.js',
];
const SELF_TEST_ISO = 'test_app_isolated_001.js';

const CLASS_A_ISO = [
  // ---- test_class_variable_002（1本目・ゲート）
  { id: 'CV1', test: 'test_class_variable_002.js', group: 'ADD（受理条件・実行/RAW）',
    find: "if(!isSafeClassId(cls)||!Array.isArray(state.players[cls]))return {success:false,error:'invalid_class'};",
    repl: "if(!isSafeClassId(cls)||!Array.isArray(state.players[cls]))return {success:false,error:'bad_class'};",
    note: 'addPlayerFromMaster の未知クラス error 名を変える' },
  { id: 'CV2', test: 'test_class_variable_002.js', group: 'CHG（last_class 記録・実行）',
    find: '        master.members[mi].last_class=newCls;', repl: '        master.members[mi].last_class=oldCls;',
    note: 'クラス移動時に master へ書く値を旧クラスにする' },
  { id: 'CV3', test: 'test_class_variable_002.js', group: 'LCLS（☁復元マージ・実行）',
    find: 'var dLastClass=isSafeClassId(st.last_class)?st.last_class:null;', repl: 'var dLastClass=null;',
    note: '☁復元マージが last_class を常に落とす（W6 の退行）' },
  { id: 'CV4', test: 'test_class_variable_002.js', group: 'PIN（ソース構造 RAW）',
    find: 'function ppDenseSelectableClasses(){', repl: 'function ppDenseSelectableClasses(cls){',
    note: '素通し関数のシグネチャを変える' },

  // ---- test_player_swap_001
  { id: 'PS1a', test: 'test_player_swap_001.js', group: 'C（対局数カウント・実行）',
    find: '      if(q&&(q.p1===playerId||q.p2===playerId)&&q.winner)n++;', repl: '      if(false)n++;',
    note: '進行中回戦の勝敗を数えなくする' },
  { id: 'PS1b', test: 'test_player_swap_001.js', group: 'P（名簿差し替え・実行）',
    find: "already_registered", repl: 'already_reg', all: true, note: '参加済み拒否の error 名を変える' },
  { id: 'PS1c', test: 'test_player_swap_001.js', group: 'U（未連携差し替え・実行）',
    find: "  if(!nm)return {success:false,error:'invalid_name'};", repl: "  if(!nm)return {success:false,error:'blank_name'};",
    note: '空名拒否の error 名を変える' },
  { id: 'PS1d', test: 'test_player_swap_001.js', group: 'S（UI 導線 RAW）',
    find: 'id="ms-swap-person"', repl: 'id="ms-swap-person2"', all: true, note: '3択目ボタンの id を改名' },

  // ---- test_player_swap_002
  { id: 'PS2a', test: 'test_player_swap_002.js', group: 'A（独立ボタン・関数抽出）',
    find: 'id="pes-swap"', repl: 'id="pes-swap2"', all: true, note: '編集シートの独立ボタン id を改名' },
  { id: 'PS2b', test: 'test_player_swap_002.js', group: 'E/F（棄権注記・実行）',
    find: '差し替え後も棄権中のまま引き継がれます', repl: '差し替え後も棄権のまま引きつがれます',
    note: '棄権引き継ぎ注記の文言を変える' },
  { id: 'PS2c', test: 'test_player_swap_002.js', group: 'D（候補ゼロ文言・関数抽出）',
    find: '検索語を短くしてみてください', repl: '검색어を短くしてみてください', note: '候補ゼロ時の案内文言を変える' },

  // ---- test_bulk_entry_001
  { id: 'BE1', test: 'test_bulk_entry_001.js', group: 'B（貼り付け解析・実行）',
    find: "    var cells=(line.indexOf('\\t')>=0)?line.split('\\t'):line.split(',');",
    repl: "    var cells=line.split('\\t');", note: 'CSV（カンマ区切り）を解釈しなくする' },
  { id: 'BE2', test: 'test_bulk_entry_001.js', group: 'E（一括登録・実行）',
    find: "  var LABELS={'dup-registered':'同名','dup-paste':'同名','empty-name':'空の氏名','unknown-class':'クラス名不明'};",
    repl: "  var LABELS={'dup-registered':'重複','dup-paste':'重複','empty-name':'空の氏名','unknown-class':'クラス名不明'};",
    note: 'トースト内訳の利用者語彙を変える' },
  { id: 'BE3', test: 'test_bulk_entry_001.js', group: 'D（行検証・実行）',
    find: "      clsRaw:(cells[2]||'').replace(/^[\\s　]+|[\\s　]+$/g,'')",
    repl: "      clsRaw:''", note: 'クラス列を常に空にする（既定クラス補完に潰れる）' },
  { id: 'BE4', test: 'test_bulk_entry_001.js', group: 'G（📋名簿反映・シナリオ埋込）',
    find: '  if(typeof crypto===\'undefined\'||!crypto.randomUUID){',
    repl: '  if(false){', note: 'generateMemberId の crypto 不在ガードを殺す' },
  { id: 'BE5', test: 'test_bulk_entry_001.js', group: 'I/A（開始後ガード・関数抽出）',
    find: 'id="bulk-entry-note"', repl: 'id="bulk-entry-notes"', all: true, note: '開始後注記の id を改名' },

  // ---- test_guest_tournament_001
  { id: 'GT1', test: 'test_guest_tournament_001.js', group: 'U（単一述語・実行）',
    find: "  return !!(st&&st.tournament_kind==='guest');", repl: "  return !!(st&&st.tournament_kind);",
    note: 'guest 厳密一致をやめる（不正値でも true）' },
  { id: 'GT2', test: 'test_guest_tournament_001.js', group: 'G（choke point・シナリオ埋込）',
    find: '🎪 ゲスト大会のため名簿には反映しません', repl: '🎪 ゲスト大会のため名簿には反映しません。', all: true,
    note: '📋 中止時の説明文言を変える' },
  { id: 'GT3', test: 'test_guest_tournament_001.js', group: 'W（☁送信ガード・シナリオ埋込）',
    find: "step:'guest-mode'", repl: "step:'guest'", all: true, note: '☁送信ガードの step 値を変える' },
  { id: 'GT4', test: 'test_guest_tournament_001.js', group: 'C（skipMasterUpdate・実行）',
    find: '  if(!(opts&&opts.skipMasterUpdate===true)){', repl: '  if(true){',
    note: 'skipMasterUpdate を無視して常に master を書く（#760 契約の破壊）' },

  // ---- test_master_sync_clarity_001
  { id: 'MS1', test: 'test_master_sync_clarity_001.js', group: 'C（トースト3型・実行）',
    find: "  if(added===0&&marked===0&&yomi===0)return '📋 名簿は反映済みです（変更なし）';",
    repl: "  if(added===0&&marked===0)return '📋 名簿は反映済みです（変更なし）';",
    note: 'ふりがな補完だけのとき「変更なし」と言ってしまう' },
  { id: 'MS2', test: 'test_master_sync_clarity_001.js', group: 'B（counts 非列挙・実行）',
    find: "    Object.defineProperty(master,'_syncCounts',{value:counts,enumerable:false,writable:true,configurable:true});",
    repl: "    master._syncCounts=counts;", note: 'counts を列挙可能にする（保存形に漏れる）' },
  { id: 'MS3', test: 'test_master_sync_clarity_001.js', group: 'D（配線・シナリオ埋込）',
    find: '  if(masterSaved===false)_counts=null;', repl: '  if(false)_counts=null;',
    note: 'マスタ保存失敗時に数字を出してしまう' },

  // ---- test_cloud_history_scoreboard_765（スライス2方式＝loadApp 全束）
  { id: 'CH1', test: 'test_cloud_history_scoreboard_765.js', group: 'U（上り・snapshot 同梱）',
    find: "onConflict:'tournament_id'", repl: "onConflict:'id'", all: true,
    note: 'snapshot upsert の冪等キーを変える' },
  { id: 'CH2', test: 'test_cloud_history_scoreboard_765.js', group: 'D（下り・星取表描画）',
    find: 'sb-table', repl: 'sb-tbl', all: true, note: '星取表のクラス名を変える' },

  // ---- 便全体で必須の4本（ブリーフ §変異検証 クラスA ①〜④）
  { id: 'REQ1', test: 'test_bulk_entry_001.js', group: '①依存の獲得（saveData 注入）', dir: 'same',
    find: 'function bulkAddPlayers(rows,stateObj){', repl: 'function bulkAddPlayers(rows,stateObj){\n  saveData();',
    note: '★bulkAddPlayers が saveData を呼ぶようになる（隔離＝検出装置の本丸）' },
  { id: 'REQ2', test: 'test_player_swap_001.js', group: '②依存の獲得（bare state 参照）', dir: 'same',
    find: 'function normalizeCity(value){', repl: 'function normalizeCity(value){\n  var _acq=state&&state.players;',
    note: '★純ヘルパが global state を掴む（state 非供与の隔離対象）' },
  { id: 'REQ3', test: 'test_bulk_entry_001.js', group: '③typeof ガード形の依存', dir: 'known-limit',
    find: 'function formatBulkEntryResultToast(result){',
    repl: "function formatBulkEntryResultToast(result){\n  if(typeof saveData==='function')saveData();",
    note: 'このコードベースの家風イディオム。typeof ガードなので隔離でも throw しない＝新旧とも未検出（既知の限界）' },
  { id: 'REQ4', test: 'test_player_swap_001.js', group: '④Node グローバル依存', dir: 'improve',
    find: 'function normalizeYomi(yomi){', repl: 'function normalizeYomi(yomi){\n  crypto.randomUUID();',
    note: '純ヘルパが Node/ブラウザの crypto を掴む。旧 new Function は Node の globalThis 透過で素通り・vm は遮断' },
];

// クラスB（検出装置＝loadIsolated そのものへの攻撃）。
//   combo を持つものは「harness 変異 × アプリ変異」の組合せ実行で、
//   出荷形では検出される故障が、変異版では**素通りする（空洞化する）**ことまで示す。
const CLASS_B_ISO = [
  { id: 'B-iso1', label: '既定コンテキストに state を置く',
    find: '  const sandbox = {};\n  vm.createContext(sandbox);',
    repl: '  const sandbox = { state: null };\n  vm.createContext(sandbox);',
    expectFailIn: [SELF_TEST_ISO], combo: { appMut: 'REQ2', test: 'test_player_swap_001.js' } },
  // ※ B-iso1 の find は makeMinimalContext の中身（1 箇所）を指す。
  { id: 'B-iso2', label: 'prelude と切り出し対象の衝突検査を外す',
    find: '  if (collided.length) {', repl: '  if (false && collided.length) {',
    expectFailIn: [SELF_TEST_ISO] },
  { id: 'B-iso3', label: '不足依存を全束（loadApp）から自動補完して再試行する',
    find: '          // ★ここで「補って再試行」しない。全束から引く（B-iso3）のも undefined を置く（B-iso5）のも、\n'
      + '          //   隔離＝検出装置を空洞化させる。missing は記録するだけで、例外はそのまま呼び出し側へ返す。',
    repl: '          const _m = missingNameOf(e);\n'
      + '          if (_m) { const _full = require(\'./app_harness\').loadApp(tgt);\n'
      + '            if (typeof _full.ctx[_m] !== \'undefined\') { sandbox[_m] = _full.ctx[_m]; return isolatedCall.apply(this, args); } }',
    expectFailIn: [SELF_TEST_ISO], combo: { appMut: 'REQ1', test: 'test_bulk_entry_001.js' } },
  { id: 'B-iso4a', label: '切り出し器: 末尾の } を落とす（途中切り）',
    find: '    else if (source[i] === \'}\') { depth--; if (depth === 0) return source.slice(idx, i + 1); }',
    repl: '    else if (source[i] === \'}\') { depth--; if (depth === 0) return source.slice(idx, i); }',
    expectFailIn: [SELF_TEST_ISO] },
  { id: 'B-iso4b', label: '切り出し器: 別関数を掴む（名前の前方一致化）',
    find: "  const idx = source.indexOf('function ' + name + '(');",
    repl: "  const idx = source.indexOf('function ' + name.slice(0, 3));",
    expectFailIn: [SELF_TEST_ISO] },
  // makeMinimalContext を丸ごと「スコープ Proxy＋globalThis fallthrough」版へ差し替える。
  //   ＝与えていない名前は throw せず undefined を返し、missing に記録するだけの実装。
  { id: 'B-iso5', label: 'bare 参照を undefined へ握り潰す（スコープ Proxy＋globalThis fallthrough）',
    find: '  const sandbox = {};\n'
      + '  vm.createContext(sandbox);\n'
      + '  if (blocked.length) {\n'
      + '    sandbox.__isoBlocked = blocked;\n'
      + '    vm.runInContext(\n'
      + '      \'for (var __i = 0; __i < __isoBlocked.length; __i++) { try { delete globalThis[__isoBlocked[__i]]; } catch (e) {} }\'\n'
      + '      + \' delete globalThis.__isoBlocked;\', sandbox, { filename: \'app_isolated#block\' });\n'
      + '  }\n'
      + '  return sandbox;',
    repl: '  const __bag = {};\n'
      + '  const __seen = [];\n'
      + '  const sandbox = new Proxy(__bag, {\n'
      + '    has() { return true; },\n'
      + '    get(t, k) {\n'
      + '      if (k in t) return t[k];\n'
      + '      if (typeof k === \'string\' && k in globalThis) return globalThis[k];\n'
      + '      if (typeof k === \'string\' && __seen.indexOf(k) < 0) __seen.push(k);\n'
      + '      return undefined;\n'
      + '    },\n'
      + '    set(t, k, v) { t[k] = v; return true; },\n'
      + '    deleteProperty(t, k) { delete t[k]; return true; },\n'
      + '  });\n'
      + '  vm.createContext(sandbox);\n'
      + '  return sandbox;',
    expectFailIn: [SELF_TEST_ISO], combo: { appMut: 'REQ2', test: 'test_player_swap_001.js' } },
];

// mutant HTML は「index.html / docs が隣にあるディレクトリ」へ置く。
// test_bulk_entry_001 / test_master_sync_clarity_001 は path.dirname(target) を基準に
// 4 面ドキュメントを読むため、tmp に裸で置くと L*/E* が新旧そろって落ちて比較の解像度が下がる。
function makeAppDir(id, html) {
  const dir = fs.mkdtempSync(path.join(tmp, 'app_' + id.replace(/[^\w-]/g, '_') + '_'));
  const p = path.join(dir, 'shogi_v4.html');
  fs.writeFileSync(p, html, 'utf8');
  for (const rel of ['index.html', 'docs']) {
    try { fs.symlinkSync(path.join(ROOT, rel), path.join(dir, rel)); } catch (e) { /* best-effort */ }
  }
  return p;
}

const oldDirIso = path.join(tmp, 'old_iso');
fs.mkdirSync(oldDirIso, { recursive: true });
for (const t of MIGRATED_ISO) {
  const src = cp.execSync('git show ' + BASE_REV_ISO + ':test/' + t, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(oldDirIso, t), src);
}

const appMutants = Object.create(null);

console.log('');
console.log('# 変異表（スライス3 クラスA: アサーション対象の故障）');
console.log('');
console.log('| 変異 | 対象テスト | アサーション群 | 変異内容 | 旧で落ちたアサーション | 新で落ちたアサーション | 方向 | 判定 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const mut of CLASS_A_ISO) {
  if (ONLY && mut.id.indexOf(ONLY) !== 0) continue;
  const { out, hits } = applyOnce(APP_SRC, mut);
  const mutantPath = makeAppDir(mut.id, out);
  appMutants[mut.id] = mutantPath;
  const oldR = runTest(path.join(oldDirIso, mut.test), mutantPath);
  const newR = runTest(path.join(TEST_DIR, mut.test), mutantPath);
  const dir = mut.dir || 'same';
  let verdict;
  if (dir === 'same') verdict = sameSet(oldR.failed, newR.failed);
  else if (dir === 'improve') verdict = subsetOf(oldR.failed, newR.failed) && newR.failed.length > oldR.failed.length;
  else verdict = oldR.failed.length === 0 && newR.failed.length === 0;
  if (!verdict) mismatches++;
  const fmt = (r) => (r.failed.length ? keys(r.failed).join(' / ') : '（なし）');
  console.log('| ' + [mut.id, mut.test, mut.group, mut.note + (mut.all ? '（' + hits + '箇所）' : ''),
    fmt(oldR), fmt(newR), dir, verdict ? '✓' : '✗'].join(' | ') + ' |');
}

console.log('');
console.log('# 変異表（スライス3 クラスB: 検出装置＝loadIsolated への攻撃）');
console.log('');
console.log('| 変異 | 攻撃内容 | セルフテスト | 組合せ（harness 変異 × アプリ変異） | 判定 |');
console.log('|---|---|---|---|---|');
const ISO_SRC = fs.readFileSync(path.join(TEST_DIR, 'lib', 'app_isolated.js'), 'utf8');
for (const mut of CLASS_B_ISO) {
  if (ONLY && mut.id.indexOf(ONLY) !== 0) continue;
  const { out } = applyOnce(ISO_SRC, mut);
  const sandboxDir = path.join(tmp, 'sandbox_' + mut.id);
  fs.mkdirSync(path.join(sandboxDir, 'lib'), { recursive: true });
  for (const f of fs.readdirSync(path.join(TEST_DIR, 'lib'))) {
    const s = path.join(TEST_DIR, 'lib', f);
    if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(sandboxDir, 'lib', f));
  }
  fs.writeFileSync(path.join(sandboxDir, 'lib', 'app_isolated.js'), out, 'utf8');
  for (const t of MIGRATED_ISO.concat([SELF_TEST_ISO])) {
    fs.copyFileSync(path.join(TEST_DIR, t), path.join(sandboxDir, t));
  }
  // ① セルフテストが落ちること
  const selfR = runTest(path.join(sandboxDir, SELF_TEST_ISO), APP);
  const selfOk = selfR.status !== 0;
  // ② 組合せ: 出荷形では検出される故障が、変異版では素通りする（＝空洞化の実証）
  let comboText = '—';
  let comboOk = true;
  if (mut.combo) {
    const appMut = CLASS_A_ISO.filter((m) => m.id === mut.combo.appMut)[0];
    let mutantPath = appMutants[appMut.id];
    if (!mutantPath) { mutantPath = makeAppDir(appMut.id, applyOnce(APP_SRC, appMut).out); appMutants[appMut.id] = mutantPath; }
    const shipped = runTest(path.join(TEST_DIR, mut.combo.test), mutantPath);
    const hollow = runTest(path.join(sandboxDir, mut.combo.test), mutantPath);
    const detected = shipped.status !== 0;
    const slipped = hollow.status === 0;
    comboOk = detected && slipped;
    comboText = appMut.id + ': 出荷形=' + (detected ? '検出' : '**素通り**')
      + ' / 変異版=' + (slipped ? '**素通り（空洞化）**' : '検出');
  }
  if (!(selfOk && comboOk)) mismatches++;
  console.log('| ' + [mut.id, mut.label, selfOk ? '✓ 落ちる' : '✗ 緑のまま', comboText,
    (selfOk && comboOk) ? '✓' : '✗'].join(' | ') + ' |');
}

console.log('');
console.log(mismatches === 0 ? '結果: 新旧のズレ 0 件 / 空洞化 0 件' : '結果: ズレ ' + mismatches + ' 件（要調査）');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best-effort */ }
process.exit(mismatches === 0 ? 0 : 1);
