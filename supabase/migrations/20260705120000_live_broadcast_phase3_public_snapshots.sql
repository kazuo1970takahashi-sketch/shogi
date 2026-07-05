-- =============================================================================
-- LIVE-BROADCAST-001 Phase 3 — 参加者向けライブ配信の公開スナップショット面
--   設計正本: docs/specs/20260704_live_broadcast_001_participant_realtime_design.md（§4.1〜§4.3）
--   受入: §8-11（RPC 実装ガード）/ §8-12（version 単調性）/ §8-15（club_id の由来・publish は update-only）/
--         §8-6（列挙不可）/ #18（slug ライフサイクル: 発行→無効化→ローテーション）
--
-- 方針:
--   - anon にはテーブル直 SELECT を一切与えない。read は SECURITY DEFINER RPC
--     get_live_snapshot(slug) のみ（slug 完全一致 かつ is_public の1行だけ＝列挙不可・Must Fix #1）。
--   - slug 発行（club_id 確定）と publish（既存行 UPDATE のみ）を分離（P1・3巡目）。
--     publish は INSERT しない＝club_id を publish 時に発明しない。version は DB 側 atomic 採番（P1-b）。
--   - SECURITY DEFINER の常道ガード（P1-a）: search_path 固定 / public. 完全修飾 /
--     dynamic SQL 禁止（引数バインドのみ）/ REVOKE EXECUTE FROM PUBLIC → 必要ロールにのみ GRANT。
--   - 冪等（create table if not exists / create or replace / revoke+grant は再適用可）。実データ不使用。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §4.1 テーブル public_live_snapshots（1配信セッション=1行。同一クラブの旧行は再発行で失効）
-- -----------------------------------------------------------------------------
create table if not exists public.public_live_snapshots (
  slug       text primary key,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  version    integer not null default 0,
  payload    jsonb,
  is_public  boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.public_live_snapshots is
  'LIVE-BROADCAST-001: 参加者向け公開スナップショット（read は get_live_snapshot RPC 経由のみ・anon 直 SELECT 不可）';

-- club ごとの失効処理（start_live_session のローテーション）用。
create index if not exists idx_public_live_snapshots_club
  on public.public_live_snapshots (club_id) where is_public;

-- 既定拒否: RLS 有効化＋許可ポリシーなし＋GRANT なし（読み書きとも RPC に限定）。
alter table public.public_live_snapshots enable row level security;
revoke all on table public.public_live_snapshots from public;
revoke all on table public.public_live_snapshots from anon;
revoke all on table public.public_live_snapshots from authenticated;

-- -----------------------------------------------------------------------------
-- 内部ヘルパ: 呼び出し元（auth.uid()）の「配信操作を許可する」club を返す。
--   active かつ owner/admin/organizer（viewer は配信操作不可）。0件/複数クラブは null（呼び出し側で error）。
--   Stage A の pickActiveClubId（アプリ側）と同方針＝一意に決まらなければ操作させない。
-- -----------------------------------------------------------------------------
create or replace function public.app_live_operator_club()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when count(distinct o.club_id) = 1 then min(o.club_id::text)::uuid else null end
  from public.organizers o
  where o.user_id = auth.uid()
    and o.status = 'active'
    and o.role in ('owner','admin','organizer');
$$;
revoke execute on function public.app_live_operator_club() from public;
-- （直接呼ぶ必要はないので誰にも GRANT しない。SECURITY DEFINER 関数内からのみ使用）

-- -----------------------------------------------------------------------------
-- §4.3① start_live_session() — 配信セッション発行（authenticated 運営のみ）
--   呼び出し元 membership から club_id を確定し、高エントロピー slug（gen_random_uuid ベース・122bit）を採番。
--   同一クラブの既存公開行は is_public=false に失効（再発行で旧 slug 失効＝ローテーション・§4.2/#18）。
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
  update public.public_live_snapshots
     set is_public = false, updated_at = now()
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
-- §4.3② publish_live_snapshot(slug, payload) — 既存行の UPDATE のみ（INSERT / ON CONFLICT なし）
--   行の所有（club membership）を検査し、version を atomic increment（P1-b）。
--   行が無い/所有外/停止済みなら error（club_id を publish 時に発明しない・§8-15）。
-- -----------------------------------------------------------------------------
create or replace function public.publish_live_snapshot(slug text, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_variable
declare
  v_club uuid;
  v_version integer;
begin
  v_club := public.app_live_operator_club();
  if v_club is null then
    raise exception 'live: no unique active organizer membership';
  end if;
  update public.public_live_snapshots t
     set payload = payload, version = t.version + 1, updated_at = now()
   where t.slug = slug
     and t.club_id = v_club
     and t.is_public
  returning t.version into v_version;
  if v_version is null then
    raise exception 'live: session not found, not owned, or already stopped (publish is update-only)';
  end if;
  return v_version;
end;
$$;
revoke execute on function public.publish_live_snapshot(text, jsonb) from public;
grant execute on function public.publish_live_snapshot(text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- §4.3① stop_live_session(slug) — 無効化（is_public=false・受入 #18: 停止後は get_live_snapshot 不可）
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
     set is_public = false, updated_at = now()
   where t.slug = slug
     and t.club_id = v_club
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;
revoke execute on function public.stop_live_session(text) from public;
grant execute on function public.stop_live_session(text) to authenticated;

-- -----------------------------------------------------------------------------
-- §4.2 get_live_snapshot(slug) — anon read の唯一の入口（列挙不可）
--   slug 完全一致 かつ is_public の1行の envelope（{slug,version,updated_at,payload}）だけを返す。
--   一覧・全文 SELECT 不可。他 club/他 slug へ波及する引数を取らない（§8-11 ⑤）。
-- -----------------------------------------------------------------------------
create or replace function public.get_live_snapshot(slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
           'slug', t.slug,
           'version', t.version,
           'updated_at', t.updated_at,
           'payload', t.payload
         )
  from public.public_live_snapshots t
  where t.slug = get_live_snapshot.slug
    and t.is_public;
$$;
revoke execute on function public.get_live_snapshot(text) from public;
grant execute on function public.get_live_snapshot(text) to anon;
grant execute on function public.get_live_snapshot(text) to authenticated;
