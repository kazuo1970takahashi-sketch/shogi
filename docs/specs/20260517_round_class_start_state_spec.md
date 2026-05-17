# SHOGI-TOUR｜対局開始状態の可変クラス対応 仕様書（ROUND-CLASS-START-002）

**Task ID**: `ROUND-CLASS-START-002`
**作業種別**: docs-only / 仕様書
**作成日**: 2026-05-17
**HEAD（作成時点の main）**: `2811426`（PR #136 squash merge 後の main = ROUND-CLASS-START-001）
**位置づけ**: `ROUND-CLASS-START-001`（PR #136 / 棚卸し）の **実装前仕様書**。`ROUND-CLASS-START-003`（state schema + helper 実装）着手の前提仕様を確定する。**実装はしない**。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **対象ファイル（参照のみ、本 PR では未変更）**:
  - [shogi_v4.html](../../shogi_v4.html)（6,119 行）
- **前提となる既存設計**:
  - [docs/specs/20260516_shogi_round_class_scope_001.md](20260516_shogi_round_class_scope_001.md)（ROUND-CLASS-SCOPE-001 / PR #134）：scope 全体設計
  - [docs/notes/20260517_round_class_start_state_inventory.md](../notes/20260517_round_class_start_state_inventory.md)（ROUND-CLASS-START-001 / PR #136）：対局開始まわりの棚卸し
- **本 PR の位置**:
  - PR #136 の棚卸し → 本 PR の仕様 → 003 で実装着手、という直線上の中間点
  - 008（旧データマイグレ設計）は本仕様書に **§9 として統合**（PR #136 §8 の「002 に統合する選択肢」を採用）
- **非対象（本 PR では実施しない）**:
  - 実装ファイル変更（`shogi_v4.html` / `index.html` / `data/`）
  - テスト変更（`test/` / `test/e2e/`）
  - snapshot / VRT 変更
  - workflow / package 変更
  - localStorage migration 実装
  - UI DOM 変更
  - Ready 化 / merge / branch 削除

---

## 1. 目的

PR #136 の棚卸し結果を踏まえ、**`ROUND-CLASS-START-003`（state schema + helper 実装）の着手前に決定すべき仕様** を 1 ファイルに集約する。

- `#startBtn` 一括開始の **all-or-nothing 性** を仕様として明文化し、`startTournament()` を sequential mutate wrapper として実装する選択肢を仕様レベルで排除する
- `#startBtn` の **「対象クラス」定義** を確定する（Codex Nice to Have 指摘への回答）
- classId 単位 `started` を正とし、`state.started` は **同期書き込みで互換維持する互換フィールド** であることを仕様として明文化（純 derived ではない）
- 旧データ互換 / `normalizeState` の組立順序と、`normalizeClasses(raw)` / `emptyClassDict(classes, init)` の **helper シグネチャ** を確定
- 後続 003〜006 の入力仕様を凍結する

---

## 2. 背景

### 2.1 棚卸し結果（PR #136 から要点抜粋）

- 主動線上の A/B 固定箇所は **34 行**（行単位の棚卸し件数。inventory §5.0 の定義）。`startTournament` 内 10 / `resetTournamentProgressOnly` 5 / `resetAll` 2 / 起動・load 復元 5 / HTML DOM 9 / 周辺 3。
- 開始済み判定は **すべて `state.started`（全体単一）に集約**（inventory §4.4）。クラス単位の判定は存在しない。
- 関数レベルでは `generatePairing(cls)` / `submitRound(cls)` / `setWinner(cls,...)` などが **既にクラス単位で動作**（scope-001 §3.1）。残るのは入口 `startTournament` と reset 系。
- 隣接リスク（参加者登録・表示・保存 verify 系）は本仕様書の主対象外。`ROUND-CLASS-START-005` で合流（inventory §5.7）。

### 2.2 Codex 指摘（PR #136 で確定済）

- **Must Fix**：一括開始は all-or-nothing。validate phase / mutate phase を分離。sequential mutate wrapper にしない（inventory §7.2 / §7.2.2）
- **Should Fix**：`emptyClassDict(classes)` は引数受け取り、helper はグローバル `state` 非参照（inventory §7.3）
- **Should Fix**：`state.started` は純 derived ではなく「同期書き込みで互換維持」（inventory §7.1）
- **Nice to Have**：`#startBtn` の「対象クラス」定義は 002 で確定する ← **本仕様書で確定**（§6）

---

## 3. 用語定義

| 用語 | 定義 |
| --- | --- |
| **classId** | クラスを一意に識別する文字列。現状は `'A'` / `'B'`。将来 `'C'`, `'D'`, ... を追加可能。**コード上で正となる識別子** |
| **className** | クラスの表示名。例：`'Aクラス'`。**UI 表示専用**。コード分岐の対象にしない |
| **state.classes** | `[{id, name, started}]` の配列。クラス一覧と classId 単位 `started` の真実 |
| **classId 単位 started** | `state.classes` 内のあるエントリの `started` プロパティ。当該クラスが Round 1 開始済か否か |
| **互換フィールド** | 旧コード・旧 JSON との読み書き互換のため残置するフィールド。値は正の state から **同期書き込み** で更新される（純 derived ではない） |
| **all-class OR** | classes 配列に対する `some(c => c.started)`。「どれか 1 クラスでも started なら true」 |
| **対象クラス**（`#startBtn` 文脈） | `#startBtn` 押下時に開始処理を試みるクラスの集合。**本仕様書 §6 で確定** |
| **開始候補** | 対象クラスのうち validate を通過し mutate phase で実際に開始されるクラスの集合 |
| **validate phase** | state を一切変更せず、開始可否のみを判定する pure 関数の段階 |
| **mutate phase** | validate phase が全件 OK を返した後にのみ実行される、state 変更・save 段階 |
| **atomic wrapper** | validate phase と mutate phase を内部で順に呼び、validate 失敗時は state を 1 byte も変更しない関数 |
| **sequential mutate wrapper** | candidates を順に `startTournamentForClass(classId)` で開始する実装（**本仕様書では禁止**） |
| **all-or-nothing** | 対象クラス全件が validate を通過した場合のみ mutate を実行し、いずれか 1 つでも失敗すれば 1 件も開始しない性質 |
| **隣接リスク** | 対局開始まわりではないが、A/B 固定が残るため可変クラス化と同時または直後に確認が必要な箇所（inventory §5.7） |

---

## 4. 現行仕様の要約

### 4.1 state（[shogi_v4.html:211-218](../../shogi_v4.html)）

```javascript
var state = {
  players:  {A:[], B:[]},
  rounds:   4,
  pairings: {A:[], B:[]},
  results:  {A:[], B:[]},
  started:  false,
  report:   {date:'', place:'労政会館', start:'', end:'', sei:'', fuku:'', note:''}
};
```

### 4.2 `startTournament()`（[shogi_v4.html:4441-4486](../../shogi_v4.html)）

現行は **A/B 固定の atomic** 実装：
- L4442：total 算出（`state.players.A.length + state.players.B.length`）
- L4453：`state.started===true` で早期 return（再開始ガード）
- L4457：`total<2` で early return（参加者不足）
- L4458-4459：Aクラス奇数 / Bクラス奇数チェック（参加者がいれば）
- L4460-4465：`hasOngoing` confirm（**通常到達しない inert / dead fail-safe**、inventory §4.4）
- L4467-4469：mutate（`state.started=true` + `pairings={A:[],B:[]}` + `results={A:[],B:[]}`）
- L4470-4471：`generatePairing('A')` / `generatePairing('B')`（参加者がいるクラスのみ）
- L4472：showTab + save
- L4475-4485：SAVE-003 verify（`persisted_st.started !== true` でアラート）

**重要な現行性質**：L4457-4465 のチェックは **すべて mutate より前** に走り、1 つでも fail すれば return。`state.pairings` / `state.results` / `state.started` は変更されない。

### 4.3 `normalizeState`（[shogi_v4.html:433-489](../../shogi_v4.html)）

- L434：`base = {players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false, ...}`
- L438：`['A','B'].forEach(function(cls){ ... })` で A/B 両クラスを正規化
- L487：`tournament_id` がある場合のみ補完

### 4.4 `resetTournamentProgressOnly` / `resetAll`

- `resetTournamentProgressOnly`（[L5924-5943](../../shogi_v4.html)）：`state.started=false` + `pairings={A:[],B:[]}` + `results={A:[],B:[]}` + pane クリア
- `resetAll`（[L5945-5975](../../shogi_v4.html)）：state 全体を `{players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,...}` で再初期化 + localStorage 削除

### 4.5 SAVE-003 verify

- `readPersistedState`（[L4001-4019](../../shogi_v4.html)）：localStorage から state を読み戻し、A/B 必須キーで sanity check。**現状は `parsed.players.A` / `parsed.players.B` 等を hardcode 検証**

---

## 5. 目指す仕様

### 5.1 設計の中心

| 観点 | 仕様 |
| --- | --- |
| classId 単位 started を **正** とする | `state.classes[i].started` がそのクラスの開始済み判定の真実 |
| `state.started` は **互換フィールド** | 純 derived getter ではない。`setClassStarted` 実行時に `state.started = state.classes.some(c => c.started)` を **同期書き込み** で更新 |
| `state.players` / `state.pairings` / `state.results` は **dict 構造を維持** | 当面 dot 記法 / bracket 記法の両対応。Phase 5〜6 で `state.classes` 駆動の動的キー化を検討（本仕様書範囲外） |
| `#startBtn` は **atomic wrapper** | 既存 all-or-nothing 性を維持。sequential mutate wrapper にしない |
| `startTournamentForClass(classId)` は **単独 atomic** | 1 クラス分の validate → mutate を内部で完結。同名の手動開始経路（クラス別 UI ボタン、004 以降）でも all-or-nothing |
| helper は **グローバル state 非参照** | 引数で classes / players を受け取る pure 関数を基本とする |

### 5.2 state schema（新）

```javascript
var state = {
  // 既存（互換のため当面維持）
  players:  { A:[], B:[] },     // 003 では schema 維持、Phase 5〜6 で動的キー化
  rounds:   4,
  pairings: { A:[], B:[] },     // 同上
  results:  { A:[], B:[] },     // 同上
  report:   { date:'', place:'労政会館', start:'', end:'', sei:'', fuku:'', note:'' },
  tournament_id: undefined,     // 既存

  // 互換フィールド（旧コード読み取り用、setClassStarted で同期書き込み）
  started:  false,

  // 新規追加（classId 単位 started の真実）
  classes: [
    { id: 'A', name: 'Aクラス', started: false },
    { id: 'B', name: 'Bクラス', started: false }
  ]
};
```

### 5.3 段階的移行の境界（本仕様書がカバーする範囲）

| Phase | 範囲 | 担当タスク |
| --- | --- | --- |
| Phase 1 | `state.classes` 導入、helper 追加、normalizeState 互換、`state.started` 同期書き込み、unit test | 003 |
| Phase 2 | `startTournamentForClass` 新設、`#startBtn` atomic wrapper 実装、クラス別 UI ボタン追加 | 004 |
| Phase 3 | `isTournamentDone` / 削除ガード等の周辺整合、隣接リスク合流 | 005 |
| Phase 4 | E2E | 006 |
| Phase 5（範囲外） | A/B literal の網羅置換、`state.players` dict 動的キー化 | 後続別タスク |
| Phase 6（範囲外） | C クラス UI 実装 | 別シリーズ（scope-001 §4.2 Phase 3 と統合検討） |

本仕様書は Phase 1〜2 の入力仕様を確定する。

---

## 6. `#startBtn` 一括開始仕様

### 6.1 all-or-nothing（必須要件）

`#startBtn`（[shogi_v4.html:155](../../shogi_v4.html) `<button id="startBtn">登録完了・対局開始</button>`）押下時の `startTournament()` 呼び出しは、以下を **必須要件** とする：

1. **対象クラスを事前に確定する**（§6.2 で定義）
2. **対象クラス全件を validate phase で検証する**（state を読むだけ、書き込まない）
3. **全件 validate OK の場合のみ mutate phase に進む**
4. validate phase でいずれか 1 件でも失敗した場合、**state / pairings / results / started を一切変更せず** alert / showMsg で全件のエラーをまとめて通知して return
5. mutate phase は全 候補クラスを一括で初期化 + `generatePairing` + `save` + SAVE-003 verify を実行
6. **「A は開始済、B は validate 失敗」のような部分開始状態を作ってはならない**
7. **`startTournament()` を「対象クラスを順に `startTournamentForClass(classId)` で開始する」sequential mutate wrapper として実装することは禁止**（N 番目で失敗時に 1..N-1 番目だけ開始される部分開始バグを生むため）

### 6.2 「対象クラス」の定義（Codex Nice to Have 指摘への回答）

**採用案：候補 A（参加者ありかつ未開始のクラスのみ）+ 参加者 0 クラスの扱いを明示**

| 区分 | クラス状態 | `#startBtn` 押下時の扱い |
| --- | --- | --- |
| 対象 | 参加者数 ≥ 1 かつ `started === false` | validate phase の **対象クラス**。検証に通れば候補となる |
| 対象外（skip） | 参加者数 = 0 | **無条件 skip**（エラーにしない）。理由：現場運用で「参加者 0 クラスは存在しないとみなす」のが自然 |
| 対象外（skip） | `started === true`（既に開始済） | **無条件 skip**（エラーにしない）。理由：再開始ガードは「全部既開始」のときだけ `#startBtn` 全体としてエラー表示する |

#### 6.2.1 候補 A の採用根拠（候補 B との比較）

| 案 | 内容 | 採否 |
| --- | --- | --- |
| **候補 A**（採用） | 参加者あり + 未開始のクラスのみを対象 | ✅ 現場運用上の自然さ。既存挙動（[L4470-4471](../../shogi_v4.html)）`if(state.players.A.length>0) generatePairing('A')` が既に「参加者がいないクラスは skip」になっており、後方互換 |
| 候補 B | 全クラスを対象。参加者 0 クラスを validate 失敗として扱う | ❌ 現場で「Aクラスだけ大会を開きたい」運用が普通に存在する。validate 失敗扱いだと `#startBtn` が永久に押せなくなる |
| 候補 C（参考） | 全クラスを対象。参加者 0 / 既開始 / 奇数 のすべてを「警告のみで対象外」扱い | ❌ 「奇数だから開始しない」を skip 扱いにすると、現場で気づかず Bクラス未開始のまま大会が進む事故が起きる |

→ **候補 A** を採用。奇数 / 参加者 1 名 は **validate 失敗（エラー）**、参加者 0 / 既開始 は **skip**（エラーにしない）と区別する。

#### 6.2.2 対象クラスの境界条件（仕様確定）

| 条件 | error kind | 扱い | 理由 |
| --- | --- | --- | --- |
| 参加者数 = 0 | `skip-empty` | skip（対象外） | 「クラスが存在しない」とみなす。エラー扱いにしない |
| 参加者数 = 1 | `too-few`（**奇数ではなく too-few**） | **validate 失敗**（対象、エラー） | 既存挙動 [L4457](../../shogi_v4.html) `if(total<2)` と同じく「人数が足りない」が真の理由。1 名では対局が成立しない。`odd` より優先 |
| 参加者数 = 3, 5, 7, …（2 以上の奇数） | `odd` | **validate 失敗**（対象、エラー） | 現状 [L4458-4459](../../shogi_v4.html) と同じ「運営者を追加してください」案内が必要 |
| 参加者数 = 2 以上の偶数 | `ok` | **対象、validate OK** | 開始候補 |
| `started === true` | `skip-already-started` | skip（対象外） | 再開始は別経路（`resetClassForClass(classId)` 後に押し直し）。`#startBtn` で「既開始クラスのエラー」を出すと UX が煩雑 |
| 全クラスの参加者総数 < 2（クラス横断） | `total-too-few`（最優先） | **`#startBtn` 全体としてエラー** | 既存 [L4457](../../shogi_v4.html) `if(total<2)` を維持。`total` は全クラスの参加者合計。クラス別判定より優先 |
| 全クラスが skip（対象 0 件） | `no-candidate` | **`#startBtn` 全体としてエラー** | 文言は skip 内訳で分岐（§13.2.1） |

#### 6.2.3 error 優先順位（厳格）

`#startBtn`（bulk）押下時の error 集約・優先順位：

1. **`total-too-few`**（クラス横断、最優先）：全クラスの参加者合計 < 2 なら、クラス別 error / skip 判定をすべてバイパスして 1 件の `total-too-few` で reject
2. **per-class `too-few`**（クラス内）：参加者数 1 のクラスは `too-few`（`odd` ではない）
3. **per-class `odd`**：参加者数 3 以上の奇数
4. **`no-candidate`**：errors が空かつ candidates が 0 件のときの最終フォールバック

`startTournamentForClass(classId)`（single）押下時：
- `total-too-few` クラス横断エラーは **適用しない**（§7.6 / §6.3.4）
- 当該 classId の per-class `too-few` / `odd` / `skip-*` のみ判定

→ §6.3.2 の `validateStartableClass` 内で `cnt === 1 → too-few` を `cnt % 2 !== 0 → odd` より **先に判定** することで、上記優先順位を保証。表と疑似コードが一致。

### 6.3 validate phase の仕様

#### 6.3.1 atomicity の境界（重要）

`#startBtn` の一括開始と `startTournamentForClass(classId)` の単独開始は **どちらも atomic** だが、**atomicity の境界が異なる**：

| 関数 | atomicity の境界 | 「validate 失敗で開始拒否」の対象 |
| --- | --- | --- |
| `#startBtn` → `startTournament()` | **bulk atomic**：対象クラス全体（参加者あり + 未開始の全クラス） | 対象クラスのうち 1 つでも fail なら **全件 reject**（all-or-nothing） |
| `startTournamentForClass(classId)` | **class atomic**：対象 classId 1 つだけ | 当該 classId のみ判定。他クラスの odd / too-few / 未開始状態に **引きずられない** |

→ `#startBtn` の all-or-nothing は **bulk start の対象クラス集合に対する atomicity** であり、`startTournamentForClass(classId)` の atomicity は **対象 classId ひとつに閉じる**。単独開始では、他クラスの odd / too-few / 未開始状態を理由に対象 classId の開始を **拒否してはならない**。

**典型シナリオ**：
- Aクラス：参加者 2 名で開始可能
- Bクラス：参加者 3 名で奇数（validate fail）
- → `#startBtn`（一括）：B の odd error により全件 reject。A も開始されない（**all-or-nothing**）
- → `startTournamentForClass('A')`（単独）：B の状態を見ない。A は開始される（**class atomic**）

この区別は、classId 単位の独立開始（A 単独開始 / B 後追い開始）というシリーズ全体の中心目的の前提条件である。

#### 6.3.2 共通 per-class validator（pure）

```javascript
// 仕様（実装はしない）

// 単一クラスに対する validation。他クラスの状態に依存しない pure 関数。
// 入力：classInfo（state.classes 内の 1 エントリ）、playersForClass（state.players[classId]）
// 出力：{kind: 'ok'|'skip-empty'|'skip-already-started'|'odd'|'too-few', message?: string}
function validateStartableClass(classInfo, playersForClass){
  var cnt = Array.isArray(playersForClass) ? playersForClass.length : 0;
  if(cnt === 0)                  return {kind:'skip-empty'};            // 対象外（skip、エラーにしない）
  if(classInfo.started === true) return {kind:'skip-already-started'};  // 対象外（skip、エラーにしない）
  if(cnt === 1)                  return {kind:'too-few', message: classInfo.name + 'は参加者が1名のため開始できません'};
  if(cnt % 2 !== 0)              return {kind:'odd',     message: classInfo.name + 'が奇数です。運営者を追加してください'};
  return {kind:'ok'};                                                   // 開始候補
}
```

**重要**：
- **他クラスの state を参照しない**。`state.classes` 全体を見ない。当該クラスの classInfo と players 配列のみで判定
- **`#startBtn` の bulk start と `startTournamentForClass(classId)` の single start で共有** する pure 関数
- error kind の優先順位は内部で確定（`too-few > odd`）。§6.2.2 / §13.1 の table と一致

#### 6.3.3 bulk collector（`#startBtn` 用）

```javascript
// 仕様（実装はしない）

// `#startBtn` 用：複数クラスを集約して all-or-nothing validation
// 入力：classes 配列、players dict
// 出力：{ok:boolean, candidates:[classId,...], errors:[{classId, kind, message}, ...]}
function collectStartCandidates(classes, players){
  // 1. total = classes.reduce((sum, c) => sum + ((players[c.id] || []).length), 0)
  //    if total < 2:
  //      return {ok:false, candidates:[], errors:[{classId:null, kind:'total-too-few', message:'参加者が少なすぎます'}]}
  //    // ※ total-too-few は §6.2.2 / §13.1 の最優先エラー
  //
  // 2. errors = []; candidates = []; skipped = []; (skip kind 別の集約用)
  // 3. for c in classes:
  //      r = validateStartableClass(c, players[c.id]);
  //      switch(r.kind):
  //        case 'ok':                    candidates.push(c.id); break;
  //        case 'skip-empty':            skipped.push({classId:c.id, kind:'skip-empty'}); break;
  //        case 'skip-already-started':  skipped.push({classId:c.id, kind:'skip-already-started'}); break;
  //        case 'too-few':               errors.push({classId:c.id, kind:'too-few', message:r.message}); break;
  //        case 'odd':                   errors.push({classId:c.id, kind:'odd',     message:r.message}); break;
  //
  // 4. if errors.length > 0:
  //      return {ok:false, candidates:[], errors:errors, skipped:skipped}    // ← bulk atomic：1 件でも error なら全件 reject
  //
  // 5. if candidates.length === 0:
  //      // 全クラス skip（全員参加者 0 or 全員既開始 or その混在）。§13.2.1 で文言を分岐
  //      return {ok:false, candidates:[], errors:[{classId:null, kind:'no-candidate', message:resolveNoCandidateMessage(skipped)}], skipped:skipped}
  //
  // 6. return {ok:true, candidates:candidates, errors:[], skipped:skipped}
}
```

**重要**：
- `collectStartCandidates` は **`#startBtn`（一括開始）専用**
- 内部で `validateStartableClass` を **対象クラスごとに 1 回ずつ呼ぶ**（per-class validator の再利用）
- bulk atomic：1 クラスでも error があれば candidates を空にして reject
- skip と error は **別カテゴリ**：skip は対象外（エラーにしない）、error は validate 失敗
- error 優先順位：`total-too-few`（クラス横断）→ per-class の `too-few` → per-class の `odd`

#### 6.3.4 単独開始用 validator wrapper（`startTournamentForClass` 用）

```javascript
// 仕様（実装はしない）

// `startTournamentForClass(classId)` 用：単一クラスを単独 validation
// 入力：classId、classes 配列、players dict
// 出力：{ok:boolean, candidateClassId:string|null, error?:{kind, message}}
function collectStartCandidateForClass(classId, classes, players){
  var classInfo = classes.find(function(c){ return c.id === classId; });
  if(!classInfo){
    return {ok:false, candidateClassId:null, error:{kind:'unknown-class', message:'クラスが見つかりません'}};
  }
  var r = validateStartableClass(classInfo, players[classId]);
  switch(r.kind){
    case 'ok':
      return {ok:true, candidateClassId:classId};
    case 'skip-empty':
      return {ok:false, candidateClassId:null, error:{kind:'skip-empty',           message:classInfo.name + 'は参加者がいません'}};
    case 'skip-already-started':
      return {ok:false, candidateClassId:null, error:{kind:'skip-already-started', message:classInfo.name + 'はすでに開始されています'}};
    case 'too-few':
    case 'odd':
      return {ok:false, candidateClassId:null, error:{kind:r.kind, message:r.message}};
  }
}
```

**重要**：
- **他クラスを見ない**。`classes` は `classInfo` の解決にのみ使い、他クラスの started / 参加者数は判定に影響しない
- 単独開始用 wrapper では、単独経路で skip 理由を **明示的にエラーとして返す**（bulk と違い「skip して continue」ができない。当該クラスが skip なら何も開始しないのが期待動作）
- `total-too-few` クラス横断エラーは **適用しない**（単独開始では「他クラスを含む全体参加者数 < 2」を理由に拒否してはならない。`too-few`（クラス内 1 名以下）は適用）

### 6.4 mutate phase の仕様

```javascript
// 仕様（実装はしない）

// 入力：candidates（validate OK で確定したクラス ID 配列）
// 副作用：state.pairings / state.results / state.classes[i].started / state.started 更新、generatePairing、save
function applyStartForCandidates(candidates){
  candidates.forEach(function(classId){
    state.pairings[classId] = [];
    state.results[classId]  = [];
    setClassStarted(classId, true);   // state.started も同期書き込み（§8.2）
    generatePairing(classId);
  });
  save();
}
```

**重要**：
- `applyStartForCandidates` は validate phase が `ok:true` を返した後にのみ呼ぶ
- 引数 `candidates` は validate phase が確定した「**実際に開始すべきクラス ID 配列**」のみを含む
- skip クラス（参加者 0 / 既開始）は candidates に **含まれない**
- SAVE-003 verify はこの後段で classId ごとに実行（§6.5）

### 6.5 SAVE-003 verify 仕様（クラス単位）

```javascript
// 仕様（実装はしない）

candidates.forEach(function(classId){
  var persisted = readPersistedState();
  if(!persisted || !classStartedInPersisted(persisted, classId)){
    notifySaveWarning({
      message:  '<className> を開始しましたが、保存が確認できませんでした。ブラウザを閉じる前にバックアップしてください',
      consoleTag: 'SAVE-003: startTournament の保存が確認できませんでした (classId='+classId+')',
      callsiteId: 'SAVE-003-startTournament-' + classId,
      kind: 'save-verify',
      aggregateKey: 'save-verify:core',
      severity: 'warn'
    });
  }
});
```

- **callsiteId は classId を含める**（`SAVE-003-startTournament-A` 等）：classes ごとに warning が分離され、aggregation でも個別 trace 可能
- 既存 `SAVE-003-startTournament`（単一）は **削除**。callsiteId 互換は維持しない（startTournament の意味が「全クラス共通」から「クラス単位の集合」に変わるため）
- `aggregateKey` は `save-verify:core` を共有（既存 indicator のカウント挙動を変えないため）

### 6.6 `#startBtn` ハンドラ全体

```javascript
// 仕様（実装はしない）

function startTournament(){
  var v = collectStartCandidates(state.classes, state.players);
  if(!v.ok){
    showStartValidationErrors(v.errors);   // alert / showMsg にまとめて出す
    return;                                // state は一切変更しない
  }
  applyStartForCandidates(v.candidates);
  showTab('tournament');
  verifyStartSavedForCandidates(v.candidates);  // §6.5
}
```

`hasOngoing` confirm 経路（inventory §4.4 で inert / dead fail-safe と確認済）は **削除しない**（残置）。理由：旧データで `state.classes` 未定義 + `state.started===false` + `pairings/results` 非空という異常系の防御として残す。可変クラス化時は **`state.classes` を走査して `pairings/results` が非空のクラスを検出する形** に書き換える。

---

## 7. classId 単位の開始状態仕様

### 7.1 `state.classes` の構造

```typescript
type ClassEntry = {
  id: string;        // classId（'A', 'B', 'C', ...）
  name: string;      // className（表示用 'Aクラス', 'Bクラス', ...）
  started: boolean;  // 当該クラスが Round 1 開始済か
};
type State = { ...; classes: ClassEntry[] };
```

### 7.2 既定値とクラス追加・削除のルール

| 操作 | 仕様 |
| --- | --- |
| 新規作成（`resetAll` 等） | `classes = [{id:'A',name:'Aクラス',started:false}, {id:'B',name:'Bクラス',started:false}]` |
| クラス追加（将来 Phase 6） | `state.classes.push({id:'C', name:'Cクラス', started:false})`。`state.players[id]` / `state.pairings[id]` / `state.results[id]` を空配列で同時補完 |
| クラス削除（将来 Phase 6） | classes 配列から該当エントリを除去 + `state.players[id]` 等を delete。**削除されるクラスが `started===true` の場合は警告**（後続 Phase で UI 設計） |
| クラス追加時の `started` 初期値 | **`false`**（未開始） |
| 参加者 0 クラスの `started` | **`false` を維持**（参加者 0 ≠ 開始済。skip 対象） |

### 7.3 classId / className の規約

- **classId は ASCII 大文字 1〜2 文字を推奨**（`'A'`, `'B'`, `'C'`, `'D'`, ..., 必要なら `'A1'` 等）。DOM ID `pane-{classId}` / `result-{classId}` の安全性のため、`[A-Za-z0-9_-]` の範囲内に限定（004 着手時の細則）
- **className は表示専用**（i18n 入口）。コードのいかなる分岐にも使わない
- **`'A'`, `'B'` の literal を新たに増やさない**：既存 literal は §5.3 Phase 5 で網羅置換、本仕様書範囲では追加しない

### 7.4 既存クラス独立性の維持

scope-001 §3.1 / inventory §3 で既に確認済の通り、以下は **クラス単位で動作している**：

- `generatePairing(cls)` / `submitRound(cls)` / `setWinner(cls, ...)` / `pairHasRematch(cls, ...)` / `buildScoreGridHtml(cls, ...)` / `buildPlayedHistoryHtml(cls, ...)` / `buildCurrentPairingsHtml(cls, ...)` / `renderTournament(cls)`

→ **本仕様書で touch しない**。既存挙動を変えない。

### 7.5 開始済み判定の置換ルール

| 現状（A/B 固定） | 置換先 | 担当タスク |
| --- | --- | --- |
| `state.started === true`（[L4453](../../shogi_v4.html)、startTournament ガード） | `collectStartCandidates` 内部で classes ごとに `c.started === true` を skip | 004 |
| `state.started`（[L3786](../../shogi_v4.html)、削除ガード） | `isClassStarted(player.cls)` | 005 |
| `state.started`（[L6101](../../shogi_v4.html)、起動 tab 復元）/ [L5640](../../shogi_v4.html)、load tab 復元） | **互換フィールド `state.started` 直読み** を維持。新コード（テスト等）からは `state.classes.some(c => c.started)` でも可 | 003（同期書き込みが効くため変更なし）/ 004 |
| `persisted_st.started !== true`（[L4476](../../shogi_v4.html)、SAVE-003 verify） | `!classStartedInPersisted(persisted, classId)` | 004 |

### 7.6 単独 `startTournamentForClass(classId)` 仕様（クラス別 UI ボタン用、004 で実装）

```javascript
// 仕様（実装はしない）

function startTournamentForClass(classId){
  // class atomic：他クラスの state を見ない。validate は当該 classId だけ
  var v = collectStartCandidateForClass(classId, state.classes, state.players);  // §6.3.4
  if(!v.ok){
    showSingleClassError(classId, v.error);   // skip 理由 / error 種別ごとに UI 表示
    return;                                   // state は一切変更しない
  }

  // 当該 classId だけ mutate
  applyStartForCandidates([classId]);         // §6.4 と同じ writer を再利用
  showTab('tournament');
  verifyStartSavedForCandidates([classId]);   // §6.5
}
```

**重要**：
- **単独経路では bulk collector（`collectStartCandidates`）を呼ばない**。代わりに per-class validator wrapper（`collectStartCandidateForClass`, §6.3.4）を使う
- これにより、A が開始可能・B が奇数のような状態でも `startTournamentForClass('A')` は **A を開始できる**（他クラスの error に引きずられない、class atomic）
- 共通の per-class pure validator（`validateStartableClass`, §6.3.2）が bulk / single の **両方で再利用** される（バリデーション規約の共有）
- mutate phase（`applyStartForCandidates`）と SAVE-003 verify（`verifyStartSavedForCandidates`）は bulk / single で **同じ writer を共有**。引数の配列長が違うだけ

#### 7.6.1 bulk と single の対比（仕様確認）

| 観点 | `#startBtn`（bulk） | `startTournamentForClass('A')`（single） |
| --- | --- | --- |
| validator | `collectStartCandidates(classes, players)` | `collectStartCandidateForClass('A', classes, players)` |
| atomic 境界 | 対象クラス集合（参加者あり + 未開始の全クラス） | 対象 classId 1 つ（'A'）のみ |
| B クラスが奇数の場合 | B の odd error で **全件 reject**（A も開始されない） | B を見ないため **A は開始される** |
| B クラスが既開始の場合 | bulk validator が B を skip。A だけ validate を通れば A 開始 | 同じく A は開始される（B の状態を見ない） |
| 参加者 1 名（クラス内） | bulk：当該クラスの `too-few` error / 他クラスも error なら集約 | single：当該クラスの `too-few` error で reject |
| 全クラス参加者 < 2（横断） | `total-too-few` で全件 reject | **適用しない**。単独開始では当該 classId の `too-few` のみ判定 |
| skip と error の扱い | skip は対象外（エラーにしない）、error は集約表示 | skip は当該 classId に対する「開始不可」として **明示的にエラー表示**（continue できない） |

---

## 8. `state.started` 互換維持仕様

### 8.1 位置づけ

| 観点 | 仕様 |
| --- | --- |
| 正となる state | `state.classes[i].started` |
| `state.started` の役割 | **互換フィールド**（旧コード読み取り用、旧 JSON シリアライズ互換用） |
| 値の更新タイミング | `setClassStarted(classId, value)` 実行時に **同期書き込み** で更新 |
| 値の意味 | all-class OR：`state.classes.some(c => c.started)` |
| 純 derived getter（`Object.defineProperty`）か | **採用しない**（scope-001 §11.3 案 C は不採用、案 B = 同期書き込み を採用） |
| 将来削除するか | 003〜006 では削除しない。Phase 5 以降で別タスクとして検討 |

### 8.2 同期書き込みの規約

```javascript
// 仕様（実装はしない）

function setClassStarted(classId, value){
  var k = state.classes.find(function(c){ return c.id === classId; });
  if(!k) throw new Error('unknown classId: ' + classId);
  k.started = !!value;
  syncGlobalStartedFromClasses();
}

function syncGlobalStartedFromClasses(){
  state.started = state.classes.some(function(c){ return c.started === true; });
}
```

**規約**：
- `state.classes[i].started` を直接代入する経路は **原則作らない**（通常の開始・停止変更は必ず `setClassStarted(classId, value)` 経由）。直接代入を許すと `state.started` の同期忘れが起きる
- `syncGlobalStartedFromClasses` は **冪等**（複数回呼んでも結果が変わらない）
- `state.started` を直接代入することは **原則禁止**

**直接代入が許される例外（全体初期化系）**：

通常の状態変更経路では `setClassStarted` を使う。ただし以下の **全体初期化系** 処理では、classes 配列の各エントリの `started` を直接初期化することを **例外的に許容** する。これらは classes / players / pairings / results を **同時に全体リセット** する処理であり、`setClassStarted` をループで呼ぶより一貫性が高い：

| 関数 | 直接代入の理由 | 同期書き込みの担保 |
| --- | --- | --- |
| `normalizeState(raw)` | load 中に新しい state を組み立てる。`state.classes` 自体がこの時点で確定する | 最後に `base.started = base.classes.some(c => c.started === true)` を必ず実行（§9.4 step 7） |
| `resetAll()` | state 全体を新規オブジェクトに置き換える。`classes` も再生成 | 新規オブジェクトに `started:false` を直接書き込み + 直後に save() |
| `resetTournamentProgressOnly()` | 進行データを全クラス一括でリセット。意味的には全体初期化に近い | ループで `c.started = false` を直接代入した直後に `syncGlobalStartedFromClasses()` を **必ず呼ぶ**（§12.2） |

**例外の境界（厳格）**：
- 上記 3 関数 **以外で** `state.classes[i].started` / `state.started` の直接代入は禁止
- 例外関数内でも、直接代入後は **必ず `state.started` を同期** すること（`syncGlobalStartedFromClasses()` を呼ぶか、新規オブジェクトに OR を直接書き込む）
- **例外範囲をこれ以上広げない**：将来「クラス単位の一括 mute 機能」「クラス単位の archive」等を追加する場合も、`setClassStarted` 経由で実装する

### 8.3 旧コードからの読み取り互換

旧コードが `state.started` を直接読んでも、`setClassStarted` 経由で常に最新の OR が書き戻されているため、挙動は変わらない。

| 旧コード | 動作 |
| --- | --- |
| `if(state.started === true){...}` | `classes` のうち 1 つでも started なら true。挙動変化なし |
| `if(state.started){...}` | 同上 |
| `persisted.started` 読み取り | save 時に `state.started` がシリアライズされているため、旧 JSON 互換性も維持 |

### 8.4 旧 JSON への書き出し互換

`save()` は `JSON.stringify(state)` で **state 全体** を保存（[L513](../../shogi_v4.html)）。`state.started` も `state.classes` も両方シリアライズされる。

旧バージョンのアプリで読み込んだ場合：
- `state.started` は読める（旧コードと互換）
- `state.classes` は **未知フィールドとして無視される**（旧コードは触らない）
- → 旧バージョンに **read-only ダウングレード互換** は保たれる（書き戻しはダウングレード後の旧コードが行うため、`state.classes` は失われる可能性あり。これは仕様）

---

## 9. 旧データ互換 / normalize 仕様（旧 008 統合）

PR #136 §8 の「008 を 002 に統合する選択肢」を採用。本章で旧データマイグレ仕様を確定する。

### 9.1 旧データの型バリエーション

| バリエーション | 内容 | 検出条件 |
| --- | --- | --- |
| **新形式** | `state.classes` あり、`state.started` あり | `Array.isArray(raw.classes)` |
| **旧形式 v1** | `state.classes` なし、`state.started:bool` あり、`players/pairings/results` は `{A,B}` 形式 | `!Array.isArray(raw.classes) && 'started' in raw` |
| **旧形式 v0** | `state.classes` なし、`state.started` なし、`players` のみ | 上記以外（極初期、開始前のみ） |
| **破損** | 上記いずれも満たさない | parse 失敗 / 必須キー欠落 |

### 9.2 normalizeClasses(raw) の仕様

```javascript
// 仕様（実装はしない）

function normalizeClasses(raw){
  // 1. raw.classes が配列で entries 検証 OK ならそれを使う（id/name/started を補完）
  // 2. 配列にない場合は ['A', 'B'] をデフォルト classes として作る
  // 3. raw.started:bool のみの旧データの場合、A/B の started を raw.started で展開（§9.3 案 a）
  // 4. raw.players[cls] / raw.pairings[cls] / raw.results[cls] にあるが classes に無い classId は補完追加
  //    （例：将来 C を含む JSON を旧 normalizeClasses が読んでも壊れないように）
  // → 全件揃った classes 配列を return

  if(Array.isArray(raw && raw.classes)){
    var cs = raw.classes
      .filter(function(c){ return c && typeof c.id === 'string' && c.id; })
      .map(function(c){
        return {
          id: c.id,
          name: typeof c.name === 'string' ? c.name : (c.id + 'クラス'),
          started: c.started === true
        };
      });
    // A/B を補完（足りない場合）
    ['A','B'].forEach(function(cls){
      if(!cs.find(function(c){ return c.id === cls; })){
        cs.push({ id: cls, name: cls + 'クラス', started: false });
      }
    });
    // raw.players / raw.pairings / raw.results に未知 classId があれば補完
    appendMissingClassesFromDicts(cs, raw);
    return cs;
  }

  // 旧データ：classes なし
  var rawStarted = !!(raw && raw.started);
  var classes = [
    { id:'A', name:'Aクラス', started: rawStarted },
    { id:'B', name:'Bクラス', started: rawStarted }
  ];
  appendMissingClassesFromDicts(classes, raw);
  return classes;
}
```

### 9.3 旧 `state.started:bool` の展開規則（scope-001 §8.4 案 a を採用）

| 旧 JSON | 互換変換結果 | 採否 |
| --- | --- | --- |
| `started:false` / pairings 空 / results 空 | `classes: [{A,started:false},{B,started:false}]` | ✅ |
| `started:true` / results.A 有り / results.B 空 | `classes: [{A,started:true},{B,started:true}]`（両方 true、**保守的**） | ✅（採用） |
| `started:true` / results 両方有り | `classes: [{A,started:true},{B,started:true}]` | ✅ |

**採用根拠**：保守的に両方 `started:true` にすると、旧データで「A は進行中で B は未開始」を区別できない場合に、B も started として扱われる。これは **誤った restart を防ぐ** ために安全側。逆に「B を強制未開始」にすると、UI 上で B の `#startBtn-B`（004 で実装）が再度押せてしまい、まだ進行中の何かを誤ってリセットする経路が増える。

**現場リスク**：旧データで「B は実は未開始」だった場合、`isClassStarted('B') === true` になり、B の `#startBtn` が押せない。回避策は `resetClassForClass('B')` を経由する（明示操作）。この回避操作は破壊的ではない（B は元々空のため）。

**代替案（案 b：pairings / results が非空のクラスのみ started=true）は不採用**：判定が複雑化し、`pairings.B === []` だが他経路で `started=true` を保存した過渡期データを誤って `started=false` に戻すリスクがある。

### 9.4 normalizeState の組立順序（必須遵守）

helper はグローバル `state` を **読まない**。以下の順序で組み立てる：

1. `var classes = normalizeClasses(raw);`
2. `var base = { rounds:4, report:{...} };`（classes 非依存の固定部）
3. `base.classes = classes;`
4. `base.players  = normalizeDictByClasses(raw.players,  classes, normalizePlayerArray);`
5. `base.pairings = normalizeDictByClasses(raw.pairings, classes, normalizePairingArray);`
6. `base.results  = normalizeDictByClasses(raw.results,  classes, normalizeResultsArray);`
7. `base.started  = classes.some(function(c){ return c.started === true; });`（互換フィールド同期書き込み）
8. `if(raw.tournament_id) base.tournament_id = raw.tournament_id;`（既存）
9. `return base;`
10. **呼び元（`load` / `applyLoadedJson`）が `state = normalizeState(raw);` で差し替える**

→ この順序を守る限り、helper 内で「上書き予定の古い `state.classes`」を読むレースが起きない。

### 9.5 `normalizeDictByClasses(rawDict, classes, normalizeEach)` の仕様

```javascript
// 仕様（実装はしない）

function normalizeDictByClasses(rawDict, classes, normalizeEach){
  var out = {};
  classes.forEach(function(c){
    var arr = (rawDict && Array.isArray(rawDict[c.id])) ? rawDict[c.id] : [];
    out[c.id] = normalizeEach(arr, c.id);  // 既存の sanitize ロジックを classId 単位で適用
  });
  // 未知 classId（rawDict に存在するが classes にない）は drop。データ整合性のため
  return out;
}
```

- 未知 classId（`rawDict` にあるが `classes` にない）は **drop**：appendMissingClassesFromDicts で `classes` に追加されているはずだが、念のため
- 既存の `sanitizeMatch` / `validIds` 等のロジックは `normalizeEach` 内で classId 単位に適用

### 9.6 旧データ load 時の UI 通知

| 状況 | 通知の要否 | 文言（仕様） |
| --- | --- | --- |
| 新形式 → 新形式 | 不要 | — |
| 旧形式 v1 → 新形式 | **不要**（暗黙マイグレ。UI 通知すると逆に運営者が不安になる） | — |
| 旧形式 v0 → 新形式 | 不要 | — |
| `state.classes` 補完が発生（未知 classId 追加） | console.warn のみ（運営に見せない） | `[NORMALIZE] state.classes appended classId=X from players/pairings/results dict` |
| 旧 `started:true` を案 a で両クラスに展開した | console.warn のみ | `[NORMALIZE] legacy state.started=true expanded to classes=[A,B]:started=true` |
| 破損 | 既存 load 失敗パスでアラート | `読み込みに失敗しました。正しいファイルか確認してください`（既存文言） |

**ポイント**：暗黙マイグレは UI で目立たせない。console.warn で開発者向けトレースのみ残す。

---

## 10. helper 設計方針

### 10.1 helper 一覧（003 / 004 で実装）

担当列：**003 = state schema / normalize に集中**、**004 = validator / atomic wrapper を集約**（§15.1.1 参照）。

| helper | シグネチャ | 種別 | グローバル state 参照 | 担当 |
| --- | --- | --- | --- | --- |
| `normalizeClasses(raw)` | `(raw: any) => ClassEntry[]` | pure | ❌（引数のみ） | 003 |
| `normalizeDictByClasses(rawDict, classes, normalizeEach)` | `(any, ClassEntry[], fn) => Dict<classId, array>` | pure | ❌（引数のみ） | 003 |
| `emptyClassDict(classes, initialValue)` | `(ClassEntry[], any \| () => any) => Dict<classId, any>` | pure | ❌（引数のみ） | 003 |
| `isClassStarted(classId)` | `(string) => boolean` | reader | ✅（`state.classes` 読み） | 003 |
| `setClassStarted(classId, value)` | `(string, boolean) => void` | writer | ✅（`state.classes` 書き / `state.started` 同期書き込み） | 003 |
| `syncGlobalStartedFromClasses()` | `() => void` | writer | ✅（`state.classes` 読み / `state.started` 書き） | 003 |
| `classStartedInPersisted(persisted, classId)` | `(NormalizedState, string) => boolean` | pure | ❌（引数のみ。persisted は normalized state） | 003 |
| `readPersistedState()` | `() => NormalizedState \| null` | reader（normalize 経由） | ✅（localStorage 読み + normalizeState） | 003 |
| `validateStartableClass(classInfo, playersForClass)` | `(ClassEntry, Player[]) => {kind, message?}` | **pure**（per-class、**他クラス非参照**） | ❌（引数のみ） | **004**（§15.1.1） |
| `collectStartCandidates(classes, players)` | `(ClassEntry[], PlayersDict) => BulkStartValidationResult` | pure（bulk 用、内部で `validateStartableClass` × N 回） | ❌（引数のみ） | **004** |
| `collectStartCandidateForClass(classId, classes, players)` | `(string, ClassEntry[], PlayersDict) => SingleStartValidationResult` | pure（single 用、内部で `validateStartableClass` × 1 回） | ❌（引数のみ） | **004** |
| `resolveNoCandidateMessage(skipped)` | `(SkippedEntry[]) => string` | pure | ❌ | 004 |
| `applyStartForCandidates(candidates)` | `(classId[]) => void` | writer | ✅ | 004 |
| `verifyStartSavedForCandidates(candidates)` | `(classId[]) => void` | reader（warning 発火） | ✅ | 004 |
| `startTournament()` | `() => void` | wrapper（**bulk atomic**） | ✅ | 004 |
| `startTournamentForClass(classId)` | `(string) => void` | wrapper（**class atomic**、他クラス非依存） | ✅ | 004 |
| `resetClassForClass(classId)` | `(string) => void` | writer | ✅ | 004 |

### 10.2 pure / writer / reader / wrapper の責務境界

| 種別 | 規約 |
| --- | --- |
| **pure** | 引数のみで動作。`state` グローバル非参照。副作用なし（ログ含まず）。ユニットテスト容易 |
| **reader** | `state` を読むが、書き換えない（ログ・warning は可） |
| **writer** | `state` を書き換える。**writer は内部で pure helper を呼んでよいが、reader を経由しなくてもよい** |
| **wrapper** | 1 つの UI イベントに対応する関数。`collectStartCandidates`（pure）→ エラー時 return → `applyStartForCandidates`（writer）の順で呼ぶ。**pure と writer の境界を必ず守る** |

### 10.3 グローバル state 非参照原則（再掲）

- `normalizeClasses` / `normalizeDictByClasses` / `emptyClassDict` / `validateStartableClass` / `collectStartCandidates` / `collectStartCandidateForClass` / `resolveNoCandidateMessage` / `classStartedInPersisted` は **すべて pure**。グローバル `state` を読まない
- 理由：`normalizeState(raw)` 内で組み立て途中の値を helper に渡したい。グローバル `state` を読むと「これから上書き予定の」古い値を見るレースが起きる
- writer / wrapper のみグローバル `state` を参照可

### 10.4 一括開始の禁止パターン（再掲）

```javascript
// ❌ 禁止：sequential mutate wrapper
function startTournament(){
  state.classes.forEach(function(c){
    if(state.players[c.id].length > 0 && !c.started){
      startTournamentForClass(c.id);   // N 番目で失敗時に 1..N-1 だけ開始される部分開始バグ
    }
  });
}
```

```javascript
// ✅ 正：atomic wrapper（validate phase / mutate phase 分離）
function startTournament(){
  var v = collectStartCandidates(state.classes, state.players);
  if(!v.ok){ showStartValidationErrors(v.errors); return; }
  applyStartForCandidates(v.candidates);
  showTab('tournament');
  verifyStartSavedForCandidates(v.candidates);
}
```

---

## 11. UI 仕様（実装は 004 以降）

### 11.1 本仕様書の UI 範囲

本仕様書では **DOM 変更しない**。004 以降で扱う UI 仕様の決定事項のみ列挙する。

### 11.2 `#startBtn`（既存）

- **当面維持**：ラベル「登録完了・対局開始」も維持
- **挙動変更**：内部実装が atomic wrapper（§6.6）に置き換わるが、UI から見ると「未開始かつ参加者ありクラスを一括で Round 1 開始」する同じボタン
- **エラー表示**：複数クラスのエラーをまとめて alert 表示する。例：「Bクラスが奇数です。運営者を追加してください。\nCクラスが奇数です。運営者を追加してください。」

### 11.3 クラス別 `#startBtn-{classId}`（004 で新設）

- pane-{classId} の上部に配置（参加者 0 のクラスは disabled or 非表示）
- 当該クラスが `started === true` の場合：「`<className>` をリセット」ボタンを代わりに表示
- 当該クラスが `started === false` かつ参加者 ≥ 2 の場合：「`<className>` を開始」ボタンを表示

### 11.4 「A 開始済 / B 未開始」状態の UI 表現

- pane-A：Round N 進行中、リセットボタン控えめ表示
- pane-B：「Bクラスを開始」ボタン強調表示
- 結果タブ：A の中間結果のみ表示（B は「未開始」表示）

### 11.5 参加者 0 クラスの UI

- pane-{classId} は **表示するが** 「参加者を登録してください」案内 + 開始ボタン非表示
- 結果タブも同様：「参加者 0 のため非表示」または空白

### 11.6 C クラス以上の追加 UI

本仕様書範囲外。`ROUND-CLASS-START-007`（C クラス UI 詳細設計、並走可）で扱う。

### 11.7 DOM ID の置き換え方針

- `#pane-A` / `#pane-B` → `#pane-{classId}`（004 で動的生成）
- `#result-A` / `#result-B` → `#result-{classId}`
- `#startBtn`（既存）は維持、`#startBtn-{classId}` を追加
- `#a-list` / `#b-list` / `#a-count` / `#b-count` / `#bulkEditA` / `#bulkEditB` は **隣接リスク**（inventory §5.7）として 005 で扱う

---

## 12. reset / load / save 仕様

### 12.1 `resetClassForClass(classId)` 仕様（004 で実装）

```javascript
// 仕様（実装はしない）

function resetClassForClass(classId){
  var klass = state.classes.find(function(c){ return c.id === classId; });
  if(!klass){ showMsg('クラスが見つかりません','err'); return; }
  if(!confirm(klass.name + 'の組み合わせ・勝敗結果を削除します。\n他クラスのデータは保持されます。\nよろしいですか？')) return;

  state.pairings[classId] = [];
  state.results[classId]  = [];
  setClassStarted(classId, false);   // state.started も同期書き込み

  // pane-{classId} と result-{classId} の DOM クリア
  var pane = document.getElementById('pane-' + classId); if(pane) pane.innerHTML = '';
  var rslt = document.getElementById('result-' + classId); if(rslt) rslt.innerHTML = '';

  save();
  renderRegList();
  showMsg(klass.name + 'をリセットしました','ok');
}
```

### 12.2 `resetTournamentProgressOnly()` 仕様（既存ボタン互換、004 で書き換え）

```javascript
// 仕様（実装はしない）

function resetTournamentProgressOnly(){
  if(!confirm('参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？')) return;

  state.classes.forEach(function(c){
    state.pairings[c.id] = [];
    state.results[c.id]  = [];
    c.started = false;             // §8.2 例外：全体初期化系のため直接代入を許容（直後に同期書き込み必須）
  });
  syncGlobalStartedFromClasses();  // state.started=false に同期（§8.2 例外の必須担保）

  // DOM クリア（classes 全件分）
  state.classes.forEach(function(c){
    var pane = document.getElementById('pane-' + c.id); if(pane) pane.innerHTML = '';
    var rslt = document.getElementById('result-' + c.id); if(rslt) rslt.innerHTML = '';
  });
  ['bulk-edit-modal','edit-past-modal','chg-modal','load-modal'].forEach(function(mid){
    var m = document.getElementById(mid); if(m) m.remove();
  });

  save();
  renderRegList();
  showTab('reg');
  showMsg('大会進行データをリセットしました','ok');
}
```

### 12.3 `resetAll()` 仕様（既存ボタン互換、004 で書き換え）

```javascript
// 仕様（実装はしない）

function resetAll(){
  if(!confirm('参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。')) return;
  state = {
    players:  { A:[], B:[] },
    rounds:   4,
    pairings: { A:[], B:[] },
    results:  { A:[], B:[] },
    started:  false,
    report:   { date:'', place:'労政会館', start:'', end:'', sei:'', fuku:'', note:'' },
    classes:  [
      { id:'A', name:'Aクラス', started:false },
      { id:'B', name:'Bクラス', started:false }
    ]
  };
  // ... 以降は既存 resetAll と同じ（localStorage 削除、DOM クリア、フォーム初期化）
}
```

→ A/B 固定 dict はここでは **温存**（破壊的変更回避）。Phase 5〜6 で動的キー化する場合は別タスク。

### 12.4 `load` / `applyLoadedJson` 仕様（003 で書き換え）

```javascript
// 仕様（実装はしない）

function load(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    var parsed = JSON.parse(raw);
    state = normalizeState(parsed);
  }catch(e){
    // 既存エラーハンドリング維持
  }
}

function applyLoadedJson(rawText){
  var loaded = JSON.parse(rawText);
  state = normalizeState(loaded);
  save();             // 同期書き込みで互換フィールドを最新化
  populateReportFields();
  renderRegList();
  renderPastParticipantsPanel();
  if(state.classes.some(function(c){ return c.started; })){
    if(isTournamentDone()){ showTab('result'); } else { showTab('tournament'); }
  } else {
    showTab('reg');
  }
}
```

### 12.5 `save()` 仕様（変更なし）

- `localStorage.setItem(STORAGE_KEY, JSON.stringify(state))`：state 全体を 1 件保存。`state.classes` も自動的にシリアライズされる
- 既存 SAVE-001 / SAVE-002 / SAVE-003 / SAVE-003b の verify 系は **classId 単位の callsiteId** に揃える（§6.5）

### 12.6 `readPersistedState()` 仕様（003 で書き換え）

現状（[L4001-4019](../../shogi_v4.html)）は A/B 必須キーで hardcode 検証し、`parsed` をそのまま返している。SAVE-003 verify では `persisted.started !== true` のように **直接フィールド読み** をしており、旧データ・C クラス追加・classes 補完前のいずれでも誤判定（false positive / false negative）が生じうる。

**新仕様（採用案 = 候補 A）**：`readPersistedState()` は **`normalizeState(parsed)` 済みの state を返す**。verify 系は normalized state を前提に比較できる。

```javascript
// 仕様（実装はしない）

function readPersistedState(){
  if(typeof localStorage === 'undefined') return null;
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(typeof raw !== 'string' || !raw) return null;
    var parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== 'object') return null;

    // 必須キーの最低限の object 性チェック（A/B 配列必須は廃止）
    if(!parsed.players  || typeof parsed.players  !== 'object') return null;
    if(!parsed.pairings || typeof parsed.pairings !== 'object') return null;
    if(!parsed.results  || typeof parsed.results  !== 'object') return null;

    // normalize：classes 補完 / players[cls] / pairings[cls] / results[cls] の配列性保証
    var normalized = normalizeState(parsed);
    if(!normalized || !Array.isArray(normalized.classes) || normalized.classes.length === 0) return null;

    // 配列性 sanity check：各 classId について 3 つとも配列であることを保証
    for(var i=0; i<normalized.classes.length; i++){
      var cid = normalized.classes[i].id;
      if(!Array.isArray(normalized.players[cid]))  return null;
      if(!Array.isArray(normalized.pairings[cid])) return null;
      if(!Array.isArray(normalized.results[cid]))  return null;
    }

    return normalized;
  }catch(e){
    if(typeof console !== 'undefined' && console.warn) console.warn('SAVE-003: readPersistedState failed', e);
    return null;
  }
}
```

**重要**（候補 A の採用根拠と仕様）：

| 項目 | 仕様 |
| --- | --- |
| 返り値 | **`normalizeState(parsed)` 済みの state**（`parsed` をそのまま返さない） |
| `classes` 補完 | normalizeState 内で `normalizeClasses(raw)` を必ず先に実行（§9.4 step 1） |
| `players[classId]` / `pairings[classId]` / `results[classId]` | classId-keyed object として補完。`normalizeDictByClasses` 経由で配列保証（§9.5） |
| 配列でない classId エントリの扱い | **verify failed として `null` を返す**（empty array に補正はしない）。理由：保存直後検証で配列が欠落していること自体が verify 失敗の根拠 |
| `started` フィールド | normalizeState 内で `base.started = classes.some(c => c.started)` を同期書き込み済（§9.4 step 7） |
| 旧データ互換 | `normalizeClasses` が A/B を補完するため、旧データ（`classes` 未定義 + `started:bool`）も自動的に normalized state として返る |
| SAVE-003 verify からの呼び出し | `classStartedInPersisted(persisted, classId)`（§12.7）は `persisted.classes` 配列を見るだけで判定可能。旧形式分岐は normalize 済のため不要 |

**呼び元への影響**：

- 既存の呼び元（[L4475](../../shogi_v4.html)、[L4718](../../shogi_v4.html)、[L4742](../../shogi_v4.html)、[L4905](../../shogi_v4.html)、[L4977](../../shogi_v4.html)、[L5270](../../shogi_v4.html)）は **`persisted_st.started !== true` のような直接読みをしている**。これらは `classStartedInPersisted(persisted, classId)` 経由に置換する（004 で着手）
- 既存 verify helper（`verifyPlayerPersistedById` 等）は `parsed.players[cls]` を直接読んでいるが、normalize 済 state でも同じアクセスで動く（dict 構造維持のため）。挙動互換

### 12.7 `classStartedInPersisted(persisted, classId)` 仕様

`persisted` は `readPersistedState()` の返り値、つまり **`normalizeState(parsed)` 済み state**（§12.6）。`persisted.classes` は必ず配列補完済のため、旧形式分岐は不要：

```javascript
// 仕様（実装はしない）

// 前提：persisted は readPersistedState() の返り値（normalized state、§12.6）
function classStartedInPersisted(persisted, classId){
  if(!persisted || !Array.isArray(persisted.classes)) return false;
  var k = persisted.classes.find(function(c){ return c && c.id === classId; });
  return !!(k && k.started === true);
}
```

- 旧データ（`classes` 未定義 / `started:bool` のみ）の互換は `readPersistedState()` 経由の normalizeState で吸収済（§9.3 案 a）
- 呼び元（004 で SAVE-003 verify を class 単位化する箇所）は **`readPersistedState()` の返り値以外を渡してはならない**。raw parsed をそのまま渡されると `persisted.classes` が未定義になり常に false を返す

### 12.8 「保存失敗時に started だけ進む事故」防止の考え方

- `applyStartForCandidates` は順序が「**state 書き換え → generatePairing → save → SAVE-003 verify**」（§6.4 / §6.5）
- save が失敗した場合：state は既に書き換わっており、UI 上は「開始済」表示。**rollback はしない**（既存 SAVE-003 設計と同じ。運営継続を優先）
- SAVE-003 verify で「保存が確認できませんでした」warning を **classId 単位で** 通知（§6.5）。運営者にバックアップを促す
- **rollback しない理由**：rollback して `state.started=false` に戻すと、pairings は生成済（UI 表示済）なのに started flag だけ false という不整合になる。むしろ state は書き換えたまま、save 確認のみ別 channel で警告する方が運営上安全（scope-001 §5.1 / inventory §7.7 と同じ判断）

---

## 13. エラー・警告仕様

### 13.1 validate phase の error kind

| kind | 発生条件 | 文言（仕様） | 出し方 | 優先順位 |
| --- | --- | --- | --- | --- |
| `total-too-few` | 全クラス参加者合計 < 2（bulk のみ、クラス横断） | `参加者が少なすぎます` | showMsg('err') | 1（最優先） |
| `too-few` | クラス内参加者数 = 1 | `<className>は参加者が1名のため開始できません` | showMsg('warn') | 2 |
| `odd` | クラス内参加者数 = 3, 5, 7, ...（2 以上の奇数） | `<className>が奇数です。運営者を追加してください` | showMsg('warn') | 3 |
| `no-candidate` | errors 0 件 + candidates 0 件（skip 内訳で文言分岐、§13.2.1） | §13.2.1 参照 | alert | 4（最終フォールバック） |

skip 系（error ではない、bulk では集約・single では明示エラー）：

| skip kind | 発生条件 | bulk での扱い | single での扱い |
| --- | --- | --- | --- |
| `skip-empty` | クラス内参加者数 = 0 | 対象外として continue（error にしない） | `<className>は参加者がいません` を showMsg('warn') |
| `skip-already-started` | `class.started === true` | 同上 continue | `<className>はすでに開始されています` を alert |

### 13.2 複数クラスエラーの集約表示（bulk 用）

```javascript
// 仕様（実装はしない）

function showStartValidationErrors(errors){
  if(errors.length === 1){
    var e = errors[0];
    if(e.kind === 'total-too-few')   { showMsg(e.message, 'err');  return; }
    if(e.kind === 'no-candidate')    { alert(e.message);            return; }
    if(e.kind === 'too-few')         { showMsg(e.message, 'warn'); return; }
    if(e.kind === 'odd')             { showMsg(e.message, 'warn'); return; }
  }
  // 複数エラー：全件を 1 alert にまとめる
  var msgs = errors.map(function(e){ return e.message; });
  alert('対局を開始できません：\n\n' + msgs.join('\n'));
}
```

#### 13.2.1 `no-candidate` の文言分岐（全クラス skip 内訳に応じて）

bulk で「errors 0 件 + candidates 0 件」のとき、skip 内訳を見て文言を分ける。実装は §6.3.3 の `resolveNoCandidateMessage(skipped)` helper：

| skip 内訳 | 文言（仕様） |
| --- | --- |
| 全クラスが `skip-empty`（参加者 0 のみ） | `開始できるクラスがありません。参加者を登録してください。` |
| 全クラスが `skip-already-started`（既開始のみ） | `未開始のクラスはありません。` |
| `skip-empty` と `skip-already-started` の混在 | `開始対象のクラスがありません。` |

理由：004 で `#startBtn` の UX を実装する際、「参加者を追加すべきか」「リセットすべきか」を運営者が判断しやすくなる。Codex Nice to Have 指摘への対応。

### 13.3 SAVE-003 verify の warning（再掲、§6.5）

- classId 単位で `callsiteId: 'SAVE-003-startTournament-' + classId`
- `kind: 'save-verify'`, `aggregateKey: 'save-verify:core'`, `severity: 'warn'`
- 既存 `notifySaveWarning` helper（[shogi_v4.html](../../shogi_v4.html)）に流し込む

### 13.4 `resetClassForClass(classId)` の confirm 文言

```
<className>の組み合わせ・勝敗結果を削除します。
他クラスのデータは保持されます。
よろしいですか？
```

「他クラスは保持」を明示することで、`resetTournamentProgressOnly`（全体リセット）との混同を防ぐ。

---

## 14. 実装しないこと

本 PR では **以下を実施しない**：

1. **実装変更**：`shogi_v4.html` / `index.html` / `data/` は 1 行も変更しない
2. **テスト変更**：`test/` / `test/e2e/` は 1 行も変更しない
3. **snapshot / VRT 変更**
4. **workflow / package 変更**
5. **localStorage migration 実装**
6. **UI DOM 変更**
7. **既存 docs の改訂**（scope-001 / inventory は触らない）
8. **A/B literal 置換**
9. **C クラス UI の実装**
10. **AI 非同期運用 v0.2 Draft の正式採用判断**
11. **Ready 化 / merge / branch 削除 / release / deploy / publish**
12. **main への直接 push**
13. **後続実装タスク（003 以降）の着手**

---

## 15. 後続実装タスク

### 15.1 タスク分割（更新版）

PR #136 §8 から：008（旧データマイグレ設計）を本仕様書 §9 に統合 → 並走可リストから外す。

| 優先 | Task ID | 内容 | 種別 | Risk |
| --- | --- | --- | --- | --- |
| **第一** | `ROUND-CLASS-START-003` | **state schema / helper / normalize 実装**。`state.classes` 配列導入、以下 helper 群を新設：`normalizeClasses` / `normalizeDictByClasses` / `emptyClassDict(classes, init)` / `isClassStarted` / `setClassStarted` / `syncGlobalStartedFromClasses` / `classStartedInPersisted`。`normalizeState` を §9.4 の組立順序で書き換え。`readPersistedState` を §12.6 の仕様で書き換え（**normalized state を返す**）。**unit test を集約**（normalize 互換、helper の pure 性、`state.started` 同期書き込み、§9.3 旧 `started:true` 展開、未知 classId の drop、空 raw / 破損 raw、readPersistedState の各 classId 配列保証）。**UI は変えない**。**per-class validator（`validateStartableClass` / `collectStartCandidates` / `collectStartCandidateForClass` / `applyStartForCandidates` / `verifyStartSavedForCandidates`）は 003 では作らない**（→ 004） | impl-LIGHT | Level 3 |
| **第二** | `ROUND-CLASS-START-004` | **対局開始 UI / atomic wrapper 実装 + per-class validator 新設**。以下を新設：(i) **per-class pure validator** `validateStartableClass(classInfo, playersForClass)`（§6.3.2、bulk / single 両方で再利用される core）、(ii) `collectStartCandidates(classes, players)`（§6.3.3 bulk 用）、(iii) `collectStartCandidateForClass(classId, classes, players)`（§6.3.4 single 用）、(iv) `applyStartForCandidates(candidates)`（§6.4 mutate）、(v) `verifyStartSavedForCandidates(candidates)`（§6.5）、(vi) `startTournament()`（atomic wrapper）/ `startTournamentForClass(classId)`（class atomic）/ `resetClassForClass(classId)`。`resetTournamentProgressOnly` / `resetAll` を §12 の仕様で書き換え。pane-{classId} 上部に「クラス別開始 / リセット」ボタン追加。**003 の helper interface（`setClassStarted` / `classStartedInPersisted` / `readPersistedState`）に依存**。VRT snapshot 更新は別 AR で明示許可制 | impl-LIGHT | Level 3 |
| **第三** | `ROUND-CLASS-START-005` | **周辺ガード + 隣接リスク合流**。`isTournamentDone` を `state.classes` 走査に置換。L3786 削除ガードを `isClassStarted(player.cls)` に置換。inventory §5.7 の隣接リスク（`renderRegList ['A','B']` / `a-count`,`b-count` / `addPlayer state.players.A.concat(.B)` / 保存 verify A/B 走査）を取り込み確認。**新規 C クラスは導入しない**、既存 A/B のクラス独立性のみ強化 | impl-LIGHT〜MEDIUM | Level 3 |
| **第四** | `ROUND-CLASS-START-006` | **E2E + warning aggregation 回帰確認**。(a) A 単独開始 → B 後追い開始の golden path、(b) Aクラス偶数 / Bクラス奇数で `#startBtn` 押下時に **state が変化しないこと**（bulk all-or-nothing の核）、(c) **A が開始可能 / B が奇数の状態で `startTournamentForClass('A')` が A 単独開始できること**（class atomic、Codex Must Fix 1.1 の核）、(d) A 開始済 / B 未開始時の B 参加者削除許容、(e) A 進行中の `resetClassForClass('B')` で A 保護、(f) 旧データロード互換（`started:true` のみ → `classes` 展開）、(g) SAVE-003 verify per-class 発火、(h) **warning aggregation 回帰確認**（classId 単位 callsiteId 化後も `aggregateKey:'save-verify:core'` の集約が破綻しない、同一クラス内重複 warning が過剰表示されない、別クラス警告が不自然に潰されない）、(i) Cクラス相当のダミー追加で renderRegList / `#startBtn` が壊れないこと（007 が完了している場合） | test | Level 3 |
| 並走可 | `ROUND-CLASS-START-007` | **C クラス UI 詳細設計**（参加者登録 select の動的化、pane-{classId} / result-{classId} の動的生成、改ページ CSS の汎用化、a11y、レイアウト）。実装は別タスク | docs-only | Level 1 |

**`ROUND-CLASS-START-008` は本仕様書 §9 に統合済** → タスクリストから除去。

#### 15.1.1 per-class validator の担当 PR（Codex 指摘明示）

「per-class pure helper（`validateStartableClass`）はどの PR で実装するか」の判断：

| 案 | 採否 | 理由 |
| --- | --- | --- |
| 003 に含める（state/helper と一緒） | ❌ | 003 は state schema / normalize に集中する。validator は startTournament 系の wrapper と密接で、別 PR の境界が不自然になる |
| **004 に含める**（atomic wrapper と一緒） | ✅ **採用** | `validateStartableClass` は `collectStartCandidates` / `collectStartCandidateForClass` / `startTournament` / `startTournamentForClass` と同じ PR でレビューされたほうが atomic 性の検証が容易 |

→ **per-class validator は 004 で実装**。003 は validator を作らない。004 が 003 の helper interface に依存する形で接続する（`setClassStarted` / `classStartedInPersisted` / `readPersistedState` の 3 つ）。

### 15.2 依存関係（更新版）

```
ROUND-CLASS-START-002 (本仕様書、§9 で 008 統合)
        │
        ▼
ROUND-CLASS-START-003 (state schema + helper + normalize + 互換テスト)
        │
        ▼
ROUND-CLASS-START-004 (UI クラス別ボタン + atomic wrapper)
        │
        ▼
ROUND-CLASS-START-005 (参加者ガード + §5.7 隣接リスク合流)
        │
        ▼
ROUND-CLASS-START-006 (E2E)

並走可：
  ROUND-CLASS-START-007 (C クラス UI 設計、いつでも着手可)
```

### 15.3 着手判断ポイント

- `ROUND-CLASS-START-003` 着手時：本仕様書 §6〜§10 の helper シグネチャ / §9 の normalize 仕様を凍結要件として扱う
- `ROUND-CLASS-START-004` 着手時：本仕様書 §6 / §11 / §12 のボタン UX 仕様、VRT snapshot 影響の許可取得
- `ROUND-CLASS-START-005` 着手時：inventory §5.7 隣接リスクの取り込み範囲確認
- `ROUND-CLASS-START-006` 着手時：snapshot 更新を含む場合は AR 分離

---

## 16. レビュー観点

### 16.1 仕様の網羅性

- §6.3.1 の **bulk atomic vs class atomic** の境界が、シリーズ中心目的（A 単独開始 / B 後追い開始 / 独立進行）と一貫しているか
- §6.3.2 の per-class pure validator `validateStartableClass` が、bulk / single の両方で安全に再利用できるシグネチャになっているか
- §7.6 の `startTournamentForClass(classId)` が、他クラスの odd / too-few / 未開始状態に **引きずられない** ことが明確か
- §6 の `#startBtn` 一括開始 atomic 性が、PR #136 Codex Must Fix の要件をすべて満たしているか
- §6.2 の「対象クラス」定義が、現場運用（A だけ大会 / 後追い B / 参加者 0 クラス）に矛盾しないか
- §6.2.3 の error 優先順位（`total-too-few` → `too-few` → `odd` → `no-candidate`）が表と疑似コードで一致しているか
- §9 の旧データ互換（案 a：両クラス started=true）が、scope-001 §8.4 と整合しているか

### 16.2 helper 設計の妥当性

- §10 の pure / writer / reader / wrapper の境界が、テスト容易性を担保しているか
- グローバル `state` 非参照原則が helper 一覧（§10.1）で正しく適用されているか
- `setClassStarted` 経由必須 / 直接代入禁止のルール（§8.2）が運用可能か

### 16.3 段階的移行の安全性

- §5.3 の Phase 1〜4 で破壊的変更が発生しないか（A/B dict 構造温存）
- §12.4 / §12.6 の load / readPersistedState 書き換えが、旧データを壊さないか
- `state.started` 同期書き込み案 B（§8）が、純 derived 案 C を排除する根拠として十分か

### 16.4 旧データ互換（§9）

- 案 a（両クラス started=true 保守的展開）の現場リスクは許容できるか
- 暗黙マイグレ（UI 通知なし）の方針は運営者の混乱を招かないか
- 未知 classId（rawDict にあるが classes になし）の drop ルールが妥当か

### 16.5 SAVE-003 verify

- callsiteId を classId 単位（`SAVE-003-startTournament-A` 等）に変更することで、既存 aggregation / indicator のカウント挙動が壊れないか
- save 失敗時に「started だけ進む」事故防止の考え方（§12.8 / rollback しない）が運用要件に合っているか

### 16.6 後続タスク分割

- §15 の 003〜007 分割（008 は本仕様書に統合）が、PR 1 個あたりの review コスト・回帰リスクとして適切か
- 003 と 004 の境界（schema 実装 vs validator + UI 実装）が明確か
- per-class validator を 004 に寄せた判断（§15.1.1）が妥当か（atomic wrapper と一緒にレビューする選択）

### 16.7 完了条件の照合

- docs-only である（実装・テスト・workflow・snapshot 未変更）
- `#startBtn` の all-or-nothing 仕様が明確（§6）
- `#startBtn` 対象クラス定義が確定（§6.2）
- classId 単位 started 仕様が確定（§7）
- `state.started` 同期書き込み互換仕様が確定（§8）
- 旧データ normalize 仕様が確定（§9）
- helper 設計方針が確定（§10）
- 後続タスク分割が更新（§15）
- 「ready 化 / merge / branch 削除 / release / deploy / publish しない」が遵守されている

---

## 17. 結論

- **`#startBtn` 一括開始（bulk atomic）**：atomic wrapper（validate phase / mutate phase 分離）として実装。**bulk atomicity の境界は対象クラス全体**。sequential mutate wrapper は **禁止**（§6）
- **`startTournamentForClass(classId)`（class atomic）**：**class atomicity の境界は対象 classId 1 つ**。他クラスの odd / too-few / 未開始状態に **引きずられない**。A が開始可能 / B が奇数の状態でも、`startTournamentForClass('A')` は A を開始できる（§6.3.1 / §7.6）
- **共通 per-class pure validator** `validateStartableClass(classInfo, players)` を bulk / single の両方で再利用。bulk は `collectStartCandidates(classes, players)`、single は `collectStartCandidateForClass(classId, classes, players)` で wrap（§6.3.2 / §6.3.3 / §6.3.4）
- **`#startBtn` 対象クラス**：候補 A（参加者あり + 未開始）+ 参加者 0 / 既開始は skip（§6.2）。error 優先順位：`total-too-few` → `too-few`（クラス内 1 名）→ `odd` → `no-candidate`（§6.2.3）
- **classId 単位 started**：`state.classes[i].started` を正、`state.started` は **互換フィールド（同期書き込み）**（§7 / §8）。直接代入の例外は `normalizeState` / `resetAll` / `resetTournamentProgressOnly` の 3 つに限定（§8.2）
- **旧データ互換**：scope-001 §8.4 案 a（旧 `started:true` を両クラスに保守的展開）を採用、暗黙マイグレ（UI 通知なし）（§9）
- **`readPersistedState()`**：**normalized state を返す**（候補 A 採用、§12.6）。各 classId について `players[classId]` / `pairings[classId]` / `results[classId]` の配列性を sanity check
- **helper 設計**：pure / writer / reader / wrapper の境界を厳格化、グローバル `state` 非参照原則（§10）
- **後続タスク**：008 を本仕様書 §9 に統合 → 003 → 004 → 005 → 006、007 は並走可（§15）

本 PR は **docs-only**。実装は `ROUND-CLASS-START-003` 以降で扱う。
