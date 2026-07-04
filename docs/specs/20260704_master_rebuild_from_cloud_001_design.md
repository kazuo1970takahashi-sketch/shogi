# MASTER-REBUILD-FROM-CLOUD-001 設計 — 端末クリーン運用＝クラウドから名簿を完全再構築（v2）

- 日付: 2026-07-04（v2＝design-review conditional-go の Must2/Should3/Nice2 を反映） ／ req: #551 ／ 前提: MERGE-UNDELETE-001（#552 merge済）
- 目的: 「マスタをリセット→☁取得」で戻らない **前回クラス・最終参加・参加履歴（tournament_ids）** を tournaments/players/entries から再導出して復元。端末に個人情報を残さない運用を成立させる。

## 1. 設計原則

- 導出値はクラウドに列として持たない（?v=66 決定の維持）。entries からの再計算で復元。
- ローカルファースト不変: 任意ボタン・失敗は通知のみ・当日運営継続可。既存の軽い「☁取得」は現行のまま。
- **ID 空間の一致（design-review 確認済）**: ローカル tournament_ids（`t_YYYY_MM_DD[_n]`）＝クラウド app_tournament_id（push 時に state.tournament_id をそのまま格納）＝和集合は安全。

## 2. データフロー

1. members: 既存 `pullMembersFromCloud` を実行し、**その戻り値 res.master（in-memory）に対して reload を挟まず連続で導出マージを適用する（Must-1 対応＝normalize の today フォールバックが挟まらない）**。保存は導出マージ後に1回。
2. tournaments: `select('id,app_tournament_id,date,season').eq('club_id',clubId)`。
3. players: `select('id,member_id').eq('club_id',clubId)`。
4. entries: `select('tournament_id,player_id,class').eq('club_id',clubId).in('tournament_id',ids)`（Nice-2：既存 fetch 系と同じく club_id を防御的に明示・ids は 100 件チャンク）。
5. 導出（純関数 `buildDerivedMemberStatsFromCloud(tournaments,players,entries)`）: 会員ごとに
   - 参加大会集合＝entries の (tournament_id→players.member_id) 結合。
   - **最新判定の決定的 tie-break（Should-2）**: date 昇順 → app_tournament_id 昇順（null は先頭）で並べた最後を「最新」とする（同日複数大会でも結果が安定）。
   - `last_attended` = 最新大会の date ／ `first_attended` = 最古の date（date null の大会は日付導出から除外）。
   - `last_class` = 最新大会の entries.class。**非 A/B は null（Must-2＝normalizeBranchMaster の強制・#273 不変条件「最新出席が非 A/B なら null」と同義）**。
   - `tournament_ids` = 参加大会の app_tournament_id 配列。**app_tournament_id が NULL の大会（manual/json_import 由来）は skip（Should-1）。ただし date/last_class の導出には算入する（attendance_count はその分過少になり得る旨を仕様として明記）**。
6. マージ（純関数 `mergeDerivedStatsIntoMaster(master,stats)`）: §3。

## 3. マージポリシー（端末実績との衝突・Must-1 反映）

- **「ローカルが空」の判定は last_attended ではなく `tournament_ids` が空かで行う**（normalize が last/first_attended に todayYmd() を埋めるため日付比較では常に不成立になる）。
  - `tournament_ids` 空（＝端末実績なし・リセット直後・☁取得のみの会員）→ 導出値で last_class / last_attended / first_attended / tournament_ids を全上書き。
  - `tournament_ids` 非空（端末実績あり）→ クラウド導出の最新 date がローカル last_attended より**新しい場合のみ** last_class/last_attended を上書き（☁未送信の直近実績を巻き戻さない）。first_attended はより古ければ採用。
  - `tournament_ids` は常に**和集合**（重複除去）。
- **attendance_count は union 後に tournament_ids.length で同一関数内で再計算（Should-3＝normalize 任せにしない）**。
- 氏名/ふりがな/区分/市町村/削除状態: 本機能では触らない（手順1の既存 merge の責務）。

## 4. UI（「⚙ 名簿のメンテナンス」内）

- ボタン「☁ クラウドから完全再構築（参加履歴も再計算）」。confirm で対象と影響を明示。
- 進行/結果は masterCloudPullStatus（「再構築しました（会員 N 名・履歴反映 M 名・大会 T 件）」）。[[ui-result-visibility-principle]]。
- ログイン必須（既存 pullMembersToMasterUI と同じ auth/claim 経路）。

## 5. 読み取り量・RLS・プライバシー

- 規模感: 大会≒数十・entries≒数百行。in() は 100 ids チャンク。
- RLS（Nice-1 修正）: tournaments/players/entries の select は **app_is_active_member（viewer 含む）**（organizer 限定は members のみ）＝新規ポリシー不要の結論は不変。
- PII: 新規取得は参加事実のみ（HISTORY-CLOUD 閲覧と同内容）。

## 6. Phase 分割（実装は別 Draft PR）

- **Phase 1**: 純関数 2 本＋単体テスト（架空 fixture・非 A/B クラス→null・date 欠損・同日複数（tie-break 固定）・app_tournament_id NULL skip・tournament_ids 空/非空のマージ分岐・非巻き戻し・attendance_count 再計算）。
- **Phase 2**: `rebuildMasterFromCloud(client,{clubId})`（mock 可・throw しない・{ok,counts} 型・pull→導出→保存を in-memory で連続）。
- **Phase 3**: UI ボタン＋bind＋status＋confirm。
- 各 Phase で run_tests 登録・WARN=0。

## 7. スコープ外

ローカル大会履歴（shogi_archive）のクラウド復元／当日 state の復元／リセット自体の自動化。

## 8. Review Level（提案）

L3+（クラウド読み取り拡張・導出の正しさ）。確定は cowork。

## 9. design-review 反映履歴（v2）

- Must-1: 「ローカル空」判定を tournament_ids 空に変更＋pull 戻り値の in-memory master へ連続適用（§2-1/§3）。
- Must-2: last_class 非 A/B → null（#273 不変条件と同義・§2-5）。
- Should-1/2/3: NULL skip と算入規定／tie-break 固定／attendance_count 再計算（§2-5/§3）。
- Nice-1/2: RLS 記述修正（§5）／entries に club_id 明示（§2-4）。

---
🤖 PMO-OPS v2.1-final ／ 実装ライン=Claude Code ／ req #551 ／ design-review: conditional-go→v2 反映済み
