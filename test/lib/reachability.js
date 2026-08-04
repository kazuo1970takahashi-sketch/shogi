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
//   KL-5 派生パスの連結ランは、`+` の後ろの式オペランドを**構造**（`;` / `,` / 深さ 0 の
//        閉じ括弧）でしか区切らない。長さでは打ち切らない（001f）。長いオペランドは
//        concatLongOperands（R7 warn）で報告するだけで、参照は落とさない。
//   KL-6 検査2 の inert-trigger 判定は隠しファイル入力（<input type="file" style=display:none>）
//        に限る意図的な最小規則。
//
// -----------------------------------------------------------------------------
// PHASE1-REACH-001e（差し戻し 4 回目への対応・走査側）
// -----------------------------------------------------------------------------
//   (a) on* 判定を**実イベント名の有限リスト**にした。001d の `/^on[a-z]+$/i` では
//       `onbogus="deadFn()"` でも死んだ関数がルート化した（実測）。リストに無い on* 形の
//       属性は unknownOnAttrs として報告する（リスト漏れを黙って落とさないため）。
//   (b) 正規表現 vs 除算: **制御構文の `)` 直後**は正規表現を許可し、`++` / `--` の直後は
//       許可しない。001d は `if(x) /['"]/.test(s)` を除算と読み、`'` から文字列が始まった
//       ことになって**後続の生きたコードが文字列面に飲まれていた**（実測）。
//   (c) 連結ランは **`+` を読んだ直後にだけ**式オペランドを許す。001d はセミコロン無しで
//       並んだ独立 2 文を 1 本のランに繋ぎ（ASI 越境）、死んだ関数を生き返らせていた（実測）。
//   (d) 復号で `\xNN` / `\uXXXX` / `\u{...}` に対応。あわせて、復号後のトークンは元位置つきで
//       収集する（`"fn()` のように**元テキストでは 16 進数字と識別子が地続き**になり、
//       生テキストの識別子走査では候補にすら上がらないため）。
//   (e) `<label for>` 探索と inert-trigger のセレクタ別名を面／別名表で門番した。
//       001d は全文正規表現だったため、コメントに 1 行書くだけで検出が消えた（実測）。
//   (f) 「JS 文字列の中の on*= だけで生きている関数」を derivedOnlyReachable として報告する。
//       その HTML が実際に挿入されるかは静的には判定できない（一度も挿入されない死んだ
//       テンプレートかもしれない）。**隠さずに見せる**。
//
// -----------------------------------------------------------------------------
// PHASE1-REACH-001f（差し戻し 5 回目への対応・走査側）
// -----------------------------------------------------------------------------
//   (g) 派生パスの unknownOnAttrs を捨てていた（`classifyFaces(run.text)` を out 無しで
//       呼んでいた）ので、**JS 文字列の中の未知 on*= は R8 に一切出なかった**。
//       復号ランの out を受け取り、元位置へ写して報告する。
//   (h) イベント名の有限リストに実在イベントが 6 件漏れていた（onmousewheel /
//       onpointerrawupdate / onfullscreenchange / onfullscreenerror / oncommand /
//       onscrollsnapchange）。漏れは「生きた関数を R1 error で殺す」方向に倒れ、
//       虚偽の allowlist 登録以外に緑化手段が無い＝最も危険な向きの誤り。
//       出典と更新方針はリスト直上のコメントに明記した。
//   (i) 連結ランの**打ち切りを廃止**した。001e は `+` の後ろの式オペランドを
//       CONCAT_SKIP_LIMIT 文字で打ち切り、そこで連結を止めていたため、長い式を挟んだ
//       だけで**生きた関数が R1 error 化**した（001e の境界テストは fixture 側で
//       allowlist に事前登録していたので、この向きを証明できていなかった）。
//       いまは構造（`;` / `,` / 閉じ括弧）だけで止め、長さは
//       CONCAT_OPERAND_REPORT_LIMIT を超えたときに **報告するだけ**にする。
//       ＝ 打ち切りに起因して参照を落とすことは無い。
//   (j) その報告（R7）の識別子を行番号から**所有関数名＋序数**へ変えた。行番号だと
//       無関係な編集で行がずれるたびに差分照合が毒される。
//
// -----------------------------------------------------------------------------
// PHASE1-REACH-001t（Codex P1-1 / P1-2・字句の行終端）
// -----------------------------------------------------------------------------
//   (k) ES5 §7.3 の LineTerminator は LF / CR / U+2028 / U+2029 の **4 種**だが、
//       face レクサは改行を `'\n'` の 1 種でしか見ていなかった。
//       - 行コメントの終端が LF のみ → CR-only / U+2028 / U+2029 の行終端だと
//         **次行の実コードまで JS_LINE_COMMENT 面に飲まれる**（呼出が消え、生きた
//         関数が到達不能と報告される）。
//       - 文字列の行継続（§7.8.4 LineContinuation）で `\` + CRLF は 1 単位なのに
//         `j += 2` が `\` と CR しか消費せず、**残った LF を文字列終端と誤認**して
//         以降の面分類が崩れる（関数が登録すらされない）。
//       改行を扱う字句（行コメント終端・行継続・正規表現リテラルの未終端判定）は
//       isLineTerminator（4 種）で判定し、CRLF は 1 つの LineTerminatorSequence
//       として読む。**例外は文字列リテラルの終端**（#816 hotfix）: ES2019 の改訂で
//       生の U+2028 / U+2029 は文字列の中に置けるため、打ち切るのは LF / CR だけ。
//       箇所ごとに規則が違う——4 種で平坦に揃えると、既存の文字列リテラルに LS / PS
//       を 1 文字置くだけで走査が盲目になる（001t の退行）。テンプレートリテラルは
//       生の改行も `\` + 改行も中身が同じ JS_TMPL_STR 面のままなので**改行の種類に
//       依存しない**（test_reachability_001.js の LT-* が使用箇所ごとに固定する）。
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
// ES5 §7.3 LineTerminator の 4 種（001t）。CRLF は呼び出し側で 1 単位として扱う。
const isLineTerminator = (ch) => ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
const ATTR_NAME_CH = /[a-zA-Z0-9:_-]/;

// インラインイベントハンドラ属性の**有限リスト**（HTML 仕様の event handler content
// attributes ＋ pointer/touch/animation/transition ＋ window/body 系）。
// PHASE1-REACH-001e: 001d は `/^on[a-z]+$/i` で判定していたため `onbogus="deadFn()"` の
// ような**存在しないイベント名**でも死んだ関数がルート化した（実測で再現）。
// 逆に、ここに無い実イベント名は「生きた関数を死んだと言う」方向に倒れるので、
// on* に見えてリストに無い属性は unknownOnAttrs として報告し、黙って落とさない。
//
// **出典と更新方針**（PHASE1-REACH-001f）:
//   出典 = HTML Living Standard の event handler content attributes（GlobalEventHandlers /
//   WindowEventHandlers）＋ Pointer Events / Touch Events / CSS Animations・Transitions /
//   Fullscreen API の各仕様、および歴史的に実装がある非標準名（onmousewheel 等）。
//   更新方針 = **足す方向にしか運用しない**。R8 warn（未知の on*）が出たら、実イベント名なら
//   ここへ追加して 1 行の出典コメントを添える。消す判断は「そのイベント名が実在しない」
//   ことを示せたときだけ。リストが短い方に倒れると生きた関数が R1 で殺され、虚偽の
//   allowlist 登録以外に緑化手段が無くなる（001f・中1 で実測された向き）。
const ON_EVENT_ATTRS = new Set([
  'onabort', 'onauxclick', 'onbeforeinput', 'onbeforematch', 'onbeforetoggle', 'onblur',
  'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'onclose',
  'oncontextlost', 'oncontextmenu', 'oncontextrestored', 'oncopy', 'oncuechange', 'oncut',
  'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragexit', 'ondragleave',
  'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onencrypted',
  'onended', 'onerror', 'onfocus', 'onformdata', 'oninput', 'oninvalid', 'onkeydown',
  'onkeypress', 'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart',
  'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover',
  'onmouseup', 'onpaste', 'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange',
  'onreset', 'onresize', 'onscroll', 'onscrollend', 'onsearch', 'onsecuritypolicyviolation',
  'onseeked', 'onseeking', 'onselect', 'onselectionchange', 'onselectstart', 'onslotchange',
  'onstalled', 'onsubmit', 'onsuspend', 'ontimeupdate', 'ontoggle', 'onvolumechange',
  'onwaiting', 'onwheel',
  'onpointerdown', 'onpointerup', 'onpointermove', 'onpointerover', 'onpointerout',
  'onpointerenter', 'onpointerleave', 'onpointercancel', 'ongotpointercapture',
  'onlostpointercapture',
  'ontouchstart', 'ontouchend', 'ontouchmove', 'ontouchcancel',
  'onanimationstart', 'onanimationend', 'onanimationiteration', 'onanimationcancel',
  'ontransitionstart', 'ontransitionrun', 'ontransitionend', 'ontransitioncancel',
  'onafterprint', 'onbeforeprint', 'onbeforeunload', 'onhashchange', 'onlanguagechange',
  'onmessage', 'onmessageerror', 'onoffline', 'ononline', 'onpagehide', 'onpageshow',
  'onpopstate', 'onrejectionhandled', 'onstorage', 'onunhandledrejection', 'onunload',
  // 001f で追加した 6 件（漏れていた実在イベント名。cowork パネルの指摘・中1）
  'onmousewheel',          // 非標準だが主要ブラウザに実装がある（wheel の旧名）
  'onpointerrawupdate',    // Pointer Events Level 3
  'onfullscreenchange', 'onfullscreenerror',   // Fullscreen API
  'oncommand',             // Invoker Commands API（command / commandfor）
  'onscrollsnapchange',    // CSS Scroll Snap Events
  // 001g で追加。**001f が足した各仕様の「兄弟」を機械的に総なめして閉じた**
  // （1 件足して対になる 1 件を落とす、が 001f の残り方だった）。
  'onscrollsnapchanging',                          // CSS Scroll Snap Events（change の対）
  'onpagereveal', 'onpageswap',                    // HTML / Navigation API（Window）
  'ongamepadconnected', 'ongamepaddisconnected',   // Gamepad API（Window）
  'oncontentvisibilityautostatechange',            // CSS Containment
  'onpointerlockchange', 'onpointerlockerror',     // Pointer Lock（Document）
  'ondeviceorientation', 'ondeviceorientationabsolute', 'ondevicemotion', // DeviceOrientation（Window）
  'onorientationchange',                           // 画面向き（Window・歴史的）
  'onwaitingforkey',                               // Encrypted Media Extensions
  'onbeforexrselect',                              // WebXR
  'onwebkitfullscreenchange', 'onwebkitfullscreenerror', // WebKit 接頭辞つき Fullscreen（実装あり）
  'onbeforeinstallprompt', 'onappinstalled',       // Web App Install（Window・実装あり）
]);
// 「on* に見える」形。リストとの差が unknownOnAttrs になる。
const ON_ATTR_SHAPE_RE = /^on[a-z]+$/i;

// 正規表現リテラル判定で「直前が値ではない」ことを示すキーワード。
const KW_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);
const PUNCT_BEFORE_REGEX = '([{,;:=!&|?+-*%~^<>';

// `)` の直後に正規表現リテラルが来られるのは、その `(` が制御構文のものだったときだけ。
//   if (x) /re/.test(s)   ← 正規表現
//   f(x)   /2/ g          ← 除算
// PHASE1-REACH-001e: 001d は `)` 直後を一律「除算」としていたため、`if(x) /['"]/.test(s)`
// で `'` から文字列が始まったことになり、**後続の生きたコードが文字列面に飲まれて**
// 参照が消える（実測: 直後の `var live` が JS_STR_SQ になった）。
const KW_CONTROL_PAREN = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

// 文の終端判定で「ブロックの後ろに続く＝まだ同じ文」を示すキーワード。
const KW_CONTINUES_STATEMENT = new Set(['else', 'catch', 'finally', 'while']);

// 派生パス: `+` の後ろの**式オペランド 1 個**の長さが、これを超えたら報告する閾値。
//   PHASE1-REACH-001f: 001e はこれを**打ち切り**の閾値にしていた（超えたら連結を止める）。
//   その結果、長い式を 1 つ挟んだだけで結線が見えなくなり、**生きた関数が R1 error 化**した。
//   いまは打ち切らない ＝ オペランドの終わりは構造（`;` / `,` / 深さ 0 の閉じ括弧）だけで決め、
//   長さは「見ておいた方がよい」という **報告（R7 warn）** にしか使わない。
//   ＝ 閾値をどう動かしても参照を落とす方向には効かない。
const CONCAT_OPERAND_REPORT_LIMIT = 400;
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
    unknownOnAttrs: (out && out.unknownOnAttrs) || [],
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

  if (out) {
    out.scriptBlocks = ctx.scriptBlocks;
    out.unknownOnAttrs = ctx.unknownOnAttrs;
  }
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

    // ★ on* 判定は「属性名トークン全体」が**実イベント名の有限リスト**に載っていること。
    //   data-onclick は完全一致しない／onbogus はリストに無い＝どちらも ATTR_VAL。
    const isOn = ON_EVENT_ATTRS.has(aname);
    if (!isOn && ON_ATTR_SHAPE_RE.test(aname)) ctx.unknownOnAttrs.push({ pos: as, name: aname });
    const vf = isOn ? FACE.ATTR_VAL_ON : FACE.ATTR_VAL;
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
  const parenStack = [];  // 各 '(' が制御構文のものか（`if (x) /re/` の判別用）
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
      // 行コメントの終端は LineTerminator 4 種のいずれか（001t: LF だけだと CR-only /
      // U+2028 / U+2029 で次行の実コードまでコメント面に飲まれる）。終端文字自体は
      // コメントに含めない（LF のときの従来挙動と同じ）。
      let j = i + 2;
      while (j < end && !isLineTerminator(src[j])) j++;
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
      // 'ctrl)' は制御構文の閉じ括弧＝直後の / は正規表現。'++' / '--' の直後は必ず除算。
      const regexOk = last === null
        || last === 'ctrl)'
        || (last.length === 1 && PUNCT_BEFORE_REGEX.indexOf(last) >= 0)
        || KW_BEFORE_REGEX.has(last)
        || last === '=>';
      if (regexOk) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < end) {
          const c = src[j];
          if (c === '\\') {
            // 正規表現の \ の後ろに LineTerminator は置けない（§7.8.5）＝未終端として
            // 打ち切り、この / は除算へフォールバックする（001t）。
            if (isLineTerminator(src[j + 1])) break;
            j += 2;
            continue;
          }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { closed = true; break; }
          else if (isLineTerminator(c)) break;
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
        if (src[j] === '\\') {
          // LineContinuation（§7.8.4）: `\` + CRLF は 3 文字で 1 単位（001t: 旧実装は
          // `\` と CR しか消費せず、残った LF を文字列終端と誤認した）。
          // `\` + LF / CR / U+2028 / U+2029 は従来どおり j += 2 で 1 単位になる。
          j += (src[j + 1] === '\r' && src[j + 2] === '\n') ? 3 : 2;
          continue;
        }
        // 文字列リテラルを打ち切る生の改行は LF / CR だけ（#816 hotfix）。
        // ES5 §7.8.4 は ES2019 で改訂され、生の U+2028 / U+2029 は文字列リテラルの
        // 中に置ける（JSON superset・現行エンジンはすべて合法として実行する）。
        // 同じ LineTerminator でも規則は箇所ごとに違う — 行コメントは 4 種すべてで
        // 終端する（そちらは正しい）。ここを isLineTerminator（4 種）にすると、
        // 既存の文字列リテラルに LS / PS を 1 文字置くだけで走査が崩れる
        // （001t の退行。実測: 対象 580 関数 → 17 関数）。
        if (src[j] === q || src[j] === '\n' || src[j] === '\r') break;
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
    // '(' は「制御構文の括弧か」を覚えておく。')' でそれを last へ反映する。
    if (ch === '(') {
      face[i] = FACE.JS_CODE;
      parenStack.push(last !== null && KW_CONTROL_PAREN.has(last));
      last = '(';
      i++;
      continue;
    }
    if (ch === ')') {
      face[i] = FACE.JS_CODE;
      last = parenStack.pop() ? 'ctrl)' : ')';
      i++;
      continue;
    }
    // '++' / '--' は 1 トークンとして読む（直後の / は必ず除算）。
    if ((ch === '+' || ch === '-') && src[i + 1] === ch) {
      ctx.set(i, i + 2, FACE.JS_CODE);
      last = ch + ch;
      i += 2;
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
// PHASE1-REACH-001e: `\xNN` / `\uXXXX` / `\u{...}` も復号する（001d は素通しだったため
// `\x3cbutton onclick=...` の形で書かれた結線を拾えなかった）。
const HEX2 = /^[0-9a-fA-F]{2}$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;

// 「復号すると '<' になりうる」形。連結ランの復号を省略してよいかの足切りに使う。
const LT_SHAPE_RE = /<|\\x3c|\\u003c|\\u\{0*3c\}/i;

function decodeSpanInto(src, a, b, stripStart, stripEnd, chars, map) {
  const s = stripStart ? a + 1 : a;
  const e = stripEnd ? b - 1 : b;
  const push = (text, at) => { for (const ch of text) { chars.push(ch); map.push(at); } };
  for (let k = s; k < e; k++) {
    if (src[k] !== '\\' || k + 1 >= e) { chars.push(src[k]); map.push(k); continue; }
    const c = src[k + 1];
    if (c === 'x' && k + 3 < e && HEX2.test(src.slice(k + 2, k + 4))) {
      push(String.fromCharCode(parseInt(src.slice(k + 2, k + 4), 16)), k + 3);
      k += 3;
      continue;
    }
    if (c === 'u' && src[k + 2] === '{') {
      const close = src.indexOf('}', k + 3);
      if (close > 0 && close < e && /^[0-9a-fA-F]{1,6}$/.test(src.slice(k + 3, close))) {
        push(String.fromCodePoint(parseInt(src.slice(k + 3, close), 16)), close);
        k = close;
        continue;
      }
    }
    if (c === 'u' && k + 5 < e && HEX4.test(src.slice(k + 2, k + 6))) {
      push(String.fromCharCode(parseInt(src.slice(k + 2, k + 6), 16)), k + 5);
      k += 5;
      continue;
    }
    chars.push(Object.prototype.hasOwnProperty.call(JS_ESCAPES, c) ? JS_ESCAPES[c] : c);
    map.push(k + 1);
    k++;
  }
}

// p から始まる文字列面スパンの終端（排他）。
function spanEnd(face, p) {
  const f = face[p];
  let e = p;
  while (e < face.length && face[e] === f) e++;
  return e;
}

// `+` の後ろの式オペランドを読み飛ばし、次の文字列面の開始位置を返す。
//   戻り値 >= 0: そこから連結が続く
//   戻り値 -1  : 連結ではない（; , や深さ 0 の閉じ括弧＝式の終わりに当たった）
// PHASE1-REACH-001f: 長さによる打ち切りは廃止した。止まるのは**構造**だけ
//   （`;` / `,` / 深さ 0 の閉じ括弧 / ファイル終端）。長いオペランドは呼び出し側が
//   concatLongOperands に記録して R7 warn で見せるだけで、連結は続行する。
function skipConcatOperand(src, face, from) {
  let depth = 0;
  for (let q = from; q < src.length; q++) {
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
//   ラン ＝ `+` で連なった文字列リテラル（間の式はプレースホルダ 1 文字）とテンプレート。
//   PHASE1-REACH-001e の修正: **`+` を読んだ直後にだけ式オペランドを許す**。
//   001d は「文字列の次が `+` でない」場合にも式として読み飛ばしていたため、
//   セミコロン無しで並んだ**独立した 2 文**を 1 本のランに繋いでいた（ASI 越境・実測で再現）:
//       var a = '<button onclick="'
//       var b = 'deadFn()">go</button>'
//   これで deadFn が ATTR_VAL_ON に昇格し、死んだ関数が生き返っていた。
//   連結は `'…' + x + '…'` の形しか無いので、`+` を必須にすれば構造的に閉じる。
//   PHASE1-REACH-001g の修正: **どのランにも入らなかった文字列面を第 2 掃引で拾う**。
//   001f までは「ランに参加した文字列」しか復号しなかったため、
//       '<div>' + esc('<b onclick="live()">x</b>') + '</div>'
//   のように**式オペランドの中（関数呼出の引数）にある HTML 文字列**が一度も走査されず、
//   同じ文字列が連結の外にあれば拾われるのに中にあると参照が消える、という非対称があった
//   （生きた関数が R1 error で殺され、虚偽の allowlist 登録以外に緑化手段が無い＝最悪の向き）。
//   テンプレートの `${ ... }` の中の文字列も同じ理由で落ちていた。
function collectConcatRuns(src, face, longOperands) {
  const runs = [];
  const N = src.length;
  // ランの部品として消費した文字列面の位置。第 2 掃引の対象から外すために持つ。
  const consumed = new Uint8Array(N);
  let i = 0;
  while (i < N) {
    if (!CONCAT_FACES.has(face[i])) { i++; continue; }
    // まず「どの範囲を復号するか」だけを決める（'<' を含まないランは復号しない＝高速化）。
    const parts = [];
    const runStart = i;
    let p = i;
    let expectOperand = false;   // 直前に '+' を読んだか
    for (;;) {
      const t = skipTrivia(src, face, p);
      if (t < 0) { p = N; break; }
      const f = face[t];
      if (CONCAT_FACES.has(f)) {
        const e = spanEnd(face, t);
        parts.push({ a: t, b: e });
        p = e;
        expectOperand = false;
        continue;
      }
      if (f === FACE.JS_TMPL_DELIM && src[t] === '$') {
        parts.push(null);                       // ${ ... } はプレースホルダ
        p = skipTemplateHole(src, face, t);
        expectOperand = false;
        continue;
      }
      if (f === FACE.JS_CODE && src[t] === '+') {
        if (expectOperand) { p = t; break; }    // '+ +' は連結ではない
        p = t + 1;
        expectOperand = true;
        continue;
      }
      if (f === FACE.JS_CODE && expectOperand) {
        const nx = skipConcatOperand(src, face, t);
        if (nx < 0) { p = t; break; }
        // 長いオペランドは「見ておいた方がよい」印だけ残す。連結は続行する（001f）。
        if (nx - t > CONCAT_OPERAND_REPORT_LIMIT) {
          longOperands.push({ pos: t, runStart, length: nx - t });
        }
        parts.push(null);                       // 式オペランドはプレースホルダ
        p = nx;
        expectOperand = false;
        continue;
      }
      p = t;
      break;
    }
    if (parts.length) {
      for (const part of parts) if (part) consumed.fill(1, part.a, part.b);
      // '<' を含みえないランは復号しない（高速化）。エスケープ表記も見る。
      let hasLt = false;
      for (const part of parts) {
        if (part && LT_SHAPE_RE.test(src.slice(part.a, part.b))) { hasLt = true; break; }
      }
      if (hasLt) {
        const chars = [];
        const map = [];
        for (const part of parts) {
          if (!part) { chars.push(CONCAT_PLACEHOLDER); map.push(-1); continue; }
          decodePartInto(src, face, part.a, part.b, chars, map);
        }
        if (chars.length) runs.push({ start: runStart, end: p, text: chars.join(''), map });
      }
    }
    i = Math.max(p, i + 1);
  }

  // --- 第 2 掃引（001g・高4）------------------------------------------------
  // どのランの部品にもならなかった文字列面（＝式オペランドの中・`${ }` の中）を、
  // それ単独のランとして拾う。「連結の外なら拾うが中だと落とす」非対称を消す。
  let q = 0;
  while (q < N) {
    if (!CONCAT_FACES.has(face[q]) || consumed[q]) { q++; continue; }
    const e = spanEnd(face, q);
    if (LT_SHAPE_RE.test(src.slice(q, e))) {
      const chars = [];
      const map = [];
      decodePartInto(src, face, q, e, chars, map);
      if (chars.length) runs.push({ start: q, end: e, text: chars.join(''), map });
    }
    q = e;
  }
  return runs;
}

// 文字列面のスパン [a, b) を「引用符を外して」復号バッファへ足す。
function decodePartInto(src, face, a, b, chars, map) {
  const q = src[a];
  const stripStart = (q === '"' || q === "'" || q === '`')
    && (a === 0 || face[a - 1] !== FACE.JS_TMPL_DELIM);
  const lastCh = src[b - 1];
  const stripEnd = (lastCh === '"' || lastCh === "'" || lastCh === '`')
    && (b - 1 > a || !stripStart);
  decodeSpanInto(src, a, b, stripStart, stripEnd, chars, map);
}

// 復号ランへ HTML ミニレクサを再帰適用し、ATTR_VAL_ON を元の位置へ重ねる。
// 昇格した位置は derived（Set）に記録する＝「その参照は派生パス由来」だと後から言える。
function markHtmlInJsStrings(src, face, derived, longOperands, tokens, unknownOnAttrs) {
  const marked = [];
  for (const run of collectConcatRuns(src, face, longOperands)) {
    if (run.text.indexOf('<') < 0) continue;          // HTML の組み立てではない
    // 001f: 再帰適用の out を捨てていたため、**JS 文字列の中の未知 on*= が R8 に
    // 一切出なかった**（`markHtmlInJsStrings` が `classifyFaces(run.text)` を out 無しで
    // 呼んでいた 1 行のバグ）。復号位置を元位置へ写して報告する。
    const innerOut = { scriptBlocks: [], unknownOnAttrs: [] };
    const inner = classifyFaces(run.text, innerOut);
    for (const u of innerOut.unknownOnAttrs) {
      const at = run.map[u.pos];
      unknownOnAttrs.push({ pos: at >= 0 ? at : run.start, name: u.name, viaDerived: true });
    }
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
        if (prev >= 0 && at - prev === 2) { face[at - 1] = FACE.ATTR_VAL_ON; derived.add(at - 1); }
        face[at] = FACE.ATTR_VAL_ON;
        derived.add(at);
        prev = at;
        hit++;
      }
      if (hit) marked.push({ runStart: run.start, start: run.map[k], length: e - k });
      // 復号後のトークンを元位置つきで拾っておく。エスケープで書かれた属性値
      //   '\x3cbutton onclick="fn()"\x3e'
      // は、**元ソースでは `2fn` のように識別子が 16 進数字と地続き**になるため、
      // 生テキストの識別子走査では候補にすら上がらない（＝生きた関数を殺す方向）。
      const seg = run.text.slice(k, e);
      for (const t of seg.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
        const at = run.map[k + t.index];
        if (at >= 0) tokens.push({ name: t[0], pos: at });
      }
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
//   001e: セレクタ・ヘルパの別名（$id 等）もここで見る。detectDeadBindings だけが
//   別名を知っていて、こちらが知らないと「ヘルパへ抽出しただけで検出が消える」
//   非対称が残る（実測: 抽出後のファイルで #loadFile / loadData の検出が消えた）。
function detectInertTriggers(src, face, ownerOf, isReachable, aliases) {
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
    // <label for="ID"> も面で門番する（001e・自己申告2 の解消）。
    // 001d は全文正規表現だったため、コメントに 1 行書くだけで #loadFile / loadData の
    // 検出が消えることを実測で確認している。
    const labelRe = new RegExp('<label[^>]*\\bfor\\s*=\\s*["\']' + esc + '["\']', 'g');
    let hasLabel = false;
    for (const lm of src.matchAll(labelRe)) {
      if (face[lm.index] === FACE.HTML_TAG) { hasLabel = true; break; }
    }
    if (hasLabel) continue;

    const sites = [];
    const methods = SELECTOR_METHODS.concat((aliases || []).map((x) => escapeRe(x.name)));
    const selRe = new RegExp('(?:' + methods.join('|') + ")\\(\\s*['\"]#?" + esc + "['\"]\\s*\\)", 'g');
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
  const lexOut = { scriptBlocks: [], unknownOnAttrs: [] };
  const baseFace = classifyFaces(src, lexOut);
  const face = Uint8Array.from(baseFace);

  // --- (ii) 派生パス: JS 文字列で組み立てた HTML の on*= を ATTR_VAL_ON へ ---
  const derivedPositions = new Set();
  const concatLongOperands = [];
  const derivedTokens = [];
  const derivedHandlers = markHtmlInJsStrings(
    src, face, derivedPositions, concatLongOperands, derivedTokens, lexOut.unknownOnAttrs,
  );

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
  // 派生パスが復号して見つけたトークン（エスケープで生テキストの語境界が壊れている分）。
  for (const t of derivedTokens) {
    if (!byName.has(t.name)) continue;
    const list = occ.get(t.name);
    if (list) { if (list.indexOf(t.pos) < 0) list.push(t.pos); } else occ.set(t.name, [t.pos]);
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
      const viaDerived = derivedPositions.has(p);
      if (!refSites.has(name)) refSites.set(name, []);
      refSites.get(name).push({ pos: p, owner: o, face: FACE_NAME[face[p]], viaDerived });
      if (o === null) {
        if (!roots.has(name)) roots.set(name, []);
        roots.get(name).push({ pos: p, face: FACE_NAME[face[p]], viaDerived });
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

  // 派生パス（JS 文字列の中の on*=）が無ければ到達不能になる関数。
  //   その HTML が実際に DOM へ挿入されるかは静的には判定できない（一度も挿入されない
  //   死んだテンプレートかもしれない）。**隠さずに見せる**のが 001e の方針。
  const graphNoDerived = new Map();
  const rootsNoDerived = new Set();
  for (const [name, sites] of refSites) {
    for (const s of sites) {
      if (s.viaDerived) continue;
      if (s.owner === null) rootsNoDerived.add(name);
      else addEdge(graphNoDerived, s.owner, name);
    }
  }
  const reachNoDerived = reachFrom(rootsNoDerived, graphNoDerived);
  const derivedOnlyReachable = allNames
    .filter((n) => reachStatic.has(n) && !reachNoDerived.has(n))
    .sort();

  // --- 検査2（レポートのみ）: 死んだ結線 → 死んだ領域 → 実行時到達可能性 ----
  const aliases = detectSelectorAliases(src, out.topFunctions);
  const notProduced = detectDeadBindings(src, face, aliases, buildTokenIndex(src));
  const inert = detectInertTriggers(src, face, ownerOf, (n) => reachStatic.has(n), aliases);
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

  // 長い連結オペランドの報告（R7）。識別子は「所有関数名＋その中での序数」で作る。
  //   001e は行番号を識別子にしていたため、無関係な 1 行の増減で sig が変わり、
  //   差分照合の allowed 集合から外れて 8 アサーションが毒された（001f・中2）。
  const longOperandReports = (() => {
    const sorted = concatLongOperands.slice().sort((x, y) => x.pos - y.pos);
    const ord = new Map();
    return sorted.map((t) => {
      const owner = ownerOf(t.pos) || '(top-level)';
      const n = (ord.get(owner) || 0) + 1;
      ord.set(owner, n);
      return { owner, ord: n, id: owner + '#' + n, line: lineOf(t.pos), length: t.length };
    });
  })();

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
    // 001e で追加した「隠さずに見せる」ための報告（いずれもレポート層＝warn 行き）
    derivedOnlyReachable,
    // R7 の識別子は**所有関数名＋その中での序数**（行番号にすると無関係な編集で行が
    // ずれるたびに差分照合が毒される・001f 中2）。
    concatLongOperands: longOperandReports,
    unknownOnAttrs: lexOut.unknownOnAttrs
      .slice()
      .sort((x, y) => x.pos - y.pos)
      .map((u) => ({
        name: u.name, line: lineOf(u.pos), viaDerived: !!u.viaDerived, owner: ownerOf(u.pos),
      })),
    faceStats: faceStats(baseFace),
    selectorAliases: aliases.map((a) => a.name).sort(),
    rootNames: [...roots.keys()].sort(),
    unreachableStatic,
    unreachableRuntimeOnly,
    deadBindings: deadBindings.map((d) => ({
      selector: d.selector, kind: d.kind, reason: d.reason, line: lineOf(d.pos), pos: d.pos,
    })),
    // 検算・デバッグ用
    _internal: {
      face, baseFace, byName, graph, roots, refSites, deadRegions, lineOf, ownerOf,
      commentRefs, stringRefs, markupRefs, describe, derivedHandlers, derivedPositions,
      topFunctions: out.topFunctions,
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
  CONCAT_OPERAND_REPORT_LIMIT,
  ON_EVENT_ATTRS,
  statementEnd,
  detectSelectorAliases,
};
