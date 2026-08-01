## CLOUD-TID-GUARD-001: 送信先の大会と食い違う送信を止める（Issue #800 案#2）

- **問題**: 大会日を 2026-07-12 → 2026-08-01 に変えても `state.tournament_id` が `t_2026_07_12` のまま残り、
  `upsert(onConflict:'club_id,app_tournament_id')` が **7 月の大会レコード**を書き換えた。
  `tournaments.date` が 8/1 に上書きされて 7 月の大会がクラウドから消え、`entries` に 8 月分が追記されて
  順位が重複し、両方に出た 1 名の成績とクラスが上書きされた（2026-08-01 発生・同日復旧）。
  既存の `_dateGate`（SEND-DATE-CONFIRM-002 #622）は**ローカルの日付しか見ない**ため、
  実施日 8/1 が事実として正しい今回の事故では confirm に正しく「はい」を押しても止まらない。
- **判定の根拠は日付ではなく参加者の顔ぶれ**（L4 反証パネル ①）。日付の相違は「別の大会かもしれない」の
  弱い証拠でしかなく、それだけで止めると「1 回送信 → #622 の案内どおり実施日を訂正 → 再送信」という
  最頻の正常操作で毎回鳴る。作者が「それでも上書きする」を反射で押すようになれば、ガードは機能として死ぬ
  （#622 の確認まで一緒に形骸化する）。
  - `cloudTidDateConflict(remoteDate, localDate)`（純関数）は**日付が動くかどうかの一次判定**に降格。
  - `cloudTidSendConflict(remote, local)`（純関数）が最終判定。日付が動き、**かつ**送信先に
    「今回の参加者に含まれていない記録」が残っているときだけ衝突とする。
    比較範囲は**今回送信する級だけ**（A 級/B 級を別端末で入力する分担運用で、相手の級を毎回誤検知しないため）。
  - `cloudTidLocalScope(payload)`（純関数）が送信対象の級と `member_id` を payload から取る
    ＝ `opts.classesFilter`（#567）に自動追随する。
  - `fetchCloudTidRemoteInfo()` が照会。**日付が動かない通常の再送信では顔ぶれを引かない**（読み取り 1 回のまま）。
    大会の照会は既存 `fetchCloudTournamentIdByAppId` と同型、顔ぶれは既存 `fetchCloudEntriesForTournament`
    をそのまま使う＝新しいクエリの書き方は増やさない。
- **止める場所**: 不可逆な書き込みの直前。`syncTournamentToCloud` は衝突時に 1 バイトも書かずに
  `{ok:false, step:'date-mismatch', remote_date, local_date, remote_count, missing_count, missing_names,
  app_tournament_id}` を返す（throw しない＝既存契約どおり）。
  さらに `sendTournamentToCloud` では**未連携ガードより前**に照合を済ませる。未連携ガードの選択肢①
  「名簿に反映して送信」は `syncBranchMasterOnSave` ＝ローカル支部マスタへの書き込みで、古い `tournament_id` が
  参加者の `tournament_ids` に永久に混入する。クラウドへ 1 バイトも書かずに止めてもこれは元に戻らない。
  接続一式（`loadCloudDeps`→`client`→`auth`→`rpc`）は `_connectForSend` に括り出して 1 送信あたり 1 回だけ実行する
  （`claim_organizer_seat` を 2 回呼ばない）。判定の順序（offline を cfg より先に見る）は不変。
- 逃げ道は `opts.allowDateMismatch===true` のみ（既定 `false`＝安全側）。作者が確認ダイアログで明示承諾した
  ときだけ `sendTournamentToCloud` が `true` を付ける。
- **fail-open**（照会できないときは従来どおり送信）。ただし黙って素通りさせず、`precheck:'skipped'` を結果に残して
  **成功トーストにも失敗トーストにも** ⚠ 注記を出す。失敗経路の注記が無いと
  「照会失敗 → fail-open → `tournaments` まで書けて `entries` で失敗」が赤い「送信に失敗しました」だけで済み、
  送信先の大会日が既に書き換わっていることに誰も気づけない（#800 が無警告で再発する）。
  暦不正な実施日（`2026-02-30` 等）は照合が成立しないので `precheck:'skipped-invalid-date'`
  ＝偽の「照合済み」を残さない（暦検証そのものは #622 の担当領域＝別 Issue）。
  照会には **8 秒のタイムアウト**を設けた。会場回線が半切断で `select` が保留し続けると、fail-open の失敗
  コールバックへ到達せず「クラウドへ送信中…」で固まる（本 PR が新設した必須の往復＝従来は無かった止まり方）。
- **確認ダイアログ**は既存 `appConfirm` の 2 択（新規モーダル部品は増やさない・native `confirm()` も増やさない）。
  - 断定を書かない。旧文言の「参加者が混ざります」「大会は一覧から消えます」は**起きないことがある**。
    観測した事実（送信先に残っている件数・そのうち今回いない人数と氏名 3 名まで・記録日が変わること）だけを書く。
  - 復帰導線は「今日の大会に合流」（`joinOpsKeylessTournament`）を**案内しない**。#800 の事故後は
    `state.tournament_id` が既に `t_<実施日>` なので「すでに合流済みです」と成功文言を返して**何も変えない**
    （同じ警告に戻る無限ループ）。そもそも「合流」は既存の大会へ**まとめる**操作で目的と逆向きであり、
    その日に別のキーなし大会があると、日付が一致するぶんガードが鳴らないまま統合される。
    代わりに新しい大会IDを採番する導線を、いまの `state` に応じて出し分ける（`_tidMismatchRecoverySteps`）:
    キーなしIDなら「運営共通キーを発行」（`issueOpsSharedKey`）、キー付きIDなら
    「このキーに合わせる」に同じ 4 桁を入れ直す（`applyOpsSharedKey`＝実施日が変わっているので新しいIDになる）。
  - タブ名は「参加者登録」（「受付タブ」というタブは存在しない）。追加の confirm（`opsRekeyNeedsConfirm`）が
    挟まることを先に予告する。名簿の参加回数には触れない（合流/採番では新旧 2 つの大会IDが積まれるため
    「そのまま残ります」は事実と違う）。
  - `danger:true`＝OK は破壊色・フォーカスはキャンセル側＝**既定は中止**。`showAppModal` の Enter 分岐は
    `return` するだけだと**フォーカス中ボタンのブラウザ既定動作（Enter→click）が残る**ため、
    Tab で「それでも上書きする」へ移してから Enter で上書きを確定できた。既定動作ごと抑止する。
- **送信中は `cloudSendBtn` を無効化**。本 PR は #622 の確認のあとにネットワーク往復（auth→rpc→照合）を挟んでから
  もう 1 枚モーダルを開くため、モーダルが 1 枚も出ていない時間が延びた。そこを再タップすると送信が 2 本走り、
  `showAppModal` が先行モーダルをコールバック未解決のまま `removeChild` するので、**成功した送信が孤児モーダルの
  Esc で「中止しました」表示に化ける**。モーダルの孤児化そのものは `showAppModal` 側の既存欠陥＝本 PR では触らず、
  入口を 1 本に絞る（別 Issue）。
- `#cloudSendStatus` のインライン `color:#1F3864` を外した。`applyCloudStatus` が付ける `.cloud-status-warn`(橙)/
  `-err`(赤) よりインライン指定が強く、⚠ 注記が出ても紺のままで通常成功と見分けが付かなかった
  （他の `.cloud-status` 要素はいずれもインライン color を持たない＝これだけが例外だった）。
  通常時の紺は `.cloud-status-pending` / `-info` が受け持つので見た目は変わらない。
- Issue #800 の案#1（`ensureTournamentId` の振り直し）・案#3（`entries` の削除経路）・案#4（upsert キーへの `class`）は
  今回やらない（作者決定 2026-08-01・案#3/#4 は #765 と一緒に設計）。`ensureTournamentId` は無改変、
  `entries` の `delete` は書かない、upsert キーも変えない。`joinOpsKeylessTournament` も無改変（導線として案内しないだけ）。
- 既存の 3 つの送信前ガード（#622 日付 / #567 多クラス / CLOUD-SEND-UNLINKED-GUARD-001 未連携）の
  分岐・選択肢・文言は不変。本ガードは追加であって置換ではない（順序だけ、未連携ガードの前に入る）。
- テスト: `test/test_cloud_tid_date_guard_001.js`（PASS=125）。純関数の境界、衝突時に
  `members`/`players`/`tournaments`/`entries`/`tournament_snapshots` の upsert が 1 回も呼ばれないこと、
  **同一大会の日付訂正では鳴らないこと**、**別の顔ぶれでは鳴ること**、`allowDateMismatch:true` で従来どおり通ること、
  照会 error / 顔ぶれ読み取り失敗 / 読み取り非対応 client の fail-open と**失敗経路の ⚠ 注記**、
  暦不正日の `skipped-invalid-date`、**案内した導線を実際に実行して `tournament_id` が変わること**、
  **ダイアログが名指しする UI 文言が HTML に完全一致で実在すること**、未連携ガードより前に止まることを mock で固定する。
- 既存テスト 3 本は**ソース形状のピンだけ**を追随更新（チェック内容は不変・むしろ強化）:
  `test_cloud_history_scoreboard_765.js` U6 は書き込み順の判定を `op==='upsert'` に絞り、
  `test_save_status_bar.js` K4 は `sendTournamentToCloud` の走査窓を 6400→10000・間隔を 900→1400 に拡大し、
  `test_arch_p2.js` A9-5 は `_connectForSend` 内の**判定順序そのもの**（offline を cfg より先に見る）をピンし直した。
  K4 は #622・#760 でも同じ理由で窓を広げてきた箇所＝ソース長という付随的なピンなので、
  Phase 1 スライス 2（テスト読込方式の共通化）で振る舞いテストへ置き換える。
- 編集範囲は `shogi_v4.html`・テスト 1 本（新規）・既存テストのピン 3 箇所・本断片のみ。
  `index.html` / `sw.js` / `?v=` / `production` / `docs/CHANGELOG.md` 本体は無変更。
