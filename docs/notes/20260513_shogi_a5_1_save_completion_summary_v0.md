# SHOGI-TOUR A-5.1 保存安全化 完了整理 v0

- 作成日: 2026-05-13
- 改訂日: 2026-05-13（SAVE-004 / SAVE-003b-1 / SAVE-003b-2 / SAVE-003b-3 完了反映）
- 位置づけ: A-5.1-SAVE-001 / SAVE-002 / SAVE-003 / SAVE-004 / SAVE-003b-1 / SAVE-003b-2 / SAVE-003b-3 の完了状況を 1 ファイルに集約した整理メモ
- 関連ベース: `docs/notes/20260512_shogi_a5_1_save_design_001_persistence_inventory_v0.md`（SAVE-DESIGN-001 v0.1 の保存処理棚卸し）
- 禁止事項: 本ドキュメントは整理のみ。実装変更・テスト変更・横展開は行わない。

---

## 1. 完了済みタスク一覧（台帳）

| Task ID | 内容 | Branch | PR | Status | Squash SHA | Codex | CI |
|---|---|---|---|---|---|---|---|
| A-5.1-SAVE-001 | 参加者削除時の保存未確認検知 | `feat/a5-1-save-001-remove-player-verify` | [#46](https://github.com/kazuo1970takahashi-sketch/shogi/pull/46) | Done / Merged | `219d328e011824b38457a98a49ce65dcd9cdff00` | —（PR コメント・closing 記録に判定値の記載なし） | Unit / Security / E2E SUCCESS |
| A-5.1-SAVE-002 | 参加者追加時の保存未確認検知 | `feat/a5-1-save-002-add-player-verify` | [#47](https://github.com/kazuo1970takahashi-sketch/shogi/pull/47) | Done / Merged | `a19e1934d0f927ba9737712e8ed15c48f165cf86` | B+ / Conditional Go（Must/Should なし） | Unit / Security / E2E SUCCESS |
| A-5.1-SAVE-003 | 大会進行 core path の保存未確認検知 | `feat/a5-1-save-003-pairing-results-verify` | [#48](https://github.com/kazuo1970takahashi-sketch/shogi/pull/48) | Done / Merged | `1e13ce19c7e97dbf610eaea385c79b71a09075ed` | B+ / Conditional Go（Must/Should なし、再レビュー後） | Unit / Security / E2E SUCCESS |
| A-5.1-SAVE-004 | `generatePairing(cls)` の保存確認を簡易シグネチャ比較に強化 | `feat/a5-1-save-004-generate-pairing-signature` | [#50](https://github.com/kazuo1970takahashi-sketch/shogi/pull/50) | Done / Merged | `42e4673030b981aa88f699de61ef015d2a296b22` | A / Go（Must / Should / Nice-to-Have すべてなし） | Unit / Security / E2E SUCCESS |
| A-5.1-SAVE-003b-1 | 参加者追加経路の保存未確認検知（サジェスト経由 / 過去参加者単発 / 過去参加者一括） | `feat/a5-1-save-003b-1-add-paths-verify` | [#52](https://github.com/kazuo1970takahashi-sketch/shogi/pull/52) | Done / Merged | `af2f17374389829821200dadb1055d44bc6a4231` | A / Go（Must / Should なし、Nice-to-Have は後続対応のみ） | Unit / Security / E2E SUCCESS |
| A-5.1-SAVE-003b-2 | 対局画面編集経路の保存未確認検知（対戦相手変更 / swap / 過去結果修正 p1 / p2） | `feat/a5-1-save-003b-2-pairing-result-edit-verify` | [#54](https://github.com/kazuo1970takahashi-sketch/shogi/pull/54) | Done / Merged | `9f4144f4991b34981a9beacdd678245d6e283f0d` | A / Go（Must / Should なし、Nice-to-Have は後続対応のみ） | Unit / Security / E2E SUCCESS |
| A-5.1-SAVE-003b-3 | 手動編集系の保存未確認検知（updateField の member / grade select、bulkEditNames の一括氏名変更） | `feat/a5-1-save-003b-3-edit-fields-verify` | [#57](https://github.com/kazuo1970takahashi-sketch/shogi/pull/57) | Done / Merged | `c5929ecaa8a3652af1c8d7b3dbabff1ebee1b3eb` | A / Go（Must / Should なし、Nice-to-Have は後続対応のみ） | Unit / Security / E2E SUCCESS |

### 1.1 各タスクの詳細

#### A-5.1-SAVE-001（PR #46）

- `removePlayer()` の `save()` 後に `verifyPlayerAbsent(id, cls)` で削除対象 id が localStorage 上にも残っていないことを確認する。
- 保存確認できない場合は `showMsg(.., 'warn')` + `console.warn`。alert / rollback / retry なし。
- SAVE-DESIGN-001 §1.4 の方針どおり「保存失敗」ではなく「保存未確認」と表現。

#### A-5.1-SAVE-002（PR #47）

- `addPlayer()` の `save()` 後に `verifyPlayerPersistedById(id, cls, name)` で id + cls + name の 3 軸一致を確認する。
- 同姓同名や A/B クラス境界での偽陽性を抑制（SAVE-001 の「負の検証」に対し、こちらは「正の検証」）。
- SAVE-002 専用テスト追加、`run_tests.sh` に組み込み。

#### A-5.1-SAVE-003（PR #48）

- 大会進行 core path 4 関数に保存未確認検知を追加:
  - `startTournament()` — `state.started === true` を確認
  - `generatePairing(cls)` — `state.pairings[cls].length` が生成後件数と一致
  - `setWinner(cls, idx, wid)` — `state.pairings[cls][idx].winner` が expected と一致
  - `submitRound(cls)` — `state.results[cls]` 件数増 + `state.pairings[cls]` が新値（field-compare）と一致
- 新規 helper:
  - `readPersistedState()` — localStorage 再読込 + JSON.parse + 最低限の state schema 検証（players / pairings / results の A/B が Array）。不正時 `null`。
  - `pairingsMatchSnapshot(persisted, expected)` — pairings の length + p1 / p2 / winner / lastModifiedBy（両側存在時のみ）を比較する小型 helper。submitRound の stale 検知に使用。
- Codex 初回レビューで以下 2 点を指摘 → 修正反映済み（同 PR #48 内）:
  - Must Fix: `readPersistedState()` の構造不正判定不足（`{started:true}` のような壊れた object を有効として通す false positive）→ schema 検証で解消
  - Should Fix: `submitRound()` の pairings 検証が length-only → `pairingsMatchSnapshot` 経由の field-compare に強化
- Nice-to-Have として「`generatePairing()` も `pairingsMatchSnapshot` に揃えると精度が更に揃う」が残り、後続の SAVE-004 で対応した。

#### A-5.1-SAVE-004（PR #50）

- `generatePairing(cls)` の `save()` 後の保存確認を **length-only → `pairingsMatchSnapshot` による field-compare に強化**。同件数だが中身が古い stale pairings を検知できるようになり、`submitRound` と verify 粒度が揃った。
- 比較対象は既存 `pairingsMatchSnapshot` 仕様に従い `p1 / p2 / winner`、両側に存在する場合のみ `lastModifiedBy`（片側欠損は旧データ互換として容認）。
- **既存 `pairingsMatchSnapshot` を流用**。新規 helper は追加していない。
- `console.warn` タグを `SAVE-003` → `SAVE-004` に更新。`showMsg(.., 'warn')` 文言・通知方針（alert / rollback / retry / 警告バナー / warn 集約なし）は変更なし。
- SAVE-003 Codex 再レビューの Nice-to-Have 指摘に対応する小粒 PR。Codex Review: A / Go（Must / Should / Nice-to-Have すべてなし）。
- テストは新規ファイルを増やさず `test/test_a5_1_save_003.js` に SAVE-004 ケースを追記（同件数 stale 検知、p1 / p2 / winner / lastModifiedBy 不一致検知、片側欠損互換、新規 helper 不追加の間接確認）。

#### A-5.1-SAVE-003b-1（PR #52）

- 参加者追加経路 4 callsite に保存未確認検知を追加：
  - `handleSuggestClassAdd()` — サジェスト経由の追加 / クラス変更（共通 `postSuccess` 内）
  - `handlePastParticipantClassAdd()` クラス変更経路（[shogi_v4.html:1678](../../shogi_v4.html:1678) 相当）
  - `handlePastParticipantClassAdd()` 新規追加経路（[shogi_v4.html:1704](../../shogi_v4.html:1704) 相当）
  - `finalizeAddPastParticipants()` — 過去参加者から複数選択して一括追加
- **既存 `verifyPlayerPersistedById(id, cls, name)` を流用**。新規 helper は追加していない。
- `handleSuggestClassAdd()` の `postSuccess` には verify 引数（`verifyPid` / `verifyCls` / `verifyName` / `warnMsg`）を追加し、追加経路・クラス変更経路の両方で同じ helper を共有。
- `handlePastParticipantClassAdd()` はクラス変更経路と新規追加経路にそれぞれ verify ブロックを追加(同 id が新 cls 側に存在することの正の検証。旧 cls 不在の負の検証は false negative リスクを避けるため省略)。
- `finalizeAddPastParticipants()` はバッチ追加分の `{id, cls, name}` を `addedTargets` 配列に保持し、`save()` 後に各件 verify。**複数件未確認でも UI warn は 1 回に集約**（UI ノイズ回避、件数は console.warn / showMsg 文言に含める）。
- `console.warn` タグは `SAVE-003b` で統一。通知方針（`showMsg(.., 'warn')` + `console.warn` のみ、alert / rollback / retry UI / 警告バナー / warn 集約 UI / 文言短縮 / debounce 未導入）は変更なし。
- 新規テスト `test/test_a5_1_save_003b_add_paths.js` を追加（PASS=81、`run_tests.sh` に独立ブロック追加）。
- Codex Review: A / Go（Must / Should なし、Nice-to-Have は後続対応のみ）。Unit / Security / E2E すべて SUCCESS。

#### A-5.1-SAVE-003b-2（PR #54）

- 対局画面編集経路 3 callsite に保存未確認検知を追加：
  - `bindChangePairingModalEvents()` — 対戦相手変更 / swap（`chg-save` クリックハンドラ内）
  - `bindEditPastResultModalEvents()` p1 ボタン — 過去結果の p1 勝ち修正
  - `bindEditPastResultModalEvents()` p2 ボタン — 過去結果の p2 勝ち修正
- `bindChangePairingModalEvents()` は `save()` 後に **`readPersistedState()` + `pairingsMatchSnapshot(persisted.pairings[cls], state.pairings[cls])`** で配列全体の field-compare。単発変更 / swap の両経路で同じロジック。swap 後に **片方だけ persisted が stale** という状況も `pairingsMatchSnapshot` が全エントリ比較するため検知可能。
- `bindEditPastResultModalEvents()` は p1 / p2 ボタン共通の **関数スコープローカルなクロージャ `verifyPastResultPersisted_ep(expectedWinner)`** を使い、`readPersistedState()` 後にインライン index 確認（`results` / `results[cls]` / `results[cls][roundIdx]` / `results[cls][roundIdx][matchIdx]` の存在チェック + `.winner === expectedWinner`）。多次元 index の欠落（roundIdx / matchIdx）も検知。
- **既存 `readPersistedState()` / `pairingsMatchSnapshot()` を流用**。新規 **トップレベル** helper は追加していない（`verifyPastResultPersisted_ep` は bind 関数内のクロージャで、helper namespace に登場せず）。
- `console.warn` タグは `SAVE-003b` で統一。通知方針（`showMsg(.., 'warn')` + `console.warn` のみ、alert / rollback / retry UI / 警告バナー / warn 集約 UI / 文言短縮 / debounce 未導入）は変更なし。
- 新規テスト `test/test_a5_1_save_003b_edit_paths.js` を追加（PASS=75、`run_tests.sh` に独立ブロック追加）。mock document は `addEventListener` で登録した click ハンドラーを保持し、`element.click()` で発火できるよう拡張。
- Codex Review: A / Go（Must / Should なし、Nice-to-Have は後続対応のみ）。Unit / Security / E2E すべて SUCCESS。
- 補足: 同時期に確認した Mini Shai-Hulud 第二波の影響確認は本 PR とは独立。本 PR には Mini Shai-Hulud 関連の修正は混入していない。

#### A-5.1-SAVE-003b-3（PR #57）

- 手動編集系 2 callsite に保存未確認検知を追加：
  - `updateField()` — 登録欄の `member` / `grade` の select onchange 経路（[shogi_v4.html:2960](../../shogi_v4.html:2960) 相当）
  - `bindBulkEditModalEvents()` 内 `bulk-save` click handler — 氏名一括編集モーダル保存（[shogi_v4.html:3428](../../shogi_v4.html:3428) 周辺相当）
- `updateField()` は **新規 helper `verifyPlayerFieldPersisted(cls, playerId, field, expected)`** を追加（field 軸での厳密一致照合）。`member` / `grade` の値が persisted 側に正しく反映されているか確認。`updateField` は keystroke ではなく select onchange のみで発火するため、warn 連発リスクは低い。
- `bindBulkEditModalEvents` の `bulk-save` handler は **既存 `verifyStatePersisted(id, expectedName)` を全件ループ**で流用し、未確認件数 `unverified` を集計。`unverified > 0` の時に **warn は 1 回に集約**（SAVE-003b-1 `finalizeAddPastParticipants` と同じ集約方式）。
- 既存の空欄 / 同名重複 pre-save alert は維持（保存未確認時の post-save alert は出さない）。
- **新規トップレベル helper は 1 個のみ追加**（`verifyPlayerFieldPersisted`）。過剰汎用化（`verifyPlayersPersistedByIds` / `verifyPlayerFieldsPersisted` / `verifyBulkNamesPersisted` 等）はしない。
- `console.warn` タグは `SAVE-003b` で統一。通知方針（`showMsg(.., 'warn')` + `console.warn` のみ、alert / rollback / retry UI / 警告バナー / warn 集約 UI / 文言短縮 / debounce / toast 集約 / aria-live 未導入）は変更なし。
- 新規テスト `test/test_a5_1_save_003b_edit_fields.js` を追加（PASS=89、`run_tests.sh` に独立ブロック追加）。
- Codex Review: A / Go（Must / Should なし、Nice-to-Have は後続対応のみ）。Unit / Security / E2E すべて SUCCESS。
- Codex Nice-to-Have（後続対応）:
  - 将来 `updateField()` の対象 field が増える場合は、`verifyPlayerFieldPersisted()` に field allowlist または `hasOwnProperty` 判定を足すとより堅い
  - SAVE-UX 側で warn 文言短縮・集約表示・retry UI を扱う方針は継続でよい

---

## 2. ロードマップ（A-5.1 保存安全化の進捗）

### 2.1 完了済み

| 段階 | 内容 | 対応 callsite（SAVE-DESIGN-001 §2.3 の S 番号） |
|---|---|---|
| A-5.1-SAVE-001 | 参加者削除時の保存未確認検知 | S10（removePlayer） |
| A-5.1-SAVE-002 | 参加者追加時の保存未確認検知（手入力） | S01（addPlayer） |
| A-5.1-SAVE-003 | 大会進行 core path の保存未確認検知 | S14（startTournament）/ S15（generatePairing）/ S16（setWinner）/ S18（submitRound） |
| A-5.1-SAVE-004 | `generatePairing(cls)` の保存確認を field-compare に強化（SAVE-003 length-only の精度を `pairingsMatchSnapshot` で揃える） | S15（generatePairing） |
| A-5.1-SAVE-003b-1 | 参加者追加経路の保存未確認検知（サジェスト経由 / 過去参加者単発 / 過去参加者一括）。`verifyPlayerPersistedById` 流用、バッチ追加は warn 1 回集約 | S02（handlePastParticipantClassAdd state、追加・変更）/ S04（handleSuggestClassAdd state、追加・変更）/ S07（finalizeAddPastParticipants） |
| A-5.1-SAVE-003b-2 | 対局画面編集経路の保存未確認検知（対戦相手変更 / swap / 過去結果修正 p1 / p2）。`readPersistedState` + `pairingsMatchSnapshot` 流用、過去結果修正はローカルクロージャ `verifyPastResultPersisted_ep` 経由 | S17（bindChangePairingModalEvents）/ S19（bindEditPastResultModalEvents） |
| A-5.1-SAVE-003b-3 | 手動編集系の保存未確認検知（updateField の member / grade select、bulkEditNames の一括氏名変更）。新規 helper `verifyPlayerFieldPersisted` 1 個追加、bulkEditNames は `verifyStatePersisted` 流用 + warn 1 回集約 | S08（updateField）/ S11（bulkEditNames） |

### 2.2 残タスク候補（次に着手し得るもの）

> SAVE-DESIGN-001 v0.1 §5「推奨順序」に対し、SAVE-002 / SAVE-003 で実際に投入したスコープは Must 4 関数に絞った。残りは下記候補として後続タスクで扱う。

| 候補 ID（暫定） | 内容 | 主な対象 callsite | 備考 |
|---|---|---|---|
| **A-5.1-SAVE-UX** | UI 改善（warn 集約 / retry UI / 文言短縮） | 全 SAVE 系横断 | 連続失敗時の閾値表示・retry / 自動再保存・warn 文言短縮 / aria-live / toast 集約 / debounce など。SAVE-DESIGN-001 §1.4 で後続切り出しと明記。SAVE-003b-3 の Codex Nice-to-Have（warn 文言短縮・集約表示・retry UI）もここで扱う。**未着手** |
| **A-5.1 保存安全化の区切り判定** | SAVE-003b 完了後の振り返り・区切り宣言 | — | SAVE-003b-1 / 2 / 3 完了で「Must スコープの保存未確認検知」は概ね一巡。残候補（SAVE-UX / SAVE-FUTURE 群 / `verifyPlayerFieldPersisted` の field allowlist 化など）の優先順位と区切り判定を別タスクで整理する。**未着手** |
| **Security hygiene**（A-5.1 とは別系統、完了済） | `trufflesecurity/trufflehog@main` を SHA / tag 固定に変更（Mini Shai-Hulud 第二波 影響確認時に発見、IoC とは別件の一般 supply-chain hygiene） | `.github/workflows/e2e.yml` | ✅ **完了**（PR #56、commit `9c21341`、`v3.95.3` に固定）。本 PR とは別系統 |
| 後続検討 | 会員マスタ系 verify（V2 拡張） | S03 / S05（クラス変更時 master）/ S06 / S09（yomi 補完）/ S22 / S23 / S24（master edit / delete / restore） | SAVE-DESIGN-001 §5 の旧「SAVE-003」枠。MASTER-001 で V2（name 軸）は適用済、`last_class` 等の新軸は別タスク |
| FUTURE | バッチ系 / I/O 系 / report 系 / 2 段保存 | S11 / S20 / S21 / S25 / S26 / S27 / S28 / S29 / S30 | SAVE-DESIGN-001 §5「SAVE-FUTURE」枠 |

注: タスク ID `SAVE-UX` / 「A-5.1 保存安全化の区切り判定」は本ドキュメント時点での暫定名。正式起票時に再採番してよい。`SAVE-004` / `SAVE-003b-1` / `SAVE-003b-2` / `SAVE-003b-3` は 2026-05-13 に完了済（§1 参照）。Security hygiene（trufflehog action pinning）は SAVE 系本流とは別系統で同じく 2026-05-13 に完了済（PR #56）。

---

## 3. 現時点の保存安全化方針

SAVE-DESIGN-001 §1.4 を起点に、SAVE-001 〜 SAVE-003 の実装で実証された方針を集約する。

### 3.1 通知方針（変更なし）

- 保存確認できない場合も「保存失敗」と断定せず、「保存未確認」として扱う。
- `alert` で大会運営を止めない。
- rollback しない（in-memory への変更は保持）。
- `showMsg(.., 'warn')` + `console.warn` で通知する。
- UI 強化（連続失敗の集約バナー / retry UI / 文言短縮）は SAVE-UX 系で扱う。本流（SAVE-001/002/003 系）の PR には含めない。

### 3.2 verify helper の設計指針

- 既存 helper（`verifyStatePersisted` / `verifyMasterPersisted` / `verifyPlayerAbsent` / `verifyPlayerPersistedById`）は変更しない。SAVE-001 / 002 / MASTER-001 のテストを保護する。
- 保存対象ごとに verify 軸が違うため、単一の汎用 helper に押し込めない。
- 共通の primitive として `readPersistedState()`（schema 検証付き state 再読込）を SAVE-003 で導入。pairings / results / started など複数軸を持つ箇所はこの primitive 上で個別判定する。
- `readPersistedState()` は最低限の schema（players / pairings / results の A/B が Array）まで検証して `null` を返す。`{started:true}` のような壊れた object を「有効」として通さない（PR #48 Codex Must Fix の教訓）。
- 配列の中身比較が必要な箇所（pairings stale 検知）は専用の小型 helper（`pairingsMatchSnapshot`）を追加する。過剰な deep equal helper は持たない。
- `lastModifiedBy` のような後付けフィールドは「両側に存在する場合のみ」比較し、片側欠損は容認（旧データ互換）。

### 3.3 スコープ規律

- 1 PR に Must スコープのみを入れ、Should / Nice-to-Have は別 PR に切り出す。
- SAVE-002 / SAVE-003 はいずれも、SAVE-DESIGN-001 §5 の計画スコープより**狭く**着地している。Must 4 関数に絞ることで Codex レビュー範囲を明確化し、リグレッション混入リスクを下げる方針が定着した。
- E2E（Playwright）は既存ハッピーパスが緑であれば SAVE 系で専用 E2E は追加しない（unit でのロジック検証で十分）。

### 3.4 false positive を避けるための粒度設計

- 「id だけ」「name だけ」「length だけ」での比較は false positive / false negative を生む。SAVE-001 〜 SAVE-003 の実装で得た具体例:
  - addPlayer: `id + cls + name` の 3 軸（同姓同名対策）
  - removePlayer: id 不在の負の検証（クラス境界）
  - submitRound: results 件数 + pairings の field-compare（stale 検知）
  - 全般: 構造不正 object（players/pairings/results 欠落）を schema 検証で `null` 化

---

## 4. SAVE-DESIGN-001 v0.1 の §5「推奨順序」との差分

SAVE-DESIGN-001 v0.1 §5 で計画したスコープと、実際にマージされたスコープの差分を整理する。

| 段階 | v0.1 計画スコープ | 実装スコープ（main 反映済） | 差分 |
|---|---|---|---|
| SAVE-001 | S10（removePlayer） | S10 | 一致 |
| SAVE-002 | S01 / S02 / S04 / S07 / S08 / S11 / S17 / S18 / S19 / S14 | **S01 のみ** | S02 / S04 / S07 / S08 / S11 / S17 / S18 / S19 / S14 は SAVE-003 / SAVE-003b / 別タスクに送り |
| SAVE-003 | S03 / S05 / S06 / S09 / S22 / S23 / S24 / S16 | **S14 / S15 / S16 / S18**（大会進行 core path） | 計画では「会員マスタ系 + setWinner」だったが、実装では「大会進行 core path Must」に再定義。会員マスタ系は後続検討に送り |
| SAVE-FUTURE | S15 / S20 / S21 / S25 / S26 〜 S30 | 未着手 | 計画通り |

差分の意図:
- 1 PR の変更範囲を Must スコープに絞り、Codex レビュー粒度を保つため。
- Should / Nice-to-Have は別 PR（SAVE-003b / SAVE-004 / SAVE-UX）に分離する方針が SAVE-002 / SAVE-003 で定着した。
- 会員マスタ系（旧 SAVE-003 計画）は MASTER-001 で V2 軸（name）は既に適用済みのため、優先度を下げ後続検討に送った。

---

## 5. 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-13 | v0 作成。SAVE-001 / 002 / 003 マージ完了を踏まえ、台帳・残タスク候補・方針を 1 ファイルに整理。 |
| 2026-05-13 | SAVE-004（PR #50, commit `42e4673`）の完了を反映。`generatePairing(cls)` の保存確認を field-compare に強化。残候補は SAVE-003b / SAVE-UX に縮小。 |
| 2026-05-13 | SAVE-003b-1（PR #52, commit `af2f173`）の完了を反映。参加者追加経路 4 callsite に保存未確認検知を追加。`verifyPlayerPersistedById` 流用、新 helper なし、`finalizeAddPastParticipants` は warn 1 回集約。残候補は SAVE-003b-2 / SAVE-003b-3 / SAVE-UX に細分化。 |
| 2026-05-13 | SAVE-003b-2（PR #54, commit `9f4144f`）の完了を反映。対局画面編集経路 3 callsite（`bindChangePairingModalEvents` / `bindEditPastResultModalEvents` p1 / p2）に保存未確認検知を追加。`readPersistedState` + `pairingsMatchSnapshot` 流用、過去結果修正はローカルクロージャ `verifyPastResultPersisted_ep` 経由でトップレベル helper 追加なし。残候補は SAVE-003b-3 / SAVE-UX / Security hygiene（trufflehog action pinning、Mini Shai-Hulud 第二波影響確認時に発見した別件）に縮小。 |
| 2026-05-13 | SAVE-003b-3（PR #57, commit `c5929ec`）の完了を反映。手動編集系 2 callsite（`updateField` の member / grade、`bindBulkEditModalEvents` の bulk-save handler）に保存未確認検知を追加。新規 helper `verifyPlayerFieldPersisted` 1 個追加、bulkEditNames は既存 `verifyStatePersisted` 流用 + warn 1 回集約。Security hygiene（trufflehog pinning、PR #56）も同時期に完了済として記録。残候補は SAVE-UX と「A-5.1 保存安全化の区切り判定」のみ。 |

---

## 6. 関連ドキュメント

- 設計起点: [`docs/notes/20260512_shogi_a5_1_save_design_001_persistence_inventory_v0.md`](20260512_shogi_a5_1_save_design_001_persistence_inventory_v0.md) — SAVE-DESIGN-001 v0.1 保存処理棚卸し
- ロードマップ: [`docs/specs/20260505_1500_shogi_roadmap.md`](../specs/20260505_1500_shogi_roadmap.md) — A-5.1 SAVE 行を追記
- 引き継ぎ書: [`HANDOFF.md`](../../HANDOFF.md) — §5.5 機能修正履歴に SAVE-001 / 002 / 003 を追記
