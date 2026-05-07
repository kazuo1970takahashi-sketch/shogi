# shogi A-4.6 エントリー済ボタン色強調復活 Codex Gate Review 依頼

**作成日時**: 2026-05-07 23:45 JST
**対象 PR**: feat(a-4-6): エントリー済の現クラスボタンに色強調を復活(A-4.4 失敗の轍を踏まない)
**ブランチ**: `feat/a-4-6-pp-button-active-color`(main `cf7a970` 起点 = A-4.5 マージ後)
**仕様書**: `docs/specs/20260507_2333_shogi_a_4_6_pp_panel_button_active_color_mini_spec_v1.md`
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge(髙橋さんの実機目視確認 OK 後)

---

## 1. 背景・目的

A-4.5 main マージ後の実機テストで髙橋さん指摘:

> AB ボタンは選択したら色が変わるなどの工夫が欲しい。タップすればテキストは変わるし、エントリー場所の移動もあるが、ユーザーが選択したものがどれかが分かりにくい。

A-4.5 では色強調(`pp-add-btn-active` / `pp-add-btn-highlight`)を撤廃し視覚言語をセクション位置のみに一本化したが、実運用ではセクション間移動の動きが小さく、押下フィードバックとして弱いと判明。

A-4.4 は「現在:Xクラス」テキスト**行内追加**で iPhone 375px の flex 破綻 → revert された経緯がある。本案件は **行内要素を一切増やさず、ボタンの style(背景色 + ✓ + bold + active クラス)のみ変更** することで、レイアウト破綻リスクなしに視覚フィードバックを強化する。

---

## 2. 変更内容

### 2.1 production 修正 (`shogi_v4.html`、+25 / -5 行)

`renderPpRow` の **ボタン描画部分のみ** 変更。行構造・行内要素は A-4.5 と完全同一。

| 状態 | 背景色 | 文字色 | テキスト | font-weight | クラス |
|---|---|---|---|---|---|
| A 登録済 A ボタン | `#bbdefb` | `#0d47a1` | `A ✓` | bold | `pp-add-btn pp-add-btn-active` |
| B 登録済 B ボタン | `#ffe0b2` | `#5d4037` | `B ✓` | bold | `pp-add-btn pp-add-btn-active` |
| 上記以外 | `#fff` | `#1976d2` | `A` or `B` | normal | `pp-add-btn` |

- ボーダー色も A=濃青 / B=濃橙に変更してセクション識別を強化
- `pp-add-btn-active` クラスを復活(e2e で active 状態を locate するため)
- `pp-add-btn-highlight`(前回参加クラス強調、薄琥珀色)は撤廃のまま維持(二重ハイライト混乱回避)

### 2.2 設計判断

**(a) 行構造・行内要素は A-4.5 と完全同一**(Devil's Advocate §6 #5 自己 diff 検証済)

`git diff cf7a970..HEAD -- shogi_v4.html` の renderPpRow 部分:
- DOM 要素の追加/削除: **0 件**(`<div>` / `<span>` / `<button>` の追加・削除なし)
- 段構造変化: なし(`flex-direction:column` 親 + `pp-row-main` + `pp-row-meta` 維持)
- 変更は `<button>` 内の `class` / `style` / 内部テキスト 属性値のみ
- 結論: **A-4.4 で失敗した「行内要素追加→ 375px flex 破綻」のパターンとは構造的に異なる**

**(b) `pp-add-btn-highlight` は復活しない**

仕様書 §2.3 通り「前回参加クラス強調」は撤廃のまま。理由:
- 前回参加クラスは 2 段目「前回:Xクラス」テキストで表現済み
- 現クラス active(色付き)だけが視覚言語として成立(二重ハイライト混乱回避)
- a4_5 spec の関連テストは「pp-add-btn-highlight 撤廃継続」を assert に書き換え

**(c) visual snapshot 更新の明示性確保**

ボタン色変更は `maxDiffPixelRatio: 0.05` の閾値内に収まり `--update-snapshots` では更新されないため、**該当 snapshot 3 枚を明示削除 → 再生成** で仕様書 §3.4「ボタン色付きで更新」を確実に反映:
- `reg-pp-panel-375-chromium-desktop-darwin.png`
- `reg-pp-panel-1280-chromium-desktop-darwin.png`(再生成では binary 同等で git diff には出ず)
- `mobile-pp-panel-3sections-375-mobile-375-darwin.png`

### 2.3 e2e (`shogi_app_a4_6.spec.js` 新規 +132 行、a4_5 spec 1 件書き換え)

- 新規 7 件(a4_6):
  * §2.1 A 登録済 A ボタン: `pp-add-btn-active` + 背景 #bbdefb + 「A ✓」+ bold(getComputedStyle 実測)
  * §2.1 B 登録済 B ボタン: `pp-add-btn-active` + 背景 #ffe0b2 + 「B ✓」+ bold
  * §2.1 未エントリーセクション両ボタン: active なし、白背景、テキスト「A」「B」
  * §2.1 A 登録済 B ボタン(別クラス): active なし、白背景
  * §2.1 A → B クラス変更時の色遷移(A active 解除 + B active 出現)
  * Devil's Advocate §6 #2: active 状態でも min 44x44 維持(border 1px のまま実効サイズ不変)
  * Devil's Advocate §6 #4: A 済セクション内は必ず A active かつ B 非 active(整合性ループ assert)
- a4_5 spec 1 件書き換え: 「ボタン色強調撤廃」→「pp-add-btn-highlight 撤廃継続」
- visual snapshot: `reg-pp-panel-375` + `mobile-pp-panel-3sections-375` を再生成(binary 差分あり)

---

## 3. 受け入れ条件 検証結果(仕様書 §4 1〜9)

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | A 登録済 A ボタンに #bbdefb + 「A ✓」+ active クラス | e2e a4_6 §2.1 #1 getComputedStyle 実測 | ✅ |
| 2 | B 登録済 B ボタンに #ffe0b2 + 「B ✓」+ active クラス | e2e a4_6 §2.1 #2 | ✅ |
| 3 | 未エントリーの両ボタンに色なし・「A」「B」のみ | e2e a4_6 §2.1 #3 | ✅ |
| 4 | エントリー済の別クラスボタンに色なし | e2e a4_6 §2.1 #4 | ✅ |
| 5 | 行内要素は A-4.5 と同じ(「現在:Xクラス」追加なし) | a4_5 spec の `pp-current-class` 不在 assert + 自己 diff | ✅ |
| 6 | iPhone 375px で行レイアウト破綻なし | a4_5 spec §4 #6 縦書き化検出 + mobile-375 visual | ✅ |
| 7 | 既存 + 新規 e2e すべて緑 | `npx playwright test` | ✅ **539 passed** |
| 8 | mobile-375 visual snapshot がボタン色付きで更新 | `ls -la` で更新時刻新しい + binary 差分 | ✅ |
| 9 | 単体テスト緑 | `npm test` | ✅ **PASS=50, FAIL=0** |
| 10 | iPhone 実機目視確認 | 髙橋さん | (本レビュー後、merge 前必須) |
| 11 | Codex Gate Review A 判定 | 本レビュー | (本依頼) |

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `b8b979c` | docs(a-4-6): 仕様書 v1 配置 |
| 2 | `36ea3fb` | feat(a-4-6): エントリー済の現クラスボタンに色強調を復活 |
| 3 | `8a48bac` | test(a-4-6): a4_6 spec 新規 + a4_5 spec 書き換え + visual snapshot 更新 |

---

## 5. レビュー観点(必読)

### 5.1 通常観点

1. **§4 受け入れ条件 1〜9 の検証根拠が e2e で十分か**
2. **production diff の最小性**(+25/-5 行は妥当か)
3. **`pp-add-btn-highlight` 撤廃継続の妥当性**(前回参加クラス強調は 2 段目テキストで十分か)
4. **visual snapshot 強制再生成の妥当性**(`maxDiffPixelRatio:0.05` 閾値内に収まる変化を「明示更新」する判断の根拠)

### 5.2 Devil's Advocate 質問(仕様書 §6 必須回答)

1. **mobile-375 visual snapshot がボタン色付きで実際に更新されているか**:
   - `ls -la test/e2e/visual_regression_mobile.spec.js-snapshots/mobile-pp-panel-3sections-375-mobile-375-darwin.png` で更新時刻確認(2026-05-07 23:41 = A-4.6 commit 直前再生成)
   - git log で binary 差分が commit `8a48bac` に含まれることを確認

2. **ボタンサイズが背景色追加で変化していないか**:
   - `min-width:44px; min-height:44px` 維持(L1294 確認)
   - border は **1px のまま**(色のみ変更、太さは不変)→ 実効サイズ変化なし
   - e2e 「active 状態でも min 44x44 を満たす」テストで box.width/height >= 44 を assert

3. **A → B クラス変更時の色遷移**:
   - e2e 「A → B クラス変更時の色遷移」テストで動作確認済(A active 解除 + B active 出現)
   - confirm OK → `changePlayerClass` → `state.players` 移動 → renderRegList → renderPastParticipantsPanel(再描画)→ B 済セクションの行に B active 反映

4. **二重視覚言語(セクション位置 + ボタン色)の整合性**:
   - `currentRegMap[fm.id]` は `state.players` ベースで導出 → セクション分類と active 状態は同じソースから派生
   - **理論上、A 済セクション内で「A ボタン non-active」は不可能**(currentCls === 'A' なら必ず aActive=true)
   - e2e 「A 済セクション内は必ず A active かつ B 非 active」でループ assert
   - 再描画 race: renderPastParticipantsPanel は同期的に DOM 全置換、レース不可

5. **A-4.4 の轍を踏んでいないか(自己 diff 検証)**:
   - 自己検証コマンド: `git diff cf7a970..HEAD -- shogi_v4.html | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)"`
   - **DOM 要素の追加/削除: 0 件**(rowHtml の `<div>` / `<span>` / `<button>` の構造行に追加・削除なし)
   - 段構造変化: なし(`flex-direction:column` 親 + `pp-row-main` + `pp-row-meta` 維持)
   - 変更は `<button>` 内の `class` / `style` / 内部テキスト 属性値のみ
   - **A-4.4 で失敗した「行内要素追加で 375px flex 破綻」とは構造的に異なる**(色変更は flex layout に影響しない)
   - mobile-375 visual snapshot で再発防止網も維持

---

## 6. 想定される A 判定外要素(自己点検)

- **visual snapshot の `--update-snapshots` で更新されない問題**: `maxDiffPixelRatio:0.05` の閾値が大きすぎて binary 同等と判定された。本 PR は手動削除 → 再生成で対処したが、根本対策(閾値を 0.01 に下げる等)は別 PR で議論候補。
- **「現在:Xクラス」テキスト追加せず、ボタン色のみで十分か**: 本仕様書は「ボタン色だけで視覚フィードバック十分」前提だが、実機目視確認で「色だけだと弱い」フィードバックが出れば A-4.7 で再検討。

---

**END**
