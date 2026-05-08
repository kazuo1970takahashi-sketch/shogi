# Hotfix Phase 4 実装 Plan: 対戦相手変更 UI を swap 化

- 作成: 2026-05-08(木) Plan Mode
- spec: `docs/specs/20260508_1907_phase4_pairing_swap_spec.md` (v2, commit `1bc99df`, ChatGPT A 判定済)
- 実装プロンプト: `docs/specs/20260508_1929_phase4_pairing_swap_implementation_prompt.md` (commit `bd7021c`)
- 対象ファイル: `shogi_v4.html` のみ
- 想定実装規模: production +60〜90 行 / e2e +8 件

> ⚠ Plan Mode の制約により、本 Plan は harness ファイル `~/.claude/plans/kind-booping-sparrow.md` に出力。**承認後の実装着手 ステップ 0** で本ファイル内容を `docs/specs/<TS>_phase4_pairing_swap_plan.md` に配置(commit + push)してから実装に入る。

---

## Context

5/8 実機運用検証で、ペアリング後の「対戦相手の変更」モーダル(`chg-save`) が常に重複エラーで弾かれて事実上機能しないことが発覚。実装当初(`5dd90ad`、4/21) から **1 名置換 (replace) UI** として作られ、ユーザー期待の任意ペア組み替え (swap) は元々未実装。5/10 月例大会本番直前の Hotfix として、replace のみ → replace + swap 自動判別に動作仕様変更する。spec §1〜§3 参照。

---

## §3 確認 #1〜#5 結果(実コード検証済)

### #1 `pairHasRematch` の探索対象範囲 → **過去ラウンドのみ・対応不要**

- **定義**: shogi_v4.html:261 `function pairHasRematch(cls,p1,p2)`
- **探索対象**: `state.results[cls]` を `r=0; r<length` で全走査。`state.pairings`(現在ラウンド暫定) は **見ていない**
- **唯一の呼び出し**: shogi_v4.html:3494(`chg-save` ハンドラ内)
- **Plan 影響**: **修正不要**。spec §4.5 #5「過去ラウンドのみに限定」要件は **既に満たしている**。spec §10 実装手順 #2 の確認結果は「現状維持で OK」

### #2 winner 入力済み判定 → **`!winner` または `winner != null`**

- **フィールド名**: `winner`
- **未入力値**: `null`(`state.pairings[cls][idx].winner=null` で初期化、shogi_v4.html:3429, 3498)
- **入力済み値**: プレーヤー ID(`setWinner` で `wid` を代入、shogi_v4.html:3447)
- **既存判定式**: shogi_v4.html:3515 `state.pairings[cls].filter(function(m){return !m.winner;})` / shogi_v4.html:3519 `if(!state.results[cls][r][m].winner){…}`
- **Plan 採用**: prerequisite チェックでは `!match.winner` を採用(falsy 全般を未入力扱い、既存コードと整合)

### #3 `getDuplicatePlayersInPairings` の入力形式 → **`(cls)` のみ、内部で `state.pairings[cls]` 参照**

- **定義**: shogi_v4.html:271 `function getDuplicatePlayersInPairings(cls)`
- **内部**: `state.pairings[cls]` を直接参照、各要素の `m.p1`, `m.p2` を used map に積んで重複検出
- **戻り値**: 重複したプレーヤー ID の配列(空配列なら重複なし)
- **Plan 影響**: swap 後の防御層(spec §4.5 #4)を実装するには、`state.pairings[cls]` を **swap 後の状態に更新してから** 呼ぶ必要がある。具体的には:
  - swap 後の 2 ペアを構築
  - prerequisite チェック(再戦・winner)が全て pass した後、`state.pairings[cls][idx]` と `state.pairings[cls][otherIdx]` の **両方を更新**
  - 直後に `getDuplicatePlayersInPairings(cls)` を呼んで `length===0` を検証
  - もし非ゼロ(通常はあり得ないが防御層) → ロールバック(更新前の値に戻す) + エラー表示
- **代替案**: 関数を `(cls, pairingsOverride)` シグネチャに拡張(後方互換)。今回は **採用せず**(関数追加最小化方針 spec §5、commit blast radius 最小)

### #4 `chg-save` クリックハンドラ → **shogi_v4.html:3475-3501**

- **DOM 定義**: `buildChangePairingModalHtml` 内 shogi_v4.html:3470(button id=`chg-save`)
- **ハンドラ登録**: `bindChangePairingModalEvents(cls, idx)` shogi_v4.html:3474-3502
- **Modal 表示元**: `changePairing(cls, idx)` shogi_v4.html:3504-3512(`state.pairings[cls][idx]` を `match` として渡す、candidates は `state.players[cls]` 全員)
- **現在の処理フロー**:
  1. p1, p2 をドロップダウンから取得 (3476-3477)
  2. `p1===p2` なら拒否 (3478)
  3. **L3481-3492: ローカル重複チェック** — 他ペア(idx 以外)に p1/p2 が存在したら **「重複」と判定して拒否** ← これが swap 候補を弾いている根本原因
  4. `pairHasRematch(cls,p1,p2)` で再戦確認、true なら confirm (3494-3496)
  5. `state.pairings[cls][idx]={p1,p2,winner:null}` で更新 (3498)
  6. modal 削除 + render + save (3499-3500)
- **Plan 影響**: L3481-3492 のロジックを **完全に置き換え**(他ペアに在籍 → swap 系統 B に分岐)

### #5 `state.results` / `state.players` / `state.pairings` 構造 → **現在ラウンドは `state.pairings`、過去ラウンドは `state.results`**

- **state 初期化**: shogi_v4.html:204-211
  ```js
  var state = {
    players: {A:[], B:[]},        // クラス別、各 {id, name}
    rounds: 4,
    pairings: {A:[], B:[]},       // 現在ラウンド分のみ、各 {p1, p2, winner}
    results: {A:[], B:[]},        // 過去ラウンド配列、results[cls][r][m] = {p1, p2, winner}
    started: false,
    report: {…}
  };
  ```
- **重要差分**: spec §4.4 は「`state.results[cls][round][i]` のペア情報を更新」と書くが、**実コードでは現在ラウンド = `state.pairings[cls][idx]` を更新する**(shogi_v4.html:3498、`submitRound` で `state.results` に push される)。**Plan は実コード準拠**で `state.pairings[cls]` を更新対象とする(spec §4.4 の記述は実装上 `state.pairings` に読み替え)。
- **swap 確定後の更新対象(確定)**:
  - `state.pairings[cls][idx]` ← 対象ペアの swap 後
  - `state.pairings[cls][otherIdx]` ← 相手ペアの swap 後
  - `save()`(localStorage 自動保存)
  - `renderTournament(cls)`(再描画)

---

## 追加の重要発見(ChatGPT v1/v2 レビュー外)

### 発見 A: UI は p1/p2 両ドロップダウン編集可能(shogi_v4.html:3452-3472)

- 現 modal (`buildChangePairingModalHtml`) は **「先手」「後手」両方をドロップダウン化** し、candidates は同クラス全選手(フィルタなし)
- spec §4.1 は「**対象選手 = ボタンを押したペアの片方**」「変更先選手選択 UI = 同クラス全選手から対象選手と既ペア相手を除外」と単数前提で書かれているが、現 UI は両方変更可能
- spec §4.2 「変更先選手 X」も単数前提
- → **UI は現状維持(両方編集可能)**、ロジック側で「変更があった側を X、変更がなかった側を ○○」と検出する方針を採用(後述「実装方針 ステップ 4」)
- 両側とも変更された場合は **spec §8 範囲外として拒否**(「2 選手同時変更は対象外。1 名ずつ変更してください」)

### 発見 B: spec §4.4 の表記ズレ

- spec §4.4 は `state.results[cls][round][i]` を更新対象と記述するが、実コードは `state.pairings[cls][idx]` が現在ラウンドの管理場所(過去ラウンドだけが `state.results[cls][r][m]` に格納)
- → 実装は **`state.pairings[cls]` を更新**(spec の記述を実コード基準に読み替え)、`state.results` は触らない

### 発見 C: `state.players[cls]` を candidates に渡しているが、対象選手・既ペア相手のフィルタは現状なし(shogi_v4.html:3506)

- spec §4.1 の「対象選手と既ペア相手を除外」は未実装
- 本 Hotfix の範囲では **UI フィルタは追加しない**(範囲拡大回避)。同ペア内 swap 拒否(spec §4.5 #3)はハンドラ側の防御で対応(L3478 の `p1===p2` チェックは既に存在し、これを維持しつつ「対象選手自身を再選択 = no-op」も保存時に検出)

---

## 実装方針(spec §4 + §10 準拠、ステップ順)

### ステップ 0 (Plan 承認直後): Plan 配置

```bash
TS=$(TZ=Asia/Tokyo date +%Y%m%d_%H%M)
# 本 Plan を docs/specs/${TS}_phase4_pairing_swap_plan.md として配置
git add docs/specs/${TS}_phase4_pairing_swap_plan.md
git commit -m "docs(spec): Hotfix Phase 4 implementation plan (Claude Code Plan Mode)"
git push origin main
```

### ステップ 1: ヘルパ関数追加(1 関数のみ、spec §5 準拠)

**`findPairContainingPlayer(cls, playerId, excludeIdx)` を `pairHasRematch` 直後に追加(shogi_v4.html:271 直前)**

```js
function findPairContainingPlayer(cls, playerId, excludeIdx){
  for(var i=0;i<state.pairings[cls].length;i++){
    if(i===excludeIdx)continue;
    var pair=state.pairings[cls][i];
    if(!pair)continue;
    if(pair.p1===playerId||pair.p2===playerId)return i;
  }
  return -1;
}
```

- 戻り値: 該当ペアの index、見つからなければ -1
- `excludeIdx` で対象ペア自身を除外(同ペア内の片方を選んでも所属判定で hit しない)

### ステップ 2: `chg-save` ハンドラ(L3475-3501) を 2 系統分岐に置き換え

**置き換え後の処理フロー(疑似コード)**:

```js
document.getElementById('chg-save').addEventListener('click', function(){
  var newP1 = document.getElementById('chg-p1').value;
  var newP2 = document.getElementById('chg-p2').value;
  var match = state.pairings[cls][idx];
  var oldP1 = match.p1, oldP2 = match.p2;

  // [§4.5 #1 は changePairing 入口で済む(下記ステップ 3)]

  // 同ペア内 / 自分自身選択防御(spec §4.5 #3)
  if(newP1===newP2){alert('同じ選手を先手・後手両方に選べません');return;}
  if(newP1===oldP1 && newP2===oldP2){alert('変更がありません');return;}

  // 「変更があった側」を X として検出(発見 A 対応)
  // パターン1: p2 のみ変更 → ○○=oldP1=newP1, X=newP2
  // パターン2: p1 のみ変更 → ○○=oldP2=newP2, X=newP1
  // パターン3: 両方変更 → spec §8 範囲外
  var keepPlayer, X;
  if(newP1===oldP1 && newP2!==oldP2){ keepPlayer=oldP1; X=newP2; }
  else if(newP2===oldP2 && newP1!==oldP1){ keepPlayer=oldP2; X=newP1; }
  else { alert('2 選手同時の変更は対象外です。1 名ずつ変更してください');return; }

  // X の所属判定(spec §4.2)
  var otherIdx = findPairContainingPlayer(cls, X, idx);

  if(otherIdx === -1){
    // === 系統 A: replace ===
    if(pairHasRematch(cls, keepPlayer, X)){
      if(!confirm('この組み合わせは過去に対戦済みです。再戦として保存しますか?'))return;
    }
    state.pairings[cls][idx] = {p1:newP1, p2:newP2, winner:null};
  } else {
    // === 系統 B: swap ===
    var otherPair = state.pairings[cls][otherIdx];

    // prerequisite §4.5 #2: 相手ペア winner 入力済みなら拒否
    if(otherPair.winner){
      alert('相手ペアが結果入力済みのため swap できません');
      return;
    }

    // swap 後の組み合わせ算出: (○○-X) と (▲▲-Y)
    // X と組んでいる Y を取得
    var Y = (otherPair.p1===X) ? otherPair.p2 : otherPair.p1;
    // ▲▲ = oldP2(keepPlayer===oldP1の場合) or oldP1(keepPlayer===oldP2の場合)
    var droppedFromTarget = (keepPlayer===oldP1) ? oldP2 : oldP1;

    // 再戦チェック(両ペア、§4.2 系統 B)
    if(pairHasRematch(cls, keepPlayer, X) || pairHasRematch(cls, droppedFromTarget, Y)){
      alert('swap で再戦が発生します。別の選手を選んでください');
      return;
    }

    // 確認ダイアログ(spec §4.3)
    var msg = 'swap を実行します。\n  ('+nameOf(oldP1)+'-'+nameOf(oldP2)+') → ('+nameOf(newP1)+'-'+nameOf(newP2)+')\n  ('+nameOf(otherPair.p1)+'-'+nameOf(otherPair.p2)+') → ('+swapResultPair(droppedFromTarget, Y)+')\nよろしいですか?';
    if(!confirm(msg))return;

    // 2 ペア同時更新(暫定、防御層後にロールバック可能)
    var backup1 = state.pairings[cls][idx];
    var backup2 = state.pairings[cls][otherIdx];
    state.pairings[cls][idx] = {p1:newP1, p2:newP2, winner:null};
    state.pairings[cls][otherIdx] = buildSwappedOtherPair(otherPair, X, droppedFromTarget);

    // 防御層(spec §4.5 #4): 重複なし検証
    if(getDuplicatePlayersInPairings(cls).length > 0){
      state.pairings[cls][idx] = backup1;
      state.pairings[cls][otherIdx] = backup2;
      alert('内部エラー: swap 後の重複を検出しました。変更を取り消しました');
      return;
    }
  }

  document.getElementById('chg-modal').remove();
  renderTournament(cls);
  save();
});
```

**実装メモ**:
- `nameOf(id)`: 既存ユーティリティを grep して活用、無ければインライン展開
- `buildSwappedOtherPair`: `otherPair.p1` と `otherPair.p2` のうち X だった側を `droppedFromTarget` に置換、`winner:null` 維持

### ステップ 3: `changePairing(cls, idx)` 入口で prerequisite §4.5 #1

shogi_v4.html:3504-3512 の `changePairing` 先頭に挿入:

```js
function changePairing(cls,idx){
  var match=state.pairings[cls][idx];
  if(match.winner){
    alert('結果入力済みのため変更できません');
    return;
  }
  // (以下 modal 表示 — 既存)
}
```

### ステップ 4: e2e 8 件追加(spec §7)

既存 e2e 配置先(`tests/e2e/` 等)を grep `phase` または `pairing_swap` で確認。spec §7 の 8 ケースを追加:

1. swap 成功(A-B / C-D の B を C に変更 → A-C / B-D)
2. swap で再戦衝突(過去ラウンドで A-C 対戦済 → エラー)
3. replace 成功(削除済選手の代替で 1 ペアのみ更新)
4. swap 確認ダイアログキャンセル(状態変化なし)
5. swap で過去結果に影響なし(state.results 不変)
6. winner 入力済みペアで変更ボタン → modal 開かずエラー
7. swap 相手ペア winner 入力済み → swap 拒否
8. swap 後の同ラウンド重複 0 件(`getDuplicatePlayersInPairings`)

既存パターン踏襲(force:true / raw click / factory / 代表 e2e、ユーザー設定済 review 軽量通過 5 項目)。

### ステップ 5: 全件 green 確認

- 既存 702 件 + 新規 8 件 = 710 件 全件 green
- 既存 replace 動作の e2e に regression なし(系統 A 経路)

### ステップ 6: PR 作成 + Codex review prompt 配置

- ブランチ: `hotfix/phase4-pairing-swap` 等
- PR タイトル: `feat(phase4): pairing change UI from replace to swap (Hotfix)`
- PR description: 実装プロンプト §6 テンプレート準拠
- Codex prompt: `docs/specs/<TS>_phase4_codex_review_prompt.md`(実装プロンプト §7 のテンプレート)

---

## 変更箇所サマリ(行番号)

| 箇所 | 種別 | 行範囲(現状) | 行数(追加/変更) |
|---|---|---|---|
| `findPairContainingPlayer` 追加 | 新規関数 | shogi_v4.html:270 直前 | +10 |
| `chg-save` ハンドラ置き換え | 既存置換 | shogi_v4.html:3475-3501 | -27 / +60 |
| `changePairing` 入口 winner チェック | 既存追記 | shogi_v4.html:3504-3505 | +4 |
| e2e 追加(8 件) | 新規 | tests/e2e/<該当> | +120〜200(参考) |

production 計: **+47 行 / -27 行 = 正味 +20 行 + 新規関数 10 行 = 約 +30〜70 行**(spec 想定 +50〜100 内)

---

## リスクと範囲外確認(spec §8 厳守)

### やらないこと(再確認)
- 自動ペアリングロジック本体 (`backtrack`, repair 等) ✗
- UI 全面刷新(modal 構造維持) ✗
- modal candidates フィルタ追加(対象選手・既ペア相手の除外) ✗ — 発見 C 参照
- クラス間 swap (A 級 ⇄ B 級) ✗
- 過去ラウンド swap (`state.results` 直接変更) ✗
- 3 ペア循環 swap ✗
- winner 入力済みペアの巻き込み swap ✗(prerequisite で拒否)
- 対局済み winner の修正 ✗

### リスク
- **R1**: spec §4.4 の `state.results` 表記と実コード `state.pairings` のズレ → Plan で実コード準拠と明記
- **R2**: 両側同時変更を spec §8 範囲外として拒否する判断は spec に明示なし → Plan で明示、ChatGPT v2 再レビューで拾われていれば対応、なければ User に確認
- **R3**: e2e 8 件のうち #5「過去結果に影響なし」は state.results 不変を assert する必要あり、テスト helper の整合確認

---

## 検証手順(end-to-end)

### 単体・統合
1. e2e 全件実行 → 710 件 green
2. 既存 702 件 regression なし(replace 経路)
3. `git diff` で範囲外変更なし(`shogi_v4.html` のみ + e2e ファイル)

### 手動(マージ前 staging)
4. 同クラス 2 ペア(A-B / C-D)で B → C swap → A-C / B-D 表示確認
5. 過去ラウンドで A-C 対戦済 → swap 試行でエラー
6. 削除済選手の代替で空席を選択 → replace 動作(1 ペア更新)
7. winner 入力済みペアの「変更」ボタン押下 → modal 開かずエラー
8. swap 確認ダイアログで「キャンセル」→ 状態変化なし

### 手動(マージ後 本番)
9. iPhone 実機で本番 URL → 対局管理タブ
10. swap / replace / winner 拒否の 3 系統リハーサル

---

## 完了条件(本 Plan 範囲)

- [ ] 本 Plan を `docs/specs/<TS>_phase4_pairing_swap_plan.md` に配置 + commit + push
- [ ] ステップ 1〜3 実装(shogi_v4.html)
- [ ] ステップ 4 e2e 8 件追加
- [ ] ステップ 5 全件 green(710 件)
- [ ] ステップ 6 PR 作成 + Codex prompt 配置
- マージは別プロンプト(本 Plan 範囲外、Codex Gate 通過後)

---

## 承認依頼事項

以下 3 点に明示承認 or 修正指示をいただきたい:

**Q1**: 「2 選手同時変更」を spec §8 範囲外として拒否する方針は OK か?(spec 明記なし、Plan 独自判断)

**Q2**: spec §4.4 の `state.results` 表記を実コード `state.pairings` に読み替える件、認識合わせ

**Q3**: ヘルパは `findPairContainingPlayer` 1 つのみ追加(spec §5 関数追加最小化方針) で良いか
