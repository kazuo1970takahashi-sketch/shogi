# SHOGI-TOUR-APPHQ-004F-2｜production release log テンプレート

## 1. 目的

production release の実行記録を残し、後から以下を **永続的に追跡** できるようにする。

- どの **approved main SHA** を本番反映したか
- release 前の **previous production SHA** は何だったか
- release 後の **new production SHA** は何になったか
- どのファイルを反映したか
- path-based 検査結果はどうだったか
- Pages の公開確認結果はどうだったか
- rollback 方針は何だったか
- 何を実行していないか（操作境界の永続記録）

release log は **永続的な監査記録** として機能し、release 当事者（operator / approver）と関係者が後から経緯を確認できるようにする。SHA は **すべて full 40-char** で記録する（short SHA は表示用のみ、永続記録には不適）。

## 2. release log の保存方針

| 項目 | ルール |
|---|---|
| 保存場所 | `docs/operations/release_logs/`（main 側） |
| ファイル名 | `YYYYMMDD_shogi_tour_release_<SHORT_NEW_PROD_SHA>.md` |
| 例 | `docs/operations/release_logs/20260601_shogi_tour_release_abc1234.md` |
| 配置 branch | **main のみ**（production には含めない） |
| Pages 公開 | **公開しない**（release log は production の allowlist に含まれない） |
| commit 形式 | docs-only PR、`READY+MERGE+DELETE` バッチ可（Must Fix なし時） |
| Risk Level | Level 1〜2（release 完了後の記録、本番への影響なし） |

### production に含めない理由

- release log には approved main SHA / previous production SHA / new production SHA / operator / approver / 時刻 / 検査結果 など、**運用情報** が含まれる
- これらは本番アプリ利用者には不要、公開すべきでない
- production branch は **本番配信に必要な最小ファイル** (`index.html` / `shogi_v4.html` v1) のみを維持する
- release log を本番公開する必要が出た場合（例：透明性要求）は、**allowlist 拡張判断（004I）として別タスク** で扱う
- 通常運用では release log を production に入れない

### 本タスクの範囲

- 本タスクでは **テンプレート定義のみ**
- `docs/operations/release_logs/` ディレクトリは **本タスクでは作成しない**（初回 release 時に必要なら作成）
- 実 release log は本タスクでは作らない

## 3. release log 作成タイミング

| イベント | 作成タイミング |
|---|---|
| 通常 release 成功 | release 実行報告完了後、別 PR または同一セッション内の docs-only commit として main に記録 |
| release 実行中 | 作成しない（実行中の中間記録は release 報告 chat / PR コメントで足りる） |
| rollback 発生時 | **別の rollback log** を作成（本テンプレートとは別、後述） |
| precondition 不一致で release 開始しなかった場合 | log 作成は任意。記録するなら「release not executed」として簡易記録 |

### 分離原則

- release log 作成は **production 反映とは分離** する（同一 commit にしない）
- release log 作成 PR は **production branch / Pages 設定 / main 既存 docs / app / test / CI / workflow に触れない**
- release log 作成は **docs-only / Level 1〜2**
- rollback が発生した場合は、release log とは別の rollback log を作る（template は別途 004F-3 等で検討）

## 4. release log テンプレート本体

以下を 1 ファイルにコピペし、プレースホルダ (`<>` 囲み) を実値で埋めて使う。

````markdown
# SHOGI-TOUR production release log｜<YYYY-MM-DD>｜<RELEASE_TASK_ID>

## 1. Summary

- **Release Task ID**: SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID>
- **Release date/time**: <YYYY-MM-DD HH:MM TZ>
- **Release status**: <Go / Partial / No Go / Rolled Back>
- **production branch**: production
- **Pages source**: production:/
- **Release type**: 通常 release（allowlist 変更なし、Pages source 変更なし）
- **Result**: <Go / Partial / No Go / Rolled Back>
- **One-line summary**: <例：approved main <SHORT_APPROVED> を production に反映、HEAD 200 確認済み>

## 2. Release Metadata

| 項目 | 値 |
|---|---|
| Repo | kazuo1970takahashi-sketch/shogi |
| Project ID | SHOGI-TOUR |
| Project Name | SHOGI-TOUR｜将棋大会運営アプリ |
| Release Task ID | SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID> |
| Approval Phrase | APPROVE SHOGI-TOUR APPHQ-<RELEASE_TASK_ID> PRODUCTION RELEASE ONLY |
| Operator | <OPERATOR_NAME>（実行者、通常 Claude Code） |
| Approver | <APPROVER_NAME>（承認文発行者、通常ユーザー） |
| Reviewer | <REVIEWER_NAME>（事後レビュー、通常 Codex / ChatGPT） |
| Executed at | <YYYY-MM-DD HH:MM TZ>（push 完了時刻） |
| Reported at | <YYYY-MM-DD HH:MM TZ>（完了報告時刻） |
| Timezone | <例：JST / UTC> |
| Tool / AI used | Claude Code（model: ...）/ ChatGPT / Codex |

## 3. Approved main SHA

すべて **full 40-char SHA**（short SHA は本セクションに記録しない、表示用は別途併記可）。

| 項目 | SHA |
|---|---|
| approved main SHA | `<APPROVED_MAIN_FULL_SHA>` |
| origin/main SHA at precondition | `<ORIGIN_MAIN_AT_PRECONDITION>` |
| local main SHA at precondition | `<LOCAL_MAIN_AT_PRECONDITION>` |
| approved main SHA == origin/main | **yes** / no |
| approved main SHA == local main | **yes** / no |
| mismatch handling | **not applicable** / stopped / reapproved |

### 注意

- short SHA は表示用のみ。検証・照合・log 記録には full 40-char SHA を使う。
- mismatch 発生時は「stopped」または「reapproved（新承認文で続行）」を記録。**勝手に approved main SHA を更新したケースは記録できない**（そのケースは禁止のため発生しないはず）。

## 4. Production SHA

すべて **full 40-char SHA**。previous / new の混同を避ける。

| 項目 | SHA |
|---|---|
| previous production SHA（release 前） | `<PREVIOUS_PRODUCTION_FULL_SHA>` |
| origin/production SHA at precondition | `<ORIGIN_PROD_AT_PRECONDITION>` |
| local production SHA at precondition | `<LOCAL_PROD_AT_PRECONDITION>` |
| **new production SHA after release** | `<NEW_PRODUCTION_FULL_SHA>` |
| origin/production SHA after push | `<ORIGIN_PROD_AFTER_PUSH>` |
| local production SHA after release | `<LOCAL_PROD_AFTER_RELEASE>` |
| previous == current production SHA before release | **yes** / no |
| new production SHA == origin/production after release | **yes** / no |

### 注意

- previous production SHA は承認文の `current production SHA` と同義（release 開始時点）
- new production SHA は release 実行後に作成された commit
- 両者は **異なる SHA** であり、混同しないこと

## 5. Release Target Files

- `index.html`
- `shogi_v4.html`

| 確認項目 | 結果 |
|---|---|
| release 対象は 2 件のみ | **yes** |
| allowlist 変更なし | **yes** |
| denylist 変更なし | **yes** |
| `git add .` / `-A` / glob 未使用 | **yes** |
| `git checkout <APPROVED_MAIN_FULL_SHA> -- index.html shogi_v4.html` 使用 | **yes** |
| `main` symbolic ref 不使用 | **yes** |

## 6. Precondition Results（004F-1 §6 の 15 項目）

| # | 項目 | 結果 |
|---|---|---|
| 1 | repo == kazuo1970takahashi-sketch/shogi | PASS / FAIL |
| 2 | APPROVED_MAIN_SHA is full 40-char | PASS / FAIL |
| 3 | CURRENT_PRODUCTION_SHA is full 40-char | PASS / FAIL |
| 4 | git rev-parse origin/main == APPROVED_MAIN_SHA | PASS / FAIL |
| 5 | git rev-parse origin/production == CURRENT_PRODUCTION_SHA | PASS / FAIL |
| 6 | git rev-parse production == CURRENT_PRODUCTION_SHA（local） | PASS / FAIL |
| 7 | default branch == "main" | PASS / FAIL |
| 8 | Pages source == {"branch":"production","path":"/"} | PASS / FAIL |
| 9 | Pages status == "built" | PASS / FAIL |
| 10 | gh pr list --head production --state all is empty | PASS / FAIL |
| 11 | clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`) 存在、SHA=`<CLEAN_FULL_SHA>` | PASS / FAIL |
| 12 | production tree == allowlist 2 件 (index.html / shogi_v4.html) | PASS / FAIL |
| 13 | denylist hit 0 | PASS / FAIL |
| 14 | 危険 path 12 件すべて NOT PRESENT | PASS / FAIL |
| 15 | index.html 参照先が allowlist 内（shogi_v4.html のみ） | PASS / FAIL |

すべて PASS であること。1 件でも FAIL なら release を開始していないはず。

## 7. Path-based Verification Results

### production tree path list

```
index.html
shogi_v4.html
```

### 検証結果（release 後の production HEAD に対して）

| 項目 | 結果 |
|---|---|
| allowlist 完全一致（/usr/bin/diff） | PASS |
| denylist no-hit（path-grep のみ） | PASS（HITS=0） |
| 危険 path NOT PRESENT（git cat-file -e、12 件） | PASS（12/12 NOT PRESENT） |
| changed files（PR 相当の path 一覧） | index.html / shogi_v4.html の 2 件 |
| staged files（git diff --cached --name-only） | index.html / shogi_v4.html の 2 件 |
| committed files（git ls-tree -r --name-only HEAD） | index.html / shogi_v4.html の 2 件 |

**本文は表示しない**。path metadata のみ記録。

## 8. index.html Reference Check

| 項目 | 値 |
|---|---|
| check method | `grep -Eoi '(src\|href\|action\|manifest)=...'`（限定 grep、`-A`/`-B`/`-C` 不可） |
| allowed reference | `shogi_v4.html` のみ |
| detected references | `<例：href="shogi_v4.html"`> |
| allowlist 外 asset 有無 | **no** |
| external URL 有無 | **no** |
| result | PASS |

**index.html / shogi_v4.html 全文表示はしない**。参照先限定抽出のみ。

## 9. Pages Metadata

`gh api .../pages --jq` 取得結果:

| 項目 | 値 |
|---|---|
| source | `{"branch":"production","path":"/"}` |
| status | `built` |
| html_url | `https://kazuo1970takahashi-sketch.github.io/shogi/` |
| https_enforced | true |
| public | true |
| build_type | legacy |
| latest deployment metadata | `<取得できれば記録、404 等の場合は記録不可と明記>` |

## 10. HEAD Check Results

`curl -I --max-time 20` による HEAD-only 確認（必須 HTTP 200）。

| URL | HTTP | content-type | body fetched | response body stored | browser opened | screenshot taken |
|---|---|---|---|---|---|---|
| `/shogi/` | **200** | text/html; charset=utf-8 | **no** | **no** | **no** | **no** |
| `/shogi/index.html` | **200** | text/html; charset=utf-8 | **no** | **no** | **no** | **no** |
| `/shogi/shogi_v4.html` | **200** | text/html; charset=utf-8 | **no** | **no** | **no** | **no** |

### body fetched: no の根拠（004F-1-FIX1 反映）

- リクエストが **HEAD であること**（`curl -I` 使用、`curl` without `-I` / `-X GET` / `wget` 不使用）
- **output 保存していない**（`-o file` / `-O` / `> file` 不使用）

`% Received: 0` は補助確認、必須判定条件ではない。

## 11. Optional Header Records（任意推奨、Nice to Have）

release 前後の比較で Pages 反映確認の補助とする。

| URL | etag (pre) | etag (post) | last-modified (pre) | last-modified (post) | x-cache | age |
|---|---|---|---|---|---|---|
| `/shogi/` | `<>` | `<>` | `<RFC1123>` | `<RFC1123>` | MISS / HIT | <seconds> |
| `/shogi/index.html` | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 |
| `/shogi/shogi_v4.html` | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 |

### 注意

- etag / last-modified は補助確認、**絶対条件にしない**（CDN / cache 挙動依存）
- HTTP 200 が必須、これら header は補助
- 取得できなかった項目は「N/A」と記録

## 12. Rollback Policy

| 項目 | 値 |
|---|---|
| rollback executed | **no** / yes |
| rollback reason | （実行時のみ記載、通常 release では空欄） |
| rollback first candidate（policy） | **GitHub Pages 停止** |
| rollback second candidate（policy） | production を前 commit に戻す |
| main:/ 戻し | **例外承認のみ**（業務上の公開継続必須、かつ人間が再承認した場合のみ） |
| rollback task ID（実行した場合） | SHOGI-TOUR-APPHQ-<ROLLBACK_TASK_ID> / N/A |

通常 release 成功時は `rollback executed: no`。

## 13. Actions Not Performed（操作境界の永続記録）

release 実行で **絶対に実行していない** ことを列挙する（事後監査用）。

- **Pages source 変更していない**（GET のみ、PUT/POST/PATCH/DELETE なし）
- **default branch 変更していない**
- **branch protection 変更していない**
- **force push していない**（`--force` / `-f` / `--force-with-lease` 不使用）
- **Git 履歴改変していない**（amend / rebase / reset --hard / filter-branch / filter-repo なし）
- **repo 移行していない**
- **production branch 削除していない**（local / remote 共に）
- **clean branch 削除していない**（`chore/shogi-tour-apphq-003h-2d-orphan-clean-base` 維持）
- **対象 JSON（`data/import/20260412_participants.json`）本文表示していない**
- **対象 JSON の閲覧・変更・削除・移動なし**
- **旧 E2E spec（`test/e2e/shogi_phase2_import.spec.js`）本文表示していない**
- **PR #169 / #174 diff 本文表示していない**
- **期待値リテラル / 固定値（具体件数 / クラス分布 / 固定日付）の再掲なし**
- **shogi_v4.html / index.html 本文の編集なし**（main から取り込むのみ）
- **HTTP GET していない**（HEAD のみ）
- **`curl -L` / `curl -X GET` / `wget` 不使用**
- **browser 表示していない**
- **screenshot 取得していない**
- **Playwright / browser automation 不使用**
- **response body 取得していない / 保存していない**
- **raw.githubusercontent.com アクセスしていない**
- **`git add .` / `git add -A` / glob 系 `git add` 不使用**
- **`main` symbolic ref 不使用**（`git checkout <APPROVED_MAIN_FULL_SHA> -- ...` を使った）
- **`rm -rf` / `git clean -fd` 不使用**
- **`git worktree remove --force` 不使用**（必要なら別承認）
- **004C 残置 worktree path への再作成なし**
- **release log を production branch に含めていない**
- **他 repo 操作なし**
- **PR 作成なし**（release は PR ベースではなく直 push）

## 14. Incidents / Deviations

| 項目 | 値 |
|---|---|
| deviation 有無 | **no** / yes |
| deviation 内容 | （あれば記載、例：HEAD ベースライン記録を取り忘れた、補助 header の一部を取得できなかった等） |
| 承認範囲内か | **yes** / no |
| 追加承認が必要だったか | **no** / yes |
| 追加承認 ID | SHOGI-TOUR-APPHQ-<ADDITIONAL_TASK_ID> / N/A |
| 影響 | （例：補助確認の欠落、影響なし） |
| 再発防止 | （例：次回 release 前に curl 出力フォーマットを統一） |

deviation がなければ「no」一行で OK。

## 15. Final State

| 項目 | 値 |
|---|---|
| main SHA | `<MAIN_SHA_AT_FINAL>`（release 前後で無変化、release は main を変更しない） |
| production SHA | `<NEW_PRODUCTION_FULL_SHA>` |
| Pages source | production:/ |
| Pages status | built |
| Pages URL | https://kazuo1970takahashi-sketch.github.io/shogi/ |
| default branch | main |
| clean branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `<CLEAN_FULL_SHA>` 維持 |
| release log location | `docs/operations/release_logs/<YYYYMMDD>_shogi_tour_release_<SHORT_NEW_PROD_SHA>.md`（本ファイル） |
| next action | （例：次の release は別タスク。allowlist 拡張は 004I で別承認） |

## 16. Operator / Reviewer / Approver

| 役割 | 値 |
|---|---|
| Operator | <例：Claude Code（model: Opus 4.7）> |
| Reviewer | <例：Codex / ChatGPT> |
| Approver | <例：ユーザー（kazuo1970takahashi-sketch）> |
| ChatGPT 関与 | <例：承認文作成 / レビュー統合 / Go 判断> |
| Claude Code 関与 | <例：repo 操作 / push / HEAD 確認 / 完了報告> |
| Codex 関与 | <例：事後 review / Must Fix・Should Fix 抽出> |
| Human decision point | <例：approved main SHA 固定の判断、release Go の最終判断、rollback 不要の判断> |

## 17. Notes

- 自由記述欄
- 例：次回 release で改善したい運用、テンプレ改善案、観測した CDN 挙動の特徴、business context 等
- **個人情報 / 対象 JSON 本文 / 旧 E2E spec 本文 / PR #169 #174 diff 本文 / 期待値リテラル / 固定値の再掲は禁止**
````

## 5. Summary セクション要件

§4 テンプレ §1 に該当。

- release task ID
- release date/time
- release status（Go / Partial / No Go / Rolled Back の 4 値）
- production branch（通常 `production`）
- Pages source（通常 `production:/`）
- release type（通常 release / allowlist 変更を伴う release / Pages source 変更を伴う release）
- result（Summary の status と整合）
- one-line summary（後から log 一覧をスキャンしやすくする）

## 6. Release Metadata セクション要件

§4 テンプレ §2 に該当。

- Repo / Project ID / Project Name
- Release Task ID / Approval Phrase
- Operator / Approver / Reviewer
- Executed at / Reported at / Timezone
- Tool / AI used（model 名含む）

## 7. Approved main SHA セクション要件

§4 テンプレ §3 に該当。**すべて full 40-char**。

- approved main SHA
- origin/main / local main at precondition
- 一致確認 yes / no
- mismatch handling（not applicable / stopped / reapproved）

short SHA は表示用のみ、log の SHA 欄には書かない。

## 8. Production SHA セクション要件

§4 テンプレ §4 に該当。**すべて full 40-char**、previous / new を明確に分離。

- previous production SHA（release 前、承認文の `current production SHA` と同義）
- new production SHA after release（release 後の新 commit）
- precondition 時点 / push 後の origin/production / local production
- 一致確認 yes / no

## 9. Release Target Files セクション要件

§4 テンプレ §5 に該当。

- index.html / shogi_v4.html の 2 件のみ
- allowlist 変更なし / denylist 変更なし
- `git add .` / `-A` / glob 未使用
- `git checkout <APPROVED_MAIN_FULL_SHA> -- ...` 使用
- `main` symbolic ref 不使用

## 10. Precondition Results セクション要件

§4 テンプレ §6 に該当。004F-1 §6 の 15 項目を PASS / FAIL で記録。

## 11. Path-based Verification Results セクション要件

§4 テンプレ §7 に該当。

- production tree path list
- allowlist 完全一致 / denylist no-hit / 危険 path NOT PRESENT
- changed files / staged files / committed files
- **本文非表示、path metadata のみ**

## 12. index.html Reference Check セクション要件

§4 テンプレ §8 に該当。

- check method（限定 grep）
- allowed reference / detected references
- allowlist 外 asset 有無 / external URL 有無
- result

**index.html / shogi_v4.html 全文表示禁止**、参照先限定抽出のみ。

## 13. Pages Metadata セクション要件

§4 テンプレ §9 に該当。

- source / status / html_url / https_enforced / public / build_type
- latest deployment metadata（取得できれば、legacy build_type で 404 ならその旨記録）

## 14. HEAD Check Results セクション要件

§4 テンプレ §10 に該当。

### 必須

- root / index.html / shogi_v4.html の HTTP 200
- body fetched: **no**
- response body stored: **no**
- browser opened: **no**
- screenshot taken: **no**

### body fetched: no の根拠

- HEAD request（`curl -I`）
- output 保存していない

## 15. Optional Header Records セクション要件

§4 テンプレ §11 に該当。任意推奨、必須判定条件にしない。

- etag / last-modified / cache-control / age / x-cache
- 取得できなければ N/A

## 16. Rollback Policy セクション要件

§4 テンプレ §12 に該当。

- rollback executed yes / no
- rollback reason / 第一候補 Pages 停止 / 第二候補 production rollback / 例外 main:/ 戻し
- rollback task ID（実行時のみ）
- 通常 release 成功時は no

## 17. Actions Not Performed セクション要件

§4 テンプレ §13 に該当。**操作境界の永続記録**。

主要項目（テンプレ §13 に列挙、合計 25+ 項目）：

- Pages 関連未操作
- default branch / branch protection 未変更
- force push / 履歴改変 / repo 移行なし
- production / clean branch 削除なし
- 対象 JSON / 旧 E2E spec / PR #169/#174 本文表示なし
- browser / screenshot / Playwright / HTTP GET なし
- `git add . / -A / glob` 不使用
- `main` symbolic ref 不使用
- `rm -rf` / `git clean -fd` / `git worktree remove --force` 不使用
- 004C 残置 worktree path 再作成なし
- release log を production に含めていない

## 18. Incidents / Deviations セクション要件

§4 テンプレ §14 に該当。

- deviation 有無 / 内容
- 承認範囲内か / 追加承認 ID
- 影響 / 再発防止

deviation なしなら「no」一行。

## 19. Final State セクション要件

§4 テンプレ §15 に該当。

- main / production / Pages / default branch / clean branch / release log location / next action

## 20. Operator / Reviewer / Approver セクション要件

§4 テンプレ §16 に該当。

- 役割と関与内容
- AI（ChatGPT / Claude Code / Codex）の関与
- Human decision point

## 21. release log 作成依頼テンプレート（Claude Code 向け）

release 完了後、operator（通常 Claude Code）に release log を作成させるための依頼文テンプレート。

```
SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID> release log 作成依頼

対象プロジェクト：
SHOGI-TOUR｜将棋大会運営アプリ

Repo：
kazuo1970takahashi-sketch/shogi

Task ID：
SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID>-LOG

目的：
SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID> production release の実行記録を
docs/operations/release_logs/ に永続記録する。

入力：
- approved main SHA: <APPROVED_MAIN_FULL_SHA>
- previous production SHA: <PREVIOUS_PRODUCTION_FULL_SHA>
- new production SHA after release: <NEW_PRODUCTION_FULL_SHA>
- release 完了報告（004F-1 §12 テンプレに従ったもの）
- HEAD 確認結果 / 任意 header 記録

作成ファイル：
docs/operations/release_logs/<YYYYMMDD>_shogi_tour_release_<SHORT_NEW_PROD_SHA>.md

テンプレート：
docs/operations/shogi_tour_apphq_004f2_production_release_log_template.md（本ドキュメント）§4 を使う。

範囲：docs-only、Level 1〜2。
production / Pages / main の app / test / CI / workflow / fixture は変更しない。

作業手順：
1. precondition 確認（main / production / Pages の現状を 004F-1 §6 と照合）
2. worktree 作成（origin/main 起点、新規 docs branch）
3. release log ファイル作成（プレースホルダを実値で埋める、すべて full 40-char SHA）
4. 変更が release log 1 ファイルのみであることを確認
5. commit（message: "docs(apphq): record production release log for <SHORT_NEW_PROD_SHA>"）
6. push（force 不可）
7. Draft PR 作成
8. PR コメント投稿
9. 停止（Ready 化 / merge / branch 削除は別承認）

禁止：
- production / Pages / main の app / test / CI / workflow / fixture 変更
- release 実行
- production への release log 反映
- 対象 JSON / 旧 E2E spec の閲覧・変更
- PR #169 / #174 diff 本文表示
- 個人情報 / 期待値リテラル / 固定値の再掲
- short SHA を SHA 欄に記入（短縮は表示用のみ）

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<RELEASE_TASK_ID>-LOG RELEASE LOG ONLY
```

## 22. release log レビュー依頼テンプレート（Codex / ChatGPT 向け）

```
レビュー依頼：SHOGI-TOUR release log PR #<N>

対象 PR: https://github.com/kazuo1970takahashi-sketch/shogi/pull/<N>
Task ID: SHOGI-TOUR-APPHQ-<RELEASE_TASK_ID>-LOG
範囲: docs-only / Level 1〜2

レビュー観点：

1. SHA の精度
   - approved main SHA / previous production SHA / new production SHA がすべて **full 40-char** で記録されているか
   - short SHA を SHA 欄に書いていないか（subject 等の表示用のみ可）
   - 3 つの SHA が混同されていないか（previous と new の取り違えはない、テーブル / 表記が明確）

2. 保存方針との整合
   - release log は main 側にあること（production には含まれていないこと）
   - 配置 path が `docs/operations/release_logs/` であること
   - ファイル名が `YYYYMMDD_shogi_tour_release_<SHORT_NEW_PROD_SHA>.md` 形式

3. release 検査結果の網羅
   - Precondition 15 項目すべてに PASS / FAIL の記録があるか
   - allowlist 完全一致 / denylist no-hit / 危険 path NOT PRESENT のすべてが記録されているか
   - index.html 参照先確認の結果が記録されているか

4. Pages 確認の網羅
   - Pages metadata（source / status / html_url）が記録されているか
   - HEAD 確認結果（root / index.html / shogi_v4.html すべて 200）が記録されているか
   - body fetched / response body stored / browser opened / screenshot taken がすべて no と明確
   - 任意 header（etag / last-modified / x-cache / age）が任意推奨として記録されているか

5. rollback 方針の明示
   - rollback executed が yes / no で明示
   - 通常 release 成功時は no、その場合 rollback first candidate は Pages 停止と記録
   - main:/ 戻しは「例外承認のみ」と明示

6. Actions Not Performed の網羅
   - Pages source 変更なし / 履歴改変なし / force push なし / 対象 JSON 閲覧なし / 旧 E2E spec 閲覧なし / browser/screenshot/Playwright なし / `git add .` 不使用 / `main` symbolic ref 不使用 等、テンプレ §13 の主要項目を網羅

7. 本文露出の禁止
   - 対象 JSON 本文 / 旧 E2E spec 本文 / PR #169 / #174 diff 本文 / 期待値リテラル / 固定値の再掲がないこと
   - index.html / shogi_v4.html の本文転載がないこと

判定:
- Go / Conditional Go / No Go を明示
- Conditional Go の場合は条件（FIX1 タスクで対応）を列挙
- 本タスクは release 後の永続記録のため、merge 阻止は通常発生しないが、SHA 取り違え・本文露出は Must Fix 扱い
```

## 23. release log と production の関係

- release log は **main 側の記録**、production には含めない
- production branch は本番配信に必要な **最小ファイル** (`index.html` / `shogi_v4.html` v1) のみを保持する
- release log を本番公開する必要が出た場合は **allowlist 拡張判断（004I）** が必要
- 通常運用では公開不要

### release log 配置 path と production allowlist の関係

| path | main 側 | production 側 |
|---|---|---|
| `docs/operations/release_logs/<...>.md` | **含める** | **含めない**（denylist の `docs/` に該当） |
| `index.html` | あり（release 元） | **allowlist v1** |
| `shogi_v4.html` | あり（release 元） | **allowlist v1** |

release log は denylist `docs/` 配下に置くため、誤って production に flow しても 004F-1 §6 の precondition 検査で **denylist hit** として検出される。これは安全側の冗長性。

## 24. Done 条件

- release log の保存方針が明確（§2）
- release log 作成タイミングが明確（§3）
- release log テンプレート本体がある（§4、17 セクション）
- approved main SHA / previous production SHA / new production SHA の記録欄が **分離されている**（§7 / §8）
- すべての SHA 欄が full 40-char 必須と明記（§7 / §8）
- Precondition 結果欄がある（§10）
- Path 検査結果欄がある（§11）
- index.html 参照先確認欄がある（§12）
- Pages / HEAD 確認欄がある（§13 / §14）
- 任意 header 記録欄がある（§15）
- rollback 方針欄がある（§16）
- Actions Not Performed 欄がある（§17、25+ 項目）
- Incidents / Deviations 欄がある（§18）
- Final State 欄がある（§19）
- Operator / Reviewer / Approver 欄がある（§20）
- release log 作成依頼テンプレートがある（§21、Claude Code 向け）
- release log レビュー依頼テンプレートがある（§22、Codex / ChatGPT 向け）
- release log と production の関係が明確、**production に含めない方針** が明確（§23）

## 25. 本タスクでやらないこと（明示）

- release 実行しない
- **release log の実物を作成しない**（テンプレート定義のみ）
- **`docs/operations/release_logs/` ディレクトリを作成しない**（初回 release 時に必要なら作成）
- production branch / main / Pages 変更なし
- shogi_v4.html / index.html / CI / workflow / test / fixture 変更なし
- 対象 JSON / 旧 E2E spec の閲覧・変更・削除・移動なし
- PR #169 / #174 diff 本文表示なし
- HTTP GET / curl without -I / browser / screenshot / Playwright なし
- Ready 化 / merge / branch 削除なし
