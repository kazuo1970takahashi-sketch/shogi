# SHOGI-TOUR A-5.1-SAVE-DESIGN-001 保存処理棚卸し v0

- Task ID: A-5.1-SAVE-DESIGN-001
- 作成日: 2026-05-12
- 対象ファイル: `shogi_v4.html`（5,032 行）
- 位置づけ: A-5.1 Stage 1 「`verifyPersisted` 横展開の事前棚卸し」
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

1. **大会データ（shogi_v4 / state）の保存** から適用する。
   - 現場停止リスクが最も高いため。
2. **会員マスタ（shogi_branch_master）の保存** は既に MASTER-001 で verify 適用済み。残りの saveBranchMaster 呼び出し箇所を二段階目で。
3. **import / export / file I/O 系** は最後。verify 軸が違うため別タスクで仕様検討する。

### 1.3 verify 適用しない処理

- `saveData()` の `navigator.clipboard.writeText` 系（クリップボード書込み確認は不可）
- `saveDataAsFile()` のファイルダウンロード（端末ストレージへの書込み確認は不可）
- `downloadReport()` のレポート HTML 印刷（永続化対象ではない）
- `resetAll()` の `localStorage.removeItem`（消去成功確認は本タスクの範囲外）

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

### 2.3 保存処理呼び出し一覧（save() / saveBranchMaster() の callsite）

| No | 呼び出し関数 | 行 | 操作 | 保存対象データ | 現在の確認方法 | 失敗時影響 | 復旧難易度 | 頻度 | verify適用しやすさ | 初期適用向き | コメント |
|---:|---|---:|---|---|---|---|---|---|---|---|---|
| S01 | `addPlayer()` | 3263 | 参加者追加（手入力 + サジェスト経由） | `state.players[cls]` に 1 件 push（id, name, entry_no, member_id 等） | なし | High（現場での追加が消えると登録漏れ） | Medium（記憶から再入力可。ただし当日中はリスク） | High（受付時に連打） | High（id ベースで再読込 → 該当 id の存在を確認すれば足る） | **◎ 第一候補** | 既存 V1 は `name` のみ比較。追加用に「id の存在＋name 一致」の verify が必要 |
| S02 | `addPlayerFromMaster()` の後処理（「過去参加者から選ぶ」シングル追加） | 1678, 1704 | サジェスト UI 経由の単一追加 / クラス変更 | `state.players[cls]` + `saveBranchMaster(master)`（クラス変更時のみ） | なし | High（同上） | Medium | Medium | High | ○ 第二候補 | クラス変更時は 2 軸（state + master）を verify する必要があるため初手では避ける |
| S03 | `finalizeAddPastParticipants()` | 1840 | 過去参加者からの一括追加 | `state.players[cls]` に複数 push | なし | High（複数件まとめて消えると致命的） | Medium-High（誰を追加したか思い出すのが難しい） | Medium（大会前にまとめて発動） | Medium（複数 id の存在チェック） | △ | id 配列の全件 verify ロジックが必要。S01 完成後に展開 |
| S04 | `updateField(id, cls, field, value)` | 2937 | 参加者属性（member / grade）変更 | `state.players[cls][i][field]` の値 | なし | Medium（会費計算が狂う / 一般⇄中学生区分） | Low-Medium（再選択で復元可） | Medium | High（id + field + value の比較） | ○ | フィールドの種類による分岐が必要 |
| S05 | `addPlayer()` 内のサジェスト yomi 補完 | 3244 | マスタの yomi 空欄を補完 | `master.members[i].yomi` 上書き | なし | Low（次回サジェスト改善のみ） | Low | Low-Medium | High（V2 の拡張で対応可） | △ | 効果が局所的で初手では不要 |
| S06 | `removePlayer(id, cls)` | 3295 | 参加者削除 | `state.players[cls]` から該当 id を除外 | なし | High（誤削除気づかず保存できないと混乱） | Medium（id を覚えていれば再追加可） | Low-Medium（基本受付時のみ） | High（id が **存在しない** ことを verify） | ○ | 「正の確認」ではなく「負の確認」になる点に注意 |
| S07 | `bulkEditNames` 保存ボタン | 3380 | 名前一括変更（クラス内） | `state.players[cls][i].name` を複数件上書き | なし | Medium（プログラム名/呼び出し名が不一致になる） | Medium（記録から復元可） | Low | Medium（複数 id × name の全件 verify） | △ | バルクなので失敗時 UI が複雑になる。S01 完成後 |
| S08 | `applyParticipantRenameOnly(p, newName)` | 3513 | 参加者名修正（マスタ反映なし） | `state.players` の対象 player の `name` | **V1 で verify 済（既存）** | Medium | Low | Low-Medium | High | **適用済み** | MASTER-001 / PR #40 の成果 |
| S09 | `applyParticipantRenameWithMaster()` 内 `saveBranchMaster` | 3545 | 参加者名修正 + マスタ同期 | `master.members[i].name` | **V2 で verify 済（既存）** | Medium | Low | Low-Medium | High | **適用済み** | MASTER-001 / PR #40 の成果 |
| S10 | `startTournament()` | 3748 | 大会開始（state.started=true、初回ペアリング生成） | `state.started` + `state.pairings.{A,B}` | なし | High（再起動時に「未開始」状態に戻ると進行が止まる） | Low-Medium（startBtn 再押下で復元可） | 1 大会 1 回 | Medium（started + pairings の存在を verify） | ○ | 頻度低だが影響大。複合 verify が必要 |
| S11 | `generatePairing(cls)` | 3976 | ペアリング生成 | `state.pairings[cls]` 全置換 | なし | High（再戦回避情報・lastModifiedBy が消える） | Low（再生成可、ただし違う組合せになる） | Medium（再戦回避や再生成で発動） | Medium（配列長・組合せの一致確認） | △ | 同じ配列を厳密一致で比較するなら High。仕様要確認 |
| S12 | `setWinner(cls, idx, wid)` | 3985 | 勝敗入力（トグル） | `state.pairings[cls][idx].winner` | なし | Medium-High（誤って閉じると進行回戦の入力が消える） | Low（覚えていれば再入力可） | **Very High**（1 局 1 回、決勝までに数十回） | High（idx + winner 値の一致） | **○ 第三候補** | 頻度が極めて高いため、verify 失敗時 UI が強すぎると逆効果。Low-friction 表示が必須 |
| S13 | `bindChangePairingModalEvents()` 保存 | 4071 | 対戦相手変更（単発 / swap） | `state.pairings[cls][idx]` 1〜2 件上書き | なし | High（swap 後の整合性が保てないと当該回戦の進行不能） | Low-Medium（再操作可） | Medium | Medium（複数 idx に対する verify） | △ | swap 時は 2 ペア両方の verify が必要 |
| S14 | `submitRound(cls)` | 4124 | 回戦確定（pairings → results に転記 + 次回戦生成） | `state.results[cls]` push + `state.pairings[cls]` 置換 | なし | High（確定したつもりが残らないと致命的） | Medium（再確定可だが pairing 再生成が走る点に注意） | Medium（1 大会で 4 回程度） | Medium-High（results 長 + 最後の round の整合性） | ○ | 確定操作の不可逆性が高いので verify 価値も高い |
| S15 | `editPastResult` の保存 | 4326, 4331 | 過去回戦の勝者修正 | `state.results[cls][round][match].winner` | なし | Medium（順位計算が変わる） | Low（再修正可） | Low | High（位置情報が明確） | ○ | 確定済み回戦への破壊操作なので verify は付ける価値あり |
| S16 | `bindReportEvents()` の input ハンドラ | 4988 | 大会報告書フィールド（date/place/start/end/sei/fuku/note）の即時保存 | `state.report[k]` | なし | Low-Medium（再入力可） | Low | High（タイピング毎に発火） | Medium（文字列の一致） | × | 頻度が極めて高くノイズになる。verify はバッチで（report 一式が揃った時点で1回）にすべき |
| S17 | `applyLoadedJson()` | 4585 | import 後の state 保存 | `state` 全体（JSON.parse → normalize → 上書き） | なし | High（取込めたつもりが残らないと致命的） | Low-Medium（再取込可） | Low | Medium-High（取り込んだ件数の一致確認） | ○ | import フローの最終保存。1 回しか走らないので verify コスト低 |
| S18 | `addPlayerFromPastClick` 内 `saveBranchMaster` クラス変更系 | 3102 | クラス変更時のマスタ更新 | `master.members[i].last_class` | なし | Low-Medium | Low | Low | Medium | △ | `last_class` は V2 では検証していないので拡張が必要 |
| S19 | `bindMasterEditModalEvents` 保存ボタン | 2469 | マスタ単体編集（氏名/yomi/member/grade/last_class/city） | `master.members[i]` の複数フィールド | なし | Medium（マスタ整合性に直結） | Low-Medium | Low | Medium（複数フィールド比較） | △ | 拡張 V2 が必要 |
| S20 | `bindMasterTabEvents` 削除ボタン | 2546 | マスタ member 削除（論理削除） | `master.members[i].deleted = true` 等 | なし | Medium（誤削除）| Low（復元 UI あり） | Low | High（deleted フラグの確認） | ○ | 単純な boolean 確認なので verify しやすい |
| S21 | `bindMasterTabEvents` 復元ボタン | 2577 | マスタ member 復元 | `master.members[i].deleted = false` 等 | なし | Low | Low | Very Low | High | △ | 影響度低。S20 とセットで対応 |
| S22 | マスタリセット | 2143 | マスタ全消去 | `master.members = []` 等 | なし | High（不可逆的、ただし強い確認 UI あり） | Very High（バックアップ必須） | Very Low | High | △ | 別途「リセット後の状態」を verify する仕様検討が必要 |
| S23 | `applyPhase2Import` 結果保存 | 2290 | 22 名 import | `master` 全置換 | なし | High（取込失敗で空マスタになると次大会に支障） | Medium（再 import 可） | Very Low | Medium-High（member 数の一致） | ○ | 1 回限りのバッチ操作なので verify コスト低 |
| S24 | `processMasterImportText` overwrite | 2358 | マスタ上書き import | `master` 全置換 | なし | High（不可逆） | Medium | Very Low | Medium-High | ○ | S23 と同等 |
| S25 | `processMasterImportText` merge | 2374 | マスタ merge import | `master.members` に差分追加 | なし | Medium-High | Medium | Very Low | Medium（差分の検証） | △ | merge の verify は重い |
| S26 | マイグレーション統合 | 2650 | 過去大会データを member に統合 | `master.members` に差分追加 | なし | Medium-High | Medium | Very Low | Medium | △ | S25 と同等 |
| S27 | `syncBranchMasterOnSave()` 内 `saveBranchMaster` + `save` | 4524, 4532, 4535 | F2「大会データコピー」時のマスタ同期 + state 保存 | `master` + `state` の 2 段保存 | `try/catch` で握り潰し、warn のみ | Medium-High（コピー操作の信頼性） | Medium | 1 大会 1 回程度 | Medium（2 軸 verify） | △ | clipboard / file 出力と切り離して localStorage 部分のみ verify する設計が必要 |

### 2.4 import / export / 外部 I/O 系（verify 適用対象外）

| No | 関数 | 行 | 種別 | verify 可否 | コメント |
|---:|---|---:|---|---|---|
| X01 | `saveData()` の clipboard 書込み | 4546 | clipboard 出力 | × | clipboard は再読込不可。`navigator.clipboard.readText` 等は権限が必要で UX 上難しい |
| X02 | `saveDataAsFile(json)` | 4557 | ファイルダウンロード | × | 端末ローカル書込みは確認不可 |
| X03 | `loadData(e)` / `loadFromPaste()` / `applyLoadedJson` | 4582, 4600, 4618 | ファイル / paste 取込 → state 上書き | △（取込後の state 保存（S17）部分は verify 可） | I/O は確認不可だが「import 後の localStorage 反映」は verify できる |
| X04 | マスタ export（`masterExportBtn`） | 2496 周辺 | ファイルダウンロード | × | X02 と同様 |
| X05 | `downloadReport()` | 4767 | 大会報告書 HTML 印刷 | × | localStorage を経由しない一時 HTML 生成。永続化対象ではない |
| X06 | `printResults()` | 4668 | 結果印刷 | × | X05 と同様 |

### 2.5 操作 → 保存処理の対応表（依頼書 §3 の確認項目）

| 操作 | 呼び出し先 | 既 verify | 備考 |
|---|---|---|---|
| 参加者追加（手入力） | `addPlayer()` → save (S01) | × | 第一候補 |
| 参加者追加（サジェスト） | `addPlayer()` 内（S01） + `saveBranchMaster` yomi 補完（S05） | × | yomi 補完は局所的 |
| 参加者追加（過去参加者から選ぶ） | `addPlayerFromPastClick`（S02）/ `finalizeAddPastParticipants`（S03） | × | クラス変更時は master 含む |
| 参加者削除 | `removePlayer(id, cls)`（S06） | × | "存在しない" を verify |
| 参加者修正（名前） | `applyParticipantRenameOnly`（S08）/ `applyParticipantRenameWithMaster`（S09） | **○ 適用済** | MASTER-001 |
| 参加者修正（member/grade） | `updateField`（S04） | × | フィールド単位 |
| 参加者修正（一括） | `bulkEditNames`（S07） | × | バッチ |
| クラス変更 | `addPlayerFromPastClick` 内 `changePlayerClass`（S02 + S18） | × | state + master の二軸 |
| 勝敗入力 | `setWinner`（S12） | × | 頻度極大 |
| ペアリング生成 | `generatePairing`（S11） | × | 全置換 |
| ペアリング確定 | `submitRound`（S14） | × | 不可逆 |
| 対局カード生成 | **存在しない** | — | 「卓カード」は配列 index+1 のラベルのみで永続化なし（`shogi_v4.html:4216`）。「対局カード」というオブジェクトは未実装 |
| 対局カード関連操作 | **存在しない** | — | 同上 |
| 会費・支払状態変更 | **存在しない** | — | `getFee()`（279行）は state.players.{member, grade} から都度計算するのみ。`paid` / `payment` / `支払状態` というフィールドは shogi_v4.html に **存在しない** |
| 設定保存 | `bindReportEvents`（S16） / `state.rounds` 等 | × | 報告書フィールドはタイピング毎に save() |
| 会員マスタ更新 | `bindMasterEditModalEvents`（S19）/ 削除（S20）/ 復元（S21） | × | V2 拡張が必要 |
| 大会データ全体保存 | `saveData()`（S27 経由） | × | clipboard / file は verify 外、localStorage 部分のみ可 |
| import（マスタ） | `processMasterImportText`（S24/S25）/ `applyPhase2Import`（S23）/ マイグレ（S26） | × | バッチ操作 |
| import（大会データ） | `applyLoadedJson`（S17） | × | 1 回限り |
| export（マスタ） | `masterExportBtn`（X04） | — | 外部 I/O |
| download（大会データ） | `saveDataAsFile`（X02） | — | 外部 I/O |

---

## 3. 初期適用候補（A-5.1-SAVE-001）

候補を **3 件** に絞る。優先順は **3.1 → 3.2 → 3.3**。

### 3.1 第一候補: `removePlayer` の保存 verify（S06）

**なぜ初期適用に向いているか**

- **影響度が高く** 検証ロジックが **単純** な、ちょうど良い手始め。
- 「id が存在しないこと」を確認するだけなので、既存 V1（`verifyStatePersisted`）の "name 一致" よりも軸が単純。
- バッチ操作ではない（1 名削除）ため失敗時 UI が複雑にならない。
- MASTER-001 のパターン（save 後 re-read で確認 → 失敗時は warn）をほぼそのまま流用できる。
- 削除は **不可逆操作の手前** で confirm を出しているため、保存失敗時にユーザーへ「削除できなかった可能性があります」と伝える価値が大きい。

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

**失敗時表示**

- `console.warn('SAVE-001: removePlayer の保存が確認できませんでした (player='+id+')')`
- `showMsg('削除は反映されましたが、保存が確認できませんでした。ブラウザを閉じる前にバックアップしてください', 'warn')`
- alert は **出さない**（連続削除時に現場が止まる）

**テスト観点**

- 通常の削除で `verifyPlayerAbsent` が true を返す
- localStorage が壊れた状態で false を返す
- localStorage が空（参加者ゼロ）で true を返す
- 他クラスの同名 / 同 id 風データが残っていても誤検知しない（クラス境界の確認）

**やらないこと**

- pairings / results 側の参照整合性チェック（既存ガードに任せる）
- save 失敗時のリトライ（仕様検討が別タスク）
- UI 全体のステータス表示変更（lifecycle ステータスは A-5.1 別段階）

---

### 3.2 第二候補: `addPlayer` の保存 verify（S01）

**なぜ初期適用に向いているか**

- 受付時の **最も基本的な操作**。ここが壊れていると気付かないと致命的。
- 追加した player の `id` は呼び出し側で生成されており、verify 時の参照が明確。
- 1 件追加なのでバッチ複雑性なし。

**保存成功条件**

- `save()` 実行後、`state.players[cls]` に `id` が存在し、かつ `name` が新規参加者名と一致すること。

**verify 方法**

```
function verifyPlayerPersisted(playerId, cls, expectedName) -> boolean
```

- 既存 `verifyStatePersisted` は **A/B 両クラスを走査** して name のみ比較する作りなので、追加用には「指定 cls + id + name」3 軸の helper を別途用意する方が安全（既存関数の挙動変更は MASTER-001 に影響するため避ける）。

**失敗時表示**

- `console.warn('SAVE-001: addPlayer の保存が確認できませんでした (player='+id+')')`
- `showMsg(name+'（'+cls+'クラス）を登録しました（保存未確認）', 'warn')`

**テスト観点**

- 手入力追加 → verify true
- サジェスト追加 → verify true（既存の yomi 補完経路と干渉しないこと）
- localStorage 容量超過の模擬で verify false を返す
- 連続追加（5 件）で各 verify true（state 全体の整合性）

**やらないこと**

- `_pendingNewYomi` のクリーンアップ確認（saveData 時のサイクル）
- member_id / entry_no の整合性確認（採番ロジックは A-5.1-NUM-001 の責務）

---

### 3.3 第三候補: `setWinner` の保存 verify（S12）— **慎重採用**

**なぜ初期適用に向いているか / 慎重な理由**

- 大会中 **最も頻度が高い** 操作（1 局 = 1 setWinner、回戦数 × ペア数で数十回）。
- そのため verify 失敗時の UI を **絶対に強くしてはいけない**（toast すら抑制すべきかもしれない）。
- 単一フィールド（`winner`）の一致確認なので verify ロジックは簡単。
- 「保存できていない」状態で次の操作に進むと致命的なので価値は高い。

**保存成功条件**

- `state.pairings[cls][idx].winner` が `wid` または `null`（トグル）と一致すること。

**verify 方法**

```
function verifyWinnerPersisted(cls, idx, expectedWinner) -> boolean
```

- `expectedWinner` には `null` も渡せること（トグル解除のケース）。

**失敗時表示**

- 通常時は **silent**（console.warn のみ）
- ただし「連続で N 回 verify false」となった場合のみ画面下部に小バナーで「保存が遅延している可能性があります」と表示（仕様詰めは A-5.1-SAVE-001 後半 or A-5.1-SAVE-002 に持ち越し）

**テスト観点**

- 勝敗 ON → verify true
- 同一勝者再タップ（トグル OFF） → verify true（`null` 一致）
- 高頻度連打（10 回連続）で各 verify true

**やらないこと**

- 連打スロットリング（別仕様）
- 「N 回連続失敗で警告」ロジック（仕様詰めが必要なので本候補からは外す）

---

## 4. 今は触らない方がよい保存処理

| 保存処理 | 理由 |
|---|---|
| `syncBranchMasterOnSave()`（S27, 4516行） | 2 段保存（master → state）かつ clipboard / file 出力と一連の流れ。verify するなら **localStorage 部分だけ** を切り出す設計が必要。MASTER-001 と二重 verify になるため要設計整理 |
| `applyPhase2Import` / overwrite / merge / migration（S23-S26） | バッチ import 系。verify 対象が member 配列全体になるので軽くない。1 回限りの操作なので失敗時 UI が画面遷移を伴ってしまい設計負荷が高い |
| `bindReportEvents()` の input ハンドラ（S16） | タイピング毎に save() が走るため、verify を入れるとノイズになる。バッチ（blur / 一定時間後）で 1 回 verify する別仕様が必要 |
| `generatePairing(cls)`（S11） | ペアリング配列全体の置換。同じ組合せに収束する保証がないため verify 軸（配列長か、組合せ厳密一致か）の仕様検討が必要 |
| `bindMasterEditModalEvents` 保存（S19） | 複数フィールド更新。V2 を拡張する必要があり、MASTER-001 の関数シグネチャ変更を伴う可能性がある。安全策として S19 は段階 2 以降 |
| マスタリセット（S22） | 不可逆操作。verify は「member が空であること」だけだが、リセット失敗時の UI 仕様が別途必要 |
| import 系全般（S17, S23-S26） | I/O とバッチが混在。1 件 verify ではなく「件数の一致」が主な軸となり、verify ロジック自体が大きい |
| clipboard / file download / report 印刷（X01-X06） | 外部 I/O のため検証不可。範囲外 |

---

## 5. 推奨順序

| 段階 | 内容 | 対応 callsite |
|---|---|---|
| **A-5.1-SAVE-001** | 大会データ保存の verify（基礎 3 件） | S06（removePlayer） / S01（addPlayer） / S12（setWinner） |
| A-5.1-SAVE-002 | 大会データ保存の verify（拡張） | S04（updateField）/ S07（bulkEditNames）/ S13（changePairing）/ S14（submitRound）/ S15（editPastResult）/ S10（startTournament） |
| A-5.1-SAVE-003 | 会員マスタ保存の verify（V2 拡張 + 削除/復元） | S19（master edit, V2 拡張）/ S20（delete）/ S21（restore）/ S02（クラス変更時の master）/ S18（last_class） |
| A-5.1-SAVE-FUTURE | バッチ系・I/O 系・report 系 | S03 / S05 / S11 / S16 / S17 / S22 / S23 / S24 / S25 / S26 / S27（一部）/ clipboard / file 系の「verify 対象を別仕様で定義する」検討 |

---

## 6. 必要なテスト

### 6.1 SAVE-001 段階で必要な test 観点

- **正常系**
  - removePlayer / addPlayer / setWinner それぞれで verify が true を返す
  - 連続操作（n=5〜10）でも逐一 true
  - クラス境界（A/B）で誤検知しない
- **異常系**
  - localStorage が空 / 壊れた JSON で false を返す
  - localStorage への書込みが例外を投げた直後で false を返す（容量超過の模擬）
  - 削除直後に他コードが state を変更したケースで verify が **意図通り false** を返す（保存後 race を検出できるか）
- **UI 観点**
  - verify false 時の `showMsg(.., 'warn')` がトーストとして 1 度だけ出る
  - alert は出ない（現場停止リスク回避）
  - 連続失敗時の UI 仕様は SAVE-001 内では実装しない

### 6.2 既存テストへの影響

- MASTER-001 で追加された `applyParticipantRenameOnly` / `applyParticipantRenameWithMaster` のテストは **そのまま維持**。
- 既存 V1（`verifyStatePersisted`）には手を入れない方針（A/B 走査・name 比較の挙動を変えると MASTER-001 のテストが壊れる）。SAVE-001 で必要な helper は新規追加する。

---

## 7. リスクと注意点

### 7.1 仕様面

- **保存処理ごとに成功条件が違う** — 単一の `verifyPersisted` 関数で全 callsite をカバーすると逆に脆くなる。callsite 種別ごとの helper を用意する設計が安全。
- **re-read 対象を間違えると偽陽性になる** — 例えば addPlayer の verify を「name 一致」だけで判定すると、同名既存 player を誤って "OK" と判定する。`id + cls + name` の 3 軸が必要。
- **削除の verify は「存在しないこと」を確認する負の検証** になる。helper の戻り値の意味（true=削除成功）を明確にする必要がある。
- **トグル操作（setWinner の解除）は `null` 一致** — `expectedWinner` パラメータが `null` を取れる設計にしないと verify 自体が機能しない。

### 7.2 UX 面

- **保存失敗表示が強すぎると現場を止める** — alert は使わない。toast（`showMsg`）に限定する。連続表示しない。
- **verify 失敗 ≠ 保存失敗** — verify 失敗は「保存できたか確認できなかった」状態を意味する。warning レベルで表現し、データ消失と断定しない。
- **頻度の高い操作（setWinner）は silent verify** — 個別失敗時に UI を出すと現場が混乱する。「N 回連続失敗で警告」のような閾値ロジックは別タスクで仕様検討。

### 7.3 ストレージ性質の違い

- **localStorage と export/download は別性質**。前者は再読込で検証可能、後者は不可。同じ「保存」UI で両方走るケース（`saveData()` 経由）は分けて考える。
- **会員マスタ更新と大会データ保存は別軸**。`syncBranchMasterOnSave()` のように 2 段保存する関数では、どちらの段階で失敗したかを区別できる verify が必要。
- **大会データの保存成功 ≠ 会員マスタの保存成功** — どちらかが verify false でも他方は true のケースがある。UI 表示も別々にすべき。

### 7.4 既存実装との整合

- MASTER-001 で確立した V1 / V2 の仕様は **変更しない**。SAVE-001 で必要な新 helper は別関数として追加する。
- `save()` / `saveBranchMaster()` 本体の例外処理（`try/catch` で握り潰し）も変更しない。verify は **呼び出し側で行う** 設計を維持する（MASTER-001 と同じ流派）。

---

## 8. 判断保留事項

Claude Code 側で判断できないため、髙橋さん・ChatGPT 司令塔に確認したい事項：

1. **SAVE-001 で何件まで適用するか**
   - 本メモでは 3 件（S06 / S01 / S12）を候補にしたが、初手は **1 件のみ**（S06 だけ）にする選択肢もある。
2. **verify failed 時の UI ガイドライン**
   - toast (`showMsg`) のレベルは `warn` で良いか、新しい `caution` レベルを作るか。
3. **連続失敗時の閾値ロジック**
   - 「N 回連続 verify false で警告バナー表示」を SAVE-001 に含めるか、別タスクに分けるか。
4. **既存 `verifyStatePersisted` の取扱い**
   - SAVE-001 で新 helper を追加する場合、既存 V1 と naming convention を揃えるか（例: `verifyPlayerPersistedById`、`verifyWinnerPersisted` 等）。
5. **`syncBranchMasterOnSave()` の verify 範囲**
   - `saveData()` 経由の 2 段保存を verify する場合、A-5.1 のどの段階で扱うか。
6. **report 入力欄（S16）の保存戦略**
   - タイピング毎の save() を維持するのか、blur / debounce ベースに変えるのか。verify は後者でないと現実的でない。
7. **対局カード / 会費・支払状態は実装スコープか**
   - 依頼書 §3 に挙がっているが、現コードベースには存在しない。今後実装する予定があるなら SAVE-DESIGN の枠で先回りすべきか、不要なら依頼書側から削除すべきか。

---

## 9. 履歴

| 日付 | 内容 |
|---|---|
| 2026-05-12 | v0 作成。A-5.1 Stage 1 の保存処理棚卸しとして作成。 |
