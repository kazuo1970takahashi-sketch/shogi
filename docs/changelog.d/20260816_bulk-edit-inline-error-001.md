## BULK-EDIT-INLINE-ERROR-001: 名前一括編集モーダルの入力エラー2件を native alert から画面内表示へ

Issue #887。STYLE-GUIDE v1.2 §3 **N5** の2例目（1例目は #881 / PR #886）。

### STYLE-GUIDE 準拠（正本 §8-1 の要求）

§1 danger 面色 ／ §3 N5（次の行動を1つ必ず含める）／ §3.1 見出し語 ／ §3.2 置き場所（ボタン行の直前）／
§4.1 用語（「保存」はモーダルのボタンラベルの指示語・#881 の見出し語 `:10666` と同一表記）／
**§10.4 キーボード共存（表示直後＋visualViewport の resize/scroll・rAF 間引き）**

### 何を変えたか

| | |
|---|---|
| 追加 | `#bulk-err`（`role="alert"` / `aria-live="assertive"` / danger 面色 / 見出し語）を**ボタン行の直前**に常設 |
| 追加 | `showBulkEditError(msg)` / `clearBulkEditError()`。器が無ければ `alert()` に落とす |
| 追加 | **キーボード共存**: `isBulkKbdActive()` / `fitBulkCardToViewport()` / `onBulkViewportChange()` を `visualViewport` の `resize`/`scroll` に結線（#734 と同じ命名規約・同じ fail-soft 契約） |
| 変更 | 2件の `alert(...)` → `showBulkEditError(...)`。**B1 は行の呼び方を entry_no（`A05` 形式）に変更**（作者裁定: 画面の行ラベルと一致させる。配列 index の「3番目」は欠番があると必ず食い違う） |
| 変更 | `input` で消す（text 入力なので直し始めた時点。#881 の select は `change`） |
| 追加 | `resetAll` / `resetTournamentProgressOnly` の**モーダル掃除経路にも `unbindBulkViewportFollow()`**（第3の閉じ口。listener を取り残さない・bound=0 なら no-op） |
| 移設 | カードの `max-height:80vh;overflow-y:auto` を inline style → `.bulk-card` クラスへ。**見た目の変更ではない**。キーボード対応の `style.maxHeight=''` リセットがビルダーの書いた 80vh まで消すため（実測でカードが伸びた）。規律は INPUT-KBD-COEXIST-004 と同じ「実行時に触ってよいのはビルダーが書いていないプロパティだけ」 |
| 1行変更 | `run_tests.sh:80-88`（未エスケープ検査の除外リストに `showBulkEditError(` を追記・**裏づけは pin Q4**・理由コメも併記） |
| **触らない** | `:8527`「クラスの参加者がいません」＝ **UI から到達不能**（#743 ⑤b で0名時はボタン非表示。「器が無い」ではない）／ `notifySaveWarning`（SAVE-003b）＝ **N3（fail-soft）であって N5 でない**／ 判定ロジック・判定順序・`break` の位置・`hasError` |

### ★ 実装が先行便 #881 の検査を壊しかけた（変数名の衝突）

同型の実装を v1 の変数名（`el`/`body`/`text`/`card`）で書くと、**#881 の変異生成器のアンカー6本と1バイト一致**して
`mut()` の出現回数 assert が失敗し、`run_tests.sh` が赤になった（実測）。
→ **`slot`/`slotBody`/`msg`/`cardEl` に改名**。`cardEl` は必須（`bulkCard` では `card.lastElementChild` に
部分一致して #881 の P1 が X1 変異を殺せなくなる）。**教訓: 同型実装は文字列を必ずずらし、
先行便の変異アンカー全数と突き合わせて数える。**

### 検査の作り

- **静的 pin は6段**（#881 の4段＋**⑤担当変異ゼロの pin を落とす**＋**⑥台帳の整合**）。
  ⑤は**③の実測 kill 結果**から数える（表を読む実装だと表の誤りに気づけない＝反証パネルが実証）。
  ⑥は (a) **期待 PASS 総数のメタ pin**（台帳から項が静かに消えると総数が減る。実測: PINS から
  1本消しても・AND 項を消しても・写しを緩めても、①〜⑤はすべて緑のままだった）と
  (b) **mutation_check の `DYN=` と `DYN_OWNED` の突合**（③の表示「動的担当（…で実証）」を虚偽にしない）。
- Q4 の否定は **head/body 両方**＋**API スコープ内に innerHTML 系ゼロ**の2本立て。
  `.bulk-err-head` へ innerHTML を流す変異（S4hh）は**実 XSS** なのに、body だけ見る版では素通りした（実測）。
  否定項2本はそれぞれ**単独で赤にする変異**（S4x / S4y）を持つ（#881 の X3/X3r と同じ罠の対策）。
  ★ 3巡目パネルがさらに1段内側を突いた: head 側の否定を **body に狭めても** S4hh は肯定項で死ぬため
  6段が全緑のままだった → **S4hh2**（textContent を保持したまま API の外から head へ流す実 XSS の形）を追加。
  `scrollIntoView` の**値**（nearest）にも kill 証拠が無かった → **S6b**（center に変える）を追加。
  e2e の [D3]（scroll 追従）は **scroll イベントを一度も発火していなかった**（resize で代用されていて、
  scroll リスナーを消しても 51/0 全緑）→ setVV に第3引数を足し、D3 は 'scroll' で発火するよう修正。
- 動的変異チェックは #881 と同型（狙ったアサーション ID まで照合・ハーネスエラーは kill でなく検査失敗・
  期待集合と生成物の両方向照合・`run_e2e.sh` から必須経路として実行・欠落は FAIL）。
- e2e は **78セル**（参加者1〜64 × 375×667/440 × キーボード0/216/300 × 空欄/重複）＋
  **キーボード後出し/消失/スクロール**＋**画素検査**（格子採取。中心1点は文字グリフに当たって偽陰性・実測36セル）＋
  **画素検査そのものの自己検査**（`#rotate-overlay` が発火する 375×374 で「覆いを検出できる」ことを確認。
  発火条件は**幅>高さ かつ 幅≤900**。375×375 は portrait 扱いで発火しない）。

### 検証（cloud Linux・in-tree・引数なし）

- `bash test/run_tests.sh` → **PASS=253 FAIL=0 WARN=0**（ベース252・#881 pin 37/0 無退行）
- `bash test/run_e2e.sh` → **13/13 スイート PASS**
- #887 静的 pin → **87/0**（変異**36本**・6段）／ 新 e2e → **51/0** ／ 動的変異チェック → **42/0**
- **ボタン行が隠れる13セル**（キーボード300px × 375×440 ＝ 可視域140px）は**幾何的に不可能**
  （スロット78.5＋間隔16＋ボタン44＋padding48 = 186.5px > 140px）。スロット自体は 78/78 で見える。
  受入基準は「スロットが完全に見える」・ボタン行は best-effort（この限界は e2e [C4] が現状を pin）

### 実機で確かめてほしいこと（作者）

1. **iPhone 実機**で、キーボードが出た状態で保存 → エラーが読めること（visualViewport 追従は実機でしか最終確認できない）
2. **VoiceOver** で読み上げられること（`role="alert"` の announce は AT 依存）
3. **macOS bash 3.2 / BSD grep** で `bash test/test_bulk_inline_error_pins_887.sh` が通ること
