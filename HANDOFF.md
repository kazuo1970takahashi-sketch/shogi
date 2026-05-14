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
