# SAVE-UX-WARN-AGGREGATION 設計書

- 作成日: 2026-05-13
- Task ID: `SAVE-UX-WARN-AGGREGATION`
- 対象 main HEAD: `fd05fcf`（PR #68 squash 後）
- 種別: **docs-only**。本タスクで実装は行わない。
- 後続実装タスク: `SAVE-UX-WARN-AGGREGATION-IMPL`（および前提となる `SAVE-UX-WARN-HELPER-EXPAND`）

---

## 1. 目的と背景

### 1.1 なぜ aggregation が必要か

PR #59〜#68 で保存安全化 / verify / 通知 UX を整備してきた到達点:

- A-5.1 / SAVE 系: Level 1 到達
- MASTER-001 系: Level 1 到達
- MASTER-V2-LASTCLASS S03 / S05 / S22: Level 1 到達
- `notifySaveWarning` helper（PR #66）: S03 / S05 / S22 の user-facing warn を集約
- Level 2 保存状態 indicator（PR #68）: helper 経由 warn を「保存確認 N 件」として累積表示

次に出てくる論点は **「warn の種類・優先順位・集約ルール」** の交通整理:

- S22 で 4 fields verify 失敗時、user-facing warn は 1 件集約済（PR #65）。だが、別の S22 操作が連続したら user-facing は何件出るべきか
- duplicate warning と verify failure warning が同時に成立するとき、どちらを優先するか（PR #65 で暫定判断したが、ルール化されていない）
- 将来 quota / parse / 破損 系の warn を追加するときの kind 分類は？
- aggregation を入れたら indicator count はどう振る舞うべきか

これらを **方針として確定** する段階。

### 1.2 本タスクの位置づけ

- 本タスクは **docs-only**
- 実装は `SAVE-UX-WARN-AGGREGATION-IMPL`（後続）で扱う
- `notifySaveWarning` 引数 schema は本書では変更しない（拡張候補だけ記述）

### 1.3 関連済 PR

| PR | Task ID | Status |
|---|---|---|
| [#59](https://github.com/kazuo1970takahashi-sketch/shogi/pull/59) | A-5.1-CLOSURE | Merged |
| [#60](https://github.com/kazuo1970takahashi-sketch/shogi/pull/60) | MASTER-V2-LASTCLASS-DESIGN | Merged |
| [#61](https://github.com/kazuo1970takahashi-sketch/shogi/pull/61) | MASTER-V2-LASTCLASS-IMPL | Merged |
| [#62](https://github.com/kazuo1970takahashi-sketch/shogi/pull/62) | SAVE-UX-DESIGN | Merged |
| [#63](https://github.com/kazuo1970takahashi-sketch/shogi/pull/63) | SAVE-UX-MIN-NOTIFY-001 | Merged |
| [#64](https://github.com/kazuo1970takahashi-sketch/shogi/pull/64) | SAVE-UX-STATUS-MAP | Merged |
| [#65](https://github.com/kazuo1970takahashi-sketch/shogi/pull/65) | SAVE-UX-MIN-NOTIFY-002 | Merged |
| [#66](https://github.com/kazuo1970takahashi-sketch/shogi/pull/66) | SAVE-UX-WARN-HELPER | Merged |
| [#67](https://github.com/kazuo1970takahashi-sketch/shogi/pull/67) | SAVE-UX-STATUS-INDICATOR-DESIGN | Merged |
| [#68](https://github.com/kazuo1970takahashi-sketch/shogi/pull/68) | SAVE-UX-STATUS-INDICATOR-IMPL | Merged |

---

## 2. 三層分離原則（本設計書の中核）

本書の **すべての判断はこの原則に従う**。aggregation は三層の関係を壊さない範囲で設計する。

### 2.1 三層の定義

| 層 | 媒体 | 用途 | aggregation 対象か |
|---|---|---|---|
| **console.warn** | DevTools コンソール | debug 詳細、運営者向けではない | **対象外**（全件出す） |
| **user-facing `showMsg`** | `#reg-msg` の `alert-warn` | 一時通知、運営者の今気づき | **対象**（aggregation で抑制候補） |
| **indicator count** | タブバー pill `保存確認 N件` | 累積状態、運営者の後で気づき | **対象外**（発生単位を維持） |

### 2.2 三層分離の意味

- `console.warn` は **debug 詳細**。aggregation で抑制しない。後追いデバッグ / 障害解析に必要な field 別 / callsite 別の生ログが残る
- user-facing `showMsg` は **一時通知**。連発するとノイズになるため aggregation 対象。「いま起きた」だけが伝わればよい
- indicator count は **事実の累積**。「N 件あったよ」を後で気づくための残像。aggregation で集約すると count が運営者の不安と一致しなくなる

### 2.3 集約の方向性

**aggregation は user-facing `showMsg` を静かにするためのもの**。`console.warn` の事実や indicator count の累積を消すものではない。

具体例（S22 で 4 fields verify 失敗 + duplicate warning 同時成立）:
- `console.warn`: 4 件（field 別、`duplicate_name` 1 件も別途出る → 計 5 件）
- user-facing `showMsg`: **1 件**（verify failure を優先、duplicate は user-facing には出さない）
- indicator count: **+1**（`notifySaveWarning` 1 回呼出 = +1、PR #68 設計を維持）

この三層が独立した粒度を持つことで、「静かに、見逃さず、後で気づける」の中核原則を実現する。

### 2.4 三層分離の不変条件

aggregation 実装後も以下を保証する:

- **`console.warn` を抑制しない**（PR #66 で確立）
- **user-facing `showMsg` を抑制しても indicator count は +1 する**（PR #68 を保護）
- **`notifySaveWarning` 1 回呼出 = indicator count +1**（PR #68 の確定仕様、設計書 §7）

---

## 3. duplicate vs verify failure 優先順位

### 3.1 原則

```
verify failure  >  duplicate  >  その他 input validation
```

### 3.2 判断基準: データ消失リスク

| 種類 | データ状態 | リスク |
|---|---|---|
| verify failure | 保存処理は走ったが永続化が確認できない | データ消失の可能性あり |
| duplicate | 重複が検知された事実、保存自体は完了している場合がある | データは残っている、運営の判断材料 |
| input validation | 入力規則違反、保存処理に進まない | データ問題ではなく入力ミス |

**データ消失リスクの大きさで優先順位を決める**。

### 3.3 同時成立時の挙動

S22 で「verify failure（master verify 失敗）」と「duplicate（`result.duplicateCount > 0`）」が同時成立した場合:

- user-facing `showMsg`: **verify failure を優先**（PR #65 で実装済、本書で正式ルール化）
- duplicate は可能な限り **`console.warn` / debug 層に残す**（情報を失わない）
- indicator count: **verify failure 1 件として +1**（duplicate を別途 count しない、`notifySaveWarning` 1 回呼出ベース）

### 3.4 PR #65 の判断を正式ルール化

PR #65 の S22 実装で:

```js
if (s22MasterVerifyOk) {
  // 既存 success（duplicate 警告を含む）を維持
  showMsg(msg, result.duplicateCount > 0 ? 'warn' : 'ok');
} else {
  // verify 失敗時は duplicate 警告も出さない（verify failure を優先）
  showMsg('会員マスタ情報の保存が確認できませんでした', 'warn');
}
```

この判断を、本書で **「verify failure > duplicate」の正式ルール** として確定。

---

## 4. kind 分類

### 4.1 kind 候補

| kind | 種別 | 説明 |
|---|---|---|
| `verify_failed` | **初期** | 保存後 re-read で期待値と一致しない（現状の S03 / S05 / S22 / A-5.1 系 / MASTER-001 系すべて該当） |
| `duplicate_name` | 後続 | 同名重複の検知（S22 の `duplicateCount > 0` 等） |
| `quota_exceeded` | 後続 | `localStorage.setItem` の容量超過例外（`save()` の catch） |
| `parse_failed` | 後続 | `JSON.parse` 失敗（`loadBranchMaster` 等） |
| `storage_corrupted` | 後続 | schema_version 不一致、`members` Array でない等 |
| `import_warning` | 検討中 | import 系の warning（SAVE-FUTURE-IMPORT の独立トラック） |
| `migration_warning` | 検討中 | migration 系（同上） |

### 4.2 設計判断

- **kind は設計上定義するが、今回実装しない**（`notifySaveWarning` schema 変更は後続タスク）
- 現時点の S03 / S05 / S22 はすべて `verify_failed` 相当
- 命名規則: **snake_case**
- kind は **severity ではない**（§5 参照）

### 4.3 kind と severity の違い

- kind: **何が起きたか**（事象の分類）
- severity: **どれくらい深刻か**（重大度）

本書では kind のみ定義。すべての kind は「warn レベル」で扱える（§5 参照）。

---

## 5. severity の扱い

### 5.1 今回 severity は導入しない

- 現状すべて warn レベルで扱える
- 既存 `showMsg(text, type)` の `type` 引数は `'ok'` / `'warn'` / `'err'` で十分
- `notifySaveWarning` は warn 専用で導入されており、severity を増やす必要がない

### 5.2 導入しない理由

- severity を入れると Level 2 indicator の表示分岐や色分けが必要になり、**scope creep する**
- kind だけで十分な段階では severity は冗長
- 「すべて warn」で運営者の判断が分断されない

### 5.3 将来の再検討タイミング

- Level 3 warning bar 導入時（重大度で表示制御したくなる）
- error 級事象（quota exceeded など、現状 `notifyError` で `alert` 扱いの領域）を kind に含める場合
- それまでは導入しない

---

## 6. aggregation key 方針

### 6.1 初期 aggregation key

```
kind + callsiteId
```

例:
- `verify_failed:S03`
- `verify_failed:S05`
- `verify_failed:S22`

### 6.2 time window

- 初期案: **3 秒**
- 同じ aggregation key の `notifySaveWarning` が time window 内に複数回発生した場合、**user-facing `showMsg` を 2 回目以降抑制**
- ただし `console.warn` と indicator count は全件出す（三層分離原則）

実装時に調整可能（§12 未決事項）。

### 6.3 aggregation の対象

- **対象**: user-facing `showMsg` の連続表示抑制
- **対象外**:
  - `console.warn`（全件出す、PR #66 設計）
  - indicator count（発生単位維持、PR #68 設計）

### 6.4 採用しない候補と理由

| 候補 | 不採用理由 |
|---|---|
| entityId / memberId 単位 | 粒度が細かすぎる。同じ entity に対する連続失敗を抑制したいが、`kind + callsiteId` で十分カバーできる |
| field 単位 | user-facing には過剰。field 別の集約は console.warn 層に既に存在（PR #65 で field 別出力済） |
| message 単位 | 文言変更に弱い。「保存できませんでした」の文言バリエーションで集約が壊れる |
| callsiteId 単位のみ | kind の違いを無視する。S22 で verify_failed と duplicate_name が混在したとき集約しすぎる |
| kind 単位のみ | 異なる callsite を集約しすぎる。S03 と S05 の `verify_failed` を同一視するのは過剰 |
| helper 1 回呼出単位のまま | aggregation の意味がない（現状と同じ） |

`kind + callsiteId` は粒度が **「事象の種類 × 発生場所」** で、運営者が「同じ場所で同じ問題が連続している」を判断するのに自然な単位。

---

## 7. indicator count policy（重要）

### 7.1 確定方針

- **indicator count は `notifySaveWarning` 発生単位を維持する**
- aggregation で user-facing `showMsg` を抑制しても **indicator count は集約しない**
- `notifySaveWarning` 1 回呼出 = indicator count +1
- `fields.length` 分は加算しない（PR #68 設計書 §7 / 本書 §2.3 の整合）
- **kind 別 count は今回導入しない**

### 7.2 設計理由

> 「showMsg は静かに、indicator は事実を残す」が基本方針。

- user-facing `showMsg` を aggregation で抑制すると、運営者は「いま気づく」機会を失う場面が増える
- その代わりに indicator は **事実をすべて残す**ことで「後で気づく」機会を保証する
- 三層分離原則（§2）の核心

### 7.3 不採用案

| 案 | 不採用理由 |
|---|---|
| 抑制後の通知数だけ count する | indicator count が運営者の実感と乖離する（実際に起きた件数より少なくなる）。「保存確認 1 件」と表示されているのに console.warn は 10 件、という乖離が信頼を損なう |
| kind ごとに count を分ける | UI が複雑化（pill 複数表示 or 内部状態の細分化）、Level 2 の「静かな残像」原則に反する |
| time window 内は count +1 に留める | indicator が aggregation 結果を反映してしまい、§2.3 で示した「showMsg と indicator の独立性」が崩れる |

### 7.4 不変条件の再確認

PR #68 で実装した `recordSaveWarningForIndicator(options)` は:

```js
function recordSaveWarningForIndicator(options){
  try{
    saveWarningIndicatorState.count+=1;  // ← 常に +1
    updateSaveWarningIndicator();
  }catch(e){...}
}
```

aggregation 実装後も **この `count += 1` のロジックは変更しない**。aggregation は呼出側（`notifySaveWarning` の showMsg 部分）で判定する。

---

## 8. `notifySaveWarning` schema 拡張候補

### 8.1 現状 schema（PR #66 で確定、不変）

```js
notifySaveWarning({
  message,      // string, 必須
  consoleTag,   // string, default '[SAVE-WARN]'
  callsiteId,   // string, default 'unknown'
  fields        // string[], default []
})
```

### 8.2 後続で追加する候補

| 引数 | 用途 |
|---|---|
| `kind` | warn の種類（§4 の kind 候補から選ぶ） |
| `aggregateKey` | aggregation key の明示指定（自動算出 `kind + callsiteId` を override したい場合） |

### 8.3 追加しない候補と理由

| 候補 | 不採用理由 |
|---|---|
| `severity` | §5 で導入しない方針確定 |
| `entityId` / `memberId` | aggregation key で entityId 単位を不採用（§6.4） |
| `suppressDuplicate` | callsite 側が判断するのは責務違反、helper 内部で完結すべき |
| `userFacing` | 三層分離原則（§2）の前提を崩す（user-facing は常に showMsg 経由） |
| `indicatorCountPolicy` | §7 で確定方針（発生単位維持）が固定、可変にする必要がない |

### 8.4 今回の確定事項

- **今回は `notifySaveWarning` schema を変更しない**
- `kind` / `aggregateKey` の追加は **`SAVE-UX-WARN-AGGREGATION-IMPL`** で検討
- `aggregateKey` は `kind + callsiteId` から自動算出できるなら明示引数にしない選択肢もある（§12 未決事項）
- callsite 変更は最小化する
- S03 / S05 / S22 に `kind: 'verify_failed'` を追加するかは後続で検討
- helper を肥大化させない

---

## 9. 初期スコープと対象外

### 9.1 初期スコープ（本書）

- aggregation の目的と背景（§1）
- 三層分離原則（§2）
- duplicate vs verify failure 優先順位（§3）
- kind 候補（§4）
- aggregation key 初期方針（§6）
- indicator count policy（§7）
- `notifySaveWarning` schema 拡張候補（§8）
- 後続タスク候補と順序（§11）

### 9.2 対象外

- aggregation 実装
- `notifySaveWarning` schema 変更
- kind / severity / aggregateKey の実装
- duplicate 警告ロジック変更
- quota / parse / import / migration callsite 変更
- A-5.1 / SAVE 系 helper 置換
- MASTER-001 系 helper 置換
- S30 batch verify
- SAVE-FUTURE-REPORT
- SAVE-FUTURE-IMPORT
- Level 3 warning bar
- Level 4 retry / inline confirm
- modal / alert

---

## 10. Level 1 / 2 / 3 / 4 境界との整合

SAVE-UX-DESIGN §3 で定義した Level との関係:

| Level | 役割 | aggregation との関係 |
|---|---|---|
| Level 1 `showMsg` / toast | 一時通知 | **aggregation は Level 1 を静かにする** |
| Level 2 indicator | 累積状態 | **aggregation は Level 2 を抑制しない**（§7） |
| Level 3 warning bar | 常時可視警告 | **本書スコープ外**（aggregation は Level 3 / 4 に進まない） |
| Level 4 retry / inline confirm | 操作要求 | 同上 |

### 10.1 modal / alert は対象外

- SAVE-UX-DESIGN で Level 5（modal）は採用しない方針
- aggregation の対象に modal / alert は含まない
- 既存 `notifyError` の `alert` 併発（quota exceeded 等）は本書スコープ外（kind 分類の検討対象だが、aggregation 設計には含めない）

---

## 11. 後続タスク候補と順序

### 11.1 推奨順序

| # | Task ID | 種別 | 概要 |
|---|---|---|---|
| 1 | **SAVE-UX-WARN-AGGREGATION**（今回） | docs | 本書 |
| 2 | **SAVE-UX-WARN-HELPER-EXPAND** | impl | A-5.1 / SAVE 系 / MASTER-001 系を `notifySaveWarning` 経由化 |
| 3 | **SAVE-UX-WARN-AGGREGATION-IMPL** | impl | `kind` 引数追加 / `aggregateKey` 抑制ロジック / user-facing `showMsg` 集約 |
| 4 | SAVE-UX-QUOTA-HANDLING | impl | `save()` catch の `notifyError` を kind 系に統合 |
| 5 | SAVE-UX-PARSE-HANDLING | impl | `loadBranchMaster` parse 失敗を kind 系に統合 |
| 6 | MASTER-V2-S30-BATCH-VERIFY | impl | `syncBranchMasterOnSave` の 2 段保存 batch verify |
| 7 | SAVE-UX-RETRY-POLICY | design | 手動 retry UI（Level 4） |
| 8 | SAVE-UX-PHASE-AWARE | design | 大会フェーズ別通知制御 |
| 9 | SAVE-FUTURE-REPORT | impl | `bindReportEvents` debounce + verify |
| 10 | SAVE-FUTURE-IMPORT | impl | `applyLoadedJson` / import / merge / migration の verify |

### 11.2 HELPER-EXPAND を AGGREGATION-IMPL より先に置く理由

- AGGREGATION-IMPL の効果は **対象 callsite が多いほど見える**
- 現状 helper 経由は S03 / S05 / S22 の 3 件のみ。aggregation の効果が限定的
- HELPER-EXPAND で A-5.1 / SAVE 系（addPlayer / removePlayer / submitRound / etc）と MASTER-001 系を helper 経由化すれば、対象 callsite が一気に拡大
- aggregation 実装前に kind / key の対象を広げられる → IMPL の testability も向上
- quota / parse 系は kind 追加の実証ケースとして後続（QUOTA-HANDLING / PARSE-HANDLING）で扱う

### 11.3 STATUS-MAP §8 との関係

STATUS-MAP §8 の優先順位（SAVE-UX-STATUS-INDICATOR → SAVE-UX-WARN-AGGREGATION → MASTER-V2-S30-BATCH-VERIFY → ...）に対し、本書では **HELPER-EXPAND を AGGREGATION-IMPL の前に挿入** する形で更新。STATUS-MAP 自体は変更しない（本書スコープ外）が、次回 STATUS-MAP 更新時に反映候補。

---

## 12. 未決事項

実装タスク（HELPER-EXPAND / AGGREGATION-IMPL）着手時に確認する項目:

1. **time window を 3 秒にするか** — 短すぎると aggregation の効果が薄い、長すぎると別の操作の通知を巻き込む
2. **kind を必須引数にするか** — 必須にすると callsite 側の負担増、optional にすると `verify_failed` をデフォルトにする等の判断が必要
3. **`aggregateKey` を明示引数にするか自動算出にするか** — 明示にすると柔軟性↑、自動にすると callsite 側の負担↓
4. **showMsg 抑制時の `console.warn` 文言** — 抑制された旨を debug 層に残すかどうか（例: `'[SAVE-WARN-AGG] suppressed', {aggregateKey, count}`）
5. **indicator count は現行通り発生単位でよいか** — §7 で確定済だが、IMPL で再確認
6. **duplicate warning を `console.warn` にどう残すか** — 現状 S22 は duplicate を `showMsg('warn')` で出している。これを `console.warn` 経由 + kind 系の `duplicate_name` 化する経路の設計
7. **HELPER-EXPAND をどの callsite から始めるか** — A-5.1 系優先か MASTER-001 系優先か。callsite 数 / 影響範囲 / テスト容易性で判断
8. **AGGREGATION-IMPL の対象を S03 / S05 / S22 のみにするか、EXPAND 後の callsite も含めるか** — EXPAND と IMPL の境界線

---

## 13. レビュー観点

Codex / cowork に独立レビューしてもらう観点:

1. **三層分離原則が中核として記述されているか** — §2 が設計書の早い位置に独立セクションで配置されているか
2. **duplicate vs verify failure 優先順位が verify 優先で記述されているか** — §3
3. **indicator count が発生単位維持と明記されているか** — §7、PR #68 設計との整合
4. **`showMsg` は aggregation 対象、`console.warn` と indicator count は抑制しない方針になっているか** — §2.3
5. **kind 候補が初期 / 後続 / 検討中で区別されているか** — §4.1
6. **severity を導入しない理由が明記されているか** — §5
7. **aggregation key が `kind + callsiteId` 初期方針か** — §6.1
8. **entityId / field / message などを初期採用しない理由があるか** — §6.4
9. **`notifySaveWarning` schema が今回変更されないと明記されているか** — §8.4
10. **`kind` / `aggregateKey` は後続候補に留まっているか** — §8.2
11. **Level 3 / 4 への踏み込みがないか** — §9.2 / §10
12. **実装は後続タスクとする旨が明記されているか** — §1.2 / §9
13. **後続タスク順序が妥当か** — §11.1
14. **HELPER-EXPAND が AGGREGATION-IMPL の前に置かれている理由が書かれているか** — §11.2
15. **docs-only scope が守られているか** — `shogi_v4.html` / test / workflow / package 系 / 既存 SAVE-UX 関連 docs に変更がないか

---

## 14. 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-13 | v0 作成。SAVE-UX-WARN-AGGREGATION docs-only design。三層分離原則 / duplicate vs verify failure 優先順位 / kind 分類 / aggregation key / indicator count policy / `notifySaveWarning` schema 拡張候補 / 後続タスク順序 を整理。実装は SAVE-UX-WARN-AGGREGATION-IMPL（および前提の SAVE-UX-WARN-HELPER-EXPAND）で別タスク。 |
| 2026-05-14 | v1 追補 (SAVE-UX-AGGREGATION-DOCS-FOLLOWUP)。§15 を追加し、PR #70 〜 #76 で main へ反映された確定挙動を記載: helper 経由化 15/15 完了、`kind` / `aggregateKey` / `severity` metadata 土台、`save-verify:{core/entry/edit/past/pairing}` の Group 対応、`showMsg` 3000ms 集約、短縮文言確定、compound 発火例、失敗を隠さない原則、対象外カテゴリと将来方針、次タスク候補。 |
| 2026-05-14 | v1.1 追補 (SAVE-UX-QUOTA-HANDLING-INVENTORY)。§16 を追加し、`kind` / `aggregateKey` の hyphen-case 統一方針を明文化。v0 §4 / §6 / §8 / §11 / §12 で登場した snake_case 候補（`verify_failed` / `quota_exceeded` / `parse_failed` / `duplicate_name` / `storage_corrupted`）を初期検討段階の候補と位置づけ、今後の実装では採用しない方針を確定。将来 `kind` 候補の hyphen-case 対応表（`storage-quota` / `parse-failed` / `duplicate-name` / `storage-corrupted` / `master-verify`）を整理。inventory docs (`docs/notes/20260514_shogi_save_ux_quota_inventory.md`) へのリンクを追加。 |

---

## 15. 実装到達点 (PR #70 〜 #76)

本書 v0 (2026-05-13) は docs-only design として作成された。その後、以下の実装 PR が main へ反映され、設計の主要部が確定挙動として動作している。本セクションは「設計書を後から読む人」が現状コードに即して理解できるようにするための追補（v1 追補）。

### 15.1 完了済 PR と到達点

| PR | 内容 | 反映先 |
|---|---|---|
| #70 | Group A + B 6 件 helper 経由化（startTournament / generatePairing / setWinner / submitRound / addPlayer / removePlayer） | `notifySaveWarning` 呼出 |
| #73 | Group C + E 5 件 helper 経由化（updateField / bulkEditNames / bindChangePairingModalEvents / bindEditPastResult p1 / p2） | 同上 |
| #74 | Group D 4 件 helper 経由化（handlePastParticipantClassAdd add / class change / handleSuggestClassAdd postSuccess / finalizeAddPastParticipants verify-fail warn） | 同上 |
| #75 | `notifySaveWarning` schema 拡張: 任意 metadata `{ kind, aggregateKey, severity }` を後方互換で追加。A-5.1 SAVE 系 15 件すべてに metadata 付与 | helper 内部 + 15 callsite |
| #76 | 同一 `aggregateKey` の保存警告が **3000ms 未満** に連続発火した場合、2 回目以降の user-facing `showMsg` を短縮文言に切替（`console.warn` / indicator count は不変） | helper 内部のみ |

これにより、A-5.1 SAVE 系 15/15 callsite について以下が完了:

- `notifySaveWarning` helper 経由化
- `kind` / `aggregateKey` / `severity` metadata 付与
- `showMsg` 最小 aggregation 表示
- `console.warn` 個別維持
- indicator count 発生単位 +1 維持

### 15.2 `kind` / `aggregateKey` / `severity` の現時点仕様

#### `kind`

- 現時点では A-5.1 SAVE 系 15 件すべてに **`'save-verify'`** を使用
- MASTER-V2-LASTCLASS (S03 / S05 / S22) / MASTER-001 / quota / parse / duplicate / import / migration / S30 は **現時点では対象外**（kind 未付与）
- 将来は別 kind 体系（`master-verify` / `quota-exceeded` / `parse-failed` 等の候補）で整理する。本書 §4.1 の予約値リストは将来候補のメモであり、実装上の制約は持たない

#### `severity`

- 現時点では **`'warn'`** のみ
- helper 内で severity による表示分岐は **実装しない**（本書 §5 の方針を維持）
- `info` / `error` 拡張時は CSS / 色 / アイコン分岐の設計が別タスク

#### `aggregateKey`

- **Group 単位** で付与（callsite 単位ではない）
- 形式: `save-verify:<group>`（kebab-case / 小文字 / `:` 区切り / 2 階層）
- **kind 単位ではなく `aggregateKey` 単位で集約**する（kind が同じでも Group が異なれば独立）

### 15.3 Group A〜E と `aggregateKey` 対応表（確定）

| Group | 内容 | aggregateKey | 件数 | 含まれる callsite (`callsiteId`) |
|---|---|---|---|---|
| A | 大会進行 core | `save-verify:core` | 4 | `SAVE-003-startTournament` / `SAVE-004-generatePairing` / `SAVE-003-setWinner` / `SAVE-003-submitRound` |
| B | 登録欄 add/remove | `save-verify:entry` | 2 | `SAVE-002-addPlayer` / `SAVE-001-removePlayer` |
| C | 登録欄 編集 | `save-verify:edit` | 2 | `SAVE-003b-updateField` / `SAVE-003b-bulkEditNames` |
| D | 過去参加者経路 | `save-verify:past` | 4 | `SAVE-003b-handlePastParticipantClassAdd-class-change` / `-add` / `SAVE-003b-handleSuggestClassAdd` / `SAVE-003b-finalizeAddPastParticipants` |
| E | 対局画面 編集 | `save-verify:pairing` | 3 | `SAVE-003b-bindChangePairingModalEvents` / `SAVE-003b-bindEditPastResultModalEvents-p1` / `-p2` |
| **計** | | | **15** | |

### 15.4 `showMsg` aggregation 仕様（確定）

#### 対象条件

helper 内で以下を **AND** で判定:

- `kind === 'save-verify'`
- `severity === 'warn'`
- `aggregateKey` が truthy

いずれか欠けると aggregation 対象外（legacy path = 元 message を表示）。

#### 集約単位

- **`aggregateKey` 単位**（kind 単位ではない）

#### time window

- **3000ms**（定数化: `SAVE_WARN_AGGREGATION_WINDOW_MS`）

#### 判定

- `(now - last) < 3000` → aggregation（短縮文言）
- `(now - last) >= 3000` → リセット（元 message）
- **ちょうど 3000ms はリセット側**（`< 3000` のみ集約）

#### 1 回目

- 元の `message` を `showMsg(message, 'warn')`

#### 2 回目以降（同一 `aggregateKey` で 3000ms 未満）

- 短縮文言を `showMsg(SAVE_WARN_AGGREGATED_MESSAGE, 'warn')`

#### 短縮文言（確定）

```
保存確認に失敗した操作が複数あります。内容を確認してください。
```

定数化: `SAVE_WARN_AGGREGATED_MESSAGE`

#### `showMsg` type

- **常に `'warn'`** を維持（短縮時も）。severity による表示分岐なし

#### aggregation state

- **memory only / module scope**
- `localStorage` / `sessionStorage` / tournament state には **保存しない**
- reload で消えるのは意図的
- 別タブ・別ウィンドウとは共有しない

実装上の構造:

```js
var saveWarningAggregationState = { lastTimestampByKey: {} };
```

テスト用 reset 関数 `_resetSaveWarningAggregationState()` あり。本番 UI からは呼ばない。

### 15.5 3000ms の根拠と調整余地

3000ms は **初期値**。次の観点から決定:

- **1000ms 程度** では連続操作や compound 発火の吸収には短すぎる可能性
- **5000ms 以上** では別操作の保存警告まで巻き込みやすくなる

→ 初期値として 3000ms を採用。

ただし、当日運営で短すぎる / 長すぎると感じた場合は、後続 PR (`SAVE-UX-AGGREGATION-TUNING` 候補) で調整する。定数 1 箇所の変更で対応可能。

### 15.6 compound 発火例（重要論点）

PR #76 のレビューで重要論点になったため明記:

#### 例: startTournament

```
(1) startTournament 呼出
    ↓
(2) 内部で generatePairing('A') 呼出
    ↓
(3) generatePairing の verify 失敗
    → notifySaveWarning (callsiteId: SAVE-004-generatePairing, aggregateKey: save-verify:core)
    → showMsg("組み合わせを生成しましたが、保存が確認できませんでした...", 'warn')  [1 回目: 元 message]
    → console.warn 個別出力 + indicator count +1
    ↓
(4) startTournament 側の save() 後 verify 失敗
    → notifySaveWarning (callsiteId: SAVE-003-startTournament, aggregateKey: save-verify:core)
    → 同一 aggregateKey で数ミリ秒後 → 3000ms 未満 → 短縮文言に切替
    → showMsg("保存確認に失敗した操作が複数あります。内容を確認してください。", 'warn')  [2 回目: 短縮]
    → console.warn 個別出力 + indicator count +1
```

この場合 user の最終可視 `showMsg` は短縮文言。これは **意図された aggregation 挙動** であり、保存確認失敗を隠していない:

- `console.warn` は両方個別に出る（debug 詳細層）
- indicator count も両方 +1 される（発生単位の事実を残す）
- 短縮文言自体が「保存確認に失敗した操作が **複数あります**」と明示

### 15.7 「失敗を隠さない」原則（確定）

aggregation は警告を消すための仕組みでは **ない**。失敗を隠さないために以下を維持する:

- `showMsg` は短縮時も **必ず出す**（完全抑制しない）
- 短縮文言にも「保存確認に失敗」を含める
- `console.warn` は **全件個別** に出す（集約しない）
- indicator count は保存警告 1 回につき **+1**（集約しない）
- 保存処理 / verify helper / storage 構造は変更しない

### 15.8 対象外カテゴリと将来方針

現時点で aggregation 対象外（`save-verify` metadata 未付与）:

| カテゴリ | 現状 |
|---|---|
| MASTER-V2-LASTCLASS S03 / S05 / S22 | 既存 helper 経由化済（PR #65 / #66）。`save-verify` aggregation には混ぜない |
| MASTER-001 系 | helper 未経由のまま（応急処置 warn 文言で残存） |
| quota | 未着手 |
| parse | 未着手 |
| duplicate | 既存 `showMsg('warn')` 直接呼出（duplicate name 検知系） |
| import / merge / migration | 未着手 |
| S30 batch verify | 未着手 |
| ふりがな success-with-caveat 通知 | `finalizeAddPastParticipants` line 1895 の `showMsg('ふりがな未登録のまま N名を追加しました...', 'warn')` 直接呼出。**helper 経由ではない** ため aggregation 条件に構造的に到達しない |

将来方針:

これらは A-5.1 SAVE 系 15 件とは **意味論が異なる** ため、`save-verify` の aggregation には混ぜない。将来必要になった場合は、別 kind / severity / aggregateKey 体系として整理する。

将来候補例（実装方針は確定しすぎない、設計時に再判断）:

- MASTER-V2-LASTCLASS は `master-verify` 系
- quota は `quota-exceeded` 系
- parse は `parse-failed` 系
- duplicate は `duplicate-name` 系
- ふりがな success-with-caveat は warn ではなく `info` / `caveat` 系の候補

### 15.9 次タスク候補（再整理）

実装フェーズ移行後の候補:

| # | タスク ID 候補 | 概要 |
|---|---|---|
| 1 | `SAVE-UX-QUOTA-HANDLING` | quota exceeded 系を別 kind 体系として整理する |
| 2 | `SAVE-UX-MASTER-V2-METADATA` | MASTER-V2-LASTCLASS S03/S05/S22 を別 kind 体系で metadata 化するか検討する |
| 3 | `SAVE-UX-AGGREGATION-TUNING` | 3000ms window や短縮文言を運用感覚で調整する |
| 4 | `SAVE-UX-LEVEL-3-WARNING-BAR` | `showMsg` / indicator より一段強い警告 UI を検討する |
| 5 | `SAVE-UX-INDICATOR-DETAIL` | indicator 詳細展開や Group 別表示を検討する |

本書 §11.1 の旧優先順序（HELPER-EXPAND → HELPER-EXPAND-2 → AGGREGATION-IMPL → ...）は PR #70 〜 #76 でほぼ完了したため、本セクションが現時点の最新優先順となる。

---

## 16. `kind` / `aggregateKey` 命名規則 — hyphen-case 統一（v1.1 追補）

### 16.1 統一方針

`kind` と `aggregateKey` は **hyphen-case（kebab-case）に統一** する。

既存実装（PR #75 / #76）で確定している例:

- `kind: 'save-verify'`
- `aggregateKey: 'save-verify:core'`
- `aggregateKey: 'save-verify:entry'`
- `aggregateKey: 'save-verify:edit'`
- `aggregateKey: 'save-verify:past'`
- `aggregateKey: 'save-verify:pairing'`

形式仕様:

- 小文字のみ
- 単語区切りは `-`（hyphen）
- 階層区切りは `:`（colon、最大 2 階層）
- 大文字混在禁止、`_` 区切り禁止、`/` 区切り禁止、`.` 区切り禁止

### 16.2 snake_case 旧案の扱い

本書 v0 の §4 / §6 / §8 / §11 / §12 では、初期検討段階で snake_case 候補が登場していた:

- `verify_failed`
- `duplicate_name`
- `quota_exceeded`
- `parse_failed`
- `storage_corrupted`

これらは **初期検討段階の候補** として扱い、**今後の実装では採用しない**。既存 `save-verify` 系との一貫性を優先する。

### 16.3 今後の `kind` 候補（hyphen-case）

将来検討予定の `kind` 候補（実装方針は確定しすぎず、各タスク着手時に再判断）:

| 旧案 (snake_case) | 新方針 (hyphen-case) | 想定タスク |
|---|---|---|
| `verify_failed` | `save-verify`（既存実装で確定） | 完了（PR #75 / #76） |
| `quota_exceeded` | `storage-quota` | `SAVE-UX-QUOTA-HANDLING-IMPL`（Step 2） |
| `parse_failed` | `parse-failed` | `SAVE-UX-PARSE-HANDLING`（候補） |
| `duplicate_name` | `duplicate-name` | `SAVE-UX-DUPLICATE-HANDLING`（候補） |
| `storage_corrupted` | `storage-corrupted` | `SAVE-UX-CORRUPT-HANDLING`（候補） |
| — | `master-verify` | `SAVE-UX-MASTER-V2-METADATA`（候補、MASTER-V2-LASTCLASS S03/S05/S22 用） |

### 16.4 関連 inventory docs

- **`docs/notes/20260514_shogi_save_ux_quota_inventory.md`**: SAVE-UX-QUOTA-HANDLING-INVENTORY (docs-only)。`storage-quota` 系の callsite 棚卸しと Step 2 着手前の再仕様確認事項を整理。本書 §16.3 と整合した命名規則（`storage-quota` / `storage-quota:global`）を採用。
