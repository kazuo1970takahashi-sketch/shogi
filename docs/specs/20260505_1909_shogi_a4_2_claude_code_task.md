# Phase A-4.2 Claude Code 実装依頼書

**作成日時**: 2026-05-05 19:09 JST
**対象**: shogi リポジトリ（kazuo1970takahashi-sketch/shogi）
**作業ブランチ**: `feat/phase-a4-2-class-buttons`（main から派生して新規作成）
**前提**: ChatGPT メタレビュー再判定 A / Go（Must Fix なし）

---

## 0. 設計仕様書（必読）

実装に着手する前に、以下のファイルを必ず読んでください。

- `docs/specs/20260505_1904_shogi_design_phaseA4_2_v2.md`（A-4.2 設計仕様書 v2）

特に以下のセクションを精読してください：
- §1 スコープ
- §3 機能仕様（特に §3.2.2-3 サジェスト併用方式、§3.3 addPlayerFromMaster）
- §7 実装禁止事項（21項目）
- §8 完結条件

---

## 1. 作業開始前確認事項

実装着手前に、以下の5項目を提示してユーザー承認を得てください。

1. **作業ブランチ**: `feat/phase-a4-2-class-buttons` を main から新規作成
2. **作業内容**: A-4.2 を Stage 1〜5 で順次実装、各Stage完了時に報告
3. **PR 戦略**: 全Stage完了後にまとめて PR 作成
4. **触らないファイル**: 既存の docs/specs/（A-1〜A-4.1関連）、test/run_tests.sh 構造、既存テストの内容
5. **絶対遵守**: §7 実装禁止事項 21項目（特に重要：サジェスト行本体タップ→フォーム反映を**完全削除しない**、重複チェックは **member_id 優先**、addPlayerFromMaster 内で master を**一切変更しない**）

---

## 2. Stage 構成

| Stage | 内容 |
|-------|------|
| 1 | 純粋関数 `addPlayerFromMaster` の追加と単体テスト（duplicate_member 含む 17件） |
| 2 | 過去参加者パネルの A/B ボタン UI と動作（行本体タップ無効化、ヒントテキスト追加） |
| 3 | サジェストリストの A/B ボタン UI（**行本体タップは維持**、stopPropagation） |
| 4 | last_class 強調表示と「前回:Xクラス」表記 |
| 5 | 全体テスト・mobile-430 横スクロール確認・PR |

各Stage完了時に：
- 単体テスト + e2e テスト全件緑を確認
- commit + push
- 報告（変更ファイル / 追加テスト数 / 残課題）
- 次Stage進行確認

---

## 3. ChatGPT v2 メタレビュー Should Fix 反映（実装時に守ること）

### Should Fix 1: duplicate_member / duplicate_name のUI文言を分ける

UI 表示メッセージ：

| エラー | UI メッセージ |
|-------|-------------|
| `duplicate_member` | この参加者はすでに登録されています |
| `duplicate_name` | 同じ名前の参加者がいます。別人の場合は手入力で区別してください |

`addPlayerFromMaster` の戻り値 error コードを UI 側で分岐し、それぞれの文言を `showMsg` で表示。

### Should Fix 2: same_name_different_member_id は安全側で duplicate_name

仕様書 §3.3.3 の処理フロー 4 で、`p.member_id` が**ある**けれど `p.member_id !== memberId` で、かつ normalizePersonName 後の同名 player があった場合、安全側で `duplicate_name` として止める。

- 同名別人を追加したい場合は、ユーザーが手入力で識別可能な名前にする運用
- A-4.2 では同名別人を自動で許容しない（誤登録防止優先）

これを単体テスト `A4-2-S1-add-14`（same_name_different_member_id）でカバー。

### Should Fix 3: A/B 直接追加成功後のサジェストリスト動作

サジェストの A/B ボタンで直接追加に成功した場合：

1. 氏名欄・ふりがな欄をクリア（既存 addPlayer 成功時と同じ）
2. **サジェストリストを閉じる**（`closeSuggestList()` を呼ぶ）
3. 追加した player の member_id は次回サジェスト候補から除外される（既存の `getCurrentlyRegisteredMemberIds` 経由で自動的に除外されるはず、A-3 既存挙動）

過去参加者パネルでも A/B ボタン成功後は同様：
1. renderRegList を呼ぶ
2. renderPastParticipantsPanel を呼んで該当行を再描画（追加済みは候補から外れる）

---

## 4. 実装時の重要遵守事項（絶対）

### addPlayerFromMaster シグネチャ厳守
- **採用**: `addPlayerFromMaster(memberId, cls, master, state)` のみ
- **tournamentMeta は受け取らない**
- 関数内で `save()` / `renderRegList()` を呼ばない
- 関数内で `master.yomi` / `master.last_class` / `master.attendance_count` / `master.last_attended` / `master.tournament_ids` を**一切変更しない**
- `_pendingNewYomi` を触らない

### 重複チェック
- **member_id 優先**：同一 member_id が state.players.A/B に存在 → `duplicate_member`
- **member_id 不一致 or なし**：normalizePersonName 後の同名 → `duplicate_name`
- name のみで重複チェックを完結させない

### サジェストリスト（最重要）
- **行本体タップ → フォーム反映の既存挙動を維持**（A-4 の yomi 確認・修正導線を保護）
- A/B ボタン押下時：
  - `event.preventDefault()` + `event.stopPropagation()` を呼ぶ
  - 行本体タップが二重発火しないこと
  - addPlayerFromMaster 経由で直接追加
  - 氏名欄・ふりがな欄クリア + サジェストリストを閉じる
  - master.yomi を変更しない

### 過去参加者パネル
- **行本体タップを無効化**（`cursor: default`、hover 効果なし）
- A/B ボタンのみが追加経路
- 「追加先を選択」ヒントテキスト表示
- A/B ボタンに `aria-label` / `title` 付与

### last_class
- A/B ボタン押下時に **更新しない**
- last_class は大会保存・マスタ同期時に player.cls をもとに更新（既存 `updateBranchMasterFromTournament` の責務）
- 強調表示は画面表示時点の `master.last_class` を参照するだけ
- 「前回:Aクラス」「前回:Bクラス」テキストを必ず併記

### スマホ対応
- A/B ボタンは min 44px × 44px
- ボタン間隔 min 8px
- mobile-430 で横スクロールが発生しない（1px 許容）
- 長い氏名・長い yomi で見切れない

### 新規追加禁止
- マスタに「主クラス（regular_class）」フィールド追加禁止
- マスタ編集モーダルにクラス編集 UI 追加禁止
- player.yomi 追加禁止（A-4 既存ルール継承）
- schema_version 変更禁止
- 既存 addPlayer の大規模リファクタリング禁止（新規関数追加のみ）

### A-4 / A-3 連携保護
- A-4 のふりがな入力欄・IME自動取得・サジェスト yomi 同期を破壊しない
- A-3 のサジェスト・member_id 連携・F8 仕様を破壊しない

---

## 5. 各Stageのテスト追加方針

### Stage 1（addPlayerFromMaster 単体）

`test/test_branch_master.js` に以下 17 件を追加：

| ID | 内容 |
|----|------|
| A4-2-S1-add-01 | A クラスに正常追加 |
| A4-2-S1-add-02 | B クラスに正常追加 |
| A4-2-S1-add-03 | last_class='A' の member を B に追加 → success |
| A4-2-S1-add-04 | invalid_class（'C'）→ error='invalid_class' |
| A4-2-S1-add-05 | invalid_master（null）→ error='invalid_master' |
| A4-2-S1-add-06 | invalid_state（null）→ error='invalid_state' |
| A4-2-S1-add-07 | not_found → error='not_found' |
| A4-2-S1-add-08 | deleted member → error='deleted' |
| **A4-2-S1-add-09** | **duplicate_member**（同一 member_id 二重） |
| A4-2-S1-add-10 | member.member='other', grade='chu' → player にコピー |
| A4-2-S1-add-11 | member.member 不在 → player.member='member'（既定） |
| A4-2-S1-add-12 | player.member_id=member.id でリンク |
| **A4-2-S1-add-13** | **duplicate_name_normalized**（member_id なし同名） |
| **A4-2-S1-add-14** | **same_name_different_member_id**（安全側で duplicate_name） |
| **A4-2-S1-add-15** | **last_class が変更されない**（master 不変） |
| **A4-2-S1-add-16** | **attendance_count / last_attended / tournament_ids が変更されない**（master 不変） |
| A4-2-S1-add-17 | invalid_id（空文字 / null）→ error='invalid_id' |

`test/test_branch_master.js` の env exports に `addPlayerFromMaster` を追加。

### Stage 2（過去参加者パネル e2e）

`test/e2e/shogi_app_a4_2.spec.js` 新規作成、以下を追加：

1. 各行に A/B ボタン両方が表示される
2. last_class='A' で A ボタン強調
3. last_class='B' で B ボタン強調
4. A ボタン → state.players.A に追加
5. B ボタン → state.players.B に追加
6. last_class と異なるクラスへの追加が成功
7. 既追加 player（同 member_id）を別クラスのボタンで追加 → duplicate_member エラー、UI文言「この参加者はすでに登録されています」
8. 削除済み member の行は表示されない
9. **行本体タップで何も起こらない**（フォーム反映しない）
10. **「追加先を選択」ヒントテキスト**が表示される
11. **A/B ボタンに aria-label / title** が付いている

### Stage 3（サジェストリスト e2e）

1. 各候補行に A/B ボタン両方が表示される
2. **行本体タップでフォーム反映が残る**（A-4 既存挙動維持）
3. **A ボタン押下で行本体タップが二重発火しない**
4. **B ボタン押下で行本体タップが二重発火しない**
5. A/B ボタン → state.players に追加 + 氏名欄・ふりがな欄クリア + **サジェストリストが閉じる**
6. A/B ボタン押下後、`_pendingNewYomi` に値が増えない
7. **A/B ボタン経由で master.yomi が変更されない**
8. last_class 強調表示
9. 行本体タップでフォーム反映 → 手動修正 → 「追加」ボタン → master.yomi 空のときのみ補完（A-4 回帰確認）

### Stage 4（last_class 表示 e2e）

1. 「前回:Aクラス」「前回:Bクラス」文言が出る
2. last_class=null は文言なし、両ボタン通常表示
3. **A/B ボタン押下時に master.last_class が即時変更されない**
4. **次回 saveData 後、master.last_class が今回 player.cls に更新される**

### Stage 5（全体）

1. **mobile-430 で過去参加者パネル・サジェストの A/B ボタンが見切れない**
2. **横スクロール 1px 許容**（A-4 §3.6.4 と同方式）
3. **長い氏名（10〜15文字）・長い yomi で A/B ボタンが押せる**
4. duplicate_member / duplicate_name の UI 文言が分かれている
5. 全テスト緑（npm test + npx playwright test）

---

## 6. 完了報告フォーマット（各Stage）

```
## Stage X 完了報告

### Commit / Push
- commit: <hash> <メッセージ>
- push: ✅ feat/phase-a4-2-class-buttons

### 変更
- shogi_v4.html (+N / -M)
- test/test_branch_master.js (+N)
- test/e2e/shogi_app_a4_2.spec.js (+N)

### 実装内容
（仕様書 v2 のどの節を実装したか、具体的に）

### テスト結果
- 単体: PASS=X / FAIL=0
- e2e: X passed / 0 failed
- 既存テストへの影響なし（604+182件全件緑）

### 留意事項
（実機確認推奨項目、Should Fix 反映状況）

### 次Stage進行確認
Stage X+1（XXX）への進行確認をお願いします。
```

---

## 7. 最終 PR メッセージ案

```
## Summary
Phase A-4.2 実装：過去参加者パネル/サジェストにA/Bクラスボタン追加

## Stages
- Stage 1: addPlayerFromMaster 純粋関数 + 単体テスト17件（duplicate_member 含む）
- Stage 2: 過去参加者パネル A/B ボタン（行本体タップ無効、ヒントテキスト、aria-label）
- Stage 3: サジェストリスト A/B ボタン（行本体タップは維持、stopPropagation 併用方式）
- Stage 4: last_class 強調表示 + 「前回:Xクラス」併記
- Stage 5: 全体テスト・mobile-430 横スクロール確認

## Reviews
- ChatGPT v2 メタレビュー: A / Go（Must Fix なし、Should Fix 3件は実装に反映済み）
- Codex レビュー予定

## Test
- 単体: 604 + 17 件 / FAIL 0
- e2e: 182 + 約20件 / FAIL 0
- 既存 A-4 機能（604+182件）緑維持
- iPhone Safari 実機確認: 別途報告

## 設計遵守
- player.yomi 追加なし
- schema_version 変更なし
- regular_class 追加なし
- マスタ編集モーダルにクラス編集UIなし
- addPlayerFromMaster 内で master 一切変更なし（last_class / yomi / attendance_count 等）
- 重複チェックは member_id 優先（duplicate_member / duplicate_name 分離）
- サジェスト行本体タップ→フォーム反映 維持（A-4 互換）
- A-4 / A-3 機能（ふりがな / サジェスト / F8）破壊なし
```

---

それでは Stage 1 から着手してください。
最初に §1 作業開始前確認事項 5項目を提示し、ユーザー承認を待ってから Stage 1 を開始してください。
