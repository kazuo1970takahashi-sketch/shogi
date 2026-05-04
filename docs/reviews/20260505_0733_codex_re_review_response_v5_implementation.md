# Codex 実装再レビュー結果（v5 実装、PR #1）— shogi_v4 Phase A-1

**レビュー実施日**: 2026-05-05
**レビュー対象**:
- リポジトリ: kazuo1970takahashi-sketch/shogi
- PR: https://github.com/kazuo1970takahashi-sketch/shogi/pull/1
- ブランチ: feat/phase-a1-branch-master
- リモート先端: 3a49b4c（依頼文追加コミット込み）
- レビュー対象実装最新 commit: b219617（Codex Minor 反映）
- 仕様書: docs/specs/20260505_0217_shogi_design_phaseA_reception_v5.md
- 依頼文: docs/reviews/20260505_0715_shogi_codex_re_review_request_phase_a1_v5.md

**レビュー種別**: 修正後の再レビュー（v1.2 Slim 6.2 節）
**前回判定**: B / Must Fix 5件 + Minor 1件

---

## 0. 総合判定

**判定**: **A- / Go**
**等級**: 前回 B → **A-**（設計 v4 の A- に追いついた）
**main マージ判断**: **Yes（マージしてよい）**

---

## 1. 実機確認結果

```bash
bash test/run_tests.sh shogi_v4.html
```

- 既存テスト: PASS=50, FAIL=0, WARN=0
- 支部マスタ機能テスト: **PASS 111件 / FAIL 0件**
- 総合: **全テスト合格**

```bash
node test/test_branch_master.js shogi_v4.html
```

→ PASS 111件 / FAIL 0件

実装コードへの修正は実施せず（レビューのみ）。

---

## 2. Must Fix 5件 + Minor の再判定

### MF #1 tournament_id 大会日ベース化

**判定**: **OK**

確認内容：
- `ensureTournamentId(state, master, tournamentDate)` の第3引数化
- `syncBranchMasterOnSave()` から大会日が渡されている
- 既存 ID 保持、無効日付フォールバック、suffix もテスト済み

### MF #2 同名複数候補スキップ

**判定**: **OK**

確認内容：
- 通常同期経路の confirm は廃止
- 複数候補時は `continue` でスキップ
- `member_id` 付与なし
- 既存 member の `tournament_ids` / `attendance_count` 更新なし

### MF #3 破損マスタ saveData 保護

**判定**: **OK**

確認内容：
- `loadBranchMaster()` が `_loaded_with_corruption` を付与
- `syncBranchMasterOnSave()` が `saveBranchMaster()` をスキップして `save()` のみ実行
- 破損 raw 保持テストも有効

### MF #4 crypto.randomUUID 不在時 throw

**判定**: **OK**

確認内容：
- `generateMemberId()` 冒頭で明示 throw
- 不正な `m_` ID は生成されない

### MF #5 マイグレーション仕様明文化

**判定**: **OK**

確認内容：
- v5 §3.4.5 / §4.4 で、A-1 は対話 UI なし、同名複数候補は新規 member 作成と明文化
- 実装もその動作

### Minor: isValidYmd 実在検証

**判定**: **OK**

確認内容：
- `2026-99-99`, `2026-02-30`, 非うるう年、100年/400年ルールまでテスト済み

---

## 3. 新規導入箇所 A〜E の判定

### A. `_loaded_with_corruption` フラグ

**判定**: **OK / Minor**

- saveData 経路の保護は良好
- マイグレーション経路では破損マスタを読み込んだ後に手動取込で上書き可能
  - 「再マイグレで復旧」の範囲とも読めるため、マージ阻止ではない
  - 将来は確認文言があるとより親切（A-2 検討）

### B. `pendingSkippedNames` 通知

**判定**: **OK**

- showMsg 存在確認あり
- 複数名でも1回通知
- 既存保存処理を止めない

### C. `ensureTournamentId` 第3引数

**判定**: **OK**

- 本体呼び出し元は `syncBranchMasterOnSave()` のみで渡し忘れなし
- 旧テストの引数なし呼び出しも fallback として妥当

### D. `generateMemberId` throw

**判定**: **OK / Minor**

- 通常同期・マイグレーションでは catch され、該当参加者はスキップ
- 不正 ID 保存は防げている
- 古環境ではユーザー通知が弱いので、A-2 または運用メモで補足推奨

### E. 追加テスト +36

**判定**: **OK**

- 前回の穴をかなり直接突いており、false-positive になりにくい構造
- 特に破損マスタ saveData 経路、同名複数候補、crypto 不在、実在日付検証は有効

---

## 4. 既存非破壊

**判定**: **OK**

確認内容：
- 既存 50 テスト緑
- `renderRegList()` への過剰混入なし
- マスタなし起動、既存タブ、既存 JSON 読込の後方互換も維持

---

## 5. A-2 バックログ送り（マージ阻止しない Minor）

main マージ後、A-2 で対応を検討する項目：

1. **破損マスタ状態でマイグレーションを走らせる時の確認表示**（観点 A、Minor）
2. **crypto 非対応ブラウザでのユーザー向け通知強化**（観点 D、Minor）

どちらも A-2 バックログで十分。

---

## 6. main マージ判断

**Yes: main にマージしてよい。**

設計レビュー基準の A- に追いついた実装。前回指摘の Must Fix 5件はすべてコードレベルで解消され、新規導入箇所にも重大な穴なし。既存テストも緑、新規テスト 111 アサーションも緑。

---

**END OF REVIEW**
