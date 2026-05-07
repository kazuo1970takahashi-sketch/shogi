# shogi A-T Stage 2c PR-3 Codex Gate Review 依頼

**作成日時**: 2026-05-07 14:37 JST
**対象 PR**: feat(stage-2c): A-T PR-3 shogi_app_a4 factory 化 + syncBranchMasterOnSave 書き直し
**ブランチ**: `feat/at-stage-2c-shogi-app-a4`(main 78fa160 起点)
**仕様書**: `docs/specs/20260507_1244_shogi_at_stage_2c_mini_spec_v1.md`(本 PR-3 スコープは §2.3 / §3.2 / §4 / §5)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)
**判定基準**: A 以上で squash merge

---

## 1. 変更サマリ

A-T spec v1.3 §5 Stage 2c の 3 PR 構成のうち **PR-3(最終)**。`shogi_app_a4.spec.js`(45 it / 54 click)を factory 化、Stage 1 §4.2「完全書き直し対象」2 件(L40 / L100 旧位置の `syncBranchMasterOnSave` 直接呼出)を §5 標準手順で UI 経由フローに書き直し。新規 factory `masterMemberRestored` を追加(#24)。

### 変更ファイル

- `test/helpers/shogi_assertions.js`(差分 +24、masterMemberRestored 追加 + tabSwitched を idempotent 許容に緩和)
- `test/helpers/shogi_assertions.test.js`(差分 +5、新 factory を FACTORY_NAMES に追加 + コメント更新)
- `test/e2e/shogi_app_a4.spec.js`(差分 +263 / -53、45 it 置換 + 2 件完全書き直し)

### 変更しないファイル

- `shogi_v4.html`(production code)無変更
- 既存 helpers(`clickAndExpectChange` / `clickAndExpectChangeUnchecked` / `expectClickable` / `getStateSnapshot`)無変更
- 既存 22 factory(#1〜#22)無変更

---

## 2. §7 受け入れ条件 5 観点 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | **P0**(対象 it 全 pass) | `npx playwright test test/e2e/shogi_app_a4.spec.js` | ✅ **102 passed**(51 it × 2 project: chromium-desktop / mobile-375。Stage 6 の for-loop で 6 × 2 widths = 12 it を含む) |
| 2 | **既存挙動破壊なし**(全 e2e 緑維持) | `npx playwright test` | ✅ **446 passed**(PR-2 442 + masterMemberRestored unit 4 増分) |
| 3 | **構造的防止達成**(it body 内 raw click 0、`force:true` 0) | sed/grep 検証(下記) | ✅ it body 内 0、beforeEach 7 件のみ §6 R2 通り温存、`force:true` 0 |
| 4 | **保存読込影響なし**(localStorage 系) | syncBranchMasterOnSave 書き直し 2 件で localStorage 同等性を before/after 比較で構造保証 | ✅ §3.2 詳細 |
| 5 | **データ破壊なし** | masterImport(従来通り別 spec)/ masterDelete / masterRestore 経路で master 同等性を before/after 比較 | ✅ §3.3 詳細 |

### §7 P3 grep 検証コマンド

```bash
# it body 内 raw click(beforeEach 除外、ネスト test も含む)
$ awk '/^[[:space:]]+test\(/ {in_test=1; depth=0; next} in_test {...}' test/e2e/shogi_app_a4.spec.js | grep '\.click('
(空 = OK)

# 全体 raw click
$ grep -nE '\.click\(' test/e2e/shogi_app_a4.spec.js
L299: await page.click('#tab-master');     # Stage 3 一覧 beforeEach
L323: await page.click('#tab-master');     # Stage 3 編集 beforeEach
L427: await page.click('#tab-master');     # Stage 4 トグル beforeEach
L467: await page.click('#tab-master');     # Stage 4 復元 beforeEach
L468: await page.click('#masterShowDeletedBtn');  # 同上(2 段 beforeEach)
L560: await page.click('#tab-master');     # Stage 5 マスタ未入力 beforeEach
L596: if (await panelToggle.isVisible()) await panelToggle.click();  # Stage 5 過去参加者 beforeEach (conditional)

# force:true
$ grep -nE 'force:\s*true' test/e2e/shogi_app_a4.spec.js
0 件
```

beforeEach の 7 件はすべて Stage 2a 仕様書 §8 R2「beforeEach 自体は変更せず」に従い温存。

### npm test (単体テスト)

```
結果: PASS=50, FAIL=0, WARN=0
```

---

## 3. 実装上の判断ポイント(Codex の論点候補)

### 3.1 masterMemberRestored factory の primary 設計

production grep(`shogi_v4.html` L800-808):
```js
function restoreMember(memberId){
  ...
  if(target.deleted!==true)return {success:false,error:'not_deleted'};
  target.deleted=false;
  target.deleted_at=null;
  return {success:true};
}
```

採用 primary:
1. `before.master.members[id].deleted === true`(precondition: 復元前は削除済)
2. `after.master.members[id].deleted === false`(復元後)
3. `after.master.members[id].deleted_at === null`(deleted_at リセット)

`primaryAssertions: 2`(precondition は副次扱いで meta カウント外)。`masterMemberDeleted` の対称実装。

5 件出現(Stage 4 復元ボタン describe の 5 it)。

### 3.2 syncBranchMasterOnSave 完全書き直しの実装方針

§5 標準手順 4 ステップを忠実に適用:

| Step | 旧実装 | 新実装 |
|---|---|---|
| 1 | clipboard 権限なし | `await context.grantPermissions(['clipboard-read', 'clipboard-write'])` |
| 2 | `await page.evaluate(() => syncBranchMasterOnSave())` 直接呼出 | `clickAndExpectChange(page.locator('#saveBtn'), raw callback)` で UI 経由 |
| 3 | primary 不在(localStorage を後で evaluate で読み込み) | `ctx.primary` + `after.master.members.find(...)` で master 状態変化を assertion |
| 4 | localStorage 直接読み込み(Stage 1 §4.2 違反) | factory の after-snapshot で構造保証 + 既存 localStorage 直読 assertion を温存 |

**production フロー確認**: `#saveBtn.click → saveData() → syncBranchMasterOnSave() (sync) → JSON.stringify(state) → navigator.clipboard.writeText() (async) → alert (async)`(`shogi_v4.html` L3312-3325)。`syncBranchMasterOnSave` は同期完了するため、clickAndExpectChange の after-snapshot で master 状態を捕捉できる。

`page.on('dialog', d => d.accept())` で alert auto-accept。clipboard 失敗時は saveDataAsFile fallback(Blob+download)、テストは clipboard 権限付与で確実に clipboard パスを通す。

### 3.3 Unchecked 適用 4 件の根拠

PR-2 と同基準:
- `.suggest-item` は `<div>` + `addEventListener('mousedown', onSuggestTap)` で handler 登録、inline onclick 不在
- click target は子の `.si-info` に変更(hit-test 回避、PR-2 と統一パターン)
- 親 `.suggest-item` の mousedown ハンドラがバブリングで発火するため production 動作と等価

該当 4 件:
- L83 サジェスト選択時 yomi 反映(Stage 1)
- L98 マスタ yomi 補完(Stage 1、2 回呼出)
- L262 サジェスト選択後手動修正(Stage 2)

### 3.4 playerRemoved(L106 旧位置)の raw callback 対応

仕様書 §4 通り:
- `.player-row` 内削除ボタンは L0 P0 catalog 未登録
- factory 化はせず raw callback で `ctx.primary('player removed from class A: state.players.A length -1')`
- TODO コメント `// TODO: L0 §1.5 見直し時に playerRemoved factory 化検討(仕様書 §4 申し送り)` 併記

### 3.5 区分(member) / grade 変更で raw callback を選択した判断

`masterMemberEdited` factory は name/yomi 変化のみ検出(stableStringify 比較)。Stage 3 編集モーダル describe で member や grade 変更のみのテスト 3 件は factory 範囲外のため raw callback で個別フィールド変化を primary に。

新 factory `masterMemberFieldChanged(targetId, fieldName)` 化は、L0 §1.5 P0 catalog 拡張(Stage 4 以降)タイミングで再検討。本 PR 内では raw callback で十分。

### 3.6 tabSwitched factory の idempotent 許容化(Stage 6 利用前提)

PR-1 で導入した `tabSwitched` は副次として `before.activeTab !== targetTab` を要求していたが、Stage 6 横スクロール検証(初期 tab-reg 状態で `#tab-reg` クリック)で idempotent クリックが正当なケースとして発生したため、PR-3 で `after.activeTab === targetTab` のみを primary として残す形に緩和(commit `e729723`)。

PR-1 / PR-2 のタブ切替テストはすべて実切替で、緩和後も全件緑(446 passed)。

### 3.7 beforeEach 内 raw click 7 件の §6 R2 準拠温存

shogi_app_a4.spec.js 内に 7 件残存(全て beforeEach 内):
- Stage 3 一覧 / 編集 / Stage 4 トグル / Stage 4 復元(2 件)/ Stage 5 マスタ未入力: `#tab-master`
- Stage 4 復元: `#masterShowDeletedBtn`(2 段 beforeEach の 2 段目)
- Stage 5 過去参加者: `panelToggle.click()`(conditional)

Stage 2a 仕様書 §8 R2「beforeEach 自体は変更せず、it 本体内のクリック操作のみを置換する」に従い温存。仕様書 §6「raw click ゼロ / force:true ゼロ(対象 spec の it body 内)」と整合。

---

## 4. コミット履歴

```
b049ec0 refactor(stage-2c): Stage 5 + Stage 6 + Stage 2 unit を factory 化(16 it / 16 click)
e729723 fix(stage-2c): tabSwitched factory を idempotent 許容に緩和
9cfe275 refactor(stage-2c): Stage 4 削除済み表示トグル + 復元ボタンを factory 化(8 it / 13 click)
87a9a9e refactor(stage-2c): Stage 2 + Stage 3 describe を factory 化(14 it / 13 click)
e32a42d refactor(stage-2c): syncBranchMasterOnSave 完全書き直し 2 件(§5 標準手順)
5f5e843 refactor(stage-2c): Stage 1 描画系 5 it を factory 化(syncBranch 系除く)
a3b966c feat(stage-2c): masterMemberRestored factory 新設(PR-3)
78fa160 feat(stage-2c): A-T PR-2 shogi_app_a3 factory 化 (#14)
```

論理単位で分離(factory 追加 / Stage 1 通常 / §5 完全書き直し / Stage 2-3 / Stage 4 / tabSwitched 緩和 / Stage 5-6-unit)。

---

## 5. Codex への確認依頼

下記 5 観点を A 判定基準として独立検証をお願いします。

1. **P0**: 対象 51 it が全 pass(`npx playwright test test/e2e/shogi_app_a4.spec.js`)
2. **既存挙動破壊なし**: 全 e2e 446 件が緑維持(PR-2 442 + 増分 4)、PR-1 / PR-2 のタブ切替テストが tabSwitched 緩和後も緑
3. **構造的防止**: shogi_app_a4 it body 内 raw click 0、beforeEach 7 件のみ §6 R2 通り温存、`force:true` 0
4. **masterMemberRestored の妥当性**:
   - production スキーマ(deleted=false / deleted_at=null)と整合しているか
   - precondition チェック(before.deleted === true)が過剰でないか
   - masterMemberDeleted の対称性が保たれているか
5. **syncBranchMasterOnSave 完全書き直しの妥当性**:
   - §5 標準手順 4 ステップが忠実に適用されているか
   - UI 経由フロー化が production の saveData → syncBranchMasterOnSave → clipboard 動作と等価か
   - clipboard 権限付与 + dialog handler 設定が production の async fallback (saveDataAsFile) を踏み抜かないか

**特に注視してほしい点**:
- Unchecked 4 件の `.si-info` click target 変更が production の event bubbling 仕様と矛盾しないか(PR-2 同パターン踏襲確認)
- playerRemoved(L106 旧)の raw callback 対応 + TODO コメントが仕様書 §4 申し送りと整合しているか
- 区分(member) / grade 変更で raw callback を選択した判断が L0 §1.5 P0「マスタ編集」の primary semantic 解釈と一致しているか
- tabSwitched 緩和の影響範囲が PR-1 / PR-2 のテストに及んでいないことの確認(446 passed の継続)
- §5 完全書き直し 2 件で旧 evaluate 直接呼出が完全に排除されているか(`grep "evaluate.*syncBranchMasterOnSave"` で 0 件)

判定 A 以上であれば squash merge → main 同期 → Stage 2c 完了 → Stage 4(A-4.2 回帰テスト + Mutation Testing)着手。
