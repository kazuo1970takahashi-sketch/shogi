# REPORT-PRINT スマホ実機 印刷 / PDF 保存 確認手順

- **Task ID**: `REPORT-PRINT-005`
- **作業種別**: docs-only / 実機確認手順整備
- **作成日**: 2026-05-19
- **HEAD**: REPORT-PRINT-006-1 着地後の main（`1a87399`）から派生
- **位置づけ**: REPORT-PRINT-004 closure（`docs/notes/20260519_report_print_completion_summary.md`）§7-D 第一候補として整理された「スマホ実機での印刷 / PDF 保存挙動確認手順 docs」の本体
- **関連 closure**: [docs/notes/20260519_report_print_completion_summary.md](20260519_report_print_completion_summary.md)（REPORT-PRINT-001 / 002 / 003 集約）
- **禁止事項**: 本ドキュメントは確認手順整備のみ。実装変更・テスト変更・実機確認結果記入は行わない。実機確認そのものは別タスク（REPORT-PRINT-005A 候補）として後続で実施する。

---

## 1. 概要

### 1.1 目的

報告書 / 対戦成績 / 現在の組み合わせの「印刷 / PDF 保存」導線が、スマホ実機（iOS Safari / Android Chrome 等）で **実際にどの程度使えるか** を確認するための手順書を整える。

実装変更レビューや unit test では分からない **ブラウザ依存挙動**（popup blocked / blob URL / 新規タブ / `win.print()` 自動発火 / 印刷ダイアログ / PDF 保存 / 共有ボタン経由保存 / `afterprint` 後のタブ挙動 / `<title>` 反映 / 日本語表示 / A4 縦レイアウト / 改ページ）を確認することが狙い。

### 1.2 対象範囲

- 対象は **スマホ / PC 実機での印刷 / PDF 保存導線確認のみ**
- 対象導線は次の 3 つ
  - `downloadReport()`（報告書）
  - `printResults()`（対戦成績）
  - `printPairings()`（現在の組み合わせ）
- 実装レビューや unit test では分からないブラウザ依存挙動を実機で確認するためのもの
- **PDF 直接生成 / Web Share API / HTML 保存導線の実装判断ではなく**、現行方式（Blob + `URL.createObjectURL` + `window.open(_blank)` + `win.print()` + 印刷ダイアログ → 「PDF として保存」）の実用性確認

### 1.3 非スコープ（今回やらないこと）

- 実装変更（`shogi_v4.html`）
- テスト追加・変更（`test/` / `test/e2e/`）
- VRT snapshot 更新
- `package.json` / `playwright.config.js` / `.github/workflows/` 変更
- 後続実装タスクの着手（REPORT-PRINT-005A / 005B / 005C / 005D / 006 / 007 / SHOGI-LEARN ほか）
- 実機確認の実施そのもの（手順整備のみ。記録は本ファイルに直接書き込まない）
- 想像で実機確認結果を埋めること

---

## 2. 対象導線

| 導線 | 関数 | UI 文言 | 期待動作 | 備考 |
|------|------|---------|----------|------|
| 報告書を印刷 / PDF 保存 | `downloadReport()` | 「報告書を印刷 / PDF保存」（`#downloadReportBtn`, result tab） | 報告書フォーム入力値（`state.report` 13 field）+ クラス別 top 3 入賞者 + footer をまとめた A4 縦 1〜2 ページの専用 HTML を新規タブで開き、印刷ダイアログを自動表示。「PDF として保存」を選ぶと `state.report.title` / `state.report.date` 連動のファイル名候補が出る | REPORT-UX-003A 〜 007B-1 で state-as-SoT 化済 |
| 対戦成績を印刷 / PDF 保存 | `printResults()` | 「対戦成績を印刷 / PDF保存」（result tab） | 全クラス最終結果テーブル（順位 / 氏名 / 各回戦 / A / 負数 / B / C）を A4 縦の専用 HTML で新規タブに開き、印刷ダイアログを自動表示。entry_no は表示しない（RANK-PRINT-001）。`<title>` / 保存ファイル名候補は REPORT-PRINT-006-1 で `state.report.title` / `state.report.date` 連動化済 | classes-driven（ROUND-CLASS-START-007） |
| 現在の組み合わせを印刷 / PDF 保存 | `printPairings()` | 「現在の組み合わせを印刷 / PDF保存」（tournament tab 上部） | 全クラスの現ラウンド組み合わせ（クラス名 / ラウンド番号 / 第 N 卓 / entry_no｜氏名 / vs）を A4 縦 grid 2 列の専用 HTML で新規タブに開き、印刷ダイアログを自動表示。結果記入欄なし。操作 UI（変更 / 確定 / 再生成 / リセット / 暫定成績 / 対戦履歴 / 過去結果）は混入しない構造 | REPORT-PRINT-003 / PR #159 |

3 つとも基本方式は次のとおりで共通:

- HTML 文字列を `new Blob([...], {type:'text/html'})` で Blob 化
- `URL.createObjectURL(blob)` で blob URL を発行
- `window.open(blobUrl, '_blank')` で新規タブを開く
- 新規タブ側で `win.print()` を呼ぶ
- 新規タブ側で `afterprint` をハンドルし `win.close()`（タブを閉じる）
- Blob URL は popup blocked 時（`window.open` が null）に **即時 `URL.revokeObjectURL`**、通常時は親側の **`setTimeout(60000)` で 60 秒後に `URL.revokeObjectURL`** される
- popup blocked / 印刷対象なし時は alert + return

---

## 3. 対象端末 / ブラウザ

| 区分 | 端末 | ブラウザ | 優先度 | 理由 |
|------|------|----------|--------|------|
| スマホ | iPhone（iOS 最新） | Safari | **P1** | blob / `window.open` / `win.print()` 周りの差が出やすい。iOS ユーザー比率高い |
| スマホ | Android（最新版） | Chrome | **P1** | スマホ運用の代表ブラウザ。`afterprint` / 印刷ダイアログ挙動の基準 |
| PC | macOS / Windows | Chrome | **P1** | 開発時の基準環境。VRT も Chromium ベース |
| スマホ | iPhone（iOS 最新） | Chrome (iOS) | P2 | iOS Chrome は内部 WebKit。Safari と差が小さい想定だが、共有ボタン経路で差が出る可能性 |
| PC | macOS | Safari | P2 | Mac ユーザー運営想定の補助確認。`<title>` → ファイル名候補の挙動差を確認 |
| PC | Windows | Edge | P2 | Chromium 系の補助確認。Chrome と差はほぼ無い想定だが、PDF プリンタ周りで差が出る可能性 |
| スマホ | Android | Edge | P3 | 利用者が少なければ後回し可。Chrome と挙動差があるかの確認用 |

最低限 P1 の 3 環境（iPhone Safari / Android Chrome / PC Chrome）を埋める。残余時間があれば P2 を埋める。

---

## 4. 事前準備

### 4.1 アプリ側

- `main` の最新版を使う（GitHub Pages の `https://kazuo1970takahashi-sketch.github.io/shogi/`）
- 確認端末でアプリを開き、過去 localStorage が残っていれば必要に応じてリセット
- サンプル大会データを用意し、次の状態を作る:
  - 参加者登録済み（A / B クラス、3 クラス運用を確認する場合は A / B / C）
  - 「大会開始」済み（`state.started === true`）
  - 1 回戦または現在ラウンドが存在（`state.pairings[cls]` 非空）
  - **printPairings** 確認用に、勝敗未入力ラウンドを 1 つ残す
  - **printResults** / **downloadReport** 確認用に、全クラスのラウンドを全消化し最終結果を表示できる状態を別途用意
  - 報告書フォームに `title` / `organizer` / `place` / `date` / `start` / `end` / `sei` / `fuku` / `note` / `prize` / `fax` / `officeName` / `accountingNote` を入力済
- データ整備が手間な場合は、PC で大会データを作って `saveData()` で JSON にし、スマホで「読み込み」する手順で揃える

### 4.2 ブラウザ設定

- pop-up blocking 設定を確認する
  - iOS Safari: 「設定」→「Safari」→「ポップアップブロック」が ON の場合の挙動と OFF 時の挙動を両方確認したい
  - Android Chrome: 「設定」→「サイトの設定」→「ポップアップとリダイレクト」を確認
  - PC Chrome: アドレスバー右端のポップアップ通知バナー有無を確認
- 既定の PDF プリンタ / 保存先を確認しておく
- iOS の「ファイル」アプリで保存場所を選べる状態にしておく

### 4.3 印刷 / PDF 保存導線の把握

- iOS Safari: 新規タブが開いたあと、印刷ダイアログが自動で出ない場合に備えて、共有ボタン（□↑）→「プリント」→ピンチアウトでプレビュー → 共有ボタン→「ファイルに保存」または「Books に追加」までの導線を確認する
- iOS Chrome: アドレスバー右の「…」メニュー →「印刷」/「共有」→「PDF として保存」/「ファイルに保存」までの導線を確認する
- Android Chrome: アドレスバー右の「︙」メニュー →「印刷」→「PDF として保存」→保存先選択までの導線を確認する
- Android Edge: 同様に「︙」→「印刷」を確認する
- PC Chrome / Edge / Safari: 印刷ダイアログでの「送信先」を「PDF に保存」に切り替える操作を確認する

### 4.4 記録準備

- §7 の記録フォーマットを別ファイル（後続タスク REPORT-PRINT-005A 候補で作成）にコピーして使う想定
- スクリーンショット / 保存 PDF を残す場所を決めておく（個人情報を含むため共有方法は要注意）

---

## 5. 共通確認観点

下記をチェックリストとして、各端末 × 各導線で 1 通り通す。

- [ ] ボタンを押して新規タブ / 別画面が開くか
- [ ] popup blocked alert（「ポップアップがブロックされました。新しいタブで開く設定にしてください。」相当）が出ないか
- [ ] popup blocked になった場合、ブラウザ設定で許可後に再実行できるか
- [ ] 新規タブで印刷ダイアログ（または共有プレビュー）が **自動で出るか**
- [ ] 自動で出ない場合、ブラウザメニューから手動で印刷 / PDF 保存できるか
- [ ] 「PDF として保存」/「ファイルに保存」/「Books に追加」が選べるか
- [ ] iOS Safari の共有ボタン経由でも PDF として保存できるか
- [ ] PDF タイトル / 保存ファイル名候補が `state.report.title` / `state.report.date` と整合しているか
  - `downloadReport()`: `state.report.title` 連動（接尾辞「報告書」を含む）+ `state.report.date` 連動
  - `printResults()`: `state.report.title` / `state.report.date` 連動（REPORT-PRINT-006-1）
  - `printPairings()`: `state.report.title` 連動 + 日付がある場合は `state.report.date` 由来の `YYYYMMDD` が `<title>` / 保存ファイル名候補に反映される（接尾辞「現在の組み合わせ」付き）
- [ ] 日本語が文字化けしないか（タイトル / 氏名 / 注釈 / footer）
- [ ] A4 縦で崩れないか
- [ ] 余計な操作ボタン（変更 / 確定 / 再生成 / リセット / 暫定成績 / 対戦履歴 / 過去結果 / 勝敗入力）が印刷物に混入していないか
- [ ] ページ途中でカードや行が不自然に切れていないか（`page-break-inside:avoid` が効くか）
- [ ] `afterprint` 後にタブが閉じるか
- [ ] タブが閉じない場合でも操作継続できるか（戻る操作 / タブ切替でアプリに戻れる）
- [ ] 2 回連続で同じボタンを実行しても問題ないか（blob URL 再生成 / 古いタブ残留など）
- [ ] オフライン（機内モード）でも既存データが localStorage にあれば動くか
- [ ] 既存データを JSON で読み込み直しても同じ印刷結果になるか

---

## 6. 導線別確認手順

### 6.1 `downloadReport()`（報告書）

1. result tab を開き、最終結果が表示できる状態にする
2. 報告書フォームに次の値が入っていることを確認する
   - `title` / `organizer` / `place` / `date` / `start` / `end`
   - `sei` / `fuku`
   - `note`（「特になし」または任意の文字列）
   - `prize`（数値）
   - `fax` / `officeName` / `accountingNote`
3. 「報告書を印刷 / PDF保存」ボタンを押す
4. §5 共通確認観点を 1 通り通す
5. 開いた印刷プレビュー / PDF 内に次が出ているか確認する
   - 大会名（タイトル末尾に「報告書」接尾辞）
   - 主催
   - 日付（和暦表記）
   - 開始時間 / 終了時間
   - 会場（REPORT-UX-008-1 でラベル「場所」→「会場」に改名済）
   - 担当役員（正副）
   - 参加人数
   - 収支
   - クラス別入賞者（top 3）
   - 申し送り事項（`note`）
   - footer 1 行目（FAX 連絡先）
   - footer 2 行目（会計注釈 `accountingNote`、空欄時は default）
6. 保存ファイル名候補 / `<title>` が `state.report.title` 接尾辞付き / `state.report.date` 連動であることを確認する
7. 旧保存データ（`2026年5月18日` / `13時00分` 形式の文字列）を読み込んだ状態でも、表示が崩れないか確認する

### 6.2 `printResults()`（対戦成績）

1. 結果タブで最終結果を表示する（全クラス全ラウンド消化）
2. 「対戦成績を印刷 / PDF保存」ボタンを押す
3. §5 共通確認観点を 1 通り通す
4. 開いた印刷プレビュー / PDF 内に次が出ているか確認する
   - 見出し「スイス式トーナメント 対戦成績」
   - クラス別表
   - 順位
   - 氏名
   - 各回戦欄
   - 勝数（A ポイント）
   - 負数
   - B ポイント
   - C ポイント
5. **entry_no が表示されていないこと**（RANK-PRINT-001）
6. `<title>` / 保存ファイル名候補が `state.report.title` / `state.report.date` 連動であること（REPORT-PRINT-006-1）
7. 大会日（`state.report.date`）と実機の今日の日付が違う場合でも、`<title>` / PDF 保存時のデフォルト名相当が **大会日（`state.report.date`）ベース** になっていること（本文 h2 は「スイス式トーナメント 対戦成績」固定で、本文側に大会日見出しは出ない前提）

### 6.3 `printPairings()`（現在の組み合わせ）

1. 対局管理タブで、現在ラウンドの組み合わせが表示されている状態にする（全クラス分）
2. 「現在の組み合わせを印刷 / PDF保存」ボタンを押す
3. §5 共通確認観点を 1 通り通す
4. 開いた印刷プレビュー / PDF 内に次が出ているか確認する
   - 大会名
   - 日付
   - 「現在の組み合わせ」見出し
   - クラス名（A / B / C ...）
   - ラウンド番号（例: 「第 2 ラウンド」）
   - 第 N 卓
   - entry_no｜氏名（例: `A-12｜山田太郎`）
   - vs
5. **操作ボタンが混入していないこと**
   - 勝敗入力ボタン（`winner-btn`）
   - 「変更」ボタン
   - 「▲ 勝」マーカー
   - 「組み合わせを再生成」ボタン
   - 「確定して次へ」ボタン
   - 「暫定成績」表
   - 「対戦履歴」表
   - 「過去結果」表
6. 全クラスの現ラウンドが出ること（A / B / C すべて含まれる）
7. **結果記入欄がないこと**
8. クラス間で改ページが入る（または `page-break-before:always` で 1 クラス = 1 ページ目安）
9. 1 ページに収まらない場合、カード単位で不自然に切れないこと（`page-break-inside:avoid`）

---

## 7. 記録フォーマット

実機確認結果は **別ファイル**（後続タスク REPORT-PRINT-005A 候補）に転記する想定。本ファイルには結果を書き込まない。

### 7.1 結果記録表（テンプレ）

| 日付 | 確認者 | 端末 | OS | ブラウザ | 導線 | 結果 | 詳細 | スクショ/PDF 有無 | 対応要否 |
|------|--------|------|----|----------|------|------|------|-------------------|---------|
| 2026-MM-DD | 名前 | iPhone 15 | iOS 18.x | Safari | downloadReport | OK / Minor / Blocker / Not Tested | （下記の詳細例参照） | あり / なし | 不要 / 後続 / 緊急 |

### 7.2 結果の分類

- **OK**: 期待通り動いた
- **Minor Issue**: 運用回避可能。docs で注意書きすれば足りる
- **Blocker**: 運用上致命的。実装対応が必要
- **Not Tested**: 未実施

### 7.3 詳細欄の記入例

- 印刷ダイアログが自動で出た
- 新規タブは開くが `print()` は自動発火しない（手動で「印刷」メニューを開けば出る）
- PDF 保存は可能
- `afterprint` 後にタブが閉じない（戻る操作でアプリに戻れる）
- 共有ボタン経由でしか保存できない
- popup blocked alert が出る（設定で許可後は OK）
- 日本語が崩れる（特定の文字が□表示）
- A4 縦で右端が切れる
- 改ページがカード途中で起こる
- ファイル名が `_blank.pdf` のような default になり、`state.report.title` 連動になっていない
- 大会日と印刷日が違う場合に印刷日が出ている

---

## 8. 判定基準

### 8.1 OK 判定の条件（全部満たす）

- 新規タブが開く
- 印刷 / PDF 保存ができる（自動・手動いずれでも可）
- 日本語が崩れない
- 主要情報（§6 各導線の「次が出ているか」リスト）がすべて出る
- 操作 UI が混入しない

### 8.2 Minor Issue（運用回避可能）

- `win.print()` が自動発火しないが、ブラウザメニューから手動で印刷 / PDF 保存できる
- `afterprint` 後にタブが閉じないが、戻る操作 / タブ切替でアプリに戻れる
- 保存ファイル名が `state.report.title` / `date` と完全一致しないが、内容は正しい
- 余白や改ページに軽微な違和感がある（読みづらいほどではない）
- iOS Safari で共有ボタン経由でしか PDF 保存できない（直接「PDF として保存」が出ない）

### 8.3 Blocker（実装対応必要）

- 新規タブが開かない
- blob URL が「ページが見つかりません」になる
- PDF 保存が一切できない
- 日本語が文字化けする（読めない）
- 操作 UI が紙に混入する
- 主要情報が欠落する
- 印刷後にアプリへ戻れない（タブが残り続け、戻るボタンも効かない）
- 2 回連続実行で挙動が壊れる（古いタブのまま、blob revoke 後に開けない 等）

---

## 9. 結果に応じた後続タスク案

### 9.1 OK が多い場合

- 現行方式（Blob + `window.open` + `win.print()`）を継続
- PDF 直接生成（jsPDF / pdfmake）は **不要**
- Web Share API は引き続き **Hold**
- 後続タスクなし、または docs に「実機確認結果」サマリを追加するのみ

### 9.2 Minor Issue がある場合

- docs（運営マニュアル / `index.html`）に注意書きを追加
  - 「自動で印刷ダイアログが出ないブラウザでは、メニューから印刷を選んでください」
  - 「タブが閉じない場合は戻るボタンで戻ってください」
  - 「ファイル名は手動で変更してください」
- 該当する後続タスク（REPORT-PRINT-005B 候補）を起票

### 9.3 Blocker がある場合（深刻度順）

- **第一案: `win.print()` 自動発火をやめ、別ウィンドウ内に「印刷する」ボタンを置く**
  - ユーザージェスチャー直結に近い経路にし、popup / print の制約を回避
- **第二案: HTML 保存導線の追加**
  - `<a download>` で HTML を直接保存できるようにする（オフライン共有用）
- **第三案: Web Share API の検討**
  - `navigator.share({files: [...]})` 経由で OS の共有メニューに流す
  - `canShare({files})` を判定し、対応端末のみ表示
- **最終手段: PDF 直接生成**
  - jsPDF + 日本語フォント（IPA 等）を bundle
  - 依存追加 ~5MB、オフライン bundle 影響、`npm audit` リスクを再評価

### 9.4 後続候補（タスク ID 案）

- `REPORT-PRINT-005A`: 実機確認結果の記録 docs（本手順を使って実機確認を実施し、結果を別ファイルにまとめる）
- `REPORT-PRINT-005B`: スマホ向け注意書きの追加（運営マニュアル / アプリ内ヘルプ）
- `REPORT-PRINT-005C`: auto print fallback UI 棚卸し（`win.print()` 失敗時に「印刷する」ボタンを別ウィンドウに表示する設計）
- `REPORT-PRINT-005D`: HTML 保存導線の要件棚卸し（HTML download / Web Share API 比較）

---

## 10. 明示的にやらないこと

- 本ドキュメントでは実装変更しない
- PDF 直接生成（jsPDF / html2canvas / pdfmake）は **しない**
- Web Share API は **実装しない**（Hold 継続）
- メール / LINE 共有は **実装しない**
- 印刷 helper の共通化は **しない**
- UI ボタン文言の変更は **しない**
- VRT baseline の変更は **しない**
- 実機確認結果を **想像で埋めない**（未実施は「Not Tested」と明記する）
- 本ドキュメントに実機確認結果そのものを書き込まない（記録は別ファイル）

---

## 11. 関連ファイル

- 実装:
  - [shogi_v4.html](../../shogi_v4.html) — `downloadReport()` / `printResults()` / `printPairings()`
- テスト:
  - [test/test_report_print_003.js](../../test/test_report_print_003.js) — `printPairings()`
  - [test/test_rank_print_001.js](../../test/test_rank_print_001.js) — `printResults()` entry_no 非表示
  - [test/test_round_class_start_007.js](../../test/test_round_class_start_007.js) — `printResults()` classes-driven
  - [test/test_report_ux_001.js](../../test/test_report_ux_001.js) 〜 [test_report_ux_007b.js](../../test/test_report_ux_007b.js) — `downloadReport()` 系
- 関連 closure / 設計 docs:
  - [docs/notes/20260519_report_print_completion_summary.md](20260519_report_print_completion_summary.md) — REPORT-PRINT-001 〜 003 集約 closure
  - [docs/notes/20260519_report_ux_completion_summary.md](20260519_report_ux_completion_summary.md) — REPORT-UX 系 closure（`state.report` SoT 化）
