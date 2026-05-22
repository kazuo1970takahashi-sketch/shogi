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
- current production SHA：<CURRENT_PRODUCTION_SHA>（full 40-char 必須、short SHA 不可）
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
  - body 0 bytes（`% Received` が 0 であること）

### 任意推奨

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

```
SHOGI-TOUR APPHQ-<RELEASE_TASK_ID> production release 完了報告

1. precondition 確認結果（§6 の 15 項目）
2. approved main SHA：<sha>
3. previous production SHA：<sha>
4. new production SHA：<sha>
5. release 対象ファイル：index.html, shogi_v4.html
6. checkout 元が approved main SHA であったこと（`main` symbolic ref 不使用）
7. staged path 確認結果：index.html / shogi_v4.html の 2 件のみ
8. commit SHA：<new-production-sha>
9. push 結果：fast-forward / non-force / `[new branch]` ではない / `[forced update]` ではない
10. production tree allowlist 完全一致：PASS
11. denylist no hit：PASS（HITS=0）
12. 危険 path NOT PRESENT：PASS（12 件すべて NOT PRESENT）
13. index.html 参照先確認：参照先 = shogi_v4.html のみ（または OK 判定理由）
14. Pages metadata：source=production:/, status=built, html_url=<url>
15. HEAD 確認結果（必須）：root 200 / index.html 200 / shogi_v4.html 200
16. HEAD 補助記録（任意）：
    - root: etag pre=<>, etag post=<>, last-modified pre=<>, last-modified post=<>
    - index.html: 同上
    - shogi_v4.html: 同上
17. body fetched: no
18. screenshot taken: no
19. browser opened: no
20. response body stored: no
21. rollback：未実施
22. main / default branch / branch protection：無変化
23. clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`)：削除されていない、SHA=7e30119 維持
24. 実行していないこと（force push / PR 作成 / main 変更 / Pages source 変更 / 履歴改変 / repo 移行 / `git add . -A glob` / `main` symbolic ref / 対象 JSON 閲覧 / 旧 E2E spec 閲覧 / browser / screenshot / Playwright / HTTP GET / body 取得 / 他 repo 操作）
25. isolated worktree (`../shogi-release-<RELEASE_TASK_ID>`)：削除済み（`git worktree remove`、`--force` 不使用、`rm -rf` 不使用）
26. 停止位置
```

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
