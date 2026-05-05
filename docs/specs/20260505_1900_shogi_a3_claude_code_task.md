# A-3 Claude Code 実装依頼書

**対象**: shogi_v4.html  
**フェーズ**: Phase A-3  
**仕様書**: docs/specs/20260505_1800_shogi_design_phaseA3_v7_3.md  
**ChatGPT判定**: A- / Go（2026-05-05）  
**作成日**: 2026-05-05

---

## 実装前の必須確認

以下を実装前に必ず確認すること：

1. `normalizeBranchMaster` の実フィールド名
2. `updateBranchMasterFromTournament` の player.member / player.grade のフィールド名
3. 参加者行のレンダリングで使っている支部員区分・中学生以下区分のフィールド名

支部員区分・中学生以下区分を引き継ぐ際、**新規フィールドを作らず**、既存コードの branch master / player の実フィールド名に合わせること。

---

## 実装順（Stage）

| Stage | 内容 | 完了条件 |
|-------|------|---------|
| 1 | 登録画面サジェスト | 後述の完了条件参照 |
| 2 | F7 編集（name + yomi のみ） | 既存テスト全件緑 |
| 3 | F7 削除（tombstone） | 既存テスト全件緑 |
| 4 | F8 エクスポート | 既存テスト全件緑 |
| 5 | F8 上書きインポート | 既存テスト全件緑 |
| 6 | F8 マージインポート | 既存テスト全件緑 |
| 7 | クイックフィルタ3種 | 既存テスト全件緑 |
| 8 | 全体テスト・PR | 新規テスト含む全件緑 |

---

## Stage 1: 登録画面サジェスト（詳細）

### 動作フロー

1. 氏名入力欄に1文字以上入力 → マスタ候補が入力欄の下にリスト表示（最大5件）
2. 候補をタップ → 氏名・クラスがフォームに反映（即追加しない）
3. 「追加」ボタン押下 → 参加者行に追加。支部員区分・中学生以下区分はマスタ前回値が自動で入る
4. 必要なら行内ドロップダウンで支部員区分・中学生以下区分を変更

### member_id の扱い

- 候補タップ時に `selectedMasterMemberId` を内部状態として保持する
- 「追加」ボタン押下時に `player.member_id = selectedMasterMemberId` を設定する
- サジェスト候補を選択した参加者を member_id なしの新規参加者として追加しないこと

### member_id 解除条件

- 氏名欄の変更判定は `normalizePersonName` 後の比較で行うこと
- `normalizePersonName(inputName) !== normalizePersonName(selectedMember.name)` の場合に解除
- 一度解除された場合、氏名を元に戻しても自動復活させないこと
- 再設定は再度サジェスト候補を選択することで行う

### 候補対象・除外条件

- `deleted !== true` の member のみ対象
- 既に当日登録済みの `member_id` は候補から除外する（二重追加防止）
- `name` と `yomi` の両方を `normalizePersonName` / `normalizeYomi` 後に部分一致検索
- 1文字以上で候補表示、最大5件
- 候補表示内容: 氏名・ふりがな・前回クラス・最終参加日

### UI動作

- 候補は入力欄の下にリスト表示
- 候補外をタップ or 入力欄 blur で閉じる
- 候補タップ = フォームへ反映のみ（即追加しない）
- 登録フォームに支部員区分・中学生以下区分の新規入力欄を追加しないこと
- 登録フォームのサジェスト検索状態と、過去参加者パネルの検索・50音タブ・クイックフィルタ状態は独立させること

---

## F7 編集・削除

- 編集対象: `name + yomi` のみ（参加履歴は編集不可）
- 削除: tombstone（`deleted: true` + `deleted_at`）、物理削除しない
- 削除済みはサジェスト候補・過去参加者パネルから非表示

---

## F8 マスタバックアップ

### 基本方針

- **F8 は branch master 形式（schema_version + members）のみを扱う**
- 大会データ（players を含む tournament 形式）を F8 で処理しない
- `updateBranchMasterFromTournament` を F8 のロジックとして使わない

### 上書きインポート

- 確認ダイアログ必須: 「現在のマスタをすべて置き換えます。元に戻せません。[現在のマスタを破棄して上書き] [キャンセル]」
- branch master 形式以外はエラー（大会データの場合は「マイグレ機能を使ってください」と案内）

### マージインポート（既存側優先）

- `member.id` を基準に統合（name+yomiの一致だけで自動統合しない）
- name / yomi は既存側を維持
- tournament_ids は union
- last_attended は新しい日付を採用
- first_attended は古い日付を採用
- `attendance_count` = `max(existing.attendance_count, imported.attendance_count, unionTournamentIds.length)`
- `deleted=true` をマージインポートで `deleted=false` に自動復元しない

---

## クイックフィルタ

| フィルタ名 | 内部定義 |
|-----------|---------|
| 前回参加 | last_attended が最終大会日と一致 |
| 3ヶ月以内 | last_attended が直近3ヶ月以内 |
| 常連 | attendance_count >= 5（ハードコード） |

- 排他選択（再タップで解除）

---

## 実装禁止事項

1. schema_version を変更しない
2. F8 で大会データを処理しない
3. `updateBranchMasterFromTournament` を F8 で使わない
4. マージインポートで tombstone を自動復元しない
5. name + yomi 一致だけで member を自動統合しない
6. 既存マイグレ機能の責務を変えない
7. 参加履歴を F7 編集画面で変更可能にしない
8. 復元 UI を A-3 に実装しない
9. A-4 送り項目を先取り実装しない
10. build/bind 分離パターンを壊さない
11. 登録フォームに支部員区分・中学生以下区分の新規入力欄を追加しない
12. 候補選択後に氏名変更があった場合、元の member_id を保持し続けない
13. `deleted=true` の member をサジェスト候補に表示しない
14. 当日登録済みの member_id を二重追加しない
15. 候補タップだけで即追加しない

---

## Stage境界の中止条件

以下の場合は次 Stage に進まず停止する：
- F8 の入力形式判断で迷った場合
- tombstone の挙動で仕様外の判断が必要になった場合
- 既存マイグレ機能に影響が出た場合
- 既存テスト修正が既存仕様変更を伴う場合
- 予定外の UI 追加が発生した場合
