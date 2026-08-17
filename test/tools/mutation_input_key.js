#!/usr/bin/env node
// =============================================================================
// mutation_input_key.js — 変異チェックの「入力の同一性」を1個の鍵にする
//   [E2E-MUT-SKIP-001]
//
//   なぜ要るか: run_e2e.sh の総仕事量の 70%（484/687秒・2026-08-17 実測）が
//   #881 / #887 の動的変異チェックだが、**chg-modal も bulk-edit も1行も触っていない
//   スライスでも毎巡フルで走っていた**（#853 は4巡すべてで走り約32分を捨てた）。
//
//   ★ 変異チェックが実証しているのは「**その検査自身が変異を殺せるか**」だけ。
//     この命題の値を決める入力は次の8つに閉じている（＝これが全集合）:
//       (1) チェッカー .sh 本体（DYN/STATIC の集合・want_ids・ハーネス判定の規律）
//       (2) 変異ジェネレータ .js（変異の定義そのもの）
//       (3) e2e スイート .js（アサーション ID と、その強さ）
//       (4) 対象 HTML のうち **変異が当たる領域**（＋前後の文脈）
//       (5) 対象 HTML の **それ以外の領域**（下記★の残余リスク）
//       (6) 実行環境（node / playwright / **platform・arch・実 Chromium の実体** /
//           locale・TZ）★Codex P1 (r3794397136) で (6) の列挙漏れを指摘され拡張した。
//           同じ checkout を macOS と Linux で共有（bind mount）すると、レイアウト座標や
//           画素を見る #887 の e2e は「macOS では殺せた変異が Linux では生き残る」のに
//           鍵が同じになり、Linux 側だけ不当に skip できてしまう。
//       (7) この鍵生成ツール自身と、呼び出す側の lib
//       (8) TARGET の指定（既定 shogi_v4.html か、明示された別ファイルか）
//     本ツールは (1)(2)(3)(4)(6)(7)(8) を1個の sha256 に畳む。
//
//   ★ (6) のうち **フォント・描画まわりだけは畳めない**（同一機械で fontconfig が
//     変わる等）。platform/arch と Chromium の実体を入れたことで「別 OS で同じ鍵」は
//     消えたので、残るのは同一機械の 24 時間以内の変化だけ ＝ 下の (5) と同じ受けに入れる。
//
//   ★ (5) は畳めない — が、次の3つで受ける（設計上の既知の残余リスク）:
//       a. 変異チェックの「0) 対照」＝**素の e2e** は run_e2e.sh で常に走る。
//          経路が壊れて検査が空回りするようになった場合はそちらが赤くなる。
//       b. **CI は必ずフル実行**（毎回クリーン checkout ＝ キャッシュ不在）。
//          PR に載る時点で1回は全変異が実測される。
//       c. キャッシュには TTL（既定24時間）がある。無期限に緑を持ち回らない。
//     つまり skip が効くのは「作者の手元／cloud の内側ループ」だけで、
//     **マージ判断に使われる緑は必ず実測**という性質は変わらない。
//
// 使い方:
//   node test/tools/mutation_input_key.js --target <html> --gen <mutants.js> \
//        --suite <suite.e2e.js> [--extra <file> ...]
//   標準出力に 64桁の hex を1行。
// 終了コード: 0=鍵を出した / 1=使い方エラー / 3=変異の生成に失敗（＝呼び出し側はフル実行すべき）
// 依存: node のみ。network 不使用。tmp に変異を生成して読み直すだけで、repo は変更しない。
// =============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// 変異が当たった位置の「前後どれだけ」を鍵に含めるか。
// 200 だと隣接行の変更を拾えない場面があったため 400（実測で 1.2MB HTML でも数十 KB に収まる）。
const CTX = 400;

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node mutation_input_key.js --target <html> --gen <mutants.js> --suite <suite.js> [--extra <file>]...');
  process.exit(1);
}

const args = process.argv.slice(2);
let target = '', gen = '', suite = '', dumpParts = false;
const extras = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const v = args[i + 1];
  if (a === '--dump-parts') { dumpParts = true; }
  else if (a === '--target') { if (!v) usage('--target に値が無い'); target = v; i++; }
  else if (a === '--gen') { if (!v) usage('--gen に値が無い'); gen = v; i++; }
  else if (a === '--suite') { if (!v) usage('--suite に値が無い'); suite = v; i++; }
  else if (a === '--extra') { if (!v) usage('--extra に値が無い'); extras.push(v); i++; }
  else usage('不明な引数: ' + a);
}
if (!target || !gen || !suite) usage('--target / --gen / --suite は必須');

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function fileHash(p) {
  // ★ 読めないファイルを「無い」として無視すると、消えた瞬間に鍵が変わらず
  //   古いキャッシュに当たる。読めなければ**エラーで落とす**（呼び出し側はフル実行）。
  return sha256(fs.readFileSync(p));
}

// --- (1)(2)(3)(7)(8): ファイル群と実行環境 ----------------------------------
const parts = [];
parts.push('v2');                       // 鍵の書式版（この算法を変えたら上げる＝旧キャッシュは自動失効）
parts.push('node=' + process.version);
// ★ 機械そのもの。同じ checkout を別 OS / 別アーキで共有し得るので必ず含める。
parts.push('platform=' + process.platform + '/' + process.arch);
// ★ 日付と文字列比較に効く環境。e2e は大会日を表示・比較する。
parts.push('tz=' + (process.env.TZ || ''));
parts.push('locale=' + (process.env.LC_ALL || '') + '|' + (process.env.LANG || ''));
// ★ playwright は **repo 直下の node_modules** から見る。process.cwd() から見ると
//   呼び出し元のカレント次第で 'unknown' になったりして、鍵が理由なく揺れる。
let pwVer = 'none';
let pwMod = null;
try {
  pwVer = require(path.join(__dirname, '../../node_modules/playwright/package.json')).version;
  pwMod = require(path.join(__dirname, '../../node_modules/playwright'));
} catch (e) {
  try {
    pwVer = require('playwright/package.json').version;
    pwMod = require('playwright');
  } catch (e2) { pwVer = 'unknown'; }
}
parts.push('playwright=' + pwVer);
// ★ **実際に起動されるブラウザの実体**。パスに build revision（例 chromium-1194）が入るので、
//   playwright の version が同じでもブラウザだけ差し替わった場合を捕まえられる。
let pwExec = 'unknown';
try { pwExec = (pwMod && pwMod.chromium && pwMod.chromium.executablePath()) || 'unknown'; }
catch (e) { pwExec = 'unresolved'; }
parts.push('chromium=' + pwExec);
parts.push('target-arg=' + target);
parts.push('gen=' + fileHash(gen));
parts.push('suite=' + fileHash(suite));
extras.forEach(function (f) { parts.push('extra:' + path.basename(f) + '=' + fileHash(f)); });

// --- (4): 変異が当たる領域＋文脈 --------------------------------------------
const base = fs.readFileSync(target, 'utf8');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutkey.'));
let regions = [];
try {
  const r = spawnSync(process.execPath, [gen, target, outDir], { encoding: 'utf8' });
  if (r.status !== 0) {
    // 生成できない＝アンカーが一意でない等。ここで「鍵が出せない」ことを伝え、
    // 呼び出し側にフル実行させる（その方が失敗が本来の形で報告される）。
    console.error('変異の生成に失敗（鍵を出せない → フル実行すべき）: ' + ((r.stderr || '') + (r.stdout || '')).trim());
    process.exit(3);
  }
  const files = fs.readdirSync(outDir).filter(function (f) { return /^mut_.*\.html$/.test(f); }).sort();
  if (files.length === 0) {
    console.error('変異が1本も生成されなかった → フル実行すべき');
    process.exit(3);
  }
  files.forEach(function (f) {
    const name = f.replace(/^mut_/, '').replace(/\.html$/, '');
    const mutant = fs.readFileSync(path.join(outDir, f), 'utf8');
    // 共通の先頭・末尾を削って「変わった範囲」を求める
    const lim = Math.min(base.length, mutant.length);
    let a = 0;
    while (a < lim && base.charCodeAt(a) === mutant.charCodeAt(a)) a++;
    let z = 0;
    while (z < lim - a && base.charCodeAt(base.length - 1 - z) === mutant.charCodeAt(mutant.length - 1 - z)) z++;
    const ctxStart = Math.max(0, a - CTX);
    const ctxEnd = Math.min(base.length, base.length - z + CTX);
    regions.push(
      name + '\u0000' +
      base.slice(ctxStart, ctxEnd) + '\u0001' +
      mutant.slice(a, mutant.length - z)
    );
  });
} finally {
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) { /* 消せなくても鍵には影響しない */ }
}
regions.sort();
parts.push('regions=' + sha256(regions.join('\u0002')));

// --dump-parts: 鍵そのものではなく**材料の一覧**を出す（何を同一と見なしているかを目で確かめる用）。
// 鍵と取り違えないよう、この場合は 64桁 hex を出さない。
if (dumpParts) {
  process.stdout.write(parts.join('\n') + '\n');
  process.exit(0);
}

process.stdout.write(sha256(parts.join('\n')) + '\n');
