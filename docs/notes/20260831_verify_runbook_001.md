# 実機確認の手順（正本）— 配信は必ず staging を向ける

STAGING-ENV-001 ⑤。**2026-08-31 時点。この文書が実機確認の手順の正本です。**

## なぜ手順を変えたか

それまでの実機確認は **production のツリーをそのまま配信**していました。production には Pages 配信のために
**実値の `app/config.js` / `app/config.public.js` がコミットされています**。したがって配信した画面で
ログインや ☁送信を1回でも押すと **本番 Supabase に届きます**。

**#800 の本番データ破損はこの構造から出ました。** 手順が「気をつける」で守られていた状態です。

→ **`scripts/serve_for_verify.sh` を使う。コードは検証対象のまま・向き先だけ staging に変える。**

## 使い方

```
bash scripts/serve_for_verify.sh <repo> <ref> <port> <staging-config-dir>

# 例: 開発本流を 8351 番で
bash scripts/serve_for_verify.sh "$PWD" origin/chore/shogi-tour-apphq-003h-2d-orphan-clean-base 8351 /tmp/stgcfg
# 例: production の byte をそのまま（config だけ staging）
bash scripts/serve_for_verify.sh "$PWD" origin/production 8351 /tmp/stgcfg
```

`<staging-config-dir>` には `config.js` を置きます。実体は作者機の `~/projects/shogi/app/config.js`
（**`.gitignore` 済＝非コミット**。`env:'staging'` を名乗る版）。`supabase/README.md` の方針どおり、
publishable key も public repo にはコミットしません。

終了コード: **0=配信開始 / 2=引数不正 / 3=検査に落ちた（配信していない）**

## 検査は2つ。落ちたら配信しない

1. **配信ディレクトリに本番の project ref が1文字も無いこと**
   - 本番の印は **production ブランチ自身の `app/config.public.js` から実行時に読む**（ハードコードしない＝本番の URL が変わっても追従する）
   - production ブランチから読めなければ**検査できないので中止**（fail-closed）
2. **配信する `app/config.js` が `env:'staging'` を名乗っていること**

staging 側に `config.public.js` が無いときは、取り出した**本番の実値を削除**します（ライブ配信は試せなくなるが、残すより安全）。

### 変異で赤になることの実測（2026-08-31・cowork）

| | 渡したもの | 結果 |
|---|---|---|
| 素 | staging config | `✓ 本番の project ref はどこにも無い` / `✓ env:'staging'` → **exit=0**（配信開始） |
| 変異A | **本番の config** | `✗ 本番の project ref が残っています: app/config.js` ＋ `✗ env:'staging' がありません` → **exit=3** |
| 変異B | `env:'staging'` を消した config | `✓ project ref は無い` / `✗ env:'staging' がありません` → **exit=3** |

★ 変異Aは**検査1と2の両方**が赤になります。検査1だけでも止まることを確かめたい場合は変異Bを見てください
（検査2だけが赤で exit=3）。**どちらの検査も単独で配信を止められます。**

## この手順で「できること」と「できないこと」

**できるようになったこと**: 配信した画面を実操作しても**本番 Supabase に届かない**。作者機のブラウザで
ログインや ☁送信を**本番データを壊す心配なく**試せる。

**できないこと（2026-08-24 実測・2026-08-31 も同じ）**:

- **cowork の container からも `device_bash` からも Supabase に到達できません。** staging も本番も
  egress allowlist に無く 403（container）／HTTP 000（device_bash の curl）。**WebFetch だけが届く**
  （PostgREST は `?apikey=` クエリパラメータを受けるので read 系なら検査できる）
- したがってこの道具の効果は **「事故の可能性を消す」** であって、
  **「クラウド機能を Playwright で検証できるようになる」ではありません**
- クラウド機能を実際に動かして確かめられるのは、いまのところ**作者機のブラウザだけ**
- 後者が要るなら **egress allowlist に staging のホストを足す**必要があります（作者の設定作業）

## 実機確認の残りの作法（配信できたあと）

- 取り出したファイルの **sha256 が対象 ref のものと一致することを先に確認**する
  （＝「本番が配る byte を測っている」の根拠。**config だけは意図的に差し替えている**点を報告に明記する）
- `http://127.0.0.1:<port>/shogi_v4.html?v=NNN` を実ブラウザで開く。**localhost は secure context なので
  Service Worker も本物が動く**（`caches.keys()` で CACHE 名を確認できる）
- **テスト用の抜け道を仕込まない**（確認は `#app-modal` / `.app-modal-ok` を実クリック）
- 「操作できる」は属性ではなく **実クリックの成否**で測る（`inert` が残っていると click が届かない）
- 対照は「実装前後の実測値の差」で書く。**自分の期待と同義の式（`A || B` 等）を書かない**
- ★ **赤が出たら、まず自分の期待を疑う。** (a) 期待の分母は正しいか (b) その場面は本当に意図した場面か
  (c) それは今回の変更が入れた挙動か既存挙動か — を切り分ける probe を先に1本走らせる

## 罠

- **`pkill -f "http.server"` は自分自身にマッチして呼び出し元のシェルごと落とすことがあります**
  （コマンドラインにその文字列が含まれるため。exit 143）。ポート番号まで含めた
  `pkill -f "http.server 8351"` でも同じ。`(pkill ... || true) >/dev/null 2>&1` で包むか、
  `/tmp/serve_verify_<port>.log` の親 PID を控えて `kill` する
- `nohup ... &` 単体だと呼び出し側が exit 144 を返すことがある（本スクリプトは `setsid` + `disown` 済み）
- **作業ディレクトリ `/tmp/serve_verify.XXXXXX` は検査に落ちても残します**（何が入っていたか調べるため）。
  溜まるので、確認が終わったら消す

## 関連

- `docs/notes/20260823_staging_env_001_runbook.html` … staging 環境そのものの構築手順（①〜④）
- `supabase/staging_bootstrap.sql` / `verify_schema.sql` / `staging_seed.sql`
- Issue #800 … 本番データ破損の記録（この手順が防ごうとしているもの）
