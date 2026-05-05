# 沼津支部 月例将棋大会アプリ Phase A-2.5 設計仕様書 v6.5

**作成日時**: 2026-05-05 10:06 JST
**作成**: 髙橋一雄 × Claude（設計）
**前 Phase**: Phase A-2（main マージ済み、commit `ef113ae`）+ index.html 更新（commit `d0972a5`）
**根拠仕様書**: Phase A-2 仕様書 v6（`docs/specs/20260505_0753_shogi_design_phaseA2_v6.md`）
**保留中フェーズ**: Phase A-3 v7（`docs/specs/20260505_0941_shogi_design_phaseA3_v7.md`、`feat/phase-a3-master-mgmt` ブランチに配置済み、本フェーズ完了後に着手予定）
**レビュー予定**: ChatGPT 設計メタレビュー → Claude Code 実装 → Codex 実装レビュー
**v1.2 Slim 6.2節「フルサイクル」4周目開始**（A-3 v7 の前に挟む小サイクル）

### 改訂履歴

| バージョン | 日時 | 変更点 |
|---|---|---|
| Phase A-2 v6 | 2026-05-05 07:53 | Phase A-2 完了（main マージ済） |
| Phase A-3 v7 | 2026-05-05 09:41 | A-3 設計（保留中、A-2.5 完了後に再開）|
| **Phase A-2.5 v6.5** | **2026-05-05 10:06** | **マイグレ機能のテキスト貼り付け化 + 「JSON」用語撤廃** |

---

## 1. 概要

### 1.1 Phase A-2.5 の位置づけ

実機テスト中に発見した **構造的矛盾** を解消するための小規模フェーズ。

A-3 で F8 エクスポート/インポート機能を追加する前に、現状の **マイグレ機能と保存機能の不整合** を解消する必要があると判断。これを A-3 着手前の独立フェーズとして実施する。

### 1.2 発見された問題（実機テスト由来、2026-05-05）

#### 問題1：用語の運営者非対応

「JSONバックアップ保存」「JSONを貼り付け」「JSONファイルを選択」など、**「JSON」という技術用語** が UI 全面に登場している。
将棋大会の運営者（技術者ではない）には意味不明。

#### 問題2：マイグレ機能の構造的矛盾

「マスタ」タブの「📥 過去大会を支部マスタに統合」は **JSON ファイル選択（`<input type="file">`）を強制** する。

しかし：
- 大会データの保存は **クリップボードコピーが優先**（HTTPS環境）
- ファイルダウンロードはあくまで **HTTPS 失敗時のフォールバック**
- 運営者は通常運用で「JSONファイル」を持っていない
- → **マイグレに入れるファイルが、通常運用では作られない**

#### 問題3：既存の「貼り付け」UI と不整合

データ読み込み画面には既に「JSONを貼り付け」のテキストエリアがある（2213-2214行目）。
**読み込みは貼り付け方式が既に動いているのに、マイグレだけがファイル選択方式** になっている。

### 1.3 v6.5 の方針

| 方針 | 内容 |
|---|---|
| **保存ボタンは現状維持** | クリップボード優先 + ファイルフォールバック動作はそのまま |
| **マイグレ UI を貼り付け方式に変更** | ファイル選択を撤廃、テキストエリアに統一 |
| **「JSON」用語を運営者向けに置換** | shogi_v4.html / index.html の UI 文言から「JSON」を撤廃 |
| **保存→マイグレの動線を一貫させる** | クリップボードコピー → 貼り付けマイグレ |

### 1.4 含む機能（4項目）

| ID | 機能 | 規模 | 出典 |
|---|---|---|---|
| **M1** | マイグレ UI のテキスト貼り付け化 | 中 | 構造矛盾解消 |
| **M2** | UI 文言の「JSON」撤廃（shogi_v4.html）| 小 | 用語整理 |
| **M3** | UI 文言の「JSON」撤廃（index.html）| 小 | 用語整理 |
| **M4** | マイグレ関連メッセージの整合 | 小 | 用語整理 |

### 1.5 含めない機能（A-3 以降）

- F7 マスタ編集（A-3 で実装、本フェーズの範囲外）
- F8 エクスポート/インポート（A-3 で実装、本フェーズの範囲外）
- クイックフィルタ（A-3 で実装、本フェーズの範囲外）
- 保存ボタンの撤廃（運用変更が大きすぎる、A-3 完了後に検討）
- 保存方式の根本変更（自動保存のみへ等、運用変更が大きすぎる、A-3 完了後に検討）

---

## 2. データモデル変更

**変更なし**（schema_version: 1 維持）。

A-2.5 は UI 文言とマイグレ入力 UI のみの変更で、データモデルへの影響はない。

---

## 3. 機能仕様

### 3.1 M1: マイグレ UI のテキスト貼り付け化

#### 3.1.1 現状

`buildMigrationModalHtml()`（1048-1065行目周辺）：

```html
<input type="file" id="mig-files" accept=".json" multiple>
[統合を実行]
```

`bindMigrationModalEvents()`（1072-1091行目）：
- `mig-files.files` を取得
- `parseTournamentJsonFiles(files)` で FileReader → JSON.parse
- `mergeTournamentParticipantsIntoMaster()` で統合

#### 3.1.2 変更後の UI

```
┌─ 過去大会データを支部マスタに統合 ─────────────┐
│ ⚠️ 既存の支部マスタが破損していました...        │
│   （破損時のみ表示、A-2 Codex Minor #1）        │
│                                                │
│ 過去の大会データをマスタに取り込みます。       │
│                                                │
│ 「大会データをコピー」したテキストを貼り付け：  │
│ ┌──────────────────────────────────────────┐  │
│ │  [テキストエリア、複数行可]                │  │
│ │                                            │  │
│ └──────────────────────────────────────────┘  │
│ 例：「大会データをコピー」のクリップボード    │
│ 内容を貼り付け（複数大会の場合は、空行で      │
│ 区切って連続貼り付け可）                      │
│                                                │
│ ステータス: （結果サマリ表示エリア）            │
│                                                │
│ [統合を実行]  [閉じる]                          │
└────────────────────────────────────────────────┘
```

#### 3.1.3 入力フォーマット仕様

**単一大会**：
1つの大会データ JSON をそのまま貼り付け：
```json
{
  "schema_version": 1,
  "type": "shogi_tournament",
  "ymd": "2026-04-15",
  ...
}
```

**複数大会**：
複数の大会データを **空行（連続改行）で区切って** 貼り付け：
```json
{ "schema_version": 1, ... 大会1 ... }

{ "schema_version": 1, ... 大会2 ... }

{ "schema_version": 1, ... 大会3 ... }
```

#### 3.1.4 パース処理

新規ユーティリティ関数 `parseTournamentTextInput(text)` を追加：

```javascript
function parseTournamentTextInput(text) {
  // 1. text を空行で分割
  // 2. 各ブロックを JSON.parse
  // 3. 各々 normalizeState を試みる
  // 4. 成功した tournament の配列を返す
  // 5. 失敗時はエラーメッセージを集約して throw
}
```

返り値：
```javascript
{
  tournaments: [{raw, source: "block N"}, ...],
  errors: ["block 2: パース失敗 ...", ...]
}
```

#### 3.1.5 統合処理

既存の `mergeTournamentParticipantsIntoMaster(tournaments, master)` を **そのまま再利用**。
入力経路（テキストエリア vs ファイル）が変わるだけで、統合ロジックは変更なし。

#### 3.1.6 エラーハンドリング

| エラー | メッセージ |
|---|---|
| テキストエリア空 | 「大会データを貼り付けてください」 |
| 全ブロックがパース失敗 | 「貼り付けたデータの形式が正しくありません。『大会データをコピー』した内容を貼り付けてください」 |
| 一部ブロックがパース失敗 | 「N件中M件を読み込みました。残りはパース失敗：[詳細]」 |
| schema_version 不一致 | 「未対応の大会データバージョンです（schema_version: X）」 |

#### 3.1.7 ファイル選択 UI の撤廃

- `<input type="file" id="mig-files">` を **削除**
- `parseTournamentJsonFiles(files)` 関数を **削除または非公開化**
- 関連するイベントハンドラも整理

ただし、「JSON貼り付け読み込み」UI（2213行目周辺、`load-paste-area`）は別機能（大会データ全体の読み込み）なので **そのまま残す**。M2 で文言だけ整える。

### 3.2 M2: UI 文言の「JSON」撤廃（shogi_v4.html）

#### 3.2.1 置換対象

| 行 | 現在の表記 | 新表記 |
|---|---|---|
| 86 | `JSONバックアップ保存`（ボタン） | **大会データをコピー** |
| 327 | `JSONバックアップを保存してください。`（保存失敗時のメッセージ）| `大会データをコピー（バックアップ）してください。` |
| 541 | コメント `BRANCH MASTER SYNC (F2): 大会JSONバックアップ保存時のマスタ同期` | コメント `BRANCH MASTER SYNC (F2): 大会データコピー時のマスタ同期` |
| 1043 | コメント `MIGRATION WIZARD (F9): 過去大会JSONを支部マスタに統合` | コメント `MIGRATION WIZARD (F9): 過去大会データを支部マスタに統合` |
| 1055 | `過去の大会JSONファイルを読み込んで`（説明文）| `過去の大会データを取り込んで` |
| 1076 | `JSONファイルを選択してください` | （撤廃、M1 で「大会データを貼り付けてください」に置換）|
| 1118 | エラー `JSONファイル のパースに失敗：` | （撤廃、M1 で削除）|
| 1121 | エラー `JSONファイル の読込に失敗` | （撤廃、M1 で削除）|
| 2095 | `console.warn('支部マスタが破損しているため自動同期をスキップ（大会JSON保存は継続）');` | `console.warn('支部マスタが破損しているため自動同期をスキップ（大会データのコピーは継続）');` |
| 2096 | `showMsg('...（大会JSON保存は継続）','warn');` | `showMsg('...（大会データのコピーは継続）','warn');` |
| 2113 | コメント `// F2: 大会JSONバックアップ保存時に支部マスタへ同期...` | コメント `// F2: 大会データコピー時に支部マスタへ同期...` |
| 2118 | `'JSONをクリップボードにコピーしました。\n\nメモ帳やEvernoteに貼り付けて保管してください。'` | **`'大会データをコピーしました。\n\nメモ帳やEvernoteに貼り付けて保管してください。\n\n次回大会前に「マスタ」タブの統合機能で取り込めます。'`** |
| 2151 | コメント `読み込み済みの生JSON文字列をstate反映してUIを更新（ファイル/貼り付け共通）` | コメント `読み込み済みのデータをstate反映してUIを更新` |
| 2192 | `'JSONを貼り付けてください'` | `'大会データを貼り付けてください'` |
| 2199 | `'読み込みに失敗しました。正しいJSONか確認してください'` | `'読み込みに失敗しました。正しい大会データか確認してください'` |
| 2213 | `<label>JSONを貼り付け</label>` | `<label>大会データを貼り付け</label>` |
| 2214 | `placeholder="ここにJSONを貼り付けてください"` | `placeholder="ここに大会データを貼り付けてください"` |

#### 3.2.2 内部識別子は変更しない

以下は **コード内部の識別子** なので **変更しない**：
- `id="saveBtn"`, `id="mig-files"`, `id="load-paste-area"` など
- 関数名 `saveData`, `parseTournamentJsonFiles`（M1 で削除する場合は別）
- 変数名 `json`, `JSON.stringify`, `JSON.parse` などコード上の `JSON` キーワード
- 内部コメントの「JSON 文字列」表現（必要に応じて整理）

理由：UI 文言と内部識別子は分離して管理するのが保守性高い。

#### 3.2.3 ファイルダウンロード経路（フォールバック）の文言

`saveDataAsFile()`（2127-2149行目周辺）：

| 行 | 現在 | 新 |
|---|---|---|
| 2145 | `alert(filename+'に保存しました');` | `alert(filename+' に保存しました（端末のダウンロードフォルダ）');` |
| 2147 | `alert('保存に失敗しました');` | `alert('保存に失敗しました');`（変更なし）|

ファイル名 `shogi_YYYYMMDD_HHMM.json` は **変更しない**（拡張子が `.json` なのは技術的事実、変えるとファイル関連付けが壊れる）。

### 3.3 M3: UI 文言の「JSON」撤廃（index.html）

#### 3.3.1 該当箇所

`index.html` の §当日の流れ Step 2 + §注意事項：

| 現在 | 新 |
|---|---|
| 「保存」ボタンでJSONファイルとしてバックアップできます。 | **「大会データをコピー」ボタンでクリップボードにコピーできます。** |
| 誤ってブラウザを閉じた場合は「読み込み」ボタンで復元できます。 | 誤ってブラウザを閉じた場合は「読み込み」ボタンで貼り付けて復元できます。 |
| JSONバックアップ保存時に支部マスタも自動更新されるため、毎月の保存習慣を続けるだけで参加履歴が蓄積されます。（M3 で追記済み）| **大会データをコピーする時に支部マスタも自動更新されるため、毎月のコピー習慣を続けるだけで参加履歴が蓄積されます。** |

### 3.4 M4: マイグレ関連メッセージの整合

M1 で導入する貼り付け方式に合わせたメッセージ：

| シーン | メッセージ |
|---|---|
| 統合実行ボタン押下時、テキストエリア空 | 「大会データを貼り付けてください」 |
| 統合実行中 | 「読み込み中...」（既存維持）|
| 統合成功 | 「N大会を読込：新規追加M名 / 既存統合K件 / スキップL件」（既存維持、文言は M2 で「データ」に統一）|
| パース失敗 | 「読み込みに失敗：[詳細]」（既存維持）|

---

## 4. UI 仕様の更新

### 4.1 マイグレモーダル

`buildMigrationModalHtml(opts)` を以下のように変更：

```javascript
function buildMigrationModalHtml(opts) {
  opts = opts || {};
  var html = '';
  html += '<div style="background:#fff;border-radius:8px;padding:24px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto">';

  // 警告バナー（破損時のみ）
  if (opts.corrupted) {
    html += '<div class="mig-corrupt-warning">⚠️ 既存の支部マスタが破損していました。このマイグレーションで再構築されます。（既存マスタは破棄されます）</div>';
  }

  html += '<h3 style="margin-top:0">過去大会データを支部マスタに統合</h3>';
  html += '<p>過去の大会データをマスタに取り込みます。</p>';
  html += '<p style="font-size:13px;color:#444">「大会データをコピー」したテキストを貼り付けてください：</p>';

  // ★ 変更：input type="file" → textarea
  html += '<textarea id="mig-paste-area" rows="8" style="width:100%;font-size:12px;font-family:monospace;border:1px solid #ccc;padding:8px;box-sizing:border-box" placeholder="ここに大会データを貼り付けてください"></textarea>';
  html += '<p style="font-size:12px;color:#666;margin-top:8px">複数大会の場合は、空行で区切って連続貼り付け可</p>';

  html += '<div id="mig-status" style="margin:12px 0;font-size:13px"></div>';

  html += '<div style="text-align:right;margin-top:16px">';
  html += '<button type="button" id="mig-cancel" class="btn-sm" style="margin-right:8px">閉じる</button>';
  html += '<button type="button" id="mig-run" class="btn-primary">統合を実行</button>';
  html += '</div>';

  html += '</div>';
  return html;
}
```

### 4.2 マイグレモーダル イベントハンドラ

`bindMigrationModalEvents()` を以下のように変更：

```javascript
function bindMigrationModalEvents() {
  var cancelBtn = document.getElementById('mig-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeMigrationWizard);

  var runBtn = document.getElementById('mig-run');
  if (runBtn) runBtn.addEventListener('click', function() {
    var textarea = document.getElementById('mig-paste-area');
    var text = textarea ? textarea.value : '';

    if (!text.trim()) {
      alert('大会データを貼り付けてください');
      return;
    }

    var statusEl = document.getElementById('mig-status');
    if (statusEl) statusEl.textContent = '読み込み中...';

    try {
      var parsed = parseTournamentTextInput(text);  // ★ 新規関数
      var tournaments = parsed.tournaments;

      if (tournaments.length === 0) {
        if (statusEl) statusEl.textContent = '読み込みに失敗：' + (parsed.errors[0] || 'データ形式が正しくありません');
        return;
      }

      var master = loadBranchMaster();
      var summary = mergeTournamentParticipantsIntoMaster(tournaments, master);
      saveBranchMaster(master);

      var msg = summary.tournaments + '大会を読込：新規追加' + summary.added + '名 / 既存統合' + summary.matched + '件 / スキップ' + summary.skipped + '件';
      if (parsed.errors.length > 0) {
        msg += '（' + parsed.errors.length + '件パース失敗）';
      }
      if (statusEl) statusEl.textContent = msg;

      renderMasterTab();
      renderPastParticipantsPanel();

    } catch (err) {
      if (statusEl) statusEl.textContent = '読み込みに失敗：' + (err && err.message ? err.message : String(err));
    }
  });
}
```

### 4.3 ボタン文言

86行目：

```html
<!-- 旧 -->
<button type="button" class="btn-sm no-print" id="saveBtn" style="background:#27500A;color:#fff;border-color:#27500A">JSONバックアップ保存</button>

<!-- 新 -->
<button type="button" class="btn-sm no-print" id="saveBtn" style="background:#27500A;color:#fff;border-color:#27500A">大会データをコピー</button>
```

### 4.4 saveData() の alert メッセージ

2118行目：

```javascript
// 旧
alert('JSONをクリップボードにコピーしました。\n\nメモ帳やEvernoteに貼り付けて保管してください。');

// 新
alert('大会データをコピーしました。\n\nメモ帳やEvernoteに貼り付けて保管してください。\n\n次回大会前に「マスタ」タブの統合機能で取り込めます。');
```

---

## 5. テスト計画

### 5.1 既存テスト維持（最重要）

A-2 v6 時点の全テスト（既存 50 + 支部マスタ 256 = 計 306）を **すべて緑のまま維持**。

特に既存の `mergeTournamentParticipantsIntoMaster()` のロジックテスト（145件）は変更なしで動くこと。

### 5.2 新規追加テスト

#### 5.2.1 M1: parseTournamentTextInput()

- 単一大会の JSON を貼り付け → tournaments が1件
- 複数大会を空行区切りで貼り付け → tournaments が複数件
- 空文字列 → tournaments が0件、errors に何もなし
- 空白だけの文字列 → tournaments が0件
- 不正な JSON → tournaments が0件、errors に1件
- 一部不正（3件中2件成功） → tournaments が2件、errors に1件
- 末尾の余分な改行・空行を許容
- BOM 付き UTF-8 を許容（運営者が Word からコピペする可能性）

#### 5.2.2 M1: マイグレ統合動作

- 貼り付け → 統合実行 → マスタ更新
- 統合後に `renderMasterTab()` / `renderPastParticipantsPanel()` 再描画
- ステータス表示が正しい
- パース失敗時のエラーメッセージ

#### 5.2.3 M2: shogi_v4.html UI 文言

- ボタン「大会データをコピー」が表示される
- 「JSON」を含む UI 文字列が（コード内部以外で）見つからないこと
- 保存時の alert メッセージが新文言

#### 5.2.4 M3: index.html 文言

- 手動目視確認（テスト不要）

### 5.3 性質テスト

- 既存マスタ統合ロジックが入力経路（テキスト vs ファイル）に依存しない
- 同じ大会データを「コピー → 貼り付け」して取り込むと、`mergeTournamentParticipantsIntoMaster` の結果が「ファイル選択」時と同じ
- 「JSON」用語が UI から消えていることの全体確認（grep ベース）

### 5.4 既存大会運営の非破壊

- 保存ボタンの動作は変わらない（クリップボードコピー優先）
- 大会データの読み込み（既存 `load-paste-area`）は変わらない
- 参加者登録 / 対局管理 / 最終結果タブは変わらない

---

## 6. 実装順（推奨フェーズ分け）

Claude Code 実装時のコミット粒度：

```
Stage 1: ChatGPT メタレビュー結果の docs 配置
Stage 2: parseTournamentTextInput() 関数追加 + テスト
Stage 3: マイグレモーダル UI を貼り付け方式に変更
Stage 4: マイグレモーダル イベントハンドラ書き換え
Stage 5: parseTournamentJsonFiles() 削除 + 関連クリーンアップ
Stage 6: M2 UI 文言の「JSON」撤廃（shogi_v4.html）
Stage 7: M3 UI 文言の「JSON」撤廃（index.html）
Stage 8: 動作確認 + プッシュ + PR 作成
```

A-2.5 は規模が小さいので、**Stage 2〜5 をまとめて1コミット**にする選択肢もある。実装時に判断。

---

## 7. ChatGPT メタレビュー観点（依頼用）

このドキュメントを ChatGPT に渡す際、以下の観点でレビュー依頼します：

### A. 構造矛盾解消の妥当性
- マイグレ機能をテキスト貼り付け方式に変更する判断
- ファイル選択 UI の撤廃で運用に支障が出るケース
- 既存の `load-paste-area`（大会読み込み）と一貫性が取れているか

### B. 用語整理のスコープ
- 「JSON」を UI から完全撤廃する判断
- 内部識別子（id, 関数名, JSON.stringify 等）を変更しない判断
- ファイル名 `shogi_YYYYMMDD_HHMM.json`（拡張子）を変更しない判断

### C. 後方互換性
- 既存マスタ・既存大会データ（schema_version: 1）への影響なし
- A-1/A-2 の機能（306アサーション）が緑のまま維持

### D. UX への影響
- 運営者が「コピー → 貼り付け」フローに違和感なく移行できるか
- alert メッセージの追加情報「次回大会前に『マスタ』タブの統合機能で取り込めます」が誘導として機能するか
- 複数大会を空行区切りで貼り付ける UI の説明が分かりやすいか

### E. parseTournamentTextInput() の堅牢性
- 空行検出ロジックの妥当性（どこまでが1大会か）
- BOM 対応、改行コード差異（CRLF/LF）対応
- 一部失敗時のエラーレポート

### F. YAGNI / 過剰設計
- M1〜M4 の中で削除すべき項目
- A-3 v7 と前後関係で重複や齟齬がないか

### G. A-3 v7 への影響
- A-3 で F8 エクスポート/インポートを実装する際、A-2.5 の用語と整合するか
- A-3 v7 仕様書を v7.1 に書き直す必要があるか

### H. テスト計画の十分性

### I. 既存機能への破壊リスク
- 保存ボタン（saveData）への影響
- 既存 `load-paste-area` との UI 重複（ユーザーの混乱）

---

## 8. 決定事項（v6.5 で確定）

| # | 論点 | 決定内容 |
|---|---|---|
| 1 | A-2.5 スコープ | M1〜M4 の4項目（マイグレ貼り付け化 + 「JSON」用語撤廃）|
| 2 | 保存ボタン | 現状維持（クリップボード優先 + ファイルフォールバック）|
| 3 | マイグレ入力方式 | テキストエリア貼り付けに統一、ファイル選択 UI 撤廃 |
| 4 | 「JSON」用語 | UI 文言から完全撤廃、内部識別子は変更しない |
| 5 | ファイル名 `shogi_YYYYMMDD_HHMM.json` | 変更しない（技術的事実）|
| 6 | データモデル | 変更なし（schema_version: 1 維持）|
| 7 | 複数大会の貼り付け | 空行区切りでサポート |
| 8 | A-3 v7 との関係 | A-2.5 完了後に v7 仕様書を見直し（v8 への書き直しの可能性）|

---

## 9. A-2.5 完結条件

- [ ] マイグレ機能でテキスト貼り付けによる大会データ取り込みができる
- [ ] 単一大会・複数大会（空行区切り）の両方が取り込める
- [ ] パース失敗時に分かりやすいエラーメッセージ
- [ ] 「JSONバックアップ保存」ボタンが「大会データをコピー」に変更されている
- [ ] saveData() の alert メッセージが運営者向け文言に更新されている
- [ ] index.html の説明文に「JSON」が登場しない
- [ ] 既存テスト 306 件すべて緑
- [ ] 新規テスト（parseTournamentTextInput）追加済み
- [ ] A-1/A-2 で構築したマスタが A-2.5 を経由しても壊れない

---

## 10. A-2.5 後の流れ

```
A-2.5 main マージ完了
  ↓
実機確認（運営者目線で「JSON」が消えているか、貼り付けが直感的か）
  ↓
A-3 v7 仕様書の見直し
  - A-2.5 の用語と整合させる（v8 として書き直すか、v7.1 で部分修正か判断）
  - A-3 F8 エクスポート/インポートの設計を A-2.5 の貼り付け方式と整合させる
  ↓
A-3 着手（feat/phase-a3-master-mgmt は既存ブランチを再利用 or 新規作成）
```

---

**END OF DOCUMENT**
