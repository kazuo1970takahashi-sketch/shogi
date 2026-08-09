#!/usr/bin/env node
// =============================================================================
// #816 hotfix 受け入れ基準1: 既存の JS 文字列リテラルへの U+2028 / U+2029 挿入走査
//
//   対象ファイルの JS 文字列リテラル（JS_STR_SQ / JS_STR_DQ）を面レクサで列挙し、
//   等間隔サンプルした各リテラルの**中央**へ LS / PS を 1 文字挿入して、走査が
//   壊れた配置を数える。ブラウザ・node は U+2028 / U+2029 を文字列リテラル中で
//   合法として実行する（ES2019）ので、**正しい面レクサならヒット 0 件**になるはず。
//
//   ── ヒット判定 = 2 つのオラクルの OR ────────────────────────────
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
//   ※ サンプル位置は乱数なしで決定的なので、同じ欠陥・同じ対象なら**面オラクル側の
//     ヒット数は機械差で動かない**。例外オラクル側は「例外が飛ぶか」を見るため
//     エンジン差の影響を原理的には受けうる（実測では Node v22 で同数）。
//
//   ── ★ この番人が守っていないもの（反証パネル 2026-08-07 / 08・#816 へ切り出し済み）──
//   (a) **挿入位置がエスケープの被エスケープ位置に落ちると偽赤が出る**。注入後の
//       プログラムが V8 で SyntaxError になり、レクサが正しくても面が変わる。
//       地雷になる形は総当たりで確認済み（反証パネル 2026-08-08・14 形状を実測）:
//       `'\\'`（内容 2 文字なので中央が必ずエスケープ対の内側）・`dir + '\\' + name`・
//       **行末に `\` を置いた行継続**の 3 形状だけ。`'don\''` / `"\""` / `'\n'` /
//       `'\t'` / `'^\\d+$'` / `'{\"k\":\"v\"}'` / 日本語文言は安全だった。
//       現行の `shogi_v4.html` は **6,029 リテラル全量に LS/PS を入れて 0/6029**
//       ＝地雷ゼロ。発火するのは「編集が地雷リテラルを新たに持ち込み、かつ等間隔
//       サンプルの抽選に当たったとき」で、当たり index は 40/6030 = **0.66%**。
//       ★ 抽選はリテラル総数が変わるたびに引き直されるので、**地雷を入れたコミットは
//       緑で通り、後から来た無関係な 1 行が赤を出す**ことがある（実測: 文言リテラルを
//       1 個足しただけの diff で exit 1）。そのとき FAIL は「001t 型の終端退行」と
//       名指しし「関数総数 580 → 27」と出るが、lib は無傷で本番アプリも無事。
//       塞ぎ方の候補: ヒット時に注入後ソースを `vm.compileFunction` へ通し、
//       **SyntaxError なら偽陽性として除外する**（LS/PS 挿入が合法であることが判定の
//       前提なので、合法でなくなった配置を除くのは弱体化にならない）。
//       これは既知の未解決課題として #816 に起票してある。**この便では直していない。**
//   (b) **`opts` が渡されたことを検出して分岐する骨抜きは、この差し替え口では
//       原理的に塞げない**。下の `opts` は陽性対照（CI 側 CONTROL-1H/1T/2）のために
//       あるが、`if (opts && opts.classifyFaces) { 本物 } else { 手抜き }` と書けば
//       対照だけが本物を通り本番だけが盲になる。**テストにしか無い経路は、テストを
//       狙い撃つ分岐を招く** —— 差し替え口方式の構造的な限界。
//       「`opts` という語に触れる行を pin する」案は**採らなかった**: `arguments[2]` や
//       `lex !== classifyFaces` で同じ分岐が書けて効かないうえ、JSDoc の追加・
//       `opts?.` への書き換え・`options` への改名・シグネチャの折り返しといった
//       **挙動を変えない整形で偽赤を出す**ことが実測された（反証パネル 2026-08-08）。
//       これを塞げるのは差し替え口を一切使わない版、すなわち **lib の複製へ実際に
//       欠陥を注入して赤を要求する** `test/tools/reach_str_lt_inject_001t.js` の方。
//       実測: 上の 2 形の骨抜きを当てた tree で CI は `PASS=10 FAIL=0` のまま緑だが、
//       inject 側は `✗ 基準2 … exit 0（検出できていない）` で exit 1 になる。
//       あちらは lib の生テキストへの anchor を持つので CI 常設にはできない
//       （下の「CI 外に置く理由」）。
//       **両者はセットで初めて閉じる。リリース証跡では inject 側も回すこと。**
//
//   使い方:  node test/tools/reach_str_lt_sweep.js [target] [sampleN]
//     target  … 既定 shogi_v4.html
//     sampleN … 文字ごとのサンプル配置数の上限（既定 400）。**全量ではない**——
//               `shogi_v4.html` の JS 文字列リテラルは 6,029 個あるので N=400 は
//               6.6% のサンプル。実行時間は cloud Linux / Node v22 で約 117 秒
//               （N=40 なら約 13 秒）。いずれも占有時の **CPU 時間**ベース —— 共有 CPU の
//               壁時計ではこの 1.5 倍程度まで伸びる。例外オラクルを OR で戻して以降の値。
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
//   `e56cdfb`（陽性対照を足す直前のコミット）と同一**（N=40 / N=400 で diff 0 を実測。
//   分割前＝816E 以前との byte 一致は #823 の便で実測済み）。出力が増えるのは欠陥入り
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

// sweep(target, sampleN, opts) → 走査結果（表示はしない）
//   { target, srcLength, spanCount, baseCount, totalHits, totalThrows,
//     chars: [{label, ch, placements, hits, faceHits, throws, firstThrow,
//              diagSamples, worst, killed}] }
//   placements は「実際に判定を回した配置数」（= サンプル件数）。CI 側はこれを
//   pin して「spans が 0 に縮退して 0/0 で緑」を落とす。ch は実際に挿入した文字
//   （CI 側が LS / PS の実文字を pin するために返す）。
//
//   opts.classifyFaces / opts.analyze … 2 つのオラクルの差し替え口（既定は lib の本物）。
//     **陽性対照のためだけにある。** 下の pin はどれも「sweep が返した数」しか
//     見ていないので、判定ループ手前に `continue` を 1 行置く／申告と実挿入を
//     切り離す／面比較が常に true を返すよう最適化する、といった改変が全部
//     素通りする（反証パネル 2026-08-07 実測）。呼び出し側が**自分で用意した
//     レクサ／analyze** を渡し、それが呼ばれた回数と渡された文字列を**自分で数える**
//     ことで、「判定が実際に走った」ことを sweep の申告に依らず確かめられる。
//     ★ 2 つ **両方**に口があるのは、片方だけだともう片方を殺す改変が通るため。
//       実測（反証パネル 2026-08-08）: `analyze(mutated)` を `if (hit)` の中へ移すと
//       オラクル2 は本番で一度も走らなくなるのに、面オラクルだけの陽性対照は緑のまま
//       通り、しかも 12.4 秒 → 3.9 秒と**速くなるので改善に見える**。
//     ★ 対照は **fixture ではなく本番 TARGET・本番と同じ `sampleN`** で回すこと。
//       小さな合成入力や小さい N で回すと、`src.length` や `sampleN` で経路を切り替える
//       （テストを一切意識していない）最適化に対して無力になる（同パネル実測: どちらも
//       860KB × N=40 の本番だけが盲になり、CI は緑・stdout は byte 一致）。
//     使い方は `test/test_reach_str_lt_sweep_001.js` の CONTROL-1H/1T/1P/2/2P を参照。
function sweep(target, sampleN, opts) {
  const src = fs.readFileSync(target, 'utf8');
  const lex = (opts && opts.classifyFaces) || classifyFaces;
  const anz = (opts && opts.analyze) || analyze;

  // --- 基準値 -----------------------------------------------------------------
  const base = anz(src);
  const baseCount = base.topLevelFunctionCount;
  const baseUnreach = new Set(base.unreachableStatic.map((x) => x.name));

  // --- JS 文字列リテラルの span を列挙（引用符を含む面の連続区間） -------------
  const face = lex(src);
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
    // diagSamples = ヒットした配置のうち **analyze() が成功した**件数。
    //   到達性の診断（worst / killed）はここが 0 のとき「一度も測っていない」ので、
    //   表示側はこれで gate する。0 のまま worst を出すと sentinel（baseCount / L0）を
    //   実測値のように印字してしまう（Codex 2巡目 P2）。
    let diagSamples = 0;
    let worst = { count: baseCount, line: 0 };
    const killed = new Set();
    for (const [s, e] of sample) {
      const mid = Math.floor((s + 1 + e - 1) / 2); // 引用符の内側の中央
      const mutated = src.slice(0, mid) + ch + src.slice(mid);
      const lineOf = () => src.slice(0, mid).split('\n').length;
      let hit = false;

      // --- オラクル1: 面分類の保存 -------------------------------------------
      try {
        hit = !faceIntact(face, lex(mutated), mid);
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
        a = anz(mutated);
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
          diagSamples++;
          for (const x of a.unreachableStatic) if (!baseUnreach.has(x.name)) killed.add(x.name);
          if (a.topLevelFunctionCount < worst.count) worst = { count: a.topLevelFunctionCount, line: lineOf() };
        }
      }
    }
    totalHits += hits;
    totalThrows += throws;
    chars.push({ label, ch, placements: sample.length, hits, faceHits, throws, firstThrow, diagSamples, worst, killed: [...killed] });
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
    // 到達性の診断は **analyze() が成功した配置が 1 件でもあるとき**だけ出す。
    //   `worst` の初期値は sentinel（baseCount / L0）なので、全配置で analyze() が
    //   例外死した場合にこれを出すと「関数総数 580 → 580（挿入行 L0 付近）／
    //   到達不能 0 本」という**測っていない値**を実測のように印字することになる
    //   （Codex 2巡目 P2。まさに例外死型の退行＝この便で検出できるようにした
    //   クラスで起きる）。wrapper 側は既に分離済みなので、それに揃える。
    if (c.diagSamples > 0) {
      lines.push(`  最悪の配置: 関数総数 ${r.baseCount} → ${c.worst.count}（挿入行 L${c.worst.line} 付近）`);
      lines.push(`  「到達不能」へ落ちた生きた関数（累積）: ${c.killed.length} 本`
        + (c.killed.length ? `（例: ${c.killed.slice(0, 8).join(', ')}）` : '')
        + (c.diagSamples < c.hits ? `／うち ${c.hits - c.diagSamples} 配置は analyze() が例外死して測れず` : ''));
    } else if (c.hits > 0) {
      lines.push('  到達性の診断は取れなかった（ヒットした配置ではすべて analyze() が例外死）');
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
