# SAVE-UX-NONQUOTA-NOTIFY-001 — Codex Conditional GO (P2×3) 追補

Issue #260 / PR #262。先行コミット `d518f82`（非quota保存失敗を `notifySaveWarning` でユーザー可視化）に対する
Codex Conditional GO（P0/P1 なし・**P2×3**）の反映。芯は **「`saveBranchMaster()` が失敗ステータスを返さないため、
警告を出しても呼び出し側が直後の `showMsg(...,'ok')` 成功バナーで上書きしてしまう」**。

## やったこと（追加/最小改変のみ）

### P2-1 失敗シグナルを返す（最重要）— `saveBranchMaster()`
- 成功（`localStorage.setItem` 完了）で `return true`。
- 失敗（quota / 非quota いずれの catch 分岐）で `return false`（quota は従来 `return;`＝undefined を `return false` に。
  user-facing 挙動＝`notifySaveWarning` の呼出・文言・indicator は不変。戻り値だけ undefined→false の追補）。
- これで呼び出し側は戻り値で成功表示を抑止できる（state 本体 `save()` の verify 経路と同じ「失敗を上書きしない」原則）。

### P2-1b 呼び出し側の成功バナー抑止（`saved&&` ガード）
保存直後に成功を提示していた **7 経路**を `var saved=saveBranchMaster(...)` で受け、`saved` が真のときだけ成功表示：

| 経路 | 関数 | 成功表示 |
| --- | --- | --- |
| マスタリセット | `bindMasterResetModalEvents` | `showMsg('マスタをリセットしました…','ok')` |
| 22名取込(Phase2) | `bindPhase2ImportModalEvents` | `showMsg('…取り込みました…','ok')` |
| 上書きインポート | `processMasterImportText`(overwrite) | `showMsg('参加者マスタを読み込みました…','ok')` |
| マージインポート | `processMasterImportText`(merge) | `showMsg('参加者マスタにマージしました…','ok')` |
| メンバー削除 | `bindMasterTabEvents`(delete) | `showMsg('「…」を削除しました','ok')` |
| メンバー復元 | `bindMasterTabEvents`(restore) | `showMsg('「…」を復元しました','ok')` |
| 過去大会マイグレ | `bindMigrationModalEvents` | `statusEl.textContent`（成功サマリ）＝保存失敗時は失敗＋バックアップ誘導文に差替え |

**対象外（既に正しい / 別観点）として据え置いた経路**:
- `applyParticipantRenameWithMaster`(MASTER-001) / クラス変更 S03・S05 / マスタ編集 S22 — いずれも
  `verifyMasterFieldPersisted` / `verifyMasterPersisted` の **再読込 verify で成功表示を既にガード済**。
- `addPlayer` の yomi バックフィル / `finalizeAddPastParticipants` の yomi 更新 — 成功表示は **参加者 state の登録**
  （`verifyPlayerPersistedById` で別途 verify 済）に関するもので、master 保存の戻り値で抑止するのは誤り。
- `save()`（state 本体）— Issue 対象外。文言は「大会データをコピー」のままが正（保存対象＝大会データのため）。

### P2-2 バックアップ誘導先を master に
非quota失敗の文言を `支部マスタの保存に失敗しました。大会データをコピー（バックアップ）してください。` →
`支部マスタの保存に失敗しました。「マスタをエクスポート」でマスタをバックアップしてください。` に変更。
失敗対象は branch master（`BRANCH_MASTER_KEY` / `masterExportBtn`＝「📤 マスタをエクスポート」）なので、
復旧経路を master エクスポートへ正す。`save()`（line ~1021）の「大会データをコピー」は別経路で正しいため不変。

## P2-3 回帰テスト
`test/test_save_branch_master_failure_signal.js`（17 assert・`run_tests.sh` 登録）:
- **R** 戻り値契約: 成功=true / 非quota失敗=false / quota失敗=false。
- **W** 文言: 「マスタをエクスポート」を含み「大会データをコピー」を含まない・プレフィックス保持。
- **S** 呼び出し側抑止（直接呼べる代表経路 `processMasterImportText` overwrite/merge）: 非quota保存失敗で成功バナーを
  出さず warn を残す / 保存成功で従来通り成功バナーを出す（非回帰）。
- 未修正 base `d518f82` では 10/17 が FAIL（=P2 バグを確実に捕捉）。

## 検証
- `bash test/run_tests.sh shogi_v4.html`: baseline `73/0/35` → **`74/0/35`**（新規 +1 PASS・FAIL/WARN 不変＝非回帰）。
- `npx html-validate shogi_v4.html`: exit 0。
- PII / 実データ: なし（架空名「架空花子」のみ）。`index.html` 未 touch。

Review Level: **L3**（`shogi_v4.html` runtime）→ Codex 独立再レビュー。Draft 維持・merge/Ready化は人間承認まで未実施。
