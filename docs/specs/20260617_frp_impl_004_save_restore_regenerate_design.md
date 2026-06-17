# FRP-IMPL-004 設計: 保存復元堅牢化 ＋ 再生成ボタン制御

| 項目 | 値 |
|---|---|
| ID | FRP-IMPL-004-DESIGN |
| 種別 | **docs-only 設計**（実装・テスト変更なし） |
| 日付 | 2026-06-17 |
| 親設計 | `docs/specs/20260617_frp_design_002_post_225_partial_first_round.md`（FRP-DESIGN-002・特に §5 / §10） |
| 前提実装 | FRP-IMPL-002（#228 部分開始＋未割当表示）/ FRP-IMPL-003（#229 選択者 append 作成）|
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `9c4551b`（#230 TEST-HARNESS-001 merge 後 HEAD、parent `b33e7b6`=#229）|
| branch | `docs/frp-impl-004-save-restore-regenerate-design` |
| 状態 | Draft・docs-only。実装は後続 FRP-IMPL-004(A/B/C)。**本書では shogi_v4.html / test を変更しない** |

> 本書は **実装前の設計**。`shogi_v4.html`・`test/run_tests.sh` は変更しない。Ready 化 / merge / production 反映は行わない。
> 結論を先に言うと: **FRP append の保存復元の正しさは、現実装の構造（append は正準 match 形・leftover は派生・winner/lastModifiedBy は sanitizeMatch 保存範囲）により「ほぼ既に保証されている」**。FRP-IMPL-004 の主眼は、(1) その保証を **明示テストで固定** すること、(2) **「組み合わせを再生成」(`repairBtn_`) という破壊的経路を部分手合い状態で制御** すること、(3) **運営者向けの文言整備**。新しい永続化機構の追加は不要（むしろ避ける）。

---

## 1. 背景

### 1.1 FRP（1局目部分手合い）ラインのこれまで

- **FRP-DESIGN-002（#227）**: #225 で受付タブの開始副作用を撤去し対局管理タブへ集約した後の、1局目部分手合い再設計。核心方針 = **append 専用 / 旧開始関数非流用 / データ構造不変 / 未割当は派生 / 奇数 leftover は state 非保存**。
- **FRP-IMPL-002（#228）**: 部分開始の土台。`startClassPartial`（`started=true`・`pairings/results` 空）＋ `getUnassignedFirstRoundPlayers`（派生）＋ `buildFirstRoundPartialSectionHtml`（未割当一覧表示・append は disabled）。
- **FRP-IMPL-003（#229）**: 選択者だけで1局目対局を **append** 作成。`buildFirstRoundPartialPairs`（pure・entry_no 昇順・奇数末尾 leftover）＋ `appendFirstRoundPairs`（末尾追加・backup/rollback post-check・SAVE-FRP-002）＋ `onClickAppendFirstRound`（再入防止＋実行時再検証）。
- **TEST-HARNESS-001（#230）**: `run_tests.sh` の `data_*.json` 不在時 常時 FAIL=1 を nullglob skip 化で解消。**clean-tree baseline は `64/1/35` → `64/0/35`**。FRP-IMPL-004 のテストはこの新 baseline（`PASS=64 / FAIL=0 / WARN=35`）から差分を測る。

### 1.2 確定済みの設計方針（FRP-IMPL-004 でも踏襲する）

1. **append 専用**: 1局目の対局追加は `state.pairings[cls]` への **末尾 concat のみ**。既存 match を書き換えない。
2. **旧開始関数を FRP 経路から呼ばない**: `startTournamentForClass` / `startTournament` / `applyStartForCandidates` / `generatePairing` を FRP の作成経路で呼ばない（全員上書き経路を流用しない）。
3. **奇数 leftover は state に保存しない**: `buildFirstRoundPartialPairs` は leftover を返すが、`appendFirstRoundPairs` は `pairs` だけを append する。待機者は `getUnassignedFirstRoundPlayers` の **派生** で毎描画 / reload 後に再計算される。
4. **未割当は派生**: `getUnassignedFirstRoundPlayers(cls)` = `players[cls]` − （`pairings[cls]` の p1/p2 に出現する人）。`results[cls].length>=1` なら空（この導線の対象外）。

### 1.3 現状の保存復元は「構造的にほぼ正しい」（本書の重要観察）

実装読解（`9c4551b`）から、append の保存復元は新規コードなしで以下が成立している:

- `appendFirstRoundPairs` が積む match は **`{p1, p2, winner:null, lastModifiedBy:'auto'}`**（`buildFirstRoundPartialPairs` L5960）。これは `normalizeState` の `sanitizeMatch`（L787-795）が出力する **正準形そのもの**。よって **normalize 往復は恒等**（reload で形が変わらない）。
- `save()`（L963）は `JSON.stringify(state)` をそのまま保存（normalize しない）。`load()`（L986）と `readPersistedState()`（L5048→L5071）は **読込時に必ず normalizeState** する。
- 従って append → save → reload は、追加 match を含めて **べき等** に復元される（後述 §3 の不変条件を構造的に満たす）。

→ だから FRP-IMPL-004 の「堅牢化」は **回帰テストでこの保証を固定** することが主目的。新しい保存スキーマやメタ情報は **入れない**（入れると normalize で剥がれ、かえって壊れる。§3.2 / §10）。

---

## 2. 現状整理

### 2.1 FRP-IMPL-003 でできること（実装済み・`9c4551b`）

| できること | 実装 |
|---|---|
| 未割当者から選択して1局目ペアを **append** | `onClickAppendFirstRound`（L6102）→ `buildFirstRoundPartialPairs`（L5945）→ `appendFirstRoundPairs`（L6016）|
| 既存 pairings を変更しない（末尾追加のみ・backup/rollback post-check） | `appendFirstRoundPairs` L6054-6076 |
| `results[cls]` 非空なら全面ブロック | `appendFirstRoundPairs` L6026 / `onClickAppendFirstRound` L6108 / `getUnassignedFirstRoundPlayers` L5915 |
| pairings 内 winner 入力済みでも results 空なら許可・既存 winner 不変 | append guard は results のみブロック、winner は post-check で保持確認（L6069）|
| SAVE-FRP-002 保存検証（snapshot 比較） | `appendFirstRoundPairs` L6082-6093 / `pairingsMatchSnapshot`（L5090）|
| 再入防止（confirm 中の二重発火） | `frpAppendInFlight`（L6101）|
| 奇数末尾 leftover を未割当のまま残す | `buildFirstRoundPartialPairs` L5962（leftover は append しない）|

### 2.2 まだできていないこと（FRP-IMPL-004 の対象）

| 未対応 | FRP-IMPL-004 での扱い |
|---|---|
| append 後 save→reload の **明示テスト**（pairings/winner/lastModifiedBy 完全一致） | §7 テスト設計（004A）|
| reload 後の **派生未割当** の検証（leftover が再計算で残る） | §7（004A）|
| append 済み状態での **既存 開始/再生成 ボタン制御** | §5（004B）|
| 危険経路 `generatePairing`（`repairBtn_`）が部分手合いを破壊するのを防ぐ | §5.3（004B）|
| 運営者向け **文言整備**（再生成警告・append 不可説明・待機説明） | §6（004C）|
| bye / 任意組み合わせ / 手動並び替え / 複数 round 生成 | **スコープ外**（§8）|

---

## 3. 保存復元で守るべき不変条件

append → `save()` → ブラウザ reload（`load()` = normalizeState）後に、**以下が崩れないこと**を不変条件とする。各項目に「現実装で満たす根拠」を併記する。

### 3.1 不変条件一覧

| # | 不変条件 | 現実装で満たす根拠 |
|---|---|---|
| I1 | `pairings[cls]` の **既存 match の順序** が保たれる | append は末尾 concat（L6056-6057）。normalize は配列順を保持（map のみ・L797-798）|
| I2 | 各 match の **p1 / p2** が保たれる | sanitizeMatch は in-class valid id をそのまま返す（L788-789）。append は valid id のみ通す（L6048）|
| I3 | 各 match の **winner** が保たれる | sanitizeMatch は winner が p1/p2 と一致すれば保持、不一致は null（L790-791）。FRP 追加 match は winner:null で問題なし。既存 winner 入力済み match も p1/p2 一致なら保持 |
| I4 | 各 match の **lastModifiedBy** が保たれる | sanitizeMatch は 'manual' のみ尊重・他は 'auto'（L792-794）。FRP 追加は 'auto' で往復一致。手動変更('manual')も保持 |
| I5 | append 済み件数（既存 + 追加）が保たれる | normalize は valid match を filter で残すのみ（L798）。全 match が valid なら件数不変 |
| I6 | `results[cls]` が保たれる（FRP は touch しない） | append は results を読むだけ・書かない（L6024-6026）。normalize は results round も sanitize して保持（L800-802）|
| I7 | `players[cls]` の entry_no / id / name が保たれる | normalize が entry_no を永続化復元（L776-780）、id/name 保持（L760-782）|
| I8 | **leftover を state に保存しない** | `appendFirstRoundPairs` は `pairs` のみ append、leftover は積まない。state に leftover フィールドを持たない |
| I9 | reload 後 `getUnassignedFirstRoundPlayers(cls)` の **派生結果が同じ** | 派生入力（players − pairings の p1/p2、results 空判定）が I1-I7 で保たれるため、出力も同じ（L5912-5934）|
| I10 | `results` 非空時の append ブロックが reload 後も維持 | ブロック条件は `state.results[cls].length>=1` の派生判定（L6026 / L5915）。results が保たれる（I6）ため reload 後も同じ判定 |
| I11 | `classes[i].started` と互換 `state.started` の整合 | `setClassStarted`→`syncGlobalStartedFromClasses`（L917-930）。normalize も `state.started = OR(classes[].started)` を再同期（L884）|

### 3.2 「持っていないメタ情報」を明文化する（重要・Should Fix: 表現を match-level に限定）

タスク要件に「appended match の round / table / source / generatedBy 等、既存実装で持っているメタ情報」とあるが、**match オブジェクトにはこれらのフィールドは存在しない**。ここで「存在しない」と言うのは **match-level の保存メタ情報** に限った主張である。アプリ全体には別文脈の `source` / `sourceState` 等があり得る（例: 大会履歴 Step1 の `buildScoreboardClassTableHtml(cls, sourceState)` の `sourceState` は閲覧用の状態スナップショット引数であって、match の保存フィールドではない）。混同を避けるため、本書での `source` は **match-level の保存メタ情報** を指す。実測:

- **match オブジェクトには `round` / `table` / `source` / `generatedBy` は存在しない**。match の正準形（`sanitizeMatch` L794）は **`{p1, p2, winner, lastModifiedBy}` の 4 つだけ**。
- **卓番号** は `pairings` 配列の **index+1 による描画上の派生**（表示バッジ。`buildCurrentPairingsHtml` L6825「第 N 卓」）。**保存されない**。
- **ラウンド番号** は `state.results[cls].length+1` による **派生**（L7011）。**保存されない**。

→ **FRP-IMPL-004 は match スキーマ拡張を行わない**。`sanitizeMatch` は未知フィールドを **必ず捨てる** ため、もし将来 match にメタ情報を足すなら **`sanitizeMatch` にも同じ復元規則を足さない限り reload で消える**（§10 リスク）。本スライスでは match スキーマを拡張しない。この「持っていない」事実は、§5.4.1 の **再生成制御の識別限界**（FRP 由来か通常開始由来かを state から判別できない）の根拠でもある。

---

## 4. 保存復元の設計方針

### 4.1 何を保存し、何を派生で再計算するか

| 区分 | 対象 | 方針 |
|---|---|---|
| **保存する（state）** | `pairings[cls]`（既存＋append 済み match）/ `results[cls]` / `players[cls]` / `classes[i].started` / 互換 `state.started` | 既存 `save()` のまま。append は末尾追加のみ。**新フィールドを足さない** |
| **派生（保存しない）** | 1局目 未割当者リスト / 奇数 leftover / 卓番号 / 現ラウンド番号 / append 可否 / 再生成可否 | 毎描画・reload 後に `getUnassignedFirstRoundPlayers` 等で再計算 |

### 4.2 append 後 reload しても同じ未割当者が残る条件

I9 の通り、`getUnassignedFirstRoundPlayers(cls)` の入力（`players[cls]` / `pairings[cls]` の p1/p2 集合 / `results[cls].length`）が reload 往復で不変（I1-I7）であれば、未割当集合は一致する。**奇数 leftover で待機させた1名は、append されていない＝pairings の p1/p2 に出ない**ため、reload 後も派生で未割当一覧に残る。→ 追加コード不要。テストで固定する（§7 T4）。

### 4.3 results 非空時の append ブロックが reload 後も維持される条件

ブロックは `state.results[cls].length>=1` の **派生判定**（保存フラグではない）。results が保たれる（I6）ので reload 後も同じ判定になる。→ 追加コード不要。テストで固定（§7 T5）。

### 4.4 保存失敗・保存不一致時の扱い（SAVE-FRP-002 との関係）

- 現行: `appendFirstRoundPairs` は `save()` 後に `readPersistedState()` → `pairingsMatchSnapshot(persisted.pairings[cls], state.pairings[cls])` で照合（L6082-6083）。不一致は **`notifySaveWarning`（warn・rollback しない・運営継続）**（L6084-6093, `callsiteId:'SAVE-FRP-002-appendFirstRoundPairs'`）。
- **FRP-IMPL-004 の方針: SAVE-FRP-002 を維持・拡張しない**。理由:
  - snapshot 比較は既に「length 一致だけでは stale を見逃す」を p1/p2/winner（+両側 lastModifiedBy）で補えている（§3.1 I1-I5 と同じ粒度）。
  - reload 復元の正しさは normalize 往復の恒等性で担保され、**保存時点の検証（SAVE-FRP-002）と reload 検証（テスト）で二重に固定**できる。新しい実行時検証経路を足すと、警告ノイズと保守コストが増える。
- **SAVE-FRP-003 を新設すべきか？ → 原則「不要・新設しない」**。新設が要るのは「match スキーマを拡張して新フィールドの保存検証が要る」場合のみで、本スライスは拡張しない（§3.2）。万一 004 実装中に snapshot の粒度を上げる必要が出たら、**新 callsiteId を足すのではなく `pairingsMatchSnapshot` の比較範囲拡張＋既存 SAVE-FRP-002 の流用**を第一候補とする（命名の氾濫を避ける）。判断は実装レビューで人間が確認（§10）。

---

## 5. 再生成ボタン制御の設計方針

### 5.1 既存の開始 / 生成 / 再生成 / リセット系ボタン棚卸し（対局管理タブ）

| # | ボタン id（文言） | ハンドラ | 描画条件 | mutate 内容 | FRP-append 状態での危険度 |
|---|---|---|---|---|---|
| B1 | `startBtnClass_{cls}`（○○全員で1局目を開始）L6912 | `startTournamentForClass`（L5843）| `!classStarted && players>=2 && 偶数`（L6909）| pairings/results 初期化 → started=true → `generatePairing`（全員上書き）| **低**（started 後は非表示＋validator が `skip-already-started` でブロック）|
| B2 | `startBtnPartial_{cls}`（このクラスを部分開始）L6921 | `startClassPartial`（L5865）| `!classStarted && players>=1`（L6920）| started=true・pairings/results 空 | **低**（started 後は非表示＋`validatePartialStartableClass` が skip-already-started）|
| B3 | `frpAddBtn_{cls}`（選択した参加者で1局目を追加作成）L6978 | `onClickAppendFirstRound`（L6102）| 部分開始中・results 空・未割当>0（`buildFirstRoundPartialSectionHtml` L6960-6964）| pairings 末尾 append のみ | 安全（FRP 本体・append 専用）|
| B4 | **`repairBtn_{cls}`（組み合わせを再生成）L6848** | `generatePairing`→`renderTournament`（L6867-6874）| `buildCurrentPairingsHtml`（L6741）= started かつ round 描画時に常に出る | **`state.pairings[cls]=pairs`（全員上書き・L6394）** | **高**（後述 §5.3）|
| B5 | `submitBtn_{cls}`（○回戦 確定して次へ）L6847 | `submitRound`（L6866）| round 描画時 | results に round 確定追加 | 中（確定すると以後 append 不可になる＝意図通り。誤確定注意）|
| B6 | `resetBtnClass_{cls}`（○○をリセット）L6907 | `resetClassForClass`（L6142）| `classStarted`（L6906）| 当該クラス pairings/results 空・started=false（confirm 付き）| 中（意図的 undo・confirm 済。誤押下注意）|
| B7 | `resetBtn`（大会データを全リセット）L195 | `resetAll`（L8153）| 常時（ヘッダ）| 全 state 破棄（confirm 付き）| 中（全体・confirm 済）|
| B8 | `resetProgressBtn`（進行データのみリセット）L8227 | `resetTournamentProgressOnly`（L8117）| 常時 | 全クラス pairings/results 空・started=false（confirm 付き）| 中（全体・confirm 済）|
| — | （legacy）`startTournament`（L5796）| UI 非 bind | — | — | 低（UI から呼ばれない＋`state.started===true` ガード L5802）|

### 5.2 「append 済みかどうか」「results 非空かどうか」の判定条件

- **append 済み（＝部分手合いを組成中）の判定**: `isClassStarted(cls)===true` かつ `state.results[cls].length===0` かつ `state.pairings[cls].length>=1`。
- **未割当が残っている（＝部分組成が未完）の判定**: 上記に加え `getUnassignedFirstRoundPlayers(cls).length>0`。
- **results 非空（1局目確定後/2回戦以降）の判定**: `state.results[cls].length>=1`（既存ブロック条件と同一・L6026 / L5915）。
- いずれも **既存の派生 helper を読むだけ**（新しい保存フラグを作らない）。

### 5.3 危険の本体: `repairBtn_`（組み合わせを再生成）→ `generatePairing`

- `generatePairing(cls)`（L6311）は **`state.players[cls]` 全員** から完全なペアリングを作り直し、最後に **`state.pairings[cls]=pairs`（全上書き・L6394）**。
- `repairBtn_` のガードは **`hasWinner`（どれか1局でも winner 入力済みか）だけ**（L6869）。**FRP-append 直後の1局目は winner 未入力**なので `hasWinner=false` → **確認なしで** 既存の append 済み pairings を破棄し、待機させていた leftover/未割当者まで巻き込んで全員ペアに作り替える。
- これは FRP の「append 専用 / 来た人だけで組む」モデルを **黙って崩す**。FRP-DESIGN-002 §10.1 でも「未割当>0 の部分手合い状態で再生成ボタンを **非表示**にする（FRP-IMPL-004）」と予告済み。本書でこれを **確定** する。

### 5.4 制御方式の決定（disable / hide / confirm / block）

`repairBtn_` の扱いは **state から確実に判定できる軸（results の有無・未割当の有無）だけ**で出し分ける。**重要（Must Fix）**: 「部分手合い・未割当0」と「通常開始 round1・未割当0」は **現行 state だけでは識別できない**（§5.4.1）。したがって未割当0では **由来で分岐せず**、未割当の有無のみで出し分ける:

| 状態 | `repairBtn_` の扱い | 理由 |
|---|---|---|
| **results 空・pairings あり・未割当>0**（＝1局目部分手合い組成中で未割当が残る）| **非表示（hide）** | 全員上書きが leftover/未割当を巻き込むのを構造的に断つ。disabled でなく hide（誤認・誤押下の余地を消す）。FRP-DESIGN-002 §10.1 と整合。**この条件だけは state から確実に判定できる**（results=空 ∧ 未割当>0 は FRP 部分手合い組成中に固有。通常開始 B1 は `validateStartableClass` が偶数を要求するため未割当>0 にならない＝下記注）|
| **results 空・pairings あり・未割当 0**（来た人全員がペア済み。通常開始 round1 / FRP append 由来の **両方を含む**）| **表示してよい（confirm 強化）**。由来は問わない。文言は従来より少し強め、**現在の手合いを作り直す操作**であることを明示 | 由来を state から識別できない（§5.4.1）ため FRP 由来だけを特別扱いしない。通常開始 round1 の再シャッフルも、FRP で積んだ組みの作り直しも、ユーザーから見れば同じ「今の手合いを作り直す」操作 |
| **results 非空（round 進行中/確定後）** | 従来どおり表示（`hasWinner` confirm）| FRP の対象外。**winner 入力済み・結果ありの保護を優先**（既存挙動維持）|

> **注（通常開始は未割当0が保証される）**: 通常開始（B1=`startBtnClass_`）の validator `validateStartableClass` は **偶数を要求**する（`cnt%2!==0` で `odd` を返す・L5517）。`generatePairing` は偶数なら全員ペア化する（backtrack で全員消化）。よって **通常開始クラスは常に未割当0** であり、**非表示ガード（未割当>0）が通常開始クラスに発火することはない**＝再生成ボタンは通常どおり表示される。未割当>0 が発生するのは FRP 部分手合い（奇数 leftover や未受付者を待機させた状態）に固有。これにより「未割当の有無」軸だけで **通常運用を壊さずに** FRP 組成中だけを hide できる。

- **判定ロジック（実装イメージ・004B）**: `buildCurrentPairingsHtml` の再生成ボタン出力を `shouldShowRegenerateButton(cls)`（§5.4.2）で gate する純 helper を新設（reader・副作用なし）。**未割当0の場合は由来を問わず非表示条件に含めない**（§5.4.1）。表示時の confirm 文言は `results 空 && 未割当0` のとき（由来を問わず）強化版（§6）。
- **実装制約**: `generatePairing` 本体・`buildCurrentPairingsHtml` の既存出力（卓番号・winner ボタン・submit ボタン）・既存テスト pin は変えない。**再生成ボタンの “出力可否” と “confirm 文言” のみを純追加 helper で制御**する（純追加・既存 id/文言は不変）。
- **保険（二重防御）**: `generatePairing` を **FRP 由来で誤って呼んだ場合に備えた no-op ガードは入れない**（generatePairing は通常開始 round1 再生成という正規用途があるため、関数本体に FRP 判定を入れると通常運用に影響する）。制御は **UI 層（ボタン gate）に閉じる**。これは「制御は UI に閉じ、汎用 mutate 関数の意味を変えない」既存方針（FRP-DESIGN-002 §10.3）と整合。コンソール/テストからの直接呼出しは依然として上書きし得る（§10 R10）。

#### 5.4.1 識別限界（Must Fix）: 由来は現行 state から判別できない

「部分手合い・未割当0」と「通常開始 round1・未割当0」は、**現行 state だけでは識別できない**。これを設計上の前提として明記する:

- FRP append 由来か通常開始由来かを識別する **start source / generatedBy / match-level source** のような保存メタ情報は **現行スキーマに存在しない**（§3.2）。
- FRP-IMPL-004 では **新保存スキーマを足さない**方針のため、`results.length===0 && 未割当0 && pairings あり` の状態について、**FRP 由来と通常開始由来を確実に判別しない**。
- したがって 004B では、**未割当0の場合に FRP 由来だけを特別扱いする実装は採用しない**。
- 採用方針:
  - `results.length===0 && pairings.length>0 && 未割当>0` → **部分手合い組成中**として再生成ボタンを **非表示**にする。
  - `results.length===0 && pairings.length>0 && 未割当0` → **通常開始/FRP 由来を問わず**再生成ボタンを **表示してよい**。ただし確認文言は従来より少し強め、**現在の手合いを作り直す操作**であることを明示する。
  - `results.length>0` → 従来どおり **winner 入力済み・結果ありの保護**を優先する。
- **start source / generatedBy 等の保存メタ情報追加は、今回の「新保存スキーマを足さない」方針と衝突するため採用しない**（§3.2 / §10 R5）。

#### 5.4.2 推奨 predicate（004B）: `shouldShowRegenerateButton(cls)`

004B で新設する純 helper の推奨仕様。**以下がすべて真のときだけ `false`（非表示）** を返し、それ以外は `true`（表示）:

- `isClassStarted(cls)`
- `state.results[cls].length === 0`
- `state.pairings[cls].length > 0`
- `getUnassignedFirstRoundPlayers(cls).length > 0`

つまり **初回ラウンドの部分手合い組成中で未割当が残っている間だけ**、再生成ボタンを非表示にする。**未割当0の場合は、通常開始/FRP 由来を state だけでは識別できないため非表示条件に含めない**（§5.4.1）。helper は **派生 reader のみ・副作用なし・新保存フラグを作らない**（`getUnassignedFirstRoundPlayers` は results 非空時に空配列を返す＝results>0 では自動的に非表示条件を満たさず true 側に倒れる。冗長だが `results.length===0` を明示条件に含め可読性を担保する）。

### 5.5 既存の通常大会運用を壊さない条件 / A・B クラス独立性

- **通常運用非破壊**: 上表の通り、通常開始（B1 経由）round1・results 非空・2回戦以降では `repairBtn_` の挙動を **一切変えない**。gate が false になるのは「部分手合い組成中（results 空・未割当>0）」のみ。
- **A/B クラス独立**: `generatePairing` / `appendFirstRoundPairs` / `resetClassForClass` / `startTournamentForClass` / `startClassPartial` は **すべて `cls` スコープ**で `state.*[cls]` のみ触る。よって A の部分手合い・再生成ガードは **B に影響しない**。`resetAll` / `resetTournamentProgressOnly` のみ全クラス対象（既存・意図通り・confirm 付き）。テストで A 操作が B に波及しないことを固定（§7 T7）。

---

## 6. UI 文言案（004C・最小化方針 / Should Fix item 7）

> いずれも **native `confirm()` / `showMsg()` のプレーンテキスト**を想定（innerHTML 連結に載せる場合は呼出側で `escapeHtml`。氏名連結時は FRP-IMPL-003 と同様 inline 解決で未エスケープ検査ヒューリスティクスを踏まない）。
> **004C は安全価値の中心ではなく、004A+004B 完了後の軽微改善**として扱う（§9）。**新規文言は最小限**にとどめ、既存の未割当セクション説明で足りる場合は文言変更しない。

| 場面 | 文言案 | 方針 |
|---|---|---|
| **results 空・未割当0 で再生成（強化 confirm／由来は問わない）** | 「現在の手合いをすべて作り直します。今ある組み合わせは破棄され、全員を1からペアし直します。よろしいですか？」（**由来に依存しない**＝「来た人から組んだ」等の FRP 前提の断定を避ける。主要危険語句＝「作り直す／破棄／全員」を含める）| 新規（中心の1件）|
| 部分手合い組成中（再生成は **非表示**）の補助文 | **出しすぎない**。非表示時にわざわざ別の補助文を足さず、**既存の未割当セクション説明（`buildFirstRoundPartialSectionHtml` L6967）で十分なら文言変更しない**。どうしても必要な場合のみ「対局を増やす＝追加作成／やり直す＝リセット」を1行で簡潔に | 任意・最小（item 7）|
| results 非空で append 不可（既存・再掲） | 「1局目が確定済みのクラスには追加できません」（`appendFirstRoundPairs` L6026 / `onClickAppendFirstRound` L6108 と同一文言を維持）| 不変 |
| 保存復元後に未割当が残っている（部分セクションの説明・既存文言の維持/微修正） | 「このクラスは部分開始中です。まだ1局目に入っていない参加者から選んで追加できます（既存の対局は変更しません）。」（現行 `buildFirstRoundPartialSectionHtml` L6967 の主旨を維持）| 不変/微修正 |
| 0/1 名で append 不可（既存・再掲） | 「2人以上を選択してください」（`onClickAppendFirstRound` L6122 / `appendFirstRoundPairs` L6027 と同一文言を維持）| 不変 |
| 奇数 leftover の説明（既存・再掲） | 「偶数は全員、奇数は末尾1人が未割当のまま残ります」「待機（未割当のまま残します）：○○ 1名」（`buildFirstRoundPartialSectionHtml` L6967 / `buildFrpAppendConfirmMessage` L5982 を維持）| 不変 |

- **方針（item 7）**: 新規文言は **「results 空・未割当0 の強化 confirm」1 件を中心**にとどめ、append/results/待機の既存文言は **そのまま維持**（既存テスト pin・運営者の慣れを壊さない）。**再生成非表示時の補助文は出しすぎない**（既存の未割当セクション説明で足りるなら追加しない）。
- **確認文言は過剰に固定しない**: 強化 confirm のテストは主要な危険語句（「作り直す」「破棄」等）の存在 or ボタン存在確認に留め、全文一致 pin にしない（§7 T6d）。

---

## 7. テスト設計（実装時に追加する想定・本書では追加しない）

> 形式は既存 FRP テスト（`test/test_frp_impl_002.js` 79 assert / `test/test_frp_impl_003.js` 64 assert）に倣い、`shogi_v4.html` から関数を Node に取り込む in-process 方式。**localStorage / `confirm` / `alert` はスタブ**し、reload は「`save()` 後に `state` を捨て、persisted 文字列を `normalizeState(JSON.parse(...))` して新 `state` に差し替える」で模す（`load()` 相当）。新テストは `test/test_frp_impl_004.js`（仮）に集約し、`run_tests.sh` の FRP-IMPL-003 ブロックの後に1ブロック追加（登録のみ・既存ブロック不変）。
>
> **004A reload テスト方針（Should Fix item 5）**: `normalizeState(JSON.parse(saved))` 模倣の reload 往復テストを **基本**とする（T1-T5）。可能なら **actual `load()` 経路または `readPersistedState()` 経路も 1 本追加**し、normalize 往復が実コードと乖離しないという設計意図を固定する（§10 R9）。ただし **既存テスト基盤との相性が悪い場合（`load()` が DOM/グローバルに依存して in-process スタブが困難な等）は、無理に新規テスト群を増やさず、既存 SAVE-FRP-002 / snapshot 系（`pairingsMatchSnapshot`）の拡張を優先**する。

| ID | テスト | 期待 |
|---|---|---|
| T1 | append 後 save→reload → `pairings[cls]` 完全一致（件数・順序・p1/p2） | 既存＋追加 match が同一配列として復元（I1/I2/I5）|
| T2 | append 後（事前に既存 match に winner 入力）save→reload → winner 保持 | 既存 winner / FRP 追加の winner:null が往復一致（I3）|
| T3 | append 後 save→reload → 各 match の lastModifiedBy 保持（auto/manual 双方） | FRP 追加='auto'、手動変更='manual' が保持（I4）|
| T4 | 奇数で append（末尾 leftover を待機）→ save→reload → `getUnassignedFirstRoundPlayers` に leftover が **派生で残る** | leftover が pairings に入らず未割当一覧に再出現（I8/I9）|
| T5 | results 非空（round 確定済み）で save→reload → append 不可（`appendFirstRoundPairs` が results ブロック）| reload 後も `results.length>=1` でブロック（I10）|
| T6 | append 済み状態で `shouldShowRegenerateButton(cls)`（004B 新 helper）が **未割当>0 で false / 未割当0で true** | 再生成ボタン gate が部分手合い組成中のみ非表示 |
| T6b | 部分手合い組成中に `generatePairing(cls)` を呼ぶと pairings が全上書きされる（＝ガードが必要な事実）ことを **負の確認**として固定し、UI gate が呼ばせない設計を担保 | `generatePairing` 本体は不変・制御は UI 層という前提の固定 |
| T6c | **predicate の戻り値だけでなく `buildCurrentPairingsHtml` の実出力で固定**: 未割当>0 のとき出力に **`repairBtn_{cls}` が含まれない**。さらに `repairBtn_{cls}` が DOM に出ない状態では **bind 対象も存在しない**（`document.getElementById('repairBtn_'+cls)` が null＝再生成 handler の bind がスキップされる・L6867）ことを確認 | helper 戻り値の単体確認に留めず、HTML 出力レベルで非表示を担保（item 4）|
| T6d | **未割当0のケースでは、通常開始/FRP 由来を問わず非表示条件にしない**（`shouldShowRegenerateButton` が true・出力に `repairBtn_{cls}` を含む）。強化 confirm を入れる場合の文言テストは **過剰に固定せず、主要な危険語句（例:「作り直す」「破棄」）の存在 or ボタン存在確認に留める**（全文一致 pin にしない）| 由来非依存（§5.4.1）・文言は緩く固定（item 4 / §6）|
| T7 | A クラス append 済み・再生成 gate 発火状態で、B クラスの通常開始/再生成/リセットが **不要な影響を受けない** | `state.*['B']` 不変・B のボタン挙動は従来通り（A/B 独立）|
| T8 | 既存 start UX 系（`test_start_ux_consolidate_001.js` 88 / `test_start_001.js` 41）が壊れない | 無改変で PASS 維持 |
| T9 | `shogi_v4.html` が **旧開始関数を FRP 経路から呼ばない**継続確認（`startTournamentForClass`/`generatePairing`/`applyStartForCandidates` を append 経路で呼ばない） | 既存 FRP-IMPL-003 の「旧開始関数非呼出」assert を 004 でも維持・拡張 |
| T10 | `run_tests.sh` 全体が **新 baseline `PASS=64 / FAIL=0 / WARN=35` から新規 FAIL/WARN を増やさない** | 004 実装後は `+N PASS`（新テスト件数分）・FAIL=0・WARN=35 維持 |

- **回帰の基準値**: TEST-HARNESS-001（#230）後の clean-tree baseline は **`64/0/35`**。004 実装 PR は「baseline 比 +新テスト PASS・新規 FAIL/WARN 0」を受け入れ条件にする。
- **未エスケープ 0 件**（`run_tests.sh` 第2層）を 004 でも維持（新文言は confirm/showMsg のプレーンテキスト中心、innerHTML 連結時は escapeHtml）。

---

## 8. スコープ外（FRP-IMPL-004 では実装しない）

明示的に **やらない**:

- **bye / 不戦勝** の実装（奇数は従来どおり末尾1人を未割当のまま待機 or 運営者追加。FRP-DESIGN-002 §9）。
- **任意組み合わせ**（誰と誰を当てるかの手動指定）。append は entry_no 昇順ペアのみ。
- **手動並び替え**（pairings のドラッグ等での順序変更）。
- **複数 round の生成 / 2回戦以降の部分手合い**（FRP は1局目のみ。results 非空は全面ブロック）。
- **既存 pairing の再生成を FRP に統合すること**（`generatePairing` 本体は変えない。制御は UI gate に閉じる）。
- **production 反映 / 本番公開**（release PR は別途・別タスク）。
- match スキーマ拡張（round/table/source/generatedBy 等のフィールド追加。§3.2）。

---

## 9. 実装候補の分割案（最小安全単位）

FRP-IMPL-004 を **3 つの小 PR** に分割することを提案する（各 PR が独立にレビュー・rollback 可能）。

| スライス | 内容 | 触るもの | 受け入れ |
|---|---|---|---|
| **FRP-IMPL-004A**（保存復元テスト＋堅牢化） | §7 T1-T5 の reload 往復テストを追加。`shogi_v4.html` は **原則無変更**（不変条件が既に成立。テストで固定）。万一テストで不変条件の穴が出たら、その穴の最小修正のみ | `test/test_frp_impl_004.js`（新規）/ `run_tests.sh`（1ブロック登録）/（必要時のみ shogi_v4.html 最小修正）| baseline `64/0/35` → +T1-T5 PASS・FAIL0・WARN35 |
| **FRP-IMPL-004B**（再生成ボタン制御） | §5.4 の `shouldShowRegenerateButton(cls)` 純 helper 新設（§5.4.2 predicate）＋`buildCurrentPairingsHtml` の再生成ボタン出力 gate＋強化 confirm。T6/T6b/T6c/T6d/T7 追加 | `shogi_v4.html`（純追加 helper＋gate）/ `test/test_frp_impl_004.js` 追記 / `run_tests.sh` | 通常運用非破壊・A/B 独立を T7 で固定。未割当0 は由来非依存（§5.4.1）|
| **FRP-IMPL-004C**（UI 文言・運営向け説明）| §6 の**新規文言を最小限**反映（「results 空・未割当0 の強化 confirm」を中心に1件。**非表示時の補助文は出しすぎない／既存の未割当セクション説明で足りるなら文言変更しない**）。既存文言は維持 | `shogi_v4.html`（文言）/ 必要なら docs/notes | 既存テスト pin 非破壊・未エスケープ0。**004C は安全価値の中心ではなく軽微改善**（004A+004B 完了後）|

- **推奨順序**: 004A → 004B → 004C（テストで現状を固定してから、制御を足し、最後に文言）。
- **最小で価値**: **004A + 004B** で「壊れない保証の固定」と「黙って壊す経路の封じ込め」が揃う。**004C は安全価値の中心ではなく、004A+004B 完了後の軽微改善**（運営者体験の仕上げ・文言は最小限・item 7）。
- 各スライスとも **base=orphan の当該時点 HEAD・Draft・人間承認後に Ready/merge**（既存 FRP 運用に準拠）。

---

## 10. リスクと判断事項

| # | 事項 | 自動ブロック or 人間判断 | 方針 |
|---|---|---|---|
| R1 | **再生成ボタンを hide にするか disabled にするか** | 人間判断（UX）| 本書推奨=hide（誤認排除）。レビューで最終決定 |
| R2 | 部分手合い・未割当0 での再生成を **許すか禁じるか** | 人間判断 | 本書推奨=確認付きで許可（通常 round1 再シャッフルと同義）。「全部作り直す」と明示 |
| R3 | `generatePairing` 本体に FRP 判定を入れるか | **自動ブロック=入れない** | 制御は UI gate に閉じる（汎用 mutate の意味を変えない・通常運用非破壊）|
| R4 | **旧 match に `lastModifiedBy` が無い**既存大会データ | 自動 | `normalizeState` が 'auto' 補完（L792-794）。`pairingsMatchSnapshot` は両側存在時のみ比較（L5101）。→ 旧データ互換・テスト T3 でも null/欠損ケースを1件入れる |
| R5 | **保存後正規化 `normalizeState` との関係** | 自動 | append は正準形のため normalize 往復恒等。**match スキーマ拡張は sanitizeMatch を必ず同時更新**（しない限り剥がれる）。本スライスは拡張しない |
| R6 | 既存大会データ（FRP 以前に保存）との互換 | 自動 | normalize が旧形を吸収（entry_no/yomi/member 等 default 補完・L760-782）。FRP gate は派生判定のみで旧データでも安全に false/true |
| R7 | SAVE-FRP-003 を新設するか | 人間判断 | 本書推奨=新設しない（§4.4）。必要なら `pairingsMatchSnapshot` 拡張＋既存 SAVE-FRP-002 流用を第一候補 |
| R8 | `submitRound` 誤確定で append 不可になる | 人間判断（運用）| 既存 confirm 維持。004 では触らない（results 非空ブロックは仕様通り）|
| R9 | reload テストの `load()` 模倣が実 `load()` と乖離 | 自動 | テストは `normalizeState(JSON.parse(saved))` で `load()` の normalize 経路を忠実に再現（§7 冒頭）。可能なら actual `load()`/`readPersistedState()` 経路も1本足して乖離を抑える（item 5）|
| R10 | **`generatePairing` の直接呼び出し**（コンソール / テスト）による破壊 | 人間判断（**今回スコープでは許容**）| 004B は **UI gate により通常操作での破壊を防ぐ**設計であり、**`generatePairing` 本体の破壊的性質（`state.pairings[cls]` 全上書き L6394）は変更しない**。そのため、**コンソールやテストから `generatePairing` を直接呼べば、従来どおり `state.pairings[cls]` は上書きされ得る**。これは **今回スコープでは許容**し、**通常運用 UI の安全化を優先**する（UI 層に制御を閉じる §5.4）|

---

## 11. 受け入れ条件（FRP-IMPL-004 実装 PR 群に課す）

1. **保存復元不変条件 I1-I11**（§3.1）が reload 往復テスト（§7 T1-T5）で固定されている。
2. **`repairBtn_`（再生成）が部分手合い組成中（results 空・未割当>0）で発火しない**（§5.4 / §5.4.2・T6/T6c）。**results 空・未割当0 では由来（通常開始/FRP）を問わず表示**するが、確認文言を従来より少し強め「現在の手合いを作り直す」ことを明示（§5.4.1・T6d）。通常開始クラスは validator が偶数を要求するため常に未割当0＝**非表示ガードは発火せず通常どおり表示**（§5.4 注）。results 非空 / 2回戦以降は **挙動不変**（`hasWinner` confirm 維持）。
3. **A/B クラス独立**（§5.5・T7）。FRP・再生成制御が他クラスに波及しない。
4. **旧開始関数（`startTournamentForClass`/`generatePairing`/`applyStartForCandidates`）を FRP append 経路から呼ばない**（T9）。`generatePairing` 本体は不変（制御は UI gate）。
5. **`run_tests.sh` = baseline `64/0/35` から新規 FAIL/WARN 0**（新テスト分のみ +PASS）。未エスケープ 0 件維持（T10）。
6. **match スキーマ非拡張**（§3.2 / R5）。bye / 任意組み合わせ / 手動並び替え / 複数 round 生成 / production 反映は **やらない**（§8）。
7. 既存 `test_start_ux_consolidate_001`(88) / `test_start_001`(41) / `test_frp_impl_002`(79) / `test_frp_impl_003`(64) が無改変 PASS（T8）。

---

## 12. 改訂履歴

| 版 | 日付 | 変更 |
|---|---|---|
| v0.1 | 2026-06-17 | 初版（PR #231 head `0d77f9b`）|
| v0.2 | 2026-06-17 | レビュー反映（docs-only）。**Must Fix**: 「部分手合い・未割当0」と「通常開始 round1・未割当0」を **現行 state では識別できない**問題を明記——§5.4 表の未割当0 の2行（FRP由来/通常開始由来）を**由来非依存の1行に統合**し、§5.4.1（識別限界）・§5.4.2（推奨 predicate `shouldShowRegenerateButton`）を新設。**Should Fix**: §3.2 を **match-level に限定**（アプリ別文脈の `source`/`sourceState` と区別）／§7 に 004B 出力テスト T6c・T6d（`buildCurrentPairingsHtml` 出力に `repairBtn_` が出ない・bind 対象なし・文言は緩く固定）と 004A reload 方針（actual `load()`/`readPersistedState` 1本＋基盤相性悪い場合は既存拡張優先）を補強／§10 R10（`generatePairing` 直接呼出の限界は許容）追加／§6・§9 で 004C 文言を最小化（安全価値の中心ではない軽微改善）／§11 #2 を由来非依存に更新。 |

---

## 付録 A. 参照した実装位置（`shogi_v4.html` @ `9c4551b`）

| 関数 / 箇所 | 行 | 役割 |
|---|---|---|
| `normalizeState` / `sanitizeMatch` | 741 / 787 | 読込時正規化・match 正準形 `{p1,p2,winner,lastModifiedBy}` |
| `save` / `load` | 963 / 986 | 保存（raw）/ 読込（normalize）|
| `readPersistedState` | 5048（→5071 normalize）| 保存検証用の normalized 読込 |
| `isClassStarted` / `setClassStarted` / `syncGlobalStartedFromClasses` / `classStartedInPersisted` | 903 / 917 / 892 / 934 | per-class started SoT・互換 state.started 同期 |
| `pairingsMatchSnapshot` | 5090 | SAVE-FRP-002 / SAVE-004 snapshot 比較 |
| `getUnassignedFirstRoundPlayers` | 5912 | 1局目未割当の派生 |
| `buildFirstRoundPartialPairs` | 5945 | 選択者→候補ペア（pure・leftover 非保存）|
| `appendFirstRoundPairs` | 6016 | append＋backup/rollback＋SAVE-FRP-002 |
| `onClickAppendFirstRound` / `frpAppendInFlight` | 6102 / 6101 | append handler・再入防止 |
| `generatePairing` | 6311（上書き L6394）| 全員ペア再生成（危険経路）|
| `buildCurrentPairingsHtml`（`repairBtn_` 出力）| 6741（L6848）| 現ラウンド描画・再生成ボタン |
| `bindTournamentEvents`（`repairBtn_` の hasWinner confirm）| 6853（L6867-6874）| 再生成ボタンの現行ガード |
| `buildClassActionBarHtml` / `bindClassActionBarEvents` | 6895 / 6931 | 開始/部分開始/リセット ボタン |
| `buildFirstRoundPartialSectionHtml` | 6959 | 未割当一覧＋追加ボタン |
| `renderTournament` | 6984 | クラス別描画の入口 |
| `resetClassForClass` / `resetTournamentProgressOnly` / `resetAll` | 6142 / 8117 / 8153 | クラス別 / 進行のみ / 全リセット |
| `startTournamentForClass` / `startTournament`(legacy) / `applyStartForCandidates` | 5843 / 5796 / 5710 | 全員開始経路（FRP 非流用）|
