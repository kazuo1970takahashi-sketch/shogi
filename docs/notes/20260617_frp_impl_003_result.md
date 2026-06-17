# FRP-IMPL-003 実装結果メモ — 選択者だけで1局目対局を append 作成

| 項目 | 値 |
|---|---|
| ID | FRP-IMPL-003 |
| 種別 | 実装（shogi_v4.html + test） |
| 日付 | 2026-06-17 |
| 設計 | `docs/specs/20260617_frp_design_002_post_225_partial_first_round.md`（FRP-DESIGN-002 §6/§7/§9 / PR #227 merge 済） |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `3394e4a`（#228=FRP-IMPL-002 merge 後の HEAD、parent `b32720c`=#227） |
| branch | `feature/frp-impl-003-append-selected-first-round` |
| 状態 | Draft・未 merge（Ready化 / merge / production 反映は別途・人間の明示承認後） |

> 本スライスは **FRP-IMPL-002 で「表示」まで実装した未割当一覧から、選択者だけで1局目対局を append 作成する**ところまで。
> **奇数3人以上は entry_no 昇順で2人ずつペア化し、末尾1人を leftover として未割当のまま残す**（FRP-DESIGN-002 §9）。
> **0人 / 1人は作成不可**。**results 非空（1局目確定済み/2回戦以降）はブロック**。
> **保存復元の堅牢化・再生成ボタン制御・任意組み合わせ・手動並び替え・bye は本スライス非対象**（FRP-IMPL-004 以降）。

---

## 1. 前提（#225 / #227 / #228 後の事実）

- 受付（参加者登録）タブは **nav-only**（`goToTournamentFromReg` = save + 対局管理タブへ移動のみ）。FRP の操作入口は **対局管理タブのクラス別セクション**。
- FRP-IMPL-002（#228）で `validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` / `buildFirstRoundPartialSectionHtml`（表示・**append ボタンと checkbox は disabled**）まで実装済み。
- `validateStartableClass` / `startTournamentForClass` / `generatePairing` / `submitRound` / `applyStartForCandidates` は **無改変**。

## 2. 実装内容（shogi_v4.html・純追加 + 既存 disabled UI の有効化）

新規 helper（既存関数の本体は無改変）:

| 関数 | 責務 | 副作用 |
|---|---|---|
| `buildFirstRoundPartialPairs(selected)` | 選択者から候補ペアを作る **pure** helper。entry_no 昇順（欠損/不正は末尾・同値は id 昇順で tie-break）に整列し `(0,1),(2,3),…` でペア化。奇数なら末尾1人を `leftover` として返す。0/1名は pairs 空。返り値 `{pairs:[{p1,p2,winner:null,lastModifiedBy:'auto'}], leftover}`。ランダム要素なし | なし |
| `appendFirstRoundPairs(cls,pairs)` | 候補ペアを `state.pairings[cls]` に **末尾 append** する mutate。実行時再検証 → backup → concat → 重複/既存保持の post-check → save → SAVE-FRP-002 → `renderTournament(cls)`。**`startTournamentForClass`/`generatePairing`/`applyStartForCandidates` を呼ばない**。返り値 boolean | state 変更 + 永続化 + 再描画 |
| `collectCheckedUnassignedPids(cls)` | `pane-{cls}` 内の `.frp-unassigned-cb` のうち checked（非 disabled）の pid を集める（pane スコープで他クラス混入を一次防御） | なし |
| `buildFrpAppendConfirmMessage(cls,pairs,leftover)` | native confirm 用の確認文（Mペア/N名・各対局の氏名・奇数なら待機者名）。**confirm のプレーンテキストのため escapeHtml は適用しない**（innerHTML ではない） | なし |
| `onClickAppendFirstRound(cls)` | 「選択した参加者で1局目を追加作成」ボタンの click handler。**再入防止（in-flight guard）** → 実行時再検証（現在の未割当者に含まれる選択 pid のみ採用＝同一クラス・既割当排除・重複排除）→ `buildFirstRoundPartialPairs` → confirm → `appendFirstRoundPairs` | （append 経由で）state 変更 |

既存への変更（純追加・既存出力条件/id は不変）:

- `buildFirstRoundPartialSectionHtml`: checkbox の `disabled` を撤去・ラベル色を有効表示へ・「対局の作成は次スライスで対応予定」ボタンを **「選択した参加者で1局目を追加作成」**（有効）へ置換・説明文/補助文を実機能に合わせて更新。**helper 自体は表示専用のまま**（addEventListener / pairings mutate を持たない）。
- `bindClassActionBarEvents`: `frpAddBtn_{cls}` の click を `onClickAppendFirstRound(cls)` に bind（追加のみ。`startBtnPartial_` の bind は不変）。
- `buildClassActionBarHtml`: 部分開始ボタンのヘルプ文言から「次スライスで対応予定」を撤去（ボタン id/出力条件は不変）。

## 3. 仕様の要点（レビュー反映）

- **奇数の扱い**: 3人以上の奇数は末尾1人を leftover として **未割当のまま残す**（FRP-DESIGN-002 §9・§14 受け入れ条件）。leftover は **state に保存しない**。`getUnassignedFirstRoundPlayers` の派生により append 後も未割当一覧に自動的に残る。**0人/1人は作成不可**（`buildFirstRoundPartialPairs` が空 pairs / append guard が拒否）。
- **results と winner の分離**: `state.results[cls].length>=1`（1局目確定済み/2回戦以降）は **全面ブロック**。一方 `state.pairings[cls]` 内に **winner 入力済み match があっても results 空なら append 許可**（既存 match を変更せず末尾追加のみ＝既存 winner 不変）。「pairings 内 winner 入力済み」と「results 確定済み」を分けて扱う。
- **実行時再検証（UI を信用しない）**: append ボタン押下時に、選択 pid が現在の未割当者に含まれるか・同一クラスか・既割当でないか・重複がないか・p1≠p2・results 空か・未開始でないかを再検証。`appendFirstRoundPairs` 内でも同じ guard を二重に持つ（DOM スナップショットに依存しない）。
- **post-check / rollback**: append 後に `getDuplicatePlayersInPairings(cls)>0`（重複）または既存対局の件数/p1/p2/winner が保持されていない場合は **backup から rollback して中断（save しない）**。
- **SAVE-FRP-002**: save 後に `readPersistedState()` で再読込し `pairingsMatchSnapshot(persisted.pairings[cls], expected)` で **p1/p2/winner/lastModifiedBy を全要素照合**（length 一致だけでは stale を見逃すため）。不一致は `notifySaveWarning`（`callsiteId:'SAVE-FRP-002-appendFirstRoundPairs'`・`severity:'warn'`）。**保存未確認は warn のみで rollback しない・運営継続**（SAVE-FRP-001 と同型。in-memory の append は保持し、運営者にバックアップを促す）。
- **再入防止**: `onClickAppendFirstRound` は in-flight guard で confirm 中/連打中の二重発火を弾く。加えて append 後は対象 pid が割当済みになり、実行時再検証で2回目以降は自動的に除外される（二重防御）。

## 4. UI 文言（FRP-IMPL-002 の暫定文言を全置換）

- ボタン: **「選択した参加者で1局目を追加作成」**（title「選んだ未割当者だけで1局目の対局を作成します（既存の対局・結果は変更しません）」）
- 説明: 「…既存の対局を変更せず選択者だけの対局を追加します（2人以上を選択。偶数は全員、奇数は末尾1人が未割当のまま残ります）。**既に1局目対局がある参加者は表示されません。**」
- 補助文: 「※2人以上を選択してください。**作成済みの対局・結果は変更されません。**」
- 0/1名: 「2人以上を選択してください」 ／ results 非空: 「1局目が確定済みのクラスには追加できません」
- 撤去した暫定文言: 「対局の作成は次スライスで対応予定」「次スライスで対応予定」「今回は未割当者の確認のみ」（実測 0 件）。

## 5. テスト

- 新規 `test/test_frp_impl_003.js`（**64 assert・架空データのみ**）。観点: BP（pure ペア生成: 偶数/奇数/0/1・entry_no 昇順・欠損は末尾・同値は id 昇順・決定的）/ AP（append のみ・既存保持・件数=既存+新規・既存 winner 不変・leftover 残置）/ GUARD（results 非空ブロック・別クラス/既割当/重複/p1==p2/空/未開始/unknown 拒否）/ SAVE（SAVE-FRP-002 成功時 warn なし・書込不能時 warn・rollback なし）/ HANDLER（チェック2人で append・1人以下不可・pane スコープ外無視・confirm キャンセル・奇数の確認文に待機者名）/ REENTRY（連打 + confirm 中再入で二重 append しない・confirm は1回）/ ISO（A/B 独立）/ NOCALL（旧開始関数を source + 挙動 proxy で非呼出）/ BIND（render 後 frpAddBtn に bind・有効 UI）。
- `test/test_frp_impl_002.js` を更新: append 実装に伴い「未実装ガード」だった assert を現実に追従（OFF→WIRED: helper 実在 / frpAddBtn bind / checkbox・ボタン有効 / 暫定文言撤去）。**79 assert で PASS 維持**。
- `test/run_tests.sh` の FRP-IMPL-002 ブロックの後に FRP-IMPL-003 ブロックを追加。
- 結果: `bash test/run_tests.sh shogi_v4.html` = **PASS=64 / FAIL=1 / WARN=35**。
  - baseline（無改変 `3394e4a`）= **63 / 1 / 35**。**+1 PASS（FRP-IMPL-003 ブロック）・新規 FAIL/WARN 0**。
  - FAIL=1 は既存の `data_*` 環境要因（Python traceback・fixture 未コミット）で本実装と無関係。WARN=35 は dev ツリーのみの未コミット test 群（環境要因）。
  - 未エスケープのユーザー入力 = 0 件（confirm 文の氏名はローカル変数経由でヒューリスティクスを踏まない・innerHTML ではないため escape 不要）。

## 6. 非スコープ（今回やらない＝FRP-IMPL-004 以降）

- 保存・復元の堅牢化（reload 復元テスト拡充・SAVE 強化）／再生成ボタン制御（未割当>0 で「組み合わせを再生成」を非表示）／任意組み合わせ指定／手動並び替え／bye・不戦勝。
- production 反映 = 別 release PR（base=production）。

## 7. このターンで触っていないもの

- `index.html` / `package.json` / `package-lock.json` / `.github`（workflow）: 無変更。
- main `832bc5a` / production `9693a83` / orphan base `3394e4a`: 直接 push なし（前進させていない）。
- PR #222 / #223（CLOSED/superseded）: 一切操作なし（再 open / comment / rebase なし）。PR #227 / #228: 追加修正なし。
- deploy / publish / release / branch 削除: なし。Ready化 / merge: なし。後続タスク（FRP-IMPL-004）: 未着手。
