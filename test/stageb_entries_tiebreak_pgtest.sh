#!/usr/bin/env bash
# =============================================================================
# DATA-PERSISTENCE-PHASE2 / Stage B-0 — entries タイブレーク列追補（sos/sodos）検証
#   schema migration + B-0 migration を使い捨て DB に適用し、entries.sos / entries.sodos が
#   numeric・nullable で存在し、既存 tiebreak/rank_points が不変で、B-0 が冪等（再適用可）を実証。
#   前提: ローカル PostgreSQL（psql）。無ければ exit 0 で SKIP。実データ不使用。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_stageb_test"
SCHEMA_MIG="$MIG_DIR/20260620130000_stagea_schema.sql"
B0_MIG="$MIG_DIR/20260623120000_stageb_entries_tiebreak.sql"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)
pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
assert_eq(){ [ "$1" = "$2" ] && ok "$3 (=$1)" || ng "$3 (expected '$2' got '$1')"; }

if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため Stage B-0 pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため Stage B-0 pgtest を SKIP"; exit 0; fi
if [ ! -f "$B0_MIG" ]; then echo "  ✗ B-0 migration が見つからない: $B0_MIG"; echo "  Stage B-0 pgtest: PASS=0 FAIL=1"; exit 1; fi

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

if ! "${PSQL_BASE[@]}" -d "$DB" -f "$SCHEMA_MIG" >/tmp/stageb_mig_schema.log 2>&1; then
  echo "  ✗ schema migration 適用に失敗:"; cat /tmp/stageb_mig_schema.log; echo "  Stage B-0 pgtest: PASS=0 FAIL=1"; exit 1; fi
if ! "${PSQL_BASE[@]}" -d "$DB" -f "$B0_MIG" >/tmp/stageb_mig_b0.log 2>&1; then
  echo "  ✗ B-0 migration 適用に失敗:"; cat /tmp/stageb_mig_b0.log; echo "  Stage B-0 pgtest: PASS=0 FAIL=1"; exit 1; fi
ok "schema + B-0 migration が実 PostgreSQL に適用できる"

q(){ psql -X -A -t -d "$DB" -c "$1" 2>/dev/null | tail -n1; }
assert_eq "$(q "select data_type from information_schema.columns where table_schema='public' and table_name='entries' and column_name='sos'")" "numeric" "entries.sos が numeric で存在する"
assert_eq "$(q "select data_type from information_schema.columns where table_schema='public' and table_name='entries' and column_name='sodos'")" "numeric" "entries.sodos が numeric で存在する"
assert_eq "$(q "select is_nullable from information_schema.columns where table_schema='public' and table_name='entries' and column_name='sos'")" "YES" "entries.sos は nullable"
assert_eq "$(q "select is_nullable from information_schema.columns where table_schema='public' and table_name='entries' and column_name='sodos'")" "YES" "entries.sodos は nullable"
assert_eq "$(q "select count(*) from information_schema.columns where table_schema='public' and table_name='entries' and column_name in ('tiebreak','rank_points')")" "2" "既存 tiebreak/rank_points 列は不変（追加のみ）"

if "${PSQL_BASE[@]}" -d "$DB" -f "$B0_MIG" >/tmp/stageb_mig_b0_again.log 2>&1; then
  ok "B-0 migration は冪等（再適用してもエラーにならない）"; else
  ng "B-0 migration 再適用が失敗（冪等でない）"; fi

echo "  Stage B-0 pgtest: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] || exit 1
