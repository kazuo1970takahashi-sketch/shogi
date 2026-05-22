# SHOGI-TOUR-APPHQ-004G｜本番 / テスト分離運用テンプレート

## 1. 目的

本番 / テスト分離後の **標準運用テンプレート** をまとめる。今後の AI 作業依頼、レビュー依頼、release 承認、rollback 承認で使う定型文を整備し、毎回ゼロから承認文を書かなくて済むようにする。

本ドキュメントは「コピペ元」として使う。テンプレートは状況に応じて編集してよいが、**禁止事項ブロックと停止条件ブロックは原則そのまま流用** する。

## 2. 現在の環境構成

| 項目 | 値 |
|---|---|
| 開発統合 branch | `main` |
| 本番公開 branch | `production` |
| GitHub Pages source | `production:/` |
| default branch | `main` |
| production initial SHA | `093cab0` |
| main current SHA | `00c3fe3` |
| Pages URL | https://kazuo1970takahashi-sketch.github.io/shogi/ |
| production tracked tree | `index.html` / `shogi_v4.html`（v1 allowlist） |
| 保険 branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `7e30119` |
| 004C 残置 worktree | `../shogi-004c-production`（運用テンプレでは触らない） |

production には **docs / test / data / archive / reports / ai-requests を含めない**。main の変更は production に **自動反映されない**。

## 3. 運用原則

- 開発・検証は **main 側で行う**
- 本番公開は **production 側で行う**
- Pages source は **`production:/` を維持** する（004E 以降の既定）
- production は **自動同期しない**
- production への反映は **release 承認時のみ**
- release は **approved main SHA 固定** で行う（`main` symbolic ref 不使用）
- production には **allowlist 以外を入れない**
- Pages source 変更 / rollback / production branch 変更 / 履歴改変 / repo 移行は **Level 4**
- 通常 docs PR は `READY+MERGE+DELETE` **バッチ対象**
- **Level 4 操作はバッチ対象外**（個別承認）

## 4. 標準タスク分類

| 分類 | Risk Level | 承認形式 | バッチ可否 | 主な禁止 | 代表タスク例 |
|---|---|---|---|---|---|
| docs-only 設計 | Level 1 | 単一承認文 | バッチ可（Must Fix なし時） | app / test / CI / Pages / production 変更 | 004A〜004G、各 FIX1 |
| app 実装（shogi_v4.html / index.html） | Level 2 | 単一承認文 | バッチ可（CI green + Must Fix なし） | production / Pages 変更、release 実行 | 機能追加、UI 修正 |
| test 追加（synthetic only） | Level 2 | 単一承認文 | バッチ可 | 旧 E2E spec 復活、対象 JSON 本文閲覧 | synthetic spec 追加 |
| CI / workflow 変更 | Level 3 | 個別承認 | バッチ条件付（影響範囲確認後） | Pages 連携 workflow 改変 | trigger 変更、check 追加 |
| **production release** | **Level 4** | **個別承認**（approved main SHA 固定） | **バッチ対象外** | `git add .` / `-A` / glob、`main` symbolic ref、本文閲覧 | 004F-1 系 release 実行 |
| **Pages source 変更** | **Level 4** | **個別承認** | **バッチ対象外** | source を main:/ に戻す（例外時のみ） | source 切替、custom domain |
| **rollback** | **Level 4** | **個別承認** | **バッチ対象外** | main:/ 戻しを安易に選ぶ | Pages 停止、production rollback |
| branch cleanup | Level 2〜4 | 個別承認 | 条件付 | protected branch 削除 | merged docs branch 削除（バッチ内）/ production 削除（Level 4） |
| worktree cleanup | Level 2〜4 | 個別承認 | 条件付 | `rm -rf`、`git clean -fd`、production worktree force remove（Level 4） | 004C 残置 worktree cleanup |
| allowlist 拡張 | Level 3〜4 | 個別承認 | バッチ対象外 | release と同時実行、検証なしの拡張 | favicon / manifest / assets 追加判断（004I） |

## 5. docs-only PR 用テンプレート（依頼）

```
SHOGI-TOUR-APPHQ-<task-id> 実装依頼｜<task title>

対象プロジェクト：
SHOGI-TOUR｜将棋大会運営アプリ

Repo：
kazuo1970takahashi-sketch/shogi

Task ID：
SHOGI-TOUR-APPHQ-<task-id>

目的：
<目的を 1-3 行で>

今回のタスクは docs-only。
production / Pages / app / test / CI は変更しない。

作成ファイル：
docs/operations/shogi_tour_apphq_<task_id>_<slug>.md

文書タイトル：
# SHOGI-TOUR-APPHQ-<TASK-ID>｜<title>

今回やらないこと：
- production branch を変更しない
- main を変更しない
- GitHub Pages source を変更しない
- Pages 設定変更しない
- release / deploy / publish しない
- shogi_v4.html / index.html 変更しない
- workflow / CI 設定 / test / fixture 変更しない
- 対象 JSON / 旧 E2E spec の閲覧・変更・削除・移動なし
- PR #169 / #174 diff 本文表示なし
- 004C 残置 worktree を削除しない
- clean branch を削除しない
- Ready 化 / merge / branch 削除はしない（バッチ承認待ち）

文書に含める内容：
<セクション概要>

作業手順：
1. precondition 確認
2. worktree 作成（origin/main 起点、新規 docs branch）
3. docs 作成
4. 変更確認（1 ファイルのみ）
5. commit
6. push（force 不可）
7. Draft PR 作成
8. PR コメント投稿
9. 停止

完了報告に含めること：
1. precondition 確認結果
2. 作成 branch
3. 作成ファイル
4. 文書に記録した主な内容
5. Pages production:/ built 確認
6. production branch SHA 確認
7. clean branch remote 存在確認
8. 004C 残置 worktree に触れていないこと
9. commit SHA
10. push 結果
11. Draft PR URL
12. 実行していないこと
13. 停止位置

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<TASK-ID> <SCOPE> ONLY
```

## 6. docs-only PR レビュー依頼テンプレート

Codex / ChatGPT / 他レビュアー向け。

```
レビュー依頼：SHOGI-TOUR PR #<N>

対象 PR: https://github.com/kazuo1970takahashi-sketch/shogi/pull/<N>
Task ID: SHOGI-TOUR-APPHQ-<task-id>
範囲: docs-only / Level 1

確認観点:
- scope 確認：変更ファイル数、production / Pages / app / test / CI / workflow / fixture に触れていないか
- Must Fix（merge 阻止）：本番安全性、運用境界、Level 4 操作の混入、本文露出経路
- Should Fix（merge 前推奨）：approved main SHA / 承認文テンプレ整合、rollback 順序、branch 削除安全
- Nice to Have（後続でも可）：表現改善、後続タスクへの言及補強
- Ready 化可否、merge 可否（squash 前提）

判定:
- Go / Conditional Go / No Go を明示
- Conditional Go の場合は条件（FIX1 タスクで対応）を列挙
```

## 7. `READY+MERGE+DELETE` バッチ承認テンプレート

通常 PR 後処理。docs-only / Level 1〜2 / Must Fix なし に限る。

```
承認：SHOGI-TOUR PR #<N> READY+MERGE+DELETE

対象 PR：#<N>
Task ID：SHOGI-TOUR-APPHQ-<task-id>
対象 branch：<branch>
head commit：<full 40-char sha>
base：main
想定 diff scope：<path> のみ

実行範囲：
1. PR #<N> の precondition / CI / diff scope を確認
2. PR #<N> を Ready 化
3. Ready 後に precondition / CI / diff scope を再確認
4. PR #<N> を squash merge
5. merge 後、origin/main が squash commit を指すことを確認
6. merge 済み feature branch を remote / local から削除
7. main を最新化（`git fetch origin main:main`、直接 checkout は untracked 衝突回避のため避ける）
8. 完了報告

branch 削除安全チェック（§14 共通手順）：
- main / production / gh-pages / release/* / production/* / default branch / protected branch は削除拒否
- 削除対象 branch と PR head が完全一致確認
- clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`) は保険として保持
- squash merge 由来で `-d` が拒否された場合のみ、内容が main に保持されていることを `git cat-file -e` で確認して `-D` 可

禁止事項：
- production / Pages / main 設定変更、release 実行、force push、Git 履歴改変、repo 移行
- 004C 残置 worktree への操作
- 対象 JSON / 旧 E2E spec の閲覧・変更
- PR #169 / #174 diff 本文表示

完了報告：
1. Ready 化前 precondition 結果
2. CI 結果
3. Ready 化結果
4. merge 前 precondition 結果
5. diff scope 確認結果
6. squash merge 結果
7. squash commit SHA
8. main / origin/main
9. remote branch 削除結果
10. local branch 削除結果
11. PR が MERGED のまま
12. Pages が production:/ built のまま
13. production branch が 093cab0 のまま
14. clean branch が削除されていない
15. 004C 残置 worktree に触れていない
16. 実行していない操作
17. 停止位置

Approval Phrase：
APPROVE SHOGI-TOUR PR #<N> READY+MERGE+DELETE
```

## 8. app 実装 PR テンプレート

`shogi_v4.html` / `index.html` 等を変更する通常開発 PR。

```
SHOGI-TOUR-APPHQ-<task-id> 実装依頼｜<feature 名>

目的：
<機能 / 修正 / リファクタの目的>

変更対象：
- shogi_v4.html（または index.html）
- 必要なら synthetic E2E spec / fixture

test 方針：
- synthetic spec のみ
- 対象 JSON 本文は閲覧しない
- 旧 E2E spec は復活させない

CI：
- Unit / Security / E2E (synthetic) すべて pass を要求

production への反映：
- 本 PR では production を変更しない
- production には自動反映されない
- Pages 公開内容は変化しない（Pages source = production:/ のまま）
- production 反映は別タスク（release）として承認文に approved main SHA を固定して個別承認で実施

今回やらないこと：
- production branch を変更しない
- Pages source を変更しない
- main 切替 / default branch 変更 / branch protection 変更しない
- force push / Git 履歴改変 / repo 移行しない
- release / deploy / publish しない
- 対象 JSON / 旧 E2E spec の閲覧・変更・削除・移動なし
- PR #169 / #174 diff 本文表示なし

作業手順：
1. precondition 確認（main / origin/main 一致、production / Pages 維持）
2. worktree 作成（origin/main 起点、feature branch 新規）
3. 変更実装（明示 path、`git add .` 不可）
4. test 確認
5. commit
6. push
7. Draft PR 作成（CI トリガー）
8. レビュー受領後 Ready / merge は別承認（バッチ可）

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<TASK-ID> <FEATURE NAME> ONLY
```

## 9. production release 承認テンプレート（004F Runbook 連動）

```
承認：SHOGI-TOUR APPHQ-<task-id> production release

Task ID：
SHOGI-TOUR-APPHQ-<task-id>

Risk Level：Level 4
バッチ対象外：READY+MERGE+DELETE 不可

固定項目：
- approved main SHA：<full 40-char sha>
- current production SHA：<full 40-char sha>
- release 対象：index.html / shogi_v4.html の 2 件のみ
- allowlist 変更なし
- denylist 変更なし
- Pages source 変更なし（production:/ のまま）
- Pages source の現状：production:/ built

反映方法（Runbook §8 案A）：
- worktree path: ../shogi-release-<task-id>
- git worktree add ../shogi-release-<task-id> production
- git checkout <approved-main-sha> -- index.html shogi_v4.html
- git add index.html shogi_v4.html
- `git add .` / `-A` / glob は禁止
- commit message: "release(apphq): <task-id> bring index.html and shogi_v4.html from main <approved-main-sha>"

検証（必須）：
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
- force push、PR 作成、main 変更、default branch 変更、branch protection 変更
- Pages source を main:/ に戻す（例外時のみ別承認）
- 対象 JSON / 旧 E2E spec の閲覧・変更
- shogi_v4.html / index.html 本文の編集（main から取り込むのみ）
- body 取得 / browser 表示 / screenshot
- 004C 残置 worktree を release 作業に使う

rollback：
- 第一候補：GitHub Pages 停止（別承認）
- 第二候補：production を前 commit に rollback（別承認）
- 例外：Pages source を main:/ に戻す（人間再承認時のみ）
- いずれも Level 4 個別承認、バッチ対象外

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<TASK-ID> PRODUCTION RELEASE ONLY
```

## 10. production release 完了報告テンプレート

```
SHOGI-TOUR APPHQ-<task-id> production release 完了報告

1. precondition 確認結果
2. approved main SHA：<sha>
3. origin/main SHA（開始時点、approved と一致したことの記録）
4. previous production SHA：<sha>
5. new production SHA：<sha>
6. release 対象ファイル：index.html, shogi_v4.html
7. allowlist 完全一致：PASS
8. denylist no hit：PASS
9. 危険 path NOT PRESENT（12 件）：PASS
10. index.html 参照先確認：参照先 = shogi_v4.html のみ（or NG 内容）
11. Pages source：production:/ 維持
12. Pages status：built
13. HEAD 確認（必須）：root 200 / index.html 200 / shogi_v4.html 200
14. HEAD 補助（任意）：etag / last-modified / x-cache 変化記録
15. body fetched: no
16. screenshot taken: no
17. browser opened: no
18. response body stored: no
19. rollback：未実施
20. main / origin/main：無変化
21. default branch：main 維持
22. clean branch：7e30119 維持
23. 004C 残置 worktree：未操作
24. 実行していないこと（force push なし / PR なし / main 変更なし / Pages source 変更なし / 履歴改変なし / git add . `-A` glob 不使用 / main symbolic ref 不使用）
25. 停止位置
```

## 11. rollback 承認テンプレート

```
承認：SHOGI-TOUR APPHQ-<task-id> rollback

Task ID：
SHOGI-TOUR-APPHQ-<task-id>

Risk Level：Level 4
バッチ対象外

rollback 候補（第一候補から順に検討）：

第一候補：GitHub Pages 停止
- 対象：repo の Pages 配信
- API：gh api --method DELETE repos/.../pages（または UI から disable）
- 影響：公開面が即時 404 に
- 復旧手順：別 release 完了後、再有効化を別承認

第二候補：production branch を前 commit に戻す
- 対象：production branch
- 方法：git push -f は不可。worktree で revert commit を作って push
- ※ production branch の力技 reset は別承認、本テンプレでは扱わない

例外：Pages source を main:/ に戻す
- 採用条件：業務上の公開継続が必須、かつ人間がリスクを再承認
- 通常 rollback では選ばない（main に検証 / docs / data が混入している可能性あり）

固定項目：
- rollback 理由：<incident 内容、影響の見え方>
- 影響範囲：<公開停止時間、ユーザー影響>
- 復旧方針：<どの状態に戻すか、いつ復旧予定か>
- 通知要否：<関係者通知の要否>
- rollback 後の next step

禁止：
- main:/ 戻しを「とりあえず」で選ぶ
- production branch を削除する（branch 削除は別タスク）
- clean branch を削除する
- Git 履歴改変 / force push
- 対象 JSON / 旧 E2E spec の閲覧・変更
- body 取得 / browser 表示 / screenshot

完了報告：
- rollback 操作内容
- 操作前後の Pages metadata
- HEAD 確認（root / index.html / shogi_v4.html）
- 影響時間
- 通知実施有無
- 次の release / 復旧計画

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<TASK-ID> ROLLBACK ONLY
```

## 12. Pages source 変更テンプレート

通常は **使わない**（既に production:/ が確定）。source 変更が必要になるのは構成変更 / 緊急切替 / 実験のみ。

```
承認：SHOGI-TOUR APPHQ-<task-id> PAGES SOURCE CHANGE

Risk Level：Level 4
バッチ対象外

固定項目：
- 変更前 source：<branch>:<path>
- 変更後 source：<branch>:<path>
- 採用理由：<必要性>
- 変更前 production / main SHA：<sha> / <sha>
- 変更後の Pages 配信予想内容：<allowlist 等>

事前検証：
- 切替先 branch の tracked tree が allowlist と一致
- denylist no hit
- 危険 path NOT PRESENT
- 切替先 branch SHA 固定

API：
- gh api --method PUT repos/.../pages -f "source[branch]=<branch>" -f "source[path]=<path>"
- POST / DELETE / PATCH は本テンプレでは使わない（disable は rollback テンプレ）

事後確認：
- gh api .../pages：source / status
- HEAD（必須）：root / index.html / shogi_v4.html すべて 200
- body 取得 / browser 表示 / screenshot は別承認

禁止：
- source を main:/ に戻す（業務継続必須かつ人間再承認時のみ例外）
- custom domain 設定
- repo visibility 変更
- branch protection 変更
- Git 履歴改変
- 本文表示

rollback：
- 第一候補：Pages 停止
- 第二候補：source を元 branch に戻す（本テンプレに準じた手順）
- いずれも別承認

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<TASK-ID> PAGES SOURCE CHANGE ONLY
```

## 13. allowlist 拡張テンプレート

v1 allowlist は `index.html` / `shogi_v4.html` の 2 件。拡張候補：

- `favicon.ico`
- `manifest.json` / `*.webmanifest`
- `assets/**`
- `css/**`
- `js/**`
- `images/**`
- `404.html`

```
承認：SHOGI-TOUR APPHQ-<task-id> ALLOWLIST EXTENSION

Risk Level：Level 3〜4（追加対象による）
バッチ対象外

固定項目：
- 追加 path / pattern：<list>
- 追加理由：<why now>
- 影響範囲：<index.html 参照との整合、Pages 配信量>
- 依存：<release で参照先が追加されているか>

検証（追加前）：
- main 側に追加対象 path が存在することを確認
- 追加対象が denylist と衝突しないことを確認
- 追加対象が個人情報 / 実データ / fixture / docs / test / archive を含まないことを確認
- index.html / shogi_v4.html の参照先と整合確認（参照していない asset を増やさない）

検証（追加後）：
- 004D 相当の path 検査を再実行
  - allowlist 完全一致（新 allowlist で）
  - denylist no hit
  - 危険 path NOT PRESENT
  - index.html 参照先確認
- Pages 反映は別タスク（release）として実施

禁止：
- release と同時実行（allowlist 拡張は別タスクで完結）
- 検証なしの拡張
- 個人情報 / 実データ / 機密 asset の追加
- 本文表示
- Pages source 変更

完了報告：
- 旧 allowlist
- 新 allowlist
- 検査結果（PASS / FAIL）
- 次の release で取り込む計画
- 実行していないこと

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<TASK-ID> ALLOWLIST EXTENSION ONLY
```

## 14. worktree cleanup テンプレート

```
承認：SHOGI-TOUR APPHQ-<task-id> WORKTREE CLEANUP

対象 worktree：../shogi-004c-production（または他の残置 worktree path）
attached branch：production（または該当 branch）

Risk Level：Level 2〜4（attached branch の重要度による）

方針：
- `git worktree remove <path>` を最優先
- untracked / modified が原因で remove が失敗する場合のみ、**`git worktree remove --force <path>`** を個別承認
- `rm -rf` は禁止（worktree metadata が repo 側に残り、後で `git worktree prune` が必要になる）
- attached branch は変更しない、削除しない
- production branch / 保険 branch は削除対象外

事前確認：
- worktree path が想定と一致
- attached branch が main / production / gh-pages / release/* / production/* に該当しないか確認
- もし production が attached なら、production branch 自体は削除しないことを承認文に明記
- repo 本体（/Users/takahashikazuo/projects/shogi）には触らない

手順：
1. git worktree list で対象を確認
2. git worktree remove <path>（no force）
3. 失敗時、untracked が原因なら --force 個別承認で再試行
4. git worktree prune（不要だが安全）
5. (test -e <path> && echo STILL EXISTS || echo REMOVED)
6. attached branch / clean branch / 重要 branch の SHA が無変化であることを確認

禁止：
- rm -rf
- git clean -fd
- production branch / clean branch / main / default branch を削除
- attached branch の commit / push / 変更
- Pages 設定変更
- Git 履歴改変

Approval Phrase：
APPROVE SHOGI-TOUR APPHQ-<TASK-ID> WORKTREE CLEANUP ONLY
```

## 15. branch cleanup（削除安全）テンプレート

すべての branch 削除前に **必ず実行する共通チェック**（004B-FIX1 §14 と同等）。

### 削除拒否リスト

- `main`
- `production`
- `gh-pages`
- `release/*`（先頭 `release/`）
- `production/*`（先頭 `production/`）
- default branch（`gh repo view --json defaultBranchRef` で取得）
- protected branch（branch protection 有効）
- clean branch（`chore/shogi-tour-apphq-003h-2d-orphan-clean-base` 等の保険 branch）

### 削除可能条件

- merged 済みの `docs/*` / `feature/*` / `chore/*` 等の一時 branch
- 対象 PR の `headRefName` と削除対象 branch 名が **完全一致** すること（`gh pr view <N> --json headRefName` で確認）

### 手順

```bash
BR="<削除対象>"
# 1. 完全一致確認
echo "target: $BR"
# 2. 保護名照合
case "$BR" in
  main|production|gh-pages|release/*|production/*) echo "REFUSE"; exit 1;;
esac
DEFAULT=$(gh repo view <owner/repo> --json defaultBranchRef --jq '.defaultBranchRef.name')
[ "$BR" = "$DEFAULT" ] && { echo "REFUSE: default"; exit 1; }
# 3. PR head 一致確認
PR_HEAD=$(gh pr view <N> --json headRefName --jq '.headRefName')
[ "$BR" = "$PR_HEAD" ] || { echo "MISMATCH"; exit 1; }
# 4. 保険 branch 除外
[ "$BR" = "chore/shogi-tour-apphq-003h-2d-orphan-clean-base" ] && { echo "REFUSE: insurance"; exit 1; }
# 5. remote 削除
git push origin --delete "$BR"
# 6. local 試行
git branch -d "$BR" || {
  # squash merge 由来で拒否されたら main に内容保持を確認して -D
  git cat-file -e main:<expected-path> && git branch -D "$BR"
}
```

### 禁止

- 上記安全チェックをスキップしての削除
- `--force` の闇雲な使用
- protected branch / default branch / 保険 branch 削除

## 16. AI 別役割テンプレート

| AI / 役割 | 主な責務 |
|---|---|
| **ChatGPT** | 方針整理 / 承認文作成 / レビュー結果統合 / Go・No Go 判断 / 司令塔 |
| **Claude Code** | repo 操作 / docs 作成 / branch 作成 / PR 作成 / CI 確認 / 承認範囲内の実行 / 実行報告 |
| **Codex** | independent review / Must Fix・Should Fix・Nice to Have / Go・Conditional Go・No Go 判断 |
| **Claude / cowork（補助）** | 補助レビュー / 設計比較 / 第二意見 |
| **ユーザー** | 最終承認 / 本番公開判断 / 個人情報・業務リスク判断 / Level 4 承認 / Approval Phrase の発行 |

承認文は **ChatGPT が作成、ユーザーが確認・発行、Claude Code が実行、Codex が事後レビュー** の流れが標準。

## 17. 禁止事項共通ブロック（コピペ用）

```
- force push / `--force` / `--force-with-lease` 禁止
- Git 履歴改変（amend / rebase / reset --hard / filter-branch / filter-repo）禁止
- GitHub Pages source 変更禁止（別承認時のみ）
- GitHub Pages 再有効化 / 設定変更禁止（別承認時のみ）
- default branch 変更禁止
- branch protection 変更禁止
- repo visibility / collaborators / teams 変更禁止
- release / deploy / publish 禁止（release 承認時のみ）
- `git add .` / `git add -A` / glob 系 git add 禁止
- `git clean -fd` / `rm -rf` 禁止
- 対象 JSON（data/import/20260412_participants.json）本文表示禁止
- 旧 E2E spec（test/e2e/shogi_phase2_import.spec.js）本文表示禁止
- PR #169 / #174 diff 本文表示禁止
- 期待値リテラル / 固定値（具体件数 / クラス分布 / 固定日付）の再掲禁止
- browser 表示 / screenshot / Playwright 起動 / browser automation 禁止
- body 取得 / `curl -L` / `curl -X GET` / `wget` 禁止
- raw.githubusercontent.com アクセス禁止
- HTTP GET（HEAD のみ許可、それも必要時のみ）
- 他 repo 操作禁止
- 004C 残置 worktree (`../shogi-004c-production`) への操作禁止（cleanup タスク時のみ別承認）
- clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`) 削除禁止
- production branch 削除禁止
```

## 18. 停止条件共通ブロック（コピペ用）

```
以下のいずれかに該当したら即停止し、追加操作なし：

- precondition 不一致（main / origin/main、production / origin/production、Pages source / status、clean branch SHA、default branch のいずれか）
- PR head commit が承認時から変化
- expected scope 外のファイル変更が出ている
- CI failure（pending なら待機、failure は停止）
- mergeStateStatus が CLEAN ではない
- protected branch / default branch / 保険 branch に触れそうになる
- production / Pages / main 設定に触れそうになる（承認外で）
- 本文表示（対象 JSON / 旧 E2E spec / PR #169 / #174 diff / shogi_v4.html / index.html 全文）が必要になる
- 禁止コマンド（force push / `--force` / `rm -rf` / `git clean -fd` / `git add .` 等）が必要になる
- API mutation（`gh api --method POST/PUT/PATCH/DELETE`）が承認外で必要になる
- GitHub / git / gh / curl / npm のツールエラー
- approved main SHA / current production SHA / Pages source の承認文記載と実態が乖離
- 続行に rollback / 再承認が必要になる

失敗時の対応：
- 勝手に修正・force push・rollback・branch 削除・Pages 設定変更しない
- 状態確認のみ行い、報告して停止
- 人間判断を仰ぐ
```

## 19. 後続タスク

| Task ID | 範囲 |
|---|---|
| SHOGI-TOUR-APPHQ-004G | 本番 / テスト分離運用テンプレート整備（本タスク） |
| SHOGI-TOUR-APPHQ-004F-1 | release 実行テンプレート詳細化（具体 SHA / 具体 path / 具体 Approval Phrase の埋め込み版） |
| SHOGI-TOUR-APPHQ-004F-2 | release log テンプレート（`docs/operations/release_logs/` の構造設計、log 自体は production に含めない） |
| SHOGI-TOUR-APPHQ-004H | 004C 残置 worktree (`../shogi-004c-production`) cleanup（`git worktree remove --force` の Level 4 個別承認） |
| SHOGI-TOUR-APPHQ-004I | production allowlist 拡張判断（favicon / manifest / assets / css / js / images の必要性検討） |
| APP-HQ-OPS | 他アプリへ展開する共通テンプレート化（SHOGI-TOUR 以外の APP-HQ 配下プロジェクトで再利用） |

## 20. Done 条件

- docs-only PR 依頼テンプレートがある（§5）
- docs-only PR レビューテンプレートがある（§6）
- `READY+MERGE+DELETE` バッチテンプレートがある（§7）
- app 実装 PR テンプレートがある（§8）
- production release 承認テンプレートがある（§9）
- production release 完了報告テンプレートがある（§10）
- rollback テンプレートがある（§11）
- Pages source 変更テンプレートがある（§12）
- allowlist 拡張テンプレートがある（§13）
- worktree cleanup テンプレートがある（§14）
- branch cleanup（削除安全）テンプレートがある（§15）
- AI 別役割が明確（§16）
- 共通禁止事項ブロックがある（§17）
- 共通停止条件ブロックがある（§18）
- 後続タスクが整理されている（§19）
- 本タスクでは production / main / Pages / clean / 004C 残置 worktree いずれも変更しない
