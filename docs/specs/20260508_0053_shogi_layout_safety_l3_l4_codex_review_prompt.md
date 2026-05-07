# shogi Layout Safety L-3 + L-4 mini Sprint Codex Gate Review 依頼

**作成日時**: 2026-05-08 00:53 JST
**対象 PR**: feat(layout-safety): L-3 + L-4 ヘルパー追加 + 既存 e2e 適用(production code 変更ゼロ)
**ブランチ**: `feat/layout-safety-l3-l4`(main `ebe6675` 起点 = DevSecOps v2.0 Slim v1.1 配置後)
**仕様書**: `docs/specs/20260508_0044_shogi_layout_safety_l3_l4_mini_spec_v1.md`
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge

---

## 1. 背景・目的

A-4 系 Postmortem v2 で抽出された Layout Safety の P1 対策 L-3, L-4 を shogi に実装。L-1(mobile/desktop 両 VRT)+ L-2(bounding box 実測)では検出できない以下を補強:

| 未カバー領域 | 対策 |
|---|---|
| 要素のはみ出し(`scrollWidth > clientWidth`) | **L-3 expectNoHorizontalOverflow** |
| 行高さ・要素並び制約違反 | **L-4 expectHeightInRange / expectLeftOf** |

A-5 系着手前の基盤強化として、production code(`shogi_v4.html`)を**一切変更せず**、テスト基盤のみ強化。

---

## 2. 変更内容

### 2.1 新規ヘルパー (`test/helpers/layout-assertions.js`、+109 行)

3 関数を export(汎用設計、将来 monorepo 化時に切り出し可能):

- **`expectNoHorizontalOverflow(target, options)`**:
  - target が Locator → `scrollWidth - clientWidth`、Page → `documentElement.scrollWidth - innerWidth`
  - tolerance(default 1px)で scrollbar の微小誤差吸収
  - Locator 判定は `typeof target.locator === 'function' && typeof target.page !== 'undefined'`
- **`expectHeightInRange(locator, { maxHeight, minHeight=0, label })`**:
  - `boundingBox().height` を取得して minHeight ≤ height ≤ maxHeight を assert
  - 縦書き化検出(maxHeight 超過で fail)等に使う
- **`expectLeftOf(leftLocator, rightLocator, options)`**:
  - `leftBox.x + leftBox.width <= rightBox.x` で横並び制約 assert(隣接 = 等号成立で OK)

### 2.2 単体テスト (`test/helpers/layout-assertions.test.js`、+120 行)

`page.setContent` で最小 HTML を流し込み、既存 helper test と同パターンで 15 件:

- `expectNoHorizontalOverflow` 6 件: page/locator 正常 + 異常 + tolerance edge(0 / 1)
- `expectHeightInRange` 5 件: 正常 + max 超過 + min 未満 + 引数欠落 + **縦書き化シナリオ**(細い要素に多文字 → 105px 折り返し → maxHeight 60 で fail)
- `expectLeftOf` 4 件: 正常隣接 + 正常離間 + 逆転 + オーバーラップ

### 2.3 既存 e2e への適用

**`shogi_app_a4_5.spec.js` §4 #6**:
- 既存 height assert 2 件を `expectHeightInRange` に置き換え(可読性向上、ロジック同等)
- 新規 L-3 ケース 3 件:
  - 通常氏名で過去参加者パネルが viewport 内
  - 長氏名で過去参加者パネルが viewport 内
  - F7 編集モーダルが viewport 内

**`shogi_app_a4_6.spec.js` §2.1**:
- 新規 L-3 ケース 1 件: A 済セクション行 + page 全体で水平 overflow なし(`pp-row-main` も個別検証)
- 新規 L-4 ケース 1 件: 氏名 span < A ボタン < B ボタン の横並び制約(`expectLeftOf` で 2 段)

### 2.4 production code 不変の確認

```
$ git diff main..HEAD -- shogi_v4.html
(出力なし)
```

`shogi_v4.html` の差分は **0 行**。本 Sprint は test 専用変更。

---

## 3. 受け入れ条件 検証結果(仕様書 §4 1〜9)

| # | 観点 | 結果 |
|---|---|---|
| 1 | `layout-assertions.js` が新規 + 3 関数 export | ✅ |
| 2 | `layout-assertions.test.js` 緑(15 件) | ✅ |
| 3 | a4_5 §4 #6 に `expectNoHorizontalOverflow` 3 ケース追加 | ✅ |
| 4 | a4_5 §4 #6 既存 height assert を `expectHeightInRange` に置き換え | ✅(2 件置換) |
| 5 | a4_6 §2.1 に `expectNoHorizontalOverflow` 1 + `expectLeftOf` 1 追加 | ✅ |
| 6 | production code 変更ゼロ(`git diff main..HEAD -- shogi_v4.html` 空) | ✅ |
| 7 | 既存 + 新規 e2e 緑 | ✅ **579 passed**(従来 539 + helper 単体 15 + a4_5 新規 3 + a4_6 新規 2 + …) |
| 8 | 既存 visual snapshot 変更なし(production 不変のため) | ✅ |
| 9 | Codex Gate Review A 判定 | (本依頼) |

**単体テスト**: `npm test` → PASS=50, FAIL=0(layout-assertions.test.js は Playwright e2e として実行されるため npm test には含まれず e2e 側 579 にカウント)

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `de771c5` | docs(layout-safety): 仕様書 v1 配置 |
| 2 | `20878e4` | feat(layout-safety): layout-assertions.js + .test.js 新規 |
| 3 | `07ab675` | test(layout-safety): a4_5 + a4_6 spec に L-3 + L-4 適用 |

---

## 5. レビュー観点(必読)

### 5.1 通常観点

1. **§4 受け入れ条件 1〜8 の検証根拠が十分か**
2. **ヘルパー関数シグネチャの設計**:
   - `expectNoHorizontalOverflow` が Locator / Page を 1 つの関数で受ける形は妥当か(別関数化案も考慮)
   - `expectHeightInRange` の `options.label` を必須にすべきか
3. **既存 `a4_2.spec.js` L454-461 の `expectNoOverflow` 重複**: 本 PR では a4_2 spec を触っていないが、将来統合すべきか別 PR で議論
4. **適用範囲の絞り込み**: 仕様 §2.1 通り 4 箇所に限定したが、参加者登録パネル等への展開は別 Sprint(過剰スコープ回避)

### 5.2 Devil's Advocate(仕様書 §6)必須回答

1. **false positive 防止**: `expectNoHorizontalOverflow` の tolerance=1px は妥当か?
   - 回答: 既存 `a4_2.spec.js` の `expectNoOverflow` も `<=1` 許容で運用実績あり。chromium-desktop / mobile-375 両 project で 539→579 件全緑、tolerance 関連の false positive 観測ゼロ。
2. **閾値の根拠**: `expectHeightInRange` の maxHeight 値はどう決めるか?
   - 回答: A-4.5 で確立した実測ベース閾値(通常氏名 60px / 長氏名 100px)を仕様 §3.4 通り再利用。本ヘルパー化により定数を関数引数で明示化、ロジックは既存と同等。
3. **適用範囲の網羅性**: 4 箇所で十分か?
   - 回答: 本 Sprint は L-3 + L-4 の **基盤確立** がゴール。マスタ一覧 / 参加者登録パネル等への展開は L-3/L-4 が安定運用された後に別 PR で。仕様 §2.1 / §2.2 適用範囲に従い 4 箇所に限定。
4. **ヘルパーの汎用性**: 関数シグネチャは他プロジェクト展開で破綻しないか?
   - 回答: shogi 固有の DOM セレクタ・state 構造への依存ゼロ。Playwright Locator/Page を受ける純粋なレイアウト assert で、bp-matching(Spreadsheet Layout)/ file-organizer(Output Layout)等 UI なしプロジェクトでは適用しない構造(DevSecOps v2.0 Slim v1.1 §2 参照)。
5. **A-4.4 の轍を踏んでいないか(production 不変確認)**:
   - 回答: `git diff main..HEAD -- shogi_v4.html` で **空出力**を確認(commit 履歴: `de771c5`(docs)→ `20878e4`(test/helpers/)→ `07ab675`(test/e2e/))。production 修正コミット皆無。
6. **単体テストの fail ケース十分性(Mutation Testing 観点)**:
   - 回答: 各関数につき正常系 + 異常系 + edge を網羅。特に `expectHeightInRange` の「縦書き化シナリオ」は実装が `<=` を `<` に変えても、`maxHeight` を「上限超過」として扱わなければ pass しない設計。`expectLeftOf` の「オーバーラップ」ケースは `<=` を `<` に変えると隣接ケース(右端 = 左端)が fail するため、半開区間 vs 閉区間の Mutation を識別可能。

---

## 6. 想定される A 判定外要素(自己点検)

- **`a4_2.spec.js` の `expectNoOverflow` ローカル実装と本ヘルパーの重複**: 本 Sprint では統合しないが、将来 `a4_2.spec.js` の該当箇所も `expectNoHorizontalOverflow` に統一すべき(別 PR で議論)。
- **L-5 / L-6 / L-7 未実施**: 仕様 §1 通り本 Sprint は L-3 + L-4 のみ。height/width 比併用 / WebKit + iPhone project / maxDiffPixelRatio 厳格化は将来必要時に追加。
- **`expectHeightInRange` の minHeight=0 デフォルト**: 「下限ゼロは事実上 minHeight 制約なし」。下限制約が必要な箇所では呼び出し側で明示。デフォルトを `1` 等にする案もあるが、現状の使い方(縦書き化検出 = 上限のみ)に合致。

---

**END**
