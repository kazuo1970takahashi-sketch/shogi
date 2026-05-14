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

**位置情報の注意**: 表中の `([NNNN](../../shogi_v4.html:NNNN))` リンクは **main = `67bd189` 時点の参考位置** にすぎず、将来の改修で行番号は容易に陳腐化する。後続タスク（特に SAVE-UX-MIN-NOTIFY-002）の実装着手時は **行番号ではなく関数名・処理名（例: `bindMasterEditModalEvents` の me-save click ハンドラ）・メッセージ文言（例: 「マスタを更新しました」）** で対象箇所を再特定すること。

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
| S22 | 会員マスタ編集モーダル保存 | `bindMasterEditModalEvents` me-save click ハンドラ（`applyMasterMemberEdit` 成功後の `saveBranchMaster` 直後に 4 fields verify） | `verifyMasterFieldPersisted` × 4 fields | `last_class` / `member` / `grade` / `city` | ○（field 別、4 件可能） | **×（user-facing 通知なし）** | — | — | **未対応**（同 click ハンドラ末尾で `showMsg('マスタを更新しました', 'ok'/'warn')` が無条件に走るため、仮に showMsg(warn) を追加すると上書きされる） | しない | 同上 | あり | **0** | 1 | **+1（要昇格）** | 既存 `showMsg('マスタを更新しました', 'ok')`（同 me-save ハンドラ末尾、`duplicateCount > 0` のとき 'warn'）が verify 失敗 warn を上書きするため、PR #63 と同パターン（verify 結果に応じて success 抑止 + 集約 warn）が必要 | **SAVE-UX-MIN-NOTIFY-002** | **最優先** |

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
| **S22**（会員マスタ編集モーダル） | 現在 Level 0（`console.warn` field 別あり、`showMsg(warn)` なし）。仮に `showMsg(warn)` を素朴に追加すると、同じ `bindMasterEditModalEvents` me-save click ハンドラ末尾の `showMsg('マスタを更新しました', 'ok')` で上書きされ Level 0.5 状態に陥る | PR #63 と同パターン: verify 結果（4 fields 集計）に応じて me-save ハンドラ末尾の success `showMsg` を抑止し、warn が最終表示として残るように設計。`showMsg` は callsite ごと **1 件集約**（`console.warn` は field 別を維持） | **最優先** |

### 5.2 「showMsg はあるが最終表示 warn 保証が不明」 — 該当なし（再確認）

main = `67bd189` 時点でコードを確認したが、A-5.1 系 / MASTER-001 系 / MASTER-V2 S03 / S05 のいずれも以下のいずれかに該当し、最終表示 warn 保証は ○ と判断:

- 当該 callsite の verify 失敗ブロック内 `showMsg(warn)` 以降に showMsg 呼び出しがない
- 順序が `showMsg(ok)` → `showMsg(warn)`（warn が最後）になっている
- PR #63 で `suppressOkMsg` / verify 変数化により明示的に ok を抑止している

ただし、将来の callsite 改修で「verify ブロックの後ろに別の showMsg を追加する」変更が入ると、上書きが復活し Level 0.5 状態に陥るリスクは残る。**SAVE-UX-MIN-NOTIFY-002 や SAVE-UX-WARN-HELPER 着手時、helper 化で「最終表示 warn 保証」の仕組みを構造的に担保する** ことが望ましい。

### 5.3 quota exceeded（`save()` catch）の扱い

QUOTA-001 は `showMsg(err)` + 場合により `alert` で通知される既存挙動を維持中。SAVE-UX-DESIGN §2.3 の「modal / alert を保存失敗通知の手段にしない」原則とは緊張関係にあるが、quota は構造的な保存失敗で当日対応の必要性が高く、本タスク（および SAVE-UX-MIN-NOTIFY-001）では **意図的に変更していない**。SAVE-UX-STATUS-INDICATOR / SAVE-UX-RETRY-POLICY 起票時に Level 2 / 3 / 4 のどれに置き換えるかを判断する。

**再分類トリガ**: QUOTA-001 の `alert` / `notifyError` 扱いは、**SAVE-UX-STATUS-INDICATOR 着手時点で再判断する**。具体的には、indicator UI（Level 2）の設計フェーズで、quota exceeded を indicator に置き換えるか、例外的な停止系通知として `alert` を残すかを決定する。それまでは現状維持。

---

## 6. S22 に進む前の論点（SAVE-UX-MIN-NOTIFY-002 設計準備）

### 6.1 確定方針

- field 別 `console.warn` は **維持**（後追いデバッグで field 単位の不一致を追跡できることが価値、SAVE-UX-DESIGN §6.1）
- user-facing `showMsg` は **callsite ごとに 1 件集約**（SAVE-UX-DESIGN §6.2 で確定済）

### 6.2 要検討事項

| 論点 | 検討内容 |
|---|---|
| 最終表示 warn 保証 | PR #63 と同じ「verify 結果に応じて success `showMsg` を抑止」パターンを `bindMasterEditModalEvents` me-save click ハンドラ末尾の `showMsg('マスタを更新しました', 'ok')` に適用。`s22MasterVerifyAllOk` のような集計フラグを導入し、1 件でも失敗があれば warn 文言で上書き、または ok 自体を出さない設計を決める |
| 集約 warn 文言 | 「会員マスタの保存が確認できませんでした（field: X, Y）」のような件数 / field 列挙パターンと、「会員マスタの保存が確認できませんでした」のような最小文言パターンのどちらにするか。SAVE-UX-DESIGN §6.2 の方針（最小集約）に沿って後者寄りで決める |
| state verify との優先順位 | S22 はマスタ編集モーダルからの呼び出しで、現状 state verify とは独立（S22 内で state.players の `verifyStatePersisted` を呼んでいない）。同時失敗時の優先順位検討は当面不要。再確認は実装着手時に行う |
| `duplicateCount > 0` 警告との優先順位 | 現状の me-save ハンドラ末尾の `showMsg` は `result.duplicateCount > 0` のときに `showMsg(msg, 'warn')` を出す（「同名 N 件あり：自動統合しません」）。verify 失敗時の集約 warn と、duplicate 警告のどちらを優先するか / 統合するかを設計する |
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
| 2026-05-13 | docs review Should Fix 2 点を反映。S22 の位置情報を lineNo 単独表現から関数名 + 動作タイミング（`bindMasterEditModalEvents` の me-save click ハンドラ末尾の `showMsg('マスタを更新しました', ...)`）に置換（§4.3 / §5.1 / §6.2 計 4 箇所）。§4 冒頭に「行番号は main=`67bd189` 時点の参考位置、後続では関数名・処理名・メッセージ文言で再特定」の補足を追加。§5.3 に「QUOTA-001 の再分類トリガは SAVE-UX-STATUS-INDICATOR 着手時点」を追記。 |
| 2026-05-14 | SAVE-UX-AGGREGATION-DOCS-FOLLOWUP に伴い §11 を追記。PR #70 〜 #76 で A-5.1 SAVE 系 15/15 callsite の helper 経由化 / metadata 土台 / `showMsg` aggregation 表示まで完了。Group A〜E と `aggregateKey` の対応表を確定として記載し、後続候補（QUOTA-HANDLING / MASTER-V2-METADATA / AGGREGATION-TUNING / LEVEL-3-WARNING-BAR / INDICATOR-DETAIL）を §8 と並列で示す。詳細仕様は `docs/specs/20260513_shogi_save_ux_warn_aggregation_design.md` §15 を参照。 |
| 2026-05-14 | SAVE-UX-QUOTA-HANDLING-INVENTORY (Step 1, docs-only) に伴い §12 を追記。`localStorage.setItem` 2 callsite (`save()` / `saveBranchMaster()`) を棚卸し、`QuotaExceededError` 明示判定は 0 件と確認。Step 2 候補 callsite と暫定方針 (`kind: 'storage-quota'` / `aggregateKey: 'storage-quota:global'` / `severity: 'warn'`) を inventory docs (`docs/notes/20260514_shogi_save_ux_quota_inventory.md`) からサマリー。Step 2 着手前に再仕様確認が必要。 |
| 2026-05-14 | SAVE-UX-QUOTA-HANDLING-IMPL (Step 2) 実装に伴い §12.6 を追記。`isQuotaExceededError(e)` helper 追加、`save()` / `saveBranchMaster()` で quota 分岐実装、metadata `kind: 'storage-quota'` / `aggregateKey: 'storage-quota:global'` / `severity: 'warn'` / callsiteId `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster`。showMsg aggregation 対象外、indicator count +1、二重通知許容、resetAll 対象外継続。詳細は inventory docs §15。 |
| 2026-05-14 | SAVE-UX-KIND-ASSERT-AND-CALLSITE-ID-DOCS (PR #79 Nice to Have 回収) に伴い §13 を追記。`callsiteId` 命名規則を 2 系統（既存 `S<NN>` / `SAVE-<NNN>-<funcName>` + 新規 `KIND-NAMESPACE:<funcName>`）として整理。値の hyphen-case 規則 (`kind` / `aggregateKey`) は `callsiteId` には適用しない方針を明記（debug / trace 用識別子のため既存形式との互換性を優先）。 |
| 2026-05-14 | SAVE-UX-POST-QUOTA-FOLLOWUP-MAP (docs-only) に伴い §14 を追記。PR #78〜#80 後の到達点（quota inventory / 実装 / kind別 assert 厳密化）、save-verify / storage-quota の 2 系統表、未回収 Nice to Have 8 項目、次タスク候補 8 件、次にやるなら（推奨: `SAVE-UX-MASTER-V2-METADATA` / 足場固めなら `SAVE-UX-TEST-STRUCTURAL-MATCH`）を整理。実装変更なし、test 変更なし。 |
| 2026-05-14 | SAVE-UX-MASTER-V2-METADATA-IMPL (PR-A) に伴い §14.2 を **3 系統表**へ更新（master-verify 行追加）、§14.4 で `SAVE-UX-MASTER-V2-METADATA` 行を完了扱いにし PR-B として `SAVE-UX-MASTER-V2-AGGREGATION` 行を追加、§14.5 を更新。S03 / S05 / S22 に `kind:'master-verify'` / `aggregateKey:'master-verify:lastclass'` / `severity:'warn'` metadata を付与。callsiteId は既存 S03 / S05 / S22 維持。aggregation 対象化は PR-B 候補（今回 helper aggregation 条件は変更なし）。 |
| 2026-05-14 | SAVE-UX-TEST-STRUCTURAL-MATCH に伴い §14.3 と §14.4 の該当行を完了扱いに更新、§14.5 の司令塔おすすめを更新。`extractNotifySaveWarningBlocks(src)` helper（lightweight brace depth scanner）+ 9 fixture 単体テスト追加、SECTION 13 / 15 / 16 の static assert を block 単位の structural match に移行、200 文字 window 依存を解消。実装ロジック / metadata / aggregation / indicator / runtime tests / shogi_v4.html すべて未変更。 |
| 2026-05-14 | SAVE-UX-MASTER-V2-AGGREGATION (PR-B) に伴い §14.2 の master-verify 行を aggregation 対象に更新、§14.4 の PR-B 行を完了扱いに、§14.5 の司令塔おすすめを更新。`SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify', 'master-verify'])` の kind allow-list を導入し、aggregation 条件を `SAVE_WARN_AGGREGATABLE_KINDS.has(kind) && severity === 'warn' && aggregateKey` に変更。storage-quota は意図的に allow-list 外。aggregateKey / 短縮文言 / time window 3000ms / indicator count / console.warn 個別出力すべて不変。SECTION 17 を新規追加（静的 + ランタイム）。 |
| 2026-05-14 | SAVE-UX-POST-AGGREGATION-FOLLOWUP-MAP (docs-only) に伴い §15 を追加。PR #82 (`94fdcd0`) / PR #83 (`8df51a9`) / PR #84 (`e0100dc`) 連鎖完了時点の到達点、3 系統表（save-verify 15 / storage-quota 2 / master-verify 3 = 計 20）、allow-list 方針、`metadata → structural test → aggregation 対象化` の 3 段階標準手順候補、未回収 Nice to Have 13 項目、次タスク候補 7 件、司令塔おすすめ（次は `SAVE-UX-PARSE-HANDLING-INVENTORY`）を整理。実装変更なし、test 変更なし、shogi_v4.html 未変更。 |

---

## 11. PR #70 〜 #76 後の到達点（v1 追補）

v0 (2026-05-13) 作成時点で「次タスク = SAVE-UX-MIN-NOTIFY-002 (S22)」だったが、その後の実装で SAVE-UX 系は以下まで到達した。本セクションは現状コードと整合させるための追補（実装詳細は対応 PR / 設計書 §15 を参照）。

### 11.1 完了済 PR チェーン（SAVE-UX 関連）

| PR | 内容 |
|---|---|
| #65 | SAVE-UX-MIN-NOTIFY-002（S22 を Level 0 → Level 1） |
| #66 | `notifySaveWarning` helper 追加（S03 / S05 / S22 を helper 経由化） |
| #67 | SAVE-UX-STATUS-INDICATOR docs-only 設計 |
| #68 | SAVE-UX-STATUS-INDICATOR-IMPL（Level 2 indicator 実装） |
| #69 | SAVE-UX-WARN-AGGREGATION docs-only 設計 |
| #70 | Group A + B 6 件 helper 経由化（startTournament / generatePairing / setWinner / submitRound / addPlayer / removePlayer） |
| #73 | Group C + E 5 件 helper 経由化（updateField / bulkEditNames / bindChangePairingModalEvents / bindEditPastResult p1 / p2） |
| #74 | Group D 4 件 helper 経由化（handlePastParticipantClassAdd add / class change / handleSuggestClassAdd postSuccess / finalizeAddPastParticipants verify-fail warn） |
| #75 | `notifySaveWarning` に任意 metadata `{ kind, aggregateKey, severity }` を追加し、15 件に付与 |
| #76 | 同一 `aggregateKey` の保存警告が 3000ms 未満で連続発火 → 2 回目以降の `showMsg` を短縮文言に切替 |

### 11.2 A-5.1 SAVE 系 15/15 完了状況

| Group | aggregateKey | 件数 |
|---|---|---|
| A 大会進行 core | `save-verify:core` | 4 |
| B 登録欄 add/remove | `save-verify:entry` | 2 |
| C 登録欄 編集 | `save-verify:edit` | 2 |
| D 過去参加者経路 | `save-verify:past` | 4 |
| E 対局画面 編集 | `save-verify:pairing` | 3 |
| **計** | | **15** |

全件共通: `kind: 'save-verify'` / `severity: 'warn'`

### 11.3 まだ helper 経由化されていない / metadata 未付与の callsite

§7 / §8 の旧優先順序のうち、SAVE-UX 関連で **未** な領域:

| カテゴリ | 状態 |
|---|---|
| MASTER-V2-LASTCLASS S03 / S05 / S22 | helper 経由化済（PR #65 / #66）だが `save-verify` metadata 未付与（意図的に別 kind 体系想定） |
| MASTER-001 系 | helper 未経由のまま（応急処置 warn 文言で残存） |
| quota / parse / duplicate | helper 未経由のまま |
| import / merge / migration | helper 未経由のまま |
| S30 batch verify | 未着手 |
| ふりがな success-with-caveat 通知 | `showMsg` 直接呼出のまま（helper 経由ではないため `save-verify` aggregation に届かない） |

### 11.4 §8 後続 Task ID 優先順位 — v1 時点の更新候補

§8 の優先順位は v0 (2026-05-13) 作成時点のもの。PR #65 〜 #76 完了を踏まえた v1 時点の候補:

| # | タスク ID 候補 | 概要 |
|---|---|---|
| 1 | `SAVE-UX-QUOTA-HANDLING` | quota exceeded 系を別 kind 体系として整理する |
| 2 | `SAVE-UX-MASTER-V2-METADATA` | MASTER-V2-LASTCLASS S03 / S05 / S22 を別 kind 体系で metadata 化するか検討する |
| 3 | `SAVE-UX-AGGREGATION-TUNING` | 3000ms window や短縮文言を運用感覚で調整する |
| 4 | `SAVE-UX-LEVEL-3-WARNING-BAR` | `showMsg` / indicator より一段強い警告 UI を検討する |
| 5 | `SAVE-UX-INDICATOR-DETAIL` | indicator 詳細展開や Group 別表示を検討する |

詳細は `docs/specs/20260513_shogi_save_ux_warn_aggregation_design.md` §15.9 を参照。本セクションは候補列挙であり、実装方針は確定しすぎない（着手時に再判断）。

---

## 12. quota / storage exception 系 callsite の現状（v1.1 追補）

`SAVE-UX-QUOTA-HANDLING-INVENTORY` (Step 1) の棚卸し結果を以下にサマリーする。詳細は `docs/notes/20260514_shogi_save_ux_quota_inventory.md` を参照。

### 12.1 現時点の状況

- **`QuotaExceededError` 明示判定は 0 件**
- `localStorage.setItem` の callsite は **2 件**（`save()` line 404 / `saveBranchMaster()` line 613）
- いずれも汎用 try-catch で quota とその他のエラーを区別していない
- quota / storage failure は現時点で **helper 経由化 / metadata 付与なし**

### 12.2 現状 UX

| 経路 | catch 内 | user-facing |
|---|---|---|
| `save()` (大会データ) | `notifyError('保存に失敗しました。容量超過か、プライベートブラウズの可能性があります...')` | alert + showMsg |
| `saveBranchMaster()` (支部マスタ) | `console.warn(...)` のみ | **なし**（silent） |
| `resetAll()` removeItem | 完全 silent `catch(e){}` | なし |

### 12.3 Step 2 で扱う候補 callsite

| # | callsite ID 候補 | 対象 | 優先度 |
|---|---|---|---|
| 1 | `STORAGE-QUOTA-save` | `save()` shogi_v4.html:404 | 高 |
| 2 | `STORAGE-QUOTA-saveBranchMaster` | `saveBranchMaster()` shogi_v4.html:613 | 中 |

### 12.4 暫定方針（Step 2 着手前に再仕様確認）

- `kind: 'storage-quota'`
- `aggregateKey: 'storage-quota:global'`
- `severity: 'warn'`
- showMsg aggregation: **対象外**（初期は毎回個別 message）
- indicator count: 同じ count に含める方向

### 12.5 Step 2 (SAVE-UX-QUOTA-HANDLING-IMPL) 着手前の再仕様確認

inventory docs §13 に列挙した 8 項目を **着手前に再仕様確認** すること。棚卸し結果次第で kind / aggregateKey / severity / indicator 方針が見直される可能性がある。

参照: `docs/notes/20260514_shogi_save_ux_quota_inventory.md` §11 / §12 / §13

### 12.6 Step 2 実装完了状況 (SAVE-UX-QUOTA-HANDLING-IMPL)

| 項目 | 状態 |
|---|---|
| `isQuotaExceededError(e)` helper | 実装済（4 判定条件: QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED / code 22 / code 1014） |
| `save()` の quota 分岐 | 実装済（`alert` + `notifySaveWarning` + `return`、quota 以外は既存 `notifyError` 維持） |
| `saveBranchMaster()` の quota 分岐 | 実装済（`notifySaveWarning` + `return`、quota 以外は既存 `console.warn` 維持） |
| metadata 確定値 | `kind: 'storage-quota'` / `aggregateKey: 'storage-quota:global'` / `severity: 'warn'` |
| callsiteId | `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster` |
| showMsg aggregation | 対象外（kind が save-verify ではないため legacy path） |
| indicator count | 発生単位 +1 維持 |
| 二重通知（storage-quota + save-verify） | Step 2 では許容（抑制は後続候補） |
| `resetAll` | 対象外継続 |

詳細は inventory docs §15 を参照。

---

## 13. `callsiteId` 命名規則（v1.2 追補）

PR #79 で `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster` という新形式の `callsiteId` が採用された。これを踏まえて、`callsiteId` の命名規則を以下のように整理する。

### 13.1 系統の併用

`callsiteId` は 2 系統を **併用** する。識別は prefix で行う:

| # | 系統 | 形式 | 例 | 採用 PR |
|---|---|---|---|---|
| (a) | 既存（連番 / タスク由来） | `S<NN>` / `SAVE-<NNN>-<funcName>` / `SAVE-<NNNa>-<funcName>` | `S03` / `S05` / `S22` / `SAVE-001-removePlayer` / `SAVE-002-addPlayer` / `SAVE-003-startTournament` / `SAVE-003b-updateField` 等 | PR #65 / #66 / #70 / #73 / #74 |
| (b) | 新規（kind namespace） | `KIND-NAMESPACE:<funcName>` | `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster` | PR #79 |

### 13.2 形式仕様

#### (a) 既存形式

- `SAVE-` プレフィックス + 数字 (+ 任意の小サフィックス文字 `a` `b` 等) + `-` + camelCase 関数名
- もしくは 単一識別子 (`S03` / `S05` / `S22` のような MASTER-V2-LASTCLASS 由来のラベル)
- 区切り: `-`
- 既存タスク命名規則との互換性を優先

#### (b) 新規形式

- `KIND-NAMESPACE` 部: kind 系統を表す UPPERCASE + `-` 区切り
  - 例: `STORAGE-QUOTA` (kind: `storage-quota` に対応)
- `<funcName>` 部: 対象関数名 (lowerCamelCase)
- 系統と関数名の区切り: `:` (colon)
- 例: `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster`

### 13.3 kind / aggregateKey との関係

| 識別子 | 形式 | hyphen-case 適用 |
|---|---|---|
| `kind` の **値** | hyphen-case lowercase（例: `'storage-quota'`） | ✅ 適用 |
| `aggregateKey` の **値** | hyphen-case lowercase + `:` 区切り（例: `'storage-quota:global'`） | ✅ 適用 |
| `callsiteId` の **値** | 既存形式 (a) または新規形式 (b)。**hyphen-case 規則は適用されない** | ❌ debug / trace 用識別子として既存形式との互換性を優先 |

`callsiteId` は user-facing ではなく **debug / trace 用の識別子** であり、既存形式（連番 / タスク由来）との互換性を優先するため hyphen-case 規則は強制しない。

新規形式 (b) で `:` 区切りを採用する理由は、kind 系統と関数名を視覚的に分離するため。`aggregateKey` の `:` 区切り（kind:group）とは意味が異なる（同じ記号を使うが用途は別）。

### 13.4 後続 kind 追加時の方針

将来、新規 kind を追加する際は、以下を遵守:

1. **既存の `callsiteId` を無理に置換しない**: 一度付けた `callsiteId` は debug / trace の連続性のため変更しない（PR #70 / #73 / #74 / #79 で確定）
2. **prefix 衝突を避ける**: 新規 `KIND-NAMESPACE:` 採用時は、既存 `S<NN>` / `SAVE-<NNN>-` / `MASTER-` 等の prefix と衝突しない識別子を選ぶ
3. **形式は (a) / (b) のどちらでも可**: 設計時にチームで決める。値の hyphen-case 規則とは独立に判断

### 13.5 関連

- 値の hyphen-case 統一: `docs/specs/20260513_shogi_save_ux_warn_aggregation_design.md` §16
- PR #75 metadata 土台: 同 §15
- PR #79 storage-quota 実装: `docs/notes/20260514_shogi_save_ux_quota_inventory.md` §15

---

## 14. PR #78〜#80 後の quota 系到達点と後続候補（v1.3 追補）

PR #78（quota inventory）/ PR #79（storage-quota 実装）/ PR #80（kind別 assert 厳密化 + callsiteId 命名規則 docs 整理）完了時点の地図。

### 14.1 到達点

#### PR #78 (SAVE-UX-QUOTA-HANDLING-INVENTORY, docs-only)

- quota / storage exception / save failure 系 inventory 完了
- `QuotaExceededError` 明示判定 0 件を確認
- `localStorage.setItem` callsite 2 件を確認:
  - `save()` shogi_v4.html:404
  - `saveBranchMaster()` shogi_v4.html:613
- `resetAll` removeItem catch は silent だが quota とは意味論が異なるため Step 2 対象外候補として整理
- hyphen-case 命名規則を `docs/specs/20260513_shogi_save_ux_warn_aggregation_design.md` §16 へ追補
- storage-quota 暫定方針を整理（kind / aggregateKey / severity / showMsg aggregation 対象外 / indicator 同一 count）

#### PR #79 (SAVE-UX-QUOTA-HANDLING-IMPL)

- `isQuotaExceededError(e)` helper 追加（4 OR 判定）
- `save()` の quota failure を storage-quota として `notifySaveWarning` に接続
- `saveBranchMaster()` の quota failure を storage-quota として `notifySaveWarning` に接続
- `kind: 'storage-quota'` / `aggregateKey: 'storage-quota:global'` / `severity: 'warn'` 確定
- quota message: `保存容量の上限に達しました。データ整理が必要です。`
- storage-quota は **aggregation 対象外**（kind が `save-verify` ではないため legacy path）
- indicator count **対象**（発生単位 +1）
- 二重通知（storage-quota 同期 + save-verify post-hoc）は Step 2 で **許容**
- `resetAll` / `load` / save-verify 既存 15 callsite は **未変更**

#### PR #80 (SAVE-UX-KIND-ASSERT-AND-CALLSITE-ID-DOCS, test+docs)

- SECTION 13 を **save-verify 専用責務** として厳密化（`kind:save-verify + severity:warn` ペアが厳密 15 件）
- SECTION 15 を **storage-quota 専用責務** として補強（callsiteId / kind / aggregateKey / kind+severity ペアが各厳密件数）
- kind 別件数 assert によって save-verify / storage-quota の 2 系統を **test 上でも分離**
- `callsiteId` 命名規則を本書 §13 として整理（既存 `S<NN>` / `SAVE-<NNN>-<funcName>` + 新規 `KIND-NAMESPACE:<funcName>` の併用）
- 実装ロジック変更なし

### 14.2 現在の 3 系統

| 系統 | 状態 | kind | aggregateKey | 件数 | aggregation | indicator | 備考 |
|---|---|---|---|---|---|---|---|
| save-verify | 実装済 / test 厳密化済 / docs 反映済 | `save-verify` | `save-verify:core` / `:entry` / `:edit` / `:past` / `:pairing` | **15** | **対象** | **対象** | A-5.1 SAVE 系 15 callsite（PR #70 / #73 / #74 / #75 / #76） |
| storage-quota | 実装済 / test 厳密化済 / docs 反映済 | `storage-quota` | `storage-quota:global` | **2** | **対象外** | **対象** | `save()` / `saveBranchMaster()`（PR #79） |
| master-verify | 実装済 / test 厳密化済 / docs 反映済 | `master-verify` | `master-verify:lastclass` | **3** | **対象**（PR-B 完了）| **対象** | MASTER-V2-LASTCLASS S03 / S05 / S22（PR-A: SAVE-UX-MASTER-V2-METADATA-IMPL）。PR-B: SAVE-UX-MASTER-V2-AGGREGATION で `SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify', 'master-verify'])` の kind allow-list により aggregation 対象化。storage-quota は意図的に除外 |

### 14.3 未回収 Nice to Have

PR #79 / #80 の cowork review で挙がった Nice to Have のうち、現時点で未回収のもの:

| # | 項目 | 内容 | 推奨 Task | 優先度 |
|---|---|---|---|---|
| 1 | fields 型整理 | `notifySaveWarning` fields receiver が array 期待。将来 errorName / errorCode / storageKey 等の構造化 metadata を扱うなら schema 整理が必要 | `SAVE-UX-FIELDS-SCHEMA` | 中（SAVE-FUTURE-REPORT や構造化ログ前） |
| 2 | quota 連続発火時 alert UX | storage-quota は aggregation 対象外で alert も無条件のため、容量不足が続くと同じ alert が連続発火する可能性 | `SAVE-UX-AGGREGATION-TUNING` または `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` | 中（実運用でうるささが問題化したら） |
| 3 | consoleTag prefix ルール明文化 | `[STORAGE-QUOTA]` のような固定 prefix と後半の動的 error 情報の分離ルールを明文化するとログ検索 / error tracking に効く | `SAVE-UX-CONSOLETAG-PREFIX-DOCS` | 低〜中（ログ整理前） |
| 4 | `isQuotaExceededError` helper scope 記録 | helper が `shogi_v4.html` 内のどこに配置され、どの callsite から利用できるかを notes に記録 | `SAVE-UX-STORAGE-HELPER-SCOPE-DOCS` | 低（storage callsite が増える前） |
| 5 | ~~200 文字 window → structural match~~（完了） | ~~test pair count が 200 文字 window 依存~~ → PR `SAVE-UX-TEST-STRUCTURAL-MATCH` で `extractNotifySaveWarningBlocks(src)` helper を追加し、SECTION 13 / 15 / 16 を block 単位の structural match に移行。helper 単体テスト 9 fixture を追加。200 文字 window 依存は解消 | (完了) | (完了) |
| 6 | kind 別 assertion のテーブル化 | kind が増えると SECTION 13 / 15 / 16... と増える。期待値テーブルで一括検証すると拡張しやすい | `SAVE-UX-KIND-ASSERT-TABLE` | 中（3 系統以上になった時点） |
| 7 | `callsiteId` 命名規則の docs/specs 格上げ | 本書 §13 は notes。kind 体系が 3 つ以上安定したら specs へ格上げ検討 | `SAVE-UX-CALLSITE-ID-SPEC-PROMOTION` | 低（運用安定後） |
| 8 | save-verify aggregateKey 分布の test/docs 優先順位メモ | test と docs の数値が乖離した場合は実装 / test を正とし docs を追従更新する方針を明記 | `SAVE-UX-TEST-DOCS-SOURCE-OF-TRUTH` | 低（docs 整理 PR でまとめて） |

### 14.4 次タスク候補

| # | 候補 Task ID | 目的 | 着手条件 | 推奨度 | 備考 |
|---|---|---|---|---|---|
| 1 | `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` | storage-quota + save-verify の二重通知を抑制または優先順位制御するか検討 | 実運用 / レビューで二重通知がうるさいと判断された場合 | 中 | 現時点は「失敗を隠さない」原則により許容。すぐ実装しなくてよい |
| 2 | ~~`SAVE-UX-MASTER-V2-METADATA`~~ (完了, PR-A) | MASTER-V2-LASTCLASS S03 / S05 / S22 を `master-verify` 系として metadata 化 | (完了) | (完了) | PR-A: SAVE-UX-MASTER-V2-METADATA-IMPL で `kind:'master-verify'` / `aggregateKey:'master-verify:lastclass'` / `severity:'warn'` を付与。aggregation 対象化は後続 PR-B: `SAVE-UX-MASTER-V2-AGGREGATION` で扱う |
| 2b | ~~`SAVE-UX-MASTER-V2-AGGREGATION` (PR-B)~~ (完了) | master-verify を aggregation 対象にする | (完了) | (完了) | PR-B: `SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify', 'master-verify'])` の kind allow-list で実装。aggregation 条件を `SAVE_WARN_AGGREGATABLE_KINDS.has(kind) && severity === 'warn' && aggregateKey` に変更。storage-quota は意図的除外。aggregateKey / 短縮文言 / time window / indicator count / console.warn 個別出力すべて不変 |
| 3 | `SAVE-UX-PARSE-HANDLING` | `parse-failed` 系の UX / metadata / indicator 接続を検討 | parse failure の発生箇所 inventory 後 | 中 | いきなり実装せず inventory から開始 |
| 4 | `SAVE-UX-DUPLICATE-HANDLING` | `duplicate-name` / `duplicate-entry` 系の UX / metadata / indicator 接続を検討 | duplicate 系の既存 UX 棚卸し後 | 中 | 大会受付 UX に影響しやすいため inventory 優先 |
| 5 | `SAVE-UX-FIELDS-SCHEMA` | `notifySaveWarning` の fields schema を整理し、array / object / metadata 拡張の方針を決める | 構造化ログ / SAVE-FUTURE-REPORT / error tracking 検討前 | 中 | 今は急がない |
| 6 | `SAVE-UX-AGGREGATION-TUNING` | storage-quota 連続 alert / quota aggregation / session 内 1 回 alert など UX tuning を検討 | 実運用で alert 連発が問題化した場合 | 低〜中 | 現時点では触らない方が安全 |
| 7 | ~~`SAVE-UX-TEST-STRUCTURAL-MATCH`~~（完了） | ~~200 文字 window の pair count を `notifySaveWarning` block 単位の structural match に置き換える~~ | (完了) | (完了) | PR で `extractNotifySaveWarningBlocks(src)` helper + 9 fixture 追加。SECTION 13 / 15 / 16 を block 単位に移行 |
| 8 | `SAVE-UX-KIND-ASSERT-TABLE` | kind 別 expected count / aggregateKey 分布をテーブル化 | 3 系統以上になった時点 | 低〜中 | 今すぐは不要。SECTION 方式で十分 |

### 14.5 次にやるなら

#### 1. ~~すぐ実装に行くなら: `SAVE-UX-MASTER-V2-METADATA`~~（PR-A で完了）

PR-A: SAVE-UX-MASTER-V2-METADATA-IMPL で完了。S03 / S05 / S22 に master-verify metadata 付与済み。

#### 2. ~~先に足場を固めるなら: `SAVE-UX-TEST-STRUCTURAL-MATCH`~~（完了）

PR `SAVE-UX-TEST-STRUCTURAL-MATCH` で完了。`extractNotifySaveWarningBlocks(src)` helper + 9 fixture を追加し、SECTION 13 / 15 / 16 の static assert を block 単位に移行済み。200 文字 window 依存は解消。

#### 3. ~~master-verify を aggregation 対象にするなら: `SAVE-UX-MASTER-V2-AGGREGATION` (PR-B)~~ (完了)

PR-B で完了。`SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify', 'master-verify'])` の kind allow-list を導入し、aggregation 条件を allow-list 形式へ移行。master-verify が aggregation 対象に。

#### 4. 実運用フィードバックを待つなら: `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` / `SAVE-UX-AGGREGATION-TUNING`

**理由**: 二重通知や alert 連発は、実際にうるさいかどうかを見てから判断してよい。実運用フィードバックを得てから着手するのが安全。

#### 司令塔おすすめ

`SAVE-UX-MASTER-V2-AGGREGATION` (PR-B) 完了時点では、次は `SAVE-UX-DUAL-NOTIFY-SUPPRESSION`（実運用で二重通知のうるささを感じたら）/ `SAVE-UX-AGGREGATION-TUNING`（3 秒窓 / 短縮文言の調整）/ `SAVE-UX-PARSE-HANDLING` / `SAVE-UX-DUPLICATE-HANDLING`（次の kind 追加候補、inventory から）など。kind allow-list 方式により、新規 kind の aggregation 対象化は `SAVE_WARN_AGGREGATABLE_KINDS` に 1 要素追加するだけで判断可能。

→ PR #84 (aggregation 対象化) 完了に伴い、最新の follow-up map は **§15** を参照。

---

## 15. PR #82〜#84 後の aggregation follow-up map（v1.4 追補）

PR #82（master-verify metadata）/ PR #83（test structural match）/ PR #84（master-verify aggregation 対象化）の 3 PR 連鎖完了時点の地図。

### 15.1 到達点

#### PR #82 (SAVE-UX-MASTER-V2-METADATA-IMPL) — `94fdcd0`

- MASTER-V2-LASTCLASS S03 / S05 / S22 に `master-verify` metadata 付与
- `kind: 'master-verify'` / `aggregateKey: 'master-verify:lastclass'` / `severity: 'warn'`
- callsiteId は既存 S03 / S05 / S22 を維持
- PR-A として **aggregation 対象化は意図的に未実施**（後続 PR-B = PR #84 へ）

#### PR #83 (SAVE-UX-TEST-STRUCTURAL-MATCH) — `8df51a9`

- SAVE-UX test の 200 文字 window 依存を `notifySaveWarning({...})` block 単位の structural match に移行
- `extractNotifySaveWarningBlocks(src)` lightweight brace depth scanner helper を追加（AST parser / 外部依存なし）
- helper 単体テスト 9 fixture を追加
- SECTION 12.5 で 3 系統合計 20 件抽出の sanity check
- SECTION 13 / 15 / 16 の static assert を block 単位の structural match に移行
- 旧 200 文字 window assert（`window200` / `searchIdx`）を削除
- 禁止パターン assert は維持（structural helper の責務外、grep / includes ベース）
- runtime tests / shogi_v4.html / docs/specs すべて非干渉

#### PR #84 (SAVE-UX-MASTER-V2-AGGREGATION) — `e0100dc`

- `SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify', 'master-verify'])` を notifySaveWarning helper 直前 module scope に追加
- aggregation 条件を `kind === 'save-verify' && severity === 'warn' && aggregateKey` から `SAVE_WARN_AGGREGATABLE_KINDS.has(kind) && severity === 'warn' && aggregateKey` に変更
- master-verify を showMsg aggregation 対象化（1 回目元 message / 2 回目以降短縮文言）
- storage-quota は allow-list 外で対象外維持
- aggregateKey (`master-verify:lastclass`) / 短縮文言 / time window 3000ms / indicator count / console.warn 個別出力すべて不変
- SECTION 17 を新規追加（静的 + ランタイム検証 36 件）
- SECTION 14 / 16 の既存 assert を PR-B 仕様に更新

### 15.2 現在の 3 系統（PR #84 完了時点）

| 系統 | 状態 | kind | aggregateKey | 件数 | aggregation | indicator | structural assert | 備考 |
|---|---|---|---|---|---|---|---|---|
| save-verify | 完成 | `save-verify` | `:core` (4) / `:entry` (2) / `:edit` (2) / `:past` (4) / `:pairing` (3) | **15** | **対象** | **対象** | ✅ 完了 | A-5.1 SAVE 系 15 callsite（PR #70 / #73 / #74 / #75 / #76 で確立、PR #83 で structural assert 化） |
| storage-quota | 完成 | `storage-quota` | `:global` | **2** | **対象外** | **対象** | ✅ 完了 | `save()` / `saveBranchMaster()`（PR #79、callsiteId `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster`、PR #83 で structural assert 化） |
| master-verify | 完成 | `master-verify` | `:lastclass` | **3** | **対象** | **対象** | ✅ 完了 | MASTER-V2-LASTCLASS S03 / S05 / S22（PR #82 metadata / PR #83 structural / PR #84 aggregation 対象化） |
| **合計** | | | | **20** | | | | |

### 15.3 aggregation 対象 kind（allow-list 方式）

PR #84 で導入された定数:

```js
var SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify', 'master-verify']);
```

aggregation 条件（helper 内）:

```js
if (SAVE_WARN_AGGREGATABLE_KINDS.has(kind) && severity === 'warn' && aggregateKey) {
  // 短縮文言切替判定
}
```

| kind | allow-list | 理由 |
|---|---|---|
| `save-verify` | ✅ 対象 | PR #76 以来の対象。15 callsite が連続発火しがちなため集約必要 |
| `master-verify` | ✅ 対象 | PR #84 で対象化。S22 の 4 fields 同時失敗等で連続発火しうるため |
| `storage-quota` | ❌ 対象外 | quota は 1 回 1 回の確実な認知が必要（PR #79 設計） |
| `parse-failed` | ❌ 対象外 | 未導入 kind |
| `duplicate-name` | ❌ 対象外 | 未導入 kind |
| `storage-corrupted` | ❌ 対象外 | 未導入 kind |

#### 集約方針（不変）

- aggregation は **showMsg の短縮表示のみ** を行う（PR #76 設計）
- `console.warn` は **個別出力維持**（debug 詳細層）
- indicator count は **発生単位 +1 維持**（事実を残す）
- **失敗を隠さない原則** を全 PR で堅持
- 新規 kind を aggregation 対象にする際は、metadata 付与・structural test・aggregation 対象化判断を **3 段階に分ける**（次節参照）

### 15.4 metadata → structural test → aggregation 対象化 の標準手順候補

PR #82〜#84 の流れを、今後 `parse-failed` / `duplicate-name` / `storage-corrupted` 等を追加するときの **標準手順候補** として記録する:

| 段階 | タスク種別 | 代表 PR | 目的 | 注意 |
|---|---|---|---|---|
| 1 | **metadata 付与** | PR #82 (PR-A) | 対象 callsite に `kind` / `aggregateKey` / `severity` を付与。helper 経由化されていない callsite は最小差分で経由化 | aggregation 対象化は **やらない**。test は SECTION N で structural assert |
| 2 | **structural test 足場整備** | PR #83 | 200 文字 window 依存からの脱却。新 kind を追加すると window 依存だと false positive / false negative の幅が広がるため、kind が増える前に block 単位の structural match に移行 | shogi_v4.html / runtime tests 非干渉 |
| 3 | **aggregation 対象化判断** | PR #84 (PR-B) | `SAVE_WARN_AGGREGATABLE_KINDS` に 1 要素追加して allow-list 入りさせる。または「意図的に対象外」を選択（storage-quota の判断と同じ） | 必ず段階 1 を先に完了。runtime 検証で連続発火 / 非対象 kind 干渉 / namespace 独立性を確認 |
| 4 | **docs 反映** | （各 PR と同梱、または follow-up map） | status-map の 3 系統表更新 / 次タスク候補整理 | docs/specs 3 設計書には触らず、notes に集約 |

各段階を **別 PR** に分けることで:
- レビュー観点が混ざらない（metadata / test / runtime behavior 各々で集中レビュー可）
- ロールバック粒度が細かい
- 「対象化見送り」を後から選択肢として残せる

### 15.5 未回収 Nice to Have

#### aggregation / message / window 系

| # | 項目 | 推奨 Task | 優先度 |
|---|---|---|---|
| 1 | kind 別短縮 message | `SAVE-UX-AGGREGATION-TUNING` | 低〜中（実運用フィードバック待ち） |
| 2 | kind 別 time window | 同上 | 低 |
| 3 | 3000ms window 調整 | 同上 | 低（運用感覚で調整） |
| 4 | master-verify 専用短縮文言 | 同上 | 低 |
| 5 | storage-quota の対象外維持の将来再評価 | 同上 | 低 |

#### indicator 系

| # | 項目 | 推奨 Task | 優先度 |
|---|---|---|---|
| 6 | kind 別 indicator 内訳表示 | `SAVE-UX-INDICATOR-DETAIL` | 低（実運用フィードバック待ち） |
| 7 | 詳細展開 UI | 同上 | 低 |
| 8 | clear UI | 同上 | 低 |

#### fields / consoleTag 系

| # | 項目 | 推奨 Task | 優先度 |
|---|---|---|---|
| 9 | fields schema 整理（array / object / metadata 拡張）| `SAVE-UX-FIELDS-SCHEMA` | 中（SAVE-FUTURE-REPORT 前） |
| 10 | consoleTag prefix ルール docs 化 | `SAVE-UX-CONSOLETAG-DOC` | 低〜中 |
| 11 | message / consoleTag の動的連結対応 | 同上 | 低 |

#### dual notify 系

| # | 項目 | 推奨 Task | 優先度 |
|---|---|---|---|
| 12 | storage-quota + save-verify の二重通知抑制 | `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` | 中（alert / notifyError / notifySaveWarning の関係再設計が必要、実運用 or 別仕様確認を挟む）|

#### MASTER-001 系

| # | 項目 | 推奨 Task | 優先度 |
|---|---|---|---|
| 13 | MASTER-001 系 callsite helper 経由化 | （個別判断）| 低（3 系統完成後の後続候補） |

### 15.6 次タスク候補

PR #82〜#84 連鎖完了時点での次タスク候補:

| # | 候補 Task ID | 目的 | 着手条件 | 推奨度 | 備考 |
|---|---|---|---|---|---|
| 1 | `SAVE-UX-PARSE-HANDLING-INVENTORY` | parse-failed 系の棚卸し（JSON parse / localStorage corruption / load 失敗）| 第 4 系統候補として | **高** | いきなり実装ではなく inventory から。storage-quota と近いが aggregation 対象化判断は別 |
| 2 | `SAVE-UX-DUPLICATE-HANDLING-INVENTORY` | duplicate-name 系の棚卸し（同姓同名 / 重複登録 UX）| 受付・参加者登録 UX に近い | 中〜高 | 大会運営の実運用上発生しうる。仕様判断やや重い |
| 3 | `SAVE-UX-STORAGE-CORRUPTED-HANDLING-INVENTORY` | storage-corrupted 系の棚卸し（保存データ破損・復旧導線）| データ保全 UX として | 中 | storage-quota と並ぶ第 4 系統候補 |
| 4 | `SAVE-UX-AGGREGATION-TUNING` | 3000ms window / 短縮文言の調整 | 実運用フィードバック後 | 低〜中 | save-verify + master-verify 両系統の体感を見て判断 |
| 5 | `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` | quota + verify 二重通知抑制 | UX 上重要だが仕様判断重め | 中 | alert / notifyError / notifySaveWarning の関係を再設計する可能性あり |
| 6 | `SAVE-UX-INDICATOR-DETAIL` | indicator 詳細展開 / kind 別内訳 | 3 系統完成後の表示拡張 | 低〜中 | 実運用フィードバック待ち |
| 7 | `SAVE-UX-FIELDS-SCHEMA` | fields schema 整理 | 構造化ログ前 | 中 | SAVE-FUTURE-REPORT 前提の整備 |

### 15.7 次にやるなら

#### 第一候補: `SAVE-UX-PARSE-HANDLING-INVENTORY`

**理由**:
- 3 系統の中核が完成したため、次は第 4 系統候補を inventory するのが自然な流れ
- いきなり実装ではなく棚卸しから入るのが安全（PR #78 → #79 の Step 1 / Step 2 と同じパターン）
- parse / storage corrupted / load failure はデータ保全 UX として重要
- storage-quota と近いが、aggregation 対象にするかどうかは別判断（PR #84 で確立した allow-list 方式で柔軟に判断可）
- 失敗種別ごとに UX を分ける設計につながる

#### 第二候補: `SAVE-UX-DUPLICATE-HANDLING-INVENTORY`

**理由**:
- 将棋大会運営では同姓同名・重複登録が実運用上起きうる
- 受付 UX に近く、現場価値が高い
- ただし duplicate は仕様判断が少し重いので、parse inventory の次でもよい

#### 第三候補: `SAVE-UX-AGGREGATION-TUNING`

**理由**:
- save-verify / master-verify が aggregation 対象になったので、文言・window の調整余地はある
- ただし現時点では実運用フィードバック待ちでよい
- すぐに着手する必要は低い

#### 第四候補: `SAVE-UX-DUAL-NOTIFY-SUPPRESSION`

**理由**:
- UX 上は重要だが、`alert` / `notifyError` / `notifySaveWarning` の関係に触る
- 仕様判断が重め
- もう少し後でもよい

#### 司令塔暫定おすすめ

次は **`SAVE-UX-PARSE-HANDLING-INVENTORY`** を docs-only inventory として着手するのが自然。PR #78 → #79 の Step 1 / Step 2 と同じ「inventory → 実装」パターンに沿う。実運用フィードバック次第で `SAVE-UX-AGGREGATION-TUNING` や `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` も候補に上がる。

---

## 16. SAVE-UX-PARSE-HANDLING-INVENTORY（v1.5 追補 / 第 4 系統候補棚卸し）

- 種別: **docs-only inventory**（実装はしない / 仕様は確定しない）
- 対象 main HEAD: `0e174d8`（PR #85 docs follow-up map）
- Task ID: `SAVE-UX-PARSE-HANDLING-INVENTORY`
- 目的: parse-failed / storage-corrupted / load-failed / import-failed 周辺を第 4 系統候補として棚卸しし、次 impl PR の判断材料にする
- 関連: §4.4（localStorage / quota / parse / 破損系の callsite マップ初版） / §15.7 第一候補

### 16.1 目的

- §15 で確立した「3 系統（save-verify / storage-quota / master-verify）」の延長として、`JSON.parse` / `localStorage.getItem` / load / import 系の失敗 UX を棚卸しする
- 既存の sync-on-save 経由 (`syncBranchMasterOnSave` の `_loaded_with_corruption` ブランチ) と、import / restore 経由 (`alert` / `setStatus`) のばらつきを整理する
- 「第 4 系統として 1 つの kind にまとめるか / 複数 kind に分けるか」の判断材料を出す
- aggregation 対象にすべきかの暫定判断を整理する（**初期は対象外寄り**）
- 次 impl PR の最小単位を整理する

注意:

- 本セクションは断定しない。kind / aggregateKey / severity / message はすべて **候補** として記載する
- 実装は本タスクでは行わない（status-map と HANDOFF.md の追補のみ）

### 16.2 調査範囲

- 対象ファイル: `shogi_v4.html`（read-only / コードは変更しない）
- grep キーワード:
  - `JSON.parse` → 14 ヒット
  - `localStorage.getItem` → ~15 ヒット
  - `load` / `restore` / `import` / `applyLoadedJson` / `parseTournamentTextInput` / `safeParseImportText`
  - `_loaded_with_corruption`（既存破損フラグ）
- 対象範囲外: `JSON.parse(JSON.stringify(...))`（deep clone 用途、失敗想定なし）

### 16.3 callsite inventory

本 inventory の対象 callsite を **5 系統（A〜E）** に分類する。§16.3.6 は系統ではなく、inventory 対象外として参考列挙する **範囲外メモ** であり、系統数にはカウントしない（PR 本文 / HANDOFF.md ポインタ / §16.11 の見立て表も A〜E の 5 系統で揃える）。

#### 16.3.1 系統 A: state restore（大会データ読込）

| 候補 ID | 関数 / 行 | 対象データ | 失敗種別 | 現在挙動 | user-facing | データ保全重要度 | 大会中 UX 影響 | SAVE-UX 接続候補 | 備考 |
|---|---|---|---|---|---|---|---|---|---|
| PARSE-LOAD-001 | `load()` ([443](../../shogi_v4.html:443)) localStorage 取得 | shogi_v4 / レガシキー | localStorage get failure | catch → continue（次キーへ） | **silent** | 中 | 起動時のみ、起動失敗には至らない | **候補（要検討）** | 全キー失敗時は `state=normalizeState(state)` で初期 state。silent ロールアウト。 |
| PARSE-LOAD-002 | `load()` ([450](../../shogi_v4.html:450)) JSON.parse | shogi_v4 / レガシキー | JSON.parse failure（corrupted） | catch → continue（次キーへ） | **silent** | **高** | 直前の大会データ消失リスク（fallback で旧キー or 初期 state） | **候補（最重要）** | 大会中に reload して silent に初期化される最悪ケースに該当。Level 0。 |
| PARSE-LOAD-003 | `load()` ([457](../../shogi_v4.html:457)) 全キー失敗 | — | 全キー corrupted or empty | `state=normalizeState(state)` | **silent** | **高** | 大会データ全消失 UX | **候補** | PARSE-LOAD-001 / 002 の合流点。「保存データが見つかりませんでした」級の検知点。 |

#### 16.3.2 系統 B: branch master load（支部マスタ読込）

| 候補 ID | 関数 / 行 | 対象データ | 失敗種別 | 現在挙動 | user-facing | データ保全重要度 | 大会中 UX 影響 | SAVE-UX 接続候補 | 備考 |
|---|---|---|---|---|---|---|---|---|---|
| PARSE-MASTER-001 | `loadBranchMaster()` ([628](../../shogi_v4.html:628)) localStorage 取得 | shogi_branch_master | localStorage get failure | catch → `createEmptyBranchMaster()` 返却 | **silent** | 中 | マスタ読込のみ失敗、save 経路で sync スキップ | **候補（要検討）** | 例外系のみ。silent。 |
| PARSE-MASTER-002 | `loadBranchMaster()` ([632](../../shogi_v4.html:632)) JSON.parse | shogi_branch_master | JSON.parse failure（corrupted） | console.warn + 空マスタ + `_loaded_with_corruption=true` | console.warn のみ（後段の `syncBranchMasterOnSave` で `showMsg('warn')`） | **高** | マスタ破損による sync スキップ、過去参加者欠落 | **候補（既存 CORRUPT-001 / 002 と接続）** | §4.4 CORRUPT-001 と同じ callsite。silent + 既存 alert 系ではない。 |
| PARSE-MASTER-003 | `syncBranchMasterOnSave()` ([5289](../../shogi_v4.html:5289)) corruption スキップ | shogi_branch_master | `_loaded_with_corruption` 検知 | console.warn + `showMsg('warn')` | **○ showMsg(warn)**（既存 Level 1 相当） | 高 | sync スキップを user に明示 | **候補（既存 showMsg を `notifySaveWarning` 経由化）** | §4.4 CORRUPT-002 と同じ。`notifySaveWarning` 未接続。 |
| PARSE-MASTER-004 | `syncBranchMasterOnSave()` ([5304](../../shogi_v4.html:5304)) 全体 catch | sync 全体 | 想定外例外 | console.warn のみ | **silent** | 中 | sync 失敗が見えない | 候補 | 大会運営は継続するが、master sync が silent に死ぬ。 |

#### 16.3.3 系統 C: state restore verify（save-verify 系の helper 内部）

§4.1 / 15.2 で既に save-verify 系列として整理済の helper だが、内部の JSON.parse / catch を再掲する（接続済 / 重複扱い）。

| 候補 ID | 関数 / 行 | 失敗種別 | 現在挙動 | 備考 |
|---|---|---|---|---|
| （既存 save-verify 系統）| `readPersistedState()` ([3881](../../shogi_v4.html:3881)) / `verifyStatePersisted()` ([3924](../../shogi_v4.html:3924)) / `verifyPlayerAbsent()` ([3970](../../shogi_v4.html:3970)) / `verifyPlayerPersistedById()` ([3994](../../shogi_v4.html:3994)) / `verifyPlayerFieldPersisted()` ([4019](../../shogi_v4.html:4019)) | JSON.parse failure / schema mismatch | catch → console.warn + return `null` / `false`、callsite 側で `notifySaveWarning({kind:'save-verify',...})` 経由 | helper 内部の parse 失敗は呼び出し側 callsite の save-verify warn に **合流済**。本 inventory の新規対象ではない。 |
| （既存 master-verify 系統）| `verifyMasterPersisted()` ([3947](../../shogi_v4.html:3947)) / `verifyMasterFieldPersisted()` ([4058](../../shogi_v4.html:4058)) | JSON.parse failure / schema mismatch | catch → console.warn or silent + return `false`、callsite 側で `notifySaveWarning({kind:'master-verify',...})` 経由 | 同上。master-verify 系統に合流済。 |

#### 16.3.4 系統 D: 大会データ import / restore（ファイル / 貼り付け）

| 候補 ID | 関数 / 行 | 対象データ | 失敗種別 | 現在挙動 | user-facing | データ保全重要度 | 大会中 UX 影響 | SAVE-UX 接続候補 | 備考 |
|---|---|---|---|---|---|---|---|---|---|
| PARSE-IMPORT-001 | `applyLoadedJson()` ([5351](../../shogi_v4.html:5351)) JSON.parse | 外部 JSON（クリップボード / ファイル） | JSON.parse failure（throw） | 内部 catch なし → 呼出側 throw | — | 高 | upstream（loadData / loadFromPaste）に依存 | 候補（upstream に集約） | helper として throws する設計。 |
| PARSE-IMPORT-002 | `loadData()` ([5368](../../shogi_v4.html:5368)) FileReader.onload catch | ファイル import | applyLoadedJson throw | **`alert('読み込みに失敗しました。正しいファイルか確認してください')`** | **○ alert** | 高 | 取り込み失敗を明示 | 候補（alert → notifySaveWarning 移行は重い） | 既存 alert UX。SAVE-UX-DESIGN §2.3 と緊張関係（modal / alert を保存通知に使わない原則）。 |
| PARSE-IMPORT-003 | `loadFromPaste()` ([5386](../../shogi_v4.html:5386)) catch | 貼り付け import | applyLoadedJson throw | **`alert('読み込みに失敗しました。正しい大会データか確認してください')`** | **○ alert** | 高 | 取り込み失敗を明示 | 候補（同上） | 同上。 |

#### 16.3.5 系統 E: master import（Phase 2 / overwrite / merge）

| 候補 ID | 関数 / 行 | 対象データ | 失敗種別 | 現在挙動 | user-facing | データ保全重要度 | 大会中 UX 影響 | SAVE-UX 接続候補 | 備考 |
|---|---|---|---|---|---|---|---|---|---|
| PARSE-IMPORT-MASTER-001 | `safeParseImportText()` ([869](../../shogi_v4.html:869)) | import テキスト | JSON.parse failure | catch → return `null`（silent） | — | 中 | upstream（processMasterImportText / Phase 2 import）に依存 | 候補（upstream に集約） | parse helper。silent。 |
| PARSE-IMPORT-MASTER-002 | `processMasterImportText()` ([2473](../../shogi_v4.html:2473)) null check | overwrite / merge import | `safeParseImportText` null | **`setStatus('JSON の解析に失敗しました（フォーマットが不正です）')`** | **○ setStatus（モーダル内テキスト表示）** | 中 | モーダル内テキストで明示 | 候補（既存 setStatus UX 維持） | alert / showMsg ではなくモーダル inline status。 |
| PARSE-IMPORT-MASTER-003 | Phase 2 import file load ([2356](../../shogi_v4.html:2356)) | Phase 2 import JSON | `safeParseImportText` null | **`setStatus('JSON の解析に失敗しました(フォーマットが不正です)')`** | **○ setStatus** | 中 | モーダル内テキスト | 候補（同上） | 同上。 |
| PARSE-IMPORT-MASTER-004 | runMasterImport / Phase 2 import の `reader.onerror` ([2399](../../shogi_v4.html:2399) / [2464](../../shogi_v4.html:2464)) | ファイル読込 | FileReader error | **`setStatus('ファイルの読み込みに失敗しました')`** | **○ setStatus** | 中 | モーダル内テキスト | 候補 | parse 前段の I/O 失敗。 |
| PARSE-IMPORT-TOURNAMENT-001 | `parseTournamentTextInput()` ([2884](../../shogi_v4.html:2884)) per-block JSON.parse | 過去大会 import テキスト | block 毎の JSON.parse failure | errors 配列で返却（throw しない） | — | 低 | upstream（migration / phase2 mass import）に依存 | 候補（upstream に集約） | 「一部成功」を扱える設計。第 4 系統候補としては優先度低。 |

#### 16.3.6 範囲外メモ（参考）

以下は inventory **対象外** の callsite。系統 A〜E にはカウントしないが、grep 整理時に当たるため参考列挙する。

| 候補 ID | 関数 / 行 | 備考 |
|---|---|---|
| — | `JSON.parse(JSON.stringify(...))` ([4771](../../shogi_v4.html:4771)) | deep clone 用途。失敗想定なし。inventory 対象外。 |
| — | `localStorage.removeItem` 周辺 ([5639](../../shogi_v4.html:5639) 等) | reset 操作。本 inventory 対象外。 |

### 16.4 kind 候補

PR #84 で確立した「kind allow-list 方式」に沿って、第 4 系統候補の kind を整理する。

#### 16.4.1 候補 kind 一覧

| 候補 kind | 意味 | 主な callsite | 重要度 | 備考 |
|---|---|---|---|---|
| `parse-failed` | JSON.parse 失敗全般（localStorage / import / restore を広く含む） | PARSE-LOAD-002 / PARSE-MASTER-002 / PARSE-IMPORT-* | — | 包括的だが、import 系と save 系の混在で UX 文脈が混ざる |
| `storage-corrupted` | 保存済データの破損（localStorage 経由のみ） | PARSE-LOAD-002 / PARSE-MASTER-002 / PARSE-MASTER-003 | **高** | save 系列の延長。data 保全 UX として独立価値がある |
| `load-failed` | localStorage 読込全体の失敗（getItem 例外含む） | PARSE-LOAD-001 / PARSE-LOAD-003 / PARSE-MASTER-001 / PARSE-MASTER-004 | 中 | parse 以外の I/O 失敗も含むかどうかが論点 |
| `import-failed` | import / restore parse failure（外部データの取込） | PARSE-IMPORT-001〜003 / PARSE-IMPORT-MASTER-001〜004 / PARSE-IMPORT-TOURNAMENT-001 | 中 | 既存 alert / setStatus が user-facing 済 |

#### 16.4.2 1 つにまとめるか / 分けるか

**論点**:

- `parse-failed` 1 つにまとめると **UX 文脈が混ざる**: 大会中の自動 reload で起きる corruption と、user 操作で起きる import failure は意味が違う
- import 系は既に `alert` / `setStatus` で user-facing UX が確立しており、新 kind 接続のコストが高い
- save / restore 系は silent が多く、第 4 系統として最も価値が高い

**暫定判断**:

- **`storage-corrupted` を第 4 系統の中核 kind とするのが安全**
  - 対象: PARSE-LOAD-002 / PARSE-LOAD-003 / PARSE-MASTER-002 / PARSE-MASTER-003
  - 「保存済データが壊れている」という data 保全 UX に特化
  - parse 以外の I/O 失敗（PARSE-LOAD-001 / PARSE-MASTER-001）も含めるかは要検討（重要度: 中）
- **`import-failed` は別系統 / 別 PR**
  - 既存 alert / setStatus を温存する判断もあり得る
  - 接続するなら `SAVE-UX-IMPORT-FAILED-HANDLING-INVENTORY` として別 inventory に分けるのが自然
- **`parse-failed` 単独 kind は採用しない**（広すぎる）
- **`load-failed` 単独 kind も初期は採用しない**（`storage-corrupted` に含めるか後続検討）

#### 16.4.3 最小実装対象としてどれが安全か

- **PARSE-MASTER-003**（`syncBranchMasterOnSave` の `_loaded_with_corruption` ブランチ）が **最小・最安全**
  - 既に `showMsg('warn')` で user-facing になっている（Level 1 相当）
  - `notifySaveWarning({kind:'storage-corrupted', ...})` への置換だけで Level 1 維持・metadata 付与・indicator count 反映が成立
  - PR #82 (MASTER-V2-METADATA-IMPL) と同じ「既存 showMsg → notifySaveWarning 経由化」パターン
- PARSE-LOAD-002 / 003 は silent → user-facing への質的変化を伴うため、UX 仕様判断が重い

### 16.5 aggregateKey 候補

§13（callsiteId 命名規則）に従い、kind:データ種別 形式を候補に挙げる。

| 候補 aggregateKey | 用途 | 備考 |
|---|---|---|
| `storage-corrupted:state` | 大会データ（shogi_v4 / レガシキー）破損 | PARSE-LOAD-002 / PARSE-LOAD-003 |
| `storage-corrupted:branch-master` | 支部マスタ破損 | PARSE-MASTER-002 / PARSE-MASTER-003 |
| `storage-corrupted:global` | 系統横断（単一 aggregateKey に統合） | storage-quota:global と同じ粒度。aggregation 対象外なら細分の価値は低い |
| `load-failed:state` | localStorage I/O 失敗（大会データ） | PARSE-LOAD-001 |
| `load-failed:branch-master` | localStorage I/O 失敗（支部マスタ） | PARSE-MASTER-001 |
| `import-failed:state` | 大会データ import parse failure | PARSE-IMPORT-001〜003 |
| `import-failed:branch-master` | 支部マスタ import parse failure | PARSE-IMPORT-MASTER-001〜004 |
| `import-failed:tournament-text` | 過去大会テキスト import | PARSE-IMPORT-TOURNAMENT-001 |

**論点**:

- aggregation 対象外であれば aggregateKey はメタ情報用途に近づく（indicator count / consoleTag タグ付け / 将来 aggregation 切替時の準備）
- storage-quota は `storage-quota:global` の 1 つで統一されており、parse / corrupted 系も **初期は global 1 本 or データ種別 2 本（state / branch-master）の粗い粒度** が運用しやすい
- 関数単位は粒度が細かすぎる（保守コスト > 価値）

**暫定**:

- 初期実装に進む場合は `storage-corrupted:branch-master`（PARSE-MASTER-003）+ 将来 `storage-corrupted:state`（PARSE-LOAD-002）の 2 本構成が自然

**aggregateKey 畳み込みの注記**:

- `storage-corrupted:state` は PARSE-LOAD-002（per-key の JSON.parse 失敗）と PARSE-LOAD-003（全キー失敗 = 合流点 / 初期 state へフォールバック）を同一 key に畳む候補
- 初期実装では aggregation 対象外（§16.7）のため、この畳み込みは showMsg 短縮表示には**影響しない**（indicator count / consoleTag のメタ情報用途のみ）
- 一方、将来 `SAVE_WARN_AGGREGATABLE_KINDS` に `storage-corrupted` を追加する場合、PARSE-LOAD-002（次キーへフォールバック余地あり）と PARSE-LOAD-003（全キー失敗 = 致命的）は recovery guidance の重みが異なるため、同一 message に縮約してよいかを再確認する必要がある
- 必要に応じて `storage-corrupted:state-parse`（PARSE-LOAD-002 用 / 軽度）と `storage-corrupted:state-allfail`（PARSE-LOAD-003 用 / 致命）の key 分割を検討する（同様に `storage-corrupted:branch-master` も PARSE-MASTER-002 と PARSE-MASTER-003 の粒度分割を後続再検討対象とする）
- 本注記は将来 aggregation 切替時の論点メモであり、初期 impl PR では対応不要。§16.10 の論点リストにも掲載する

### 16.6 severity 候補

| severity | 適合候補 | 備考 |
|---|---|---|
| `warn` | PARSE-MASTER-003（既存 showMsg('warn')）/ PARSE-LOAD-003（silent → warn 化）| 既存 `notifySaveWarning` の前提（severity: 'warn'）に整合 |
| `error` | PARSE-MASTER-002（マスタ完全破損）/ PARSE-LOAD-003（全キー破損 = 大会データ全消失） | `notifySaveWarning` は warn 前提のため、`error` を導入するなら別 helper / 別 UX が必要 |

**論点**:

- storage-quota は構造的に save 失敗で重要度が高いが、SAVE-UX-DESIGN §2.3 の「modal / alert を通知に使わない」原則を踏まえ **warn に揃えた経緯**（§5.3）
- parse / storage-corrupted も同じ原則を適用すれば warn でよい
- 「error severity の導入」は本タスクのスコープではない（要別タスク: `SAVE-UX-ERROR-SEVERITY`）

**暫定**:

- **第 4 系統は warn に寄せる**（既存 3 系統と整合）
- 「重大なデータ破損は error にすべき」議論は別タスクへ持ち越し

### 16.7 aggregation 対象判断

PR #84 時点の aggregation 対象 (`SAVE_WARN_AGGREGATABLE_KINDS`):

- `save-verify`（対象）
- `master-verify`（対象）
- `storage-quota`（対象**外**）

#### 16.7.1 第 4 系統候補の暫定判断

| 候補 kind | 初期 aggregation | 理由 |
|---|---|---|
| `storage-corrupted` | **対象外（推奨）** | データ破損は重要度が高く、短縮表示で隠すより個別 message / recovery guidance が必要。storage-quota と同じ判断軸。 |
| `parse-failed`（採用しない方針） | — | — |
| `load-failed` | 対象外（採用するなら） | I/O 失敗は単発で十分。 |
| `import-failed` | 対象外（採用するなら） | user 操作起点で連発しない。alert / setStatus 既存 UX で十分。 |

#### 16.7.2 司令塔暫定案の妥当性

> 「parse / corrupted 系は、初期実装では aggregation 対象外が安全。理由: データ破損や読み込み失敗は重要度が高く、短縮表示で隠すより、個別 message / recovery guidance が必要。storage-quota と同様に、まずは対象外が自然。ただし、同一エラーが連続発火して UX がうるさい場合は後続で aggregation tuning を検討」

**この暫定案は妥当である**。根拠:

1. storage-quota の判断軸（§14.3 / §15.3 の集約方針）と整合 — 「count / console.warn は発火単位、user-facing message は個別表示」
2. parse / corrupted は user 認知が重要な data 保全イベント（隠すべきでない）
3. 連発する典型シナリオが想定しにくい（load は起動時 1 回 / sync は saveData 時のみ / import は user 操作起点）
4. 後続で `SAVE_WARN_AGGREGATABLE_KINDS` allow-list に追加するだけで切替可能なため、初期判断を保守的に倒すコストが低い

### 16.8 user-facing message 候補

実装時の確定文言ではなく、設計検討用の候補として記載する（**本タスクで確定しない**）。

| 候補 callsite | 候補文言 | 既存 UX との関係 |
|---|---|---|
| PARSE-MASTER-003（既存）| 「支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）」 | 既存 showMsg(warn) を流用 |
| PARSE-LOAD-002 / 003 | 「保存データの読み込みに失敗しました。必要に応じてバックアップを確認してください。」 | 新規（silent → warn 化）。「過去大会データ取込で復元できる」導線示唆を検討 |
| PARSE-MASTER-002 | 「支部マスタの形式が壊れている可能性があります。マスタ取込で復旧を検討してください。」 | 既存 console.warn + `_loaded_with_corruption` の sync-on-save 経由表示の前段化候補 |
| PARSE-IMPORT-001〜003（既存 alert） | 「読み込みに失敗しました。正しいファイルか確認してください」 | 既存 alert 文言を維持 / もしくは `notifySaveWarning` 移行時に showMsg 化 |
| PARSE-IMPORT-MASTER-002〜004（既存 setStatus） | 「JSON の解析に失敗しました（フォーマットが不正です）」 | 既存モーダル inline status を維持 |

**論点**:

- 大会中に出してよい文言か → 「データ整合のため確認してください」は **OK**、「データ消失」は user を不安にさせるため避ける
- 復旧導線（マスタ取込 / バックアップ）への示唆は **必要**
- alert / showMsg / notifyError / notifySaveWarning の選択:
  - 既存 alert 系（PARSE-IMPORT-002 / 003）は user 操作起点で「停止して確認させる」UX、当面温存が無難
  - silent 系（PARSE-LOAD-* / PARSE-MASTER-001 / 002）は `notifySaveWarning` 経由で showMsg(warn) + indicator + console.warn に揃える方向
  - notifyError は既存 quota 以外の汎用例外用に維持

### 16.9 実装候補の分割案

| 案 | 範囲 | 重さ | 備考 |
|---|---|---|---|
| **A. SAVE-UX-PARSE-HANDLING-IMPL（最小）** | PARSE-MASTER-003 のみ（既存 showMsg → `notifySaveWarning({kind:'storage-corrupted', aggregateKey:'storage-corrupted:branch-master'})` 経由化）+ test 1 件 | 小（PR #82 と同等規模） | **最有力**。既存 Level 1 を helper 経由化するだけで metadata / indicator / structural test が揃う |
| B. SAVE-UX-STORAGE-CORRUPTED-HANDLING-IMPL | PARSE-MASTER-003 + PARSE-LOAD-002 / 003 を同 PR で接続 | 中 | silent → warn 化を含み、UX 仕様判断が増える |
| C. SAVE-UX-IMPORT-FAILED-HANDLING-INVENTORY | 系統 D / E を別 inventory として整理 | 小（docs-only） | 既存 alert / setStatus UX を温存するか接続するかの判断材料を作る |
| D. SAVE-UX-LOAD-FAILED-HANDLING-INVENTORY | PARSE-LOAD-001 / PARSE-MASTER-001 / PARSE-MASTER-004 を別 inventory として深掘り | 小（docs-only） | I/O 失敗（parse 以外）を分けたい場合 |

#### 16.9.1 司令塔暫定おすすめ

- 次 impl PR は **案 A**（`SAVE-UX-PARSE-HANDLING-IMPL` = 最小 1 callsite）
  - 理由: PR #82 → #83 → #84 の確立された「metadata → structural test → aggregation 対象化」標準手順（§15.4）を、第 4 系統でも踏襲できる
  - 既存 Level 1 callsite を helper 経由化するだけなので UX 変化が最小、Codex / cowork review コストも低い
- 案 B（silent → warn 化を伴う複数 callsite）は **案 A 完了後** の継続 PR が妥当
- 案 C / D は impl の前に必要か、後で必要かを案 A 完了時点で再判断

### 16.10 実装前に仕様確認を挟むべき論点

実装 PR 着手前に再仕様確認したい論点:

1. **kind 名の確定**: `storage-corrupted` vs `parse-failed` vs `load-failed`（暫定 `storage-corrupted`）
2. **PARSE-LOAD-002 を silent → warn にすべきか**: 大会中 reload で起きた場合の UX 影響
3. **PARSE-MASTER-002 と PARSE-MASTER-003 の関係**: 前段（loadBranchMaster）で showMsg を出すか、後段（sync-on-save）に集約するか
4. **import 系 alert を維持するか / showMsg 化するか**: SAVE-UX-DESIGN §2.3 原則との緊張関係
5. **`error` severity の必要性**: 重大なデータ破損を warn で表現してよいか
6. **aggregateKey 粒度**: `:global` 1 本 / `:state`+`:branch-master` 2 本 / 関数単位
7. **dual notify 抑制**: notifyError / alert / showMsg / notifySaveWarning の重複発火が parse 系で起きうるか（特に `loadData` で alert + 内部 showMsg が並ぶ可能性）
8. **aggregateKey 畳み込みの再判定（将来 aggregation 切替時）**: `storage-corrupted:state` に PARSE-LOAD-002（per-key parse 失敗・フォールバック余地あり）と PARSE-LOAD-003（全キー失敗 = 致命的）を同居させる構造は、初期 aggregation 対象外では問題ないが、将来 `SAVE_WARN_AGGREGATABLE_KINDS` に追加した場合に同一 recovery guidance で扱ってよいかを再確認する。必要なら `storage-corrupted:state-parse` / `storage-corrupted:state-allfail` などへ key 分割（branch-master 側も PARSE-MASTER-002 / PARSE-MASTER-003 の分割を要検討）。詳細は §16.5「aggregateKey 畳み込みの注記」

### 16.11 §15 の 3 系統 → 第 4 系統候補（追加後の見立て）

§15.2 の 3 系統表に、第 4 系統候補を加えた将来形:

| 系統 | kind | callsite 数 | aggregation 対象 | indicator | structural assert | 状態 |
|---|---|---|---|---|---|---|
| 1. save-verify | `save-verify` | 15 | ○ | ○ | ○ | 完了（PR #82〜#84） |
| 2. storage-quota | `storage-quota` | 2 | × | ○ | ○ | 完了（PR #79〜#80） |
| 3. master-verify | `master-verify` | 3 | ○ | ○ | ○ | 完了（PR #82〜#84） |
| **4. storage-corrupted（候補）** | `storage-corrupted` | 1〜4（案 A=1 / 案 B=3〜4） | **×（初期）** | ○ | ○ | 未着手 |

### 16.12 次にやるなら

#### 第一候補（最有力）: `SAVE-UX-PARSE-HANDLING-IMPL` 案 A

- 範囲: PARSE-MASTER-003 のみ（既存 `syncBranchMasterOnSave` 内 showMsg を `notifySaveWarning` 経由化）
- kind: `storage-corrupted`
- aggregateKey: `storage-corrupted:branch-master`
- severity: `warn`
- aggregation: 対象外（`SAVE_WARN_AGGREGATABLE_KINDS` は変更しない）
- callsiteId: `STORAGE-CORRUPTED:syncBranchMasterOnSave`（要 §13 規則確認）
- 期待効果: 第 4 系統の最小着地、indicator / metadata / test が標準化される

#### 第二候補: `SAVE-UX-IMPORT-FAILED-HANDLING-INVENTORY`

- 範囲: 系統 D（loadData / loadFromPaste / applyLoadedJson）+ 系統 E（master import 系）の棚卸し
- 種別: docs-only inventory
- 価値: 既存 alert / setStatus UX を notifySaveWarning に寄せるかどうかの判断材料を作る

#### 第三候補: `SAVE-UX-STORAGE-CORRUPTED-HANDLING-IMPL`（案 B）

- 範囲: PARSE-MASTER-003 + PARSE-LOAD-002 / 003 を同 PR で接続
- 重さ: 中。silent → warn の質的変化を伴う

#### 司令塔暫定おすすめ

次は **`SAVE-UX-PARSE-HANDLING-IMPL`（案 A / PARSE-MASTER-003 のみ）** が最も自然。既存 Level 1 callsite を helper 経由化するだけで、PR #82〜#84 で確立した 3 段階標準手順（metadata → structural test → aggregation 判定）の 1 順目に乗る。`import-failed` 系は別 inventory として後続検討。本セクションは確定仕様ではなく、impl 着手前に kind / aggregateKey / severity の最終確認を挟むこと。

### 16.13 SAVE-UX-PARSE-HANDLING-IMPL 実装完了状況（v1.6 追補）

- 対象 main HEAD: PR #86 マージ後 `346c36f` から派生（本 PR マージ後の SHA で更新予定）
- Task ID: `SAVE-UX-PARSE-HANDLING-IMPL`
- 範囲: §16.9 案 A（PARSE-MASTER-003 のみ）
- Branch: `feat/save-ux-parse-handling-impl`
- 実装内容:
  - `shogi_v4.html` の `syncBranchMasterOnSave()` 内 `_loaded_with_corruption` ブランチを `notifySaveWarning({...})` 経由化（既存 explicit `console.warn` / `showMsg('warn')` 直接呼び出しを除去）
  - `test/test_master_v2_lastclass.js` に **SECTION 18** を新規追加（static 9 件 + runtime / aggregation / isolation 12 件）
  - 同 test の SECTION 12.5 sanity check `__EXPAND_BLOCKS.length` を **20 → 21** に更新
  - SECTION 17 (master-verify aggregation) 内 T-EXP8-3systems-total を「既存 3 系統合計 20 件維持」に label / 集計方法を更新（`__EXPAND_BLOCKS.length` の直接比較から kind ごと filter 集計の sum 比較へ）
  - loadEnv export に `syncBranchMasterOnSave` を追加（end-to-end runtime テスト用、PR #86 §16 で承認済の最小着地）
- metadata:
  - `kind`: `'storage-corrupted'`
  - `aggregateKey`: `'storage-corrupted:branch-master'`
  - `severity`: `'warn'`
  - `callsiteId`: `'STORAGE-CORRUPTED:syncBranchMasterOnSave'`（§13 形式 (b) `KIND-NAMESPACE:funcName`、storage-quota と対称）
- aggregation: **対象外**（`SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify','master-verify'])` は変更しない）
- 不変項目:
  - 関数全体の try-catch 構造
  - 後段の汎用 catch `console.warn('支部マスタ同期に失敗（既存大会運営は継続）',e)`
  - `save()` 呼び出し（corruption 検知時も大会データ保存は継続、test_branch_master.js MF#3 を保護）
  - `saveBranchMaster()` を corruption 経路で呼ばない（破損由来の空マスタは永続化しない）
  - 既存 3 系統（save-verify 15 / storage-quota 2 / master-verify 3）の件数・metadata・aggregation 挙動
- 4 系統現在地（本 PR 完了時点）:

| 系統 | kind | callsite 数 | aggregation | indicator | structural assert | 出典 |
|---|---|---|---|---|---|---|
| 1. save-verify | `save-verify` | 15 | ○ | ○ | ○ | PR #82〜#84 |
| 2. storage-quota | `storage-quota` | 2 | × | ○ | ○ | PR #79〜#80 |
| 3. master-verify | `master-verify` | 3 | ○ | ○ | ○ | PR #82〜#84 |
| **4. storage-corrupted** | `storage-corrupted` | **1** | **×（初期）** | ○ | ○ | **本 PR** |
| **合計** | — | **21** | — | — | — | — |

- 残候補（後続別 PR、§16.9〜§16.10 参照）:
  - PARSE-LOAD-002 / PARSE-LOAD-003 → 案 B（silent → warn 化を含む、§16.10 論点 2 / 8）
  - 系統 D（大会データ import）/ 系統 E（master import）→ `SAVE-UX-IMPORT-FAILED-HANDLING-INVENTORY`（案 C）
  - PARSE-LOAD-001 / PARSE-MASTER-001 / PARSE-MASTER-004 → `SAVE-UX-LOAD-FAILED-HANDLING-INVENTORY`（案 D）
- 将来 aggregation 切替時の論点（§16.10 項目 8）:
  - `storage-corrupted:branch-master` 単独 callsite なので畳み込み問題は当面なし
  - PARSE-LOAD-002 / 003 を後続で接続する場合、`storage-corrupted:state` の畳み込み再検討が必要（§16.5「aggregateKey 畳み込みの注記」）
