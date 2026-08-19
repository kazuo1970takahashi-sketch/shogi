## MEMBER-UPSERT-RPC-001 便2: 名簿編集・削除/復元 push を RPC 化する（送信前の読み取りを廃止）

Issue #909 の3便目（最後）。便1（単数形 RPC）と一括版はどちらも dev マージ済で、
**作者が本番 Supabase へ適用済み**（確認クエリ 6/7 true と 7/7 true）。本便で
アプリが実際に RPC を使い始める。配信ファイル（`shogi_v4.html`）を変更するのはこの便だけ。

### 何が変わったか

| 経路 | 旧（#901） | 新（#909 便2） |
|---|---|---|
| 名簿編集 push `pushMemberEditToCloud` | members を select → 未操作の欄はクラウド値を採用して upsert（**2往復**） | `app_upsert_member_edit` を **1回**呼ぶ（`p_set_*`＝操作した欄） |
| 削除/復元 push `pushMemberDeleteStateToCloud` | members を select → 合成して N 行を upsert（**2往復**） | `app_upsert_member_edits_bulk` を **1回**呼ぶ（`set_*` は渡さない＝既存行の属性は不変） |

「操作した欄だけローカル優先／押し直しも届く／保全した欄は ⚠ で名指し」という #901 の命題は
**そのまま生きている**。変わったのは判定を**どこで**やるか。列の保全規則は
`insert ... on conflict do update set` の set 句に列を挙げるか否か＝**SQL 側1箇所**になり、
クライアントは `touched` をそのまま `p_set_*` として渡すだけになった。

- **穴①が消えた**（読めなかった会員の初回 push が属性 NULL の行を作る）。
  新規行は `excluded`＝端末のローカル値で**完全な行**が入る。実 PG で確認済み。
- **穴②が消えた**（select→upsert の窓で他端末の更新を巻き戻す）。1文・1トランザクションで
  読み取り自体が無いので、競合窓もタイムアウトも**原理的に生じない**。
- 削除/復元は **N 名でも 1 リクエスト・1 トランザクション**。旧実装も 1 回の upsert だったが、
  その前に select が 1 往復あった。合わせて往復は 2 → 1 に減る。
- ⚠ の名指しが**推測から実測へ**。RPC は `returning` で「実際にクラウドへ残った値」を返すので、
  端末の表示と違う欄を実値で名指しできる（新設の純関数 `_editAttrKeptLabels`）。

### 消したもの / 残したもの

**消した**（呼び出し元が無くなった）:
`composeEditPushFieldCols`（規則は SQL 側へ移った）／`_withReadTimeout`／
`EDIT_ATTR_READ_TIMEOUT_MS`／`EDIT_ATTR_UNREAD_NOTE`／`DELETE_ATTR_UNREAD_NOTE`。

★ **便1 の断片に「`_fetchCloudMemberAttrs` も便2で削除」と書いたのは誤りだった。**
grep で実測したところ、この関数と `CLOUD_ATTR_UNREAD_NOTE` は
**☁送信経路（#853・`sendTournamentToCloud`）でも使われている**。消すと #853 が壊れる＝**残す**。
`composeCloudMemberFieldCols` / `_cloudMemberFieldCols` も☁送信・一括送信が使うので残す。

### 意図的に変えた挙動（作者確認事項）

**クラウドの属性列が NULL の既存行は、その欄を操作しない限り NULL のまま残る。**
旧実装は読み取りが成功すると未操作の欄にも端末の既定値（支部員／一般）を書き込んでいたため、
NULL が既定値で埋まっていた。これは「未設定」を「明示的に既定値だと主張した」に変える書き込みで、
その後の下り merge で**別端末の実値（その他／女性）を上書きしうる**＝#853 の誤徴収と同じ形。
新実装は書かない。NULL は下り merge の非空ガードで読み飛ばされるので、ローカルは壊れない。
NULL を実値で埋める正規の出口は名簿タブの「☁ 名簿全体をクラウドへ一括送信」（常にローカル優先）。
この理由で、残った値が NULL の欄は ⚠ で名指ししない（毎回鳴らすと本物の食い違いが埋もれる）。

### テスト

- `test/test_member_edit_touched_cols_901.js` **75 checks**（旧 72）。C 節は
  `composeEditPushFieldCols` の真理値表から `_editAttrKeptLabels` の真理値表へ差し替え。
  P/D 節の mock は **RPC の契約そのものを実装**する（set_* が false の列は既存値を残す）＝
  「RPC を呼んだ」ではなく「クラウドの実値が潰れないか」を測り続ける。
- `test/test_master_sheet.js` **85 checks**。`rpc` を**名前で分岐する mock** に変更。
  名前を見ずに常に club 行を返す mock だと会員 upsert の戻りまで club 行になり、
  ⚠ が出ない縮退パスで緑になる。
- `test/e2e/member_edit_touched_cols_901.e2e.js` **15 checks**（実ブラウザ）。
  実 DOM で氏名セル→編集パネル→セグメント押下→保存まで通し、RPC 引数と
  「クラウド側に残った行」を捕まえる。
- 全量 `bash test/run_tests.sh shogi_v4.html` = **PASS=261 / FAIL=0 / WARN=0**（baseline 維持）、
  `bash test/run_e2e.sh` = **14/14 スイート PASS**。
- SQL 側は無改変。回帰確認として実 PG 16.13 で `member_upsert_rpc_pgtest.sh` **35/0**、
  `member_upsert_bulk_pgtest.sh` **36/0** を再実行。
- ★ **mock が実 RPC と同じ答えを返すことを実 PG で突き合わせた**（モックの自己申告で終わらせない）。
  クライアントが実際に送る引数をそのまま実 PG へ流した結果:
  - 編集 push（ふりがなだけ変更・`set_*` 全 false）→ `{"inserted":false,"member_kind":"other","grade":"josei","city":"沼津市"}`
  - 削除 push（bulk・`set_*` 無し・`touch_deleted_at":true`）→ `{"count":1,"inserted":0}` かつ行は
    `other/josei/沼津市` のまま `deleted_at` だけ入る

  どちらもテストの mock の戻りと一致した。
