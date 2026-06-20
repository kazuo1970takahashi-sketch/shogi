-- =============================================================================
-- DATA-PERSISTENCE-PHASE2-STAGE-A / A1 スキーマ（多テナント・クラウド土台）
-- 正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md §2（更新2・3 改定）
-- 設計: docs/specs/20260620_data_persistence_phase2_stagea_design.md
--
-- 方針:
--   - 全テーブルに club_id（多テナント分離の基盤）。
--   - 氏名は members だけに集約（players/entries は member_id 参照のみ・氏名を持たない）。
--   - matches / ranking_rules / annual_ranking は本 Stage 対象外（後続 Phase）。
--   - RLS の有効化・ポリシーは別ファイル 20260620120100_stagea_rls.sql。
--   - 実データ（実会員名簿・実メール）は含めない。seed はプレースホルダのみ・既定では投入しない。
--   - 当日運営（shogi_v4.html / localStorage）には一切影響しない（別レイヤーの追加）。
-- =============================================================================

-- updated_at 自動更新トリガ（全テーブル共通）
create or replace function public.app_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- clubs: テナント（クラブ）。最初は1クラブ（例: 沼津支部）。
-- -----------------------------------------------------------------------------
create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.clubs is 'テナント（クラブ）。全データは club_id でこのクラブに紐づく。';

drop trigger if exists trg_clubs_touch on public.clubs;
create trigger trg_clubs_touch before update on public.clubs
  for each row execute function public.app_touch_updated_at();

-- -----------------------------------------------------------------------------
-- organizers: 幹事。user_id = auth.uid（Supabase Auth の個人）。
--   role:   owner / admin / organizer / viewer（権限ランク）
--   status: active / suspended / retired（active のみがログイン後に読める）
-- -----------------------------------------------------------------------------
create table if not exists public.organizers (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id) on delete cascade,
  user_id       uuid not null unique,             -- = auth.uid()（1ユーザー1幹事行）
  role          text not null default 'organizer'
                  check (role in ('owner','admin','organizer','viewer')),
  status        text not null default 'active'
                  check (status in ('active','suspended','retired')),
  display_name  text,
  email         text,                              -- ログイン用（owner の実メールは seed しない）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.organizers is '幹事。user_id=auth.uid。role/status で権限と在籍を表す。氏名名簿(members)とは別。';
create index if not exists idx_organizers_club on public.organizers(club_id);
create index if not exists idx_organizers_user on public.organizers(user_id);

drop trigger if exists trg_organizers_touch on public.organizers;
create trigger trg_organizers_touch before update on public.organizers
  for each row execute function public.app_touch_updated_at();

-- -----------------------------------------------------------------------------
-- members: 会員名簿（非公開）。氏名・ふりがな・支部をここに集約。
--   ★最重要機微。RLS で active organizer 以上のみ read 可（別ファイル）。
-- -----------------------------------------------------------------------------
create table if not exists public.members (
  member_id   text primary key,                    -- アプリ側の安定キー（匿名 ID とは別の名簿 ID）
  club_id     uuid not null references public.clubs(id) on delete cascade,
  name        text not null,                        -- 氏名（機微・公開ビューには出さない）
  yomi        text,                                 -- ふりがな
  branch      text,                                 -- 支部
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.members is '会員名簿（非公開）。氏名はここだけに集約。active organizer 以上のみ read 可（RLS）。';
create index if not exists idx_members_club on public.members(club_id);

drop trigger if exists trg_members_touch on public.members;
create trigger trg_members_touch before update on public.members
  for each row execute function public.app_touch_updated_at();

-- -----------------------------------------------------------------------------
-- players: 競技者（成績集計用の匿名キー）。氏名は持たず members を参照。
-- -----------------------------------------------------------------------------
create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  member_id    text not null references public.members(member_id) on delete restrict,
  branch_code  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (club_id, member_id)
);
comment on table public.players is '競技者。氏名を持たず member_id で名簿参照。成績は entries 側。';
create index if not exists idx_players_club on public.players(club_id);

drop trigger if exists trg_players_touch on public.players;
create trigger trg_players_touch before update on public.players
  for each row execute function public.app_touch_updated_at();

-- -----------------------------------------------------------------------------
-- tournaments: 大会。name/venue に実名・機微を入れない（コード/匿名）。
-- -----------------------------------------------------------------------------
create table if not exists public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id) on delete cascade,
  name          text not null,
  date          date not null,
  season        text not null,                      -- 年度（例 '2026'。境界は後から変更可）
  venue_code    text,
  status        text not null default 'draft'
                  check (status in ('draft','confirmed','synced','void')),
  source        text not null default 'manual'
                  check (source in ('manual','json_import','app_sync')),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.tournaments is '大会。確定結果の履歴。name/venue に実名・機微を入れない。';
create index if not exists idx_tournaments_club on public.tournaments(club_id);
create index if not exists idx_tournaments_season on public.tournaments(club_id, season);

drop trigger if exists trg_tournaments_touch on public.tournaments;
create trigger trg_tournaments_touch before update on public.tournaments
  for each row execute function public.app_touch_updated_at();

-- -----------------------------------------------------------------------------
-- entries: 出場。大会×競技者×クラス。年間ランキングは entries 中心に集計（matches 不要）。
--   unique(tournament_id, player_id)。氏名は持たない。
-- -----------------------------------------------------------------------------
create table if not exists public.entries (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubs(id) on delete cascade,
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete restrict,
  class          text not null,                     -- 大会ごとに持つ（A/B…可変クラス）
  final_rank     int,
  wins           int not null default 0,
  losses         int not null default 0,
  draws          int not null default 0,
  bye_count      int not null default 0,
  tiebreak       numeric,
  rank_points    numeric,
  participated   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tournament_id, player_id)
);
comment on table public.entries is '出場。大会×競技者×クラスの成績。氏名なし。年間ランキングはここから集計。';
create index if not exists idx_entries_club on public.entries(club_id);
create index if not exists idx_entries_tournament on public.entries(tournament_id);
create index if not exists idx_entries_player on public.entries(player_id);

drop trigger if exists trg_entries_touch on public.entries;
create trigger trg_entries_touch before update on public.entries
  for each row execute function public.app_touch_updated_at();

-- -----------------------------------------------------------------------------
-- seed について（既定では何も投入しない）:
--   owner（髙橋）の実メール・実クラブ名・実会員名簿は repo に置かない（実データ・secret 禁止）。
--   初回 owner 登録は prereq（クラブ名・owner メール確定）後に、Supabase 側で1行 insert する手順を
--   supabase/README.md に記す。テスト/検証用のダミーは 'クラブ・テスト'（架空）等プレースホルダのみ。
-- -----------------------------------------------------------------------------
