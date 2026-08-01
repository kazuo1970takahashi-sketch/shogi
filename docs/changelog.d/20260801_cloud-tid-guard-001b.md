## CLOUD-TID-GUARD-001b: 送信先が「別の大会」なら書き込む前に止める（Issue #800 案#2・PR #801 差し戻し再設計）

- **問題**: 大会日を 2026-07-12 → 2026-08-01 に直しても `state.tournament_id` が `t_2026_07_12` のまま残り、
  `upsert(onConflict:'club_id,app_tournament_id')` が **7 月の大会レコード**を書き換えた。
  `tournaments.date` が 8/1 に上書きされ、`entries` に 8 月分が追記されて順位が重複し、両方に出た 1 名の
  成績が上書きされた（2026-08-01 発生・同日復旧）。既存の `_dateGate`（SEND-DATE-CONFIRM-002 #622）は
  **ローカルの日付しか見ない**ため、実施日 8/1 が事実として正しい今回の事故では止まらない。
- **初版（PR #801）を差し戻した理由**: 「クラウドの `date` と今回の実施日が違えば止める」は事故を止めたが、
  **実施日を訂正して再送信する**（同じ大会・同じ顔ぶれ）という最も頻度の高い正常操作で誤発火した。
  しかも #622 自身が毎回「違う場合は報告書の日付欄を修正してください」と案内している＝アプリが誘導した操作を
  アプリが警告していた。文言（「参加者が混ざります」「大会は一覧から消えます」）も起きないことを断定しており、
  案内していた復帰導線（「今日の大会に合流」）は当該状況で何もせず無限ループになった。
- **修正の核**: 判定材料を**日付から顔ぶれへ**変える。日付の食い違いは「顔ぶれを照会するかどうか」の入口条件にだけ使う。
  - 送信先の `entries` を読み、**今回の送信クラスに属し、かつ今回の payload に居ない人**を数える。
    0 名なら同じ大会の訂正＝**鳴らさない**（日付が違っても通す）。1 名以上なら止めて人数と氏名を出す。
  - クラスで絞るのは2台分担運用のため（A級端末の送信で相手のB級を数えない）。
  - 追加した純関数: `cloudTidSendClasses` / `cloudTidSendMemberIds` / `cloudTidRosterMissing` / `cloudTidNamesExample`
    （`cloudTidDateConflict` は入口条件として存続）。照会: `fetchCloudTournamentDateByAppId`（`id,date`）と
    `fetchCloudTournamentRoster`（`entries`→`players`→`members` の3照会・**読み取りのみ／`delete` はしない**）。
  - 判定に `state.cloud_sent_tid` は使わない（#800 でも `cloud_sent_tid === tournament_id` になるため判別できない）。
- **fail-open と可視化**: 照会できない／期限超過は `precheck:'skipped'` で従来どおり送信し、⚠ 注記を出す。
  `res.ok` が **false のときも** 注記を出す（「クラウドの大会記録が既に書き換わっている可能性があります」）
  ＝「失敗＝無傷」と読んで再送信されるのを防ぐ。暦上あり得ない実施日は `precheck:'skipped-invalid-date'`
  （偽の「照合済み・衝突なし」を結果に残さない）。
- **明示デッドライン**: 事前照会全体に 6 秒（`CLOUD_TID_PRECHECK_TIMEOUT_MS`）。会場回線の**半切断**で Promise が
  解決も棄却もせず「クラウドへ送信中…」で固まる経路（本ガードが足した必須の往復で新設された）を塞ぐ。
  期限超過も `precheck:'skipped'` として従来どおりの送信へ進む。
- **順序**: date/顔ぶれの判定を**未連携ガードより前**に出した。未連携ガードの選択肢①「名簿に反映して送信」は
  ローカル支部マスタを**古い `tournament_id`** で書き換えるため、後段に置くと「1 バイトも書かずに止めました」と
  言った時点で既にローカル名簿が汚れている（元に戻らない）。既存3ガードの**挙動・選択肢・文言は不変**（順序のみ変更）。
- **文言と導線**: 観測した事実（送信先の記録数・今回に含まれない人数と氏名の例・日付の変化）だけを書く。
  復帰導線は参加者登録タブの「▷ 2台で分担して入力するとき」→「運営共通キーを発行」
  （`t_<実施日>_<4桁>` を新規採番・参加者/結果は無改変）。大会IDに既に4桁キーが付いていると発行は no-op に
  なるため、その場合は「このキーに合わせる」に別の4桁を入れる案内も併記する。
- **`showAppModal` の Enter 抑止（共通部品）**: danger confirm の Enter は `preventDefault()` を呼ばずに
  return していたため、Tab で OK 側へフォーカスを移して Enter を押すと**フォーカス中ボタンのブラウザ既定動作**で
  click が発火し破壊操作が確定した。既定動作ごと抑止する（Esc とクリックは従来どおり）。
  影響する既存 danger confirm は 9 箇所（削除系・差し替え系・再生成系・リセット系）で、いずれも
  「Enter で確定してしまう」経路が塞がる方向の変化のみ。
- **送信ボタンの無効化**: 送信中は `cloudSendBtn` を `disabled` にする（事前照会の往復で「モーダルが出ていない
  時間帯」が延びるため）。`showAppModal` の孤児化そのものは既存の欠陥として本 PR では触らない（別 Issue）。
- Issue #800 の案#1（`ensureTournamentId` の振り直し）・案#3（`entries` の削除経路）・案#4（upsert キーへの `class`）は
  今回もやらない。`ensureTournamentId` は無改変、`entries` の `delete` は書かない、upsert キーも変えない。
- テスト: `test/test_cloud_tid_guard_001b.js`（PASS=100・旧 `test_cloud_tid_date_guard_001.js` を改称）。
  ジャーニーB が鳴らないこと／ジャーニーA で upsert が 1 件も出ないこと／クラス絞り／fail-open（成功・失敗の両方で注記）／
  デッドライン／danger confirm の Enter 抑止／**案内した導線を実行して `tournament_id` が変わること**／
  ダイアログ中の UI 名がコードに実在することを固定する。
- 既存テストの追随（理由はテスト内コメントに1本ずつ記載）: `test_cloud_send_unlinked_guard_001.js`（ガードの
  実行位置が変わったため mock client を注入してガードまで到達させ、到達の証拠を `step:'config'` → `ok:true` に置換）、
  `test_master_sync_clarity_001.js` D9（`syncBranchMasterOnSave` の後続呼び先の名称変更に追随・見る性質は不変）。
  `test_save_status_bar.js` K4 と `test_cloud_history_scoreboard_765.js` U6 は初版の追随のまま（再変更なし）。
- 本 PR の範囲外として切った Issue: #809（実施日が前回大会のまま残る＝#800 の元凶）／
  #810（`showAppModal` の孤児化）／#811（暦上存在しない実施日）／#812（読み取りと書き込みの原子性・#765 と同領域）。
- 編集範囲は `shogi_v4.html`・テスト・本断片のみ。`index.html` / `sw.js` / `?v=` / `production` /
  `docs/CHANGELOG.md` 本体は無変更。
