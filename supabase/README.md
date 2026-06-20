# supabase/ — クラウド土台（Phase 2 Stage A: スキーマ＋RLS）

DATA-PERSISTENCE-PHASE2-STAGE-A の SQL マイグレーション。当日運営（`shogi_v4.html` / localStorage）には影響しない別レイヤー。
設計の全体像: `docs/specs/20260620_data_persistence_phase2_stagea_design.md`。

## ファイル
- `migrations/20260620120000_stagea_schema.sql` … clubs / organizers / members / players / tournaments / entries（全テーブル club_id）。
- `migrations/20260620120100_stagea_rls.sql` … RLS 有効化＋ポリシー＋ヘルパ関数＋最後の owner/admin ガード。

## ★秘密情報の取り扱い（絶対）
- **secret key（`sb_secret_…`）は repo・HTML・チャットに置かない。** server 専用。
- **publishable key（`sb_publishable_…`）と Project URL** は本来クライアント公開前提だが、repo にコミットしてよいかは**運用方針として人間確認**を取る（Issue #255 のゲート）。
  - 安全な既定: クライアント設定は **gitignore 済みのローカル設定**（`cloud/supabase-config.local.js`、A3 runtime で導入予定）から読む。repo には `*.example` テンプレートのみ。
- 実会員名簿（実データ）を migrations / seed / テストに入れない（架空・プレースホルダのみ）。

## 適用方法（どちらか）
### A) Supabase SQL Editor（手軽・推奨の初手）
1. Supabase ダッシュボード → SQL Editor。
2. `20260620120000_stagea_schema.sql` を貼って実行。
3. 続けて `20260620120100_stagea_rls.sql` を貼って実行。

### B) Supabase CLI（`supabase db push`）
- `supabase link` 済みのプロジェクトで `supabase db push`（migrations/ をタイムスタンプ順に適用）。

## 初回 owner の bootstrap（RLS の外で1回だけ）
RLS は「既存 active 幹事」を前提にするため、**最初の1行（owner）は SQL Editor / service role で投入**する（これは設計どおり）。
クラブ名・owner の個人メール確定後に、ダッシュボードで以下を1回だけ実行（**実値はチャット/repo に貼らない**・ダッシュボード内で直接入力）:

```sql
-- 1) クラブを作る（name は実クラブ名を直接入力）
insert into public.clubs (name) values ('（クラブ名）') returning id;

-- 2) owner 幹事を作る（user_id は Authentication で当該メールがサインアップ後に得られる auth.users.id）
--    role='owner', status='active'。email/display_name は実値を直接入力。
insert into public.organizers (club_id, user_id, role, status, display_name, email)
values ('（上で得た club_id）', '（auth.users.id）', 'owner', 'active', '（表示名）', '（メール）');
```

> owner の auth ユーザーは、A3 ログイン（マジックリンク）でそのメアドが初回サインインした時点で `auth.users` に作られる。
> 先に organizers を入れたい場合は、ダッシュボードの Authentication → Users で当該メールを招待/作成して user_id を得る。

## 検証
- 静的検証（live DB 不要）: `node test/test_supabase_stagea_schema.js`（npm test に登録済）。テーブル/club_id/RLS 有効化/必須ポリシー/ヘルパ/ガードトリガ/secret 非混入/PII 非混入を固定。
- **RLS の実効検証（未ログイン/別club/retired/氏名/publishable 単体拒否）は live プロジェクトで実施**＝prereq（Email 有効化・owner メール・クラブ名）完了後。本 Stage では未実施。
