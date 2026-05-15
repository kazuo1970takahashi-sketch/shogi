# 沼津支部 月例将棋大会 運営ツール — 引き継ぎ書

> このドキュメントだけ読めば、別の Claude チャットでもすぐに作業を再開できる。

---

## 0. クイックスタート(別チャットで最初に読むべき部分)

### このプロジェクトは何か

沼津将棋支部の月例大会運営用 Web アプリ。スイス式トーナメントのペアリング自動生成・成績集計・順位決定を行う。HTML 1 ファイルで完結し、GitHub Pages でホスティング。スマホ運用前提。

### ファイル構成

- `shogi_v4.html` (約70KB / 1441行) — 運営アプリ本体(これを編集する)
- `index.html` — 運営マニュアル(shogi_v4.html へのリンクを含むランディング)

### 公開URL

```
https://kazuo1970takahashi-sketch.github.io/shogi/
```

### リポジトリ

```
kazuo1970takahashi-sketch/shogi (GitHub、public)
```

### 現在の状態

- 全5段階のリファクタリング完了済み(2026年4月時点)
- タブ選択ロジック改善済み
- スマホUI(参加者登録画面)改善済み
- **Codexレビュー由来 P1 修正2件 適用済み（2026年5月、後述「機能修正履歴」参照）**
- 本番投入可能なレベル
- 次回大会まで時間的余裕あり(約3週間先)

### 編集時の絶対ルール

1. **動作を変えるリファクタは禁止**(引数整理は許容)
2. **build/bind/coordinator パターンを維持**(後述の関数構造マップ参照)
3. **CSS の動作を変えない**(特に `<div class="section">` の閉じタグ省略は元コードからの仕様、修正してはいけない)
4. **テストを必ず実行する**(リグレッションを防ぐ)
5. **挙動変更を伴う改修は別フェーズ**として扱う(リファクタとは混在させない)

---

## 1. 関数構造マップ(50関数)

`shogi_v4.html` 内の `<script>` セクションは以下のセクションに分かれている:

### UTILITY セクション
- `escapeHtml(s)` — HTMLエスケープ
- `getName(id, cls)` — 選手名取得(削除時は `(削除)`)
- `getFee(member, grade)` — 参加費計算(支部員500円、支部員以外1000円、中学生以下無料)
- `calcTotal(cls)` — クラスの合計参加費
- `getWins(cls)` — 各選手の勝数集計
- `pairHasRematch(cls, p1, p2)` — 再戦判定
- `getDuplicatePlayersInPairings(cls)` — 重複対局検出
- `normalizeState(loaded)` — JSONロード時の堅牢化(欠落フィールド補完)

### STORAGE セクション
- `save()` — localStorage に保存(キー: `shogi_v4`)
- `load()` — localStorage から復元(レガシーキー `shogi_v3` も読込)

### UI HELPERS セクション
- `showTab(t)` — タブ切替("reg" | "tournament" | "result")
- `showMsg(text, type)` — 登録画面のメッセージ表示

### REGISTRATION セクション
- `renderRegList()` — 参加者リスト全体を再描画
- `makePlayerRow(p, cls, i)` — 1選手分のDOM行を生成(2段構成: main + actions)
- `updateField(id, cls, field, value)` — 選手の属性更新
- `addPlayer()` — 選手追加
- `removePlayer(id, cls)` — 選手削除(進行中なら警告)
- `editPlayer(id, cls)` — 単一選手の名前変更

### MODALS セクション (build/bind/coordinator パターン)
- `buildBulkEditModalHtml(cls, players)` — 一括編集モーダルのHTML
- `bindBulkEditModalEvents(cls, players)` — 一括編集モーダルのイベント
- `bulkEditNames(cls)` — 一括編集モーダルのコーディネーター
- `buildChangePairingModalHtml(cls, idx, candidates, match)` — 対戦変更モーダルのHTML
- `bindChangePairingModalEvents(cls, idx)` — 対戦変更モーダルのイベント
- `changePairing(cls, idx)` — 対戦変更モーダルのコーディネーター
- `buildEditPastResultModalHtml(cls, ri, mi, n1, n2, match)` — 過去結果修正モーダルのHTML
- `bindEditPastResultModalEvents(cls, ri, mi)` — 過去結果修正モーダルのイベント
- `editPastResult(cls, roundIdx, matchIdx)` — 過去結果修正モーダルのコーディネーター

### ACTIONS セクション
- `startTournament()` — 大会開始(参加人数バリデーション含む)
- `generatePairing(cls)` — スイス式ペアリング生成(バックトラッキング)
- `setWinner(cls, idx, pid)` — 勝者選択
- `submitRound(cls)` — ラウンド確定

### RENDER (TOURNAMENT) セクション
- `buildScoreGridHtml(cls, sorted, wins)` — 暫定成績グリッドのHTML
- `buildPlayedHistoryHtml(cls, sorted, played)` — 対戦済みリストのHTML
- `buildPastResultsHtml(cls)` — 過去結果のHTML(クリックで修正)
- `buildCurrentPairingsHtml(cls, roundNum, done)` — 現在の組み合わせのHTML
- `bindTournamentEvents(cls)` — 対局管理タブのイベント全登録
- `renderTournament(cls)` — コーディネーター(30行)

### CALC セクション
- `calcFinal(cls)` — 最終順位計算(A・B・Cポイント、直接対決、くじ引き考慮)

### RENDER (RESULTS) セクション
- `buildResultsRoundCellMobileHtml(cls, pid, ri, wins)` — スマホ用1セル
- `buildResultsRoundCellDesktopHtml(cls, pid, ri, wins)` — PC用1セル
- `buildResultsMobileHtml(cls, finals, wins)` — スマホ全体
- `buildResultsDesktopHtml(cls, finals, wins)` — PC全体
- `buildResultsClassHtml(cls, isSP)` — 1クラスの全体
- `renderResults()` — コーディネーター(8行、A/B両クラス処理)

### FILE I/O セクション
- `saveData()` — JSONダウンロード
- `loadData(e)` — JSONアップロード

### PRINT セクション
- `printResults()` — 対戦成績の印刷ビュー
- `getTopPlayers()` — 上位入賞者抽出
- `downloadReport()` — 報告書(支部宛PDF)生成

### CONTROL セクション
- `resetAll()` — 全データリセット
- `isTournamentDone()` — 全クラス完了判定

### INIT セクション
- `bindHeaderEvents()` — ヘッダーボタン(保存/読込/リセット)
- `bindRegistrationEvents()` — 登録画面のイベント
- `bindTabEvents()` — タブ切替イベント
- `initApp()` — 起動処理(load → renderRegList → 必要に応じてタブ切替)
- `DOMContentLoaded` ハンドラ — bind系4つを順に呼ぶだけ(6行)

---

## 2. 設計方針(build/bind/coordinator パターン)

DOM操作を伴うレンダリング関数は3層に分割する。

### 命名規約
- `buildXxxHtml(args)` — **HTML文字列を返すだけ**、副作用なし(純粋関数に近い)
- `bindXxxEvents(args)` — **DOMにイベント登録するだけ**、HTML生成はしない
- `renderXxx(args)` または `xxxModal(args)` — **コーディネーター**:データ準備 → buildで連結 → DOMに反映 → bindでイベント登録

### 例: renderTournament

```javascript
function renderTournament(cls){
  var el=document.getElementById('pane-'+cls);
  if(!el)return;
  // データ準備
  var players=state.players[cls];
  if(players.length===0){...; return;}
  var wins=getWins(cls);
  var done=state.results[cls].length>=state.rounds;
  var sorted=...;
  var played=...;

  // HTML連結
  var html='<div class="section"><h2>'+cls+'クラス</h2>';
  html+=buildScoreGridHtml(cls, sorted, wins);
  html+=buildPlayedHistoryHtml(cls, sorted, played);
  html+=buildPastResultsHtml(cls);
  html+=buildCurrentPairingsHtml(cls, roundNum, done);

  // DOM反映 → イベント登録
  el.innerHTML=html;
  bindTournamentEvents(cls);
}
```

### モーダル構造

各モーダルも同じパターン。例: bulkEditNames

```javascript
function bulkEditNames(cls){
  var players=state.players[cls];
  if(players.length===0){alert(...); return;}
  var existing=document.getElementById('bulk-edit-modal');
  if(existing)existing.remove();
  var modal=document.createElement('div');
  modal.id='bulk-edit-modal';
  modal.style.cssText='...';
  modal.innerHTML=buildBulkEditModalHtml(cls, players);
  document.body.appendChild(modal);
  bindBulkEditModalEvents(cls, players);
}
```

---

## 3. データ構造

### state オブジェクト(localStorage に永続化)

```javascript
state = {
  players: {
    A: [{id, name, cls:'A', member:'member'|'other', grade:'ippan'|'chu'}, ...],
    B: [...]
  },
  rounds: 4,        // ラウンド数(設定可能)
  pairings: {
    A: [{p1, p2, winner: null|playerId}, ...],  // 現在のラウンドのみ
    B: [...]
  },
  results: {
    A: [
      [{p1, p2, winner}, ...],  // 1回戦
      [{p1, p2, winner}, ...],  // 2回戦
      ...
    ],
    B: [...]
  },
  started: false  // 大会開始フラグ
}
```

### localStorage キー

- 現行: `shogi_v4`
- レガシー(後方互換): `shogi_v3`(`load()` 内で自動移行)

---

## 4. テスト基盤(`test/` 配下)

### 3層テスト方針

1. **スモークテスト**: HTML構造の存在確認、JSON取込が成功するか
2. **重点回帰テスト**: 主要機能が壊れていないか
3. **既知バグ再発テスト**: 過去発見されたバグ(計14件)が再発していないか

### テストファイル

- `run_tests.sh` — 3層テスト本体(全42項目、ハッシュ比較含む)
- `compare_render.js` — `renderTournament` の出力HTML比較(4ケース)
- `compare_results.js` — `renderResults` の出力HTML比較(12ケース、スマホ/PC両モード)
- `compare_modals_v2.js` — モーダルDOMツリー比較(5ケース)
- `test_tab_selection.js` — タブ選択ロジック検証(6ケース)
- `test_pairing_properties.js` — ペアリング性質テスト(4観点 / PASS=7)
- `data_basic4.json` — 4名の基本データ
- `data_ab44.json` — A4+B4名のデータ
- `data_special.json` — 特殊文字を含むデータ
- `data_v3_legacy.json` — 旧バージョンのデータ(マイグレーション検証)
- `data_broken.json` — 破損データ(normalizeStateの堅牢性検証)

### 実行コマンド(別チャットで使う場合)

```bash
# 3層テスト
bash test/run_tests.sh shogi_v4.html [比較対象].html

# 出力比較(変更前後で実行)
node test/compare_render.js [before].html [after].html
node test/compare_results.js [before].html [after].html
node test/compare_modals_v2.js [before].html [after].html
node test/test_tab_selection.js shogi_v4.html
```

### 編集時のチェックリスト

1. 編集前に **before** をコピー保存
2. 編集を実施
3. 上記4つのテストを実行
4. 全てPASSなら本番投入OK
5. **意図しない関数のハッシュが変わっていないか**を必ず確認

---

## 5. リファクタリング履歴(全5段階+補正)

### 各段階の効果

| 段階 | 内容 | 縮小 |
|---|---|---|
| 1 | utility 集約(7関数) | — |
| 2 | renderTournament 分割 | 124行 → 30行 + 5新規関数 |
| 3 | renderResults 分割 | 78行 → 8行 + 5新規関数 |
| 4 | 3モーダル分離 | bulkEditNames 89→14、changePairing 54→10、editPastResult 39→14 |
| 5 | イベント初期化集約 | DOMContentLoaded 28行 → 6行 + 4新規関数 |
| 補正 | タブ選択改善 | 完了済み大会の読込で result タブが自動で開く |

### リファクタ前 vs 後の品質保証実績

- 3層テスト: 各段階42項目、全PASS
- 実行ベース出力比較: renderTournament 4ケース、renderResults 12ケース(スマホ/PC両)、モーダル5ケース、すべて完全一致

つまり「**リファクタリング全工程を通じて、挙動が1ビットも変わっていない**」が証明済み。

---

## 5.5 機能修正履歴（リファクタとは別フェーズ）

リファクタは挙動を一切変えない作業だが、本セクションは**意図的に挙動を変えた修正**の履歴。

### 2026-05-01: Codexレビュー由来 P1 修正

Codex 独立レビューで本番投入前に必須と判定された P1 を 2 件修正。

| 指摘番号 | 対象関数 | 修正内容 | 行（修正後） |
|---|---|---|---|
| P1-1 | `removePlayer` | 大会開始後・過去対局あり参加者の削除を禁止（calcFinal の TypeError クラッシュ防止）。実態と乖離していた警告文「過去N試合分の対戦履歴があります…」は削除 | shogi_v4.html: 481-485 |
| P1-2 | `generatePairing` の `backtrack` | スイス式の根幹「同勝ち数優先」を実装。候補を勝数差ごとにバケット化し、勝数差昇順 × バケット内ランダムで選択 | shogi_v4.html: 666-705 |

### 検証

- **新規性質テスト**: `test/test_pairing_properties.js`（4観点・PASS=7）を追加し、`run_tests.sh` 末尾に組込済
- **既存テスト**: `run_tests.sh` 全43項目 / `compare_render.js` 4ケース / `compare_results.js` 12ケース / `compare_modals_v2.js` 5ケース / `test_tab_selection.js` 6ケース — 全PASS
- **関数本体ハッシュ比較**: 修正前後で `generatePairing` と `removePlayer` のみ変化、他33関数は完全一致

### 修正前版での再現確認

`test_pairing_properties.js` を修正前 HTML で実行すると：
- テスト3（勝数差最小性）: FAIL（同勝ち数で組めるのに別勝ち数のペアが組まれた）
- テスト4-b（開始後・過去対局あり削除）: FAIL（削除が通ってしまう）
- テスト4-d（calcFinal クラッシュ）: FAIL（TypeError）

修正後はすべて PASS。回帰検出能力あり。

### 2026-05-01: Codex 再レビュー結果

P1 修正後のパッケージを Codex に再レビュー依頼。

**判定: A-（P1修正は本番投入前レビューとして合格）**

- ✅ P1-1（過去対局者削除クラッシュ）: **完全解消**
- ✅ P1-2（同勝ち数優先ペアリング）: **完全解消**
- ❌ P2-1（テスト失敗握り潰し）: 未解消（依頼通り、スコープ外として正しい挙動）

新しい P1 相当の問題は検出されず。差分も `removePlayer` と `generatePairing` にほぼ閉じ、余計な挙動変更なしと評価された。Codex が指摘した疑問点（防御的堅牢性、アルゴリズムの割り切り）は本セクション末尾の「設計上の割り切り」に記録。

### 2026-05-12〜13: A-5.1 保存安全化（SAVE-001 / 002 / 003 / 004 / 003b-1 / 003b-2 / 003b-3）

MASTER-001（PR #40）で確立した「保存後 re-read で検証」原則を、shogi_v4.html 内の他保存処理に **段階的に** 適用するフェーズ。SAVE-DESIGN-001 v0.1（PR #45）の保存処理棚卸しを起点に、Must スコープを 1 PR ずつ Codex レビューを通して投入。

| Task ID | 対象 | PR | Squash SHA | 主な追加 |
|---|---|---|---|---|
| A-5.1-SAVE-001 | `removePlayer` の保存未確認検知 | #46 | `219d328` | `verifyPlayerAbsent(id, cls)` |
| A-5.1-SAVE-002 | `addPlayer` の保存未確認検知 | #47 | `a19e193` | `verifyPlayerPersistedById(id, cls, name)`（id + cls + name 3 軸） |
| A-5.1-SAVE-003 | 大会進行 core path 4 関数（`startTournament` / `generatePairing` / `setWinner` / `submitRound`） | #48 | `1e13ce1` | `readPersistedState()`（schema 検証付き）+ `pairingsMatchSnapshot()`（field-compare） |
| A-5.1-SAVE-004 | `generatePairing(cls)` の保存確認を field-compare に強化（SAVE-003 length-only → `pairingsMatchSnapshot` 流用） | #50 | `42e4673` | helper 追加なし（既存 `pairingsMatchSnapshot` を流用）。`console.warn` タグを `SAVE-003` → `SAVE-004` に更新 |
| A-5.1-SAVE-003b-1 | 参加者追加経路 4 callsite（`handleSuggestClassAdd` / `handlePastParticipantClassAdd` 追加・クラス変更 / `finalizeAddPastParticipants`） | #52 | `af2f173` | helper 追加なし（既存 `verifyPlayerPersistedById` を流用）。`finalizeAddPastParticipants` は複数件未確認でも UI warn 1 回に集約 |
| A-5.1-SAVE-003b-2 | 対局画面編集経路 3 callsite（`bindChangePairingModalEvents` 対戦相手変更 / swap、`bindEditPastResultModalEvents` p1 / p2） | #54 | `9f4144f` | トップレベル helper 追加なし（既存 `readPersistedState` / `pairingsMatchSnapshot` を流用）。`bindEditPastResultModalEvents` はローカルクロージャ `verifyPastResultPersisted_ep(expectedWinner)` で多次元 index 欠落も検知 |
| A-5.1-SAVE-003b-3 | 手動編集系 2 callsite（`updateField` の member / grade select、`bindBulkEditModalEvents` の bulk-save handler） | #57 | `c5929ec` | 新規 helper 1 個追加（`verifyPlayerFieldPersisted(cls, playerId, field, expected)` field 軸の厳密一致）。bulkEditNames は既存 `verifyStatePersisted` を全件ループ流用 + warn 1 回集約 |

**共通方針（SAVE-DESIGN-001 §1.4 と整合）**:
- 保存確認できない場合も「保存失敗」と断定せず「保存未確認」として `showMsg(.., 'warn')` + `console.warn`
- alert / rollback / retry なし（現場停止リスク回避、運営は継続）
- helper は保存対象別に分け、過剰な汎用化はしない
- 1 PR を Must スコープに絞り、Should / Nice-to-Have は別 PR に分離

**A-5.1-CLOSURE（2026-05-13、docs のみ）**:
- A-5.1 保存安全化を **「実装系完了」として区切る** 判定を確定。SAVE-001 〜 SAVE-003b-3 で SAVE-DESIGN-001 §2.3「○ / △」評価 callsite はすべて消化済み、未対応 save() callsite に **Must は残っていない**
- 残り 3 callsite は Defer / 別タスク扱い:
  - `bindReportEvents()`: SAVE-UX / REPORT 系（keystroke 毎発火のため debounce / blur ベース化が前提）
  - `syncBranchMasterOnSave()`: MASTER 系 V2 拡張（`last_class` / `yomi` 等、name 軸以外の検証）
  - `applyLoadedJson()`: IMPORT 系（player 数 / pairings 数 / results 数 / report 等の複数軸 verify）
- SAVE-UX は A-5.1 完了の必須条件ではなく、後続改善として SAVE-UX-DESIGN を起点に進める

**残タスク候補（A-5.1-CLOSURE 後の次候補、優先順）**:
- A-5.1-SAVE-UX-DESIGN（warn 集約 / debounce / retry / aria-live / toast 集約 の採否と粒度。コード変更なしの方針整理）
- A-5.1-SAVE-FUTURE-REPORT（`bindReportEvents` の debounce 化 + 保存未確認検知、SAVE-UX-DESIGN の結論に依存）
- A-5.1-SAVE-FUTURE-IMPORT（`applyLoadedJson` の件数一致 verify）
- MASTER-V2-LASTCLASS（仮、別系統。会員マスタ V2 拡張 + `syncBranchMasterOnSave` 同梱）
- A-5.1-SAVE-UX 本体（SAVE-UX-DESIGN 後）

**関連完了済 PR（SAVE 系本流とは別系統）**:
- SEC-HYGIENE-001（PR #56、commit `9c21341`）: `trufflesecurity/trufflehog@main` → `@v3.95.3` への pinning。Mini Shai-Hulud 第二波 影響確認時に発見した一般 supply-chain hygiene 改善（IoC とは無関係）

**詳細**: `docs/notes/20260513_shogi_a5_1_save_completion_summary_v0.md`（A-5.1-CLOSURE は §0 にまとめ）

**保存安全化 / SAVE-UX 現在地マップ**: `docs/notes/20260513_shogi_save_ux_status_map.md`（PR #59 〜 #63 の callsite 単位現在地。次タスク候補は SAVE-UX-MIN-NOTIFY-002 = S22 を Level 0 → Level 1）

**Level 2 保存状態 indicator 設計**: `docs/specs/20260513_shogi_save_ux_status_indicator_design.md`（SAVE-UX-DESIGN Level 2 の Indicator UI 設計。実装は後続 SAVE-UX-STATUS-INDICATOR-IMPL）

**SAVE-UX-WARN-AGGREGATION 設計**: `docs/specs/20260513_shogi_save_ux_warn_aggregation_design.md`（warn 集約・kind 分類・三層分離原則の設計。v1 追補 §15 に PR #70 〜 #76 の到達点を反映: A-5.1 SAVE 系 15/15 helper 経由化完了 / metadata 土台 / `save-verify:{core,entry,edit,past,pairing}` の Group 対応 / `showMsg` 3000ms 集約 / 短縮文言確定 / compound 発火例 / 失敗を隠さない原則 / 対象外カテゴリ将来方針 / 次タスク候補 (QUOTA-HANDLING / MASTER-V2-METADATA / AGGREGATION-TUNING / LEVEL-3-WARNING-BAR / INDICATOR-DETAIL)。v1.1 §16 で `kind` / `aggregateKey` の hyphen-case 統一を確定）

**SAVE-UX-QUOTA-HANDLING inventory + impl**: `docs/notes/20260514_shogi_save_ux_quota_inventory.md`（v0 = Step 1 inventory: `localStorage.setItem` 2 callsite 棚卸し / `QuotaExceededError` 明示判定 0 件 / 暫定方針整理。v1 = Step 2 実装 (SAVE-UX-QUOTA-HANDLING-IMPL §15): `isQuotaExceededError(e)` helper 追加、`save()` / `saveBranchMaster()` の quota 分岐実装、`kind: 'storage-quota'` / `aggregateKey: 'storage-quota:global'` / `severity: 'warn'` / callsiteId `STORAGE-QUOTA:save` / `STORAGE-QUOTA:saveBranchMaster`、showMsg aggregation 対象外、indicator count +1。**二重通知抑制は Step 2 では未実装、後続候補**）

**SAVE-UX post-quota follow-up map**: `docs/notes/20260513_shogi_save_ux_status_map.md` §14（PR #78〜#80 後の到達点、save-verify / storage-quota / master-verify の 3 系統表初版、未回収 Nice to Have、次タスク候補を整理。PR-A: SAVE-UX-MASTER-V2-METADATA-IMPL で S03 / S05 / S22 に master-verify metadata 付与済み、PR-B: SAVE-UX-MASTER-V2-AGGREGATION で `SAVE_WARN_AGGREGATABLE_KINDS` kind allow-list により master-verify を aggregation 対象化済み。SAVE-UX-TEST-STRUCTURAL-MATCH で test を block 単位の structural match に移行済み。`callsiteId` 命名規則は §13）

**SAVE-UX post-aggregation follow-up map**: `docs/notes/20260513_shogi_save_ux_status_map.md` §15（PR #82 〜 #84 連鎖完了時点の最新マップ。3 系統 = save-verify 15 + storage-quota 2 + master-verify 3 = 計 20 callsite。`metadata → structural test → aggregation 対象化` の 3 段階標準手順候補を確立。未回収 Nice to Have / 次タスク候補 7 件・司令塔暫定おすすめは次が **`SAVE-UX-PARSE-HANDLING-INVENTORY`**（第 4 系統候補の棚卸し）、実運用フィードバック次第で `SAVE-UX-AGGREGATION-TUNING` / `SAVE-UX-DUAL-NOTIFY-SUPPRESSION`）

**SAVE-UX parse handling inventory**: `docs/notes/20260513_shogi_save_ux_status_map.md` §16（parse-failed / storage-corrupted / load-failed / import-failed 周辺の docs-only 棚卸し。`JSON.parse` / `localStorage.getItem` / load / import 経路の callsite を 5 系統に分類 — A: state restore / B: branch master load / C: save-verify helper 内部（合流済）/ D: 大会データ import / E: master import。第 4 系統候補の中核 kind は `storage-corrupted`、初期 aggregation 対象**外**（storage-quota と同判断軸: データ破損は短縮表示で隠さない）、severity は warn に揃える。次 impl PR 候補は `SAVE-UX-PARSE-HANDLING-IMPL` 案 A = PARSE-MASTER-003 のみ `syncBranchMasterOnSave` 既存 showMsg を `notifySaveWarning({kind:'storage-corrupted', aggregateKey:'storage-corrupted:branch-master'})` 経由化する最小 1 callsite 接続）

**SAVE-UX parse handling impl**: `docs/notes/20260513_shogi_save_ux_status_map.md` §16.13 / §16.14（`SAVE-UX-PARSE-HANDLING-IMPL` = §16.9 案 A 完了。`syncBranchMasterOnSave` の `_loaded_with_corruption` ブランチを `notifySaveWarning({kind:'storage-corrupted', aggregateKey:'storage-corrupted:branch-master', severity:'warn', callsiteId:'PARSE-MASTER-003'})` 経由化し、既存 explicit `console.warn` / `showMsg('warn')` を除去（PR #79 storage-quota パターンと対称）。callsiteId は inventory → impl 追跡整合を優先し §16 inventory ID `PARSE-MASTER-003` を runtime ID に流用（§13 形式 (a) に分類、`STORAGE-CORRUPTED:syncBranchMasterOnSave` 形式 (b) 統一は別 cleanup PR）。test に SECTION 18 追加、SECTION 12.5 sanity check を 20 → 21 に更新。aggregation 対象外を維持し `SAVE_WARN_AGGREGATABLE_KINDS` は変更しない。4 系統合計 = save-verify 15 + storage-quota 2 + master-verify 3 + **storage-corrupted 1 = 21 callsite**）

**SAVE-UX 支部マスタ破損 root cause inventory**: `docs/notes/20260513_shogi_save_ux_status_map.md` §17 を参照（PR #87 後の follow-up docs-only 棚卸し。`saveBranchMaster` / `loadBranchMaster` の実呼び出し数・囲み関数 group / `_loaded_with_corruption` 利用 callsite / import・migration 経路 / 破損原因候補 10 件の症状-原因分離 / 既存防御 / 弱点 / 復旧導線候補を整理。次タスク候補は `SAVE-UX-BRANCH-MASTER-RECOVERY-GUIDANCE`（最有力、message 改善）/ `SAVE-UX-BRANCH-MASTER-CALLSITE-AUDIT`（docs-only）/ `SAVE-UX-STATE-RESTORE-HANDLING-INVENTORY` / `SAVE-UX-BRANCH-MASTER-CORRUPTION-RECOVERY-IMPL`。詳細数値・分類は §17 に寄せる）

**SAVE-UX 支部マスタ破損 recovery guidance 設計**: `docs/notes/20260513_shogi_save_ux_status_map.md` §18 を参照（PR #88 後の docs-only 設計。現行 PR #87 文言の評価 / recovery guidance 設計方針（症状+影響+次の行動、既存 UI 前提、長文化回避、自動修復しない、modal/alert 不使用）/ Light・Medium・Heavy 分類 / message 案 L-1〜L-3 / 表示場所候補 / 個人情報・共有設計との接続 / 次タスク候補を整理。次 impl PR は **`SAVE-UX-BRANCH-MASTER-RECOVERY-GUIDANCE-IMPL-LIGHT`**（PARSE-MASTER-003 message 末尾に「マスタタブのインポート・統合で復旧できます」という短い復旧導線を 1 句追加する最小改修。「初期化」= リセットは最終手段のため Light の主導線から外す）。詳細は §18 に寄せる）

**SAVE-UX 支部マスタ破損 recovery guidance IMPL-LIGHT**: `SAVE-UX-BRANCH-MASTER-RECOVERY-GUIDANCE-IMPL-LIGHT` = §18.5.1 L-1 着地。`shogi_v4.html` PARSE-MASTER-003 の `message` を「支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）。マスタタブのインポート・統合で復旧できます。」に更新し、症状 + 影響 + 大会運営継続 + 次の行動を 1 行に集約。`test/test_branch_master.js` 末尾に主要語句アサーション section を追加（全文一致ではなく `支部マスタ` / `破損` / `自動同期` / `スキップ` / `大会データのコピー` / `継続` / `マスタタブ` / `インポート` / `統合` / `復旧` を `PARSE-MASTER-003` 近傍の `message:'...'` リテラルに対して indexOf 検証）。大会データコピー処理・支部マスタ保存処理・自動修復・modal/alert / Medium 案バナー / Heavy 案 indicator detail はいずれも未追加（scope 外）。severity=warn / aggregation 対象外（`SAVE_WARN_AGGREGATABLE_KINDS` 不変）を維持。

**SAVE-UX 支部マスタ破損対応 closure**: `docs/notes/20260513_shogi_save_ux_status_map.md` §19 を参照（PR #88 root cause inventory / PR #89 recovery guidance 設計 / PR #90 IMPL-LIGHT 実装の 3 段連鎖クロージャ整理。docs-only。到達点（自動同期スキップ / 大会データコピー継続 / 復旧導線提示 / severity=warn 維持 / aggregation 対象外維持 / 自動修復未実装 / modal-alert 未実装）/ 維持されている不変項目 / 明示的非実装リスト / 後続候補と着手条件（IMPL-MEDIUM 運用者フィードバック待ち、Heavy 案・indicator detail / corruption recovery impl / callsite audit はすべて未着手）/ §17 §18 との接続をまとめる。本 closure では実装・テスト・CI 設定には触れず、後続タスクの着手も行わない。次手は運用者フィードバック観察結果次第）

**SAVE-UX 残タスクと Next Action 整理**: `docs/notes/20260513_shogi_save_ux_status_map.md` §20 を参照（PR #88〜#91 完了後の SAVE-UX 全体地図と Next Action 棚卸し。docs-only。4 系統 21 callsite の完了済み PR 地図 / 未完了候補の横断棚卸し（branch master corruption Medium・Heavy / parse 系案 B / docs-only inventory 4 件 / 運用フィードバック待ち 4 件 / Codex Nice-to-Have 1 件 / 個別判断 1 件）/ 着手条件 × 性格マトリクス / 推奨 Next Action 3 候補 — 第一: `SAVE-UX-BRANCH-MASTER-CALLSITE-AUDIT`（Must、§17.9 弱点 #8 解消、24 callsite × `_loaded_with_corruption` 判定マトリクス、docs-only）/ 第二: `SAVE-UX-STATE-RESTORE-HANDLING-INVENTORY`（Should、§16.9 案 B 前段、PARSE-LOAD-001/002/003 棚卸し、docs-only）/ 第三: `SAVE-UX-CLOSURE-DOC-REFINEMENT`（Nice to Have、§19.5 ↔ §18.8.1 併記、Codex PR #91 Nice-to-Have 取込）/ やらない・待つ判断（IMPL-MEDIUM / Heavy / INDICATOR-DETAIL / AGGREGATION-TUNING / DUAL-NOTIFY-SUPPRESSION / FIELDS-SCHEMA / callsiteId 命名 cleanup / MASTER-001 helper 経由化はすべて運用感蓄積待ち or 仕様判断重め）/ 既存 §11〜§19 は改訂せず集約・索引のみ）

**SAVE-UX 支部マスタ破損 callsite audit**: `docs/notes/20260513_shogi_save_ux_status_map.md` §21 を参照（§20.5.1 第一推奨 = `SAVE-UX-BRANCH-MASTER-CALLSITE-AUDIT` 着地。docs-only。HEAD `8c676c9` における `loadBranchMaster()` 24 callsite × `_loaded_with_corruption` 判定マトリクス / `saveBranchMaster()` 14 callsite の load→modify→save 経路分類 / 4 分類集約（既に見ている 4 / 意図的 overwrite 6 / 見るべきだが現状未防御 6 / 対象外 10）/ `notifySaveWarning()` 21 callsite と支部マスタ破損の関係 / flag 検出範囲が `JSON.parse` 失敗のみに限定されていることの構造分析 / 注目 6 callsite のうち 5 件は間接防御で低リスク、1 件（[shogi_v4.html:3618](shogi_v4.html:3618) `addPlayer` yomi 補完経路）が現実的中リスクとして特定 / 後続タスク候補 3 段階（docs 整理で十分 / 実装最小スコープ 3 案 = `SAVE-UX-ADDPLAYER-CORRUPTION-GUARD` 等 / 運用フィードバック待ち）。司令塔向け結論: §17.9 弱点 #8 は本 audit 着地で「監査済の上で意図的に未防御」へ遷移、本 audit 時点では実装着手不要、§20.5 推奨 Next Action は `SAVE-UX-STATE-RESTORE-HANDLING-INVENTORY` を Should として維持）

**SAVE-UX state restore handling inventory**: `docs/notes/20260513_shogi_save_ux_status_map.md` §22 を参照（§20.5.2 第二推奨 / §21.11.3 推奨 = `SAVE-UX-STATE-RESTORE-HANDLING-INVENTORY` 着地。docs-only。§16.9 案 B 前段の整備。HEAD `f829009` で `load()` ([shogi_v4.html:443-459](shogi_v4.html:443)) 内の PARSE-LOAD-001 ([448](shogi_v4.html:448) localStorage.getItem catch) / PARSE-LOAD-002 ([451](shogi_v4.html:451) JSON.parse catch) / PARSE-LOAD-003 ([458](shogi_v4.html:458) 全キー失敗) を再検証し、3 callsite すべて完全 silent（user-facing 通知ゼロ、console.warn すらなし）を確認。重要観察: shogi_v4 → shogi_v3 → 初期 state の fallback chain が silent / 大会中 reload で「データが消えた」と気づける検知点が存在しない / レガシキー残骸読み込みリスク。4 分類: 低リスク 1 (LOAD-001) / 中〜高リスク 1 (LOAD-002) / 高リスク致命的 1 (LOAD-003) / すでに通知あり 0 / 運用許容 0。推奨パターンは `notifySaveWarning({kind:'storage-corrupted', aggregateKey:'storage-corrupted:state', severity:'warn'})` 経由化（PARSE-MASTER-003 と並列構造）。支部マスタ破損 §17〜§21 とは別責務（対象データ / 失敗関数 / user-facing 通知 / 影響範囲が異なる）、ただし設計原則は共通。後続実装候補 3 段階: `SAVE-UX-STATE-RESTORE-HANDLING-IMPL-LIGHT`（仮、PARSE-LOAD-003 のみ）/ `SAVE-UX-STORAGE-CORRUPTED-HANDLING-IMPL`（§16.9 案 B 既出、PARSE-LOAD-002+003）/ `SAVE-UX-STATE-RESTORE-HANDLING-IMPL-FULL`（仮、全件）。司令塔向け結論: 本 inventory 時点で実装着手不要、運用フィードバック待ち。SAVE-UX「データ保全系」inventory は branch-master 側・state 側ともに揃った状態へ遷移）

**SAVE-UX データ保全系 closure refinement**: `docs/notes/20260513_shogi_save_ux_status_map.md` §23 を参照（§20.5.3 第三推奨 = `SAVE-UX-CLOSURE-DOC-REFINEMENT` 着地。docs-only refinement。本 PR で SAVE-UX **データ保全系の docs-only inventory pool が一区切り**: §20.5 推奨 Next Action 3 候補（CALLSITE-AUDIT / STATE-RESTORE-HANDLING-INVENTORY / CLOSURE-DOC-REFINEMENT）すべて main 着地完了。§17〜§22 到達点を 1 表で俯瞰（支部マスタ側: §17 root cause / §18 guidance / §18.5.1 PR #90 PARSE-MASTER-003 IMPL-LIGHT / §19 closure / §21 callsite audit、残: ADDPLAYER-CORRUPTION-GUARD 中リスク 1 件を後続化 / state restore 側: §22 inventory、PARSE-LOAD-001/002/003 完全 silent 確認、002A/002B サブ分類、severity 昇格候補、boot timing 論点を整理済）。残実装候補は支部マスタ系 3 案 (ADDPLAYER / MODIFY-EXISTING / FLAG-COVERAGE) + state restore 系 3 案 (LIGHT / 案B / FULL) = 6 案を 1 表に集約。次フェーズ推奨は **STATE-RESTORE-HANDLING-IMPL-LIGHT 起票判断（最有力、§22.7.0 boot timing 論点を事前に解く前提）or 運用観察フェーズ継続**。明示: 新規 docs-only inventory を探し続けない、次は impl 起票判断または観察フェーズ。同時に PR #91 Codex Nice-to-Have を取込（§19.5 「外部送信・ログ送信」非実装行に §18.8.1 個人情報の取扱い #4 への参照を併記、§18.4.1 設計方針と 2 観点で trace 可能化）。支部マスタ側 ADDPLAYER-CORRUPTION-GUARD は運用フィードバック後に優先度再判断）

**SAVE-UX state restore IMPL-LIGHT design check**: `docs/notes/20260513_shogi_save_ux_status_map.md` §24 を参照（§23.5 第一推奨の前提条件 = `SAVE-UX-STATE-RESTORE-HANDLING-IMPL-LIGHT-DESIGN-CHECK` 着地。docs-only design check。§22.7.0 boot timing 懸念を HEAD `b39eb40` の `shogi_v4.html` 実装直視で **実態無効** と確認: `load()` は `DOMContentLoaded` 経由で `initApp()` から呼ばれ、`<div id="reg-msg">` (line 130) / `<span id="save-warning-indicator">` (line 105) は静的 HTML で常に存在、`showMsg()` / `recordSaveWarningForIndicator()` / `updateSaveWarningIndicator()` / `notifySaveWarning()` は null-safe + try/catch + 例外を投げない契約で多層防御済。実装方式候補 A〜D を比較し、**採用は候補 A**（`load()` 内 `anyFailure` フラグ + `notifySaveWarning` 直接呼出、最小変更 +5〜10 行、PARSE-MASTER-003 と設計対称）。最小スコープ: PARSE-LOAD-003 のみ、metadata = kind:'storage-corrupted' / aggregateKey:'storage-corrupted:state' / severity:'warn' / callsiteId:'PARSE-LOAD-003'、4 系統合計 21 → 22 callsite への自然な拡張、aggregation 対象外維持。「初回起動（データなし、正常 case）」と「破損起源」を `anyFailure` フラグで区別、PARSE-LOAD-002A（v4 失敗 → v3 成功）は意図的にスコープ外。対象外は LOAD-001/002 直接 warn / 002A 対応 / FULL / 案 B / notifySaveWarning boot-safe 大改修 / error 昇格 / alert・modal / 自動復旧 / 外部送信。司令塔向け結論: **次は `SAVE-UX-STATE-RESTORE-HANDLING-IMPL-LIGHT` を即起票可能**、追加 design check は不要、impl 着手時に最終 message のみ運用者レビューを挟む）

**SAVE-UX state restore IMPL-LIGHT 実装着地**: `docs/notes/20260513_shogi_save_ux_status_map.md` §25 を参照（§24 design check の候補 A 採用 = `SAVE-UX-STATE-RESTORE-HANDLING-IMPL-LIGHT` 実装着地。`load()` ([shogi_v4.html:443-477](shogi_v4.html:443)、PARSE-LOAD-003 callsite [shogi_v4.html:470](shogi_v4.html:470)) に `anyFailure` フラグ + `notifySaveWarning({callsiteId:'PARSE-LOAD-003', kind:'storage-corrupted', aggregateKey:'storage-corrupted:state', severity:'warn'})` 呼出を追加。採用 message は第一候補「保存データを復元できなかったため、初期状態で起動しました。」。4 系統合計 callsite 数 21 → 22。判定境界: 初回起動（全キー null）では warn しない / 破損起源（getItem 例外 or JSON.parse 失敗）が 1 回以上発生し state 復元失敗時のみ warn / v4 失敗 → v3 成功（PARSE-LOAD-002A）は意図的に warn 対象外。テスト: `test/test_save_ux_parse_load_003.js`（新規、構造 8 + 振る舞い 7 = 全 15 アサート PASS）。aggregation / boot-safe 大改修 / LOAD-002 上位案 / FULL / error 昇格 / 復旧導線追加 / 外部送信は **やらない**。次は **運用観察**、その後必要に応じて `SAVE-UX-STORAGE-CORRUPTED-HANDLING-IMPL`（§16.9 案 B）/ `SAVE-UX-STATE-RESTORE-HANDLING-IMPL-FULL` / `SAVE-UX-LEGACY-FALLBACK-NOTIFY` 等を起票判断）

**SAVE-UX state restore 運用観察フェーズ**: `docs/notes/20260513_shogi_save_ux_status_map.md` §26 を参照（PR #97 着地後の **運用観察フェーズ整理**。docs-only。`SAVE-UX-STATE-RESTORE-OBSERVATION` = 追加実装にすぐ進まず、まずは現場 UX と発生条件を観察するフェーズに入ったことを明示。観察対象 5 件（A: 初回起動 no-warn 確認 / B: 破損起源全キー失敗時の warn 発火 / C: v4 失敗 → v3 成功は warn 対象外 / D: セッションごと最大 1 回 boot warn の体感頻度 / E: 採用文言「保存データを復元できなかったため、初期状態で起動しました。」の強さ）。追加実装着手条件 6 件（条件 1: warn 見落としで `SAVE-WARNING-VISIBILITY-LIFETIME` / 条件 2: v3 fallback 混乱で `LEGACY-FALLBACK-NOTIFY` / 条件 3: parse vs normalize 区別ニーズで `STORAGE-CORRUPTED-HANDLING-IMPL`（§16.9 案 B） / 条件 4: getItem 例外発生で `STATE-RESTORE-HANDLING-IMPL-FULL` / 条件 5: boot warn 過剰で aggregation tuning / 条件 6: 復旧導線必要で recovery guidance state 版）。当面やらないこと: PARSE-LOAD-001/002 個別 warn / FULL / notifySaveWarning 全体改修 / aggregation 大改修 / alert・modal / 自動復旧 / 外部送信・ログ送信 / 初回起動 warn / v3 fallback 後追い実装。次フェーズ候補優先順位: **第一候補 = 運用観察継続**（PR #97 で silent failure 最小対策完了 / 初回起動 no-warn 境界テスト済 / 現場で文言・頻度・見え方を見るべき）、第二〜第五は条件付きで `LEGACY-FALLBACK-NOTIFY` / `STORAGE-CORRUPTED-HANDLING-IMPL` / `STATE-RESTORE-HANDLING-IMPL-FULL` / `SAVE-WARNING-VISIBILITY-LIFETIME`。実装・テスト・CI 設定には触れず、後続実装タスクの着手も行わない）

**PAIRING-UX 手動組み合わせUX inventory**: `docs/notes/20260514_shogi_pairing_ux_inventory.md` を参照（**SAVE-UX state restore 系は §26（PR #98）で運用観察フェーズ入りしたため、次テーマとして PAIRING-UX に移行**。docs-only。`PAIRING-UX-INVENTORY` = 大会当日の手動組み合わせ UX 課題棚卸し。HEAD `6fb85e1`。§2 現状コード棚卸し: 表示 helper（`getName` [231](shogi_v4.html:231) / `entryNoOf` [243](shogi_v4.html:243) / `getNameWithNo` [277](shogi_v4.html:277) / `getWins` [293](shogi_v4.html:293)）、整合性 helper（`pairHasRematch` [307](shogi_v4.html:307) / `findPairContainingPlayer` [317](shogi_v4.html:317) / `getDuplicatePlayersInPairings` [327](shogi_v4.html:327) / `evaluatePairingQuality` [4384](shogi_v4.html:4384)）、生成 / 確定 / 編集（`generatePairing` [4513](shogi_v4.html:4513) / `buildChangePairingModalHtml` [4639](shogi_v4.html:4639) / `bindChangePairingModalEvents` [4665](shogi_v4.html:4665) / `changePairing` [4743](shogi_v4.html:4743) / `submitRound` [4757](shogi_v4.html:4757) / `buildCurrentPairingsHtml` [4868](shogi_v4.html:4868) / `editPastResult` [5059](shogi_v4.html:5059) / `printResults` [5464](shogi_v4.html:5464)）。重要観察: 「変更」モーダル 1 種類のみ / 未割当者リスト UI 無し / 候補検索・絞り込み無し / 全勝者特別扱い無し / デッドロック事前予兆無し / クラス + 支部 + 区分は表示文字列に未連結 / **警告バナーと判断材料の暫定成績が画面距離で離れている**（[buildCurrentPairingsHtml 4885](shogi_v4.html:4885) の警告 vs [buildScoreGridHtml 4822](shogi_v4.html:4822) の暫定成績、`renderTournament` [4961](shogi_v4.html:4961) で score-grid → 警告の順にレンダリングされスクロール往復が必要）。§3 現場課題 7 件（§3.1 苗字重複・同姓同名 / §3.2 大人数クラス選択負荷 / §3.3 全勝者×全勝者 / §3.4 デッドロック / §3.5 表示情報と個人情報 / §3.6 紙運営との接続 / **§3.7 警告と判断材料の画面距離**（2026-05-15 追補、現場観察「同勝数で組めた可能性のある異勝数ペア 1 件」警告が画面下部、勝敗数が上部 score-grid にしかなくスクロール必須））。§4 課題分類 A/B/C/D（A に「組み合わせ結果に勝敗数併記」「要確認メッセージに該当ペア情報を含める」「該当ペアのハイライト」「暫定成績へのジャンプリンク」、B に「同勝数で組めた候補の具体名表示」「異勝数ペア警告の根拠表示」、C に「要確認警告が出た場合の対応手順明文化」を追加）。§5 次タスク候補 6 件（DISPLAY-LABELS / UNASSIGNED-VISIBILITY / WINNER-CONFLICT-WARNING / DEADLOCK-INVENTORY / CARD-PUBLISH-CHECK / **WARNING-DECISION-SUPPORT** [新規]）。**推奨 Next Action は高優先度 2 件並列**: **第一候補 A = `PAIRING-UX-DISPLAY-LABELS`**（同姓識別・大人数クラスストレスに直結）、**第一候補 B = `PAIRING-UX-WARNING-DECISION-SUPPORT`**（大会中に実際に確認負荷発生、警告近くに判断材料を表示し運営者がスクロール不要で妥当性確認、第 1 段ペアカード勝敗数併記 / 第 2 段警告本文に該当ペア / 第 3 段ハイライト・ジャンプ / 第 4 段候補名表示の段階構成）、第二 = `UNASSIGNED-VISIBILITY`、第三 = `DEADLOCK-INVENTORY`。両第一候補は表示 helper を共有でき並走可能。今回は実装変更なし / テスト変更なし / 後続タスク着手なし）

**PAIRING-UX 要確認警告の判断材料表示設計**: `docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md` を参照（PR #99 PAIRING-UX-INVENTORY §3.7 / §5.6 を受けた docs-only design check。`PAIRING-UX-WARNING-DECISION-SUPPORT-DESIGN` = 「要確認」警告と判断材料の画面距離問題に対する段階実装方針を整理。HEAD `2441060`。§2 現状コード確認: `evaluatePairingQuality` ([shogi_v4.html:4384](shogi_v4.html:4384)) の戻り値 `{totalWinDiff, maxWinDiff, sameScorePairCount, rematchCount, avoidableWinDiffPairs, warningHit, pairDetails}` に **`wins{}` / `history{}` / `avoidablePairIndexes` / 候補名は含まれない**（内部の `groups` / `canMatchInternally()` バックトラックに閉じている）/ 警告バナー [4880-4888](shogi_v4.html:4880) は件数のみ / 個別 `[要確認]` ラベル [4496](shogi_v4.html:4496) は `winDiff>0` 全ペアに付く（avoidable 特定ではない）/ `renderTournament` [4961](shogi_v4.html:4961) は score-grid → played-history → past-results → current-pairings の順で警告は最下部 / pairing-card [4902-4919](shogi_v4.html:4902) には勝敗数が表示されていない（score-card [4827](shogi_v4.html:4827) との非対称）/ `buildCurrentPairingsHtml` に `wins` が渡っていない。§3 問題定義: 警告と判断材料の画面距離 / どのペア・勝敗差・候補が分からない / 無視リスクと過剰不安リスク / 「判断支援」ではなく「注意喚起」に留まる。§4 判断材料候補 6 件（A 該当ペア名 / B 勝敗数 / C 同勝数候補名 / D ハイライト / E ジャンプリンク / F 理由補足）。§5 実装段階案: **Phase 1 勝敗数併記 + 理由補足**（warning obj 改修なし、小規模）/ **Phase 2 警告本文に該当ペア**（`avoidablePairIndexes` 追加、中規模、`[要確認]` 過剰付与問題も解消）/ **Phase 3 ハイライト・ジャンプ**（DOM id 付与、中規模）/ **Phase 4 同勝数候補名表示**（`canMatchInternally` 候補保持版へ改修、大規模、誤解リスクあり、要design確認）。§6 課題分類 A/B/C/D。§7 DISPLAY-LABELS との関係: 共通基盤は **参加者表示 helper**（`getDisplayLabelForPairing(id, cls, options)` 仮称、options に `withWins / withBranch / withMemberKind / withPlayedMarker / withWinMarker / forPublic`）、勝敗数併記は WARNING 側 Phase 1 必須・DISPLAY-LABELS 側任意、helper を先に設計すると両タスクの実装が直交化、個人情報配慮は `forPublic` フラグで分離。§8 推奨 Next Action: **第一候補 = `PAIRING-UX-DISPLAY-HELPER-DESIGN`**（両タスクの共通基盤 helper を docs-only で設計、個人情報範囲も先決）、第二 = `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`（Phase 1 のみ、勝敗数併記 + 理由補足、warning obj 不変）、第三 = `PAIRING-UX-DISPLAY-LABELS-DESIGN`（モーダル候補 list / 行内表示 / マーカー）。今回は warning obj / `evaluatePairingQuality` を変更しない / 実装変更なし / テスト変更なし / 後続タスク着手なし）

**PAIRING-UX 参加者表示helper設計**: `docs/notes/20260514_shogi_pairing_ux_display_helper_design.md` を参照（PR #99 / #100 を受けた docs-only design check。`PAIRING-UX-DISPLAY-HELPER-DESIGN` = `DISPLAY-LABELS` と `WARNING-DECISION-SUPPORT` の共通基盤となる参加者表示 helper を設計。HEAD `5490714`。§2 現状コード確認の重要発見: **本アプリは「沼津支部 月例将棋大会」運営ツール = 単一支部運営**（[shogi_v4.html:6](shogi_v4.html:6) / [91](shogi_v4.html:91)）なので **`state.players[cls]` に「支部名」フィールドは存在しない** — 過去 PR #99 §3.1 / #100 §7 で「支部」と書かれていた情報は正しくは **「支部員区分（支部員 / 他）」**（`player.member` = `'member'` / `'other'`、normalizeState [342](shogi_v4.html:342) / [354](shogi_v4.html:354)）を指す。参加者 fields: `id` / `name` / `cls` / `entry_no`（欠番維持、A-5.1 §11.8）/ `member` / `grade`（`'ippan'`/`'chu'`）/ `member_id`。既存表示 helper: `getName` [231](shogi_v4.html:231)（氏名のみ、印刷用）/ `entryNoOf` [243](shogi_v4.html:243)（2 桁 0 埋め、欠番時 index+1 fallback）/ `getNameWithNo` [277](shogi_v4.html:277)（`01｜山田太郎` の主軸フォーマット）/ `getWins` [293](shogi_v4.html:293)。クラス文字を含む独自フォーマットは bulk edit modal [3727](shogi_v4.html:3727) の `A07` のみ。住所・電話は state にも保持されていない。§3 表示対象 13 種を個人情報レベル付きで整理。§4 表示モード 4 案: **compact**（スマホ / 候補一覧 / 警告内、12〜18 全角、entryNo + 氏名、勝敗数 optional）/ **standard**（pairing-card / 警告本文、18〜30 全角、勝敗数 default ON、支部員区分 optional）/ detail（モーダル / hover、複数行、IMPL-LIGHT 範囲外）/ print/card（参加者配布物、最小限、IMPL-LIGHT 範囲外）。§5 audience 切替（`operator` / `participant` / `print`）、デフォルト `operator`。§6 個人情報配慮: 氏名は基本単位 / 支部員区分・年齢区分は同姓識別目的のみ / 住所・会費・連絡先は手動組み合わせ UX で出さない / 参加者向け配布物は氏名 + 卓番号原則 / デフォルトは最小情報で opt-in。§7 helper API 候補（`formatParticipantLabel(player, options)` または `(playerId, cls, options)`、options に `mode / audience / includeClass / includeEntryNo / includeRecord / includeMemberKind / includeGrade / includeOpponentHistory / recordContext / maxLength / mobileCompact`、戻り値 string / object、**確定はしない**）。§8 / §9 DISPLAY-LABELS / WARNING-DECISION-SUPPORT との接続、共有可能性を整理。§10 推奨 Next Action: **第一候補 = `PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT`**（compact + standard のみ、+50〜100 行 helper + テスト、`audience` / `privacyLevel` / `warnings` は docs に留めて過剰実装しない、既存 `getName` / `getNameWithNo` を破壊しない並存設計、新 callsite から段階移行）、第二 = `PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`（helper 着地後、Phase 1 のみ、warning obj 不変）、第三 = `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`（helper 着地後、変更モーダル option + 行内表示）。今回は helper API 確定しない / detail mode・print mode 実装しない / warning obj / `evaluatePairingQuality` 不変 / 既存 `getName` / `getNameWithNo` 削除しない / 実装変更なし / テスト変更なし / 後続タスク着手なし）

**PAIRING-UX 参加者表示helper IMPL-LIGHT 実装着地**: `docs/notes/20260514_shogi_pairing_ux_display_helper_design.md` §14 を参照（PR #101 DISPLAY-HELPER-DESIGN §10.1 第一候補 = `PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT` 着地。HEAD `dda0c29`。**実装関数**: `formatParticipantLabel(player, options)` を [shogi_v4.html:281-325](shogi_v4.html:281) に追加（`getNameWithNo` [277](shogi_v4.html:277) と `getFee` の間、+45 行）。採用 options（最小版）: `mode: 'compact' | 'standard'` (default `'compact'`) / `includeRecord: boolean` / `record: {wins, losses}` / `includeCategory: boolean`（standard のみ有効）。**表示フォーマット**: compact = `A-12 山田太郎` / compact + record = `A-12 山田太郎（2勝0敗）` / standard = `A-12 山田太郎` / standard + category(member) = `A-12 山田太郎（沼津支部員）` / standard + category(other) = `A-03 鈴木一郎（他）` / standard + record = `A-12 山田太郎（2勝0敗）` / standard + category + record = `A-12 山田太郎（沼津支部員 / 2勝0敗）`。category 表記: `member` → `沼津支部員` / `other` → `他` / 未設定 → category 部を出さない（undefined/null 文字列が混入しないことをテストで保証）。**「支部名」は出さない**（単一支部前提、`player.branch` 等を参照しないことをテストで保証）。安全側挙動: 不正 `player`（null/undefined/string）→ 空文字、`entry_no` 未設定 → `'--'` フォールバック、`mode` 省略 → compact、`compact` で `includeCategory:true` でも category は出ない、`record` 型不正 → record 部を出さない、戻り値は HTML escape 前のプレーン文字列（callsite で `escapeHtml()` を通す既存流儀を踏襲）。**UI 適用範囲**: **A 案採用 — helper 追加 + テスト追加のみ、既存 UI への配線は行わない**。**不変項目**: `warning object` / `evaluatePairingQuality()` ([4384](shogi_v4.html:4384)) 未変更 / 既存 `getName` ([231](shogi_v4.html:231)) / `getNameWithNo` ([277](shogi_v4.html:277)) / `entryNoOf` ([243](shogi_v4.html:243)) 未変更（並存）/ detail・print/card mode 未実装 / audience・privacyLevel・warnings フィールド未実装 / 自動組み合わせ・対戦履歴・SAVE-UX 関連 未変更 / forbidden files (`docs/specs/` / `.github/workflows/` / `package*.json` / `playwright.config.js`) 未変更。**テスト**: `test/test_pairing_ux_display_helper.js`（新規、構造 5 + 振る舞い 18 = 全 23 アサート PASS）、`test/run_tests.sh` に起動 stanza 追加、既存 46 テスト合わせて全 69 アサート PASS。次は **`PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT`**（Phase 1、helper を pairing-card に配線 + 警告本文に理由補足、warning obj 不変）または **`PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`**（変更モーダル option + 行内表示、`includeCategory` は同姓識別 opt-in）の起票判断）

**PAIRING-UX 要確認警告の判断材料表示 IMPL-LIGHT 実装着地**: `docs/notes/20260514_shogi_pairing_ux_warning_decision_support_design.md` §12 を参照（PR #100 §5.1 Phase 1 着地。HEAD `879b387`。**実装範囲は Phase 1 のみ**: pairing-card に勝敗数併記 + 警告バナー近くに短い理由補足。Phase 2 / 3 / 4 は未実装。**実装場所**: [`buildCurrentPairingsHtml`](shogi_v4.html:4914)。各 winner-btn の直下に `data-pairing-aux="p1"` / `"p2"` 属性付きの補助ラベル要素を追加し、`formatParticipantLabel(player, {mode:'standard', includeRecord:true, record:{wins, losses}})` の出力（例: `A-12 山田太郎（2勝0敗）`）を表示。既存 button テキスト（`getNameWithNo()` = `01｜山田太郎`）は維持（`width:7em` 制約を温存）。`escapeHtml()` 経由で出力。**warning 補足**: 既存警告バナー内に `avoidableWinDiffPairs > 0` または `maxWinDiff >= 2` のときのみ「勝敗数が異なるペアがあります。各対局カードに表示された勝敗数を確認してください。」を 1 行追加（rematch 単独警告には出さない）。**準備データ**: `getWins(cls)` + `state.results[cls]` 走査による totals 集計 + id→player マップを描画ループ前に 1 回計算。**不変項目**: `warning object` 未変更（`avoidablePairIndexes` / `avoidableWinDiffCandidates` / `sameWinGroupCandidates` 等を追加していない）/ `evaluatePairingQuality()` ([4384](shogi_v4.html:4384)) 本体 / 戻り値 7 フィールド / `canMatchInternally` / `forcedMixed` / `oddGroupCount` 未変更 / 既存 `getName` ([231](shogi_v4.html:231)) / `getNameWithNo` ([277](shogi_v4.html:277)) / `entryNoOf` ([243](shogi_v4.html:243)) / `formatParticipantLabel` 本体 未変更 / pairing-card の `winner-btn` / 変更ボタン / 卓番号バッジ構造維持 / `player.branch` / `state.branches` 不参照（単一支部前提）/ CSS class 定義未変更（インラインスタイルのみ）/ detail・print mode / privacyLevel / ariaLabel 未実装 / 自動組み合わせ・対戦履歴・SAVE-UX 関連 未変更 / forbidden files 未変更。**helper の初 UI 配線**: 本 PR で `formatParticipantLabel` が UI に配線された最初の callsite が確定（pairing-card 補助ラベル、`includeCategory` は使わず勝敗数のみ）。**テスト**: `test/test_pairing_ux_warning_decision_support.js`（新規、静的検査 49 アサート PASS、`formatParticipantLabel` 呼出の options 検査 / 戻り値の従来フィールド存続 / 補足条件の判定 / トーン検査 / data-pairing-aux 要素 / escapeHtml 経由など）、`test/run_tests.sh` に起動 stanza 追加。既存 + 新規合わせて **全 70 アサート PASS**。次は **運用観察**（Phase 1 の効果を見る）、必要に応じて Phase 2（`avoidablePairIndexes` 追加、警告本文に該当ペア展開）または `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`（モーダル option / 行内表示）の起票判断）

**PAIRING-UX 暫定成績 / 対戦済みリスト 読みやすさ設計**: `docs/notes/20260515_shogi_pairing_ux_score_list_readability_design.md` を参照（PR #103 着地後の docs-only design check。HEAD `ceb9f6e`。**現状コード**: `renderTournament(cls)` ([shogi_v4.html:5059](shogi_v4.html:5059)) の sorted は **勝数降順**（[5067](shogi_v4.html:5067) `(wins[b.id]||0)-(wins[a.id]||0)`）、**同勝数内 tie-break は未明示**（`Array.prototype.sort` の stable sort で `players.slice()` 配列順頼り、配列順は entry_no と必ずしも一致しない）。暫定成績 `buildScoreGridHtml` ([4868](shogi_v4.html:4868)) と対戦済みリスト `buildPlayedHistoryHtml` ([4879](shogi_v4.html:4879)) は **同じ sorted を共有** → 両者の外側並び順は常に一致 = 勝数降順。対戦相手タグの順序は `state.results` ラウンド順走査による push 順 = ラウンド順（winner 未確定 match は除外）。**問題**: 暫定成績 `.sname` は `getNameWithNo()` = `'01｜山田太郎'` の **1 文字列**、CSS `.score-card .sname` に `word-break` / `overflow-wrap` 未指定 → 80px 幅の score-card で **任意位置で折り返し**（`01｜山` / `田太郎` のように番号と氏名が分断される）。`.score-grid` は `auto-fit, minmax(80px, 1fr)`。PR #103 pairing-card 補助ラベル（`A-12 山田太郎（2勝0敗）`）と書式非対称。score-card の `total` 計算 ([4872](shogi_v4.html:4872)) には winner guard なし（PR #103 `pcTotals` と挙動非対称、別タスクのスコープ）。**推奨方針（IMPL-LIGHT 用、本 PR では実装しない）**: 暫定成績 §4.1 候補 C = **勝数降順 + 同勝数内 entry_no 順**（1 次キー wins desc / 2 次キー entry_no asc）/ 暫定成績カードは §3.2 案 B = **番号と氏名を別行表示**（`.sno` / `.snm` 要素分離、書式は `A-12` + `山田太郎` で pairing-card と整合）/ 対戦済みリスト §4.2 候補 A + C = **同じ sorted 維持 + 見出しに「勝数順」明示**（切替 UI 候補 D は IMPL-LIGHT には過剰）/ 対戦相手タグはラウンド順維持。**次タスク候補**: 第一 = **`PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT`**（renderTournament sort 2 次キー / buildScoreGridHtml 別要素 + CSS / buildPlayedHistoryHtml 見出し、Visual Regression snapshot 更新を伴う、+30〜60 行）、第二 = `PAIRING-UX-PLAYED-LIST-ORDER-IMPL-LIGHT`（観察後）、第三 = `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`（独立進行可）、後回し = 切替 UI design / score-card winner guard / WARNING Phase 2。**不変項目（IMPL-LIGHT 想定の範囲外）**: `getNameWithNo` / `entryNoOf` / `getName` / `formatParticipantLabel` 本体 / `evaluatePairingQuality` / warning object / state.players 配列順物理改変 / calcFinal / renderResults / printResults / buildPastResultsHtml / buildCurrentPairingsHtml 主要構造。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files 未変更 / 後続タスク着手なし）

**PAIRING-UX 暫定成績 / 対戦済みリスト 読みやすさ IMPL-LIGHT 実装着地**: `docs/notes/20260515_shogi_pairing_ux_score_list_readability_design.md` §12 を参照（PR #104 §8.1 第一候補 = `PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT` 着手 Draft PR。HEAD `6f325bf`。**実装内容**: (1) [`renderTournament`](shogi_v4.html:5067) の sorted 比較関数を **2 段化**（1 次キー wins desc / 2 次キー entry_no asc、entry_no 未設定 / 0 / 負値 / 非 number は `Infinity` で末尾送り）/ (2) [`buildScoreGridHtml`](shogi_v4.html:4868) の score-card で `.sname` 1 要素 → **`.sno`（番号、`A-12` 形式）+ `.snm`（氏名）の 2 要素別行表示**（`entryNoOf` / `getName` 直接呼出、両方 `escapeHtml` 経由）/ (3) [`buildPlayedHistoryHtml`](shogi_v4.html:4879) の見出しに **「（勝数順）」明示** + 「※ 暫定成績と同じ勝数順で表示しています。対戦相手はラウンド順です。」の補足を追加。**CSS 追加**: `.score-card .sno{font-size:11px;color:#1F3864;font-weight:500;white-space:nowrap;margin-bottom:2px}` / `.score-card .snm{font-size:12px;font-weight:500;line-height:1.3;word-break:break-word;margin-bottom:2px}` の 2 ルールのみ。既存 `.sname` ルールは温存（dead code 化、削除せず）。`.score-grid` / `.score-card` レイアウトは未変更。**不変項目**: `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` 本体 未変更 / `getNameWithNo` 他 callsite（変更モーダル / 対戦履歴行頭 / 過去結果 等）未改修（全置換していない、呼出 12 件残存）/ `evaluatePairingQuality()` / `warning object` 構造 未変更 / pairing-card 補助ラベル（`data-pairing-aux`、PR #103）未変更 / `generatePairing()` 内 sort ([4580](shogi_v4.html:4580)) / ランダム化ロジック 未変更（同勝数群 Fisher-Yates シャッフル維持）/ `state.players` 配列順物理改変なし / `calcFinal` / `renderResults` / `printResults` / `buildPastResultsHtml` / `buildCurrentPairingsHtml` 主要構造 未変更 / 切替 UI 未実装 / 対戦済みリスト独自 sort 未実装 / forbidden files 未変更。**テスト**: `test/test_pairing_ux_score_list_readability.js`（新規、構造 + 振る舞い計 54 アサート PASS）+ `test/run_tests.sh` stanza。既存 70 + 新規 54 = **全 71 stanza PASS（合計 137 個別アサート相当）**。**Visual Regression 影響**: 暫定成績カードの構造変化により snapshot mismatch が想定される → **Draft PR 作成後の CI 確認で red になった場合は自律更新せず、ユーザー判断を仰ぐ**（PR #103 の流れ）。**次タスク候補**: 第一 = **運用観察**（新表示が現場で読みやすいか / 同勝数 entry_no 順が予測可能か / スマホ表示で破綻しないか）、第二 = `PAIRING-UX-PLAYED-LIST-ORDER-IMPL-LIGHT`（観察後）、第三 = `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`（独立進行可）。Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT 未着手 / Codex・cowork review 自律実行なし）

**PAIRING-UX 手動変更候補フィルタ IMPL-LIGHT 実装着地**: `docs/notes/20260515_shogi_pairing_ux_manual_change_candidate_filter_design.md` §17 を参照（PR #108 §9 第一候補 = `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT` 着手 Draft PR。HEAD `132684f`（PR #108 squash merge 後の main）から派生。**実装内容**: (1) [`classifyChangePairingCandidate(cls, idx, candidateId, role)`](shogi_v4.html:392) 新設（`pairHasRematch` / `findPairContainingPlayer` 直後、戻り値 `{ status:'ok'|'blocked', reasonId, reasonLabel }`、既存事後判定と同じ helper を共有）/ (2) [`buildChangePairingModalHtml`](shogi_v4.html:4730) を `buildSelectInner(role, selectedId)` 内部 helper で optgroup 2 段化（`<optgroup label="選択可能">` / `<optgroup label="選択できない候補">`、後者は `disabled` + `data-reason-id` + 短い理由ラベル `（結果入力済）` / `（入替で再戦）` / `（2人同時入替）`、`escapeHtml` 経由）/ (3) **候補 0 人案内**: `hasAlternative = (sel1.okCount>1)||(sel2.okCount>1)` で判定、該当時に `data-chg-empty-notice="1"` の薄黄ブロックを「現在の対局」表示直下に挿入、文言「現在の条件では、1人だけ入れ替えできる候補がありません。別の対局を選ぶか、組み合わせ全体を見直してください。」+ 「変更を保存」ボタン `disabled` + グレースタイル。**R-current は導入しない**（戻り値型に出現せず、shogi_v4.html 全体で `'R-current'` 文字列ゼロ）/ 現 p1 / p2 は `status:'ok'` + `reasonId:null` + `reasonLabel:''` + `selected` + 非 disabled + 理由ラベルなし（PR #108 §7.1.1 確定）/ 差分なし保存は既存 `alert('変更がありません')` に任せる。**設計との差分**: replace 再戦の selectable + 注釈 `（選ぶと再戦）` は **IMPL-LIGHT では候補表示側で扱わず**、既存 confirm に任せる（PR #108 §3.4 末尾の許容差分通り、実装簡略化のため後続観察送り）。swap 再戦のみ事前 disabled で hard block。**不変項目**: PR #107 の `data-chg-current` / `resetSelectsToOriginal` / 改善文言 すべて温存 / 既存 alert / confirm（変更がありません / 同じ選手 / 2人同時入替 / 結果入力済 / 再戦 / 内部重複 rollback）全て残存 / `state.pairings` 代入位置 / `save()` / `renderTournament(cls)` 呼出設計 未変更 / `evaluatePairingQuality()` / `warning object` 未変更 / `generatePairing` / Fisher-Yates 未変更 / `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` / `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` 本体 未変更 / PR #103 pairing-card 補助ラベル（`data-pairing-aux`）未変更 / PR #105 score-card `.sno`/`.snm` 未変更 / select 廃止せず native select 維持。**含めない**: select 廃止 / 動的再計算（もう片方 select change 時）/ 詳細理由パネル / 変更前後差分表示 / 推薦 / 状態機械化 / 複数選手同時変更 / 例外許可トグル / replace 再戦 selectable 注釈 / DISPLAY-LABELS-IMPL-LIGHT / WARNING Phase 2〜4。**テスト**: `test/test_pairing_ux_manual_change_candidate_filter.js`（新規、73 アサート PASS、静的検査 + 振る舞いテスト 7 ケース mock state 経由）+ `test/run_tests.sh` stanza。既存 72 + 新規 1 = **全 73 stanza PASS**。**Visual Regression 影響見込み**: モーダル open 状態の VRT は既存スイートで撮っていない見込み、red になりにくい。red になった場合は自律 snapshot 更新せず判断を仰ぐ。**後続観察ポイント**: disabled option / optgroup の iOS Safari / Android Chrome / iPad Safari 視認性、「2人同時入替」「結果入力済」等の事前 disabled 表示頻度、事後 alert への到達回数の減少、候補 0 人案内発動頻度。**次タスク候補**: 第一 = **運用観察**、第二 = `IMPL-MEDIUM`（動的再計算 / 詳細理由パネル）または **案 A 縮退**（スマホで読みにくい場合、下部理由リスト併記へ）、第三 = `CONTROL`（例外許可トグル）、第四 = `DISPLAY-LABELS-IMPL-LIGHT`。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / Codex・cowork review 自律実行なし / VRT snapshot 更新なし / threshold 緩和なし / skip なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / DISPLAY-LABELS-IMPL-LIGHT 未着手 / WARNING Phase 2〜4 未着手 / 対戦済みリスト番号順化 未着手 / 後続タスク未着手）

**PAIRING-UX 手動変更候補フィルタ 理由ラベル文言修正**: `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-REASON-LABEL-FIX` 着手 Draft PR。HEAD `8c8841d`（PR #109 squash merge 後の main）から派生。**現場課題**: PR #109 で導入した「選択できない候補」optgroup の理由ラベルのうち、`R-self` の `（2人同時入替）` は実態（同一選手を先手後手両方に選ぼうとしている状態）が伝わらず、`R-rematch-swap` の `（入替で再戦）` は内部判定名に近く運営者には不直感。**変更内容**: [`classifyChangePairingCandidate`](shogi_v4.html:411) の `R-self.reasonLabel` を `2人同時入替` → `同じ選手` に、[同 L427](shogi_v4.html:427) の `R-rematch-swap.reasonLabel` を `入替で再戦` → `再戦になる` に変更。`R-winner-locked`（`結果入力済`）/ `R-invalid` / `R-other`（`選択不可`）は現状維持。`buildChangePairingModalHtml` ヘッダコメント（[L4733](shogi_v4.html:4733)）も新文言に追従。**ロジック未変更**: `classifyChangePairingCandidate` の判定条件・disabled 化条件・優先順位・戻り値型 / `buildChangePairingModalHtml` の optgroup 構造（`選択可能` / `選択できない候補`）/ disabled + `data-reason-id` 出力 / `escapeHtml` 経由 / 候補 0 人案内 / 保存ボタン disabled / `hasAlternative` 判定 / `resetSelectsToOriginal` / 「現在の対局」表示 / `state.pairings` 代入位置 / `save()` / `renderTournament(cls)` / `evaluatePairingQuality()` / `warning object` / `generatePairing` / Fisher-Yates / 既存 helper 本体（`pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` / `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel`）/ `bindChangePairingModalEvents` の事後 alert / confirm（同じ選手 / 変更がありません / 相手ペア結果入力済 / 再戦 confirm / 内部エラー rollback）/ `R-current` 未導入維持。**テスト更新**: `test/test_pairing_ux_manual_change_candidate_filter.js` の §4 期待値（`入替で再戦` → `再戦になる` / `2人同時入替` → `同じ選手`）と §16-b/§16-d の振る舞いテスト reasonLabel 期待値、再現実装の reasonLabel リテラルを新文言に更新。`test/e2e/shogi_phase4_pairing_swap.spec.js` の `pcOption` `toContainText('入替で再戦')` を `toContainText('再戦になる')` に更新。`docs/notes/20260515_shogi_pairing_ux_manual_change_candidate_filter_design.md` の §6.4 / §7.2 / §7.5 / §10.2.1 / §17 表 / §17.4 の理由ラベル例も新文言に追従（design 方針自体は不変）。**全 73 unit stanza PASS / 対象 E2E 8/8 PASS / git diff --check clean**。**Visual Regression 影響見込み**: モーダル open 状態の VRT は既存スイートで撮っていない見込み、red になりにくい。red になった場合は自律 snapshot 更新せず判断を仰ぐ。**次タスク候補**: PR #109 の **運用観察**（新文言で disabled 候補の意味が運営者に伝わるか、事後 alert 到達回数が更に減るか）。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / threshold 緩和なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / 後続タスク未着手。

**RECEPTION-UX 大会開始ボタン再実行ガード IMPL-LIGHT 実装着地**: `docs/notes/20260515_shogi_reception_ux_start_button_guard_design.md` §17 を参照（PR #111 §9.1 = `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT` 着手 Draft PR。HEAD `5625e1f`（PR #111 squash merge 後の main）から派生。**実装内容**: [`startTournament`](shogi_v4.html:4429) の `total` 算出直後・人数チェック / 奇数チェック / 既存 `hasOngoing` confirm より前に `if(state.started===true){ alert(...); return; }` を 1 個追加。**alert 文言**: 「大会はすでに開始されています。\n参加者を変更する場合は、先に「大会データをリセット」を実行してください。\n大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。」（§7.2 推奨をそのまま採用、「参加者一覧は残ります」は `resetAll` 現仕様で `state.players` も空になるため明記せず、`#resetBtn` 文言「大会データをリセット」と語彙整合）。**早期 return で到達しなくなる処理**: `state.results = {A:[],B:[]}` / `state.pairings = {A:[],B:[]}` / `generatePairing('A')`/`('B')` / `showTab('tournament')` / `save()` / SAVE-003 verify。**不変項目**: 既存 `hasOngoing` confirm 経路（fail-safe として温存、`state.started=false` で pairings/results のみ残る異常データ対応）/ `state.started=true` 代入位置 / [`resetAll`](shogi_v4.html:5904) の `started:false` + `players:{A:[],B:[]}` 全 state 初期化（参加者も空にする現仕様）/ [`removePlayer`](shogi_v4.html:3760) の一次禁止（pairings メンバーシップ）/ 二次禁止（`state.started && pastMatches>0`）alert + 文言 / `normalizeState` の `base.started=!!s.started` / `STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `generatePairing` / Fisher-Yates / `evaluatePairingQuality` / `warning object` / `#startBtn` の DOM・文言・disabled 状態（VRT snapshot 不変見込み）。**含めない**: ボタン文言切替（IMPL-MEDIUM 案 D）/ disabled 化（案 B）/ 参加者を残すリセット / 結果だけ消す機能 / 再開始ウィザード（案 E）/ state machine 化 / localStorage schema 変更 / pairing algorithm 変更 / `resetAll` 文言改善 / `removePlayer` 文言改修 / WARNING Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT。**テスト**: `test/test_reception_ux_start_button_guard.js`（新規、静的検査 + 軽量 mock 振る舞いテスト 63 アサート PASS、guard 位置・alert 文言主要語句・「参加者一覧は残ります」非含有・state 不変・通常経路維持・resetAll / removePlayer / normalizeState 未変更を確認）+ `test/run_tests.sh` stanza。既存 73 + 新規 1 stanza = **全 74 stanza PASS / FAIL=0 / WARN=0**。**Visual Regression 影響見込み**: DOM・ボタン文言・disabled 状態すべて不変 → snapshot 不変見込み（red になった場合は自律更新せず判断を仰ぐ）。**E2E**: 追加なし（既存 E2E はすべて未開始 state から `startTournament` を呼ぶシナリオのみ、影響なし見込み）。**次タスク候補**: 第一 = **運用観察**（alert で `resetAll` 誘導が機能するか、再クリック事故が消えるか）、第二 = `RECEPTION-UX-START-BUTTON-GUARD-IMPL-MEDIUM`（案 D ボタン文言切替）、第三 = `RESET-UX-PARTIAL-RESET-DESIGN`（参加者を残してデータだけリセット）、第四 = `RECEPTION-UX-RESTART-WIZARD-DESIGN`（案 E）。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / threshold 緩和なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / index.html・data/ 変更なし / resetAll 仕様変更なし / removePlayer 仕様変更なし / localStorage schema 変更なし / pairing algorithm 変更なし / 後続タスク未着手。

**RECEPTION-UX 大会開始ボタン再実行ガード設計**: `docs/notes/20260515_shogi_reception_ux_start_button_guard_design.md` を参照（PR #110 着地後の docs-only design check。HEAD `a88f026`。**現場違和感**: 対局進行中（2 局目程度）に参加者登録画面の「登録完了・対局開始」を再クリックすると confirm「現在の結果が消えます」を経て **`state.results` 全消去 + `state.pairings` 全消去 + `generatePairing` で R1 再生成** が走る一方、参加者削除は新生成 pairings に居るため依然不可、運営者から見ると「結果は消えたのに削除できない」「『大会データをリセット』との違いが分からない」混乱が残る。**現状コード確認**: [`startTournament`](shogi_v4.html:4429) の confirm 文言は results 消去のみ示唆し pairings 再生成は明示していない / `state.pairings={A:[],B:[]}` → `generatePairing(cls)` の二段で実質「R1 ペアの完全な書き換え」/ [`removePlayer`](shogi_v4.html:3760) の一次禁止判定は `state.pairings[cls]` メンバーシップのみ（再生成後も hit）、二次禁止判定は `state.started && pastMatches>0`（results 消去後は無効化）/ [`resetAll`](shogi_v4.html:5891) は `state.players` も含めて全消去（参加者を残してデータだけ消す機能は **現状存在しない**）。**大会開始済み判定**: `state.started === true` 単独を IMPL-LIGHT 推奨（`startTournament` で立ち `resetAll` で false に戻る、既存の load 後復帰 / 削除二次禁止 / `hasOngoing` confirm の主軸と一致、防御的 pairings 併用は IMPL-MEDIUM 候補）。**案 A〜E 比較**: A 現状維持（事故リスク）/ B disabled（理由不明問題）/ **C 押下時 alert + 早期 return（推奨第一）** / D ボタン文言切替（IMPL-MEDIUM 候補）/ E 再開始ウィザード（別タスク）。**推奨文言**: 「大会はすでに開始されています。\n参加者を変更する場合は、先に「大会データをリセット」を実行してください。\n大会データをリセットすると、現在の組み合わせ・勝敗結果は削除されます。」 — **「参加者一覧は残ります」は書かない**（`resetAll` 現仕様で `state.players` も空になるため誤誘導回避、§7.3）。**IMPL-LIGHT スコープ**: `startTournament` の参加者人数チェック直後に `if(state.started===true){ alert(...); return; }` を 1 個追加（state 不変 / save() 呼ばず / showTab() 呼ばず / `hasOngoing` confirm 経路は安全網として温存）+ 軽量テスト 1 本 + run_tests.sh stanza。**含めない**: `resetAll` 仕様変更 / 「結果だけ消す」「pairings だけ組み直す」専用機能 / `removePlayer` 判定変更 / ボタン文言切替・disabled / 再開始ウィザード / state machine 化 / localStorage schema 変更 / pairing algorithm 変更 / `evaluatePairingQuality` / 既存 helper 変更。**リスク**: 開始判定が強すぎ→`state.started===true` のみで開始前は弾かれない / 弱すぎ→JSON load 後も `normalizeState` 経由で復元 / 文言怖すぎ→3 行・事実ベース・既存リセット誘導文言と語彙整合 / 「参加者一覧残る」誤誘導→§7.3 で書かない方針 / 押せる見た目→IMPL-LIGHT は意図的に DOM 不変（VRT・E2E 影響ゼロ）。**Visual Regression 影響見込み**: DOM 変更なし、ボタン文言不変、disabled 化なし → snapshot 不変見込み。**次タスク候補**: 第一 = `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT`（即起票可、+5〜10 行 + 軽量テスト）、第二 = 運用観察（alert で `resetAll` 誘導が機能するか）、第三 = `RECEPTION-UX-START-BUTTON-GUARD-IMPL-MEDIUM`（案 D ボタン文言切替）、第四 = `RESET-UX-PARTIAL-RESET-DESIGN`（参加者を残してデータだけリセット）、第五 = `RECEPTION-UX-RESTART-WIZARD-DESIGN`（案 E）。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files 未変更 / Codex・cowork review 自律実行なし / DISPLAY-LABELS-IMPL-LIGHT 未着手 / WARNING Phase 2〜4 未着手 / CANDIDATE-FILTER 後続タスク未着手 / 後続実装タスク着手なし）

**PAIRING-UX 手動変更候補フィルタ設計**: `docs/notes/20260515_shogi_pairing_ux_manual_change_candidate_filter_design.md` を参照（PR #107 着地後の docs-only design check。HEAD `5f63219`。**現場課題**: PR #107 でエラー文言・現在の対局表示・select reset は改善済だが、プルダウンには `state.players[cls]` 全員が表示される構造のため、運営者は「どれを選んでもエラーになる」体感が残る。**現状コード確認**: [`changePairing`](shogi_v4.html:4825) が `state.players[cls]`（クラス全員）を **無条件で `<select>` に流している**（[`buildChangePairingModalHtml`](shogi_v4.html:4689) はフィルタなし、先手 / 後手 select は同一候補集合を共有）。事後判定は [`bindChangePairingModalEvents`](shogi_v4.html:4732) の click handler で 6 種類（同一選手 / 差分なし / 2 選手同時 / winner-locked / 再戦 / 内部重複）。**replace / swap の非対称**: replace 経路（候補が他ペアに属さない、L4763-4766）は **再戦時 `confirm` で続行可能** = warning、swap 経路（候補が他ペアに属す、L4778-4782）は **再戦時 alert + return の hard block** = error。PR #106 / #107 docs では warning と呼んでいたものが実装上は hard block。**案 A〜E 比較**: A. 選択可能のみ表示（透明性低）/ B. 全員 + disabled + 理由（見づらいリスク）/ C. **optgroup 上下分離**（推奨）/ D. 文言のみ（PR #107 既着地、根本解決不足）/ E. トグル切替（IMPL-MEDIUM）。**推奨案**: **案 C + 案 B のハイブリッド** = `<optgroup label="選択可能">` と `<optgroup label="選択できない候補">` に分け、後者は `disabled` + 短い理由ラベル（8〜12 文字目安、`A-18 佐藤一郎（選ぶと再戦）` 等）。native select 維持 / 候補は完全には消さない / 既存事後判定は安全網として残す。スマホで disabled option / optgroup が読みにくい場合は **案 A 縮退**（モーダル下部に理由リスト併記）への代替を IMPL-LIGHT 実機確認時に判断。**再戦ポリシー**: 現行非対称（replace = confirm warn-confirmable / swap = hard block）を **そのまま明文化**。理由は replace は 1 ペア判断 / swap は 2 ペア 4 人影響で操作量上限を超えるため。**選択不可理由カタログ**: R-self / R-winner-locked / R-rematch-replace（selectable + 注釈）/ R-rematch-swap（disabled）/ R-both-swap-needed（**option 事前判定不能**、事後判定に任せる方針 c）/ R-other。**優先順位**: 不正/削除 → 現在/同一 → 結果入力済 → 同時入替 → 入替で再戦 → 選ぶと再戦 → その他。**候補 0 人時**: 「現在の条件では、入れ替えできる候補が見つかりません。別の対局を選ぶか、組み合わせ全体を見直してください。」（穏やか + 中立、「組み合わせを作り直してください」は再生成ボタン誤動作誘発の懸念で避ける）、select / 「変更を保存」ボタン disabled、モーダル下部に理由内訳テキスト。**IMPL-LIGHT スコープ**: `classifyChangePairingCandidate(cls, idx, candidateId, role)` 新設（事前 / 事後判定共有）/ `buildChangePairingModalHtml` を optgroup 2 段 + disabled + 理由ラベルに刷新 / 候補 0 人時の補足文言と保存 disabled / `escapeHtml` 経由維持 / PR #107 の現在の対局表示・select reset・文言は退行禁止 / 静的検査 + 振る舞いテスト追加。**含めない**（IMPL-MEDIUM 以降）: select 廃止 / 動的再計算（もう片方 select change 時の候補再計算）/ 詳細理由パネル / 変更前後差分表示 / 推薦 / 状態機械化 / 複数選手同時変更 / 例外許可トグル / pairing algorithm 変更 / `evaluatePairingQuality` / `warning object` 変更 / 既存 helper 本体変更 / pairing-card 補助ラベル（PR #103）変更 / score-card `.sno`/`.snm`（PR #105）変更。**Visual Regression 影響見込み**: モーダル open 状態の VRT は既存スイートで撮っていない可能性大、red になりにくい。red になった場合は自律 snapshot 更新せず判断を仰ぐ。**次タスク候補**: 第一 = `PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT`（+60〜120 行 + テスト + helper 抽出）、第二 = 運用観察（disabled option / optgroup スマホ視認性、エラー試行回数削減）、第三 = `IMPL-MEDIUM`（動的再計算 / 詳細理由パネル）、第四 = `CONTROL`（例外許可トグル）/ `RULES`（再戦ポリシー仕様変更）。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files 未変更 / 後続タスク着手なし）

**PAIRING-UX 手動変更エラー時の復旧 IMPL-LIGHT 実装着地**: `docs/notes/20260515_shogi_pairing_ux_manual_change_error_recovery_design.md` §5 を参照（PR #106 §5 第一候補 = `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT` 着手 Draft PR。HEAD `7c386bc`。**実装内容**: (1) [`buildChangePairingModalHtml`](shogi_v4.html:4689) のモーダル冒頭に **「現在の対局」読み取り専用表示** を追加（`data-chg-current="1"` ブロック内に `data-chg-current-role="p1"`/`"p2"` の 2 行、`formatParticipantLabel(..., {mode:'compact'})` で `A-12 山田太郎` 形式、`escapeHtml` 経由）/ (2) [`bindChangePairingModalEvents`](shogi_v4.html:4715) の click handler 内に **`resetSelectsToOriginal()` helper** を定義し、2 選手同時変更 alert / 再戦 warning alert の直前で `chg-p1.value = oldP1` / `chg-p2.value = oldP2` を実行 / (3) UI 文言から `swap` 内部用語を全除去し、運営者向けに更新: 2 選手同時変更 alert = 「この変更では、2人を同時に入れ替える必要があります。\n現在は1人ずつの変更に対応しています。\n選択を元に戻しました。もう一度、変更したい選手を1人だけ選んでください。」/ 再戦 warning alert = 「この変更を行うと、再戦になる組み合わせが発生します。\n選択を元に戻しました。別の選手を選び直してください。」/ 相手 winner 確定済 alert = 「相手ペアが結果入力済みのため、入れ替えできません」/ swap 実行 confirm = 「入れ替えを実行します。…」/ 内部エラー alert = 「内部エラー: 入れ替え後の重複を検出しました。変更を取り消し、元の組み合わせに戻しました」。**不変項目**: `state.pairings` 管理設計 / save() / renderTournament(cls) 呼出設計 未変更（既にエラーパスで state 不変・save 呼ばずだった既存挙動を維持）/ swap 確定後の `backup1`/`backup2` rollback（[L4763-4768](shogi_v4.html:4763) 相当）維持 / `evaluatePairingQuality()` / `warning object` 未変更 / `generatePairing` / Fisher-Yates 未変更 / `getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` 本体 未変更 / PR #103 pairing-card 補助ラベル（`data-pairing-aux`）未変更 / PR #105 score-card `.sno` / `.snm` 未変更 / 「組み合わせを元に戻しました」（state rollback を含意するミスリーディング表現）は使用せず、select reset 用には「選択を元に戻しました」のみ採用（事実誤認回避）。**含めない**: 元に戻すボタン / 変更前後差分表示 / モーダル全面リデザイン / 2 選手同時変更許可 / pairing algorithm 変更 / DISPLAY-LABELS-IMPL-LIGHT / WARNING Phase 2〜4。**テスト**: `test/test_pairing_ux_manual_change_error_recovery.js`（新規、静的検査 + 軽量振る舞いテスト 69 アサート PASS、文言整合 / select reset 近接 / 現在ペア表示 / escapeHtml + formatParticipantLabel 経由 / state 代入位置 / save 未呼出 / rollback 維持 / 不変項目 確認）+ `test/run_tests.sh` stanza。既存 71 + 新規 1 stanza = **全 72 stanza PASS（合計 206 個別アサート相当）**。`test/e2e/shogi_phase4_pairing_swap.spec.js` の alert 文言 expect も新文言に更新（`相手ペアが結果入力済みのため、入れ替えできません` / `再戦になる組み合わせが発生します`）。`test/run_tests.sh` 2-6 stanza の grep sentinel も新文言に更新。**Visual Regression 影響見込み**: モーダル open 状態の VRT は既存スイートで撮っていないため red になりにくい。red になった場合は自律更新せず判断を仰ぐ。**次タスク候補**: 第一 = **運用観察**（新文言 / 現在ペア表示 / select reset で「抜けられない」状態が解消されるか）、第二 = `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-MEDIUM`（ボタン / 差分表示、観察後）、第三 = `DISPLAY-LABELS-IMPL-LIGHT`（独立進行可）。Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT 未着手 / Codex・cowork review 自律実行なし）

**PAIRING-UX 手動変更エラー時の復旧方針設計**: `docs/notes/20260515_shogi_pairing_ux_manual_change_error_recovery_design.md` を参照（PR #105 着地後の docs-only design check。HEAD `e5c13da`。**現場課題**: 「対戦相手の変更」モーダルで `swap で再戦が発生します。` / `2 選手同時の変更は対象外です。` 等のエラーが出た後、運営者が変更前状態を把握できず抜けられない状態に陥る。**現状コード確認の重要発見**: [`bindChangePairingModalEvents`](shogi_v4.html:4715) のエラーパス（L4722 同一選手 / L4723 差分なし / L4728 2 選手同時変更 / L4741 相手 winner 確定済 / L4748 swap 再戦）は **すべて `state.pairings` 変更前に return** するため **state は既に安全側設計**。`state.pairings` 変更は L4737（replace）/ L4760-4761（swap）の検証完了後のみ実行され、swap 確定後の重複検出（L4763-4768）には既に `backup1` / `backup2` snapshot rollback パターンが実装済。save() / renderTournament(cls) はエラーパスでは呼ばれない。**抜けられない原因の再構築**: (1) モーダル UI が開いたまま `<select>` に失敗選択値が残る、(2) モーダル内に元の p1/p2 表示なし、(3) `swap` 内部用語で混乱。**該当文言の出所**: L4728 / L4741 / L4748 / L4755 / L4766 の 5 callsite に `swap` 露出。**設計候補再評価**: 当初仮説の候補 A（検証 OK まで state 変えない）/ B（snapshot restore）は **既に実装済 or 不要**。「変更前に戻しました」を state 不変の事実と異なって表示するのは avoid。**推奨方針**: 候補 C（文言改善）+ R1（モーダル冒頭に「現在のペア」常時表示）+ R2（エラー時に `<select>` を元値へ自動リセット）の組合せ = R1 + R2 + R3。**IMPL-LIGHT スコープ**: 文言改善（`swap` 除去 + 「変更は確定していません」明示）/ モーダル「現在のペア」表示要素追加 / エラー時 `chg-p1`/`chg-p2` 自動リセット / 静的検査テスト追加。**含めない**: 元に戻すボタン / 変更前後差分表示 / モーダル全面リデザイン / 2 選手同時変更許可 / pairing algorithm 変更 / `evaluatePairingQuality` 変更 / `warning object` 変更 / `formatParticipantLabel` API 変更 / 既存 helper 本体変更 / pairing-card 補助ラベル（PR #103）変更 / score-card `.sno`/`.snm`（PR #105）変更。**Visual Regression 影響**: モーダル open 状態の VRT は既存スイートで撮っていないため red になりにくい。**次タスク候補**: 第一 = `PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT`（+15〜30 行）、第二 = 運用観察、第三 = `IMPL-MEDIUM`（ボタン / 差分表示）、第四 = `DISPLAY-LABELS-IMPL-LIGHT`（独立進行可）。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files 未変更 / 後続タスク着手なし）

---

## 6. 持ち越し項目(将来の改修候補)

### 低優先度
- `buildScoreGridHtml` の純粋化(played 計算を呼出側へ)
- `buildCurrentPairingsHtml` の純粋化(重複検出を呼出側へ)

### 中優先度
- `<div class="section">` の閉じタグ省略問題(元コードからの未対応、ブラウザ自動補完で動作中)

### Codex P2 系（次フェーズで対応）
- `run_tests.sh` の Traceback 握り潰し問題（`/home/claude/test/data_*.json` のハードコード）
- `save()` の catch 握り潰し
- 賞金額の食い違い（アプリ7000円 vs index.html 14000円）
- 報告書入力欄が state に保存されない
- 「保存」ボタン文言の改善

### 設計上の割り切り（将来の判断材料、Codex 再レビュー由来）

以下は Codex 再レビュー（2026-05-01）で疑問点として記録された事項。本番運用上は問題ないが、将来の判断ぶれを防ぐため明文化しておく。

#### 1. `removePlayer` の防御的堅牢性

現状の削除禁止条件は `state.started && pastMatches > 0` のみ。通常運用では問題ないが、壊れた JSON などで `started:false` かつ `results` ありの状態を読めると、過去対局者を削除できてしまう。

- **割り切り根拠**: 通常の操作経路（保存→読込）では到達しない状態。`normalizeState` の堅牢性に頼っている
- **将来検討する場合**: `normalizeState` で「`started:false` かつ `results` あり」を検出して `started:true` に補正する、または `removePlayer` の禁止条件を `pastMatches > 0` に拡張する

#### 2. ペアリングアルゴリズムの最適化レベル

現実装は「局所的に勝数差が小さい候補から試す」バックトラック方式。月例大会運用としては十分現実的だが、**厳密なスイス式最適化器ではない**。

- **割り切り根拠**: 月例大会（参加者10名前後・4回戦）では局所最適でも実用上問題ない。完璧な最適化を求めると探索コストが指数的に増える
- **満たしている性質**（性質テストで検証済み）: 全員1回登場 / 再戦回避 / 同勝ち数優先
- **満たしていない性質**: 全ペアの勝数差合計が最小 / 最大勝数差が最小（厳密最適化）
- **将来検討する場合**: 性質テストに「全ペアの勝数差合計が最小」「最大勝数差が最小」などの探索比較テストを追加し、その上でアルゴリズム改良を検討する

### 機能追加候補(運用後に検討)
- 大会日時の記録
- スコアの履歴管理
- 複数大会の比較
- リアルタイム共有(ホスティング変更が必要)

---

## 7. 開発ワークフロー

### ChatGPT との相互レビュー連携

このプロジェクトでは Claude と ChatGPT の双方が独立してコードレビューを行う運用になっている。

- **設計判断**: Claude が初案 → ChatGPT が独立レビュー → 採否を運営者が決定
- **実装**: Claude が実施
- **動作確認**: 運営者が実機(スマホ)で確認
- **回帰確認**: Claude がテスト基盤で実施

### Claude.ai と Claude Code の役割分担

(運営者が並行運用している他プロジェクトでも採用されている運用ルール、参考までに)

- **Claude.ai**: 設計検討、調査、引き継ぎ作成
- **Claude Code**: 実装本体、Git操作
- **Codex**: 独立レビュー
- **GitHub Actions**: 自動テスト、セキュリティスキャン

---

## 8. デプロイ手順

1. `shogi_v4.html` と `index.html` を編集
2. 上記テストを全て実施
3. GitHub にアップロード(リポジトリのルートに直接配置)
4. キャッシュ回避URLで確認:
   ```
   https://kazuo1970takahashi-sketch.github.io/shogi/?v=N
   ```
   N は 16, 17, 18... と毎回インクリメント

### iOS Safari のキャッシュ問題

通常タブは強くキャッシュする。プライベートタブで動作確認した上で、必要に応じて手動キャッシュクリア(設定 → Safari → 詳細 → Webサイトデータ → 該当ドメイン削除)。

---

## 9. 注意点・既知の制約

### CSS関連
- `.player-row` は flex-wrap でスマホ自動折返し
- スマホ判定は `window.innerWidth < 600` の単純判定
- `<div class="section">` の閉じタグなし(ブラウザ自動補完で動作)

### JavaScript関連
- ES5構文を維持(IE対応の名残、無理に ES6+ に書き換えない)
- イベント登録時の古典的クロージャパターンを維持
- `state` はグローバル変数として全関数で参照

### データ関連
- localStorage 容量は約5-10MB(将来データ量増加時は要注意)
- JSON保存・復元は履歴も含むため、ファイルサイズが徐々に増える

### スマホ運用
- 大会当日は通信不安定でも動作するよう、初回読込後はオフラインで使えることを確認済み
- localStorage の都合で「保存ボタン」を押さないとデータが残らない場面がある(JSONダウンロード)

---

## 10. 同梱ファイル一覧

```
shogi_handoff/
├── HANDOFF.md          (このファイル)
├── shogi_v4.html       (最新の運営アプリ本体、約70KB)
├── index.html          (運営マニュアル、ランディングページ)
├── test/
│   ├── run_tests.sh    (3層テスト本体)
│   ├── compare_render.js
│   ├── compare_results.js
│   ├── compare_modals_v2.js
│   ├── test_tab_selection.js
│   ├── data_basic4.json
│   ├── data_ab44.json
│   ├── data_special.json
│   ├── data_v3_legacy.json
│   └── data_broken.json
└── archive/
    ├── shogi_stage1_before.html  (リファクタ前のオリジナル)
    └── shogi_stage5_after.html   (リファクタ完了時点)
```

---

## 11. 履歴・作成情報

- 作成日: 2026年4月30日
- 最終更新: shogi_v4.html リファクタ全5段階+UIスマホ最適化完了時点
- 引き継ぎ作成: Claude (Anthropic)
- 引き継ぎ目的: 別チャットでの作業継続のため

---

**新しいチャットで作業開始する際は、このMDをまず読み、次に `shogi_v4.html` を読み、必要に応じて `test/` を実行してから編集を始めてください。**
