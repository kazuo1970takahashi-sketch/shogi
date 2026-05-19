# REPORT-UX 一連改善 完了整理

- **Task ID**: `REPORT-UX-009`
- **作業種別**: docs-only / closure / status 整理
- **作成日**: 2026-05-19
- **HEAD**: `4b8bbef`（PR #156 squash merge 後の main = REPORT-UX-007B-1）
- **位置づけ**: REPORT-UX-003A 〜 007B-1 までの 9 PR で進めた **報告書UX state-as-SoT 化シリーズ** の完了状況と、棚卸し結果（007 / 007B / 007C）に基づく残課題分類を 1 ファイルに集約した closure note
- **禁止事項**: 本ドキュメントは整理のみ。実装変更・テスト変更・横展開は行わない。

---

## 1. 概要

### 1.1 目的

報告書（downloadReport が生成する PDF/印刷用 HTML）と、その入力フォーム（`#pane-result` 配下の「大会報告書」セクション）で、**固定値・DOM 直読み依存を段階的に減らし、`state.report` を Single Source of Truth に寄せる** こと。

### 1.2 達成したこと

- 報告書の主要入力（大会名 / 主催者 / 場所 / 日付 / 開始 / 終了 / 担当役員 正 / 副 / 申し送り事項 / 賞金額 / FAX / 事務局名 / 会計提出文）の **13 field を state.report に集約**
- `downloadReport()` の DOM 直読み（`getElementById('rep-*').value`）を全廃、すべて `normalizeReport*(state.report.*)` 経由に統一
- **旧保存データ互換を維持**: 旧形式 `2026年5月18日` / `13時00分` / 末尾「報告書」付き title / null/undefined/数値/object などの不正値は、normalize 系 helper で吸収（自動 migrate or default fallback）
- **IME-safe**: text/textarea 系は input 時 state 更新のみ、change 時に DOM 書き戻し（日本語 IME composing 中のカーソル位置を壊さない）
- **VRT 差分**: 文言だけ変更した PR では baseline 更新なし（006A/006B/006C など）。UI 追加 PR では `result-finalized` × {375, 1280} × {darwin, linux} の 4 件のみ限定更新（007A/007B-1）

### 1.3 非スコープ（今回やらないこと）

- 実装変更（`shogi_v4.html`）
- テスト追加・変更（`test/` / `test/e2e/`）
- VRT snapshot 更新
- `package.json` / `playwright.config.js` / `.github/workflows/` 変更
- 後続実装タスクの着手（REPORT-UX-008 / REPORT-PRINT-001 / SHOGI-LEARN ほか）

---

## 2. 完了済みタスク一覧

| Task ID | PR | 内容 | 状態 | 主な変更 | VRT 影響 |
|---------|----|------|------|----------|---------|
| **REPORT-UX-003A** | [#148](https://github.com/kazuo1970takahashi-sketch/shogi/pull/148) | 賞金額 state 化・帳票連動 | MERGED | `state.report.prize` 追加、`normalizeReportPrize` 追加、固定 7000 円 literal 撤去、`#rep-prize` (type=number / min=0 / step=100 / inputmode=numeric) 追加、賞金内訳テンプレ `（2,000円＋1,000円＋500円）× 2 ＝ ▲7,000円` 完全撤去 | あり（form に input 追加） |
| **REPORT-UX-003B** | [#149](https://github.com/kazuo1970takahashi-sketch/shogi/pull/149) | 賞金額 DOM/state 同期 | MERGED | `updateReportFieldFromElement` で prize 正規化後値を DOM に書き戻し、'abc'/負数/空欄 → 7000 表示、0/5000 入力 → '0'/'5000' 表示 | なし |
| **REPORT-UX-004** | [#150](https://github.com/kazuo1970takahashi-sketch/shogi/pull/150) | 大会名 state 化・帳票連動 | MERGED | `state.report.title` 追加、`normalizeReportTitle`（末尾「報告書」を 1 回除去、`<title>`/h2/ファイル名で参照）、IME-safe（change 時のみ DOM 書き戻し） | あり（form に input 追加） |
| **REPORT-UX-005** | [#151](https://github.com/kazuo1970takahashi-sketch/shogi/pull/151) | 主催者名 state 化・帳票連動 | MERGED | `state.report.organizer` 追加、`normalizeReportOrganizer`、「主催」行を state 由来に置換、ラベル「主催：」は downloadReport 側で付与 | あり（form に input 追加） |
| **REPORT-UX-006A** | [#152](https://github.com/kazuo1970takahashi-sketch/shogi/pull/152) | 場所 field の state-as-SoT 整理 | MERGED | `normalizeReportPlace`、`#rep-place.value` 直読み撤去、IME-safe | なし（既存 input） |
| **REPORT-UX-006B** | [#153](https://github.com/kazuo1970takahashi-sketch/shogi/pull/153) | date / start / end の state-as-SoT 整理、旧形式 migration | MERGED | `normalizeReportDateForInput` / `normalizeReportTimeForInput`、`2026年5月18日 → 2026-05-18` 自動 migrate、`13時00分 → 13:00`、`ensureReportDateTimeDefaults` で 今日 / 13:00 / 17:00 補完 | なし |
| **REPORT-UX-006C** | [#154](https://github.com/kazuo1970takahashi-sketch/shogi/pull/154) | sei / fuku / note の state-as-SoT 整理、note 改行保持 | MERGED | `normalizeReportSei` / `Fuku` / `Note`、note の中間改行 `\n` を維持、「特になし」は state に保存せず表示時 fallback、IME-safe | なし |
| **REPORT-UX-007A** | [#155](https://github.com/kazuo1970takahashi-sketch/shogi/pull/155) | footer 1行目 FAX番号 / 事務局名の可変化 | MERGED | `state.report.fax` / `officeName`、`normalizeReportFax` / `OfficeName`、`#rep-fax` / `#rep-office-name` 追加、kebab id → camel key の明示 mapping（officeName） | あり（result-finalized 4 枚） |
| **REPORT-UX-007B-1** | [#156](https://github.com/kazuo1970takahashi-sketch/shogi/pull/156) | footer 2行目 会計提出文の可変化 | MERGED | `state.report.accountingNote`、`normalizeReportAccountingNote`、`#rep-accounting-note` textarea 追加、改行保持、`escapeHtml(...).split('\n').join('<br>')` で XSS 安全 + 改行表示 | あり（result-finalized 4 枚） |

**棚卸し（analysis-only）**:
- **REPORT-UX-007**: 報告書内の固定文言・固定値の棚卸し（footer 周辺 / 「主催：」「場所」「収支：」など）
- **REPORT-UX-007B**: footer 提出注意文・末尾文言の棚卸し → 推奨「Go: footer 2行目のみ可変化」 → 007B-1 として実装
- **REPORT-UX-007C**: 賞金・収支・賞金内訳まわりの棚卸し → 推奨「Skip: 現状で十分」

---

## 3. 現在の state.report 管理項目

13 field すべて state-as-SoT 化済み。schema literal は **6 箇所**（initial state / `normalizeState` base / `ensureReportDateTimeDefaults` / `resetAll` / `populateReportFields` / `updateReportFieldFromElement` の各 fallback）で同期。

| field | 用途 | default / fallback | helper | UI | downloadReport |
|-------|------|--------------------|--------|----|----------------|
| `title` | 大会名 | `'沼津支部月例将棋大会'` | `normalizeReportTitle`（末尾「報告書」除去、trim、空欄 default） | `#rep-title` (input) | `<title>` / h2 / ファイル名で参照、`<title>` には接尾辞「報告書」付与 |
| `organizer` | 主催者 | `'日本将棋連盟沼津支部'` | `normalizeReportOrganizer`（trim、空欄 default） | `#rep-organizer` (input) | 「主催」行で参照、ラベル「主催：」は付与 |
| `place` | 場所 | `'労政会館'` | `normalizeReportPlace`（trim、空欄 default） | `#rep-place` (input) | 「場所」行で参照 |
| `date` | 開催日 | `''`（未入力 → 今日） | `normalizeReportDateForInput`（YYYY-MM-DD、旧形式自動 migrate） | `#rep-date` (input type=date) | 「日付」行で `YYYY年M月D日` 表示、未入力時は「　　年　　月　　日」 |
| `start` | 開始時刻 | `''`（未入力 → 13:00） | `normalizeReportTimeForInput`（HH:MM、旧形式自動 migrate） | `#rep-start` (input type=time step=300) | 「時間」行で `HH時MM分` 表示 |
| `end` | 終了時刻 | `''`（未入力 → 17:00） | `normalizeReportTimeForInput` | `#rep-end` (input type=time step=300) | 「時間」行で `HH時MM分` 表示、`#rep-time-warning` で end<=start 警告 |
| `sei` | 担当役員（正） | `''`（空欄許容） | `normalizeReportSei`（trim、空欄許容） | `#rep-sei` (input) | 「担当役員」行 正 で参照 |
| `fuku` | 担当役員（副） | `''`（空欄許容） | `normalizeReportFuku` | `#rep-fuku` (input) | 「担当役員」行 副 で参照 |
| `note` | 申し送り事項 | `''`（空欄許容、中間改行維持） | `normalizeReportNote`（両端 trim、改行維持） | `#rep-note` (textarea) | 「申し送り事項」行、空欄時は表示で「特になし」fallback、`\n → <br>` |
| `prize` | 賞金額（円） | `7000`（0 も valid） | `normalizeReportPrize`（数値、`>=0` valid、不正値 → 7000） | `#rep-prize` (input type=number min=0 step=100) | 「収支」行で `▲<prize>円`、balance = total - prize で再計算 |
| `fax` | FAX 番号 | `'943-9443'` | `normalizeReportFax`（trim、空欄 default） | `#rep-fax` (input) | footer 1行目 `…FAX（<fax>）…` |
| `officeName` | 事務局名 | `'沼津支部事務局'` | `normalizeReportOfficeName`（trim、空欄 default） | `#rep-office-name` (input、kebab→camel 明示 mapping) | footer 1行目 `…直接<officeName>まで` |
| `accountingNote` | 会計提出文（footer 2行目） | `'※役員会で会計長へ収支報告書として提出ください。'`（改行維持） | `normalizeReportAccountingNote`（両端 trim、改行維持、空欄 default） | `#rep-accounting-note` (textarea、kebab→camel 明示 mapping) | footer 2行目、`escapeHtml(...).split('\n').join('<br>')` |

**動的計算（state-driven、SoT は state.players）**:
- `total` … `calcTotal()` = `Σ getFee(player.member, player.grade)` over `state.players[*]`
- `allCount` … `Σ state.players[cls].length`
- `balance` … `total - prize`、負数時は `▲` 接頭辞

---

## 4. 重要な設計判断

### 4.1 state.report を SoT とする
- `downloadReport()` は **DOM 直読みを行わない**。すべて `normalizeReport*(state.report.*)` 経由。
- DOM ↔ state 不一致時は **state が優先**。テストで明示 assert（007A F4 / 007B-1 F3 など）。

### 4.2 input / change の扱い（IME-safe）
- text / textarea 系（`title` / `organizer` / `place` / `sei` / `fuku` / `note` / `fax` / `officeName` / `accountingNote`）:
  - **input 時**: state 更新 + `save()` のみ。**DOM 書き戻しはしない**（日本語 IME composing 中のカーソル位置を壊さないため）
  - **change 時**: state 更新 + `save()` + **DOM 書き戻し**（normalize 結果を反映）
- number 系（`prize`）:
  - IME 関係ないため input/change 両方で DOM 書き戻し。`'abc'` 入力 → 即 `'7000'` 表示などの即時 sanitization が UX 上自然
- date/time 系（`date` / `start` / `end`）:
  - picker 経由が主、change 時のみ DOM 書き戻し（picker 操作中の中間値保護）
  - `ensureReportDateTimeDefaults()` は未入力欄のみ 今日 / 13:00 / 17:00 を補完（既存値は触らない、冪等）

### 4.3 旧保存データ互換
- 旧形式日付 `2026年5月18日` → `normalizeReportDateForInput` が `2026-05-18` に自動 migrate
- 旧形式時刻 `13時00分` → `normalizeReportTimeForInput` が `13:00` に自動 migrate
- 旧 title 末尾「報告書」付き → `normalizeReportTitle` が 1 回除去（`downloadReport` が再付与するため二重防止）
- 全 field で null / undefined / 数値 / object / 空白のみ → default fallback（normalize helper 内）

### 4.4 note の「特になし」運用
- state には空文字 `''` として保存（`normalizeReportNote('特になし')` を保存しない）
- 表示時のみ `downloadReport` で `normalizeReportNote(state.report.note) || '特になし'` として fallback
- 改行は両端 trim のみ、中間 `\n` は維持し `escapeHtml(note).split('\n').join('<br>')` で表示

### 4.5 accountingNote の空欄運用
- note と異なり、空欄 change → **default 文言に戻す**（非表示にしない）
- 理由: footer 2行目を「空にしたい」運用は現状想定外。非表示化は別 ON/OFF 設計が必要なため保留
- 中間改行は維持（textarea / 改行表示は note と同パターン）

### 4.6 title の「報告書」接尾辞
- state には **大会名のみ** を保存（純粋な大会名）
- `<title>` / h2 / ファイル名は `downloadReport` 側で「報告書」を 1 回付与
- ユーザー入力に「報告書」が含まれていても 1 回除去して保存し、出力時に再付与（重複防止）

### 4.7 organizer と officeName を別概念として扱う
- `organizer`（主催者）= 大会を **主催する団体名**（例: `日本将棋連盟沼津支部`）。報告書「主催」行で参照。
- `officeName`（事務局名）= 報告書の **提出先 / 連絡先となる事務局**（例: `沼津支部事務局`）。footer 1行目「…直接<officeName>まで」で参照。
- default 値が似ている（`沼津支部` 共通）ため概念混同しやすいが、運用上は **主催と提出先が別組織** のケースもあるため field を分離している。

### 4.8 footer 1行目テンプレートは固定維持
- 「`※ホームページ掲載の為、当日夜までにFAX（` / `）、メールまたは直接` / `まで`」の 3 セグメント literal は state 化していない
- 理由: テンプレ全体を state 化すると fax / officeName と二重管理になり、設計論点が増える（REPORT-UX-007B 棚卸し判定）
- 必要なら後続タスクで `state.report.submitNote1` 等を検討（テンプレ補間 vs 完全可変の設計が必要）

### 4.9 賞金内訳テンプレートは追加しない判断
- 003A で旧テンプレ `（2,000円＋1,000円＋500円）× 2 ＝ ▲7,000円` を撤去し、`▲<prize>円` の単純表示に置換
- `state.report.prizeNote` / `prizeBreakdown` は追加せず、賞金まわりは prize 1 field のみで完結（REPORT-UX-007C 棚卸し判定）

### 4.10 賞金まわりは 007C で「Skip」判定
- 003A / 003B で 40 件のテスト + 関連 2 テストで堅牢にカバー済
- 残る固定値（ラベル / `▲` / `円` / fee literal）は運用変更ニーズが未顕在化のため可変化価値が低い
- `prizeNote` / カンマ入力対応 / 小数 sanitization は **運用要望が出てから** 検討

---

## 5. VRT 方針

### 5.1 baseline 更新範囲の原則
- **UI 変更なしの PR** では baseline 更新なし（006A / 006B / 006C / 003B）
- **UI input / textarea 追加 PR** では `result-finalized` baseline を **限定更新**:
  - 003A: `#rep-prize` (input) 追加
  - 004: `#rep-title` (input) 追加
  - 005: `#rep-organizer` (input) 追加
  - 007A: `#rep-fax` + `#rep-office-name` (input × 2) 追加
  - 007B-1: `#rep-accounting-note` (textarea) 追加

### 5.2 darwin / linux 両 baseline 必須
- ローカル開発は darwin、CI は ubuntu-latest（linux）
- `result-finalized-{375,1280}-chromium-desktop-{darwin,linux}.png` の 4 枚セット
- **linux baseline 不足のまま push すると CI E2E が必ず fail**

### 5.3 linux baseline 補完手順
1. 初回 push 後、CI run の `test-results` artifact を `gh run download <run-id> -n test-results -D <tmpdir>` で取得
2. `result-finalized-{375,1280}-actual.png` を `result-finalized-{375,1280}-chromium-desktop-linux.png` へ copy
3. 補完 commit を別途 push（`chore(vrt): update linux baselines for ...`）
4. CI 再評価で全 SUCCESS を確認

### 5.4 downloadReport HTML は VRT 対象外
- `downloadReport` は別ウィンドウ blob で開くため、Playwright snapshot は撮影しない
- footer 文言の literal 変更のみなら baseline 更新は不要

---

## 6. 残課題 / 後続候補

### A. Hold / 要運用確認
- **prizeNote / 賞金内訳メモ欄**（REPORT-UX-007C 棚卸し）: 現場で「内訳メモを帳票に出したい」声があれば 007B-1 と同パターンで小粒追加可能
- **prizeBreakdown 構造化** (`[{label, amount}]`): 設計論点多、A/B/C 別賞金や人数別賞金など要設計
- **footer 1行目テンプレート全体の可変化** (`submitNote1`): fax / officeName と二重管理になるため要設計
- **footer 2行目の非表示化**: accountingNote とは別の ON/OFF 設計が必要、現状の空欄 → default fallback とは別概念
- **submitNote1 / submitNote2 / footerNotes 配列**: footer 構造化の選択肢、要設計
- **organizer / officeName / title の概念整理**: 現状 3 field 分離しているが、運用差異がもっと明確になればドキュメント化推奨
- **`getFee()` の state 化 / 会費単価可変化** (`state.fees`): 会費 0/500/500/1000 literal の外出し、大型タスク

### B. 小粒で可能だが優先度低
- `normalizeReportPrize` のカンマ入力対応（`'5,000' → 5000`）。trivial fix だが運用要望未顕在化
- `priceEl → prizeEl` の変数名タイプミス修正（[shogi_v4.html:7510](../../shogi_v4.html)、機能影響ゼロ）
- `#rep-fax` の `inputmode="tel"` 化（電話番号入力に最適化、現状 `inputmode` 未指定）
- 文字列 normalize helper の共通化（`title` / `organizer` / `place` / `fax` / `officeName` で `trim + 空欄 → default` パターンが重複、共通 helper 化可能だが効果薄）

### C. 固定維持でよいもの
- 表示ラベル `会費合計：` / `賞金：` / `収支：`（[shogi_v4.html:7210-7212](../../shogi_v4.html)）
- 通貨表記 `円` / `▲` 接頭辞
- 帳票テーブルの基本ラベル（「主催」「日付」「時間」「場所」「担当役員」「正」「副」「参加人数」「収支」「結果」「お名前」「お住まい（市町村のみ）」「申し送り事項」）
- 印刷 CSS `@page{size:A4;margin:10mm}` / inline style 群
- 賞金内訳テンプレートの再導入（撤去済、再追加しない）

### D. 次に別 UX として進める候補
- ラベル「場所」→「会場」改名の影響棚卸し（REPORT-UX-008 候補）
- `printResults` / 印刷導線改善（REPORT-PRINT-001 候補）
- PDF / 共有導線改善（スマホからの印刷・PDF 共有）
- 報告書とは別の結果表示 UX 改善

---

## 7. 明示的に今回やらない判断

| 項目 | 判定 | 理由 |
|------|------|------|
| 賞金まわりの追加改修 | **Skip** | REPORT-UX-007C 棚卸し結果。003A/003B で十分整理済、運用要望未顕在化 |
| prizeNote / prizeBreakdown 追加 | **Hold** | 実運用ニーズが出てから判断。技術的には小粒だが UI 肥大化リスク |
| カンマ入力対応 | **Hold** | 困りごとが出てから。type=number でブラウザ側阻止が一般的 |
| footer 1行目テンプレート全体可変化 | **Hold** | fax / officeName との二重管理リスク。テンプレ補間方式の設計合意必要 |
| footer 2行目の非表示化 | **Hold** | accountingNote の空欄 → default 運用とは別概念。ON/OFF 設計が必要 |
| getFee state 化 | **Hold** | 大型タスク、master 設定 UI まで波及 |
| ラベル「場所」→「会場」改名 | **Defer to 008** | 別タスクで影響棚卸しから |
| printResults / PDF 改善 | **Defer to REPORT-PRINT-001** | 別タスクで |

---

## 8. 次の推奨アクション

REPORT-UX-009（本 closure）後の次候補。

### 第一候補: REPORT-UX-008 — ラベル「場所」→「会場」改名の影響棚卸し
- **種別**: analysis-only 推奨
- **理由**: 実運用上は「場所」より「会場」の方が自然な日本語。ただし以下に影響が広がるため、analysis-only で範囲を先に確定するのが安全。
  - UI ラベル: `#pane-result > div > label`（[shogi_v4.html:228](../../shogi_v4.html) `<label>場所</label>`）
  - 報告書出力: 「場所」行（[shogi_v4.html:7198](../../shogi_v4.html) `>場所<`）
  - state schema コメント / docs / HANDOFF.md / 既存テスト assert
  - placeholder（変更不要かもしれないが棚卸し対象）
  - 旧 `state.report.place` の field 名は **改名しない**（保存データ互換のため key 名は維持）
- **次にやる場合**: 棚卸し → 影響範囲確定 → 改名 PR を小粒で（VRT は form ラベル変更で result-finalized 4 枚更新の可能性）

### 第二候補: REPORT-PRINT-001 — 印刷 / PDF / 共有導線の棚卸し
- **種別**: analysis-only 推奨
- **理由**: 現場ではスマホからの印刷・PDF 共有が課題。報告書UXの次フェーズとして有力。
  - `downloadReport()` の `window.open(blob) → win.print()` 経路（iOS Safari / Android Chrome の挙動差異）
  - `printResults()`（対戦成績印刷、報告書とは別経路、[shogi_v4.html](../../shogi_v4.html)）
  - PDF 保存 UX（ブラウザの「PDF として保存」フロー）
  - 共有導線（mailto / LINE 共有 / ダウンロード）
- **次にやる場合**: 棚卸し → どの導線が一番現場で詰まるかを特定 → 小粒 PR で改善

### その他（保留）
- REPORT-UX-007C で Hold 判定された各項目（運用要望が出てから着手）
- SHOGI-LEARN 系（別系統、本シリーズの範囲外）

---

## 9. 関連ファイル

- 実装: [shogi_v4.html](../../shogi_v4.html)（normalize 系 helper / `populateReportFields` / `updateReportFieldFromElement` / `bindReportEvents` / `resetAll` / `downloadReport` / 入力フォーム `#pane-result` 内）
- テスト:
  - [test/test_report_ux_001.js](../../test/test_report_ux_001.js) — 報告書 date/time input UX
  - [test/test_report_ux_002.js](../../test/test_report_ux_002.js) — classes-driven downloadReport
  - [test/test_report_ux_003.js](../../test/test_report_ux_003.js) — 003A / 003B 賞金額
  - [test/test_report_ux_004.js](../../test/test_report_ux_004.js) — 大会名
  - [test/test_report_ux_005.js](../../test/test_report_ux_005.js) — 主催者
  - [test/test_report_ux_006.js](../../test/test_report_ux_006.js) — 場所
  - [test/test_report_ux_006b.js](../../test/test_report_ux_006b.js) — 日付/開始/終了
  - [test/test_report_ux_006c.js](../../test/test_report_ux_006c.js) — sei/fuku/note
  - [test/test_report_ux_007a.js](../../test/test_report_ux_007a.js) — FAX / 事務局名
  - [test/test_report_ux_007b.js](../../test/test_report_ux_007b.js) — 会計提出文
- VRT baseline: [test/e2e/visual_regression.spec.js-snapshots/result-finalized-*.png](../../test/e2e/visual_regression.spec.js-snapshots/)
- 関連 closure docs: [docs/notes/20260513_shogi_a5_1_save_completion_summary_v0.md](20260513_shogi_a5_1_save_completion_summary_v0.md) / [docs/notes/20260516_shogi_reset_ux_series_closure.md](20260516_shogi_reset_ux_series_closure.md)
