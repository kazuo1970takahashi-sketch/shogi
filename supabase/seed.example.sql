-- =============================================================================
-- Stage A ブートストラップ（ひな形）。最初のクラブ＋最初の owner 招待を作る。
--   ★ このファイルはひな形。実クラブ名・owner メールは **コミットしない**。
--   実行（Supabase SQL Editor もしくは service role 接続＝RLS 回避が必要）:
--     psql "$DB_URL" \
--       -v club_name="日本将棋連盟沼津支部" \
--       -v owner_email="owner@example.com" \
--       -f supabase/seed.example.sql
--   owner は「メール招待行（user_id NULL）」として作られ、本人が初回マジックリンクで
--   ログイン → claim_organizer_seat() で user_id が結びつき active owner になる。
-- =============================================================================
\set ON_ERROR_STOP on

-- 1) クラブ（冪等: 同名が無ければ作る）。
insert into public.clubs(name)
select :'club_name'
where not exists (select 1 from public.clubs where name = :'club_name');

-- 2) 最初の owner をメール招待（user_id NULL・active）。再実行時は owner/active に整える。
with c as (
  select id from public.clubs where name = :'club_name' order by created_at asc limit 1
)
insert into public.organizers(club_id, email, role, status, display_name)
select c.id, :'owner_email', 'owner', 'active', 'オーナー' from c
on conflict (club_id, lower(email))
do update set role = 'owner', status = 'active';
