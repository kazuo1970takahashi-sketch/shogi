-- =============================================================================
-- DATA-PERSISTENCE-PHASE2 / Stage B-2(schema-fix) — ux_tournaments_club_app_id を非部分一意 index に是正
--   B-2-schema(#347 / 20260623150000) は部分一意 index
--     create unique index ... on tournaments (club_id, app_tournament_id) where app_tournament_id is not null
--   を作ったが、PostgREST の upsert（on_conflict='club_id,app_tournament_id'）は WHERE 述語を渡せず、
--   部分 index を ON CONFLICT のアービターに使えない。結果、当日アプリ→クラウドの実送信が
--     "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--   で失敗する（2026-06-23 実機確認・shogi_v4.html syncTournamentToCloud の tournaments upsert）。
--
--   是正: 部分 index を drop し、同名の「非部分」一意 index を作り直す。
--   複合キーに NULL を含む行は一意制約上「重複扱いされない」(NULLS DISTINCT 既定)ため、
--   「手動/移行行は app_tournament_id=NULL を複数許す」(#343 §6) という意図は非部分でもそのまま満たす。
--   非部分なら ON CONFLICT (club_id, app_tournament_id) がこの index を推論でき、冪等 upsert が成立する。
--
--   方針: 追加のみ・冪等（drop if exists → create if not exists）・データ不変。
--   正本: Stage B 設計 issue #343 §6・§11 / 実送信ブロッカー是正。
-- =============================================================================
drop index if exists public.ux_tournaments_club_app_id;

create unique index if not exists ux_tournaments_club_app_id
  on public.tournaments (club_id, app_tournament_id);

comment on column public.tournaments.app_tournament_id
  is '当日アプリの state.tournament_id（app_sync 冪等 upsert キー）。非部分一意 index ux_tournaments_club_app_id で (club_id, app_tournament_id) を一意化。NULL は NULLS DISTINCT 既定で複数可（手動/移行行）。Stage B-2 / #343';
