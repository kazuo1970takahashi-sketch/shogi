# Phase A: テスト安全網整備（被覆マップ＋ゴールデンマスター土台＋characterization）

- Issue: #283（[req] shogi_v4.html 段階リファクタ — Phase A: テスト安全網整備）
- Review Level: **L2**（test/ のみ・runtime 無改変）
- base: orphan clean base `fa1f477` / branch: `feature/phase-a-test-safety-net-001`
- 方針: 「全テストを先に書き切らず、触る直前にその領域だけ完璧にする」の **Phase A = 安全網の底上げのみ**。
  リファクタ本体（Phase B 以降）は別 PR。

## スコープ（DoD と対応）

| DoD | 実装 |
|---|---|
| 被覆マップが存在し、薄い領域が特定されている | `test/COVERAGE_MAP.md`（領域別 厚/薄/無・Issue 名指し領域の判定表） |
| ゴールデンマスターのハーネスが動き run_tests.sh から実行できる | `test/test_golden_master_001.js` + `test/fixtures/golden_master/golden_snapshot_001.json`（22ケース）・run_tests.sh に配線 |
| 薄い領域の characterization が追加され現行コードで PASS/0/0・WARN=0 | characterization 4本（下表）。`run_tests.sh` = **PASS=84 / FAIL=0 / WARN=0** |
| `shogi_v4.html` は無改変（diff ゼロ） | 確認済（後述 self-check） |

## 追加ファイル（すべて test/ ＋ docs/notes/。`shogi_v4.html` 無改変）

| ファイル | 内容 | assert |
|---|---|---|
| `test/COVERAGE_MAP.md` | 被覆マップ（deliverable 1） | — |
| `test/test_golden_master_001.js` | ゴールデンマスター・ハーネス（deliverable 2） | 22ケース |
| `test/fixtures/golden_master/golden_snapshot_001.json` | 採取済スナップショット | — |
| `test/test_char_pairing_quality_001.js` | `evaluatePairingQuality` 詳細分岐（被覆=無） | 27 |
| `test/test_char_normalize_classes_001.js` | `normalizeClasses` 互換補完（被覆=薄） | 17 |
| `test/test_char_branch_master_sync_001.js` | 支部マスタ同期2関数（被覆=無/薄） | 27 |
| `test/test_char_past_participants_001.js` | 過去参加者パネル（被覆=無） | 19 |
| `test/run_tests.sh` | 上記5本を末尾に配線（最終結果の直前） | — |

## 設計判断

1. **ゴールデンマスターの決定性**: crypto.randomUUID は固定モック、Date は FixedDate（`now()`/引数なし `new` を固定エポック・
   引数つき `new Date('2026-06-14')` は実 parse 維持）。さらに **出力に「今日」を含むケースを採用しない**
   （`buildPastParticipantsPanelHtml` は quickFilter=null、マスタ同期は tournament_date を常に明示）。
   → スナップショットはローカルタイムゾーンに非依存。2回採取で byte 完全一致を確認。
2. **スナップショット運用**: 比較が既定（CI/run_tests.sh）。意図的更新時のみ `UPDATE_GOLDEN=1`。
   スナップショット不在時は「採取せよ」と案内して FAIL。ケースの増減も検知。
3. **characterization の観点**: 単なる出力 pin（ゴールデンマスター）に加え、**人間可読な分岐 assert** を別途用意し意図を残す。
   特に「同名複数候補時、`updateBranchMasterFromTournament`=スキップ / `mergeTournamentParticipantsIntoMaster`=新規作成」
   という挙動差を明示的に固定。
4. **新規 member の UUID 衝突回避**: 固定モック UUID のため、1回の同期呼び出しにつき新規 member は最大1名に制限。
5. **`bindMasterEditModalEvents` は意図的に未着手**: bind 層（DOM 結線）はヘッドレスで観測価値が低く、Phase B で
   触れる際に id 集合＋委譲先で固定する方針（COVERAGE_MAP §2 注記）。
6. **クラス可変 add/remove・履歴/アーカイブ**: Issue は「薄い候補」として列挙したが実測は **厚**
   （`test_class_variable_001` / `test_history_step1`）。マップにその旨を明記し、二重投資を避けた。

## 拘束ルール遵守

- ES5/古典的クロージャ/グローバル state を前提に**読むだけ**（test は `new Function` ハーネスで関数抽出）。
- match 正準形・保存スキーマ・`normalizeState` 往復恒等性は **テストで固定する側**（壊していない。往復恒等 `identical=true` を採取）。
- 挙動変更ゼロ（test 追加のみ）。編集は test/ と docs/notes/ のみ。`index.html`/`.github`/`package*`/`shogi_v4.html` 不変。`?v=N` 据置。
- fixture は完全架空（架空◯◯ / m-xxx / q1..）。secret・実データ・PII 不使用。

## self-check（採取時点）

- `bash test/run_tests.sh shogi_v4.html` = **PASS=84 / FAIL=0 / WARN=0**（baseline 79 + 新規5ブロック）。
- ゴールデンマスター: 比較 PASS 22/0、2回採取 byte 一致（決定的）、1値改変で当該ケース FAIL（番人として機能）を実証。
- `git diff --stat fa1f477 -- shogi_v4.html` = 出力なし（**無改変**）。
- 停止条件: **Draft PR で停止**（Ready化/merge/branch削除/production 反映は人間承認まで未実施）。
