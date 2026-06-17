# FRP-IMPL-002 実装結果メモ — 1局目部分手合いの土台 + 未割当一覧表示

| 項目 | 値 |
|---|---|
| ID | FRP-IMPL-002 |
| 種別 | 実装（shogi_v4.html + test） |
| 日付 | 2026-06-17 |
| 設計 | `docs/specs/20260617_frp_design_002_post_225_partial_first_round.md`（FRP-DESIGN-002 / PR #227 merge 済） |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `b32720c`（#227 merge 後の HEAD、parent `021faa8`=#226） |
| branch | `feature/frp-impl-002-unassigned-list-foundation` |
| 状態 | Draft・未 merge（Ready化 / merge / production 反映は別途・人間の明示承認後） |

> 本スライスは **部分開始の土台＋1局目未割当者一覧の「表示」まで**。
> **選択者だけで対局を append 作成する処理は実装しない**（次スライス FRP-IMPL-003）。
> append ボタン・チェックボックスは **disabled**（イベント未登録・「次スライスで対応予定」明記）。

---

## 1. 前提（#225 後の事実）

- 参加者登録（受付）タブは **nav-only**。`#startBtn` の click = `goToTournamentFromReg()` で `save()` + 対局管理タブへ移動するだけ。round 作成・`started` 更新・pairing 生成を行わない。
- FRP の操作入口は **対局管理タブのクラス別セクション**（受付タブには手合作成導線を一切置かない）。
- `validateStartableClass`（2名以上・偶数・未開始）/ `startTournamentForClass` / `generatePairing` / `submitRound` は **無改変**。

## 2. 実装内容（shogi_v4.html・純追加）

新規 helper（いずれも既存関数の本体は無改変）:

| 関数 | 責務 | 副作用 |
|---|---|---|
| `validatePartialStartableClass(classInfo, players)` | 部分開始の可否判定（pure）。**偶数を要求しない**（1名以上・未開始で ok / 0名 skip-empty / 開始済み skip-already-started） | なし |
| `startClassPartial(cls)` | クラスを部分開始状態にする。`pairings[cls]=[]` / `results[cls]=[]` / `setClassStarted(cls,true)` → `save()` → SAVE-FRP-001 検証 → `renderTournament(cls)`。**`generatePairing` / `startTournamentForClass` / `applyStartForCandidates` を呼ばない**。unknown class は mutate せず拒否 | state 変更 + 永続化 + 再描画 |
| `getUnassignedFirstRoundPlayers(cls)` | 1局目未割当者を**派生**で返す（非保存）。`results[cls].length>=1` なら空配列。`pairings[cls]` 在籍者を除外し entry_no 昇順。母集合は `players[cls]`（削除者は自動的に非混入） | なし |
| `buildFirstRoundPartialSectionHtml(cls)` | 未割当一覧の HTML（表示専用）。`isClassStarted(cls)` かつ `results` 空 かつ 未割当>0 のときだけ中身を返す。氏名/番号は `escapeHtml`。**checkbox と「対局の作成」ボタンは disabled** | なし |

既存関数への追加（純追加・既存出力条件/ id / 文言は不変）:

- `buildClassActionBarHtml(cls)`: #225 の偶数ブロック（`startBtnClass_`「全員で1局目を開始」）の**後ろ**に、`!classStarted && players.length>=1` で **部分開始ボタン `startBtnPartial_{cls}`** を併置。偶数/奇数を問わず出す（奇数クラスでも来た人から開始する入口）。
- `bindClassActionBarEvents(cls)`: `startBtnPartial_{cls}` の click を `startClassPartial(cls)` に bind（追加のみ）。`frpAddBtn_`（append ボタン）は disabled のため **bind しない**。
- `renderTournament(cls)`: `buildPastResultsHtml` の後・`buildCurrentPairingsHtml` の前に `buildFirstRoundPartialSectionHtml(cls)` を 1 行挿入。

## 3. UI 文言（完成形に見せない方針）

append（選択者で対局作成）が未実装のため、運営者が「このスライスで対局を作れる」と誤解しない文言にした。

- 部分開始ボタン: **「このクラスを部分開始（未割当者を表示）」** ／ ヘルプ「※部分開始にして1局目の未割当者を一覧表示します（選択して対局を作成する機能は次スライスで対応予定）」
- 未割当セクション見出し: **「1局目 未割当参加者」**
- 説明文: **「このクラスは部分開始中です。まだ1局目に入っていない参加者を表示しています。今回は未割当者の確認のみで、選択して対局を作成する機能は次スライスで対応予定です。」**
- 未割当チェックボックス: **disabled**（表示のみ）
- 追加ボタン `frpAddBtn_{cls}`: **disabled** ＋ 文言「対局の作成は次スライスで対応予定」＋ title「（準備中）…次のスライス（FRP-IMPL-003）で対応予定です」

避けた文言（完成形に見える / 旧スライス参照）: 「選んだ人から1局目を開始」「選択者で対局作成」「次のPR（FRP-IMPL-002）」「FRP-IMPL-001」。実測で shogi_v4.html 内に **0 件**。

## 4. #223（FRP-IMPL-001）からの差分

- ロジック（4 helper + 挿入位置）は #223 を参考に再利用。
- **文言・コメント・PR 番号参照を新スライス体系へ更新**: コメントは `FRP-IMPL-002`（append は `FRP-IMPL-003`）。disabled ボタンの旧「次のPR（FRP-IMPL-002）で対応」→「次スライスで対応予定」「FRP-IMPL-003」。
- `buildClassActionBarHtml` の文脈行を #225 後（`'全員で1局目を開始'` の後ろ）へ更新。
- 部分開始ボタンの文言を「選んだ人から1局目を開始」→「このクラスを部分開始（未割当者を表示）」へ（完成形に見せない）。
- チェックボックスを **disabled** 化（#223 は表示のみ非 disabled）。
- **#223 自体は一切操作していない**（rebase / merge / close / comment / Ready化なし）。

## 5. テスト

- 新規 `test/test_frp_impl_002.js`（**79 assert・架空データのみ**）。観点: V（validatePartialStartableClass）/ U（未割当派生・除外・results ゲート・entry_no 昇順・削除者非混入）/ P（startClassPartial mutate・generatePairing 非流用・unknown class・奇数可）/ SAVE（SAVE-FRP-001 = 成功時 warn なし・書込不能時のみ warn・rollback なし）/ D（部分開始ボタン・未割当 0/1/2人以上・A/B独立・奇数表示・disabled+準備中文言・受付タブに出さない）/ OFF（append helper 不在・frpAddBtn/checkbox を bind しない）/ NAV（受付タブ nav-only・開始系 state 不変・generatePairing/startTournamentForClass/startClassPartial 非呼出）/ S（一括開始・submitRound missing チェック・部分開始の非流用 回帰）。
- `test/run_tests.sh` の START-UX-CONSOLIDATE-001 ブロックの後・最終結果ブロックの前に FRP-IMPL-002 ブロックを追加（既存ブロックと同パターン）。
- 結果: `bash test/run_tests.sh shogi_v4.html` = **PASS=63 / FAIL=1 / WARN=35**。
  - baseline（無改変 `b32720c`）= **62 / 1 / 35**。**+1 PASS（本テスト）・新規 FAIL/WARN 0**。
  - FAIL=1 は既存の `data_*` 環境要因（fixture 未コミット）で本実装と無関係。WARN=35 は dev ツリーのみの未コミット test 群（環境要因）。
  - `test_start_ux_consolidate_001`（88 assert）/ `test_start_001`（41 assert）は無改変で PASS 維持。

## 6. 非スコープ（今回やらない）

- 選択者だけで対局を append 作成（`buildFirstRoundPartialPairs` / `appendFirstRoundPairs`）= **FRP-IMPL-003**。
- 保存・復元の堅牢化 / 結果入力済み保護 / 再生成ボタン制御強化 = **FRP-IMPL-004**。
- production 反映 = 別 release PR（base=production）。

## 7. このターンで触っていないもの

- `index.html` / `package.json` / `package-lock.json` / `.github`（workflow）: 無変更。
- main `832bc5a` / production `9693a83` / orphan base `b32720c`: 直接 push なし（前進させていない）。
- PR #223（OPEN/Draft、head `b092b5d`）: 一切操作なし。PR #222（CLOSED/superseded）: 再 open なし。PR #227: 追加修正なし。
- deploy / publish / release / branch 削除: なし。
