'use strict';
// =============================================================================
// PHASE1-REACH-001: shogi_v4.html の到達可能性スキャナ（ライブラリ・純 node / 依存ゼロ）
// -----------------------------------------------------------------------------
// Issue #798 の調査で使った走査ロジックを常設化したもの。実行は
// test/test_reachability_001.js（run_tests.sh の自動発見で CI にも載る）。
//
// このファイルは `test_*.js` に一致しないので run_tests.sh からは直接実行されない
// ＝ライブラリとしてのみ読み込まれる。
//
// 提供する検査は 2 つ:
//
//   検査1（静的到達可能性）
//     トップレベル `function NAME(` に対し、ルート（HTML のインライン
//     イベントハンドラ属性 ＋ DOMContentLoaded 等のスクリプト直下の文）からの
//     **推移的**到達可能性を計算する。
//
//   検査2（実行時到達可能性 ＝ bind 先の実在 ＋ 起動経路の実在）
//     (a) getElementById / querySelector(All) の引数に出る id / class のうち、
//         その id / class を**どこでも生成していない**もの
//     (b) 要素は実在するが、それを**起動する唯一のコードが到達不能**なもの
//     を検出し、そこに結線されたハンドラを「実行時に到達しない」として静的到達
//     可能性から差し引く。
//
// #798 で実際に踏んだ 3 つの罠を、この実装は構造的に回避している:
//
//   (1) コメント内の言及を参照に数えない。
//       数えると finalizeAddPastParticipants が「生きている」と誤判定される
//       （HTML コメント + JS コメントで計 8 箇所言及されている）。
//       → 文字クラス 'X'（JS コメント / HTML コメント / <style>）は参照から除外する。
//
//   (2) JS 文字列内の "<script>" で走査領域を二重化しない。
//       得点表ポップアップ生成用に JS 文字列の中へ "<script>" が入っており、
//       単純な全文検索だと同じ領域を 2 回走査して参照数が 5〜10 倍に膨張する。
//       → </script> の直後から次を探す逐次スキャンにしている。
//
//   (3) 「定義以外の出現 0 回」方式は使わない。
//       それでは finalizeAddPastParticipants（呼び出し元が 1 つだけ存在し、その
//       呼び出し元自身が死んでいる）を拾えない。
//       → 呼び出しグラフ＋ルートからの到達可能性で判定する。
//
// PHASE1-REACH-001b で塞いだ穴（Codex P1 ×2 / cowork 再現）:
//
//   (4) 文字列リテラル内の識別子を参照に数えない。
//       初版は罠(1) と同じ形の穴を文字列側に残していた。L9199-9200 の
//         consoleTag:'SAVE-003: startTournament の保存が確認できませんでした ...'
//       という**ログ用の文字列**が呼出辺として数えられ、到達不能な
//       startTournament() が「生きている」と誤判定されていた。
//       → 文字クラス 'S'（文字列 / テンプレート文字列部 / 正規表現リテラル）も
//         参照から除外する。数え漏らしを避けるため件数は stringRefs に残す。
//
//   (5) 連結セレクタ getElementById('prefix_'+x) を取りこぼさない。
//       → 接頭辞リテラル + '+' の形を 'id-prefix' として拾い、接頭辞での
//         照合で生成側の実在を確認する。完全な式解析はしない。
//
// PHASE1-REACH-001c で塞いだ穴（cowork 反証パネル 高1-高5 / #799 コメント ①-④）:
//
//   (6) HTML 側にも同じ判定を入れる【高1】。
//       初版は <script> の外の全バイトを「参照」として数えていた。id / class /
//       data-* / テキストノードに関数名と同じトークンが出るだけでルートになる。
//         <span class="save-warn-pill">  →  save() が永久に「生きている」
//       `data-x="<死んだ関数名>-pill"` を 1 つ足すだけで死にコードが検出から
//       消える（cowork 実測: 静的到達不能 30 → 26）。
//       → HTML マークアップは文字クラス 'M'（数えない）。**インライン
//         イベントハンドラ属性（on*=）の値の中だけ**を 'H'（参照）にする。
//
//   (7) 文字列の中の on*= は参照に戻す【高3】。
//       (4) で文字列を丸ごと参照から外したのは行き過ぎだった。
//         insertAdjacentHTML('beforeend','<button onclick="foo()">go</button>')
//       は DOM に入れば実際に発火する。罠(4) が塞ぎたかったのは「ログ文言や
//       ID に名前が出てくる」ケースであって、これは別物。
//       → on*= の値の走査は HTML / JS 文字列 / テンプレートリテラルを区別せず
//         ソース全体に対して行い、当たった範囲を 'H' に上書きする。
//
//   (8) 「起動経路が無い」を扱う【高2】。
//       loadData は <input type="file" id="loadFile" style="display:none"> の
//       change に結線されている。利用者は押せず（<label for> も無い）、唯一の
//       起動経路 document.getElementById('loadFile').click() は到達不能な
//       openLoadModal の中にある。要素が実在するので (a) では拾えなかった。
//       → 「押せない要素 ＋ 起動サイトがすべて到達不能」を死んだ結線として扱う。
//
//   (9) 死んだ領域の終端を「次のセレクタ呼び出し」で決めない【高4・高5】。
//       初版は終端を /document\.(getElementById|querySelector...)/ でしか切らず、
//         - document. の付かない pane.querySelector(...) / $id(...) を終端に
//           数えられず、死んだ領域が次の結線ブロックを飲み込む（実行時到達不能
//           9 → 35 件で FAIL）
//         - 無名関数の中（ownerOf===null）では領域がファイル末尾まで伸び、
//           起動シーケンス全体が死亡扱いになる（77 件爆発・allowlist でも
//           逃げられない）
//       → 領域は**文（statement）単位**で決める。`var x=<selector>(...)` なら
//         その文 ＋ x を参照する後続の連続した文まで。チェーン呼び出しなら
//         その文だけ。位置ベースの「次のセレクタまで」は廃止した。
//
//   (10) セレクタ・ヘルパ（$id 等）を認識する【高4】。
//       `function $id(id){return document.getElementById(id);}` に抽出する定番
//       リファクタで結線の検出そのものが消えないよう、1 引数の薄いラッパを
//       セレクタの別名として登録し、$id('x') も結線として拾う。
//
// 参照検出は「コード上の識別子として現れるもの」（C ＝ JS コード本体、
// H ＝ インラインイベントハンドラ属性の値）に限る。散文（X）・文字列（S）・
// HTML マークアップ（M）は参照ではない。
// =============================================================================

// 文字クラス。ファイルの全バイトにいずれか 1 つが付く。
const H = 72; // 'H' インラインイベントハンドラ属性 on*= の値      → 参照として数える
const C = 67; // 'C' JS コード本体                                 → 参照として数える
const S = 83; // 'S' 文字列 / テンプレート文字列部 / 正規表現       → 数えない（罠(4)）
const X = 88; // 'X' JS コメント・HTML コメント・<style>            → 数えない（罠(1)）
const M = 77; // 'M' HTML マークアップ（タグ・属性名・id/class 値・テキスト）→ 数えない（罠(6)）

// 連結セレクタの接頭辞として扱う最小長。'wb_' / 'rep-' 等が下限。
// これより短い接頭辞は照合の意味が薄く、誤検出の元になるので採らない。
const MIN_SELECTOR_PREFIX = 3;

// インラインイベントハンドラ属性。`on` + 3 文字以上（最短は oncut）。
// 属性名を列挙しないのは、未知のイベント名（onpointerdown 等）を参照として
// 数え損ねると「生きている関数を死んだと言う」＝偽陽性の方向に倒れるため。
const ON_ATTR_RE = /\bon[a-z]{3,}\s*=\s*(\\?)(["'])/g;

// 要素を取得する DOM API。受け手（document. / pane. / 無し）は問わない。
const SELECTOR_METHODS = ['getElementById', 'querySelectorAll', 'querySelector'];

// 要素を「起動」する API。これが無ければ、押せない要素は永久に発火しない。
const ACTIVATION_RE = /\.\s*(?:click|showPicker)\s*\(|\.\s*dispatchEvent\s*\(/;

const IDSTART = /[A-Za-z_$]/;
const IDCHAR = /[A-Za-z0-9_$]/;

// 正規表現リテラル判定で「直前が値ではない」ことを示すキーワード。
const KW_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);

const PUNCT_BEFORE_REGEX = '([{,;:=!&|?+-*%~^<>';

// 文の終端判定で「ブロックの後ろに続く＝まだ同じ文」を示すキーワード。
const KW_CONTINUES_STATEMENT = new Set(['else', 'catch', 'finally', 'while']);

function isIdStart(ch) { return IDSTART.test(ch); }
function isIdChar(ch) { return IDCHAR.test(ch); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// -----------------------------------------------------------------------------
// <script> ブロックの切り出し（逐次スキャン＝罠(2)の回避）
// -----------------------------------------------------------------------------
function findScriptBlocks(src) {
  const blocks = [];
  const re = /<script([^>]*)>/g;
  let cursor = 0;
  for (;;) {
    re.lastIndex = cursor;
    const m = re.exec(src);
    if (!m) break;
    const attrs = m[1];
    const start = m.index + m[0].length;
    let end = src.indexOf('</script>', start);
    if (end === -1) end = src.length;
    cursor = end + '</script>'.length; // ← 次の探索は必ず閉じタグの後ろから
    if (attrs.indexOf('src=') >= 0) continue;
    if (attrs.indexOf('type=') >= 0 && attrs.indexOf('javascript') < 0) continue;
    blocks.push({ start, end });
  }
  return blocks;
}

// -----------------------------------------------------------------------------
// 字句解析: 文字クラス付与 ＋ トップレベル関数（brace depth 0）の本体スパン抽出
// -----------------------------------------------------------------------------
function lexBlock(text, base, cls, out) {
  const n = text.length;
  let i = 0;
  let depth = 0;
  let last = null;        // 直前の有意トークン（正規表現リテラル判定用）
  let pending = null;     // 本体 '{' を待っている深さ0の関数宣言
  const openStack = [];

  for (let k = 0; k < n; k++) cls[base + k] = C;

  const mark = (a, b, v) => { for (let k = a; k < b; k++) cls[base + k] = v; };

  while (i < n) {
    const ch = text[i];

    // 行コメント
    if (ch === '/' && i + 1 < n && text[i + 1] === '/') {
      let j = text.indexOf('\n', i);
      if (j === -1) j = n;
      mark(i, j, X);
      i = j;
      continue;
    }
    // ブロックコメント
    if (ch === '/' && i + 1 < n && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2);
      j = (j === -1) ? n : j + 2;
      mark(i, j, X);
      i = j;
      continue;
    }
    // 正規表現リテラル or 除算
    if (ch === '/') {
      const regexOk = last === null
        || (last.length === 1 && PUNCT_BEFORE_REGEX.indexOf(last) >= 0)
        || KW_BEFORE_REGEX.has(last)
        || last === '=>';
      if (regexOk) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < n) {
          const c = text[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { closed = true; break; }
          else if (c === '\n') break;
          j++;
        }
        if (closed) {
          let k = j + 1;
          while (k < n && isIdChar(text[k])) k++; // フラグ
          mark(i, k, S);
          i = k;
          last = 'regex';
          continue;
        }
      }
      last = '/';
      i++;
      continue;
    }
    // 文字列リテラル
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === q || text[j] === '\n') break;
        j++;
      }
      const end = Math.min(j + 1, n);
      mark(i, end, S);
      i = end;
      last = 'str';
      continue;
    }
    // テンプレートリテラル（${ } の内側はコード、外側は文字列）
    if (ch === '`') {
      let j = i + 1;
      let td = 0;
      let seg = i + 1;
      while (j < n) {
        const c = text[j];
        if (c === '\\') { j += 2; continue; }
        if (td === 0 && c === '`') break;
        if (td === 0 && c === '$' && j + 1 < n && text[j + 1] === '{') {
          mark(seg, j, S);
          td = 1;
          j += 2;
          continue;
        }
        if (td > 0) {
          if (c === '{') td++;
          else if (c === '}') { td--; if (td === 0) seg = j + 1; }
        }
        j++;
      }
      if (td === 0) mark(seg, Math.min(j, n), S);
      i = j + 1;
      last = 'tmpl';
      continue;
    }
    // 波括弧（深さ追跡＝トップレベル判定の根拠）
    if (ch === '{') {
      if (depth === 0 && pending) {
        openStack.push({
          name: pending.name, namePos: pending.namePos,
          parenStart: pending.parenStart, parenEnd: pending.parenEnd, bodyStart: i,
        });
        pending = null;
      }
      depth++;
      last = '{';
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0 && openStack.length) {
        const f = openStack.pop();
        out.topFunctions.push({
          name: f.name,
          namePos: f.namePos + base,
          params: paramNames(text.slice(f.parenStart + 1, f.parenEnd)),
          bodyStart: f.bodyStart + base,
          bodyEnd: i + base,
        });
      }
      last = '}';
      i++;
      continue;
    }
    // 識別子
    if (isIdStart(ch)) {
      let j = i;
      while (j < n && isIdChar(text[j])) j++;
      const w = text.slice(i, j);
      if (w === 'function') {
        let k = j;
        while (k < n && (text[k] === ' ' || text[k] === '\t' || text[k] === '\n')) k++;
        if (k < n && isIdStart(text[k])) {
          let k2 = k;
          while (k2 < n && isIdChar(text[k2])) k2++;
          let k3 = k2;
          while (k3 < n && (text[k3] === ' ' || text[k3] === '\t' || text[k3] === '\n')) k3++;
          if (k3 < n && text[k3] === '(') {
            const nm = text.slice(k, k2);
            out.allFunctionDecls.push({ name: nm, namePos: k + base, depth });
            if (depth === 0) {
              const pe = matchParen(text, k3);
              pending = { name: nm, namePos: k, parenStart: k3, parenEnd: pe };
            }
          }
        }
      }
      last = w;
      i = j;
      continue;
    }
    if (!/\s/.test(ch)) last = ch;
    i++;
  }
}

function matchParen(text, open) {
  let d = 0;
  for (let p = open; p < text.length; p++) {
    if (text[p] === '(') d++;
    else if (text[p] === ')') { d--; if (d === 0) return p; }
  }
  return open;
}

function paramNames(raw) {
  return raw.split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s));
}

// -----------------------------------------------------------------------------
// 罠(6)(7): インラインイベントハンドラ属性の値だけを参照（H）に昇格する
//   HTML の on*="NAME()" と、JS 文字列で組み立てた '<b onclick="NAME()">' の
//   両方を同じ規則で拾う（後者は文字列 S の上に H を重ねる）。
//   属性名・id/class の値・テキストノードは M のまま＝参照ではない。
// -----------------------------------------------------------------------------
function markInlineHandlerValues(src, cls) {
  const marked = [];
  for (const m of src.matchAll(ON_ATTR_RE)) {
    const at = m.index;
    if (cls[at] === X) continue;                 // コメント内のサンプルコード
    const esc = m[1];                            // JS 文字列内の \" 形式
    const quote = m[2];
    const valueStart = at + m[0].length;
    const close = esc + quote;
    const valueEnd = src.indexOf(close, valueStart);
    if (valueEnd === -1) continue;
    // 属性値は 1 行に収まる。改行をまたぐものは属性ではない（暴走防止）。
    if (src.slice(valueStart, valueEnd).indexOf('\n') >= 0) continue;
    for (let k = valueStart; k < valueEnd; k++) {
      if (cls[k] === M || cls[k] === S) cls[k] = H;
    }
    marked.push({ pos: at, start: valueStart, end: valueEnd });
  }
  return marked;
}

// -----------------------------------------------------------------------------
// 文（statement）の走査 — 死んだ領域の終端を決める土台【罠(9)】
// -----------------------------------------------------------------------------
function prevCodePos(src, cls, from) {
  let p = from;
  while (p >= 0 && (cls[p] !== C || /\s/.test(src[p]))) p--;
  return p;
}

function nextCodePos(src, cls, from) {
  let p = from;
  while (p < src.length && (cls[p] !== C || /\s/.test(src[p]))) p++;
  return p < src.length ? p : -1;
}

function wordBefore(src, cls, from) {
  const p = prevCodePos(src, cls, from);
  if (p < 0 || !isIdChar(src[p])) return { word: null, start: p + 1 };
  let q = p;
  while (q >= 0 && isIdChar(src[q])) q--;
  return { word: src.slice(q + 1, p + 1), start: q + 1 };
}

function wordAt(src, cls, from) {
  const p = nextCodePos(src, cls, from);
  if (p < 0 || !isIdStart(src[p])) return null;
  let q = p;
  while (q < src.length && isIdChar(src[q])) q++;
  return src.slice(p, q);
}

// from から始まる 1 文の終端（排他）を返す。C 以外のバイトは構造として読まない。
function statementEnd(src, cls, from) {
  let depth = 0;
  let blockBrace = false;   // 深さ 0→1 の '{' が文ブロックか（object literal ではないか）
  for (let p = from; p < src.length; p++) {
    if (cls[p] !== C) continue;
    const ch = src[p];
    if (ch === '(' || ch === '[') { depth++; continue; }
    if (ch === '{') {
      if (depth === 0) {
        const { word } = wordBefore(src, cls, p - 1);
        const prev = prevCodePos(src, cls, p - 1);
        const prevCh = prev >= 0 ? src[prev] : '';
        blockBrace = prevCh === ')' || prevCh === '}' || prevCh === ';'
          || (word !== null && KW_CONTINUES_STATEMENT.has(word))
          || word === 'do' || word === 'try';
      }
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']') { if (depth === 0) return p; depth--; continue; }
    if (ch === '}') {
      if (depth === 0) return p;                       // 囲みブロックの終端
      depth--;
      if (depth === 0 && blockBrace) {
        const nw = wordAt(src, cls, p + 1);
        if (nw !== null && KW_CONTINUES_STATEMENT.has(nw)) { blockBrace = false; continue; }
        return p + 1;
      }
      continue;
    }
    if (ch === ';' && depth === 0) return p + 1;
  }
  return src.length;
}

// end の次に来る文の開始位置。同じブロックに文が無ければ -1。
function nextStatementStart(src, cls, end) {
  const p = nextCodePos(src, cls, end);
  if (p < 0) return -1;
  if (src[p] === '}' || src[p] === ')' || src[p] === ']') return -1;
  return p;
}

function rangeReferences(src, cls, a, b, name) {
  const re = new RegExp('(?<![A-Za-z0-9_$])' + escapeRe(name) + '(?![A-Za-z0-9_$])', 'g');
  const chunk = src.slice(a, b);
  for (const m of chunk.matchAll(re)) {
    if (cls[a + m.index] === C) return true;
  }
  return false;
}

// pos にあるセレクタ呼び出しが `var NAME = ...` の右辺なら、その変数名と文頭を返す。
function assignedVarAt(src, cls, pos) {
  // 受け手のチェーン（document. / pane. 等）を読み飛ばす
  let p = pos - 1;
  for (;;) {
    p = prevCodePos(src, cls, p);
    if (p < 0) return null;
    if (src[p] === '.' || isIdChar(src[p])) { p--; continue; }
    break;
  }
  if (src[p] !== '=') return null;
  const before = src[p - 1];
  if (before === '=' || before === '!' || before === '<' || before === '>') return null;
  const v = wordBefore(src, cls, p - 1);
  if (v.word === null || !isIdStart(v.word[0])) return null;
  let stmtStart = v.start;
  const kw = wordBefore(src, cls, v.start - 1);
  if (kw.word === 'var' || kw.word === 'let' || kw.word === 'const') stmtStart = kw.start;
  return { name: v.word, stmtStart };
}

// -----------------------------------------------------------------------------
// 検査2-a: どこでも生成されていない id / class を検出する
//   判定は「セレクタ引数以外の位置に、コメント外で 1 度でも出現するか」。
//   出現しなければ、その要素は DOM に存在しえない＝そこに結線したハンドラは発火しない。
//
//   連結セレクタ getElementById('prefix_'+x) は 'id-prefix' として扱い、**接頭辞**で
//   照合する（罠(5)）。式の完全な評価はしない。
//
//   受け手は問わない（document.getElementById / pane.querySelector / $id）。
//   $id 等の 1 引数ラッパは detectSelectorAliases が別名として登録する【罠(10)】。
// -----------------------------------------------------------------------------
function selectorLabel(f) {
  if (f.kind === 'class') return '.' + f.key;
  if (f.kind === 'id-prefix') return '#' + f.key + '*';
  return '#' + f.key;
}

// `function $id(id){return document.getElementById(id);}` のような 1 引数の薄い
// ラッパをセレクタの別名として登録する。定番リファクタで結線の検出そのものが
// 消えないようにするため（受け入れ基準4）。
function detectSelectorAliases(src, topFunctions) {
  const aliases = [];
  for (const f of topFunctions) {
    if (f.params.length !== 1) continue;
    const body = src.slice(f.bodyStart + 1, f.bodyEnd);
    if (body.length > 200) continue;
    const m = /^\s*return\s+[A-Za-z0-9_$.]*\.?(getElementById|querySelectorAll|querySelector)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)\s*;?\s*$/.exec(body);
    if (!m) continue;
    if (m[2] !== f.params[0]) continue;
    aliases.push({ name: f.name, method: m[1] });
  }
  return aliases;
}

function detectDeadBindings(src, cls, aliases) {
  const found = [];
  const seen = new Set();

  const scan = (re, kind, quote) => {
    for (const m of src.matchAll(re)) {
      const key = m[1];
      if (cls[m.index] === X) continue; // コメント内のサンプルコードは対象外
      if (kind === 'id-prefix' && key.length < MIN_SELECTOR_PREFIX) continue;
      // 引用符ごと探す＝'getElementById' 自身の部分文字列に当たらない
      const rel = m[0].indexOf(quote + key);
      if (rel < 0) continue;
      const argStart = m.index + rel + quote.length;
      found.push({ kind, key, pos: m.index, argStart, argEnd: argStart + key.length });
    }
  };
  // getElementById 系（引数がそのまま id）
  const scanById = (name) => {
    const n = escapeRe(name);
    scan(new RegExp(n + "\\(\\s*'([^']+)'\\s*\\)", 'g'), 'id', "'");
    scan(new RegExp(n + '\\(\\s*"([^"]+)"\\s*\\)', 'g'), 'id', '"');
    // 連結セレクタ（罠(5)）
    scan(new RegExp(n + "\\(\\s*'([^']*)'\\s*\\+", 'g'), 'id-prefix', "'");
    scan(new RegExp(n + '\\(\\s*"([^"]*)"\\s*\\+', 'g'), 'id-prefix', '"');
  };
  // querySelector 系（単純な単一クラス / 単一 id セレクタのみ扱う）
  const scanByCss = (name) => {
    const n = escapeRe(name);
    scan(new RegExp(n + "\\(\\s*'\\.([A-Za-z0-9_-]+)'\\s*\\)", 'g'), 'class', "'.");
    scan(new RegExp(n + '\\(\\s*"\\.([A-Za-z0-9_-]+)"\\s*\\)', 'g'), 'class', '".');
    scan(new RegExp(n + "\\(\\s*'#([A-Za-z0-9_-]+)'\\s*\\)", 'g'), 'id', "'#");
    scan(new RegExp(n + '\\(\\s*"#([A-Za-z0-9_-]+)"\\s*\\)', 'g'), 'id', '"#');
  };
  scanById('getElementById');
  scanByCss('querySelectorAll');
  scanByCss('querySelector');
  for (const a of aliases) {
    if (a.method === 'getElementById') scanById(a.name);
    else scanByCss(a.name);
  }

  // 「セレクタ引数そのもの」の位置は生成ではない。接頭辞照合は他キーのセレクタ引数
  // （例: 接頭辞 'pane-' が getElementById('pane-A') の引数に現れる）にも当たるので、
  // キー別ではなく全セレクタ引数を除外範囲にする。
  const allRanges = found.map((f) => [f.argStart, f.argEnd]).sort((a, b) => a[0] - b[0]);
  const inSelectorArg = (p) => allRanges.some(([a, b]) => p >= a && p < b);

  for (const f of found) {
    const kk = f.kind + ':' + f.key;
    if (seen.has(kk)) continue;
    // 完全一致（id / class）は語境界つき。id / class は '-' を含むので境界に '-' も入れる。
    // 接頭辞は語の途中で切れる（'helpBtnFirstRound_' の直後に動的な値が続く）ため
    // 後ろの境界を課さない＝生の部分文字列で照合する。
    const re = (f.kind === 'id-prefix')
      ? new RegExp(escapeRe(f.key), 'g')
      : new RegExp('(?<![A-Za-z0-9_$-])' + escapeRe(f.key) + '(?![A-Za-z0-9_$-])', 'g');
    let produced = 0;
    for (const m of src.matchAll(re)) {
      const p = m.index;
      if (cls[p] === X) continue;                                  // コメント / CSS は生成ではない
      if (inSelectorArg(p)) continue;                              // セレクタ引数そのもの
      produced++;
    }
    if (produced === 0) {
      seen.add(kk);
      f.selector = selectorLabel(f);
      f.reason = 'not-produced';
      f.dead = true;
    }
  }
  return found.filter((f) => f.dead);
}

// -----------------------------------------------------------------------------
// 検査2-b: 起動経路が無い結線【罠(8)】
//   対象は「利用者が押せない要素」＝ HTML に inline display:none で書かれた
//   <input type="file">（隠しファイル入力の定番パターン）。起動経路は
//     <label for="ID"> / .click() / .showPicker() / .dispatchEvent()
//   の 3 つしかない。<label> が無く、起動サイトが 1 つも無い or すべて静的に
//   到達不能な関数の中にしかないなら、この要素への結線は永久に発火しない。
//
//   ※ 対象を隠しファイル入力に限っているのは意図的な最小規則。他の display:none
//     要素は「後から表示に切り替えて押させる」用法が普通で、同じ推論ができない。
// -----------------------------------------------------------------------------
function detectInertTriggers(src, cls, ownerOf, isReachable) {
  const out = [];
  for (const m of src.matchAll(/<input\b[^>]*>/g)) {
    if (cls[m.index] === X) continue;
    const tag = m[0];
    if (!/\btype\s*=\s*["']file["']/.test(tag)) continue;
    if (!/display\s*:\s*none/.test(tag)) continue;
    const idm = /\bid\s*=\s*["']([^"']+)["']/.exec(tag);
    if (!idm) continue;
    const id = idm[1];
    const esc = escapeRe(id);
    if (new RegExp('<label[^>]*\\bfor\\s*=\\s*["\']' + esc + '["\']').test(src)) continue;

    const sites = [];
    const selRe = new RegExp('(?:' + SELECTOR_METHODS.join('|') + ")\\(\\s*['\"]#?" + esc + "['\"]\\s*\\)", 'g');
    for (const s of src.matchAll(selRe)) {
      if (cls[s.index] !== C) continue;
      const stmt = src.slice(s.index, statementEnd(src, cls, s.index));
      sites.push({ pos: s.index, owner: ownerOf(s.index), activates: ACTIVATION_RE.test(stmt), stmt });
    }
    const activation = sites.filter((s) => s.activates);
    // 起動サイトが 1 つでも生きていれば、この要素は発火しうる
    if (activation.some((s) => s.owner === null || isReachable(s.owner))) continue;
    const binds = sites.filter((s) => /\.\s*addEventListener\s*\(/.test(s.stmt));
    if (!binds.length) continue;
    for (const b of binds) {
      out.push({
        kind: 'inert-trigger',
        key: id,
        selector: '#' + id,
        pos: b.pos,
        reason: 'no-live-activation',
        activationOwners: activation.map((s) => s.owner).filter(Boolean).sort(),
      });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// 検査2-c: 死んだセレクタの「影響範囲」＝死んだ領域【罠(9)】
//   規則（文単位・位置ベースの「次のセレクタまで」は廃止）:
//     - `var x = <selector>(...)` の形なら、その文 ＋ x を参照する後続の連続した文。
//       （この repo の bind 関数は `var x=...; if(x)x.addEventListener(...)` の並び）
//     - チェーン呼び出し `<selector>(...).addEventListener(...)` ならその文だけ。
//   どちらも内包するトップレベル関数の本体末尾を超えない。
//   無名関数の中でもブロックを越えて伸びない（文の走査が閉じ括弧で止まるため）。
// -----------------------------------------------------------------------------
function buildDeadRegions(src, cls, deadBindings, spans) {
  const regions = [];
  for (const d of deadBindings) {
    const asg = assignedVarAt(src, cls, d.pos);
    const start = asg ? asg.stmtStart : d.pos;
    let end = statementEnd(src, cls, start);
    if (asg) {
      for (;;) {
        const nx = nextStatementStart(src, cls, end);
        if (nx === -1) break;
        const e2 = statementEnd(src, cls, nx);
        if (e2 <= end) break;
        if (!rangeReferences(src, cls, nx, e2, asg.name)) break;
        end = e2;
      }
    }
    for (const s of spans) {
      if (s.s <= d.pos && d.pos <= s.e) { end = Math.min(end, s.e); break; }
    }
    regions.push({ start, end, selector: d.selector, reason: d.reason });
  }
  return regions;
}

// -----------------------------------------------------------------------------
// 本体
// -----------------------------------------------------------------------------
function analyze(src) {
  const N = src.length;
  const cls = new Uint8Array(N).fill(M);

  // HTML コメントと <style> は散文 / CSS ＝参照ではない（罠(1)）
  const markRaw = (a, b, v) => { for (let k = a; k < b; k++) cls[k] = v; };
  for (const m of src.matchAll(/<!--/g)) {
    let e = src.indexOf('-->', m.index + 4);
    e = (e === -1) ? N : e + 3;
    markRaw(m.index, e, X);
  }
  for (const m of src.matchAll(/<style[^>]*>/g)) {
    const s = m.index + m[0].length;
    let e = src.indexOf('</style>', s);
    if (e === -1) e = N;
    markRaw(s, e, X);
  }

  const blocks = findScriptBlocks(src);
  const out = { topFunctions: [], allFunctionDecls: [] };
  for (const b of blocks) lexBlock(src.slice(b.start, b.end), b.start, cls, out);

  // インラインイベントハンドラ属性の値だけを参照に昇格する（罠(6)(7)）
  const inlineHandlers = markInlineHandlerValues(src, cls);

  const byName = new Map();
  for (const f of out.topFunctions) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }

  // 関数名の宣言位置（＝参照ではない）
  const declNamePos = new Set();
  for (const f of out.topFunctions) declNamePos.add(f.namePos);
  for (const d of out.allFunctionDecls) declNamePos.add(d.namePos);

  // 全単語出現のうち、既知の関数名だけを拾う
  const occ = new Map();
  for (const m of src.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    const w = m[0];
    if (!byName.has(w)) continue;
    const p = m.index;
    if (p > 0 && isIdChar(src[p - 1])) continue;
    if (!occ.has(w)) occ.set(w, []);
    occ.get(w).push(p);
  }

  // 位置 → その位置を含むトップレベル関数名
  const spans = out.topFunctions
    .map((f) => ({ s: f.bodyStart, e: f.bodyEnd, name: f.name }))
    .sort((a, b) => a.s - b.s);
  const spanStarts = spans.map((x) => x.s);
  function ownerOf(p) {
    let lo = 0;
    let hi = spanStarts.length - 1;
    let k = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (spanStarts[mid] <= p) { k = mid; lo = mid + 1; } else hi = mid - 1;
    }
    for (; k >= 0; k--) {
      if (spans[k].s <= p && p <= spans[k].e) return spans[k].name;
    }
    return null;
  }

  // --- 参照の収集（静的） -----------------------------------------------------
  const graph = new Map();      // caller -> Set(callee)
  const roots = new Map();      // name -> [{pos, cls}]
  const refSites = new Map();   // name -> [{pos, owner, cls}]
  const commentRefs = new Map();
  const stringRefs = new Map();
  const markupRefs = new Map();

  const addEdge = (g, from, to) => {
    if (!g.has(from)) g.set(from, new Set());
    g.get(from).add(to);
  };

  for (const [name, positions] of occ) {
    for (const p of positions) {
      if (declNamePos.has(p)) continue;
      const k = cls[p];
      if (k === X) { // コメント内の言及は参照ではない（罠(1)）
        commentRefs.set(name, (commentRefs.get(name) || 0) + 1);
        continue;
      }
      if (k === S) { // 文字列 / テンプレート / 正規表現リテラル内も参照ではない（罠(4)）
        stringRefs.set(name, (stringRefs.get(name) || 0) + 1);
        continue;
      }
      if (k === M) { // HTML の属性名・id/class 値・テキストも参照ではない（罠(6)）
        markupRefs.set(name, (markupRefs.get(name) || 0) + 1);
        continue;
      }
      const o = ownerOf(p);
      if (!refSites.has(name)) refSites.set(name, []);
      refSites.get(name).push({ pos: p, owner: o, cls: String.fromCharCode(k) });
      if (o === null) {
        if (!roots.has(name)) roots.set(name, []);
        roots.get(name).push({ pos: p, cls: String.fromCharCode(k) });
      } else {
        addEdge(graph, o, name);
      }
    }
  }

  const reachFrom = (rootNames, g) => {
    const seen = new Set();
    const stack = [...rootNames];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      const cs = g.get(n);
      if (cs) for (const c of cs) if (!seen.has(c)) stack.push(c);
    }
    return seen;
  };

  const allNames = [...byName.keys()];
  const reachStatic = reachFrom(roots.keys(), graph);

  // --- 検査2: 死んだ結線 → 死んだ領域 → 実行時到達可能性 ----------------------
  const aliases = detectSelectorAliases(src, out.topFunctions);
  const notProduced = detectDeadBindings(src, cls, aliases);
  const inert = detectInertTriggers(src, cls, ownerOf, (n) => reachStatic.has(n));
  const deadBindings = notProduced.concat(inert);
  const deadRegions = buildDeadRegions(src, cls, deadBindings, spans);
  const inDeadRegion = (p) => deadRegions.some((r) => p >= r.start && p < r.end);

  const graphLive = new Map();
  const rootsLive = new Map();
  for (const [name, sites] of refSites) {
    for (const s of sites) {
      if (inDeadRegion(s.pos)) continue;
      if (s.owner === null) {
        if (!rootsLive.has(name)) rootsLive.set(name, []);
        rootsLive.get(name).push({ pos: s.pos });
      } else {
        addEdge(graphLive, s.owner, name);
      }
    }
  }
  const reachRuntime = reachFrom(rootsLive.keys(), graphLive);

  const lineOf = (p) => {
    let line = 1;
    for (let k = 0; k < p; k++) if (src.charCodeAt(k) === 10) line++;
    return line;
  };

  const describe = (name) => {
    const f = byName.get(name)[0];
    return {
      name,
      line: lineOf(f.namePos),
      endLine: lineOf(f.bodyEnd),
      liveRefs: (refSites.get(name) || []).length,
      commentRefs: commentRefs.get(name) || 0,
      stringRefs: stringRefs.get(name) || 0,
      markupRefs: markupRefs.get(name) || 0,
      callers: [...new Set((refSites.get(name) || []).map((r) => r.owner).filter(Boolean))].sort(),
    };
  };

  const unreachableStatic = allNames
    .filter((n) => !reachStatic.has(n))
    .map(describe)
    .sort((a, b) => a.line - b.line);

  const unreachableRuntimeOnly = allNames
    .filter((n) => reachStatic.has(n) && !reachRuntime.has(n))
    .map(describe)
    .sort((a, b) => a.line - b.line);

  return {
    scriptBlocks: blocks.length,
    functionDeclsAllDepths: out.allFunctionDecls.length,
    topLevelFunctionCount: byName.size,
    inlineHandlerCount: inlineHandlers.length,
    selectorAliases: aliases.map((a) => a.name).sort(),
    rootNames: [...roots.keys()].sort(),
    unreachableStatic,
    unreachableRuntimeOnly,
    deadBindings: deadBindings.map((d) => ({
      selector: d.selector, kind: d.kind, reason: d.reason, line: lineOf(d.pos),
    })),
    // 検算・デバッグ用
    _internal: {
      cls, byName, graph, roots, refSites, deadRegions, lineOf, ownerOf,
      commentRefs, stringRefs, markupRefs, describe,
    },
  };
}

// 文字クラスの値。変異検証（test_reachability_001.js）が cls を読むために公開する。
const CHAR_CLASS = { H, C, S, X, M };

module.exports = {
  analyze, findScriptBlocks, CHAR_CLASS, MIN_SELECTOR_PREFIX,
  statementEnd, detectSelectorAliases,
};
