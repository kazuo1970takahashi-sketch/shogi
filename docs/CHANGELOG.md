# CHANGELOG — SHOGI-TOUR 実装履歴（orphan clean base 系譜）

> このファイルは、従来 `HANDOFF.md` 本体に蓄積していた**スライス単位の実装履歴（履歴＝history）**を、
> Issue #267（HANDOFF 軽量化）に従って**移設したもの**です。**内容は削除せず原文のまま移動**しています。
>
> - **現在地・ブランチ運用・進行中タスクの正本** = [`../HANDOFF.md`](../HANDOFF.md)（薄い stub）。
> - **コード設計マップ（関数構造・データ構造）** = [`./REFERENCE.md`](./REFERENCE.md)。
> - **開発プロセス（工程・SoD・結果書き戻し）の正本** = [`./ai-ops/`](./ai-ops/)。
> - 各スライスの詳細設計・実装結果メモは [`./specs/`](./specs/) / [`./notes/`](./notes/)。
>
> 記載は原文の並び（おおむね時系列・上が古い）。各 HEAD / merge 状態はその記載時点のスナップショットであり、
> 最新 HEAD は HANDOFF.md と orphan ブランチ ref を正とする。

---

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

## テスト: FRP-IMPL-004A（保存復元 reload 不変条件固定）

- **PR #231 merge 後の orphan HEAD `908c4880f925ae090745440435e94855a20a2458`（short `908c488`）を base** に、FRP append 手合いの保存復元・reload 往復を固定するテストを追加した。branch = `feature/frp-impl-004a-save-restore-reload-tests`。Draft PR 作成対象。**`shogi_v4.html` は無変更**（実装コード変更なし）。
- **新規テスト**: `test/test_frp_impl_004.js`（34 assert・架空データのみ）。`normalizeState(JSON.parse(saved))` 相当の reload 往復、`readPersistedState()` と actual `load()` 経路、`pairingsMatchSnapshot`、`getUnassignedFirstRoundPlayers`、`buildCurrentPairingsHtml` を使い、FRP append pairings が保存復元で壊れないことを検証。
- **固定した不変条件**: append 済み pairings の組数・p1/p2・`winner:null`・`lastModifiedBy:'auto'` が reload 後も保持されること、leftover/未割当者は保存せず players - pairings(p1/p2) から派生されること、match-level の `round`/`table`/`source`/`generatedBy`/`leftover` を保存しないこと、卓番号は index+1 描画派生、round は `results.length+1` 派生、A/B クラスが混線しないこと、results 空の初回 round 状態でも pairings が消えないこと。
- **run_tests 登録**: `test/run_tests.sh` に FRP-IMPL-004A ブロックを追加。004A は保存復元テストのみで、004B の再生成ボタン gate / `shouldShowRegenerateButton` / `repairBtn_` 表示制御、004C の UI 文言調整には未着手。
- **検証**: `node test/test_frp_impl_004.js shogi_v4.html` = **PASS 34 / FAIL 0**。関連テスト `test_frp_impl_002.js` = **PASS 79 / FAIL 0**、`test_frp_impl_003.js` = **PASS 64 / FAIL 0**。`bash test/run_tests.sh shogi_v4.html` = **PASS=65 / FAIL=0 / WARN=35**（WARN 35 は既存の missing test file 系で今回の新規 WARN なし）。
- **変更ファイル**: `test/test_frp_impl_004.js`（新規）/ `test/run_tests.sh`（FRP-IMPL-004A 登録）/ `HANDOFF.md`（本追記）。`shogi_v4.html` / `index.html` / `.github` / `package*` は**無変更**。match スキーマ拡張・leftover 保存・`round`/`table`/`source`/`generatedBy` 保存追加なし。
- **production / main / orphan clean base への直接変更なし**。**#222 / #223 / #229 / #230 / #231 は一切操作なし**。Ready化 / merge / deploy / publish / release は未実施。branch 削除なし。後続タスク（004B/004C、bye、任意組み合わせ、手動並び替え、複数 round 生成）は未着手。

## 実装: FRP-IMPL-004B（再生成ボタン gate / 部分手合い保護）

- **#232（FRP-IMPL-004A）merge 後の orphan HEAD `c47861ecd0f64873d0d3eb75949d2ec0279e6941`（short `c47861e`）を base** に、初回 round の部分手合い組成中に「組み合わせを再生成」(`repairBtn_`) で既存 FRP append 手合いを破壊しないよう gate を実装した。branch = `feature/frp-impl-004b-regenerate-button-gate`。Draft PR 作成対象。
- **新規 reader**: `shouldShowRegenerateButton(cls)`（副作用なし）。**4条件すべて真のときだけ false（非表示）**＝`isClassStarted(cls)` ∧ `state.results[cls].length===0` ∧ `state.pairings[cls].length>0` ∧ `getUnassignedFirstRoundPlayers(cls).length>0`。それ以外は true。**未割当0 は非表示条件に含めない**（「部分手合い・未割当0」と「通常開始 round1・未割当0」は現行 state では識別できない＝設計 §5.4.1。start source/generatedBy 等の保存メタ情報は追加しない）。
- **出力 gate**: `buildCurrentPairingsHtml` で `shouldShowRegenerateButton(cls)` が false のとき `repairBtn_{cls}` を**出力しない**（HTML に出ない＝bind 対象も存在しない）。true のときは従来どおり出力。`submitBtn_` 等は gate 対象外。
- **強化 confirm（最小限）**: 再生成クリック時、(1) 勝敗入力済みは既存の「勝敗が消える」保護 confirm を**最優先で維持**、(2) results 空・pairings あり（＝結果未確定の初回 round）では「現在の組み合わせをすべて作り直します。今ある手合いは破棄され、全員をペアし直します。」と**作り直す操作であることを明示**する confirm を追加。文言は最小限・全文固定テストはしない（004C の補助文増量には踏み込まない）。
- **`generatePairing` 本体は不変**: `state.pairings[cls]=pairs`（全員上書き）の破壊的性質は変えない。制御は UI 層（出力 gate）に閉じる。コンソール/テストから `generatePairing` を直接呼べば従来どおり上書きされ得る点は**設計上許容**（test G1 で明示固定）。**A/B クラス独立**＝全 mutate/判定/未割当計算が cls スコープ（test P6/H5/G2 で固定）。
- **テスト**: `test/test_frp_impl_004b.js`（新規 29 assert・架空データのみ）= predicate(P1-P6)/出力 gate(H1-H5)/DOM bind 対象の有無(B1-B4・strictIds で実 DOM 相当を再現し未割当>0 で `getElementById(repairBtn_)`=null を固定)/confirm(C0-C5・呼出有無と危険語句で確認・全文固定なし)/generatePairing 不変(G1-G2)。`test/run_tests.sh` に FRP-IMPL-004B ブロックを登録。既存 B9（再生成時勝敗確認）heuristic は winner-confirm を `repairBtn_` の近接行に維持して PASS 継続。
- **検証**: `node test/test_frp_impl_004b.js shogi_v4.html` = **PASS 29 / FAIL 0**。回帰 `test_frp_impl_004.js`=**34/0**・`test_frp_impl_002.js`=**79/0**・`test_frp_impl_003.js`=**64/0**。`bash test/run_tests.sh shogi_v4.html` = **PASS=66 / FAIL=0 / WARN=35**（004A baseline 65→66＝004B ブロック +1 PASS・**新規 WARN なし**）。
- **変更ファイル**: `shogi_v4.html`（reader 追加 + 出力 gate + confirm 強化）/ `test/test_frp_impl_004b.js`（新規）/ `test/run_tests.sh`（004B 登録）/ `HANDOFF.md`（本追記）。`index.html` / `package*` / `.github` は**無変更**。match スキーマ拡張・leftover 保存・`round`/`table`/`source`/`generatedBy` 保存追加なし・bye/任意組み合わせ/手動並び替え/複数 round 生成なし・**004C 補助文増量なし**。
- **production / main / orphan clean base への直接変更なし**。**他 PR（#222/#223/#229/#230/#231/#232）は一切操作なし**。Draft PR・Ready化 / merge / deploy / publish / release は未実施。branch 削除なし。

## Docs: FRP-IMPL-004 完了レビュー / 手動確認メモ

- **FRP-IMPL-004A/B 完了レビューを docs-only で追加**: #231（設計）/#232（保存復元 reload テスト）/#233（再生成ボタン gate）merge 後の orphan HEAD `efdfa29c74d0ec2ea47fcbdf80c9d329acd85e6d` を base に、`docs/notes/20260618_frp_impl_004_completion_review_manual_check.md` を追加した。branch = `docs/frp-impl-004-completion-review-manual-check`。
- **メモ内容**: 004 の目的、004A で固定した保存復元不変条件、004B の `shouldShowRegenerateButton(cls)` predicate、未割当0を非表示条件に含めない理由、`generatePairing` 本体不変、UI gate は通常操作保護で直接呼出は上書きされ得ること、手動確認シナリオ A-E、残 Nice to Have を整理。
- **次候補**: まず手動確認後に判断。必要なら **004C**（UI 文言の最小補足）のみを小さく実施する。
- **production 反映は未実施**。`main` / `production` への影響なし。`shogi_v4.html` / `test/` / `test/run_tests.sh` / `index.html` / `package*` / `.github` は無変更。Ready化 / merge / deploy / publish / release / branch 削除なし。

## Docs: FRP-IMPL-004C クローズ（UI 文言最小補足 — 実装せず終了）

- **FRP-IMPL-004C（UI 文言・運営向け説明の最小補足）を実装せずクローズ**: orphan clean base HEAD `75e6851` を base に、棚卸しメモ `docs/notes/20260703_frp_impl_004c_close.md` を追加した（docs-only）。branch = `docs/frp-impl-004c-close`。
- **根拠**: 設計 §6 で予定した文言は 004B（強化 confirm「現在の組み合わせをすべて作り直します…」）＋後続スライス（FRP-UNASSIGNED-COUNT-001 / FRP-SMALL-UX-001 / PROGRESSIVE-PAIRING-IMPL-P2 / HELP-UX-001）で全て充足済み。監査 `docs/notes/20260702_shogi_system_audit_colorcoded_v0.md` §3 の条件付き決定（迷い所なければクローズ）と整合。当該画面は情報密度過多の指摘（同監査 🟡-7）があり追加文言はむしろ逆行。
- **再開条件**: 今後の月例で FRP 周辺の迷い所が実地で出た場合、その箇所だけの新スライス（別 ID）で対応する（004C としては再開しない）。
- **変更ファイル**: `docs/notes/20260703_frp_impl_004c_close.md`（新規）/ `docs/CHANGELOG.md`（本追記）。`shogi_v4.html` / `test/` / `index.html` / `package*` / `.github` は無変更。production / main / orphan clean base への直接変更なし。Draft PR・Ready化 / merge / deploy は未実施。

## CLASS-VARIABLE-002 (#768): 受付コアの A/B 固定を全クラス化（CV-2・C クラス分割運用の解禁）

- **受付コア**: `addPlayerFromMaster` / `changePlayerClass` の A/B hard reject を「isSafeClassId＋受け皿配列実在」へ置換（error 名不変）。`changePlayerClass` の探索は `listClassIdsForMasterSync` 流用で全クラス走査。`ppDenseSelectableClasses` は `getRegistrationClassList()` 素通し（モードバー/受付シート/編集シートの候補が C+ に追随・旧「A/B 以外は手入力」注記撤去）。`finalizeAddPastParticipants` は第4引数 `cls` 化（未指定はピッカー選択クラス fallback→'A'。#761 一括登録 UI が自前 cls を渡す想定）。
- **last_class 不変条件の一般化**: #273 の「非 A/B は null」を「isSafeClassId 以外は null」へ（load 正規化 / createMemberFromParticipant / 📋名簿更新 / 統合 / ☁復元収集・マージ / verify helper / 表示2箇所）。Phase2 レガシー importer・マスタ編集フォームの前回クラス radio（A/B のみ・C 保持者は未チェック=変更しない）・旧 GOLDEN ビルダーは意図的に不変。
- **後方互換**: last_class に C 等が入った master を旧版（?v≤126）で開くと load 正規化が null に落とす（安全側・データ構造破壊なし・最新出席の再同期で復元）。
- **テスト**: `test_class_variable_002.js` 新設（31 checks）＋既存4本を新契約に追随（`test_branch_master_all_classes_273` LASTCLS-3/STALE-1/STALE-5・`test_master_rebuild_from_cloud_001` BUILD-NONAB-1・`test_master_list_ux_001` L3a ピン・`test_guest_tournament_001` 抽出環境に依存2関数追加）。設計レビュー（独立 L3）= conditional-go 条件反映済み。

## RESULT-CARD-6R-001 (#769): 最終結果スマホカードのはみ出し修正＋回戦数 6/7 解禁（50名1クラス対応）

- **S4（先行）**: 回戦セル行を `display:flex;gap:4px`（wrap なし）→ `display:grid;grid-template-columns:repeat(auto-fit,minmax(56px,1fr));gap:4px` に。両セルへ `min-width:0;overflow:hidden` 統一。320px 級でも 3/4回戦は従来同様1行・5回戦以上は自動折り返し＝はみ出し構造の根絶（意図的 UI 修正＝golden `buildResultsClassHtml__A_sp` を UPDATE_GOLDEN=1 で再採取・diff は当該1ケースのみ）。
- **S1（後）**: 回戦数選択肢 `[3,4,5]`→`[3,4,5,6,7]`（renderRoundsControl / renderClassManager の2箇所）。既定4・開始後ロック・選択肢外現在値の保険は不変。下流は roundsForClass/state.rounds live 参照で追従。
- **実測（320/390/599px × 3〜7回戦 × 架空50名）**: カードはみ出しゼロ・320px で 3/4回戦1行・390/599px で 5回戦1行。
- **既知の別件（範囲外・記録）**: 最終結果タブの `#liveDisplayMode` select（幅457px）が <478px 画面でページ横スクロールを起こす既存問題を実測で特定（回戦数と無関係・ベースラインから存在）。別 Issue で対応。
- テスト: `test_result_card_6r_001.js` 新設（14 checks）。独立L3設計レビュー conditional-go（golden 工程化・minmax 56px 化）条件反映済み。

## SB-HEADER-STICKY-001 (#770): スマホ星取表の列ヘッダを縦スクロールに追従（50行対応）

- **問題**: `.sb-table thead th` は `position:sticky;top:0` 指定済みだが、縦スクロールが `#scoreboard-view`（overflow-y:auto）で起き、sticky の基準になる `.sb-scroll` は横スクロール専用（overflow-x:auto・max-height なし）で縦に伸び切るため sticky が機能せず、50行スクロールで回戦列ヘッダが画面外（実測 top=-984px）へ消えた。左の順位/氏名列（横 sticky）は正常。
- **修正（CSS 1ルールのみ）**: `.sb-scroll` に `overflow-y:auto` ＋ `max-height:calc(100dvh - 230px)`（100vh フォールバック先行）を付与し、縦スクロールを `.sb-scroll` 内側へ閉じ込めて thead sticky を成立させる。横スクロール・左列 sticky・thead sticky 指定・保存スキーマ・公開範囲は不変。小人数（表が max-height 未満）はスクロールバーが出ず従来どおり。
- **実測（feat ツリー・playwright）**: 390×844 / 375×667 × {50名1クラス, 12名1クラス, 40+40名2クラス} の6構成で、縦スクロール後も回戦見出し th が上端維持（216/264px 不変）・左列 sticky 不変・多クラスは各表の見出しが独立追従。12名×tall 画面は内側スクロール非発生＝見た目不変（短い画面では内側スクロールが出るが header は残る＝劣化なし）。
- テスト: `test_sb_header_sticky_001.js` 新設（9 checks・CSS ソース静的担保）。既存 `test_live_scoreboard_001` A7（overflow-x ピン）・golden（builder 出力）に影響なし。Review Level L2。

## SB-LIVE-SELECT-WIDTH-001: ライブ配信「表示名」セレクタの固定幅457pxを撤廃（狭幅スマホのページ横スクロール解消）

- **問題**: 最終結果タブの `#liveDisplayMode`（表示名セレクタ）に幅制約が無く、native select が最長 option（「フルネーム（主催者が告知・同意運用を決定済みの場合）」）の intrinsic 幅 **457px** に広がる。親行は flex（wrap あり）だが flex item の既定 `min-width:auto` により縮まず、**478px 未満の画面でページ全体が横スクロール**（実測: 320px で +158px・375px で +103px・390px で +88px）。#769 調査で真因特定済みの「既知の別件」。
- **修正（インライン CSS 1箇所のみ）**: `#liveDisplayMode` の style に `max-width:100%;min-width:0` を追加。狭幅では親行内に収まり、478px 以上では従来どおり intrinsic 幅を維持（見た目実質不変）。選択肢・既定選択（姓＋番号のみ・受入 #17）・bind・文言は不変。
- **実測（playwright・showTab('result')）**: 修正前 320/375/390px で scrollWidth=478px 固定（はみ出し）→ 修正後 320/375/390/478/600px 全てはみ出しゼロ（scrollWidth=clientWidth）・600px で select 幅457px 維持。既定選択の表示文字列は狭幅でも切れない（最長 option はドロップダウン一覧＝native 描画で全文可読）。
- テスト: `test_live_broadcast_phase3.js` に H2b ピン追加（max-width:100%;min-width:0 の存在）。既存 H2（id 存在）等は不変。ドキュメント4面は挙動説明に変化なし＝追随不要（表示名の選択肢・既定は不変）。Review Level L2。

## STAGE0-CONFLICT-FREE-001: 調整ファイルの追記点衝突の除去（並行実装の解禁）

- **問題**: 全スライスが `test/run_tests.sh` の末尾と `docs/CHANGELOG.md` を編集していたため、共有の追記点で必ず衝突していた。SPLIT-FEASIBILITY-001 §5 の実測では、直近 20 隣接ペアの並行開発衝突 18 件のうち **12 件（60%）がこの 2 ファイルの追記点だけ**に起因していた（`shogi_v4.html` のモノリスとは無関係）。
- **① テスト登録を「末尾追記」から「自動発見」へ**: `test/test_*.js` と `test/test_*.sh` / `test/*_pgtest.sh` を glob + sort（`LC_ALL=C`）で自動発見して実行する。見出しはテストファイル先頭のコメント行から採る（`// @suite: 説明` で明示上書き可）。**以後、新規テストは `test/` にファイルを置くだけで、`run_tests.sh` に diff は出ない。** 明示リストは 2 種のみ維持（`RETIRED_TESTS` = 撤去済みスタブ `test_start_003.js`／`NO_TARGET_TESTS` = 従来から引数なし呼び出しの 2 本）。
- **走査漏れ検査を追加**: git 追跡テストのうち自動発見されなかったものを FAIL にする（旧方式の warn「登録済みだがファイルが無い」の代替）。正常時は PASS を増やさない。
- **② CHANGELOG を「本体直接編集」から「断片方式」へ**: 各スライスは `docs/changelog.d/<YYYYMMDD>_<スライスID>.md` を 1 本置くだけ。リリース列車の組成時に `bash scripts/changelog_merge.sh` が日付順で本体へ連結し、断片を削除する（冪等・断片ゼロなら no-op）。既存の `docs/CHANGELOG.md` の内容は無改変。
- **既定の連結位置は末尾**: `docs/CHANGELOG.md` は「記載は原文の並び（おおむね時系列・上が古い）」と明記し、直近スライスも実際に末尾へ追記している（例: SB-LIVE-SELECT-WIDTH-001 = `@@ -183,3 +183,10 @@`）。ブリーフの文言は「冒頭追記」だったが、実態と本文の宣言に合わせて末尾を既定とし、`--position top` で切替可能にした。
- **検証**: ①は旧 `run_tests.sh` から機械抽出した登録 187 件と新方式の実行 187 件が完全一致（旧のみ 0・新のみ 0）、フルスイート PASS=233 / FAIL=0 / WARN=0 で変更前と同値。②は `test/test_changelog_merge.sh` 24 項（順序・冪等・no-op・既存本文無改変・dry-run 非破壊・README 除外・`--position top`・不正入力の拒否）が bash 5.3 / macOS bash 3.2.57 × C / ja_JP.UTF-8 ロケールで全 PASS。Review Level L4。
- **この断片自体が新方式の実例**（`docs/CHANGELOG.md` は本スライスでも 1 行も編集していない）。

## CHANGELOG-MERGE-ATOMIC-001: 永続transaction方式へ再設計

- `scripts/changelog_merge.sh` の連結処理を、rollback中心の方式から永続transaction方式へ変更。
- CHANGELOGと同じfilesystemにatomic `mkdir` lockを作り、既存lockはactive/staleを推測せず
  fail closed（exit 3）にする。lock取得クリティカル区間はsignalを一時保留し、owner無しlockを残さない。
- live断片は永続transactionのquarantineへ`rename`してからsnapshotを作成する。
  移動前にhard-link probeで断片とCHANGELOGが同一filesystemであることを確認し、cross-FSは拒否する。
  成功した同じ実行ではquarantineを削除しないため、rename前から開かれていたfile descriptorによる
  遅延書込みも元inodeに残り、消失しない。
- CHANGELOGの同一filesystem `rename`を唯一のcommit pointとし、commit後はrollbackしない。
  `preparing` / `prepared` / `committing` / `committed` / `aborted` のstateをatomic更新する。
- crash後の`committing`は、保持した`changelog.before`・`published.image`と現在のCHANGELOGを比較し、
  commit済み・未commitを確定する。どちらとも一致しない場合は曖昧状態としてexit 3で停止する。
- commit前の断片復元はhard-link作成をatomic no-clobber pointにする。同名liveが再作成されていれば
  上書きせず、liveとquarantineの双方を保持してexit 3にする。
- 空・空白のみの断片は変更前に全件拒否。`--dry-run`、`--position top/end`、決定的なファイル名順、
  断片ゼロno-opを維持。
- `test/test_changelog_merge.sh` を新設計に合わせて更新し、排他lock、commit前後crash recovery、
  signal、曖昧crash、同名再作成race、open fdへのpost-rename write、commit後の並行CHANGELOG更新を
  sandbox内で直接検証する。
- 永続transactionとlockは`.gitignore`に登録し、通常の`git add -A`で誤って取り込まれないようにする。
- 編集範囲はスクリプト本体・専用テスト・本断片のみ。
  `docs/CHANGELOG.md`本体、`shogi_v4.html`、`test/run_tests.sh`、productionは無変更。

## PHASE1-REACH-001: 到達可能性チェックの常設化（Phase 1 スライス1）

- **問題**: Issue #798 で、`shogi_v4.html` の 35 関数（1,081 行 ≒ 6.5%）が UI から到達不能なまま
  **237 本のテストが全部緑**という状態が見つかった。テストが関数のソースを抽出して単体で呼ぶ方式のため、
  UI から到達できなくても PASS する。実害として #790 ③ のゲスト大会 warn 注記が
  「構造的に表示不可能」だったことが実機で確認された。
- **修正**: 到達可能性を機械で検査し CI で落とす仕組みを追加した（**純粋な追加**。既存 180 本のテストと
  `shogi_v4.html` は 1 行も触っていない）。
  - `test/lib/reachability.js` — 走査ライブラリ（依存ゼロの node）。
    - 検査1: トップレベル `function NAME(` に対し、ルート（HTML のインライン属性 ＋ スクリプト直下の文）
      からの**推移的**到達可能性を計算する。
    - 検査2: `getElementById` / `querySelector(All)` の引数の id / class のうち、**どこでも生成していない**
      ものを検出し、そこへ結線されたハンドラを実行時到達不能として差し引く。
    - #798 で実際に踏んだ 3 つの罠を構造的に回避している: コメント内の言及を参照に数えない ／
      JS 文字列内の `<script>` で走査領域を二重化しない ／「定義以外の出現 0 回」方式を使わない。
  - `test/reachability_allowlist.json` — 既知例外。**全件に理由が必須**（理由の無い / 短すぎるエントリは
    検査が拒否する）。到達可能に戻ったエントリの放置も FAIL（掃除の強制＝肥大防止）。
    初期値は #798 の分類そのまま（温存マーカー明記 23 / テスト専用フック 4 / 取り残しヘルパ 2 /
    機能欠落クラスタ 6 / 実行時到達不能 9）。
  - `test/test_reachability_001.js` — 検査本体。`run_tests.sh` の自動発見でそのまま CI（必須チェック
    `Unit (run_tests.sh)`）に載る＝**初日から blocking**。実行 0.6 秒。
- **検算（変異検証）**: 「常に緑を返すだけの検査」ではないことを、同じ判定関数を通して実証している。
  生きている bind を外す（M1）／インライン `onclick` を外す（M2）／結線先の id を描画しなくする（M3）／
  allowlist から 1 件外す（M4）／allowlist の理由を空にする（M5）— いずれも FAIL になることを検査自身が確認する。
  変異はすべて**メモリ上のコピー**に対して行い、`shogi_v4.html` は 1 バイトも書き換えない。

### PHASE1-REACH-001b: 検査そのものに開いていた同じ形の穴を塞ぐ（差し戻し対応）

- **問題**: 「237 本のテストが全部緑なのに 1,081 行が到達不能」を防ぐための検査が、**同じ形の穴を 2 つ**
  持っていた（Codex レビュー P1 ×2・cowork が独立に再現）。
  1. **文字列リテラル内の識別子を呼出辺に数えていた。** `shogi_v4.html:9199-9200` の
     `callsiteId:'SAVE-003-startTournament-'+classId` という**ログ用の文字列**が呼出辺になり、
     到達不能な `startTournament()` が「生きている」と誤判定されていた。同クラスタの
     `collectStartCandidates` / `showStartValidationErrors` / `resolveNoCandidateMessage` も芋づるで隠れ、
     **静的到達不能を 26 と過小に報告していた（正しくは 30）**。罠(1)（コメント）と同じ穴が文字列側に残っていた。
  2. **連結セレクタを拾えていなかった。** `getElementById('helpBtnFirstRound_'+cls)`（:10698）と
     生成側 `id="helpBtnFirstRound_'+escapeHtml(cls)+'"`（:10893）のペアが検査対象外で、
     生成側 id を改名する変異が素通りした。
- **修正**（`test/` のみ・`shogi_v4.html` は引き続き 0 行）:
  - 文字クラス `S`（文字列 / テンプレート文字列部 / 正規表現リテラル）を**参照から除外**した。
    件数は `stringRefs` に残して数え漏らしを見えるようにしている。動的ディスパッチ
    （`window['name']()` 等 / 文字列 `setTimeout` / `eval`）は現行ファイルに 1 件も無いことを確認済みで、
    将来必要になったら allowlist で扱う。
  - `getElementById('prefix_'+x)` を `id-prefix` として拾い、**接頭辞での照合**で生成側の実在を確認する
    （完全な式解析はしない）。死んだ結線は `#prefix_*` として報告する。
  - `baseline` を実測で取り直し（静的 26 → **30**）、増えた 4 関数を理由つきで allowlist に入れた。
- **変異検証を 3 本追加**（M6 / M7 / M8）: 死んだ関数の名前を**文字列**の中に置いても検出されること（M6）／
  連結 ID の生成側を改名すると死んだ結線として検出されること（M7）／名前を**コメント**の中に置いても
  検出されること（M8・#798 の罠1 の再発防止）。あわせて偽陽性が無いこと
  （`onclick` 結線つきの生きた関数を 1 本足しても緑のまま）を FP-0〜FP-4 で確認する。
  この 3 本と S10 / S11 は**修正前の走査に対しては FAIL する**ことを実測してある（PASS=46 FAIL=10）。
- テスト: `bash test/run_tests.sh shogi_v4.html` PASS 236 → **237**（+1 = 本スライス）・WARN=0。
  検査本体は PASS 32 → **56**。`shogi_v4.html` の差分 0 行・既存テストの変更ゼロ。
  macOS bash 3.2.57 / Linux(CI) の両方で実行。
- **見つかっている死にコードはこのスライスでは消さない・直さない**（Issue #798 で別判断・2026年9月大会後）。
  #798 に記録された「35 関数」は過小で、正しくは **39 関数**（静的 30 + 実行時 9）。

### PHASE1-REACH-001c: HTML 側・起動経路・死んだ領域の終端（差し戻し 2 回目の対応）

- HTML マークアップ（id / class / data-* / テキスト）を参照から外し、**インライン on*= の値だけ**を
  参照にした（高1）／押せない隠しファイル入力の「起動経路なし」を扱った（高2・`loadData` を新規検出）／
  JS 文字列で組み立てた HTML の `on*=` は参照に戻した（高3）／死んだ領域の終端を位置ベースから
  **文（statement）単位**へ変えた（高4・高5）。実測: runtime 9 → **10**・bindings 4 → **5**。

### PHASE1-REACH-001d: 面レクサへの構造転換 ＋ 検査2 の降格（差し戻し 3 回目の対応）

- **問題**: 1〜3 版とも「参照として数える領域の境界」で**同じ形**に破られた。
  1版目 = JS 文字列 → 2版目 = HTML マークアップ → 3版目 = **属性名の前方一致**
  （`<span data-onclick="startTournament()">` を 1 つ足すだけで `data-onclick` がインラインハンドラと
  誤認され、死んだ 4 関数が「生きている」に戻って検出から消える。実測 静的到達不能 30 → **26**）。
  さらに実在の `onclick` を**複数行**にしただけで走査が打ち切られ、生きた 3 関数が到達不能に転落した
  （実測 静的 30 → **33**）。個別の穴を塞ぐ 5 版目ではなく、構造で塞ぐ方針へ転換した（作者承認済み）。
- **修正1: 単一の面レクサ**（`test/` のみ・`shogi_v4.html` は引き続き 0 行）
  - `classifyFaces(src)` がファイル全体を一度だけ **16 面**に分類し、以降の全判定はその分類だけを読む。
    **正規表現でソース全体を舐めて「ここは参照」と決める判定は全廃**した。
  - **参照として数える面は JS_CODE ＋ ATTR_VAL_ON の 2 つだけ**。on* 判定は属性名トークンの
    **完全一致** `/^on[a-z]+$/i` ＝ `data-onclick` は原理的に on* にならない。
  - **完全性を不変条件としてテストが毎回検査する**（未分類 0・面の総延長 = ファイル長 859,767）。
  - 文字列で組み立てた HTML の `on*=` は、文字列の連結ランを復号して**面レクサを再帰適用する
    派生パス**で拾う（全文正規表現をやめた）。
  - **移行オラクル**: 3 版目との突き合わせで JS 面の文字分類 791,664 文字・「参照として数えるか」の
    判定 859,767 文字・解析結果（root / 静的・実行時到達不能 / 死んだ結線 / 死んだ領域 / 全 580 関数の
    参照内訳）すべて**不一致 0**。実測値は 30 / 10 / 5 / 580 のまま変わらない。
- **修正2: 検査2 を CI の FAIL 判定から外した**（作者承認済み・走査と出力は warn として維持）。
  静的走査のままでは偽陽性が**原理的**に消せないため: `||` フォールバックを 1 行足すと死んだ結線が
  1 件増える／セレクタヘルパを**関数式**（`var __byId=function(id){…}`）へ抽出すると別名として
  認識できず検出自体が消え、**R5 の解消不能 FAIL が 7 件**出る（allowlist に足しても消せない詰み）。
  検査1 単独で到達不能 40 関数中 30・行数 64% を被覆し、#798 で実害が記録された #790 ③ は検査1 の
  守備範囲にある。恒久的な厳密化（Playwright 実 DOM 突合・nightly）は別スライスで起案する。
  あわせて allowlist 上限 A5 も「超過で即 FAIL」をやめ、baseline との差分表示 ＋ 1 件ごとの理由必須へ。
- **検算**: **面 × 変異の全表**（16 面すべてに最低 1 変異・差し込んだ名前がその面に載ったことを実測して
  から期待を照合）／`data-onclick` の値が ATTR_VAL であることの pin ／複数行 on* でルートを失わない pin ／
  `||` フォールバックと関数式ヘルパ抽出で**ブロッキングエラーが 0** であること／既知の限界 4 件の pin ／
  **検査2 だけが違反する一時ファイルに対してこのテスト自身を子プロセスで走らせ、終了コード 0 を実測**。
  テスト本体 PASS 210 → **353**・実行 5.6 秒 → **3.3 秒**（走査 1 回 180ms → 97ms）。
  変異はすべてメモリ上のコピーに対して行い、`shogi_v4.html` は 1 バイトも書き換えない。

### PHASE1-REACH-001e: ハーネスの照合設計と派生パスの穴（差し戻し 4 回目の対応）

- **問題**: 参照判定のコア（面レクサ）は反証パネルの総攻撃に耐えたが、**別の層**で破れた。
  1. **自己テストの絶対 pin が CI ゲートを事実上元に戻していた。** 変異テストが warn を
     「基準 warn=0」前提の絶対集合で照合しており、正当な編集で warn が 1 件出ただけで
     無関係なテストが落ちる。加えて anchor が行テキストの完全一致だったため、
     **新規ボタン追加 / 新規 script 追加 / FP-4・FP-7 が「安全」と証明したリファクタの実施 /
     死にコード 1 件の削除**の 4 操作すべてで赤くなった（実測: 1 → 1 FAIL、2 → 1 FAIL、
     3 → 6 FAIL、4 → 26 FAIL）。
  2. **warn が CI ログで見えない。** `run_tests.sh` は成功時 `tail -1` しか出さない。
  3. **派生パスの偽陰性 2 件。** 一度も挿入されない死んだ HTML テンプレートの `onclick=` が
     死んだ関数を無言でルート化する／セミコロン無しの独立 2 文を連結ランが 1 本に繋ぎ
     （ASI 越境）死んだ関数が生き返る。
  4. **allowlist の門が文字数だけだった。** `"x"×20` で任意の死にコードを恒久緑化できた。
  5. 中: `onbogus=` が on* と誤認される／`if(x) /['"]/.test(s)` を除算と読んで**後続の
     生きたコードが文字列面に飲まれる**／`++` 直後を正規表現と読む／`\xNN`・`\uXXXX` 未復号／
     `<label for>` が面で門番されていない／移行オラクルが再現不能な散文だった。
- **修正**（`test/` のみ・`shogi_v4.html` は引き続き 0 行）:
  - **照合を「絶対集合」から「対象ファイルの現状評価との差分」へ**。変異で増減した違反だけを
    照合する。anchor は行テキストではなく**解析結果（関数の位置・面・ルート・死んだ結線）から
    引く**。面 × 変異の全表は**注入した合成の死んだ関数**を使う＝ #798 の掃除で壊れない。
    実態の数（script 数・on* 属性数）の pin は census（情報表示）へ降格。
  - **4 操作を実際に施したファイルに対して本スイート全体を子プロセスで走らせ、exit=0 を実測**
    （5 本目に「検査2 だけが違反する状態」を加えて計 5 本・並列実行）。
  - 最終行を `PASS=… FAIL=… **WARN2=n**` にした＝ `run_tests.sh` の `tail -1` で CI ログに載る。
  - 派生パス: `+` の直後にだけ式オペランドを許す（ASI 越境の遮断）／打ち切りを
    `concatTruncations` として warn 報告／`\xNN`・`\uXXXX`・`\u{...}` の復号と**復号後トークンの
    元位置収集**／JS 文字列の on*= だけで生きている関数を `derivedOnlyReachable` として warn 表示。
  - 字句: on* を**実イベント名の有限リスト**（113 件）に、未知の on* 形は warn 報告／
    制御構文の `)` 直後は正規表現・`++` `--` 直後は除算。
  - 運用: R4 を**形式照合**（category の区分キーワード ＋ 根拠参照 `#Issue` / `L行` / 日付）に。
    A5 超過 → warn の経路自体を変異でテスト。`<label for>` と inert-trigger のセレクタ別名を門番。
  - **移行オラクルを成果物化**: `test/tools/reach_migration_oracle.js`（旧版を git から取り出して
    突き合わせる）。`node test/tools/reach_migration_oracle.js 9176cc5 shogi_v4.html` で
    **差分ゼロ**を第三者が再現できる。
- テスト: 本体 PASS 353 → **467** FAIL=0 / WARN2=0（実行 8.3 秒・子プロセス 5 本を並列実行）。
  `bash test/run_tests.sh shogi_v4.html` は **PASS=237 FAIL=1 WARN=0** で 001c/001d から不変。

### PHASE1-REACH-001f: 残った同型 pin ・A5 境界・warn 層の無防備（差し戻し 5 回目の対応）

- **問題**: 参照判定のコア・4 操作・warn 可視化・オラクル・R4・字句はパネルの攻撃に耐えたが、
  **同じ形（正当な編集で赤くなる）の pin が 2 本残っていた**ほか、warn 層に検査の実体が無かった。
  1. **高1a** M2 が「先頭のインライン on*= が呼ぶ関数は他にルートを持たない」を暗黙 pin。
     同じ関数を呼ぶボタンを 1 個増やすだけで M2-2/M2-3 が FAIL し、allowlist でも回避できない（実測）。
  2. **高1b** `indexOf('beforeend')` の生テキスト anchor が残存。標準 API
     `insertAdjacentHTML('beforeend', …)` を使う無害な関数を 1 個足すだけで FAIL（実測）。
  3. **高2** allowlist が上限 +1 になると **A5-3（「超過は warn だけ」を主張するテスト）自身が落ちる**
     自己矛盾。M4-1 も基準側の A5 warn が消える分を stray 扱いしてスイート全体が exit=1（実測）。
  4. **高3** warn 層の検出装置は壊しても緑。R2（実行時到達不能）の一覧を `slice(0,1)` で 9/10 件
     捨てても、class 結線の検出を丸ごと削除しても 467 全緑だった。
  5. **中1** `markHtmlInJsStrings` が `classifyFaces(run.text)` を out 無しで呼んでいて（1 行のバグ）、
     **JS 文字列の中の未知 on*= は R8 に一切出なかった**。加えてイベント名リストに実在イベントが
     6 件漏れており、`onmousewheel` で結線した**生きた関数が R1 error** になった（＝虚偽の
     allowlist 登録以外に緑化手段が無い、最も危険な向き）。
  6. **中2** 連結ランの打ち切りが**実ファイルでも生きた関数を R1 error 化**する（001e の境界テストは
     fixture 側で allowlist に事前登録していたので、この向きを証明できていなかった）。R7 の識別子が
     行番号のため、行がずれる編集のたびに無関係なアサーションが毒される。
  7. **中3** オラクルが 001d 以降の rev で `TypeError` 墜落。`test/tools/` は在庫突合に載っていない。
- **修正**（`test/` のみ・`shogi_v4.html` は引き続き 0 行）:
  - **M2 は「唯一ルート」を前提にせず、対象関数のルートを解析結果から全部潰してから照合する**。
    あわせて「同じ関数を呼ぶボタンを 1 個増やしても何も起きない」を M2-4/M2-5 で固定。
  - 生テキスト anchor を廃し、`derivedOnPos()`（面 ＋ 派生位置集合から引く）へ置き換えた。
  - **A5 は基準側の状態を見てから期待を作る**。`allowlist_max = 現在件数 - 1`（＝上限 +1）でも
    error 0・A5 warn 表示になることを A5-4/A5-5 と E2E ⑧で固定。
  - **warn 層に「枯れ検査」を入れた**（WI-1〜3）。死んだ結線（id / class）と、その死んだ領域から
    しか呼ばれない関数 3 本を**合成 probe として注入**し、毎回「検出できること」自体を確かめる
    ＝対象ファイルの実数を凍結せずに検出装置の生死を見る。さらに **lib を実際に壊した版を
    その場で生成して当て、枯れ検査が落ちることを実測**する（WI-M: R2 の `slice(0,1)` →
    runtime 3→0 ／ `scanByCss('querySelectorAll')` 削除 → class 検出 true→false）。
    pinIf（実例があるときだけ照合する検査）の **skip 数に上限**（M9c）も入れた。
  - 派生パスの `out` を伝播（1 行）＝ JS 文字列の中の未知 on*= も R8 に出る。イベント名リストへ
    漏れていた 6 件（`onmousewheel` / `onpointerrawupdate` / `onfullscreenchange` /
    `onfullscreenerror` / `oncommand` / `onscrollsnapchange`）を追加し、**出典と更新方針**
    （足す方向にしか運用しない）をリスト直上に明記した。
  - **連結ランの打ち切りを廃止**。オペランドの終わりは構造（`;` / `,` / 深さ 0 の閉じ括弧）だけで決め、
    長さは `CONCAT_OPERAND_REPORT_LIMIT` を超えたら **報告するだけ**（R7 warn）にした
    ＝打ち切りに起因して参照を落とすことは無い。R7 の識別子は行番号から
    **所有関数名＋序数**（例 `renderX#1`）へ変え、行ずれで sig が変わらないことを CONCAT-7/8 で固定。
  - オラクルに **rev 適合性ガード**を追加（非対応 rev は理由を書いて **exit 2**。実測: `2e8f30e` /
    `d4e6d98` → 2、`9176cc5` → 0 で差分ゼロ）。ガード関数を export し、本スイートの
    ORACLE-1〜4 が `test/tools/` を在庫突合する。
- 実測値は 001c 以降ずっと不変（静的 30 / 実行時 10 / 結線 5 / 関数 580 / root 10 / インライン on* 3）。
  allowlist の変更なし。
- テスト: 本体 PASS 467 → **539** FAIL=0 / WARN2=0（**子プロセス 8 本**を並列実行）。
  `bash test/run_tests.sh shogi_v4.html` は **PASS=237 FAIL=1 WARN=0** で不変
  （FAIL=1 は KEEPALIVE-001 の digest ゲートで本便と無関係）。
- **性能の測定環境**（001e の「8.3 秒 / 101ms」は環境の明記が無く追試とずれた）:
  macOS 26.5 / Apple Silicon 18 コア / node v20.20.2 で **走査 1 回 93〜98ms・スイート全体 9.9〜10.0 秒**
  （子 8 本を並列）。コア数の少ない環境では子プロセスが直列化するぶん数倍に伸びる。

### PHASE1-REACH-001g: 検出装置の自己防衛の一般化 ＋ 派生パスの実バグ（差し戻し 6 回目の対応）

- **問題**: 外側からの正当編集 18 種は全て緑（＝常設 CI 耐性は実証された）。残ったのは
  **検査自身の守り**と、走査の実バグ 1 件。
  1. **高1** M2 が「インライン on*= 以外のルートを持たない関数が実ファイルに実在する」を
     一段弱い形で pin し続けていた。実ファイルのインライン on* は 2 本だけなので、
     **その 2 本をまとめて呼ぶ関数を addEventListener で結線する**自然な 1 編集で候補が尽き、
     `M2-0` が恒久 FAIL（実測 PASS=513 FAIL=1・allowlist 回避不能）。
  2. **高2** 5 版目で塞いだ `scanByCss` 削除の**隣**が無防備。`querySelector('#id')` /
     `querySelectorAll('#id')` の 2 行を削除しても全緑（実測）。
  3. **高3** 枯れ検査が合成 probe だけだったので、**実在名のピンポイント除外**
     （`n !== 'loadData'` を 1 節足す）は probe 無傷ですり抜け、唯一の痕跡が
     R5 warn「loadData を allowlist から外すこと」＝**検出装置の腐敗が掃除指示に偽装**された（実測で全緑）。
  4. **高4【lib 実バグ】**「打ち切り廃止＝参照は落とさない」は**連結オペランドの中では偽**だった。
     `'<div>' + esc('<b onclick="live()">x</b>') + '</div>'` の内側の文字列は一度も走査されず、
     **同じ文字列が連結の外なら拾われるのに中だと生きた関数が R1 error で殺される**（非対称）。
     R7 は 400 字超しか報告しないので無警告で、緑化手段は虚偽の allowlist 登録のみ。
  5. **中1** 001f が足した各仕様の**兄弟**が漏れ（`onscrollsnapchanging`・`onpagereveal`/
     `onpageswap`・`ongamepadconnected`/`ongamepaddisconnected`）。
- **修正**（`test/` のみ・`shogi_v4.html` は引き続き 0 行・allowlist の変更なし）:
  - **M2 を実例依存から合成 fixture 注入方式へ**。fixture へインライン on*= 結線を注入し、
    そのルートを潰して照合する（面 × 変異の全表と同じ方式）。実ファイル側は
    「実例があれば見る」だけにして**存在そのものを pin しない**。
    E2E 操作リストに **⑨インライン on* の関数をまとめて呼ぶ関数を addEventListener で結線**を追加（計 9 本）。
  - **枯れ probe に `'#id'` セレクタ 2 形を追加**（WI-4 / WI-5）。
  - **枯れ検査に baseline 照合を追加**（WI-6）: allowlist（runtime / bindings）に記録済みの検出が
    **対象をファイルに残したまま消えた**ら FAIL。対象ごと消えた場合（関数削除・結線コードの削除）は
    検出装置では作れない状態なので参考表示にとどめ、R5 warn と baseline 更新に委ねる。
    あわせて allowlist の件数と `baseline` の記録が食い違わないことも検査する（WI-7 / WI-8）。
  - **lib 変異を 4 本に**（R2 切り詰め / class 検出削除 / `'#id'` 分岐削除 / **実在名のピンポイント除外**）。
    標的の実在名は allowlist の記録から**動的に**選ぶ（ハードコードしない）。
  - **連結ランの第 2 掃引**（高4 の修正）: どのランの部品にもならなかった文字列面
    （式オペランドの中・`${ }` の中）を単独のランとして復号・再走査する。
    `NESTED-a〜d` で「関数呼出の引数 / `${ }` の中 / 三項の分岐 / 連結の外」の 4 形を変異で固定した。
  - イベント名リストに**兄弟 19 件**を追加（Scroll Snap の対・Navigation・Gamepad・
    CSS Containment・Pointer Lock・DeviceOrientation・EME・WebXR・WebKit 接頭辞・Web App Install）。
    24 形すべてで「生きた関数を殺さない」ことを変異で固定した。
- 実測値は 001c 以降ずっと不変（静的 30 / 実行時 10 / 結線 5 / 関数 580 / root 10 / インライン on* 3）。
  移行オラクル（`9176cc5` 比較）も**差分ゼロのまま**＝第 2 掃引で実ファイルの参照判定は動いていない。
- テスト: 本体 PASS 539 → **586** FAIL=0 / WARN2=0（子 9 本を並列・13.2 秒・走査 1 回 111〜120ms）。
  `bash test/run_tests.sh shogi_v4.html` は **PASS=237 FAIL=1 WARN=0** で不変。

### PHASE1-REACH-001h〜001s: ハーネス分割と、実ファイル加工型テスト一式の Issue #816 への移設

- **001h〜001r（差し戻し 7〜17 回目）**: 検査1（静的到達可能性の判定そのもの）は一度も破られず、
  破られ続けたのは「検査を検査する側」＝ハーネスの足場だった。001h で変異バッテリ・子プロセス方式を
  `test/tools/reach_mutation_battery.js` へ退避（CI からは走らない）し、常設側はゲート判定を
  1 本の関数 `gate()` に括り出した。上の 001g までにあった「変異バッテリ込みの PASS=586・
  子プロセス 9 本」は**この時点で常設 CI の実測ではなくなった**。
- **001s（作者判断 (b)・2026-08-03）**: 「正当な編集に対する耐性」を実測する実ファイル加工型の
  操作 ①〜㉗（全 26 種）と、その監視機械（8c 由来解析 TAINT-* / 8d 生テキスト anchor の全数表
  ANCHOR-* / 8e 変換側の全数表 XFORM-* / 8f LEDGER-1 / ㉑ の先置き世界）を**丸ごと Issue #816 へ
  移設**した（退避は逐語・非コミットの `ai-requests/local/` へ。1 行も捨てていない）。
  理由: この種のテスト自身が「正当な編集で恒久赤・allowlist で回避不能」になる例が場所を変えて
  15 回出た（決定打は、在庫ゼロ操作の移行ヘルパが on* 属性値を生成 `<script>` へ無エスケープで
  埋め込む形＝属性値に script の閉じタグを書く正当な HTML（`onclick="alert('</script>')"`）だけで
  恒久赤・新設監視機械 5 本は全部沈黙）。
- **現在の常設テスト（このリリースに載るもの）の保証範囲**:
  - 常設 CI は `PASS=316 FAIL=0 WARN2=0`（001t で 344）で、**内容は検出力
    （新規の死にコードで R1 が error として発火すること・既存関数の到達不能化の検出）と
    allowlist 規律（R0 / A* / WI-* の双方向照合）＋合成 fixture（T-0* / T[面]-* / KL-* /
    R1-POS-* / LT-*）だけ**。
  - **「正当な編集に対する耐性」（HTML の書き方を変える編集で CI が誤って赤くならないこと）は、
    この常設テストでは実測していない**。その耐性の置き場と blocking 方針は Issue #816 が決める
    （常設側の `SCOPE-1` が毎回この境界を機械で言う）。
  - #798 の死にコード掃除は R0/R1 の検出力と allowlist 照合だけで回せる（掃除は HTML の
    書き方を変えない）。

### PHASE1-REACH-001t: face レクサの行終端 2 バグ修正と恒真 assert の降格（Codex P1×2 / P2×3）

- **P1（lib 修正・`test/lib/reachability.js`）**: ES5 §7.3 の LineTerminator は
  LF / CR / U+2028 / U+2029 の 4 種だが、face レクサは改行を LF の 1 種でしか見ていなかった。
  1. **行コメントの終端が LF のみ** — CR-only 等だと次行の実コードまでコメント面に飲まれ、
     呼出が消えて生きた関数が到達不能と報告される（Codex 最小例で再現）。
  2. **文字列の行継続で `\` + CRLF の LF が残る** — 残った LF を文字列終端と誤認して
     以降の面分類が崩れる（関数が登録すらされない）。
  改行を扱う字句（行コメント終端・文字列の終端 / 行継続・正規表現リテラルの未終端打ち切り）を
  すべて 4 種＋CRLF（1 単位）対応にした。**現行 `shogi_v4.html` に CR / U+2028 / U+2029 は
  0 文字**なので実ファイルの判定は不変（移行オラクル `9176cc5` 比較で差分ゼロを再実測）。
  **LT-\***（LineTerminator × 使用箇所の全数表・30 本・合成 fixture）を常設化した。
- **P2**: 恒真だった assert を整理した。旧 `S3` / `S5`（lib の定義からどんな入力でも成立＝
  検出力ゼロ）を census 表示へ降格。`REGISTRY-MUT-BAL` を宣言（`FORMS[].stray`）でなく
  各形の実測から両極性を測る形へ。`OP-KEYS-1〜5` が空集合に対して恒真であることを注記した
  （編集規律ゲートとして残置・扱いは #816）。
- テスト: 本体 PASS 316 → **344** FAIL=0 / WARN2=0。`shogi_v4.html` / allowlist /
  `run_tests.sh` は 0 行のまま。

## PHASE1-REACH-816A: 静的到達不能の台帳に番人（`WI-10`）を置く

- **問題**: `baseline.static_unreachable` は読まれて印字までされているのに、番人が無かった。
  **DOM へ一度も挿入されない死んだ HTML テンプレートを 1 つ置く**だけで、allowlist 済みの
  死にコードが `R6`（JS 文字列の中の `on*=`）経由で静的到達不能から外れる。`R5` は
  「allowlist から外せ」と言うので、指示どおり刈ると **18 本が台帳から黙って消えたまま
  `PASS=354 FAIL=0 WARN2=20` exit 0**（実測）。`R1` も `R5` も整合しているので鳴らず、
  関数総数は 580 のまま動かないので `WI-9`（走査の盲目化の番人）も無力だった。
- **修正**: `test/test_reachability_001.js` と `test/reachability_allowlist.json` の 2 ファイルのみ。
  `shogi_v4.html` / `test/lib/reachability.js` / `test/run_tests.sh` は **0 行**。
  - **static の baseline の意味論を「件数」から「名前の集合」へ変えた**（Issue #816 H-6 の前倒し）。
    `baseline.static_unreachable_revisions[0]` へ、そのとき静的到達不能だった**関数名の集合**
    （`names`）を持たせた。
  - **`WI-10`** … 台帳の名前のうち **いまもトップレベル関数として実在するもの**が、
    **1 本残らず静的到達不能のままか**を見る（`suAlive ⊆ unreachableStatic` の集合包含）。
    破れたら**化けた関数名を名指しで** FAIL にする。
    - #798 の掃除 … 関数がファイルから消える → 生存分からも消える → **台帳は 1 バイトも更新せずに緑**
    - 上の事故 … 関数は実在したまま到達可能へ化ける → 包含が破れる → **赤**
  - **`WI-10a` / `WI-10b` / `WI-10c`** … 台帳の形（キーの実在・`value` と `names` の一致・
    重複なし・全行に理由と日付）をラチェットし、`baseline.static_unreachable` を台帳と
    別々に下げられないようにした。
  - **`WI-10-SELF-N` / `WI-10-SELF-P`** … 番人の検出力の自己検査。`WI-9-SELF` に無かった
    **正極性**（**本番の入力**に対して番人が実際に評価されていること）を対で置いた。
    `WI-9-SELF` は合成文書でしか測っていないため `emit` を `src.length >= 1000 || …` で
    囲う変異＝「本番では常に真だが合成世界では鳴る」を素通しする。`WI-10` では閉じている。
  - **`WI-9-SELF-b`** … `WI-9-SELF` の合成 allowlist に static の台帳を持たせたことを毎回測る。
- **816A-2（`WI-10` の述語を件数から集合包含へ直した）**: 1 巡目は台帳を名前集合で持ちながら、
  番人だけは「実測の**件数** >= 生存分の**件数**」で近似していた。これが正極性の自己検査
  `WI-10-SELF-P`（台帳 +1 で落ちること＝実測 <= 生存分）と対になって **実測 === 生存分の等式**を
  強制し、次の 2 つを同時に生んでいた（どちらも実測で再現）。
  - **誤検知**: 新しい死にコードを 1 本足して `R5` の指示どおり allowlist へ正規追記するだけで
    恒久赤（`ok()` 直打ちなので **allowlist に何を書いても消せない**）。
  - **見逃し**: 件数は集合ではないので**減った分を足し戻せば相殺できた**。台帳の 18 本を
    到達可能化しつつ同数の死にコードを足すと `PASS=361 FAIL=0 WARN2=20` exit 0
    ＝**番人を置く前と同じ姿**。
  集合包含に直して両方が消えた。台帳の形も自己検査も 1 行も変えていない。
  ── クラス: 「**番人と、その番人の自己検査が、合わさって等式を強制する**」。
  `emit(実測 >= 台帳)` 型の下限と「台帳 +1 で落ちること」を要求する正極性が対で置かれると起きる。
- **保証しない範囲（`SCOPE-1` が毎回言う）**: `WI-10` は (a) 関数の改名 (b) 台帳の枯渇
  (c) 台帳より後に足した死にコード (d) 理由の中身 (e) **台帳の先頭行の書き換え**
  （`WI-10c` は全行の**形**しか見ない）を守れない。(e) は `WI-9c` から継承した穴の実体で、
  閉じ方は Issue #816 816B が `WI-9` 側と一緒に扱う。
- テスト: `node test/test_reachability_001.js` は **`PASS=361 FAIL=0 WARN2=0` exit 0**
  （816A 前は 354・追加は +7 本）。`test/run_tests.sh` は base と一字一句同一で FAIL 増ゼロ。
  受け入れの実測は PR #819 の RESULT に全世界の表を置いた。

## BULK-ENTRY-DELIM-001: まとめて登録の区切りに全角カンマ「，」を受理する

- **問題**: `parseBulkEntryText` はタブか半角カンマしか区切りとして見ていなかった。日本語入力では
  カンマが「，」になるため、**スマホ手打ちの貼り付けが実質できない**状態だった（作者実測 2026-08-06・
  8/9 月例会の準備中に発生。全角区切りで貼ると 1 行まるごと氏名になり、クラスは全員既定へ落ちる）。
- **修正**: 区切りを**1 行につき 1 種類だけ優先順で選ぶ**方式にした（タブ ＞ 半角カンマ ＞ 全角カンマ「，」）。
  ★**読点「、」は区切りにしない。** 氏名の括弧内注記に現実に現れ（例「山田太郎（沼津、東部）」）、
  区切りの無い 1 列貼り付けでその氏名が分断されるため（既存テスト B4 が 1 列貼り付けを明示サポートしている）。
  全角スペースも受理しない（姓名間の空白と衝突するため）。UI・モーダル・文言・`resolveBulkEntryClassId` は無変更。
- **検算（巻き戻しによる検出力の実証）**: 追加 assert が「変更前でも通る飾り」でないことを 3 通りの
  巻き戻しで確認した（いずれもメモリ上のコピーに対して実施・`shogi_v4.html` は書き換えていない）。
  - 変更前の実装へ巻き戻す → **B8 / B11 が FAIL**（全角カンマが分解されない）
  - 案1（`replace(/[，、]/g,',')`）へ巻き戻す → **B9 / B10 / B11 / B12 が FAIL**（氏名の読点が区切りに化ける）
  - 案2（読点も区切りに含める）へ巻き戻す → **B9 / B12 が FAIL**（1 列貼り付けで氏名が分断される）
- **申し送り（この修正では直らないこと）**: 作者が 8/6 に実際に踏んだのは**全角スペース区切り**であり、
  本修正はそれを受理しない（意図的）。全角スペースと「区切り無しの 1 列貼り付け」は従来どおり
  1 行まるごと氏名になる。これを止めるには貼り付け直後のプレビュー警告が要り、それは UI 変更のため別途。
- テスト: `test/test_bulk_entry_001.js` に B8〜B14 を追加（**PASS 114 → 121**・FAIL 0）。
  到達可能性ゲート `PASS=354 FAIL=0 WARN2=0`（base と同一）／`run_tests.sh` は `PASS=240 FAIL=1` で
  **失敗集合が base と完全一致**（唯一の FAIL は `test_supabase_keepalive_workflow.sh` の
  network 安全ゲート未成立＝環境要因・base でも同じ）。
- 配信: `index.html` の `?v=96 → 97` ／ `sw.js` の `CACHE` を `shogi-tour-v96 → v97`（2 箇所のみ）。

## PHASE1-REACH-816E: LS/PS 終端退行のスイープを CI（自動発見）に載せる

- **問題**: #818（`9d64a7e`）で直した 001t 型の退行 —— JS 文字列リテラルの終端を
  LineTerminator 4 種（LF / CR / **LS / PS**）で打ち切る —— の回帰検査
  `test/tools/reach_str_lt_sweep.js` が、**`run_tests.sh` の自動発見の外**にあった
  （自動発見は `test/` 直下 `test_*.js` の非再帰 glob。`test/tools/` は対象外）。
  ツール自体は CI 向きにできている（引数で対象と件数・等間隔サンプル＝乱数なしで決定的・
  終了コード 0/1）のに、**手で回さないと動かない**＝申告から 2 日、回帰検査が手動のまま
  だった。ES2019 以降 生の U+2028 / U+2029 は文字列リテラルの中に置けるので、この退行は
  「合法な入力で走査が崩れる」形で入り込み、`shogi_v4.html` では **関数総数 580 → 49**
  まで落ちる配置がある（N=40 の注入実測。N=400 まで広げると最悪 **580 → 15**）。
- **修正**: `test/` のみ。`shogi_v4.html` / `test/lib/reachability.js` / `test/run_tests.sh` /
  `test/test_reachability_001.js` / `test/reachability_allowlist.json` は **0 行**。
  - **`test/test_reach_str_lt_sweep_001.js`（新規）** … 自動発見に載る薄い wrapper。
    `run_tests.sh` から `node <file> "$TARGET"` で呼ばれ、**N=40 / 文字 × LS・PS の 2 文字
    ＝ 80 配置**を走らせる。ヒット 0 で exit 0、1 件でもあれば exit 1。cloud で約 19.1 秒
    （うち陽性対照 CONTROL-1H/1T/2 が約 7 秒。陽性対照なしの `e56cdfb` は 12.4〜12.6 秒）。
    **ヒット判定は 2 つのオラクルの OR**（下の「レビュー経緯」参照）: ①挿入位置 1 文字を
    除いて `classifyFaces()` が原本と完全一致しなければ「壊れた」 ②`analyze()` が例外を
    投げたら「壊れた」。到達性の**差分**は判定に使わず、ヒット時の診断表示にだけ使う。
  - **走査ロジックは二重実装しない** … `test/tools/reach_str_lt_sweep.js` を
    `sweep()`（計算）と `formatReport()`（表示）へ括り出し、wrapper は `sweep()` を
    **require して再利用**する（child_process ではなく関数 require にしたのは、配置数・
    ヒット数を stdout の文言から拾い直さずに構造化された値で pin できるため）。
    **tool 単体（既定 N=400）の使い方は不変**: `shogi_v4.html` に対し N=40 / N=400 の
    stdout が `e56cdfb`（陽性対照を足す直前のコミット）と **byte 一致（diff 0）**である
    ことを実測した（分割前＝816E 以前との byte 一致は #823 の便で実測済み）。
  - **骨抜きを pin**（この番人が「走っているのに何も見ていない」状態を落とす）
    - `TARGET-1` … `sweep()` が読んだのが **run_tests の渡した TARGET そのもの**か
      （wrapper 側で独立に読み直した長さと照合。既定へフォールバックしていたら赤）。
    - `TARGET-1b` … **既定と異なる一時ファイル**でも `sweep()` が引数へ追随するか。
      CI では TARGET が常に既定値と同じなので、TARGET-1 だけでは「既定への
      ハードコード」を落とせない（Codex 1巡目 P2）。一時ファイルの用意は try の中で
      行い、失敗しても**本命の HIT-0 が評価される**（反証パネル指摘）。追随だけを見て
      ヒット数は混ぜない（混ぜると 001t 退行時に誤診の FAIL が出る）。
    - `PLACE-1` … **実行配置数 >= 80**。面レクサが退行して JS 文字列を列挙できず
      「0/0 で緑」になる形と、サンプル数の引き下げを同時に落とす。下限は N から導出せず
      **リテラル 80** で持つ。
    - `PLACE-2` … 挿入文字が **U+2028 / U+2029 の実文字**であること。個数（=== 2）だけ
      では別の 2 文字への差し替えで骨抜きになる（Codex 1巡目 P2）。
    - `CONTROL-1H / 1T / 1P / 2 / 2P` … **陽性対照**。上の 4 本はどれも `sweep()` の
      自己申告値しか見ていないので、判定ループ手前の `continue` 1 行だけで全部素通り
      する。そこで `sweep()` に **`opts.classifyFaces` / `opts.analyze` の差し替え口**を
      設け、wrapper 側が**自分で用意した壊れたオラクル**を渡して「呼ばれた回数」と
      「渡された文字列」を**自分で数える**。設計の要点は 4 つ（すべて反証パネルや Codex が
      実際に破って見せた形への対策）:
      ①対照は fixture ではなく**本番 TARGET**、しかも **`sampleN` も本番と同じ 40**で
      回す（小さい入力・小さい N だと `src.length` や `sampleN` で経路を切り替える
      最適化に無力。どちらも「本番だけが盲になり CI は緑・stdout は byte 一致」を実測）。
      ②**両方のオラクル**に対照を置く（面だけだと `analyze(mutated)` を `if (hit)` の
      中へ移す最適化が通る。しかも 12.4 秒 → 3.9 秒で"改善"に見える）。
      ③面の対照は**長さを合わせたまま**壊し、**挿入点より前（1H）と後ろ（1T）を
      別々に**壊す。長さ違いで済ませると「`faceIntact` の後半ループを 1 行消す」整理を
      見逃す —— 面配列の長さは常に `src.length` なので残った長さ検査は本番では永久に
      false になり、001t の検出が **80/80 → 0/80** に落ちるのに CI は緑のままになる。
      壊す位置は **端だけでなく内側も**、区間を 4 分割して呼び出しごとに回す。端（index 0
      と末尾）しか壊さないと、`faceIntact` を「両端だけ比べる」形へ退化させる改変が対照を
      素通りする（Codex P1・実測: wrapper は `PASS=10 FAIL=0` のまま、注入ツールが
      `ヒット=0/80` exit 0 で 001t を見逃す）。
      ④「オラクルが赤を出せたか（1H/1T/2）」と「差し替え口を通ったか（1P/2P）」を
      **別 pin にする**（混ぜると、面を他所から再利用するリファクタのときに
      「オラクルが死んだ」と読める FAIL が出て誤診になる）。
      CONTROL-2 が投げる例外は**毎回種類を変える**。組み込み Error 系を全部
      （`Error`/`RangeError`/`TypeError`/`SyntaxError`/`ReferenceError`/`EvalError`/
      `URIError`/`AggregateError`）と `name` を差し替えたサブクラス相当、さらに
      **Error ですらない throw**（文字列・プレーンオブジェクト）まで 11 種を回す。
      1 種類だけだと「`RangeError` は環境由来なのでヒットに数えない」というフレーク対策
      フィルタが対照を素通りし、例外死型の検出が 18/80 → 0/80 になる（4 種だけでも
      `ReferenceError` を除外するフィルタが素通りする。Codex P1）。
      ※ 有限の列挙である以上「この列挙に無い型だけを握り潰す」フィルタは残る。そこまで
      狙い撃つ改変は骨抜きの意図が明白なので追わない、と割り切っている。
      観測は変異文字列そのものではなく**復元した「挿入位置＋挿入文字」だけ**を保持する
      （860KB の複製をためると必要ヒープが 16MB → 36MB に跳ね、`--max-old-space-size`
      を絞った CI で**要約行を 1 行も出さずに OOM** する。実測で 16MB でも動く状態へ戻した）。
      数えるのは**呼び出し回数ではなく「異なる変異入力の数」**（位置＋文字で重複排除）。
      回数で数えると、同じ変異ソースにレクサを 2 回呼ぶだけの**挙動を変えないリファクタや
      診断追加が偽赤**になる（Codex P2・実測: 観測 320/160 で `CONTROL-1P` が FAIL）。
      **ただし数だけでは足りない**。「80 個のユニークな位置＋文字」は、挿入位置 `mid` を
      サンプルした span `[s,e]` から切り離す改変（例: 連続した位置 200〜239 を使う）を
      通してしまう（Codex 3巡目 P1・実測: wrapper は `PASS=10 FAIL=0` のまま 001t 注入が
      **ヒット=0 exit 0**）。そこで **観測した位置が「等間隔サンプルした各リテラルの中心」
      と一致すること**まで要求し、その期待位置は **wrapper が独立に導出する**
      （`sweep()` が返す spans / mid を借りたら、まさにその値がずれる改変を見逃す）。
      ここだけは走査ロジックの二重実装を承知で書いている。
    - **`opts` を pin する案（CONTROL-0）は一度入れたが、実測の結果 撤回した**。tool の
      ソーステキストを読んで「`opts` に触れる行は既知の 3 行だけ」を要求する案だが、
      (a) `const o = arguments[2];` の 1 行で無効化でき **効かない**、(b) JSDoc の追加・
      `opts?.` への書き換え・`options` への改名・シグネチャの折り返し・コメントの
      `/* */` 化など**挙動を変えない整形 7 種で偽赤**を出し、しかも FAIL 文が
      「骨抜きが入っている可能性」と読める（大会当日に犯人探しを誘発する）。
      効かないうえに偽赤を出すので採らない。
  - **`test/tools/reach_str_lt_inject_001t.js`（新規・CI には載せない）** … 受け入れ基準2 の
    一回実証。tree を一時複製し、**まず注入前の対照で新テストが exit 0** であることを
    確かめてから、lib のコピーへ 001t 型欠陥（終端判定を `isLineTerminator` へ広げる 1 行）
    を注入し、新テストが **exit 1・`HIT-0` の FAIL・ヒット>0 のシグネチャ**で赤くなる
    ことまで見る（exit 1 だけだと無関係な赤も「検出」と誤読する。Codex 1巡目 P2）。
    欠陥入りの lib はチェックインしない。
- **CI の外に置く検査は、外に置く理由を持つ**（#816 E の G4 の閉じ方）。現時点で
  `test/tools/` にあるものの理由は次のとおりで、**理由の無い CI 外検査はこの便で最後**:
  - `reach_str_lt_sweep.js` … CI で走るのは上の wrapper（N=40）。tool 単体は**より広い
    サンプル（既定 N=400・cloud で約 117 秒＝占有時の CPU 時間。共有 CPU の壁時計では
    その 1.5 倍程度）の手動用**。N=400 は全量ではない ——
    `shogi_v4.html` の JS 文字列リテラルは 6,029 個なので **6.6% のサンプル**。
  - `reach_str_lt_inject_001t.js` … lib の**生テキストへの anchor**を持つ。毎回回すと
    正当な整形のたびに外れる anchor を常設で抱えることになるので、一回実証用。
  - `reach_migration_oracle.js` … 歴史オブジェクト依存で毎回は回せない（lib 変更時のみ手動）。
  - `reach_mutation_battery.js` … 置き場と blocking 方針の議論を Issue #816 へ移した（ファイルは `test/tools/` のまま。#816 の結論が出るまで CI には載せない）。
- **レビュー経緯（判定基準は 2 回変わった。測った順に残す）**
  1. 初版は「`analyze()` の**到達性差分**」だけをヒットにしていた。**Codex 1巡目 P1**:
     onclick 結線を持つ生きたリテラル（エスケープ復号ランで参照を拾う正規機能）への
     挿入で、レクサ無傷でも**偽赤**になる（反例実測 2/80 exit 1）。
  2. そこで**面分類保存オラクル単独**へ移した。偽赤 0/80・001t 注入の検出 20/80 → 80/80。
  3. **反証パネル（4体・並列・2026-08-07）が、この移行で新たな見落としが生まれたことを
     実測で示した**: 「面は保存されているのに `analyze()` が LS/PS 入力で例外死する」型は
     面オラクル 0/80 で緑（到達性差分版は 18/80 で赤）。**この便で `analyze()` の例外を
     OR で戻した**（差分は戻さない＝ P1 の偽赤は再発しない）。同注入で 18/80 赤を確認。
  - 代償: 例外を見るには全配置で `analyze()` を回す必要があり、緑の道が cloud 約 4 秒
    → 約 12.5 秒になった（初版の到達性差分版と同水準＝当初想定した予算に戻っただけ）。
  4. **反証パネル 2巡目（3体・並列・2026-08-08）** が、初版の陽性対照（150 バイトの
     fixture を差し替え口に通すだけ）を差し戻した。指摘の核心は
     **「経路の対照であって、検査の対照になっていない」** —— fixture で回す限り
     ①`src.length` で分岐する最適化 ②`analyze(mutated)` を `if (hit)` の中へ移す
     最適化 ③`opts` の有無で分岐する改変 の 3 つが素通りする（いずれも clean の
     stdout は byte 一致・001t 注入も検出せず・②は 25 倍速で"改善"に見える）。
     **この便で対照を本番 TARGET・本番と同じ N へ移し、オラクル 2 にも対照を足した**。
     あわせて「sweep の申告に一切依存しない」という**過大な記述を訂正**した
     （条件の大半は sweep の自己申告を読んでおり、独立なのは probe の観測だけ）。
  5. **反証パネル 3巡目（3体・並列・2026-08-08）** が、その 2巡目対応版をさらに 5 点
     破った。①`faceIntact` の**後半ループ 1 行**を消すと 001t が 80/80 → 0/80（CI は緑・
     stdout は byte 一致・骨抜きハーネス 6 種も全部赤のまま＝痕跡がどこにも出ない）。
     ②`catch` に `RangeError` 除外フィルタを足すと例外死型が 18/80 → 0/80。
     ③`sampleN` の値で経路を切り替えると対照（小 N）だけ本物を通る。
     ④`CONTROL-0` は別名 1 行で無効化でき、かつ整形 7 種で偽赤。
     ⑤メモリ: 対照が 860KB の変異コピーを保持し必要ヒープが 2.25 倍。
     **①②③⑤はこの便で塞いだ**（1H/1T の分離・多クラス例外・N=40 対照・挿入文字だけ保持）。
     **④は CONTROL-0 ごと撤回**。
  6. **Codex（`2922e079c8` に対するレビュー）** が、さらに P1 二つ・P2 二つを実測付きで
     返した。**P1**: (a) 面の対照が index 0 と末尾しか壊していないので、`faceIntact` を
     「両端だけ比べる」形へ退化させると対照は緑のまま 001t が 0/80 になる。(b) 例外の
     対照が 4 種しか投げていないので、`ReferenceError` を握り潰すフィルタが素通りする。
     **P2**: (c) `ce40.html` がリポジトリに無く「N=41 で 0/82」を追試できない。
     (d) 観測を呼び出し回数で数えているので、レクサを 2 回呼ぶだけの挙動不変リファクタが
     偽赤になる。**4 件ともこの便で直した**（4 分割の位置回し・例外 11 種・fixture の
     生成手順を下に明記・位置＋文字での重複排除）。
  7. **Codex 3巡目**（`099b811` へ再依頼。**差分ゼロの同一コミットでも再レビューする**ことが
     ここで判明した）が、**6 の (d) を直した副作用**を P1 で突いた。呼び出し回数から
     「ユニークな位置＋文字」へ緩めたことで、**挿入位置がサンプルした span の中心である
     保証が消えていた**。Codex は `mid` を連続位置 200〜239 に置き換えて再現し、その状態で
     10 本の pin が全部通り、001t 注入が `ヒット=0` exit 0 になることまで示した。
     **この便で期待位置の照合を足した**（wrapper が独立に導出）。
     ★ 教訓: **直した所の隣が壊れていないかは、直した本人には見えない。**
     骨抜き 14 種の実測は下記。
- **守備範囲**: 「JS 文字列リテラル内の LS / PS で**面レクサの終端が壊れる**」＋
  「同じ入力で**走査が例外死する**」の 2 クラス。消費位置バグ一般・エスケープ復号
  （結線デコーダ）の到達性影響・テンプレートリテラル・HTML 属性値は主張しない
  （いずれも兄弟の `test_reachability_001.js` が別途 pin している）。
- **★ 未解決として申し送る（反証パネル・#816 へ切り出し）**
  - **偽赤（エスケープ位置）**: 挿入点が `\` の被エスケープ位置に落ちると、注入後の
    プログラムが V8 で SyntaxError になり、レクサが正しくても赤が出る。3巡目パネルが
    14 形状を総当たりして地雷を特定した —— `'\\'`（内容 2 文字なので中央が必ず
    エスケープ対の内側）・`dir + '\\' + name`・**行末に `\` を置いた行継続**の 3 形状だけ。
    `'don\''` / `"\""` / `'\n'` / `'\t'` / `'^\\d+$'` / JSON 文字列 / 日本語文言は安全。
    現行の `shogi_v4.html` は **6,029 リテラル全量で 0/6029 ＝地雷ゼロ**。抽選の当たりは
    40/6030 = **0.66%**（header の「約 0.5%」はほぼ正確だった）。
    ★ 抽選はリテラル総数が変わるたびに引き直されるので、**地雷を入れたコミットは緑で
    通り、後から来た無関係な 1 行が赤を出す**（実測: 文言リテラルを 1 個足しただけの
    diff で exit 1）。そのとき FAIL は「001t 型の終端退行」と名指しし「関数総数
    580 → 27」と出るが lib は無傷 —— **PR の diff と赤の原因が別物になる最悪の形**。
    塞ぎ方の候補: ヒット時に注入後ソースを `vm.compileFunction` へ通し、**SyntaxError なら
    偽陽性として除外**（LS/PS 挿入が合法であることが判定の前提なので弱体化にならない）。
    **Codex 1巡目 P1 と同じクラスが 1 形残っている。**
  - **`opts` が渡されたことを検出して分岐する骨抜きは原理的に塞ぎ切れない**: 陽性対照は
    `sweep()` に差し替え口を設ける方式なので、「テストにしか通らない経路」が存在する。
    ソーステキストを pin する案（CONTROL-0）は上記のとおり**効かず偽赤を出すので撤回**。
    塞ぎ切れるのは差し替え口を使わない `reach_str_lt_inject_001t.js`（lib の複製へ
    実欠陥を注入）の方だが、あちらは lib の生テキスト anchor を持つため CI 常設に
    できない。**両者はセットで初めて閉じる —— リリース証跡では inject 側も回すこと。**
    構造的に閉じたい場合の候補（未実装）: 差し替え口を廃し、`require.cache` に lib の
    スタブを差し込んで **引数ゼロの同一コードパス**で対照を回す。
  - **TARGET-1b の TMPDIR 依存**: 一時ファイルが作れない CI では FAIL が 1 本増える
    （本命の HIT-0 と CONTROL 群は評価されるので誤診はしない）。skip 扱いにするか
    tree 内 fixture へ退避するかは #816 で決める。
- テスト（cloud Linux / Node v22 実測。時間は占有時の CPU 時間ベース）:
  `node test/test_reach_str_lt_sweep_001.js shogi_v4.html` は
  **`PASS=10 FAIL=0 配置=80 ヒット=0` exit 0**（約 19.0 秒）。
  001t 注入 tree では **`ヒット=80/80` exit 1**（CONTROL 群 5 本は PASS のまま＝誤診なし）、
  例外死注入 tree では **`ヒット=18/80` exit 1**（注入ツールは対照 exit 0 → 注入 exit 1・
  シグネチャ一致まで確認）。
  P1 反例 `ce40.html`（生成手順は下記）は **N=41（全 41 リテラル）で 0/82 exit 0**
  —— ce40 の反例リテラル（onclick 結線を持つ最後の 1 個）は等間隔サンプル
  `floor(k*41/40)` の都合で **N=40 では構造的に引かれない**ので、N=40 の 0/80 は
  証拠にならない。同条件で到達性差分版は 2/82（＝反例リテラルだけがヒット）。
  `TMPDIR=/nonexistent` では TARGET-1b だけが FAIL し **HIT-0 と CONTROL 群は評価される**。
  `--max-old-space-size=16` でも要約行まで完走（`e56cdfb` と同水準）。
  tool 単体 CLI の stdout は N=40 / N=400 とも `e56cdfb` と **byte 一致**。
  `bash test/run_tests.sh shogi_v4.html` は **PASS=242 FAIL=0 WARN=0**（リポジトリ全体で
  実行した場合。`shogi_v4.html` と `test/` だけを抜き出した tree では `app/` や
  `.github/` 依存の 33 件が環境要因で FAIL し PASS=209 になる）。
- **骨抜き 14 種の実測**（同一 tree に 1 種ずつ当てて wrapper を回す。
  `e56cdfb`＝陽性対照なし → 本便）:

  | 骨抜き | e56cdfb | 本便 | 落とした pin |
  |---|---|---|---|
  | A 判定ループ手前に `continue` 1 行 | 素通り | **赤** | CONTROL 5 本すべて |
  | B 申告 `ch` と実挿入文字を切り離す | 素通り | **赤** | CONTROL-1P/2P |
  | C リテラルだけ切り出して比べる最適化 | 素通り | **赤** | CONTROL-1H/1T/1P |
  | D 同上を `opts` の有無で分岐 | (注1) | **素通り** | —（★塞げない） |
  | E 同上を `src.length` で分岐（本番だけ盲） | 素通り | **赤** | CONTROL-1H/1T/1P |
  | F `analyze(mutated)` を `if (hit)` の中へ | 素通り | **赤** | CONTROL-2/2P |
  | G `faceIntact` の**後半**ループを 1 行消す | 素通り | **赤** | CONTROL-1T |
  | H `faceIntact` の**前半**ループを 1 行消す | 素通り | **赤** | CONTROL-1H |
  | I `catch` に `RangeError` 除外フィルタ | 素通り | **赤** | CONTROL-2 |
  | J `sampleN` の値で経路を切り替える | 素通り | **赤** | CONTROL-1H/1T |
  | K `arguments[2]` で `opts` を検出して分岐 | 素通り | **素通り** | —（★塞げない） |
  | L `faceIntact` を「両端だけ比べる」形へ退化 | 素通り | **赤** | CONTROL-1H/1T |
  | M `catch` に `ReferenceError` 除外フィルタ | 素通り | **赤** | CONTROL-2 |
  | O 挿入位置をサンプル中心から切り離す（連続位置 200〜239） | 素通り | **赤** | CONTROL-1P/2P |

  (注1) D は `e56cdfb` には `opts` が無いため `ReferenceError` で赤くなるだけで、
  「検出できた」ではない。
  ★ D / K（`opts` が渡されたことを検出して分岐する形）は**この差し替え口方式では
  原理的に塞げない**。実測で確かめたのは「**inject 側が両方とも落とす**」こと ——
  D / K を当てた tree で `node test/tools/reach_str_lt_inject_001t.js` は
  `✗ 基準2: 欠陥を注入したのに新テストが exit 0` を出して **exit 1**。
  **CI 常設の CONTROL 群と CI 外の inject ツールは、セットで初めて閉じる。**
  ★ L は「両端だけ比べる」退化で、`e56cdfb` でも 2巡目対応版でも素通りし、注入ツールが
  `ヒット=0/80` exit 0（＝001t を完全に見逃す）になることを実測した。本便の 4 分割の
  位置回しで `CONTROL-1H/1T` が 20/80 に落ちて赤になる。
- **偽赤が出ないことの確認**: 「同じ変異ソースに対して面レクサを 2 回呼ぶ」挙動不変の
  リファクタを当てても、本便は `PASS=10 FAIL=0` exit 0 のまま（2巡目対応版では
  `CONTROL-1P` が観測 320/160 で FAIL していた）。
- **`ce40.html` の生成手順**（P1 反例。`0/82` の追試用。リポジトリには置かない）:

  ```js
  // node gen_ce40.js 40 ce40.html
  const fs = require('fs');
  const inert = parseInt(process.argv[2], 10);
  const out = process.argv[3];
  let s = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n';
  s += '<div id="root"></div>\n';
  s += '<scr' + 'ipt>\n';
  s += 'function boot() { document.body.innerHTML = html816; }\n';
  s += 'boot();\n';
  for (let i = 0; i < inert; i++) {
    s += `var inert${i} = 'inert filler literal number ${i} padding padding';\n`;
  }
  s += 'function victim816() { return 816; }\n';
  s += `var html816 = '<button onclick="victim816()">x</button>';\n`;
  s += '</scr' + 'ipt>\n</body></html>\n';
  fs.writeFileSync(out, s);
  ```

  生成物は 2,818 文字・JS 文字列リテラル 41 個。最後の 1 個（`html816`）だけが onclick 結線を
  持つ「生きたリテラル」で、これが Codex 1巡目 P1 の反例にあたる。

## CHG-MODAL-INLINE-ERROR-001: 対戦相手変更モーダルの入力エラー9件を native alert から画面内表示へ

Issue #881。STYLE-GUIDE **v1.2 §3 N5**（操作を止めた理由の提示）の最初の適用例。

### なぜ

`bindChangePairingModalEvents` の入力エラーはすべて native `alert()` だった。
正本 §3 は「alert は保存失敗など**必ず認知すべき致命的事象だけ**」とし、v1.2 で
「**入力の間違い（選び直せば続行できるもの）はここに入らない → N5**」を明記した。
9件はいずれも `return` で保存を拒否するハードブロックで、選び直せば続行できる。

### 何を変えたか

| | |
|---|---|
| 追加 | `#chg-err`（`role="alert"` / `aria-live="assertive"` / danger 面色 / 見出し語つき）を**ボタン行の直前**に常設 |
| 追加 | `showChangePairingError(text)` / `clearChangePairingError()` |
| 追加 | `[data-chg-card="1"][data-chg-err="1"]{max-height:85vh;overflow-y:auto}`（**エラー表示中だけ**・SCALE-MODAL-001 #767 に揃える） |
| 変更 | 9件の `alert(...)` → `showChangePairingError(...)`。うち**3件は文言も直した**（次の行動が無かった・用語を「参加者」に） |
| 変更 | `chg-p1` / `chg-p2` の `change` で表示を消す |
| **触らない** | **候補ゼロ案内（PR #108 §8.2・`data-chg-empty-notice`）は1バイトも無改変**＝ info（開いたときの状態説明）と N5（押した結果止めた）は別の器 |
| **触らない** | `内部エラー: 入れ替え後の重複を検出しました`（致命的事象）と `結果入力済みのため変更できません`（`changePairing` の入口・モーダルがまだ無い）は `alert()` のまま |
| **触らない** | 判定ロジック・判定順序・`return` の位置・`appConfirm` の2件・`resetSelectsToOriginal` の呼び出し |

文言を直した3件（pin ゼロ or 接頭辞一致で既存 pin は無改変）:

- `同じ選手を先手・後手両方に選べません` → `同じ参加者を先手・後手の両方には選べません。／どちらか一方を別の参加者に選び直してください。`
- `変更がありません` → `変更がありません。／先手か後手を選び直してください。`
- `相手ペアが結果入力済みのため、入れ替えできません` → 同文＋`／結果が入っていない別の対局の参加者を選んでください。`

★ **Codex P2 (r3790501527) を受けて、残り2件（`2人を同時に…` / `再戦になる…`）の「選手」も
「参加者」に直した**（新しく N5 スロットに出る UI なので §4.1 が掛かる、という指摘）。
＝ **9件すべてが「参加者」**。option ラベル `同じ選手`（`test_pairing_classify_001.js:151` に pin）の
移行は別スライスのまま。

### ★ 検査の作り — `test/test_chg_inline_error_pins_881.sh`（4段の自己検査）

設計レビューで「**pin を足したのに既存語に当たって噛んでいない**」が **4回連続**で見つかった。
しかも3回は「前の回の直しの中」で作っていた。

| 巡 | 病気 | 落とす段 |
|---|---|---|
| 4巡目 | 裸の `scrollIntoView` / `#fdecea` / `role="alert"` / `textContent`（いずれも v140 に既存） | **②** |
| 5巡目 | `! grep "innerHTML"`（88箇所・実装後も赤）／裸の `removeAttribute`（既存2箇所） | **①** / **④** |
| 6巡目 | 裸の `role="alert"` を独立 pin に分けて素で緑に戻した | **②** |
| 7巡目 | `\(head\|body\)` は GNU 拡張。BSD grep では非マッチ＝否定が恒久 true | **③** |

→ **①実装後に緑 / ②ベースに赤 / ③各変異に対して赤 / ④AND の各項が単独で②**、の4段にした。
**①②③④ はそれぞれ過去の実例で唯一の検出者**になっている。
変異は `test/tools/chg_inline_error_881_mutants.js` が実行時に生成する（**29本**・repo には置かない）。

★ **Codex P2 (r3790501526) を受けた直し**: ③ は静的 pin で殺せない変異を
「動的基準が担当」として**無条件 PASS 扱いにしていた**（＝動的検査が本当に殺せるかを確かめていない）。
- ③ ではそれらを**件数に数えない**（`--` 表示）。**どちらの担当でもない変異は FAIL**
- **`test/tools/chg_inline_error_881_mutation_check.sh` を新設**し、動的担当17本に
  **実 e2e を1本ずつ当てて赤になること**を確かめる（対照として未変異が緑であることも見る）
- ★ **Codex 2巡目 P2×3 でさらに直した**:
  - (r3790541881) チェッカーが**どこからも呼ばれていなかった** → **`run_e2e.sh` から実行**する
    （必須の E2E 経路。`TARGET` 指定時は変異の前提が崩れるので回さない）
  - (r3790541883) **「exit≠0 なら理由を問わず殺せた」は誤り** → 変異ごとに
    **落ちるべきアサーション ID（その場面自身の検査に限る）**を持ち、それが実際に落ちたことまで見る。
    **`E2E ERROR` と未捕捉例外は kill ではなく検査失敗**として扱う。
    ★ この直しで **M8・R1・R2・R5 の4本が「別の理由で赤かった」偽の kill だったと判明**した
    （2本はハーネスが例外で落ちていた・2本は狙いと違う検査が落ちていた）
  - (r3790541886) **R1〜R9 が呼び出しの一意性を検証していなかった** → **呼び出し全体＋直後の
    `return;` を1つの文字列**にして `mut()`（出現回数1を assert）に通す。
    直後が空白のみで繋がっていない場合は生成を失敗させる
- 重点事項だった**9件の `return` を1つずつ落とす変異 R1〜R9 を追加**。
  `appConfirm` が非同期なので `state` と modal の不変では殺せない。
  ★ **殺し方は場面で違う**（実測）: 早い段のガード（`R1`/`R2`/`R3`/`R5`）は
  **後続のガードまで流れて別の文言が上書きされる**ので **`[E*-2]`（文言一致）**が落ち、
  後段（`R4`/`R6`〜`R9`）は **`appConfirm` まで進む**ので **`[E*-6]`（`#app-modal` が出ない）**が落ちる。
  どちらも「その場面自身の検査」なので、`want_ids()` は**場面ごとの ID 集合**で受ける

  - ★ **Codex 4巡目 P2 (r3790647891) で直した**: `X3` と `X3r` は**どちらも `role="alert"` を消す**ので、
    `P3` から `aria-live` の grep を取り除いても両方 `role` 条件で赤くなり、③ が気づけなかった
    （Codex が一時コピーで実測し `PASS=36, FAIL=0` のままになることを確認）。
    → **`role` を残して `aria-live` だけを落とす変異 `X3a`** を足した。
    再現実験（`P3` から `aria-live` の grep を消す）は **`PASS=36, FAIL=1`** になる

★ 実際に **① がこの実装の欠陥を1件捕まえた**（本文の代入を変数経由で書いたため pin と食い違った）。

### 検証（cloud Linux・`LC_ALL=C.UTF-8`・in-tree）

- `bash test/run_tests.sh shogi_v4.html` → **PASS=252 FAIL=0 WARN=0**（ベース 251・**FAIL 増ゼロ／件数不減**）
  - `run_tests.sh:109 / :110 / :111` の grep pin は**無改変で緑**
  - `test_chg_inline_error_pins_881.sh` は自動発見され **PASS=37 FAIL=0**
    （動的担当の変異を `--` として件数に数えなくしたため。旧 44 は数え方が違う）
- `bash test/run_e2e.sh` → **11/11 スイート PASS**（変異チェックを結線したので +1）
  - `chg_modal_inline_error_881.e2e.js`（新設）**78/0**
- 動的変異チェック → **47/0**（動的担当17本すべて**狙った検査 ID で**赤・担当漏れゼロ・未変異は緑）
  - `chg_modal_withdrawn_836.e2e.js`（追随更新）**41/0**。ベースに当てると **35/6**＝空回りでない
- 置換はすべて**出現回数1を assert してから**適用（13件）。うち1件は出現回数2で自動的に止まり、アンカーを一意化した

### 実機で確かめてほしいこと（作者）

1. **iPhone / iPad の実機**で、エラーが出たときに本文が最後まで読めること（`85vh` の効き・`env(safe-area-inset-*)`）
2. **VoiceOver** でエラーが読み上げられること（`role="alert"` の announce は AT 依存で cowork では測れない）
3. **macOS の bash 3.2.57 / BSD grep** で `bash test/test_chg_inline_error_pins_881.sh` が通ること
   （cloud は GNU grep。POSIX BRE の差はこの1回でしか確かめられない）

## STYLE-GUIDE-N5-DANGER-FACE-001: 通知分類に N5「止めた理由の提示」を追加し、danger の面色を §1 に登録

docs-only（`docs/STYLE-GUIDE.md` のみ・v1.1 → **v1.2**）。実装は1バイトも変えていない。

### なぜ

#881（対戦相手変更モーダルの入力エラー9件を native alert から画面内表示へ）の設計に反証パネルを当てたところ、
**正本に「操作を止めた理由を画面内で伝える」分類が無く、使える色も登録されていない**ことが分かった。

- §3 の4分類は N1=confirm / N2=成功 / N3=**注意（止めない・fail-soft を明記）** / N4=進行状況。
  #881 の9件は**すべて `return` で保存を拒否するハードブロック**で、どれにも当てはまらない
- N3 の warn 色を流用すると「止めない」の意味が反転し、**#884（選べるまま印を出す便）が使う枠を先に潰す**
- danger の面色として自然な `#a50e0e`/`#fdecea`/`#d93025` は `#storage-warn`（?v=55）で先に確立していたが
  **§1 の表に無く**、新規コンポーネントが「正本に無い色」を使う状態になっていた

§8-3「ガイド自体の変更は docs-only PR（作者承認必須）。実装スライスと混ぜない」に従い、
#881 の実装より**先に**この便を出す。

### 変更

| § | 変更 |
|---|---|
| 冒頭 | 改定履歴に v1.2 を追加 |
| §1 色 | **danger の面色**（`#a50e0e` 文字・`#fdecea` 地・`#d93025` 枠）を後追い登録。「danger は2段構え（文字・ボタンの `#A32D2D` と面の3色セット）」「以後これを唯一の danger 面色とする」を明記 |
| §3 | **4分類 → 5分類**。**N5「操作を止めた理由の提示（ハードブロック）」**を追加（発生元の画面内スロット・`role="alert"`・danger 面色・§4.3 の「次の行動を1つ」必須・**内部スクロールで本文を隠さない**） |
| §3.1（新設） | **N3 / N5 / info の使い分け**。色は severity だけを表し、「押した結果か／開いたときの状態か」は色で表さない。**まだ押していない段階で danger を出さない**。**色だけに意味を載せない**（D型色覚で文字色の色差 ΔE≈1.7＝識別閾未満まで縮むことを実測） |
| §3.2（新設） | **画面内スロットの置き場所**。`showMsg` は出し先が `#reg-msg` 固定でタブをまたぐと見えない（rect 0×0 を実測）。`showToast` はモーダル表示中に使わない（`body` 直下＝focus trap の `inert` の内側で AX ツリーから消える。`ignoredReasons:["inertElement"]` を実測） |
| §3 例外 | alert が正当なのは致命的事象のみ。**入力の間違い（選び直せば続行できるもの）は N5** と明記 |
| §9 | **M9**（`#storage-warn` の3色が §1 未登録だった → v1.2 で登録・class 化は M4 に含める）と **M10**（#881 の9件を N5 へ・候補ゼロ案内は info として据え置き）を追加。M1 の移行先に N5 を追記 |

### 根拠（すべて production `dccf0e0` = v140 の byte を実 Chromium で実測）

- `showMsg('…','warn')` を対局管理タブ＋モーダル表示中に呼ぶと `#reg-msg` に文字列は入るが
  祖先の `pane-reg` が `display:none` のため **rect 0×0 / inViewport false**
- `#app-toast` は `body` 直下。`openChangePairingModalFocus`（#877）が modal 以外の body 直下すべてに
  `inert` を付けるため、CDP の完全 AX ツリーで **`ignored:true / ignoredReasons:["inertElement"]`**。
  対照として `inert` を外すと `role:"status", ignored:false`
- danger 面色と warn 面色の色差（Viénot–Brettel–Mollon 変換）: 文字色 normal ΔE76 = 40.9 →
  **deuteranopia 1.7**（識別閾 ≈2.3 未満）、背景 8.7 → 6.6
- `#storage-warn` の3色は `shogi_v4.html` 全体で **1〜2回**（L527・L530）＝ここだけのインライン

### 検証

- `bash test/run_tests.sh shogi_v4.html` → **PASS=251 FAIL=0 WARN=0**（変更前と同数）
- `docs/STYLE-GUIDE.md` を読む検査2本（§4.1 用語辞書を参照）は無改変で緑:
  `test_bulk_entry_001.js` 121/0 ／ `test_master_sync_clarity_001.js` 70/0
- 実装ファイル（`shogi_v4.html` / `index.html` / `sw.js` / `app/`）は**1バイトも変更していない**

## BULK-EDIT-INLINE-ERROR-001: 名前一括編集モーダルの入力エラー2件を native alert から画面内表示へ

Issue #887。STYLE-GUIDE v1.2 §3 **N5** の2例目（1例目は #881 / PR #886）。

### STYLE-GUIDE 準拠（正本 §8-1 の要求）

§1 danger 面色 ／ §3 N5（次の行動を1つ必ず含める）／ §3.1 見出し語 ／ §3.2 置き場所（ボタン行の直前）／
§4.1 用語（「保存」はモーダルのボタンラベルの指示語・#881 の見出し語 `:10666` と同一表記）／
**§10.4 キーボード共存（表示直後＋visualViewport の resize/scroll・rAF 間引き）**

### 何を変えたか

| | |
|---|---|
| 追加 | `#bulk-err`（`role="alert"` / `aria-live="assertive"` / danger 面色 / 見出し語）を**ボタン行の直前**に常設 |
| 追加 | `showBulkEditError(msg)` / `clearBulkEditError()`。器が無ければ `alert()` に落とす |
| 追加 | **キーボード共存**: `isBulkKbdActive()` / `fitBulkCardToViewport()` / `onBulkViewportChange()` を `visualViewport` の `resize`/`scroll` に結線（#734 と同じ命名規約・同じ fail-soft 契約） |
| 変更 | 2件の `alert(...)` → `showBulkEditError(...)`。**B1 は行の呼び方を entry_no（`A05` 形式）に変更**（作者裁定: 画面の行ラベルと一致させる。配列 index の「3番目」は欠番があると必ず食い違う） |
| 変更 | `input` で消す（text 入力なので直し始めた時点。#881 の select は `change`） |
| 追加 | `resetAll` / `resetTournamentProgressOnly` の**モーダル掃除経路にも `unbindBulkViewportFollow()`**（第3の閉じ口。listener を取り残さない・bound=0 なら no-op） |
| 移設 | カードの `max-height:80vh;overflow-y:auto` を inline style → `.bulk-card` クラスへ。**見た目の変更ではない**。キーボード対応の `style.maxHeight=''` リセットがビルダーの書いた 80vh まで消すため（実測でカードが伸びた）。規律は INPUT-KBD-COEXIST-004 と同じ「実行時に触ってよいのはビルダーが書いていないプロパティだけ」 |
| 1行変更 | `run_tests.sh:80-88`（未エスケープ検査の除外リストに `showBulkEditError(` を追記・**裏づけは pin Q4**・理由コメも併記） |
| **触らない** | `:8527`「クラスの参加者がいません」＝ **UI から到達不能**（#743 ⑤b で0名時はボタン非表示。「器が無い」ではない）／ `notifySaveWarning`（SAVE-003b）＝ **N3（fail-soft）であって N5 でない**／ 判定ロジック・判定順序・`break` の位置・`hasError` |

### ★ 実装が先行便 #881 の検査を壊しかけた（変数名の衝突）

同型の実装を v1 の変数名（`el`/`body`/`text`/`card`）で書くと、**#881 の変異生成器のアンカー6本と1バイト一致**して
`mut()` の出現回数 assert が失敗し、`run_tests.sh` が赤になった（実測）。
→ **`slot`/`slotBody`/`msg`/`cardEl` に改名**。`cardEl` は必須（`bulkCard` では `card.lastElementChild` に
部分一致して #881 の P1 が X1 変異を殺せなくなる）。**教訓: 同型実装は文字列を必ずずらし、
先行便の変異アンカー全数と突き合わせて数える。**

### 検査の作り

- **静的 pin は6段**（#881 の4段＋**⑤担当変異ゼロの pin を落とす**＋**⑥台帳の整合**）。
  ⑤は**③の実測 kill 結果**から数える（表を読む実装だと表の誤りに気づけない＝反証パネルが実証）。
  ⑥は (a) **期待 PASS 総数のメタ pin**（台帳から項が静かに消えると総数が減る。実測: PINS から
  1本消しても・AND 項を消しても・写しを緩めても、①〜⑤はすべて緑のままだった）と
  (b) **mutation_check の `DYN=` と `DYN_OWNED` の突合**（③の表示「動的担当（…で実証）」を虚偽にしない）。
- Q4 の否定は **head/body 両方**＋**API スコープ内に innerHTML 系ゼロ**の2本立て。
  `.bulk-err-head` へ innerHTML を流す変異（S4hh）は**実 XSS** なのに、body だけ見る版では素通りした（実測）。
  否定項2本はそれぞれ**単独で赤にする変異**（S4x / S4y）を持つ（#881 の X3/X3r と同じ罠の対策）。
  ★ 3巡目パネルがさらに1段内側を突いた: head 側の否定を **body に狭めても** S4hh は肯定項で死ぬため
  6段が全緑のままだった → **S4hh2**（textContent を保持したまま API の外から head へ流す実 XSS の形）を追加。
  `scrollIntoView` の**値**（nearest）にも kill 証拠が無かった → **S6b**（center に変える）を追加。
  e2e の [D3]（scroll 追従）は **scroll イベントを一度も発火していなかった**（resize で代用されていて、
  scroll リスナーを消しても 51/0 全緑）→ setVV に第3引数を足し、D3 は 'scroll' で発火するよう修正。
- 動的変異チェックは #881 と同型（狙ったアサーション ID まで照合・ハーネスエラーは kill でなく検査失敗・
  期待集合と生成物の両方向照合・`run_e2e.sh` から必須経路として実行・欠落は FAIL）。
- e2e は **78セル**（参加者1〜64 × 375×667/440 × キーボード0/216/300 × 空欄/重複）＋
  **キーボード後出し/消失/スクロール**＋**画素検査**（格子採取。中心1点は文字グリフに当たって偽陰性・実測36セル）＋
  **画素検査そのものの自己検査**（`#rotate-overlay` が発火する 375×374 で「覆いを検出できる」ことを確認。
  発火条件は**幅>高さ かつ 幅≤900**。375×375 は portrait 扱いで発火しない）。

### ★ Codex 1巡目 P2 (r3791051326) を受けた直し

可視域が極端に狭いとき（375×440＋キーボード300px＝**140px**）、Enter で保存を押した直後、
ボタン行への scroll が**「直したい欄」（フォーカスされたままの入力欄）を視界の外へ追い出していた**
（実測: 欄が -11..33 で上に11px切れる。e2e はボタン行のクリップを許す一方でフォーカス欄を見ていなかった）。
→ `showBulkEditError` の最後で、**フォーカスが bulk の入力欄にあるなら `nearest` で戻す**
（十分広い画面では no-op）。直後の実測: **欄 0–44 とスロット全体 52–130.5 の両方が 140px 内に収まる**。
変異 **D6**（この戻しを消す）を追加し、e2e **[I1]** が殺すことを確認。

### ★ Codex 2巡目 P2×3 を受けた直し（全部「1巡目の直しの1段外側」）

| 指摘 | 直し |
|---|---|
| (r3791152825) **追従ハンドラ側にフォーカス戻しが無い** — vv イベント1発で `-11..33` が再発 | 戻しを `restoreBulkFocusedInput()` に集約し、`showBulkEditError` と `onBulkViewportChange` の**両方**から呼ぶ。変異 **D7** → e2e **[I4]** が殺す |
| (r3791152829) [I2] の `slot.top<=116` は**見出しが 140 を超えても緑**（8px padding＋19.5px 行高で下端 top+27.5） | [I2] を `.bulk-err-head` の **rect 全体が可視域内**に変更 |
| (r3791152831) **開いた時点でキーボードが既に出ている**と resize は新たに発火せず、fit が一度も走らない（カード 80vh 中央のまま） | `bindBulkEditModalEvents` の focus 直後に `fitBulkCardToViewport()` を1回。変異 **D8** → e2e **[J1]** が殺す。e2e に**セクション J**（イベント無しの開閉）と **[C5]**（D8 の追加で D4 が生き残ったため、表示時 fit 単独の kill 証拠）を新設 |

★ D8 の初版は**コメントだけ書き換えて呼び出しを残す「変異になっていない変異」**で、
動的チェックの「殺せない＝FAIL」がそれ自体を捕まえた（e2e 57/0 素通り → 呼び出し行を消す形に修正）。

### 検証（cloud Linux・in-tree・引数なし）

- `bash test/run_tests.sh` → **PASS=253 FAIL=0 WARN=0**（ベース252・#881 pin 37/0 無退行）
- `bash test/run_e2e.sh` → **13/13 スイート PASS**
- #887 静的 pin → **87/0**（変異**39本**・6段）／ 新 e2e → **58/0** ／ 動的変異チェック → **51/0**
- **ボタン行が隠れる13セル**（キーボード300px × 375×440 ＝ 可視域140px）は**幾何的に不可能**
  （スロット78.5＋間隔16＋ボタン44＋padding48 = 186.5px > 140px）。スロット自体は 78/78 で見える。
  受入基準は「スロットが完全に見える」・ボタン行は best-effort（この限界は e2e [C4] が現状を pin）

### 実機で確かめてほしいこと（作者）

1. **iPhone 実機**で、キーボードが出た状態で保存 → エラーが読めること（visualViewport 追従は実機でしか最終確認できない）
2. **VoiceOver** で読み上げられること（`role="alert"` の announce は AT 依存）
3. **macOS bash 3.2 / BSD grep** で `bash test/test_bulk_inline_error_pins_887.sh` が通ること

## E2E-PARALLEL-001: e2e ランナーと変異チェッカーの並列化＋テスト基盤の互換性2件

テスト基盤のみ（配信物・実装は無変更）。

### 何を変えたか

- `test/run_e2e.sh`: スイートと変異チェッカーを既定4並列で実行（`E2E_JOBS` で変更・`=1` で従来の直列）。出力はジョブ別に貯めて従来の順序で表示・各見出しに実測秒数
- `test/tools/chg_inline_error_881_mutation_check.sh` / `bulk_inline_error_887_mutation_check.sh`: 対照＋kill 実行を既定3並列で（`MUT_JOBS`）。判定ロジック・台帳・出力形式は無変更
- `test/run_tests.sh` / `test/run_e2e.sh`: locale が UTF-8 でない環境（cloud/CI の POSIX）で `C.UTF-8` を自動設定（Ruby の US-ASCII 偽 FAIL 対策・UTF-8 環境には触らない）
- bash 3.2 の「変数展開直後の全角文字」潜在3箇所を `${var}` 化（`run_tests.sh` / `test_auto_merge_gate_decision.sh` / `test_chg_inline_error_pins_881.sh`）

### 実測（cloud・同一 tree）

直列 約840秒 → 4並列 533秒 → チェッカー内部も並列で **286秒**（13/13 PASS・約3倍）

## SAVE-WARN-VISIBILITY-001: 保存警告が視界外に出るとき warn トーストでも同文を出す

Issue #892。表示のみ（保存・検証ロジック無改変）。

- `notifySaveWarning`: showMsg 後、レイアウト確定後（setTimeout 0）に #reg-msg の実可視（visualViewport の offsetTop 考慮・可視高24px以上・全画面オーバーレイ遮蔽・器なし）を判定し、見えない時だけwarn 面色のトースト（#740 の器に .warn 変種を追加・.alert-warn と同 palette）で同文を出す。持続表示・console.warn・indicator count は不変
- 成功トーストの上書き2経路を抑止（一括登録は unverified>0 で成功トーストを出さない／名簿反映の破損スキップは `_saveWarned` 印で呼び元が抑止）＝「success 抑止は callsite 責務」の既存設計に従う
- 新 e2e `save_warn_visibility_892.e2e.js`（15 assertions・反証パネル1巡＋Codex 4巡の実測セル・変異 kill を両側実測）

既知の限界（スコープ外・PR に明記): キーボード表示中はトースト自体が vv 可視域の外に出ることがある／アグリゲーション短縮文言に確認先の場所指定がない

## CLOUD-MEMBER-ATTR-MERGE-001: ☁送信が会員の区分・市町村を既定値で上書きしないようにする

Issue #853（優先順位v2 の3位）。作者裁定「案E」(2026-08-17)。

### 何が問題だったか

ローカル名簿は「未設定」と「既定値」を区別できない（normalize が `member`/`ippan` に確定する）。
そのため☁送信のたびに既定値がクラウドの実値（女性・中学生・非支部員・市町村）を上書きし、
翌大会の参加費が誤徴収になっていた（実測: 女性 0円 → 500円）。

### 何を変えたか

- `composeCloudMemberFieldCols(local, cloudRow)` 新設（純関数）: 送信行の属性3列を**フィールド単位で合成**。
  非既定値（other / chu・josei / 市町村あり）はローカル優先、既定値の欄はクラウド値を採用
- `_fetchCloudMemberAttrs(client, clubId, memberIds)` 新設: 送信直前に members を**読み取り専用**で取得。
  参加者の member_id を **100件チャンクの `in()`** で明示指定する（全件 select は API の1レスポンス上限で
  prefix しか返らないのに成功扱いになり、欠けた会員が既定値で上書きされる）。
  （`pullMembersFromCloud` は `saveBranchMaster` を伴いローカルの訂正を巻き戻すため使わない）
- 属性取得の**待ち明けに確認内容を再照合**（#857 の確認レースを再オープンしないため）。報告書（大会名・実施日）に加え
  **参加者名簿の署名**（クラス・参加者id・member_id を全参加者ぶん連結）も照合する。
  member_id を持つ会員だけの照合では、待ち時間に追加された**名簿未リンクの参加者**が
  どのガードにも掛からず、確認していない参加者が共有結果に混ざるため
- 中止メッセージは **⚠ で始める**（`classifyCloudStatusKind` が「〜しました」を成功と読むため、
  ⚠ が無いと中止が成功色で表示される）
- **失敗メッセージにも**属性未読の ⚠ 注記（members だけ書けて後段で失敗した経路を隠さない）
- `buildCloudSyncPayload` に `opts.cloudMembersById`。**渡されないときは従来どおり**（既存呼び出しは挙動不変）
- `syncTournamentToCloud` が opts を転送（★明示列挙。忘れると無音 no-op で全テスト緑のまま通る）
- 取得の**失敗と0件を区別**し、失敗時は送信結果に ⚠ 注記（無音で元のバグ挙動に戻らない）
- `pushMemberEditToCloud` 失敗時の文言3箇所から「☁送信時にも同期されます」を削除し、
  確実に届く経路（名簿タブの一括送信＝常にローカル優先）を案内（案E では既定値方向の訂正を拾えないため）

### 既知の限界（作者了承・別 issue 候補）

- 「josei→ippan」「other→member」「市町村を空に」という**既定値方向の訂正**は☁送信では届かない（一括送信で反映）
- entries 側の当時値スナップショットは本便では直らない（クラウド大会結果の属性表示は既定値のまま）

### 検証

`run_tests.sh` **254/0/0**（新テスト `test_cloud_member_attr_853.js` 49件）／`run_e2e.sh` **14/14**（385秒・3並列）

変異検証（Codex 3巡目ぶん）: 署名照合を member_id 一覧に戻す変異 → H1/H5/H6 が赤／
中止文言の ⚠ を外す変異 → H4b が赤。いずれも**狙ったアサーションが**殺した。

## LAND-BUNDLE-001 / E2E-MUT-SKIP-001: 段取り損失をなくす2本（受け渡し自動化・変異チェックの条件付き実行）

開発の段取りのみ（配信物 `shogi_v4.html` / `index.html` / `sw.js` / manual は**無変更**）。

2026-08-17 に #853（PR 起票→マージ 206分）を実測分解したところ、
**155分（75%）が工程の重さではなく段取りの損失**だった。その内訳の上位2つを潰す。

### 1. `scripts/land.sh` — bundle の受け渡しを自動化（実測 −95分/回 の想定）

cloud から GitHub への push は全遮断なので、変更は必ず作者の端末を経由する。
#853 ではこの受け渡しで3回失敗し**約95分**を捨てた（プレースホルダ混入・repo パス誤り・checkout 衝突）。

- 作者は**セッション開始時に1回 `bash scripts/land.sh` を起動しておくだけ**
- cowork が repo 直下に bundle を置くと、verify → 一時 ref へ fetch → `origin` へ push → `_landed/` へ退避 まで自動
- **作業ツリーには触らない**（checkout も merge もしない）＝作者が production 系や release 枝に居ても衝突しない
- 保護枝（`production` / 開発本流 / `main` / `master`）への push は既定で拒否
- 非 fast-forward は失敗として `.failed` に残し、復旧コマンドをそのまま出す。上書きは `<name>.bundle.force` を添えたときだけ（旧 SHA をログに残す）
- 起動時に既にあった `*.bundle` は対象外（過去の残骸を勝手に push しない）。`--include-existing` で対象化
- `--once` / `--dry-run` / `--repo <path>` / `POLL=` あり

### 2. `E2E-MUT-SKIP-001` — 変異チェックを毎回走らせない（実測 −236秒/回）

`run_e2e.sh` の総仕事量の 70%（484/687秒）が #881/#887 の動的変異チェックだが、
**#853 は chg-modal も bulk-edit も1行も触っていないのに4巡とも全部走っていた**。

変異チェックが実証しているのは「**その検査自身が変異を殺せるか**」だけで、
その値を決める入力は閉じている（チェッカー本体／変異ジェネレータ／e2e スイート／
**変異が当たる HTML 領域＋前後400字**／node・playwright 版）。
これを1個の sha256 に畳み、**前回 PASS 時と byte 単位で同一なら走らせない**。

- `test/tools/mutation_input_key.js`（鍵の生成）＋ `test/lib/mutation_cache.sh`（記録の読み書き）
- 記録は `.mutcache/`（**.gitignore 済み＝クリーン checkout に無い＝CI は必ずフル実行**）
- `MUT_FULL=1` でいつでも強制フル。`$CI` が非空なら鍵を作らない
- 記録するのは FAIL=0 で完走したときだけ。TTL 24時間。**ヒットしても mtime を延ばさない**
- skip は PASS と別に数える（見出しに【SKIP】・最終行に「PASS ＋ スキップ N 件」）。`MUTCACHE-SKIP` を合図に `run_e2e.sh` が集計

畳めない残余リスク（変異領域**以外**の HTML 変更で検査が弱まる場合）は
①素の e2e（対照）は常に走る ②CI は必ずフル実行 ③TTL の3つで受ける。
詳細は `test/tools/mutation_input_key.js` のヘッダに全部書いてある。

### Codex レビューで塞いだクラス（PR #899・1巡目 P1×4/P2×2 → 2巡目 P1×5/P2×8）

指摘を**クラス単位**で潰し、同型の未指摘も一緒に塞いだ。

| クラス | 直し |
|---|---|
| A 実行環境の同一性 | 鍵に `platform/arch`・**実 Chromium のパス**（build revision 入り）・`TZ`・`LC_ALL/LANG` を追加。鍵の書式版 v1→v2。同じ checkout を別 OS で共有しても取り違えない |
| B 観測と作用の間に変わる | force push を `--force-with-lease=<ref>:<観測値>` に。**verify → fetch の間に bundle が差し替わっていないか**（size＋mtime）も追加 |
| C 残骸の持ち越し | 失敗時に `.force` を `.force.failed` へ隔離。**孤児マーカー**を警告。失敗ごとに `refs/land/failed/<bundle名>` の不変 ref を残し、**復旧コマンドは確定 SHA**を指す |
| D 時計・数値の異常 | age が負（未来）／`date` 異常／**TTL が非数値**（`[ -ge ]` がエラーで偽を返し**ヒット側へ落ちていた**）／**TTL の桁あふれ**を全部 fail closed |
| E 検査が結線を測っていない | grep を捨て、①架空チェッカー ②本物のチェッカー ③`run_e2e.sh` 本体、の3層で実測 |
| F 記録の真正性 | TTL の基準を **mtime から記録の中身の epoch へ**（`cp` で復元しても延びない）。旧書式は fail closed。**保存の直前に鍵を作り直し**、開始時と一致したときだけ記録（検査中に入力が変わった実行を保存しない） |
| G 取り違え | 処理対象を**専用名へ claim** してから触る。置き直された修正版を未処理のまま退避しない／verify→push の間に中身が差し替わらない／同名の置き直しも普通に処理される |
| H 残す痕跡 | `--dry-run` は ref を1本も作らない／`--once` は失敗があれば非0／Ctrl-C 後は新しい push を始めない／失敗は `_landed/failed/` に**試行ごと一意名**＋`refs/land/failed/<sha>`／隔離名も `.gitignore`／`origin` URL の userinfo をマスク（PAT をログに残さない）／鍵生成の失敗経路でも tmp を掃除 |
| I 引数の受け渡し | `--extra` を文字列連結ではなく**配列**で渡す（**パスに空白がある macOS 環境**でキャッシュが一度も効かなくなるのを防ぐ） |

### 実測（cloud 2コア・同一 tree）

| | 所要 | 結果 |
|---|---|---|
| フル（キャッシュ無し） | **312秒** | 14/14 PASS |
| 変異と無関係な差分を入れて再実行 | **58秒** | 12/14 PASS ＋ スキップ2件 |

**1巡あたり −254秒。**#853 と同じ4巡なら約16分の短縮。
変異が当たる領域を触ったときは鍵が変わってフル実行に戻ることを実ファイルで確認済み。

### テスト

- `test/test_land_script_001.sh`（**39件**）— 使い捨て sandbox（bare repo を origin に見立てる・network 不使用）
- `test/test_mutation_cache_001.sh`（**54件**）— 鍵の性質に加え、**結線そのものを動かす3層**:
  ①架空チェッカーに本物の lib を source させて実行（初回=実行／2回目=skip／入力変更=再実行／失敗は記録しない／CI・`MUT_FULL=1` は必ず実行）
  ②**本物のチェッカー2本**を鍵を先に記録した状態で起動し、数秒で `MUTCACHE-SKIP` を出すことを実測（結線が切れていれば時間切れで赤）
  ③**`run_e2e.sh` そのもの**を sandbox で走らせ、合図あり／なしの両方向で集計を実測（`node` は PATH stub）
- `bash test/run_tests.sh shogi_v4.html` = PASS=256 / FAIL=0 / WARN=0

## MEMBER-EDIT-TOUCHED-COLS-001: 名簿編集のクラウド反映を「操作した欄だけローカル優先」にする

Issue #901。作者裁定「案C」(2026-08-18)。

### 何が問題だったか

#853 は**☁送信**の経路だけを直した。**名簿編集の push**（`pushMemberEditToCloud`）は
`_cloudMemberFieldCols`＝**ローカル値の無条件上書き**のままだった。

そのため☁取り込み前の端末で「簡易一覧 → 会員をタップ → **ふりがなの誤字だけ**直して保存」
すると、送信行に `member_kind:'member'` / `grade:'ippan'` / **`city:null`** が乗り、
クラウドの「その他・女性・沼津市」が潰れる（実測）。#853 と同じ誤徴収（実測 500円/人）が、
☁送信ではなく**編集 push という別経路**にそのまま残っていた。

一方で、全欄を `composeCloudMemberFieldCols` に寄せると、編集パネルで**明示的に**
「女性→一般」「その他→支部員」と直した訂正までクラウド値に負ける（＝#901 の本来の要求が閉じない）。

### 何を変えたか

- `composeEditPushFieldCols(local, cloudRow, touched)` 新設（純関数）。
  **その保存で利用者が実際に操作した欄**はローカルが無条件に勝ち（既定値方向の訂正も届く）、
  **操作していない欄**は `composeCloudMemberFieldCols` に委ねる（＝☁送信と同一規則でクラウドの実値を保全）。
  `touched` 省略時は「何も操作していない」＝保全側に倒す（渡し忘れてもクラウドを壊さない）
- **「操作した」は `data-init` との差分ではなく、セグメントを押したか（`data-touched`）で見る。**
  差分だけで判定すると「ローカルは既に一般・クラウドだけ女性のまま」の会員で「一般」を押し直しても
  差分ゼロ＝この経路から永久に訂正を送れない出口なしの状態になる（反証パネル実測）。
  `_msSegState` が `touched` を返し、`bindMasterEditPanel` の `onPick` が印を立てる
- `pushMemberEditToCloud(member, setStatus, touched)`: 送信前にその会員1件だけ
  `_fetchCloudMemberAttrs` で**読み取り専用**取得して合成に使う。
  読み取りは**常に**行う（「3欄すべて操作したら読まない」最適化は、市町村の欄が編集パネルに無い以上
  実運用では一度も成立せず、テストだけがその死んだ枝を守ることになる）
- **読み取りに待ち上限**（`EDIT_ATTR_READ_TIMEOUT_MS=6000`）。会場の詰まった回線で select が返らないだけで
  **upsert が一度も発行されない**のは当日運営で致命的なため、打ち切って従来経路（ローカル値＋⚠）へ倒す
- 取得の**失敗と0件を区別**する。**読めなかったときは「書く値が分かっている欄」しか列に載せない**
  （操作した欄だけ載せ、未操作欄は列ごと送らない＝UPDATE 対象外でクラウド値を保全）。
  ⚠ を出しても消えたデータは戻らないので、表示ではなく**送らないこと**で守る（Codex P1 r3801845108）。
  併せて `EDIT_ATTR_UNREAD_NOTE`（⚠）で読めなかったことを黙らせない
- 逆に**クラウドの値を保った欄がある場合も ⚠ で名指しする**（`_editAttrKeptNote`）。
  黙ると端末の表示（一般）とクラウドの実値（女性）が食い違ったまま成功表示だけが出て、
  「直したのに直っていない」ことに気づけない。端末値で上書きする出口（名簿タブの一括送信）まで書く
- 成功文言から列名の固定列挙をやめる。何を送ったかは保存ごとに変わるため、
  列名を名乗ると送っていない欄まで反映したと誤解させる
- `masterSheetCommitNameEdit` が `touched` を渡す。**市町村は編集パネルに欄が無い＝常に
  操作していない**扱いになり、編集のたびにクラウドの市町村を NULL で潰す事故が止まる
- `pushMemberDeleteStateToCloud` も**送信前に現在値を読み、`composeCloudMemberFieldCols` で合成**する。
  従来はローカル値を無条件に同乗させており、☁取り込み前の端末で誤って削除→復元しただけで
  同じ誤徴収が起きていた（反証パネル実測）。
  一方で属性列を**一律で落とす**と、クラウドにまだ行が無い会員の削除 INSERT が全部 NULL になり、
  以後どこからも属性が補われないまま別端末が取り込んで既定値化する（Codex P1 r3801845099）。
  合成なら「既存行はクラウドの実値を残す／行が無ければローカル値で完全な行を INSERT する」を両立できる。
  読めなかったときは属性列を送らず `DELETE_ATTR_UNREAD_NOTE`（⚠）で明示する
- **再描画時の dirty 判定（`renderMasterTab`）も `touched` を見る。**
  `sel!==init` だけだと「現在値を押し直してクラウドを訂正する」操作が差分ゼロ扱いになり、
  並び替え・行チェック等の外部再描画が入った瞬間に commit されず**黙って消える**（Codex P1 r3801845091）

### 直していないこと（意図的）

- **旧 F7 編集モーダル**（`openMasterEditModal` / `me-city`）は #798 で退役済み・UI 未結線
  （結線先 `.master-edit-btn` が生成されない）。本スライスでは触っていない。
  そのため**アプリには市町村を編集できる UI が無い**状態が続く（別 issue 候補）
- ☁送信だけで既定値方向の訂正を届ける経路は #853 のまま（届け先は名簿タブの一括送信）

### テスト

`test/test_member_edit_touched_cols_901.js`（72 checks）。

R セクションで **生きている UI の DOM 契約**を生成 HTML から固定する。
これは自戒で、直前の試行では退役済みモーダルに修正を書いてしまい、
`app_harness` の `getElementById` が未知 id でもノードを自動生成するため
テストが全緑になってその誤りを一つも検出しなかったため。
`ms-edit-save` / `ms-edit-name` / `masterCloudPullStatus` の id 改名、`data-init` の欠落、
結線を死んだ関数へ移す、退役モーダルを名簿タブから到達可能にする——いずれも R セクションが赤にする。

さらに、テストが**ハングしたまま exit 0 で「全PASS」になる**穴（`run_tests.sh` は終了コードしか見ない）を
塞ぐため、20 秒の待ち上限と **assertion 実行本数の一致検査**を入れている。

既存 `test/test_master_sheet.js` の supabase mock は `select()` を持たず、本変更で
`_fetchCloudMemberAttrs` が投げる `TypeError` を `catch` が握り潰した**縮退パス**で緑になっていた
（＝成功パスを一度も通っていなかった）。mock に読み取りを足し、`S15a` / `P8a` / `P8b` で
「読めた成功パスを通っていること」を固定した。固定オフセットの窓（`+2000` / `+3000`）は本文が伸びると
assertion が黙って窓の外へ出るため、次の関数定義までのスライスに変えた。

### Codex レビュー 1 巡目（PR #908・`2d01b3d`）

P1 3 件・P2 1 件。**すべて着手前に同じ手順で再現してから直した**。

| 指摘 | 再現 | 対応 |
|---|---|---|
| P1 押し直した `touched` が再描画で消える | `renderMasterTab()` を挟むと `_masterEditingMid=null` / `upserts=0` | `_segDirty` を `touched` 基準に |
| P1 削除 INSERT で属性が全部 NULL | クラウド未登録の `other/josei/沼津市` を削除 → 3列とも欠落 | 読み取り＋合成に変更 |
| P1 読み取り失敗時にローカル既定値で潰す | 読み取り失敗で `member/ippan/null` を送っていた | 未操作欄は列ごと送らない |
| P2 テストが正しい #906 対応で赤くなる | 市町村欄＋配線を足すと R3 と e2e A4 が赤 | R3 を「既知6個は必須・追加は許容」に、e2e A4 を関係の確認に |

P2 の解消は、**実際に市町村欄を足して配線した版**（`buildMasterEditPanelHtml` に入力＋`_msInputState('ms-edit-city')` で touched）を作り、単体 67/0・e2e 12/12・`test_master_sheet` 77/0 が緑のままであることで確認した。

### Codex レビュー 2 巡目（`63ed5f1`）

| 指摘 | 再現 | 対応 |
|---|---|---|
| P1 押し直した値が☁取得に食われる | 押し直し → pull 着地 → 再描画 flush commit の順で、送信行が `{other, josei}`（＝押した「支部員」が消え pull 後の値が再送）・画面は成功表示 | 適用条件（`opts`）も `touched` 基準にし、押した値を commit まで持ち回る |
| P2 ⚠ 文言が挙動と逆 | 1巡目で「未操作欄は送らない」に変えたのに ⚠ は「この端末の値で送りました／上書きされている可能性」のまま | 文言を挙動に合わせ、**行の列構成から導く pin**（P25b）を追加 |
| P1 読み取り失敗＋初回 push で属性 NULL の行 | まっさらな別端末が pull → `normalizeBranchMaster` が 支部員/一般/市町村なし に確定 | **本スライスでは直さない**（下記） |

`opts` を `touched` 基準にした際、「操作していない欄は☁取得後の値を古い表示値で巻き戻さない」
（MASTER-EDIT-FORM-001）の性質が壊れていないことを `P46` で固定した。

### 積み残し（別 issue）

読み取り失敗と、その会員の**初回 push** が重なると属性 NULL の行がクラウドにできる。
`⚠` は「この端末」にしか出ないので、別端末側からは気づけない。

クライアントで「読んでから書く」構造である限りこの窓は閉じない。正しい解は
`INSERT ... ON CONFLICT DO UPDATE SET`（SET 句に更新したい列だけ挙げる）を行う RPC で、
新規行は完全・既存行は指定列だけ、が **1文で原子的に**成立し、事前読み取り・待ち上限・
巻き戻し窓がまとめて消える（＝コードは減る）。
ただし migration の適用を伴う重車線なので、本スライス（中車線）には載せない。

## MEMBER-UPSERT-RPC-001: 会員 upsert を RPC 化し「INSERT は完全な行・UPDATE は指定列だけ」にする

Issue #909（#901 の Codex 2巡目 P1 r3802131305 から分離した重車線）。
**便1＝migration と実 PG 検証のみ。**クライアント（`pushMemberEditToCloud` /
`pushMemberDeleteStateToCloud`）の切り替えは、作者が Supabase へ適用したことを確認してから
便2で行う（適用前にクライアントが RPC を呼ぶと名簿編集の保存が全部失敗するため・作者裁定 2026-08-18）。

### 何が問題だったか

#901 は編集 push を「送信前に members を読む → 操作していない欄はクラウド値を採用して upsert」に
した。本題（ふりがなの誤字を直しただけで区分・級・市町村が既定値と NULL で潰れる＝実測 500円/人の
誤徴収）は塞がったが、**「読んでから書く」構造そのものに由来する穴が2つ残った**。

- **穴①** 読み取り失敗 ＋ その会員の初回 push → 属性が NULL の行ができる。
  まっさらな別端末が pull すると `mergeCloudMembersIntoMaster` の非空ガードで属性が入らず、
  `normalizeBranchMaster` が 支部員/一般/市町村なし へ確定する。⚠ は push した端末にしか
  出ないので、**被害を受ける側からは気づけない**。
- **穴②** select→upsert の窓で他端末の更新を巻き戻す（#907 の 1.・#901 が新設した窓）。
  受付席と本部席で同時に名簿を触る場面が該当する。

### 何を変えたか

`supabase/migrations/20260818120000_member_edit_upsert_preserving_attrs.sql` を追加（純追加・冪等）。

- `app_upsert_member_edit(p_club, p_member_id, p_name, p_yomi, p_member_kind, p_grade, p_city,
  p_set_member_kind, p_set_grade, p_set_city, p_deleted_at, p_touch_deleted_at)`
- `insert ... on conflict do update set` は **set 句に挙げた列だけ**を更新する。これを使って
  **新規行は excluded（＝端末のローカル値）で完全な行／既存行は `p_set_*` が true の列と
  name・yomi（・deleted_at）だけ**を 1文・1トランザクションで書く。事前 select が要らないので
  **穴①も穴②も原理的に生じない**
- 未更新列は `coalesce(excluded.x, m.x)` ではなく **`case when p_set_x then excluded.x else m.x end`**。
  coalesce だと未操作でも既存 NULL が端末値で埋まり保全にならず、`p_set_x=true` での
  **NULL への明示クリアもできなくなる**（反証パネル M10 で実測）
- `p_touch_deleted_at=false`（既定）なら既存の `deleted_at` に触れない＝編集 push が tombstone を
  復活させない。`true` で削除／復元の両方を同じ関数で扱う
- `p_set_*` の既定は **false**＝呼び出し側が渡し忘れてもクラウドを壊さない側に倒れる
- **security invoker**。RLS はそのまま有効で `members_insert` / `members_update` の
  `app_is_active_organizer(club_id)` が効く＝**この RPC で権限は一切増えない**。anon に EXECUTE を与えない
- 区分・級は関数内で whitelist 検証。**`p_set_*` が false でも新規行の INSERT には載る**ため、
  検証は「渡された値が非 NULL のとき常に」行う
- 返り値 `{inserted, member_kind, grade, city, deleted_at}` は**実際に残った値**。便2の
  クライアントは「端末の表示と違う値が残った欄」を推測ではなく実値で ⚠ に出せる

### 意図的にやらなかったこと

- **「0 行だったら失敗させる」分岐を置かない。** RLS 違反は raise する（黙って 0 行にはならない）＝
  U22–U24 で実証済み。到達しない分岐を防御として置くと、テストがその死んだ枝を守ることになる
  （#901 で退役済みモーダルに実装して 26/26 緑になった失敗と同じ形）
- **name / yomi は常に更新する**（現行の upsert と同じ）。「削除 push が別端末で直した氏名を
  巻き戻しうる」性質は本 RPC でも変わらないが、これは #909 の対象外＝#907 系の別件。
  ここで一緒に変えると属性列の保全という本題の効果と混ざって切り分けられなくなる
- クライアントの切り替えと、それに伴う `_fetchCloudMemberAttrs` / `_withReadTimeout` /
  `EDIT_ATTR_UNREAD_NOTE` / `DELETE_ATTR_UNREAD_NOTE` の削除は**便2**

### テスト

`test/member_upsert_rpc_pgtest.sh`（**実 PostgreSQL 16.13 で 35 checks・FAIL=0**）。
全 migrations を実 PG に適用したうえで、**実際に RPC を呼んで行の実値を前後で比較する**
（「set 句に case when があるか」のようなソース形状の存在チェックはしない → [[pin-must-exercise-behavior]]）。
保全の判定は列ごとの比較に加えて **行全体の md5** でも取り、列を1つ見落とす形の抜けを塞ぐ。

主なもの: U2 未操作の3属性が1バイトも変わらない／U6 押した欄は既定値方向でも上書き／
U7 `p_set_city=true` なら NULL への明示クリアもできる／U8 新規行は `p_set_*` 全 false でも
3属性が入る（穴①）／U10・U10b `p_touch_deleted_at=false` は削除状態にも生存にも触れない／
U15 新規行でも不正な語彙は拒否（INSERT に載るため）／U25 anon は
**permission denied for function**（失敗理由まで一致）／U29 SECURITY INVOKER／
**U31 端末Y の更新が巻き戻らない（穴②の直接の証明）**。

### 反証パネル（変異を当てて赤を確かめた）

12 変異中 **11 が赤・素通り1**。

| 変異 | 結果 |
|---|---|
| M1–M3 member_kind / grade / city を無条件上書き（#901 の実害そのもの） | 赤 |
| M4 新規行の INSERT で member_kind を落とす（穴①を再現） | 赤 |
| M5・M11 deleted_at を無条件代入 | 赤（U10 / U10b） |
| M6・M7 whitelist 検証を無効化 | 赤 |
| M8 security invoker → definer | 赤（U22–U24・U29） |
| M9 anon にも EXECUTE を付与 | 赤（U25・U27） |
| M10 city を `coalesce(excluded, m)` に | 赤（U7・U31） |
| **M12 `revoke ... from anon` を消す** | **素通り（35/0 のまま緑）** |

M12 が素通りするのは、効いているのが `from public` の revoke だけで、anon には明示 grant が
無いため **`from anon` の行が今日は no-op** だから。既存 `app_hard_delete_members` と読み比べ
やすいよう行自体は残したが、**「anon を締めている根拠」はこの行ではなく U25/U27**（実際に呼んで
permission denied を確認）であることを SQL のコメントにも書いた。

`bash test/run_tests.sh shogi_v4.html` = **PASS=260 / FAIL=0 / WARN=0**（本 pgtest 追加で 259→260）。

# MEMBER-CITY-EDIT-001（#906）会員の市町村を編集できるようにする

## 何が困っていたか

会員の**市町村**（`members.city`）を編集できる UI が、アプリのどこにも無かった。
入力欄は repo 全体で1つだけで、それは #798 で UI 未結線化＝退役した旧 F7 編集モーダルの中にある
（`.master-edit-btn` を生成する箇所が存在しないので、そのモーダルはどう操作しても開かない）。

つまり市町村は、☁取り込み（`mergeCloudMembersIntoMaster`）で**下りには入ってくる**のに、
端末からは訂正も削除もできない状態だった。報告書の「お住まい（市町村のみ）」欄はこの値を使う。

## どう直したか（作者裁定 2026-08-19: 案1）

**生きている編集 UI**（名簿タブの行内パネル `buildMasterEditPanelHtml`）に欄を1つ足した。
退役モーダルには触っていない（#798 の決着は別スライス）。

- 入力は**自由入力＋候補一覧**（`<datalist>`）。候補は名簿に実在する市町村を重複なく文字列順に出す
  （`masterCityCandidates`）。**候補に制限しない**ので新しい市町村も入れられ、
  「沼津市／沼津」のような表記ゆれだけが減る。
- 候補には**削除済みの会員の市町村も含める**。候補は「過去に使われた表記」であって
  「いま誰かが住んでいる市町村」ではない。除くと、最後の1名を削除した瞬間にその表記だけ候補から
  消えて揺れが復活する。
- `maxlength="20"` は `normalizeCity` の上限と揃えた（貼り付けで越えた場合も保存時に丸まる）。

## クラウドへの送り方（#901 の規則にそのまま乗せた）

`applyMasterMemberEdit` は以前から `options.city` を受け取れるので、**データ層は無改変**。
配線だけを区分/級と同じ規則で張った。

- 欄を**触った**（`input` を打った、または初期値から変わった）なら、その入力をローカルに適用し、
  クラウドへも `set_city=true` で送る。
- 触っていなければ `opts` に載せない ＝ パネルを開いたまま☁取得で入った市町村を、
  古い表示値で巻き戻さない。
- 「打って戻した（差分ゼロ）」も**操作**として拾う。差分だけを見ると、
  「ローカルは正しく、クラウドだけ古い」ときに訂正を送る出口が無くなる（#901 で実測した罠と同型）。

「触っていなくてもローカルが非既定値なら送る」という #853 案E の規則は**変えていない**
（`_editPushSetFlags` のまま）。欄が生えたことで空の市町村を送るようになると、
編集のたびにクラウドの市町村が消える ＝ #901 の実害そのものに戻るので、そこはテストで固定した。

## テスト

- 新規 `test/test_member_city_edit_906.js` … **30 検査**（候補一覧の純関数／パネルの生成 HTML／
  触った印の配線／保存とクラウド送信の実経路）
- 新規 `test/e2e/member_city_edit_906.e2e.js` … **13/13**。
  ★ 実ブラウザで測る理由: #906 の元になった事故がまさに「UI から到達できない退役モーダルの中に
  唯一の市町村入力がある」というもので、DOM モックはそれを一つも検出しなかった
  （`app_harness` の `getElementById` は未知 id でもノードを自動生成する）。
  名簿タブの氏名セルをタップ → パネル → 市町村を入力 → 保存、まで人間と同じ経路を通す。
- `test/test_member_edit_touched_cols_901.js` の R6（編集できる欄と push の touched が一対一）は
  **緑のまま**通る＝欄と配線を同時に足したことがそこで担保される。

### 反証パネル（12本すべて赤を確認）

欄を消す／`opts.city` を配線しない／`touched.city` を常に false／触った印の listener を外す／
touched を差分だけにする／`maxlength` を外す／`list=` を外す／候補から削除済みを外す／
候補を正規化しない／候補を渡さずにマウントする／値をエスケープしない／市町村を常に送る。

※ 「touched を差分だけにする」は最初**空振り**した。非既定値（三島市）の会員で測っていたため、
#853 案E の規則だけで `set_city=true` になり、「触ったかを見ているか」が区別できていなかった。
ローカルが空の会員に変えて初めて赤くなった。

## MEMBER-CLOUD-STATUS-LOG-001 (#907): 名簿タブのクラウド結果を3行の履歴にし、連打にガードを入れる

Issue #907 のうち **2.〜4.**。中車線（表示の出し方は作者確認済み＝「最大3行の履歴」を採用）。

### ★ 先に: #907 の 1. と 5. は **#909 で消えていた**

着手前にコードで実測した。

| # | 中身 | 現状 |
|---|---|---|
| 1 | select→upsert の窓で他端末の更新を巻き戻す | **消滅**。編集 push に `.from(` も `_fetchCloudMemberAttrs` も **0 件**＝読み取りの窓が存在しない |
| 5 | `unread` 判定の取りこぼし | **該当せず**。編集 push が `_fetchCloudMemberAttrs` を使わなくなった |

起票時（#901 の時点）の実害は #909 の RPC 化で構造ごと無くなっている。本スライスは残る3点を扱う。

### 何を直したか

| # | 症状（#907 の実測） | 直し方 |
|---|---|---|
| 2 | 保存3連打で upsert / claim / getSession / トーストが各3回 | **会員ごとの in-flight ガード**。2本目以降は `{ok:false,step:'inflight'}` で即返す。削除/復元も同型（`mids` の集合＋削除/復元の別でキー） |
| 3 | 共有の status 行1本を5経路が奪い合い、**遅い成功が直近の失敗を塗り潰す**（成功 60ms vs 失敗 5ms） | **最大3行の履歴**にする。新しい操作は先頭に積み、**同じ操作の続報はその行を置き換える**（「反映中…」で3行が埋まらない） |
| 4 | ⚠ が「どの会員の話か」を書かず、次の保存で消える | 各行の先頭に**会員名**を付ける（削除/復元は `_masterSheetNamesFor` の形＝「太郎、花子」「…他N名」） |

書き込み口を **`_masterCloudStatusFn(label)` 1本**に集約した（従来は編集 push の呼び出し元・☁取得ボタン・
起動時の自動取得がそれぞれ直接 `applyCloudStatus` を呼んでいて、**互いの表示を消していた**）。

色は**いちばん重い行の色**をブロック全体に使う（失敗が1行でも残っていれば失敗の色で見える）。
`innerHTML` は使わず、改行は要素側の `white-space:pre-line` で見せる。

### ★ いちばん効く実装上の発見

**`renderMasterTab` は status 要素を HTML 文字列ごと作り直す。** そして保存の実際の順序は
`renderMasterTab()` → **その後に** push が着地、である。つまり**履歴を DOM だけに持つと、
本番でだけ消える**（テストの DOM モックは要素を作り直さないので気づけない）。
履歴は JS 側の配列に持ち、`renderMasterTab` の末尾で描き直す。

### この pin が空振りしていないことの確認

初版は**変異4本のうち3本が素通り**した。素通りの原因ごと直した:

| 素通りした変異 | なぜ素通りしたか | どう直したか |
|---|---|---|
| 再描画フックを外す | `app_harness` の `innerHTML` は**要素を作り直さない**ので「再描画で消えた」を再現できていなかった | 本番と同じ「status が空になった状態」を**自分で作ってから** `renderMasterTab` を呼び、**書き戻されること**で判定する |
| in-flight ガードを外す | ハングした push を `await` していたため `Promise.all` が settle せず、**node が exit 0 で終わって黙って緑**になっていた。20秒の番人を置いていたが **`unref()` していたので鳴らなかった** | ハングする push は await しない（RPC が出たかで見る）＋**番人の timer を unref しない** |
| 会員名の受け渡しを外す | L 群が `_masterCloudStatusFn` を直接呼んでいて**呼び出し元の配線を見ていなかった** | 実コーディネータ（`masterSheetCommitNameEdit` / `masterSheetDeleteSelected`）を通す N 群を追加 |

修正後は**変異5本すべて赤**（履歴を1行に戻す／再描画フックを外す／in-flight を外す／会員名を外す／
`white-space:pre-line` を外す）。in-flight の変異では**20秒の番人が実際に鳴る**。

### テスト

| 検証 | 結果 |
|---|---|
| `test/test_member_cloud_status_log_907.js`（新設） | **30 checks / FAIL=0** |
| `bash test/run_tests.sh shogi_v4.html` | **PASS=263 / FAIL=0 / WARN=0**（261→263＝新テスト＋既存の追随） |
| `bash test/run_e2e.sh shogi_v4.html` | **14/14 スイート PASS** |
| `test/test_ux_p1_001.js` | 45/0（U1i/U1j を新しい経路へ追随。**存在チェックのままなので、履歴の振る舞いは新テストが実際に動かして見る**） |

### 触っていないもの

- #907 の 5.（`unread` 判定）は #909 で該当しなくなったため、issue 側に記録を残すだけ
- ☁送信・ライブ配信・履歴タブの status 行（別要素）は無改変

## Codex 1巡目（PR #916）で直したもの

- **P1 待たせた保存を捨てない**（`pushMemberEditToCloud`）。飛行中の2本目を `{ok:false,step:'inflight'}`
  で捨てると、先に飛んだ**古いスナップショット**が「反映しました」と言ったまま、あとから保存した内容が
  クラウドへ永久に届かない（他端末は古い値のまま＝#901 と同じ誤徴収の入口）。直列化に変え、待ち行列には
  **いちばん新しいスナップショット1件だけ**を残す（合流）。合流時の `touched` は**論理和**を取る
  （2本目が触った市町村が3本目に飲まれると、set_city が false に落ちて誤徴収に戻る）。
  待たされている間は行に「前の反映の完了を待機中…」を出す。
- **P1 溢れて落ちた行の続報を戻さない**（`pushMasterCloudLine`）。4件目以降で押し出された操作の遅い続報が
  「知らない token」として先頭に積まれ、いま出ている**新しい失敗行**を1つ押し出していた
  ＝この履歴が防ぎたかった上書きが復活していた。退役 token を覚えて捨てる（表は 200 件で張り直す）。
- **P1 削除キーの区切り文字衝突**（`pushMemberDeleteStateToCloud`）。会員 id は「空でない文字列」しか
  要求していない（外部マスタ取り込み経路）。`join(',')` だと `['a,b','c']` と `['a','b,c']` が同じキーになり、
  別の削除が in-flight と誤判定されて**黙って消える**。`JSON.stringify` に変更。
- **P2 読み上げが3行ぶん繰り返される**。`role="status"` は `aria-atomic` 既定 true なので、1行だけ変えても
  ブロック全体が読み直される。見える3行ブロックからライブ属性を外し、**変わった1行だけ**を持つ視覚非表示の
  `#masterCloudPullStatusLive` を分けた。ただの再描画（`renderMasterCloudLog()` 引数なし）では読み上げない。

削除 push の in-flight ガードは**捨てる方のまま**にしてある。キーが (会員集合, 削除/復元) なので、
飛行中の2本目は文字どおり同じ操作＝重複であり、編集 push のような「新しい入力」ではない。

反証パネル: 上記4点それぞれに対応する変異7本（キーを join に戻す／退役ガードを外す／論理和をやめる／
合流をやめる／見える方をライブ領域に戻す／読み上げに3行入れる／再描画でも読み上げる）で
`test/test_member_cloud_status_log_907.js` が赤になることを確認。同テストは 30 → **44 検査**。

## Codex 2巡目（PR #916）で直したもの

1巡目の修正が新しい穴を3つ作っていた（うち2つは自分で入れた仕組みに由来する）。

- **P1 退役 token の記憶を上限で捨てていた**。「200 件で表を張り直す」は、**まだ飛んでいる古い操作**を
  忘れうる（忘れた頃に返ってきて、また新しい失敗行を押し出す）。表をやめて**水位線**（`_masterCloudLogGoneMax`）
  にした。落ちるのは常に「いま出ている中でいちばん古い行」なので `token <= 水位線` で判定でき、
  定数メモリで、どれだけ時間が経っても忘れない。
- **P1 削除キーに向き（削除/復元）を含めていた**。含めると「削除が飛行中に復元」が別キーとして
  **同時に飛び**、さらにその後の削除だけが重複として捨てられる。着順次第でクラウドの最終状態が
  「復元」になり、端末の「削除」と食い違う（黙って戻る）。キーから向きを外し、**会員集合ごとに直列化**して
  待ち行列には**最後に要求された状態だけ**を残す。飛行中と同じ状態を頼まれた場合だけ重複として捨てる。
- **P2 合流したのに行のラベルが古い会員名のままだった**。3本目が改名だと、送る中身は3本目なのに
  行の見出しは2本目の名前 ＝ せっかく付けた「どの会員か」が、いちばん紛らわしい場面（連打）で嘘になる。
  `_masterCloudStatusFn` の返す関数に第2引数（ラベル差し替え）を足し、行を増やさずに名前だけ最新にする。

**直さなかったもの（P1・値と touched の対応）**: 「合流で `touched.grade=true` が残ったまま、
☁取得でローカルの grade がクラウド値に戻ると、古い grade を `set_grade=true` で送ってしまう」という指摘。
このとき送るのは**その時点のローカル値**であり、それはクラウドの値と同じなので、書いても何も変わらない
（利用者の修正は push ではなく**その ☁取得の時点で**ローカルから消えている）。`touched` は
「利用者がこの欄を触ったか」を表す旗で、送る値は常に最新のローカル値、という #853 案E の規則どおり。
値と旗を別々に持ち越す方が、かえって「画面に無い値」を送る経路を作る。

反証パネル: 4本の変異（退役の記憶を200件の表に戻す／合流時にラベルを差し替えない／削除キーに向きを戻す／
反対向きも捨てる）すべてで赤を確認。テストは 44 → **55 検査**。

## MEMBER-UPSERT-RPC-001 / bulk: 会員 upsert RPC の一括版（削除・復元 push 用）

Issue #909 の続き（便1 = PR #911 で単数形を追加・本番 Supabase に適用済み）。

### なぜ追加が要ったか

便1 で**単数形の RPC だけ**を作ったが、これは設計の見落としだった。
**削除／復元 push は選択した N 名をまとめて1リクエストで送っている**
（`masterSheetDeleteSelected` / `masterSheetRestoreSelected` が選択行すべてを配列で
`pushMemberDeleteStateToCloud` に渡す。確認ダイアログが「他N名」と出す＝数十名がありうる前提の作り）。

単数 RPC をクライアントで N 回呼ぶと:

- 20 名削除すれば **20 往復**。会場の詰まった回線で明確に遅くなる
- 途中で失敗すると **中途半端な状態が残る**（今日は1文・1トランザクション）

どちらも当日運営で効くので、**server 側で回す**ことにした（作者裁定 2026-08-19）。

### 何を追加したか

`supabase/migrations/20260819090000_member_edit_upsert_bulk.sql`（純追加・冪等）。

`app_upsert_member_edits_bulk(p_club uuid, p_rows jsonb)`

- **判定ロジックを複製しない。** 中身は `app_upsert_member_edit` をループして呼ぶだけ。
  列の保全規則・語彙の whitelist・`deleted_at` の扱いは**単数形の実装1箇所**に置いたまま
  （＝仕様が2箇所に分かれない）
- plpgsql 関数は呼び出し側のトランザクションで走るので、**1行でも raise すれば文全体が
  ロールバックする**＝部分適用が残らない（B5–B8 で実証）
- `p_rows` は**オブジェクトの配列**。キーは単数形の引数と同名。
  `set_*` / `touch_deleted_at` は**省略時 false**（クラウドを壊さない側に倒れる）
- **`member_id` 昇順で回す**（配列順ではない）。受付席と本部席が重なる会員集合を逆順で
  一括操作するとデッドロックしうるため、**全員が同じ順でロックを取る**。
  `with ordinality` の添字を第2キーにして、同じ `member_id` が複数回現れたときの
  **後勝ちは配列順のまま**保つ（Codex P1 r3809573504）
- **未知のキーは raise する。** `touch_deleted_at` を `touch_delete_at` と綴り違いで送ると、
  既知キーが欠けた扱いで既定 false に落ち、**削除が1件も適用されていないのに成功が返る**
  （⚠ すら出ない）。保全側に倒れるからデータは壊れないが、**利用者の操作が届かないことを黙る**
  のが害。既知キーの許可リストで弾く（Codex P1 r3809573508）
- 返り値は **`{count, inserted}` だけ**。per-row の詳細は返さない（Codex P2 r3809573512）。
  jsonb の連結は毎回累積配列ごとコピーするため 1000 件で二次コストになるうえ、
  **呼び出し側がそれを使わない**（削除/復元 push が要るのは件数。属性の実値が要る編集 push は
  単数形を直接呼ぶ）。使わないものを高い代償で作らない
- 上限 1000 件。**到達しうる分岐**なので無言で切り捨てず raise で知らせ、
  **実際に 1001 件を投げて赤を確認**（B18）・1000 件ちょうどが通ることも確認（B19）
- **security invoker**。呼び出す単数形も invoker なので RLS はそのまま効き、権限は一切増えない

### テスト

`test/member_upsert_bulk_pgtest.sh` — **実 PostgreSQL 16.13 で 36 checks・FAIL=0**。

| id | 何を測るか |
|---|---|
| **B1** | ★3名を1回で削除でき、属性は3名とも1バイトも変わらない |
| B4 | まとめて復元でき、属性はやはり保全される |
| **B5–B8** | ★2行目が不正なら文全体が失敗し、**1行目の更新も3行目の新規行も残らない**（部分適用ゼロ） |
| B9–B11 | 新規行は完全な行で入る／`set_*` を立てた欄だけ更新される（単数形と同じ規則が一括でも成立） |
| B12 | 同じ会員が2回現れたら後勝ち（決定的） |
| B13–B17 | 空配列・非配列・要素が非オブジェクト・club 未指定・`p_rows` が NULL は raise。**失敗理由の文言まで一致**を見る |
| B18/B19 | 1001 件は raise・1000 件ちょうどは通る（境界の両側を実際に投げる） |
| B20–B26 | 未ログイン・別クラブは更新できない／anon は `permission denied for function`／SECURITY INVOKER |
| **B27–B29b** | ★綴り違いのキーは raise。**1行でも未知キーがあれば同じ便の正しい行も適用されない** |
| B30 | 既知キーを全部含む行は通る（許可リストが厳しすぎない） |
| **B31** | ★**2セッション並行**。別セッションに `z_a` を掴ませたまま `[z_b, z_a]` の順で投げ、`z_b` に `FOR UPDATE NOWAIT` が通ることで「**入力順ではなく member_id 昇順でロックしている**」を外から観測する |

★ B14/B15 で**文言まで見る**のは、形式チェックを外しても `jsonb_array_length` が非配列で落ちたり
内側の単数形が `member_id` なしで落ちたりして **別の理由で ERR になる**ことを反証パネルで実測したため
（「ERR かどうか」だけのピンは、チェックを消しても緑のままだった）。

### Codex レビュー 1 巡目（`3aa8f0f`）

P1 2 件・P2 1 件・P3 1 件。**すべて直した。**

| 指摘 | 対応 |
|---|---|
| P1 ロック順を正規化し、**2セッションのテストで押さえよ** | `member_id` 昇順＋`with ordinality` の添字を第2キーに。**B31 で2セッション並行を実測**（変異 N9 で赤になる） |
| P1 未知キーは既定に落とさず raise せよ | 既知キーの許可リストで弾く。B27–B30 |
| P2 結果配列を毎回連結すると 1000 件で二次コスト | **per-row の詳細を返すのをやめた**（呼び出し側が使わない）。返り値は `{count, inserted}` |
| P3 コメント内のテストID参照が実物とずれている | `B4`→`B5–B8`／`B7`→`B18・B19`／`B8/B9`→`B22/B24` に修正 |

P1 の1件目は**依頼文でこちらから聞いた論点**で、返答が来るまでの間に実装だけは済ませていた。
ただし当時は「単一セッションでは実デッドロックを再現できない」として**返り値の並び**で代用しており、
Codex の「2セッションでカバーせよ」を受けて**本物の並行テストに置き換えた**（返り値の並びは
P2 対応で消えるので、結果的にこの置き換えは必須だった）。

### 反証パネル

**13 変異すべてが赤・素通りゼロ。**

| 変異 | 結果 |
|---|---|
| N1 行ごとのエラーを握り潰す（部分適用が残る＝本関数の存在理由を殺す） | 赤（B5・B6・B7 ほか計6） |
| N2 `set_*` の既定を true にする | 赤（B1・B4・B12） |
| N3 配列チェックを外す | 赤（B14・B17） |
| N4 `security invoker` → `definer` | 赤（B20・B21・B26） |
| N5 上限チェックを外す | 赤（B18） |
| N6 空配列チェックを外す | 赤（B13） |
| N7 要素のオブジェクト検査を外す | 赤（B15） |
| N8 anon にも EXECUTE を付与 | 赤（B22・B24） |
| **N9 `order by` を外す（入力順でロック）** | **赤（B31）** ＝並行テストが本当に効いている |
| **N11 未知キー検査を無効化** | **赤（B27・B28）** |
| N12 許可リストに未知キーを紛れ込ませる | 赤（B27・B28） |
| N13 `inserted` を常に +1（返り値が嘘になる） | 赤（B3・B10b） |

**N8 で分かったこと**: bulk 側にだけ EXECUTE を付けても、**内側の単数形で
`permission denied for function app_upsert_member_edit` に落ちる**。多層防御が実際に効いている。
B22 はこの「内側で落ちている」状態も赤として検出する（bulk に EXECUTE が付いている疑いとして報告する）。

### ピンできていないもの（正直に残す）

`order by` の**第2キー（`with ordinality` の添字）を外す変異は素通りする**。
PostgreSQL の並べ替えは同キーの相対順を保証しないが、この規模では実際に入力順が保たれてしまうため、
テストからは区別できない。**「テストで観測できない保証」**として、SQL のコメントに理由を残している。

`bash test/run_tests.sh shogi_v4.html` = **PASS=261 / FAIL=0 / WARN=0**（260→261）。

## MEMBER-UPSERT-RPC-001 便2: 名簿編集・削除/復元 push を RPC 化する（送信前の読み取りを廃止）

Issue #909 の3便目（最後）。便1（単数形 RPC）と一括版はどちらも dev マージ済で、
**作者が本番 Supabase へ適用済み**（確認クエリ 6/7 true と 7/7 true）。本便で
アプリが実際に RPC を使い始める。配信ファイル（`shogi_v4.html`）を変更するのはこの便だけ。

### 何が変わったか

| 経路 | 旧（#901） | 新（#909 便2） |
|---|---|---|
| 名簿編集 push `pushMemberEditToCloud` | members を select → 未操作の欄はクラウド値を採用して upsert（**2往復**） | `app_upsert_member_edit` を **1回**呼ぶ（`p_set_*`＝操作した欄） |
| 削除/復元 push `pushMemberDeleteStateToCloud` | members を select → 合成して N 行を upsert（**2往復**） | `app_upsert_member_edits_bulk` を **1回**呼ぶ（`set_*` は渡さない＝既存行の属性は不変） |

「操作した欄だけローカル優先／押し直しも届く／保全した欄は ⚠ で名指し」という #901 の命題は
**そのまま生きている**。変わったのは判定を**どこで**やるか。列の保全規則は
`insert ... on conflict do update set` の set 句に列を挙げるか否か＝**SQL 側1箇所**になり、
クライアントは `touched` をそのまま `p_set_*` として渡すだけになった。

- **穴①が消えた**（読めなかった会員の初回 push が属性 NULL の行を作る）。
  新規行は `excluded`＝端末のローカル値で**完全な行**が入る。実 PG で確認済み。
- **穴②が消えた**（select→upsert の窓で他端末の更新を巻き戻す）。1文・1トランザクションで
  読み取り自体が無いので、競合窓もタイムアウトも**原理的に生じない**。
- 削除/復元は **N 名でも 1 リクエスト・1 トランザクション**。旧実装も 1 回の upsert だったが、
  その前に select が 1 往復あった。合わせて往復は 2 → 1 に減る。
- ⚠ の名指しが**推測から実測へ**。RPC は `returning` で「実際にクラウドへ残った値」を返すので、
  端末の表示と違う欄を実値で名指しできる（新設の純関数 `_editAttrKeptLabels`）。

### 消したもの / 残したもの

**消した**（呼び出し元が無くなった）:
`composeEditPushFieldCols`（規則は SQL 側へ移った）／`_withReadTimeout`／
`EDIT_ATTR_READ_TIMEOUT_MS`／`EDIT_ATTR_UNREAD_NOTE`／`DELETE_ATTR_UNREAD_NOTE`。

★ **便1 の断片に「`_fetchCloudMemberAttrs` も便2で削除」と書いたのは誤りだった。**
grep で実測したところ、この関数と `CLOUD_ATTR_UNREAD_NOTE` は
**☁送信経路（#853・`sendTournamentToCloud`）でも使われている**。消すと #853 が壊れる＝**残す**。
`composeCloudMemberFieldCols` / `_cloudMemberFieldCols` も☁送信・一括送信が使うので残す。

### `p_set_*` の決め方（Codex 1巡目 P1 r3810188007 で作り直した）

`p_set_*` は **「この端末がその欄について情報を持っているか」**で決める（新設の純関数 `_editPushSetFlags`）:

| 状態 | `p_set_*` | 理由 |
|---|---|---|
| その保存で操作した | **true** | 既定値方向の訂正（女性→一般・その他→支部員）もここで届く＝#901 の本題 |
| 操作していないがローカルが非既定値 | **true** | #853 案E＝「非既定値だけが人が明示的に入れた情報だと確実に言える」 |
| 操作しておらずローカルも既定値 | **false** | 既定値は「未設定」と区別できない＝情報を持っていない |

★ **最初の版は「操作した欄だけ true」にしていた。これは退行だった**（Codex P1 で指摘）。
クラウドの旧行（属性列を持つ前に作られた行）が `grade=NULL` で端末に明示的な `josei` がある会員の
氏名だけを直すと、その列を送らない＝**NULL のまま成功表示だけが出る**。別の端末がその行を取ると
`mergeCloudMembersIntoMaster` は NULL を読み飛ばし、`normalizeBranchMaster` が `ippan` へ確定する
＝**会費の誤徴収が別経路で復活する**。#901 の `composeCloudMemberFieldCols` はここをローカル値で
埋めていたので、落とせば退行になる。**警告を足すのではなく、書く側を直した。**

逆側（既定値で NULL を埋める）は今も禁じている。既定値を書くと「未設定」が「既定値だと主張した」に
変わり、その後の下り merge で別端末の実値（`other`／`josei`）を上書きしうる＝#853 の本題そのもの。

したがって残る挙動差は「**端末も既定値・未操作の欄は、クラウドが NULL なら NULL のまま**」だけ。
この場合どの端末も同じ既定値を表示するので食い違いは生じない（C8/P50/P51 で固定）。

### テスト

- `test/test_member_edit_touched_cols_901.js` **94 checks**（旧 72）。C 節は
  `composeEditPushFieldCols` の真理値表から `_editAttrKeptLabels` の真理値表へ差し替え。
  P/D 節の mock は **RPC の契約そのものを実装**する（set_* が false の列は既存値を残す）＝
  「RPC を呼んだ」ではなく「クラウドの実値が潰れないか」を測り続ける。
- `test/test_master_sheet.js` **87 checks**。`rpc` を**名前で分岐する mock** に変更。
  名前を見ずに常に club 行を返す mock だと会員 upsert の戻りまで club 行になり、
  ⚠ が出ない縮退パスで緑になる。
- `test/e2e/member_edit_touched_cols_901.e2e.js` **15 checks**（実ブラウザ）。
  実 DOM で氏名セル→編集パネル→セグメント押下→保存まで通し、RPC 引数と
  「クラウド側に残った行」を捕まえる。
- 全量 `bash test/run_tests.sh shogi_v4.html` = **PASS=261 / FAIL=0 / WARN=0**（baseline 維持）、
  `bash test/run_e2e.sh` = **14/14 スイート PASS**。
- SQL 側は無改変。回帰確認として実 PG 16.13 で `member_upsert_rpc_pgtest.sh` **35/0**、
  `member_upsert_bulk_pgtest.sh` **36/0** を再実行。
- ★ **mock が実 RPC と同じ答えを返すことを実 PG で突き合わせた**（モックの自己申告で終わらせない）。
  クライアントが実際に送る引数をそのまま実 PG へ流した結果:
  - 編集 push（ふりがなだけ変更・`set_*` 全 false）→ `{"inserted":false,"member_kind":"other","grade":"josei","city":"沼津市"}`
  - 削除 push（bulk・既定値の欄は `set_*` false・`touch_deleted_at: true`）→ `{"count":1,"inserted":0}`
    かつ行は `other/josei/沼津市` のまま `deleted_at` だけ入る
  - **Codex P1 の修正後**、旧行（全列 NULL）へ非既定値の端末値を `set_*: true` で送る
    → 行は `other/josei/三島市` になる（実 PG で確認）
  - 同じ旧行へ既定値を `set_*: false` で送る → 行は **NULL のまま**（実 PG で確認）

  いずれもテストの mock の戻りと一致した。

## SHELL-MB-VARNAME-001: `$var` の直後の全角文字を機械で禁じる（bash 3.2 互換）

軽車線。**#909 便2 の bundle 受け渡しが実際にここで止まった**ので、その場で塞いだ。

### 何が起きたか

作者機（macOS 既定の **bash 3.2**）で `bash scripts/land.sh --once --include-existing` が

```
scripts/land.sh: 行 228: _name?: 未割り当ての変数です
```

で停止した。228 行は `say "検出 $_name（${_s2} bytes）"`。`_name` は 34 行前で代入済みなのに
「未割り当て」と言われるのは、**bash 3.2 が UTF-8 ロケールで高位バイトを変数名に取り込む**ため
（`$_name` ではなく `$_name` + `（` の先頭バイト を1つの変数名として読む。エラー表示の `_name?`
の `?` がその食われたバイト）。**cloud / CI の bash 5 では再現しない**＝全量テストが緑のまま
作者機だけが壊れる、POSIX BRE と同類の「そこでしか見えない互換差」。

この規約は `test/test_bulk_inline_error_pins_887.sh` のヘッダに
「実測: 作者機 macOS で `$EXPECT_PASS）` が落ちた」として**すでに書かれていた**。
書いてあったのに再発したのは、**守らせる機械が無かった**から。

### 直したもの

- `scripts/land.sh` … 8 箇所を `${var}` へ（6 行。表示文字列だけで**挙動は変えない**）
- `test/test_land_script_001.sh`（1 箇所）／`test/test_mutation_cache_001.sh`（3 箇所）…
  いずれも **失敗時にしか通らない `ng` 行**にあった＝本当に失敗した日に、真の失敗内容ではなく
  変数エラーで死ぬ形だった
- **`test/test_shell_multibyte_varname_001.js` を新設**。git 追跡下の `*.sh` を全走査する

### ★ 検査器は Codex 2巡（P2 計 10 件）で**設計ごと**作り直した

| 版 | 実装 | 出た指摘 |
|---|---|---|
| 初版 | bash + `awk` + `grep -P` | **3件**。うち致命は「**`grep -P` は macOS の BSD grep に無い**＝この不具合の対象である作者機では走査も自己検査もせず `exit 0`。しかもヘッダの『perl 相当の代替へ落ちる』は**実装が存在しなかった**」（r3810168495） |
| 2版目 | Node の簡易トークナイザ（引用・ヒアドキュメントを追う） | **7件**。多重ヒアドキュメント `cat <<A <<B`／`$((1 << 2))` をヒアドキュメント開始と誤認／`<<E'OF'` の混在引用区切り語／本文の `\$`／`$(...)` の入れ子引用／`$'...'` の `\'`／バックスラッシュ改行後と `x)# ...` の `#` |
| **3版目（本 PR）** | **シェルを解析しない**＋行単位の明示免除 | — |

2版目の7件はどれも当たっている。ここで**方針そのものを疑った**: この検査に必要なのは
シェルの意味論ではない。**失敗の非対称**を見ると答えが出る。

- **見逃し**（展開される場所を素通り）＝作者機だけが壊れ、CI は緑。**気づけない**
- **過検出**（展開されないリテラルを赤にする）＝赤くなって目に入る。**気づける**

したがって **見逃しゼロを構造で保証する**側に倒した:

1. `$name` の直後が非 ASCII なら、**文脈を問わず**違反（解析なし＝壊れる余地が無い）
2. 展開されない場所で本当に必要なら、その行に **`mb-ok: <理由>`** を書いて免除する
   （理由が無いマーカーは免除にならない＝黙って無効化させない）
3. **免除した行数と場所を毎回表示する**（silent cap を作らない）

過検出のコストは実測で **1 行**（追跡下の `*.sh` 30 本のうち、免除が要るのは
`test_bulk_inline_error_pins_887.sh` の「この不具合そのものを説明しているコメント」だけ）。

★ **網羅的な正しさは捨てている。** `printf '%s' '$var（'` のような展開されないリテラルも
赤くなる。これは仕様であって不具合ではない。直し方は `${var}` にする（展開される文脈では
出力が変わらない）か、リテラルを変えたくないなら `mb-ok:` を書く。
Codex が2巡目で挙げた「将来この不具合を説明する fixture やメッセージを普通の `.sh` に
追加できない」という懸念は、この免除マーカーが**明示的に**引き受ける。

外部コマンド（`grep -P` / `awk` / `perl`）への依存が無くなったので、
**作者機で「何も検査せず成功」になる分岐が存在しない**。

### ★ 3巡目でさらに2つの**見逃し**が出た（「解析しないから見逃しゼロ」は言い過ぎだった）

3版目のヘッダに「解析なし＝壊れる余地が無い」と書いたが、Codex 3巡目（P2 ×3）が
**見逃しを2件**見つけた。方針は正しかったが、**その方針だけでは見逃しゼロにならない**。

| 指摘 | 中身 | どう直したか |
|---|---|---|
| r3810651486 | **バックスラッシュ改行**。`echo "$V\` ＋次行 `（"` は、bash が引用解析の**前に**継続行を除去するので実質 `$V（`。行ごとに見るとどちらの行にも一致せず**見逃す** | 継続行を結合した「**論理行**」で検査する（`logicalLines`）。行末のバックスラッシュが**奇数個**のときだけ継続（`\\` は除外）。違反の行番号は論理行の**先頭の物理行**で出す |
| r3810651493 | **免除マーカーの衝突**。行内のどこでも認めると `printf 'mb-ok: reason' "$V（"` のような**マーカーの説明を含むだけの行**が丸ごと免除され、普通のメッセージを足すだけでゲートに穴を空けられる | **行末の `#` コメント**として置かれた形だけを認める（`/\s#\s*mb-ok:\s*\S[^\n]*$/`） |
| r3810651500 | **免除件数が CI ログに出ない**。`run_tests.sh` の `run_suite` は成功時の出力を一時ログへ捨てて**最終行だけ**表示するため、途中の `console.log` は自動発見経路に現れない。しかも件数に pin も上限も無いので、免除が増えてもスイートは緑のまま | (a) 件数を **pin**（`EXPECT_EXEMPT = 1`・増えたら赤）、(b) **最終行にも載せる**（`… PASS=16 FAIL=0 免除=1/1`） |

**見逃しゼロは「解析をやめれば自動的に手に入る」ものではない。**
入力の正規化（行の結合）と免除の厳密化まで含めて初めて成り立つ。ヘッダの記述も直した。

残る限界も明記した: `echo "$V（ # mb-ok: x"` のように**二重引用符の中で行末までその形を書く**と
免除に化ける。偶然では起きず意図的に書く必要があり、塞ぐにはシェルの引用解析が要る
（それをやめたのがこの版の主旨）ので受け入れる。

### ★ 4巡目: 「結合すればよい」も間違いだった（P2 ×1）

3版目→4版目で入れた「継続行を結合した論理行で検査する」に、Codex がさらに穴を出した
（r3810831853）。**単一引用符の中のバックスラッシュは継続として働かない**のに結合するため、
**後ろの物理行にある免除マーカーが、前の物理行の本物の違反まで免除する**。
つまり「結合」は見逃しを1つ塞いで別の見逃しを1つ開けていた。

引用状態を見ずにこれを塞ぐため、**2段構え**にした:

- **① 物理行ごとに検査する。** 免除は**その物理行自身の行末マーカー**でしか効かない
  → 別の行のマーカーが漏れてくることが原理的に起きない
- **② 継続の境界をまたぐ形だけを追加で検査する**（結合してはじめて現れる hazard）。
  免除は継続先の行末マーカー。3行以上の連鎖は累積して境界ごとに見る

**①だけでも②だけでも穴が残る。両方あって初めて塞がる。**

### ★ 5巡目: ②の判定条件がまだ見逃していた（P2 ×1・ここで打ち切り）

②の条件を当初「`prev` に hazard が無いこと」（＝行内で既に見たものを二重報告しない）にしていたが、
Codex がこれを破った（r3811132507）。**免除済みのコメント行が `\` で終わる**と、その hazard が
`prev` に残り続けるため、**その後に実際にできる境界の違反を捨てる**。

```
# $A（ # mb-ok: 説明 \
echo "$V\
（"
```

1行目は免除、2〜3行目の境界にできる `$V（` は本物なのに、`!HAZARD.test(prev)` が偽なので報告されない。
各物理行にも単独では現れないので、**ゲートが緑のまま bash 3.2 で落ちるスクリプトが通る**。

→ 境界の判定を「**継ぎ目だけを見る**」形に変えた: `prev` が `$name` で終わり、次の片が非 ASCII で
始まるか（`ENDS_NAME` / `STARTS_NONASCII`）。他の行の hazard と互いに干渉しない。
**旧判定に戻すとこの新しい自己検査が赤になる**ことを実測（PASS=19→18 / FAIL=1）。

### 正直な到達点（打ち切りの根拠と残余リスク）

**5巡連続で見逃しが見つかった。**「解析しないから見逃しゼロ」は成り立たなかった。
この検査器は**経験的に不完全**である。それでも入れる理由:

- **今日の実害**（`scripts/land.sh` 228 行）は確実に赤にする。変異で毎回確かめている
- **外部コマンド依存が無い**＝作者機で「何も検査せず成功」になる分岐が存在しない（初版の致命傷）
- 見つかった見逃しはいずれも**より奇矯な形**へ移っており、実運用のコードで踏む確率は下がっている

残余リスク（承知のうえで残す）:

- 二重引用符の中で行末まで `# mb-ok: …` の形を書くと免除に化ける（意図的にしか書けない）
- 引用状態を見ないので、**まだ知らない形の見逃し**が残っている可能性がある

**6巡目は回さない。** 6行の表示文字列修正＋検査器1本という規模に対し、
5巡（約2時間）は既に過大。以後に見逃しが見つかったら**その時点で1件ずつ足す**。

### この pin が空振りしていないことの確認

- **修正前の `scripts/land.sh` に当てると 6 行すべてを名指しして FAIL / rc=1**（**受け渡しを
  止めた 228 行が出る**）。修正後は PASS=18 / FAIL=0 / rc=0
- **免除マーカーを消す変異**では**2本**赤くなる（違反 1 件＋件数 pin の不一致）
- 自己検査 **17 ケース**を毎回その場で当てる。過検出を**仕様として固定**しているのが要:
  二重引用符（違反）／単一引用符も違反／コメントも違反／ヒアドキュメント本文も違反／
  行末 `# mb-ok:`＋理由（免除）／理由の無いマーカーは免除しない／
  マーカー文字列が行内にあるだけでは免除しない／バックスラッシュ改行で分断されても違反／
  **★後ろの行のマーカーは前の行の違反を免除しない**／**★継続境界にできる違反は継続先のマーカーで免除できる**／
  **★免除行が継続しても後続の境界違反を見逃さない**／
  `${var}`（違反でない）／直後が ASCII（違反でない）／`$1（` は対象外／
  免除を件数として数える／**land.sh 228 行の実物の形**
- **対象 0 件なら失敗**にする（緑と「何も検査していない」を区別できない状態を作らない）

### テスト

| 検証 | 結果 |
|---|---|
| `bash test/run_tests.sh shogi_v4.html` | **PASS=262 / FAIL=0 / WARN=0** |
| `bash test/test_land_script_001.sh` | **PASS=39 / FAIL=0** |
| `bash test/test_mutation_cache_001.sh` | **PASS=54 / FAIL=0** |
| `bash test/test_bulk_inline_error_pins_887.sh` | **PASS=87 / FAIL=0** |
| `node test/test_shell_multibyte_varname_001.js` | **PASS=19 / FAIL=0 免除=1/1** |

### 併走スライスとの関係

変更ファイルは `scripts/land.sh` / `test/test_land_script_001.sh` /
`test/test_mutation_cache_001.sh` / `test/test_bulk_inline_error_pins_887.sh`（コメント1行）/
新規テスト1本 / 本断片のみ。**#909 便2（PR #913・merge 済 `097a1da`）とは1ファイルも重ならない。**

# E2E-INSTALL-GUARD-001（#918）E2E のブラウザ導入に上限付き再試行を入れる

## 何が起きていたか（ステップ別の実測）

同じ commit（PR #917 の `528dd78`）で E2E ジョブの結果が2回とも違った。ステップ別の時刻を取ると、
遅かったのは**テストではなくブラウザの導入**だった。

| ステップ | job 96122380273 | job 96369763890 |
|---|---|---|
| Install dependencies (`npm ci`) | 1秒 | 1秒 |
| **Install Chromium** | **15分05秒 → cancelled** | **21秒** |
| Run E2E suites | **skipped** | 3分54秒 |

`npx playwright install --with-deps chromium` が15分ぶら下がり、そこでジョブごと打ち切られていた。
**E2E スイートは1秒も走っていない。**

## なぜ放置できないか

`cancelled` は「テストが赤」「単に遅い」「外部が詰まった」を区別できない。さらに
`AUTO-MERGE-GATE-001` は conclusion が `SUCCESS` 以外を停止条件にする（P1-2）ので、
**自動マージが外部要因で黙って止まる**。

## どう直したか

打ち切りと再試行を**そのステップの中に閉じ込めた**。

- `timeout 240` で括り、最大2回試す（秒数と回数は step の `env` に置き、テストが読み取れる一箇所にまとめた）
- 打ち切り（終了コード 124）とそれ以外の失敗（apt のエラー等）を**区別して**ログに出す
- 使い切ったら `::error::` で原因を名指しして落ちる。文面に「E2E は実行していない＝テストの赤ではない」と書く
- ジョブ上限 15 → 20 分（最悪ケース 2×240＋予備600 = 1080 秒が収まる）

15分の沈黙が「240秒で終わらなかった、やり直す」というログに変わる。

## テスト

新規 `test/test_e2e_install_guard_918.js` … **23 検査**。

- **数字の整合**: `env` とシェル既定値が一致するか、再試行が2回以上か、そして
  **最悪ケース（回数×秒数＋予備）がジョブ上限に収まるか**を計算で固定する。
  予備 600 秒は実測（checkout 1 ＋ Setup Node 7 ＋ npm ci 1 ＋ E2E 234 = 243 秒）の倍以上。
  片方の数字だけ動かすと赤くなる＝「再試行を増やしたら枠を超えていた」を防ぐ。
- **動作**: workflow から `run` ブロックを抜き出して実際に走らせる。ぶら下がる `npx` ／
  即失敗する `npx` ／成功する `npx` ／2回目で成功する `npx` の4通りで、
  終了コード・所要時間・警告の回数・ログの文面を見る。

★ `timeout` は macOS 既定に無い。無い環境で検査を飛ばすと「守っているつもりで何も検査していない」
になる（#914 で `grep -P` を使って実際にそれを踏んだ）。ここでは**必ず自前の shim を PATH に置いて**
動かし、どの機械でも同じ経路を通す。

### 反証パネル（8本すべて赤を確認）

`timeout` を外す／再試行をやめる／env とシェル既定値を食い違わせる／使い切っても落ちない／
再試行を増やして枠を超える／ジョブ上限を 15 に戻す／打ち切りとそれ以外を区別しない／1行 `run` に戻す。

## 進め方の記録

この issue は最初、「変異チェックが遅いのだろう」という**推測**で選択肢を4つ並べて起票していた。
ステップ別の実測を取ったら4つとも的外れで、原因は1つ前のステップだった。
**測る前に手を動かしていたら、丸ごと無駄になっていた。** #918 の本文にも経緯を残してある。

## 残っている観察（このスライスでは扱わない）

`test/run_e2e.sh` にはスイート単位のタイムアウトが無い。今回の原因ではなかったが、
1本ハングすればジョブごと枠を燃やす構造は同じ。必要になったら別 issue で。

## Codex 1巡目（PR #919）で直したもの

2件とも実在で、**1件は修正そのものを無効化していた**。

- **P1 GitHub の `run` は既定で `bash -e`**。`set -u` は errexit を解除しないので、`timeout` が非0を
  返した瞬間にステップが終わり、**`_rc=$?` も警告も2回目も最後の診断も1行も走らない**＝
  入れたはずの再試行が死んでいた。`shell: bash` を明示し、`set +e` で errexit を切ってから
  終了コードを見るように直した。
  ★ わたしのテストがこれを見逃した理由は、抽出した `run` ブロックを**素の `bash script.sh`** で
  走らせていたから。本番は `bash --noprofile --norc -eo pipefail`。**テストの環境が本番と違えば、
  テストは本番の欠陥を見ない。** ランナーと同じフラグで走らせるよう直した。
- **P2 `timeout` はまず TERM を送るだけ**。TERM を無視する子が居ると上限を過ぎても走り続け、
  結局ジョブ上限まで戻ってこない（＝直したはずの事象がそのまま起きる）。`--kill-after=30` で
  硬い締め切りを付け、KILL まで行った場合の終了コード 137 も時間切れとして扱う。
  ★ ここもテストが見逃していた。shim が**無条件に SIGKILL** していたので、GNU timeout より
  優しくない＝この穴を再現できなかった。shim を GNU の順序（上限で TERM → `--kill-after` 後に KILL・
  終了コード 124/137）に合わせ、「TERM を無視する npx」のケースを足した。

最悪ケースの計算も `回数×(上限＋kill-after)＋予備` に更新（2×(240+30)+600 = 1140 秒 ≤ 1200 秒）。
テストは 23 → **32 検査**。

### 反証パネル（追加8本すべて赤を確認）

`set +e` を消す／`--kill-after` を外す／137 を扱わない／`shell: bash` を消す／
kill-after を env とシェルで食い違わせる／再試行を増やして枠を超える／`timeout` ごと外す／
使い切っても落ちない。

`set +e` を消す変異では **11本のピンが同時に赤**になる。1巡目の指摘がいかに中心的だったかがそのまま出ている。

## REPO-BUNDLE-HYGIENE-001: 追跡されたままの受け渡し用 bundle を撤去

- repo 直下に tracked のまま残っていた `phase1_master_rebuild.bundle` / `phase1_p3.bundle` /
  `preset_history.bundle`（計 38KB・すべて着地済みの受け渡し物）を削除。内容は git 履歴に残る。
- `.gitignore` の `/*.bundle` は untracked のものにしか効かない。**無視規則があること**と
  **いま追跡ゼロであること**は別の命題なので、後者を測る `test/test_no_tracked_bundles.sh` を新設。
- 同テストは「追跡ゼロ」が空振りしやすい形であることを踏まえ、同じ検査関数を
  bundle を1本コミットした使い捨て sandbox repo にも当て、**検出できること・追跡を外すと
  0 件に戻ること**をテスト自身の中で確かめる。検査が盲目になると C1/C2 が赤くなる。
- 反証パネル3本すべてで赤を確認（追跡 bundle を戻す→A1／`/*.bundle` を消す→B1／
  検査パターンを落とす→C1・C2）。
- 編集範囲は上記 bundle 3本の削除・新規テスト・本断片のみ。`shogi_v4.html` / `app/` /
  `test/run_tests.sh` / `.github/` は無変更。

## BULK-EDIT-ALL-ERRORS-001 (#889): 名前一括編集のエラーを全件出す

- 名前一括編集の保存時、空欄も重複も `break` で**最初の1件だけ**報告していた。16名中5名が空欄でも
  出るのは1件目だけで、直して保存を5回繰り返すことになっていた（32名クラスの当日運営では詰む）。
  走査を止めるのをやめ、**全件を1回の表示にまとめた**。
- 重複は名前しか言わず「16行のうちどれとどれか」を目で探す必要があった。**両方の行を名指しする**
  ようにし、相手が他クラスならクラス付きで出す（`A03 と B02 の "丁" が重複しています。`）。
  同じ組は i/j の入れ替えで2回見つかるので、順序を固定した鍵で1回にまとめる。
- 空欄と重複が同時にあるときは**両方**出す（保存し直しが1回で済む）。件数の上限は掛けない
  （32名全員が空欄でも省略しない。実 Chromium で `.bulk-card` の 80vh 内に収まることを測定済み）。
- ★ **保存を拒否する条件は不変**。空欄が1つでもあれば拒否・重複が1つでもあれば拒否のまま。
  変えたのは報告だけ。正常な入力が従来どおり保存できることを e2e で固定する。
- ★ 空欄の行は重複の相手からも自分からも外す。旧名で照合すると「空欄を埋めれば消える重複」を
  報告してしまう（拒否は空欄側で既に決まっているので判定は不変）。
- 他クラスの行ラベルは `allRegisteredPlayers()` の連結後には作れない（クラスが落ちる）ため、
  `registeredPlayerLabels()` を追加してクラスを保ったまま id→ラベル表を1回で作る。
- 器（画面内スロット・§3 N5・`white-space:pre-line`）は #887 のものをそのまま使う。native alert は
  引き続きゼロ。#887 の pin・e2e は文言の変わった1件（重複の行名指し）だけ更新した。
- テスト: `test/test_bulk_all_errors_pins_889.sh`（静的 pin 7本・4段の自己検査）と
  `test/e2e/bulk_all_errors_889.e2e.js`（実ブラウザ 24 検査）を新設。変異8本すべてが
  **e2e を赤にする**ことを実測（空振りゼロ）。
- ★ 実測で見つけた設計ミスを1つ畳んである。空欄照合のガードを自分側・相手側の2か所に置いたところ、
  **2つは互いに冗長で片方を外しても e2e が緑のまま**だった。検査できないガードは残さない方針で
  1つに絞ってある（外すと E9b が赤くなる）。
- 編集範囲は `shogi_v4.html` の保存ハンドラ＋新規 helper・新規テスト2本＋生成器・#887 側の錨の
  張り替え・本断片のみ。`test/run_tests.sh` / `.github/` / `app/` は無変更。

## BULK-EDIT-DIALOG-001 (#888): 名前一括編集モーダルに dialog の作法と閉じ口を入れる

- 一括編集モーダルには `role` / `aria-modal` も背後の `inert` も無く、**Tab 6回でモーダルの外へ出た**
  （実測: BODY → 星取表 → 保存 → メニュー → タブ…）。そこで Enter を押すと、編集中の名前を抱えたまま
  見えていない操作が動く。#837 が対戦相手変更モーダルに入れた作法をそのまま移植した。
- `role="dialog"` / `aria-modal="true"` / `aria-labelledby`（見出しを指す）を付け、開いている間は
  body 直下の兄弟に `inert` を付ける（**元から inert のものは触らない**）。`inert` 非対応環境のために
  Tab / Shift+Tab の巻き取りも併せて持つ。
- ★ 一括編集は**未保存の入力を大量に抱える**ので、閉じ口は作者裁定で決めた:
  - **Esc** … 触っていなければそのまま閉じる／触っていれば `appConfirm` で確認する
  - **背景クリック** … 閉じない（スマホで指が当たりやすく、誤爆の代償が大きい）
  - **キャンセルボタン** … 従来どおり確認なしで閉じる（この便では挙動を変えない）
- 閉じ口を `closeBulkEditModal()` に一本化した。DOM を消すだけでは `inert` / `keydown` /
  visualViewport 追従（#887）/ フォーカス戻しが残る。保存・キャンセル・リセット2経路・開き直しの
  すべてがここを通る。
- ★ 変数名・関数名は `_chg…` と別にしてある。同名にすると #881 の変異生成器が
  「置換元の出現回数=2」で落ちる（#887 で実測済みの罠）。
- テスト: `test/e2e/bulk_modal_dialog_888.e2e.js`（実ブラウザ 31 検査）。
  セマンティクス・inert・Tab 循環・Esc の2分岐・確認中の割り込み回避・フォーカス戻し・
  4つの閉じ口・開き直し・自己修復を測る。#837 の `chg_modal_focus_837.e2e.js` は**無改変で 27/27 緑**。
- ★ 実装中に自分の順序バグを1件踏んで潰した。`_bulkModalFocusReturn` を掃除より**先に**代入すると、
  `closeBulkEditModal()` が後片付けの一環で null に戻すためフォーカスが body へ落ちる。
  掃除を先に通してから戻し先を拾う順序に直し、この順序バグを変異 N11 として固定した。
- 編集範囲は `shogi_v4.html` の一括編集モーダル周辺・新規 e2e・変異生成器・本断片のみ。
  `app/` / `index.html` / `.github/` / `test/run_tests.sh` は無変更。他モーダル
  （`edit-past-modal` / `load-modal`）は同じ状態だが**この便では触らない**（別 issue で起票）。

## CHG-MODAL-REPLACE-REMATCH-001 (#884) / CHG-MODAL-FULLHOUSE-HINT-001 (#883): 対戦相手変更モーダルの案内を実態に合わせる

同じ `buildChangePairingModalHtml` / `classifyChangePairingCandidate` を触るため 1 スライスにまとめた。
**どちらも「選べる候補」を1件も変えていない**（塞ぎを増やさない・保存の挙動も文言も不変）。

### #884: replace で再戦になる候補が「選ぶ前」に分かるようになった

- 同じモーダルの中で、再戦を幹事が知るタイミングが経路で違っていた。
  **swap**（候補が別の卓にいる）は「（再戦になる）」と出て**選べない**のに、
  **replace**（候補が待機中）は無印の「選択可能」に並び、**保存を押すまで分からなかった**。
  実測 = replace 候補の 22.5%（#884 §2）。幹事から見ると「灰色でない候補＝安全」と読める。
- 塞がずに**印だけ**足した（作者裁定 2026-08-14 案2）。ラベル末尾に「（対戦済み）」＋ `data-warn-id`。
  ★ blocked 側の「（再戦になる）」とは**別の語**にしてある。同じ語だと「選べないほう」と見分けが付かない。
- ★ **塞がなかった根拠は実測**（#884 のコメント表）。swap と同じく blocked にすると、回戦が進んだ盤面で
  「その役では何も選べない」役が 2〜8 件、卓ごと操作不能が 80 卓中 1 卓 出る
  ＝ #883 の「満席で詰む」と同じ副作用を再戦側で作ることになる。
- 実装は `classifyChangePairingCandidate` の replace 分岐に `warnId` / `warnLabel` の**2キーを足すだけ**。
  `status` は `'ok'`・`reasonId` は `null` のままなので、既存の `status==='blocked'` 判定・`okCount`・
  `hasAlternative`・保存ボタンの活殺は 1 ビットも変わらない。
- 判定は保存時 confirm と**厳密に同じ 1 項** `pairHasRematch(cls, keepPlayer, X)`。
  swap の第2項は replace に存在しない＝**候補本人が必ず再戦の当事者**なので、#838 が問題にしている
  「無関係な候補を主語にする」は起きない（#838 の決着を待たずに出せる根拠・実測で確認済み）。
- **保存時の `appConfirm` は文言も挙動も無改変**（`test/run_tests.sh` の grep pin もそのまま）。

### #883: 候補ゼロの案内が、原因を言い分けるようになった

- 満席（待機者ゼロ）＋棄権者ありの卓では、このモーダルから棄権者を外せない（#880 の規則の帰結で、
  出口は「組み合わせを再生成」に存在する）。出ていた案内は汎用文だけで、
  **当日の幹事が「棄権した人を外したい → 再生成すればいい」に辿り着けるか**が論点だった。
- ★ ただし **「この案内が出ている＝棄権が原因」ではない**。棄権ゼロでも候補ゼロになる盤面がある
  （6名3卓・満席・棄権ゼロ・相手卓が結果入力済 → `R-winner-locked` だけで塞がる）。
  無条件に棄権を名指しすると嘘になるので、`buildSelectInner` が**理由別の内訳**を返すようにし、
  **内訳がすべて棄権系のときだけ**文言を差し替える。`data-chg-empty-cause` で外から判別できる。
- ★ 判定から `R-self`（反対側の役の現在値）を**除く**。除かないとこの分岐は盤面によらず永久に false で、
  足した文言が一度も出ない＝「緑だが何も測っていない」検査になる（変異 V-C で固定した）。
- ★★ **理由の内訳だけでは足りない**。反証レンズが実測で反例を出した:
  3名・卓「選手1 × 選手3」・選手2 が棄権して**待機**のとき、先手の内訳は `R-self` と `R-withdrawn` だけ
  ＝「棄権系のみ」に見えるが、**この卓に棄権者は1人も座っていない**。初版はここで棄権を名指ししており、
  文の3節すべてが偽（卓に棄権者は居ない／全員が卓に入っていない／再生成しても待機の棄権者は元から卓に入らない）。
  当日の幹事を**全卓を作り直す破壊操作へ誤誘導する退行**だった。スイープ実測で誤検知 16.4%〜100%。
  → **この卓に棄権者が座っていること**（`isWithdrawnPlayer(match.p1) || isWithdrawnPlayer(match.p2)`）を
  別途要求する形に直した。同スイープで誤検知 414→0 件・正しい発火は1件も減らない。変異 V-I で固定。
- ★ 「全員が卓に入っているため」とは書かない。棄権者が待機に居ると偽になるため
  （`R-withdrawn` が内訳に混じる形）。`hasAlternative===false` が保証しているのは
  「代わりに入れられる候補が無い」ことだけなので、そう書く。
- ★★ **もう1件、同じ型を Codex が掘った（P1・2026-08-21）**: 案内文の最後の1節
  「「組み合わせを再生成」で外してください」は、**再生成が実際にその棄権者を外せる盤面でしか真にならない**。
  `generatePairing` は棄権者を除いた人数が 2 未満だと `state.pairings[cls]` を**上書きせずに return** する
  （`if(players.length<2)return;`）。実測（3名・p1 が現役／p2 が棄権して着席／p3 が棄権して待機）:
  **再生成の前後とも卓は `p1 × p2` のまま**で、案内どおり押しても何も起きない。
  → 4つ目の条件 `_regenCanRemove`（現役が2人以上）を足した。変異 V-M で固定。
  数え方は `generatePairing` の filter と**同じ述語**（`p.withdrawn`）を使う（別窓口だと取り違えが起きる）。
- ★ ホワイトリストから `R-withdrawn-partner`（棄権者が**相手の卓**に居る）を外した。この理由に到達するのは
  currentInRole も otherInRole も棄権でないとき＝**この卓に棄権者が居ない**ときだけで、上の卓ガードと
  同時に成立しない。入れておくと「外しても誰も赤にできないホワイトリスト項目」＝白紙票になる。
  残る3件は V-J / V-K / V-L でそれぞれ赤にできることを確認済み。
- 導線ボタンは**置かない**（作者裁定 2026-08-21）。再生成は全卓を作り直す破壊操作で、
  既存の `repairBtn_` 側に確認モーダルがある。モーダルから直接叩けるようにはしない。
- 器（`data-chg-empty-notice` / 色 / 保存ボタンの活殺）は無改変。#881 の既存 e2e の E セクション
  （2名1卓・棄権なし）は**そのまま汎用文**で緑のまま。

### テスト

- `test/test_chg_modal_hints_883_884.js`（47 検査）。
  - #884 は **9名 × 30 draw の総当たり**（2,160 セル）を、実装の関数ではなく `state.results` を
    直接読む**独立判定**と突き合わせる。再戦 replace 候補 95 件の 100% に印／非再戦 145 件に 0 件。
  - ★ **0 件の照合を失敗にする**（対象が 0 件しか出なければテスト自体が赤）。
  - #884-3 / #884-4 の「前後で 1 件も変わらない」は、**同じソースに逆パッチを当てた版**をメモリ上に
    組み立てて「前」とし、2,160 セルの `status` / `reasonId` を全数突合する（差 0 件）。
    ベース commit を `git show` で取りに行く形は `--filter=blob:none` の clone で偽 FAIL になるため採らない。
  - ★★ **印は `classify` の戻り値ではなく、描画された `<option>` の HTML で測る**（E 群）。
    初版は候補ゼロ案内の div しか読んでおらず、反証レンズが「**UI に『（対戦済み）』が1文字も出ない版**が
    22/22 緑を通過する」ことを実測した＝受け入れ基準の可視部分を誰も測っていなかった。
    いまは同じ盤面の中に陽性（先手の p3＝再戦）と対照（後手の p3＝再戦でない）が同居する形で、
    ラベル・`data-warn-id`・`disabled` でないこと・optgroup・blocked と別語であることを突合する。
  - 変異はこのファイル内で当てる（13 本）。**V-A** 印を外す→A1 が赤／**V-B** 常に印→A2 が赤／
    **V-C** `R-self` を除かない→C1 が赤／**V-D** 常に棄権扱い→C2・C3 が赤／
    **V-E** replace を blocked にする→**B1 が赤**（B1 が「緑か例外か」の恒真でないことの実証）／
    **V-F** 描画側で印を落とす→E1／**V-G** `data-warn-id` を出さない→E2／
    **V-H** blocked と同じ語にする→E6／**V-I** 卓の棄権者を見ない→F1／
    **V-J/K/L** ホワイトリスト3件をそれぞれ外す→F2 / C1 / C1／**V-M** 再生成の可否を見ない→F4（Codex P1）。
    置換元の出現回数が 1 件でなければ `patch()` が例外で落ちる＝実装が動いたとき変異が**空振りしたまま緑にならない**。
  - ★ **前便のツリー（`HEAD~1`）に当てて赤を確認済み**: 積み荷を識別する 7 項目
    （A1 / C1-1 / C1-2 / E1 / E2 / E4 / F2）が赤・**対照は全部緑のまま**。
- Codex 1巡目 = **P1 × 1**（上の再生成の件）**／ P3 × 1**（本断片の検査数が古い）。**両方反映済み**。
- `bash test/run_tests.sh shogi_v4.html` = **268 / FAIL 0 / WARN 0**（前 267・件数不減）。
  `MUT_FULL=1 bash test/run_e2e.sh` = **19/19 スイート PASS**（#881 / #887 の動的変異チェック込み）。
  既存の `test/e2e/chg_modal_inline_error_881.e2e.js` は**無改変で 78/78**（E1〜E5 の候補ゼロ案内の対照も緑）。
- 編集範囲は `shogi_v4.html` の当該2関数・新規テスト1本・本断片のみ。
  `app/` / `index.html` / `.github/` / `test/run_tests.sh` は無変更。

### 直していない・別便にしたもの（反証レンズの記録）

- `<option value="'+c.id+'">` の `value` が非エスケープ。**ok / blocked 両側で本便より前からの既存事項**で、
  この便では触らない（別 issue 向け・P3）。
- `pairHasRematch` は `state.results[cls].length` を無防備に読むため、`results[cls]` 不在なら TypeError。
  本便で replace 経路にもこの呼び出しが増えた。ただし `results[cls]=[]` を保証する正規化があり、
  同じ関数の swap 経路も `renderTournament`→`getWins` も同様に読むため、**到達する盤面を構成できなかった＝未検証**。
  到達不能なガードを足すと互いを覆って変異で赤にできなくなる（[[redundant-guards-are-untestable]] の型）ので、
  **足さずに記録だけ残す**。

