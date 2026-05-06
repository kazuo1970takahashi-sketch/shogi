# shogi A-T Stage 2b Codex Gate Review 依頼

**作成日時**: 2026-05-07 06:15 JST
**対象 PR**: feat(stage-2b): A-4.2 関連 e2e 22 it factory 置換
**ブランチ**: `feat/at-stage-2b-a42-factory-replacement` (main 1775c98 起点)
**仕様書**: `docs/specs/20260506_2236_shogi_at_stage_2b_a42_replacement_mini_spec_v1.md`
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)
**判定基準**: A 以上で squash merge

---

## 1. 変更サマリ

A-4.2(commit 73961d3)で発生した「A/B クラスボタン実機動作不能だが e2e 全 pass」リグレッション再発防止の構造的施策。Stage 2a で完成した factory(`classSelectedFromPast` / `classSelectedFromSuggest` / `participantAdded`)+ helpers で `test/e2e/shogi_app_a4_2.spec.js` の Stage 2/3 describe 計 22 it を全置換。

### 変更ファイル

- `test/helpers/clickAndExpectChangeUnchecked.js`(新規、158 行)
- `test/e2e/shogi_app_a4_2.spec.js`(差分 +83 / -17、22 it 置換)
- `docs/specs/20260506_2236_shogi_at_stage_2b_a42_replacement_mini_spec_v1.md`(新規、Mini 仕様書 + §3 addendum + §2 typo 修正 1 行)

### 変更しないことの保証

- `shogi_v4.html`(production code)無変更
- Stage 2a helpers(`clickAndExpectChange` / `expectClickable` / `getStateSnapshot` / `shogi_assertions` 等)無変更

---

## 2. §4 受け入れ条件 5 観点 検証結果

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | **P0**(対象 22 it 全 pass) | `npx playwright test test/e2e/shogi_app_a4_2.spec.js -g "Stage 2\|Stage 3"` | ✅ **44 passed**(22 it × 2 project: chromium-desktop / mobile-375) |
| 2 | **既存挙動破壊なし**(全 e2e 緑維持) | `npx playwright test`(全件) | ✅ **438 passed**(Stage 2a 完成時の母数維持) |
| 3 | **構造的防止達成**(対象 22 it 範囲で raw click 0、`force:true` 0) | sed/grep 検証(下記) | ✅ **0 件**(beforeEach の 1 件のみ §8 R2 通り温存) |
| 4 | **保存読込影響なし**(localStorage 系) | A-4.2 spec は `loadFromPaste` / `runMasterImport` を呼ばないため自明 | ✅ Codex 確認のみ |
| 5 | **データ破壊なし** | A-4.2 spec は `resetAll` を呼ばないため自明 | ✅ Codex 確認のみ |

### 観点 3 詳細(grep 検証)

it body 内 raw click(beforeEach 除外):
```
$ awk '/^  test\(.A-4\.2 Stage [23]:?/,...' → 出現 0
```

Stage 2 describe(L31-L193)内の `.click(` 出現: 1 件 = beforeEach L35 `await page.click('#ppToggleBtn')`(§8 R2 通り温存)
Stage 3 describe(L196-L344)内の `.click(` 出現: 0 件

`force:\s*true` 出現(ファイル全体): 0 件

---

## 3. 実装上の判断ポイント(Codex の論点候補)

### 3.1 新規 helper `clickAndExpectChangeUnchecked` 追加

**追加根拠**: Stage 2a `expectClickable` 段階 3(handler 検出)は `tagName ∈ {button, a, input}` または `role` または `inline onclick` で判定。production `shogi_v4.html` の `.suggest-item` / `.pp-row span` などは `addEventListener('mousedown', ...)` で handler 登録しており、いずれも該当しないため誤判定する。22 it 中 3 件(L69 / L212 / L306)で発覚。

**設計**:
- API: `clickAndExpectChangeUnchecked(locator, expectedChange, options)`(`clickAndExpectChange` と同一署名)
- 段階 3(handler 検出)のみ skip、段階 0/1/2/4/5/6 維持
- `force:true` 不使用、primary assertion 必須(>=1)維持

**Stage 2a helpers 不変の保証**: `clickAndExpectChange` / `expectClickable` 本体は **一切変更していない**(import するだけの静的依存も無し、独立 helper として実装)。

**仕様書反映**: §3 末尾 addendum 1 行で本 helper の追加根拠を明記済(commit `c6bf3d6` 参照)。

### 3.2 §2 完全書き直し対象の factory 選択

**仕様書原文(typo 修正前)**: `participantAdded('B')` / `state.players.B`
**実装と修正後仕様書**: `classSelectedFromPast('A')` / `state.players.A`

**修正理由**:
- 当該 it(L138-L143)は `data-cls="A"` ボタン押下、message も「Aクラスで登録しました」検証 → `'B'` は spec 起草時の typo
- Stage 2 describe の他 it と factory 統一(`classSelectedFromPast`)で保守性向上(髙橋さん事前承認、Q1)

修正は実装コミット群と分離した最終 commit `75a7a73` で history 整合性を保持。

### 3.3 beforeEach 温存の整合確認

§4「対象 22 it 範囲で `.click(` 出現 0」と §8 R2「beforeEach 自体は変更せず」の整合解釈:
- 「22 it 範囲」 = 22 個の `test()` 本体内
- `beforeEach` は対象外(§8 R2 で明示的に保護)

`page.click('#ppToggleBtn')`(L35)は Stage 2 describe の beforeEach にあり、§8 R2 通り温存。Codex 確認をお願いします。

---

## 4. コミット履歴

```
75a7a73 doc(stage-2b): 仕様書 §2 typo 修正(B → A)+ factory 統一明記
f8ebecd refactor(stage-2b): Stage 3 describe を classSelectedFromSuggest 化(9 it)
5b783e4 refactor(stage-2b): Stage 2 describe を classSelectedFromPast 化(13 it)
c6bf3d6 feat(stage-2b): clickAndExpectChangeUnchecked helper 追加 + 仕様書 §3 addendum
4cf216b docs(stage-2b): A-T Stage 2b Mini 仕様書 v1 配置
1775c98 feat(stage-2a): A-T Stage 2a UI テストヘルパ実装(spec v1.5 + 全 438 件緑) (#11)
```

論理単位で分離(仕様書配置 / helper + addendum / Stage 2 / Stage 3 / typo 修正)。

---

## 5. Codex への確認依頼

下記 5 観点を **A 判定基準** として独立検証をお願いします。

1. **P0**: 対象 22 it が全 pass しているか(`npx playwright test test/e2e/shogi_app_a4_2.spec.js -g "Stage 2\|Stage 3"`)
2. **既存挙動破壊なし**: 全 e2e 438 件が緑維持されているか
3. **構造的防止**: it body 内 raw click が 0、`force:true` が 0、beforeEach の 1 件のみが §8 R2 通り温存されているか
4. **新 helper の妥当性**: `clickAndExpectChangeUnchecked` が段階 3 のみ skip し、その他段階(visible/enabled/box/style/ancestor/hit-test)を正しく維持しているか。Stage 2a helpers が一切変更されていないか
5. **§2 typo 修正の正当性**: `classSelectedFromPast('A')` 採用が `data-cls="A"` ボタンと整合しているか

**特に注視してほしい点**:
- 新 helper が「クリック前到達性検証の構造的防止」を緩めていないか(段階 3 以外は厳格維持しているか)
- 22 it の置換で primary semantic assertion(state.players の増減 / 不変)が原テストの意図(behavioral/structural)を保持しているか
- Stage 2c 申し送り(L138-L143 以外の Stage 4/5、§10.5 関連)が漏れなく明示されているか

判定 A 以上であれば squash merge、B 以下であれば指摘事項を本 PR で対応します。
