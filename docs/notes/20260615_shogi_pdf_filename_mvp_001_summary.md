# SHOGI-TOUR-PDF-FILENAME-MVP-001 完了メモ

- 日付: 2026-06-15
- ブランチ: `feature/shogi-tour-pdf-filename-mvp-001`（base: `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`）
- 種別: 最小実装（ファイル名生成のみ。PDF 本文・レイアウト・保存データ構造は不変）

## 目的
PDF 保存時のファイル名を、後から運営記録・過去大会履歴と突き合わせやすい名前へ改善する。

## 仕様（新形式）
`{YYYYMMDD}_{大会名}[_{クラス名}]_{種別}`（拡張子なしの基底名）

- 例: `20260614_架空将棋大会_Aクラス_対戦成績`
- 例: `20260614_架空将棋大会_組み合わせ`（複数クラス一括出力時はクラス名なし）
- 例: `20260614_架空将棋大会_報告書`（報告書は大会全体の帳票なのでクラス名なし）
- 開催日が未入力なら日付トークンを省略（先頭 `_` にならない）: `架空将棋大会_Aクラス_対戦成績`
- OS 禁止文字 `\ / : * ? " < > |` ・制御文字・前後空白は `sanitizeFilenamePart` で除去
- 全トークンが空でも `将棋大会` に fallback

クラス名は「その出力に単一クラスしか含まれない」ときのみ付与する（`可能な範囲で`）。
現状の出力は全クラス一括（printResults / printPairings）または大会全体（downloadReport）のため、
単一クラスを特定できる場合だけ付き、複数クラス時は付かない。

## 帳票種別トークン（既存の画面文言と一致させる方針）
| 出力経路 | 画面/見出し（不変） | ファイル名 種別 |
|---|---|---|
| `printResults` | 対戦成績 | `対戦成績` |
| `printPairings` | 現在の組み合わせ | `組み合わせ` |
| `downloadReport` | 大会報告書 | `報告書` |

依頼の種別例（結果 / 対局カード / 順位表 / 参加者一覧）は「例」であり、spec は
「既存の PDF 出力種類に応じて分かる名前」を求めている。既存のボタン/見出し文言と一致させる方が
運用者に分かりやすく、変更も最小になるため、既存トークン（対戦成績 / 組み合わせ / 報告書）を維持した。

## ⚠ PR #204 の決定を意図的に置き換えている点（レビュー要確認）
PR #204 (LIVE-MOBILE-SCOREBOARD-001) は同じファイル名を `{YYYY年M月度}{大会名}{種別}` 形式へ改善し、
「アンダースコア区切り＋8桁日付は URL 由来に見える」として**意図的に避けて**いた
（`test_report_print_006.js` D1-c が `_`・8桁日付の非含有を保証していた）。
本タスクは運用者の明示要望により、その月度形式を `{YYYYMMDD}_…` 形式へ**置き換える**。
競合する既存テストの assert は新仕様へ更新済み（他の保証は維持）。

## 変更ファイル
- `shogi_v4.html`
  - `buildSafePdfFilename(parts, sep)`: 区切り文字を追加（既定 `''` で後方互換、本機能は `'_'`）
  - `buildTournamentHeldDateCompact()`: 新規。`YYYY-MM-DD`→`YYYYMMDD`、未入力/不正は `''`
  - `buildTournamentPdfFilename(kind, className)`: 新形式へ。`className` 引数を追加
  - `printResults` / `printPairings`: 単一クラス時のみクラス名を helper へ渡す
  - `downloadReport`: コメントのみ（filename は helper 経由で自動的に新形式）
  - ※`buildPdfDocHeaderHtml` / 本文見出し / 対象月ラベルなど **PDF 本文は一切不変**
- `test/test_pdf_filename_mvp_001.js`: 新規（22 assert）。クラス名 単/複・日付欠落 fallback・サニタイズ等
- `test/test_report_print_006.js`: C/D セクションを新仕様へ追従
- `test/test_report_ux_{004,005,006,006b,006c,007a,007b}.js`: downloadReport の `<title>` 期待値を新仕様へ
- `test/run_tests.sh`: 新テストを登録

## テスト結果
`bash test/run_tests.sh shogi_v4.html` → **PASS=97 / FAIL=0 / WARN=0**
（ファイル名は印刷ダイアログの「PDF に保存」候補として `<title>` に現れる。検証は実 HTML を
eval して printResults/printPairings/downloadReport を呼び `<title>` を直接 assert する Node 単体テストで実施。）

## やっていないこと（スコープ厳守）
PDF レイアウト/本文変更・保存データ構造変更・スマホ星取表への介入・ふりがな・過去大会履歴実装・
main/production 直接変更・release/deploy・branch 削除・実データ/PII 閲覧 — いずれも未実施。
拡張子 `.pdf` はブラウザ依存のためコードで付与しない（基底名のみ生成）。
