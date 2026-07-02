-- CITY-UNIFY-001 (2026-07-03): 市町村の格納列を city に一本化するデータ移行。
--   経緯: B-4 過去大会取り込み（2026-06）の時点では members に city 列が無く、市町村を branch 列に
--   格納していた。20260702150000 で city 列を追補した際にデータ移行を行わなかったため、
--   「支部（branch）列に市町村が入り、city 列は空」の不整合が発生（作者指摘 2026-07-03）。
--   本 migration で branch の値を city へ移行し、branch をクリアする（branch の中身は全て市町村）。
--   冪等: 1文目は city が空の行のみ・2文目は branch 非 null の行のみ＝2回目以降は対象 0 行で no-op。
--   branch 列自体は将来の複数支部展開用に残す（アプリは以後 branch を読み書きしない）。
--
-- 実行手順（L3 P2-1・P3-1）:
--   0) 実行前確認（衝突 0 行を目視）: select member_id,name,city,branch from public.members
--      where city is not null and branch is not null and city <> branch;
--   1) 本 migration を SQL Editor で実行。
--   2) 実行後・次回の ☁送信より前に、運用端末の当日アプリで「☁ 取得（名簿取得）」を1回実行する。
--      （ローカルマスタに city が無い端末から先に ☁送信すると、当日参加者分の city が null で
--      　上書きされ移行が巻き戻るため。名簿取得で city を下ろしてから運用を再開する）
update public.members set city = branch where city is null and branch is not null;
update public.members set branch = null where branch is not null;
