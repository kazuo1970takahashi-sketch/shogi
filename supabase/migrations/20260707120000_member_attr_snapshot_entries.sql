-- =============================================================================
-- MEMBER-ATTR-SNAPSHOT-001 (#607) — entries に会員属性スナップショット列を追補
--   支部員区分(member_kind)・会費区分(grade)・市町村(city)の「大会当時の値」を entries に固定する。
--   正本は members（現在値）だが、区分変更・転居で過去大会の集計根拠が後から変わって見える問題を、
--   送信時に当日 player レコード（登録時点値）から entries へ焼き込むことで解消する（#607 設計 #666）。
--   方針: 追加のみ・冪等（add column if not exists）・nullable（旧行=null＝未取得→読取で members 現在値へフォールバック）。
--   CHECK 制約は付けない（fail-soft・将来値の追加余地）。列追加は entries の RLS ポリシーに影響しない。
--   sos/sodos（Stage B-0 / 20260623120000）と同じ「専用フラット列」パターン。
-- =============================================================================
alter table public.entries
  add column if not exists member_kind text,
  add column if not exists grade       text,
  add column if not exists city        text;

comment on column public.entries.member_kind is '大会当時の支部員区分スナップショット（当日 player 由来 member/other。null=旧行/未取得→members 現在値へフォールバック）。MEMBER-ATTR-SNAPSHOT-001 / #607';
comment on column public.entries.grade       is '大会当時の会費区分スナップショット（ippan/chu/josei）。MEMBER-ATTR-SNAPSHOT-001 / #607';
comment on column public.entries.city        is '大会当時の市町村スナップショット（正規化済み・空文字=当時 city 無し・null=旧行/未取得）。MEMBER-ATTR-SNAPSHOT-001 / #607';
