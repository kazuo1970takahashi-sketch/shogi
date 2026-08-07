#!/usr/bin/env node
// =============================================================================
// #816 E 受け入れ基準2: 001t 型の欠陥を注入した tree で
//   `test/test_reach_str_lt_sweep_001.js` が exit 1 になることの一回実証
//
//   欠陥（= #818 = 9d64a7e で直したもの）: JS 文字列リテラルの終端判定を
//   LF / CR の 2 種から `isLineTerminator`（LF / CR / LS / PS の 4 種）へ広げる 1 行。
//   ES2019 以降、生の U+2028 / U+2029 は文字列リテラルの中に置けるので、これは
//   「合法な入力で走査が崩れる」退行になる。
//
//   使い方:  node test/tools/reach_str_lt_inject_001t.js [target]
//     target … 既定 shogi_v4.html（この tree の実ファイル）
//   終了コード: ①注入前の複製 tree（対照）で新テストが exit 0、かつ
//               ②欠陥入り tree で **exit 1・HIT-0 の FAIL・ヒット>0**（＝注入欠陥の
//               シグネチャで赤くなった）なら 0。それ以外（対照が赤い／検出できない／
//               exit 1 だがシグネチャ不一致／注入失敗）は 1。
//
//   ── なぜ CI（自動発見）に載せないか ────────────────────────────────────
//   このスクリプトは lib の生テキストへの anchor（下の DEFECT の置換前後の文字列）を
//   持つ。毎回 CI で回すと、lib の正当な整形のたびに anchor が外れて赤くなる anchor を
//   常設で抱え込むことになる。**一回実証（RESULT にログを貼る）用**として意図的に
//   `test/tools/` に置く（#816 E の G4「CI 外に置く検査は、外に置く理由を持つ」）。
//   欠陥入りの lib はチェックインしない — 実行時に一時 tree を作ってそこだけ壊す。
// =============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const target = process.argv[2] || 'shogi_v4.html';
const srcTarget = path.isAbsolute(target) ? target : path.join(ROOT, target);

class InjectAborted extends Error {}

const DEFECT = {
  from: "        if (src[j] === q || src[j] === '\\n' || src[j] === '\\r') break;",
  to: '        if (src[j] === q || isLineTerminator(src[j])) break;   // ← 001t 注入（LS/PS でも打ち切る）',
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-001t-'));
// 一時 tree の後始末は必ず走らせる（process.exit は finally を回さないので、
// 終了コードは変数に置いて最後に 1 度だけ exit する）。
let code = 1;
try {
  // --- 1. tree を複製（test/ 一式＋対象ファイル） ------------------------------
  fs.cpSync(path.join(ROOT, 'test'), path.join(tmp, 'test'), { recursive: true });
  fs.copyFileSync(srcTarget, path.join(tmp, path.basename(target)));

  // --- 1b. 対照実行: 注入前の複製 tree で新テストが exit 0 であること -----------
  //   これが無いと「構文エラー・依存欠落・無関係な pin の赤で exit 1」でも
  //   「検出できた」と誤読する（Codex 1巡目 P2 指摘）。欠陥以外の理由で赤く
  //   なる tree では、注入後の exit 1 は検出の証拠にならない。
  const testPath = path.join(tmp, 'test', 'test_reach_str_lt_sweep_001.js');
  console.log(`$ node test/test_reach_str_lt_sweep_001.js ${path.basename(target)}   （対照＝注入前の複製 tree 内）`);
  const control = spawnSync(process.execPath, [testPath, path.basename(target)], {
    cwd: tmp, encoding: 'utf8',
  });
  process.stdout.write(control.stdout || '');
  process.stderr.write(control.stderr || '');
  console.log(`対照の終了コード: ${control.status}`);
  if (control.status !== 0) {
    console.log('✗ 対照実行が exit 0 でない。この tree では注入後の exit 1 を検出の証拠にできない。');
    throw new InjectAborted();
  }

  // --- 2. lib のコピーへ 001t 型欠陥を 1 行だけ注入 -----------------------------
  const libPath = path.join(tmp, 'test', 'lib', 'reachability.js');
  const lib = fs.readFileSync(libPath, 'utf8');
  const occurrences = lib.split(DEFECT.from).length - 1;
  if (occurrences !== 1) {
    console.log(`✗ 注入失敗: 置換対象の行が ${occurrences} 箇所（1 箇所であるべき）`);
    console.log('  lib の整形で anchor が外れている。DEFECT.from を現行の lib に合わせ直すこと。');
    throw new InjectAborted();
  }
  fs.writeFileSync(libPath, lib.replace(DEFECT.from, DEFECT.to));
  const injectedLine = fs.readFileSync(libPath, 'utf8').split('\n')
    .findIndex((l) => l.includes('001t 注入')) + 1;
  console.log(`注入 tree: ${tmp}`);
  console.log(`注入した欠陥: test/lib/reachability.js L${injectedLine} 文字列リテラルの終端を LineTerminator 4 種へ`);
  console.log(`  - ${DEFECT.from.trim()}`);
  console.log(`  + ${DEFECT.to.trim()}`);

  // --- 3. 注入 tree で新テストを走らせる ---------------------------------------
  console.log(`\n$ node test/test_reach_str_lt_sweep_001.js ${path.basename(target)}   （注入 tree 内）`);
  const run = spawnSync(process.execPath, [testPath, path.basename(target)], {
    cwd: tmp, encoding: 'utf8',
  });
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  console.log(`\n終了コード: ${run.status}`);

  // --- 4. 判定: exit 1 だけでなく「注入欠陥のシグネチャで赤くなった」ことまで見る --
  //   ① exit 1 ② HIT-0 の FAIL 行がある ③ 最終行サマリの ヒット= が 0 でない。
  //   ①だけだと無関係な pin の赤も「検出」と誤読する（Codex 1巡目 P2 指摘）。
  const out = run.stdout || '';
  const hitLine = out.match(/ヒット=(\d+)/);
  const hitCount = hitLine ? parseInt(hitLine[1], 10) : -1;
  const sigOk = /FAIL: HIT-0 /.test(out) && hitCount > 0;
  if (run.status === 1 && sigOk) {
    console.log(`✓ 基準2: 欠陥入り tree で新テストが exit 1・HIT-0 の FAIL・ヒット=${hitCount}（注入欠陥を検出できた）`);
    code = 0;
  } else if (run.status === 1) {
    console.log(`✗ 基準2: exit 1 だが注入欠陥のシグネチャが無い（HIT-0 FAIL 行=${/FAIL: HIT-0 /.test(out)} / ヒット=${hitCount}）。別の理由で赤くなっている。`);
    code = 1;
  } else {
    console.log(`✗ 基準2: 欠陥を注入したのに新テストが exit ${run.status}（検出できていない）`);
    code = 1;
  }
} catch (err) {
  if (!(err instanceof InjectAborted)) console.log(`✗ 例外: ${err && err.stack ? err.stack : err}`);
  code = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
