-- =============================================================================
-- LIVE-BROADCAST-001 Phase 4 — 参加者向けライブ配信の Realtime Broadcast 上乗せ
--   設計正本: docs/specs/20260704_live_broadcast_001_participant_realtime_design.md
--     （§2 アーキ比較 / §6 Phase4 / §7① 落とし穴 / §4.2 P2-a 送信権限 / 受入 §8-14）
--   前提: 20260705120000_live_broadcast_phase3_public_snapshots.sql（public.public_live_snapshots・RPC 群）
--
-- 方針（§4.2 P2-a・§7①）:
--   - 送信は DB trigger 起点のみ。publish（publish_live_snapshot の UPDATE）で version が進んだ行に対し、
--     AFTER UPDATE トリガが realtime.send() で「更新の合図」（version/updated_at のみ）を broadcast する。
--     ＝ anon client からは送信できない（spoof 不可）。payload そのものは broadcast に載せない
--       （viewer は合図を受けたら get_live_snapshot を再取得する＝Broadcast を真実源にしない・§7①）。
--   - anon viewer は private channel（topic = slug＝bearer secret）を **subscribe（受信）のみ**。
--     realtime.messages への SELECT を「is_public な slug の topic」に限って anon に許可し、
--     INSERT（＝クライアント送信）は anon に一切与えない（受入 §8-14）。
--   - 冪等（create or replace / drop ... if exists / drop policy if exists）。実データ不使用。
--
-- ⚠ 適用は Supabase プロジェクトへのマイグレーション実行で行う（本 PR はコードのみ・自動適用しない）。
--    realtime スキーマ（realtime.send / realtime.topic / realtime.messages）は Supabase 提供。
--    ローカルの素の PostgreSQL には realtime スキーマが無いため pgtest 対象外（実 E2E は live スモークで確認）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §4.2 P2-a: publish 起点の broadcast（DB trigger）。
--   version が進んだ（＝新しい publish の）公開中の行だけを対象にする。
--   payload は載せない（合図のみ）＝取りこぼしても viewer の再取得で必ず整合する（§7①）。
-- -----------------------------------------------------------------------------
create or replace function public.tg_public_live_snapshot_broadcast()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- fail-soft（§7①）: Realtime 側の権限/設定/実行時エラーで publish（真実源）を巻き戻さない。
  --   合図が飛ばなくても viewer は 5秒ポーリングで必ず追いつく。broadcast の失敗は publish を止めない。
  begin
    perform realtime.send(
      jsonb_build_object('version', NEW.version, 'updated_at', NEW.updated_at),  -- 合図のみ（payload 非搭載）
      'snapshot',   -- event 名（viewer の on('broadcast',{event:'snapshot'}) と一致）
      NEW.slug,     -- topic = slug（know-the-slug・§4.2）
      true          -- private（Realtime Authorization を要求＝anon は下の SELECT ポリシーでのみ受信可）
    );
  exception when others then
    null;  -- 送信失敗は握りつぶす（publish の UPDATE はコミットさせる）
  end;
  return NEW;
end;
$$;
revoke execute on function public.tg_public_live_snapshot_broadcast() from public;
comment on function public.tg_public_live_snapshot_broadcast() is
  'LIVE-BROADCAST-001 Phase4: publish 起点で slug topic に更新合図を private broadcast（送信は DB のみ・§4.2 P2-a）';

drop trigger if exists public_live_snapshots_broadcast on public.public_live_snapshots;
create trigger public_live_snapshots_broadcast
  after update of version on public.public_live_snapshots
  for each row
  when (NEW.is_public and NEW.version is distinct from OLD.version)
  execute function public.tg_public_live_snapshot_broadcast();

-- -----------------------------------------------------------------------------
-- §4.2 / 列挙不可: 受信ポリシー用の安全な slug 参照（SECURITY DEFINER helper）。
--   Phase3 で public_live_snapshots は anon/authenticated から全 revoke 済み。RLS ポリシーの USING は
--   購読者ロール（anon）権限で評価されるため、テーブルを直接 SELECT すると permission failure で購読が落ちる。
--   そこで「指定 slug が公開中か」だけを返す boolean helper を SECURITY DEFINER で用意し、テーブルの
--   直接 SELECT/列挙を anon に開かないまま、ポリシーに最小の参照経路を与える（Must Fix #1 の列挙不可を維持）。
--   read RPC 群と同じ実装ガード（search_path 固定・public. 完全修飾・引数バインドのみ・dynamic SQL 無し）。
-- -----------------------------------------------------------------------------
create or replace function public.live_slug_is_public(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.public_live_snapshots s
    where s.slug = p_slug
      and s.is_public
  );
$$;
revoke execute on function public.live_slug_is_public(text) from public;
grant execute on function public.live_slug_is_public(text) to anon, authenticated;
comment on function public.live_slug_is_public(text) is
  'LIVE-BROADCAST-001 Phase4: 指定 slug が公開中かの boolean のみ返す（realtime.messages 受信ポリシー用・テーブル列挙は開かない）';

-- -----------------------------------------------------------------------------
-- §4.2 P2-a / 受入 §8-14: Realtime Authorization。
--   anon / authenticated は「is_public な slug に対応する topic」の broadcast を **受信（SELECT）のみ** 可。
--   送信（INSERT）は anon に付与しない＝know-the-slug でも viewer は send できない（spoof 不可）。
-- -----------------------------------------------------------------------------
alter table realtime.messages enable row level security;

drop policy if exists "live: anon can receive is_public broadcast" on realtime.messages;
create policy "live: anon can receive is_public broadcast"
  on realtime.messages
  for select
  to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.live_slug_is_public(realtime.topic())
  );

-- 注: anon への INSERT ポリシーは意図的に作成しない（＝クライアント送信不可・受入 §8-14）。
--   運営者（authenticated）が channel.send を使う将来拡張が要る場合のみ、別途 club 所有検査つき
--   INSERT ポリシーを追加する（当面は DB trigger 起点のみで送信は完結する）。
