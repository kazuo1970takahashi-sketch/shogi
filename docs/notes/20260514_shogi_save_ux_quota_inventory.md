# SAVE-UX-QUOTA-HANDLING-INVENTORY — quota / storage exception / save failure 棚卸し

| 項目 | 値 |
|---|---|
| Task ID | SAVE-UX-QUOTA-HANDLING-INVENTORY |
| 作成日 | 2026-05-14 |
| 対象ファイル | `shogi_v4.html` (main = `f00a5a1`) |
| 種別 | docs-only inventory |
| 後続 | SAVE-UX-QUOTA-HANDLING-IMPL（Step 2、本書完了後に **再仕様確認** してから着手） |

---

## 1. 目的と前提

### 1.1 目的

`quota` / storage exception / save failure 経路を棚卸しし、SAVE-UX 系（既存 `save-verify` aggregation）に接続する際の **意味論分離** と **対象 callsite** を整理する。

### 1.2 前提

- **Inventory-only PR**。実装変更は一切行わない。
- 後続 SAVE-UX-QUOTA-HANDLING-IMPL（Step 2）の着手前に、本書を踏まえて **再仕様確認** する。
- `kind: 'save-verify'` の aggregation には混ぜない（意味論が異なるため）。
- 本書での暫定方針はあくまで「Step 2 設計の出発点」であり、棚卸し結果次第で見直す。

---

## 2. 検索キーワードと調査方法

### 2.1 grep キーワード

実際に使用した:

- `quota` / `QuotaExceededError` / `DOMException`
- `localStorage\.` / `localStorage\.setItem` / `setItem`
- `sessionStorage` / `indexedDB` / `IndexedDB` / `document\.cookie`
- `try` / `catch`
- `notifyError` / `alert\(` (with 「容量」「保存」「ブラウザ」「storage」 filter)
- `save()` / `saveBranchMaster\(` / `saveData\(`
- `function save` / `function saveBranchMaster`

### 2.2 対象ファイル

- `shogi_v4.html`（main = `f00a5a1`、5732 行付近）
- `test/` 配下は棚卸し範囲外（実装変更しないため）
- `docs/` 配下は既存設計参照のみ

### 2.3 調査日時

2026-05-14 (UTC)。main HEAD = `f00a5a1`（PR #77 直後）。

---

## 3. 結果サマリー

| 項目 | 件数 / 値 |
|---|---|
| **`QuotaExceededError` を明示判定する箇所** | **0 件** |
| **`DOMException.name === 'QuotaExceededError'` を見る箇所** | **0 件** |
| **quota 専用 callsite** | **0 件**（quota-specific な分岐ロジックは存在しない）|
| **汎用例外処理 callsite（quota も含む可能性）** | **3 件**（`save()` / `saveBranchMaster()` / `resetAll()` の try-catch） |
| **`localStorage.setItem` callsite 総数** | **2 件**（`save()` line 404 / `saveBranchMaster()` line 613）|
| **`localStorage.removeItem` callsite 総数** | **2 件**（`resetAll()` line 5570 / 5571、同一 try-catch 内）|
| **`localStorage.getItem` callsite 総数** | **8 件**（read 系、quota 対象外）|
| **`sessionStorage` / `IndexedDB` / `cookie` 使用** | **0 件**（コメントには出現するがコードでは使用なし） |
| **user-facing UX が現れる quota-related 経路** | **1 件**（`save()` のみ。文言は「容量超過か、プライベートブラウズの可能性があります」）|
| **catch で握りつぶし（user-facing なし）** | **2 件**（`saveBranchMaster()` は console.warn のみ / `resetAll()` は完全 silent）|

---

## 4. quota 専用 callsite 一覧

**該当なし**（0 件）。

`QuotaExceededError` / `DOMException.QUOTA_EXCEEDED_ERR` / `e.name === 'QuotaExceededError'` といった **quota を明示的に判定する分岐は存在しない**。

ただし `save()` line 404 の `notifyError` 文言には「容量超過か、プライベートブラウズの可能性があります」とあり、**quota を含む可能性に言及はしている**。これは catch 内の汎用例外処理であり、quota 専用判定ではない。

---

## 5. 汎用例外処理 callsite 一覧

| # | 関数 / 行 | 対象 | catch 内の挙動 | UX | 備考 |
|---|---|---|---|---|---|
| 1 | `save()` shogi_v4.html:404 | `localStorage.setItem(STORAGE_KEY, JSON.stringify(state))` | `notifyError('保存に失敗しました。容量超過か、プライベートブラウズの可能性があります。大会データをコピー（バックアップ）してください。')` | **alert + showMsg（notifyError 経由）** | 唯一の quota-aware UX。ただし quota 判定はせず汎用エラーで発火 |
| 2 | `saveBranchMaster()` shogi_v4.html:604-616 | `localStorage.setItem(BRANCH_MASTER_KEY, JSON.stringify(clone))` | `console.warn('支部マスタの保存に失敗。', e)` のみ | **console.warn のみ（user-facing なし）** | user は気付かない。verify-after-save (S03 / S05 等の `verifyMasterPersisted`) で post-hoc 検知 |
| 3 | `resetAll()` shogi_v4.html:5568-5573 | `localStorage.removeItem(STORAGE_KEY)` + LEGACY_STORAGE_KEYS | 完全 silent `catch(e){}` | **何も出ない** | reset 操作は本来 quota とは無関係。removeItem は通常 quota 例外を投げない |

### 5.1 補足: load() の try-catch

`load()` shogi_v4.html:405-422 は `localStorage.getItem` を try-catch している。catch は次の key へフォールバックするだけ（user-facing なし）。read 系のため quota とは無関係。

### 5.2 補足: 他の getItem catch

`shogi_branch_master` の read paths (line 590 / 3815 / 3858 / 3881 / 3904 / 3928 / 3953 / 3994) もそれぞれ try-catch しているが、いずれも read のため quota 対象外。

---

## 6. localStorage / storage 使用箇所一覧

### 6.1 大会データ保存 (`STORAGE_KEY = 'shogi_v4'`)

| line | 関数 | 操作 |
|---|---|---|
| 404 | `save()` | setItem |
| 410 | `load()` | getItem |
| 3815 / 3858 / 3904 / 3928 / 3953 | A-5.1 SAVE 系 verify helpers | getItem (read-only) |
| 5570 | `resetAll()` | removeItem |
| 5571 | `resetAll()` | removeItem (LEGACY_STORAGE_KEYS loop) |

### 6.2 支部マスタ保存 (`BRANCH_MASTER_KEY = 'shogi_branch_master'`)

| line | 関数 | 操作 |
|---|---|---|
| 590 | `loadBranchMaster()` | getItem |
| 613 | `saveBranchMaster()` | setItem |
| 3881 / 3994 | verify helpers (MASTER 系) | getItem (read-only) |

### 6.3 設定保存 / その他 localStorage 経路

**該当なし**。`STORAGE_KEY` と `BRANCH_MASTER_KEY` 以外への `localStorage.setItem` は **存在しない**。

### 6.4 共通 save 関数で集約されているか

- 大会データは `save()` で集約（line 404、唯一の setItem 経路）
- 支部マスタは `saveBranchMaster()` で集約（line 604-616、唯一の setItem 経路）
- 設定保存系は存在しない
- **個別 `setItem` が散在しているケースはない**（save 経路は 2 系統のみで明確に分離されている）

### 6.5 sessionStorage / IndexedDB / cookie

| storage | 使用 | 備考 |
|---|---|---|
| `sessionStorage` | **未使用**（コードに出現せず） | 設計コメントには「保存しない」と明記 |
| `IndexedDB` / `indexedDB` | **未使用** | 移行候補としても言及なし |
| `document.cookie` | **未使用** | — |

---

## 7. 現状 UX 分類

quota / storage failure らしき経路を UX で分類:

| UX 分類 | 該当箇所 | 件数 |
|---|---|---|
| `alert` を出している | `save()` line 404 (`notifyError` 経由で `alert` フォールバック) | 1 |
| `modal` を出している | なし | 0 |
| `showMsg` を出している | `save()` line 404 (`notifyError` 経由、`reg-msg` に reflect) | 1（上記と同一経路） |
| `console.warn` / `console.error` のみ | `saveBranchMaster()` line 615 | 1 |
| **何も出ない / 握りつぶし** | `resetAll()` line 5573 (`catch(e){}` 空) | 1 |
| 例外がそのまま伝播 | なし（すべて try-catch されている） | 0 |
| 不明 | なし | 0 |

### 7.1 `save()` の UX 詳細

`notifyError(text)` shogi_v4.html:2935-2942 の挙動:

1. `showMsg(text, 'err')` で `reg-msg` に表示（type='err'）
2. 直近 3 秒同一メッセージは alert 抑止
3. 登録タブが非表示なら `alert(text)` で強制通知

つまり `save()` の quota-related UX は:
- 登録タブ表示中: `reg-msg` に err 表示のみ
- 登録タブ非表示中: `reg-msg` 表示 + alert ポップアップ

### 7.2 `saveBranchMaster()` の UX 詳細

catch で `console.warn('支部マスタの保存に失敗。', e)` のみ。**user-facing 通知は一切なし**。

ただし、`saveBranchMaster()` の呼出側（line 1679 / 1863 / 2213 / ...）の多くは、その後の verify helper（`verifyMasterPersisted` / `verifyMasterFieldPersisted`）で post-hoc に検知し、`notifySaveWarning` で警告を出す経路がある（PR #65 / #66 / #74）。

### 7.3 「save-verify による post-hoc 検知」との関係

A-5.1 SAVE 系 15 callsite と MASTER-V2-LASTCLASS S03 / S05 / S22 / MASTER-001 系は **保存後に re-read して verify する** 構造のため、quota で setItem が失敗してデータが永続化されなかったケースも `verify-fail` として検知される。

ただし、これは「quota だから失敗した」という意味論を伝えていない。user に届くのは:
```
保存が確認できませんでした。ブラウザを閉じる前にバックアップしてください
```
という汎用 verify-fail メッセージ。「容量超過の可能性」は伝わらない。

---

## 8. `save()` 戻り値設計

### 8.1 戻り値

| 関数 | 戻り値 | 例外伝播 | failure 通知経路 |
|---|---|---|---|
| `save()` | `void` | catch されて伝播せず | `notifyError`（user-facing） |
| `saveBranchMaster()` | `void` | catch されて伝播せず | `console.warn` のみ |
| `saveData()` line 5241 | `void`（async + Promise 内部、clipboard 系）| catch されて `saveDataAsFile` フォールバック | `alert` |

### 8.2 boolean / Promise / void / throw の整理

- すべて **`void`**。boolean 返却なし、Promise 返却なし、throw 伝播なし。
- 呼出側は **戻り値で save 成功を判定できない**。
- save 成功は **verify-after-save helper で post-hoc 検知** する設計（A-5.1 SAVE 系 / MASTER-V2 / MASTER-001）。

### 8.3 save failure と verify failure の境界

| 区分 | 現状 | 検知タイミング | UX |
|---|---|---|---|
| **save failure（同期）** | `save()` catch のみ捕捉。`saveBranchMaster()` は user-facing なし | setItem の例外発生時 | `notifyError`（state のみ）|
| **verify failure（post-hoc）** | 15 callsite (A-5.1 SAVE 系) で実装済。MASTER 系も別途 | save 直後の re-read で発見 | `notifySaveWarning` (kind: 'save-verify') |

境界の課題: **quota が原因で setItem が失敗した場合**、state 系は同期 `notifyError` で「容量超過か...」を出し、その後の `save-verify` でも同じ事象を `verify-fail` として再通知する **二重通知** の可能性がある。Step 2 設計時に整理が必要。

---

## 9. SAVE-UX 接続時の暫定方針

**Step 2 設計の出発点として** 以下を暫定方針とする。**実装着手前に再確認**。

### 9.1 metadata 設計（暫定）

```js
notifySaveWarning({
  message: '<quota 系専用文言>',
  consoleTag: '<診断タグ>',
  callsiteId: '<callsite 識別子>',
  kind: 'storage-quota',
  aggregateKey: 'storage-quota:global',
  severity: 'warn'
});
```

| metadata | 暫定値 | 理由 |
|---|---|---|
| `kind` | `'storage-quota'` | save-verify と意味論を分離。hyphen-case 統一 |
| `aggregateKey` | `'storage-quota:global'` | 経路を細分化しても user-facing 価値は薄いため初期は global で集約 |
| `severity` | `'warn'` | 失敗は致命的ではなく「未保存の可能性」なので warn 維持 |

### 9.2 showMsg aggregation: **対象外**（初期）

理由:
- quota 系は user に対し「保存先の問題」という重要情報を伝える必要があり、毎回個別メッセージで内容を伝えた方が情報価値が高い
- save-verify の aggregation (3000ms / 短縮文言) と同じ仕組みに乗せると、quota の原因情報が短縮文言で失われる懸念
- 初期は集約せず、毎回個別 message を表示

Step 2 で運用感覚を確認し、必要に応じて aggregation を追加検討。

### 9.3 indicator: **同じ count に含める方向**

理由:
- indicator は「保存確認の問題が N 件発生」という事実を user に伝える指標
- save-verify と storage-quota は **どちらも「保存が確かでない」状態** であり、count を分ける必要性が薄い
- 文言「保存確認 N件」は両方を包含する表現として暫定的に妥当

ただし、Step 2 で indicator 詳細展開 (`SAVE-UX-INDICATOR-DETAIL`) を検討する際、kind 別に内訳を表示するかは別途判断。

### 9.4 Step 2 で再確認するポイント

- save() の `notifyError` を `notifySaveWarning` に置換するか、両者を共存させるか
- saveBranchMaster() に user-facing 通知を追加するか（現状 silent）
- quota 同期通知と verify-fail post-hoc 通知の **二重通知** をどう整理するか
- `e.name === 'QuotaExceededError'` 判定を入れるか、入れずに「storage 系の汎用エラー」として扱うか
- 既存「容量超過か、プライベートブラウズの可能性」文言を維持するか、短縮するか

---

## 10. Step 2 で対応すべき候補 callsite

| # | callsite ID 候補 | 関数 | 現状 UX | 推奨対応 | リスク |
|---|---|---|---|---|---|
| 1 | `STORAGE-QUOTA-save` | `save()` shogi_v4.html:404 | `notifyError`（容量超過文言あり）| `notifySaveWarning` に置換し `kind: 'storage-quota'` を付与 | `notifyError` の alert フォールバック挙動を失う可能性。registration タブ非表示時の通知設計が必要 |
| 2 | `STORAGE-QUOTA-saveBranchMaster` | `saveBranchMaster()` shogi_v4.html:613 | console.warn のみ | user-facing 通知追加（`notifySaveWarning` + `kind: 'storage-quota'`） | 既存「silent でも verify が拾う」設計を変える。verify path との二重通知整理 |
| 3 | `STORAGE-QUOTA-resetAll` | `resetAll()` shogi_v4.html:5573 | silent | **対象外候補**（reset は本来 quota 失敗が起きない／起きても致命的でない） | 触ることのリスクの方が大きい |
| 4 | `STORAGE-PARSE-load` | `load()` shogi_v4.html:412-420 | silent fallback | **本タスク対象外**（kind: 'parse-failed' で別タスク、`SAVE-UX-PARSE-HANDLING` 候補）| — |

### 10.1 Step 2 で扱う優先順位（暫定）

1. **save()**（高優先）: 唯一 user-facing UX が既にあり、metadata 化のメリットが大きい
2. **saveBranchMaster()**（中優先）: silent を user-facing 化するかは別設計判断
3. **resetAll()** / **load()**（対象外）: 別タスク or 触らない

---

## 11. 未決事項

| # | 項目 | 内容 |
|---|---|---|
| 1 | aggregateKey 細分化の要否 | `storage-quota:state` / `storage-quota:master` / `storage-quota:global` のどれを採用するか。初期は global を暫定 |
| 2 | severity `error` 導入の要否 | quota は user 操作で復旧可能（バックアップ取得 → reload）。`warn` で十分か、`error` 相当として扱うか |
| 3 | alert / modal 廃止の要否 | 現 `notifyError` の alert フォールバックを残すか。Level 1 user-facing で十分か |
| 4 | 握りつぶし箇所への検知追加要否 | `saveBranchMaster()` silent / `resetAll()` silent を user-facing 化するか |
| 5 | save-verify と storage-quota の同時発火時の扱い | quota で setItem 失敗 → 同期 storage-quota 通知 + 直後 verify-fail で save-verify 通知 = 二重通知。aggregation で吸収するか、callsite で抑制するか |
| 6 | indicator 文言「保存確認 N件」が storage-quota も含む表現として妥当か | 「保存」が含まれるので含意は適切。ただし「確認」が verify を示唆するため違和感の可能性 |
| 7 | `e.name === 'QuotaExceededError'` 判定を入れるか | 入れれば quota 専用文言、入れなければ汎用「保存に失敗」文言 |
| 8 | プライベートブラウズ検知の現実性 | 現文言「プライベートブラウズの可能性」は経験的記述で検知ロジックなし。維持するか短縮するか |

---

## 12. 棚卸しで発見されたリスク

### 12.1 saveBranchMaster の silent failure

`saveBranchMaster()` line 613 の setItem 失敗時、**user に通知がない**。`console.warn` のみ。

- リスク: user は支部マスタ保存失敗を気付けない
- 緩和策: 既存 `verifyMasterPersisted` 系で post-hoc に拾われる（PR #74 で helper 経由化済）。verify path がカバーしていれば致命的ではないが、verify 経由しないコードパスがあれば silent fail のまま

### 12.2 quota 未検知（明示判定なし）

`QuotaExceededError` を明示判定する箇所が 0 件。**quota とその他のエラーが区別されない**。

- リスク: quota 専用の UX（バックアップを促す等）を出し分けられない
- 現状: `save()` の文言が「容量超過か、プライベートブラウズの可能性」と幅広く言及することで、結果的にカバーしている

### 12.3 alert 依存（`save()` の alert フォールバック）

`notifyError` は登録タブ非表示時に alert を出す。

- リスク: モバイル / モーダル表示中など UX が崩れる可能性
- Step 2 で `notifySaveWarning` 経由化する場合、alert フォールバックの代替を設計する必要

### 12.4 二重通知の懸念

quota で setItem が失敗した場合:
1. 同期: `save()` catch → `notifyError`（既存）/ Step 2 では `notifySaveWarning(kind: 'storage-quota')`
2. post-hoc: verify-after-save → `notifySaveWarning(kind: 'save-verify')`

→ 同一原因で **2 種類の通知** が連続発火する可能性。

- 緩和策: aggregation で吸収するか、callsite 側で `if (just-emitted-storage-quota) skip-save-verify` のような共有フラグを使うか、いずれも Step 2 設計

### 12.5 保存経路分散の不在（プラス要素）

setItem 経路は 2 系統 (`save()` / `saveBranchMaster()`) のみで散在していない。これは Step 2 実装の単純化に寄与する。

### 12.6 reset での silent catch

`resetAll()` の `catch(e){}` は完全 silent。

- リスク: reset 操作で removeItem が失敗（実質起こり得ない）した場合、user は気付かない
- 評価: removeItem は通常 quota 例外を投げないため、リスクは小さい。Step 2 対象外候補

---

## 13. Step 2 着手前の再確認事項

**SAVE-UX-QUOTA-HANDLING-IMPL (Step 2) 着手前に、本書 §11 / §12 の未決事項とリスクを踏まえて以下を再仕様確認すること**:

1. 対象 callsite を `save()` のみに絞るか、`saveBranchMaster()` まで広げるか
2. `kind: 'storage-quota'` の aggregation 方針（初期: 集約しない / 全件個別）
3. `e.name === 'QuotaExceededError'` 判定の採否
4. 既存 `notifyError` の alert フォールバック挙動の保持 / 廃止
5. 二重通知（storage-quota + save-verify）の整理方針
6. indicator count への含め方（合算 / 分離 / 詳細展開）
7. 「容量超過か、プライベートブラウズの可能性」文言の維持 / 短縮 / 廃止
8. 既存 user-facing 文言の維持（PR #75 / #76 の方針との整合）

棚卸し結果次第で kind / aggregateKey / severity / indicator 方針が見直される可能性がある。本書の暫定方針は出発点であって確定ではない。

---

## 14. 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-14 | v0 作成。SAVE-UX-QUOTA-HANDLING-INVENTORY (docs-only)。`localStorage.setItem` 2 callsite / 汎用 try-catch 3 callsite を棚卸し、quota 専用判定 0 件を確認。Step 2 候補は `save()` (line 404) と `saveBranchMaster()` (line 613)。hyphen-case 命名規則は warn aggregation design へ追補。Step 2 着手前に再仕様確認が必要。 |
| 2026-05-14 | v1 追補 (SAVE-UX-QUOTA-HANDLING-IMPL, Step 2 実装完了)。§15 を追加し、Step 2 実装内容を反映: `isQuotaExceededError(e)` helper（4 判定条件）追加、`save()` / `saveBranchMaster()` に quota 分岐実装、metadata `kind: 'storage-quota'` / `aggregateKey: 'storage-quota:global'` / `severity: 'warn'` / callsiteId `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster`、showMsg aggregation 対象外（kind が `save-verify` ではないため helper 内 legacy path）、indicator count +1 維持、storage-quota + save-verify の二重通知は Step 2 で許容、resetAll は対象外継続。二重通知抑制 / indicator detail / resetAll silent catch は後続候補へ。 |

---

## 15. Step 2 実装到達点 (SAVE-UX-QUOTA-HANDLING-IMPL, v1 追補)

§1〜§14 は Step 1 docs-only inventory として作成された (2026-05-14 v0)。本セクションは「Step 2 実装後に読む人」が現状コードに即して理解できるようにするための追補。

### 15.1 実装した範囲

| 項目 | 実装 |
|---|---|
| 新規 helper | `isQuotaExceededError(e)` を shogi_v4.html に追加 |
| 対象 callsite | `save()` (line 404 付近) / `saveBranchMaster()` (line 604 付近) |
| 対象外 | `resetAll()`（removeItem は通常 quota 例外を投げないため未着手）|

### 15.2 `isQuotaExceededError(e)` の判定条件

ブラウザ間差異を吸収するため OR で 4 条件:

| 条件 | 想定ブラウザ |
|---|---|
| `e.name === 'QuotaExceededError'` | Chrome / Edge / Safari / WebKit |
| `e.name === 'NS_ERROR_DOM_QUOTA_REACHED'` | Firefox 旧版 |
| `e.code === 22` | DOMException 標準コード |
| `e.code === 1014` | Firefox 旧版コード |

`null` / `undefined` / `{}` / 別 name / `code === 0` は `false`。

### 15.3 `save()` の UX 構成

- **quota 時**: `alert('保存容量の上限に達しました。データ整理が必要です。')` + `notifySaveWarning({...})` + `return`
  - `notifySaveWarning` が `showMsg('warn')` / `console.warn` / `indicator count +1` を担当
  - 既存 `notifyError` の `showMsg('err')` は呼ばない（重複 `showMsg` 回避）
- **quota 以外**: 既存 `notifyError(...)` 経路を完全維持（'保存に失敗しました。容量超過か、プライベートブラウズの可能性...' の文言を含む）

### 15.4 `saveBranchMaster()` の UX 構成（Level 1 化）

- **quota 時**: `notifySaveWarning({...})` + `return`
  - `notifySaveWarning` が user-facing `showMsg('warn')` を担当（既存は silent だったため新規 Level 1 化）
  - 既存 `console.warn('支部マスタの保存に失敗。', e)` は呼ばない（重複 `console.warn` 回避、helper が個別 `console.warn` を出すため）
- **quota 以外**: 既存 `console.warn('支部マスタの保存に失敗。', e)` 経路を完全維持（汎用例外の Level 1 化は別タスク）

### 15.5 metadata（確定値）

| metadata | 値 |
|---|---|
| `kind` | `'storage-quota'` |
| `aggregateKey` | `'storage-quota:global'` |
| `severity` | `'warn'` |
| `callsiteId` (`save()`) | `'STORAGE-QUOTA:save'` |
| `callsiteId` (`saveBranchMaster()`) | `'STORAGE-QUOTA:saveBranchMaster'` |
| `fields` | 省略（A-5.1 SAVE 系の方針と一貫。動的 error 情報は `consoleTag` の文字列に埋め込む） |
| `consoleTag` 形式 | `'[STORAGE-QUOTA] <function>() setItem failed (name=<e.name>, code=<e.code>)'` |

### 15.6 showMsg aggregation: **対象外**

`notifySaveWarning` helper の aggregation 条件は `kind === 'save-verify' && severity === 'warn' && aggregateKey` truthy（PR #76）。

`kind === 'storage-quota'` は条件に該当しないため、helper 内 **legacy path** を通り、毎回元 message を `showMsg` する。

→ storage-quota の連続発火でも短縮文言には切り替わらない（テスト `T-EXP6-quota-not-aggregated` で確認）。

### 15.7 indicator count: 発生単位 +1

`recordSaveWarningForIndicator` は `notifySaveWarning` から無条件で呼ばれる。storage-quota でも +1（テスト `T-EXP6-quota-twice-indicator-plus-2` で連続 2 回で +2 を確認）。

### 15.8 二重通知（Step 2 では許容）

quota で `setItem` が失敗した場合、以下の二重通知が発生し得る:

1. 同期: `save()` catch → `storage-quota` 通知（`showMsg` + `console.warn` + indicator +1）
2. post-hoc: verify-after-save → `save-verify` 通知（同上、ただし save-verify 経路の callsite 経由）

Step 2 では **抑制せず両方表示**:
- `showMsg` が 2 回（save-verify は短縮文言になる可能性あり）
- `console.warn` が 2 回
- indicator count +2

理由: 失敗を隠さない原則を優先。状態管理を伴う抑制は Step 2 のスコープを超えるため、後続タスク候補とする（§15.10）。

### 15.9 save-verify 既存挙動への影響

- save-verify aggregation の対象条件（PR #76）は変更なし
- save-verify の 15 callsite 呼出コードは変更なし
- storage-quota の発火は save-verify の `lastTimestampByKey` を汚染しない（aggregateKey が異なるため、独立した key で管理される）

テスト `T-EXP6-sv-still-aggregates` / `T-EXP6-quota-no-pollution` で確認。

### 15.10 後続候補

| # | タスク候補 | 内容 |
|---|---|---|
| 1 | `SAVE-UX-DUAL-NOTIFY-SUPPRESSION` | storage-quota → save-verify の二重通知抑制（priority / suppression logic）|
| 2 | `SAVE-UX-INDICATOR-DETAIL` | indicator 詳細展開で kind 別内訳表示（save-verify / storage-quota） |
| 3 | `SAVE-UX-RESETALL-SILENT-CATCH` | resetAll の silent catch 検知追加（要否判断含む） |
| 4 | `SAVE-UX-LEVEL-3-WARNING-BAR` | 連続発生件数閾値超で warning bar 表示 |
| 5 | `SAVE-UX-AGGREGATION-TUNING` | 3000ms window / 短縮文言の運用感覚調整 |
