# FRP-IMPL-001 実装結果メモ

| 項目 | 値 |
|---|---|
| ID | FRP-IMPL-001 |
| 種別 | 実装（部分開始 + 1局目未割当一覧表示まで） |
| 日付 | 2026-06-17 |
| base | orphan `3b86edb`（`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`） |
| 設計 | `docs/specs/20260617_frp_design_001_first_round_partial.md`（FRP-DESIGN-001 / PR #222・未merge、設計のみ参照） |

## スコープ

- **やった**: 部分開始（`startClassPartial`）と「1局目 未割当参加者」一覧の**表示**まで。
- **やらない（次PR）**: 選択者での append 作成（FRP-IMPL-002）、再生成ボタン制御（FRP-IMPL-003）、2局目以降の逐次手合い（対象外）、完全自動手合い（不採用）。

## 追加した関数（`shogi_v4.html`、純追加 +132/-0）

- `validatePartialStartableClass(classInfo, playersForClass)` — pure。未開始かつ1名以上で `ok`、0名 `skip-empty`、開始済み `skip-already-started`。**偶数を要求しない**（既存 `validateStartableClass` は無変更）。
- `startClassPartial(cls)` — `started=true` / `pairings[cls]=[]` / `results[cls]=[]`。**`generatePairing` を呼ばない**、`startTournamentForClass`/`applyStartForCandidates` を流用しない。`save()` 後に SAVE-FRP-001 保存検証（`classStartedInPersisted` / pairings 空 / results 空）。unknown class は mutate せず拒否。
- `getUnassignedFirstRoundPlayers(cls)` — `state.players[cls]` から `state.pairings[cls]` 在籍者を除いた配列を entry_no 昇順で返す派生関数。`results[cls]` 非空なら空配列（保存しない）。
- `buildFirstRoundPartialSectionHtml(cls)` — started かつ results 空 かつ 未割当>0 のときだけ「1局目 未割当参加者」セクション（checkbox 表示 + disabled な「選択者で1局目に追加（次PRで対応）」ボタン）を返す。氏名/番号は `escapeHtml`。

## 既存への配線（純追加）

- `buildClassActionBarHtml(cls)` — 未開始かつ参加者1名以上で `startBtnPartial_{cls}`「選んだ人から1局目を開始」を併置。既存 `startBtnClass_`（一括開始）/ リセットの条件・id・文言は無変更。
- `bindClassActionBarEvents(cls)` — `startBtnPartial_` の click を `startClassPartial(cls)` に bind（追加のみ）。
- `renderTournament(cls)` — started ブランチに `buildFirstRoundPartialSectionHtml(cls)` を挿入（過去結果の下・現ラウンドの上）。

## 既存挙動の不変（確認済み）

- `startTournamentForClass` / `generatePairing` / `submitRound`（全員在籍 missing チェック）/ `validateStartableClass` は本体無変更。
- 受付タブ #startBtn「登録完了・対局開始」/ START-001/003 受付導線は無変更。受付タブに新しい手合作成ボタンは出さない。
- 順位 / 勝率 / 年間集計 / 大会履歴 / 帳票 / 保存形式（state schema）は不変。

## テスト

- `test/test_first_round_partial_001.js`（40 assert・全 PASS）を `test/run_tests.sh` に登録。
- 観点: validatePartialStartableClass（4分岐）/ getUnassignedFirstRoundPlayers（除外・results 非空・entry_no 順）/ startClassPartial（started・空配列・generatePairing 非呼出・保存・他クラス非破壊・unknown 拒否・奇数可）/ 表示（部分開始ボタン・未割当一覧・受付タブ非表示）/ 既存不変（#startBtn・startBtnClass_・submitRound missing）。
- baseline `3b86edb` の **62/1/35 → 63/1/35**（新規 FAIL/WARN ゼロ。FAIL=1 は既存 `data_*` 環境要因、本実装と無関係）。

## 次

- **FRP-IMPL-002**: 選択者で 1 局目に append 作成（`buildFirstRoundPartialPairs` / `appendFirstRoundPairs` / 確定 UI）。
