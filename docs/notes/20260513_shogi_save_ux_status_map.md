# SHOGI-TOUR 保存安全化 / SAVE-UX 現在地マップ

- 作成日: 2026-05-13
- 対象 main HEAD: `67bd189`（PR #63 `feat(save-ux): S03/S05の保存確認失敗を軽通知する` squash 後）
- Task ID: `SAVE-UX-STATUS-MAP`
- 種別: **現在地メモ（docs-only）**。確定仕様ではない。

---

## 1. 目的とスコープ

PR #59 〜 #63 で導入された保存安全化 / verify / 通知の現在地を **callsite 単位で一覧化** し、次に着手する候補（S22 / `notifySaveWarning` helper / status indicator / warn aggregation）の優先順位を判断できる状態にする。

これは実装仕様書ではなく、後続タスク決定のための **現在地メモ**。Codex docs review もこの位置づけで読むこと。

### 参照済 PR

| PR | Task ID | 種別 |
|---|---|---|
| [#59](https://github.com/kazuo1970takahashi-sketch/shogi/pull/59) | A-5.1-CLOSURE | docs |
| [#60](https://github.com/kazuo1970takahashi-sketch/shogi/pull/60) | MASTER-V2-LASTCLASS-DESIGN | docs |
| [#61](https://github.com/kazuo1970takahashi-sketch/shogi/pull/61) | MASTER-V2-LASTCLASS-IMPL | impl |
| [#62](https://github.com/kazuo1970takahashi-sketch/shogi/pull/62) | SAVE-UX-DESIGN | docs |
| [#63](https://github.com/kazuo1970takahashi-sketch/shogi/pull/63) | SAVE-UX-MIN-NOTIFY-001 | impl |

---

## 2. 前提

### 2.1 SAVE-UX-DESIGN の中核原則（[docs/specs/20260513_shogi_save_ux_design.md](../specs/20260513_shogi_save_ux_design.md)）

> **「止めすぎず、見逃さず、当日は静かに、後で気づける」**

### 2.2 UX Level 0〜4（Level 5 不採用）

| Level | 通知 | 当日 UI |
|---|---|---|
| 0 | `console.warn` のみ | なし |
| 1 | Level 0 + `showMsg(.., 'warn')` / toast | toast 1 件、**最終的に warn が見える** |
| 2 | Level 1 + 保存状態 indicator に累積 | toast + 隅バッジ |
| 3 | Level 2 + persistent warning bar | toast + バッジ + 上部バー |
| 4 | Level 3 + inline confirm / 手動 retry 導線 | toast + バッジ + バー + inline |
| ~~5~~ | ~~modal で運営停止~~ | **採用しない** |

### 2.3 PR #63 の重要な学び

> **「showMsgあり」と「最終表示 warn 保証あり」は別物**

Codex 指摘の核心:

- `showMsg(.., 'warn')` を呼んだ直後に、別の `showMsg(.., 'ok')` が走ると、`reg-msg.innerHTML` は上書きされ **最終的に運営者が見る表示は ok** になる
- これでは Level 1 の目的（「保存未確認」を運営者に見せる）を満たさない
- **Level 1 達成には「最終 `reg-msg.innerHTML` が `alert-warn` 種別である」ことを保証する設計が必要**

PR #63 では S03 / S05 の verify 結果を変数化し、失敗時は後続の success `showMsg(ok)` 自体を抑止する形で対応した（S05 では `postSuccess` の `options.suppressOkMsg`）。

---

## 3. 評価ルール

本マップでの Level 判定基準:

| 現在 Level | console.warn | showMsg | 最終表示 warn 保証 | 備考 |
|---|---|---|---|---|
| **0** | ○ | × | — | user-facing 通知なし |
| **0.5（便宜分類）** | ○ | ○ | × または未検証 | 要修正 / Level 1 達成には追加対応が必要 |
| **1** | ○ | ○ | ○ | Level 1 達成 |
| **2 以上** | — | — | — | indicator / warning bar / inline confirm 導入後に評価 |

注意:

- **Level 0.5 は本マップ上の便宜的な要修正分類**であり、正式な UX Level ではない（SAVE-UX-DESIGN §3 では Level 0 / 1 / 2 / 3 / 4 のみ定義）
- 「最終表示 warn 保証」列は、当該 callsite の **コード経路を実際に読んで** ○ にする。grep 一致や callsite に showMsg 呼び出しがあるだけでは ○ にしない
- 不明 / 未検証 / 要コード確認 は推測で ○ にしない

---

## 4. callsite マップ

系統別に分けて記載する。

### 4.1 A-5.1 / SAVE 系（state 側 verify）

| ID | 対象操作 | 対象関数 / 行 | verify helper | 保存対象 | console.warn | showMsg | 種別 | 最終表示 warn 保証 | success showMsg 上書きリスク | 処理停止 | rollback等 | テスト有無 | 現在 Level | 推奨 Level | 既知リスク | 後続 Task ID | 優先度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SAVE-001 | 参加者削除 | `removePlayer` ([3376](../../shogi_v4.html:3376)) | `verifyPlayerAbsent` | `state.players[cls]` の id 不在 | ○ | ○ | warn | ○（warn 後に showMsg なし） | なし | しない | rollback / retry / alert / modal なし | あり（`test_a5_1_save_001.js`） | 1 | 1 | — | — | — |
| SAVE-002 | 参加者追加（手入力） | `addPlayer` ([3344](../../shogi_v4.html:3344)) | `verifyPlayerPersistedById` | id+cls+name 3 軸一致 | ○ | ○ | warn | ○（ok→warn の順、warn が最後） | なし | しない | 同上 | あり（`test_a5_1_save_002.js`） | 1 | 1 | — | — | — |
| SAVE-003 | 大会開始 | `startTournament` ([4033](../../shogi_v4.html:4033)) | `readPersistedState` + `started===true` | `state.started` | ○ | ○ | warn | ○（warn 後に showMsg なし） | なし | しない | 同上 | あり（`test_a5_1_save_003.js`） | 1 | 1 | — | — | — |
| SAVE-003 | ペアリング生成 | `generatePairing` ([4201](../../shogi_v4.html:4201)) | `readPersistedState` + `pairingsMatchSnapshot` | `state.pairings[cls]` | ○ | ○ | warn | ○ | なし | しない | 同上 | あり | 1 | 1 | — | — | — |
| SAVE-003 | 勝敗入力 | `setWinner` ([4298](../../shogi_v4.html:4298)) | `readPersistedState` + winner 比較 | `state.pairings[cls][idx].winner` | ○ | ○ | warn | ○ | なし | しない | 同上 | あり | 1 | 1 | 頻度高（タップ毎） | — | — |
| SAVE-003 | 回戦確定 | `submitRound` ([4427](../../shogi_v4.html:4427)) | `readPersistedState` + length + `pairingsMatchSnapshot` | `state.results[cls]` + 新 pairings | ○ | ○ | warn | ○ | なし | しない | 同上 | あり | 1 | 1 | 不可逆操作 | — | — |
| SAVE-003b-1 | サジェスト経由 追加 | `handleSuggestClassAdd` case 1 → `postSuccess` ([3174](../../shogi_v4.html:3174)) | `verifyPlayerPersistedById` | id+cls+name | ○ | ○ | warn | ○（`postSuccess` 内 ok→warn 順、warn が最後） | なし | しない | 同上 | あり（`test_a5_1_save_003b_add_paths.js`） | 1 | 1 | — | — | — |
| SAVE-003b-1 | サジェスト経由 クラス変更 | `handleSuggestClassAdd` case 2 → `postSuccess(suppressOkMsg)` ([3174](../../shogi_v4.html:3174)) | 同上 + S05 MV2 verify | id+cls+name + master.last_class | ○ | ○ | warn | ○（PR #63 で `suppressOkMsg`、state warn も後続） | なし（PR #63 修正済） | しない | 同上 | あり | 1 | 1 | — | — | — |
| SAVE-003b-1 | 過去参加者パネル 追加 | `handlePastParticipantClassAdd` case 1 ([1733](../../shogi_v4.html:1733)) | `verifyPlayerPersistedById` | id+cls+name | ○ | ○ | warn | ○（ok→warn 順、warn が最後） | なし | しない | 同上 | あり | 1 | 1 | — | — | — |
| SAVE-003b-1 | 過去参加者パネル クラス変更 | `handlePastParticipantClassAdd` case 2 ([1700](../../shogi_v4.html:1700)) | 同上 + S03 MV2 verify | 同上 + master.last_class | ○ | ○ | warn | ○（PR #63 で ok ガード、state warn も後続） | なし（PR #63 修正済） | しない | 同上 | あり | 1 | 1 | — | — | — |
| SAVE-003b-1 | 過去参加者 一括追加 | `finalizeAddPastParticipants` ([1881](../../shogi_v4.html:1881)) | `verifyPlayerPersistedById` 全件ループ | 複数 player 追加 | ○ | ○ | warn | ○（ok→warn 順、warn 件数集約） | なし | しない | 同上 | あり | 1 | 1 | バッチ集約済 | — | — |
| SAVE-003b-2 | 対戦相手変更 / swap | `bindChangePairingModalEvents` ([4406](../../shogi_v4.html:4406)) | `readPersistedState` + `pairingsMatchSnapshot` | `state.pairings[cls]` 配列全体 | ○ | ○ | warn | ○ | なし | しない | 同上 | あり（`test_a5_1_save_003b_edit_paths.js`） | 1 | 1 | — | — | — |
| SAVE-003b-2 | 過去結果修正 p1 | `bindEditPastResultModalEvents` ep-p1 ([4694](../../shogi_v4.html:4694)) | ローカル closure `verifyPastResultPersisted_ep` | `results[cls][r][m].winner` | ○ | ○ | warn | ○ | なし | しない | 同上 | あり | 1 | 1 | — | — | — |
| SAVE-003b-2 | 過去結果修正 p2 | `bindEditPastResultModalEvents` ep-p2 ([4704](../../shogi_v4.html:4704)) | 同上 | 同上 | ○ | ○ | warn | ○ | なし | しない | 同上 | あり | 1 | 1 | — | — | — |
| SAVE-003b-3 | 登録欄 member/grade onchange | `updateField` ([3011](../../shogi_v4.html:3011)) | `verifyPlayerFieldPersisted` | `state.players[cls][i][field]` | ○ | ○ | warn | ○ | なし | しない | 同上 | あり（`test_a5_1_save_003b_edit_fields.js`） | 1 | 1 | — | — | — |
| SAVE-003b-3 | 一括氏名変更 | `bindBulkEditModalEvents` bulk-save ([3505](../../shogi_v4.html:3505)) | `verifyStatePersisted` 全件ループ | 複数 player の name | ○ | ○ | warn | ○（warn 件数集約） | なし | しない | 同上 | あり | 1 | 1 | バッチ集約済 | — | — |

### 4.2 MASTER-001 系（master 側 name 軸 verify）

| ID | 対象操作 | 対象関数 | verify helper | 保存対象 | console.warn | showMsg | 種別 | 最終表示 warn 保証 | success showMsg 上書きリスク | 処理停止 | rollback等 | テスト有無 | 現在 Level | 推奨 Level | 後続 Task ID | 優先度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MASTER-001 | 参加者名修正（マスタ反映なし） | `applyParticipantRenameOnly` ([3807](../../shogi_v4.html:3807)) → `showMasterSyncResult` | `verifyStatePersisted` | `state.players` の name | ○ | ○ | warn | ○（`showMasterSyncResult` が単一 showMsg を出す） | なし | しない | rollback / retry / alert / modal なし | あり（`test_master_001.js`） | 1 | 1 | — | — |
| MASTER-001 | 参加者名修正 + マスタ反映 | `applyParticipantRenameWithMaster` ([3828](../../shogi_v4.html:3828)) → `showMasterSyncResult` | `verifyMasterPersisted`（name 専用） | `master.members[i].name` | ○ | ○ | warn | ○ | なし | しない | 同上 | あり | 1 | 1 | — | — |

### 4.3 MASTER-V2-LASTCLASS 系（master 側 field 軸 verify）

| ID | 対象操作 | 対象関数 | verify helper | 保存対象 | console.warn | showMsg | 種別 | 最終表示 warn 保証 | success showMsg 上書きリスク | 処理停止 | rollback等 | テスト有無 | 現在 Level | 推奨 Level | Level 差分 | 既知リスク | 後続 Task ID | 優先度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S03 | 過去参加者パネル クラス変更（既登録者分岐のみ） | `handlePastParticipantClassAdd` case 2 ([1685](../../shogi_v4.html:1685)) | `verifyMasterFieldPersisted('last_class')` | `master.members[i].last_class` | ○ | ○ | warn | **○（PR #63 で `s03MasterVerifyOk` 変数化 + ok ガード）** | なし（PR #63 修正済） | しない | rollback / retry / alert / modal なし | あり（`test_master_v2_lastclass.js`） | 1 | 1 | 0 | — | — | — |
| S05 | サジェスト経由 クラス変更（既登録者分岐のみ） | `handleSuggestClassAdd` case 2 ([3185](../../shogi_v4.html:3185)) | 同上 | 同上 | ○ | ○ | warn | **○（PR #63 で `s05MasterVerifyOk` + `postSuccess(suppressOkMsg)`）** | なし（PR #63 修正済） | しない | 同上 | あり | 1 | 1 | 0 | — | — | — |
| S22 | 会員マスタ編集モーダル保存 | `bindMasterEditModalEvents` me-save ([2523](../../shogi_v4.html:2523)) | `verifyMasterFieldPersisted` × 4 fields | `last_class` / `member` / `grade` / `city` | ○（field 別、4 件可能） | **×（user-facing 通知なし）** | — | — | **未対応**（line 2544 で `showMsg('マスタを更新しました', 'ok'/'warn')` が無条件に走るため、仮に showMsg(warn) を追加すると上書きされる） | しない | 同上 | あり | **0** | 1 | **+1（要昇格）** | line 2544 の既存 `showMsg(msg, 'ok')` が「マスタを更新しました」を出すため、PR #63 と同パターン（verify 結果に応じて success 抑止 + 集約 warn）が必要 | **SAVE-UX-MIN-NOTIFY-002** | **最優先** |

### 4.4 localStorage / quota / parse / 破損系

| ID | 対象操作 | 対象関数 / 経路 | 失敗検知方法 | console.warn | showMsg | 種別 | 最終表示 保証 | 処理停止 | rollback等 | 現在挙動 | 推奨 Level | 既知リスク | 後続 Task ID | 優先度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| QUOTA-001 | `save()` の `localStorage.setItem` 例外 | `save()` ([405](../../shogi_v4.html:405)) → `notifyError` | catch | ○（`notifyError` 経由） | ○ | **err**（warn ではない） | ○（`notifyError` で `showMsg(err)`、登録タブ非表示時は alert 併発） | しない | 既存 alert 例外あり（modal-ish） | `showMsg(err)` + 場合により alert | 未確定（SAVE-UX-DESIGN §4 で「再検討」と分類） | 既存 alert は本タスクで変更しない。Level 2 / 3 / 4 への置換は SAVE-UX-STATUS-INDICATOR / SAVE-UX-RETRY-POLICY で判断 | — | 中 |
| CORRUPT-001 | `loadBranchMaster` の parse 失敗 → `_loaded_with_corruption` | `loadBranchMaster` ([590](../../shogi_v4.html:590)) | catch + フラグ | ○ | （直接は出さず、後続で出す）| — | — | しない | parse 失敗時に空マスタ返却、既存 localStorage は保持 | 単独では Level 0 相当 | Level 2-3 候補（SAVE-UX-PHASE-AWARE で扱う） | — | — | 低〜中 |
| CORRUPT-002 | `syncBranchMasterOnSave` の corruption スキップ | `syncBranchMasterOnSave` ([4805](../../shogi_v4.html:4805)) | `_loaded_with_corruption` チェック | ○ | ○ | warn | ○（`showMsg(warn)` 後に同関数内で他 showMsg なし） | しない | rollback / retry なし | 1 相当 | 1 | — | （MASTER-V2-S30-BATCH-VERIFY 起票時に再評価） | — | 中 |

### 4.5 後続対象（別トラック）

import / merge / migration 系は **本マップの保存後 verify トラックとは別** として扱う。SAVE-DESIGN-001 v0.1 §5 の `SAVE-FUTURE` 系、設計書 §7.3 / §9 の `SAVE-FUTURE-IMPORT` 配下で別タスク化する。

| 系統 | 主な callsite | 現状 verify | 後続 Task ID |
|---|---|---|---|
| マスタ Phase 2 import | `applyPhase2Import` ([2171](../../shogi_v4.html:2171)) | 未実装 | SAVE-FUTURE-IMPORT |
| マスタ overwrite import | `processMasterImportText` overwrite ([2386](../../shogi_v4.html:2386)) | 未実装 | SAVE-FUTURE-IMPORT |
| マスタ merge import | `processMasterImportText` merge ([2402](../../shogi_v4.html:2402)) | 未実装 | SAVE-FUTURE-IMPORT |
| マスタ migration | migration ウィザード | 未実装 | SAVE-FUTURE-IMPORT |
| 大会データ JSON 取込 | `applyLoadedJson` ([4881 周辺](../../shogi_v4.html:4881)) | 未実装 | SAVE-FUTURE-IMPORT |
| 報告書フォーム入力（keystroke） | `bindReportEvents` ([5277 周辺](../../shogi_v4.html:5277)) | 未実装（debounce 化が前提） | SAVE-FUTURE-REPORT |
| `syncBranchMasterOnSave` の 2 段保存 batch verify | `syncBranchMasterOnSave` ([4805](../../shogi_v4.html:4805)) | partial（corruption 系のみ） | MASTER-V2-S30-BATCH-VERIFY |

---

## 5. Level 0.5 / 要修正候補サマリー

**評価ルール §3** に基づき、Level 1 に未達 / 要修正の callsite を列挙する。

### 5.1 最有力の要修正候補

| ID | 状態 | 必要な対応 | 優先度 |
|---|---|---|---|
| **S22**（会員マスタ編集モーダル） | 現在 Level 0（`console.warn` field 別あり、`showMsg(warn)` なし）。仮に `showMsg(warn)` を素朴に追加すると、line 2544 の `showMsg('マスタを更新しました', 'ok')` で上書きされ Level 0.5 状態に陥る | PR #63 と同パターン: verify 結果（4 fields 集計）に応じて line 2544 の `success showMsg` を抑止し、warn が最終表示として残るように設計。`showMsg` は callsite ごと **1 件集約**（`console.warn` は field 別を維持） | **最優先** |

### 5.2 「showMsg はあるが最終表示 warn 保証が不明」 — 該当なし（再確認）

main = `67bd189` 時点でコードを確認したが、A-5.1 系 / MASTER-001 系 / MASTER-V2 S03 / S05 のいずれも以下のいずれかに該当し、最終表示 warn 保証は ○ と判断:

- 当該 callsite の verify 失敗ブロック内 `showMsg(warn)` 以降に showMsg 呼び出しがない
- 順序が `showMsg(ok)` → `showMsg(warn)`（warn が最後）になっている
- PR #63 で `suppressOkMsg` / verify 変数化により明示的に ok を抑止している

ただし、将来の callsite 改修で「verify ブロックの後ろに別の showMsg を追加する」変更が入ると、上書きが復活し Level 0.5 状態に陥るリスクは残る。**SAVE-UX-MIN-NOTIFY-002 や SAVE-UX-WARN-HELPER 着手時、helper 化で「最終表示 warn 保証」の仕組みを構造的に担保する** ことが望ましい。

### 5.3 quota exceeded（`save()` catch）の扱い

QUOTA-001 は `showMsg(err)` + 場合により `alert` で通知される既存挙動を維持中。SAVE-UX-DESIGN §2.3 の「modal / alert を保存失敗通知の手段にしない」原則とは緊張関係にあるが、quota は構造的な保存失敗で当日対応の必要性が高く、本タスク（および SAVE-UX-MIN-NOTIFY-001）では **意図的に変更していない**。SAVE-UX-STATUS-INDICATOR / SAVE-UX-RETRY-POLICY 起票時に Level 2 / 3 / 4 のどれに置き換えるかを判断する。

---

## 6. S22 に進む前の論点（SAVE-UX-MIN-NOTIFY-002 設計準備）

### 6.1 確定方針

- field 別 `console.warn` は **維持**（後追いデバッグで field 単位の不一致を追跡できることが価値、SAVE-UX-DESIGN §6.1）
- user-facing `showMsg` は **callsite ごとに 1 件集約**（SAVE-UX-DESIGN §6.2 で確定済）

### 6.2 要検討事項

| 論点 | 検討内容 |
|---|---|
| 最終表示 warn 保証 | PR #63 と同じ「verify 結果に応じて success `showMsg` を抑止」パターンを line 2544 の `showMsg('マスタを更新しました', 'ok')` に適用。`s22MasterVerifyAllOk` のような集計フラグを導入し、1 件でも失敗があれば warn 文言で上書き、または ok 自体を出さない設計を決める |
| 集約 warn 文言 | 「会員マスタの保存が確認できませんでした（field: X, Y）」のような件数 / field 列挙パターンと、「会員マスタの保存が確認できませんでした」のような最小文言パターンのどちらにするか。SAVE-UX-DESIGN §6.2 の方針（最小集約）に沿って後者寄りで決める |
| state verify との優先順位 | S22 はマスタ編集モーダルからの呼び出しで、現状 state verify とは独立（S22 内で state.players の `verifyStatePersisted` を呼んでいない）。同時失敗時の優先順位検討は当面不要。再確認は実装着手時に行う |
| `duplicateCount > 0` 警告との優先順位 | 現状の line 2544 は `result.duplicateCount > 0` のときに `showMsg(msg, 'warn')` を出す（「同名 N 件あり：自動統合しません」）。verify 失敗時の集約 warn と、duplicate 警告のどちらを優先するか / 統合するかを設計する |
| 既存テストへの影響 | `test/test_master_v2_lastclass.js`（103 件 PASS）の S22 セクションで既存 console.warn 検証が動いている。最終表示検証（PR #63 で導入した `_regMsgFinal` パターン）を S22 にも追加する想定。既存テストは原則保持 |
| 次タスク候補 | **SAVE-UX-MIN-NOTIFY-002**（S22 専用、最小スコープ） |

---

## 7. `notifySaveWarning` helper に進む前の論点

### 7.1 helper 先か S22 先か

| 案 | メリット | デメリット |
|---|---|---|
| **S22 を先に具体実装**（SAVE-UX-MIN-NOTIFY-002） | callsite の実需要が見えてから helper 化できる。過剰抽象化を避けられる | S22 と S03 / S05 で類似コードが重複する状態が一時的に続く |
| helper を先に作る（SAVE-UX-WARN-HELPER） | S22 着手時には helper が使える | callsite が S03 / S05 / S22 の 3 件しかない段階で抽象化すると、後続 callsite で抽象化が合わない可能性 |

**推奨**: 当面は **S22 を先**。3 callsite 揃った後で helper 化候補を再評価する。SAVE-UX-DESIGN §7.3 の優先順位（SAVE-UX-MIN-NOTIFY → SAVE-UX-WARN-HELPER）と整合。

### 7.2 helper が必要になりそうな情報（将来案）

`notifySaveWarning({...})` の引数として想定される情報:

- `severity` / `level`（Level 0 / 1 / 2...）
- `userMessage`（`showMsg` で出す文言）
- `consoleTag`（`console.warn` のタグ、例: `[MASTER-V2-LASTCLASS] S22 ...`）
- `callsiteId`（S03 / S05 / S22 等）
- `entityType`（`player` / `master_member` / `pairing` 等）
- `field`（field 軸 verify のとき）
- `expected` / `actual`（warn メタ）
- `aggregationKey`（同一 callsite の連続 warn を集約する場合）
- `suppressOkMsg`（**PR #63 の学び**: 呼出側の success `showMsg` を抑止するかどうかのヒント）

### 7.3 PR #63 の学びの helper 設計への含意

PR #63 で得た「最終表示 warn 保証 = success `showMsg` の抑止」の知見は、helper API に **`suppressOkMsg` 相当の概念** を組み込む必要があることを示唆する。helper を呼んだだけで終わりではなく、「呼出側が success `showMsg` を出すかどうかを helper の判断に従わせる」設計が望ましい。

---

## 8. 後続 Task ID 候補（優先順）

SAVE-UX-DESIGN §9 と本マップの分析を統合した優先順位:

| # | Task ID | 種別 | 主スコープ | 本マップでの根拠 |
|---|---|---|---|---|
| 1 | **SAVE-UX-MIN-NOTIFY-002** | impl | S22 を Level 0 → Level 1（4 fields `console.warn` 維持、`showMsg` 1 件集約、最終表示 warn 保証） | §5.1 で唯一の要修正 callsite |
| 2 | SAVE-UX-WARN-HELPER | impl | `notifySaveWarning` 正式 helper 化、severity 定数、`suppressOkMsg` 抽象化 | §7.1 で「S22 → helper」順序を推奨。S03 / S05 / S22 の類似コード重複を解消 |
| 3 | SAVE-UX-STATUS-INDICATOR | impl | 保存状態 indicator（隅バッジ + 詳細パネル、Level 2 を担う） | SAVE-UX-DESIGN §3.3 / §3.4 |
| 4 | SAVE-UX-WARN-AGGREGATION | impl | バッチ操作 warn 集約の一般化（`finalizeAddPastParticipants` / `bulkEditNames` を helper 統合）、Level 3 の N 閾値決定 | SAVE-UX-DESIGN §3.4 / §7.3 |
| 5 | MASTER-V2-S30-BATCH-VERIFY | impl | `syncBranchMasterOnSave` の 2 段保存 batch verify | §4.4 / SAVE-UX-DESIGN §9 |
| 6 | SAVE-UX-RETRY-POLICY | design | 手動 retry UI の採否・粒度・配置 | SAVE-UX-DESIGN §5 / §7.3 |
| 7 | SAVE-UX-PHASE-AWARE | design | 大会フェーズ別の通知 Level 自動調整 | SAVE-UX-DESIGN §7.4 |
| 8 | SAVE-FUTURE-REPORT | impl | `bindReportEvents` の debounce / blur 化 + 保存未確認検知 | §4.5 |
| 9 | SAVE-FUTURE-IMPORT | impl | `applyLoadedJson` / import / merge / migration 系の verify | §4.5 |

---

## 9. 後続対象（import / merge / migration 系）

import / merge / migration 系は **本マップの保存後 verify トラックとは別** として扱う。

理由:

- 保存後 re-read verify は「単一 callsite の単一 / 少数 field の永続化確認」が主軸
- import / merge / migration は「大量データの構造的整合」が主軸で、verify 軸が違う
- バッチ操作 warn 集約方針（SAVE-UX-WARN-AGGREGATION）と一体設計が必要
- schema 整合性が前提条件として未確定

切り出し先: **SAVE-FUTURE-IMPORT**（[§8](#8-後続-task-id-候補優先順) #9）

本マップ作成時点（main = `67bd189`）では import / merge / migration 系の verify は未実装で、現状の `processMasterImportText` / `applyPhase2Import` / migration ウィザード / `applyLoadedJson` には保存後 re-read verify が **入っていない**。

---

## 10. レビュー観点（Codex / cowork 向け）

本マップを独立レビューする際の観点:

1. **callsite の網羅性**
   - PR #59 〜 #63 で導入された verify callsite は §4 でカバーされているか
   - 漏れている `localStorage.setItem` / `JSON.parse(localStorage.getItem(...))` / verify helper 呼び出しはないか
   - import / merge / migration 系を「別トラック」に切り出した判断は妥当か（§4.5 / §9）

2. **「最終表示 warn 保証」列の妥当性**
   - 各 callsite で ○ としている根拠（コード上の順序）が正しいか
   - 「未検証 / 要コード確認」と書くべきところを推測で ○ にしていないか
   - PR #63 の学び（「showMsg を呼んだだけでは不十分」）が反映されているか

3. **Level 0.5 認定基準の妥当性（§3 / §5）**
   - Level 0.5 を「便宜分類、正式 UX Level ではない」と明示しているか
   - S22 を Level 0（showMsg 未追加）と分類した判断は妥当か（「Level 0.5 候補」ではなく「Level 0、Level 0.5 に陥らない設計で Level 1 化すべき」）

4. **S22 / `notifySaveWarning` helper の優先順位（§6 / §7 / §8）**
   - S22 → helper の順序が妥当か
   - helper 設計に必要な情報リスト（§7.2）と PR #63 の学びの統合（§7.3）が妥当か

5. **後続 Task ID 優先順位（§8）の妥当性**
   - SAVE-UX-DESIGN §9 の優先順位と本マップの分析の統合が妥当か
   - MASTER-V2-S30-BATCH-VERIFY を 5 位に置いた判断は妥当か（SAVE-UX 集約方針が前提のため、indicator / aggregation の後）

6. **docs-only 遵守**
   - `shogi_v4.html` / test / workflow / package 系 / `docs/specs/20260513_shogi_save_ux_design.md` への変更がないか
   - HANDOFF.md への追記が 1 行（リンク 1 件）に留まっているか

---

## 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-13 | v0 作成。PR #59 〜 #63 までの保存安全化 / verify / 通知の現在地を callsite 単位で棚卸し。S22 を唯一の要修正候補（Level 0）として特定。SAVE-UX-MIN-NOTIFY-002 を次の最優先タスクと位置づけ。 |
