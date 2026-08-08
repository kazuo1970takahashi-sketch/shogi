#!/usr/bin/env node
// PHASE1-REACH-816E: 文字列リテラル内 U+2028 / U+2029 の終端退行スイープ（CI 常設）
//
//   #816 hotfix（#818 = 9d64a7e）で直した 001t 型の退行 —— JS 文字列リテラルの終端を
//   LineTerminator 4 種（LF / CR / LS / PS）で打ち切ってしまう —— の回帰検査。
//   走査そのものは `test/tools/reach_str_lt_sweep.js` の `sweep()` を **require して
//   再利用する**（child_process ではなく関数 require にした理由: ①走査ロジックの
//   二重実装をしない ②配置数・ヒット数を stdout の文言から拾い直さずに構造化された
//   値で受け取れる＝下の PLACE-1 のような pin を文言解析なしで書ける ③子プロセス起動
//   ぶんの時間を足さない）。tool 単体（既定 N=400・**全量ではなく 6.6% のサンプル**）
//   の使い方は不変。ヒット 0 の対象では tool の stdout も `e56cdfb`（陽性対照を足す
//   直前のコミット）と byte 一致。
//
//   ── CI で走らせる量 ──────────────────────────────────────────────
//   N=40 / 文字（LS・PS の 2 文字）＝ 80 配置。等間隔サンプル＝乱数なしで決定的
//   （＝サンプル位置は決定的なので、同じ欠陥・同じ対象なら**面オラクル側のヒット数は
//     機械差で動かない**。例外オラクル側はエンジン差の影響を原理的には受けうる）。
//   実行時間は cloud Linux / Node v22 で約 19.5 秒（緑の道）。うち陽性対照
//   （CONTROL-1H/1T/2）が約 7 秒（陽性対照なしの `e56cdfb` で 12.4〜12.6 秒）。
//   対照は**本番と同じ N=40** で回す（小さい N で回すと `sampleN` で経路を切り替える
//   骨抜きに無力なため。実測でその抜け道を確認済み）。面の対照 2 本では `analyze` を
//   軽い代役に差し替えて約 20 秒を節約している（判定は面オラクルだけで決まるので
//   結果は変わらない。オラクル2 の健全性は CONTROL-2 が本物の経路で見る）。
//   ヒット判定は「面分類の保存」と「analyze() が例外死しない」の OR（tool 側ヘッダ）。
//   注入で測った検出力: 素の 001t 型（終端 4 種化）で 80/80、面は保存されるが
//   analyze() が例外死する型で 18/80。**「必ず」ではない** —— 欠陥がファイル末尾側
//   だけに効く変種では余裕が落ちる（実測: 終端 4 種化を `j > src.length*0.9` に
//   限定した変種で 8/80、`src.length/2` に限定で 42/80。いずれも赤にはなる）。
//   N を上げ下げするときは時間予算と見逃し確率の両方を数字で書くこと。
//
//   ── この 1 本が守る範囲 ──────────────────────────────────────────
//   「JS 文字列リテラル内の LS / PS で**面レクサの終端が壊れる**」＋「同じ入力で
//   **走査が例外死する**」の 2 クラス。それ以上は守備範囲と主張しない。特に:
//   - **エスケープ復号（結線デコーダ）の到達性への影響**は判定に含めない。含めると
//     onclick 結線を持つ生きたリテラルへの挿入（＝正当な意味変化）と区別できず
//     偽赤になる（Codex 1巡目 P1。反例 `ce40.html` に対し、到達性差分版は**全 41
//     リテラルを引く N=41 で 2/82** ＝結線リテラルだけがヒット。現行の 2 オラクルは
//     同条件で **0/82 exit 0**。※ N=40 だと等間隔サンプル `floor(k*41/40)` が最後の
//     span を構造的に引かないので、N=40 の 0/80 は証拠にならない）。復号退行は兄弟の
//     `test_reachability_001.js` が別途 pin している。
//   - **テンプレートリテラル / HTML 属性値**の同型退行はサンプル対象外（0/80 緑）。
//     これらも兄弟テスト（`LT-TMPL-LS/PS`・`T[ATTR_VAL_ON]-13〜15`）が捕らえる。
//   ★ 未解決（#816 へ切り出し済み・この便では直していない）:
//     偽赤 —— 挿入点がエスケープの被エスケープ位置に落ちると正しいレクサでも赤が出る。
//       実測: `shogi_v4.html` に `String(v).split('\\')` を 1 行足すと exit 1。
//       発火は等間隔サンプルの抽選次第（約 0.5%/コミット）。
//     骨抜き —— **`opts` が渡されたことを検出して分岐する改変**は塞げない（下の
//       CONTROL 群の ★ を参照。`arguments[2]` や `lex !== classifyFaces` で書けるので、
//       ソーステキストを pin する案は効かず、しかも整形で偽赤を出す）。塞ぎ切れるのは
//       差し替え口を使わない `test/tools/reach_str_lt_inject_001t.js`（lib の複製へ
//       実欠陥を注入）で、あちらは lib の生テキスト anchor を持つため CI 常設にしない。
//       実測: この形の骨抜き 2 種で CI は緑のまま、inject 側は exit 1。
//       **リリース証跡では inject 側も回すこと。**
//
//   ── 骨抜きを塞ぐ pin 10 本（#816 E 受け入れ基準3 ＋ Codex 1巡目 P2 ＋ 反証パネル）──
//   (i)  TARGET 無視     … TARGET-1（sweep が読んだのは run_tests が渡したファイルか）
//                          ＋ TARGET-1b（**既定と異なる一時ファイル**でも sweep が引数へ
//                          追随するか。CI では TARGET が常に既定値と同じで TARGET-1 だけ
//                          では「既定へのハードコード」を落とせないため）
//   (ii) spans 縮退      … PLACE-1（面レクサが壊れて列挙 0 → 0/0 で緑、を落とす）
//   (iii) N 引き下げ     … PLACE-1 の下限は **リテラル 80**（N の値から導出しない）
//   (iv) 挿入文字の差替  … PLACE-2 は個数でなく **U+2028 / U+2029 の実文字**を pin する
//                          （CHARS を別の 2 文字に変えた骨抜きを落とす）
//   (v)  判定そのものを殺す… CONTROL-1H / 1T / 1P / 2 / 2P（陽性対照）。上の (i)〜(iv) は
//                          どれも **sweep が返した数**しか見ないので、判定ループ手前の
//                          `continue` 1 行・申告と実挿入の切り離し・「リテラルだけ切り出して
//                          比べる」最適化（無条件版／`src.length` 分岐版／`sampleN` 分岐版）・
//                          `analyze(mutated)` を `if (hit)` の中へ移す最適化・`faceIntact` の
//                          前半/後半ループを 1 行消す整理・`catch` に `RangeError` 除外
//                          フィルタを足す「フレーク対策」が**全部素通りする**（反証パネル
//                          2026-08-07 / 08 実測。いずれも clean の stdout は byte 一致で
//                          001t 注入も検出しない）。CONTROL 群はこの 9 種を落とす。
//                          落とせないのは `opts` を検出して分岐する 2 種だけ（上の ★）。
//   pin の一覧: TARGET-1 / TARGET-1b / CONTROL-1H / CONTROL-1T / CONTROL-1P /
//              CONTROL-2 / CONTROL-2P / PLACE-1 / PLACE-2 / HIT-0 —— 緑なら PASS=10。
'use strict';
const fs = require('fs');
const path = require('path');
const { sweep, CHARS } = require(path.join(__dirname, 'tools', 'reach_str_lt_sweep.js'));
// 陽性対照（CONTROL-1H/1T/2）が「壊れたオラクル」を組み立てるために使う本物。
const { classifyFaces, analyze: realAnalyze } = require(path.join(__dirname, 'lib', 'reachability.js'));

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

// --- TARGET-1b: 既定と異なる一時ファイルでも sweep が引数へ追随するか -----------
//   CI では TARGET が常に既定値（shogi_v4.html）なので、TARGET-1 だけでは
//   「sweep() が引数を捨てて既定へハードコードする」退行と区別が付かない。
//   実体の異なる一時ファイルを渡し、申告（target / srcLength / spanCount）が
//   その実体と一致することを見る。
//   注意2点（どちらも反証パネル 2026-08-07 の指摘）:
//   - `mkdtempSync` / `writeFileSync` は **try の中**に置く。外に出すと
//     `os.tmpdir()` が書けない CI（読み取り専用・容量ゼロ）で raw stack trace の
//     まま落ち、**本命の HIT-0 が一度も評価されない**。
//   - 判定に `totalHits` を混ぜない。混ぜると 001t 退行が入ったときに、追随は
//     完璧なのに「TARGET を無視する退行も入った」と読める FAIL が出る（誤診）。
{
  const os = require('os');
  const probe = '<!DOCTYPE html>\n<html><body><script>\n'
    + "var p0 = 'probe literal zero';\n"
    + 'var p1 = "probe literal one";\n'
    + '</scr' + 'ipt></body></html>\n';
  let tmpDir = null;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach816e-'));
    const tmpFile = path.join(tmpDir, 'probe.html');
    fs.writeFileSync(tmpFile, probe);
    const r2 = sweep(tmpFile, 2);
    ok(r2.target === tmpFile && r2.srcLength === probe.length && r2.srcLength !== r.srcLength
      && r2.spanCount === 2,
      `TARGET-1b 非既定の一時ファイルへ sweep が追随（解析: ${r2.target} / 長さ ${r2.srcLength}`
      + ` vs 実体 ${probe.length} / リテラル ${r2.spanCount} vs 2）`);
  } catch (e) {
    ok(false, `TARGET-1b 一時ファイルを用意できず検査できなかった（TMPDIR=${require('os').tmpdir()} / ${e && e.message}）`);
  } finally {
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 後始末の失敗で判定を変えない */ } }
  }
}

// --- CONTROL-1H / 1T / 1P / 2 / 2P: 陽性対照（2 つのオラクルは実際に赤を出せるか）----
//   上下の pin はどれも **sweep が返した数**しか見ていない。`placements` は
//   「サンプルした数」であって「判定を回した数」ではないし、`ch` は「挿入したと
//   申告する文字」であって実際に挿入した文字ではない。だから判定ループの手前に
//   `if (true) continue;` を 1 行置くだけで全部素通りする（反証パネル 2026-08-07 実測）。
//   さらに悪いことに、**テストを一切意識していない善意の変更でも同じことが起きる**
//   （すべて反証パネル 2026-08-07 / 08 の実測。いずれも clean の stdout は byte 一致・
//   他の pin は無反応・001t 注入も検出しない）:
//   ① `faceIntact` の**後半ループ 1 行**を「1 文字挿入なら後ろは 1 つずれただけ」と
//      整理して消す → 001t の被害は全部挿入点より後ろなので **80/80 → 0/80**。
//      面配列の長さは常に `src.length` なので、残った長さ検査は本番では永久に false。
//   ② `catch` に `if (!(err instanceof RangeError))` を足して「環境由来のフレーク除外」
//      とする → 例外死型の退行（実測 18/80）が **0/80** に。
//   ③「リテラルだけ切り出して比べる」最適化（無条件版・`src.length` 分岐版とも）。
//   ④ `analyze(mutated)` を `if (hit)` の中へ移す → オラクル2 が本番で一度も走らない。
//      しかも 12.4 秒 → 3.9 秒と**速くなるので改善に見える**。
//
//   そこで **呼び出し側が自分で用意したオラクル**を `sweep()` へ渡し、**それが
//   呼ばれた回数と渡された文字列を自分で数える**。設計の要点は 4 つ:
//   - 対照は **fixture ではなく本番 TARGET**、しかも **`sampleN` も本番と同じ値**で回す。
//     小さい入力・小さい N で回すと、`src.length` や `sampleN` で経路を切り替える
//     （テストを意識していない）最適化に対して無力になる。
//   - **両方のオラクル**に対照を置く（面だけだと ④ が通る）。
//   - 面の対照は **長さを合わせたまま**壊す。長さ違いで済ませると ① を見逃す。
//     さらに **挿入点より前（head）と後ろ（tail）を別々に**壊し、`faceIntact` の
//     2 本のループを 1 本ずつ pin する（片方だけだと消えたもう片方に気付けない）。
//   - 「オラクルが赤を出せたか（CONTROL-1H/1T/2）」と「差し替え口をそもそも通ったか
//     （CONTROL-1P/2P）」を **別々の pin にする**。混ぜると、差し替え口を通らなくなる
//     改造（例: 面を `analyze()` の内部値から再利用するリファクタ）のときに
//     「オラクルが死んだ」と読める FAIL が出て誤診になる。
//   ★ 塞げないもの: **`opts` が渡されたことを検出して分岐する骨抜き**。テストにしか
//     無い経路がある以上、原理的に排除できない（`opts` という語を pin する案は、
//     `const o = arguments[2];` の 1 行で無効化できるうえ、JSDoc 追加・`options` への
//     改名・シグネチャの折り返しといった**挙動を変えない整形で偽赤を出す**ことが
//     実測されたので採らない）。塞げるのは差し替え口を使わない
//     `test/tools/reach_str_lt_inject_001t.js`（lib の複製へ実欠陥を注入）の方で、
//     あちらは lib の生テキスト anchor を持つため CI 常設にしない。
//     **リリース証跡では inject 側も回すこと。**
{
  const CTL_N = SAMPLE_N;                       // ★ 本番と同じ N（sampleN で分岐する骨抜きを塞ぐ）
  const CTL_PLACEMENTS = CTL_N * 2;
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);

  //   原本と変異版の差から「実際に挿入された 1 文字」を復元する。
  //   1 文字挿入以外（長さが合わない・2 箇所以上違う・そもそも別文字列）なら null。
  //   ★ 復元は**受け取った瞬間**に行い、変異文字列そのものは保持しない。
  //     860KB の複製を 80 本×2 本ためると必要ヒープが 16MB → 36MB に跳ね、
  //     `--max-old-space-size` を絞った CI で **要約行を 1 行も出さずに OOM** する
  //     （反証パネル 2026-08-08 実測）。判定に要るのは挿入文字だけ。
  const insertedCharOf = (orig, mut) => {
    if (mut.length !== orig.length + 1) return null;
    let i = 0;
    while (i < orig.length && orig[i] === mut[i]) i++;
    if (orig.slice(i) !== mut.slice(i + 1)) return null;
    return mut[i];
  };
  //   観測した入力が「本番 TARGET へ LS/PS を 1 文字入れたもの」ちょうど expect 件で、
  //   LS と PS が半々か。
  const probeVerdict = (seen, expect) => {
    const nLS = seen.filter((c) => c === LS).length;
    const nPS = seen.filter((c) => c === PS).length;
    const nBad = seen.filter((c) => c === null).length;
    return {
      ok: seen.length === expect && nLS === expect / 2 && nPS === expect / 2 && nBad === 0,
      text: `観測 ${seen.length}/${expect} 件（LS ${nLS} / PS ${nPS}`
        + `・本番 TARGET の 1 文字挿入として復元できなかったもの ${nBad} 件）`,
    };
  };

  try {
    const src0 = fs.readFileSync(TARGET, 'utf8');
    // 面の対照では analyze を軽い代役に差し替える（判定は面オラクルだけで決まるので
    // 結果は変わらず、対照 2 本ぶんの実行時間が約 20 秒減る）。オラクル2 の健全性は
    // 下の CONTROL-2 が本物の経路で見る。
    const stubAnalyze = () => ({ topLevelFunctionCount: r.baseCount, unreachableStatic: [] });

    // --- 陽性対照 1: 面オラクル（head / tail を別々に壊す）----------------------
    //   「本物の面を返すが 1 要素だけ値を反転させる」＝ **長さは正しいまま**中身が違う
    //   レクサ。正しい faceIntact なら必ず不一致＝全配置ヒットになる。
    //   head は挿入点より前の要素、tail は挿入点より後ろの要素を壊すので、
    //   faceIntact の前半ループ・後半ループを 1 本ずつ検査できる。
    const seenLex = [];
    const brokenLexAt = (where) => (s) => {
      if (s === src0) return classifyFaces(s);   // 原本はそのまま（span 列挙は正しく行わせる）
      seenLex.push(insertedCharOf(src0, s));     // ★ wrapper 自身の観測（sweep の申告ではない）
      const f = classifyFaces(s);
      const i = where === 'head' ? 0 : f.length - 1;
      f[i] = f[i] ^ 0xff;
      return f;
    };
    const cH = sweep(TARGET, CTL_N, { classifyFaces: brokenLexAt('head'), analyze: stubAnalyze });
    const cT = sweep(TARGET, CTL_N, { classifyFaces: brokenLexAt('tail'), analyze: stubAnalyze });
    const cHp = cH.chars.reduce((n, c) => n + c.placements, 0);
    const cTp = cT.chars.reduce((n, c) => n + c.placements, 0);
    const v1 = probeVerdict(seenLex, CTL_PLACEMENTS * 2);

    ok(cH.totalHits === CTL_PLACEMENTS && cHp === CTL_PLACEMENTS,
      `CONTROL-1H 面オラクルの陽性対照（挿入点より前）—— 面が違うのにヒットしない配置がある`
      + `（ヒット ${cH.totalHits}/${cHp}・期待 ${CTL_PLACEMENTS}）。`
      + `faceIntact の**前半ループ**が消えている／面比較が常に「無傷」を返す可能性。`);
    ok(cT.totalHits === CTL_PLACEMENTS && cTp === CTL_PLACEMENTS,
      `CONTROL-1T 面オラクルの陽性対照（挿入点より後ろ）—— 面が違うのにヒットしない配置がある`
      + `（ヒット ${cT.totalHits}/${cTp}・期待 ${CTL_PLACEMENTS}）。`
      + `faceIntact の**後半ループ**が消えている可能性。001t の被害はすべて挿入点より`
      + `後ろにあるので、これが落ちているとき本番の検出力は 80/80 → 0/80 になる。`);
    ok(v1.ok,
      `CONTROL-1P 面レクサの差し替え口を本番と同じ形で通っていない —— ${v1.text}。`
      + `**オラクル自体は生きているかもしれない**が、この対照はもう検査できていない`
      + `（判定ループを飛ばした／リテラル断片だけを比べている／面を他所から再利用している）。`);

    // --- 陽性対照 2: 例外オラクル ----------------------------------------------
    //   変異入力に対して必ず throw する analyze。面オラクルは本物のまま（＝ヒット 0）
    //   なので、ここで全配置ヒットになるのは **例外オラクルが実際に走った**ときだけ。
    //   ★ 例外の**クラスを毎回変える**。1 クラスだけだと「RangeError は環境由来なので
    //     ヒットに数えない」型のフィルタが対照を素通りする（実測: 例外死型の検出が
    //     18/80 → 0/80 になるのに CI は緑）。
    const KINDS = [RangeError, TypeError, SyntaxError, Error];
    const seenAnz = [];
    const throwingAnalyze = (s) => {
      if (s === src0) return realAnalyze(s);
      seenAnz.push(insertedCharOf(src0, s));
      throw new KINDS[seenAnz.length % KINDS.length]('CONTROL-2 injected');
    };
    const c2 = sweep(TARGET, CTL_N, { analyze: throwingAnalyze });
    const c2p = c2.chars.reduce((n, c) => n + c.placements, 0);
    const v2 = probeVerdict(seenAnz, CTL_PLACEMENTS);

    ok(c2.totalHits === CTL_PLACEMENTS && c2.totalThrows === CTL_PLACEMENTS && c2p === CTL_PLACEMENTS,
      `CONTROL-2 例外オラクルの陽性対照 —— 必ず throw する analyze を渡したのに`
      + `ヒットしない配置がある（ヒット ${c2.totalHits}/${c2p}・うち例外 ${c2.totalThrows}`
      + `・期待 ${CTL_PLACEMENTS}）。例外を握り潰す／種別で選り分ける改変が入っている可能性。`);
    ok(v2.ok,
      `CONTROL-2P analyze の差し替え口を本番と同じ形で通っていない —— ${v2.text}。`
      + `**オラクル自体は生きているかもしれない**が、この対照はもう検査できていない`
      + `（analyze(mutated) が条件付きになった／呼ばれていない）。`);
  } catch (e) {
    ok(false, `CONTROL-1/2 陽性対照を実行できなかった（${e && e.stack ? e.stack.split('\n')[0] : e}）`);
  }
}

// --- PLACE-1: 実行配置数の下限（spans 縮退・N 引き下げ・文字の間引きを一括で落とす） ---
ok(placements >= MIN_PLACEMENTS,
  `PLACE-1 実行配置数 ${placements} < ${MIN_PLACEMENTS}（面レクサの退行で JS 文字列が列挙できていない／サンプル数が下げられている）`);

// --- PLACE-2: 挿入文字は U+2028 / U+2029 の実文字か -----------------------------
//   個数比較（=== 2）だけでは CHARS を別の 2 文字（極端には空文字）へ差し替えても
//   通ってしまう。モジュールの CHARS と、sweep が「実際に挿入した」と申告する
//   r.chars[].ch の両方を、実文字コードポイントで pin する。
{
  const LS = String.fromCharCode(0x2028); // 生文字もエスケープも置かない（転送・整形での不可視破損を防ぐ）
  const PS = String.fromCharCode(0x2029);
  const codes = (xs) => xs.map((c) => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join(',');
  const moduleChars = CHARS.map((c) => c[1]);
  const usedChars = r.chars.map((c) => c.ch);
  ok(moduleChars.length === 2 && moduleChars[0] === LS && moduleChars[1] === PS
    && usedChars.length === 2 && usedChars[0] === LS && usedChars[1] === PS,
    `PLACE-2 挿入文字は実文字 U+2028 / U+2029 の 2 種（CHARS: ${codes(moduleChars)} / 実挿入: ${codes(usedChars)}）`);
}

// --- HIT-0: 誤検知 0（現行 lib ＋ 原本ならヒット 0） -----------------------------
ok(r.totalHits === 0,
  `HIT-0 文字列リテラルへ LS / PS を 1 文字入れただけで走査が壊れた配置が ${r.totalHits} 件ある`
  + `（001t 型の終端退行。詳細は node test/tools/reach_str_lt_sweep.js ${TARGET} 400）`);
if (r.totalHits > 0) {
  for (const c of r.chars) {
    if (!c.hits) continue;
    // 例外死は面オラクルとは別経路なので分けて出す。混ぜると「関数総数 580 → 580 /
    // 到達不能 0 本」だけが並んで、何も起きていないように読める（反証パネル指摘）。
    if (c.throws > 0) {
      console.log(`  ${c.label}: analyze() が例外死した配置 ${c.throws}/${c.placements}`
        + `（初出 L${c.firstThrow.line} 付近: ${c.firstThrow.message}）`);
    }
    if (c.faceHits > 0) {
      // 到達性の値は analyze() が成功した配置がある場合だけ出す。`worst` の初期値は
      // sentinel（baseCount / L0）なので、面は崩れたが全配置で analyze() も例外死した
      // ケースでこれを出すと測っていない値を実測のように書くことになる（Codex 2巡目 P2）。
      console.log(`  ${c.label}: 面分類が崩れた配置 ${c.faceHits}/${c.placements}`
        + (c.diagSamples > 0
          ? `／最悪の配置で関数総数 ${r.baseCount} → ${c.worst.count}（挿入行 L${c.worst.line} 付近）`
            + `／「到達不能」へ落ちた生きた関数 ${c.killed.length} 本`
            + (c.killed.length ? `（例: ${c.killed.slice(0, 8).join(', ')}）` : '')
          : '／到達性の診断は取れず（該当配置ではすべて analyze() が例外死）'));
    }
  }
}

console.log(`PHASE1-REACH-816E: PASS=${pass} FAIL=${fail} 対象=${r.target} 配置=${placements} ヒット=${r.totalHits}`);
process.exit(fail === 0 ? 0 : 1);
