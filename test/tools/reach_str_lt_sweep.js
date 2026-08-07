#!/usr/bin/env node
// =============================================================================
// #816 hotfix 受け入れ基準1: 既存の JS 文字列リテラルへの U+2028 / U+2029 挿入走査
//
//   対象ファイルの JS 文字列リテラル（JS_STR_SQ / JS_STR_DQ）を面レクサで列挙し、
//   等間隔サンプルした各リテラルの**中央**へ LS / PS を 1 文字挿入して、走査が
//   壊れた配置を数える。ブラウザ・node は U+2028 / U+2029 を文字列リテラル中で
//   合法として実行する（ES2019）ので、**正しい面レクサならヒット 0 件**になるはず。
//
//   ── ヒット判定 = 2 つのオラクルの OR ────────────────────────────────
//   (1) **面分類の保存**: 挿入位置 1 文字を除いて classifyFaces() の結果が原本と
//       完全一致しなければヒット。正しいレクサなら文字列中への LS/PS 挿入は面を
//       1 文字ずらすだけで分類を変えない。001t 型の終端退行なら挿入点以降の面が
//       崩れるので必ず一致しない。
//   (2) **analyze() が例外死しないこと**: 例外が飛んだらヒット。
//
//   経緯（測った順に書く。数字はすべて cloud Linux / Node v22 の実測）:
//   - 初版は「analyze() の**到達性差分**」だけをヒットにしていた。これは **onclick
//     結線を持つ生きたリテラル**（エスケープ復号ランで参照を拾う正規機能）に挿入
//     したとき、レクサ無傷でも参照が変わって**偽赤**になる（Codex 1巡目 P1・
//     反例実測 2/80 exit 1）。
//   - そこで (1) の面オラクル単独へ移した。偽赤は 0/80 に消え、001t 注入の検出は
//     20/80 → 80/80 に強まった。**ところが反証パネル（2026-08-07）が、この移行で
//     「面は保存されているのに analyze() が LS/PS 入力で例外死する」型の退行を
//     まるごと見落とすようになったことを実測で示した**（面オラクル 0/80 で緑・
//     到達性差分版 18/80 で赤）。
//   - よって (2) を OR で戻した。戻したのは**例外の有無だけ**で、到達性の差分は
//     判定に使わない（差分を戻すと上の偽赤が再発する）。
//
//   001t の退行（文字列終端が LineTerminator 4 種で打ち切り）の検出力の実測:
//   到達性差分版 20/80（N=40）/ 103/400（N=400）。現行 80/80（N=40）。
//   ※ 走査は等間隔サンプル＝決定的なので、同じ欠陥・同じ対象ならどの機械でも
//     同じヒット数になる。**機械が違うという理由で数字が動くことはない。**
//
//   ── ★ この番人が守っていないもの（反証パネル 2026-08-07・#816 へ切り出し済み）──
//   (a) **挿入位置がエスケープの被エスケープ位置に落ちると偽赤が出る**。`'\\'` /
//       `"\""` / `'\''` / 行継続を含むリテラルの中央に LS を入れると、注入後の
//       プログラムが V8 で SyntaxError になり、レクサが正しくても面が変わる。
//       実測: `shogi_v4.html` に `String(v).split('\\')` を 1 行足すと exit 1。
//       発火は等間隔サンプルの抽選次第（約 0.5%/コミット）。
//   (b) **陽性対照が無い**。「オラクルが false を返せること」を確かめる検査が
//       どこにも無いので、`hit` を恒久的に false にする改変（善意の最適化を含む）
//       は下の pin をすべて素通りする。
//   これらは既知の未解決課題として #816 に起票してある。**この便では直していない。**
//
//   使い方:  node test/tools/reach_str_lt_sweep.js [target] [sampleN]
//     target  … 既定 shogi_v4.html
//     sampleN … 文字ごとのサンプル配置数の上限（既定 400）。**全量ではない**——
//               `shogi_v4.html` の JS 文字列リテラルは 6,028 個あるので N=400 は
//               6.6% のサンプル。実行時間は cloud で約 44 秒（N=40 なら約 4 秒）。
//   終了コード: ヒット 0 件なら 0、1 件でもあれば 1。
//
//   ── 816E: CI 常設化のための関数 export ─────────────────────────────────────
//   `test/tools/` は run_tests.sh の自動発見（`test/test_*.js` の非再帰 glob）の外な
//   ので、このツール単体は CI からは走らない。**CI で走るのは
//   `test/test_reach_str_lt_sweep_001.js`（自動発見に載る薄い wrapper）**で、
//   下の `sweep()` を N=40/文字で require して呼ぶ。走査の二重実装を避けるため、
//   計算を `sweep()`・表示を `formatReport()` に括り出した（括り出し自体は挙動不変
//   を byte 一致で実測済み）。その後ヒット判定を上の 2 オラクルへ組み替えたが、
//   **ヒット 0 の対象（現行 tree の shogi_v4.html）では stdout・終了コードとも
//   816E 以前と同一**（N=40 / N=400 で diff 0 を実測）。出力が増えるのは欠陥入り
//   tree に対してだけ。
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { analyze, classifyFaces, FACE } = require(path.join(__dirname, '..', 'lib', 'reachability.js'));

const LS = String.fromCharCode(0x2028); // U+2028 LINE SEPARATOR（生文字もエスケープも置かない＝整形・転送での不可視破損を防ぐ）
const PS = String.fromCharCode(0x2029); // U+2029 PARAGRAPH SEPARATOR
const CHARS = [['U+2028 (LS)', LS], ['U+2029 (PS)', PS]];

// faceIntact(f1, f2, mid) → 挿入位置 mid の 1 文字を除いて面分類が完全一致か
//   f1 = 原本の classifyFaces / f2 = 挿入後の classifyFaces。
function faceIntact(f1, f2, mid) {
  if (f2.length !== f1.length + 1) return false;
  for (let i = 0; i < mid; i++) if (f2[i] !== f1[i]) return false;
  for (let i = mid; i < f1.length; i++) if (f2[i + 1] !== f1[i]) return false;
  return true;
}

// sweep(target, sampleN) → 走査結果（表示はしない）
//   { target, srcLength, spanCount, baseCount, totalHits, totalThrows,
//     chars: [{label, ch, placements, hits, faceHits, throws, firstThrow, worst, killed}] }
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
  let totalThrows = 0;
  for (const [label, ch] of CHARS) {
    const sample = pick(sampleN);
    let hits = 0;
    let faceHits = 0;   // オラクル1 が落とした配置数
    let throws = 0;     // オラクル2 が落とした配置数（両方に該当する配置は両方に数える）
    let firstThrow = null;
    let worst = { count: baseCount, line: 0 };
    const killed = new Set();
    for (const [s, e] of sample) {
      const mid = Math.floor((s + 1 + e - 1) / 2); // 引用符の内側の中央
      const mutated = src.slice(0, mid) + ch + src.slice(mid);
      const lineOf = () => src.slice(0, mid).split('\n').length;
      let hit = false;

      // --- オラクル1: 面分類の保存 -------------------------------------------
      try {
        hit = !faceIntact(face, classifyFaces(mutated), mid);
      } catch (err) {
        hit = true; // 面分類自体が例外で死ぬのも「壊れた」
      }
      if (hit) faceHits++;

      // --- オラクル2: analyze() が例外死しないこと（OR） ----------------------
      //   面オラクルは classifyFaces しか見ないので、「面は保存されているのに
      //   analyze() が LS/PS 入力で例外死する」型の退行を構造的に見落とす
      //   （反証パネル H1・実測: 面オラクル 0/80 で緑／到達性差分版 18/80 で赤）。
      //   ここで戻すのは **例外の有無だけ**。到達性の「差分」は判定に使わない
      //   —— 差分を判定に戻すと Codex 1巡目 P1 の偽赤（結線リテラルへの挿入で
      //   参照が正当に変わる）が再発するため。
      let a = null;
      try {
        a = analyze(mutated);
      } catch (err) {
        hit = true;
        throws++;
        if (!firstThrow) {
          firstThrow = { line: lineOf(), message: String((err && err.message) || err).slice(0, 200) };
        }
      }

      if (hit) {
        hits++;
        // 診断表示用（判定には使わない）
        if (a) {
          for (const x of a.unreachableStatic) if (!baseUnreach.has(x.name)) killed.add(x.name);
          if (a.topLevelFunctionCount < worst.count) worst = { count: a.topLevelFunctionCount, line: lineOf() };
        }
      }
    }
    totalHits += hits;
    totalThrows += throws;
    chars.push({ label, ch, placements: sample.length, hits, faceHits, throws, firstThrow, worst, killed: [...killed] });
  }

  return { target, srcLength: src.length, spanCount: spans.length, baseCount, chars, totalHits, totalThrows };
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
    // ヒット 0 の対象では 1 行も足さない（＝clean の stdout を変えない）
    if (c.throws > 0) {
      lines.push(`  うち analyze() が例外死: ${c.throws}/${c.placements} 配置`
        + `（初出 L${c.firstThrow.line} 付近: ${c.firstThrow.message}）`);
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
