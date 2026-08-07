#!/usr/bin/env node
// PHASE1-REACH-816E: 文字列リテラル内 U+2028 / U+2029 の終端退行スイープ（CI 常設）
//
//   #816 hotfix（#818 = 9d64a7e）で直した 001t 型の退行 —— JS 文字列リテラルの終端を
//   LineTerminator 4 種（LF / CR / LS / PS）で打ち切ってしまう —— の回帰検査。
//   走査そのものは `test/tools/reach_str_lt_sweep.js` の `sweep()` を **require して
//   再利用する**（child_process ではなく関数 require にした理由: ①走査ロジックの
//   二重実装をしない ②配置数・ヒット数を stdout の文言から拾い直さずに構造化された
//   値で受け取れる＝下の PLACE-1 のような pin を文言解析なしで書ける ③子プロセス起動
//   ぶんの時間を足さない）。tool 単体の全量走査（既定 N=400）の使い方と挙動は不変。
//
//   ── CI で走らせる量 ────────────────────────────────────────────────────
//   N=40 / 文字（LS・PS の 2 文字）＝ 80 配置。等間隔サンプル＝乱数なしで決定的。
//   001t 級の退行はヒット率 23〜25%（実測 97/400・48/207・注入実測 20/80）なので、
//   80 配置なら実質確実に捕まる。時間は作者機で約 4.5 秒（N=400 の全量は約 42 秒）。
//   N を上げ下げするときは時間予算と見逃し確率の両方を数字で書くこと。
//
//   ── この 1 本が守る範囲 ────────────────────────────────────────────────
//   「JS 文字列リテラル内の LS / PS で走査が壊れる」という **1 クラス専用の番人**。
//   それ以上（消費位置バグ一般・他の面の退行）は守備範囲と主張しない。
//
//   ── 骨抜き 3 種を塞ぐ pin（#816 E 受け入れ基準3）────────────────────────
//   (i)  TARGET 無視     … TARGET-1（sweep が読んだのは run_tests が渡したファイルか）
//   (ii) spans 縮退      … PLACE-1（面レクサが壊れて列挙 0 → 0/0 で緑、を落とす）
//   (iii) N 引き下げ     … PLACE-1 の下限は **リテラル 80**（N の値から導出しない）
'use strict';
const fs = require('fs');
const path = require('path');
const { sweep, CHARS } = require(path.join(__dirname, 'tools', 'reach_str_lt_sweep.js'));

const TARGET = process.argv[2] || 'shogi_v4.html';
const SAMPLE_N = 40;                 // 1 文字あたりのサンプル配置数
const MIN_PLACEMENTS = 80;           // = 40 × 2 文字。N を下げても勝手に緩まないようリテラルで持つ

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

const r = sweep(TARGET, SAMPLE_N);
const placements = r.chars.reduce((n, c) => n + c.placements, 0);

// --- 検査が実際に走ったことの表示（run_tests の TARGET と突き合わせられる） -------
console.log(`対象: ${r.target}（${r.srcLength.toLocaleString()} 文字 / JS 文字列リテラル ${r.spanCount.toLocaleString()} 個 / 基準の関数総数 ${r.baseCount}）`);
console.log(`実行配置数: ${placements}（${SAMPLE_N} × ${r.chars.length} 文字）`);
for (const c of r.chars) console.log(`  ${c.label}: ${c.hits}/${c.placements} 配置で走査が壊れた`);

// --- TARGET-1: 渡された TARGET を実際に読んで解析したか -------------------------
//   「既定の shogi_v4.html を見ているだけで引数を無視している」を落とす。
//   sweep の申告（r.target / r.srcLength）を、このファイルが独立に読んだ実体と照合する。
{
  let actualLength = -1;
  try { actualLength = fs.readFileSync(TARGET, 'utf8').length; } catch (e) { actualLength = -1; }
  ok(r.target === TARGET && actualLength >= 0 && r.srcLength === actualLength,
    `TARGET-1 sweep が解析したのは渡された TARGET そのもの（渡した: ${TARGET} / 解析: ${r.target} / 長さ ${r.srcLength} vs 実体 ${actualLength}）`);
}

// --- PLACE-1: 実行配置数の下限（spans 縮退・N 引き下げ・文字の間引きを一括で落とす） ---
ok(placements >= MIN_PLACEMENTS,
  `PLACE-1 実行配置数 ${placements} < ${MIN_PLACEMENTS}（面レクサの退行で JS 文字列が列挙できていない／サンプル数が下げられている）`);
ok(r.chars.length === CHARS.length && r.chars.length === 2,
  `PLACE-2 挿入文字は LS / PS の 2 種（実際: ${r.chars.length} 種）`);

// --- HIT-0: 誤検知 0（現行 lib ＋ 原本ならヒット 0） -----------------------------
ok(r.totalHits === 0,
  `HIT-0 文字列リテラルへ LS / PS を 1 文字入れただけで走査が壊れた配置が ${r.totalHits} 件ある`
  + `（001t 型の終端退行。詳細は node test/tools/reach_str_lt_sweep.js ${TARGET} 400）`);
if (r.totalHits > 0) {
  for (const c of r.chars) {
    if (!c.hits) continue;
    console.log(`  ${c.label}: 最悪の配置で関数総数 ${r.baseCount} → ${c.worst.count}（挿入行 L${c.worst.line} 付近）`
      + `／「到達不能」へ落ちた生きた関数 ${c.killed.length} 本`
      + (c.killed.length ? `（例: ${c.killed.slice(0, 8).join(', ')}）` : ''));
  }
}

console.log(`PHASE1-REACH-816E: PASS=${pass} FAIL=${fail} 対象=${r.target} 配置=${placements} ヒット=${r.totalHits}`);
process.exit(fail === 0 ? 0 : 1);
