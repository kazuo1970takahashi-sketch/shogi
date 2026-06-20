# Supabase — Stage A（スキーマ＋RLS＋マジックリンク・ログイン）

DATA-PERSISTENCE-PHASE2 / Stage A の **クラウド土台**。当日運営（`shogi_v4.html` / localStorage）には
一切影響しない別レイヤー。詳細設計は `docs/specs/20260620_data_persistence_phase2_stagea_design.md`。

## 構成
```
supabase/
  migrations/
    20260620130000_stagea_schema.sql      -- clubs/organizers/members/players/tournaments/entries（全テーブル club_id）
    20260620130100_stagea_rls.sql         -- RLS 有効化・許可判定関数・ポリシー・最後のadminガード・grant
    20260620130200_stagea_auth_claim.sql  -- 招待→初回ログインで席を claim する関数
  seed.example.sql                        -- 最初のクラブ＋owner 招待（ひな形・実値は非コミット）
app/
  index.html                              -- 幹事ログイン/管理アプリ（当日運営とは別ページ）
  auth.js                                 -- マジックリンク/セッション/claim/幹事管理（build/bind/coordinator）
  config.example.js                       -- URL/publishable key のひな形（実値は app/config.js＝.gitignore）
```

## 適用手順（Supabase）
1. Dashboard → SQL Editor で `migrations/` を **番号順** に実行（または `supabase db push`）。
   - 前提: プロジェクトは「Enable automatic RLS = ON」。本マイグレーションは明示的に RLS を有効化＋ポリシー定義する。
2. ブートストラップ（**service role / SQL Editor＝RLS 回避が必要**・実値はコミットしない）:
   ```
   psql "$DB_URL" -v club_name="<クラブ名>" -v owner_email="<owner メール>" -f supabase/seed.example.sql
   ```
   owner は「メール招待行（user_id NULL）」として作られ、本人が初回マジックリンクでログインすると
   `claim_organizer_seat()` で `auth.uid()` が結びつき active owner になる。

## クライアント設定（鍵）
- `app/config.example.js` を `app/config.js` にコピーし、**Project URL** と **Publishable key**（`sb_publishable_…`）を入れる。
- `app/config.js` は **`.gitignore` 済＝コミットされない**（public repo に実値を載せない方針）。
- **Secret key（`sb_secret_…`）は絶対にクライアント/repo に置かない。** Stage A はクライアントから一切使わない。

## セキュリティモデル（RLS）
- 未ログイン / retired / suspended / 別 club は **全テーブル全拒否**。
- 氏名は `members` のみ。**active organizer 以上のみ** SELECT 可。
- `organizers` の招待（INSERT）・停止/退任（UPDATE）は **owner/admin のみ**。最後の active owner/admin は
  トリガで必ず1人残す。
- publishable key（anon）単体では何も開けない（RLS が拒否）。

## ローカル検証（実 PostgreSQL）
```
bash test/stagea_rls_pgtest.sh        # migrations を使い捨て DB に適用し RLS の deny/allow を実証（psql 必要・無ければ SKIP）
node test/test_stagea_login.js        # app/auth.js のログイン/claim/管理ロジック（mock client）
```
`auth.uid()/auth.email()` は Supabase が本番提供。ローカルテストでは互換シムを与えて検証する。

## 本 Stage の範囲外（後続）
- 確定大会の同期・オフライン継続・同期表示 = **Stage B**。
- PWA（manifest/アイコン/別OS案内） = **Stage C**。
- 他人セッションのハード失効（admin API/service role） = Stage B。Stage A は status=suspended/retired で
  RLS が次アクセスから即遮断する（実質的な権限失効）。
- `matches / ranking_rules / annual_ranking` = 後続 Phase。
