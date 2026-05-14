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
| master-verify | 実装済 / test 厳密化済 / docs 反映済 | `master-verify` | `master-verify:lastclass` | **3** | **対象外**（PR-A 時点）| **対象** | MASTER-V2-LASTCLASS S03 / S05 / S22（PR-A: SAVE-UX-MASTER-V2-METADATA-IMPL）。aggregation 対象化は後続 PR-B: `SAVE-UX-MASTER-V2-AGGREGATION` で扱う |

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
| 2b | `SAVE-UX-MASTER-V2-AGGREGATION` (PR-B) | master-verify を aggregation 対象にするか検討・実装。kind allow-list 方式（`AGGREGATABLE_KINDS = ['save-verify', 'master-verify']`）が候補 | PR-A 完了後、連続警告の UX を見て判断 | 低〜中 | helper の aggregation 条件変更を含むため、metadata 付与とは別 PR レビュー観点。実運用フィードバック待ちでもよい |
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

#### 3. master-verify を aggregation 対象にするなら: `SAVE-UX-MASTER-V2-AGGREGATION` (PR-B)

**理由**: PR-A で master-verify metadata は付与済みだが、aggregation 対象は `kind === 'save-verify'` のまま。連続警告のうるささを実運用で確認してから判断する。kind allow-list 方式（`AGGREGATABLE_KINDS`）が初期候補。

#### 4. 実運用フィードバックを待つなら: `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` / `SAVE-UX-AGGREGATION-TUNING`

**理由**: 二重通知や alert 連発は、実際にうるさいかどうかを見てから判断してよい。実運用フィードバックを得てから着手するのが安全。

#### 司令塔おすすめ

`SAVE-UX-TEST-STRUCTURAL-MATCH` 完了後の時点では、次は **`SAVE-UX-MASTER-V2-AGGREGATION`** （PR-B）が主候補。kind allow-list（`AGGREGATABLE_KINDS = ['save-verify', 'master-verify']`）で master-verify を aggregation 対象化するか、実運用フィードバックを見て判断する。実運用感覚次第で `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` / `SAVE-UX-AGGREGATION-TUNING` も候補に上がる。parse-failed / duplicate-name 系の inventory を次の kind として挟む選択肢もある。
