-- =============================================================================
-- CLOUD-HISTORY-SCOREBOARD-001 (#765) — クラウド過去大会の星取表スナップショット置き場
--   設計正本: Issue #765（案A: 送信時スナップショット同梱・作者決定 2026-07-13）
--   依頼: ai-requests/2026-07-28_claude-code_765-cloud-history-scoreboard.md
--
-- 方針:
--   - 大会ごとの snapshot jsonb を小テーブル tournament_snapshots(tournament_id PK) に置く
--     （tournaments への列追加でなく別テーブル＝既存テーブル無改変・行サイズ分離・#765 設計時判断）。
--   - 内容は buildPublicLiveSnapshot(state,{display_mode:'full'}) のホワイトリスト部分集合
--     （回戦別 results / players の id・name・yomi・entry_no のみ。member/grade 等は載らない）。
--   - RLS は entries と同じ「authenticated クラブメンバー read のみ」:
--       select = app_is_active_member(club_id)（viewer 含む・entries_select と同一述語）
--       insert/update = app_is_active_organizer(club_id)（書込は organizer 以上・viewer 不可）
--       delete = app_is_admin(club_id)
--     anon には SELECT 権限を付与した上で許可ポリシー無し＝RLS が全拒否
--     （stagea_rls と同方針:「権限不足」でなく「RLS が拒否する」ことをテストで実証できるようにする）。
--   - anon 公開窓は get_live_snapshot(slug) のみを維持＝本テーブルに anon 向けポリシー/RPC は作らない
--     （[anon-attack-surface-audit-202607] 不変条件: 匿名面の攻撃面を 1mm も広げない）。
--   - 防御的整合: INSERT/UPDATE の with check で「tournament_id が同じ club の大会であること」も要求
--     （他クラブの大会 uuid へ snapshot を貼る cross-club 不整合を DB 側でも遮断。subquery は
--      tournaments の RLS 越しに評価される＝自クラブの大会しか見えない）。
--   - 冪等（create table if not exists / drop policy if exists / revoke+grant は再適用可）。実データ不使用。
-- =============================================================================

create table if not exists public.tournament_snapshots (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  club_id       uuid not null references public.clubs(id) on delete cascade,
  snapshot      jsonb not null,
  updated_at    timestamptz not null default now()
);

comment on table public.tournament_snapshots is
  'CLOUD-HISTORY-SCOREBOARD-001 (#765): 送信時同梱の星取表スナップショット（buildPublicLiveSnapshot full 形・read は authenticated クラブメンバーのみ・anon 直 SELECT 不可）';

create index if not exists idx_tournament_snapshots_club
  on public.tournament_snapshots (club_id);

alter table public.tournament_snapshots enable row level security;

-- 権限付与（stagea_rls と同方針: 実際の許可は RLS。anon は SELECT 権限ありでも RLS で全拒否）。
grant select, insert, update, delete on public.tournament_snapshots to authenticated;
grant select on public.tournament_snapshots to anon;

-- ---- policies（entries と同型・許可リスト方式・既定拒否）----
drop policy if exists tournament_snapshots_select on public.tournament_snapshots;
create policy tournament_snapshots_select on public.tournament_snapshots
  for select using (public.app_is_active_member(club_id));

drop policy if exists tournament_snapshots_insert on public.tournament_snapshots;
create policy tournament_snapshots_insert on public.tournament_snapshots
  for insert with check (
    public.app_is_active_organizer(club_id)
    and exists (select 1 from public.tournaments t
                 where t.id = tournament_id and t.club_id = tournament_snapshots.club_id)
  );

drop policy if exists tournament_snapshots_update on public.tournament_snapshots;
create policy tournament_snapshots_update on public.tournament_snapshots
  for update using (public.app_is_active_organizer(club_id))
            with check (
    public.app_is_active_organizer(club_id)
    and exists (select 1 from public.tournaments t
                 where t.id = tournament_id and t.club_id = tournament_snapshots.club_id)
  );

drop policy if exists tournament_snapshots_delete on public.tournament_snapshots;
create policy tournament_snapshots_delete on public.tournament_snapshots
  for delete using (public.app_is_admin(club_id));
