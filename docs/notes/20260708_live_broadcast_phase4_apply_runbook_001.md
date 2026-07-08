# LIVE-BROADCAST-001 Phase4 — Supabase 適用 & live スモーク 手順書

対象: LIVE-BROADCAST-001 Phase4（Realtime Broadcast）。コードは production `?v=106` に反映済み。**本手順（Supabase migration の実適用）を実行するまで Realtime は動かず、その間も Phase3 の5秒ポーリングにフォールバックするため配信自体は動作します**（適用後に約1秒の即時化になります）。

> **適用実績**: 本番 Supabase プロジェクトへ **2026-07-08 に適用済み**（STEP 2 の検証7項目すべて期待どおり・anon INSERT ポリシー=0 を確認）。本書は再適用・別プロジェクト展開・ロールバック用の正本として残す（冪等なので再実行可）。**live スモーク（STEP 3）は次回大会等で実施予定。**

- 前提: 大会アプリのクラウド機能（Phase1〜3）が既に本番稼働中＝`public.public_live_snapshots`／`start_live_session`/`publish_live_snapshot`/`stop_live_session`／`organizers`/`clubs` は適用済み。
- 実行者: 本番 Supabase プロジェクトの owner（SQL Editor は service_role 権限で走る）。
- 冪等: このマイグレーションは `create or replace` / `drop ... if exists` / `drop policy if exists` で書かれており、**二重に実行しても安全**です。

---

## STEP 1. マイグレーションを適用する

Supabase ダッシュボード → 対象プロジェクト → 左メニュー **SQL Editor** → **New query** → 下の SQL を**全文貼り付けて Run**。

```sql
-- =============================================================================
-- LIVE-BROADCAST-001 Phase 4 — 参加者向けライブ配信の Realtime Broadcast 上乗せ
--   設計正本: 設計PR #533 の docs/specs/20260704_live_broadcast_001_participant_realtime_design.md（base へは未 merge）
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
```

「Success. No rows returned」と出れば適用完了です。エラーが出た場合は STEP 3 のロールバックを見ずに、まずエラーメッセージを控えてください（前提テーブル未適用なら Phase3 マイグレーションが先に必要）。

---

## STEP 2. 適用できたかを確認する（読み取りのみ・安全）

同じ SQL Editor で下を Run。**期待値**の通りなら成功です。

```sql
-- (1) helper 関数：SECURITY DEFINER で存在するか（prosecdef=true 期待）
select proname, prosecdef
from pg_proc
where proname = 'live_slug_is_public';
-- 期待: live_slug_is_public / prosecdef = true が1行

-- (2) broadcast トリガ関数が存在するか（prosecdef=true 期待）
select proname, prosecdef
from pg_proc
where proname = 'tg_public_live_snapshot_broadcast';
-- 期待: 1行 / prosecdef = true

-- (3) publish 起点トリガが public_live_snapshots に付いているか
select tgname
from pg_trigger
where tgrelid = 'public.public_live_snapshots'::regclass
  and not tgisinternal;
-- 期待: public_live_snapshots_broadcast を含む

-- (4) realtime.messages の受信ポリシー（SELECT・anon/authenticated）
select policyname, cmd, roles
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
  and policyname like 'live:%';
-- 期待: "live: anon can receive is_public broadcast" / cmd = SELECT / roles に anon, authenticated

-- (5) helper の EXECUTE 権限が anon に付いているか（送信ではなく受信判定用）
select grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'live_slug_is_public';
-- 期待: grantee に anon と authenticated（privilege_type = EXECUTE）

-- (6) realtime.messages に RLS が有効か
select relrowsecurity
from pg_class
where oid = 'realtime.messages'::regclass;
-- 期待: relrowsecurity = true

-- (7) ★重要：anon に realtime.messages への INSERT ポリシーが無いこと（＝クライアント送信不可）
select count(*) as anon_insert_policies
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
  and cmd = 'INSERT' and roles::text like '%anon%';
-- 期待: anon_insert_policies = 0
```

(7) が **0** であることが「参加者は受信のみ・送信できない（spoof 不可）」の担保です。ここだけは必ず確認してください。

---

## STEP 3. live スモーク（実環境での動作確認・Codex 明示の本番昇格条件）

実機（スマホ）と運営端末（クラウド管理ページ app/ にログイン済み）を用意します。

### 3-1. 配信を開始して受信できるか（③ publish trigger で受信）
1. 運営アプリの順位タブ →「📡 参加者向けライブ配信（任意）」→ **「📡 ライブ配信を開始」**（表示名モードは通常「姓＋番号のみ」）。
2. 表示された **QR/URL をスマホで開く**（`?live=<slug>#scoreboard`）。数秒で星取表が出ること。
3. 運営端末で**結果を1件入力して保存**。→ **スマホ側が数秒（体感ほぼ即時＝約1秒）で更新**されれば Realtime 受信 OK。
   - 参考: migration 未適用だと更新は最大5秒（ポーリング）になります。適用後は publish 直後に更新されます。

### 3-2. 通信断でもポーリングが継続するか（④ WS 断でも polling 継続）
1. スマホの Wi-Fi を一度 OFF→ON（または機内モードを数秒）にする。
2. 復帰後、運営端末で結果を保存 → スマホが（遅くとも5秒で）更新されれば fail-soft OK。

### 3-3. anon が subscribe できるか（① anon subscribe 成功）
- 3-1 でスマホ（＝publishable key の anon）が更新を受け取れていれば subscribe 成功が確認できています。
- 厳密に見たい場合（任意・PC の Chrome）: 参加者 URL を開き、DevTools → Network → **WS** タブに `realtime` への WebSocket 接続が1本張られ、`phx_reply` で `status:"ok"`（join 成功）が返っていることを確認。

### 3-4. anon が送信できないこと（② anon channel.send 失敗）★セキュリティ確認
参加者 URL を PC Chrome で開き、DevTools → Console に下を貼って実行（`<slug>` は QR の slug に置換）。**送信が拒否される（ok にならない/タイムアウト）**のが正しい挙動です。

```js
// 参加者ページ（?live=<slug>#scoreboard）の Console で実行。<slug> を実際の値に。
(async () => {
  const cfg = window.SHOGI_LIVE_PUBLIC_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey, {auth:{persistSession:false}});
  const ch = sb.channel('<slug>', { config: { private: true, broadcast: { ack: true } } });
  await new Promise(r => ch.subscribe(s => { console.log('subscribe:', s); if (s === 'SUBSCRIBED') r(); if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') r(); }));
  const res = await ch.send({ type: 'broadcast', event: 'snapshot', payload: { spoof: true } }).catch(e => 'error:' + e);
  console.log('send result (期待: "ok" 以外＝送信拒否):', res);
  sb.removeChannel(ch);
})();
```

- 期待: `send result` が **`"ok"` にならない**（`error` / `timed out` 等）。もし `"ok"` が返ったら anon 送信が通っている＝ポリシー要見直しなので、その旨を連絡してください。

---

## ロールバック（配信を無効化したい/問題が出た場合）

Phase4 は追加のみ・fail-soft なので、**トリガとポリシーを外せば Phase3（ポーリング）に戻ります**（アプリ側の変更は不要）。SQL Editor で:

```sql
-- broadcast トリガを外す（publish は従来どおり動作・ポーリング配信は継続）
drop trigger if exists public_live_snapshots_broadcast on public.public_live_snapshots;

-- 受信ポリシーを外す（anon の realtime 受信を止める。RLS 有効のままなので受信不可＝ポーリングのみ）
drop policy if exists "live: anon can receive is_public broadcast" on realtime.messages;

-- （任意）ヘルパ/トリガ関数も消す場合
-- drop function if exists public.tg_public_live_snapshot_broadcast();
-- drop function if exists public.live_slug_is_public(text);
```

外しても参加者ビューは5秒ポーリングで更新され続けます（配信は止まりません）。

---

## メモ
- 無料枠: Supabase Realtime Free = 200 同時接続 / 2M メッセージ月。数十人規模なら桁が余ります（設計 §2）。
- Free プロジェクトは7日無アクセスで pause されるので、大会前日に一度ダッシュボードを開く/軽く叩くと安全です（設計 §7-5）。
- 本手順の正本コード: `supabase/migrations/20260708120000_live_broadcast_phase4_realtime.sql`（orphan base `3594169`）。
