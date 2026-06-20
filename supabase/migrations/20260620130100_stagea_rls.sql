-- =============================================================================
-- DATA-PERSISTENCE-PHASE2 / Stage A — RLS（行レベルセキュリティ）
--   正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md（更新3 / Phase2 受入②③）
--   依頼: ai-requests/2026-06-20_claude-code_data-persistence-impl-phase2-stageA.md（A2）
--
-- 最低ライン（必須）:
--   - 未ログインは全拒否。`organizers.status='active'` のみ許可。
--   - 自分の club_id の行のみ参照/更新。
--   - members（氏名）は organizer 以上(rank>=1)のみ読める（viewer・未ログイン・retired・別 club は不可）。
--   - players/tournaments/entries の書込も organizer 以上(rank>=1)。viewer(rank0) は非機微データの read のみ。
--   - organizers の追加・停止は owner / admin のみ。
--   - 匿名 publishable key 単体では DB を開けない（RLS で保証）。
--
-- 仕組み:
--   - 既定拒否 = 各テーブルで RLS を有効化し、許可ポリシーに一致しない限り何も通さない。
--   - 許可判定は SECURITY DEFINER 関数に集約（3 段の rank）:
--       app_is_active_member(club)    … active な所属（rank>=0・viewer 含む）→ 非機微データの read。
--       app_is_active_organizer(club) … rank>=organizer(owner/admin/organizer)→ 氏名 read・各種 write。
--       app_is_admin(club)            … rank>=admin(owner/admin)→ organizers 追加変更・各種 delete。
--     SECURITY DEFINER は内部クエリで RLS を回避 → organizers を参照しても再帰しない。
--   - 「最後の active owner/admin を残す」ガードはトリガで実装（停止/退任/降格/削除を防ぐ）。
--   - anon（publishable key・未認証）には SELECT 権限を付与した上で RLS で全拒否する
--     ＝「権限不足」ではなく「RLS が拒否する」ことをテストで実証できるようにする。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 許可判定ヘルパ（SECURITY DEFINER・STABLE）。auth.uid() は Supabase が提供。
-- -----------------------------------------------------------------------------
create or replace function public.app_is_active_member(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organizers o
    where o.user_id = auth.uid()
      and o.club_id = target_club
      and o.status = 'active'
  );
$$;

create or replace function public.app_is_admin(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organizers o
    where o.user_id = auth.uid()
      and o.club_id = target_club
      and o.status = 'active'
      and o.role in ('owner','admin')
  );
$$;

-- active かつ rank>=organizer（owner/admin/organizer）。viewer(rank0) は false。
--   members（氏名）の読取と、members/players/tournaments/entries への書込に使う。
--   ※ app_is_active_member は rank>=0（viewer 含む）で非機微データの read 専用。氏名・書込はこの関数で viewer を弾く。
create or replace function public.app_is_active_organizer(target_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organizers o
    where o.user_id = auth.uid()
      and o.club_id = target_club
      and o.status = 'active'
      and o.role in ('owner','admin','organizer')
  );
$$;

-- -----------------------------------------------------------------------------
-- 「最後の active owner/admin」を必ず1人以上残すガード
--   （停止/退任/降格/削除に加え、別 club への club_id 移動でも旧 club を 0 admin にしない）。
-- -----------------------------------------------------------------------------
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  was_admin   boolean;
  still_admin boolean;
  remaining   integer;
begin
  was_admin := (old.status = 'active' and old.role in ('owner','admin'));
  if not was_admin then
    return case when tg_op = 'DELETE' then old else new end;  -- 元々 admin でなければ無関係
  end if;

  if tg_op = 'UPDATE' then
    -- club を移すと「旧 club の admin を失う」事象になる → club 変更時は still_admin にしない
    -- （new.club_id <> old.club_id のときは下の残数チェックで旧 club を 0 admin から守る）。
    still_admin := (new.status = 'active'
                    and new.role in ('owner','admin')
                    and new.club_id = old.club_id);
    if still_admin then
      return new;  -- 同 club の admin のまま → 問題なし
    end if;
  end if;

  -- この行を除いた、同 club の active owner/admin の残数。
  select count(*) into remaining
  from public.organizers o
  where o.club_id = old.club_id
    and o.id <> old.id
    and o.status = 'active'
    and o.role in ('owner','admin');

  if remaining < 1 then
    raise exception 'club % の active owner/admin が0人になる操作は禁止です（最後の1人は残してください）', old.club_id
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_organizers_last_admin on public.organizers;
create trigger trg_organizers_last_admin
  before update or delete on public.organizers
  for each row execute function public.prevent_last_admin_removal();

-- -----------------------------------------------------------------------------
-- RLS 有効化（6 テーブル）。
-- -----------------------------------------------------------------------------
alter table public.clubs        enable row level security;
alter table public.organizers   enable row level security;
alter table public.members      enable row level security;
alter table public.players      enable row level security;
alter table public.tournaments  enable row level security;
alter table public.entries      enable row level security;

-- -----------------------------------------------------------------------------
-- 権限付与: RLS が「権限不足」ではなく明示的に拒否することを実証可能にする。
--   authenticated = ログイン済みユーザー（実際の許可は RLS）。
--   anon          = publishable key・未認証。SELECT のみ付与し RLS で全拒否。
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant execute on function public.app_is_active_member(uuid)    to anon, authenticated;
grant execute on function public.app_is_active_organizer(uuid) to anon, authenticated;
grant execute on function public.app_is_admin(uuid)            to anon, authenticated;

grant select, insert, update, delete
  on public.clubs, public.organizers, public.members,
     public.players, public.tournaments, public.entries
  to authenticated;

grant select
  on public.clubs, public.organizers, public.members,
     public.players, public.tournaments, public.entries
  to anon;

-- =============================================================================
-- ポリシー定義（許可リスト方式・既定拒否）。
--   未ログイン: auth.uid() is null → app_is_active_member/app_is_admin は false → 全拒否。
--   suspended/retired: status<>'active' → false → 全拒否。
--   別 club: club_id 不一致 → false → 全拒否。
-- =============================================================================

-- ---- clubs ----
drop policy if exists clubs_select on public.clubs;
create policy clubs_select on public.clubs
  for select using (public.app_is_active_member(id));

drop policy if exists clubs_update on public.clubs;
create policy clubs_update on public.clubs
  for update using (public.app_is_admin(id))
            with check (public.app_is_admin(id));
-- INSERT/DELETE は無し（既定拒否）。clubs の作成はブートストラップ（service role）で行う。

-- ---- organizers ----
drop policy if exists organizers_select on public.organizers;
create policy organizers_select on public.organizers
  for select using (public.app_is_active_member(club_id));

drop policy if exists organizers_insert on public.organizers;
create policy organizers_insert on public.organizers
  for insert with check (public.app_is_admin(club_id));   -- 追加（招待）は owner/admin のみ

drop policy if exists organizers_update on public.organizers;
create policy organizers_update on public.organizers
  for update using (public.app_is_admin(club_id))         -- 停止/退任/役割変更は owner/admin のみ
            with check (public.app_is_admin(club_id));
-- DELETE は無し（退任は status=retired で表現）。最後の admin ガードはトリガで別途。

-- ---- members（氏名・非公開）----
-- 氏名は最重要機微。read/write とも organizer 以上(rank>=1)に限定し viewer(rank0) を弾く。
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select using (public.app_is_active_organizer(club_id));   -- organizer 以上のみ氏名を読める（viewer 不可）

drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert with check (public.app_is_active_organizer(club_id));

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update using (public.app_is_active_organizer(club_id))
            with check (public.app_is_active_organizer(club_id));

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete using (public.app_is_admin(club_id));

-- ---- players ----
drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select using (public.app_is_active_member(club_id));

drop policy if exists players_insert on public.players;
create policy players_insert on public.players
  for insert with check (public.app_is_active_organizer(club_id));   -- 書込は organizer 以上（viewer 不可）

drop policy if exists players_update on public.players;
create policy players_update on public.players
  for update using (public.app_is_active_organizer(club_id))
            with check (public.app_is_active_organizer(club_id));

drop policy if exists players_delete on public.players;
create policy players_delete on public.players
  for delete using (public.app_is_admin(club_id));

-- ---- tournaments ----
drop policy if exists tournaments_select on public.tournaments;
create policy tournaments_select on public.tournaments
  for select using (public.app_is_active_member(club_id));

drop policy if exists tournaments_insert on public.tournaments;
create policy tournaments_insert on public.tournaments
  for insert with check (public.app_is_active_organizer(club_id));   -- 書込は organizer 以上（viewer 不可）

drop policy if exists tournaments_update on public.tournaments;
create policy tournaments_update on public.tournaments
  for update using (public.app_is_active_organizer(club_id))
            with check (public.app_is_active_organizer(club_id));

drop policy if exists tournaments_delete on public.tournaments;
create policy tournaments_delete on public.tournaments
  for delete using (public.app_is_admin(club_id));

-- ---- entries ----
drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select using (public.app_is_active_member(club_id));

drop policy if exists entries_insert on public.entries;
create policy entries_insert on public.entries
  for insert with check (public.app_is_active_organizer(club_id));   -- 書込は organizer 以上（viewer 不可）

drop policy if exists entries_update on public.entries;
create policy entries_update on public.entries
  for update using (public.app_is_active_organizer(club_id))
            with check (public.app_is_active_organizer(club_id));

drop policy if exists entries_delete on public.entries;
create policy entries_delete on public.entries
  for delete using (public.app_is_admin(club_id));
