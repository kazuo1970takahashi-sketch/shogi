#!/usr/bin/env bash
# =============================================================================
# DATA-PERSISTENCE-PHASE2 / Stage A — 実 PostgreSQL に対する RLS 検証
#   migrations を使い捨て DB に適用し、Supabase 互換の auth.uid() シムを与えて
#   「未ログイン / 別club / retired / suspended / members氏名 / admin限定 /
#    最後のadminガード / publishable単体拒否」を実データで実証する。
#
#   前提: ローカル PostgreSQL に接続できること（psql）。CREATE DATABASE 権限が要る。
#   接続: 既定は PG* 環境変数 / ローカル superuser。DB=shogi_stagea_test を作って消す。
#   スキップ: psql 不在・サーバ未起動なら exit 0 で SKIP（CI/別環境を壊さない）。
#
#   実データ・実会員名簿は使わない（架空の「架空太郎」等のみ）。
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../supabase/migrations"
DB="shogi_stagea_test"
PSQL_BASE=(psql -X -v ON_ERROR_STOP=1 -q)

pass=0; fail=0
ok(){ pass=$((pass+1)); [ -n "${VERBOSE:-}" ] && echo "  ✓ $1"; return 0; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; return 0; }
# probe ROLE SUB "SQL" → stdout（単一値）。SUB 空文字なら未ログイン（auth.uid()=null）。
probe(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  # SET の command tag が混じるので最終行（=SELECT の値）だけを返す。
  psql -X -A -t -d "$DB" -c "$setsub set role $role; $sql" 2>/dev/null | tail -n1
}
# probe_err ROLE SUB "SQL" → "OK" if statement succeeds, "ERR" if it raises (RLS/trigger拒否).
probe_err(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "begin; $setsub set role $role; $sql; rollback;" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
}
# probe_auth ROLE SUB EMAIL "SQL" → 値（sub と email 両クレームを立てる・claim 検証用）。
probe_auth(){
  local role="$1" sub="$2" email="$3" sql="$4" sets=""
  [ -n "$sub" ]   && sets="${sets}set request.jwt.claim.sub = '$sub';"
  [ -n "$email" ] && sets="${sets}set request.jwt.claim.email = '$email';"
  psql -X -A -t -d "$DB" -c "$sets set role $role; $sql" 2>/dev/null | tail -n1
}
# probe_rows ROLE SUB "UPDATE/DELETE 文" → RLS USING で実際に作用した行数（begin/rollback で副作用なし）。
#   UPDATE は WITH CHECK 違反でない限り raise せず「0 行に作用」で拒否されるため、件数で deny を実証する。
probe_rows(){
  local role="$1" sub="$2" sql="$3" setsub=""
  [ -n "$sub" ] && setsub="set request.jwt.claim.sub = '$sub';"
  # -q で command tag（BEGIN/SET/ROLLBACK）を抑止し、SELECT の件数だけを得る。
  psql -X -q -A -t -d "$DB" -c "begin; $setsub set role $role; with u as ($sql returning 1) select count(*) from u; rollback;" 2>/dev/null | tail -n1
}
# probe_err_su "SQL" → service role 相当（set role せず＝RLS バイパス）。RLS では止まらない経路で
#   トリガ（最後の admin ガード）だけが拒否するかを見る。begin/rollback で副作用を残さない。
probe_err_su(){
  local sql="$1"
  if psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "begin; $sql; rollback;" >/dev/null 2>&1; then
    echo "OK"; else echo "ERR"; fi
}
assert_eq(){ [ "$1" = "$2" ] && ok "$3 (=$1)" || ng "$3 (expected '$2' got '$1')"; }

# ---- 前提チェック（無ければ SKIP）----
if ! command -v psql >/dev/null 2>&1; then echo "  ⚠ psql 不在のため Stage A RLS pgtest を SKIP"; exit 0; fi
if ! psql -X -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "  ⚠ PostgreSQL サーバへ接続できないため Stage A RLS pgtest を SKIP"; exit 0; fi

# ---- 使い捨て DB を作り直す ----
psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
psql -X -d postgres -c "create database $DB" >/dev/null 2>&1 || { echo "  ⚠ test DB を作成できないため SKIP"; exit 0; }
cleanup(){ psql -X -d postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap cleanup EXIT

# ---- auth シム + ロール（Supabase 互換: auth.uid() は JWT sub GUC を読む）----
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

# ---- 本物の migrations を適用 ----
if ! "${PSQL_BASE[@]}" -d "$DB" -f "$MIG_DIR/20260620130000_stagea_schema.sql" >/tmp/stagea_mig1.log 2>&1; then
  echo "  ✗ schema migration 適用に失敗:"; cat /tmp/stagea_mig1.log; echo "  結果: PASS=0 FAIL=1"; exit 1; fi
if ! "${PSQL_BASE[@]}" -d "$DB" -f "$MIG_DIR/20260620130100_stagea_rls.sql" >/tmp/stagea_mig2.log 2>&1; then
  echo "  ✗ RLS migration 適用に失敗:"; cat /tmp/stagea_mig2.log; echo "  結果: PASS=0 FAIL=1"; exit 1; fi
if ! "${PSQL_BASE[@]}" -d "$DB" -f "$MIG_DIR/20260620130200_stagea_auth_claim.sql" >/tmp/stagea_mig3.log 2>&1; then
  echo "  ✗ claim migration 適用に失敗:"; cat /tmp/stagea_mig3.log; echo "  結果: PASS=0 FAIL=1"; exit 1; fi
ok "migrations（schema + RLS + claim）が実 PostgreSQL に適用できる"

# ---- 架空シード（superuser＝RLS 回避で投入）----
CA='aaaaaaaa-0000-0000-0000-000000000001'   # club A
CB='bbbbbbbb-0000-0000-0000-000000000002'   # club B
U_OWNER='11111111-0000-0000-0000-000000000001'
U_ADMIN='11111111-0000-0000-0000-000000000002'
U_ORG='11111111-0000-0000-0000-000000000003'
U_RET='11111111-0000-0000-0000-000000000004'
U_SUS='11111111-0000-0000-0000-000000000005'
U_VIEWER='11111111-0000-0000-0000-000000000006'    # viewer（rank0・閲覧のみ）
U_BOWNER='22222222-0000-0000-0000-000000000001'
U_NEW='33333333-0000-0000-0000-000000000001'      # メール招待される新規幹事
U_STRANGER='33333333-0000-0000-0000-000000000002' # 招待されていない第三者
"${PSQL_BASE[@]}" -d "$DB" >/dev/null 2>&1 <<SQL
insert into auth.users(id,email) values
 ('$U_OWNER','owner@example.test'),('$U_ADMIN','admin@example.test'),
 ('$U_ORG','org@example.test'),('$U_RET','ret@example.test'),
 ('$U_SUS','sus@example.test'),('$U_VIEWER','viewer@example.test'),
 ('$U_BOWNER','bowner@example.test'),
 ('$U_NEW','newinvite@example.test'),('$U_STRANGER','stranger@example.test');
insert into public.clubs(id,name) values ('$CA','架空将棋クラブA'),('$CB','架空将棋クラブB');
insert into public.organizers(club_id,user_id,email,role,status,display_name) values
 ('$CA','$U_OWNER','owner@example.test','owner','active','架空オーナー'),
 ('$CA','$U_ADMIN','admin@example.test','admin','active','架空アドミン'),
 ('$CA','$U_ORG','org@example.test','organizer','active','架空幹事'),
 ('$CA','$U_RET','ret@example.test','organizer','retired','架空退任'),
 ('$CA','$U_SUS','sus@example.test','organizer','suspended','架空停止'),
 ('$CA','$U_VIEWER','viewer@example.test','viewer','active','架空閲覧'),
 ('$CB','$U_BOWNER','bowner@example.test','owner','active','架空Bオーナー');
insert into public.members(member_id,club_id,name,yomi) values
 ('m1','$CA','架空太郎','きくうたろう'),('m2','$CA','架空次郎','きくうじろう'),
 ('mb1','$CB','架空花子','きくうはなこ');
insert into public.players(club_id,member_id) values ('$CA','m1'),('$CA','m2'),('$CB','mb1');
insert into public.tournaments(club_id,name,date,season) values
 ('$CA','架空月例A','2026-06-01','2026'),('$CB','架空月例B','2026-06-01','2026');
SQL
ok "架空シード投入（club A/B・幹事各種・会員名簿）"

# entries の越境テスト用に tournament/player の UUID を取得（superuser＝RLS バイパスで読む）。
TA_ID=$(psql -X -A -t -d "$DB" -c "select id from public.tournaments where club_id='$CA' limit 1" 2>/dev/null | tail -n1)
TB_ID=$(psql -X -A -t -d "$DB" -c "select id from public.tournaments where club_id='$CB' limit 1" 2>/dev/null | tail -n1)
PA_ID=$(psql -X -A -t -d "$DB" -c "select id from public.players where club_id='$CA' limit 1" 2>/dev/null | tail -n1)
PB_ID=$(psql -X -A -t -d "$DB" -c "select id from public.players where club_id='$CB' limit 1" 2>/dev/null | tail -n1)
# viewer の entries UPDATE deny 用に、club A の「もう1人」の player を取得（PA_ID と別個体）。
#   committed entry を (TA_ID, PA2_ID) で作ると unique(tournament_id, player_id) が
#   P1-② の (TA_ID, PA_ID) と衝突しない。
PA2_ID=$(psql -X -A -t -d "$DB" -c "select id from public.players where club_id='$CA' and id<>'$PA_ID' limit 1" 2>/dev/null | tail -n1)

echo "  --- RLS 判定（実 PostgreSQL）---"
# 1. 未ログイン（anon）は何も読めない。特に members（氏名）。
assert_eq "$(probe anon '' 'select count(*) from public.members')"     "0" "anon: members（氏名）を読めない"
assert_eq "$(probe anon '' 'select count(*) from public.clubs')"       "0" "anon: clubs を読めない"
assert_eq "$(probe anon '' 'select count(*) from public.organizers')"  "0" "anon: organizers を読めない"
assert_eq "$(probe anon '' 'select count(*) from public.players')"     "0" "anon: players を読めない"
assert_eq "$(probe anon '' 'select count(*) from public.tournaments')" "0" "anon: tournaments を読めない"
assert_eq "$(probe anon '' 'select count(*) from public.entries')"     "0" "anon: entries を読めない"
# publishable 単体（anon）で書けない。
assert_eq "$(probe_err anon '' "insert into public.members(member_id,club_id,name) values ('x','$CA','x')")" "ERR" "anon: members へ INSERT できない（publishable 単体拒否）"

# 2. active owner（club A）は自 club を読める・氏名も読める・別 club は読めない。
assert_eq "$(probe authenticated "$U_OWNER" 'select count(*) from public.members')" "2" "owner(A): 自 club の members 氏名を2件読める"
assert_eq "$(probe authenticated "$U_OWNER" 'select count(*) from public.clubs')"   "1" "owner(A): clubs は自 club の1件のみ"
assert_eq "$(probe authenticated "$U_OWNER" "select count(*) from public.members where club_id='$CB'")" "0" "owner(A): 別 club(B) の氏名は読めない"
assert_eq "$(probe authenticated "$U_OWNER" 'select count(*) from public.tournaments')" "1" "owner(A): tournaments は自 club の1件のみ"

# 3. active organizer（club A・admin でない）は氏名を読めるが organizers を追加できない。
assert_eq "$(probe authenticated "$U_ORG" 'select count(*) from public.members')" "2" "organizer(A): members 氏名を読める（active organizer 以上）"
assert_eq "$(probe_err authenticated "$U_ORG" "insert into public.organizers(club_id,user_id,role) values ('$CA','$U_OWNER','organizer')")" "ERR" "organizer(A): organizers を追加できない（owner/admin 限定）"

# 4. active admin（club A）は organizers を追加できる。
assert_eq "$(probe_err authenticated "$U_ADMIN" "insert into public.organizers(club_id,user_id,email,role,status) values ('$CA','$U_BOWNER','adminadd@example.test','organizer','active')")" "OK" "admin(A): organizers を追加できる（owner/admin）"

# 5. retired / suspended は読めない。
assert_eq "$(probe authenticated "$U_RET" 'select count(*) from public.members')" "0" "retired(A): members を読めない"
assert_eq "$(probe authenticated "$U_SUS" 'select count(*) from public.members')" "0" "suspended(A): members を読めない"

# 6. 別 club のユーザーは自 club のみ・A を覗けない。
assert_eq "$(probe authenticated "$U_BOWNER" 'select count(*) from public.members')" "1" "owner(B): 自 club(B) の members は1件読める"
assert_eq "$(probe authenticated "$U_BOWNER" "select count(*) from public.members where club_id='$CA'")" "0" "owner(B): club A の氏名は読めない"

# 7. 自 club 外への書き込み（club_id 偽装）は WITH CHECK で拒否。
assert_eq "$(probe_err authenticated "$U_OWNER" "insert into public.tournaments(club_id,name,date,season) values ('$CB','不正','2026-06-01','2026')")" "ERR" "owner(A): 別 club(B) への tournaments INSERT は拒否（WITH CHECK）"

# 8. 最後の active owner/admin を消せないガード（club B はオーナー1人）。
assert_eq "$(probe_err authenticated "$U_BOWNER" "update public.organizers set status='retired' where club_id='$CB' and user_id='$U_BOWNER'")" "ERR" "最後の owner/admin（club B）を retired にできない（ガード）"
# club A は owner+admin の2人 → owner を retired にできる（admin が残る）。
assert_eq "$(probe_err authenticated "$U_ADMIN" "update public.organizers set status='retired' where club_id='$CA' and user_id='$U_OWNER'")" "OK" "club A は owner を retired 可（active admin が残る）"

# 9. 招待 → 初回ログインで claim（メール一致）→ 自 club を読めるようになる。
echo "  --- 招待 / claim フロー ---"
# admin が新規メールを招待（user_id NULL の active 行を作る）。
assert_eq "$(probe_err authenticated "$U_ADMIN" "insert into public.organizers(club_id,email,role,status) values ('$CA','newinvite@example.test','organizer','active')")" "OK" "admin(A): 新規メールを招待できる（user_id NULL 行）"
# 招待行を実際に投入（probe_err は rollback するため superuser で確定）。
psql -X -q -d "$DB" -c "insert into public.organizers(club_id,email,role,status) values ('$CA','newinvite@example.test','organizer','active')" >/dev/null 2>&1
# 招待前: 新規ユーザーはまだ何も読めない（未claim）。
assert_eq "$(probe_auth authenticated "$U_NEW" "newinvite@example.test" 'select count(*) from public.members')" "0" "招待者: claim 前は members を読めない"
# claim 実行（メール一致）→ 所属1件が返る。
assert_eq "$(probe_auth authenticated "$U_NEW" "newinvite@example.test" 'select jsonb_array_length(public.claim_organizer_seat())')" "1" "招待者: claim_organizer_seat() で所属1件を取得（user_id 結合）"
# claim 後: members（氏名）を読める。
assert_eq "$(probe_auth authenticated "$U_NEW" "newinvite@example.test" 'select count(*) from public.members')" "2" "招待者: claim 後は members 氏名を読める"
# 未登録メール（第三者）は claim しても空配列＝「幹事登録がありません」。
assert_eq "$(probe_auth authenticated "$U_STRANGER" "stranger@example.test" 'select jsonb_array_length(public.claim_organizer_seat())')" "0" "未登録メール: claim は空（案内文を表示する側）"
assert_eq "$(probe_auth authenticated "$U_STRANGER" "stranger@example.test" 'select count(*) from public.members')" "0" "未登録メール: members を読めない"

# =============================================================================
# P1-① viewer(rank0) ガード（Codex BLOCK 対応）: 氏名 read 不可・一般データ write 不可。
#   viewer は招待 UI（app/auth.js）から作られ得る役割。RLS が rank>=1 を要求して弾く。
# =============================================================================
echo "  --- P1-①: viewer(rank0) は氏名を読めず一般データに書けない（read-only）---"
# players INSERT を「制約衝突でなく RLS で」拒否することを実証するため、club A に
# 「会員だが未 player」の m3 を1名足す（既存の members 件数アサートは全て評価済みの位置）。
# こうすると viewer の players INSERT は unique/FK では落ちず、RLS WITH CHECK だけが拒否する。
psql -X -q -d "$DB" -c "insert into public.members(member_id,club_id,name) values ('m3','$CA','架空三郎')" >/dev/null 2>&1
# 非機微データ（clubs/tournaments）は viewer も読める（rank>=0）。
assert_eq "$(probe authenticated "$U_VIEWER" 'select count(*) from public.clubs')"       "1" "viewer(A): clubs は読める（rank>=0）"
assert_eq "$(probe authenticated "$U_VIEWER" 'select count(*) from public.tournaments')" "1" "viewer(A): tournaments は読める（rank>=0）"
# ★核心: viewer は members（氏名）を読めない（organizer 以上のみ）。
assert_eq "$(probe authenticated "$U_VIEWER" 'select count(*) from public.members')"     "0" "viewer(A): members（氏名）を読めない（organizer 以上のみ）"
# INSERT は WITH CHECK で raise（RLS は unique/FK より先に拒否＝制約衝突でなく RLS 拒否を実証）。
assert_eq "$(probe_err authenticated "$U_VIEWER" "insert into public.members(member_id,club_id,name) values ('vx','$CA','架空ビュー')")"                 "ERR" "viewer(A): members へ INSERT できない"
assert_eq "$(probe_err authenticated "$U_VIEWER" "insert into public.players(club_id,member_id) values ('$CA','m3')")"                                   "ERR" "viewer(A): players へ INSERT できない（会員 m3 は valid・RLS のみが拒否）"
assert_eq "$(probe_err authenticated "$U_VIEWER" "insert into public.tournaments(club_id,name,date,season) values ('$CA','架空V','2026-06-01','2026')")" "ERR" "viewer(A): tournaments へ INSERT できない"
assert_eq "$(probe_err authenticated "$U_VIEWER" "insert into public.entries(club_id,tournament_id,player_id,class) values ('$CA','$TA_ID','$PA_ID','A')")" "ERR" "viewer(A): entries へ INSERT できない"
# UPDATE は RLS USING で 0 行に作用（＝書けない）。organizer は作用する（0/1 の対照で test の有意性を担保）。
assert_eq "$(probe_rows authenticated "$U_VIEWER" "update public.members set yomi='zz' where club_id='$CA'")"            "0" "viewer(A): members UPDATE は0行（氏名を書けない）"
assert_eq "$(probe_rows authenticated "$U_VIEWER" "update public.players set branch_code='vx' where club_id='$CA'")"     "0" "viewer(A): players UPDATE は0行（書込不可）"
assert_eq "$(probe_rows authenticated "$U_VIEWER" "update public.tournaments set venue_code='vx' where club_id='$CA'")"  "0" "viewer(A): tournaments UPDATE は0行（書込不可）"
assert_eq "$(probe_rows authenticated "$U_ORG"    "update public.tournaments set venue_code='vx' where club_id='$CA'")"  "1" "organizer(A): tournaments UPDATE は1行（対照・書込可）"
# entries も viewer は UPDATE できない（成績の改ざん不可）。INSERT deny だけでなく UPDATE deny も実証する。
#   委託先 RLS は entries_update を app_is_active_organizer に付け替え済み（rank>=1 が条件）。
#   probe_rows は USING で実際に作用した行数を返すため、committed entry を1件用意して
#   viewer=0 行 / organizer=1 行 の対照で deny の有意性（red/green）を担保する。
#   行は (TA_ID, PA2_ID) で作り、P1-② の (TA_ID, PA_ID) と unique 衝突しないようにする。
psql -X -q -d "$DB" -c "insert into public.entries(club_id,tournament_id,player_id,class) values ('$CA','$TA_ID','$PA2_ID','A')" >/dev/null 2>&1
assert_eq "$(probe_rows authenticated "$U_VIEWER" "update public.entries set wins=1 where club_id='$CA'")"               "0" "viewer(A): entries UPDATE は0行（成績を書けない）"
assert_eq "$(probe_rows authenticated "$U_ORG"    "update public.entries set wins=1 where club_id='$CA'")"               "1" "organizer(A): entries UPDATE は1行（対照・書込可）"

# =============================================================================
# P1-② entries の club 越境参照ガード（複合 FK）。club_id=A のまま別 club(B) の
#   tournament/player UUID を参照する entry を作れない／付け替えできない。
# =============================================================================
echo "  --- P1-②: entries の club 越境参照（別 club の tournament/player）を拒否 ---"
# 正常: 自 club の tournament+player を参照する entry は作れる（対照・複合 FK を通る）。
assert_eq "$(probe_err authenticated "$U_OWNER" "insert into public.entries(club_id,tournament_id,player_id,class) values ('$CA','$TA_ID','$PA_ID','A')")" "OK"  "owner(A): 自 club の tournament+player を参照する entry は作れる（対照）"
# 越境: 別 club(B) の tournament を参照 → 複合 FK 違反で拒否。
assert_eq "$(probe_err authenticated "$U_OWNER" "insert into public.entries(club_id,tournament_id,player_id,class) values ('$CA','$TB_ID','$PA_ID','A')")" "ERR" "owner(A): 別 club(B) の tournament を参照する entry は拒否（複合 FK）"
# 越境: 別 club(B) の player を参照 → 複合 FK 違反で拒否。
assert_eq "$(probe_err authenticated "$U_OWNER" "insert into public.entries(club_id,tournament_id,player_id,class) values ('$CA','$TA_ID','$PB_ID','A')")" "ERR" "owner(A): 別 club(B) の player を参照する entry は拒否（複合 FK）"
# UPDATE でも越境参照に付け替えできない（正常 entry → 別 club の player へ → 拒否）。
assert_eq "$(probe_err authenticated "$U_OWNER" "insert into public.entries(club_id,tournament_id,player_id,class) values ('$CA','$TA_ID','$PA_ID','A'); update public.entries set player_id='$PB_ID' where club_id='$CA' and tournament_id='$TA_ID'")" "ERR" "owner(A): entry を別 club の player へ UPDATE できない（複合 FK）"

# =============================================================================
# P1-③ 最後の admin の club_id 変更ガード。admin を別 club へ移すと旧 club が 0 admin に
#   なり得る経路を、ガードトリガが club_id 変更も「admin 喪失」とみなして阻止する。
#   service role 相当（RLS バイパス）で実行し、トリガ単体の判定を直接実証する。
# =============================================================================
echo "  --- P1-③: 最後の admin の club_id 変更（別 club へ移動）を拒否 ---"
# club B は active owner 1人だけ。B の最後の owner を club A へ移す → 旧 club B が 0 admin → トリガで拒否。
assert_eq "$(probe_err_su "update public.organizers set club_id='$CA' where club_id='$CB' and user_id='$U_BOWNER'")" "ERR" "最後の owner(B) を別 club へ移すと旧 club が 0 admin → トリガで拒否"
# 拒否されたので旧 club(B) の active owner/admin は1人のまま（実体は変わっていない）。
assert_eq "$(psql -X -A -t -d "$DB" -c "select count(*) from public.organizers where club_id='$CB' and status='active' and role in ('owner','admin')" 2>/dev/null | tail -n1)" "1" "club B の active owner/admin は1人のまま（移動が拒否された）"
# 対照: club A は owner+admin の2人 → admin を別 club へ移しても旧 club A に owner が残る → 許可。
assert_eq "$(probe_err_su "update public.organizers set club_id='$CB' where club_id='$CA' and user_id='$U_ADMIN'")" "OK" "club A の admin を別 club へ移せる（旧 club A に owner が残る・対照）"

echo "  Stage A RLS pgtest: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] || exit 1
