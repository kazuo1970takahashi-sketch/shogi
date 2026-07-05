# design-review 依頼 — CLASS-SPLIT-CLOUD-MERGE-001（PR #541 / Issue #538）

- 種別: design-review 依頼（Review Level **L3**）
- 対象 PR: **#541**（`docs/specs/20260704_class_split_cloud_merge_001_design.md`・base = orphan clean base）
- 親 Issue: **#538**
- 依頼日: 2026-07-04
- 書き戻し先: **Issue #538**（`## 設計レビュー結果` ＋ 凍結マーカー）

> このファイルは「別セッションの独立 Claude Code レビュアー」が repo 内で拾えるように置いた依頼書。設計者素性（`## 設計完了` マーカー `reviewer: claude-code:cowork-session`＝design actor）とは**別素性**で実施すること（G1 自己レビュー禁止）。

## 職務分離（厳守）
- **別セッション・別素性**。設計を書いた素性と異なること（G1）。
- **独立コンテキスト**（G2）: 入力は本依頼書＋Issue #538 / PR #541 本文＋設計 diff＋repo 実ファイルのみ。設計時の会話・結論を前提にしない。
- L3＝独立 Claude Code レビューアで可（Codex 週次枠は温存）。

## 事前に読むもの
- `CLAUDE.md`（拘束9ルール）／`docs/REFERENCE.md` §3（データモデル不変条件）
- `shogi_v4.html`: `buildCloudSyncPayload` / `syncTournamentToCloud` / `pullMembersFromCloud` / `mergeCloudMembersIntoMaster` / `fetchCloudTournaments`（entries 読取）
- `supabase/migrations/`（`entries.class`・`unique(tournament_id, player_id)`・`app_tournament_id` 列）

## 観点（この設計に固有）
1. **既存資産の記述が実コードと一致するか**: `buildCloudSyncPayload` が entries 行に `'class':cls` を載せている／onConflict キー（members・players=`club_id,member_id` / tournament=`club_id,app_tournament_id` / entries=`tournament_id,player_id`）／`entries.class` と `unique(tournament_id, player_id)`／`app_tournament_id` 列の存在／`fetchCloudTournaments`＋entries 読取。
2. **「上書き衝突なし」の主張の妥当性**: 各担当が自分の級の行だけ書けば別行＝衝突なし、が RLS（同 club は書ける）下でも成立するか。§3.3 送信規律の穴（両級持ち端末が全送信）の緩和は十分か。
3. **tournament 行の last-writer-wins**（name/date/status）が2担当運用で実害ないか（§3.1 の同一大会ID・同一 title/date 前提で担保されるか）。
4. **SoT＝案②** が LIVE-BROADCAST-001（#533）と矛盾しないか。配信路と成績発表統合（entries 行レベル自動）の分離が妥当か。
5. **CLAUDE.md 9ルール整合**（特に①動作を変えない＝`classesFilter` は引数追加の範囲か／⑧追加のみ・スキーマ追補なし）。
6. **スコープ確定（級別結合のみ・総合順位なし）** に論理の穴がないか。
7. docs-only につき test は対象外。ただし**実装フェーズのテスト方針（純関数化・WARN=0 維持）**が現実的か。

## 出力（Issue #538 へ書き戻す）
`## 設計レビュー結果` コメントを #538 に投稿し、**Must Fix / Should / Nice** を列挙。末尾に凍結マーカーを**1ブロックだけ**:

```
cowork-status: design-review
verdict: go | conditional-go | block
reviewer: <あなたの素性 ≠ claude-code:cowork-session>
related_pr: #541
```

- 判定基準: P0/P1 相当あり→`block`（design へ差し戻し）／P2/P3 のみ→`conditional-go`／指摘なし→`go`。
- go / conditional-go で Phase 1（#540）実装着手可。
- stage ラベルは触らない（reconciler が唯一の書き手）。Ready化・merge もしない（Draft 停止）。
