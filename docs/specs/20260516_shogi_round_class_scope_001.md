# SHOGI-TOUR｜対局開始 / 次回戦生成 / 結果入力 / 進行状態 / 保存確認 を classId 単位に分離する設計（ROUND-CLASS-SCOPE-001）

**Task ID**: `ROUND-CLASS-SCOPE-001`
**作業種別**: docs-only / 仕様設計 / class scope 分離設計
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `650176b`（PR #133 squash merge 後の main = TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT）
**位置づけ**: 現在 A/B 固定で組まれている「対局開始 / 次回戦生成 / 結果入力 / 進行状態 / 保存確認」のロジックを、将来 C クラス以上にも対応できるよう `classId` / `className` 単位に分離する **設計** 文書。**実装はしない**。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **対象ファイル（参照のみ、本 PR では未変更）**:
  - [shogi_v4.html](shogi_v4.html)（約 70KB、1441 行、`<script>` セクション）
- **関連既存仕様**:
  - 参加者登録 / クラス指定: `docs/specs/` 配下の `phaseA*` 系設計
  - reset 仕様 / startTournament guard: PR #112 / PR #113 / PR #118 / PR #120 / PR #121（RESET-UX シリーズ）
  - AI 非同期運用ルール: `docs/ops/20260516_shogi_tour_ai_workflow_v0_2.md`（v0.2 Draft、main 反映済）
- **非対象（本 PR では実施しない）**:
  - 実装ファイル変更（`shogi_v4.html` / `index.html` / `data/`）
  - テスト変更（`test/` / `test/e2e/`）
  - snapshot / VRT 変更
  - workflow / package 変更（`.github/workflows/` / `package*.json` / lockfile / `playwright.config.js`）
  - `.github/` 配下変更（PR template / Issue template / label）
  - `ai_work_queue.md` / Candidate Registry 作成
  - localStorage schema 変更（**設計のみ、実装は別タスク**）
  - C クラス UI の実装
  - Ready 化 / merge / branch 削除
  - v0.2 Draft の正式採用
  - 後続実装タスク（`ROUND-CLASS-SCOPE-IMPL-LIGHT` / `ROUND-CLASS-SCOPE-IMPL-MEDIUM` 等）の着手

---

## 1. 現象・問題

### 1.1 報告された懸念

A クラスの対局が進行中・結果入力済みの状態で、B クラスを後追い開始すると **A クラスの対局結果がリセットされる** 恐れがある。

### 1.2 コード調査による現状把握

`startTournament` ([shogi_v4.html:4441-4486](shogi_v4.html:4441)) は以下のように **大会全体（A クラス + B クラス）に作用する単一の関数**：

```
L4453: if(state.started===true){ alert('大会はすでに開始されています...'); return; }
L4467: state.started = true;
L4468: state.pairings = {A:[], B:[]};   // ★ 両クラスを同時に初期化
L4469: state.results  = {A:[], B:[]};   // ★ 両クラスを同時に初期化
L4470: if(state.players.A.length>0) generatePairing('A');
L4471: if(state.players.B.length>0) generatePairing('B');
```

つまり、現在の設計は次の 2 パターンしか想定していない：

- **両クラス同時開始**：A と B が同じタイミングで Round 1 を開始する
- **片方クラスのみ開始**：もう片方は参加者 0 のまま無視（generatePairing 呼ばれない）

### 1.3 想定される運用シナリオ（現在の UI では破綻する）

1. オペレータが A クラスのみで「対局開始」を押す → A クラスが Round 1 開始
2. A クラス Round 1 進行中（結果入力途中）
3. B クラスの参加者が遅れて到着・登録される
4. オペレータが「B クラスも開始したい」と思うが、UI には「クラス単位で開始する」ボタンがない
5. 既存「対局開始」ボタンは [`state.started===true` ガード](shogi_v4.html:4453) で **alert 表示して停止** する
6. ガードを回避する手段は **`resetTournamentProgressOnly` でリセット** しかない
   - これは A クラスの pairings / results も同時に消す（[L5928-5929](shogi_v4.html:5928)）
   - 結果として **A クラスの進行が破壊される**

### 1.4 関連する fail-safe コード（L4460-4465 の hasOngoing 経路）

```
L4460: var hasOngoing=state.started && (state.pairings.A.length>0 || ... || state.results.B.length>0);
L4464: if(hasOngoing){ if(!confirm('進行中の大会データがあります...')) return; }
```

このコードは [L4453](shogi_v4.html:4453) で `state.started===true` を弾いた後にあるため、**通常フローでは到達しない**（コメント L4449-4452 に「安全網として温存」と明記）。ただし、`state.started=false` で pairings/results のみ残る **異常データ** が読み込まれた場合の保護として残っている。

→ 新設計では、この fail-safe も **クラス単位** に分解する必要がある。

---

## 2. 想定される原因仮説

### 2.1 仮説 A：UI ボタンが「大会全体」を対象としている

「対局開始」ボタンは 1 つしかなく、それが [`startTournament()`](shogi_v4.html:4441) を呼ぶ。クラス分岐は関数内部に閉じている（pairings / results 初期化は両クラス、generatePairing は players が居るクラスのみ）。

**根拠**：[L4468-4471](shogi_v4.html:4468) の `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` で両クラス初期化、`generatePairing('A')` / `generatePairing('B')` の 2 連続呼出。

### 2.2 仮説 B：state.started が大会全体のフラグである

[`state.started`](shogi_v4.html:4467) は **大会全体の単一 boolean** で、クラス単位ではない。これにより：

- 「A クラスは開始済、B クラスはまだ」という中間状態を表現できない
- [`startTournament`](shogi_v4.html:4441) は state.started === true でアラート → B クラスを後から開始できない

**根拠**：state 初期化 [L216](shogi_v4.html:216)、`started:false`。

### 2.3 仮説 C：A/B 固定のディクショナリ構造が変更耐性を奪う

`state.players = {A:[], B:[]}` / `state.pairings = {A:[], B:[]}` / `state.results = {A:[], B:[]}` は **A と B をハードコードしたディクショナリ**。

- C クラスを追加するには 38 箇所以上の literal 比較・配列定義の書き換えが必要
- `['A','B'].forEach` パターンが [normalizeState L438](shogi_v4.html:438) など複数箇所に存在
- save/load も両クラスを 1 つの JSON に固定保存

**根拠**：grep で `'A'` / `'B'` の literal が 38 件、`['A','B']` の配列定義が 10 件以上。

### 2.4 仮説 D：resetTournamentProgressOnly がクラス選択肢を持たない

[`resetTournamentProgressOnly`](shogi_v4.html:5924) は両クラスをまとめてリセットする。「A は残して B だけ初期化」のような部分操作ができない。

**根拠**：[L5928-5929](shogi_v4.html:5928) で `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` を無条件代入。

### 2.5 仮説の優先度

| 仮説 | 直接の原因度 | 修正コスト |
| --- | --- | --- |
| 仮説 A（UI 単一ボタン） | 高 | 中（UI 追加 + ボタン分岐） |
| 仮説 B（state.started 単一フラグ） | 高 | 中（state schema 変更） |
| 仮説 C（A/B 固定ディクショナリ） | 中 | 高（広範囲改修） |
| 仮説 D（reset 単一動作） | 中 | 中（reset 関数を class 引数化） |

主因は **A + B の組合せ**。「単一ボタン × 単一 started フラグ」が「クラス単位の独立進行」を阻害している。

---

## 3. A/B 固定設計の限界

### 3.1 既存の class-scoped 関数（既に cls 引数を取る）

幸い、以下の関数は **既にクラス単位で動く**：

| 関数 | 行 | クラス境界 |
| --- | --- | --- |
| [`generatePairing(cls)`](shogi_v4.html:4629) | 4629-4730 | ✅ cls 限定 |
| [`setWinner(cls, idx, winner)`](shogi_v4.html:4732) | 4732-4753 | ✅ cls 限定 |
| [`submitRound(cls)`](shogi_v4.html:4934) | 4934-4990 | ✅ cls 限定 |
| [`getWins(cls)`](shogi_v4.html:344) | 344-356 | ✅ cls 限定 |
| [`pairHasRematch(cls, p1, p2)`](shogi_v4.html:358) | 358-366 | ✅ cls 限定 |
| [`renderTournament(cls)`](shogi_v4.html:5067) | 5067-5125 | ✅ cls 限定 |
| [`buildScoreGridHtml(cls)`](shogi_v4.html:4868) | 4868-4878 | ✅ cls 限定 |
| [`buildPlayedHistoryHtml(cls)`](shogi_v4.html:4879) | 4879-4920 | ✅ cls 限定 |
| [`buildCurrentPairingsHtml(cls)`](shogi_v4.html:4914) | 4914-... | ✅ cls 限定 |

**この事実は重要**：「クラス分離はすでに 80% できている」。残るのは **大会全体スコープで作っている関数**：

| 関数 | 行 | スコープ | 問題 |
| --- | --- | --- | --- |
| [`startTournament()`](shogi_v4.html:4441) | 4441-4486 | 大会全体 | 両クラス初期化 + state.started 切替 |
| [`resetTournamentProgressOnly()`](shogi_v4.html:5924) | 5924-5943 | 大会全体 | 両クラス強制リセット |
| [`resetAll()`](shogi_v4.html:5945) | 5945-... | 大会全体 | state 全初期化（範疇外、現状維持） |
| `state.started` | 216 / 4467 | 大会全体 | クラス独立進行を表現できない |
| `state.pairings` / `state.results` | dict {A,B} | 大会全体 | C クラス追加できない |

### 3.2 A/B literal 比較の総数

| パターン | 件数（概算） | 例 |
| --- | --- | --- |
| `cls==='A'` / `cls==='B'` | 約 10 件 | UI 表示分岐 |
| `'A'` / `'B'` 文字列リテラル | 約 20 件 | クラス検証 |
| `['A','B'].forEach` | 約 10 件 | 全クラス処理 |
| `state.players.A` / `.B` ドット記法 | 約 15 件 | UI bind |
| **合計** | 約 38 件 | — |

→ C クラス対応には **全件を `classes` 配列 or `classId` ベースに置換** する設計が必要。ただし **1 度に全件置換は危険**（IMPL-LIGHT 範囲を超える）。**段階的移行** が必須。

### 3.3 A/B 固定設計の限界まとめ

| 限界 | 影響 |
| --- | --- |
| C クラス以上を追加できない | 大会形態が拡張できない |
| クラス単位で独立に開始できない | 後追い開始時に既存クラスを破壊するリスク |
| クラス単位で独立に reset できない | 進行中の他クラスを保護できない |
| `state.started` が大会全体 | 「A 終了、B 進行中」のような中間状態が表現できない |
| 両クラス同時 save | 1 クラスだけ rollback できない |

---

## 4. classId / className ベース設計方針

### 4.1 設計の中心アイデア

**「`state` を A/B ハードコードのディクショナリから、`classes` 配列ベースに段階的に移行する」**。

- 既存の `state.players = {A:[], B:[]}` は **当面維持**（破壊的変更を避ける）
- 新設の `state.classes = [{id:'A', name:'Aクラス', started:false}, {id:'B', name:'Bクラス', started:false}]` を **追加**
- C クラス対応時：`state.classes` に `{id:'C', name:'Cクラス', started:false}` を push するだけ
- 既存コード（`state.players.A` 等）は段階的に `state.players[classId]` / `state.classes.find(c=>c.id===classId)` に置換

### 4.2 段階的移行プラン（IMPL-LIGHT で扱う範囲を意識）

| Phase | 範囲 | リスク |
| --- | --- | --- |
| **Phase 1** | `state.classes` を導入（A/B 既存ディクショナリと並走） / `started` をクラス単位に分離（`state.classes[i].started` を導入、`state.started` は両クラス OR で互換維持） / クラス単位「対局開始」「リセット」UI ボタン追加 | 低〜中 |
| **Phase 2** | `state.pairings` / `state.results` も `{A:[],B:[]}` から `{ [classId]: [] }` に拡張可能な形に整理（既存コードは A/B 直接アクセスを維持しつつ、新規コードは classId 参照） | 中 |
| **Phase 3** | C クラス UI を追加 / 参加者登録画面でクラス選択を A/B/C に拡張 | 中〜高 |
| **Phase 4** | A/B literal 比較 38 箇所を classId ベースに置換 / `['A','B'].forEach` を `state.classes.forEach` に置換 | 中（広範囲） |
| **Phase 5** | A/B 固定ディクショナリを廃止 / すべて classId ベースに統一 | 高 |

**本 Design では Phase 1 〜 Phase 2 の範囲を仕様化**。Phase 3 以降は将来タスク。

### 4.3 classId / className の表現

```javascript
state.classes = [
  { id: 'A', name: 'Aクラス', started: false },
  { id: 'B', name: 'Bクラス', started: false }
  // 将来：{ id: 'C', name: 'Cクラス', started: false } を push
];
```

- `id`：'A' / 'B' / 'C' / ...（既存の cls キーと同一文字、互換維持）
- `name`：表示名（i18n 対応の入口、現在は固定文字列）
- `started`：クラス単位の進行状態（旧 `state.started` の代替）

### 4.4 既存コードとの互換性原則

- **既存の `state.players[cls]` / `state.pairings[cls]` / `state.results[cls]` アクセスは維持**（dot 記法と bracket 記法は両方動作）
- 新 `state.classes` 配列は **追加情報**。既存処理は無視しても動く
- `state.started` は **両クラス OR の derived** として残す（旧コードを壊さない）：

```javascript
// 互換アクセサ（実装イメージ、本 PR では未実装）
Object.defineProperty(state, 'started', {
  get: function(){ return state.classes.some(c => c.started); }
});
```

- ただし `Object.defineProperty` は ES5 で動くが、normalizeState / save / load との整合性を要検証。**実装は別タスク**。

---

## 5. 対局開始をクラス単位にする仕様

### 5.1 新関数：`startTournamentForClass(classId)`

```javascript
// 仕様（実装はしない）
function startTournamentForClass(classId){
  var klass = state.classes.find(function(c){ return c.id===classId; });
  if(!klass){ showMsg('クラスが見つかりません','err'); return; }
  if(klass.started===true){
    alert(klass.name + 'はすでに開始されています。\n' + 
          klass.name + 'の進行データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。');
    return;
  }
  var players = state.players[classId];
  if(!players || players.length<2){ showMsg(klass.name+'の参加者が少なすぎます','err'); return; }
  if(players.length%2 !== 0){ showMsg(klass.name+'が奇数です。運営者を追加してください','warn'); return; }
  
  // クラス単位の初期化（他クラスを破壊しない）
  state.pairings[classId] = [];
  state.results[classId]  = [];
  klass.started = true;
  generatePairing(classId);
  showTab('tournament');
  save();
  
  // SAVE-003 verify（クラス単位）
  var persisted = readPersistedState();
  if(!persisted || !classStartedInPersisted(persisted, classId)){
    notifySaveWarning({
      message: klass.name + 'を開始しましたが、保存が確認できませんでした。',
      consoleTag: 'SAVE-003: startTournamentForClass(' + classId + ') の保存が確認できませんでした',
      callsiteId: 'SAVE-003-startTournamentForClass-' + classId,
      kind: 'save-verify',
      aggregateKey: 'save-verify:core',
      severity: 'warn'
    });
  }
}
```

### 5.2 既存 `startTournament()` の扱い

**互換のため当面は残す**。ただし内部実装は新関数を **両クラスに呼ぶラッパー** に変更：

```javascript
// 仕様（実装はしない）
function startTournament(){
  // 既存ボタン互換：参加者がいるクラスをすべて開始
  state.classes.forEach(function(c){
    if(state.players[c.id] && state.players[c.id].length>0 && !c.started){
      startTournamentForClass(c.id);
    }
  });
}
```

→ 既存「対局開始」ボタンは「参加者のいるクラス全部を一括開始」として動作。再クリック時は started===true のクラスは skip。

### 5.3 UI ボタン追加（§10 で詳述）

- クラスごとに「`<クラス名>` を開始」ボタンを追加
- 「対局開始」（一括）ボタンは互換のため残す

### 5.4 後追い開始のシナリオ（新設計での挙動）

| step | 操作 | 結果 |
| --- | --- | --- |
| 1 | A 登録 → 「A クラスを開始」 | A 開始、`state.classes[A].started=true`、A の pairings / results 生成 |
| 2 | A Round 1 結果入力 | `state.pairings.A` / `state.results.A` 更新（B は無関係） |
| 3 | B 参加者を登録 | `state.players.B` のみ更新（A は無関係） |
| 4 | 「B クラスを開始」 | B のみ開始、`state.classes[B].started=true`、A の pairings / results は **保護される** |
| 5 | A Round 2 進行、B Round 1 進行 | 両クラスが独立して進行 |

---

## 6. 次回戦生成をクラス単位にする仕様

### 6.1 既存 `generatePairing(cls)` は変更不要

[`generatePairing(cls)`](shogi_v4.html:4629) は既に cls 引数を取り、`state.players[cls]` / `state.results[cls]` のみ参照し、`state.pairings[cls]` のみ更新する。**他クラスへの副作用はない**。

→ 本設計では **既存関数をそのまま使用**。変更不要。

### 6.2 [`submitRound(cls)`](shogi_v4.html:4934) も変更不要

submitRound は当該クラスの pairings を results に push し、新しい pairings を generatePairing(cls) で生成する。クラス境界は保たれている。

### 6.3 次回戦生成 UI のクラス単位化

現状、`renderTournament(cls)` 経由で各クラスの pane に「次回戦を生成」ボタンが描画される。これは既にクラス単位なので **変更不要**。

### 6.4 確認事項

| 観点 | 評価 |
| --- | --- |
| generatePairing が他クラスの state を読まないか | ✅（[L4630](shogi_v4.html:4630) で cls 限定取得） |
| submitRound が他クラスの results を更新しないか | ✅（[L4966](shogi_v4.html:4966) で cls 限定 push） |
| 次回戦生成ボタンがクラス単位の DOM に紐づくか | ✅（pane-A / pane-B 別） |
| 「次回戦を全クラス一括で生成」のような暴走経路がないか | ✅（grep で確認、該当なし） |

---

## 7. 結果入力・結果保持をクラス単位にする仕様

### 7.1 既存実装は既にクラス単位

- [`setWinner(cls, idx, winner)`](shogi_v4.html:4732)：cls 引数で `state.pairings[cls][idx].winner` を更新
- 過去結果修正（[L5281-5311](shogi_v4.html:5281)）：`state.results[cls][roundIdx][matchIdx].winner` 編集

→ 本設計では **変更不要**。

### 7.2 結果配列の構造

```
state.results[cls] = [
  // Round 1
  [
    { p1: 'id1', p2: 'id2', winner: 'id1' },
    { p1: 'id3', p2: 'id4', winner: 'id4' }
  ],
  // Round 2
  [...]
]
```

クラス間で配列が完全分離されているため、A の Round 1 が B の Round N に影響することはない。

### 7.3 確認事項

| 観点 | 評価 |
| --- | --- |
| setWinner が他クラスの pairings を更新しないか | ✅ |
| 結果保持配列が classId ごとに独立か | ✅（`state.results[cls]` の入れ子配列） |
| 結果の deep copy が classId 境界を超えないか | ✅（[L4966](shogi_v4.html:4966) `JSON.parse(JSON.stringify(state.pairings[cls]))`） |

### 7.4 留意点（将来）

将来 `state.results` を `{A:[],B:[]}` から `{ [classId]: [] }` 動的キー構造に拡張する際、初期化コードを以下に変更：

```javascript
// 仕様（実装はしない）
state.results = {};
state.classes.forEach(function(c){ state.results[c.id] = []; });
```

これにより C クラス追加時も自然に対応可能。

---

## 8. 保存確認・再読込確認をクラス単位にする仕様

### 8.1 現状の save / load

- [`save()`](shogi_v4.html:511)：`localStorage.setItem(STORAGE_KEY, JSON.stringify(state))` で state **全体** を保存
- [`load()`](shogi_v4.html:534)：state 全体を復元し `normalizeState` で正規化
- [`normalizeState`](shogi_v4.html:433)：[L438](shogi_v4.html:438) で `['A','B'].forEach` 両クラスを正規化

### 8.2 設計方針：保存は state 一体、検証はクラス単位

**保存の単位は state 全体のまま維持**（破壊的変更を避ける）。ただし **検証** はクラス単位に分離する：

```javascript
// 仕様（実装はしない）
function classStartedInPersisted(persisted, classId){
  if(!persisted || !persisted.classes) return false;
  var k = persisted.classes.find(function(c){ return c.id===classId; });
  return !!(k && k.started===true);
}
```

これにより `startTournamentForClass(classId)` の SAVE-003 verify がクラス単位で動く。

### 8.3 `normalizeState` の更新範囲

```javascript
// 仕様（実装はしない）
function normalizeState(loaded){
  // 既存処理：state.players[cls] / state.pairings[cls] / state.results[cls] 正規化
  ['A','B'].forEach(function(cls){ /* 既存 */ });
  
  // 新規追加：state.classes の整合性確保
  if(!Array.isArray(loaded.classes)){
    // 旧データ互換：state.started → classes に展開
    loaded.classes = [
      { id:'A', name:'Aクラス', started: !!loaded.started },
      { id:'B', name:'Bクラス', started: !!loaded.started }
    ];
  } else {
    // 各 class の started / id / name を補完
    loaded.classes.forEach(function(c){
      if(typeof c.started !== 'boolean') c.started = false;
      if(typeof c.id !== 'string') c.id = '';
      if(typeof c.name !== 'string') c.name = c.id + 'クラス';
    });
    // A/B が無ければ追加
    ['A','B'].forEach(function(cls){
      if(!loaded.classes.find(function(c){ return c.id===cls; })){
        loaded.classes.push({ id:cls, name:cls+'クラス', started:false });
      }
    });
  }
}
```

### 8.4 旧データ互換（重要）

`state.started: boolean` のみ持つ旧 JSON を読み込んだ場合、normalizeState で `state.classes` に展開する。**旧データを開いた瞬間に破壊しない** ことが必須。

| 旧 JSON | 互換変換結果 |
| --- | --- |
| `started: false`、results 空 | `classes:[{A,started:false},{B,started:false}]` |
| `started: true`、results.A 有り、results.B 空 | `classes:[{A,started:true},{B,started:true}]`（両方 true、暫定。**設計時の判断ポイント**） |
| `started: true`、results 両方有り | `classes:[{A,started:true},{B,started:true}]` |

**設計判断ポイント A**：旧 `state.started===true` を新スキーマでどう展開するか。
- 案 a：両クラスとも started=true（保守的、誤検出なし）
- 案 b：results / pairings が非空のクラスのみ started=true（精密だが複雑）
- 推奨：**案 a（保守的）**。実装時に変更可能。

### 8.5 確認事項

| 観点 | 評価 |
| --- | --- |
| save が state 全体保存（クラス分離なし）でよいか | ✅（一体保存で問題なし、検証で分離） |
| load 時の旧データ互換性が維持されるか | ✅（normalizeState で展開、§8.3 / §8.4） |
| クラス単位の保存検証が可能か | ✅（`classStartedInPersisted` helper） |
| `state.classes` 未定義の旧 state を破壊しないか | ✅（normalizeState で補完） |

---

## 9. A/B/C など可変クラス数への対応方針

### 9.1 現状のクラス数固定箇所

| 種類 | 箇所 | 件数 |
| --- | --- | --- |
| `['A','B'].forEach` | normalizeState、save 周辺、bulk-edit、表示 helper | 約 10 件 |
| `state.players={A:[],B:[]}` / `pairings` / `results` | resetAll、resetTournamentProgressOnly、state 初期化 | 約 5 件 |
| `cls==='A'` / `cls==='B'` 比較 | UI 分岐、表示判定 | 約 10 件 |
| `state.players.A` / `.B` ドット記法 | UI bind、count 表示 | 約 15 件 |
| **総計** | — | 約 40 件 |

### 9.2 段階的置換戦略

**全件 1 度に置換しない**（IMPL-LIGHT 範囲を超え、回帰リスクが高い）。

| Phase | 置換対象 | リスク |
| --- | --- | --- |
| Phase 1（IMPL-LIGHT 1） | `state.classes` 導入 + `startTournamentForClass` 追加 + クラス単位 reset 追加。既存 A/B 固定コードは温存 | 低 |
| Phase 2（IMPL-LIGHT 2） | `normalizeState` の旧データ互換、`save/load` の互換確認、テスト整備 | 低〜中 |
| Phase 3（IMPL-MEDIUM 1） | C クラス UI 追加（参加者登録のクラス選択、対局画面の pane-C 追加） | 中 |
| Phase 4（IMPL-MEDIUM 2） | `['A','B'].forEach` 系を `state.classes.forEach(function(c){ ... c.id ... })` に置換 | 中（広範囲） |
| Phase 5（IMPL-MEDIUM 3） | `state.players.A` / `.B` ドット記法を bracket 記法に統一、`cls==='A'` 比較を `state.classes.find(c=>c.id===cls)` に置換 | 中〜高 |
| Phase 6（IMPL-HEAVY） | `state.players = {A:[],B:[]}` ハードコードを動的初期化に変更（`state.classes.forEach(c => state.players[c.id]=[])`） | 高 |

### 9.3 C クラス導入時の最小変更見込み

Phase 1〜2 完了時点で、**C クラスの追加は以下のみで可能**：

1. `state.classes.push({id:'C', name:'Cクラス', started:false})`
2. `state.players.C = []` / `state.pairings.C = []` / `state.results.C = []` を normalizeState で補完
3. 参加者登録 UI のクラス選択肢に `'C'` を追加
4. 対局画面の pane-C を DOM に追加（CSS 含む）

**重要**：Phase 1〜2 の段階では既存 A/B 固定コードが大半残っているため、**C クラスは「動くが UI 表示が不完全」な状態になる可能性**。Phase 3〜5 で完全対応。

### 9.4 クラス数上限の議論

| 案 | 上限 | 理由 |
| --- | --- | --- |
| A〜D（4 クラス） | 4 | 標準的な将棋大会（A 上位 / B 中位 / C 下位 / D 児童 等） |
| A〜F（6 クラス） | 6 | 大規模大会想定 |
| 無制限 | ∞ | 設計上は可能だが UI 配置が困難 |

**推奨**：**Phase 5 以降で 4 クラス（A〜D）対応**。UI レイアウトは tab 増設で対応可能。

---

## 10. UI 案

### 10.1 「対局開始」ボタンのクラス単位化

**案 A：クラス単位ボタンを追加（既存「対局開始」も残す）**

```
[ 大会全体 ]
  [ 対局開始 ]（既存、参加者のいる全クラスを一括開始）
  [ 大会進行データをリセット ]（既存）

[ A クラス ]
  参加者数: 8 名
  [ A クラスを開始 ]（新規、A だけ Round 1 を生成）
  [ A クラスをリセット ]（新規、A だけ pairings/results 初期化）

[ B クラス ]
  参加者数: 6 名
  [ B クラスを開始 ]（新規、B だけ Round 1 を生成）
  [ B クラスをリセット ]（新規、B だけ pairings/results 初期化）
```

メリット：明示的、安全（誤操作を防ぐ）
デメリット：ボタンが増える、UI スペース

**案 B：「対局開始」ボタンの動作を「未開始クラスのみ開始」に変更**

```
[ 対局開始 ]（既存、started=false のクラスだけ開始する。再クリック時は started=true の class は skip）
```

メリット：UI 変更最小
デメリット：オペレータが「何が開始されるか」を視覚的に把握しにくい

**推奨**：**案 A**（明示的、安全側）。ボタンは pane-A / pane-B の上部に配置。

### 10.2 「進行状態」表示

```
[ A クラス ] 進行中（Round 2 / 4） — 12 試合中
[ B クラス ] 未開始 — 参加者 6 名登録済
```

または：

```
[ A クラス ] ●開始済 / ●Round 2 進行中
[ B クラス ] ○未開始
```

### 10.3 「リセット」ボタンの分岐

**案 X：大会全体リセット + クラス単位リセット**

- 「大会進行データをリセット」（既存、両クラス）
- 「`<クラス名>` の進行データだけリセット」（新規、各クラス pane に配置）

確認ダイアログを **明示的にクラス名を含める**：

```
A クラスの組み合わせ・勝敗結果を削除します。
B クラスのデータは保持されます。
よろしいですか？
```

### 10.4 ボタン配置案

```
[ 参加者登録タブ（reg） ]
  ├ A クラス参加者一覧
  └ B クラス参加者一覧

[ 対局タブ（tournament） ]
  ├ pane-A
  │   ├ A クラス開始ボタン（A.started=false の時のみ表示）
  │   ├ A クラスリセットボタン（A.started=true の時のみ表示）
  │   ├ Round N 組合せ表示
  │   └ 結果入力 UI
  └ pane-B
      ├ B クラス開始ボタン（B.started=false の時のみ表示）
      ├ B クラスリセットボタン（B.started=true の時のみ表示）
      ├ Round N 組合せ表示
      └ 結果入力 UI

[ 結果タブ（result） ]
  ├ A クラス結果
  └ B クラス結果
```

### 10.5 表示上の留意点

- 「対局タブ」を開いた直後に **どのクラスが進行中か** が一目で分かること
- 未開始クラスの pane は「開始ボタン」を強調表示
- 開始済クラスの pane は「リセットボタン」を控えめに表示（誤操作防止）

---

## 11. 状態モデル案

### 11.1 新 state 構造（提案）

```javascript
state = {
  // 既存（互換のため維持）
  players:  { A:[], B:[] },     // 将来：{ [classId]: [] } 動的に
  pairings: { A:[], B:[] },     // 同上
  results:  { A:[], B:[] },     // 同上
  rounds: 4,
  report: { ... },
  
  // 旧フラグ（互換のため維持、derived として動作させたい）
  started: false,               // 旧コード互換（all-class OR）
  
  // 新規追加
  classes: [
    { id: 'A', name: 'Aクラス', started: false },
    { id: 'B', name: 'Bクラス', started: false }
  ]
};
```

### 11.2 クラス単位フラグの読み書き

```javascript
// 読み取り
function isClassStarted(classId){
  var k = state.classes.find(function(c){ return c.id===classId; });
  return !!(k && k.started);
}

// 書き込み
function setClassStarted(classId, value){
  var k = state.classes.find(function(c){ return c.id===classId; });
  if(k) k.started = !!value;
  // 旧 state.started 互換（all-class OR）
  state.started = state.classes.some(function(c){ return c.started===true; });
}
```

### 11.3 旧 `state.started` の扱い

| 方針 | 内容 | リスク |
| --- | --- | --- |
| A：完全廃止 | `state.started` を削除し、参照箇所をすべて `isClassStarted(cls)` に置換 | 高（旧コード全箇所改修） |
| **B：両立**（推奨） | `state.started` は `setClassStarted` 時に同期更新（all-class OR）。読み取りは新コードでは `isClassStarted(cls)` を使う、旧コードは `state.started` のまま | 低 |
| C：派生プロパティ | `Object.defineProperty(state, 'started', { get: ... })` で derived 化 | 中（JSON serialize / normalizeState との整合性に注意） |

**推奨**：**案 B（両立）**。実装時に最小コストで安全。

### 11.4 状態遷移図

```
[ 未開始 ]               [ 進行中 ]              [ 終了 ]
classes[i].started=false  classes[i].started=true  classes[i].started=true
results[i] 空            results[i] 一部入り       results[i] フル

   │ startTournamentForClass(i)    │ submitRound(i) を rounds 回
   ↓                               ↓
   未開始 → 進行中                  進行中 → 終了

   │ resetClassForClass(i)
   ↓
   進行中 → 未開始（results / pairings 初期化）
```

各クラスの状態遷移は **他クラスから完全に独立**。

### 11.5 確認事項

| 観点 | 評価 |
| --- | --- |
| 旧 state.started が当面壊れないか | ✅（案 B：両立） |
| 新 state.classes が JSON serialize 可能か | ✅（配列とオブジェクトのみ） |
| normalizeState で旧データ互換が取れるか | ✅（§8.3 / §8.4） |
| C クラス追加時に state schema 変更不要か | ✅（classes.push のみ） |

---

## 12. テスト観点

### 12.1 unit test 追加候補（IMPL-LIGHT で書く）

| # | テスト名 | 観点 |
| --- | --- | --- |
| 1 | `startTournamentForClass(A)` で B クラスの pairings/results が破壊されないこと | クラス分離 |
| 2 | `startTournamentForClass(A)` 実行後に `startTournamentForClass(B)` が成功すること | 後追い開始 |
| 3 | A 開始済の状態で `startTournamentForClass(A)` 再呼出が alert で停止すること | 二重開始ガード |
| 4 | `resetClassForClass(A)` 実行後、B クラスの pairings/results が保持されること | クラス単位 reset |
| 5 | 旧 `state.started===true` のみの JSON を load して normalizeState すると、両クラスとも started=true になること（§8.4 案 a） | 旧データ互換 |
| 6 | `state.classes` が未定義の旧 JSON を load して、`['A','B']` を自動補完すること | normalizeState |
| 7 | `setClassStarted(A, true)` 後に `state.started` が true になり、`setClassStarted(A, false)` 後に B が false なら state.started も false になること | 旧フラグ derived |
| 8 | `state.classes.push({id:'C',name:'Cクラス',started:false})` 後に `state.players.C=[]`、`state.pairings.C=[]`、`state.results.C=[]` を normalizeState で補完すること | C クラス対応の下地 |
| 9 | `startTournamentForClass(A)` の SAVE-003 verify が `classStartedInPersisted(persisted, 'A')` で動くこと | save 検証 |
| 10 | UI: 「A クラスを開始」ボタンの click handler が `startTournamentForClass('A')` を呼ぶこと | UI bind |

### 12.2 既存テストへの影響

| 既存テスト | 影響予想 |
| --- | --- |
| `test/run_tests.sh` 配下の 73 stanza | 大半は不変（state structure は維持）。startTournament を直接呼ぶテストは「両クラス開始」として動作継続 |
| `test/e2e/` 配下 | playwright 経由の操作シナリオは新ボタン追加に対応する必要あり（追加 only、既存削除なし） |
| VRT snapshot | pane-A / pane-B のボタン追加で snapshot mismatch の可能性 → snapshot 更新は明示許可制 |

### 12.3 リグレッション観点

- **旧データ load**：`state.started: true` で `classes` 未定義の JSON を load して破綻しないこと
- **両クラス同時開始**：既存「対局開始」ボタンで A/B 両方を一括開始する従来動作が崩れないこと
- **片方クラスのみ参加者あり**：A のみに参加者がいる場合、B クラス開始ボタンは disabled or 「参加者がいません」表示
- **結果入力後の動作**：A Round 1 結果入力済の状態で B Round 1 を開始しても、A の結果が消えないこと（**本タスクの最重要シナリオ**）

### 12.4 手動受け入れシナリオ（オペレータ受け入れ）

```
シナリオ 1：A 単独開始 → B 後追い開始
1. A に 8 名登録
2. 「A クラスを開始」 → A Round 1 表示
3. A Round 1 結果入力（4 試合）
4. A 「次回戦を生成」 → A Round 2 表示
5. B に 6 名登録
6. 「B クラスを開始」 → B Round 1 表示
7. A の Round 1 結果が保持されていることを確認 ← 重要
8. A の pairings / results が変化していないことを確認
```

---

## 13. 今回やらないこと

本 PR では以下を **実施しない**：

1. **実装**（`shogi_v4.html` 1 行も変更しない）
2. **テスト**（`test/` / `test/e2e/` 1 行も変更しない）
3. **snapshot / VRT 変更**
4. **workflow / package 変更**
5. **`.github/` 配下変更**
6. **localStorage schema 変更**（設計のみ、実装は別タスク）
7. **C クラス UI 実装**
8. **参加者登録画面のクラス選択拡張**
9. **A/B literal 比較の置換**（40 箇所、別 Phase）
10. **`state.players` / `state.pairings` / `state.results` の動的キー化**（別 Phase）
11. **旧データマイグレーションスクリプト作成**
12. **AI 非同期運用 v0.2 Draft の正式採用判断**
13. **既存 ops docs 改訂**
14. **既存 specs docs 改訂**
15. **Ready 化 / merge / branch 削除**
16. **Candidate Adopt / Task 化**
17. **後続実装タスク着手**

---

## 14. 後続実装タスク候補

本 Design PR が main 反映された後、髙橋さん明示許可（Approval Phrase 受領）で別 PR / 別セッションで進める。

| 優先 | Task ID | 範囲 | Risk Level |
| --- | --- | --- | --- |
| **第一** | `ROUND-CLASS-SCOPE-IMPL-LIGHT-PHASE1` | `state.classes` 導入 + `startTournamentForClass(classId)` 新設 + `resetClassForClass(classId)` 新設 + クラス単位 UI ボタン追加（pane-A / pane-B 上部） | Level 3（実装、Codex review 必須寄り、UI 影響あり、VRT 影響あり） |
| 第二 | `ROUND-CLASS-SCOPE-IMPL-LIGHT-PHASE2` | `normalizeState` 旧データ互換、`save/load` 互換確認、unit test 整備、`state.started` derived 同期、SAVE-003 verify をクラス単位化 | Level 3（schema 関連） |
| 第三 | `ROUND-CLASS-SCOPE-IMPL-MEDIUM-PHASE3` | C クラス UI 追加（参加者登録の class 選択拡張、対局画面に pane-C 追加、結果画面に C カラム追加） | Level 3（UI 拡張、CSS 影響、VRT 影響） |
| 第四 | `ROUND-CLASS-SCOPE-IMPL-MEDIUM-PHASE4` | `['A','B'].forEach` 系を `state.classes.forEach` に置換（normalizeState、save 周辺、表示 helper、bulk-edit 等） | Level 3（広範囲、約 10 箇所） |
| 第五 | `ROUND-CLASS-SCOPE-IMPL-MEDIUM-PHASE5` | `cls==='A'` 比較 / `state.players.A` ドット記法を classId ベースに置換 | Level 3（広範囲、約 25 箇所） |
| 第六 | `ROUND-CLASS-SCOPE-IMPL-HEAVY-PHASE6` | `state.players = {A:[],B:[]}` ハードコードを動的初期化に変更 | Level 3〜4（schema 完全移行） |
| 並走可 | `ROUND-CLASS-SCOPE-DATA-MIGRATION-DESIGN` | 旧データ（`state.started: bool`、`classes` なし）を新スキーマに変換するマイグレーション設計（normalizeState で自動変換、§8.3 / §8.4 ベース） | Level 1（docs-only） |
| 並走可 | `ROUND-CLASS-SCOPE-UI-DESIGN` | UI 詳細設計（ボタンレイアウト、CSS、進行状態表示、エラーハンドリング、a11y） | Level 1（docs-only） |
| 並走可 | `ROUND-CLASS-SCOPE-E2E-TEST-DESIGN` | E2E テストシナリオ設計（後追い開始シナリオ、クラス独立進行、旧データ互換ロード等） | Level 1（docs-only） |

### 14.1 着手順序の推奨

**Phase 1 → Phase 2 を 1 つの IMPL-LIGHT に束ねる案も検討可能**（state schema 変更と新関数追加は密接に関連するため）。ただし「1 PR 1 関心事」原則（v0.2 Draft §3 / RESET-UX シリーズで実証）からは **分離が無難**。

判断ポイント：
- 分離する場合：Phase 1 が main 反映 → Phase 2 着手（小 PR、レビュー容易）
- 統合する場合：Phase 1+2 を 1 PR、Codex review 重め、リグレッションリスク中

**推奨**：**分離**。

### 14.2 リスクが残る論点（後続設計で詰める）

1. **「対局開始」一括ボタンを廃止するかどうか**（§10.1 案 B）
   - 残す場合：互換維持、UI スペース増加
   - 廃止する場合：オペレータ手順変更が必要、移行コスト
2. **`state.started` を完全に廃止するか**（§11.3 案 A vs B）
   - 当面は両立（案 B）で十分
3. **C クラス導入のタイミング**
   - Phase 3 で UI 含めて追加するか、Phase 6 完了後にまとめて追加するか
4. **旧データの自動マイグレーション vs 手動操作要求**
   - 自動マイグレーション（normalizeState 内で完結）が安全
   - ただし「変換されたことが見えない」リスクあり、UI で通知するか検討
5. **VRT snapshot 更新**
   - pane-A / pane-B の新ボタンで snapshot 必ず mismatch する
   - Phase 1 着手時に snapshot 更新を **別 AR** で明示許可制とする

---

## 15. 結論

- **現状の `startTournament()` は大会全体（A+B）を同時に初期化** しており、A の進行中・結果入力済の状態で B を後追い開始する手段が **UI 上は存在しない**（[L4453](shogi_v4.html:4453) `state.started===true` ガードで停止、回避には `resetTournamentProgressOnly` が必要 → A の結果も消える）。
- 一方、**関数レベルでは `generatePairing(cls)` / `submitRound(cls)` / `setWinner(cls,...)` がすでにクラス単位で動作** しており、クラス分離は約 80% 完了している。
- 残る課題は **「対局開始」「リセット」「state.started フラグ」「`state.players` 等の {A:[],B:[]} 固定ディクショナリ」** の 4 点。
- 本 Design では：
  - **classId / className ベースの `state.classes` 配列を導入**
  - **クラス単位の `startTournamentForClass(classId)` / `resetClassForClass(classId)` を新設**
  - **既存 `state.started` は all-class OR の derived として両立**
  - **C クラス以上の追加は `state.classes.push(...)` のみで対応可能**
  - **段階的移行（Phase 1〜6）で破壊的変更を避ける**
- 本 PR は **docs-only / 設計のみ**。実装は後続 `ROUND-CLASS-SCOPE-IMPL-LIGHT-PHASE1` 以降で扱う。
