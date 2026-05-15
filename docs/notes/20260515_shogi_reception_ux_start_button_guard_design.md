# RECEPTION-UX-START-BUTTON-GUARD-DESIGN — 大会開始後の「登録完了・対局開始」ボタン再実行ガード方針

**Task ID**: `RECEPTION-UX-START-BUTTON-GUARD-DESIGN`
**作業種別**: docs-only / design / reception UX / start button guard
**HEAD**: `a88f026`（PR #110 squash merge 後の main）
**前提 PR 系列**:
- PR #97 `SAVE-UX-STATE-RESTORE-HANDLING-IMPL-LIGHT`
- PR #99 `PAIRING-UX-INVENTORY`（[`docs/notes/20260514_shogi_pairing_ux_inventory.md`](20260514_shogi_pairing_ux_inventory.md)）
- PR #106〜#110 `PAIRING-UX-MANUAL-CHANGE-*`（手動組み合わせ系の改善で receiption 系には触れていない）

---

## 1. 目的と非目的

### 1.1 目的

- 参加者登録画面の **「登録完了・対局開始」ボタン** ([`shogi_v4.html:154`](../../shogi_v4.html))を、**大会開始後に再クリックした際の挙動** を整理する
- 現状の [`startTournament`](../../shogi_v4.html) ([L4429](../../shogi_v4.html))が、再クリック時に **`state.results` を全消去 + `state.pairings` を再生成** する破壊的挙動になっていることを明文化する
- 「登録完了・対局開始」と **「大会データをリセット」** ([`resetAll`](../../shogi_v4.html) [L5891](../../shogi_v4.html))の責務を分離する設計方針を案 A〜E で比較する
- 参加者削除不可判定（[`removePlayer`](../../shogi_v4.html) [L3760](../../shogi_v4.html)）と、推奨する「大会開始済み判定」の整合を取る
- 後続最小実装 `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT` の **スコープを限定**（開始後はガードして処理せず案内に留める）

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only design check）
- `shogi_v4.html` / `test/` / `test/e2e/` / Visual Regression snapshot を変更しない
- `resetAll()` の仕様変更（参加者を残す reset / 結果だけ消す reset 等）には踏み込まない
- `removePlayer` の判定変更には踏み込まない（`state.pairings[cls]` メンバーシップ判定は維持）
- pairing 生成ロジック / `generatePairing` / Fisher-Yates / `evaluatePairingQuality` を変更しない
- 大会進行状態を state machine 化しない
- localStorage schema を変更しない
- 後続観察待ちの `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4 / `IMPL-MEDIUM` には進まない

---

## 2. 実機で確認された違和感

運営者が実機で観測した挙動（Task 起票文を要約）:

1. 対局が 2 局目程度まで進行した状態で、参加者登録画面の **「登録完了・対局開始」を再クリック** すると、「現在の結果が消えます」のような確認が出る
2. 確認 OK 後、**勝敗結果がクリアされる**
3. その後、参加者を削除しようとすると **「進行中の対局に登録されているため削除できません」** と弾かれる
4. しかし **「大会データをリセット」** を押すと、参加者を変更できる状態に戻る

運営者目線で「結果が消えたのに、なぜ参加者を削除できないのか」「2 つのボタンの違いが直感的でない」という違和感が残る。

---

## 3. 現状コード確認

`HEAD = a88f026` (PR #110 squash merge 後 main) を直視した結果。

### 3.1 「登録完了・対局開始」ボタン → [`startTournament`](../../shogi_v4.html) ([L4429-4460](../../shogi_v4.html))

DOM:
```html
<!-- shogi_v4.html:154 -->
<button type="button" class="btn-primary" id="startBtn">登録完了・対局開始</button>
```

bind ([L5941](../../shogi_v4.html)):
```js
document.getElementById('startBtn').addEventListener('click',startTournament);
```

実体 ([L4429-4460](../../shogi_v4.html)):
```js
function startTournament(){
  var total=state.players.A.length+state.players.B.length;
  if(total<2){showMsg('参加者が少なすぎます','err');return;}
  if(state.players.A.length%2!==0&&state.players.A.length>0){showMsg('Aクラスが奇数です。運営者を追加してください','warn');return;}
  if(state.players.B.length%2!==0&&state.players.B.length>0){showMsg('Bクラスが奇数です。運営者を追加してください','warn');return;}
  var hasOngoing=state.started && (
    state.pairings.A.length>0 || state.pairings.B.length>0 ||
    state.results.A.length>0 || state.results.B.length>0
  );
  if(hasOngoing){
    if(!confirm('進行中の大会データがあります。再開始すると現在の結果が消えます。続けますか？'))return;
  }
  state.started=true;
  state.pairings={A:[],B:[]};       // ★ pairings 全消去
  state.results={A:[],B:[]};        // ★ results 全消去
  if(state.players.A.length>0)generatePairing('A');  // ★ pairings 再生成
  if(state.players.B.length>0)generatePairing('B');  // ★ pairings 再生成
  showTab('tournament');save();
  // SAVE-003: persist verify (省略)
}
```

**重要点**:
- 再クリック時の confirm 文言は「**現在の結果が消えます**」のみ — `pairings` も新規ペアに置き換わる事実は伝えていない
- 確認 OK 後、`state.pairings` は **空にしてから `generatePairing` で再生成** されるため、再クリック後も「pairings は存在する」状態（**新しい R1 のペア**）になる
- これにより [`removePlayer`](../../shogi_v4.html) の `state.pairings[cls]` メンバーシップ判定（[L3763-3770](../../shogi_v4.html)）が依然として true → 参加者削除不可

### 3.2 「大会データをリセット」ボタン → [`resetAll`](../../shogi_v4.html) ([L5891-5921](../../shogi_v4.html))

DOM:
```html
<!-- shogi_v4.html:100 -->
<button type="button" class="btn-danger btn-sm no-print" id="resetBtn">大会データをリセット</button>
```

bind ([L5934](../../shogi_v4.html)):
```js
document.getElementById('resetBtn').addEventListener('click',resetAll);
```

実体 ([L5891-5921](../../shogi_v4.html)):
```js
function resetAll(){
  if(!confirm('現在の大会データをリセットします（支部マスタは保持されます）'))return;
  state={players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{...}};
  // 既存 _pendingNewYomi / _yomiAutoBuffer / _yomiManuallyEdited も初期化
  try{
    localStorage.removeItem(STORAGE_KEY);
    for(var i=0;i<LEGACY_STORAGE_KEYS.length;i++)localStorage.removeItem(LEGACY_STORAGE_KEYS[i]);
  }catch(e){}
  // 開きっぱなしのモーダルを閉じる
  ...
  renderRegList();
  // pane-A / pane-B / result-A / result-B / 大会報告書入力欄をクリア
  ...
  showTab('reg');
  showMsg('リセットしました','ok');
}
```

**重要点**:
- **`state.players` も含めてすべて空** にする（参加者一覧も消える）
- `state.started=false`、`pairings=空`、`results=空`
- 支部マスタ（`shogi_branch_master`）は保持
- localStorage の大会データキーも削除

### 3.3 参加者削除不可判定 → [`removePlayer`](../../shogi_v4.html) ([L3760-3782](../../shogi_v4.html))

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
  // 大会開始後で過去対局がある参加者は削除禁止
  if(state.started&&pastMatches>0){
    alert(name+'は過去'+pastMatches+'試合分の対戦履歴があるため、大会開始後は削除できません。\n\n誤って登録した場合は「リセット」で大会をやり直してください。');
    return;
  }
  // 通常削除パス（confirm → state.players 更新 → renderRegList → save）
  ...
}
```

**重要点**:
- 削除不可の判定は 2 段階:
  1. **`state.pairings[cls]` に含まれる**（= 進行中対局がある）→ 一次禁止、文言に「対戦相手変更」を案内
  2. **`state.started` かつ過去対局あり**（`state.results[cls]` に登場）→ 二次禁止、文言に「リセット」を案内
- 一次判定は `state.pairings[cls]` の **存在ベース**（`started` フラグは見ない）

### 3.4 大会開始済み判定として参照可能な state

| 候補 | 内容 | 信頼性 |
|---|---|---|
| `state.started === true` | `startTournament` で立ち、`resetAll` / 未開始 load で false | **最有力**（イベントベース、明示） |
| `state.pairings.A.length>0 \|\| state.pairings.B.length>0` | 1 件でも対局があるか | 強（`startTournament` で必ず `generatePairing`、`resetAll` で空） |
| `state.results.A.length>0 \|\| state.results.B.length>0` | 1 ラウンドでも結果が入っているか | 弱（R1 で勝敗未入力時はゼロ、開始済みでも 0） |
| `state.rounds` / 表示中 round | 設定値 / 表示制御フラグ | 開始判定には不適 |

既存の [`startTournament`](../../shogi_v4.html) 内 `hasOngoing` 判定（[L4434-4437](../../shogi_v4.html)）も「`state.started && (pairings or results が非空)`」で **`state.started` を主軸** に置いている。本タスクでも同じく `state.started === true` を主判定とし、防御的に pairings 存在も併用する案を有力候補とする。

### 3.5 `state.started` のライフサイクル

| イベント | `state.started` の値 |
|---|---|
| 初回起動（保存データなし） | `false`（[`normalizeState`](../../shogi_v4.html) [L433](../../shogi_v4.html)）|
| 「登録完了・対局開始」成功 | `true`（[`startTournament`](../../shogi_v4.html) [L4441](../../shogi_v4.html)）|
| 「大会データをリセット」 | `false`（[`resetAll`](../../shogi_v4.html) [L5893](../../shogi_v4.html)）|
| 未開始データ JSON load | 復元値（normalize 後）|
| 開始済みデータ JSON load | 復元値（normalize 後、`true`）|

`load()` / `applyLoadedJson()`（[L5607-5623](../../shogi_v4.html)）も `state.started` を見て tournament タブへ復帰する設計。`state.started` は **アプリ全体で「開始済みか」を表す既存の単一真理源**。

---

## 4. 違和感の構造分析

### 4.1 再クリックで「結果が消える」「pairings は残る」ように見える理由

実態:
- `state.results` は確かに **全消去**（R1, R2 の勝敗データ消失）
- `state.pairings` も **一旦空にされ**、その後 `generatePairing` で **新たな R1 ペア** が生成される
- 運営者から見ると「pairings は『残っている』」ように見えるが、**実際は新しいペアセットに置き換わっている**

→ 「結果消失 + pairings 入れ替わり」という二重の破壊が、1 回の再クリックで起きている。**再開始** の意図でも、**進行中の組み合わせ・勝敗が完全に書き換わる** = 事故。

### 4.2 「結果が消えたのに削除できない」理由

- [`removePlayer`](../../shogi_v4.html) の一次判定は `state.pairings[cls]` メンバーシップ
- 再クリック後も `state.pairings` は **新生成された R1 ペア** を持っているため、参加者は依然「進行中の対局に登録されている」
- 文言は「対戦相手変更」を案内しているが、運営者の意図（参加者そのものを差し替える）には合わない

### 4.3 2 ボタンの責務が曖昧

| ボタン | 文言 | 実態 | 操作後に参加者削除 |
|---|---|---|---|
| 登録完了・対局開始（再クリック）| 「現在の結果が消えます」| **results 全消去 + pairings 再生成** | **不可**（新 pairings が居る） |
| 大会データをリセット | 「現在の大会データをリセット…支部マスタは保持」| **state 全消去**（players も） | （該当なし、参加者ごと消える） |

**運営者の混乱要因**:
- 「再開始」と「リセット」の差分が不明
- 「再開始」のほうが軽そうに見えるが、実質は **同等以上に破壊的**（results は両方とも消える、pairings も書き換わる）
- 「リセット」は player ごと消えるため、結果として「**参加者を残したまま結果だけ消す**」術が `startTournament` 再クリックしかなく、しかも上記の通り pairings まで書き換える

---

## 5. 案 A〜E 比較

### 5.1 案 A: 現状維持

**内容**: 大会開始後も `startTournament` を呼ばせ、results 消去 + pairings 再生成を許す。

**事故リスク**:
- 進行中の組み合わせと結果が **意図せず破壊** される
- confirm 文言は `現在の結果が消えます` だが、**pairings 再生成（R1 から組み直し）** は明示されていない
- 運営者は「結果だけ消す軽い操作」と誤解しやすい
- 参加者削除不可の文言（「対戦相手変更」）と齟齬

**現場運営での混乱**: 大会途中でうっかり押すと、**進行が巻き戻る**。再生成は Fisher-Yates でランダム化されるため、元の組み合わせに戻すこともできない。

**判定**: 採用しない。**事故防止の観点で本タスクの起点そのものに反する**。

### 5.2 案 B: 大会開始後は開始ボタンを `disabled` にする

**内容**: `state.started === true`（または pairings 存在）で `#startBtn` を `disabled` 化。

**メリット**:
- 誤クリックでイベントが発火しない（最も堅い防御）
- 実装は薄い（属性切替）

**デメリット**:
- **理由が伝わらない**（「なぜ押せない？壊れた？」）
- 操作誘導がゼロ（次に何をすればよいか分からない）
- スマホで `disabled` ボタンは押した感触すら出ないため、運営者が「タッチが効いていない」と勘違いするリスク
- 案内テキストを脇に出す必要があるが、見落とされやすい

**判定**: 単独採用は弱い。disabled とするなら **必ず近傍に説明テキストを併記** する必要があり、IMPL-LIGHT としては実装範囲が広がる。

### 5.3 案 C: 大会開始後も押せるが、処理せず案内メッセージを出す（推奨第一候補）

**内容**:
- `#startBtn` の DOM は変えない（`disabled` 化しない、文言も変えない）
- `startTournament()` 冒頭で `state.started === true` を判定し、true なら **`alert(...)` のみで早期 return**
- `state` は一切触らない（results も pairings も保持）

**alert 文言案**（§7 で詳述）:
```
大会はすでに開始されています。
参加者を変更する場合は、先に「大会データをリセット」を実行してください。
```

**メリット**:
- 誤操作で進行が壊れない（state 不変）
- なぜ処理されないかが伝わる
- 「大会データをリセット」へ自然に誘導できる
- 実装が **+5〜10 行と最小**（既存 `hasOngoing` confirm 直前に分岐 1 個）
- DOM 構造・CSS・既存 confirm 経路を変更しない（VRT 影響ほぼゼロ）

**デメリット**:
- 押せる見た目のため「押せちゃった」感は残る
- ボタン文言「登録完了・対局開始」が開始後も同じため、若干紛らわしい

**判定**: **第一推奨**。IMPL-LIGHT のスコープに最も合致。disabled / 文言切替は IMPL-MEDIUM へ送り、まず事故防止だけ実装する。

### 5.4 案 D: 大会開始後はボタン文言を「大会開始済み」に変え、押すと案内を出す

**内容**:
- 開始前: `登録完了・対局開始`
- 開始後: `大会開始済み`（または `大会開始中…`）に切替
- 押すと案内 alert（案 C と同じ）

**メリット**:
- 状態が一目で分かる
- 「押せるのに開始操作が走らない」紛らわしさを軽減
- 案内も出せる（disabled 案 B より誘導が強い）

**デメリット**:
- ボタン文言切替のタイミング（`renderRegList` への追記 / 別ヘルパ）が必要
- 開始 → リセット直後 → 開始前 表示への切り戻しも必要
- 既存テスト・VRT が「登録完了・対局開始」固定で押下している場合、**E2E / VRT が red になる可能性**
- 実装は案 C より **+30〜50 行**、波及範囲が広がる

**判定**: 第二推奨。案 C 着地後の運用観察フィードバック次第で IMPL-MEDIUM 起票。

### 5.5 案 E: 「再開始」専用フローを新設

**内容**:
- 開始後の再クリックは「再開始ウィザード」を開き、「結果だけ消す」「pairings も組み直す」「参加者を残す」「すべてリセット」等を選択できる UI

**評価**:
- 設計負荷が高い（新フロー / 新 state 経路 / 新テスト群）
- 事故防止という本タスクの主目的を超える
- IMPL-LIGHT / IMPL-MEDIUM のいずれにも収まらず、別タスク `RECEPTION-UX-RESTART-WIZARD-DESIGN` を起票するのが妥当

**判定**: 本タスクのスコープ外。後続候補としても優先度は低い。

### 5.6 比較表

| 案 | 事故防止 | 誘導の強さ | 実装規模 | VRT 影響 | スコープ適合 |
|---|---|---|---|---|---|
| A 現状維持 | ✗ | — | 0 | なし | ✗ |
| B disabled | ◎（押せない） | △（理由不明） | 小 | 小 | △ |
| C 押下時 alert + 早期 return | ◎（state 不変） | ◯（案内 + リセット誘導） | **最小** | **ほぼゼロ** | **◎** |
| D ボタン文言切替 + alert | ◎ | ◎（状態自体が見える） | 中 | 中（テキスト変更） | △（IMPL-MEDIUM 候補） |
| E 再開始ウィザード | ◎ | ◎ | 大 | 大 | ✗（別タスク） |

---

## 6. 大会開始済み判定

### 6.1 推奨判定式

```js
function isTournamentStarted(){
  return state.started === true;
}
```

#### 採用理由

- `state.started` は [`startTournament`](../../shogi_v4.html) で立ち、[`resetAll`](../../shogi_v4.html) で false に戻る **イベントベースの真理値**
- 既存の `hasOngoing` 判定（[L4434](../../shogi_v4.html)）/ load 後の表示振り分け（[L5614](../../shogi_v4.html), [L6044](../../shogi_v4.html)）/ 削除二次禁止（[L3779](../../shogi_v4.html)）すべてが既に `state.started` を主軸にしている
- pairings / results を見るより **意味が単一**（「開始イベントが発生したか」）

#### 防御的に併用する候補（推奨はしないが選択肢）

```js
// 防御版（state.started を信用しない場合のフォールバック）
function isTournamentStartedDefensive(){
  if(state.started===true)return true;
  if(state.pairings && (state.pairings.A.length>0 || state.pairings.B.length>0))return true;
  return false;
}
```

- ただし「`state.started=false` だが pairings がある」異常状態は通常発生しない（`startTournament` は両方を同時に書き、`resetAll` は両方を同時に消す）
- `normalizeState` は `started` を `!!s.started` で正規化、pairings は配列で正規化するため、外部 import 起源で `started` だけ落ちる可能性は低い
- IMPL-LIGHT では **`state.started === true` 単独** で十分。防御版は IMPL-MEDIUM 以降の余地として残す

### 6.2 削除不可判定との整合

| 判定 | 既存挙動 | 推奨 IMPL-LIGHT 後の挙動 |
|---|---|---|
| `removePlayer` 一次禁止（pairings メンバーシップ） | 維持 | **維持**（変更しない） |
| `removePlayer` 二次禁止（`state.started && pastMatches>0`） | 維持 | **維持**（変更しない） |
| `startTournament` ガード（新規） | なし | **`state.started === true` で alert + return** |

→ ガード判定（`state.started`）と `removePlayer` 二次禁止判定（`state.started`）が **同じ flag を見る** ため、運営者から見て「大会開始済み」概念が一貫する。

### 6.3 リセット後の状態復帰

`resetAll()` は `state.started=false` を明示設定するため、リセット後は **「登録完了・対局開始」が再び有効** になる。これは既存挙動と等価で、特別なクリーンアップ不要。

### 6.4 判定の境界ケース

| ケース | `state.started` | ガード alert | 既存挙動 |
|---|---|---|---|
| 初回起動・参加者ゼロ → 開始押下 | `false` | スキップ（参加者人数チェックで弾かれる） | 既存 |
| 参加者 2 名 + 開始押下 | `false` | スキップ → 通常開始 | 既存 |
| 開始済み + 再開始押下 | `true` | **alert + return（新規）** | 旧: confirm → results 消去 |
| リセット後 + 開始押下 | `false`（reset で戻った） | スキップ → 通常開始 | 既存 |
| JSON 開始済みデータ load 直後 + 開始押下 | `true`（normalize で復元） | **alert + return（新規）** | 旧: confirm → 破壊 |
| 全クラス参加者ゼロ + 開始済み（理論上） | `true` | alert | 旧: 参加者人数チェックで弾かれる |

---

## 7. 文言設計

### 7.1 案 A〜C 比較

| 案 | 文言 | 文字数 | リセット誘導 | 「参加者一覧は残る」明示 |
|---|---|---|---|---|
| A（短）| `大会はすでに開始されています。\n参加者を変更する場合は、先に「大会データをリセット」を実行してください。` | 短 | ◯ | ✗ |
| B（長）| `大会はすでに開始されています。\n参加者を変更したい場合は、先に「大会データをリセット」を実行してください。\n大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。\n参加者一覧は残ります。` | 中 | ◯ | ◯ |
| C | `すでに対局が開始されています。\n参加者を変更するには、大会データリセットで組み合わせ・勝敗結果を削除してください。\n参加者一覧は残ります。` | 中 | △（句が省略気味） | ◯ |

### 7.2 推奨文言

**案 B 寄りの軽量版** を IMPL-LIGHT 推奨とする:

```
大会はすでに開始されています。
参加者を変更する場合は、先に「大会データをリセット」を実行してください。
大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。
```

#### 採用理由

- 「**何が消えるか**」を明示（運営者が `resetAll` を押す前の判断材料）
- 「**参加者一覧は残ります**」は **`resetAll` の現状仕様と異なる**ため書かない（[`resetAll`](../../shogi_v4.html) [L5893](../../shogi_v4.html)で `state.players` も空にされる）。誤誘導を避ける
- 句点は 2 行構成、PR #107 で確立した「事実 + 次の行動」スタイルに揃える
- alert 1 ステップで完結（モーダル等の追加 UI は IMPL-LIGHT スコープ外）

### 7.3 「参加者一覧は残ります」を **書かない** 理由

タスク起票文では「参加者一覧は残ります」を含めるか問うているが、**現状の `resetAll` は `state.players` も空にする**（[L5893](../../shogi_v4.html)）。誤った保証を文言で出すと信頼を損なう。

「参加者を残したまま大会データだけリセット」する機能は **現時点で存在しない** ため、この文言は次のいずれか実現後に解禁:

1. `resetAll` に「参加者を残す」モードを追加する別 IMPL（今回のスコープ外）
2. または「参加者は再入力が必要です」と正直に書く（推奨第二案）

#### 推奨第二案（より正確だが長い）

```
大会はすでに開始されています。
組み合わせ・勝敗結果を消すには「大会データをリセット」を実行してください。
ただしリセットすると参加者一覧も含めて消えます。
参加者を残したまま結果だけ消す機能は今のところありません。
```

- 正直で誤誘導なし
- ただし IMPL-LIGHT には冗長 → **§7.2 推奨を採用、§7.3 第二案は §11 リスク欄に残す**

### 7.4 alert で十分か

- alert 1 個で完結（モーダル追加なし）
- ボタン disabled 化なし → DOM 不変
- VRT snapshot に影響なし

将来 alert を Level 1 indicator / 画面内バナー化したい場合は IMPL-MEDIUM で `RECEPTION-UX-START-GUARD-INDICATOR` を起票判断。

---

## 8. 参加者削除との整合

### 8.1 現状と推奨の差分

| 操作 | 現状 | 推奨 IMPL-LIGHT 後 |
|---|---|---|
| 開始済み + 開始ボタン再クリック | results 消去 + pairings 再生成 | **state 不変、alert 案内** |
| 開始済み + 参加者削除 | 一次禁止（pairings） / 二次禁止（results） | **変更なし** |
| 開始済み + 大会データをリセット | state 全消去（players 含む） | **変更なし** |

### 8.2 文言の整合

`removePlayer` の二次禁止 alert（[L3780](../../shogi_v4.html)）:
```
〜は過去N試合分の対戦履歴があるため、大会開始後は削除できません。

誤って登録した場合は「リセット」で大会をやり直してください。
```

→ 「リセット」誘導の語彙が一致するため、本タスクの alert（§7.2）と **語彙整合する**。

`removePlayer` の一次禁止 alert（[L3768](../../shogi_v4.html)）:
```
〜は進行中の対局に登録されているため削除できません。

先に「対戦相手変更」で別の選手に差し替えてから削除してください。
```

→ こちらは「対戦相手変更」へ誘導。本タスクの alert は「大会データをリセット」へ誘導するため **役割が異なる**（参加者を **個別差替** したいのか、**まとめて変更** したいのか）。

### 8.3 既存判定ロジックとの非干渉

- `removePlayer` のロジック（[L3760-3782](../../shogi_v4.html)）は **触らない**
- `state.pairings` メンバーシップ判定 / `state.started && pastMatches>0` 判定はそのまま
- IMPL-LIGHT は `startTournament` の **冒頭ガード追加のみ**

---

## 9. IMPL-LIGHT 候補（後続）

### 9.1 含める

- [`startTournament`](../../shogi_v4.html)（[L4429](../../shogi_v4.html)）の冒頭、参加者人数チェック（[L4430-4433](../../shogi_v4.html)）の **直後** に `state.started === true` ガードを追加
  - 該当時は alert（§7.2 推奨文言）を出して **早期 return**
  - state 一切不変、save() / renderTournament() / showTab() を呼ばない
- 既存 `hasOngoing` 経路（[L4434-4440](../../shogi_v4.html)）は **温存**（fail-safe / JSON load → 開始ボタン経路の安全網）
- 軽量テスト 1 本追加（`test/test_reception_ux_start_button_guard.js`）
  - 静的検査: `state.started===true` の早期 return が `startTournament` 内に存在
  - alert 文言の主要語句（`大会はすでに開始`、`大会データをリセット`、`組み合わせ`、`勝敗結果`）が `startTournament` 関数本体に含まれる
  - 振る舞いテスト（軽量）: mock state で `state.started=true` の状態で再呼出時に `state.pairings`/`state.results` 不変
- `test/run_tests.sh` に stanza 追加

### 9.2 含めない（IMPL-MEDIUM 以降）

- ボタン文言切替（案 D）
- ボタン disabled 化（案 B）
- 「参加者を残したままリセット」機能
- 「結果だけ消す」専用機能
- 「再開始ウィザード」（案 E）
- 大会進行 state machine 化
- localStorage schema 変更
- pairing algorithm 変更
- `resetAll` の確認文言改善（別タスク `RESET-UX-CONFIRM-IMPROVEMENT-DESIGN` 候補）
- `removePlayer` 文言の改修
- VRT snapshot 更新（モーダル系の VRT は撮っていない見込み、`#startBtn` 表示も変えないため変更なし）

### 9.3 想定変更ファイル（IMPL-LIGHT 想定）

- `shogi_v4.html`（+5〜10 行 in [L4429](../../shogi_v4.html) 付近）
- `test/test_reception_ux_start_button_guard.js`（新規、+80〜120 行）
- `test/run_tests.sh`（+10 行 stanza）
- `HANDOFF.md`（+1 行 entry）
- `docs/notes/20260515_shogi_reception_ux_start_button_guard_design.md`（本ドキュメント、§17 実装着地ノート追記）

### 9.4 想定変更しないファイル

- `index.html` / `data/`
- `.github/workflows/`
- `package.json` / `package-lock.json`
- `playwright.config.js`
- `docs/specs/`
- `test/e2e/`（既存 E2E は `#startBtn` を押下するが、テスト時 state は `started:false` から始まるため無影響。red になった場合のみ要対応）
- VRT snapshot

---

## 10. テスト方針

### 10.1 静的検査（最小）

- `startTournament` 関数本体を抽出し、`state.started` を見る分岐が **参加者人数チェックの後・`hasOngoing` confirm の前** にあること
- 早期 return 時に `state.pairings = ...` / `state.results = ...` / `generatePairing(` / `save(` / `showTab(` が実行されないこと
- alert 文言の主要語句（§7.2）が含まれること

### 10.2 振る舞いテスト（軽量、mock state）

```
1. state.started=false, players={A:[2名]} で startTournament → state.started=true / pairings.A.length>0
2. state.started=true, pairings.A=[既存ペア], results.A=[R1勝敗] で startTournament → state 不変、alert 文言が呼ばれる
3. state.started=true, pairings={A:[],B:[]}, results={A:[],B:[]} で startTournament → state 不変、alert 呼ばれる（state.started のみで判定する仕様の検証）
4. resetAll 後（state.started=false）に startTournament → 通常開始経路
```

### 10.3 既存テスト退行確認

- `test/test_pairing_ux_*` 各種（`startTournament` を直接呼ばない、影響なし見込み）
- `test/test_save_ux_parse_load_003.js`（state restore 系、影響なし）
- `test/test_branch_master.js`（マスタ系、影響なし）
- `test/test_pairing_ux_manual_change_*`（モーダル系、影響なし）

### 10.4 E2E

- 過剰な追加は不要
- `test/e2e/shogi_phase4_pairing_swap.spec.js` 等は **すべて未開始 state からシナリオを組む** ため red にならない見込み
- 必要なら 1 ケースだけ追加: 「開始後に `#startBtn` を再クリック → alert が出る → state.pairings / state.results 不変」

### 10.5 VRT

- DOM 変更なし、ボタン文言不変、disabled 化なし → snapshot 不変見込み
- red になった場合は **自律 snapshot 更新せず判断を仰ぐ**（PR #105 / #109 の流れ）

---

## 11. リスク

### 11.1 判定が強すぎ / 弱すぎ

| リスク | 対策 |
|---|---|
| 開始判定が強すぎて、開始前に弾かれる | `state.started === true` 単独判定。`pairings` 存在は併用しない（IMPL-LIGHT）。`startTournament` 成功時にのみ true になる流れを既存テストでも担保 |
| 開始判定が弱すぎて、JSON load 後に旧挙動が残る | `applyLoadedJson` は `normalizeState` 経由で `state.started` を復元するため、開始済みデータ load 直後は true になる。ガードは効く |
| `state.started` だけが落ちている異常状態 | 防御版（§6.1 後半）は IMPL-LIGHT スコープ外。観察結果次第で IMPL-MEDIUM 検討 |

### 11.2 文言関連

| リスク | 対策 |
|---|---|
| リセット誘導文言が怖すぎて押されない | §7.2 推奨は 3 行・事実ベース。`removePlayer` の既存リセット誘導文言と語彙整合 |
| 「参加者一覧は残ります」の有無で判断ミス | **書かない**（§7.3 の通り、`resetAll` 現状仕様と矛盾するため）。書きたければ別 IMPL で `resetAll` を変更してから |
| alert がスマホでスクロール必要になる | 3 行は許容範囲。長文化は IMPL-MEDIUM で indicator / banner 化候補 |

### 11.3 UI 関連

| リスク | 対策 |
|---|---|
| 押せる見た目の `#startBtn` が紛らわしい | IMPL-LIGHT は意図的に見た目不変（VRT・E2E 影響をゼロに）。「押した感」と「処理されない」の差は alert で説明 |
| disabled 化したいリクエストが来る | 案 D / B を IMPL-MEDIUM 候補として残す。IMPL-LIGHT 着地後の運用観察で判断 |

### 11.4 削除 / リセットとの不整合

| リスク | 対策 |
|---|---|
| `removePlayer` の一次禁止判定との整合 | 触らない。`state.pairings` メンバーシップ判定は維持 |
| `removePlayer` の二次禁止判定との整合 | 触らない。`state.started && pastMatches>0` 判定は維持 |
| `resetAll` の挙動誤解 | `resetAll` は仕様変更なし。文言上「`state.players` も消える」事実を IMPL-LIGHT alert では暗黙に表現せず、§7.2 では「組み合わせ・勝敗結果は削除されます」止まりで保守的に |

### 11.5 互換性

| リスク | 対策 |
|---|---|
| localStorage 既存データとの互換性 | schema 変更なし。`state.started` フィールドは PR #48 以降の前提で常に存在 |
| 旧シリアライズ JSON load との互換性 | `normalizeState` が `!!s.started` で正規化、無影響 |

---

## 12. 当面やらないこと

- 実装着手（IMPL-LIGHT は本 DESIGN 着地後、別 PR で起票）
- ボタン文言切替・disabled 化（案 D / B）
- `resetAll` の挙動変更（参加者を残すモード等）
- `removePlayer` の判定変更
- 「結果だけ消す」「pairings だけ組み直す」等の専用機能
- 「再開始ウィザード」（案 E）
- 大会進行状態の state machine 化
- localStorage schema 変更
- pairing algorithm / Fisher-Yates 変更
- `evaluatePairingQuality` / `warning object` 変更
- 既存 helper（`getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` / `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings`）変更
- 既存 alert / confirm（PR #107 / #109 で改善済み）変更
- VRT snapshot 更新 / threshold 緩和
- CI 設定変更
- package 変更
- docs/specs 変更
- 後続観察待ちの DISPLAY-LABELS-IMPL-LIGHT / WARNING Phase 2〜4 / IMPL-MEDIUM 各種

---

## 13. 次タスク候補

| 優先 | タスク | スコープ | 着手判断 |
|---|---|---|---|
| 第一 | `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT` | 案 C を実装（startTournament 冒頭 ガード + alert + 軽量テスト） | **本 DESIGN 着地直後** |
| 第二 | 運用観察 | 案 C 着地後、現場で alert が伝わるか / `resetAll` への誘導が機能するか | IMPL-LIGHT 後 |
| 第三 | `RECEPTION-UX-START-BUTTON-GUARD-IMPL-MEDIUM`（案 D 相当）| ボタン文言切替 + alert（必要に応じて disabled）| 観察結果次第 |
| 第四 | `RESET-UX-PARTIAL-RESET-DESIGN` | 「参加者を残してデータだけリセット」機能の設計 | 運営者から強い要求が出た場合 |
| 第五 | `RECEPTION-UX-RESTART-WIZARD-DESIGN`（案 E 相当）| 再開始フロー全体の再設計 | 第四より優先度低 |

---

## 14. 推奨 Next Action

**`RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT`** を即起票可能。

スコープ:
- `startTournament` の冒頭、参加者人数チェック直後に `if(state.started===true){ alert(...); return; }` を 1 個追加
- alert 文言は §7.2 推奨
- 既存 `hasOngoing` confirm 経路は安全網として温存
- 軽量テスト 1 本（`test/test_reception_ux_start_button_guard.js` 新規）+ `test/run_tests.sh` stanza
- 既存テスト退行ゼロ見込み
- VRT 不変見込み

DESIGN は本ドキュメントに集約。IMPL-LIGHT 着地時に §17 として「実装着地ノート」を追記する想定（PR #109 と同じ構成）。

---

## 17. 実装着地ノート（IMPL-LIGHT）

**Task ID**: `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT`
**Branch**: `feat/reception-ux-start-button-guard-impl-light`
**設計 PR**: PR #111 (merge `5625e1f`)
**実装 PR**: 本タスクの Draft PR

### 17.1 採用した実装位置

`startTournament()` 内、`total` 算出（[`shogi_v4.html` L4430](../../shogi_v4.html)）の **直後**、人数チェック・奇数チェック・既存 `hasOngoing` confirm より **前** に guard を追加。

```js
function startTournament(){
  var total=state.players.A.length+state.players.B.length;
  if(state.started===true){
    alert('大会はすでに開始されています。\n参加者を変更する場合は、先に「大会データをリセット」を実行してください。\n大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。');
    return;
  }
  if(total<2){...}
  if(state.players.A.length%2!==0&&...){...}
  if(state.players.B.length%2!==0&&...){...}
  var hasOngoing=state.started && (...);
  if(hasOngoing){...}
  state.started=true;
  state.pairings={A:[],B:[]};
  state.results={A:[],B:[]};
  if(state.players.A.length>0)generatePairing('A');
  if(state.players.B.length>0)generatePairing('B');
  showTab('tournament');save();
  ...
}
```

### 17.2 採用した alert 文言

§7.2 の推奨文言をそのまま採用:

```
大会はすでに開始されています。
参加者を変更する場合は、先に「大会データをリセット」を実行してください。
大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。
```

- 「参加者一覧は残ります」は **書かない**（§7.3 のとおり、`resetAll()` 現仕様で `state.players` が空になるため）
- 「大会データをリセット」の鉤括弧表記は画面上の `#resetBtn` 文言（[`shogi_v4.html` L100](../../shogi_v4.html)）と語彙整合

### 17.3 早期 return で到達しなくなった処理

開始済み状態（`state.started===true`）での再クリック時、以下に **到達しない** ことを構造的に保証:

- `state.results = {A:[],B:[]}` の再初期化
- `state.pairings = {A:[],B:[]}` の再初期化
- `generatePairing('A')` / `generatePairing('B')` の呼出
- `showTab('tournament')` の呼出
- `save()` の呼出
- SAVE-003 の `readPersistedState` 再検証パス

### 17.4 既存挙動を維持したもの

- 既存 `hasOngoing` confirm 経路（[L4447-4453](../../shogi_v4.html) 相当）は **温存**
  - 想定: `state.started=false` だが `state.pairings`/`state.results` のみ残る異常データ load 時の fail-safe
  - 通常運用では guard が先に発火するため到達しない
- `state.started=true` の代入位置（[L4454 相当](../../shogi_v4.html)）は変更なし
- `resetAll()` ロジック（[`shogi_v4.html` L5904-5934](../../shogi_v4.html)）は変更なし
  - `started:false` の戻し / `players:{A:[],B:[]}` 含む全 state 初期化を維持
- `removePlayer()` 一次禁止（pairings メンバーシップ）/ 二次禁止（`state.started && pastMatches>0`）は変更なし
- `normalizeState` の `base.started=!!s.started` は変更なし
- `localStorage` schema（`STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']`）は変更なし
- `generatePairing` / Fisher-Yates / `evaluatePairingQuality` は変更なし
- `#startBtn` の DOM / 文言 / disabled 状態は変更なし → VRT snapshot 不変

### 17.5 追加テスト

新規ファイル: [`test/test_reception_ux_start_button_guard.js`](../../test/test_reception_ux_start_button_guard.js)

`test/run_tests.sh` に呼出 stanza を追加。

#### 17.5.1 静的検査

1. `startTournament` 内に `if(state.started===true)` guard がある
2. guard 位置: `total` 算出後 / 参加者数・奇数チェック / `var hasOngoing=` / 既存 confirm 文言よりも前
3. guard 内に `alert(...)` がある
4. alert 文言に「大会はすでに開始されています」「大会データをリセット」「組み合わせ」「勝敗結果」が含まれる
5. alert 文言に「参加者一覧は残ります」が **含まれない**
6. guard 内で `return;` している
7. guard 内で `save()` / `showTab(` / `renderTournament(` / `generatePairing(` を呼ばない
8. guard 内で `state.results=` / `state.pairings=` の再代入がない
9. `state.results = {A:[],B:[]}` / `state.pairings = {A:[],B:[]}` / `generatePairing(` の行は guard より **後ろ**（early return で守られる）
10. `#resetBtn` ボタン文言が「大会データをリセット」のまま（alert 誘導語彙と整合）
11. 通常開始経路（`state.started=true` / `showTab('tournament')` / `save()`）は guard より後ろに維持
12. `resetAll()` の `started:false` / `players:{A:[],B:[]}` 維持
13. `removePlayer()` 一次禁止 / 二次禁止 alert + 条件 (`state.started && pastMatches>0`) 維持
14. `STORAGE_KEY` / `LEGACY_STORAGE_KEYS` / `normalizeState`(`base.started=!!s.started`) 維持

#### 17.5.2 振る舞いテスト（軽量 mock）

| ケース | 入力 | 期待 |
|---|---|---|
| case1 | `started=false`, players 空 → `startTournament()` | guard alert なし、通常経路通過（`state.started=true`） |
| case2 | `started=true`, pairings/results 有り → `startTournament()` | guard alert 1 回、`state.pairings`/`state.results`/`state.started` 全て不変 |
| case3 | `started=true`, pairings=[]/results=[] → `startTournament()` | guard alert 1 回（`state.started` 単独判定の確認）、state 不変 |
| case4 | `resetAll` 後 `started=false` → `startTournament()` | guard alert なし、通常経路通過 |

合計 **63 件** の assertion すべて PASS。

### 17.6 既存テスト退行確認

`bash test/run_tests.sh shogi_v4.html` の結果:

```
結果: PASS=74, FAIL=0, WARN=0
✓ 全テスト合格(警告: 0件)
```

特に既存 B3 順序回帰（`startTournament` 内で人数チェックが confirm より先）は無影響（新 guard の alert 文言は対象キーワードを含まないため）。

### 17.7 VRT / E2E

- DOM 変更なし、ボタン文言・disabled 状態不変 → snapshot 不変見込み
- 既存 E2E は `startTournament` を **未開始 state** から呼ぶシナリオのみ → 影響なし見込み
- E2E は本タスクで追加しない（§10.4 の方針通り）

### 17.8 やっていないこと（IMPL-MEDIUM 以降の余地）

- ボタン文言切替（案 D）
- ボタン disabled 化（案 B）
- 「参加者を残してデータだけリセット」機能
- 「結果だけ消す」「pairings だけ組み直す」専用機能
- 再開始ウィザード（案 E）
- 大会進行 state machine 化
- `resetAll` 文言改善
- `removePlayer` 文言改修
- WARNING Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT / IMPL-MEDIUM 各種

これらは観察結果に応じて別タスク起票。
