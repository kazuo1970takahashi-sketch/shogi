#!/usr/bin/env node
// @suite: E2E-NOT-RUN-001（#865）e2e が「走っているつもりで走っていない」状態に戻らないための番人
//
// 背景（実測）:
//   test/e2e/*.e2e.js は **CI でも test/run_tests.sh の全量でも1回も実行されていなかった**。
//     - run_tests.sh の自動発見は test/ 直下の test_*.js / test_*.sh / *_pgtest.sh のみ
//       （サブディレクトリは対象外・STAGE0-CONFLICT-FREE-001）
//     - .github/workflows/e2e.yml の E2E ジョブが `if: false` で止まっていた
//   その結果 **2スイートが落ちたまま放置**されていた（withdraw_regenerate / shogi_ui）。
//   原因は IN-APP-MODAL-001 (#606) で破壊操作の確認が native confirm から
//   アプリ内モーダルへ変わったのに、e2e が page.on('dialog') のままだったこと。
//   誰も走らせていないので、誰も気づかなかった。
//
//   ★ このテストは e2e の**中身**は見ない（それは実ブラウザの仕事）。
//     「走る配線が外れていないか」だけを、CI で毎回走る側から見張る。
//
// リポジトリのファイルは読むだけ。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WF_PATH = path.join(ROOT, '.github', 'workflows', 'e2e.yml');
const RUNNER_PATH = path.join(ROOT, 'test', 'run_e2e.sh');
const E2E_DIR = path.join(ROOT, 'test', 'e2e');

let pass = 0, fail = 0;
function assert(cond, msg){ if(cond){ pass++; console.log('  ✓ '+msg); } else { fail++; console.log('  ✗ '+msg); } }

const WF = fs.existsSync(WF_PATH) ? fs.readFileSync(WF_PATH, 'utf8') : '';

// e2e-test ジョブのブロックだけを切り出す（次のトップレベル job か EOF まで）
function e2eJobBlock(){
  const i = WF.indexOf('\n  e2e-test:');
  if(i < 0) return '';
  const rest = WF.slice(i + 1);
  const m = rest.slice(1).search(/\n  [a-zA-Z0-9_-]+:\n/);
  return m < 0 ? rest : rest.slice(0, m + 1);
}

console.log('\n[N] CI の E2E ジョブが実際に走る配線になっている');
(function(){
  assert(WF !== '', 'N-0 .github/workflows/e2e.yml を読めた');
  const job = e2eJobBlock();
  assert(job !== '', 'N-1 e2e-test ジョブを切り出せた');
  // ★ `if: false`（またはそれ相当）で止まっていないこと。これが今回の直接原因。
  assert(!/^\s*if:\s*false\s*$/m.test(job),
    'N-2 ★e2e-test ジョブが `if: false` で止まっていない（#865 の直接原因）');
  assert(/bash\s+test\/run_e2e\.sh/.test(job),
    'N-3 ★e2e-test ジョブが test/run_e2e.sh を実行している');
  assert(/playwright install/.test(job), 'N-4 Chromium の導入ステップがある');
  // 存在しない spec を指していないこと（旧実装はこれで止まっていた）
  assert(!/shogi_phase2_import_synthetic\.spec\.js/.test(job),
    'N-5 リポジトリに存在しない spec を参照していない');
  // トリガに開発本流の pull_request が含まれる
  assert(/pull_request:/.test(WF) && /chore\/shogi-tour-apphq-003h-2d-orphan-clean-base/.test(WF),
    'N-6 開発本流宛ての pull_request で起動する設定のまま');
})();

console.log('\n[O] 走らせる仕組みが「0件でも緑」にならない');
(function(){
  assert(fs.existsSync(RUNNER_PATH), 'O-0 test/run_e2e.sh がある');
  if(!fs.existsSync(RUNNER_PATH))return;
  const R = fs.readFileSync(RUNNER_PATH, 'utf8');
  assert(/\*\.e2e\.js/.test(R), 'O-1 run_e2e.sh が *.e2e.js を対象にしている');

  // ★ O-2 は**文字列一致では守れない**。初版は「`exit 2` がファイルのどこかにある」を
  //   見ていたため、0件分岐だけ `exit 0` に変える変異を素通りさせた（実測で判明）。
  //   実際に空のディレクトリに対して走らせて、終了コードで判定する。
  const cp = require('child_process');
  const os = require('os');
  let tmp = null, code = null, out = '';
  try{
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2ewire-'));
    fs.mkdirSync(path.join(tmp, 'e2e'));
    fs.copyFileSync(RUNNER_PATH, path.join(tmp, 'run_e2e.sh'));
    const r = cp.spawnSync('bash', [path.join(tmp, 'run_e2e.sh')], { encoding: 'utf8' });
    code = r.status;
    out = String(r.stdout || '') + String(r.stderr || '');
  }catch(e){ out = 'spawn error: ' + e.message; }
  finally{ if(tmp){ try{ fs.rmSync(tmp, {recursive:true, force:true}); }catch(e){} } }
  assert(code !== 0,
    'O-2 ★対象0件のとき実際に失敗する（緑と「何も検査していない」を区別する）  [実測 exit=' + code + ']');
  assert(/0件/.test(out),
    'O-2b 0件のとき理由が出力される  [実測 ' + out.replace(/\s+/g, ' ').trim().slice(-70) + ']');

  assert(/exit 1/.test(R), 'O-3 1スイートでも失敗したら失敗する（スイート単位の失敗集計）');
})();

console.log('\n[P] 命名規約から外れて静かに走らなくなっているファイルが無い');
(function(){
  assert(fs.existsSync(E2E_DIR), 'P-0 test/e2e/ がある');
  if(!fs.existsSync(E2E_DIR))return;
  const files = fs.readdirSync(E2E_DIR).filter(f => f.slice(-3) === '.js');
  assert(files.length > 0, 'P-1 e2e スイートが1つ以上ある（実測 ' + files.length + ' 件）');
  // ★ .js なのに *.e2e.js でないものは run_e2e.sh の glob から外れる＝静かに走らない
  const bad = files.filter(f => !/\.e2e\.js$/.test(f));
  assert(bad.length === 0,
    'P-2 ★test/e2e/ の .js はすべて *.e2e.js（glob から外れたものが無い）'
    + (bad.length ? '  [実測 外れているもの: ' + JSON.stringify(bad) + ']' : ''));
  // 各スイートが単体で実行可能な形（shebang か直接実行される形）であること
  let noShebang = [];
  for(const f of files){
    const head = fs.readFileSync(path.join(E2E_DIR, f), 'utf8').slice(0, 40);
    if(head.indexOf('#!/usr/bin/env node') !== 0) noShebang.push(f);
  }
  assert(noShebang.length === 0, 'P-3 各スイートが node で直接実行できる形（実測 shebang 無し: ' + JSON.stringify(noShebang) + '）');
})();

console.log('\n  E2E-NOT-RUN-001: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail ? 1 : 0);
