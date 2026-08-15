## CHG-MODAL-INLINE-ERROR-001: 対戦相手変更モーダルの入力エラー9件を native alert から画面内表示へ

Issue #881。STYLE-GUIDE **v1.2 §3 N5**（操作を止めた理由の提示）の最初の適用例。

### なぜ

`bindChangePairingModalEvents` の入力エラーはすべて native `alert()` だった。
正本 §3 は「alert は保存失敗など**必ず認知すべき致命的事象だけ**」とし、v1.2 で
「**入力の間違い（選び直せば続行できるもの）はここに入らない → N5**」を明記した。
9件はいずれも `return` で保存を拒否するハードブロックで、選び直せば続行できる。

### 何を変えたか

| | |
|---|---|
| 追加 | `#chg-err`（`role="alert"` / `aria-live="assertive"` / danger 面色 / 見出し語つき）を**ボタン行の直前**に常設 |
| 追加 | `showChangePairingError(text)` / `clearChangePairingError()` |
| 追加 | `[data-chg-card="1"][data-chg-err="1"]{max-height:85vh;overflow-y:auto}`（**エラー表示中だけ**・SCALE-MODAL-001 #767 に揃える） |
| 変更 | 9件の `alert(...)` → `showChangePairingError(...)`。うち**3件は文言も直した**（次の行動が無かった・用語を「参加者」に） |
| 変更 | `chg-p1` / `chg-p2` の `change` で表示を消す |
| **触らない** | **候補ゼロ案内（PR #108 §8.2・`data-chg-empty-notice`）は1バイトも無改変**＝ info（開いたときの状態説明）と N5（押した結果止めた）は別の器 |
| **触らない** | `内部エラー: 入れ替え後の重複を検出しました`（致命的事象）と `結果入力済みのため変更できません`（`changePairing` の入口・モーダルがまだ無い）は `alert()` のまま |
| **触らない** | 判定ロジック・判定順序・`return` の位置・`appConfirm` の2件・`resetSelectsToOriginal` の呼び出し |

文言を直した3件（pin ゼロ or 接頭辞一致で既存 pin は無改変）:

- `同じ選手を先手・後手両方に選べません` → `同じ参加者を先手・後手の両方には選べません。／どちらか一方を別の参加者に選び直してください。`
- `変更がありません` → `変更がありません。／先手か後手を選び直してください。`
- `相手ペアが結果入力済みのため、入れ替えできません` → 同文＋`／結果が入っていない別の対局の参加者を選んでください。`

★ **Codex P2 (r3790501527) を受けて、残り2件（`2人を同時に…` / `再戦になる…`）の「選手」も
「参加者」に直した**（新しく N5 スロットに出る UI なので §4.1 が掛かる、という指摘）。
＝ **9件すべてが「参加者」**。option ラベル `同じ選手`（`test_pairing_classify_001.js:151` に pin）の
移行は別スライスのまま。

### ★ 検査の作り — `test/test_chg_inline_error_pins_881.sh`（4段の自己検査）

設計レビューで「**pin を足したのに既存語に当たって噛んでいない**」が **4回連続**で見つかった。
しかも3回は「前の回の直しの中」で作っていた。

| 巡 | 病気 | 落とす段 |
|---|---|---|
| 4巡目 | 裸の `scrollIntoView` / `#fdecea` / `role="alert"` / `textContent`（いずれも v140 に既存） | **②** |
| 5巡目 | `! grep "innerHTML"`（88箇所・実装後も赤）／裸の `removeAttribute`（既存2箇所） | **①** / **④** |
| 6巡目 | 裸の `role="alert"` を独立 pin に分けて素で緑に戻した | **②** |
| 7巡目 | `\(head\|body\)` は GNU 拡張。BSD grep では非マッチ＝否定が恒久 true | **③** |

→ **①実装後に緑 / ②ベースに赤 / ③各変異に対して赤 / ④AND の各項が単独で②**、の4段にした。
**①②③④ はそれぞれ過去の実例で唯一の検出者**になっている。
変異は `test/tools/chg_inline_error_881_mutants.js` が実行時に生成する（**28本**・repo には置かない）。

★ **Codex P2 (r3790501526) を受けた直し**: ③ は静的 pin で殺せない変異を
「動的基準が担当」として**無条件 PASS 扱いにしていた**（＝動的検査が本当に殺せるかを確かめていない）。
- ③ ではそれらを**件数に数えない**（`--` 表示）。**どちらの担当でもない変異は FAIL**
- **`test/tools/chg_inline_error_881_mutation_check.sh` を新設**し、動的担当17本に
  **実 e2e を1本ずつ当てて赤になること**を確かめる（対照として未変異が緑であることも見る）
- 重点事項だった**9件の `return` を1つずつ落とす変異 R1〜R9 を追加**。
  `appConfirm` が非同期なので `state` と modal の不変では殺せず、
  **`[E*-6]`（`#app-modal` が出ない）だけが殺す**ことを実測で確認

★ 実際に **① がこの実装の欠陥を1件捕まえた**（本文の代入を変数経由で書いたため pin と食い違った）。

### 検証（cloud Linux・`LC_ALL=C.UTF-8`・in-tree）

- `bash test/run_tests.sh shogi_v4.html` → **PASS=252 FAIL=0 WARN=0**（ベース 251・**FAIL 増ゼロ／件数不減**）
  - `run_tests.sh:109 / :110 / :111` の grep pin は**無改変で緑**
  - `test_chg_inline_error_pins_881.sh` は自動発見され **44/44 PASS**
- `bash test/run_e2e.sh` → **10/10 スイート PASS**
  - `chg_modal_inline_error_881.e2e.js`（新設）**78/0**
- `bash test/tools/chg_inline_error_881_mutation_check.sh` → **46/0**（動的担当17本すべて赤・担当漏れゼロ）
  - `chg_modal_withdrawn_836.e2e.js`（追随更新）**41/0**。ベースに当てると **35/6**＝空回りでない
- 置換はすべて**出現回数1を assert してから**適用（13件）。うち1件は出現回数2で自動的に止まり、アンカーを一意化した

### 実機で確かめてほしいこと（作者）

1. **iPhone / iPad の実機**で、エラーが出たときに本文が最後まで読めること（`85vh` の効き・`env(safe-area-inset-*)`）
2. **VoiceOver** でエラーが読み上げられること（`role="alert"` の announce は AT 依存で cowork では測れない）
3. **macOS の bash 3.2.57 / BSD grep** で `bash test/test_chg_inline_error_pins_881.sh` が通ること
   （cloud は GNU grep。POSIX BRE の差はこの1回でしか確かめられない）
