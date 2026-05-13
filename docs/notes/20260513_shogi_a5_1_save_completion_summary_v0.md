# SHOGI-TOUR A-5.1 保存安全化 完了整理 v0

- 作成日: 2026-05-13
- 改訂日: 2026-05-13（SAVE-004 完了反映）
- 位置づけ: A-5.1-SAVE-001 / SAVE-002 / SAVE-003 / SAVE-004 の完了状況を 1 ファイルに集約した整理メモ
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

---

## 2. ロードマップ（A-5.1 保存安全化の進捗）

### 2.1 完了済み

| 段階 | 内容 | 対応 callsite（SAVE-DESIGN-001 §2.3 の S 番号） |
|---|---|---|
| A-5.1-SAVE-001 | 参加者削除時の保存未確認検知 | S10（removePlayer） |
| A-5.1-SAVE-002 | 参加者追加時の保存未確認検知（手入力） | S01（addPlayer） |
| A-5.1-SAVE-003 | 大会進行 core path の保存未確認検知 | S14（startTournament）/ S15（generatePairing）/ S16（setWinner）/ S18（submitRound） |
| A-5.1-SAVE-004 | `generatePairing(cls)` の保存確認を field-compare に強化（SAVE-003 length-only の精度を `pairingsMatchSnapshot` で揃える） | S15（generatePairing） |

### 2.2 残タスク候補（次に着手し得るもの）

> SAVE-DESIGN-001 v0.1 §5「推奨順序」に対し、SAVE-002 / SAVE-003 で実際に投入したスコープは Must 4 関数に絞った。残りは下記候補として後続タスクで扱う。

| 候補 ID（暫定） | 内容 | 主な対象 callsite | 備考 |
|---|---|---|---|
| **A-5.1-SAVE-003b** | 参加者操作・手動編集系の保存未確認検知 | S02（handlePastParticipantClassAdd state）/ S04（handleSuggestClassAdd state）/ S07（finalizeAddPastParticipants）/ S08（updateField）/ S17（changePairing）/ S19（editPastResult） | 受付・編集系の Should 群。SAVE-003 の Must スコープから意図的に分離。**未着手** |
| **A-5.1-SAVE-UX** | UI 改善（warn 集約 / retry UI / 文言短縮） | 全 SAVE 系横断 | 連続失敗時の閾値表示・retry / 自動再保存・warn 文言短縮など。SAVE-DESIGN-001 §1.4 で後続切り出しと明記。**未着手** |
| 後続検討 | 会員マスタ系 verify（V2 拡張） | S03 / S05（クラス変更時 master）/ S06 / S09（yomi 補完）/ S22 / S23 / S24（master edit / delete / restore） | SAVE-DESIGN-001 §5 の旧「SAVE-003」枠。MASTER-001 で V2（name 軸）は適用済、`last_class` 等の新軸は別タスク |
| FUTURE | バッチ系 / I/O 系 / report 系 / 2 段保存 | S11 / S20 / S21 / S25 / S26 / S27 / S28 / S29 / S30 | SAVE-DESIGN-001 §5「SAVE-FUTURE」枠 |

注: タスク ID `SAVE-003b` / `SAVE-UX` は本ドキュメント時点での暫定名。正式起票時に再採番してよい。`SAVE-004` は 2026-05-13 に完了済（§1 参照）。

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

---

## 6. 関連ドキュメント

- 設計起点: [`docs/notes/20260512_shogi_a5_1_save_design_001_persistence_inventory_v0.md`](20260512_shogi_a5_1_save_design_001_persistence_inventory_v0.md) — SAVE-DESIGN-001 v0.1 保存処理棚卸し
- ロードマップ: [`docs/specs/20260505_1500_shogi_roadmap.md`](../specs/20260505_1500_shogi_roadmap.md) — A-5.1 SAVE 行を追記
- 引き継ぎ書: [`HANDOFF.md`](../../HANDOFF.md) — §5.5 機能修正履歴に SAVE-001 / 002 / 003 を追記
