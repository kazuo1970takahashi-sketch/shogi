# shogi A-4.2.1 hotfix Codex Gate Review 依頼

**作成日時**: 2026-05-07 17:50 JST
**対象 PR**: fix(a-4-2-1): A-4.2 hotfix - pp-add-btn を mousedown + touchstart 化
**ブランチ**: `hotfix/a-4-2-1-pp-add-btn-event`(main `890c2a1` 起点)
**仕様書**: なし(Quick 運用、memory「過剰品質ゲート回避」「PoC 速度優先」整合)
**事前調査**: 本セッション直前の Stage 1 偽陽性レポート §3 + Stage 4 完了レポート §1 #3 申し送り
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge

---

## 1. 変更サマリ

A-4.2 リグレッション(commit `73961d3` 混入)の hotfix。production 修正は **`shogi_v4.html` 1 関数のみ**(L1294-L1306 → +19/-1)。

### 背景

- 過去参加者パネル(`.pp-add-btn`)の A/B ボタンは **`click` event listener のみ** を bind
- iOS Safari 実機で `click` event が発火しない or 大幅遅延 → 髙橋さん観察「過去参加者から選ぶときにクラス A/B を選択できない」
- サジェスト側(`.suggest-add-btn`、L2361-2374)は **`mousedown` + `touchstart` + `click`(stop only)** の 3 段 bind で実機安定動作

### 修正

`.pp-add-btn` を `.suggest-add-btn` と **完全対称化**:
- `mousedown` で `handlePastParticipantClassAdd` 発火
- `touchstart` で同上
- `click` は伝播停止のみ(実機環境差吸収)

### 変更ファイル

- `shogi_v4.html`(+19 / -1、`bindPastParticipantsPanelEvents` 関数内 1 ブロック)

### 変更しないファイル

- 他 production 一切無変更
- 既存 helpers / factory / e2e / unit テストすべて無変更
- A-T Stage 2a〜8 で確立した「production 不変原則」は本 hotfix で初めて意図的に破る(production 修正対象がそもそもの本 hotfix 目的のため)

---

## 2. 受け入れ条件 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | 既存 465 件緑維持 | `npx playwright test` | ✅ **465 passed** |
| 2 | 単体 50 件緑維持 | `npm test` | ✅ **PASS=50** |
| 3 | A-4.2 回帰 unit test 緑 | shogi_assertions.test.js -g "A-4.2 regression" | ✅ **6 passed**(3 件 × 2 project) |
| 4 | shogi_app_a4_2 Stage 2 describe 緑 | shogi_app_a4_2.spec.js -g "Stage 2: 過去参加者パネル" | ✅ **26 passed**(13 it × 2 project) |
| 5 | production diff 最小性 | `git diff main shogi_v4.html` | ✅ **+19 / -1**(1 関数内、handler 種別変更のみ) |
| 6 | Stage 4 完了基準 #3 達成 | 「A-4.2.1 hotfix 適用後緑」が本 PR で実現 | ✅ Stage 4 完了レポート §1 #3 申し送りを本 commit で達成 |

---

## 3. 実装上の判断ポイント(Codex の論点候補)

### 3.1 pp-add-btn と suggest-add-btn の対称性

| 項目 | suggest-add-btn(L2361-2374) | pp-add-btn(本 hotfix 後) |
|---|---|---|
| `mousedown` listener | ✅ handler 呼出 | ✅ 同 |
| `touchstart` listener | ✅ handler 呼出 | ✅ 同 |
| `click` listener | ✅ stopPropagation のみ | ✅ 同 |
| `preventDefault()` 呼出 | ✅ 全 listener で | ✅ 全 listener で |
| `stopPropagation()` 呼出 | ✅ 全 listener で | ✅ 全 listener で |
| handler 内 cls / mid 取得 | closure(m, cls 直接渡し)| DOM 属性経由(`data-cls` / 親行 `data-mid`)|

handler 内の cls / mid 取得方法のみ非対称。これは **production 構造の差**(suggest 側は描画時点で member 情報が closure で渡せる、pp 側は再描画時に DOM の data 属性として埋め込まれる)に起因し、本 hotfix で変えるべきものではない。

### 3.2 二重発火懸念

**回避メカニズム**:
1. `mousedown` または `touchstart` 発火 → `handlePastParticipantClassAdd` 呼出 → `addPlayerFromMaster` 成功 → `renderPastParticipantsPanel` で **panel innerHTML 全置換 → 元の button 要素は detach、event handler も自動解除**
2. 後続の `mousedown` / `click` event は detach 済みの要素には届かない

これは `.suggest-add-btn` と完全に同じメカニズム(`closeSuggestList()` で suggest 全体が消える)。

**preventDefault() の効果**:
- `touchstart` で `preventDefault()` → iOS Safari の compatibility mouse events(mousedown / mouseup / click)発火を抑制
- 仮に再描画前に compatibility events が発火しようとしても、preventDefault でキャンセル済

### 3.3 既存 e2e 緑維持の根拠

Playwright の `locator.click()` は **W3C 仕様に従い `mousedown` → `mouseup` → `click` の順に event を dispatch** する。新 handler は `mousedown` で発火するため、playwright `.click()` から正しく呼ばれる。

検証: 全 e2e 465 件、Stage 2 describe 26 件、回帰 unit 6 件、すべて修正後も緑。

### 3.4 Stage 4 mutation testing への影響

**production の `addPlayerFromMaster` は無変更**(L936、`cls:cls` / `state.players[cls].push(player)` 等のロジック完全保持)。本 hotfix は event handler の listener 種別のみ変更。

→ Stage 4 で実施した M1(`addPlayerFromMaster` cls 反転)/ M2(push 先反転)mutation は **依然として RED 検出可能**(本 hotfix 後も独立に再検証可能)。

### 3.5 revert 73961d3 を不採用とした理由

- `73961d3` は merge commit、A-4.2 機能全体(過去参加者 + サジェスト両方の A/B ボタン UI)を含む
- revert すると **A-4.2 機能自体が消失**(髙橋さんが運用している UI が消える)
- conflict 自体は無さそう(以降 `shogi_v4.html` 不変)だが、機能消失の代償が大きすぎる
- → **event handler のみ修正する本 hotfix の方が合理的**

### 3.6 production 不変原則を破った判断

A-T Stage 2a〜8 で確立した「production 不変原則」は本 hotfix で意図的に破る。

**根拠**:
- Stage 2a〜8 の「production 不変」は **テスト基盤強化フェーズ** での原則(テスト追加で production 挙動を変えない)
- 本 hotfix は **production バグ修正フェーズ**(A-4.2.1)で別の責務
- A-T 完了時点で「Stage 4 完了基準 #3: A-4.2.1 hotfix 適用後緑」が予約済の申し送り
- → 本 hotfix は production 不変原則の例外として spec 上想定済

---

## 4. コミット履歴

```
80c67a5 fix(a-4-2-1): pp-add-btn を mousedown + touchstart 化(iOS Safari 対応、suggest-add-btn と対称化)
890c2a1 feat(stage-8): A-T フェーズ区切り総括 + 完了レポート (#18)
```

単一 commit、Codex review request は別 commit で追加予定。

---

## 5. Codex への確認依頼

下記 5 観点を A 判定基準として独立検証をお願いします。

1. **pp-add-btn と suggest-add-btn の対称性**: 3 listener(mousedown / touchstart / click)+ preventDefault / stopPropagation の扱いが完全に対称か(handler 内 cls/mid 取得方法の差は production 構造由来で正当か)
2. **二重発火懸念**: `renderPastParticipantsPanel` による button 要素差し替え + `preventDefault()` で iOS 実機 / Desktop 両方で二重 firing が発生しないか
3. **既存 e2e 緑維持**: 465 e2e + 50 unit が緑、特に shogi_app_a4_2 Stage 2 describe 26 件が修正後も緑
4. **Stage 4 mutation 検出能力**: `addPlayerFromMaster` の M1/M2 mutation が依然として RED 検出可能か(production 関数本体は無変更のため影響なし想定、独立確認希望)
5. **production diff の最小性**: `git diff main shogi_v4.html` が +19 / -1、`bindPastParticipantsPanelEvents` 関数内の 1 ブロックのみ変更、余計な修正混入なし

**特に注視してほしい点**:
- `.pp-add-btn` の handler 3 つ(mousedown / touchstart / click)が closure で参照する変数の安全性(for ループ内 var による hoisting で、各 listener が `e.currentTarget` を参照するため iteration index 依存なし、安全と判断)
- iOS Safari の実機挙動を本 hotfix で再現できているか(この観点は実機テストで髙橋さん側で別途確認、Codex は spec 整合性の観点で評価)
- 本 hotfix が A-T フェーズで構築した 3 層 regression 防止層(L1 構造的 e2e / L2 Mutation 監視 / L3 Visual regression)を **無効化していない**こと(production 不変原則を意図的に破ったが、テスト基盤側は無変更)

判定 A 以上であれば squash merge → main 同期 → A-4.2.1 hotfix 完了 → 髙橋さん側で実機検証。
