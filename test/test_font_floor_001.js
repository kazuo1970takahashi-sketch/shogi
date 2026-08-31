#!/usr/bin/env node
// @suite: FONT-FLOOR-001 文字の床15px（宣言側の静的 pin・除外は理由付きの許可表でのみ）
// FONT-FLOOR-001
//   shogi_v4.html の中に「15px 未満の font-size 宣言」が残っていないことを確かめる。
//
//   ★ これは補助の検査である。単体では「宣言が無いこと」しか言えず、
//     ブラウザ既定値（UA stylesheet）で縮む文字（rt{font-size:50%} / small{font-size:smaller}）は
//     1文字も捕まえられない。**描画結果を測る本体は test/e2e/font_floor_001.e2e.js**。
//     この2本はセットでのみ意味を持つ。
//
//   許可表（除外）は 2 種類だけ。どちらも「1件ずつ理由が言えること」を条件にする:
//     ① 星取表 #scoreboard-view 配下 … 実寸据え置き（横に列が多く、床を上げると
//        右の列がさらに画面外へ押し出される。列の見せ方を決める別スライスまで現状維持）
//     ② 印刷/PDF として**別文書**を組み立てる関数 … A4・1ページ収まりを別途調整済み。
//        画面の可読性とは別の制約で決まっているので床の対象外。
//   ふりがな rt は 10px（氏名より小さいことに意味がある）＝許可表ではなく明示の期待値。
//
//   ★ 「許可表に入れれば何でも通る」を防ぐため、各許可枠が**実際に使われている件数**も
//     pin する。関数名が変わって枠が空になれば（＝除外が効かなくなれば）ここで落ちる。
//
//   shogi_v4.html は読むだけ。実データは使わない。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2];
if (!targetPath) { console.error('Usage: node test_font_floor_001.js <html>'); process.exit(1); }
const ABS = path.resolve(targetPath);
const SRC = fs.readFileSync(ABS, 'utf8');
const LINES = SRC.split('\n');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const FLOOR = 15;
const RUBY_PX = 10;

// 印刷/PDF 用に別文書を組み立てる関数（床の対象外・理由は冒頭）
const PRINT_FNS = ['buildPrintResultsHtml', 'printPairings', 'buildReportHtml', 'downloadReport'];
// 星取表（#scoreboard-view）を組み立てる関数（実寸据え置き）
const SB_FNS = ['buildScoreboardClassTableHtml', 'buildScoreboardPlayerViewHtml', 'renderScoreboard'];

// --- 各行がどのトップレベル関数の中にいるか（`^function name(` を辿るだけの近似）
function enclosingFns(lines) {
  const out = new Array(lines.length);
  let cur = '(top)';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^function\s+([A-Za-z0-9_$]+)/);
    if (m) cur = m[1];
    out[i] = cur;
  }
  return out;
}
const FN = enclosingFns(LINES);

// --- 本体 <style> の範囲（最初の <style> 〜 </style>）
const styleStart = LINES.findIndex(l => /<style>/.test(l));
const styleEnd = LINES.findIndex((l, i) => i > styleStart && /<\/style>/.test(l));

// --- font-size:<n>px の宣言を全部拾い、床未満のものを分類する
const DECL = /font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/g;
const violations = [];
const allowed = { scoreboard: [], print: [], ruby: [] };
let totalDecls = 0;

for (let i = 0; i < LINES.length; i++) {
  const ln = i + 1, line = LINES[i];
  let m; DECL.lastIndex = 0;
  while ((m = DECL.exec(line))) {
    totalDecls++;
    const v = parseFloat(m[1]);
    if (v >= FLOOR) continue;

    const inStyle = (ln > styleStart + 1 && ln < styleEnd + 1);
    const selector = inStyle ? line.split('{')[0] : '';
    const isRt = /(^|[\s,>])rt\s*\{/.test(line) || /\brt\{/.test(line) || /<rt/.test(line);

    if (inStyle && /(^|,)\s*[^,{]*(\.sb-|#scoreboard-view)/.test(selector)) { allowed.scoreboard.push(ln); continue; }
    if (!inStyle && SB_FNS.indexOf(FN[i]) >= 0) { allowed.scoreboard.push(ln); continue; }
    if (!inStyle && PRINT_FNS.indexOf(FN[i]) >= 0) { allowed.print.push(ln); continue; }
    if (isRt && v === RUBY_PX) { allowed.ruby.push(ln); continue; }

    violations.push({ ln: ln, px: v, fn: FN[i], text: line.trim().slice(0, 90) });
  }
}

console.log('FONT-FLOOR-001 静的 pin');
assert(totalDecls > 400, '対象を実際に走査している（font-size 宣言 ' + totalDecls + ' 件を読んだ）');
assert(styleStart >= 0 && styleEnd > styleStart, '本体 <style> の範囲を特定できた（' + (styleStart + 1) + '〜' + (styleEnd + 1) + '行）');

assert(violations.length === 0,
  FLOOR + 'px 未満の font-size 宣言が無い（許可表の外で ' + violations.length + ' 件'
  + (violations.length ? '\n      ' + violations.slice(0, 8).map(v => v.ln + ' [' + v.px + 'px] (' + v.fn + ') ' + v.text).join('\n      ') : '') + '）');

// --- 許可枠が空洞化していないこと（関数名の改名・セレクタの消滅で除外が死ぬのを検出）
assert(allowed.scoreboard.length > 0, '許可枠①星取表が実際に使われている（' + allowed.scoreboard.length + ' 件）');
assert(allowed.print.length > 0, '許可枠②印刷/PDF が実際に使われている（' + allowed.print.length + ' 件）');
assert(allowed.ruby.length > 0, 'ふりがな rt の ' + RUBY_PX + 'px 指定が在る（' + allowed.ruby.length + ' 件）');

// --- 許可表に挙げた関数が実在すること（存在しない名前を並べて安心するのを防ぐ）
PRINT_FNS.concat(SB_FNS).forEach(function (name) {
  assert(new RegExp('^function\\s+' + name + '\\s*\\(', 'm').test(SRC), '許可表の関数 ' + name + ' が実在する');
});

// --- ② 単位の検査（Codex P2-②）: px 以外の font-size 値を、免除枠の外では拒否する
//   1巡目の px 専用スキャンは `font-size:.5em` への差し替えで**緑のまま通った**（Codex が変異で実証）。
//   「変異で赤にできること」（ブリーフ §5.2）がこの経路で成立していなかったので、
//   値の形そのものを検査する: `<数値>px` 以外（em / rem / % / calc() / smaller 等キーワード）は
//   星取表スコープ・印刷/PDF 関数の中でしか許さない。
//   ★ コメントの中の言及（例: 「ブラウザ既定の rt{font-size:50%}」の説明コメント）は数えない。
//     CSS ブロックは /* */ の継続状態を追って剥がしてから走査する（#798 で踏んだ誤判定の教訓）。
const VAL = /font-size\s*:\s*([^;"'}]+?)\s*(?=[;"'}])/g;
const unitViolations = [];
const allowedNonPx = { scoreboard: [], print: [] };
let inCssComment = false;
for (let i = 0; i < LINES.length; i++) {
  const ln = i + 1;
  const inStyle = (ln > styleStart + 1 && ln < styleEnd + 1);
  let line = LINES[i];
  if (inStyle) {
    // CSS ブロック: /* */ を（複数行の継続も含めて）剥がす
    let out = '';
    let rest = line;
    while (rest.length) {
      if (inCssComment) {
        const close = rest.indexOf('*/');
        if (close < 0) { rest = ''; break; }
        rest = rest.slice(close + 2); inCssComment = false;
      } else {
        const open = rest.indexOf('/*');
        if (open < 0) { out += rest; rest = ''; break; }
        out += rest.slice(0, open); rest = rest.slice(open + 2); inCssComment = true;
      }
    }
    line = out;
  } else {
    // JS 領域: 行コメント以降は数えない（文字列リテラル内の // URL は本ファイルの走査対象文脈に無い）
    const sl = line.indexOf('//');
    if (sl >= 0 && !/https?:\/\//.test(line.slice(0, sl + 8))) line = line.slice(0, sl);
  }
  let m; VAL.lastIndex = 0;
  while ((m = VAL.exec(line))) {
    const v = m[1].trim();
    if (/^[0-9]+(?:\.[0-9]+)?px$/.test(v)) continue;   // px は上の床検査が見る
    const selector = inStyle ? line.split('{')[0] : '';
    if (inStyle && /(^|,)\s*[^,{]*(\.sb-|#scoreboard-view)/.test(selector)) { allowedNonPx.scoreboard.push(ln); continue; }
    if (!inStyle && SB_FNS.indexOf(FN[i]) >= 0) { allowedNonPx.scoreboard.push(ln); continue; }
    if (!inStyle && PRINT_FNS.indexOf(FN[i]) >= 0) { allowedNonPx.print.push(ln); continue; }
    unitViolations.push({ ln: ln, val: v, fn: FN[i], text: line.trim().slice(0, 90) });
  }
}
assert(unitViolations.length === 0,
  'px 以外の font-size 値が免除枠の外に無い（em/rem/%/calc/キーワード拒否・実測 ' + unitViolations.length + ' 件'
  + (unitViolations.length ? '\n      ' + unitViolations.slice(0, 6).map(v => v.ln + ' [' + v.val + '] (' + v.fn + ') ' + v.text).join('\n      ') : '') + '）');
assert(allowedNonPx.scoreboard.length > 0 && allowedNonPx.print.length > 0,
  '非 px の免除枠も実際に使われている（星取表 ' + allowedNonPx.scoreboard.length + ' 件・印刷 ' + allowedNonPx.print.length + ' 件＝枠の空洞化検出）');

// --- ① input は type を問わず 16px 以上（Codex P2-①）
//   E2E のテキストノード走査ではフォーム部品の文字を測れない（input はテキスト子ノードを持たない）ので、
//   静的側で担保する。inline style の font-size を持つ <input> 全種を走査する。
//   base 時点で mi-file / p2-file の 2 箇所が 14px＝**元から §10.1 違反だった**（本 PR が作った違反ではない）。
{
  const INPUT_TAG = /<input\b[^>]*>/g;
  const badInputs = []; let inputsWithFs = 0;
  for (let i = 0; i < LINES.length; i++) {
    let m; INPUT_TAG.lastIndex = 0;
    while ((m = INPUT_TAG.exec(LINES[i]))) {
      const tag = m[0];
      const fs = tag.match(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/);
      if (!fs) continue;
      inputsWithFs++;
      if (parseFloat(fs[1]) < 16) badInputs.push({ ln: i + 1, px: fs[1], tag: tag.slice(0, 80) });
    }
  }
  assert(inputsWithFs > 0, 'inline font-size 付きの <input> を実際に走査している（' + inputsWithFs + ' 件）');
  assert(badInputs.length === 0,
    '<input> は type を問わず inline font-size 16px 以上（§10.1 は type=file を除外していない・実測 '
    + badInputs.length + ' 件' + (badInputs.length ? ' → ' + JSON.stringify(badInputs.slice(0, 3)) : '') + '）');
}

// --- ふりがな rt が「小さいまま」でないこと（.55em / .6em の残骸は星取表の据え置き1件だけ）
const emRt = [];
for (let i = 0; i < LINES.length; i++) {
  if (/font-size\s*:\s*\.(?:55|6)em/.test(LINES[i])) emRt.push({ ln: i + 1, fn: FN[i], text: LINES[i].trim().slice(0, 80) });
}
const emRtOutside = emRt.filter(x => PRINT_FNS.indexOf(x.fn) < 0 && !/#scoreboard-view/.test(x.text));
assert(emRtOutside.length === 0,
  'em 指定の小さい rt は画面側に残っていない（残るのは印刷用と星取表の据え置きのみ・実測 '
  + emRt.length + ' 件中 画面側 ' + emRtOutside.length + ' 件'
  + (emRtOutside.length ? ' → ' + JSON.stringify(emRtOutside.slice(0, 3)) : '') + '）');

// --- 入力欄の 16px（iOS フォーカス時の自動ズーム防止・STYLE-GUIDE §10.1）を床上げで壊していないこと
[
  ['input[type=text]', /input\[type=text\]\{[^}]*font-size:16px/],
  ['select', /\nselect\{[^}]*font-size:16px/],
  ['.sel-sm', /\.sel-sm\{[^}]*font-size:16px/],
  ['.app-modal-input', /\.app-modal-input\{[^}]*font-size:16px/],
  ['.rep-form input/select/textarea', /\.rep-form input,\.rep-form select,\.rep-form textarea\{[^}]*font-size:16px/],
  ['.sb-search', /\.sb-search\{[^}]*font-size:16px/]
].forEach(function (pair) {
  assert(pair[1].test(SRC), '入力欄 ' + pair[0] + ' は 16px のまま（iOS 自動ズーム防止 §10.1）');
});

// --- 選手名ボタンは 17px（ブリーフ §1-3）
const wb = SRC.match(/\.winner-btn\{[^}]*font-size:(\d+)px/g) || [];
assert(wb.length === 2 && wb.every(s => /font-size:17px/.test(s)),
  '.winner-btn は既定・@media とも 17px（実測 ' + JSON.stringify(wb.map(s => (s.match(/font-size:\d+px/) || [])[0])) + '）');

// --- 自己検査: 検査器が壊れていないこと（違反を仕込んだ文字列で必ず捕まえる）
(function selfCheck() {
  const injected = LINES.slice();
  injected[styleEnd - 1] = '.self-check-probe{font-size:12px}';
  const fn2 = enclosingFns(injected);
  let found = 0;
  for (let i = 0; i < injected.length; i++) {
    let m; DECL.lastIndex = 0;
    while ((m = DECL.exec(injected[i]))) {
      if (parseFloat(m[1]) >= FLOOR) continue;
      const ln = i + 1;
      const inStyle = (ln > styleStart + 1 && ln < styleEnd + 1);
      const selector = inStyle ? injected[i].split('{')[0] : '';
      const isRt = /\brt\{/.test(injected[i]);
      if (inStyle && /(^|,)\s*[^,{]*(\.sb-|#scoreboard-view)/.test(selector)) continue;
      if (!inStyle && SB_FNS.indexOf(fn2[i]) >= 0) continue;
      if (!inStyle && PRINT_FNS.indexOf(fn2[i]) >= 0) continue;
      if (isRt && parseFloat(m[1]) === RUBY_PX) continue;
      if (/self-check-probe/.test(injected[i])) found++;
    }
  }
  assert(found === 1, '自己検査: 仕込んだ 12px 宣言を検査器が捕まえる（実測 ' + found + ' 件）');
})();

console.log('\nFONT-FLOOR-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail > 0 ? 1 : 0);
