-- =============================================================================
-- LIVE-BROADCAST-001 P2-1 (#612) — 停止/ローテーション時に payload を null 化
--   出自: PR #610 L3 code-review Should Fix P2-1（データ最小化・未成年参加前提）。
--   設計正本: docs/specs/20260704_live_broadcast_001_participant_realtime_design.md（§4.3①）
--
-- 問題: stop_live_session / start_live_session のローテーション UPDATE は
--   is_public=false にするのみで、payload（参加者名を含むスナップショット）が
--   DB 行に無期限に残留していた。anon には get_live_snapshot 経由で読めない
--   （is_public 条件）ため即時リスクは低いが、データ最小化として失効時に消す。
--
-- 方針:
--   - 20260705120000_live_broadcast_phase3_public_snapshots.sql の両関数を
--     create or replace で追補（失効 UPDATE に payload = null を追加）。それ以外は不変。
--   - SECURITY DEFINER の常道ガード（search_path 固定 / public. 完全修飾 /
--     dynamic SQL 禁止 / REVOKE → GRANT）は原本と同一を維持。
--   - 冪等（create or replace / revoke+grant は再適用可）。実データ不使用。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §4.3① start_live_session() — ローテーション UPDATE に payload = null を追加。
--   それ以外（membership 確定・slug 採番・INSERT）は原本と同一。
-- -----------------------------------------------------------------------------
create or replace function public.start_live_session()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club uuid;
  v_slug text;
begin
  v_club := public.app_live_operator_club();
  if v_club is null then
    raise exception 'live: no unique active organizer membership (login as organizer of exactly one club)';
  end if;
  -- ローテーション: 同一クラブの公開中 slug を失効させてから新規発行（旧 QR/URL は無効になる）。
  -- P2-1 (#612): 失効時に payload も消す（参加者名の DB 残留を解消・データ最小化）。
  update public.public_live_snapshots
     set is_public = false, payload = null, updated_at = now()
   where club_id = v_club and is_public;
  v_slug := 'live-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.public_live_snapshots (slug, club_id, version, payload, is_public)
  values (v_slug, v_club, 0, null, true);
  return v_slug;
end;
$$;
revoke execute on function public.start_live_session() from public;
grant execute on function public.start_live_session() to authenticated;

-- -----------------------------------------------------------------------------
-- §4.3① stop_live_session(slug) — 無効化 UPDATE に payload = null を追加。
--   それ以外（membership 確定・所有検査・返り値）は原本と同一。
-- -----------------------------------------------------------------------------
create or replace function public.stop_live_session(slug text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_variable
declare
  v_club uuid;
  v_found boolean := false;
begin
  v_club := public.app_live_operator_club();
  if v_club is null then
    raise exception 'live: no unique active organizer membership';
  end if;
  update public.public_live_snapshots t
     set is_public = false, payload = null, updated_at = now()
   where t.slug = slug
     and t.club_id = v_club
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;
revoke execute on function public.stop_live_session(text) from public;
grant execute on function public.stop_live_session(text) to authenticated;
