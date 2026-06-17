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
| orphan clean base | `021faa885f144e3a2de63270f7217541f78a9a3a`（#225 開始導線集約 / #226 FRP 棚卸し merge 後の HEAD。#218/#219 の START 実装は orphan 側に残存・FRP とは別物。production からは #221 で revert 済） |

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

## FRP（1局目部分手合い）ライン: POST-225 棚卸し完了 → 作り直し方針確定

- **PR #225 MERGED**（2026-06-17, squash `67e0b81`）: START-UX-CONSOLIDATE-001 実装完了。受付タブの開始導線撤去・`#startBtn` ナビ専用化・対局管理タブの開始導線強化。orphan HEAD = `67e0b81`。
- **POST-225-FRP-REBASE-INVENTORY-001（本 PR）**: #225 merge 後の #222/#223 棚卸し文書を追加。docs-only。
- **PR #222 FRP-DESIGN-001**: Draft/Open のまま **直接続行禁止**（base が `3b86edb` = 2 commits stale / HANDOFF.md conflict）。棚卸し結果: 設計内容 95% 有効。**FRP-DESIGN-002 として新 PR に作り直し推奨**。close は FRP-DESIGN-002 PR 作成後に行う。
- **PR #223 FRP-IMPL-001**: Draft/Open のまま **直接続行禁止**（`buildClassActionBarHtml` コンテキスト conflict / HANDOFF.md conflict）。棚卸し結果: `validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` / `buildFirstRoundPartialSectionHtml` は再利用可。**FRP-IMPL-002 として新 PR に作り直し推奨**。close は FRP-IMPL-002 PR 作成後に行う。
- **次候補**: **FRP-DESIGN-002**（#226 merge 後の orphan HEAD 起点 docs-only 設計書更新）→ **FRP-IMPL-002**（部分開始 + 未割当一覧表示 土台）。詳細は `docs/specs/20260617_post_225_frp_rebase_inventory_001.md`。
- **#222/#223 close**: 後継 PR（FRP-DESIGN-002 / FRP-IMPL-002）リンク確定後かつ人間の明示指示後に行う。#226 merge 直後に即 close しない。

## FRP-DESIGN-002（1局目部分手合い 設計 — #225 後 再設計 / docs-only）

- **PR #226 merge 完了**（POST-225-FRP-REBASE-INVENTORY-001、squash `021faa8`）。**orphan HEAD = `021faa885f144e3a2de63270f7217541f78a9a3a`**（short `021faa8`、parent `67e0b81`=#225）。main `832bc5a` 不変・production `9693a83` 不変。
- **FRP-DESIGN-002 を開始**: #226 merge 後の orphan HEAD `021faa8` を起点に、**#225 後の開始 UX（受付タブから開始操作を外し対局管理タブへ集約）を前提とした 1局目部分手合い（FRP: First Round Partial）の新設計書**を docs-only で追加した。設計書 = `docs/specs/20260617_frp_design_002_post_225_partial_first_round.md`。
- **本書は #222（FRP-DESIGN-001）を supersede する設計**（#225 前提ズレのため作り直し）だが、設計知見は 95% 引き継ぎ。更新点 = base（`3b86edb`→`021faa8`）/ 背景（#225 で受付タブ開始導線撤去済みを反映）/ `buildClassActionBarHtml` 文言（「を開始」→「全員で1局目を開始」）と部分開始ボタンの併置ロジック / HANDOFF.md（新規作成→追記）/ スライス再採番。
- **FRP 操作入口 = 対局管理タブのクラス別セクション**。受付タブは #225 で nav-only（`goToTournamentFromReg` = save+タブ移動のみ）。FRP は受付タブに round 作成・`started` 更新・pairing 生成を持ち込まない。旧 `#startBtn` 一括開始・旧 START-003 受付ボタン前提は引き継がない。
- **再利用知見（#223 から）**: `validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` はそのまま再利用可。`buildFirstRoundPartialSectionHtml` は**ロジック再利用可・文言/コメント/PR 番号参照は更新必須**（disabled ボタンの「次のPR（FRP-IMPL-002）」等を新スライス体系=append は FRP-IMPL-003 に更新）。
- **#222/#223 は #225/#226 前提ズレのため直接続行禁止**（base stale・`buildClassActionBarHtml` 文脈 conflict・HANDOFF.md 新規作成 vs 追記の差）。本 PR では **#222/#223 を一切操作していない**（close / comment / rebase / Ready化 / merge なし）。
- **#222 close** は **FRP-DESIGN-002 PR リンク確定後かつ人間の明示指示後**に別タスクで実施（superseded コメント＋後継リンク。本 PR では行わない）。
- **#223 close** は **FRP-IMPL-002 PR リンク確定後かつ人間の明示指示後**に別タスクで実施（superseded コメント＋後継リンク。本 PR では行わない）。
- **次候補 = FRP-IMPL-002**（部分開始の土台＋未割当者一覧表示＝表示のみ・append は disabled / nav-only・state 不変の回帰検査。append 作成は FRP-IMPL-003、再生成ボタン制御・保存堅牢化は FRP-IMPL-004）。base = FRP-DESIGN-002 merge 後の新 HEAD。

## 実装: FRP-IMPL-002（1局目部分手合いの土台 + 未割当一覧表示 / append は次スライス）

- **PR #227（FRP-DESIGN-002）merge 完了**（squash `b32720c`、parent `021faa8`=#226）。**orphan HEAD = `b32720cbcb3696b1939370bacbae1f4ea45cea03`**（short `b32720c`）。main `832bc5a` 不変・production `9693a83` 不変。
- **FRP-IMPL-002 を実装**: #227 merge 後の orphan HEAD `b32720c` を起点に、設計書 `docs/specs/20260617_frp_design_002_post_225_partial_first_round.md` に従い**部分開始の土台＋1局目未割当者一覧の「表示」まで**を実装した。branch = `feature/frp-impl-002-unassigned-list-foundation`（base=orphan `b32720c`）。Draft PR・**未 merge**。
- **新規 helper（既存関数の本体は無改変）**: `validatePartialStartableClass`（pure・偶数不要）/ `startClassPartial`（started=true・pairings/results 空・`generatePairing`/`startTournamentForClass`/`applyStartForCandidates` 非流用・SAVE-FRP-001 検証・unknown class 拒否）/ `getUnassignedFirstRoundPlayers`（派生・非保存・results 非空で空・entry_no 昇順・削除者非混入）/ `buildFirstRoundPartialSectionHtml`（表示専用・`isClassStarted` かつ results 空 かつ 未割当>0 のみ・escapeHtml）。
- **既存への純追加**: `buildClassActionBarHtml` に部分開始ボタン `startBtnPartial_{cls}`（#225 偶数ブロックの後ろ・`!classStarted && players.length>=1`・偶数/奇数問わず）／ `bindClassActionBarEvents` で `startBtnPartial_` を `startClassPartial` に bind（`frpAddBtn_` は disabled のため bind しない）／ `renderTournament` に `buildFirstRoundPartialSectionHtml` を 1 行挿入。既存 `startBtnClass_`/リセット/`validateStartableClass`/`generatePairing`/`submitRound` は無改変。
- **append（選択者で対局作成）は未実装＝次スライス FRP-IMPL-003**: 未割当チェックボックスと「対局の作成」ボタン `frpAddBtn_{cls}` は **disabled**（イベント未登録）。`buildFirstRoundPartialPairs`/`appendFirstRoundPairs` は未定義。
- **UI 文言（完成形に見せない）**: 部分開始ボタン「このクラスを部分開始（未割当者を表示）」／ 見出し「1局目 未割当参加者」／ 説明「…今回は未割当者の確認のみで、選択して対局を作成する機能は次スライスで対応予定です。」／ 追加ボタン「対局の作成は次スライスで対応予定」(disabled)。**避けた文言**=「選んだ人から1局目を開始」「選択者で対局作成」「次のPR（FRP-IMPL-002）」「FRP-IMPL-001」（実測 0 件）。
- **#225 後 nav-only / state 不変の回帰**を新テストで担保: `goToTournamentFromReg` は対局管理タブへ移動するだけ（round 作成なし・started 不変・pairings/results 不変・`generatePairing`/`startTournamentForClass`/`startClassPartial` 非呼出）。
- **テスト**: 新規 `test/test_frp_impl_002.js`（79 assert・架空データのみ）を追加し `run_tests.sh` の START-UX-CONSOLIDATE-001 ブロックの後に登録。`bash test/run_tests.sh shogi_v4.html` = **PASS=63 / FAIL=1 / WARN=35**（baseline `b32720c` = 62/1/35。**+1 PASS・新規 FAIL/WARN 0**。FAIL=1 は既存 `data_*` 環境要因、WARN=35 は未コミット test 群＝環境要因）。`test_start_ux_consolidate_001`(88)/`test_start_001`(41) は無改変 PASS 維持。詳細 = `docs/notes/20260617_frp_impl_002_result.md`。
- **変更ファイル**: `shogi_v4.html`（+140）/ `test/run_tests.sh`（+18）/ `test/test_frp_impl_002.js`（新規）/ `HANDOFF.md`（追記）/ `docs/notes/20260617_frp_impl_002_result.md`（新規）。`index.html` / `.github`（workflow）/ `package*` は無変更。
- **PR #223 は一切操作していない**（OPEN/Draft、head `b092b5d` のまま。rebase/merge/close/comment/Ready化なし）。**#222 再 open なし**。**#227 追加修正なし**。
- **次候補 = FRP-IMPL-003**（選択者だけで append 作成＝`buildFirstRoundPartialPairs`/`appendFirstRoundPairs`・選択チェック＋プレビュー＋確定・disabled 解除）。その後 FRP-IMPL-004（保存復元・結果保護・再生成ボタン制御強化）。base = FRP-IMPL-002 merge 後の新 HEAD。

## このターンの変更有無（正確な記録）

- **production / main / orphan clean base への直接変更なし**（いずれの HEAD も前進・改変していない。orphan = `b32720c` のまま）。
- 変更は実装ブランチ `feature/frp-impl-002-unassigned-list-foundation`（base=orphan `b32720c`）上の **5 ファイル**:
  - `shogi_v4.html`（部分開始 helper + 未割当一覧 + action bar 部分開始ボタン・純追加）
  - `test/run_tests.sh`（FRP-IMPL-002 ブロック追加）
  - `test/test_frp_impl_002.js`（新規・79 assert）
  - `HANDOFF.md`（本ファイル・追記）
  - `docs/notes/20260617_frp_impl_002_result.md`（新規・実装結果メモ）
- このターン: **FRP-IMPL-002（部分開始の土台＋1局目未割当一覧表示・append は disabled）を実装**。`index.html` / `.github/`（workflow）/ `package*.json` は無変更。
- **#222 / #223 は変更していない**（close / comment / rebase / adopt / Ready化 / merge いずれも未実施）。**#227 への追加修正もしていない**。
- Draft PR。Ready 化 / merge / deploy / publish / release は未実施。branch 削除なし。後続タスク（FRP-IMPL-003 = append 作成）未着手。memory 更新は本ターン外。

## 実装: FRP-IMPL-003（選択者だけで1局目対局を append 作成）

- **PR #228（FRP-IMPL-002）merge 完了**（squash `3394e4a`、parent `b32720c`=#227）。**orphan HEAD = `3394e4a28a7ceb83a6c5a1989701690243c29dc2`**（short `3394e4a`）。main `832bc5a` 不変・production `9693a83` 不変。
- **FRP-IMPL-003 を実装**: #228 merge 後の orphan HEAD `3394e4a` を起点に、設計書 `docs/specs/20260617_frp_design_002_post_225_partial_first_round.md`（§6/§7/§9）に従い **FRP-IMPL-002 で表示まで実装した未割当一覧から、選択者だけで1局目対局を append 作成**する処理を実装した。branch = `feature/frp-impl-003-append-selected-first-round`（base=orphan `3394e4a`）。Draft PR・**未 merge**。
- **新規 helper（既存関数の本体は無改変）**: `buildFirstRoundPartialPairs(selected)`（pure・entry_no 昇順/欠損は末尾/同値は id 昇順・偶数全員/奇数末尾1人 leftover・0/1名は空 pairs・`{pairs:[{p1,p2,winner:null,lastModifiedBy:'auto'}],leftover}`）／ `appendFirstRoundPairs(cls,pairs)`（末尾 append のみ・実行時再検証 + backup/rollback post-check・SAVE-FRP-002・`startTournamentForClass`/`generatePairing`/`applyStartForCandidates` 非呼出）／ `collectCheckedUnassignedPids(cls)`（pane スコープのチェック集約）／ `buildFrpAppendConfirmMessage`（confirm 用プレーンテキスト・escape 不要）／ `onClickAppendFirstRound(cls)`（再入防止 + 実行時再検証 + confirm + append）。
- **既存への変更（純追加）**: `buildFirstRoundPartialSectionHtml` の checkbox / `frpAddBtn_` を **有効化**し文言を「選択した参加者で1局目を追加作成」へ置換（helper は表示専用のまま）／ `bindClassActionBarEvents` で `frpAddBtn_` を `onClickAppendFirstRound` に bind／ `buildClassActionBarHtml` の部分開始ヘルプから暫定文言を撤去。既存 `startBtnClass_`/リセット/`validateStartableClass`/`generatePairing`/`submitRound`/`startTournamentForClass`/`applyStartForCandidates` は無改変。
- **仕様の核**: 奇数3人以上は末尾1人を **leftover として未割当のまま残す**（state 非保存・派生で残置）／ 0人・1人は **作成不可**／ `results[cls].length>=1` は **全面ブロック**、`pairings[cls]` 内に winner 入力済み match があっても **results 空なら既存 winner を変更せず append 許可**（results 確定と pairings 内 winner を分離）。
- **保存検証 SAVE-FRP-002**: save 後 `pairingsMatchSnapshot(persisted.pairings[cls], expected)`（p1/p2/winner/lastModifiedBy 全要素）。不一致は `notifySaveWarning`（`SAVE-FRP-002-appendFirstRoundPairs`・warn・**rollback しない・運営継続**）。
- **テスト**: 新規 `test/test_frp_impl_003.js`（64 assert・架空データのみ）を追加し `run_tests.sh` の FRP-IMPL-002 ブロックの後に登録。`test/test_frp_impl_002.js` は append 実装に伴い「未実装ガード」assert を現実へ追従（OFF→WIRED・79 assert で PASS 維持）。`bash test/run_tests.sh shogi_v4.html` = **PASS=64 / FAIL=1 / WARN=35**（baseline `3394e4a` = 63/1/35。**+1 PASS・新規 FAIL/WARN 0**。FAIL=1 は既存 `data_*` 環境要因。未エスケープ 0 件）。詳細 = `docs/notes/20260617_frp_impl_003_result.md`。
- **変更ファイル**: `shogi_v4.html` / `test/run_tests.sh` / `test/test_frp_impl_002.js`（更新）/ `test/test_frp_impl_003.js`（新規）/ `HANDOFF.md`（追記）/ `docs/notes/20260617_frp_impl_003_result.md`（新規）。`index.html` / `.github`（workflow）/ `package*` は無変更。
- **production / main / orphan clean base への直接変更なし**（orphan = `3394e4a` のまま前進させていない）。**#222 / #223（CLOSED/superseded）は一切操作なし**（再 open / comment / rebase なし）。**#227 / #228 への追加修正なし**。
- Draft PR。Ready化 / merge / deploy / publish / release は未実施。branch 削除なし。**後続タスク = FRP-IMPL-004**（保存復元堅牢化・再生成ボタン制御・bye/任意組み合わせ/手動並び替え）は未着手。memory 更新は本ターン外。

## テストハーネス修正: TEST-HARNESS-001（data_*.json 不在時の常時FAIL解消）

- **PR #229（FRP-IMPL-003）merge 後の orphan HEAD `b33e7b60ed5c0d499e2ac343151f51cc1f1ea548`（short `b33e7b6`）を base** に、`test/run_tests.sh` の既存常時 FAIL=1 を解消した。branch = `test/test-harness-001-skip-missing-data-fixtures`。Draft PR・**未 merge**。**`shogi_v4.html` は無変更**（機能修正ではなくテストハーネス修正）。
- **FAIL=1 の正体**: 「第3層補足: テストデータでの normalizeState 堅牢性確認」ブロックの `for f in "$SCRIPT_DIR"/data_*.json` が、orphan base（実データ非コミット方針で `data_*.json` を含まない）で**未展開リテラル**を Python に渡し `FileNotFoundError`/`Traceback` → `ng`（FAIL+1）となっていた。FRP とは無関係の既存テストハーネス要因（従来 HANDOFF でも「FAIL=1 は既存 `data_*` 環境要因」と注記）。
- **修正**: `shopt -s nullglob` で glob を**配列展開**し、**0件なら skip（`ℹ` info 行・FAIL/WARN 非加算）**、**1件以上なら従来どおりの検証ループ**（`json.load` → `ok`/`ng`）を回す。検証ループ本体は無改変＝**fixture 存在時の検証は不変・壊れた fixture は従来どおり FAIL**。取得直後 `shopt -u nullglob` で既定挙動へ復帰。
- **テスト**（クリーン worktree `b33e7b6` で実測）: **修正前 PASS=64 / FAIL=1 / WARN=35 → 修正後 PASS=64 / FAIL=0 / WARN=35**。before/after 差分は3行のみ（データ行 `✗ Traceback`→`ℹ skip` / サマリ `FAIL=1`→`FAIL=0` / 合否行）。**WARN 35行は byte 一致**（既存 WARN 不変）。`Traceback`/`FileNotFoundError` 出力 0件・exit 0。`FRP-IMPL-002=79 PASS` / `FRP-IMPL-003=64 PASS` 維持。詳細 = `docs/notes/20260617_test_harness_001_result.md`。
- **変更ファイル**: `test/run_tests.sh`（data_*.json ブロックのみ）/ `HANDOFF.md`（本追記）/ `docs/notes/20260617_test_harness_001_result.md`（新規）。`shogi_v4.html` / `index.html` / `.github`（workflow）/ `package*` は**無変更**。新規登録テストは追加せず PASS 数は 64 のまま据え置き。
- **production / main / orphan clean base への直接変更なし**（orphan = `b33e7b6` のまま前進させていない）。**#222 / #223 / #229 は一切操作なし**。Draft PR。Ready化 / merge / deploy / publish / release は未実施。branch 削除なし。**FRP-IMPL-004 未着手**。

## 設計: FRP-IMPL-004-DESIGN（保存復元堅牢化 ＋ 再生成ボタン制御 / docs-only）

- **PR #230（TEST-HARNESS-001）merge 後の orphan HEAD `9c4551b12e8b0d75b2760f04e7210a5cfb091c4a`（short `9c4551b`、parent `b33e7b6`=#229）を base** に、FRP-IMPL-004 実装前の **docs-only 設計書**を追加した。branch = `docs/frp-impl-004-save-restore-regenerate-design`。Draft PR・**未 merge**。**`shogi_v4.html` / `test/run_tests.sh` は無変更**（設計のみ）。設計書 = `docs/specs/20260617_frp_impl_004_save_restore_regenerate_design.md`。
- **本書の結論**: FRP append の保存復元は **現実装の構造で「ほぼ既に正しい」**（append は `sanitizeMatch` 正準形 `{p1,p2,winner,lastModifiedBy}`・leftover は派生非保存・`readPersistedState`/`load` は normalize 往復が恒等）。よって FRP-IMPL-004 の主眼は (1) reload 往復テストで不変条件 I1-I11 を **固定**、(2) **`repairBtn_`「組み合わせを再生成」→`generatePairing`（全員上書き L6394）** という破壊経路を **部分手合い組成中（results 空・未割当>0）で非表示**にして封じる、(3) 運営者向け文言整備。**新しい保存スキーマ/メタ情報は足さない**（`sanitizeMatch` が剥がすため）。
- **重要な実測**: match の正準形は `{p1,p2,winner,lastModifiedBy}` の 4 つのみで、**round/table/source/generatedBy フィールドは存在しない**（卓番号=index+1 の描画バッジ・ラウンド番号=`results.length+1` の派生で、いずれも非保存）。タスク要件の当該メタ情報は「持っていないことの明文化」として §3.2 に整理。
- **再生成ボタン制御**: 制御は **UI 層（`buildCurrentPairingsHtml` の再生成ボタン出力 gate＝新 `shouldShowRegenerateButton(cls)` 純 helper）に閉じ、`generatePairing` 本体は不変**（通常開始 round1 再シャッフルという正規用途を壊さない）。A/B クラス独立は全 mutate が `cls` スコープのため構造的に成立。
- **分割案**: FRP-IMPL-004A（保存復元テスト＋堅牢化）/ 004B（再生成ボタン制御）/ 004C（UI 文言）。004A+004B で主要安全価値。
- **スコープ外（明示）**: bye / 任意組み合わせ / 手動並び替え / 複数 round 生成 / 既存 pairing 再生成の統合 / match スキーマ拡張 / production 反映。
- **変更ファイル**: `docs/specs/20260617_frp_impl_004_save_restore_regenerate_design.md`（新規）/ `HANDOFF.md`（本追記）。`shogi_v4.html` / `test/run_tests.sh` / `index.html` / `.github` / `package*` は**無変更**＝docs-only。
- **production / main / orphan clean base への直接変更なし**（orphan = `9c4551b` のまま前進させていない）。**#222 / #223 / #229 / #230 は一切操作なし**。Draft PR。Ready化 / merge / deploy / publish / release は未実施。branch 削除なし。**FRP-IMPL-004 実装未着手**。
- **2026-06-17 レビュー反映（設計書 v0.2・docs-only・PR #231 へ追加 commit）**: **Must Fix** =「部分手合い・未割当0」と「通常開始 round1・未割当0」は**現行 state では識別できない**ことを明記（§5.4 表の未割当0 を由来非依存に統合・§5.4.1 識別限界・§5.4.2 推奨 predicate `shouldShowRegenerateButton`＝`isClassStarted ∧ results.length===0 ∧ pairings.length>0 ∧ 未割当>0` のときだけ非表示）。**Should Fix** = §3.2 を match-level に限定（別文脈 `source`/`sourceState` と区別）／§7 に 004B 出力テスト T6c・T6d と 004A reload 方針を補強／§10 R10（`generatePairing` 直接呼出は許容）／§6・§9 で 004C 文言を最小化。**`shogi_v4.html` / `test` / `index.html` / `package*` / `.github` は無変更＝docs-only 維持**。Draft のまま（Ready化/merge/deploy なし）。
