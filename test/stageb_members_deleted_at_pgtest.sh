#!/usr/bin/env bash
# =============================================================================
# DATA-PERSISTENCE-PHASE2 / Stage B-5(schema) — members.deleted_at 検証
#   stagea_schema + 本 migration を使い捨て DB に適用し、列(timestamptz,nullable)・
#   insert 既定 NULL・update での tombstone(set now())/復元(set null)・冪等を実証。
#   前提: ローカル PostgreSQL（psql）。無ければ exit 0 で SKIP。実データ不使用。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_stageb_memdel_test"
SCHEMA_MIG="$MIG_DIR/20260620130000_stagea_schema.sql"
DELMIG="$MIG_DIR/20260624120000_stageb_members_deleted_at.sql"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)
pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
assert_eq(){ [ "$1" = "$2" ] && ok "$3 (=$1)" || ng "$3 (expected '$2' got '$1')"; }

if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため Stage B-5(schema) pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため Stage B-5(schema) pgtest を SKIP"; exit 0; fi
if [ ! -f "$DELMIG" ]; then echo "  ✗ migration が見つからない: $DELMIG"; echo "  Stage B-5(schema) pgtest: PASS=0 FAIL=1"; exit 1; fi

psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
psql -X -d postgres -c "create database $DB" >/dev/null 2>&1 || { echo "  ⚠ test DB を作成できないため SKIP"; exit 0; }
cleanup(){ psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap cleanup EXIT

"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create or replace function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), ''); $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.email() to anon, authenticated;
SQL

if ! "${PSQL_BASE[@]}" -d "$DB" -f "$SCHEMA_MIG" >/tmp/stageb_memdel_schema.log 2>&1; then
  echo "  ✗ schema migration 適用に失敗:"; cat /tmp/stageb_memdel_schema.log; echo "  Stage B-5(schema) pgtest: PASS=0 FAIL=1"; exit 1; fi
if ! "${PSQL_BASE[@]}" -d "$DB" -f "$DELMIG" >/tmp/stageb_memdel_mig.log 2>&1; then
  echo "  ✗ deleted_at migration 適用に失敗:"; cat /tmp/stageb_memdel_mig.log; echo "  Stage B-5(schema) pgtest: PASS=0 FAIL=1"; exit 1; fi
ok "schema + deleted_at migration が実 PostgreSQL に適用できる"

q(){ psql -X -A -t -d "$DB" -c "$1" 2>/dev/null | tail -n1; }

assert_eq "$(q "select data_type from information_schema.columns where table_schema='public' and table_name='members' and column_name='deleted_at'")" "timestamp with time zone" "members.deleted_at が timestamptz で存在する"
assert_eq "$(q "select is_nullable from information_schema.columns where table_schema='public' and table_name='members' and column_name='deleted_at'")" "YES" "deleted_at は nullable（有効会員は NULL）"
assert_eq "$(q "select column_default is null from information_schema.columns where table_schema='public' and table_name='members' and column_name='deleted_at'")" "t" "deleted_at に DEFAULT は無い（既定 NULL）"

# 架空クラブ + 会員 1 件（insert 既定で deleted_at=NULL）
CID='cccccccc-0000-0000-0000-000000000001'
psql -X -q -d "$DB" -c "insert into public.clubs(id,name) values ('$CID','架空クラブ')" >/dev/null 2>&1
psql -X -q -d "$DB" -c "insert into public.members(club_id,member_id,name,yomi,branch) values ('$CID','m_test000001','架空 太郎','かくう たろう','沼津')" >/dev/null 2>&1
assert_eq "$(q "select deleted_at is null from public.members where club_id='$CID' and member_id='m_test000001'")" "t" "insert 直後の deleted_at は NULL（有効）"

# 論理削除（tombstone）: update set deleted_at=now()
psql -X -q -d "$DB" -c "update public.members set deleted_at=now() where club_id='$CID' and member_id='m_test000001'" >/dev/null 2>&1
assert_eq "$(q "select deleted_at is not null from public.members where club_id='$CID' and member_id='m_test000001'")" "t" "update set deleted_at=now() で論理削除できる（行は残る）"
assert_eq "$(q "select count(*) from public.members where club_id='$CID' and member_id='m_test000001'")" "1" "論理削除しても物理行は消えない（履歴/players FK 温存）"

# 復元: update set deleted_at=null
psql -X -q -d "$DB" -c "update public.members set deleted_at=null where club_id='$CID' and member_id='m_test000001'" >/dev/null 2>&1
assert_eq "$(q "select deleted_at is null from public.members where club_id='$CID' and member_id='m_test000001'")" "t" "update set deleted_at=null で復元できる"

# 冪等: migration 再適用 OK（既存データ・deleted_at の値とも不変）
if "${PSQL_BASE[@]}" -d "$DB" -f "$DELMIG" >/tmp/stageb_memdel_again.log 2>&1; then
  ok "deleted_at migration は冪等（再適用してもエラーにならない・add column if not exists）"; else
  ng "deleted_at migration 再適用が失敗（冪等でない）"; fi

echo "  Stage B-5(schema) pgtest: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] || exit 1
