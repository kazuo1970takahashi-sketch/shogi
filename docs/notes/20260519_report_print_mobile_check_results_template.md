# REPORT-PRINT スマホ実機 印刷 / PDF 保存 確認結果 記録テンプレート

- **Task ID**: `REPORT-PRINT-005A`
- **作業種別**: docs-only / 実機確認結果記録テンプレート
- **作成日**: 2026-05-19
- **HEAD**: REPORT-PRINT-005（PR #162）squash merge 後の main = `e605cb1` から派生
- **位置づけ**: REPORT-PRINT-005（`docs/notes/20260519_report_print_mobile_check_procedure.md`）の手順に従って実機確認した結果を後から記録するための **空のテンプレート**
- **関連 docs**:
  - 手順本体: [docs/notes/20260519_report_print_mobile_check_procedure.md](20260519_report_print_mobile_check_procedure.md)
  - 関連 closure: [docs/notes/20260519_report_print_completion_summary.md](20260519_report_print_completion_summary.md)
- **重要**: このファイル時点では **実機確認は実施していない**。すべての結果欄は `Not Tested` / `未確認` の初期値である。実機確認結果を想像で埋めないこと。

---

## 1. 概要

### 1.1 このドキュメントの位置づけ

- REPORT-PRINT-005 で整備したスマホ実機確認手順に基づく **「結果記録テンプレート」** である
- **実機確認結果そのものではない**
- 初期状態ではすべて `Not Tested` / `未確認`
- 実際の確認後に、このテンプレートを **コピーまたは更新** して結果を記録する想定

### 1.2 対象導線

- `downloadReport()` — 報告書を印刷 / PDF 保存
- `printResults()` — 対戦成績を印刷 / PDF 保存
- `printPairings()` — 現在の組み合わせを印刷 / PDF 保存

### 1.3 対象端末（優先度）

- **P1**: iPhone Safari / Android Chrome / PC Chrome
- **P2**: iPhone Chrome / PC Edge / PC Safari

### 1.4 非スコープ

- 実機確認の実施そのもの（このテンプレートは整備のみ）
- 実装変更（`shogi_v4.html` 未変更）
- テスト変更 / VRT baseline 変更 / package / workflow 変更
- PDF 直接生成 / Web Share API / HTML 保存導線 / メール・LINE 共有 / print helper 共通化
- UI ボタン文言変更
- 想像で結果を埋めること

---

## 2. 確認対象導線

| ID | 導線 | 関数 | UI 文言 | 確認目的 | 初期状態 |
|----|------|------|---------|---------|---------|
| **RP-01** | 報告書 | `downloadReport()` | 報告書を印刷 / PDF 保存 | 報告書 13 field + クラス別 top 3 + footer を A4 縦で印刷 / PDF 保存できるか | `Not Tested` |
| **RP-02** | 対戦成績 | `printResults()` | 対戦成績を印刷 / PDF 保存 | 全クラス最終結果（順位 / 氏名 / 各回戦 / A / 負 / B / C）を印刷 / PDF 保存できるか。`<title>` / ファイル名候補が `state.report.title` / `state.report.date` 連動か | `Not Tested` |
| **RP-03** | 現在の組み合わせ | `printPairings()` | 現在の組み合わせを印刷 / PDF 保存 | 全クラスの現ラウンド組み合わせ（entry_no｜氏名 / 第 N 卓 / vs）を印刷 / PDF 保存できるか。操作 UI が混入しないか | `Not Tested` |

---

## 3. 対象端末 / ブラウザ一覧

| ID | 優先度 | 端末 | OS | ブラウザ | 確認者 | 確認日 | 状態 |
|----|--------|------|----|---------|--------|--------|------|
| **DEV-01** | P1 | iPhone | iOS | Safari | 未記入 | 未記入 | `Not Tested` |
| **DEV-02** | P1 | Android | Android | Chrome | 未記入 | 未記入 | `Not Tested` |
| **DEV-03** | P1 | PC | Windows or macOS | Chrome | 未記入 | 未記入 | `Not Tested` |
| **DEV-04** | P2 | iPhone | iOS | Chrome | 未記入 | 未記入 | `Not Tested` |
| **DEV-05** | P2 | PC | Windows | Edge | 未記入 | 未記入 | `Not Tested` |
| **DEV-06** | P2 | Mac | macOS | Safari | 未記入 | 未記入 | `Not Tested` |

---

## 4. 結果サマリ（端末 × 導線）

| 端末 ID | ブラウザ | RP-01 報告書 | RP-02 対戦成績 | RP-03 現在の組み合わせ | 総合判定 | 備考 |
|---------|----------|--------------|----------------|------------------------|----------|------|
| **DEV-01** | iOS Safari | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | 未記入 |
| **DEV-02** | Android Chrome | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | 未記入 |
| **DEV-03** | PC Chrome | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | 未記入 |
| **DEV-04** | iOS Chrome | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | 未記入 |
| **DEV-05** | PC Edge | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | 未記入 |
| **DEV-06** | macOS Safari | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | 未記入 |

判定分類: `OK` / `Minor Issue` / `Blocker` / `Not Tested`（§8 参照）

---

## 5. 詳細記録フォーマット

実機確認 1 回 = 1 行（端末 × 導線の組合せごと）で記録する。初期 3 行はサンプルとして配置するが、結果はすべて `Not Tested`。実結果は **このファイルでは書かない**（コピー or 別ファイル更新で記録する）。

| 確認日 | 確認者 | 端末 ID | 端末 | OS | ブラウザ | 導線 ID | 導線 | 結果 | 詳細 | スクショ/PDF 有無 | 対応要否 |
|--------|--------|---------|------|----|---------|---------|------|------|------|-------------------|---------|
| 未記入 | 未記入 | DEV-01 | iPhone | iOS | Safari | RP-01 | downloadReport | `Not Tested` | 未確認 | 未記入 | 未記入 |
| 未記入 | 未記入 | DEV-02 | Android | Android | Chrome | RP-02 | printResults | `Not Tested` | 未確認 | 未記入 | 未記入 |
| 未記入 | 未記入 | DEV-03 | PC | Win/mac | Chrome | RP-03 | printPairings | `Not Tested` | 未確認 | 未記入 | 未記入 |

詳細欄の記入例（記入時参考、ここでは記入しない）:

- 印刷ダイアログが自動で出た
- 新規タブは開くが `print()` は自動発火しない（手動で印刷メニューを開けば出る）
- PDF 保存は可能
- `afterprint` 後にタブが閉じない（戻る操作でアプリに戻れる）
- 共有ボタン経由でしか保存できない
- popup blocked alert が出る（設定で許可後は OK）

---

## 6. 共通チェック項目

各端末 × 各導線で 1 通り通す共通項目。初期値はすべて未チェック。

- [ ] 新規タブ / 別画面が開く
- [ ] popup blocked alert が出ない
- [ ] blob URL が開く
- [ ] 印刷ダイアログが自動で出る
- [ ] 自動で出ない場合、手動印刷できる
- [ ] PDF として保存できる
- [ ] ファイル名 / PDF タイトルが期待通り
- [ ] 日本語が文字化けしない
- [ ] A4 縦で崩れない
- [ ] 操作ボタンが印刷物に混入しない
- [ ] 改ページが大きく崩れない
- [ ] `afterprint` 後のタブ挙動が許容範囲
- [ ] 戻る操作でアプリに戻れる
- [ ] 2 回連続で実行できる

---

## 7. 導線別チェック項目

### 7.1 RP-01 報告書 / `downloadReport()`

- [ ] 大会名が出る
- [ ] 主催が出る
- [ ] 日付が出る
- [ ] 時間が出る
- [ ] 会場が出る
- [ ] 担当役員が出る
- [ ] 参加人数が出る
- [ ] 収支が出る
- [ ] クラス別入賞者が出る
- [ ] 申し送り事項が出る
- [ ] footer 1 行目が出る
- [ ] footer 2 行目が出る
- [ ] `<title>` / ファイル名候補が `state.report.title` / `state.report.date` と整合する

### 7.2 RP-02 対戦成績 / `printResults()`

- [ ] 「スイス式トーナメント 対戦成績」が出る
- [ ] クラス別表が出る
- [ ] 順位が出る
- [ ] 氏名が出る
- [ ] 各回戦が出る
- [ ] 勝数（A）が出る
- [ ] 負数が出る
- [ ] B が出る
- [ ] C が出る
- [ ] entry_no が表示されない
- [ ] `<title>` / ファイル名候補が `state.report.title` / `state.report.date` と整合する
- [ ] 大会日と印刷日が違う場合、`<title>` / ファイル名候補は **大会日ベース** になる

**注意**: `printResults()` の **本文側に大会日見出しは出ない**。本文 h2 は「スイス式トーナメント 対戦成績」のままである（REPORT-PRINT-005 Codex Must Fix 反映、REPORT-PRINT-006-1 でファイル名・`<title>` のみが state.report.title / date 連動）。

### 7.3 RP-03 現在の組み合わせ / `printPairings()`

- [ ] 大会名が出る
- [ ] 日付が出る
- [ ] 「現在の組み合わせ」見出しが出る
- [ ] クラス名が出る
- [ ] ラウンド番号が出る
- [ ] 第 N 卓が出る
- [ ] entry_no｜氏名 が出る
- [ ] vs が出る
- [ ] 操作ボタンが混入しない（勝敗入力 / 変更 / ▲ 勝 / 再生成 / 確定 / 暫定成績 / 対戦履歴 / 過去結果）
- [ ] 全クラスの現在ラウンドが出る
- [ ] 結果記入欄がない
- [ ] `<title>` / ファイル名候補が `state.report.title` / `state.report.date` と整合する（日付がある場合は `YYYYMMDD` が反映、接尾辞「現在の組み合わせ」付き）

---

## 8. 判定基準

REPORT-PRINT-005（手順本体）§8 と整合。短く再掲。

### 8.1 `OK`

- 印刷 / PDF 保存ができる（自動・手動いずれでも可）
- 主要情報が出る
- 日本語が崩れない
- 操作 UI が混入しない

### 8.2 `Minor Issue`

- 自動 `win.print()` が出ないが、ブラウザメニューから手動で印刷 / PDF 保存できる
- `afterprint` 後にタブが閉じないが、戻る操作 / タブ切替でアプリに戻れる
- 保存ファイル名が `state.report.title` / `date` と完全一致しないが、内容は正しい
- 余白や改ページに軽微な違和感がある

### 8.3 `Blocker`

- 新規タブが開かない
- blob URL が開けない（「ページが見つかりません」等）
- PDF として保存できない
- 日本語が文字化けする
- 操作 UI が紙に混入する
- 主要情報が欠落する
- 印刷後にアプリに戻れない

### 8.4 `Not Tested`

- まだ確認していない

---

## 9. 集計欄（端末別サマリ）

Codex Nice to Have（REPORT-PRINT-005 review）反映。端末ごとに「自動 print 成功 / 手動 print 可 / PDF 保存可 / ファイル名 OK / 文字化けなし / 改ページ OK」を集計し、次の実装判断（auto print fallback UI / 注意書き追加 / HTML 保存導線 / PDF 直接生成）に活かす。

| 端末 ID | 自動 print 成功 | 手動 print 可 | PDF 保存可 | ファイル名 OK | 文字化けなし | 改ページ OK | 総合 |
|---------|------------------|----------------|------------|----------------|---------------|--------------|------|
| **DEV-01** iOS Safari | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` |
| **DEV-02** Android Chrome | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` |
| **DEV-03** PC Chrome | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` |
| **DEV-04** iOS Chrome | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` |
| **DEV-05** PC Edge | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` |
| **DEV-06** macOS Safari | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` | `Not Tested` |

各セルの記入候補: `Yes` / `No` / `N/A` / `Not Tested`

---

## 10. 未確認事項 / メモ

実機確認を進める中で気になった点・運用判断に必要な未解決事項を記録する自由記述欄。初期状態では空。

確認時の観点例（記入時の参考、ここでは記入しない）:

- iPhone Safari で `win.print()` が自動発火しない場合の運用可否（手動メニュー / 共有ボタン経由でも保存できれば運用可能か）
- Android Chrome の PDF 保存導線（メニュー →「印刷」→「PDF として保存」）の確実性
- PC Chrome でのファイル名候補が `<title>` どおりになるか（拡張子・記号の扱い）
- タブが自動で閉じない場合の運営者向け案内要否（戻る or 手動クローズ）
- auto print fallback UI（別ウィンドウ内に「印刷する」ボタンを置く案）が必要か
- HTML 保存導線（`<a download>` で HTML を直接保存）を検討する必要があるか
- 共有ボタン経由でのみ保存できる端末がある場合、運営マニュアルに記載するか

---

## 11. 次アクション

### 11.1 結果記録の流れ

1. このテンプレートを使って実機確認する（DEV-01〜06 を P1 優先で）
2. 実機確認後、結果を docs に記録する（このファイルを更新するか、別ファイルにコピーして記入）
3. §4 結果サマリ / §5 詳細記録 / §9 集計欄 を埋める
4. §10 未確認事項 / メモを更新する

### 11.2 結果に応じた後続判断

- **OK が多い場合**: 現行方式（Blob + `window.open` + `win.print()`）を継続。PDF 直接生成は不要。Web Share API は引き続き Hold。後続実装タスクは起票しない
- **Minor Issue が多い場合**: スマホ向け注意書き追加を検討（後続候補 `REPORT-PRINT-005B`、運営マニュアル / `index.html` への注意書き）
- **Blocker が出た場合**: 実装ではなく **まず原因と再現条件を整理** する。深刻度に応じて以下を順に検討
  1. `REPORT-PRINT-005C` — auto print fallback UI 棚卸し（`win.print()` 自動発火失敗時、別ウィンドウ内に「印刷する」ボタンを置く案）
  2. `REPORT-PRINT-005D` — HTML 保存導線の要件棚卸し
  3. Web Share API（`navigator.share({files})`）の対応端末調査
  4. 最終手段として PDF 直接生成（jsPDF + 日本語フォント）

---

## 12. 明示的にやらないこと

- **実機確認結果を想像で埋めない**（未確認は `Not Tested` のまま）
- 実装変更（`shogi_v4.html` 未変更）
- PDF 直接生成（jsPDF / html2canvas / pdfmake）の実装
- Web Share API の実装
- HTML 保存導線の実装
- メール / LINE 共有の実装
- print helper の共通化
- UI ボタン文言の変更
- VRT baseline の変更
- テスト追加・変更
- `package.json` / `playwright.config.js` / `.github/workflows/` 変更
- 後続実装タスク（REPORT-PRINT-005B / 005C / 005D / 006 / 007 / SHOGI-LEARN ほか）の着手

---

## 13. 関連ファイル

- 実機確認手順本体: [docs/notes/20260519_report_print_mobile_check_procedure.md](20260519_report_print_mobile_check_procedure.md)（REPORT-PRINT-005）
- REPORT-PRINT closure: [docs/notes/20260519_report_print_completion_summary.md](20260519_report_print_completion_summary.md)（REPORT-PRINT-001 〜 003 集約 + 後続候補整理）
- 実装:
  - [shogi_v4.html](../../shogi_v4.html) — `downloadReport()` / `printResults()` / `printPairings()`
- テスト:
  - [test/test_report_print_003.js](../../test/test_report_print_003.js) — `printPairings()`
  - [test/test_rank_print_001.js](../../test/test_rank_print_001.js) — `printResults()` entry_no 非表示
  - [test/test_round_class_start_007.js](../../test/test_round_class_start_007.js) — `printResults()` classes-driven
  - [test/test_report_ux_001.js](../../test/test_report_ux_001.js) 〜 [test_report_ux_007b.js](../../test/test_report_ux_007b.js) — `downloadReport()` 系
