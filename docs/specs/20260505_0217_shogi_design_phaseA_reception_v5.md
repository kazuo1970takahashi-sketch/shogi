# 沼津支部 月例将棋大会アプリ — Phase A 設計仕様書

**プロジェクト**: shogi_v4
**フェーズ**: Phase A（支部マスタ＋ワンクリック呼び出し）
**作成日時**: 2026-05-04 23:41 JST（v1）／ 2026-05-04 v2 改訂 ／ 2026-05-05 00:18 v3 改訂 ／ 2026-05-05 00:43 v4 改訂 ／ 2026-05-05 02:17 v5 改訂
**作成**: 髙橋一雄 × Claude（設計）
**レビュー履歴**: ChatGPT メタレビュー v3（B+/Conditional Go）→ ChatGPT 再レビュー v4（**A-/Go**）→ Claude Code 実装（commit `7d97048`、PR #1）→ **Codex 実装レビュー v4（B/Must Fix）** → 本 v5 改訂
**根拠ロードマップ**: 2026-05-01 ChatGPT 評価 Phase 0-1（運用の信頼性向上） ※過去『Codex評価』として記録されていたもの。v1.2 Slim 5.3節の定義に従い ChatGPT 表記に統一
**v5 反映元レビュー**: 2026-05-05 Codex 実装レビュー（B / Must Fix 5点 / 等級 v4 設計 A- → v4 実装 B）

### 改訂履歴

| バージョン | 日時 | 変更点 |
|---|---|---|
| v1 | 2026-05-04 23:41 | 初版作成 |
| v2 | 2026-05-04 | 未決事項4点を確定。A-1/A-2分割確定（A-1に漢字検索追加）、マイグレ起動はメニューのみ、マスタ画面は独立タブ末尾、エクスポート命名は規則準拠 |
| v3 | 2026-05-05 00:18 | DevSecOps v1.2 Slim 準拠への用語修正。設計レビュー = ChatGPT、実装レビュー = Codex の役割分担を明確化（v1.2 Slim 6.2節 AI メタレビューパターン準拠） |
| v4 | 2026-05-05 00:43 | ChatGPT メタレビュー（B+/Conditional Go）反映。Must Fix 3点（A-1最小マスタタブ追加・member_id 12文字化・normalizeBranchMaster仕様明記）+ Minor 11件を反映 |
| v5 | 2026-05-05 02:17 | Codex 実装レビュー（B/Must Fix）反映。データ整合性・データ事故リスク・破損保護・古環境耐性の4点を仕様レベルで強化。F9 マイグレーション仕様を A-1 の現実に合わせて明文化。テスト要件を Codex 提案 8項目 で拡張 |

---

## 1. 背景・目的

### 解決したい現場の問題

- 月例大会当日の受付作業（氏名確認・参加費徴収・クラス確認）が幹事の負担
- 毎回ゼロから参加者リストを入力するのは無駄。常連は分かっている
- 受付の時間圧迫により、対局開始が遅れることがある

### Phase A のゴール

**「次回大会の準備時に、過去参加者をワンクリックで呼び出せる」状態を作る。**

これにより：
- 事前準備（参加者リスト構築）が分単位の作業に短縮
- Phase B（当日キオスクモード）のデータ基盤を兼ねる
- 支部の参加履歴がデジタル資産として蓄積される

### 非ゴール（Phase A では扱わない）

- 当日の受付フロー（タブレットセルフチェックイン）→ Phase B
- 戦績分析・年間ランキング → 需要確認後に Phase C 候補
- 連絡先管理（電話・メール）→ 現時点で不要

---

## 2. スコープ

### 2.1 機能スコープ

| # | 機能 | 概要 |
|---|---|---|
| F1 | 支部マスタのデータ層 | localStorageに「shogi_branch_master」キーで参加者DB |
| F2 | 大会保存時の自動マスタ更新 | 大会JSONを保存するとマスタが自動同期 |
| F3 | ワンクリック呼び出しUI | 新大会セットアップ画面に「過去参加者」パネル |
| F4 | ふりがな入力 | マスタの参加者にふりがな列を持つ（A-2） |
| F5a | 検索フィルタ（漢字） | 漢字部分一致のリアルタイム絞り込み（A-1必須） |
| F5b | 検索フィルタ（ふりがな） | ふりがな部分一致のリアルタイム絞り込み（A-2） |
| F6 | 50音タブ（補助） | ふりがな登録済み者の頭文字タブ（A-2） |
| F7 | マスタ管理画面（フル） | **独立タブ「マスタ」を末尾配置**。一覧・編集・削除（tombstone方式）（A-2） |
| F11 | **最小マスタタブ**（v4で追加・A-1必須） | A-1 用の簡易タブ。登録人数表示・マイグレーション起動・簡易一覧・利用目的表示のみ |
| F8 | エクスポート/インポート | マスタJSONの入出力（バックアップ用途） |
| F9 | 既存大会JSONマイグレーション | 過去大会データを支部マスタに統合するウィザード |
| F10 | 利用目的明示 | 設定画面に1行表示 |

### 2.2 非機能スコープ

- 既存 shogi_v4 の動作互換性を破らない（既存JSONはそのまま読み込める）
- 単一HTML＋localStorageアーキテクチャを維持（サーバー化しない）
- スマホ対応の現状機能を維持
- 過去のメタレビュー指摘（2026-05-01 ChatGPT 評価、当時『Codex指摘』として記録）の「データモデル見直しゾーン」を意識した設計にする

---

## 3. データモデル

### 3.1 支部マスタ（新規）

**localStorage key**: `shogi_branch_master`

```json
{
  "schema_version": 1,
  "updated_at": "2026-05-04T23:41:00+09:00",
  "members": [
    {
      "id": "m_550e8400e29b",
      "name": "佐藤太郎",
      "yomi": "さとうたろう",
      "last_class": "A",
      "last_attended": "2026-04-15",
      "first_attended": "2024-01-20",
      "attendance_count": 23,
      "tournament_ids": [
        "t_2024_01_20",
        "t_2024_02_17",
        "..."
      ],
      "deleted": false,
      "deleted_at": null,
      "note": ""
    }
  ]
}
```

**フィールド説明**

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| id | string | ✓ | `m_` + crypto.randomUUID() 先頭12文字。同姓同名対応の内部キー（v4 で 6→12 文字化、ChatGPT MF2） |
| name | string | ✓ | 表示用フルネーム（漢字想定）。空文字は不可 |
| yomi | string | ー | ひらがなふりがな。A-1 では空でも可。50音タブ表示は yomi が存在する member のみ |
| last_class | "A" \| "B" \| null | ー | 最後に参加したクラス。デフォルト提案に使用 |
| last_attended | YYYY-MM-DD | ✓ | 最終参加日 |
| first_attended | YYYY-MM-DD | ✓ | 初参加日 |
| attendance_count | integer | ✓ | **派生値**。`tournament_ids.length` から再計算する（v4 で派生値扱い、ChatGPT Minor） |
| tournament_ids | string[] | ✓ | 参加した大会IDの配列。**重複禁止**（同一 tournament_id の二重加算防止） |
| deleted | boolean | ✓ | tombstoneフラグ。**A-1 では予約のみ、操作 UI は A-2** |
| deleted_at | ISO8601 \| null | ー | 削除日時 |
| note | string | ー | 幹事メモ（任意。A-2） |

### 3.2 大会データ（既存 → 拡張）

既存JSONに `tournament_id` と各参加者への `member_id` を追加します。

**既存スキーマ（推定）**:
```json
{
  "tournament_date": "2026-04-15",
  "participants": [
    {"name": "佐藤太郎", "class": "A", ...}
  ],
  ...
}
```

**新スキーマ**:
```json
{
  "tournament_id": "t_2026_04_15",
  "tournament_date": "2026-04-15",
  "participants": [
    {
      "name": "佐藤太郎",
      "class": "A",
      "member_id": "m_a1b2c3",
      ...
    }
  ],
  ...
}
```

**互換性**:
- `tournament_id` がないJSONは、読み込み時に `t_` + 日付から自動生成
- `member_id` がないJSONも読み込めるが、マスタ自動更新は走らない（手動マイグレーション必要）

### 3.3 ID生成ルール

**member_id**（v4 で改訂、ChatGPT MF2 反映 ／ v5 で古環境耐性追加、Codex Must Fix #4 反映）:
- `m_` + `crypto.randomUUID().replace(/-/g, '').slice(0, 12)` （ハイフン除去後の英数字12文字）
- **必ず `replace(/-/g, '')` を `slice(0, 12)` より先に適用する**（順序を入れ替えるとハイフンが ID に含まれる）
- 生成時、既存 `members` に同一IDがないことを確認
- 衝突した場合は再生成（最大3回試行）
- それでも衝突したらエラー通知し、保存を中断
- **`crypto.randomUUID` が利用不可な環境では明示的に throw する**（v5 追加、Codex Must Fix #4）
  - 古い iOS Safari 等で「`m_` だけの不正 ID」が保存されることを防ぐため
  - スマホ運用前提のため、サイレントフォールバックではなくエラーで気付ける設計とする
  - フォールバック実装（`crypto.getRandomValues` 利用）は A-2 以降の検討事項
- UI には表示しない内部キー
- 一度発行した member_id は変更しない（shogi-coach 等との将来連携の安定性のため）

**tournament_id**（v4 で同日重複ルール追加、ChatGPT Minor ／ v5 で大会日ベース確定、Codex Must Fix #1 反映）:
- `t_` + `YYYY_MM_DD` 形式
- **`YYYY_MM_DD` は「大会日」（`report.date`）から生成する。保存日（`todayYmd()`）は使わない**（v5 確定、Codex Must Fix #1）
  - `report.date` が空または無効な場合のみ、フォールバックとして `todayYmd()` を使う
  - 過去大会を別日に保存しても、大会日ベースの ID で `last_attended` と整合する
- **同日重複時の規則**:
  - 既存に同 ID があれば `_2`, `_3`, ... の suffix を付与
  - 例: `t_2026_05_17`, `t_2026_05_17_2`, `t_2026_05_17_3`
- 通常の月例大会では衝突しないが、テスト大会・他支部展開・データ修復時の安全装置
- **関数シグネチャ**：`ensureTournamentId(state, master, tournamentDate)`（v5 で第3引数追加）
  - 第3引数が省略または無効な場合のみ `todayYmd()` にフォールバック

### 3.4 マスタ更新ロジック（F2）

#### 3.4.1 マスタ同期タイミング（v4 で明確化、ChatGPT Minor）

**主タイミング**: 大会JSONバックアップ保存時（`saveData()` 相当）に同期する。

**理由**：
- 大会の運用が一段落したタイミングで永続化する
- localStorage 自動保存（`save()`）に紐付けると参加者編集中に多重更新が発生しやすい
- 参加者登録時点ではまだ確定していない可能性がある

**サブタイミング（任意）**: 「大会完了時」または「最終結果確定時」にも同期可。

**禁止事項**：
- 参加者を入力枠に追加しただけ（保存前）の段階でマスタ更新しない
- `resetAll()` ではマスタを **絶対に** 消さない（既存大会 state のリセットのみ）

#### 3.4.2 更新ロジックの擬似コード（v5 で更新、Codex Must Fix #1, #2 反映）

```
tournamentDate = report.date を YYYY-MM-DD に変換（無効/空ならフォールバックとして todayYmd()）
ensureTournamentId(state, master, tournamentDate)   // 大会日ベースで ID 生成、同日重複は suffix

for 各参加者 in 大会:
    if 参加者.member_id が存在する（ワンクリック呼び出し由来）:
        マスタの該当member.tournament_ids に tournament_id を addOnce
        last_class, last_attended を更新
    else:
        候補 = findMemberCandidates(participant, master)  // 名前正規化後の完全一致を中心
        if 候補が0件:
            新規 member 作成（generateMemberId、yomi 空、tournament_ids = [tournament_id]）
            マスタに追加
            参加者.member_id ← 新 member の id
        elif 候補が1件:
            参加者.member_id ← 候補.id
            上記の addOnce 処理
        elif 候補が複数:
            この participant のマスタ同期をスキップ（v5: Codex Must Fix #2）
            ※ confirm ダイアログでの「Cancel = 先頭候補へ紐付け」のような誤統合を絶対に行わない
            ※ 参加者の member_id は付与しない（後で手動で紐付ける余地を残す）
            ※ ユーザーへは控えめに通知（例: 「同名候補が複数あるため○○さんは保留しました」）

各member について:
    attendance_count = tournament_ids.length に再計算
```

#### 3.4.3 二重加算防止（v4 で追加、ChatGPT Minor）

- `addOnce(arr, id)` は `if (!arr.includes(id)) arr.push(id)` の意味
- 同一大会JSONを2回保存しても tournament_ids に同 ID が重複しない
- attendance_count は派生値なので、必ず tournament_ids.length から再計算する

#### 3.4.4 A-1 の曖昧マッチ仕様（v4 で明確化、ChatGPT Minor ／ v5 で複数候補時の動作確定、Codex Must Fix #2）

A-1 では yomi が空の member が大半である前提で、以下を採用する：

- マッチ基準は **正規化された name の完全一致** を中心とする
- 正規化ルール（`normalizePersonName(name)`）：
  - 前後空白除去
  - 全角スペース ↔ 半角スペースを統一
  - 連続空白を単一空白に
- yomi が両方とも存在する場合のみ、yomi 完全一致も使う
- **マッチ候補 0件 → 新規 member 作成**
- **マッチ候補 1件 → 自動的に紐付け（addOnce 処理）**
- **マッチ候補 複数件 → その participant のマスタ同期をスキップ**（v5 で確定、Codex Must Fix #2）
  - confirm ダイアログでの「Cancel = 先頭候補に紐付け」のような誤統合は **絶対に行わない**
  - 誤タップや意味の取り違えで別人を統合する事故を防ぐ
  - participant の `member_id` は付与しない（後で手動紐付けの余地を残す）
  - 大会JSON 保存自体は継続する（運用を止めない）
  - ユーザーへは保留した旨を控えめに通知

#### 3.4.5 マイグレーション時の割り切り（v5 新設、Codex Must Fix #5）

仕様書 4.4 のマイグレーションウィザードについて、**A-1 では対話的な「統合 / 別人」選択 UI を実装しない** と明文化する。

代わりに、以下の動作とする：

- **マッチ候補 0件 → 新規 member 作成**
- **マッチ候補 1件 → 既存 member に統合（`tournament_ids` に addOnce）**
- **マッチ候補 複数件 → 新規 member 作成**（同名異人を別人として扱う、安全側）

この割り切りは、A-1 の運用試験で「自動統合の誤マージ」が起きないようにする安全策でもある。
A-2 で対話選択 UI（プレビュー、統合/別人選択）を提供するまでは、この簡略動作を採用する。

注：3.4.4 の通常マスタ同期（saveData() 経路）と 3.4.5 のマイグレーション経路で、複数候補時の動作が異なる：
- 通常マスタ同期：**スキップ**（参加者編集中に勝手に新規追加すると意図しない別人が増える）
- マイグレーション：**新規追加**（過去JSON取込は一括処理で、保留してもユーザーが手動補正できないため）

### 3.5 normalizeBranchMaster(raw)（v4 で追加、ChatGPT MF3 ／ v5 で破損保護を強化、Codex Must Fix #3）

支部マスタの読み込み時、必ず `normalizeBranchMaster(raw)` を通す。
**目的**：壊れたマスタを読んでも既存大会運営を止めないこと。

```
normalizeBranchMaster(raw):
    if raw が object でない:
        return createEmptyBranchMaster()

    schema_version:
        - 不在 → 1 とみなす
        - 未知の値 → 安全側に倒す（最新スキーマで読む試行 → 失敗時は空マスタ）

    members:
        - 配列でない → 空配列
        - 各 member について:
            - id 不在 or 重複 → 該当 member を除外（ログ警告）
            - name 空 or 不在 → 該当 member を除外
            - yomi 不在 → 空文字
            - last_class 不正 → null
            - last_attended 不正 → first_attended と同じか今日に補正
            - first_attended 不正 → last_attended と同じか今日に補正
            - tournament_ids 不在 or 配列でない → []
            - tournament_ids の重複を除去
            - deleted 不在 → false
            - deleted_at 不在 → null
            - attendance_count 再計算 = tournament_ids.length

    updated_at:
        - 不在 → 現在時刻

    return 正規化済みマスタ
```

**isValidYmd の実在検証**（v5 で強化、Codex Minor 反映）:
- 形式チェック（`/^\d{4}-\d{2}-\d{2}$/`）に加え、`Date` オブジェクトでの実在検証を行う
- 例: `2026-99-99` や `2026-02-30` のような形式上は valid だが実在しない日付を弾く
- 実装イメージ：`new Date(s).toISOString().slice(0,10) === s` 等
- 不正日付は通常の補正フロー（first_attended ↔ last_attended ↔ today）に乗せる

**破損マスタの保護**（v5 で **新規追加**、Codex Must Fix #3）:

`normalizeBranchMaster` 自体ではなく、**呼び出し側（`loadBranchMaster` および `syncBranchMasterOnSave`）の責務**として明文化する。

- `loadBranchMaster()` は破損 raw を読んだ場合、空マスタを返すと同時に **「破損マスタ由来の空」フラグ** を返却値に含める
  - 例: `{ schema_version: 1, ..., _loaded_with_corruption: true }`
  - このフラグはマスタ本体の永続化対象には含めない（保存時にプロパティを除外）
- `syncBranchMasterOnSave()` は **`_loaded_with_corruption` フラグが立っている場合、`saveBranchMaster()` を呼ばない**
  - 大会JSONバックアップ保存自体は継続する（運用を止めない）
  - 破損 localStorage は手付かずのまま保持される（ユーザーがマイグレーション再実行や手動修復で上書きする余地を残す）
  - ユーザーへは控えめに通知（例: 「支部マスタが破損しているため自動同期をスキップしました」）

**設計意図**：
- 既存 `normalizeState(raw)` の堅牢化思想（HANDOFF.md 参照）と整合
- マスタ破損時もアプリ全体は起動・大会運営は継続
- **破損データを「空ベースの新マスタ」で自動上書きしない**（v5 確定、Codex Must Fix #3）
- 警告ログを出すが、ユーザの操作を止めない

---

## 4. UI仕様

### 4.1 新大会セットアップ画面の拡張（F3, F5, F6）

既存「参加者を入力」エリアの上部に新セクションを追加：

```
┌─────────────────────────────────────────┐
│ 過去参加者から選ぶ                         │
│ ┌───────────────────────────────────┐ │
│ │ 🔍 [          検索（漢字・ふりがな）] │ │
│ └───────────────────────────────────┘ │
│ [全て] [あ][か][さ][た][な][は][ま][や][ら][わ] │
│                                         │
│ クイックフィルタ:                          │
│  ◯ 前回大会の参加者 (32名)                │
│  ◯ 3ヶ月以内 (45名)                       │
│  ◯ 常連（年5回以上）(18名)                │
│  ● 全て                                  │
│                                         │
│ ☐ 佐藤太郎  (Aクラス、最終: 2026-04)     │
│ ☑ 鈴木一郎  (Bクラス、最終: 2026-04)     │
│ ☐ 田中健一  (Aクラス、最終: 2026-03)     │
│ ...                                     │
│                                         │
│ [ 選択した3名を追加 ]                     │
└─────────────────────────────────────────┘
```

**動作**:
- チェックボックスで複数選択 → 「追加」ボタンで一括追加
- 追加された人は既存の参加者リストに反映、クラスは last_class がデフォルト
- 選択UIは閉じることもできる（普段は折りたたみ）

### 4.2 マスタタブ（v4 で2段階に分離、ChatGPT MF1）

#### 4.2.1 最小マスタタブ（F11、A-1 必須）

A-1 で実装する。独立タブ「マスタ」を末尾配置。

```
┌─ マスタ ─────────────────────────────┐
│ 沼津支部 参加者マスタ                  │
│ 登録: 87名                            │
│                                       │
│ [📥 過去大会を支部マスタに統合]         │
│                                       │
│ ─ 簡易一覧 ────────────────────────── │
│ 氏名         最終参加    回数          │
│ 佐藤太郎     2026-04     23           │
│ 鈴木一郎     2026-04     18           │
│ 田中健一     2026-03     12           │
│ ...                                   │
│                                       │
│ ─ 利用目的（F10） ─────────────────── │
│ 本ツールは沼津支部内の大会運営目的で、 │
│ 過去参加者の氏名・参加履歴をこの端末   │
│ 内に保存します。                       │
└────────────────────────────────────┘
```

**A-1 で含める機能**：
- 登録人数表示
- マイグレーション起動ボタン（F9）
- 簡易一覧（読み取り専用、ソート機能なし）
- 利用目的明示（F10、A-1 に前倒し、ChatGPT Minor）

**A-1 で含めない機能**（A-2 で追加）：
- 編集・削除・tombstone 操作
- エクスポート/インポート
- 検索フィルタ（タブ内）
- ふりがな関連表示

#### 4.2.2 フルマスタ管理画面（F7、A-2）

A-2 で同タブを拡張。

```
┌─ 支部マスタ管理 ──────────────────────────┐
│ 登録: 87名（うち削除済 3名）                 │
│ [🔍 検索] [+ 新規追加] [📥 エクスポート] [📤 インポート] │
│ ─────────────────────────────────────── │
│ 氏名         ふりがな     最終  回数  操作   │
│ 佐藤太郎     さとうたろう 2026-04 23 [編集][🗑]│
│ 鈴木一郎     すずきいちろう 2026-04 18 [編集][🗑]│
│ 田中健一     —           2026-03 12 [編集][🗑]│
│ ...                                          │
└────────────────────────────────────────┘
```

**編集モーダル**：氏名、ふりがな、メモ、最終クラス（手動上書き可）

**削除動作**（tombstone方式）：
- 確認ダイアログ「○○さんを削除しますか？過去の大会記録には残ります」
- `deleted: true, deleted_at: 現在時刻` をセット
- 一覧からは消える（フィルタで「削除済を表示」可）
- 過去大会画面では「○○（削除済）」と表示

### 4.3 ふりがな入力（F4）

新規参加者を入力するフォーム（既存）に「ふりがな」欄を追加：

```
氏名:   [          ]
ふりがな: [          ] (任意、入力すると50音検索可)
クラス: ○ A  ◯ B
```

**任意入力**にする理由：当日受付で「初参加・新規」を急いで入れる時にブロッカーにしない。

### 4.4 マイグレーションウィザード（F9）

**「マスタ」タブ → 「過去大会を支部マスタに統合」ボタンから起動**（バナー表示はしない）。
**A-1 で最小マスタタブと同時に提供する**（v4 で MF1 解消、ChatGPT 推奨案1）：

```
┌─ 過去大会の統合 ────────────────────────┐
│                                         │
│ 過去の大会JSONファイルを読み込んで、       │
│ 支部マスタを構築します。                   │
│                                         │
│ [📁 大会JSONを選択（複数可）]              │
│                                         │
│ 検出された参加者:                          │
│  ☑ 佐藤太郎（5大会で参加）                │
│  ☑ 鈴木一郎（3大会で参加）                │
│  ⚠ 山田太郎 ／ 山田 太郎（同一人物？）    │
│      ◯ 同一人物として統合                 │
│      ◯ 別人として登録                     │
│                                         │
│ [ 統合を実行 ]                           │
└─────────────────────────────────────────┘
```

**A-1 では対話的な「統合 / 別人」選択 UI を実装しない**（v5 で確定、Codex Must Fix #5 反映）

A-1 のマイグレーションは以下の簡略動作とする（仕様書 3.4.5 参照）：

- ファイル選択 → 一括取込 → サマリ表示（追加 N / 統合 N / スキップ N）の最小フロー
- マッチ候補 0件 → 新規 member 作成
- マッチ候補 1件 → 既存 member に統合（addOnce 処理）
- マッチ候補 複数件 → **新規 member 作成**（同名異人を別人として扱う、安全側）
- 上記イメージ図中の「☑ 検出参加者プレビュー」「◯ 同一人物 / 別人 選択」UI は **A-2 で提供予定**

A-1 で対話 UI を省略する理由：
- 通常マスタ同期（saveData() 経路）の「複数候補時はスキップ」（仕様書 3.4.4）と動作差を持たせる必要がある
  - 通常経路：参加者リストの一部だけ保留できるため、スキップしてユーザーが手動補正できる
  - マイグレーション経路：過去JSON取込は一括処理で、スキップ後の手動補正手段が A-1 にはない
  - そのため、マイグレーションでは「自動統合せず新規」が現実的な落としどころ
- 対話 UI（プレビュー、統合/別人選択）の実装工数は A-2 規模になる
- A-1 は「過去データの基本的な取込が動く」ことを最優先する

### 4.5 利用目的明示（F10、v4 で A-1 前倒し）

**最小マスタタブ（A-1）の最下部に表示**（ChatGPT Minor 反映、A-1 から個人情報蓄積するため必要）：

> 本ツールは沼津支部内の大会運営目的で、過去参加者の氏名・参加履歴をこの端末内に保存します。削除を希望される場合は支部マスタ管理画面（A-2 提供予定）から削除できます。

---

## 5. マイグレーション仕様

### 5.1 既存利用者（既にshogi_v4を使っている髙橋さん）

1. アプリ更新後、新設の「マスタ」タブにアクセス
2. 「過去大会を支部マスタに統合」ボタンからウィザード起動
3. 過去JSONを順次読み込み
4. 同名検出時は対話で確認
5. 完了後、マスタが構築され、既存大会JSONには `tournament_id` と `member_id` が追記された新JSONとして再保存可能（任意）

### 5.2 新規利用者

- 初回起動時にウィザードはスキップ可
- 通常の大会運用を続けると、自動的にマスタが構築されていく

### 5.3 後方互換性

- 旧JSON（`tournament_id` なし）も読み込める
- マスタなしでも従来通り動作する（マスタは「あれば便利」レイヤー）

---

## 6. 削除・エクスポート・インポート

### 6.1 削除（tombstone方式）

- マスタからは見えなくなるが、過去大会の参加記録には残る
- 完全削除（過去記録からも抹消）は提供しない
  - 理由：データ整合性の観点。完全削除したいなら過去JSONを直接編集する想定

### 6.2 エクスポート

- マスタ全体をJSONファイルとしてダウンロード
- ファイル名: `YYYYMMDD_HHMM_shogi_master_export.json`（TZ=Asia/Tokyo）
- v1.2 final プロジェクト共通命名規則に準拠

### 6.3 インポート

- マスタJSONを読み込み
- 既存マスタとマージ or 上書きを選択
- マージ時は `id` を主キーに更新

---

## 7. テスト計画（v4 で ChatGPT 指摘 7.x 系を全反映）

### 7.1 ユニットテスト

| テスト対象 | ケース |
|---|---|
| マスタ更新ロジック | 新規追加、既存更新、曖昧マッチ、二重加算防止 |
| ID生成 | 12文字版で衝突しない（10000回ループ）、衝突時の再生成、最大試行超過時のエラー |
| 検索フィルタ（漢字） | 部分一致、空文字、特殊文字 |
| 50音グルーピング（A-2） | あ行〜わ行、外国人名・yomi空のメンバーの扱い |
| マイグレーション | 旧JSON読み込み、tournament_id自動生成、重複時 suffix 付与 |
| tombstone | 削除後の表示、過去記録での表示（A-2） |
| **normalizeBranchMaster** | 各種破損パターンを通しても落ちない（下記 7.4 と接続） |
| **normalizePersonName** | 全角/半角空白、前後空白、連続空白の正規化 |
| **ensureTournamentId** | 同日重複の suffix 採番 |

### 7.2 性質テスト（既存テストパターン継承）

- 任意のN名参加者をマスタ登録 → 大会保存 → マスタ整合性
- 同名異人パターンでの member_id 一意性
- マスタJSONエクスポート → インポート → 等価性（A-2）
- **同一大会JSONを複数回保存しても attendance_count が増えない**（v4 追加、二重加算防止）

### 7.3 既存大会運営の非破壊テスト（v4 で追加、ChatGPT 7.1）

支部マスタを追加しても既存運営が壊れないことが最重要。以下を必須化：

- マスタなしで従来通り参加者登録できる
- マスタなしで大会開始できる
- マスタなしでJSON保存・読込できる
- マスタなしで対局管理できる
- マスタなしで最終結果を表示できる
- **`resetAll()` がマスタを消さない**
- 既存JSON読込後に member_id がなくても落ちない
- 既存 shogi_v3 / shogi_v4 データの normalizeState が壊れない
- 既存 build/bind/coordinator パターンを保つ

### 7.4 マスタ破損時テスト（v4 で追加、ChatGPT 7.2）

`normalizeBranchMaster(raw)` が以下のいずれを与えられても、**アプリは起動し既存大会運営を継続する**：

- `shogi_branch_master` が壊れた JSON
- schema_version なし
- schema_version が未知の値
- members が配列でない
- tournament_ids がない
- deleted がない
- deleted_at が不正
- attendance_count が tournament_ids.length とズレている
- 同じ id が重複している
- 同じ tournament_id が二重に入っている
- name が空の member がいる
- localStorage 容量エラー時に既存大会運営が止まらない

### 7.5 同名異人テスト（v4 で必須化、ChatGPT 7.3）

- 同じ漢字氏名、別 member_id
- 同じ氏名で A/B クラスが違う
- 「山田太郎」と「山田 太郎」（空白差）
- 「山田太郎」と「山田　太郎」（全角空白）
- 「髙橋」と「高橋」（旧字・新字）→ **自動統合しない**
- 旧JSONから読み込んだ同名参加者を統合する
- 旧JSONから読み込んだ同名参加者を別人として登録する
- 同名候補が複数ある場合に自動確定しない

### 7.6 マスタ更新の二重加算防止テスト（v4 で追加、ChatGPT 7.5）

- 同一 tournament_id を2回保存しても attendance_count が増えない
- tournament_ids に同じIDが重複しない
- 別 tournament_id なら attendance_count が増える

### 7.7 Codex 実装レビュー反映テスト（v5 で新規追加、Codex Must Fix 1〜4 + Minor）

v4 実装の Codex レビュー（B/Must Fix）で発見された穴を埋めるテスト群。
**いずれも「テストは緑だが実装が間違っている」を検出する観点。**

1. **tournament_id が大会日ベースで生成される**（Codex Must Fix #1）
   - `report.date = "2026年4月15日"` の状態で別日に saveData 相当を実行 → `tournament_id === "t_2026_04_15"` になる
   - 既存 `state.tournament_id` がある場合は保持される
   - 同日 `tournament_id` が既存にある場合、`_2`, `_3` suffix が大会日ベースで付く
2. **破損 shogi_branch_master が saveData() 経由で上書きされない**（Codex Must Fix #3）
   - 破損 `shogi_branch_master` がある状態で `syncBranchMasterOnSave()` 相当を実行 → localStorage の raw が保持される
   - 大会JSON保存自体は継続する
3. **同名複数候補で confirm cancel 時に紐付かない**（Codex Must Fix #2）
   - participant の `member_id` が付与されない
   - 該当 member の `tournament_ids` にこの大会IDが追加されない
   - 他の参加者の同期は継続する
4. **crypto.randomUUID 不在環境**（Codex Must Fix #4）
   - `crypto.randomUUID` が `undefined` の状態で `generateMemberId()` を呼ぶと throw する
   - `m_` だけの不正 ID が保存されない
5. **isValidYmd の実在検証**（Codex Minor）
   - `2026-99-99`, `2026-02-30`, `2026-13-01` 等を invalid と判定する
   - `2026-02-29`（うるう年でない）を invalid と判定する
   - 正常な日付（`2026-04-15` 等）は valid のまま
6. **マイグレーション同名複数候補の新規扱い**（Codex Must Fix #5、仕様書 3.4.5 反映）
   - 同名 member が既に2件以上ある状態でマイグレーション → 新規 member が追加される
   - 既存 member に統合されない

### 7.8 手動E2Eテスト

- 新規大会セットアップ → ワンクリック呼び出し → 対局進行 → JSONバックアップ保存 → マスタ更新確認
- マイグレーションウィザードで過去5大会統合
- スマホでの検索フィルタ操作（漢字検索のみ A-1）
- 最小マスタタブの表示確認

### 7.9 本番運用試験

- 次回月例大会（CGC杯ではなく将棋大会）で実運用
- 「事前準備にかかった時間」を計測（従来比較）
- 操作事故のログ取り（2026-05-01 ChatGPT Phase 1 提言）

---

## 8. 既知の割り切り

| 項目 | 割り切り | 理由 |
|---|---|---|
| クラウド同期 | しない（localStorage完結） | 単一HTMLアーキテクチャ維持。ChatGPT 評価（2026-05-01）でも「実需が見えてから」 |
| 認証 | なし | 幹事1名運用が前提。多人数編集はPhase 4以降 |
| 連絡先管理 | しない | LINE/メール連絡は支部の別チャネルで完結 |
| 戦績集約 | しない | 中量版データモデルにとどめる。重量版はPhase C候補 |
| ふりがな自動取得 | しない | IME APIは環境差大。手入力で十分（ChatGPT 9.2 確認） |
| 同姓同名の自動判別 | しない | 対話で確認。誤マージ防止 |
| マスタの完全削除 | 提供しない | tombstoneのみ。整合性優先 |
| **既存 state と支部マスタを混ぜない** | **state は大会運営の一時データ、マスタは大会をまたぐ永続データ。別 localStorage キーで管理** | v4 で明文化（ChatGPT 4.1）。`resetAll()` でマスタを消さない |
| **build/bind/coordinator パターン維持** | **新規UIにも既存パターンを適用** | v4 で明文化（ChatGPT 4.2）。関数構成は付録 C 参照 |

---

## 9. 実装フェーズ分割（**v4 で MF1 反映、ChatGPT 12章準拠で再定義** ／ **v5 で F2/F9 の割り切りを追記**）

Phase A は2段に分けて実装する。

### Phase A-1（運用試験まで含む最小完結セット）

**v4 で改訂**：F9 起動場所の矛盾を解消し、最小マスタタブ（F11）と F10 を A-1 に組み込む。
**v5 で追記**：F2 / F9 の同名複数候補時の動作差を明示（Codex Must Fix #2, #5 反映）。

含める機能：
- F1: 支部マスタのデータ層（normalizeBranchMaster 含む）
- F2: 大会JSONバックアップ保存時のマスタ自動同期（二重加算防止）
  - **同名複数候補時はスキップ**（v5 確定、仕様書 3.4.4）
- F3: ワンクリック呼び出しUI（基本形）
- F5a: 検索フィルタ（漢字部分一致のみ）
- F9: マイグレーションウィザード
  - **同名複数候補時は新規 member 作成（自動統合せず別人扱い）**（v5 確定、仕様書 3.4.5）
  - **対話的「統合 / 別人」選択 UI は A-2 で提供予定**（v5 で明記、仕様書 4.4）
- F10: 利用目的の最小表示（最小マスタタブ内）
- F11: 最小マスタタブ
  - 登録人数表示
  - マイグレーション起動ボタン
  - 簡易一覧（読み取り専用）
  - 利用目的表示

A-1 で含めない（A-2 へ）：
- ふりがな入力（F4）
- ふりがな検索（F5b）
- 50音タブ（F6）
- マスタ管理画面のフル機能（F7：編集・削除・tombstone 操作）
- エクスポート/インポート（F8）
- クイックフィルタ（前回大会の参加者・3ヶ月以内・常連）
- **マイグレーション対話 UI**（プレビュー、同名候補の統合/別人選択、v5 で明記）
- **保留 participant の手動紐付け UI**（同名複数候補で同期スキップした場合の事後操作、v5 で明記）

→ ここで一旦リリース。次回月例大会で運用試験。
→ 「事前準備時間の短縮効果」「操作事故ログ」を計測。

### Phase A-2（精緻化＋管理機能）

- F4: ふりがな入力
- F5b: 検索フィルタ（ふりがな対応）
- F6: 50音タブ
- F7: マスタ管理画面のフル機能（編集・tombstone 操作・検索）
- F8: エクスポート/インポート
- クイックフィルタ機能（前回参加者・3ヶ月以内・常連）
- 利用目的表示の詳細化
- **マイグレーション対話 UI**（プレビュー、統合/別人選択、v5 で明記）
- **保留 participant の手動紐付け UI**（v5 で明記）

→ A-1 の運用結果を踏まえて精緻化。仕様の詳細はA-1完了後に再レビュー。

### A-1 完結条件（v4 で明記、ChatGPT 6.3 反映 ／ v5 で更新）

A-1 単体で運用試験に出すための完結条件：

- 過去JSONを統合できる（マイグレーションウィザード経由、同名複数候補は新規扱い）
- 過去参加者を検索できる（漢字部分一致）
- チェックして参加者登録に追加できる（ワンクリック呼び出し）
- 大会JSONバックアップ保存時にマスタ更新できる（二重加算なし、同名複数候補はスキップ）
- 既存大会運営が壊れない（normalizeBranchMaster で堅牢化、破損マスタの自動上書きなし）
- マスタがなくても従来通り動く（後方互換）
- 利用目的が最低限表示される（F10）
- **`crypto.randomUUID` 不在環境で不正 ID が保存されない**（v5 追加、Codex Must Fix #4）
- **tournament_id が大会日ベースで生成される**（v5 追加、Codex Must Fix #1）

### A-1 / A-2 の境界判断

A-1完了後、ChatGPT 運用評価（GitHub 連携メタレビュー）を経て A-2 に進む。A-1 で得た現場フィードバックにより A-2 機能の優先順位や仕様を調整する余地を残す。

---

## 10. レビュー反映状況（v4 ChatGPT 設計レビュー / v5 Codex 実装レビュー）

### 10.1 v3 に対する ChatGPT メタレビュー（B+ / Conditional Go、v4 で全反映）

#### Must Fix（v4 で全反映）

| # | 指摘 | v4 反映箇所 |
|---|---|---|
| MF1 | A-1/A-2 矛盾（F9 起動場所が A-2 のマスタタブ前提）| 4.2.1 最小マスタタブ（F11）を A-1 に追加。9章 Phase A-1 再定義 |
| MF2 | member_id を UUID 6文字 → 12文字以上 | 3.1 / 3.3 で member_id 生成仕様改訂 |
| MF3 | normalizeBranchMaster(raw) 仕様の明記 | 3.5 で新規セクション。7.4 でテスト追加 |

#### Minor 改善（v4 で全反映）

| # | 指摘 | v4 反映箇所 |
|---|---|---|
| 1 | F10 利用目的明示を A-1 へ前倒し | 4.5、9章 |
| 2 | attendance_count を派生値扱い | 3.1、3.4.3 |
| 3 | tournament_id 同日重複ルール | 3.3 |
| 4 | マスタ同期タイミング明確化 | 3.4.1 |
| 5 | resetAll() がマスタを消さない明記 | 3.4.1、8章 |
| 6 | A-1 曖昧マッチを「漢字一致中心」と明記 | 3.4.4 |
| 7 | 空白・全角半角の正規化ルール | 3.4.4、付録C `normalizePersonName` |
| 8 | 既存 state と支部マスタを混ぜない | 8章、付録C 注意事項 |
| 9 | build/bind/coordinator パターン適用 | 8章、付録C |
| 10 | 既存壊れない／破損／二重加算 テスト追加 | 7.3 / 7.4 / 7.6 |
| 11 | 同名異人テスト必須化 | 7.5 |

→ ChatGPT 再レビュー（v4）で **A- / Go** 判定。実装着手可。

### 10.2 v4 実装に対する Codex 実装レビュー（B / Must Fix、v5 で全反映）

PR #1（commit `7d97048`）に対する Codex 実装レビューで、**「テストは緑だが実装が間違っている」3点 + 古環境耐性 + 仕様乖離** を発見。

#### Must Fix（v5 で全反映、4件はコード修正、1件は仕様明文化で対応）

| # | 指摘 | 重要度 | v5 反映箇所 | 対応 |
|---|---|---|---|---|
| #1 | tournament_id が大会日ではなく保存日で生成される | P1（データ整合性）| 3.3、3.4.2、9章完結条件 | 仕様：`ensureTournamentId(state, master, tournamentDate)` 第3引数追加。実装で修正 |
| #2 | 同名複数候補で confirm Cancel が cands[0] へ誤紐付け | P1（データ事故リスク）| 3.4.2、3.4.4 | 仕様：複数候補時は **同期スキップ**（紐付けない）。実装で修正 |
| #3 | 破損マスタが saveData 経由で空上書きされ得る | P1（復旧不能事故）| 3.5 | 仕様：`loadBranchMaster` が破損フラグ付き返却 → `syncBranchMasterOnSave` でスキップ。実装で修正 |
| #4 | crypto.randomUUID 不在時に `m_` だけの不正 ID 生成 | P2（古環境）| 3.3、9章完結条件 | 仕様：明示 throw。実装で修正 |
| #5 | F9 マイグレーションが対話ウィザードでない | P2（仕様乖離）| 3.4.5（新設）、4.4、9章 | **仕様修正**：A-1 では複数候補を新規扱い。対話 UI は A-2 で提供 |

#### Minor 改善（v5 で反映、実装でも対応）

| # | 指摘 | v5 反映箇所 |
|---|---|---|
| 1 | `isValidYmd` が形式チェックのみで実在日検証なし | 3.5 で `Date` オブジェクト実在検証を追加 |
| 2 | schema_version 未知時の「読む試行」簡略化はA-1割り切り | A-1 では現状維持（明文化のみ） |

#### 追加すべきテスト（v5 で 7.7 として 6項目を新設、実装時に追加）

1. tournament_id が `report.date` ベースで生成される（複数ケース）
2. 既存 `state.tournament_id` の保持
3. 大会日ベースで suffix 採番
4. 破損マスタの saveData 経由保護
5. 同名複数候補で confirm Cancel 時に紐付かないこと
6. crypto.randomUUID 不在時の不正 ID 防止
7. `2026-99-99` 等の不正日付を弾く（isValidYmd 強化）
8. マイグレーション同名複数候補の新規扱い

→ Codex 再レビュー（v5 実装後）で OK 判定なら main マージへ。

---

## 11. 決定事項（v2/v4/v5 で確定済み）

| # | 論点 | 決定内容 | 確定 |
|---|---|---|---|
| 1 | A-1/A-2 分割 | **分割を採用**。A-1 に漢字検索（F5a）、最小マスタタブ（F11）、F10前倒しを追加 | v2 + v4 |
| 2 | マイグレ起動 | **「マスタ」タブ内のメニューのみ**。バナーは出さない | v2 |
| 3 | マスタ管理画面 | **独立タブ「マスタ」を末尾配置**。A-1 で最小版、A-2 で フル版 | v2 + v4 |
| 4 | エクスポート命名 | **`YYYYMMDD_HHMM_shogi_master_export.json`**（TZ=Asia/Tokyo、規則準拠） | v2 |
| 5 | member_id 長さ | **UUID 先頭12文字 + 衝突再生成** | v4（ChatGPT MF2） |
| 6 | normalizeBranchMaster | **必須。読込時に必ず通す** | v4（ChatGPT MF3） |
| 7 | マスタ同期タイミング | **大会JSONバックアップ保存時を主とする** | v4（ChatGPT Minor） |
| 8 | tournament_id 同日重複 | **suffix `_2`, `_3` を付与** | v4（ChatGPT Minor） |
| 9 | resetAll() の挙動 | **マスタは消さない**（既存大会 state のみリセット） | v4（ChatGPT Minor） |
| 10 | 既存 state との分離 | **別 localStorage キーで管理**、混ぜない | v4（ChatGPT 4.1） |
| 11 | tournament_id 生成元 | **大会日ベース（`report.date`）。保存日にしない** | v5（Codex Must Fix #1） |
| 12 | 同名複数候補時（通常同期）| **スキップ**（confirm Cancel での紐付けは禁止） | v5（Codex Must Fix #2） |
| 13 | 破損マスタの自動上書き | **禁止**。`syncBranchMasterOnSave` でスキップ | v5（Codex Must Fix #3） |
| 14 | crypto.randomUUID 不在 | **明示 throw**（フォールバックは A-2 検討） | v5（Codex Must Fix #4） |
| 15 | マイグレーション同名複数 | **新規 member 作成**（A-1 割り切り、対話 UI は A-2） | v5（Codex Must Fix #5） |
| 16 | isValidYmd の実在検証 | **`Date` オブジェクトで実在検証** | v5（Codex Minor） |

---

## 付録 A: 用語

- **支部マスタ**: 沼津支部の参加者DB（本仕様で新設）
- **tombstone**: 削除フラグのみ立てて物理削除しない方式
- **キオスクモード**: Phase B で実装予定の当日受付UI
- **member_id / tournament_id**: 本仕様で新設する内部ID

## 付録 B: 想定外への備え

- マスタが破損した場合: localStorage の他キー（既存大会JSON）から再構築可能
- localStorage 容量超過: 通常運用5年で10〜20KB程度のため考慮不要（ChatGPT 3章で5年・100名規模は問題なしと評価）
- ブラウザ変更/端末故障: エクスポート機能で予防（A-2 で提供）

---

## 付録 C: 推奨する関数構成（v4 で追加、ChatGPT 13章転記）

実装時の関数分割案。既存の build/bind/coordinator パターンに合わせる。
**既存 `renderRegList()` に全部詰め込まないこと。既存 `save()` / `resetAll()` の意味を壊さないこと。**

### データ層

```javascript
loadBranchMaster()                       // localStorage から読込 + normalize
saveBranchMaster(master)                 // localStorage へ保存 + updated_at 更新
normalizeBranchMaster(raw)               // 破損時の堅牢化（3.5節）
createEmptyBranchMaster()                // 空マスタ生成
generateMemberId(master)                 // 12文字 + 衝突再生成（3.3節）
normalizePersonName(name)                // 全角/半角空白・連続空白を統一
findMemberCandidates(participant, master) // 名前正規化後の完全一致中心（A-1）
updateBranchMasterFromTournament(state, master, tournamentMeta)  // F2のメインロジック
```

### マスタ同期補助

```javascript
ensureTournamentId(state)                // tournament_id 確保（同日重複対応）
attachMemberIdToPlayer(player, member)   // ワンクリック呼び出し時の紐付け
addTournamentIdOnce(member, tournamentId) // 二重加算防止（3.4.3節）
recalcMemberAttendance(member)           // attendance_count = tournament_ids.length
```

### 過去参加者UI（F3, F5a）

```javascript
buildPastParticipantsPanelHtml(master, filter)  // HTML生成
bindPastParticipantsPanelEvents()               // イベントバインド
renderPastParticipantsPanel()                   // 描画コーディネータ
```

### 最小マスタタブ（F11、A-1）

```javascript
buildMasterTabHtml(master)
bindMasterTabEvents()
renderMasterTab()
```

### マイグレーション（F9）

```javascript
buildMigrationModalHtml(...)
bindMigrationModalEvents(...)
openMigrationWizard()
parseTournamentJsonFiles(files)
mergeTournamentParticipantsIntoMaster(...)
```

### A-2 で追加される関数（参考）

```javascript
// マスタ管理画面（F7）
buildMasterManagementHtml(master, filter)
bindMasterManagementEvents()
renderMasterManagement()
deleteMember(memberId)                  // tombstone 設定
exportBranchMaster()                    // F8
importBranchMaster(file, mode)          // F8（mode: merge | overwrite）

// ふりがな・50音（F4, F5b, F6）
build50OnTabsHtml(master)
filterByYomi(master, query)
```

### 実装上の注意

- すべての DOM 操作は build/bind/coordinator に従う
- データ層関数は副作用なし（純粋関数）に近づける
- マスタ更新は 1箇所（`updateBranchMasterFromTournament`）に集約
- `save()` と `saveData()` の責務を明確に分け、`save()` ではマスタ同期しない
- `resetAll()` ではマスタを **絶対に** 消さない

---

**END OF DOCUMENT**
