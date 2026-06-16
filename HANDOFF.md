# SHOGI-TOUR 引き継ぎ書

> 別チャットで作業を再開するための最小コンテキスト。詳細設計は `docs/specs/` および `docs/notes/` を参照。

## プロジェクト概要

- 沼津将棋支部の月例大会運営用 Web アプリ。スイス式トーナメントのペアリング自動生成・成績集計・順位決定。
- `shogi_v4.html` 単一 HTML + localStorage で完結。GitHub Pages 公開。スマホ運用前提。
- リポジトリ: `kazuo1970takahashi-sketch/shogi`（public）。

## ブランチ運用（重要）

- **PR の base は orphan clean base**（`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`）。`main` を base にしない。
- production 反映は `index.html` + `shogi_v4.html` の 2 ファイルを公開する **release PR**（base=production）で別途行う。
- 実データはコミットしない。テスト fixture は架空のみ。

## 現在の HEAD（2026-06-17 時点）

| ブランチ | HEAD |
|---|---|
| production | `9693a83079b3dbc4dec74a8c03b42b34575c221f`（#221 rollback 後。#220 誤実装は revert 済み。#213 ふりがな ruby / #214 大会履歴 Step1 は残存） |
| main | `832bc5a77c699b198bda64eed3146d03ecf0fa96`（今回対象外） |
| orphan clean base | `3b86edb2645eddbcc55ade617ed7b6145fa7b1ae`（#218/#219 の START 実装は orphan 側に残存） |

## 進行中: FRP-DESIGN-001（1局目部分手合い）

- **開始/追加した作業**: FRP-DESIGN-001 — 1 局目の未割当者選択・部分手合作成の **実装前設計** を追加した。
- **目的**: クラス内の参加者から運営者が選んだ人だけを先行して 1 局目に入れる（未割当者から対象者を選択 → 選択者だけで候補を作成 → 手合い係が確定 → `state.pairings[cls]` に append）。来た人・準備できた人から手合いを付けられた紙運用に近づける。
- **今回は docs-only**。`shogi_v4.html` / `index.html` / test / workflow は変更しない。設計書 = `docs/specs/20260617_frp_design_001_first_round_partial.md`。
- **背景の反省**: START-001/003（#218/#219、production 反映 #220）は既存 `startTournamentForClass` を露出しただけで「未開始クラスを丸ごと開始」に留まり、ユーザー意図（部分手合い）とズレた。#220 は #221 で production から rollback 済み。本設計はその誤りを繰り返さないため核（未割当選択→部分 append）を固定する。
- **採用方針（要点）**: データ構造を変えない／`started=true` かつ pairings 部分配列を正規状態とする／未割当者は `players - pairings` から派生（保存しない）／`results[cls].length>=1` では追加禁止／`submitRound` の全員在籍チェックは維持／`generatePairing`・`startTournamentForClass` は流用しない／append 専用 helper を新設／`lastModifiedBy='auto'`／部分状態では「組み合わせを再生成」を非表示。
- **今回対象外**: 2 局目以降の逐次手合い（早上がり者同士の次局作成）は **No-Go**。完全自動手合いも不採用。
- **次候補**: **FRP-IMPL-001**（部分開始 + 未割当一覧表示。append はまだ。`validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` と未開始 pane の「選んだ人から1局目を開始」ボタン）。その後 FRP-IMPL-002（append 作成）→ FRP-IMPL-003（再生成ボタン制御）→ release PR（production 反映）。

## このターンの変更有無（正確な記録）

- **production / main / orphan への直接変更なし**（いずれの HEAD も前進・改変していない）。
- 変更は本 docs-only ブランチ `docs/frp-design-001-first-round-partial`（base=orphan）上の 2 ファイル追加のみ:
  - `HANDOFF.md`（新規。orphan は HANDOFF.md を追跡していなかったため新規作成）
  - `docs/specs/20260617_frp_design_001_first_round_partial.md`（新規）
- Draft PR を作成。Ready 化 / merge / deploy / publish / release は未実施。branch 削除なし。
