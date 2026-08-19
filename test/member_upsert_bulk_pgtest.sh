#!/usr/bin/env bash
# =============================================================================
# MEMBER-UPSERT-RPC-001 / bulk (#909) — app_upsert_member_edits_bulk の実 PostgreSQL 検証
#
#   何を証明するか:
#     ・N 件を 1 リクエスト・1 トランザクションで適用できる
#     ・**1 行でも不正なら全部ロールバックする**（部分適用が残らない＝これが本関数の存在理由の半分）
#     ・列の保全規則は単数形と同一（未指定の属性は1バイトも変わらない・新規行は完全な行）
#     ・空配列／非配列／要素が非オブジェクト／上限超過は raise
#     ・anon は EXECUTE できない／別クラブは RLS で触れない／SECURITY INVOKER
#
#   ★ ピンの方針（[[pin-must-exercise-behavior]]）: ソース形状の存在チェックはしない。
#     **実際に RPC を呼び、行の実値を前後で比較する**。
#
#   前提: ローカル PostgreSQL（psql・CREATE DATABASE 権限）。無ければ exit 0 で SKIP。
#   実データ・実会員名簿は使わない（架空のみ）。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_upsertbulk_test"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)

pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
assert_eq(){ [ "$1" = "$2" ] && ok "$3 (=$1)" || ng "$3 (expected '$2' got '$1')"; }

probe(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  psql -X -A -t -d "$DB" -c "$setsub set role $role; $sql" 2>/dev/null | tail -n1
}
probe_err(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "begin; $setsub set role $role; $sql; rollback;" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
}
probe_errmsg(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  psql -X -A -t -d "$DB" -c "begin; $setsub set role $role; $sql; rollback;" 2>&1 >/dev/null | tr '\n' ' '
}
# ロールバックの検査は「begin/rollback で包まない」＝実際にコミットさせて残骸を見る必要がある。
run_commit(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "$setsub set role $role; $sql" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
}

if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため MEMBER-UPSERT-BULK pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため MEMBER-UPSERT-BULK pgtest を SKIP"; exit 0; fi

psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
psql -X -d postgres -c "create database $DB" >/dev/null 2>&1 || { echo "  ⚠ test DB を作成できないため SKIP"; exit 0; }
cleanup(){ psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap cleanup EXIT

"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '');
$$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.email() to anon, authenticated;
SQL
if [ $? -ne 0 ]; then echo "  ⚠ auth シム作成に失敗のため SKIP"; exit 0; fi

for f in $(ls "$MIG_DIR"/*.sql | sort); do
  if ! "${PSQL_BASE[@]}" -d "$DB" -f "$f" >/tmp/upsertbulk_mig.log 2>&1; then
    echo "  ✗ migration 適用に失敗: $f"; cat /tmp/upsertbulk_mig.log; echo "  結果: PASS=0 FAIL=1"; exit 1; fi
done
ok "B0 全 migrations（単数形＋一括版）が実 PostgreSQL に適用できる"

CA='aaaaaaaa-0000-0000-0000-000000000001'
CB='bbbbbbbb-0000-0000-0000-000000000002'
U_ORG='11111111-0000-0000-0000-000000000003'
U_BORG='22222222-0000-0000-0000-000000000001'

"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<SQL
insert into auth.users(id,email) values ('$U_ORG','org@example.test'),('$U_BORG','borg@example.test');
insert into public.clubs(id,name) values ('$CA','架空将棋クラブA'),('$CB','架空将棋クラブB');
insert into public.organizers(club_id,user_id,email,role,status,display_name) values
 ('$CA','$U_ORG','org@example.test','organizer','active','架空幹事'),
 ('$CB','$U_BORG','borg@example.test','organizer','active','架空B幹事');
-- 既存3名（クラウド側に「その他・女性・沼津市」等が入っている＝潰してはいけない値）
insert into public.members(club_id,member_id,name,yomi,member_kind,grade,city,deleted_at) values
 ('$CA','b1','架空一郎','かくういちろう','other','josei','沼津市',null),
 ('$CA','b2','架空二郎','かくうじろう','other','chu','三島市',null),
 ('$CA','b3','架空三郎','かくうさぶろう','member','ippan','裾野市',null);
SQL
[ $? -eq 0 ] && ok "B0b 架空シード投入" || { ng "シード投入に失敗"; echo "  結果: PASS=$pass FAIL=$((fail+1))"; exit 1; }

SIG="select coalesce(member_kind,'∅')||'|'||coalesce(grade,'∅')||'|'||coalesce(city,'∅')||'|'||(case when deleted_at is null then 'live' else 'tomb' end) from public.members where club_id='$CA' and member_id="
ALLSIG="select string_agg(coalesce(member_kind,'∅')||'/'||coalesce(grade,'∅')||'/'||coalesce(city,'∅')||'/'||(case when deleted_at is null then 'live' else 'tomb' end), ' , ' order by member_id) from public.members where club_id='$CA'"

# =============================================================================
# A. まとめて削除（削除 push の実経路）。属性は未操作＝保全されること
# =============================================================================
ROWS_DEL='[{"member_id":"b1","name":"架空一郎","yomi":"かくういちろう","member_kind":"member","grade":"ippan","touch_deleted_at":true,"deleted_at":"2026-08-19T00:00:00Z"},{"member_id":"b2","name":"架空二郎","yomi":"かくうじろう","member_kind":"member","grade":"ippan","touch_deleted_at":true,"deleted_at":"2026-08-19T00:00:00Z"},{"member_id":"b3","name":"架空三郎","yomi":"かくうさぶろう","member_kind":"member","grade":"ippan","touch_deleted_at":true,"deleted_at":"2026-08-19T00:00:00Z"}]'
RES_A="$(probe authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','$ROWS_DEL'::jsonb)")"
assert_eq "$(probe authenticated "$U_ORG" "$ALLSIG")" "other/josei/沼津市/tomb , other/chu/三島市/tomb , member/ippan/裾野市/tomb" \
  "B1 ★3名を1回で削除でき、属性は3名とも1バイトも変わらない"
echo "$RES_A" | grep -q '"count" *: *3' && ok "B2 返り値 count=3" || ng "B2 count 期待外: $RES_A"
echo "$RES_A" | grep -q '"inserted" *: *0' && ok "B3 返り値 inserted=0（3名とも既存行）" || ng "B3 inserted 期待外: $RES_A"

# まとめて復元
ROWS_RES='[{"member_id":"b1","name":"架空一郎","yomi":"かくういちろう","touch_deleted_at":true},{"member_id":"b2","name":"架空二郎","yomi":"かくうじろう","touch_deleted_at":true},{"member_id":"b3","name":"架空三郎","yomi":"かくうさぶろう","touch_deleted_at":true}]'
probe authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','$ROWS_RES'::jsonb)" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$ALLSIG")" "other/josei/沼津市/live , other/chu/三島市/live , member/ippan/裾野市/live" \
  "B4 まとめて復元でき、属性はやはり保全される"

# =============================================================================
# B. ★1行でも不正なら全部ロールバック（本関数の存在理由の半分）
#    ここは begin/rollback で包まず、**実際にコミットさせて残骸を見る**
# =============================================================================
BEFORE_ALL="$(probe authenticated "$U_ORG" "$ALLSIG")"
ROWS_BAD='[{"member_id":"b1","name":"架空一郎","yomi":"よみ1","member_kind":"member","set_member_kind":true},{"member_id":"b2","name":"架空二郎","yomi":"よみ2","member_kind":"ADMIN","set_member_kind":true},{"member_id":"b_new","name":"架空新人","yomi":"よみ新","member_kind":"member","grade":"ippan","city":"長泉町"}]'
assert_eq "$(run_commit authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','$ROWS_BAD'::jsonb)")" "ERR" \
  "B5 2行目が不正なら文全体が失敗する"
assert_eq "$(probe authenticated "$U_ORG" "$ALLSIG")" "$BEFORE_ALL" \
  "B6 ★1行目の正しい更新も適用されていない（部分適用が残らない）"
assert_eq "$(probe authenticated "$U_ORG" "select count(*) from public.members where club_id='$CA' and member_id='b_new'")" "0" \
  "B7 ★3行目の新規行も作られていない（同一トランザクション）"
assert_eq "$(probe authenticated "$U_ORG" "select yomi from public.members where club_id='$CA' and member_id='b1'")" "かくういちろう" \
  "B8 1行目の氏名・ふりがなも巻き戻っている"

# =============================================================================
# C. 新規行は完全な行で入る（単数形と同じ規則が一括でも成り立つ）
# =============================================================================
ROWS_NEW='[{"member_id":"b_n1","name":"架空四郎","yomi":"かくうしろう","member_kind":"other","grade":"josei","city":"長泉町"},{"member_id":"b_n2","name":"架空五郎","yomi":"かくうごろう","member_kind":"member","grade":"chu","city":"清水町"}]'
probe authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','$ROWS_NEW'::jsonb)" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$SIG'b_n1'")" "other|josei|長泉町|live" "B9 新規行1は完全な行で入る（set_* 未指定でも）"
assert_eq "$(probe authenticated "$U_ORG" "$SIG'b_n2'")" "member|chu|清水町|live" "B10 新規行2も完全な行で入る"
RES_NEW="$(probe authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','[{\"member_id\":\"b_n3\",\"name\":\"架空六郎\",\"yomi\":\"かくうろくろう\",\"member_kind\":\"member\",\"grade\":\"ippan\"},{\"member_id\":\"b_n1\",\"name\":\"架空四郎\",\"yomi\":\"かくうしろう\"}]'::jsonb)")"
echo "$RES_NEW" | grep -q '"inserted" *: *1' && ok "B10b 返り値 inserted=1（新規1・既存1の便）" || ng "B10b inserted 期待外: $RES_NEW"
echo "$RES_NEW" | grep -q '"count" *: *2' && ok "B10c 返り値 count=2" || ng "B10c count 期待外: $RES_NEW"

# 既存行 × set_* を立てた欄だけ更新（単数形と同じ）
ROWS_MIX='[{"member_id":"b_n1","name":"架空四郎","yomi":"かくうしろう","member_kind":"member","grade":"ippan","city":null,"set_grade":true}]'
probe authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','$ROWS_MIX'::jsonb)" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$SIG'b_n1'")" "other|ippan|長泉町|live" \
  "B11 set_grade だけ true なら級だけ変わり、区分・市町村は保全される"

# 同じ member_id が2回 → 後勝ち（決定的であることの明示）
ROWS_DUP='[{"member_id":"b_n2","name":"架空五郎","yomi":"かくうごろう","member_kind":"other","set_member_kind":true},{"member_id":"b_n2","name":"架空五郎","yomi":"かくうごろう","member_kind":"member","set_member_kind":true}]'
probe authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','$ROWS_DUP'::jsonb)" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$SIG'b_n2'")" "member|chu|清水町|live" "B12 同じ会員が2回現れたら後勝ち（決定的）"

# =============================================================================
# D. 入力の形式チェック
# =============================================================================
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','[]'::jsonb)")" "ERR" "B13 空配列は raise"
# ★ B14/B15 は「ERR かどうか」だけでは足りない。形式チェックを外しても、
#   jsonb_array_length が非配列で落ちたり、内側の単数形が member_id なしで落ちたりして
#   **別の理由で ERR になる**（反証パネル N3/N7 で実測）。そこで**失敗理由の文言まで**見る。
E_NOTARR="$(probe_errmsg authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','{\"member_id\":\"b1\"}'::jsonb)")"
case "$E_NOTARR" in
  *"オブジェクトの配列を渡してください"*) ok "B14 配列でない（オブジェクト）は形式エラーとして raise（文言まで一致）" ;;
  "") ng "B14 配列でない入力が成功してしまった" ;;
  *)  ng "B14 raise はするが形式チェック由来ではない: $E_NOTARR" ;;
esac
E_NOTOBJ="$(probe_errmsg authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','[1,2,3]'::jsonb)")"
case "$E_NOTOBJ" in
  *"配列の要素がオブジェクトではありません"*) ok "B15 要素がオブジェクトでないは形式エラーとして raise（文言まで一致）" ;;
  "") ng "B15 要素が非オブジェクトの入力が成功してしまった" ;;
  *)  ng "B15 raise はするが要素チェック由来ではない: $E_NOTOBJ" ;;
esac
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk(null,'$ROWS_NEW'::jsonb)")" "ERR" "B16 club 未指定は raise"
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA', null)")" "ERR" "B17 p_rows が NULL は raise"

# 上限（実際に 1001 件を投げる＝テストされない防御は置かない）
GEN1001="select public.app_upsert_member_edits_bulk('$CA', (select jsonb_agg(jsonb_build_object('member_id','g'||i,'name','架空'||i,'yomi','かくう','member_kind','member','grade','ippan')) from generate_series(1,1001) i))"
assert_eq "$(probe_err authenticated "$U_ORG" "$GEN1001")" "ERR" "B18 1001 件は上限超過で raise（実際に投げて確認）"
GEN1000="select public.app_upsert_member_edits_bulk('$CA', (select jsonb_agg(jsonb_build_object('member_id','g'||i,'name','架空'||i,'yomi','かくう','member_kind','member','grade','ippan')) from generate_series(1,1000) i))"
assert_eq "$(probe_err authenticated "$U_ORG" "$GEN1000")" "OK" "B19 1000 件ちょうどは通る（境界の内側）"

# =============================================================================
# E. 権限（RLS はそのまま＝この関数で権限が増えていないこと）
# =============================================================================
BEFORE_P="$(probe authenticated "$U_ORG" "$ALLSIG")"
CALL_P="select public.app_upsert_member_edits_bulk('$CA','[{\"member_id\":\"b1\",\"name\":\"乗っ取り\",\"yomi\":\"のっとり\",\"member_kind\":\"member\",\"grade\":\"ippan\",\"city\":\"東京都\",\"set_member_kind\":true,\"set_grade\":true,\"set_city\":true}]'::jsonb)"
assert_eq "$(probe_err authenticated ""        "$CALL_P")" "ERR" "B20 未ログインは更新できない"
assert_eq "$(probe_err authenticated "$U_BORG" "$CALL_P")" "ERR" "B21 別クラブの幹事は更新できない（club 境界）"
ANON_ERR="$(probe_errmsg anon "" "$CALL_P")"
case "$ANON_ERR" in
  *"permission denied for function app_upsert_member_edits_bulk"*)
    ok "B22 anon は EXECUTE できない（permission denied for function＝失敗理由まで一致）" ;;
  "") ng "B22 anon の呼び出しが成功してしまった（EXECUTE が付いている）" ;;
  *"permission denied for function app_upsert_member_edit"*)
    ng "B22 anon が bulk 関数を実行できてしまい、内側の単数形で落ちている（bulk に EXECUTE が付いている疑い）: $ANON_ERR" ;;
  *)  ng "B22 anon は失敗するが理由が EXECUTE 不許可ではない: $ANON_ERR" ;;
esac
assert_eq "$(probe authenticated "$U_ORG" "$ALLSIG")" "$BEFORE_P" "B23 権限テストで行が1つも変わっていない"
assert_eq "$(probe authenticated "$U_ORG" "select has_function_privilege('anon','public.app_upsert_member_edits_bulk(uuid,jsonb)','execute')")" "f" "B24 anon に EXECUTE が付与されていない（catalog）"
assert_eq "$(probe authenticated "$U_ORG" "select has_function_privilege('authenticated','public.app_upsert_member_edits_bulk(uuid,jsonb)','execute')")" "t" "B25 authenticated には EXECUTE が付与されている"
assert_eq "$(probe authenticated "$U_ORG" "select (not p.prosecdef) from pg_proc p where p.oid='public.app_upsert_member_edits_bulk(uuid,jsonb)'::regprocedure")" "t" "B26 SECURITY INVOKER（prosecdef=false）"

# =============================================================================
# F. 未知キーの拒否（Codex P1 r3809573508）
#    綴り違いを黙って「未指定＝false」にすると、**削除が1件も適用されていないのに成功が返る**。
# =============================================================================
BEFORE_K="$(probe authenticated "$U_ORG" "$ALLSIG")"
E_BADKEY="$(probe_errmsg authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','[{\"member_id\":\"b1\",\"name\":\"架空一郎\",\"yomi\":\"かくういちろう\",\"touch_delete_at\":true}]'::jsonb)")"
case "$E_BADKEY" in
  *"未知のキーがあります"*) ok "B27 ★綴り違いのキー（touch_delete_at）は raise（黙って無視しない）" ;;
  "") ng "B27 綴り違いのキーが成功してしまった（＝削除が適用されないまま成功が返る）" ;;
  *)  ng "B27 raise はするが未知キー検査由来ではない: $E_BADKEY" ;;
esac
assert_eq "$(run_commit authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','[{\"member_id\":\"b1\",\"name\":\"変更\",\"yomi\":\"へんこう\"},{\"member_id\":\"b2\",\"name\":\"架空二郎\",\"yomi\":\"かくうじろう\",\"grado\":\"ippan\"}]'::jsonb)")" "ERR" \
  "B28 未知キーが1行でもあれば文全体が失敗する"
assert_eq "$(probe authenticated "$U_ORG" "$ALLSIG")" "$BEFORE_K" "B29 未知キーで失敗したとき行が1つも変わっていない"
assert_eq "$(probe authenticated "$U_ORG" "select name from public.members where club_id='$CA' and member_id='b1'")" "架空一郎" "B29b 同じ便の正しい行も適用されていない"
# 許可リストが厳しすぎないこと（既知キーを全部入れた行が通る）
ALLKEYS='[{"member_id":"b_all","name":"架空全","yomi":"かくうぜん","member_kind":"other","grade":"chu","city":"函南町","set_member_kind":true,"set_grade":true,"set_city":true,"deleted_at":null,"touch_deleted_at":false}]'
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edits_bulk('$CA','$ALLKEYS'::jsonb)")" "OK" "B30 既知キーを全部含む行は通る（許可リストが厳しすぎない）"

# =============================================================================
# G. ★2セッション並行：ロックを取る順が **入力順に依存しない**（Codex P1 r3809573504）
#    受付席と本部席が重なる会員を逆順で一括操作するとデッドロックしうる。
#    全員が同じ順（member_id 昇順）で取れば起きない。
#
#    測り方: 別セッション A に z_a を掴ませたまま、bulk を **[z_b, z_a] の順**で投げる。
#      ・canonical 順なら z_a を先に取りに行って**そこで待つ**＝z_b はまだ空いている
#      ・入力順のままなら z_b を先に掴んでから z_a で待つ＝z_b は塞がっている
#    → z_b に FOR UPDATE NOWAIT をかけて、通るかどうかで処理順を**外から観測する**。
# =============================================================================
psql -X -q -d "$DB" -c "insert into public.members(club_id,member_id,name,yomi,member_kind,grade,city) values ('$CA','z_a','架空Ａ','えー','member','ippan','沼津市'),('$CA','z_b','架空Ｂ','びー','member','ippan','沼津市') on conflict do nothing" >/dev/null 2>&1

# セッション A: z_a を掴んで 8 秒保持
psql -X -q -d "$DB" -c "begin; select 1 from public.members where club_id='$CA' and member_id='z_a' for update; select pg_sleep(8); rollback;" >/dev/null 2>&1 &
LOCK_PID=$!
sleep 2
# セッション B: 入力順は [z_b, z_a]（＝canonical 順の逆）
psql -X -q -d "$DB" -c "select public.app_upsert_member_edits_bulk('$CA','[{\"member_id\":\"z_b\",\"name\":\"架空Ｂ\",\"yomi\":\"びー\"},{\"member_id\":\"z_a\",\"name\":\"架空Ａ\",\"yomi\":\"えー\"}]'::jsonb)" >/dev/null 2>&1 &
BULK_PID=$!
sleep 3
# ★ tail -1 は使わない（psql は最後に ROLLBACK を出すので、成否がその行に現れない）。
#   出力全体を見て「ロックが取れなかった」エラーの有無で判定する。
ZB_OUT="$(psql -X -A -t -d "$DB" -c "begin; select 1 from public.members where club_id='$CA' and member_id='z_b' for update nowait; rollback;" 2>&1)"
if echo "$ZB_OUT" | grep -qi "could not obtain lock"; then
  ng "B31 z_b が既にロックされている＝入力順でロックしている（逆順の同時操作でデッドロックしうる）"
elif echo "$ZB_OUT" | grep -q "^1$"; then
  ok "B31 ★入力が [z_b, z_a] でも z_b はまだ空いている＝member_id 昇順でロックしている（デッドロック回避）"
else
  ng "B31 判定不能（z_b の NOWAIT 取得が想定外の結果）: $(echo "$ZB_OUT" | tr '\n' ' ')"
fi
wait $LOCK_PID 2>/dev/null; wait $BULK_PID 2>/dev/null

echo "  結果: PASS=$pass FAIL=$fail"
[ $fail -eq 0 ] && exit 0 || exit 1
