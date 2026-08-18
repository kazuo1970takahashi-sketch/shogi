#!/usr/bin/env bash
# =============================================================================
# INDEX-ONBOARD-001 (#841) — 「クラブを作る手段が製品に無い」を**実 PostgreSQL で実証**する
#
#   なぜテキスト走査ではダメか（Codex 4巡の実測）:
#     index.html は「ほかのクラブのアカウントを作る仕組みが、まだアプリにありません」と書いている。
#     この記述の裏付けを最初は SQL/JS の**テキスト走査**でやっていたが、レビューのたびに
#     新しい書き方で回避された:
#       1巡目 → `.rpc('...')` のリテラル名を差し替える
#       2巡目 → 変数経由の RPC ＋ 新規 SECURITY DEFINER migration
#       3巡目 → 後続 migration の insert policy ＋ クライアントの upsert（.insert() しか見ていなかった）
#       4巡目 → 既存 RPC を CREATE OR REPLACE して MERGE INTO public.clubs（関数名も policy も不変）
#     「無いことの証明」をテキストで続ける限り、次の書き方が必ずある。
#     → **役割ごとに実際に作ろうとして、全部失敗することを実 DB で見る**。
#       これなら MERGE / COPY / trigger / 未知の書き方が**まとめて**閉じる。
#
#   前提: ローカル PostgreSQL に接続できること（psql）。CREATE DATABASE 権限が要る。
#   スキップ: psql 不在・サーバ未起動なら exit 0 で SKIP（CI/別環境を壊さない）。
#   実データ・実会員名簿は使わない（架空の「架空太郎」等のみ）。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_clubs_provision_test"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)

pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
assert_eq(){ if [ "$1" = "$2" ]; then ok "$3"; else ng "$3（期待 '$2' / 実測 '$1'）"; fi; }

if ! command -v psql >/dev/null 2>&1; then
  echo "CLUBS-PROVISION-DENIED: SKIP（psql が無い）"; exit 0; fi
if ! psql -X -q -c 'select 1' postgres >/dev/null 2>&1; then
  echo "CLUBS-PROVISION-DENIED: SKIP（PostgreSQL に接続できない）"; exit 0; fi

psql -X -q -c "drop database if exists $DB" postgres >/dev/null 2>&1
psql -X -q -c "create database $DB" postgres >/dev/null 2>&1 || {
  echo "CLUBS-PROVISION-DENIED: SKIP（CREATE DATABASE 権限が無い）"; exit 0; }
trap 'psql -X -q -c "drop database if exists $DB" postgres >/dev/null 2>&1' EXIT

# ---- auth シム + ロール（Supabase 互換・stagea_rls_pgtest.sh と同一）--------
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
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.email() to anon, authenticated;
SQL
if [ $? -ne 0 ]; then echo "CLUBS-PROVISION-DENIED: SKIP（auth シム作成に失敗）"; exit 0; fi
ok "auth シム（auth.uid() / auth.email() / anon / authenticated）を用意"

# ---- 全 migration を順に適用（1本でも落ちたら FAIL）--------------------------
applied=0
for f in $(ls "$MIG_DIR"/*.sql | sort); do
  if "${PSQL_BASE[@]}" -d "$DB" -f "$f" >/tmp/clubsprov_mig.log 2>&1; then
    applied=$((applied+1))
  else
    ng "migration 適用に失敗: $(basename "$f")"; sed -n '1,8p' /tmp/clubsprov_mig.log
    echo "CLUBS-PROVISION-DENIED: PASS=$pass FAIL=$fail"; exit 1
  fi
done
ok "全 migration（${applied}本）が実 PostgreSQL に適用できる"

# ---- 架空シード（superuser＝RLS 回避で投入）--------------------------------
CA='aaaaaaaa-0000-0000-0000-000000000001'
U_OWNER='11111111-0000-0000-0000-000000000001'
U_ADMIN='11111111-0000-0000-0000-000000000002'
U_ORG='11111111-0000-0000-0000-000000000003'
U_VIEWER='11111111-0000-0000-0000-000000000006'
U_STRANGER='33333333-0000-0000-0000-000000000002'
"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<SQL
insert into auth.users(id,email) values
 ('$U_OWNER','owner@example.test'),('$U_ADMIN','admin@example.test'),
 ('$U_ORG','org@example.test'),('$U_VIEWER','viewer@example.test'),
 ('$U_STRANGER','stranger@example.test');
insert into public.clubs(id,name) values ('$CA','架空将棋クラブA');
insert into public.organizers(club_id,user_id,email,role,status,display_name) values
 ('$CA','$U_OWNER','owner@example.test','owner','active','架空オーナー'),
 ('$CA','$U_ADMIN','admin@example.test','admin','active','架空アドミン'),
 ('$CA','$U_ORG','org@example.test','organizer','active','架空幹事'),
 ('$CA','$U_VIEWER','viewer@example.test','viewer','active','架空閲覧');
insert into public.members(member_id,club_id,name,yomi) values ('m1','$CA','架空太郎','きくうたろう');
SQL
ok "架空シード投入（club 1件・幹事4種・第三者1名）"

BASE_COUNT=$(psql -X -A -t -d "$DB" -c "select count(*) from public.clubs" 2>/dev/null | tail -n1)
assert_eq "$BASE_COUNT" "1" "初期状態の clubs は1件"

# try ROLE SUB "SQL" → "OK"（成功＝作れてしまった）/ "ERR"（拒否）
try(){
  local role="$1" sub="$2" sql="$3" sets=""
  [ -n "$sub" ] && sets="set request.jwt.claim.sub = '$sub';"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" \
      -c "begin; $sets set local role $role; $sql; rollback;" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
}
# try_count ROLE SUB "SQL" → 文が通ったとして、commit 後に clubs が増えたか（増分を返す）
try_count(){
  local role="$1" sub="$2" sql="$3" sets="" before after
  [ -n "$sub" ] && sets="set request.jwt.claim.sub = '$sub';"
  before=$(psql -X -A -t -d "$DB" -c "select count(*) from public.clubs" 2>/dev/null | tail -n1)
  psql -X -A -t -d "$DB" -c "$sets set local role $role; $sql" >/dev/null 2>&1
  after=$(psql -X -A -t -d "$DB" -c "select count(*) from public.clubs" 2>/dev/null | tail -n1)
  echo $((after - before))
}

echo "  --- clubs 作成の試行（実 PostgreSQL・全役割 × 全書き方）---"

# 役割 × 主体。anon は sub 無し。
ROLES="anon: authenticated:$U_OWNER authenticated:$U_ADMIN authenticated:$U_ORG authenticated:$U_VIEWER authenticated:$U_STRANGER"
LABELS="anon owner admin organizer viewer stranger"

i=0
for pair in $ROLES; do
  i=$((i+1))
  role="${pair%%:*}"; sub="${pair#*:}"
  label=$(echo "$LABELS" | cut -d' ' -f$i)

  # ① 素の INSERT
  assert_eq "$(try "$role" "$sub" "insert into public.clubs(name) values ('架空クラブX')")" "ERR" \
    "$label: INSERT で clubs を作れない"
  # ② INSERT ... SELECT（値をリテラルで書かない形）
  assert_eq "$(try "$role" "$sub" "insert into public.clubs(name) select '架空クラブY'")" "ERR" \
    "$label: INSERT..SELECT で clubs を作れない"
  # ③ upsert（PostgREST の .upsert() 相当。3巡目の指摘）
  assert_eq "$(try "$role" "$sub" "insert into public.clubs(id,name) values ('cccccccc-0000-0000-0000-000000000003','架空クラブZ') on conflict (id) do update set name=excluded.name")" "ERR" \
    "$label: upsert（ON CONFLICT）で clubs を作れない"
  # ④ MERGE（4巡目の指摘）
  assert_eq "$(try "$role" "$sub" "merge into public.clubs t using (select '架空クラブM'::text as name) s on (t.name = s.name) when not matched then insert (name) values (s.name)")" "ERR" \
    "$label: MERGE で clubs を作れない"
  # ⑤ COPY（4巡目の指摘）
  assert_eq "$(try "$role" "$sub" "copy public.clubs(name) from stdin")" "ERR" \
    "$label: COPY で clubs を作れない"
done

# ---- 特権 RPC を実際に呼んで、clubs が増えないことを見る --------------------
#   関数名の集合ではなく**実挙動**を見る（4巡目の指摘: 既存 RPC を CREATE OR REPLACE すれば名前は不変）。
echo "  --- SECURITY DEFINER RPC の実挙動 ---"
for pair in "authenticated:$U_STRANGER" "authenticated:$U_ORG" "authenticated:$U_OWNER" "anon:"; do
  role="${pair%%:*}"; sub="${pair#*:}"
  label="$role${sub:+/${sub##*-}}"
  d=$(try_count "$role" "$sub" "select public.claim_organizer_seat()")
  assert_eq "$d" "0" "$label: claim_organizer_seat() を呼んでも clubs は増えない"
done

# ---- trigger 経由（他テーブルへの書き込みが clubs を作らない）---------------
echo "  --- trigger 経由 ---"
d=$(try_count authenticated "$U_ORG" "insert into public.members(member_id,club_id,name,yomi) values ('m9','$CA','架空九郎','きくうくろう')")
assert_eq "$d" "0" "organizer: members に書いても clubs は増えない"
d=$(try_count authenticated "$U_ORG" "insert into public.tournaments(club_id,name,date,season) values ('$CA','架空月例X','2026-06-02','2026')")
assert_eq "$d" "0" "organizer: tournaments に書いても clubs は増えない"

# ---- policy の実態（insert/delete/all が無いこと）---------------------------
echo "  --- clubs の policy 実態 ---"
CMDS=$(psql -X -A -t -d "$DB" -c "select coalesce(string_agg(distinct cmd, ',' order by cmd), '') from pg_policies where schemaname='public' and tablename='clubs'" 2>/dev/null | tail -n1)
assert_eq "$CMDS" "SELECT,UPDATE" "clubs の policy は SELECT と UPDATE だけ（INSERT/DELETE/ALL が無い）"

# ---- 最終確認: clubs は増えていない -----------------------------------------
FINAL=$(psql -X -A -t -d "$DB" -c "select count(*) from public.clubs" 2>/dev/null | tail -n1)
assert_eq "$FINAL" "$BASE_COUNT" "全試行のあとも clubs は増えていない"

echo "=========================================="
echo "CLUBS-PROVISION-DENIED: PASS=$pass FAIL=$fail"
echo "=========================================="
[ "$fail" -eq 0 ] || exit 1
exit 0
