-- =============================================================================
-- DATA-PERSISTENCE-PHASE2 / Stage A — Schema (clubs / organizers / members /
--   players / tournaments / entries)。多テナント分離のため全テーブルに club_id。
--   正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md（§2・更新3）
--   依頼: ai-requests/2026-06-20_claude-code_data-persistence-impl-phase2-stageA.md（A1）
--
-- 方針:
--   - 追加のみ。当日運営（shogi_v4.html / localStorage）には一切影響しない別レイヤー。
--   - 氏名（個人情報）は members に集約（非公開・RLS で active organizer のみ読める）。
--   - matches / ranking_rules / annual_ranking は本 Stage 対象外（後続 Phase）。
--   - auth.users は Supabase Auth が提供（マジックリンクのサインインで作られる）。
--     organizers.user_id = auth.uid()（個人別ログイン）。
--   - RLS ポリシーは 20260620130100_stagea_rls.sql で定義（本ファイルは構造のみ）。
-- =============================================================================

-- gen_random_uuid() 用（Supabase は既定で有効・ローカル検証のため明示）。
create extension if not exists pgcrypto;

-- 共通: updated_at 自動更新トリガ関数。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- clubs: テナント（支部/クラブ）。id 自体がテナント境界。
-- -----------------------------------------------------------------------------
create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_clubs_updated_at on public.clubs;
create trigger trg_clubs_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- organizers: 幹事。個人別（user_id = auth.uid）。role と status で権限/在籍を制御。
--   role : owner > admin > organizer > viewer
--   status: active（許可） / suspended（一時停止・拒否） / retired（退任・拒否）
-- -----------------------------------------------------------------------------
create table if not exists public.organizers (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id) on delete cascade,
  -- user_id は NULL 可（=メール招待済みだが未ログイン）。初回ログイン時に
  -- claim_organizer_seat() が email 一致で auth.uid() を結びつける。
  user_id       uuid references auth.users(id) on delete set null,
  email         text not null,                      -- 招待・本人照合に必須
  role          text not null default 'organizer'
                  check (role in ('owner','admin','organizer','viewer')),
  status        text not null default 'active'
                  check (status in ('active','suspended','retired')),
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 1 ユーザーは 1 クラブにつき 1 行（user_id NULL の招待は複数可）。
  unique (club_id, user_id)
);

create index if not exists idx_organizers_user on public.organizers(user_id);
create index if not exists idx_organizers_club on public.organizers(club_id);
-- 同 club 内のメール重複招待を防ぐ（大文字小文字無視）。
create unique index if not exists organizers_club_email_lower_uq
  on public.organizers(club_id, lower(email));

drop trigger if exists trg_organizers_updated_at on public.organizers;
create trigger trg_organizers_updated_at
  before update on public.organizers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- members: 会員名簿（氏名・ふりがな・支部）。非公開。氏名はここに集約。
--   member_id はクラブ内で運用する会員番号（text）。club_id 込みで一意。
-- -----------------------------------------------------------------------------
create table if not exists public.members (
  member_id   text not null,
  club_id     uuid not null references public.clubs(id) on delete cascade,
  name        text not null,
  yomi        text,
  branch      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (club_id, member_id)
);

create index if not exists idx_members_club on public.members(club_id);

drop trigger if exists trg_members_updated_at on public.members;
create trigger trg_members_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- players: 大会出場主体。member_id でクラブ名簿（members）と結合。氏名は持たない。
-- -----------------------------------------------------------------------------
create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  member_id    text not null,
  branch_code  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (club_id, member_id),
  foreign key (club_id, member_id)
    references public.members(club_id, member_id) on delete cascade
);

create index if not exists idx_players_club on public.players(club_id);

drop trigger if exists trg_players_updated_at on public.players;
create trigger trg_players_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- tournaments: 大会。name/venue に実名・機微情報を入れない運用（コード化）。
-- -----------------------------------------------------------------------------
create table if not exists public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id) on delete cascade,
  name          text not null,
  date          date not null,
  season        text not null,
  venue_code    text,
  status        text not null default 'draft'
                  check (status in ('draft','confirmed','synced','void')),
  source        text not null default 'manual'
                  check (source in ('manual','json_import','app_sync')),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tournaments_club on public.tournaments(club_id);

drop trigger if exists trg_tournaments_updated_at on public.tournaments;
create trigger trg_tournaments_updated_at
  before update on public.tournaments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- entries: 大会参加（成績）。class は大会ごとに保持。matches なしで年間集計可。
-- -----------------------------------------------------------------------------
create table if not exists public.entries (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubs(id) on delete cascade,
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  class          text not null,
  final_rank     integer,
  wins           integer not null default 0,
  losses         integer not null default 0,
  draws          integer not null default 0,
  bye_count      integer not null default 0,
  tiebreak       numeric,
  rank_points    numeric,
  participated   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create index if not exists idx_entries_club on public.entries(club_id);
create index if not exists idx_entries_tournament on public.entries(tournament_id);
create index if not exists idx_entries_player on public.entries(player_id);

drop trigger if exists trg_entries_updated_at on public.entries;
create trigger trg_entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();
