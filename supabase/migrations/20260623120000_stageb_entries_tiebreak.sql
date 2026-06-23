-- =============================================================================
-- DATA-PERSISTENCE-PHASE2 / Stage B-0 — entries タイブレーク列追補（sos / sodos）
--   Stage A の entries は tiebreak(numeric 単一) + rank_points のみで、当日アプリの
--   B(SOS=対戦相手の勝数合計) と C(SODOS=勝った相手の勝数合計) の 2 値が収まらない。
--   年間集計で B/C を再利用できるよう専用列を追加する。
--   方針: 追加のみ・冪等（add column if not exists）。既存列 tiebreak/rank_points は不変。
--   列追加は RLS ポリシー（entries 全体への許可判定）に影響しない。
--   正本: Stage B 設計 issue #343 §6・§11（作者確定: sos/sodos 列を追加）。
-- =============================================================================
alter table public.entries
  add column if not exists sos   numeric,
  add column if not exists sodos numeric;

comment on column public.entries.sos   is 'B: 対戦相手の勝数合計（SOS）。年間集計用。Stage B-0 / #343';
comment on column public.entries.sodos is 'C: 勝った相手の勝数合計（SODOS）。年間集計用。Stage B-0 / #343';
