-- =============================================================================
-- MEMBER-UPSERT-RPC-001 / bulk (#909): 会員 upsert の一括版
--
-- 出どころ: 便1（20260818120000）で単数形の RPC だけを作ったが、**削除／復元 push は
--   選択した N 名をまとめて1リクエストで送っている**（`masterSheetDeleteSelected` が
--   選択行すべてを配列で渡す。確認ダイアログも「他N名」＝数十名がありうる前提の作り）。
--   単数 RPC をクライアントで N 回呼ぶと、20 名で 20 往復になり、
--   ・会場の詰まった回線で明確に遅くなる
--   ・途中で失敗したとき **中途半端な状態が残る**（今日は1文・1トランザクション）
--   の2点で退行する。そこで **server 側で回す**。
--
-- 設計: **判定ロジックは複製しない。** 本関数は `app_upsert_member_edit` を
--   ループして呼ぶだけで、列の保全規則・語彙の whitelist・deleted_at の扱いは
--   すべて単数形の実装1箇所に置いたまま（＝仕様が2箇所に分かれない）。
--   plpgsql 関数は呼び出し側のトランザクションで走るので、**1行でも raise すれば
--   文全体がロールバックする**＝部分適用が残らない（pgtest B4 で実証）。
--
-- 入力 p_rows は**オブジェクトの配列**。各要素のキー（単数形の引数と同名）:
--   member_id, name, yomi, member_kind, grade, city,
--   set_member_kind, set_grade, set_city, deleted_at, touch_deleted_at
--   ★ set_* / touch_deleted_at は省略時 false（＝クラウドを壊さない側に倒れる）。
--   ★ 同じ member_id が複数回現れた場合は**後勝ち**（ループ順＝配列順）。
--
-- 上限: 1リクエストで 1000 件まで。**これは到達しうる分岐**（クラブ名簿全体を
--   一括操作する経路が将来つながりうる）ため、無言で切り捨てず raise で知らせる。
--   pgtest B7 で実際に 1001 件を投げて赤を確認している（テストされない防御は置かない）。
--
-- 権限: **security invoker**。呼び出す単数形も invoker なので RLS はそのまま効き、
--   この関数で権限は一切増えない。anon に EXECUTE を与えない。
--
-- 冪等: create or replace。既存データ・既存ポリシー・既存列・既存関数を変更しない純追加。
-- =============================================================================

create or replace function public.app_upsert_member_edits_bulk(
  p_club uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row     jsonb;
  v_one     jsonb;
  v_results jsonb := '[]'::jsonb;
  v_n       integer;
begin
  if p_club is null then
    raise exception '送信先クラブを特定できません。';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '送信データの形式が不正です（オブジェクトの配列を渡してください）。';
  end if;

  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then
    raise exception '対象が1件もありません。';
  end if;
  if v_n > 1000 then
    raise exception '一度に送れるのは1000件までです（%件が渡されました）。', v_n;
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception '送信データの形式が不正です（配列の要素がオブジェクトではありません）。';
    end if;

    -- ★ ここで単数形をそのまま呼ぶ。列の保全規則は向こうに1箇所だけ存在する。
    --   1行でも raise すれば、この関数を含む文全体がロールバックする。
    v_one := public.app_upsert_member_edit(
      p_club,
      v_row->>'member_id',
      v_row->>'name',
      v_row->>'yomi',
      v_row->>'member_kind',
      v_row->>'grade',
      v_row->>'city',
      coalesce((v_row->>'set_member_kind')::boolean, false),
      coalesce((v_row->>'set_grade')::boolean, false),
      coalesce((v_row->>'set_city')::boolean, false),
      (v_row->>'deleted_at')::timestamptz,
      coalesce((v_row->>'touch_deleted_at')::boolean, false)
    );

    v_results := v_results || jsonb_build_object(
      'member_id', v_row->>'member_id',
      'result',    v_one
    );
  end loop;

  return jsonb_build_object('count', v_n, 'rows', v_results);
end;
$$;

-- 権限の締め方は app_upsert_member_edit / app_hard_delete_members と同形。
--   ★ 効いているのは `from public` の revoke（anon には明示 grant が無いので `from anon` は
--     今日は no-op）。「anon を締めている根拠」は pgtest B8/B9（実際に呼んで
--     permission denied for function を確認）である。
revoke all on function public.app_upsert_member_edits_bulk(uuid, jsonb) from public;
revoke all on function public.app_upsert_member_edits_bulk(uuid, jsonb) from anon;
grant execute on function public.app_upsert_member_edits_bulk(uuid, jsonb) to authenticated;

comment on function public.app_upsert_member_edits_bulk(uuid, jsonb)
  is 'MEMBER-UPSERT-RPC-001 bulk (#909): app_upsert_member_edit を1トランザクションで N 件回す。判定ロジックは単数形に1箇所。security invoker＝RLS はそのまま。';
