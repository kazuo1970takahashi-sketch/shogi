# RESET-UX-FULL-RESET-LABEL-DESIGN — 全リセットボタン文言の明確化方針

**Task ID**: `RESET-UX-FULL-RESET-LABEL-DESIGN`
**作業種別**: docs-only / design / reset UX / full reset label clarification
**HEAD**: `f309516`（PR #116 squash merge 後の main）
**前提 PR 系列**:
- **PR #112** `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT`（[shogi_v4.html:4429](../../shogi_v4.html) `startTournament` 冒頭の `state.started===true` ガード）
- **PR #113** `RESET-UX-PARTIAL-RESET-DESIGN`（[`docs/notes/20260515_shogi_reset_ux_partial_reset_design.md`](20260515_shogi_reset_ux_partial_reset_design.md)）
- **PR #114** `RESET-UX-PARTIAL-RESET-IMPL-LIGHT`（[shogi_v4.html:5924](../../shogi_v4.html) `resetTournamentProgressOnly` + [shogi_v4.html:101](../../shogi_v4.html) `#resetProgressBtn`）
- **PR #115** `REMOVE-PLAYER-GUARD-MESSAGE-DESIGN`（[`docs/notes/20260515_shogi_remove_player_guard_message_design.md`](20260515_shogi_remove_player_guard_message_design.md)）
- **PR #116** `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT`（[shogi_v4.html:3761](../../shogi_v4.html) `removePlayer` の 2 つの削除不可 alert を「大会進行データをリセット」誘導文に置換）

---

## 1. 目的と非目的

### 1.1 目的

- 既存 [`#resetBtn`](../../shogi_v4.html) [L100](../../shogi_v4.html) 「大会データをリセット」が PR #114 で追加された [`#resetProgressBtn`](../../shogi_v4.html) [L101](../../shogi_v4.html) 「大会進行データをリセット」と並んだ結果、文言の類似により **「全リセット」（参加者一覧も消える）であることが直感的に分かりにくくなった** 問題を整理する
- ボタン文言・confirm 文言・周辺説明の改善候補を docs-only で比較し、IMPL-LIGHT としての推奨案を確定する
- 推奨案を IMPL-LIGHT で着地させる際の **スコープ / やらないこと / テスト方針 / VRT・E2E 影響 / リスク** を整理する

### 1.2 非目的

- 今回は **実装しない**（docs-only design check）
- `shogi_v4.html` / `test/` / `test/e2e/` / Visual Regression snapshot / `.github/workflows/` / `package*.json` / `playwright.config.js` / `docs/specs/` / `index.html` / `data/` を変更しない
- [`resetAll()`](../../shogi_v4.html) [L5945](../../shogi_v4.html) の **初期化ロジック自体は変更しない**（`state.players` を初期化する全リセット仕様を維持）
- [`resetTournamentProgressOnly()`](../../shogi_v4.html) [L5924](../../shogi_v4.html) の仕様 / [`#resetProgressBtn`](../../shogi_v4.html) [L101](../../shogi_v4.html) 文言「大会進行データをリセット」は変更しない
- [`removePlayer()`](../../shogi_v4.html) [L3761](../../shogi_v4.html) の削除不可 alert 文言（PR #116 確定文）は変更しない
- [`startTournament()`](../../shogi_v4.html) [L4429](../../shogi_v4.html) の guard alert 文言（PR #112 確定文）は変更しない
- localStorage schema / pairing algorithm / `generatePairing` / `evaluatePairingQuality` / `warning object` は変更しない
- 自動バックアップ / undo / 専用モーダル / confirm 連鎖 / ボタン並び替え / CSS / layout 変更は扱わない
- VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更は扱わない

---

## 2. 背景

### 2.1 直近の合意ライン

- **PR #112** で `startTournament` を「開始操作専用」に絞り、開始後の再クリックは `resetAll` 誘導 alert で弾く設計が確定
- **PR #113 / #114** で「参加者一覧を残して、組み合わせ・勝敗結果だけリセットする部分リセット」が `resetTournamentProgressOnly()` + `#resetProgressBtn` として追加。`resetAll()` 自体は **全リセットとして温存**（PR #113 §10.2）
- **PR #115 / #116** で `removePlayer()` の削除不可 alert を「大会進行データをリセット」へ明示誘導するよう更新。`#resetBtn`（全リセット）への誤押下抑止を狙って、一次・二次禁止 alert からは「大会データをリセット」表記を意図的に外している

### 2.2 現状のリセット導線（2 系統）

| 観点 | `#resetProgressBtn`「大会進行データをリセット」 | `#resetBtn`「大会データをリセット」 |
|---|---|---|
| 追加元 | PR #114 | 既存（リファクタ前から） |
| 関数 | [`resetTournamentProgressOnly`](../../shogi_v4.html) [L5924](../../shogi_v4.html) | [`resetAll`](../../shogi_v4.html) [L5945](../../shogi_v4.html) |
| 役割 | 部分リセット | 全リセット |
| `state.players` | 維持 | 初期化（`{A:[],B:[]}`） |
| `state.started` | `false` | `false` |
| `state.pairings` | `{A:[],B:[]}` | `{A:[],B:[]}` |
| `state.results` | `{A:[],B:[]}` | `{A:[],B:[]}` |
| `state.rounds` | 維持 | `4` に初期化 |
| `state.report` | 維持 | 既定値に初期化 |
| `_pendingNewYomi*` | 維持 | クリア |
| `shogi_branch_master` | 維持 | 維持（**絶対に消さない**、仕様書 §3.4.1） |
| `localStorage.STORAGE_KEY` | save() で上書き | `removeItem` + レガシキー `LEGACY_STORAGE_KEYS` も `removeItem` |
| 大会タブ DOM | `pane-A`/`pane-B`/`result-A`/`result-B` をクリア | 同左 + 大会報告書欄もクリア |
| 表示後タブ | `reg` | `reg` |
| confirm 文言 | 「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？」 | 「現在の大会データをリセットします（支部マスタは保持されます）」 |
| 完了 toast | 「大会進行データをリセットしました」 | 「リセットしました」 |
| 主な用途 | 受付後の参加者修正 / 組み合わせ・勝敗結果のやり直し / 削除不可参加者の削除可能化 | 大会を最初から作り直す / 練習データの全消去 / 参加者登録からやり直す |

### 2.3 確認した現状文言（コード直視）

- `#resetBtn` ボタン文言（[shogi_v4.html:100](../../shogi_v4.html)）:
  ```html
  <button type="button" class="btn-danger btn-sm no-print" id="resetBtn">大会データをリセット</button>
  ```
- `#resetProgressBtn` ボタン文言（[shogi_v4.html:101](../../shogi_v4.html)）:
  ```html
  <button type="button" class="btn-danger btn-sm no-print" id="resetProgressBtn">大会進行データをリセット</button>
  ```
- `resetAll()` confirm（[shogi_v4.html:5946](../../shogi_v4.html)）:
  ```js
  if(!confirm('現在の大会データをリセットします（支部マスタは保持されます）'))return;
  ```
- `resetTournamentProgressOnly()` confirm（[shogi_v4.html:5925](../../shogi_v4.html)）:
  ```js
  if(!confirm('参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？'))return;
  ```
- PR #112 `startTournament` guard alert（[shogi_v4.html:4454](../../shogi_v4.html)）: 「大会進行データをリセット」へ誘導
- PR #116 `removePlayer` 一次禁止 alert（[shogi_v4.html:3775](../../shogi_v4.html)）/ 二次禁止 alert（[shogi_v4.html:3792](../../shogi_v4.html)）: 「大会進行データをリセット」へ誘導 / 「大会データをリセット」表記は意図的に含めない

### 2.4 既存テストでの参照箇所

- `test/test_reset_ux_partial_reset.js`
  - L209-210: `resetAll()` confirm 文言「現在の大会データをリセットします（支部マスタは保持されます）」が維持されていることを assert
  - L217-218: `#resetBtn` 文言が `大会データをリセット` のままであることを assert（IMPL-LIGHT で既存に触れない方針の追従検査）
  - L89: `#resetProgressBtn` 文言が `大会進行データをリセット` であることを assert
- `test/test_remove_player_guard_message.js`
  - L256: `resetAll()` confirm 文言「現在の大会データをリセットします（支部マスタは保持されます）」維持を assert
  - L266-267: `startTournament` guard alert に「大会進行データをリセット」を含むことを assert
  - L271-275: `#resetProgressBtn`「大会進行データをリセット」/ `#resetBtn`「大会データをリセット」両ボタン文言維持を assert
  - L134-141 / L169-173: `removePlayer` alert 内に「大会データをリセット」（`#resetBtn` 文言）が含まれないことを assert（誤誘導抑止）
- `test/e2e/shogi_phase2_import.spec.js`
  - L510-515: 「ヘッダーボタン textContent が `大会データをリセット`」を expect
  - L517-534: ヘッダー `#resetBtn` 押下で state.players が空 / マスタ不変を確認
- `test/run_tests.sh`
  - L62: テスト用 sentinel として `resetBtn` を含む DOM id 列を grep（id 自体は不変なので影響なし）

### 2.5 既存 VRT スナップショットの対象

`test/e2e/visual_regression_mobile.spec.js-snapshots/` 配下に存在するのは以下のみ:

- `mobile-pp-panel-3sections-375-mobile-375-{darwin,linux}.png` — 過去参加者パネル（3 セクション、長氏名）
- `mobile-master-edit-modal-375-mobile-375-{darwin,linux}.png` — F7 編集モーダル
- `mobile-master-list-5cols-375-mobile-375-{darwin,linux}.png` — マスタ一覧 5 列構成

**ヘッダー本体の VRT snapshot は現状取られていない**。ただし PR #114 で `#resetProgressBtn` を追加した際に mobile 375px ヘッダー周辺の VRT 差分が発生した実績がある（HANDOFF.md 既存記載）。今回も **ヘッダーボタン文言を変更する場合**、`#tab-master` を開いた際の master 系 snapshot にヘッダーが映り込んでいるか / mobile 縦並び時のヘッダー高さに影響しないかを実機確認時に評価する必要がある。

---

## 3. 問題意識

### 3.1 文言の類似による混同リスク

- 「**大会進行データ**をリセット」と「**大会データ**をリセット」は **修飾語「進行」の有無だけ** で区別される
- 視覚的にもボタン幅・色（`btn-danger`）・位置（ヘッダー右側に並列）が同じため、運営者が **一瞬で違いを判別できない** 可能性が高い
- 「大会データをリセット」だけでは「参加者も消える」とは読み取れない（むしろ「大会進行データ」より広い概念に見えるため、想像が「進行データ + 何か」程度で止まり、参加者まで消える破壊度に気づきにくい）

### 3.2 destructive 操作としての告知不足

- `#resetBtn` は本質的に **元に戻せない destructive 操作**（`localStorage.removeItem` + `state` 全初期化）
- 現状の confirm「現在の大会データをリセットします（支部マスタは保持されます）」は **支部マスタは保持** に焦点があり、**参加者一覧が消える** ことが暗黙化されている
- PR #114 で `#resetProgressBtn` の confirm が「参加者一覧は残したまま、…」と参加者の扱いを明示する形になったため、**`#resetBtn` 側が参加者の扱いを明示しない非対称** が際立つようになった

### 3.3 PR #116 の誘導フローとの整合性

- PR #116 で `removePlayer()` の削除不可 alert は意図的に「大会進行データをリセット」へ誘導し、「大会データをリセット」表記を排除している（[shogi_v4.html:3775,3792](../../shogi_v4.html)）
- これにより `#resetProgressBtn` を「正しい第一選択」と位置づけているが、ヘッダーには依然「大会データをリセット」が **同じデザインで隣に並んでいる**
- 運営者が誤って `#resetBtn` を押すと「参加者一覧 + 組み合わせ + 勝敗結果」を **同時に失う事故** につながる
- `#resetBtn` 側の名称も「進行データだけではなく **全部** 消える」という対称性を持たせた方が、**部分 / 全体の二択** が明確になる

### 3.4 ボタン幅・VRT への副作用懸念

- スマホ幅（375px）ではヘッダーが折り返しやすく、ボタン文言を長くすると **折り返しや 2 行化** が発生する可能性がある
- 既存 VRT snapshot 自体はヘッダー本体を撮っていないが、ヘッダーが映り込む可能性のある画面（特にマスタタブ系）への副作用は実機で確認すべき

---

## 4. 文言案 A〜E の比較

### 4.1 案 A: 現状維持

| 項目 | 内容 |
|---|---|
| ボタン | `大会データをリセット` |
| confirm | `現在の大会データをリセットします（支部マスタは保持されます）` |
| メリット | 変更が最小 / 既存テスト・VRT 影響なし / E2E `shogi_phase2_import.spec.js` の expect も維持 |
| デメリット | 参加者も消えることがボタン名・confirm の **どちらからも読めない** / `#resetProgressBtn` との混同が解消されない / PR #116 の「全リセット側を意図的に隠す」誘導と整合しても、ヘッダーに残った同名ボタンの誤押下を構造的に防げない |

### 4.2 案 B: ボタンだけ変更

| 項目 | 内容 |
|---|---|
| ボタン | `大会データを全リセット` |
| confirm | 現状維持（`現在の大会データをリセットします（支部マスタは保持されます）`） |
| メリット | ボタン名だけで「全リセット」と分かる / 実装が軽い / `#resetProgressBtn`（部分）との対称性が出る |
| デメリット | confirm 側がボタン名と語彙非対称（confirm に「全リセット」「参加者」「組み合わせ」「勝敗結果」が出てこない）/ 既存テスト 4 件・E2E 1 件の文言追従が必要 |

### 4.3 案 C: confirm だけ変更

| 項目 | 内容 |
|---|---|
| ボタン | `大会データをリセット`（現状維持） |
| confirm | `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。` |
| メリット | 誤操作直前で強く警告できる / ボタン幅・VRT・E2E ボタン文字列影響なし |
| デメリット | ボタンを押す前段では破壊度が伝わらない（押下 → confirm までの「指の動き」を止められない）/ confirm 参照テスト 2 件の追従が必要 |

### 4.4 案 D: ボタン + confirm 両方変更（推奨）

| 項目 | 内容 |
|---|---|
| ボタン | `大会データを全リセット` |
| confirm | `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。` |
| メリット | ボタン名と confirm の両段で破壊度が伝わる / `#resetProgressBtn`「大会進行データをリセット」との **「進行 vs 全」の対称性** が明確 / 押下前の判断材料・押下後の最終確認の両方で誤操作を弾ける / PR #116 の誘導フローと整合 |
| デメリット | テスト 4 件・E2E 1 件の文言追従 / ヘッダーボタン幅が「大会データをリセット」（10 文字）→「大会データを全リセット」（11 文字）と 1 文字増 → mobile 375px で折り返し可能性 / VRT で間接的な差分が出る可能性（要実機確認） |

### 4.5 案 E: 危険操作として強めにする

| 項目 | 内容 |
|---|---|
| ボタン | `参加者も含めて全リセット` |
| confirm | `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\nこの操作は元に戻せません。\n支部マスタは保持されます。` |
| メリット | 「参加者も消える」ことが極めて明確 / 「元に戻せません」で destructive を強調 |
| デメリット | ボタン文言が 12 文字と長く mobile 折り返し確率が上がる / UI 上 `btn-danger` だけでも十分強いところに二重の危険表現が乗り重い印象 / 「参加者も含めて」は他リセットを暗に前提にする言い回しで、単体ボタンとしては UX の文脈依存が強い / IMPL-LIGHT としては表現リスクが高すぎる |

---

## 5. 推奨案

### 5.1 第一推奨: 案 D（ボタン + confirm 両方変更）

**結論**: IMPL-LIGHT の第一推奨は **案 D**。

- ボタン: `大会データを全リセット`
- confirm: `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。`

### 5.2 採用理由

1. **押下前・押下後の二段で破壊度を伝えられる**: ボタン名で「全」を視認 → confirm で「参加者一覧・組み合わせ・勝敗結果」と具体名を確認、の二段防御
2. **`#resetProgressBtn`「大会進行データをリセット」との対称性**: 「進行データ」 vs 「全（=進行データ + 参加者一覧）」の対比が一目で読める
3. **PR #116 の誘導フローと整合**: 削除不可 alert が「大会進行データをリセット」を第一選択として誘導する設計と、ヘッダーの 2 つのリセットボタンが視覚的に区別される設計が整合する
4. **destructive 操作なので二重明示が妥当**: `localStorage.removeItem` + 全 state 初期化 + 大会報告書欄初期化を伴う本質的に取り返しの効かない操作で、文言コストよりも誤操作防止の便益が上回る
5. **実装スコープが「文言変更 + テスト追従」に閉じる**: ロジック変更ゼロ、ボタン id 不変、DOM 構造不変、CSS 不変

### 5.3 代替候補の位置づけ

- **案 B**（ボタンのみ）: confirm との非対称が残るため次善。VRT・mobile 折り返しが致命的問題と判明した場合のみフォールバック
- **案 C**（confirm のみ）: ボタン段階の判別容易化を放棄するため次々善。ヘッダーレイアウト変更を絶対に避けたい場合の最小選択肢
- **案 E**（強表現）: 表現リスクが高く IMPL-LIGHT としては過剰。運用観察で「案 D でも誤操作が残る」と判明した場合の IMPL-MEDIUM 候補
- **案 A**（現状維持）: PR #114 / #116 まで進めた誘導フロー整理の最終ピースを残すことになり、選びにくい

---

## 6. IMPL-LIGHT スコープ

### 6.1 やる候補

- [`#resetBtn`](../../shogi_v4.html) [L100](../../shogi_v4.html) の表示文言を `大会データをリセット` → `大会データを全リセット` に更新
- [`resetAll()`](../../shogi_v4.html) [L5946](../../shogi_v4.html) の confirm 文言を `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。` に更新
- 関連テストの期待文言を追従更新
  - `test/test_reset_ux_partial_reset.js` L209-218（confirm + ボタン文言）
  - `test/test_remove_player_guard_message.js` L256 / L274-275（confirm + ボタン文言）
  - `test/test_remove_player_guard_message.js` L134-141 / L169-173（**「大会データをリセット」非含有検査の対象文字列を「大会データを全リセット」に更新**、または「大会データをリセット」を `removePlayer` alert が誘導しないことの主旨を維持するため文字列の検査軸を再設計）
  - `test/e2e/shogi_phase2_import.spec.js` L510-515 の `expect(text.trim()).toBe('大会データをリセット')` を `'大会データを全リセット'` に更新
- 新規 reset UX 関連テスト追加（任意、`test/test_reset_ux_full_reset_label.js` 候補）:
  - `#resetBtn` 文言が `大会データを全リセット`
  - `#resetProgressBtn` 文言が `大会進行データをリセット`（不変）
  - `resetAll()` confirm に主要語句 `参加者一覧` / `組み合わせ` / `勝敗結果` / `すべてリセット` / `支部マスタは保持` が含まれる
  - `resetAll()` の `state.players` 初期化仕様は変わっていない（コード構造検査）
  - `resetTournamentProgressOnly()` の `state.players` 維持仕様は変わっていない（コード構造検査）
- HANDOFF.md に 1 行 entry 追加 / 本 design doc 末尾に IMPL-LIGHT 実装着地メモ section を後追いで追記
- VRT 影響を実機で確認し、ヘッダー周辺の差分有無を judging のうえ判断（差分が出た場合は自律更新せず判断を仰ぐ）

### 6.2 やらない候補

- [`resetAll()`](../../shogi_v4.html) [L5945](../../shogi_v4.html) の **初期化ロジック自体** の変更（`state.players` を初期化する仕様は維持）
- [`resetTournamentProgressOnly()`](../../shogi_v4.html) [L5924](../../shogi_v4.html) の仕様変更
- [`#resetProgressBtn`](../../shogi_v4.html) [L101](../../shogi_v4.html) 文言の変更
- [`removePlayer()`](../../shogi_v4.html) [L3761](../../shogi_v4.html) alert 文言（PR #116 確定文）の変更
- [`startTournament()`](../../shogi_v4.html) [L4429](../../shogi_v4.html) guard alert 文言（PR #112 確定文）の変更
- localStorage schema / `STORAGE_KEY` / `LEGACY_STORAGE_KEYS` / `BRANCH_MASTER_KEY` 変更
- pairing algorithm / Fisher-Yates / `generatePairing` / `evaluatePairingQuality` / `warning object` の変更
- `normalizeState` / `save()` / `load()` の挙動変更
- 自動バックアップ機能 / undo 機能 / 専用モーダル化 / confirm 連鎖（2 段階確認）
- ボタン並び替え / ボタン色変更 / CSS / layout 変更
- VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更
- `package.json` / `package-lock.json` / `playwright.config.js` / `docs/specs/` / `.github/workflows/` の変更
- `index.html` / `data/` の変更
- 完了 toast「リセットしました」の文言変更（IMPL-LIGHT スコープ外、必要なら別 PR）

---

## 7. テスト方針

### 7.1 静的検査（既存テストの追従）

| 観点 | 確認内容 | 対象テスト |
|---|---|---|
| `#resetBtn` 文言 | `id="resetBtn"` 直後の textContent が `大会データを全リセット` | `test/test_reset_ux_partial_reset.js` L214-218 を `大会データを全リセット` に更新 |
| `#resetProgressBtn` 文言 | `id="resetProgressBtn"` 直後の textContent が `大会進行データをリセット`（不変） | `test/test_reset_ux_partial_reset.js` L86-90 維持 / `test/test_remove_player_guard_message.js` L272-273 維持 |
| `resetAll()` confirm | 主要語句 `参加者一覧` / `組み合わせ` / `勝敗結果` / `すべてリセット` / `支部マスタは保持` を含む | `test/test_reset_ux_partial_reset.js` L209-210 / `test/test_remove_player_guard_message.js` L256 を新文言に追従更新 |
| `removePlayer` alert の「大会データをリセット」非含有 | `removePlayer` alert に `#resetBtn` 文言が含まれない（誤誘導抑止）。**文言変更後の新ボタン名「大会データを全リセット」を非含有検査の対象に切り替える** | `test/test_remove_player_guard_message.js` L130-141 / L169-173 |
| `resetTournamentProgressOnly()` confirm | 「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します」が維持 | `test/test_reset_ux_partial_reset.js` 既存 assertion 維持 |
| `startTournament` guard alert | 「大会進行データをリセット」誘導が維持 | `test/test_remove_player_guard_message.js` L266-267 維持 |
| `resetAll()` ロジック不変 | `state.players={A:[],B:[]}` 初期化 / `localStorage.removeItem(STORAGE_KEY)` が残る | コード構造 grep（必要なら新規 test に組込） |
| `resetTournamentProgressOnly()` ロジック不変 | `state.players` に代入しない / `state.started=false` / `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` のみ | コード構造 grep（必要なら新規 test に組込） |

### 7.2 振る舞いテスト（E2E）

- `test/e2e/shogi_phase2_import.spec.js` L510-534 「Phase 2 fix: ヘッダー「大会データをリセット」リネーム」 describe ブロックを、IMPL-LIGHT 着地時に **新文言「大会データを全リセット」に追従更新**:
  - L514: `expect(text.trim()).toBe('大会データを全リセット')`
  - L510-511 / L524 のコメント文言も追従更新（テスト命名は describe `'ヘッダー「大会データを全リセット」リネーム'`、test `'ヘッダーボタン textContent が「大会データを全リセット」'` 等）
- 押下後の挙動テスト（L517-534）は **state.players 初期化 + マスタ不変** という IMPL-LIGHT スコープ外の保証なので変更不要（ロジック不変）

### 7.3 新規テスト候補（任意）

新規 stanza `test/test_reset_ux_full_reset_label.js` を追加する場合の確認候補:

- `#resetBtn` 文言が `大会データを全リセット`（regex `/id="resetBtn"[\s\S]{0,80}>大会データを全リセット<\/button>/`）
- `#resetProgressBtn` 文言が `大会進行データをリセット`（不変、対称検査）
- `resetAll()` confirm に `参加者一覧` / `組み合わせ` / `勝敗結果` / `すべてリセット` / `支部マスタは保持` が含まれる（個別 indexOf）
- `resetAll()` confirm に「現状維持の旧文言フラグメント」（`現在の大会データをリセットします`）が **含まれない**（差し替え完了の確認）
- `resetAll()` 関数本体に `state.players={A:[],B:[]}` 相当の初期化（または `state={players:{A:[],B:[]},...}` の一括代入）が残る
- `resetTournamentProgressOnly()` 関数本体に `state.players` 代入が **存在しない**（参加者維持仕様の不変保証）
- `removePlayer()` alert に新ボタン名「大会データを全リセット」が **含まれない**（誤誘導抑止が新文言にも継続）

### 7.4 VRT 方針

- IMPL-LIGHT 着手時は **まず実機で `npm run test:e2e:visual` を走らせ**、red になった snapshot を識別
- red になった場合は **即更新せず、差分を目視で確認**:
  - ヘッダー全体が映り込んでいる snapshot か
  - 折り返し・高さ変化が生じているか
  - 想定範囲（ヘッダー文言変更のみ）の差分か、それ以外の意図せぬ変化か
- 「ヘッダー文言変更による意図差分のみ」と判断できた場合のみ、運営者（user）に明示許可を得てから snapshot 更新
- **threshold 緩和 / VRT skip / CI 設定変更は禁止**（PR #114 と同じガードライン）

---

## 8. VRT / E2E 影響

### 8.1 VRT への影響可能性

- 既存 VRT snapshot 3 種（過去参加者パネル / F7 編集モーダル / マスタ一覧 5 列）の **直接対象はヘッダー外**
- ただし以下の経路で間接差分が出る可能性がある:
  - マスタタブを開いた状態でヘッダーが映り込み、ボタン幅・行数差分が描画される
  - mobile 375px で `#resetBtn` の文言が 1 文字伸びた結果、ヘッダーが 2 行になり、その下のコンテンツ（タブ、参加者パネル等）の Y 座標がシフトする
- PR #114 で `#resetProgressBtn` を追加した際にも mobile 375px ヘッダー周辺で VRT 差分が発生した実績がある（HANDOFF.md 既存 entry 参照）
- 今回の文言変更は **1 文字増（11 → 12 byte は同じ全角換算）** に留まるため、PR #114 ほど大きな影響は出にくい見込み

### 8.2 E2E への影響

- `test/e2e/shogi_phase2_import.spec.js` L510-534 の **2 箇所（describe 名 / test 名 / expect 文字列）** が直接影響
- 他の E2E spec で `#resetBtn` の textContent を assert している箇所は **現状確認で見つからず**（`grep -rn "resetBtn\|大会データをリセット" test/e2e/` で 1 spec のみ hit）
- L517-534 の「ヘッダーボタン押下で state.players が空 / マスタ不変」テストは **ロジック不変なので追従不要**

### 8.3 mobile 幅での折り返しリスク

- 現状ヘッダー（[shogi_v4.html:94-103](../../shogi_v4.html)）は `display:flex;gap:8px;align-items:center` で 4 ボタンを横並び。375px 幅では既に折り返しが発生しうる構成
- 「大会データをリセット」（11 文字）→「大会データを全リセット」（11 文字、`を` の後に `全` を挿入で実質 +1 文字）の変化幅
  - ただし「**を全**」の 2 文字塊が折り返し位置をずらす可能性がある
- IMPL-LIGHT 実機確認時に Mobile Safari 375px / Pixel 5 360px で目視確認推奨

---

## 9. リスク

### 9.1 文言面のリスク

| リスク | 内容 | 緩和策 |
|---|---|---|
| 「全リセット」が強すぎる | 「全」が威圧的に映り、運営者が普段使いの部分リセットすら避ける可能性 | `btn-danger` のスタイルは現状維持、「全」は事実説明として最小限。「危険」「破壊」等の煽り語は使わない |
| confirm が長い | 「参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。」は約 50 文字、改行 1 個 | `resetTournamentProgressOnly()` confirm（約 35 文字 + 改行）と同等のレンジに収める。「この操作は元に戻せません」等の追加文言は避ける（案 E への滑り防止） |
| 「支部マスタは保持」と「参加者は消える」の関係が伝わりにくい | 「支部マスタ」と「参加者一覧」が同じものと混同される可能性 | confirm を **「参加者一覧・組み合わせ・勝敗結果を含む … すべてリセット」「支部マスタは保持」** の順で書き、消える側 → 残る側の順序で並べる |
| 「大会進行データ」と「大会データを全」の語感差 | 「進行」と「全」のレベル感が直接対比されにくい | 部分（大会進行データ）/ 全（大会データを全）の **構造的対比** をボタン並びで読ませる前提。文言だけで完全一致させようとすると別案（例: 「大会進行データをリセット」/「大会データ全体をリセット」）になるが、IMPL-LIGHT としては「全リセット」の方が破壊度を直感させる |

### 9.2 実装面のリスク

| リスク | 内容 | 緩和策 |
|---|---|---|
| 既存テスト追従漏れ | 4 件のテスト + 1 件の E2E で文言を参照しているため、漏れると CI が落ちる | 本 design doc §2.4 のチェックリストを IMPL-LIGHT PR の作業項目に転記、grep `大会データをリセット` 全 hit 確認後 commit |
| VRT 影響 | mobile 375px ヘッダー周辺で間接差分が出る可能性 | §7.4 の手順（実機 → 目視 → 明示許可後更新）を厳守。**自律更新禁止** |
| confirm 文字数による表示崩れ | OS native confirm dialog は折り返しが入るため通常問題なし、ただし長すぎると視覚的負担 | 「すべてリセット」「支部マスタは保持」の 2 句構造で 50 文字以下に収める（案 E より短い） |
| 「全リセット」を使う場面が少ない場合 | 月例大会終了後の全クリア程度しか実用機会がない場合、destructive ボタンをヘッダーに残す配置自体を見直す必要が将来出る可能性 | IMPL-LIGHT スコープ外、§10 後続候補に「`#resetBtn` 配置・危険度表現の見直し」を残す |
| PR #116 の誘導文との二重メンテ | `removePlayer` alert と `startTournament` guard alert は今回変更しないが、将来「大会データを全リセット」誘導も加える時が来れば修正対象 | 本 design doc §6.2 で明示的に「今回は変更しない」とし、後続候補に残す |
| Codex / cowork レビュー指摘 | 「『大会データを全リセット』は依然 destructive がやや弱い」「『すべて』の重複が冗長」などのスタイル指摘が入る可能性 | 設計時点で表記候補（「大会データを全リセット」/「全部リセット」/「大会データ全リセット」）を比較済としておき、レビュー指摘時に判断ログを残せるようにする |

### 9.3 運用面のリスク

| リスク | 内容 | 緩和策 |
|---|---|---|
| 運営者の慣れ問題 | 既存「大会データをリセット」に慣れた運営者が、新文言で一瞬戸惑う | リリース後の運用観察項目に「文言変更後の誤押下率・問い合わせ件数」を含める |
| 「全リセット」を頻繁に押す習慣がついてしまう | ボタン名がはっきりするほど押しやすくなる逆効果 | confirm 側で「参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセット」を明示し、押下後の最終ゲートを強化 |

---

## 10. 後続タスク候補

### 10.1 即起票可能（IMPL-LIGHT）

- **`RESET-UX-FULL-RESET-LABEL-IMPL-LIGHT`** — 本 design doc §5.1 第一推奨を着地させる実装 PR。スコープは §6、テスト方針は §7、VRT 方針は §7.4。**main 起点ではなく必ず本 design doc PR squash merge 後の main から派生**

### 10.2 観察フェーズ（IMPL-LIGHT 着地後）

- **運用観察**: 新文言で誤押下が減るか / 「全」の語感が運用上重すぎないか / mobile 折り返しの実害がないか
- 観察結果次第で:
  - **`RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`**（仮）= 案 E 相当の強表現への移行（「参加者も含めて全リセット」/「この操作は元に戻せません」追加）
  - **`RESET-UX-FULL-RESET-PLACEMENT-DESIGN`**（仮）= `#resetBtn` のヘッダーからの撤去 or 設定タブへの隔離など、配置レベルの見直し
  - **`RESET-UX-FULL-RESET-CONFIRM-CASCADE-DESIGN`**（仮）= 2 段階 confirm / モーダル化など

### 10.3 関連タスク候補（並走可能）

- **`RESET-UX-TOAST-LABEL-DESIGN`**（仮）= `resetAll()` 完了 toast 「リセットしました」を「大会データを全リセットしました」等に統一する小規模 design / IMPL
- **`RESET-UX-REMOVE-PLAYER-FULL-RESET-INTEGRATION-DESIGN`**（仮）= `removePlayer` alert の誘導先に「最終手段として `大会データを全リセット` もあります」のフォールバックを追記するか否かを決める design

### 10.4 やらない / 観察待ち

- pairing algorithm 変更 / `evaluatePairingQuality` 変更
- localStorage schema 変更 / 大会履歴保存
- undo / 自動バックアップ / 専用モーダル化
- ボタン色変更 / CSS / layout 変更
- VRT snapshot 自律更新 / threshold 緩和

---

## 11. 結論

- 既存 `#resetBtn`「大会データをリセット」は、PR #114 で追加された `#resetProgressBtn`「大会進行データをリセット」との文言類似により **「全リセット（参加者一覧も消える）」であることが直感的に伝わりにくい** 状態にある
- PR #116 で `removePlayer` 削除不可 alert が「大会進行データをリセット」へ明示誘導されるようになった一方、ヘッダー側の `#resetBtn` 文言は据え置きで **構造的な対称性が欠けたまま** となっている
- 5 案の比較の結果、IMPL-LIGHT として第一推奨は **案 D（ボタン: `大会データを全リセット` / confirm: `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。`）**
- 実装スコープは「文言変更 + 既存テスト 4 件 + E2E 1 件の追従 + （任意）新規テスト 1 stanza」に閉じ、ロジック変更ゼロ
- VRT は実機で red を確認した上で **自律更新せず判断を仰ぐ** ガードラインを厳守
- 後続は `RESET-UX-FULL-RESET-LABEL-IMPL-LIGHT` を即起票可能、その後は運用観察を経て IMPL-MEDIUM / 配置見直し / toast 統一などへ進む

---

## 12. 着地後追記用 placeholder

IMPL-LIGHT 着地時に以下を埋める想定:

- IMPL-LIGHT PR 番号 / squash SHA
- 採用された最終文言（design doc §5.1 と差異あれば差分を明記）
- VRT snapshot 差分有無と更新可否判断
- 実機確認結果（mobile 375px / 360px の折り返し有無）
- 運用観察フェーズの開始日と観察項目
