# PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-DESIGN — 手動変更候補フィルタの設計方針

**Task ID**: `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-DESIGN`
**作業種別**: docs-only / design check / manual pairing change candidate filter
**HEAD**: `5f63219`（PR #107 squash merge 後の main）
**前提 PR 系列**:
- PR #99 `PAIRING-UX-INVENTORY`
- PR #100 `PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN`
- PR #101 `PAIRING-UX-DISPLAY-HELPER-DESIGN`
- PR #102 `PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT`
- PR #103 `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`
- PR #104 `PAIRING-UX-SCORE-LIST-READABILITY-DESIGN`
- PR #105 `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT`
- PR #106 `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-DESIGN`
- PR #107 `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT`

---

## 1. 目的と非目的

### 1.1 目的

- 対局管理画面「対戦相手の変更」モーダルで、運営者が **プルダウンの選択肢を見ても、選ぶと多くがエラー** になる現状を整理する
- 候補表示・候補フィルタの設計方針（**選択可能 / 選択不可 / 理由表示**）を決める
- エラーを **出してから戻す** のではなく、**事前に分かる** 状態を作る方針を、案 A〜E で比較する
- 再戦ポリシー（replace 経路 confirm 続行可能 / swap 経路 alert + return hard block）の **現行非対称** を実態として明文化する
- 次最小実装 `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT` の **スコープを限定**（候補集合の表示・分類・disabled 化・理由表示に閉じる）

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only design check）
- `shogi_v4.html` / `test/` / `test/e2e/` / Visual Regression snapshot を変更しない
- 例外許可トグル / 再戦 confirm 仕様変更 / select 廃止 / 推薦 / 状態機械化 / 複数選手同時変更 は本 DESIGN のスコープ外（CONTROL / RULES / IMPL-MEDIUM 以降の別タスク候補）
- `evaluatePairingQuality()` / `warning object` / pairing algorithm を変更しない
- `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` 本体を変更しない
- PR #107 で着地した「現在の対局」表示 / `<select>` reset / 文言改善 を退行させない
- `DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4 / SCORE-LIST 切替 UI 等の **後続タスクに踏み込まない**

---

## 2. 背景 — PR #106 / #107 着地後に残る現場課題

PR #106 / #107 で改善済みの点:

- モーダル冒頭に「現在の対局」表示（[`buildChangePairingModalHtml`](shogi_v4.html:4689)）
- エラー時に `<select>` を元値へ自動リセット（[`bindChangePairingModalEvents`](shogi_v4.html:4732)）
- UI 文言から `swap` 内部用語を全除去、運営者向けに更新
- `state.pairings` 管理 / `save()` / `renderTournament()` 設計は無変更（既にエラーパスで state 不変）

残る現場課題:

- プルダウンには候補者が **多数表示** される（クラス全員に近い）
- しかし実際に選ぶと、**多くがエラー** になる
- 場合によっては「**どれを選んでもエラー**」のように感じる
- PR #107 でエラー文言と select reset は改善したが、運営者は **エラー → 元に戻る → 別候補を試す** のループを強いられる
- 大会中の操作負担が大きい
- 原因として、[`changePairing(cls, idx)`](shogi_v4.html:4825) が `state.players[cls]`（クラス全員）をほぼ無条件で `<select>` に流している可能性が高い

---

## 3. 現状コード確認

### 3.1 候補集合の生成 — 「クラス全員」をそのまま流している

[`changePairing(cls, idx)`](shogi_v4.html:4825):

```js
function changePairing(cls,idx){
  var match=state.pairings[cls][idx];
  if(match.winner){alert('結果入力済みのため変更できません');return;}
  var candidates=state.players[cls];        // ← クラス全員
  var html=buildChangePairingModalHtml(cls, idx, candidates, match);
  ...
}
```

[`buildChangePairingModalHtml`](shogi_v4.html:4689) は `candidates` をそのまま `<option>` 化する:

```js
for(var i=0;i<candidates.length;i++){
  var optLabel=entryNoOf(cls,candidates[i].id)+'｜'+candidates[i].name;
  opts+='<option value="'+candidates[i].id+'"'
       +(candidates[i].id===match.p1?' selected':'')+'>'
       +escapeHtml(optLabel)+'</option>';
}
```

**重要観察**:

- 候補は **クラス全員**（`state.players[cls]`、削除済み player は normalize 済で配列から除去されている）
- **フィルタリングは一切なし**（再戦・結果入力済・別対局所属・不戦勝 等の事前判定なし）
- 先手 select / 後手 select は **同じ候補集合**（[L4690-4701](shogi_v4.html:4690)）を共有
- 初期 selected 値: 先手 select は `match.p1`、後手 select は `match.p2`

### 3.2 選択後のエラー判定 — どこで弾いているか

[`bindChangePairingModalEvents(cls, idx)`](shogi_v4.html:4732) の click handler:

| 行 | 条件 | エラー種別 | state 影響 |
|---|---|---|---|
| [4749](shogi_v4.html:4749) | `newP1===newP2` | 同一選手 → `alert + return` | 未変更 |
| [4750](shogi_v4.html:4750) | `newP1===oldP1 && newP2===oldP2` | 差分なし → `alert + return` | 未変更 |
| [4755-4759](shogi_v4.html:4755) | 「先手も後手も両方変えた」 | 2 選手同時変更 → `resetSelectsToOriginal()` + `alert + return` | 未変更 |
| [4764-4766](shogi_v4.html:4764) | `otherIdx===-1`（replace 経路）+ `pairHasRematch(keepPlayer, X)` | 再戦 → **`confirm` で続行可能** | confirm OK 時のみ変更 |
| [4768](shogi_v4.html:4768) | replace 経路 正常 | state 変更（`{p1:newP1, p2:newP2, ...}`）| 変更 |
| [4771-4774](shogi_v4.html:4771) | swap 経路 + `otherPair.winner` | 相手ペア結果入力済 → `alert + return` | 未変更 |
| [4778-4782](shogi_v4.html:4778) | swap 経路 + `pairHasRematch(keepPlayer, X)` OR `pairHasRematch(droppedFromTarget, Y)` | swap 再戦 → `resetSelectsToOriginal()` + `alert + return`（**hard block**）| 未変更 |
| [4787](shogi_v4.html:4787) | swap 経路 正常 | confirm（変更前後表示）→ NG なら return | 確認後変更 |
| [4789-4793](shogi_v4.html:4789) | swap 経路 確定 | state 変更（2 ペア同時）| 変更 |
| [4795-4800](shogi_v4.html:4795) | swap 確定後 重複検出 | 内部エラー → `backup1`/`backup2` から **rollback** + `alert + return` | 変更 → 復元 |

**エラーパスの種類（=候補を「選べない理由」**):

1. **同一選手**（先手と後手に同じ player を選ぶ）
2. **差分なし**（変更がない）
3. **2 選手同時変更**（先手も後手も両方変えた）
4. **結果入力済の対局を持つ相手ペア**（swap 経路で `otherPair.winner` が確定）
5. **再戦**（`pairHasRematch` 命中、replace は confirm、swap は hard block）
6. **swap 後重複検出**（rollback 経路、安全網）

### 3.3 replace 経路と swap 経路の違い

| 経路 | 起動条件 | 再戦の扱い | 影響範囲 | 確認 UI |
|---|---|---|---|---|
| **replace** | `otherIdx===-1`（候補 X が他ペアに **属さない**）| `confirm` で続行可能（[L4765](shogi_v4.html:4765)）| 1 ペアのみ | confirm（はい/いいえ）|
| **swap** | `otherIdx!==-1`（候補 X が他ペアに **属する**）| **alert + return** の hard block（[L4780](shogi_v4.html:4780)）| 2 ペア 4 人 | 別途確認 confirm（[L4787](shogi_v4.html:4787)）|

**観察**:

- replace 経路: 候補 X が「現在どの対局にも入っていない人」のとき発動。1 ペアのみの差し替えなので、再戦判定は **operator 判断で続行可能**（confirm）。
- swap 経路: 候補 X が「他対局に既に入っている人」のとき発動。**2 ペア 4 人** に同時に影響するため、再戦が発生したら hard block（戻す方向の操作で別の歪みが生まれかねないため）。
- ただし「クラス内に当該ラウンドで未割当 player は存在しない」が通常運用（各 player は必ずどこかのペアに入る）→ **replace 経路は基本的に発動しにくい**。実態は「ほぼすべての変更が swap 経路」となる。

### 3.4 関連 helper（既存）

| 関数 | 行 | 役割 | 候補フィルタへの再利用可否 |
|---|---|---|---|
| `pairHasRematch(cls, p1, p2)` | [357](shogi_v4.html:357) | 過去ラウンド `state.results[cls]` を走査して再戦判定 | 再戦理由の事前判定にそのまま使える |
| `findPairContainingPlayer(cls, playerId, excludeIdx)` | [367](shogi_v4.html:367) | 当該ラウンド `state.pairings[cls]` で player を含むペアの idx を返す | 「他対局に属する＝swap 経路に入る」判定に使える |
| `getDuplicatePlayersInPairings(cls)` | [377](shogi_v4.html:377) | 当該ラウンド `state.pairings[cls]` に重複 player がいないか走査 | 重複検出（既存安全網）。事前フィルタには不要 |
| `entryNoOf(cls, id)` | [247](shogi_v4.html:247) | 番号文字列 | option label に使用済 |
| `formatParticipantLabel(player, opts)` | [304](shogi_v4.html:304) | `A-12 山田太郎` 等の整形 | 「現在の対局」表示で使用中 |
| `getName(id, cls)` | [231](shogi_v4.html:231) | 氏名のみ | 既存 confirm 文言で使用中 |
| `getNameWithNo(id, cls)` | [281](shogi_v4.html:281) | `01｜山田太郎` 形式 | 既存 option label の互換書式 |
| `escapeHtml(...)` | （略）| XSS 対策 | option label / 理由 ラベル両方で必須 |

### 3.5 まとめ — 現状の問題構造

| 観点 | 実態 |
|---|---|
| 候補集合 | `state.players[cls]` 全員（フィルタなし）|
| 事前判定 | なし（option レベルに「選択可能 / 選択不可」の区別なし）|
| 事後判定 | click handler で 6 種類のエラーパス |
| エラー UI | alert + return（PR #107 で `<select>` reset + 改善文言）|
| 既存助け | 「現在の対局」表示（PR #107）/ select reset / 文言改善 |
| 候補数 | 仮に A クラス 24 名で 1 対局を変えるとき、両 select に 24 候補がずらり並ぶ |
| 体感 | 「どれを選んでもエラーになる」（実態は「数件しか選べない」）|

→ **候補集合の事前フィルタが未実装** であることが、エラー多発の構造的原因。

---

## 4. 比較する案

### 4.1 案 A — 選択可能な人だけ表示する（フィルタ後の集合のみ）

#### 概要
事前判定で「選択 OK」と分類された player のみ option として表示。`<select>` には disabled なし。

#### メリット
- エラーが大幅に減る（理論上はほぼゼロ）
- 操作がシンプル
- スマホでもリスト短く読みやすい
- IMPL-LIGHT として実装が一番軽い（option ループに早期 continue 1 つ追加）

#### デメリット
- なぜ消えたか分からない（透明性なし）
- 運営者は「あの人が候補にいない、なぜ？」と不安になる
- 実装ミスで「本来選べるべき人」が消えても気づきにくい
- 現場判断の余地が狭くなる（運営者は「ルール違反を承知でこの組み合わせにしたい」が選べない）

### 4.2 案 B — 全員表示し、選択不可候補は `disabled + 理由付き`

#### 概要
クラス全員を option に出すが、選択不可者には `disabled` 属性 + ラベルに理由 `（再戦）` 等を併記。

#### メリット
- 候補が見える（誰がいるか把握可能）
- 選べない理由が分かる（透明性高い）
- エラーを事前に防げる（disabled は OS 側で選択不可化）
- 「実装ミスで消えた」事故を起こしにくい

#### デメリット
- disabled が多いと見づらい（24 名中 18 名 disabled だと長いスクロール）
- select 内の理由文が長いとスマホで読みにくい（picker の表示幅依存）
- `disabled option` / `optgroup` のスタイルは **端末依存**（iOS Safari / Android Chrome で見え方が違う）
- 「現在の相手」「同じ選手」など、そもそも option に出さなくてよい者が並ぶ無駄

### 4.3 案 C — 選択可能候補を上、選択不可候補を下に分ける（optgroup 分離）

#### 概要
`<optgroup label="選択可能">` と `<optgroup label="選択できない候補">` に分け、後者の option は `disabled` + 理由付き。

#### メリット
- 操作対象が上にまとまる（実用最重要候補は上 N 件で完結）
- 選択不可理由も見える（透明性は維持）
- 案 A と案 B のバランスが良い
- 現場で「まず上だけ見ればよい」運用が成立する

#### デメリット
- `optgroup` / `disabled separator` の見え方は端末依存（特に iOS Safari の picker UI）
- スマホで group label が省略表示される機種もある
- 実装が案 A / B より少し増える（区切りロジック + ラベル）

### 4.4 案 D — 現状維持 + エラー文言改善のみ（PR #107 既着地）

#### 概要
PR #107 が既に行ったこと（文言改善 / `<select>` reset / 「現在の対局」表示）に留め、候補集合は触らない。

#### 評価
- PR #107 で「抜けられない」体感は大幅軽減した（select reset で迷子になりにくい）
- しかし「**どれを選んでもエラー**」体験の **根本解決には不足**
- 試行錯誤の回数は減らせていない
- → **D 単独は本タスクでは非推奨**（PR #107 をやり直す意味になる）

### 4.5 案 E — 通常は選択可能候補のみ、トグルで全候補表示に切替

#### 概要
デフォルトは案 A（選択可能のみ）。`[全候補を表示]` トグルで案 B / C へ切替できる。

#### メリット
- 通常操作はシンプル（案 A の利点）
- 例外時に全体確認できる（案 B の利点）

#### デメリット
- UI が複雑（モーダル内に追加 toggle）
- IMPL-LIGHT には重い
- toggle の状態（永続化するか / モーダル毎にリセットするか）の議論が出る
- 後続で state machine 化や永続化を求められやすい
- 「2 段階の表示モード」は運用説明の負担も増える

### 4.6 比較表

| 案 | エラー減少 | 透明性 | スマホ適性 | 実装コスト | 推奨度（IMPL-LIGHT）|
|---|---|---|---|---|---|
| A. 選択可能のみ | ◎ | × | ◎ | 最低 | 候補（条件付）|
| B. 全員 + disabled | ◯ | ◎ | △ | 低 | 候補 |
| **C. 上下分離（optgroup）** | ◎ | ◎ | ○ | 中 | **第一候補（仮）** |
| D. 文言のみ（既着地）| × | — | — | — | 非推奨（やり直し）|
| E. トグル切替 | ◎ | ◎ | ○ | 高 | 後続（IMPL-MEDIUM）|

---

## 5. 推奨案 — 案 C を中核、ただしスマホ耐性で案 A に縮退可

### 5.1 第一候補（推奨）

**案 C + 案 B のハイブリッド = `optgroup` で「選択可能」「選択できない候補」を分け、後者は disabled + 短い理由**

具体構造:

```html
<select id="chg-p1">
  <optgroup label="選択可能">
    <option value="...">A-12 山田太郎</option>
    <option value="..." selected>A-07 鈴木次郎</option>
    ...
  </optgroup>
  <optgroup label="選択できない候補">
    <option value="..." disabled>A-18 佐藤一郎（選ぶと再戦）</option>
    <option value="..." disabled>A-21 鈴木次郎（2人同時入替）</option>
    <option value="..." disabled>A-25 田中三郎（結果入力済）</option>
    ...
  </optgroup>
</select>
```

#### 採用理由

- native select を維持（IMPL-LIGHT 範囲内）
- 候補は完全には消さない（透明性確保、運営者の不安を回避）
- 選択不可候補に短い理由ラベル付き（事前に「選べない」と分かる）
- 「現在の対局」表示（PR #107）と整合
- 既存エラー処理は **安全網として残す**（実装ミスで誤って enabled になっても弾ける）

### 5.2 スマホ耐性のフォールバック方針

`disabled option` / `optgroup` がスマホ picker で読みにくい場合は、**案 A 系へ縮退** する代替を IMPL-LIGHT 内で確認する:

- 案 A 縮退時の補足: モーダル下部に **「選択できない候補（理由付き）」リスト** を独立要素として併記
- これにより「上の select に出ていない人がなぜ消えたか」が分かる
- どちらに倒すかは **IMPL-LIGHT 実装時の実機確認** で判断（VRT では決まらない）

### 5.3 やらないこと（本タスクの推奨案には含めない）

- 選択肢の自動推薦（最適入替候補のサジェスト）
- 詳細理由パネル（モーダル内 expand）
- 変更前後差分のリアルタイム表示
- 例外許可トグル（CONTROL タスク）
- select 廃止（IMPL-MEDIUM）

---

## 6. 再戦ポリシー — 現行非対称の明文化

### 6.1 まず現状の正確な記述

**重要前提**: PR #106 / #107 docs の中で *warning* と呼んでいたものは、**実装上は alert / hard block** であり、用語の混乱が docs 内に残っている。本ドキュメントは **実装挙動** を優先する。

#### replace 経路の再戦（[L4764-4766](shogi_v4.html:4764)）

```js
if(pairHasRematch(cls, keepPlayer, X)){
  if(!confirm('この組み合わせは過去に対戦済みです。再戦として保存しますか？'))return;
}
state.pairings[cls][idx]={p1:newP1,p2:newP2,winner:null,lastModifiedBy:'manual'};
```

- **`confirm` で続行可能**（運営者が「はい」を押せば再戦として保存）
- 影響範囲: **1 ペア（2 人）のみ**
- 文言: 「過去に対戦済みです。再戦として保存しますか？」

#### swap 経路の再戦（[L4778-4782](shogi_v4.html:4778)）

```js
if(pairHasRematch(cls, keepPlayer, X) || pairHasRematch(cls, droppedFromTarget, Y)){
  resetSelectsToOriginal();
  alert('この変更を行うと、再戦になる組み合わせが発生します。\n選択を元に戻しました。別の選手を選び直してください。');
  return;
}
```

- **`alert + return` の hard block**（続行不可、運営者は別候補を選び直す必要あり）
- 影響範囲: **2 ペア（4 人）**
- 文言は PR #107 で改善済（「再戦になる組み合わせが発生します」）

### 6.2 比較する案

| 案 | 概要 | 評価 |
|---|---|---|
| **6-1. 現行どおり明文化**（推奨）| replace = confirm 続行可能、swap = hard block。両者の非対称を docs に明示 | ◎ IMPL-LIGHT の前提に整合、退行なし |
| 6-2. 再戦を完全禁止 | replace も hard block にする | × 大会後半でデッドロック復旧が困難に / 大会運用に不適 |
| 6-3. 再戦を原則禁止 + 例外許可トグル | デフォルト hard block、トグル ON で confirm | △ IMPL-LIGHT スコープ外（CONTROL 別タスク）|
| 6-4. 両方 confirm 続行可能 | swap も confirm にする | × 2 ペア 4 人への影響を 1 つの confirm でしか伝えられない、危険 |
| 6-5. replace / swap で別文言・別 UX | 既に分かれている、整理してから別タスクで深掘る | △ 本 DESIGN では現状記述に留め、IMPL-MEDIUM 候補 |

### 6.3 推奨方針（本 DESIGN）

**6-1 を採用。replace = confirm 続行可能 / swap = hard block を維持し、本 docs で実態を明文化する。**

#### 根拠

- replace 経路は **1 ペアの判断**。operator が承知の上で「再戦保存」を選ぶ余地は合理的
- swap 経路は **2 ペア 4 人** に影響。1 つの confirm で説明する情報量を超える
- swap 経路で再戦を許容すると、入れ替え後の重複検出パスが複雑化し、`backup1`/`backup2` rollback の意味が薄れる
- 現行の非対称は **大会運用の現実（後半でのデッドロック復旧 vs 過剰な歪み）に合理的**

### 6.4 候補フィルタへの反映方針

| 経路 | 再戦候補の扱い | 表示 |
|---|---|---|
| replace 経路（候補 X が他ペアに属さない）| **selectable + 注釈**（disabled にしない）| `A-18 佐藤一郎（選ぶと再戦）` を選択可能 optgroup に置く（または独立 optgroup） |
| swap 経路（候補 X が他ペアに属す）| **disabled + 理由**（hard block と整合）| `A-18 佐藤一郎（入替で再戦）` を選択不可 optgroup に置く |

ただし運用上、ほぼすべての変更が swap 経路（§3.3 末尾観察）なので、**replace 経路 selectable** が表示される機会は少ない。

→ **IMPL-LIGHT では「現実装で hard block されるものを disabled、confirm 可能なものを selectable」というルールで実装する**。これで運営者の体験は「disabled が多いがクリアな理由付き」となり、操作回数が激減する。

### 6.5 用語整理

| 用語 | 実装上の意味 | 用例 |
|---|---|---|
| **error** | `alert + return`（または rollback + alert + return）の hard block | 2 選手同時 / swap 再戦 / 内部重複 |
| **warning** | `confirm`（続行可能）| replace 再戦 |
| **alert UI** | OS の `alert()` ダイアログ | error / warning 共通の UI |

PR #106 / #107 docs では `warning` を hard block の文脈で使った箇所があるが、**本 docs 以降は error / warning を上記で区別** することを推奨。

---

## 7. 選択不可理由 — 一覧と優先順位

### 7.1 理由カタログ

| ID | 表示文（select 内、8〜12 文字目安）| 何が判定されるか | 経路 |
|---|---|---|---|
| ~~`R-current`~~ | **UI ラベルなし（§7.1.1 参照）** | 現 p1 / p2 は **`ok` 扱い + `selected`** で「選択可能」optgroup に置く。disabled にせず、理由ラベルも付けない | — |
| `R-self` | （同じ選手）| 先手/後手の対 select で重複選択不可 | 事後判定（[L4749](shogi_v4.html:4749)）|
| `R-deleted` | （削除済）| `state.players[cls]` から消えている | normalize 後に該当ゼロ、無視可 |
| `R-invalid` | （不正ID）| ID が players[cls] に存在しない | normalize 後に該当ゼロ、無視可 |
| `R-bye` | （不戦勝）| 不戦勝枠（仮にあれば）| 現行データモデルに未定義（保留）|
| `R-winner-locked` | （結果入力済）| swap 経路で `otherPair.winner` が確定 | 事後判定（[L4771](shogi_v4.html:4771)）|
| `R-both-swap-needed` | （2人同時入替）| 「先手も後手も両方変える」状態（select 値の組合せ依存）| 事後判定（[L4755](shogi_v4.html:4755)、**option レベルでは事前判定困難**）|
| `R-rematch-swap` | （入替で再戦）| swap 経路 + `pairHasRematch` 命中 | 事後判定（[L4778](shogi_v4.html:4778)）|
| `R-rematch-replace` | （選ぶと再戦）| replace 経路 + `pairHasRematch` 命中 | 事後判定（[L4764](shogi_v4.html:4764)、ただし confirm 続行可）|
| `R-other` | （選択不可）| 上記に該当しないがエラーになる場合の汎用 | 安全網 |

### 7.1.1 現 p1 / p2 の最終扱い（**確定**）

PR #108 cowork review Should Fix を受け、現 p1 / p2 の扱いを以下で確定する。後続 IMPL-LIGHT 着手時の再議論を防ぐため、設計の前提として明文化する。

| 観点 | 結論 |
|---|---|
| 分類 status | **`ok`**（`blocked` / `warn-confirmable` ではない）|
| 配置 optgroup | **「選択可能」**（「選択できない候補」ではない）|
| `selected` 属性 | **付与する**（先手 select は `match.p1`、後手 select は `match.p2` を selected。§9.1 と整合）|
| `disabled` 属性 | **付けない** |
| 理由ラベル | **付けない**（`（現在の相手）` / `（現在選択中）` 等は出さない）|
| UI 用 `R-current` ラベル | **使わない**（カタログ上は ~~取り消し線~~ で残し、内部分類のみ）|

#### 理由

- **PR #107 で既にモーダル上部に「現在の対局」表示が追加済み**。select option 側に「現在の相手」「現在選択中」などを出すと **情報が重複し、表示がうるさくなる**。
- **「変更なし保存」は既存の `alert('変更がありません')`（[L4750](shogi_v4.html:4750)）で十分**に扱える。候補フィルタ側で別理由ラベルを出す必要はない。
- 現 p1 / p2 を `disabled` にすると、運営者は「選び直しの起点として現在の選手を再選択し直す」操作（誤クリック復帰など）が取れなくなる。`ok` + `selected` のままが自然。

#### `classifyChangePairingCandidate` の戻り値（現 p1 / p2 のケース）

```js
// candidateId === match.p1（先手 select の現選手、role='p1'）
// candidateId === match.p2（後手 select の現選手、role='p2'）
{ status: 'ok', reasonId: null, reasonLabel: '' }
```

- `reasonId` は `'R-current'` を返さない（=`null` または未設定）
- `reasonLabel` は空文字（option label に括弧書きを付けない）
- 既存 click handler 側の「差分なし」判定（[L4750](shogi_v4.html:4750)）には影響しない

### 7.2 優先順位（複数該当時の表示優先度）

複数理由が同時に成立する可能性があるため、上位から表示:

1. `R-invalid` / `R-deleted`（あり得ないがあれば最優先）
2. `R-self`（先手・後手の対 select 重複選択防止）
3. `R-winner-locked`（swap 経路で確定結果ペアに含まれる）
4. `R-both-swap-needed`（事前判定不能なので **理由として表示しない**、§7.4）
5. `R-rematch-swap`（入替で再戦、hard block）
6. `R-rematch-replace`（選ぶと再戦、confirm 可能、selectable に置く）
7. `R-other`（安全網）

**注**: `R-current` は優先順位リストから外す（§7.1.1 の通り、UI ラベルを出さないため）。仮に内部分類として `R-current` を判定しても、`status: 'ok'` を返すだけで UI 表示には影響しない。

### 7.3 表示例（推奨）

```
（選択可能）
A-07 鈴木次郎
A-12 山田太郎
A-18 佐藤一郎（選ぶと再戦）  ← R-rematch-replace（selectable + 注釈）
（選択できない候補）
A-21 鈴木次郎（2人同時入替）  ← R-both-swap-needed（注: §7.4）
A-25 田中三郎（結果入力済）   ← R-winner-locked
A-30 中村四郎（入替で再戦）   ← R-rematch-swap
```

理由文は短く（**8〜12 文字目安**）。それ以上の説明はモーダル下部の補足エリアに回す（IMPL-LIGHT スコープ内に含める）。

### 7.4 重要 caveat — `R-both-swap-needed` は事前判定が困難

「2 人同時入替」は **先手 select / 後手 select の組合せ** で初めて成立する判定なので、**option レベル（片方の select の事前判定）では確定できない**。

事前判定の選択肢:

- **a. 表示しない**: option 側では `R-both-swap-needed` を理由として出さず、もう片方の select の `change` イベントで再計算する（IMPL-LIGHT スコープ外）
- **b. 静的判定で近似**: 「先手 select で出す候補は『後手を変えずにこの候補に変えると 2 人同時入替になる人』を事前に弾く」近似ルールを敷く。ただし運営者が後手も変えたい場合は窮屈
- **c. 事後判定に任せる**: 候補としては並ぶが、選んだ瞬間に既存の事後判定で弾く（PR #107 の select reset + 文言で十分）

**IMPL-LIGHT 推奨**: **c. 事後判定に任せる**（PR #107 の既存安全網で対応）。`R-both-swap-needed` は理由カタログにあるが、**option 表示には使わない**。理由欄は「同時入替」現象が起きたときの alert 文言で説明する。

### 7.5 `escapeHtml` 経由必須

option label に理由を含めるとき、**必ず `escapeHtml(label + '（' + reason + '）')` を通す**こと（既存実装は通っている、IMPL-LIGHT でも維持）。

---

## 8. 候補 0 人の場合

### 8.1 起こり得る状況

- replace 経路で「現在の相手以外、全員 disabled」（再戦 / winner-locked 等）
- 大会後半でデッドロック気味の状態
- 削除直後 / 不整合 state 直後

### 8.2 文言案

候補案 A（具体的）:
> 現在の条件では、入れ替えできる候補が見つかりません。
> 別の対局を選ぶか、組み合わせ全体を見直してください。

候補案 B（穏やか）:
> この対局では、ルールに合う入れ替え候補がありません。
> 別の対局から変更するか、組み合わせ全体を見直してください。

候補案 C（最小、安全網寄り）:
> 入れ替え候補がありません。

#### 推奨

**B**（穏やか + 行動誘導付き）。理由は:

- 「組み合わせを作り直してください」は **再生成の自動実行を促す表現** で、強すぎる（既存の再生成ボタンを意図せず押す動機を作る）
- 「組み合わせ全体を見直してください」は手動レビューも含む中立表現
- 既存の再生成 UI（[`generatePairing`](shogi_v4.html) ボタン）との関係を断つわけではない

### 8.3 UI 挙動

| 項目 | 推奨 |
|---|---|
| select そのもの | 候補 0 人の片側だけ `disabled` にする / 両方 0 人なら両方 disabled |
| 「変更を保存」ボタン | **disabled**（押しても進めない状態を明示）|
| キャンセルボタン | 通常通り有効 |
| 理由内訳の表示 | **モーダル下部の補足エリアに集計**（例: 「再戦 5 名 / 結果入力済 2 名 / 現在の相手 2 名」）|

### 8.4 内訳表示の意義

「0 人です」だけだと運営者は不安。「再戦 5 名 / 結果入力済 2 名」など内訳を見せることで、**運営判断（「再戦を許容してでも進めたい」など）への材料を残す**。ただし IMPL-LIGHT 範囲ではテキスト 1 行で十分（詳細パネルは IMPL-MEDIUM）。

---

## 9. IMPL-LIGHT 案 — スコープ分割

### 9.1 IMPL-LIGHT に含める範囲

1. **候補判定 helper の抽出**
   - 例: `classifyChangePairingCandidate(cls, idx, candidateId, role)` を新設
   - 戻り値: `{ status: 'ok' | 'blocked' | 'warn-confirmable', reasonId: 'R-...', reasonLabel: '（…）' }`
   - role = 'p1' | 'p2'（先手 / 後手 で初期判定の起点が違うため）
   - 既存 helper（`pairHasRematch` / `findPairContainingPlayer`）を内部で呼ぶ
   - **既存の click handler と同じ判定 helper を共有**（事前判定と事後判定の divergence を防ぐ）

2. **option 生成のフィルタリング**
   - [`buildChangePairingModalHtml`](shogi_v4.html:4689) で `candidates` をループする際、`classifyChangePairingCandidate` の結果で
     - `ok` → `<optgroup label="選択可能">` に追加（selected 値は match.p1 / match.p2 のまま）
     - `warn-confirmable`（replace 再戦）→ 選択可能 optgroup に **注釈付きで追加**
     - `blocked` → `<optgroup label="選択できない候補">` に `disabled` で追加 + 理由ラベル
   - 先手 select / 後手 select で **判定 role を分ける**（先手 select 用の `role='p1'`、後手 select 用の `role='p2'`）

3. **option ラベル整形**
   - 既存 `entryNoOf(cls, id) + '｜' + name` 書式を維持（`A-12｜山田太郎` 系）
   - 理由付き option は `entryNoOf + '｜' + name + '（理由）'`
   - **`escapeHtml` 経由は必須**

4. **候補 0 人時の処理**
   - 全候補が `blocked` の片側 select は **disabled**
   - 「変更を保存」ボタンも disabled
   - モーダル下部に短文の補足表示（§8.2 案 B）

5. **既存事後判定（alert / confirm / select reset）は維持**
   - 事前フィルタの実装ミスや edge case の安全網として残す
   - PR #107 の「現在の対局」表示・select reset・文言 は **退行させない**

6. **`renderTimeline` レベルでの再計算は IMPL-LIGHT 範囲外**
   - 先手を変えた後、後手 select の候補を `change` イベントで再計算する処理は **入れない**（IMPL-LIGHT では「初期表示時点での pre-compute」に閉じる）
   - 結果として「同時入替」現象は事後判定で残る（§7.4 の方針 c）

### 9.2 IMPL-MEDIUM 以降に回す範囲

- `<select>` 廃止 → 専用候補リスト UI（カード形式 / 検索 / フィルタ）
- 詳細理由パネル（モーダル内 expand）
- 変更前後差分のリアルタイム表示
- もう片方の `<select>` `change` 時の **動的再計算**（IMPL-LIGHT の段階では行わない）
- 再戦例外許可トグル（CONTROL 別タスク）
- 全候補表示トグル（案 E）
- 最適入替候補の自動推薦
- 手動変更の状態機械化（変更履歴 / 戻る・進む）
- 複数選手同時変更対応（CONTROL / RULES 別タスク）

### 9.3 想定変更箇所（IMPL-LIGHT）

| ファイル | 想定変更 |
|---|---|
| `shogi_v4.html` | `classifyChangePairingCandidate` 新設（+30〜50 行）/ `buildChangePairingModalHtml` で optgroup 化 + disabled + 理由（+20〜40 行）/ 候補 0 人ハンドリング（+10〜15 行）/ `bindChangePairingModalEvents` の事後判定は維持 |
| `test/test_pairing_ux_manual_change_candidate_filter.js`（新規）| 静的検査 + 振る舞いテスト |
| `test/run_tests.sh` | stanza 追加 |
| `docs/notes/20260515_shogi_pairing_ux_manual_change_candidate_filter_design.md` | 本ファイルに IMPL-LIGHT 着地節を追記 |
| `HANDOFF.md` | ポインタ追加 |

### 9.4 不変項目（IMPL-LIGHT で守る）

- ✅ `state.pairings[cls]` のエラーパス不変（PR #106 / #107 で明文化済）
- ✅ swap 確定後の重複検出 rollback（[L4795-4800](shogi_v4.html:4795)）の挙動 不変
- ✅ `save()` がエラーパスで呼ばれない
- ✅ `renderTournament(cls)` がエラーパスで呼ばれない
- ✅ `evaluatePairingQuality()` / `warning object` 不変
- ✅ `formatParticipantLabel()` API 不変
- ✅ `getName` / `getNameWithNo` / `entryNoOf` 本体 不変
- ✅ `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` 本体 不変
- ✅ pairing algorithm / `generatePairing` / Fisher-Yates ランダム化 不変
- ✅ pairing-card 補助ラベル（PR #103 `data-pairing-aux`）不変
- ✅ score-card 別行表示（PR #105 `.sno` / `.snm`）不変
- ✅ PR #107 の「現在の対局」表示 / select reset / 文言改善 不変
- ✅ replace 経路の **再戦 confirm 続行可能** を維持
- ✅ swap 経路の **再戦 hard block** を維持

---

## 10. テスト方針

### 10.1 静的検査（必須）

- `classifyChangePairingCandidate` が定義されている
- `buildChangePairingModalHtml` のテンプレートに `optgroup` 要素（少なくとも 2 種類のラベル）が含まれる
- option 生成ループ内で `escapeHtml` を経由している
- disabled 属性が `optgroup label="選択できない候補"` 配下の option に付与される
- 理由ラベル（`（選ぶと再戦）` / `（入替で再戦）` / `（結果入力済）` 等）が含まれる
- 「現在の対局」表示（PR #107 `data-chg-current`）が **温存** されている
- `<select>` reset helper（PR #107 `resetSelectsToOriginal`）が **温存** されている
- 事後判定 alert 文言（PR #107 新文言）が **温存** されている
- `state.pairings[cls][idx] = ...` の代入位置（[L4768](shogi_v4.html:4768) / [L4792-4793](shogi_v4.html:4792)）が **未変更**
- `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` 定義 維持
- `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` 定義 維持
- `evaluatePairingQuality()` 戻り値の従来 7 フィールド存続、Phase 2/4 フィールド不在
- pairing-card 補助ラベル（`data-pairing-aux`）維持
- score-card `.sno` / `.snm` 維持
- `generatePairing` 内ランダム化維持

### 10.2 振る舞いテスト（候補分類 helper）

- mock state を用意（A クラス 6 名、現ラウンド 3 ペア、過去ラウンドに再戦が発生する組合せを仕込む）
- `classifyChangePairingCandidate(cls, idx, candidateId, role)` を直接呼び、以下を検証:
  - **現 p1（role='p1'）**: 候補 == match.p1 → **`status: 'ok'`** / `reasonId === null`（`'R-current'` ではない）/ `reasonLabel === ''`（§7.1.1 で確定）
  - **現 p2（role='p2'）**: 候補 == match.p2 → 同上（`ok` / `null` / 空文字）
  - **R-self**: 先手 select 用に `role='p1'` で候補 == match.p2、または後手 select 用に `role='p2'` で候補 == match.p1 → `blocked` + `R-self`（同一選手選択の事前抑止）
  - **R-winner-locked**: 候補が結果入力済ペアに属する → `blocked` + `R-winner-locked`
  - **R-rematch-replace**: 候補が他ペアに属さず、再戦 → `warn-confirmable` + `R-rematch-replace`（selectable 維持）
  - **R-rematch-swap**: 候補が他ペアに属し、入替後再戦 → `blocked` + `R-rematch-swap`
  - 正常: `ok`

#### `R-current` を blocked 理由としてテストしないこと

- 現 p1 / p2 に対する assert は **「`status === 'ok'` かつ `reasonId === null`」** で書く
- `R-current` を `reasonId` の **期待値として書かない**（カタログ上は内部分類として ~~取り消し線~~ 扱い、UI に出ない）
- 「現在の対局」表示（PR #107 `data-chg-current`）は **モーダル上部に温存** されているため、select option 側で重複表示しないことの確認も含める

### 10.3 振る舞いテスト（モーダル HTML 生成）

- `buildChangePairingModalHtml(cls, idx, candidates, match)` を呼び、生成 HTML を文字列検査:
  - `<optgroup label="選択可能">` / `<optgroup label="選択できない候補">` が含まれる
  - `blocked` 候補の option に `disabled` 属性が付与される
  - 候補 0 人時に select / 保存ボタンが disabled、補足文言が含まれる
- **現 p1 / p2 の option 検査**（§7.1.1 と整合、必須）:
  - 先手 select 内で `match.p1` の option に **`selected` 属性が付与** されている
  - 後手 select 内で `match.p2` の option に **`selected` 属性が付与** されている
  - 両 option に **`disabled` 属性が付かない**
  - 両 option の表示文字列に **`（現在の相手）` / `（現在選択中）` 等の括弧書きが含まれない**（理由ラベル非付与）
  - 両 option は **「選択可能」optgroup 配下** にある（「選択できない候補」optgroup には含まれない）
- **「変更がありません」alert は既存 click handler に任せる**（候補フィルタ側で別理由を出さない）:
  - 現 p1 / p2 を `selected` のまま「変更を保存」を押した場合、既存 [`bindChangePairingModalEvents` L4750](shogi_v4.html:4750) の `alert('変更がありません')` で扱われる
  - 本テスト方針では「差分なし保存」を候補フィルタの対象外とすることを assert で確認

### 10.4 候補 0 人テスト

- すべての候補が `blocked` になる mock state を用意
- HTML に「変更を保存」disabled 属性 + 候補 0 人案内文言が含まれる

### 10.5 既存事後判定の安全網テスト

- 既存 click handler のエラーパス文言・select reset 動作が **退行していない**
- `state.pairings` が事後判定エラー時に変更されないこと（PR #107 と同じ確認）

### 10.6 スマホ / VRT 注意点

- **select を開いた picker そのものは OS 依存** で VRT に取り込めない（Playwright Chromium で再現不可）
- VRT 対象になり得る範囲:
  - モーダル open 状態のスクリーンショット（既存スイートで撮っていない可能性大、要確認）
  - 候補 0 人時のモーダル内補足文言（テキスト要素なので VRT 検出可能）
- `disabled option` / `optgroup` の **実機確認** は必須（iOS Safari / Android Chrome / iPad Safari）
- **VRT red の場合は自律 snapshot 更新しない**（PR #103 / #105 と同じ運用、判断を仰ぐ）

### 10.7 run_tests.sh

- 新規 `test/test_pairing_ux_manual_change_candidate_filter.js` の stanza を追加（既存 72 stanza に 1 追加）

---

## 11. リスク

| リスク | 対応方針 |
|---|---|
| 候補を完全非表示にすると、運営者が「あの人がいない、なぜ？」と不安 | 案 C（optgroup 上下分離）採用で候補は残す。透明性確保 |
| disabled option が多すぎて見づらい | 上下分離で「上だけ見ればよい」運用に。下は閉じている保証はないが運用上気にしない |
| disabled option がスマホ picker で読みにくい | IMPL-LIGHT 実装時に実機確認。case-by-case で案 A 縮退（モーダル下部に理由リスト併記）|
| 選べるべき人を誤って選択不可にする | `classifyChangePairingCandidate` を **既存 click handler と共有**（事前・事後で同一判定）/ 静的検査で `blocked` 条件を明示 |
| 再戦ポリシーを誤る | replace = `warn-confirmable`（selectable）/ swap = `blocked`（disabled）を仕様に明文化 |
| replace / swap の非対称が分かりにくい | 本 docs §6 で明文化。UI 上は理由ラベル `（選ぶと再戦）` / `（入替で再戦）` で文言を分ける |
| 候補判定と保存時判定がズレる | 同一 helper の参照に統一。**事後判定 alert は安全網として残す** |
| 既存エラー処理との二重化で複雑になる | 事前フィルタは「ほぼ全部を事前に弾く」、事後判定は「edge case の最後の砦」と役割分担。両者の文言・理由 ID を整合 |
| 実装が IMPL-LIGHT を超えて肥大化 | scope を「候補集合の表示・分類・disabled 化・理由表示」に限定。動的再計算 / 推薦 / 状態機械化 は IMPL-MEDIUM |
| `R-both-swap-needed` は事前判定不能 | §7.4 方針 c（事後判定に任せる）を採用。option には出さず、alert で扱う |
| 候補 0 人時に「組み合わせを作り直してください」が再生成ボタン誤動作を誘発 | §8.2 案 B（「組み合わせ全体を見直してください」中立表現）を採用 |

---

## 12. 次タスク候補

| 順位 | 候補 | 規模 | 起点条件 |
|---|---|---|---|
| **第一** | `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT` | 中（+60〜120 行 + テスト + helper 抽出）| 本 design check 後 |
| 第二 | **運用観察** | — | 第一着地後、disabled option / optgroup がスマホで読めるか、エラー試行回数が減るか |
| 第三 | `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-MEDIUM` | 中〜大 | 第一で不十分な場合、動的再計算 / 詳細理由パネル / 候補数集計 etc. |
| 第四 | `PAIRING-UX-MANUAL-CHANGE-CONTROL`（例外許可トグル）| 中 | 案 E（トグル切替）系、必要性が観察で確認されたら |
| 第五 | `PAIRING-UX-MANUAL-CHANGE-RULES`（再戦ポリシーの仕様変更）| 中〜大 | replace/swap の非対称を変更したい場合のみ |
| 後回し | `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` | 小 | 独立進行可（モーダル option label の compact 化、PR #101 §10.3）|
| 後回し | `WARNING-DECISION-SUPPORT-IMPL-PHASE2`（`avoidablePairIndexes`）| 中 | 別観察フェーズ |

---

## 13. 推奨 Next Action

### 13.1 第一候補: `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT`

- `classifyChangePairingCandidate` を抽出（事前判定 + 事後判定で共有）
- `buildChangePairingModalHtml` を optgroup 2 段（選択可能 / 選択できない候補）+ disabled + 理由ラベルに刷新
- 候補 0 人時の補足文言と保存ボタン disabled
- 既存事後判定（PR #107 alert / select reset / 「現在の対局」表示）は退行させない
- 静的検査 + 振る舞いテストを追加
- スマホ実機確認（disabled option / optgroup の見え方）→ 必要なら案 A 縮退（下部理由リスト併記）

---

## 14. 当面やらないこと

- 今回（本 design check PR）は **実装しない**
- `shogi_v4.html` / `test/` / `test/e2e/` / Visual Regression snapshot を変更しない
- 例外許可トグル / 再戦 confirm 仕様変更 / select 廃止 / 推薦 / 状態機械化 / 複数選手同時変更
- pairing algorithm / `generatePairing` / Fisher-Yates 変更
- `evaluatePairingQuality()` / `warning object` 変更
- `formatParticipantLabel()` API 変更
- `getName` / `getNameWithNo` / `entryNoOf` 本体変更
- `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` 本体変更
- PR #103 pairing-card 補助ラベル変更
- PR #105 score-card `.sno` / `.snm` 変更
- PR #107 「現在の対局」表示 / select reset / 文言 変更（退行）
- もう片方の `<select>` `change` イベントで候補を動的再計算する処理（IMPL-LIGHT スコープ外）
- 詳細理由パネル / 変更前後差分表示 / 自動推薦
- `DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4 着手
- 後続タスク開始

---

## 15. 完了条件

本 docs-only PR の完了条件:

- 目的 / 非目的（§1）
- 背景（§2、PR #106 / #107 着地後の残課題）
- 現状コード確認（§3、関数 + 行番号付き）
  - 候補集合の生成（§3.1、`state.players[cls]` 全員）
  - 選択後のエラー判定 6 種類（§3.2）
  - replace / swap 経路の違い（§3.3）
  - 関連 helper（§3.4）
- 案 A〜E 比較（§4）と推奨案（§5、案 C + 案 B ハイブリッド）
- 再戦ポリシー整理（§6、現行非対称を明文化）
- 選択不可理由カタログ / 優先順位 / `R-both-swap-needed` 事前判定不能の caveat（§7）
- 候補 0 人時の方針（§8、案 B 文言 + 保存 disabled）
- IMPL-LIGHT 案 / IMPL-MEDIUM 以降案（§9）
- テスト方針（§10、静的検査 + 振る舞い + スマホ / VRT 注意）
- リスク（§11）
- 次タスク候補（§12）
- 当面やらないこと（§14）
- **実装変更なし** / **テスト変更なし** / **CI 設定変更なし** / **snapshot 未変更**
- 変更ファイルは `docs/notes/20260515_shogi_pairing_ux_manual_change_candidate_filter_design.md`（新規）と `HANDOFF.md` のみ

---

## 16. 関連 PR / docs

- 起源系列: PR #99 / #100 / #101 / #102 / #103 / #104 / #105 / #106 / #107
- 既存 inventory: [docs/notes/20260514_shogi_pairing_ux_inventory.md](docs/notes/20260514_shogi_pairing_ux_inventory.md)
- 直前 design: [docs/notes/20260515_shogi_pairing_ux_manual_change_error_recovery_design.md](docs/notes/20260515_shogi_pairing_ux_manual_change_error_recovery_design.md)（PR #106 / #107 で着地）
- 既存 spec: [docs/specs/20260508_1907_phase4_pairing_swap_spec.md](docs/specs/20260508_1907_phase4_pairing_swap_spec.md)（swap 仕様の起源、replace/swap 非対称の出所）
- 本 PR: `docs(pairing-ux): 手動変更候補フィルタの設計方針を整理`
- 変更ファイル:
  - `docs/notes/20260515_shogi_pairing_ux_manual_change_candidate_filter_design.md`（本ファイル、新規）
  - `HANDOFF.md`（PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-DESIGN ポインタ追加）
- 変更しないファイル: `shogi_v4.html` / `test/` / `test/e2e/visual_regression.spec.js-snapshots/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js`
