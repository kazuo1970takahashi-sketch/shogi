# SHOGI-TOUR-PDF-FILENAME-MVP-001 結果メモ

- 日付: 2026-06-15
- ブランチ: `feat/shogi-tour-pdf-filename-mvp-001`（base = `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`）
- 種別: 最小実装（ファイル名生成のみ）。PR #204 とは独立。

## 目的
PDF（印刷帳票）保存時の既定ファイル名を、後から「どの大会・どの帳票・どのクラスか」分かる名前に改善する。

## 命名規約（新）
`<YYYYMMDD>_<大会名>_<クラス名(単一クラス時のみ)>_<帳票種別>`（空パートは除外）

帳票種別は既存の PDF 出力種類に合わせる（新種別は作らない）:

| 関数 | 帳票種別 | クラス名 |
| --- | --- | --- |
| `printResults` | 対戦成績 | 出力が単一クラスのときのみ付与 |
| `printPairings` | 現在の組み合わせ | 出力が単一クラスのときのみ付与 |
| `downloadReport` | 報告書 | 付けない（大会全体のサマリ帳票のため） |

出力例（架空）:
- `20260614_御殿場支部将棋大会_A級_対戦成績`（単一クラス）
- `20260614_御殿場支部将棋大会_対戦成績`（複数クラス＝クラス名なし）
- `御殿場支部将棋大会_報告書`（開催日未設定）

> 拡張子 `.pdf` はブラウザのPDF保存動作で付与される。印刷帳票は Blob(text/html)+`window.open()`+`print()` 方式で生成物は HTML のため、アプリ側で `.pdf` は保証しない（既定ファイル名 = `<title>`）。

## 変更内容
- 純粋ヘルパー 3 つを追加（`buildMasterExportFilename` の直後）:
  - `sanitizeFilenamePart(value)` — `\ / : * ? " < > |` と制御文字(0x00-0x1F)・空白類を `_` に置換、連続 `_` を畳み込み前後 `_` を除去。ハイフンは有効文字として保持。`null`/非文字列は `''`。
  - `buildPdfFilename(parts, fallback)` — パートを sanitize し空を除外して `_` 連結。全空なら fallback（fallback も空なら `shogi`）。
  - `pickSingleClassLabel(classNames)` — 実質 1 クラスのときだけクラス名を返す（複数/0 は `''`）。
- `printResults` / `printPairings` / `downloadReport` の `fileTitleName` を上記ヘルパー経由に置換。

## 仕様判断
- **日付先頭**: タスクの例（`20260614_..._順位表.pdf`）に合わせ `YYYYMMDD` を先頭に。ファイル一覧で時系列ソートしやすく「過去大会履歴・運営記録」に資する。
- **クラス名は単一クラス時のみ**: 3 経路はいずれも全クラスを 1 つの PDF にまとめる。クラスが 1 つに定まるときだけ付与（タスクの「可能な範囲で」に対応）。
- **帳票種別は既存名を維持**: タスク例の「順位表 / 結果 / 対局カード / 参加者一覧」は例示。本アプリの実 PDF 出力は 対戦成績 / 現在の組み合わせ / 報告書 の 3 種のみ。既存ボタン文言と整合する名前を採用（リネームしない）。
- **空パートの除外**: 旧 `downloadReport` は開催日未設定時に `<大会名>__報告書`（二重 `_`）になっていた。`buildPdfFilename` で解消。

## 非変更（スコープ外）
PDF 本文・レイアウト・印刷 CSS・`state`（保存データ）構造・スマホ順位表・ふりがな・過去大会履歴・JSON 保存名（`saveDataAsFile` / `buildMasterExportFilename`）は一切変更していない。

## テスト
- 追加: `test/test_pdf_filename_mvp_001.js`（構造 / 単体 / 結合、計 50 件 PASS）。`run_tests.sh` に実行ブロックを追加。
- `bash test/run_tests.sh shogi_v4.html`: JS 構文チェック・スモーク全 PASS、本テスト 50/50 PASS。
- 既知の環境起因 FAIL: `data_*.json` 堅牢性確認は当 orphan clean base に `data_*.json` fixture が未追跡のため glob がリテラル化し Python が FileNotFound で失敗する（本変更と無関係・既存）。
