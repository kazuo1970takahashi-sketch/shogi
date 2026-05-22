# SHOGI-TOUR-APPHQ-004F-1｜production release 実行テンプレート

## 1. 目的

production release を実行するときに使う **承認文テンプレート** と **実行報告テンプレート** を定義する。004F Runbook の手順を、コピペで使える定型に落とし込む。

- main で承認済みの変更を、**approved main SHA 固定** で production へ反映する
- production へ入れるファイルは **`index.html` / `shogi_v4.html` の 2 件のみ**
- Pages source は **`production:/` のまま維持** する

## 2. 適用範囲

### このテンプレートを使う

- main の変更を production に反映する **本番 release**
- `index.html` / `shogi_v4.html` の 2 件のみを production に反映する release
- **allowlist 変更なし** の通常 release

### このテンプレートで扱わないもの（別タスク / 別承認）

- allowlist 拡張 → 004I
- Pages source 変更 → 004G §12
- rollback（Pages 停止 / production rollback / main:/ 戻し）→ 004G §11
- GitHub Pages 停止
- main:/ への一時戻し（例外承認のみ）
- repo 移行
- Git 履歴改変
- production branch 再作成

## 3. release 前提

| 項目 | 値 / ルール |
|---|---|
| 本番公開 branch | `production`（orphan branch） |
| Pages source | `production:/`（変更しない） |
| production tracked tree | `index.html` / `shogi_v4.html` の 2 件のみ |
| release 取り込み元 | **approved main SHA**（commit ハッシュ固定、`main` symbolic ref 不可） |
| 禁止コマンド | `git checkout main -- ...` / `git add .` / `git add -A` / glob 系 `git add` / `git merge main` / `git pull main` |
| 必須コマンド | `git checkout <approved-main-sha> -- index.html shogi_v4.html` / `git add index.html` / `git add shogi_v4.html`（明示 path のみ） |
| rollback | 別承認、本テンプレートでは扱わない |

### SHA mismatch handling（Should Fix 1 反映）

承認後に `origin/main` が進行している、または `origin/production` が予期せず変化している場合の方針：

- **不一致なら即停止**：`git rev-parse origin/main` が approved main SHA と一致しない、または `git rev-parse origin/production` が current production SHA と一致しない場合、release を **即停止**
- **その場で最新 main を使って続行しない**：approved main SHA は承認時点の SHA に固定されたもの。新しい main commit を release 対象に含めるかは人間の判断であり、自動的に取り込まない
- **AI / Claude Code は approved main SHA を勝手に更新しない**：承認文に書かれた SHA を別の SHA に書き換えて release を続行することは禁止
- **新しい main を release 対象にする場合**：人間が新しい main の SHA を確認し、**新しい承認文を発行する**（既存承認文を流用しない）
- **既存承認文のまま release を再開しない**：approval phrase は再開トリガーにならない。新しい release Task ID で別タスクとして起こす
- **不一致時の報告**：approved main SHA と現在の `origin/main` SHA を **metadata として記載** する。**差分本文は開かない**（path metadata / SHA / commit count のみ）
  - 例：「approved main SHA = `<sha-A>` / 現在の `origin/main` = `<sha-B>` / 不一致のため停止、新規承認待ち」
  - `git diff <sha-A>..<sha-B>` の本文出力は禁止、必要なら `git log <sha-A>..<sha-B> --oneline` 程度の commit metadata のみ
- 同様に `origin/production` が `current production SHA` と一致しない場合：production が予期せず進んだ / rollback 中 / 別の release が並走している可能性。即停止して人間判断

## 4. release 承認文の必須項目

承認文には以下を **すべて含める**。欠けていれば release を開始しない。

- **Task ID**（例：`SHOGI-TOUR-APPHQ-RELEASE-YYYYMMDD-NN`）
- **Repo**: `kazuo1970takahashi-sketch/shogi`
- **approved main SHA**（**full 40-char SHA**、short SHA 不可）
- **current production SHA**（**full 40-char SHA**、short SHA 不可）
- **release 対象ファイル**: `index.html` / `shogi_v4.html` の 2 件のみ
- allowlist 変更なし
- denylist 変更なし
- Pages source 変更なし
- **Pages source の現状**: `production:/`
- production に反映するファイルは 2 件のみ
- 取り込みコマンド: `git checkout <approved-main-sha> -- index.html shogi_v4.html`
- stage: `git add index.html` / `git add shogi_v4.html`（明示 path のみ）
- **`git add .` / `git add -A` / glob 禁止**
- release 実行は **Level 4**
- rollback は別承認
- **main:/ 戻しは禁止**、例外時のみ別承認

### Approval Phrase 例

```
APPROVE SHOGI-TOUR APPHQ-RELEASE-YYYYMMDD-NN PRODUCTION RELEASE ONLY
```

YYYYMMDD は release 実行日、NN は同日 N 回目の release を 01 / 02 等で区別。

## 5. 承認文テンプレート本文（コピペ用）

プレースホルダ（`<>`囲み）を実値で埋めて使う。

```
承認：SHOGI-TOUR APPHQ-<RELEASE_TASK_ID> production release

対象プロジェクト：
SHOGI-TOUR｜将棋大会運営アプリ

Repo：
kazuo1970takahashi-sketch/shogi

Task ID：
SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID>

Risk Level：Level 4
バッチ対象外：READY+MERGE+DELETE 不可

固定項目（すべて必須、欠けていれば開始しない）：
- approved main SHA：<APPROVED_MAIN_SHA>（full 40-char 必須、short SHA 不可）
- current production SHA：<CURRENT_PRODUCTION_SHA>（full 40-char 必須、short SHA 不可、release 開始時点の origin/production と一致）
  - ※ 承認文時点では「previous production SHA（release 前）」と同義。release 実行後の **new production SHA** は完了報告で記録する別欄であり、承認文には書かない。
- expected main branch：<EXPECTED_MAIN_BRANCH>（通常 main）
- expected Pages source：<EXPECTED_PAGES_SOURCE>（通常 production:/）
- release 対象：index.html / shogi_v4.html の 2 件のみ
- allowlist 変更なし
- denylist 変更なし
- Pages source 変更なし（production:/ のまま）
- Pages source の現状：production:/ built
- release 理由：<RELEASE_REASON>
- 承認者：<APPROVER>

開始前照合（必須、不一致なら開始しない）：
- git rev-parse origin/main == <APPROVED_MAIN_SHA>
- git rev-parse origin/production == <CURRENT_PRODUCTION_SHA>
- gh api .../pages の source.branch == "production"、status == "built"
- production tree が allowlist 2 件のみ（index.html / shogi_v4.html）
- denylist hit 0
- 危険 path NOT PRESENT
- index.html 参照先が allowlist 内（shogi_v4.html のみ）

反映方法（004F Runbook §8 案A）：
- worktree path: ../shogi-release-<RELEASE_TASK_ID>
- git worktree add ../shogi-release-<RELEASE_TASK_ID> production
- git checkout <APPROVED_MAIN_SHA> -- index.html shogi_v4.html
- git add index.html
- git add shogi_v4.html
- `git add .` / `git add -A` / glob は禁止
- commit message: "release(app): publish approved main <short-sha> to production"

検証（必須、本文非表示）：
- production tree path 確認（allowlist 2 件のみ）
- allowlist 完全一致（/usr/bin/diff）
- denylist no hit（path-grep のみ）
- 危険 path NOT PRESENT（git cat-file -e、12 件）
- index.html 参照先確認（限定 grep、`-A`/`-B`/`-C` 不可）

Pages 確認：
- gh api .../pages：source=production:/、status=built
- HEAD（必須）：root / index.html / shogi_v4.html すべて HTTP 200
- 任意推奨：release 前後の etag / last-modified / x-cache 記録

禁止：
- approved main SHA 以外から checkout しない
- `main` symbolic ref を使わない
- `git merge main` / `git pull main` 禁止
- `git add .` / `-A` / glob 禁止
- allowlist 外を stage しない
- force push / `--force` / `--force-with-lease` 禁止
- PR 作成、main 変更、default branch 変更、branch protection 変更禁止
- Pages source を main:/ に戻す（例外時のみ別承認）
- 対象 JSON / 旧 E2E spec の閲覧・変更禁止
- shogi_v4.html / index.html 本文の編集（main から取り込むのみ）禁止
- body 取得 / browser 表示 / screenshot / Playwright / `curl -L` / `wget` 禁止
- HTTP GET 禁止（HEAD のみ）
- 004C 残置 worktree への参照（既に削除済みのため、誤って同名 path を再作成しない）

rollback：
- 第一候補：GitHub Pages 停止（別承認）
- 第二候補：production を前 commit に rollback（別承認）
- 例外：Pages source を main:/ に戻す（人間再承認時のみ）
- いずれも Level 4 個別承認、バッチ対象外、本テンプレートでは扱わない

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<RELEASE_TASK_ID> PRODUCTION RELEASE ONLY
```

## 6. precondition 確認テンプレート

release 開始前に以下を順に確認する。1 つでも不一致なら **即停止**、人間判断を仰ぐ。

```
1. repo == kazuo1970takahashi-sketch/shogi
2. APPROVED_MAIN_SHA は full 40-char か（正規表現 /^[a-f0-9]{40}$/）
3. CURRENT_PRODUCTION_SHA は full 40-char か（同上）
4. git rev-parse origin/main == APPROVED_MAIN_SHA
5. git rev-parse origin/production == CURRENT_PRODUCTION_SHA
6. git rev-parse production == CURRENT_PRODUCTION_SHA（local も一致）
7. gh repo view --json defaultBranchRef → "main"
8. gh api .../pages の source == {"branch":"production","path":"/"}
9. gh api .../pages の status == "built"
10. gh pr list --head production --state all は空
11. git ls-remote --heads origin chore/shogi-tour-apphq-003h-2d-orphan-clean-base が SHA=7e30119（または承認時点で記録された clean SHA）
12. git ls-tree -r --name-only production の出力が allowlist 2 件 (index.html / shogi_v4.html) と完全一致
13. denylist hit 0
14. 危険 path 12 件すべて NOT PRESENT（git cat-file -e）
15. index.html 参照先が allowlist 内（shogi_v4.html のみ、または同等の OK 判定）
```

short SHA / 不一致 / Pages source 不一致 / 不一致 / 等のいずれかで即停止。

## 7. release 実行手順テンプレート

```
1. precondition 確認（§6）
2. isolated worktree 作成：
   git worktree add ../shogi-release-<RELEASE_TASK_ID> production
3. production branch checkout（worktree 内で自動 attach）
4. approved main SHA から allowlist 2 件のみ取り込み：
   git checkout <APPROVED_MAIN_SHA> -- index.html shogi_v4.html
   ※ `main` symbolic ref を使わない
5. staged path 確認：
   git status --short
   → "M index.html" / "M shogi_v4.html" のみであることを確認
   → 他の path が出ていたら即停止
6. 明示 path で stage：
   git add index.html
   git add shogi_v4.html
   ※ `git add .` / `git add -A` / glob 禁止
7. stage 内容再確認：
   git status --short / git ls-files --cached の結果が 2 件のみ
8. commit：
   git commit -m "release(app): publish approved main <APPROVED_MAIN_SHORT_SHA> to production"
   ※ commit message に個人情報・具体データ値・対象 JSON 名・旧 E2E spec 名を入れない
9. production tree 確認：
   git ls-tree -r --name-only HEAD（2 件のみ）
10. allowlist 完全一致確認（§9）：
    /usr/bin/diff による完全一致
11. denylist no hit 確認（§9）：
    path-grep のみ、本文 grep 不可
12. 危険 path NOT PRESENT 確認（§9）：
    git cat-file -e HEAD:<path>（12 件、本文非表示）
13. index.html 参照先確認（§10）：
    限定 grep、`-A`/`-B`/`-C` 不可
14. release 前 HEAD ベースライン記録（任意推奨）：
    push 前に root / index.html / shogi_v4.html の HEAD で etag / last-modified を記録
15. push：
    git push origin production
    ※ force push 不可、`-f` / `--force-with-lease` 不可
16. remote production SHA 確認：
    git ls-remote --heads origin production が local production SHA と一致
17. Pages build metadata 確認：
    gh api .../pages の status を polling、`status=built` まで
    source == "production:/" 維持を確認
18. root / index.html / shogi_v4.html HEAD 確認（§11）：
    curl -I --max-time 20、HTTP 200 必須
    任意推奨：etag / last-modified / x-cache を記録（release 前ベースラインと比較）
19. release 完了報告（§12）
20. isolated worktree 削除：
    git worktree remove ../shogi-release-<RELEASE_TASK_ID>
    ※ `--force` は別承認、`rm -rf` 禁止
21. 停止
```

## 8. release commit message テンプレート

```
release(app): publish approved main <APPROVED_MAIN_SHORT_SHA> to production
```

例：
```
release(app): publish approved main 3a89a61 to production
```

### 含めない項目

- 個人情報
- 具体データ値（件数、クラス分布、固定日付、固定日時、固定 URL）
- 対象 JSON 名（`data/import/20260412_participants.json` 等）
- 旧 E2E spec 名（`test/e2e/shogi_phase2_import.spec.js` 等）
- PR #169 / #174 への言及
- 内部 implementation 詳細

### 含めてよい項目

- approved main short SHA（先頭 7-12 char）
- release Task ID（任意、別 trailer として可）
- Co-Authored-By（任意、Claude Code 実行時の trailer）

### full SHA / short SHA の使い分けルール（Nice to Have 2 反映）

| 場所 / 用途 | full 40-char SHA | short SHA（7-12 char） |
|---|---|---|
| **承認文（§5）** | **必須**（approved main SHA / current production SHA） | 不可（検証・照合に不適） |
| **precondition 照合（§6）** | **必須**（`git rev-parse origin/main == <full-sha>`） | 不可 |
| **`git checkout` / `git rev-parse` 等の検証コマンド** | **必須** | 不可 |
| **release 完了報告（§12）** | **必須**（approved main / previous production / new production すべて full 40-char） | 不可 |
| **release log / docs / `docs/operations/release_logs/`** | **必須**（永続記録は full SHA） | 任意併記可（読みやすさのため） |
| **commit message subject（§8）** | 任意（長いと subject が読みにくいため short が一般的） | **OK / 推奨**（表示用） |
| **chat / PR コメントでの概況報告** | 推奨（精度重視） | 表示用なら可（ただし操作判断には full を使う） |

### ルール

- **short SHA は「表示用」のみ**。検証・照合・操作判断には絶対に使わない
- **`git rev-parse origin/main` と short SHA の比較は禁止**（先頭 7 char 一致でも、別の commit が偶然先頭一致している可能性、または ambiguous prefix で SHA 解決失敗の可能性）
- **承認文 / precondition / 完了報告 / log は full 40-char SHA を必須**
- commit message に short SHA を含める場合も、commit message 内に full SHA を **trailer** として併記してよい（例：`Approved-Main-SHA: <full-40-char>` を末尾に置く）

### 推奨：full SHA trailer 併記

```
release(app): publish approved main <APPROVED_MAIN_SHORT_SHA> to production

Approved-Main-SHA: <APPROVED_MAIN_FULL_SHA>
Previous-Production-SHA: <PREVIOUS_PRODUCTION_FULL_SHA>
Release-Task-ID: SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

short SHA は subject の読みやすさ用、full SHA trailer は永続検証用。trailer は任意推奨だが、release log との照合容易性が上がる。

## 9. path-based 検査テンプレート

### allowlist（production tree の正しい状態）

- `index.html`
- `shogi_v4.html`

→ `git ls-tree -r --name-only production | sort` の出力が上記 2 件と **完全一致**

### denylist（含まれてはいけない path / pattern）

| 種別 | パターン |
|---|---|
| path prefix | `data/`, `data/import/`, `test/`, `test/e2e/`, `test/fixtures/`, `docs/`, `archive/`, `reports/`, `ai-requests/`, `.github/`, `playwright-report/`, `test-results/` |
| 単独 file | `HANDOFF.md`, `package.json`, `package-lock.json`, `playwright.config.js`, `.htmlvalidate.json` |
| 拡張子 | `*.csv`, `*.xlsx`, `*.pdf`, `*.zip`, `*.log`, `*.trace` |
| pattern | `backup`, `export`, `upload`, `archive`, `screenshots`, `snapshots` |

→ 上記いずれかに `git ls-tree -r --name-only production` がマッチしたら **即停止**。本文 grep は不可、path-grep のみ。

### 危険 path NOT PRESENT（12 件、`git cat-file -e production:<path>` で全件 NOT PRESENT を要求）

```
git cat-file -e production:data/import/20260412_participants.json
git cat-file -e production:test/e2e/shogi_phase2_import.spec.js
git cat-file -e production:docs/
git cat-file -e production:test/
git cat-file -e production:.github/
git cat-file -e production:package.json
git cat-file -e production:package-lock.json
git cat-file -e production:playwright.config.js
git cat-file -e production:archive/
git cat-file -e production:reports/
git cat-file -e production:ai-requests/
git cat-file -e production:HANDOFF.md
```

1 件でも PRESENT が出たら **即停止**。`git cat-file -e` は **存在確認のみで本文非表示**。

## 10. index.html 参照先確認テンプレート

004D / 004G §10 と同じ限定確認。

### 確認対象（参照属性 / 参照構文）

- `src=`
- `href=`
- `action=`
- `manifest=`
- `import`
- `url(`

### 推奨コマンド

```
grep -Eoi '(src|href|action|manifest)=["'\''][^"'\'']+["'\'']|import[[:space:]]+["'\''][^"'\'']+["'\'']|url\([^)]+\)' index.html
```

### 出力ルール

- 参照属性名 / 参照先 path / URL / hit 件数のみ
- **`index.html` 全文表示禁止**
- **`shogi_v4.html` 本文表示禁止**
- `cat` / `head` / `tail` / `less` / `sed -n` 禁止
- `grep -A` / `-B` / `-C`（前後行つき）禁止

### 判定

| 結果 | 判定 |
|---|---|
| 参照先が `shogi_v4.html` のみ | OK |
| fragment / same-page anchor / 空 `href` のみ | OK |
| 外部 URL（http:// / https://） | metadata として記録、必要なら停止して人間判断 |
| `.css` / `.js` / `.png` / `.jpg` / `.svg` / `.ico` / `.webmanifest` / `manifest.json` / `assets/` / `css/` / `js/` / `images/` / その他 allowlist 外相対 path | **NG、即停止** |

### NG 時

- `index.html` を変更しない
- allowlist を勝手に増やさない（拡張は 004I で別承認）
- production branch を変更しない
- 報告して停止
- 後続タスクで「allowlist 拡張」または「`index.html` 修正」を判断

## 11. Pages 確認テンプレート

### 必須確認

- Pages metadata（`gh api .../pages`）
- `source == {"branch":"production","path":"/"}`
- `status == "built"`
- root / `index.html` / `shogi_v4.html` の HEAD 確認
  - `curl -I --max-time 20`
  - **HTTP 200 必須**

### body fetched 記録方針（Should Fix 2 反映）

**主記録（必須）**：
- `body fetched: no`
- `response body stored: no`

**body 未取得の根拠（必須）**：
1. リクエストが **HEAD であること**（`curl -I` を使用、`curl` without `-I` / `-X GET` / `wget` 等は使わない）
2. **output 保存していないこと**（`> file` / `-o file` / `-O` 等の output redirect / file write をしていない）

この 2 つを根拠として、release 完了報告に「body fetched: no（HEAD request only, no output redirect）」を主記録する。

**補助確認（任意、必須判定条件にしない）**：
- curl 表示上の `% Received` カラムが 0
- Content-Length は header にあっても、body 自体は配信されていないこと

curl の進捗表示の `% Received` カラムは便利な補助シグナルだが、curl のバージョン / TTY 環境 / `--silent` の有無で表示が揺れる。**curl 表示の進捗値に依存しすぎない**。本質は「HEAD であること + output 保存していないこと」。

### 任意推奨：etag / last-modified の変化記録

- release 前 baseline と release 後の比較
  - `etag` 変化 → 新 build 配信の強いシグナル
  - `last-modified` 更新 → production 新規 build のシグナル
  - `x-cache: MISS` / `age: 0` も補助シグナル
- ただし GitHub Pages / CDN 挙動依存のため **絶対条件にしない**（HTTP 200 が必須、他は補助）

### 禁止

- HTTP GET（`curl` without `-I`、`curl -X GET`、`wget`）
- `curl -L`（redirect follow）
- response body 保存（メモリ / ファイルへの保存）
- browser 表示
- screenshot
- Playwright / browser automation
- raw.githubusercontent.com アクセス

## 12. release 完了報告テンプレート

### SHA 欄の意味（Nice to Have 1 反映）

| SHA 欄 | 意味 | 取得元 |
|---|---|---|
| **approved main SHA** | 承認文で固定された main の commit。release 取り込み元 | 承認文 §5 の `<APPROVED_MAIN_SHA>`、full 40-char 必須 |
| **previous production SHA** | release **前** の production HEAD SHA。承認文の `current production SHA` と同義 | 承認文 §5 の `<CURRENT_PRODUCTION_SHA>`、release 開始前の `git rev-parse origin/production` |
| **new production SHA after release** | release **後** に作成された production の新 commit SHA | release 後の `git rev-parse origin/production`、commit message 直後に取得 |

3 つは別々の SHA で、混同しないこと。承認文時点では `new production SHA` は未定（まだ commit していない）、完了報告で記録する。

### 完了報告テンプレート

```
SHOGI-TOUR APPHQ-<RELEASE_TASK_ID> production release 完了報告

1. precondition 確認結果（§6 の 15 項目）
2. approved main SHA：<APPROVED_MAIN_FULL_SHA>（full 40-char、承認文と一致）
3. previous production SHA：<PREVIOUS_PRODUCTION_FULL_SHA>（full 40-char、承認文の current production SHA と同じ、release 開始前の origin/production と一致）
4. new production SHA after release：<NEW_PRODUCTION_FULL_SHA>（full 40-char、release 後の origin/production と一致）
5. release 対象ファイル：index.html, shogi_v4.html
6. checkout 元が approved main SHA であったこと（`main` symbolic ref 不使用、`git checkout <APPROVED_MAIN_FULL_SHA> -- ...` を使った）
7. staged path 確認結果：index.html / shogi_v4.html の 2 件のみ
8. commit SHA（new production SHA と同じ）：<NEW_PRODUCTION_FULL_SHA>
9. push 結果：fast-forward / non-force、`[forced update]` ではない
10. production tree allowlist 完全一致：PASS
11. denylist no hit：PASS（HITS=0）
12. 危険 path NOT PRESENT：PASS（12 件すべて NOT PRESENT）
13. index.html 参照先確認：参照先 = shogi_v4.html のみ（または OK 判定理由）
14. Pages metadata：source=production:/, status=built, html_url=<url>
15. HEAD 確認結果（必須）：root 200 / index.html 200 / shogi_v4.html 200
16. HEAD 補助記録（任意）：
    - root: etag pre=<>, etag post=<>, last-modified pre=<>, last-modified post=<>, x-cache=<MISS/HIT>, age=<seconds>
    - index.html: 同上
    - shogi_v4.html: 同上
17. body fetched: no（主記録：HEAD request only、output 保存なし）
18. response body stored: no
19. screenshot taken: no
20. browser opened: no
21. % Received（補助、必須判定条件ではない）：root=0 / index.html=0 / shogi_v4.html=0
22. rollback：未実施
23. main / default branch / branch protection：無変化
    - main / origin/main = <APPROVED_MAIN_FULL_SHA>（release 開始前と同じ、release は main を変更しない）
24. clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`)：削除されていない、SHA=<CLEAN_FULL_SHA> 維持
25. 実行していないこと（force push / PR 作成 / main 変更 / Pages source 変更 / 履歴改変 / repo 移行 / `git add . -A glob` / `main` symbolic ref / 対象 JSON 閲覧 / 旧 E2E spec 閲覧 / browser / screenshot / Playwright / HTTP GET / body 取得 / 他 repo 操作 / 004C 残置 worktree path への再作成）
26. isolated worktree (`../shogi-release-<RELEASE_TASK_ID>`)：削除済み（`git worktree remove`、`--force` 不使用、`rm -rf` 不使用）
27. 停止位置
```

### release log との対応（Nice to Have 1 反映）

`docs/operations/release_logs/` への永続記録（004F-2 で template 化予定）でも、上記 3 つの SHA（approved main / previous production / new production after release）を **すべて full 40-char で記録** する。short SHA は表示用、永続記録は full SHA。

## 13. rollback 境界

- 本テンプレートでは **rollback は扱わない**
- rollback は **別承認**（004G §11 / 004F Runbook §13）
- 第一候補：**GitHub Pages 停止**
- 第二候補：production を前 commit に戻す
- 例外：Pages source を `main:/` に戻す（業務上の公開継続必須かつ人間が再承認した場合のみ）
- すべての rollback は **Level 4 個別承認**、`READY+MERGE+DELETE` バッチ対象外

## 14. 禁止事項

- approved main SHA 以外から checkout しない（`origin/main` の現在 HEAD ≠ approved main SHA なら停止）
- **`main` symbolic ref を使わない**（`git checkout main -- ...` 禁止）
- `git merge main` 禁止
- `git pull main` 禁止
- `git add .` / `git add -A` / glob 系 `git add` 禁止（明示 path のみ）
- allowlist 外を stage しない
- Pages source を変更しない（rollback も別承認）
- production branch 削除しない（local / remote 共に）
- default branch 変更しない
- branch protection 変更しない
- force push / `--force` / `--force-with-lease` 禁止
- Git 履歴改変（amend / rebase / reset --hard / filter-branch / filter-repo）禁止
- repo 移行禁止
- 対象 JSON（`data/import/20260412_participants.json`）本文表示禁止
- 旧 E2E spec（`test/e2e/shogi_phase2_import.spec.js`）本文表示禁止
- PR #169 / #174 diff 本文表示禁止
- 期待値リテラル / 固定値（具体件数 / クラス分布 / 固定日付）の再掲禁止
- `index.html` 全文表示禁止（限定 grep のみ）
- `shogi_v4.html` 本文表示禁止
- `cat` / `head` / `tail` / `less` / `sed -n` / `grep -A/-B/-C` 禁止
- `curl` without `-I` / `curl -L` / `wget` 禁止
- HTTP GET 禁止（HEAD のみ）
- browser 表示 / screenshot / Playwright / browser automation 禁止
- `rm -rf` / `git clean -fd` 禁止
- 他 repo 操作禁止
- clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`) 削除禁止
- 004C 残置 worktree path（`../shogi-004c-production`、既に削除済み）を release 作業用に再作成しない

## 15. 停止条件

以下のいずれかに該当したら **即停止**、追加操作なし。

- approved main SHA が full 40-char でない（short SHA、空、形式不正）
- current production SHA が full 40-char でない
- `git rev-parse origin/main` が approved main SHA と一致しない（main が進んだ / 別 ref を指している）
- `git rev-parse origin/production` が current production SHA と一致しない
- `git rev-parse production`（local）が current production SHA と一致しない
- Pages source が `production:/` でない
- Pages status が `built` でない
- default branch が `main` でない
- clean branch が消えている、または SHA が承認時点と異なる
- production tree に allowlist 外がある
- denylist hit がある
- 危険 path PRESENT がある
- `index.html` が allowlist 外 asset を参照している（外部 URL を含む）
- staged path が 2 件以外（`git status --short` が想定外）
- `git add .` / `-A` / glob が必要になる
- Pages 変更が必要になる
- rollback が必要になる
- 禁止操作が必要になる
- GitHub / git / gh / curl / npm のツールエラー
- approved main SHA / current production SHA / Pages source の承認文記載と実態が乖離
- HEAD 確認で root / `index.html` / `shogi_v4.html` のいずれかが 200 以外

### 失敗時の対応

- 勝手に修正・force push・rollback・branch 削除・Pages 設定変更しない
- 状態確認のみ行い、報告して停止
- 人間判断を仰ぐ
- 進めるには **別の release 承認** を取り直す

## 16. Done 条件

- release 承認文テンプレートがある（§5）
- precondition 確認テンプレートがある（§6、15 項目）
- release 実行手順テンプレートがある（§7、21 step）
- commit message テンプレートがある（§8）
- path 検査テンプレート（allowlist / denylist / 危険 path）がある（§9）
- `index.html` 参照先確認テンプレートがある（§10）
- Pages 確認テンプレートがある（§11）
- release 完了報告テンプレートがある（§12、26 項目）
- rollback 境界が明確（§13）
- 禁止事項・停止条件が明確（§14 / §15）
- 「approved main SHA は full 40-char 必須、short SHA 不可、`main` symbolic ref 不使用」がテンプレ全体で一貫している
- production / Pages / main / clean branch / 004C 残置 worktree を本タスクで変更しない方針が明確
