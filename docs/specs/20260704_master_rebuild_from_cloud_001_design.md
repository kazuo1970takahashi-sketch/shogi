# MASTER-REBUILD-FROM-CLOUD-001 設計 — 端末クリーン運用＝クラウドから名簿を完全再構築

- 日付: 2026-07-04 ／ req: #551 ／ 前提: MERGE-UNDELETE-001（#552 merge済み）
- 目的: 「マスタをリセット→☁取得」で現状戻らない **前回クラス・最終参加・参加履歴（tournament_ids）** を、クラウドの tournaments/entries/players から再導出して復元する。共有端末・端末に個人情報を残さない運用（全国展開要件）を成立させる。

## 1. 設計原則

- **導出値はクラウドに列として持たない**（?v=66 決定の維持）。entries からの再計算で復元する。
- ローカルファースト不変: 完全再構築は任意ボタン・失敗は通知のみ・当日運営は継続可。
- 既存の軽い「☁ クラウドから取得」は現行のまま（members のみ）。再構築は別ボタンで重い読み取りを明示化。

## 2. データフロー

1. members: 既存 `pullMembersFromCloud`（select('*')・MERGE-UNDELETE 込）をそのまま実行。
2. tournaments: `select('id,app_tournament_id,date,season').eq('club_id',clubId)`（数十行）。
3. players: `select('id,member_id').eq('club_id',clubId)`（1会員=1行・player_id↔member_id の辞書）。
4. entries: `select('tournament_id,player_id,class').in('tournament_id',ids)`（大会数×参加者≒数百行・ids は 100 件チャンク分割）。
5. 導出（純関数 `buildDerivedMemberStatsFromCloud(tournaments,players,entries)`）: 会員ごとに
   - `tournament_ids` = 参加大会の `app_tournament_id` 配列（date 昇順）
   - `last_attended` = 最新参加大会の date ／ `first_attended` = 最古
   - `last_class` = 最新参加大会の entries.class（'A'/'B' 以外は無視せずそのまま保持＝将来の C 級互換）
6. マージ（純関数 `mergeDerivedStatsIntoMaster(master,stats)`）: §3 のポリシー。

## 3. マージポリシー（端末実績との衝突）

- `last_attended`/`last_class`: **クラウド導出の date がローカル `last_attended` より新しいか、ローカルが空の場合のみ上書き**（☁未送信の直近大会実績を巻き戻さない）。
- `tournament_ids`: **和集合**（重複除去・date 順は問わない＝現行も順序非依存）。
- `first_attended`: ローカルが空 or クラウド導出がより古い場合のみ採用。
- 氏名/ふりがな/区分/市町村/削除状態: 本機能では触らない（手順 1 の既存 merge の責務）。

## 4. UI（「⚙ 名簿のメンテナンス」内）

- ボタン「☁ クラウドから完全再構築（参加履歴も再計算）」。confirm＝「名簿の参加履歴・前回クラス・最終参加をクラウドの全大会結果から再計算して反映します（氏名・区分は☁取得と同じ扱い）」。
- 進行/結果は masterCloudPullStatus に表示（「再構築しました（会員 N 名・履歴反映 M 名・大会 T 件）」）。結果が見える位置（[[ui-result-visibility-principle]]）。
- ログイン必須（既存 pullMembersToMasterUI と同じ auth/claim 経路）。

## 5. 読み取り量・RLS・プライバシー

- 規模感: 大会≒数十・entries≒数百行（沼津実績：月例×数年）。スマホ回線でも数秒。in() は 100 ids チャンク。
- RLS: tournaments/players/entries の read は active organizer 限定（Stage A 既設）＝新規ポリシー不要。
- PII: 新たに取得するのは参加事実（どの大会に出たか）のみ。既存の大会結果閲覧（HISTORY-CLOUD）と同内容。

## 6. Phase 分割（実装は別 Draft PR）

- **Phase 1**: 純関数 2 本（buildDerivedMemberStatsFromCloud / mergeDerivedStatsIntoMaster）＋単体テスト（架空 fixture・非 A/B クラス・date 欠損・同日複数大会・ローカル新しい側の非巻き戻し）。
- **Phase 2**: fetch オーケストレーション `rebuildMasterFromCloud(client,{clubId})`（mock 可・throw しない・{ok,counts} 型＝既存 pull と同型）。
- **Phase 3**: UI ボタン＋bind＋status＋confirm。
- テスト: 各 Phase で run_tests 登録・WARN=0。

## 7. スコープ外

- ローカル大会履歴（shogi_archive）のクラウド復元（別途 HISTORY-CLOUD 閲覧で代替可・将来候補）。
- 当日 state（shogi_v4）の復元（バックアップの責務）。
- リセット自体の自動化（既存「📛 マスタをリセット」を使う）。

## 8. Review Level（提案）

L3+（クラウド読み取り拡張・導出の正しさ）。確定は cowork。

---
🤖 PMO-OPS v2.1-final ／ 実装ライン=Claude Code ／ req #551
