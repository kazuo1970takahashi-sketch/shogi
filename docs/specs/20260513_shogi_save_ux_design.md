# SAVE-UX-DESIGN 設計書

- 作成日: 2026-05-13
- Task ID: `SAVE-UX-DESIGN`
- 種別: **設計タスク（docs-only）**。本タスクで実装は行わない。
- Base: `main` HEAD = `823998c347f1b5cb9e81f5ec3596924a56e01153`（PR #61 squash, MASTER-V2-LASTCLASS-IMPL）

## 1. 位置づけ

### 1.1 本タスクの目的

A-5.1 系列（保存後 re-read verify）で確立した「保存未確認検知」の **callsite 側通知ロジック** に共通のフレームワーク（UX Level 定義 / 保存失敗分類 / warn 集約方針 / retry 方針）を与え、後続の SAVE-UX 系実装タスクのスコープと評価軸を確定する。

### 1.2 SAVE-UX-DESIGN と SAVE-UX-MIN-NOTIFY の関係

| Task ID | 種別 | スコープ | 本 PR で扱うか |
|---|---|---|---|
| **SAVE-UX-DESIGN（本タスク）** | 設計 | UX Level 0〜4 確定、retry 方針確定、warn 集約方針確定、対応表、後続候補整理 | **○ 設計のみ** |
| SAVE-UX-MIN-NOTIFY | 実装（後続候補） | severity 定数、`notifySaveWarning` helper、Level 0 / 1 のみ、S03 / S05 を Level 1 昇格、S22 showMsg 1 件集約 | **× 本 PR では実装しない** |

SAVE-UX-MIN-NOTIFY は SAVE-UX-DESIGN の確定後に切り出す後続候補であり、本 PR は設計確定のみを行う。

### 1.3 関連済タスク

| PR | Task ID | Status | 関連 |
|---|---|---|---|
| [#59](https://github.com/kazuo1970takahashi-sketch/shogi/pull/59) | A-5.1-CLOSURE | Merged | A-5.1 保存安全化「実装系完了」の区切り判定 |
| [#60](https://github.com/kazuo1970takahashi-sketch/shogi/pull/60) | MASTER-V2-LASTCLASS-DESIGN | Merged | master 更新経路 verify 設計 |
| [#61](https://github.com/kazuo1970takahashi-sketch/shogi/pull/61) | MASTER-V2-LASTCLASS-IMPL | Merged | `verifyMasterFieldPersisted` 実装、S03 / S05 / S22 verify 配置 |

---

## 2. 総合方針

### 2.1 中核原則

> **「止めすぎず、見逃さず、当日は静かに、後で気づける」**

大会運営は受付・対局・確定を時間制約のもとで連続的に進める。保存未確認は重要だが、**運営フローを停止させる UX（modal / alert）は原則禁止**。一方で、保存失敗が完全に「見えないまま」進行することも避ける（バックアップ取得や原因切り分けの機会を失う）。

この二つの要請を両立させるため、通知レイヤを段階化する。

### 2.2 通知レイヤの段階

| レイヤ | 当日運営への割り込み | 後で気づく経路 |
|---|---|---|
| `console.warn` | なし（DevTools を開いていない限り見えない） | 後日デバッグ・診断時 |
| `showMsg(.., 'warn')` / toast | 軽微（一時表示） | 表示中のみ |
| 保存状態 indicator | 軽微（画面の隅に累積） | セッション中 |
| persistent warning bar | 中（常時表示） | セッション中 |
| inline confirm / 手動 retry 導線 | 中〜大（明示操作を求める） | 操作時 |
| modal / alert（採用しない） | 大（運営停止） | 操作時 |

通知レイヤを「重要度」と「割り込みコスト」の二軸で並べ、callsite ごとに **過剰でも過少でもない Level** を選択する。

### 2.3 禁止事項（UX 設計レベル）

- **modal / alert** を保存失敗通知の手段にしない（既存の確認 alert / 業務 alert は対象外）
- **自動 retry を当面しない**（quota exceeded / JSON 破損 / schema 不整合は retry で直りにくく、無限ループ・データ二重書き込みのリスクがある）
- 連続失敗バナーの自動表示など、運営の集中を奪う通知レイヤを当日は出さない

---

## 3. UX Level 0〜4

各 callsite に対して、以下の Level を割り当てる。Level は積み上げ式（Level N は Level 0〜N-1 の通知を含む）。

### 3.1 Level 0: console.warn のみ

- 通知: `console.warn('[TAG] callsite verify failed', {meta})` のみ
- 当日 UI: なし（DevTools を開いていない限り見えない）
- 想定: 影響が局所的で、当日中の対応が不要なケース
- **既存対応（main = `823998c` 時点）**:
  - **MASTER-V2-LASTCLASS の S03 / S05 / S22**（PR #61）が現状 Level 0。`console.warn` のみで `showMsg` を伴わない
  - 後続 SAVE-UX-MIN-NOTIFY で **Level 1 へ昇格** する目標（§4 / §7.2 参照）
- 補足: A-5.1 系（SAVE-001 〜 003b-3 / MASTER-001）の callsite は `console.warn` レイヤを持つが、多くは `showMsg(.., 'warn')` を併発するため **Level 1 相当**で扱う。`console.warn` 単体のレイヤとして取り上げる必要があるとき以外は、これらを「Level 0 の例」として参照しない

### 3.2 Level 1: console.warn + showMsg / toast

- 通知: Level 0 + `showMsg('保存が確認できませんでした...', 'warn')`（一時 toast）
- 当日 UI: トースト 1 件（一定時間で消える）
- 想定: 当日中にバックアップ取得を促したい操作（参加者削除直後・大会開始直後など）
- **既存対応（main = `823998c` 時点）**:
  - A-5.1-SAVE-001 〜 003b-3 の主要 callsite（`removePlayer` / `addPlayer` / `bulkEditNames` / pairing / submitRound 等）は **既に Level 1 相当**。warn 文言「ブラウザを閉じる前にバックアップしてください」を含む
  - MASTER-001 の `applyParticipantRenameWithMaster` も Level 1 相当（`showMasterSyncResult` で warn を出す）
- **昇格予定**:
  - MASTER-V2-LASTCLASS S03 / S05 / S22 を SAVE-UX-MIN-NOTIFY で Level 0 → Level 1 に昇格（§7.2 / §4）

### 3.3 Level 2: Level 1 + 保存状態 indicator に累積

- 通知: Level 1 + 画面の隅などの indicator（例: 右上に「保存未確認 N 件」バッジ）に累積カウント
- 当日 UI: トースト + 隅の累積バッジ
- 想定: 同一操作の繰り返し（バッチ追加・連続編集）で warn が連発するケース。1 件ずつのトーストは消えても、後でまとめて見える
- 既存対応: なし（後続 SAVE-UX-STATUS-INDICATOR で扱う）

### 3.4 Level 3: Level 2 + persistent warning bar

- 通知: Level 2 + 画面上部などの常時表示バー（「保存未確認の操作があります。大会データのコピーを取得してください」）
- 当日 UI: トースト + 隅バッジ + 上部バー
- 想定: 直近 N 件以上連続して verify false が出た場合、または重要な区切り（大会開始・回戦確定）で verify false が出た場合
- **N の具体値（閾値）は本設計書では確定しない**。**SAVE-UX-STATUS-INDICATOR または SAVE-UX-WARN-AGGREGATION の設計フェーズで決定する**。実装着手前に閾値を決める運用にすることで、当日 UI が過敏に出る / 鈍感になりすぎる の両極を回避する
- 既存対応: なし（後続 SAVE-UX-STATUS-INDICATOR の上位機能として候補）

### 3.5 Level 4: Level 3 + inline confirm / 手動 retry 導線

- 通知: Level 3 + 関連操作の付近に「再保存」ボタンや「無視して続行」確認
- 当日 UI: トースト + 隅バッジ + 上部バー + inline 操作
- 想定: 不可逆操作の手前（回戦確定・大会終了など）で、保存未確認のまま進めてよいか明示確認したいケース
- 既存対応: なし（後続 SAVE-UX-RETRY-POLICY / SAVE-UX-PHASE-AWARE と組み合わせて扱う候補）

### 3.6 Level 5（採用しない）

- 想定だけ: モーダルダイアログで運営を停止して再保存・rollback を強制
- **採用しない理由**:
  - 大会運営は時間制約があり、モーダル割り込みは現場停止リスクが高い
  - 保存未確認は「断定的失敗」ではなく「確認できない」状態であり、運営停止に値するシグナルではない
  - A-5.1 系列全体で `alert / rollback / retry なし` 方針を一貫してきており、Level 5 を採用すると整合が崩れる
  - quota exceeded / JSON 破損は modal で止めても解消しないため、運営停止に見合うリターンがない

---

## 4. 既存 verify 対象との対応表

A-5.1 SAVE 系 / MASTER-001 / MASTER-V2-LASTCLASS で確立した verify と、想定する SAVE-UX Level の対応。**現状（main = `823998c`）の Level と、SAVE-UX-MIN-NOTIFY 完了後の目標 Level** を分けて記載する。

| verify helper / callsite | 対象 | 既存 Task | 現状 Level | 目標 Level（最小 NOTIFY） | コメント |
|---|---|---|---|---|---|
| `verifyStatePersisted` | state の name 単軸（一括編集） | A-5.1-SAVE-003b-3 / MASTER-001 | Level 1（bulkEditNames）/ Level 1（rename） | Level 1 | バッチ追加分の集約 warn は SAVE-UX-WARN-AGGREGATION で再検討 |
| `verifyPlayerFieldPersisted` | state の field 軸 | A-5.1-SAVE-003b-3 | Level 1 | Level 1 | updateField member / grade の onchange 経路 |
| `verifyPlayerPersistedById` | state の id+cls+name 3 軸 | A-5.1-SAVE-002 / 003b-1 | Level 1 | Level 1 | addPlayer / handleSuggestClassAdd 等 |
| `verifyPlayerAbsent` | state の負の検証 | A-5.1-SAVE-001 | Level 1 | Level 1 | removePlayer |
| `readPersistedState` + `pairingsMatchSnapshot` | pairings / results の field-compare | A-5.1-SAVE-003 / 004 / 003b-2 | Level 1 | Level 1 | startTournament / generatePairing / setWinner / submitRound / changePairing / editPastResult |
| `verifyMasterPersisted` | master member の name | MASTER-001 | Level 1（rename系） | Level 1 | applyParticipantRenameWithMaster |
| `verifyMasterFieldPersisted` (S03) | master の last_class | MASTER-V2-LASTCLASS-IMPL | **Level 0** | **Level 1** | 既登録者クラス変更 |
| `verifyMasterFieldPersisted` (S05) | master の last_class | MASTER-V2-LASTCLASS-IMPL | **Level 0** | **Level 1** | サジェスト経由クラス変更 |
| `verifyMasterFieldPersisted` (S22) | master の last_class / member / grade / city（4 fields） | MASTER-V2-LASTCLASS-IMPL | **Level 0**（field 別 warn） | **Level 1**（showMsg は **1 件集約**） | console.warn は field 別、user-facing は 1 件 |
| 将来 S30 batch verify | `syncBranchMasterOnSave` の 2 段保存 | MASTER-V2-S30-BATCH-VERIFY（未着手） | 未実装 | Level 1〜2 | batch verify は複数 member の集計 warn が必要 |
| quota exceeded（`save()` 内 `notifyError`） | localStorage 容量超過 | 既存 `save()` の catch | Level 1〜2（alert あり、既存挙動） | 未確定（後続で再検討） | 現状は `notifyError` で alert。本設計の原則では modal / alert は原則避けるが、quota exceeded は構造的な保存失敗で当日対応の必要性が高く、既存 alert を **本 PR で変更しない**。alert を Level 2 / 3 / 4 のどれに置き換えるかは **SAVE-UX-STATUS-INDICATOR または SAVE-UX-RETRY-POLICY 側で判断**する（単純な弱化は避ける） |
| JSON 破損（`load()` / `normalizeBranchMaster`） | 読み込み時の破損検知 | 既存 `_loaded_with_corruption` フラグ | Level 1〜2 | Level 2〜3（破損は当日対応が必要） | SAVE-UX-PHASE-AWARE で再検討 |

「現状 Level 0」とした S03 / S05 / S22 は `console.warn` のみで user-facing 通知がない状態であり、SAVE-UX-MIN-NOTIFY の主たる狙いはこれらの Level 1 昇格である。

---

## 5. retry 方針

### 5.1 自動 retry はしない（恒久方針）

以下の理由で **`save()` / `saveBranchMaster()` 失敗時に自動 retry をしない**:

- **quota exceeded**: retry しても容量は空かない。回数が増えると `setItem` 例外で UI が固まる
- **JSON 破損**: parse 失敗の状態で retry しても同じ失敗を繰り返す
- **schema 不整合**: schema_version 不一致は retry で解消しない
- **二重書き込みリスク**: retry の途中で別の callsite から `save()` が走ると、in-memory state と persisted state がずれる可能性がある

### 5.2 手動 retry は Level 4 の後続候補

- ユーザが明示的に「再保存」ボタンを押す導線は **将来候補**（Level 4 / SAVE-UX-RETRY-POLICY）
- 並行書き込み系の偶発失敗（他タブからの操作と競合など）は手動 retry で直る可能性があるが、当面は「大会データコピー」での外部バックアップに委ねる

### 5.3 本 PR では retry UI を実装しない

- 本 PR は設計確定のみ
- SAVE-UX-MIN-NOTIFY でも retry UI は扱わない
- retry UI の採否・粒度は SAVE-UX-RETRY-POLICY で別途整理する

---

## 6. warn 集約方針

「集約」の単位は通知レイヤごとに異なる。**三層分離**で扱う。

### 6.1 三層分離

| 層 | 集約方針 | 理由 |
|---|---|---|
| `console.warn` | **集約しない**（callsite ごと、field ごとに 1 行ずつ） | 後追いデバッグでは粒度の細かさが価値。フィールド単位の不一致を追跡できることが重要 |
| user-facing `showMsg` / toast | **callsite ごとに 1 件に集約** | 複数 field 不一致でユーザに 4 件トーストを出すのは UX 上ノイズ。「保存未確認」を 1 件出せば十分 |
| 保存状態 indicator | **詳細を field 単位で累積**（後続候補） | 後で確認するときに field 単位の内訳が必要。indicator は表示領域が広く、詳細展開可能 |

### 6.2 S22 への適用例（SAVE-UX-MIN-NOTIFY 完了時の目標形）

S22 は 4 fields (`last_class` / `member` / `grade` / `city`) を verify するため、不一致時の通知量が他 callsite より多い。

- `console.warn`: 現状通り **field 別に 4 件**（MASTER-V2-LASTCLASS-IMPL で実装済）
- `showMsg`: **1 件に集約**（「保存が確認できませんでした...」）
- indicator: 詳細は field 別（後続 SAVE-UX-STATUS-INDICATOR）

### 6.3 バッチ操作への適用例（既存）

A-5.1-SAVE-003b-1 の `finalizeAddPastParticipants`、A-5.1-SAVE-003b-3 の `bulkEditNames` は既に **showMsg 1 件集約**を採用している（件数は warn 文言に含める）。これは本設計と整合済み。

---

## 7. Must / Should / Nice to Have

### 7.1 Must（SAVE-UX-DESIGN 本タスク = docs のみ）

- M1: UX Level 0〜4 の定義を本設計書 §3 で確定する
- M2: Level 5 を採用しない判断と理由を §3.6 で明記する
- M3: 保存失敗分類（quota exceeded / JSON 破損 / schema 不整合 / 並行書き込み）を方針内で扱える形で整理する（§5.1）
- M4: 既存 verify 対象との対応表を §4 で作成する
- M5: retry は後続分離する旨を §5 で明記する
- M6: warn 集約方針（三層分離）を §6 で確定する
- M7: 後続実装タスク候補を §9 で整理する

### 7.2 SAVE-UX-MIN-NOTIFY（後続実装候補、**本 PR では実装しない**）

スコープ案（最小限）:

- N1: `SAVE_SEVERITY` 定数群（`'silent' / 'toast' / ...` の文字列定数化）
- N2: `notifySaveWarning(level, tag, meta)` helper の追加
- N3: 対応 Level は **Level 0 / Level 1 のみ**（Level 2〜4 は後続）
- N4: S03 / S05 を **Level 0 → Level 1 に昇格**（showMsg(.., 'warn') を追加）
- N5: S22 を **showMsg 1 件に集約**（console.warn は現状の field 別を維持）

実装ファイル想定: `shogi_v4.html`（helper + S03 / S05 / S22 callsite 修正）、テスト追加。**本 PR では一切実装しない。**

### 7.3 Should（後続別 PR）

- SAVE-UX-WARN-HELPER: `notifySaveWarning` の正式 helper 化、Level に応じた通知レイヤの自動振り分け
- SAVE-UX-STATUS-INDICATOR: 保存状態 indicator（隅バッジ + 詳細パネル）の UI 実装。Level 2 / 3 を担う
- SAVE-UX-WARN-AGGREGATION: バッチ操作の warn 集約ロジックの一般化（`finalizeAddPastParticipants` / `bulkEditNames` 等を helper 統合）
- MASTER-V2-S30-BATCH-VERIFY: `syncBranchMasterOnSave` の 2 段保存 batch verify。SAVE-UX 集約方針が前提
- SAVE-UX-RETRY-POLICY: 手動 retry UI の採否・粒度・配置の設計

### 7.4 Nice to Have（将来候補）

- 保存エラーログ一覧（セッション内のすべての verify false を一覧表示できる画面）
- diagnostic report（端末 / ブラウザ / localStorage 容量などをまとめて出力）
- 大会終了前チェック画面（不可逆な大会終了確定前に未保存項目をまとめてレビュー）
- Level 4 inline confirm（回戦確定や大会終了前の「保存未確認のまま進めますか?」確認）
- 現場フェーズ判定（受付フェーズ / 対局フェーズ / 確定フェーズで通知 Level を自動調整）

---

## 8. 非目標（本 PR で扱わないこと）

- **実装しない**（docs のみ）
- `shogi_v4.html` を変更しない
- test を変更・追加しない
- `test/run_tests.sh` を変更しない
- `.github/workflows/` を変更しない
- `package.json` / `package-lock.json` を変更しない
- `schema_version` / localStorage 構造を変更しない
- retry UI を実装しない
- indicator UI を実装しない
- warning bar を実装しない
- inline confirm を実装しない
- modal / alert を新規導入しない
- MASTER-V2-S30-BATCH-VERIFY を実装しない
- import / merge / migration 系（S25〜S29）に触れない
- SAVE-FUTURE-REPORT（`bindReportEvents` の debounce 化）に着手しない
- SAVE-FUTURE-IMPORT（`applyLoadedJson` の件数 verify）に着手しない

---

## 9. 後続 Task ID 候補

| Task ID | 種別 | 主スコープ | 優先度 |
|---|---|---|---|
| `SAVE-UX-MIN-NOTIFY` | 実装 | severity 定数 + `notifySaveWarning` helper + Level 0/1 のみ。S03 / S05 を Level 1 昇格、S22 を showMsg 1 件集約 | 高 |
| `SAVE-UX-WARN-HELPER` | 実装 | `notifySaveWarning` の正式 helper 化 / Level に応じた自動振り分け | 中 |
| `SAVE-UX-STATUS-INDICATOR` | 実装 | 保存状態 indicator UI（Level 2/3 を担う） | 中 |
| `SAVE-UX-WARN-AGGREGATION` | 実装 | バッチ操作の warn 集約ロジック一般化 | 中 |
| `MASTER-V2-S30-BATCH-VERIFY` | 実装 | `syncBranchMasterOnSave` の 2 段保存 batch verify | 中（SAVE-UX 集約方針が前提） |
| `SAVE-UX-RETRY-POLICY` | 設計 | 手動 retry UI の採否・粒度・配置 | 低〜中 |
| `SAVE-UX-PHASE-AWARE` | 設計 | 受付/対局/確定フェーズの自動判定と Level 自動調整 | 低 |
| `SAVE-FUTURE-REPORT` | 実装 | `bindReportEvents` の debounce / blur 化 + verify | 中（SAVE-UX-MIN-NOTIFY 完了後） |
| `SAVE-FUTURE-IMPORT` | 実装 | `applyLoadedJson` の件数一致 verify | 中 |

---

## 10. Codex レビュー観点（設計書末尾）

本設計書を Codex 独立レビューに掛ける際の観点。

1. **現場運営を止めすぎない設計か**
   - modal / alert を保存失敗通知に使わない方針（§2.3）が一貫しているか
   - Level 5 を採用しない判断（§3.6）が運営現場の実情に整合しているか
2. **重要な保存失敗を見逃さない設計か**
   - 現状 Level 0 にとどまっている S03 / S05 / S22 を Level 1 へ昇格する方針（§4）が妥当か
   - quota exceeded / JSON 破損 / schema 不整合 を Level 0 で済ませない方針（§4 / §5.1）が妥当か
3. **Level 0〜4 の粒度は妥当か**
   - 段階の数（5 段階）が多すぎ / 少なすぎになっていないか
   - 各 Level が「割り込みコスト」と「重要度」の二軸で過剰でも過少でもないか
4. **Level 5 を採用しない判断は妥当か**
   - A-5.1 系列の `alert / rollback / retry なし` 方針との整合（§3.6）
   - quota exceeded を modal で止めても解消しない、というロジックの妥当性
5. **retry を後続分離する判断は妥当か**
   - 自動 retry をしない理由（§5.1）が網羅的か
   - 手動 retry を SAVE-UX-RETRY-POLICY に切り出す判断（§5.2 / §7.3）が妥当か
6. **warn 三層分離は妥当か**
   - `console.warn` / `showMsg` / indicator の集約単位（§6.1）が UX 上自然か
   - S22 への適用例（§6.2）が現実的か
7. **SAVE-UX-MIN-NOTIFY の候補スコープは過剰でないか**
   - N1〜N5（§7.2）が「最小」を逸脱していないか
   - Level 2 以上を SAVE-UX-MIN-NOTIFY に含めない判断が妥当か
8. **indicator / warning bar / retry / S30 を後続分離する判断は妥当か**
   - 後続 Task ID（§9）の分割粒度が過剰 / 過少でないか
   - SAVE-UX-MIN-NOTIFY → SAVE-UX-WARN-HELPER → SAVE-UX-STATUS-INDICATOR の順序が妥当か
9. **PR #59 / #60 / #61 の保存安全化と整合しているか**
   - A-5.1-CLOSURE（#59）の「実装系完了」区切りと矛盾していないか
   - MASTER-V2-LASTCLASS-DESIGN（#60、設計 PR）の方針記述と矛盾していないか
   - MASTER-V2-LASTCLASS-IMPL（#61、実装 PR）の **現状の通知レベル**（S03 / S05 / S22 は `console.warn` のみ = Level 0）と、本設計で示す **後続予定**（SAVE-UX-MIN-NOTIFY で Level 1 昇格）が混同なく区別されているか
   - A-5.1 系列全体の不変方針（alert / rollback / retry / 警告バナー / warn 集約 / 文言短縮 / debounce / aria-live / toast 集約は **本流の SAVE 系 PR に含めない**、SAVE-UX 後続で扱う）と整合しているか
   - 既存 helper（`verifyStatePersisted` / `verifyPlayerFieldPersisted` / `verifyMasterPersisted` / `verifyMasterFieldPersisted` / `verifyPlayerAbsent` / `verifyPlayerPersistedById` / `readPersistedState` / `pairingsMatchSnapshot`）の責務に触れていないか

判定基準:

- **A**: 上記全観点クリア。SAVE-UX-MIN-NOTIFY 起票に進める
- **Conditional**: 軽微な指摘あり。修正後再レビューで SAVE-UX-MIN-NOTIFY 起票可
- **No Go**: 設計乖離 / 中核原則違反 / 既存 PR との矛盾あり。修正必須

---

## 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-13 | v0 作成。SAVE-UX-DESIGN 設計確定。UX Level 0〜4、retry 後続分離、warn 三層分離、後続 Task ID 候補を整理。実装はせず、SAVE-UX-MIN-NOTIFY 以降に切り出す。 |
| 2026-05-13 | Codex Should Fix 2 点 + Nice to Have 2 点反映。§3.1 Level 0 既存対応を MASTER-V2-LASTCLASS S03/S05/S22 に限定（A-5.1 系は Level 1 相当として §3.2 に整理）。§10 #9 で PR #61 の現状（Level 0）と SAVE-UX-MIN-NOTIFY 後続予定（Level 1 昇格）を区別する表現に修正。§4 quota exceeded 行に「alert 置換判断は SAVE-UX-STATUS-INDICATOR / RETRY-POLICY 側」を追記。§3.4 Level 3 の N 値は SAVE-UX-STATUS-INDICATOR / WARN-AGGREGATION で決定する旨を追記。 |
