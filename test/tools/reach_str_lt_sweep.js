#!/usr/bin/env node
// =============================================================================
// #816 hotfix 受け入れ基準1: 既存の JS 文字列リテラルへの U+2028 / U+2029 挿入走査
//
//   対象ファイルの JS 文字列リテラル（JS_STR_SQ / JS_STR_DQ）を面レクサで列挙し、
//   等間隔サンプルした各リテラルの**中央**へ LS / PS を 1 文字挿入して analyze() を
//   回し、走査が壊れた配置（= 関数総数が基準から動く / 生きた関数が静的到達不能に
//   落ちる）を数える。ブラウザ・node は U+2028 / U+2029 を文字列リテラル中で合法と
//   して実行する（ES2019）ので、**正しい走査ならヒット 0 件**になるはず。
//
//   001t の退行（文字列終端が LineTerminator 4 種で打ち切り）では 20% 超の配置で
//   走査が壊れた（パネル実測 97/400 = 24.3% / cowork 実測 48/207 = 23.2%）。
//
//   使い方:  node test/tools/reach_str_lt_sweep.js [target] [sampleN]
//     target  … 既定 shogi_v4.html
//     sampleN … 文字ごとのサンプル配置数の上限（既定 400・全リテラルが上限）
//   終了コード: ヒット 0 件なら 0、1 件でもあれば 1。
//
//   ── 816E: CI 常設化のための関数 export（走査ロジックは不変）────────────────
//   `test/tools/` は run_tests.sh の自動発見（`test/test_*.js` の非再帰 glob）の外な
//   ので、このツール単体は CI からは走らない。**CI で走るのは
//   `test/test_reach_str_lt_sweep_001.js`（自動発見に載る薄い wrapper）**で、
//   下の `sweep()` を N=40/文字で require して呼ぶ。走査の二重実装を避けるため、
//   計算を `sweep()`・表示を `formatReport()` に括り出し、CLI 実行時（require.main）
//   の標準出力と終了コードは 816E 以前と 1 バイトも変えていない
//   （`shogi_v4.html` に対し N=40 / N=400 の stdout が diff 0 であることを実測）。
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { analyze, classifyFaces, FACE } = require(path.join(__dirname, '..', 'lib', 'reachability.js'));

const CHARS = [['U+2028 (LS)', '\u2028'], ['U+2029 (PS)', '\u2029']];

// sweep(target, sampleN) → 走査結果（表示はしない）
//   { target, srcLength, spanCount, baseCount, chars: [{label, placements, hits, worst, killed}],
//     totalHits }
//   placements は「実際に analyze() を回した配置数」（= サンプル件数）。CI 側はこれを
//   pin して「spans が 0 に縮退して 0/0 で緑」を落とす。
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
        const a = analyze(mutated);
        const newlyDead = a.unreachableStatic.filter((x) => !baseUnreach.has(x.name));
        if (a.topLevelFunctionCount !== baseCount || newlyDead.length > 0) {
          hit = true;
          for (const x of newlyDead) killed.add(x.name);
          if (a.topLevelFunctionCount < worst.count) {
            worst = { count: a.topLevelFunctionCount, line: src.slice(0, mid).split('\n').length };
          }
        }
      } catch (err) {
        hit = true; // 走査自体が例外で死ぬのも「壊れた」
      }
      if (hit) hits++;
    }
    totalHits += hits;
    chars.push({ label, placements: sample.length, hits, worst, killed: [...killed] });
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
