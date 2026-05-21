# SHOGI-TOUR-APPHQ-003H-2-C｜orphan clean branch 作成方式 実行設計

## 1. 目的

SHOGI-TOUR-APPHQ-003H-2-C は、003H-2-B で整理した main tree 撤去方式の詳細設計を受け、**orphan clean branch を実際に作成する前に、include list / denylist / path 確認 / rollback / 承認境界を明確化** するための実行設計文書である。

本文書では以下を整理する。

- 現状整理
- orphan clean branch 作成の目的
- 今回まだ実行しないこと
- include list の方針
- denylist の方針
- path 確認方法
- 本文を読まない安全確認方法
- 003H-2-D の実行範囲
- 003H-2-E の検証範囲
- main 切替・Pages 復旧・Git 履歴対応との境界
- rollback 方針
- Risk Level
- Approval Phrase / 承認境界
- Done 条件

本文書は **docs-only** であり、以下は今回行わない。

- orphan branch 作成 / clean tree 作成
- main 切替 / Pages 復旧 / Pages 設定変更
- repo 移行
- Git 履歴改変 / force push
- 対象 JSON 削除 / 変更 / 移動 / 本文表示 / 構造確認
- 旧 E2E spec 表示 / 変更 / 削除 / rename / move / skip
- HTTP GET / HEAD / response body 取得 / screenshot / browser 表示
- CI 設定変更 / `shogi_v4.html` 変更
- 過去 No Go PR の diff 本文表示
- 実データ由来に見える旧期待値・具体値の再掲

## 2. 現状整理

- **GitHub Pages**：停止済み（003H-2-A）
- **Pages 経由の対象パス**：003H-2-A で 404 確認済
- **main tree 上の対象 JSON**：残存
- **旧 E2E spec**：残存（`test/e2e/shogi_phase2_import.spec.js`）
- **Git 履歴上の危険資産**：残存（003E 別軸）
- **CI E2E 対象**：synthetic 専用 E2E に限定済み（003D-4E-1 / PR #182）
- **対象 JSON の通常削除 PR**：不可（PR #169 / #174 経緯）
- **旧 E2E spec の通常編集・削除**：不可
- **orphan clean branch / clean tree**：未作成
- **main 切替**：未実施
- **Pages 復旧**：未実施

次は、**危険資産を含まない clean tree を作る準備段階**（path 設計のみ、実構築は 003H-2-D 別承認）。

## 3. orphan clean branch の目的

- **危険資産を含まない tree を新規に作成** する。
- **通常削除 PR の diff に対象 JSON 本文を出さない**。
- **旧 E2E spec の通常編集・削除 diff を出さない**。
- **main 切替や Pages 復旧の前に、安全な候補 tree を作る**。
- **Git 履歴対応とは別問題** として扱う（003E スコープ）。

## 4. 今回まだ実行しないこと

- orphan branch 作成
- clean tree 作成
- main 切替
- Pages 復旧
- Pages source 切替
- Git 履歴改変
- force push
- repo 移行
- 対象 JSON 削除 / 移動
- 旧 E2E spec 削除 / rename / move
- 通常 PR 作成
- browser / screenshot / body 取得
- HTTP GET / HEAD

## 5. include list 方針

**include list は「安全そうなものを全部コピーする一覧」ではなく、「clean tree に本当に必要な最小構成」を定義する**（003H-2-B §6.1 と整合）。

### 5.1 原則

- **最小構成から始める**。
- アプリ実行に必要なファイルを優先。
- synthetic 専用 E2E とその fixture は必要性を検討して含める。
- CI に必要な最小設定を含める。
- package / test runner に必要なファイルを含める。
- **不要な archive / generated / temp / logs / debug / old docs / backup / zip / binary / export / upload は含めない**。
- docs は原則最小限。事故対応 docs を公開 tree へ含める必要があるかは **別途判断**。
- **不確実なファイルは入れない側に倒す**。
- 後から **safe-side widening**（003D-4E-2 同方針）で追加する。

### 5.2 include 候補カテゴリ

| カテゴリ | 例（具体 path は 003H-2-D 実行前に確定） |
|---|---|
| app 本体 | `shogi_v4.html` |
| index / entrypoint | `index.html` |
| synthetic 専用 E2E | `test/e2e/shogi_phase2_import_synthetic.spec.js` |
| synthetic fixture | `test/fixtures/import/participants_synthetic_minimal.json` |
| test runner / package 設定 | `package.json` / `package-lock.json`（存在すれば）/ `playwright.config.js` |
| 安全な CI workflow | `.github/workflows/e2e.yml`（safe-side narrowing 反映済） |
| README など最小説明文書 | `README.md`（存在すれば）/ `HANDOFF.md`（必要性判断） |
| 必要最小の設計 docs | 003D-4D / 003D-4F / 003D-4E / 003H / 003G 系のうち運用継続に必須のもの |
| その他必須 | `test/run_tests.sh` / `test/` 配下の unit テスト関連 |

> 各カテゴリは **003H-2-D 実行前に具体 path 一覧化** する。具体 path 一覧は 003H-2-D の Level 4 承認文に含める。

### 5.3 含めるか別判断するカテゴリ

| カテゴリ | 判断ポイント |
|---|---|
| docs の一部 | 公開 tree に出すべきかどうか、事故対応記録としての扱い |
| `data/` 配下の非危険資産 | そもそも `data/` 配下を include に含めるか自体を判断（denylist と衝突するため最小化） |
| 旧 E2E 以外の E2E spec | 安全確認済みのもののみ。デフォルト exclude。safe-side widening で順次追加 |
| helper / test utility | 必要なものだけ |

## 6. denylist 方針

**denylist は、絶対に clean tree に入れてはいけない path / pattern / category を定義** する。

### 6.1 denylist 必須対象

| 対象 | 例 |
|---|---|
| **対象 JSON path** | `data/import/20260412_participants.json` |
| **旧 E2E spec path** | `test/e2e/shogi_phase2_import.spec.js` |
| `data/import` 配下の実データ由来・疑いファイル | `data/import/**` を原則 deny（必要時のみ個別 allow） |
| 実データ / 個人情報 / 住所 / 氏名 / 参加履歴 / 最終クラス / 最終対局日 を含む可能性のあるファイル | カテゴリ・拡張子・命名規則から推測 |
| backup / export / upload / archive | `*backup*` / `*export*` / `*upload*` / `*archive*` / `*.zip` |
| logs / screenshots / traces / reports / generated artifacts | `*.log` / `playwright-report/` / `test-results/` / `*.trace` / `*screenshot*` |
| 過去 No Go PR を再現し得る作業物 | PR #169 / PR #174 で問題化した path / artifact |
| raw / production / real / imported / participant list 系 | 命名規則ベース |
| 中身確認が必要になるバイナリ系 | `*.zip` / `*.pdf` / `*.csv` / `*.xlsx` / `*.docx` 等（中身を見ないと判断できない場合は deny） |

### 6.2 denylist 設計の注意

- denylist は **本文検索で作らない**。
- **本文を見ず、path / filename / extension / known risk category で設計** する。
- 不確実なものは **deny 側に倒す**（include と整合）。

## 7. path 確認方法

### 7.1 許可される確認

- `git ls-tree -r <ref> --name-only`
- `git ls-files`
- `find <path> -type f`
- path 一覧の grep（**path に対する** grep、本文 grep ではない）
- file path / extension / size 程度の metadata
- denylist hit / no hit の確認

### 7.2 禁止される確認

| 禁止 | 理由 |
|---|---|
| `cat` / `head` / `tail` / `less` | 本文表示 |
| `sed -n` / `awk` で本文表示 | 本文表示 |
| `git show <ref>:<path>` | 本文表示 |
| `git diff` での危険資産差分表示 | 本文表示 |
| `grep` での **本文** 検索（path に対する grep は可） | 本文表示 |
| `jq` で JSON 構造確認 | 構造から件数・分布等が推測される |
| `wc -l` 等で対象 JSON の行数確認 | 構造推測 |
| Python / Node で JSON parse | 構造推測 |
| OCR | 本文取得 |
| browser 表示 | 本文取得 |
| screenshot | 本文取得 |
| HTTP GET / HEAD（target URL） | 003G-1 で実施済の枠を超える |

## 8. clean tree 作成後の検証方針

003H-2-D で clean branch を作成した後、003H-2-E で以下を確認する。

- **include list に定義した path のみ含まれている** こと
- **denylist path が no hit** であること
- **対象 JSON path が存在しない** こと
- **旧 E2E spec path が存在しない** こと
- `data/import` 配下に危険資産が含まれないこと
- generated / logs / archive / backup / upload / trace / screenshot / report が含まれないこと
- **Unit test が動く** こと
- **synthetic 専用 E2E が動く** こと
- **Pages は停止されたまま** であること

確認結果は **path hit / no hit、test pass / fail のみで報告** する。本文・値・構造は報告しない。

## 9. 003H-2-D の実行範囲

003H-2-D は **orphan clean branch 作成のみ** を行う。

### 9.1 やること

- Level 4 承認に基づき **orphan branch を作成**（`git checkout --orphan` 等）。
- include list に基づき **安全資産のみを配置**。
- **denylist 対象を含めない**。
- commit を作成。
- **remote へ push するかどうかは承認で明示**（push しない / push する を Approval で固定）。
- **PR 作成は原則しない、または別承認**（PR 作成自体が diff 露出経路になりうる場合があるため）。

### 9.2 やらないこと

- main 切替
- Pages 復旧
- Git 履歴改変
- 対象 JSON 削除（直接削除はしない。orphan 経路で結果的に含まれないだけ）
- 旧 E2E spec 削除（同上）
- 通常 PR 作成
- Pages source 切替

## 10. 003H-2-E の検証範囲

003H-2-E は **clean branch 検証のみ** を行う。

### 10.1 やること

- branch 上の path 一覧確認（§7.1 の許可コマンドのみ）
- denylist no hit 確認（§6 / §8）
- Unit / synthetic E2E 実行
- CI 相当の最小検証
- Pages 停止維持確認

### 10.2 やらないこと

- main 切替
- Pages 復旧
- Git 履歴改変
- branch 削除
- repo 移行
- 対外公開

## 11. main 切替との境界

- **main 切替は 003H-2-F 以降**。
- clean branch 作成だけでは main は変わらない。
- main 切替は **Level 4**。
- branch protection / default branch / PR 履歴 / clone / CI / Pages への影響がある。
- main 切替前に **人間承認** が必要。

## 12. Pages 復旧との境界

- **Pages 復旧は 003G-2 / 003G-3 以降**。
- clean branch ができても、**すぐに Pages 復旧しない**。
- 復旧前に **denylist no hit / HEAD 404 想定確認** が必要。
- Pages source 切替 / Pages 再有効化は **Level 4 候補**。
- 復旧後も対象パスが **404 であることを HEAD 限定で確認** する。

## 13. Git 履歴対応との境界

- **Git 履歴対応は 003E**。
- orphan clean branch は **現行 tree の代替候補** であり、履歴問題の完全解決ではない（履歴は別 ref として残る）。
- filter-repo / force push は **別承認**。
- clean repo 移行も **別承認**。
- **履歴対応を main tree 撤去と混ぜない**。

## 14. rollback 方針

- **docs-only 設計**は revert 可能。
- **orphan branch 作成のみ** なら branch 削除で rollback 可能。
- clean branch commit は削除可能（remote push したら remote 側も別途削除）。
- **main 切替は rollback が重い**。
- **Pages 復旧は rollback 可能だが再公開リスクがある**（cache / edge / 検索 index の残存）。
- **rollback 時も本文取得禁止**。
- **rollback 不能に近い操作は別承認**（003H §8.1 と整合）。

## 15. Risk Level

| 作業 | Risk Level |
|---|---|
| 本設計作成（本 PR） | docs-only だが main tree 撤去前段に関わるため **Level 3 相当** |
| orphan branch 作成（003H-2-D） | **Level 4** |
| clean tree 構築 | **Level 4 候補** |
| remote へ push | **Level 4 候補**（push 範囲を承認で限定） |
| main 切替（003H-2-F 以降） | **Level 4** |
| Pages 復旧（003G-2 / 003G-3） | Level 4 候補 |
| repo 移行 | **Level 4** |
| Git 履歴改変（003E） | **Level 4** |

## 16. Approval Phrase / 承認境界

- 本設計 PR の Ready / merge では、**orphan branch 作成は許可されない**。
- **orphan branch 作成は 003H-2-D で別承認**。
- **clean branch 検証は 003H-2-E で別承認**。
- **main 切替は 003H-2-F 以降で別承認**。
- **Pages 復旧は 003G-2 / 003G-3 で別承認**。
- **Git 履歴対応は 003E で別承認**。
- **標準 Approval Phrase では Level 4 操作は解除不可**。
- 解除対象 / 操作対象 / 実行範囲を **明示** する。
- Level 4 個別承認には、**事前 rollback 手順・影響範囲・通知先** の明記を求める（003H §8.1 / 003G §10 と整合）。

## 17. Done 条件

### 17.1 003H-2-C の Done（本文書の Done）

- **include list 方針** が明確
- **denylist 方針** が明確
- **path 確認方法** が明確
- **本文を読まない確認方法** が明確
- **003H-2-D の実行範囲** が明確
- **003H-2-E の検証範囲** が明確
- **main 切替 / Pages 復旧 / Git 履歴対応との境界** が明確
- **Level 4 承認境界** が明確

### 17.2 003H-2-D の予定 Done

- orphan clean branch を **作成**
- include list に基づく **安全資産のみ配置**
- **denylist 対象を含めない**
- main 切替なし
- Pages 復旧なし

### 17.3 003H-2-E の予定 Done

- path 一覧確認
- **denylist no hit**
- Unit / synthetic E2E **pass**
- Pages 停止維持
- main 切替なし
- Pages 復旧なし

## 18. 今回やらないこと

- orphan branch 作成
- clean tree 作成
- main 切替
- Pages 復旧
- Pages 設定変更
- Git 履歴改変
- repo 移行
- 対象 JSON 削除 / 変更 / 移動 / 本文表示 / 構造確認
- 旧 E2E spec 削除 / 変更 / 本文表示 / rename / move / skip
- HTTP GET / HEAD
- response body 取得
- screenshot / browser 表示
- CI 設定変更
- `shogi_v4.html` 変更
- commit 以外の破壊的操作
- release / deploy / publish
