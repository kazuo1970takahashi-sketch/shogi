#!/usr/bin/env bash
# =============================================================================
# DATA-PERSISTENCE-PHASE2 / Stage B-2(schema) — tournaments.app_tournament_id 検証
#   stagea_schema + 本 migration を使い捨て DB に適用し、列(text,nullable)・部分一意 index・
#   (club_id, app_tournament_id) の一意enforce（NOT NULL は重複拒否 / NULL は複数可）・冪等を実証。
#   前提: ローカル PostgreSQL（psql）。無ければ exit 0 で SKIP。実データ不使用。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_stageb_appid_test"
SCHEMA_MIG="$MIG_DIR/20260620130000_stagea_schema.sql"
APPID_MIG="$MIG_DIR/20260623150000_stageb_tournaments_app_id.sql"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)
pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
assert_eq(){ [ "$1" = "$2" ] && ok "$3 (=$1)" || ng "$3 (expected '$2' got '$1')"; }

if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため Stage B-2(schema) pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため Stage B-2(schema) pgtest を SKIP"; exit 0; fi
if [ ! -f "$APPID_MIG" ]; then echo "  ✗ migration が見つからない: $APPID_MIG"; echo "  Stage B-2(schema) pgtest: PASS=0 FAIL=1"; exit 1; fi

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

if ! "${PSQL_BASE[@]}" -d "$DB" -f "$SCHEMA_MIG" >/tmp/stageb_appid_schema.log 2>&1; then
  echo "  ✗ schema migration 適用に失敗:"; cat /tmp/stageb_appid_schema.log; echo "  Stage B-2(schema) pgtest: PASS=0 FAIL=1"; exit 1; fi
if ! "${PSQL_BASE[@]}" -d "$DB" -f "$APPID_MIG" >/tmp/stageb_appid_mig.log 2>&1; then
  echo "  ✗ app_id migration 適用に失敗:"; cat /tmp/stageb_appid_mig.log; echo "  Stage B-2(schema) pgtest: PASS=0 FAIL=1"; exit 1; fi
ok "schema + app_id migration が実 PostgreSQL に適用できる"

q(){ psql -X -A -t -d "$DB" -c "$1" 2>/dev/null | tail -n1; }
ins_err(){ if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "begin; $1; rollback;" >/dev/null 2>&1; then echo OK; else echo ERR; fi; }

assert_eq "$(q "select data_type from information_schema.columns where table_schema='public' and table_name='tournaments' and column_name='app_tournament_id'")" "text" "tournaments.app_tournament_id が text で存在する"
assert_eq "$(q "select is_nullable from information_schema.columns where table_schema='public' and table_name='tournaments' and column_name='app_tournament_id'")" "YES" "app_tournament_id は nullable（手動/移行行は NULL 可）"
assert_eq "$(q "select count(*) from pg_indexes where schemaname='public' and indexname='ux_tournaments_club_app_id'")" "1" "部分一意 index ux_tournaments_club_app_id が存在する"

# 架空クラブを 1 件（FK 用）
CID='cccccccc-0000-0000-0000-000000000001'
psql -X -q -d "$DB" -c "insert into public.clubs(id,name) values ('$CID','架空クラブ')" >/dev/null 2>&1

# 同一 (club_id, app_tournament_id) の 2 件目は一意違反で拒否
DUP="insert into public.tournaments(club_id,name,date,season,app_tournament_id) values
  ('$CID','大会甲','2026-06-14','2026年度','t-dup'),
  ('$CID','大会乙','2026-07-12','2026年度','t-dup')"
assert_eq "$(ins_err "$DUP")" "ERR" "同 club で app_tournament_id 重複は一意違反で拒否される"

# app_tournament_id=NULL は複数行 OK（手動/移行行が共存できる）
NULLS="insert into public.tournaments(club_id,name,date,season,app_tournament_id) values
  ('$CID','手動1','2026-06-14','2026年度',NULL),
  ('$CID','手動2','2026-07-12','2026年度',NULL)"
assert_eq "$(ins_err "$NULLS")" "OK" "app_tournament_id=NULL は複数行を許す（部分一意）"

# 別 club なら同じ app_tournament_id を持てる
CID2='cccccccc-0000-0000-0000-000000000002'
psql -X -q -d "$DB" -c "insert into public.clubs(id,name) values ('$CID2','架空クラブ2')" >/dev/null 2>&1
TWO="insert into public.tournaments(club_id,name,date,season,app_tournament_id) values
  ('$CID','大会A','2026-06-14','2026年度','t-shared'),
  ('$CID2','大会B','2026-06-14','2026年度','t-shared')"
assert_eq "$(ins_err "$TWO")" "OK" "別 club は同じ app_tournament_id を持てる（テナント分離）"

# 冪等: migration 再適用 OK
if "${PSQL_BASE[@]}" -d "$DB" -f "$APPID_MIG" >/tmp/stageb_appid_again.log 2>&1; then
  ok "app_id migration は冪等（再適用してもエラーにならない）"; else
  ng "app_id migration 再適用が失敗（冪等でない）"; fi

echo "  Stage B-2(schema) pgtest: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] || exit 1
