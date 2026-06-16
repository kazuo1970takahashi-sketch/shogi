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
| orphan clean base | `3b86edb2645eddbcc55ade617ed7b6145fa7b1ae`（#218/#219 の START 実装は orphan 側に残存。production からは #221 で revert 済） |

## 進行中: START-UX-CONSOLIDATE-001（開始導線集約 — 設計）

- **開始/追加した作業**: **START-UX-CONSOLIDATE-DESIGN を開始**した。参加者登録タブの「登録完了・対局開始」ボタン（`#startBtn`）が実際には全クラスの1回戦組み合わせを生成してしまう問題に対する、**実装前設計**を追加した。
- **目的**: 開始操作を「参加者登録」タブから外し、「対局管理」タブへ集約する。これは A/B 別開始・今後の 1局目部分開始（FRP）との導線衝突を断つ前提整理。
- **今回は docs-only**。`shogi_v4.html` / `index.html` / test / workflow / package は変更しない。設計書 = `docs/specs/20260617_start_ux_consolidate_001_design.md`。
- **採用方針**: **方針C を採用**（受付タブから開始処理を外し、対局管理タブへ集約）。`#startBtn` は「登録内容を確認して対局管理へ」のナビ専用化（pairings/results/started を一切変更しない・`startTournament()`/`startTournamentForClass()`/`generatePairing()` を呼ばない）。正規の開始導線は対局管理タブの `startBtnClass_{cls}` → `startTournamentForClass(cls)`（必ず保持）。`startTournament()` は削除せず deprecated として残す。class status は既存 state から派生（保存 schema を増やさない）。
- **案A は撤回・不採用**: 「登録完了・対局開始」を「全クラス一括開始」等へ**リネームするだけ**の案は採用しない。根本原因（受付タブに開始副作用がある）が残り、小PR増加・rollback リスク・FRP 導線との混線を解消できないため。
- **base=orphan 固有の注意**: orphan には #218/#219 由来の受付タブ class 開始ボタン（`reg-class-start`）と readiness 表示が残存している（production には #221 後 無い）。START-UX-CONSOLIDATE-IMPL では `#startBtn` のナビ化に加え、これら受付タブの開始導線も撤去対象に含める。
- **次候補**: **START-UX-CONSOLIDATE-IMPL**（`#startBtn` ナビ専用化／開始副作用除去／受付タブ class 開始導線の撤去／テスト更新／`startTournamentForClass` 維持）。その後に FRP-IMPL-001 再開。

## FRP（1局目部分手合い）ライン: 保留中

- **FRP-DESIGN-001 / PR #222**: Draft/Open。1局目の未割当者選択・部分手合作成の実装前設計。設計書 = `docs/specs/20260617_frp_design_001_first_round_partial.md`。
- **FRP-IMPL-001 / PR #223**: Draft/Open のまま **保留**。今すぐ **Ready 化・merge しない**（close もしない）。理由 = #223 は参加者登録タブに旧 `#startBtn` が残った前提で作られており、START-UX 整理前に部分開始導線を増やすと開始系がさらに混乱するため。**START-UX-CONSOLIDATE-IMPL 後に rebase / adopt / 作り直し を判断**する。

## このターンの変更有無（正確な記録）

- **production / main / orphan clean base への直接変更なし**（いずれの HEAD も前進・改変していない）。
- 変更は本 docs-only ブランチ `docs/start-ux-consolidate-001-design`（base=orphan `3b86edb`）上の 2 ファイル追加のみ:
  - `HANDOFF.md`（新規。orphan は HANDOFF.md を追跡していなかったため新規作成）
  - `docs/specs/20260617_start_ux_consolidate_001_design.md`（新規）
- `shogi_v4.html` / `index.html` / `test/` / `.github/`（workflow）/ `package*.json` は無変更。
- #222 / #223 は変更していない（#223 の rebase/adopt も行っていない）。
- Draft PR を作成。Ready 化 / merge / deploy / publish / release は未実施。branch 削除なし。memory 更新なし。
