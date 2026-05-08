# Phase 2 master reset + 22-name import Codex Gate Review 依頼

**作成日時**: 2026-05-08 11:04 JST
**対象 PR**: feat(phase2): master reset + 22-name import for 2026-05-10 tournament
**ブランチ**: `feat/phase2-master-reset-import`(main `b311ad8` 起点 = Phase 1 マージ後)
**仕様書**: `docs/specs/20260508_0903_phase2_master_reset_import_spec.md`(A- 確定、SF1/SF2 反映済)
**Plan**: `docs/specs/20260508_1047_phase2_plan.md`(髙橋さん承認済)
**取り込みデータ**: `data/import/20260412_participants.json`(22 名: A 18 / B 4)
**runbook**: `docs/operations/20260510_tournament_setup.md`(実装前ドラフト)
**レビュー深度**: Gate Review(Codex のみ)、1 PR 1 回、**P0 + データ破壊観点最重視**
**判定基準**: A 以上で squash merge(髙橋さん実機リハーサル + Phase 2 文書通読 OK 後)

---

## 1. 採用ケース: **C 改**(リセット新規 + Phase 2 専用 import 新規)

仕様書 §4 ケース判定の詳細:
- **既存リセット機能なし**(L95 `#resetBtn` は state リセットのみ、L361「resetAll() ではマスタを消さない」明記)
- **既存 import 機能あり**(`applyOverwriteImport` / `applyMergeImport`)、形式 `{members:[]}` 必須 + `id` 必須 + 空マスタ専用制限なし
- 取り込みデータ `data/import/20260412_participants.json` は **配列形式 + last_played + id 不在** → 既存 import に投げると `normalizeBranchMaster` L477「`if(!id||!name||seenIds[id])continue;`」で **全件 dropped(P0 データ消失)**

**採用判断**: 既存 import を流用すると P0 データ消失リスク → 既存 import モーダル(overwrite/merge)は不変、**Phase 2 専用 import 機能を別関数 + 別ボタンで実装**。

---

## 2. 変更内容

### 2.1 production 修正 (`shogi_v4.html`、+396 行 / -0 行、コミット `52c2beb`)

#### 純粋関数(serializeBranchMasterForExport の直後に追加)

| 関数 | 役割 |
|---|---|
| `applyMasterReset(master)` | members 空の新マスタ返却(mutate しない、tombstone も全削除、updated_at 新規) |
| `validatePhase2ImportData(parsed)` | §2.1 検証(配列長 22 / A 18・B 4 / 全件 last_played === "2026-04-12" / name 非空 / city ≤ 20)、戻り値 `{ok, errors:[{index,field,message}], summary:{total,classA,classB}}` |
| `convertPhase2ParticipantsToMembers(parsed, master)` | id 自動生成(`generateMemberId`) + `last_played` → `last_attended`/`first_attended` + Phase 1 `normalizeCity` 経由 + `tournament_ids:[]` / `attendance_count:0` / `deleted:false` 等 default 補完 |
| `applyPhase2Import(parsed, master)` | **空マスタ専用ガード**(deleted=false 生存件数で判定) + §2.1 検証 + 変換 + 全件成功 or 0 件適用のロールバック保証 |

#### UI(B 案)

| 関数 / DOM | 内容 |
|---|---|
| マスタタブ ボタン追加 | `📥 22 名取込(5/10 大会用)`(青枠) + `📛 マスタをリセット`(赤枠) |
| `buildMasterResetModalHtml` / `bindMasterResetModalEvents` / `openMasterResetModal` | 件数表示(生存 + tombstone) + バックアップ済チェックボックス(必須) + テキスト「リセット」入力 + 二段階確認(両方満たすまで実行ボタン disabled) |
| `buildPhase2ImportModalHtml` / `bindPhase2ImportModalEvents` / `openPhase2ImportModal` | 既存件数表示 + 既存 1 件以上で警告バナー(実行不可表示) + ファイル選択 → JSON.parse → §2.1 検証 → プレビュー(件数 + A/B 集計 + サンプル 3 件: A 級 1 / B 級 1 / city 長め 1) → 実行 |
| 共通 | 実行成功時: saveBranchMaster + renderMasterTab + renderPastParticipantsPanel 即時反映 |

### 2.2 設計判断

**(a) `BRANCH_MASTER_SCHEMA_VERSION` は 1 のまま維持**(Phase 1 と同方針)

**(b) tombstone のみのマスタは Phase 2 import 許容**

`applyPhase2Import` の空マスタガードは **deleted=false の生存件数 > 0** で判定(tombstone 件数は無視)。これは「リセット後に過去削除済 tombstone を tombstone 維持したまま 22 名取込 → tombstone 1 + 新 22 = 計 23 件」を許容する設計。Plan §3.1 で明示、e2e で確認済。

**(c) リセット時 tombstone も全削除**

`applyMasterReset` は members 配列を **空配列** に置換。tombstone も含めて全削除。仕様書 §5.1 通り。

**(d) updated_at 新規付与**

`applyMasterReset` および `applyPhase2Import` 結果の newMaster は `updated_at = new Date().toISOString()`。saveBranchMaster 側でも更新するが、純粋関数戻り値の時点で新規 timestamp を持つ。

### 2.3 e2e (`shogi_phase2_import.spec.js` 新規 +540 行、計 22 件 × 2 project = 44 件、全緑)

仕様書 §6 受け入れ条件 1〜10 すべてカバー。詳細は本文書 §3 受け入れ条件結果参照。

### 2.4 visual snapshot 更新 5 枚(マスタタブにボタン 2 つ追加分)

- chromium-desktop: `master-list-{375}` / `master-edit-modal-375` / `master-restore-tombstone-375`
- mobile-375: `mobile-master-edit-modal-375` / `mobile-master-list-5cols-375`

### 2.5 runbook 実装前ドラフト

`docs/operations/20260510_tournament_setup.md`(7 セクション、仕様書 §9 通り実装前配置)

### 2.6 結果

- 全 e2e: **670 passed**(従来 626 + phase2 44)
- 単体テスト: **PASS=50, FAIL=0**

---

## 3. 受け入れ条件 検証結果(仕様書 §6 1〜10)

| # | 観点 | 結果 |
|---|---|---|
| 1 | リセット二段階確認 OK でマスタ空 | ✅ PASS(`§6 #1/#2` 7 件) |
| 2 | リセットキャンセル/失敗で何も起きない | ✅ PASS(キャンセル + テキスト不一致 + チェック未) |
| 3 | 既存 1 件以上で import 拒否 | ✅ PASS(`§6 #3` 3 件、純粋関数 + UI 警告バナー + tombstone のみ許容) |
| 4 | 22 名すべて登録(name/city/last_class/last_attended) | ✅ PASS(`§6 #4` 全フィールド検証 + id 形式 + tournament_ids 空 + attendance_count 0 等) |
| 5 | §2.1 検証通過のみ適用、失敗時全件ロールバック | ✅ PASS(`§6 #5` 6 件、各検証 fail + master 不変) |
| 6 | city が Phase 1 §2.1 正規化ルール通り | ✅ PASS(convert 単体 + UI 経由の trim 両方確認) |
| 7 | 過去参加者パネルに 22 名表示 | ✅ PASS(`§6 #7` リセット → import → 未エントリー 22 名) |
| 8 | F7 編集モーダルで 22 名分の yomi/member/grade 編集可能 | ✅ PASS(代表 1 名 片山凱翔で確認) |
| 9 | 既存 e2e 緑維持 | ✅ PASS(**670 passed** = 626 + 44) |
| 10 | round-trip(backup → リセット → import → restore)deepEqual | ✅ PASS(`§6 #10`、updated_at 以外のフィールドを id ソート + Object 比較) |

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `c41394d` | docs(phase2): Plan Mode output |
| 2 | `52c2beb` | feat(phase2): master reset + 22-name import |
| 3 | `8c1ffaa` | test(phase2): e2e + visual snapshot + runbook ドラフト |

---

## 5. レビュー観点(必読、P0 重視)

### 5.1 Codex Gate Review 観点(P0 + 保存読込 + データ破壊 + 既存挙動破壊)

#### 5.1.1 リセット誤操作防止(二段階確認 + バックアップ条件)の妥当性

- **チェックボックス + テキスト入力の AND 条件で `mr-run` ボタンが活性化**(両方満たすまで disabled)
- 件数表示(生存 + tombstone)を別個に表示 → ユーザーがバックアップ件数と照合可能
- runbook §1 で「画面表示の件数を控えてからリセット直前に再確認」を明文化
- バックアップ条件は仕様書 §5.1 B 案(チェックボックス必須 + 件数表示 + 二段階)を全て実装、A 案(セッション内 export 履歴管理)は Out of Scope

#### 5.1.2 空マスタ専用 import 制限の確実性

3 段ガード:
1. **モーダル開く時点**:`buildPhase2ImportModalHtml` で既存件数 > 0 なら警告バナー表示(視覚)
2. **ファイル選択時の検証**: `bindPhase2ImportModalEvents` でファイル選択直後に再度 `loadBranchMaster` → liveCount チェック → 拒否(モーダル開いた後にマスタが追加された場合の保険)
3. **`applyPhase2Import` 内**: 純粋関数レベルで `liveCount > 0` なら error 返却(関数を直接呼んだ場合の保険)

#### 5.1.3 §2.1 検証 + 全件ロールバック保証

- `validatePhase2ImportData` は配列内全件を走査して errors 配列を返す(早期 return しない、複数 error をユーザーに同時通知)
- `applyPhase2Import` で validation.ok=false なら convert を呼ばずに error 返却 → newMaster は undefined → 呼出側で saveBranchMaster しない
- `convertPhase2ParticipantsToMembers` 内で `generateMemberId` が throw した場合は catch して error 返却(部分 newMaster は返さない)
- e2e §6 #5 で「検証失敗 → master 不変」を localStorage 経由で確認

#### 5.1.4 city 正規化の Phase 1 helper 経由

- `convertPhase2ParticipantsToMembers` 内で `cityNorm = normalizeCity(p.city)` を経由(Phase 1 helper を重複定義しない)
- e2e §6 #6 で convert 単体 +(F7 経由の)UI 経由の両方で trim 動作確認

#### 5.1.5 §6 #10 deepEqual round-trip の比較範囲妥当性

- 比較対象: members 全体(id/name/yomi/last_class/last_attended/first_attended/attendance_count/tournament_ids/deleted/deleted_at/note/member/grade/city)+ schema_version
- **除外**:`updated_at`(リセット時 + restore 時に再生成され当然変化、運用上問題なし)、`_loaded_with_corruption` 内部キー
- 比較方式: id でソート後に Object 全体 `toEqual`(Playwright の deep equality)
- 仕様書 §6 #10「件数 + name + yomi + member + grade + city + last_class + last_played + その他既存フィールド すべてが JSON stringify ベースの完全一致、または正規化後 deepEqual で元通り」を**満たす**(last_played は Phase 2 取込時のみのフィールドで、export 時は last_attended として保持される。本テストでは F7 補完済 + 既存 import で復元した状態と元の状態を比較するため、フィールド名のミスマッチなし)

#### 5.1.6 既存挙動破壊なし

- 既存 import モーダル(overwrite/merge)・既存 export 機能・大会単位 resetAll は変更なし
- BRANCH_MASTER_SCHEMA_VERSION も 1 のまま維持(Phase 1 判断踏襲)
- 既存 626 e2e 全緑維持(visual snapshot 5 枚はマスタ画面のボタン追加分で意図通り更新)

### 5.2 Devil's Advocate(自己点検)

1. **`generateMemberId(working)` の重複チェック範囲**:
   convert 中に master.members(空 or tombstone のみ)+ 既に push 済の新規 members を含む `working` を渡し、id 衝突を回避。`generateMemberId` は内部で 3 回まで retry → 失敗時 throw。22 名の独立 ID 生成は実用上 100% 成功。

2. **`saveBranchMaster` 失敗時のロールバック**:
   `applyPhase2Import` は純粋関数で newMaster を返すのみ。saveBranchMaster は呼び出し側(`bindPhase2ImportModalEvents`)で実行され、try/catch なしで `localStorage.setItem` する → 失敗時に何が起きるか?
   - 答え: `saveBranchMaster` は内部で try/catch + console.warn(L538)、setItem 失敗時に警告のみ → モーダルは閉じるが localStorage は元のまま。**潜在的な UX 不具合**。runbook §6.2 で「リセット後 import 失敗時はバックアップ復元」を明示しているが、setItem 失敗の検知が弱い。**Codex review で確認依頼**。

3. **モーダル内 closure の `validatedParsed` 状態**:
   `bindPhase2ImportModalEvents` は内部に closure 変数 `validatedParsed` を持ち、ファイル選択 → 検証 → プレビュー → 実行ボタン活性化のフローでこれを使う。**ファイル再選択時に `validatedParsed = null` リセット + disableRun()** で確実に再検証を強制。

4. **city 21 文字以上の検証 vs Phase 1 normalizeCity の slice(0,20) の整合性**:
   - validatePhase2ImportData は city > 20 で **fail**
   - normalizeCity は city > 20 を **silent slice(切り詰め)**
   - 矛盾していないか?→ 仕様書 §2.1「city が 20 文字以内」を Phase 2 取込前提とし、import 時は **明示エラー**(検証失敗 = 入力データの不正をユーザーに知らせる)、F7 手入力時は **silent slice**(maxlength=20 で UI 側保証 + 万一超過しても自動切り詰め)で UX 適切。Codex 確認依頼。

---

## 6. 想定される A 判定外要素(自己点検)

- **5.2 #2 saveBranchMaster 失敗検知**:現状は warn のみ、UI 反映は楽観的。runbook §6 で対処を明示しているが、setItem 失敗時の UI トースト/モーダル残存対応は **将来改善候補**。
- **runbook の確定タイミング**:仕様書 §9 通り「実装前ドラフト」を配置、実機リハーサル(可能なら 5/9)で確定。Codex review では **ドラフト構造の網羅性のみ**確認可、実機結果反映は本 PR 後に別 commit 想定。
- **Plan B(DevTools 直叩き)の準備**:ケース C 改採用で本 PR が予定通りマージされれば Plan B は使わない。仕様書 §7 で言及、本 PR には含まれない。

---

**END**
