# FRP-DESIGN-001: 1局目の未割当者選択・部分手合作成 設計

| 項目 | 値 |
|---|---|
| ID | FRP-DESIGN-001 |
| 種別 | 実装前設計（docs-only） |
| 日付 | 2026-06-17 |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（`3b86edb`） |
| 上位 | PAIRING-FLOW-REQ-001 / FIRST-ROUND-PARTIAL-DESIGN-001 のレビュー結論を実装前設計として固定 |
| 状態 | Draft（本書は設計のみ。実装・production 反映は別 PR） |

> 本書は **docs-only**。`shogi_v4.html` / `index.html` / test / workflow は変更しない。
> 実装は後続 FRP-IMPL-001/002/003、production 反映はさらに別の release PR で行う。

---

## 1. タイトル

**FRP-DESIGN-001: 1局目の未割当者選択・部分手合作成 設計**

クラス内の参加者のうち、運営者が選んだ人だけを先行して 1 局目の対局に入れる（＝未割当者から対象者を選び、選択者だけで対局を作って既存の 1 局目対局に追加する）機能の実装前設計。

---

## 2. 背景

### 従来の紙運用

- 受付に来た人・準備できた人から、順次手合いを付けられた。
- 奇数なら 1 人だけ残して、2 人そろったところから対局を始められた。
- 結果として、全員がそろう前から 1 局目を回し始められた。

### 現アプリ運用

- 参加者登録タブの「登録完了・対局開始」は **A/B を含む全体一括開始**。
- 対局管理タブの `startBtnClass_{cls}`（`startTournamentForClass`）は **未開始クラスを丸ごと開始するだけ**で、選んだ人だけを 1 局目に入れる機能ではない。
- 「選んだ人だけで 1 局目を作る」手段が無く、全員がそろうまで 1 局目を作りにくい。受付→1 局目開始の待ち時間が増えている。

### 直近の反省（同じ失敗を繰り返さないために）

- START-001 / START-003（PR #218/#219、production 反映 #220）で、受付画面に readiness 表示・「1 局目を作成」ボタンを追加したが、実態は **既存 `startTournamentForClass(classId)` を露出しただけ**で「未開始クラスを丸ごと開始する導線」に過ぎず、ユーザー意図（来た人・準備できた人だけを選んで部分的に手合いを追加する）とズレた。
- #220 は #221 で production から rollback 済み。
- 本設計は、その誤りを繰り返さないため **「未割当者から対象者を選ぶ → 選択者だけで候補を作る → 手合い係が確定 → append」** という核を明確に固定する。

---

## 3. スコープ

### 今回やる

- **1 局目のみ**
- **クラス単位**
- **対局管理タブ内**（クラス別セクション）
- 未割当者から対象者を選ぶ
- 選択者で候補ペアを作る
- 手合い係が確定する
- `state.pairings[cls]` に **append** する
- 奇数なら最後の 1 人は **待機**（未割当のまま残す）

### 今回やらない（明示的非スコープ）

- 2 局目以降の逐次手合い
- 早上がり者同士の次局作成
- 完全自動手合い
- 逐次手合いモードの新設
- 順位計算の変更
- 勝率計算の変更
- 年間集計仕様の変更
- `state.results[cls][round]` 構造の変更
- 大会履歴構造の変更
- 帳票 / 最終結果表の大改修
- 受付タブへの手合作成ボタン追加
- 既存 `startTournamentForClass(cls)` の流用
- 既存 `generatePairing(cls)` の全員上書き再利用

---

## 4. 現行構造の整理

実コード（`shogi_v4.html`）で確認した事実。関数名で参照する（行番号は版により前後するため指標）。

- `state.pairings[cls]` … **現在回戦の対局配列**。要素は `{p1, p2, winner, lastModifiedBy}`。1 つの同期ラウンドを表す。
- `state.results[cls]` … **確定済み回戦の配列**。各要素は対局配列。`state.results[cls].length` ＝確定済み回戦数。
- `roundNum = state.results[cls].length + 1` … 現在回戦は確定済み回戦数から導出。`done = state.results[cls].length >= state.rounds`。
- `submitRound(cls)` … **(a) 現ラウンド全対局に勝者が入っている (b) 登録者全員がどこかの対局に在籍している（missing チェック）** を満たさないと確定／次へ進めない。確定で現ラウンドを `state.results[cls]` に push し `state.pairings[cls]` を空にする。
- `generatePairing(cls)` … **全員を一括ペアし `state.pairings[cls]` をまるごと上書き**する。
  - 補足: `generatePairing` を **奇数**人数で呼ぶと backtracking が最上位で失敗し `state.pairings[cls]` が **空配列**になる。現状は `validateStartableClass` の偶数ガードで未到達だが、部分手合い状態でこれを呼ぶと危険（→ §10）。
- `startTournamentForClass(cls)` … `validateStartableClass`（2 名以上・偶数・未開始）を満たすクラスを **全員一括開始**（pairings/results 初期化 → started=true → `generatePairing`）。
- `renderTournament(cls)` … `isClassStarted(cls)` が false なら「未開始（参加者 N 名）」表示で **早期 return**。started なら 暫定成績／対戦済み／過去結果／現ラウンド（`buildCurrentPairingsHtml`）を描画。
- 卓番号 … 描画時に `state.pairings[cls]` の **index + 1**（`第 (i+1) 卓`、永続化なし）。append で自然に連番が続く。
- `getDuplicatePlayersInPairings(cls)` … pairings 内で同一選手が複数対局に出ていないか検出。**append 後の重複 post-check に流用可能**。
- `getUnassigned` 相当は無い … 未割当者を保存する state は存在しない（§5 で派生）。
- save-verify 作法 … 全 mutate 経路で `readPersistedState()` 再読込 → `pairingsMatchSnapshot(persisted, expected)`（p1/p2/winner、両側存在時のみ lastModifiedBy を比較）→ 不一致なら `notifySaveWarning({... severity:'warn', aggregateKey:'save-verify:core' ...})`。**rollback せず運営継続**。
- `lastModifiedBy` … `normalizeState` は **'manual' のみ尊重**、それ以外は 'auto' に補完（独自値は保存後に消える）。ペアカードのラベルは `lastModifiedBy==='manual'` で `[手動変更]` を表示。
- 順位 … `calcFinal(cls)` は `played[id]`（対局数）を計算するが、sort は **A（勝数）/B（相手勝数和）/C（勝った相手の勝数和）/直接対決のみ**で順位を決め、対局数は順位に未使用。1 局目のみの本設計では全員が最終的に同回戦数を戦うため影響なし。

---

## 5. 採用方針

- **FIRST-ROUND-PARTIAL はデータ構造を変えない。** `state.pairings[cls]` / `state.results[cls]` / match オブジェクトのスキーマに新フィールドを足さない。
- **`started=true` かつ `pairings[cls]=[]`（空）または部分配列を正規状態として扱う。** これを作るのは `generatePairing` を呼ばない開始経路（§7 `startClassPartial`）。`started=false` のまま pairings を持たせる異常状態は作らない（既存 `hasOngoing` fail-safe が想定する異常データになるため禁止）。
- **未割当者は state に保存しない。** `state.players[cls]` から `state.pairings[cls]` 在籍者を引いて **派生**する。
- **1 局目確定後（`state.results[cls].length >= 1`）は追加禁止。** 抽出 helper と UI を `results[cls].length === 0` でゲートする。
- **`submitRound(cls)` の全員在籍チェックは維持する。** 1 局目を確定して 2 回戦へ進む前に、全参加者が 1 局目のどこかに入っている必要がある（既存挙動）。
- **`generatePairing(cls)` は使わない**（全員上書き＋奇数で空になる）。
- **`startTournamentForClass(cls)` は使わない**（偶数前提の全員一括開始）。
- **append 専用 helper を新設する**（§7）。
- **append したペアの `lastModifiedBy` は `'auto'` とする。** 理由: (1) `normalizeState` で生き残る（独自値 'partial' は 'auto' に潰れる）、(2) 1 局目の新規生成ペアであり、`[手動変更]` ラベルを出すのは誤誘導。
- **部分状態（未割当者が残る）では既存「組み合わせを再生成」を非表示／無効化する**（§10）。

---

## 6. 推奨データフロー

1. 未開始クラスで「**選んだ人から 1 局目を開始**」を押す（`startClassPartial(cls)`）。
2. `setClassStarted(cls, true)` で `started=true`。
3. `state.pairings[cls] = []`。
4. `state.results[cls] = []`。
5. **`generatePairing` は呼ばない。**
6. 対局管理タブに **未割当者リスト** を表示（`buildFirstRoundPartialSectionHtml`、`results[cls].length===0` かつ未割当>0 のとき）。
7. 運営者が対象者をチェックで選択。
8. **entry_no 順に 2 人ずつ候補化**（`buildFirstRoundPartialPairs`）。
9. 奇数なら末尾 1 人を **待機**（leftover、append しない）。
10. 手合い係がプレビューで確認。
11. 確定で `state.pairings[cls]` に **append**（`appendFirstRoundPairs`）。
12. **重複検出**（`getDuplicatePlayersInPairings(cls)===0`、NG なら rollback）。
13. **保存検証**（`pairingsMatchSnapshot`、未確認は warn・継続）。
14. `renderTournament(cls)`。
15. 全員割当＋全勝敗入力後、**既存 `submitRound(cls)` で 2 回戦へ**（partial 経路はここで終了。2 回戦以降は従来どおり `generatePairing`）。

```
[未開始 pane]
  ├─ (既存) 「(クラス)を一括開始」… 全員偶数→startTournamentForClass（温存）
  └─ (新)   「選んだ人から1局目を開始」→ startClassPartial（generatePairing 不使用）
[started かつ results[cls].length===0 の pane]  ← 1局目のみ
  └─ 1局目 未割当参加者（チェックボックス）→ 選択者で1局目に追加
        → buildFirstRoundPartialPairs（entry_no順・奇数は末尾待機）
        → プレビュー＋確定 → appendFirstRoundPairs（guard→concat→重複post-check→save-verify）
        → renderTournament →（全員割当＋全勝敗後）submitRound で2回戦へ
[results[cls].length>=1 の pane]  ← 1局目確定後/2回戦以降
  └─ 未割当セクション・append API は一切出さない（追加禁止）
```

---

## 7. helper 設計案

新設はいずれも **追加（append）専用**。既存 `generatePairing` / `startTournamentForClass` / `submitRound` の本体は無改変。

### `validatePartialStartableClass(classInfo, players)`
- **責務**: 部分開始の可否判定。`started!==true` かつ「組める 2 名以上」を要件とし、**偶数を要求しない**（既存 `validateStartableClass` とは別物。`validateStartableClass` は一括開始用に無改変で温存）。
- **副作用**: なし（pure。state 非参照、引数のみ）。
- **guard / 返り値**: `{kind:'ok'}` または `{kind:'too-few'|'skip-already-started'|..., message}`。

### `startClassPartial(cls)`
- **責務**: クラスを部分開始状態にする。`state.pairings[cls]=[]` / `state.results[cls]=[]` / `setClassStarted(cls,true)` → `save()`。
- **副作用**: state 変更 + 永続化。**`generatePairing` を呼ばない**。
- **guard**: `validatePartialStartableClass` が ok のときのみ mutate。`showTab('tournament')` 後に保存検証（§11）。

### `getUnassignedFirstRoundPlayers(players, pairings, results)`
- **責務**: 1 局目の未割当者を派生する pure 関数。
- **副作用**: なし。
- **guard / ロジック**: `results.length===0` でなければ **空配列**（1 局目確定後は対象なし）。それ以外は `players` のうち、`pairings` のどの match の p1/p2 にも現れない者を **entry_no 昇順**で返す。これにより仕様の各除外条件（既に対局在籍／現 pairings 在籍／results[0] 在籍／勝敗入力済み／削除済み）を自動充足。

### `buildFirstRoundPartialPairs(selectedPlayers)`
- **責務**: 選択者から候補ペア配列を作る pure 関数。
- **副作用**: なし。
- **guard / ロジック**: entry_no 昇順に整列し `(0,1),(2,3),…` で組む。**1 名以下なら作成不可**（空 pairs を返す or エラー）。奇数なら末尾 1 人を `leftover` として返す。戻り値 `{ pairs:[{p1,p2,winner:null,lastModifiedBy:'auto'}], leftover: playerOrNull }`。1 局目は results 空のため勝数差・再戦は構造的に発生せず、entry_no 順で十分かつ安全（`generatePairing` のバックトラッキング流用は不要・過剰）。

### `appendFirstRoundPairs(cls, pairs)`
- **責務**: 候補ペアを `state.pairings[cls]` に追加し永続化する mutate。
- **副作用**: state 変更 + 永続化 + 再描画。
- **guard**: (1) `state.results[cls].length===0`（1 局目のみ）。(2) 各 pair の p1/p2 が `state.players[cls]` に存在し、現 `state.pairings[cls]` に未在籍。(3) pair 内 p1≠p2、新規 pairs 内に同一 id の重複なし。
- **手順**: `backup=pairings[cls]` 退避 → `pairings[cls]=pairings[cls].concat(pairs)` → `getDuplicatePlayersInPairings(cls)>0` なら `pairings[cls]=backup` で rollback して中断 → `save()` → save-verify（§11）→ `renderTournament(cls)`。既存対局・既存 winner は触らない。

### `buildFirstRoundPartialSectionHtml(cls)`
- **責務**: 未割当者セクションの HTML 文字列を返す（副作用なし）。
- **副作用**: なし（build 系の規約どおり文字列のみ）。
- **guard / 表示条件**: `isClassStarted(cls)` かつ `state.results[cls].length===0` かつ未割当>0 のときのみ中身を出す。氏名等は `escapeHtml` を通す（XSS / 個人情報保護）。各参加者にチェックボックス、「選択者で 1 局目に追加」ボタン、注意文を含む。

### `bindFirstRoundPartialEvents(cls)`
- **責務**: 上記セクションのイベント登録（bind 系の規約どおり登録のみ）。
- **副作用**: DOM イベント登録のみ。
- **guard**: 「追加」押下時に選択 id を集め、`buildFirstRoundPartialPairs` → プレビュー（インライン＋ native `confirm()` で氏名・組数を要約）→ ok なら `appendFirstRoundPairs(cls, pairs)`。

> 確認 UI は MVP では **インライン プレビュー＋ native `confirm()`** で十分（`changePairing` 型の独自モーダルは過剰）。

---

## 8. UI 案

### 配置

- **対局管理タブ** / **クラス別セクション内**。
- **受付タブには手合作成導線を置かない**（#218 の轍を避ける）。
- 未開始 pane では既存「一括開始」に **別ボタン**として「選んだ人から 1 局目を開始」を併置（`startTournamentForClass` の再利用ではない別経路）。

### 文言案

- 未開始時ボタン: **「選んだ人から1局目を開始」**
- 未割当セクション見出し: **「1局目 未割当参加者」**
- 確定ボタン: **「選択者で1局目に追加」**
- 注意文: **「既存の対局は変更せず、選択者だけを1局目に追加します」**

※「登録完了・対局開始」や「クラスを開始」と **混同しない** 文言にすること。

---

## 9. 奇数時

- 選択者が **1 人だけ**なら **作成不可**（ペアを作れない）。
- 選択者が **3 人以上の奇数**なら、entry_no 順で 2 人ずつ作り、**最後の 1 人は待機**。
- 待機者は **未割当のまま残る**（後で他の人と一緒に再度選んで追加できる）。
- **1 局目を確定して 2 回戦へ進むには、既存 `submitRound` の missing チェックにより全員が対局に入っている必要がある**（＝最終的に全クラス員が割り当て済み＝実質偶数）。これは現行モデルと一致。
- **真の奇数終了 / bye / 不戦勝は今回対象外。** 現行どおり **運営者追加** または手動運用で対応する。

---

## 10. 再生成ボタン

- **未割当者が残る部分手合い状態では、既存「組み合わせを再生成」を非表示／無効化する。**
- 理由: `generatePairing(cls)` は **全員上書き**であり、先行作成済みの部分対局・入力済み勝敗を壊す恐れがある。さらに **奇数状態で押すと `state.pairings[cls]` が空になる**（§4 補足）。
- **未割当者が 0 になり、通常状態（全員割当）と同等になった場合は再表示可**（その時の挙動は従来どおり、既存の「勝敗が消えます」confirm も温存）。
- 2 回戦以降（`results[cls].length>=1`）の再生成は従来どおり（無改変）。
- **Phase 1 では「未割当者だけ再提案」はやらない**（1 局目は entry_no 順追加で足り、過剰）。
- 実装は局所的: `buildCurrentPairingsHtml` の再生成ボタン出力を「未割当 0 のときのみ表示」にゲートする。

---

## 11. 保存検証

既存 SAVE 系の作法に合わせる（rollback せず warn・運営継続）。

- **`startClassPartial` 後**: `readPersistedState()` 再読込で **started 状態の保存検証**（`classStartedInPersisted(persisted, cls)` が true か）。未確認なら `notifySaveWarning`。
  - `callsiteId` 例: `SAVE-003-startClassPartial-<cls>`、`aggregateKey: 'save-verify:core'`、`severity:'warn'`。
- **`appendFirstRoundPairs` 後**: `pairingsMatchSnapshot(persisted.pairings[cls], expected)` で配列全体（p1/p2/winner、両側存在時 lastModifiedBy）を照合。length 一致だけでは stale を見逃すため snapshot 比較を使う。
  - `callsiteId` 例: `SAVE-003-appendFirstRoundPairs-<cls>`、`aggregateKey: 'save-verify:core'`、`severity:'warn'`。
- 保存未確認時は **既存方針どおり warn のみ・rollback しない・運営継続**。
- `callsiteId` / `aggregateKey` は既存 SAVE 系の命名に合わせ、既存インジケータ挙動を共有する。

---

## 12. テスト方針

無改変 baseline 比較で **新規 FAIL/WARN 0**。新規 `test/test_first_round_partial_*.js` を `run_tests.sh` に配線。DOM 直読みテストが落ちた場合は最小修正ルール（assert 文言は保持・fixture を state に合わせる）に従う。

### pure helper

- 未割当者抽出（`getUnassignedFirstRoundPlayers`）: `results` 非空 → 空配列／在籍者除外／削除者非混入／並び順 entry_no 昇順。
- entry_no 順ソート。
- 偶数選択 → 全ペア化。
- 奇数選択 → 末尾 1 人 leftover。
- 1 人選択 → 作成不可。
- 重複排除（同一 id を含む選択での弾き）。
- `results` 非空では追加不可（ゲート）。

### mutate / DOM

- **部分開始で `generatePairing` が呼ばれない**こと（`startClassPartial` 後 pairings 空・started=true）。
- append で **既存対局を壊さない**（既存 pair / winner 不変）。
- append 後の **卓番号が自然連番**（index+1 が連続）。
- 重複時 **rollback**（`getDuplicatePlayersInPairings>0` で backup 復元・中断）。
- **保存検証 warn** の発火（save 未確認時）。
- **`submitRound` の missing チェック不変**（全員在籍まで 2 回戦へ進めない）。
- **再生成ボタン制御**（未割当>0 で非表示、0 で再表示）。
- **2 局目以降に UI が出ない**（`results[cls].length>=1` でセクション非表示）。

### 回帰（最重要）

- `generatePairing` / `submitRound` / `startTournamentForClass` / `calcFinal` / 順位 / 大会履歴 Step1 / 帳票 が **無改変**であること。`test_b_r2_regression.js` / `test_round_class_start_004*.js` / `test_history_step1.js` 等を破らない。

---

## 13. PR 分割案

orphan base・Draft 原則。各 slice は前 slice の orphan 新 HEAD を起点に積む。

| Slice | 内容 | 受け入れの核 |
|---|---|---|
| **FRP-DESIGN-001**（本書） | docs-only 設計 | 設計合意 |
| **FRP-IMPL-001** | 部分開始 + 未割当一覧表示（`validatePartialStartableClass` / `startClassPartial` / `getUnassignedFirstRoundPlayers` / 未開始 pane の「選んだ人から1局目を開始」/ 未割当一覧の **表示のみ**。append はまだ無し） | 未割当を選べる土台 + 部分開始（generatePairing 不使用） |
| **FRP-IMPL-002** | 選択者で append 作成（`buildFirstRoundPartialPairs` / `appendFirstRoundPairs` / 選択チェック＋プレビュー＋確定 UI） | 選択者だけで append 作成・手合い係が確定 |
| **FRP-IMPL-003** | 再生成ボタン制御・警告整理（未割当>0 で非表示、エッジ整理） | 既存対局の誤破壊防止 |
| **release PR** | production 反映（base=production）。orphan slice 群 merge 後に別 PR | 既存 release 運用に従う |

---

## 14. 受け入れ条件

- 「**開始ボタンを増やしただけ**」では **不合格**。
- `startTournamentForClass` を受付/対局画面に **露出しただけ**では **不合格**。
- **未割当者を選べる**こと。
- **選択者だけで 1 局目の候補を作れる**こと。
- **手合い係が確定できる**こと。
- **既存の 1 局目対局を壊さず append できる**こと。
- **奇数なら 1 人を待機に残せる**こと。
- **1 局目確定後は追加禁止できる**こと。
- **既存の順位・履歴・帳票・保存形式を壊さない**こと。
- **2 局目以降の逐次手合いに踏み込まない**こと。

---

## 付記: 今回は実装しない

本書は実装前設計（docs-only）である。`shogi_v4.html` / `index.html` / test / workflow は変更していない。実装は後続の FRP-IMPL-001/002/003 で、production 反映はさらに別の release PR で行う。
