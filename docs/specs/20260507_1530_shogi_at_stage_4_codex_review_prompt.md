# shogi A-T Stage 4 Codex Gate Review 依頼

**作成日時**: 2026-05-07 15:30 JST
**対象 PR**: feat(stage-4): A-T Stage 4 Mutation Testing 軽量導入(手動方式)+ A-4.2 回帰テスト
**ブランチ**: `feat/at-stage-4-mutation-testing`(main `27b3ec9` 起点)
**仕様書**: `docs/specs/20260507_1458_shogi_at_stage_4_mutation_testing_mini_spec_v1.md`(末尾コミットで §3/§6/§9/§10 を手動方式に修正済)
**完了レポート**: `docs/specs/20260507_1528_shogi_at_stage4_completion_report.md`
**Mutation 詳細**: `reports/manual_mutations.md`
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge

---

## 1. 変更サマリ

A-T spec v1.3 §5 Stage 4 完了基準 4 項目達成。Stryker.js × Playwright が公式非対応(2024〜2026、Sentry Engineering / GitHub Issue #4557)のため、**手動 Mutation Testing 方式((C) 案)に方針変更**(髙橋さん事前承認)。production code(`shogi_v4.html`)は全 mutation 試行後に `git checkout` で revert、最終 diff は 0 行。

### 変更ファイル

- `test/helpers/shogi_assertions.test.js`(+46、A-4.2 回帰 unit test 3 件追加)
- `reports/manual_mutations.md`(新規 145 行、20 mutation 結果詳細)
- `docs/specs/20260507_1458_shogi_at_stage_4_mutation_testing_mini_spec_v1.md`(+42 / -43、§3/§6/§9/§10 を手動方式に修正)
- `docs/specs/20260507_1528_shogi_at_stage4_completion_report.md`(新規 165 行、完了基準達成状況)

### 変更しないファイル

- `shogi_v4.html`(production)無変更(全 mutation 後 git checkout で revert、`git diff main shogi_v4.html` 0 行)
- 既存 helpers / factory / e2e すべて無変更

---

## 2. §6 受け入れ条件 5 観点 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | 完了基準 #1〜#3 機械的検証 | A-4.2 回帰 unit test 3 件 pass | ✅ **6 passed**(3 unit × 2 project) |
| 2 | 手動 Mutation Testing 完走 | 20 mutation すべて apply→test→revert サイクル完了 | ✅ 完了、`reports/manual_mutations.md` に詳細記録 |
| 3 | Mutation Score 計測完了 | RED 件数 / 20 算出 + survived カテゴリ分類 | ✅ **65%**(13/20)、survived 7 件を A/B/C カテゴリで分類済 |
| 4 | 既存 446 件緑維持 | `npm test` PASS=50 + `npx playwright test` 全件 pass | ✅ **PASS=50** + **e2e 452 passed**(446 baseline + 6 新規 unit test 増分) |
| 5 | production 不変 | `git diff main shogi_v4.html` 0 行 | ✅ 0 行 |

---

## 3. 実装上の判断ポイント(Codex の論点候補)

### 3.1 Stryker.js 不採用と手動方式採用の根拠

**前提崩し**: Stage 4 仕様書 v1 は Stryker.js 採用を想定していたが、実装着手前の web 検索で:

> "Stryker unfortunately doesn't support our testing framework of choice, Playwright" — Sentry Engineering blog
> "Stryker doesn't work with Vitest's browser mode because their instrumentation assumes Node.js execution, but browser mode runs tests in actual Chromium via Playwright" — alexop.dev

公式サポートランナー: Jest / Vitest / Mocha / Jasmine / Karma のみ(Playwright 不在)。command-runner workaround は実装負債(extract + route interception + Stryker config の 3 層、想定 4〜7 時間 → 8〜12 時間に膨張)。

memory「過剰品質ゲート回避」「PoC 速度優先」「技術選定は利用者最適で随時見直し」と整合し、**手動 20 mutation 方式に変更**(髙橋さん事前承認、commit `af63130` で仕様書 §3/§6/§9/§10 を実装と同期修正)。

### 3.2 対象 10 関数の選定根拠

| カテゴリ | 関数 | 根拠 |
|---|---|---|
| A-4.2 直接経路 | `addPlayerFromMaster` L936 | A-4.2 主因(`.pp-add-btn` クリック → cls フィールド整合性)|
| Stage 1 完全書き直し対象 | `syncBranchMasterOnSave` L3286, `saveData` L3312 | Stage 1 偽陽性レポート §4.2 で完全書き直し対象、Stage 2c PR-3 で UI 経由化済 |
| L0 §7 INV 強制 | `normalizeState` L286 | INV-PL/PA/RE 横断で全 state を堅牢化 |
| INV-PL | `addPlayer` L2471, `removePlayer` L2560 | 同名拒否 / 削除 |
| INV-MA | `applyOverwriteImport` L649, `applyMergeImport` L668 | 上書き/マージインポート |
| INV-ST | `loadFromPaste` L3388, `resetAll` L3631 | localStorage 系 |

`getFee` / `calcTotal`(INV-FE)は純関数で UI test カバレッジが薄いと予想され、優先度低のため除外(目標 10 関数)。`sanitizeMatch` は `normalizeState` 内 nested で同経由カバー。

### 3.3 production 不変の保証方式

**workflow**: 各 mutation について
1. Edit ツールで `shogi_v4.html` に 1 行〜数行の意味変更を適用
2. 該当 mutation を捕捉しそうな e2e/unit を実行(`npx playwright test -g "..."` または `npm test`)
3. 結果(passed/failed)を観察 → RED/GREEN を `reports/manual_mutations.md` に記録
4. **`git checkout shogi_v4.html` で完全 revert**

最終 PR で `git diff main shogi_v4.html` = 0 行(commit 履歴上も production 変更ゼロ)。

### 3.4 Mutation Score 65%(目標 90% 未達)の取り扱い

仕様書 §5 制約「production 修正禁止、survived の許容理由を per-function で明示」を厳守。survived 7 件のカテゴリ分類:

- **A: e2e カバレッジ不在(5 件)**: M11/M12(`loadFromPaste`)、M14(`resetAll`)、M15/M16(`normalizeState` malformed JSON edge)
- **B: 副次クリーンアップで外部不可視(1 件)**: M6(`removePlayer` の `_pendingNewYomi[id]` clear、次の saveData で全クリアされる)
- **C: assertion 解像度不足(1 件)**: M18(`applyOverwriteImport` の `normalizeBranchMaster` skip、テストが default field 検査せず)

**Stage 4 完了基準 #4 のゴールは「偽陽性が再混入しないことを検証」で、A-4.2 主因経路 RED 確認で構造的目標達成**。Score 数値は補助指標、改善方針(Stage 5 以降のテスト追加で 100% 到達可能)を完了レポート §4 で明示。

### 3.5 A-4.2 回帰 unit test 配置先

仕様書 §2 の「単体検証」要件に従い、**`test/helpers/shogi_assertions.test.js` 既存ファイルに追加**(test/regression/ 新設は不要)。3 件:
1. 正常系(cls 一致): factory.assertion が緑(throw しない)
2. A-4.2 型偽陽性(length +1 だが cls=B): assertion が throw
3. A-4.2 型偽陽性(length 不変): assertion が throw

これにより `classSelectedFromPast` factory の primary ロジックが将来 helper 改修時にも cls 不一致を構造的に検出することを保証。

---

## 4. コミット履歴

```
af63130 doc(stage-4): 仕様書 §3/§6/§9/§10 を手動 Mutation Testing 方式に修正
c70c0f0 docs(stage-4): Stage 4 完了レポート作成
f9dd7df test(stage-4): 手動 Mutation Testing 20 件実施 + 結果レポート
2908846 test(stage-4): A-4.2 回帰テスト追加(完了基準 #1〜#3 機械的検証)
9639ecc docs(stage-4): A-T Stage 4 Mini 仕様書 v1 配置
27b3ec9 feat(stage-2c): A-T PR-3 shogi_app_a4 factory 化 + syncBranchMasterOnSave 書き直し (#15)
```

論理単位で 5 commit。仕様書修正は末尾(commit `af63130`)で Stage 2b/2c の typo 修正パターン継承。

---

## 5. Codex への確認依頼

下記 5 観点を A 判定基準として独立検証をお願いします。

1. **完了基準 #1〜#3 達成**: A-4.2 回帰 unit test 3 件が `classSelectedFromPast` factory の cls 不一致検出を構造的に保証しているか(unit test 6 passed)
2. **手動 Mutation Testing の妥当性**: Stryker 不採用判断が合理的か、20 mutation の選定が L0 §7 不変条件 + A-4.2 主因経路を網羅しているか
3. **Mutation Score 65% の許容**: survived 7 件のカテゴリ分類(A/B/C)が論理的に妥当か、改善方針(Stage 5 以降申し送り)が現実的か
4. **production 不変**: `git diff main shogi_v4.html` 0 行が確認できているか、各 mutation 適用→git checkout 流れに漏れがないか
5. **既存 446 件緑維持**: 全 e2e 452 件 + unit 50 件が緑、Stage 4 増分は A-4.2 回帰 unit 6 件のみ

**特に注視してほしい点**:
- Stryker.js 不採用の判断が memory「dislike waste」「avoiding overextension」「PoC 速度優先」と整合しているか、過度な簡素化に陥っていないか
- 手動 mutation の選定が **デッドコードを避けて意味のあるコード経路** を mutate しているか(M1 cls 反転、M19 imported 側優先など A-4.2 型バグの再現に妥当)
- A-4.2 主因経路(`addPlayerFromMaster` M1/M2)が RED 確認されたことが「Stage 4 #4 ゴール達成」と判定する根拠として十分か
- 仕様書 §3/§6/§9/§10 の修正(末尾 commit)が Stage 2b masterExport / Stage 2c §4 同パターンで運用統一されているか

判定 A 以上であれば squash merge → main 同期 → A-T フェーズ完了。
