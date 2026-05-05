# Phase A-4 Claude Code 実装依頼書

**作成日時**: 2026-05-05 17:52 JST
**対象**: shogi リポジトリ（kazuo1970takahashi-sketch/shogi）
**作業ブランチ**: `feat/phase-a4-master-mgmt`（main から派生して新規作成）
**前提**: ChatGPT メタレビュー再判定 A / Go（Must Fix なし）

---

## 0. 設計仕様書（必読）

実装に着手する前に、以下のファイルを必ず読んでください。

- `docs/specs/20260505_1746_shogi_design_phaseA4_v2.md`（A-4 設計仕様書 v2）

特に以下のセクションを精読してください：
- §1 スコープ・設計思想
- §3 機能仕様（特に §3.1.2 IME自動取得ロジック、§3.3.2 シグネチャ）
- §7 実装禁止事項（17項目）
- §8 完結条件

---

## 1. 作業開始前確認事項

実装着手前に、以下の5項目を提示してユーザー承認を得てください。

1. **作業ブランチ**: `feat/phase-a4-master-mgmt` を main から新規作成
2. **作業内容**: A-4 を Stage 1〜7 で順次実装、各Stage完了時に報告
3. **PR 戦略**: 全Stage完了後にまとめて PR 作成。Stage 6（レイアウト揺れ）が大規模化したら A-4.1 として別PR化
4. **触らないファイル**: 既存の `docs/specs/`（A-1〜A-3関連）、`test/run_tests.sh` 構造、既存テストの内容
5. **絶対遵守**: §7 実装禁止事項 17項目（特に schema_version 変更禁止、player.yomi 非追加、applyMasterMemberEdit シグネチャ）

---

## 2. Stage 構成

| Stage | 内容 | 中止条件 |
|-------|------|---------|
| 1 | 登録画面ふりがな入力欄追加（UIのみ、自動取得なし） | — |
| 2 | IME自動取得ロジック実装 | iPhone Safari実機でCompositionEventが安定しない場合は補助扱いに下げる |
| 3 | マスタ一覧 + 編集モーダルに member/grade 表示・編集 | — |
| 4 | 削除済みmember復元UI（純粋関数 + UIトグル） | — |
| 5 | ふりがな未入力可視化（サマリー + バッジ + フィルタ） | — |
| 6 | スマホレイアウト揺れ修正 | 原因不特定 or 全体CSSへ大きな波及 → A-4.1 として別PR化 |
| 7 | 全体テスト・PR | — |

各Stage完了時に：
- 単体テスト + e2e テスト全件緑を確認
- commit + push
- 報告（変更ファイル / 追加テスト数 / 残課題）
- 次Stage進行確認

---

## 3. ChatGPT メタレビュー反映 Should Fix（実装時に守ること）

### Should Fix 1: `_pendingNewYomi` のキー衝突回避

仕様書 §3.1.4 では `_pendingNewYomi[normalizeName(name)]` を例示していますが、同名参加者で衝突します。

**実装方針**：
- **推奨**：addPlayer 時に生成される `player.id` をキーにする。`_pendingNewYomi[player.id] = yomi欄の値` の形式。
- player.yomi は追加しない方針は維持
- updateBranchMasterFromTournament では player.id ベースで yomiMap を引く

### Should Fix 2: サジェスト由来 yomi の更新条件を安全側に

仕様書 §3.1.4 では「既存マスタ yomi と異なれば更新」となっていますが、誤編集で正しい yomi を上書きするリスクがあります。

**実装方針**：
- 既存 master.yomi が **空** の場合のみ、yomi 欄の値で自動補完する
- 既存 master.yomi が **空でない** 場合は自動上書きしない（マスタ編集画面で明示的に修正）
- 例外：サジェスト選択後にユーザーが yomi 欄を直接編集した場合（`_yomiManuallyEdited === true`）も自動上書きしない

### Should Fix 3: CompositionEvent の e2e 代替テスト方針

iPhone Safari の IME を Playwright で完全再現するのは困難です。

**実装方針**：
- Playwright での標準的な keyboard 入力テストでカバーできる範囲を最大化
- 完全再現が難しい場合は **synthetic CompositionEvent を dispatch** するテストで代替
- それでも検証困難な場合は **iPhone Safari 実機確認を A-4 完了条件**として残し、Playwright のみで完了判定しない
- Playwright で再現不能なことを理由に、ふりがな機能全体の実装をブロックしない

---

## 4. 実装時の重要遵守事項（絶対）

### 設計思想
- IME自動取得は **補助機能**。100%自動入力を保証しない
- 手動入力欄を **主機能** として維持する
- ふりがな未入力者を登録不可にしない

### データ構造
- **player.yomi は追加しない**（一時的にも追加しない）
- schema_version は変更しない（branch master は 1、state は 4）
- 新規スキーマフィールドを追加しない

### applyMasterMemberEdit シグネチャ（厳守）
- **採用シグネチャ**：`applyMasterMemberEdit(memberId, newName, newYomi, master, options)` **のみ**
- 旧案 `applyMasterMemberEdit(memberId, newName, newYomi, newMember, newGrade, master)` は **採用しない**
- 第4引数 master の位置を変更しない
- 新関数（applyMasterMemberEditV2 等）は作らない
- options 省略時は既存挙動を完全維持（A3-S2-edit-01〜29 既存テストを破壊しない）

### 復元UI
- 物理削除を実装しない
- 復元時に member_id を変更しない

### レイアウト揺れ修正（Stage 6）
- 原因未特定のまま `overflow-x: hidden` だけで隠さない
- 原因未特定のまま全体CSSを推測で大きく書き換えない
- 影響範囲が大きい場合は A-4.1 として別PR化する

### A-3 連携保護
- A-3 のサジェスト・member_id 連携を破壊しない
- A-3 の F8 branch master インポート仕様を変更しない

---

## 5. 各Stageのテスト追加方針

### Stage 1（ふりがな入力欄UIのみ）
- e2e: ふりがな入力欄が表示される、手動入力した値が保存される

### Stage 2（IME自動取得）
- 単体: `_pendingNewYomi` の同名衝突回避（player.id キー方式）
- e2e: 
  - 氏名を IME 入力で確定するとふりがな欄に追記される
  - 苗字・名前を別々に変換した場合の累積
  - ふりがな欄を手動編集した後、IME イベントで上書きされない
  - 漢字をコピペした場合、ふりがな欄は空のまま手動入力できる
  - サジェスト選択時にマスタ yomi がふりがな欄へ反映される
  - サジェスト選択後、ふりがな欄を手動修正→マスタに反映される
- 実機: iPhone Safari で動作確認（A-4 完了条件）

### Stage 3（member/grade 編集）
- 単体: 
  - options 省略で既存挙動維持（A3-S2-edit-01〜29 全件緑）
  - options.member 単独更新
  - options.grade 単独更新
  - 両方更新
  - 不正値で invalid_member_value / invalid_grade_value
- e2e:
  - マスタ一覧に区分が表示される
  - 編集モーダルで支部員・中学生区分を変更できる
  - localStorage に保存される
  - 履歴情報（初回・最終・回数）が読み取り専用で表示される

### Stage 4（復元UI）
- 単体:
  - applyMasterMemberRestore 通常成功
  - 不存在id → not_found
  - deleted=false → not_deleted
  - 復元後の deleted=false / deleted_at=null
- e2e:
  - 削除済み表示トグルOFFで deleted=true は出ない
  - トグルONで出る + 削除日時表示
  - 復元 confirm cancel では復元されない
  - 復元 confirm accept で localStorage 反映
  - **復元後**：通常マスタ一覧 / 過去参加者パネル / サジェスト候補に再表示

### Stage 5（未入力可視化）
- 単体:
  - isNoYomiMember 各種ケース（空 / 空白 / カタカナ / 通常）
  - applyQuickFilter QUICK_FILTER_NO_YOMI
- e2e:
  - サマリー数と一覧バッジ数が一致
  - フィルタ結果とサマリー数が一致
  - 50音タブ・検索との AND 条件

### Stage 6（レイアウト揺れ）
- 実機調査ログを `docs/reviews/` に残す（Nice to Have 3反映）
- e2e:
  - 各タブで `Math.abs(scrollWidth - innerWidth) <= 1`
  - 削除済み表示ON時も
  - マスタ編集モーダル表示時も

### Stage 7（全体）
- npm test 全件緑
- npm run test:e2e 全件緑
- PR 作成

---

## 6. 完了報告フォーマット（各Stage）

```
## Stage X 完了報告

### Commit / Push
- commit: <hash> <メッセージ>
- push: ✅ feat/phase-a4-master-mgmt

### 変更
- shogi_v4.html (+N / -M)
- test/test_branch_master.js (+N)
- test/e2e/shogi_app_a4.spec.js (+N)

### 実装内容
（仕様書のどの節を実装したか、具体的に）

### テスト結果
- 単体: PASS=X / FAIL=0
- e2e: X passed / 0 failed
- 既存テストへの影響なし

### 留意事項
（実機確認推奨項目、Playwright再現困難な箇所など）

### 次Stage進行確認
Stage X+1（XXX）への進行確認をお願いします。
```

---

## 7. 最終 PR メッセージ案

```
## Summary
Phase A-4 実装：実機運用テストで判明した課題への対応（6項目）

## Stages
- Stage 1: 登録画面ふりがな入力欄追加（UIのみ）
- Stage 2: IME自動取得（補助機能）
- Stage 3: マスタ一覧 + 編集モーダルに member/grade
- Stage 4: 削除済みmember復元UI
- Stage 5: ふりがな未入力者可視化
- Stage 6: スマホレイアウト揺れ修正
- Stage 7: 全体テスト

## Reviews
- ChatGPT v2 メタレビュー: A / Go（Must Fix なし、Should Fix 3件は実装に反映済み）
- Codex レビュー予定

## Test
- 単体: 547 + N件 / FAIL 0
- e2e: 80 + N件 / FAIL 0
- iPhone Safari 実機確認: 別途報告

## 設計遵守
- player.yomi 追加なし
- schema_version 変更なし
- applyMasterMemberEdit 後方互換維持
- A-3 機能（サジェスト・member_id 連携・F8）破壊なし
```

---

それでは Stage 1 から着手してください。
最初に §1 作業開始前確認事項 5項目を提示し、ユーザー承認を待ってから Stage 1 を開始してください。
