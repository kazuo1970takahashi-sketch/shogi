# Phase A-7 / A-8 / A-9 設計方針メモ（A-4.2 着手前の事前合意）

**作成日時**: 2026-05-05 19:38 JST
**位置づけ**: 詳細仕様書ではなく、A-4.2 / A-4.1 完了後に A-7 仕様書 v1 を起こす際の**事前合意メモ**
**着手予定**: A-4.2 → A-4.1 → **A-7（本フェーズ群）**

---

## 0. 背景

A-4 実機運用テスト中に、以下の追加要望が判明：

1. 過去の大会記録 / 年間ランキング機能が欲しい
2. 大会情報として年月度・実施日・担当幹事2名を持ちたい
3. 過去 Excel データ（1年分）を取り込みたい
4. 参加者の市区町村も管理したい
5. 大会内訳（支部員/外部、一般/中学）と集金金額も大会データとして残したい

これらを A-7（基盤拡張）/ A-8（集計）/ A-9（Excel 取込）の3フェーズで対応する。

---

## 1. 設計判断の確定事項

### 1.1 集計の単位・方法

| 項目 | 決定内容 |
|------|---------|
| 年度の単位 | カレンダー年（1〜12月） |
| 優勝回数のカウント | クラス別（A優勝N回、B優勝N回 を別カウント） |
| 勝率の計算 | 勝数 / (勝+敗+引) （引き分けを分母に含む） |
| 公開範囲 | 運営内部のみ（パスワードゲート or 隠しタブ） |

### 1.2 大会情報の構造

| 項目 | 決定内容 |
|------|---------|
| 大会報告書拡張 | 担当幹事2名（kanji_1, kanji_2）+ A/B 各 1〜3位 |
| 担当幹事の入力方法 | マスタからサジェスト + 自由入力（外部運営にも対応）|
| 過去データの量 | 1年分（≒12ファイル） |
| Excel 命名規則 | 「月例将棋大会YYMM結果.xlsx」（YY=西暦下2桁、MM=月）統一 |

### 1.3 参加者属性の管理

| 属性 | 既存/新規 | 備考 |
|------|----------|------|
| name | A-1 | 既存 |
| yomi | A-2 | 既存 |
| member（支部員/他） | A-3 | 既存 |
| grade（一般/中学） | A-3 | 既存 |
| **city（市区町村）** | **A-7 で新規追加** | 自由入力、datalist 動的生成 |

### 1.4 city フィールドの方針

- 型：自由入力文字列（バリデーションなし）
- 既存マスタへのデフォルト：空文字 `''`（マイグレーション時）
- 入力支援：既存マスタの city 値から動的生成した datalist サジェスト
  - 例：御殿場市 / 沼津市 / 三島市 / 長泉町 / 裾野市 / 伊豆の国市 / 山中湖村 など
- 静的な静岡県東部市町村リストは**持たない**（参加範囲が広いため）
- 同姓同名の判別キーとして name + city を用いる（A-9 名寄せ時）

---

## 2. tournament_archive データ構造（A-7 で新規導入）

```javascript
shogi_branch_master:
  schema_version: 2  // ← v1 から上げる（A-7 で初の version 上げ）
  members: [
    {
      id, name, yomi, member, grade,
      city,  // ← A-7 で追加
      first_attended, last_attended,
      tournament_ids, attendance_count,
      last_class, deleted, deleted_at, note
    }
  ]
  tournament_archive: [  // ← A-7 で新規
    {
      tournament_id, year, month, date,  // year=2026, month=4, date='2026-04-12'
      kanji_1: { member_id, name },      // 担当幹事1（マスタリンク or 自由入力）
      kanji_2: { member_id, name },      // 担当幹事2
      place, start_time, end_time, note,

      participants: [
        {
          member_id, name, city, cls,
          member, grade,                // 取込時点のスナップショット
          wins, losses, draws, rank,
          exclude_from_ranking          // ※参考者なら true
        }
      ],

      rankings: {
        A: [
          { rank: 1, member_id, name, city, wins, losses },
          { rank: 2, member_id, name, city, wins, losses },
          { rank: 3, member_id, name, city, wins, losses }
        ],
        B: [ … ]
      },

      // 内訳サマリ（participants から自動計算）
      breakdown: {
        A: { total: 18, member: 12, other: 6, ippan: 17, chu: 1 },
        B: { total: 4, member: 2, other: 2, ippan: 3, chu: 1 },
        overall: { total: 22, member: 14, other: 8, ippan: 20, chu: 2 }
      },

      // 集金・収支（手入力）
      finance: {
        income: {
          fee_full: { count: 1, unit: 1000, total: 1000 },   // 一般会費 ¥1,000
          fee_half: { count: 15, unit: 500, total: 7500 },   // 減額会費 ¥500（grade='chu'対象）
          total: 8500
        },
        expenses: [
          { label: 'QUOカード購入', amount: 8000 },
          { label: 'QUOカード発行手数料', amount: 320 },
          { label: '会場費', amount: 2200 }
        ],
        expenses_total: 10520,
        balance: -2020,
        note: 'QUOカード ＋¥2,500円残'
      }
    }
  ]
```

### 2.1 finance 設計詳細

- **会費単価**：デフォルト固定（¥1,000 / ¥500）+ 大会ごとに上書き可能
- **¥500 対象**：`grade='chu'` （中学生以下）と一致
- **支出項目**：自由入力（label + amount のリスト）、固定リストは作らない
- **収支バリデーション**：純粋関数 `validateFinance(income, expenses)` で整合性チェック
  - 人数×単価 = 収入合計
  - 収入合計 − 支出合計 = balance

### 2.2 参考者（exclude_from_ranking）の運用

- A-9 取込時に Excel の「※参考」表記を検出 → 自動で `exclude_from_ranking=true`
- A-8 集計時に該当者を年間ランキングから除外
- マスタ自体には影響なし（参加履歴は残る）

---

## 3. A-7 スコープ（基盤拡張・最大版）

| # | 内容 |
|---|------|
| 1 | schema_version v1→v2 マイグレーション関数 |
| 2 | 自動バックアップ退避（`shogi_branch_master_v1_backup`） |
| 3 | city フィールド追加（マスタ） |
| 4 | マスタ編集モーダルに city 入力（datalist サジェスト付） |
| 5 | マスタ一覧に city 列表示 |
| 6 | tournament_archive データ構造定義 |
| 7 | 大会報告書入力欄拡張：担当幹事2名 + A/B 1〜3位 + 会費単価 + 支出項目 |
| 8 | 大会終了時の自動アーカイブ（saveData → archive 追加） |
| 9 | ※参考者の `exclude_from_ranking` フラグ運用 |
| 10 | breakdown 計算純粋関数 `computeBreakdown(participants)` |
| 11 | 収支バリデーション純粋関数 `validateFinance(income, expenses)` |

### 3.1 想定 Stage 構成（A-7 仕様書時点で詳細化）

| Stage | 内容 |
|-------|------|
| 1 | schema v1→v2 マイグレーション + バックアップ退避 |
| 2 | city フィールド追加（マスタ層 + 編集モーダル + 一覧） |
| 3 | tournament_archive 構造 + 純粋関数群（computeBreakdown / validateFinance） |
| 4 | 大会報告書入力欄拡張 |
| 5 | 自動アーカイブ + 全体テスト + PR |

---

## 4. A-8 スコープ（過去データ活用：集計 + 履歴閲覧）

A-8 は「集計（全体傾向の表示）」と「履歴閲覧（個別データの参照）」を表裏一体で扱う。
UI 上は集計→ドリルダウン→大会詳細→個人成績、と相互リンクする画面群を構築する。

### 4.1 集計機能

| # | 内容 |
|---|------|
| 1 | 集計タブ新設（運営限定アクセス） |
| 2 | 年間勝数 / 勝率 / 参加回数 / クラス別優勝回数 |
| 3 | 月別トレンド（A/B別） |
| 4 | city 別フィルタ |
| 5 | 年間収支サマリ（黒字/赤字の月別推移） |
| 6 | 支部員/外部の構成比トレンド |
| 7 | 中学生参加数の推移 |
| 8 | CSV エクスポート（運営の Excel 連携用） |

### 4.2 履歴閲覧機能

| # | 内容 |
|---|------|
| 9 | **大会一覧画面**：年月順表示（新しい順）、1ページ12件（1年分）、フィルタ「年・クラス指定」 |
| 10 | **大会詳細画面**：選択大会の全情報（メタ・参加者一覧・breakdown・finance・**担当幹事**・申し送り） |
| 11 | **個人成績ビュー**：参加者の全大会成績（時系列・新しい順）、累計（参加回数 / 通算勝率 / 優勝回数クラス別） |
| 12 | **参加者検索**：氏名・市区町村・支部員区分でフィルタ |
| 13 | **画面間ナビゲーション**：集計→大会詳細→個人成績→大会詳細 の相互リンク |

### 4.3 想定 Stage 構成（A-8 仕様書時点で詳細化）

| Stage | 内容 |
|-------|------|
| 1 | 集計純粋関数（computeAnnualStats / computeMonthlyTrend / computeChampionships / computePersonalHistory） |
| 2 | 集計タブ UI（年間ランキング・月別トレンド） |
| 3 | 履歴閲覧 UI：大会一覧 + 大会詳細表示 |
| 4 | 個人成績ビュー（時系列） |
| 5 | フィルタ・検索（年・月・クラス・市区町村・氏名）+ CSV エクスポート |

### 4.4 大会詳細画面の表示項目（確定）

- 大会メタ：年月日・場所・時間・**担当幹事2名**
- 参加者一覧（A/B別、順位順）：name / city / member / grade / wins / losses / draws / rank
- breakdown：A/B/overall の人数内訳
- finance：収支サマリ
- 申し送り（note）

### 4.5 個人成績ビューの表示項目（確定）

- 参加した全大会のリスト（時系列、新しい順）：日付・クラス・順位・勝敗・優勝/入賞表示
- 累計：参加回数 / 通算勝率 / 優勝回数（クラス別）
- 対戦履歴は**対象外**（高度機能、必要なら別フェーズ）

---

## 5. A-9 スコープ（Excel 取込）

| # | 内容 |
|---|------|
| 1 | ファイル選択 UI（複数ファイル一括対応） |
| 2 | Excel パース：A対戦表 / B対戦表 / 報告書 |
| 3 | 名寄せ（既存マスタとマッチング、name + city を照合キー） |
| 4 | 整合性チェック：対戦表 vs 報告書 → ずれは警告表示 |
| 5 | 整合性チェック：breakdown 自動計算 vs 報告書記載人数 |
| 6 | 整合性チェック：finance 入力値 vs 計算値 |
| 7 | ※参考者の自動 `exclude_from_ranking=true` |
| 8 | プレビュー画面 → 確定ボタンで archive 追加 |

### 5.1 Excel 列マッピング（参考）

#### A対戦表 / B対戦表 シート
- 1行目: タイトル
- 3行目: 名前（C3〜T3、最大18名）
- 4行目: 市町村（C4〜T4） → city 抽出
- 5行目以降: 各回戦の相手番号・勝敗（◎/×）
- 集計行: 自分の勝数(a) / 負数 / 対戦相手勝数合計(b) / 勝った対戦相手の勝数合計(c) / 順位

#### 報告書シート
- 日付 → year, month, date
- 時間 → start_time, end_time
- 場所 → place
- 担当役員（正） → kanji_1
- 担当役員（副） → kanji_2
- 参加人数 → breakdown 検証用
- 収支 → finance 検証用
- 結果（A/B 1〜3位） → rankings 検証用
- 申し送り → note

---

## 6. 既存実装との整合性

### 6.1 A-1〜A-4.2 の機能保護

A-7 着手時点で以下が既存実装されているはず：
- A-1: 基本機能
- A-2: ふりがな3点セット
- A-2.5: マイグレ貼り付け化
- A-3: F7/F8/クイックフィルタ + 登録画面サジェスト
- A-4: 実機運用フィードバック対応6項目
- A-4.1: スマホレイアウト揺れ修正
- A-4.2: 過去参加者パネル/サジェストにA/Bクラスボタン

すべての既存機能を破壊しないこと。特に：
- branch master schema v2 マイグレーション後も既存テスト全件緑
- player.yomi 追加なし（A-4 ルール継承）
- applyMasterMemberEdit シグネチャ厳守（A-4 ルール継承）
- A-4.2 の addPlayerFromMaster シグネチャ厳守

### 6.2 schema_version v1→v2 マイグレーション設計

```javascript
function migrateBranchMasterV1ToV2(masterV1) {
  // 1. バックアップ退避
  localStorage.setItem('shogi_branch_master_v1_backup', JSON.stringify(masterV1));

  // 2. members に city='' を一括付与
  const members = masterV1.members.map(m => ({ ...m, city: m.city || '' }));

  // 3. tournament_archive を空配列で初期化
  return {
    schema_version: 2,
    updated_at: new Date().toISOString(),
    members,
    tournament_archive: []
  };
}
```

マイグレーション失敗時の回復：v1 backup から手動復元できることを e2e で検証。

---

## 7. 実装禁止事項（A-7 以降の継承事項）

A-1〜A-4.2 の禁止事項に加えて、A-7 で以下を新規追加：

1. schema v2 への上げ方は段階的にしない（一度に v1→v2、中間 schema は作らない）
2. tournament_archive を localStorage 以外（IndexedDB / Cookie 等）に保存しない（既存設計の延長を維持）
3. city を必須項目にしない（未入力可）
4. 集金金額の自動計算結果と入力値の差を**強制修正しない**（警告表示に留める）
5. 過去データ取込で既存 tournament_archive を上書きしない（追加のみ、tournament_id 重複は警告）
6. A-8 集計画面はパフォーマンス上問題ない範囲で memoization する（毎回全 archive を走査しない）
7. A-9 Excel パース時に外部ライブラリ（SheetJS 等）を導入する場合は CDN ではなく**バンドル**し、shogi_v4.html の単一ファイル原則を維持するか、別の解決策を検討する

---

## 8. 着手前の最終確認事項

A-7 仕様書 v1 を書き始める際に、以下を再確認：

- [ ] A-4.2 / A-4.1 が main にマージ済み
- [ ] 月例大会で A-4.2 機能が運用試験済み
- [ ] iPhone 16 Plus 実機で問題ないこと確認済み
- [ ] 過去データ Excel ファイル（1年分≒12ファイル）が手元に揃っている
- [ ] 命名規則「月例将棋大会YYMM結果.xlsx」が全ファイルで統一されている

---

**このメモは A-7 仕様書 v1 を書き始めるときの参照資料**として使う。
A-7 仕様書 v1 では本メモを根拠資料として明示し、§9 でレビュー観点を整理する形にする。
