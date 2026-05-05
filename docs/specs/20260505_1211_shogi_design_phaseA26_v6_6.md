# 沼津支部 月例将棋大会アプリ Phase A-2.6 設計仕様書 v6.6

**作成日時**: 2026-05-05 12:11 JST
**作成**: 髙橋一雄 × Claude（設計）
**前 Phase**: Phase A-2.5（main マージ済み、commit `710b11d`）
**根拠**: A-2.5 main マージ後の実機検証で発見された iPhone Safari 固有 UX バグ
**スコープ**: バグ修正のみ（構造変更なし）
**省略フェーズ**: ChatGPT 設計メタレビュー（バグ修正の対症療法のため）

---

## 1. 発見されたバグ（実機検証 2026-05-05 11:30〜12:00）

### 1.1 バグ1：「統合を実行」ボタンが iPhone で反応しない（重大）

**再現条件**：
- iPhone Safari（プライベートブラウズでも再現）
- マスタタブ → 「📥 過去大会を支部マスタに統合」 → モーダル開く
- テキストエリアに大会データを **貼り付けた直後**
- 「統合を実行」をタップ

**症状**：何も起きない（alert もステータスメッセージも表示されない）

**動く動作**：
- Mac Safari/Chrome：完全に正常動作
- iPhone でテキストエリア外を一度タップしてキーボードを消してから「統合を実行」：動く

**原因**：iOS Safari の **textarea blur 競合**
- テキストエリアにフォーカスがある状態（ソフトキーボード表示中）で他要素をタップすると、1回目のタップが blur に消費される
- ただし「閉じる」ボタンは問題なく動作するため、純粋な blur 競合だけでない可能性も
- 推定原因：「統合を実行」ハンドラ内で `parseTournamentTextInput()` 等の処理を実行する間、textarea のフォーカス処理と競合

### 1.2 バグ2：iPhone Safari の textarea 自動ズーム（UX 破壊）

**再現条件**：
- iPhone Safari でマイグレモーダル（または読み込みモーダル）を開く
- テキストエリアをタップ

**症状**：
- 画面が自動的に拡大される
- ボタン類が画面外に押し出される
- 横スクロールが必要になり操作困難

**原因**：iPhone Safari は **`font-size` が 16px 未満の `<textarea>` や `<input>` にフォーカスすると自動ズームする** 既知の挙動

**現状のコード**（v6.5 §4.1 で実装）：
```javascript
// マイグレモーダル
'<textarea id="mig-paste-area" rows="8"
  style="width:100%;font-size:12px;font-family:monospace;..." ...>'
```

→ `font-size:12px` が原因

### 1.3 バグ3：読み込みモーダルにも同じ問題が存在（推定）

A-2 以前から存在する `load-paste-area` も同じ実装パターン：

```javascript
// 読み込みモーダル（既存、A-2 以前から）
'<textarea id="load-paste-area" placeholder="..."
  style="width:100%;height:120px;padding:8px;border:1px solid #ccc;
  border-radius:8px;font-size:13px;..."></textarea>'
```

→ `font-size:13px` も 16px 未満なので同じ自動ズーム問題が発生する

実機検証で読み込みモーダルでも再現するかは未確認だが、**コードベースで同じ問題があるのは明らか**。

---

## 2. 修正スコープ（A-2.6 として実装）

### 2.1 含む修正（3項目）

| ID | 修正 | 規模 |
|---|---|---|
| **F1** | マイグレモーダルの「統合を実行」ハンドラ冒頭で textarea を `blur()` する | 1-2 行 |
| **F2** | `mig-paste-area` の `font-size` を 16px 以上に変更 | 1 行 |
| **F3** | `load-paste-area` の `font-size` を 16px 以上に変更（読み込みモーダル）| 1 行 |

### 2.2 含めない修正

- 構造変更（モーダル全体の幅・高さ）：影響範囲が読めないため見送り
- 「閉じる」ボタンへの blur 追加：既に動いているため不要
- 他のフォーム入力欄の font-size 一括見直し：別フェーズ
- iPhone Safari ビューポート設定の見直し：別フェーズ

---

## 3. 実装内容

### 3.1 F1: blur タイミング修正

`shogi_v4.html` の `bindMigrationModalEvents()` 内、`runBtn.addEventListener('click', ...)` のコールバック冒頭：

```javascript
// 修正前（L1075 付近）
runBtn.addEventListener('click', function() {
  var textarea = document.getElementById('mig-paste-area');
  var text = textarea ? textarea.value : '';
  if (!text || !text.trim()) {
    alert('大会データを貼り付けてください');
    return;
  }
  // ...
});

// 修正後
runBtn.addEventListener('click', function() {
  var textarea = document.getElementById('mig-paste-area');
  // iOS Safari 対策：先に textarea からフォーカスを外して blur 競合を回避
  if (textarea) textarea.blur();
  var text = textarea ? textarea.value : '';
  if (!text || !text.trim()) {
    alert('大会データを貼り付けてください');
    return;
  }
  // ...
});
```

### 3.2 F2: マイグレモーダルの font-size 修正

`shogi_v4.html` の `buildMigrationModalHtml()` 内：

```javascript
// 修正前（L1058 付近）
html += '<textarea id="mig-paste-area" rows="8"
  style="width:100%;font-size:12px;font-family:monospace;
  border:1px solid #ccc;border-radius:6px;padding:8px;box-sizing:border-box"
  placeholder="ここに大会データを貼り付けてください"></textarea>';

// 修正後
html += '<textarea id="mig-paste-area" rows="8"
  style="width:100%;font-size:16px;font-family:monospace;
  border:1px solid #ccc;border-radius:6px;padding:8px;box-sizing:border-box"
  placeholder="ここに大会データを貼り付けてください"></textarea>';
```

### 3.3 F3: 読み込みモーダルの font-size 修正

`shogi_v4.html` の読み込みモーダル生成箇所（L2247 付近）：

```javascript
// 修正前
'<textarea id="load-paste-area" placeholder="ここに大会データを貼り付けてください"
  style="width:100%;height:120px;padding:8px;border:1px solid #ccc;
  border-radius:8px;font-size:13px;font-family:monospace;resize:vertical"></textarea>'

// 修正後
'<textarea id="load-paste-area" placeholder="ここに大会データを貼り付けてください"
  style="width:100%;height:120px;padding:8px;border:1px solid #ccc;
  border-radius:8px;font-size:16px;font-family:monospace;resize:vertical"></textarea>'
```

---

## 4. テスト計画

### 4.1 既存テスト維持

A-2.5 完了時点の **327 件すべて緑** を維持すること。
font-size と blur 追加は既存テストに影響しない見込み。

### 4.2 新規テスト

**追加なし**（バグ修正のみ、UI スタイル変更が中心）。

理由：
- font-size 変更：単なるスタイル変更、ロジック変更なし
- blur 呼び出し：iOS Safari 固有の挙動で、Node.js テスト環境では再現不能
- e2e（Playwright）テストでも iOS Safari の自動ズームは検出困難

### 4.3 実機検証（必須）

main マージ前に **iPhone Safari 実機で確認**：

| 項目 | 期待動作 |
|---|---|
| マスタタブ → マイグレモーダル → テキストエリアタップ | 自動ズームしない（F2）|
| テキストエリアにペースト → 「統合を実行」 | キーボード表示中でも反応（F1）|
| 統合成功時のメッセージ表示 | OK |
| 読み込みモーダル → テキストエリアタップ | 自動ズームしない（F3）|
| 読み込みモーダル → 貼り付け → 「貼り付けから読み込む」 | 既存通り動作 |

### 4.4 Mac での動作確認

Mac Safari/Chrome でも全機能が引き続き動作すること（リグレッションなし）。

---

## 5. 実装フェーズ分け（推奨）

A-2.6 は規模が極小（数行）のため、**1〜2 コミット** で完結：

```
Stage 1: F1 + F2 + F3 を一括実装（1コミット）
Stage 2: 実機検証 + プッシュ + PR 作成
Stage 3: Codex 実装レビュー
Stage 4: main マージ + archive タグ
```

---

## 6. レビューフェーズ

### 6.1 ChatGPT 設計メタレビュー

**省略**。
理由：
- バグ修正の対症療法
- 構造変更なし
- iOS Safari の既知挙動への対応で議論の余地が少ない
- 修正規模が極小

### 6.2 Codex 実装レビュー

**実施**（A-2 / A-2.5 と同じパターン）。
ただし観点を絞る：
- F1 の blur 呼び出しが既存ロジックに影響しないか
- F2/F3 の font-size 変更で見た目が崩れないか
- 既存 327 件のテストが緑のまま

### 6.3 髙橋さん実機検証

**必須**。Codex レビュー OK 後、main マージ前に iPhone で動作確認。

---

## 7. 完結条件

- [ ] iPhone Safari でマイグレモーダルのテキストエリアをタップしても自動ズームしない
- [ ] iPhone Safari でテキストエリアに貼り付けた直後の「統合を実行」が反応する
- [ ] iPhone Safari で読み込みモーダルのテキストエリアをタップしても自動ズームしない
- [ ] Mac Safari/Chrome で既存動作（A-2.5 完了時点）が維持されている
- [ ] 既存テスト 327 件すべて緑

---

## 8. A-2.6 後の流れ

```
A-2.6 main マージ完了
  ↓
実機確認（A-2.5 のチェックリストを再実行）
  ↓
次回月例大会で運用試験
  ↓
A-3 v7.1 への用語整合更新（後日 Claude.ai で）
  ↓
A-3 着手
```

---

## 9. 参考：A-2.5 のテスト盲点

A-2.5 v6.5 では **327 件の単体テストすべて緑** だったが、実機 iPhone Safari で2つのバグが発覚。

| 問題 | テスト盲点 |
|---|---|
| バグ1（blur 競合）| 単体テストでは textarea のフォーカス挙動を再現できない |
| バグ2（自動ズーム）| 単体テスト・e2e でも iOS Safari 固有の挙動は検出困難 |

**教訓**：
- 単体テスト + e2e テストだけでは iOS Safari 固有の UX 問題は検出できない
- **実機検証が必須**（A-2.5 のチェックリストでは「テキストエリア外をタップしてから統合を実行」が含まれていなかったため、髙橋さんが実機で気づいた）

A-3 以降のテスト戦略：
- 実機確認チェックリストに「iPhone Safari でのテキスト入力 → ボタンタップ」を必須項目化
- 自動ズーム問題は font-size 16px 以上の **設計ガイドライン** として固定化

---

**END OF DOCUMENT**
