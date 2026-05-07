# shogi A-T Stage 2c Mini 仕様書: 残 4 spec factory 置換 + 完全書き直し 2 件

**作成日時**: 2026-05-07 12:44 JST
**文書種別**: Mini 仕様書(目標 200〜250 行)
**親仕様**: A-T spec v1.3 §5 Stage 2c
**前提仕様**: Stage 2a 仕様書 v1.5(`docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`) + Stage 2b 仕様書(`docs/specs/20260506_2236_shogi_at_stage_2b_a42_replacement_mini_spec_v1.md`)
**実装担当**: Claude Code
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、各 PR で 1 回ずつ
**main HEAD 前提**: d57f80c

---

## 0. 背景と目的

A-T spec v1.3 §5 Stage 2c の達成。Stage 2a で完成した helpers + 22 factory + Stage 2b で追加した `clickAndExpectChangeUnchecked` を用いて、A-4.2 spec 以外の 4 spec(計 99 click / 85 it)を全置換し、リポジトリ全体で「観点 2(クリック前検証不在)」を構造的に解消する。

Stage 2c 完了で `clickAndExpectChange` 経由率 100%(272/272 click)が達成され、A-T spec §5 Stage 4(Mutation Testing 含む)着手の前提が完全に整う。

---

## 1. スコープ

### IN(対象 4 spec、85 it / 99 raw click)

| spec | 行数 | it 数 | raw click(it body / 外側) |
|---|---|---|---|
| `test/e2e/index_layout.spec.js` | 約 60 | 5 | 0 / 0(no-op、検証のみ) |
| `test/e2e/shogi_app.spec.js` | 約 100 | 10 | 8 / 0 |
| `test/e2e/shogi_app_a3.spec.js` | 約 420 | 25 | 26 / 11(beforeEach 3 含む) |
| `test/e2e/shogi_app_a4.spec.js` | 約 595 | 45 | 31 / 23 |

### OUT(A-T spec の他 Stage)

Stage 3(テストデータ生成器) / Stage 4(A-4.2 回帰テスト + Mutation Testing) / Stage 5(モンキーテスト) / Stage 6(Visual regression) / Stage 7(CI 統合) / Stage 8(全体テスト + PR)は Stage 2c 完了後に独立判断。

---

## 2. PR 分割と各 PR スコープ

3 PR に分割。各 PR は本仕様書の同一節を参照、PR description でスコープ節番号を引用する。Codex Gate Review は各 PR で 1 回ずつ計 3 回。

### 2.1 PR-1: shogi_app + index_layout(8 click / 13 it)

- ブランチ: `feat/at-stage-2c-shogi-app-and-index-layout`
- ベース: main d57f80c
- 対象: `shogi_app.spec.js`(10 it)+ `index_layout.spec.js`(5 it = 検証のみ)
- 主要操作: タブ切替・参加者追加・大会開始・load モーダル開閉
- 新規 factory 追加: **`tabSwitched(targetTab)`**(§3.1 参照、本 PR で導入し全 PR で利用)
- index_layout は raw click 0 のため、grep 検証コミットで「変更不要」であることを構造的に確認

### 2.2 PR-2: shogi_app_a3(37 click / 25 it)

- ブランチ: `feat/at-stage-2c-shogi-app-a3`
- ベース: PR-1 マージ後の main(`tabSwitched` factory 利用可能)
- 対象: `shogi_app_a3.spec.js`(25 it)
- 主要操作: サジェスト操作 / マスタ編集削除 / マスタインポート / クイックフィルタ
- 新規 factory 追加: **なし**(既存 22 factory + tabSwitched で足りる)
- Unchecked 適用: 6 件(`.suggest-item` 直接 click、§3.3 参照)
- raw callback パターン: クイックフィルタ / モーダル開閉 / マスタエクスポート(§4 参照)

### 2.3 PR-3: shogi_app_a4(54 click / 45 it、syncBranchMasterOnSave 完全書き直し 2 件含む)

- ブランチ: `feat/at-stage-2c-shogi-app-a4`
- ベース: PR-2 マージ後の main
- 対象: `shogi_app_a4.spec.js`(45 it)
- 主要操作: ふりがな入力 / マスタ復元 / 削除済表示トグル / 横スクロール検証
- 新規 factory 追加: **`masterMemberRestored(targetId)`**(§3.2 参照、5 件出現で必要度高)
- Unchecked 適用: 4 件(`.suggest-item`)
- 完全書き直し: 2 件(L49 / L111 syncBranchMasterOnSave 直接呼出、§5 参照)

---

## 3. 新規 factory 仕様

### 3.1 `tabSwitched(targetTab)`

**用途**: タブ切替操作(`#tab-reg` / `#tab-tournament` / `#tab-result` / `#tab-master`)。`tournamentStarted` factory から大会開始固有の検証(`state.started === true` 等)を除いた汎用版。

**signature**: `(targetTab: string) => ExpectedChangeFactory`(他 factory と同一形式、`shogi_assertions.js` の typedef 準拠)

**primary assertion**: 以下のいずれか実装可能性に応じて選択
- 第一優先: `state.activeTab === targetTab`(production が state を持つ場合)
- 第二優先: ターゲットタブの DOM が `active` クラスまたは `aria-selected="true"` を持つ
- いずれも検証可能でない場合: ターゲットタブパネルが visible、他 panel が hidden

**実装場所**: `test/helpers/shogi_assertions.js`(既存 factory 22 個と同形式で追加、23 個目)

### 3.2 `masterMemberRestored(targetId)`

**用途**: 論理削除済 master member の復元(`.master-restore-btn` クリック)。`masterMemberDeleted` factory の逆操作。

**signature**: `(targetId: string) => ExpectedChangeFactory`

**primary assertion**:
- master member の `deleted_at` または `is_deleted` フラグが解除される(production スキーマに合わせて Claude Code が実装時に確認)
- master 一覧で当該 member が表示される(削除済表示トグルが OFF の状態で)

**実装場所**: `test/helpers/shogi_assertions.js`(24 個目)

---

## 4. raw callback で対応するパターン(factory 化しない)

以下は Stage 2c 内で raw callback による `ctx.primary('...')` + assertion で対応。factory 化は L0 業務モデル §1.5 の見直しタイミングで別途判断する。

| パターン | 出現箇所 | primary 例 |
|---|---|---|
| モーダル開閉(`#loadBtn` / `#load-cancel` / `#masterImportBtn` 等) | 全 spec 多数 | `ctx.primary('modal opened/closed')` + `expect(modal).toBeVisible()/toBeHidden()` |
| クイックフィルタ(`.pp-quick-filter-btn`) | a3 / a4 | `ctx.primary('filter applied')` + フィルタ後 `.pp-row` 件数変化 |
| 削除済み表示トグル(`#masterShowDeletedBtn`) | a4 | `ctx.primary('show-deleted toggled')` + 表示行数変化 |
| マスタエクスポート(`#masterExportBtn`) | a3 | `ctx.primary('download triggered, master unchanged')` + `page.waitForEvent('download')` の suggestedFilename 検証 + master 不変確認 (production は Blob + anchor download + alert、clipboard ではない) |
| ふりがなタブ(`.pp-yomi-tab`) | a4 | `ctx.primary('yomi tab switched')` + フィルタ結果変化 |
| **playerRemoved**(`.player-row` 内削除ボタン、shogi_app_a4 L106 のみ) | a4(1 件) | `ctx.primary('player removed from class')` + `state.players[cls].length` -1。**コメント `// TODO: L0 §1.5 見直し時に factory 化検討` を併記** |

---

## 5. syncBranchMasterOnSave 完全書き直し標準手順(PR-3 内)

**対象**: `shogi_app_a4.spec.js` L49 / L111(Stage 1 §4.2 完全書き直し対象、Stage 2a 仕様書 v1.5 §10.5「非同期 + DOM mutation」同型)

**問題**: production 関数を `await page.evaluate(() => window.syncBranchMasterOnSave())` で直接呼出しており、UI 経由のフローで再現していない。`clickAndExpectChange` の primary assertion 必須化に整合しない。

**標準対応手順**:

1. **clipboard mock 準備**: テスト先頭で `await context.grantPermissions(['clipboard-read', 'clipboard-write'])` を beforeEach に追加(対象 it だけに必要なら describe 単位)
2. **UI 経由フロー化**: 直接呼出を「保存ボタン UI クリック」に置換
   - 保存ボタン locator を確認(`#save` 等、production HTML を Claude Code が grep)
   - `clickAndExpectChange(saveBtn, async (before, after, ctx) => { ... })` でラップ
3. **primary assertion**: 「クリップボードに master JSON が書き込まれる」+「state.master が同期更新される」の両方
4. **副次効果検証**(syncBranchMasterOnSave の本来意図): `localStorage.getItem('shogi_branch_master')` が更新される、を after フェーズで確認

**factory 化の検討**: 本パターンが他 spec で再出現する場合は、Stage 2c 完了後に `masterSaved` 等の factory 化を検討(本 Stage 2c では 2 件のみのため raw callback で対応、§4 と同方針)。

---

## 6. 制約(Stage 2a / 2b 継承)

- production code(`shogi_v4.html`)変更禁止
- raw click ゼロ / `force:true` ゼロ(対象 spec の it body 内、grep 検証)
- 変更前後の it 数同一(85 件、describe / it 名は原則変更しない)
- factory / helper の追加は `test/helpers/` 配下のみ(本 Stage 2c では `tabSwitched` + `masterMemberRestored` の 2 つを追加)

---

## 7. 受け入れ条件(各 PR 共通、Codex Gate Review 5 観点)

| 観点 | 検証方法 | 各 PR での適用 |
|---|---|---|
| P0(対象 it 全 pass) | `npx playwright test <対象 spec>` | PR-1 / PR-2 / PR-3 各 100% |
| 既存挙動破壊なし(全 e2e 緑維持) | `npm test` | 各 PR で 438 + Stage 2b 増分 + Stage 2c 増分が緑 |
| 構造的防止達成 | 対象 spec の it body 内 raw click 0、`force:true` 0 | grep 検証(beforeEach は §8 R2 通り温存可) |
| 保存読込影響なし | localStorage 系操作の挙動同等性 | PR-3 で重点確認(syncBranchMasterOnSave 書き直しが該当) |
| データ破壊なし | `loadFromPaste` / `resetAll` / `runMasterImport` 周辺の挙動同等性 | PR-2 / PR-3 で確認(masterImport 関連が該当) |

---

## 8. レビュー手順

各 PR について:
1. **実装** → Claude Code(対象ブランチ)
2. **ChatGPT レビュー: スキップ**(Gate Review 運用、memory #22 改訂2 準拠)
3. **Codex Gate Review**: §7 の 5 観点のみ
4. Codex A 判定 → 髙橋さんが PR レビュー → squash merge → main 同期 → 次 PR ベースに

---

## 9. 申し送り(Stage 2c 完了後)

- A-T spec §5 Stage 4(A-4.2 回帰テスト + Mutation Testing)着手の前提が整う
- L0 業務モデル §1.5 見直しタイミングで以下を再検討: `playerRemoved` の catalog 登録要否、modal 開閉系 / quick-filter 系の重要操作昇格要否
- factory `masterSaved`(syncBranchMasterOnSave 同型の UI 経由保存パターンが他 spec で再出現する場合)

---

## 10. リスクと予防

- **R1**: PR-1 で導入する `tabSwitched` factory の primary 検証ロジックが production の state 構造に合わない可能性
  - 予防: Claude Code が実装時に `shogi_v4.html` 内のタブ切替実装を grep して production に合わせる(§3.1 の primary 候補から最適選択)
- **R2**: PR-3 の syncBranchMasterOnSave 完全書き直しで clipboard mock 設定漏れ
  - 予防: §5 標準手順の Step 1 を beforeEach 単位で確実に適用、対象 it のみに必要なら describe 限定でも可
- **R3**: PR-2 → PR-3 の順序逆転(PR-3 を先に出す等)
  - 予防: PR-1 の `tabSwitched` factory が PR-2 / PR-3 で前提となるため、本 PR 順序を厳守

---

## 11. 想定工数(参考)

- PR-1: 30〜60 分(8 click + tabSwitched factory 新設 + 単体テスト)
- PR-2: 60〜90 分(37 click + Unchecked 6 件 + raw callback パターン適用)
- PR-3: 90〜150 分(54 click + masterMemberRestored factory 新設 + syncBranchMasterOnSave 書き直し 2 件)
- Codex Gate Review: 各 1 ラウンド A 判定の見込み(本仕様書で論点を事前整理済)

---

**END**
