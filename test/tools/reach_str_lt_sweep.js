#!/usr/bin/env node
// =============================================================================
// #816 hotfix 受け入れ基準1: 既存の JS 文字列リテラルへの U+2028 / U+2029 挿入走査
//
//   対象ファイルの JS 文字列リテラル（JS_STR_SQ / JS_STR_DQ）を面レクサで列挙し、
//   等間隔サンプルした各リテラルの**中央**へ LS / PS を 1 文字挿入して、走査が
//   壊れた配置を数える。ブラウザ・node は U+2028 / U+2029 を文字列リテラル中で
//   合法として実行する（ES2019）ので、**正しい面レクサならヒット 0 件**になるはず。
//
//   ── ヒット判定 = 面分類保存オラクル（PR #823 Codex 1巡目 P1 対応）──────────
//   「壊れた」＝ **挿入位置 1 文字を除いて classifyFaces() の結果が原本と完全一致
//   しない**こと。正しいレクサなら文字列中への LS/PS 挿入は面を 1 文字ずらすだけで
//   分類を変えない。終端退行（001t 型）なら挿入点以降の面が崩れるので必ず一致しない。
//   初版は「analyze() の到達性差分」をヒットにしていたが、それだと **onclick 結線を
//   持つ生きたリテラル**（エスケープ復号ランで参照を拾う正規機能）に挿入したとき、
//   レクサ無傷でも参照が変わって偽赤になる（実測: 39+1 リテラルの反例で 2/80）。
//   面オラクルは同じ反例で 0/80、001t 注入では 20/80 → **80/80** に検出が強まり、
//   analyze() を配置ごとに回さないぶん速い（作者機・cloud とも実測で確認）。
//   到達性差分は**ヒット時の診断表示にだけ**使う（判定には使わない）。
//
//   001t の退行（文字列終端が LineTerminator 4 種で打ち切り）の実測:
//   到達性差分版で 97/400 = 24.3%（パネル）/ 48/207 = 23.2%（cowork）/ 20/80（注入）。
//   面オラクル版で 80/80（注入・2026-08-07）。
//
//   使い方:  node test/tools/reach_str_lt_sweep.js [target] [sampleN]
//     target  … 既定 shogi_v4.html
//     sampleN … 文字ごとのサンプル配置数の上限（既定 400・全リテラルが上限）
//   終了コード: ヒット 0 件なら 0、1 件でもあれば 1。
//
//   ── 816E: CI 常設化のための関数 export ─────────────────────────────────────
//   `test/tools/` は run_tests.sh の自動発見（`test/test_*.js` の非再帰 glob）の外な
//   ので、このツール単体は CI からは走らない。**CI で走るのは
//   `test/test_reach_str_lt_sweep_001.js`（自動発見に載る薄い wrapper）**で、
//   下の `sweep()` を N=40/文字で require して呼ぶ。走査の二重実装を避けるため、
//   計算を `sweep()`・表示を `formatReport()` に括り出した（括り出し自体は挙動不変
//   を byte 一致で実測済み）。その後 Codex 1巡目 P1 対応でヒット判定を面オラクルへ
//   変更した（上のヘッダ参照）。**ヒット 0 の対象（現行 tree の shogi_v4.html）では
//   stdout・終了コードとも変更前と同一**（diff 0 を実測）。数字が変わるのは欠陥入り
//   tree に対してだけで、そちらは変更後のほうが正しい。
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { analyze, classifyFaces, FACE } = require(path.join(__dirname, '..', 'lib', 'reachability.js'));

const CHARS = [['U+2028 (LS)', ' '], ['U+2029 (PS)', ' ']];

// faceIntact(f1, f2, mid) → 挿入位置 mid の 1 文字を除いて面分類が完全一致か
//   f1 = 原本の classifyFaces / f2 = 挿入後の classifyFaces。
function faceIntact(f1, f2, mid) {
  if (f2.length !== f1.length + 1) return false;
  for (let i = 0; i < mid; i++) if (f2[i] !== f1[i]) return false;
  for (let i = mid; i < f1.length; i++) if (f2[i + 1] !== f1[i]) return false;
  return true;
}

// sweep(target, sampleN) → 走査結果（表示はしない）
//   { target, srcLength, spanCount, baseCount,
//     chars: [{label, ch, placements, hits, worst, killed}], totalHits }
//   placements は「実際に判定を回した配置数」（= サンプル件数）。CI 側はこれを
//   pin して「spans が 0 に縮退して 0/0 で緑」を落とす。ch は実際に挿入した文字
//   （CI 側が LS / PS の実文字を pin するために返す）。
function sweep(target, sampleN) {
  const src = fs.readFileSync(target, 'utf8');

  // --- 基準値 -----------------------------------------------------------------
  const base = analyze(src);
  const baseCount = base.topLevelFunctionCount;
  const baseUnreach = new Set(base.unreachableStatic.map((x) => x.name));

  // --- JS 文字列リテラルの span を列挙（引用符を含む面の連続区間） -------------
  const face = classifyFaces(src);
  const spans = [];
  for (let i = 0; i < face.length; i++) {
    const f = face[i];
    if (f !== FACE.JS_STR_SQ && f !== FACE.JS_STR_DQ) continue;
    let j = i;
    while (j < face.length && face[j] === f) j++;
    // 中身が 1 文字以上あるリテラルだけ（'' / "" は挿入位置が引用符に重なる）
    if (j - i >= 3) spans.push([i, j]);
    i = j - 1;
  }

  // --- 等間隔サンプル（乱数を使わない＝再現可能） ------------------------------
  const pick = (n) => {
    if (spans.length <= n) return spans.slice();
    const out = [];
    for (let k = 0; k < n; k++) out.push(spans[Math.floor((k * spans.length) / n)]);
    return out;
  };

  const chars = [];
  let totalHits = 0;
  for (const [label, ch] of CHARS) {
    const sample = pick(sampleN);
    let hits = 0;
    let worst = { count: baseCount, line: 0 };
    const killed = new Set();
    for (const [s, e] of sample) {
      const mid = Math.floor((s + 1 + e - 1) / 2); // 引用符の内側の中央
      const mutated = src.slice(0, mid) + ch + src.slice(mid);
      let hit = false;
      try {
        // 判定は面オラクルのみ（到達性差分は使わない。上のヘッダ参照）
        hit = !faceIntact(face, classifyFaces(mutated), mid);
      } catch (err) {
        hit = true; // 面分類自体が例外で死ぬのも「壊れた」
      }
      if (hit) {
        hits++;
        // 診断表示用の到達性差分（判定には使わない。ヒット時だけ回すので clean では 0 コスト）
        try {
          const a = analyze(mutated);
          for (const x of a.unreachableStatic) if (!baseUnreach.has(x.name)) killed.add(x.name);
          if (a.topLevelFunctionCount < worst.count) {
            worst = { count: a.topLevelFunctionCount, line: src.slice(0, mid).split('\n').length };
          }
        } catch (err) { /* 診断が取れなくても判定は変えない */ }
      }
    }
    totalHits += hits;
    chars.push({ label, ch, placements: sample.length, hits, worst, killed: [...killed] });
  }

  return { target, srcLength: src.length, spanCount: spans.length, baseCount, chars, totalHits };
}

// formatReport(r) → 表示行（CLI の console.log 引数をそのまま順に並べたもの）
function formatReport(r) {
  const lines = [];
  lines.push(`対象: ${r.target}（${r.srcLength.toLocaleString()} 文字）`);
  lines.push(`JS 文字列リテラル: ${r.spanCount.toLocaleString()} 個 / 基準の関数総数: ${r.baseCount}`);
  for (const c of r.chars) {
    const pct = c.placements ? ((c.hits / c.placements) * 100).toFixed(1) : '0.0';
    lines.push(`\n${c.label}: ${c.hits}/${c.placements} 配置で走査が壊れた（${pct}%）`);
    if (c.hits > 0) {
      lines.push(`  最悪の配置: 関数総数 ${r.baseCount} → ${c.worst.count}（挿入行 L${c.worst.line} 付近）`);
      lines.push(`  「到達不能」へ落ちた生きた関数（累積）: ${c.killed.length} 本`
        + (c.killed.length ? `（例: ${c.killed.slice(0, 8).join(', ')}）` : ''));
    }
  }
  lines.push(`\n合計ヒット: ${r.totalHits}（正しい走査なら 0 のはず＝ U+2028/U+2029 は文字列中で合法）`);
  return lines;
}

module.exports = { sweep, formatReport, CHARS };

if (require.main === module) {
  const target = process.argv[2] || 'shogi_v4.html';
  const sampleN = parseInt(process.argv[3] || '400', 10);
  const r = sweep(target, sampleN);
  for (const line of formatReport(r)) console.log(line);
  process.exit(r.totalHits === 0 ? 0 : 1);
}
