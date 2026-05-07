# shogi A-T Stage 2c PR-1 Codex Gate Review 依頼

**作成日時**: 2026-05-07 13:01 JST
**対象 PR**: feat(stage-2c): A-T PR-1 shogi_app + index_layout factory 化
**ブランチ**: `feat/at-stage-2c-shogi-app-and-index-layout`(main d57f80c 起点)
**仕様書**: `docs/specs/20260507_1244_shogi_at_stage_2c_mini_spec_v1.md`(本 PR-1 スコープは §2.1 / §3.1)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)
**判定基準**: A 以上で squash merge

---

## 1. 変更サマリ

A-T spec v1.3 §5 Stage 2c の 3 PR 構成のうち PR-1。`shogi_app.spec.js`(8 click / 10 it)を factory 化、`index_layout.spec.js`(0 click / 5 it)は raw click 不在を確認のみ。Stage 2c 全 PR で共通利用する **`tabSwitched(targetTab)` factory(#23)** を本 PR で先行導入(PR-2 / PR-3 で再利用)。

### 変更ファイル

- `test/helpers/shogi_assertions.js`(+16 行、`tabSwitched` factory 追加)
- `test/helpers/shogi_assertions.test.js`(+3 行、`tabSwitched` を FACTORY_NAMES / argsByName に追加 + 件数コメント更新)
- `test/e2e/shogi_app.spec.js`(差分 +18 / -10、10 it 置換)
- `docs/specs/20260507_1244_shogi_at_stage_2c_mini_spec_v1.md`(新規、Mini 仕様書 195 行)

### 変更しないファイル

- `shogi_v4.html`(production code)無変更
- 既存 helpers(`clickAndExpectChange` / `clickAndExpectChangeUnchecked` / `expectClickable` / `getStateSnapshot`)無変更
- 既存 22 factory(#1〜#22)無変更(末尾に #23 追加のみ)
- `index_layout.spec.js` 無変更(raw click 0 のため変更不要、PR description で明示)

---

## 2. §7 受け入れ条件 5 観点 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | **P0**(対象 it 全 pass) | `npx playwright test test/e2e/shogi_app.spec.js test/e2e/index_layout.spec.js` | ✅ **30 passed**(15 it × 2 project: chromium-desktop / mobile-375) |
| 2 | **既存挙動破壊なし**(全 e2e 緑維持) | `npx playwright test` | ✅ **442 passed**(Stage 2b 438 + tabSwitched 単体テスト 4 増分) |
| 3 | **構造的防止達成**(it body 内 raw click 0、`force:true` 0) | sed/grep 検証(下記) | ✅ shogi_app.spec.js it body 内 0 / 全体 0(beforeEach にも click 不在)、index_layout 全体 0、`force:true` 全体 0 |
| 4 | **保存読込影響なし**(localStorage 系) | shogi_app.spec.js は `loadFromPaste` 系を呼ばず(モーダル開閉のみ)、`#load-from-paste` ボタンの enabled/disabled 確認のみ | ✅ Codex 確認のみ |
| 5 | **データ破壊なし** | shogi_app.spec.js は `resetAll` / `runMasterImport` を呼ばない | ✅ Codex 確認のみ |

### §7 P3 grep 検証コマンド

```bash
# shogi_app.spec.js it body 内 raw click(beforeEach 除外)
$ awk '/^  test\(/ {in_test=1; depth=0; next} in_test {...} ' test/e2e/shogi_app.spec.js | grep '\.click('
(空 = OK)

# index_layout.spec.js 全体
$ grep -nE '\.click\(' test/e2e/index_layout.spec.js || echo "0 件"
0 件

# force:true(両ファイル全体)
$ grep -nE 'force:\s*true' test/e2e/shogi_app.spec.js test/e2e/index_layout.spec.js || echo "0 件"
0 件
```

### npm test (単体テスト)

```
結果: PASS=50, FAIL=0, WARN=0
```

---

## 3. 実装上の判断ポイント(Codex の論点候補)

### 3.1 新規 factory `tabSwitched(targetTab)` の primary 選択

**production 実装(`shogi_v4.html` L2131-2143 `showTab(t)`)**: state は持たず、DOM のみで状態管理(`pane-{t}.style.display` + `tab-{t}.className`)。

**§3.1 仕様書の primary 候補から選択**:
- (1) `state.activeTab === targetTab`:**不採用**(production に該当 state なし)
- (2) **DOM `.tab.active` の id 検証**: ✅ **採用**(既存 `tournamentStarted` factory も同パターン: `expect(after.activeTab).toBe('tab-tournament')`、`getStateSnapshot.activeTab` が `.tab.active` の id を返す既存実装と一致)
- (3) panel visible/hidden 検証: 不採用(4 pane 個別検証は冗長、(2) で十分)

**実装**:
```js
tabSwitched: (targetTab) => ({
  assertion: async (before, after, page) => {
    expect(before.activeTab).not.toBe(targetTab);  // 副次: 実切替確認
    expect(after.activeTab).toBe(targetTab);       // primary
  },
  meta: { primaryAssertions: 1, primaryTypes: ['tab'], operation: 'tabSwitched', ... },
}),
```

副次 assertion(`before.activeTab !== targetTab`)は idempotent クリック検出用。`primaryAssertions: 1` メタは既存 factory の慣行(主検証 1 つ + 副次は assertion 内に含めるが meta カウント外)に揃えた。

### 3.2 modal 開閉系の raw callback 形式

`#loadBtn` open / `#load-cancel` close は L0 §1.5 P1 操作で state を持たないため、Stage 2c 仕様書 §4 raw callback パターンに従って `ctx.primary('modal opened/closed')` + DOM 可視性 assertion で primary semantic を担保:

```js
await clickAndExpectChange(page.locator('#loadBtn'), async (before, after, ctx, p) => {
  ctx.primary('load modal opened');
  await expect(p.locator('#load-modal')).toBeVisible();
});
```

factory 化しないのは、本 Stage 2c 範囲では再出現が L0 P1 の数操作のみで、業務モデル §1.5 見直しタイミングまで raw callback で十分と判断(仕様書 §4 + §9 申し送り通り)。

### 3.3 index_layout.spec.js の扱い

raw click 0 / 全 5 it がレイアウト assertion のみ(`boundingBox` / `getComputedStyle` / `whiteSpace` / `textAlign` 等)。Stage 1 偽陽性レポート §2.1 の通り「A-T 改修対象外」。

仕様書 §2.1 末尾「grep 検証コミットで『変更不要』であることを構造的に確認」に対し、本 PR では **「コミット差分にこのファイルが含まれない」こと自体** を構造証明として、PR description でも明示。spec ファイル末尾への grep 検証 it 追加は冗長(レイアウト e2e に click 検証 it を混入させると責務が混じる)と判断したため見送り。

---

## 4. コミット履歴

```
cc247fd refactor(stage-2c): shogi_app.spec.js を factory 化(10 it / 8 click)
7ed7256 feat(stage-2c): tabSwitched factory 新設(PR-1〜3 共通)
4ac63b0 docs(stage-2c): A-T Stage 2c Mini 仕様書 v1 配置(全 PR 共通)
d57f80c feat(stage-2b): A-4.2 関連 e2e 22 it factory 置換 (#12)
```

論理単位で分離(仕様書配置 / factory 追加 / spec 置換)。

---

## 5. Codex への確認依頼

下記 5 観点を A 判定基準として独立検証をお願いします。

1. **P0**: 対象 15 it が全 pass(`npx playwright test test/e2e/shogi_app.spec.js test/e2e/index_layout.spec.js`)
2. **既存挙動破壊なし**: 全 e2e 442 件が緑維持(Stage 2b 438 + 増分 4)
3. **構造的防止**: shogi_app.spec.js it body 内 raw click 0 / 全体 0、index_layout.spec.js 全体 0、`force:true` 0
4. **新 factory tabSwitched の妥当性**: primary 選択(DOM `.tab.active` id 経由)が production 実装(state 不在、DOM のみ)と整合しているか。`tournamentStarted` 既存パターンとの統一性が保たれているか。before assertion の idempotent クリック検出が過剰ではないか
5. **Stage 2c PR 順序の前提**: PR-2(shogi_app_a3)/ PR-3(shogi_app_a4)が本 PR で導入する `tabSwitched` を前提にしている(仕様書 §10 R3)、本 PR が先に merge される前提が成立しているか

**特に注視してほしい点**:
- `tabSwitched` factory が PR-2 / PR-3 で再利用される際、想定される他の利用箇所(beforeEach 温存後の it 内タブ切替、describe 単位のセットアップ等)で破綻しないか
- raw callback を使った modal 開閉パターンが Stage 2a sample §5.2 異常系(primary 0 件で赤)と整合しているか
- index_layout.spec.js を **変更しない**選択が「Stage 2c IN スコープ」(仕様書 §2.1 で 13 it 中 5 it として明示)と矛盾しないか

判定 A 以上であれば squash merge → main 同期 → PR-2 着手、B 以下なら本 PR で対応します。
