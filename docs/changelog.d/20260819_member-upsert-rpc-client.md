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

### `p_set_*` の決め方（Codex 1巡目 P1 r3810188007 で作り直した）

`p_set_*` は **「この端末がその欄について情報を持っているか」**で決める（新設の純関数 `_editPushSetFlags`）:

| 状態 | `p_set_*` | 理由 |
|---|---|---|
| その保存で操作した | **true** | 既定値方向の訂正（女性→一般・その他→支部員）もここで届く＝#901 の本題 |
| 操作していないがローカルが非既定値 | **true** | #853 案E＝「非既定値だけが人が明示的に入れた情報だと確実に言える」 |
| 操作しておらずローカルも既定値 | **false** | 既定値は「未設定」と区別できない＝情報を持っていない |

★ **最初の版は「操作した欄だけ true」にしていた。これは退行だった**（Codex P1 で指摘）。
クラウドの旧行（属性列を持つ前に作られた行）が `grade=NULL` で端末に明示的な `josei` がある会員の
氏名だけを直すと、その列を送らない＝**NULL のまま成功表示だけが出る**。別の端末がその行を取ると
`mergeCloudMembersIntoMaster` は NULL を読み飛ばし、`normalizeBranchMaster` が `ippan` へ確定する
＝**会費の誤徴収が別経路で復活する**。#901 の `composeCloudMemberFieldCols` はここをローカル値で
埋めていたので、落とせば退行になる。**警告を足すのではなく、書く側を直した。**

逆側（既定値で NULL を埋める）は今も禁じている。既定値を書くと「未設定」が「既定値だと主張した」に
変わり、その後の下り merge で別端末の実値（`other`／`josei`）を上書きしうる＝#853 の本題そのもの。

したがって残る挙動差は「**端末も既定値・未操作の欄は、クラウドが NULL なら NULL のまま**」だけ。
この場合どの端末も同じ既定値を表示するので食い違いは生じない（C8/P50/P51 で固定）。

### テスト

- `test/test_member_edit_touched_cols_901.js` **94 checks**（旧 72）。C 節は
  `composeEditPushFieldCols` の真理値表から `_editAttrKeptLabels` の真理値表へ差し替え。
  P/D 節の mock は **RPC の契約そのものを実装**する（set_* が false の列は既存値を残す）＝
  「RPC を呼んだ」ではなく「クラウドの実値が潰れないか」を測り続ける。
- `test/test_master_sheet.js` **87 checks**。`rpc` を**名前で分岐する mock** に変更。
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
  - 削除 push（bulk・既定値の欄は `set_*` false・`touch_deleted_at: true`）→ `{"count":1,"inserted":0}`
    かつ行は `other/josei/沼津市` のまま `deleted_at` だけ入る
  - **Codex P1 の修正後**、旧行（全列 NULL）へ非既定値の端末値を `set_*: true` で送る
    → 行は `other/josei/三島市` になる（実 PG で確認）
  - 同じ旧行へ既定値を `set_*: false` で送る → 行は **NULL のまま**（実 PG で確認）

  いずれもテストの mock の戻りと一致した。
