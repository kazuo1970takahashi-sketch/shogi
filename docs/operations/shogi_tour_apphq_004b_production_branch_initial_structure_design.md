# SHOGI-TOUR-APPHQ-004B｜production branch 初期構成設計

## 1. 目的

production branch を「GitHub Pages 本番公開専用 branch」として設計する。production branch には、アプリ利用者に公開してよい **最小ファイルのみ** を含める。

本タスクは docs-only。production branch はまだ作成しない。Pages source は変更しない。本番公開操作も行わない。

## 2. production branch の位置づけ

- production は **開発用 branch ではない**
- production は **本番公開成果物 branch**
- production では **テスト・検証・設計 docs を持たない**
- production には **実データ風ファイルを置かない**
- main から **自動的に同期しない**
- release 承認時のみ、必要ファイルを明示的に反映する

## 3. production branch 初期構成案（v1）

### 必須候補

- `index.html`
- `shogi_v4.html`

### 条件付き候補

- `README.md`（production 説明用、コンパクトな案内のみ）
- `favicon.ico` / `manifest.json` / `icon*` 等の Pages 配信用 asset
- 将来 CSS / JS / image が分離された場合の静的 asset（`assets/**`, `css/**`, `js/**`, `images/**`）
- `404.html`（必要なら後続検討）

### 含めない候補

- `package.json`
- `package-lock.json`
- `playwright.config.js`
- `.htmlvalidate.json`
- `.github/workflows/**`
- `test/**`
- `docs/**`
- `data/**`
- `archive/**`
- `reports/**`
- `ai-requests/**`
- `HANDOFF.md`
- fixtures
- snapshots
- traces
- logs
- screenshots
- CSV / Excel / PDF / zip / backup / export / upload
- 対象 JSON
- 旧 E2E spec

## 4. allowlist 案

production branch v1 の allowlist を **具体 path** で定義する。

### v1 初期 allowlist（必須のみ）

- `index.html`
- `shogi_v4.html`

### 後続追加候補（004D / 004F の検査対象）

- `README.md`
- `favicon.ico`
- `manifest.json`
- `assets/**`
- `css/**`
- `js/**`
- `images/**`
- `404.html`

004C で実際に作成する際は、まず v1 初期 allowlist のみで orphan branch を作る。後続追加は別タスク（004D 以降）で明示的に拡張する。

## 5. denylist 案

production branch に含めてはいけない path / pattern を具体化する。

### 必須 deny（path / prefix）

- `data/`
- `data/import/`
- `data/import/20260412_participants.json`
- `test/`
- `test/e2e/shogi_phase2_import.spec.js`
- `test/e2e/`
- `test/fixtures/`
- `docs/`
- `archive/`
- `reports/`
- `ai-requests/`
- `HANDOFF.md`
- `.github/`
- `playwright.config.js`
- `package.json`
- `package-lock.json`
- `.htmlvalidate.json`
- `playwright-report/`
- `test-results/`

### 必須 deny（拡張子 / pattern）

- `*.csv`
- `*.xlsx`
- `*.pdf`
- `*.zip`
- `*.log`
- `*.trace`
- `**/*backup*`
- `**/*export*`
- `**/*upload*`
- `**/*archive*`
- `screenshots`
- `snapshots`

denylist は 003H-2-D1 で確立した list を継承し、production 用に具体化したもの。

## 6. path-based 検査方針

production branch 検査は **本文を開かず、path metadata のみ** で行う。

### 使うもの

- `git ls-tree -r --name-only production`
- allowlist 完全一致確認（`/usr/bin/diff` による）
- denylist grep（path-grep のみ、本文 grep 禁止）
- `git cat-file -e production:<危険path>` による NOT PRESENT 確認

### 見ないもの

- 対象 JSON 本文
- 旧 E2E spec 本文
- PR #169 / #174 diff 本文
- 実データの値 / 件数 / unique values
- screenshot / trace / artifact
- `git diff` / `git show` / `cat` / `head` / `tail` / `less` / `sed -n` / `awk 本文` / `jq` 本文用途 / parser / OCR

## 7. 初期 production branch 作成方式案

### 案A：main から branch を切り、不要ファイルを削除する

**評価**:
- 通常 diff に大量削除が出る
- PR に削除対象 path が出る
- 本文露出リスクは低いが、今回の運用思想とは相性が悪い
- **非推奨**

### 案B：orphan branch として production を作る

**評価**:
- 最小ファイルだけを含められる
- clean branch 作成（003H-2-D）で確立済みの手順を流用可能
- PR を作らず、path metadata で検査可能
- **推奨**

### 案C：既存 clean branch `7e30119` を production の元にする

**評価**:
- 既に検証済み
- ただし `package.json` / `package-lock.json` / `playwright.config.js` / `test/` / `.github/workflows/` 等、本番不要ファイルも 11 件中に含む
- production v1 としてはやや多い
- 参考にはなるが、そのまま production にしない方がよい

### 案D：`gh-pages` branch を公開専用にする

**評価**:
- GitHub Pages 慣習には合う
- production という名前の方が業務上はわかりやすい
- 代替案

### 推奨

**案B**。production は orphan branch として **最小構成（index.html / shogi_v4.html のみ）** で作成する。

## 8. production branch 作成時の固定方針

004C で作成する場合の初期方針を明記する。

| 項目 | 方針 |
|---|---|
| branch 名 | `production` |
| 作成方式 | orphan branch |
| include | `index.html` / `shogi_v4.html` のみ（v1 allowlist） |
| push | するかどうかは 004C で **個別承認** |
| PR | **原則作らない**（path metadata で検査） |
| Pages source 変更 | 004C では **しない** |
| Pages source 切替 | 004E で **別承認**（Level 4） |
| test 実行 | 004D で実施 |
| rollback | production branch 削除、または Pages source を `main:/` に戻す |

## 9. production branch 作成後の検証（004D）

004D でやることを定義する。

- production tree path 一覧確認（`git ls-tree -r --name-only production`）
- **allowlist 完全一致**（`/usr/bin/diff` による）
- **denylist no hit**（path-grep のみ）
- 危険 path の `git cat-file -e production:<path>` による **NOT PRESENT 確認**
- GitHub Pages source は **まだ `main:/` のまま** であることの metadata 確認
- production branch SHA 確認
- 必要なら **isolated worktree** で HEAD 確認相当の静的存在確認（003H-2-E2 と同じパターン）
- browser 表示 / body 取得 / screenshot / Playwright は **別承認**

## 10. Pages source 切替前提（004E）

004E でやることを定義する。

- production branch 検証（004D）が **pass していること**
- production には allowlist 以外が含まれていないことが確定していること
- source を `main:/` から `production:/` へ切り替える
- **Level 4 個別承認**、`READY+MERGE+DELETE` バッチ対象外
- 切替後に `curl -I` で root / `index.html` / `shogi_v4.html` を **HEAD のみ確認**
- body 取得 / browser 表示 / screenshot は原則しない
- rollback 手順を明確化（source を `main:/` に戻す、または Pages 停止、production branch rollback）

## 11. release 運用との関係（004F）

004F で Runbook 化する内容を定義する。

- main で開発
- production へ **明示的に反映**（自動同期しない）
- production 反映前に allowlist / denylist 検査
- Pages source 切替は **Level 4**
- 本番 URL 確認（HEAD のみが基本）
- release 記録（commit SHA / production SHA / Pages source / URL / HEAD status / 承認者 / 日時）
- rollback（別タスク、Level 4 個別承認）

## 12. staging との関係

- staging branch は **現時点では作らない**
- staging Pages は公開面を増やすため、後続検討（004G 以降）
- staging を導入する場合、production と **同等の denylist 検査を必須** にする
- staging 用の include / denylist は production と乖離しない範囲で別途定義

## 13. 事故りそうな要素

| # | 事故 | 緩和 |
|---|---|---|
| 1 | production に docs / test / data を入れてしまう | orphan + allowlist 完全一致 + denylist no-hit を 004D で必須化 |
| 2 | main から自動同期してしまう | production は手動反映限定、CI で自動 push を行わない |
| 3 | production 作成と Pages source 切替を同時にやってしまう | 004C と 004E を別タスク化、個別承認境界を明確化 |
| 4 | PR を作って大量 diff を出してしまう | orphan branch では PR を原則作らず、path metadata で検査 |
| 5 | allowlist を広げすぎる | v1 は `index.html` / `shogi_v4.html` のみ、拡張は別タスク承認 |
| 6 | staging Pages を作って公開面を増やす | staging 導入は 004G 以降の別承認、production 同等検査必須 |
| 7 | release 手順が曖昧になり、main と production が乖離する | 004F で Runbook 化、release 記録の必須項目を定義 |
| 8 | production branch 削除時に誤って main を削除する | 削除対象 branch 名を `main` / `release/*` / `production` / `production/*` / `gh-pages` でないことを事前 case で拒否 |
| 9 | clean branch を誤って削除する | clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`) は保険として保持、削除は別承認 |
| 10 | Pages source を切替後 build が失敗して公開停止する | 切替前に production の `index.html` 存在確認、切替後 HEAD でステータス確認、失敗時は source を `main:/` に戻す |

## 14. 後続タスク分解

| Task ID | 範囲 |
|---|---|
| SHOGI-TOUR-APPHQ-004B | production branch 初期構成設計（本タスク） |
| SHOGI-TOUR-APPHQ-004C | production branch 作成 only（orphan branch、include 最小構成、push 有無は個別承認、Pages source 切替なし） |
| SHOGI-TOUR-APPHQ-004D | production branch path 検証（allowlist / denylist / 危険 path NOT PRESENT） |
| SHOGI-TOUR-APPHQ-004E | GitHub Pages source を `production:/` へ切替（Level 4 個別承認、HEAD 確認、rollback 方針） |
| SHOGI-TOUR-APPHQ-004F | release Runbook 作成 |
| SHOGI-TOUR-APPHQ-004G | 本番 / テスト分離運用テンプレート整備（staging 検討含む） |

## 15. Done 条件

- production branch の目的が明確
- include / allowlist 初期案が明確
- exclude / denylist 初期案が明確
- orphan branch 方式の採用可否が整理されている
- Pages source 切替が別タスクと明確
- 004C / 004D / 004E の境界が明確
- Level 4 操作の境界が明確

## 16. 今回やらないこと

- production branch 作成
- staging branch 作成
- Pages source 切替
- GitHub Pages 設定変更
- GitHub Pages 再有効化
- main 切替
- default branch 変更
- branch protection 変更
- force push
- Git 履歴改変
- repo 移行
- release / deploy / publish
- clean branch 削除
- 対象 JSON 削除
- 旧 E2E spec 削除
- shogi_v4.html 変更
- CI 設定変更
- workflow 変更
- test 変更
- fixture 変更
