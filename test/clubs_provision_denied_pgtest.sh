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
BASE_ORG=$(psql -X -A -t -d "$DB" -c "select count(*) from public.organizers" 2>/dev/null | tail -n1)
assert_eq "$BASE_ORG" "4" "初期状態の organizers は4件（owner/admin/organizer/viewer）"

# try ROLE SUB "SQL" → "OK"（成功＝作れてしまった）/ "ERR"（拒否）
try(){
  local role="$1" sub="$2" sql="$3" sets=""
  [ -n "$sub" ] && sets="set request.jwt.claim.sub = '$sub';"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" \
      -c "begin; $sets set local role $role; $sql; rollback;" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
}
# ★ Codex P1 (r3800929832): clubs の件数だけでは「行を増やさず既存クラブへの所属だけ付与する」
#   provisioning を見逃す（その利用者はクラウド機能を使えてしまい、本文の「送信・取得・配信は
#   止まります」が嘘になる）。**organizers の所属集合**も併せて固定する。
snapshot(){ psql -X -A -t -d "$DB" -c "
  select (select count(*) from public.clubs) || '|' ||
         coalesce((select string_agg(club_id::text||':'||user_id::text||':'||role||':'||status, ',' order by club_id::text||user_id::text)
                     from public.organizers), '')" 2>/dev/null | tail -n1; }

# try_delta ROLE SUB "SQL" → "same"（clubs も organizers も不変）/ 変化の中身
try_delta(){
  local role="$1" sub="$2" sql="$3" sets="" before after
  [ -n "$sub" ] && sets="set request.jwt.claim.sub = '$sub';"
  before="$(snapshot)"
  psql -X -A -t -d "$DB" -c "$sets set local role $role; $sql" >/dev/null 2>&1
  after="$(snapshot)"
  if [ "$before" = "$after" ]; then echo "same"; else echo "CHANGED"; fi
}
# try_err ROLE SUB "SQL" → "OK"（例外なく完了）/ "ERR"
try_err(){
  local role="$1" sub="$2" sql="$3" sets=""
  [ -n "$sub" ] && sets="set request.jwt.claim.sub = '$sub';"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "$sets set local role $role; $sql" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
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

# ---- 特権 RPC を実際に呼んで、clubs も organizers も変わらないことを見る -------
#   ★ Codex P1 (r3800308119): 1本だけ呼んでいては、別の RPC を差し替える変異が素通りする。
#     → pg_proc から**クライアント到達可能な SECURITY DEFINER 関数を列挙して全部呼ぶ**。
#   ★ Codex P1 (r3800929815): 役割も全部使う（viewer 固有の分岐から作れる実装を見逃さない）。
#   ★ Codex P1 (r3800929810): 全 NULL 引数だと本体の成功分岐へ届かず例外で終わる RPC がある。
#     → 引数を要する live 系は **有効な slug を先に作ってから**呼び、成功経路を通す。
#       さらに「何本が例外なく完了したか」を数え、0 本なら検査が空回りとして FAIL にする。
echo "  --- クライアント到達可能な SECURITY DEFINER RPC の実挙動（全数 × 全役割）---"
RPC_LIST=$(psql -X -A -t -d "$DB" -c "
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   order by 1" 2>/dev/null)
RPC_COUNT=$(echo "$RPC_LIST" | grep -c .)
if [ "$RPC_COUNT" -lt 1 ]; then
  ng "SECURITY DEFINER RPC を1本も列挙できない（列挙が壊れている＝検査が空回り）"
else
  ok "クライアント到達可能な SECURITY DEFINER RPC を ${RPC_COUNT} 本列挙"
fi

# 全役割（anon + 5種）
ALL_ROLES="anon: authenticated:$U_OWNER authenticated:$U_ADMIN authenticated:$U_ORG authenticated:$U_VIEWER authenticated:$U_STRANGER"

call_rpc(){ # $1=fnsig → NULL 引数の呼び出し文
  local sig="$1" fname args nulls
  fname="${sig%%(*}"; args="${sig#*(}"; args="${args%)}"
  if [ -z "$args" ]; then nulls=""; else
    nulls=$(echo "$args" | awk -F',' '{for(i=1;i<=NF;i++){printf (i>1?",null":"null")}}'); fi
  echo "select public.$fname($nulls)"
}

: > /tmp/clubsprov_rpc.txt
RPC_RAN=0
echo "$RPC_LIST" | while IFS= read -r sig; do
  [ -z "$sig" ] && continue
  for pair in $ALL_ROLES; do
    role="${pair%%:*}"; sub="${pair#*:}"
    d=$(try_delta "$role" "$sub" "$(call_rpc "$sig")")
    e=$(try_err   "$role" "$sub" "$(call_rpc "$sig")")
    if [ "$d" = "same" ]; then echo "PASS ${sig%%(*} / $role/${sub##*-} exec=$e"
    else echo "FAIL ${sig%%(*} / $role/${sub##*-} で clubs か organizers が変化した"; fi
  done
done >> /tmp/clubsprov_rpc.txt 2>&1

# ★ 成功経路を通す: organizer として live セッションを作り、有効な slug で引数つき RPC を呼ぶ。
SLUG=$(psql -X -A -t -d "$DB" -c "
  set request.jwt.claim.sub = '$U_ORG'; set local role authenticated;
  select public.start_live_session()" 2>/dev/null | tail -n1)
if [ -n "$SLUG" ]; then
  ok "有効な live slug を organizer として払い出せた（引数つき RPC の成功経路を通す準備）: $SLUG"
  for pair in $ALL_ROLES; do
    role="${pair%%:*}"; sub="${pair#*:}"
    for stmt in \
      "select public.publish_live_snapshot('$SLUG', '{\"k\":1}'::jsonb)" \
      "select public.get_live_snapshot('$SLUG')" \
      "select public.live_slug_is_public('$SLUG')" \
      "select public.stop_live_session('$SLUG')"; do
      d=$(try_delta "$role" "$sub" "$stmt")
      e=$(try_err   "$role" "$sub" "$stmt")
      if [ "$d" = "same" ]; then echo "PASS(valid-args) ${stmt:15:28} / $role exec=$e"
      else echo "FAIL(valid-args) ${stmt:15:28} / $role で clubs か organizers が変化した"; fi
    done
  done >> /tmp/clubsprov_rpc.txt 2>&1
else
  ng "live slug を払い出せない（引数つき RPC の成功経路を通せていない＝検査が空回りしている疑い）"
fi

RPC_OK=$(grep -c '^PASS' /tmp/clubsprov_rpc.txt)
RPC_NG=$(grep -c '^FAIL' /tmp/clubsprov_rpc.txt)
RPC_EXEC_OK=$(grep -c 'exec=OK' /tmp/clubsprov_rpc.txt)
if [ "$RPC_NG" -eq 0 ]; then
  ok "全 SECURITY DEFINER RPC × 全役割（${RPC_OK}通り）で clubs も organizers も変化しない"
else
  ng "RPC 経由で clubs か organizers が変化した（${RPC_NG}件）:"; grep '^FAIL' /tmp/clubsprov_rpc.txt | sed 's/^/      /'
fi
# ★ 空回り検出: 1本も例外なく完了していないなら、本体に到達できていない＝この節は無意味。
if [ "$RPC_EXEC_OK" -ge 1 ]; then
  ok "うち ${RPC_EXEC_OK} 通りは例外なく本体まで実行できている（成功経路に到達している証拠）"
else
  ng "例外なく完了した呼び出しが0通り＝本体に到達していない（検査が空回りしている）"
fi
[ -n "${VERBOSE:-}" ] && sed -n '1,300p' /tmp/clubsprov_rpc.txt | sed 's/^/      /'

# ---- trigger 経由（実在の trigger を実際に発火させる）------------------------
#   ★ Codex P1 (r3800929838): members / tournaments の updated_at trigger は **BEFORE UPDATE** なので、
#     INSERT だけでは既存 trigger が1本も発火しない＝この節は何も検査していなかった。
#     → アプリが実際に行う **UPDATE**（organizers の更新・members/tournaments の upsert の UPDATE 分岐）
#       を実行してから、clubs と organizers の集合が不変であることを見る。
echo "  --- trigger 経由（実在の BEFORE UPDATE を発火させる）---"
TRG_BEFORE=$(psql -X -A -t -d "$DB" -c "
  select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and not t.tgisinternal" 2>/dev/null | tail -n1)
ok "public スキーマの trigger を ${TRG_BEFORE} 本認識"

d=$(try_delta authenticated "$U_ORG" "update public.members set name='架空太郎(改)' where member_id='m1' and club_id='$CA'")
assert_eq "$d" "same" "organizer: members を UPDATE（updated_at trigger 発火）しても clubs/organizers は不変"
d=$(try_delta authenticated "$U_ORG" "update public.tournaments set name='架空月例A(改)' where club_id='$CA'")
assert_eq "$d" "same" "organizer: tournaments を UPDATE しても clubs/organizers は不変"
d=$(try_delta authenticated "$U_ADMIN" "update public.organizers set display_name='架空幹事(改)' where club_id='$CA' and user_id='$U_ORG'")
assert_eq "$d" "same" "admin: organizers を UPDATE（prevent_last_admin_removal 系を通す）しても集合は不変"
d=$(try_delta authenticated "$U_ORG" "insert into public.members(member_id,club_id,name,yomi) values ('m1','$CA','架空太郎(upsert)','きくうたろう') on conflict (club_id,member_id) do update set name=excluded.name")
assert_eq "$d" "same" "organizer: members の upsert（UPDATE 分岐）でも clubs/organizers は不変"
d=$(try_delta authenticated "$U_ORG" "insert into public.members(member_id,club_id,name,yomi) values ('m77','$CA','架空七郎','きくうしちろう')")
assert_eq "$d" "same" "organizer: members を INSERT しても clubs/organizers は不変"

# ---- policy の実態（insert/delete/all が無いこと）---------------------------
echo "  --- clubs の policy 実態 ---"
CMDS=$(psql -X -A -t -d "$DB" -c "select coalesce(string_agg(distinct cmd, ',' order by cmd), '') from pg_policies where schemaname='public' and tablename='clubs'" 2>/dev/null | tail -n1)
assert_eq "$CMDS" "SELECT,UPDATE" "clubs の policy は SELECT と UPDATE だけ（INSERT/DELETE/ALL が無い）"

# ---- 最終確認: clubs は増えていない -----------------------------------------
FINAL=$(psql -X -A -t -d "$DB" -c "select count(*) from public.clubs" 2>/dev/null | tail -n1)
assert_eq "$FINAL" "$BASE_COUNT" "全試行のあとも clubs は増えていない"
FINAL_ORG=$(psql -X -A -t -d "$DB" -c "select count(*) from public.organizers" 2>/dev/null | tail -n1)
assert_eq "$FINAL_ORG" "$BASE_ORG" "全試行のあとも organizers の所属は増えていない"

echo "=========================================="
echo "CLUBS-PROVISION-DENIED: PASS=$pass FAIL=$fail"
echo "=========================================="
[ "$fail" -eq 0 ] || exit 1
exit 0
