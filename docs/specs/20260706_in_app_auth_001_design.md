# IN-APP-AUTH-001 設計 — 運営アプリ本体のログイン状態表示＋アプリ内ログイン/ログアウト

- Issue: #645 / related: #606（アプリ内モーダル `appConfirm` を確認に流用）
- 対象: `shogi_v4.html`（当日運営コアは無改変）／参照元: `app/auth.js`（既存 `ShogiAuth`）
- Review Level: **L3+**（認証・セッション・権限表示。作者と別素性で design-review 必須）
- 前提調査（production `0616883`・2026-07-06 確認済）
  - ログインはパスワードレスのマジックリンク（`signInWithOtp` + `emailRedirectTo`）。実装は **app/ のみ**。
  - 本体・app/ とも `createClient(url, publishableKey)` のみ＝**supabase-js 既定**（同一 storageKey / `persistSession=true` / `detectSessionInUrl=true` / localStorage）。**同一オリジンでセッション共有が成立**。
  - 本体はクラウド系関数が `getSession()` を都度 ad-hoc に読むだけ。ログイン/ログアウト UI は無い。
  - app/ に再利用可能な部品: `detectAuthCallback()`（hash/search のトークン検出）、`ShogiAuth.{requestMagicLink, signOut, loadSession, claimAndLoadMemberships, summarizeMemberships, formatMagicLinkError}`（client 注入でテスト可）。

## 目的（作者フィードバック）
本体を見ても「ログイン中か」が分からず、ログイン/ログアウトの入口も本体に無い。**本体だけで完結**させる。

## 設計原則
1. 当日運営コア（開始/確定/再生成/棄権/勝敗入力/ペアリング）は**一切触れない**。追加中心。
2. 本体の自己完結性を保つ（ES5・build/bind/coordinator・グローバル state・単一 HTML）。auth.js を丸ごとロードしない＝必要最小の認証ヘルパのみ本体へ移植（`ShogiAuth` と論理を鏡写しにし comment で対応を明示）。
3. secret 不使用（publishable key + URL のみ）。権限の最終強制は DB 側 RLS。本体の表示は UX 補助。
4. fail-soft：オフライン/設定なし/接続不可は既存 `loadCloudDeps` のシグナルを流用し、当日運営を止めない。

---

## Slice 1 — ログイン状態インジケータ（読み取りのみ・低リスク）

**目的**: 「ログイン中（表示名 or メール・クラブ名・役割）／未ログイン」を本体に常時表示。

**配置**: ヘッダ既存の保存状態バー（SAVE-STATUS-BAR-001）近傍に小さなチップを1つ追加。当日運営の主導線を圧迫しない位置。文言例:
- 未ログイン: 「未ログイン（クラウド共有は任意）」＋［ログイン］（Slice 3 で有効化）
- ログイン中: 「ログイン中：{表示名/メール}・{クラブ名}」＋［ログアウト］（Slice 2 で有効化）
- 取得中/オフライン/設定なし: それぞれ静かな中間表示（エラーを煽らない）

**取得ロジック**:
- 起動時＋ログイン/ログアウト後＋タブ復帰（`visibilitychange`）で更新。
- `loadCloudDeps()` → client → `getSession()`。session があれば任意で `claim_organizer_seat` → `summarizeMemberships` で表示名/クラブ名/役割を得る（失敗時はメールのみ表示に劣化）。
- 純関数 `buildAuthChipHtml(state)` と `refreshAuthChip()`（build/bind/coordinator）。

**リスク**: 読み取りのみ・書込ゼロ。当日運営非依存。**最小 slice として単独リリース可**。

**テスト**: `buildAuthChipHtml` の分岐（未/中/取得中/オフライン）を静的検査＋mock client で `refreshAuthChip` の状態遷移。

---

## Slice 2 — アプリ内ログアウト（低〜中リスク）

**目的**: 本体からログアウト。

**UI/挙動**:
- インジケータの［ログアウト］押下 → `appConfirm`（#606）で確認 → `client.auth.signOut()` → インジケータ更新＋ステータス通知。
- 確認文言に**安心材料**を明記: 「ログアウトしても、この端末の大会データ・名簿は消えません。再ログインすればクラウド送信を再開できます。」（HISTORY-VS-CLOUD-WORDING のトーン）。
- signOut 失敗時は fail-soft（文言＋状態は据え置き）。

**リスク**: signOut はセッション破棄のみ。localStorage の運営データは別領域で無影響。危険操作ではないので `danger` 装飾は付けない（Enter=OK）。

**テスト**: mock client で signOut 呼び出し→チップが未ログインへ遷移。appConfirm は resolver シームで OK/キャンセル分岐。

---

## Slice 3 — アプリ内ログイン＝マジックリンク送信（中〜高リスク・認証系）

**目的**: 本体からメールを入力して「ログインリンクを送る」。app/ に行かずに完結。

**送信**: `requestMagicLink` 相当を本体へ移植（`signInWithOtp({ email, options:{ shouldCreateUser:true, emailRedirectTo:<戻り先> } })`）。エラー整形は `formatMagicLinkError`（429 判別・生エラー非表示）を流用。UI は app/ の `buildLoginViewHtml`/`buildCheckEmailViewHtml`（メール入力→「確認して」→再送）をモーダル or パネルで再現。

**戻り先（案A で確定・下記）**:

- **案A（完全アプリ内・確定）**: `emailRedirectTo = 本体URL`。リンク帰着時、supabase-js が hash のトークンを消す前に捕捉するため、**`detectAuthCallback()` が true の時だけ**ページ読込早期に永続 client を1つ生成してトークンを消費（app/ `boot()` と同一パターン）。**通常起動（非帰着）では従来どおり client を作らない**＝当日運営の通常経路は無改変。副作用は「マジックリンク帰着時のみ」に限定。
  - 留意: 早期 client 生成は帰着経路限定でもグローバル副作用。design-review で「帰着時のみ生成」の許容を確認する（CLAUDE.md ルール1/2）。

- **案B（軽量・戻りは app/・フォールバック）**: 本体からメール送信だけ行い `emailRedirectTo = app/` のまま。利用者はリンクで app/ に着地→セッション永続（共有）→本体に戻ってリロードで「ログイン中」に。実装が軽く早期 client 生成が不要だが、**着地が app/ になる**ため「完全アプリ内」感が薄い。

  → **決定=案A（作者 2026-07-06）**。実装は「帰着時のみ早期 client 生成」で副作用を最小化。早期生成の実装可否（CLAUDE.md ルール1/2 との両立）は design-review で最終確認し、万一却下なら案B へフォールバック。

**セキュリティ/権限**: 本体はメール送信とセッション確立のみ。役割・クラブは表示補助で、送信/削除の可否は RLS が最終強制（既存どおり）。secret 不使用。

**テスト**: `requestMagicLink`（mock client・valid/invalid email・429・reject）／`detectAuthCallback` の hash/search 判定／送信後の checkEmail 表示遷移。

---

## 実装順序と PR 方針
- 分割 PR（base = orphan clean base）。Slice 1 → 2 → 3 の順（1/2 は低リスク先行）。各 PR で `bash test/run_tests.sh shogi_v4.html` **WARN=0** 維持＋実ブラウザ検証。
- production 反映は #606 と同様に別 release PR（base=production・`?v` インクリメント・bundle 経由）。
- L4 相当（認証）の code-review は **Codex 必須**（SoD）。design-review はまず本設計に対して実施。

## 論点の確定状況
1. **戻り先: 案A（完全アプリ内）で確定**（作者 2026-07-06）。実装は帰着時限定の早期 client 生成。可否は design-review で最終確認。
2. **配置（推奨・design-review で確認）**: 保存状態バー近傍に独立チップ1つ。役割表示は「氏名（無ければメール）＋クラブ名」まで。役割（オーナー/幹事等）は当面出さない（UX を簡潔に・権限は RLS 強制）。
3. **ログイン UI の器（推奨）**: #606 の `showAppModal` を流用したアプリ内モーダルにメール入力→「確認して」→再送を載せる（app/ の buildLoginView/checkEmailView を鏡写し）。専用タブは作らず既存導線に自然に足す。

## 構造化フィールド
- related_pr: #645, #606
- canonical_decision: PMO-OPS v2.1-final
