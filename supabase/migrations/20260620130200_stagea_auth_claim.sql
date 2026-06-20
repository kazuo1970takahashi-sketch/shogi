-- =============================================================================
-- DATA-PERSISTENCE-PHASE2 / Stage A — 招待 → 初回ログインで席を claim する仕組み
--   正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md（更新3 / 幹事交代・未登録案内）
--
-- 設計:
--   - 管理者（owner/admin）は organizers に「メール＋役割」だけ先に追加する
--     （user_id = NULL の招待行・status='active'）。RLS は organizers_insert で
--     owner/admin のみ許可済み。
--   - 招待された本人がマジックリンクでログイン（auth.users 作成）後、
--     claim_organizer_seat() を呼ぶと email 一致の未claim行に user_id を結びつける。
--     これで初めて app_is_active_member が true になり自 club を読めるようになる。
--   - claim はメール所有の証明（マジックリンク受信）に依存。SECURITY DEFINER で
--     RLS を回避して結合と所属返却を行う（未claimの本人は organizers を読めないため）。
--   - 未登録メール（一致行なし）は空配列を返す → クライアントが「幹事登録がありません」を表示。
--   - retired は claim 対象外（退任者は復帰しない・管理者が再招待で status を戻す）。
-- =============================================================================

-- auth.email() は Supabase Auth が提供（JWT の email クレーム）。本番では存在する。
-- claim_organizer_seat: 自分（auth.uid）の席を確定し、所属一覧を JSON で返す。
create or replace function public.claim_organizer_seat()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  mail text := lower(coalesce(auth.email(), ''));
  result jsonb;
begin
  if uid is null then
    return '[]'::jsonb;   -- 未ログインは何も返さない
  end if;

  -- 1) メール一致の未claim招待に user_id を結びつける（retired は除外）。
  if mail <> '' then
    update public.organizers o
       set user_id = uid
     where o.user_id is null
       and lower(o.email) = mail
       and o.status <> 'retired';
  end if;

  -- 2) このユーザーの所属（claim 済み＋既存）を返す。RLS 回避で本人分のみ。
  select coalesce(jsonb_agg(jsonb_build_object(
           'club_id',      o.club_id,
           'club_name',    c.name,
           'role',         o.role,
           'status',       o.status,
           'display_name', o.display_name
         ) order by c.name), '[]'::jsonb)
    into result
  from public.organizers o
  join public.clubs c on c.id = o.club_id
  where o.user_id = uid;

  return result;
end;
$$;

grant execute on function public.claim_organizer_seat() to authenticated;
