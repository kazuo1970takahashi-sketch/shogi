## CLOUD-MEMBER-ATTR-MERGE-001: ☁送信が会員の区分・市町村を既定値で上書きしないようにする

Issue #853（優先順位v2 の3位）。作者裁定「案E」(2026-08-17)。

### 何が問題だったか

ローカル名簿は「未設定」と「既定値」を区別できない（normalize が `member`/`ippan` に確定する）。
そのため☁送信のたびに既定値がクラウドの実値（女性・中学生・非支部員・市町村）を上書きし、
翌大会の参加費が誤徴収になっていた（実測: 女性 0円 → 500円）。

### 何を変えたか

- `composeCloudMemberFieldCols(local, cloudRow)` 新設（純関数）: 送信行の属性3列を**フィールド単位で合成**。
  非既定値（other / chu・josei / 市町村あり）はローカル優先、既定値の欄はクラウド値を採用
- `_fetchCloudMemberAttrs(client, clubId, memberIds)` 新設: 送信直前に members を**読み取り専用**で取得。
  参加者の member_id を **100件チャンクの `in()`** で明示指定する（全件 select は API の1レスポンス上限で
  prefix しか返らないのに成功扱いになり、欠けた会員が既定値で上書きされる）。
  （`pullMembersFromCloud` は `saveBranchMaster` を伴いローカルの訂正を巻き戻すため使わない）
- 属性取得の**待ち明けに確認内容を再照合**（#857 の確認レースを再オープンしないため）
- **失敗メッセージにも**属性未読の ⚠ 注記（members だけ書けて後段で失敗した経路を隠さない）
- `buildCloudSyncPayload` に `opts.cloudMembersById`。**渡されないときは従来どおり**（既存呼び出しは挙動不変）
- `syncTournamentToCloud` が opts を転送（★明示列挙。忘れると無音 no-op で全テスト緑のまま通る）
- 取得の**失敗と0件を区別**し、失敗時は送信結果に ⚠ 注記（無音で元のバグ挙動に戻らない）
- `pushMemberEditToCloud` 失敗時の文言3箇所から「☁送信時にも同期されます」を削除し、
  確実に届く経路（名簿タブの一括送信＝常にローカル優先）を案内（案E では既定値方向の訂正を拾えないため）

### 既知の限界（作者了承・別 issue 候補）

- 「josei→ippan」「other→member」「市町村を空に」という**既定値方向の訂正**は☁送信では届かない（一括送信で反映）
- entries 側の当時値スナップショットは本便では直らない（クラウド大会結果の属性表示は既定値のまま）

### 検証

`run_tests.sh` **254/0/0**（新テスト `test_cloud_member_attr_853.js` 41件）／`run_e2e.sh` **14/14**（249秒）
