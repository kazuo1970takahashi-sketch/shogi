# REPORT-PRINT 一連整理 完了整理

- **Task ID**: `REPORT-PRINT-004`
- **作業種別**: docs-only / closure / status 整理
- **作成日**: 2026-05-19
- **HEAD**: `5cff099`（PR #159 squash merge 後の main = REPORT-PRINT-003）
- **位置づけ**: REPORT-PRINT-001（印刷導線棚卸し）/ REPORT-PRINT-002（対局カード印刷棚卸し）/ REPORT-PRINT-003（`printPairings()` 実装）の到達点と残課題分類を 1 ファイルに集約した closure note
- **関連 closure**: [docs/notes/20260519_report_ux_completion_summary.md](20260519_report_ux_completion_summary.md)（REPORT-UX 系の状態整理、REPORT-PRINT は後続シリーズ）
- **禁止事項**: 本ドキュメントは整理のみ。実装変更・テスト変更・横展開は行わない。

---

## 1. 概要

### 1.1 目的

報告書・対戦成績・対局カードといった **印刷物 / PDF 保存 / 共有導線** の現状を棚卸しし、最小限の実装で現場運用ニーズに応える。具体的には:

- 既存の `downloadReport()` / `printResults()` で完結していなかった「対局カード印刷」を補完する
- `state.report` SoT 化が済んだ報告書側と整合する形で、対局カード側も state-as-SoT で印刷専用 HTML を生成する
- ブラウザの印刷ダイアログ → 「PDF として保存」フローを前提に、**runtime 依存を増やさない** 方針を維持する
- Web Share API / メール / LINE 共有 / PDF 直接生成は **現時点では実装しない**（個人情報リスク・依存追加リスク・スマホ実機検証コスト）

### 1.2 達成したこと

- **対局カード印刷** の専用導線 `printPairings()` を新設（PR #159）
- 全クラスの現ラウンド組み合わせを 1 ボタンで A4 印刷できるようにした
- 既存 `.pairing-card` DOM をそのまま印刷するのではなく、**印刷専用 HTML を生成** する方針を確立
- 操作 UI（変更 / 確定 / 再生成 / リセット / 暫定成績 / 対戦履歴 / 過去結果）が紙に混入しないことを構造的に保証
- entry_no｜氏名 表記で同姓同名対策を維持
- 既存 `downloadReport()` / `printResults()` と同じ Blob + window.open + win.print() 方式を踏襲（コード一貫性 + テスト pattern 流用）

### 1.3 非スコープ（今回やらないこと）

- 実装変更（`shogi_v4.html`）
- テスト追加・変更（`test/` / `test/e2e/`）
- VRT snapshot 更新
- `package.json` / `playwright.config.js` / `.github/workflows/` 変更
- 後続実装タスクの着手（REPORT-PRINT-005 / 006 / 007 / SHOGI-LEARN ほか）

---

## 2. 完了済みタスク一覧

| Task ID | PR | 内容 | 状態 | 主な変更 | VRT 影響 |
|---------|----|------|------|----------|---------|
| **REPORT-PRINT-001** | analysis-only / PR なし | 印刷 / PDF / 共有導線の棚卸し | 完了 | `downloadReport()` / `printResults()` / `saveData()` / `saveDataAsFile()` / `loadData()` / `loadFromPaste()` / master export-import / `@media print` CSS の現状確認、対局カード印刷導線の不在を確認、PDF 直接生成・Web Share API の未実装方針を確認 | なし |
| **REPORT-PRINT-002** | analysis-only / PR なし | 対局カード / 組み合わせカード印刷の運用要件棚卸し | 完了 | 既存 `.pairing-card` DOM の印刷不適性確認（操作 UI 混入リスク）、`printPairings()` 新設方針確定、「全クラスの現ラウンド」「結果記入欄なし」「entry_no 表示あり」を採用 | なし |
| **REPORT-PRINT-003** | [#159](https://github.com/kazuo1970takahashi-sketch/shogi/pull/159) | `printPairings()` 新設、全クラスの現ラウンド組み合わせを印刷 / PDF 保存 | MERGED | `printPairings()` 関数追加（118 行）、tournament tab 上部に「現在の組み合わせを印刷 / PDF保存」ボタン追加（`.no-print` 付与）、`test/test_report_print_003.js` 新規 77 件 PASS、`test/run_tests.sh` stanza 追加 | tournament-paired × {375, 1280} × {darwin, linux} の 4 件のみ |

---

## 3. 現在の印刷 / 保存 / 共有導線一覧

| 導線 | 関数 | 対象 | 方式 | UI | 状態 | 備考 |
|------|------|------|------|----|------|------|
| 報告書印刷 / PDF 保存 | `downloadReport()` | state.report 全項目 + クラス別 top 3 + footer | Blob + `window.open(_blank)` + `win.print()` + `afterprint→close` | 「報告書を印刷 / PDF保存」(`#downloadReportBtn`, result tab) | ✅ 実装済 | REPORT-UX-003A〜007B-1 で state-as-SoT 化完了。13 field 集約 |
| 対戦成績印刷 / PDF 保存 | `printResults()` | クラス別最終結果テーブル | 同上 | 「対戦成績を印刷 / PDF保存」(result tab) | ✅ 実装済 | classes-driven (ROUND-CLASS-START-007)、entry_no 非表示 (RANK-PRINT-001) |
| 現在組み合わせ印刷 / PDF 保存 | `printPairings()` | 全クラスの現ラウンド `state.pairings` | 同上 | 「現在の組み合わせを印刷 / PDF保存」(tournament tab 上部) | ✅ 実装済 (REPORT-PRINT-003 / PR #159) | 全クラス対象、結果記入欄なし、entry_no｜氏名 表示 |
| 大会データ保存 | `saveData()` → `saveDataAsFile()` | `state` 全体 JSON | `navigator.clipboard.writeText` → 失敗時 `<a download>` fallback | 「大会データをコピー」(`#saveBtn`, header) | ✅ 実装済 | clipboard 優先、ファイル名 `shogi_YYYYMMDD_HHMM.json` |
| 大会データ読込 | `loadData(e)` / `loadFromPaste()` | JSON ファイル / 貼り付け | FileReader + `applyLoadedJson` | 「読み込み」(`#loadBtn`, header) → load-modal | ✅ 実装済 | 上書き確認 confirm 経由 |
| マスタ export | masterExportBtn click handler | branch master JSON | Blob + `<a download>` | 「📤 マスタをエクスポート」(master tab) | ✅ 実装済 | clipboard 経路なし、直接 download |
| マスタ import | masterImportBtn モーダル | branch master JSON | File API + 上書き / マージ | 「📂 マスタをインポート」(master tab) | ✅ 実装済 | MASTER-V2 系 |
| PDF 直接生成 | — | — | — | — | ❌ 未実装 | 依存追加 (~5MB) / 日本語フォント / オフライン bundle / npm audit の観点で重い。ブラウザ「PDF として保存」で代替 |
| Web Share API | — | — | — | — | ❌ 未実装 | iOS Safari / Android Chrome の差、`canShare({files})` 不安定、個人情報共有リスク |
| メール / LINE 共有 | — | — | — | — | ❌ 未実装 | 誤送信 / 個人情報漏洩リスク。`mailto:` リンクすら未配置 |
| 報告書 / 結果 HTML 直接保存 | — | — | — | — | ❌ 未実装 | 「印刷ダイアログ → PDF として保存」で代替。HTML 直接保存導線は別タスク候補 |
| 全ラウンド一括対局カード印刷 | — | — | — | — | ❌ 未実装 | 需要が出たら別モード |
| 過去ラウンド再印刷 | — | — | — | — | ❌ 未実装 | 需要が出たら別モード |
| 結果記入欄付き対局カード | — | — | — | — | ❌ 未実装 | 紙とアプリのどちらを正とするかの整理が先 |

---

## 4. REPORT-PRINT-003 の設計判断

### 4.1 既存 `.pairing-card` DOM を印刷に使わない
- tournament tab 内の `.pairing-card` DOM は `winner-btn` / 「変更」ボタン / 「▲ 勝」マーカー / `[手動変更]/[要確認]` バナーを含む **操作 UI 寄りの構造**
- ブラウザネイティブ印刷（Ctrl+P）だと、これらの UI が紙に混入する
- 加えて、暫定成績 / 対戦履歴 / 過去結果 / class-action-bar など pane 全体が印刷対象になる
- → **印刷専用 HTML を別ウィンドウで生成** する方針を採用（`downloadReport()` / `printResults()` と整合）

### 4.2 印刷専用 HTML の出力内容
**含めるもの**:
- 大会名（`state.report.title` 経由）
- 日付（`state.report.date` → `formatJapaneseDateFromYmd` で和暦表記）
- 「現在の組み合わせ」見出し
- クラス名（`state.classes[*].name` 経由）
- ラウンド番号（`state.results[cls].length + 1`）
- 第 N 卓（pairings 配列 index + 1）
- entry_no｜氏名（`getNameWithNo(id, cls)` 経由）
- vs

**含めないもの**:
- 勝敗入力 UI（`winner-btn` / `wb_` プレフィックス）
- 変更ボタン
- ▲ 勝マーカー
- `submitBtn` / 「確定して次へ」
- `repairBtn` / 「組み合わせを再生成」
- class-action-bar / 「リセット」ボタン
- 暫定成績テーブル
- 対戦履歴
- 過去結果
- 結果記入欄（紙とアプリの正本曖昧化を避けるため）
- 市町村など対局カードに不要な個人情報

### 4.3 印刷対象
- **全クラスの現ラウンド** を 1 ボタンで印刷
- 各クラスごとに「未開始 / 全ラウンド消化済 / pairings 空」のいずれかなら除外（無理に空カードを出さない）
- 全クラスに印刷対象がない場合は alert で通知して return（空 HTML を開かない）

### 4.4 レイアウト
- A4 縦、margin 10mm
- 1 ページに複数カード（CSS grid 2 列）
- カード単位で `page-break-inside:avoid`
- クラス間に `page-break-before:always` で 1 クラス = 1 ページ目安

### 4.5 state-as-SoT
- `getRegistrationClassList()` で全クラスを走査（A/B 固定 literal なし）
- `state.pairings[cls]` / `state.results[cls]` を直接読む
- 選手名は `getNameWithNo(id, cls)` 経由（内部で `state.players[cls]` を読む SoT 経路）
- DOM 直読み（`getElementById('pane-*')` / `querySelector('.pairing-card')` 等）は **一切しない**
- JSON 復元後でも同じ HTML が生成される（state 駆動）

### 4.6 PDF 直接生成・Web Share API は不採用
- PDF 直接生成: 依存追加 ~5MB + 日本語フォント問題 + オフライン bundle + npm audit の観点で重い。ブラウザの「PDF として保存」フローで代替
- Web Share API: iOS Safari / Android Chrome の差大、`canShare({files})` サポート不安定、個人情報共有リスク

### 4.7 classId / className 可変対応
- ROUND-CLASS-START-007 で確立した classes-driven パターンを踏襲
- 3 クラス以上 (A/B/C/...) でも自然に印刷対象に含まれる
- `isSafeClassId(cls.id)` ガードで不正 ID を弾く

### 4.8 popup blocked / error handling
- `window.open` が null（popup blocked）→ `URL.revokeObjectURL` + alert + return
- 印刷対象なし → alert + return（Blob 生成すらしない）
- 既存 `downloadReport()` / `printResults()` と同パターン

### 4.9 helper 共通化は今回はしない
- `downloadReport()` / `printResults()` / `printPairings()` の Blob + window.open + win.print のシーケンスは重複あり
- 今回は print helper 共通化はせず、各関数の独立性を維持
- 共通化は **後続候補**（§7 §B 参照）

---

## 5. VRT 方針

### 5.1 baseline 更新範囲
- REPORT-PRINT-003 での更新: **tournament-paired × {375, 1280} × {darwin, linux} の 4 件のみ**
  - `tournament-paired-375-chromium-desktop-darwin.png`
  - `tournament-paired-1280-chromium-desktop-darwin.png`
  - `tournament-paired-375-chromium-desktop-linux.png`
  - `tournament-paired-1280-chromium-desktop-linux.png`
- 差分理由: tournament tab 上部に印刷ボタン 1 つ追加 → 高さ +57px
- 未変更: `result-finalized` snapshots / `visual_regression_mobile.spec.js-snapshots/*`（mobile-375 project は master/pp-panel のみ対象、tournament tab 未カバー）

### 5.2 linux baseline 補完手順
- 初回 push 後、CI E2E が linux baseline mismatch で fail
- `gh run download <run-id> -n test-results -D <tmpdir>` で artifact 取得
- `tournament-paired-{375,1280}-actual.png` を `tournament-paired-{375,1280}-chromium-desktop-linux.png` へ copy
- 補完 commit を別途 push（`chore(vrt): update linux baselines for tournament-paired 003`）
- CI 再評価で全 SUCCESS を確認
- REPORT-UX-007A / 007B-1 で確立した手順と同パターン

### 5.3 印刷専用 HTML 自体は VRT 対象外
- `printPairings()` の生成 HTML は別ウィンドウ blob で開かれる
- Playwright snapshot は撮影しない
- 出力 HTML の検証は **unit test の文字列検査** で代替（`test/test_report_print_003.js` 77 件で網羅）

---

## 6. 明示的に今回やらない判断

| 項目 | 判定 | 理由 |
|------|------|------|
| PDF 直接生成（jsPDF / html2canvas / pdfmake） | **Skip** | 依存追加 ~5MB、日本語フォント問題、オフライン bundle 影響、npm audit の supply-chain 観点で重い |
| Web Share API | **Hold** | iOS Safari / Android Chrome のサポート差大、`canShare({files})` 不安定、個人情報共有リスク |
| メール / LINE 共有 | **Hold** | 誤送信 / 個人情報漏洩リスク、要運用合意 |
| 結果記入欄付き対局カード | **Hold** | 紙とアプリのどちらを正とするかの整理が先 |
| 過去ラウンド再印刷 | **Hold** | 需要が出たら別モード |
| 全ラウンド一括印刷 | **Hold** | 需要が出たら別モード |
| 現在表示中クラスのみ印刷 | **Skip** | 全クラス印刷で十分（不要なクラスは skip 条件で自動除外） |
| HTML ファイル直接保存 | **Hold** | 「印刷ダイアログ → PDF として保存」で代替可。需要が出たら別タスク |
| 既存 `.pairing-card` DOM の大改修 | **Skip** | 印刷専用 HTML を別途生成する方針で代替 |
| print helper の共通化 | **Hold** | `downloadReport()` / `printResults()` / `printPairings()` の重複は後続候補。今回は独立性優先 |
| 既存 `@media print` / `.no-print` の大幅整理 | **Hold** | 印刷専用 HTML 経路があるため tournament tab のブラウザネイティブ印刷経路は副次的。要件次第で別タスク |

---

## 7. 残課題 / 後続候補

### A. Hold / 要運用確認
- **結果記入欄付き対局カード**: 「対局者が紙に書く」運用が確立しているかの確認が必要
- **過去ラウンド再印刷**: 振り返り用紙物の需要次第
- **全ラウンド一括印刷**: アーカイブ用途の需要次第
- **現在表示中クラスだけの印刷**: 多クラス大会で「片方のクラスだけ印刷したい」需要があれば検討
- **HTML ファイル直接保存**: 「PDF ではなく HTML で残したい」運用が顕在化すれば追加
- **Web Share API / file share**: iOS Safari / Android Chrome の対応状況を実機検証してから
- **メール / LINE 共有**: 個人情報共有運用ルールが整備されたら検討
- **スマホ実機での印刷挙動確認**: iOS Safari / Android Chrome での `window.open` + `win.print()` 挙動差は実機検証が必要

### B. 小粒で可能だが優先度低
- `printPairings` ボタンに `id` 追加（E2E 操作の対象しやすさ向上）
- print helper 共通化（`downloadReport` / `printResults` / `printPairings` の Blob+open+print シーケンス抽出）
- ボタン文言の細かい統一（「印刷」「PDF保存」「現在の組み合わせ」など）
- `printResults` のファイル名を `state.report.title` 連動化（report と命名規約統一）
- `printResults` のヘッダに大会名 / 日付付与
- `@media print` / `.no-print` の棚卸しと整理（tournament tab のブラウザネイティブ印刷経路改善）

### C. 固定維持でよいもの
- ブラウザの「PDF として保存」に依存する方針
- Blob + `window.open` + `win.print()` 方式
- runtime 依存ゼロ運用
- A4 縦前提
- 1 ページ複数カード前提
- 印刷物は氏名 + entry_no まで（市町村などは含めない）

### D. 次に進める候補

#### 第一候補: REPORT-PRINT-005 — スマホ実機での印刷 / PDF 保存挙動確認手順 docs
- **種別**: docs-only（実機検証手順の整備）
- **理由**: iOS Safari / Android Chrome の挙動差はコードレビューだけでは分からない。実装より先に手順と確認観点を整理する価値が高い
- 確認観点（doc に書く内容）:
  - `window.open(_blank)` の popup-block 挙動
  - `win.print()` 自動実行の成否
  - `afterprint` 発火タイミング
  - 「PDF として保存」の default ファイル名（`<title>` タグ依存）
  - blob URL の保持期間
- 実機テストは別タスクで実施

#### 第二候補: REPORT-PRINT-006 — printResults の大会名 / 日付連動棚卸し
- **種別**: analysis-only 推奨
- **理由**: 報告書 (`downloadReport`) と現在組み合わせ (`printPairings`) は `state.report.title` / `date` を使う方向に揃った。対戦成績 `printResults()` だけ固定ファイル名（`沼津支部_YYYY年MM月度_月例将棋大会結果`）が残っており、メタ情報も未付与
- 棚卸し → analysis-only → 小粒実装の順序が安全

#### 第三候補: REPORT-PRINT-007 — 結果記入欄付き対局カードの要件棚卸し
- **種別**: analysis-only 推奨
- **理由**: 現場で紙カードに結果を書き込む運用がある場合に価値が高い。ただし「紙とアプリのどちらを正とするか」の整理が必要
- ヒアリング項目案:
  - 紙に書く運用があるか
  - 書いた紙はアプリに入力するか
  - 紙とアプリの不整合時はどちらを優先するか
  - カードのサイズ / レイアウト

---

## 8. 重要な注意点

- **個人情報**: 印刷物には参加者氏名が含まれる。entry_no は同姓同名対策として現在組み合わせ印刷には表示する一方、結果表 (`printResults`) では `RANK-PRINT-001` で entry_no 非表示化済（目的が違うため対局カードでは表示）
- **共有リスク**: Web Share API / メール / LINE 共有を実装する場合、誤送信・個人情報漏洩リスクへの設計対応（送信先確認 UI、同意フロー）が必要
- **PDF 直接生成**: jsPDF + 日本語フォント (IPA ~5MB) でオフライン bundle が膨らむ。`docs/specs/_business_model.md:42` の「ネットワーク:会場 Wi-Fi 不安定前提 → 完全オフライン動作」と相性悪い
- **依存追加**: `package.json` の runtime 依存はゼロを維持推奨。`devDependencies` は @playwright/test + html-validate のみ
- **CI の linux VRT baseline**: GitHub Actions の ubuntu-latest と darwin で font rendering が微妙に異なる。新 UI 追加時は **CI artifact 由来で linux baseline を更新** する手順を REPORT-UX-007A / 007B-1 / REPORT-UX-008-1 / REPORT-PRINT-003 で確立済
- **印刷ダイアログの E2E**: Playwright で `window.print()` の検証は基本的にサポートされない。生成 HTML の **unit test** と **実機確認手順 docs** で補完する
- **iOS Safari の `window.open` 制約**: ユーザージェスチャー直結でないとブロックされやすい。現状はすべて button click 直結のためほぼ OK だが、将来的に間接呼出しを追加する場合は要注意

---

## 9. 関連ファイル

- 実装:
  - [shogi_v4.html](../../shogi_v4.html) — `downloadReport()` / `printResults()` / `printPairings()` / `saveData()` / `saveDataAsFile()` / `loadData()` / `loadFromPaste()` / master export-import / `@media print` CSS
- テスト:
  - [test/test_report_ux_001.js](../../test/test_report_ux_001.js) 〜 [test_report_ux_007b.js](../../test/test_report_ux_007b.js) — `downloadReport` 系
  - [test/test_rank_print_001.js](../../test/test_rank_print_001.js) — `printResults` entry_no 非表示
  - [test/test_round_class_start_007.js](../../test/test_round_class_start_007.js) — `printResults` classes-driven
  - [test/test_report_print_003.js](../../test/test_report_print_003.js) — `printPairings` (REPORT-PRINT-003)
- VRT baseline:
  - [test/e2e/visual_regression.spec.js-snapshots/tournament-paired-*.png](../../test/e2e/visual_regression.spec.js-snapshots/) — tournament tab（REPORT-PRINT-003 で更新）
  - [test/e2e/visual_regression.spec.js-snapshots/result-finalized-*.png](../../test/e2e/visual_regression.spec.js-snapshots/) — result tab（REPORT-UX 系で更新、REPORT-PRINT 系では未変更）
- 関連 closure docs:
  - [docs/notes/20260519_report_ux_completion_summary.md](20260519_report_ux_completion_summary.md) — REPORT-UX 系（先行シリーズ）
  - [docs/notes/20260516_shogi_reset_ux_series_closure.md](20260516_shogi_reset_ux_series_closure.md) — RESET-UX 系
  - [docs/notes/20260513_shogi_a5_1_save_completion_summary_v0.md](20260513_shogi_a5_1_save_completion_summary_v0.md) — A-5.1 SAVE 系
