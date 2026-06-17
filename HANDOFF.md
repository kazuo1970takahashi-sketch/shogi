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
- **採用方針**: **方針C を採用**（受付タブから開始処理を外し、対局管理タブへ集約）。`#startBtn` は「登録内容を確認して対局管理へ」のナビ専用化（**開始系 state＝pairings/results/classes[].started/互換 state.started は不変**・`startTournament()`/`startTournamentForClass()`/`generatePairing()` を呼ばない。ただし受付入力の保存/反映は許容＝§5.3.1 保存契約）。正規の開始導線は対局管理タブの `startBtnClass_{cls}` → `startTournamentForClass(cls)`（必ず保持）。`startTournament()` は削除せず deprecated として残す。class status は既存 state から派生（保存 schema を増やさない）。
- **案A は撤回・不採用**: 「登録完了・対局開始」を「全クラス一括開始」等へ**リネームするだけ**の案は採用しない。根本原因（受付タブに開始副作用がある）が残り、小PR増加・rollback リスク・FRP 導線との混線を解消できないため。
- **base=orphan 固有の注意**: orphan には #218/#219 由来の受付タブ class 開始ボタン（`reg-class-start`）と readiness 表示が残存している（production には #221 後 無い）。START-UX-CONSOLIDATE-IMPL では `#startBtn` のナビ化に加え、これら受付タブの開始導線も撤去対象に含める。
- **PR #224 review-only 結果に基づき Must Fix を反映**（docs 追記のみ・実装コードは未変更）。反映内容:
  1. **startBtn ナビ押下時の保存契約**（§5.2 / §5.3.1）— 開始系 state は不変だが受付入力（参加者追加・名前編集・クラス変更・会費区分）の保存/反映は許容。「すべての state が不変」という意味ではない。
  2. **`isClassStarted(cls)` の定義**（§8.1）— 「そのクラスで1局目運用を開始したか」の述語。クラス別全員開始だけでなく将来の部分開始（`startClassPartial`）でも true。`pairings[cls]` が1件以上あるか**だけ**で定義しない。
  3. **`validateStartableClass` の既存判定保持**（§7.1）— 既存シグネチャ/条件を変えず・2名以上偶数を緩めず・部分開始用に流用しない。部分開始は別経路 `validatePartialStartableClass`。
  4. **readiness 表示と reg-class-start 撤去対象の切り分け**（§5.5）— 受付タブの開始ボタン/開始イベント/開始 handler は必ず撤去。readiness 表示は読み取り専用なら残置可（クリック可能な開始操作・handler・`startTournament()`/`startTournamentForClass()` 呼び出しを含めない）。
  5. **#224 の merge 先・orphan 系譜確認**（§15）— #224 の merge 先は orphan 系譜で `main` ではない。production 反映は後続 release PR。production/main/orphan の HEAD は直接変更せず、Ready/merge は人間の明示承認後。
- **次候補**: **START-UX-CONSOLIDATE-IMPL**（`#startBtn` ナビ専用化／開始副作用除去／受付タブ class 開始導線の撤去／テスト更新／`startTournamentForClass` 維持）。その後に FRP-IMPL-001 再開。

## 実装: START-UX-CONSOLIDATE-IMPL（START-UX-CONSOLIDATE-001 実装）

- **実施したこと**: PR #224（設計 `docs/specs/20260617_start_ux_consolidate_001_design.md`、orphan へ squash merge 済 = base `29a819ec3b168cf6bfa490642211e762da25da78`）に従い、**開始操作を「参加者登録」タブから外し「対局管理」タブへ集約**する実装を行った。branch = `feature/start-ux-consolidate-001-impl`（base=orphan `29a819e`）。Draft PR・**未 merge**。
- **`#startBtn` をナビ専用化**: 文言を「**登録内容を確認して対局管理へ**」に変更し、click bind を `startTournament`（全クラス一括開始）から新 `goToTournamentFromReg`（`save()` で受付入力を保存してから `showTab('tournament')` するだけ）へ置換。`id="startBtn"` は短期互換で維持（意味は「開始」→「対局管理へ進む」）。
- **`#startBtn` 押下で開始系 state は不変**: `goToTournamentFromReg` は `pairings` / `results` / `classes[].started` / 互換 `state.started` を変更せず、`generatePairing()` / `startTournament()` / `startTournamentForClass()` を呼ばない（1回戦を作らない）。受付入力（参加者追加・名前編集・A/B 振り分け・会費区分）の保存・反映のみ許容（§5.3.1）。
- **受付タブの `reg-class-start` 系開始導線を撤去**: 静的ボタン `a-start-btn`/`b-start-btn`、C+ 動的生成、helper `regClassStartBtnId`/`describeClassStartButton`/`buildClassStartConfirmMessage`/`renderClassStartButton`/`onClickClassStart`/`bindClassStartHandlers`、`renderRegList` からの bind/描画呼出、`.reg-class-start*` CSS をすべて撤去（#218/#219 由来）。受付タブに開始コントロール・開始 handler・`startTournamentForClass` 呼出は残らない。
- **readiness 表示は読み取り専用で残置**: `a-readiness`/`b-readiness` と `describeClassReadiness`/`renderClassReadiness`/`regClassReadinessId` は残置（クリック可能な開始操作・handler・`startTournament`/`startTournamentForClass` 呼出を含まない）。
- **対局管理タブの開始導線を保持**: `startBtnClass_{cls}` → `startTournamentForClass(cls)` は不変（A は A だけ・B は B だけ開始、他クラス非破壊）。文言は「**○○全員で1局目を開始**」に明確化（「全員」=そのクラス内全員）。`generatePairing` 不変。
- **`validateStartableClass` は緩めていない**: シグネチャ・2名以上・偶数条件を不変のまま保持。部分開始用に流用しない（部分開始は将来 `validatePartialStartableClass` 別経路）。
- **`startTournament()` は削除しない**: UI からは呼ばない **legacy/deprecated helper** として温存（doc コメントで明示）。物理削除・リネームは後続PRで棚卸し。
- **テスト**: 新規 `test/test_start_ux_consolidate_001.js`（88 assert・架空データのみ）を追加し `run_tests.sh` に登録。旧 `test/test_start_003.js`（受付クラス別開始 = 撤去対象）は撤去済み関数を import して必ず FAIL するため、**`run_tests.sh` から登録解除**し、ファイル本体は**撤去済みマーカーの最小スタブに置換**（旧期待値・旧関数 import・旧仕様 assertion は残さない／ユーザー明示許可の一覧外1ファイル編集）。`test/run_tests.sh shogi_v4.html` = **PASS=62 / FAIL=1 / WARN=35**（FAIL=1 は既存の `data_*` 環境要因、本実装と無関係。baseline と同値＝新規 FAIL/WARN 0）。`test_start_001`（readiness）は 41 PASS 維持。
- **変更ファイル**: `shogi_v4.html` / `test/run_tests.sh` / `test/test_start_003.js`（スタブ化）/ `test/test_start_ux_consolidate_001.js`（新規）/ `HANDOFF.md`。`index.html` / `.github`（workflow）/ `package*` は無変更。
- **#223 は引き続き Draft/Open のまま保留**（rebase/adopt/close/Ready化/merge いずれも未実施）。#222 も未変更。
- **次候補**: **START-UX-CONSOLIDATE-IMPL の review**、または **FRP-IMPL-001（#223）再開判断**（新 UX 前提で rebase / adopt / 作り直し）。

## FRP（1局目部分手合い）ライン: 保留中

- **FRP-DESIGN-001 / PR #222**: Draft/Open。1局目の未割当者選択・部分手合作成の実装前設計。設計書 = `docs/specs/20260617_frp_design_001_first_round_partial.md`。
- **FRP-IMPL-001 / PR #223**: Draft/Open のまま **保留**。今すぐ **Ready 化・merge しない**（close もしない）。理由 = #223 は参加者登録タブに旧 `#startBtn` が残った前提で作られており、START-UX 整理前に部分開始導線を増やすと開始系がさらに混乱するため。**START-UX-CONSOLIDATE-IMPL 後に rebase / adopt / 作り直し を判断**する。

## このターンの変更有無（正確な記録）

- **production / main / orphan clean base への直接変更なし**（いずれの HEAD も前進・改変していない）。
- 変更は本 docs-only ブランチ `docs/start-ux-consolidate-001-design`（base=orphan `3b86edb`）上の 2 ファイルのみ:
  - `HANDOFF.md`（本ファイル）
  - `docs/specs/20260617_start_ux_consolidate_001_design.md`
- 直近ターン: PR #224 の **Must Fix 1–5 を docs に追記**（review-only 後）。`shogi_v4.html` / `index.html` / `test/` / `.github/`（workflow）/ `package*.json` は無変更。
- #222 / #223 は変更していない（#223 の rebase/adopt/close も行っていない）。
- Draft PR #224。Ready 化 / merge / deploy / publish / release は未実施。branch 削除なし。memory 更新なし。
