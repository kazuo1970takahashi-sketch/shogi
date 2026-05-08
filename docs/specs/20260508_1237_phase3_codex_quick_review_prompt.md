# Phase 3 F7 UX 改善 Codex Quick Review 依頼

**作成日時**: 2026-05-08 12:37 JST
**対象 PR**: feat(phase3): F7 modal UX (history accordion + caption removal)
**ブランチ**: `feat/phase3-f7-ux-improvement`(main `4c0b10a` 起点 = Phase 2 マージ後)
**仕様書**: `docs/specs/20260508_1218_phase3_f7_ux_improvement_spec.md`(ChatGPT Quick A 判定)
**Plan**: `docs/specs/20260508_1227_phase3_plan.md`(髙橋さん承認済)
**レビュー深度**: **Quick Review**(P0 ではない、観点: 既存挙動破壊なし + L-3 viewport 内表示の達成のみ)
**判定基準**: A 以上で squash merge

---

## 1. 概要

Phase 1 + Phase 2 で F7 編集モーダルの縦長が増し、375x800 viewport で保存/キャンセルが見えない問題が顕在化。Phase 3 で 2 点改善:

1. **履歴情報をアコーディオン化**(▼ 履歴情報を開く / ▲ 履歴情報を閉じる)、デフォルト閉じ
2. **冒頭の説明文削除**(後続フェーズで前回クラス・city が追加され不整合状態になっていた)

機能要件には影響なし、UX 改善のみ。

---

## 2. 変更内容

### 2.1 production 修正(`shogi_v4.html`、+16 / -3 行、コミット `76cba6f`)

| # | 箇所 | 内容 |
|---|---|---|
| A | L1905 説明文 `<p>` | **削除**(`氏名・ふりがな・区分が編集できます。参加履歴は変更されません。`) |
| B | `#me-history` 直前 | トグルボタン挿入: `<button id="me-history-toggle">▼ 履歴情報を開く</button>` |
| C | `#me-history` inline style | `display:none;` 追加(初期閉じ) |
| D | `bindMasterEditModalEvents` 内 | local toggle bind(textContent ▼/▲ + display 切替) |

### 2.2 設計判断

**(a) アコーディオン関数の流用**:既存 `bindPastParticipantsToggle`(init 時 1 度 bind)は **流用不可**(F7 モーダルは開く度に DOM 再生成)。**パターン流用**(`bindMasterEditModalEvents` 内で local bind の数行)を採用、Plan §1.3 で確認済。

**(b) トグル textContent**: 仕様書 §3 表通り「**▼ 履歴情報を開く / ▲ 履歴情報を閉じる**」(明示的)。既存「過去参加者から選ぶ」は短く「▼ 開く / ▲ 閉じる」だが、F7 内部で複数の操作対象がある中で「履歴情報」と明示する方が混同しにくい判断。

### 2.3 e2e (`shogi_phase3_f7_ux.spec.js` 新規 +166 行、既存 2 件修正)

新規 10 件(2 project で計 20 件、全緑):
- §4 #1 初期表示で履歴折りたたみ:hidden + textContent
- §4 #2 トグル動作:▼/▲ 切替 + display 切替 + 履歴内容
- §4 #3 **375x800 viewport 内表示(layout assertion primary)**: `#me-cancel` / `#me-save` の bounding box が `0..800` 内
- §4 #4 説明文削除:`氏名・ふりがな…` / `参加履歴は…` を含まない
- §4 #5 全フィールド保存読込 + 履歴非破壊
- 補強: ▼/▲ プレフィクスが既存と同 vocabulary

既存 e2e 修正 2 件(`#me-history` を直接 visible 前提だったため):
- `shogi_app_a4.spec.js` L337-348: 「履歴情報(初回・最終・回数)が読み取り専用で表示される」
- `shogi_master_list.spec.js` L111-119: 「F7 編集モーダルで履歴情報が引き続き表示される」
両方とも `await page.click('#me-history-toggle')` を assert 前に追加(1 行のみ)。

### 2.4 visual snapshot 2 枚再生成(secondary 検証)

- `master-edit-modal-375-chromium-desktop`
- `mobile-master-edit-modal-375-mobile-375`

履歴折りたたみ + 説明文削除で F7 モーダルが**短くなる**。`maxDiffPixelRatio:0.05` 閾値内で自動 pass するが、Plan §2.3 通り明示削除→再生成で反映の透明性確保(A-4.6 / Phase 1 と同方針)。

### 2.5 結果

- 全 e2e: **702 passed**(従来 682 + phase3 20)
- 単体テスト: **PASS=50, FAIL=0**

---

## 3. 受け入れ条件 検証結果(仕様書 §4 1〜6)

| # | 観点 | 結果 |
|---|---|---|
| 1 | F7 初期表示で履歴情報折りたたみ | ✅ PASS(`Phase 3 §4 #1` 2 件) |
| 2 | ▼ 開く / ▲ 閉じる トグル動作 | ✅ PASS(`§4 #2` 2 件、開閉ループ確認) |
| 3 | 保存/キャンセルが 375px viewport 内 | ✅ PASS(layout assertion primary 2 件 + visual snapshot secondary) |
| 4 | 説明文「氏名ふりがな…」が表示されない | ✅ PASS(`§4 #4`) |
| 5 | 全フィールド保存読込が既存と同じ(既存挙動破壊なし) | ✅ PASS(`§4 #5` 2 件 + 既存 a4 / master_list 修正後 緑維持) |
| 6 | 既存 e2e 緑維持 | ✅ PASS(**702 passed** = 682 + 20) |

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `79f2912` | docs(phase3): Plan Mode output |
| 2 | `76cba6f` | feat(phase3): F7 history accordion + caption removal |
| 3 | `ab750e6` | test(phase3): F7 UX e2e + 既存 2 件修正 + visual snapshot 更新 |

---

## 5. レビュー観点(必読、Quick Review)

### 5.1 既存挙動破壊なしの確認

- F7 全フィールド(氏名 / ふりがな / city / 支部員区分 / 中学生以下 / 前回クラス)の保存読込ロジックは**変更なし**(L1907-1929 全行不変)
- `applyMasterMemberEdit`、`saveBranchMaster`、`bindMasterEditModalEvents` の保存処理は **不変**
- 既存 e2e の `#me-history` 直接参照 2 件はトグル click 1 行追加のみで挙動互換
- 全 702 e2e 緑 = 既存 682(626 + Phase 1 + Phase 2 + その他)+ Phase 3 新規 20 件 → 既存テストへの破壊ゼロ

### 5.2 L-3 viewport 内表示の達成確認

仕様書 §4 #3 の判定方法(ChatGPT Quick Review #3 反映)に従い 2 段検証:

**Primary(layout assertion)**:
- 375x800 で F7 を開く
- `#me-cancel` の bounding box: y >= 0 && y + height <= 800
- `#me-save` 同上
- 両方 PASS ✅

**Secondary(visual snapshot)**:
- mobile-375 project で `mobile-master-edit-modal-375-mobile-375-darwin.png` を再生成
- F7 モーダル全体の縦長が縮んだことを視覚的に確認(履歴折りたたみ + 説明文削除分)

### 5.3 自己点検(Devil's Advocate 不要、念のため)

1. **トグルクリック後に保存ボタン位置が変わる**: 履歴開くと `#me-history` が visible になりモーダルが伸びる。`max-height:85vh; overflow-y:auto` (L1903) で auto scroll 対応済 → 保存ボタンが viewport 外に出ても scroll で到達可能。仕様書 §4 #3 は **初期表示** のみ要求。
2. **既存 e2e 修正 2 件の影響範囲**: トグル click 1 行追加のみ、assert 内容(初回参加 / 最終参加 / 参加回数)は不変。124 件の master 系 spec が全緑維持。
3. **history vs 履歴情報 の表記揺れ**: ボタン textContent は「**履歴情報**」(日本語)、id は `me-history-toggle`(英語)。既存 spec の `#me-history` も英語 id。混乱なし。

---

## 6. 想定される A 判定外要素(自己点検)

- **履歴トグルボタンのデザイン**: 既存「過去参加者から選ぶ」は h2 と並列にボタン配置(L107-109)、F7 の履歴トグルは独立 div + button 配置。視覚パターンの統一は将来改善余地あり(本フェーズでは textContent ▼/▲ 共通のみで担保)。
- **viewport 800px 固定**: e2e は 375x800 固定。実機 iPhone 16 Plus(932px) や iPhone SE(568px) では検証していないが、F7 モーダルが `max-height:85vh; overflow-y:auto` で auto scroll するため致命的問題なし。

---

**END**
