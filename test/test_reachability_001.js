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
//     op 系の base 一式・在庫ゼロ②の移行ヘルパが生成する変数名 / 目印属性
//     〈綴りは 001s で操作ごと #816 へ移設したのでここには書かない〉 /
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
//   短い名前が登録済みだと、`recordInjection('var <登録名>UnexpectedProbe=1;')` を 1 行足す
//   だけで（**対象ファイルは無変更**）`REGISTRY-1` は鳴らず 334/0 exit 0 のまま（Codex P1 / 実測再現）。
//   未登録なので `PROBE_BASES` にも入らず ㉑ の先置きにも含まれない＝**`REGISTRY-1` と ㉑ の
//   対が、この経路では両方とも空振り**する。001n の変異検算 M1/M2/M3 は登録名と無関係な
//   文字列を使っていたので、この形には当たっていなかった。
//   → **述語を「登録名を含む」から「登録名から規則的に導出できる」へ**（`probeCovered`）。
//     完全一致のみ: `PROBE_NAMES` / `PROBE_DERIVED`（`probeVariant()` で宣言した接辞つき派生名）/
//     「登録 base ＋ その base の生成規則が作りうる接尾辞」/ `HOSTILE`。
//   → トークナイザも直した。`/__[A-Za-z0-9_$]+/`（`__` 始まり）では `Unexpected<登録名>` から
//     短い登録名しか切り出せず、**登録名を接尾辞に持つ形は原理的に見えなかった**。識別子を丸ごと取る。
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
//   ── 001r で塞いだ穴（差し戻し17回目・2026-08-03）★ 3 件 ─────────────────────
//   高（13 例目）**`externalizeStyleBlocks` の開始タグ探索が小文字の綴りしか見なかった**。
//     lib は `lexTag` でタグ名を小文字化するので `<STYLE>` の中身は正しく STYLE_CSS 面に
//     なるのに、剥がす側が開始タグを見つけられず `CSS-EXT-1` が恒久赤（実測 390/1 exit 1）。
//     さらに逆走査なので、大文字ブロックを既存 `<style>` の後ろに置くと**前方の本物を掴んで
//     間の実 CSS ごと切除**する（同 390/1）。`</BODY>` を正当編集と認めた 10 例目と同じクラス。
//     → `openTagPositions`（`ig`・面ゲート）で開始タグを列挙し、**`tagEndPos` がちょうど
//       その CSS run の先頭になるもの**だけを相方にする。**㉗** を常設化（大文字 <STYLE>）。
//   ★ **そしてこの箇所は 001q の `ANCHOR` 台帳で `FACE`（safe）に分類されていた**。
//     `ANCHOR-2`（危険 0 件）は緑のまま実害が safe 行の中で生きていた
//     ＝ **台帳は「分類した」ことしか保証せず「分類が正しい」ことは保証しない**。
//   高（14 例目）**㉕ が `<body>` 開始タグを属性ごと落としていた**。`<body onload="fn()">` の
//     ように開始タグ上に実結線があると、その関数だけ到達不能になり `R1` error（実測 389/2）。
//     HTML5 は**属性を持つ body の開始タグ省略を許さない**ので「省略は妥当」の根拠自体が偽で、
//     実は「実ファイルの `<body>` が属性を持たない」ことへの依存だった。allowlist では
//     デッドロック（基準世界では到達可能なので載せると `R5` が赤くなる）。
//     → 属性を**退避**して無属性 body にしてから省略する。**㉖** を常設化（開始タグ上の実結線）。
//   中 `ANCHOR` 台帳の 3 穴（変数名で騙せる／ブラケット記法を取りこぼす／敵役が固定リスト）。
//     → 分類を**由来（8c）で照合**（`ANCHOR-7`）／ブラケット記法を抽出器へ／敵役を**生成
//       マトリクス**（受け手 × メソッド × 綴り × 記法）へ。台帳の各行に **`unsafeIf`
//       （安全でなくなる条件）** を書かせる（`ANCHOR-4`）。
//   ★ **8e 変換側の全数表**（001r の本体）。12〜14 例目はすべて **assert 側ではなく
//     「実ファイルを加工して世界を作る側」**で起きたのに、8d は assert の呼び出ししか
//     数えていなかった。**このファイルが定義する関数を全部数えて全部分類する**。
//     人の申告に頼らない裏取りを 3 本置く: `XFORM-4`（加工系の本体にタグの綴りのリテラルが無い）/
//     `XFORM-5`（面ゲートの道具を呼ぶ関数は必ず台帳に載る＝未登録の加工関数が黙って
//     「加工しない」に落ちない）/ `XFORM-6`（**タグの綴りを含む正規表現は `i` か
//     両ケースを明示した文字クラスを持つ**＝13 例目の根本原因を字句で禁じる）。
//
//   ── 001s で ①〜㉗ と、その監視機械を Issue #816 へ移した（作者判断 (b)・2026-08-03）──
//   001r は作者判断 (a)「最後の 1 巡」だったが、15 例目（在庫ゼロ②の移行ヘルパが on*
//   属性値を生成 <script> へ**無エスケープ**で埋め込む＝属性値に script の閉じタグを書く
//   正当な HTML で生成ブロックが早期終端し、以降の結線が HTML テキストに落ちて
//   到達可能な関数が R1 error 化する）が出て閉じなかった。合意済みの退避先 (b) を実行:
//   - **移した**: 実ファイル（RAW）を土台に世界を作る操作 ①〜㉗ の全 26 種（⑱ は 001l で
//     移設済み）と、それらだけが使うヘルパ（在庫ゼロビルダ 2 種 / CSS 外部化 / 世界ビルダ
//     一式 / insertTopLevelJsBefore / openTagPositions / tagEndPos / functionSpan /
//     selectorSites / staticNames / gateProblems と実測ループ）、および「移す対象を監視するための機械」
//     （8c 由来解析 TAINT-* / 8d 生テキスト anchor の全数表 ANCHOR-* / 8e 変換側の全数表
//     XFORM-* / 8f LEDGER-1 / ㉑ の先置き世界と REGISTRY-3）。判定は機械で:
//     8e の台帳（XF_FACE / XF_SELF ＝「対象を加工する」に分類された関数）を使う操作は全部
//     該当した＝残る操作は 0 個。
//   - **退避は 1 行も捨てず逐語**で ai-requests/local/2026-08-03_reach-realfile-ops-carryover.js
//     （非コミット・.gitignore の ai-requests/local/）へ。冒頭に 9〜15 例目の全形
//     （再現手順つき）と、#799 側に残るヘルパへの依存一覧を書いた。逐語一致は
//     同ディレクトリの照合スクリプトが cfff457 の行域と突き合わせる。
//   - **残した**: 検査1 本体（gate() の C1〜C3）／合成 fixture（T-0* / T[面]-* / KL-* /
//     R1-POS-* / R8-DERIVED-* / EVENT[*] / ESCAPE-1）／allowlist・baseline 照合
//     （R0 / A* / WI-*）／probe 名レジストリの照合（REGISTRY-1/-4 / DERIVE-1 / LITERAL-* /
//     REGISTRY-MUT-*）／OP-KEYS-*（残る操作の台帳＝空集合を毎回測る）／M9／SCOPE-1。
//   - **代償（明示）**: **正当な編集に対するゲートの耐性は #816 が持つ。このファイルが
//     保証するのは検出力（R1 が新規の死にコードで発火すること）と allowlist 規律だけ**
//     （SCOPE-1 が毎回言う）。#798 の掃除は R0/R1 の検出力と allowlist 照合だけで回す
//     （掃除は HTML の書き方を変えない）。
//
//   ── 001t で直した穴（Codex レビュー・P1 2件 / P2 3件・2026-08-04）──────────────
//   P1-1 **face レクサの行コメント終端が LF のみ**だった。ES5 §7.3 の LineTerminator は
//     LF / CR / U+2028 / U+2029 の 4 種で、CR-only 等を行終端に使うと次行の実コードまで
//     JS_LINE_COMMENT 面に飲まれ、実際の呼出が消えて生きた関数が到達不能と報告される。
//   P1-2 **文字列の行継続（§7.8.4）で `\` + CRLF の LF が残る**。旧実装の `j += 2` は
//     `\` と CR しか消費せず、残った LF を文字列終端と誤認して以降の面分類が崩れる
//     （関数が登録すらされない）。
//   → lib 001t (k): 改行を扱う字句（行コメント終端 / 文字列の終端・行継続 / 正規表現の
//     未終端打ち切り）を全部 4 種＋CRLF（1 単位）対応にし、**LT-*（LineTerminator ×
//     使用箇所の全数表・合成 fixture）**を常設化した。この 2 件は単独では恒久赤に
//     ならない（実害には「飲まれる / 崩れる範囲に必要な参照が在る」共起が要る）が、
//     lib は検査1 の本体で、#798 の掃除（JS を削る作業）中に共起が成立しうるため直した。
//   P2-1 **旧 S3 / S5 が恒真**（lib の定義からどんな入力でも成立＝検出力ゼロ）
//     → census へ降格（gate() 内の注記）。OP-KEYS-1〜5 も空集合に対して恒真であることを
//     台帳の注記に明示した（規律ゲートとして残す。扱いは #816 の整理対象）。
//   P2-2 **REGISTRY-MUT-BAL が実測でなく宣言（FORMS[].stray）を見ていた**
//     → 各形の実測（gotStray）から両極性を測る形へ。
//   P2-3 **changelog 断片が 001s の方針転換を記録していなかった**
//     → 「①〜㉗ と監視機械を #816 へ・常設は検出力＋allowlist 規律のみ・正当編集耐性は
//     実測していない」を docs/changelog.d/20260801_phase1-reach-001.md に追記。
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
//     依存する assert が 0 件」は 8d `ANCHOR-2` が毎回測っていた（001s でその機械ごと
//     #816 へ移した。いまこのファイルが毎回言うのは SCOPE-1）。残る実ファイル依存は
//     `A5-0`/`A5-1` の `limits` キーの 1 点（#816 受理済み。`ZERO-1` の 12 周上限は
//     在庫ゼロ操作ごと 001s で #816 へ移った）。
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
//   001s: その ㉑ と REGISTRY-3 は世界を作る側ごと #816 へ移した。レジストリ本体と
//   REGISTRY-1 / LITERAL-1 は、**残る合成 fixture の注入**を照合するために残す。
//
//   - `PROBE_BASES` … 一意化の**素**（＝実ファイル側に先置きして衝突させる文字列）
//   - `PROBE_NAMES` … 一意化の**結果**（＝実際に注入する名前）。受け入れ基準8 の照合に使う
//   - `INJECTED`    … 対象へ注入した断片の全文。ここに現れる probe らしきトークンが
//                     `PROBE_NAMES` に無ければ「レジストリを通っていない固定文字列」
//   - `HOSTILE`     … probe ではなく**わざと固定**で置く敵役（001s 以降、敵役を置く
//                     世界 ⑳㉒㉑ は #816 へ移したので空が常態）
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
  // 001t（Codex P2-1）: 旧 S3 / S5 の emit 2 本は **census へ降格**（削除）した。
  //   どちらも lib の定義から恒真で、どんな入力でも落ちない＝検出力ゼロだった:
  //   - S3 `functionDeclsAllDepths >= topLevelFunctionCount` … extractFunctions() は
  //     トップレベル関数になり得る宣言を必ず先に allFunctionDecls へ入れ、
  //     topLevelFunctionCount はその部分集合を名前で重複排除した件数（常に成立）。
  //   - S5 `inlineHandlerCount === htmlHandlerCount + derivedHandlerCount` … lib が
  //     inlineHandlerCount をこの 2 項の和として**定義**している（analyze() の返り値）。
  //   数の実態は下の census 行に全部出ている（表示は assert しない＝ C4）。
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

  // --- WI-9【#816 hotfix】走査が盲目になったことを走査自身に申告させる ---------
  //   baseline.top_level_functions は読まれて印字までされているのに番人が無かった。
  //   既存の文字列リテラルに U+2028 を 1 文字置くと関数総数 580 → 17 に落ちるのに
  //   R5 は「allowlist から外せ」と言うだけで、外せば PASS 全緑 exit 0（緑のまま
  //   盲目）だった。原因を問わず「関数総数が floor を割った」を FAIL にする。
  //   ラチェット運用: floor（baseline.top_level_functions）を下げる（#798 の掃除で
  //   関数が正当に減る等）ときは、top_level_functions_revisions の**先頭**へ
  //   { value, reason（根拠参照つき・MIN_REASON 字以上）, date } を積むこと。
  //   WI-9b が「現在値 = 台帳先頭の値」を、WI-9c が台帳全行の理由・日付を強制する。
  //   ★このラチェットで塞げている範囲（#816 の判定・実測にもとづく申告）:
  //     塞いだ = 型 / キー削除 / 配列でない台帳（WI-9a・WI-9b の形の照合）。
  //     塞げていない = 理由の**中身**。WI-9c が見るのは字数・根拠参照の形・日付だけで、
  //     「その value に下げた理由」であることは照合しない。WI-9b は台帳の先頭しか
  //     見ないので、既存の reason を一字一句コピペして台帳を 1 行に切り詰めれば
  //     floor は黙って下げられる（実測: floor 580 → 17 で PASS=354 FAIL=0 exit 0。
  //     001e で自認した「字数だけでは骨抜きにできる」弱点と同型の穴を継承している）。
  //     さらに WI-9 は floor の**下側**しか見ない＝ floor が実測に近いことを要求する
  //     上側の締め（WI-9d）が無く、正当に floor を下げた分の盲目化は恒久的に通る。
  //     上側の締め（WI-9d）と理由の中身の照合は #816。
  emit(a.topLevelFunctionCount >= bl.top_level_functions,
    `WI-9 関数総数が baseline の floor を下回らない（実測 ${a.topLevelFunctionCount} / floor ${bl.top_level_functions}）＝走査の盲目化の申告`);
  const tlfRevs = Array.isArray(blRaw.top_level_functions_revisions) ? blRaw.top_level_functions_revisions : [];
  emit(typeof blRaw.top_level_functions === 'number' && blRaw.top_level_functions > 0,
    `WI-9a baseline.top_level_functions が正の数として実在する（キーの削除で WI-9 を骨抜きにできない。実測 ${blRaw.top_level_functions}）`);
  emit(tlfRevs.length >= 1 && !!tlfRevs[0] && tlfRevs[0].value === blRaw.top_level_functions,
    `WI-9b floor の現在値が改訂台帳（top_level_functions_revisions）の先頭と一致する（実測 ${tlfRevs[0] && tlfRevs[0].value} / ${blRaw.top_level_functions}）`);
  emit(tlfRevs.every((r) => !!r && (r.reason || '').trim().length >= MIN_REASON
      && EVIDENCE_RE.test(r.reason || '') && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '')),
  'WI-9c 改訂台帳の全行に理由（根拠参照つき・日付）がある（floor の変更は理由の追記を強制される）');

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

// gateProblems()（変異済みの (src, allow) に同じゲートを当てる道具）は、使い手の
// 操作 ①〜㉗ ごと 001s で #816 へ移した（参照ゼロの関数を残さない・001l の教訓）。

// =============================================================================
// 1〜4. 常設判定（対象ファイル）
// =============================================================================
console.log('=== 到達可能性ゲート（常設判定） ===');
const G = gate(RAW, ALLOW, ok, console.log);
const A = G.a;
const V = G.v;

// --- WI-9 の検出力の自己検査【#816 hotfix / C1】-------------------------------
//   関数総数が floor を割った**合成世界**（関数 1 本の最小文書 × floor=2 の合成
//   baseline）に gate() を当て直し、WI-9 が実際に落ちることを毎回確かめる。
//   gate() から WI-9 を消す / warn へ降格する変異はここで捕まる（R1 の 1 語変異が
//   素通りした 001i 高3 と同じ理由で、番人には番人の正極性検査を対で置く）。
//   ★限定（#816 の判定・実測にもとづく申告）: これが測るのは**合成世界の負極性**
//   （floor を割った合成入力で WI-9 が鳴ること）だけで、**本番の入力に対して WI-9 が
//   評価されていること**は測っていない。よって「合成世界では鳴るが本番の入力では
//   鳴らない」向きの変異は素通りする（実測: WI-9 の emit を `src.length >= 1000 || …`
//   で囲うと、本番で WI-9 が 1 本も出ないのに WI-9-SELF は緑のまま。合成文書は
//   100 文字弱なので条件が偽になり WI-9 が評価されて鳴るため）。R1 の 1 語変異
//   （001i 高3）と同型の穴が 1 本残っている。正極性（本番の gate 結果に WI-9 の
//   ラベルが実際に現れたことを数える）の追加は #816。
console.log('=== WI-9 の検出力（自己検査） ===');
{
  const wiFn = uniqIn(RAW, '__wi9SelfProbe');
  const wiDoc = `<html><body><script>function ${wiFn}(){ return 1; } ${wiFn}();<\/script></body></html>`;
  const wiAllow = {
    baseline: {
      top_level_functions: 2,
      top_level_functions_revisions: [{
        value: 2,
        reason: 'WI-9 自己検査用の合成 floor（#816 hotfix / 2026-08-04）。実測 1 関数の合成文書に floor=2 を当てて WI-9 の負方向を毎回確かめる。',
        date: '2026-08-04',
      }],
    },
    limits: clone(ALLOW.limits || {}),
    static: [],
    runtime: [],
    bindings: [],
  };
  const wiFails = [];
  gate(wiDoc, wiAllow, (cond, msg) => { if (!cond) wiFails.push(msg); }, () => {});
  ok(wiFails.some((m) => m.startsWith('WI-9 ')),
    `WI-9-SELF 関数総数が floor を割った合成世界で WI-9 が落ちる（実測で落ちた assert: ${wiFails.filter((m) => m.startsWith('WI-9')).length} 本）`);
}

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

// --- LT-*: 字句の行終端の全数表【001t / Codex P1-1・P1-2】-----------------------
//   クラス（G4）: 「face レクサが ES5 の行終端表現を 1 種類（LF）しか見ていない」。
//   外延 = LineTerminator 4 種（LF / CR / U+2028 / U+2029。§7.3）＋ CRLF（1 単位の
//   LineTerminatorSequence）× 改行を扱う使用箇所の全部:
//     行コメントの終端（P1-1）／文字列の行継続 \+改行（P1-2・§7.8.4）／文字列の終端
//     （★#816 hotfix: LF / CR だけが打ち切る。U+2028 / U+2029 は ES2019 改訂で
//     文字列の中に生で置けるので打ち切らない＝箇所ごとに規則が違う）
//     ／正規表現リテラルの未終端打ち切り（生の改行・\+改行の両方。§7.8.5）
//     ／テンプレートリテラル（反例＝生の改行も \+改行も中身が同じ面のままなので
//     改行の種類に依存しない）。
//   すべて自給自足の合成文書（対象へ注入しない）＝ C1。実害の向きは両方向:
//   P1-1/P1-2 は「生きた関数を殺す」（コメント面に飲む / 関数登録が消える）、
//   正規表現は「後続の実コードを文字列系の面に飲む」。修正（lib 001t (k)）を戻すと
//   LF 以外の行が落ちることを実測済み（変異検算は 001t RESULT）。
console.log('=== 字句の行終端の全数表（001t LT-*）===');
{
  const LT = [['LF', '\n'], ['CR', '\r'], ['CRLF', '\r\n'], ['LS', '\u2028'], ['PS', '\u2029']];
  const doc = (js) => `<html><body><script>${js}<\/script></body></html>`;
  // #816 hotfix の訂正【LT-* の空振り】: 「unreachableStatic に出ない」だけでは、走査が
  //   完全に盲目になって関数が**登録すらされなかった**ときも真になる（実測: script の
  //   中身を JS として一切走査しない変異を lib に当てても、落ちる LT-* は
  //   topLevelFunctionCount を併記していた LT-STR-CONT-* の 5 本だけで、この PR の退行を
  //   pin しているはずの LT-STR-TERM-LS / -PS は緑のままだった）。LT-* の fixture は
  //   どれも上位関数をちょうど 1 本だけ宣言するので、LT-STR-CONT-* と同じく
  //   topLevelFunctionCount を併記し、**登録されたうえで生きている**ことを要求する。
  const liveIn = (js, n) => {
    const m = analyze(doc(js));
    return m.topLevelFunctionCount === 1 && !m.unreachableStatic.some((x) => x.name === n);
  };
  // #816 hotfix: fixture の合法 / 非合法の期待値は実エンジン（new Function）に聞く。
  // 「オラクルにかけられない形」を黙って期待値に使わせないための機械。
  const engineLegal = (js) => { try { new Function(js); return true; } catch (e) { return false; } };
  for (const [nm, t] of LT) {
    // P1-1: 行コメントは 4 種のどれでも終端する（次行の実呼出がコメント面に飲まれない）。
    ok(liveIn(`function ltA(){ return 1; } //c${t}ltA();`, 'ltA'),
      `LT-CMT-${nm} 行コメントが ${nm} で終端し、次行の呼出が生きる`);
    // P1-2: 文字列の行継続（\ + 改行）は 1 単位で消費される（CRLF で LF が残らない）。
    const mCont = analyze(doc(`var s='x\\${t}y'; function ltB(){ return 1; } ltB();`));
    ok(mCont.topLevelFunctionCount === 1 && !mCont.unreachableStatic.some((x) => x.name === 'ltB'),
      `LT-STR-CONT-${nm} 文字列の行継続 \\+${nm} を 1 単位で読む（後続の関数が登録され、生きる）`);
    // 文字列の終端【#816 hotfix】: 期待値の出どころは実エンジン（new Function）。
    //   箇所ごとに規則が違う——LF / CR は文字列を打ち切る（生で置くと SyntaxError＝
    //   ここで pin するのは未終端文字列からの**復帰挙動**）。U+2028 / U+2029 は
    //   ES2019 の改訂（§7.8.4 → 現 §12.9.4）で文字列の中に**生で置ける**ので
    //   打ち切らない。001t は 4 種で平坦に打ち切り、既存リテラルへの LS/PS 1 文字で
    //   走査が盲目になった（580 関数 → 17 関数・緑のまま）。
    //   各 fixture の合法 / 非合法をテスト自身が実エンジンに問い合わせて assert する
    //   （オラクルにかけられない形を期待値に使わせない機械）。
    if (t === '\u2028' || t === '\u2029') {
      // 合法 fixture（閉じ引用符あり）: 文字列は閉じ引用符まで 1 つで、後続は生きる。
      //   関数宣言は文字列より**前**に置く（登録済みの関数の呼出が飲まれる向きで測る。
      //   宣言ごと飲まれると unreachableStatic に出ず liveIn が空振りで真になるため）。
      const fixLegal = `function ltC(){ return 1; } var q='a${t}b'; ltC();`;
      ok(engineLegal(fixLegal),
        `LT-STR-LEGAL-${nm} fixture が実エンジンで合法（new Function が受理する）`);
      ok(liveIn(fixLegal, 'ltC'),
        `LT-STR-TERM-${nm} 生の ${nm} は文字列を打ち切らず（ES2019）、閉じ引用符の後の呼出が生きる`);
    } else {
      // LF / CR / CRLF: 生で置いた文字列は実エンジンで SyntaxError（それをテスト自身が
      // 確かめる）＝合法な fixture は作れない。未終端の打ち切りで後続コードへ復帰する
      // こと（呼出が文字列面に飲まれないこと）を pin する。
      const fixIllegal = `function ltC(){ return 1; } var q='a${t}ltC();`;
      ok(!engineLegal(fixIllegal),
        `LT-STR-LEGAL-${nm} fixture は実エンジンで SyntaxError（生の ${nm} は文字列に置けない）＝復帰挙動の pin であることの申告`);
      ok(liveIn(fixIllegal, 'ltC'),
        `LT-STR-TERM-${nm} 生の ${nm} が未終端文字列を打ち切り、後続の呼出が文字列面に飲まれない（復帰挙動）`);
    }
    // 正規表現: 生の LineTerminator で未終端＝除算へフォールバックする。
    ok(liveIn(`function ltE(){ return 1; } var r = /abc${t}ltE(); var q=2/;`, 'ltE'),
      `LT-RE-${nm} 正規表現の走査が ${nm} で打ち切られ、後続の呼出が正規表現面に飲まれない`);
    // 正規表現: \ の直後の LineTerminator も未終端（旧実装は LF ですら \ 越しに飲んでいた）。
    ok(liveIn(`function ltF(){ return 1; } var r = /a\\${t}ltF(); var q=2/;`, 'ltF'),
      `LT-RE-ESC-${nm} 正規表現の \\+${nm} も未終端として打ち切る`);
    // テンプレートリテラル: 生の改行も \+改行も中身は JS_TMPL_STR のまま（改行に依存しない字句＝反例）。
    ok(liveIn(`var t=\`a${t}b\\${t}c\`; function ltD(){ return 1; } ltD();`, 'ltD'),
      `LT-TMPL-${nm} テンプレートリテラルは ${nm} でも面が崩れない`);
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
// 7. 実際の編集に対するゲートの耐性（①〜㉗）は 001s で Issue #816 へ移した
//    （作者判断 2026-08-03 / (b)。経緯と代償はヘッダの 001s 節）。
//    残る操作は 0 個。操作の台帳（OP-KEYS-*）だけ「宣言していない操作を黙って
//    足せない」規律として残す（実測ループと gateProblems() は操作ごと #816 へ＝
//    1 度も鳴らない ok() 行をこのファイルに置かないため）。
//    退避（逐語・1 行も捨てていない）:
//    ai-requests/local/2026-08-03_reach-realfile-ops-carryover.js（非コミット）
// =============================================================================
console.log('=== 実際の編集に対するゲートの耐性（001s: 全操作を Issue #816 へ移設） ===');

// --- 操作の台帳（001i 中1・001s 以降は「宣言＝空集合」を毎回測る）--------------
const OPS = [];
const OMITTED = [];
const omit = (key, why) => { OMITTED.push({ key, why }); };
const addOp = (op) => { OPS.push(op); };
// 001s: 宣言済みの操作は空集合（①〜⑰⑲〜㉗ の全 26 種を #816 へ・⑱ は 001l で移設済み）。
//   操作を戻す / 足すときは、まずここへ宣言してから addOp / omit に接続する
//   （OP-KEYS-2/-3 が「宣言外のキー」と「宣言だけで実行も省略もされない操作」を禁じる）。
const OP_KEYS = [];
const OP_KEYS_ALWAYS = [];
void omit;
void addOp;

// --- 台帳の照合（001i 中1）---------------------------------------------------
//   001t 注記（cowork パネル / Codex P2-1 の同型）: OPS / OMITTED / OP_KEYS が全部
//   空の現在、OP-KEYS-1〜5 は**空集合に対して恒真**（対象ファイルのどんな状態でも
//   落ちない）。それでも残すのは、これが入力への検出ではなく**このファイルの編集への
//   規律**だから: 操作を addOp / omit で戻すとき OP_KEYS へ宣言しなければ
//   OP-KEYS-2/-3 が落ちる（宣言を黙って迂回できない）。空集合の間に検出力が無い事実は
//   ok() 全数表（001t RESULT）に明記し、恒真のままの扱いは #816 の整理対象とする。
{
  const keys = OPS.map((o) => o.key);
  const omittedKeys = OMITTED.map((o) => o.key);
  ok(keys.length === new Set(keys).size, `OP-KEYS-1 実行する操作キーに重複が無い（${keys.join('') || 'なし'}）`);
  ok(keys.every((k) => OP_KEYS.indexOf(k) >= 0) && omittedKeys.every((k) => OP_KEYS.indexOf(k) >= 0),
    `OP-KEYS-2 宣言外のキーが無い（実行 ${keys.join('') || 'なし'} / 省略 ${omittedKeys.join('') || 'なし'}）`);
  const covered = [...new Set(keys.concat(omittedKeys))]
    .sort((x, y) => OP_KEYS.indexOf(x) - OP_KEYS.indexOf(y)).join('');
  ok(covered === OP_KEYS.join(''),
    `OP-KEYS-3 宣言した ${OP_KEYS.length} 操作が「実行」か「理由つき省略」のどちらかに必ず分類される（実測 ${covered || 'なし'}）`);
  const missing = OP_KEYS_ALWAYS.filter((k) => keys.indexOf(k) < 0);
  ok(missing.length === 0,
    `OP-KEYS-4 在庫に依存しない ${OP_KEYS_ALWAYS.length} 操作は常に実行される（欠け: ${missing.join('') || 'なし'}）`);
  ok(OMITTED.every((o) => (o.why || '').length >= 10),
    'OP-KEYS-5 省略した操作には必ず理由が付いている');
}

// 実測ループ（gateProblems で各操作の世界へゲートを当て直す）は操作ごと #816 へ。
// 戻すときは carryover の VERBATIM L2231-L2252（ループ）と L1245-L1254（gateProblems）を使う。
console.log(`  操作 ${OPS.length}/${OP_KEYS.length} 種（001s: ①〜㉗ の全 26 種を Issue #816 へ移した。`
  + '正当な編集に対する耐性は #816 が持ち、このファイルは検出力と allowlist 規律だけを保証する）');

// =============================================================================
// 8. レジストリの網の完全性【001n ★ 受け入れ基準8 / 001o〜001p ★ 完全一致化】
//    「レジストリに載っていない固定文字列の probe が 0 個」を機械で示す。
//    対象へ注入した断片（`INJECTED`）に現れる probe らしきトークンを全部拾い、
//    それが**実際に生成された名前**であることを要求する（001s: ㉑ の先置き世界と
//    REGISTRY-3 は #816 へ。ここは**残る合成 fixture の注入**の照合として生きる）。
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
  const mutMeasured = [];   // 001t: 各形の**実測**極性（宣言 f.stray ではなく got から）
  for (const f of FORMS) {
    const frag = f.frag(f.tok);
    const got = strayProbeTokens([frag]);
    // トークナイザがそもそもその形を切り出せていること（切り出せないと「落ちない」が空振りになる）。
    const seen = [...probeTokensIn([frag]).keys()];
    ok(seen.indexOf(f.tok) >= 0,
      `REGISTRY-MUT-${f.key}-tok 注入断片から "${f.tok}" を 1 トークンとして切り出せている（実測 [${seen.join(', ')}]）`);
    const gotStray = got.indexOf(f.tok) >= 0;
    mutMeasured.push({ key: f.key, gotStray });
    ok(f.stray ? gotStray : got.length === 0,
      `REGISTRY-MUT-${f.key} ${f.why}: "${f.tok}" は ${f.stray ? 'REGISTRY-1 が落ちる' : 'REGISTRY-1 が落ちない'}`
      + `（実測 stray [${got.join(', ')}]）`);
  }
  // 「照合を全部 stray と言う／全部 covered と言う」実装では成立しないこと。
  //   001t（Codex P2-2）: 判定は宣言（FORMS[].stray）ではなく**実測**（各形の gotStray）から
  //   測る。旧実装は「直前で自分が書いた表に true と false が両方居るか」だけを見ていたので、
  //   strayProbeTokens() が全トークンを許可 / 拒否する実装になっても常に PASS した（恒真）。
  //   いまは全許可なら gotStray が全 false、全拒否なら全 true になり、この assert が落ちる。
  ok(mutMeasured.some((r) => r.gotStray) && mutMeasured.some((r) => !r.gotStray),
    `REGISTRY-MUT-BAL ${FORMS.length} 形の実測が両向き（実測で落ちた ${mutMeasured.filter((r) => r.gotStray).length} 形`
    + ` / 落ちなかった ${mutMeasured.filter((r) => !r.gotStray).length} 形）`);

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
// 9. このファイルが保証する範囲【001s / 受け入れ基準6】
//    ①〜㉗（正当な編集に対する耐性）と、その監視機械（8c/8d/8e/8f）は Issue #816 へ
//    移した。「保証しない」を黙らせず、毎回ここで言う（断言は人が書かず機械に言わせる）。
// =============================================================================
const SCOPE_LIMITS = new Map([
  ['正当な編集に対する耐性', '実ファイルを土台に世界を作って当て直す操作（①〜㉗）と、'
    + 'その監視機械（8c 由来解析 / 8d 生テキスト anchor の全数表 / 8e 変換側の全数表 /'
    + ' 8f 台帳の保証しない範囲 / ㉑ の先置き世界と REGISTRY-3）は 001s で全部 Issue #816 へ移した。'
    + '**正当な編集に対する耐性は #816 が持つ。#799 は検出力と allowlist 規律だけを保証する**。'
    + '#798 の掃除は R0/R1 の検出力と allowlist 照合だけで回せる（消し漏れは R1 が、'
    + '掃除漏れの allowlist は R5 が落とす）。耐性が要るのは「掃除の途中で HTML の書き方を'
    + '変えたとき」で、#798 はそれをしない（2026-08-03 / #816）'],
  ['このファイルに残る実ファイル依存', 'A5-0 / A5-1 が allowlist の limits キーの実在に依存する'
    + '（#816 受理済み・2026-08-03）。在庫ゼロ操作と一緒に ZERO-1 の 12 周上限も #816 へ移った。'
    + 'それ以外のブロッキング assert は合成 fixture と「解析結果 × allowlist の照合」だけに'
    + '依存する（C1 / C2 / C3 の拘束はヘッダのとおり）'],
]);
{
  for (const [k, why] of SCOPE_LIMITS) console.log(`  保証しない（001s）: ${k} … ${why.slice(0, 50)}…`);
  ok(SCOPE_LIMITS.size >= 2 && [...SCOPE_LIMITS.values()].every((w) => w.length >= 40),
    `SCOPE-1 001s で移した範囲＝このファイルが保証しない範囲 ${SCOPE_LIMITS.size} 件が理由つきで書かれている`
    + '（正当な編集に対する耐性は #816 が持つ。ここは検出力と allowlist 規律だけを保証する）');
}

console.log(`PHASE1-REACH-001: PASS=${pass} FAIL=${fail} WARN2=${V.warnings.length}`);
process.exit(fail === 0 ? 0 : 1);
