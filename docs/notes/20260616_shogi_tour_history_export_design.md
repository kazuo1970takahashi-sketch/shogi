# 大会履歴 CSV / JSON エクスポート 設計メモ — SHOGI-TOUR-HISTORY-EXPORT-DESIGN-001

| 項目 | 値 |
|---|---|
| Task ID | `SHOGI-TOUR-HISTORY-EXPORT-DESIGN-001` |
| 作成日 | 2026-06-16 |
| 対象 | `shogi_v4.html`（沼津支部 月例将棋大会 運営ツール）。**本メモはコードを変更しない** |
| 種別 | docs-only 設計メモ（後続実装用 CSV / JSON エクスポート仕様） |
| ベース branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（orphan clean base。`main` ではない。tip `f5a822c`） |
| 関連 | [大会履歴 MVP 設計（WS-C / §16 Step 2 の親）](20260615_shogi_tour_history_mvp_design_001.md)／[Phase 2 プログラム親（価値ピラー「記録が残る」）](20260616_shogi_tour_phase2_program_001.md)／[大会後 現場要望 設計（§C 正規化 DB ビジョン正本）](20260614_shogi_tour_post_event_requests_design.md) |

---

## 0. このメモの位置づけ・スコープ

### 0.1 目的

過去大会（`shogi_archive` に蓄積した履歴）を、**運営後に再利用できる形で CSV / JSON で出力する**
ための最小仕様を設計する。再利用の想定先:

- **表彰** — クラス別順位・優勝者一覧を表彰式・賞状作成に流用する。
- **会計** — 参加者の参加費区分・金額を集計表（受付・収支報告）に流用する。
- **次回大会準備** — 参加者名簿（氏名・ふりがな・番号・支部員区分）を次回受付の下敷きにする。
- **問い合わせ対応** — 「あの月の○クラスの結果は？」に履歴データで答える。
- **将来の年間集計・参加者マスタ統合** — Phase 3 の横断集計（年間順位・直接対戦）や
  `participantMasterId` 正本化（M5）へ純データで橋渡しする（§9）。

[Phase 2 親 §1.2 の価値ピラー「**記録が残る**」](20260616_shogi_tour_phase2_program_001.md)は
「WS-C（大会履歴）／ **CSV** ／ 将来の年間集計（Phase 3）」と並べている。本メモはその CSV / JSON の
中身を初めて具体化する **WS-C の後続スライス**である。

### 0.2 上位設計との関係（重複しない / 切り出す）

| ドキュメント | 役割 | 本メモとの関係 |
|---|---|---|
| [大会履歴 MVP 設計 §16](20260615_shogi_tour_history_mvp_design_001.md) | 履歴の保存・一覧・read-only 閲覧（**Step 1**）。「CSV 入出力」を明示的に**やらない**と置き、`Step 2＝過去大会の PDF 再出力 / JSON エクスポート整備`に送った | 本メモ＝**その Step 2 のうち CSV / JSON 部分**の詳細設計 |
| [post_event §C](20260614_shogi_tour_post_event_requests_design.md) | 正規化 3 テーブル（`tournaments` / `tournamentPlayers` / `games`）の完成形ビジョン。B-2-6「将来 CSV インポート / エクスポートへ発展できる列構成」も seed | 本メモの **normalized JSON（§5.2）**はこの 3 テーブルを出力スキーマの土台に使う |
| [Phase 2 親 §4](20260616_shogi_tour_phase2_program_001.md) | 横断原則（非破壊・互換・データ凍結・実データ非コミット） | 本メモは §7 でこれを export 文脈に具体化（read-only・state 不変・PII 注意） |

**本メモは実装しない。** `shogi_v4.html`・保存データ実装・テスト・workflow・package を一切変更しない。
PR 作成・branch 作成・commit・push 以外（merge / Ready 化 / production 反映 / branch 削除）を**含意しない**。

### 0.3 現状（エクスポートは未実装。読み出し基盤は #214 で実装済み）

- **エクスポートは存在しない。** 現行 `shogi_v4.html` に CSV 出力経路は 1 つも無い。JSON の持ち出しは
  `saveData()` / `saveDataAsFile(json)`（**当日 state 丸ごと**を `Blob(application/json)` でローカル
  ダウンロード）と、`shogi_branch_master_YYYYMMDD.json`（マスタ書き出し）の **2 経路のみ**で、いずれも
  「履歴 1 大会を選んで成績表として出す」用途ではない。
- **読み出し基盤は #214（WS-C Step 1）で既に実装済み。** 本メモの export はこの上に**純関数を足すだけ**で成立する:
  - `ARCHIVE_KEY = 'shogi_archive'` / `ARCHIVE_SCHEMA_VERSION = 1` / `loadArchive()` /
    `normalizeArchive(raw)` … 履歴ストアの読み出し（不在・破損は「0 件」に正規化）。
  - 履歴 1 件の形（`buildArchiveEntryFromState` が生成）= `{ schema_version, savedAt, identity{...}, snapshot }`。
    `identity` は一覧用に集計済み（`tournament_id` / `title` / `heldDate` / `targetMonthLabel` /
    `classes[]` / `participantCount` / `champions[]`）、`snapshot` は確定 `state` の deep clone。
  - `withSourceState(sourceState, fn)` … global `state` を一時的に snapshot へ差し替えて `fn()` を実行し、
    `finally` で必ず復元。`calcFinal` / `computeDisplayRanks` / `getWins` / `getName` / `getFee` 等は
    global `state` 参照なので、**過去 snapshot の成績・参加費を出すにはこの helper 越しに呼ぶ**。
  - `findArchiveEntryByTid(archive, tid)` / `sortArchiveTournaments(list)` … 1 件取得・一覧整列。

→ export は「**履歴 entry（identity + snapshot）を読み、純関数で CSV 文字列 / JSON 文字列に整形し、
既存の Blob ダウンロード機構で端末に保存する**」だけ。`shogi_archive` も `shogi_v4` も書き換えない（§7）。

---

## 1. 前提・用語

- **履歴 1 件 = 確定 1 大会**。識別子 `identity.tournament_id`（`t_YYYY_MM_DD` 形式。無い場合 #214 の
  `synthArchiveTid` が `heldDate` または保存時刻から合成）。
- **データ源は snapshot のみ**。export は live `state` ではなく履歴 snapshot を読む（現行大会のエクスポートも
  §6.3 のとおり「まず履歴へ保存 → その entry を export」に寄せ、データ源を 1 本化する）。
- **ブラウザ内生成・ローカルダウンロード前提**。サーバ送信・外部 API 呼び出しはしない（§7）。
- **既存 helper を再利用**（新規実装を最小化）:
  - 成績: `calcFinal(cls)` → `{p, A, B, C, played}`（`A`=勝数 / `B`=対戦相手の勝数和 / `C`=勝った相手の勝数和 /
    `played`=勝敗が付いた対局数）、`computeDisplayRanks(finals, cls)`（同順位は欠番方式 12,12,14）、
    `isSameDisplayedRank` / `getWins(cls)`。
  - 氏名・ふりがな: `getName(id, cls)` / `player.yomi`（FURIGANA-MVP-001。`normalizeYomi` 正規化済み・既定 `''`）。
  - 参加費: `getFee(member, grade)` / `calcTotal()`。
  - ダウンロード: `saveDataAsFile(json)` の `Blob` + `URL.createObjectURL` + `a.download` + `revokeObjectURL` 機構。
  - ファイル名安全化: `sanitizeFilenamePart()` / `buildSafePdfFilename()`（OS 禁止文字除去・空フォールバック）。

---

## 2. 検討項目への結論（サマリ）

| # | 検討項目 | 本メモの結論 | 詳細 |
|---|---|---|---|
| 1 | データ源 | 履歴 entry（`identity` + `snapshot`）。`withSourceState` 越しに既存集計関数を流用 | §1・§3 |
| 2 | CSV の分割 | **複数ファイル**（`players` / `standings` / `matches` / `tournament_summary`）を基本。1 ファイル統合は補助 | §4 |
| 3 | CSV の安全性 | RFC4180 quoting + **数式インジェクション無害化** + UTF-8 BOM（Excel の日本語/ふりがな対策） | §4.4 |
| 4 | JSON の形 | (a) snapshot 近似 raw（互換最優先）と (b) §C 正規化 normalized（移行最優先）の **2 種**。`schema_version` 付き | §5 |
| 5 | UI 導線 | 履歴一覧 / 履歴詳細から export。現行大会は「履歴保存 → export」に寄せる。PC 優先・誤操作低リスク | §6 |
| 6 | 安全性 | read-only・state 不変・localStorage 非書換・実データ非コミット・PII 注意・ローカル DL | §7 |
| 7 | 実装分割 | EXPORT-001..005 の小スライス（standings → players → matches → JSON → UI 整理） | §8 |
| 8 | M5 との関係 | MVP は `name` / `yomi` 文字列を凍結出力。`participantMasterId` / `kanaSnapshot` は**予約列/予約フィールド**で先送り | §9 |

---

## 3. エクスポート対象データ

履歴 entry から取り出せる項目を、再利用先（表彰 / 会計 / 次回準備）別に整理する。
**「snapshot に実在する値」と「現データモデルに無い値（＝将来フィールド）」を明確に分ける**のが本節の主眼。

### 3.1 大会情報（`identity` + `snapshot.report`）

| 出力項目 | ソース | 備考 |
|---|---|---|
| `tournament_id` | `identity.tournament_id` | 一意キー。`t_YYYY_MM_DD` or 合成 id |
| 大会名 | `identity.title` | `normalizeReportTitle(report.title)` 凍結値 |
| 開催日 | `identity.heldDate` | `YYYY-MM-DD`（実開催日） |
| 対象月 | `identity.targetMonthLabel` | `YYYY年M月度`（開催日由来の暫定ラベル。正本化は §C 後） |
| 保存日時 | `savedAt` | 履歴へ凍結した時刻（ISO）。「最終更新」ではなく「保存日時」 |
| クラス | `identity.classes[]` `{id, name}` | クラス数・各クラス名 |
| 参加人数 | `identity.participantCount` | 集計済み |
| 各クラス優勝者 | `identity.champions[]` `{classId, name}` | 任意。表彰に直結 |
| 主催 / 会場 / 予算 | `snapshot.report.organizer` / `.place` / `.prize` | 会計サマリに併記可（運営情報。§3.5 の注意） |

> 注: `report` には互換目的で残置された未使用フィールド（例: `fax`）もある。**実在しない運用項目を
> export に復活させない**（FAX 文言は報告書 PDF から既に削除済み）。出力対象は上表の実使用項目に限る。

### 3.2 参加者情報（`snapshot.players[cls][i]`）

| 出力項目 | ソース | 備考 |
|---|---|---|
| 番号 | `player.entry_no` | 受付番号（クラス内連番・欠番維持） |
| 氏名 | `player.name`（or `getName(id, cls)`） | |
| ふりがな | `player.yomi` | **現フィールドは `yomi`**（`kanaSnapshot` ではない。§9） |
| クラス | クラスキー / `classes[].name` | |
| 支部員区分 | `player.member`（`'member'`=沼津支部員 / `'other'`=他） | 会計の区分軸 |
| 中学生以下区分 | `player.grade`（`'chu'`=中学生以下 / `'ippan'`=一般） | 会計の区分軸 |
| 所属 / 支部 | **（現状なし）** | 当日 player に支部名文字列フィールドは無い。`member` から「沼津支部員 / 他」を導出するのみ。支部名正本はマスタ側（§9）。**架空テストでも実支部名を入れない** |

### 3.3 成績情報（`withSourceState(snapshot, …)` 越しの `calcFinal` / `computeDisplayRanks`）

| 出力項目 | ソース | 備考 |
|---|---|---|
| 順位 | `computeDisplayRanks(finals, cls)` | 表示順位（同順位は欠番方式） |
| 勝数 | `finals[i].A` | `getWins` ベース |
| 負数 | `finals[i].played − finals[i].A` | **不戦/引分は無い前提**（§3.4）。`played`=勝敗確定局数 |
| 得点 | = 勝数（`A`） | 本ツールは「勝数」が得点。独立の得点制は無い |
| 同率時の扱い | `B`（対戦相手の勝数和）/ `C`（勝った相手の勝数和）/ 直接対決 | 順位決定の tie-break。`isSameDisplayedRank` が同順位を判定。列として併記すると表彰・問合せで根拠が追える |

> 補足: `B` は SOS（対戦相手の勝数和）、`C` は SB 系（勝った相手の勝数和）に相当する競技用 tie-break。
> **得点列を「勝数とは別物」として出さない**（誤解を生む）。tie-break は別列（`tiebreak_b` / `tiebreak_c`）で明示する。

### 3.4 対局履歴（`snapshot.results[cls][r][m]` = `{p1, p2, winner}`）

| 出力項目 | ソース | 備考 |
|---|---|---|
| round | `r + 1` | `results[cls]` の配列 index + 1 = 回戦 |
| 先手 | `match.p1`（→ `getName`） | `p1` が先手（手番ロールの正本） |
| 後手 | `match.p2`（→ `getName`） | `p2` が後手 |
| 勝者 | `match.winner`（`p1` / `p2` / `null`） | `null` = 未確定 / 未対局 |
| 結果 | 導出: `sente_win`（`winner===p1`）/ `gote_win`（`winner===p2`）/ `undetermined`（`null`） | |
| 不戦 / bye | **（データモデルに無い）** | 本ツールに不戦勝・bye の概念は**無い**。奇数クラスは「運営者を 1 名追加」して解消する運用で、bye レコードは作られない。引分（千日手/持将棋）専用の値も無い。→ export は `winner===null` を「未確定 / 未対局」として出すに留め、`bye` 列を捏造しない |

> **忠実性の制約（重要）**: 対局結果が表せるのは `sente_win` / `gote_win` / `undetermined` の 3 値のみ。
> 「不戦勝」「引分」「bye」を CSV/JSON に正しく出したい場合は **先に `state` 側スキーマ拡張が必要**で、
> 本 export スライスの範囲外（§12 未決）。export は既存データの忠実な書き出しに徹し、無い概念を作らない。

### 3.5 受付・会計に必要な情報（`getFee` / `player.member` / `player.grade`）

| 出力項目 | ソース | 備考 |
|---|---|---|
| 支部員 / 一般 | `player.member` + `player.grade` のラベル化 | 「沼津支部員 / 他」「中学生以下 / 一般」 |
| 参加費区分 | `(member, grade)` の組 | 4 区分 |
| 参加費（円） | `getFee(member, grade)` | `chu`×`member`=0 / `chu`×`other`=500 / `ippan`×`member`=500 / `ippan`×`other`=1000 |
| 合計（クラス / 全体） | `calcTotal()` 同等の合算 | 会計サマリ |
| 支払い確認 | **（フィールド無し）** | 現データモデルに「支払い済みフラグ」は**存在しない**。出すには `state` 拡張が必要（§12 未決）。**実データ・金銭の実績値を repo に入れない**（架空のみ） |

> **PII 注意**: 氏名 × 所属/区分 × 会計は組み合わさると個人特定性が上がる。会計用 CSV は
> **氏名を含めない集計版（区分×人数×金額）**も用意し、氏名入りは「次回準備/問合せ」用途に限定する案を §4.2 に置く。

---

## 4. CSV 出力案

### 4.1 複数ファイル案（基本）

履歴 1 大会につき、用途別に分けた **4 ファイル**を出力する。各ファイルは「1 行 = 1 レコード」で、
表計算ソフトにそのまま取り込める。文字コードは **UTF-8（BOM 付き）**、改行 `CRLF`、区切り `,`。

| ファイル | 1 行の単位 | 主な列（案） | 主用途 |
|---|---|---|---|
| `players.csv` | 参加者 1 名 | `tournament_id, class_id, class_name, entry_no, name, yomi, member_label, grade_label, fee_yen` | 次回名簿 / 会計 |
| `standings.csv` | 参加者 1 名（成績） | `tournament_id, class_id, rank, entry_no, name, yomi, wins, losses, tiebreak_b, tiebreak_c, same_rank` | 表彰 / 問合せ |
| `matches.csv` | 対局 1 局 | `tournament_id, class_id, round, sente_entry_no, sente_name, gote_entry_no, gote_name, winner(sente/gote/undecided)` | 記録 / 検証 |
| `tournament_summary.csv` | 大会 1 件（or クラス別 1 行） | `tournament_id, title, held_date, target_month, class_id, class_name, participant_count, champion_name, fee_total_yen, saved_at` | 会計 / 一覧 |

- **列順は「キー → 識別 → 値」**で固定し、`schema_version` 相当の意味でヘッダ行を**正本**にする
  （取り込み側はヘッダ名で参照。列の追加は末尾追記で後方互換）。
- `standings.csv` の `losses = played − wins`、`same_rank` は同順位フラグ（§3.3）。
- ファイル名は `sanitizeFilenamePart` / `buildSafePdfFilename` を通し、`identity.heldDate`（`YYYYMMDD`）と
  `title` 由来の基底名 + 種別で組む（例 `20260614_沼津支部月例将棋大会_standings.csv`）。PDF 命名と並びを揃える。

### 4.2 1 ファイル統合案（補助）

全レコードを 1 枚の CSV に縦持ちする案（`record_type` 列で `player` / `standing` / `match` / `summary` を判別）。

| | 複数ファイル案（基本） | 1 ファイル統合案（補助） |
|---|---|---|
| メリット | 用途別に直接開ける／列が用途に最適化／表彰・会計で別々に配れる | DL 1 回で全部入る／zip 不要／取りこぼしが無い |
| デメリット | DL 4 回 or zip 化が要る（§6.4）／関連付けは `tournament_id` 経由 | 列がスパース（`record_type` で分岐）／表計算で扱いにくい／会計に氏名が混ざる |
| 向き | **PC で表彰・会計を作る主用途** | バックアップ的な「とりあえず全部」用途 |

→ **基本は複数ファイル**。統合は「全件まとめて 1 枚」を欲しい人向けの補助に留める。
会計用は §3.5 の PII 配慮から、**氏名なし集計版 `fees_summary.csv`（区分×人数×金額）**を別途用意する案も持つ（未決 §12）。

### 4.3 同率・欠番・未確定の表現

- **同順位**: `computeDisplayRanks` の欠番方式をそのまま出す（`rank` 列に 12,12,14 のように出る）。
  `same_rank=true/false` を併記し、取り込み側がくじ引き対象を機械判定できるようにする。
- **未対局/未確定局**: `matches.csv` は `winner=undecided`。`standings.csv` は当該局を負数に数えない（`played` ベース）。
- **クラス未開始/0 件**: 行を出さない（空ファイル or ヘッダのみ）。エラーにしない（履歴 0 件と同じ後方互換思想）。

### 4.4 CSV の安全性（実装時の必須事項）

現行に CSV エスケープ helper は無い（`escapeHtml` は HTML 用、`sanitizeFilenamePart` はファイル名用）。
**新規 `csvCell(value)` 純関数**を 1 つ足し、全セルを必ず通す:

1. **RFC4180 quoting**: 値に `,` / `"` / 改行 を含む場合は `"` で囲み、内部の `"` は `""` に倍化。
2. **数式インジェクション無害化**: 氏名・備考はユーザー入力。先頭が `= + - @` や TAB/CR で始まるセルは、
   表計算ソフトが数式として実行し得る（CSV injection）。**先頭に `'` 等の無害化プレフィックスを付す**か
   quoting と併用して実行を防ぐ。氏名に記号を使う参加者がいても安全に。
3. **UTF-8 BOM**: 日本語氏名・ふりがなが Excel で文字化けしないよう、ファイル先頭に BOM(`﻿`)。
4. **改行正規化**: セル内改行は除去 or `quoting` で保持を選択（取り込み崩れを防ぐ）。

→ テストは `csvCell` を純関数として単体検証（カンマ/引用符/改行/先頭 `=` 入力 → 期待出力）。**架空入力のみ**。

---

## 5. JSON 出力案

CSV が「人が表計算で使う」のに対し、JSON は「機械が再取り込み・移行する」ためのもの。**2 種**を用意する。

### 5.1 raw JSON（互換最優先・snapshot 近似）

履歴 entry（`{schema_version, savedAt, identity, snapshot}`）を**ほぼそのまま**ファイル化する。

- 形は #214 の archive entry と一致 → 既存 `normalizeState` / `withSourceState` で**そのまま再描画・再取込**できる。
  （`saveData()` の「当日 state を JSON で出す」既存挙動の、履歴版に相当。）
- `schema_version`（現行 `1`）をそのまま保持。読み手は version で分岐できる。
- 用途: 端末間バックアップ／別端末への手動移送／将来の自前ツールでの再利用。
- **`snapshot` は内部 id（`player.id` 等）を含む**ため、人に配る成績表ではなく「データの素」と位置づける。

### 5.2 normalized JSON（移行最優先・§C 3 テーブル）

[post_event §C](20260614_shogi_tour_post_event_requests_design.md) の正規化スキーマ
（`tournaments` / `tournamentPlayers` / `games`）へ**純関数で変換**して出す。

```jsonc
{
  "schema_version": 1,                 // normalized 形の独自バージョン（raw とは別系列）
  "tournament": { "id", "name", "heldDate", "targetMonth", "classes": [...] },
  "players":   [ { "tournamentId", "classId", "entryNo", "rank", "wins",
                   "name", "yomi",
                   "participantMasterId": null,   // ← M5 まで null（予約。§9）
                   "kanaSnapshot": null } ],      // ← M5 まで null（予約。§9）
  "games":     [ { "tournamentId", "classId", "round",
                   "senteEntryNo", "goteEntryNo", "winner": "sente|gote|undecided" } ]
}
```

- 変換は [§C-3-3 の `buildTournamentArchiveFromState(state)`](20260614_shogi_tour_post_event_requests_design.md)
  方針（純関数・既存ロジックに混ぜない）を踏襲。**内部 id を出さず**、人にも機械にも安定な `entryNo` で関係を張る。
- **互換性方針**:
  - `schema_version` は **raw とは独立**に採番（raw=archive 由来 / normalized=出力スキーマ由来）。
  - 列・フィールドの**追加は後方互換**（既存読み手が無視できる末尾追加）。**意味変更/削除は version を上げる**。
  - `participantMasterId` / `kanaSnapshot` は**最初から予約フィールドとして存在させ既定 `null`**。
    M5 でこれらが埋まっても**スキーマ形は変わらない**（version 据え置きで値だけ入る。§9）。

### 5.3 raw と normalized の使い分け

| | raw（§5.1） | normalized（§5.2） |
|---|---|---|
| 主目的 | 完全復元・バックアップ | 横断集計・他システム取込・移行 |
| 安定性 | snapshot 構造に追従（内部 id 含む） | 出力スキーマで安定（内部 id 出さない） |
| Phase 3 適性 | 変換の入力 | **そのまま年間集計の入力**（§9） |

→ MVP では **raw を先に**（既存 entry をファイル化するだけで低コスト）、normalized を次に（§8 EXPORT-004）。

---

## 6. UI 導線案

### 6.1 履歴一覧から export

履歴一覧（#214 の read-only 一覧）の各行に「エクスポート」操作を置く。1 大会分の CSV 群 / JSON を出す。
一覧は `identity` だけで描けるので、**export 押下時に初めて `snapshot` を読む**（一覧描画は重くしない）。

### 6.2 履歴詳細（read-only 星取表）から export

履歴 1 件の閲覧画面（scoreboard レンダラ流用）に「この大会をエクスポート」ボタンを置く。
**閲覧 = 凍結された読み物**の原則（履歴 MVP §6.2）を保つため、export は read-only 操作として配置し、
編集系 UI とは明確に区域を分ける。

### 6.3 現行大会から export

現行（確定済み）大会も出せると便利だが、データ源を二重化しない方針:

- **推奨**: 「まず履歴へ保存（#214 の明示保存）→ その entry を export」に寄せる。export のデータ源を
  **常に履歴 snapshot 1 本**にでき、live `state` 依存の経路を増やさない（テスト・保守が単純）。
- 補助（任意）: 確定後に限り live `state` を直接 export する近道を置く案もあるが、未確定途中での誤出力を
  避けるため**確定（全クラス done）ガード**を必須とする（未決 §12）。

### 6.4 誤操作防止・SP / PC 優先

- **誤操作リスクは低い**（export は read-only・非破壊。§7）。ただし:
  - 「全履歴まとめて」系は件数を明示し、大量 DL の確認を 1 枚挟む。
  - 複数ファイル DL は、ブラウザの「複数ファイルの自動 DL ブロック」に当たり得る → **zip 1 ファイル化**
    または「1 ファイルずつボタン」を検討（未決 §12）。
  - ファイル名衝突を避けるため `heldDate` + 種別で一意化（§4.1）。
- **優先度**: 表彰・会計・名簿づくりは **PC（表計算）で行う**のが主。CSV は **PC 優先**で設計する。
  スマホは「その場で JSON/CSV を端末に落として後で PC で開く」最低限が動けばよい（SP 専用最適化は後回し）。
  live スマホ閲覧（`?view=scoreboard`）と同様、別端末同期・公開 URL は対象外（ローカル DL のみ。§7）。

---

## 7. 安全性

[Phase 2 親 §4 横断原則](20260616_shogi_tour_phase2_program_001.md) を export 文脈に具体化する。

1. **read-only 履歴を壊さない**: export は `shogi_archive` を**読むだけ**。entry の編集・削除・並べ替えをしない。
2. **state を変更しない**: 成績再計算は `withSourceState` 越し（`finally` で global `state` を必ず復元）。
   `calcFinal` / `getFee` 等を呼んでも live `state` は無傷。
3. **localStorage を書き換えない**: export 経路に `setItem` を**置かない**（現行 `setItem` は `save` /
   `saveBranchMaster` / `saveArchive` の 3 系統。export はこのどれにも触れない）。
4. **実データを repo に入れない**: CSV/JSON の生成物は 100% ブラウザ内・端末ローカル DL。
   コード・docs・テスト・fixture・PR 本文に実名/実データ/金銭実績を入れない。サンプルは**完全架空のみ**
   （`架空 …` / `Dummy …` / `example.invalid`）。持ち出しファイルは `.gitignore` 済 `data/` に置く運用。
5. **PII を含む CSV の取り扱い**: 氏名×所属×会計の同梱は個人特定性を上げる（§3.5）。会計集計は氏名なし版を
   選べるようにし、氏名入り CSV は「端末ローカルで本人が扱う」前提を明記。external 送信経路を作らない。
6. **ブラウザ内生成・ローカルダウンロード前提**: `Blob` + `URL.createObjectURL` + `a.download`（既存
   `saveDataAsFile` と同じ機構）。サーバ・クラウド・共有リンクを介さない。
7. **無害化**: CSV は §4.4（quoting + 数式インジェクション無害化 + BOM）、HTML 経路に値を出す場合は
   既存 `escapeHtml` を通す。**ファイル名は `sanitizeFilenamePart`**（OS 禁止文字・空フォールバック）。

---

## 8. 後続実装スライス案（小さく分ける）

| スライス | 内容 | 依存 | 主な新規（純関数中心） |
|---|---|---|---|
| **EXPORT-001** | `standings.csv`（順位・勝負数・tie-break）1 大会 | #214 | `csvCell` / `buildStandingsCsv(entry)` / DL 配線 |
| **EXPORT-002** | `players.csv`（名簿・区分・参加費） | 001 | `buildPlayersCsv(entry)` |
| **EXPORT-003** | `matches.csv`（先手/後手/勝者/結果） | 001 | `buildMatchesCsv(entry)` |
| **EXPORT-004** | JSON export（raw §5.1 → normalized §5.2） | 001 | `buildTournamentArchiveJson` / 正規化変換 |
| **EXPORT-005** | export UI 整理（一覧/詳細導線・zip or 個別 DL・誤操作ガード・会計集計版） | 001-004 | UI 配線・`fees_summary` 任意 |

- **着手順の根拠**: まず最も需要の高い `standings.csv`（表彰・問合せ）を最小で通し、`csvCell` の安全性を
  そこで固める。以降は同じ DL 機構・同じ entry 入力を共有するので**横展開が安い**。
- 各スライスは「**純関数（entry → 文字列）+ 既存 DL 機構の配線**」に収め、`save` / `load` /
  `normalizeState` / 順位計算 / 勝敗入力 / `saveArchive` を**変更しない**。

---

## 9. participantMasterId / kanaSnapshot との関係（M5 を先走らない）

### 9.1 現状（M5 前）

- ふりがなの現フィールドは **`player.yomi`**（FURIGANA-MVP-001）。`kanaSnapshot`（post_event §A 命名）は**未導入**。
- 参加者の横断同定キー **`participantMasterId`** は**未導入**（氏名文字列のみ）。
- → MVP export は **`name` / `yomi` を文字列のまま凍結出力**する。これで表彰・会計・次回名簿・問合せは成立する。

### 9.2 どこで M5 が必要になるか（接続点の整理）

| 接続点 | M5 前（本 MVP の出力） | M5 後（将来） |
|---|---|---|
| 単一大会の表彰 / 会計 / 名簿 | `name` / `yomi` 文字列で**十分**（M5 不要） | 変更なし |
| 複数大会の**名寄せ**（同一人物の年間成績） | 氏名一致は同姓同名/改姓で破綻 → **不可** | `participantMasterId` をキーに集計（**ここで必須**） |
| 凍結ふりがなの正本 | `yomi`（当日コピー）で表示は足りる | `kanaSnapshot` を正本化し、マスタ修正で過去が遡って変わらないことを厳密化 |
| normalized JSON（§5.2） | `participantMasterId` / `kanaSnapshot` を**予約フィールド = `null`** で出す | 同じスキーマのまま**値が入る**（形は不変・version 据え置き） |

### 9.3 先走らないための具体策

- normalized JSON / `players.csv` に **`participant_master_id` / `kana_snapshot` 列（フィールド）を最初から用意**し、
  M5 前は空 / `null`。M5 で値が入っても**出力スキーマを変えない**（取り込み側の作り直しが不要）。
- 本メモは **M5（`participantMasterId` 化・`kanaSnapshot` 正本化）を実装しない**。それらは
  [Phase 2 親の収束点](20260616_shogi_tour_phase2_program_001.md) の管轄。export は「M5 が来たら自然に値が
  埋まる器」を用意するに留める。**年間集計（Phase 3）に着手する段で初めて M5 を前提化**する。

---

## 10. やること / やらないこと

| 区分 | 項目 |
|---|---|
| **やる** | 履歴 entry → CSV（`players` / `standings` / `matches` / `tournament_summary`）純関数 |
| | 履歴 entry → JSON（raw §5.1 / normalized §5.2）純関数 |
| | `csvCell`（RFC4180 + 数式インジェクション無害化 + BOM）（§4.4） |
| | 既存 DL 機構（`Blob` + `a.download`）への配線・`sanitizeFilenamePart` 命名 |
| | UI 導線（一覧 / 詳細から export・誤操作ガード）（§6） |
| | `participantMasterId` / `kanaSnapshot` の**予約フィールド**（既定空）（§9） |
| | 純関数中心テスト（架空データのみ）（§11） |
| **やらない** | `shogi_v4.html` 実装・テスト追加（本 PR は docs-only） |
| | `participantMasterId` 化 / `kanaSnapshot` 正本化の**実装**（M5。§9） |
| | 不戦 / bye / 引分の新概念追加（`state` スキーマ拡張が要る。§3.4・§12） |
| | 支払い確認フィールドの追加（§3.5・§12） |
| | CSV **インポート**（取り込み側）。本メモは出力のみ |
| | サーバ送信 / 公開 URL / 別端末同期（ローカル DL のみ。§7） |
| | `save` / `load` / `normalizeState` / 順位計算 / 勝敗入力 / `saveArchive` の変更 |
| | 過去大会の PDF 再出力（履歴 MVP §7.3 の別スライス） |

---

## 11. テスト方針（実装時の指針）

- **純関数中心**（DOM を SoT にしない）:
  - `csvCell(value)` … カンマ / 引用符 / 改行 / 先頭 `=`,`+`,`-`,`@` 入力の無害化（§4.4）。
  - `buildStandingsCsv(entry)` / `buildPlayersCsv` / `buildMatchesCsv` … 架空 entry → 期待 CSV 文字列。
    順位の欠番・`losses=played−wins`・`winner` 3 値・0 件クラスの空挙動を検証。
  - `buildTournamentArchiveJson(entry)`（normalized）… 内部 id が出ない / `participant_master_id` が `null` /
    関係が `entryNo` で張れる。
- 観点: state 不変（`withSourceState` 後に global `state` が元へ戻る）／`shogi_archive` 非書換／
  実データ非混入／BOM とエンコーディング。
- **既存テストを壊さない**。`bash test/run_tests.sh shogi_v4.html` を維持（件数は未追跡 fixture/test の有無で
  **環境依存**するため固定値で縛らず、実装時に同コマンドで再確認）。export は別関数・読み取り専用なので
  既存 save/load/normalize/順位計算テストに影響しないはず。
- データは**完全架空のみ**（§7-4）。

---

## 12. 未決事項（実装着手前に確認）

| # | 項目 | 暫定 |
|---|---|---|
| 1 | 複数 CSV の配布: zip 1 ファイル / 個別 DL ボタン | ブラウザの複数 DL ブロック回避優先（§6.4） |
| 2 | 会計用に氏名なし集計版 `fees_summary.csv` を出すか | PII 配慮で用意を推奨（§4.2・§3.5） |
| 3 | 現行大会の直接 export を許すか（確定ガード必須） | 「履歴保存 → export」に寄せるのが基本（§6.3） |
| 4 | 不戦 / bye / 引分 を表現するか | `state` 拡張が要る → 本スライス外（§3.4） |
| 5 | 支払い確認フィールド | `state` 拡張が要る → 本スライス外（§3.5） |
| 6 | normalized JSON の `schema_version` 採番（raw と別系列） | 別系列で採番（§5.2） |
| 7 | CSV のエンコーディング既定（BOM 付き UTF-8 で確定可か） | Excel 互換優先で BOM 付き（§4.4） |

---

## 13. 段階ロードマップ（再掲・履歴 MVP §16 の接続）

- **履歴 Step 1（#214・実装済み）**: `shogi_archive` 追記 + 一覧 + read-only 閲覧。
- **Step 2-a（本メモ）**: CSV / JSON エクスポート（EXPORT-001..005。§8）。
- **Step 2-b**: 過去大会の PDF 再出力（履歴 MVP §7.3。別スライス）。
- **Step 3（§C / Phase 3）**: 正規化 DB 化 + 横断集計（年間順位 / 直接対戦 / 昇降級補助）。
  normalized JSON（§5.2）と `participantMasterId`（§9）がこの段の入力になる。

---

## 14. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-06-16 | v0 作成。大会履歴の CSV / JSON エクスポート設計（docs-only）。複数 CSV（players/standings/matches/summary）+ 1 ファイル統合の比較、CSV 安全性（RFC4180 quoting + 数式インジェクション無害化 + BOM）、JSON 2 種（raw 互換 / normalized 移行）、UI 導線（一覧/詳細/現行大会）、安全性（read-only・state 不変・localStorage 非書換・PII・ローカル DL）、実装スライス EXPORT-001..005、`participantMasterId`/`kanaSnapshot` は予約フィールドで先送り（M5 を先走らない）を整理。#214 で実装済みの読み出し基盤（`shogi_archive`/`withSourceState`/`buildArchiveEntryFromState`）の上に純関数を足す方針。コードは未変更。 |
