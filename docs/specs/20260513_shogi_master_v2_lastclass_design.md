# MASTER-V2-LASTCLASS 設計書（本文案 v2）

## 1. タスク概要

会員マスタ（`shogi_branch_master` / `schema_version = 1`）の `last_class` および周辺フィールド更新経路に対し、A-5.1 保存安全化と同じ考え方で、保存後 re-read verify を追加する。

新規 schema 追加や履歴構造の導入はしない。本タスクは「既に存在する更新経路が、`saveBranchMaster` 後に確実に localStorage へ永続化されたことを検証する」ことに範囲を限定する。

Task ID：`MASTER-V2-LASTCLASS`

前提コミット：

- `main` HEAD = `7fa1022361fca6c2ef4c09652c55d8d7798f6e39`
- PR #59 squash
- A-5.1-CLOSURE

関連既存基盤：

- `verifyStatePersisted`
- `verifyPlayerFieldPersisted`
- `verifyMasterPersisted`

これらは A-5.1 系列で導入された保存後 re-read verify helper である。

---

## 2. read-only 調査で判明した現状

会員マスタの状態は、当初の設計想定である「前回参加クラスをこれから持たせる」という前提とは異なっていた。

read-only 調査で以下が確認された。

### 2.1 localStorage key / schema

- localStorage key：`shogi_branch_master`
- `schema_version`：`1`

### 2.2 member の現行フィールド

会員マスタ側の member は、normalize 後に以下のフィールドを持つ。

- `id`
- `name`
- `yomi`
- `last_class`
- `last_attended`
- `first_attended`
- `attendance_count`
- `tournament_ids`
- `deleted`
- `deleted_at`
- `note`
- `member`
- `grade`
- `city`

補足：

- 会員マスタ側の主キーは `id`
- 参加者レコード側では `player.member_id` に master member の `id` を保持する
- `kana` ではなく `yomi` が使われている
- master member 側に `member_id` は持たない

### 2.3 last_class の現状

`last_class` は既に存在する。

- 許容値：`'A' | 'B' | null`
- normalize 時に `A/B/null` の三値へ正規化される
- 不正値は `null` へ正規化される
- したがって、`last_class` の新規追加は不要である

### 2.4 受付フローでの利用状況

受付サジェスト選択時、`member.last_class` が `inp-class` に初期反映されている。

また、過去参加者パネルには「前回:Xクラス」表示が既に存在する。

つまり、前回参加クラスの表示・初期値利用は既に実装済みである。

### 2.5 大会データ保存時の書き戻し

大会データ保存時には、以下の経路で会員マスタへ書き戻しが行われている。

`syncBranchMasterOnSave()`  
→ `updateBranchMasterFromTournament()`  
→ `saveBranchMaster(master)`

この経路で以下が更新される。

- `last_class`
- `last_attended`
- `first_attended`
- `attendance_count`
- `tournament_ids`
- `member`
- `grade`
- 必要に応じて `yomi`

したがって、大会終了時相当の `last_class` 書き戻しも既に存在する。

ただし、「大会終了」という明示的イベントではなく、現状ではユーザの「大会データコピー」操作、またはそれに連動する保存処理が実質的なトリガーである。

### 2.6 結論

以下はいずれも不要である。

- `last_class` の新規追加
- `last_participation` オブジェクトの追加
- `schema_version` の bump
- 参加履歴構造の新設

本タスクの実態は、既存の `last_class` 更新経路に対する保存後 re-read verify の追加である。

---

## 3. スコープ再定義

当初想定の「前回参加クラスを会員マスタに持たせる」は、実コード上では既に実装済みである。

そのため、本タスクの真のスコープを以下に再定義する。

### 3.1 新スコープ

会員マスタ更新経路の保存後 re-read verify 追加。

対象は、既存 `last_class` 更新経路、および S22 で扱う複数フィールドである。

### 3.2 手段

A-5.1 系列と整合する形で、新たに `verifyMasterFieldPersisted` 系 helper を導入する。

この helper は、既存 `verifyMasterPersisted` の field 汎用版として位置づける。

### 3.3 出力

保存失敗時は callsite 側で `console.warn` により記録する。

UI 変更は最小限に留める。

### 3.4 非対象

以下は本タスクの対象外である。

- schema 変更
- 構造拡張
- import / merge / migration
- retry UI
- warn 集約 UI
- 連続失敗バナー
- SAVE-UX / SAVE-FUTURE-REPORT / SAVE-FUTURE-IMPORT 系

---

## 4. 非目標

以下は本タスクで取り扱わない。

- `last_class` の新規追加
- `last_participation` オブジェクトの追加
- `schema_version` の bump
- `normalizeBranchMaster` の whitelist 変更
- import / merge / migration 系
- SAVE-UX 系
- SAVE-FUTURE-REPORT 系
- SAVE-FUTURE-IMPORT 系
- retry UI
- warn 集約 UI
- 連続失敗バナー
- debounce / throttle
- workflow 変更
- `package.json` / `package-lock.json` 変更
- `npm install`
- `npm update`
- `npm audit fix`

---

## 5. 対象 callsite

read-only 調査で抽出された会員マスタ更新 callsite のうち、本 PR で対応する範囲を以下に定める。

### 5.1 Must（今回 PR）

| ID | callsite | 更新フィールド | 備考 |
|---|---|---|---|
| S03 | `handlePastParticipantClassAdd` | `last_class` | 過去参加者パネルからのクラス確定経路 |
| S05 | `handleSuggestClassAdd` | `last_class` | 受付サジェスト選択経由のクラス確定経路 |
| S22 | 会員マスタ編集モーダル保存 | `last_class` / `member` / `grade` / `city` | 編集モーダルの保存ボタン押下経路 |

### 5.2 Should（今回 PR の外、別 PR）

| ID | callsite | 理由 |
|---|---|---|
| S23 | master delete | 削除系は verify 観点が異なる。存在しないことの確認、retry、UX 議論と絡むため分離 |
| S24 | master restore | restore は元データ整合性チェックが先行課題。verify 設計のみでは足りない |
| S30 | `syncBranchMasterOnSave` の 2 段保存 | 複数 member 一括の batch verify が必要。Must の単一 member verify とは別設計 |

### 5.3 Defer（保留）

| ID | callsite | 理由 |
|---|---|---|
| S25〜S29 | import / merge / migration 系 | SAVE-FUTURE-IMPORT 配下で別タスク化。schema 整合性が前提条件として未確定 |
| その他 batch verify | — | warn 集約 UI / 連続失敗 UX と一体設計が必要。SAVE-UX-DESIGN 待ち |

### 5.4 S22 のフィールド範囲の決定根拠

S22（会員マスタ編集モーダル）は、`last_class` 以外に `member` / `grade` / `city` 等も同時に更新する。

本 PR では、`last_class` / `member` / `grade` / `city` の 4 フィールドを verify 対象に含める。

理由：

S22 では `last_class` 単体ではなく、同一保存操作で同時更新される `member` / `grade` / `city` も verify 対象に含める。これは `MASTER-V2-LASTCLASS` の主眼を逸脱するものではなく、「`last_class` を含む会員マスタ編集保存が部分的に永続化失敗していないか」を確認するための最小拡張である。

`last_class` のみ verify する案も検討したが、編集モーダルは一括書き込み経路である。一部 field のみ verify すると「`last_class` は安全、他は未検証」という非対称が残り、技術的負債化しやすい。

一方、全フィールドを member 全体一致 helper で verify する案は、helper 設計自体の拡張が必要となり、本タスクのスコープを超えるため採用しない。

---

## 6. helper 設計

### 6.1 既存 helper の正確な位置づけ

A-5.1 で導入済みの helper は以下のとおり。

| helper | 対象 | 粒度 |
|---|---|---|
| `verifyStatePersisted` | state 全体 | 全体一致 |
| `verifyPlayerFieldPersisted` | player の特定 field | field 単位 |
| `verifyMasterPersisted` | master member の name 永続化確認 | name 専用（memberId + expectedName） |

`verifyMasterPersisted` は master 全体一致 helper ではない。  
`memberId + expectedName` を軸にして、master member の name 永続化を確認する name 専用 helper である。

### 6.2 新 helper の位置づけ

`verifyMasterFieldPersisted` は、`verifyMasterPersisted` の field 汎用版である。

name 専用ではなく、`last_class` / `member` / `grade` / `city` など任意の許可フィールドを検証する。

### 6.3 シグネチャ


```javascript
verifyMasterFieldPersisted(memberId, field, expected) -> boolean
```



### 6.4 引数

#### memberId

`string`。必須。空文字は `false`。

参加者レコード側の `player.member_id` に格納される値である。実体としては master member の `id`。

helper 内では `members[].id` と照合する。

#### field

`string`。必須。helper 内 whitelist に含まれるキーのみ許可する。

#### expected

field により型が異なる。

`last_class` は以下を許容する。

- `'A'`
- `'B'`
- `null`

### 6.5 戻り値

`true`：

- persisted 値が expected と一致

`false`：

以下のいずれかが成立した場合。

- `localStorage.getItem(BRANCH_MASTER_KEY)` が `null`
- `JSON.parse` 失敗
- `schema_version` が想定外
- `members` 配列が不正
- `memberId` 一致 member が見つからない
- field の persisted 値が expected と一致しない
- 例外発生

### 6.6 内部処理

1. `localStorage.getItem(BRANCH_MASTER_KEY)` を取得する
2. `null` なら `false`
3. `JSON.parse` を `try/catch` で実行する
4. `schema_version === 1` を確認する
5. `members` が Array であることを確認する
6. `members.find(m => m.id === memberId)` で member を取得する
7. member 不在なら `false`
8. `member[field]` と `expected` を比較する
9. `last_class` は `null` 同士 / `'A'` 同士 / `'B'` 同士で `true`、それ以外で `false`
10. `member` / `grade` / `city` 等の文字列フィールドは厳密一致
11. 一致なら `true`、不一致なら `false`
12. `catch` では `false` を返す
13. helper 内では `console.warn` しない
14. warn は callsite 側で一元的に出す

### 6.7 直接検証方針

`verifyMasterFieldPersisted` は `normalizeBranchMaster` を通さず、localStorage 上の persisted raw JSON を直接検証する。

理由：

保存後 re-read verify の目的は「保存された実データが期待値と一致するか」を確認することであり、normalize による補正後の値を確認することではないため。

normalize を通すと、「保存されていない値でも normalize で補完されて一致してしまう」というケースを見逃す可能性がある。

### 6.8 whitelist

helper 自体に許容 field の whitelist を持たせる。想定外 field 指定時は `false` を返す。

今回 PR では以下を許可する。


```javascript
ALLOWED_FIELDS = ['last_class', 'member', 'grade', 'city']
```



helper の `ALLOWED_FIELDS` は verify 対象フィールドの whitelist であり、`normalizeBranchMaster` の schema whitelist とは目的が異なる。

本 PR では `normalizeBranchMaster` の whitelist は変更しない。

### 6.9 catch / warn 方針

helper 内の `catch` では `false` を返すのみとする。

helper 内では `console.warn` しない。

warn は S03 / S05 / S22 など callsite 側で一元的に出す。

理由：

- callsite 側が S03 / S05 / S22 の文脈を持っているため、適切なタグ付き warn を出せる
- helper 内で warn すると、helper warn + callsite warn の二重ログになりやすい
- A-5.1 の callsite 単位の通知方針とも、callsite 側 warn の方が整合する

### 6.10 命名代替案の検討

| 案 | 評価 |
|---|---|
| `verifyMasterFieldPersisted` | 単一 field 検証であることが明確。A-5.1 の `verifyPlayerFieldPersisted` と命名対称。推奨 |
| `verifyMasterMemberFieldPersisted` | より厳密だが冗長。可読性で劣る |
| `assertMasterFieldPersisted` | 失敗時に throw を期待される名前で、現方針（false 返却）と不整合 |
| `checkMasterFieldPersisted` | 戻り値の意味が曖昧。verify 系統との一貫性に劣る |

結論：

`verifyMasterFieldPersisted` を採用する。

### 6.11 A-5.1 helper との整合

| helper | 対象 | 粒度 |
|---|---|---|
| `verifyStatePersisted` | state 全体 | 全体一致 |
| `verifyPlayerFieldPersisted` | player の特定 field | field 単位 |
| `verifyMasterPersisted`（既存） | master member の name | name 専用 field 単位 |
| `verifyMasterFieldPersisted`（新規） | master member の任意の許可 field | 汎用 field 単位 |

新 helper は、既存 `verifyMasterPersisted` の field 汎用版として位置づける。

S30 の batch 検証では、`verifyMasterFieldPersisted` を複数 member に対して呼ぶ拡張版が必要になる可能性がある。ただし、本 PR では Should として後送りする。

---

## 7. callsite 別の実装方針

### 7.1 S03：handlePastParticipantClassAdd

既存保存処理の直後に以下を追加する。


```javascript
const ok = verifyMasterFieldPersisted(memberId, 'last_class', expectedClass);
if (!ok) {
  console.warn('[MASTER-V2-LASTCLASS] S03 last_class verify failed', {
    memberId,
    expected: expectedClass
  });
}
```



方針：

- rollback しない
- alert しない
- retry しない
- 既存の処理フローと UI 表示は変更しない
- warn のみ

### 7.2 S05：handleSuggestClassAdd

S03 と同じパターンとする。

warn のタグは S05 にする。


```javascript
const ok = verifyMasterFieldPersisted(memberId, 'last_class', expectedClass);
if (!ok) {
  console.warn('[MASTER-V2-LASTCLASS] S05 last_class verify failed', {
    memberId,
    expected: expectedClass
  });
}
```



### 7.3 S22：会員マスタ編集モーダル保存

保存処理の直後に、以下の 4 フィールドを検証する。

- `last_class`
- `member`
- `grade`
- `city`

実装イメージ：


```javascript
const checks = [
  ['last_class', expected.last_class],
  ['member', expected.member],
  ['grade', expected.grade],
  ['city', expected.city],
];

for (const [field, exp] of checks) {
  const ok = verifyMasterFieldPersisted(memberId, field, exp);
  if (!ok) {
    console.warn('[MASTER-V2-LASTCLASS] S22 verify failed', {
      memberId,
      field,
      expected: exp
    });
  }
}
```



方針：

- field ごとに warn を分ける
- どの field が失敗したかを後追い可能にする
- 1 回の保存で複数 warn が出る可能性は許容する
- SAVE-UX-DESIGN で集約方針が決まるまでは、この粒度を維持する
- rollback しない
- retry しない
- alert しない

---

## 8. テスト方針

### 8.1 新規テストファイル vs 既存テストファイル追記の比較

| 案 | メリット | デメリット |
|---|---|---|
| 新規 `test/test_master_v2_lastclass.js` | タスク単位で凝集。MASTER-V2-LASTCLASS の責務が明確 | テストファイル数が増える |
| 既存 `test/test_branch_master.js` に追記 | master 関連テストの所在が一元化 | 既存テストとの責務境界が曖昧化。diff レビューが重くなる |
| 既存 `test/test_master_001.js` に追記 | 命名上は master 系の連番に乗る | A-5.1 系列テストとの責務混在を招く |

推奨：

新規 `test/test_master_v2_lastclass.js` を作成する。

理由：

- 本タスクは A-5.1 系列の独立した拡張である
- 独立ファイル化することで MASTER-V2 系列の後続タスクでも一貫した命名にできる
- diff レビュー時に対象が明確になる
- 既存テスト一式への影響を最小化できる

### 8.2 helper 単体テスト

最低限、以下を確認する。

1. 正常系：`last_class = 'A'` が persisted と一致 → `true`
2. 正常系：`last_class = 'B'` が persisted と一致 → `true`
3. 正常系：`last_class = null` が persisted と一致 → `true`
4. 異常系：`last_class = 'A'` だが persisted が `'B'` → `false`
5. 異常系：`last_class = 'A'` だが persisted が `null` → `false`
6. 異常系：memberId 不在 → `false`
7. 異常系：localStorage 値が `null` → `false`
8. 異常系：JSON 不正（例：`"not-json"`） → `false`
9. 異常系：`schema_version` が想定外（例：`2`） → `false`
10. 異常系：`members` が配列でない → `false`
11. 異常系：whitelist 外 field 指定 → `false`
12. 正常系：`member` / `grade` / `city` フィールドの一致確認
13. 異常系：helper 内 catch 経路で `console.warn` が出ないこと

### 8.3 callsite 統合テスト

最低限、以下を確認する。

1. S03：保存成功時に warn が出ないこと
2. S03：localStorage が壊れた状態で保存後 verify が `false` を返し、callsite で warn が出ること
3. S05：保存成功時に warn が出ないこと
4. S05：localStorage が壊れた状態で保存後 verify が `false` を返し、callsite で warn が出ること
5. S22：4 フィールドそれぞれの verify が呼ばれること
6. S22：1 フィールドだけ不一致のとき、その field の warn のみ出ること

### 8.4 回帰

既存テスト一式が green を維持すること。

---

## 9. リスク・注意点

### R1：warn が多数出る運用

S22 で 4 fields × 失敗時に最大 4 件 warn が出る。

本タスクでは許容するが、SAVE-UX-DESIGN で集約方針を必ず決める。

### R2：例外情報のロスト

helper 内で catch して `false` 返却するのみで warn しない方針のため、デバッグ情報を失う懸念がある。

これは callsite 側 warn のメタ情報で代替する。

callsite 側 warn では、少なくとも以下を出す。

- `memberId`
- `field`
- `expected`
- callsite tag（S03 / S05 / S22）

### R3：last_class の null 比較

`null === null` は `true`、`undefined === null` は `false`。

normalize 後の値が `null` か `undefined` かを実コードで再確認した上で比較ロジックを書く。

### R4：whitelist の二重管理

helper の `ALLOWED_FIELDS` と `normalizeBranchMaster` の whitelist は目的が異なるため二重管理になる。

コメントで両者の責務差と「`normalizeBranchMaster` を不用意に変えない」旨を明記する。

### R5：A-5.1 helper との命名混乱

`verifyMasterPersisted`（既存・name 専用）と `verifyMasterFieldPersisted`（新規・field 汎用）の使い分けに注意する。

コード上のコメントで責務差を明記する。

### R6：syncBranchMasterOnSave との関係

S30 は今回 Must から外したが、S03 / S05 / S22 で verify を入れた後、S30 でも同様の verify が必要という議論が起きる可能性が高い。

Should として明示しておく。

### R7：テスト用 localStorage モック

既存テスト基盤で localStorage モックがどう用意されているか確認した上でテスト記述する。

新規モック導入はしない。

### R8：member 主キーの混同

master 側は `id`、参加者レコード側は `player.member_id`。

helper の引数 `memberId` は「参加者側で持っている `player.member_id` の値（= master の `id`）」であり、helper 内では `members[].id` と照合する。

callsite で誤って別キーを渡さないこと。

### R9：raw JSON 直接検証の盲点

normalize を通さないことで、persisted 値が normalize 前提のままになっているケースを検知できる利点がある。

一方、normalize 結果と raw 値が乖離するスキーマ移行期には注意が必要である。

`schema_version = 1` を前提とする本 PR では問題ないが、将来の bump 時に再検討する。

---

## 10. Must / Should / Defer 分類

### 10.1 Must（今回 PR）

- M1：`verifyMasterFieldPersisted` helper の新規実装
  - catch で `false` 返却
  - helper 内 warn なし
  - raw JSON 直接検証
- M2：whitelist `['last_class', 'member', 'grade', 'city']` を helper 内で管理
- M3：S03 callsite に verify + 失敗時 callsite warn 追加
- M4：S05 callsite に verify + 失敗時 callsite warn 追加
- M5：S22 callsite に 4 fields verify + 失敗時 field 別 callsite warn 追加
- M6：新規 `test/test_master_v2_lastclass.js` 作成
- M7：既存テスト一式 green 維持
- M8：`docs/specs/20260513_shogi_master_v2_lastclass_design.md` を本設計書本文で作成

### 10.2 Should（別 PR）

- S-Sh1：S23 master delete の verify（存在しないことの確認）
- S-Sh2：S24 master restore の verify（restore 後の整合性確認）
- S-Sh3：S30 `syncBranchMasterOnSave` の 2 段保存 batch verify
- S-Sh4：warn 集約方針（SAVE-UX-DESIGN との合流）

### 10.3 Defer（保留）

- S-Df1：S25〜S29 import / merge / migration 系
- S-Df2：retry UI / 連続失敗バナー
- S-Df3：schema bump や `last_participation` 構造化

---

## 11. Claude Code 実装依頼ドラフト


```text
【Claude Code 宛｜MASTER-V2-LASTCLASS-IMPL 実装依頼】

Project：
SHOGI-TOUR｜将棋大会運営アプリ

Repo：
kazuo1970takahashi-sketch/shogi

Base：
main（HEAD: 7fa1022 squash of PR #59, A-5.1-CLOSURE）

Branch：
feature/master-v2-lastclass

Task ID：
MASTER-V2-LASTCLASS-IMPL

参照設計書：
docs/specs/20260513_shogi_master_v2_lastclass_design.md

目的：
会員マスタ更新経路（S03 / S05 / S22）に対し、A-5.1 と整合する形で保存後 re-read verify を追加する。

前提：
- master 側主キーは id
- 参加者レコード側は player.member_id に master の id を保持
- schema_version = 1
- last_class は 'A' | 'B' | null

スコープ（Must のみ）：

1. verifyMasterFieldPersisted helper の新規実装
   - 引数：memberId, field, expected
   - 戻り値：boolean
   - whitelist：['last_class', 'member', 'grade', 'city']
   - last_class の null 許容
   - schema_version=1 を期待
   - member 検索キーは members[].id === memberId
   - normalizeBranchMaster を通さず raw JSON を直接検証する
   - JSON 不正 / member 不在 / schema 不正 / field 不一致 → false
   - 例外は catch して false を返す
   - helper 内では console.warn しない

2. S03（handlePastParticipantClassAdd）
   - 既存保存処理の直後に verifyMasterFieldPersisted で last_class を検証
   - false の場合 callsite 側で console.warn('[MASTER-V2-LASTCLASS] S03 last_class verify failed', { memberId, expected })
   - rollback / alert / retry なし

3. S05（handleSuggestClassAdd）
   - S03 と同パターン
   - warn タグは S05
   - rollback / alert / retry なし

4. S22（会員マスタ編集モーダル保存）
   - 4 フィールド（last_class / member / grade / city）それぞれを verify
   - field 別に callsite 側で warn を出す
   - rollback / alert / retry なし

5. 新規テスト：test/test_master_v2_lastclass.js
   - helper 単体テスト
   - callsite 統合テスト（S03 / S05 / S22）
   - helper 内 warn が出ないこと
   - 既存テスト一式 green 維持

禁止事項：
- last_class / last_participation の新規追加禁止
- schema_version の bump 禁止
- normalizeBranchMaster の whitelist 変更禁止
- helper 内での console.warn 禁止
- import / merge / migration / SAVE-UX / SAVE-REPORT / SAVE-IMPORT 系に着手禁止
- retry UI / warn 集約 UI / 連続失敗バナー / debounce / throttle の導入禁止
- workflow / package.json / package-lock.json の変更禁止
- npm install / update / audit fix 禁止
- shogi_v4.html の Must スコープ外領域への変更禁止

成果物：
- feature/master-v2-lastclass ブランチ
- PR 作成まで
- Codex 独立レビュー依頼用サマリ準備

完了条件：
- 全テスト green
- PR 作成完了
- Codex A 判定確認後に別途マージ指示
- マージ指示は本依頼に含めない
```



---

## 12. Codex レビュー依頼ドラフト


```text
【Codex レビュー依頼｜MASTER-V2-LASTCLASS-IMPL】

Project：
SHOGI-TOUR｜将棋大会運営アプリ

Repo：
kazuo1970takahashi-sketch/shogi

Base：
main（HEAD: 7fa1022 squash of PR #59）

対象 PR：
（Claude Code 完了後に番号挿入）

参照設計書：
docs/specs/20260513_shogi_master_v2_lastclass_design.md

レビュー観点：

1. 設計整合
   - A-5.1（verifyStatePersisted / verifyPlayerFieldPersisted / verifyMasterPersisted）と命名・粒度が整合しているか
   - verifyMasterFieldPersisted が verifyMasterPersisted（name 専用）の field 汎用版として正しく位置づけられているか
   - verifyMasterFieldPersisted の whitelist が normalizeBranchMaster と目的上混同されていないか
   - schema_version=1 を前提とした実装が将来の bump 時に問題を起こさないか

2. helper 実装
   - localStorage 読み出しの null / JSON 不正 / schema 不正 / 配列不正の全分岐で false を返すか
   - member 検索キーが members[].id === memberId になっているか
   - normalizeBranchMaster を通さず raw JSON を直接検証しているか
   - 例外時に処理を継続不能にせず、catch 句で false を返す設計になっているか
   - catch 句で false を返し、callsite 側で warn されているか
   - helper 内で console.warn していないこと
   - last_class の null 比較が正しいか
   - undefined と null の混同がないか
   - whitelist 外 field で false を返すか

3. callsite 実装
   - S03 / S05 / S22 で保存処理の直後に verify が呼ばれているか
   - S22 で 4 fields 全てを verify しているか
   - warn のタグが callsite ごとに識別可能か
   - rollback / alert / retry が含まれていないこと

4. テスト
   - 設計書 8 章のテスト観点が網羅されているか
   - helper 内で warn が出ないことのテストが含まれているか
   - localStorage モックが既存パターンを踏襲しているか
   - 既存テスト一式が green を維持しているか

5. 禁止事項違反の有無
   - schema bump していないこと
   - last_class / last_participation を新規追加していないこと
   - normalizeBranchMaster の whitelist を変更していないこと
   - helper 内で console.warn していないこと
   - workflow / package.json / package-lock.json 未変更
   - import / merge / migration / SAVE-UX 系への侵食がないこと

6. 副作用
   - 既存 syncBranchMasterOnSave / updateBranchMasterFromTournament への影響がないこと
   - 既存 UI 表示（過去参加者パネルの「前回:X」等）への影響がないこと

判定基準：
- A：上記全観点クリア。マージ可。
- Conditional：軽微な指摘あり。修正後再レビューでマージ可。
- No Go：設計乖離 / 禁止事項違反 / テスト不足あり。修正必須。

依頼：
上記観点で独立レビューをお願いします。
A 判定確認後、別途マージ指示を出します。
```
