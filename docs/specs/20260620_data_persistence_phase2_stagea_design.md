# 設計ノート: データ永続化 Phase 2 — Stage A（Supabase スキーマ＋RLS＋マジックリンク・ログイン）

発行: Claude Code（実装ライン） / 2026-06-20 / 対応 Issue: #255
正本: `ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md`（更新2・3＋§2 / Phase 2 受入①②③⑤）
依頼: `ai-requests/2026-06-20_claude-code_data-persistence-impl-phase2-stageA.md`
Supabase 準備: `ai-requests/2026-06-20_supabase-setup-checklist.md`

## 0. 本 PR の範囲（重要・先に読む）
Stage A は3要素＝**A1 スキーマ / A2 RLS / A3 マジックリンク・ログイン runtime**。本 PR には依頼の段階規定に従い **A1＋A2（SQL）と設計ノートのみ**を含める。A3（runtime ログイン）は下記2つの人間ゲートが開いてから着手する：

- **着手前提 2〜4 が未了**（Email プロバイダ有効化 / owner 個人メール / クラブ名）。依頼§着手前提に「2〜4 未了でも スキーマ＋RLS（SQL）は先行実装可。ログイン疎通の検証は 2〜4 完了後」「未了を検知したら RESULT に明記して止まる」と明記 → **本 PR は SQL を先行実装し、A3 runtime とログイン疎通検証は保留**。
- **publishable key/URL を repo にコミットしてよいかの人間確認**（依頼§設計ノート）。A3 のキー注入方式に直結するため、確認が取れてから runtime を書く。

→ 本 PR は **当日運営 `shogi_v4.html`（localStorage）を1行も変えない**。クラウドは「別レイヤーの土台（SQL）」を追加するのみ。A3 は follow-up（同 branch への追加 commit）で、人間確認後に safe-by-default で実装する。

## 1. なぜこの形か（設計の芯）
確定仕様（更新3）の核は「**引き継ぎを"渡さない"設計**＝共有クラウド＋個人別マジックリンク＋多テナント分離＋氏名は鍵付き非公開」。当日運営はローカルファースト維持。Stage A はその**土台＝認証境界とデータ境界（RLS）**を作る。土台が堅牢でないと氏名（個人情報）を載せられないため、Stage A の本丸は **RLS 網羅性**（未ログイン/別club/retired/suspended/氏名/publishable 単体拒否）。

## 2. スキーマ（A1）— `supabase/migrations/20260620120000_stagea_schema.sql`
正本 §2（更新2・3 改定）に準拠。**全テーブルに `club_id`**（多テナント分離）。`matches`/`ranking_rules`/`annual_ranking` は本 Stage 対象外。

| テーブル | 主キー | 役割 | 機微 |
|---|---|---|---|
| `clubs` | `id uuid` | テナント（クラブ） | 名称のみ |
| `organizers` | `id uuid` | 幹事。`user_id=auth.uid` / `role` owner·admin·organizer·viewer / `status` active·suspended·retired | メール・表示名 |
| `members` | `member_id text` | **会員名簿・非公開**（氏名・ふりがな・支部） | **氏名＝最重要機微** |
| `players` | `id uuid` | 競技者（`member_id` で名簿参照・成績用の匿名キー） | 氏名は持たない |
| `tournaments` | `id uuid` | 大会（date/season/status/source） | 実名・venue 実値を入れない |
| `entries` | `id uuid` | 出場（`unique(tournament_id, player_id)`・class・成績） | 氏名なし |

- 氏名は **`members` だけに集約**（players/entries は member_id 参照のみ）。これにより「氏名は active organizer 以上のみ読める」を1テーブルの RLS で守れる。
- FK は全て `club_id` を含む複合的な整合（各行が単一 club に属する）。`on delete` は保守的に `restrict`/`cascade` をテーブルごとに選択（migration 内コメント参照）。

## 3. RLS（A2・本丸）— `supabase/migrations/20260620120100_stagea_rls.sql`
**全テーブルで RLS 有効化＋deny-by-default**（ポリシー無＝拒否）。Supabase プロジェクト設定が「新規テーブル自動 RLS・自動公開 OFF」のため二重に安全。

### 3.1 再帰回避＝SECURITY DEFINER ヘルパ
ポリシーが `organizers` を直接サブクエリすると、`organizers` 自身のポリシー評価で**無限再帰**し得る。これを避けるため、`organizers` を RLS バイパスで読む `security definer` 関数を1段挟む（`search_path=public` 固定・最小権限）：
- `public.app_is_active_organizer() → boolean`（caller が active 幹事か）
- `public.app_my_club_id() → uuid`（caller の club_id・active のときのみ）
- `public.app_my_org_rank() → int`（owner=3/admin=2/organizer=1/viewer=0・非 active は -1）
全ポリシーはこの3関数だけを参照する（テーブル自己参照をしない）。

### 3.2 ポリシー要旨（依頼 A2＝最低ライン）
- **未ログイン全拒否**: `auth.uid()` 無 → ヘルパが false/-1 → 全ポリシー不成立 → 拒否。**publishable key 単体（anon ロール）で何も開けない**ことを RLS で保証。
- **club 分離**: 各行 `club_id = app_my_club_id()` のみ参照/更新可。
- **active のみ**: `app_is_active_organizer()`。suspended/retired は false → 読めない。
- **一般データ（clubs/players/tournaments/entries）**: active 幹事（rank≥0）が自 club のみ read。書込は rank≥1（organizer 以上）。
- **`members`（氏名）**: **read は rank≥1（organizer 以上）かつ active かつ同 club のみ**。viewer・未ログイン・retired・別 club は氏名を読めない。書込は rank≥2（admin/owner）。
- **`organizers` 管理**: read は同 club の active 幹事。**追加（INSERT）・停止/退任/ロール変更（UPDATE）は rank≥2（owner/admin）のみ**。自 club 限定。
- **最後の owner/admin ガード**: 「owner/admin を常に1人以上残す」は単一行ポリシーで表現できない横断不変条件のため、**`BEFORE UPDATE/DELETE` トリガ**で「当該変更後に同 club の active owner/admin が 0 になるなら raise」して守る（RLS と別レイヤーの整合制約）。

### 3.3 role ランクの意図
viewer は結果/順位は見られるが**氏名は見られない**（rank<1）。organizer 以上が名簿運用。owner/admin が幹事ロスター管理。URL に権限を持たせず、判定は必ず DB 側（このポリシー群）。

## 4. A3 runtime（本 PR では未実装・設計のみ提示）
人間確認後に同 branch へ追加する想定。**当日運営ロジック無改変**が絶対前提。
- **置き場所**: `shogi_v4.html` の当日運営とは分離した「クラウド/ログイン層」を別ファイル（例 `cloud/auth.js` + 最小 `cloud/login.html` もしくは shogi_v4 内の独立 `<section data-cloud-shell>` をデフォルト非表示で追加）として持つ。当日運営の `save/load/normalizeState` には触れない。
- **supabase-js 読み込み**: CDN（`https://esm.sh/@supabase/supabase-js`）か vendored の最小読み込み。当日運営のオフライン性を壊さないため、ログイン層の読み込み失敗が当日運営を止めない構造にする。
- **キー注入（安全な既定／人間確認対象）**: **secret は absolutely 置かない**。publishable key と URL は **gitignore 済みのローカル設定**（例 `cloud/supabase-config.local.js` で `window.SHOGI_SUPABASE_CONFIG={url,publishableKey}` を定義）から読み、repo には `cloud/supabase-config.example.js`（プレースホルダ）だけを置く。publishable key は本来クライアント公開前提だが、**「repo にコミットしてよいか」は運用方針として人間確認**を取る（確認が「コミット可」なら example を実値にするだけの差分で済む）。
- **体験（更新3）**: 初回＝メール入力→マジックリンク→完了 / 次回＝開くだけ（セッション長期保持）。**パスワード欄・「パスワードを忘れた方」を出さない**。未登録メールは「幹事登録がありません。管理者へ連絡」。復旧＝同じメールで再送。
- **管理者導線（owner/admin）**: 幹事一覧から 再招待 / 一時停止 / 退任 / セッション無効化。owner/admin を1人以上残す（DB トリガと UI 二重）。
- **テスト**: supabase-js をモックしたログイン UI 単体（マジックリンク発行・セッション・未登録案内・パスワード欄非表示・再送）＋ RLS は live プロジェクトで疎通（prereq 2〜4 後）。

## 5. テスト（本 PR）
- `test/test_supabase_stagea_schema.js`（静的検証・live DB 不要）: 6テーブル定義・全テーブル club_id・全テーブル `enable row level security`・必須ポリシー（未ログイン拒否前提の deny-by-default＝ポリシーが active/club/rank を必ず条件化）・members read が rank 条件・organizers 書込が owner/admin 条件・3ヘルパ関数・最後の admin ガードトリガ・**`sb_secret`/secret 文字列の非混入**・**実 PII 非混入（氏名は 架空/ダミー or プレースホルダのみ）**。
- 非回帰: `shogi_v4.html` は無変更 → 当日運営テストは従来どおり green（npm test の既存件数を維持）。
- **RLS の実効性（実 DB での未ログイン/別club/retired/氏名/publishable 単体拒否）は live 検証が必要**＝prereq 2〜4 完了後（本 PR では未実施・RESULT に明記）。静的検証はポリシーの**存在と条件の形**を固定するに留まる。

## 6. 受入条件との対応（Stage A）
| 受入 | 本 PR | 備考 |
|---|---|---|
| ②未ログイン/retired/suspended/別club 読めない・RLS 有効 | SQL 実装済・静的検証 | live 疎通は prereq 後 |
| ③氏名は非公開・active organizer のみ・localStorage 直近キャッシュ | members RLS 実装済 | キャッシュは A3/Stage B |
| ①マジックリンク・パスワード欄なし・セッション・再送復帰 | **A3 未実装（設計のみ）** | 人間確認＋prereq 後 |
| ⑤機種変更で再ログイン・再招待/停止/退任 | organizers 管理 RLS＋トリガ実装済 / UI は A3 | |

## 7. ガード遵守（HANDOFF.md）
追加のみ／当日運営 localStorage・既存 UI 無改変（本 PR は `shogi_v4.html` 不変）／**secret を repo・HTML に置かない**／実会員名簿（実データ）不使用（架空・プレースホルダ）／build-bind-coordinator 維持（runtime 未変更）／CSS 不変／テスト必須。

## 8. 人間に確認したいこと（ゲート）
1. **prereq 2〜4 の状況**（Email プロバイダ有効化 / owner 個人メール / クラブ名）— A3 runtime とログイン疎通検証の前提。
2. **publishable key/URL を repo にコミットしてよいか**（安全既定＝gitignore ローカル設定。コミット可なら example を実値化）。
3. 上記が揃ったら A3 runtime（マジックリンク・幹事管理 UI）を本 branch に safe-by-default で追加してよいか。
