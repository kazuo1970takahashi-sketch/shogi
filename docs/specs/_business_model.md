# 業務モデル：沼津支部月例将棋大会管理（shogi_v4）

**配置先**: `docs/specs/_business_model.md`（永続文書・タイムスタンプ無し）
**最終更新**: 2026-05-06 01:27 JST
**準拠**: DevSecOps 運用方針 v1.2.5 §13.4（業務モデル文書の常駐義務）
**位置づけ**: 本リポジトリの**真実の源（Source of Truth）**。仕様書・テスト・実装の前提となるドメイン定義。フェーズ仕様書 §0 のユーザーストーリーは本文書のジャーニーから派生する。

---

## 0. 改訂履歴

| 版 | 日時 | 変更内容 | 起草者 |
|---|---|---|---|
| v1.0 | 2026-05-06 01:27 | 初版起草。Stage 2a 着手前条件（v1.2.5 §13.4）として整備。A-1〜A-4.2 mainマージ済みの状態を反映 | Claude.ai |

---

## 1. 業務目的とユーザー

### 1.1 業務目的

沼津支部月例将棋大会の**運営作業を最小化**し、**事故ゼロでの大会運営**を実現する。具体的には：

1. 参加者の受付・登録・参加費徴収を 30 分以内に完了させる
2. スイス式ペアリングを自動生成し、運営者の判断負荷を排除する
3. 対局結果の入力・集計・最終順位算出を機械化する
4. 大会後の報告書（参加者一覧 + 結果 + 会計）を自動生成する
5. 月例間でデータを引き継ぎ可能にする（保存・復元）

### 1.2 ユーザー

| ロール | 役割 | 操作主体 |
|---|---|---|
| 大会主幹事（髙橋一雄） | 大会全体の運営、ペアリング確認、結果確定、報告書作成 | shogi_v4 全機能 |
| 副幹事 | 受付係、対局結果入力補助 | 参加者登録・対局管理 |
| 参加者 | 対局カード提出、結果報告 | 直接操作なし（運営者経由） |

### 1.3 運用前提

- 端末：副幹事のスマートフォン（受付）+ 主幹事の PC または iPad（運営）
- ネットワーク：会場 Wi-Fi 不安定前提 → **完全オフライン動作**
- データ保存：LocalStorage のみ（サーバー無し）
- バックアップ：「大会データをコピー」ボタンで JSON 文字列をクリップボード経由で他媒体（メール下書き等）に退避
- 開催頻度：毎月 1 回、参加者 16〜32 名、A/B 2 クラス、5〜6 ラウンド

### 1.4 UI 重要操作（v1.2.5 §1.4 適用範囲）

以下は「クリックしたら状態が変わるべき」操作。**通知のみで完了とする実装は禁止**（A-4.2 リグレッションの根本原因）。Stage 2a で実装する `clickAndExpectChange` ヘルパは、これらの操作すべてに primary semantic assertion を強制する。

| 操作 | DOM | primary assertion 例 |
|---|---|---|
| 参加者追加 | `#addBtn` | `state.players[cls].length` 増加 |
| クラス選択 A/B | `.pp-add-btn[data-cls]` / `.suggest-add-btn[data-cls]` | `state.players[lastIndex].cls === 'A' or 'B'` |
| 対局開始 | `#startBtn` | タブ遷移 + `state.started === true` |
| 勝者ボタン | `#wb_{cls}_{i}_p{1,2}` | `state.results[cls][round][i].winner === playerId` |
| ラウンド確定 | `#submitBtn_{cls}` | `state.currentRound[cls]` インクリメント |
| ペアリング再生成 | `#repairBtn_{cls}` | `state.pairings[cls][currentRound]` 内容変化 |
| マスタ追加 | `#me-save`（新規時） | `master.members.length` 増加 |
| マスタ削除 | （マスタ画面の削除ボタン） | `master.members[id].deleted === true` |
| 大会データコピー | `#saveBtn` | クリップボード内容に `STORAGE_KEY` の JSON を含む |
| 読み込み実行 | `#load-from-paste` / `#load-pick-file` | `state` が読み込み内容で置換される |
| 報告書ダウンロード | `#downloadReportBtn` | PDF Blob URL 生成（または anchor download 属性発火） |

---

## 2. ユーザージャーニー

### 2.1 ジャーニー A：受付〜対局開始（大会当日 09:00〜09:30）

```
[副幹事の端末]
  参加者登録タブを開く
    ↓
  ① 過去参加者パネル開く（#ppToggleBtn）
    → master.members から候補表示
    → 該当者の .pp-add-btn[data-cls="A"or"B"] クリック
    → state.players[cls] に追加、UI に表示
    ↓
  ② 新規参加者は #inp-name + #inp-yomi + #inp-class 入力 → #addBtn
    → ふりがな未入力時は yomi-add モーダル経由でマスタ登録（A-3.5）
    ↓
  ③ A/B 各クラス最低 2 名揃ったら #startBtn
    → 第 1 ラウンドのペアリング自動生成
    → 対局管理タブへ自動遷移
```

**異常系**：
- 同一名重複 → `#reg-msg` にエラー表示（不変条件 §7.1）
- 各クラス 2 名未満で `#startBtn` → エラー（state.started false のまま）
- LocalStorage 容量超過 → `#saveBtn` 失敗時に `notifyError` 表示

### 2.2 ジャーニー B：対局結果入力〜次ラウンド（各ラウンド 30〜45 分）

```
[主幹事 or 副幹事の端末]
  対局管理タブ
    ↓
  ① 各組の勝者を #wb_{cls}_{i}_p1 or _p2 でクリック
    → ボタンに ▲勝 表示
    → state.results[cls][round][i].winner 確定
    ↓
  ② 全組の勝者入力完了後、#submitBtn_{cls} で確定
    → 次ラウンドのペアリング自動生成（バックトラッキング）
    → state.currentRound[cls] += 1
    ↓
  ③ ペアリングが意図と合わない場合 #repairBtn_{cls}
    → 同一勝ち数グループ内シャッフル + バックトラッキング再試行
```

**異常系**：
- 全組勝者未入力で確定 → 確定不可
- 同じ相手と複数回対戦 → バックトラッキングが回避（不変条件 §7.2）
- 奇数人 → BYE（不戦勝）処理

### 2.3 ジャーニー C：過去対局結果の修正

```
対局管理タブの過去ラウンド表示
  ↓
#editpast_{cls}_{rr}_{mm} クリック
  → 勝者変更モーダル（#chgbtn_*）
  → 勝者を変更（未入力に戻す機能は永続見送り）
```

**前提**：A-3 までで「勝者変更のみ可、未入力に戻す機能は実装しない」と確定済み。

### 2.4 ジャーニー D：大会終了〜報告書出力（大会終了後 30 分）

```
最終結果タブ
  ↓
① 順位表示（PC: 表 / スマホ: カード形式）
  ↓
② 報告書フィールド入力
  #rep-date / #rep-place / #rep-start / #rep-end / #rep-sei / #rep-fuku / #rep-note
  ↓
③ #downloadReportBtn
  → PDF 生成（jsPDF）
  → 月例運営報告書として支部へ提出
```

### 2.5 ジャーニー E：マスタメンテナンス（不定期）

```
マスタタブ（#tab-master）
  ↓
① 検索（#pp-search）→ 表示中マスタ絞込
② 追加 → #me-name / #me-yomi / #me-save（新規）
③ 編集 → 既存行クリック → モーダル → #me-save（data-mid 付き）
④ 削除 → tombstone 化（master.members[id].deleted = true、deleted_at 記録）
⑤ #masterShowDeletedBtn → 削除済み一覧表示
⑥ #masterExportBtn → JSON 文字列クリップボードコピー
⑦ #masterImportBtn → 貼り付けマージ（既存側優先・tombstone OR ルール、A-3 実装済）
⑧ #masterMigrateBtn → 旧形式からの移行（永続見送り予定、現状はテキスト貼り付け方式）
```

### 2.6 ジャーニー F：中断・復旧

```
[中断時]
  #saveBtn → クリップボードに state JSON コピー → メール下書き等に退避
  
[復旧時]
  #loadBtn → 読み込みモーダル表示
    ↓
  ① ファイル経由：#load-pick-file
  ② テキスト貼り付け：#load-paste-area + #load-from-paste
    ↓
  state を復元、自動的に適切なタブへ遷移（参加者登録 / 対局管理 / 最終結果）
```

---

## 3. 画面構成

`shogi_v4.html` は単一 HTML / 単一画面アプリ。タブ切替は `showTab(name)` で実現。

| タブ | DOM ID | 関数引数 | 主目的 |
|---|---|---|---|
| 参加者登録 | `#tab-reg` | `'reg'` | 受付・参加者管理・大会開始 |
| 対局管理 | `#tab-tournament` | `'tournament'` | ペアリング表示・結果入力・確定・修正 |
| 最終結果 | `#tab-result` | `'result'` | 順位表示・報告書フィールド・PDF 出力 |
| マスタ | `#tab-master` | `'master'` | 過去参加者マスタの CRUD・エクスポート/インポート |

タブ切替実装：
- 関数定義：`shogi_v4.html:2131` `function showTab(t){...}`
- イベント登録：`shogi_v4.html:3736-3740`（tab-master のみ条件分岐）
- 自動遷移箇所：`startBtn` クリック後（→tournament）、読み込み完了時（state に応じて分岐）、リセット後（→reg）

---

## 4. データモデル

### 4.1 LocalStorage キー一覧

| キー | 定数名 | 内容 | 永続性 |
|---|---|---|---|
| `shogi_v4` | `STORAGE_KEY`（line 338, 344） | 大会の全状態（参加者・ペアリング・結果） | 大会単位、`saveBtn` でコピー退避 |
| `shogi_branch_master` | `BRANCH_MASTER_KEY`（line 513, 536） | 過去参加者マスタ | 永続（月例を跨ぐ） |

`window._pendingNewYomi` / `_yomiManuallyEdited` 等の作業用 globals は永続化対象外。

### 4.2 state スキーマ（`shogi_v4` キー）

```javascript
state = {
  players: {
    A: [{ id, name, yomi, cls: 'A', member_id?, ... }],   // 主キーは id（Date.now()+''）
    B: [{ id, name, yomi, cls: 'B', member_id?, ... }],
  },
  started: false,                                          // #startBtn で true
  currentRound: { A: 0, B: 0 },                            // 0-indexed、確定時にインクリメント
  pairings: { A: [[{p1, p2, ...}, ...]], B: [...] },       // pairings[round][match]
  results:  { A: [[{winner, p1, p2}, ...]], B: [...] },    // 同上、winner=playerId or null
  // 報告書フィールド（最終結果タブ）
  rep: { date, place, start, end, sei, fuku, note },
}
```

### 4.3 master スキーマ（`shogi_branch_master` キー）

```javascript
master = {
  schema_version: 1,
  updated_at: '2026-05-06T...',
  members: [
    {
      id,                         // 主キー
      name,                       // 表示名
      yomi,                       // ふりがな（A-2 で必須化）
      last_class,                 // 直近参加クラス（'A' or 'B'）
      last_attended_at,           // 直近参加日（ISO）
      attend_count,               // 累計参加回数
      deleted: false,             // tombstone フラグ
      deleted_at: null,           // tombstone 日時（A-3 で追加）
    },
    ...
  ],
}
```

**マージルール**（A-3 で確定）：
- 既存側優先（`updated_at` 比較ではない）
- `deleted` は OR ルール（どちらか true なら削除扱い）

### 4.4 player ⇄ master の連携

- 参加者登録時、過去参加者パネル / サジェストから追加すると `players[].member_id` がセットされる
- 新規入力時は `member_id` 無し → 大会終了後に手動でマスタ登録される（A-3 のサジェスト未登録扱い）

---

## 5. フィールド・コンポーネント一覧

### 5.1 参加者登録タブ（`#pane-reg`）

| ID | 種別 | 役割 |
|---|---|---|
| `#saveBtn` | button | 大会データをコピー（クリップボード退避） |
| `#loadBtn` / `#loadFile` | button / hidden file | 読み込みモーダル起動 |
| `#resetBtn` | button | 大会データ全消去 |
| `#ppToggleBtn` | button | 過去参加者パネル開閉 |
| `#pp-search` | input text | 過去参加者検索 |
| `#pp-hint` | div | サジェスト件数等のヒント表示 |
| `#inp-name` | input text | 参加者名 |
| `#inp-yomi` | input text | ふりがな |
| `#inp-class` | select | A / B クラス選択 |
| `#addBtn` | button | 参加者追加実行 |
| `#bulkEditA` / `#bulkEditB` | button | クラス別の名前一括編集モーダル起動 |
| `#startBtn` | button | 登録完了・対局開始 |
| `#a-list` / `#b-list` | tbody | 登録済み参加者表 |
| `#a-count` / `#b-count` | span | クラス別人数表示 |
| `#reg-msg` | div | エラー / 成功メッセージ |

**動的生成（class）**：
- `.pp-row`：過去参加者パネルの行
- `.pp-add-btn[data-cls="A"|"B"]`：パネル内の A/B クラス追加ボタン
- `.pp-last-class`：直近クラス表示
- `.suggest-item` / `.suggest-add-btn[data-cls]` / `.si-info` / `.si-meta`：入力中サジェスト
- `.player-row` / `.player-name`：登録済み参加者の行

### 5.2 対局管理タブ（`#pane-tournament`、すべて動的生成）

| ID テンプレ | 役割 |
|---|---|
| `#wb_{cls}_{i}_p1` / `#wb_{cls}_{i}_p2` | 勝者ボタン（i = 組番号） |
| `#chgbtn_{cls}_{i}` | 対戦相手変更ボタン |
| `#chg-p1` / `#chg-p2` / `#chg-save` | 対戦相手変更モーダル |
| `#submitBtn_{cls}` | ラウンド確定ボタン |
| `#repairBtn_{cls}` | ペアリング再生成 |
| `#editpast_{cls}_{rr}_{mm}` | 過去対局編集 |
| `#ep-p1` / `#ep-p2` / `#ep-cancel` | 過去対局編集モーダル |
| `#bulk-name-{playerId}` / `#bulk-cancel` / `#bulk-save` | 名前一括編集モーダル |

### 5.3 最終結果タブ（`#pane-result`）

| ID | 役割 |
|---|---|
| `#rep-date` | 開催日 |
| `#rep-place` | 開催場所 |
| `#rep-start` / `#rep-end` | 開始・終了時刻 |
| `#rep-sei` / `#rep-fuku` | 主幹事・副幹事氏名 |
| `#rep-note` | 備考 |
| `#downloadReportBtn` | PDF 生成 |

順位表示は PC（表）・スマホ（カード）で切替（CSS media query）。

### 5.4 マスタタブ（`#pane-master`）

| ID | 役割 |
|---|---|
| `#masterMigrateBtn` | 旧形式マイグレ（永続見送り） |
| `#masterExportBtn` | JSON エクスポート |
| `#masterImportBtn` | 貼り付けマージインポート |
| `#masterShowDeletedBtn` | 削除済み一覧表示 |

**マスタ編集モーダル**：
- `#me-name` / `#me-yomi` / `#me-cancel` / `#me-save`（`data-mid` 属性で対象 ID 識別）

**マスタ取込モーダル**：
- `#mi-file` / `#mi-paste-area` / `#mi-cancel` / `#mi-run`
- `#mig-paste-area` / `#mig-cancel` / `#mig-run`

### 5.5 共通モーダル

**ふりがな未入力時**：`#yomi-cancel` / `#yomi-add`
**読み込み**：`#load-pick-file` / `#load-paste-area` / `#load-cancel` / `#load-from-paste`

---

## 6. データフロー

### 6.1 参加者追加（過去参加者経由）

```
[ユーザー] .pp-add-btn[data-cls="A"] クリック
  ↓
[ハンドラ] data-mid から master.members 検索
  ↓
state.players.A.push({id, name, yomi, cls:'A', member_id})
  ↓
save() → localStorage.setItem('shogi_v4', JSON.stringify(state))
  ↓
renderRegList() → #a-list 再描画、#a-count 更新
```

### 6.2 ラウンド確定

```
[ユーザー] #submitBtn_A クリック
  ↓
state.results.A[currentRound] 全組の winner 検証
  ↓
state.currentRound.A += 1
  ↓
generatePairing('A')  // バックトラッキングで次ラウンド生成
  ↓
state.pairings.A[currentRound] 設定
  ↓
save() → renderTournament()
```

### 6.3 大会データコピー（`#saveBtn`）

```
[ユーザー] #saveBtn クリック
  ↓
JSON.stringify(state)
  ↓
navigator.clipboard.writeText(...)
  ↓
notifySuccess('コピーしました')
```

### 6.4 読み込み（`#load-from-paste`）

```
[ユーザー] テキスト貼付 → #load-from-paste クリック
  ↓
JSON.parse(textareaValue)
  ↓
state = parsed
  ↓
save()
  ↓
state.started かつ全ラウンド完了 → showTab('result')
state.started かつ進行中     → showTab('tournament')
それ以外                      → showTab('reg')
```

---

## 7. 不変条件 / Contract

実装・テストの両方で守るべき制約。**Contract Testing で明文化**（v1.2.5 §13.4 推奨）。

### 7.1 参加者登録

| ID | 制約 |
|---|---|
| INV-PL-1 | 同一クラス内で同名（trim 後一致）の参加者は登録不可 |
| INV-PL-2 | `state.players[cls][i].id` は一意 |
| INV-PL-3 | `state.players[cls][i].cls === cls`（自己整合性） |
| INV-PL-4 | 対局開始後（`state.started === true`）、参加者の追加・削除は不可 |

### 7.2 ペアリング

| ID | 制約 |
|---|---|
| INV-PA-1 | 同じ対戦カードはトーナメント内で重複不可（バックトラッキングで回避） |
| INV-PA-2 | 自分自身との対戦は不可 |
| INV-PA-3 | 奇数人時は最低勝数の参加者を BYE（不戦勝）扱い |
| INV-PA-4 | `state.pairings[cls][round]` の長さ × 2 + (BYE有無) === `state.players[cls].length` |

### 7.3 マスタ

| ID | 制約 |
|---|---|
| INV-MA-1 | `master.members[].id` は一意 |
| INV-MA-2 | 削除は論理削除のみ（`deleted: true` + `deleted_at` 記録、物理削除しない） |
| INV-MA-3 | マージ時は既存側優先 + tombstone は OR ルール |
| INV-MA-4 | `name` と `yomi` は必須（A-2 以降） |

### 7.4 結果データ

| ID | 制約 |
|---|---|
| INV-RE-1 | `state.results[cls][round][i].winner` は `null` または `state.players[cls][*].id` のいずれか |
| INV-RE-2 | ラウンド確定後（`currentRound > round`）、`results[cls][round]` の全要素に winner が入っている |

---

## 8. 既知の制約と永続見送り判断

### 8.1 既知のバグ・制約

| 項目 | 状態 | バックログ |
|---|---|---|
| iPhone 16 Plus でのスマホ UI 揺れ | 未修正 | A-4.1 |
| iOS Safari 印刷警告（誤検知） | 観察継続 | A-4 バックログ |
| A-4.2 A/B クラスボタンが実機で動作しない | リグレッション混入（commit 73961d3） | A-T Stage 4 で最小再現テスト作成、後続フェーズで hotfix |

### 8.2 永続見送り（実装しない）

- ローマ字検索（ふりがなで十分と判断）
- ふりがな自動推定
- 異体字自動統合
- 半角カナ対応
- 「未入力に戻す」機能（勝者変更のみで運用可能）
- ネイティブアプリ化（PWA で十分）

---

## 9. 開発ガイダンス（仕様書・テスト作成者向け）

### 9.1 フェーズ仕様書 §0 ユーザーストーリーの書き方

各フェーズ仕様書 §0 では、本文書 §2 のジャーニーを参照しつつ、フェーズで変更される具体的なステップを明記する。例：

> 本フェーズで変更するのはジャーニー A（受付）のステップ ②（新規参加者入力）。`#inp-name` 入力中のサジェスト動作を強化し、過去マスタからの member_id 自動補完を実現する。

### 9.2 テスト作成時の参照点

- **primary semantic assertion**：§1.4 の表が起点。全ての UI 重要操作のクリックは `clickAndExpectChange` 経由で primary assertion を宣言する（v1.2.5 §2.2 L4、A-T spec v1.3 §4.3）
- **不変条件**：§7 の各 INV-* を Contract Testing で検証
- **Mutation Testing**：§7 の不変条件を mutate して、テストが赤になることを確認（偽陽性テスト排除）

### 9.3 本文書の更新タイミング

| トリガー | 更新内容 |
|---|---|
| 新タブ・新画面追加 | §3, §5 |
| LocalStorage キー追加 | §4.1 |
| state / master スキーマ変更 | §4.2, §4.3 |
| 業務フロー変更 | §2 該当ジャーニー |
| 新しい不変条件発見 | §7 |
| 永続見送り判断 | §8.2 |

仕様書 §0 で本文書のセクション参照を必須とする。**仕様書だけ更新して本文書を放置することは禁止**。

---

## 10. 参照

- DevSecOps 運用方針 v1.2.5（shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`）
- A-T 仕様書 v1.3（`docs/specs/20260506_0045_shogi_at_spec_v1_3.md`、feat/phase-a-t-test-hardening ブランチ）
- A-T Stage 1 完了レポート（`docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`、feat/phase-a-t-test-hardening ブランチ）
- ロードマップ v16（`docs/specs/20260505_1500_shogi_roadmap.md`、main）
- A-7/A-8/A-9 設計メモ（`docs/specs/20260505_1938_shogi_a7_a8_a9_design_memo.md`、main）

---

**END**
