# shogi A-T Stage 2c PR-2 Codex Gate Review 依頼

**作成日時**: 2026-05-07 13:56 JST
**対象 PR**: feat(stage-2c): A-T PR-2 shogi_app_a3 factory 化
**ブランチ**: `feat/at-stage-2c-shogi-app-a3`(main e09ab73 起点)
**仕様書**: `docs/specs/20260507_1244_shogi_at_stage_2c_mini_spec_v1.md`(本 PR-2 スコープは §2.2 / §3 / §4)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)
**判定基準**: A 以上で squash merge

---

## 1. 変更サマリ

A-T spec v1.3 §5 Stage 2c の 3 PR 構成のうち PR-2。`shogi_app_a3.spec.js`(25 it / 37 click)を factory 化。新規 factory 追加なし(PR-1 で導入済の `tabSwitched` は本 PR では未使用、L0 §1.5 P1 操作はすべて raw callback で対応)。

### 変更ファイル

- `test/e2e/shogi_app_a3.spec.js`(差分 +210 / -50、25 it 置換)
- `docs/specs/20260507_1244_shogi_at_stage_2c_mini_spec_v1.md`(§4 masterExport 行を 1 行修正、production 実装と整合)

### 変更しないファイル

- `shogi_v4.html`(production code)無変更
- 既存 helpers(`clickAndExpectChange` / `clickAndExpectChangeUnchecked` / `expectClickable` / `getStateSnapshot`)無変更
- 既存 23 factory(`tabSwitched` 含む)無変更

---

## 2. §7 受け入れ条件 5 観点 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | **P0**(対象 it 全 pass) | `npx playwright test test/e2e/shogi_app_a3.spec.js` | ✅ **50 passed**(25 it × 2 project: chromium-desktop / mobile-375) |
| 2 | **既存挙動破壊なし**(全 e2e 緑維持) | `npx playwright test` | ✅ **442 passed**(PR-1 完了時母数を維持) |
| 3 | **構造的防止達成**(it body 内 raw click 0、`force:true` 0) | sed/grep 検証(下記) | ✅ it body 内 0、beforeEach 3 件のみ §6 R2 通り温存、`force:true` 0 |
| 4 | **保存読込影響なし**(localStorage 系) | shogi_app_a3 は `loadFromPaste` 系を呼ばず、master の localStorage は import/export/edit/delete 経路のみ | ✅ Codex 確認のみ(下記 §3.4) |
| 5 | **データ破壊なし** | `runMasterImport` 呼出あり(overwrite/merge/エラー系)。masterImported factory + raw callback で master 状態同等性を before/after で検証 | ✅ 下記 §3.4 |

### §7 P3 grep 検証コマンド

```bash
# it body 内 raw click(beforeEach 除外)
$ awk '/^  test\(/ {in_test=1; depth=0; next} in_test {...}' test/e2e/shogi_app_a3.spec.js | grep '\.click('
(空 = OK)

# 全体 raw click
$ grep -nE '\.click\(' test/e2e/shogi_app_a3.spec.js
L218: await page.click('#tab-master');     # マスタタブ describe beforeEach
L312: await page.click('#ppToggleBtn');    # クイックフィルタ describe beforeEach
L387: await page.click('#tab-master');     # F8 describe beforeEach

# force:true
$ grep -nE 'force:\s*true' test/e2e/shogi_app_a3.spec.js
0 件
```

beforeEach の 3 件はすべて Stage 2a 仕様書 §8 R2「beforeEach 自体は変更せず」に従い温存。

### npm test (単体テスト)

```
結果: PASS=50, FAIL=0, WARN=0
```

---

## 3. 実装上の判断ポイント(Codex の論点候補)

### 3.1 Unchecked 6 件の適用根拠

production grep(`shogi_v4.html` L2313, L2337-2345):
- `.suggest-item` は `document.createElement('div')` で作成、`addEventListener('mousedown', onSuggestTap)` + `addEventListener('touchstart', onSuggestTap)` で handler 登録
- inline `onclick` 不在 → `expectClickable` 段階 3(`hasOnclick = typeof el.onclick === 'function'`)が false 判定
- → Stage 2b 同基準で `clickAndExpectChangeUnchecked` 適用が適合

**click target を子の `.si-info` に変更**: `.suggest-item` 直接クリックは hit-test で親 `#suggest-list`(`border:1px solid; border-radius:8px`)にヒットして失敗するため、Stage 2b の `.si-info` パターンを踏襲。`.si-info` クリック時のイベントは親 `.suggest-item` の mousedown ハンドラがバブリングで発火するため、production 動作と等価。

該当箇所: 6 件(`登録画面サジェスト` describe 内全テストの suggest 候補タップ)。

### 3.2 マスタエクスポート(`#masterExportBtn`)の primary 検証

production 実装(`shogi_v4.html` L1832-1855):
```js
exportBtn.addEventListener('click', function(){
  var blob = new Blob([json], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  alert(filename + ' に保存しました…');
});
```

→ **clipboard ではなく Blob + anchor download + alert**。仕様書 §4 の旧記述「clipboard 内容検証」は production と乖離していたため、本 PR で `download primary` に修正(commit `0ce9073`)。

実装:
```js
let downloadPromise;
await clickAndExpectChange(
  page.locator('#masterExportBtn'),
  async (before, after, ctx) => {
    ctx.primary('download triggered with master json filename, master unchanged');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^shogi_branch_master_\d{4}-\d{2}-\d{2}\.json$/);
    expect(after.localStorage.shogi_branch_master).toBe(before.localStorage.shogi_branch_master);
  },
  { beforeClick: () => { downloadPromise = page.waitForEvent('download'); } }
);
```

`beforeClick` で download promise を pre-await し、assertion 内で resolve + filename 検証 + localStorage 不変。既存テスト(L348-365 旧位置)の `page.waitForEvent('download')` パターンを clickAndExpectChange に移植。

### 3.3 beforeEach 内 raw click(3 件)の §6 R2 準拠温存

shogi_app_a3.spec.js 内に 3 件残存(全て beforeEach):
- L218: マスタタブ describe で `#tab-master`
- L312: クイックフィルタ describe で `#ppToggleBtn`
- L387: F8 describe で `#tab-master`

Stage 2a 仕様書 §8 R2「beforeEach 自体は変更せず、it 本体内のクリック操作のみを置換する」に従い温存。仕様書 §6「raw click ゼロ / force:true ゼロ(対象 spec の it body 内)」と整合(it body 内 0)。

### 3.4 保存読込影響なし / データ破壊なし(§7 観点 4 / 5)

shogi_app_a3 spec の master 影響経路:

| 経路 | 検証 |
|---|---|
| マスタ編集(#me-save) | `masterMemberEdited('m_aaaaaaaaaaaa')` factory が name/yomi 変化を検証 |
| マスタ削除(.master-delete-btn) | `masterMemberDeleted('m_aaaaaaaaaaaa')` factory が deleted=true / deleted_at 設定を検証 |
| マスタインポート 上書き(#mi-run) | `masterImported({expectedNewCount: -2})` で 4→2 変化、schema_version 維持を検証 |
| マスタインポート マージ(#mi-run) | `masterImported({expectedNewCount: 1, existingMemberIds: ['m_aaaaaaaaaaaa']})` で既存 member の name/yomi 維持を検証 |
| マスタインポート エラー系(#mi-run × 3) | raw callback で `expect(after.master.members.length).toBe(before.master.members.length)` 不変確認 |
| マスタエクスポート(#masterExportBtn) | raw callback で `after.localStorage.shogi_branch_master === before.localStorage.shogi_branch_master` 不変確認 |

各経路で before/after 比較により、データ破壊や予期せぬ変更がないことを構造的に保証。

### 3.5 raw callback パターンの内訳(参考)

PR-2 で raw callback を使った it 数:
- モーダル開閉(`#masterImportBtn`): 6 件(F8 describe の各 it 冒頭)
- クイックフィルタ(`.pp-quick-filter-btn`): 5 件
- マスタ編集モーダル開閉(`.master-edit-btn`): 1 件
- マスタインポートエラー系(`#mi-run`): 3 件
- マスタエクスポート(`#masterExportBtn`): 1 件
- 同名拒否エラー(`#addBtn`): 1 件
- Unchecked 適用(`.suggest-item .si-info`): 6 件(これは Unchecked + raw callback)

合計 23 raw callback 用法 / 25 it。残り 2 it は factory 直接ラップ(masterMemberEdited / masterMemberDeleted)+ masterImported 2 件。

---

## 4. コミット履歴

```
0ce9073 doc(stage-2c): 仕様書 §4 masterExport を download primary に修正
49492a5 refactor(stage-2c): F8 エクスポート/インポート describe を factory 化(10 it / 13 click)
12c1369 refactor(stage-2c): クイックフィルタ describe を factory 化(3 it / 5 click)
96ab09a refactor(stage-2c): マスタタブ describe を factory 化(3 it / 4 click)
41d2c4e refactor(stage-2c): 登録画面サジェスト describe を factory 化(9 it / 12 click)
e09ab73 feat(stage-2c): A-T PR-1 shogi_app + index_layout factory 化 (#13)
```

論理単位で 4 describe = 4 implementation commit + spec typo 1 commit。

---

## 5. Codex への確認依頼

下記 5 観点を A 判定基準として独立検証をお願いします。

1. **P0**: 対象 25 it が全 pass(`npx playwright test test/e2e/shogi_app_a3.spec.js`)
2. **既存挙動破壊なし**: 全 e2e 442 件が緑維持(PR-1 母数 442 そのまま)
3. **構造的防止**: shogi_app_a3 it body 内 raw click 0、beforeEach 3 件のみ §6 R2 通り温存、`force:true` 0
4. **Unchecked 適用の妥当性**:
   - 6 件すべて `.suggest-item` 系で、production が addEventListener-only(inline onclick 不在)であることが grep で確認できているか
   - click target を `.si-info` に変更した判断(hit-test 回避)が production の event bubbling 仕様と矛盾しないか
5. **マスタエクスポート download primary**:
   - 仕様書 §4 旧記述(clipboard)が production と乖離していたため修正した判断が正当か
   - download promise pre-await + filename + localStorage 不変の primary が L0 §1.5 P0「マスタエクスポート」の semantic を捉えているか

**特に注視してほしい点**:
- `masterImported({expectedNewCount: -2})` の負数指定がエッジケースで意図通り動作しているか(overwrite で 4→2 = -2 増分)
- マスタインポート/エクスポート/編集/削除 の各経路で master 状態の before/after 比較が正しく primary semantic を担保しているか
- raw callback 6 件のモーダル開閉系で、`expect(modal).toBeVisible()` が primary semantic として L0 §1.5 P1 の「モーダル開閉」要件と整合しているか
- beforeEach 3 件の温存が「raw click 0」の構造保証と矛盾しないか(§6 R2 準拠の解釈一致)

判定 A 以上であれば squash merge → main 同期 → PR-3 着手、B 以下なら本 PR で対応します。
