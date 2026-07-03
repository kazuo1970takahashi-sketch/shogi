#!/usr/bin/env bash
# =============================================================================
# HARD-DELETE-ATOMIC-001 — app_hard_delete_members RPC の実 PostgreSQL 検証
#   （Codex 監査 #525 Must-1: 完全削除の select→delete レースを RPC で原子化）
#
#   検証: 管理者は「論理削除済み・出場記録ゼロ」だけ削除できる／記録ありは skipped／
#         未削除（live）行は削除されない／organizer・viewer・別club 管理者は raise／
#         削除後の players FK 挿入は失敗（参照先消滅）。
#   並行レース自体（FOR UPDATE と FK KEY SHARE の競合）は単発 psql では再現しないため
#   関数定義の FOR UPDATE を pg_get_functiondef で pin する（挙動は PostgreSQL のロック仕様）。
#
#   前提: ローカル PostgreSQL（psql・CREATE DATABASE 権限）。無ければ exit 0 で SKIP。
#   実データ・実会員名簿は使わない（架空のみ）。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_harddel_test"
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

# ---- 前提チェック（無ければ SKIP）----
if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため HARD-DELETE-ATOMIC pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため HARD-DELETE-ATOMIC pgtest を SKIP"; exit 0; fi

psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
psql -X -d postgres -c "create database $DB" >/dev/null 2>&1 || { echo "  ⚠ test DB を作成できないため SKIP"; exit 0; }
cleanup(){ psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap cleanup EXIT

# ---- auth シム + ロール（stagea_rls_pgtest.sh と同一）----
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

# ---- 全 migrations を時系列順に適用（RPC は最後の migration に含まれる）----
for f in $(ls "$MIG_DIR"/*.sql | sort); do
  if ! "${PSQL_BASE[@]}" -d "$DB" -f "$f" >/tmp/harddel_mig.log 2>&1; then
    echo "  ✗ migration 適用に失敗: $f"; cat /tmp/harddel_mig.log; echo "  結果: PASS=0 FAIL=1"; exit 1; fi
done
ok "全 migrations（RPC 含む）が実 PostgreSQL に適用できる"

# ---- 架空シード ----
CA='aaaaaaaa-0000-0000-0000-000000000001'
CB='bbbbbbbb-0000-0000-0000-000000000002'
U_ADMIN='11111111-0000-0000-0000-000000000002'
U_ORG='11111111-0000-0000-0000-000000000003'
U_VIEWER='11111111-0000-0000-0000-000000000006'
U_BADMIN='22222222-0000-0000-0000-000000000001'
"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<SQL
insert into auth.users(id,email) values
 ('$U_ADMIN','admin@example.test'),('$U_ORG','org@example.test'),
 ('$U_VIEWER','viewer@example.test'),('$U_BADMIN','badmin@example.test');
insert into public.clubs(id,name) values ('$CA','架空将棋クラブA'),('$CB','架空将棋クラブB');
insert into public.organizers(club_id,user_id,email,role,status,display_name) values
 ('$CA','$U_ADMIN','admin@example.test','admin','active','架空管理者'),
 ('$CA','$U_ORG','org@example.test','organizer','active','架空幹事'),
 ('$CA','$U_VIEWER','viewer@example.test','viewer','active','架空閲覧'),
 ('$CB','$U_BADMIN','badmin@example.test','admin','active','架空B管理者');
-- m_free   = 論理削除済み・出場記録なし（削除できる）
-- m_rec    = 論理削除済み・出場記録あり（skipped）
-- m_live   = 未削除（live・削除されない）
insert into public.members(club_id,member_id,name,yomi,deleted_at) values
 ('$CA','m_free','架空太郎','かくうたろう', now()),
 ('$CA','m_rec','架空次郎','かくうじろう', now()),
 ('$CA','m_live','架空三郎','かくうさぶろう', null);
insert into public.players(club_id,member_id) values ('$CA','m_rec');
SQL
[ $? -eq 0 ] && ok "架空シード投入" || { ng "シード投入に失敗"; echo "  結果: PASS=$pass FAIL=$((fail+1))"; exit 1; }

RPC_FREE="select public.app_hard_delete_members('$CA', array['m_free'])"
RPC_MIX="select public.app_hard_delete_members('$CA', array['m_free','m_rec','m_live'])"

# ---- 権限系（begin/rollback・状態を汚さない）----
assert_eq "$(probe_err authenticated "$U_ORG"    "$RPC_FREE")" "ERR" "H1 organizer(rank1) は raise（管理者限定）"
assert_eq "$(probe_err authenticated "$U_VIEWER" "$RPC_FREE")" "ERR" "H2 viewer は raise"
assert_eq "$(probe_err authenticated ""          "$RPC_FREE")" "ERR" "H3 未ログインは raise"
assert_eq "$(probe_err authenticated "$U_BADMIN" "$RPC_FREE")" "ERR" "H4 別club の admin は raise（club 境界）"

# ---- 本削除（admin・mixed リスト）----
RES="$(probe authenticated "$U_ADMIN" "$RPC_MIX")"
echo "$RES" | grep -q '"deleted": \["m_free"\]' && ok "H5 削除できたのは m_free だけ（deleted=[m_free]）" || ng "H5 deleted 期待外: $RES"
echo "$RES" | grep -q '"skipped": \["m_rec"\]' && ok "H6 出場記録ありは skipped=[m_rec]" || ng "H6 skipped 期待外: $RES"
assert_eq "$(probe authenticated "$U_ADMIN" "select count(*) from public.members where club_id='$CA' and member_id='m_free'")" "0" "H7 m_free 行は物理削除済み"
assert_eq "$(probe authenticated "$U_ADMIN" "select count(*) from public.members where club_id='$CA' and member_id='m_rec'")" "1" "H8 m_rec 行は残存（論理削除のまま）"
assert_eq "$(probe authenticated "$U_ADMIN" "select count(*) from public.members where club_id='$CA' and member_id='m_live'")" "1" "H9 live 行は削除されない（deleted_at 限定）"
assert_eq "$(probe authenticated "$U_ADMIN" "select count(*) from public.players where club_id='$CA' and member_id='m_rec'")" "1" "H10 players（成績側）は無傷"

# ---- 削除後の FK: 消えた member を参照する players 挿入は失敗 ----
assert_eq "$(probe_err authenticated "$U_ADMIN" "insert into public.players(club_id,member_id) values ('$CA','m_free')")" "ERR" "H11 削除後の players FK 挿入は失敗（参照先なし）"

# ---- 原子化 pin: 関数定義に FOR UPDATE（FK KEY SHARE と競合＝レース直列化）----
#   pg_get_functiondef は複数行を返すため probe(tail -n1) で受けず、strpos の真偽値で単一値化する。
#   SECURITY INVOKER は既定値で functiondef に出力されないため pg_proc.prosecdef=false で検証する。
FU="$(probe authenticated "$U_ADMIN" "select (strpos(lower(pg_get_functiondef('public.app_hard_delete_members(uuid,text[])'::regprocedure)), 'for update') > 0)")"
assert_eq "$FU" "t" "H12 関数は FOR UPDATE で members 行をロック"
INV="$(probe authenticated "$U_ADMIN" "select (not p.prosecdef) from pg_proc p where p.oid = 'public.app_hard_delete_members(uuid,text[])'::regprocedure")"
assert_eq "$INV" "t" "H13 SECURITY INVOKER（prosecdef=false・RLS 有効のまま）"

echo "  結果: PASS=$pass FAIL=$fail"
[ $fail -eq 0 ] && exit 0 || exit 1
