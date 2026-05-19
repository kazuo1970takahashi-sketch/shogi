# REPORT-PRINT スマホ実機 印刷 / PDF 保存 確認結果 — iPhone Safari / iOS 18

- **Task ID**: `REPORT-PRINT-005A-RESULT`
- **作業種別**: docs-only / 実機確認結果記録（iPhone Safari / iOS 18）
- **作成日**: 2026-05-19
- **HEAD**: REPORT-PRINT-005A（PR #163）squash merge 後の main = `b882b11` から派生
- **位置づけ**: REPORT-PRINT-005A（`docs/notes/20260519_report_print_mobile_check_results_template.md`）の結果記録テンプレートに基づく、**iPhone Safari / iOS 18 の実機確認結果**
- **関連 docs**:
  - 手順本体: [docs/notes/20260519_report_print_mobile_check_procedure.md](20260519_report_print_mobile_check_procedure.md)（REPORT-PRINT-005）
  - 結果記録テンプレート: [docs/notes/20260519_report_print_mobile_check_results_template.md](20260519_report_print_mobile_check_results_template.md)（REPORT-PRINT-005A）
  - 関連 closure: [docs/notes/20260519_report_print_completion_summary.md](20260519_report_print_completion_summary.md)（REPORT-PRINT-004）
- **重要**: 本ファイルは **ユーザー（髙橋さん）報告ベース** の事実記録である。想像や推測は含めない。未確認の導線・端末は `Not Tested` のまま残す。

---

## 1. 概要

### 1.1 このドキュメントの位置づけ

- REPORT-PRINT-005A の結果記録テンプレートに基づく、iPhone Safari / iOS 18 の **実機確認結果**
- 確認済みなのは **RP-03 `printPairings()` のみ**
- **RP-01 `downloadReport()` / RP-02 `printResults()` は未確認**（`Not Tested`）
- **Android Chrome / PC Chrome / iPhone Chrome / PC Edge / macOS Safari も未確認**（`Not Tested`）
- 想像や推測ではなく、ユーザー報告ベースの記録である

### 1.2 非スコープ

- 実装変更（`shogi_v4.html` 未変更）
- テスト変更 / VRT baseline 変更 / package / workflow 変更
- PDF 直接生成 / Web Share API / HTML 保存導線 / メール・LINE 共有 / print helper 共通化
- UI ボタン文言変更
- 未確認の RP-01 / RP-02 結果を想像で埋めること
- Android / PC の結果を想像で埋めること

---

## 2. 確認環境

| 項目 | 値 |
|------|----|
| 確認者 | 髙橋 |
| 確認日 | 2026-05-19 |
| 端末 | iPhone |
| OS | iOS 18 |
| ブラウザ | Safari |
| アプリ | SHOGI-TOUR `main` 最新版 |

---

## 3. 結果サマリ

| 導線 ID | 導線 | 関数 | 結果 | 理由 |
|---------|------|------|------|------|
| **RP-01** | 報告書 | `downloadReport()` | `Not Tested` | 未確認 |
| **RP-02** | 対戦成績 | `printResults()` | `Not Tested` | 未確認 |
| **RP-03** | 現在の組み合わせ | `printPairings()` | **Minor Issue** | 画面表示と共有ボタン経由のプリントは可能だが、自動印刷ダイアログは出ず、PDF 保存はできない / 未確認 |

---

## 4. RP-03 `printPairings()` 詳細

| 確認項目 | 結果 | メモ |
|----------|------|------|
| 新規タブ / 別画面 | OK | 「現在の組み合わせを印刷 / PDF 保存」をクリックすると、対戦表の画面出力がされる |
| 自動印刷ダイアログ | Minor Issue | 印刷ダイアログは **自動では出ない** |
| ブラウザ共有ボタンからのプリント | OK | Safari の共有ボタンから「プリント」は出る |
| PDF 保存 | Minor Issue | PDF 保存はできない、または導線を確認できない |
| entry_no｜氏名 | OK | 出ている |
| 操作 UI 混入 | OK | 勝敗ボタンなど操作 UI は混入していない |
| 全クラス現在ラウンド | OK | 全クラスの現在ラウンドが出ている |
| 日本語表示 | Minor Issue | 文字化けは報告なし。ただし **氏名の文字数により開始位置がズレる** |
| アプリに戻れるか | `Not Tested` | 未確認 |
| 2 回連続実行 | `Not Tested` | 未確認 |

### 4.1 ユーザー所感（参考メモ）

- ボタン押下後、「現在の組み合わせ印刷」ではなく **「別画面に対戦表が表示される」印象** がある
- 共有ボタン経由でプリント自体は出るため、運用上はそのまま使える

---

## 5. 判定

### 5.1 総合判定: **Minor Issue**

### 5.2 Blocker ではない理由

- Safari の **共有ボタン経由でプリントは可能**
- 表示内容自体は **おおむね出ている**（entry_no｜氏名 / 全クラス現在ラウンド / 操作 UI 混入なし）
- 文字化けなし

### 5.3 Minor Issue とする理由

- ボタン押下だけでは **印刷ダイアログが自動表示されない**
- **PDF 保存導線が成立していない**（または導線を確認できない）
- 氏名の文字数により **開始位置がズレる**
- ユーザー体感として「印刷」ではなく **「別画面表示」に見える**

---

## 6. 後続候補

iPhone Safari の Minor Issue を踏まえた後続タスク候補。**いずれも今回は着手しない**。

- **`REPORT-PRINT-005B`** — スマホ向け注意書き追加
  - 運営マニュアル / `index.html` / アプリ内ヘルプに「iPhone Safari では共有ボタン経由でプリント」「自動印刷ダイアログが出ない端末がある」等の注意書きを追加するかの設計
  - Minor Issue を運用回避するための docs 側対応
- **`REPORT-PRINT-005C`** — auto print fallback UI 棚卸し
  - `win.print()` が iPhone Safari で自動発火しない問題への対応設計
  - 別ウィンドウ内に「印刷する」ボタン配置案 / 共有ボタン誘導案内など
- **`REPORT-PRINT-005D`** — PDF 保存 / HTML 保存導線の要件棚卸し
  - 「印刷ダイアログ → PDF 保存」が成立しない端末向けに、HTML 直接保存（`<a download>`）や Web Share API による代替経路の要件整理
- **`REPORT-PRINT-003 follow-up`** — `printPairings()` の氏名表示位置ズレ調整
  - 印刷専用 HTML の grid / table 整形で、氏名文字数による開始位置ズレを抑える設計

### 6.1 残端末の実機確認（未実施）

本ファイルでは記録しないが、続いて確認が必要な対象:

- **RP-01 報告書** `downloadReport()`（iPhone Safari / Android Chrome / PC Chrome ほか）
- **RP-02 対戦成績** `printResults()`（iPhone Safari / Android Chrome / PC Chrome ほか）
- iPhone Safari の **RP-03 続き**（アプリに戻れるか / 2 回連続実行）
- Android Chrome（DEV-02 P1）
- PC Chrome（DEV-03 P1）
- iPhone Chrome（DEV-04 P2）
- PC Edge（DEV-05 P2）
- macOS Safari（DEV-06 P2）

---

## 7. 明示的にやらないこと

- 今回は **実装変更しない**（`shogi_v4.html` 未変更）
- PDF 直接生成（jsPDF / html2canvas / pdfmake）は **しない**
- Web Share API は **実装しない**
- HTML 保存導線は **実装しない**
- メール / LINE 共有は **実装しない**
- print helper の共通化は **しない**
- UI ボタン文言は **変更しない**
- 未確認の RP-01 / RP-02 結果を **想像で埋めない**
- Android / PC の結果を **想像で埋めない**
- 後続実装タスク（REPORT-PRINT-005B / 005C / 005D / 007 / SHOGI-LEARN ほか）は **着手しない**

---

## 8. 関連ファイル

- 実機確認手順本体: [docs/notes/20260519_report_print_mobile_check_procedure.md](20260519_report_print_mobile_check_procedure.md)（REPORT-PRINT-005）
- 結果記録テンプレート: [docs/notes/20260519_report_print_mobile_check_results_template.md](20260519_report_print_mobile_check_results_template.md)（REPORT-PRINT-005A）
- REPORT-PRINT closure: [docs/notes/20260519_report_print_completion_summary.md](20260519_report_print_completion_summary.md)（REPORT-PRINT-001 〜 003 集約 + 後続候補整理）
- 実装:
  - [shogi_v4.html](../../shogi_v4.html) — `downloadReport()` / `printResults()` / `printPairings()`
- テスト:
  - [test/test_report_print_003.js](../../test/test_report_print_003.js) — `printPairings()`
