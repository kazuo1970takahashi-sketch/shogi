# PAIRING-UX-SCORE-LIST-READABILITY-DESIGN — 暫定成績 / 対戦済みリスト 読みやすさ設計

**Task ID**: `PAIRING-UX-SCORE-LIST-READABILITY-DESIGN`
**作業種別**: docs-only / design check / UI readability / tournament operation UX
**HEAD**: `ceb9f6e`（PR #103 squash merge 後の main）
**前提 PR 系列**:
- PR #99 `PAIRING-UX-INVENTORY`
- PR #100 `PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN`
- PR #101 `PAIRING-UX-DISPLAY-HELPER-DESIGN`
- PR #102 `PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT`（`formatParticipantLabel` 軽量実装）
- PR #103 `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`（pairing-card 補助ラベル + 警告補足）

---

## 1. 目的と非目的

### 1.1 目的

- 対局管理画面の **「暫定成績」** と **「対戦済みリスト」** の現状並び順を関数 + 行番号付きで明示する
- 同勝数内の **tie-break が未明示** であることを docs に書き留める
- 暫定成績カードの **氏名折り返し問題**（番号 + 氏名が同一行内で折り返される）を整理する
- 番号と氏名を **別行表示** する案を整理する
- 暫定成績は **勝数降順を維持** する方向、同勝数内は **entry_no 順** を明示する方向を推奨として整理する
- 対戦済みリストの並び順は **勝数順維持 / 番号順** の比較を行い、IMPL-LIGHT で判断できる材料を残す
- PR #103 の pairing-card 補助ラベル（`A-12 山田太郎（2勝0敗）` 形式）との表示整合を整理する
- 次の最小実装 `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT` のスコープを段階化する

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only design check）
- `shogi_v4.html` / `test/` / Visual Regression snapshot を変更しない
- `getNameWithNo()` / `entryNoOf()` / `formatParticipantLabel()` 本体を変更しない
- `evaluatePairingQuality()` / `warning object` を変更しない
- 切替 UI（勝数順 ↔ 番号順 toggle）の実装計画を確定しない
- 最終結果タブ / 印刷物 / PDF 出力の並び順に踏み込まない
- 対戦履歴の永続化形式（`state.results` の構造）に踏み込まない
- `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` / Phase 2〜4 に踏み込まない

---

## 2. 現状コード確認

`shogi_v4.html`（HEAD `ceb9f6e`）の関連経路を関数 + 行番号で整理する。

### 2.1 `renderTournament(cls)` — sorted の生成

[shogi_v4.html:5059-5089](shogi_v4.html:5059)

```js
function renderTournament(cls){
  // ...
  var wins=getWins(cls);
  var done=state.results[cls].length>=state.rounds;
  var roundNum=state.results[cls].length+1;
  var sorted=players.slice().sort(function(a,b){return (wins[b.id]||0)-(wins[a.id]||0);});  // L5067

  var played={};
  for(var i=0;i<players.length;i++)played[players[i].id]=[];
  for(var r=0;r<state.results[cls].length;r++){
    for(var m=0;m<state.results[cls][r].length;m++){
      var match=state.results[cls][r][m];
      if(match.winner){                                                                       // L5074
        played[match.p1].push(match.p2);
        played[match.p2].push(match.p1);
      }
    }
  }

  var html='<div class="section"><h2>'+cls+'クラス</h2>';
  html+=buildScoreGridHtml(cls, sorted, wins);          // L5082
  html+=buildPlayedHistoryHtml(cls, sorted, played);    // L5083
  html+=buildPastResultsHtml(cls);                      // L5084
  html+=buildCurrentPairingsHtml(cls, roundNum, done);  // L5085
  // ...
}
```

**観察**:
- **`sorted` は勝数降順**（[5067](shogi_v4.html:5067)）。`(wins[b.id]||0)-(wins[a.id]||0)` の差を返す比較関数
- **同勝数内 tie-break は明示されていない**。`Array.prototype.sort` の **stable sort 仕様**（ES2019 以降の規格上保証）により、`players.slice()` の **元の配列順** が同勝数内で保持される
- 元の `state.players[cls]` の順は、`addPlayer` で末尾追加 + 削除で詰めない（`entry_no` 欠番維持、A-5.1 §11.8）なので **おおむね entry_no 順** に近い。ただし **完全一致は保証されない**（例: クラス変更で player object が他クラスから移った後に元クラスへ戻った場合、配列末尾に来る可能性。`nextEntryNoForClass` は max+1 を採るため新規 entry_no は単調増加だが、配列順は挿入順）
- `played` map の **opponent tag の順序** は `state.results[cls]` を **ラウンド順に走査** して push されるため、各選手の対戦相手タグは **概ねラウンド順**（ただし winner 未確定 match は除外、[5074](shogi_v4.html:5074)）
- 「暫定成績」と「対戦済みリスト」は **同じ `sorted` を共有** している（[5082-5083](shogi_v4.html:5082)）→ **両者の外側並び順は常に一致**

### 2.2 `buildScoreGridHtml(cls, sorted, wins)` — 暫定成績

[shogi_v4.html:4868-4877](shogi_v4.html:4868)

```js
function buildScoreGridHtml(cls, sorted, wins){
  var html='<h3>暫定成績</h3><div class="score-grid">';
  for(var i=0;i<sorted.length;i++){
    var p=sorted[i];var w=wins[p.id]||0;
    var total=0;for(var r=0;r<state.results[cls].length;r++){for(var m=0;m<state.results[cls][r].length;m++){var mm=state.results[cls][r][m];if(mm.p1===p.id||mm.p2===p.id)total++;}}
    html+='<div class="score-card"><div class="sname">'+escapeHtml(getNameWithNo(p.id,cls))+'</div><div class="swins">'+w+'</div><div style="font-size:11px;color:#888">'+w+'勝'+(total-w)+'敗</div></div>';
  }
  html+='</div>';
  return html;
}
```

**観察**:
- 各 `score-card` の構造:
  - `.sname`: `escapeHtml(getNameWithNo(p.id, cls))` = `01｜山田太郎`（番号 + 全角縦線 + 氏名、**1 つの文字列**）
  - `.swins`: 大きい勝数（22px / 太字 / 紺）
  - 小さい `2勝0敗` 表示（11px / グレー）
- **`total` は `state.results` の winner 未確定対局も含めて加算**（[4872](shogi_v4.html:4872) の `if(mm.p1===p.id||mm.p2===p.id)total++` には winner guard なし）
  - これは PR #103 で `pcTotals` に追加した winner guard と **挙動が異なる**（pairing-card 補助ラベルは winner 確定済みのみだが、score-card は全 match を total に計上、`(total - w)` を「敗数」として表示）
  - **設計対称ではない**が、本タスクのスコープ外として記録のみ留める

### 2.3 `buildPlayedHistoryHtml(cls, sorted, played)` — 対戦済みリスト

[shogi_v4.html:4879-4889](shogi_v4.html:4879)

```js
function buildPlayedHistoryHtml(cls, sorted, played){
  var html='<h3>対戦済みリスト</h3><div style="margin-bottom:12px">';
  for(var i=0;i<sorted.length;i++){
    var p=sorted[i];
    var tags='';
    for(var j=0;j<played[p.id].length;j++)tags+='<span class="history-tag">'+escapeHtml(getNameWithNo(played[p.id][j],cls))+'</span>';
    html+='<div style="margin-bottom:4px"><strong style="font-size:12px">'+escapeHtml(getNameWithNo(p.id,cls))+'</strong>：'+(tags||'なし')+'</div>';
  }
  html+='</div>';
  return html;
}
```

**観察**:
- 外側並び順は **`sorted` を共有** → **勝数降順**
- 各行の対戦相手タグ（`.history-tag`）は **`played[p.id]` の push 順** = ラウンド順（winner 確定済みのみ、[5074](shogi_v4.html:5074) でフィルタ）
- 行頭の選手名は `getNameWithNo(p.id, cls)`、相手タグも同じ `getNameWithNo`

### 2.4 `buildPastResultsHtml(cls)` — 過去結果（参考）

[shogi_v4.html:4891-4912](shogi_v4.html:4891)

- ラウンド順 → ラウンド内は `state.results[cls][r]` 配列順（対局カード生成順）
- 並び順設計の影響を受けない（sorted を使わない）

### 2.5 CSS 構造

[shogi_v4.html:50-64](shogi_v4.html:50)

```css
.score-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:6px;margin-bottom:12px}
.score-card{background:#f0f4f8;border-radius:8px;padding:8px 6px;text-align:center}
.score-card .sname{font-weight:500;font-size:12px}
.score-card .swins{font-size:22px;font-weight:bold;color:#1F3864}
.history-tag{display:inline-block;background:#eee;border-radius:4px;padding:2px 6px;font-size:11px;color:#666;margin:2px}
```

**観察**:
- **`.score-grid` は `auto-fit, minmax(80px, 1fr)`**: コンテナ幅に応じてカード数を自動調整、各カード最小 80px
- **`.score-card`**: `text-align:center`、padding 8px 6px
- **`.score-card .sname`**: `font-weight:500` / `font-size:12px`、**`white-space` / `word-break` / `overflow-wrap` 未指定** → ブラウザのデフォルトに従って折り返しは「単語境界」で行う。日本語は単語境界が曖昧で、`01｜山田太郎` のような全角混在文字列では **任意の文字位置で折り返す**（80px 幅では `01｜山` / `田太郎` のように 2 行になる）
- **`.score-card` の高さは内容に応じて伸縮**するため、長い氏名で 2 行 / 3 行になっても score-grid のレイアウト自体は破綻しない
- ただし **番号と氏名が縦に分断される視覚的問題**（`01｜` だけが上の行に残り、`山田太郎` が次の行へ）が発生する

### 2.6 関連 helper

| 関数 | 行 | 出力 |
|---|---|---|
| `getName(id, cls)` | [231](shogi_v4.html:231) | `'山田太郎'`（氏名のみ）|
| `entryNoOf(cls, id)` | [243](shogi_v4.html:243) | `'01'`（2 桁 0 埋め、`entry_no` 優先 / 未設定時 index+1 fallback）|
| `getNameWithNo(id, cls)` | [277](shogi_v4.html:277) | `'01｜山田太郎'`（entryNo + 全角縦線 + 氏名、**1 文字列**）|
| `getWins(cls)` | [293](shogi_v4.html:293) | `{playerId: N}` map、winner 確定済みのみ |
| `formatParticipantLabel(player, options)` | [281](shogi_v4.html:281)〜 | PR #102 で追加。`mode:'compact'/'standard'`、`includeRecord`、`includeCategory`、`record:{wins, losses}` |

### 2.7 PR #103 との表示整合

PR #103 で pairing-card に追加した補助ラベル（`data-pairing-aux="p1"`/`"p2"`）は `formatParticipantLabel(player, {mode:'standard', includeRecord:true, record:{wins, losses}})` 経由で `'A-12 山田太郎（2勝0敗）'` を出力している。

一方、暫定成績の `.sname` は `getNameWithNo()` 経由で `'01｜山田太郎'` を出力 → **書式が違う**（`A-12` vs `01｜`）。これは現状 `buildScoreGridHtml` を触っていないため意図せず生じた **非対称**。

---

## 3. 暫定成績カードの折り返し問題

### 3.1 問題の所在

- `.score-grid` は `minmax(80px, 1fr)` のため、コンテナ幅が狭い（スマホ width=375 で 4 列前後、各カード 80px 強）と **`.sname` の文字列が折り返される**
- `getNameWithNo()` は `'01｜山田太郎'` の **1 文字列**なので、折り返し位置は **ブラウザ任せ**（`01｜山` / `田太郎` のような分断が起こる）
- 番号と氏名の境界が視覚的に消えるため、**「A-12 の山田太郎」が一見「01｜山 / 田太郎」と読める** という識別誤り

### 3.2 改善案

#### 案 A — CSS のみで境界を保つ

- `.score-card .sname` に `word-break: keep-all` / `overflow-wrap: break-word` を追加 → 日本語の任意位置折り返しを抑制
- 効果: 折り返しが減るが、80px 幅では氏名がはみ出る可能性（`text-overflow` で隠す or `padding` 調整）
- **trade-off**: 名前が長いと画面崩れリスク

#### 案 B — 番号と氏名を別行 / 別要素にする（推奨）

- `.sname` 内に **2 つの子要素** を入れる:
  ```html
  <div class="score-card">
    <div class="sname">
      <div class="sno">A-12</div>
      <div class="snm">山田太郎</div>
    </div>
    <div class="swins">2</div>
    <div class="srecord">2勝0敗</div>
  </div>
  ```
- メリット:
  - 番号と氏名の境界が常に明確
  - スマホでも PC でも視覚的構造が同じ
  - 氏名だけが折り返しの対象（番号は単一トークンで折り返さない）
  - 同姓識別が容易（番号が独立表示）
- trade-off:
  - HTML 構造が増える（+2 要素 / カード）
  - CSS class 追加（`.sno` / `.snm` 等）
  - **`getNameWithNo()` を分解** する必要 → 内部で `entryNoOf` / `getName` を別々に呼ぶ
- **`formatParticipantLabel`** を使うか?
  - 現状の helper は `'A-12 山田太郎'` 形式の文字列を返す前提（PR #102 §14.3）
  - 分解された number / name を直接取りたい場合、helper を経由するより `entryNoOf()` / `getName()` を直接使う方が簡潔
  - もし helper を発展させるなら、`mode:'detail'` で `{parts: {classLabel, name}}` の object 返却（PR #101 §7.3 の object 案）を実装する必要がある → **本 IMPL-LIGHT では過剰**

#### 案 C — スマホ幅のみ別行表示

- `@media (max-width: 480px)` 等でスマホ時のみ flex-direction column / 別行表示
- PC では現状維持（`getNameWithNo()` 1 行表示）
- trade-off: PC とスマホで表示構造が異なる → 同姓識別ルールも幅依存になる

### 3.3 推奨案

**案 B（番号と氏名を別行）** が最有力。`entryNoOf()` / `getName()` を直接呼んで分解表示。CSS class を追加（`.sno` / `.snm`）。`@media` 分岐は使わず、**PC でもスマホでも同じ構造** にする（一貫性 + 同姓識別ルールの統一）。

**フォーマット決定（IMPL-LIGHT 用の仮）**:
- 番号: `'A-12'`（クラス文字 + ハイフン + 2 桁番号）— 現状の `getNameWithNo` の `'01｜'` から **書式変更**
- 氏名: `'山田太郎'`
- 勝敗: 既存 `.swins`（大数字）+ 小さい `2勝0敗`

→ これは PR #103 の pairing-card 補助ラベル（`A-12 山田太郎` の前置部）と **書式整合**

---

## 4. 並び順の設計整理

### 4.1 暫定成績の並び順

| 候補 | 内容 | 評価 |
|---|---|---|
| A. 勝数降順を維持 | 現状そのまま | 同勝数内が不安定（stable sort で配列順だが配列順は entry_no と必ずしも一致しない） |
| B. entry_no 順に変更 | 全並びを番号順 | 「成績」欄の意味に反する。順位が分かりづらい |
| **C. 勝数降順 + 同勝数内 entry_no 順**（推奨）| 1 次キー: wins desc、2 次キー: entry_no asc | 順位優先、同勝数内は番号で安定 |

**推奨: 候補 C**

#### 4.1.1 採用理由

- **暫定成績は「成績欄」**: 勝数降順が自然
- **同勝数内の安定化**: 「A-03 と A-12 が同じ 2 勝、画面上でどちらが上か」が予測可能になる
- **運営者の探索動線**: 「A-12 はどこか」を探すとき、同勝数群内では番号順で目視できる
- **既存挙動との差は最小**: stable sort で entry_no と近い順序が現状でも維持されているケースが多く、明示的に entry_no を 2 次キーにしても並びが大きく変わらない（regression リスクが低い）

#### 4.1.2 検討論点

- **`entry_no` が未設定**: `entryNoOf` のロジック上、`entry_no` 未設定なら index+1 を fallback → ソート時は `player.entry_no || (index+1)` 相当の値を使えば一貫
- **クラス内番号 `A-12` / `B-08` 表示との一致**: 暫定成績カードに `A-12` 形式を出すなら、ソートキーと表示キーが一致 → ユーザー予測しやすい
- **最終結果タブとの整合**: `calcFinal` / `renderResults` の並び順は別経路（成績順 → 直接対決 / オポネント数による tie-break）。**最終結果は別タスクのスコープ** なので、本 design check では暫定成績のみを扱い、最終結果は触らない

### 4.2 対戦済みリストの並び順

| 候補 | 内容 | 評価 |
|---|---|---|
| A. 暫定成績と同じ sorted（勝数順）維持 | 現状 | 一覧の整合性が高い、上位選手の履歴がすぐ見える |
| B. entry_no 順に変更 | 「番号で探す」用途寄り | 暫定成績と並びがズレる → 運営者の予測を裏切る可能性 |
| C. 見出し / 説明文で並び順を明示 | UI 変更最小 | 認知負荷の軽減のみ |
| D. 勝数順 / 番号順 切替 UI | 将来案 | IMPL-LIGHT には過剰 |

#### 4.2.1 用途の分析

- **「上位選手の対戦履歴をまとめて見る」用途**: 勝数順が便利（A 案）
- **「特定の A-12 が誰と当たったか確認する」用途**: 番号順が探しやすい（B 案）
- **大会運営の実態**: 終盤になるほど勝数順の意味が増す（「全勝者の対戦履歴」を見たい）。序盤は番号順で当該選手を探す動線が多い
- **暫定成績との一貫性**: 同じ画面の上下に並ぶため、**並び順が違うと運営者が混乱** する可能性が高い

#### 4.2.2 暫定成績 § 4.1 候補 C を採用した場合の波及

- 暫定成績が **「勝数降順 + 同勝数内 entry_no 順」** に統一されると、**同じ sorted を使う対戦済みリストも自動的に同じ並び順** になる
- → **暫定成績と対戦済みリストの並び順が常に一致** することが構造的に保証される
- → 候補 A 維持 + 暫定成績 §4.1 候補 C 採用が最小変更 + 高い整合性
- 「探したい選手を見つけられない」課題は、別途 **見出しに並び順を明示**（候補 C 併用）で軽減できる:
  - 例: `<h3>対戦済みリスト（勝数順）</h3>` のような補足

#### 4.2.3 推奨

**§4.1 候補 C（暫定成績の同勝数内 entry_no tie-break）を採用し、対戦済みリストは候補 A（同じ sorted 維持）+ 候補 C（見出しに「勝数順」明示）の併用**

- 切替 UI（候補 D）は **IMPL-LIGHT には過剰**、観察フェーズで需要が出たら検討
- 対戦相手タグの順序（ラウンド順）は **そのまま維持**（変更すると「いつ当たったか」が読み取れなくなる）
- もし「特定選手の履歴を探す」需要が強ければ、別タスク `PAIRING-UX-PLAYED-LIST-ORDER-IMPL-LIGHT`（§5 候補 2）で対戦済みリスト側だけ番号順に変更する選択も残す

---

## 5. 実装候補の段階整理

| 候補 | 内容 | 規模 | 依存 | 推奨優先度 |
|---|---|---|---|---|
| **1. `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT`** | 暫定成績の sorted を「勝数降順 + 同勝数内 entry_no 順」に変更 + 暫定成績カードで番号と氏名を別行表示 + 対戦済みリスト見出しに並び順明示 | 小〜中（+30〜60 行 HTML/CSS + 改修テスト）| なし | **第一候補** |
| 2. `PAIRING-UX-PLAYED-LIST-ORDER-IMPL-LIGHT` | 対戦済みリストだけ独自 sort（entry_no 順）に変更 OR 見出しの明示拡張 | 小 | 候補 1 後、観察結果次第 | 第二候補 |
| 3. `PAIRING-UX-SCORE-LIST-ORDER-TOGGLE-DESIGN` | 勝数順 / 番号順 切替 UI の design check | 中（docs-only）| 候補 1〜2 の運用観察後 | 後回し |
| 4. `PAIRING-UX-SCORE-CARD-TOTAL-WINNER-GUARD` | `buildScoreGridHtml` の `total` 計算に winner guard を追加（PR #103 と挙動対称化）| 小 | 観察フェーズで非対称が問題化した場合 | 観察依存 |

### 5.1 候補 1 のスコープ詳細

- **`renderTournament` の sorted**: `sort` 比較関数を `(wins[b.id]||0) - (wins[a.id]||0)` から **`-> 0 のとき entry_no asc を 2 次キー`** に拡張
  - 比較関数案: `(b.wins - a.wins) || (entryNoOf(cls, a.id) - entryNoOf(cls, b.id))` 等
  - ただし `entryNoOf` は 2 桁 0 埋め文字列を返すため、**数値ソート用の helper** が別に必要 / または `player.entry_no` を直接使う（safer）
- **`buildScoreGridHtml`**: `getNameWithNo` の 1 文字列分解 → `entryNoOf` と `getName` を別要素で出力
  - 表示書式は `'A-12'` + `'山田太郎'`（クラス文字を前置）→ pairing-card 補助ラベルと整合
  - CSS class 追加（`.sno` / `.snm` 等）。`.sname` は wrapper として残す
- **`buildPlayedHistoryHtml`**: 見出しに「勝数順」明示。対戦相手タグの順序（ラウンド順）はそのまま
- **テスト**: 構造アサート（sorted の 2 次キー / score-card に番号と氏名が別要素）+ 振る舞いテスト（同勝数 2 名でソート確認）
- **Visual Regression**: snapshot 更新が必要（PR #103 の経験を参照、Linux baseline 更新）

### 5.2 候補 1 が避けるべきこと

- `getNameWithNo()` 本体を変更しない（他 callsite に影響大）
- `formatParticipantLabel()` 本体に `'detail'` / `parts` を追加しない（IMPL-LIGHT 範囲外）
- 最終結果タブ（`renderResults`）の並び順を変更しない
- `state.players[cls]` の配列順を物理的に並び替えない（ソートは表示用の浅いコピーに留める、現状踏襲）
- `calcFinal` / tie-break ロジックを変更しない
- 対戦相手タグの順序を変えない（ラウンド順維持）

---

## 6. PR #103 との表示整合

| 表示場所 | 関数 | 書式（現状） | 書式（IMPL-LIGHT 後の想定）|
|---|---|---|---|
| pairing-card 補助ラベル（PR #103 着地済）| `formatParticipantLabel` | `A-12 山田太郎（2勝0敗）` | 維持 |
| 暫定成績 `.sname` | `getNameWithNo` | `01｜山田太郎`（1 文字列）| **`A-12` + `山田太郎`（別要素）** |
| 対戦済みリスト 行頭の選手名 | `getNameWithNo` | `01｜山田太郎` | 現状維持 or 別要素化（候補 1 のスコープ判断） |
| 対戦済みリスト 対戦相手タグ | `getNameWithNo` | `01｜A-03 相手` | 現状維持（タグは短く保つ） |
| 印刷物 | `getName` | 氏名のみ | 維持（RANK-PRINT-001）|

**含意**:
- 暫定成績の書式を `A-12` + `山田太郎` に変えると、**pairing-card 補助ラベルの前置部と書式整合**する
- 対戦済みリストの行頭は **書式統一の余地**あり（候補 1 のスコープに含めるか判断）
- 既存 `getNameWithNo` を呼ぶ他の表示場所（変更モーダル / 過去結果 等）は **触らない**（IMPL-LIGHT 範囲外）

---

## 7. 次タスク候補（再掲）

| 順位 | 候補 | 主目的 |
|---|---|---|
| **第一** | `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT` | 暫定成績の sort tie-break 明示 + 番号/氏名別行表示 + 対戦済みリスト見出し |
| 第二 | `PAIRING-UX-PLAYED-LIST-ORDER-IMPL-LIGHT` | 対戦済みリスト並び順の独自化（候補 1 後の観察次第）|
| 第三 | `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` | 「対戦相手の変更」モーダル option / 行内表示の helper 化（独立進行可）|
| 後回し | `PAIRING-UX-SCORE-LIST-ORDER-TOGGLE-DESIGN` | 勝数順 / 番号順 切替 UI 設計 |
| 後回し | `PAIRING-UX-SCORE-CARD-TOTAL-WINNER-GUARD` | score-card の `total` 計算に winner guard 追加 |
| 後回し | `WARNING-DECISION-SUPPORT-IMPL-PHASE2` | `avoidablePairIndexes` 追加、警告本文に該当ペア展開 |

---

## 8. 推奨 Next Action

### 8.1 第一候補: `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT`

- **目的**: 暫定成績の同勝数内 tie-break を `entry_no` で明示 + 暫定成績カードで番号と氏名を別行表示 + 対戦済みリスト見出しに「勝数順」明示
- **対象**: `renderTournament` の sort 比較関数 / `buildScoreGridHtml` の score-card HTML / `.score-card .sname` / `.sno` / `.snm` の CSS / `buildPlayedHistoryHtml` の見出し
- **不変項目**:
  - `getNameWithNo` / `entryNoOf` / `getName` / `formatParticipantLabel` 本体未変更
  - `evaluatePairingQuality` / `warning object` / `state.players[cls]` 配列順物理改変なし
  - `calcFinal` / `renderResults` / 印刷経路（`printResults`）未変更
  - `buildPastResultsHtml` / `buildCurrentPairingsHtml` の主要構造未変更
- **テスト**: 構造アサート + sort tie-break の振る舞いテスト + score-card 別要素アサート
- **Visual Regression**: snapshot 更新を伴う（暫定成績カード構造変化のため、PR #103 と同じ手順で Linux baseline 更新が必要）
- **規模**: 小〜中（+30〜60 行）

### 8.2 第二候補: `PAIRING-UX-PLAYED-LIST-ORDER-IMPL-LIGHT`

- **目的**: 候補 1 後の運用観察を経て、対戦済みリストだけ独自順（entry_no 順）にしたい場合の最小実装
- **条件**: 候補 1 着地後、現場で「対戦済みリストでも番号順がほしい」フィードバックが出たとき
- **規模**: 小

### 8.3 第三候補: `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`

- 候補 1 / 2 と **独立進行可能**（modal option / 行内表示 / マーカーの helper 化、PR #101 §10.3 想定）

---

## 9. 当面やらないこと

- 今回（本 design check PR）は **実装しない**
- `getNameWithNo` / `entryNoOf` / `getName` / `formatParticipantLabel` 本体に変更を入れない
- `state.players[cls]` 配列順の物理改変なし
- `calcFinal` / `renderResults` / 印刷経路（`printResults`）の並び順に踏み込まない
- 対戦履歴の永続化形式（`state.results`）に踏み込まない
- 切替 UI（勝数順 ↔ 番号順 toggle）の実装計画を確定しない
- `buildPastResultsHtml` / `buildCurrentPairingsHtml` の主要構造を触らない
- score-card の `total` 計算 winner guard 追加（PR #103 との対称化）は別タスクへ
- Visual Regression snapshot 更新を行わない（実装段階で別途）

---

## 10. 完了条件

本 docs-only PR の完了条件:

- 現状コードの並び順 / 表示構造が §2 で関数 + 行番号付きに整理されている
- 暫定成績は **勝数降順**、対戦済みリストも **同じ `sorted` を共有 → 勝数降順** が明示
- 同勝数内 tie-break が **未明示（stable sort による配列順頼り）** であることが明示
- 暫定成績カードの **折り返し問題** が §3 で整理
- 番号と氏名の **別行表示案（案 B）** が §3 で推奨として整理
- 暫定成績は §4.1 候補 C（勝数降順 + 同勝数内 entry_no）が推奨として整理
- 対戦済みリストは §4.2 候補 A + C（sorted 共有 + 見出し明示）が推奨として整理
- 次タスク候補が §5 / §7 で段階化、第一候補が `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT`
- PR #103 との表示整合が §6 で整理
- **実装変更なし** / **テスト変更なし** / **Visual Regression snapshot 未変更** / **CI 設定変更なし**
- 変更ファイルは `docs/notes/20260515_shogi_pairing_ux_score_list_readability_design.md`（新規）と `HANDOFF.md` のみ

---

## 11. 関連 PR / docs

- 起源系列: PR #99（INVENTORY）/ #100（WARNING-DESIGN）/ #101（HELPER-DESIGN）/ #102（HELPER-IMPL-LIGHT）/ #103（WARNING-IMPL-LIGHT、merge `ceb9f6e`）
- 既存 inventory: [docs/notes/20260514_shogi_pairing_ux_inventory.md](docs/notes/20260514_shogi_pairing_ux_inventory.md)
- 既存 design: [docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md](docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md) / [docs/notes/20260514_shogi_pairing_ux_display_helper_design.md](docs/notes/20260514_shogi_pairing_ux_display_helper_design.md)
- 既存 pairing 仕様: [docs/specs/20260508_1907_phase4_pairing_swap_spec.md](docs/specs/20260508_1907_phase4_pairing_swap_spec.md)
- 本 PR: `docs(pairing-ux): 暫定成績と対戦済みリストの読みやすさを整理`
- 変更ファイル:
  - `docs/notes/20260515_shogi_pairing_ux_score_list_readability_design.md`（本ファイル、新規）
  - `HANDOFF.md`（PAIRING-UX-SCORE-LIST-READABILITY-DESIGN ポインタ追加）
- 変更しないファイル: `shogi_v4.html` / `test/` / `test/e2e/visual_regression.spec.js-snapshots/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js`

---

## 12. IMPL-LIGHT 着地（2026-05-15 追補）

`PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT` として §8.1 第一候補を実装し、Draft PR で main 反映を予定する。

### 12.1 実装範囲

- ✅ **暫定成績の sort 2 次キー追加**（[`renderTournament`](shogi_v4.html:5067-5079) の比較関数）
- ✅ **暫定成績カードの番号 / 氏名別要素化**（[`buildScoreGridHtml`](shogi_v4.html:4868)、`.sno` / `.snm` を追加）
- ✅ **対戦済みリストの並び順明示**（[`buildPlayedHistoryHtml`](shogi_v4.html:4879) 見出しに「（勝数順）」+ 補足文）
- ✅ CSS 追加（`.score-card .sno` / `.snm`、最小、既存 `.sname` ルールは温存）
- ❌ **対戦済みリスト独自並び順** 未実装（§4.2 候補 A + C のまま、§7 第二候補へ）
- ❌ **切替 UI** 未実装（§4.2 候補 D、過剰回避）
- ❌ `formatParticipantLabel` API / `getNameWithNo` / 既存 `.sname` 削除 すべて行わない

### 12.2 採用した sort 比較関数

```js
var sorted=players.slice().sort(function(a,b){
  var winDiff=(wins[b.id]||0)-(wins[a.id]||0);
  if(winDiff!==0)return winDiff;
  var ea=(a&&typeof a.entry_no==='number'&&a.entry_no>0)?a.entry_no:Infinity;
  var eb=(b&&typeof b.entry_no==='number'&&b.entry_no>0)?b.entry_no:Infinity;
  return ea-eb;
});
```

- **1 次キー**: `wins desc`（既存挙動と同じ）
- **2 次キー**: `entry_no asc`
- **entry_no fallback**: 未設定 / 0 / 負値 / 非 number は `Infinity` で末尾送り
- `generatePairing()` 側の sort（[shogi_v4.html:4580](shogi_v4.html:4580)、ランダム化前段）は **対象外**（ペアリング algorithm の意図的ランダム化を維持）

### 12.3 採用した score-card 構造

```html
<div class="score-card">
  <div class="sno">A-12</div>        <!-- 新規: 番号、nowrap -->
  <div class="snm">山田太郎</div>     <!-- 新規: 氏名、word-break:break-word -->
  <div class="swins">2</div>          <!-- 既存: 大数字、未変更 -->
  <div style="font-size:11px;color:#888">2勝0敗</div>  <!-- 既存: 小記録、未変更 -->
</div>
```

- 番号書式: `cls + '-' + entryNoOf(cls, p.id)` = `'A-12'`（PR #103 pairing-card 補助ラベルと整合）
- 氏名: `getName(p.id, cls)` を直接呼出
- 両方 `escapeHtml()` 経由（XSS 防止、既存流儀踏襲）
- 既存 `.sname` CSS ルールは **削除せず温存**（dead code 化するが他箇所への影響回避）

### 12.4 採用した対戦済みリスト見出し

```html
<h3>対戦済みリスト<span ...>（勝数順）</span></h3>
<div ...>※ 暫定成績と同じ勝数順で表示しています。対戦相手はラウンド順です。</div>
```

- 並び順は **暫定成績と sorted 共有のまま**（変更なし）
- 「勝数順」明示 + 対戦相手タグが「ラウンド順」であることも併記
- 切替 UI / 独自 sort は **追加しない**

### 12.5 CSS 追加

```css
.score-card .sno{font-size:11px;color:#1F3864;font-weight:500;white-space:nowrap;margin-bottom:2px}
.score-card .snm{font-size:12px;font-weight:500;line-height:1.3;word-break:break-word;margin-bottom:2px}
```

- 最小限の 2 ルールのみ。`.sname` ルール（既存）は温存
- `.sno` は `nowrap` で番号が折り返さない
- `.snm` は `word-break:break-word` で長い氏名のみ折り返し許容
- `.score-grid` / `.score-card` のレイアウトは **未変更**

### 12.6 不変項目

- ✅ `getName()` ([231](shogi_v4.html:231)) / `getNameWithNo()` ([277](shogi_v4.html:277)) / `entryNoOf()` ([243](shogi_v4.html:243)) / `formatParticipantLabel()` 本体 **未変更**
- ✅ `getNameWithNo` の他 callsite（変更モーダル / 対戦履歴行頭 / 過去結果 等）は **未改修**（全置換していない）
- ✅ `evaluatePairingQuality()` ([4384](shogi_v4.html:4384)) / `warning object` 構造 **未変更**
- ✅ pairing-card 補助ラベル（`data-pairing-aux="p1"`/`"p2"`、PR #103）**未変更**
- ✅ `generatePairing()` 内 sort（L4580）/ ランダム化ロジック **未変更**
- ✅ `state.players[cls]` 配列順の物理改変なし（sort は浅いコピーに限定）
- ✅ `calcFinal` / `renderResults` / `printResults` **未変更**
- ✅ `buildPastResultsHtml` / `buildCurrentPairingsHtml` 主要構造 **未変更**
- ✅ 既存 `.sname` CSS ルール **温存**（dead code 化、削除せず）
- ✅ forbidden files (`docs/specs/` / `.github/workflows/` / `package*.json` / `playwright.config.js`) 未変更

### 12.7 追加テスト

- 新規ファイル: `test/test_pairing_ux_score_list_readability.js`
- `test/run_tests.sh` に起動 stanza 追加
- **54 アサート全 PASS**:
  - 構造: `renderTournament` 比較関数 / `buildScoreGridHtml` `.sno` `.snm` 出力 / `buildPlayedHistoryHtml` 見出し / CSS ルール / `entryNoOf` `getName` 直接呼出 / `escapeHtml` 経由
  - 不変項目: pairing-card 補助ラベル / `evaluatePairingQuality` 戻り値 / 既存 helper / `generatePairing` ランダム化 / `getNameWithNo` 全置換していない（呼出 12 件残存）
  - 切替 UI 追加なし / 対戦済みリスト独自 sort 追加なし
  - **振る舞いテスト** 4 件: 同勝数違い → wins desc / 同勝数 → entry_no asc / entry_no 未設定 → 末尾 / entry_no 不正値（0）→ 末尾
- 既存 + 新規合わせて **全 71 アサート PASS**（70 → 71、+54 新規、stanza 1 追加）

### 12.8 Visual Regression 影響

- **影響あり想定**: 暫定成績カードの構造変化（`.sname` 1 要素 → `.sno` + `.snm` 2 要素）により、score-card 内のレイアウトが微妙に変化（番号と氏名が確実に別行）
- 旧 baseline では `getNameWithNo()` の文字列が `.sname` 1 行で表示（一部端末で折り返し）
- 新 baseline では `.sno`（番号、nowrap）+ `.snm`（氏名）の 2 行構造
- **Draft PR 作成後、CI の E2E / Visual Regression を確認**。red の場合は **自律更新せず、ユーザー判断を仰ぐ**（PR #103 の流れに従う）

### 12.9 次タスク候補

§7 の優先順位は維持:

| 順位 | 候補 | 起点条件 |
|---|---|---|
| 第一 | **運用観察** | 暫定成績カードの新表示が現場で読みやすいか / 同勝数内 entry_no 順が予測可能か / スマホ表示で破綻しないか |
| 第二 | `PAIRING-UX-PLAYED-LIST-ORDER-IMPL-LIGHT` | 対戦済みリストを独自に番号順化したい需要が出た場合 |
| 第三 | `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT` | 「対戦相手の変更」モーダル option / 行内表示の helper 化（独立進行可）|

### 12.10 変更ファイル（本 IMPL-LIGHT PR）

- `shogi_v4.html`:
  - CSS（`.score-card .sno` / `.snm` 追加）
  - `renderTournament` sort 比較関数 2 段化
  - `buildScoreGridHtml` `.sname` → `.sno` + `.snm`
  - `buildPlayedHistoryHtml` 見出し「（勝数順）」+ 補足文
- `test/test_pairing_ux_score_list_readability.js`（新規、54 アサート）
- `test/run_tests.sh` — 起動 stanza 追加
- `docs/notes/20260515_shogi_pairing_ux_score_list_readability_design.md` — 本 §12 追補
- `HANDOFF.md` — IMPL-LIGHT ポインタ追加
