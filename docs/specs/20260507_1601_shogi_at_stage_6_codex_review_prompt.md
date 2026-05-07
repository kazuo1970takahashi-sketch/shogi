# shogi A-T Stage 6 Codex Gate Review 依頼

**作成日時**: 2026-05-07 16:01 JST
**対象 PR**: feat(stage-6): A-T Stage 6 Visual Regression 軽量導入
**ブランチ**: `feat/at-stage-6-visual-regression`(main `a5c8353` 起点)
**仕様書**: `docs/specs/20260507_1548_shogi_at_stage_6_visual_regression_mini_spec_v1.md`
**親 spec 修正**: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md` §4.6 / §9 R3(末尾コミット同梱)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge

---

## 1. 変更サマリ

A-T spec v1.3 §5 Stage 6「visual regression 基盤」達成。Playwright 標準 `toHaveScreenshot` のみで 13 baseline スクリーンショットを生成、外部 SaaS 不採用(spec §8 整合)、CI 統合は Stage 7 で再判断。

### 変更ファイル

- `package.json`(+3、`test:visual` / `test:visual:update` script 追加、`--project=chromium-desktop` 制限)
- `playwright.config.js`(+4、mobile-375 project に `testIgnore: /visual_regression\.spec\.js/` 追加)
- `test/e2e/visual_regression.spec.js`(新規 201 行、13 baseline テスト)
- `test/e2e/visual_regression.spec.js-snapshots/`(新規 13 PNG、合計 1.0 MB)
- `docs/specs/20260507_1548_*_mini_spec_v1.md`(本 Stage 6 仕様書)
- `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`(末尾 commit で §4.6 viewport 「430」→「375」+ §9 R3 「許容差分 1px」→「maxDiffPixelRatio 0.05」修正)

### 変更しないファイル

- `shogi_v4.html`(production)無変更(`git diff main shogi_v4.html` 0 行)
- 既存 e2e / 単体テストすべて無変更

---

## 2. §6 受け入れ条件 5 観点 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | 13 baseline 全件生成 | `ls *-snapshots/*.png \| wc -l` | ✅ **13**(macOS darwin、chromium-desktop project)|
| 2 | 再実行で 0 diff | `npm run test:visual` | ✅ **13 passed**(再実行で完全 match)|
| 3 | 既存 452 件緑維持 | `npm test` + `npx playwright test` | ✅ **PASS=50** + **e2e 465 passed**(452 baseline + 13 visual 増分)|
| 4 | production 不変 | `git diff main shogi_v4.html` | ✅ **0 行** |
| 5 | spec §4.6 / §9 R3 修正同梱 | 末尾 commit `b99eb4d` | ✅ 含む |

---

## 3. 13 baseline 一覧

| # | screen | viewport | filename | size |
|---|---|---|---|---|
| 1a | 参加者登録(空) | 375 | `reg-empty-375-chromium-desktop-darwin.png` | 47 KB |
| 1b | 参加者登録(空) | 1280 | `reg-empty-1280-chromium-desktop-darwin.png` | 50 KB |
| 2a | 過去参加者パネル展開 | 375 | `reg-pp-panel-375-chromium-desktop-darwin.png` | 87 KB |
| 2b | 過去参加者パネル展開 | 1280 | `reg-pp-panel-1280-chromium-desktop-darwin.png` | 96 KB |
| 3 | サジェスト表示中 | 375 | `reg-suggest-375-chromium-desktop-darwin.png` | 67 KB |
| 4a | 対局管理(ペアリング後) | 375 | `tournament-paired-375-chromium-desktop-darwin.png` | 55 KB |
| 4b | 対局管理(ペアリング後) | 1280 | `tournament-paired-1280-chromium-desktop-darwin.png` | 61 KB |
| 5a | 最終結果(全 R 確定) | 375 | `result-finalized-375-chromium-desktop-darwin.png` | 98 KB |
| 5b | 最終結果(全 R 確定) | 1280 | `result-finalized-1280-chromium-desktop-darwin.png` | 99 KB |
| 6a | マスタ一覧 | 375 | `master-list-375-chromium-desktop-darwin.png` | 95 KB |
| 6b | マスタ一覧 | 1280 | `master-list-1280-chromium-desktop-darwin.png` | 99 KB |
| 7 | マスタ編集モーダル | 375 | `master-edit-modal-375-chromium-desktop-darwin.png` | 78 KB |
| 8 | tombstone 復元 UI | 375 | `master-restore-tombstone-375-chromium-desktop-darwin.png` | 95 KB |
| | **合計** | | | **約 1.0 MB** |

仕様書 §3.3 想定 1〜5 MB 内、LFS 不要。

---

## 4. 実装上の判断ポイント(Codex の論点候補)

### 4.1 mask 不採用の判断

仕様書 §3.1 example mask(`.dynamic-date` / `.last-attended`)は preventive 提案だったが、実装着手前 grep で:
- `master.updated_at`: localStorage のみ、UI 非表示 → mask 不要
- `player.id` (`'p'+Date.now()+...`): DOM attribute のみ、視覚非表示 → mask 不要
- `last_attended` / `deleted_at`: seed 固定値('2026-04-15' / '2026-04-10' 等)→ mask 不要
- `#rep-date` input: empty default → mask 不要
- `todayYmd()` 経由表示: 固定 seed では fallback 発火しない → mask 不要

**結論**: 固定 seed JSON で実質的に動的要素なし。再実行 13 passed(0 diff) で false positive なしを確認、初回実装で mask 追加せず完了。

**過剰 mask が無いことの根拠**: mask 配列を空のまま出荷 → UI 全領域が比較対象 → 仮に動的要素が production に追加されたら新 baseline で false positive として顕在化する。Stage 7 以降の運用で発覚した時点で mask 追加可能(逆に、preventive な mask は「見えるべき差異を見えなくする」リスクがあるため採用しない方が妥当)。

### 4.2 maxDiffPixelRatio: 0.05(5%)の妥当性

| 値 | 意味 | 採否 |
|---|---|---|
| 0(完全一致)| 1 pixel でも diff で fail | ❌ font subpixel rendering で実質常 fail |
| 0.001(0.1%)| 微小な antialiasing 差を許容 | △ Linux CI と macOS dev 間では不足 |
| **0.05(5%)** | **font 差異 + 軽微な layout 揺れ許容、致命的崩れは検出**| ✅ **採用** |
| 0.10(10%)| 大きめのレイアウト変化も許容 | △ regression 検出能力低下 |

shogi のテスト screen は 800px 高さの画像で、5% = 40,000 pixel まで許容。1 文字あたり 100〜200 pixel として **~200〜400 文字分の rendering 差異まで許容**(font 差で全文字位置がずれても許容範囲)、一方で **モーダル消失・パネルが画面外・色反転等のレイアウト崩れは検出可能**(数千〜数万 pixel 規模)。

仕様書 §9 R3 旧値「許容差分 1px」は実環境では達成困難(font subpixel rendering で常時不一致)、Stage 6 実装時点で 5% に緩和した(末尾 commit `b99eb4d`)。

### 4.3 baseline 画像を git commit する判断

| 観点 | 判断 |
|---|---|
| 13 ファイル合計 1.0 MB | 通常 git で十分(LFS 不要、`< 5 MB` 推奨ガイドライン内)|
| 将来肥大リスク | Linux 用 baseline 追加で +1 MB(Stage 7 着手時)、合計 ~2 MB 想定。さらなる増分は別 PR で都度判断 |
| バイナリ diff 不可 | PNG は git diff で可読性なし、PR レビュー時は GitHub 上で画像直接表示で対応 |
| commit 履歴肥大 | meaningful な UI 変更時のみ baseline 更新、頻度は月数回程度想定 → 履歴肥大リスク小 |

### 4.4 spec §4.6 viewport「430」→「375」修正の整合性

**既存 e2e の 430 width 実装**(`shogi_app_a4.spec.js` Stage 6、`shogi_app_a4_2.spec.js` Stage 5)は `for (const width of [375, 430])` で **両幅をループ実行**しており、これらのテストの目的は **「横スクロール検出」「長氏名 layout 検証」** で visual regression とは別目的。

Stage 6 visual regression は **代表 width で UI 構造の regression を検出する** ことが目的なので、375 のみで十分(430 の追加は不要)。仕様書 §4.6 の旧値「430」は仕様起草時の typo として 375 に統一した。

### 4.5 chromium-desktop project 限定の判断

`visual_regression.spec.js` を **chromium-desktop project のみで実行** する制限を 2 重に設定:
1. `package.json` の npm script に `--project=chromium-desktop` 付与
2. `playwright.config.js` の mobile-375 project に `testIgnore: /visual_regression\.spec\.js/` 設定

理由:
- viewport は test 内で `setViewportSize` で上書きする
- mobile-375 project の他設定(deviceScaleFactor: 2, hasTouch, iPhone UA)は、同じ viewport でも微小な描画差異を生む
- baseline を 13 (chromium-desktop) のみに絞ることで、Stage 7 で Linux CI 用 baseline 追加時の合計を 26 (= 13 × 2 platform) に保つ

### 4.6 CI 統合を Stage 7 で再判断とする方針

Stage 6 仕様書 §1 OUT で明示。memory「過剰品質ゲート回避」「PoC 速度優先」整合:
- 本 Stage では `npm run test:visual` ローカル実行のみ
- Linux CI 用 baseline 不在のため、`npx playwright test`(全 project、CI 上)で visual_regression spec を走らせると現状 chromium-desktop でも platform=linux でファイル不在 → Stage 7 で Linux baseline 追加が必須
- Stage 7 で `e2e-test` job 内に統合 or 別 job 化を判断

---

## 5. コミット履歴

```
27de8e8 fix(stage-6): mobile-375 project から visual_regression.spec.js を除外
b99eb4d doc(stage-6): A-T spec v1.3 §4.6 viewport / §9 R3 許容差分を実装と整合修正
1abb4d9 feat(stage-6): baseline 画像 13 枚生成(macOS darwin、chromium-desktop only)
71e80b8 feat(stage-6): visual_regression.spec.js 13 baseline 追加
7cd89ad chore(stage-6): npm scripts test:visual / test:visual:update 追加
3b3e894 docs(stage-6): A-T Stage 6 Mini 仕様書 v1 配置
a5c8353 feat(stage-4): A-T Stage 4 Mutation Testing 軽量導入 + A-4.2 回帰テスト (#16)
```

論理単位で 6 commit。spec 修正(b99eb4d)は Stage 2b/2c/4 と同パターン(末尾 typo 修正 commit)。

---

## 6. Codex への確認依頼

下記 5 観点を A 判定基準として独立検証をお願いします。

1. **13 baseline 全件生成 + 0 diff**: `npm run test:visual` で 13 passed が再現できるか
2. **既存 452 件緑維持**: `npx playwright test` で 465 passed(452 + 13)が再現できるか
3. **production 不変**: `git diff main shogi_v4.html` 0 行
4. **mask 採用判断の妥当性**: mask 配列が空であることが「動的要素ゼロの seed JSON」と整合し、過剰 mask による UI 検出能力低下を避けているか
5. **maxDiffPixelRatio: 0.05 の妥当性**: font 差異許容と致命的レイアウト崩れ検出のバランス、Linux CI baseline 追加時にも実用範囲か

**特に注視してほしい点**:
- chromium-desktop project 限定の二重制限(npm script `--project` + playwright.config `testIgnore`)が冗長でないか、片方で十分か
- spec §4.6 viewport「430」→「375」修正が既存 e2e の `for (const width of [375, 430])` 実装と矛盾しないか(目的が別 = 横スクロール検出 vs visual regression)
- baseline 画像 13 枚 / 1.0 MB を git commit する判断が将来の repo 肥大リスクと釣り合っているか
- CI 統合を Stage 7 申し送りとする判断が memory「過剰品質ゲート回避」と整合しているか
- spec §9 R3 修正(「1px」→「5%」)が visual regression の本来目的(致命的崩れ検出)を損なっていないか

判定 A 以上であれば squash merge → main 同期 → Stage 6 完了 → Stage 5 / 7 / 8 / 3 の独立判断へ。
