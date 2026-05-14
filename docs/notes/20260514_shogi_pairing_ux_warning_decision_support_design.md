# PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN — 要確認警告の判断材料表示設計

**Task ID**: `PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN`
**作業種別**: docs-only / design check / UX decision support
**前提**: PR #99（PAIRING-UX-INVENTORY、merge commit `244106099327b1fda4e2d1f45eeeb8ba9cf44a0a`）で §3.7「警告と判断材料の画面距離」が main 反映済み。本 design は §5.6 `PAIRING-UX-WARNING-DECISION-SUPPORT` の design check 段階
**HEAD**: `2441060`（PR #99 squash merge 後の main）

---

## 1. 目的と非目的

### 1.1 目的

- 対局管理画面の **「要確認」警告** の近くに判断材料を表示するための設計方針を整理する
- **異勝数ペア警告**（「同勝数で組めた可能性のある異勝数ペア N 件」）を、運営者がその場で判断できる UX に近づける
- スクロール往復（暫定成績 ⇄ 警告バナー）を減らす
- 警告を **「不安を煽る表示」ではなく「判断を助ける表示」** にする
- 段階的に実装できるよう Phase 分けし、各 Phase の依存・スコープ・懸念を明示する

### 1.2 非目的

- 今回は **実装しない**（PR は docs-only design check）
- `evaluatePairingQuality()` ([shogi_v4.html:4384](shogi_v4.html:4384)) の **判定仕様** を変更しない（戻り値の拡張は実装段階の論点として整理するに留める）
- `generatePairing()` ([4513](shogi_v4.html:4513)) などの pairing algorithm を変更しない
- 完全自動修正・最適組み合わせ提案を設計しない
- `alert` / `modal` の追加検討はしない（SAVE-UX 系で踏襲した「ブロックしない通知」方針を維持）
- 完全な同勝数候補表示の最終 UX を確定しない（Phase 4 は scope 内で「方向性」だけ示す）
- 完全デッドロック検知を設計しない（§5.4 `PAIRING-UX-DEADLOCK-INVENTORY` の別タスク）
- `PAIRING-UX-DISPLAY-LABELS` の実装に踏み込まない（参加者表示 helper の **共有可能性** だけ整理する）
- テスト・CI 設定を変更しない

---

## 2. 現状コードの確認

`shogi_v4.html`（HEAD `2441060`）の関連経路を関数 + 行番号で整理する。

### 2.1 `evaluatePairingQuality()` の入出力

[shogi_v4.html:4384-4511](shogi_v4.html:4384)

**入力**: `(pairings, results, players)` — いずれも配列。`pairings` は現ラウンドの `[{p1, p2, winner, lastModifiedBy}]`、`results` は確定済み過去ラウンド、`players` はクラス内参加者

**内部計算**:

| ステップ | 行 | 内容 |
|---|---|---|
| 1. 勝数集計 | [4389-4399](shogi_v4.html:4389) | `wins[playerId] = N` を `safeResults` 走査で算出（**内部のみ、戻り値に含まれない**）|
| 2. 過去対戦履歴 | [4401-4413](shogi_v4.html:4401) | `history[p1][p2] = true` を構築（**内部のみ**）|
| 3. ペアごと基本指標 | [4415-4435](shogi_v4.html:4415) | `pairDetails[i] = {idx, p1, p2, winDiff, isRematch, labels}` を構築 |
| 4. `avoidableWinDiffPairs` 算定 | [4437-4483](shogi_v4.html:4437) | 勝数群ごとに「内部マッチング（再戦回避）が成立するか」を `canMatchInternally()` バックトラックで判定。**判定根拠（どの群が内部マッチング可能 / 不可能だったか、どのプレイヤーが内部候補だったか）は変数 `groups` / `canMatchInternally` 内に閉じている** |
| 5. ラベル付与 | [4485-4500](shogi_v4.html:4485) | 各 `pairDetails[i].labels` に `同勝数`/`勝数差N`、`再戦`/`再戦なし`、`要確認`、`手動変更` を push |

**戻り値**（[4502-4510](shogi_v4.html:4502)）:
```
{
  totalWinDiff, maxWinDiff, sameScorePairCount,
  rematchCount, avoidableWinDiffPairs, warningHit,
  pairDetails: [{idx, p1, p2, winDiff, isRematch, labels}]
}
```

**戻り値に含まれない（= 表示側から参照できない）情報**:
- 各ペアの `w1`, `w2` 個別勝数（`winDiff` のみ）
- どのペアが「avoidable」と判定されたかの個別フラグ（**`avoidableWinDiffPairs` は数値のみ**）
- 「同勝数で組めた候補」のプレイヤー ID
- `wins{}` map 全体
- `history{}` map 全体

### 2.2 警告バナー文言生成

[shogi_v4.html:4880-4888](shogi_v4.html:4880)、`buildCurrentPairingsHtml()` ([4868](shogi_v4.html:4868)) 内

```
var quality=evaluatePairingQuality(state.pairings[cls],state.results[cls],state.players[cls]);
if(quality.warningHit){
  var warns=[];
  if(quality.rematchCount>0)warns.push('再戦 '+quality.rematchCount+'件');
  if(quality.avoidableWinDiffPairs>0)warns.push('同勝数で組めた可能性のある異勝数ペア '+quality.avoidableWinDiffPairs+'件');
  if(quality.maxWinDiff>=2)warns.push('勝数差 '+quality.maxWinDiff+' のペアあり');
  html+='<div class="alert alert-warn" ...>⚠ 要確認：'+escapeHtml(warns.join(' / '))+ ... '</div>';
}
```

**観察**:
- 警告バナーは **件数のみ**（「異勝数ペア 1 件」）。**該当ペア名・勝敗数・候補名は出ない**
- 警告は `buildCurrentPairingsHtml()` の冒頭付近（[4887](shogi_v4.html:4887)）に置かれるが、その後ペアカード一覧（[4890-4920](shogi_v4.html:4890)）が続く
- 個別ペアの `[要確認]` ラベル（[4496](shogi_v4.html:4496)）は **`isRematch || winDiff>=2 || (avoidableWinDiffPairs>0 && winDiff>0)`** で判定 → `avoidableWinDiffPairs=1` のとき **`winDiff>0` の全ペアに `[要確認]` が付く**（**特定の 1 ペアではない**）。これは現状の意図的設計だが、Phase 2/3 で「該当ペア特定」を進める際の論点になる

### 2.3 `renderTournament()` のレンダリング順

[shogi_v4.html:4961-4989](shogi_v4.html:4961)

| 順 | 関数 | 行 | 内容 | 画面位置 |
|---|---|---|---|---|
| 1 | `buildScoreGridHtml(cls, sorted, wins)` | [4822](shogi_v4.html:4822) | **暫定成績** score-card（氏名 + 大きい勝数 + `N勝M敗`） | 上部 |
| 2 | `buildPlayedHistoryHtml(cls, sorted, played)` | [4833](shogi_v4.html:4833) | 対戦済みリスト | 中部 |
| 3 | `buildPastResultsHtml(cls)` | [4845](shogi_v4.html:4845) | 過去の結果（クリックで修正）| 中下部 |
| 4 | `buildCurrentPairingsHtml(cls, roundNum, done)` | [4868](shogi_v4.html:4868) | **現ラウンド組み合わせ + ⚠️警告バナー + ペアカード一覧** | 下部 |

→ **暫定成績は最上部、警告バナーは最下部**。22 名クラスでは過去結果セクションが伸び、警告と暫定成績の距離は更に大きくなる

### 2.4 score-card と pairing-card の表示比較

| 表示要素 | score-card ([4827](shogi_v4.html:4827)) | pairing-card ([4902-4919](shogi_v4.html:4902)) |
|---|---|---|
| 氏名 | `getNameWithNo()`（`entryNo｜name`）| 同じ |
| 勝数 | **大きい数字 + `N勝M敗` 副表示** | **なし** |
| クラス | 暗黙（タブ）| 暗黙 |
| 支部 | なし | なし |
| 区分 | なし | なし |

→ **勝敗数情報は score-card にしかなく、pairing-card には無い**。Phase 1（勝敗数併記）はこの非対称を解消する変更

### 2.5 `wins{}` map の取得経路

- `getWins(cls)` ([293](shogi_v4.html:293)) が `state.results[cls]` を走査して `{playerId → wins}` を返す
- `renderTournament()` ([4966](shogi_v4.html:4966)) で `var wins=getWins(cls);` として 1 回計算 → `buildScoreGridHtml(cls, sorted, wins)` に渡す
- **`buildCurrentPairingsHtml(cls, roundNum, done)` には `wins` が渡っていない** → Phase 1 で勝敗数併記するなら、(a) 引数を `(cls, roundNum, done, wins)` に拡張、(b) 関数内で `getWins(cls)` を再計算、(c) `quality.pairDetails[i]` に `w1, w2` を含めるよう evaluatePairingQuality 戻り値を拡張、のいずれか

### 2.6 まとめ — 現状のギャップ

| ギャップ | 現状 | 解消に必要な変更 |
|---|---|---|
| ペアカードに勝敗数が無い | pairing-card は氏名 + ラベルのみ | **表示層のみ**（`getWins()` を渡すか再計算）|
| 警告バナーに該当ペアが無い | 「N 件」のみ | warning 文生成側で `pairDetails` を走査して該当ペアの氏名 + 勝敗数を含める（表示層 + 戻り値の `w1/w2` があれば軽量）|
| 「avoidable と判定された該当ペア」が特定できない | `avoidableWinDiffPairs` は数値のみ、ラベルは `winDiff>0` 全ペアに付く | **ロジック改修**（`evaluatePairingQuality` 戻り値に `avoidablePairIndexes: number[]` を追加）|
| 同勝数で組めた候補名が出ない | `groups` / `canMatchInternally()` 内部に閉じている | **ロジック改修**（候補名の保持と返却）|
| 警告 → 暫定成績へのジャンプが無い | DOM anchor / scrollIntoView 未配線 | **DOM 構造改修**（id 付与）|

---

## 3. 問題の定義

### 3.1 現象

- 警告は出る（「同勝数で組めた可能性のある異勝数ペア 1 件」）
- 判断材料の **暫定成績は画面上部**、警告バナーは画面下部 → スクロール往復が必須
- 警告文だけでは:
  - **どのペアが該当か**（pairing-card の `[要確認]` ラベルは出るが、`avoidableWinDiffPairs=1` のとき複数の `winDiff>0` ペアに同じラベルが付くため、ピンポイント特定にならない）
  - **どの勝敗差か**（pairing-card に勝敗数が無い）
  - **同勝数候補が誰か**（内部計算済みだが返却されない）
  - がすべて分からない

### 3.2 UX 上の問題

- 運営者が警告をすぐ判断できない → **大会中に判断が遅れる**
- スクロール往復が発生する → **小さな操作ストレスが繰り返し発生**
- 警告を **無視するリスク**（毎回スクロールするのが面倒で、慣れると見なくなる）
- 逆に、警告の意味が分からず **過剰に不安になるリスク**（「何が悪いのか分からないが警告が出ている」）
- 警告が **「判断支援」ではなく「注意喚起だけ」** に留まっている

### 3.3 解決の方向性

- **判断材料を警告の近くに置く**（近接表示）が根本解決
- ジャンプリンクは補助手段（近接表示の代替にはならない）
- 警告の意味を **短く補足** することで「過剰不安」を抑える
- ただし **大改修を一気にしない** — 段階的に Phase 1〜4 で進める

---

## 4. 表示すべき判断材料

警告近くに表示すべき候補を列挙する。**「警告バナー本文」** と **「pairing-card 行内」** の 2 箇所での表示を区別する。

### 4.1 候補 A — 該当ペア名

- 例: `A-03 山田太郎 vs A-14 鈴木一郎`
- 表示場所:
  - **警告バナー本文**: 「異勝数ペア 1 件: A-03 山田太郎 vs A-14 鈴木一郎」のように該当ペアを列挙
  - **pairing-card 内**: 既に氏名は表示済み（[4892](shogi_v4.html:4892)）
- 必要な情報源: `quality.pairDetails[i]` の `p1, p2`（既に持っている）
- 実装難度: 表示層のみ（**ただし「該当ペア」特定には §4 候補 C のロジック改修が前提**）

### 4.2 候補 B — 勝敗数 / 勝ち数・負け数

- 例: `A-03 山田太郎 (2勝0敗) vs A-14 鈴木一郎 (1勝1敗)`
- 目的: **異勝数ペアであることをすぐ判断できる**
- 表示場所:
  - **警告バナー本文**: 候補 A と組み合わせて「該当ペア + 勝敗数」
  - **pairing-card 行内**: 氏名の隣に `(2勝0敗)` を併記
- 必要な情報源: `wins{}` map / `state.results[cls].length` から `total - wins` を算出可能
- 実装難度: 表示層のみ（§2.5 の 3 案のいずれかで `wins` を渡す）

### 4.3 候補 C — 同勝数で組めた可能性のある候補者

- 例: `同勝数候補: A-08 佐藤二郎 (2勝0敗)`
- 目的: **「組めたはずの相手」を具体名で示し、警告の根拠を可視化**
- 注意:
  - **ロジック拡張が必要**（`evaluatePairingQuality()` の `groups` / `canMatchInternally()` の結果保持）
  - 候補が複数ある場合の表示設計が必要
  - **誤解を生む可能性**（「この候補と組めばよかったのに」と運営者が受け取り、機械的な手動修正を促す）
  - 候補 C は **Phase 4** に置き、まず Phase 1〜3 の効果を見てから判断
- 実装難度: ロジック改修 + 表示層

### 4.4 候補 D — 該当ペアのハイライト

- 目的: 組み合わせ結果一覧のどの行に警告が関係するかすぐ分かる
- 表示方法:
  - 該当 pairing-card の背景色を `#FBEAEA`（既存の `[要確認]` ラベル背景色）に寄せる
  - or 該当 pairing-card 左に縦線（border-left）
- 必要な情報源: 「avoidable と判定された該当ペア」の特定 → **§4.6 候補 C と同じロジック改修が前提**
- 実装難度: ロジック改修 + 表示層
- **注意**: 現状の `[要確認]` ラベルが `winDiff>0` 全ペアに付く挙動は「警告全体に対する大雑把な印」であって、「特定の avoidable ペアの印」ではない。Phase 3 でこの非対称を解消するか、現状維持で「警告対象群（候補)」のハイライトに留めるかが論点

### 4.5 候補 E — 暫定成績へのジャンプリンク

- 目的: 判断材料の位置までスクロールできる
- 表示方法: 警告バナー内に「暫定成績を確認」リンク → `scrollIntoView({behavior:'smooth'})`
- 必要な情報源: 暫定成績 section に DOM anchor / id を付与
- 実装難度: 表示層のみ（軽量）
- **注意**: 根本解決は近接表示。**ジャンプだけでは不十分**（往復が依然必要）。**Phase 1（勝敗数併記）が成功すればジャンプリンクは不要になる可能性が高い**

### 4.6 候補 F — 警告の理由を短く補足

- 例: 「このペアは勝ち数が異なります。ほかに同勝数同士で組める候補がある可能性があります。」
- 目的: **過剰不安の抑制 + 警告の意味の説明**
- 表示場所: 警告バナー本文の下（既存の「※ 操作はブロックされません。例外判断は現場運営に委ねます。」の上）
- 必要な情報源: 静的文言
- 実装難度: 表示層のみ（**最軽量**）

### 4.7 候補の整理

| 候補 | 必要情報 | 実装難度 | 効果 | 推奨 Phase |
|---|---|---|---|---|
| A. 該当ペア名 | 候補 C の特定ロジック | 中 | 中 | Phase 2 |
| B. 勝敗数 | `wins{}` | 低 | **高** | **Phase 1** |
| C. 同勝数候補名 | ロジック拡張 | 高 | 中（誤解リスクあり）| **Phase 4** |
| D. ハイライト | 候補 C の特定ロジック | 中 | 中 | Phase 3 |
| E. ジャンプリンク | DOM id | **最低** | 低（補助）| Phase 1 or Phase 2 補助 |
| F. 理由補足 | 静的文言 | 最低 | 中（不安抑制）| **Phase 1 or Phase 2** |

---

## 5. 実装段階案

### 5.1 Phase 1 — 組み合わせ結果に勝敗数を併記

**内容**:
- pairing-card 行内に各参加者の勝敗数を表示
- 例: `A-03 山田太郎 (2勝0敗)  vs  A-14 鈴木一郎 (1勝1敗)`
- 警告バナーに **候補 F（理由補足）** を追加（過剰不安抑制）

**変更範囲**:
- `buildCurrentPairingsHtml()` ([4868](shogi_v4.html:4868)) のシグネチャ拡張 or 内部で `getWins(cls)` 呼出
- `renderTournament()` ([4961](shogi_v4.html:4961)) から `wins` を渡す（既に L4966 で計算済み）
- 表示文字列の組立て（`escapeHtml` 必須）
- 警告バナーに固定文言追記（[4887](shogi_v4.html:4887)）

**メリット**:
- 警告が出た時に **pairing-card だけで異勝数ペアを目視できる**
- warning object の構造変更が不要（戻り値の互換性維持）
- `PAIRING-UX-DISPLAY-LABELS` と表示 helper を共有しやすい（§7）
- テスト追加が少なくて済む（既存 `test/test_pairing*.js` 想定）

**懸念**:
- 画面情報が増える（pairing-card のサイズ拡大）
- スマホ表示で折り返しが増える可能性 → 表示形式を `entryNo｜name (NW)` の短縮形にする選択肢あり

**スコープ外**:
- 該当ペアの特定（候補 A / D）
- 同勝数候補名（候補 C）
- DOM ジャンプ（候補 E）

### 5.2 Phase 2 — 警告本文に該当ペアを表示

**内容**:
- 「異勝数ペア 1 件」だけでなく、該当ペア名と勝敗数を警告バナーに含める
- 例:
  ```
  ⚠ 要確認: 異勝数ペア 1件
   ・A-03 山田太郎 (2勝0敗) vs A-14 鈴木一郎 (1勝1敗)
  ※ 操作はブロックされません。例外判断は現場運営に委ねます。
  ```

**変更範囲**:
- 該当ペアの特定が必要 → **ロジック改修**:
  - `evaluatePairingQuality()` の戻り値に `avoidablePairIndexes: number[]` を追加
  - `groups` / `canMatchInternally()` の結果から「どの pair が forced ではなく avoidable か」を判定して保持
  - 既存戻り値の互換性は維持（フィールド追加のみ）
- 警告バナー生成（[4885](shogi_v4.html:4885)）に該当ペア展開ロジック追加

**メリット**:
- 警告だけで判断しやすい
- スクロール往復が大きく減る
- 個別 pairing-card の `[要確認]` ラベルの **過剰付与問題**（§2.2）を解消できる（avoidable 該当ペアのみに付く方式へ移行）

**懸念**:
- `evaluatePairingQuality()` の戻り値を拡張するため **テスト対象が増える**（既存テストの戻り値アサート全件確認）
- 該当ペア特定ロジックのバグが新警告の誤表示を生むリスク
- 警告バナーが長くなる → 表示崩れ対策（横並びではなく改行 / リスト表示）

**前提**:
- Phase 1 が main 着地済み（勝敗数併記が pairing-card に存在する状態）

### 5.3 Phase 3 — 該当ペアのハイライト / ジャンプ

**内容**:
- 警告対象 pairing-card に背景色 / 縦線でハイライト
- 警告バナーから該当 pairing-card へ scrollIntoView ジャンプ
- pairing-card から暫定成績へ scrollIntoView ジャンプ（候補 E 拡張）

**変更範囲**:
- pairing-card に `id="pairing_<cls>_<idx>"` 付与
- 暫定成績 section に `id="score_grid_<cls>"` 付与
- 警告バナー本文の各ペア行に anchor リンク追加（`<a href="#pairing_<cls>_<idx>">`）
- pairing-card のスタイル切替（`background-color` / `border-left`）
- アクセシビリティ配慮（`aria-label`、focus 移動）

**メリット**:
- 視認性が向上
- 大人数（22 名）クラスで特に効く
- Phase 2 の長い警告バナーをタップ操作でブラウズしやすくなる

**懸念**:
- DOM 構造改修範囲が広がる
- スマホでの scrollIntoView 挙動差（iOS Safari 等）
- ハイライトの色が `[要確認]` ラベル背景色（`#FBEAEA`）と重複して視覚的に強すぎる可能性

**前提**:
- Phase 2 で `avoidablePairIndexes` が実装済み

### 5.4 Phase 4 — 同勝数で組めた候補名表示

**内容**:
- 「同勝数で組めた可能性がある」と判定した **候補者名** を警告本文に表示
- 例:
  ```
  ⚠ 要確認: 異勝数ペア 1件
   ・A-03 山田太郎 (2勝0敗) vs A-14 鈴木一郎 (1勝1敗)
     同勝数候補: A-08 佐藤二郎 (2勝0敗) も同勝数群に存在
  ```

**変更範囲**:
- `evaluatePairingQuality()` の `canMatchInternally()` を **「候補保持版」に改修** — 各勝数群で「内部マッチング可能だった候補ペア」を返す
- 戻り値に `avoidableWinDiffCandidates: {pairIdx: number, sameWinGroupCandidates: string[]}[]` を追加
- 警告バナー生成で展開

**メリット**:
- **警告の根拠が明確** になる
- 運営者が「変更」モーダルで手修正する際の判断材料が増える
- 警告の信頼性が増す（「機械が言うから避けるべき」ではなく「具体的に A-08 と組める」)

**懸念**:
- ロジック改修が中〜大規模
- 複数候補がある場合の表示設計（**全候補表示 / 1 件のみ / 件数のみ**の選択）
- **誤解リスク**: 「A-08 と組めばよかった」と運営者が受け取り、必ずしも最適でないペア変更を促す
- 既存テストの大幅追加
- パフォーマンス（バックトラックの計算量が増える可能性、`canMatchInternally` の全候補列挙化）

**前提**:
- Phase 1〜3 が main 着地済み
- 運用観察で「候補名表示が欲しい」というニーズが確認されている
- 候補名表示の **誤解リスクを抑える文言・UX** が事前 design check で固まっている

### 5.5 Phase 比較表

| Phase | 内容 | warning obj 改修 | 実装規模 | テスト追加 | 個人情報配慮 | 依存 |
|---|---|---|---|---|---|---|
| **Phase 1** | 勝敗数併記 + 理由補足 | **なし** | 小 | 小 | 軽（勝敗数のみ）| なし |
| **Phase 2** | 警告本文に該当ペア | あり（`avoidablePairIndexes`）| 中 | 中 | 軽 | Phase 1 |
| **Phase 3** | ハイライト / ジャンプ | なし（Phase 2 拡張）| 中 | 中 | 軽 | Phase 2 |
| **Phase 4** | 同勝数候補名表示 | **大幅あり** | 大 | 大 | 軽 | Phase 1〜3 |

---

## 6. UI 改善 / ロジック改善 / 運用ルール / 後回しの分類

### 6.1 A. UI 改善で対応できる可能性が高いもの

| 項目 | 該当 Phase | 由来 |
|---|---|---|
| 組み合わせ結果に勝敗数を併記 | **Phase 1** | §4 候補 B |
| 警告近くに短い理由補足を追加 | **Phase 1** | §4 候補 F |
| 暫定成績へのジャンプリンク | Phase 1〜2 補助 | §4 候補 E |
| 該当ペアの見た目上のハイライト（avoidable 特定が必要）| Phase 3 | §4 候補 D |
| pairing-card / score-card の表示文字列共通化 | Phase 1 + DISPLAY-LABELS | §7 |

### 6.2 B. ロジック改善が必要なもの

| 項目 | 該当 Phase | 戻り値拡張 |
|---|---|---|
| warning object に該当ペア詳細を持たせる | **Phase 2** | `avoidablePairIndexes: number[]` |
| 同勝数候補者名を表示する | **Phase 4** | `avoidableWinDiffCandidates: [{pairIdx, sameWinGroupCandidates}]` |
| `avoidableWinDiffPairs` の根拠を構造化する | Phase 2〜4 共通 | 上記の延長 |
| 警告の重大度や優先度を分ける（再戦 > 異勝数 > 勝数差等）| 後続候補 | severity フィールド追加 |

### 6.3 C. 運用ルールで吸収すべきもの

| 項目 | 明文化候補 |
|---|---|
| 警告が出た場合、最終判断は運営者が行う | 「※ 操作はブロックされません」の現行方針を維持 |
| 「同勝数で組めた可能性がある」は完全禁止ではなく要確認 | 同上、Phase 4 で「候補表示が出てもそれが最適とは限らない」明示 |
| 紙カード配布後は correction 的に扱う | PAIRING-UX-INVENTORY §3.6（紙運営との接続） |
| 警告だけで自動修正しない | 自動修正は §6.4 D に分類 |

### 6.4 D. 後回しでよいもの

| 項目 | 後回し理由 |
|---|---|
| 完全自動修正 | 運営者判断を奪う、自動化リスク大 |
| 最適組み合わせ提案 | 「最適」の定義が現場により異なる、SAVE-UX 系で踏襲した「自動修復しない」方針 |
| 複数候補のランキング表示 | Phase 4 の延長、誤解リスクが更に増える |
| デッドロック完全検知 | §5.4 `PAIRING-UX-DEADLOCK-INVENTORY` の別タスク |
| 警告の severity error 昇格 | 現状 warn 維持で十分、現場観察で必要性確認後 |

---

## 7. `DISPLAY-LABELS` との関係

### 7.1 共有可能性

`PAIRING-UX-DISPLAY-LABELS`（§5.1, PR #99 inventory）と `PAIRING-UX-WARNING-DECISION-SUPPORT` の **共通基盤** は **参加者表示 helper** にある。

| 表示要素 | DISPLAY-LABELS の関心 | WARNING-DECISION-SUPPORT の関心 |
|---|---|---|
| クラス内番号 + 氏名（`entryNo｜name`）| 既存 `getNameWithNo()` ([277](shogi_v4.html:277)) で十分 | 既存で十分 |
| 支部表示 | **追加候補**（同姓識別 §3.1）| 警告には不要 |
| 一般 / 支部員区分 | 追加候補（任意）| 不要 |
| **勝敗数** | 候補（必須ではない）| **Phase 1 必須** |
| 対戦済みマーカー | 候補（モーダル候補 list）| 不要 |
| 全勝マーカー | 候補 | 不要 |

→ **「勝敗数併記」** は WARNING-DECISION-SUPPORT 側で必須、DISPLAY-LABELS 側では任意。**両者で共通の表示 helper** を先に設計しておくと、重複実装を避けられる

### 7.2 helper 設計の共通論点

`getNameWithNo()` を発展させた `getDisplayLabelForPairing(playerId, cls, options)` のような helper を仮定すると、両タスクが要求する options は:

```
options = {
  withWins: boolean,        // 勝敗数併記（WARNING Phase 1）
  withBranch: boolean,      // 支部（DISPLAY-LABELS）
  withMemberKind: boolean,  // 一般/支部員区分（DISPLAY-LABELS 任意）
  withPlayedMarker: boolean,// 対戦済み (済) 表示（DISPLAY-LABELS モーダル）
  withWinMarker: boolean,   // 全勝 ★ 表示（DISPLAY-LABELS）
  forPublic: boolean        // 公開表示モード（個人情報配慮）
}
```

→ **共通 helper を先に設計** すると、両タスクの実装が直交化する

### 7.3 個人情報表示範囲の整理

- WARNING-DECISION-SUPPORT で表示するのは **勝敗数** のみ → 個人情報配慮は軽い（既に score-card で公開済み）
- DISPLAY-LABELS で **支部 / 一般・支部員区分** を表示するかは個人情報配慮で慎重判断
- 「運営者向け詳細表示」「参加者向け / 公開表示」の境界を `forPublic` フラグで分離する設計が候補

### 7.4 結論

- **WARNING-DECISION-SUPPORT の Phase 1 は DISPLAY-LABELS と強く関連** する（勝敗数併記の共通基盤）
- **参加者表示 helper を先に設計** すると、両方に効く
- ただし **今回の PR では helper 実装はしない**（design check のみ）
- helper の **共通設計** を扱う新タスク `PAIRING-UX-DISPLAY-HELPER-DESIGN` を §8 の第一候補として推奨

---

## 8. 推奨 Next Action

### 8.1 第一候補: `PAIRING-UX-DISPLAY-HELPER-DESIGN`

- **目的**: `DISPLAY-LABELS` と `WARNING-DECISION-SUPPORT` の両方で使える **参加者表示 helper** を設計する（docs-only design check）
- **想定変更**: docs-only。`getDisplayLabelForPairing()` 仮称の関数シグネチャ / options / forPublic フラグ / 個人情報表示範囲を整理
- **理由**:
  - 両タスクの **共通基盤** になる（§7）
  - 勝敗数併記・クラス番号・氏名・支部・区分を **一度整理** できる
  - 実装を小さく分けやすくなる（helper 着地後、両タスクが並走可能）
  - **個人情報表示範囲** も先に決められる（forPublic 設計）
  - SAVE-UX 系で踏襲した **design check → IMPL-LIGHT** パターンに乗せやすい

### 8.2 第二候補: `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`

- **目的**: **Phase 1 のみ実装** — 組み合わせ結果に勝敗数を併記 + 警告バナーに理由補足
- **条件**:
  - `PAIRING-UX-DISPLAY-HELPER-DESIGN` の方針が決まっている（helper を使うか直接書くか確定）
  - `evaluatePairingQuality()` の戻り値を変更しない範囲に限定
  - 既存テストへの影響が小さい
- **想定変更**:
  - `buildCurrentPairingsHtml()` ([4868](shogi_v4.html:4868)) に `wins` を渡す（または内部で再計算）
  - pairing-card の表示文字列に `(N勝M敗)` を追加
  - 警告バナーに固定文言「※ 同勝数で組める他の候補があった可能性があります。暫定成績で勝敗数を確認できます。」（仮、運用者レビュー必須）
  - 新規テスト: `test/test_pairing_warning_decision_support_phase1.js`
- **対象外**: Phase 2 以降（該当ペア特定・ハイライト・候補名表示）

### 8.3 第三候補: `PAIRING-UX-DISPLAY-LABELS-DESIGN`

- **目的**: 手動組み合わせ画面全体の参加者ラベル表示設計（モーダル候補 list / 行内表示 / 対戦済みマーカー等）
- **条件**:
  - 警告以外の選択 UI 改善を優先する場合
  - `PAIRING-UX-DISPLAY-HELPER-DESIGN` 着地後（推奨）
- **想定変更**: docs-only。`PAIRING-UX-INVENTORY` §3.1 / §3.2 / §3.5 を design に発展

### 8.4 優先順位の根拠

- 第一候補 `DISPLAY-HELPER-DESIGN` は **両タスクの共通基盤** → 単独で実装ハードルを下げる
- 第二候補 `WARNING-DECISION-SUPPORT-IMPL-LIGHT` は **現場ストレスの即解消** → Phase 1 のみで効果が大きい
- 第三候補 `DISPLAY-LABELS-DESIGN` は **広い改善範囲** だが、helper 設計に依存

→ **第一候補で helper を設計してから、第二候補（Phase 1）か第三候補（DISPLAY-LABELS）に分岐** するのが安全

---

## 9. 当面やらないこと

- 今回（本 design check PR）は **実装しない**
- `warning object`（`evaluatePairingQuality()` の戻り値）の構造変更を **今回の PR では確定しない**（Phase 2/4 で扱う設計案として整理するに留める）
- `evaluatePairingQuality()` の判定仕様を変更しない（`avoidableWinDiffPairs` の閾値 / 算定アルゴリズム / `canMatchInternally()` バックトラック等）
- 自動修正・自動再ペアリングしない
- `alert` / `modal` を追加しない
- **完全な同勝数候補表示**（Phase 4 候補 C）を今回の Phase 1 / 2 に巻き込まない
- デッドロック検知に広げない（`PAIRING-UX-DEADLOCK-INVENTORY` の別タスク）
- 自動組み合わせ最適化に広げない
- 紙カード出力後の訂正フロー実装に広げない（`PAIRING-UX-CARD-PUBLISH-CHECK` の別タスク）
- `PAIRING-UX-DISPLAY-LABELS` 本体の実装に踏み込まない（helper 設計の共有可能性だけ整理）

---

## 10. 完了条件

本 docs-only PR の完了条件:

- 警告と判断材料の **距離問題** が §3 で明文化されている
- **現状コードの表示順・判定経路** が §2 で関数名 + 行番号付きに整理されている
- **表示すべき判断材料** が §4 で候補 A〜F に整理されている
- **実装段階案 Phase 1〜4** が §5 で整理されている（依存・スコープ・懸念・前提を含む）
- **UI 改善 / ロジック改善 / 運用ルール / 後回し** が §6 で分類されている
- **DISPLAY-LABELS との関係** が §7 で整理されている（helper 共有可能性）
- **推奨 Next Action** が §8 で提示されている（第一 = `DISPLAY-HELPER-DESIGN`、第二 = `WARNING-DECISION-SUPPORT-IMPL-LIGHT`、第三 = `DISPLAY-LABELS-DESIGN`）
- **実装変更なし** / **テスト変更なし** / **CI 設定変更なし**
- 変更ファイルは `docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md` と `HANDOFF.md` のみ
- `shogi_v4.html` / `test/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js` は変更しない
- `PAIRING-UX-INVENTORY` §3.7 / §5.6 と矛盾しない記述

---

## 11. 関連 PR / docs

- 起源 inventory PR: PR #99（`PAIRING-UX-INVENTORY`、merge commit `244106099327b1fda4e2d1f45eeeb8ba9cf44a0a`、§3.7 / §5.6）
- 既存 inventory: [docs/notes/20260514_shogi_pairing_ux_inventory.md](docs/notes/20260514_shogi_pairing_ux_inventory.md)
- 既存 pairing 仕様: [docs/specs/20260508_1907_phase4_pairing_swap_spec.md](docs/specs/20260508_1907_phase4_pairing_swap_spec.md)
- SAVE-UX 系の段階パターン参照: [docs/notes/20260513_shogi_save_ux_status_map.md](docs/notes/20260513_shogi_save_ux_status_map.md)（§22〜§26、inventory → design check → IMPL-LIGHT → observation）
- 本 design check PR: `docs(pairing-ux): 要確認警告の判断材料表示を設計`
- 変更ファイル:
  - `docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md`（本ファイル、新規）
  - `HANDOFF.md`（PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN ポインタ追加）
- 変更しないファイル: `shogi_v4.html` / `test/` / `docs/specs/` / `.github/workflows/` / `package.json` / `package-lock.json` / `playwright.config.js`
