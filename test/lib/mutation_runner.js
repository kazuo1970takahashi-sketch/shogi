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
  return { status: r.status, failed, crashed, out };
}

// ラベルは「先頭トークン（U1 / M2 / G4 …）」で比較する。旧新でラベル本文は同一のはずだが、
// 期待値埋め込み型（'… → 期待「x」実際「y」'）は実際値が入るので先頭トークンで正規化する。
function keys(failed) { return failed.map((s) => s.split(/[\s　]/)[0]).sort(); }
function sameSet(a, b) { const ka = keys(a), kb = keys(b); return ka.length === kb.length && ka.every((x, i) => x === kb[i]); }

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

console.log('');
console.log(mismatches === 0 ? '結果: 新旧のズレ 0 件 / 空洞化 0 件' : '結果: ズレ ' + mismatches + ' 件（要調査）');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best-effort */ }
process.exit(mismatches === 0 ? 0 : 1);
