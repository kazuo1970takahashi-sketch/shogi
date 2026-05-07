# shogi A-4.5 過去参加者パネル 3 セクション分離 + F7 簡素化 + bug fix #7 Codex Gate Review 依頼

**作成日時**: 2026-05-07 23:10 JST
**対象 PR**: feat(a-4-5): 過去参加者パネル 3 セクション分離 + 行 2 段レイアウト + F7 簡素化 + bug fix #7
**ブランチ**: `feat/a-4-5-pp-panel-3section`(main `a66f418` 起点 = A-4.4 revert 後 = A-4.3 等価)
**仕様書**: `docs/specs/20260507_2253_shogi_a_4_5_pp_panel_3section_mini_spec_v1.md`
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge(髙橋さんの実機目視確認 OK 後)

---

## 1. 背景・目的

A-4.4(2 セクション + 行内「現在:Xクラス」テキスト追加)は Codex Gate Review A 判定 + e2e 517 緑で main マージしたが、**iPhone 375px 実機で行レイアウトが破綻**して revert(`a66f418`)。

A-4.5 は 3 セクション分離(Aクラス済 / Bクラス済 / 未エントリー)に再設計し、**行内要素は A-4.3 と同等に保つ**ことでレイアウト破綻を防ぐ方針…ですが、**実装中に A-4.3 main 時点から既に iPhone 375px で行内が縦書き化していた潜在問題を検出**したため、行レイアウトを 2 段化(1 段目=氏名 + ボタン、2 段目=メタ情報)で根本対応しました。

mobile-375 project の visual regression を新設し、A-4.4 失敗の真因(`chromium-desktop` project の setViewportSize では iOS Safari 特有 rendering を再現できない)を構造的に解決しました。

---

## 2. 変更内容

### 2.1 production 修正 (`shogi_v4.html`、+76 / -31 行)

| # | 機能 | 場所 | 行 |
|---|---|---|---|
| 1 | `buildPastParticipantsPanelHtml` を 3 セクション分離 + ボタン色強調撤廃 | L1262 周辺 | +30 / -20 |
| 2 | `renderPpRow` 行 2 段レイアウト(1 段目=氏名+A/B、2 段目=ふりがな+前回+日付) | helper 内 | +27 / -8 |
| 3 | `buildMasterEditModalHtml` から「未設定」radio 撤廃 | L1716 | -1 |
| 4 | `bindMasterEditModalEvents`: A/B 以外を未指定扱い + 保存後 `renderPastParticipantsPanel` | L1923 / 保存処理末尾 | +6 / -1 |
| 5 | `applyMasterMemberEdit`: バリデーションから null 受理を撤廃 | L846 | +1 / -1 |

### 2.2 設計判断と仕様書からの逸脱

**(a) 行 2 段レイアウト(仕様書 §2.2「行内要素は A-4.3 と同じ」からの拡張)**

仕様書 §2.2 は「行内要素は A-4.3 と同じ(氏名 + 前回:Xクラス + 日付 + A/B ボタン)」と規定。当初これに従い実装したが、**実 DOM で iPhone 375px の氏名 span を測定したところ width=34px / height=105px = 完全縦書き化を確認**(`row.locator('span').first()` 実測)。これは A-4.4 だけでなく A-4.3 main 時点から発生していた既存問題。

仕様書 §4 #6「iPhone 375px 幅で行レイアウトが破綻しない(氏名が縦書き化しない)」を満たすため、行レイアウトを **2 段化(1 段目=氏名+A/Bボタン、2 段目=ふりがな+前回:Xクラス+日付)** に変更。

- 「行内要素」の集合自体は仕様 §2.2 と同じ(要素を増やさず・減らさず)
- 段構造のみ変更(配置は A-4.3 と非互換だが「縦書き化しない」という機能要件を優先)
- 実測: 氏名 span が width=190px / height=21px に修正(横書き 1 行)

**(b) `pp-row-main` / `pp-row-meta` wrapper 導入 + `pp-name` クラス**

行を `display:flex; flex-direction:column` で 2 段化し、各段を `<div class="pp-row-main">` / `<div class="pp-row-meta">` でラップ。氏名 span に `pp-name` クラスを付与。これにより:
- 既存テスト互換: `.pp-row` data-mid、`.pp-check` 隠しマーカー、`.pp-add-btn`、`.pp-last-class` はそのまま
- メタ情報セクション全体に `flex-wrap:wrap` を付与し、長いふりがな + 前回 + 日付が溢れる場合の保険

**(c) mobile-375 project の visual regression 構造**

A-4.4 失敗の構造的真因:
- `visual_regression.spec.js` は `chromium-desktop` project でのみ実行(`mobile-375` project から `testIgnore`)
- 同 spec 内で `setViewportSize({ width: 375 })` で 375px は撮っていたが、**`devices['Desktop Chrome']` ベースの project では iOS Safari の rendering(タッチイベント、`hasTouch`、UA、`overflow-wrap` の挙動)が再現されない**

A-4.5 で対策:
- 新規 `visual_regression_mobile.spec.js` を **`mobile-375` project でのみ撮影**(`chromium-desktop` 側に `testIgnore` 追加)
- `mobile-375` project は `hasTouch:true`、iPhone UA、deviceScaleFactor:2 で構成
- snapshot 2 枚追加: 過去参加者パネル(3 セクション + A/B 済 + 未エントリー + 長氏名)、F7 編集モーダル(A/B 2 択)

これにより A-4.4 失敗パターンが構造的に検出可能になる(Codex Devil's Advocate §6 #1 への直接回答)。

### 2.3 e2e (`shogi_app_a4_5.spec.js` 新規 +209 行、a4_3 / a4_2 spec 修正)

- 新規 13 件(a4_5):
  * §2.1 3 セクション分離(初期件数 / 該当なし / A エントリー / クロスセクション変更 / 強調撤廃 / 行内要素 / 検索横断、計 7 件)
  * §4 #6 iPhone 375px 行レイアウト(縦書き化検出: 通常氏名 / 長氏名 / ボタンタップターゲット、計 3 件) — **bounding box 実測 + 閾値で縦書き化を機械的に検出**
  * §2.7 bug fix #7 即時反映、計 1 件
  * §2.6 `applyMasterMemberEdit` null 撤廃(invalid / undefined → 既存維持、計 2 件)
- a4_3 spec 差分管理(仕様書 §3.6 通り):
  * §2.1 現クラス強調 4 件削除
  * §2.5 #1 を A/B 2 択 fieldset に書き換え
  * §2.5 補強を「radio 2 つ + value="" 不在」に書き換え
  * §2.5 #2 を「A/B どちらも未 checked」に書き換え
  * §2.5 #4 「未設定 → null 保存」を削除し「null 維持(A/B 未選択保存)」に置換
- a4_2 spec: 過去参加者パネルの highlight 系 2 件削除(サジェスト側 highlight は §2.5 サジェスト UI 変更なしで維持)
- visual_regression_mobile.spec.js 新規(mobile-375 project で 2 件)
- visual_regression: reg-pp-panel-1280 を 3 セクション + 2 段レイアウトで更新

---

## 3. 受け入れ条件 検証結果(仕様書 §4 1〜11)

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | 過去参加者パネルが「Aクラス済 / Bクラス済 / 未エントリー」3 セクションに分離 | e2e §2.1 セクション存在 | ✅ |
| 2 | 各セクションヘッダ件数表示 + 0 件は「該当なし」 | e2e 「初期 0/0/3」「該当なし 2 セクション」 | ✅ |
| 3 | 検索・クイックフィルタが 3 セクション横断で機能 | e2e 「検索 山 → 3 セクション横断」 | ✅ |
| 4 | ボタン色強調撤廃 | e2e 「pp-add-btn-active / -highlight 0 件」 | ✅ |
| 5 | 行内要素は A-4.3 と同じ(集合)、「現在:Xクラス」追加なし | e2e 「pp-current-class 0 件」 | ✅ |
| 6 | **iPhone 375px 幅で行レイアウトが破綻しない(氏名が縦書き化しない)** | e2e §4 #6 bounding box 実測 + mobile-375 visual snapshot | ✅ |
| 7 | F7 編集モーダルの前回クラス radio が A/B 2 択 | e2e a4_3 「radio 2 つ + value="" 不在」 | ✅ |
| 8 | F7 保存後リロードなしで反映(bug fix #7) | e2e a4_5 §2.7 即時反映 | ✅ |
| 9 | 既存 + 新規 e2e すべて緑(visual --update-snapshots) | `npx playwright test` | ✅ **525 passed** |
| 10 | **mobile-375 visual snapshot が追加されている** | `ls test/e2e/visual_regression_mobile.spec.js-snapshots/` | ✅ 2 ファイル |
| 11 | 単体 `npm test` | | ✅ **PASS=50, FAIL=0** |
| 12 | iPhone 実機目視確認 | 髙橋さん | (本レビュー後、merge 前必須) |
| 13 | Codex Gate Review A 判定 | 本レビュー | (本依頼) |

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `6ac6c53` | docs(a-4-5): 仕様書 v1 配置 |
| 2 | `bccc740` | feat(a-4-5): 過去参加者パネル 3 セクション分離 + ボタン色強調撤廃 |
| 3 | `27cba99` | feat(a-4-5): F7 編集モーダル A/B 2 択化 + bug fix #7 |
| 4 | `0224e75` | feat(a-4-5): 行 2 段レイアウト + e2e 整備 + mobile-375 visual regression 追加 |

---

## 5. レビュー観点(必読)

### 5.1 通常観点

1. **§4 受け入れ条件 1〜11 の検証根拠が e2e で十分か**
2. **行 2 段レイアウト(仕様書 §2.2 からの拡張)の妥当性**:
   - 仕様 §2.2「行内要素は A-4.3 と同じ」を「**要素集合は同じ・段構造は変える**」と解釈した判断の妥当性
   - 仕様 §4 #6「縦書き化しない」を満たすための最小修正であるか / 過剰でないか
   - 既存 e2e セレクタ(`.pp-row`、`.pp-add-btn`、`.pp-last-class`、`#ppPanel [data-mid]`)互換性
3. **mobile-375 visual regression の構造が再発防止に効くか**:
   - `chromium-desktop` から `testIgnore: /visual_regression_mobile\.spec\.js/` 追加
   - `mobile-375` project の `hasTouch:true` + iPhone UA で iOS Safari 挙動を十分に再現できるか
4. **A-4.4 e2e 削除/書き換え/維持の判断**(仕様書 §3.6 と一致しているか)
5. **`pp-row-meta` の `flex-wrap:wrap` + ふりがな・前回・日付の溢れ挙動**

### 5.2 Devil's Advocate 質問(仕様書 §6 必須回答)

1. **mobile-375 visual regression snapshot が実際に追加されているか確認**: `ls test/e2e/visual_regression_mobile.spec.js-snapshots/` で 2 ファイル存在(過去参加者パネル + F7 モーダル)。長氏名「長谷川一郎太郎兵衛」を含む状態で撮影。
2. **3 セクション空状態の UI 視覚負荷**: 大会開始時は A 済 0 / B 済 0 / 未エントリー N 名で「該当なし」が 2 つ並ぶ。視覚負荷が高い場合は A-4.6 で「件数 0 のセクションを折りたたむ」UX 案を別途検討。
3. **A クラス済 → B 変更時のクロスセクション移動**: e2e §2.1 「クロスセクション」テストで動作確認(山田太郎 A 済 → B ボタン → confirm OK → B 済セクションへ移動)。「行が消えた!」と感じないかは実機目視確認の責務(セクションヘッダ件数増減で気づきは可能)。
4. **F7 保存後の再描画 race**: `renderMasterTab()` → `renderPastParticipantsPanel()` の順序実行。state は同期的、saveBranchMaster → loadBranchMaster の間に F2 saveData が割り込む可能性は user タップ間隔と比べて極小。
5. **A-4.4 e2e の差分管理**: 削除 4 件(現クラス強調)/ 書き換え 4 件(F7 fieldset, radio 補強, last_class=null 初期選択, 未設定→null 保存)/ 維持(§2.2 ケース 1〜3, §2.4, §3.1)で仕様 §3.6 と一致。
6. **行内要素の幅見積もり**: iPhone 375px viewport で行レイアウト破綻しない数値根拠:
   - **A-4.5 では 2 段化により 1 段目の氏名 span は flex:1 で 190px+ を確保**(実測)
   - 1 段目固定要素: padding 24px + A 44px + B 44px + gap 16px = 128px。残り 247px が氏名(山田太郎 4 文字 ≒ 56px、長氏名 9 文字 ≒ 126px、いずれも横書き 1 行で収まる)
   - 2 段目はメタ情報のみ(font 12px、`flex-wrap:wrap` 許可)で破綻リスクなし

---

## 6. 想定される A 判定外要素(自己点検)

- **仕様書 §2.2 からの拡張**(行 2 段化): 仕様作者は「A-4.3 と同じレイアウトなら破綻しない」と想定していたが、A-4.3 自体に潜在問題があったため拡張が必要。Codex 判断仰ぎたい。
- **bounding box 実測テストの閾値**: 通常氏名 < 60px、長氏名 < 100px は経験則。理論的には行高 ≒ 21px × 折り返し行数なので、3 行 = 63px / 5 行 = 105px が境界。閾値は妥当だが緩すぎないか。
- **mobile-375 project の `isMobile:false` 設定**: 既存の playwright.config.js を踏襲。`isMobile:true` にすると更にモバイル emulation 強化されるが、既存の他 e2e への副作用回避のため踏襲。

---

**END**
