-- =============================================================================
-- DATA-PERSISTENCE-PHASE2 / Stage B-5(schema) — members 論理削除列追補（deleted_at）
--   名簿アーキ（クラウド=正本／ローカル=オフラインキャッシュ・#343 B-3 設計）では、会員の
--   「退会／重複統合」を物理 delete（admin 限定・履歴 cascade 危険）ではなく tombstone で
--   表したい。B-3a の mergeCloudMembersIntoMaster は既にクラウド members の deleted_at を
--   前提（tombstone 反映・非復元）に書かれているが、実スキーマに列が無かった。本 migration で
--   その列を追加する。
--   論理削除＝update set deleted_at=now()／復元＝update set deleted_at=null。
--   RLS 上 members_update は active organizer 以上（幹事全員可）なので、論理削除/復元は
--   幹事全員が実行でき、物理 delete（admin 限定）とは別経路になる（#343 §11 / B-3 権限確定）。
--   方針: 追加のみ・冪等（add column if not exists）。既存列 name/yomi/branch は不変。
--   列追加は members の RLS ポリシー（club 単位の許可判定）に影響しない。
--   正本: Stage B 設計 issue #343（B-3 名簿アーキ・app/ 名簿編集 UI）。
-- =============================================================================
alter table public.members
  add column if not exists deleted_at timestamptz;

comment on column public.members.deleted_at
  is '論理削除（tombstone）時刻。NULL=有効。set=退会/統合済み。update 経路＝active organizer 全員可（物理 delete は admin 限定）。Stage B-5 / #343';
