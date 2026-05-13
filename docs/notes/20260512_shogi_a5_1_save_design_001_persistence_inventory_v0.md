# SHOGI-TOUR A-5.1-SAVE-DESIGN-001 保存処理棚卸し v0.1

- Task ID: A-5.1-SAVE-DESIGN-001
- 作成日: 2026-05-12（v0）
- 改訂日: 2026-05-13（v0.1 / Codex レビュー Must Fix・Should Fix 反映）
- 対象ファイル: `shogi_v4.html`（5,032 行）
- 位置づけ: A-5.1 Stage 1 「`verifyPersisted` 横展開の事前棚卸し」v0.1
- ベース: MASTER-001 / PR #40 で確立した「保存後 re-read で検証する」原則
- 禁止事項: 本タスクは **棚卸し + 設計メモのみ**。実装変更・テスト変更・横展開は行わない。

---

## 1. 総合方針

### 1.1 大方針

MASTER-001 で確立した原則を、shogi_v4.html 内の保存処理に **段階的に** 適用する。一括横展開はしない。理由は以下。

- 保存処理ごとに「保存対象データ」と「保存成功条件」が異なる。
  - 例: `save()` は `state` 全体の `JSON.stringify` 等価性、`saveBranchMaster()` は member の `normalizePersonName` 一致など、verify 軸が違う。
- 大会データ（`shogi_v4`）と会員マスタ（`shogi_branch_master`）は **異なる localStorage キー** で管理されており、どちらが失敗したかで現場運営への影響が違う。
  - 大会データ保存失敗 = 現場停止リスク高（誤って閉じると参加者リスト・勝敗が消える）
  - 会員マスタ保存失敗 = 大会運営は継続可能（次回大会のサジェスト・統計のみ劣化）
- import / export / download / report 出力は「localStorage 永続化」ではなく「外部 I/O」であり、verify 軸が根本的に違う。
  - clipboard / file download 系は **検証不能**（書込み先がアプリ外）。verify 対象から除外する。

### 1.2 適用順序の原則

1. **大会データ（shogi_v4 / state）の保存** から適用する。現場停止リスクが最も高いため。
2. **会員マスタ（shogi_branch_master）の保存** は既に MASTER-001 で verify 適用済み。残りの `saveBranchMaster` callsite は段階 2 以降。
3. **import / export / file I/O 系** は最後。verify 軸が違うため別タスクで仕様検討する。

### 1.3 verify 適用しない処理

- `saveData()` の `navigator.clipboard.writeText` 系（clipboard 書込み確認は不可）
- `saveDataAsFile()` のファイルダウンロード（端末ストレージへの書込み確認は不可）
- `downloadReport()` のレポート HTML 印刷（永続化対象ではない）
- `resetAll()` の `localStorage.removeItem`（消去成功確認は本タスクの範囲外）

### 1.4 UI 方針（v0.1 で確定）

- **「保存失敗」ではなく「保存未確認」と表現する**
  verify false は「localStorage への書込みが確認できなかった」状態であり、データ消失と断定しない。
- **toast (`showMsg`) + `console.warn` を基本**
  alert は **使わない**（現場停止リスクの回避）。
- **既存 V1 / V2 は変更しない**
  MASTER-001 で確立した `verifyStatePersisted` / `verifyMasterPersisted` の挙動は維持し、SAVE-001 で必要な helper は **新規追加** する。
- **後続タスクに切り出す UI 仕様**（SAVE-001 では実装しない）
  - `caution` 等の新しい showMsg レベル追加
  - 連続失敗時の閾値バナー
  - `setWinner` の silent verify 集約（高頻度操作向け）
  - retry UI / 自動再保存

---

## 2. 保存処理一覧

### 2.1 保存ファンクション定義

| No | 関数 | 行 | 対象キー | 例外処理 | 戻り値 |
|---:|---|---:|---|---|---|
| F1 | `save()` | 402 | `shogi_v4`（= `STORAGE_KEY`） | `try/catch`、容量超過時 `notifyError` 通知 | なし（void） |
| F2 | `saveBranchMaster(master)` | 602 | `shogi_branch_master`（= `BRANCH_MASTER_KEY`） | `try/catch`、`console.warn` のみ | なし（void） |
| F3 | `saveData()` | 4542 | クリップボード / ダウンロード（外部 I/O）。**前段で** `syncBranchMasterOnSave()` → `save()` を呼ぶ | clipboard 失敗時は file fallback | なし（void） |
| F4 | `saveDataAsFile(json)` | 4557 | ファイルダウンロード（外部 I/O） | `try/catch`、alert | なし（void） |
| F5 | `syncBranchMasterOnSave()` | 4516 | `shogi_branch_master` + `shogi_v4`（内部で `saveBranchMaster` → `save`） | `try/catch`、`console.warn` のみ | なし（void） |

### 2.2 既存 verify ファンクション

| No | 関数 | 行 | 検証対象 | 戻り値 |
|---:|---|---:|---|---|
| V1 | `verifyStatePersisted(playerId, expectedName)` | 3460 | `shogi_v4` を再読込し、対象 player の `name` が `expectedName` か | `boolean` |
| V2 | `verifyMasterPersisted(memberId, expectedName)` | 3483 | `shogi_branch_master` を再読込し、対象 member の `name` が normalize 一致するか | `boolean` |

### 2.3 保存処理 callsite 一覧（v0.1 で再構成）

> v0 で実コードに存在しない関数名を使っていた箇所を、実コード上の関数名（`handlePastParticipantClassAdd` / `handleSuggestClassAdd`）に修正。
> 過去参加者パネル経路（一覧クリック）とサジェスト経路（入力欄サジェスト）を **別経路として独立行に分離**。
> `addSelectedPastParticipants` の yomi 反映 `saveBranchMaster` callsite（1815行）を独立行として追加。
> S 番号は v0 から再採番した（v0 → v0.1 対応表は §10 参照）。

| No | 呼び出し関数 | 行 | 操作 | 経路 | 保存対象データ | 現在の確認方法 | 失敗時影響 | 復旧難易度 | 頻度 | verify適用しやすさ | 初期適用向き | コメント |
|---:|---|---:|---|---|---|---|---|---|---|---|---|---|
| S01 | `addPlayer()` | 3263 | 参加者追加（手入力） | 登録欄（直接入力 / サジェスト確定後の確定経路） | `state.players[cls]` に 1 件 push | なし | High | Medium | High（受付時に連打） | High | **SAVE-002 候補**（初回ではない） | id + cls + name の 3 軸 verify が必要 |
| S02 | `handlePastParticipantClassAdd(memberId, cls)` の `save()` | 1678, 1704 | 「過去参加者パネル」から 1 件追加 / クラス変更（state 保存） | 過去参加者パネル経路 | `state.players[cls]` に push（1704行）/ 既存 player のクラス書換（1678行付近の `changePlayerClass`） | なし | High | Medium | Medium | High | △（SAVE-002 以降） | 同一関数内で 2 経路（追加と変更）あり |
| S03 | `handlePastParticipantClassAdd(memberId, cls)` の `saveBranchMaster()` | 1677 | クラス変更時のマスタ更新（`last_class` 等） | 過去参加者パネル経路 | `master.members[i].last_class` 等 | なし | Low-Medium（マスタ統計のみ） | Low | Low | Medium | △（SAVE-003 以降） | V2 は `name` のみ検証。`last_class` は別軸 |
| S04 | `handleSuggestClassAdd(memberId, cls)` の `save()`（`postSuccess` 内） | 3084 | サジェスト候補のクラスボタンから追加 / クラス変更（state 保存） | サジェスト経路 | `state.players[cls]` に push / クラス書換 | なし | High | Medium | Medium-High | High | △（SAVE-002 以降） | UI 経路が S02 と別。helper は共通化可能 |
| S05 | `handleSuggestClassAdd(memberId, cls)` の `saveBranchMaster()` | 3102 | サジェスト経路のクラス変更時マスタ更新 | サジェスト経路 | `master.members[i].last_class` 等 | なし | Low-Medium | Low | Low | Medium | △（SAVE-003 以降） | v0 では誤って「過去参加者経路」に分類していた箇所（修正） |
| S06 | `addSelectedPastParticipants()` の `saveBranchMaster()`（yomi 入力反映） | 1815 | 「過去参加者から複数選択」時、yomi 空の人にダイアログを出し、入力された yomi を **マスタへ反映** | 過去参加者パネル一括追加経路（yomi 補完段階） | `master.members[i].yomi` 上書き | なし | Low | Low | Low | High（V2 拡張で yomi 軸を追加すれば可） | × **初期適用には入れない** | state 保存（S07）と分けて扱う。理由は §4 |
| S07 | `finalizeAddPastParticipants()` の `save()` | 1840 | 「過去参加者から複数選択」一括追加後の state 保存 | 過去参加者パネル一括追加経路（state 段階） | `state.players[cls]` に複数 push | なし | High | Medium-High | Medium（大会前にまとめて発動） | Medium | △（SAVE-002 以降） | バッチ verify ロジックが必要 |
| S08 | `updateField(id, cls, field, value)` | 2937 | 参加者属性（member / grade）変更 | 登録欄 | `state.players[cls][i][field]` の値 | なし | Medium | Low-Medium | Medium | High | △ | フィールド毎の分岐 |
| S09 | `addPlayer()` 内のサジェスト yomi 補完 `saveBranchMaster()` | 3244 | サジェスト由来 player について、マスタ yomi が空欄なら補完 | 登録欄（addPlayer 内部） | `master.members[i].yomi` 上書き | なし | Low | Low | Low-Medium | High | △ | S06 と類似だが UI トリガーが違う |
| S10 | `removePlayer(id, cls)` の `save()` | 3295 | 参加者削除 | 登録欄（削除ボタン） | `state.players[cls]` から該当 id を除外 | なし | High | Medium | Low-Medium | High（id が **存在しない** ことを verify） | **◎ SAVE-001 第一・唯一候補** | 「負の確認」になる点に注意 |
| S11 | `bulkEditNames` 保存ボタンの `save()` | 3380 | 名前一括変更（クラス内） | 登録欄 | `state.players[cls][i].name` を複数件上書き | なし | Medium | Medium | Low | Medium | △ | バルク verify |
| S12 | `applyParticipantRenameOnly(p, newName)` の `save()` | 3513 | 参加者名修正（マスタ反映なし） | 登録欄（編集モーダル） | `state.players` の対象 player の `name` | **V1 で verify 済（既存）** | Medium | Low | Low-Medium | High | **適用済み** | MASTER-001 / PR #40 |
| S13 | `applyParticipantRenameWithMaster()` 内 `saveBranchMaster()` | 3545 | 参加者名修正 + マスタ同期 | 登録欄（編集モーダル） | `master.members[i].name` | **V2 で verify 済（既存）** | Medium | Low | Low-Medium | High | **適用済み** | MASTER-001 / PR #40 |
| S14 | `startTournament()` の `save()` | 3748 | 大会開始（state.started=true、初回ペアリング生成） | 登録 → 対局画面遷移時 | `state.started` + `state.pairings.{A,B}` | なし | High | Low-Medium | 1 大会 1 回 | Medium | △ | 複合 verify |
| S15 | `generatePairing(cls)` の `save()` | 3976 | ペアリング生成 | 対局画面（自動 + 再生成） | `state.pairings[cls]` 全置換 | なし | High | Low | Medium | Medium | × | verify 軸の仕様要設計 |
| S16 | `setWinner(cls, idx, wid)` の `save()` | 3985 | 勝敗入力（トグル） | 対局画面 | `state.pairings[cls][idx].winner` | なし | Medium-High | Low | **Very High** | High | × **SAVE-003 以降。初回実装には含めない** | 頻度極大。silent verify と閾値仕様が前提（§4 / §8 参照） |
| S17 | `bindChangePairingModalEvents()` 保存の `save()` | 4071 | 対戦相手変更（単発 / swap） | 対局画面（変更モーダル） | `state.pairings[cls][idx]` 1〜2 件上書き | なし | High | Low-Medium | Medium | Medium | △ | swap 時は 2 ペア verify |
| S18 | `submitRound(cls)` の `save()` | 4124 | 回戦確定（pairings → results に転記 + 次回戦生成） | 対局画面 | `state.results[cls]` push + `state.pairings[cls]` 置換 | なし | High | Medium | Medium（1 大会で 4 回程度） | Medium-High | ○（SAVE-002 候補） | 不可逆性が高い |
| S19 | `editPastResult` の `save()` | 4326, 4331 | 過去回戦の勝者修正 | 対局画面（過去結果モーダル） | `state.results[cls][round][match].winner` | なし | Medium | Low | Low | High | ○（SAVE-002 候補） | 位置情報が明確 |
| S20 | `bindReportEvents()` の input ハンドラの `save()` | 4988 | 大会報告書フィールド（date/place/start/end/sei/fuku/note）の即時保存 | 報告書フォーム | `state.report[k]` | なし | Low-Medium | Low | High（タイピング毎に発火） | Medium | × | debounce / blur ベースの仕様検討が必要 |
| S21 | `applyLoadedJson()` の `save()` | 4585 | import 後の state 保存 | 読込（ファイル / paste） | `state` 全体（JSON.parse → normalize → 上書き） | なし | High | Low-Medium | Low | Medium-High | △ | 件数の一致確認が主軸 |
| S22 | `bindMasterEditModalEvents` 保存ボタンの `saveBranchMaster()` | 2469 | マスタ単体編集（氏名/yomi/member/grade/last_class/city） | マスタタブ（編集モーダル） | `master.members[i]` の複数フィールド | なし | Medium | Low-Medium | Low | Medium | △ | V2 拡張が必要 |
| S23 | `bindMasterTabEvents` 削除ボタンの `saveBranchMaster()` | 2546 | マスタ member 削除（論理削除） | マスタタブ | `master.members[i].deleted = true` 等 | なし | Medium | Low（復元 UI あり） | Low | High | ○（SAVE-003 候補） | 単純な boolean 確認 |
| S24 | `bindMasterTabEvents` 復元ボタンの `saveBranchMaster()` | 2577 | マスタ member 復元 | マスタタブ | `master.members[i].deleted = false` 等 | なし | Low | Low | Very Low | High | △ | S23 とセット |
| S25 | マスタリセットの `saveBranchMaster()` | 2143 | マスタ全消去 | マスタタブ（リセットモーダル） | `master.members = []` 等 | なし | High（不可逆） | Very High | Very Low | High | × | リセット後仕様検討要 |
| S26 | `applyPhase2Import` の `saveBranchMaster()` | 2290 | 22 名 import | マスタタブ（Phase2 取込） | `master` 全置換 | なし | High | Medium | Very Low | Medium-High | △ | 1 回限り |
| S27 | `processMasterImportText` overwrite の `saveBranchMaster()` | 2358 | マスタ上書き import | マスタタブ（import モーダル） | `master` 全置換 | なし | High | Medium | Very Low | Medium-High | △ | S26 と同等 |
| S28 | `processMasterImportText` merge の `saveBranchMaster()` | 2374 | マスタ merge import | マスタタブ（import モーダル） | `master.members` に差分追加 | なし | Medium-High | Medium | Very Low | Medium | × | 差分の verify は重い |
| S29 | マイグレーション統合の `saveBranchMaster()` | 2650 | 過去大会データを member に統合 | マスタタブ（マイグレーションウィザード） | `master.members` に差分追加 | なし | Medium-High | Medium | Very Low | Medium | × | S28 と同等 |
| S30 | `syncBranchMasterOnSave()` 内 `saveBranchMaster()` + `save()` | 4524, 4532, 4535 | F2「大会データコピー」時のマスタ同期 + state 保存 | クリップボード / ダウンロードヘッダボタン | `master` + `state` の 2 段保存 | `try/catch` で握り潰し、warn のみ | Medium-High | Medium | 1 大会 1 回程度 | Medium | × | 2 段保存と外部 I/O が絡む。仕様検討要 |

### 2.4 import / export / 外部 I/O 系（verify 適用対象外）

| No | 関数 | 行 | 種別 | verify 可否 | コメント |
|---:|---|---:|---|---|---|
| X01 | `saveData()` の clipboard 書込み | 4546 | clipboard 出力 | × | clipboard は再読込不可 |
| X02 | `saveDataAsFile(json)` | 4557 | ファイルダウンロード | × | 端末ローカル書込みは確認不可 |
| X03 | `loadData(e)` / `loadFromPaste()` / `applyLoadedJson()` | 4582, 4600, 4618 | ファイル / paste 取込 → state 上書き | △（取込後の state 保存（S21）部分は verify 可） | I/O は確認不可だが「import 後の localStorage 反映」は verify できる |
| X04 | マスタ export（`masterExportBtn`） | 2496 周辺 | ファイルダウンロード | × | X02 と同様 |
| X05 | `downloadReport()` | 4767 | 大会報告書 HTML 印刷 | × | localStorage を経由しない一時 HTML 生成 |
| X06 | `printResults()` | 4668 | 結果印刷 | × | X05 と同様 |

### 2.5 操作 → 保存処理の対応表（依頼書 §3 の確認項目）

| 操作 | 経路 | 呼び出し先 | 既 verify | 備考 |
|---|---|---|---|---|
| 参加者追加（手入力） | 登録欄直接入力 | `addPlayer()`（S01） | × | SAVE-002 候補 |
| 参加者追加（サジェスト確定） | 登録欄サジェスト→確定 | `addPlayer()`（S01）+ yomi 補完（S09） | × | yomi 補完は局所的 |
| 参加者追加（サジェスト「Aクラス／Bクラス」ボタン） | サジェスト経路 | `handleSuggestClassAdd(memberId, cls)` の state 保存（S04） | × | クラス変更時は S05 も発動 |
| 参加者追加（過去参加者パネルから単発クリック） | 過去参加者パネル経路 | `handlePastParticipantClassAdd(memberId, cls)` の state 保存（S02） | × | クラス変更時は S03 も発動 |
| 参加者追加（過去参加者から複数選択） | 過去参加者パネル一括 | `addSelectedPastParticipants()` → yomi ダイアログ（S06）→ `finalizeAddPastParticipants()`（S07） | × | yomi 反映の master 保存と state 保存が別段で発動 |
| 参加者削除 | 登録欄 | `removePlayer(id, cls)`（S10） | × | **SAVE-001 唯一候補** |
| 参加者修正（名前、マスタ反映なし） | 登録欄編集モーダル | `applyParticipantRenameOnly`（S12） | **○ 適用済** | MASTER-001 |
| 参加者修正（名前、マスタ反映あり） | 登録欄編集モーダル | `applyParticipantRenameWithMaster`（S13） | **○ 適用済** | MASTER-001 |
| 参加者修正（member/grade） | 登録欄 | `updateField`（S08） | × | フィールド単位 |
| 参加者修正（一括） | 登録欄バルクモーダル | `bulkEditNames`（S11） | × | バッチ |
| クラス変更（過去参加者パネル経由） | 過去参加者パネル経路 | `handlePastParticipantClassAdd` → state（S02）+ master（S03） | × | state と master の二軸 |
| クラス変更（サジェスト経由） | サジェスト経路 | `handleSuggestClassAdd` → state（S04）+ master（S05） | × | 同上 |
| 勝敗入力 | 対局画面 | `setWinner`（S16） | × | 頻度極大。SAVE-003 以降 |
| ペアリング生成 | 対局画面 | `generatePairing`（S15） | × | 全置換 |
| ペアリング確定 | 対局画面 | `submitRound`（S18） | × | 不可逆 |
| 対局カード生成 | **存在しない** | — | — | 「卓カード」は配列 index+1 のラベルのみで永続化なし（`shogi_v4.html:4216`）。「対局カード」というオブジェクトは未実装 |
| 対局カード関連操作 | **存在しない** | — | — | 同上 |
| 会費・支払状態変更 | **存在しない** | — | — | `getFee()`（279行）は state.players.{member, grade} から都度計算するのみ。`paid` / `payment` / `支払状態` フィールドは `shogi_v4.html` に **存在しない** |
| 設定保存 | 報告書フォーム | `bindReportEvents`（S20）、`state.rounds` 等 | × | タイピング毎に save() |
| 会員マスタ更新 | マスタタブ | `bindMasterEditModalEvents`（S22）/ 削除（S23）/ 復元（S24） | × | V2 拡張が必要 |
| 大会データ全体保存 | ヘッダボタン | `saveData()`（S30 経由） | × | clipboard / file は verify 外、localStorage 部分のみ可 |
| import（マスタ） | マスタタブ | `processMasterImportText`（S27/S28）/ `applyPhase2Import`（S26）/ マイグレ（S29） | × | バッチ操作 |
| import（大会データ） | ヘッダボタン | `applyLoadedJson`（S21） | × | 1 回限り |
| export（マスタ） | マスタタブ | `masterExportBtn`（X04） | — | 外部 I/O |
| download（大会データ） | ヘッダボタン | `saveDataAsFile`（X02） | — | 外部 I/O |

---

## 3. 初期適用候補（A-5.1-SAVE-001）

**v0.1 で方針を変更**：Codex Should Fix 1 を反映し、A-5.1-SAVE-001 は **`removePlayer` の 1 件のみ** に絞る。`addPlayer` / `setWinner` も価値はあるが初回 PR には含めない。

### 3.1 唯一候補: `removePlayer` の保存 verify（S10）

**なぜ初期適用に向いているか**

- **影響度が高く** 検証ロジックが **単純** な、ちょうど良い手始め。
- 「id が存在しないこと」を確認するだけなので、既存 V1 の "name 一致" よりも軸が単純。
- バッチ操作ではない（1 名削除）ため失敗時 UI が複雑にならない。
- MASTER-001 のパターン（save 後 re-read で確認 → 失敗時は warn）をほぼそのまま流用できる。
- 削除は **不可逆操作の手前** で confirm を出しているため、verify false のときにユーザーへ「削除は反映されましたが、保存が確認できませんでした」と伝える価値が大きい。
- 頻度が中庸（受付時のみ）で、UI ノイズリスクが低い。

**保存成功条件**

- `save()` 実行後、localStorage の `shogi_v4` を再読込して `state.players[cls]` 配列に削除対象 `id` を含む player が **存在しない** こと。

**verify 方法**

新規 helper を追加する想定（実装は本タスク範囲外）:

```
function verifyPlayerAbsent(playerId, cls) -> boolean
```

- `localStorage.getItem(STORAGE_KEY)` → `JSON.parse`
- `parsed.players[cls]` を走査して `id===playerId` が **無いこと** を確認
- 例外時は `false` を返す（= 保存未確認扱い）

**失敗時表示（§1.4 の方針に準拠）**

- `console.warn('SAVE-001: removePlayer の保存が確認できませんでした (player='+id+')')`
- `showMsg('削除は反映されましたが、保存が確認できませんでした。ブラウザを閉じる前にバックアップしてください', 'warn')`
- alert は **出さない**
- 「保存失敗」ではなく **「保存未確認」** と表現する

**テスト観点**

- 通常の削除で `verifyPlayerAbsent` が true を返す
- localStorage が壊れた状態で false を返す
- localStorage が空（参加者ゼロ）で true を返す
- 他クラスの同名 / 同 id 風データが残っていても誤検知しない（クラス境界の確認）

**やらないこと（SAVE-001 では未実装）**

- pairings / results 側の参照整合性チェック（既存ガードに任せる）
- save 失敗時のリトライ（仕様検討が別タスク）
- UI 全体のステータス表示変更（lifecycle ステータスは A-5.1 別段階）
- 連続失敗時の閾値バナー
- 新 showMsg レベル（`caution` 等）の追加

### 3.2 SAVE-001 に含めない候補（理由付き）

#### `addPlayer`（S01） — **SAVE-002 候補**

- 価値は高い（受付の最も基本的な操作）が、初回 PR に複数 callsite を入れると「失敗時 UI」「テスト観点」が SAVE-001 内で発散する。
- helper 設計を SAVE-001（`verifyPlayerAbsent` = 負の検証）で固めてから、SAVE-002 で正の検証（`verifyPlayerPersistedById` 等）を追加する方が安全。

#### `setWinner`（S16） — **SAVE-003 以降。初回実装には含めない**（Codex Should Fix 2 反映）

- **頻度が極めて高い**（1 局 = 1 setWinner、回戦 × ペア数で数十回）。verify false 時の UI を強くすると現場が止まる。
- 以下が **設計確定前** であり、SAVE-001 では実装しない:
  - **silent verify**（toast を出さない / バッファリング）
  - **連続失敗時の閾値ロジック**（N 回連続 false で警告バナー）
  - **UI を出す条件**（操作毎 / round 毎 / 一定時間後）
  - **retry UI**（自動再保存、ユーザーへの差分表示）
- これらは A-5.1-SAVE-003 以降、または UI 方針の別議題として整理する。

---

## 4. 今は触らない方がよい保存処理

| No | 保存処理 | 理由 |
|---|---|---|
| S05 / S03 | クラス変更時の `saveBranchMaster()`（サジェスト経路 / 過去参加者パネル経路） | V2 は `name` のみ検証。`last_class` 等を verify するには V2 拡張が必要。SAVE-003 段階で扱う |
| S06 | `addSelectedPastParticipants` の yomi 反映 `saveBranchMaster()` | state 保存（S07）と分離した独立 callsite。**ふりがな入力反映のみ** に責務が限定され、影響度が低い（次回サジェスト品質に影響するのみ）。初期 SAVE-001 対象外。SAVE-003 でマスタ系の verify をまとめて検討する際に扱う |
| S09 | `addPlayer()` 内の yomi 補完 `saveBranchMaster()` | サジェスト由来 player のマスタ yomi 空欄補完。S06 と同質で影響度低 |
| S11 | `bulkEditNames` の `save()` | バッチ verify。失敗時 UI が複雑 |
| S15 | `generatePairing(cls)` の `save()` | ペアリング配列の全置換。verify 軸（配列長 / 組合せ厳密一致）の仕様検討要 |
| S16 | `setWinner` の `save()` | §3.2 参照。頻度極大、silent verify + 閾値仕様が前提 |
| S20 | `bindReportEvents` 入力ハンドラの `save()` | タイピング毎に save() が走るためノイズになる。debounce / blur ベースに変える別仕様が必要 |
| S21 | `applyLoadedJson()` の `save()` | import の最終保存。verify 軸は「件数の一致」が主で、1 件 helper の延長線では設計できない |
| S22 | `bindMasterEditModalEvents` 保存の `saveBranchMaster()` | 複数フィールド更新。V2 拡張要 |
| S25 | マスタリセットの `saveBranchMaster()` | 不可逆操作。リセット失敗時の UI 仕様が別途必要 |
| S26 / S27 / S28 / S29 | import / merge / migration 系の `saveBranchMaster()` | バッチで verify 軸が重い。1 回限りの操作なので失敗時 UI が画面遷移を伴う |
| S30 | `syncBranchMasterOnSave()` の 2 段保存 | clipboard / file 出力と一連。verify は localStorage 部分だけを切り出す設計が必要。MASTER-001 と二重 verify になるため要整理 |
| X01-X06 | clipboard / file download / report 印刷 | 外部 I/O のため検証不可。範囲外 |

---

## 5. 推奨順序（v0.1 で更新）

> **2026-05-13 追記**: SAVE-001 / 002 / 003 はマージ完了。実装スコープは v0.1 計画より狭く着地している（SAVE-002 = S01 のみ、SAVE-003 = 大会進行 core path 4 関数に再定義）。実装結果サマリと残タスク候補は [`20260513_shogi_a5_1_save_completion_summary_v0.md`](20260513_shogi_a5_1_save_completion_summary_v0.md) を参照。

| 段階 | 内容 | 対応 callsite | ステータス |
|---|---|---|---|
| **A-5.1-SAVE-001** | 大会データ保存の verify（**削除 1 件のみ**） | S10（removePlayer） | ✅ Done / Merged（PR #46） |
| A-5.1-SAVE-002 | 大会データ保存の verify（state 追加・編集・確定系） | S01（addPlayer）/ S02（過去参加者パネル経路 state）/ S04（サジェスト経路 state）/ S07（過去参加者一括追加 state）/ S08（updateField）/ S11（bulkEditNames）/ S17（changePairing）/ S18（submitRound）/ S19（editPastResult）/ S14（startTournament） | 🟡 一部完了。実装は **S01 のみ**（PR #47 マージ）。残（S02 / S04 / S07 / S08 / S11 / S17 / S18 / S19 / S14）は SAVE-003 / SAVE-003b に再分配 |
| A-5.1-SAVE-003 | 会員マスタ保存の verify + setWinner（V2 拡張 + silent verify 仕様確定後） | S03 / S05（クラス変更時 master）/ S06 / S09（yomi 補完）/ S22（master edit, V2 拡張）/ S23（delete）/ S24（restore）/ **S16（setWinner、silent verify と閾値仕様確定後）** | 🟡 **再定義のうえ部分完了**。実装は「大会進行 core path Must 4 関数」（S14 / S15 / S16 / S18）に再定義（PR #48 マージ）。会員マスタ系（S03 / S05 / S06 / S09 / S22 / S23 / S24）は後続検討に送り |
| **A-5.1-SAVE-003b**（追加） | 参加者操作・手動編集系（受付・編集 Should 群） | S02 / S04 / S07 / S08 / S17 / S19 | 🔲 未着手。SAVE-002 / SAVE-003 計画から繰越し |
| **A-5.1-SAVE-004**（追加） | `generatePairing(cls)` の簡易シグネチャ比較 | S15 | ✅ **完了・main マージ済**（PR #50、commit `42e4673`）。SAVE-003 Codex Nice-to-Have 由来。`pairingsMatchSnapshot` 流用で length-only → field-compare 化。同件数 stale pairings を検知可能に |
| **A-5.1-SAVE-UX**（追加） | warn 集約・retry UI・文言短縮 | 全 SAVE 系横断 | 🔲 未着手。§1.4「後続タスクに切り出す UI 仕様」と整合 |
| A-5.1-SAVE-FUTURE | バッチ系・I/O 系・report 系・2 段保存 | S20（bindReportEvents、debounce 化検討）/ S21（applyLoadedJson）/ S25（reset）/ S26 / S27 / S28 / S29（import / migration）/ S30（syncBranchMasterOnSave 部分）/ S11（bulkEditNames、バッチ verify）/ clipboard / file 系の「verify 対象を別仕様で定義する」検討 | 🔲 未着手 |

---

## 6. 必要なテスト

### 6.1 SAVE-001 段階で必要なテスト観点

- **正常系**
  - removePlayer で `verifyPlayerAbsent` が true を返す
  - 連続削除（n=5）でも逐一 true
  - クラス境界（A/B）で誤検知しない
- **異常系**
  - localStorage が空 / 壊れた JSON で false を返す
  - localStorage への書込みが例外を投げた直後で false を返す（容量超過の模擬）
  - 削除直後に他コードが state を変更したケースで意図通り false を返す
- **UI 観点**
  - verify false 時に `showMsg(.., 'warn')` がトーストとして 1 度だけ出る
  - alert は出ない
  - 表示文言が「保存未確認」になっており「保存失敗」と断定していない
  - 連続失敗時の UI 仕様は SAVE-001 内では実装しない

### 6.2 既存テストへの影響

- MASTER-001 で追加された `applyParticipantRenameOnly` / `applyParticipantRenameWithMaster` のテストは **そのまま維持**。
- 既存 V1 / V2 には手を入れない方針（A/B 走査・name 比較の挙動を変えると MASTER-001 のテストが壊れる）。SAVE-001 で必要な helper は新規追加する。

---

## 7. リスクと注意点

### 7.1 仕様面

- **保存処理ごとに成功条件が違う** — 単一の `verifyPersisted` 関数で全 callsite をカバーすると逆に脆くなる。callsite 種別ごとの helper を用意する設計が安全。
- **re-read 対象を間違えると偽陽性になる** — 例えば addPlayer の verify を「name 一致」だけで判定すると、同名既存 player を誤って "OK" と判定する。`id + cls + name` の 3 軸が必要。
- **削除の verify は「存在しないこと」を確認する負の検証** になる。helper の戻り値の意味（true=削除成功）を明確にする必要がある。
- **トグル操作（setWinner の解除）は `null` 一致** — `expectedWinner` パラメータが `null` を取れる設計にしないと verify 自体が機能しない（SAVE-003 で扱う）。
- **過去参加者パネル経路（S02/S03）とサジェスト経路（S04/S05）は別 UI** — 同じ「クラスボタンから追加」でも入口が異なる。verify を入れる際は経路ごとにテストする必要がある。

### 7.2 UX 面

- **「保存未確認」と「保存失敗」を混同しない** — verify false は「localStorage への書込みが確認できなかった」状態。データ消失と断定する表現は避ける。
- **alert は使わない**。toast（`showMsg`）に限定する。連続表示しない。
- **頻度の高い操作（setWinner）は silent verify** — 個別失敗時に UI を出すと現場が混乱する。SAVE-001 では扱わない。

### 7.3 ストレージ性質の違い

- **localStorage と export/download は別性質**。前者は再読込で検証可能、後者は不可。同じ「保存」UI で両方走るケース（`saveData()` 経由 = S30）は分けて考える。
- **会員マスタ更新と大会データ保存は別軸**。`syncBranchMasterOnSave()` のように 2 段保存する関数では、どちらの段階で失敗したかを区別できる verify が必要。
- **大会データの保存成功 ≠ 会員マスタの保存成功** — どちらかが verify false でも他方は true のケースがある。UI 表示も別々にすべき。

### 7.4 既存実装との整合

- MASTER-001 で確立した V1 / V2 の仕様は **変更しない**。SAVE-001 で必要な新 helper は別関数として追加する。
- `save()` / `saveBranchMaster()` 本体の例外処理（`try/catch` で握り潰し）も変更しない。verify は **呼び出し側で行う** 設計を維持する。

---

## 8. 判断保留事項

Claude Code 側で判断できないため、髙橋さん・ChatGPT 司令塔に確認したい事項：

1. **SAVE-001 で適用する callsite の確定**
   - 本 v0.1 では Codex Should Fix を反映し `removePlayer`（S10）の 1 件のみとした。これで確定でよいか。
2. **`verifyPlayerAbsent` の関数名と置き場所**
   - 既存 V1 / V2 と命名規則を揃えるか（例: `verifyPlayerAbsent` / `verifyPlayerPersistedById`）。配置位置は V1 / V2 の近傍（`shogi_v4.html` 3460行付近）でよいか。
3. **失敗時の showMsg レベル**
   - 既存 `warn` で十分か、新 `caution` レベルを追加するか（v0.1 では新レベル追加は SAVE-FUTURE に分離）。
4. **連続失敗時の閾値ロジック**
   - 「N 回連続 verify false で警告バナー表示」は SAVE-003 以降の別仕様で扱う、で確定でよいか。
5. **`setWinner` の silent verify と retry UI**
   - SAVE-003 以降に切り出した。UI 方針が固まる前に着手しない、で確定でよいか。
6. **`syncBranchMasterOnSave()` の verify 範囲**
   - `saveData()` 経由の 2 段保存を verify する場合、A-5.1 のどの段階で扱うか（SAVE-FUTURE 想定）。
7. **report 入力欄（S20）の保存戦略**
   - タイピング毎の save() を維持するのか、blur / debounce ベースに変えるのか。verify は後者でないと現実的でない。
8. **対局カード / 会費・支払状態は実装スコープか**
   - 依頼書に挙がっているが現コードベースには存在しない。今後実装する予定があるなら SAVE-DESIGN 後続で扱うか、不要なら依頼書側から外すか。

---

## 9. 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-12 | v0 作成。A-5.1 Stage 1 の保存処理棚卸しとして作成。 |
| 2026-05-13 | v0.1 Codexレビュー Must Fix / Should Fix 反映。存在しない関数名・callsite漏れを修正し、A-5.1-SAVE-001 を removePlayer 1件に絞る方針へ更新。 |
| 2026-05-13 | §5「推奨順序」に SAVE-001 / 002 / 003 のマージ完了ステータスと、後続タスク候補（SAVE-003b / SAVE-004 / SAVE-UX）を追記。実装結果サマリは [`20260513_shogi_a5_1_save_completion_summary_v0.md`](20260513_shogi_a5_1_save_completion_summary_v0.md) に分離。 |
| 2026-05-13 | §5「推奨順序」の SAVE-004 を「未着手」→「完了・main マージ済」（PR #50, commit `42e4673`）に更新。`generatePairing(cls)` の保存確認を field-compare に強化。残候補は SAVE-003b / SAVE-UX に縮小。 |

---

## 10. v0 → v0.1 S 番号対応表

v0.1 で実コードに存在しない関数名の修正・経路分離・新規 callsite 追加に伴い、S 番号を再採番した。旧文書を参照していた箇所のために対応表を残す。

| v0 | v0.1 | 内容 |
|---|---|---|
| S01 | S01 | `addPlayer()` の save |
| S02（誤）| S02 + S03 | v0 では実コードに存在しない関数名で一行に統合していたが、実コード上の `handlePastParticipantClassAdd` の state 保存（S02）と master 保存（S03）に分離 |
| —（漏れ）| S04 + S05 | v0 で独立行として記載されていなかった `handleSuggestClassAdd` の state 保存（S04, 3084行）と master 保存（S05, 3102行）を追加。v0 の S18 が誤って「過去参加者経路」に分類していたものは S05（サジェスト経路）が正しい |
| —（漏れ）| S06 | v0 で未記載だった `addSelectedPastParticipants` の yomi 反映 `saveBranchMaster()`（1815行）を追加 |
| S03 | S07 | `finalizeAddPastParticipants` の save |
| S04 | S08 | `updateField` |
| S05 | S09 | `addPlayer` 内 yomi 補完 |
| S06 | **S10** | **removePlayer**（SAVE-001 唯一候補） |
| S07 | S11 | `bulkEditNames` |
| S08 | S12 | `applyParticipantRenameOnly`（V1 適用済） |
| S09 | S13 | `applyParticipantRenameWithMaster`（V2 適用済） |
| S10 | S14 | `startTournament` |
| S11 | S15 | `generatePairing` |
| S12 | S16 | `setWinner` |
| S13 | S17 | `changePairing` |
| S14 | S18 | `submitRound` |
| S15 | S19 | `editPastResult` |
| S16 | S20 | `bindReportEvents` |
| S17 | S21 | `applyLoadedJson` |
| S18（誤）| S05（修正） | v0 では「過去参加者パネル経路のクラス変更時 master 保存」と誤分類していたが、実コードでは 3102 行は `handleSuggestClassAdd` 内（サジェスト経路）。S05 に統合 |
| S19 | S22 | master edit |
| S20 | S23 | master delete |
| S21 | S24 | master restore |
| S22 | S25 | master reset |
| S23 | S26 | Phase2 import |
| S24 | S27 | overwrite import |
| S25 | S28 | merge import |
| S26 | S29 | migration |
| S27 | S30 | `syncBranchMasterOnSave` |
