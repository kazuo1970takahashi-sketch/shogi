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
//     C1  合成 fixture（合成 fixture の注入）に対する判定
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
//   ── 001m で塞いだ穴（Codex P1・差し戻し12回目・2026-08-03）───────────────────
//   001l の `ok()` 全数表に**自分で「既知の恒久 FAIL 経路」として書いていた 1 行**が、
//   そのまま実害だった（`T[ATTR_VAL]-12` / `R8-DERIVED-3` は製品側に `onbogus` /
//   `onbogusderived` が入ると恒久 FAIL・#816 送りと書いていた）。置き場所も誤りで、
//   この 2 本は `gate()` の中＝ **001l で #799 に残すと決めた製品側**にある。
//   実測: `shogi_v4.html` に `<div onbogus="return false">x</div>` を 1 個足すと
//   **全 18 操作のゲートが同じ assert で落ちる**（`PASS=303 FAIL=19 WARN2=1` exit 1）。
//   未知の on* は本来レポート専用（R8 warn）なのに、それがブロッカーに変わる形＝
//   「正当な編集で恒久赤・allowlist で回避できない」＝ 11 巡と同じ実害クラス。
//   原因は **probe の属性名だけが固定文字列だった**こと（関数名は 001e 以降ずっと
//   `uniqIn` で一意化していたのに、属性名には同じ道具を当てていなかった）。
//   → `uniqOnAttrIn()` で **その src から一意化**する。`uniqIn` の連番は使えない
//     （lib の `ON_ATTR_SHAPE_RE` = `/^on[a-z]+$/i` は英字のみ＝ `onbogus2` は
//     「on* に見える」形にならず R8 に出ない）ので、英字を足して伸ばす。
//   → **⑳**（実ファイルに未知の on* 属性が在る世界）を常設化。操作 18 → **19**。
//     ⑱ / ⑳a〜⑳d の記号は 001l で #816 へ移した形状バッテリのもので、ここの ⑳ は
//     添字なしの別操作（軸は「文書の閉じタグの形」ではなく「属性の在庫」）。
//   ＝ **常設側に「既知の恒久 FAIL 経路」は 0 行になった。**
//
//   ── 001n で塞いだ穴（差し戻し13回目・2026-08-03）★ 名指しをやめた ─────────────
//   001m の受け入れ基準5（＝「既知の恒久 FAIL 経路」を全数表に書く）に従って
//   全 probe を機械で洗ったところ、**同型がもう 1 箇所**あった:
//   **`面 × 変異の表` の `t.marker` が固定文字列**（`__faceProbeText`〜`__faceProbeHole`）。
//   `T[面]-2` は `at = s2.indexOf(t.marker)` → `s2.indexOf(needle, at)` で位置を引くので、
//   実ファイル側に marker 名が注入位置より前に在ると `at` が実ファイル側を掴み、
//   needle が fixture ではなく死んだ関数の宣言（JS_CODE）に当たる。**「移行の申し送りを
//   HTML コメントに 1 行書く」だけで CI が恒久赤**（実測 `PASS=307 FAIL=20` exit 1）。
//   → marker 16 個 ＋ 残りの固定 probe 名（`__probeAttrName2` / `__probeBogusOn` /
//     `__probeMultiline` / `__probeDeadTemplate` / `__probeAsiWire` / `__probeSelfCss` /
//     `__opExtraFn` / `__opDupButton` / op 系の base 一式 / `__mig` / `data-reachmig` /
//     `data-onclick` …）を全部 `uniqIn` / `uniqOnAttrIn` に通した。
//
//   ★ **そして「名指しのリストで潰す」こと自体をやめた。** 001k は形状を、001m は属性名を
//   名指しで潰し、そのたびにリスト外の同型が残った。ここで機械に置き換える:
//     - **レジストリ**（`PROBE_BASES` / `PROBE_NAMES`）… `uniqIn` / `uniqOnAttrIn` を
//       通った base と一意化後の名前を実行時に記録する
//     - **㉑**（probe 名が実ファイルに先在する世界）… **レジストリの全 base** を対象の
//       先頭側（`<body>` 直後＝注入 anchor より前＝最悪位置）へ、**13 面に順に配置**して
//       先置きし、ゲートが緑であることを毎回確認する。操作 19 → **20**
//     - **`REGISTRY-1`**（受け入れ基準8）… 対象へ注入した断片（`INJECTED`）に現れる
//       probe らしきトークンが、**全部レジストリを通った名前から作られている**こと。
//       ＝「レジストリに載っていない固定文字列の probe が 0 個」を機械で示す
//   **2 つで対になっている**（片方だけでは閉じない・変異検算で実証済み）:
//     `REGISTRY-1` が「登録されていない固定名」を捕まえ、`㉑` が「登録されているが
//     危ない名前」を捕まえる。**新しい probe を足せば、その瞬間から自動で網に入る。**
//
//   ── 001o で塞いだ穴（差し戻し14回目・2026-08-03）★ 機械そのものを攻撃する ─────
//   001n が入れた `REGISTRY-1` の照合は**部分文字列一致**だった:
//     `const covered = (tok) => names.some((n) => tok.indexOf(n) >= 0) || HOSTILE.has(tok);`
//   根拠として「接尾辞つきが安全なのは `uniqIn` の衝突判定が部分文字列だから」と書いたが、
//   それは**`uniqIn` が生成した名前**についてしか言えない。照合側を生成規則に縛らなかったので
//   **登録済みの短い名前を接頭辞に持つ任意の未登録トークンが素通り**していた。
//   `__mig` が登録済みなので、`recordInjection('var <登録名>UnexpectedProbe=1;')` を 1 行足す
//   だけで（**対象ファイルは無変更**）`REGISTRY-1` は鳴らず 334/0 exit 0 のまま（Codex P1 / 実測再現）。
//   未登録なので `PROBE_BASES` にも入らず ㉑ の先置きにも含まれない＝**`REGISTRY-1` と ㉑ の
//   対が、この経路では両方とも空振り**する。001n の変異検算 M1/M2/M3 は登録名と無関係な
//   文字列を使っていたので、この形には当たっていなかった。
//   → **述語を「登録名を含む」から「登録名から規則的に導出できる」へ**（`probeCovered`）。
//     完全一致のみ: `PROBE_NAMES` / `PROBE_DERIVED`（`probeVariant()` で宣言した接辞つき派生名）/
//     「登録 base ＋ その base の生成規則が作りうる接尾辞」/ `HOSTILE`。
//   → トークナイザも直した。`/__[A-Za-z0-9_$]+/`（`__` 始まり）では `Unexpected<登録名>` から
//     `__mig` しか切り出せず、**登録名を接尾辞に持つ形は原理的に見えなかった**。識別子を丸ごと取る。
//     その副作用で `"${name}` から `u0022${name}` を拾ってしまうので、
//     エスケープ表記はトークン化の前に区切りへ潰す（`unescapeForTokens`）。
//
//   ★ **そして「照合そのものの検出力」を常設化した**（8b・受け入れ基準2）。
//     機械を入れたら、その機械を破る形を先に探す——001n はそれを怠った。
//     規則ごとに、それを破る形／守る形を 1 つずつ当てる 5 形（a〜e）を常設に置く:
//       a 登録名を接頭辞に持つ未登録名 / b 接尾辞に持つ / c 途中に含む … `REGISTRY-1` が落ちる
//       d `uniqIn` の規則で導出できる名前 / e `uniqOnAttrIn` の規則で導出できる名前 … 落ちない
//     d / e が無いと「全部 stray と言う」実装でも a〜c は緑になる（締めすぎ＝逆向きの恒久赤）。
//     使う base は**レジストリから引く**（名指ししない）。しかも d / e は
//     「生成規則の節**だけ**で通る base」を選ぶ（規則で作った綴りがたまたま登録名だと空振りするため）。
//
//   ── 001p で塞いだ穴（差し戻し15回目・2026-08-03）★ 5 件 ─────────────────────
//   高A **`uniqOnAttrIn` の衝突判定が case-sensitive** だった。HTML の属性名は大文字小文字を
//     区別せず lib も小文字化して扱うので、対象に `ONBOGUS` が 1 個入るだけで一意化が空振りし、
//     `T[ATTR_VAL]-12` が恒久赤（全操作が同じ assert で落ちる）＝ 12 巡と同じ実害クラスの 8 例目。
//     → 属性名の探索を ASCII case-insensitive（`hasCI`）へ。**㉒** を常設化（大文字表記 3 形）。
//   高B ㉑ の先置き位置 `RAW.indexOf('>', …)` が**引用符を解釈しない**ので、開始タグの属性値に
//     `>` があると値の中をタグ終端と誤認し `REGISTRY-FACE` が恒久赤＝「生テキストでタグ境界を
//     決める」クラスの 9 例目。しかも**新設した ㉑ の中**にあった。
//     → `tagEndPos(src, k, face)` を**面から取る**形に直して開始タグでも使う（閉じタグの
//       `lastTagPos` と同じ道具）。**㉓** を常設化（属性値に `>` と `/>` が在る世界）。
//   C-1 **001o が入れた「生成規則が作りうる接尾辞」の節そのものが穴**だった。`uniqIn` /
//     `uniqOnAttrIn` は返した名前を必ず登録するので節は不要で、入れたせいで
//     「理屈の上で生成されうる名前」が全部通り、**一度も生成されていない `<登録base>999`** が
//     素通りした。→ 節ごと削除。8b の正例は**関数に実際に作らせた名前**を使う（綴りを組み立てない）。
//   C-2 `unescapeForTokens` がエスケープを**空白へ潰して**いたので、`_` で綴った識別子は
//     `__` を失ってトークンが 1 つも出ずに素通りした。→ **実際の文字へ復号**する。
//   C-3 `PROBE_DERIVED.has(tok)` は集合への所属しか見ないので、**別の操作が既存の派生名を
//     固定文字列で書き写す**と通る（`probeVariant()` を経由しないので `DERIVE-1` も鳴らない）。
//     集合では区別できない——**書いた場所**を見るしかない。
//     → **8a `LITERAL-1`: このファイルのソース自身を走査**し、probe らしき綴りは
//       「レジストリの base / `HOSTILE` / `SOURCE_NOTE` に理由つきで書いた例外」だけに限る。
//       生成名・派生名がソースに現れたら FAIL。説明したいときはプレースホルダで書く。
//   ※ Codex 4 件目（lib が ES5 の非 ASCII 識別子を走査していない）は**見逃し**方向の別クラスで、
//     `test/lib/reachability.js` を触ると移行オラクルの基準ごと動くので **001p には入れない**
//     （作者が別 Issue を立てて #798 から参照する）。現対象の 580 関数は全部 ASCII 名で実害 0 件。
//
//   ── 001q で塞いだ穴（差し戻し16回目・2026-08-03）★ 2 件 ─────────────────────
//   高（12 例目）**9 例目を直した ㉓ の検算の中に、同じクラスが残っていた。**
//     ビルダは面ゲート付きのループで `<body>` が面上に無ければ黙って no-op するのに、
//     検算側は生テキストの `search` で anchor を取り「注入が成功したこと」を無条件 assert。
//     (a) `<head>` に `<body …=">">` を含む HTML コメントを 1 行足すと検算だけが偽物を掴む、
//     (b) `<body>` 開始タグを省略（HTML5 で妥当）するとビルダが no-op する——どちらも 369/1 exit 1。
//     成立していたのは実ファイルが JS 文字列に `<body>` を持ち、それが本物より後ろだからでしかない。
//     → 開始タグの探索を `openTagPositions`（面ゲート）1 本に集約 ／ ㉓ ビルダに**自給
//       フォールバック**（`<body>` 不在なら自前の host 開始タグを作る）／
//       **位置はビルダが返し検算はそれを読む**（検算側の生テキスト検索を全廃）。
//       **㉔**（コメントに偽の `<body>`）と **㉕**（`<body>` 開始タグ無し）を常設化し、
//       ㉓ の検算をその 3 世界の上で当て直す。操作 22→**24**。
//   ★ そのうえで**箇所ではなくクラスを機械化**する（001n の作法）。**8c `ANCHOR-*`**:
//     このファイルが `search` / `indexOf` / `lastIndexOf`（＋ 同じことができる
//     `includes` / `startsWith` / `endsWith`）を呼んでいる**全箇所**を抽出し、台帳で分類して
//     「未分類 0 / 危険カテゴリ `RAW_POS` 0 / 台帳の全行が実在の箇所に当たる」を毎回測る。
//     空振り検出として **12 例目そのものを含む敵役 4 形**を**同じ分類器**に当て、
//     RAW_POS へ落ちることを assert する（台帳に「何でも安全」の行を入れると落ちる）。
//   中 `LITERAL-1` は**連続した綴りしか見ない**ので、`'<base>' + 'Wire=99;'` と連結で 2 つに
//     割って書くだけで素通りした。→ 再現した形（隣り合うリテラルの `+`）は
//     `joinAdjacentStringLiterals` で畳んでから走査する。字句走査で完全防御は原理的に
//     不可能なので、**残りは `LITERAL_LIMITS`（`LITERAL-4`）に理由つきで台帳化**する。
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
//   - fixture の probe 名は **001m で属性名 / 001n で marker とその他すべて**を
//     `uniqIn` / `uniqOnAttrIn` に通した。旧版は固定文字列で、製品側に同名のものが
//     入ると `T[ATTR_VAL]-12` / `R8-DERIVED-3` / `T[面]-2` が恒久 FAIL になった。
//     いまは ⑳（未知 on* の在庫）と ㉑（probe 名の先在）が毎回この世界を通し、
//     `REGISTRY-1` が「レジストリを通っていない固定名が 0 個」を機械で示す。
//   - **この節はかつて「常設側に既知の恒久 FAIL 経路は残っていない」と断言していたが、
//     001p 時点でそれは偽だった**（㉓ の検算が生テキスト anchor で、`<head>` の
//     HTML コメント 1 行 / `<body>` 開始タグの省略で恒久赤になった＝12 例目）。
//     断言を人が書くのをやめて、**機械に言わせる**: 「実ファイルの生テキスト上の位置に
//     依存する assert が 0 件」は **8c `ANCHOR-2`** が毎回測る（外延＝`search`/`indexOf`/
//     `lastIndexOf` ほかの全呼び出し箇所・台帳で全数分類）。残る実ファイル依存は
//     `A5-0`/`A5-1` の `limits` キーと `ZERO-1` の 12 周上限の 2 点だけで、どちらも #816 受理済み。
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

// =============================================================================
// probe 名のレジストリ（001n ★）
//   001m まで「実ファイルに先在すると恒久赤になる固定文字列」を名指しのリストで
//   1 件ずつ潰していた（`onbogus` → face テーブルの marker 16 個）。**名指しを
//   やめる**。一意化を通った base をここに記録し、㉑ が**レジストリの全 base を
//   実ファイル側に先置きした世界**を毎回作る。新しい probe を足せば自動で網に入る。
//
//   - `PROBE_BASES` … 一意化の**素**（＝実ファイル側に先置きして衝突させる文字列）
//   - `PROBE_NAMES` … 一意化の**結果**（＝実際に注入する名前）。受け入れ基準8 の照合に使う
//   - `INJECTED`    … 対象へ注入した断片の全文。ここに現れる probe らしきトークンが
//                     `PROBE_NAMES` に無ければ「レジストリを通っていない固定文字列」
//   - `HOSTILE`     … probe ではなく**わざと固定**で置く敵役（⑳ の未知 on* / ㉑ の先置き名）
//
//   001o ★ 照合は**完全一致**でやる（Codex P1 / BLOCK。経緯は冒頭の 001o 節）。
//   「登録名を**含む**」ではなく「登録名から**規則的に導出できる**」を述語にする:
//   - `PROBE_NAMES` … 一意化の結果そのもの（完全一致）
//   - `PROBE_DERIVED` … 登録名に `probeVariant()` で接辞を足した派生名（完全一致）。
//                       接辞は固定だが**名前の側が一意化されている**ので、対象が将来その派生名を
//                       持てば名前が連番へ逃げ、派生名も一緒に動く＝固定文字列ではない。
//   - `HOSTILE`     … 明示の例外（完全一致）
//   - `PROBE_RULES` … base ごとの生成規則（`num` = `uniqIn` / `alpha` = `uniqOnAttrIn`）。
//     **照合には使わない**（001p / Codex C-1）。8b で「その base をどちらの関数に渡せば
//     連番の正例が作れるか」を引くためだけに持つ。
//     001o は「登録 base ＋ その規則が作りうる接尾辞」も許していたが、**この節そのものが穴**
//     だった: `uniqIn` / `uniqOnAttrIn` は**実際に返した名前を必ず `PROBE_NAMES` へ登録する**
//     ので規則の節は不要で、入れたせいで「理屈の上で生成されうる名前」が全部通り、
//     **一度も生成されていない `<登録base>999` が素通り**した。節ごと削除した。
const PROBE_BASES = new Set();
const PROBE_NAMES = new Set();
const PROBE_DERIVED = new Set();
const PROBE_RULES = new Map();   // base -> Set<'num' | 'alpha'>
const INJECTED = [];
const HOSTILE = new Set();
function registerProbe(base, name, rule) {
  PROBE_BASES.add(base);
  PROBE_NAMES.add(name);
  if (!PROBE_RULES.has(base)) PROBE_RULES.set(base, new Set());
  PROBE_RULES.get(base).add(rule);
  return name;
}
// 登録名に接辞を足して作る派生名（`${name}Wire` / `data-${name}-legacy` など）。
//   第 1 引数は**実行時に一意化された値**でなければならない。固定文字列を渡すと、その綴りが
//   登録名でなくなった世界（＝ base が対象に先在して連番へ逃げた世界）で `DERIVE-1` が落ちる。
//   ここを通さずに書いた合成トークンは `REGISTRY-1` が stray として拾う。
const DERIVE_BAD = [];
function probeVariant(name, suffix, prefix) {
  const v = (prefix || '') + name + (suffix || '');
  if (!PROBE_NAMES.has(name)) DERIVE_BAD.push(`${v}（素の "${name}" がレジストリ未登録）`);
  PROBE_DERIVED.add(v);
  return v;
}
const recordInjection = (frag) => { if (typeof frag === 'string' && frag) INJECTED.push(frag); };

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
  recordInjection(code);
  const tops = a._internal.topFunctions;
  // トップレベル関数が 1 つも無いファイルではアンカーが取れない。旧版はバイト 0
  // （＝ <html> の前）に注入していて、面の表が丸ごと崩れた。新しい <script> を足す側へ倒す。
  if (!tops.length) return insertHtml(src, '<script>\n' + code + '\n<\/script>\n', a._internal.baseFace);
  const at = tops.reduce((mx, f) => Math.max(mx, f.bodyEnd), -1) + 1;
  return src.slice(0, at) + '\n' + code + '\n' + src.slice(at);
}
// スクリプト直下の、**既存の全トップレベル関数より前**へ差し込む（位置は解析結果から引く）。
function insertTopLevelJsBefore(src, a, code) {
  recordInjection(code);
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
// タグの**終わり**（`>` の次）。
//   001p / Codex 高B: 生テキストの `indexOf('>', k)` は**引用符を解釈しない**ので、
//   開始タグの属性値に `>` を書いた形（HTML として妥当）で属性値の中の `>` をタグ終端と誤認する。
//   ㉑ の先置き位置がタグの内側に落ち、`REGISTRY-FACE` が恒久赤になった（実測 348/1 exit 1）。
//   ＝「生テキスト検索でタグの境界を決める」クラスの 9 例目。**面分類から取る**:
//   タグを閉じる `>` は `HTML_TAG` 面、属性値の中の `>` は `ATTR_VAL` 面なので、
//   `k` 以降で**最初に現れる HTML_TAG 面の `>`** がそのタグの終端。
//   開始タグ（㉑）でも閉じタグ（`lastTagPos` の対）でも同じ規則で使える。
function tagEndPos(src, k, face) {
  const f = face || classifyFaces(src);
  for (let i = k; i < src.length; i++) {
    if (src[i] === '>' && f[i] === FACE.HTML_TAG) return i + 1;
  }
  return src.length;
}
// **開始**タグの位置を全部（`lastTagPos` の対）。001q / cowork 高（12 例目）。
//   001p までは ㉑ と ㉓ がそれぞれ `ig` ループを手書きし、㉓ の検算だけ
//   `RAW.search(/<body/)`（生テキスト・面ゲート無し・最初の一致）を使っていた。
//   同じ規則の道具を 3 箇所に分けて持つと、直した箇所の隣に同型が残る（001k で学んだ形）。
//   **一本にまとめて、開始タグを探す処理は全部これを通す。**
function openTagPositions(src, tag, face) {
  const f = face || classifyFaces(src);
  const re = new RegExp('<' + tag + '(?=[\\s/>])', 'ig');
  const out = [];
  for (let m = re.exec(src); m; m = re.exec(src)) if (f[m.index] === FACE.HTML_TAG) out.push(m.index);
  return out;
}
// HTML の末尾（本物の </body> の直前）へ差し込む。無ければ EOF へ追記する。
//   001n: 対象へ入る断片は**全部 `INJECTED` に記録**する（受け入れ基準8 の照合元）。
function insertHtml(src, frag, face) {
  recordInjection(frag);
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
  if (src.indexOf(base) < 0) return registerProbe(base, base, 'num');
  for (let i = 2; ; i++) if (src.indexOf(base + i) < 0) return registerProbe(base, base + i, 'num');
}
// 同じことを**属性名**でやる（001m / Codex P1）。
//   probe の属性名を固定文字列にしていたので、製品側に `onbogus` / `onbogusderived` が
//   1 個入るだけで `T[ATTR_VAL]-12` / `R8-DERIVED-3` が恒久 FAIL になった
//   （その属性が基準側の warn に既に出ているので「増分」に現れない・実測 PASS=303 FAIL=19）。
//   ＝「正当な編集で恒久赤・allowlist では回避できない」＝この PR を 11 巡させたのと同じクラス。
//   **`uniqIn` の連番は使えない**: lib の `ON_ATTR_SHAPE_RE`（`/^on[a-z]+$/i`）は**英字のみ**
//   なので `onbogus2` は「on* に見える」形にならず、R8 に出ないまま別の理由で落ちる。
//   英字を足して伸ばす。候補は必ず伸び続けるので、src 長を超えた時点で必ず未使用になる。
//   001p / Codex 高A: **衝突判定そのものが case-sensitive だった**。HTML の属性名は
//   大文字小文字を区別せず lib も小文字化して扱うので、対象に `ONBOGUS` が 1 個入ると
//   `src.indexOf('onbogus')` は見つけられず一意化が空振りし、`T[ATTR_VAL]-12` が
//   「warn 増分に R8:onbogus が無い」で恒久赤（＝全操作のゲートが同じ assert で落ちる）。
//   ＝ 12 巡と同じ実害クラスの 8 例目。**属性名の探索は ASCII case-insensitive** にする。
//   （関数名 / 変数名 / id は JS も CSS セレクタも case-sensitive なので `uniqIn` は現状のまま。）
const lowerCache = { src: null, lower: null };
function lowerOf(src) {
  if (lowerCache.src !== src) { lowerCache.src = src; lowerCache.lower = src.toLowerCase(); }
  return lowerCache.lower;
}
const hasCI = (src, needle) => lowerOf(src).indexOf(needle.toLowerCase()) >= 0;
function uniqOnAttrIn(src, base) {
  if (!hasCI(src, base)) return registerProbe(base, base, 'alpha');
  for (let i = 1; ; i++) {
    const cand = base + 'x'.repeat(i);
    if (!hasCI(src, cand)) return registerProbe(base, cand, 'alpha');
  }
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
    const cls = uniqIn(bare, '__probeSelfCss');
    const withStyle = insertStyleBlock(bare, `.${cls}{color:red}`);
    const bf = classifyFaces(withStyle);
    const got = FACE_NAME[bf[withStyle.indexOf('.' + cls)]];
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

  // 001n ★: marker も **その src から一意化する**。旧版は固定文字列だったので、
  //   実ファイル側に marker 名が注入位置より前に在ると `at = s2.indexOf(t.marker)` が
  //   実ファイル側を掴み、そこから探した needle が fixture ではなく死んだ関数の宣言
  //   （JS_CODE）に当たって `T[面]-2` が恒久 FAIL になった。
  //   「移行の申し送りを HTML コメントに 1 行書く」だけで CI が赤くなる形（実測 307/20）。
  //   `apply` は `this.marker` を読むのでアロー関数ではなく**メソッド短縮形**で書く。
  //   一意化した名前に接尾辞を足すこと自体は安全（対象が `<name>X` を持つなら `<name>` も持つ＝
  //   そこで既に連番へ逃げている）が、**その安全さは照合側の免罪符にはならない**（001o / Codex P1）。
  //   接辞つきは必ず `probeVariant()` を通して派生名としてレジストリに載せる。
  const fp = (base) => uniqIn(fx, base);
  const dataOnAttr = uniqIn(fx, 'data-onclick');
  const faceTable = [
    {
      face: 'HTML_TEXT', expect: '不変', bucket: 'markupRefs',
      label: '地の文に死んだ関数名を置く', marker: fp('__faceProbeText'),
      apply(s) { return insertHtml(s, `<span>${this.marker} ${dead} を廃止予定</span>`, fxFace); },
    },
    {
      face: 'HTML_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: 'HTML コメントに onclick="deadFn()" を書く', marker: fp('__faceProbeComment'),
      apply(s) { return insertHtml(s, `<!-- ${this.marker} <button onclick="${dead}()">旧導線</button> -->`, fxFace); },
    },
    {
      face: 'HTML_TAG', expect: '不変', bucket: 'markupRefs',
      // タグ名は英字始まりでないと HTML のタグにならないので `x-` を前置する。
      label: 'タグ名そのものに死んだ関数名を含める', marker: fp('__faceProbeTag'),
      apply(s) { return insertHtml(s, `<span id="${this.marker}"></span><x-${dead}></x-${dead}>`, fxFace); },
    },
    {
      // ★ 3 版目が破られた面。属性名の前方一致で on* と誤認していた。
      face: 'ATTR_NAME', expect: '不変', bucket: 'markupRefs',
      label: '属性名に関数名を置く ＋ data-onclick="deadFn()"（3 版目の破れ方）',
      marker: fp('__faceProbeAttrName'), dataOn: dataOnAttr,
      apply(s) { return insertHtml(s, `<span id="${this.marker}" ${probeVariant(dead, '-legacy', 'data-')}="1" ${this.dataOn}="${dead}()">x</span>`, fxFace); },
    },
    {
      // ★ 2 版目が破られた面。
      face: 'ATTR_VAL', expect: '不変', bucket: 'markupRefs',
      label: 'class="deadFn-pill"（2 版目の破れ方）', marker: fp('__faceProbeAttrVal'),
      apply(s) { return insertHtml(s, `<span id="${this.marker}" class="${dead}-pill">x</span>`, fxFace); },
    },
    {
      face: 'STYLE_CSS', expect: '不変', bucket: 'commentRefs',
      label: 'CSS に .deadFn{} を足す（<style> ごと注入＝自給自足）', marker: fp('__faceProbeCss'),
      apply(s) { return insertStyleBlock(s, `.${this.marker}{display:none}\n.${dead}{color:red}`, fxFace); },
    },
    {
      face: 'RAWTEXT', expect: '不変', bucket: 'markupRefs',
      label: 'textarea の中身に関数名を置く', marker: fp('__faceProbeRawtext'),
      apply(s) { return insertHtml(s, `<textarea id="${this.marker}">${dead}()</textarea>`, fxFace); },
    },
    {
      face: 'JS_STR_SQ', expect: '不変', bucket: 'stringRefs',
      label: '単引用符のログ文字列に関数名を置く（1 版目の破れ方）', marker: fp('__faceProbeSq'),
      apply(s) { return insertTopLevelJs(s, fxa, `var ${this.marker}='LOG: ${dead} は保存されませんでした';`); },
    },
    {
      face: 'JS_STR_DQ', expect: '不変', bucket: 'stringRefs',
      label: '二重引用符の文字列に関数名を置く', marker: fp('__faceProbeDq'),
      apply(s) { return insertTopLevelJs(s, fxa, `var ${this.marker}="LOG: ${dead} は保存されませんでした";`); },
    },
    {
      face: 'JS_TMPL_STR', expect: '不変', bucket: 'stringRefs',
      label: 'テンプレート文字列の中に関数名を置く', marker: fp('__faceProbeTmpl'),
      apply(s) { return insertTopLevelJs(s, fxa, `var ${this.marker}=\`LOG: ${dead} \${String(1)}\`;`); },
    },
    {
      face: 'JS_LINE_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: '行コメントで関数名に言及する', marker: fp('__faceProbeLine'),
      apply(s) { return insertTopLevelJs(s, fxa, `var ${this.marker}=1; // ${dead}() は撤去済み`); },
    },
    {
      face: 'JS_BLOCK_COMMENT', expect: '不変', bucket: 'commentRefs',
      label: 'ブロックコメントで関数名に言及する', marker: fp('__faceProbeBlock'),
      apply(s) { return insertTopLevelJs(s, fxa, `var ${this.marker}=1; /* ${dead}() は撤去済み */`); },
    },
    {
      face: 'JS_REGEX', expect: '不変', bucket: 'stringRefs',
      label: '正規表現リテラルに /deadFn/ を書く', marker: fp('__faceProbeRegex'),
      apply(s) { return insertTopLevelJs(s, fxa, `var ${this.marker}=/${dead}/.test('x');`); },
    },
    {
      face: 'ATTR_VAL_ON', expect: '到達化', spec: REVIVE,
      label: 'インライン onclick に死んだ関数を結線する', marker: fp('__faceProbeOn'),
      apply(s) { return insertHtml(s, `<button id="${this.marker}" onclick="${dead}()">x</button>`, fxFace); },
    },
    {
      face: 'JS_CODE', expect: '到達化', spec: REVIVE,
      label: 'トップレベルの呼出を 1 行足す', marker: fp('__faceProbeCode'),
      apply(s) { return insertTopLevelJs(s, fxa, `if(window.${this.marker}){${dead}();}`); },
    },
    {
      face: 'JS_TMPL_DELIM', expect: '到達化', spec: REVIVE,
      label: 'テンプレートの ${} の中で呼ぶ', marker: fp('__faceProbeHole'), probe: '${',
      apply(s) { return insertTopLevelJs(s, fxa, `var ${this.marker}=\`\${window.${probeVariant(this.marker, 'X')}?${dead}():1}\`;`); },
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
    const id = uniqIn(fx, '__probeAttrName2');
    const s2 = insertHtml(fx, `<span id="${id}" ${dataOnAttr}="${dead}()">x</span>`, fxFace);
    const m = analyze(s2);
    const namePos = s2.indexOf(dataOnAttr, s2.indexOf(id));
    const valPos = s2.indexOf(dead, namePos);
    emit(FACE_NAME[m._internal.face[namePos]] === 'ATTR_NAME',
      `T[ATTR_NAME]-7 ${dataOnAttr} は属性名の面（実測 ${FACE_NAME[m._internal.face[namePos]]}）`);
    emit(FACE_NAME[m._internal.face[valPos]] === 'ATTR_VAL',
      `T[ATTR_NAME]-8 その値は ATTR_VAL であって ATTR_VAL_ON ではない（実測 ${FACE_NAME[m._internal.face[valPos]]}）`);
    emit(m.inlineHandlerCount === fxa.inlineHandlerCount,
      `T[ATTR_NAME]-9 インライン on*= の件数が増えない: ${fxa.inlineHandlerCount} → ${m.inlineHandlerCount}`);
  }

  // --- C1 on* に見えるがイベント名ではない属性は root 化しない -------------------
  //   属性名は **その src から一意化する**（001m）。固定の `onbogus` だと、製品側に
  //   同名の属性が 1 個入った瞬間に基準側の warn にも同じ `R8:onbogus` が出て、
  //   「増分」に現れなくなる＝ `T[ATTR_VAL]-12` が恒久 FAIL になった。
  {
    const bogus = uniqOnAttrIn(fx, 'onbogus');
    const id = uniqIn(fx, '__probeBogusOn');
    const s2 = insertHtml(fx, `<span id="${id}" ${bogus}="${dead}()">x</span>`, fxFace);
    const m = analyze(s2);
    const p = s2.indexOf(dead, s2.indexOf(id));
    emit(FACE_NAME[m._internal.face[p]] === 'ATTR_VAL',
      `T[ATTR_VAL]-10 ${bogus}= の値は ATTR_VAL（実測 ${FACE_NAME[m._internal.face[p]]}・001d は on* 扱いで root 化した）`);
    emit(m.unreachableStatic.some((x) => x.name === dead), 'T[ATTR_VAL]-11 死んだ関数は到達不能のまま');
    checkDelta(emit, fxv, evaluate(m, fxAllow),
      { warnings: { must: ['R8:' + bogus], allowed: ['R8:' + bogus] } }, 'T[ATTR_VAL]-12');
  }

  // --- C1 派生パスの中の未知 on* も R8 に出る ----------------------------------
  {
    const wire = uniqIn(fx, '__probeDerivedUnknownWire');
    const bogus = uniqOnAttrIn(fx, 'onbogusderived');
    const s2 = insertTopLevelJs(fx, fxa,
      `function ${wire}(){ document.body.insertAdjacentHTML('beforeend','<button ${bogus}="${dead}()">x</button>'); }\n${wire}();`);
    const m = analyze(s2);
    emit(m.unknownOnAttrs.some((u) => u.name === bogus && u.viaDerived),
      `R8-DERIVED-1 JS 文字列の中の未知 on*= が報告される（実測 ${JSON.stringify(m.unknownOnAttrs.map((u) => u.name))}）`);
    emit(m.unreachableStatic.some((x) => x.name === dead),
      'R8-DERIVED-2 未知 on* なので死んだ関数はルート化しない');
    checkDelta(emit, fxv, evaluate(m, fxAllow),
      { warnings: { must: ['R8:' + bogus], allowed: ['R8:' + bogus] } }, 'R8-DERIVED-3');
  }

  // --- C1 インライン on*= を複数行にしてもルートを失わない（3 版目の破れ方）------
  //   001g までは実ファイルの `ON_SPANS[0]`（＝実在の 1 例）を折り曲げていた。
  //   インライン on* を 1 件残らず addEventListener へ移すと配列が空になり、
  //   `ON_SPANS[0]` が undefined になって未捕捉の TypeError で落ちる（#816 H-1）。
  //   → **fixture に自分で結線を注入し、それを折り曲げる**。
  {
    const s2 = insertHtml(fx, `<button id="${uniqIn(fx, '__probeMultiline')}" onclick="${dead}()">x</button>`, fxFace);
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
    const wire = probeVariant(name, 'Wire');
    const s2 = insertTopLevelJs(fx, fxa,
      `function ${name}(){ return 1; }\n`
      + `function ${wire}(){ document.body.insertAdjacentHTML('beforeend','<button onclick="${name}()">go</button>'); }\n`
      + `${wire}();`);
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
    const s2 = insertTopLevelJs(fx, fxa,
      `var ${uniqIn(fx, '__probeDeadTemplate')}='<button onclick="${dead}()">go</button>';`);
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
    const wire = uniqIn(fx, '__probeAsiWire');
    const s2 = insertTopLevelJs(fx, fxa,
      `function ${wire}(){\n`
      + "  var a = '<button onclick=\"'\n"
      + `  var bb = '${dead}()">go</button>'\n`
      + '  document.body.innerHTML = a + bb\n'
      + `}\n${wire}();`);
    const m = analyze(s2);
    const pos = s2.indexOf(dead, s2.indexOf(wire));
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
// 001p: ここは自給自足の合成文書（対象へ注入しない）だが、**固定の probe 名をソースに
//   書かない**規則（8a `LITERAL-1`）に合わせて関数名は `uniqIn` に作らせる。
const KL_FN = uniqIn(RAW, '__klFaceProbe');
ok(faceOf(`function ${KL_FN}(){ if(1){} /re/.test("x"); }`, '/re/') === 'JS_CODE',
  'KL-1 `}` 直後の文頭正規表現は除算扱い（正規表現としては読まない）');
ok(faceOf('var a=1; <!-- x\nvar b=2;', '<!--') === 'JS_CODE',
  'KL-2 <script> 内の <!-- は JS コードとして読み続ける（escaped script data 未対応）');
{
  const s = '<button onclick="fn&#40;&#41;">x</button>';
  ok(FACE_NAME[classifyFaces(s)[s.indexOf('&#40;')]] === 'ATTR_VAL_ON',
    'KL-3 on* 属性値の中の HTML エンティティは復号しない（実体参照で書かれた呼出は読めない）');
}
ok(faceOf(`function ${KL_FN}(){ if(x) /['"]/.test(s); var live=1; }`, "/['") === 'JS_REGEX',
  'KL-5 制御構文の `)` 直後は正規表現として読む（001d は除算扱いだった）');
ok(faceOf(`function ${KL_FN}(){ if(x) /['"]/.test(s); var live=1; }`, 'var live') === 'JS_CODE',
  'KL-5b その結果、後続の生きたコードが文字列面に飲まれない');
ok(faceOf(`function ${KL_FN}(){ var z=f(a) /2/ g; }`, '/2/') === 'JS_CODE',
  'KL-6 関数呼出の `)` 直後は除算のまま');
ok(faceOf(`function ${KL_FN}(){ var i=0; i++ /2/ g; }`, '/2/') === 'JS_CODE',
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
  const n4w = probeVariant(n4, 'W');
  ok(!live(mk(`function ${n4}(){ return 1; }\nfunction ${n4w}(){ document.body.insertAdjacentHTML('beforeend','<div><scr'+'ipt>document.write("<b onclick=\\'${n4}()\\'>x</b>")</scr'+'ipt></div>'); }\n${n4w}();`), n4),
    'KL-4 JS 文字列の中の <script> の中の文字列に書いた on*= は拾わない（再帰は 1 段）');

  // KL-9: 連結オペランドの**中**で on*= が複数リテラルに分割されている形。
  //   `esc('<b onclick="' + 'live()' + '">x</b>')` — 001g の第2掃引は「どのランにも
  //   入らなかった文字列面」を単独ランとして拾い直すので、オペランド内が単一リテラルなら
  //   拾える（下の対照）。だが**オペランド内でさらに連結されている**と、分割された
  //   リテラルは互いに結合されないまま単独ランになり、on*= が壊れた形でしか見えない。
  //   結果、生きた関数が R1 error で死ぬ。連結の外なら同じ分割で生存する＝深さ 2 の非対称。
  const n9 = uniqIn(RAW, '__klSplitInOperand');
  const n9e = probeVariant(n9, 'Esc');
  const n9w = probeVariant(n9, 'W');
  const m9 = mk(`function ${n9e}(s){ return s; }\nfunction ${n9}(){ return 1; }\n`
    + `function ${n9w}(){ document.body.innerHTML='<div>'+${n9e}('<b onclick="'+'${n9}()'+'">x</b>')+'</div>'; }\n${n9w}();`);
  ok(!live(m9, n9),
    `KL-9 連結オペランドの中で on*= が複数リテラルに分割されていると参照を落とす（${n9} が R1 error 化する・lib 実バグ・#816 H-5 で修正）`);
  const c9a = uniqIn(RAW, '__klSplitCtrlInner');
  const c9aE = probeVariant(c9a, 'Esc');
  const c9aW = probeVariant(c9a, 'W');
  ok(live(mk(`function ${c9aE}(s){ return s; }\nfunction ${c9a}(){ return 1; }\n`
    + `function ${c9aW}(){ document.body.innerHTML='<div>'+${c9aE}('<b onclick="${c9a}()">x</b>')+'</div>'; }\n${c9aW}();`), c9a),
  'KL-9b 対照: オペランドの中が単一リテラルなら拾える（001g の第2掃引で直った形）');
  const c9b = uniqIn(RAW, '__klSplitCtrlOuter');
  const c9bW = probeVariant(c9b, 'W');
  ok(live(mk(`function ${c9b}(){ return 1; }\n`
    + `function ${c9bW}(){ document.body.innerHTML='<b onclick="'+'${c9b}()'+'">x</b>'; }\n${c9bW}();`), c9b),
  'KL-9c 対照: 同じ分割でも連結の外なら拾える（＝ KL-9 は深さ 2 の非対称）');

  // KL-10: 関数名そのものを変数にした動的ディスパッチ。静的走査の原理的な限界。
  const n10 = uniqIn(RAW, '__klDynamicDispatch');
  const n10w = probeVariant(n10, 'W');
  const m10 = mk(`function ${n10}(){ return 1; }\n`
    + `function ${n10w}(){ var n='${n10}'; document.body.innerHTML='<button onclick="'+n+'()">x</button>'; }\n${n10w}();`);
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
  //   001p: 文書ごと合成なので実ファイルとは衝突しないが、**固定の probe 名をソースに
  //   書かない**規則（8a `LITERAL-1`）に合わせて名前は `uniqIn` に作らせる。
  const evFn = uniqIn(RAW, '__probeEvFn');
  const doc = `<html><body><div ${ev}="${evFn}()">x</div>`
    + `<script>function ${evFn}(){ return 1; }<\/script></body></html>`;
  const m = analyze(doc);
  ok(m.unreachableStatic.length === 0 && m.unknownOnAttrs.length === 0,
    `EVENT[${ev}]-1 ${ev}= で結線した生きた関数を到達不能と言わない（未知 on* 扱いにもしない）`);
}
// \xNN / \uXXXX で書かれた結線も復号して拾う
{
  const name = uniqIn(RAW, '__probeEscHandler');
  const wire = probeVariant(name, 'Wire');
  ok(!analyze(insertTopLevelJs(RAW, A,
    `function ${name}(){ return 1; }\n`
    + `function ${wire}(){ document.body.insertAdjacentHTML('beforeend','\\x3cbutton onclick=\\u0022${name}()\\u0022\\x3ego\\x3c/button\\x3e'); }\n`
    + `${wire}();`)).unreachableStatic.some((x) => x.name === name),
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
  // 001n: 生成する変数名 / 目印属性も `uniqIn` を通す（レジストリに載せる）。
  const migVar = uniqIn(src, '__mig');
  const migAttr = uniqIn(src, 'data-reachmig');
  const wires = [];
  spans.forEach((sp, k) => {
    // 001o: 連番つきの変数名も**派生名として宣言する**（`<登録名>0` / `<登録名>1` は `uniqIn` が
    //   作りうる接尾辞（2 以上の 10 進数）ではないので、規則では導出できない）。
    const v = probeVariant(migVar, String(k));
    wires.push(`  var ${v}=document.querySelector('[${migAttr}="${k}"]');\n`
      + `  if(${v}){ ${v}.addEventListener('${sp.attrName.replace(/^on/i, '')}', function(event){ ${sp.value} }); }`);
  });
  // 位置がずれないよう後ろから置換する。
  for (let k = spans.length - 1; k >= 0; k--) {
    const sp = spans[k];
    out = out.slice(0, sp.attrStart) + `${migAttr}="${k}"` + out.slice(sp.attrEnd);
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
//   ⑱ が欠番なのは 001l で #816 へ移したから（⑳a〜⑳d も同じ）。⑳ は 001m で足した
//   別operation（未知 on* 属性の在庫）で、退避した ⑳a〜⑳d とは無関係。
const OP_KEYS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑲', '⑳', '㉑', '㉒', '㉓', '㉔', '㉕'];
// そのうち**在庫（実ファイルの死にコード / インライン on* / トップレベル関数 / allowlist）
// に一切依存しない**もの＝常に実行されなければならない操作。
const OP_KEYS_ALWAYS = ['①', '②', '⑤', '⑧', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰',
  '⑲', '⑳', '㉑', '㉒', '㉓', '㉔', '㉕'];

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
  src: (() => {
    const fn = uniqIn(RAW, '__opExtraFn');
    return insertHtml(RAW, `<script>\nfunction ${fn}(){ return 1; }\n${fn}();\n<\/script>\n`);
  })(),
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
  (() => {
    const v = uniqIn(RAW, '__ffProbeVar');
    return `var ${v}=document.getElementById('${FP5_ID}');\nif(${v}){${v}.style.display='none';}`;
  })());
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
    src: insertHtml(RAW,
      `<button type="button" onclick="${inlineVictim}()">${uniqIn(RAW, '__opDupButton')}</button>`),
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
  const extra = uniqIn(mega, '__opMegaExtra');
  mega = insertHtml(mega, `<script>\nfunction ${extra}(){ return 1; }\n${extra}();\n<\/script>\n`);
  const megaA = analyze(mega);
  const megaId = uniqIn(mega, '__opMegaAbsentPanel');
  const megaVar = uniqIn(mega, '__opMegaFfVar');
  mega = insertTopLevelJs(mega, megaA,
    `var ${megaVar}=document.getElementById('${megaId}');\nif(${megaVar}){${megaVar}.style.display='none';}`);
  const render = uniqIn(mega, '__opMegaRender');
  const megaBefore = insertTopLevelJsBefore(mega, analyze(mega),
    `function ${render}(){ document.body.insertAdjacentHTML('beforeend','<div class="notice">x</div>'); }\n${render}();`);
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
    const esc = withStaticEscape(NOKEY_ALLOW, uniqIn(RAW, '__probeEscapeOnKeylessAllow'),
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

// --- ⑳ 実ファイルに未知の on* 属性が在る世界【001m / Codex P1】-----------------
//   `T[ATTR_VAL]-10/-11/-12` と `R8-DERIVED-1/-2/-3` の probe 属性名が固定文字列
//   （`onbogus` / `onbogusderived`）だったので、製品側に同名の属性を 1 個足すだけで
//   **全 18 操作のゲートが同じ assert で落ちた**（実測 PASS=303 FAIL=19 exit 1）。
//   未知の on* は本来レポート専用（R8 warn）なのに、それがブロッカーに変わる形。
//   属性名の一意化（`uniqOnAttrIn`）で構造的に消えるが、**「消えたこと」を毎回機械が
//   通す**ためにこの操作を常設化する（RP-009「3 回目で機械に置換」と同じ理由）。
//   ⑱ / ⑳a〜⑳d の記号は 001l で #816 へ移した形状バッテリのもの。ここの ⑳ は
//   添字なしの別操作で、意味は「文書の閉じタグの形」ではなく「属性の在庫」。
//   001n: 属性名 `onbogus` / `onbogusderived` は**わざと固定**（probe ではなく敵役なので
//   `HOSTILE` に登録する）。id は probe なので `uniqIn` を通す。
HOSTILE.add('onbogus');
HOSTILE.add('onbogusderived');
const UNKNOWN_ON_SRC = insertHtml(RAW,
  `<div id="${uniqIn(RAW, '__opUnknownOnAttrHost')}" onbogus="return false">x</div>\n`
  + `<div id="${uniqIn(RAW, '__opUnknownOnAttrDerivedHost')}" onbogusderived="return false">y</div>\n`);
addOp({
  key: '⑳',
  label: '⑳実ファイルに未知の on* 属性（onbogus / onbogusderived）が在る世界',
  src: UNKNOWN_ON_SRC,
  expectWarn: 'R8:onbogus',
});
{
  // その世界を**実際に作れたこと**（＝ ⑳ が空振りしていないこと）と、
  // それが「検査1 の結果は 1 ミリも動かない正当な編集」であることを測る。
  const ua = analyze(UNKNOWN_ON_SRC);
  const names = ua.unknownOnAttrs.map((x) => x.name);
  ok(names.indexOf('onbogus') >= 0 && names.indexOf('onbogusderived') >= 0,
    `UNKNOWN-ON-1 実ファイル側に未知の on* を 2 種類とも作れた（実測 [${names.join(', ')}]）`);
  ok(ua.unreachableStatic.length === A.unreachableStatic.length,
    `UNKNOWN-ON-2 未知 on* を足しても検査1 の結果は動かない（static ${A.unreachableStatic.length} → ${ua.unreachableStatic.length}）`);
}

// --- ㉒ 未知 on* 属性が**大文字表記**で在る世界【001p / Codex 高A】-----------------
//   HTML の属性名は大文字小文字を区別せず lib も小文字化して扱うのに、probe 側の
//   一意化（`uniqOnAttrIn`）の衝突判定だけが case-sensitive だった。対象に `ONBOGUS` が
//   1 個入ると `src.indexOf('onbogus')` が空振りして probe 名が固定のまま残り、
//   `T[ATTR_VAL]-12` が「warn 増分に R8:onbogus が無い」で恒久赤（＝全操作が落ちる）。
//   ⑳ は小文字だけの世界なので、この形は通していなかった。**大文字小文字の 3 形**を常設化する。
//   属性名はわざと固定なので `HOSTILE` に登録する（綴りごと＝照合は完全一致なので）。
for (const spell of ['ONBOGUS', 'OnBogus', 'oNbOgUs']) HOSTILE.add(spell);
const UPPER_ON_SRC = insertHtml(RAW,
  `<div id="${uniqIn(RAW, '__opUpperOnAttrHostA')}" ONBOGUS="return false">x</div>\n`
  + `<div id="${uniqIn(RAW, '__opUpperOnAttrHostB')}" OnBogus="return false">y</div>\n`
  + `<div id="${uniqIn(RAW, '__opUpperOnAttrHostC')}" oNbOgUs="return false">z</div>\n`);
addOp({
  key: '㉒',
  label: '㉒実ファイルに未知の on* 属性が大文字表記で在る世界（ONBOGUS / OnBogus / oNbOgUs）',
  src: UPPER_ON_SRC,
  expectWarn: 'R8:onbogus',
});
{
  const ua = analyze(UPPER_ON_SRC);
  const names = ua.unknownOnAttrs.map((x) => x.name);
  ok(names.indexOf('onbogus') >= 0,
    `UPPER-ON-1 大文字表記でも lib は未知 on* として小文字で報告する（実測 [${[...new Set(names)].join(', ')}]）`);
  ok(uniqOnAttrIn(UPPER_ON_SRC, 'onbogus') !== 'onbogus',
    `UPPER-ON-2 大文字表記の在庫を見て probe 属性名が実際に逃げる（実測 "${uniqOnAttrIn(UPPER_ON_SRC, 'onbogus')}"）`);
  ok(ua.unreachableStatic.length === A.unreachableStatic.length,
    `UPPER-ON-3 大文字の未知 on* を足しても検査1 の結果は動かない（static ${A.unreachableStatic.length} → ${ua.unreachableStatic.length}）`);
}

// --- ㉓㉔㉕ 開始タグの属性値に `>` が在る世界 ＋ `<body>` の在り方 2 形 -------------
//   【001p / Codex 高B ＝ ㉓】㉑ の先置き位置を求める処理が生テキストの `indexOf('>')` で、
//   属性値の中の `>` をタグ終端と誤認し、先置きがタグの**内側**に落ちて `REGISTRY-FACE` が恒久赤。
//   終端を面から取る（`tagEndPos`）ように直したうえで、その世界を常設化した。
//
//   【001q / cowork 高 ＝ 12 例目】**その ㉓ の検算の中に同じクラスが残っていた。**
//   世界を作る側は面ゲート付きのループで、`<body>` が面上に無ければ黙って no-op するのに、
//   検算側は生テキストの `search(/<body/)`（面ゲート無し・最初の一致）で anchor を取って
//   「注入が成功したこと」を**無条件 assert** していた。実測した破れ方は 2 つ:
//     (a) `<head>` に `<body …=">">` と書いた HTML コメントを 1 行足すと、検算だけが
//         偽物を掴む → `QUOTED-GT-1` が恒久赤（PASS=369 FAIL=1 exit 1）
//     (b) `<body>` 開始タグを省略すると（HTML5 で妥当・001k が `</body></html>` 削除を
//         正当編集と認めた前例と同クラス）ビルダが no-op → 同じく恒久赤
//   今 成立しているのは、実ファイルが JS 文字列の中に `<body>` を 3 箇所持っていて
//   **それが本物より後ろにあるから**でしかない＝「実在の 1 例への依存」そのもの。
//
//   直し方（㉑ と同じ形にそろえる）:
//     1. 開始タグの探索は `openTagPositions`（面ゲート）1 本に集約する
//     2. `<body>` が無い世界のための**自給フォールバック**をビルダが持つ
//     3. **位置はビルダが返し、検算はそれを読む**（検算側の生テキスト検索を全廃）
//   そのうえで (a) (b) の 2 形自体を操作 ㉔ / ㉕ として常設化し、
//   ㉓ の検算を**その 3 世界の上で当て直す**（`gate()` の外の `ok()` は op を足しても
//   検査されない＝001k `shapeSelfChecks()` と同じ理由）。
function buildQuotedGtWorld(src, face) {
  const attr = uniqIn(src, 'data-reachquote');
  const frag = ` ${attr}=">" ${probeVariant(attr, '-b')}="/>"`;
  const valAt = (at) => at + frag.indexOf('=">"') + 2;   // 属性値の中の `>` の位置（自分の断片の中）
  const f = face || classifyFaces(src);
  const open = openTagPositions(src, 'body', f)[0];
  if (open !== undefined) {
    const at = open + '<body'.length;
    recordInjection(frag);
    return { src: src.slice(0, at) + frag + src.slice(at), tagStart: open, valGt: valAt(at), host: '実ファイルの <body>' };
  }
  // `<body>` 開始タグが面の上に無い世界。㉑ の EOF フォールバックと同じく**自給する**。
  const host = uniqIn(src, '__probeQuotedGtHost');
  const lead = `\n<span id="${host}"`;
  const whole = lead + frag + '>x</span>\n';
  recordInjection(whole);
  return { src: src + whole, tagStart: src.length + 1, valGt: valAt(src.length + lead.length), host: '自給の <span>' };
}
// ㉔ 実ファイルの `<head>` に「偽の `<body …=">">`」を含む HTML コメントが在る世界。
//   面の上には無いが、生テキストで探すと**本物より前**に見つかる位置に置く（最悪位置）。
function buildFakeBodyCommentWorld(src, face) {
  const attr = uniqIn(src, 'data-reachprintnote');
  const note = uniqIn(src, '__probeFakeBodyNote');
  const frag = `<!-- ${note}: 印刷帳票は <body ${attr}=">"> を動的生成する（#798 申し送り） -->\n`;
  const f = face || classifyFaces(src);
  const h = lastTagPos(src, 'head', f);
  const at = h >= 0 ? h : 0;   // `</head>` が無い世界ではファイル先頭（どの <body> よりも前）
  recordInjection(frag);
  return { src: src.slice(0, at) + frag + src.slice(at), fakeAt: at + frag.indexOf('<body') };
}
// ㉕ `<body>` 開始タグが無い世界（HTML5 では開始タグの省略が妥当）。
function buildNoBodyOpenWorld(src, face) {
  const f = face || classifyFaces(src);
  const open = openTagPositions(src, 'body', f)[0];
  if (open === undefined) return { src, dropped: 0 };   // 既に無い＝目的の世界そのもの
  return { src: src.slice(0, open) + src.slice(tagEndPos(src, open, f)), dropped: 1 };
}

const FAKE_BODY = buildFakeBodyCommentWorld(RAW);
const NO_BODY = buildNoBodyOpenWorld(RAW);
{
  const ff = classifyFaces(FAKE_BODY.src);
  ok(FACE_NAME[ff[FAKE_BODY.fakeAt]] === 'HTML_COMMENT',
    `FAKE-BODY-1 偽の <body …=">"> は HTML_COMMENT 面に載っている＝面ゲートは騙されない（実測 ${FACE_NAME[ff[FAKE_BODY.fakeAt]]}）`);
  ok(openTagPositions(FAKE_BODY.src, 'body', ff).length === openTagPositions(RAW, 'body').length,
    'FAKE-BODY-2 面ゲートを通した <body> 開始タグの本数は増えていない');
  ok(openTagPositions(NO_BODY.src, 'body').length === 0,
    `NO-BODY-1 <body> 開始タグが面の上に 1 つも無い世界を作れた（除去 ${NO_BODY.dropped} 件）`);
}
addOp({ key: '㉔', label: '㉔<head> の HTML コメントに偽の <body …=">"> が在る世界', src: FAKE_BODY.src });
addOp({ key: '㉕', label: '㉕<body> 開始タグが無い世界（HTML5 で省略は妥当）', src: NO_BODY.src });

// ㉓ の世界と検算を、上の 3 世界すべての上で当て直す。
const QGT_WORLDS = [
  { name: '実ファイルそのまま', src: RAW, op: true },
  { name: '㉔ 偽の <body> がコメントに在る', src: FAKE_BODY.src, op: false },
  { name: '㉕ <body> 開始タグが無い', src: NO_BODY.src, op: false },
];
for (const w of QGT_WORLDS) {
  const q = buildQuotedGtWorld(w.src);
  const qf = classifyFaces(q.src);
  const got = FACE_NAME[qf[q.valGt]];
  ok(got === 'ATTR_VAL',
    `QUOTED-GT-1[${w.name}] 属性値の中の > が ATTR_VAL 面に載っている（host=${q.host}・実測 ${got}）`);
  ok(tagEndPos(q.src, q.tagStart, qf) > q.valGt + 2,
    `QUOTED-GT-2[${w.name}] タグ終端は属性値の中の > より後ろ（面から取れている）`);
  const qa = analyze(q.src);
  ok(qa.unreachableStatic.length === A.unreachableStatic.length,
    `QUOTED-GT-3[${w.name}] 属性を足しても検査1 の結果は動かない（static ${A.unreachableStatic.length} → ${qa.unreachableStatic.length}）`);
  if (w.op) {
    addOp({ key: '㉓', label: '㉓開始タグ（<body>）の属性値に > と /> が在る世界', src: q.src });
  }
}

// --- ㉑ probe 名が実ファイルに先在する世界【001n ★ / RP-009】------------------
//   001m まで「実ファイルに先在すると恒久赤になる固定文字列」を**名指しのリスト**で
//   1 件ずつ潰していた（`onbogus` → face テーブルの marker 16 個）。**名指しをやめる。**
//   `uniqIn` / `uniqOnAttrIn` を通った base はレジストリに載るので、ここでは
//   **レジストリの全 base を実ファイル側に先置きした世界**を作ってゲートを当てる。
//   新しい probe を足せば、その瞬間から自動でこのバッテリに入る（人が思い出さなくてよい）。
//
//   注入位置は**面ごとに回す**。実害が出た形（HTML コメントに 1 行）は必ず含める。
//   参照として数える 3 面（ATTR_VAL_ON / JS_CODE / JS_TMPL_DELIM）だけは除く
//   ＝ そこへ置くと本当の参照になり「検査1 の結果が動かない編集」でなくなるため。
//   先置きは <body> の**直後**（＝ファイルの先頭側）。注入 anchor（`</body>` の直前 /
//   最後のトップレベル関数の直後）より前なので、`indexOf` 系の取り違えに対して最悪位置。
const REGISTRY_FACES = ['HTML_COMMENT', 'HTML_TEXT', 'HTML_TAG', 'ATTR_NAME', 'ATTR_VAL',
  'RAWTEXT', 'STYLE_CSS', 'JS_STR_SQ', 'JS_STR_DQ', 'JS_TMPL_STR', 'JS_LINE_COMMENT',
  'JS_BLOCK_COMMENT', 'JS_REGEX'];
const REGISTRY_FACES_SKIPPED = ['ATTR_VAL_ON', 'JS_CODE', 'JS_TMPL_DELIM'];
// ここでレジストリを凍結する（以降 OPS ループの gate が回っても base は増えないはず。
// 増えていないことは最後に `REGISTRY-3` で照合する）。
const PRESEED_BASES = [...PROBE_BASES].sort();
// ㉑ 自身の anchor。**これはレジストリに載せない**（`uniqIn` を通さない）。
//   載せると「先置きする base」と「その位置を引く anchor」が同じ文字列になり、
//   自分の anchor を掴んで必ず取り違える（実測: 期待 JS_STR_SQ / 実測 JS_CODE）。
//   代わりに、対象にも**どの base にも**含まれないところまで自分で伸ばす。
let REG_SENTINEL = '__probeRegistryAnchor';
while (RAW.indexOf(REG_SENTINEL) >= 0
  || PRESEED_BASES.some((b) => REG_SENTINEL.indexOf(b) >= 0 || b.indexOf(REG_SENTINEL) >= 0)) {
  REG_SENTINEL += 'z';
}
const PRESEED = PRESEED_BASES.map((base, i) => ({
  base, face: REGISTRY_FACES[i % REGISTRY_FACES.length], sent: REG_SENTINEL + i,
}));
const REGISTRY_WORLD = (() => {
  const html = [];
  const js = [];
  for (const p of PRESEED) {
    const { base: n, sent: s } = p;
    switch (p.face) {
      case 'HTML_COMMENT': html.push(`<!-- ${s} ${n} -->`); break;
      case 'HTML_TEXT': html.push(`<span>${s} ${n}</span>`); break;
      case 'HTML_TAG': html.push(`<span id="${s}"></span><x-${n}></x-${n}>`); break;
      case 'ATTR_NAME': html.push(`<span id="${s}" data-${n}-legacy="1">x</span>`); break;
      case 'ATTR_VAL': html.push(`<span id="${s}" class="${n}-pill">x</span>`); break;
      case 'RAWTEXT': html.push(`<textarea id="${s}">${n}</textarea>`); break;
      case 'STYLE_CSS': html.push(`<style>\n.${s}{color:blue}\n.${n}{color:red}\n</style>`); break;
      case 'JS_STR_SQ': js.push(`var ${s}='${n}';`); break;
      case 'JS_STR_DQ': js.push(`var ${s}="${n}";`); break;
      case 'JS_TMPL_STR': js.push(`var ${s}=\`${n}\`;`); break;
      case 'JS_LINE_COMMENT': js.push(`var ${s}=1; // ${n}`); break;
      case 'JS_BLOCK_COMMENT': js.push(`var ${s}=1; /* ${n} */`); break;
      case 'JS_REGEX': js.push(`var ${s}=/${n}/.test('x');`); break;
      default: break;
    }
  }
  const frag = html.join('\n') + '\n<script>\n' + js.join('\n') + '\n<\/script>\n';
  // <body> の直後（面で門番）。ここは **probe の注入ではなく敵役の先置き**なので
  // `INJECTED`（受け入れ基準8 の照合元）には**記録しない**。
  //   001p / Codex 高B: 開始タグの終端も **面から取る**（`tagEndPos`）。
  //   生テキストの `indexOf('>')` は 属性値に `>` を含む開始タグで、値の中の `>` を掴む。
  //   001q: 開始タグの探索は `openTagPositions` へ集約（㉓ と同じ道具・手書きループを残さない）。
  const f = classifyFaces(RAW);
  const open = openTagPositions(RAW, 'body', f)[0];
  if (open !== undefined) {
    const gt = tagEndPos(RAW, open, f);
    return RAW.slice(0, gt) + '\n' + frag + RAW.slice(gt);
  }
  return RAW + frag;   // <body> が無いファイルでも成立させる（EOF 追記）
})();
addOp({
  key: '㉑',
  label: `㉑probe 名 ${PRESEED.length} 件が実ファイルに先在する世界（${REGISTRY_FACES.length} 面へ順に配置）`,
  src: REGISTRY_WORLD,
});
{
  // その世界を**実際に作れたこと**（＝ 各 base が意図した面に載ったこと）と、
  // それが「検査1 の結果は 1 ミリも動かない正当な編集」であることを測る。
  const rf = classifyFaces(REGISTRY_WORLD);
  const bad = [];
  for (const p of PRESEED) {
    const at = REGISTRY_WORLD.indexOf(p.sent);
    const pos = at >= 0 ? REGISTRY_WORLD.indexOf(p.base, at) : -1;
    const got = pos >= 0 ? FACE_NAME[rf[pos]] : '(見つからない)';
    if (got !== p.face) bad.push(`${p.base}: 期待 ${p.face} / 実測 ${got}`);
  }
  ok(bad.length === 0,
    `REGISTRY-FACE 先置きした ${PRESEED.length} 件が全部その面に載っている（ずれ: ${bad.slice(0, 4).join(' / ') || 'なし'}）`);
  // 除いた 3 面の理由: ATTR_VAL_ON / JS_CODE は**参照として数える面**（置くと本当の参照になり
  //   「検査1 の結果が動かない編集」でなくなる）。JS_TMPL_DELIM は `${` `}` の区切り記号そのもので、
  //   名前を載せる余地が無い（中身は JS_CODE 面になる）。
  ok(REGISTRY_FACES.length + REGISTRY_FACES_SKIPPED.length === Object.keys(FACE).length
    && isRefFace(FACE.ATTR_VAL_ON) && isRefFace(FACE.JS_CODE) && !isRefFace(FACE.JS_TMPL_DELIM),
  `REGISTRY-FACE-2 面の割り振りが全 ${Object.keys(FACE).length} 面を説明している`
    + `（先置き ${REGISTRY_FACES.length} 面／除外 ${REGISTRY_FACES_SKIPPED.length} 面 ＝ 参照として数える`
    + ' ATTR_VAL_ON・JS_CODE ＋ 区切り記号そのものの JS_TMPL_DELIM）');
  const ra = analyze(REGISTRY_WORLD);
  ok(ra.unreachableStatic.length === A.unreachableStatic.length,
    `REGISTRY-2 probe 名を先置きしても検査1 の結果は動かない（static ${A.unreachableStatic.length} → ${ra.unreachableStatic.length}）`);
}

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
  + '生テキスト anchor 耐性は ⑰ が、未知 on* 属性の在庫耐性は ⑳（小文字）と ㉒（大文字表記）が、'
  + '開始タグの属性値に > が在る耐性は ㉓ が、'
  + 'probe 名の先在耐性は ㉑ が常に担うので、ここでは在庫の存在を assert しない'
  + '（ハーネス自衛の形状バッテリ ⑱ / ⑳a〜⑳d は 001l で Issue #816 へ移した）');

// =============================================================================
// 8. レジストリの網の完全性【001n ★ 受け入れ基準8 / 001o〜001p ★ 完全一致化】
//    「レジストリに載っていない固定文字列の probe が 0 個」を機械で示す。
//    対象へ注入した断片（`INJECTED`）に現れる probe らしきトークンを全部拾い、
//    それが**実際に生成された名前**であることを要求する。ここが空なら ㉑ の網に漏れが無い。
//
//    ★ 述語（001p・1 文）:
//      **トークンが「`uniqIn` / `uniqOnAttrIn` が実際に返した名前（`PROBE_NAMES`）」
//      「その名前に `probeVariant()` で宣言した接辞を足した派生名（`PROBE_DERIVED`）」
//      「`HOSTILE` に明示した敵役」のいずれかに**完全一致**すること。**
//
//    通る集合の変遷:
//      001n = 「登録名を**どこかに含む**任意の文字列」（部分文字列）。登録名の前後に**未登録の
//             任意の綴り**を足したものが全部通った（`<登録名>Unexpected` / `Unexpected<登録名>` /
//             `aa<登録名>bb`）。← Codex P1
//      001o = 完全一致に締めたが、「登録 base ＋ **生成規則が作りうる**接尾辞」という節を足した。
//             その節が新しい穴で、**一度も生成されていない**`<登録base>999` が通った。← Codex C-1
//      001p = **実際に生成された名前だけ**。生成関数が返り値を必ず登録するので、規則の節は不要。
//      差分＝「生成されていないが理屈の上では作れる綴り」＋「登録名を含むだけの綴り」。
//      なお 17 種の合成トークン（`<登録名>Wire` / `data-<登録名>-legacy` / `<登録名>0` 等）は
//      `probeVariant()` の宣言に置き換えてある（＝通る数は同じでも「なぜ通るか」がコードに在る）。
//
//    ★ この述語が見られない範囲と、その受け皿:
//      集合への所属しか見ないので、**別の場所が既存の名前を固定文字列で書き写す**形は
//      区別できない（Codex C-3）。それは 8a の**ソース走査**（`LITERAL-1`）が受け持つ。
//      また `probeVariant()` の第 1 引数が実行時の値であることは `PROBE_NAMES` 所属でしか
//      確かめていないが、固定で書けばソース走査に出るので、8a と対で閉じる。
//
//    ここは OPS ループの**後**に置く（ループ中の gate() も注入するため）。
// =============================================================================
console.log('=== probe 名レジストリの網（受け入れ基準8）===');
// 注入断片から拾うトークン:
//   (a) `__` を含む識別子         … probe の関数名 / 変数名 / id / class / タグ名
//   (b) `data-…=` の属性名        … 目印として置く属性
//   (c) `on…=` のうち実イベント名でないもの … 未知 on* の probe
//
//   001o: (a) は `/__[A-Za-z0-9_$]+/`（アンダースコア 2 個始まり）だった。それだと
//   `Unexpected<登録名>` から登録名の部分しか切り出せず、**登録名を接尾辞に持つ未登録名
//   （形 b）が原理的に見えない**。識別子を**丸ごと**取る形へ変える（最長の識別子）。
const PROBE_TOKEN_RES = [
  /[A-Za-z0-9_$]*__[A-Za-z0-9_$]*/g,
  /\bdata-[A-Za-z0-9_-]+(?=\s*=)/g,
  /\b(on[a-z]+)(?=\s*=)/gi,
];
// `\xNN` / `\uXXXX` / `\u{…}` を**実際の文字へ復号**してからトークン化する。
//   001o は空白へ**潰して**いた。それだと `\u005f` を並べて綴った識別子（復号後の名前は
//   アンダースコア 2 個で始まる）がトークナイザには空白始まりでしか渡らず、
//   `__` を含まないので**トークンが 1 つも出ずに素通り**する（001p / Codex C-2）。
//   復号すれば本来の綴りが出て stray になる。`\x3c` → `<` / `"` → `"` は
//   区切り文字そのものなので、001o が潰して回避したかった `u0022` 始まりの偽トークンも同時に消える。
const unescapeForTokens = (s) => s.replace(/\\u\{([0-9A-Fa-f]{1,6})\}|\\u([0-9A-Fa-f]{4})|\\x([0-9A-Fa-f]{2})/g,
  (_m, a, b, c) => {
    const code = parseInt(a || b || c, 16);
    return code > 0x10FFFF ? ' ' : String.fromCodePoint(code);
  });
// 隣り合う文字列リテラルの連結を 1 本の綴りへ畳む【001q / cowork 中】。
//   `LITERAL-1` は**連続する綴り**しか見ないので、`'<登録 base>' + 'Wire=99;'` と 2 つに
//   割って書くだけで素通りした（cowork 実測: 注入断片が 1 本増えるのに PASS=370 FAIL=0 exit 0）。
//   `REGISTRY-1` 側は実行時トークンが `PROBE_DERIVED` に居るので covered、`probeVariant()` を
//   通らないので `DERIVE-1` も沈黙する＝**どの機械にも映らない**。
//   字句走査で完全防御は原理的に不可能（`String.fromCharCode` / 配列 join / 変数跨ぎ）なので、
//   ここで閉じるのは**実際に再現した形だけ**。残りは `LITERAL_LIMITS`（`LITERAL-4`）で台帳に残す。
const joinAdjacentStringLiterals = (s) => {
  let out = s;
  for (let i = 0; i < 8; i++) {
    const next = out.replace(/(['"])([^'"\\\n]*)\1\s*\+\s*(['"])([^'"\\\n]*)\3/g,
      (_m, _q1, a, q2, b) => q2 + a + b + q2);
    if (next === out) break;
    out = next;
  }
  return out;
};
function probeTokensIn(frags, res, pre) {
  const found = new Map();          // token -> 最初に見つけた断片の抜粋
  for (const raw of frags) {
    const frag = pre ? pre(unescapeForTokens(raw)) : unescapeForTokens(raw);
    for (const re of (res || PROBE_TOKEN_RES)) {
      re.lastIndex = 0;
      for (let m = re.exec(frag); m; m = re.exec(frag)) {
        const tok = m[0];
        // 実イベント名は probe ではない（`onclick=` 等）。
        if (/^on/i.test(tok) && ON_EVENT_ATTRS.has(tok.toLowerCase())) continue;
        if (!found.has(tok)) found.set(tok, frag.slice(Math.max(0, m.index - 20), m.index + 40));
      }
    }
  }
  return found;
}
// ★ 述語本体。**実際に生成された名前**との完全一致しか許さない（001p / Codex C-1）。
//   `uniqIn` / `uniqOnAttrIn` は返した名前を必ず `PROBE_NAMES` に登録し、
//   `probeVariant()` は派生名を必ず `PROBE_DERIVED` に登録するので、
//   「生成規則が作りうる綴り」を別途許す節は**不要かつ有害**（未生成の `<登録base>999` を通す）。
const probeCovered = (tok) => PROBE_NAMES.has(tok) || PROBE_DERIVED.has(tok) || HOSTILE.has(tok);
const strayProbeTokens = (frags) => [...probeTokensIn(frags).keys()].filter((t) => !probeCovered(t)).sort();
{
  const found = probeTokensIn(INJECTED);
  const stray = [...found.keys()].filter((t) => !probeCovered(t)).sort();
  console.log(`  レジストリ: base ${PROBE_BASES.size} 件 / 一意化後の名前 ${PROBE_NAMES.size} 件`
    + ` / 接辞つき派生名 ${PROBE_DERIVED.size} 件`
    + ` / 敵役として固定した名前 ${HOSTILE.size} 件（${[...HOSTILE].join(', ')}）`);
  console.log(`  注入断片 ${INJECTED.length} 本 / そこに現れた probe らしきトークン ${found.size} 種`);
  ok(stray.length === 0,
    `REGISTRY-1 レジストリを通っていない固定文字列の probe が 0 個`
    + `（実測 ${stray.length} 件: ${stray.slice(0, 6).map((t) => `${t}「${(found.get(t) || '').replace(/\s+/g, ' ')}」`).join(' / ')}）`);
  const grew = [...PROBE_BASES].filter((b) => PRESEED_BASES.indexOf(b) < 0).sort();
  ok(grew.length === 0,
    `REGISTRY-3 ㉑ の網が全 base を覆っている＝㉑ を作った後にレジストリが増えていない`
    + `（増分 ${grew.length} 件: ${grew.slice(0, 6).join(', ') || 'なし'}）`);
  ok(found.size > 0 && PROBE_NAMES.size > 0,
    `REGISTRY-4 照合そのものが空振りしていない（トークン ${found.size} 種 × 登録名 ${PROBE_NAMES.size} 件）`);
  ok(DERIVE_BAD.length === 0,
    `DERIVE-1 派生名の素が全部レジストリの生成物（未登録の素 ${DERIVE_BAD.length} 件: ${DERIVE_BAD.slice(0, 4).join(' / ') || 'なし'}）`);
}

// =============================================================================
// 8a. **このテストのソース自身**に固定の probe 名が書かれていないこと【001p ★ C-3】
//    `REGISTRY-1` は「注入断片に出たトークンが登録名の集合に居るか」しか見ないので、
//    **別の操作が既存の派生名を固定文字列で書き写す**と素通りする
//    （`insertTopLevelJs(..., 'var <登録済み派生名>=1;')`。`probeVariant()` を通らないので
//    `DERIVE-1` も鳴らず、㉑ もその綴りを先置き世界で検証しない）。
//    集合への所属では区別できない——**書いた場所**を見るしかない。
//
//    そこで**ソースを機械で読む**。このファイルに現れる probe らしき綴りは、
//      (1) レジストリの **base**（＝`uniqIn` / `uniqOnAttrIn` に渡す素。ここは固定で正しい）
//      (2) `HOSTILE`（わざと固定で置く敵役）
//      (3) `SOURCE_NOTE` に**理由つきで**書いた例外
//    のどれかでなければならない。**生成された名前・派生名がソースに現れたら FAIL**。
//    コメントも対象に含める（レキサを持ち込まずに済むし、説明文でも綴りを書けば台帳に載る）。
//    生成名を説明したいときは `<登録名>Wire` のような**プレースホルダで書く**。
// =============================================================================
const SELF_SOURCE = fs.readFileSync(__filename, 'utf8');
const SELF_TOKEN_RES = [
  /[A-Za-z0-9_$]*__[A-Za-z0-9_$]*/g,
  /\bdata-[a-z][a-z0-9-]*/g,
  /\bon[a-z]{3,}\b/g,
];
// base でも敵役でもないのにソースに書いてよい綴りと、その理由。
const SOURCE_NOTE = new Map([
  ['__probeRegistryAnchor', '㉑ の anchor。レジストリに載せると先置き対象になり自分の anchor を'
    + '掴んで必ず取り違えるので、意図的に登録しない（001n）。実行時は衝突しなくなるまで `z` で伸びる'],
  ['__dirname', 'Node の組み込み変数（probe ではない）'],
  ['__filename', 'Node の組み込み変数（probe ではない）'],
  ['__', 'トークナイザの説明でアンダースコア 2 個そのものを指す綴り。probe 名ではない'
    + '（どの base よりも短く、対象に在っても一意化が働くだけ）'],
]);
// ★ ソースに書いてよい綴りの述語。**`LITERAL-1` と 8b の検算はこの同じ関数を使う**
//   （8b が自前のコピーを持つと、この述語を壊しても検算が緑のままになる＝空振り。実測で確認した）。
const sourceSpellOk = (t) => PROBE_BASES.has(t) || HOSTILE.has(t) || SOURCE_NOTE.has(t);
// ★ 走査の前処理も `LITERAL-1` と 8b の検算で**同じもの**を通す（自前コピーを持たない）。
const straySpellsIn = (text) => [...probeTokensIn([text], SELF_TOKEN_RES, joinAdjacentStringLiterals).keys()]
  .filter((t) => !sourceSpellOk(t)).sort();
// `LITERAL-1` が**保証しない範囲**【001q / cowork 中・受け入れ基準6/9】。
//   字句走査なので「ソースに連続した綴りとして現れるもの」しか見えない。
//   閉じたことにせず、`KL-*`（lib の既知の限界）と同じ作法で台帳に残す。
const LITERAL_LIMITS = new Map([
  ['動的に組み立てた綴り', '`String.fromCharCode` / 配列 join / 変数を跨いだ組み立ては、'
    + 'ソースのどこにも連続した綴りとして現れない。**字句走査では原理的に見えない**'
    + '（レキサでも評価器でもなく、実行しないと決まらない）。'
    + '実行時に注入されれば `REGISTRY-1` が受け持つが、「既に登録済みの派生名を書き写す」形は'
    + 'そこも通る＝ここが `LITERAL-1` の外側に残る唯一の道'],
  ['文字列リテラルの連結（一部）', '隣り合う**リテラル同士**の `+` は `joinAdjacentStringLiterals` で'
    + '畳んでから走査する（cowork が再現した形）。ただし畳むのは引用符とバックスラッシュを'
    + '含まない単純なリテラルだけで、`\\u` エスケープ入りの断片を跨ぐ連結は畳まない'],
  ['テンプレートリテラルの補間', '`${…}` の中身は実行時に決まるので、補間を跨いだ綴りは見えない。'
    + '生成名の説明は `<登録名>Wire` のようなプレースホルダで書く規約（`SOURCE_NOTE`）で'
    + '「そもそも綴りを書かない」側から閉じている'],
]);
{
  const found = probeTokensIn([SELF_SOURCE], SELF_TOKEN_RES, joinAdjacentStringLiterals);
  const stray = [...found.keys()].filter((t) => !sourceSpellOk(t)).sort();
  console.log(`  ソース走査: probe らしき綴り ${found.size} 種 / base ${PROBE_BASES.size} 件`
    + ` / 台帳の例外 ${SOURCE_NOTE.size} 件 / 保証しない範囲 ${LITERAL_LIMITS.size} 件`);
  ok(stray.length === 0,
    `LITERAL-1 ソースに書かれた probe らしき綴りが全部「base / 敵役 / 台帳の例外」`
    + `（はみ出し ${stray.length} 件: ${stray.slice(0, 8).join(', ') || 'なし'}）`);
  // 空振り検出: 走査が実際に base を拾えていること（拾えていなければ上は無条件に緑）。
  const hitBases = [...found.keys()].filter((t) => PROBE_BASES.has(t));
  ok(hitBases.length >= PROBE_BASES.size,
    `LITERAL-2 走査が全 base ${PROBE_BASES.size} 件をソース上で拾えている（実測 ${hitBases.length} 件）`);
  ok([...SOURCE_NOTE.values()].every((why) => why.length >= 10),
    `LITERAL-3 台帳の例外 ${SOURCE_NOTE.size} 件には全部 理由が付いている`);
  for (const [k, why] of LITERAL_LIMITS) console.log(`    保証しない: ${k} … ${why.slice(0, 60)}…`);
  ok(LITERAL_LIMITS.size >= 3 && [...LITERAL_LIMITS.values()].every((why) => why.length >= 40),
    `LITERAL-4 保証しない範囲 ${LITERAL_LIMITS.size} 件が理由つきで台帳に載っている`
    + '（字句走査で完全防御は原理的に不可能なので、閉じたことにしない）');
}

// =============================================================================
// 8b. 照合そのものの検出力【001o ★ / 001p ★ 受け入れ基準2・3・4】
//    001n は「機械に置き換えた」とだけ書いて、**その機械を破る形**を当てていなかった。
//    破る形／守る形を 1 つずつ当てて、照合が落ちる・落ちないを常設で測る。
//    対象ファイルは 1 バイトも触らない（合成断片だけ）。
//
//    a〜c   登録名を接頭辞 / 接尾辞 / 途中に含む未登録名   → 落ちる（001n の穴）
//    d〜e   **一意化関数が実際に返した**連番つきの名前     → 落ちない（締めすぎの逆向き恒久赤）
//    f      一度も生成されていない規則接尾辞               → 落ちる（001o の穴・Codex C-1）
//    g〜h   Unicode / hex エスケープで書いた識別子         → 落ちる（Codex C-2）
//    i      登録済み派生名の固定再利用                     → `LITERAL-1` が落ちる（Codex C-3）
//
//    ★ d / e の正例は **規則から綴りを組み立てない**（001p 受け入れ基準4）。
//      合成 source にわざと base を置いて `uniqIn` / `uniqOnAttrIn` を**実際に呼び**、
//      関数が返した名前をそのまま使う。組み立てると「照合が許す綴り」を自分で作ることになり、
//      規則の節を消した瞬間に正例まで崩れる（＝ 001o が f を素通しした原因そのもの）。
// =============================================================================
console.log('=== 照合の検出力（受け入れ基準2〜4: a〜i）===');
{
  // 変異に使う base は**レジストリから引く**（固定文字列で名指ししない＝001n の教訓）。
  //   `num` = `uniqIn` に渡された base / `alpha` = `uniqOnAttrIn` に渡された base。
  const basesBy = (rule, shape) => [...PROBE_RULES]
    .filter(([b, rs]) => rs.has(rule) && shape.test(b)).map(([b]) => b).sort();
  const numBase = basesBy('num', /^__[A-Za-z0-9_$]+$/)[0];
  const alphaBase = basesBy('alpha', /^on[a-z]+$/)[0];
  ok(!!numBase && !!alphaBase,
    `REGISTRY-MUT-0 変異に使う base をレジストリから引けた（uniqIn 系 "${numBase}" / uniqOnAttrIn 系 "${alphaBase}"）`);

  // 正例は**関数に作らせる**。base を含む合成 source を渡すので必ず連番側へ逃げる。
  const numGen = uniqIn(`x ${numBase} x`, numBase);
  const alphaGen = uniqOnAttrIn(`x ${alphaBase} x`, alphaBase);
  ok(numGen !== numBase && alphaGen !== alphaBase,
    `REGISTRY-MUT-GEN 正例は一意化関数が実際に返した名前（"${numGen}" / "${alphaGen}"＝素とは別物）`);

  const idFrag = (tok) => `var ${tok}=1;`;
  const onFrag = (tok) => `<div id="x" ${tok}="return false">y</div>`;
  // 識別子を `\uXXXX` / `\xNN` で綴った断片（トークナイザが復号しないと `__` が消える）。
  const escU = (tok) => `var ${tok.replace(/_/g, '\\u005f')}=1;`;
  const escX = (tok) => `var ${tok.replace(/_/g, '\\x5f')}=1;`;
  const FORMS = [
    { key: 'a', why: '登録済みの短い名前を**接頭辞**に持つ未登録名（001n の穴）',
      tok: `${numBase}UnexpectedProbe`, frag: idFrag, stray: true },
    { key: 'b', why: '登録済みの名前を**接尾辞**に持つ未登録名',
      tok: `Unexpected${numBase}`, frag: idFrag, stray: true },
    { key: 'c', why: '登録済みの名前を**途中に含む**未登録名',
      tok: `aa${numBase}bb`, frag: idFrag, stray: true },
    { key: 'd', why: '`uniqIn` が実際に返した名前（誤検出しないこと）',
      tok: numGen, frag: idFrag, stray: false },
    { key: 'e', why: '`uniqOnAttrIn` が実際に返した名前（誤検出しないこと）',
      tok: alphaGen, frag: onFrag, stray: false },
    { key: 'f', why: '**一度も生成されていない**規則接尾辞つきの名前（001o の穴）',
      tok: `${numBase}999`, frag: idFrag, stray: true },
    { key: 'g', why: '`\\uXXXX` で綴った未登録の識別子',
      tok: `${numBase}UnexpectedProbe`, frag: escU, stray: true },
    { key: 'h', why: '`\\xNN` で綴った未登録の識別子',
      tok: `${numBase}UnexpectedProbe`, frag: escX, stray: true },
  ];
  for (const f of FORMS) {
    const frag = f.frag(f.tok);
    const got = strayProbeTokens([frag]);
    // トークナイザがそもそもその形を切り出せていること（切り出せないと「落ちない」が空振りになる）。
    const seen = [...probeTokensIn([frag]).keys()];
    ok(seen.indexOf(f.tok) >= 0,
      `REGISTRY-MUT-${f.key}-tok 注入断片から "${f.tok}" を 1 トークンとして切り出せている（実測 [${seen.join(', ')}]）`);
    ok(f.stray ? got.indexOf(f.tok) >= 0 : got.length === 0,
      `REGISTRY-MUT-${f.key} ${f.why}: "${f.tok}" は ${f.stray ? 'REGISTRY-1 が落ちる' : 'REGISTRY-1 が落ちない'}`
      + `（実測 stray [${got.join(', ')}]）`);
  }
  // 「照合を全部 stray と言う／全部 covered と言う」実装では成立しないこと。
  ok(FORMS.some((f) => f.stray) && FORMS.some((f) => !f.stray),
    `REGISTRY-MUT-BAL ${FORMS.length} 形が両向き（落ちる ${FORMS.filter((f) => f.stray).length} 形 / 落ちない ${FORMS.filter((f) => !f.stray).length} 形）`);

  // --- i: 登録済み派生名の固定再利用（Codex C-3）--------------------------------
  //   集合への所属では区別できないので、**ソース走査**（8a）が受け持つ。
  //   合成した「ソース」に既存の派生名を書き写した世界を作り、`LITERAL-1` の述語を当てる。
  const anyDerived = [...PROBE_DERIVED].sort()[0];
  ok(!!anyDerived, `REGISTRY-MUT-i0 検算に使う派生名をレジストリから引けた（"${anyDerived}"）`);
  ok(straySpellsIn(`insertTopLevelJs(s, a, 'var ${anyDerived}=1;');`).indexOf(anyDerived) >= 0,
    `REGISTRY-MUT-i 登録済み派生名 "${anyDerived}" をソースに固定で書くと LITERAL-1 が落ちる`);
  ok(straySpellsIn(`const x = uniqIn(src, '${numBase}');`).length === 0,
    `REGISTRY-MUT-i-pos 対照: base "${numBase}" を固定で書くのは正しい書き方なので落ちない`);

  // --- j: 連結で 2 つに割って書いた派生名（001q / cowork 中）--------------------
  //   `LITERAL-1` は連続する綴りしか見なかったので、`'<base>' + 'Wire=99;'` で素通りした。
  const cut = Math.max(1, Math.floor(anyDerived.length / 2));
  const halves = [anyDerived.slice(0, cut), anyDerived.slice(cut)];
  ok(straySpellsIn(`x('var ' + '${halves[0]}' + '${halves[1]}' + '=1;');`).indexOf(anyDerived) >= 0,
    `REGISTRY-MUT-j 連結で 2 つに割って書いた派生名も LITERAL-1 が拾う`
    + `（"${halves[0]}" ＋ "${halves[1]}"）`);
  ok(straySpellsIn("const s = 'var ' + 'live=1;';").length === 0,
    'REGISTRY-MUT-j-pos 対照: probe と無関係なリテラル連結は落ちない（畳んだせいの誤検出が無い）');
}

// =============================================================================
// 8c. **生テキスト anchor の全数表**【001q ★ cowork 高（12 例目）/ 受け入れ基準5】
//    この PR を 16 巡させたクラスは毎回同じ形だった——
//    「**常設側の assert / ビルダが、実ファイルの生テキスト上の位置に依存している**」。
//    001j 高1（`lastIndexOf('</body>')`）→ 001k（`lastTagPos` の後方走査）→ 001p 高B
//    （`indexOf('>')`）→ 001q（`search(/<body/)`）と、直した箇所の**隣**へ移動し続けた。
//    箇所を 1 つずつ潰すのはもうやめて、**クラスが空であることを機械で示す**（001n の作法）。
//
//    外延 = このファイルが `search` / `indexOf` / `lastIndexOf` を呼んでいる**全箇所**。
//    ＋ 同じことができる `includes` / `startsWith` / `endsWith` も数える
//    （数えないと「メソッドを変えるだけで台帳から消える」逃げ道が残る）。
//    それぞれを台帳で分類し、
//      (1) 未分類が 0 件      … 新しい呼び出しを足したら必ず分類させる
//      (2) `RAW_POS` が 0 件  … 危険カテゴリが空
//      (3) 台帳の各行が最低 1 箇所に当たる … 腐った（当たらない）行を残さない
//      (4) 敵役の合成サイトが `RAW_POS` に落ちる … 分類器が「何でも安全」に壊れていない
//    を測る。**(4) は 8b と同じ関数を呼ぶ**（自前のコピーを持つと壊しても緑になる・001p の教訓）。
// =============================================================================
console.log('=== 生テキスト anchor の全数表（受け入れ基準5）===');
const ANCHOR_METHODS = ['search', 'indexOf', 'lastIndexOf', 'includes', 'startsWith', 'endsWith'];
// 呼び出し箇所を機械で抽出する。受け手（レシーバ）は後ろ向きに、括弧の釣り合いを見て取る。
function anchorCallSites(text) {
  const lineStarts = [0];
  for (const re = /\n/g, m0 = {}; ;) {   // eslint-disable-line no-constant-condition
    const m = re.exec(text);
    if (!m) break;
    lineStarts.push(m.index + 1);
    void m0;
  }
  const lineOf = (pos) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return { no: lo + 1, start: lineStarts[lo] };
  };
  const re = new RegExp('\\.\\s*(' + ANCHOR_METHODS.join('|') + ')\\s*\\(', 'g');
  const out = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const { no, start } = lineOf(m.index);
    let end = m.index;
    while (end < text.length && text[end] !== '\n') end++;
    // レシーバを後ろ向きに取る（`x`, `a.b`, `f(...)`, `x[...]` を跨ぐ）。
    let i = m.index;
    let depth = 0;
    while (i > start) {
      const c = text[i - 1];
      if (c === ')' || c === ']') { depth++; i--; continue; }
      if (c === '(' || c === '[') { if (depth === 0) break; depth--; i--; continue; }
      if (depth > 0) { i--; continue; }
      if (/[A-Za-z0-9_$.]/.test(c)) { i--; continue; }
      break;
    }
    const argAt = m.index + m[0].length;
    out.push({
      line: no,
      site: text.slice(i, m.index) + '.' + m[1] + '(' + text.slice(argAt, Math.min(argAt + 34, end)),
      // 行の「その位置より前」に `//` が在れば説明文（この本文は `//` 行コメントしか使わない）。
      prose: /\/\//.test(text.slice(start, m.index)),
    });
  }
  return out;
}
// カテゴリ（`safe: false` は「在ってはいけない」）。
const ANCHOR_CATS = new Map([
  ['PROSE', { safe: true, why: 'コメント（説明文）。実行されない' }],
  ['ARRAY', { safe: true, why: '配列の要素検索。文字列上の位置ではない' }],
  ['SYNTH', { safe: true, why: '合成文字列に対する検索。実ファイル由来ではない' }],
  ['SELF', { safe: true, why: '自分で組み立てた断片 / 自分のソースに対する検索。対象ファイルの中身に依存しない' }],
  ['MEMBER', { safe: true, why: '「在るか」だけを見る（位置を使わない）。外れても安全側（一意化がさらに逃げる）へ倒れる' }],
  ['SENTINEL', { safe: true, why: '自給の一意 anchor（uniqIn が対象への非存在を保証）から位置を引く＝自給フォールバック相当' }],
  ['FACE', { safe: true, why: '面ゲートを通した位置だけを採る' }],
  ['ADJACENT', { safe: true, why: '解析結果の位置から**隣接トークンだけ**を後方に取る（間に別の一致が入りえない）' }],
  ['RAW_POS', { safe: false, why: '実ファイルの生テキスト上の位置に依存する。**0 件でなければならない**' }],
]);
// 台帳。**上から順に最初に当たった行が勝つ**。安全カテゴリは「なぜ安全か」まで書く。
const ANCHOR_LEDGER = [
  { re: /^(got|allowed|names|keys|seen|OP_KEYS|PRESEED_BASES)\.indexOf\(/, cat: 'ARRAY',
    why: '差分・台帳キー・トークン列の要素検索' },
  { re: /^m\.(rootNames|derivedOnlyReachable)\.indexOf\(/, cat: 'ARRAY', why: '解析結果の配列の要素検索' },
  { re: /^v\.warnings\.map\(sig\)\.indexOf\(/, cat: 'ARRAY', why: 'warn の署名列の要素検索' },
  { re: /^straySpellsIn\(/, cat: 'ARRAY', why: '8b の検算。stray 配列の要素検索' },
  { re: /^(withStyle|bare|s)\.indexOf\(/, cat: 'SYNTH',
    why: 'T-0c の最小文書 / faceOf・KL-3 の合成文書。対象ファイルを一切読まない' },
  { re: /^frag\.indexOf\(/, cat: 'SELF', why: '直前に自分で組み立てた断片の中の位置（対象の長さを足すだけ）' },
  { re: /^src\.indexOf\(base\b/, cat: 'MEMBER', why: 'uniqIn の衝突判定。位置は使わず「在るか」だけ' },
  { re: /^lowerOf\(src\)\.indexOf\(/, cat: 'MEMBER', why: 'uniqOnAttrIn の衝突判定（ASCII case-insensitive）。同上' },
  { re: /^sp\.value\.indexOf\(dead\)/, cat: 'MEMBER', why: '面から引いた属性値の中に死んだ関数名が在るか。位置は使わない' },
  { re: /^RAW\.indexOf\(REG_SENTINEL\)/, cat: 'MEMBER', why: '㉑ の anchor を対象と衝突しなくなるまで伸ばす判定。同上' },
  { re: /^(REG_SENTINEL|b)\.indexOf\(/, cat: 'MEMBER', why: 'anchor と base の相互包含判定。対象ファイルを読まない' },
  { re: /^s2\.indexOf\((t\.marker|needle|dataOnAttr|id|dead|wire)\b/, cat: 'SENTINEL',
    why: '面 × 変異の表。anchor は uniqIn 済みの marker / id / wire なので対象に先在しない' },
  { re: /^REGISTRY_WORLD\.indexOf\(p\.(sent|base)\b/, cat: 'SENTINEL',
    why: '㉑ の先置き検算。anchor は REG_SENTINEL+i（対象にもどの base にも含まれないところまで伸ばす）' },
  { re: /^out\.lastIndexOf\('<style'/, cat: 'FACE',
    why: 'externalizeStyleBlocks。直後に face[open] === HTML_TAG を確かめて、違えば読み飛ばす' },
  { re: /^src\.lastIndexOf\('function'/, cat: 'ADJACENT',
    why: '解析結果の namePos から直前の function キーワードへ。間に別の function は構文上入りえない' },
];
// ★ 分類器本体。**8c の全数表と、下の敵役検算（受け入れ基準5 の空振り検出）が同じ関数を呼ぶ。**
function classifyAnchor(s) {
  for (const e of ANCHOR_LEDGER) if (e.re.test(s.site)) return e;
  return null;
}
const anchorCatOf = (s) => (s.prose ? { cat: 'PROSE', why: 'コメント' } : classifyAnchor(s));
{
  const sites = anchorCallSites(SELF_SOURCE);
  const used = new Set();
  const tally = new Map([...ANCHOR_CATS.keys()].map((k) => [k, []]));
  const unclassified = [];
  for (const s of sites) {
    const hit = anchorCatOf(s);
    if (!hit) { unclassified.push(`L${s.line} ${s.site.slice(0, 48)}`); continue; }
    if (hit.re) used.add(hit);
    tally.get(hit.cat).push(s);
  }
  for (const [cat, list] of tally) {
    if (!list.length) continue;
    console.log(`  ${cat.padEnd(9)} ${String(list.length).padStart(2)} 件  ${ANCHOR_CATS.get(cat).why}`);
    console.log(`      ${list.map((s) => 'L' + s.line).join(' ')}`);
  }
  console.log(`  合計 ${sites.length} 件 / 台帳 ${ANCHOR_LEDGER.length} 行（当たった ${used.size} 行）`
    + ` / 未分類 ${unclassified.length} 件`);
  ok(sites.length > 0 && [...tally.values()].some((l) => l.length > 0),
    `ANCHOR-0 走査が空振りしていない（呼び出し ${sites.length} 箇所を抽出）`);
  ok(unclassified.length === 0,
    `ANCHOR-1 全 ${sites.length} 箇所が台帳のどれかに分類されている`
    + `（未分類 ${unclassified.length} 件: ${unclassified.slice(0, 4).join(' / ') || 'なし'}）`);
  const danger = [...ANCHOR_CATS].filter(([, v]) => !v.safe).map(([k]) => k);
  const bad = danger.flatMap((k) => tally.get(k).map((s) => `L${s.line} ${s.site.slice(0, 48)}`));
  ok(bad.length === 0,
    `ANCHOR-2 危険カテゴリ（${danger.join('/')}）が 0 件`
    + `（実測 ${bad.length} 件: ${bad.slice(0, 4).join(' / ') || 'なし'}）`);
  const rotten = ANCHOR_LEDGER.filter((e) => !used.has(e));
  ok(rotten.length === 0,
    `ANCHOR-3 台帳 ${ANCHOR_LEDGER.length} 行が全部 実在の箇所に当たっている`
    + `（当たらない行 ${rotten.length}: ${rotten.map((e) => e.cat).join(', ') || 'なし'}）`);
  ok(ANCHOR_LEDGER.every((e) => e.why.length >= 10 && ANCHOR_CATS.has(e.cat)),
    `ANCHOR-4 台帳の各行に「なぜ安全か」が書かれ、カテゴリが宣言済みの ${ANCHOR_CATS.size} 種のどれか`);

  // ★ 空振り検出（受け入れ基準5）: **12 例目そのもの**を合成サイトとして分類器に当てる。
  //   台帳に「何でも安全」の行が入ると、ここが落ちる。
  const M = ANCHOR_METHODS;
  const hostile = [
    { site: `RAW.${M[0]}(/<body/)`, why: '12 例目: 生テキストの最初の <body>（面ゲート無し）' },
    { site: `QUOTED_GT_SRC.${M[1]}('=">"', at)`, why: '12 例目: 生テキストで属性値の位置を引く' },
    { site: `src.${M[2]}('</body>')`, why: '001j 高1: 生テキストで閉じタグの位置を引く' },
    { site: `RAW.${M[1]}('>', k)`, why: '001p 高B: 生テキストでタグ終端を引く' },
  ];
  const leaked = hostile.filter((h) => classifyAnchor({ site: h.site, prose: false }));
  ok(leaked.length === 0,
    `ANCHOR-5 敵役 ${hostile.length} 形が台帳のどの安全行にも当たらない＝RAW_POS へ落ちる`
    + `（漏れ ${leaked.length} 件: ${leaked.map((h) => h.site).join(' / ') || 'なし'}）`);
  // 対照（締めすぎの逆向き）: 実在の安全サイトは安全カテゴリへ落ちる。
  const benign = { site: `out.${M[2]}('<style', i)`, prose: false };
  const bc = classifyAnchor(benign);
  ok(!!bc && ANCHOR_CATS.get(bc.cat).safe,
    `ANCHOR-5-pos 対照: 面ゲート付きの実在サイトは安全カテゴリ（実測 ${bc ? bc.cat : '未分類'}）`);
}

console.log(`PHASE1-REACH-001: PASS=${pass} FAIL=${fail} WARN2=${V.warnings.length}`);
process.exit(fail === 0 ? 0 : 1);
