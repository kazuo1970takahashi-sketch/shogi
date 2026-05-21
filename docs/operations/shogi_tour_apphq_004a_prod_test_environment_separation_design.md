# SHOGI-TOUR-APPHQ-004A｜本番 / テスト環境分離 方針設計

## 1. 目的

SHOGI-TOUR において、開発・検証・本番公開を分離し、検証用ファイル・実データ風ファイル・docs・test artifact が GitHub Pages の本番公開 tree に混入しない運用を作る。

## 2. 方針転換の整理

003G / 003H では、当初、実データ風ファイルの公開を重大リスクとして扱い、Pages 停止・clean branch 作成・main tree 撤去検討まで進めた。

しかし人間判断により、対象情報は既にメール等で公開済みであり、慣習上公開前提で、高リスク識別子も含まれないため、main 置換 / Git 履歴改変 / repo 移行までは不要と再評価した。

今後は、過去対応を厳密にやり切るより、将来の誤公開を防ぐための本番 / テスト環境分離を優先する。

## 3. 現状整理

- main は開発・運用の中心 branch
- GitHub Pages は一時停止後、業務上の公開停止を長引かせないため `main:/` から **暫定復旧済み**（タスク `004A-PAGES-RESTORE-MAIN` 完了、`status=built`、`html_url=https://kazuo1970takahashi-sketch.github.io/shogi/`、`https_enforced=true`）
- ただし、本番 / テスト環境分離の最終形としては production branch を公開元にする方針を引き続き検討する（004E 以降の判断）
- clean branch（`chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `7e30119`）は作成・検証・remote 保存済み
- production branch は未作成
- staging branch は未作成
- Pages 公開元は暫定 `main:/`、最終形は本ドキュメント案 B に基づき再設計予定
- CI は Unit / Security / E2E が存在
- E2E は現在 synthetic 専用 E2E に限定されている
- data/import のようなファイルを本番公開 tree に混ぜない運用が必要

## 4. 目指す理想形

- 開発は feature branch で行う
- 検証は main または staging で行う
- 本番公開は production branch または gh-pages branch から行う
- GitHub Pages は本番公開専用 branch を source にする
- 本番公開 branch にはアプリ公開に必要な最小ファイルだけを含める
- docs / test / data / archive / reports / ai-requests / screenshots / traces は公開 branch に含めない
- 本番公開は明示的な release 承認後のみ行う

## 5. branch 構成案

### 案A：main = 本番、feature = 開発

**内容**:
- main を Pages 公開元にする
- feature branch から PR で main へ統合
- main がそのまま本番

**メリット**:
- シンプル
- GitHub Pages 設定がわかりやすい
- 現行運用に近い

**デメリット**:
- main に検証用ファイルが混ざるとそのまま公開される
- data/import / docs / test が本番公開 tree に混入しやすい
- 今回のような混入事故を構造的に防ぎにくい

**評価**: 非推奨または暫定のみ。

### 案B：main = 開発統合、production = 本番公開

**内容**:
- main は開発統合 branch
- production branch を本番公開元にする
- GitHub Pages source を production にする
- release 時に main から production へ必要ファイルのみ反映する

**メリット**:
- main に検証ファイルがあっても production に入れなければ公開されない
- 本番反映が明示的になる
- Pages 公開 tree を最小化できる
- release 承認を作りやすい

**デメリット**:
- production branch 管理が必要
- release 手順が増える
- production への反映方法を設計する必要がある

**評価**: 推奨。

### 案C：gh-pages = 公開専用 branch

**内容**:
- main は開発統合
- gh-pages branch を公開専用にする
- production branch の代わりに gh-pages を使う

**メリット**:
- GitHub Pages の慣習に合う
- 公開専用 branch としてわかりやすい
- app 本体だけ置きやすい

**デメリット**:
- gh-pages という名前が特殊
- production という業務用語より意味が伝わりにくい場合がある
- release 手順はやはり必要

**評価**: 案 B の代替候補。

### 案D：別 repo を本番公開専用にする

**内容**:
- 開発 repo と公開 repo を分ける
- 公開 repo には本番ファイルのみ置く

**メリット**:
- 最も分離が強い
- 開発資産が公開 repo に混ざらない
- 本番公開物が明確

**デメリット**:
- repo 管理が増える
- URL / Pages / 権限 / release 連携が複雑
- 今すぐやるには重い

**評価**: 将来候補。現時点では過剰。

## 6. 推奨案

**推奨**: 案 B「main = 開発統合、production = 本番公開」

**理由**:
- 運用が現実的
- main の履歴や開発作業を壊さない
- Pages 公開元を安全に分離できる
- production branch に最小ファイルだけ入れる運用ができる
- 今回作成した clean branch の知見を活かせる
- 将来、production branch を clean branch 由来で作ることもできる

## 7. production branch に含めてよいファイル

### include 候補

- shogi_v4.html
- index.html
- 必要な静的 asset
- 必要最小限の README
- 必要なら favicon / manifest 等

### 条件付き

- package.json / package-lock.json は、Pages 公開には不要なら含めない
- test/run_tests.sh は含めない
- Playwright config は含めない
- CI workflow は production branch に必要か要検討
- synthetic fixture は含めない

### 考え方

production branch は「開発・検証用 branch」ではなく「公開成果物 branch」。よって、テストや開発設定は基本的に含めない。

## 8. production branch に含めないファイル

- data/import/**
- test/**
- docs/**
- reports/**
- archive/**
- ai-requests/**
- HANDOFF.md
- Playwright snapshots
- screenshots
- traces
- logs
- generated artifacts
- fixtures
- CSV / Excel / PDF / zip / backup / export / upload
- 個人情報 / 実データ / 一時データ / 大会参加者データ
- old / temp / debug 系ファイル

### 公開前 path-based チェック（必須）

production branch を公開元として確定する前に、以下の path metadata ベース検査を **本文を開かず** に実施する。本文閲覧 / parser / OCR は使わない。

denylist no-hit 確認（`git ls-tree -r --name-only <production-branch>` の出力に対して path grep）:

- `data/` が含まれない
- `data/import/` が含まれない
- `test/` が含まれない
- `docs/` が含まれない
- `archive/` が含まれない
- `reports/` が含まれない
- `ai-requests/` が含まれない
- `fixture` / `fixtures` が含まれない
- 旧 E2E spec（`test/e2e/shogi_phase2_import.spec.js` 等）が含まれない
- 対象 JSON（`data/import/20260412_participants.json` 等）が含まれない
- Playwright snapshots / traces / screenshots が含まれない
- 拡張子 `.csv` / `.xlsx` / `.pdf` / `.zip` / `.log` / `.trace` が含まれない
- `backup` / `export` / `upload` / `-archive` を含む path が含まれない

include / allowlist 完全一致確認：

- `git ls-tree -r --name-only <production-branch> | sort` を allowlist と `/usr/bin/diff` で完全一致確認
- 差分があれば即停止、production 確定しない

直接危険 path の NOT PRESENT 確認：

- `git cat-file -e <production-branch>:data/import/20260412_participants.json` → NOT PRESENT
- `git cat-file -e <production-branch>:test/e2e/shogi_phase2_import.spec.js` → NOT PRESENT

これらは 004D（production branch 検証）の必須項目とし、pass しない限り 004E（Pages source 切替）に進まない。

## 9. test / staging 環境の考え方

当面は以下の 2 段階でよい。

### Level 1
- feature branch + main 上で検証
- synthetic E2E
- GitHub Pages 本番は production からのみ

### Level 2
- staging branch を追加
- staging Pages または別 URL で確認
- production 反映前に staging 承認を行う

現時点では **Level 1 を推奨**。staging Pages は便利だが、公開先が増えるため、導入は後続でよい。

## 10. release 手順案

境界を明示するため、release はフェーズに分けて扱う。

### Phase A：開発 〜 main merge

1. feature branch で開発
2. PR 作成
3. Unit / Security / E2E pass
4. Codex / ChatGPT レビュー
5. main へ merge

ここまでは通常 PR（Level 2 まで）と同じ承認境界で扱える。

### Phase B：production 反映 と path-based 差分確認

6. release 対象ファイルを確認
7. production branch へ必要ファイルのみ反映
8. production 差分が **公開対象だけ** であることを **path metadata** で確認
   - `git ls-tree -r --name-only <production-branch>` の出力に対して
   - denylist no-hit 確認（§8「公開前 path-based チェック」と同一基準）
   - include allowlist との `/usr/bin/diff` 完全一致確認
   - 対象 JSON / 旧 E2E spec の `git cat-file -e` による NOT PRESENT 確認
   - 本文は閲覧しない（git diff 系・cat / head / tail / less / sed -n / jq / parser / OCR 不可）

### Phase C：Pages source 切替（Level 4 個別承認、バッチ対象外）

9. Pages source を `main:/` から `production:/` へ移す判断
   - **Level 4 個別承認** が必須
   - `READY+MERGE+DELETE` バッチの対象外
   - 切替コマンドは `gh api --method PUT repos/.../pages -f "source[branch]=production" -f "source[path]=/"` などを承認文で明示
   - source 切替以外の Pages 設定（custom domain / visibility / public）は変更しない

### Phase D：公開後 URL 確認

10. 本番 URL を確認
    - **`curl -I`（HEAD のみ）を基本**とする
    - `-L` は使わない、body 取得 / browser 表示 / screenshot / Playwright は必要時のみ別承認
    - 確認対象: root / `index.html` / `shogi_v4.html` の HEAD ステータス
    - 必要に応じて Pages metadata（`gh api .../pages`）の `status=built`, `source` を再確認

### Phase E：release 記録

11. release 完了記録（commit SHA / production SHA / Pages source / URL / HEAD status / 承認者 / 日時）

### Phase F：rollback（必要時のみ別タスク）

- Pages source を `main:/` に戻す: Level 4 個別承認、別タスク
- Pages を停止する: Level 4 個別承認、別タスク
- production branch を前 commit に戻す: Level 4 個別承認、別タスク
- いずれも `READY+MERGE+DELETE` バッチの対象外

ただし、最初の production 導入時は別タスクで慎重に進める。

## 11. AI 役割分担

| AI / 役割 | 主な責務 |
|---|---|
| ChatGPT | 方針整理 / 承認文作成 / Go・No Go 判断 / リスク整理 / PR レビュー統合 |
| Claude Code | repo 操作 / docs 作成 / branch 作成 / PR 作成 / CI 確認 / 承認範囲内の実行 |
| Codex | independent review / Must Fix・Should Fix・Nice to Have / Go・Conditional Go・No Go 判断 |
| ユーザー | 最終承認 / 本番公開判断 / 個人情報・業務リスク判断 / Level 4 操作承認 |

## 12. 承認レベル

| Level | 範囲 |
|---|---|
| Level 1 | docs-only 設計 |
| Level 2 | 通常 PR / test 追加 / synthetic fixture |
| Level 3 | CI 設定 / Pages source に関係しない workflow 変更 / production include list 変更 |
| Level 4 | production branch 作成 / GitHub Pages 再有効化 / Pages source 切替 / default branch 変更 / branch protection 変更 / main 切替 / Git 履歴改変 / force push / repo 移行 / 本番公開 |

## 13. バッチ承認運用

### 通常 PR 後処理

Ready 化 → squash merge → branch 削除 は、docs-only / Level 1〜2 かつ Must Fix なしの場合、1 つの Approval Phrase でバッチ実行してよい。

例:
```
APPROVE SHOGI-TOUR PR #N READY+MERGE+DELETE
```

ただし、**Level 4 操作はバッチ対象外**。production / Pages / main / repo / force push / 履歴改変は個別承認を維持する。

## 14. 003H 系の扱い

003H 系で作成した clean branch は、保険・参考実装として保持する。ただし、main 置換 / Git 履歴改変 / repo 移行は現時点では停止。必要になれば再開できるが、現在の優先順位は APPHQ-004 系の環境分離。

- clean branch: `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`
- commit: `7e30119`

## 15. GitHub Pages 復旧方針

Pages は既に `main:/` から **暫定復旧済み**（タスク `004A-PAGES-RESTORE-MAIN`、`status=built`、`html_url=https://kazuo1970takahashi-sketch.github.io/shogi/`）。業務上、公開停止を長引かせないための暫定措置である。

今後の課題は、production branch を作成した後、Pages source を `main:/` から `production:/` へ移すかどうかを **004E 以降で判断** すること。production への source 切替は **Level 4 個別承認** で扱い、`READY+MERGE+DELETE` バッチの対象外とする。

切替前提：
- 004B で production の include / denylist が具体 path 化されている
- 004C で production branch が作成され、004D で path metadata 検証が pass している
- 切替後 URL は HEAD（`curl -I`）で確認、body 取得 / browser 表示 / screenshot は必要時のみ別承認

## 16. 今後のタスク分解

| Task ID | 範囲 |
|---|---|
| SHOGI-TOUR-APPHQ-004A | 本番 / テスト環境分離 方針設計（本タスク） |
| SHOGI-TOUR-APPHQ-004A-PAGES-RESTORE-MAIN | GitHub Pages を `main:/` から暫定復旧（実施済み） |
| SHOGI-TOUR-APPHQ-004A-FIX1 | 本ドキュメントの Codex Must Fix / Should Fix 反映（実施中） |
| SHOGI-TOUR-APPHQ-004B | production branch 初期構成設計（**denylist / allowlist の具体 path 化** を含む） |
| SHOGI-TOUR-APPHQ-004C | production branch 作成 only |
| SHOGI-TOUR-APPHQ-004D | production branch 検証（§8「公開前 path-based チェック」を必須項目化） |
| SHOGI-TOUR-APPHQ-004E | GitHub Pages source を `main:/` から `production:/` へ切替（Level 4 個別承認） |
| SHOGI-TOUR-APPHQ-004F | release 手順 Runbook 作成 |
| SHOGI-TOUR-APPHQ-004G | 本番 / テスト分離運用テンプレート整備 |

### Nice to Have（004B 以降で取り込む補強）

- 004B にて、production branch の **denylist / allowlist を具体 path 化** する（プレースホルダではなく実 path 一覧として確定する）
- staging を導入する場合（004G 以降の検討）、staging Pages も公開面を 1 つ増やすため、**production と同じ denylist 検査を必須**にする。staging 用の include / denylist は production と乖離しない範囲で別途定義する。

## 17. Done 条件

- branch 構成案が整理されている
- production branch 案が整理されている
- production include / exclude 方針が整理されている
- Pages 復旧方針が整理されている
- release 手順案が整理されている
- Level 4 承認境界が明確
- 003H 系を継続しない方針が明確
- 後続タスクが整理されている

## 18. 今回やらないこと

- production branch 作成
- staging branch 作成
- Pages 復旧
- Pages source 切替
- GitHub Pages 再有効化
- main 切替
- default branch 変更
- branch protection 変更
- Git 履歴改変
- force push
- repo 移行
- release / deploy / publish
- clean branch 削除
- 対象 JSON 削除
- 旧 E2E spec 削除
- CI 設定変更
- shogi_v4.html 変更
