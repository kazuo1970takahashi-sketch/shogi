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

**TOUR-OPS Claude Code Reviewer 運用設計**: `docs/ops/20260516_shogi_tour_claude_code_reviewer_design.md` を参照（`TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN` 着手 Draft PR、docs-only design。HEAD `84f6724`（PR #124 squash merge 後の main = TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN）から派生。**目的**: PR #124 で main 投入した RRD 標準設計の secondary reviewer（`Codex-primary / Claude Code-secondary / ChatGPT-orchestrated review` の Claude Code-secondary）を、Claude Code Implementer と分離した **「見る専用エージェント」** として設計。「作る Claude」と「見る Claude」を分け、Codex 利用制限時の独立レビュー経路を docs-only で確立する。**設計内容**: §1 目的 / §2 背景（Codex 利用制限・cowork 不安定・Claude Code Reviewer 必要性）/ §3 用語定義（Implementer / Reviewer / ChatGPT 司令塔 / Codex / cowork / Grok）/ §4 Reviewer 独立性ルール（Level A 高独立 = Codex / 別 Claude Code セッション、Level B 中独立 = 同 repo context 別依頼 read-only、Level C 低独立 = self-check Go 判定不可）/ §5 Risk Level 別の使い分け（Level 0〜3+、PR #124 §7.2 と整合）/ §6 標準レビュー手順 17 ステップ / §7 Reviewer 禁止事項（commit/push/Ready/merge/branch 削除/release/deploy/publish/修正実行/PR 本文編集/workflow/package/token/branch protection/PR template/Issue template/label/ai_work_queue.md 作成/unrelated cleanup/対象外 PR 操作/後続タスク着手）/ §8 Review Report 標準 14 項目フォーマット / §9 Reviewer 依頼文テンプレ案（コピー可能、実ファイル化は後続 IMPL-LIGHT 送り）/ §10 Implementer への戻し方 8 段階フロー（Reviewer は修正しない、修正依頼案を返すだけ、Implementer が修正、再レビューは Reviewer または Codex）/ §11 PR コメント運用（review report は PR コメント投稿例外許容、PR コメント順序の推奨拡張）/ §12 今回やらないこと / §13 後続候補 / §14 結論。**やらないこと**: Claude Code Reviewer 実運用 / GitHub Actions 化 / Bot 化 / 自動レビュー / `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` / label / `ai_work_queue.md` 作成 / workflow / package / 実装 / テスト / snapshot / CSS / layout 変更 / **v0.1 ルール本体改訂** / **trial-001 note 改訂** / **RRD design 改訂** / branch protection / token / secret / credential / release / deploy / publish / 自動 Ready / 自動 merge / RESET-UX 後続実装 / 後続タスク着手（`TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001` / `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT` / `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` / `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` / `TOUR-OPS-AI-WORK-QUEUE-DESIGN` / `TOUR-OPS-PR-TEMPLATE-DESIGN` / `TOUR-OPS-HANDOFF-FORMAT-DESIGN` / `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`）。**Visual Regression 影響**: docs-only のため snapshot 影響なし見込み。**テスト**: docs-only のため未実施（`git diff --check` clean 確認）。**次タスク候補**: 第一 = `TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001`（小さな docs-only PR で Reviewer 試運転）、第二 = `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT`（テンプレ実ファイル化）、第三 = `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT`、第四 = `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT`、第五以降 = `TOUR-OPS-AI-WORK-QUEUE-DESIGN` / `TOUR-OPS-PR-TEMPLATE-DESIGN` / `TOUR-OPS-HANDOFF-FORMAT-DESIGN`、観察後 = `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / CI 設定変更なし / package 変更なし / `playwright.config.js` 変更なし / docs/specs 変更なし / `.github/workflows/` 変更なし / `.github/PULL_REQUEST_TEMPLATE.md` 変更なし / `.github/ISSUE_TEMPLATE/` 変更なし / label 作成なし / `ai_work_queue.md` 作成なし / `index.html`・`data/` 変更なし / 実装ファイル変更なし / テストファイル変更なし / workflow 変更なし / 自動化実装なし / Bot 実装なし / branch protection 変更なし / token / secret / credential 操作なし / **v0.1 ルール本体改訂なし** / **trial-001 note 改訂なし** / **RRD design 改訂なし** / Codex・cowork review 自律実行なし / 後続タスク未着手 / **後続レビュー待ち**）

**TOUR-OPS Review Request Draft 標準設計（レビュー体制再整理 2026-05-16 追記）**: PR #124 自身のレビュー試行で、cowork は GitHub PR / commits / files / diff / patch / raw に安定アクセスできず standard fallback として不安定と判明。`docs/ops/20260516_shogi_tour_review_request_template_design.md` の §3 / §7 / §8 / §9 / §11 / §12 を **Codex-primary / Claude Code Reviewer-secondary / ChatGPT-orchestrated** 方針へ大幅改訂。具体的には (1) **cowork を standard fallback reviewer から optional advisory reviewer に降格**（GitHub URL を読ませない、貼付本文ベースの補助意見のみ）/ (2) **Claude Code Reviewer を secondary reviewer として新規追加**（Codex 利用制限時の代替、Implementer / Reviewer 役割分離、read-only review 原則 = commit / push / Ready / merge / 修正実行禁止、修正提案のみ）/ (3) **Grok を標準レビュー経路から除外** / (4) RRD テンプレ §8 に Reviewer 別注意（Claude Code Reviewer = read-only / cowork = 貼付本文 / Grok = 渡さない）追加 / (5) リスクレベル別標準経路（Level 0〜3+）を §7.2 に追加 / (6) Phase 1 では Human Copy/Paste は残るが「考えて作る」→「運ぶ」へ負担形態が変わると §9.5 に明記 / (7) 後続候補に `TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN` を第一候補として追加。Review Material Pack 同梱・RRD 本文への raw / patch / diff URL 直接同梱・レビュアー留保欄標準化は維持。v0.1 ルール本体 + trial-001 note は本 PR では未変更（v0.2 検討時に組み込み候補）。

**TOUR-OPS Review Request Draft 標準設計**: `docs/ops/20260516_shogi_tour_review_request_template_design.md` を参照（`TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN` 着手 Draft PR、docs-only design。HEAD `44b49a9`（PR #123 squash merge 後の main = TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001）から派生。**目的**: PR #122 で main 投入した AI 非同期運用ルール v0.1（[`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`](docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md)）と PR #123 trial-001 観察結果（[`docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md`](docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md) §7.7 Review Access Fallback / §7.8 RRD 改善候補）を踏まえ、**Review Request Draft（RRD）の標準構造** を docs-only で設計した。**設計内容**: §1 目的 / §2 背景（PR #123 で確認された cowork の GitHub 直読み制約・fallback URL 別コメント分離の弱さ）/ §3 レビュー担当 AI 役割分担（Codex 第一候補・cowork fallback・ChatGPT 司令塔結果整理、§3.4 役割マトリクス含む）/ §4 RRD 標準構造（§4.1 ヘッダー / §4.2 参照 URL = PR URL + diff URL + patch URL + commit SHA 固定 raw URL + リポジトリ内パス + commit URL / §4.3 変更ファイル一覧 + 変更していない重要ファイル / §4.4 Review Material Pack 必須項目（共通 + docs-only PR 追加 + 実装 PR 追加）/ §4.5 レビュー観点 10 項目 / §4.6 Must Fix・Should Fix・Nice to Have 基準）/ §5 GitHub が読めない場合の fallback 方針（L0 通常 → L1 素材パック中心 → L2 抜粋ベース → L3 留保付きの 4 段階）/ §6 レビュアー留保欄の標準化（「レビューの限界」「未確認範囲」「留保条件」「追加確認推奨」、trial-001 cowork の判定+留保+上書き条件 3 点セットを標準形式として採用）/ §7 Codex-first / cowork-fallback 方針（判断フロー 8 段階）/ §8 RRD テンプレ案（コピー可能、ただし `.github/PULL_REQUEST_TEMPLATE.md` 実ファイル化は後続 IMPL-LIGHT 送り）/ §9 PR コメント運用案（PR 本文はスコープ管理、RRD コメントが素材パック、完了報告は実行記録、observation log は別途、fallback URL 別コメント分離は弱いと明記）/ §10 今回やらないこと / §11 後続タスク候補 / §12 結論。**やらないこと**: `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` / label / `ai_work_queue.md` 作成 / GitHub Actions / Bot / API 連携 / 自動レビュー依頼 / 自動 Ready / 自動 merge / branch 削除 / release / deploy / publish / 実装変更 / テスト変更 / snapshot 変更 / v0.1 ルール本体改訂 / trial-001 note 改訂 / RESET-UX 後続実装 / 後続タスク着手（`TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` / `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` / `TOUR-OPS-AI-WORK-QUEUE-DESIGN` / `TOUR-OPS-PR-TEMPLATE-DESIGN` / `TOUR-OPS-HANDOFF-FORMAT-DESIGN` / `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`）。**Visual Regression 影響**: docs-only のため snapshot 影響なし見込み。**テスト**: docs-only のため未実施（`git diff --check` clean 確認）。**次タスク候補**: 第一 = `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT`（Claude Code 完了報告テンプレ / RRD コメント標準化 / Core 5・Standard 11 の記載場所整理）、第二 = `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT`（本設計 §8.1 テンプレ案を実運用テンプレに昇格）、第三 = `TOUR-OPS-AI-WORK-QUEUE-DESIGN`、第四 = `TOUR-OPS-PR-TEMPLATE-DESIGN`、第五 = `TOUR-OPS-HANDOFF-FORMAT-DESIGN`、観察後 = `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / CI 設定変更なし / package 変更なし / `playwright.config.js` 変更なし / docs/specs 変更なし / `.github/workflows/` 変更なし / `.github/PULL_REQUEST_TEMPLATE.md` 変更なし / `.github/ISSUE_TEMPLATE/` 変更なし / label 作成なし / `ai_work_queue.md` 作成なし / `index.html`・`data/` 変更なし / 実装ファイル変更なし / テストファイル変更なし / workflow 変更なし / 自動化実装なし / Bot 実装なし / branch protection 変更なし / token / secret / credential 操作なし / v0.1 ルール本体改訂なし / trial-001 note 改訂なし / Codex・cowork review 自律実行なし / 後続タスク未着手 / **後続レビュー待ち**）

**TOUR-OPS AI 非同期運用ルール v0.1 初回手動試験**: `docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md` を参照（`TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001` 着手 Draft PR、docs-only trial。HEAD `ea71e15`（PR #122 squash merge 後の main = TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN）から派生。**目的**: PR #122 で main に投入した [`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`](docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md) を、最初の **手動試験** として実際の Draft PR / PR コメント運用に 1 回適用する。自動化ではなく、GitHub 上のハンドオフ情報で次アクションが判断できるか、Review Request Draft が髙橋さんのコピペ負担を減らすかを確認する。**試験対象セクション**: §6 Core 5 / Standard 11、§10 AI 間ハンドオフ手順、§11 Short Prompt、§12 Blocked By、§14 Phase 1、§16 後続候補。**適用内容**: (1) PR 本文に Core 5（Next Action / Next Owner / Blocked By / Allowed Without Human Approval / Requires Human Approval）+ Standard 11（Task ID / PR / Branch / Commit SHA / Current Status / Forbidden Actions / Changed Files / Tests / Risk Level / Review Needed / Handoff URL）を記載 / (2) PR コメントに **Review Request Draft**（cowork / Codex に髙橋さんがそのままコピペで渡せる粒度のレビュー依頼文、対象 PR 番号 / PR diff URL / Task ID / 変更ファイル / docs-only trial 明示 / レビュー観点 / Must Fix・Should Fix・Nice to Have 基準 / Ready 化判断 / merge 前修正要否 / v0.1 trial としての妥当性 を含む）を投稿 / (3) 完了報告コメントを v0.1 §10.1 形式（Core 5 + Standard 11 自己適用）で投稿 / (4) Blocked By を段階別に明記（Draft 直後 = Review、review 後 = Human Approval for Ready、Ready 後 = Human Approval for merge、Human Copy/Paste 発生箇所も §12 §16 後続候補 input として記録）/ (5) Ready 化 / merge / 危険操作はせず Draft で停止。**やらないこと**: PR テンプレ変更（`.github/PULL_REQUEST_TEMPLATE.md`）/ Issue template / label 作成 / `ai_work_queue.md` 作成 / GitHub Actions 変更 / Bot 実装 / API 連携 / 自動 Ready / 自動 merge / snapshot 更新 / release・deploy・publish / branch 削除 / v0.1 ルール本体改訂 / RESET-UX 後続実装 / 後続タスク着手（`TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` / `TOUR-OPS-AI-WORK-QUEUE-DESIGN` / `TOUR-OPS-PR-TEMPLATE-DESIGN` / `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN` / `TOUR-OPS-HANDOFF-FORMAT-DESIGN` / `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`）。**成功条件**: (S1) GitHub PR コメントだけを見て次に誰が何をすべきか分かる / (S2) Review Request Draft が PR コメントに残っている / (S3) 髙橋さんがゼロからレビュー依頼文を作らなくてよい / (S4) Blocked By 明確 / (S5) Allowed Without / Requires Human Approval 明確 / (S6) Ready 化 / merge / 危険操作が自律実行されていない。**観察ポイント**: Core 5 の実用性 / Standard 11 の重さ / Review Request Draft のコピペ負担削減効果 / Blocked By: Human Copy/Paste の記録法 / 完了報告の長さ / 後続 IMPL-LIGHT でテンプレ化すべき項目の絞り込み。**Visual Regression 影響**: docs-only trial のため snapshot 影響なし見込み。**テスト**: docs-only のため未実施（`git diff --check` clean 確認）。**次タスク候補**: 第一 = `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT`（trial レビュー後着手、Claude Code 完了報告テンプレ実ファイル化 / Review Request Draft 標準化 / Core 5・Standard 11 の記載場所決定）、第二 = `TOUR-OPS-AI-WORK-QUEUE-DESIGN`、第三 = `TOUR-OPS-PR-TEMPLATE-DESIGN`、第四 = `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN`、第五 = `TOUR-OPS-HANDOFF-FORMAT-DESIGN`、観察後 = `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / threshold 緩和なし / CI 設定変更なし / package 変更なし / `playwright.config.js` 変更なし / docs/specs 変更なし / `.github/workflows/` 変更なし / `.github/PULL_REQUEST_TEMPLATE.md` 変更なし / `.github/ISSUE_TEMPLATE/` 変更なし / label 作成なし / `ai_work_queue.md` 作成なし / `index.html`・`data/` 変更なし / 実装ファイル変更なし / テストファイル変更なし / workflow 変更なし / 自動化実装なし / Bot 実装なし / branch protection 変更なし / token / secret / credential 操作なし / v0.1 ルール本体改訂なし / Codex・cowork review 自律実行なし / 後続タスク未着手 / **後続レビュー待ち**）

**TOUR-OPS AI 非同期運用ルール v0.1 設計**: `docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md` を参照（`TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN` 着手 Draft PR、docs-only design。HEAD `94d1755`（PR #121 squash merge 後の main = RESET-UX-SERIES-CLOSURE-DOCS）から派生。**目的**: SHOGI-TOUR の AI チーム（ChatGPT / Claude / Claude Code / Codex / cowork）間ハンドオフを GitHub 上に残すことで、髙橋さんの手動コピペ依存を減らし、髙橋さんの役割を「コピペ係」から「承認者・方針決定者」へ移行する。**設計内容**: §1 目的（GitHub を SSoT 化 / 危険操作の自動化はしない / 低リスク作業の非同期化）/ §2 背景と問題（コピペ依存 / 髙橋さん不在時に停止）/ §3 AI 役割定義（ChatGPT 司令塔・Claude 設計・Claude Code 実装・Codex / cowork 独立レビュー・髙橋さん最終判断者）/ §4 GitHub SSoT 化（PR 本文 / コメント / HANDOFF / docs/notes / docs/ops の使い分け）/ §5 状態遷移モデル（Draft / Review Waiting / Review Done / Ready Approved / Ready Done / Merge Approved / Merged / Observation / Blocked の 9 状態）/ §6 必須メタ情報テンプレ（Task ID / PR / Branch / Commit SHA / Current Status / Next Action / Next Owner / Blocked By / Allowed Without Human Approval / Requires Human Approval / Forbidden Actions / Changed Files / Tests / Risk Level / Review Needed / Handoff URL）/ §7 リスクレベル分類 Level 0〜5（記録整理 / docs-only design / IMPL-LIGHT / IMPL-MEDIUM / ロジック影響 / 運用公開破壊）/ §8 人間承認必須操作（Ready 化 / merge / main 直接 push / release / deploy / publish / branch 削除 / VRT snapshot 更新 / threshold 緩和 / VRT skip / workflow 変更 / package*.json / lockfile / playwright.config.js / localStorage schema / reset logic / pairing / master data / force push / branch protection / token / secret / credential）/ §9 髙橋さん不在時の許可範囲（docs-only / IMPL-LIGHT Draft PR / review request draft / HANDOFF 追記まで可、Ready / merge / snapshot / release / branch 削除 / 危険後続着手は不可）/ §10 AI 間ハンドオフ手順（Claude Code 完了報告 / レビュー完了 / ChatGPT 司令塔判断のテンプレ）/ §11 依頼文短縮（Full Prompt / Short Prompt / PR Comment Template）/ §12 Blocked By 分類（Human Approval / Review / VRT Decision / CI Red / Spec Ambiguity / Data Risk / Security Risk / Tool Unavailable / Context Missing / Human Copy/Paste）/ §13 禁止事項（AI 同士の完全自動連携を前提にしない / 危険操作自動化なし / Bot / Actions / token / branch protection 変更なし）/ §14 段階的導入計画（Phase 1 IMPL-LIGHT / Phase 2 work queue / Phase 3 label / Phase 4 半自動化 / Phase 5 Actions / Bot）/ §15 RESET-UX シリーズ教訓（DESIGN → IMPL-LIGHT 分離 / 小 PR / 禁止事項明示 / VRT 自律更新禁止 / closure PR / 分類は活かす、コピペ依存 / 長い依頼文 / 手動レビュー依頼は改善対象）/ §16 後続候補（`TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` / `TOUR-OPS-AI-WORK-QUEUE-DESIGN` / `TOUR-OPS-PR-TEMPLATE-DESIGN` / `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN` / `TOUR-OPS-HANDOFF-FORMAT-DESIGN` / `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`）/ §17 結論。**含めない**: 実装 / 自動化 / GitHub Actions 変更 / Bot 連携 / workflow 変更 / `package*.json` / lockfile / `playwright.config.js` / VRT snapshot / CSS / layout / branch protection / token / secret / credential / 既存 PR template / Issue template 改修 / `shogi_v4.html` / `test/` / `test/e2e/` / `index.html` / `data/` 変更 / 後続タスク着手。**Visual Regression 影響**: docs-only のため snapshot 影響なし見込み。**テスト**: docs-only のため未実施（git diff --check clean を確認）。**次タスク候補**: 第一 = `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT`（v0.1 レビュー後着手、Claude Code 完了報告テンプレ改訂 / PR 本文 Next Action / Blocked By 欄追加）、第二 = `TOUR-OPS-AI-WORK-QUEUE-DESIGN`、第三 = `TOUR-OPS-PR-TEMPLATE-DESIGN`、第四 = `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN`、第五 = `TOUR-OPS-HANDOFF-FORMAT-DESIGN`、観察後 = `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / threshold 緩和なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / index.html・data/ 変更なし / 実装ファイル変更なし / テストファイル変更なし / workflow 変更なし / 自動化実装なし / Bot 実装なし / branch protection 変更なし / token / secret / credential 操作なし / Codex・cowork review 自律実行なし / 後続タスク未着手 / **後続レビュー待ち**）

**RESET-UX 文言整合シリーズ closure**: `docs/notes/20260516_shogi_reset_ux_series_closure.md` を参照（PR #112〜#120 の RESET-UX 文言整合シリーズを「一区切り完了」として整理した docs-only closure。HEAD `1cc05c3`（PR #120 squash merge 後の main）。**直近 PR squash SHA**: PR #117=`89a72b2` / PR #118=`8fea0ee` / PR #119=`22fb60c` / PR #120=`1cc05c3`。**完成した語彙整合**: 全リセット側 = ボタン「大会データを全リセット」（[shogi_v4.html:100](shogi_v4.html:100)、PR #118）/ confirm「参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。」（[shogi_v4.html:5946](shogi_v4.html:5946)、PR #118）/ 完了 toast「大会データを全リセットしました」（[shogi_v4.html:5974](shogi_v4.html:5974)、PR #120） / 部分リセット側 = ボタン「大会進行データをリセット」（[shogi_v4.html:101](shogi_v4.html:101)、PR #114）/ confirm「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？」（[shogi_v4.html:5925](shogi_v4.html:5925)、PR #114）/ 完了 toast「大会進行データをリセットしました」（[shogi_v4.html:5942](shogi_v4.html:5942)、PR #114） / 周辺誘導 = `removePlayer` 一次禁止 alert（[shogi_v4.html:3775](shogi_v4.html:3775)、PR #116）+ 二次禁止 alert（[shogi_v4.html:3792](shogi_v4.html:3792)、PR #116）+ `startTournament` guard alert（[shogi_v4.html:4454](shogi_v4.html:4454)、PR #112 + PR #114 同期更新）すべて部分リセット側 `#resetProgressBtn` を第一選択へ誘導 + 「参加者一覧は残したまま」明示。**マスタ全消去 toast**「マスタをリセットしました(全 member 消去)」（[shogi_v4.html:2380](shogi_v4.html:2380)）は別機能、本シリーズ範囲外で不変。**実装済み範囲**: 文言変更 + 軽量テスト追加 + VRT mobile-375 darwin 3 snapshot 更新（PR #118 のみ、Codex Should Fix 対応）に閉じ、ロジック / データ層 / インフラ不変。**不変項目**: `resetAll()` / `resetTournamentProgressOnly()` の初期化ロジック / `removePlayer` 判定ロジック / early return 順序 / 削除成功経路 / `startTournament` guard 条件 `state.started===true` / 通常経路 / SAVE-001 / SAVE-003 verify / localStorage schema (`STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `BRANCH_MASTER_KEY='shogi_branch_master'`) / pairing algorithm (`generatePairing` / Fisher-Yates / `evaluatePairingQuality` / `warning object`) / `normalizeState` / `save()` / `load()` / ボタン並び・色（`btn-danger`）・配置 / CSS / layout / `showMsg` 本体（[shogi_v4.html:3096](shogi_v4.html:3096)）構造・表示時間・色・aria-live / DOM id / `.github/workflows/` / `package*.json` / `playwright.config.js` / `docs/specs/` / `index.html` / `data/` すべて。**テスト最終状態**: `bash test/run_tests.sh shogi_v4.html` 全 76 stanza PASS / FAIL=0 / WARN=0、`test_reset_ux_partial_reset.js` PASS 87 / `test_remove_player_guard_message.js` PASS 75 / `test_reception_ux_start_button_guard.js` PASS 64 / `test/e2e/shogi_phase2_import.spec.js` PR #118 で `大会データを全リセット` 追従済。**VRT 扱い**: PR #118 で mobile-375 darwin 3 snapshot（pp-panel-3sections / master-edit-modal / master-list-5cols）更新済（PR #114 以降の header baseline drift catch-up + `#resetBtn`「全」1 文字塊増分の累積、横スクロール / ボタン重なり / 操作不能崩れなしを目視確認済、linux variant は CI 再生成想定）/ PR #120 では snapshot 未変更（`#reg-msg` toast は既存 3 snapshot の撮影タイミングに含まれない設計想定で実機 VRT 直接差分なし見込み）/ **今後の指針**: VRT red 時は自律更新せず差分目視 + 明示許可後に snapshot 更新、threshold 緩和 / VRT skip / CI 設定変更は禁止。**次フェーズ = 運用観察フェーズ**: §7.1 観察項目 = (1) 全リセット / 部分リセットの直感的区別（ヘッダー 2 ボタン判別 / 「進行」修飾語の有無 / 誤押下事故消失） / (2) toast「大会データを全リセットしました」の語感（「全」威圧 / 部分対比 / 第三者運営者視認性） / (3) mobile 表示（375px / 360px ヘッダー 5 ボタン折り返し / `#reg-msg` toast 1 行表示 / baseline catch-up 後体感 / タップ誤判定）/ (4) 操作後の迷いなさ（confirm 長文 / toast 視認 / `removePlayer` alert → `#resetProgressBtn` 動線スムーズ）。**観察結果次第の後続候補**: `RESET-UX-TOAST-LABEL-IMPL-MEDIUM`（案 F「すべて」統一）/ `RESET-UX-TOAST-LIFECYCLE-DESIGN`（toast 自動消去 / aria-live 強化）/ `RESET-UX-FULL-RESET-PLACEMENT-DESIGN`（ヘッダー撤去 / 設定タブ隔離）/ `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（PR #117 §10.2 案 E 強表現「元に戻せません」）/ `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM`（案 E 自動連鎖）/ `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM`（案 E モーダル選択化）/ `RECEPTION-UX-RESTART-WIZARD-DESIGN`（PR #111 案 E）。**並走可能な独立候補**: `DISPLAY-LABELS-IMPL-LIGHT`（同姓識別、独立進行可、`formatParticipantLabel` の 2 番目 callsite 候補）/ WARNING Phase 2〜4（`evaluatePairingQuality` の `warning object` 拡張、中〜大規模）。**今回のスコープ**: closure note 1 件新規 + 本 HANDOFF entry 1 件追加のみ。実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files (`shogi_v4.html`/`test/`/`test/e2e/`/`.github/workflows/`/`package*.json`/`playwright.config.js`/`docs/specs/`/`index.html`/`data/`) 未変更 / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / Codex・cowork review 自律実行なし / 既存 design doc 本文書き換えなし / 後続実装タスク（`RESET-UX-TOAST-LABEL-IMPL-MEDIUM` / `RESET-UX-TOAST-LIFECYCLE-DESIGN` / `RESET-UX-FULL-RESET-PLACEMENT-DESIGN` / `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM` / `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM` / `RECEPTION-UX-RESTART-WIZARD-DESIGN` / `DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4）着手なし。**次のアクション**: 運用観察フェーズ開始、追加実装着手は観察結果次第。

**RESET-UX 全リセット完了toast文言 IMPL-LIGHT 実装着地**: `RESET-UX-TOAST-LABEL-IMPL-LIGHT` 着手 Draft PR。HEAD `22fb60c`（PR #119 squash merge 後の main）から派生。設計根拠は `docs/notes/20260515_shogi_reset_ux_toast_label_design.md` §6.1 第一推奨 = 案 C（toast「大会データを全リセットしました」）。**実装内容**: [`resetAll()`](shogi_v4.html:5974) の完了 toast `showMsg('リセットしました','ok')` → `showMsg('大会データを全リセットしました','ok')` への 1 行変更のみ。**不変項目**: [`resetAll()`](shogi_v4.html:5945) の初期化ロジック / confirm 文言「参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。」（PR #118 確定済）/ [`#resetBtn`](shogi_v4.html:100) 文言「大会データを全リセット」（PR #118 確定済）/ [`resetTournamentProgressOnly()`](shogi_v4.html:5924) 仕様 / confirm 文言 / 完了 toast「大会進行データをリセットしました」（[shogi_v4.html:5942](shogi_v4.html:5942)、PR #114 確定、不変）/ [`#resetProgressBtn`](shogi_v4.html:101) 文言「大会進行データをリセット」/ マスタ toast「マスタをリセットしました(全 member 消去)」（[shogi_v4.html:2380](shogi_v4.html:2380)、別機能、不変）/ [`removePlayer()`](shogi_v4.html:3761) alert（PR #116 確定文）/ [`startTournament()`](shogi_v4.html:4441) guard alert（PR #112 / PR #114 同期更新確定文）/ `showMsg` 本体（[shogi_v4.html:3096](shogi_v4.html:3096)）構造・表示時間・色・aria-live / `normalizeState` / `STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `BRANCH_MASTER_KEY='shogi_branch_master'` / pairing algorithm (`generatePairing` / Fisher-Yates / `evaluatePairingQuality` / `warning object`) / 既存 helper 群 / ボタン並び・色（`btn-danger`）・CSS / layout / VRT snapshot / CI 設定 / `package*.json` / `playwright.config.js` / `docs/specs/` / `index.html` / `data/`。**テスト追従**: `test/test_reset_ux_partial_reset.js` §16 ブロックの末尾に 2 アサート追加（既存の `resetBody` 抽出を再利用、新規 helper / 新規ファイル不要）/ (1) `resetBody.indexOf("showMsg('大会データを全リセットしました','ok')") >= 0` で新 toast 文言の存在を確認 / (2) `resetBody.indexOf("showMsg('リセットしました','ok')") < 0` で旧 toast 文言の残置がないことを regression guard。新規 test file なし / E2E 追加なし / VRT snapshot 更新なし。**テスト結果**: `bash test/run_tests.sh shogi_v4.html` 全 76 stanza PASS / FAIL=0 / WARN=0。影響テスト個別実行: `test_reset_ux_partial_reset.js` PASS 85 → **87**（+2 toast 検査）。**Visual Regression 影響**: 既存 VRT 3 snapshot（pp-panel-3sections / master-edit-modal / master-list-5cols）は `#reg-msg` toast を撮影タイミングに含まないため **直接差分は出ない見込み**（実機 VRT 未実行、設計 doc §8.3 / §9.1 の方針通り）。red になった場合は自律更新せず判断仰ぐ。**E2E**: 追加なし / 更新なし（`resetAll()` 完了 toast を locator にもつ E2E は事前 grep で hit ゼロを確認済）。**含めない**: `resetAll()` 初期化ロジック変更 / `resetAll` confirm 文言変更 / `#resetBtn` 文言変更 / `resetTournamentProgressOnly()` 仕様変更 / `resetTournamentProgressOnly()` 完了 toast 変更 / `#resetProgressBtn` 文言変更 / `removePlayer` alert 文言変更 / `startTournament` guard 文言変更 / マスタ toast 変更 / `showMsg` 本体変更 / localStorage schema 変更 / pairing algorithm 変更 / CSS / layout / ボタン並び替え / VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更 / package 変更 / `playwright.config.js` / `docs/specs/` / `index.html` / `data/` 変更 / 後続タスク着手。**次タスク候補**: 第一 = **運用観察**（新 toast「大会データを全リセットしました」で操作後確認が改善されるか / 「全リセット」の語感が運用上重すぎないか / 部分 toast「進行データを」との直感対比が伝わるか / Codex review 指摘）、第二 = `RESET-UX-TOAST-LABEL-IMPL-MEDIUM`（案 E / F 「すべて」表記統一 + confirm 再調整、観察後）/ `RESET-UX-TOAST-LIFECYCLE-DESIGN`（toast 自動消去 / aria-live 強化）、第三 = `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（案 E 強表現）/ `RESET-UX-FULL-RESET-PLACEMENT-DESIGN`（ヘッダー撤去 / 設定タブ隔離）、第四 = `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM` / `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM` / `RECEPTION-UX-RESTART-WIZARD-DESIGN` / `DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / threshold 緩和なし / VRT skip なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / index.html・data/ 変更なし / `resetAll()` 初期化ロジック変更なし / confirm 文言変更なし / `#resetBtn` 文言変更なし / `resetTournamentProgressOnly()` 仕様 / toast 変更なし / `#resetProgressBtn` 文言変更なし / `removePlayer` alert 文言変更なし / `startTournament` guard 文言変更なし / マスタ toast 変更なし / `showMsg` 本体変更なし / localStorage schema 変更なし / pairing algorithm 変更なし / Codex・cowork review 自律実行なし / 後続タスク未着手。**後続レビュー待ち**。

**RESET-UX 全リセット完了toast文言設計**: `docs/notes/20260515_shogi_reset_ux_toast_label_design.md` を参照（PR #118 着地後の docs-only design check。HEAD `8fea0ee`。**目的**: PR #118 で意図的にスコープ外として維持した `resetAll()` 完了 toast「リセットしました」（[shogi_v4.html:5974](shogi_v4.html:5974)）について、後続で `#resetBtn`「大会データを全リセット」/ confirm「すべてリセットします」と揃えるべきかを設計として閉じる。**現状確認**: `resetAll()` toast = `showMsg('リセットしました','ok')` / `resetTournamentProgressOnly()` toast = `showMsg('大会進行データをリセットしました','ok')`（[shogi_v4.html:5942](shogi_v4.html:5942)、PR #114 確定、不変） / マスタ toast = `showMsg('マスタをリセットしました(全 member 消去)','ok')`（[shogi_v4.html:2380](shogi_v4.html:2380)、別機能、不変）/ `showMsg` 本体は [shogi_v4.html:3096](shogi_v4.html:3096)（`#reg-msg` の `.alert.alert-ok` に `escapeHtml(text)` 挿入）/ `resetAll()` の 'リセットしました' を assert する既存テスト・E2E はゼロ（`test/test_reset_ux_partial_reset.js` は partial toast のみ assert、`test/e2e/shogi_phase2_import.spec.js` PR #118 更新分も toast 文字列は assert していない）/ VRT 3 snapshot（pp-panel-3sections / master-edit-modal / master-list-5cols）は `#reg-msg` toast を含まず直接の VRT 差分は出ない見込み。**案 A〜F 比較**: A 現状維持「リセットしました」（語彙非対称残）/ B「全リセットしました」（目的語なし）/ **C「大会データを全リセットしました」（推奨第一）**（`#resetBtn` 完全一致 + 部分 toast 構造対称 + 目的語あり）/ D「大会データをリセットしました」（「全」抜けで類似文言問題が toast に再来）/ E「大会データを全てリセットしました」（「全て」漢字 vs confirm「すべて」ひらがなで表記揺れ）/ F「大会データをすべてリセットしました」（confirm「すべて」一致だがボタン「全」と分離）。**推奨案（案 C）**: toast = `大会データを全リセットしました` / 採用理由 = (1) `#resetBtn`「大会データを全リセット」と語彙完全一致、(2) 部分 toast「大会進行データをリセットしました」との「進行 vs 全」の構造対称、(3) 目的語ありで「何を」が toast から読める、(4) PR #117 §10.3 / PR #118 HANDOFF entry の予告通り、(5) destructive 完了の事実告知として適切、(6) 実装スコープが「1 行変更 + 任意の軽量静的検査 1 stanza」に閉じる。**保留条件**: 実機 mobile 375px で 15 文字 2 行折り返しなら案 B フォールバック / Codex が「全」と「すべて」の混在を許容しなければ案 F へ移行（confirm 含む再設計、別 design 送り）。**IMPL-LIGHT スコープ（やる）**: [shogi_v4.html:5974](shogi_v4.html:5974) の `showMsg('リセットしました','ok')` → `showMsg('大会データを全リセットしました','ok')` に更新 + （任意）軽量静的検査 1 stanza（新規 `test/test_reset_ux_toast_label.js` または `test/test_reset_ux_partial_reset.js` 末尾追加）+ HANDOFF entry。**やらない**: `resetAll()` 初期化ロジック変更 / `resetAll` confirm 文言変更（PR #118 確定済）/ `#resetBtn` 文言変更（PR #118 確定済）/ `resetTournamentProgressOnly()` 仕様 / confirm / 完了 toast 変更 / `#resetProgressBtn` 文言変更 / `removePlayer` alert（PR #116 確定文）変更 / `startTournament` guard alert（PR #112 / PR #114 同期更新確定文）変更 / マスタ toast `マスタをリセットしました(全 member 消去)` 変更 / `showMsg` 本体構造・表示時間・色・aria-live 変更 / localStorage schema / pairing algorithm / CSS / layout / ボタン並び替え / VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更 / package 変更。**VRT 影響見込み**: 既存 3 snapshot は `#reg-msg` を含まず toast 撮影なし → 直接差分なし見込み。**E2E 影響見込み**: `resetAll()` 完了 toast を locator にもつ E2E はゼロ → 追従更新なし見込み。**リスク**: 文言面（「全」語感重 / 「全」と「すべて」表記揺れ / 部分 toast との対称性 / 「大会データを全リセット」会話的違和感）/ 実装面（軽量テスト粒度判断 / `showMsg` 上書き挙動は最終行呼出で問題なし / VRT 想定外差分 / Codex 指摘）/ 運用面（慣れ問題 / toast 視認頻度）。**次タスク候補**: 第一 = **`RESET-UX-TOAST-LABEL-IMPL-LIGHT`**（即起票可、本 design doc PR squash merge 後の main から派生、1 行変更 + 軽量 1 stanza 任意 + HANDOFF entry）、第二 = 運用観察（新 toast の操作後確認改善 / 「全リセット」語感 / 部分との直感対比）、第三 = `RESET-UX-TOAST-LABEL-IMPL-MEDIUM`（案 E / F 「すべて」表記統一 + confirm 再調整）/ `RESET-UX-TOAST-LIFECYCLE-DESIGN`（toast 自動消去 / aria-live 強化）、第四 = `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（PR #117 §10.2 案 E 強表現）/ `RESET-UX-FULL-RESET-PLACEMENT-DESIGN`（ヘッダー撤去 / 設定タブ隔離）。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files (`shogi_v4.html`/`test/`/`test/e2e/`/`.github/workflows/`/`package*.json`/`playwright.config.js`/`docs/specs/`/`index.html`/`data/`) 未変更 / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / Codex・cowork review 自律実行なし / RESET-UX-TOAST-LABEL-IMPL-LIGHT 未着手 / RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM 未着手 / REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM 未着手 / RESET-UX-PARTIAL-RESET-IMPL-MEDIUM 未着手 / RECEPTION-UX-RESTART-WIZARD-DESIGN 未着手 / DISPLAY-LABELS-IMPL-LIGHT 未着手 / WARNING Phase 2〜4 未着手 / 後続実装タスク着手なし）

**RESET-UX 全リセットボタン文言明確化 IMPL-LIGHT 実装着地**: `RESET-UX-FULL-RESET-LABEL-IMPL-LIGHT` 着手 Draft PR。HEAD `89a72b2`（PR #117 squash merge 後の main）から派生。設計根拠は `docs/notes/20260515_shogi_reset_ux_full_reset_label_design.md` §5.1 第一推奨 = 案 D（ボタン + confirm 両方変更）。**実装内容**: (1) [`#resetBtn`](shogi_v4.html:100) 表示文言を `大会データをリセット` → `大会データを全リセット` に更新 / (2) [`resetAll()`](shogi_v4.html:5946) confirm 文言を `現在の大会データをリセットします（支部マスタは保持されます）` → `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。` に更新 / (3) [shogi_v4.html:3774](shogi_v4.html:3774) の `removePlayer` コメント中の旧ボタン名参照を新文言に追従。**判断ログ — B 案採用**: タスク指示の A 案（ボタンのみ）/ B 案（confirm も最小限変更）のうち、設計 doc §5.1 第一推奨 = 案 D が「ボタン + confirm 両方変更」で押下前 / 押下後の二段防御を狙う設計であり、ボタン押下直後に発火する confirm を旧文言のままにすると `#resetProgressBtn` confirm（PR #114「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します」）との対称性が崩れ不自然になるため、最小限の confirm 文言変更を含む **B 案を採用**。toast「リセットしました」は IMPL-LIGHT スコープ外（後続 `RESET-UX-TOAST-LABEL-DESIGN`）として変更せず。**不変項目**: [`resetAll()`](shogi_v4.html:5945) の初期化ロジック本体（`state={players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{...}}` 一括代入 / `localStorage.removeItem(STORAGE_KEY)` + LEGACY キー除去 / 大会報告書欄クリア / `shogi_branch_master` 維持 / `showTab('reg')` / `showMsg('リセットしました','ok')`）/ [`resetTournamentProgressOnly()`](shogi_v4.html:5924) 仕様 + confirm 文言「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？」/ [`#resetProgressBtn`](shogi_v4.html:101) 文言「大会進行データをリセット」/ [`removePlayer()`](shogi_v4.html:3761) の 2 つの削除不可 alert（PR #116 確定文、`#resetProgressBtn` 誘導維持）/ [`startTournament()`](shogi_v4.html:4441) guard alert（PR #112 確定文、`大会進行データをリセット` 誘導維持）/ `normalizeState` / `STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `BRANCH_MASTER_KEY='shogi_branch_master'` / pairing algorithm (`generatePairing` / Fisher-Yates / `evaluatePairingQuality` / `warning object`) / 既存 helper 群（`getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` / `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` / `classifyChangePairingCandidate`）/ ボタン並び・色（`btn-danger`）・CSS / layout / 完了 toast 文言 / VRT snapshot / CI 設定 / `package*.json` / `playwright.config.js` / `docs/specs/` / `index.html` / `data/`。**テスト追従**: 4 件の既存 unit テスト + 1 件の E2E spec を最小限で更新 / `test/test_reset_ux_partial_reset.js` L209-218（confirm 文言を主要語句 5 項目で assert、ボタン regex を新文言へ）/ `test/test_remove_player_guard_message.js` L256 / L274-275 / L129-141 / L165-175（confirm 主要語句 assert + `removePlayer` alert の「大会データを全リセット」非含有 retention assert + 旧文言「大会データをリセット」非含有 retention assert 併記）/ `test/test_reception_ux_start_button_guard.js` L129-135（ボタン regex を新文言へ）/ `test/e2e/shogi_phase2_import.spec.js` L510-526（describe / test 名 / expect / コメントを新文言へ）。**テスト結果**: `bash test/run_tests.sh` 全 76 stanza PASS / FAIL=0 / WARN=0。3 件の影響テストを個別実行: `test_remove_player_guard_message.js` PASS 75 / `test_reset_ux_partial_reset.js` PASS 85 / `test_reception_ux_start_button_guard.js` PASS 64。**Visual Regression 影響と snapshot 更新（Codex Should Fix 対応で訂正）**: mobile-375 VRT 3 snapshot（pp-panel-3sections / master-edit-modal / master-list-5cols）にいずれも `+20px` height 差分（1565→1585 / 1165→1185）が出た。当初は「ヘッダー文言 1 文字増による mobile 折り返し」と説明していたが、**実測で main の `shogi_v4.html` でも同じ +20px / 同じ pixel-diff ratio（0.11 / 0.33 / 0.14）が再現する** ことを Codex が指摘。baseline が `#resetProgressBtn` 追加前（2 ボタンヘッダー）の状態を含んでおり、PR #114 以降の header baseline drift が積み残っていた。本 PR #118 の snapshot 更新は、その **PR #114 以降の header baseline catch-up を含む** 形となり、その上に `#resetBtn` ラベル差分（`大会データをリセット` → `大会データを全リセット`、`全` 1 文字塊）が累積する。実画像レビューで **横スクロールなし / ボタン重なりなし / 操作不能な崩れなし** を確認（5 ボタンが mobile-375 で縦書きスタックされて並ぶ既存挙動が温存され、新 `全` 文字も縦書きカラム内に収まる）。**更新範囲**: `test/e2e/visual_regression_mobile.spec.js-snapshots/` の darwin variant 3 PNG のみ更新（linux variant は CI で再生成想定）。threshold 緩和 / VRT skip / CI 設定変更は実施せず。**含めない**: `resetAll()` 初期化ロジック変更 / `resetTournamentProgressOnly()` 仕様変更 / `#resetProgressBtn` / `removePlayer` alert / `startTournament` guard 文言変更 / 完了 toast 文言変更 / localStorage schema 変更 / pairing algorithm 変更 / CSS / layout / ボタン並び替え / VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更 / package 変更 / `playwright.config.js` 変更 / `docs/specs/` 変更 / `index.html` / `data/` 変更 / 後続タスク（`RESET-UX-TOAST-LABEL-DESIGN` / `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM` / `RESET-UX-FULL-RESET-PLACEMENT-DESIGN` / `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM` / `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM` / `RECEPTION-UX-RESTART-WIZARD-DESIGN` / `DISPLAY-LABELS-IMPL-LIGHT` / WARNING Phase 2〜4）着手なし。**次タスク候補**: 第一 = **運用観察**（新文言で `#resetProgressBtn` / `#resetBtn` 混同が解消されるか / mobile 折り返し実害がないか / Codex review 指摘の有無）、第二 = `RESET-UX-TOAST-LABEL-DESIGN`（完了 toast「リセットしました」を全リセット明示に統一する小規模設計）、第三 = `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（案 E 強表現、観察後）、第四 = `RESET-UX-FULL-RESET-PLACEMENT-DESIGN`（ヘッダー撤去 / 設定タブ隔離）。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / threshold 緩和なし / VRT skip なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / index.html・data/ 変更なし / `resetAll()` 初期化ロジック変更なし / `resetTournamentProgressOnly()` 仕様変更なし / `#resetProgressBtn` 文言変更なし / `removePlayer` alert 文言変更なし / `startTournament` guard 文言変更なし / 完了 toast 文言変更なし / localStorage schema 変更なし / pairing algorithm 変更なし / Codex・cowork review 自律実行なし / 後続タスク未着手。**VRT snapshot は Codex Should Fix 対応として darwin variant 3 PNG を更新（明示許可後、上記の baseline catch-up 含む）**。

**RESET-UX 全リセットボタン文言の明確化方針設計**: `docs/notes/20260515_shogi_reset_ux_full_reset_label_design.md` を参照（PR #116 着地後の docs-only design check。HEAD `f309516`。**現場違和感**: PR #114 で `#resetProgressBtn`「大会進行データをリセット」が追加された結果、既存 [`#resetBtn`](shogi_v4.html:100)「大会データをリセット」との文言類似（修飾語「進行」の有無のみ）で「全リセット = 参加者一覧も消える」破壊度が直感的に伝わらなくなった。**現状コード確認**: [`#resetBtn`](shogi_v4.html:100)「大会データをリセット」/ [`#resetProgressBtn`](shogi_v4.html:101)「大会進行データをリセット」/ [`resetAll()`](shogi_v4.html:5945) confirm「現在の大会データをリセットします（支部マスタは保持されます）」/ [`resetTournamentProgressOnly()`](shogi_v4.html:5924) confirm「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？」/ `resetAll()` は `state.players={A:[],B:[]}` を含む全 state 初期化 + `localStorage.removeItem(STORAGE_KEY)` + LEGACY キー除去 + 大会報告書欄クリア（`shogi_branch_master` のみ維持）/ `resetTournamentProgressOnly()` は `state.players` 未代入で `state.started=false` + `state.pairings={A:[],B:[]}` + `state.results={A:[],B:[]}` のみ。**案 A〜E 比較**: A 現状維持（事故リスク残）/ B ボタンだけ変更（confirm 非対称）/ C confirm だけ変更（押下前判別困難）/ **D ボタン + confirm 両方変更（推奨第一）** / E 強表現（IMPL-LIGHT には過剰）。**推奨案（案 D）**: ボタン `大会データを全リセット` / confirm `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。`。**採用理由**: 押下前（ボタン）・押下後（confirm）の二段で破壊度を伝達 / `#resetProgressBtn`「大会進行データをリセット」との「進行 vs 全」の構造的対比 / PR #116 の `removePlayer` alert「大会進行データをリセット」誘導と整合 / 実装は文言変更 + テスト追従に閉じる。**既存テスト依存**: `test/test_reset_ux_partial_reset.js` L209-218（confirm + ボタン文言）/ `test/test_remove_player_guard_message.js` L256 / L274-275（confirm + ボタン文言）/ 同 L134-141 / L169-173（`removePlayer` alert 内「大会データをリセット」非含有検査 — 新ボタン名「大会データを全リセット」へ検査軸切替が必要）/ `test/e2e/shogi_phase2_import.spec.js` L510-534（describe / test 名 / expect L514）。**VRT 影響見込み**: 既存 VRT snapshot 3 種（pp-panel / master-edit-modal / master-list-5cols）はヘッダー外、直接 red にはなりにくい。ただし PR #114 で `#resetProgressBtn` 追加時に mobile 375px ヘッダー周辺で間接差分実績あり、今回もマスタタブ映り込み / mobile 折り返しの可能性を実機確認時に評価。**含めない**: `resetAll()` 初期化ロジック変更 / `resetTournamentProgressOnly()` 仕様変更 / `#resetProgressBtn` 文言変更 / `removePlayer` alert（PR #116 確定文）変更 / `startTournament` guard alert（PR #112 確定文）変更 / localStorage schema / pairing algorithm / `evaluatePairingQuality` / `warning object` / `normalizeState` / `save()` / `load()` 挙動変更 / 自動バックアップ / undo / 専用モーダル / confirm 連鎖 / ボタン並び替え・色変更 / CSS / layout 変更 / 完了 toast「リセットしました」文言変更 / VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更。**リスク**: 文言面（「全」威圧 / confirm 約 50 文字 / 「支部マスタは保持」と「参加者は消える」の混同）/ 実装面（テスト追従漏れ 4 件 + E2E 1 件 / VRT 間接差分 / Codex/cowork レビュー指摘）/ 運用面（既存運営者の慣れ問題 / 押しやすくなる逆効果 → confirm 強化で緩和）。**次タスク候補**: 第一 = **`RESET-UX-FULL-RESET-LABEL-IMPL-LIGHT`**（即起票可、本 design doc PR squash merge 後の main から派生、文言変更 + テスト追従 + 任意の新規 stanza、+5〜10 行 + テスト 4-5 件追従）、第二 = 運用観察、第三 = `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（案 E 強表現）/ `RESET-UX-FULL-RESET-PLACEMENT-DESIGN`（ヘッダー撤去 / 設定タブ隔離）、第四 = `RESET-UX-TOAST-LABEL-DESIGN`（完了 toast 統一）。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files 未変更 / Codex・cowork review 自律実行なし / 後続実装タスク着手なし。

**REMOVE-PLAYER 削除不可メッセージと大会進行データリセット導線整合 IMPL-LIGHT 実装着地**: `docs/notes/20260515_shogi_remove_player_guard_message_design.md` §17 を参照（PR #115 §6.4 / §7 確定スコープ = `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT` 着手 Draft PR。HEAD `059ccdb`（PR #115 squash merge 後の main）から派生。**実装内容**: [`removePlayer`](shogi_v4.html:3761) の 2 つの削除不可 alert を PR #115 §6.4 確定文に置換 / (1) 一次禁止 alert（[`L3769 周辺`](shogi_v4.html:3769)、`if(inPairings)` ブロック）:「<氏名>は現在の組み合わせに登録されているため削除できません。\n\n別の選手に差し替える場合は「対戦相手変更」を実行してください。\n参加者一覧から削除したい場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。」— 「対戦相手変更」soft recovery 第一案温存 + 「大会進行データをリセット」第二案併記 / (2) 二次禁止 alert（[`L3781 周辺`](shogi_v4.html:3781)、`if(state.started && pastMatches>0)` ブロック）:「<氏名>には過去<N>試合分の勝敗結果があるため削除できません。\n\n参加者を削除する場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。」— 「対戦履歴」→「勝敗結果」用語統一、「リセット」→「大会進行データをリセット」具体化、`#resetBtn` 誤押下抑止 / 両 alert に「参加者一覧は残したまま」明示、PR #112 / PR #114 / `#resetProgressBtn` confirm と語彙整合。**不変項目**: 判定ロジック（`if(inPairings)` / `if(state.started && pastMatches>0)` / pastMatches の state.results 走査）/ early return 順序（一次禁止 → 二次禁止）/ 削除成功経路（`state.players[cls]=arr.filter` + `delete _pendingNewYomi[id]` + `renderRegList()` + `save()` + `verifyPlayerAbsent` + `notifySaveWarning` callsiteId 'SAVE-001-removePlayer'）/ [`resetTournamentProgressOnly()`](shogi_v4.html:5913) / [`resetAll()`](shogi_v4.html:5934) / [`startTournament()`](shogi_v4.html:4430) guard 条件 `state.started===true` + PR #114 同期更新済 alert 文言 / [`#resetProgressBtn`](shogi_v4.html:101) 文言「大会進行データをリセット」/ 既存 [`#resetBtn`](shogi_v4.html:100) 文言「大会データをリセット」/ 既存 `resetAll` confirm 文言「現在の大会データをリセットします（支部マスタは保持されます）」/ `resetTournamentProgressOnly` confirm 文言「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？」/ `normalizeState` / localStorage schema (`STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `BRANCH_MASTER_KEY='shogi_branch_master'`) / pairing algorithm (`generatePairing` / Fisher-Yates / `evaluatePairingQuality`) / 既存 helper 群（`getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` / `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` / `classifyChangePairingCandidate`）すべて変更なし。**両方該当ケース caveat**: pairings + results 両方に id が存在する参加者は early return 順序により一次禁止 alert が先に発火、二次禁止には到達しない。「対戦相手変更」で pairings から外した後、results が残っていれば次回 removePlayer 呼出で二次禁止 alert へ進む。自動連鎖は案 E（IMPL-MEDIUM 候補）へ後送り。**含めない**: `removePlayer()` 判定ロジック変更 / 自動部分リセット連鎖（案 E）/ 専用モーダル化 / UI ボタン追加 / `resetTournamentProgressOnly` / `resetAll` / `startTournament` guard 仕様変更 / `changePairing` モーダル変更 / localStorage schema / pairing algorithm / `state.results` 構造変更 / 参加者番号再採番 / 大会履歴保存 / undo / 既存 `#resetBtn` / `#resetProgressBtn` 文言変更 / 既存 confirm 文言変更 / VRT snapshot 更新。**テスト**: `test/test_remove_player_guard_message.js`（新規、静的検査 69 アサート PASS、一次禁止 / 二次禁止 alert 文言検査 6 項目ずつ + 誤誘導抑止（「大会データをリセット」非含有・「リセット」単独表現非含有）+ pastMatches+'試合' 動的文字列維持 + 判定ロジック不変 + 削除成功経路不変 + 関連機能不変 + 両方該当ケース early return 順序維持）+ `test/run_tests.sh` stanza。**既存テスト追従更新**: `test/test_reset_ux_partial_reset.js` の §22（旧文言「進行中の対局…」「対戦履歴…」expect 2 箇所）/ `test/test_reception_ux_start_button_guard.js` の §11（同 2 箇所）/ `test/run_tests.sh:109` の grep sentinel を新文言「現在の組み合わせ…」「勝敗結果…」に追従更新（テスト logic 本体不変、PR #114 IMPL-LIGHT で `test_reception_ux_start_button_guard.js` を PR #112 alert 更新に追従させたのと同パターン）。既存 75 + 新規 1 = **全 76 stanza PASS / FAIL=0 / WARN=0**。**Visual Regression 影響見込み**: alert dialog は overlay、`toHaveScreenshot` には通常映らず snapshot mismatch なし見込み。**E2E**: `grep -r '進行中の対局\|対戦履歴があるため' test/e2e/` で事前確認した結果、該当なし → 既存 E2E への影響なし見込み。**次タスク候補**: 第一 = **運用観察**（新文言で `#resetProgressBtn` 誘導が機能するか / `#resetBtn` 誤押下が消えるか / 「対戦相手変更」path が引き続き機能するか / 両方該当ケース後の二次禁止遷移が運営者に理解されるか）、第二 = `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM`（案 E 自動連鎖、観察後）、第三 = `REMOVE-PLAYER-MODAL-DESIGN`（専用モーダル化）、第四 = `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（既存 `#resetBtn` 文言「大会データを全リセット」化）、第五 = `RECEPTION-UX-RESTART-WIZARD-DESIGN`（PR #111 案 E）。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / threshold 緩和なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / index.html・data/ 変更なし / `resetAll` 仕様変更なし / `resetTournamentProgressOnly` 仕様変更なし / `startTournament` guard 条件変更なし / `removePlayer` 判定ロジック・early return 順序・削除成功経路 変更なし / 既存 `#resetBtn` / `#resetProgressBtn` 文言変更なし / 既存 confirm 文言変更なし / localStorage schema 変更なし / pairing algorithm 変更なし / Codex・cowork review 自律実行なし / 後続タスク未着手）

**REMOVE-PLAYER 削除不可メッセージと大会進行データリセット導線整合設計**: `docs/notes/20260515_shogi_remove_player_guard_message_design.md` を参照（PR #114 着地後の docs-only design check。HEAD `779803b`。**目的**: 現行 [`removePlayer()`](shogi_v4.html:3761) の **2 つの削除不可 alert** を、PR #114 で追加された「大会進行データをリセット」導線と整合させる。**現状コード確認**: 一次禁止（[`L3769`](shogi_v4.html:3769) `state.pairings[cls]` メンバーシップ）= 「進行中の対局に登録されているため削除できません。\n\n先に「対戦相手変更」で別の選手に差し替えてから削除してください。」/ 二次禁止（[`L3781`](shogi_v4.html:3781) `state.started && pastMatches>0`）= 「過去N試合分の対戦履歴があるため、大会開始後は削除できません。\n\n誤って登録した場合は「リセット」で大会をやり直してください。」/ `pastMatches` は `state.results[cls]` 走査による **ローカル変数**（state フィールド不在、PR #113 §3.2 確認済）/ 早期 return 2 段（一次→二次の順）/ 削除成功経路は `state.players[cls]=filter` + `_pendingNewYomi` 破棄 + `renderRegList()` + `save()` + SAVE-001 verify。**問題意識**: (1) 二次禁止「リセット」が `#resetBtn`（全リセット）/`#resetProgressBtn`（部分リセット）どちらか曖昧、`#resetBtn` 誤押下で参加者まで消える誤誘導リスク / (2) 「参加者一覧は残ります」が伝わらない（PR #114 で真実になったのに alert で言及していない）/ (3) 一次禁止の「対戦相手変更」soft recovery は results 保持を望む運営者にとって重要、温存すべき。**案 A〜E 比較**: A 現状維持（曖昧さ残る）/ B 理由のみ明確化（誘導不足）/ C 統一誘導（対戦相手変更 path 喪失）/ **D 条件別分岐（推奨第一、対戦相手変更 + 大会進行データをリセット 両提示 / 二次禁止は reset のみ）** / E 自動連鎖（destructive 連鎖リスク、IMPL-MEDIUM 候補）。**推奨案 D 確定文**: 一次禁止 =「<氏名>は現在の組み合わせに登録されているため削除できません。\n\n別の選手に差し替える場合は「対戦相手変更」を実行してください。\n参加者一覧から削除したい場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。」/ 二次禁止 =「<氏名>には過去<N>試合分の勝敗結果があるため削除できません。\n\n参加者を削除する場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。」 — 「進行中の対局」→「現在の組み合わせ」/「対戦履歴」→「勝敗結果」用語統一、`#resetProgressBtn` 文言と完全一致、PR #112 / PR #114 alert と語彙整合。**IMPL-LIGHT スコープ（やる）**: alert 文言 2 箇所を §6.4 確定文に置換（+5〜15 行）+ 軽量テスト 1 本（`test/test_remove_player_guard_message.js` 新規、静的検査で語句含有 + 既存判定式維持 + 早期 return 順序維持 + 削除成功経路維持 + `resetTournamentProgressOnly`/`resetAll`/`startTournament` guard 不変）+ `test/run_tests.sh` stanza + HANDOFF.md entry。**やらない**: `removePlayer()` 判定ロジック変更 / 自動部分リセット連鎖（案 E）/ 専用モーダル / UI ボタン追加 / `resetTournamentProgressOnly` / `resetAll` / `startTournament` guard 仕様変更 / `changePairing` モーダル変更 / localStorage schema / pairing algorithm / `state.results` 構造変更 / 参加者番号再採番 / 大会履歴保存 / undo / 既存 `#resetBtn` / `#resetProgressBtn` 文言変更 / 既存 confirm 文言変更 / VRT snapshot 更新。**リスク**: alert 文言長（一次 5 行 / 二次 4 行、実機確認）/ 「大会進行データ」用語の伝達性（PR #114 で導入済、繰り返し露出で定着促進）/ `#resetBtn` 混同（鉤括弧明示 + `#resetProgressBtn` 完全一致で抑制）/ 一次禁止 2 案提示で迷い（順序明示 + 条件分け）/ 既存 E2E が alert 文言 locator 持つ場合（IMPL-LIGHT 時に `grep -r '進行中の対局\|対戦履歴があるため' test/e2e/` 事前確認）。**Visual Regression 影響見込み**: alert dialog は overlay、`toHaveScreenshot` には通常映らず snapshot mismatch なし見込み。**次タスク候補**: 第一 = `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT`（運営者最終確認後即起票可）、第二 = 運用観察（`#resetProgressBtn` 誘導が機能するか / `#resetBtn` 誤押下が消えるか / 「対戦相手変更」path が引き続き機能するか）、第三 = `REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM`（案 E 自動連鎖、観察後）、第四 = `REMOVE-PLAYER-MODAL-DESIGN`（専用モーダル化）、第五 = `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（既出、PR #113 §10.2）。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files (`shogi_v4.html`/`test/`/`test/e2e/`/`.github/workflows/`/`package*.json`/`playwright.config.js`/`docs/specs/`/`index.html`/`data/`) 未変更 / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / Codex・cowork review 自律実行なし / RESET-UX-PARTIAL-RESET-IMPL-MEDIUM 未着手 / RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM 未着手 / RECEPTION-UX-RESTART-WIZARD-DESIGN 未着手 / DISPLAY-LABELS-IMPL-LIGHT 未着手 / WARNING Phase 2〜4 未着手 / CANDIDATE-FILTER 後続未着手 / 後続実装タスク着手なし）

**RESET-UX 参加者を残す大会進行データリセット IMPL-LIGHT 実装着地**: `docs/notes/20260515_shogi_reset_ux_partial_reset_design.md` §17 を参照（PR #113 §10.1 / §15 確定スコープ = `RESET-UX-PARTIAL-RESET-IMPL-LIGHT` 着手 Draft PR。HEAD `9b9cf07`（PR #113 squash merge 後の main）から派生。**実装内容**: (1) 新規 helper [`resetTournamentProgressOnly()`](shogi_v4.html:5904) を `resetAll()` 直前に追加（§17.2）。confirm:「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？」→ `state.started=false` / `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` のみ初期化 → モーダル close → 大会タブ DOM (`pane-A`/`pane-B`/`result-A`/`result-B`) clear → `save()` → `renderRegList()` → `showTab('reg')` → `showMsg('大会進行データをリセットしました','ok')`。**触らない項目**（PR #113 §8.1 R2 維持）: `state.players` / `state.rounds` / `state.tournament_id` / `state.report` / `_pendingNewYomi`/`_yomiAutoBuffer`/`_yomiManuallyEdited` / `shogi_branch_master` / `rep-*` 大会報告書 DOM / 既存 `#resetBtn` 文言 / 既存 `resetAll` confirm 文言。`BRANCH_MASTER_KEY` / `localStorage.removeItem` 参照なし（`save()` 経由のみ）/ (2) 新規ボタン [`#resetProgressBtn`](shogi_v4.html:101)「大会進行データをリセット」を `#resetBtn` 直後に追加（`.btn-danger` スタイル継承、PR #113 §7.1 C-1 新規側 + §7.3 L-1 配置）/ (3) [`bindHeaderEvents`](shogi_v4.html:5951) で click bind 追加 / (4) **PR #112 [`startTournament`](shogi_v4.html:4441) guard alert を §9.1.1 H-1 へ同期更新**:「大会はすでに開始されています。\n参加者を変更する場合は、先に「大会進行データをリセット」を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。」— 新ボタン名へ誘導 + 「参加者一覧は残したまま」を明示（部分リセット導入により真実になった、PR #111 §7.3 で書けなかった内容が解禁）。**不変項目**: `resetAll()` 本体・confirm 文言・state 再代入内容 すべて変更なし / 既存 `#resetBtn` 文言「大会データをリセット」未変更 / `removePlayer()` 一次禁止 / 二次禁止 alert / 条件 `state.started && pastMatches>0` 未変更 / `startTournament()` guard 条件 `state.started===true` / 早期 return / hasOngoing confirm 経路（fail-safe）未変更 / `normalizeState` の `base.started=!!s.started` 未変更 / localStorage schema (`STORAGE_KEY='shogi_v4'` / `LEGACY_STORAGE_KEYS=['shogi_v3']` / `BRANCH_MASTER_KEY='shogi_branch_master'`) 未変更 / pairing algorithm (`generatePairing` / Fisher-Yates / `evaluatePairingQuality`) 未変更 / 既存 helper（`getName` / `getNameWithNo` / `entryNoOf` / `formatParticipantLabel` / `pairHasRematch` / `findPairContainingPlayer` / `getDuplicatePlayersInPairings` / `classifyChangePairingCandidate`）未変更。**含めない**: 既存 `resetAll()` 仕様変更（案 D）/ 既存 `#resetBtn` 文言変更 / 既存 `resetAll` confirm 文言変更（§7.2 F-1 は IMPL-MEDIUM 送り）/ ボタン文言切替（IMPL-MEDIUM 案 D 相当）/ 案 E モーダル選択化 / 大会開始ボタン disabled 化 / 大会履歴保存 / undo / 参加者番号再採番 / 支部マスタ削除動線 / `removePlayer()` 文言改修 / WARNING Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT。**テスト**: `test/test_reset_ux_partial_reset.js`（新規、静的検査 + 軽量 mock 振る舞いテスト 9 ケース計 **81 アサート PASS**、helper 存在・ボタン bind・「触らない」7 項目への代入なきこと・`BRANCH_MASTER_KEY` 参照なし・`save`/`renderRegList`/`showTab('reg')` 呼出 / confirm 文言検査 / 内部実装語含まない / resetAll 既存挙動維持 / 既存 #resetBtn 文言不変 / startTournament guard alert 同期確認 / removePlayer 不変 / localStorage schema 不変 / pairing algorithm 不変）+ `test/run_tests.sh` stanza。`test/test_reception_ux_start_button_guard.js` も新 alert 文言「大会進行データをリセット」「参加者一覧は残したまま」に追従更新（PASS 63→64）。既存 74 + 新規 1 = **全 75 stanza PASS / FAIL=0 / WARN=0**。**Visual Regression 影響見込み**: header に `#resetProgressBtn` を追加したため header VRT snapshot が **mismatch する可能性あり**（既存 `#resetBtn` 文言・配置は不変のため影響は新ボタン分のみ）→ red になった場合は自律更新せず判断仰ぐ。**E2E**: 追加なし（既存 E2E への影響は PR #112 alert 文言を locator に持つテストがあれば追従更新が要、本 PR では未確認）。**次タスク候補**: 第一 = **運用観察**（部分リセット動線が UC1（受付後組み合わせ作り直し）/ UC2（参加者修正）を救うか / 2 ボタン混同なきか / VRT red 対応）、第二 = `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM`（案 E モーダル選択化、観察後）、第三 = `RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`（既存 `#resetBtn` 文言「大会データを全リセット」化 + `resetAll` confirm §7.2 F-1）、第四 = `RECEPTION-UX-START-BUTTON-GUARD-IMPL-MEDIUM`（PR #111 案 D ボタン文言切替）、第五 = `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`（独立進行可）。今回は Draft PR / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / VRT snapshot 更新なし / threshold 緩和なし / CI 設定変更なし / package 変更なし / docs/specs 変更なし / index.html・data/ 変更なし / `resetAll` 仕様変更なし / 既存 `#resetBtn` 文言変更なし / 既存 `resetAll` confirm 文言変更なし / `removePlayer` 仕様変更なし / `startTournament` guard 条件変更なし / localStorage schema 変更なし / pairing algorithm 変更なし / Codex・cowork review 自律実行なし / 後続タスク未着手）

**RESET-UX 参加者を残す大会進行データリセット設計 (PR #113 review 反映)**: `docs/notes/20260515_shogi_reset_ux_partial_reset_design.md` を参照（PR #113 review 反映済の docs-only design。**Review 反映内容**: (1) **`state.rounds`（複数）は実在** = 大会設定値であり、部分リセットで **残す** へ修正（§6.3 R2、初版の R1「4 に戻す」から反転）。`state.round`（単数）/ `state.history` / `state.pastMatches` は実体不在の整理は維持、現在ラウンドは `state.results[cls].length` 導出を明記 / (2) **`state.tournament_id` を部分リセットで残す方針を確定**（§6.1 / §9.4 T-1、消すと支部マスタ連携 attendance_count / tournament_ids union で別大会扱いされる懸念）/ (3) **`state.report` / `_pendingNewYomi` / `_yomiAutoBuffer` / `_yomiManuallyEdited` も部分リセットで残す**（§6.4 R2 / §6.5 R2、大会単位の情報として参加者と整合）/ (4) **PR #112 startTournament guard alert 文言を新ボタン名に同期する方針を IMPL-LIGHT 必須スコープに明記**（§9.1.1 H-1 推奨「大会はすでに開始されています。\n参加者を変更する場合は、先に『大会進行データをリセット』を実行してください。\n大会進行データをリセットすると、参加者一覧は残したまま、現在の組み合わせ・勝敗結果は削除されます。」— 部分リセット導入により「参加者一覧は残ります」が真実になり、PR #111 §7.3 で書けなかった内容が書けるようになった）/ (5) **IMPL-LIGHT スコープ確定**: helper `resetTournamentProgressOnly()` 追加 + 新規ボタン `#resetProgressBtn` 追加 + PR #112 alert 同期更新 + 軽量テスト。**既存 `#resetBtn` 文言・既存 `resetAll` confirm 文言は変更しない**（§10.2、既存に触れない方針、IMPL-MEDIUM へ送る）/ (6) **§6.7 サマリ表**: A カテゴリを「参加者データ / 大会単位データ」に拡張（`state.players` / `state.tournament_id` / `state.rounds` / `state.report` / `_pendingNewYomi` 等）、B カテゴリを「局単位データ」（`state.pairings` / `state.results` / `state.started` のみ）に縮小 / (7) §11 テスト方針更新: 「触らない」項目への代入なきこと（players / tournament_id / rounds / report / _pendingNewYomi 等）/ rep-* DOM clear なきこと / PR #112 alert 文言更新確認 / 既存 #resetBtn・resetAll confirm 不変確認。**現状コード確認は初版から不変**: `resetAll()` は state.players も含めて全消去、`BRANCH_MASTER_KEY` 保持、helper 分割容易、localStorage schema 変更不要。**推奨 Next Action**: `RESET-UX-PARTIAL-RESET-IMPL-LIGHT` 即起票可、運営者最終確認後着手。**やっていないこと**: 実装未着手 / テスト未変更 / snapshot 未変更 / Ready 化なし / merge なし / Codex・cowork review 自律実行なし / RESET-UX-PARTIAL-RESET-IMPL-LIGHT 未着手 / RECEPTION-UX-RESTART-WIZARD-DESIGN 未着手 / DISPLAY-LABELS-IMPL-LIGHT 未着手 / WARNING Phase 2〜4 未着手 / 後続タスク未着手）

**RESET-UX 参加者を残す大会進行データリセット設計 (初版)**: `docs/notes/20260515_shogi_reset_ux_partial_reset_design.md` を参照（PR #112 着地後の docs-only design check の初版。HEAD `52a1c3f`。**背景**: PR #111 / #112 で「`startTournament` を開始操作専用に絞り、大会開始後の再クリックは `resetAll` へ誘導」する設計が確定したが、誘導先の [`resetAll`](shogi_v4.html:5904) は **`state.players` も含めて全消去**（[L5906](shogi_v4.html:5906)、`{players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:...}` に state を再代入 + `STORAGE_KEY`/`LEGACY_STORAGE_KEYS` localStorage 削除 + DOM clear、`BRANCH_MASTER_KEY`(`shogi_branch_master`) は「絶対に消さない」コメント明示で保持）= 受付済参加者を残して組み合わせだけやり直すことが現状不可能。**現状コード確認**: `state` 構造は `players` / `rounds` / `pairings` / `results` / `started` / `report` のみで **`state.history` / `state.pastMatches` / `state.round`（単数）はいずれも実体不在**（`pastMatches` は [`removePlayer`](shogi_v4.html:3760) 内ローカル変数、`state.results` 走査で算出）/ 「参加者を残して進行データだけ消す」helper は存在せず / `state` 再代入が 1 行に集約されているため分割は容易 / localStorage schema 変更不要。**ユースケース UC1〜UC4**: UC1 受付完了後 1 局目前の組み合わせ再生成（**現状不可、部分リセット最有力動機**）/ UC2 1 局目以降の参加者修正（受付情報を残しつつ進行データだけ消す、「まとめてやり直す」用途）/ UC3 大会完全やり直し（現行 `resetAll` で OK）/ UC4 支部マスタ保持（既存 `resetAll` で満たす）。**案 A〜E 比較**: A 現状維持（✗ UC1/UC2 救えず）/ B 文言のみ「全リセット」明示（補助、UC1/UC2 救えず）/ **C 「大会進行データリセット」追加（推奨第一）**（◎ UC1、◯ UC2/UC3、要 PR #112 alert 同期更新）/ D `resetAll` 仕様変更（破壊的、PR #112 alert と矛盾）/ E モーダル選択化（◎ だが IMPL-LIGHT に重い、IMPL-MEDIUM 候補）。**データ分類 3 カテゴリ**: **A 参加者データ**（`state.players` / `entry_no` / `member_id` / `member` / `grade` / `tournament_id`、部分=残す/全=消す）/ **B 大会進行データ**（`state.pairings` / `state.results` / `state.started` / `state.rounds` / `state.report` / `_pendingNewYomi`/`_yomiAutoBuffer`/`_yomiManuallyEdited`、部分=消す/全=消す）/ **C マスタデータ**（`shogi_branch_master`、部分=残す/全=残す）。**部分リセットで残すもの**: `state.players` 配列・要素 すべて（受付番号維持、配列順物理改変なし）/ `state.tournament_id` / `shogi_branch_master`。**部分リセットで消すもの**: `state.pairings={A:[],B:[]}` / `state.results={A:[],B:[]}` / `state.started=false` / `state.rounds=4`（resetAll と揃える、§6.3 R1）/ `state.report=初期値`（同 §6.4 R1）/ `_pendingNewYomi`/`_yomiAutoBuffer`/`_yomiManuallyEdited` 初期化（§6.5 R1）/ 大会タブ DOM (`pane-A`/`pane-B`/`result-A`/`result-B`) clear / 開きっぱなしモーダル close。**全リセットで残すもの**（既存）: `shogi_branch_master` のみ。**全リセットで消すもの**（既存）: `state` 全フィールド + `STORAGE_KEY`/`LEGACY_STORAGE_KEYS` localStorage entry。**UI / 文言案**: ボタン §7.1 第一推奨 = **C-1「大会進行データをリセット」/「大会データを全リセット」**（既存名温存 + 「全」を足す、段階移行）、第二 = C-2「組み合わせ・勝敗をリセット」/「参加者も含めて全リセット」（より直感的だが VRT/E2E 影響大、観察後 IMPL-MEDIUM）/ 部分リセット confirm §7.2 P-3 推奨 = 「参加者は残ります。\n組み合わせ・勝敗結果を削除します。\n支部マスタは保持されます。\nよろしいですか？」/ 全リセット confirm §7.2 F-1 推奨 = 「参加者・組み合わせ・勝敗結果をすべて削除します。\n支部マスタは保持されます。\nよろしいですか？」/ PR #112 alert §9.1.1 **G-2 推奨**（UC1 / UC3 分離: 「組み合わせを作り直すには『組み合わせ・勝敗をリセット』を実行してください。\n参加者ごと最初からやり直すには『大会データを全リセット』を実行してください。」）。**整合**: 部分リセット後は `state.started=false`/`pairings=空`/`results=空` のため (a) PR #112 guard をすり抜け `startTournament` 再実行可能、(b) `removePlayer` 一次禁止（pairings メンバーシップ）/ 二次禁止（`state.started && pastMatches>0`）双方が自然解除、(c) 参加者の追加・削除・修正がすべて可能。**IMPL-LIGHT 候補**: `resetTournamentProgressOnly()` helper 追加（+20〜40 行、`state.players`/`state.tournament_id` 不変、他は §8.2 仕様）+ 新規ボタン `#resetProgressBtn` を header に追加（既存 `#resetBtn` 隣接、`.btn-danger` スタイル）+ `bindHeaderEvents` で click bind + 既存 `#resetBtn` 文言更新 + 既存 `resetAll` confirm 文言更新（F-1）+ PR #112 alert 文言更新（G-2）+ `test/test_reset_ux_partial_reset.js` 新規（静的 + 軽量 mock 振る舞い）+ `test/run_tests.sh` stanza。**含めない**: 案 D `resetAll` 仕様破壊的変更 / 案 E モーダル選択 / `removePlayer` 判定変更 / 大会履歴保存 / undo / 参加者番号再採番 / 支部マスタ削除動線 / pairing algorithm 変更 / `evaluatePairingQuality` 変更 / 既存 helper 本体変更 / localStorage schema 変更 / WARNING Phase 2〜4 / DISPLAY-LABELS-IMPL-LIGHT。**リスク**: ボタン 2 個で混乱（confirm 文言と destructive スタイルで抑制）/ 「進行データ」概念伝わらない（観察後 C-2 へ）/ `state.players` 整合崩れ（静的検査で `state.players=` 再代入なきこと保証）/ pastMatches 喪失（部分リセットの動機そのもの、明示）/ PR #112 整合（alert 同期更新で対応）/ マスタ誤削除（helper 内 `BRANCH_MASTER_KEY` 参照ゼロを静的検査）/ VRT red（`#resetBtn` 文言変更・新ボタン追加で snapshot mismatch 見込み、自律更新せず判断仰ぐ）/ E2E locator 影響（`大会データをリセット` を持つ E2E あれば追従更新）。**Visual Regression 影響見込み**: header VRT は IMPL-LIGHT 着地時に **red になる見込み**（`#resetBtn` 文言変更 + 新ボタン追加）→ 自律更新せず判断仰ぐ。**次タスク候補**: 第一 = `RESET-UX-PARTIAL-RESET-IMPL-LIGHT`（運営者最終確認後即起票可、helper + ボタン + 既存文言更新 + PR #112 alert 同期更新 + 軽量テスト）、第二 = 運用観察（UC1 救済 / 2 ボタン混同有無 / 文言伝達性）、第三 = `RESET-UX-PARTIAL-RESET-IMPL-MEDIUM`（案 E モーダル選択化）、第四 = `RECEPTION-UX-START-BUTTON-GUARD-IMPL-MEDIUM`（PR #111 案 D ボタン文言切替）、第五 = `PAIRING-UX-DISPLAY-LABELS-IMPL-LIGHT`（独立進行可）。今回は docs-only / 実装変更なし / テスト変更なし / Visual Regression snapshot 未変更 / forbidden files (`shogi_v4.html`/`test/`/`test/e2e/`/`.github/workflows/`/`package*.json`/`playwright.config.js`/`docs/specs/`) 未変更 / Ready 化なし / merge なし / main 直接 push なし / release・deploy・publish なし / branch 削除なし / Codex・cowork review 自律実行なし / RECEPTION-UX-START-BUTTON-GUARD 後続 (IMPL-MEDIUM) 未着手 / CANDIDATE-FILTER 後続未着手 / DISPLAY-LABELS-IMPL-LIGHT 未着手 / WARNING Phase 2〜4 未着手 / 後続実装タスク着手なし）

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
