# shogi A-T Stage 6 Mini 仕様書: Visual Regression 軽量導入

**作成日時**: 2026-05-07 15:48 JST
**文書種別**: Mini 仕様書(目標 150〜200 行)
**親仕様**: A-T spec v1.3 §5 Stage 6 + §4.6
**前提仕様**: Stage 4 完了レポート(`docs/specs/20260507_1528_shogi_at_stage4_completion_report.md`)
**実装担当**: Claude Code
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**main HEAD 前提**: a5c8353

---

## 0. 背景と目的

A-T spec v1.3 §5 Stage 6「visual regression 基盤」の達成。Stage 2c で構造的 e2e は完備したが、**CSS / レイアウト崩れ型の regression**(production HTML / CSS の意図せぬ変更で UI が壊れるパターン)は現状の e2e では検出不可。本 Stage 6 で baseline スクリーンショット比較を導入し、UI の意図しない変化を構造的に検出する基盤を構築する。

memory「過剰品質ゲート回避」「PoC 速度優先」を踏まえ、**Playwright 標準の `toHaveScreenshot` のみ採用**(外部 SaaS Percy / Argos / Chromatic は不採用、spec §8 整合)。CI 統合は Stage 7 で再判断。

---

## 1. スコープ

### IN(対象)

- **13 baseline スクリーンショット取得**(spec §4.6 通り、5 画面 × 2 widths + 3 画面 × 1 width)
- **Playwright `toHaveScreenshot` 規約整備**(animations:disabled / caret:hide / mask / maxDiffPixelRatio)
- **新規テストファイル作成**: `test/e2e/visual_regression.spec.js`
- **npm script 追加**: `test:visual` / `test:visual:update`
- **baseline 画像コミット**: `test/e2e/visual_regression.spec.js-snapshots/` 配下
- **spec §4.6 / §9 R3 修正同梱**: 「430」→「375」、「1px 許容」→「maxDiffPixelRatio 0.05」

### OUT(別フェーズ判断)

- **CI 統合**(Stage 7 で再判断、本 Stage はローカル `npm run test:visual` のみ)
- **外部 SaaS 採用**(spec §8 で明示禁止、Percy / Argos / Chromatic 不採用)
- **font の docker image 固定**(現状 Playwright default の platform 自動分離で十分、必要なら Stage 7 で再判断)
- **mobile-430 project 追加**(spec の「430」は typo として 375 に修正同梱、新 project 追加は overhead 大)

---

## 2. 13 baseline 画面リスト(spec §4.6 通り)

| # | 画面 | viewport | seed データ |
|---|---|---|---|
| 1a | 参加者登録(空) | 375 | 空 state |
| 1b | 参加者登録(空) | 1280 | 空 state |
| 2a | 参加者登録(過去参加者パネル展開) | 375 | SAMPLE_MASTER ロード済 |
| 2b | 参加者登録(過去参加者パネル展開) | 1280 | SAMPLE_MASTER ロード済 |
| 3 | 参加者登録(サジェスト表示中) | 375 | SAMPLE_MASTER + 「山田」入力 |
| 4a | 対局管理(ペアリング後) | 375 | A クラス 4 名追加 + ペアリング |
| 4b | 対局管理(ペアリング後) | 1280 | 同上 |
| 5a | 最終結果(全ラウンド確定) | 375 | A 4 名 × 4 ラウンド全勝敗確定 |
| 5b | 最終結果(全ラウンド確定) | 1280 | 同上 |
| 6a | マスタ一覧 | 375 | SAMPLE_MASTER |
| 6b | マスタ一覧 | 1280 | SAMPLE_MASTER |
| 7 | マスタ編集モーダル | 375 | SAMPLE_MASTER + 山田太郎編集モーダル open |
| 8 | tombstone 復元 UI | 375 | SAMPLE_MASTER + 山田太郎削除済 + 削除済表示 toggle ON |

合計 **13 baseline**(macOS dev / Linux CI で各々独立保存、実数 26 ファイル)。

---

## 3. 規約

### 3.1 共通オプション

```js
await expect(page).toHaveScreenshot('reg-empty-1280.png', {
  animations: 'disabled',          // CSS animation 凍結
  caret: 'hide',                    // text caret 非表示
  fullPage: true,                   // viewport 越え部分も含む
  maxDiffPixelRatio: 0.05,          // 5% 許容(spec §9 R3 緩和)
  mask: [
    page.locator('.dynamic-date'),  // 動的日付
    page.locator('.last-attended'), // 最終参加日
  ],
});
```

### 3.2 viewport 上書き

各 it 内で `await page.setViewportSize({ width, height })` を使用。既存 chromium-desktop / mobile-375 project の viewport を流用、新 project 追加なし。

### 3.3 baseline 保存パス

Playwright default: `test/e2e/visual_regression.spec.js-snapshots/<test-name>-<browser>-<platform>.png`

例:
- macOS dev: `reg-empty-1280-chromium-darwin.png`
- Linux CI: `reg-empty-1280-chromium-linux.png`

両方 git commit 対象(LFS 不使用、PNG ファイルサイズは 50KB〜200KB 想定、13 × 2 platform = 26 ファイル合計 1〜5MB)。

### 3.4 npm script

```json
{
  "scripts": {
    "test:visual": "playwright test test/e2e/visual_regression.spec.js",
    "test:visual:update": "playwright test test/e2e/visual_regression.spec.js --update-snapshots"
  }
}
```

`test:visual:update` は意図的更新時のみ実行、commit に baseline diff 含めること。

---

## 4. spec §4.6 / §9 R3 修正同梱

末尾コミット(Stage 2b masterExport / Stage 2c §4 / Stage 4 §3 と同パターン)で以下を修正:

- **§4.6 viewport「430」→「375」**: 既存 mobile-375 project と統一(新 project 追加 overhead 回避)
- **§9 R3「許容差分 1px」→「maxDiffPixelRatio: 0.05(5%)」**: font 差異の現実的影響を踏まえた緩和

---

## 5. 制約

- production code(`shogi_v4.html`)変更禁止(Stage 2a〜4 継承)
- 外部 SaaS(Percy / Argos / Chromatic)不採用(spec §8 整合)
- 既存 446 件 + Stage 4 の 6 件 = 452 件 e2e + unit テスト緑維持
- baseline 画像は git commit、LFS 不使用(サイズ ≤ 5MB 想定)
- CI 統合は Stage 7 で再判断(本 Stage では `npm run test:visual` ローカルのみ)

---

## 6. 受け入れ条件

| # | 観点 | 検証方法 |
|---|---|---|
| 1 | 13 baseline 全件生成 | `npm run test:visual:update` 完走、`*-snapshots/` に 13 × 2 = 26 PNG(macOS dev のみなら 13)生成 |
| 2 | 再実行で 0 diff | `npm run test:visual` で 13 件全 pass(diff 0) |
| 3 | 既存 452 件緑維持 | `npm test` PASS=50 + `npx playwright test` 全件 pass |
| 4 | production 不変 | `git diff main shogi_v4.html` 0 行 |
| 5 | spec §4.6 / §9 R3 修正同梱 | 末尾 commit に diff 含む |

---

## 7. レビュー手順

1. **実装** → Claude Code(`feat/at-stage-6-visual-regression` ブランチ)
2. **ChatGPT レビュー: スキップ**(Gate Review 運用)
3. **Codex Gate Review**: §6 の 5 観点 + visual regression 規約の妥当性
4. Codex A 判定 → 髙橋さんが PR レビュー → squash merge

---

## 8. 申し送り(Stage 7 以降)

- **CI 統合**: Stage 7 で `e2e-test` job 内に `test:visual` 統合 or 別 `visual-regression` job 化を判断。Linux CI 用 baseline は Stage 7 着手時に `--update-snapshots` で初回生成。
- **font docker image 固定**: macOS dev と Linux CI の baseline 不一致が運用上煩雑になった場合、Stage 7 で `mcr.microsoft.com/playwright:v1.59.1-jammy` 採用を再判断。
- **追加画面**: 仕様書 §4.6 の 13 baseline で網羅できない画面(例: ローディング状態、エラーモーダル)が運用で必要になった場合、増加の可否を別 PR で判断。

---

## 9. リスクと予防

- **R1**: 初回 baseline 生成時、動的要素(日付 / 時刻 / random ID)で false positive → §3.1 mask 規約で対応、必要なら mask 対象を本 PR 内で追加
- **R2**: macOS dev と Linux CI で baseline 不一致 → Playwright default の platform 自動分離(`*-darwin.png` / `*-linux.png`)で衝突回避、両方 commit
- **R3**: baseline 画像が大きすぎて git 肥大 → PNG 圧縮、必要なら mask 範囲拡大で画像サイズ削減
- **R4**: 意図的 UI 変更時の baseline 更新を忘れる → README に `npm run test:visual:update` 手順を明記、PR template に baseline 更新確認 checkbox 追加(Stage 7 で再判断)

---

## 10. 想定工数(参考)

- 仕様書配置 + ブランチ準備: 15 分
- 13 baseline 用テスト記述(各 10〜20 行): 1.5〜2 時間
- baseline 生成 + macOS で目視確認 + commit: 30〜60 分
- mask / maxDiffPixelRatio チューニング(初回 false positive 出る想定): 1〜2 時間
- spec §4.6 / §9 R3 修正同梱: 15 分
- 完了レポート + Codex review request 作成: 30〜60 分
- 合計: 4〜6 時間(1 セッション完了可)

---

**END**
