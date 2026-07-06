# IN-APP-AUTH-001 設計 — 運営アプリ本体のログイン状態表示＋アプリ内ログイン/ログアウト

- Issue: #645 / related: #606（アプリ内モーダル `appConfirm` を確認に流用）
- 対象: `shogi_v4.html`（当日運営コアは無改変）／参照元: `app/auth.js`（既存 `ShogiAuth`）
- Review Level: **L3+**（認証・セッション・権限表示。作者と別素性で design-review 必須）
- 前提調査（production `0616883`・2026-07-06 確認済／`a6d0fce`・?v=93 で Slice 1/2 反映済）
  - ログインはパスワードレスのマジックリンク（`signInWithOtp` + `emailRedirectTo`）。実装は **app/ のみ**。
  - 本体・app/ とも `createClient(url, publishableKey)` のみ＝**supabase-js 既定**（同一 storageKey / `persistSession=true` / `detectSessionInUrl=true` / **`flowType='implicit'`（auth-js v2.108.2 既定・`GoTrueClient.js:21` 実体 grep 確認）** / localStorage）。**同一オリジンでセッション共有が成立**。
  - 本体はクラウド系関数が `getSession()` を都度 ad-hoc に読むだけ。supabase-js UMD（`@supabase/supabase-js@2.108.2`）と `app/config.js` は**ボタン押下時のみ遅延ロード**（既定では外部依存ゼロ）。
  - app/ に再利用可能な部品: `detectAuthCallback()`（hash/search のトークン検出）、`ShogiAuth.{requestMagicLink, signOut, loadSession, claimAndLoadMemberships, summarizeMemberships, formatMagicLinkError}`（client 注入でテスト可）。

## 目的（作者フィードバック）
本体を見ても「ログイン中か」が分からず、ログイン/ログアウトの入口も本体に無い。**本体だけで完結**させる。

## 設計原則
1. 当日運営コア（開始/確定/再生成/棄権/勝敗入力/ペアリング）は**一切触れない**。追加中心。
2. 本体の自己完結性を保つ（ES5・build/bind/coordinator・グローバル state・単一 HTML）。auth.js を丸ごとロードしない＝必要最小の認証ヘルパのみ本体へ移植（`ShogiAuth` と論理を鏡写しにし comment で対応を明示）。
3. secret 不使用（publishable key + URL のみ）。権限の最終強制は DB 側 RLS。本体の表示は UX 補助。
4. fail-soft：オフライン/設定なし/接続不可は既存 `loadCloudDeps` のシグナルを流用し、当日運営を止めない。

---

## Slice 1 — ログイン状態インジケータ（読み取りのみ・低リスク）✅ 実装/本番反映済（?v=93）

**目的**: 「ログイン中（表示名 or メール・クラブ名）／未ログイン」を本体に常時表示。

**実装結果**: ヘッダ保存状態バー直下に **`#auth-status-bar`** を追加（PR #647 → release #648・?v=93）。バインドは `bindHeaderEvents()`。`☁ ログイン中：メール・クラブ名／未ログイン` を常時表示。初期表示は `autoPullMembersOnStartup` に相乗り（追加 RPC/二重注入なし）。`visibilitychange` は `refreshAuthChip(false)` ＝ `getSession()` のみ（RPC を撃たない）。純関数 `buildAuthChipHtml(state)` ＋ `refreshAuthChip()`（build/bind/coordinator）。テスト容易性 = `__setAuthClientTestFactory` で mock 注入。

**リスク**: 読み取りのみ・書込ゼロ。当日運営非依存。**Codex code-review = go**（指摘なし）。

> 注: 設計初版は設置箇所を保存インジケータ `#save-warning-indicator`（`SAVE-UX-STATUS-INDICATOR`）近傍と記述したが、実装では**独立バー `#auth-status-bar`** を保存状態バー直下に新設した（Should Fix「id 記述ズレ」反映）。

---

## Slice 2 — アプリ内ログアウト（低〜中リスク）✅ 実装/本番反映済（?v=93）

**目的**: 本体からログアウト。

**実装結果**:
- `#auth-status-bar` の［ログアウト］押下 → `appConfirm`（#606・**コールバック型** `appConfirm(msg, function(ok){...})`・Promise 非返却）で確認 → `client.auth.signOut({ scope:'local' })` → バー更新＋成功トースト（Codex 指摘反映：全デバイス切断を避け当該端末のみ／成否判定は reject 以外の `{error}` も検査）。
- 確認文言に**安心材料**を明記: 「ログアウトしても、この端末の大会データ・名簿は消えません。再ログインすればクラウド送信を再開できます。」（HISTORY-VS-CLOUD-WORDING のトーン）。`danger` 装飾は付けない（Enter=OK）。
- signOut 失敗時は fail-soft（文言＋状態は据え置き）。`claim` 失敗でもバーは fail-soft 先行描画で隠れない。

**リスク**: signOut はセッション破棄のみ。localStorage の運営データは別領域で無影響。**Codex code-review = go**。

---

## Slice 3 — アプリ内ログイン＝マジックリンク送信（中〜高リスク・認証系）← 本 PR の残作業

**目的**: 本体からメールを入力して「ログインリンクを送る」。app/ に行かずに完結。

**送信**: `requestMagicLink` 相当を本体へ移植（`signInWithOtp({ email, options:{ shouldCreateUser:true, emailRedirectTo:<本体URL> } })`）。エラー整形は `formatMagicLinkError`（429 判別・生エラー非表示・`console.warn` のみ）を流用・固定化。UI は app/ の `buildLoginViewHtml`/`buildCheckEmailViewHtml`（メール入力→「確認して」→再送）を **#606 `showAppModal` 流用モーダル**で再現。専用タブは作らず既存導線に自然に足す。

### 戻り先 = 案A（完全アプリ内・作者確定 2026-07-06）＋ Must Fix 技術確定（2026-07-07・実体確認）

design-review（#646・conditional-go）の Must Fix 3件を実コード＋ライブラリ実体で技術確定した。以下が確定した挙動・因果である。

**MF① 因果の訂正（旧設計は逆だった）**
`detectAuthCallback()` は URL（`hash`+`search`）を**正規表現で読むだけ**でトークンを消費しない。トークンの実消費（`#access_token=` 等の除去＋`history.replaceState`）を行うのは、**既定 `detectSessionInUrl:true` の `createClient` 生成時**。したがって正しい因果は「**`createClient` を呼ぶと URL の認証パラメータが消えるので、その前に `detectAuthCallback()` で URL 状態を先読みしてフラグ化する**」。app/ `boot()` も `var fromMagicLink=detectAuthCallback(); var client=createClient(...)` の順で、読み取り→生成（消費）の順序を担保している。

**MF② マジックリンク帰着経路（案A 最大リスク）— 実体確認で確定**
- **flowType 実測**: auth-js（GoTrueClient）v2.108.2 の既定は **`flowType:'implicit'`**（`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:21` の `flowType: 'implicit'` を実体確認）。本体・app/ とも `createClient` に flowType を渡さない＝**implicit フロー**。よってマジックリンク帰着は **URL ハッシュ `#access_token=…&refresh_token=…&type=magiclink`**（`?code=` クエリではない）。`detectAuthCallback()` の `access_token=` 検出がこれに対応（`[?&]code=` 分岐は本構成では発火しない防御的分岐）。**⇒ レビュー MF② が懸念した「PKCE `code=` 交換／別インスタンス間の `code_verifier` 共有」は本構成では発生せず論点消滅**（PKCE 未使用）。
- **セッション確立**: 帰着時に生成する client（既定 `detectSessionInUrl:true`）が**ハッシュのトークンを直接パースしてセッション化**し localStorage（既定 storageKey）へ永続。app/ が現行 production で同一フロー（既定 implicit）で成立している実績がそのまま本体にも当てはまる。
- **帰着限定・早期ブート経路の新設**: 本体は supabase-js を遅延ロードするため、帰着時にハッシュのトークンを消費するには**起動早期に UMD＋config を先行ロードして永続 client を1つ生成**する必要がある。これを **`detectAuthCallback()` が true の時だけ**実行する（帰着でない通常起動では従来どおり何もロードしない＝当日運営の通常経路はネット/挙動ともゼロ改変）。生成した client は**モジュール変数に閉じ込める**（ライブ配信 `_liveClient` の前例に倣う。当日運営コアは参照しない）。
- **`#scoreboard` ハッシュとの共存順序（implicit ゆえの実務点）**: 帰着 URL は **ハッシュを持つ**（`#access_token=…`）。ただし閲覧ビュールーティング `isScoreboardRoute()`（`applyScoreboardRoute()` / `hashchange` 購読・`location.hash` 参照）は `scoreboard`/`viewer`/`mobile-standings` にのみマッチし、`#access_token=…` はどれにも一致しない → `isScoreboardRoute()===false`＝運営ビュー維持（誤ルーティングなし）。**順序保証**は「**認証帰着ブート（`createClient`＝ハッシュ消費）を、ハッシュルーティング適用・`hashchange` 依存処理より前に走らせる**」の一点。supabase-js はトークン消費後 `replaceState` で自身の認証ハッシュを除去し、その結果生じ得る `hashchange` は空ハッシュ → `applyScoreboardRoute()` は運営ビューのまま（無害）。

**MF③ 「app/ boot と同一パターン」表現の訂正**
app/ `boot()` は `detectAuthCallback()` の真偽に関係なく client を**無条件生成**（`fromMagicLink` は生成後のポータル転送分岐にのみ使用）。案A の「**帰着時のみ**早期生成」は app/ のコピーではなく**本体向けの新規最小ロジック**。gate（`detectAuthCallback()` true）＋モジュール変数封じ込めで副作用を帰着経路に限定する（CLAUDE.md ルール1/2：当日運営コア無改変・build/bind/coordinator 維持と両立）。

**フォールバック（案B・確実に機能）**: 上記早期ロード/ハッシュ消費が実装中に詰まった場合は、本体からメール送信だけ行い `emailRedirectTo = app/` のままにする（着地は app/ ＝同一オリジンでセッション共有→本体リロードで「ログイン中」）。**Slice 3 実装 PR 内に「案A を試み、早期ロード/帰着消費で詰まれば即 案B 退避」の判断ゲートを置く**。

**セキュリティ/権限**: 本体はメール送信とセッション確立のみ。役割・クラブは表示補助で、送信/削除の可否は RLS が最終強制（既存どおり）。secret 不使用。implicit フローは現行 production の app/ が既に採用しており本体でも据え置き（新規リスクの導入なし）。

**テスト**: `requestMagicLink`（mock client・valid/invalid email・429・reject）／`detectAuthCallback` の hash/search 判定／`#access_token=`（implicit）帰着時に早期ブートが1回だけ client を生成し `getSession` が確立へ遷移すること（mock supabase）／通常起動（認証パラメータ無し）では早期ブートを起動しない（ロード副作用ゼロ）こと／`#access_token=` ハッシュが `isScoreboardRoute()===false` で運営ビュー維持であること／送信後の checkEmail 表示遷移。

---

## セッション共有の制約（正本・Should Fix 反映）
本体・app/ のセッション共有は「両系統とも `createClient(url, publishableKey)` を**オプション無し**で呼ぶ」ことに依存する（既定 storageKey / `persistSession` / localStorage / `flowType:'implicit'` の一致）。**いずれの系統でも `createClient` に storageKey・flowType・persistSession・detectSessionInUrl 等のオプションを追加しない**ことを制約とする（追加すると共有と帰着時のトークン消費が破綻する）。

## 更新頻度の分離（Should Fix 反映・Slice 1 で反映済）
`visibilitychange` 毎の `claim_organizer_seat` RPC は重い。**session 有無チェック（軽・localStorage `getSession`）と membership 再取得（重・RPC）を分離**し、RPC は初回＋ログイン/ログアウト直後のみ、`visibilitychange` は session 有無だけに絞る（Slice 1 の `refreshAuthChip(false)` がこれ）。

## オフライン/複数タブ/ログアウト後描画（Should Fix 反映）
`loadCloudDeps` の `navigator.onLine===false` 即 resolve を流用し、オフラインは静かな中間表示で当日運営を止めない。複数タブ同期は当面 `storage` イベント購読を必須とはしない（Slice 3 帰着でセッションが変わったタブは次の `visibilitychange`/リロードで追従）。必要になれば `storage` 購読を後続 slice で追加。ログアウト後は fail-soft で「未ログイン」を先行描画。

---

## 実装順序と PR 方針
- 分割 PR（base = orphan clean base）。Slice 1 → 2 → 3 の順（1/2 は低リスク先行・**反映済**）。Slice 3 PR で `bash test/run_tests.sh shogi_v4.html` **WARN=0** 維持＋実ブラウザ検証。
- production 反映は #606 と同様に別 release PR（base=production・`?v` インクリメント・bundle 経由）。
- L4 相当（認証）の code-review は **Codex 必須**（SoD）。design-review は本設計（改訂）に対して別セッション reviewer が再実施。

## 論点の確定状況
1. **戻り先: 案A（完全アプリ内）で確定**（作者 2026-07-06）。Must Fix ①②③ を実コード＋ライブラリ実体で技術確定（2026-07-07・上記）。案B フォールバック判断ゲートを Slice 3 PR に内包。
2. **配置**: Slice 1/2 実装で `#auth-status-bar`（保存状態バー直下）に確定。表示は「氏名（無ければメール）＋クラブ名」まで。役割は当面出さない（UX 簡潔・権限は RLS 強制）。
3. **ログイン UI の器**: #606 の `showAppModal` 流用モーダルにメール入力→「確認して」→再送を載せる（app/ の buildLoginView/checkEmailView を鏡写し）。

## Must Fix 対応表（design-review #646 conditional-go → 本改訂）
| # | Must Fix | 対応 |
|---|---|---|
| MF① | 案A の因果が逆 | Slice3「MF①」で訂正（read=detectAuthCallback／消費=createClient の detectSessionInUrl）。 |
| MF② | PKCE `code=` 交換・code_verifier 共有・帰着限定早期ロード・#scoreboard 共存順序 未検討 | **実体確認で flowType 既定=implicit を確定**（auth-js 2.108.2 源 `GoTrueClient.js:21`）。⇒帰着は**ハッシュ `#access_token=`**・PKCE/`code_verifier` は本構成で不発（論点消滅）。残る実務点＝帰着限定早期ブート（`detectAuthCallback` gate）＋ハッシュ消費を `#scoreboard` ルーティング前に走らせる順序保証。共有前提は「セッション共有の制約」で正本化。 |
| MF③ | 「app/ boot と同一」誤り | Slice3「MF③」で訂正（app/=無条件生成／本体=帰着限定の新規最小ロジック・モジュール変数封じ込め）。 |

Should Fix（appConfirm コールバック型／両系統オプション無し制約／`_liveClient` 前例／`#auth-status-bar`・`bindHeaderEvents` の正しい id/関数名／visibilitychange と RPC 分離／オフライン・複数タブ・ログアウト後描画）および Nice-to-Have（役割非表示のテスト1行明記／`formatMagicLinkError` 固定化／案B 判断ゲート）を本文各節に反映済。

## 構造化フィールド
- related_pr: #645, #606, #647, #648
- canonical_decision: PMO-OPS v2.1-final
