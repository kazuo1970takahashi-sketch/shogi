-- =============================================================================
-- MEMBER-UPSERT-RPC-001 (#909): 会員 upsert を「INSERT は完全な行・UPDATE は指定列だけ」に
--
-- 出どころ: #901 の Codex 2巡目 P1（r3802131305）。#901（PR #908）は編集 push を
--   「送信前に members を読む → 操作していない欄はクラウド値を採用して upsert」にして本題
--   （ふりがなの誤字を直しただけで区分・級・市町村が既定値と NULL で潰れる＝実測 500円/人の
--   誤徴収）を塞いだが、「読んでから書く」構造そのものに由来する穴が2つ残った。
--
--   ① 読み取り失敗 ＋ その会員の初回 push → 属性が NULL の行ができる
--      #901 は読めなかったとき未操作の属性列を「送らない」ことで既存行を守る。既存行には
--      正しいが、クラウドにまだ行が無い会員だと INSERT が走り member_kind/grade/city が
--      NULL の行になる。まっさらな別端末がそれを pull すると mergeCloudMembersIntoMaster の
--      非空ガードで属性が入らず、normalizeBranchMaster が member/ippan/市町村なし へ確定する
--      ＝誤った会費属性が運用に入る。⚠ は push した端末にしか出ないので被害側は気づけない。
--
--   ② select→upsert の窓で他端末の更新を巻き戻す（#907 の 1.・#901 が新設した窓）
--      読んだ値をそのまま書き戻すため、読み取りから upsert までの間に別端末が更新すると消える。
--      受付席と本部席で同時に名簿を触る場面が該当する。
--
-- 対策: PostgreSQL の `insert ... on conflict do update set` は **set 句に挙げた列だけ**を
--   更新し、挙げなかった列の既存値はそのまま残る。これを 1文・1トランザクションで実行する:
--     新規行 … excluded（＝端末のローカル値）で **完全な行** が入る          → ① が消える
--     既存行 … name / yomi / deleted_at と「利用者が操作した属性」だけ更新   → ② が消える
--   事前の select が不要になるので、読み取り失敗もタイムアウトも競合窓も**原理的に生じない**。
--
-- 引数:
--   p_club, p_member_id                      対象（members の主キー club_id, member_id）
--   p_name, p_yomi                           氏名・ふりがな（常に更新。下記「name/yomi の扱い」）
--   p_member_kind, p_grade, p_city           端末のローカル値。**新規行の INSERT には常に載る**
--                                            （＝完全な行にする。ここが ① の対策の要）
--   p_set_member_kind, p_set_grade, p_set_city
--                                            既存行に対してその列を更新するか（＝利用者が
--                                            その欄を操作したか）。false なら既存値を1バイトも
--                                            変えない。既定 false ＝ 呼び出し側が渡し忘れても
--                                            クラウドを壊さない側に倒れる
--   p_deleted_at, p_touch_deleted_at         削除/復元 push 用。p_touch_deleted_at=false（既定）
--                                            のとき既存行の deleted_at には触れない（＝編集 push が
--                                            tombstone を復活させない）。新規行では false のとき
--                                            null（＝生存）で入る
--
-- 返り: jsonb { inserted, member_kind, grade, city, deleted_at }
--   実際にクラウドへ残った値を返す。クライアントは「端末の表示と違う値が残った欄」を
--   これで判定して ⚠ に出せる（#901 の _editAttrKeptNote 相当を、推測ではなく実値でできる）。
--   ★ inserted の判定は RETURNING の xmax=0 イディオム。**表示用のヒント**であり、
--     正しさの根拠には使わない（列の保全は set 句の構造そのものが保証する）。
--
-- name / yomi の扱い（意図的に「常に更新」）:
--   現行の upsert も削除/復元 push も name/yomi を無条件に送っており、本 RPC はその性質を
--   変えない（＝この置き換えで退行しない）。「削除 push が別端末で直した氏名を巻き戻しうる」
--   という性質は #909 の対象外＝#907 系の別件として残す。ここで一緒に変えると、
--   本 RPC の効果（属性列の保全）と混ざって切り分けられなくなる。
--
-- 権限: **security invoker**。RLS はそのまま有効で members_insert / members_update の
--   app_is_active_organizer(club_id) が効く＝この RPC で権限は一切増えない。
--   on conflict do update は INSERT の with check と UPDATE の using/with check の両方を
--   通るため、別クラブの行は insert 側で弾かれる。anon には EXECUTE を与えない。
--
-- 語彙の検証: member_kind / grade は関数内で whitelist 検証する（クライアントの正規化に
--   依存しない）。city は自由入力＝既存方針どおり検証しない（20260702150000 の判断を踏襲）。
--   ★ 検証は「渡された値が非 NULL のとき」に常に行う。p_set_* が false でも **新規行の
--     INSERT には載る**ので、そこを素通しにすると不正な語彙が入りうる。
--
-- 冪等: create or replace。既存データ・既存ポリシー・既存列は変更しない純追加。
--   clubs 等の他テーブルに触れないので test/clubs_provision_denied_pgtest.sh の証明に影響しない。
-- =============================================================================

create or replace function public.app_upsert_member_edit(
  p_club              uuid,
  p_member_id         text,
  p_name              text,
  p_yomi              text,
  p_member_kind       text,
  p_grade             text,
  p_city              text,
  p_set_member_kind   boolean default false,
  p_set_grade         boolean default false,
  p_set_city          boolean default false,
  p_deleted_at        timestamptz default null,
  p_touch_deleted_at  boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inserted    boolean;
  v_member_kind text;
  v_grade       text;
  v_city        text;
  v_deleted_at  timestamptz;
begin
  if p_club is null then
    raise exception '送信先クラブを特定できません。';
  end if;
  if p_member_id is null or p_member_id = '' then
    raise exception '会員を特定できません。';
  end if;
  if p_name is null then
    raise exception '氏名が指定されていません。';
  end if;

  -- 語彙の検証（非 NULL のときは常に。p_set_* が false でも新規行の INSERT には載るため）。
  if p_member_kind is not null and p_member_kind not in ('member', 'other') then
    raise exception '支部員区分の値が不正です: %', p_member_kind;
  end if;
  if p_grade is not null and p_grade not in ('ippan', 'chu', 'josei') then
    raise exception '会費区分の値が不正です: %', p_grade;
  end if;

  insert into public.members as m (
    club_id, member_id, name, yomi, member_kind, grade, city, deleted_at
  )
  values (
    p_club, p_member_id, p_name, p_yomi, p_member_kind, p_grade, p_city,
    case when p_touch_deleted_at then p_deleted_at else null end
  )
  on conflict (club_id, member_id) do update set
    name        = excluded.name,
    yomi        = excluded.yomi,
    -- ★ ここが本 RPC の本体。false の列は set 句に現れない＝既存値をそのまま残す
    --   （coalesce ではなく m.<列> を明示的に書き戻す形にしているのは、NULL の既存値も
    --     「そのまま NULL のまま」保つため。coalesce(excluded.x, m.x) だと未操作でも
    --     既存 NULL が端末値で埋まってしまい、保全になっていない）。
    member_kind = case when p_set_member_kind then excluded.member_kind else m.member_kind end,
    grade       = case when p_set_grade       then excluded.grade       else m.grade       end,
    city        = case when p_set_city        then excluded.city        else m.city        end,
    deleted_at  = case when p_touch_deleted_at then p_deleted_at        else m.deleted_at  end
  returning (xmax = 0), m.member_kind, m.grade, m.city, m.deleted_at
  into v_inserted, v_member_kind, v_grade, v_city, v_deleted_at;

  -- ★ ここに「0 行だったら失敗させる」分岐は置かない。
  --   RLS 違反（別クラブ・viewer・未ログイン）は insert の with check / update の using で
  --   **raise する**＝黙って 0 行になることがない（test/member_upsert_rpc_pgtest.sh U22–U24 で実証）。
  --   到達しない分岐を防御として置くと、テストがその死んだ枝を守ることになる
  --   （#901 で退役済みモーダルに実装して 26/26 緑になった失敗と同じ形）。

  return jsonb_build_object(
    'inserted',    v_inserted,
    'member_kind', v_member_kind,
    'grade',       v_grade,
    'city',        v_city,
    'deleted_at',  v_deleted_at
  );
end;
$$;

-- 権限の締め方は app_hard_delete_members と同形にそろえる。
--   ★ 反証パネルの実測（2026-08-18・M12）: **効いているのは `from public` の revoke だけ**。
--     `from anon` の行を消しても pgtest は 35/0 のまま緑（anon に明示 grant を出していないので
--     元から権限が無い）＝この1行は今日は no-op。既存 RPC との読み比べのために残すが、
--     「anon を締めている根拠」はこの行ではなく U25/U27（実際に呼んで permission denied を確認）である。
revoke all on function public.app_upsert_member_edit(uuid, text, text, text, text, text, text, boolean, boolean, boolean, timestamptz, boolean) from public;
revoke all on function public.app_upsert_member_edit(uuid, text, text, text, text, text, text, boolean, boolean, boolean, timestamptz, boolean) from anon;
grant execute on function public.app_upsert_member_edit(uuid, text, text, text, text, text, text, boolean, boolean, boolean, timestamptz, boolean) to authenticated;

comment on function public.app_upsert_member_edit(uuid, text, text, text, text, text, text, boolean, boolean, boolean, timestamptz, boolean)
  is 'MEMBER-UPSERT-RPC-001 (#909): 会員 upsert。新規行は完全な行で INSERT・既存行は p_set_* が true の属性列と name/yomi(/deleted_at) だけ更新する。security invoker＝RLS はそのまま。';
