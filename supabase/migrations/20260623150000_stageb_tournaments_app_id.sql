-- =============================================================================
-- DATA-PERSISTENCE-PHASE2 / Stage B-2(schema) — tournaments に app_tournament_id 追補
--   B-2b の app_sync（当日アプリ→クラウド）を冪等 upsert するための自然キー。
--   現 Stage A schema は tournaments.id(uuid) のみで、app 側の安定 ID で衝突判定できない。
--   方針: 追加のみ・冪等。手動/移行由来の行は app_tournament_id=NULL を許す（複数 NULL 可）。
--   (club_id, app_tournament_id) は app_tournament_id IS NOT NULL のときだけ一意（部分一意）。
--   正本: Stage B 設計 issue #343 §6・§11 / B-2a(#346) のペイロード冪等キー。
-- =============================================================================
alter table public.tournaments
  add column if not exists app_tournament_id text;

create unique index if not exists ux_tournaments_club_app_id
  on public.tournaments (club_id, app_tournament_id)
  where app_tournament_id is not null;

comment on column public.tournaments.app_tournament_id
  is '当日アプリの state.tournament_id（app_sync 冪等 upsert キー）。手動/移行行は NULL 可。Stage B-2 / #343';
