# shogi A-T Stage 4 Mini 仕様書: A-4.2 回帰テスト + Mutation Testing(軽量導入)

**作成日時**: 2026-05-07 14:58 JST
**文書種別**: Mini 仕様書(目標 150〜200 行)
**親仕様**: A-T spec v1.3 §5 Stage 4(完了基準 #1〜#4)
**前提仕様**: Stage 2c 仕様書(`docs/specs/20260507_1244_shogi_at_stage_2c_mini_spec_v1.md`)
**実装担当**: Claude Code
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**main HEAD 前提**: 27b3ec9

---

## 0. 背景と目的

A-T spec v1.3 §5 Stage 4 の完了基準 4 項目のうち、#1〜#3 は Stage 2b で実質達成済みのため、本 Stage 4 では **#4 Mutation Testing による偽陽性再混入防止** を新規導入する。同時に、#1〜#3 を機械的に検証する A-4.2 回帰テスト 1 件を追加し、4 項目すべてを満たした完了レポートを作成する。

memory「過剰品質ゲート回避」「PoC 速度優先」を踏まえ、Stryker.js は **P0 関数 ~10 個に対象を絞った軽量導入**(ローカル 1 回実行)とし、CI 統合は Stage 7 で再判断する。

---

## 1. スコープ

### IN(対象)

- **A-4.2 回帰テスト 1 件追加**(完了基準 #1〜#3 の機械的検証)
- **Stryker.js 軽量導入**(完了基準 #4):
  - 対象: P0 ~10 関数(§3 で確定リスト)
  - 実行: ローカル手動 1 回、結果を Stage 4 完了レポートに記録
  - Mutation Score 目標: 90%
- **shogi_v4.html JS 抽出スクリプト + Stryker config**(前哨作業、production HTML 不変)
- **Stage 4 完了レポート作成**(`docs/specs/YYYYMMDD_shogi_at_stage4_completion_report.md`)

### OUT(別フェーズ判断)

- **CI 統合**(Stage 7 で再判断、本 Stage 4 ではローカル実行のみ)
- **nightly Mutation Testing**(GitHub Actions free tier の制限を超えるため、self-hosted runner / 並列分割が必要、Stage 7 と合わせて判断)
- **PR ごとの Mutation Testing**(memory「過剰品質ゲート回避」と矛盾、不採用)
- **Mutation Score 達成のための production code 修正**(production code 変更禁止、Stage 2a〜2c 方針継承。survived mutant が出た場合は完了レポートに記録のみ)

---

## 2. A-4.2 回帰テスト追加(完了基準 #1〜#3)

### 完了基準 #1〜#3 の現状

- #1 ✅ shogi クラスボタン A の primary `state.players[lastIndex].cls === 'A'` 記述 — Stage 2b で `classSelectedFromPast('A')` factory により達成済み(`shogi_app_a4_2.spec.js` Stage 2 describe)
- #2 ✅ commit 73961d3 で当該テストが赤になる確認 — Stage 1 偽陽性レポート §4 で実証済み
- #3 ☑ A-4.2.1 hotfix 適用後緑(Stage 4 範囲外、別フェーズで対応)

### 本 Stage 4 で追加する検証

`test/regression/at_stage_4_a42_regression.spec.js`(または既存 spec への追加)に、以下を機械的に検証する 1 件を追加:

- `classSelectedFromPast('A')` factory が `state.players` の cls 不一致を確実に赤検出することを単体検証
- 過去のリグレッションパターン(showMsg のみ → primary 不在)が現在の helpers で構造的に防止されていることを文書化(コメント記載)

実装は最小限(20〜30 行)、commit 73961d3 で赤になる確認は手動再現手順を完了レポートに記録する形で代替する。

---

## 3. Stryker.js 軽量導入

### 対象関数(~10 個、実装時に Claude Code が最終確定)

| 関数 | 行 | 役割 | A-4.2 関連度 / L0 §7 INV |
|---|---|---|---|
| `addPlayerFromMaster` | L936 | 過去参加者 / サジェストから追加 | ★★★(A-4.2 主因経路) |
| `addPlayer` | L2471 | 通常参加者追加 | INV-PL-1〜7 |
| `removePlayer` | L2560 | 参加者削除 | INV-PL |
| `runMasterImport` | L1674 | マスタインポート | INV-MA-1〜3 |
| `syncBranchMasterOnSave` | L3286 | saveData 経由マスタ同期 | Stage 1 §4.2 重点 |
| `saveData` | L3312 | 大会データコピー | INV-ST |
| `loadFromPaste` | L3388 | 貼付読み込み | INV-ST |
| `resetAll` | L3631 | リセット | INV-ST |
| `normalizeState` / `sanitizeMatch` | (要 grep) | 複数 INV 維持 | INV 横断 |
| `calcTotal` / `getFee` | (要 grep) | 料金計算 | INV-FE |

### 前哨作業: shogi_v4.html JS 抽出

production HTML 不変のため、Stryker 専用 sidecar `.js` を生成する extract スクリプトを `test/stryker/` 配下に配置:

```
test/stryker/
  extract_inline_js.js   # shogi_v4.html の <script>L203-L3800 内容を tmp/shogi_v4.extracted.js に書き出す
  stryker.conf.json      # extracted.js を mutate target、Playwright をテストランナーに設定
  README.md              # 実行手順(npm run stryker:extract → npm run stryker:run → 結果確認)
```

production HTML(`shogi_v4.html`)は変更せず、`tmp/` 配下は `.gitignore` で除外。

### Mutation Score 目標と運用

- 目標: **90%**(P0 関数 ~10 個 limited scope、デッドコード相当の survived mutant は完了レポートで per-function 許容理由を明示)
- 実行: `npm run stryker:run`(ローカル、推定 13〜50 分)
- 結果: `reports/mutation/mutation.html` を Stage 4 完了レポートに参照、生成物は git ignore

### Stryker 実装上の判断

- Playwright をテストランナーに統合(custom test-runner 設定)
- coverage 取得は Stryker の `--coverageAnalysis perTest` を試行、Playwright で取得困難なら `all` にフォールバック(実行時間延びる可能性、その場合は対象関数をさらに絞る)

---

## 4. Stage 4 完了レポート作成

`docs/specs/YYYYMMDD_HHMM_shogi_at_stage4_completion_report.md` として配置、内容:

1. 完了基準 #1〜#4 の達成状況(各項目で commit / 実測値を引用)
2. Mutation Testing 実行結果(対象関数リスト / Mutation Score / killed / survived / timeout の内訳)
3. survived mutant の per-function 許容理由(デッドコード相当 / テスト不在の正当理由)
4. CI 統合判断(Stage 7 で再判断する旨を記録)
5. 次フェーズ申し送り(Stage 5/6/7/8 着手判断、または A-T 区切り判断)

---

## 5. 制約

- production code(`shogi_v4.html`)変更禁止(Stage 2a〜2c 継承)
- `force:true` ゼロ維持(grep 検証)
- 既存 446 件の e2e + unit テスト緑維持
- Stryker 関連の生成物(`tmp/` / `reports/mutation/`)は git ignore
- Mutation Score 90% に届かない場合でも production 修正は禁止、完了レポートで survived mutant の理由を明示する形で完了とする(本 Stage の主目的は「現状の偽陽性監視能力を可視化する」こと、Stryker による偽陽性発見はあくまで二次的成果)

---

## 6. 受け入れ条件

| # | 観点 | 検証方法 |
|---|---|---|
| 1 | 完了基準 #1〜#3 機械的検証 | A-4.2 回帰テスト 1 件 pass |
| 2 | Stryker 軽量導入動作 | `npm run stryker:run` がエラーなく完走、`reports/mutation/mutation.html` 生成 |
| 3 | Mutation Score 計測完了 | 対象 ~10 関数で Score 出力、目標 90% に対する実測値を完了レポートに記録 |
| 4 | 既存 446 件緑維持 | `npm test` PASS=50 + `npx playwright test` 全件 pass |
| 5 | production 不変 | `git diff main shogi_v4.html` 0 行 |

---

## 7. レビュー手順

1. **実装** → Claude Code(`feat/at-stage-4-mutation-testing` ブランチ)
2. **ChatGPT レビュー: スキップ**(Gate Review 運用)
3. **Codex Gate Review**: §6 の 5 観点 + Stryker 軽量スコープの妥当性
4. Codex A 判定 → 髙橋さんが PR レビュー → squash merge

---

## 8. 申し送り(Stage 5 以降)

- Stage 5(モンキーテスト) / Stage 6(Visual regression) / Stage 7(CI 統合) / Stage 8(全体テスト + PR)は Stage 4 完了後に独立判断
- Stage 7 着手時に nightly Mutation Testing を再評価(self-hosted runner / 並列分割の検討含む)
- L0 業務モデル §7 の不変条件 30+ 個に対する Mutation Testing 全件カバーは、本 Stage 4 ではスコープ外(P0 関数限定)、必要なら別フェーズで対象拡大

---

## 9. リスクと予防

- **R1**: Stryker と Playwright の統合で coverage 取得が困難 → `--coverageAnalysis all` にフォールバック、実行時間が伸びるなら対象関数をさらに絞る(完了レポートで対象縮小理由を明示)
- **R2**: shogi_v4.html JS 抽出スクリプトの維持コスト → README に手順を明記、production HTML が大きく変わったら抽出スクリプトを更新する旨を記録
- **R3**: Mutation Score 90% 未達 → §5 制約通り production 修正禁止、完了レポートで survived mutant の per-function 許容理由を明示して完了

---

## 10. 想定工数(参考)

- 前哨作業(JS 抽出 + Stryker config + Playwright 統合): 2〜4 時間
- A-4.2 回帰テスト 1 件追加: 30 分
- Stryker 実行 + 結果確認: 1〜2 時間(実行時間 13〜50 分 + 結果分析)
- 完了レポート作成: 30〜60 分
- 合計: 4〜7 時間(1 セッション完了可)

---

**END**
