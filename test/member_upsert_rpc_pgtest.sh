#!/usr/bin/env bash
# =============================================================================
# MEMBER-UPSERT-RPC-001 (#909) — app_upsert_member_edit RPC の実 PostgreSQL 検証
#
#   何を証明するか（#909 の受入基準）:
#     ・新規行の INSERT は3属性（member_kind/grade/city）が入る＝穴① の NULL 行ができない
#     ・既存行の UPDATE は p_set_* が false の属性を **1バイトも変えない**＝穴② の巻き戻しが起きない
#     ・p_set_* が true の属性は **既定値方向でも** 上書きされる（#901 の本題を退行させない）
#     ・p_touch_deleted_at=false のとき既存の deleted_at を保全する（編集 push が tombstone を復活させない）
#     ・anon は EXECUTE できない／viewer・未ログイン・別クラブは RLS で触れない
#     ・不正な区分・級は行ごと拒否される（部分適用が残らない）
#
#   ★ ピンの方針（[[pin-must-exercise-behavior]]）: 「set 句に case when があるか」のような
#     ソース形状の存在チェックはしない。**実際に RPC を呼び、行の実値を前後で比較する**。
#     保全の判定は列ごとの比較ではなく **行全体の md5** でも取る（列を1つ見落とす形の抜けを塞ぐ）。
#
#   前提: ローカル PostgreSQL（psql・CREATE DATABASE 権限）。無ければ exit 0 で SKIP。
#   実データ・実会員名簿は使わない（架空のみ）。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_upsertrpc_test"
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
# 失敗理由まで見る版。「たまたま別の理由で失敗している」ピンを避けるために使う
#   （例: anon は EXECUTE を剥がしても RLS で失敗するので、ERR だけでは EXECUTE の証明にならない）。
probe_errmsg(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  psql -X -A -t -d "$DB" -c "begin; $setsub set role $role; $sql; rollback;" 2>&1 >/dev/null | tr '\n' ' '
}

if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため MEMBER-UPSERT-RPC pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため MEMBER-UPSERT-RPC pgtest を SKIP"; exit 0; fi

psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
psql -X -d postgres -c "create database $DB" >/dev/null 2>&1 || { echo "  ⚠ test DB を作成できないため SKIP"; exit 0; }
cleanup(){ psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap cleanup EXIT

# ---- auth シム + ロール（stagea_rls_pgtest.sh / hard_delete_atomic_pgtest.sh と同一）----
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
  if ! "${PSQL_BASE[@]}" -d "$DB" -f "$f" >/tmp/upsertrpc_mig.log 2>&1; then
    echo "  ✗ migration 適用に失敗: $f"; cat /tmp/upsertrpc_mig.log; echo "  結果: PASS=0 FAIL=1"; exit 1; fi
done
ok "U0 全 migrations（本 RPC 含む）が実 PostgreSQL に適用できる"

CA='aaaaaaaa-0000-0000-0000-000000000001'
CB='bbbbbbbb-0000-0000-0000-000000000002'
U_ORG='11111111-0000-0000-0000-000000000003'
U_VIEWER='11111111-0000-0000-0000-000000000006'
U_BORG='22222222-0000-0000-0000-000000000001'

"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<SQL
insert into auth.users(id,email) values
 ('$U_ORG','org@example.test'),('$U_VIEWER','viewer@example.test'),('$U_BORG','borg@example.test');
insert into public.clubs(id,name) values ('$CA','架空将棋クラブA'),('$CB','架空将棋クラブB');
insert into public.organizers(club_id,user_id,email,role,status,display_name) values
 ('$CA','$U_ORG','org@example.test','organizer','active','架空幹事'),
 ('$CA','$U_VIEWER','viewer@example.test','viewer','active','架空閲覧'),
 ('$CB','$U_BORG','borg@example.test','organizer','active','架空B幹事');
-- m_exist = クラウドに「その他・女性・沼津市」で既に居る会員（#901 の実害シナリオの相手）
insert into public.members(club_id,member_id,name,yomi,member_kind,grade,city,deleted_at) values
 ('$CA','m_exist','架空太郎','かくうたろお','other','josei','沼津市',null);
-- m_tomb = 論理削除済み（編集 push が tombstone を復活させないことの相手）
insert into public.members(club_id,member_id,name,yomi,member_kind,grade,city,deleted_at) values
 ('$CA','m_tomb','架空次郎','かくうじろう','other','chu','三島市', now());
SQL
[ $? -eq 0 ] && ok "U0b 架空シード投入" || { ng "シード投入に失敗"; echo "  結果: PASS=$pass FAIL=$((fail+1))"; exit 1; }

# 行の実値を1文字列にする（列の見落としを防ぐため行全体を md5 でも取る）
ROWSIG="select coalesce(member_kind,'∅')||'|'||coalesce(grade,'∅')||'|'||coalesce(city,'∅')||'|'||(case when deleted_at is null then 'live' else 'tomb' end) from public.members where club_id='$CA' and member_id="
ROWMD5="select md5(m.*::text) from public.members m where club_id='$CA' and member_id="

# =============================================================================
# A. 既存行 × 未操作（p_set_* すべて false）＝#901 の実害シナリオ
#    「ふりがなの誤字を直しただけ」で区分・級・市町村が潰れないこと
# =============================================================================
BEFORE_SIG="$(probe authenticated "$U_ORG" "$ROWSIG'm_exist'")"
assert_eq "$BEFORE_SIG" "other|josei|沼津市|live" "U1 前提: m_exist は その他・女性・沼津市・生存"

# 端末のローカル値は既定値（member/ippan/city なし）＝#901 で潰していた値をそのまま渡す
CALL_A="select public.app_upsert_member_edit('$CA','m_exist','架空太郎','かくうたろう','member','ippan',null,false,false,false,null,false)"
RES_A="$(probe authenticated "$U_ORG" "$CALL_A")"
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_exist'")" "other|josei|沼津市|live" \
  "U2 ★未操作の3属性は1バイトも変わらない（既定値で潰さない＝#909 穴①②の本体）"
assert_eq "$(probe authenticated "$U_ORG" "select yomi from public.members where club_id='$CA' and member_id='m_exist'")" "かくうたろう" \
  "U3 ふりがなは更新される（name/yomi は常に更新＝現行踏襲）"
echo "$RES_A" | grep -q '"inserted" *: *false' && ok "U4 返り値 inserted=false（既存行）" || ng "U4 inserted 期待外: $RES_A"
echo "$RES_A" | grep -q '"grade" *: *"josei"' && ok "U5 返り値は実際に残った値を返す（grade=josei）" || ng "U5 返り値 期待外: $RES_A"

# =============================================================================
# B. 既存行 × 操作した欄だけ true ＝ 既定値方向の訂正が届く（#901 の本題を退行させない）
# =============================================================================
CALL_B="select public.app_upsert_member_edit('$CA','m_exist','架空太郎','かくうたろう','member','ippan',null,true,true,false,null,false)"
probe authenticated "$U_ORG" "$CALL_B" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_exist'")" "member|ippan|沼津市|live" \
  "U6 ★押した区分・級は既定値方向でも上書きされ、押していない市町村は残る"

# city だけを true にして明示的に NULL へ（＝クリアもできる。case when が excluded を通す証明）
CALL_B2="select public.app_upsert_member_edit('$CA','m_exist','架空太郎','かくうたろう','member','ippan',null,false,false,true,null,false)"
probe authenticated "$U_ORG" "$CALL_B2" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_exist'")" "member|ippan|∅|live" \
  "U7 p_set_city=true なら NULL への明示クリアもできる（保全と沈黙を混同していない）"

# =============================================================================
# C. 新規行（クラウドに行が無い会員）＝穴① の直接の証明
#    事前 select を一切せず、p_set_* が **すべて false** でも完全な行が入ること
# =============================================================================
CALL_C="select public.app_upsert_member_edit('$CA','m_new','架空三郎','かくうさぶろう','other','josei','沼津市',false,false,false,null,false)"
RES_C="$(probe authenticated "$U_ORG" "$CALL_C")"
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_new'")" "other|josei|沼津市|live" \
  "U8 ★新規行は p_set_* が全て false でも3属性が入る（NULL 行を作らない＝穴①）"
echo "$RES_C" | grep -q '"inserted" *: *true' && ok "U9 返り値 inserted=true（新規行）" || ng "U9 inserted 期待外: $RES_C"

# =============================================================================
# D. deleted_at（tombstone）の保全と操作
# =============================================================================
TOMB_MD5_BEFORE="$(probe authenticated "$U_ORG" "$ROWMD5'm_tomb'")"
CALL_D="select public.app_upsert_member_edit('$CA','m_tomb','架空次郎','かくうじろう','member','ippan',null,false,false,false,null,false)"
probe authenticated "$U_ORG" "$CALL_D" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_tomb'")" "other|chu|三島市|tomb" \
  "U10 ★p_touch_deleted_at=false なら削除状態を保全（編集 push が tombstone を復活させない）"

# 生存行に対して touch=false で時刻を渡しても、削除されない（else 枝の第2ピン。
#   U10 は tomb→tomb を見るので、無条件代入への変異のうち「null を書く」形しか捕まらない）
CALL_D1b="select public.app_upsert_member_edit('$CA','m_exist','架空太郎','かくうたろう','member','ippan',null,false,false,false, now(), false)"
probe authenticated "$U_ORG" "$CALL_D1b" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "select (deleted_at is null) from public.members where club_id='$CA' and member_id='m_exist'")" "t" \
  "U10b ★p_touch_deleted_at=false なら時刻を渡されても生存行を削除しない"

# 復元（削除 push 側の経路）: touch=true, deleted_at=null
CALL_D2="select public.app_upsert_member_edit('$CA','m_tomb','架空次郎','かくうじろう','member','ippan',null,false,false,false,null,true)"
probe authenticated "$U_ORG" "$CALL_D2" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_tomb'")" "other|chu|三島市|live" \
  "U11 p_touch_deleted_at=true なら復元でき、属性は未操作のまま保全される"

# 削除（touch=true, deleted_at=now）
CALL_D3="select public.app_upsert_member_edit('$CA','m_tomb','架空次郎','かくうじろう','member','ippan',null,false,false,false, now(), true)"
probe authenticated "$U_ORG" "$CALL_D3" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_tomb'")" "other|chu|三島市|tomb" \
  "U12 p_touch_deleted_at=true + 時刻で削除でき、属性は未操作のまま保全される"

# =============================================================================
# E. 語彙の検証（不正値は行ごと拒否＝部分適用が残らない）
# =============================================================================
SIG_E_BEFORE="$(probe authenticated "$U_ORG" "$ROWSIG'm_exist'")"
MD5_E_BEFORE="$(probe authenticated "$U_ORG" "$ROWMD5'm_exist'")"
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','m_exist','架空太郎','かくうたろう','ADMIN','ippan',null,true,true,false,null,false)")" "ERR" \
  "U13 不正な支部員区分は raise"
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','m_exist','架空太郎','かくうたろう','member','free',null,true,true,false,null,false)")" "ERR" \
  "U14 不正な会費区分は raise"
# 新規行でも（p_set_* が false でも INSERT には載るので検証されねばならない）
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','m_bad','架空四郎','かくうしろう','ADMIN','ippan','沼津市',false,false,false,null,false)")" "ERR" \
  "U15 ★p_set_*=false（新規行）でも不正な語彙は拒否される（INSERT には載るため）"
assert_eq "$(probe authenticated "$U_ORG" "select count(*) from public.members where club_id='$CA' and member_id='m_bad'")" "0" \
  "U16 拒否された新規行は1件も残らない"
assert_eq "$(probe authenticated "$U_ORG" "$ROWSIG'm_exist'")" "$SIG_E_BEFORE" "U17 拒否時に既存行は変化しない（値）"
assert_eq "$(probe authenticated "$U_ORG" "$ROWMD5'm_exist'")" "$MD5_E_BEFORE" "U18 拒否時に既存行は変化しない（行全体の md5）"

# 入力欠落
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edit(null,'m_exist','架空太郎','かくうたろう','member','ippan',null,false,false,false,null,false)")" "ERR" "U19 club 未指定は raise"
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','','架空太郎','かくうたろう','member','ippan',null,false,false,false,null,false)")" "ERR" "U20 member_id 空文字は raise"
assert_eq "$(probe_err authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','m_exist',null,'かくうたろう','member','ippan',null,false,false,false,null,false)")" "ERR" "U21 name が NULL は raise"

# =============================================================================
# F. 権限（RLS はそのまま＝この RPC で権限が増えていないこと）
# =============================================================================
MD5_F_BEFORE="$(probe authenticated "$U_ORG" "$ROWMD5'm_exist'")"
CALL_F="select public.app_upsert_member_edit('$CA','m_exist','乗っ取り','のっとり','member','ippan','東京都',true,true,true,null,false)"
assert_eq "$(probe_err authenticated "$U_VIEWER" "$CALL_F")" "ERR" "U22 viewer は更新できない（app_is_active_organizer が viewer を弾く）"
assert_eq "$(probe_err authenticated ""         "$CALL_F")" "ERR" "U23 未ログインは更新できない"
assert_eq "$(probe_err authenticated "$U_BORG"  "$CALL_F")" "ERR" "U24 別クラブの幹事は更新できない（club 境界）"
ANON_ERR="$(probe_errmsg anon "" "$CALL_F")"
case "$ANON_ERR" in
  *"permission denied for function app_upsert_member_edit"*)
    ok "U25 anon は EXECUTE できない（permission denied for function＝失敗理由まで一致）" ;;
  "") ng "U25 anon の呼び出しが成功してしまった（EXECUTE が付いている）" ;;
  *)  ng "U25 anon は失敗するが理由が EXECUTE 不許可ではない: $ANON_ERR" ;;
esac
assert_eq "$(probe authenticated "$U_ORG" "$ROWMD5'm_exist'")" "$MD5_F_BEFORE" "U26 権限テストで行が1バイトも変わっていない"

# anon に EXECUTE 権限が「そもそも付いていない」ことを catalog でも確認
assert_eq "$(probe authenticated "$U_ORG" "select has_function_privilege('anon','public.app_upsert_member_edit(uuid,text,text,text,text,text,text,boolean,boolean,boolean,timestamptz,boolean)','execute')")" "f" \
  "U27 anon に EXECUTE が付与されていない（catalog）"
assert_eq "$(probe authenticated "$U_ORG" "select has_function_privilege('authenticated','public.app_upsert_member_edit(uuid,text,text,text,text,text,text,boolean,boolean,boolean,timestamptz,boolean)','execute')")" "t" \
  "U28 authenticated には EXECUTE が付与されている"
assert_eq "$(probe authenticated "$U_ORG" "select (not p.prosecdef) from pg_proc p where p.oid='public.app_upsert_member_edit(uuid,text,text,text,text,text,text,boolean,boolean,boolean,timestamptz,boolean)'::regprocedure")" "t" \
  "U29 SECURITY INVOKER（prosecdef=false・RLS 有効のまま＝権限が増えていない）"

# =============================================================================
# G. 穴② の直接の証明: 「読んでから書く」なら消えていた他端末の更新が残る
#    端末X が値を読んだ後・書く前に、端末Y が市町村を直す。X は市町村を操作していない。
# =============================================================================
probe authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','m_race','架空五郎','かくうごろう','other','josei','沼津市',false,false,false,null,false)" >/dev/null
# 端末X が読む（この時点の city='沼津市'）
X_READ_CITY="$(probe authenticated "$U_ORG" "select city from public.members where club_id='$CA' and member_id='m_race'")"
assert_eq "$X_READ_CITY" "沼津市" "U30 前提: 端末X が読んだ時点の市町村"
# 端末Y が市町村を直す（X の読み取りと書き込みの間）
probe authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','m_race','架空五郎','かくうごろう','other','josei','裾野市',false,false,true,null,false)" >/dev/null
# 端末X が「ふりがなだけ直して」書く（市町村は未操作＝読んだ値を書き戻さない）
probe authenticated "$U_ORG" "select public.app_upsert_member_edit('$CA','m_race','架空五郎','かくうごろお','other','josei','$X_READ_CITY',false,false,false,null,false)" >/dev/null
assert_eq "$(probe authenticated "$U_ORG" "select city from public.members where club_id='$CA' and member_id='m_race'")" "裾野市" \
  "U31 ★端末Y の更新が巻き戻らない（select→upsert の窓が原理的に無い＝穴②）"
assert_eq "$(probe authenticated "$U_ORG" "select yomi from public.members where club_id='$CA' and member_id='m_race'")" "かくうごろお" \
  "U32 同時に端末X のふりがな訂正は反映されている"

echo "  結果: PASS=$pass FAIL=$fail"
[ $fail -eq 0 ] && exit 0 || exit 1
