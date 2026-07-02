-- =============================================================================
-- CLOUD-MEMBER-FIELDS-001 / Stage C(schema) — members にローカルマスタの「真の属性」列を追補
--   作者要望（2026-07-02）「クラウドに全項目を持てばいいならそうしたい」を受けた設計判断:
--   - 追加するのは導出不可能な会員固有属性のみ＝支部員区分（member_kind）・会費区分（grade）・市町村（city）。
--   - 前回クラス・最終参加・参加回数は entries から導出できるため列にしない（二重管理の回避）。
--   値はアプリ（shogi_v4.html）のローカルマスタと同一語彙:
--     member_kind: 'member'（支部員）| 'other'（支部員以外）
--     grade:       'ippan'（一般）| 'chu'（中学生以下）| 'josei'（女性・会費は chu と同額）
--     city:        自由入力（最大20字はアプリ側で正規化）
--   同期経路: アプリの名簿タブ編集 push（?v=62 系）・削除/復元 push（?v=65 系）・☁送信・
--   「☁ 名簿全体を一括送信」（MASTER-BULK-PUSH-001）が本列へ書き、☁取得（pullMembersFromCloud→
--   mergeCloudMembersIntoMaster）が非空値のみローカルへ反映する（NULL は「未設定」＝ローカルを壊さない）。
--   方針: 追加のみ・冪等（add column if not exists）・check 制約は付けない（語彙の正規化はアプリ側・
--   既存 name/yomi/branch と同じ緩さを維持）。RLS ポリシー（club 単位判定）に影響しない。
-- =============================================================================
alter table public.members
  add column if not exists member_kind text,
  add column if not exists grade text,
  add column if not exists city text;

comment on column public.members.member_kind
  is '支部員区分: member=支部員 / other=支部員以外。NULL=未設定（旧行）。CLOUD-MEMBER-FIELDS-001';
comment on column public.members.grade
  is '会費区分: ippan / chu / josei。NULL=未設定（旧行）。CLOUD-MEMBER-FIELDS-001';
comment on column public.members.city
  is '市町村（任意・アプリ側で最大20字に正規化）。CLOUD-MEMBER-FIELDS-001';
