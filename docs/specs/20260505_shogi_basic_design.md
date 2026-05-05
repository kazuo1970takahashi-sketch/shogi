# shogi_v4 基本設計書

**対象**: 沼津支部月例将棋大会管理アプリ  
**作成日**: 2026-05-05  
**作成者**: 高橋一雄  
**用途**: 自分用リファレンス・将来の改修時の把握用

---

## 1. アプリ概要

### 目的
沼津支部の月例将棋大会（スイス式トーナメント）の運営を効率化するWebアプリ。受付・ペアリング・結果管理・順位計算を一元化する。

### 運営環境
- 参加者: 最大20名程度（A・B2クラス制）
- 大会形式: スイス式 全4局
- 使用端末: iPhone / PC（スマホメイン）
- ネットワーク: インターネット接続が必要（GitHub Pages）

### アクセスURL
```
https://kazuo1970takahashi-sketch.github.io/shogi/
```

---

## 2. 技術構成

| 項目 | 内容 |
|------|------|
| アーキテクチャ | 単一HTMLファイル（shogi_v4.html）|
| ホスティング | GitHub Pages（privateリポジトリ、無料枠外のため実質public相当） |
| データ保存 | LocalStorage（ページを閉じるとリセット）|
| フレームワーク | Vanilla JavaScript（ライブラリなし）|
| テスト | Node.js単体テスト + Playwright e2e |
| CI | GitHub Actions |

### LocalStorageキー
```
shogi_v4           … 大会データ（state）
shogi_branch_master … 支部マスタ（参加者履歴）
```

---

## 3. 機能一覧（フェーズ別）

### Phase A-1（完了）
- 支部マスタのデータ層（normalizeBranchMaster）
- 大会データ保存時のマスタ自動同期
- ワンクリック呼び出しUI（過去参加者→参加者登録）
- マイグレーションウィザード（過去大会データを貼り付けてマスタに統合）
- 最小マスタタブ（登録人数表示・利用目的表示）

### Phase A-2（完了）
- ふりがな入力
- ふりがな検索（部分一致）
- 50音タブ

### Phase A-2.5（完了）
- マイグレを「ファイル選択」→「テキスト貼り付け」方式に変更
- UIから「JSON」用語を撤廃し「大会データ」に統一

### Phase A-2.6（完了）
- iPhone Safari UXバグ修正
  - テキストエリア自動ズーム防止（font-size: 16px以上）
  - ボタン無反応バグ対応（blur競合回避）

### Phase A-3（完了）
- **登録画面×マスタ接続（サジェスト）**
  - 氏名入力欄にインラインサジェスト
  - 候補タップで氏名・クラス・支部員区分・中学区分を全引き継ぎ
  - member_id保持・二重追加防止・氏名変更時の解除
- **F7 マスタ編集・削除**
  - name + yomi のみ編集可（参加履歴は変更不可）
  - 削除はtombstone方式（物理削除なし）
- **F8 マスタバックアップ**
  - エクスポート（branch master形式のJSONダウンロード）
  - 上書きインポート（確認ダイアログ付き）
  - マージインポート（member.id基準・既存側優先・tombstone安全ルール）
- **クイックフィルタ3種**
  - 前回参加・3ヶ月以内・常連（5回以上）
  - 排他選択・再タップで解除・検索/50音タブとAND

---

## 4. データ構造

### 大会データ（shogi_v4）

```json
{
  "schema_version": 4,
  "tournament_id": "t_YYYYMMDD",
  "tournament_date": "YYYY-MM-DD",
  "players": {
    "A": [
      {
        "id": "p...",
        "name": "山田太郎",
        "cls": "A",
        "member": "member",    // "member" | "other"
        "grade": "ippan",      // "ippan" | "chu"
        "member_id": "m_..."   // マスタとの紐付け（A-3で追加）
      }
    ],
    "B": []
  },
  "pairings": { "A": [...], "B": [...] },
  "results":  { "A": [...], "B": [...] },
  "currentRound": { "A": 1, "B": 1 },
  "started": false
}
```

### 支部マスタ（shogi_branch_master）

```json
{
  "schema_version": 1,
  "updated_at": "ISO8601",
  "members": [
    {
      "id": "m_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "name": "山田太郎",
      "yomi": "やまだたろう",
      "last_class": "A",
      "first_attended": "YYYY-MM-DD",
      "last_attended": "YYYY-MM-DD",
      "attendance_count": 12,
      "tournament_ids": ["t_...", "t_..."],
      "member": "member",     // 支部員区分（A-3で追加）
      "grade": "ippan",       // 中学生以下区分（A-3で追加）
      "deleted": false,
      "deleted_at": null,
      "note": ""
    }
  ]
}
```

---

## 5. 主要関数一覧

### マスタ関連
| 関数名 | 役割 |
|--------|------|
| `normalizeBranchMaster(raw)` | 生データを正規化。schema_version不一致は空マスタ返却 |
| `loadBranchMaster()` | LocalStorageから読み込み |
| `saveBranchMaster(master)` | LocalStorageに保存 |
| `updateBranchMasterFromTournament(state, master, meta)` | 大会終了後にマスタを更新 |
| `findMasterSuggestions(query, master, excludedIds)` | サジェスト候補を返す（最大5件） |
| `applyMasterMemberEdit(id, name, yomi, master)` | name+yomiを編集 |
| `applyMasterMemberDelete(id, master, date)` | tombstone削除 |
| `serializeBranchMasterForExport(master)` | エクスポート用JSON文字列 |
| `applyOverwriteImport(parsed)` | 上書きインポート |
| `applyMergeImport(parsed, currentMaster)` | マージインポート |
| `applyQuickFilter(members, filterKey, today)` | クイックフィルタ適用 |

### ペアリング関連
| 関数名 | 役割 |
|--------|------|
| `pairRound(players, results, currentRound)` | スイス式ペアリング生成（バックトラッキング） |
| `calcFinalRanking(players, results)` | 最終順位計算（勝数→SOS→SODOS） |

---

## 6. 主要設計判断と根拠

### サジェストのフォーム設計（A-3）
- **決定**: 追加前は氏名・クラスのみ変更可。支部員・中学生区分は追加後の行内セレクトで変更
- **理由**: 登録フォームへの新規入力欄追加はUIが重くなる。20名規模では追加後1タップで修正できれば十分

### branch masterのmember/gradeフィールド追加
- **決定**: normalizeBranchMasterにmember/gradeを追加（schema_version据え置き）
- **理由**: 「前回値の引き継ぎ」を実現するために必要。欠落時はデフォルト値でフォールバックするため後方互換

### tombstoneの安全側ルール（マージインポート）
- **決定**: 既存OR importedのどちらかがdeleted=trueなら結果もtrue
- **理由**: 誤復元を防ぐ。一度削除と判定されたmemberはマージで勝手に生き返らせない

### F8とマイグレの責務分離
- **F8**: 支部マスタのバックアップ/復元（branch master形式のみ）
- **マイグレ**: 過去大会データから支部マスタを構築（tournament形式）
- **理由**: 混在させると実装とUIが複雑化する。誤投入時は適切な機能へ案内する

---

## 7. テスト状況

| 種別 | 件数 | 対象 |
|------|------|------|
| 単体テスト（Node.js） | 547件 | 純粋関数・ロジック全般 |
| e2eテスト（Playwright） | 80件 | UI統合・LocalStorage永続化 |
| **合計** | **627件** | |

### テスト実行
```bash
npm test          # 単体テスト
npm run test:e2e  # e2eテスト
```

---

## 8. 永続的な見送り事項

| 機能 | 見送り理由 |
|------|-----------|
| ローマ字検索 | ふりがな検索で代替可能 |
| ふりがな自動推定 | 精度に問題あり、手入力が確実 |
| 異体字自動統合 | 複雑すぎる、手動で管理 |
| QRコード受付 | 年配参加者が多く現実的でない |
| 認証機能 | 支部内運用のため不要 |
| サーバーサイド | 複雑化・コストが課題、LocalStorageで十分 |

---

## 9. バックログ

| Phase | 内容 | 優先度 |
|-------|------|--------|
| A-4 | iOS Safari印刷警告対応（誤検知の可能性あり） | 低・運用試験で観察 |
| 将来 | 削除済みmemberの復元UI | 運用試験後に判断 |
| 将来 | 大会報告書の自動出力 | 要望次第 |
| 将来 | ホームページへの反映 | 検討中 |

---

## 10. ファイル構成

```
shogi/
├── shogi_v4.html          # アプリ本体（単一HTML）
├── index.html             # 運営サイト（マニュアル）
├── test/
│   ├── run_tests.sh       # 単体テストランナー
│   ├── test_branch_master.js  # マスタ機能テスト（497件）
│   └── e2e/
│       ├── shogi_app.spec.js       # 基本e2e（30件）
│       └── shogi_app_a3.spec.js    # A-3 e2e（80件中50件）
└── docs/
    └── specs/             # 設計仕様書・ロードマップ
```
