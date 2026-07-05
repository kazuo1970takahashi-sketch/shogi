#!/usr/bin/env bash
# =============================================================================
# LIVE-BROADCAST-001 Phase 3 — 公開スナップショット面（table + RPC）の実 PostgreSQL 検証
#   設計 §4.1〜§4.3 / 受入 §8-6（列挙不可）§8-11（RPC 実装ガード）§8-12（version 単調性）
#   §8-15（publish は update-only・club_id を publish 時に発明しない）#18（停止後は取得不可・ローテーション）。
#   stagea_schema + 本 migration を使い捨て DB に適用して deny/allow を実証する。
#   前提: ローカル PostgreSQL（psql）。無ければ exit 0 で SKIP。実データ不使用（架空 fixture のみ）。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_live_p3_test"
SCHEMA_MIG="$MIG_DIR/20260620130000_stagea_schema.sql"
LIVE_MIG="$MIG_DIR/20260705120000_live_broadcast_phase3_public_snapshots.sql"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)
pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
assert_eq(){ [ "$1" = "$2" ] && ok "$3 (=$1)" || ng "$3 (expected '$2' got '$1')"; }

if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため LIVE Phase3 pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため LIVE Phase3 pgtest を SKIP"; exit 0; fi
if [ ! -f "$LIVE_MIG" ]; then echo "  ✗ LIVE Phase3 migration が見つからない: $LIVE_MIG"; echo "  LIVE Phase3 pgtest: PASS=0 FAIL=1"; exit 1; fi

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

# --- migrations 適用（stagea schema → LIVE Phase3。冪等確認のため LIVE は2回適用） ---
if "${PSQL_BASE[@]}" -d "$DB" -f "$SCHEMA_MIG" >/dev/null 2>&1; then ok "stagea schema 適用"; else ng "stagea schema 適用に失敗"; fi
if "${PSQL_BASE[@]}" -d "$DB" -f "$LIVE_MIG" >/dev/null 2>&1; then ok "LIVE Phase3 migration 適用"; else ng "LIVE Phase3 migration 適用に失敗"; fi
if "${PSQL_BASE[@]}" -d "$DB" -f "$LIVE_MIG" >/dev/null 2>&1; then ok "LIVE Phase3 migration 再適用（冪等）"; else ng "LIVE Phase3 migration 再適用に失敗（冪等でない）"; fi

# --- 架空 fixture（実データ不使用）: 2クラブ・u1=club1 organizer / u2=club2 owner / u3=club1 viewer ---
U1='11111111-1111-1111-1111-111111111111'
U2='22222222-2222-2222-2222-222222222222'
U3='33333333-3333-3333-3333-333333333333'
"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<SQL
insert into auth.users(id,email) values
  ('$U1','kakuu-org1@example.com'),('$U2','kakuu-org2@example.com'),('$U3','kakuu-viewer@example.com');
insert into public.clubs(id,name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','架空クラブ1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','架空クラブ2');
insert into public.organizers(club_id,user_id,email,role,status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','$U1','kakuu-org1@example.com','organizer','active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','$U2','kakuu-org2@example.com','owner','active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','$U3','kakuu-viewer@example.com','viewer','active');
SQL
[ $? -eq 0 ] && ok "架空 fixture 投入" || ng "架空 fixture 投入に失敗"

# helper: 指定ロール/uid で 1 クエリを実行し出力を返す（失敗は空）
as_user(){ # $1=sub $2=sql
  psql -X -qtA -v ON_ERROR_STOP=1 -d "$DB" -c "begin; select set_config('request.jwt.claim.sub','$1',true); set local role authenticated; $2; commit;" 2>/dev/null | sed -n '2p'
}
as_user_fails(){ # $1=sub $2=sql → 失敗すれば 0
  psql -X -qtA -v ON_ERROR_STOP=1 -d "$DB" -c "begin; select set_config('request.jwt.claim.sub','$1',true); set local role authenticated; $2; commit;" >/dev/null 2>&1 && return 1 || return 0
}
as_anon(){ # $1=sql
  psql -X -qtA -v ON_ERROR_STOP=1 -d "$DB" -c "begin; set local role anon; $1; commit;" 2>/dev/null | sed -n '1p'
}
as_anon_fails(){ # $1=sql → 失敗すれば 0
  psql -X -qtA -v ON_ERROR_STOP=1 -d "$DB" -c "begin; set local role anon; $1; commit;" >/dev/null 2>&1 && return 1 || return 0
}

# --- §4.3① 発行: u1 が start_live_session → slug 発行・version=0・is_public=true・club1 ---
SLUG=$(as_user "$U1" "select public.start_live_session()")
case "$SLUG" in live-*) ok "start_live_session が slug を発行 ($SLUG)";; *) ng "start_live_session が slug を返さない (got '$SLUG')";; esac
# 注: SQL の || 連結は boolean→text キャスト（'true'/'false'）を通る。psql の列表示（t/f）とは別物なので
#     ::text を明示し 'true' を期待する（PostgreSQL 全対応版で決定的）。
ROW=$(psql -X -qtA -d "$DB" -c "select version::text||'|'||is_public::text||'|'||club_id::text from public.public_live_snapshots where slug='$SLUG'")
assert_eq "$ROW" "0|true|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" "発行行は version=0・is_public=true・club_id=発行者の club（§8-15）"

# --- viewer(rank0)・anon は発行不可 ---
as_user_fails "$U3" "select public.start_live_session()" && ok "viewer は start_live_session 不可" || ng "viewer が start_live_session できてしまう"
as_anon_fails "select public.start_live_session()" && ok "anon は start_live_session 不可（EXECUTE なし）" || ng "anon が start_live_session できてしまう"

# --- §4.2 read: anon は get_live_snapshot（slug 完全一致）のみ・テーブル直 SELECT/列挙は不可 ---
ENV_V=$(as_anon "select (public.get_live_snapshot('$SLUG'))->>'version'")
assert_eq "$ENV_V" "0" "anon が get_live_snapshot で envelope を取得できる（version=0）"
NOROW=$(as_anon "select coalesce((public.get_live_snapshot('live-zzz-not-exist'))::text,'null')")
assert_eq "$NOROW" "null" "存在しない slug は null（他行に波及しない）"
as_anon_fails "select * from public.public_live_snapshots" && ok "anon のテーブル直 SELECT は拒否（列挙不可・§8-6）" || ng "anon がテーブルを直 SELECT できてしまう（列挙可能）"
as_anon_fails "select public.publish_live_snapshot('$SLUG','{}'::jsonb)" && ok "anon は publish 不可" || ng "anon が publish できてしまう"
as_anon_fails "select public.stop_live_session('$SLUG')" && ok "anon は stop 不可" || ng "anon が stop できてしまう"

# --- §4.3② publish: 所有者のみ・update-only・version atomic increment（§8-12） ---
V1=$(as_user "$U1" "select public.publish_live_snapshot('$SLUG','{\"schema_version\":1,\"meta\":{\"title\":\"架空大会\"},\"state\":{\"rounds\":3}}'::jsonb)")
assert_eq "$V1" "1" "publish 1回目で version=1"
V2=$(as_user "$U1" "select public.publish_live_snapshot('$SLUG','{\"schema_version\":1,\"state\":{\"rounds\":3}}'::jsonb)")
assert_eq "$V2" "2" "publish 2回目で version=2（単調増加・DB 採番）"
PAYV=$(as_anon "select (public.get_live_snapshot('$SLUG'))->>'version'")
assert_eq "$PAYV" "2" "get_live_snapshot の envelope version が最新（=2）"
as_user_fails "$U2" "select public.publish_live_snapshot('$SLUG','{}'::jsonb)" && ok "他クラブの運営は publish 不可（所有検査）" || ng "他クラブの運営が publish できてしまう"
as_user_fails "$U1" "select public.publish_live_snapshot('live-zzz-not-exist','{}'::jsonb)" && ok "存在しない slug への publish は error（INSERT しない＝update-only・§8-15）" || ng "存在しない slug への publish が通ってしまう"
CNT=$(psql -X -qtA -d "$DB" -c "select count(*) from public.public_live_snapshots")
assert_eq "$CNT" "1" "publish で行が増えない（INSERT なし）"

# --- #18 停止: stop_live_session → is_public=false・get_live_snapshot 不可 ---
STOPPED=$(as_user "$U1" "select public.stop_live_session('$SLUG')")
assert_eq "$STOPPED" "t" "stop_live_session が成功"
GONE=$(as_anon "select coalesce((public.get_live_snapshot('$SLUG'))::text,'null')")
assert_eq "$GONE" "null" "停止後は旧 slug で取得不可（受入 #18）"
as_user_fails "$U1" "select public.publish_live_snapshot('$SLUG','{}'::jsonb)" && ok "停止済み slug への publish は error" || ng "停止済み slug へ publish できてしまう"

# --- ローテーション: 再発行で旧 slug 失効（§4.2） ---
SLUG2=$(as_user "$U1" "select public.start_live_session()")
SLUG3=$(as_user "$U1" "select public.start_live_session()")
[ -n "$SLUG2" ] && [ -n "$SLUG3" ] && [ "$SLUG2" != "$SLUG3" ] && ok "再発行で新 slug（$SLUG3）" || ng "再発行の slug が不正"
OLD2=$(as_anon "select coalesce((public.get_live_snapshot('$SLUG2'))::text,'null')")
assert_eq "$OLD2" "null" "再発行で旧 slug は失効（ローテーション）"
NEW3=$(as_anon "select (public.get_live_snapshot('$SLUG3'))->>'version'")
assert_eq "$NEW3" "0" "新 slug は version=0 で取得できる"

# --- §8-11 RPC 実装ガード: SECURITY DEFINER + search_path 固定を pg_proc で確認 ---
for FN in get_live_snapshot start_live_session publish_live_snapshot stop_live_session; do
  PROPS=$(psql -X -qtA -d "$DB" -c "select prosecdef::text||'|'||coalesce(array_to_string(proconfig,','),'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$FN' limit 1")
  case "$PROPS" in
    true\|*search_path=*) ok "$FN は SECURITY DEFINER + search_path 固定（§8-11）";;
    *) ng "$FN の DEFINER/search_path が不正 (got '$PROPS')";;
  esac
done

echo "  LIVE Phase3 pgtest: PASS=$pass FAIL=$fail"
[ $fail -eq 0 ] && exit 0 || exit 1
