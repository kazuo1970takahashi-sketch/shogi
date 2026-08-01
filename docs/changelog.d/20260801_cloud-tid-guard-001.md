## CLOUD-TID-GUARD-001: 送信先の大会日が食い違うときに止める（Issue #800 案#2）

- **問題**: 大会日を 2026-07-12 → 2026-08-01 に変えても `state.tournament_id` が `t_2026_07_12` のまま残り、
  `upsert(onConflict:'club_id,app_tournament_id')` が **7 月の大会レコード**を書き換えた。
  `tournaments.date` が 8/1 に上書きされて 7 月の大会がクラウドから消え、`entries` に 8 月分が追記されて
  順位が重複し、両方に出た 1 名の成績とクラスが上書きされた（2026-08-01 発生・同日復旧）。
  既存の `_dateGate`（SEND-DATE-CONFIRM-002 #622）は**ローカルの日付しか見ない**ため、
  実施日 8/1 が事実として正しい今回の事故では confirm に正しく「はい」を押しても止まらない。
- **修正**: 不可逆な書き込みの直前に 1 回だけ、**送信先のクラウド大会レコードの `date`** を読んで突き合わせる。
  - `cloudTidDateConflict(remoteDate, localDate)` を追加（純関数・DOM もネットワークも触らない）。
    remote 無し（＝新規大会）と local 空/無効（＝#622 の担当領域）は衝突なし。両方あって異なるときだけ衝突。
  - `fetchCloudTournamentDateByAppId()` を追加。照会は既存 `fetchCloudTournamentIdByAppId` と同型
    （`select('id,date').eq('club_id',…).eq('app_tournament_id',…)`）で、新しいクエリの書き方は増やさない。
  - `syncTournamentToCloud` の**先頭**（`members` upsert より前）で precheck。衝突時は 1 バイトも書かずに
    `{ok:false, step:'date-mismatch', remote_date, local_date, app_tournament_id}` を返す（throw しない＝既存契約どおり）。
  - 逃げ道は `opts.allowDateMismatch===true` のみ（既定 `false`＝安全側）。作者が確認ダイアログで明示承諾した
    ときだけ `sendTournamentToCloud` が `true` を付けて再実行する。
  - 照会に失敗したときは **fail-open**（従来どおり送信）。ただし結果に `precheck:'skipped'` を残し、
    成功トーストの末尾へ全角スペース区切りの ⚠ 注記を出す（`.cloud-status` は `pre-wrap` なしのため `\n` は使わない）。
  - 確認は既存 `appConfirm` の 2 択（新規モーダル部品は増やさない・native `confirm()` も増やさない）。
    「何が上書きされるか」を先に書き、そのあとにコードで確認した実在のやり直し導線
    （受付タブ「▷ 2台で分担して入力するとき」→「今日の大会に合流」／☰メニュー →「大会データを全リセット」）を書く。
    `danger:true`＝OK は破壊色・フォーカスはキャンセル側・Enter では確定しない＝**既定は中止**。
- Issue #800 の案#1（`ensureTournamentId` の振り直し）・案#3（`entries` の削除経路）・案#4（upsert キーへの `class`）は
  今回やらない（作者決定 2026-08-01・案#3/#4 は #765 と一緒に設計）。`ensureTournamentId` は無改変、
  `entries` の `delete` は書かない、upsert キーも変えない。
- 既存の 3 つの送信前ガード（#622 日付 / #567 多クラス / CLOUD-SEND-UNLINKED-GUARD-001 未連携）の挙動・選択肢・順序は不変。
  本ガードはそれらより後段の追加であって置換ではない。
- テスト: `test/test_cloud_tid_date_guard_001.js` を新設（PASS=58）。純関数の境界、衝突時に
  `members`/`players`/`tournaments`/`entries`/`tournament_snapshots` の upsert が 1 回も呼ばれないこと、
  `allowDateMismatch:true` で従来どおり通ること、照会 error と読み取り非対応 client の fail-open、
  新規大会で余計な確認が出ないこと、確認ダイアログの 2 択と文言を mock で固定する。
- 既存テスト 2 本は**ソース形状のピンだけ**を追随更新（チェック内容は不変）:
  `test_cloud_history_scoreboard_765.js` U6 は書き込み順の判定を `op==='upsert'` に絞り、
  `test_save_status_bar.js` K4 は `sendTournamentToCloud` の走査窓を 6400→9000・間隔を 900→1400 に拡大した
  （K4 は #622・#760 でも同じ理由で窓を広げてきた箇所）。
- 編集範囲は `shogi_v4.html`・新規テスト 1 本・既存テストのピン 2 箇所・本断片のみ。
  `index.html` / `sw.js` / `?v=` / `production` / `docs/CHANGELOG.md` 本体は無変更。
