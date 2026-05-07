# shogi Layout Safety L-3 + L-4 mini Sprint 仕様書 v1

**作成日時**: 2026-05-08 00:44 JST
**ベース commit**: `ebe6675`(DevSecOps v2.0 Slim v1.1 配置後の main HEAD)
**想定工数**: 2〜3 時間(L-3 + L-4 統合 mini Sprint)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**規模**: 軽量(production code 変更ゼロ、test/helpers + 既存 e2e 適用のみ)

---

## §0 ユーザーストーリー

- **US-1(受付者)**: 大会受付で iPhone 375px 画面を操作したとき、ボタンや文字が画面端からはみ出して操作不能にならない
- **US-2(受付者)**: 過去参加者パネルや参加者登録パネルで、行高さや要素並びが想定外に崩れない(A-4.4 と同種の障害が再発しない)

---

## §1 背景・目的

A-4 系 Postmortem v2 で抽出された **Layout Safety** の P1 対策 L-3, L-4 を shogi に実装する。現状の L-1(mobile/desktop 両 VRT)+ L-2(bounding box 実測 = 縦書き化検出)では以下が検出できない:

| 未カバー領域 | 該当対策 |
|---|---|
| 要素のはみ出し(`scrollWidth > clientWidth`) | **L-3** |
| 行高さ・要素並び制約違反 | **L-4** |

A-5 系着手前に基盤強化として L-3 + L-4 を入れることで、「画面レイアウトのチェックもできないテスト」状態を解消する。

L-5(height/width 比併用)、L-6(WebKit + iPhone project)、L-7(maxDiffPixelRatio 厳格化)は本 Sprint には含めず、必要時に追加する。

---

## §2 機能仕様

### 2.1 L-3: Overflow 検出ヘルパー

**新規ヘルパー**: `test/helpers/layout-assertions.js`(新規ファイル)

```javascript
/**
 * 要素または page 全体に水平 overflow が発生していないことを assert。
 * scrollWidth > clientWidth で水平はみ出しを検出。
 * @param {Locator|Page} target - Playwright Locator または Page
 * @param {object} [options]
 * @param {number} [options.tolerance=1] - 許容誤差 px(scrollbar 等の微小誤差吸収)
 */
async function expectNoHorizontalOverflow(target, options = {}) { ... }
```

**仕様**:
- scrollWidth と clientWidth を取得して `scrollWidth - clientWidth > tolerance` なら fail
- tolerance はデフォルト 1px(scrollbar 表示時の微小誤差吸収)
- target が Locator の場合はその要素、Page の場合は `document.documentElement` を見る

**適用範囲**(本 Sprint で適用する e2e):
- `test/e2e/shogi_app_a4_5.spec.js` の §4 #6(iPhone 375px 行レイアウト)に **3 ケース追加**:
  - 過去参加者パネルが viewport 内に収まる(通常氏名)
  - 過去参加者パネルが viewport 内に収まる(長氏名)
  - F7 編集モーダルが viewport 内に収まる
- `test/e2e/shogi_app_a4_6.spec.js` の §2.1(エントリー済ボタン色強調)に **1 ケース追加**:
  - エントリー済セクションの行が viewport 内に収まる

### 2.2 L-4: Layout assertion ヘルパー

**新規ヘルパー**: `test/helpers/layout-assertions.js`(L-3 と同一ファイル)

```javascript
/**
 * 要素の高さが指定範囲内であることを assert(行高さ制約)。
 * @param {Locator} locator
 * @param {object} options
 * @param {number} options.maxHeight - 高さの上限 px
 * @param {number} [options.minHeight=0] - 高さの下限 px
 */
async function expectHeightInRange(locator, options) { ... }

/**
 * 要素の bounding box から、要素 A が要素 B より左にあることを assert(横並び制約)。
 * @param {Locator} leftLocator
 * @param {Locator} rightLocator
 */
async function expectLeftOf(leftLocator, rightLocator) { ... }
```

**仕様**:
- `expectHeightInRange`: `boundingBox().height` を取得して範囲内かチェック
- `expectLeftOf`: 両要素の `boundingBox()` から `leftBox.x + leftBox.width <= rightBox.x` を assert

**適用範囲**(本 Sprint で適用する e2e):
- `test/e2e/shogi_app_a4_5.spec.js` の §4 #6 で既に行高さ assert 済の箇所を **`expectHeightInRange` に置き換え**(可読性向上)
- `test/e2e/shogi_app_a4_6.spec.js` に **1 ケース追加**:
  - エントリー済セクションの 1 段目で氏名 span が A/B ボタンより左にある(`expectLeftOf`)

---

## §3 実装方針

### 3.1 Step 0: ブランチ作成 + 仕様書配置(Claude Code 担当)

### 3.2 Step 1: 事前調査(Claude Code 担当)
- `test/helpers/` 配下の既存ヘルパー構造を確認
- 既存 e2e の bounding box 関連 assert 箇所を grep
- 既存テストの import パターン確認

### 3.3 Step 2: ヘルパー実装

**新規ファイル**: `test/helpers/layout-assertions.js`
- `expectNoHorizontalOverflow(target, options)`
- `expectHeightInRange(locator, options)`
- `expectLeftOf(leftLocator, rightLocator)`
- `module.exports` で 3 関数 export

**ヘルパーの単体テスト**: `test/helpers/layout-assertions.test.js`(新規)
- 各関数について「pass ケース」「fail ケース」「edge ケース(scrollbar tolerance 等)」を 2〜3 件ずつ
- 既存の test/helpers/ 配下のテストと同じパターン(npm test で実行)

### 3.4 Step 3: 既存 e2e への適用

- a4_5 spec §4 #6: `expectNoHorizontalOverflow` 3 ケース追加 + `expectHeightInRange` への置き換え
- a4_6 spec §2.1: `expectNoHorizontalOverflow` 1 ケース追加 + `expectLeftOf` 1 ケース追加

production code (`shogi_v4.html`) は **一切変更しない**。

### 3.5 Step 4: 受け入れ条件検証 + PR + Codex Gate Review 依頼

---

## §4 受け入れ条件

| # | 観点 | 検証方法 |
|---|---|---|
| 1 | `test/helpers/layout-assertions.js` が新規作成され、3 関数 export されている | ファイル存在確認 + grep |
| 2 | `test/helpers/layout-assertions.test.js` が新規作成され、各関数の単体テスト緑 | `npm test` PASS=53(既存 50 + 新規 3 ファイル分の追加分) |
| 3 | a4_5 spec §4 #6 に `expectNoHorizontalOverflow` 3 ケース追加 | grep + e2e 緑 |
| 4 | a4_5 spec §4 #6 の既存 height assert が `expectHeightInRange` に置き換え | grep |
| 5 | a4_6 spec §2.1 に `expectNoHorizontalOverflow` 1 ケース + `expectLeftOf` 1 ケース追加 | grep + e2e 緑 |
| 6 | production code(shogi_v4.html)は一切変更されていない | `git diff main..HEAD -- shogi_v4.html` が空 |
| 7 | 既存 + 新規 e2e すべて緑(`npx playwright test`) | 539+ passed(新規追加分含む) |
| 8 | 既存 visual snapshot に変更なし(production code 変更ゼロのため) | snapshot diff なし |
| 9 | Codex Gate Review A 判定 | 本仕様書範囲外、PR 後に依頼 |

---

## §5 リスク・移行戦略

### 5.1 false positive リスク

`scrollWidth > clientWidth` は scrollbar 表示時に常に成立する場合がある。**tolerance=1px** をデフォルトにすることで微小誤差を吸収。実機 iPhone Safari では scrollbar が overlay で出るため通常は発生しない。

### 5.2 既存 e2e への影響

**production code は一切変更しない** ため、既存テストの破壊リスクはほぼゼロ。新規 assert 追加のみで、既存 assert は維持(ただし §4 #6 の height assert は `expectHeightInRange` への可読性向上書き換えあり、ロジックは同等)。

### 5.3 ヘルパー設計の汎用性

shogi 専用ではなく **後で他プロジェクトに展開可能**な汎用設計。ただし本 Sprint では shogi の test/helpers/ に配置。将来 monorepo 化や共通ライブラリ化する際に切り出し可能な形で書く。

---

## §6 Devil's Advocate(Codex 必須回答)

1. **false positive 防止**: `expectNoHorizontalOverflow` の tolerance=1px は妥当か?iPhone 375px 実機で scrollbar が出るケースを再現したか?
2. **閾値の根拠**: `expectHeightInRange` の maxHeight 値はどう決めるか?A-4.5 の縦書き化検出閾値(60px / 100px)との整合性は?
3. **適用範囲の網羅性**: 過去参加者パネル / マスタ一覧 / F7 モーダル / 参加者登録パネルすべてに適用すべきか、本 Sprint で絞った 4 箇所で十分か?
4. **ヘルパーの汎用性**: 関数シグネチャは後で他プロジェクト展開しても破綻しないか?
5. **A-4.4 の轍を踏んでいないか**: production code 変更ゼロを確認(`git diff main..HEAD -- shogi_v4.html` が空)
6. **単体テストの十分性**: ヘルパー単体テストの「fail ケース」が実装バグを確実に検出する形になっているか(Mutation Testing 観点)

---

## §7 想定外時の対応

- ヘルパー設計が複雑化したら段階分割(L-3 のみ先、L-4 は別 PR)
- false positive が頻発したら tolerance を再設計、または特定要素にのみ適用
- 既存 e2e の修正が広範囲に及んだら本 Sprint をキャンセルして次セッションへ繰り越し

---

## §8 完了後

L-3 + L-4 完了後、A-5 系着手。L-5 / L-6 / L-7 は将来必要時に追加(現時点では実施しない)。
