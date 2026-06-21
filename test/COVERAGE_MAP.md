# shogi_v4.html テスト被覆マップ（Issue #283 Phase A）

`shogi_v4.html`（約10,001行・関数約303）の段階リファクタ（Phase B 以降）に先立ち、
**どの主要領域をどのテストが守っているか**を棚卸しし、被覆の「厚い／薄い／無し」を明示する。

- 凡例: **厚** = 専用テスト多数・分岐網羅 / **薄** = 間接・付随被覆のみ / **無** = 直接被覆なし
- 採取日: 2026-06-21（base = orphan clean base `fa1f477`）。`bash test/run_tests.sh shogi_v4.html` = PASS=84 / FAIL=0 / WARN=0。
- 本マップと安全網（ゴールデンマスター・characterization）は **test/ のみ追加**。`shogi_v4.html` は無改変。

> 検証方法: 各 `test_*.js` の `loadEnv()` 内 `return {...}`（実際に exercise する関数）と
> assertion 文言、および `grep -l '<fn>' test/*.js` による直接参照の有無で判定した。

---

## 1. 領域別サマリー

| 領域 | 代表関数 | 主な担保テスト | 被覆 |
|---|---|---|---|
| 参加者登録/編集 | addPlayer / removePlayer / makePlayerRow / updateField / bulkEditNames / editPlayer / editPlayerYomi | test_class_variable_001 / test_furigana_mvp_001 / test_start_frp_ux_001 | **厚** |
| レポート/PDF | normalizeReport*（13項目）/ buildTournamentPdfFilename / printResults / downloadReport | test_report_ux_002/004/005/006/006b/006c/007a/007b / test_report_print_006 | **厚**（最厚） |
| 大会開始 | startTournament / startTournamentForClass / validateStartableClass / describeClassReadiness | test_start_001 / test_start_ux_consolidate_001 / test_start_frp_ux_001 / test_frp_impl_002 | **厚** |
| FRP 部分手合い | startClassPartial / getUnassignedFirstRoundPlayers / buildFirstRoundPartialPairs / appendFirstRoundPairs | test_frp_impl_002/003/004/004b | **厚** |
| 逐次手合 | onClickAddOneTable / onClickAddAllTables / shouldShowRegenerateButton | test_progressive_pairing_p1/p2 | **厚** |
| 保存/復元 | normalizeState / save / load / saveData / loadData / backup serialize | test_data_persistence_phase1 / 各 FRP / 各 start | **厚** |
| 星取表/閲覧 | buildScoreboardClassTableHtml / withSourceState / live scoreboard | test_live_scoreboard_001 / test_furigana_view_002 / test_history_step1 | **厚** |
| ふりがな | renderPlayerNameWithRuby / playerNameRubyHtml / yomiOf / normalizeYomi | test_furigana_mvp_001 / test_furigana_view_002 | **厚** |
| 順位・集計 | calcTotal / calcFinal / getWins / getTopPlayers | test_furigana_view_002 / test_frp_impl_003 / test_start_001 | **厚** |
| 履歴/アーカイブ | buildArchiveEntryFromState / normalizeArchive / loadArchive / saveCurrentTournamentToArchive | test_history_step1 | **厚** |
| クラス可変 (add/remove) | addClass / removeClass / renameClass / canDeleteClass | test_class_variable_001 | **厚** |
| 保存UX通知 | saveBranchMaster / notifySaveWarning / isQuotaExceededError | test_save_ux_nonquota_notify_001/002 / test_save_branch_master_failure_signal | 中 |
| 支部マスタ読込 | normalizeBranchMaster / detectImportFormat | test_members_candidate_master_recut_001 | 中 |
| ログイン/Stage A | （app/auth.js・shogi_v4.html 外） | test_stagea_login / stagea_rls_pgtest | 中 |
| **クラス可変 (normalize)** | **normalizeClasses** | （normalizeState 経由の間接のみ） | **薄→補強済** |
| **ペアリング品質** | **evaluatePairingQuality** | （直接参照なし） | **無→補強済** |
| **支部マスタ同期** | **updateBranchMasterFromTournament / mergeTournamentParticipantsIntoMaster** | （前者=コメント言及のみ / 後者=setup import のみ） | **無/薄→補強済** |
| **過去参加者パネル** | **buildPastParticipantsPanelHtml / matchesPastParticipantQuery** | （直接参照なし） | **無→補強済** |
| 支部マスタ編集モーダル結線 | bindMasterEditModalEvents | （直接参照なし・bind パターン） | **無**（下記注記） |

---

## 2. Issue #283 が名指しした「薄い領域」の判定と対応

| 関数 | Phase A 前 | 補強テスト（Phase A で追加） |
|---|---|---|
| `normalizeClasses`（互換補完・§9.3 展開・dict 補完・id-safety） | 薄（`normalizeState` 経由の間接のみ。直接参照はコメント1行） | `test_char_normalize_classes_001.js`（17 assert） |
| `evaluatePairingQuality`（同勝数/勝数差/再戦/手動/avoidable/警告ラベル） | **無**（どのテストからも未参照） | `test_char_pairing_quality_001.js`（27 assert） |
| `updateBranchMasterFromTournament`（member_id 紐付け/自動リンク/同名複数スキップ/新規作成/yomiMap） | **無**（コメント言及のみ） | `test_char_branch_master_sync_001.js`（U系 19 assert） |
| `mergeTournamentParticipantsIntoMaster`（added/matched/skipped 集計） | 薄（save-ux テストが setup 目的で import するのみ） | `test_char_branch_master_sync_001.js`（M系 8 assert） |
| `buildPastParticipantsPanelHtml`（検索/50音/クイック/3セクション分割/XSS） | **無**（どのテストからも未参照） | `test_char_past_participants_001.js`（PB 14 assert） |
| `matchesPastParticipantQuery`（漢字/ふりがな/カタカナ一致判定） | **無** | `test_char_past_participants_001.js`（PQ 5 assert） |
| 履歴/アーカイブ | （Issue は「薄い候補」として列挙したが）**実測=厚**（`test_history_step1.js` 49 assert で保存/一覧/閲覧/quota/読取専用 overlay を網羅） | 追加不要（現状維持） |
| クラス可変 `addClass`/`removeClass` | （同上）**実測=厚**（`test_class_variable_001.js` で id 採番/dict/ガード網羅） | 追加不要（現状維持） |

### 注記: `bindMasterEditModalEvents`（および各 `bind*ModalEvents`）
DOM への `addEventListener` 結線（build-bind-coordinator の bind 層）であり、ヘッドレス DOM モックでは
ハンドラ実体の副作用しか観測できず characterization の費用対効果が低い。Phase A では**意図的に未着手**とし、
リファクタで bind 層に触れる際は、結線対象の id 集合と委譲先関数（純ロジック側）を別途固定する方針とする。

---

## 3. ゴールデンマスター土台（Phase A deliverable 2）

`test/test_golden_master_001.js` ＋ スナップショット `test/fixtures/golden_master/golden_snapshot_001.json`（22ケース）。

- **目的**: build*/純関数の現状出力を採取し、後続リファクタで **HTML 文字列のバイト一致 / JSON の構造一致** を要求する。
- **対象**: normalizeClasses（3分岐）/ normalizeState 往復恒等 / normalizeReport*（3）/ evaluatePairingQuality（2）/
  buildScoreboardClassTableHtml / buildResultsClassHtml（PC・SP）/ buildCurrentPairingsHtml / buildTournamentPdfFilename /
  calcFinal / getWins / getTopPlayers / buildArchiveEntryFromState / buildPastParticipantsPanelHtml（2）/
  updateBranchMasterFromTournament / mergeTournamentParticipantsIntoMaster。
- **決定性**: crypto.randomUUID 固定モック・Date は FixedDate（now/引数なし new を固定エポック）。
  **出力に「今日」を埋め込むケースは不採用**（quickFilter=null・tournament_date は常に明示）＝マシン/TZ 非依存。
- **使い方**:
  - 比較（既定・CI）: `node test/test_golden_master_001.js shogi_v4.html`
  - 採取し直し（意図的更新時のみ）: `UPDATE_GOLDEN=1 node test/test_golden_master_001.js shogi_v4.html`
- **番人としての実証**: スナップショットを1値改変 → 該当ケースを行レベル diff で FAIL することを確認済み。

---

## 4. Phase B（リファクタ本体・本 Issue 外）に向けたガイド

リファクタで関数の**出力を変えてはいけない**領域は、まず本ゴールデンマスターに代表入力を追加して固定してから着手する。
高リスク（`normalizeState` / `addPlayer` / `generatePairing`）に触れる前は characterization を拡充する。
Phase B 第1スライス候補 = `normalizeReport*`（被覆厚・純ヘルパー・挙動完全同値）。
