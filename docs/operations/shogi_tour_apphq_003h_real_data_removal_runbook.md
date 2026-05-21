# SHOGI-TOUR-APPHQ-003H｜実データ撤去実行Runbook

## 1. 目的

SHOGI-TOUR-APPHQ-003H は、main に残存している実データ確定 JSON (`data/import/20260412_participants.json`) を、**GitHub PR diff 上に本文を露出させずに撤去するための実行 Runbook** である。

本文書では以下を整理する。

- なぜ通常削除 PR が不可なのか
- 短期撤去と履歴対応の切り分け
- diff-safe 撤去方式の候補
- 実行前 precondition
- 実行時禁止事項
- rollback 方針
- GitHub Pages / 公開済み影響確認との関係
- Git 履歴対応との関係
- 後続タスク
- Risk Level
- Approval Phrase / 承認境界

本文書は **docs-only** であり、以下は今回行わない。

- 対象 JSON の削除 / 置換 / 本文表示 / 構造確認
- 旧 E2E spec の表示 / 変更 / 削除
- synthetic 専用 E2E / fixture / `shogi_v4.html` / CI 設定の変更
- GitHub Pages 確認 / 設定変更
- Git 履歴改変 / force push
- clean tree / orphan branch 作成 / repo 移行
- 過去 No Go PR の diff 本文表示
- 実データ由来に見える旧期待値・具体値の再掲

## 2. なぜ通常削除 PR が不可なのか

- 対象 JSON を通常 PR で削除すると、**GitHub PR diff 上で削除本文が表示される可能性が高い**（Files changed タブ・個別 commit ビュー・通知メール・GitHub API レスポンスのいずれにも出る経路がある）。
- これは「実値・JSON 本文を表示しない」という安全条件（003Z / 003D-4D 系で共通）に反する。
- 既に **PR #169** で通常削除 PR は **No Go** となった（diff 本文表示リスクが確認された）。
- **旧 E2E spec の通常編集・削除** も、PR #174 試行で同様に本文 diff 露出リスクが確認され No Go となった。
- したがって、対象 JSON 撤去は **通常削除 PR ではなく diff-safe 方式** で設計・実行する必要がある。

> 注: PR #169 / PR #174 の具体 diff 本文・コメント本文は本文書に **再掲しない**。経緯は抽象表現に留める。

## 3. 短期撤去と履歴対応の切り分け

### 3.1 短期撤去（003H スコープ）

- 現行 main / 公開 tree / CI 実行対象から **危険資産を取り除くこと**。
- 対象 JSON が **通常の repository checkout / 公開経路に出ない状態** を作ること。
- **PR diff で本文を出さない** ことを優先する。
- 本 Runbook が扱うのはこの短期撤去の方式選定・実行までの設計。

### 3.2 履歴対応（003E スコープ）

- 過去 commit に残った対象 JSON や旧 E2E spec の扱いを判断すること。
- filter-repo / history rewrite / force push / branch 再作成 / clean tree / orphan branch / repo 移行 等が関係する。
- **Level 4 相当**。
- **003E で別途判断** する。

### 3.3 重要

- 003H では **短期撤去 Runbook** を作る。
- **Git 履歴改変は行わない**。
- 現行 tree からの撤去と、Git 履歴からの除去は **別問題** として扱う。

## 4. diff-safe 撤去方式の候補

| 案 | 内容 | 評価 | メリット | デメリット |
|---|---|---|---|---|
| **A** | 通常削除 PR で対象 JSON を削除 | **不可** | （該当なし） | 削除 diff に本文が表示される可能性。PR #169 で No Go 済 |
| **B** | Git LFS pointer 化で実体を repo 外へ | 原則不可 / 要慎重 | （該当なし） | 履歴・実体・LFS 運用の複雑性増。本文露出リスクが残る可能性 |
| **C** | clean tree / orphan branch による再構成 | **Level 4 候補** | 危険資産を含まない tree を新たに作れる可能性 | GitHub Pages / branch / history / CI / clone / PR 履歴への影響大 |
| **D** | GitHub Pages 公開元を危険資産を含まない branch へ切替 | **Level 4 候補（公開遮断策）** | 公開 tree からの遮断に有効な可能性 | repository 本体・main checkout には残る。Pages 設定変更を伴う。**現行 tree 撤去の Done を単独では満たさない** |
| **E** | repo を新規 clean repo へ移行 | **Level 4 候補** | 履歴ごと危険資産を切り離せる | URL / Issues / PR / Actions / Pages / clone 先 / 運用影響が大きい |
| **F** | 危険資産を通常 PR で空ファイルに置換 | **不可** | （該当なし） | 置換 diff で旧本文が表示される可能性 |
| **G** | GitHub Web UI 上で対象ファイルを削除して PR を作る | **不可** | （該当なし） | 通常削除 PR と同じく diff 表示リスク |
| **H** | GitHub support / repository visibility / private 運用で短期遮断 | 補助策 | 外部公開リスクを下げられる可能性 | tree からの撤去ではない。根本対応ではない |

## 5. 推奨方針

### 5.1 短期推奨

- まずは **公開系・CI 系の危険実行経路が遮断済み** であることを確認する（003D-4E-1 で CI E2E 実行対象は synthetic 専用 E2E に限定済み、PR #182 で main 反映済）。
- その上で、対象 JSON 撤去は **通常 PR では行わない**。
- Level 4 候補（C: clean tree / orphan branch、D: Pages 切替、E: repo 移行）のうち、**影響範囲を比較してから決める**。
- 003H-1 では、実行方式を 1 つに決める前に **影響範囲を確認する読み取り専用タスク** を挟む。

### 5.2 中期推奨

- **003G**：GitHub Pages 公開済み影響を **HEAD / メタ情報限定** で確認。
- **003E**：Git 履歴対応要否を判断（Level 4 承認の要否含む）。
- **003H-1**：撤去方式を確定（影響比較済の結果に基づく）。
- **003H-2**：選定方式に従って撤去を実行（Level 4 個別承認）。
- 必要なら **003D-4E-2 / 003D-4F-2** で safe-side widening / validator 内部追加分離。

### 5.3 不可

- 通常削除 PR
- 通常置換 PR
- 旧 E2E spec の通常削除・通常編集
- PR diff に本文が出る方式（案 A / B / F / G）

### 5.4 案 D の位置づけ（公開遮断 ≠ 現行 tree 撤去）

- **案 D は公開 tree からの遮断策** であり、**repository 本体または main checkout から危険資産を撤去する方式ではない**。
- **案 D 単独では現行 tree 撤去の Done 条件（§13.3）を満たさない**。
- 案 D を採用する場合でも、**現行 tree 撤去には clean tree / orphan branch / repo 移行（案 C / E）など別方式を併用または別途選定** する必要がある。
- 003H-2 の Done では **「現行 tree」と「公開 tree」を分けて確認** する（§13.3 参照）。

## 6. 実行前 precondition

003H（および 003H-1 / 003H-2）実行前には最低限以下を確認する。

- **CI 上の旧 E2E 実行リスクが遮断済み** であること（003D-4E-1 / PR #182 で safe-side narrowing 済）。
- **synthetic 専用 E2E が CI 上で pass** していること。
- 対象 JSON が main に残存していることは **存在確認のみで把握** し、**内容は表示しない** こと。
- 旧 E2E spec が main に残存していることは **存在確認のみで把握** し、**本文は表示しない** こと。
- 対象 JSON / 旧 E2E spec の **通常 PR 削除は不可と判断済み** であること（PR #169 / #174 経緯）。
- **GitHub Pages 公開元 / branch / workflow / artifact** の確認方針が定まっていること（003G で取り扱い）。
- Level 4 候補を扱う場合は、**通常 Approval Phrase ではなく専用承認** が必要であること。

## 7. 実行時禁止事項

- 対象 JSON 本文を表示しない。
- 対象 JSON の **値・件数・unique values・統計値・sample rows** を確認しない。
- 旧 E2E spec 本文を表示しない。
- **PR #169 / PR #174 diff 本文を表示しない**。
- 通常削除 PR を作らない。
- 通常置換 PR を作らない。
- **GitHub Pages 設定を無承認で変更しない**。
- **force push しない**。
- **history rewrite しない**。
- **branch / repo / Pages の破壊的変更** を標準承認で行わない。
- **rollback 不能な操作** をしない。

## 8. rollback 方針

- **docs-only / CI-only の変更** は revert PR で rollback 可能（実害低）。
- **clean tree / orphan branch / repo 移行 / Pages 設定変更** は rollback が複雑（実害高）。
- Level 4 操作では、**事前に rollback 手順を明文化** する（個別承認時に必須）。
- **rollback 時にも対象 JSON 本文を表示しない**（rollback 経路でも安全条件は同じ）。
- rollback 用 branch / tag / backup の扱いは、**人間承認のもとで** 行う。
- **force push を含む場合** は、影響範囲・復旧方法・通知先を **事前に明記** する。

### 8.1 rollback 不能に近い方式の扱い

- **rollback 不能、または rollback が極めて困難な方式は原則採用しない**。
- 例外的に採用する場合は、**実行前に人間承認で例外化** し、以下を **明文化** する。
  - 影響範囲（branch / PR / clone / Pages / Actions / collaborators / 外部 URL 等）
  - 復旧不能リスクの具体内容
  - 代替策（より rollback 可能な方式が本当に取れないかの検討結果）
  - 通知先（運用関係者・利用者・上流リポジトリ等）
- **「やってみて戻す」は不可**。事前に rollback 経路を持たない実行は標準承認では解除できない。

## 9. GitHub Pages / 公開済み影響確認との関係

- **003G** で GitHub Pages 公開済み影響を確認する。
- 003G では **本文取得・保存・表示は禁止**。
- 確認は **HEAD / HTTP status / metadata / Pages source 設定** などに限定する。
- **対象 JSON URL や本文を直接取りに行かない**。
- **公開影響が強く疑われる場合** は、003G を 003H-1 より前倒ししてもよい。
- ただし、003G を **撤去遅延の理由にしない**（並行検討可）。

## 10. Git 履歴対応との関係

- **003E** で Git 履歴対応要否を判断する。
- **履歴改変は Level 4**。
- **force push / filter-repo / orphan branch / clean repo / repo 移行** は通常承認では不可。
- main の現行 tree から危険資産を消すことと、Git 履歴から消すことは **別問題**。
- 履歴対応をする場合は、**既存 branch / PR / tag / clone / GitHub Pages / Actions / collaborators** への影響確認が必要。

## 11. 後続タスク候補

- **SHOGI-TOUR-APPHQ-003G**：GitHub Pages 公開済み影響確認
- **SHOGI-TOUR-APPHQ-003E**：Git 履歴対応要否判断
- **SHOGI-TOUR-APPHQ-003H-1**：実データ撤去方式選定
- **SHOGI-TOUR-APPHQ-003H-2**：選定方式に基づく撤去実行
- **SHOGI-TOUR-APPHQ-003D-4E-2**：safe-side widening / safe project 拡張
- **SHOGI-TOUR-APPHQ-003D-4F-2**：必要な場合の validator 内部追加分離

## 12. 推奨実施順

標準順：

1. **003G**：GitHub Pages 公開済み影響確認
2. **003E**：Git 履歴対応要否判断
3. **003H-1**：撤去方式選定
4. **003H-2**：撤去実行
5. **003D-4E-2**：safe-side widening
6. 必要に応じて **003D-4F-2**

ただし：

- **公開影響が強く疑われる場合は 003G を最優先** する。
- **履歴対応と現行 tree 撤去は分けて判断** する（003E と 003H は別軸）。
- **safe-side widening は、危険資産撤去後または撤去方式確定後** に行う（撤去前に CI 回帰を広げると遮断が崩れるリスク）。

## 13. Done 条件

### 13.1 003H の Done（本文書の Done）

- 実データ撤去の **実行候補** が整理されている
- **通常削除 PR 不可** が明確
- 短期撤去と履歴対応の **切り分け** が明確
- **GitHub Pages / Git 履歴 / rollback / Level 4 承認境界** が明確
- **003H-1 の入口条件** が明確

### 13.2 003H-1 の予定 Done

- どの方式で撤去するかを **選定できる** 状態に達している
- **方式別の影響範囲** が明確
- **rollback 手順の有無** が明確
- **Level 4 承認が必要な場合、その理由が明確**

#### 13.2.1 003H-1 方式選定の必須比較軸

003H-1 では、各候補方式を以下の軸で比較し、**公開遮断と現行 tree 撤去を混同しない** こと。

| 比較軸 | 内容 |
|---|---|
| repository checkout から危険資産が消えるか | `git clone` 後の作業 tree から消えるか |
| main tree から危険資産が消えるか | `origin/main` の tree から消えるか |
| GitHub Pages 公開 tree から危険資産が消えるか | Pages 経由で配信される tree から消えるか |
| Git 履歴に危険資産が残るか | 過去 commit 群に残るか |
| PR diff / PR コメント / CI ログに本文が出ないか | diff-safe 性 |
| rollback 可能か | 不能・極めて困難・可能の 3 段階 |
| Level 4 承認が必要か | 標準 Approval Phrase で解除可能か |

> 注: 同じ案でも上記の軸ごとに評価が分かれることがある（例: 案 D は「Pages 公開 tree から消える」が、「repository checkout / main tree から消える」では満たさない）。**単一の総合評価で代替しない**。

### 13.3 003H-2 の予定 Done

- 選定方式に従って **危険資産が現行 tree / 公開 tree から撤去** される
  - **現行 tree（repository checkout / main tree）と公開 tree（GitHub Pages 配信 tree）を分けて確認** する。
  - 案 D（Pages 切替）単独採用時は現行 tree 側は別方式で別途満たす必要がある。
- **PR diff / コメント / ログに本文が露出しない**
- **rollback 方法** が確認済み
- **CI が safe-side で pass** する

## 14. Risk Level

| 作業 | Risk Level |
|---|---|
| 本 Runbook 作成（本 PR） | docs-only だが実データ撤去に関わるため **Level 3 相当** |
| 実データ撤去方式選定（003H-1） | Level 3〜4 |
| 通常削除 PR | **不可** |
| clean tree / orphan branch（案 C） | **Level 4** |
| GitHub Pages 設定変更（案 D） | Level 4 候補 |
| repo 移行（案 E） | **Level 4** |
| Git 履歴改変 / force push（003E 実装） | **Level 4** |
| GitHub support / visibility 変更（案 H） | Level 3〜4 |

## 15. Approval Phrase / 承認境界

- 本 Runbook 作成は docs-only だが **Level 3 相当**。
- **003H-1 方式選定** は別 PR・別承認。
- **003H-2 撤去実行** は別 PR・別承認。
- **Level 4 候補** は標準 Approval Phrase では **解除不可**。
- 通常 Ready 化 / merge 承認は、**履歴改変・force push・Pages 設定変更・repo 移行を許可しない**。
- **対象 JSON 削除・履歴対応・Pages 設定変更** は、それぞれ **解除対象・PR 番号・実行範囲を明示した個別承認** が必要。
- Level 4 個別承認には、**事前 rollback 手順・影響範囲・通知先** の明記を求める。

## 16. 今回やらないこと

- 対象 JSON 削除
- 対象 JSON 置換
- 対象 JSON 本文表示
- 対象 JSON 構造確認（値 / 件数 / unique values / sample rows / 統計値）
- 旧 E2E spec 本文表示
- 旧 E2E spec 変更
- 旧 E2E spec 削除
- PR #169 / PR #174 diff 表示
- GitHub Pages 確認
- GitHub Pages 設定変更
- Git 履歴改変
- force push
- clean tree / orphan branch 作成
- repo 移行
- CI 設定変更
- `shogi_v4.html` 変更
- release / deploy / publish
