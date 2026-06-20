# DATA-PERSISTENCE-PHASE2 / Stage A 設計ノート（Supabase スキーマ＋RLS＋マジックリンク・ログイン）

- 日付: 2026-06-20 ／ 担当: Claude Code（実装ライン） ／ Issue #255
- 正本: `ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md`（更新3 / Phase2 受入①②③⑤）
- 依頼: `ai-requests/2026-06-20_claude-code_data-persistence-impl-phase2-stageA.md`
- base: orphan clean base `33a8920`（#253 後）／ Review Level: **L3（runtime）＋ SQL → Draft 後 Codex 必須**

## 0. 結論（設計の芯）
Stage A は **クラウドの土台**＝テーブル＋RLS＋パスワードレス・ログイン＋幹事管理 だけを作る。
**当日運営（`shogi_v4.html` / localStorage）は 1 行も触らない別レイヤー**。クラウド同期（Stage B）・
PWA（Stage C）はやらない。氏名は非公開 `members` に集約し、**active organizer 以上のみ** RLS で読める。

## 1. runtime への組み込み方
### 1.1 app shell の置き場所 — 別ページ `app/`
- 新規 `app/index.html` を **独立したエントリ**として追加（当日運営アプリ `shogi_v4.html` とは別ページ）。
  当日運営はローカルファーストのまま無改変。クラウドは「別 URL の薄い管理アプリ」として併存。
- 将来 Stage B で確定結果の同期ブリッジを薄く足す前提だが、Stage A は **認証＋幹事管理のみ**。
- 採用理由: 当日運営の localStorage/UI を一切壊さない（HANDOFF 絶対ルール「追加のみ」）。1 ファイル巨大化を避け、
  クラウド層の依存（supabase-js）を当日運営に持ち込まない。

### 1.2 supabase-js の読み込み — CDN（ビルドレス）
- `app/index.html` で `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js`（UMD・global `supabase`）。
- 本 repo の no-build / 単一ファイル思想に合わせ、バンドラを増やさない。

### 1.3 publishable key / URL の注入 — 非コミットの local config（人間選択: 「Untracked local config + placeholder」）
- `app/config.js`（**`.gitignore` 済・非コミット**）が `window.SHOGI_CLOUD_CONFIG = {url, publishableKey}` を定義。
- repo には **ひな形 `app/config.example.js`（プレースホルダ）だけ**をコミット。public repo に実値を載せない。
- `index.html` は `config.js`→`supabase-js`→`auth.js` の順で読み込み、`ShogiAuth.boot()` が config 未設定/置換漏れ/
  supabase 未ロードを検知して**親切な設定エラー**を出す（クラッシュしない）。
- **secret key（`sb_secret_…`）はクライアントに一切置かない**（publishable と URL のみ）。
- 補足: publishable key は設計上クライアント公開可（RLS で保護）。本 repo は public のため、運用方針として
  実値は非コミット config に置く（人間確認の結論）。コミット派に切り替える場合も secret は不変で禁止。

## 2. データモデル（`supabase/migrations/`）
- `20260620130000_stagea_schema.sql`: `clubs / organizers / members / players / tournaments / entries`。
  **全テーブルに `club_id`**（多テナント分離。`clubs.id` 自体がテナント境界）。氏名は `members` のみ。
  `matches / ranking_rules / annual_ranking` は本 Stage 対象外。
- `organizers.user_id` は **NULL 可**＝「メール招待済みだが未ログイン」。`email` は NOT NULL（招待・本人照合に必須）、
  `unique(club_id, lower(email))` で重複招待を防ぐ。

## 3. RLS（`20260620130100_stagea_rls.sql`）— 既定拒否の許可リスト
- 全 6 テーブルで RLS 有効化。判定は SECURITY DEFINER 関数に集約（**RLS 再帰を回避**）:
  - `app_is_active_member(club)` = 自分（`auth.uid()`）の **active** organizer 行が当該 club にある。
  - `app_is_admin(club)` = それが **owner/admin**。
- ポリシー要点（正本 更新3 の最低ライン）:
  - 未ログイン（`auth.uid()` is null）/ retired / suspended / 別 club は **全拒否**（許可述語が false）。
  - `members`（氏名）は active organizer 以上のみ SELECT。
  - `organizers` の INSERT（招待）/ UPDATE（停止・退任）は **owner/admin のみ**。
  - 書き込みは WITH CHECK で **別 club への混入を拒否**。
  - 匿名 publishable（anon ロール）は SELECT 権限を**与えた上で** RLS が全拒否＝「権限不足」でなく
    「RLS が拒否」を実証可能にする。
- `prevent_last_admin_removal()` トリガ: **最後の active owner/admin を 0 人にする** 停止/退任/降格/削除を阻止。

## 4. 招待 → claim（`20260620130200_stagea_auth_claim.sql`）
- 管理者は `organizers` に「メール＋役割」だけ先に追加（`user_id` NULL の招待行）。
- 招待された本人がマジックリンクでログイン後 `claim_organizer_seat()`（SECURITY DEFINER）を呼ぶと、
  email 一致の未claim行に `auth.uid()` を結びつけ、所属一覧（JSON）を返す。これで初めて RLS が自 club を通す。
- 未登録メール（一致行なし）は空配列 → クライアントが「幹事登録がありません。管理者へ連絡」を表示。
- retired は claim 対象外（復帰は管理者の再有効化）。

## 5. ログイン体験（`app/auth.js`・build/bind/coordinator）
- パスワードレス `signInWithOtp`（`shouldCreateUser:true`・`emailRedirectTo`）。**パスワード欄・「お忘れ」導線なし**。
- セッションは supabase-js が長期保持。再訪は開くだけ。`onAuthStateChange` でリンク帰着を再評価。
- 復旧＝同じメールで再送（再送ボタン）。機種変更も同じメールで再ログイン。
- 管理（owner/admin）: 招待（insert）/ 一時停止（suspended）/ 退任（retired）/ 再有効化。
  **最後の active owner/admin はクライアントでも disabled＋拒否**（最終強制は §3 のトリガ）。
- **権限判定は必ず DB 側 RLS**。URL の club 指定は表示/導線用のみ（権限を持たせない）。

## 6. 「セッション無効化」の Stage A 範囲（明示）
- 他人のトークンの**ハード失効**は admin API（service role）が要るため Stage B。
- Stage A は **status=suspended/retired** で RLS が次アクセスから即アクセス遮断＝実質的な権限失効を提供。

## 7. テスト
- `test/stagea_rls_pgtest.sh`: migrations を**実 PostgreSQL** に適用（Supabase 互換 `auth.uid()/auth.email()` シム）、
  未ログイン/別club/retired/suspended/members氏名/admin限定/最後のadminガード/publishable単体拒否/招待claim を
  **29 アサーションで実証**（psql 不在なら SKIP）。
- `test/test_stagea_login.js`: `app/auth.js` の純ロジックを mock client で 28 アサーション
  （パスワードレス/claim/未登録案内/最後のadminガード/招待）。
- 非回帰: `shogi_v4.html` の当日運営テストは無改変で全 green（合計 72→74、新規 FAIL/WARN 0）。

## 8. 着手前提（人間タスク）充足（`supabase-setup-checklist.md`）
鍵保管✅ / Email プロバイダ有効化✅ / owner メール✅ / クラブ名✅（Supabase project ref / URL / 実キーは Issue #255・cowork 管理＝**本 repo には載せず** `app/config.js`（非コミット）に設定）。
**実 Supabase へのログイン疎通は実値（非コミット config）配置後に人間が実施**（実キーは Claude に渡らない＝当方は
ローカル PostgreSQL での RLS 実証とブラウザ smoke まで）。
