#!/usr/bin/env node
// E2E-INSTALL-GUARD-001 (#918): E2E ジョブのブラウザ導入に上限付き再試行を入れたことの静的＋動作ゲート。
//
// なぜ要るか（実測 2026-08-19 / PR #917 の同一 commit `528dd78`）:
//   同じ commit で E2E ジョブの結果が2回とも違った。ステップ別の内訳を取ると、原因は
//   テストではなく **`npx playwright install --with-deps chromium`** だった。
//
//     job 96122380273 … Install Chromium が **15分05秒** ぶら下がり cancelled（E2E は skipped＝1秒も走っていない）
//     job 96369763890 … Install Chromium **21秒** / E2E スイート 3分54秒 で success
//
//   `cancelled` は「テストが赤」「単に遅い」「外部が詰まった」を区別できない。さらに
//   AUTO-MERGE-GATE-001 は conclusion が SUCCESS 以外を停止条件にする（P1-2）ので、
//   **自動マージが外部要因で黙って止まる**。
//
// このゲートが固定するもの:
//   1. 上限（timeout）と再試行が**実在する**こと。数字は env という一箇所にあり、
//      シェル側の既定値と食い違わないこと。
//   2. **最悪ケースがジョブ上限に収まる**こと（回数×秒数＋予備 ≤ timeout-minutes×60）。
//      片方の数字だけ動かすと赤くなる＝「再試行を増やしたら枠を超えていた」を防ぐ。
//   3. 再試行スクリプトが**実際にそう動く**こと。抽出した run ブロックを、ぶら下がる npx／
//      即失敗する npx／成功する npx に対して実行して確かめる。
//      ★ `timeout` は macOS 既定に無い。無い環境で検査を飛ばすと「守っているつもりで
//        何も検査していない」になる（#914 で `grep -P` を使って実際にそれを踏んだ）。
//        ここでは**必ず自前の shim を PATH に置いて**動かし、どの機械でも同じ経路を通す。
//
// 使い方: node test/test_e2e_install_guard_918.js
// ネットワーク不使用。書き込みは mktemp のディレクトリ内だけ。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WF = path.join(__dirname, '..', '.github', 'workflows', 'e2e.yml');
const EXPECTED_CHECKS = 23;
// 予備＝ブラウザ導入以外に必要な時間。実測（job 96369763890）は checkout 1 + Setup Node 7 +
//   npm ci 1 + E2E スイート 234 = 243 秒。遅いランナーを見込んで倍以上を取る。
const RESERVE_SECONDS = 600;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}
function die(msg) { console.error('  ✗ ' + msg); console.log('  結果: ' + pass + ' PASS / ' + (fail + 1) + ' FAIL'); process.exit(1); }

console.log('\n【E2E-INSTALL-GUARD-001 #918 ブラウザ導入の上限と再試行】');

if (!fs.existsSync(WF)) die('workflow が無い: ' + WF);
const RAW = fs.readFileSync(WF, 'utf8');

// ---------------------------------------------------------------- 抽出（見つからなければ即失敗）
const jobAt = RAW.indexOf('\n  e2e-test:\n');
if (jobAt < 0) die('e2e-test ジョブが見つからない（ジョブ名を変えたならこのゲートも直すこと）');
const JOB = RAW.slice(jobAt);

function one(re, what) {
  const all = JOB.match(new RegExp(re.source, re.flags.replace('g', '') + 'g'));
  if (!all || all.length !== 1) die(what + ' が e2e-test ジョブ内にちょうど1つ見つからない（' + (all ? all.length : 0) + '個）');
  return JOB.match(re);
}
const mJobTimeout = one(/^\s{4}timeout-minutes:\s*(\d+)\s*$/m, 'job の timeout-minutes');
const mEnvLimit   = one(/^\s+PW_INSTALL_TIMEOUT:\s*'(\d+)'\s*$/m, 'env の PW_INSTALL_TIMEOUT');
const mEnvTries   = one(/^\s+PW_INSTALL_TRIES:\s*'(\d+)'\s*$/m, 'env の PW_INSTALL_TRIES');
const mShLimit    = one(/\$\{PW_INSTALL_TIMEOUT:-(\d+)\}/, 'シェル側の PW_INSTALL_TIMEOUT 既定値');
const mShTries    = one(/\$\{PW_INSTALL_TRIES:-(\d+)\}/, 'シェル側の PW_INSTALL_TRIES 既定値');

const jobTimeoutMin = Number(mJobTimeout[1]);
const envLimit = Number(mEnvLimit[1]), envTries = Number(mEnvTries[1]);
const shLimit = Number(mShLimit[1]), shTries = Number(mShTries[1]);

// Install Chromium ステップの run ブロックを取り出す
const stepAt = JOB.indexOf('      - name: Install Chromium\n');
if (stepAt < 0) die('「Install Chromium」ステップが見つからない');
const afterStep = JOB.slice(stepAt);
const runAt = afterStep.indexOf('        run: |\n');
if (runAt < 0) die('Install Chromium ステップが `run: |` のブロックになっていない（1行 run のままでは上限も再試行も置けない）');
const body = afterStep.slice(runAt + '        run: |\n'.length);
const lines = [];
for (const ln of body.split('\n')) {
  if (ln.trim() === '') { lines.push(''); continue; }
  if (!/^ {10}/.test(ln)) break;            // ブロック終わり（次のステップ or 次のキー）
  lines.push(ln.slice(10));
}
const SCRIPT = lines.join('\n').replace(/\s+$/, '') + '\n';
if (!SCRIPT.trim()) die('run ブロックが空');

// ---------------------------------------------------------------- A: 数字の整合
assert(/\btimeout\b\s+"\$_limit"/.test(SCRIPT),
  'A1 ★ブラウザ導入が timeout で括られている（外部作業に上限がある）');
assert(/while\s+\[\s*"\$_i"\s+-le\s+"\$_tries"\s*\]/.test(SCRIPT),
  'A2 ★再試行のループがある（1回きりで諦めない）');
assert(/exit 1/.test(SCRIPT) && /::error::/.test(SCRIPT),
  'A3 ★使い切ったら原因を名指しして落ちる（黙って緑にも、黙って cancelled にもしない）');
assert(/E2E は実行していない/.test(SCRIPT),
  'A4 ★失敗メッセージが「テストの赤ではない」と明示する（読む人が最初に迷うところ）');
assert(/_rc.*-eq 124/.test(SCRIPT.replace(/\n/g, ' ')),
  'A5 打ち切り(124)とそれ以外の失敗を区別してログに出す');

assert(envLimit === shLimit,
  'A6 ★env とシェル既定値の秒数が一致する（片方だけ直して食い違わない）  [env ' + envLimit + ' / sh ' + shLimit + ']');
assert(envTries === shTries,
  'A7 ★env とシェル既定値の回数が一致する  [env ' + envTries + ' / sh ' + shTries + ']');
assert(envTries >= 2, 'A8 再試行は2回以上（1回では「たまたま詰まった」を吸収できない）  [' + envTries + ']');
assert(envLimit >= 60, 'A9 上限は60秒以上（実測21秒に対して十分な余裕）  [' + envLimit + ']');

const worst = envTries * envLimit + RESERVE_SECONDS;
assert(worst <= jobTimeoutMin * 60,
  'A10 ★最悪ケースがジョブ上限に収まる（' + envTries + '回×' + envLimit + '秒＋予備' + RESERVE_SECONDS
  + '秒＝' + worst + '秒 ≤ ' + (jobTimeoutMin * 60) + '秒）  ＝ 回数や秒数だけ増やして枠を超えるのを防ぐ');
assert(jobTimeoutMin * 60 - worst <= 900,
  'A11 逆に上限が過剰でもない（無限ループを 15 分以内に検出できる余地を残す）  [余り ' + (jobTimeoutMin * 60 - worst) + '秒]');

// ---------------------------------------------------------------- B: 実際にそう動くか
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e918-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

// ★ timeout の shim。macOS 既定には timeout が無い。環境依存で検査を飛ばすと
//   「守っているつもりで何も検査していない」になるので、**どの機械でも**これを使う。
const SHIM = path.join(TMP, 'bin');
fs.mkdirSync(SHIM);
fs.writeFileSync(path.join(SHIM, 'timeout'), [
  '#!/usr/bin/env node',
  'const a=process.argv.slice(2); const secs=Number(a[0]);',
  'const cp=require("child_process").spawn(a[1],a.slice(2),{stdio:"inherit"});',
  'const t=setTimeout(()=>{try{cp.kill("SIGKILL")}catch(e){} process.exit(124);},secs*1000);',
  'cp.on("exit",c=>{clearTimeout(t);process.exit(c==null?1:c);});',
  '',
].join('\n'), { mode: 0o755 });

function fakeNpx(bodyLines) {
  fs.writeFileSync(path.join(SHIM, 'npx'), '#!/bin/sh\n' + bodyLines.join('\n') + '\n', { mode: 0o755 });
}
function runScript(env) {
  const sh = path.join(TMP, 'step.sh');
  fs.writeFileSync(sh, SCRIPT);
  const t0 = Date.now();
  const r = spawnSync('bash', [sh], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { PATH: SHIM + path.delimiter + process.env.PATH }, env),
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), ms: Date.now() - t0 };
}

// B-1 ぶら下がる npx → 上限で打ち切り、回数ぶん試して、原因を名指しして落ちる
{
  // ★ `exec` で sh 自身を sleep に置き換える。`sh` の子として sleep を残すと、
  //   timeout が sh を殺しても sleep が継承した stdout を掴んだままになり、
  //   呼び出し側が EOF を待って 60 秒ぶら下がる（実測）。測りたいのはそこではない。
  fakeNpx(['exec sleep 60']);
  const r = runScript({ PW_INSTALL_TIMEOUT: '1', PW_INSTALL_TRIES: '2' });
  const warns = (r.out.match(/::warning::/g) || []).length;
  assert(r.code === 1, 'B1 ★ぶら下がったら失敗で終わる（沈黙のまま枠を食いつぶさない）  [exit ' + r.code + ']');
  assert(r.ms < 15000, 'B2 ★上限どおりに打ち切る（1秒×2回で終わる）  [' + r.ms + 'ms]');
  assert(warns === 2, 'B3 ★指定した回数だけ試す  [warning ' + warns + '回]');
  assert(/::error::/.test(r.out) && /終わらなかった/.test(r.out),
    'B4 ★ログに「時間切れだった」と残る（cancelled の沈黙と違う）');
}

// B-2 成功する npx → 1回で抜ける（余計な往復をしない）
{
  fakeNpx(['exit 0']);
  const r = runScript({ PW_INSTALL_TIMEOUT: '5', PW_INSTALL_TRIES: '2' });
  const warns = (r.out.match(/::warning::/g) || []).length;
  assert(r.code === 0, 'B5 成功したら 0 で抜ける  [exit ' + r.code + ']');
  assert(warns === 0, 'B6 成功時に警告を出さない  [' + warns + ']');
  assert(/完了/.test(r.out), 'B7 成功したことがログに残る');
}

// B-3 即失敗する npx（apt のエラー等）→ 打ち切りではなく終了コードを名指しして再試行
{
  fakeNpx(['exit 100']);
  const r = runScript({ PW_INSTALL_TIMEOUT: '5', PW_INSTALL_TRIES: '2' });
  assert(r.code === 1, 'B8 失敗し続けたら 1 で落ちる  [exit ' + r.code + ']');
  assert(/終了コード 100/.test(r.out),
    'B9 ★時間切れでない失敗は終了コードを名指しする（「240秒で終わらなかった」と嘘をつかない）');
  assert(!/終わらなかった（試行/.test(r.out), 'B9a 時間切れの文言は出さない');
}

// B-4 2回目で成功 → そこで抜ける（再試行が本当に効いている）
{
  const flag = path.join(TMP, 'tried');
  fakeNpx(['if [ -f "' + flag + '" ]; then exit 0; fi', 'touch "' + flag + '"', 'exit 1']);
  const r = runScript({ PW_INSTALL_TIMEOUT: '5', PW_INSTALL_TRIES: '2' });
  const warns = (r.out.match(/::warning::/g) || []).length;
  assert(r.code === 0, 'B10 ★1回目が失敗しても2回目で成功すれば緑（これが再試行を入れた目的）  [exit ' + r.code + ']');
  assert(warns === 1, 'B11 警告は失敗した1回ぶんだけ  [' + warns + ']');
}

const ran = pass + fail;
if (ran !== EXPECTED_CHECKS) {
  fail++;
  console.error('  ✗ assertion の実行本数が想定と違う（想定 ' + EXPECTED_CHECKS + ' / 実際 ' + ran + '）');
}
console.log('  結果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
