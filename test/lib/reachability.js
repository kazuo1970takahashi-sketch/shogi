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
// =============================================================================
// PHASE1-REACH-001d（4版目）: 面レクサへの構造転換 ＋ 検査2の降格
// =============================================================================
//
// 1〜3 版は「参照として数える領域の境界」で 3 回とも同じ形に破られた:
//
//   1版目 → JS 文字列の中の識別子を呼出辺に数えていた（`'SAVE-003: startTournament …'`）
//   2版目 → HTML マークアップ全体を参照に数えていた（`class="save-warn-pill"`）
//   3版目 → 属性名の**前方一致**で on* を判定していた（`data-onclick="deadFn()"` が
//            インラインハンドラと誤認され、死んだ関数がルート化して検出から消える）
//
// 個別の穴をもう 1 つ塞ぐ 5 版目はやらない。**構造で塞ぐ**:
//
//   (A) 単一の面レクサ classifyFaces
//       ファイル全体を一度だけ 16 の「面」に分類し、以降の全判定はその分類だけを読む。
//       - 全文字がいずれか 1 つの面に属する（未分類 0・面の総延長＝ファイル長）。
//         この**完全性**はテストで毎回検査する（test_reachability_001.js L-1/L-2）。
//       - 「参照として数える面」は **JS_CODE ＋ ATTR_VAL_ON の 2 つだけ**。
//         属性名・非 on* 属性値・テキストノード・コメント・CSS・文字列・正規表現は数えない。
//       - on* 判定は**属性名トークンの完全一致** `/^on[a-z]+$/i`。`data-onclick` は
//         属性名が完全一致しないので ATTR_VAL（＝数えない）になる＝3版目の破れ方が原理的に消える。
//       - 正規表現でソース全体を舐めて「ここは参照」と決める判定は全廃した。
//         構文パターン（セレクタ呼出の検出など）は残っているが、**採否は必ず面が決める**。
//
//   (B) CI で落とすのは検査1（静的到達可能性）だけ
//       検査2（結線先 DOM の実在・起動経路）は**非ブロッキングのレポート**へ降格した
//       （作者承認済み 2026-08-01）。走査と出力は残す。理由は下の「検査2の降格」を参照。
//
// -----------------------------------------------------------------------------
// 提供する検査
// -----------------------------------------------------------------------------
//
//   検査1（静的到達可能性）＝ **CI をブロックする**
//     トップレベル `function NAME(` に対し、ルート（インラインイベントハンドラ属性値
//     ＝ ATTR_VAL_ON ＋ どの関数にも属さない JS_CODE の文）からの**推移的**到達可能性。
//
//   検査2（実行時到達可能性 ＝ bind 先の実在 ＋ 起動経路の実在）＝ **レポートのみ**
//     (a) getElementById / querySelector(All) の引数に出る id / class のうち、
//         その id / class をどこでも生成していないもの
//     (b) 要素は実在するが、それを起動する唯一のコードが到達不能なもの
//     を検出し、そこに結線されたハンドラを実行時に到達しないものとして報告する。
//
// -----------------------------------------------------------------------------
// 検査2の降格（PHASE1-REACH-001d・作者承認済み）
// -----------------------------------------------------------------------------
// 降格は「実装が甘いから」ではなく、**静的走査のままでは偽陽性が原理的に消せない**ため:
//
//   - `var el = document.getElementById('x') || document.querySelector('.x');` のような
//     フォールバック 1 行を足すと、生きている関数が 2 本 FAIL する（再現済み）。
//   - `var byId = function(id){ return document.getElementById(id); };` の**関数式**
//     ヘルパへ抽出すると（トップレベル関数宣言ではないので別名として認識できず）
//     結線の検出そのものが消え、allowlist の掃除漏れ検出 R5 が 7 件の解消不能 FAIL を出す。
//     ＝「allowlist に足しても消せない・直し方が無い」詰みになる。
//
// 静的走査のまま塞ぐには JS ＋ DOM の抽象解釈が必要で、このスライスの規模を超える。
// 一方、**検査1 単独でも到達不能 40 関数中 30・行数の 64% を被覆**し、#798 で実害が
// 記録された唯一のケース（#790 ③ のゲスト大会 warn 注記）は検査1の守備範囲にある。
// 恒久的な厳密化（Playwright 実 DOM 突合・nightly 非ブロッキング）は別スライスで起案する。
//
// 降格の具体:
//   - deadBindings / inertTriggers / deadRegions は CI の FAIL 判定から外す（warn 表示）。
//   - allowlist 腐敗検出 R5 は **static セクションのみ** error。runtime / bindings は warn。
//   - allowlist 上限 A5 は「超過で即 FAIL」をやめ、baseline との差分＋理由必須（R4）で運用する。
//
// -----------------------------------------------------------------------------
// #798 と 1〜3 版で踏んだ罠が、面レクサでどう塞がっているか
// -----------------------------------------------------------------------------
//   (1) コメント内の言及を参照に数えない
//       → HTML_COMMENT / JS_LINE_COMMENT / JS_BLOCK_COMMENT は参照面ではない。
//   (2) JS 文字列内の "<script>" で走査領域を二重化しない
//       → script は rawtext 要素として閉じタグまでを 1 度だけ読む。文字列の中の
//         "<script>" はそもそも JS_STR_* 面の内側で、HTML としては解釈されない。
//   (3) 「定義以外の出現 0 回」方式は使わない
//       → 呼び出しグラフ＋ルートからの到達可能性で判定する。
//   (4) 文字列リテラル内の識別子を参照に数えない → JS_STR_SQ / DQ / TMPL_STR / REGEX。
//   (5) 連結セレクタ getElementById('prefix_'+x) を取りこぼさない（検査2・接頭辞照合）。
//   (6) HTML の id / class / data-* / テキストを参照に数えない
//       → ATTR_NAME / ATTR_VAL / HTML_TEXT / HTML_TAG / RAWTEXT。
//   (7) JS 文字列で組み立てた HTML の on*= は参照に数える
//       → **派生パス**: JS_STR_* の連結ラン（`'…'+x+'…'` / テンプレート）をエスケープ
//         復号して HTML ミニレクサ（= classifyFaces 自身）を明示的に再帰適用し、
//         そこで ATTR_VAL_ON になった範囲だけを元の位置へ重ねる。
//   (8) 起動経路が無い結線（押せない隠しファイル入力）を扱う（検査2・レポート）。
//   (9) 死んだ領域の終端は文（statement）単位で決める（検査2・レポート）。
//   (10) セレクタ・ヘルパ（$id 等）を別名として認識する（検査2・レポート）。
//
// -----------------------------------------------------------------------------
// 既知の限界（現行ファイルに実在 0 を確認済み・変異テストで固定してある）
// -----------------------------------------------------------------------------
//   KL-1 `}` の直後に文頭として置かれた正規表現リテラルは除算として扱う
//        （直前の有意トークンが '}' のとき regex を許可しない）。
//   KL-2 <script> 内の `<!--`（HTML 仕様の escaped script data）は未対応。
//   KL-3 on* 属性値の中の HTML エンティティ（&#40; 等）は復号しない。
//   KL-4 派生パス（罠(7)）の再帰は 1 段まで。JS 文字列の中の <script> の中の
//        文字列に書かれた on*= は拾わない。
// =============================================================================

// -----------------------------------------------------------------------------
// 面（face）— ファイルの全文字にちょうど 1 つ付く
// -----------------------------------------------------------------------------
const FACE = {
  // HTML 側
  HTML_TEXT: 1,         // タグ外テキスト（地の文）
  HTML_COMMENT: 2,      // <!-- ... --> 全体
  HTML_TAG: 3,          // タグ名・< > / = 引用符・タグ内空白・DOCTYPE
  ATTR_NAME: 4,         // 属性名
  ATTR_VAL: 5,          // 属性値（on* 以外）
  ATTR_VAL_ON: 6,       // 属性値（属性名が /^on[a-z]+$/i に完全一致）★参照
  STYLE_CSS: 7,         // <style> の中身（CSS 全体・コメント含む）
  RAWTEXT: 8,           // textarea / title / 非 JS な script の中身
  // JS 側（<script> の中身）
  JS_CODE: 10,          // コード本体 ★参照
  JS_STR_SQ: 11,        // '...' 文字列（引用符含む）
  JS_STR_DQ: 12,        // "..." 文字列（引用符含む）
  JS_TMPL_STR: 13,      // `...` テンプレートの文字列部（バッククォート含む）
  JS_TMPL_DELIM: 14,    // ${ と } のデリミタ（中身は JS_CODE）
  JS_LINE_COMMENT: 15,  // // ...
  JS_BLOCK_COMMENT: 16, // /* ... */
  JS_REGEX: 17,         // /.../flags 正規表現リテラル
};
const FACE_NAME = Object.fromEntries(Object.entries(FACE).map(([k, v]) => [v, k]));
const ALL_FACES = Object.values(FACE);

// 参照として数える面は 2 つだけ。ここが判定の唯一の入口。
const REF_FACES = new Set([FACE.JS_CODE, FACE.ATTR_VAL_ON]);
// 散文（コメント・CSS）。生成・参照のどちらでもない。
const PROSE_FACES = new Set([
  FACE.HTML_COMMENT, FACE.JS_LINE_COMMENT, FACE.JS_BLOCK_COMMENT, FACE.STYLE_CSS,
]);
// 文字列リテラル面。
const STRING_FACES = new Set([
  FACE.JS_STR_SQ, FACE.JS_STR_DQ, FACE.JS_TMPL_STR, FACE.JS_REGEX,
]);
// 派生パス（罠(7)）で連結ランを組む対象。正規表現リテラルは HTML ではないので入れない。
const CONCAT_FACES = new Set([FACE.JS_STR_SQ, FACE.JS_STR_DQ, FACE.JS_TMPL_STR]);

const isRefFace = (f) => REF_FACES.has(f);
const isProseFace = (f) => PROSE_FACES.has(f);
const isStringFace = (f) => STRING_FACES.has(f);

// 参照の内訳バケット（数え漏らしを見えるようにするための分類）。
function refBucket(f) {
  if (isRefFace(f)) return 'ref';
  if (isProseFace(f)) return 'comment';
  if (isStringFace(f)) return 'string';
  return 'markup';
}

// -----------------------------------------------------------------------------
// 定数
// -----------------------------------------------------------------------------

// 連結セレクタの接頭辞として扱う最小長。'wb_' / 'rep-' 等が下限。
const MIN_SELECTOR_PREFIX = 3;

// 要素を取得する DOM API。受け手（document. / pane. / 無し）は問わない。
const SELECTOR_METHODS = ['getElementById', 'querySelectorAll', 'querySelector'];

// 要素を「起動」する API。これが無ければ、押せない要素は永久に発火しない。
const ACTIVATION_RE = /\.\s*(?:click|showPicker)\s*\(|\.\s*dispatchEvent\s*\(/;

const IDSTART = /[A-Za-z_$]/;
const IDCHAR = /[A-Za-z0-9_$]/;
const WS = /\s/;
const ATTR_NAME_CH = /[a-zA-Z0-9:_-]/;
const ON_ATTR_NAME_RE = /^on[a-z]+$/i;

// 正規表現リテラル判定で「直前が値ではない」ことを示すキーワード。
const KW_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);
const PUNCT_BEFORE_REGEX = '([{,;:=!&|?+-*%~^<>';

// 文の終端判定で「ブロックの後ろに続く＝まだ同じ文」を示すキーワード。
const KW_CONTINUES_STATEMENT = new Set(['else', 'catch', 'finally', 'while']);

// 派生パス: 連結ランの中で式（文字列でないオペランド）を跨いで探す上限文字数。
// これを超えたら連結ではないと判断して打ち切る（暴走防止）。
const CONCAT_SKIP_LIMIT = 400;
// 派生パスで式を表す 1 文字のプレースホルダ（元ソースの位置を持たない）。
const CONCAT_PLACEHOLDER = '\u0001';

const JS_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

function isIdStart(ch) { return IDSTART.test(ch); }
function isIdChar(ch) { return IDCHAR.test(ch); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// =============================================================================
// (A) 面レクサ — ファイル全体を一度だけ分類する。真実の源はここだけ。
// =============================================================================
function classifyFaces(src, out) {
  const N = src.length;
  const face = new Uint8Array(N); // 0 = 未分類（完全性検査で 0 件であること）
  const ctx = {
    src,
    face,
    N,
    scriptBlocks: (out && out.scriptBlocks) || [],
    set(a, b, f) { for (let k = a; k < b; k++) this.face[k] = f; },
  };
  let i = 0;

  while (i < N) {
    const ch = src[i];
    if (ch !== '<') { face[i] = FACE.HTML_TEXT; i++; continue; }

    // HTML コメント
    if (src.startsWith('<!--', i)) {
      let e = src.indexOf('-->', i + 4);
      e = e === -1 ? N : e + 3;
      ctx.set(i, e, FACE.HTML_COMMENT);
      i = e;
      continue;
    }
    // DOCTYPE 等 <! ... >
    if (src[i + 1] === '!') {
      let e = src.indexOf('>', i);
      e = e === -1 ? N : e + 1;
      ctx.set(i, e, FACE.HTML_TAG);
      i = e;
      continue;
    }
    // 閉じタグ </name ...>
    if (src[i + 1] === '/' && /[a-zA-Z]/.test(src[i + 2] || '')) {
      let e = src.indexOf('>', i);
      e = e === -1 ? N : e + 1;
      ctx.set(i, e, FACE.HTML_TAG);
      i = e;
      continue;
    }
    // 開きタグ <name ...>
    if (/[a-zA-Z]/.test(src[i + 1] || '')) {
      i = lexTag(ctx, i);
      continue;
    }
    // タグでない裸の '<'（"a < b" 等）はテキスト
    face[i] = FACE.HTML_TEXT;
    i++;
  }

  if (out) out.scriptBlocks = ctx.scriptBlocks;
  return face;
}

// 開きタグ 1 個を字句解析する。rawtext 要素（script / style / textarea / title）なら
// その中身も処理して、消費後の位置を返す。
function lexTag(ctx, start) {
  const { src, face, N } = ctx;
  let i = start;
  face[i] = FACE.HTML_TAG;
  i++; // '<'
  const ns = i;
  while (i < N && ATTR_NAME_CH.test(src[i])) i++;
  const tagName = src.slice(ns, i).toLowerCase();
  ctx.set(ns, i, FACE.HTML_TAG);

  let hasSrc = false;
  let typeNonJs = false;
  for (;;) {
    // タグ内空白（改行を含む＝複数行にまたがるタグに対応）
    while (i < N && WS.test(src[i])) { face[i] = FACE.HTML_TAG; i++; }
    if (i >= N) return i;
    if (src[i] === '>') { face[i] = FACE.HTML_TAG; i++; break; }
    if (src[i] === '/') { face[i] = FACE.HTML_TAG; i++; continue; }

    // 属性名
    const as = i;
    while (i < N && !/[\s=/>]/.test(src[i])) i++;
    if (i === as) { face[i] = FACE.HTML_TAG; i++; continue; } // 想定外文字は食い進める
    const aname = src.slice(as, i).toLowerCase();
    ctx.set(as, i, FACE.ATTR_NAME);

    let j = i;
    while (j < N && WS.test(src[j])) j++;
    if (src[j] !== '=') continue;              // 値なし属性（hidden 等）
    ctx.set(i, j + 1, FACE.HTML_TAG);          // 空白 ＋ '='
    i = j + 1;
    while (i < N && WS.test(src[i])) { face[i] = FACE.HTML_TAG; i++; }

    // ★ on* 判定は「属性名トークン全体」の完全一致。data-onclick は on* ではない。
    const vf = ON_ATTR_NAME_RE.test(aname) ? FACE.ATTR_VAL_ON : FACE.ATTR_VAL;
    let valueStart = i;
    let valueEnd = i;
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      face[i] = FACE.HTML_TAG;
      i++;                                     // 開き引用符
      valueStart = i;
      while (i < N && src[i] !== q) i++;       // 引用値は > や改行を含んでよい
      valueEnd = i;
      ctx.set(valueStart, valueEnd, vf);
      if (i < N) { face[i] = FACE.HTML_TAG; i++; } // 閉じ引用符
    } else {
      valueStart = i;
      while (i < N && !/[\s>]/.test(src[i])) i++; // 引用符省略値
      valueEnd = i;
      ctx.set(valueStart, valueEnd, vf);
    }
    if (aname === 'src') hasSrc = true;
    if (aname === 'type') {
      const tv = src.slice(valueStart, valueEnd);
      if (tv && !/javascript|module/i.test(tv)) typeNonJs = true;
    }
  }

  // rawtext 要素: 閉じタグまでの中身は HTML として解釈しない（HTML 仕様どおり）。
  // ＝罠(2) の「JS 文字列の中の <script> で走査領域が二重化する」が構造的に起きない。
  if (tagName === 'script' || tagName === 'style' || tagName === 'textarea' || tagName === 'title') {
    const closeRe = new RegExp('</' + tagName + '(?=[\\s/>])', 'ig');
    closeRe.lastIndex = i;
    const m = closeRe.exec(src);
    const contentEnd = m ? m.index : N;
    let tagEnd = N;
    if (m) {
      const gt = src.indexOf('>', m.index);
      tagEnd = gt === -1 ? N : gt + 1;
    }
    if (tagName === 'script') {
      if (hasSrc || typeNonJs) {
        ctx.set(i, contentEnd, FACE.RAWTEXT);
      } else {
        lexJs(ctx, i, contentEnd);
        ctx.scriptBlocks.push({ start: i, end: contentEnd });
      }
    } else if (tagName === 'style') {
      ctx.set(i, contentEnd, FACE.STYLE_CSS);
    } else {
      ctx.set(i, contentEnd, FACE.RAWTEXT);
    }
    if (m) ctx.set(contentEnd, tagEnd, FACE.HTML_TAG);
    return m ? tagEnd : N;
  }
  return i;
}

// <script> の中身 [start, end) を JS として字句解析する。
// テンプレートリテラルの ${ } ネストは明示スタックで扱う。
function lexJs(ctx, start, end) {
  const { src, face } = ctx;
  let i = start;
  let last = null;        // 直前の有意トークン（正規表現 / 除算の判別用）
  const stack = [];       // 'tmpl' / 'code' の往復をネスト対応で持つ
  const braceDepths = [];
  let depth = 0;

  while (i < end) {
    const ch = src[i];

    // ---- テンプレート文字列部モード ----
    if (stack.length && stack[stack.length - 1] === 'tmpl') {
      if (ch === '\\') { ctx.set(i, Math.min(i + 2, end), FACE.JS_TMPL_STR); i += 2; continue; }
      if (ch === '`') { face[i] = FACE.JS_TMPL_STR; i++; stack.pop(); last = 'tmpl'; continue; }
      if (ch === '$' && src[i + 1] === '{') {
        ctx.set(i, i + 2, FACE.JS_TMPL_DELIM);
        i += 2;
        stack.push('code');
        braceDepths.push(depth);
        depth = 0;
        last = null;
        continue;
      }
      face[i] = FACE.JS_TMPL_STR;
      i++;
      continue;
    }

    // ---- コードモード ----
    if (ch === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1 || j > end) j = end;
      ctx.set(i, j, FACE.JS_LINE_COMMENT);
      i = j;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2);
      j = (j === -1 || j + 2 > end) ? end : j + 2;
      ctx.set(i, j, FACE.JS_BLOCK_COMMENT);
      i = j;
      continue;
    }
    if (ch === '/') {
      // KL-1: last === '}' は許可しない＝文頭の正規表現リテラルは除算扱いになる。
      const regexOk = last === null
        || (last.length === 1 && PUNCT_BEFORE_REGEX.indexOf(last) >= 0)
        || KW_BEFORE_REGEX.has(last)
        || last === '=>';
      if (regexOk) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < end) {
          const c = src[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { closed = true; break; }
          else if (c === '\n') break;
          j++;
        }
        if (closed) {
          let k = j + 1;
          while (k < end && IDCHAR.test(src[k])) k++; // フラグ
          ctx.set(i, k, FACE.JS_REGEX);
          i = k;
          last = 'regex';
          continue;
        }
      }
      face[i] = FACE.JS_CODE;
      last = '/';
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      const f = q === '"' ? FACE.JS_STR_DQ : FACE.JS_STR_SQ;
      let j = i + 1;
      while (j < end) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q || src[j] === '\n') break;
        j++;
      }
      const e = Math.min(j + (src[j] === q ? 1 : 0), end);
      ctx.set(i, e, f);
      i = e;
      last = 'str';
      continue;
    }
    if (ch === '`') {
      face[i] = FACE.JS_TMPL_STR;
      i++;
      stack.push('tmpl');
      continue;
    }
    if (ch === '{') { face[i] = FACE.JS_CODE; depth++; last = '{'; i++; continue; }
    if (ch === '}') {
      if (depth === 0 && stack.length && stack[stack.length - 1] === 'code') {
        face[i] = FACE.JS_TMPL_DELIM;        // ${ ... } の閉じ
        stack.pop();
        depth = braceDepths.pop();
        i++;
        last = 'tmpl';
        continue;
      }
      face[i] = FACE.JS_CODE;
      depth = Math.max(0, depth - 1);
      last = '}';
      i++;
      continue;
    }
    if (IDCHAR.test(ch) && !/[0-9]/.test(ch)) {
      let j = i;
      while (j < end && IDCHAR.test(src[j])) j++;
      ctx.set(i, j, FACE.JS_CODE);
      last = src.slice(i, j);
      i = j;
      continue;
    }
    face[i] = FACE.JS_CODE;
    if (!WS.test(ch)) last = ch;
    i++;
  }
}

// 面の分布と完全性。テストが毎回検査する（不変条件）。
function faceStats(face) {
  const histogram = {};
  for (const f of ALL_FACES) histogram[FACE_NAME[f]] = 0;
  let unclassified = 0;
  let covered = 0;
  for (let i = 0; i < face.length; i++) {
    const f = face[i];
    if (f === 0) { unclassified++; continue; }
    const nm = FACE_NAME[f];
    if (nm === undefined) { unclassified++; continue; }
    histogram[nm]++;
    covered++;
  }
  return { total: face.length, covered, unclassified, histogram };
}

// =============================================================================
// 派生パス（罠(7)）: JS 文字列で組み立てた HTML の on*= を参照に昇格する
//   JS_STR_* の**連結ラン**（'…'+x+'…' / テンプレート）をエスケープ復号して 1 本の
//   バッファにまとめ、そこへ classifyFaces を再帰適用する（KL-4: 再帰は 1 段）。
//   復号バッファで ATTR_VAL_ON になった位置だけを、元ソースの位置へ重ねる。
//   ＝「文字列の中の HTML」を扱うのは、正規表現の全文走査ではなく明示的な再帰。
// =============================================================================

// 空白と JS コメントだけを飛ばす。それ以外に当たったらその位置を返す。
function skipTrivia(src, face, p) {
  const N = src.length;
  while (p < N) {
    const f = face[p];
    if (f === FACE.JS_LINE_COMMENT || f === FACE.JS_BLOCK_COMMENT) { p++; continue; }
    if (f === FACE.JS_CODE && WS.test(src[p])) { p++; continue; }
    return p;
  }
  return -1;
}

// 文字列面のスパン [a, b) を復号して chars / map に足す。
// map[k] = 復号後 k 文字目に対応する元ソースの位置（プレースホルダは -1）。
function decodeSpanInto(src, a, b, stripStart, stripEnd, chars, map) {
  const s = stripStart ? a + 1 : a;
  const e = stripEnd ? b - 1 : b;
  for (let k = s; k < e; k++) {
    if (src[k] === '\\' && k + 1 < e) {
      const c = src[k + 1];
      chars.push(Object.prototype.hasOwnProperty.call(JS_ESCAPES, c) ? JS_ESCAPES[c] : c);
      map.push(k + 1);
      k++;
      continue;
    }
    chars.push(src[k]);
    map.push(k);
  }
}

// p から始まる文字列面スパンの終端（排他）。
function spanEnd(face, p) {
  const f = face[p];
  let e = p;
  while (e < face.length && face[e] === f) e++;
  return e;
}

// 連結の途中に現れた式を読み飛ばし、次の文字列面の開始位置を返す。
// 連結ではない（; , や閉じ括弧に当たった / 遠すぎる）なら -1。
function skipConcatOperand(src, face, from) {
  let depth = 0;
  const limit = Math.min(src.length, from + CONCAT_SKIP_LIMIT);
  for (let q = from; q < limit; q++) {
    const f = face[q];
    if (CONCAT_FACES.has(f)) { if (depth === 0) return q; continue; }
    if (f !== FACE.JS_CODE) continue;
    const ch = src[q];
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return -1;
      depth--;
      continue;
    }
    if (depth === 0 && (ch === ';' || ch === ',')) return -1;
  }
  return -1;
}

// テンプレートの ${ ... } を 1 つ飛ばす。開始は '${' の位置。
function skipTemplateHole(src, face, p) {
  let depth = 0;
  const N = src.length;
  while (p < N) {
    if (face[p] === FACE.JS_TMPL_DELIM) {
      if (src[p] === '$') { depth++; p += 2; continue; }
      depth--;
      p += 1;
      if (depth <= 0) return p;
      continue;
    }
    p++;
  }
  return N;
}

// JS 文字列の連結ランを列挙する。
function collectConcatRuns(src, face) {
  const runs = [];
  const N = src.length;
  let i = 0;
  while (i < N) {
    if (!CONCAT_FACES.has(face[i])) { i++; continue; }
    const chars = [];
    const map = [];
    const runStart = i;
    let p = i;
    for (;;) {
      const f = face[p];
      if (CONCAT_FACES.has(f)) {
        const e = spanEnd(face, p);
        const q = src[p];
        const stripStart = (q === '"' || q === "'" || q === '`')
          && (p === 0 || face[p - 1] !== FACE.JS_TMPL_DELIM);
        const lastCh = src[e - 1];
        const stripEnd = (lastCh === '"' || lastCh === "'" || lastCh === '`')
          && (e - 1 > p || !stripStart);
        decodeSpanInto(src, p, e, stripStart, stripEnd, chars, map);
        p = e;
      } else if (f === FACE.JS_TMPL_DELIM && src[p] === '$') {
        chars.push(CONCAT_PLACEHOLDER);
        map.push(-1);
        p = skipTemplateHole(src, face, p);
      } else if (f === FACE.JS_CODE) {
        const t = skipTrivia(src, face, p);
        if (t < 0) break;
        if (face[t] === FACE.JS_CODE && src[t] === '+') { p = t + 1; continue; }
        if (CONCAT_FACES.has(face[t])) { p = t; continue; }
        const nx = skipConcatOperand(src, face, t);
        if (nx < 0) break;
        chars.push(CONCAT_PLACEHOLDER);
        map.push(-1);
        p = nx;
      } else {
        const t = skipTrivia(src, face, p);
        if (t < 0 || t === p) break;
        p = t;
      }
      if (p >= N) break;
    }
    if (chars.length) runs.push({ start: runStart, end: p, text: chars.join(''), map });
    i = Math.max(p, i + 1);
  }
  return runs;
}

// 復号ランへ HTML ミニレクサを再帰適用し、ATTR_VAL_ON を元の位置へ重ねる。
function markHtmlInJsStrings(src, face) {
  const marked = [];
  for (const run of collectConcatRuns(src, face)) {
    if (run.text.indexOf('<') < 0) continue;          // HTML の組み立てではない
    const inner = classifyFaces(run.text);
    let k = 0;
    while (k < inner.length) {
      if (inner[k] !== FACE.ATTR_VAL_ON) { k++; continue; }
      let e = k;
      while (e < inner.length && inner[e] === FACE.ATTR_VAL_ON) e++;
      let hit = 0;
      let prev = -1;
      for (let q = k; q < e; q++) {
        const at = run.map[q];
        if (at < 0) { prev = -1; continue; }            // 式のプレースホルダ（元位置なし）
        // エスケープ（`\'` の `\`）で 1 文字空くだけの隙間は埋める。
        // 別のリテラルへ跨いだ隙間（＝間に JS_CODE がある）は埋めない。
        if (prev >= 0 && at - prev === 2) face[at - 1] = FACE.ATTR_VAL_ON;
        face[at] = FACE.ATTR_VAL_ON;
        prev = at;
        hit++;
      }
      if (hit) marked.push({ runStart: run.start, start: run.map[k], length: e - k });
      k = e;
    }
  }
  return marked;
}

// HTML 側で直接 ATTR_VAL_ON になっているスパンの数（＝実在のインライン on* 属性）。
function countInlineHandlerSpans(face) {
  let n = 0;
  for (let i = 0; i < face.length; i++) {
    if (face[i] !== FACE.ATTR_VAL_ON) continue;
    if (i === 0 || face[i - 1] !== FACE.ATTR_VAL_ON) n++;
  }
  return n;
}

// =============================================================================
// (C) トップレベル関数の抽出 — JS_CODE 面だけを読む
//   面がすでに文字列・コメント・正規表現・テンプレートを外しているので、
//   読み飛ばし処理は不要（3版目より単純になった）。
// =============================================================================
function matchParen(src, face, open) {
  let d = 0;
  for (let p = open; p < src.length; p++) {
    if (face[p] !== FACE.JS_CODE) continue;
    if (src[p] === '(') d++;
    else if (src[p] === ')') { d--; if (d === 0) return p; }
  }
  return open;
}

function paramNames(raw) {
  return raw.split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s));
}

function extractFunctions(src, face) {
  const out = { topFunctions: [], allFunctionDecls: [] };
  const N = src.length;
  let depth = 0;
  let pending = null;
  const openStack = [];
  let i = 0;

  while (i < N) {
    if (face[i] !== FACE.JS_CODE) { i++; continue; }
    const ch = src[i];

    if (ch === '{') {
      if (depth === 0 && pending) {
        pending.bodyStart = i;
        openStack.push(pending);
        pending = null;
      }
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0 && openStack.length) {
        const f = openStack.pop();
        out.topFunctions.push({
          name: f.name, namePos: f.namePos, params: f.params,
          bodyStart: f.bodyStart, bodyEnd: i,
        });
      }
      i++;
      continue;
    }
    if (isIdStart(ch) && !(i > 0 && face[i - 1] === FACE.JS_CODE && isIdChar(src[i - 1]))) {
      let j = i;
      while (j < N && face[j] === FACE.JS_CODE && isIdChar(src[j])) j++;
      if (src.slice(i, j) === 'function') {
        const k = skipTrivia(src, face, j);
        if (k >= 0 && face[k] === FACE.JS_CODE && isIdStart(src[k])) {
          let k2 = k;
          while (k2 < N && face[k2] === FACE.JS_CODE && isIdChar(src[k2])) k2++;
          const k3 = skipTrivia(src, face, k2);
          if (k3 >= 0 && face[k3] === FACE.JS_CODE && src[k3] === '(') {
            const nm = src.slice(k, k2);
            out.allFunctionDecls.push({ name: nm, namePos: k, depth });
            if (depth === 0) {
              const pe = matchParen(src, face, k3);
              pending = {
                name: nm, namePos: k, params: paramNames(src.slice(k3 + 1, pe)), bodyStart: k3,
              };
            }
          }
        }
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

// =============================================================================
// 文（statement）の走査 — 死んだ領域の終端を決める土台【罠(9)・検査2】
// =============================================================================
function prevCodePos(src, face, from) {
  let p = from;
  while (p >= 0 && (face[p] !== FACE.JS_CODE || WS.test(src[p]))) p--;
  return p;
}

function nextCodePos(src, face, from) {
  let p = from;
  while (p < src.length && (face[p] !== FACE.JS_CODE || WS.test(src[p]))) p++;
  return p < src.length ? p : -1;
}

function wordBefore(src, face, from) {
  const p = prevCodePos(src, face, from);
  if (p < 0 || !isIdChar(src[p])) return { word: null, start: p + 1 };
  let q = p;
  while (q >= 0 && isIdChar(src[q])) q--;
  return { word: src.slice(q + 1, p + 1), start: q + 1 };
}

function wordAt(src, face, from) {
  const p = nextCodePos(src, face, from);
  if (p < 0 || !isIdStart(src[p])) return null;
  let q = p;
  while (q < src.length && isIdChar(src[q])) q++;
  return src.slice(p, q);
}

// from から始まる 1 文の終端（排他）を返す。JS_CODE 以外の面は構造として読まない。
function statementEnd(src, face, from) {
  let depth = 0;
  let blockBrace = false;   // 深さ 0→1 の '{' が文ブロックか（object literal ではないか）
  for (let p = from; p < src.length; p++) {
    if (face[p] !== FACE.JS_CODE) continue;
    const ch = src[p];
    if (ch === '(' || ch === '[') { depth++; continue; }
    if (ch === '{') {
      if (depth === 0) {
        const { word } = wordBefore(src, face, p - 1);
        const prev = prevCodePos(src, face, p - 1);
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
        const nw = wordAt(src, face, p + 1);
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
function nextStatementStart(src, face, end) {
  const p = nextCodePos(src, face, end);
  if (p < 0) return -1;
  if (src[p] === '}' || src[p] === ')' || src[p] === ']') return -1;
  return p;
}

function rangeReferences(src, face, a, b, name) {
  const re = new RegExp('(?<![A-Za-z0-9_$])' + escapeRe(name) + '(?![A-Za-z0-9_$])', 'g');
  const chunk = src.slice(a, b);
  for (const m of chunk.matchAll(re)) {
    if (face[a + m.index] === FACE.JS_CODE) return true;
  }
  return false;
}

// pos にあるセレクタ呼び出しが `var NAME = ...` の右辺なら、その変数名と文頭を返す。
function assignedVarAt(src, face, pos) {
  let p = pos - 1;
  for (;;) {
    p = prevCodePos(src, face, p);
    if (p < 0) return null;
    if (src[p] === '.' || isIdChar(src[p])) { p--; continue; }
    break;
  }
  if (src[p] !== '=') return null;
  const before = src[p - 1];
  if (before === '=' || before === '!' || before === '<' || before === '>') return null;
  const v = wordBefore(src, face, p - 1);
  if (v.word === null || !isIdStart(v.word[0])) return null;
  let stmtStart = v.start;
  const kw = wordBefore(src, face, v.start - 1);
  if (kw.word === 'var' || kw.word === 'let' || kw.word === 'const') stmtStart = kw.start;
  return { name: v.word, stmtStart };
}

// =============================================================================
// 検査2（レポートのみ・CI をブロックしない）
//   構文パターンの検出には正規表現を使うが、**採否は必ず面が決める**:
//   呼出位置が JS_CODE 面でなければ採らない / 生成の照合では散文面を数えない。
// =============================================================================
function selectorLabel(f) {
  if (f.kind === 'class') return '.' + f.key;
  if (f.kind === 'id-prefix') return '#' + f.key + '*';
  return '#' + f.key;
}

// `function $id(id){return document.getElementById(id);}` のような 1 引数の薄い
// ラッパをセレクタの別名として登録する【罠(10)】。
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

// id / class の照合に使うトークン索引。`(?<![A-Za-z0-9_$-])KEY(?![A-Za-z0-9_$-])` は
// 「[A-Za-z0-9_$-]+ の極大並びが KEY と一致する」と同値なので、1 度だけ列挙して引く。
// （キーごとに全文を正規表現で舐めると、live なキーほど出現が多く二乗的に効く）
function buildTokenIndex(src) {
  const idx = new Map();
  for (const m of src.matchAll(/[A-Za-z0-9_$-]+/g)) {
    const t = m[0];
    const a = idx.get(t);
    if (a) a.push(m.index); else idx.set(t, [m.index]);
  }
  return idx;
}

function detectDeadBindings(src, face, aliases, tokenIndex) {
  const found = [];
  const seen = new Set();

  const scan = (re, kind, quote) => {
    for (const m of src.matchAll(re)) {
      if (face[m.index] !== FACE.JS_CODE) continue;   // 面が門番。文字列やコメントの中の見た目は採らない
      const key = m[1];
      if (kind === 'id-prefix' && key.length < MIN_SELECTOR_PREFIX) continue;
      const rel = m[0].indexOf(quote + key);          // 引用符ごと探す＝メソッド名自身に当たらない
      if (rel < 0) continue;
      const argStart = m.index + rel + quote.length;
      found.push({ kind, key, pos: m.index, argStart, argEnd: argStart + key.length });
    }
  };
  const scanById = (name) => {
    const n = escapeRe(name);
    scan(new RegExp(n + "\\(\\s*'([^']+)'\\s*\\)", 'g'), 'id', "'");
    scan(new RegExp(n + '\\(\\s*"([^"]+)"\\s*\\)', 'g'), 'id', '"');
    scan(new RegExp(n + "\\(\\s*'([^']*)'\\s*\\+", 'g'), 'id-prefix', "'");   // 連結セレクタ【罠(5)】
    scan(new RegExp(n + '\\(\\s*"([^"]*)"\\s*\\+', 'g'), 'id-prefix', '"');
  };
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

  // セレクタ引数そのものの位置（生成ではない）。二分探索で引けるよう昇順に持つ。
  const allRanges = found.map((f) => [f.argStart, f.argEnd]).sort((a, b) => a[0] - b[0]);
  const rangeStarts = allRanges.map((r) => r[0]);
  const inSelectorArg = (p) => {
    let lo = 0;
    let hi = rangeStarts.length - 1;
    let k = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rangeStarts[mid] <= p) { k = mid; lo = mid + 1; } else hi = mid - 1;
    }
    // 同じ開始位置の範囲は無いが、直前の数件は入れ子・重なりがありうるので少し遡る。
    for (let q = k; q >= 0 && q > k - 8; q--) {
      if (p >= allRanges[q][0] && p < allRanges[q][1]) return true;
    }
    return false;
  };

  for (const f of found) {
    const kk = f.kind + ':' + f.key;
    if (seen.has(kk)) continue;
    seen.add(kk);   // 同じ id/class を何度も走査しない（live なキーほど出現数が多い）
    // 接頭辞は語の途中で切れる（'helpBtnFirstRound_' の直後に動的な値が続く）ため
    // 後ろの境界を課さない＝生の部分文字列で照合する。完全一致はトークン索引で引く。
    let positions;
    if (f.kind === 'id-prefix') {
      positions = [];
      for (let at = src.indexOf(f.key); at >= 0; at = src.indexOf(f.key, at + 1)) positions.push(at);
    } else {
      positions = tokenIndex.get(f.key) || [];
    }
    let produced = 0;
    for (const p of positions) {
      if (isProseFace(face[p])) continue;   // コメント / CSS は生成ではない
      if (inSelectorArg(p)) continue;       // セレクタ引数そのもの
      produced++;
    }
    if (produced === 0) {
      f.selector = selectorLabel(f);
      f.reason = 'not-produced';
      f.dead = true;
    }
  }
  return found.filter((f) => f.dead);
}

// 起動経路が無い結線【罠(8)】。対象は隠しファイル入力に限る意図的な最小規則。
function detectInertTriggers(src, face, ownerOf, isReachable) {
  const out = [];
  for (const m of src.matchAll(/<input\b[^>]*>/g)) {
    if (face[m.index] !== FACE.HTML_TAG) continue;   // 面が門番（コメント内・文字列内の見た目は採らない）
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
      if (face[s.index] !== FACE.JS_CODE) continue;
      const stmt = src.slice(s.index, statementEnd(src, face, s.index));
      sites.push({ pos: s.index, owner: ownerOf(s.index), activates: ACTIVATION_RE.test(stmt), stmt });
    }
    const activation = sites.filter((s) => s.activates);
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

// 死んだセレクタの影響範囲＝死んだ領域【罠(9)】。文単位で決める。
function buildDeadRegions(src, face, deadBindings, spans) {
  const regions = [];
  for (const d of deadBindings) {
    const asg = assignedVarAt(src, face, d.pos);
    const start = asg ? asg.stmtStart : d.pos;
    let end = statementEnd(src, face, start);
    if (asg) {
      for (;;) {
        const nx = nextStatementStart(src, face, end);
        if (nx === -1) break;
        const e2 = statementEnd(src, face, nx);
        if (e2 <= end) break;
        if (!rangeReferences(src, face, nx, e2, asg.name)) break;
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

// =============================================================================
// 本体
// =============================================================================
function analyze(src) {
  // --- (i) 面レクサ: 分類はここ 1 回だけ ------------------------------------
  const lexOut = { scriptBlocks: [] };
  const baseFace = classifyFaces(src, lexOut);
  const face = Uint8Array.from(baseFace);

  // --- (ii) 派生パス: JS 文字列で組み立てた HTML の on*= を ATTR_VAL_ON へ ---
  const derivedHandlers = markHtmlInJsStrings(src, face);

  // --- (iii) トップレベル関数の抽出: JS_CODE 面のみを読む -------------------
  const out = extractFunctions(src, face);

  const byName = new Map();
  for (const f of out.topFunctions) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }

  // 関数名の宣言位置（＝参照ではない）
  const declNamePos = new Set();
  for (const f of out.topFunctions) declNamePos.add(f.namePos);
  for (const d of out.allFunctionDecls) declNamePos.add(d.namePos);

  // 全単語出現のうち、既知の関数名だけを拾う。
  //   ここは「候補位置の列挙」であって判定ではない（識別子の切れ目はどの面でも同じ）。
  //   参照か否かは下のループで face[p] だけを見て決める。
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

  // --- 参照の収集（静的）-----------------------------------------------------
  const graph = new Map();      // caller -> Set(callee)
  const roots = new Map();      // name -> [{pos, face}]
  const refSites = new Map();   // name -> [{pos, owner, face}]
  const commentRefs = new Map();
  const stringRefs = new Map();
  const markupRefs = new Map();

  const addEdge = (g, from, to) => {
    if (!g.has(from)) g.set(from, new Set());
    g.get(from).add(to);
  };
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  for (const [name, positions] of occ) {
    for (const p of positions) {
      if (declNamePos.has(p)) continue;
      const bucket = refBucket(face[p]);
      if (bucket === 'comment') { bump(commentRefs, name); continue; }   // 罠(1)
      if (bucket === 'string') { bump(stringRefs, name); continue; }     // 罠(4)
      if (bucket === 'markup') { bump(markupRefs, name); continue; }     // 罠(6)
      const o = ownerOf(p);
      if (!refSites.has(name)) refSites.set(name, []);
      refSites.get(name).push({ pos: p, owner: o, face: FACE_NAME[face[p]] });
      if (o === null) {
        if (!roots.has(name)) roots.set(name, []);
        roots.get(name).push({ pos: p, face: FACE_NAME[face[p]] });
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

  // --- 検査2（レポートのみ）: 死んだ結線 → 死んだ領域 → 実行時到達可能性 ----
  const aliases = detectSelectorAliases(src, out.topFunctions);
  const notProduced = detectDeadBindings(src, face, aliases, buildTokenIndex(src));
  const inert = detectInertTriggers(src, face, ownerOf, (n) => reachStatic.has(n));
  const deadBindings = notProduced.concat(inert);
  const deadRegions = buildDeadRegions(src, face, deadBindings, spans);
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

  // 行番号は事前計算した行頭テーブルで二分探索する（describe を何度呼んでも O(log n)）。
  const lineStarts = [0];
  for (let k = 0; k < src.length; k++) if (src.charCodeAt(k) === 10) lineStarts.push(k + 1);
  const lineOf = (p) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= p) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
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
    scriptBlocks: lexOut.scriptBlocks.length,
    functionDeclsAllDepths: out.allFunctionDecls.length,
    topLevelFunctionCount: byName.size,
    // インライン on*= の総数（HTML 直書き ＋ 派生パスで拾った JS 文字列内）。
    // HTML 側は素の面から数える（派生パスの上書きが混ざらないように）。
    inlineHandlerCount: countInlineHandlerSpans(baseFace) + derivedHandlers.length,
    htmlHandlerCount: countInlineHandlerSpans(baseFace),
    derivedHandlerCount: derivedHandlers.length,
    faceStats: faceStats(baseFace),
    selectorAliases: aliases.map((a) => a.name).sort(),
    rootNames: [...roots.keys()].sort(),
    unreachableStatic,
    unreachableRuntimeOnly,
    deadBindings: deadBindings.map((d) => ({
      selector: d.selector, kind: d.kind, reason: d.reason, line: lineOf(d.pos),
    })),
    // 検算・デバッグ用
    _internal: {
      face, baseFace, byName, graph, roots, refSites, deadRegions, lineOf, ownerOf,
      commentRefs, stringRefs, markupRefs, describe, derivedHandlers,
    },
  };
}

module.exports = {
  analyze,
  classifyFaces,
  faceStats,
  FACE,
  FACE_NAME,
  REF_FACES,
  isRefFace,
  isProseFace,
  isStringFace,
  MIN_SELECTOR_PREFIX,
  statementEnd,
  detectSelectorAliases,
};
