# SHOGI-TOUR｜Action Request branch 削除 trial（TOUR-OPS-ACTION-REQUEST-TRIAL-001）

**Task ID**: `TOUR-OPS-ACTION-REQUEST-TRIAL-001`
**作業種別**: docs-only / Action Request trial 設計 / branch 削除 trial 準備
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `926ef60`（PR #131 squash merge 後の main = TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT）
**位置づけ**: PR #131 で main 反映された軽量テンプレ集 §4.5 branch 削除 Action Request テンプレを、実際の残存 branch cleanup 題材で **試すための trial 設計**。**案 A**（1 AR / 1 branch）と **案 B**（1 AR / N branches）のどちらが SHOGI-TOUR 運用に適しているかを検証する。**本 PR では branch 削除を実行しない**。実行は後続の明示 Approval Phrase（`承認：PR <N1> #<N2> ... branch 削除`）受領後に別 AR として行う。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **前提となる main 反映済 PR**:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — ASYNC-AI-WORKFLOW-DESIGN（squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — ASYNC-AI-WORKFLOW-TRIAL-001（squash `44b49a9`）
  - PR [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) — REVIEW-REQUEST-TEMPLATE-DESIGN（squash `84f6724`）
  - PR [#125](https://github.com/kazuo1970takahashi-sketch/shogi/pull/125) — CLAUDE-CODE-REVIEWER-DESIGN（squash `20c0a71`）
  - PR [#126](https://github.com/kazuo1970takahashi-sketch/shogi/pull/126) — CLAUDE-CODE-REVIEWER-TRIAL-001（squash `f989514`）
  - PR [#127](https://github.com/kazuo1970takahashi-sketch/shogi/pull/127) — ACTION-REQUEST-DESIGN（squash `541feb2`）
  - PR [#128](https://github.com/kazuo1970takahashi-sketch/shogi/pull/128) — AI-TASK-CANDIDATE-DESIGN（squash `f15793a`）
  - PR [#129](https://github.com/kazuo1970takahashi-sketch/shogi/pull/129) — AI-TASK-CANDIDATE-TRIAL-001（squash `32a3ab2`）
  - PR [#130](https://github.com/kazuo1970takahashi-sketch/shogi/pull/130) — AI-WORKFLOW-V0-2-REVIEW（squash `ae11cd3`）
  - PR [#131](https://github.com/kazuo1970takahashi-sketch/shogi/pull/131) — ACTION-REQUEST-TEMPLATE-IMPL-LIGHT（squash `926ef60`）
- **非対象（本 PR では実施しない）**:
  - **branch 削除**（本 trial の題材だが、実行は別 AR + 別 Approval Phrase）
  - Ready 化 / merge / main 直接 push / release / deploy / publish
  - Candidate Adopt / Task 化 / 実装着手 / Candidate Registry 作成
  - template 強制化 / v0.2 本文作成
  - 既存 ops docs 10 件改訂
  - 実装 / テスト / snapshot / workflow / package 系の一切の変更
  - branch protection / token / secret / credential 操作
  - PR template / Issue template / label / `ai_work_queue.md` 作成
  - RESET-UX 後続実装
  - 後続タスク着手（本 trial 内では branch 削除 AR 設計に閉じる）

---

## 1. タスク概要

- PR #131 で main 反映された **軽量テンプレ集 §4.5 branch 削除 Action Request テンプレを実運用検証** する。
- **案 A**（1 AR / 1 branch）と **案 B**（1 AR / N branches）を比較し、SHOGI-TOUR 運用に適した方を選定する。
- **本 PR では branch 削除を実行しない**（設計 trial 文書の作成までで停止）。
- 実行は後続の **branch 削除 AR + 明示 Approval Phrase** 受領後に別セッション / 別 AR で行う。
- 本 trial は `TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT §4.5` の **初回実運用** であり、PR #127 自己実証以来の **6 回目の Action Request 適用** になる予定（本 PR の Review / Ready / merge とは別カウント）。

---

## 2. 背景

- PR #122〜#131 により AI 非同期運用 Phase 1 設計・trial + Phase 2 入口（軽量テンプレ集）が main に反映済み（main HEAD `926ef60`）。
- PR #127〜#131 の Ready / merge を経て、各 PR の **branch は削除されず remote / local に累積** している。
- これは「**branch 削除は常に別許可**」原則（PR #127 §4 / §6.2、PR #131 §10.2）を **5 連続遵守** した結果。
- 累積した branch を放置するか、まとめて削除するかは **運用判断**。
- 本 trial では、PR #131 軽量テンプレ集 §4.5 で案 A / 案 B を提示済みのテンプレを **実題材で検証** する好機。
- CAND-PR127-002（branch 削除を別 AR で扱う trial、PR #128 / #129 で Hold 維持）の **Adoption と兼ねる側面** がある。

---

## 3. 対象 branch 一覧

### 3.1 残存 branch 全体（remote 確認 2026-05-16）

`git branch -r | grep tour-ops` の出力より、現時点で remote に残存する `docs/tour-ops-*` branch は **10 件**：

| # | branch | 対応 PR | merge 状態 | main 反映 squash SHA |
| --- | --- | --- | --- | --- |
| 1 | `docs/tour-ops-async-ai-workflow-design` | #122 | MERGED | `ea71e15` |
| 2 | `docs/tour-ops-async-ai-workflow-trial-001` | #123 | MERGED | `44b49a9` |
| 3 | `docs/tour-ops-review-request-template-design` | #124 | MERGED | `84f6724` |
| 4 | `docs/tour-ops-claude-code-reviewer-design` | #125 | MERGED | `20c0a71` |
| 5 | `docs/tour-ops-claude-code-reviewer-trial-001` | #126 | MERGED | `f989514` |
| 6 | `docs/tour-ops-action-request-design` | #127 | MERGED | `541feb2` |
| 7 | `docs/tour-ops-ai-task-candidate-design` | #128 | MERGED | `f15793a` |
| 8 | `docs/tour-ops-ai-task-candidate-trial-001` | #129 | MERGED | `32a3ab2` |
| 9 | `docs/tour-ops-ai-workflow-v0-2-review` | #130 | MERGED | `ae11cd3` |
| 10 | `docs/tour-ops-action-request-template-impl-light` | #131 | MERGED | `926ef60` |

### 3.2 本 trial の対象範囲

本依頼で指定された **「PR #127 〜 PR #131 の 5 branch」** が trial 対象範囲。

ただし、**実際には PR #122〜#126 の 5 branch も残存** しており、合計 10 branch が累積している。これは本 trial 設計フェーズで surfaced する重要な事実。

#### Option X：依頼通り 5 branch（PR #127〜#131）のみ対象

- メリット：依頼の明示範囲を遵守、最小 scope
- デメリット：PR #122〜#126 の 5 branch がさらに残存し続ける、Phase 1 全体の cleanup にならない

#### Option Y：10 branch（PR #122〜#131）全部対象

- メリット：Phase 1 + Phase 2 入口の累積を一気に整理、main 反映済 PR の全 branch を片付け
- デメリット：依頼 scope を超える、より大きな AR になる

**本 trial 設計では Option X を基本（依頼遵守）としつつ、Option Y を「別 AR」または「追加判断」として併記する**。Approval Phrase 発行時に髙橋さんが選択可能とする。

### 3.3 対象 branch の安全性確認（共通条件）

各 branch は **削除前に以下を全件確認** する。

- 対応 PR が MERGED であること
- squash commit が main HEAD またはその祖先に含まれること
- 該当 branch を base にしている他 PR が存在しないこと（`gh pr list --base <branch>` で 0 件）
- 該当 branch HEAD（commit SHA）が squash で main に吸収済みであること
- branch protection が該当 branch に設定されていないこと
- ローカル作業中 / staged changes がないこと

---

## 4. branch 削除を trial 題材にする理由

1. **軽量 cleanup 操作**：実装影響なし、データ影響なし、設定影響なし
2. **削除操作だが復元可能**：remote branch 削除しても、main 上に squash commit が残るため復元は技術的に可能（reflog / squash SHA から再 push）
3. **PR #127 §4「branch 削除は常に別許可」原則の実題材**
4. **PR #131 §4.5 branch 削除 AR テンプレの初実証**
5. **CAND-PR127-002（Hold 中）の Adoption 候補**
6. **5 連続遵守された "branch 削除しない" 状態の解放** = Phase 2 入口完了の象徴
7. **案 A / 案 B の運用比較を実題材で行える**
8. **失敗時の影響が局所的**（branch 1 本 / N 本の単純削除）

逆に、本 trial は次のような重い操作の代理としては **使わない**：

- データ削除（DB row / file / blob）
- production config 変更
- secrets 変更
- main 直接 push
- release / deploy / publish

これらは Risk Level が大きく異なるため、別途 Phase 2 / Phase 3 の trial で扱う。

---

## 5. 案 A：1 AR / 1 branch

### 5.1 概要

1 つの Action Request で **1 branch のみ** を削除する。N branch あれば N 回の AR / Approval Phrase / 実行サイクルを回す。

### 5.2 メリット

- **最も安全**：対象 branch の取り違えが起きにくい
- **失敗時の切り分けが容易**：1 branch ずつ独立、失敗しても他に波及しない
- **承認文が短くても誤解しにくい**：`承認：PR #<N> branch 削除` 1 行で意図が明確
- **precondition の確認項目が少ない**：1 branch 分のみ
- **Approval Phrase / 実行 / Post-Execution Report のサイクルが単純**

### 5.3 デメリット

- **5 branch あると承認・実行が 5 回**：かなり冗長
- **コピペ負荷が増える**：5 AR + 5 Approval Phrase + 5 Post-Execution Report
- **同様 AR の繰り返しで疲労 / 注意低下リスク**
- **「branch 削除という小さな操作」に対するセッション数が肥大**

### 5.4 案 A の AR 雛形（PR #131 §4.5 案 A をベースに）

```
Action Request:
- ID: AR-BRANCH-DELETE-<branch-suffix>-001
- Target: branch <full branch name>（remote + local）
- Expected Branch HEAD: <SHA>
- Action: 該当 branch を remote / local から削除
- Reason:
  - 対応 PR #<N> が MERGED
  - squash commit <SHA> が main HEAD またはその祖先
  - 本 branch を base にしている他 PR なし
- Preconditions:
  - 対応 PR #<N> state: MERGED
  - branch HEAD が squash で main に吸収済み
  - 他 PR の base になっていない
  - branch protection 未設定
  - local 作業なし
- Allowed Scope: 該当 1 branch の remote / local 削除のみ
- Forbidden Actions:
  - main / 他 branch への操作
  - tag 削除
  - release / deploy / publish
  - 後続タスク着手
  - PR template / Issue template / label 操作
- Required Approval Phrase: 承認：PR #<N> branch 削除
- Execution Owner: Claude Code Implementer
- Report: 削除後の branch list / 副作用の有無 / main HEAD 不変確認
- Staleness Rule: main HEAD 進行時 / branch HEAD 変更時は再確認
```

---

## 6. 案 B：1 AR / N branches

### 6.1 概要

1 つの Action Request で **複数 branch を一括削除** する。本依頼では「PR #127〜#131 の 5 branch まとめて」が想定。

### 6.2 メリット

- **まとめて cleanup できる**：1 サイクルで N branch
- **PR #127〜#131 のように連続した merged branch 群には効率がよい**
- **完了報告も 1 回で済む**：Post-Execution Report が単一
- **「branch 削除という軽量操作」のセッション数を最小化**
- **コピペ負荷が削減される**

### 6.3 デメリット

- **対象列挙漏れ・混入リスク**：N branch のリスト確認が必須
- **承認文が曖昧だと危険**：`承認：branch 削除` だけでは無効
- **precondition 確認がやや重くなる**：N 件分の MERGED / squash / base / branch protection 確認
- **1 件失敗時の切り分けが複雑**：途中で停止した場合の状態管理
- **大量削除の影響**：誤って 10 件削除 vs 想定 5 件削除のような混乱の可能性

### 6.4 案 B の AR 雛形（PR #131 §4.5 案 B をベースに）

```
Action Request:
- ID: AR-BRANCH-DELETE-BATCH-001
- Target: 5 branch 一括（PR #127〜#131 由来）
- Branches:
  - docs/tour-ops-action-request-design（HEAD <SHA>、PR #127）
  - docs/tour-ops-ai-task-candidate-design（HEAD <SHA>、PR #128）
  - docs/tour-ops-ai-task-candidate-trial-001（HEAD <SHA>、PR #129）
  - docs/tour-ops-ai-workflow-v0-2-review（HEAD <SHA>、PR #130）
  - docs/tour-ops-action-request-template-impl-light（HEAD <SHA>、PR #131）
- Action: 列挙 5 branch を remote / local から一括削除
- Reason:
  - 各対応 PR が MERGED、squash commit が main 反映済
  - Phase 1 + Phase 2 入口の累積 branch cleanup
  - PR #131 §4.5 案 B の実運用検証
- Preconditions（各 branch につき確認）:
  - 対応 PR state: MERGED
  - branch HEAD が squash で main に吸収済み
  - 他 PR の base になっていない
  - branch protection 未設定
  - 各 branch HEAD SHA を一致確認
  - 削除対象外 branch が混入していないこと（main / PR #122〜#126 由来 5 branch / その他 active branch）
- Allowed Scope: 列挙 5 branch の remote / local 削除のみ
- Forbidden Actions:
  - main / 他 branch への操作
  - 列挙対象外 branch（PR #122〜#126 由来 5 branch を含む）への操作
  - tag 削除
  - release / deploy / publish
  - 後続タスク着手
  - PR template / Issue template / label 操作
- Required Approval Phrase: 承認：PR #127 #128 #129 #130 #131 branch 削除
- Execution Owner: Claude Code Implementer
- Report: 削除前後の branch list / 各 branch 削除結果 / 副作用の有無 / main HEAD 不変確認 / 削除対象外 branch（特に PR #122〜#126 由来）への無影響確認
- Staleness Rule: main HEAD 進行時 / 各 branch HEAD 変更時は再確認
```

---

## 7. 案 A と案 B の比較

| 観点 | 案 A（1 AR / 1 branch） | 案 B（1 AR / N branches） |
| --- | --- | --- |
| 安全性 | ★★★★★ | ★★★★ |
| 効率（5 branch のとき） | ★★ | ★★★★★ |
| コピペ負荷 | ★★ | ★★★★ |
| 失敗時の切り分け | ★★★★★ | ★★★ |
| 承認文の明瞭さ | ★★★★★（PR 単独指定） | ★★★★（PR 複数列挙、誤読リスク） |
| precondition 確認の重さ | ★★★★（軽い） | ★★（重い、N 件分） |
| 対象列挙漏れリスク | なし | あり |
| Post-Execution Report の数 | N 件（重い） | 1 件（軽い） |
| 「branch 削除は別許可」原則の遵守 | 完全 | 完全（同等） |
| SHOGI-TOUR 規模（5 branch）への適合 | 過剰丁寧 | 適度 |
| SHOGI-TOUR 規模（1〜2 branch）への適合 | 適度 | 過剰簡略化 |

---

## 8. 推奨案

### 8.1 本 trial の推奨

本 trial では **案 B「1 AR / 5 branches 一括削除」を候補にしつつ、以下の安全条件を満たす場合のみ実行可能** とする。

### 8.2 案 B 実行条件（必須）

1. **対象 branch 5 件をフルネームで明示**（プレフィックス省略不可、別 branch との混同防止）
2. **各 branch が対応 PR #127〜#131 に紐づくことを確認**
3. **各 PR が MERGED であることを確認**（`gh pr view <N> --json state`）
4. **各 PR の merge commit が main に含まれることを確認**（`git merge-base --is-ancestor <squash SHA> origin/main`）
5. **削除対象外 branch（特に PR #122〜#126 由来 5 branch）が混入していないことを確認**
6. **実行直前に `git branch -r | grep tour-ops` と `gh pr view` で状態を再確認**
7. **Approval Phrase に対象 branch 一覧 or 対象 PR 一覧が明示されていること**
   - 有効例：`承認：PR #127 #128 #129 #130 #131 branch 削除`
   - 無効例：`承認：branch 削除`、`承認：merged branch を整理`、`承認：5 branch 削除`（PR 番号曖昧）
8. **branch 削除以外の操作を禁止する**（main / 他 branch / tag / release / deploy / publish / 後続タスク着手 全て禁止）
9. **失敗時は途中停止し、削除済 / 未削除を報告**（途中まで成功した場合も Post-Execution Report で明示）
10. **`gh pr merge --delete-branch` は使わない**（branch 削除専用 AR で実行する原則維持）

### 8.3 案 A への切り替え条件

次のいずれかが発生した場合、案 A（1 AR / 1 branch）に切り替える：

- 5 branch のうち 1 つでも MERGED でない / base race / 他 PR が base にしている等の異常
- branch protection が設定されている branch がある
- 髙橋さんが「1 件ずつ削除したい」と明示
- 案 B 実行直前 precondition で 1 件でも崩れる

### 8.4 Option Y（10 branch 一括削除）の扱い

PR #122〜#126 の 5 branch も残存しているが、これは本 trial の **依頼明示範囲外**。Option Y を採用する場合は **本 trial とは別 AR**（例：`AR-BRANCH-DELETE-PHASE1-BATCH-001` 等）として髙橋さんが明示判断する。

---

## 9. 実行前 precondition（案 B 採用時、要件詳細）

実際の branch 削除 AR 実行直前に **全件確認**：

### 9.1 各 branch について

```bash
gh pr view <N> --json state,headRefOid,headRefName,baseRefName,mergeCommit
git merge-base --is-ancestor <squash SHA> origin/main
gh pr list --base <branch> --state open
git branch -r | grep <branch>
```

期待値：
- `state: MERGED`
- `headRefOid` が trial doc §3.1 / §6.4 と一致
- `headRefName` が削除対象と一致
- `baseRefName: main`
- `mergeCommit.oid` が squash SHA と一致
- `gh pr list --base <branch>` 結果が空（他 PR が base にしていない）
- `git branch -r` 結果に該当 branch が含まれる

### 9.2 main HEAD race 確認

```bash
git fetch origin main
git log origin/main --oneline -1
```

期待値：main HEAD が trial doc 作成時点（`926ef60`）または **PR #131 以降に積み上がった新規 PR の squash** で、削除対象 branch が **依然として past となっていること**（main が削除対象 branch の祖先になっていないこと、すなわち削除対象 branch が main から派生し squash で吸収済みの状態）。

### 9.3 working tree / git diff --check

```bash
git status
git diff --check
```

期待値：working tree clean / `git diff --check` clean / 削除実行ブランチが削除対象 branch でないこと。

### 9.4 branch protection 確認

```bash
gh api repos/kazuo1970takahashi-sketch/shogi/branches/<branch>/protection
```

期待値：404（protection 未設定）。設定されていれば実行停止。

---

## 10. 実行後 report 項目（案 B 採用時）

### 10.1 全般

1. AR ID（例：`AR-BRANCH-DELETE-BATCH-001`）
2. 実行コマンド一覧（`gh api -X DELETE` / `git branch -D` 等）
3. 削除前の remote / local branch list（grep tour-ops 結果）
4. 削除後の remote / local branch list（grep tour-ops 結果）
5. 各 branch の削除成否（5 件分 ✅ / ❌）

### 10.2 各 branch について

- branch 名
- 削除前 HEAD SHA
- 削除コマンド戻り値
- 削除後の確認（404 確認）

### 10.3 安全性確認

- main HEAD 不変確認（実行前後で同一）
- 削除対象外 branch（PR #122〜#126 由来 5 branch / その他 active branch）が **無影響** であることを確認
- tag が削除されていないこと
- release / deploy / publish が発生していないこと

### 10.4 禁止事項遵守

- branch 削除以外の操作を実行していないこと
- 後続タスクに着手していないこと
- Candidate Adopt / Task 化していないこと
- template 強制化 / v0.2 本文作成していないこと

### 10.5 次 AR 候補

- Phase 1 cleanup 残（PR #122〜#126 由来 5 branch）への対応：別 AR or 放置
- `TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT` 着手 / その他後続

---

## 11. 禁止事項（本 PR + 後続 branch 削除 AR 共通）

### 11.1 本 trial 設計 PR（本 PR）の禁止事項

- branch 削除（**本 trial 設計 PR では一切実行しない**）
- Ready 化 / merge / main 直接 push
- release / deploy / publish
- 実装ファイル / テスト / snapshot / workflow / package 変更
- `.github/` 配下変更
- PR template / Issue template / label 作成・変更
- `ai_work_queue.md` 作成・変更
- Candidate Registry 作成
- Candidate Adopt / Task 化
- template 強制化
- v0.2 本文作成
- 既存 ops docs 10 件改訂
- 後続タスク着手（branch 削除 AR 含む）

### 11.2 後続 branch 削除 AR 実行時の禁止事項（参考）

- 列挙対象外 branch（特に PR #122〜#126 由来 5 branch を含む）への操作
- main / 他 branch / tag 削除
- release / deploy / publish
- 後続タスク着手
- PR template / Issue template / label 操作
- workflow / package / token / branch protection 変更
- `gh pr merge --delete-branch` の使用（branch 削除専用 AR で実行する原則維持）

---

## 12. 今回やらないこと

本 PR では次は **行わない**。

- branch 削除（実行は別 AR + 別 Approval Phrase）
- Ready 化 / merge / main 直接 push / release / deploy / publish
- Candidate Adopt / Task 化 / 実装着手 / Candidate Registry 作成
- template 強制化 / v0.2 本文作成
- 既存 ops docs 10 件改訂
- 実装 / テスト / snapshot / workflow / package 系変更
- `.github/` 配下変更
- PR template / Issue template / label 作成
- `ai_work_queue.md` 作成
- branch protection / token / secret / credential 操作
- RESET-UX 後続実装
- 本 trial 以外の後続タスク着手（V0-2-DRAFT / REGISTRY-DESIGN / その他）

---

## 13. 後続 Action Request 案

本 trial PR の merge 後、髙橋さん判断で以下のいずれかに進む。

### 13.1 `AR-BRANCH-DELETE-BATCH-001`（案 B、推奨）

PR #127〜#131 の **5 branch 一括削除**。本 trial §6 / §8 に従う。

```
Approval Phrase: 承認：PR #127 #128 #129 #130 #131 branch 削除
```

### 13.2 `AR-BRANCH-DELETE-PR<N>-001`（案 A）

1 branch ずつ削除（5 回繰り返し）。本 trial §5 に従う。

```
Approval Phrase: 承認：PR #<N> branch 削除
```

### 13.3 `AR-BRANCH-DELETE-PHASE1-BATCH-001`（Option Y、別検討）

PR #122〜#131 の **10 branch 一括削除**（Phase 1 全体 cleanup）。本 trial §3.2 / §8.4 に従い、別 AR として髙橋さんが明示判断。

```
Approval Phrase: 承認：PR #122 #123 #124 #125 #126 #127 #128 #129 #130 #131 branch 削除
```

### 13.4 削除しないで放置

ストレージ / GitHub UI 上の影響は軽微。Phase 2 中盤以降にまとめて検討する選択肢。

---

## 14. 判定基準

本 trial の **成功条件**：

- 設計 trial 文書が main に反映される
- 案 A / 案 B の比較が明確
- 案 B 実行条件（§8.2、10 項目）が明文化されている
- 後続 AR テンプレが §13 で複数提示されている
- 本 PR では branch 削除を **実行しない**
- 既存 ops docs 10 件未変更

本 trial の **失敗条件**：

- 本 PR で branch を削除している
- 案 A / 案 B の境界が曖昧
- 後続 AR 雛形が不完全
- 既存 ops docs を改訂している
- v0.2 本文作成している
- 後続タスクに着手している
- template 強制化している

---

## 15. 完了条件

- docs-only ✅
- 新規 trial 文書（本 doc）が作成されている
- HANDOFF.md に最小限の履歴が追記されている
- `git diff --check` clean
- Draft PR が作成されている
- PR コメントに完了報告が投稿されている
- 次の Action Request 案（§13）が提示されている
- branch 削除は **未実行** で停止している

---

## 16. 結論

- PR #131 §4.5 branch 削除 AR テンプレを **実題材で検証する trial** を docs-only で準備した。
- **案 B（1 AR / 5 branches 一括削除）を推奨候補** とし、§8.2 の 10 項目安全条件を満たす場合のみ実行可能とする設計。
- **案 A（1 AR / 1 branch）は安全だが冗長**、SHOGI-TOUR の 5 branch 規模では過剰丁寧。
- **Option Y（10 branch 一括削除、PR #122〜#131）は別 AR** として髙橋さんが判断。
- **本 PR では branch 削除を実行しない**。実行は後続の明示 Approval Phrase 受領後に別 AR として行う。
- 本 trial は CAND-PR127-002（Hold 中）の Adoption と兼ねる可能性があり、`TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT §4.5` の初実運用検証となる。
