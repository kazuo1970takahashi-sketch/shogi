-- =============================================================================
-- HARD-DELETE-ATOMIC-001 (Codex 監査 #525 Must-1): 完全削除の原子化 RPC
--
-- 背景: APP-MEMBER-HARD-DELETE-001 のクライアント実装は
--   ① players を select（出場記録の有無を確認）→ ② members を delete
--   の2リクエストで、①と②の間に players/entries が挿入されると
--   players→members / entries→players の ON DELETE CASCADE により
--   成績を巻き込んで消すレース窓があった（#521 L3 P3 → #525 Must 昇格）。
--
-- 対策: 単一トランザクションで実行する RPC。
--   1) 対象 members 行を FOR UPDATE でロック
--      → players の FK 挿入は参照先 members 行に FOR KEY SHARE を取るため
--        FOR UPDATE と競合してコミットまで待たされる。削除がコミットされた後は
--        FK 違反で失敗する＝「確認と削除の間」にレース窓が存在しない。
--   2) ロック確立後に出場記録（players）を再確認 → 記録ありは skipped。
--   3) 論理削除済み（deleted_at 非NULL）の行だけ delete（UI 制約の defense in depth）。
--
-- 権限: SECURITY INVOKER（RLS はそのまま有効＝members_delete: app_is_admin）。
--   加えて冒頭で app_is_admin を明示チェックし、非管理者には明確なエラーを返す
--   （RLS の「0行削除」より誤解が少ない）。anon には EXECUTE を与えない。
--
-- 冪等: create or replace。既存データ・既存ポリシーは変更しない（純追加）。
-- =============================================================================

create or replace function public.app_hard_delete_members(p_club uuid, p_member_ids text[])
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_deleted text[];
  v_skipped text[];
begin
  if p_club is null or p_member_ids is null or coalesce(array_length(p_member_ids, 1), 0) = 0 then
    raise exception '対象を特定できません。';
  end if;
  if not public.app_is_admin(p_club) then
    raise exception '完全削除には幹事（管理者）の権限が必要です。';
  end if;

  -- 1) 対象行をロック（FK の FOR KEY SHARE と競合＝並行の players 挿入を直列化）。
  perform 1
    from public.members m
    where m.club_id = p_club
      and m.member_id = any(p_member_ids)
    for update;

  -- 2) ロック確立後に出場記録を確認（この時点の判定が確定）。
  select coalesce(array_agg(distinct p.member_id), '{}'::text[]) into v_skipped
    from public.players p
    where p.club_id = p_club
      and p.member_id = any(p_member_ids);

  -- 3) 論理削除済み・出場記録なしの行だけ物理削除。
  with del as (
    delete from public.members m
      where m.club_id = p_club
        and m.member_id = any(p_member_ids)
        and m.deleted_at is not null
        and not (m.member_id = any(v_skipped))
      returning m.member_id
  )
  select coalesce(array_agg(member_id), '{}'::text[]) into v_deleted from del;

  return jsonb_build_object(
    'deleted', to_jsonb(v_deleted),
    'skipped', to_jsonb(v_skipped)
  );
end;
$$;

revoke all on function public.app_hard_delete_members(uuid, text[]) from public;
revoke all on function public.app_hard_delete_members(uuid, text[]) from anon;
grant execute on function public.app_hard_delete_members(uuid, text[]) to authenticated;
