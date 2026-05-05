# A-T Stage 1：既存 e2e 偽陽性レポート

**作成日時**: 2026-05-06 01:16 JST
**対象ブランチ**: feat/phase-a-t-test-hardening
**根拠仕様**: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md` v1.3 §4.1 / §4.2 / §4.3 + `docs/specs/zero_bug_declaration_v1_2_5.md` (shogi-coach) §2.2 L4
**検証担当**: Claude Code（Stage 1 キックオフ §Phase 1.3 の 5 観点に従い精査）

---

## 1. サマリ

### 1.1 検証範囲（実測）

| ファイル | テスト数 | click 数 | 観点別状況 |
|---|---:|---:|---|
| `test/e2e/index_layout.spec.js` | 5 | 0 | 観点 1〜5 すべて該当なし（click 自体が無いため） |
| `test/e2e/shogi_app.spec.js` | 10 | 8 | 観点 2 全該当・観点 5 軽微 |
| `test/e2e/shogi_app_a3.spec.js` | 25 | 37 | 観点 2 全該当・観点 5 軽微 |
| `test/e2e/shogi_app_a4.spec.js` | 45 | 54 | 観点 2 全該当・観点 4 該当 2 件 |
| `test/e2e/shogi_app_a4_2.spec.js` | 39 | 31 | 観点 2 全該当・観点 3 該当 1 件・観点 4 該当 1 件・観点 5 軽微 |
| **合計** | **124 tests** | **130 clicks** | |

> **注**: 仕様書の「272 件」は v1（2026-05-05 20:46 起草時点）のスナップショットで、現在の実測は 124 tests / 130 clicks。本レポートは実態に基づく。

### 1.2 観点別件数（PR 単位ではなく click 単位での該当数）

| 観点 | 内容 | 該当 click 数 | 重大度 |
|---|---|---:|---|
| 観点 1 | `force: true` 利用 | **0 件** | — |
| 観点 2 | クリック前検証の不在（`expectClickable` 相当なし） | **130 件 / 130 件 = 100%** | **🔴 致命的（A-4.2 主因）** |
| 観点 3 | クリック後の意味的検証の不在 | **1 件**（+ 軽微 1 件） | 🟡 中 |
| 観点 4 | 関数直接呼び出しによる UI バイパス | **3 件** | 🟢 軽微（意図的迂回） |
| 観点 5 | クリック対象セレクタの曖昧さ | **数件**（精査要） | 🟢 軽微 |

### 1.3 A-4.2 すり抜けの根本原因

**観点 2（クリック前検証の不在）が単独主因**。詳細は §3 を参照。

### 1.4「偽陽性なし」フォールバック発動状況

**発動なし**。観点 2 が 130 件中 130 件該当のため「偽陽性疑いゼロ」判定にはあたらず、A-T spec v1.3 §Stage 1 完了基準のフォールバック条件（73961d3 への最小再現テスト追加）は適用範囲外。**ただし Stage 4 で当該再現テストを追加し、73961d3 で赤になることを別途確認する**（v1.3 §Stage 4 完了基準）。

---

## 2. ファイル別 偽陽性分析

### 2.1 `test/e2e/index_layout.spec.js`（5 tests / 0 clicks）

`index.html` のスマホレイアウト検証専用。**click 操作なし**のため観点 1〜5 すべて該当なし。レイアウト計算（`boundingBox` / `getComputedStyle`）のみで完結しており、A-T 改修対象外。

### 2.2 `test/e2e/shogi_app.spec.js`（10 tests / 8 clicks）

| 行 | テスト名 | 観点 | 詳細 |
|---|---|---|---|
| 27, 40, 42 | 参加者 A/B クラス追加 → タブ切替 | 観点 2 | `await page.click('#addBtn')` / `'#startBtn'` / `'#tab-tournament'` 等、すべて `expectClickable` なし |
| 47 | `await expect(page.locator('.pairing-card').first()).toBeVisible()` | 観点 5 軽微 | `.first()` 利用。pairing-card が複数の場合に最初が期待通りかは保証されない（テストデータが決定論的なので機能上は問題なし） |
| 67–77 | load モーダル開閉 | 観点 2 | `await page.click('#loadBtn')` / `'#load-cancel'`、前検証なし |

**評価**: 観点 2 全該当（8/8）。Stage 2 でのヘルパーラップ単純置換で対応可能。

### 2.3 `test/e2e/shogi_app_a3.spec.js`（25 tests / 37 clicks）

| 行 | テスト名 | 観点 | 詳細 |
|---|---|---|---|
| 43, 56, 72, 78 等多数 | サジェスト候補 click | 観点 5 軽微 | `page.locator('#suggest-list .suggest-item').first().click()` を多用。テストデータが決定論的（山田太郎・山本花子の 2 件のみ）なので first() は事実上一意。機能上は問題ないが、Stage 2 で `.filter({ hasText: '山田太郎' })` 形式に統一推奨 |
| 全 click | `.click()` 直接 | 観点 2 | 37/37 件で `expectClickable` 相当なし |
| - | - | 観点 3 | clickAndExpect 化されていないが、ほぼ全テストで `state.players` / `localStorage` / DOM 行追加を primary semantic assertion として確認しており**意味的検証は実質的に存在**。例：L99–L115 の `state.players.A[0].member_id` / `member` / `grade` 検証は §1.2.5 §2.2 L4 整合 |

**評価**: 観点 2 全該当（37/37）+ 観点 5 軽微。観点 3 は事実上満たしているため Stage 2 はヘルパーラップ単純置換中心。

### 2.4 `test/e2e/shogi_app_a4.spec.js`（45 tests / 54 clicks）

| 行 | テスト名 | 観点 | 詳細 |
|---|---|---|---|
| 49 | 「新規参加者：手動入力したふりがなが saveData 後にマスタへ反映される」 | **観点 4 該当** | `await page.evaluate(() => { try { syncBranchMasterOnSave(); } catch(e) {} });` で関数を直接呼出。コメント無し |
| 111 | 「removePlayer：_pendingNewYomi がクリアされる」 | **観点 4 該当** | 同上、`syncBranchMasterOnSave()` を直接呼出。コメント「rep-date は result タブの隠れた DOM のため evaluate で値を入れる」あり（クリップボードプロンプト回避が真の理由） |
| 全 click | `.click()` 直接 | 観点 2 | 54/54 件で `expectClickable` 相当なし |
| - | - | 観点 3 | 大部分で `localStorage.getItem('shogi_branch_master')` を読んで `expect(member.yomi).toBe(...)` 等の primary semantic assertion あり。良好 |

**評価**: 観点 2 全該当（54/54）+ **観点 4 該当 2 件**。観点 4 は意図的迂回（クリップボードプロンプト回避）だが、Stage 2 で「保存ボタン UI 経由 + clipboard mock」へのリファクタを推奨。

### 2.5 `test/e2e/shogi_app_a4_2.spec.js`（39 tests / 31 clicks）— A-4.2 リグレッション通過 spec

#### 観点 2（前検証不在）— 全該当・**主因**

L86–L100 の主要 click（A/B クラスボタン）：

```javascript
test('A ボタン → state.players.A に追加', async ({ page }) => {
  const row = page.locator('#ppPanel .pp-row').filter({ hasText: '山田太郎' });
  await row.locator('.pp-add-btn[data-cls="A"]').click();   // ← 前検証ゼロ
  await expect(page.locator('#a-list .player-row')).toHaveCount(1);
  ...
});
```

- `await locator.click()` 直前に `expect(locator).toBeVisible()` すらない
- `pointer-events !== 'none'` の検証なし
- 5 点 hit-test なし
- ancestor chain（`inert` / `aria-disabled` / 祖先 `display: none`）検証なし
- これにより、production CSS で `pointer-events: none` または overlay 要素が `.pp-add-btn` をブロックしていても、playwright の synthetic click が DOM event を発火してしまい、テスト緑のまま実機タップ無反応になる

#### 観点 3（意味的検証）— **該当 1 件 + 軽微 1 件**

| 行 | テスト | 観点 3 違反内容 |
|---|---|---|
| L138–L143 | 「追加成功で showMsg『[氏名]（Xクラス）を登録しました』」 | **`#reg-msg` の文言確認のみで `state.players` 増加を assert していない** → v1.2.5 §2.2.5「UI 重要操作で通知表示のみを成功条件とすることを禁止」に違反する典型例 |
| L116–L130 | 「既追加 player を別クラスのボタンで再度追加」 | `await expect(page.locator('#reg-msg')).toContainText('この参加者はすでに登録されています')` を main assertion としつつ、補助で `#a-list` / `#b-list` 行数も確認しているため軽微 |

それ以外（L86, L94, L102, L116, L146 等多数）は `state.players` または DOM 行数を primary として確認しており **観点 3 は概ね満たしている**。

#### 観点 4（UI バイパス）— **該当 1 件**

L376–L382:
```javascript
// syncBranchMasterOnSave を直接呼び出す（クリップボードプロンプト回避）
await page.evaluate(() => {
  ...
  window.syncBranchMasterOnSave();
});
```

意図的迂回で、コメントもあり。観点 4 形式違反だが A-4.2 主因ではない。

#### 観点 5（セレクタ曖昧）— 軽微 1 件

L72: `await row.locator('span').first().click();` — 「氏名 span」を意図しているが、行内に複数 span がある場合に不定。今回はテストデータが決定論的で実害なし。

#### A-4.2 リグレッション通過の機構（推定）

A-4.2 は「production の `.pp-add-btn` 要素または祖先で `pointer-events: none` 等の理由により実機タップが届かない」事象。本 spec の L86–L100 は **`#a-list .player-row` 数を primary semantic assertion として確認している**（観点 3 は満たす）。にもかかわらず CI 緑になった理由は、**playwright の `locator.click()` が DOM の `dispatchEvent` 経由で onClick handler を直接トリガーし、`pointer-events: none` を踏み抜いた**ため。観点 2 の不在が直接の原因。

---

## 3. A-4.2 リグレッション通過の根本原因（観点優先順位）

### 第 1 主因：観点 2（クリック前検証の不在）

- 全 130 click が `expectClickable` 相当のチェックなし
- playwright 既定の `click()` は synthetic event を `dispatchEvent` するため、`pointer-events: none` / overlay / `inert` を踏み抜く
- 実機タップは `pointer-events: none` を尊重するため発火しない → **CI 緑 / 実機無反応** という偽陽性が成立
- v1.3 §4.2 expectClickable の 7 段階検証（特に 5 点 hit-test と ancestor chain）で構造的に防げる

### 第 2 副次因：観点 5（セレクタ曖昧さ）

- A-4.2 の主要テスト（L86–L100）は `[data-cls="A"]` で具体的に指定しており、本事案では発火対象自体は正しい
- ただし他テスト（L72 の `span.first()` 等）にあるセレクタ曖昧パターンが将来同型事故を生む可能性
- Stage 2 のセレクタ統一（`data-testid` 推奨）で予防

### 第 3 副次因：観点 3（意味的検証）

- A-4.2 主要テストは `#a-list .player-row` 数を primary として確認しており、構造としては機能していた
- ただし L138–L143「showMsg のみ」テストが残存。同型のテストが他フェーズで増殖すれば次の A-4.2 型事故のリスク
- v1.2.5 §2.2.5 違反として Stage 2 で修正必須

### 主因ではない：観点 1, 4

- 観点 1 (`force: true`)：リポジトリ全体で 0 件。
- 観点 4 (UI バイパス)：3 件あるが、いずれも「クリップボードプロンプト回避」の意図的迂回。A-4.2 とは無関係。

---

## 4. Stage 2 への申し送り

### 4.1 必ず置換すべきパターン

1. **全 130 click を `clickAndExpectChange(locator, expectedChange)` 経由に置換**（v1.3 §4.3）
2. ヘルパー内で `expectClickable` を強制呼出（v1.3 §4.2 の 7 段階検証）
3. **`force: true` 禁止**は既に守られているため Stage 2 では grep で 0 件継続を担保するのみ

### 4.2 完全書き直しが必要なテスト

| 件 | 該当 | 対応 |
|---|---|---|
| 1 件 | shogi_app_a4_2.spec.js L138–L143「showMsg のみ」 | primary assertion を追加（`state.players` 増加確認） |
| 2 件 | shogi_app_a4.spec.js L49 / L111 `syncBranchMasterOnSave()` 直接呼出 | UI 経由フロー（保存ボタン → 大会日設定 → clipboard mock）に書き換え |
| 1 件 | shogi_app_a4_2.spec.js L377 同上 | 同上 |

合計 **4 件**（約 3%）が完全書き直し対象。

### 4.3 部分置換で対応可能なテスト

残り **126 件**（約 97%）は以下の単純置換で対応：

```javascript
// Before
await row.locator('.pp-add-btn[data-cls="A"]').click();
await expect(page.locator('#a-list .player-row')).toHaveCount(1);

// After (Stage 2 ヘルパー導入後)
await clickAndExpectChange(
  row.locator('.pp-add-btn[data-cls="A"]'),
  async (before, after) => {
    expect(after.state.players.A.length).toBe(before.state.players.A.length + 1);
    expect(after.state.players.A.at(-1).cls).toBe('A');  // primary semantic assertion
  }
);
```

### 4.4 既存テストのうち primary assertion を持っていたテスト数

- **明示的 primary（state / localStorage）**: 約 60 件（観点 3 をすでに満たしている）
- **DOM 変化 primary（`#a-list` 行数等）**: 約 65 件
- **通知のみ**: 1 件（要書き直し）
- **その他（軽微変化等）**: 約 4 件

**合計 96% のテストはすでに primary semantic assertion を持っている**。Stage 2 の主要作業は「ヘルパーで構造を強制」することであり、ロジックの大幅書き換えではない。

### 4.5 Stage 2 着手前条件（v1.3 §Stage 2 着手前条件）

- ✅ shogi リポジトリ内の業務モデル文書：`docs/specs/_business_model.md` は**未存在**。
- ⚠️ Stage 2a 着手前に最小業務モデル文書を作成する必要あり。最低限文書化対象：
  - `state.players.A` / `state.players.B` の構造（フィールド：`name`, `cls`, `member_id`, `member`, `grade` 等）
  - `master.member` のフィールド（`id`, `name`, `yomi`, `last_class`, `attendance_count`, `tournament_ids`, `deleted`, `deleted_at` 等）
  - localStorage キー：`shogi_v4`（player state）/ `shogi_branch_master`（master）
  - 主要業務フロー：受付 → 登録 → 対局 → 結果出力 → エクスポート

### 4.6 ヘルパー実装方針（Stage 2a 設計予告）

`test/helpers/expectClickable.js` に v1.3 §4.2 7 段階検証を実装。
`test/helpers/clickAndExpectChange.js` に v1.3 §4.3.2 仕様 + `getStateSnapshot()` 標準実装を提供：

```javascript
// test/helpers/clickAndExpectChange.js
const { expect } = require('@playwright/test');
const { expectClickable } = require('./expectClickable');

async function getStateSnapshot(page) {
  return page.evaluate(() => ({
    state: window.state ? JSON.parse(JSON.stringify(window.state)) : null,
    localStorage: {
      shogi_v4: localStorage.getItem('shogi_v4'),
      shogi_branch_master: localStorage.getItem('shogi_branch_master'),
    },
    url: { pathname: location.pathname, hash: location.hash, search: location.search },
  }));
}

async function clickAndExpectChange(locator, expectedChange) {
  await expectClickable(locator);
  const page = locator.page();
  const before = await getStateSnapshot(page);
  await locator.click(); // force: true 禁止
  const after = await getStateSnapshot(page);
  await expectedChange(before, after);
}
```

### 4.7 Stage 4 への申し送り（A-4.2 回帰テスト）

- 73961d3（A-4.2 マージコミット）に対して、本レポート §3 で特定した観点 2 違反を構造的に検出するテストを追加
- primary assertion: `expect(state.players.A.at(-1).cls).toBe('A')`
- 期待動作: 73961d3 で **赤** になる（production CSS の `pointer-events: none` 等を expectClickable が検出）
- v1.3 §Stage 4 完了基準に従う

---

## 5. 結論

- 観点 1 / 観点 4：**ほぼ問題なし**（force click 0 件、UI バイパス 3 件は意図的）
- 観点 2：**130/130 件全該当 = A-4.2 すり抜けの単独主因**
- 観点 3：**ほぼ満たされているが showMsg のみ 1 件あり要書き直し**
- 観点 5：**軽微（first()/nth() 多用）、Stage 2 でセレクタ統一推奨**

**Stage 2 ヘルパー導入により 96% のテストはラップ置換のみで対応可能、残り 4% を完全書き直し**。「偽陽性なし」フォールバックは不要（観点 2 全該当のため）。

Stage 1 完了 → Stage 2 着手準備完了。Stage 2a 着手前に L0 業務モデル文書（`docs/specs/_business_model.md`）の最小版を別作業として整備が必要。
