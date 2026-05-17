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
- `state.started` は **all-class OR の derived** として両立（scope-001 §11.3 案 B 推奨）
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

| 関数 | 行 | 役割 | A/B 固定度 |
| --- | --- | --- | --- |
| [`startTournament()`](../../shogi_v4.html) | L4441-4486 | 対局開始の入口。state 切替 + 初期化 + generatePairing 呼出 + SAVE-003 verify | **高**（A/B 直接参照 9 箇所） |
| [`resetTournamentProgressOnly()`](../../shogi_v4.html) | L5924-5943 | 進行データのみリセット。`state.started=false` + `pairings/results={A,B}=[]` + pane クリア | **高**（A/B 直接参照 7 箇所） |
| [`resetAll()`](../../shogi_v4.html) | L5945-5975 | 全リセット。state 全体を `{A:[],B:[]}` で再初期化 | **高**（A/B 直接参照 4 箇所、state 初期値 hardcoded） |
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
| `hasOngoing` fail-safe（L4460-4463） | `state.started && (pairings.A/B or results.A/B 非空)` | **全体**（混合） |

→ 開始済み判定は **すべて `state.started`（全体単一）に集約**。クラス単位の判定は存在しない。

---

## 5. A/B固定前提が疑われる箇所（対局開始まわり）

scope-001 §3.2 / §9.1 が全体で「概算 40 件前後」と概算したうち、**対局開始フローに直接効いてくる**ものを以下に絞り込む。実装着手時の正確なカウントは別 Phase で行う。

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

- **読み取り API**：`isClassStarted(classId)`（scope-001 §11.2 案）
- **書き込み API**：`setClassStarted(classId, value)`（同上）
- **派生**：`state.started = state.classes.some(c => c.started)`（scope-001 §11.3 案 B 推奨）

呼び元の置換マッピング（後続 Phase 用の cheat sheet）：

| 現状 | 置換先 | 備考 |
| --- | --- | --- |
| `state.started === true` (L4453) | `isClassStarted(targetClassId)` | startTournamentForClass 内、対象クラスのみ判定 |
| `state.started` (L3786 削除ガード) | `isClassStarted(player.cls)` | 当該プレイヤーのクラスのみで判定 |
| `state.started` (L6101 / L5640 tab 復元) | `state.classes.some(c => c.started)` または旧 `state.started` derived | 全体「どれか started」で復元先決定 |
| `persisted_st.started !== true` (L4476) | `!classStartedInPersisted(persisted, classId)` | scope-001 §8.2 helper |

### 7.2 入口を「クラス単位」と「一括」の 2 系統に整理

scope-001 §5.1 / §5.2 の方針を踏襲：

- `startTournamentForClass(classId)`：当該クラスのみ初期化 + `generatePairing(classId)`
- `startTournament()`：classes 全件を走査して「未開始かつ参加者あり」のクラスを順に `startTournamentForClass` で開始（既存ボタン互換）
- `resetClassForClass(classId)`：当該クラスのみ pairings / results / started を初期化
- `resetTournamentProgressOnly()`：classes 全件を走査して `resetClassForClass` を順に呼ぶ（既存ボタン互換）

### 7.3 state 初期化を classes 配列ベースに

resetAll / normalizeState / state 初期値の 3 箇所で **同じ初期化ロジック** が重複している。Phase 1 では「同じ helper を呼ぶ」だけに留め、A/B 固定 dict は残す（破壊的変更回避）。

```javascript
// 仕様（実装はしない）
function emptyClassDict(){
  var d = {};
  state.classes.forEach(function(c){ d[c.id] = []; });
  return d;
}

// resetAll 内、startTournament 内、resetTournamentProgressOnly 内で共通利用
state.pairings = emptyClassDict();
state.results  = emptyClassDict();
```

Phase 5〜6 で `state.players = {A:[],B:[]}` の hardcode も同 helper で動的化。

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
| **第一** | `ROUND-CLASS-START-002` | 対局開始状態の classId ベース設計仕様書（scope-001 §11 をベースに、本 note §7 を実装に近い粒度に落とし込む。state.classes の初期化タイミング、normalizeState 既存データ互換、SAVE-003 verify の callsite ID 設計、エラーメッセージ文言整理を含む） | docs-only | Level 1 |
| **第二** | `ROUND-CLASS-START-003` | 対局開始状態の保存構造変更 + helper 関数追加（`state.classes` 配列導入、`isClassStarted` / `setClassStarted` / `emptyClassDict` / `classStartedInPersisted` を新設、`normalizeState` の旧データ互換、`state.started` derived 同期）。**この時点では UI は変えない**。unit test を追加 | impl-LIGHT | Level 3 |
| **第三** | `ROUND-CLASS-START-004` | 対局開始 UI の可変クラス対応（`startTournamentForClass(classId)` / `resetClassForClass(classId)` 新設、pane-A / pane-B 上部に「クラス別開始 / リセット」ボタン追加、既存 `startTournament` / `resetTournamentProgressOnly` を classes 全走査の wrapper 化）。VRT snapshot 更新は別 AR で明示許可制 | impl-LIGHT | Level 3 |
| **第四** | `ROUND-CLASS-START-005` | 次回戦生成・結果保持・参加者削除ガードのクラス別安全性確認（既存 class-scoped 関数の retest、`isTournamentDone` を `state.classes` 走査に、L3786 削除ガードを `isClassStarted(player.cls)` に置換）。**新規 C クラスは導入しない**、既存 A/B のクラス独立性のみ強化 | impl-LIGHT〜MEDIUM | Level 3 |
| **第五** | `ROUND-CLASS-START-006` | E2E 追加（A 単独開始 → B 後追い開始の golden path、A 開始済 / B 未開始時の B 参加者削除許容、A 進行中の resetClassForClass(B) で A 保護、旧データロード互換、SAVE-003 verify per-class）。snapshot 更新を含む場合は AR 分離 | test | Level 3 |
| 並走可 | `ROUND-CLASS-START-007` | C クラス導入の **UI 詳細設計**（参加者登録 select の動的化、pane-{classId} / result-{classId} の動的生成、改ページ CSS の汎用化、a11y、レイアウト）。実装は別タスク | docs-only | Level 1 |
| 並走可 | `ROUND-CLASS-START-008` | 旧データマイグレーション設計（`state.started: bool` のみの JSON を `state.classes` に展開する規則。scope-001 §8.4 案 a の運用判断確定、ロード時 UI 通知の要否） | docs-only | Level 1 |

### 8.1 依存関係

```
ROUND-CLASS-START-002 (設計仕様書)
        │
        ▼
ROUND-CLASS-START-003 (state schema + helper)
        │
        ▼
ROUND-CLASS-START-004 (UI クラス別ボタン)
        │
        ▼
ROUND-CLASS-START-005 (参加者ガード等の周辺整合)
        │
        ▼
ROUND-CLASS-START-006 (E2E)

並走可：
  ROUND-CLASS-START-007 (C クラス UI 設計、いつでも)
  ROUND-CLASS-START-008 (マイグレーション設計、002 と同時期が望ましい)
```

### 8.2 着手判断ポイント（後続セッションでの確認事項）

- `ROUND-CLASS-START-002` 着手時：scope-001 §8.4 の旧データ互換（案 a vs 案 b）の最終確定
- `ROUND-CLASS-START-003` 着手時：`state.started` を derived にするか同期書き込みにするか（scope-001 §11.3 案 B vs 案 C）
- `ROUND-CLASS-START-004` 着手時：UI 文言・ボタン配置・VRT snapshot 影響の許可取得
- `ROUND-CLASS-START-005` 着手時：参加者削除ガードのスコープ縮小が「過去事故」運用要件に反しないか確認

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
- A/B 固定箇所が具体的に列挙されている（§5 で 34 件）
- 後続タスクが小さく分割されている（§8 で 7 タスク）
- scope-001 との関係が明示されている（§0 / §2.2 / §10.3）
- 「ready 化 / merge / branch 削除 / release / deploy / publish しない」が遵守されている

---

## 11. 結論

- 対局開始まわりの **A/B 固定箇所は §5 で 34 件**（startTournament 10 / resetTournamentProgressOnly 5 / resetAll 2 / 起動・load 復元 5 / HTML DOM 9 / 周辺 3）。
- これらは **state スキーマ系 / UI DOM 系 / 運用シナリオ系の 3 系統** に分類でき、後続 Phase はこの 3 系統に沿って分割できる。
- scope-001 で「`state.classes` 配列追加 + `state.started` 両立 + `startTournamentForClass` 新設」の大枠は決定済。本 note はそれを前提に、**対局開始まわりに限定した追補** として「`isClassStarted` / `setClassStarted` / `emptyClassDict` / `classStartedInPersisted` を helper として束ね、§5 の 34 箇所を Phase 1〜3 で順に置換する」道筋を整理した。
- 後続タスクは `ROUND-CLASS-START-002 〜 008` の **7 分割** を提案。002（設計仕様書）→ 003（state helper）→ 004（UI クラス別ボタン）→ 005（参加者ガード等）→ 006（E2E）が直線、007（C クラス UI 設計）・008（旧データマイグレ設計）は並走可能。
- 本 PR は **docs-only**。実装は後続タスクで扱う。
