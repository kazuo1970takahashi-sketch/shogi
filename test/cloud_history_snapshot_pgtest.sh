#!/usr/bin/env bash
# =============================================================================
# CLOUD-HISTORY-SCOREBOARD-001 (#765) — tournament_snapshots の RLS 実 PostgreSQL 検証
#   受入基準3: anon からの snapshot read が RLS で拒否される（実測）。
#   加えて: 他クラブ member の read 拒否 / 自クラブ authenticated（viewer 含む＝entries と同じ
#   app_is_active_member）read 許可 / 書込は organizer 以上のみ / 他クラブ大会への貼り付け拒否
#   （with check の整合ガード）/ migration 冪等再適用。
#   live_broadcast_phase3_pgtest.sh / stagea_rls_pgtest.sh と同型（使い捨て DB・auth シム・架空 fixture のみ）。
#   前提: ローカル PostgreSQL（psql）。無ければ exit 0 で SKIP。実データ不使用。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_cloud_hist_snap_test"
SCHEMA_MIG="$MIG_DIR/20260620130000_stagea_schema.sql"
RLS_MIG="$MIG_DIR/20260620130100_stagea_rls.sql"
SNAP_MIG="$MIG_DIR/20260729120000_cloud_history_scoreboard_snapshot.sql"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)
pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
assert_eq(){ [ "$1" = "$2" ] && ok "$3 (=$1)" || ng "$3 (expected '$2' got '$1')"; }

# probe ROLE SUB SQL → 実行結果の最終行（SELECT の値/件数）。
probe(){
  local role="$1" sub="$2" sql="$3" sets=""
  [ -n "$sub" ] && sets="set request.jwt.claim.sub = '$sub';"
  psql -X -A -t -d "$DB" -c "$sets set role $role; $sql" 2>/dev/null | tail -n1
}
# probe_write ROLE SUB SQL → 書込が通れば OK、RLS/エラーで止まれば ERR（begin/rollback で副作用なし）。
probe_write(){
  local role="$1" sub="$2" sql="$3" sets=""
  [ -n "$sub" ] && sets="set request.jwt.claim.sub = '$sub';"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "begin; $sets set role $role; $sql; rollback;" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
}
# probe_rows ROLE SUB "UPDATE 文" → RLS USING で実際に作用した行数（0=deny）。
probe_rows(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  psql -X -q -A -t -d "$DB" -c "begin; $setsub set role $role; with u as ($sql returning 1) select count(*) from u; rollback;" 2>/dev/null | tail -n1
}

if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため CLOUD-HISTORY snapshot pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため CLOUD-HISTORY snapshot pgtest を SKIP"; exit 0; fi
if [ ! -f "$SNAP_MIG" ]; then echo "  ✗ snapshot migration が見つからない: $SNAP_MIG"; echo "  CLOUD-HISTORY snapshot pgtest: PASS=0 FAIL=1"; exit 1; fi

psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
psql -X -d postgres -c "create database $DB" >/dev/null 2>&1 || { echo "  ⚠ test DB を作成できないため SKIP"; exit 0; }
cleanup(){ psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap cleanup EXIT

# --- Supabase 相当の auth シム＋ロール（他 pgtest と同型） ---
"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create or replace function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), ''); $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.email() to anon, authenticated;
SQL
[ $? -eq 0 ] && ok "auth シム＋ロール準備" || ng "auth シム＋ロール準備に失敗"

# --- migrations 適用（schema → RLS → snapshot。snapshot は2回適用して冪等確認） ---
if "${PSQL_BASE[@]}" -d "$DB" -f "$SCHEMA_MIG" >/dev/null 2>&1; then ok "stagea schema 適用"; else ng "stagea schema 適用に失敗"; fi
if "${PSQL_BASE[@]}" -d "$DB" -f "$RLS_MIG" >/dev/null 2>&1; then ok "stagea RLS 適用"; else ng "stagea RLS 適用に失敗"; fi
if "${PSQL_BASE[@]}" -d "$DB" -f "$SNAP_MIG" >/dev/null 2>&1; then ok "snapshot migration 適用"; else ng "snapshot migration 適用に失敗"; fi
if "${PSQL_BASE[@]}" -d "$DB" -f "$SNAP_MIG" >/dev/null 2>&1; then ok "snapshot migration 再適用（冪等）"; else ng "snapshot migration 再適用に失敗（冪等でない）"; fi

# --- 架空 fixture（superuser＝RLS 回避で投入・実データ不使用） ---
CA='aaaaaaaa-0000-0000-0000-000000000001'   # club A
CB='bbbbbbbb-0000-0000-0000-000000000002'   # club B
U_ORG='11111111-0000-0000-0000-000000000001'     # club A organizer
U_VIEWER='11111111-0000-0000-0000-000000000002'  # club A viewer（rank0）
U_BORG='22222222-0000-0000-0000-000000000001'    # club B organizer（他クラブ member）
TA='cccccccc-0000-0000-0000-000000000001'   # club A の大会
TB='dddddddd-0000-0000-0000-000000000002'   # club B の大会
"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<SQL
insert into auth.users(id,email) values
 ('$U_ORG','org@example.test'),('$U_VIEWER','viewer@example.test'),('$U_BORG','borg@example.test');
insert into public.clubs(id,name) values ('$CA','架空将棋クラブA'),('$CB','架空将棋クラブB');
insert into public.organizers(club_id,user_id,email,role,status,display_name) values
 ('$CA','$U_ORG','org@example.test','organizer','active','架空幹事A'),
 ('$CA','$U_VIEWER','viewer@example.test','viewer','active','架空閲覧A'),
 ('$CB','$U_BORG','borg@example.test','organizer','active','架空幹事B');
insert into public.tournaments(id,club_id,name,date,season,status,source) values
 ('$TA','$CA','七月例会（架空）','2026-07-12','2026','confirmed','app_sync'),
 ('$TB','$CB','他クラブ例会（架空）','2026-07-13','2026','confirmed','app_sync');
insert into public.tournament_snapshots(tournament_id,club_id,snapshot) values
 ('$TA','$CA','{"schema_version":1,"meta":{"title":"七月例会（架空）"},"state":{"rounds":2,"classes":[],"players":{},"results":{},"pairings":{}}}'::jsonb);
SQL
[ $? -eq 0 ] && ok "架空 fixture 投入（snapshot 1件＝club A の大会）" || ng "架空 fixture 投入に失敗"

echo "  -- read（受入基準3: anon 拒否 / 他クラブ拒否 / 自クラブ authenticated 許可）"
assert_eq "$(probe anon '' "select count(*) from public.tournament_snapshots;")" "0" "R1 anon は snapshot を1行も読めない（RLS 全拒否）"
assert_eq "$(probe authenticated "$U_BORG" "select count(*) from public.tournament_snapshots where club_id='$CA';")" "0" "R2 他クラブ member は club A の snapshot を読めない"
assert_eq "$(probe authenticated "$U_ORG" "select count(*) from public.tournament_snapshots where tournament_id='$TA';")" "1" "R3 自クラブ organizer は読める"
assert_eq "$(probe authenticated "$U_VIEWER" "select count(*) from public.tournament_snapshots where tournament_id='$TA';")" "1" "R4 自クラブ viewer も読める（entries_select と同じ app_is_active_member）"

echo "  -- write（organizer 以上のみ・他クラブ大会への貼り付け拒否）"
assert_eq "$(probe_write authenticated "$U_ORG" "update public.tournament_snapshots set snapshot='{}'::jsonb, updated_at=now() where tournament_id='$TA'")" "OK" "W1 自クラブ organizer は update できる（冪等 upsert の update 側）"
assert_eq "$(probe_rows authenticated "$U_BORG" "update public.tournament_snapshots set snapshot='{}'::jsonb where tournament_id='$TA'")" "0" "W2 他クラブ organizer の update は 0 行（deny）"
assert_eq "$(probe_rows authenticated "$U_VIEWER" "update public.tournament_snapshots set snapshot='{}'::jsonb where tournament_id='$TA'")" "0" "W3 自クラブ viewer の update は 0 行（書込は organizer 以上）"
assert_eq "$(probe_write authenticated "$U_VIEWER" "insert into public.tournament_snapshots(tournament_id,club_id,snapshot) values('$TB','$CA','{}'::jsonb)")" "ERR" "W4 viewer の insert は拒否"
assert_eq "$(probe_write authenticated "$U_BORG" "insert into public.tournament_snapshots(tournament_id,club_id,snapshot) values('$TB','$CB','{}'::jsonb)")" "OK" "W5 club B organizer は自クラブ大会に insert できる"
assert_eq "$(probe_write authenticated "$U_ORG" "insert into public.tournament_snapshots(tournament_id,club_id,snapshot) values('$TB','$CA','{}'::jsonb)")" "ERR" "W6 他クラブの大会 uuid への貼り付けは with check で拒否（cross-club 整合ガード）"
assert_eq "$(probe_write anon '' "insert into public.tournament_snapshots(tournament_id,club_id,snapshot) values('$TA','$CA','{}'::jsonb)")" "ERR" "W7 anon の insert は拒否"

echo "  -- anon 面の不変（[anon-attack-surface-audit-202607]: 匿名の窓は get_live_snapshot のみ）"
assert_eq "$(probe anon '' "select count(*) from pg_policies where tablename='tournament_snapshots' and 'anon' = any(roles);")" "0" "A1 tournament_snapshots に anon 向けポリシーが存在しない"

echo "  CLOUD-HISTORY snapshot pgtest: PASS=$pass FAIL=$fail"
[ $fail -gt 0 ] && exit 1
exit 0
