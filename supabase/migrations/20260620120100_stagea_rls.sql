-- =============================================================================
-- DATA-PERSISTENCE-PHASE2-STAGE-A / A2 RLS（行レベルセキュリティ・本丸）
-- 正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md（更新3 RLS 最低ライン）
-- 設計: docs/specs/20260620_data_persistence_phase2_stagea_design.md §3
--
-- 保証（最低ライン）:
--   - 未ログインは全拒否（publishable key 単体＝anon ロールでは何も開けない）。
--   - active な幹事だけが自分の club_id のデータを読める（suspended/retired/別club は不可）。
--   - 氏名(members)は active organizer 以上（rank>=organizer）のみ read 可。
--   - organizers の追加(INSERT)・停止/退任/ロール変更(UPDATE)は owner/admin(rank>=admin)のみ。
--   - owner/admin を常に1人以上残す（最後の1人を消せない＝トリガで横断不変条件を守る）。
--
-- 再帰回避: ポリシーは organizers を直接サブクエリせず、SECURITY DEFINER ヘルパ（RLS バイパス）
--   経由で「caller 自身の所属・ランク」だけを取得する。これで organizers 自身のポリシー評価が
--   無限再帰しない。ヘルパは search_path 固定・caller の自情報のみ返す（他者データを漏らさない）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ヘルパ関数（SECURITY DEFINER・caller の自情報のみ）
-- -----------------------------------------------------------------------------

-- role → ランク（owner=3 / admin=2 / organizer=1 / viewer=0 / それ以外=-1）
create or replace function public.app_role_rank(p_role text)
returns int
language sql
immutable
as $$
  select case p_role
    when 'owner'     then 3
    when 'admin'     then 2
    when 'organizer' then 1
    when 'viewer'    then 0
    else -1
  end;
$$;

-- caller が active な幹事か（未ログイン=auth.uid() null → false）
create or replace function public.app_is_active_organizer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizers o
    where o.user_id = auth.uid()
      and o.status = 'active'
  );
$$;

-- caller の club_id（active のときのみ・それ以外 null）
create or replace function public.app_my_club_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.club_id
  from public.organizers o
  where o.user_id = auth.uid()
    and o.status = 'active'
  limit 1;
$$;

-- caller の権限ランク（active のときのみ・それ以外 -1）
create or replace function public.app_my_org_rank()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.app_role_rank(o.role)
       from public.organizers o
      where o.user_id = auth.uid()
        and o.status = 'active'
      limit 1),
    -1);
$$;

-- ヘルパは caller 自身の所属/ランクのみ返す（他者データ非漏洩）。policy 評価で anon/authenticated が呼ぶ。
grant execute on function public.app_role_rank(text)        to anon, authenticated;
grant execute on function public.app_is_active_organizer()  to anon, authenticated;
grant execute on function public.app_my_club_id()           to anon, authenticated;
grant execute on function public.app_my_org_rank()          to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 最後の owner/admin ガード（横断不変条件・トリガ）
--   UPDATE で active owner/admin の座を失う / DELETE で消える場合、同 club に他の active
--   owner/admin が居なければ raise。SECURITY DEFINER で全行を数える（RLS バイパス）。
-- -----------------------------------------------------------------------------
create or replace function public.app_guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  -- 変更後も active owner/admin（同 club）のままなら検査不要（UPDATE）
  if tg_op = 'UPDATE'
     and new.status = 'active'
     and new.role in ('owner','admin')
     and new.club_id = old.club_id then
    return new;
  end if;
  -- old が active owner/admin でなければ「最後の1人」を失う事象ではない
  if not (old.status = 'active' and old.role in ('owner','admin')) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- 同 club の他の active owner/admin を数える（当該行は除外）
  select count(*) into v_remaining
  from public.organizers o
  where o.club_id = old.club_id
    and o.id <> old.id
    and o.status = 'active'
    and o.role in ('owner','admin');
  if v_remaining < 1 then
    raise exception 'last active owner/admin cannot be removed/demoted/suspended (club_id=%)', old.club_id
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_organizers_guard_last_admin on public.organizers;
create trigger trg_organizers_guard_last_admin
  before update or delete on public.organizers
  for each row execute function public.app_guard_last_admin();

-- -----------------------------------------------------------------------------
-- RLS 有効化（全テーブル）＋ deny-by-default（permissive policy のみ追加）
-- -----------------------------------------------------------------------------
alter table public.clubs       enable row level security;
alter table public.organizers  enable row level security;
alter table public.members     enable row level security;
alter table public.players     enable row level security;
alter table public.tournaments enable row level security;
alter table public.entries     enable row level security;

-- 強制（テーブル所有者にも RLS を効かせる。definer 関数経由の運用を明示）
alter table public.clubs       force row level security;
alter table public.organizers  force row level security;
alter table public.members     force row level security;
alter table public.players     force row level security;
alter table public.tournaments force row level security;
alter table public.entries     force row level security;

-- テーブルアクセスは authenticated のみに付与（RLS が更に行/操作を絞る）。anon には付与しない。
grant select, insert, update, delete
  on public.clubs, public.organizers, public.members,
     public.players, public.tournaments, public.entries
  to authenticated;
revoke all
  on public.clubs, public.organizers, public.members,
     public.players, public.tournaments, public.entries
  from anon;

-- =============================================================================
-- clubs: active 幹事は自 club を read。改名(UPDATE)は owner/admin。作成/削除は RLS 不許可
--   （bootstrap は service role / SQL editor で・README 参照）。
-- =============================================================================
create policy clubs_select_active_same_club on public.clubs
  for select to authenticated
  using (id = public.app_my_club_id() and public.app_is_active_organizer());

create policy clubs_update_admin on public.clubs
  for update to authenticated
  using (id = public.app_my_club_id() and public.app_my_org_rank() >= 2)
  with check (id = public.app_my_club_id() and public.app_my_org_rank() >= 2);

-- =============================================================================
-- organizers: 自 club の active 幹事が roster を read。追加/変更は owner/admin。
--   DELETE は不許可（消さず status=suspended/retired にする＝更新3 方針）。
--   ロール昇格防止: 付与/変更するロールは自分のランク以下（admin は owner を作れない）。
-- =============================================================================
create policy organizers_select_same_club on public.organizers
  for select to authenticated
  using (club_id = public.app_my_club_id() and public.app_is_active_organizer());

create policy organizers_insert_admin on public.organizers
  for insert to authenticated
  with check (
    club_id = public.app_my_club_id()
    and public.app_my_org_rank() >= 2
    and public.app_role_rank(role) <= public.app_my_org_rank()
  );

create policy organizers_update_admin on public.organizers
  for update to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 2)
  with check (
    club_id = public.app_my_club_id()
    and public.app_my_org_rank() >= 2
    and public.app_role_rank(role) <= public.app_my_org_rank()
  );
-- DELETE policy なし＝拒否（最後の admin ガードトリガと併せ二重に保護）。

-- =============================================================================
-- members（氏名・最重要機微）: read は organizer 以上(rank>=1)・active・同 club のみ。
--   viewer・未ログイン・retired・別 club は氏名を読めない。書込も organizer 以上。
-- =============================================================================
create policy members_select_organizer_up on public.members
  for select to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);

create policy members_insert_organizer_up on public.members
  for insert to authenticated
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);

create policy members_update_organizer_up on public.members
  for update to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1)
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);

create policy members_delete_admin on public.members
  for delete to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 2);

-- =============================================================================
-- players / tournaments / entries（氏名なしの一般データ）:
--   read は active 幹事(rank>=0)・同 club。書込は organizer 以上(rank>=1)・同 club。
-- =============================================================================
-- players
create policy players_select_active_same_club on public.players
  for select to authenticated
  using (club_id = public.app_my_club_id() and public.app_is_active_organizer());
create policy players_write_organizer_up_ins on public.players
  for insert to authenticated
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);
create policy players_write_organizer_up_upd on public.players
  for update to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1)
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);
create policy players_write_organizer_up_del on public.players
  for delete to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);

-- tournaments
create policy tournaments_select_active_same_club on public.tournaments
  for select to authenticated
  using (club_id = public.app_my_club_id() and public.app_is_active_organizer());
create policy tournaments_write_organizer_up_ins on public.tournaments
  for insert to authenticated
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);
create policy tournaments_write_organizer_up_upd on public.tournaments
  for update to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1)
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);
create policy tournaments_write_organizer_up_del on public.tournaments
  for delete to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);

-- entries
create policy entries_select_active_same_club on public.entries
  for select to authenticated
  using (club_id = public.app_my_club_id() and public.app_is_active_organizer());
create policy entries_write_organizer_up_ins on public.entries
  for insert to authenticated
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);
create policy entries_write_organizer_up_upd on public.entries
  for update to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1)
  with check (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);
create policy entries_write_organizer_up_del on public.entries
  for delete to authenticated
  using (club_id = public.app_my_club_id() and public.app_my_org_rank() >= 1);

-- =============================================================================
-- 注: 初回 owner の bootstrap（最初の organizers 行）は RLS で塞がれる（既存 active 幹事が無いため）。
--   これは設計どおり＝最初の1行は Supabase の SQL editor / service role で投入する（README 参照）。
--   secret key・実メール・実クラブ名は repo に置かない。
-- =============================================================================
