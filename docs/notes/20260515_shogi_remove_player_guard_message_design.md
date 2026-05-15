# REMOVE-PLAYER-GUARD-MESSAGE-DESIGN — `removePlayer()` 削除不可メッセージと部分リセット導線の整合

**Task ID**: `REMOVE-PLAYER-GUARD-MESSAGE-DESIGN`
**作業種別**: docs-only / design / removePlayer guard / reset UX integration
**HEAD**: `779803b`（PR #114 squash merge 後の main）
**参照 PR**:
- PR #112 `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT`（startTournament guard 追加）
- PR #113 `RESET-UX-PARTIAL-RESET-DESIGN`（[`docs/notes/20260515_shogi_reset_ux_partial_reset_design.md`](20260515_shogi_reset_ux_partial_reset_design.md)）
- PR #114 `RESET-UX-PARTIAL-RESET-IMPL-LIGHT`（`resetTournamentProgressOnly()` / `#resetProgressBtn` 追加 + PR #112 alert を新ボタン名へ同期）

---

## 1. 目的と非目的

### 1.1 目的

- 現行 [`removePlayer()`](../../shogi_v4.html) ([L3761-3803](../../shogi_v4.html)) の **削除不可メッセージ 2 種** を、PR #114 で追加された「大会進行データをリセット」導線と整合させる
- 運営者が削除不可状態に直面したとき、**次の操作（対戦相手変更 / 大会進行データをリセット）** が伝わるように文言を整理する
- 「リセット」という曖昧な単語が、現状の 2 ボタン（`#resetBtn`「大会データをリセット」/ `#resetProgressBtn`「大会進行データをリセット」）と混同しない文言を docs-only で設計する
- 後続 IMPL-LIGHT の **スコープを限定**（文言更新のみ、判定ロジック / state 操作は触らない）

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only design check）
- `shogi_v4.html` / `test/` / `test/e2e/` / Visual Regression snapshot / `.github/workflows/` / `package*.json` / `playwright.config.js` / `docs/specs/` を変更しない
- `removePlayer()` の **判定ロジック** 変更には踏み込まない（`state.pairings[cls]` メンバーシップ判定 / `state.started && pastMatches>0` 判定は維持）
- `resetTournamentProgressOnly()` / `resetAll()` / `startTournament()` guard 条件は変更しない
- `changePairing` モーダルの仕様変更には踏み込まない（「対戦相手変更」誘導の文脈で参照のみ）
- `state.results` 構造 / pairing algorithm / localStorage schema は変更しない
- 自動部分リセット実行（removePlayer → 直接 reset 連鎖）には踏み込まない（IMPL-MEDIUM 以降候補）
- 専用モーダル化 / UI ボタン追加 / undo / 大会履歴保存 等の重い変更には踏み込まない

---

## 2. 現状コード確認（HEAD = `779803b`）

### 2.1 [`removePlayer()`](../../shogi_v4.html) ([L3761-3803](../../shogi_v4.html))

```js
function removePlayer(id,cls){
  var name=getName(id,cls);
  var inPairings=false;
  for(var i=0;i<state.pairings[cls].length;i++){
    var pm=state.pairings[cls][i];
    if(pm.p1===id||pm.p2===id){inPairings=true;break;}
  }
  if(inPairings){
    // 一次禁止 alert
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
  // 大会開始後で過去対局がある参加者は削除禁止（calcFinalがstate.players前提のため、TypeErrorで最終結果タブが落ちる）
  if(state.started&&pastMatches>0){
    // 二次禁止 alert
    alert(name+'は過去'+pastMatches+'試合分の対戦履歴があるため、大会開始後は削除できません。\n\n誤って登録した場合は「リセット」で大会をやり直してください。');
    return;
  }
  var msg=name+'を削除しますか？';
  if(!confirm(msg))return;
  var arr=state.players[cls];
  state.players[cls]=arr.filter(function(p){return p.id!==id;});
  if(_pendingNewYomi&&Object.prototype.hasOwnProperty.call(_pendingNewYomi,id))delete _pendingNewYomi[id];
  renderRegList();save();
  // SAVE-001 verify (省略)
}
```

### 2.2 削除可否の判定マトリクス

| `state.pairings[cls]` に id 存在 | `state.results[cls]` に id 存在 (pastMatches>0) | `state.started` | 削除可否 | 発火する alert | 推奨される次操作 |
|---|---|---|---|---|---|
| ◯ | ◯ / ✗ | true/false | **不可（一次禁止）** | 「進行中の対局に登録されているため削除できません」 | 「対戦相手変更」で別選手に差し替え（recoverable without reset） or 大会進行データをリセット |
| ✗ | ◯ | true | **不可（二次禁止）** | 「過去N試合分の対戦履歴があるため、大会開始後は削除できません」 | 「リセット」（現状曖昧、新ボタン名へ具体化したい） |
| ✗ | ◯ | false | 可（confirm 経由） | （二次禁止 fire しない）| — |
| ✗ | ✗ | true/false | 可（confirm 経由） | — | — |

**重要観察**:
- 一次禁止と二次禁止は **早期 return** で順次評価されるため、**両方に該当する参加者** は **一次禁止 alert のみ** 発火する（二次禁止 alert には到達しない）
- 一次禁止には **「対戦相手変更」** という soft recovery がある（既存 `changePairing` モーダル）
- 二次禁止には **reset しか recovery がない**（pastMatches を消す手段は results をクリアするしかなく、それは reset 経由）
- `pastMatches` は **ローカル変数**、`state.results[cls]` 走査でその場集計（state.pastMatches フィールドは不在、PR #113 §3.2 確認済）

### 2.3 削除成功時の挙動

```js
state.players[cls]=arr.filter(function(p){return p.id!==id;});
if(_pendingNewYomi)delete _pendingNewYomi[id];
renderRegList();save();
```

- `state.players[cls]` から該当 id を除去（filter で新配列）
- `_pendingNewYomi[id]` も同時破棄（A-4 §3.1.4）
- `renderRegList()` で参加者一覧再描画
- `save()` で localStorage に反映 + SAVE-001 verify
- **`state.pairings` / `state.results` / `state.started` には触らない**（削除可能になる前提条件として一次・二次禁止が通っているため、これらは整合済み）

### 2.4 PR #114 によって増えたリセット動線

- 既存 [`resetAll()`](../../shogi_v4.html) ([L5934-5964](../../shogi_v4.html)): `state.players` も含めて全消去（[`#resetBtn`](../../shogi_v4.html) [L100](../../shogi_v4.html) 「大会データをリセット」）
- 新規 [`resetTournamentProgressOnly()`](../../shogi_v4.html) ([L5913-5932](../../shogi_v4.html)): **参加者一覧は残し、`state.pairings`/`state.results`/`state.started` のみ初期化**（[`#resetProgressBtn`](../../shogi_v4.html) [L101](../../shogi_v4.html) 「大会進行データをリセット」）

→ **二次禁止 alert の「リセット」がどちらを指すかが現状曖昧**。運営者が `#resetBtn` を押すと参加者も消える（やり直し過剰）、`#resetProgressBtn` を押すと参加者は残って進行データだけ消える（適切）。本タスクでこの曖昧さを文言で具体化する。

### 2.5 PR #112 / PR #114 alert との語彙整合（参考）

PR #114 で更新済の [`startTournament()`](../../shogi_v4.html) guard alert（[L4443](../../shogi_v4.html)）:

```
大会はすでに開始されています。
参加者を変更する場合は、先に「大会進行データをリセット」を実行してください。
大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。
```

→ 本タスクで `removePlayer()` 二次禁止 alert もこの語彙に揃えると、運営者の認知負荷を下げられる。

---

## 3. 問題意識

### 3.1 一次禁止 alert

```
<氏名>は進行中の対局に登録されているため削除できません。

先に「対戦相手変更」で別の選手に差し替えてから削除してください。
```

| 観点 | 評価 |
|---|---|
| 削除できない理由 | ◯（明示）|
| 次の操作 | ◯（対戦相手変更）|
| PR #114 導線への言及 | ✗（「大会進行データをリセット」未言及）|

**指摘**:
- 「対戦相手変更」は softer recovery（特定ペアだけ swap、勝敗結果は保持）として有効 → **温存すべき**
- ただし、「**まとめて参加者を変更したい**」「**そもそも一覧から削除したい**」運営者にとっては、`#resetProgressBtn` も選択肢として提示できると親切
- 一方、運営者によっては「対戦相手変更で済むのに reset 提示は不要」と感じる可能性 → 提示順は「対戦相手変更が第一、reset は第二」が望ましい

### 3.2 二次禁止 alert

```
<氏名>は過去<N>試合分の対戦履歴があるため、大会開始後は削除できません。

誤って登録した場合は「リセット」で大会をやり直してください。
```

| 観点 | 評価 |
|---|---|
| 削除できない理由 | ◯（明示、N 試合数も表示）|
| 次の操作 | △（「リセット」が曖昧）|
| PR #114 導線への言及 | ✗（`#resetBtn` / `#resetProgressBtn` どちらか不明）|

**指摘**:
- 「リセット」がどちらのボタンを指すか **運営者には判定できない**（PR #114 で 2 ボタン化したため）
- 文脈的には「**参加者を残して進行データだけ消したい**」ケースが多いはず → `#resetProgressBtn`「大会進行データをリセット」を案内するのが妥当
- 「**参加者一覧は残ります**」を明示すると安心して押せる（PR #114 alert と同じ語彙）
- 既存「大会をやり直してください」表現は `#resetBtn`（全リセット）を含意しがちで、参加者まで消える誤誘導リスク

### 3.3 共通の課題

- 削除不可状態に陥った運営者が「**どのボタンを押せばよいか**」を 1 回の文言で理解できるべき
- ただし IMPL-LIGHT では **alert 文言更新に限定**（自動 reset 実行・専用モーダル化等は IMPL-MEDIUM 候補）
- 既存判定ロジック・既存 alert 構造（2 段 early return）は **温存**

---

## 4. PR #114 後の新しい運用導線

```
[参加者を削除したい]
    │
    ▼
removePlayer(id, cls)
    │
    ├─ state.pairings[cls] に id ──→ [一次禁止 alert]
    │                                     │
    │                                     ├─ 「対戦相手変更」で別選手に差し替え
    │                                     │  (recoverable, results 保持) → 再 removePlayer 可
    │                                     │
    │                                     └─ または「大会進行データをリセット」
    │                                        (state.players は残るが results は消える)
    │                                        → 再 removePlayer 可
    │
    ├─ state.started && pastMatches>0 ──→ [二次禁止 alert]
    │                                          │
    │                                          └─ 「大会進行データをリセット」のみが recovery
    │                                             (参加者一覧は残る、組み合わせ・勝敗結果は消える)
    │                                             → 再 removePlayer 可
    │                                             → 必要に応じて「登録完了・対局開始」で再開
    │
    └─ confirm → state.players[cls] から除去、save / renderRegList
```

**主要シナリオ**:
1. R1 進行中、欠席者発覚 → 一次禁止 → 「対戦相手変更」で運営者を代打ち → 元参加者を削除
2. R2 終了後、誤登録気付く → 二次禁止 → 「大会進行データをリセット」→ 参加者修正 → 再度「登録完了・対局開始」
3. 受付完了直後（state.started=false）、ペアリングなし → 一次禁止スキップ → 二次禁止スキップ（state.started=false）→ confirm 経由で削除可
4. 受付完了直後（state.started=true、ペアリング生成済、対局未開始） → 一次禁止 hit → 対戦相手変更 or 進行データリセット

---

## 5. メッセージ案 A〜E

### 5.1 案 A: 現状維持

#### 一次禁止
```
<氏名>は進行中の対局に登録されているため削除できません。

先に「対戦相手変更」で別の選手に差し替えてから削除してください。
```

#### 二次禁止
```
<氏名>は過去<N>試合分の対戦履歴があるため、大会開始後は削除できません。

誤って登録した場合は「リセット」で大会をやり直してください。
```

**評価**:
- 実装ゼロ
- ✗ 「リセット」がどちらのボタンか不明（PR #114 後の曖昧さ未解消）
- ✗ 「参加者一覧は残ります」が伝わらず、運営者が `#resetBtn` を選んでしまう誤誘導リスク

**判定**: 採用しない。

### 5.2 案 B: 理由だけ明確化

#### 一次禁止
```
<氏名>は現在の組み合わせに登録されているため削除できません。

別の選手に差し替えるには「対戦相手変更」を実行してください。
```

#### 二次禁止
```
<氏名>には入力済みの勝敗結果があるため削除できません。
```

**評価**:
- 理由の表現を整える（「進行中の対局」→「現在の組み合わせ」、「過去N試合の対戦履歴」→「入力済みの勝敗結果」）
- ✗ 次の操作（reset）が伝わらない
- ✗ PR #114 導線への接続なし

**判定**: 単独採用は弱い。理由表現の改善は意味があるが、誘導不足。

### 5.3 案 C: 理由 + 部分リセット誘導（task 初期仮説）

#### 統一メッセージ（一次禁止 / 二次禁止 共通）
```
<氏名>は現在の組み合わせ、または入力済みの勝敗結果に含まれているため削除できません。
参加者を削除する場合は、先に「大会進行データをリセット」を実行してください。
大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。
```

**評価**:
- ◯ 「大会進行データをリセット」を明示誘導、PR #114 alert と語彙整合
- ◯ 「参加者一覧は残したまま」明示で運営者が安心して押せる
- ✗ **一次禁止での「対戦相手変更」soft recovery 路線が消える**（reset しか提示されない）
- ✗ 「現在の組み合わせ、または入力済みの勝敗結果に含まれている」は OR 表現でやや曖昧
- ◯ 統一文言で実装シンプル

**判定**: シンプルだが「対戦相手変更」誘導の喪失が惜しい。**条件別分岐 (案 D) との比較で迷う**。

### 5.4 案 D: 条件別メッセージ分岐（推奨）

#### 一次禁止（対戦相手変更 path 温存 + 進行データリセット併記）
```
<氏名>は現在の組み合わせに登録されているため削除できません。

別の選手に差し替える場合は「対戦相手変更」を実行してください。
参加者一覧から削除したい場合は、先に「大会進行データをリセット」を実行してください。
大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。
```

#### 二次禁止（「リセット」→「大会進行データをリセット」具体化）
```
<氏名>には過去<N>試合分の勝敗結果があるため削除できません。

参加者を削除する場合は、先に「大会進行データをリセット」を実行してください。
大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。
```

**評価**:
- ◯ 一次禁止で **対戦相手変更（soft recovery）を第一案、reset を第二案** として提示 → soft recovery 喪失を回避
- ◯ 二次禁止で「リセット」→「大会進行データをリセット」具体化、`#resetBtn` 誤押下を抑制
- ◯ どちらも「参加者一覧は残したまま」明示で PR #114 alert と語彙整合
- △ 文字数が増える（一次禁止 5 行、二次禁止 4 行）→ alert ダイアログでスクロール不要かは要実機確認
- △ 実装が 2 文言に分岐（既存 alert 構造を温存するため、関数ロジックは変えず 2 文言を埋め込むだけ）

**判定**: **推奨（後述 §6）**。

### 5.5 案 E: メッセージ + confirm で部分リセット実行まで誘導（IMPL-MEDIUM 候補）

```
<氏名>には入力済みの勝敗結果があるため、このまま削除できません。
「大会進行データをリセット」を実行して、参加者一覧を残したまま組み合わせ・勝敗結果を削除しますか？
[OK] → resetTournamentProgressOnly() を呼ぶ → renderRegList() の後、再度 removePlayer(id, cls) を試みる
[キャンセル] → 何もしない
```

**評価**:
- ◎ 運営者の操作数が最小
- ✗ alert + confirm の連鎖になる
- ✗ resetTournamentProgressOnly() が confirm を持つため confirm が二重に出る → UX 上の違和感
- ✗ 削除完了まで自動連鎖するか、reset 後に手動で再度削除を要求するかの設計判断が必要
- ✗ 「削除のつもりでボタンを押したら勝敗結果も消えた」誤操作リスク（destructive 連鎖）
- ✗ 専用モーダル化を伴う可能性、IMPL-LIGHT には重い

**判定**: **IMPL-MEDIUM 以降の候補**。運用観察後、案 D で誘導が不十分と判明したら起票。

### 5.6 比較表

| 案 | 削除理由の明示 | 対戦相手変更 path | 大会進行データをリセット誘導 | 参加者一覧維持の明示 | `#resetBtn` 誤押下抑止 | 実装規模 | IMPL-LIGHT 適合 |
|---|---|---|---|---|---|---|---|
| A 現状維持 | ◯ | ◯（一次のみ）| ✗ | ✗ | ✗ | 0 | — |
| B 理由のみ明確化 | ◎ | ◯（一次のみ）| ✗ | ✗ | ✗ | 小 | △ |
| C 統一誘導 | ◯ | ✗ | ◎ | ◎ | ◎ | 小 | ◯ |
| **D 条件別分岐** | **◎** | **◎** | **◎** | **◎** | **◎** | **小〜中** | **◎** |
| E 自動連鎖 | ◯ | △ | ◎ | ◎ | ◎ | 大 | ✗ |

---

## 6. 推奨案

### 6.1 第一推奨: **案 D（条件別メッセージ分岐）**

タスク初期仮説では案 C を第一推奨としていたが、**現状コード確認の結果、一次禁止の「対戦相手変更」soft recovery が運用上重要**（results を消さずに済む唯一の path）と判断したため、**案 D を推奨**する。

**採用理由**:
1. 一次禁止 alert が「対戦相手変更」を **第一案として温存**（results 保持を希望する運営者の選択肢を保つ）
2. 一次禁止 alert に「大会進行データをリセット」を **第二案として併記**（reset 込みでまとめてやり直したい場合のための path）
3. 二次禁止 alert で「リセット」を「大会進行データをリセット」に具体化し、`#resetBtn` との混同を防止
4. 両 alert で「参加者一覧は残したまま」を明示し、PR #114 alert / `#resetProgressBtn` confirm と **語彙整合**
5. 既存 `removePlayer()` の **判定ロジック・early return 構造を変更しない**（文言差し替えのみ）
6. 実装規模は alert 2 箇所の文字列更新 + 軽量テスト追加（+5〜15 行）

### 6.2 第二推奨（簡易フォールバック）: **案 C**

案 D の実装で運営者から「文言が長い」「対戦相手変更も reset も両方出てくると迷う」とフィードバックが出た場合、**案 C への簡易化** を後続フォールバックとして残す。

### 6.3 採用しない: 案 A / B / E

- 案 A: 現状の曖昧さを温存する積極的理由なし
- 案 B: 誘導が不足し、運営者が次にどうすべきか分からない
- 案 E: 自動連鎖は destructive 操作の誤発火リスクが大きく、IMPL-LIGHT の範囲を超える

### 6.4 文言確定文（案 D）

#### 6.4.1 一次禁止 alert（`removePlayer` [L3769](../../shogi_v4.html) 相当）

```
<氏名>は現在の組み合わせに登録されているため削除できません。

別の選手に差し替える場合は「対戦相手変更」を実行してください。
参加者一覧から削除したい場合は、先に「大会進行データをリセット」を実行してください。
大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。
```

**変更点（vs 現状）**:
- 「進行中の対局」→「現在の組み合わせ」（用語統一、`#startBtn`/`#resetProgressBtn` 系の語彙と整合）
- 「先に『対戦相手変更』で別の選手に差し替えてから削除してください」→ 第一案として残す + 第二案として `#resetProgressBtn` を併記
- 「参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます」明示

#### 6.4.2 二次禁止 alert（`removePlayer` [L3781](../../shogi_v4.html) 相当）

```
<氏名>には過去<N>試合分の勝敗結果があるため削除できません。

参加者を削除する場合は、先に「大会進行データをリセット」を実行してください。
大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。
```

**変更点（vs 現状）**:
- 「過去N試合分の対戦履歴」→「過去N試合分の勝敗結果」（用語統一、`state.results` 由来であることが直感的）
- 「大会開始後は削除できません」削除（state.started 状態の言及は実装詳細寄り、ユーザ向けには不要）
- 「誤って登録した場合は『リセット』で大会をやり直してください」→ 「先に『大会進行データをリセット』を実行してください」具体化
- 「参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます」明示

---

## 7. IMPL-LIGHT 実装範囲

### 7.1 やる（含める）

- [`removePlayer()`](../../shogi_v4.html) ([L3761-3803](../../shogi_v4.html)) 内の **2 つの alert 文言を案 D 確定文に置換**:
  - 一次禁止 alert（L3769 相当）
  - 二次禁止 alert（L3781 相当）
- 既存 alert 構造（早期 return / 順序 / 判定式）は **変更しない**（文字列リテラルの差し替えのみ）
- 軽量テスト追加（`test/test_remove_player_guard_message.js` 仮称、または既存 `test_reception_ux_start_button_guard.js` に追加）:
  - 一次禁止 alert に「現在の組み合わせ」「対戦相手変更」「大会進行データをリセット」「参加者一覧は残したまま」が含まれる
  - 二次禁止 alert に「勝敗結果」「大会進行データをリセット」「参加者一覧は残したまま」が含まれる
  - 既存判定式 `state.started && pastMatches>0` が維持されている
  - 既存 early return / 判定順序が維持されている
  - 既存 alert 数が変わっていない（2 個のまま）
  - 削除成功経路（`state.players[cls]=filter` / `renderRegList()` / `save()` / `verifyPlayerAbsent`）が維持されている
- `test/run_tests.sh` に stanza 追加（テスト分離した場合）
- HANDOFF.md 更新（実装着地 entry）
- 本 design doc に §17「実装着地ノート」追記

### 7.2 やらない（含めない、IMPL-MEDIUM 以降）

- **`removePlayer()` の判定ロジック変更**（`state.pairings[cls]` メンバーシップ / `state.started && pastMatches>0` の条件式は維持）
- **自動部分リセット実行**（案 E、alert + confirm 連鎖、destructive 連鎖リスク）
- **専用モーダル化**（alert + ボタン 2 個の UI、IMPL-LIGHT には重い）
- **UI ボタン追加**（モーダル内の「大会進行データをリセット」ボタン等）
- `resetTournamentProgressOnly()` の仕様変更
- `resetAll()` の仕様変更
- `startTournament()` guard 条件変更
- `changePairing` モーダルの仕様変更（「対戦相手変更」path 自体は触らない）
- localStorage schema 変更
- pairing algorithm 変更
- `state.results` の構造変更
- 参加者番号再採番
- 大会履歴保存
- undo 実装
- DISPLAY-LABELS-IMPL-LIGHT / WARNING Phase 2〜4 への進行
- 既存 `#resetBtn` / `#resetProgressBtn` 文言変更
- 既存 `resetAll` / `resetTournamentProgressOnly` confirm 文言変更
- VRT snapshot 自律更新

### 7.3 想定変更ファイル（IMPL-LIGHT）

- `shogi_v4.html`（+5〜15 行、alert 文言 2 箇所更新）
- `test/test_remove_player_guard_message.js`（新規、+80〜120 行）or 既存テスト更新
- `test/run_tests.sh`（+10 行 stanza、テスト分離した場合）
- `HANDOFF.md`（+1 行 entry）
- 本 design doc（§17 実装着地ノート追記）

### 7.4 想定変更しないファイル（IMPL-LIGHT）

- `index.html` / `data/`
- `.github/workflows/`
- `package.json` / `package-lock.json`
- `playwright.config.js`
- `docs/specs/`
- `test/e2e/`（既存 E2E が alert 文言を locator として持つ場合のみ追従更新が要、未確認）
- VRT snapshot（alert は overlay でスクリーンショットには通常映らない見込み）

---

## 8. テスト方針

### 8.1 静的検査（最小、新規 / 更新テストで実施）

- `removePlayer()` 関数本体抽出
- 一次禁止 alert 文言に **以下の語句を含む**:
  - 「現在の組み合わせ」
  - 「対戦相手変更」
  - 「大会進行データをリセット」
  - 「参加者一覧は残したまま」
  - 「組み合わせ・勝敗結果は削除」
- 二次禁止 alert 文言に **以下の語句を含む**:
  - 「勝敗結果」
  - 「大会進行データをリセット」
  - 「参加者一覧は残したまま」
  - 「組み合わせ・勝敗結果は削除」
- 二次禁止 alert 文言が **「<N>試合」** 形式の動的文字列を維持（`pastMatches` 値の埋め込みが消えていない）
- 判定式 `if(inPairings)` / `state.started && pastMatches>0` が維持
- 早期 return が 2 箇所維持（一次禁止 / 二次禁止）
- 削除成功経路の主要処理が維持:
  - `state.players[cls]=arr.filter(...)`
  - `if(_pendingNewYomi)delete _pendingNewYomi[id]`
  - `renderRegList()`
  - `save()`
  - `verifyPlayerAbsent(id,cls)` / `notifySaveWarning(...)`
- `resetTournamentProgressOnly()` 本体は変更されていない（helper の存在 + ボタン名 + 「触らない」項目への代入なきこと、PR #114 テストと同等観点）
- `resetAll()` 本体は変更されていない
- `startTournament()` guard 条件 `state.started===true` 維持
- localStorage schema 維持
- pairing algorithm 維持

### 8.2 振る舞いテスト（軽量 mock、任意）

```
case1: state.pairings.A=[ペアに id 含む]、state.results.A=[] で removePlayer(id, 'A')
  → 一次禁止 alert 1 回、state.players 不変、alert 文言が案 D 一次禁止文言と一致

case2: state.pairings.A=[]、state.results.A=[[id 含む R1 結果]]、state.started=true
       で removePlayer(id, 'A')
  → 二次禁止 alert 1 回、state.players 不変、alert 文言が案 D 二次禁止文言と一致

case3: state.pairings.A=[]、state.results.A=[]、state.started=false で removePlayer(id, 'A')
  → confirm OK で state.players.A.length が 1 減る

case4: 部分リセット後（state.pairings/results 空、state.started=false）で removePlayer(id, 'A')
  → 一次禁止/二次禁止スキップ、confirm 経由で削除可（PR #114 §11.2 case4 と整合）
```

### 8.3 既存テスト退行確認

- `test/test_reception_ux_start_button_guard.js`（PR #114 で更新、alert 文言は変えない想定 → 影響なし）
- `test/test_reset_ux_partial_reset.js`（PR #114 新規、`#resetProgressBtn` / `resetTournamentProgressOnly` は本タスクで変更しない → 影響なし）
- `test/test_pairing_ux_*` 各種（`removePlayer` を直接呼ばない、影響なし見込み）
- その他の既存テスト（影響なし見込み）

### 8.4 E2E

- 既存 E2E が `removePlayer` alert 文言を `toContainText` 等で expect している場合は追従更新が要 → **IMPL-LIGHT 実装時に `grep -r '進行中の対局' test/e2e/` で事前確認**
- 必要なら追加 1 ケース: 「進行データありの状態で削除試行 → 二次禁止 alert → 大会進行データをリセット → 再度削除成功」

### 8.5 VRT

- alert dialog は通常 overlay で表示され、Playwright の `toHaveScreenshot` には含まれにくい → snapshot mismatch 見込みなし
- 万一 red になった場合は自律更新せず判断を仰ぐ（PR #105 / #109 / #114 の流れ）

---

## 9. リスク

### 9.1 文言関連

| リスク | 対策 |
|---|---|
| alert 文言が長くなり、スマホで読みにくい | 一次禁止 5 行、二次禁止 4 行に抑制。実機確認で許容範囲か確認 |
| 「大会進行データ」が運営者に伝わりにくい | PR #114 で導入した語彙であり、`#resetProgressBtn` ボタン名と一致。alert 文言で繰り返し露出することで定着を促す |
| 既存 `#resetBtn` 「大会データをリセット」と混同 | alert 文言で **「大会進行データをリセット」を鍵括弧つきで明示**、`#resetProgressBtn` 文言と完全一致 |
| 一次禁止で 2 つの選択肢（対戦相手変更 / 大会進行データをリセット）を提示すると運営者が迷う | 第一案を「対戦相手変更」、第二案を「大会進行データをリセット」と順序明示。「別の選手に差し替える場合」「参加者一覧から削除したい場合」と条件分けで判断容易化 |
| 二次禁止 alert で「リセット」表現を消すことで既存運営者が戸惑う | 新文言で具体化することによる利益（誤押下抑止）が、戸惑い（語彙変化）を上回ると判断。実機確認で観察 |

### 9.2 削除不可理由の伝達

| リスク | 対策 |
|---|---|
| 一次禁止か二次禁止かが運営者に区別つかない | 案 D で **条件別文言** を採用、それぞれ「現在の組み合わせ」/「勝敗結果」と理由を明示分け |
| 「過去<N>試合分」の N が大きいと運営者が驚く | 既存挙動を維持（N は実数値）。「過去」を「これまでの」に変えるかは観察後判断（IMPL-MEDIUM 候補） |

### 9.3 実装関連

| リスク | 対策 |
|---|---|
| alert 文言変更で `test/e2e/` が red になる | IMPL-LIGHT 着手時に `grep -r '進行中の対局\|対戦履歴があるため' test/e2e/` で事前確認、必要なら追従更新 |
| `state.started && pastMatches>0` 判定式の変更を誤って混入させる | テストで「条件式維持」を静的検査で保証 |
| 一次禁止と二次禁止の順序を入れ替えてしまう | テストで「early return 2 箇所 / 順序維持」を静的検査で保証 |
| 削除成功経路（filter / save / verify）を誤って変更 | テストで「成功経路主要処理が維持されている」を静的検査で保証 |

### 9.4 後続観察

| リスク | 対策 |
|---|---|
| 案 D 採用後、運営者から「文言が長い」フィードバック | 第二推奨 案 C への簡易化を IMPL-MEDIUM で再検討 |
| 「対戦相手変更」path 提示と「大会進行データをリセット」path 提示の使い分けがうまくいかない | 観察後、案 E（自動連鎖）を IMPL-MEDIUM で再検討、もしくは専用モーダル化 |

---

## 10. 後続タスク候補

| 優先 | タスク | スコープ | 着手判断 |
|---|---|---|---|
| 第一 | `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT` | `removePlayer()` 内 2 alert 文言を案 D 確定文に置換 + 軽量テスト | **本 DESIGN 着地直後**、運営者最終確認後 |
| 第二 | 運用観察 | 新文言で `#resetProgressBtn` 誘導が機能するか / `#resetBtn` 誤押下が消えるか / 「対戦相手変更」path が引き続き機能するか | IMPL-LIGHT 着地後 |
| 第三 | `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM`（案 E）| alert + confirm 連鎖で自動部分リセット実行 | 観察結果で「reset 誘導が回りくどい」と判明した場合 |
| 第四 | `REMOVE-PLAYER-MODAL-DESIGN` | 削除不可時の専用モーダル化、対戦相手変更 / 進行データリセット のボタンを 1 画面に | 観察結果で alert UI 限界が見えた場合 |
| 第五 | `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（既出、PR #113 §10.2）| 既存 `#resetBtn` 文言「大会データを全リセット」化 + `resetAll` confirm §7.2 F-1 | 観察後 |

---

## 11. 当面やらないこと

- 実装着手（IMPL-LIGHT は本 DESIGN 着地後、別 PR で起票）
- `removePlayer()` 判定ロジック変更
- 自動部分リセット連鎖（案 E）
- 専用モーダル化
- UI ボタン追加
- `resetTournamentProgressOnly()` / `resetAll()` 仕様変更
- `startTournament()` guard 条件変更
- `changePairing` モーダル変更
- localStorage schema 変更
- pairing algorithm 変更
- `state.results` 構造変更
- 参加者番号再採番
- 大会履歴保存
- undo 実装
- 既存 `#resetBtn` / `#resetProgressBtn` 文言変更
- 既存 `resetAll` / `resetTournamentProgressOnly` confirm 文言変更
- VRT snapshot 更新
- CI 設定変更
- WARNING Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT / CANDIDATE-FILTER 後続
- `RECEPTION-UX-RESTART-WIZARD-DESIGN`（PR #111 案 E）

---

## 12. 結論

### 12.1 推奨案

**案 D（条件別メッセージ分岐）** を IMPL-LIGHT で採用。

- 一次禁止 alert: 「対戦相手変更」第一案 + 「大会進行データをリセット」第二案、「参加者一覧は残したまま」明示
- 二次禁止 alert: 「大会進行データをリセット」のみ案内、「参加者一覧は残したまま」明示
- 既存判定ロジック・early return 構造・削除成功経路は **温存**

### 12.2 推奨 Next Action

**`REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT`** を本 DESIGN 着地直後に即起票可能。

スコープ:
- `removePlayer()` の 2 alert 文言を §6.4 確定文に置換（+5〜15 行）
- 軽量テスト 1 本（`test/test_remove_player_guard_message.js` 新規）+ `test/run_tests.sh` stanza
- HANDOFF.md 1 行 entry
- 本 design doc に §17 実装着地ノート追記

着手判断:
- 運営者最終確認（文言の最終形）
- `grep -r '進行中の対局\|対戦履歴があるため' test/e2e/` で E2E への影響事前確認

DESIGN は本ドキュメントに集約。IMPL-LIGHT 着地時に §17 として「実装着地ノート」を追記する想定（PR #109 / #112 / #114 と同じ構成）。
