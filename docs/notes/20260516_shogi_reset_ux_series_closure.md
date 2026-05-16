# RESET-UX-SERIES-CLOSURE — 文言整合シリーズ完了整理

**Task ID**: `RESET-UX-SERIES-CLOSURE-DOCS`
**作業種別**: docs-only / closure / status 整理
**HEAD**: `1cc05c3`（PR #120 squash merge 後の main）

---

## 1. 目的とスコープ

### 1.1 目的

- PR #112〜#120 で進めてきた **RESET-UX 文言整合シリーズ** を「一区切り完了」として整理する
- 完成した語彙整合 / 不変項目 / 運用観察項目 / 後続候補を 1 ファイルに集約し、将来の AI / Codex / cowork が参照しやすい closure note とする
- 次フェーズを「**運用観察フェーズ**」として明確化する

### 1.2 非スコープ（今回やらないこと）

- 実装変更（`shogi_v4.html`）
- テスト追加・変更（`test/` / `test/e2e/`）
- VRT snapshot 更新
- CSS / layout / workflow / `package*.json` / `playwright.config.js` 変更
- 既存 design doc 本文の大幅書き換え（古い履歴は消さない）
- 後続実装タスクの着手:
  - `RESET-UX-TOAST-LABEL-IMPL-MEDIUM`
  - `RESET-UX-TOAST-LIFECYCLE-DESIGN`
  - `RESET-UX-FULL-RESET-PLACEMENT-DESIGN`
  - `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM`
  - `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM`
  - `RECEPTION-UX-RESTART-WIZARD-DESIGN`
  - `DISPLAY-LABELS-IMPL-LIGHT`
  - WARNING Phase 2〜4

---

## 2. シリーズの目的

PR #112 着手時点では、`#resetBtn`「大会データをリセット」が **大会開始済 state からの再開始 / 削除不可参加者の救済 / 練習データの全消去 / 大会全部やり直し** を 1 ボタンで担う構造だった。これに対し:

- 開始済 state からの再開始では `state.players` も含めた全消去が走り、「結果は消えたが削除できない」混乱が運営現場で発生
- `removePlayer` の削除不可 alert は「リセット」と曖昧誘導しており、`#resetBtn` 誤押下で参加者まで失う事故リスクが残存
- 全リセットと部分リセット（仕様上未実装）の概念分離がない

シリーズの目的は **「全リセット」と「部分リセット（参加者は残す進行データ消去）」の 2 系統を分離し、操作前（ボタン）/ 操作中（confirm）/ 操作後（toast）/ 周辺誘導（alert / guard）の語彙を整合させる** こと。

---

## 3. PR #112〜#120 一覧

| PR | Task ID | 種別 | 主な変更 | squash SHA |
|---|---|---|---|---|
| **#111** | `RECEPTION-UX-START-BUTTON-GUARD-DESIGN` | docs | 開始済 state 再クリック guard 方針を docs-only で整理 | `5625e1f` |
| **#112** | `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT` | impl | [`startTournament`](../../shogi_v4.html) 冒頭に `state.started===true` ガード追加、alert で `resetAll` 誘導 | `52a1c3f` |
| **#113** | `RESET-UX-PARTIAL-RESET-DESIGN` | docs | 「参加者を残す部分リセット」案 C 推奨を確定（`state.tournament_id` / `state.rounds` / `state.report` / `_pendingNewYomi*` を残す方針含む） | `9b9cf07` |
| **#114** | `RESET-UX-PARTIAL-RESET-IMPL-LIGHT` | impl | [`resetTournamentProgressOnly()`](../../shogi_v4.html) 新設 + [`#resetProgressBtn`](../../shogi_v4.html) 追加 + PR #112 alert を新ボタン名へ同期更新 | `779803b` |
| **#115** | `REMOVE-PLAYER-GUARD-MESSAGE-DESIGN` | docs | `removePlayer` 削除不可 alert を「大会進行データをリセット」誘導へ整理する案 D 推奨 | `059ccdb` |
| **#116** | `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT` | impl | [`removePlayer()`](../../shogi_v4.html) の 2 つの削除不可 alert を案 D 確定文に置換 | `f309516` |
| **#117** | `RESET-UX-FULL-RESET-LABEL-DESIGN` | docs | `#resetBtn` 文言・`resetAll` confirm を全リセット明示へ更新する案 D 推奨 | `89a72b2` |
| **#118** | `RESET-UX-FULL-RESET-LABEL-IMPL-LIGHT` | impl | [`#resetBtn`](../../shogi_v4.html)「大会データを全リセット」化 + `resetAll` confirm 文言更新 + VRT mobile-375 darwin 3 snapshot 更新（baseline catch-up 含む） | `8fea0ee` |
| **#119** | `RESET-UX-TOAST-LABEL-DESIGN` | docs | `resetAll` 完了 toast 案 C「大会データを全リセットしました」推奨 | `22fb60c` |
| **#120** | `RESET-UX-TOAST-LABEL-IMPL-LIGHT` | impl | [`resetAll()`](../../shogi_v4.html) 完了 toast を 1 行更新 + `test/test_reset_ux_partial_reset.js` §16 に 2 アサート追加 | `1cc05c3` |

PR #111 は前段（reception-ux）として先行起票されたが、本シリーズの起点は PR #112 / #113 の guard + 部分リセット導入。

---

## 4. 完成した語彙整合

### 4.1 全リセット側（`resetAll()` 系統）

| 段階 | 文言 | 出現位置 | 確定 PR |
|---|---|---|---|
| ボタン | `大会データを全リセット` | [shogi_v4.html:100](../../shogi_v4.html) `<button id="resetBtn">` | #118 |
| confirm | `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。` | [shogi_v4.html:5946](../../shogi_v4.html) `resetAll()` | #118 |
| 完了 toast | `大会データを全リセットしました` | [shogi_v4.html:5974](../../shogi_v4.html) `showMsg('大会データを全リセットしました','ok')` | #120 |

### 4.2 部分リセット側（`resetTournamentProgressOnly()` 系統）

| 段階 | 文言 | 出現位置 | 確定 PR |
|---|---|---|---|
| ボタン | `大会進行データをリセット` | [shogi_v4.html:101](../../shogi_v4.html) `<button id="resetProgressBtn">` | #114 |
| confirm | `参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？` | [shogi_v4.html:5925](../../shogi_v4.html) `resetTournamentProgressOnly()` | #114 |
| 完了 toast | `大会進行データをリセットしました` | [shogi_v4.html:5942](../../shogi_v4.html) `showMsg('大会進行データをリセットしました','ok')` | #114 |

### 4.3 周辺誘導文言

| 系統 | 文言要約 | 出現位置 | 確定 PR |
|---|---|---|---|
| `removePlayer` 一次禁止 alert（pairings メンバーシップ） | 「現在の組み合わせに登録されているため削除できません」+「対戦相手変更」誘導 +「先に『大会進行データをリセット』」誘導 +「参加者一覧は残したまま」明示 | [shogi_v4.html:3775](../../shogi_v4.html) | #116 |
| `removePlayer` 二次禁止 alert（`state.started && pastMatches>0`） | 「過去 N 試合分の勝敗結果があるため削除できません」+「先に『大会進行データをリセット』」誘導 +「参加者一覧は残したまま」明示 | [shogi_v4.html:3792](../../shogi_v4.html) | #116 |
| `startTournament` 開始済 guard alert | 「大会はすでに開始されています」+「参加者を変更する場合は、先に『大会進行データをリセット』」+「参加者一覧は残したまま」 | [shogi_v4.html:4454](../../shogi_v4.html) | #112 + #114 同期更新 |

### 4.4 別機能 toast（参考、本シリーズ範囲外で不変）

- マスタ全消去 toast: `マスタをリセットしました(全 member 消去)`（[shogi_v4.html:2380](../../shogi_v4.html)、`MasterResetModal` 系、別機能）

### 4.5 整合の構造

- **「大会進行データを」 vs 「大会データを全」** の修飾語対比で部分・全を区別
- 操作前（ボタン）/ 操作中（confirm）/ 操作後（toast）すべてに目的語「大会データ」または「大会進行データ」が登場
- 周辺誘導（alert / guard）はすべて部分リセット側 = `#resetProgressBtn` を第一選択へ誘導し、`#resetBtn` 誤押下を抑制

---

## 5. 不変項目（保護された範囲）

本シリーズで **意図的に変更しなかった** 項目。後続タスクが触れる場合は別 design 起票が前提。

### 5.1 ロジック・データ層

- `resetAll()` の初期化ロジック本体（`state={players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{...}}` 一括代入 + `localStorage.removeItem(STORAGE_KEY)` + `LEGACY_STORAGE_KEYS` 除去 + 大会報告書欄クリア + `shogi_branch_master` 維持）
- `resetTournamentProgressOnly()` の初期化範囲（`state.started=false` / `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` のみ、`state.players` / `state.rounds` / `state.tournament_id` / `state.report` / `_pendingNewYomi*` / `shogi_branch_master` は維持）
- `removePlayer()` の判定ロジック / early return 順序（一次禁止 → 二次禁止）/ 削除成功経路 / SAVE-001 verify
- `startTournament()` の guard 条件 `state.started === true` / 通常経路（`state.results = {A:[],B:[]}` / `state.pairings = {A:[],B:[]}` / `generatePairing` / `showTab('tournament')` / `save()` / SAVE-003 verify）
- localStorage schema: `STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `BRANCH_MASTER_KEY='shogi_branch_master'`
- pairing algorithm: `generatePairing` / Fisher-Yates / `evaluatePairingQuality` / `warning object`
- `normalizeState` / `save()` / `load()` の挙動

### 5.2 UI・スタイル

- ボタン並び・色（`btn-danger`）・配置
- CSS / layout
- `showMsg` 本体（[shogi_v4.html:3096](../../shogi_v4.html)）の構造・表示時間・色・aria-live
- DOM id（`resetBtn` / `resetProgressBtn` 不変）

### 5.3 インフラ

- `.github/workflows/`
- `package.json` / `package-lock.json`
- `playwright.config.js`
- `docs/specs/`
- `index.html`
- `data/`

---

## 6. テスト・VRT の扱い

### 6.1 テスト

- 既存 unit suite: 全 76 stanza PASS / FAIL=0 / WARN=0（PR #120 着地時点）
- 影響テスト追従:
  - `test/test_reset_ux_partial_reset.js`: PR #114 で新設、PR #118 で confirm + ボタン文言追従、PR #120 で §16 ブロックに toast 検査 2 アサート追加（最終 PASS 87 / +2）
  - `test/test_remove_player_guard_message.js`: PR #116 で新設、PR #118 でボタン文言追従（PASS 75）
  - `test/test_reception_ux_start_button_guard.js`: PR #114 で alert 追従、PR #118 でボタン文言追従（PASS 64）
  - `test/e2e/shogi_phase2_import.spec.js`: PR #118 で `大会データを全リセット` describe / expect 追従

### 6.2 VRT snapshot

- `test/e2e/visual_regression_mobile.spec.js-snapshots/` 配下:
  - `mobile-pp-panel-3sections-375-mobile-375-{darwin,linux}.png`
  - `mobile-master-edit-modal-375-mobile-375-{darwin,linux}.png`
  - `mobile-master-list-5cols-375-mobile-375-{darwin,linux}.png`
- **PR #118**: mobile-375 darwin 3 snapshot を更新（Codex Should Fix 対応、PR #114 以降の header baseline drift catch-up + `#resetBtn`「全」1 文字塊増分の累積、横スクロール / ボタン重なり / 操作不能崩れなしを目視確認済、linux variant は CI 再生成想定）
- **PR #120**: snapshot 未変更（toast は `#reg-msg` 上に出るが既存 3 snapshot の撮影タイミングに含まれない設計想定で実機 VRT 直接差分なし見込み）
- **今後の指針**: VRT red が出た場合は **自律更新せず**、差分を目視確認し運営者（user）に明示許可を得てから snapshot 更新。**threshold 緩和 / VRT skip / CI 設定変更は禁止**

---

## 7. 運用観察フェーズ（次フェーズ）

PR #112〜#120 で実装した語彙整合は **静的検査・E2E・VRT で確認した範囲では完成** しているが、**実運用での体感** は未確認。次フェーズでは以下を観察する。

### 7.1 観察項目

1. **全リセット / 部分リセットの直感的区別**
   - ヘッダーに並んだ `#resetBtn`「大会データを全リセット」と `#resetProgressBtn`「大会進行データをリセット」を運営者が一目で判別できるか
   - 「進行」修飾語の有無で機能差を読み取れるか
   - 誤押下事故が消えたか

2. **toast「大会データを全リセットしました」の語感**
   - PR #119 §10.1 で挙げた「全」の威圧感が運用上重すぎないか
   - 部分 toast「大会進行データをリセットしました」との対比が伝わるか
   - 第三者運営者が toast だけ見ても「何を」リセットしたか分かるか

3. **mobile 表示**
   - mobile 375px Safari / Pixel 5 360px 等のスマホ実機でヘッダー 5 ボタン折り返し / `#reg-msg` toast の 1 行表示
   - PR #118 baseline catch-up 後の表示に体感違和感がないか
   - 操作中タップ判定の混同（隣接ボタン誤タップ）が発生しないか

4. **操作後の迷いなさ**
   - confirm の長文（約 50 文字）が操作リズムを阻害していないか
   - 完了 toast がきちんと視認されているか
   - `removePlayer` 削除不可 alert 後に「大会進行データをリセット」の動線がスムーズに辿れるか

### 7.2 観察結果に応じた後続候補

| 観察結果 | 対応候補タスク | 種別 |
|---|---|---|
| toast「全」と confirm「すべて」の表記揺れが指摘される | `RESET-UX-TOAST-LABEL-IMPL-MEDIUM`（案 F「すべて」統一 + confirm 再調整） | 別 design 必要 |
| toast の視認時間 / 自動消去 / aria-live が問題化 | `RESET-UX-TOAST-LIFECYCLE-DESIGN`（`showMsg` 仕組み側の改善） | docs 起点 |
| `#resetBtn` 誤押下が依然残る | `RESET-UX-FULL-RESET-PLACEMENT-DESIGN`（ヘッダー撤去 / 設定タブ隔離） | docs 起点 |
| 全リセット側の destructive 警告が弱いと判明 | `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（PR #117 §10.2 案 E 強表現 / 「元に戻せません」追加） | 別 design 検討 |
| `removePlayer` 削除不可後に部分リセットを連鎖実行したい需要 | `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM`（案 E 自動連鎖） | 別 design 検討 |
| 部分リセット動線が UC1（受付後組み合わせ作り直し）/ UC2（参加者修正）でモーダル選択化を望まれる | `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM`（案 E モーダル選択化） | 別 design 検討 |
| 開始済 state からの再開始フローを wizard 化する需要 | `RECEPTION-UX-RESTART-WIZARD-DESIGN`（PR #111 案 E） | docs 起点 |

### 7.3 並走可能な独立候補

- `DISPLAY-LABELS-IMPL-LIGHT`（同姓識別・大人数クラスストレス向け、本シリーズと無関係に独立進行可、`PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT` の 2 番目 callsite 候補）
- WARNING Phase 2〜4（PAIRING-UX 警告本文への該当ペア展開 / ハイライト・ジャンプ / 候補名表示、`evaluatePairingQuality` の `warning object` 拡張を伴う中〜大規模変更）

---

## 8. 次のアクション

### 8.1 即やる（本 closure 後）

- **運用観察フェーズ開始** — 上記 §7.1 の 4 項目をリアル大会運営で確認
- 観察期間中は **本シリーズの後続実装には進まない**（HANDOFF 既存 entry の「次タスク候補」記述は観察結果次第で再評価）

### 8.2 観察結果が出るまで保留

- §7.2 の対応候補タスク群すべて
- §7.3 の独立候補（並走可能だが本シリーズとは別フェーズ判断）

### 8.3 やらない（明確に閉じたもの）

- 本 closure note 着地後の、本シリーズ範囲内での追加 docs / design / refactor
- PR #117 / #118 / #119 / #120 の design doc / 実装の書き換え
- 既に確定した文言の再変更（運用観察フェーズで明確な改善要望が出るまで）

---

## 9. このノートの位置づけ

- 本 note は **PR #120 squash merge 後の main = HEAD `1cc05c3` の状態を凍結記録** するもの
- 将来 AI / Codex / cowork が「RESET-UX 文言整合シリーズ」を一望したい時の単一エントリポイント
- HANDOFF.md に短い closure entry を別途追加し、本 note へ参照を貼る
- 個別 design doc（PR #113 / #115 / #117 / #119）は **本文を書き換えず温存**、本 note が上位の索引として機能する

---

## 10. 結論

- **PR #112〜#120 の RESET-UX 文言整合シリーズは一区切り完了**
- 全リセット / 部分リセットの 2 系統が、操作前・操作中・操作後・周辺誘導のすべての段階で語彙整合
- ロジック・データ層・スタイル・インフラはすべて不変、変更は文言と軽量テストに閉じた
- 次フェーズは **運用観察フェーズ**、追加実装は観察結果次第
- 本 closure note と HANDOFF entry の 2 件で記録は十分、後続実装タスクは未着手
