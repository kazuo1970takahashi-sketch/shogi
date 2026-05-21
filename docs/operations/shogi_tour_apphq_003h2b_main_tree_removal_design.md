# SHOGI-TOUR-APPHQ-003H-2-B｜main tree撤去方式 詳細設計

## 1. 目的

SHOGI-TOUR-APPHQ-003H-2-B は、003H-2-A で GitHub Pages を一時停止した後に、**main tree / repository checkout 上から実データ確定 JSON を安全に撤去するための方式を詳細設計** する文書である。

本文書では以下を整理する。

- 現状整理（Pages 遮断済 / main tree 残存）
- なぜ通常削除 PR が不可なのか
- Pages 遮断後も main tree 撤去が必要な理由
- main tree 撤去方式の候補
- PR diff 露出を避けるための原則
- 推奨方式
- 003H-2-C の実行候補
- 実行前 precondition
- rollback 方針
- GitHub Pages 復旧との関係
- Git 履歴対応との関係
- 後続タスク
- Done 条件
- Risk Level
- Approval Phrase / 承認境界

本文書は **docs-only** であり、以下は今回行わない。

- 対象 JSON 削除 / 変更 / 移動 / 本文表示 / 構造確認
- 旧 E2E spec 表示 / 変更 / 削除 / rename / move / skip
- synthetic 専用 E2E / fixture / `shogi_v4.html` / CI 設定の変更
- GitHub Pages 再有効化 / 設定変更
- HTTP GET / response body 取得 / screenshot / browser 表示
- orphan branch / clean tree 作成
- repo 移行
- Git 履歴改変 / force push
- 過去 No Go PR の diff 本文表示
- 実データ由来に見える旧期待値・具体値の再掲

## 2. 現状整理

- **003G-1**：GitHub Pages 公開影響 **C 判定**（target HEAD 200 / `application/json` / edge cache HIT）。
- **003H-2-A**：GitHub Pages を **一時停止** し、origin / edge cache とも 404 を確認済（PR #182 由来の CI 限定後の状態を継承）。
- **Pages 経由の現時点の公開経路は遮断済**。
- ただし以下は **残存**:
  - `main` tree 上の対象 JSON（`data/import/20260412_participants.json`）
  - Git 履歴上の対象 JSON
  - 旧 E2E spec（`test/e2e/shogi_phase2_import.spec.js`）
- CI 上の E2E 実行対象は PR #182 で synthetic 専用 E2E に限定済み。
- 次に必要なのは、**main tree / repository checkout 上から危険資産を消すこと**。

## 3. なぜ通常削除 PR が不可なのか

- 通常削除 PR では、**GitHub PR diff に削除対象ファイル本文が表示される可能性** がある（Files changed タブ / 個別 commit ビュー / 通知メール / GitHub API 経由）。
- **PR #169** で通常削除 PR は **No Go** となった（diff 本文露出リスク）。
- 通常置換 PR や空ファイル化 PR も、**置換 diff で旧本文が表示される可能性** があるため不可。
- 旧 E2E spec の通常編集・削除も同じ理由で不可（PR #174 経緯）。
- したがって、main tree 撤去は **通常 PR の削除 diff に依存しない方式** を使う必要がある。

> 注: PR #169 / PR #174 の具体 diff 本文は本文書に **再掲しない**。経緯は抽象表現に留める。

## 4. Pages 遮断後も main tree 撤去が必要な理由

- Pages 遮断は **公開経路の遮断** のみ。
- main tree に対象 JSON が残っている限り：
  - `git clone` した checkout 上に対象 JSON が **そのまま存在**。
  - collaborator / fork / 外部 mirror に **拡散し続ける**。
  - Pages 復旧時に再度 `source: main:/` で公開された場合、**再度公開状態に戻る**。
  - 検索エンジンが repository を index する場合、**ファイル一覧経由で露出**しうる。
- よって、main tree 撤去は **Pages 遮断の延長線として必須**。

## 5. main tree 撤去方式の候補

| 案 | 内容 | 評価 | メリット | デメリット |
|---|---|---|---|---|
| **A** | 通常削除 PR で対象 JSON を削除 | **不可** | （該当なし） | 削除 diff に本文が表示される可能性。PR #169 経緯 |
| **B** | 通常置換 PR / 空ファイル化 PR | **不可** | （該当なし） | 置換 diff で旧本文が表示される可能性 |
| **C** | `git rm --cached` / `.gitignore` 追加 PR | **不可** | （該当なし） | 通常 PR diff 上は削除扱いになり、本文露出リスク |
| **D** | **orphan branch で clean tree を構築し、新 main 候補にする** | **有力候補 / Level 4** | 対象 JSON を含まない tree を新規に構築できる。include list 方式で危険資産に触れずに済む | main 切替・branch 保護・PR 履歴・CI・ローカル clone・GitHub Pages 復旧に影響。設計と承認が必要 |
| **E** | 新規 clean repo へ移行 | **有力 / 最重級 / Level 4** | 履歴ごと切り離せる | URL / Issues / PR / Actions / collaborators / Pages / ローカル clone への影響が最大 |
| **F** | filter-repo / history rewrite で対象ファイルを履歴から削除 | **Level 4 / 003E 側** | Git 履歴対応になる | force push 必須 / collaborator clone 破壊 / main tree 撤去とは順序設計が必要。**単独では Pages 復旧設計にならない** |
| **G** | GitHub Web UI で削除して PR | **不可** | （該当なし） | 通常削除 PR と同様に diff 露出リスク |
| **H** | Pages 停止のまま運用停止 | 暫定遮断策 | 公開経路は止まる | main tree には残り続ける。根本撤去ではない |

## 6. PR diff 露出を避けるための原則（orphan branch / clean tree 方式の設計原則）

orphan branch / clean tree を構築する際の **必須原則**:

- **危険資産を含む既存 tree から通常 diff を作らない**（GitHub の PR Files タブ表示仕様に依存しない設計にする）。
- 新しい tree は **安全確認済みファイルを明示的にコピーまたは再構成** する（include list 方式）。
- **対象 JSON はコピー対象に含めない**。
- **旧 E2E spec もコピー対象に含めない**。
- synthetic 専用 E2E / fixture / app 本体 / docs / workflow は **必要性を判断して含める**。
- コピー元ファイルの **内容確認は安全資産に限定** する。
- **危険資産の中身確認は禁止**（ls / git log / git ls-files / git ls-tree の構造系コマンドのみ許可、`cat` / `head` / `git show` での本文表示は禁止）。
- 新 tree の PR diff にも危険資産本文が出ないよう、**通常比較 PR ではなく、必要に応じて branch 切替 / repo 移行 / orphan 運用** を検討する。
- GitHub 上の **PR 表示仕様に依存しない**（GitHub が "large diff" 等で折り畳んでも露出を防げないため、構造的に diff に出さない）。

## 7. 推奨方式

### 7.1 短期推奨

- **Pages は停止したまま維持** する。
- main tree 撤去は **通常削除 PR では行わない**。
- 003H-2-C で **orphan branch / clean tree 構築方式（案 D）を第一候補** として検討する。
- clean tree は **危険資産を含まない include list** から作る。
- **対象 JSON 本文を読まない**。
- **旧 E2E spec 本文を読まない**。
- **PR diff に本文を出さない**。

### 7.2 中期推奨

- **clean tree を新 main 候補にするか、新 repo 移行（案 E）にするか** を人間承認で決める。
- **GitHub Pages 復旧** は、危険資産を含まない公開元ができてから **別承認** で行う（003G-2 → 003G-3）。
- **Git 履歴対応（案 F）は 003E で別判断**。

### 7.3 不可

- 通常削除 PR
- 通常置換 PR
- `git rm --cached` PR
- 旧 E2E spec の通常編集・削除
- Pages 再有効化（clean tree が確認されるまで）

## 8. 003H-2-C の実行候補

003H-2-C では、以下のいずれかを実行候補とする。

### 8.1 候補1：orphan clean branch 作成のみ

- 危険資産を含まない branch を作成。
- main はまだ切り替えない。
- PR は作らない、または PR を作る場合も **diff 露出を評価してから**。
- Pages は停止したまま。

### 8.2 候補2：orphan clean branch + GitHub Pages 公開元準備

- 危険資産を含まない公開 tree を作る。
- **Pages 再有効化はまだしない**。
- 復旧前検査を行う（003G-2 として別承認）。

### 8.3 候補3：clean repo 移行の準備

- 新 repo 候補の構成を設計。
- **まだ作成しない**。
- URL / collaborator / Actions / Pages 影響を整理。

### 8.4 推奨

**まずは候補 1**（orphan clean branch 作成のみ）を検討。ただし、branch 作成も **Level 4 候補** なので別承認。

## 9. 実行前 precondition

003H-2-C 実行前には最低限以下を確認する。

- **Pages が停止済み** であること（003H-2-A 報告で確認済 / 本タスクでは再確認しない方針）。
- 対象パスが Pages 経由で **404** であること（003H-2-A で確認済）。
- **main HEAD が最新** であること。
- **working tree が clean** であること。
- **対象 JSON 本文を表示しない** こと。
- 対象 JSON の **構造・値・件数・unique values を確認しない** こと。
- **旧 E2E spec 本文を表示しない** こと。
- **PR #169 / PR #174 diff 本文を表示しない** こと。
- どのファイルを clean tree に含めるかの **include list** があること。
- **rollback 方針** があること。
- **Level 4 承認** があること。

## 10. rollback 方針

- **docs-only 設計**は revert 可能（実害低）。
- **orphan branch 作成のみ** なら branch 削除で rollback 可能。
- **main 切替** は rollback が重い（既存 main の history 参照が壊れる）。
- **repo 移行** は rollback が極めて重い。
- **Pages 再有効化** は危険資産なし tree が確認されるまで行わない。
- **rollback 時も対象 JSON 本文を表示しない**。
- **rollback 不能に近い方式は採らない**。例外時は人間承認で明文化する（003H §8.1 と整合）。

## 11. GitHub Pages 復旧との関係

- Pages は **現在停止済み**（003H-2-A）。
- **Pages 復旧は本タスクでは扱わない**。
- 復旧には **危険資産を含まない公開 tree** が必要。
- 復旧前に **HEAD / metadata 限定で安全確認**（003G-2 として別承認）。
- 復旧後も対象パスが **404 であることを HEAD 限定で確認** する（003G-3 として別承認）。
- **Pages 復旧は別承認**。

## 12. Git 履歴対応との関係

- main tree 撤去と Git 履歴対応は **別問題**。
- orphan clean branch / clean repo 移行は **履歴対応にもつながる可能性** がある（新しい履歴起点から始まるため）。
- filter-repo / force push は **003E 側で判断**。
- 履歴対応は collaborator clone / PR / tag / Actions / Pages への **影響が大きいため Level 4**。
- main tree 撤去後も **履歴対応要否は残る**。

## 13. 後続タスク候補

- **SHOGI-TOUR-APPHQ-003H-2-C**：orphan clean branch 作成方式の実行設計（方式絞り込み）
- **SHOGI-TOUR-APPHQ-003H-2-D**：orphan clean branch 作成
- **SHOGI-TOUR-APPHQ-003H-2-E**：main 切替 / repo 移行判断
- **SHOGI-TOUR-APPHQ-003G-2**：Pages 復旧前確認
- **SHOGI-TOUR-APPHQ-003G-3**：Pages 復旧
- **SHOGI-TOUR-APPHQ-003E**：Git 履歴対応要否判断

## 14. Done 条件

### 14.1 003H-2-B の Done（本文書の Done）

- main tree 撤去方式候補が **整理されている**
- **通常削除 PR 不可** が再確認されている
- **orphan clean branch 方式の設計原則** が整理されている
- **Pages 復旧と Git 履歴対応との関係** が整理されている
- **003H-2-C の入口条件** が明確

### 14.2 003H-2-C の予定 Done

- **実行方式が 1 つに絞られている**
- **include list 方針** がある
- **rollback 方針** がある
- **Level 4 承認文が用意できる**
- まだ削除・履歴改変は行わない

## 15. Risk Level

| 作業 | Risk Level |
|---|---|
| 本設計作成（本 PR） | docs-only だが実データ撤去方式に関わるため **Level 3 相当** |
| orphan clean branch 作成 | **Level 4 候補** |
| main 切替 | **Level 4** |
| Pages 復旧 | Level 4 候補 |
| clean repo 移行 | **Level 4** |
| filter-repo / force push | **Level 4** |

## 16. Approval Phrase / 承認境界

- 本設計作成は docs-only だが **Level 3 相当**。
- **orphan branch 作成** は別承認。
- **main 切替** は別承認。
- **repo 移行** は別承認。
- **Pages 復旧** は別承認。
- **Git 履歴改変** は別承認。
- **標準 Ready / merge 承認では Level 4 操作は解除されない**。
- **解除対象 / PR 番号または操作対象 / 実行範囲の明示が必要**。
- Level 4 個別承認には、**事前 rollback 手順・影響範囲・通知先** の明記を求める（003H §8.1 / 003G §10 と整合）。

## 17. 今回やらないこと

- 対象 JSON 削除
- 対象 JSON 変更
- 対象 JSON 移動
- 対象 JSON 本文表示
- 対象 JSON 構造確認（値 / 件数 / unique values / sample rows）
- 旧 E2E spec 本文表示
- 旧 E2E spec 変更 / 削除 / rename / move / skip
- orphan branch 作成
- clean tree 作成
- main 切替
- repo 移行
- Git 履歴改変
- force push
- Pages 再有効化
- Pages 設定変更
- HTTP GET / HEAD / response body 取得
- screenshot 取得
- browser 表示
- CI 設定変更
- `shogi_v4.html` 変更
- release / deploy / publish
