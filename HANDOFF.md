# SHOGI-TOUR 引き継ぎ書

> 別チャットで作業を再開するための最小コンテキスト。設計は `docs/specs/`、結果メモは `docs/notes/` を参照。

## プロジェクト概要

- 沼津将棋支部の月例大会運営用 Web アプリ。スイス式トーナメントのペアリング自動生成・成績集計・順位決定。
- `shogi_v4.html` 単一 HTML + localStorage で完結。GitHub Pages 公開。スマホ運用前提。
- リポジトリ: `kazuo1970takahashi-sketch/shogi`（public）。

## ブランチ運用（重要）

- **PR の base は orphan clean base**（`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`）。`main` を base にしない。
- production 反映は `index.html` + `shogi_v4.html` の 2 ファイルを公開する **release PR**（base=production）で別途行う。
- 実データはコミットしない。テスト fixture は架空のみ（架空 …）。

## 現在の HEAD（2026-06-17 時点）

| ブランチ | HEAD |
|---|---|
| production | `9693a83079b3dbc4dec74a8c03b42b34575c221f`（#221 rollback 後。#220 誤実装は revert 済み。#213 ふりがな ruby / #214 大会履歴 Step1 は残存） |
| main | `832bc5a77c699b198bda64eed3146d03ecf0fa96`（今回対象外） |
| orphan clean base | `3b86edb2645eddbcc55ade617ed7b6145fa7b1ae`（本ブランチの起点） |

## 1局目部分手合い（FIRST-ROUND-PARTIAL）の進行

- **設計**: FRP-DESIGN-001（`docs/specs/20260617_frp_design_001_first_round_partial.md`、Draft PR #222・**未merge**）。本実装は #222 の commit を取り込まず orphan から分岐し、設計内容のみ参照。

### 実施: FRP-IMPL-001（本ブランチ）

- **目的**: 1局目部分手合いの土台。「**部分開始** + **1局目未割当一覧の表示**」まで。
- **やったこと**（`shogi_v4.html` は純追加 +132/-0）:
  - `validatePartialStartableClass(classInfo, players)` … 部分開始の可否（pure）。未開始・1名以上で ok、**偶数を要求しない**、0名/開始済みは拒否。既存 `validateStartableClass` は無変更。
  - `startClassPartial(cls)` … started=true / `pairings[cls]=[]` / `results[cls]=[]` にするだけ。**`generatePairing` を呼ばない**・`startTournamentForClass`/`applyStartForCandidates` を流用しない。SAVE-FRP-001 保存検証（started / pairings空 / results空）。
  - `getUnassignedFirstRoundPlayers(cls)` … `state.players[cls] - state.pairings[cls]` を entry_no 昇順で派生（保存しない）。`results[cls]` 非空なら空配列。
  - 対局管理タブの未開始 pane に部分開始ボタン「選んだ人から1局目を開始」（`startBtnPartial_{cls}`、既存 `startBtnClass_` とは別導線）。
  - started かつ results 空のクラスに「1局目 未割当参加者」一覧（checkbox 表示のみ）。「選択者で1局目に追加」ボタンは **disabled**（append は次 PR）。
- **やっていないこと（次 PR 以降）**: 選択者での **append 作成**（FRP-IMPL-002）、再生成ボタン制御（FRP-IMPL-003）、2局目以降の逐次手合い（対象外・No-Go 据え置き）、完全自動手合い（不採用）。
- **不変を確認**: `startTournamentForClass` / `generatePairing` / `submitRound`（全員在籍 missing チェック）/ 順位 / 履歴 / 帳票 / 保存形式 / 受付タブ #startBtn は無変更。
- **テスト**: `test/test_first_round_partial_001.js`（40 assert・全 PASS）を `test/run_tests.sh` に登録。baseline `3b86edb` の **62/1/35 → 63/1/35**（新規 FAIL/WARN ゼロ。FAIL=1 は既存の `data_*` 環境要因で本実装と無関係）。

## このターンの変更有無（正確な記録）

- **production / main / orphan への直接変更なし**（HEAD はいずれも不変）。
- 変更は feature ブランチ `feature/frp-impl-001-partial-start-unassigned-list`（base=orphan）上のみ。
- Draft PR を作成。Ready 化 / merge / deploy / publish / release は未実施。branch 削除なし。

## 次候補

- **FRP-IMPL-002**: 選択者で 1 局目に append 作成（`buildFirstRoundPartialPairs` / `appendFirstRoundPairs` / 選択チェック＋プレビュー＋確定）。
- その後 FRP-IMPL-003（再生成ボタン制御・警告整理）→ release PR（production 反映）。
