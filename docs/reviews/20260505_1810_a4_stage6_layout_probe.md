# A-4 Stage 6 レイアウト揺れ 調査ログ

**作成日時**: 2026-05-05 18:10 JST
**Phase**: A-4 Stage 6（スマホレイアウト揺れ修正）
**仕様書**: `docs/specs/20260505_1746_shogi_design_phaseA4_v2.md` §3.6
**判定**: **A-4.1 として別PR化（実機 iPhone Safari での再調査が必要）**

---

## 1. 現象（A-4 仕様書 §3.6.1 より再掲）

iPhone 16 Plus（論理幅 430px）でタブを切り替えると、各タブの左右マージンが微妙に異なって見える。

## 2. Playwright（Chromium）での計測結果

`test/e2e/_a4_layout_probe.spec.js` を一時的に作成し、375 / 414 / 430px の各 viewport で各タブ（reg / tournament / result / master）の以下を計測した：

- `document.documentElement.scrollWidth`
- `document.body.scrollWidth`
- `window.innerWidth`
- `getBoundingClientRect().right > innerWidth + 0.5` の要素一覧（offenders）
- 削除済み表示ON時のマスタタブ
- マスタ編集モーダル表示時

### 結果サマリー（Chromium）

| viewport | tab | docScrollW | bodyScrollW | innerW | offenders |
|---|---|---|---|---|---|
| 375px | reg | 375 | 375 | 375 | 0件 |
| 375px | tournament | 375 | 375 | 375 | 0件 |
| 375px | result | 375 | 375 | 375 | 0件 |
| 375px | master | 375 | 375 | 375 | 0件 |
| 375px | master+showDeleted | 375 | 375 | 375 | — |
| 375px | master+editModal | 375 | 375 | 375 | — |
| 414px | 全タブ | 414 | 414 | 414 | 0件 |
| 430px | 全タブ | 430 | 430 | 430 | 0件 |

**Chromium では 375 / 414 / 430px のいずれの viewport / タブでも、scrollWidth と innerWidth が完全に一致し、横方向にはみ出す要素は存在しない。**

## 3. 想定原因の精査（§3.6.2 v2 拡張 10項目）

CSS / HTML を grep して各想定原因を精査した：

| # | 想定原因 | shogi_v4.html での該当 | 判定 |
|---|---|---|---|
| 1 | コンテンツ幅の不揃い | `.container { max-width: 1100px; margin: 0 auto; padding: 10px 8px }` 対称 | 該当なし |
| 2 | 横スクロール発生 | `overflow-x:auto` はテーブル側のみ | 表面上は問題なし |
| 3 | box-sizing の不整合 | `*{ box-sizing: border-box }` で全要素統一 | 問題なし |
| 4 | viewport meta | `<meta name="viewport" content="width=device-width, initial-scale=1.0">` | 問題なし |
| 5 | Safari セーフエリア | `safe-area-inset-*` 未使用、ただし iOS Safari 既定挙動として影響しうる | **iPhone Safari 実機要確認** |
| 6 | table / flex item の min-width | `.player-row-main { min-width:0 }`（既設） | 問題なし |
| 7 | button group の white-space:nowrap | `pp-yomi-tabs` は `flex-wrap:wrap` | 問題なし |
| 8 | **100vw / scrollbar / safe-area** | `100vw` の使用なし、ただし `body { min-height: 100vh }` あり | **iPhone Safari URL バー伸縮で 100vh が変動する可能性大** |
| 9 | transform / position fixed | モーダルは `position:fixed; width:100%` で問題なし | 問題なし |
| 10 | display 切替による幅計算 | `showTab()` で `pane-*` を `display: block/none` 切替 | **iPhone Safari でタブ切替時に URL バー伸縮を引き起こしている可能性あり** |

### 仮説（最有力）

**`body { min-height: 100vh }` と iPhone Safari の URL バー自動伸縮の相互作用**：
- タブ切替で `pane-*` が `display:none → block` に変わるとコンテンツ高さが変化
- iPhone Safari は URL バーをスクロールに応じて表示/非表示する
- URL バーの表示/非表示で `100vh` の実際の値が変わり、**viewport 幅がスクロールバー有無で 1-2px 揺れる**ことがある

これは Chromium では再現せず、iPhone Safari 実機でのみ観測される既知の挙動。

## 4. 修正候補（A-4.1 別PR で検証予定）

仕様書 §3.6.3 禁止事項により、以下は **原因不特定のまま行わない**：
- `body { overflow-x: hidden }` だけで隠す
- 全体 CSS を推測で大きく書き換える

A-4.1 で検証すべき修正候補（実機計測しながら最小修正を選ぶ）：

1. `body { min-height: -webkit-fill-available }` を追加（URL バー伸縮対策）
2. `html { scrollbar-gutter: stable }` を追加（スクロールバー有無による幅変動対策）
3. `.container { width: 100% }` を明示（max-width だけでなく）
4. タブ panes すべてに同一 `min-height` を設定（display 切替時の高さ変動を抑える）

## 5. A-4 本体 PR で実施する範囲

仕様書 §3.6.4 / Should Fix 5 を反映：

- **1px 許容 e2e テスト**を `test/e2e/shogi_app_a4.spec.js` に追加（回帰防止）
  - 各タブ（reg / tournament / result / master）で `scrollWidth - innerWidth ≤ 1`
  - 削除済み表示ON時のマスタタブ
  - マスタ編集モーダル表示時
  - 375px / 430px の両方で検証
- 本調査ログを `docs/reviews/` に記録（Nice to Have 3 反映）

## 6. A-4.1 で残す作業

- iPhone 16 Plus 実機で Safari Web Inspector を使い、揺れ発生時の `documentElement.scrollWidth` / `window.innerWidth` を実測
- §4 の修正候補から最小修正を選定し適用
- A-4.1 として独立 PR で提出

## 7. 結論

**Stage 6 の「揺れ修正」自体は A-4.1 別PR化**。理由：

- Chromium での計測では原因が再現せず（iPhone Safari 固有）
- 実機が手元になく、原因特定不能
- §3.6.3 禁止事項：「原因未特定のまま `overflow-x: hidden` だけで隠さない」「全体 CSS を推測で大きく書き換えない」
- §4 中止条件：「原因不特定 or 全体 CSS への大きな波及が判明したら A-4.1 として別 PR 化」

A-4 本体 PR には、**回帰防止用の 1px 許容 e2e テスト**と本調査ログのみを含める。
