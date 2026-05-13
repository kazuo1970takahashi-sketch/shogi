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

**残タスク候補**:
- A-5.1-SAVE-UX（warn 集約・retry UI・文言短縮・debounce・aria-live・toast 集約）
- A-5.1 保存安全化の区切り判定（SAVE-003b 完了で Must スコープは概ね一巡、残候補の優先順位と区切り宣言を別タスクで整理）

**関連完了済 PR（SAVE 系本流とは別系統）**:
- SEC-HYGIENE-001（PR #56、commit `9c21341`）: `trufflesecurity/trufflehog@main` → `@v3.95.3` への pinning。Mini Shai-Hulud 第二波 影響確認時に発見した一般 supply-chain hygiene 改善（IoC とは無関係）

**詳細**: `docs/notes/20260513_shogi_a5_1_save_completion_summary_v0.md`

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
