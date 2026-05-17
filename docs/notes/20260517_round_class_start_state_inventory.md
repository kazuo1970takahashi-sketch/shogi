# SHOGI-TOUR｜対局開始状態の可変クラス対応 棚卸し・設計（ROUND-CLASS-START-001）

**Task ID**: `ROUND-CLASS-START-001`
**作業種別**: docs-only / 棚卸し / 軽量設計
**作成日**: 2026-05-17
**HEAD（作成時点の main）**: `eedb3d6`（PR #134 squash merge 後の main = ROUND-CLASS-SCOPE-001）
**位置づけ**: `ROUND-CLASS-SCOPE-001`（PR #134）の **後続棚卸し**。対局開始まわりに限定して、A/B 固定箇所と Cクラス以上で壊れる箇所を具体的に列挙し、小さく分割した後続タスク候補を提案する。**実装はしない**。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **対象ファイル（参照のみ、本 PR では未変更）**:
  - [shogi_v4.html](../../shogi_v4.html)（6,119 行）
- **前提となる既存設計**:
  - [docs/specs/20260516_shogi_round_class_scope_001.md](../specs/20260516_shogi_round_class_scope_001.md)（ROUND-CLASS-SCOPE-001 / PR #134）：対局開始 / 次回戦生成 / 結果入力 / 進行状態 / 保存確認 を classId 単位に分離する全体設計
- **本 PR の差分**:
  - scope-001 が「対局開始＋次回戦＋結果＋保存」までを包括的に扱ったのに対し、本 note は **「対局開始ボタン押下から各クラス Round 1 が走り始めるまでの遷移と state」** に絞って棚卸し・設計指針を整理する。

---

## 1. 目的

将来 A/B/C/… とクラス数が可変になった場合に **対局開始まわり** で壊れる箇所を、後続実装タスクが安全に着手できる粒度まで具体化する。

具体的には：

- 対局開始ボタンの押下 → `state.started` 切替 → `state.pairings` / `state.results` 初期化 → `generatePairing(cls)` 呼出までの **線形フロー** を可視化する
- そのフロー上で A/B が直接 literal として書かれている箇所を列挙する
- C クラス以上が追加された場合に壊れうる箇所を「**state スキーマ系**／**UI DOM 系**／**運用シナリオ系**」に分類する
- classId / className ベースで持つべき設計方針を、scope-001 §4〜§11 に対する **追補** として整理する
- 後続実装タスクを「最初の 1 歩は何か」が分かる粒度に分割する

---

## 2. 背景

### 2.1 現場運用上の懸念（再掲）

scope-001 §1.3 の通り、A 進行中・結果入力途中で B が後追い登録された場合、現在の UI には「B だけ開始」ボタンがない。回避策として `resetTournamentProgressOnly` を押すと A の pairings / results も同時に消える。

### 2.2 scope-001 で確定済みの事項

- `state.classes = [{id, name, started}]` 配列を **新規追加** する方針（scope-001 §4.1 / §11.1）
- 既存 `state.players[cls]` / `state.pairings[cls]` / `state.results[cls]` の dot/bracket アクセスは **当面温存**（scope-001 §4.4）
- **`state.classes[i].started` を正とし**、`state.started` は当面互換性維持のため残す。`setClassStarted(classId, value)` 実行時に **all-class OR を `state.started` へ同期書き込み** することで旧コード（`state.started` 直読み）の互換を保つ（scope-001 §11.3 案 B 推奨）。`Object.defineProperty` 等の純 derived getter（scope-001 §11.3 案 C）は別案で、本 note では **採用しない**（JSON serialize / normalizeState との整合性が複雑になるため）
- `startTournamentForClass(classId)` / `resetClassForClass(classId)` を新設、既存 `startTournament()` は wrapper として残す（scope-001 §5.1 / §5.2）

→ 本 note は **これら方針を前提に**、対局開始まわりの具体箇所と分割タスクを詰める。

### 2.3 本 note で深掘りする観点（依頼書より）

- A/B 直接参照、`class === 'A'` / `class === 'B'` の固定分岐
- DOM ID が A/B 固定（`pane-A` / `pane-B` / `result-A` / `result-B` / `bulkEditA` / `bulkEditB` / `a-count` / `a-list` 等）
- 「対局開始済み」判定が全体単位 (`state.started`) かクラス単位か
- 1局目開始後の参加者追加・削除・修正に対する制約
- 次回戦生成のクラス独立性
- UI 上のボタン表示がクラス数増加に耐えられるか
- 「A だけ開始済、B は未開始」を許容する運用方針

---

## 3. 現在の対局開始フローの概要

「登録完了・対局開始」ボタン押下から各クラスの Round 1 表示までを、現状コード ([shogi_v4.html](../../shogi_v4.html) ベース) で線形に並べる。

```
[#startBtn click]                                    bindRegistrationEvents L5998
   ↓
startTournament()                                    L4441
   │
   ├─ total = state.players.A.length + state.players.B.length    L4442  ★A/B固定
   │
   ├─ if(state.started===true) alert(...) return;                L4453  ★全体フラグ
   │
   ├─ if(total<2) showMsg('参加者が少なすぎます') return;        L4457
   │
   ├─ if(state.players.A.length%2!==0 && >0)                     L4458  ★A/B固定
   │      showMsg('Aクラスが奇数です…')
   ├─ if(state.players.B.length%2!==0 && >0)                     L4459  ★A/B固定
   │      showMsg('Bクラスが奇数です…')
   │
   ├─ hasOngoing = state.started &&                              L4460  ★全体フラグ
   │       (state.pairings.A.length>0 || state.pairings.B.length>0
   │       || state.results.A.length>0 || state.results.B.length>0)
   ├─ if(hasOngoing) confirm('進行中の大会データ…')              L4464
   │   ※ 通常フローでは到達しない inert / dead fail-safe。
   │      直前の L4453 `state.started===true` ガードで早期 return する一方、
   │      ここに来た時点では state.started=false なので hasOngoing も false。
   │      `state.started=false` で pairings/results のみ残る異常データ用の防御コード
   │      （[shogi_v4.html:4449-4452](../../shogi_v4.html) コメント明記）。
   │      可変クラス化時は「dead path だが残置」のまま温存するか、削除するかを再評価する対象。
   │
   ├─ state.started = true;                                      L4467  ★全体フラグ
   ├─ state.pairings = {A:[], B:[]};                             L4468  ★A/B固定
   ├─ state.results  = {A:[], B:[]};                             L4469  ★A/B固定
   │
   ├─ if(state.players.A.length>0) generatePairing('A');         L4470  ★A/B固定
   ├─ if(state.players.B.length>0) generatePairing('B');         L4471  ★A/B固定
   │
   ├─ showTab('tournament');                                     L4472
   ├─ save();                                                    L4472
   │
   └─ SAVE-003 verify:                                           L4475-4485
        persisted_st = readPersistedState();
        if(!persisted_st || persisted_st.started !== true) {     ★全体フラグ
          notifySaveWarning({...callsiteId:'SAVE-003-startTournament'...});
        }
```

このフローの中で **classId に依存できる部分**（`generatePairing(cls)` 等）は scope-001 §3.1 が示した通りすでにクラス単位で動く。逆に言えば **線形に上から下まで A/B 固定で書かれている入口（startTournament 本体）が、後続 Phase で最も触る場所** になる。

---

## 4. 対局開始状態に関係する主な関数・状態・DOM要素

### 4.1 関数

| 関数 | 行 | 役割 | A/B 固定度（代表的な箇所） |
| --- | --- | --- | --- |
| [`startTournament()`](../../shogi_v4.html) | L4441-4486 | 対局開始の入口。state 切替 + 初期化 + generatePairing 呼出 + SAVE-003 verify | **高**（`.A`/`.B` literal の出現 9 件、加えて `state.started` 単一フラグ参照 1 件＝§5.1 で 10 行棚卸し） |
| [`resetTournamentProgressOnly()`](../../shogi_v4.html) | L5924-5943 | 進行データのみリセット。`state.started=false` + `pairings/results={A,B}=[]` + pane クリア | **高**（§5.2 で 5 行棚卸し、内訳は state.started 1 + 初期化 2 + DOM 2） |
| [`resetAll()`](../../shogi_v4.html) | L5945-5975 | 全リセット。state 全体を `{A:[],B:[]}` で再初期化 | **高**（§5.3 で 2 行棚卸し、内訳は state hardcode 1 + DOM 1） |
| [`normalizeState(raw)`](../../shogi_v4.html) | L433-489 | load 後の state 正規化。base 初期化 + `['A','B'].forEach` で各クラス正規化 | **高**（`['A','B']` 配列） |
| [`isTournamentDone()`](../../shogi_v4.html) | L6083-6093 | 「参加者のいるクラス全てが全 round 消化済か」判定。`for(i=0;i<2;i++) cls=['A','B'][i]` | **高**（クラス数 2 を hardcode） |
| [`initApp()`](../../shogi_v4.html) | L6095-6108 | 起動時に `state.started` を見て tournament / result タブ復元 | 中（`state.started` 単一フラグ依存） |
| [`applyLoadedJson(rawText)`](../../shogi_v4.html) | L5633-5649 | JSON load 後に `state.started` を見て tab 振り分け | 中（同上） |
| [`generatePairing(cls)`](../../shogi_v4.html) | L4629〜 | 当該クラスの組合せ生成。scope-001 §3.1 で確認済の class-scoped 関数 | **低**（cls 引数のみ） |
| `bindRegistrationEvents()` | L5994-... | `#startBtn` → `startTournament` バインド | 中（単一ボタンのみ） |
| `bindHeaderEvents()` | L5984-5992 | `#resetBtn` → `resetAll`、`#resetProgressBtn` → `resetTournamentProgressOnly` | 中（全体スコープ前提） |

### 4.2 状態（state）

| state パス | 初期値 / 構造 | 開始まわりでの読み書き |
| --- | --- | --- |
| `state.started` | `false`（L216 / L4467 / L5927 / L5947） | startTournament で true、reset 系で false。**大会全体の単一 boolean** |
| `state.players` | `{A:[], B:[]}`（L212 / L434 / L5947） | startTournament でクラス別に length / parity を見る |
| `state.pairings` | `{A:[], B:[]}`（L214 / L434 / L5947） | startTournament で `{A:[],B:[]}` 代入 + generatePairing(cls) で push |
| `state.results` | `{A:[], B:[]}`（L215 / L434 / L5947） | startTournament で `{A:[],B:[]}` 代入。Round 確定で push |
| `state.rounds` | `4`（L213 / L434 / L5947） | クラス共通（クラス別 rounds は無い） |
| `state.report` | `{date, place, …}` | 開始状態とは独立 |
| `STORAGE_KEY` | `'shogi_v4'`（L220） | state 全体を 1 件で保存 |

### 4.3 DOM 要素

| ID | 用途 | クラス固定度 |
| --- | --- | --- |
| `#startBtn` (L155) | 「登録完了・対局開始」**1 個のみ**。`state.started` 全体フラグに対応 | 単一（全体スコープ） |
| `#resetBtn` (L100) | 「大会データを全リセット」 | 単一 |
| `#resetProgressBtn` (L101) | 「大会進行データをリセット」 | 単一 |
| `#inp-class` (L124-127) | 参加者登録の select。`<option value="A">` / `<option value="B">` の **2 つ固定** | **高**（HTML literal） |
| `#a-list` / `#b-list` (L142 / L149) | 各クラス参加者一覧 | **高**（A/B 固定） |
| `#a-count` / `#b-count` (L139 / L146) | 参加者数バッジ | **高**（A/B 固定） |
| `#bulkEditA` / `#bulkEditB` (L140 / L147) | 名前一括編集ボタン | **高**（A/B 固定） |
| `#pane-A` / `#pane-B` (L162-163) | 対局タブ内クラス別 pane | **高**（A/B 固定 / `display:grid grid2`） |
| `#result-A` / `#result-B` (L168-169) | 結果タブ内クラス別 pane | **高**（A/B 固定。print 時 `#result-B { page-break-before: always }` ([L82](../../shogi_v4.html)) で改ページ前提） |
| `<h3>Aクラス</h3>` / `<h3>Bクラス</h3>` (L139 / L146) | クラス見出し文言 | **高**（i18n 不可、固定文字列） |

### 4.4 「対局開始済み」判定の現状

| 利用箇所 | 判定式 | スコープ |
| --- | --- | --- |
| `startTournament` ガード（L4453） | `state.started === true` | **全体** |
| 参加者削除ガード（L3786） | `state.started && pastMatches>0` | **全体**（pastMatches はクラス別履歴件数だが、その手前のフラグは全体） |
| 起動時 tab 復元（L6101） | `state.started` | **全体** |
| load 後 tab 復元（L5640） | `state.started` | **全体** |
| SAVE-003 verify（L4476） | `persisted_st.started !== true` | **全体** |
| `hasOngoing` fail-safe（L4460-4463） | `state.started && (pairings.A/B or results.A/B 非空)` | **全体**（混合）／**通常到達しない inert / dead fail-safe**（[L4449-4452](../../shogi_v4.html) コメント参照、L4453 で `state.started===true` を return 済のため、ここに来た時点では `state.started=false` で hasOngoing も常に false） |

→ 開始済み判定は **すべて `state.started`（全体単一）に集約**。クラス単位の判定は存在しない。`hasOngoing` 経路だけは現状コード上は **inert（到達不能）** な防御コードであり、有効フローとしては扱わない。可変クラス化時に「残置のまま classes 走査に書き換える / 削除する」のどちらにするかを再評価する。

---

## 5. A/B固定前提が疑われる箇所（対局開始まわり）

scope-001 §3.2 / §9.1 が全体で「概算 40 件前後」と概算したうち、**対局開始フローに直接効いてくる**ものを以下に絞り込む。実装着手時の正確なカウントは別 Phase で行う。

### 5.0 件数表記の定義（読み違い防止）

本 §5 で「**§5.1 で 10 行**」のように数える件数は **「行単位の棚卸し件数」**（1 行 = 1 改修ポイント）であり、**「`.A`/`.B` の literal 出現件数」とは厳密には異なる**。

- **行単位の棚卸し件数**：可変クラス化で touch するコード行の数。`state.started` のように literal `.A`/`.B` を含まない行（全体フラグ）も改修対象として 1 行と数える。本 §5 の各表で `#1` 〜 などの番号で列挙されているもの。
- **literal 出現件数**：`.A` / `.B` / `'A'` / `'B'` / `{A:...,B:...}` 等が grep で何件 hit するかという別観点。§3.2 / §9.1 / §11 の概算値はおおむねこちら寄り。

→ 文中で「○ 箇所」と書いた場合、原則として **行単位の棚卸し件数** を指す。literal 出現件数を指す場合は明示する。

§4.1 表の `startTournament` 欄に「literal 出現 9 件 / 行単位 10 行棚卸し」と注記したのも同じ意図。

### 5.1 startTournament 内部（最重要）

| # | 行 | 該当コード | 種別 |
| --- | --- | --- | --- |
| 1 | L4442 | `state.players.A.length + state.players.B.length` | `.A` / `.B` dot 記法 |
| 2 | L4458 | `state.players.A.length%2!==0 && state.players.A.length>0` | dot 記法 + 個別文言 (`'Aクラスが奇数…'`) |
| 3 | L4459 | `state.players.B.length%2!==0 && state.players.B.length>0` | dot 記法 + 個別文言 (`'Bクラスが奇数…'`) |
| 4 | L4460-4463 | `state.pairings.A.length>0 \|\| state.pairings.B.length>0 \|\| state.results.A.length>0 \|\| state.results.B.length>0` | dot 記法 4 件 |
| 5 | L4467 | `state.started = true;` | **全体フラグ** |
| 6 | L4468 | `state.pairings = {A:[], B:[]};` | **A/B 固定ディクショナリ初期化** |
| 7 | L4469 | `state.results = {A:[], B:[]};` | **A/B 固定ディクショナリ初期化** |
| 8 | L4470 | `if(state.players.A.length>0) generatePairing('A');` | string literal `'A'` |
| 9 | L4471 | `if(state.players.B.length>0) generatePairing('B');` | string literal `'B'` |
| 10 | L4476 | `persisted_st.started !== true` | **全体フラグ**（クラス単位検証なし） |

### 5.2 resetTournamentProgressOnly 内部

| # | 行 | 該当コード | 種別 |
| --- | --- | --- | --- |
| 11 | L5927 | `state.started=false;` | 全体フラグ |
| 12 | L5928 | `state.pairings={A:[],B:[]};` | A/B 固定 |
| 13 | L5929 | `state.results={A:[],B:[]};` | A/B 固定 |
| 14 | L5935-5936 | `getElementById('pane-A').innerHTML=''; … 'pane-B' …` | DOM ID 直書き |
| 15 | L5937-5938 | `getElementById('result-A').innerHTML=''; … 'result-B' …` | DOM ID 直書き |

### 5.3 resetAll 内部

| # | 行 | 該当コード | 種別 |
| --- | --- | --- | --- |
| 16 | L5947 | `state={players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,...}` | state 全体 hardcode |
| 17 | L5959-5962 | `pane-A` / `pane-B` / `result-A` / `result-B` DOM クリア | DOM ID 直書き |

### 5.4 起動・load 復元

| # | 行 | 該当コード | 種別 |
| --- | --- | --- | --- |
| 18 | L6086 | `var cls=['A','B'][i];`（`isTournamentDone`） | クラス数 2 hardcode |
| 19 | L6087 | `if(state.players[cls].length>0)` ループ内 | bracket 記法だが for(i=0; i<2) で固定 |
| 20 | L6101 | `if(state.started)` 起動 tab 復元 | 全体フラグ |
| 21 | L5640 | `if(state.started)` load 後 tab 復元 | 全体フラグ |
| 22 | L438 | `normalizeState` 内 `['A','B'].forEach` | A/B 配列 hardcode |

### 5.5 HTML / DOM

| # | 行 | 該当 | 種別 |
| --- | --- | --- | --- |
| 23 | L82 | `#result-B{page-break-before:always}` | print CSS で B 固有 |
| 24 | L125-126 | `<option value="A">Aクラス</option>` / `<option value="B">Bクラス</option>` | 選択肢 hardcode |
| 25 | L139 | `<h3>Aクラス <span id="a-count">…</h3>` | 文言 + ID |
| 26 | L140 | `<button id="bulkEditA">` | ID |
| 27 | L142 | `<div id="a-list"></div>` | ID |
| 28 | L146-149 | 同 B クラス側 | 同上 |
| 29 | L155 | `<button id="startBtn">登録完了・対局開始</button>` **単一** | UI スコープが全体のみ |
| 30 | L162-163 | `<div id="pane-A"></div><div id="pane-B"></div>` | ID |
| 31 | L168-169 | `<div id="result-A"></div><div id="result-B">…</div>` | ID |

### 5.6 周辺（直接の開始処理ではないが、開始済み判定で連動）

| # | 行 | 該当 | 種別 |
| --- | --- | --- | --- |
| 32 | L3786 | `if(state.started&&pastMatches>0)` 削除ガード | 全体フラグ |
| 33 | L5721-5725 | `state.players.A.forEach` / `state.results.A.forEach` / 同 B | dot 記法 |
| 34 | L5995-5996 | `bulkEditA` / `bulkEditB` の click handler に `'A'` / `'B'` string 渡し | string literal |

### 5.7 隣接リスク：参加者登録・表示・保存 verify 系の A/B 固定

本 PR の主対象は **対局開始状態** だが、参加者登録・表示・保存 verify 系にも JS 側の A/B 固定が残っており、**対局開始の可変クラス化と同時または直後に確認が必要な隣接リスク** である。本 §5 の主要 34 件には含めないが、後続タスク（特に `ROUND-CLASS-START-005`）で扱う対象として列挙しておく。

| # | 行 | 該当 | 種別 | 隣接性 |
| --- | --- | --- | --- | --- |
| A1 | L3251-3267 | `renderRegList()` 冒頭の `var clsList=['A','B'];` + `cls==='A'?'a-count':'b-count'` / `cls==='A'?'a-list':'b-list'` 分岐 | `['A','B']` 配列 + literal 分岐 | reg 画面の描画。`#a-count` / `#b-count` の DOM ID 三項演算（§5.5 #25, #28 と対） |
| A2 | L3269 | `var allCount=state.players.A.length+state.players.B.length;` | dot 記法 | 合計表示 |
| A3 | L338, L1353, L2036, L3671, L3868, L4430 | `state.players.A.concat(state.players.B)` の 6 箇所 | dot 記法 | 名前重複検出 / 全件走査。`addPlayer` ([L3671](../../shogi_v4.html)) を含む |
| A4 | L1395, L1466, L1670, L1822, L3038, L3252, L3397, L3454, L3506, L4051 ほか | 関数ローカル `var classes=['A','B'];` / `var regClasses=['A','B'];` / `var existClasses=['A','B'];` 系 | `['A','B']` 配列 | bulk-edit / 過去参加者再追加 / マスタ系（10 箇所前後、本 PR では再列挙のみ） |
| A5 | L5721-5725 | renderResults / 結果集計の `state.players.A.forEach` / `.B.forEach` | dot 記法 | 結果画面（§5.6 #33 と一部重複） |
| A6 | SAVE verify 系（`verifyPlayerPersistedById(id, cls, name)` ほか、L1873 / L1912 / L2070 / L3369 など） | helper 引数経由で cls を渡すが、呼び元側で `clsList=['A','B']` を回す箇所が複数 | cls 引数 + 配列 hardcode | SAVE-001 / SAVE-003b 系の callsite。可変クラス化で **callsiteId の表記** に classId 反映が必要 |

**位置づけ**：本 PR では棚卸しのみ。可変クラス化の `state.classes` 導入後は、これらの `['A','B']` 配列を **`state.classes.map(c => c.id)`** に置換 / 引数化していく必要がある。`renderRegList` / `addPlayer` / 保存 verify の callsite は **対局開始まわりと同じ可変クラス語彙で動く必要があるため、`ROUND-CLASS-START-005` に明示的に接続する**。

> 注：「対局開始の主動線」（§5.1 〜 §5.6 の 34 件）と「隣接リスク」（§5.7 の 6 グループ）は **本 note では別カテゴリ** として扱う。一括カウントには含めない（§4.1 / §11 の件数表記参照）。

---

## 6. Cクラス以上追加時に壊れうる箇所（分類）

§5 の 34 箇所を「壊れ方の種類」で 3 系統に分類する。後続タスクはこの分類に沿って分割する。

### 6.1 state スキーマ系（C を push しても自動補完されない）

| 観点 | 該当（§5 #） | 期待される挙動 | 現状の壊れ方 |
| --- | --- | --- | --- |
| state 初期値が A/B 固定 dict | 16（resetAll）、状態定義 L211-218 | `state.players[classId]=[]` を classes 全件で初期化 | C 追加後に `state.players.C` が undefined になる場面がある |
| pairings/results の reset | 6, 7, 12, 13 | classes 全件分の空配列を作る | C を含めた初期化が起きず、`state.pairings.C is undefined` で例外 |
| normalizeState の補完 | 22 | classes 配列 + 動的キーで補完 | A/B しか補完しないため、C を含む JSON を read しても C が消える可能性 |
| `state.started` 単一フラグ | 5, 10, 11, 20, 21, 32 | classId 単位 + derived OR | C を後追い開始しようとすると alert で停止（A/B 後追いと同じ症状） |
| SAVE-003 verify | 10 | classId 単位の検証 | C 開始の SAVE-003 verify が書けない |

### 6.2 UI / DOM 系（C 用 DOM が無いと描画されない）

| 観点 | 該当（§5 #） | 期待される挙動 | 現状の壊れ方 |
| --- | --- | --- | --- |
| クラス別 pane | 30 (`pane-A`/`pane-B`) | classes 全件分 `pane-{id}` を動的生成 | C を generatePairing しても描画先 DOM が無いため renderTournament が黙って no-op になる |
| クラス別 result | 31 (`result-A`/`result-B`) | 同上、`result-{id}` を動的生成 | 結果タブで C が出ない |
| 参加者一覧（reg） | 25, 27, 28 | classes 全件分の list / count を動的生成 | C 参加者を登録しても reg 画面で一覧が出ない |
| クラス別一括編集ボタン | 26, 28, 34 | classes 全件分 `bulkEdit{id}` を動的生成 | C 一括編集 UI が無い |
| 参加者登録 select | 24 | classes 全件で option を動的生成 | C を選択して登録できない |
| 開始ボタンの単一性 | 29 (`#startBtn` 1 個) | クラス単位 + 一括の 2 系統 | 「C だけ開始」ができない |
| 結果タブの改ページ CSS | 23 (`#result-B { page-break-before }`) | classId 走査でクラス間に改ページ | C 結果が直前クラスと同ページに混ざる可能性 |
| クラス見出し文言 | 25, 28 | `className`（'Cクラス'）を state から取得 | UI ハードコードのまま |

### 6.3 運用シナリオ系（コードは動くがオペレーションが破綻）

| シナリオ | 現状の挙動 | 期待される挙動 |
| --- | --- | --- |
| A 開始済 / B 未開始 / C 未開始 → C 後追い開始 | `state.started===true` で alert、resetTournamentProgressOnly で A/B/C 全消し | C のみ Round 1 を開始、A/B は保護 |
| A・B・C を別タイミングで開始 | 開始は 1 回しかできない、3 系統独立進行が UI 上不可 | 各クラス独立に start / reset |
| 一括「対局開始」ボタンの挙動 | `{A:[],B:[]}` のみ初期化 | classes 全件初期化 + 未開始クラスをまとめて開始 |
| 参加者削除ガード（pastMatches） | `state.started` 全体フラグで判定 | 当該 player の **当該クラスが** started かで判定 |
| `isTournamentDone` 全体判定 | `for(i=0;i<2)` でクラス数 hardcode | `state.classes.forEach` でクラス数可変対応 |
| 1局目開始後の参加者追加 | クラス問わず削除不可、A/B いずれでも `state.started` ガード | 該当クラスのみガード（他クラスは自由に編集可） |
| 結果タブ印刷の改ページ | `#result-B` 固定で 2 ページ目以降想定 | classes 件数に応じて改ページ動的化 |

---

## 7. classId / className ベースでの設計方針（scope-001 への追補）

scope-001 §4〜§11 で大枠は決まっている。本 note では **対局開始まわりに限定した追補**を整理する。

### 7.1 「開始済み」判定をクラス単位にする

- **正となる state**：`state.classes[i].started`（クラス単位の真実）
- **読み取り API**：`isClassStarted(classId)`（scope-001 §11.2 案）
- **書き込み API**：`setClassStarted(classId, value)`（同上）。書き込みと同時に `state.started = state.classes.some(c => c.started)` を **同期書き込みして互換維持** する（scope-001 §11.3 案 B 推奨）。`state.started` は純粋な derived プロパティではなく、**旧コードからの読み取り互換のための「常に最新の OR が書き戻されているフィールド」** として扱う

呼び元の置換マッピング（後続 Phase 用の cheat sheet）：

| 現状 | 置換先 | 備考 |
| --- | --- | --- |
| `state.started === true` (L4453) | `isClassStarted(targetClassId)` | startTournamentForClass 内、対象クラスのみ判定 |
| `state.started` (L3786 削除ガード) | `isClassStarted(player.cls)` | 当該プレイヤーのクラスのみで判定 |
| `state.started` (L6101 / L5640 tab 復元) | `state.classes.some(c => c.started)` または **旧 `state.started` 直読み**（互換フィールドとして最新の OR が同期書き込みされている前提） | 全体「どれか started」で復元先決定 |
| `persisted_st.started !== true` (L4476) | `!classStartedInPersisted(persisted, classId)` | scope-001 §8.2 helper |

### 7.2 入口を「クラス単位」と「一括」の 2 系統に整理

scope-001 §5.1 / §5.2 の方針を踏襲しつつ、**既存 `#startBtn` 互換の一括開始が持つ all-or-nothing 性を維持する**：

- `startTournamentForClass(classId)`：当該クラスのみ初期化 + `generatePairing(classId)`
- `startTournament()`：classes 全件を **事前に validate** し、**全件 OK の場合に限り** mutate / save する **atomic wrapper**（既存ボタン互換）
- `resetClassForClass(classId)`：当該クラスのみ pairings / results / started を初期化
- `resetTournamentProgressOnly()`：classes 全件を走査して `resetClassForClass` を順に呼ぶ（既存ボタン互換）

#### 7.2.1 一括開始の all-or-nothing 性（必須要件）

**現行挙動**（[shogi_v4.html:4457-4471](../../shogi_v4.html)）：参加者数 total / Aクラス奇数 / Bクラス奇数 / `hasOngoing` confirm のチェックを **すべて終えてから** `state.started=true` と `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` の初期化、続いて `generatePairing('A')` / `generatePairing('B')` の呼出に進む。途中で 1 つでも fail すれば **state は 1 byte も書き換えられない**。

→ 可変クラス化後も **この性質を必ず維持** する。`#startBtn` 互換の一括開始では、対象クラスの参加者数・奇数・開始可否を **全件事前検証** し、全件 OK の場合のみ `state.classes[classId].started` / `pairings` / `results` を更新して保存する。**A は開始済み、B は検証失敗のような部分開始状態を作ってはならない**。

#### 7.2.2 atomic wrapper の構造（仕様、実装はしない）

```javascript
// validate phase（state を一切触らない、pure 関数）
function collectStartCandidates(classes, players){
  // {ok:true, candidates:[classId,...]}  または
  // {ok:false, errors:[{classId, kind:'odd'|'too-few'|'already-started', message}, ...]}
}

// mutate phase（validate phase が ok:true を返した場合のみ呼ぶ）
function applyStartForCandidates(candidates){
  candidates.forEach(function(classId){
    state.pairings[classId] = [];
    state.results[classId]  = [];
    setClassStarted(classId, true);
    generatePairing(classId);
  });
  save();
}

// #startBtn 互換 wrapper
function startTournament(){
  var v = collectStartCandidates(state.classes, state.players);
  if(!v.ok){
    showStartValidationErrors(v.errors);  // alert / showMsg にまとめて出す
    return;  // ← state は一切変更しない
  }
  if(v.candidates.length === 0){
    // 開始可能クラスなし（全クラス started 済み or 参加者なし）。既存 alert 文言で誘導
    return;
  }
  applyStartForCandidates(v.candidates);
  showTab('tournament');
  v.candidates.forEach(function(classId){
    verifyStartSavedForClass(classId);  // SAVE-003 verify per class（§7.7）
  });
}
```

ポイント：

- **validate phase は state を読むだけ**（純粋関数）。途中失敗で state が壊れる経路をコード上で排除する。
- **mutate phase は全件 OK 後に一括適用**。Aクラス偶数 / Bクラス奇数の状況でも、A だけ開始してしまう挙動を発生させない。
- `startTournamentForClass(classId)` 単独呼び出し時も、内部で同じ validate を 1 クラス分だけ通してから mutate する（部分開始の手動経路でも all-or-nothing を保つ）。
- 一括開始用に **「validate-only helper」と「mutate helper」を分ける** ことを 003〜004 で必須要件にする。`startTournament()` を「sequential mutate wrapper」（candidates を順に `startTournamentForClass` で開始）として書くと、N 番目のクラスで失敗したときに 1..N-1 番目が開始済みになる **部分開始バグ** を生む。

→ この atomic 性は §8 の `ROUND-CLASS-START-002`（仕様化）と `ROUND-CLASS-START-004`（UI 実装）の必須要件とする。

### 7.3 state 初期化を classes 配列ベースに

resetAll / normalizeState / state 初期値の 3 箇所で **同じ初期化ロジック** が重複している。Phase 1 では「同じ helper を呼ぶ」だけに留め、A/B 固定 dict は残す（破壊的変更回避）。

**重要原則**：helper は **グローバル `state.classes` を参照しない**。class 一覧は **引数で受け取る** 設計に寄せる。normalizeState(raw) は load 中に新しい state を組み立てる関数で、その途中で「これから上書きされる予定の」古い `state.classes` を読みに行くと、データ破損や旧クラス漏れを生む。

```javascript
// 仕様（実装はしない）

// 純粋関数：渡された classes 配列だけを見て dict を作る。グローバル state は参照しない。
function emptyClassDict(classes, initialValue){
  // initialValue は省略可（pairings/results は配列、started は false など、用途で切替）
  var d = {};
  classes.forEach(function(c){ d[c.id] = (typeof initialValue === 'function') ? initialValue() : initialValue; });
  return d;
}

// raw JSON / 旧データから「正しい classes 配列」を確定するヘルパ
function normalizeClasses(raw){
  // 1. raw.classes が配列なら id/name/started を補完
  // 2. raw.classes に A/B が無ければ補完（scope-001 §8.3 / §8.4 案 a）
  // 3. raw.classes が存在せず raw.started:bool のみの旧データなら、A/B で展開
  // → 全件揃った classes 配列を return
}
```

**normalizeState の組立順序**（凍結された引数だけで完結させる）：

1. `var classes = normalizeClasses(raw);`
2. `var startedByClass = emptyClassDict(classes, false);`（または raw 由来の値で上書き）
3. raw の `players[cls]` / `pairings[cls]` / `results[cls]` を、確定済み `classes` に基づいて取り込む（dot 記法・bracket 記法の両対応、未知 classId は drop or 補完）
4. すべて組み上がってから `return normalizedState;`
5. **`normalizedState` を呼び元に返した後、呼び元が `state = normalizedState;` で差し替える**

→ この順序を守る限り、helper 内でグローバル `state` を読まないため、「load 中に旧 state.classes を見る」レースが構造的に発生しない。

**呼び元での使い方**（mutate 系では確定済み `state.classes` を引数に渡す）：

```javascript
// resetAll 内、startTournament の mutate phase 内、resetTournamentProgressOnly 内で共通利用
state.pairings = emptyClassDict(state.classes, function(){ return []; });
state.results  = emptyClassDict(state.classes, function(){ return []; });
```

Phase 5〜6 で `state.players = {A:[],B:[]}` の hardcode も同 helper で動的化（`state.players = emptyClassDict(state.classes, function(){ return []; });`）。

### 7.4 UI DOM を classId 駆動に

- 参加者登録の `<select id="inp-class">` を `state.classes.forEach` で option 生成
- `#a-count` / `#b-count` / `#a-list` / `#b-list` / `#bulkEditA` / `#bulkEditB` を `count-{classId}` / `list-{classId}` / `bulkEdit-{classId}` の命名規則で動的生成
- `#pane-A` / `#pane-B` / `#result-A` / `#result-B` を `pane-{classId}` / `result-{classId}` で動的生成
- 結果タブ改ページ CSS を `[id^="result-"]:not(:first-child){page-break-before:always}` のような汎用 selector へ
- 「対局開始」ボタン横にクラス別「`<className>` を開始」「`<className>` をリセット」ボタンを追加（scope-001 §10.1 案 A）

### 7.5 「A だけ開始済、B は未開始」の許容範囲（運用方針）

依頼書「現場運用上、Aだけ開始済み・Bは未開始のような状態を許容するか」への回答案：

| 観点 | 推奨 | 根拠 |
| --- | --- | --- |
| 状態としては許容するか | **許容する** | scope-001 §1.3 の運用シナリオが現場ニーズ。これを支えるのが本シリーズの目的 |
| 「全体終了」表示の扱い | **参加者ありクラス全件が rounds 消化済** で「全体終了」（scope-001 §11.4 状態遷移図、`isTournamentDone` の更新で対応） | 既存仕様と同じ "any-class started かつ all-class done" を classes 配列で実装 |
| 起動時の tab 復元 | **どれか 1 クラスでも started なら tournament タブ、全件 done なら result タブ** | 既存挙動と同じ derived |
| 「対局開始」一括ボタン文言 | 「未開始クラスを一括開始」とする / 既存ラベル「登録完了・対局開始」も互換維持 | 後続 Phase で UI 微調整（本 note 範囲外） |

### 7.6 1局目開始後の参加者編集に対する制約（クラス単位化）

現状：`state.started && pastMatches>0` の AND で削除ガード（L3786）。`state.started` は全体フラグなので、B が未開始でも A が開始済なら B 参加者削除時に AND の前半が true になる（後半 `pastMatches>0` が B 側は 0 なので、結果的には削除可だが「全体 started」分岐に入る）。

期待する挙動：

| ケース | 期待 |
| --- | --- |
| A 開始済 / B 未開始 / B 参加者削除 | **自由に削除可**（B にはまだ pastMatches=0、`isClassStarted('B')=false`） |
| A 開始済 / B 未開始 / A 参加者削除（pastMatches>0） | 既存通り **アラートで拒否**（A クラスのみ判定で十分） |
| A 開始済 / B 開始済 / B 参加者修正 | 既存通り bulk-edit で名前のみ可、削除は pastMatches で判定 |

→ L3786 の判定を `isClassStarted(player.cls) && pastMatches>0` に置換できれば、B 未開始時の B 参加者編集の自由度が確保される。

### 7.7 SAVE-003 verify のクラス単位化（startTournament 用）

scope-001 §5.1 / §8.2 に従い、`startTournamentForClass(classId)` ごとに `callsiteId:'SAVE-003-startTournamentForClass-' + classId` を発行。`startTournament()` 一括は **クラス単位 callsiteId を集約せず**、各クラスでの verify を独立に行う。

---

## 8. 後続実装タスク候補（分割案）

scope-001 §14 と一部重複するが、本 note では **「対局開始まわりだけを最小単位で動かす」** 観点で粒度を細かくする。並走可能なものは並走可、依存があるものは順序を明示する。

| 優先 | Task ID | 内容 | 種別 | Risk |
| --- | --- | --- | --- | --- |
| **第一** | `ROUND-CLASS-START-002` | 対局開始状態の classId ベース **設計仕様書**。本 note §7 を実装に近い粒度へ落とし込む。必須項目：(a) **一括開始の all-or-nothing / atomic validate-then-mutate**（本 note §7.2 / §7.2.2）、(b) `state.classes` の初期化タイミング、(c) `normalizeState` 既存データ互換（008 で確定した方針を取り込む）、(d) SAVE-003 verify の callsiteId 設計、(e) エラーメッセージ文言整理。**008 を前提として参照** する | docs-only | Level 1 |
| **第二** | `ROUND-CLASS-START-003` | 対局開始状態の **state schema / helper / normalize 実装**。`state.classes` 配列導入、`isClassStarted` / `setClassStarted`（**同期書き込みで `state.started` 互換維持**）/ `emptyClassDict(classes, init)` / `normalizeClasses(raw)` / `classStartedInPersisted` を新設。`normalizeState` の旧データ互換ロジックを実装し、**helper 互換性テスト（normalize 互換テストを含む unit test）をここに集約**。**この時点では UI は変えない** | impl-LIGHT | Level 3 |
| **第三** | `ROUND-CLASS-START-004` | 対局開始 **UI の可変クラス対応**。`startTournamentForClass(classId)` / `resetClassForClass(classId)` 新設。`#startBtn` 互換の `startTournament()` を **atomic wrapper**（validate phase / mutate phase 分離、本 note §7.2.2）として実装。pane-A / pane-B 上部に「クラス別開始 / リセット」ボタン追加。VRT snapshot 更新は別 AR で明示許可制 | impl-LIGHT | Level 3 |
| **第四** | `ROUND-CLASS-START-005` | **周辺ガード + 隣接リスク合流**。既存 class-scoped 関数の retest、`isTournamentDone` を `state.classes` 走査に、L3786 削除ガードを `isClassStarted(player.cls)` に置換。本 note §5.7 の隣接リスク（`renderRegList` の `['A','B']`、`a-count` / `b-count` 分岐、`addPlayer` の `state.players.A.concat(.B)`、保存 verify の A/B 走査）を取り込み確認。**新規 C クラスは導入しない**、既存 A/B のクラス独立性のみ強化 | impl-LIGHT〜MEDIUM | Level 3 |
| **第五** | `ROUND-CLASS-START-006` | **E2E 追加**（A 単独開始 → B 後追い開始の golden path、Aクラス偶数 / Bクラス奇数で一括開始が **全件 reject**（部分開始しない）こと、A 開始済 / B 未開始時の B 参加者削除許容、A 進行中の resetClassForClass(B) で A 保護、旧データロード互換、SAVE-003 verify per-class）。snapshot 更新を含む場合は AR 分離 | test | Level 3 |
| 並走可 | `ROUND-CLASS-START-007` | C クラス導入の **UI 詳細設計**（参加者登録 select の動的化、pane-{classId} / result-{classId} の動的生成、改ページ CSS の汎用化、a11y、レイアウト）。実装は別タスク | docs-only | Level 1 |
| **002/003 の前提** | `ROUND-CLASS-START-008` | **旧データマイグレーション設計**（`state.started: bool` のみの JSON を `state.classes` に展開する規則。scope-001 §8.4 案 a の運用判断確定、ロード時 UI 通知の要否）。`normalizeState` / `state.classes` 導入と直結するため、**003 着手前に方針確定が望ましい**。002 に統合する選択肢もある（002 の章として吸収） | docs-only | Level 1 |

### 8.1 依存関係

```
ROUND-CLASS-START-008 (旧データマイグレ設計)  ← 002/003 の前提
        │
        ▼
ROUND-CLASS-START-002 (設計仕様書 / atomic 一括開始 + 008 取り込み)
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

> 注：008 を 002 に統合するか分離するかは 002 着手時に判断する。統合する場合は 002 の章として「旧データ互換」を含める。分離する場合は 008 → 002 → 003 の直線。いずれでも **003 着手前に 008 の方針が確定している** ことを必須条件にする。

### 8.2 着手判断ポイント（後続セッションでの確認事項）

- `ROUND-CLASS-START-002` 着手時：scope-001 §8.4 の旧データ互換（案 a vs 案 b）の最終確定。一括開始 wrapper の atomic validate-then-mutate 設計（本 note §7.2.2）を仕様に明記
- `ROUND-CLASS-START-003` 着手時：`state.started` の互換方式（**本 note は scope-001 §11.3 案 B = 同期書き込みで互換維持を採用**、純 derived の §11.3 案 C は採用しない）
- `ROUND-CLASS-START-004` 着手時：UI 文言・ボタン配置・VRT snapshot 影響の許可取得。`#startBtn` 互換 wrapper は **atomic（validate phase / mutate phase 分離）** を必須要件にする
- `ROUND-CLASS-START-005` 着手時：参加者削除ガードのスコープ縮小が「過去事故」運用要件に反しないか確認。本 note §5.7 の隣接リスク（renderRegList / addPlayer / save verify A/B 走査）の取り込み方針を確定

---

## 9. 今回のスコープ外

本 PR では **以下を実施しない**：

1. **実装変更**：`shogi_v4.html` / `index.html` / `data/` は 1 行も変更しない
2. **テスト変更**：`test/` / `test/e2e/` は 1 行も変更しない
3. **snapshot / VRT 変更**
4. **workflow / package 変更**：`.github/workflows/` / `package*.json` / lockfile / `playwright.config.js`
5. **既存 specs / ops docs の改訂**：scope-001 本体（PR #134）の文面は触らない
6. **localStorage schema 変更**
7. **C クラス UI の実装着手**
8. **A/B literal 置換**（§5 の 34 箇所はすべて棚卸しのみ）
9. **旧データマイグレーションスクリプト作成**
10. **AI 非同期運用 v0.2 Draft の正式採用判断**
11. **Ready 化 / merge / branch 削除 / release / deploy / publish**
12. **main への直接 push**
13. **後続実装タスク（ROUND-CLASS-START-002 以降）の着手**

---

## 10. レビュー観点

レビュアー（髙橋さん / Codex / 後続 AI）への確認事項：

### 10.1 棚卸しの網羅性

- §3 の対局開始フロー図に **欠けているステップ** はないか？
- §4 の関数・state・DOM 列挙に **触れていない箇所** はないか？（特に `bulkEdit` 系、`addPlayer`、`renderRegList` 等の参加者編集系のうち、開始済み判定に絡む経路）
- §5 の A/B 固定箇所 34 件に **誤検出 / 漏れ** はないか？

### 10.2 分類の妥当性

- §6 の「state スキーマ系 / UI DOM 系 / 運用シナリオ系」3 系統分けで、後続 Phase の分割粒度として実用的か？
- 「C を push したら自動補完されない」観点と「C 用 DOM がないと描画されない」観点は **別タスクで扱うべき** か、まとめてよいか？

### 10.3 scope-001 との重複・差分

- 本 note は scope-001 §3.1 / §3.2 / §4 / §5 / §8 / §11 / §14 を前提に書いているが、**矛盾している記述** はないか？
- scope-001 で確定済みの「`state.classes` 配列追加」「`state.started` derived 両立」「`startTournamentForClass` 新設」を **本 note は変更していない**（追補のみ）ことを確認

### 10.4 運用シナリオの妥当性

- §6.3 / §7.5 の「A 開始済 / B 未開始」許容方針は、現場運用上問題ないか？
- §7.6 の「B 未開始時は B 参加者削除を自由に」は、過去事故（pastMatches>0 削除で結果タブが落ちる、L3785 コメント参照）と矛盾しないか？
  - **本 note の主張**：`pastMatches>0` 自体は当該クラスで判定されているので、`state.started` 全体ガードを **クラス単位に弱める** だけで安全性は維持される。ただし要レビュー。

### 10.5 後続タスク分割の粒度

- §8 の `ROUND-CLASS-START-002 〜 008` の 7 分割は、PR 1 個あたりの review コスト・回帰リスクとして適切か？
- 「003 (state schema) と 004 (UI) を 1 PR に統合した方が安全」と判断するなら、scope-001 §14.1 同様 **分離 vs 統合の判断ポイント** を明示しておくか

### 10.6 完了条件の照合

- docs-only である（実装・テスト・workflow・snapshot 未変更）
- A/B 固定箇所が具体的に列挙されている（§5 で 主動線 34 行 + §5.7 で隣接リスク 6 グループ。件数の数え方は §5.0）
- 後続タスクが小さく分割されている（§8 で 7 タスク）
- scope-001 との関係が明示されている（§0 / §2.2 / §10.3）
- 一括開始の **all-or-nothing / atomic validate-then-mutate** が必須要件として明文化されている（§7.2 / §7.2.2）
- helper の **グローバル `state` 非参照原則** が明文化されている（§7.3）
- `state.started` の互換方式が **同期書き込みで互換維持** に統一されている（§2.2 / §7.1）
- 「ready 化 / merge / branch 削除 / release / deploy / publish しない」が遵守されている

---

## 11. 結論

- 対局開始まわりの主動線上の **A/B 固定箇所は §5 で 34 行**（行単位の棚卸し、§5.0 の定義参照。代表的な内訳：startTournament 10 / resetTournamentProgressOnly 5 / resetAll 2 / 起動・load 復元 5 / HTML DOM 9 / 周辺 3）。`.A`/`.B` の literal 出現件数とは別の数え方であり、`state.started` のような全体フラグ参照も「改修対象 1 行」として含む。
- 主動線とは別に、参加者登録・表示・保存 verify 系の **隣接リスク**（§5.7 で 6 グループ）を列挙。これらは本 PR の主対象には含めないが、可変クラス化と同時または直後に確認が必要。
- これらは **state スキーマ系 / UI DOM 系 / 運用シナリオ系の 3 系統** に分類でき、後続 Phase はこの 3 系統に沿って分割できる。
- scope-001 で「`state.classes` 配列追加 + `state.started` を **同期書き込みで互換維持**（純 derived ではない）+ `startTournamentForClass` 新設」の大枠は決定済。本 note はそれを前提に、**対局開始まわりに限定した追補** として以下を整理した：
  - `isClassStarted` / `setClassStarted` / `emptyClassDict(classes, init)` / `normalizeClasses(raw)` / `classStartedInPersisted` を helper として束ねる（**helper はグローバル `state.classes` を読まず、引数で受け取る**）
  - **一括開始の atomic validate-then-mutate**（§7.2 / §7.2.2）を 003〜004 の必須要件にする
  - §5 の主動線 34 行を Phase 1〜3 で順に置換、§5.7 の隣接リスクは 005 で合流
- 後続タスクは `ROUND-CLASS-START-002 〜 008` の **7 分割** を提案。002（設計仕様書、atomic 一括開始 / 旧データ互換 / 008 を前提として確定）→ 003（state helper / normalizeState 互換テスト）→ 004（UI クラス別ボタン、atomic wrapper）→ 005（参加者ガード等 + §5.7 隣接リスク合流）→ 006（E2E）が直線。007（C クラス UI 設計）は並走可。008（旧データマイグレ設計）は **002 または 003 の前提** として扱う（normalizeState / state.classes 導入と直結するため、003 着手前に方針確定が望ましい）。
- 本 PR は **docs-only**。実装は後続タスクで扱う。
