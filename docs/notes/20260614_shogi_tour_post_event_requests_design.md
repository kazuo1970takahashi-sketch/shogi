# 大会後 現場要望 設計メモ（恒久対応） — LIVE-MOBILE-SCOREBOARD-001

- 作成日: 2026-06-14
- 対象: `shogi_v4.html`（沼津支部 月例将棋大会 運営ツール）
- 関連実装ブランチ: `feature/shogi-tour-live-mobile-scoreboard-001`
- 種別: 設計メモ（後続実装用）。本ファイル自体はコードを変更しない。

---

## 0. 背景と本メモの位置づけ

2026-06-14 の月例大会運営後に出た現場要望のうち、**今回（即日対応）で実装した 3 点**は
別途コミット済み（PDF 本文や星取表の実物は PR を参照）。本メモは、今回スコープ外とした
**恒久対応 3 点**の設計方針を記録し、後続タスクが「暫定実装に逃げず」着手できるようにする。

### 今回実装した 3 点（要約・本メモの対象外）

| # | 項目 | 実装概要 | 既存データ互換 |
|---|------|----------|----------------|
| 1 | スマホ閲覧用リアルタイム星取表ビュー | `#scoreboard` / `#viewer` / `#mobile-standings` hash で起動する閲覧専用フルスクリーンビュー。`calcFinal` / `computeDisplayRanks` / `getWins` を再利用。横スクロール + 氏名列 sticky 固定。別タブの `save()` を `storage` イベントで受けて自動更新。 | 影響なし（読取専用・state 構造不変） |
| 2 | 対局管理 名前ボックス改善 | `.winner-btn` の `width:7em + ellipsis + nowrap` を撤廃し、折り返し + `min/max-width` + `min-height` で全文表示。番号プレフィックス（`12｜`）は維持。 | 影響なし（CSS のみ） |
| 3 | PDF ファイル名 / 本文タイトル改善 | `buildSafePdfFilename` / `buildTournamentPdfFilename` / `buildPdfDocHeaderHtml` を追加。ファイル名を「YYYY年M月度{大会名}{種別}」に統一。本文に対象月 / 開催日を併記。 | 影響なし（出力文字列のみ。state 構造不変） |

### 今回あえて持ち越した「データ構造に踏み込む」判断

- **対象月（targetMonth）の独立フィールド化**は今回見送り、PDF では暫定的に
  `state.report.date`（開催日）の年月から `YYYY年M月度` を導出している
  （`buildTournamentTargetMonthLabel()`）。
  → 月例会の「対象月」と「実開催日」が食い違う運用（例: 6月度を 7/2 に順延開催）に
  正しく対応するには、本メモ §C の `tournaments.targetYear` / `targetMonth` を正本とする。
- **ふりがな**は今回 1 文字も表示・保存していない。氏名のみ表示の既存挙動を維持した。
  暫定的に大会参加者へ手入力するのは禁止方針のため、本メモ §A の恒久設計に従う。

---

## 0.6 Codex レビュー対応（PR #200 No-Go → 修正）

2026-06-14 の Codex レビューで PR #200 は No-Go 判定。以下の Must Fix / Should Fix に対応した
（いずれも `shogi_v4.html` の表示・CSS・コメントのみ。state 構造／順位計算／保存読込／勝敗入力
ロジックは不変）。

### Must Fix 1 — 閲覧専用ビューの read-only 徹底（運営画面への戻り導線を撤去）

- 旧実装はスマホ閲覧ビュー(`#scoreboard`)のヘッダに「運営画面へ」ボタン(`.sb-back` / `#sbBackBtn`)
  があり、押下で hash を外して運営画面（保存・読込・リセット・勝敗入力・編集UI）へ到達できた。
  → read-only 要件に反するため **ボタン・ハンドラ・CSS・`exitScoreboardRoute()` を全廃**。
- **設計方針（恒久）**: 閲覧URL（`#scoreboard` / `#viewer` / `#mobile-standings`）には運営画面への
  戻り導線（ボタン／リンク）を一切置かない。運営者が運営画面へ戻る必要がある場合は
  「別タブ運用」または「`#scoreboard` を外した運営URLを直接開く」運用とする。
  hash を外した場合の表示切替は `applyScoreboardRoute()` が担うが、これは閲覧ビュー内の
  UI導線ではなく「運営URLを直接開く」運用に対応するものである。

### Must Fix 2 — PDF ファイル名と `.pdf` 拡張子（A 案を採用）

- 現行 PDF 出力は全経路（`printResults` / `printPairings` / `downloadReport`）が
  **`Blob(text/html)` + `window.open()` + `win.print()`** 方式で、生成物は HTML。
  利用者がブラウザの印刷ダイアログで「PDF に保存」を選ぶと、ブラウザが `<title>` を
  ファイル名候補として提示し、`.pdf` は**ブラウザ側のPDF保存動作で付与**される。
- **結論（A 案）**: `.pdf` 拡張子は**アプリのコードで保証できない（ブラウザ依存）**。本実装の
  スコープは「保存ダイアログに出る “基底名” を URL 由来でなく**大会情報由来**に改善する」ことに
  限定する。`<title>` には拡張子なしの安全な基底名のみを入れる（`.pdf` を埋めると環境により
  二重拡張子になり得るため付与しない）。`buildTournamentPdfFilename()` の直前コメントにも明記。
- 基底名は `sanitizeFilenamePart` で禁止文字／制御文字／空白を除去し、未入力でも `'将棋大会'` に
  フォールバック。`undefined` / `null` / `NaN` / 危険文字が最終ファイル名へ混入しないことを確認済み。

### Should Fix 1 — 星取表の負け表示を `●` → `×` に変更

- 現場要望「○×の星取表」に合わせ、スマホ星取表ビューの負けマークを `●` から `×` に変更
  （`buildScoreboardClassTableHtml` / 凡例 `○=勝ち／×=負け／－=未対局`）。勝ち `○` は維持。
- なお最終結果タブ／印刷帳票の既存表示（`buildResultsRoundCell*Html` / `printResults`）は
  本 PR スコープ外のため `○/●` のまま据え置き（後続で統一する場合は別タスク）。

### Should Fix 2 — 対局カードの氏名ボタンがスマホ幅で横あふれする件

- `.winner-btn`(`max-width:13em`) の親 `.winner-row` が `nowrap` の横並びのままで、長い氏名2名だと
  375px 幅で第2対局者ボタンが画面外へはみ出し、勝敗入力が押しづらかった（検証で再現）。
- **対処**: 親に `.winner-row{flex-wrap:wrap}`（スマホ幅では `justify-content:center;row-gap`）を付与し、
  入り切らない時だけ折り返す。加えて根本原因であるグリッド項目のブローアウトを
  `#pane-tournament-grid>div{min-width:0}` で抑止（pane をトラック幅に収める）。
- **PC 運営画面は不変（最優先）**: 1fr トラックが十分広く `min-width:auto` でも破綻しないため、
  通常氏名は折り返さず従来通り横並び。1280px で 2 カラム維持・横あふれなしを検証済み。

### Should Fix 3 — PDF の「支部名」について

- 今回の PDF 大会名は **`state.report.title` 由来**（既定 `沼津支部月例将棋大会`）。`buildPdfDocHeaderHtml`
  / 各帳票見出しは `normalizeReportTitle(state.report.title)` を表題に用いる。
- **支部名を独立項目として持たせる対応は本スコープでは行わない（後続）**。支部名・主催情報を
  大会名と分離して持つ恒久対応は本メモ §C（`tournaments` スキーマ）/ §B の参加者マスタ設計に
  合流させる。現状の「支部名は report.title に含む前提」は暫定運用である旨を明記しておく。

### Must Fix 2（テスト追従） — PDFファイル名固定テストの新仕様更新

- PDFファイル名形式の変更（Must Fix 2）に伴い、ファイル名を固定値で検証していた node テスト
  **8 件**を新仕様へ追従更新した（旧 No-Go 時点では旧形式を期待して FAIL していた）。
  - `test/test_report_print_006.js`（`printResults` の `<title>`）
  - `test/test_report_ux_004.js` / `005.js` / `006.js` / `006b.js` / `006c.js` / `007a.js` / `007b.js`
    （`downloadReport` の `<title>` ほか）
- **正とするファイル名仕様**: 旧 `{大会名}_{YYYYMMDD}_{種別}` ではなく、
  **新仕様 `{YYYY年M月度}{大会名}{種別}`**（`_` 区切り・8桁連続日付を使わない＝URL 由来でない）。
  **YYYYMMDD 形式へは戻さない。**
- assertion の意図は維持：URL 由来でない／大会情報由来／種別が分かる／危険文字（OS 禁止文字）除去／
  日付未入力でも `undefined`/`null`/`NaN` にならず graceful fallback（月度ラベル省略で成立）。
- XSS 期待の更新：新仕様では `<title>` の基底名は **`sanitizeFilenamePart` が危険文字（`< > / : * ? " < > |` 等）を
  除去**する方式のため、raw タグも実体参照も `<title>` に残らない（除去方式で XSS 安全）。
  ※ 選手名など「ファイル名でない」箇所は従来どおり `escapeHtml`（実体参照化）を維持。
- `printResults` は共通 helper `buildTournamentPdfFilename` / `buildPdfDocHeaderHtml` 経由で
  `normalizeReportTitle` / `normalizeReportDateForInput` を必ず通すことをテストで担保。
  `doc-header` 併記に伴う h2 余白などの期待値（`margin-bottom:16px→6px`）は最小限で更新。
- 結果: `bash test/run_tests.sh shogi_v4.html` が **PASS=95 / FAIL=0 / WARN=0**。
- **VRT（visual regression）について**: VRT は**必須 CI 対象外**。ローカルで VRT を実行する場合は、
  対局管理レイアウト変更（`.winner-row` 折返し等）の影響で必要に応じ **`tournament-paired-*` baseline の
  更新**が要る一方、**`result-finalized-*` は不変**（最終結果タブの構造は本対応で変えていない）。

---

## A. ふりがな ruby 表示 恒久対応

### A-1. 原則

1. ふりがなは **参加者マスタ（branch master）に正式項目として保持**する。氏名文字列での
   突き合わせはしない（同姓同名・改姓で破綻するため）。
2. 紐づけは **`participantMasterId`** を前提にする。
3. 大会参加者レコードには登録時点の **`nameSnapshot` / `kanaSnapshot`** を保持し、
   マスタを後日修正しても **過去大会結果の氏名・ふりがな表示が遡って変わらない**ようにする。
4. ふりがな未登録時は **氏名のみ**を表示する（ルビなし）。空 `<rt>` を出さない。

### A-2. データモデル（最小差分）

既存 `state.players[cls][i]` は `{id, name, entry_no, ...}`。これを破壊せず、以下を追加する。

```jsonc
// 参加者マスタ側（branch master の 1 レコード）
{
  "participantMasterId": "pm_xxxx",   // 不変。ユーザーには出さない / 編集不可
  "name": "長谷川さくらこ",
  "kana": "はせがわさくらこ",          // ← ふりがなの正本
  "branch": "沼津",
  "updatedAt": "2026-06-14T12:00:00+09:00"
}

// 大会参加者側（state.players[cls][i] に追加するフィールド）
{
  "id": "a1",
  "entry_no": 1,
  "participantMasterId": "pm_xxxx",   // マスタ参照（任意。無い旧データも許容）
  "name": "長谷川さくらこ",            // = nameSnapshot（既存フィールドを踏襲）
  "kanaSnapshot": "はせがわさくらこ"   // ← 追加。登録/同期時にマスタからコピー
}
```

- `kanaSnapshot` が無い旧データは `normalizeState` の schema 既定で `''`（=ルビなし表示）に
  正規化する。**既存の順位計算 / 対局結果入力 / 保存読込ロジックには一切触れない。**
- マスタ → 大会参加者への kana コピーは、既存の `syncBranchMasterOnSave()` /
  `updateBranchMasterFromTournament()` と同じ「保存時のみ同期」タイミングに乗せる。

### A-3. 共通 helper（各画面で個別に ruby HTML を組み立てない）

```js
// 氏名 + ふりがなを <ruby> でレンダリングする共通 helper。
//   - name / kana は必ず escape してから DOM に入れる（XSS 対策）。
//   - kana が空なら氏名のみ（<ruby> を使わない）。
//   - 可能なら innerHTML ではなく DOM API（createElement('ruby'/'rt')）で生成する。
function renderPlayerNameWithRuby(name, kana){
  var safeName = String(name == null ? '' : name);
  var safeKana = String(kana == null ? '' : kana).trim();
  var ruby = document.createElement('ruby');
  ruby.appendChild(document.createTextNode(safeName)); // textContent 経由で自動 escape
  if (safeKana) {
    var rt = document.createElement('rt');
    rt.textContent = safeKana;
    ruby.appendChild(rt);
  }
  return ruby; // 呼び出し側で appendChild。文字列が必要な場合は escapeHtml 済みの ruby HTML を別 helper で。
}
```

- 文字列（innerHTML 連結）が必要な経路（PDF 出力 / 既存 `build*Html`）向けには、
  `escapeHtml(name)` / `escapeHtml(kana)` を通した **escape 済みの ruby 文字列を返す版**を
  併設する（`renderPlayerNameWithRubyHtml(name, kana)`）。innerHTML には escape 済み文字列のみ。

### A-4. ruby 表示仕様（CSS）

- ふりがなは氏名の**真上**に小さく表示（Word/Excel のルビ相当）。下に別行表示にはしない。
- `ruby { ruby-position: over; }`、`rt { font-size: 0.5em〜0.6em; }`（氏名の 50〜60%）。
- スマホ星取表でルビが行高を圧迫しないよう、星取表セルでは `rt` の `line-height` を詰める。
- PDF 出力でも同じ `<ruby><rt>` を使う。印刷時に潰れる場合のみ `rt` の `font-size` を微調整。

### A-5. 適用対象画面（共通 helper 経由で順次差し替え）

参加者一覧 / 対局管理（`.winner-btn` 等）/ 順位表 / スマホ星取表 / PDF 出力 / 報告書 /
将来の大会履歴表示。**各画面が独自に `<ruby>` を組まない**。

---

## B. 参加者マスタ スプレッドシート形式 一覧編集

### B-1. 目的

ふりがなは大会当日に正しく整備されないことが多い前提で、**後日まとめて**マスタを
整備できる一覧（表）編集 UI を用意する。特に**ふりがな未入力者を見つけやすく**する。

### B-2. 要件

1. 参加者マスタを**表形式**で一覧表示し、セル上で直接編集（1 人ずつ詳細を開かない）。
2. ふりがな未入力者をハイライト / フィルタできる。
3. 保存前に**変更差分**（どのセルを変えたか）を提示してから確定する。
4. **保存済み大会結果のスナップショット（`nameSnapshot` / `kanaSnapshot`）は変更しない。**
   マスタ編集は「今後の大会」にのみ効く。過去結果の表示は遡って変わらない（§A-1-3）。
5. `participantMasterId` は**編集不可 / 内部管理**。ユーザーが誤って壊せない。
6. 将来 **CSV インポート / エクスポート**へ発展できる列構成にする。

### B-3. 表示候補列

| 列 | 編集可否 | 備考 |
|----|----------|------|
| ID (`participantMasterId`) | 不可（表示も任意） | 内部管理。誤編集防止 |
| 氏名 (`name`) | 可 | |
| ふりがな (`kana`) | 可 | 未入力を強調 |
| 支部 (`branch`) | 可 | |
| 支部員/一般 | 可 | 会費区分と連動 |
| 会費区分 | 可 | `getFee` 系と整合 |
| 備考 | 可 | |
| 有効/無効 | 可 | 退会者の論理削除 |
| `updatedAt` | 不可（自動） | 監査用 |

### B-4. 実装上の注意

- 既存 `loadBranchMaster()` / `saveBranchMaster()` を SoT として使い、DOM を SoT にしない。
- 編集はメモリ上の編集バッファに溜め、「保存」押下時に差分確認 → `saveBranchMaster()`。
- セル入力は IME-safe（既存 report 入力欄と同様、`input` で state 更新・`change` で確定書戻し）。
- 破損マスタ（`_loaded_with_corruption`）時は編集を開かず、既存の復旧導線に委ねる。

---

## C. 月例会結果アーカイブ / 大会履歴 DB 化

### C-1. 目的

「過去の対戦成績」= 今大会内の履歴ではなく、**過去の月例会結果の蓄積**。将来的に
過去対戦成績 / 年間トータル順位 / 年間ポイントへ発展させる土台を作る。

### C-2. スキーマ（正規化）

```jsonc
// tournaments: 大会 1 件
{
  "id": "t_2026_06",
  "name": "沼津支部月例将棋大会",
  "branchName": "沼津",
  "targetYear": 2026,
  "targetMonth": 6,            // ← 「対象月」の正本（開催日とは独立）
  "heldDate": "2026-06-14",    // ← 実開催日
  "type": "monthly",
  "createdAt": "2026-06-14T..."
}

// tournamentPlayers: 大会 × 参加者（スナップショット保持）
{
  "id": "tp_xxx",
  "tournamentId": "t_2026_06",
  "participantMasterId": "pm_xxxx",  // 氏名でなく ID で紐づけ
  "nameSnapshot": "長谷川さくらこ",
  "kanaSnapshot": "はせがわさくらこ",
  "branchSnapshot": "沼津",
  "className": "Aクラス",
  "entryNo": 1,
  "rank": 1,
  "wins": 3,
  "points": 0
}

// games: 1 対局
{
  "id": "g_xxx",
  "tournamentId": "t_2026_06",
  "roundNo": 1,
  "className": "Aクラス",
  "sentePlayerId": "tp_xxx",
  "gotePlayerId": "tp_yyy",
  "winnerPlayerId": "tp_xxx",  // null = 未確定 / 引分
  "result": "sente_win"
}
```

### C-3. 設計原則

1. **氏名だけで強引に紐づけない。** 横断集計は `participantMasterId` をキーにする。
2. **保存済み大会データを壊さない。** 既存 `state`（A/B 固定 dict）はそのまま残し、
   履歴 DB は「確定済み大会」を別ストア（例: `localStorage['shogi_archive']`）へ
   **追記**する形にする。現行の `state.players/results/pairings` 構造は不変。
3. 大会確定（全クラス done）時に、現行 `state` → 上記スキーマへ**変換して 1 大会分を追記**。
   変換は純関数（`buildTournamentArchiveFromState(state)`）として実装し、既存ロジックに混ぜない。
4. `targetMonth` を正本化することで、§0 の PDF 対象月（暫定: 開催日由来）を将来
   `tournaments.targetMonth` 参照に差し替えられる。

### C-4. 将来拡張（DB 化後）

参加者別の過去成績 / 直接対戦成績 / 年間順位 / 年間ポイント / 月例会別順位推移 /
クラス別成績 / 表彰・昇級降級判断の補助。いずれも上記 3 テーブルの集計で導出可能。

---

## D. 横断的な禁止事項・互換性メモ

- 既存の **順位計算 (`calcFinal` / `computeDisplayRanks`) / 対局結果入力 (`setWinner` /
  `submitRound`) / クラス別開始 (`startTournamentForClass`) / 保存読込 (`save` / `load` /
  `normalizeState`)** を不用意に変更しない。§A〜§C は**追加フィールド + 別ストア + 純関数**で
  実現し、既存経路には触れない方針。
- すべての新規フィールドは `normalizeState` の schema 既定（空文字 / 既定値）で**旧データを
  後方互換**にする。旧データを読んでも壊れない・既定表示になる、を必須要件とする。
- ふりがな・氏名は表示・PDF・innerHTML のいずれでも **escape 必須**。`<ruby>/<rt>` は
  可能なら DOM API 生成、innerHTML を使う場合は escape 済み文字列のみ。

---

## E. スマホ星取表ビューの今後（参考）

今回は「同一ブラウザ内 state（localStorage）を使った閲覧専用ビュー」までを実装し、
外部公開 / QR コード生成 / リアルサーバー同期は対象外とした。別端末からの閲覧を恒久対応
する場合は、§C の履歴 DB / 確定スナップショットを read-only で配信する経路（公開 URL or
静的書き出し）を別途設計する。星取表のレンダリング (`buildScoreboardClassTableHtml`) は
state 入力の純粋に近い関数のため、配信形態が変わっても再利用できる。
