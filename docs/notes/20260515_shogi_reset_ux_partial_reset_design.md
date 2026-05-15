# RESET-UX-PARTIAL-RESET-DESIGN — 参加者を残す大会進行データリセット方針

**Task ID**: `RESET-UX-PARTIAL-RESET-DESIGN`
**作業種別**: docs-only / design / reset UX / partial reset / reception UX
**HEAD**: `52a1c3f`（PR #112 squash merge 後の main）
**前提 PR 系列**:
- PR #99 `PAIRING-UX-INVENTORY`
- PR #103〜#105 `PAIRING-UX-WARNING-DECISION-SUPPORT-*` / `SCORE-LIST-READABILITY-*`
- PR #106〜#110 `PAIRING-UX-MANUAL-CHANGE-*`
- **PR #111** `RECEPTION-UX-START-BUTTON-GUARD-DESIGN`（[`docs/notes/20260515_shogi_reception_ux_start_button_guard_design.md`](20260515_shogi_reception_ux_start_button_guard_design.md)）
- **PR #112** `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT`（`startTournament` 冒頭に `state.started===true` ガード追加、誘導先は「大会データをリセット」）

---

## 1. 目的と非目的

### 1.1 目的

- 現行「大会データをリセット」（[`resetAll`](../../shogi_v4.html) [L5904](../../shogi_v4.html)）が **`state.players` も含めて全消去** する仕様であることを前提に、**運営者目線で分かりやすい「リセット」設計** を整理する
- 「**参加者は残して、組み合わせ・勝敗結果など大会進行データだけをリセット**する」部分リセットが必要かどうかを判断材料を揃えて議論する
- PR #112 で確立した「大会開始後の `#startBtn` 再クリック → 大会データリセットへ誘導」フローを踏まえ、**誘導先のリセット仕様が運営者にとって自然か** を点検し、必要なら責務分離する
- 部分リセットを採用する場合の **データ分類 / UI / 文言 / IMPL-LIGHT 候補 / テスト方針 / リスク** を docs-only で整理する

### 1.2 非目的

- 今回は **実装しない**（docs-only design check）
- `shogi_v4.html` / `test/` / `test/e2e/` / Visual Regression snapshot / `.github/workflows/` / `package*.json` / `playwright.config.js` / `docs/specs/` を変更しない
- `resetAll()` の挙動を docs-only で変更したと宣言しない（仕様変更は IMPL タスクで取り扱う）
- `removePlayer()` / `startTournament()` の判定変更には踏み込まない（**PR #111 / PR #112 の合意ライン**を維持）
- pairing 生成ロジック / `generatePairing` / Fisher-Yates / `evaluatePairingQuality` を変更しない
- 大会進行状態を state machine 化しない
- localStorage schema を変更しない
- 大会履歴（過去大会の保存）/ undo / 再開始ウィザード（PR #111 案 E）には踏み込まない
- 後続観察待ちの `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4 / `IMPL-MEDIUM` 各種には進まない

---

## 2. 背景

### 2.1 直近の合意ライン

- **PR #111** で「`startTournament` を **開始操作専用** に絞り、開始後の再クリックは `resetAll` へ誘導する」設計が確定
- **PR #112** でその IMPL-LIGHT が着地。`alert` 文言:

  ```
  大会はすでに開始されています。
  参加者を変更する場合は、先に「大会データをリセット」を実行してください。
  大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。
  ```

- PR #111 §7.3 で議論の通り、`alert` 文言には **「参加者一覧は残ります」を書かない** 方針を採用（`resetAll` 現仕様で `state.players` も空になるため、誤誘導回避）

### 2.2 PR #111 が積み残した課題

- 「参加者を残したまま結果だけ消す機能は **現時点で存在しない**」と PR #111 §7.3 で明示
- PR #111 §13 / PR #112 §17 ともに「次タスク候補 第三 = `RESET-UX-PARTIAL-RESET-DESIGN`」とし、**強い運営者ニーズが出た場合** を着手条件とした

### 2.3 本タスクの問い

PR #112 着地後、誘導先である `resetAll` が「**参加者ごと消える**」事実は、運営者にとって以下のいずれかに見える可能性がある:

1. **想定通り**: 受付からやり直すつもりだったから問題ない（UC3 系）
2. **過剰**: 参加者は受付済みなので残したかった（UC1 / UC2 系）
3. **混乱**: 「大会データ」という言葉から参加者が含まれるかどうか分からない

本ドキュメントは、上記 3 通りの可能性を docs-only で **比較できる材料に変換** し、IMPL に進める判断資料を整える。

---

## 3. 現状コード確認（HEAD = 52a1c3f）

### 3.1 [`resetAll`](../../shogi_v4.html) ([L5904-5934](../../shogi_v4.html))

```js
function resetAll(){
  if(!confirm('現在の大会データをリセットします（支部マスタは保持されます）'))return;
  state={players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,
         report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}};
  _pendingNewYomi={};_yomiAutoBuffer='';_yomiManuallyEdited=false;
  try{
    // 仕様書 3.4.1 / §3.1.5: shogi_branch_master は絶対に消さない
    localStorage.removeItem(STORAGE_KEY);
    for(var i=0;i<LEGACY_STORAGE_KEYS.length;i++)localStorage.removeItem(LEGACY_STORAGE_KEYS[i]);
  }catch(e){}
  // 開きっぱなしのモーダルを閉じる
  ['bulk-edit-modal','edit-past-modal','chg-modal','load-modal'].forEach(function(mid){
    var m=document.getElementById(mid);if(m)m.remove();
  });
  renderRegList();
  // 表示DOMを明示的にクリア
  var paneA=document.getElementById('pane-A');if(paneA)paneA.innerHTML='';
  var paneB=document.getElementById('pane-B');if(paneB)paneB.innerHTML='';
  var resultA=document.getElementById('result-A');if(resultA)resultA.innerHTML='';
  var resultB=document.getElementById('result-B');if(resultB)resultB.innerHTML='';
  // 大会報告書入力欄を初期化（rep-date / rep-place / rep-start / rep-end / rep-sei / rep-fuku / rep-note）
  ...
  showTab('reg');
  showMsg('リセットしました','ok');
}
```

### 3.2 確認結果（タスク §2 の 13 項目に対応）

| # | 確認項目 | 実態 |
|---|---|---|
| 1 | `resetAll()` が実際に何を消すか | `state` 全体を初期構造に再代入 + `STORAGE_KEY`/`LEGACY_STORAGE_KEYS` の localStorage 削除 + DOM 一部 clear + 開きっぱなしモーダル close |
| 2 | `state.players` を消すか | **消す**（`{A:[],B:[]}` に置換、entry_no / member_id / member / grade すべて喪失） |
| 3 | `state.pairings` / `state.results` / `state.round` / `state.started` | **`pairings={A:[],B:[]}` / `results={A:[],B:[]}` / `started=false` に再代入**。**`state.round`（単数）は存在しない**（state 構造に round 単数フィールドなし、現在ラウンドは `state.results[cls].length` から導出）。**`state.rounds`（複数）は存在する** = 大会の設定値 / 最大局数相当のフィールドであり、現行 `resetAll()` は `4` に戻す |
| 4 | `pastMatches` / `history` の扱い | **`state.pastMatches` / `state.history` は存在しない**。`pastMatches` は [`removePlayer`](../../shogi_v4.html) 内の **ローカル変数**（`state.results` を走査して集計）。「過去対戦履歴」は `state.results` がそのまま唯一の真理源 |
| 5 | 支部マスタ / 会員マスタ | **`shogi_branch_master`（`BRANCH_MASTER_KEY`、[L576](../../shogi_v4.html)）は保持**（resetAll コード内に「絶対に消さない」コメント明示、[L5908](../../shogi_v4.html)）。支部マスタ = 会員マスタ（単一支部運営前提、members 配列を含む単一 master） |
| 6 | `resetAll()` 後の localStorage | `STORAGE_KEY`(`shogi_v4`) / `LEGACY_STORAGE_KEYS`(`shogi_v3`) は削除済 / `BRANCH_MASTER_KEY`(`shogi_branch_master`) は **そのまま** / 次回 `save()` 呼出までは `shogi_v4` キーが localStorage に存在しない状態 |
| 7 | 遷移先画面 | `showTab('reg')`（参加者登録タブ） |
| 8 | confirm 文言 | `現在の大会データをリセットします（支部マスタは保持されます）` |
| 9 | `startTournament` guard alert との文言整合 | PR #112 alert 内の鉤括弧表記「大会データをリセット」と `#resetBtn` 表示文言（[L100](../../shogi_v4.html) 周辺）「大会データをリセット」は語彙整合済 |
| 10 | `removePlayer` 削除不可文言との整合 | 二次禁止 alert（[L3780](../../shogi_v4.html)）は `「リセット」で大会をやり直してください` と案内。`#resetBtn` 文言「大会データをリセット」と語彙整合 |
| 11 | 参加者だけ残して進行データだけ消す関数 | **存在しない**（grep: `state.players` を保持しつつ `pairings`/`results`/`started` を空にする callsite はゼロ） |
| 12 | `resetAll()` を分割しやすい構造か | **比較的容易**。state 再代入は 1 行に集約されているため、`players` を保ったまま他フィールドだけ初期化する helper（仮 `resetTournamentProgressOnly()`）の追加は副作用が小さい |
| 13 | localStorage schema を変えずに実装できるか | **可能**。`save()` で `state` 全体を再シリアライズするだけのため、フィールドの値を空に戻すだけならスキーマ変更不要 |

### 3.3 `state` 構造の確認（[L210-217](../../shogi_v4.html)）

```js
var state = {
  players: {A:[], B:[]},
  rounds: 4,
  pairings: {A:[], B:[]},
  results: {A:[], B:[]},
  started: false,
  report: {date:'', place:'労政会館', start:'', end:'', sei:'', fuku:'', note:''}
};
```

加えて [`normalizeState`](../../shogi_v4.html) ([L432-488](../../shogi_v4.html)) は **`tournament_id`**（支部マスタ連携用、F2）を JSON load 時に保持する仕様。これは `resetAll` 後の初期 state には付与されない（明示的に `state` を再代入で潰すため）。

**重要**: タスク §2 / §8 で言及されている `state.round`（単数）/ `state.pastMatches` / `state.history` / `state.branches` / `state.master` 等は **本アプリの state には存在しない**。これらは将来想定の概念であり、設計時に「ある前提」で議論しない。

**注意（混同回避）**: 似た名前の **`state.rounds`（複数形）は実在する**（[L212](../../shogi_v4.html) 初期値 `4` / [L433](../../shogi_v4.html) normalize / [L435](../../shogi_v4.html) `Number(s.rounds)||4`）。本ドキュメントで「`state.round` は存在しない」と書くときは **単数形** を指す。`state.rounds`（複数）= **大会の設定値 / 最大局数相当**であり、後述 §6 で部分リセットの取扱を別途検討する。

### 3.4 [`startTournament`](../../shogi_v4.html) ([L4429-4490](../../shogi_v4.html))（PR #112 着地後）

```js
function startTournament(){
  var total=state.players.A.length+state.players.B.length;
  // PR #112 guard
  if(state.started===true){
    alert('大会はすでに開始されています。\n参加者を変更する場合は、先に「大会データをリセット」を実行してください。\n大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。');
    return;
  }
  if(total<2){...}
  if(state.players.A.length%2!==0&&...){...}
  if(state.players.B.length%2!==0&&...){...}
  var hasOngoing=state.started && (...);
  if(hasOngoing){if(!confirm('進行中の大会データがあります。再開始すると現在の結果が消えます。続けますか？'))return;}
  state.started=true;
  state.pairings={A:[],B:[]};
  state.results={A:[],B:[]};
  if(state.players.A.length>0)generatePairing('A');
  if(state.players.B.length>0)generatePairing('B');
  showTab('tournament');save();
  // SAVE-003 verify ...
}
```

部分リセット導入後は、**部分リセット直後に `startTournament` を再実行すると通常開始経路に流れる** ことが期待される（`state.started=false` / `pairings=空` / `results=空` の状態に戻すため）。

### 3.5 [`removePlayer`](../../shogi_v4.html) ([L3760-3782](../../shogi_v4.html))

```js
function removePlayer(id,cls){
  var name=getName(id,cls);
  var inPairings=false;
  for(var i=0;i<state.pairings[cls].length;i++){
    var pm=state.pairings[cls][i];
    if(pm.p1===id||pm.p2===id){inPairings=true;break;}
  }
  if(inPairings){
    alert(name+'は進行中の対局に登録されているため削除できません。\n\n先に「対戦相手変更」で別の選手に差し替えてから削除してください。');
    return;
  }
  var pastMatches=0;
  for(var r=0;r<state.results[cls].length;r++){
    for(var mi=0;mi<state.results[cls][r].length;mi++){
      var rm=state.results[cls][r][mi];
      if(rm.p1===id||rm.p2===id)pastMatches++;
    }
  }
  // 大会開始後で過去対局がある参加者は削除禁止（calcFinal が state.players 前提のため、TypeError で最終結果タブが落ちる）
  if(state.started&&pastMatches>0){
    alert(name+'は過去'+pastMatches+'試合分の対戦履歴があるため、大会開始後は削除できません。\n\n誤って登録した場合は「リセット」で大会をやり直してください。');
    return;
  }
  ...
}
```

- 一次禁止: `state.pairings[cls]` メンバーシップ
- 二次禁止: `state.started && pastMatches>0`（`state.results` 由来の集計）

**部分リセット導入後の整合**:
- `state.pairings` を空にすれば一次禁止は自然解除
- `state.started=false` にすれば二次禁止は自然解除（`pastMatches` がローカル集計のため、`state.results` を空にすれば 0 になる）
- → **部分リセットでは `state.pairings` / `state.results` / `state.started` をすべて初期化する必要がある**（どれか 1 つでも残すと removePlayer 整合が崩れる）

---

## 4. ユースケース

### 4.1 UC1: 受付完了後、まだ 1 局目開始前に組み合わせだけ作り直したい

- 参加者登録は完了、組み合わせ生成済、対局はまだ
- 支部・クラス・人数の入力は維持したい
- 組み合わせだけ作り直したい

**現状の選択肢**:
- 開始ボタン再クリック → PR #112 で `state.started===true` ガード alert により拒否、`resetAll` 誘導
- `resetAll` → 参加者まで消える、参加者登録からやり直し

**運営者の体感**: 「やり直したいだけなのに参加者まで消える」= 過剰。**部分リセットがあれば最も恩恵を受けるユースケース**。

### 4.2 UC2: 1 局目以降に参加者を修正したい

- 入力ミス / 欠席者発覚
- 既に組み合わせや勝敗結果がある
- 参加者変更には進行データの整合性リスク
- 参加者一覧（受付情報）はできれば残したいが、手合い・勝敗は消える必要がある

**現状の選択肢**:
- `removePlayer` → 一次禁止 / 二次禁止 alert で弾かれることが多い、「対戦相手変更」誘導は意図と異なる
- `resetAll` → 参加者まで消える

**運営者の体感**: 「修正したいのは 1 人だけなのに、参加者全員の受付情報がリセット」= 重い。

**注意**: 部分リセットを使うと「受付済の参加者リストは残るが、これまでの勝敗履歴も丸ごと消える」となるため、**最初からやり直し** に近い。`removePlayer` のような **個別差替** は別の操作系統。本設計では混同しないように UC2 では「**まとめてやり直す**」用途のみを対象とする。

### 4.3 UC3: 大会を完全に最初からやり直したい

- テストデータを消す / 別大会を始める
- 参加者も含めて全部消したい

**現状**: `resetAll` がこの用途に合致。**部分リセットを足しても UC3 は影響を受けない**（全リセット動線を残す前提）。

### 4.4 UC4: 支部マスタ / 会員マスタは保持したい

- 大会ごとの参加者は消してよい
- 支部マスタ / 会員マスタは残したい

**現状**: `resetAll` 内で `BRANCH_MASTER_KEY='shogi_branch_master'` は **明示的に保持**（[L5908](../../shogi_v4.html) コメント「絶対に消さない」）。**満たしている**。

**部分リセット導入後**: 当然これも維持。**マスタを誤って消す動線は導入しない**（§6 / §11 で明示）。

---

## 5. 案 A〜E 比較

### 5.1 案 A: 現状維持

**内容**: `resetAll` の仕様変更も追加もしない。

| 項目 | 評価 |
|---|---|
| 実装コスト | **ゼロ** |
| UC1 への適合 | ✗（参加者ごと消える） |
| UC2 への適合 | ✗（参加者ごと消える） |
| UC3 への適合 | ◯（適合） |
| PR #112 誘導先の自然さ | △（運営者が「参加者ごと消える」事実に気づかないリスク） |
| confirm 文言の正確さ | △（「大会データ」が参加者を含むかは曖昧） |
| 誤操作リスク | 低（分岐が増えない） |
| VRT 影響 | なし |

**判定**: 採用しない。**PR #112 で `resetAll` を主要誘導先に据えた以上、参加者ごと消える事実を運営者に伝える / 部分リセット動線を作る、のどちらかが必要**。

### 5.2 案 B: ボタン名を「大会データを全リセット」に変える（文言のみ）

**内容**: `resetAll` の挙動は変えず、`#resetBtn` の表示文言と confirm 文言を「全リセット」「参加者も含めて削除」に書き換える。

| 項目 | 評価 |
|---|---|
| 実装コスト | 小（DOM 文言 1 箇所 + `resetAll` 内 confirm 文言 1 行） |
| UC1 への適合 | ✗（依然として参加者ごと消える） |
| UC2 への適合 | ✗ |
| UC3 への適合 | ◯ |
| 誤解の削減 | ◯（「参加者も消える」が運営者に伝わる） |
| PR #112 alert との整合 | **要更新**（誘導先の文言が変わるため alert 文言も同期更新が必要） |
| VRT 影響 | あり（`#resetBtn` 文言変更 → header VRT が red になる可能性） |
| E2E 影響 | あり得る（`大会データをリセット` を locator として持つテストが存在する場合） |

**判定**: 部分リセット導入と組み合わせる場合の **下準備として有効** だが、**単独では UC1/UC2 を救えない**。案 C と同時着地する場合のオプション。

### 5.3 案 C: 「大会進行データだけリセット」を追加（推奨第一候補）

**内容**:
- 新規 helper `resetTournamentProgressOnly()`（仮）を追加
- `state.players` は維持
- `state.pairings` / `state.results` / `state.started` / 関連 DOM を初期化
- 既存 `resetAll()` は **全リセット** として残す
- ボタンを 1 つ追加（配置は §7.3 で検討）

| 項目 | 評価 |
|---|---|
| 実装コスト | 中（helper +20〜40 行 / button 追加 / イベントハンドラ / テスト） |
| UC1 への適合 | **◎**（最も恩恵） |
| UC2 への適合 | ◯（受付情報は残る、ただし「まとめてやり直す」用途のみ） |
| UC3 への適合 | ◯（既存 `resetAll` をそのまま使う） |
| PR #112 誘導先 | △→◯（**alert 誘導先を「大会データをリセット」から「大会進行データをリセット」に切替える**判断が要、§9 で論点） |
| ボタン文言設計 | 要慎重（「全リセット」と「進行データリセット」の差を直感的に伝える必要） |
| 誤操作リスク | 中（ボタンが増えるため誤って一方を押す可能性、destructive スタイル + confirm 文言で抑制） |
| 実装の分割しやすさ | ◯（state 再代入は 1 行に集約、`players` のみ保持して他を空にする helper 抽出は容易） |
| localStorage schema | 不変（既存フィールドの値を空に戻すだけ） |
| VRT 影響 | あり（button 追加のため header VRT 影響、§10.5 で判断） |

**判定**: **第一推奨**。ただし「ボタン文言」「配置」「PR #112 alert との誘導先整合」を §7〜§9 で詰めてから IMPL-LIGHT に進む。

### 5.4 案 D: `resetAll()` を「参加者を残す」仕様に変更（破壊的）

**内容**: 既存「大会データをリセット」を、参加者を残す部分リセットに **変更**。全リセット用には別ボタン or 削除。

| 項目 | 評価 |
|---|---|
| 実装コスト | 中〜大（helper 入替 + 全リセット側の機能保証 + 既存テスト全面見直し） |
| UC1 への適合 | ◎ |
| UC2 への適合 | ◯ |
| UC3 への適合 | △（全リセット動線が別になる、別ボタン or JSON load 経由など） |
| 既存ユーザー影響 | **破壊的**（「大会データをリセット」を押せば全部消えると思って使っている運用者にとって不可逆な動作差） |
| PR #111 / PR #112 整合 | **破壊的**（PR #112 alert 内「組み合わせ・勝敗結果は削除されます」が嘘になる、`state.players` が残ると alert で約束していないため運営者の期待と齟齬） |
| 既存テスト | **要大幅更新** |
| IMPL-LIGHT 適合 | ✗（IMPL-LIGHT には重い） |

**判定**: 採用しない。**現運用者の期待を裏切る破壊的変更は IMPL-LIGHT の範囲を超える**。将来 IMPL-MEDIUM で再検討する場合は別タスク `RESET-UX-SEMANTICS-MIGRATION` で起票。

### 5.5 案 E: リセット時に選択肢モーダルを出す

**内容**: 「大会データをリセット」押下時、専用モーダルを開く:
1. 参加者を残して進行データだけリセット
2. 参加者も含めて全リセット
3. キャンセル

| 項目 | 評価 |
|---|---|
| 実装コスト | 大（モーダル DOM + イベント + 文言 + テスト + VRT 影響） |
| UC1 への適合 | ◎ |
| UC2 への適合 | ◯ |
| UC3 への適合 | ◯ |
| 誤操作防止 | ◎（明示選択、最も丁寧） |
| ボタン数 | 既存 1 のまま |
| 確認フロー | 重い（`alert` / `confirm` を超え、専用モーダル化必須） |
| 既存 modal 群との一貫性 | ◯（`bulk-edit-modal` / `edit-past-modal` / `chg-modal` / `load-modal` 等が既存） |
| IMPL-LIGHT 適合 | △〜✗（モーダル新規追加は IMPL-LIGHT には重い） |
| PR #112 alert との整合 | △（alert 誘導先を「リセットボタンを押すと選べるようになる」と書く必要あり、文言再設計） |

**判定**: **IMPL-MEDIUM 候補**。案 C 着地後の運用観察で「ボタン 2 個案 (C) のままだと混乱が出る」と判明した場合、案 C を案 E に格上げする経路を残す。

### 5.6 比較表

| 案 | UC1 | UC2 | UC3 | UC4 | 実装規模 | VRT 影響 | PR #112 整合 | IMPL-LIGHT 適合 |
|---|---|---|---|---|---|---|---|---|
| A 現状維持 | ✗ | ✗ | ◯ | ◯ | 0 | なし | △ | — |
| B 文言のみ全リセット明示 | ✗ | ✗ | ◯ | ◯ | 小 | 小〜中 | 要 alert 更新 | ◯（補助） |
| **C 進行データリセット追加** | **◎** | ◯ | ◯ | ◯ | 中 | 中 | 要 alert 誘導先見直し | **◎** |
| D resetAll 仕様変更 | ◎ | ◯ | △ | ◯ | 中〜大 | 中 | 破壊的 | ✗ |
| E モーダル選択 | ◎ | ◯ | ◯ | ◯ | 大 | 大 | 要 alert 文言再設計 | △〜✗ |

---

## 6. データ分類

部分リセット採用時の取扱を分かりやすくするため、`state` と localStorage を **3 つのカテゴリ** に分けて整理する。

### 6.1 A. 参加者データ（部分リセットでは **残す**、全リセットでは **消す**）

| 項目 | 実体 | 備考 |
|---|---|---|
| クラス別参加者配列 | `state.players.A` / `state.players.B` | 配列順は entry_no と必ずしも一致しない |
| 参加者 ID | `players[i].id` | 内部 ID（`p_xxx_xxx` 形式）|
| 氏名 | `players[i].name` | |
| 受付番号 | `players[i].entry_no` | A-5.1 §11.8 欠番維持 |
| 支部員区分 | `players[i].member` | `'member'` / `'other'` |
| 年齢区分 | `players[i].grade` | `'ippan'` / `'chu'` |
| 支部マスタ連携 ID | `players[i].member_id` | F2、未付与なら不在 |
| **大会識別子** | **`state.tournament_id`** | F2 支部マスタ連携用、`normalizeState` [L486](../../shogi_v4.html) で JSON load 時に保持。**部分リセットでは「同じ大会の参加者を残したまま進行データだけやり直す」操作のため tournament_id も維持**（消すと「同一大会内の進行リセット」と「別大会作成」の区別が曖昧になる）|

**部分リセットで `state.tournament_id` を残す理由**（PR #113 review 指摘）:
- 部分リセットは「同一大会の進行データをやり直す」操作であって「別大会を作る」操作ではない
- `tournament_id` を消すと、後続の支部マスタ連携処理（attendance_count 集計や tournament_ids union）で別大会扱いされる可能性があり、運営者の意図と乖離する
- 全リセットは「別大会を始める」想定なので、`tournament_id` も消える方が自然（既存 `resetAll` 挙動と一致）

**「参加者番号 / クラス別番号を維持するか」**（タスク §8 確認項目）: **維持する**。`entry_no` は欠番維持の永続フィールドであり、部分リセットでは触らない。物理 index 順も `state.players[cls]` 配列を **そのまま保持** するため変動しない。

### 6.2 B. 大会進行データ（部分リセットで **消す**、全リセットでも **消す**）

| 項目 | 実体 | 部分リセット後の値 |
|---|---|---|
| 組み合わせ | `state.pairings.A` / `state.pairings.B` | `[]` |
| 結果 | `state.results.A` / `state.results.B` | `[]` |
| 開始フラグ | `state.started` | `false` |

**§6.3 / §6.4 / §6.5 で個別検討する境界項目**:
- ラウンド最大値設定 `state.rounds`（複数形、**実在**）→ §6.3 で「**残す**」推奨へ修正（PR #113 review 指摘）
- 大会報告書入力 `state.report` → §6.4 で「**残す**」推奨へ修正（同上）
- `_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited`（参加者編集バッファ）→ §6.5 で「**残す**」推奨へ修正（同上）

**注意**:
- タスク §8 の「`state.history` / `state.pastMatches`」は **実体不在**。`pastMatches` は `removePlayer` 内のローカル変数であり、`state.results` を空にすれば自動的に 0 集計になる
- タスク §8 の「`state.round`（単数）」も **実体不在**。一方、似た名前の **`state.rounds`（複数）は実在** = 大会の設定値であり、部分リセットでは **残す**（§6.3）
- pairing quality / warning / manual change 状態は **derived（再計算）**。`buildCurrentPairingsHtml` 呼出時に `evaluatePairingQuality()` がその場で評価するため、永続化された state は無い → 部分リセットでも明示削除不要

### 6.3 `state.rounds`（ラウンド最大値設定）の扱い

**PR #113 review 指摘により推奨を反転**: `state.rounds` は **存在する** 大会設定値であり、部分リセットでは **残す** ことを推奨。

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| R1 | 部分リセットで **4 に戻す**（resetAll と同じ） | 全リセットとの差分最小 | **直前の大会設定が消える**（例: 3 ラウンド設定 → 4 に戻る、運営者にとって意外） |
| **R2（推奨）** | 部分リセットで **維持** | 直前設定（例: 3 ラウンド大会）を温存、運営者が再入力不要 | 全リセットとの差分が 1 項目増える |

**第一推奨: R2（維持）**。理由（PR #113 review）:
- `state.rounds` は **大会の設定値 / 最大局数相当** であり、参加者・大会識別子と同じく「大会単位」の情報
- 部分リセットは「同じ大会の進行をやり直す」操作のため、ラウンド数も同じ大会のものとして維持する方が自然
- 「組み合わせを作り直す」だけなのに、設定したラウンド数が初期値（4）に戻るのは運営者にとって意外
- 全リセットとの差分は許容（全リセットは「別大会を始める」想定なので 4 へ初期化が自然）

### 6.4 `state.report`（大会報告書入力）の扱い

**PR #113 review 指摘により推奨を反転**: `state.report` は **同じ大会** の報告書入力情報であり、部分リセットでは **残す** ことを推奨。

| 案 | 内容 | 評価 |
|---|---|---|
| R1 | 部分リセットで **初期値に戻す**（resetAll と同じ） | 全リセットとの差分最小、ただし運営者の入力（日付・場所・会長名等）が消える |
| **R2（推奨）** | 部分リセットで **維持** | 報告書入力（日付・場所・会長名・申し送り等）を残せる、参加者継続と整合 |
| R3 | 部分リセットで **`date` のみ維持** | 細かい場合分け、IMPL-LIGHT には重い |

**第一推奨: R2（維持）**。理由（PR #113 review）:
- `state.report` は大会報告書（PDF 出力）入力欄 = **大会単位** の情報
- 部分リセットは「同じ大会」前提のため、報告書入力も維持する方が一貫
- DOM 側（rep-date / rep-place / 等）も clear しない（helper の処理量が減る、`resetAll` 流用の必要なし）

### 6.5 `_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited` の扱い

**PR #113 review 指摘により推奨を反転**: 参加者を残すため、参加者編集バッファも **残す** ことを推奨。

| 案 | 内容 | 評価 |
|---|---|---|
| R1 | 部分リセットで **`_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited` 全て初期化**（resetAll と同じ） | 安全側だが、参加者継続中に「新規メンバー候補 yomi バッファ」がリセットされるのは運営者にとって意外 |
| **R2（推奨）** | **`_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited` を維持** | 参加者編集バッファ = 参加者と紐づく情報のため、参加者を残すなら整合する |

**第一推奨: R2（維持）**。理由（PR #113 review）:
- `_pendingNewYomi` は参加者追加時の **新規メンバー候補** バッファ（参加者の id にぶら下がる）
- 参加者を残す部分リセットでは、これらバッファも同じ大会の状態として維持する方が一貫
- IMPL-LIGHT で helper が触らないことで実装も簡潔（1 行減る）

### 6.6 C. マスタデータ（部分リセットでも全リセットでも **残す**）

| 項目 | localStorage キー | 部分リセット後 | 全リセット後 |
|---|---|---|---|
| 支部マスタ（会員マスタ含む） | `shogi_branch_master`（`BRANCH_MASTER_KEY`、[L576](../../shogi_v4.html)）| **保持** | **保持**（resetAll [L5908](../../shogi_v4.html) コメント「絶対に消さない」） |
| メンバー entries | 支部マスタ内 `members[]` | **保持** | **保持** |
| 大会記録 entries | 支部マスタ内 `tournaments[]`（あれば）| **保持** | **保持** |

**マスタデータを消す動線は導入しない**。誤って消す事故を避けるため、UI からマスタを消すボタンは追加しない（§11 リスク）。

### 6.7 サマリ表（PR #113 review 反映版）

| カテゴリ | 例 | 部分リセット | 全リセット |
|---|---|---|---|
| **A. 参加者データ / 大会単位データ** | `state.players` / `entry_no` / `member_id` / `member` / `grade` / **`state.tournament_id`** / **`state.rounds`** / **`state.report`** / **`_pendingNewYomi`** / `_yomiAutoBuffer` / `_yomiManuallyEdited` | **残す** | 消す |
| **B. 大会進行データ（局単位）** | `state.pairings` / `state.results` / `state.started` | **消す** | 消す |
| **C. マスタデータ** | `shogi_branch_master` | **残す** | **残す** |

**A カテゴリの解釈**: 「大会単位の情報」は部分リセットで残す。`state.rounds`（最大局数）/ `state.report`（報告書入力）/ `state.tournament_id`（支部マスタ連携）/ `_pendingNewYomi`（参加者編集バッファ）はすべて **同一大会内で継続使用される情報** であり、参加者を残すなら同時に維持する方が運営者の意図と整合する。

**B カテゴリ**: 「局単位の情報」のみ部分リセットで消す。`state.pairings`（現在の組み合わせ）/ `state.results`（勝敗結果）/ `state.started`（開始フラグ）の 3 つに絞られる。

---

## 7. UI / 文言案

### 7.1 ボタン文言案

**前提**: 案 C（推奨）採用 = ボタン 2 個（既存「大会データをリセット」と新規ボタン）。

| 案 | 既存ボタン（全リセット）| 新規ボタン（部分リセット）| 文字数 | スマホ適合 | 直感性 | 「参加者が残る / 消える」が分かるか |
|---|---|---|---|---|---|---|
| **C-1** | 大会データを全リセット | **大会進行データをリセット** | 11 / 12 | ◯ | ◯ | △（「進行データ」概念の理解必要）|
| C-2 | 参加者も含めて全リセット | **組み合わせ・勝敗をリセット** | 12 / 12 | ◯ | ◎ | ◎（具体的）|
| C-3 | 参加者も含めてリセット | **進行データをリセット** | 11 / 9 | ◎ | ◯ | △ |
| C-4（既存維持型）| 大会データをリセット | **進行データだけリセット** | 11 / 11 | ◯ | △（既存名は曖昧のまま）| △ |

**第一推奨: C-2**「組み合わせ・勝敗をリセット」/「参加者も含めて全リセット」
- 何が消えるかが具体的（運営者が判断しやすい）
- 「進行データ」のような内部語彙を出さない
- 既存「大会データをリセット」を **改名**（既存 confirm 文言 + alert 文言と整合更新が要）

**第二推奨: C-1**「大会進行データをリセット」/「大会データを全リセット」
- 既存「大会データをリセット」表現を温存（「全」を足すだけ）
- 「進行データ」「全リセット」概念の理解が要

**判定方針**: IMPL-LIGHT で C-2 を採用する場合は **VRT / E2E への波及が大きい**（`#resetBtn` 文言変更 → header VRT + E2E locator）。**まず C-1 で着地し、運用観察後に C-2 化を IMPL-MEDIUM で起票** する段階方式が安全。

**PR #113 review 反映の運用**:
- IMPL-LIGHT は **既存 `#resetBtn` の文言を変更しない**（§10.2、既存に触れない方針）
- IMPL-LIGHT で新規ボタンに採用する文言は **C-1 / C-2 / C-3 の新規ボタン側のみ**（既存ボタン側ラベルは「大会データをリセット」のまま）
- 「全リセット」概念は新規ボタンの押下時 confirm 文言と PR #112 alert 文言で表現
- 既存 `#resetBtn` 側のラベル更新（「大会データを全リセット」など）は IMPL-MEDIUM 以降に送る

#### destructive スタイル

両ボタンとも `.btn-danger` 系（赤系）を維持（既存 `#resetBtn` と同じ）。**部分リセットも destructive（不可逆）であることを視覚的に表現**。混同抑止のためボタン色や形を変える案もあるが、IMPL-LIGHT スコープ外。

### 7.2 confirm 文言案

**部分リセット**:

| 案 | 文言 | 評価 |
|---|---|---|
| P-1（短）| `参加者を残して、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？` | 簡潔、ただし「rounds / report も初期化される」事実は伝わらない |
| P-2（中）| `参加者一覧は残します。\n現在の組み合わせ・勝敗結果・大会設定（ラウンド数 / 報告書）を削除します。\n（支部マスタは保持されます。）\nよろしいですか？` | 正確、運営者向けに最も親切 |
| P-3（PR #112 alert 寄り）| `参加者は残ります。\n組み合わせ・勝敗結果を削除します。\n支部マスタは保持されます。\nよろしいですか？` | PR #112 alert の語彙と揃う |

**第一推奨: P-3**「参加者は残ります。\n組み合わせ・勝敗結果を削除します。\n支部マスタは保持されます。\nよろしいですか？」
- PR #112 alert（誘導元）と語彙整合
- `state.rounds` / `state.report` の初期化は **明記しない**（運営者の主関心ではない、リセット後に再入力 UI に戻るため自然に気づける）
- 「支部マスタは保持されます」は既存 `resetAll` confirm 文言と語彙整合

**全リセット**（既存）:

| 案 | 文言 | 評価 |
|---|---|---|
| 現状 | `現在の大会データをリセットします（支部マスタは保持されます）` | 「参加者も消える」明記なし |
| **F-1**（推奨）| `参加者・組み合わせ・勝敗結果をすべて削除します。\n支部マスタは保持されます。\nよろしいですか？` | 何が消えるか具体的、部分リセットとの差分が明示される |
| F-2（PR #112 alert との整合）| `参加者・組み合わせ・勝敗結果をすべて削除します。\n支部マスタは保持されます。\n参加者を残したい場合は「組み合わせ・勝敗をリセット」を使ってください。\nよろしいですか？` | 誤操作直前のガイダンス、長い |

**第一推奨: F-1**。F-2 はクロスリファレンスが過剰（IMPL-LIGHT には冗長、IMPL-MEDIUM で観察後追加可）。

**注意（PR #113 review 反映）**: 既存 `resetAll` の confirm 文言更新は **IMPL-LIGHT スコープ外**（既存に触れない方針、§10.2）。F-1 の採用は IMPL-MEDIUM 以降に送る。IMPL-LIGHT 時点では既存 confirm 文言「現在の大会データをリセットします（支部マスタは保持されます）」をそのまま温存する。

### 7.3 ボタン配置

現行: header 上部、保存 / 読込 / **大会データをリセット** が並ぶ（[`shogi_v4.html` L100](../../shogi_v4.html) 周辺）。

| 案 | 配置 | 評価 |
|---|---|---|
| L-1 | header に「組み合わせ・勝敗をリセット」も並べる | ◎ アクセス性、◎ 一貫性、△ 混同リスク |
| L-2 | 大会タブ内（pairings 近く）に「組み合わせ・勝敗をリセット」を配置 | ◯ 文脈整合（進行データ操作なので大会タブが自然）、△ アクセスポイントが分散 |
| L-3 | リセット用フッター section を新設 | △ DOM 追加が多い、IMPL-LIGHT 重い |

**第一推奨: L-1**。理由:
- 既存 `#resetBtn` の隣に並べる方が運営者にとって「リセット系」として一貫
- L-2 / L-3 は DOM 構造を増やし VRT 影響が拡大、IMPL-LIGHT に重い
- 混同リスクは confirm 文言と destructive スタイルで抑制

### 7.4 alert / confirm で足りるか（モーダル必要性）

- 案 C（推奨）であれば **confirm 1 回で完結**（既存 `resetAll` と同形式）
- 案 E（モーダル選択）であれば専用モーダル必要、IMPL-LIGHT 範囲外

**判定**: IMPL-LIGHT は **confirm のみ**で着地。専用モーダルは観察後 IMPL-MEDIUM で再検討。

---

## 8. 部分リセットのデータ処理仕様（PR #113 review 反映版）

§6 の分類に従って、IMPL-LIGHT 時の挙動を仕様化する。

### 8.1 残すもの（A. 参加者データ / 大会単位データ）

| 項目 | IMPL-LIGHT の処理 |
|---|---|
| `state.players` 配列（A/B 両クラス）| **そのまま保持**（配列参照を保持、要素を一切変更しない） |
| `entry_no` / `member` / `grade` / `member_id` | 当然保持（players 要素のフィールド） |
| **`state.tournament_id`** | **保持**（支部マスタ連携、§6.1 review 反映） |
| **`state.rounds`** | **保持**（大会設定値 / 最大局数、§6.3 R2 review 反映）|
| **`state.report`** | **保持**（大会報告書入力、§6.4 R2 review 反映）|
| **`_pendingNewYomi`** / `_yomiAutoBuffer` / `_yomiManuallyEdited` | **保持**（参加者編集バッファ、§6.5 R2 review 反映）|

### 8.2 消すもの（B. 大会進行データ / 局単位データ）

| 項目 | IMPL-LIGHT の処理 |
|---|---|
| `state.pairings.A` / `state.pairings.B` | `[]` に再代入 |
| `state.results.A` / `state.results.B` | `[]` に再代入 |
| `state.started` | `false` に再代入 |
| 大会タブ DOM 表示 | `pane-A` / `pane-B` / `result-A` / `result-B` の `innerHTML=''` |
| 開きっぱなしモーダル | `bulk-edit-modal` / `edit-past-modal` / `chg-modal` / `load-modal` を `remove`（resetAll と同じ） |

**注意**: `state.report` を維持するため、**大会報告書 DOM (`rep-date` / `rep-place` / 等) の clear は行わない**（§6.4 R2 review 反映）。

### 8.3 残すもの（C. マスタデータ）

| 項目 | IMPL-LIGHT の処理 |
|---|---|
| `shogi_branch_master`（localStorage）| **触らない**（明示的に保持） |

### 8.4 保存 / 描画 / 遷移

| 項目 | IMPL-LIGHT の処理 |
|---|---|
| `save()` | 呼ぶ（参加者保持後の state を localStorage に反映） |
| `renderRegList()` | 呼ぶ（参加者一覧を再描画。タスク §11 の `renderPlayers()` は本アプリで `renderRegList()` 相当） |
| `renderTournament(cls)` | 呼ばない（pane-A/B は innerHTML='' で clear するため） |
| `showTab('reg')` | 呼ぶ（参加者登録タブへ遷移、resetAll と同じ。タスク §11 の `showTab('reception')` は本アプリで `showTab('reg')` 相当） |
| `showMsg(...)` | `'進行データをリセットしました'` などを `'ok'` で表示 |

### 8.5 確認項目（タスク §8）への回答

| # | 確認項目 | 回答 |
|---|---|---|
| 1 | `state.pastMatches` を消すべきか | **state にフィールドなし**。`pastMatches` は `removePlayer` 内ローカル変数。`state.results` を空にすれば自動的に 0 集計 |
| 2 | `state.history` を消すべきか | **state にフィールドなし**。「対戦履歴」の真理源は `state.results` |
| 3 | `state.round` を 1 / 0 / 維持 | **state.round（単数）は存在しない**（現在ラウンドは `state.results[cls].length` から導出）。**`state.rounds`（複数）は実在** = 大会設定値、§6.3 R2（PR #113 review 反映）で **維持** |
| 4 | `state.started` を false にするのは確定でよいか | **確定**（PR #112 ガードと整合、`removePlayer` 二次禁止も自然解除） |
| 5 | `state.players` 内の no / class number を維持するか | **維持**（entry_no 欠番維持、配列順も触らない） |
| 6 | 受付番号 / クラス別番号を維持するか | **維持**（同上） |
| 7 | 部分リセット後、`startTournament()` を再度押せるか | **押せる**（`state.started=false` のため PR #112 guard をすり抜け、通常開始経路に流れる） |
| 8 | 部分リセット後、参加者削除・追加・修正ができるか | **可能**（`state.pairings`/`state.results` が空、`state.started=false` のため `removePlayer` 一次・二次禁止が自然解除） |
| 9 | PR #112 startTournament guard と整合するか | **整合**（§9 参照） |

---

## 9. startTournament guard / removePlayer との整合

### 9.1 PR #112 guard との整合

PR #112 の guard:
```js
if(state.started===true){
  alert('大会はすでに開始されています。\n参加者を変更する場合は、先に「大会データをリセット」を実行してください。\n大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。');
  return;
}
```

部分リセット導入後の整合:
- **部分リセット直後**: `state.started=false`、`state.pairings=空`、`state.results=空` → 再度「登録完了・対局開始」を押すと **通常開始経路** に流れる（guard をすり抜ける）
- **alert 誘導先文言**: 現行 alert は「大会データをリセット」（= 全リセット）を案内。部分リセット導入後、`alert` 文言を **更新する必要があるか** が論点

#### 9.1.1 alert 文言の更新案

**PR #113 review 指摘**: PR #112 の現行 alert は「大会データをリセット」（= 現行 `resetAll`、参加者も消える）を案内している。部分リセット導入後は、誘導先を **部分リセットに寄せ**、参加者一覧が残ることを明示できる。**IMPL-LIGHT の必須スコープ** として alert 文言更新を含める。

##### 9.1.1.1 部分リセット中心型（推奨：参加者一覧は残る点を強調できる）

部分リセットがあれば「参加者一覧は残ります」と書ける（PR #111 §7.3 で書けなかった内容）:

| 案 | alert 文言 | 評価 |
|---|---|---|
| **H-1（推奨）**| `大会はすでに開始されています。\n参加者を変更する場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。` | C-1 ボタン名（§7.1）と整合、参加者一覧維持を明示 |
| H-2 | `大会はすでに開始されています。\n参加者を変更する場合は、先に「組み合わせ・勝敗をリセット」を実行してください。\n参加者一覧は残ります。` | C-2 ボタン名（§7.1）と整合、最短 |

##### 9.1.1.2 2 ボタン明示型（参考：従来の検討案）

| 案 | alert 文言 | 評価 |
|---|---|---|
| G-1 | `大会はすでに開始されています。\n参加者を変更する場合は「組み合わせ・勝敗をリセット」または「大会データを全リセット」を実行してください。\nどちらも、現在の組み合わせ・勝敗結果は削除されます。\n参加者を残したい場合は「組み合わせ・勝敗をリセット」を使ってください。` | 正確、長い |
| G-2 | `大会はすでに開始されています。\n組み合わせを作り直すには「組み合わせ・勝敗をリセット」を実行してください。\n参加者ごと最初からやり直すには「大会データを全リセット」を実行してください。` | UC1 / UC3 を明示分離 |
| G-3（最小変更）| 現行 alert を維持し、本タスクで触らない | IMPL-LIGHT 簡潔、ただし誘導先と新ボタンの対応が不明瞭、PR #113 review 指摘で **非推奨** |

##### 9.1.1.3 判定

**IMPL-LIGHT 推奨 = H-1**（PR #113 review 反映）。理由:
- 部分リセットを主要誘導先に据え、参加者一覧維持を明示できる（PR #111 §7.3 で書けなかった「参加者一覧は残ります」が部分リセット導入により真実になる）
- §7.1 推奨 C-1「大会進行データをリセット」/「大会データを全リセット」と語彙整合
- 全リセットに触れず簡潔（運営者は通常 UC1 が主目的、UC3 はボタンを見れば分かる）

§7.1 で C-2 を採用する場合は **H-2** に切替。

**注意**: alert 文言の確定はボタン名（§7.1 C-1 / C-2）の確定とセットで扱う。IMPL-LIGHT 着手前に運営者最終確認。

### 9.2 removePlayer 整合

部分リセット後:
- `state.pairings[cls]` が空 → **一次禁止解除**
- `state.started===false` → **二次禁止解除**（`state.started && pastMatches>0` の前段で false）
- `state.results[cls]` が空 → `pastMatches` 集計が 0、二次禁止条件式に到達しても false

→ **参加者を残したまま、欠席者削除 / 追加登録 / 修正がすべて可能** になる（IMPL-LIGHT の主要効用）。

その後、`startTournament` を再度押せば通常開始経路に流れる。

### 9.3 状態遷移図

```
[初期]
  state.started=false
  pairings=[] / results=[]
  players=[] / [...]
    │
    │  startTournament（人数 OK）
    ▼
[開始済 R1]
  state.started=true
  pairings=[R1ペア]
  results=[]
    │
    ├─ #startBtn 再クリック  →  PR #112 guard alert（state 不変）
    │
    ├─ 「組み合わせ・勝敗をリセット」（部分リセット、新規）  →  [初期] へ（players 維持）
    │
    └─ 「大会データを全リセット」（既存 resetAll）  →  [完全初期] へ（players 含め空）

[開始済 R2 以降]
  state.started=true
  pairings=[Rn ペア]
  results=[R1, R2, ...]
    │
    ├─ #startBtn 再クリック  →  PR #112 guard alert
    │
    ├─ 「組み合わせ・勝敗をリセット」  →  [初期] へ（players 維持、results 全消去）
    │
    └─ 「大会データを全リセット」  →  [完全初期]
```

### 9.4 部分リセット後の `tournament_id` 扱い

**PR #113 review 指摘により方針確定**: `tournament_id` は支部マスタ連携用識別子（F2）で、`normalizeState` で load 時のみ保持される。**部分リセットでは必ず維持** する。

| 案 | 内容 | 評価 |
|---|---|---|
| **T-1（確定）**| 部分リセットで **保持** | 「同一大会の進行データをやり直す」操作のため tournament_id を維持する方が一貫。消すと支部マスタ連携処理（attendance_count / tournament_ids union）で別大会扱いされる懸念 |
| T-2 | 部分リセットで **削除** | 「進行データを完全に新規」と捉える場合は削除、**ただし参加者保持と矛盾** → 採用しない |

**確定: T-1（維持）**。IMPL-LIGHT 時は `state.tournament_id` に触らない実装で十分。§8.1 で「残すもの」として明記済。

---

## 10. IMPL-LIGHT 候補（後続、PR #113 review 反映版）

### 10.1 含める（やる）

- 新規 helper [`resetTournamentProgressOnly()`](../../shogi_v4.html)（仮）を `resetAll` 近傍に追加
  - **以下を維持（触らない）**:
    - `state.players` 配列・要素すべて
    - `state.tournament_id`
    - `state.rounds`（§6.3 R2 review 反映）
    - `state.report`（§6.4 R2 review 反映）
    - `_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited`（§6.5 R2 review 反映）
    - `shogi_branch_master`（localStorage）
  - **以下を初期化（消す）**:
    - `state.pairings = {A:[],B:[]}`
    - `state.results = {A:[],B:[]}`
    - `state.started = false`
  - 開きっぱなしモーダル close（既存 `resetAll` と同じ：`bulk-edit-modal` / `edit-past-modal` / `chg-modal` / `load-modal`）
  - 大会タブ DOM clear（`pane-A` / `pane-B` / `result-A` / `result-B` の `innerHTML=''`）
  - **大会報告書 DOM (`rep-*`) は clear しない**（`state.report` を維持するため、§6.4 review 反映）
  - `save()` 呼出（localStorage に新 state を反映）
  - `renderRegList()` 呼出（参加者一覧再描画。タスク §11 の `renderPlayers()` 相当）
  - `showTab('reg')` 呼出（参加者登録タブへ遷移。タスク §11 の `showTab('reception')` 相当）
  - `showMsg('進行データをリセットしました','ok')`
- 新規ボタン `#resetProgressBtn`（仮）を header に追加
  - 表示文言: §7.1 推奨 C-1「大会進行データをリセット」または C-2「組み合わせ・勝敗をリセット」（**実装時に運営者最終確認**）
  - `.btn-danger` 系スタイル
  - bind: `bindHeaderEvents` 内に `addEventListener('click', resetTournamentProgressOnly)`
  - 押下時 confirm 文言 §7.2 P-3 推奨を表示
- **PR #112 startTournament guard alert 文言を新ボタン名に同期**（PR #113 review 必須スコープ、§9.1.1 H-1 推奨）
  - 例: 「大会はすでに開始されています。\n参加者を変更する場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。」
  - alert 文言の確定はボタン名（C-1 / C-2）の確定とセット
- 軽量テスト追加（`test/test_reset_ux_partial_reset.js`）
  - 静的検査: helper 存在 / ボタン bind / 「触らない」項目（`state.players` / `state.tournament_id` / `state.rounds` / `state.report` / `_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited`）への代入が helper 内に **存在しない** こと / `BRANCH_MASTER_KEY` 参照なし / PR #112 guard 整合 / alert 文言更新
  - 振る舞いテスト（軽量 mock）: 部分リセット後の state 形状 / `removePlayer` 整合 / `startTournament` 再実行可能性 / `resetAll` 既存挙動維持
- `test/run_tests.sh` に stanza 追加
- HANDOFF.md 更新（実装着地サマリ）

### 10.2 含めない（やらない、IMPL-MEDIUM 以降の余地）

- **既存 `resetAll()` 関数の仕様変更（案 D）**（PR #113 review 反映、IMPL-LIGHT では既存全リセット挙動を温存）
- **既存全リセット動線の削除**（PR #113 review、温存方針）
- **既存 `resetAll()` 改名 / 既存 `#resetBtn` 文言変更 / 既存 `resetAll` confirm 文言変更**（PR #113 review 反映、既存に触れない方針 — §7.1 C-1 / C-2 のうち **既存側ラベル更新は IMPL-MEDIUM へ送る**。IMPL-LIGHT は新規ボタンの追加と PR #112 alert 同期更新のみ）
- 案 E モーダル選択（再開始ウィザード相当）
- 大会開始ボタン disabled 化
- 大会履歴保存（過去大会を別領域に退避）
- undo / redo
- 部分リセットで `state.rounds` を再度初期化する（§6.3 R1 を採用しない）
- 部分リセットで `state.report` の `date` のみ維持する（§6.4 R3）
- 参加者番号の再採番
- 支部マスタ / 会員マスタの変更
- pairing algorithm / Fisher-Yates / `evaluatePairingQuality` 変更
- 既存 helper（`getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` / `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` / `classifyChangePairingCandidate`）変更
- localStorage schema 変更（`STORAGE_KEY` / `LEGACY_STORAGE_KEYS` / `BRANCH_MASTER_KEY` のキー名・スキーマは不変）
- DISPLAY-LABELS-IMPL-LIGHT / WARNING Phase 2〜4
- VRT snapshot 自律更新 / threshold 緩和

### 10.3 想定変更ファイル（IMPL-LIGHT、PR #113 review 反映版）

- `shogi_v4.html`（+30〜60 行、helper / 新規ボタン DOM / bind / PR #112 alert 文言更新のみ、**既存 `#resetBtn` 文言・`resetAll` confirm は変更しない**）
- `test/test_reset_ux_partial_reset.js`（新規、+120〜200 行）
- `test/run_tests.sh`（+10 行 stanza）
- `HANDOFF.md`（+1 行 entry）
- `docs/notes/20260515_shogi_reset_ux_partial_reset_design.md`（本ドキュメント、§17 実装着地ノート追記）

### 10.4 想定変更しないファイル（IMPL-LIGHT）

- `index.html` / `data/`
- `.github/workflows/`
- `package.json` / `package-lock.json`
- `playwright.config.js`
- `docs/specs/`
- VRT snapshot（新ボタン追加で red になる可能性あり、その場合は自律更新せずユーザー判断を仰ぐ）
- `test/e2e/`（既存 E2E は未開始 state からのシナリオ中心で影響なし見込み、PR #112 alert を locator として持つ E2E があれば追従更新）

---

## 11. テスト方針（PR #113 review 反映版）

### 11.1 静的検査（最小）

- helper `resetTournamentProgressOnly` が存在
- **以下への代入が helper 内に存在しない**（「触らない」項目の保証）:
  - `state.players`
  - `state.tournament_id`
  - `state.rounds`（§6.3 R2 review 反映）
  - `state.report`（§6.4 R2 review 反映）
  - `_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited`（§6.5 R2 review 反映）
- helper 内に `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` / `state.started=false` の再代入が存在
- helper 内に `localStorage.removeItem(BRANCH_MASTER_KEY)` が **存在しない**
- helper 内に `rep-*` 系 DOM の `value=''` 代入が **存在しない**（`state.report` 維持と整合）
- 新規ボタン `#resetProgressBtn`（仮）が DOM に存在 / `bindHeaderEvents` 内で `click` bind されている
- 既存 `resetAll()` は §6.6 のとおり `state.players={A:[],B:[]}` を引き続き行う（破壊変更なし）
- 既存 `#resetBtn` の文言は変更されていない（IMPL-LIGHT で既存ボタンに触れない方針、§10.2）
- 既存 `resetAll()` confirm 文言は変更されていない（同上）
- **PR #112 `startTournament` guard 内の alert 文言が §9.1.1 H-1（または H-2）に更新済**（PR #113 review 必須）
  - alert 文言に新ボタン名（C-1 採用なら「大会進行データをリセット」、C-2 なら「組み合わせ・勝敗をリセット」）が含まれる
  - alert 文言に「参加者一覧は残ります」相当が含まれる（参加者保持が真実になったため）
- confirm 文言が §7.2 P-3 推奨と一致
- 既存 `STORAGE_KEY` / `LEGACY_STORAGE_KEYS` / `BRANCH_MASTER_KEY` / `normalizeState` 不変

### 11.2 振る舞いテスト（軽量 mock）

```
1. players=[A:2人,B:2人], started=true, pairings.A=[ペア1], results.A=[[R1勝敗]],
   rounds=3, report.date='2026-05-15', tournament_id='t_abc', _pendingNewYomi={...}
   → resetTournamentProgressOnly()
   → players.A.length===2 / .B.length===2（保持）
   → pairings={A:[],B:[]} / results={A:[],B:[]} / started===false
   → rounds===3（維持、PR #113 review §6.3 R2）
   → report.date==='2026-05-15'（維持、§6.4 R2）
   → tournament_id==='t_abc'（維持、§6.1 review）
   → _pendingNewYomi の中身が維持（§6.5 R2）

2. 上記 1 直後、startTournament() を呼ぶ
   → PR #112 guard をすり抜け、通常開始経路通過
   → started===true / pairings.A.length>0
   → rounds===3 が引き続き有効（再開始でも維持）

3. 上記 1 直後、removePlayer(any_player_id, 'A')
   → 一次禁止 alert なし / 二次禁止 alert なし
   → state.players.A.length===1（削除成功）

4. players=[A:2人], started=false, pairings=空, results=空 で resetTournamentProgressOnly()
   → 既に空でも実行可能、副作用なし（players 維持、他は初期化済のまま）

5. resetAll() を呼ぶ
   → players={A:[],B:[]} / rounds===4 / report===初期値 / tournament_id 削除 / _pendingNewYomi={}
   → 既存挙動と一致（破壊変更なし）

6. resetTournamentProgressOnly 後の save() で localStorage[STORAGE_KEY] が新 state を反映
   → JSON.parse(localStorage[STORAGE_KEY]).players.A.length===2
   → JSON.parse(localStorage[STORAGE_KEY]).rounds===3（維持確認）
   → JSON.parse(localStorage[STORAGE_KEY]).tournament_id==='t_abc'（維持確認）

7. resetTournamentProgressOnly 前後で localStorage[BRANCH_MASTER_KEY] が不変
```

### 11.3 既存テスト退行確認

- `test/test_reception_ux_start_button_guard.js`（**PR #112 alert 文言更新で期待値更新が要**、PR #113 review 必須スコープに含まれる）
- `test/test_pairing_ux_*` 各種（`resetAll` を呼ばない、影響なし見込み）
- `test/test_save_ux_parse_load_003.js`（state restore 系、影響なし）
- `test/test_branch_master.js`（`BRANCH_MASTER_KEY` 不変、影響なし）

### 11.4 E2E

- 既存 E2E への影響は **PR #112 alert 文言を locator に持つテストの追従** のみ見込み（`大会データをリセット` 文字列を expect していれば新ボタン名へ更新）
- 必要なら追加 1 ケース: 「開始後に部分リセット → 参加者リスト維持 → `state.rounds` / `state.report` 維持 → `removePlayer` 可能 → `startTournament` 再実行」
- VRT は **本タスクで自律更新しない**（新ボタン追加で red の可能性、判断を仰ぐ）

### 11.5 VRT

- 新ボタン追加 → header VRT snapshot が **mismatch する可能性**
- ただし IMPL-LIGHT は **既存 `#resetBtn` 文言を変更しない** ため、影響は新ボタン分のみ（PR #113 review 反映、§10.2）
- IMPL-LIGHT 着地時に red の場合は **自律 snapshot 更新せず、判断を仰ぐ**（PR #105 / #109 の流れ）
- 新ボタンの色・サイズは `.btn-danger` を継承、新規 CSS 不要

---

## 12. リスク

### 12.1 ボタン増加 / 混乱リスク

| リスク | 対策 |
|---|---|
| 「全リセット」と「進行データリセット」の違いが伝わらない | ボタン文言 §7.1 で具体的に / confirm 文言 §7.2 で明示 / destructive スタイル維持 |
| 運営者が両方押せると混乱 | confirm 1 段、PR #112 alert で誘導先を明示（§9.1.1 G-2）|
| スマホで header にボタンが並びすぎる | §7.1 文字数 12 字以内に抑制、`.no-print` 属性は既存と同じ |

### 12.2 整合崩れリスク

| リスク | 対策 |
|---|---|
| `state.players` 内の番号 / 受付情報との整合が崩れる | 配列・要素を **一切触らない** 実装方針（§8.1）/ 静的検査で `state.players=` の再代入がないことを保証 |
| `pastMatches`（re戦回避履歴）が消える | 部分リセットは **明示的に再戦回避履歴をクリア** する設計（§6.2、`state.results=空`）。これは UC1 の動機そのもの（やり直す） |
| `state.started=false` 後、PR #112 guard と矛盾する | `state.started=false` 時に PR #112 guard が **false branch を通る** 既存仕様と整合（§9.1） |
| localStorage 既存データとの互換性 | schema 不変、`save()` で `state` 全体を再シリアライズするだけ（§3.2 #13） |
| 誤ってマスタデータを消す | helper 内に `BRANCH_MASTER_KEY` への参照を入れない（静的検査で確認、§11.1） |

### 12.3 UI / VRT リスク

| リスク | 対策 |
|---|---|
| `#resetBtn` 文言変更で VRT red | 自律更新せず判断を仰ぐ（IMPL-LIGHT 着地時の運営者確認） |
| 新ボタン追加で header VRT red | 同上 |
| E2E が `大会データをリセット` を locator として持つ場合 red | E2E 文言追従更新（IMPL-LIGHT 範囲内、`grep -r '大会データをリセット' test/e2e/` で事前確認） |

### 12.4 PR #112 整合リスク

| リスク | 対策 |
|---|---|
| PR #112 alert 文言が古いまま残る | IMPL-LIGHT で §9.1.1 G-2 へ同時更新 |
| `removePlayer` 文言「リセット」（二次禁止）が曖昧 | 二次禁止 alert は「**全リセット**」を案内する文言に更新するか / または「組み合わせ・勝敗をリセット」を案内するかを **IMPL-LIGHT 範囲内で判断**（既存文言を温存する選択も可、観察後 IMPL-MEDIUM で詰める） |

### 12.5 後続観察リスク

| リスク | 対策 |
|---|---|
| 案 C で運用しても運営者が「2 つの違いが分からない」 | 観察後 IMPL-MEDIUM で **案 E モーダル選択** に格上げ |
| 「進行データ」概念が伝わらない | 観察後文言を C-2「組み合わせ・勝敗をリセット」に切替 |
| 部分リセットを誤って押す事故 | confirm 1 段で抑止、現場の押下頻度を観察して必要なら destructive スタイル強化 |

---

## 13. 推奨案・推奨 Next Action

### 13.1 推奨案: **案 C（進行データリセット追加）**

- `state.players` を残して進行データだけ消す **新規 helper** を追加
- **`state.rounds` / `state.report` / `state.tournament_id` / `_pendingNewYomi` も維持**（PR #113 review 反映、§6.7 サマリ表）
- 既存 `resetAll()` は **全リセット** として温存（仕様変更なし、IMPL-LIGHT では既存ボタン文言・confirm 文言も触らない）
- ボタン 2 個構成、新規ボタン文言は §7.1 C-1 / C-2 を運営者最終確認で選択（既存ボタン側ラベル更新は IMPL-MEDIUM へ）

### 13.2 IMPL-LIGHT 進行プラン（PR #113 review 反映）

1. **`RESET-UX-PARTIAL-RESET-IMPL-LIGHT`** を即起票可
   - §10.1 スコープ（helper 追加 + 新規ボタン追加 + PR #112 alert 同期更新 + 軽量テスト）
   - **既存 `#resetBtn` 文言 / 既存 `resetAll` confirm 文言は変更しない**
2. 実機確認（運営者立会いで「参加者を残してやり直す」フローを試す）
3. **運用観察**（数大会）
4. 必要なら IMPL-MEDIUM:
   - 案 E モーダル選択化
   - C-2 文言切替（既存ボタン側ラベルも含む）
   - 既存 `resetAll` confirm 文言更新（§7.2 F-1）
   - `state.rounds` / `state.report` の挙動微調整（§6.3 / §6.4 で R2 採用済、観察結果次第で R1 / R3 へ）

### 13.3 当面やらないこと

- 案 D（`resetAll` 仕様変更）
- 案 E（モーダル選択）の IMPL-LIGHT 化
- `removePlayer` 判定変更
- 大会履歴保存 / undo
- 参加者番号再採番
- 支部マスタ / 会員マスタ削除動線追加
- pairing algorithm 変更
- VRT snapshot 自律更新
- WARNING Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT

---

## 14. 次タスク候補

| 優先 | タスク | スコープ | 着手判断 |
|---|---|---|---|
| 第一 | `RESET-UX-PARTIAL-RESET-IMPL-LIGHT` | 案 C を実装（helper / ボタン / 文言更新 / PR #112 alert 同期更新 / 軽量テスト） | **本 DESIGN 着地直後**、運営者最終確認後 |
| 第二 | 運用観察 | 部分リセット動線が UC1 を救うか / ボタン 2 個で混乱が出ないか | IMPL-LIGHT 着地後 |
| 第三 | `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM`（案 E）| モーダル選択化 | 観察結果次第 |
| 第四 | `RECEPTION-UX-START-BUTTON-GUARD-IMPL-MEDIUM`（PR #111 案 D）| ボタン文言切替 | 観察結果次第 |
| 第五 | `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` | 独立進行可、helper 着地済 | 別系統 |

---

## 15. 推奨 Next Action（PR #113 review 反映版）

**`RESET-UX-PARTIAL-RESET-IMPL-LIGHT`** を即起票可能。

スコープ（PR #113 review 反映後の確定版）:
- `resetTournamentProgressOnly()` helper 追加（+20〜40 行、§10.1）
  - **維持する項目**: `state.players` / `state.tournament_id` / `state.rounds` / `state.report` / `_pendingNewYomi`/`_yomiAutoBuffer`/`_yomiManuallyEdited` / `shogi_branch_master`
  - **初期化する項目**: `state.pairings` / `state.results` / `state.started`
- 新規ボタン `#resetProgressBtn` 追加 + bind（押下時 confirm §7.2 P-3）
- **PR #112 startTournament guard alert 文言を新ボタン名に同期**（§9.1.1 H-1 推奨、必須）
- **既存 `#resetBtn` 文言・既存 `resetAll` confirm 文言は変更しない**（IMPL-MEDIUM へ送る）
- 軽量テスト 1 本（`test/test_reset_ux_partial_reset.js` 新規）+ `test/run_tests.sh` stanza
- HANDOFF.md 1 行 entry

着手判断:
- 運営者最終確認（新規ボタン文言の C-1 / C-2 選択）
- VRT snapshot red 時の判断方針（自律更新せず）

DESIGN は本ドキュメントに集約。IMPL-LIGHT 着地時に §17 として「実装着地ノート」を追記する想定（PR #109 / #112 と同じ構成）。

---

## 17. 実装着地ノート（IMPL-LIGHT）

**Task ID**: `RESET-UX-PARTIAL-RESET-IMPL-LIGHT`
**Branch**: `feat/reset-ux-partial-reset-impl-light`
**設計 PR**: PR #113（squash merge `9b9cf07`）
**実装 PR**: 本タスクの Draft PR

### 17.1 採用した実装位置

`resetAll()`（[`shogi_v4.html` L5934 周辺](../../shogi_v4.html)）の **直前** に新規 helper [`resetTournamentProgressOnly()`](../../shogi_v4.html) を追加。`bindHeaderEvents()` に bind を追加。header DOM の [`#resetBtn`](../../shogi_v4.html)（[L100](../../shogi_v4.html)）の **直後** に [`#resetProgressBtn`](../../shogi_v4.html)（[L101](../../shogi_v4.html)）を配置。

### 17.2 採用した helper 実装

```js
function resetTournamentProgressOnly(){
  if(!confirm('参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？'))return;
  // B. 大会進行データ（局単位）のみ初期化
  state.started=false;
  state.pairings={A:[],B:[]};
  state.results={A:[],B:[]};
  // 開きっぱなしのモーダルを閉じる（resetAll と同設計）
  ['bulk-edit-modal','edit-past-modal','chg-modal','load-modal'].forEach(function(mid){
    var m=document.getElementById(mid);if(m)m.remove();
  });
  // 大会タブの表示 DOM をクリア（参加者・report・rounds 等の reg/master タブ DOM は触らない）
  var paneA=document.getElementById('pane-A');if(paneA)paneA.innerHTML='';
  var paneB=document.getElementById('pane-B');if(paneB)paneB.innerHTML='';
  var resultA=document.getElementById('result-A');if(resultA)resultA.innerHTML='';
  var resultB=document.getElementById('result-B');if(resultB)resultB.innerHTML='';
  save();
  renderRegList();
  showTab('reg');
  showMsg('大会進行データをリセットしました','ok');
}
```

#### 採用理由

- `state.started` / `state.pairings` / `state.results` のみ初期化（§8.2）
- `state.players` / `state.rounds` / `state.tournament_id` / `state.report` / `_pendingNewYomi`/`_yomiAutoBuffer`/`_yomiManuallyEdited` は **代入しない**（§8.1 R2 維持を保証）
- `BRANCH_MASTER_KEY` / `STORAGE_KEY` / `LEGACY_STORAGE_KEYS` への参照なし（localStorage 直接削除なし、`save()` 経由のみ）
- 大会タブの表示 DOM は clear（戻ったときに古い表示が残らない）、reg タブ DOM や `rep-*`（大会報告書入力）は **clear しない**（§8.2 報告書 DOM clear なき注記）
- `showTab('reg')` で参加者登録タブへ遷移、`save()` で localStorage に反映、`renderRegList()` で参加者一覧を再描画

### 17.3 採用した confirm 文言

§7.2 推奨 P-3 寄りの軽量版:

```
参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。
よろしいですか？
```

- 「参加者一覧は残」「組み合わせ」「勝敗結果」を含む（運営者向けの判断材料）
- 「支部マスタ」「localStorage」「state」「局単位」など内部実装語を含まない

### 17.4 採用した UI 追加

[`shogi_v4.html` L100-101](../../shogi_v4.html):

```html
<button type="button" class="btn-danger btn-sm no-print" id="resetBtn">大会データをリセット</button>
<button type="button" class="btn-danger btn-sm no-print" id="resetProgressBtn">大会進行データをリセット</button>
```

- 既存 `#resetBtn` の **直後** に並列配置（§7.3 L-1 採用）
- 文言 §7.1 **C-1 新規ボタン側を採用**（既存ボタン側ラベルは「大会データをリセット」のまま、§10.2 既存に触れない方針）
- `.btn-danger` で destructive スタイル継承

### 17.5 PR #112 startTournament guard alert 同期更新

`startTournament()` 冒頭 guard alert（PR #112 で追加）を §9.1.1 **H-1** に更新:

```
大会はすでに開始されています。
参加者を変更する場合は、先に「大会進行データをリセット」を実行してください。
大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。
```

- 新規ボタン名「大会進行データをリセット」へ誘導
- 「参加者一覧は残したまま」を明示（部分リセット導入により真実になった、PR #111 §7.3 で書けなかった内容が解禁）
- guard 条件 `if(state.started===true)` / 早期 return / 既存 hasOngoing confirm 経路 はすべて維持

### 17.6 既存挙動を維持したもの

- **`resetAll()`** 本体・confirm 文言・state 再代入内容すべて変更なし
- **既存 `#resetBtn`** 文言「大会データをリセット」変更なし
- **`removePlayer()`** 一次禁止 / 二次禁止 alert / 条件 `state.started && pastMatches>0` 変更なし
- **`startTournament()`** guard 条件 `state.started===true` / 早期 return / hasOngoing confirm 経路（fail-safe）変更なし
- **`normalizeState`** の `base.started=!!s.started` 変更なし
- **localStorage schema**: `STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `BRANCH_MASTER_KEY='shogi_branch_master'` 変更なし
- **pairing algorithm**: `generatePairing` / Fisher-Yates / `evaluatePairingQuality` 変更なし
- 既存 helper（`getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` / `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` / `classifyChangePairingCandidate`）変更なし

### 17.7 追加テスト

新規ファイル: [`test/test_reset_ux_partial_reset.js`](../../test/test_reset_ux_partial_reset.js)

`test/run_tests.sh` に呼出 stanza を追加。

#### 17.7.1 静的検査の主要観点

1. `resetTournamentProgressOnly()` helper 存在
2. `#resetProgressBtn` DOM 存在 / 文言 / `.btn-danger`
3. `bindHeaderEvents` 内 bind
4. helper 内 `state.started=false` / `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}`
5. `if(!confirm(...))` キャンセル時 return
6. 「触らない」7 項目（`state.players` / `state.rounds` / `state.tournament_id` / `state.report` / `_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited`）への代入が helper 内に **存在しない**
7. `BRANCH_MASTER_KEY` / `localStorage.removeItem` 呼出なし
8. `save()` / `renderRegList()` / `showTab('reg')` 呼出
9. confirm 文言検査: 「参加者一覧は残」「組み合わせ」「勝敗結果」含む / 内部実装語含まない
10. `resetAll()` の挙動・文言不変 / 既存 `#resetBtn` 文言不変
11. PR #112 guard 条件 / alert 文言（新ボタン名・「参加者一覧は残したまま」含む）
12. `removePlayer` 一次・二次禁止維持
13. localStorage schema / pairing algorithm 維持

#### 17.7.2 振る舞いテスト（軽量 mock）

| ケース | 入力 | 期待 |
|---|---|---|
| case1 | `started=true`/`players`あり/`pairings`あり/`results`あり/`rounds=3`/`tournament_id='t_test_001'`/`report`記入済/`_pendingNewYomi`あり → helper | players/rounds/tournament_id/report/_pendingNewYomi/_yomiAutoBuffer/_yomiManuallyEdited 不変、started=false、pairings/results=空、save 1 回、renderRegList 1 回、showTab('reg') 1 回、showMsg「大会進行データをリセットしました」 |
| case2 | confirm cancel | state 完全不変、save / renderRegList / showTab 呼ばれない |
| case3 | helper 後 | state.started===false → startTournament guard をすり抜ける前提 |
| case4 | helper 後 | state.pairings/results 空・state.started=false → removePlayer 一次・二次禁止が自然解除前提、参加者 ID 残存 |
| case5 | resetAll 相当（mock）| players も消える（helper との別物確認） |
| case6 | reset 前後 | tournament_id 同一 |
| case7 | reset 前後 | state.rounds 同一 |
| case8 | reset 前後 | state.report 同一 |
| case9 | reset 前後 | _pendingNewYomi / _yomiAutoBuffer / _yomiManuallyEdited 不変 |

合計 **81 件** の assertion すべて PASS。

### 17.8 既存テスト退行確認

`bash test/run_tests.sh shogi_v4.html` の結果:

```
結果: PASS=75, FAIL=0, WARN=0
✓ 全テスト合格(警告: 0件)
```

- `test/test_reception_ux_start_button_guard.js`: PR #112 alert 文言更新に伴い期待値を新文言「大会進行データをリセット」「参加者一覧は残したまま」へ更新（**PASS 64 件**、前回 63 件から +1）
- それ以外の既存テストはすべて影響なく PASS（既存 74 + 新規 1 = **全 75 stanza PASS**）

### 17.9 VRT / E2E

- header に `#resetProgressBtn` を追加した → header VRT snapshot が **mismatch する可能性**
- 既存 `#resetBtn` の文言・配置は変えていないため、影響は新ボタン分のみ
- IMPL-LIGHT 着地時に red の場合は **自律 snapshot 更新せず、判断を仰ぐ**（PR #105 / #109 の流れ）
- E2E は本タスクで追加しない（§11.4 方針通り）
- 既存 E2E への影響は確認していない（PR #112 alert 文言を locator として持つテストがあれば追従更新が要）

### 17.10 やっていないこと（IMPL-MEDIUM 以降の余地）

- 既存 `#resetBtn` 文言の変更（C-1 / C-2 / C-3 で「大会データを全リセット」等への改称、§10.2）
- 既存 `resetAll()` confirm 文言の変更（§7.2 F-1 推奨は IMPL-MEDIUM 送り）
- ボタン文言切替（IMPL-MEDIUM 案 D 相当）
- 案 E モーダル選択化
- 大会開始ボタン disabled 化
- 大会履歴保存 / undo
- 参加者番号再採番
- 支部マスタ / 会員マスタ変更
- pairing algorithm 変更
- `removePlayer()` 文言改修
- WARNING Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT

これらは観察結果に応じて別タスクで起票。
