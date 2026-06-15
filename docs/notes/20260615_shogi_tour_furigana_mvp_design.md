# 参加者ふりがな対応 MVP 設計メモ — SHOGI-TOUR-FURIGANA-DESIGN-001

- 作成日: 2026-06-15
- 対象: `shogi_v4.html`（沼津支部 月例将棋大会 運営ツール）
- 種別: **MVP 設計メモ（docs-only）**。本ファイル自体はコードを変更しない。次 PR の実装根拠。
- 例示データは**完全架空のみ**（実名・実データ・PII は一切含めない）。
- 関連:
  - `docs/notes/20260614_shogi_tour_post_event_requests_design.md` **§A（ふりがな ruby 表示 恒久対応）**
    ← 本メモはこの恒久設計の「最小スライス（次 PR で実装できる分だけ）」。
  - `docs/specs/20260508_0857_phase1_city_field_spec.md`（マスタへ任意フィールドを足す前例＝`city`）
  - 既存 yomi 基盤（`normalizeYomi` / `master.yomi` / `_pendingNewYomi` / 過去参加者パネル）

---

## 0. このメモの位置づけ（何で、何でないか）

恒久設計（§A）は **`participantMasterId` 紐づけ + `kanaSnapshot` + 共通 ruby helper + 6 画面展開**と広い。
本メモはそれを実装する前段として、**「次 PR 1 本で出せる最小スライス」だけ**を切り出す。
理想形（identity 移行・大会履歴 DB 化・全画面 ruby）は §A/§B/§C を正本とし、本メモでは扱わない。

**最重要の現状認識: ふりがな基盤は既に相当部分が実装済み。** MVP は「ゼロから作る」ではなく、
**当日 `player` に snapshot を 1 フィールド足し、既存の受付入力からそこへ取り込み、1 画面で見せる**だけ。

---

## 1. 現状インベントリ（実装済み / 欠けている）

read-only 調査（2026-06-15, `shogi_v4.html` 8328 行）に基づく現状。これが設計の土台。

| 領域 | 現状 | 代表箇所 |
|------|------|----------|
| マスタ `members[].yomi` | **正式項目として存在**。`normalizeYomi` / `getYomiInitialRow` / `isNoYomiMember` | `normalizeBranchMaster` 周辺 |
| 過去参加者パネル | **漢字 + ふりがな検索**・あかさたなタブ・「ふりがな未入力」フィルタ済み | `matchesPastParticipantQuery`（〜2290 付近） |
| 受付フォーム ふりがな欄 | **既に配置済み**（`id="inp-yomi"`、placeholder「ふりがな」、ヒント「自動入力されない場合は手入力してください」） | line 209 |
| ふりがな自動入力 | サジェスト選択時に `master.yomi` から `inp-yomi` へ自動入力 | `onSuggestTap`（line 4545 付近） |
| 当日 `player`（`state.players[cls][]`） | **`yomi` フィールドなし**。フィールドは `{id,name,cls,member,grade,(member_id),entry_no}` | `addPlayer`(4627) / `addPlayerFromMaster`(2110) / `normalizeState`(730) |
| 受付 ふりがな欄の保存先 | **`player` には保存しない**（明示コメント「ふりがな欄の値は DOM のみで保持。player.yomi には保存しない」= A-4 §3.1.4）。代わりにマスタへ：サジェスト選択かつ `master.yomi` 空なら補完 / 新規は `_pendingNewYomi[id]`（RAM）→ `saveData` 時にマスタ反映 | line 4586 / 4637-4654 / 6881 |
| 順位表（`printResults`） | **氏名のみ**（ふりがな非表示） | line 7164 |
| PDF / 報告書（`downloadReport`） | **氏名のみ** | line 7437 |
| スマホ星取表 / 閲覧ビュー | **氏名のみ** | LIVE-MOBILE-SCOREBOARD-001 |
| マスタ一覧（`buildMasterTabHtml`） | ふりがな列は **2026-05-08 に意図削除済み**。未入力数サマリー（「うちふりがな未入力: N 名」）+ F7 編集モーダルで運用 | line 2891-2893 |

**ギャップ（= MVP の主眼）:** 当日 `player` にふりがなが乗っていないため、
**当日 state 単体（順位表 / PDF / スマホ星取表 / 閲覧ビュー）でふりがなを出せない**。
受付欄の値はマスタ整備のためだけに流れ、当日参加者レコードには残らない。

---

## 2. MVP スコープ（一言で）

当日 `player` に **ふりがな snapshot を 1 フィールド追加**し、受付の既存 `inp-yomi`
（＋サジェスト / マスタからの 1 タップ追加）からそこへ取り込む。
表示は **受付一覧（参加者一覧）の 1 画面だけ**に ruby を出す。
順位表 / PDF / 星取表 / 対局管理 への ruby 展開は §A-5 の後続スライスに送る。

---

## 3. 検討項目への回答（8 項目）

### 3.1 player に追加する項目名

- **`yomi`（string）を推奨。**
- 理由: 既存コードが端から端まで `yomi` 語彙（`normalizeYomi` / `master.yomi` / `_pendingNewYomi` /
  `inp-yomi` / `getYomiInitialRow` / `isNoYomiMember` / 過去参加者検索）。`player.yomi` にすれば
  「受付入力 → 正規化 →（必要なら）マスタ → 当日 player」まで**同名フィールドで一貫**し、新語彙ゼロ。
- 恒久設計 §A は `kanaSnapshot`（マスタ正本 `kana` のスナップショット）と命名。
  **MVP の `player.yomi` は §A の `kanaSnapshot` の役割を満たす「当日スナップショット」**である。
  `yomi → kanaSnapshot` 改名は、`participantMasterId` 移行を伴う §C（大会履歴 DB 化）が
  **どのみち必要とするマイグレーションに畳み込む**。MVP 単独では改名しない
  （既存 yomi 基盤との二重語彙・過剰実装を避ける）。
- 正規化: 保存前に既存 `normalizeYomi()` を通す（前後 + 途中空白除去）。空・null・undefined は `''`。
- **要レビュー（命名・本メモ唯一の判断点）:** 「既存 `yomi` 一貫」を採るか「§A `kanaSnapshot` 先取り」を
  採るか。本メモは前者（`yomi`）を推奨（理由は上記）。レビュアー判断でここだけ覆る可能性あり。

### 3.2 既存保存データとの互換性

- 当日 state には `schema_version` が無い（マスタのみ `schema_version=1`）。
  `city` 前例 §8.1 に倣い **`schema_version` は新設しない**（読込時補完のみ／過剰実装防止）。
- **下位互換（旧 → 新）:** `normalizeState` の `players.map`（line 730 付近）で
  `yomi` 欠落時 `''` を既定補完。`member_id` / `entry_no` と同じ「任意フィールド追加」パターン。
  旧 state（yomi 不在）は `yomi:''` ＝ルビなしで読める。
  **順位計算 / 対局結果入力 / 保存読込ロジックには一切触れない。**
- **上位互換（新 → 旧）:** 旧コードが `yomi` 付き JSON を読んでも、`normalizeState` は
  明示列挙コピーのため**未知キーは単に落ちる**（city と同じ＝壊れない）。
  実装時に既存 import/restore 経路で「unknown field を無視して壊れない」ことを読み取り確認（city §4 と同じ確認主体）。
- **ラウンドトリップ:** `save()` は `JSON.stringify(state)`。`player.yomi` は state の一部として round-trip する。
  RAM 専用の `_pendingNewYomi` とは別物（こちらは従来どおり save 時にマスタへ反映）。

### 3.3 未入力時の扱い

- 既定値 `''`（空文字を**有効値**とする任意項目。エラーにしない）。
- 表示: ふりがな空 → **氏名のみ**（`<ruby>` を使わず、**空 `<rt>` を出さない**）。§A-1-4 準拠。
- `normalizeYomi('')==''`、`normalizeYomi(null/undefined)==''`（既存関数が型ガード済み）。

### 3.4 参加者入力フォームでの配置

- **配置は既に済んでいる。** 受付フォームに `inp-yomi` 欄が存在（line 209、placeholder「ふりがな」、
  ヒント「自動入力されない場合は手入力してください」）。**フォームのレイアウト変更は不要。**
- MVP の変更は「**保存配線**」だけ（2 箇所）:
  1. `addPlayer()`（手入力 / サジェスト経路, line 4576）:
     `newPlayer.yomi = normalizeYomi(inp-yomi 値)`。サジェスト選択かつ入力欄が空なら
     `normalizeYomi(suggestSelected.yomi)` でフォールバック。
     **既存のマスタ反映（`_pendingNewYomi` / サジェスト時 `master.yomi` 補完）は残す**
     （当日 snapshot と cross-大会マスタ整備は別目的・両立）。
  2. `addPlayerFromMaster()`（過去参加者パネルからの 1 タップ追加, line 2110）:
     player オブジェクトに `yomi: normalizeYomi(member.yomi||'')` を追加。
- **line 4586 の既存コメント「player.yomi には保存しない（A-4 §3.1.4）」は本 MVP で意図的に方針反転する。**
  実装時にコメントも更新し、レビュアーが矛盾で混乱しないようにする
  （A-4 当時は yomi の用途がマスタ構築のみで「当日表示」が無かった＝保存不要だった。
  今回「当日表示 / snapshot」目的が加わるため保存する）。
- 一括編集（`bulkEdit`）でのふりがな編集は **MVP 対象外**（氏名のみ）。後続。

### 3.5 検索対象に含めるか

- **MVP は当日 player のふりがな検索を追加しない。**
- 理由: そもそも**当日 player を対象とする検索 UI が存在しない**（検索は過去参加者パネル＝マスタ対象のみ）。
  マスタ側は既に漢字 + ふりがな検索済み（`matchesPastParticipantQuery`, line 2290）。
  当日 player 検索の新設は別要望・別スコープ。
- 受付の `inp-name` サジェストは従来どおりマスタ（`findMasterSuggestions`）対象で、ふりがな自動入力も
  マスタ由来。ここは変更なし。

### 3.6 順位表 / PDF / 参加者マスタ一覧に表示するか

恒久設計 §A-5 は 6 画面（参加者一覧 / 対局管理 / 順位表 / スマホ星取表 / PDF / 報告書）に
共通 ruby helper で展開する。MVP は**全部はやらない**。

| 画面 | MVP | 後続 | 理由 / 備考 |
|------|:---:|:---:|------|
| **受付一覧（参加者一覧 `renderRegList`）** | ✅ ruby 表示 | — | DOM helper を実証する唯一の地点。textContent 経由で XSS / print CSS の難所を回避 |
| 順位表（`printResults`） | ❌ | §A-5 | mobile / desktop / 印刷の 3 呼出箇所。escape 済み文字列版 helper が要る |
| PDF / 報告書（`downloadReport`） | ❌ | §A-5 | 印刷 CSS でルビ潰れ調整・文字列版 helper 必要でリスク高（直近の PDF タイトル/FAX 対応も print 経路は敏感） |
| スマホ星取表 / 閲覧ビュー | ❌ | §A-5 | `rt` の行高詰め（§A-4）が要る |
| 対局管理 `winner-btn` | ❌ | §A-5 | ボタン内 ruby は折返し検討要 |
| 参加者マスタ一覧（`buildMasterTabHtml`） | ❌（現状維持） | §B | ふりがな列は 2026-05-08 に意図削除済み。未入力数サマリー + F7 編集で運用。MVP で列を復活させない |

- MVP の表示は **受付一覧 1 画面のみ**。新設する **DOM API 版 `renderPlayerNameWithRuby(name, yomi)`**
  （§A-3、`createElement('ruby'/'rt')`、空 yomi なら氏名のみ、textContent 経由で自動 escape）を
  受付リストの氏名表示に適用する。
- **補足（土台としての価値）:** 「当日 player.yomi を持つ」こと自体が、後続スライスで上記すべてを
  **マスタ往復なしに当日 state 単体で** ruby 表示可能にする。特に閲覧ビュー / スマホ星取表は
  当日 state しか読まないため、`player.yomi` が無いと構造上ふりがなを出せない。

### 3.7 同姓同名対応との関係

- 現状の同名検出（当日登録時）:
  - `addPlayer`（手入力）line 4590: 氏名文字列の完全一致を一律ブロック（「同じ名前の参加者がいます」）。
  - `addPlayerFromMaster`（マスタ追加）line 2089-2108: `member_id` 一致 → `duplicate_member`。
    `normalizePersonName` 同名かつ `member_id` 不一致 → `duplicate_name`（同名別人の自動許容をしない安全側）。
  - **いずれも yomi を判定に使っていない。**
- MVP との関係:
  - **MVP はふりがなを「表示 / snapshot 専用」とし、同名検出ロジックは一切変更しない**
    （`member_id` + 氏名文字列ベースのまま）。
  - ふりがなは「人間が同名を見分ける」可読性に寄与する（例: 架空の「田中」が 2 名いるとき読みで区別）。
    が、当日ロジックの**同一性判定には使わない**。
  - 恒久設計 §A-1-1「氏名文字列で突き合わせない・`participantMasterId` で紐づける」が同名別人の
    根本対応だが、それは §C の identity 移行スコープ。MVP は触れない。
  - **正直な限界:** 当日 roster は既に同名文字列を弾く（`addPlayer` line 4590）ため、
    実在で全く同じ氏名の別人 2 名は**現状でも両方登録できない**。これは pre-existing 制約であり、
    **ふりがな表示だけでは解決しない**（解決には §A の `participantMasterId` 化が必要）。
    MVP はこの限界を変えない＝悪化もさせない。

### 3.8 MVP でやること / やらないこと

**DO（次 PR）:**
- `player.yomi`（string）追加。`normalizeYomi` で正規化。
- `normalizeState` で `yomi` 欠落 → `''` 既定補完（下位互換）。
- `addPlayer` / `addPlayerFromMaster` の 2 箇所で `player.yomi` を取り込む配線。既存マスタ反映は維持。
- DOM API 版 `renderPlayerNameWithRuby(name, yomi)` helper 新設（空 yomi → 氏名のみ・XSS 安全）。
- 受付一覧（`renderRegList`）1 画面に ruby 適用。
- line 4586 コメントの方針更新（A-4 §3.1.4 反転の明示）。
- 受け入れテスト（架空データのみ）: 取り込み / 空補完 / round-trip / 旧データ読込 / 受付一覧 ruby / 空時氏名のみ。

**DON'T（後続 / 別スコープ）:**
- `participantMasterId` への identity 移行（§A-2 / §C）。
- `yomi → kana/kanaSnapshot` 改名（§C マイグレーションに畳む）。
- 順位表 / PDF / 報告書 / スマホ星取表 / 対局管理 への ruby 展開（§A-5）。
- escape 済み文字列版 ruby helper（PDF / innerHTML 経路, §A-3 併設版）。
- 参加者マスタ スプレッドシート編集（§B）/ マスタ一覧へのふりがな列復活。
- 大会履歴 DB 化（§C）。
- 当日 player のふりがな検索 UI。
- 一括編集でのふりがな編集。
- `schema_version` 新設 / CSV import・export。

---

## 4. データモデル（最小差分）

当日 `player`（追加は **1 フィールドのみ**、既存を破壊しない）:

```jsonc
{
  "id": "p...",
  "name": "架空 太郎",
  "cls": "A",
  "member": "member",
  "grade": "ippan",
  "member_id": "m...",        // 既存・任意（マスタ紐づけ）
  "entry_no": 1,
  "yomi": "きゃくう たろう"    // ← 追加。normalizeYomi 済み。既定 ''（= ルビなし表示）
}
```

- マスタ `members[].yomi` は既存のまま**正本として温存**。当日 `player.yomi` はその**当日スナップショット**
  （登録時点コピー）。マスタを後日修正しても、登録済みの当日 player は遡って変わらない（§A-1-3 と同趣旨）。
- §A の対応関係: MVP では `master.yomi`（既存）が §A `kana`（正本）相当、`player.yomi` が
  §A `kanaSnapshot`（大会記録）相当。

---

## 5. 取り込みタイミングと流れ（実装ガイド）

```
受付フォーム inp-yomi ─┐
（手入力 / 自動入力）   │  addPlayer():
                       ├─▶ newPlayer.yomi = normalizeYomi(inp-yomi)         … ★MVP 追加（当日 snapshot）
                       │   （空欄 & サジェスト時は master.yomi をフォールバック）
                       └─▶ 既存: _pendingNewYomi[id] / master.yomi 補完      … 据え置き（cross-大会マスタ整備）

過去参加者パネル ──────▶ addPlayerFromMaster():
（1 タップ追加）          player.yomi = normalizeYomi(member.yomi)            … ★MVP 追加

保存: save() = JSON.stringify(state)  →  player.yomi も round-trip
読込: normalizeState()  →  yomi 欠落は '' 補完（下位互換）
表示: renderRegList()  →  renderPlayerNameWithRuby(name, yomi)（空なら氏名のみ）  … ★MVP 追加（1 画面）
```

- マスタ → player は「**登録時コピー**」（save 時同期の `_pendingNewYomi` とは独立。player は登録時に即値を持つ）。
- 既存のマスタ反映（`_pendingNewYomi` / サジェスト backfill）は**据え置き**（回帰させない）。

---

## 6. 受け入れ条件（架空データ・Gate 観点）

1. 受付で「架空 太郎／きゃくう たろう」を手入力 → 追加 → 受付一覧に**氏名の上にルビ**表示。
   reload 後も保持（`player.yomi` が round-trip）。
2. ふりがな空で追加 → 受付一覧は**氏名のみ**（`<ruby>` 無し・空 `<rt>` 無し）。
3. 旧 state（`yomi` 不在 JSON）読込 → `yomi=''` で読め、順位 / 対局 / 保存に影響なし。
4. サジェスト選択（`master.yomi` あり）→ `inp-yomi` 自動入力 → `player.yomi` に入る。
   入力欄が空でも `master.yomi` からフォールバックされる。
5. `addPlayerFromMaster`（パネル追加）→ `player.yomi = master.yomi`。
6. 既存のマスタ反映（新規 → `_pendingNewYomi` → save でマスタ）が従来どおり動く（**回帰なし**）。
7. 既存テスト緑維持（`bash test/run_tests.sh shogi_v4.html`）。

---

## 7. リスク / 留意

- **A-4 §3.1.4「player.yomi 非保存」方針の反転** → 当該コメント更新必須、レビュアーへ明示。
- `normalizeState` は**明示列挙コピー**＝`yomi` を足し忘れると round-trip で消える（実装時の最注意点）。
- ruby の行高: 受付一覧では問題になりにくいが、後続の星取表 / 対局管理では §A-4 の `line-height` 詰めが要る。
- XSS: helper は textContent / escape 経由（§A-3）。氏名・ふりがなを innerHTML 直挿ししない。
- 判断が要るのは**命名（`yomi` vs `kanaSnapshot`）の 1 点のみ**（§3.1）。他は既存パターン踏襲で確定。

---

## 8. 後続スライス順（参考）

1. **（本 MVP）** `player.yomi` + 受付一覧 ruby。
2. 閲覧ビュー / スマホ星取表 ruby（当日 state 単体で出せる＝`player.yomi` が効く最初の高価値地点）。
3. 順位表 ruby（文字列版 helper）。
4. PDF / 報告書 ruby（print CSS）。
5. §A `participantMasterId` 化 + `kanaSnapshot` 改名（§C と一緒に）。
6. §B マスタ スプレッドシート編集。

---

## 9. レビュー深度

- 本メモ: MVP 設計メモ（docs-only）。実装は別 PR。
- 実装後: Codex Gate（P0: 保存読込 / データ破壊 / 既存挙動破壊 + round-trip + 旧データ互換の観点）。
