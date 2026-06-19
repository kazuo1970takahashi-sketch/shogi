# 大会履歴 最小仕様（確定版） — SHOGI-TOUR-HISTORY-DESIGN-001

| 項目 | 値 |
|---|---|
| Task ID | `SHOGI-TOUR-HISTORY-DESIGN-001`（最小仕様の**確定**。設計探索メモの後継） |
| 作成日 | 2026-06-19 |
| 対象 | `shogi_v4.html`（沼津支部 月例将棋大会 運営ツール）。**本仕様はコードを変更しない（docs-only）** |
| 種別 | docs-only 確定仕様（Review Level 1）。実装・比較・配信には広げない |
| ベース branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（orphan clean base。`main` ではない） |
| 統合元（重複を作らない） | 設計探索メモ #207 [`docs/notes/20260615_shogi_tour_history_mvp_design_001.md`] ／ Step1 実装 #214（後述 §1）／ export 設計 #217 [`docs/notes/20260616_shogi_tour_history_export_design.md`] |

---

## 0. このメモの位置づけ・スコープ

### 0.1 目的
「過去の月例会の結果を **どう保存し・どう見るか**」の最小仕様を **確定**する。設計探索メモ #207 が選択肢と根拠を網羅済みなので、本書はそれを **重複させず**、各論点の**結論と現在の実装状況**を1枚に集約し、後続スライスの起点（SSoT）とする。

### 0.2 方針（ChatGPT 相談役 2026-06-19 の整理を反映）
- 現行: DB なし・単一 HTML・localStorage 中心。**アプリ=SSoT、紙=伝達媒体**。
- 履歴は大会単位の **read-only archive / snapshot**。「参加者マスタ / 当日大会データ」とは**別キーで分離**。
- **リアルタイム共有・多人数同時編集・DB 化は本仕様の対象外**（将来アーキ変更時の別系統 → §8 P3）。

### 0.3 重複回避の原則
詳細な根拠・JSON 形・helper 命名は #207 / #217 に既出。本書はそれらを**参照**し、結論・必須/任意・実装状況・段階計画・未決の確定値だけを持つ。新しい設計探索はしない。

---

## 1. 現在地サマリ（実装状況マトリクス）★本書の主眼

**重要**: 大会履歴は「これから設計する」ものではなく、**最小機能（保存＋一覧＋閲覧）は Step1 #214 で実装済み・production 反映済み**。本仕様はその現実を踏まえて残作業を定義する。

| スライス | 内容 | 状況 | 根拠 |
|---|---|---|---|
| HISTORY-IMPL-001 | snapshot 保存（追記専用 `shogi_archive` / 冪等 / quota+rollback） | **✅ 実装済** | #214: `ARCHIVE_KEY='shogi_archive'`、`buildArchiveEntryFromState`、`appendOrReplaceByTournamentId`、`persistArchiveEntry`、`saveCurrentTournamentToArchive` |
| HISTORY-IMPL-002 | 閲覧 UI（履歴一覧 / read-only 星取表） | **✅ 実装済** | #214: `<button id="tab-history">大会履歴</button>` + pane、`renderHistoryList`、`renderHistoryDetail`、`sortArchiveTournaments`、scoreboard 後方互換引数化 `buildScoreboardClassTableHtml(cls,sourceState)` / `withSourceState` |
| （テスト） | 純関数中心の架空データ検証 | **✅ あり** | `test/test_history_step1.js`（51 assert、`run_tests.sh` 登録済） |
| EXPORT-001 | CSV / JSON エクスポート | 📝 **設計済・未実装** | #217（複数CSV+RFC4180/数式インジェクション無害化/BOM、raw/normalized JSON、UI導線、M5 先送り） |
| COMPARE-001 (P2) | 大会横断の比較・集計（年間順位 / 直接対戦 / 昇降級補助） | 未着手（§C ビジョン） | #207 §13/§16・post_event §C |
| REALTIME-SHARE-001 (P3) | リアルタイム共有 / 別端末同期 / 公開配信 | **対象外**（将来アーキ変更） | #207 §8.2・本書 §0.2 |

> production 反映の経緯: Step1 は #214→release #215 で production 反映済み。その後の #220(START-001/003)→#221 revert でも「#214 大会履歴 Step1 は残す」と明記され、**production に残存**。FRP 系の production 再反映とは独立。

---

## 2. 保存単位（論点1）

**結論（確定）**: 確定した 1 大会の `state` を **deep clone した snapshot** + 識別メタ（`identity`）。正規化はしない。`tournament_id` を一意キーに **冪等**（同 id は上書き確認・別 id は追記）。

| 案 | 内容 | trade-off | 採否 |
|---|---|---|---|
| (A) state スナップショット + identity | 現行 state を丸ごと凍結 + 一覧用メタを集計済みで併持 | 閲覧で既存 `calcFinal`/`computeDisplayRanks`/`buildScoreboardClassTableHtml` を**再実装せず流用**できる。容量は大会数に比例 | **採用（実装済 #214）** |
| (B) 成績抽出のみ | 順位・勝敗だけ抽出 | 容量小だが、星取表描画を別実装・後から項目追加に弱い | 不採用 |
| (C) JSON export/import と統合 | 履歴を持たず export/import で代替 | 新ストア不要だが「アプリ内で過去を見る」体験が無い | 不採用（export は §8 EXPORT-001 で別途） |

snapshot は §C（正規化DB）へ純関数変換できる形を保ち、移行の橋を残す（#207 §13）。

---

## 3. 大会メタ情報（論点2）

`identity` に**集計済み**で凍結（一覧描画で重い snapshot 本体を読まない）。

| 項目 | 必須/任意 | ソース（凍結元） | 備考 |
|---|---|---|---|
| `tournament_id` | **必須** | `state.tournament_id`（`t_YYYY_MM_DD`） | 一意キー・冪等判定 |
| `title`（大会名） | **必須** | `state.report.title` | PDF 命名と整合 |
| `heldDate`（開催日） | **必須** | `state.report.date` | 実開催日 |
| `targetMonthLabel`（対象月） | **必須** | 導出（`YYYY年M月度`） | 開催日と食い違う運用に備え heldDate と両持ち |
| `classes`（クラス構成） | **必須** | `state.classes` | `{id,name}` 配列 |
| `participantCount`（参加人数） | **必須** | 集計 | 一覧用 |
| `champions`（各クラス優勝者） | **任意** | 集計 | 一覧価値が高ければ表示（未決#6） |
| `savedAt`（保存日時） | **必須** | 保存時刻 | 「最終更新」ではなく**保存日時**を表示 |
| 開始/終了時刻・会場・運営者メモ | **任意（現状は持たない）** | — | 現行 state に無いため MVP では非保持。将来 §C で拡張（未決#8） |

---

## 4. スコア履歴の範囲（論点3）

**結論**: snapshot に当日 `state` の `results`/`pairings`/`players`/`classes` を**丸ごと凍結**するため、閲覧時に以下を**当時の値で**再現できる。

| 範囲 | 保持 | 算出元 |
|---|---|---|
| 個人別 勝敗 | ✅ | `getWins` / `snapshot.results` |
| 対局結果（各局 `{p1,p2,winner}`） | ✅ | `snapshot.results[cls][round][match]` |
| 順位（同率・表示順） | ✅ | `calcFinal` / `computeDisplayRanks`（snapshot 入力で再計算） |
| クラス移動（昇降級） | ❌ MVP外 | 横断情報のため COMPARE-001(P2) / §C |

氏名は snapshot 内の**文字列を凍結**（後からマスタを編集しても過去表示は不変＝§3.3 凍結原則）。

---

## 5. 参加者マスタとの関係（論点4）

**結論（推奨・実装済の方針）**: **完全分離 + 氏名文字列の凍結**。MVP では `participantMasterId` 紐づけを**しない**。

- 履歴 `shogi_archive` は `shogi_branch_master`（マスタ `members[]`）に**書き込まない・参照で結合しない**。
- 「最終参加日のみ反映」「成績をマスタに持つ」は **採らない**（マスタ編集が過去表示に波及する事故・M5 前の id 不在を避ける）。
- 横断集計（年間順位等）が必要になった段階で、§C / M5（`participantMasterId` 化）で id 紐づけへ拡張（#217 §9 の「M5 を先走らない」と整合）。

---

## 6. 保存・閲覧・削除の方針（論点5）

| 操作 | 方針（確定） | 状況 |
|---|---|---|
| 保存トリガ | **明示保存**（「この大会を履歴へ保存」+確認）。自動アーカイブはしない（再保存二重登録・部分確定の誤保存を避ける）。リセット前/終了時の archive 確認を導線に置ける | 実装済 #214 `saveCurrentTournamentToArchive` |
| 履歴一覧画面 | **要る**（identity ベース・新しい順）。各行から read-only 閲覧へ遷移 | 実装済 #214 `renderHistoryList` |
| 閲覧 | **編集不可・復元不可から始める**（read-only 星取表のみ。保存/読込/リセット/勝敗入力/ペアリング編集を一切出さない） | 実装済 #214 `renderHistoryDetail` |
| 復元（restore） | **やらない**（snapshot→現 state 書き戻しは破壊的・「過去は凍結」原則に反する）。持ち出しは将来 EXPORT-001 で JSON 化 | 設計通り未実装で正 |
| 削除 | **入れるなら「確認 + 1 件単位」に限定**（一括削除・自動間引きはしない）。MVP に含めるかは未決#5 | 未決 |

---

## 7. データ互換・復旧（論点6）

- **既存 localStorage 互換**: `shogi_archive` は**追記専用の新キー**。`shogi_v4`（当日 state）/ `shogi_branch_master`（マスタ）と既存 `save()`/`load()`/`normalizeState()`/`saveBranchMaster()` を**変更しない**。`shogi_archive` 不在 = 履歴 0 件として正常動作（後方互換）。実装済（#214 `loadArchive`/`normalizeArchive`）。
- **schema_version**: snapshot/archive とも `schema_version` を持ち、将来フィールド追加でも旧データを壊さない。
- **古い大会データ JSON の import**: 既存の state 形 JSON は既存 import 経路（`saveData`/`loadData` 系）の責務に委ねる。履歴は**新規 restore/import UI を作らない**（責務分離）。
- **破損時の復旧導線**: 壊れた `shogi_archive` 値は「履歴 0 件」として安全に読み（`normalizeArchive`）、当日 state には影響させない。quota 超過時は**追記をロールバック**し既存 `isQuotaExceededError`+`notifySaveWarning`（`[HISTORY-WARN]`）で通知＝当日 state 無傷を保証（実装済 #214 `persistArchiveEntry`）。

---

## 8. 段階計画（論点7・依存関係）

```
HISTORY-IMPL-001 (snapshot保存) ──┐
   [✅ #214 実装済]               ├─▶ EXPORT-001 (CSV/JSON) ──▶ COMPARE-001 (P2: 横断集計)
HISTORY-IMPL-002 (閲覧UI) ────────┘     [📝 #217 設計済・未実装]      [未着手・§C]
   [✅ #214 実装済]                                                         │
                                                                            ▼
                                                       REALTIME-SHARE-001 (P3: 共有/配信)
                                                              [対象外・将来アーキ変更]
```

- **IMPL-001 / IMPL-002**: 完了（#214）。残りは運用フィードバックに基づく微調整のみ（起動経路の統一など未決#2）。
- **EXPORT-001**: IMPL-001/002 の `shogi_archive` 読み出し基盤の上に乗る（#217 §0.3「読み出し基盤は #214 で実装済み」）。実装は #217 の小スライス案（§8）に従う。M5 を先走らない。
- **COMPARE-001 (P2)**: EXPORT-001 の normalized JSON（§C 3 テーブル形）を入力に、横断集計（年間順位/直接対戦/昇降級補助）。`participantMasterId`（M5）が前提。
- **REALTIME-SHARE-001 (P3)**: 別端末同期/公開 URL/サーバ。**現行アーキ（単一 HTML+localStorage）では実現せず**、アーキ変更時の別系統。本仕様の射程外。

---

## 9. 未決事項リスト（実装着手前に確認・推奨初期値つき）

| # | 項目 | 推奨初期値 | 影響スライス |
|---|---|---|---|
| 1 | 起動経路: 運営内タブ / `?view=history` | **現行の運営内タブ（実装済）を維持**。対称性が要れば後で `?view=history` 追加 | IMPL-002（微調整） |
| 2 | 削除 UI を入れるか | **当面入れない**。入れるなら「確認 + 1 件単位」限定 | IMPL-002 |
| 3 | archive 上限（件数/概算サイズ）と超過 UX | **警告のみ・自動削除なし**（現行 quota 通知を流用） | IMPL-001（運用） |
| 4 | `champions` を一覧に出すか | **出す**（一覧の一覧性が上がる。実装済の集計を表示） | IMPL-002 |
| 5 | 開始/終了時刻・会場・運営者メモを持つか | **当面持たない**（現行 state に無い）。必要なら §C で追加 | メタ拡張 |
| 6 | 過去大会の PDF 再出力 | **EXPORT-001 と束ねて次段**（print 経路の snapshot 差し替えが要る） | EXPORT-001 |
| 7 | CSV/JSON の出力単位・文字コード | #217 の確定（複数CSV+BOM / raw+normalized JSON） | EXPORT-001 |
| 8 | `targetMonth` 正本化（§C）の移行順 | snapshot に heldDate+label 両持ちで**先送り可** | COMPARE-001 |

---

## 10. 遵守（docs-only / 非破壊 / データ運用）

- 本書は **docs-only**。`shogi_v4.html` / `scripts/` / `data/` / `index.html` を変更しない。Review Level 1。
- 履歴データ（`shogi_archive`）は **100% ブラウザ localStorage**。**repo に commit しない**。コード/docs/テスト/PR に実名・実データ・PII・secret を入れない（本書も架空例のみ）。
- 既存 `save`/`load`/`normalizeState`/順位計算/勝敗入力/`saveBranchMaster` を変更しない方針を継承（実装済 Step1 の唯一の既存改修点は scoreboard レンダラの後方互換 optional 引数化のみで、live 挙動は不変）。
- テストは完全架空のみ。`bash test/run_tests.sh shogi_v4.html` を維持（件数は環境依存のため固定せず実装時再確認）。

---

## 11. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-06-19 | v0 作成（docs-only）。HISTORY-DESIGN-001 の**最小仕様を確定**。設計探索メモ #207 / Step1 実装 #214 / export 設計 #217 を統合し重複を作らず、保存単位=state スナップショット、メタ必須/任意、スコア範囲、マスタ完全分離、保存=明示/閲覧=read-only/復元=なし、localStorage 互換・破損復旧、段階計画（IMPL-001/002=実装済 → EXPORT-001=設計済 → COMPARE-001 P2 → REALTIME-SHARE-001 P3=対象外）、未決8件の推奨初期値を集約。コードは未変更。 |
