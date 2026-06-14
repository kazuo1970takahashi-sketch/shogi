# 過去大会履歴 MVP 設計メモ — SHOGI-TOUR-HISTORY-DESIGN-001

| 項目 | 値 |
|---|---|
| Task ID | `SHOGI-TOUR-HISTORY-DESIGN-001` |
| 作成日 | 2026-06-15 |
| 対象 | `shogi_v4.html`（沼津支部 月例将棋大会 運営ツール）。**本メモはコードを変更しない** |
| 種別 | docs-only 設計メモ（後続実装用 MVP 仕様） |
| ベース branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（orphan clean base。`main` ではない） |
| 関連 | [§C 月例会結果アーカイブ](20260614_shogi_tour_post_event_requests_design.md)（フル DB ビジョン）／[live scoreboard 完了メモ](20260614_shogi_live_scoreboard_mvp_001_summary.md)（閲覧ビュー再利用元）／[quota 棚卸し](20260514_shogi_save_ux_quota_inventory.md)（保存経路 / quota） |

---

## 0. このメモの位置づけ・スコープ

### 0.1 目的

「過去の月例会の結果を、**どう保存し、どう見るか**」の **最小仕様（MVP）** に絞って設計する。
実装はしない。`shogi_v4.html` には触れない。保存データ実装も変更しない。

### 0.2 既存設計との関係（重複しない / 切り出す）

過去大会の蓄積については、すでに
[`20260614_shogi_tour_post_event_requests_design.md` §C「月例会結果アーカイブ / 大会履歴 DB 化」](20260614_shogi_tour_post_event_requests_design.md)
が **完成形ビジョン**（`tournaments` / `tournamentPlayers` / `games` の正規化 3 テーブル、年間順位・直接対戦などの横断集計）を描いている。

本メモは **その MVP 切り出し**である。違いを明確にする:

| 観点 | §C（完成形ビジョン） | 本メモ（MVP） |
|---|---|---|
| 保存形 | 正規化 3 テーブル | 確定 `state` の **スナップショット丸ごと** + 識別メタ |
| 目的 | 横断集計（年間順位 / 直接対戦 / 昇降級補助）の土台 | まず「1 大会を保存して後から閲覧」できること |
| 閲覧 | 集計ビュー各種 | 既存スコアボード（星取表）レンダラの **read-only 流用** |
| 着手コスト | 大（変換層 + 集計層） | 小（別キー追記 + 閲覧データ源差し替え） |

MVP は §C の正規化 DB を **作らない**。ただし MVP のスナップショットは将来 §C へ
**純関数で変換できる形**にして、移行の橋を残す（§13.3）。

### 0.3 現状（履歴機能は存在しない）

現行 `shogi_v4.html` には「過去大会」「アーカイブ」「複数大会の保存」という概念が**無い**。
保持されるのは当日 1 大会分の `state` のみ。過去大会を残すには、ユーザーが手動で
JSON バックアップ（`saveData()`）を取って外部保管し、必要なら再 import するしかない。
本 MVP はここに「履歴ストア + 一覧 + 閲覧専用表示」を**追加**する。

---

## 1. 前提・用語

- **大会 1 回分** = 1 月例会（例: 2026 年 6 月度）。識別子は既存の `state.tournament_id`
  （`t_YYYY_MM_DD` 形式・日付由来・衝突時サフィックス）。
- **localStorage は 2 キー構成**（[quota 棚卸し §6](20260514_shogi_save_ux_quota_inventory.md)）:
  - `STORAGE_KEY = 'shogi_v4'` … 当日大会 state（`players` / `pairings` / `results` / `started` / `classes` / `report` / `tournament_id`）。`LEGACY_STORAGE_KEYS = ['shogi_v3']`。
  - `BRANCH_MASTER_KEY = 'shogi_branch_master'` … 参加者マスタ（`members[]`）。
  - 設定保存・sessionStorage・IndexedDB・cookie は**未使用**。`setItem` 経路は `save()` と `saveBranchMaster()` の 2 系統のみ。
- **同一端末・同一ブラウザ前提**。localStorage はオリジン×ブラウザごとに独立。
  別端末同期は live scoreboard と同じく MVP 対象外
  （[live メモ §4](20260614_shogi_live_scoreboard_mvp_001_summary.md)）。

---

## 2. 検討項目への結論（サマリ）

| # | 検討項目 | MVP の結論 | 詳細 |
|---|---|---|---|
| 1 | 大会 1 回分の保存単位 | 確定 `state` の **スナップショット**（deep clone）+ 識別メタ。正規化はしない | §3 |
| 2 | 現在の localStorage との関係 | **新キー `shogi_archive`**（追記専用）。`shogi_v4` / `shogi_branch_master` と既存 save/load には触れない | §4 |
| 3 | 履歴一覧に出す項目 | 対象月 / 大会名 / 開催日 / クラス数 / 参加人数 /（任意）各クラス優勝者 / 保存日時 | §5 |
| 4 | 過去大会の閲覧専用表示 | 既存スコアボードレンダラを **snapshot 入力対応**にして read-only 流用 | §6 |
| 5 | 復元機能 or 閲覧だけ | **まず閲覧だけ**。restore（現 state への書き戻し）は MVP でやらない | §11 |
| 6 | PDF ファイル名改善との接続 | identity に `title` / `heldDate` / `targetMonthLabel` を**凍結**し、命名規則と並びを揃える | §7 |
| 7 | スマホ順位表との接続 | 閲覧表示は scoreboard レンダラの「データ源差し替え」版。同一端末 localStorage 前提も継承 | §8 |
| 8 | 実データを repo に入れない | 履歴は 100% ブラウザ localStorage。commit しない。テストは完全架空のみ | §9 |
| 9 | MVP でやること / やらないこと | §10 の表で確定 | §10 |

---

## 3. 大会 1 回分の保存単位

### 3.1 結論：`state` スナップショット + 識別メタ

保存単位は **「確定した 1 大会の `state` を凍結したスナップショット」**。MVP では §C の
正規化 3 テーブルへは分解せず、現行 `state` を **そのまま deep clone** して 1 件として持つ。

**なぜ snapshot 丸ごとか**（最短実装の根拠）:
閲覧表示で使う既存ロジック（`calcFinal` / `computeDisplayRanks` / `getWins` /
`buildScoreboardClassTableHtml`）は **`state` の形をそのまま消費する**。
スナップショット＝`state` 形にしておけば、閲覧は「データ源を live state → 保存 snapshot に
差し替える」だけで済み、順位計算・星取表描画を**再実装しなくてよい**（§6・§8）。

### 3.2 スナップショット 1 件の形（案）

```jsonc
// shogi_archive.tournaments[] の 1 要素
{
  "schema_version": 1,
  "savedAt": "2026-06-15T10:00:00+09:00",   // 履歴へ保存した時刻（凍結時刻）
  "identity": {
    "tournament_id": "t_2026_06_14",         // state.tournament_id（一意キー・冪等判定に使う）
    "title": "沼津支部月例将棋大会",            // state.report.title を凍結
    "heldDate": "2026-06-14",                 // state.report.date を凍結（実開催日）
    "targetMonthLabel": "2026年6月度",         // 当時の導出ラベルを凍結（§7）
    "classes": [                               // クラス構成を凍結
      { "id": "A", "name": "Aクラス" },
      { "id": "B", "name": "Bクラス" }
    ],
    "participantCount": 22,                    // 一覧用に集計済みの人数（snapshot を開かず一覧描画できる）
    "champions": [                             // 任意。各クラス優勝者の表示名（凍結）
      { "classId": "A", "name": "架空 太郎" }
    ]
  },
  "snapshot": { /* state の deep clone（players/pairings/results/started/classes/report/rounds/tournament_id） */ }
}
```

### 3.3 凍結（スナップショット）の原則

- スナップショットは **確定値の凍結**。後日マスタ（`shogi_branch_master`）を編集しても、
  **過去大会の表示は遡って変わらない**。これは
  [§A-1-3 の `nameSnapshot` / `kanaSnapshot` 原則](20260614_shogi_tour_post_event_requests_design.md)
  と一貫する（MVP では氏名はそのまま `state` 内文字列を凍結。ふりがなは MVP 対象外）。
- 一覧描画に必要な値（人数・優勝者・各ラベル）は `identity` に**集計済みで**持たせ、
  一覧では重い `snapshot` 本体を読まなくてよいようにする（描画コスト・将来の遅延読込に有利）。

---

## 4. 現在の localStorage との関係

### 4.1 新キー `shogi_archive`（追記専用・既存に非干渉）

```jsonc
// localStorage['shogi_archive']
{
  "schema_version": 1,
  "updated_at": "2026-06-15T10:00:00+09:00",
  "tournaments": [ /* §3.2 の要素を新しい順に追記 */ ]
}
```

- 既存の `shogi_v4`（当日 state）/ `shogi_branch_master`（マスタ）には**一切書き込まない**。
- 既存の `save()` / `load()` / `normalizeState()` / `saveBranchMaster()` を**変更しない**。
  履歴は **追加関数 + 別キー + 純関数**だけで成立させる（§C-3 の非破壊原則を継承）。
- `shogi_archive` キーが**無い**場合は「履歴 0 件」として正常動作（後方互換）。

### 4.2 quota（保存容量）への影響 — MVP の必須考慮点

[quota 棚卸し](20260514_shogi_save_ux_quota_inventory.md) より、現在 `setItem` 経路は
`save()` / `saveBranchMaster()` の 2 系統。履歴保存は **3 つ目の `setItem` 経路**になる。
さらに **snapshot 1 件 ≈ 1 大会分の `state`** なので、N 大会で保存量はおおむね N 倍に増える。
quota は MVP の第一級の関心事として扱う:

1. 履歴の `setItem` でも既存の `isQuotaExceededError(e)` + `notifySaveWarning({...})` を
   **再利用**する（新しい握りつぶしを作らない）。callsiteId 案 `STORAGE-QUOTA:saveArchive`、
   `kind: 'storage-quota'` / `aggregateKey: 'storage-quota:global'` / `severity: 'warn'`
   （既存 metadata 規約に合わせる）。
2. 容量超過時は **追記をロールバック**（直前の `shogi_archive` を壊さない）し、ユーザーに
   「履歴に保存できなかった／JSON でバックアップを」と伝える。当日 state は無傷を保証する。
3. 上限の暫定方針（未決 §15）: 件数上限 or 概算サイズ閾値で**警告**を出す。MVP では
   自動削除はしない（消すかどうかはユーザー判断。silent な間引きは事故のもと）。

---

## 5. 履歴一覧に出す項目

read-only の一覧表。すべて §3.2 の `identity` から取得でき、`snapshot` 本体を読まずに描ける。

| 列 | ソース | 備考 |
|---|---|---|
| 対象月 | `identity.targetMonthLabel`（例「2026年6月度」） | 既定の並び替えキー |
| 大会名 | `identity.title` | |
| 開催日 | `identity.heldDate` | 実開催日（対象月と食い違う運用あり、§7） |
| クラス数 | `identity.classes.length` | |
| 参加人数 | `identity.participantCount` | |
| 各クラス優勝者 | `identity.champions[]`（任意） | 無ければ省略 |
| 保存日時 | `savedAt` | 「いつ履歴化したか」 |

- **並び順**: 対象月の降順（新しい大会が上）。同月内は `heldDate` → `savedAt`。
- **表記の統一**: PDF ファイル名と同じ **「対象月 → 大会名 → 種別」** の並びに揃え、
  一覧・閲覧・PDF で見え方を一致させる（§7）。
- 一覧の各行から **read-only 閲覧（§6）** へ遷移。一覧自体に編集・削除以外の運営操作は出さない。
  （削除 UI を MVP に含めるかは未決 §15。含めるなら「確認 + 1 件単位」に限定。）

---

## 6. 過去大会の閲覧専用表示

### 6.1 結論：既存スコアボードレンダラを read-only 流用

過去大会の閲覧は、live scoreboard の **星取表レンダラを再利用**する。現行の
`renderScoreboard()` / `buildScoreboardClassTableHtml(cls)` は順位・星取を
`calcFinal` / `computeDisplayRanks` / `getWins` で描く、**ほぼ純粋に近い**描画関数
（[live メモ §3](20260614_shogi_live_scoreboard_mvp_001_summary.md)）。

MVP の最小変更は **「描画関数のデータ源を、global `state` から渡された snapshot に切り替えられる」**
ようにすること（引数化。§8）。これで履歴閲覧 = 「scoreboard を保存 snapshot で描いたもの」になる。

### 6.2 read-only 徹底（live と同じ原則）

- 閲覧画面には **編集系 UI（保存・読込・リセット・勝敗入力・ペアリング編集）を一切出さない**。
- [post_event Must Fix 1](20260614_shogi_tour_post_event_requests_design.md) と同様に、
  閲覧から運営画面へ戻る導線・編集へ入る導線を置かない。履歴は「凍結された読み物」。
- live は「最終更新時刻（`_sbLastUpdate`）」を出すが、履歴は凍結データなので代わりに
  **`savedAt`（保存日時）** を表示する。「最終更新」ではなく「保存日時」を出すのが意味的に正しい。

### 6.3 起動経路（案）

- **最小**: 運営画面内に「大会履歴」タブ/パネルを 1 つ追加 → 一覧 → 1 件選択 → read-only 星取表。
- **対称案**: live の `?view=scoreboard` に倣い `?view=history`（+ `#history`）で履歴閲覧モードに入る。
  scoreboard の `isScoreboardRoute()` / `applyScoreboardRoute()` と同じ仕組みで実装でき、
  運営 UI を退避して全画面 read-only にできる。どちらを採るかは未決（§15）。

---

## 7. PDF ファイル名改善との接続

### 7.1 現行の PDF 命名（接続先）

PDF/帳票のファイル名は `buildTournamentPdfFilename(kind, className)` が生成し、
`buildTournamentHeldDateCompact()`（`state.report.date` → `YYYYMMDD`）/ `normalizeReportTitle(state.report.title)` /
`sanitizeFilenamePart()`（OS 禁止文字除去）/ `buildSafePdfFilename()` を組み合わせる。
本文見出しの対象月は `buildTournamentTargetMonthLabel()`（`state.report.date` → `YYYY年M月度`）。
出力は `Blob(text/html)` + `window.open()` + `win.print()` で、`.pdf` 拡張子はブラウザ依存
（[post_event Must Fix 2](20260614_shogi_tour_post_event_requests_design.md)）。

### 7.2 接続点

1. **identity に命名材料を凍結する**。snapshot の `identity.title` / `heldDate` / `targetMonthLabel`
   は、まさに PDF 名・本文見出しが使う材料。これを保存時に凍結しておけば、過去大会を後から
   再表示・再出力しても **当時の正しい名前**で出せる。
2. **対象月の暫定運用を引き継ぐ**。[post_event §0](20260614_shogi_tour_post_event_requests_design.md)
   の通り、`targetMonth` は現状 `state.report.date` 由来の**暫定**（6 月度を 7/2 に順延等で食い違う）。
   そこで snapshot には **生の `heldDate` と導出 `targetMonthLabel` の両方**を持たせる。将来 §C で
   `tournaments.targetMonth` を正本化しても、過去 snapshot から再計算/移行できる。
3. **表記順を統一**。一覧・閲覧見出しを PDF と同じ「対象月 → 大会名 → 種別」に揃える（§5）。

### 7.3 「過去大会の PDF 再出力」は MVP の次段（理由つき）

現行の print 経路（`printResults` / `printPairings` / `downloadReport`）は **global `state` を前提**に
組み立てる。過去 snapshot を渡して再出力するには print 経路の小改修（snapshot 差し替え）が要るため、
**MVP はまず閲覧まで**とし、過去 PDF 再出力は次段に置く（§16）。snapshot に命名材料を凍結しておく
ことで、次段の再出力は low-cost で接続できる。

---

## 8. スマホ順位表（live scoreboard）との接続

### 8.1 レンダラ共有（live と history で 1 つ）

履歴閲覧は **scoreboard レンダラの「データ源差し替え」版**。`buildScoreboardClassTableHtml` は
`state` 入力にほぼ純粋なので、**引数で state/snapshot を受ける形**にすれば live と history の
**両方で同じ関数を使える**（重複実装ゼロ）。

```js
// 現状: 暗黙に global state を参照
// renderScoreboard()                      // live: global state を描く
// 目標: データ源を引数で受ける（live は state、history は snapshot.snapshot）
// renderStandings(sourceState)            // 純粋寄り。live=state / history=archive.tournaments[i].snapshot
```

### 8.2 同一端末 localStorage 前提を継承

- live scoreboard は **同一ブラウザの別タブ**で `storage` イベント連動して自動更新する仕組み
  （[live メモ §4](20260614_shogi_live_scoreboard_mvp_001_summary.md)）。
- 履歴も同じ前提：履歴データはその端末のブラウザ内 `shogi_archive` にしか無い。**別端末からは
  見えない**。別端末配信は §C/§E と同じく MVP 外（公開 URL / 静的書き出し / サーバ同期が必要）。
- 履歴は凍結データなので live のような storage 連動の自動更新は不要（保存時点で固定）。

### 8.3 ふりがな等は MVP 外

live と同様、ふりがな ruby 表示は MVP に含めない（[§A](20260614_shogi_tour_post_event_requests_design.md) の恒久対応に従う）。
氏名は snapshot 内の既存文字列をそのまま表示。

---

## 9. 実データを repo に入れない運用

[リポジトリ運用制約](20260614_shogi_tour_post_event_requests_design.md) と整合させる:

- 履歴データ（`shogi_archive`）は **100% ブラウザ localStorage**。**repo に commit しない**。
  コード・docs・テスト・fixture・コメント・PR 本文に実名/実データを入れない。
- ユーザーが履歴を持ち出す場合のエクスポート JSON は **端末ローカルの `data/`（`.gitignore` 済）** に置く。
- テスト・サンプルは **完全架空のみ**（`架空 …` / `Dummy …` / `example.invalid` / `synthetic`）。
  snapshot fixture も架空 state から生成する。
- **本メモ自体に実データ・PII・secret を含めない**（含めていない）。

---

## 10. MVP でやること / やらないこと

| 区分 | 項目 |
|---|---|
| **やる** | 追記専用キー `shogi_archive`（schema_version 付き） |
| | 明示操作「この大会を履歴へ保存」（§11） |
| | `tournament_id` をキーにした **冪等**保存（既存なら上書き確認・無ければ追記） |
| | 履歴一覧（identity ベース・新しい順）（§5） |
| | read-only 閲覧（scoreboard レンダラ流用・編集 UI なし）（§6） |
| | identity（title / heldDate / targetMonthLabel / classes / 人数 / 優勝者）の凍結（§3・§7） |
| | quota 再利用（`isQuotaExceededError` + `notifySaveWarning` + ロールバック）（§4.2） |
| | 純関数中心のテスト（架空データ）（§14） |
| **やらない** | §C 正規化 3 テーブル DB（tournaments/tournamentPlayers/games） |
| | **復元 restore**（snapshot → 現 state への書き戻し）（§11） |
| | 横断集計（年間順位 / 直接対戦 / 昇降級補助）（§16 で §C 後） |
| | 過去大会の **PDF 再出力**（§7.3・§16 で次段） |
| | ふりがな ruby（§8.3） |
| | 別端末同期 / 公開 URL / QR（§8.2） |
| | 確定時の**自動**アーカイブ（MVP は明示保存、§11） |
| | 自動 dedup / merge / CSV 入出力 |
| | 既存 `save()` / `load()` / `normalizeState()` / 順位計算 / 勝敗入力の変更 |

---

## 11. 保存トリガと復元の判断

### 11.1 保存トリガ：明示保存を推奨

| 案 | 内容 | 評価 |
|---|---|---|
| (a) 自動 | 全クラス done 確定時に自動でアーカイブ | 便利だが、再保存での二重登録・部分確定での誤保存・予期せぬ書込のリスク |
| (b) 明示 | 「この大会を履歴へ保存」ボタン + 確認 | **MVP 推奨**。ユーザーが「これで確定」を制御。書込タイミングが明確 |

**推奨 (b)**。理由: 予期せぬ書込なし／部分保存を避ける／ユーザーが確定を制御／再保存の扱いを
明示確認に乗せられる。冪等性は `tournament_id` をキーに「既存なら上書き（確認）・無ければ追記」。

### 11.2 復元（restore）：MVP では入れない（閲覧のみ）

- **MVP は閲覧のみ**。snapshot を現 `state` に書き戻す restore は **やらない**。
- 理由: 現 state を上書きする**破壊的操作**であり、凍結された過去を再び編集状態に戻すのは
  「過去は凍結」原則（§3.3）と相反。当日運営中の state を誤って失う事故にもなり得る。
- 安全な持ち出し代替（任意・将来）: 「この過去大会を JSON でエクスポート」。これは既存
  `saveData()` の **state 形 JSON** をファイル化するだけで、ユーザーが本当に必要なときに
  既存 import 経路で読み戻せる。MVP では **新規 restore UI を作らない**（既存 import の責務に委ねる）。

---

## 12. read-only / 非破壊・互換性メモ

- 既存の `calcFinal` / `computeDisplayRanks` / `setWinner` / `submitRound` /
  `startTournamentForClass` / `save` / `load` / `normalizeState` / `saveBranchMaster` を**変更しない**。
  履歴は **追加関数 + 別キー `shogi_archive` + 純関数**で実現する。
- `shogi_archive` 不在 = 履歴 0 件として正常動作（後方互換）。
- 閲覧経路に編集系 UI を出さない（§6.2）。当日 state（`shogi_v4`）は履歴操作で一切変化しない。
- snapshot に新フィールドを足す場合も `schema_version` 既定で後方互換（旧 snapshot を読んでも壊れない）。

---

## 13. 段階移行の橋（MVP → §C）

### 13.1 snapshot は state 形 → §C 変換の入力になる

MVP の snapshot は `state` 形なので、[§C-3-3 の純関数 `buildTournamentArchiveFromState(state)`](20260614_shogi_tour_post_event_requests_design.md)
を**後段で被せて**正規化 3 テーブルへ変換できる。MVP で蓄積した履歴を捨てずに §C へ移せる。

### 13.2 identity が §C メタの先取り

`identity.tournament_id` / `title` / `heldDate` / `targetMonthLabel` / `classes` は、§C の
`tournaments`（`id` / `name` / `heldDate` / `targetYear` / `targetMonth`）にほぼ対応。MVP 時点で
**`participantMasterId` 紐づけはしない**（氏名文字列の凍結のみ）。横断集計が必要になった段階で
§C の ID 紐づけへ拡張する。

### 13.3 移行順序（推奨）

1. MVP（本メモ）: snapshot 追記 + 一覧 + read-only 閲覧。
2. 過去 PDF 再出力 / エクスポート整備（§7.3）。
3. §C 正規化 DB 化 + 横断集計（年間順位 / 直接対戦 / 昇降級補助）。

---

## 14. テスト方針（実装時の指針）

- **純関数中心**に検証（DOM を SoT にしない）:
  - `buildArchiveEntryFromState(state)` … 架空 state → §3.2 の identity / snapshot を生成。
  - `appendOrReplaceByTournamentId(archive, entry)` … 冪等（同 id は上書き・別 id は追記）。
  - 一覧描画ヘルパ … identity から行を組む（snapshot 本体に触れない）。
  - scoreboard レンダラの **snapshot 入力版** … live と同じ結果を snapshot から再現。
- 観点: 一覧項目が出る／**編集系 UI が出ない**（read-only）／冪等／quota 時にロールバックして
  当日 state を壊さない（`isQuotaExceededError` 再利用）。
- **既存テストを壊さない**。`bash test/run_tests.sh shogi_v4.html`（現在 96 件）を維持。
  履歴は別キー・別関数なので既存 save/load/normalize テストに影響しないはず。
- データは**完全架空のみ**（§9）。

---

## 15. 未決事項（実装着手前に確認）

| # | 項目 | 暫定 |
|---|---|---|
| 1 | 保存トリガ (a) 自動 / (b) 明示 | (b) 明示を推奨（§11.1） |
| 2 | 起動経路：運営内タブ / `?view=history` | どちらでも可。対称性なら `?view=history`（§6.3） |
| 3 | 過去 PDF 再出力を MVP に含めるか | 含めず次段（§7.3・§16） |
| 4 | archive 上限（件数 / 概算サイズ）と超過時 UX | 警告のみ・自動削除なし（§4.2） |
| 5 | 履歴の削除 UI を MVP に入れるか | 入れるなら「確認 + 1 件単位」に限定（§5） |
| 6 | 優勝者（`champions`）を identity に含めるか | 任意。一覧の価値が高ければ含める（§3.2） |
| 7 | `targetMonth` 正本化（§C）との段階移行順 | snapshot に heldDate + label 両持ちで先送り可（§7.2） |

---

## 16. 段階ロードマップ（再掲）

- **Step 1（本 MVP）**: `shogi_archive` 追記専用ストア + 履歴一覧 + read-only 閲覧（scoreboard 流用）。
- **Step 2**: 過去大会の PDF 再出力 / JSON エクスポート整備。
- **Step 3（§C）**: 正規化 DB 化 + 横断集計（年間順位 / 直接対戦 / 月例会別推移 / 昇降級補助）。

---

## 17. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-06-15 | v0 作成。過去大会履歴の MVP 設計（docs-only）。保存単位＝state スナップショット、別キー `shogi_archive` 追記専用、識別メタ凍結、read-only 閲覧は scoreboard レンダラ流用、復元は MVP 対象外（閲覧のみ）、PDF 命名・スマホ順位表との接続、quota 再利用、§C への移行橋を整理。コードは未変更。 |
