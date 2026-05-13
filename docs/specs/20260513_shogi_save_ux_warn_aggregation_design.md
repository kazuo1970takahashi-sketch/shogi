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
