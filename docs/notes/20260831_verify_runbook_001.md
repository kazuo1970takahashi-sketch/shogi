# 実機確認の手順（正本）— 配信は必ず staging を向ける

STAGING-ENV-001 ⑤。**2026-08-31 起稿・2026-09-06 に Codex 初巡4件・2巡目5件・3巡目3件を反映。この文書が実機確認の手順の正本です。**

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
# 例: production の byte をそのまま（config だけ staging）。★ポートは前の配信と別にする（下の「ポートを再利用しない」）
bash scripts/serve_for_verify.sh "$PWD" origin/production 8352 /tmp/stgcfg
```

`<staging-config-dir>` には `config.js` を置きます。実体は作者機の `~/projects/shogi/app/config.js`
（**`.gitignore` 済＝非コミット**。`env:'staging'` を名乗る版）。`supabase/README.md` の方針どおり、
publishable key も public repo にはコミットしません。

終了コード: **0=配信開始 / 2=引数不正 / 3=検査に落ちた（配信していない） / 4=配信を立てられなかった（ポート占有・起動失敗＝配信していない）**

## 検査は2つ。落ちたら配信しない

1. **配信ディレクトリに本番の project ref が1文字も無いこと**
   - 本番の印は **production ブランチ自身の `app/config.public.js` から実行時に読む**（ハードコードしない＝本番の URL が変わっても追従する）
   - 読む前に **`git fetch origin production` を必ず行う**。remote-tracking の `origin/production` は fetch しなければ古いままなので、fetch できなければ「印が新しい」と言えず**中止**（fail-closed）
   - 印は **`url: '…'` の property 行だけ**から取り、**ちょうど1件**でなければ中止（コメントに旧 URL が残っていても拾わない。`.github/workflows/supabase-keepalive.yml` と同じ形）
   - production ブランチから読めなければ**検査できないので中止**（fail-closed）
2. **配信する `app/config.js` が `env:'staging'` を名乗っていること**
   - こちらも **`env: '…'` の property 行だけ**を読み、**ちょうど1件で値が `staging`** のときだけ ✓（コメント行の `// env:'staging'` では通らない・`env:'production'` は ✗）

`<ref>` は取り出す前に `git fetch origin` してから **不変の commit ID に解決**して使います（`origin/production` を指定しても古い tree を配らない・出力に ID が出る）。取り出した tree の `app/` や `app/config.js` が symlink なら、配信ディレクトリの外へ書く恐れがあるので置き換える前に中止します。

検査を通ったあとも、**配信が本当に立ったこと**を確かめてから 0 を返します（起動した PID が生きていて、この配信ディレクトリだけに置いた目印ファイルがそのポートから読める）。ポートが占有済みなら exit 4 で止まり、**古い配信へ誘導しません**。

staging 側に `config.public.js` が無いときは、取り出した**本番の実値を削除**します（ライブ配信は試せなくなるが、残すより安全）。

### 変異で赤になることの実測（2026-08-31 起稿・2026-09-06 に架空の production を持つ使い捨て repo で再実測）

| | 渡したもの／状況 | 結果 |
|---|---|---|
| 素 | staging config | `✓ 本番の project ref はどこにも無い` / `✓ env:'staging'` → **exit=0**（配信開始） |
| 変異A | **本番の config** | 検査1 ✗ ＋ 検査2 ✗ → **exit=3** |
| 変異B | `env:'staging'` を消した config | 検査1 ✓ / 検査2 ✗ → **exit=3**（**検査2だけで止まる**） |
| 変異C | **本番の印を残したまま `env:'staging'` を足した** config | 検査1 ✗ / 検査2 ✓ → **exit=3**（**検査1だけで止まる**） |
| 変異D | 指定ポートを別の `http.server` が占有 | 検査1・2 ✓ → `✗ ポート N でこのディレクトリを配信できませんでした` → **exit=4**（旧版は exit 0 で「配信開始」と出て古い配信へ誘導していた） |
| 変異E | production が別 project に移り、ローカルの `origin/production` が古い | fetch で今の印を読むので、今の印を含む config は検査1 ✗ → **exit=3**（旧版は古い印で検査して exit 0） |
| 変異F | production の `config.public.js` に**コメント行**で旧 URL が残る | property 行は1本なので今の印で検査 → **exit=0** |
| 変異G | production の `config.public.js` に `url:` の property 行が**2本** | `✗ url: が一意でない（url=2）` → **exit=3**（fail-closed） |
| 変異H | config にコメント行 `// env: 'staging'` があり、実体は `env: 'production'` | `✗ env: property が 'staging' 1件ではありません（env=1 件・値=production）` → **exit=3**（旧版の unanchored grep は ✓ にしていた） |
| 変異I | `<ref>`=`origin/production` を指定し、remote だけ進んでローカルの tracking ref が古い | 取り出しの前に fetch → **新しい tree を配る**（出力の commit ID が新しい方・旧版は古い tree を配って検査だけ新しい印で通していた） |
| 変異J | 取り出した tree の `app/config.js` が symlink | `✗ app/config.js が symlink です（中止）` → **exit=3**（symlink 先のファイルは無傷） |
| 変異K | `remote.origin.fetch` を別枝だけに絞った clone（single-branch 相当）で、remote の production だけ project が変わった | refspec 明示の fetch で `origin/production` が更新され、今の印を含む config は検査1 ✗ → **exit=3**（refspec 無しの fetch は更新せず exit 0 だった） |

★ 変異Aは両方の検査が赤なので単独性の根拠になりません。**検査1だけで止まる根拠は変異C、検査2だけで止まる根拠は変異B**です。

### ポートを再利用しない（ブラウザ側の落とし穴）

ブラウザは **origin（`127.0.0.1:ポート`）ごとに Service Worker とキャッシュを持ちます**。`sw.js` は JS の成功応答をキャッシュし、
ネットワークが落ちたときは `caches.match()` に退避します。したがって **以前そのポートで production ツリーを配信していた**なら、
配信ディレクトリが新しくても、その origin に残った**本番の `app/config.js` がキャッシュから蘇る**経路があります
（`app/config.js` はクラウド操作を押した瞬間に読まれる）。

- **毎回、これまで使っていないポートを使う**（例に 8351/8352 と分けてあるのはこのため）
- 同じポートを使わざるを得ないときは、開く前にブラウザの **その origin のサイトデータ（SW・キャッシュ・localStorage）を消す**
- script は配信開始時にこの注意を1行出します

★ macOS で動くこと: 配信の起こし方は `nohup` だけ（`setsid` は util-linux＝素の macOS に無い。旧版は cloud でしか動かしておらず、作者機では常に exit 4 になっていた）。

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

- **`pkill -f "http.server"` は使わない。** 呼び出し元のコマンドラインにその文字列が含まれると（`bash -c` や自動化の包み）
  自分自身にマッチして呼び出し元のシェルごと落ちる（exit 143/144）。サブシェルで包んでも出力を捨てても防げない。
  **止めるときは script が配信開始時に印字する PID を `kill <PID>` する**（`/tmp/serve_verify_<port>.log` にも残る）
- 配信は `nohup … &` ＋ `disown` で起こしている（`setsid` は使わない＝素の macOS に無い）。呼び出し側のシェルが先に
  終わっても配信は残る（実測済み）
- **作業ディレクトリ `/tmp/serve_verify.XXXXXX` は検査に落ちても残します**（何が入っていたか調べるため）。
  溜まるので、確認が終わったら消す

## 関連

- `docs/notes/20260823_staging_env_001_runbook.html` … staging 環境そのものの構築手順（①〜④）
- `supabase/staging_bootstrap.sql` / `verify_schema.sql` / `staging_seed.sql`
- Issue #800 … 本番データ破損の記録（この手順が防ごうとしているもの）
