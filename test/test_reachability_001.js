#!/usr/bin/env node
// PHASE1-REACH-001: 到達可能性チェックの常設化（スライス1A＝製品側のみ）
//   走査ロジックは test/lib/reachability.js、既知例外は test/reachability_allowlist.json。
//   Issue #798 の調査（静的に到達不能な 30 関数 / 実行時のみ 10 関数 / 死んだ結線 5）を
//   常設の CI ゲートに落としたもの。
//
//   ── 001h で PR を分割した（作者判断 2026-08-02 / ref #816）────────────────────
//   7 巡の差し戻しで、**検査1（静的到達可能性の判定そのもの）が破られたことは一度も無い**。
//   破られ続けたのは「検査を検査する側」＝ハーネスの足場だった。そこで:
//     - スライス1A（このファイル）= 検査1 のブロッキング常設化 ＋ warn 可視化 ＋
//       allowlist 規律 ＋ 移行オラクル。
//     - スライス1B（Issue #816）= 変異バッテリ・枯れ検査・E2E 操作リスト・dq probe 等。
//       **`test/tools/reach_mutation_battery.js` へそのまま退避した（1 行も捨てていない）**。
//       `test/tools/` は run_tests.sh の自動発見に載らないので CI からは走らない。
//       これは意図的な一時措置で、置き場と blocking 方針は #816 が決め直す。
//
//   ── このファイルを貫く拘束（受け入れ基準の中心）────────────────────────────
//   > ブロッキングテストは、合成 fixture と「そのファイルの解析結果」にのみ依存してよい。
//   > 実在の1例が在ることに依存してはならない。
//
//   4 巡連続で同じ形に破られた（S1/S16 の実数 pin → M2 の「唯一ルート」→
//   T-0d/ON_SPANS[0] → M4/M5 の static[0]・S19 の「実例が在る ⇒ …」の推論）。
//   個別に塞ぐのをやめ、**残す assert を次の 4 種だけに機械的に限定する**:
//
//     C1  合成 fixture（`__reachFixture*` 注入）に対する判定
//     C2  「そのファイルを解析した結果」と allowlist / baseline の双方向照合（R0/R1/R4/R5/A5）
//     C3  構造不変条件（面の完全性＝未分類 0・総延長＝ファイル長）
//     C4  情報表示（census）— assert しない
//
//   実ファイル由来の配列への添字参照（`static[0]` / `ON_SPANS[0]` / `shift()` 等）と、
//   実例の存在を前提にした推論は**このファイルには 1 つも無い**（全部 battery 側へ送った）。
//   `pinIf`（実例が無ければ skip）も置いていない＝ skip 0 が常態で、
//   「在庫が尽きて黙って skip になった」状態そのものが起きない。
//
//   ── 子プロセスをやめた ────────────────────────────────────────────────
//   「実際にコミットしたら緑か」は 001e〜001g では本スイートを子プロセスで 9 本
//   丸ごと再実行して測っていた（2 コア環境でフル 2m34s〜5m34s）。001h は
//   **ゲート判定を 1 本の関数 gate() に括り出し、変異済みの解析結果に同じ gate() を
//   当てて判定する**（受け入れ基準2）。子プロセス方式は battery 側に温存してある。
//
//   ── 001i で塞いだ穴（差し戻し8回目・2026-08-02）──────────────────────────
//   001h に残っていたのは「実在庫アンカー 2 箇所」と「新規に書いた部分の穴 1 箇所」。
//   高1 **⑧ の allowlist 上限を実ファイルの allowlist 件数から引かない**。旧版は
//        `allowCount(ALLOW) - 1` だったので、allowlist が 0 件 / 1 件になると上限が
//        -1 / 0 になり `A5-0`（上限 > 0）が落ちた。＝ **#798 の掃除を守るためのゲートが、
//        掃除の完了を禁止するゲートになっていた**（掃除の最終局面で必ず通る状態）。
//        → 合成の死んだ関数 2 本とその allowlist エントリ 2 件で境界を作る（`a5BoundaryOp`）。
//        ディスク上の allowlist が 0 件 / 1 件の状態そのものも ⑭⑮⑯ で常設化した。
//   高2 **STYLE_CSS の probe を `<style>` ごと注入する**（`insertStyleBlock`）。旧版は
//        「最後の STYLE_CSS 面」を探して差し込んでいたので、CSS を外部スタイルシートへ
//        切り出すだけで（検査1 の結果は 1 ミリも動かないのに）15 本落ちた。
//        「CSS 外部化ファイルでも緑」は ⑰ で常設化。
//   高3 **R1 の正極性（`R1-POS-*`）を常設へ戻した**。001h の error 系 assert は
//        `errors.length === 0`（R0）と R5 の逆極性だけで、`add('error', 'R1', …)` →
//        `add('warn', 'R1', …)` の **1 語変異**が素通りしていた（新規の死にコードを
//        注入しても PASS=292 FAIL=0 exit 0 を実測）。この便の門番そのものだった。
//        降ろす切り分け基準が「ハーネス自衛か否か」だったため、C1 fixture で書ける
//        R1 の正極性検査まで一緒に battery へ出ていた＝分類の取りこぼし。
//   中1 OPS の条件付きガードを**全部 `omit()` に接続**し、キー集合を `OP-KEYS-*` で pin。
//        旧版は 6 ガード中 2 経路しか見ておらず、④ が消えているのに
//        「在庫が尽きて省いた操作: なし」と表示していた。
//
//   ── 001j で塞いだ穴（差し戻し9回目・2026-08-02）──────────────────────────
//   001i で「指摘された穴は全部塞がった」が、**同じ拘束が新しい場所へ移動していた**。
//   4 件とも「検査1 の結果は 1 ミリも動かない」のに落ちる形で、被害は最大級だった。
//   高1 **`insertHtml()` の `</body>` 探索を面で門番する**。生テキストの `lastIndexOf`
//        だったので、「実ファイルに `<style>` が在ること」への依存が
//        「**実ファイルの `</body>` が生テキスト最終出現であること**」へ移動しただけだった。
//        現ファイルは JS 文字列内に `'</body></html>'` を 3 箇所持っていて、それが偶然
//        すべて本物より前にあるから成立していた。`</body>` の**後ろ**に `<script>` を
//        1 本置くだけで fixture の注入が丸ごと JS 文字列に落ちる（実測 PASS=277 FAIL=35）。
//        `insertHtml` は面の表 16 面のうち 7 面 ＋ 各 probe が通る**単一障害点**。
//        `externalizeStyleBlocks` の `</head>` も同じ扱いにした。
//   高2 **`onAttrFullSpans()` に引用符省略値の枝を足した**。lib（`lexTag` 427-431）は
//        引用符省略値も ATTR_VAL_ON にするので、片方しか見ないと在庫ゼロ化が黙って
//        未完了になる（実測 `ZERO-2` / `ZERO-4` が落ちて PASS=317 FAIL=2）。
//   中1 **`externalizeStyleBlocks` の閉じタグ判定を lib と同じ `</style(?=[\s/>])` へ**。
//        `</style >` は lib が閉じタグとして正しく認識するのに剥がせず `CSS-EXT-1` が
//        落ちた（実測 PASS=318 FAIL=1）＝ ⑰（001i 高2 の常設化そのもの）が壊れる。
//   中2 **allowlist に `static` キーが無いと未捕捉 TypeError**（`esc.static.push` の 1 箇所
//        だけ `|| []` を持っていなかった）。掃除完了後に空配列ごと削るのは自然な後始末で、
//        その瞬間 PASS/FAIL の集計すら出なかった。
//   → 常設化: **⑱**（`</body>` の後ろに script ＋ 引用符省略 on* ＋ `</style >` の 3 形を
//     同時に）と **⑲**（allowlist の 3 キーを削除）＋ `SHAPE-1`〜`SHAPE-5`。
//     ⑰ が 001i 高2 の常設化だったのと同じ理由で、受け入れ基準は外部実測ではなく常設に置く。
//
//   ── 001k で塞いだ穴（差し戻し10回目・2026-08-02）──────────────────────────
//   001j が新設した `SHAPE-1` / `SHAPE-1b` **そのもの**へ拘束違反が移動していた（5 回目）。
//   `insertHtml` の生テキスト anchor を直したのは正しく、その依存が**新設の常設 assert**
//   へ移っただけだった。どれも「HTML として等価・検査1 の結果は 1 ミリも動かない」編集で
//   恒久赤になり、`ok()` 直打ちなので **allowlist では回避できない**（＝過去 4 回と同じ実害）。
//   高1 **`SHAPE-1` が「実ファイルに小文字の `</body>` が在る」ことへの無条件 assert**。
//        `lastTagPos` は文字クラスだけ lib に揃えて `lastIndexOf` を残していたので
//        **大文字小文字を区別**しており、lib（`ig`）が閉じタグと認める `</BODY>` を
//        見つけられず `-1` を返した（実測 PASS=328 FAIL=1 exit 1）。`</body></html>` の
//        削除（HTML5 では終了タグの省略が妥当）でも同じ。⑱ は `OP_KEYS_ALWAYS`
//        （在庫に一切依存しない）に登録されていたので、**この表示が偽だった**。
//        → 走査を lib と同じ正規表現（`ig`）へ。土台を `SHAPE_BASE`
//          （`ensureDocumentClose` で閉じタグを**自給自足**した src）にして登録を事実に合わせた。
//   高2 **`SHAPE-1b` が「実ファイルの `</body>` より後ろに生テキストの `</body>` が
//        無い」という実例前提の pin**。`SHAPE_SRC` 全体への `lastIndexOf` だったので、
//        それが自前注入の単引用符文字列に当たるのは偶然に過ぎない。`</body>` の直後に
//        **二重引用符**の文字列を持つ `<script>`（⑱ 自身が「定石の配置」と呼ぶ形）や、
//        `</body></html>` を含む HTML コメントを置くだけで恒久赤（実測 328/1 exit 1）。
//        → 全体 `lastIndexOf` を廃し、**自分が注入したマーカーから**引く（`tailBodyPos`）。
//   中1 **⑲ のキー欠落耐性が 5 キー中 3 キーで止まっていた**。全項目 0 になった
//        `baseline` を削るのも空配列を削るのと同程度に自然だが、`WI-7` / `WI-8` が
//        `undefined` と数値を比較していて全 OP のゲートで 2 本ずつ落ちた（`0 / undefined`）。
//        → baseline のキー欠落は **0 件として読む**。⑲ は 4 キー削除へ。
//   低1 `lastTagPos()` が先頭一致（`k===0`）で**無限ループ**した
//        （`lastIndexOf(needle, -1)` が同じ 0 を返し続ける・実測ハング）。正規表現化で解消。
//   → 常設化: **⑳ 形状バッテリ**（⑳a 大文字 / ⑳b 終了タグ省略 / ⑳c 二重引用符の tail
//     script / ⑳d 末尾コメント）＝ **上で恒久赤を作れた 4 形そのもの**。台帳のルール
//     「2 回目で手順見直し・3 回目で機械に置換」（RP-009）に従い、人が毎回探すのをやめる。
//     ⑳ は gate() が緑かだけでなく、**`shapeSelfChecks()` で SHAPE-1〜4 を 4 形すべてに
//     当て直す**（gate() だけ見ていると、この節の assert 自身が実例前提へ戻っても
//     気づけない＝ 001j がまさにそれだった）。操作 19 → **23**。
//
//   ── 001l で **自衛テスト一式を #816 へ移した**（作者判断 2026-08-02）────────────
//   ★ 上の 001j / 001k の「常設化」のうち、**ハーネス自衛の部分はこのファイルには無い**。
//     11 巡すべて、壊れたのは足場の自衛テストであって、**検査1（製品）は一度も
//     壊れていない**。001h で #816 として切り出したのはまさにその範囲だったのに、
//     「受け入れ基準を実測で終わらせず常設化しろ」という指示を重ねた結果、
//     自衛テストが #799 側へ積み直されていた（＝分割の意味が薄まっていた）。
//     001k の差し戻し（`SHAPE-7` の `</BODY>` 字面 pin と `</head>` 実在依存）も
//     その範囲の中の話なので、**個別に直すのではなく、範囲ごと #816 へ戻す**。
//   このファイルから外したもの（**1 行も捨てていない**。退避先は
//   `ai-requests/local/2026-08-02_reach-selfdefense-carryover.js`＝非コミットの置き場。
//   #816 の冒頭で「固定リストではなく**生成マトリクス**（大文字小文字 × 終了タグ内の
//   空白 × 終了タグ省略 × 末尾追記）として作り直す」土台になる）:
//     - **⑱**（生テキスト anchor 攻撃 3 形）と **⑳a〜⑳d**（形状バッテリ）。操作 23 → **18**。
//     - **`shapeSelfChecks()`** と `SHAPE-1` / `SHAPE-1b` / `SHAPE-2` / `SHAPE-2b` /
//       `SHAPE-3` / `SHAPE-4` / `SHAPE-7`〜`SHAPE-10`（`b` / `x` 付きを含む）。
//     - それらだけが使うヘルパ（`ensureDocumentClose` / `appendTailScript` /
//       `tailBodyPos` / `addUnquotedInlineHandler` / `loosenStyleCloseTag` /
//       `upperCloseTags` / `dropCloseTags` / `appendTailComment` / `SHAPE_BASE`）。
//   このファイルに残したもの:
//     - **①〜⑰**（実際の編集に対するゲートの耐性）と **⑲**（allowlist のキー欠落耐性）＋
//       `SHAPE-5` / `SHAPE-6`。allowlist は製品側の成果物で、001j 中2 で見つけて塞いだ
//       穴もここなので `withStaticEscape()` ごと残す。
//     - `lastTagPos` / `tagEndPos`。**`i` フラグ（case-insensitive）を含む 001k の
//       実装のまま**。`lastTagPos` は `insertHtml` / `externalizeStyleBlocks` の anchor。
//       **`tagEndPos` は 001l 時点で呼び出し元が 0 になる**（呼んでいたのは退避した
//       ヘルパだけ）。作者指示で残置＝ #816 が退避分を戻すときの対（閉じタグの終端規則
//       `</tag …>` の `>` まで）。**参照ゼロなので、壊しても常設側は緑のまま**である
//       ことを明示しておく（#816 で退避分と一緒に検出力を回復させる）。
//   ＝ 11 巡壊れ続けた「文書の閉じタグの形状」への依存は、常設側から**依存元ごと**消えた。
//
//   ── 常設から降ろした事実の明示（無言の降格にしない・中2 / 低）──────────────
//   - **枯れ検査 `WI-1`〜`WI-6` / `WI-M*` は常設に無い**（battery 側にのみ在る）。
//     したがって lib の `scanByCss('querySelector')` の 1 行を削っても**このファイルは
//     緑のまま**になる（battery では `WI-4` が捕まえる）。warn 層なので exit code には
//     効かないが、「降ろしたのは足場だけ」ではない＝ **lib（製品側の走査）の腐敗検査を
//     常設 CI に戻すかは Issue #816（H-2 / H-4）が決める**。
//     なお `WI-7` / `WI-8` は名前が WI でも枯れ検査ではなく、allowlist の件数と
//     baseline の二重記帳の照合。**`WI-8` は検査2 由来の bindings を実質ブロッキングに
//     引き上げる非対称**（R5 warn の指示どおり allowlist から外すと WI-8 が赤くなる）。
//     これも #816 で整理する。
//   - **`baseline.static_unreachable` は assert していない**（C4 census の表示だけ）。
//     runtime / bindings は `WI-7` / `WI-8` で件数照合しているのに static だけ非対称。
//     static は R1（error）と R5（error）の**双方向照合**で既にラチェットされており、
//     件数の二重記帳を足すと「死にコード 1 本削除」ごとに baseline 更新を強制することに
//     なるため、意図的に外している。baseline の意味論そのものは #816 H-6 で整理する。
//   - `insertTopLevelJs` はトップレベル関数が 0 個のファイルでは新しい `<script>` を
//     足す側にフォールバックする（旧版はバイト 0 に注入して面の表が全崩れした）。
//   - fixture の probe 属性名 `onbogus` / `onbogusderived` と同名の属性が製品側に
//     入ると `T[ATTR_VAL]-12` / `R8-DERIVED-3` が恒久 FAIL になる（現対象は非該当・#816）。
'use strict';

const fs = require('fs');
const path = require('path');
const {
  analyze, classifyFaces, faceStats, FACE, FACE_NAME, isRefFace, ON_EVENT_ATTRS,
} = require('./lib/reachability.js');

const target = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(target, 'utf8');
const ALLOW_PATH = process.env.REACH_ALLOWLIST || path.join(__dirname, 'reachability_allowlist.json');
const ALLOW = JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8'));

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

// allowlist の理由に求めるもの
const MIN_REASON = 20;
const ALLOW_CATEGORIES = new Set([
  'temporarily-preserved', 'test-only-hook', 'leftover-helper', 'functional-loss-pending',
]);
// 根拠参照（Issue 番号 / 行番号 / 日付）のいずれかを必ず含むこと。
const EVIDENCE_RE = /#\d+|L\d{2,}|\d{4}-\d{2}-\d{2}/;

// =============================================================================
// 判定本体: 解析結果 × allowlist → 違反リスト
//   errors   … CI をブロックする（検査1 ＝ 静的到達可能性と、allowlist の記述品質）
//   warnings … レポートのみ（検査2 ＝ 結線先 DOM の実在・起動経路、および派生パスの申し送り）
// =============================================================================
function evaluate(a, allow) {
  const errors = [];
  const warnings = [];
  const add = (severity, rule, subject, message) => {
    (severity === 'error' ? errors : warnings).push({ rule, subject, message, severity });
  };

  const staticFound = new Map(a.unreachableStatic.map((x) => [x.name, x]));
  const runtimeFound = new Map(a.unreachableRuntimeOnly.map((x) => [x.name, x]));
  const bindingFound = new Map(a.deadBindings.map((x) => [x.selector, x]));

  const staticAllow = new Map((allow.static || []).map((e) => [e.name, e]));
  const runtimeAllow = new Map((allow.runtime || []).map((e) => [e.name, e]));
  const bindingAllow = new Map((allow.bindings || []).map((e) => [e.selector, e]));

  // R1【error・検査1】静的に到達不能なのに allowlist に無い
  for (const [name, info] of staticFound) {
    if (!staticAllow.has(name)) {
      add('error', 'R1', name,
        `L${info.line} ${name}() がルートから到達不能なのに allowlist（static）に無い`);
    }
  }
  // R2【warn・検査2】実行時に到達不能なのに allowlist に無い
  for (const [name, info] of runtimeFound) {
    if (!runtimeAllow.has(name)) {
      add('warn', 'R2', name,
        `L${info.line} ${name}() は結線先の DOM が存在しない or 起動経路が無く実行時に到達不能なのに allowlist（runtime）に無い`);
    }
  }
  // R3【warn・検査2】死んだ結線なのに allowlist に無い
  for (const [sel, info] of bindingFound) {
    const why = info.reason === 'no-live-activation'
      ? 'この要素を起動するコードが到達不能なものしかない'
      : 'この id/class をどこでも生成していない';
    if (!bindingAllow.has(sel)) {
      add('warn', 'R3', sel,
        `L${info.line} ${sel} に結線しているが、${why}（allowlist（bindings）に無い）`);
    }
  }
  // R4【error】allowlist エントリの記述品質。**文字数だけでは骨抜きにできる**
  //   （"x"×20 で任意の死んだ関数を恒久緑化できることを実測した）ので形式照合にする:
  //     (a) category が既知の区分キーワード
  //     (b) reason が MIN_REASON 文字以上
  //     (c) reason に根拠参照（#Issue番号 / L行番号 / YYYY-MM-DD）が含まれる
  const reasonCheck = (list, key, section) => {
    for (const e of list || []) {
      const r = (e.reason || '').trim();
      const why = [];
      if (!ALLOW_CATEGORIES.has(e.category)) why.push(`category が既知の区分でない（${e.category}）`);
      if (r.length < MIN_REASON) why.push(`理由が短すぎる（${r.length} 文字 / ${MIN_REASON} 文字以上）`);
      if (!EVIDENCE_RE.test(r)) why.push('理由に根拠参照（#Issue番号 / L行番号 / YYYY-MM-DD）が無い');
      if (why.length) {
        add('error', 'R4', e[key], `allowlist（${section}）の ${e[key]}: ${why.join(' / ')}`);
      }
    }
  };
  reasonCheck(allow.static, 'name', 'static');
  reasonCheck(allow.runtime, 'name', 'runtime');
  reasonCheck(allow.bindings, 'selector', 'bindings');

  // R5 掃除漏れ。static は error、runtime / bindings は検査2 由来なので warn。
  for (const [name] of staticAllow) {
    if (!staticFound.has(name)) {
      add('error', 'R5', name,
        `allowlist（static）の ${name} は現在到達可能 or 未定義。allowlist から外すこと`);
    }
  }
  for (const [name] of runtimeAllow) {
    if (!runtimeFound.has(name)) {
      add('warn', 'R5', name,
        `allowlist（runtime）の ${name} は現在到達可能 or 未定義。allowlist から外すこと`);
    }
  }
  for (const [sel] of bindingAllow) {
    if (!bindingFound.has(sel)) {
      add('warn', 'R5', sel,
        `allowlist（bindings）の ${sel} は現在生成されている / 起動経路がある。allowlist から外すこと`);
    }
  }

  // R6【warn】JS 文字列の中の on*= だけで生きている関数。
  //   その HTML が実際に DOM へ挿入されるかは静的に判定できない（一度も挿入されない
  //   死んだテンプレートかもしれない）。**隠さずに見せる**。
  for (const name of a.derivedOnlyReachable || []) {
    add('warn', 'R6', name,
      `${name}() は JS 文字列の中の on*= だけで到達可能。その HTML が実際に挿入されるかは静的には判定できない`);
  }
  // R7【warn】連結ランに挟まっていた長い式オペランド。**参照は落としていない**（001f で
  //   打ち切りを廃止した）。「この辺りは目で見ておいた方がよい」という印。
  //   subject は行番号ではなく「所有関数名 #序数」＝無関係な編集で行がずれても変わらない。
  for (const t of a.concatLongOperands || []) {
    add('warn', 'R7', t.id,
      `L${t.line} ${t.owner} の文字列連結に ${t.length} 文字の式オペランドがある（連結は打ち切っていない）`);
  }
  // R8【warn】on* に見えるがイベント名リストに無い属性。リスト漏れなら見落としになる。
  for (const u of a.unknownOnAttrs || []) {
    add('warn', 'R8', u.name,
      `L${u.line} ${u.name}= は on* の形だが既知のイベント名ではない`
      + `${u.viaDerived ? '（JS 文字列の中／派生パス' + (u.owner ? ' ' + u.owner : '') + '）' : ''}`
      + '（実イベントならリストに足すこと）');
  }

  // A5【warn】allowlist の肥大。上限超過は「即 FAIL」をやめ、差分と R4 で運用する。
  const limits = allow.limits || {};
  const count = (allow.static || []).length + (allow.runtime || []).length;
  if (typeof limits.allowlist_max === 'number' && count > limits.allowlist_max) {
    add('warn', 'A5', 'allowlist',
      `allowlist が上限 ${limits.allowlist_max} 件を超えている: ${count} 件（増分の理由を確かめ、必要なら limits.reason ごと引き上げること）`);
  }

  return { errors, warnings, all: errors.concat(warnings) };
}

// =============================================================================
// 差分照合（fixture の基準状態との差だけを見る）
// =============================================================================
const sig = (v) => v.rule + ':' + v.subject;
const show = (vs) => (vs.length ? vs.map(sig).sort().join(' / ') : 'なし');

function deltaOf(baseList, mutList) {
  const b = new Set(baseList.map(sig));
  const m = new Set(mutList.map(sig));
  return {
    added: [...m].filter((x) => !b.has(x)).sort(),
    removed: [...b].filter((x) => !m.has(x)).sort(),
  };
}

// spec: { errors, errorsRemoved, warnings, warningsRemoved } の各値は {must, allowed}。
//   省略したキーは「増減なし」を要求する。allowed 省略時は must と同じ（＝完全一致）。
function checkDelta(emit, baseV, mutV, spec, label) {
  const de = deltaOf(baseV.errors, mutV.errors);
  const dw = deltaOf(baseV.warnings, mutV.warnings);
  const one = (got, want, what) => {
    const must = (want && want.must) || [];
    const allowed = (want && want.allowed) || must;
    for (const m of must) {
      emit(got.indexOf(m) >= 0, `${label}: ${what} に ${m} が無い（実測 [${got.join(', ')}]）`);
    }
    const stray = got.filter((s) => allowed.indexOf(s) < 0);
    emit(stray.length === 0, `${label}: ${what} に想定外が混ざっている [${stray.join(', ')}]`);
  };
  one(de.added, spec.errors, 'error 増分');
  one(de.removed, spec.errorsRemoved, 'error 減分');
  one(dw.added, spec.warnings, 'warn 増分');
  one(dw.removed, spec.warningsRemoved, 'warn 減分');
}

// =============================================================================
// 構造から引く anchor（行テキストの完全一致はしない）
// =============================================================================

// スクリプト直下（＝どの関数にも属さない位置）へコードを差し込む。
function insertTopLevelJs(src, a, code) {
  const tops = a._internal.topFunctions;
  // トップレベル関数が 1 つも無いファイルではアンカーが取れない。旧版はバイト 0
  // （＝ <html> の前）に注入していて、面の表が丸ごと崩れた。新しい <script> を足す側へ倒す。
  if (!tops.length) return insertHtml(src, '<script>\n' + code + '\n<\/script>\n', a._internal.baseFace);
  const at = tops.reduce((mx, f) => Math.max(mx, f.bodyEnd), -1) + 1;
  return src.slice(0, at) + '\n' + code + '\n' + src.slice(at);
}
// スクリプト直下の、**既存の全トップレベル関数より前**へ差し込む（位置は解析結果から引く）。
function insertTopLevelJsBefore(src, a, code) {
  const tops = a._internal.topFunctions;
  if (!tops.length) return null;
  const first = tops.reduce((mn, f) => Math.min(mn, f.namePos), Infinity);
  const at = src.lastIndexOf('function', first);
  return at < 0 ? null : src.slice(0, at) + code + '\n' + src.slice(at);
}
// 面で門番した「本物の閉じタグ」の位置（001j 高1）。
//   生テキストの lastIndexOf だと **JS 文字列の中の `</body>`** を掴む。現ファイルは
//   JS 文字列内に `'</body></html>'` を 3 箇所持っていて、それが偶然すべて本物より
//   前にあるから成立しているだけ。`</body>` の**後ろ**に `<script>` を 1 本置く（定石）と
//   fixture の注入が丸ごと JS 文字列の中に落ちる（実測 PASS=277 FAIL=35）。
//   終端規則は lib の rawtext 閉じタグと同じ（`</tag` の直後が空白 / `/` / `>`）。
//   face を渡せる場合は渡す（同じ src に何度も差し込むときの再分類を避ける）。
//
//   001k 高1 / 低1: **走査そのものを lib と同じ正規表現に揃えた**。001j は文字クラスだけ
//   lib に合わせて `lastIndexOf` の後方走査を残していたので、
//     (a) **大文字小文字を区別**していた。lib（`reachability.js:446`）は `ig` フラグなので
//         `</BODY>` を閉じタグと認めるが、こちらは見つけられず `-1` を返す
//         ＝ HTML として完全に等価な編集で「本物の閉じタグが無い」ことになる。
//     (b) `k === 0` で見つかると次周の `lastIndexOf(needle, -1)` が再び 0 を返し、
//         門番に落ちる形（例 `'</bodyz><p>x</p>'`）で**無限ループ**した。
//   正規表現の前方走査は最後の一致を採るだけで、どちらも構造的に起こらない。
function lastTagPos(src, tag, face) {
  const f = face || classifyFaces(src);
  const re = new RegExp('</' + tag + '(?=[\\s/>])', 'ig');
  let best = -1;
  for (let m = re.exec(src); m; m = re.exec(src)) if (f[m.index] === FACE.HTML_TAG) best = m.index;
  return best;
}
// 閉じタグの**終わり**（`>` の次）。lib（450-453）と同じく次の `>` まで。
//   `</body >` のような表記でも `</body>` の 7 文字を決め打ちしないため。
//   001l: 呼び出し元（`appendTailScript` / `upperCloseTags` / `dropCloseTags` /
//   `appendTailComment`）は全部 #816 へ退避したので、**このファイルからの参照は 0**。
//   作者指示で `lastTagPos` の対として残置。参照が無い＝壊しても常設は緑（#816 が戻す）。
// eslint-disable-next-line no-unused-vars
function tagEndPos(src, k) {
  const gt = src.indexOf('>', k);
  return gt < 0 ? src.length : gt + 1;
}
// HTML の末尾（本物の </body> の直前）へ差し込む。無ければ EOF へ追記する。
function insertHtml(src, frag, face) {
  const k = lastTagPos(src, 'body', face);
  return k < 0 ? src + frag : src.slice(0, k) + frag + src.slice(k);
}
// `<style>` ブロックごと注入する（001i 高2）。
//   001h までは「最後の STYLE_CSS 面」を探して中身の末尾へ差し込んでいたので、
//   **実ファイルに <style> が在ること**にアンカーしていた。CSS を外部スタイルシートへ
//   切り出す（検査1 の結果は 1 ミリも動かない正当なリファクタ）だけで STYLE_CSS の
//   probe が 15 本落ちる。他 15 面の probe と同じく自給自足にする。
function insertStyleBlock(src, css, face) {
  return insertHtml(src, '<style>\n' + css + '\n</style>\n', face);
}
// CSS を外部スタイルシートへ切り出す（`<style>` ブロックを全部剥がす）。位置は面から引く。
//   受け入れ基準「CSS 外部化ファイルで exit=0」を常設で測るための操作（⑰）。
//   閉じタグの判定は **lib と同じ規則**（`</style(?=[\s/>])` から次の `>` まで）。
//   001i は `'</style>'` の完全一致だったので、lib が閉じタグとして正しく認識する
//   `</style >` を剥がせず CSS-EXT-1 が落ちた（001j 中1・実測 PASS=318 FAIL=1）。
const STYLE_CLOSE_RE = /<\/style(?=[\s/>])[^>]*>/iy;
function externalizeStyleBlocks(src) {
  const face = classifyFaces(src);
  const runs = [];
  for (let i = 0; i < face.length; i++) {
    if (face[i] !== FACE.STYLE_CSS) continue;
    let e = i;
    while (e < face.length && face[e] === FACE.STYLE_CSS) e++;
    runs.push([i, e]);
    i = e;
  }
  let out = src;
  let removed = 0;
  // 後ろから剥がすので、まだ触っていない前方の位置（open / e）と face の添字は有効なまま。
  for (let k = runs.length - 1; k >= 0; k--) {
    const [i, e] = runs[k];
    const open = out.lastIndexOf('<style', i);
    if (open < 0 || face[open] !== FACE.HTML_TAG) continue;
    STYLE_CLOSE_RE.lastIndex = e;
    const m = STYLE_CLOSE_RE.exec(out);
    if (!m) continue;
    out = out.slice(0, open) + out.slice(e + m[0].length);
    removed++;
  }
  // `</head>` も面で門番する（生テキスト検索だと JS 文字列の中を掴む・001j 高1）。
  const h = lastTagPos(out, 'head');
  const link = '<link rel="stylesheet" href="app.css">\n';
  return { src: h >= 0 ? out.slice(0, h) + link + out.slice(h) : link + out, removed };
}
// 面から「HTML 直書きのインライン on*= 属性」を、**属性名から値の終端まで**まるごと引く。
//   在庫ゼロ耐性②（インライン on* の全件 addEventListener 化）がこれを使う。
//   引用符つきと**引用符省略**の両方を拾う（001j 高2）。lib（`lexTag` の 427-431）は
//   引用符省略値も ATTR_VAL_ON にするので、片方しか見ないと HTML5 として妥当な
//   `onclick=fn()` を取りこぼし、在庫ゼロ化（⑪⑬）が黙って未完了になる
//   ＝ ZERO-2 / ZERO-4 が落ちる（実測 PASS=317 FAIL=2）。
function onAttrFullSpans(src, a) {
  const face = a._internal.baseFace;
  const out = [];
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  const isName = (c) => /[A-Za-z0-9_:.-]/.test(c);
  for (let i = 0; i < face.length; i++) {
    if (face[i] !== FACE.ATTR_VAL_ON) continue;
    let e = i;
    while (e < face.length && face[e] === FACE.ATTR_VAL_ON) e++;
    const value = src.slice(i, e);
    let p = i - 1;
    let attrEnd = e;
    const quote = src[p];
    if ((quote === '"' || quote === "'") && src[e] === quote) {
      p--;               // 開き引用符を飛ばす
      attrEnd = e + 1;   // 閉じ引用符まで含める
    }
    // ここから先は引用符の有無に関わらず共通（値の直前は空白 ＋ `=`）。
    while (p >= 0 && isSpace(src[p])) p--;
    if (src[p] === '=') {
      p--;
      while (p >= 0 && isSpace(src[p])) p--;
      const nameEnd = p + 1;
      while (p >= 0 && isName(src[p])) p--;
      const nameStart = p + 1;
      if (nameStart < nameEnd) {
        out.push({
          attrStart: nameStart,
          attrEnd,
          attrName: src.slice(nameStart, nameEnd),
          value,
          quoted: attrEnd > e,
        });
      }
    }
    i = e;
  }
  return out;
}
// 面で門番した `document.getElementById('id')` の呼出位置を列挙する。
function selectorSites(src, a) {
  const face = a._internal.face;
  const out = [];
  for (const m of src.matchAll(/document\.getElementById\(\s*'([^']+)'\s*\)/g)) {
    if (face[m.index] !== FACE.JS_CODE) continue;
    out.push({ pos: m.index, end: m.index + m[0].length, id: m[1] });
  }
  return out;
}
// name の出現のうち「派生パスで ATTR_VAL_ON へ昇格した」位置を面から引く。
function derivedOnPos(m, src, name) {
  const face = m._internal.face;
  const re = new RegExp('(?<![A-Za-z0-9_$])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_$])', 'g');
  for (const mm of src.matchAll(re)) {
    if (face[mm.index] === FACE.ATTR_VAL_ON && m._internal.derivedPositions.has(mm.index)) return mm.index;
  }
  return -1;
}
// 失敗時に「どの面に載っていたか」を出す（FAIL メッセージを実測つきにするため）。
function derivedOnPosDetail(m, src, name) {
  const face = m._internal.face;
  const seen = new Set();
  const re = new RegExp('(?<![A-Za-z0-9_$])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_$])', 'g');
  for (const mm of src.matchAll(re)) seen.add(FACE_NAME[face[mm.index]]);
  return [...seen].join('/') || '(出現なし)';
}
// トップレベル関数のスパン（`function` キーワードから本体末尾まで）。
function functionSpan(src, a, name) {
  const f = (a._internal.byName.get(name) || [])[0];
  if (!f) return null;
  return { start: src.lastIndexOf('function', f.namePos), bodyEnd: f.bodyEnd };
}

const refCount = (a, kind, name) => {
  const m = a._internal && a._internal[kind];
  return (m && typeof m.get === 'function') ? (m.get(name) || 0) : 0;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const allowCount = (allow) => (allow.static || []).length + (allow.runtime || []).length;
// allowlist（static）へ 1 行追記して退避する（KL-*-esc が使う唯一の経路）。
//   allowlist に `static` キーが**無い**状態（#798 の掃除完了後に空配列ごと削るのは
//   自然な後始末）でも落ちないこと。001i はここだけ `|| []` を持たず、その瞬間
//   未捕捉 TypeError で PASS/FAIL の集計すら出なかった（001j 中2）。
//   `SHAPE-6` がこの関数を**キー欠落の allowlist で実際に通す**（ガードを外すと落ちる）。
function withStaticEscape(allow, name, reason) {
  const esc = clone(allow);
  (esc.static = esc.static || []).push({ name, category: 'functional-loss-pending', reason });
  return esc;
}
const staticNames = (a) => a.unreachableStatic.map((x) => x.name).join(',');

// 差分照合は「変異で新しく現れた違反」を見るので、注入する名前が**その src に既に
// 存在していない**ことが前提になる。衝突したら連番を足して必ず未使用の名前にする。
function uniqIn(src, base) {
  if (src.indexOf(base) < 0) return base;
  for (let i = 2; ; i++) if (src.indexOf(base + i) < 0) return base + i;
}

// =============================================================================
// ゲート本体
//   「この (src, allow) で CI が緑になるか」を判定する唯一の関数。
//   対象ファイルの常設判定も、正当編集耐性も、在庫ゼロ耐性も **全部ここを通る**。
//   ＝「実際にコミットしたら緑か」を、子プロセスではなく解析結果の差分で測る。
//
//   ここに置いてよい assert は C1（合成 fixture）/ C2（解析結果 × allowlist の
//   双方向照合）/ C3（構造不変条件）だけ。実在の1例に依存するものは 1 つも無い。
// =============================================================================
function gate(src, allow, emit, log) {
  // --- C3 面レクサの不変条件（完全性）----------------------------------------
  const fstat = faceStats(classifyFaces(src));
  emit(fstat.unclassified === 0, `L-1 未分類の文字が 0（実測 ${fstat.unclassified} 文字）`);
  emit(fstat.covered === src.length, `L-2 面の総延長がファイル長と一致する: ${fstat.covered} / ${src.length}`);
  const histSum = Object.values(fstat.histogram).reduce((s, n) => s + n, 0);
  emit(histSum === src.length, `L-3 面ごとの内訳の合計もファイル長と一致する: ${histSum} / ${src.length}`);
  emit(Object.keys(fstat.histogram).length === Object.keys(FACE).length,
    `L-4 面の一覧が ${Object.keys(FACE).length} 面ある`);
  emit(Object.values(FACE).filter(isRefFace).length === 2
    && isRefFace(FACE.JS_CODE) && isRefFace(FACE.ATTR_VAL_ON),
  'L-5 参照として数える面は JS_CODE ＋ ATTR_VAL_ON の 2 つだけ');
  log('  面の内訳: ' + Object.entries(fstat.histogram)
    .filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' '));

  // --- C3 走査の構造不変条件（実態の数は census。pin にしない）-----------------
  const t0 = Date.now();
  const a = analyze(src);
  const elapsed = Date.now() - t0;
  emit(a.functionDeclsAllDepths >= a.topLevelFunctionCount,
    `S3 全深さの関数宣言数がトップレベル以上（${a.functionDeclsAllDepths} >= ${a.topLevelFunctionCount}）`);
  emit(a.inlineHandlerCount === a.htmlHandlerCount + a.derivedHandlerCount,
    'S5 インライン on*= の合計 = HTML 直書き ＋ 派生パス');
  // C4 census（数の実態。増減しても FAIL にしない＝新規ボタン / 新規 script / 在庫ゼロで赤くならない）
  log(`  census: script=${a.scriptBlocks} 関数=${a.topLevelFunctionCount}(全深さ ${a.functionDeclsAllDepths})`
    + ` root=${a.rootNames.length} on*=${a.inlineHandlerCount}(HTML ${a.htmlHandlerCount}+派生 ${a.derivedHandlerCount})`
    + ` alias=${a.selectorAliases.length} 走査=${elapsed}ms`);
  log(`  検査1 静的到達不能: ${a.unreachableStatic.length}`);
  log(`  検査2 実行時のみ到達不能: ${a.unreachableRuntimeOnly.length}（レポート）`);
  log(`  検査2 死んだ結線: ${a.deadBindings.length} (${a.deadBindings.map((d) => d.selector).join(', ') || 'なし'})（レポート）`);
  log(`  派生パスのみで到達可能: ${a.derivedOnlyReachable.length} / 長い連結オペランド: ${a.concatLongOperands.length} / 未知 on*: ${a.unknownOnAttrs.length}`);

  // --- C2 本番判定（errors だけが CI を落とす）--------------------------------
  const v = evaluate(a, allow);
  if (v.errors.length) {
    log('  --- 違反（CI をブロックする） ---');
    for (const x of v.errors) log(`  [${x.rule}] ${x.message}`);
    log('  対処: (a) 到達可能に直す / (b) 意図的なら test/reachability_allowlist.json に理由つきで追加');
  }
  if (v.warnings.length) {
    log('  --- 警告（レポートのみ / CI は落とさない） ---');
    for (const x of v.warnings) log(`  [warn ${x.rule}] ${x.message}`);
  }
  emit(v.errors.length === 0, `R0 allowlist に無い到達不能コード / 掃除漏れ: ${v.errors.length} 件（${show(v.errors)}）`);
  log(`  レポート層の警告: ${v.warnings.length} 件（exit code に影響しない。最終行の WARN2 に出る）`);

  // --- C2 allowlist の健全性（allowlist / baseline との双方向照合）-------------
  const allEntries = [
    ...(allow.static || []).map((e) => ['static', e.name, e]),
    ...(allow.runtime || []).map((e) => ['runtime', e.name, e]),
    ...(allow.bindings || []).map((e) => ['bindings', e.selector, e]),
  ];
  emit(allEntries.every(([, k]) => typeof k === 'string' && k.length > 0), 'A1 全エントリに name / selector がある');
  emit(allEntries.every(([, , e]) => (e.reason || '').trim().length >= MIN_REASON), `A2 全エントリに ${MIN_REASON} 文字以上の理由がある`);
  emit(allEntries.every(([, , e]) => ALLOW_CATEGORIES.has(e.category)), 'A3 全エントリの category が既知の区分キーワード');
  emit(allEntries.every(([, , e]) => EVIDENCE_RE.test(e.reason || '')), 'A3b 全エントリの理由に根拠参照（#Issue / L行 / 日付）がある');
  const dupKey = new Set();
  let dup = 0;
  for (const [sec, k] of allEntries) { const kk = sec + ':' + k; if (dupKey.has(kk)) dup++; dupKey.add(kk); }
  emit(dup === 0, `A4 allowlist に重複エントリが無い: ${dup} 件`);

  // 001k 中1: baseline のキー欠落は **0 件として読む**。#798 の掃除が全件終われば
  //   `baseline` は全項目 0 になり、空配列（⑲）と同じ理屈で丸ごと削るのは自然な後始末。
  //   001j は `undefined` と数値を比較していたので、そこで WI-7 / WI-8 が全 OP のゲートで
  //   2 本ずつ落ちた（実測 `0 / undefined`）。allowlist を書き戻せば回復するので【中】。
  const blRaw = allow.baseline || {};
  const bl = {
    static_unreachable: blRaw.static_unreachable || 0,
    runtime_unreachable: blRaw.runtime_unreachable || 0,
    dead_bindings: blRaw.dead_bindings || 0,
    top_level_functions: blRaw.top_level_functions || 0,
  };
  const limits = allow.limits || {};
  log(`  baseline: static=${bl.static_unreachable} runtime=${bl.runtime_unreachable} bindings=${bl.dead_bindings} 関数総数=${bl.top_level_functions}`
    + (allow.baseline ? '' : '（baseline キーなし＝全項目 0 として読む）'));
  log(`  現在    : static=${a.unreachableStatic.length} runtime=${a.unreachableRuntimeOnly.length} bindings=${a.deadBindings.length} 関数総数=${a.topLevelFunctionCount}`);
  log(`  baseline との差: static=${a.unreachableStatic.length - bl.static_unreachable} runtime=${a.unreachableRuntimeOnly.length - bl.runtime_unreachable} bindings=${a.deadBindings.length - bl.dead_bindings}`);
  log(`  allowlist: ${allowCount(allow)} 件 / 目安 ${limits.allowlist_max}（超過は warn のみ）`);
  emit(typeof limits.allowlist_max === 'number' && limits.allowlist_max > 0,
    'A5-0 allowlist の目安上限が limits.allowlist_max として外部化されている');
  emit((limits.reason || '').trim().length >= MIN_REASON,
    'A5-1 目安上限には理由が書かれている（引き上げがレビュー対象になる）');
  emit(!v.errors.some((x) => x.rule === 'A5'), 'A5-2 上限超過は warn であり CI をブロックしない');
  // allowlist の記録と baseline の件数が食い違っていない（片方だけこっそり減らせない）。
  emit((allow.runtime || []).length === bl.runtime_unreachable,
    `WI-7 allowlist（runtime）の件数と baseline.runtime_unreachable が一致（${(allow.runtime || []).length} / ${bl.runtime_unreachable}）`);
  emit((allow.bindings || []).length === bl.dead_bindings,
    `WI-8 allowlist（bindings）の件数と baseline.dead_bindings が一致（${(allow.bindings || []).length} / ${bl.dead_bindings}）`);

  // --- C1 面 × 変異の全表（合成 fixture）--------------------------------------
  //   対象ファイルの実在の死にコードには一切依存しない。**注入した合成の死んだ関数**
  //   だけを使うので、#798 の掃除が全件終わっても（在庫ゼロでも）表は壊れない。
  const dead = uniqIn(src, '__reachFixtureDeadFn');
  const fx = insertTopLevelJs(src, a, `function ${dead}(){ return 1; }`);
  const fxa = analyze(fx);
  const fxAllow = clone(allow);
  fxAllow.static = (fxAllow.static || []).concat([{
    name: dead,
    category: 'temporarily-preserved',
    reason: '面 × 変異の全表が使う合成の死んだ関数（fixture・#799 PHASE1-REACH-001h / 2026-08-02）。対象ファイルの実在の死にコードに表が依存しないようにするためのもの。',
  }]);
  const fxv = evaluate(fxa, fxAllow);
  // fixture の面を 1 回だけ取って以降の差し込みで使い回す。`insertHtml` の `</body>` を
  // 面で門番するようにしたので（001j 高1）、渡さないと差し込みのたびに再分類が走る。
  const fxFace = fxa._internal.baseFace;

  emit(fxa.unreachableStatic.some((x) => x.name === dead),
    `T-0a fixture の死んだ関数 ${dead} が注入され、到達不能として検出される`);
  emit(fxv.errors.length === 0, `T-0b fixture の基準状態はエラー 0（実測 ${fxv.errors.length}: ${show(fxv.errors)}）`);

  // T-0c【001i 高2】STYLE_CSS の probe が自給自足であること。
  //   `<style>` を 1 つも持たない最小文書に注入しても STYLE_CSS 面が作れる
  //   ＝ 実ファイルの `<style>` が外部化されても表は壊れない。
  {
    const bare = '<html><head></head><body><p>x</p></body></html>';
    const withStyle = insertStyleBlock(bare, '.__probeSelfCss{color:red}');
    const bf = classifyFaces(withStyle);
    const got = FACE_NAME[bf[withStyle.indexOf('.__probeSelfCss')]];
    emit(bare.indexOf('<style') < 0, 'T-0c0 基準にした最小文書には <style> が 1 つも無い');
    emit(got === 'STYLE_CSS',
      `T-0c <style> ごと注入して STYLE_CSS 面を自給自足で作れる（実測 ${got}・実ファイルの <style> に依存しない）`);
  }

  // --- C1【001i 高3】R1 の正極性: allowlist に無い死にコードは **error** として増える ---
  //   001h の error 系 assert は R0（`errors.length === 0`）と R5 の逆極性だけだった。
  //   その結果 `add('error', 'R1', …)` → `add('warn', 'R1', …)` の **1 語変異**で、
  //   新規の死にコードを注入しても全緑・exit 0 になる（実測）。#798 の死にコード検出を
  //   CI に残すというこの PR の目的の門番そのものなので、常設側に戻す。
  {
    const un = uniqIn(fx, '__reachFixtureUnlistedDead');
    const s2 = insertTopLevelJs(fx, fxa, `function ${un}(){ return 1; }`);
    const m = analyze(s2);
    const mv = evaluate(m, fxAllow);
    emit(m.unreachableStatic.some((x) => x.name === un),
      `R1-POS-1 allowlist に載せない死にコード ${un} が到達不能として検出される`);
    emit(mv.errors.some((x) => x.rule === 'R1' && x.subject === un && x.severity === 'error'),
      `R1-POS-2 それが errors に R1:${un} として現れる（severity=error）`
      + `（実測 errors=${show(mv.errors)} / warnings=${show(mv.warnings)}）`);
    emit(!mv.warnings.some((x) => x.rule === 'R1'),
      `R1-POS-3 R1 は warnings 側には 1 件も出ない（実測 ${show(mv.warnings.filter((x) => x.rule === 'R1'))}）`);
    // 基準（fixture の状態）との差分でも「error が 1 件だけ増えた」ことを要求する。
    checkDelta(emit, fxv, mv, { errors: { must: ['R1:' + un], allowed: ['R1:' + un] } }, 'R1-POS-4');
    emit(mv.errors.length > 0,
      'R1-POS-5 この状態では R0（errors.length === 0）が成立しない＝ CI が実際に落ちる');
  }

  // 死んだ関数が到達可能に戻る変異の期待: R5（掃除漏れ）が 1 件増えるだけ。
  const REVIVE = { errors: { must: ['R5:' + dead], allowed: ['R5:' + dead] } };

  const faceTable = [
    {
      face: 'HTML_TEXT', expect: '不変', bucket: 'markupRefs',
      label: '地の文に死んだ関数名を置く', marker: '__faceProbeText',
      apply: (s) => insertHtml(s, `<span>__faceProbeText ${dead} を廃止予定</span>`, fxFace),
    },
    {
      face: 'HTML_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: 'HTML コメントに onclick="deadFn()" を書く', marker: '__faceProbeComment',
      apply: (s) => insertHtml(s, `<!-- __faceProbeComment <button onclick="${dead}()">旧導線</button> -->`, fxFace),
    },
    {
      face: 'HTML_TAG', expect: '不変', bucket: 'markupRefs',
      // タグ名は英字始まりでないと HTML のタグにならないので `x-` を前置する。
      label: 'タグ名そのものに死んだ関数名を含める', marker: '__faceProbeTag',
      apply: (s) => insertHtml(s, `<span id="__faceProbeTag"></span><x-${dead}></x-${dead}>`, fxFace),
    },
    {
      // ★ 3 版目が破られた面。属性名の前方一致で on* と誤認していた。
      face: 'ATTR_NAME', expect: '不変', bucket: 'markupRefs',
      label: '属性名に関数名を置く ＋ data-onclick="deadFn()"（3 版目の破れ方）',
      marker: '__faceProbeAttrName',
      apply: (s) => insertHtml(s, `<span id="__faceProbeAttrName" data-${dead}-legacy="1" data-onclick="${dead}()">x</span>`, fxFace),
    },
    {
      // ★ 2 版目が破られた面。
      face: 'ATTR_VAL', expect: '不変', bucket: 'markupRefs',
      label: 'class="deadFn-pill"（2 版目の破れ方）', marker: '__faceProbeAttrVal',
      apply: (s) => insertHtml(s, `<span id="__faceProbeAttrVal" class="${dead}-pill">x</span>`, fxFace),
    },
    {
      face: 'STYLE_CSS', expect: '不変', bucket: 'commentRefs',
      label: 'CSS に .deadFn{} を足す（<style> ごと注入＝自給自足）', marker: '__faceProbeCss',
      apply: (s) => insertStyleBlock(s, `.__faceProbeCss{display:none}\n.${dead}{color:red}`, fxFace),
    },
    {
      face: 'RAWTEXT', expect: '不変', bucket: 'markupRefs',
      label: 'textarea の中身に関数名を置く', marker: '__faceProbeRawtext',
      apply: (s) => insertHtml(s, `<textarea id="__faceProbeRawtext">${dead}()</textarea>`, fxFace),
    },
    {
      face: 'JS_STR_SQ', expect: '不変', bucket: 'stringRefs',
      label: '単引用符のログ文字列に関数名を置く（1 版目の破れ方）', marker: '__faceProbeSq',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeSq='LOG: ${dead} は保存されませんでした';`),
    },
    {
      face: 'JS_STR_DQ', expect: '不変', bucket: 'stringRefs',
      label: '二重引用符の文字列に関数名を置く', marker: '__faceProbeDq',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeDq="LOG: ${dead} は保存されませんでした";`),
    },
    {
      face: 'JS_TMPL_STR', expect: '不変', bucket: 'stringRefs',
      label: 'テンプレート文字列の中に関数名を置く', marker: '__faceProbeTmpl',
      apply: (s) => insertTopLevelJs(s, fxa, 'var __faceProbeTmpl=`LOG: ' + dead + ' ${String(1)}`;'),
    },
    {
      face: 'JS_LINE_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: '行コメントで関数名に言及する', marker: '__faceProbeLine',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeLine=1; // ${dead}() は撤去済み`),
    },
    {
      face: 'JS_BLOCK_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: 'ブロックコメントで関数名に言及する', marker: '__faceProbeBlock',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeBlock=1; /* ${dead}() は撤去済み */`),
    },
    {
      face: 'JS_REGEX', expect: '不変', bucket: 'stringRefs',
      label: '正規表現リテラルに /deadFn/ を書く', marker: '__faceProbeRegex',
      apply: (s) => insertTopLevelJs(s, fxa, `var __faceProbeRegex=/${dead}/.test('x');`),
    },
    {
      face: 'ATTR_VAL_ON', expect: '到達化', spec: REVIVE,
      label: 'インライン onclick に死んだ関数を結線する', marker: '__faceProbeOn',
      apply: (s) => insertHtml(s, `<button id="__faceProbeOn" onclick="${dead}()">x</button>`, fxFace),
    },
    {
      face: 'JS_CODE', expect: '到達化', spec: REVIVE,
      label: 'トップレベルの呼出を 1 行足す', marker: '__faceProbeCode',
      apply: (s) => insertTopLevelJs(s, fxa, `if(window.__faceProbeCode){${dead}();}`),
    },
    {
      face: 'JS_TMPL_DELIM', expect: '到達化', spec: REVIVE,
      label: 'テンプレートの ${} の中で呼ぶ', marker: '__faceProbeHole', probe: '${',
      apply: (s) => insertTopLevelJs(s, fxa, 'var __faceProbeHole=`${window.__faceProbeHoleX?' + dead + '():1}`;'),
    },
  ];

  const coveredFaces = new Set(faceTable.map((t) => t.face));
  const missingFaces = Object.keys(FACE).filter((f) => !coveredFaces.has(f));
  emit(missingFaces.length === 0,
    `T-0e 面 × 変異の表が全 ${Object.keys(FACE).length} 面を覆っている（欠け: ${missingFaces.join(', ') || 'なし'}）`);

  for (const t of faceTable) {
    const s2 = t.apply(fx);
    emit(!!s2 && s2 !== fx, `T[${t.face}]-1 変異が適用された（${t.label}）`);
    if (!s2 || s2 === fx) continue;
    const m = analyze(s2);
    const mv = evaluate(m, fxAllow);

    const needle = t.probe || dead;
    const at = s2.indexOf(t.marker);
    const pos = at >= 0 ? s2.indexOf(needle, at) : -1;
    const got = pos >= 0 ? FACE_NAME[m._internal.face[pos]] : '(見つからない)';
    emit(got === t.face, `T[${t.face}]-2 差し込んだ「${needle}」がその面に載っている: 実測 ${got}`);

    if (t.expect === '不変') {
      emit(m.unreachableStatic.some((x) => x.name === dead),
        `T[${t.face}]-3 ${dead} は到達不能のまま（この面は参照として数えない）`);
      emit(m.rootNames.indexOf(dead) < 0, `T[${t.face}]-4 ${dead} はルートにならない`);
      emit(refCount(m, t.bucket, dead) > refCount(fxa, t.bucket, dead),
        `T[${t.face}]-5 その言及は ${t.bucket} として数えられている: ${refCount(fxa, t.bucket, dead)} → ${refCount(m, t.bucket, dead)}`);
      checkDelta(emit, fxv, mv, {}, `T[${t.face}]-6`);
    } else {
      emit(!m.unreachableStatic.some((x) => x.name === dead),
        `T[${t.face}]-3 ${dead} が到達可能になる（この面は参照として数える）`);
      checkDelta(emit, fxv, mv, t.spec, `T[${t.face}]-4`);
    }
  }

  // --- C1 ATTR_NAME の値まで pin（data-onclick の値が ATTR_VAL_ON になったら 3 版目に戻る）---
  {
    const s2 = insertHtml(fx, `<span id="__probeAttrName2" data-onclick="${dead}()">x</span>`, fxFace);
    const m = analyze(s2);
    const namePos = s2.indexOf('data-onclick', s2.indexOf('__probeAttrName2'));
    const valPos = s2.indexOf(dead, namePos);
    emit(FACE_NAME[m._internal.face[namePos]] === 'ATTR_NAME',
      `T[ATTR_NAME]-7 data-onclick は属性名の面（実測 ${FACE_NAME[m._internal.face[namePos]]}）`);
    emit(FACE_NAME[m._internal.face[valPos]] === 'ATTR_VAL',
      `T[ATTR_NAME]-8 その値は ATTR_VAL であって ATTR_VAL_ON ではない（実測 ${FACE_NAME[m._internal.face[valPos]]}）`);
    emit(m.inlineHandlerCount === fxa.inlineHandlerCount,
      `T[ATTR_NAME]-9 インライン on*= の件数が増えない: ${fxa.inlineHandlerCount} → ${m.inlineHandlerCount}`);
  }

  // --- C1 on* に見えるがイベント名ではない属性は root 化しない -------------------
  {
    const s2 = insertHtml(fx, `<span id="__probeBogusOn" onbogus="${dead}()">x</span>`, fxFace);
    const m = analyze(s2);
    const p = s2.indexOf(dead, s2.indexOf('__probeBogusOn'));
    emit(FACE_NAME[m._internal.face[p]] === 'ATTR_VAL',
      `T[ATTR_VAL]-10 onbogus= の値は ATTR_VAL（実測 ${FACE_NAME[m._internal.face[p]]}・001d は on* 扱いで root 化した）`);
    emit(m.unreachableStatic.some((x) => x.name === dead), 'T[ATTR_VAL]-11 死んだ関数は到達不能のまま');
    checkDelta(emit, fxv, evaluate(m, fxAllow),
      { warnings: { must: ['R8:onbogus'], allowed: ['R8:onbogus'] } }, 'T[ATTR_VAL]-12');
  }

  // --- C1 派生パスの中の未知 on* も R8 に出る ----------------------------------
  {
    const wire = uniqIn(fx, '__probeDerivedUnknownWire');
    const s2 = insertTopLevelJs(fx, fxa,
      `function ${wire}(){ document.body.insertAdjacentHTML('beforeend','<button onbogusderived="${dead}()">x</button>'); }\n${wire}();`);
    const m = analyze(s2);
    emit(m.unknownOnAttrs.some((u) => u.name === 'onbogusderived' && u.viaDerived),
      `R8-DERIVED-1 JS 文字列の中の未知 on*= が報告される（実測 ${JSON.stringify(m.unknownOnAttrs.map((u) => u.name))}）`);
    emit(m.unreachableStatic.some((x) => x.name === dead),
      'R8-DERIVED-2 未知 on* なので死んだ関数はルート化しない');
    checkDelta(emit, fxv, evaluate(m, fxAllow),
      { warnings: { must: ['R8:onbogusderived'], allowed: ['R8:onbogusderived'] } }, 'R8-DERIVED-3');
  }

  // --- C1 インライン on*= を複数行にしてもルートを失わない（3 版目の破れ方）------
  //   001g までは実ファイルの `ON_SPANS[0]`（＝実在の 1 例）を折り曲げていた。
  //   インライン on* を 1 件残らず addEventListener へ移すと配列が空になり、
  //   `ON_SPANS[0]` が undefined になって未捕捉の TypeError で落ちる（#816 H-1）。
  //   → **fixture に自分で結線を注入し、それを折り曲げる**。
  {
    const s2 = insertHtml(fx, `<button id="__probeMultiline" onclick="${dead}()">x</button>`, fxFace);
    const m0 = analyze(s2);
    const spans = onAttrFullSpans(s2, m0).filter((sp) => sp.value.indexOf(dead) >= 0);
    emit(spans.length === 1, `T[ATTR_VAL_ON]-13a 注入した on*= 属性を面から 1 件引けた（実測 ${spans.length}）`);
    if (spans.length === 1) {
      const sp = spans[0];
      // 属性値の前後に改行を入れる＝ 3 版目はここで属性値の走査を打ち切っていた。
      const folded = s2.slice(0, sp.attrStart) + sp.attrName + '=\n      "\n' + sp.value + '\n"\n    '
        + s2.slice(sp.attrEnd);
      const m = analyze(folded);
      emit(m.htmlHandlerCount === m0.htmlHandlerCount,
        `T[ATTR_VAL_ON]-13 複数行にしても on*= 属性の数は変わらない: ${m0.htmlHandlerCount} → ${m.htmlHandlerCount}`);
      emit(m.rootNames.join(',') === m0.rootNames.join(','),
        'T[ATTR_VAL_ON]-14 ルートの顔ぶれも変わらない（3 版目は属性値の改行で走査を打ち切っていた）');
      emit(!m.unreachableStatic.some((x) => x.name === dead),
        `T[ATTR_VAL_ON]-14b 折り曲げても ${dead} は到達可能なまま`);
      checkDelta(emit, evaluate(m0, fxAllow), evaluate(m, fxAllow), {}, 'T[ATTR_VAL_ON]-15');
    }
  }

  // --- C1 派生パス: JS 文字列の中の on*= は参照として数える（罠(7)）-------------
  {
    const name = uniqIn(fx, '__probeStrHandler');
    const s2 = insertTopLevelJs(fx, fxa,
      `function ${name}(){ return 1; }\n`
      + `function ${name}Wire(){ document.body.insertAdjacentHTML('beforeend','<button onclick="${name}()">go</button>'); }\n`
      + `${name}Wire();`);
    const m = analyze(s2);
    // 001e はここを `src.indexOf('beforeend')` の生テキストで anchor していた。**面から引く**。
    emit(derivedOnPos(m, s2, name) >= 0,
      `T[JS_STR_SQ]-7 JS 文字列の中の on*= は派生パスで ATTR_VAL_ON へ昇格する（実測 ${derivedOnPosDetail(m, s2, name)}）`);
    emit(!m.unreachableStatic.some((x) => x.name === name), 'T[JS_STR_SQ]-8 そこで結線した関数を到達不能と言わない');
    emit(m.derivedHandlerCount === fxa.derivedHandlerCount + 1,
      `T[JS_STR_SQ]-9 派生パスで拾った on*= が 1 件増える: ${fxa.derivedHandlerCount} → ${m.derivedHandlerCount}`);
  }

  // --- C1 派生パス: 一度も挿入されない「死んだテンプレート」は隠さず見せる --------
  {
    const s2 = insertTopLevelJs(fx, fxa, `var __probeDeadTemplate='<button onclick="${dead}()">go</button>';`);
    const m = analyze(s2);
    emit(m.derivedOnlyReachable.indexOf(dead) >= 0,
      `T[JS_STR_SQ]-10 死んだテンプレート内の on*= で到達可能になった関数が derivedOnlyReachable に出る（実測 [${m.derivedOnlyReachable.join(', ')}]）`);
    checkDelta(emit, fxv, evaluate(m, fxAllow), {
      errors: { must: ['R5:' + dead], allowed: ['R5:' + dead] },
      warnings: { must: ['R6:' + dead], allowed: ['R6:' + dead] },
    }, 'T[JS_STR_SQ]-11');
  }

  // --- C1 派生パス: ASI 越境（セミコロン無しの独立2文）で連結しない --------------
  {
    const s2 = insertTopLevelJs(fx, fxa,
      'function __probeAsiWire(){\n'
      + "  var a = '<button onclick=\"'\n"
      + `  var bb = '${dead}()">go</button>'\n`
      + '  document.body.innerHTML = a + bb\n'
      + '}\n__probeAsiWire();');
    const m = analyze(s2);
    const pos = s2.indexOf(dead, s2.indexOf('__probeAsiWire'));
    emit(FACE_NAME[m._internal.face[pos]] === 'JS_STR_SQ',
      `T[JS_STR_SQ]-12 独立した 2 文をまたいで連結しない（実測 ${FACE_NAME[m._internal.face[pos]]}・001d は ATTR_VAL_ON へ昇格していた）`);
    emit(m.unreachableStatic.some((x) => x.name === dead), 'T[JS_STR_SQ]-13 死んだ関数は到達不能のまま');
    checkDelta(emit, fxv, evaluate(m, fxAllow), {}, 'T[JS_STR_SQ]-14');
  }

  return { a, v, fx, fxa, fxAllow, fxv, dead };
}

// 変異済みの (src, allow) に同じゲートを当て、**落ちた assert の一覧**を返す。
function gateProblems(src, allow) {
  const problems = [];
  try {
    gate(src, allow, (cond, msg) => { if (!cond) problems.push(msg); }, () => {});
  } catch (e) {
    problems.push(`ゲートが例外で落ちた: ${e && e.message}`);
  }
  return problems;
}

// =============================================================================
// 1〜4. 常設判定（対象ファイル）
// =============================================================================
console.log('=== 到達可能性ゲート（常設判定） ===');
const G = gate(RAW, ALLOW, ok, console.log);
const A = G.a;
const V = G.v;

// =============================================================================
// 5. 既知の限界を固定する（lib ヘッダの KL-*）
//    すべて合成の入力に対する判定＝ C1。実ファイルの中身には依存しない。
// =============================================================================
console.log('=== 既知の限界の固定 ===');
const faceOf = (code, needle) => {
  const s = '<script>' + code + '</script>';
  return FACE_NAME[classifyFaces(s)[s.indexOf(needle)]];
};
ok(faceOf('function __kl1(){ if(1){} /re/.test("x"); }', '/re/') === 'JS_CODE',
  'KL-1 `}` 直後の文頭正規表現は除算扱い（正規表現としては読まない）');
ok(faceOf('var a=1; <!-- x\nvar b=2;', '<!--') === 'JS_CODE',
  'KL-2 <script> 内の <!-- は JS コードとして読み続ける（escaped script data 未対応）');
{
  const s = '<button onclick="fn&#40;&#41;">x</button>';
  ok(FACE_NAME[classifyFaces(s)[s.indexOf('&#40;')]] === 'ATTR_VAL_ON',
    'KL-3 on* 属性値の中の HTML エンティティは復号しない（実体参照で書かれた呼出は読めない）');
}
ok(faceOf("function __p(){ if(x) /['\"]/.test(s); var live=1; }", "/['") === 'JS_REGEX',
  'KL-5 制御構文の `)` 直後は正規表現として読む（001d は除算扱いだった）');
ok(faceOf("function __p(){ if(x) /['\"]/.test(s); var live=1; }", 'var live') === 'JS_CODE',
  'KL-5b その結果、後続の生きたコードが文字列面に飲まれない');
ok(faceOf('function __p(){ var z=f(a) /2/ g; }', '/2/') === 'JS_CODE',
  'KL-6 関数呼出の `)` 直後は除算のまま');
ok(faceOf('function __p(){ var i=0; i++ /2/ g; }', '/2/') === 'JS_CODE',
  'KL-7 `++` 直後は除算（001d は正規表現として読んでいた）');
ok(ON_EVENT_ATTRS.has('onclick') && ON_EVENT_ATTRS.has('onpointerdown') && !ON_EVENT_ATTRS.has('onbogus'),
  `KL-8 on* は実イベント名の有限リスト（${ON_EVENT_ATTRS.size} 件）。未知の on* は R8 で報告する`);

// --- KL-4 / KL-9 / KL-10: 「生きた関数を殺す」向きの限界 -----------------------
//   001h は lib を 1 バイトも変更しない（移行オラクルの「9176cc5 比較で差分ゼロ」を
//   維持するため）ので、パネルが見つけた実バグ 2 件は**直さずに KL として固定する**。
//   どちらも現ファイルには実例 0 件・万一書かれても allowlist（static）への
//   1 行追記で退避できる（＝ CI が詰まない）。本修正は Issue #816。
{
  const mk = (code) => analyze(insertTopLevelJs(RAW, A, code));
  const live = (m, n) => !m.unreachableStatic.some((x) => x.name === n);

  const n4 = uniqIn(RAW, '__klNestedScript');
  ok(!live(mk(`function ${n4}(){ return 1; }\nfunction ${n4}W(){ document.body.insertAdjacentHTML('beforeend','<div><scr'+'ipt>document.write("<b onclick=\\'${n4}()\\'>x</b>")</scr'+'ipt></div>'); }\n${n4}W();`), n4),
    'KL-4 JS 文字列の中の <script> の中の文字列に書いた on*= は拾わない（再帰は 1 段）');

  // KL-9: 連結オペランドの**中**で on*= が複数リテラルに分割されている形。
  //   `esc('<b onclick="' + 'live()' + '">x</b>')` — 001g の第2掃引は「どのランにも
  //   入らなかった文字列面」を単独ランとして拾い直すので、オペランド内が単一リテラルなら
  //   拾える（下の対照）。だが**オペランド内でさらに連結されている**と、分割された
  //   リテラルは互いに結合されないまま単独ランになり、on*= が壊れた形でしか見えない。
  //   結果、生きた関数が R1 error で死ぬ。連結の外なら同じ分割で生存する＝深さ 2 の非対称。
  const n9 = uniqIn(RAW, '__klSplitInOperand');
  const m9 = mk(`function ${n9}Esc(s){ return s; }\nfunction ${n9}(){ return 1; }\n`
    + `function ${n9}W(){ document.body.innerHTML='<div>'+${n9}Esc('<b onclick="'+'${n9}()'+'">x</b>')+'</div>'; }\n${n9}W();`);
  ok(!live(m9, n9),
    `KL-9 連結オペランドの中で on*= が複数リテラルに分割されていると参照を落とす（${n9} が R1 error 化する・lib 実バグ・#816 H-5 で修正）`);
  const c9a = uniqIn(RAW, '__klSplitCtrlInner');
  ok(live(mk(`function ${c9a}Esc(s){ return s; }\nfunction ${c9a}(){ return 1; }\n`
    + `function ${c9a}W(){ document.body.innerHTML='<div>'+${c9a}Esc('<b onclick="${c9a}()">x</b>')+'</div>'; }\n${c9a}W();`), c9a),
  'KL-9b 対照: オペランドの中が単一リテラルなら拾える（001g の第2掃引で直った形）');
  const c9b = uniqIn(RAW, '__klSplitCtrlOuter');
  ok(live(mk(`function ${c9b}(){ return 1; }\n`
    + `function ${c9b}W(){ document.body.innerHTML='<b onclick="'+'${c9b}()'+'">x</b>'; }\n${c9b}W();`), c9b),
  'KL-9c 対照: 同じ分割でも連結の外なら拾える（＝ KL-9 は深さ 2 の非対称）');

  // KL-10: 関数名そのものを変数にした動的ディスパッチ。静的走査の原理的な限界。
  const n10 = uniqIn(RAW, '__klDynamicDispatch');
  const m10 = mk(`function ${n10}(){ return 1; }\n`
    + `function ${n10}W(){ var n='${n10}'; document.body.innerHTML='<button onclick="'+n+'()">x</button>'; }\n${n10}W();`);
  ok(!live(m10, n10),
    `KL-10 'onclick="'+fnName+'()"（関数名の変数化＝動的ディスパッチ）は参照として拾えない（${n10} が R1 error 化する）`);

  // どちらも allowlist（static）への 1 行追記で退避できる＝ CI が詰まない。
  for (const [tag, m, n] of [['KL-9', m9, n9], ['KL-10', m10, n10]]) {
    const esc = withStaticEscape(ALLOW, n,
      `${tag} の退避可能性を実測するためのエントリ（#799 / #816 / 2026-08-02）。静的走査の限界で参照を拾えない形なので allowlist で退避する。`);
    ok(evaluate(m, esc).errors.length === 0,
      `${tag}-esc allowlist（static）への 1 行追記だけで緑にできる（実測 ${show(evaluate(m, esc).errors)}）`);
  }
}

// --- イベント名リストの漏れは「生きた関数を殺す」向きに倒れる -------------------
//   001e のリストには実在イベントが 6 件漏れていて、`onmousewheel` で結線した
//   生きた関数が R1 error になった＝虚偽の allowlist 登録以外に緑化手段が無かった。
//   001g で同一仕様の**兄弟**を機械的に総なめして足した。
for (const ev of ['onmousewheel', 'onpointerrawupdate', 'onfullscreenchange',
  'onfullscreenerror', 'oncommand', 'onscrollsnapchange',
  'onscrollsnapchanging', 'onpagereveal', 'onpageswap',
  'ongamepadconnected', 'ongamepaddisconnected', 'oncontentvisibilityautostatechange',
  'onpointerlockchange', 'onpointerlockerror', 'ondeviceorientation',
  'ondeviceorientationabsolute', 'ondevicemotion', 'onorientationchange',
  'onwaitingforkey', 'onbeforexrselect', 'onwebkitfullscreenchange',
  'onwebkitfullscreenerror', 'onbeforeinstallprompt', 'onappinstalled']) {
  ok(ON_EVENT_ATTRS.has(ev), `EVENT[${ev}]-0 実イベント名としてリストに載っている`);
  // 小さな合成文書で走査そのものを確かめる（全 24 形を実ファイルで回すと遅いため）。
  const doc = `<html><body><div ${ev}="__probeEvFn()">x</div>`
    + '<script>function __probeEvFn(){ return 1; }<\/script></body></html>';
  const m = analyze(doc);
  ok(m.unreachableStatic.length === 0 && m.unknownOnAttrs.length === 0,
    `EVENT[${ev}]-1 ${ev}= で結線した生きた関数を到達不能と言わない（未知 on* 扱いにもしない）`);
}
// \xNN / \uXXXX で書かれた結線も復号して拾う
{
  const name = uniqIn(RAW, '__probeEscHandler');
  ok(!analyze(insertTopLevelJs(RAW, A,
    `function ${name}(){ return 1; }\n`
    + `function ${name}Wire(){ document.body.insertAdjacentHTML('beforeend','\\x3cbutton onclick=\\u0022${name}()\\u0022\\x3ego\\x3c/button\\x3e'); }\n`
    + `${name}Wire();`)).unreachableStatic.some((x) => x.name === name),
  'ESCAPE-1 \\xNN / \\uXXXX で書かれた on*= 結線も復号して拾う（001d は落としていた）');
}

// =============================================================================
// 6. 変異が本体を汚していないこと
// =============================================================================
ok(RAW === fs.readFileSync(target, 'utf8'), `M9 ${target} はディスク上でも 1 バイトも変わっていない`);

// =============================================================================
// 7. 「実際にコミットしても緑」の実測（受け入れ基準1・2）
//    ここが 001h の本命。正当な編集と**在庫ゼロ 2 種**に対して、上のゲートを
//    そのまま当て直し、落ちた assert が 0 であることを測る。
//    001g までは同じことを子プロセス 9 本でやっていた（#816 へ退避）。
// =============================================================================
console.log('=== 実際の編集に対するゲートの耐性（子プロセスを使わず解析結果で判定） ===');

// --- 在庫ゼロ①: 静的／実行時に到達不能な関数を**全件**削除する（不動点まで）----
function stripAllDeadFunctions(src) {
  let cur = src;
  let a = analyze(cur);
  let rounds = 0;
  let removed = 0;
  while (rounds < 12) {
    const names = a.unreachableStatic.map((x) => x.name)
      .concat(a.unreachableRuntimeOnly.map((x) => x.name));
    if (!names.length) break;
    const spans = names.map((n) => functionSpan(cur, a, n))
      .filter((s) => s && s.start >= 0)
      .sort((x, y) => y.start - x.start);
    let next = cur;
    let lastStart = Infinity;
    let n = 0;
    for (const s of spans) {
      if (s.bodyEnd >= lastStart) continue;      // 入れ子・重なりは次の周回で
      next = next.slice(0, s.start) + next.slice(s.bodyEnd + 1);
      lastStart = s.start;
      n++;
    }
    if (next === cur) break;
    cur = next;
    a = analyze(cur);
    rounds += 1;
    removed += n;
  }
  return { src: cur, a, rounds, removed };
}

// --- 在庫ゼロ②: HTML 直書きのインライン on* を**全件** addEventListener へ移す ---
function migrateInlineHandlers(src, a) {
  const spans = onAttrFullSpans(src, a);
  if (!spans.length) return { src, moved: 0 };
  let out = src;
  const wires = [];
  spans.forEach((sp, k) => {
    wires.push(`  var __mig${k}=document.querySelector('[data-reachmig="${k}"]');\n`
      + `  if(__mig${k}){ __mig${k}.addEventListener('${sp.attrName.replace(/^on/i, '')}', function(event){ ${sp.value} }); }`);
  });
  // 位置がずれないよう後ろから置換する。
  for (let k = spans.length - 1; k >= 0; k--) {
    const sp = spans[k];
    out = out.slice(0, sp.attrStart) + `data-reachmig="${k}"` + out.slice(sp.attrEnd);
  }
  out = insertHtml(out, '<script>\ndocument.addEventListener(\'DOMContentLoaded\', function(){\n'
    + wires.join('\n') + '\n});\n<\/script>\n');
  return { src: out, moved: spans.length };
}

// --- 操作の台帳（001i 中1）--------------------------------------------------
//   条件付きで作られる操作は**必ず** omit() に理由を残す。001h は 6 つの条件付き
//   ガードのうち 2 経路しか `omitted` に接続していなかったため、④ が在庫切れで
//   消えているのに「在庫が尽きて省いた操作: なし」と表示していた（実測 12 種）。
//   さらに **キー集合を pin** して「宣言した操作が実行も省略もされていない」を禁じる。
const OPS = [];
const OMITTED = [];
const omit = (key, why) => { OMITTED.push({ key, why }); };
const addOp = (op) => { OPS.push(op); };
// 宣言済みの全操作。
//   001l で ⑱ / ⑳a〜⑳d（ハーネス自衛の形状バッテリ）を落とした＝ Issue #816 へ。
//   ここに残るのは「実際の編集に対するゲートの耐性」（製品側）だけ。
const OP_KEYS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑲'];
// そのうち**在庫（実ファイルの死にコード / インライン on* / トップレベル関数 / allowlist）
// に一切依存しない**もの＝常に実行されなければならない操作。
const OP_KEYS_ALWAYS = ['①', '②', '⑤', '⑧', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑲'];

{
  const name = uniqIn(RAW, '__opNewButtonHandler');
  addOp({
    key: '①',
    label: '①新規ボタンをインライン onclick で 1 個追加',
    src: insertHtml(insertTopLevelJs(RAW, A, `function ${name}(){ return 1; }`),
      `<button type="button" onclick="${name}()">new</button>`),
  });
}
addOp({
  key: '②',
  label: '②新規 script ブロックを追加',
  src: insertHtml(RAW, '<script>\nfunction __opExtraFn(){ return 1; }\n__opExtraFn();\n<\/script>\n'),
});

// ③ セレクタ・ヘルパへの抽出 ＋ `||` フォールバック（FP-4 / FP-7 が安全と証明した形）。
//    死んだ結線を含む関数を対象に選ぶので、在庫が尽きたら**この操作自体が消える**。
//    在庫ゼロ耐性は ⑩⑪ が別途担うので、ここでは存在を assert しない（census のみ）。
function extractHelper(src, a, fnName, helperName, decl) {
  const span = functionSpan(src, a, fnName);
  if (!span || span.start < 0) return null;
  const body = src.slice(span.start, span.bodyEnd + 1);
  const n = (body.match(/document\.getElementById\(/g) || []).length;
  if (!n) return null;
  return {
    n,
    src: src.slice(0, span.start) + decl
      + body.replace(/document\.getElementById\(/g, helperName + '(')
      + src.slice(span.bodyEnd + 1),
  };
}
const heavyFn = (() => {
  const owners = new Map();
  for (const d of A.deadBindings) {
    const o = A._internal.ownerOf(d.pos);
    if (o) owners.set(o, (owners.get(o) || 0) + 1);
  }
  let best = null;
  for (const [n] of owners) {
    const c = selectorSites(RAW, A).filter((s) => A._internal.ownerOf(s.pos) === n).length;
    if (c >= 1 && (!best || c > best.c)) best = { n, c };
  }
  return best;
})();
if (!heavyFn) {
  omit('③', '死んだ結線を含み、かつ id セレクタを呼ぶ関数が現存しない');
} else {
  const fp4 = extractHelper(RAW, A, heavyFn.n, '$id', 'function $id(id){return document.getElementById(id);}\n');
  if (!fp4) {
    omit('③', `${heavyFn.n} の本体に document.getElementById( の呼出が無い`);
  } else {
    const a2 = analyze(fp4.src);
    const dead2 = new Set(a2.deadBindings.map((d) => d.selector));
    const site2 = selectorSites(fp4.src, a2).find((s) => !dead2.has('#' + s.id));
    if (!site2) {
      omit('③', '抽出後に「生きている id」を引く呼出位置が 1 つも無い');
    } else {
      addOp({
        key: '③',
        label: '③セレクタ・ヘルパ抽出 ＋ `||` フォールバックのリファクタを実際に施す',
        src: fp4.src.slice(0, site2.end)
          + `||document.querySelector('#${site2.id}')` + fp4.src.slice(site2.end),
      });
    }
  }
}

// ④ 死にコードを 1 件削除し allowlist も掃除（在庫があるときだけ）。
function pickRemovableDeadFn() {
  const allowNames = new Set((ALLOW.static || []).map((e) => e.name));
  for (const d of A.unreachableStatic) {
    if (!allowNames.has(d.name)) continue;
    const span = functionSpan(RAW, A, d.name);
    if (!span || span.start < 0) continue;
    const src = RAW.slice(0, span.start) + RAW.slice(span.bodyEnd + 1);
    const expect = A.unreachableStatic.filter((x) => x.name !== d.name).map((x) => x.name).join(',');
    if (staticNames(analyze(src)) === expect) return { name: d.name, src };
  }
  return null;
}
{
  const d = pickRemovableDeadFn();
  if (!d) {
    omit('④', 'allowlist（static）に載っていて単独削除できる死にコードが現存しない');
  } else {
    const allow2 = clone(ALLOW);
    allow2.static = (allow2.static || []).filter((e) => e.name !== d.name);
    allow2.baseline = Object.assign({}, allow2.baseline,
      { static_unreachable: ((allow2.baseline || {}).static_unreachable || 0) - 1 });
    addOp({
      key: '④',
      label: `④死にコード ${d.name} を削除し allowlist も掃除`,
      src: d.src,
      allow: allow2,
    });
  }
}

// ⑤ 検査2 だけが違反する状態（存在しない id への防御的ルックアップ）。
const FP5_ID = uniqIn(RAW, '__reachFeatureFlagPanel');
const fp5Src = insertTopLevelJs(RAW, A,
  `var __ff=document.getElementById('${FP5_ID}');\nif(__ff){__ff.style.display='none';}`);
addOp({
  key: '⑤',
  label: '⑤検査2 だけが違反する状態（exit code に効かないことの実測）',
  src: fp5Src,
  expectWarn: 'R3:#' + FP5_ID,
});

// ⑥ 同じ関数を呼ぶボタンをもう 1 個足す（実在のインライン on* があるときだけ）。
const inlineVictim = (() => {
  for (const sp of onAttrFullSpans(RAW, A)) {
    const called = sp.value.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
    const v = called.find((n) => A._internal.byName.has(n));
    if (v) return v;
  }
  return null;
})();
if (!inlineVictim) {
  omit('⑥', 'HTML 直書きのインライン on* から呼ばれるトップレベル関数が現存しない');
} else {
  addOp({
    key: '⑥',
    label: `⑥同じ関数（${inlineVictim}）を呼ぶボタンをもう 1 個追加`,
    src: insertHtml(RAW, `<button type="button" onclick="${inlineVictim}()">__opDupButton</button>`),
  });
}

// ⑦ ファイルの**先頭側**（既存の全関数より前）へ関数を 1 個足す。
//    生テキスト anchor が「最初の出現」を掴んでいたら必ず壊れる位置。
const OP7_NAME = uniqIn(RAW, '__opBeforeendRender');
const op7Src = insertTopLevelJsBefore(RAW, A,
  `function ${OP7_NAME}(){ document.body.insertAdjacentHTML('beforeend','<div class="notice">x</div>'); }\n${OP7_NAME}();`);
if (!op7Src) {
  omit('⑦', 'トップレベル関数が 0 個で「既存の全関数より前」の位置が取れない');
} else {
  addOp({
    key: '⑦',
    label: "⑦insertAdjacentHTML('beforeend', …) を使う関数を先頭側に 1 個追加",
    src: op7Src,
  });
}

// ⑧⑮⑯ が共通で使う境界の作り方【001i 高1】-----------------------------------
//   allowlist が上限 +1（境界）で、A5 が warn に留まり CI をブロックしないこと。
//   001h は上限を `allowCount(ALLOW) - 1` すなわち**実ファイルの allowlist 件数**から
//   引いていたので、allowlist が 1 件なら上限 0、0 件なら上限 -1 になり、
//   `A5-0`（上限 > 0）が落ちて **ゲート自身が赤くなった**。
//   ＝ #798 の掃除を守るためのゲートが、掃除の完了（allowlist 0 件）を禁止していた。
//   → **合成の死んだ関数 2 本とその allowlist エントリ 2 件だけで境界を作る**。
//     基準の allowlist が 0 件でも件数は必ず 2 になるので上限は必ず 1 以上になる。
function a5BoundaryOp(key, label, baseSrc, baseAllow, baseA) {
  const a0 = baseA || analyze(baseSrc);
  const d1 = uniqIn(baseSrc, '__opA5DeadA');
  const d2 = uniqIn(baseSrc, '__opA5DeadB');
  const src = insertTopLevelJs(baseSrc, a0,
    `function ${d1}(){ return 1; }\nfunction ${d2}(){ return 2; }`);
  const allow = clone(baseAllow);
  const reason = (n) => 'A5 の境界（上限 +1）を実ファイルの allowlist 件数に依存せず作るための'
    + `合成エントリ（#799 PHASE1-REACH-001i / 2026-08-02）。${n} は fixture が注入した死んだ関数。`;
  allow.static = (allow.static || []).concat([
    { name: d1, category: 'temporarily-preserved', reason: reason(d1) },
    { name: d2, category: 'temporarily-preserved', reason: reason(d2) },
  ]);
  allow.baseline = Object.assign({}, allow.baseline,
    { static_unreachable: ((allow.baseline || {}).static_unreachable || 0) + 2 });
  allow.limits = Object.assign({}, allow.limits, { allowlist_max: allowCount(allow) - 1 });
  return {
    key,
    label: `${key}${label}（合成後 ${allowCount(allow)} 件 / 上限 ${allowCount(allow) - 1}`
      + `・基準の allowlist ${allowCount(baseAllow)} 件）`,
    src,
    allow,
    expectWarn: 'A5:allowlist',
  };
}
addOp(a5BoundaryOp('⑧', 'allowlist が上限 +1（境界）', RAW, ALLOW, A));

// ⑨ インライン on* の関数をまとめて呼ぶ関数を addEventListener で結線する
//    （001f はこの 1 編集で M2-0 が恒久 FAIL になった）。
{
  const called = [...new Set(onAttrFullSpans(RAW, A).flatMap((sp) => (sp.value
    .match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []).filter((n) => A._internal.byName.has(n))))];
  if (!called.length) {
    omit('⑨', 'HTML 直書きのインライン on* から呼ばれるトップレベル関数が現存しない');
  } else {
    const fn = uniqIn(RAW, '__opCallAllInline');
    const btn = uniqIn(RAW, '__opCallAllInlineBtn');
    addOp({
      key: '⑨',
      label: `⑨インライン on* の ${called.length} 本をまとめて呼ぶ関数を addEventListener で結線`,
      src: insertHtml(insertTopLevelJs(RAW, A,
        `function ${fn}(){ ${called.map((n) => n + '();').join(' ')} }\n`
        + 'document.addEventListener(\'DOMContentLoaded\', function(){\n'
        + `  var b=document.getElementById('${btn}');\n`
        + `  if(b){ b.addEventListener('click', ${fn}); }\n});`),
      `<button type="button" id="${btn}">まとめて実行</button>`),
    });
  }
}

// --- ⑩ 在庫ゼロ①: #798 の死にコードを全件削除し allowlist も全掃除 ------------
const ZERO_DEAD = stripAllDeadFunctions(RAW);
// ディスク上の allowlist が **0 件**の状態（＝ #798 の掃除が完了した姿）。
const ZERO_ALLOW = (() => {
  const allow2 = clone(ALLOW);
  allow2.static = [];
  allow2.runtime = [];
  allow2.bindings = [];
  // baseline は WI-7/8 の二重記帳（allowlist の件数と一致すること）なので、
  // allowlist を全掃除したら 0 に揃える。実測の dead_bindings（R3 warn）は
  // レポートに出たまま残り、運用側が改めて allowlist と baseline を起こし直す。
  // baseline の意味論が「実測値」と読める点は #816 H-6 で整理する。
  allow2.baseline = Object.assign({}, allow2.baseline, {
    static_unreachable: 0,
    runtime_unreachable: 0,
    dead_bindings: 0,
    top_level_functions: ZERO_DEAD.a.topLevelFunctionCount,
  });
  return allow2;
})();
addOp({
  key: '⑩',
  label: `⑩在庫ゼロ①: 到達不能な ${ZERO_DEAD.removed} 関数を全件削除し allowlist も全掃除`,
  src: ZERO_DEAD.src,
  allow: ZERO_ALLOW,
});
ok(ZERO_DEAD.a.unreachableStatic.length === 0 && ZERO_DEAD.a.unreachableRuntimeOnly.length === 0,
  `ZERO-1 死にコードを全件削除した状態を作れた（${ZERO_DEAD.removed} 関数 / ${ZERO_DEAD.rounds} 周・残り static=${ZERO_DEAD.a.unreachableStatic.length} runtime=${ZERO_DEAD.a.unreachableRuntimeOnly.length}）`);

// --- ⑪ 在庫ゼロ②: インライン on* を全件 addEventListener へ移行 ---------------
const ZERO_ON = migrateInlineHandlers(RAW, A);
const ZERO_ON_A = analyze(ZERO_ON.src);
addOp({
  key: '⑪',
  label: `⑪在庫ゼロ②: インライン on* ${ZERO_ON.moved} 件を全件 addEventListener へ移行`,
  src: ZERO_ON.src,
});
ok(ZERO_ON_A.htmlHandlerCount === 0,
  `ZERO-2 HTML 直書きのインライン on* が 0 件の状態を作れた（${ZERO_ON.moved} 件を移行・実測 ${ZERO_ON_A.htmlHandlerCount}）`);
ok(onAttrFullSpans(ZERO_ON.src, ZERO_ON_A).length === 0,
  'ZERO-3 面から引ける on*= 属性も 0 件（＝ ON_SPANS[0] 型の添字参照が在れば必ずここで死ぬ）');

// --- ⑫ 複合メガ編集（①②⑤⑦ を一度に）---------------------------------------
{
  let mega = RAW;
  const name = uniqIn(mega, '__opMegaHandler');
  mega = insertHtml(insertTopLevelJs(mega, analyze(mega), `function ${name}(){ return 1; }`),
    `<button type="button" onclick="${name}()">mega</button>`);
  mega = insertHtml(mega, '<script>\nfunction __opMegaExtra(){ return 1; }\n__opMegaExtra();\n<\/script>\n');
  const megaA = analyze(mega);
  const megaId = uniqIn(mega, '__opMegaAbsentPanel');
  mega = insertTopLevelJs(mega, megaA,
    `var __megaFf=document.getElementById('${megaId}');\nif(__megaFf){__megaFf.style.display='none';}`);
  const megaBefore = insertTopLevelJsBefore(mega, analyze(mega),
    `function __opMegaRender(){ document.body.insertAdjacentHTML('beforeend','<div class="notice">x</div>'); }\n__opMegaRender();`);
  addOp({
    key: '⑫',
    label: '⑫複合メガ編集（①②⑤⑦ を一度に）',
    src: megaBefore || mega,
    expectWarn: 'R3:#' + megaId,
  });
}

// --- ⑬ 在庫ゼロ①＋②を同時に（両方の在庫が尽きた状態）------------------------
{
  const both = migrateInlineHandlers(ZERO_DEAD.src, ZERO_DEAD.a);
  const bothA = analyze(both.src);
  const allow2 = clone(ZERO_ALLOW);
  allow2.baseline = Object.assign({}, allow2.baseline,
    { top_level_functions: bothA.topLevelFunctionCount });
  addOp({
    key: '⑬',
    label: '⑬在庫ゼロ①＋②を同時に（死にコード 0 ＋ インライン on* 0）',
    src: both.src,
    allow: allow2,
  });
  ok(bothA.unreachableStatic.length === 0 && bothA.htmlHandlerCount === 0,
    `ZERO-4 両方の在庫が同時にゼロの状態を作れた（static=${bothA.unreachableStatic.length} on*=${bothA.htmlHandlerCount}）`);
}

// --- ⑭ ディスク上の allowlist が **1 件**の状態（掃除の最終局面）【001i 高1】-----
//   ⑩ は 0 件、⑭ は 1 件。どちらも「#798 の掃除が終わりかけている姿」で、
//   001h はこの帯で `A5-0` が落ちていた（allowlist 0 件→上限 -1 / 1 件→上限 0）。
const ONE = (() => {
  const name = uniqIn(ZERO_DEAD.src, '__opLastRemainingDeadFn');
  const src = insertTopLevelJs(ZERO_DEAD.src, ZERO_DEAD.a, `function ${name}(){ return 1; }`);
  const a = analyze(src);
  const allow = clone(ZERO_ALLOW);
  allow.static = [{
    name,
    category: 'temporarily-preserved',
    reason: '掃除の最終局面（allowlist 残り 1 件）を再現するための合成エントリ'
      + '（#799 PHASE1-REACH-001i / 2026-08-02）。',
  }];
  allow.baseline = Object.assign({}, allow.baseline,
    { static_unreachable: 1, top_level_functions: a.topLevelFunctionCount });
  return { name, src, a, allow };
})();
addOp({
  key: '⑭',
  label: `⑭ディスク上の allowlist が 1 件だけの状態（掃除の最終局面・残り ${ONE.name}）`,
  src: ONE.src,
  allow: ONE.allow,
});
ok(ONE.a.unreachableStatic.length === 1 && allowCount(ONE.allow) === 1,
  `ZERO-5 allowlist 1 件・死にコード 1 本の状態を作れた（static=${ONE.a.unreachableStatic.length} allowlist=${allowCount(ONE.allow)} 件）`);
ok(allowCount(ZERO_ALLOW) === 0,
  `ZERO-6 allowlist 0 件の状態を作れた（実測 ${allowCount(ZERO_ALLOW)} 件）`);

// --- ⑮⑯ その 0 件 / 1 件の状態の上で、⑧ と同じ境界を作る ---------------------
//   ここが 001h で赤くなっていた本体。上限が実在庫から引かれていないことの実測。
addOp(a5BoundaryOp('⑮', 'allowlist 0 件のファイルで上限 +1', ZERO_DEAD.src, ZERO_ALLOW, ZERO_DEAD.a));
addOp(a5BoundaryOp('⑯', 'allowlist 1 件のファイルで上限 +1', ONE.src, ONE.allow, ONE.a));

// --- ⑰ CSS を外部スタイルシートへ切り出す【001i 高2】-------------------------
//   検査1 の結果は 1 ミリも動かない正当なリファクタ。001h はこれだけで 15 本落ちた。
const CSS_EXT = externalizeStyleBlocks(RAW);
{
  const hist = faceStats(classifyFaces(CSS_EXT.src)).histogram;
  ok((hist.STYLE_CSS || 0) === 0,
    `CSS-EXT-1 <style> を ${CSS_EXT.removed} ブロック剥がして STYLE_CSS 面が 0 の状態を作れた（実測 ${hist.STYLE_CSS}）`);
  const extA = analyze(CSS_EXT.src);
  ok(extA.unreachableStatic.length === A.unreachableStatic.length
    && extA.topLevelFunctionCount === A.topLevelFunctionCount,
  `CSS-EXT-2 CSS 外部化で検査1 の結果は動かない（static ${A.unreachableStatic.length} → ${extA.unreachableStatic.length}`
    + ` / 関数 ${A.topLevelFunctionCount} → ${extA.topLevelFunctionCount}）`);
  addOp({
    key: '⑰',
    label: `⑰CSS を外部スタイルシートへ切り出す（<style> ${CSS_EXT.removed} ブロックを除去）`,
    src: CSS_EXT.src,
  });
}

// --- ⑲ allowlist から static / runtime / bindings / baseline キーを削除【001j 中2 / 001k 中1】---
//   #798 の掃除完了後に空配列ごと削るのは自然な後始末。001i はそこで未捕捉
//   TypeError になり、PASS/FAIL の集計すら出なかった。
//   001k: **`baseline` も同じ理屈で削れる**（掃除が全件終われば全項目 0）。001j は
//   3 キーしか削っていなかったので、`WI-7` / `WI-8` の `undefined` 比較が野放しだった
//   （全 OP のゲートで 2 本ずつ落ちる）。キー欠落耐性は 4 キーで測る。
const NOKEY_ALLOW = (() => {
  const a2 = clone(ZERO_ALLOW);
  delete a2.static;
  delete a2.runtime;
  delete a2.bindings;
  delete a2.baseline;
  return a2;
})();
ok(allowCount(NOKEY_ALLOW) === 0 && evaluate(ZERO_DEAD.a, NOKEY_ALLOW).errors.length === 0,
  'SHAPE-5 allowlist に static / runtime / bindings / baseline キーが無くても判定が例外にならない');
// ⑲ は gate() を通るが、KL-*-esc の退避は gate() の**外**でディスクの ALLOW を使うので
// ⑲ では当たらない。退避経路そのものをキー欠落の allowlist で通しておく（001j 中2）。
ok((() => {
  try {
    const esc = withStaticEscape(NOKEY_ALLOW, '__probeEscapeOnKeylessAllow',
      'キー欠落の allowlist でも「1 行追記で退避」できることを実測するためのエントリ（#799 PHASE1-REACH-001j / 2026-08-02）。');
    return (esc.static || []).length === 1 && allowCount(esc) === 1
      && (NOKEY_ALLOW.static === undefined);
  } catch (e) {
    return false;
  }
})(), 'SHAPE-6 allowlist に static キーが無くても KL-*-esc と同じ経路で 1 行追記の退避ができる（元の allowlist は汚さない）');
addOp({
  key: '⑲',
  label: '⑲allowlist から static / runtime / bindings / baseline キーを削除（空配列ごと消した後始末）',
  src: ZERO_DEAD.src,
  allow: NOKEY_ALLOW,
});

// --- 台帳の照合（001i 中1）---------------------------------------------------
{
  const keys = OPS.map((o) => o.key);
  const omittedKeys = OMITTED.map((o) => o.key);
  ok(keys.length === new Set(keys).size, `OP-KEYS-1 実行する操作キーに重複が無い（${keys.join('')}）`);
  ok(keys.every((k) => OP_KEYS.indexOf(k) >= 0) && omittedKeys.every((k) => OP_KEYS.indexOf(k) >= 0),
    `OP-KEYS-2 宣言外のキーが無い（実行 ${keys.join('')} / 省略 ${omittedKeys.join('') || 'なし'}）`);
  const covered = [...new Set(keys.concat(omittedKeys))]
    .sort((x, y) => OP_KEYS.indexOf(x) - OP_KEYS.indexOf(y)).join('');
  ok(covered === OP_KEYS.join(''),
    `OP-KEYS-3 宣言した ${OP_KEYS.length} 操作が「実行」か「理由つき省略」のどちらかに必ず分類される（実測 ${covered}）`);
  const missing = OP_KEYS_ALWAYS.filter((k) => keys.indexOf(k) < 0);
  ok(missing.length === 0,
    `OP-KEYS-4 在庫に依存しない ${OP_KEYS_ALWAYS.length} 操作は常に実行される（欠け: ${missing.join('') || 'なし'}）`);
  ok(OMITTED.every((o) => (o.why || '').length >= 10),
    'OP-KEYS-5 省略した操作には必ず理由が付いている');
}

for (const op of OPS) {
  const allow = op.allow || ALLOW;
  const problems = gateProblems(op.src, allow);
  const a = analyze(op.src);
  const v = evaluate(a, allow);
  ok(problems.length === 0,
    `OP[${op.label}] ゲートが緑（落ちた assert ${problems.length} 件: ${problems.slice(0, 4).join(' / ')}）`);
  if (op.expectWarn) {
    ok(v.warnings.map(sig).indexOf(op.expectWarn) >= 0,
      `OP[${op.label}] 検査2 の内容はレポートに出ている（黙って消していない）: ${op.expectWarn}`);
    ok(v.warnings.length > 0,
      `OP[${op.label}] WARN2 が 1 件以上＝ run_tests.sh の tail -1 で CI ログに載る（実測 ${v.warnings.length}）`);
  }
  console.log(`  ${problems.length === 0 ? '✓' : '✗'} ${op.label}: ERR=${v.errors.length} WARN2=${v.warnings.length}`);
}
console.log(`  操作 ${OPS.length}/${OP_KEYS.length} 種を実測`
  + `（在庫が尽きて省いた操作: ${OMITTED.map((o) => `${o.key}（${o.why}）`).join(' / ') || 'なし'}）`
  + '。在庫ゼロ耐性は ⑩⑪⑬⑭ が、allowlist 0 件 / 1 件 / キー欠落耐性は ⑩⑭⑮⑯⑲ が、'
  + '生テキスト anchor 耐性は ⑰ が常に担うので、ここでは在庫の存在を assert しない'
  + '（ハーネス自衛の形状バッテリ ⑱ / ⑳a〜⑳d は 001l で Issue #816 へ移した）');

console.log(`PHASE1-REACH-001: PASS=${pass} FAIL=${fail} WARN2=${V.warnings.length}`);
process.exit(fail === 0 ? 0 : 1);
