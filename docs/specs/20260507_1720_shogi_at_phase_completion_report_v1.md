# shogi A-T フェーズ完了レポート(Stage 8 区切り総括)

**作成日時**: 2026-05-07 17:20 JST
**文書種別**: A-T フェーズ最終総括(Stage 8 仕様書 + 完了レポート統合)
**親仕様**: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`(A-T spec v1.3)
**main HEAD 前提**: 44b8446(Stage 6 squash merge 済)
**実装担当**: Claude Code(本 Stage は docs 中心、コード変更最小)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回

---

## 0. 本 Stage 8 の位置付け

A-T spec v1.3 §5 Stage 8 は「全体テスト + PR — A-T 区切り判断ステージ」と定義される総括 Stage。本フェーズで A-T を**正式に区切り**、残 Stage 3 / 5 / 7 を「将来の選択肢」として温存し、shogi のリリース時または別契機で再判断とする。

A-T フェーズ主目的「**A-4.2 リグレッション再発の構造的防止**」は Stage 4 マージ時点で達成済(Stage 4 完了レポート §1 参照)、本 Stage 8 は履歴上の節目を作る docs 作業のみ。

---

## 1. A-T フェーズ全 Stage 進捗(2026-05-07 時点)

### 完了 6 Stage(11 中 6 完了 = 55%)

| # | Stage | 完了日 | PR # | merge commit | 主成果 |
|---|---|---|---|---|---|
| 1 | Stage 1: 既存 e2e 偽陽性レポート | 2026-05-06 | (docs only) | — | A-4.2 偽陽性パターンの構造分析、観点 1〜3 の明文化 |
| 2 | Stage 2a: UI テストヘルパ実装 | 2026-05-06 | #11 | 1775c98 | `expectClickable` 7 段階検証 + `clickAndExpectChange` + 23 factory + 4 helpers |
| 3 | Stage 2b: A-4.2 関連 e2e factory 置換 | 2026-05-07 | #12 | d57f80c | shogi_app_a4_2.spec.js 22 it factory 化、`clickAndExpectChangeUnchecked` 追加 |
| 4 | Stage 2c: 全 e2e factory 置換 (3 PR) | 2026-05-07 | #13/#14/#15 | e09ab73 / 78fa160 / 27b3ec9 | 4 spec / 99 click factory 化、`tabSwitched` / `masterMemberRestored` factory 追加、`syncBranchMasterOnSave` 完全書き直し |
| 5 | Stage 4: Mutation Testing 軽量導入 | 2026-05-07 | #16 | a5c8353 | 手動 20 mutation((C) 案、Stryker.js 不採用)、Mutation Score 65%、A-4.2 主因経路 100%、A-4.2 回帰 unit test 3 件 |
| 6 | Stage 6: Visual Regression 軽量導入 | 2026-05-07 | #17 | 44b8446 | Playwright `toHaveScreenshot` で 13 baseline、外部 SaaS 不採用 |

### 残 4 Stage(リリース時または別契機で再判断)

| # | Stage | 状態 | 判断方針 |
|---|---|---|---|
| 7 | Stage 3: テストデータ生成器 | ⬜ 未着手 | Stage 5 と組み合わせて初めて価値、Stage 5 着手時に再判断 |
| 8 | Stage 5: モンキーテスト | ⬜ 未着手 | 業務操作組合せ網羅、現状の 465 e2e で実用十分なら不要 |
| 9 | Stage 7: CI 統合 | ⬜ 未着手 | Mutation(手動方式)と Visual の自動化、shogi リリース時の運用負担評価で再判断 |
| 10 | Stage 8: 全体テスト + PR | 🔄 **本 Stage で実施中** | 本 PR で総括 |

(spec v1.3 §5 表記の「Stage 1〜8」と独立カウント。Stage 2 は 2a/2b/2c の 3 サブ Stage に分解、Stage 5/6/7/8 はそれぞれ単独。)

---

## 2. 構築した 3 層 regression 防止層

A-T フェーズ全体で立体的な regression 防止層を構築した。

### L1: 構造的 e2e(Stage 2a/2b/2c)

| 機構 | 効果 |
|---|---|
| `expectClickable` 7 段階検証 | 「force click 踏み抜き」型偽陽性を不可能化 |
| `clickAndExpectChange`(primaryAssertions ≥ 1 機械強制) | 「クリック前検証不在」型偽陽性を不可能化(A-4.2 観点 2 の構造解消)|
| 23 factory + 4 helpers | 「通知のみ / DOM 観察のみ primary」型偽陽性を不可能化(A-4.2 観点 3 の構造解消)|
| 既存 130 click 全件 factory 経由(100%) | リポジトリ全体で raw click ゼロ、`force:true` ゼロ |

### L2: Mutation 監視能力の可視化(Stage 4)

| 機構 | 効果 |
|---|---|
| 10 P0 関数 × 各 2 mutation = 20 手動 mutation | 偽陽性監視能力の per-function 可視化 |
| Mutation Score 65%(13/20) | 主因経路は 100%(2/2)、survived 7 件は A/B/C カテゴリで許容理由明示 |
| A-4.2 回帰 unit test 3 件 | `classSelectedFromPast` factory が cls 不一致を構造的に throw することを単体検証 |

### L3: ビジュアル regression 検出(Stage 6)

| 機構 | 効果 |
|---|---|
| 13 baseline 画像(5 画面 × 2 widths + 3 画面 × 1 width) | CSS / レイアウト崩れ型 regression を検出 |
| Playwright 標準 `toHaveScreenshot` のみ(外部 SaaS 不採用) | 運用コスト minimum、CI 統合は Stage 7 で再判断 |
| `maxDiffPixelRatio: 0.05` | font 差異許容、致命的レイアウト崩れは検出 |

L1 が「ロジック層」、L2 が「監視能力の可視化」、L3 が「ビジュアル層」を担当。3 層で A-4.2 型再発防止 + UI regression 防止が立体化。

---

## 3. 数値到達点

| 指標 | A-T 着手前 | A-T 完了時点 | 増分 |
|---|---|---|---|
| 全 e2e | 272 | 465 | +193(+71%)|
| `clickAndExpectChange` 経由率 | 0% | 100%(130/130) | +100% |
| `force:true` 出現箇所 | 数件 | 0 | -数件 |
| Mutation Score(P0 関数) | 計測なし | 65%(13/20) | 新規 |
| A-4.2 主因経路 Mutation Score | 計測なし | 100%(2/2) | 新規 |
| Visual Regression baseline | 0 | 13 PNG / 1.0 MB | 新規 |
| production code 改修(`shogi_v4.html`)| — | **0 行**(Stage 2a〜6 全 6 PR で完全不変) | 0 |

**production HTML を一切触らずに 6 PR 通してテスト基盤・mutation 監視・visual regression を立体化した**ことが、Stage 2a で確立した「production code 変更禁止」原則の実証。

---

## 4. 残 Stage 申し送り(リリース時 or 別契機で再判断)

### Stage 3: テストデータ生成器(seed 固定 100 パターン JSON)

- **着手条件**: Stage 5 着手と同時(モンキーテストの seed として必要)
- **着手不要条件**: 現状の手書き seed(SAMPLE_MASTER 等)で運用十分な場合
- **想定工数**: 4〜8 時間
- **再判断トリガー**: Stage 5 の着手判断時

### Stage 5: モンキーテスト(決定論モード + 探索モード)

- **着手条件**: 現状 465 e2e で見つからないバグを発見する余地が大きいと判断した時
- **着手不要条件**: shogi が PoC 段階に留まる限り、465 e2e + 13 visual + 65% mutation で実用十分
- **想定工数**: 8〜16 時間(spec §5 推定)
- **再判断トリガー**: shogi のプロダクションリリース判断時、または運用テストで未検出バグが顕在化した時

### Stage 7: CI 統合

- **対象**: Mutation Testing(現状手動)と Visual Regression(現状ローカルのみ)の CI 統合
- **着手条件**: shogi がプロダクションリリースされ、PR ごとの自動 regression 検出が運用負担に見合う規模になった時
- **着手不要条件**: shogi が PoC 段階に留まる限り、ローカル実行 + 髙橋さんの手動チェックで実用十分
- **想定工数**: Visual のみなら 2〜4 時間、Mutation も含めると 8〜16 時間
- **再判断トリガー**: shogi のリリース判断時、または運用で regression を CI で発見できなかった事象が発生した時

### 4 Stage(残 3 + 統括)を再開する場合の優先順序

1. **Stage 7(Visual のみ CI 統合)** — 軽量、最も即効性あり(2〜4 時間)
2. **Stage 5 + Stage 3 セット** — モンキーテスト基盤、shogi の業務テスト網羅
3. **Stage 7(Mutation も CI 統合)** — Stage 5/3 完了後

---

## 5. A-T フェーズで確立したメタ成果物(他プロジェクト展開可能)

A-T フェーズで構築した以下は **他プロジェクト(golf-compe / bp-matching / shogi-coach 等)でも再利用可能**:

| メタ成果物 | 配置 | 他プロジェクトへの展開 |
|---|---|---|
| `expectClickable` 7 段階検証 | `test/helpers/shogi_clickable.js`(shogi リポジトリ内) | 汎用 helper 化して別リポジトリにコピー、または npm package 化検討 |
| `clickAndExpectChange` パターン | `test/helpers/shogi_assertions.js` | 同上、factory 設計思想をテンプレ化 |
| 手動 Mutation Testing 方式 | `reports/manual_mutations.md` の様式 | Stryker.js 公式非対応の framework(Playwright / Vitest browser mode 等)で汎用利用可 |
| Visual Regression 軽量導入パターン | `test/e2e/visual_regression.spec.js` の構成 | Playwright 採用プロジェクトで直接再利用 |
| Gate Review 運用 | memory #22 / DevSecOps v1.2 Slim | 全プロジェクト共通(既に運用中)|
| 仕様書 typo 修正末尾コミット同梱パターン | Stage 2b / 2c / 4 / 6 で確立 | docs と実装の乖離を許さない運用、全プロジェクト共通 |

---

## 6. 主要意思決定記録(将来の参照用)

A-T フェーズで行った重要な技術選定・トレードオフ判断:

### 6.1 Stryker.js 不採用、手動 Mutation Testing 採用(Stage 4)

- **判断**: Stryker.js の Playwright 公式非対応(2024〜2026)を確認、command-runner workaround の実装負債(extract + route interception + Stryker config の 3 層、想定 4〜7 時間 → 8〜12 時間に膨張)を避け、手動 20 mutation 方式に変更
- **根拠**: memory「過剰品質ゲート回避」「PoC 速度優先」「技術選定は利用者最適で随時見直し」整合
- **将来再判断**: Stryker.js が Playwright 対応した場合は再採用検討

### 6.2 Visual Regression mask 不採用(Stage 6)

- **判断**: 仕様書 §3.1 の example mask(`.dynamic-date` / `.last-attended`)を採用せず、空 mask で出荷
- **根拠**: production grep で動的要素 5 候補すべて「固定 seed では発火しない」と判定、再実行 13 passed(0 diff)で false positive なしを実証
- **将来再判断**: 運用で false positive が観測されたら mask 追加(reactive 方針)

### 6.3 viewport 430 → 375 統一(Stage 6)

- **判断**: spec §4.6 旧値「430」を 375 に統一(末尾 commit で同梱修正)
- **根拠**: 既存 e2e の `for (const width of [375, 430])` は横スクロール検出が目的で別、Stage 6 は代表 viewport で UI 構造 regression 検出が目的なので 375 のみで十分
- **メリット**: 既存 mobile-375 project 流用、新 project 追加 overhead 回避

### 6.4 production code 完全不変原則(Stage 2a〜6 通貫)

- **判断**: A-T フェーズ全 6 PR で `shogi_v4.html` を 1 行も変更せず
- **根拠**: テスト基盤強化と production 修正を完全分離、テスト追加で production の挙動が変わらないことを保証
- **実証**: 全 PR で `git diff main shogi_v4.html` 0 行を maintain

---

## 7. Stage 8 受け入れ条件

| # | 観点 | 検証方法 |
|---|---|---|
| 1 | 本完了レポート docs 配置 | `docs/specs/20260507_1720_shogi_at_phase_completion_report_v1.md` が main にマージ |
| 2 | A-T spec v1.3 §5 Stage 一覧に各 Stage の完了 mark + PR # 追記 | 末尾 commit で spec 修正同梱 |
| 3 | 既存 465 件緑維持 | `npm test` PASS=50 + `npx playwright test` 全件 pass |
| 4 | production 不変 | `git diff main shogi_v4.html` 0 行 |

---

## 8. 制約

- production code(`shogi_v4.html`)変更禁止(Stage 2a〜6 継承)
- 新規テスト追加なし(本 Stage は docs 中心の総括)
- A-T spec v1.3 への変更は Stage 完了 mark + PR # 追記のみ(構造的変更なし)

---

## 9. 想定工数

- 仕様書配置 + ブランチ準備: 15 分
- A-T spec v1.3 §5 の Stage 一覧に完了 mark 追記: 15 分
- 受け入れ検証(`npm test` + `npx playwright test`): 5 分
- Codex review request 作成: 15 分
- PR 作成: 5 分
- 合計: **1 時間以内**(1 セッション完了可、最軽量)

---

## 10. 次フェーズ判断(本 Stage 8 マージ後)

A-T フェーズ完了をもって、shogi 関連の次判断は以下のいずれか:

- **(α) 他プロジェクトへ移行**(推奨): bp-matching 運用テスト / golf-compe P1 / 55th CGC Cup 後処理 / DDD 議論再開 / 基本設計書 / cheatsheet 公開 等
- **(β) shogi リリース判断**: A-T 残 Stage 3/5/7 の再判断トリガーとなる
- **(γ) shogi 機能追加(A-5 以降)**: 別フェーズで機能拡張、必要に応じて A-T 残 Stage を組み込み

memory「PoC 速度優先」「過剰品質ゲート回避」を踏まえると **(α)** が筋。残 Stage は「将来の選択肢」として温存。

---

**END — A-T フェーズ正式完了**
