# SHOGI-TOUR｜AI 非同期運用 軽量テンプレ集（TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT）

**Task ID**: `TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT`
**作業種別**: docs-only / template IMPL-LIGHT / Phase 2 入口
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `ae11cd3`（PR #130 squash merge 後の main = TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW）
**位置づけ**: PR #122〜#130 で確立した Phase 1 の運用を **長文化させずに再利用** できるよう、Action Request / RRD / Review Report / 完了報告 / Approval Phrase / Candidate / Forbidden Actions の **軽量テンプレ集** を docs として追加する。安全性は維持しつつ、毎回のコピペ負担を減らす。**テンプレは「案」であり強制ではない**。自動化・Bot 化・GitHub Actions・v0.2 本文作成・既存 ops docs 改訂・branch 削除・Candidate Adopt には進まない。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **前提となる main 反映済 PR**:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — ASYNC-AI-WORKFLOW-DESIGN（v0.1、squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — ASYNC-AI-WORKFLOW-TRIAL-001（squash `44b49a9`）
  - PR [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) — REVIEW-REQUEST-TEMPLATE-DESIGN（squash `84f6724`）
  - PR [#125](https://github.com/kazuo1970takahashi-sketch/shogi/pull/125) — CLAUDE-CODE-REVIEWER-DESIGN（squash `20c0a71`）
  - PR [#126](https://github.com/kazuo1970takahashi-sketch/shogi/pull/126) — CLAUDE-CODE-REVIEWER-TRIAL-001（squash `f989514`）
  - PR [#127](https://github.com/kazuo1970takahashi-sketch/shogi/pull/127) — ACTION-REQUEST-DESIGN（squash `541feb2`）
  - PR [#128](https://github.com/kazuo1970takahashi-sketch/shogi/pull/128) — AI-TASK-CANDIDATE-DESIGN（squash `f15793a`）
  - PR [#129](https://github.com/kazuo1970takahashi-sketch/shogi/pull/129) — AI-TASK-CANDIDATE-TRIAL-001（squash `32a3ab2`）
  - PR [#130](https://github.com/kazuo1970takahashi-sketch/shogi/pull/130) — AI-WORKFLOW-V0-2-REVIEW（squash `ae11cd3`）
- **非対象（今回 PR では実施しない）**:
  - 既存 ops docs 9 件の改訂
  - v0.2 本文作成
  - template の強制化（`.github/PULL_REQUEST_TEMPLATE.md` 化 / Issue template 化 / label / `ai_work_queue.md` 作成）
  - Bot / GitHub Actions / API 連携 / 自動化
  - Candidate Adopt / Task 化 / 実装着手 / Registry 実ファイル化
  - branch 削除（PR #127/#128/#129/#130 の 4 branch 残存中、本 PR では触らない）
  - 実装 / テスト / snapshot / workflow / package 系の一切の変更
  - branch protection / token / secret / credential 操作
  - release / deploy / publish
  - RESET-UX 後続実装
  - 後続タスク（ACTION-REQUEST-TRIAL-001 / V0-2-DRAFT / BRANCH-CLEANUP-AR / REGISTRY-DESIGN / REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT / CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT / ASYNC-IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT）の着手

---

## 1. 目的

- AI 非同期運用 Phase 1 で **長文化** した Action Request / RRD / 完了報告を **軽量化** する。
- 安全性を落とさず、**再利用可能なテンプレ** にする。
- 毎回ゼロから長文を書く負担を減らす。
- AR / RRD / Review Report / 完了報告 / Approval Phrase の **関係を整理** する。
- 今回はテンプレ集の追加であり、**自動化・Bot 化・v0.2 本文作成には進まない**。

---

## 2. 前提

- PR #122〜#130 により Phase 1 は main に反映済み
- Action Request は **PR #127〜#130 の 4 PR 連続で Ready / merge に自己適用** 済み
- 対応 AR 不在の短文承認は **4 回以上停止** できた
- head SHA guard / Staleness Rule は機能した
- Candidate Adopt / Task 化 / branch 削除 / template 化 / v0.2 本文作成に **勝手に進まなかった**
- しかし、AR / RRD / 完了報告は **長くなりすぎる傾向** がある
- 今回は **「テンプレで短くする」** ことが目的

---

## 3. テンプレの基本方針

- テンプレは **安全性を下げるためではなく、漏れを減らすため** のもの
- **Level 1 docs-only では Short 版を使ってよい**
- **Level 2 以上、実装影響、security 影響、workflow / package / token / branch protection 関連では Full 版を使う**
- **Forbidden Actions は毎回必要**
- **Expected Head SHA は原則必要**
- **changedFiles は原則必要**
- Approval Phrase は **Target / Action / Scope が対応 AR と一致** する必要がある（PR #127 §7.1）
- **Staleness Rule は省略しない**
- branch 削除 / Candidate Adopt / Candidate Task 化 / v0.2 本文作成 / template 実ファイル化 / 後続タスク着手は **原則別 AR**
- **「いいよ」「進めて」「OK」だけでは実行しない**（PR #127 §7.2 無効例）

---

## 4. Action Request テンプレ

### 4.1 Action Request Short Template（Level 1 docs-only 向け）

**用途**: Level 1 docs-only / Ready 化 / squash merge / review 依頼など、低リスク操作向け。12 項目を短縮形式で記述。

```
Action Request:
- ID: AR-PR<N>-<ACTION>-<SEQ>
- Target: PR #<N> / <Task ID>
- Expected Head SHA: <SHA>
- Action: <Ready化 | squash merge | review 依頼 | 修正依頼>
- Reason: <1〜3 行>
- Preconditions:
  - PR state: OPEN
  - isDraft: <true/false>
  - head SHA: <SHA>
  - changedFiles: <N>（<内訳要約>）
  - docs-only
  - forbidden changes なし
  - main HEAD: <main SHA>
  - mergeable: MERGEABLE / mergeStateStatus: CLEAN（merge AR の場合のみ）
- Allowed Scope: <例：Ready 化のみ / squash merge のみ>
- Forbidden Actions: [§10.1 Level 1 docs-only common Forbidden Actions を参照]
- Required Approval Phrase: 承認：PR #<N> <ACTION>
- Execution Owner: Claude Code Implementer
- Report: <Post-Execution Report Requirements を簡潔に列挙 or §7 Completion Report テンプレを参照>
- Staleness Rule: head SHA / state / changedFiles 変更時は無効、main HEAD 進行時は再確認
```

### 4.2 Action Request Full Template（Level 2 以上、PR #127 §5 12 項目を完全展開）

**用途**: Level 2 以上 / 実装影響あり / security 影響あり / workflow / package / token / branch protection / branch 削除複数操作 / v0.2 本文作成 / template 実ファイル化など。

```
Action Request:
- 1. Action Request ID: AR-<TARGET>-<ACTION>-<SEQ>
- 2. Target: PR #<N> / <Task ID> / Branch: <branch name>
- 3. Proposed Action: <具体的な操作の説明>
- 4. Reason:
  - <妥当性根拠 1>
  - <妥当性根拠 2>
  - <Reviewer review 結果 / A/Go 判定>
- 5. Preconditions:
  - PR state: <OPEN / Draft / MERGED>
  - isDraft: <true/false>
  - mergeable / mergeStateStatus: <値>
  - head SHA: <SHA>
  - base: main
  - main HEAD: <SHA>（race 確認）
  - changedFiles: <N>（<内訳>）
  - docs-only / implementation scope
  - forbidden changes: なし
  - その他 Risk Level 固有 precondition
- 6. Expected Head SHA: <SHA>
- 7. Allowed Scope:
  - <許可する操作 1>
  - <許可する操作 2>
- 8. Forbidden Actions: [§10 共通ブロック + Risk Level 固有 add-on]
- 9. Required Approval Phrase: 承認：<Target> <Action>
- 10. Execution Owner: Claude Code Implementer / Reviewer 別セッション / 髙橋さん 等
- 11. Post-Execution Report Requirements:
  1. <報告項目 1>
  2. <報告項目 2>
  ...
- 12. Expiration / Staleness Rule:
  - head SHA 変更時は無効
  - PR state 変更時は再確認
  - changedFiles 変更時は無効
  - main HEAD 進行時は再確認
  - precondition 不成立時は実行せず停止
  - 24 時間経過時は再確認推奨
```

### 4.3 Ready 化 AR Example（汎用短縮版）

```
Action Request:
- ID: AR-PR<N>-READY-001
- Target: PR #<N> / <Task ID>
- Expected Head SHA: <SHA>
- Action: PR #<N> を Ready for review に変更
- Reason:
  - Reviewer review 完了済み（A / Go、Must Fix なし、Should Fix なし）
  - Ready Recommended / Merge Recommended
  - docs-only / Level 1
- Preconditions:
  - PR state: OPEN / isDraft: true
  - head SHA: <SHA>
  - changedFiles: <N>
  - docs-only / forbidden changes なし
- Allowed Scope: PR #<N> の Ready 化のみ
- Forbidden Actions: §10.2 Ready 化用共通 Forbidden Actions
- Required Approval Phrase: 承認：PR #<N> Ready化
- Execution Owner: Claude Code Implementer
- Report: §7.3 Ready 化完了報告テンプレ
- Staleness Rule: 標準
```

### 4.4 squash merge AR Example（汎用短縮版）

```
Action Request:
- ID: AR-PR<N>-MERGE-001
- Target: PR #<N> / <Task ID>
- Expected Head SHA: <SHA>
- Action: PR #<N> を squash merge する
- Reason:
  - Ready 化済み、Reviewer review 完了
  - mergeable: MERGEABLE / mergeStateStatus: CLEAN
  - base race なし
- Preconditions:
  - PR state: OPEN / isDraft: false
  - mergeable: MERGEABLE / mergeStateStatus: CLEAN
  - head SHA: <SHA>
  - main HEAD: <SHA>
  - changedFiles: <N>
  - docs-only / forbidden changes なし
- Allowed Scope: PR #<N> の squash merge のみ
- Forbidden Actions: §10.2 merge 用共通 Forbidden Actions（**branch 削除は別許可**）
- Required Approval Phrase: 承認：PR #<N> squash merge
- Execution Owner: Claude Code Implementer
- Report: §7.4 squash merge 完了報告テンプレ
- Staleness Rule: 標準 + main HEAD race 検査
```

### 4.5 branch 削除 AR Example（後続 TRIAL-001 準備用、本 PR では実行しない）

#### 案 A：1 AR / 1 branch（単独削除）

```
Action Request:
- ID: AR-BRANCH-DELETE-<branch-suffix>-001
- Target: branch <full branch name>（remote + local）
- Expected Branch HEAD: <SHA>
- Action: 該当 branch を remote / local から削除
- Reason:
  - 対応 PR が MERGED
  - squash commit が main HEAD に存在
  - 本 branch を base にしている他 PR なし
- Preconditions:
  - 対応 PR state: MERGED
  - branch HEAD が squash で main に吸収済み
  - 他 PR の base になっていない
- Allowed Scope: 該当 1 branch の remote / local 削除のみ
- Forbidden Actions:
  - main / 他 branch への操作
  - tag 削除
  - release / deploy / publish
  - 後続タスク着手
- Required Approval Phrase: 承認：PR #<N> branch 削除
- Execution Owner: Claude Code Implementer
- Report: 削除後の branch list / 副作用の有無 / main HEAD 不変確認
- Staleness Rule: 標準
```

#### 案 B：1 AR / N branches（複数まとめて削除）

```
Action Request:
- ID: AR-BRANCH-DELETE-BATCH-001
- Target: 複数 branch（remote + local、例：PR #127/#128/#129/#130 由来 4 branch）
- Branches:
  - <branch 1>（HEAD <SHA>、PR #<N1>）
  - <branch 2>（HEAD <SHA>、PR #<N2>）
  - ...
- Action: 列挙した branch を remote / local から一括削除
- Reason: 累積 merge 済 branch をまとめて整理
- Preconditions: 各 branch につき案 A と同じ
- Allowed Scope: 列挙 branch の remote / local 削除のみ
- Forbidden Actions: 案 A と同じ
- Required Approval Phrase: 承認：PR #<N1> #<N2> ... branch 削除
- Execution Owner: Claude Code Implementer
- Report: 削除前後の branch list / 各 branch 削除結果 / 副作用
- Staleness Rule: 標準
```

> **推奨は後続 `TOUR-OPS-ACTION-REQUEST-TRIAL-001` で決める**。案 A は 1 AR / 1 branch の安全性が高い一方、案 B は AR 数を減らせる。本 PR では仮例に留め、実行も推奨確定もしない。

---

## 5. Review Request Draft テンプレ

### 5.1 RRD Short Template（Level 1 docs-only 向け）

**用途**: Level 1 docs-only / GitHub が読める前提 / PR diff が小さい場合。

```
# Review Request Draft — PR #<N>（<Task ID>）

## ヘッダー
- 対象 PR: #<N>
- Task ID: <Task ID>
- Risk Level: Level 1（docs-only）
- HEAD（main）: <SHA>
- Head SHA（本 PR）: <SHA>
- base: main / branch: <branch>
- changedFiles: <N>（<内訳>）

## 参照 URL
- PR URL: https://github.com/<owner>/<repo>/pull/<N>
- diff URL: <PR URL>.diff
- patch URL: <PR URL>.patch
- commits: <PR URL>/commits
- files: <PR URL>/files
- commit URL: https://github.com/<owner>/<repo>/commit/<SHA>
- 固定 raw URL: https://raw.githubusercontent.com/<owner>/<repo>/<SHA>/<path>

## 変更ファイル
| ファイル | 種類 | 行差分 |
| --- | --- | --- |
| <path 1> | ADDED/MODIFIED | +X / -Y |

## 主要セクション抜粋
（design note / trial note の §1 目的、主要原則、重要例を 5〜10 行で抜粋）

## review scope
- docs-only / forbidden changes なし / 既存 ops docs 未変更

## review viewpoints
1. docs-only であること
2. 前提 main 反映 PR と矛盾していないか
3. 目的が明確であること
4. <Task 固有観点 1>
5. <Task 固有観点 2>

## Must / Should / Nice 基準（PR #124 §4.6）
- Must Fix: docs-only 逸脱 / 既存 ops docs 改訂 / forbidden changes / 安全原則違反
- Should Fix: 用語揺れ / 例不足 / 後続候補優先順位の不整合 / HANDOFF.md 追記の過不足
- Nice to Have: 後続 IMPL-LIGHT で扱える改善案

## fallback 方針（PR #124 §5）
- L0: GitHub PR 直読
- L1: §3 抜粋 + Material Pack
- L2: 固定 raw URL 取得を試す
- L3: 「読めていない」明示 → No Go / 留保

## Reviewer 禁止事項（PR #125 §7）
- commit / push / Ready / merge / branch 削除 / PR コメント投稿 / PR 本文編集 / Candidate 勝手 Adopt / Candidate 勝手 Task 化 / Reviewer Owner 化（PR #128 §6.1）
- template 強制化 / v0.2 本文作成 / 既存 ops docs 改訂

## Review Report format
PR #125 §8.1 / 本テンプレ §6 を参照（14 項目）
```

### 5.2 RRD Full Template（Level 2 以上 / Codex review 向け）

**用途**: GitHub が読めない可能性がある場合 / diff が大きい場合 / 実装影響あり / security 影響あり / Codex review 向け。

§5.1 に加え、以下を追加：

```
## Review Material Pack（PR #124 §4.4）

### 4.1 共通必須項目
- 変更ファイル全パス
- 変更行数
- 主要変更点（実装：関数名 / API / DB schema、docs：章立て）
- 関連 design note / trial note の参照
- forbidden changes 確認（実装 / テスト / snapshot / workflow / package / template / label / `ai_work_queue.md` / 既存 ops docs）

### 4.2 docs-only PR 追加項目
- 既存 ops docs 未変更（リスト）
- template 実ファイル化なし
- Candidate Registry 未作成

### 4.3 実装 PR 追加項目
- 変更前後の関数シグネチャ
- データフロー
- E2E / unit test カバレッジ
- snapshot 影響見込み
- VRT 影響見込み
- DB migration / schema 変更
- API 変更
- セキュリティ影響評価

## レビュアー留保欄（PR #124 §6）
Reviewer は Review Report に以下の標準欄を必ず記載：
- レビューの限界
- 未確認範囲
- 留保条件
- 追加確認推奨

## Codex-primary / Claude Code-secondary / ChatGPT-orchestrated 方針（PR #124 §3 §7、PR #125 §4 §5）
- Codex primary：Level 2+ / 実装影響 / security 影響
- Claude Code Reviewer secondary：Codex 利用不可時の代替、または Level 1 docs-only での単独
- ChatGPT 司令塔：Triage / Approval Phrase 案 / final 決定権なし
- cowork：optional advisory
- Grok：除外
```

### 5.3 Claude Code Reviewer read-only review 依頼テンプレ（別セッション起動時のコピペ用）

```
【Claude Code Reviewer 依頼】
- 対象 PR: #<N>
- Head SHA: <SHA>
- 対応 AR: AR-PR<N>-REVIEW-001（PR コメント <issuecomment-URL>）
- Review Request Draft: PR コメント <issuecomment-URL>
- read-only review 原則:
  - commit / push / Ready / merge / branch 削除 / PR コメント投稿 / PR 本文編集 / 修正実行 すべて禁止
  - Candidate を勝手に Adopt / Task 化しない
  - Reviewer 自身を Candidate Suggested Owner にしない
  - template 強制化しない / v0.2 本文作成しない
  - 対象 PR は #<N> のみ
- Review Report はチャット返却（PR コメント投稿しない）
- 14 項目フォーマット（本テンプレ §6）で返す
- 確認不能範囲を明示
- 禁止事項遵守確認を Report 末尾に記載
```

---

## 6. Review Report 14 項目テンプレ

PR #125 §8.1 / PR #126 / PR #129 / PR #130 のレビュー形式に基づく標準フォーマット。

```
# Review Report — PR #<N>（<Task ID>）by Claude Code Reviewer

1. **総合判定**: A / Go、B+ / Conditional Go、No Go のいずれか
2. **確認したもの**:
   - PR diff / patch / commit raw URL
   - 関連 design note / trial note
   - Review Request Draft 本文
   - <その他確認した範囲>
3. **確認できなかったもの**:
   - CI 結果 / VRT / snapshot
   - main HEAD 最新状態（fetch 時点のみ）
   - <その他未確認範囲>
4. **Must Fix**: 番号付き、ファイル名 + 行 + 修正提案（なければ「なし」）
5. **Should Fix**: 同上
6. **Nice to Have**: 同上（自動的に Candidate ではない、§9.3 観察メモ参照）
7. **Risk Level 評価**: Level <N>（docs-only / IMPL-LIGHT / IMPL-MEDIUM / security 等）
8. **影響評価**:
   - docs-only / implementation / data / security 影響
   - forbidden changes の有無
9. **Ready 化判断**: Ready Recommended / Conditional / Not Recommended
10. **merge 前修正要否**: 修正不要 / 条件付き / 必要
11. **再レビュー要否**: 不要 / 条件付き / 必要（Codex クロスチェック含む）
12. **Reviewer 禁止事項遵守確認**:
    - commit / push / Ready / merge / 修正実行 / PR 本文編集 / PR コメント投稿 / Candidate 勝手 Adopt / Candidate 勝手 Task 化 / branch 削除 / template 強制化 / v0.2 本文作成 / Reviewer Owner 化 いずれも未実行
13. **修正依頼案**: Must Fix / Should Fix がある場合、Implementer 向け修正依頼の骨子
14. **次アクション**: Ready 化 AR / 修正依頼 AR / Codex クロスチェック AR / Candidate 観察メモ のいずれかを提案
```

> **注記**：Nice to Have は **自動的に Candidate ではない**。Candidate 化する場合は、別途 Task Candidate フロー（§9）に乗せる。

---

## 7. 完了報告テンプレ

### 7.1 Completion Report Short Template（Level 1 docs-only 向け）

**用途**: Level 1 docs-only / Draft PR 作成 / Ready 化 / merge 後の簡易報告。

```
# Claude Code 完了報告 — <Task ID>

## Task
- Task ID: <Task ID>
- Branch: <branch>
- PR: #<N>
- Commit SHA: <SHA>
- Status: Draft / OPEN / Ready / MERGED

## Changed Files
| ファイル | 種類 | 行差分 |
| --- | --- | --- |
| <path> | ADDED/MODIFIED | +X / -Y |

## Summary
<実装内容を 3〜5 行で>

## Tests / checks
- docs-only のため自動テスト未実施
- `git diff --check`: clean
- working tree: clean

## Forbidden Actions 遵守確認
- Ready 化 / merge / push / branch 削除 / 既存 ops docs 改訂 / template 強制化 / v0.2 本文作成 / Candidate Adopt / 後続タスク着手 いずれも未実行

## Next Action
<次に必要なアクション 1〜2 行>

## Action Request 案
[§4.1 AR Short Template に沿った次 AR 1 件]
```

### 7.2 Completion Report Full Template（Level 2 以上 / 実装影響あり）

§7.1 に加え、以下を含める：

```
## 必須メタ情報（v0.1 §6 / PR #122）

### Core 5
| # | 項目 | 値 |
| --- | --- | --- |
| 1 | Next Action | <次に動くべき AI または人> |
| 2 | Next Owner | <髙橋さん / Reviewer / Implementer / 司令塔> |
| 3 | Blocked By | <Human Approval / Review Report / Codex review / その他> |
| 4 | Allowed Without Human Approval | <自律実行してよい範囲、なければ「なし」> |
| 5 | Requires Human Approval | <承認必要な操作リスト> |

### Standard 11
| # | 項目 | 値 |
| --- | --- | --- |
| 1 | Task ID | <Task ID> |
| 2 | PR 番号 | #<N> |
| 3 | Branch | <branch> |
| 4 | Commit SHA | <SHA> |
| 5 | Current Status | <Draft / OPEN / Ready / MERGED> |
| 6 | Forbidden Actions | [§10 共通ブロック + 固有 add-on] |
| 7 | Changed Files | <ファイルリスト> |
| 8 | Tests | <実施テスト結果 / docs-only 未実施> |
| 9 | Risk Level | Level <N> |
| 10 | Review Needed | Yes / No、reviewer 種別 |
| 11 | Handoff URL | <PR URL or comment URL> |

## Post-Execution Report（AR で指定された場合）
[AR の Post-Execution Report Requirements に沿って項目展開]

## 禁止事項遵守確認（全範囲）
[§10 共通ブロック全項目を「✅ 未実行」で列挙]
```

### 7.3 Ready 化完了報告テンプレ

```
# Post-Execution Report — AR-PR<N>-READY-001

## 実行結果
- PR #<N>: Ready for review ✅
- isDraft: false ✅
- state: OPEN ✅
- head SHA: <SHA>（変化なし、AR Expected と一致） ✅
- mergeable: MERGEABLE / mergeStateStatus: CLEAN ✅
- main HEAD: <SHA>（race なし） ✅

## Ready 化前 precondition 再確認
| 項目 | 期待値 | 実測値 | 判定 |
| --- | --- | --- | --- |
| PR state | OPEN | OPEN | ✅ |
| isDraft | true | true | ✅ |
| head SHA | <SHA> | <SHA> | ✅ |
| changedFiles | <N> | <N> | ✅ |
| docs-only | yes | yes | ✅ |
| forbidden changes | なし | なし | ✅ |

## 実行コマンド
`gh pr ready <N>`

## Reviewer review 結果（AR Reason より）
- 総合判定: A / Go
- Must Fix: なし
- Should Fix: なし
- Nice to Have: <件数>（merge blocker ではない）
- Ready Recommended / Merge Recommended

## Forbidden Actions 遵守確認
- merge / branch 削除 / Candidate Adopt / 後続タスク着手 / template 強制化 / v0.2 本文作成 いずれも未実行

## 次 AR 案
[squash merge AR (§4.4 short example)]
```

### 7.4 squash merge 完了報告テンプレ

```
# Post-Execution Report — AR-PR<N>-MERGE-001

## 実行結果
- PR #<N>: MERGED ✅
- mergedAt: <時刻>
- squash commit SHA: <SHA>
- main HEAD: 旧 <SHA> → 新 <SHA>

## 実行コマンド
`gh pr merge <N> --squash`（`--delete-branch` なし）

## main 反映後の commit
```
<git log --oneline -<N> 出力>
```

## merge 前 precondition 再確認
| 項目 | 値 | 判定 |
| --- | --- | --- |
| mergeable | MERGEABLE | ✅ |
| mergeStateStatus | CLEAN | ✅ |
| head SHA | <SHA> | ✅ |
| main HEAD | <SHA> | ✅（race なし） |

## branch の現状
- 削除なし（**別許可**、本 AR では未実行）
- remote / local ともに残存

## Candidate / template / v0.2 本文の扱い
- Candidate Adopt / Task 化 / 実装着手: 未実行
- Candidate Registry: 未作成
- template 強制化: 未実行
- v0.2 本文作成: 未実行

## Forbidden Actions 遵守確認
- branch 削除 / main 直接 push / release / deploy / publish / Candidate Adopt / template 強制化 / v0.2 本文作成 / 後続タスク着手 いずれも未実行

## 次候補（着手しない、推奨のみ）
[branch cleanup AR / 後続 Task 着手 AR / Codex クロスチェック AR のいずれかを §13 推奨順位に沿って提示]
```

---

## 8. Approval Phrase テンプレ

### 8.1 有効例

- `承認：PR #<N> Claude Code Reviewer read-only review`
- `承認：PR #<N> Codex review`
- `承認：PR #<N> Ready化`
- `承認：PR #<N> squash merge`
- `承認：PR #<N> Must Fix 修正依頼`
- `承認：PR #<N> branch 削除`
- `承認：PR #<N1> #<N2> ... branch 削除`（複数まとめ、案 B）
- `承認：CAND-<XXX> を Hold`
- `承認：CAND-<XXX> を Adopt`（→ Task 化、§9 / PR #128 §13）
- `承認：CAND-<XXX> を Reject`
- `承認：CAND-<XXX> を Split`
- `承認：CAND-<XXX> を Merge with CAND-<YYY>`
- `承認：<Task ID> 着手`
- `承認：Phase 1 Codex クロスチェック依頼`

### 8.2 無効例（PR #127 §7.2、PR #127/#128/#129/#130 で 4 連続実証済）

- 「いいよ」
- 「進めて」
- 「OK」
- 「やって」
- 「まかせる」
- 「Ready で」
- 「merge して」（PR 番号なし）
- 対応 AR 不在の承認文
- Target 違い（対応 AR と PR 番号 / Task ID が一致しない）
- Action 違い（対応 AR と操作種別が一致しない）
- Scope 違い（対応 AR の Allowed Scope を超える）
- head SHA 変更後の古い承認文（Staleness Rule 違反）
- Forbidden Actions と矛盾する承認文（例：merge 承認に branch 削除を含めて要求）

### 8.3 注記

- **Approval Phrase は対応 AR とセットで初めて有効**
- 短文承認だけが単独で存在しても、**対応 AR がなければ実行しない**
- §7.1 の 7 条件すべて成立で有効：
  1. Target 明確
  2. Action 明確
  3. Scope 明確
  4. 対応する Action Request が存在する
  5. precondition 実行直前確認
  6. 禁止事項維持
  7. 髙橋さんの明示許可
- ChatGPT 司令塔の承認文「案」は **許可そのものではない**

---

## 9. Task Candidate 軽量テンプレ

### 9.1 Candidate Short Template（Level 1 docs-only 用）

```
Task Candidate:
- Candidate ID: CAND-<source>-<seq>
- Source: <Reviewer Nice to Have / Implementer 完了報告 / 司令塔整理 / ユーザー発言 / 他>
- Proposal: <1〜2 行>
- Reason: <なぜ必要か、1〜3 行>
- Expected Benefit: <安全性 / コピペ削減 / レビュー品質 / ドキュメント整合性 等>
- Suggested Timing: <Now / Next / Later / Hold / Reject>
- Required Human Decision: <Adopt / Hold / Reject / Split / Merge>
- Auto-Implementation: Prohibited
- Forbidden Scope: <この Candidate を扱う際の禁止範囲>
- Notes: <補足、関連 Candidate、観察ポイント>
```

### 9.2 Candidate Full Template（PR #128 §5 15 項目）

```
Task Candidate:
- 1. Candidate ID
- 2. Source
- 3. Proposal
- 4. Reason
- 5. Expected Benefit
- 6. Risk Level（Level 0〜3+）
- 7. Suggested Task ID
- 8. Suggested Owner（Implementer / Reviewer は不可 / 司令塔 / 髙橋さん / Codex）
- 9. Suggested Timing
- 10. Required Human Decision
- 11. Auto-Implementation: Prohibited
- 12. Acceptance Criteria Draft
- 13. Forbidden Scope
- 14. Related PR / Docs
- 15. Notes
```

### 9.3 観察メモテンプレ（正式 Candidate にしない、PR #129 / #130 で実証）

```
Observation Memo:
- Observation ID: OBS-<source>-<seq>
- Source: <Reviewer Nice to Have / 司令塔観察 / 運用観察 等>
- Summary: <1〜3 行>
- Related future task: <該当する場合の Task ID 候補>
- Why not Candidate now:
  - <理由 1：候補過多 / 範囲が大きすぎる / 時期尚早 / 重複の可能性 等>
  - <理由 2>
- Revisit timing: <いつ再評価するか>
```

> **重要**：観察メモは **Candidate ではない**。観察メモから **勝手に Task 化しない**（PR #128 §3.7 Auto-Implementation Prohibited / PR #129 で実証）。

---

## 10. Forbidden Actions 共通ブロック

### 10.1 Level 1 docs-only common Forbidden Actions

```
Forbidden Actions（Level 1 docs-only 共通）:
- merge
- main 直接 push
- release / deploy / publish
- branch 削除（別 AR 必要）
- GitHub Actions / workflow / `.github/workflows/` 変更
- Bot 実装 / API 連携
- package*.json / lockfile / playwright.config.js 変更
- token / secret / credential 操作
- branch protection 変更
- 実装ファイル（shogi_v4.html / index.html / data/ 等）変更
- テストファイル（test/ / test/e2e/）変更
- snapshot / VRT PNG 変更
- CSS / layout 変更
- .github/PULL_REQUEST_TEMPLATE.md / .github/ISSUE_TEMPLATE/ 変更
- label 作成
- ai_work_queue.md 作成
- Candidate Registry 作成
- Candidate Adopt / Task 化 / 実装着手
- template 強制化（実ファイル化を超える運用強制）
- v0.2 本文作成
- 既存 ops docs 本体改訂（v0.1 / async trial-001 / RRD design / Reviewer design / Reviewer trial-001 / Action Request design / AI Task Candidate design / AI Task Candidate trial-001 / v0.2 review note）
- 後続タスク着手
- RESET-UX 後続実装
- unrelated cleanup / unrelated refactor
```

### 10.2 Ready / merge 用共通 Forbidden Actions

**Ready 化時**：

```
- merge
- branch 削除
- Candidate Adopt / Task 化
- 後続タスク着手
- template 強制化 / v0.2 本文作成（後続別タスク）
```

**merge 時**：

```
- branch 削除（明示 AR がある場合を除く、原則別許可）
- Candidate Adopt / Task 化
- template 強制化 / v0.2 本文作成
- 後続タスク着手
- main 直接 push
- release / deploy / publish
```

### 10.3 Higher Risk Forbidden Actions add-on（Level 2 以上）

将来用として記録（SHOGI-TOUR 現時点では主に発生しないが、Phase 2 以降で必要となり得る）：

```
Higher Risk Forbidden Actions add-on:
- database / schema 変更（migration 含む）
- auth / permission 変更
- storage 変更（localStorage / sessionStorage / IndexedDB / 外部 storage）
- external API 変更（追加 / 削除 / 認証変更）
- production config 変更
- CI/CD 変更
- secrets 変更（API キー / トークン / 環境変数）
- VRT threshold 緩和
- ロジック動作変更を伴うリファクタ
- データ削除 / 破壊的変更
```

---

## 11. Level 別使い分け

### Level 1 docs-only

| テンプレ | 使用版 |
| --- | --- |
| Action Request | §4.1 Short |
| Review Request Draft | §5.1 Short |
| Completion Report | §7.1 Short |
| Review Report | §6 14 項目（変わらず） |
| Forbidden Actions | §10.1 Level 1 |
| Task Candidate | §9.1 Short（必要時のみ） |

### Level 2 implementation-light

| テンプレ | 使用版 |
| --- | --- |
| Action Request | §4.2 Full |
| Review Request Draft | §5.2 Full |
| Completion Report | §7.2 Full |
| Review Report | §6 14 項目 + 留保欄拡充 |
| Forbidden Actions | §10.1 + 必要 add-on |
| Task Candidate | §9.2 Full |
| Codex クロスチェック | 推奨 |

### Level 3 security / workflow / data

| テンプレ | 使用版 |
| --- | --- |
| Action Request | §4.2 Full 必須 |
| Review Request Draft | §5.2 Full 必須 |
| Completion Report | §7.2 Full 必須 |
| Review Report | §6 14 項目 + 詳細留保 |
| Forbidden Actions | §10.1 + §10.3 add-on |
| Task Candidate | §9.2 Full |
| Codex クロスチェック | 必須寄り |
| Human review | 必須寄り |
| branch protection / token / workflow / package 変更 | 特別扱い、別 AR 必須 |

---

## 12. 今回やらないこと

- 実装変更（shogi_v4.html / index.html / data/）
- テスト変更（test/ / test/e2e/）
- snapshot 変更
- workflow 変更（.github/workflows/）
- package / lockfile 変更
- GitHub Actions 変更
- Bot 実装
- 自動化
- `.github/PULL_REQUEST_TEMPLATE.md` 変更
- `.github/ISSUE_TEMPLATE/` 変更
- label 作成
- `ai_work_queue.md` 作成
- Candidate Registry 作成
- Candidate Adopt / Task 化 / 実装着手
- branch 削除（4 branch 累積、本 PR では触らない）
- v0.2 本文作成
- 既存 ops docs 本体改訂（9 件いずれも未変更）
- branch cleanup trial
- Action Request trial 着手
- V0-2-DRAFT 着手
- RESET-UX 後続実装
- unrelated cleanup / unrelated refactor

---

## 13. 今回作るテンプレは「案」である

- このテンプレは **初版** であり、**強制ではない**
- 次回以降の PR で trial しながら **改善する**
- v0.2 本文に入れるかは後続 `TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT` で判断する
- **使いづらければ修正する**
- 目的は運用の **硬直化ではなく、長文コピペ削減と漏れ防止**
- テンプレを使わずに長文を書くことも引き続き許容される（特に新しい状況 / 例外的 Risk Level）
- `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` への実ファイル化は **別タスク**（後続 `TOUR-OPS-PR-TEMPLATE-DESIGN` / `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT`）で検討

---

## 14. 後続タスク候補

本 PR では着手しない。Candidate Adoption + 髙橋さん明示許可が揃ったときに別 PR / 別セッションで進める。

| 優先 | Task ID | 内容 |
| --- | --- | --- |
| 第一 | `TOUR-OPS-ACTION-REQUEST-TRIAL-001` | branch 削除を題材に AR trial（本テンプレ §4.5 を試せる） |
| 第二 | `TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT` | Phase 1 成果と本テンプレを v0.2 本文に統合するか判断 |
| 並走可 | `TOUR-OPS-BRANCH-CLEANUP-AR` | trial ではなく単純に branch 削除だけを行う小タスク |
| 並走可 | `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` | 本テンプレから RRD 部分を独立化する必要があれば後続で検討 |
| 並走可 | `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT` | Reviewer 依頼テンプレを独立化（本 §5.3 と重複の可能性、必要時のみ） |
| 並走可 | `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` | v0.1 §10.1 完了報告テンプレ等の実装 |
| 並走可 | `TOUR-OPS-AI-WORK-QUEUE-DESIGN` | `ai_work_queue.md` 設計 |
| 並走可 | `TOUR-OPS-PR-TEMPLATE-DESIGN` | `.github/PULL_REQUEST_TEMPLATE.md` 設計 |
| 並走可 | `TOUR-OPS-HANDOFF-FORMAT-DESIGN` | HANDOFF.md フォーマット設計 |
| 不要見込 | `TOUR-OPS-AI-TASK-CANDIDATE-REGISTRY-DESIGN` | PR #129 / PR #130 で不要見込判定 |

---

## 15. 結論

- Phase 1 では **安全な運用設計** ができた（PR #122〜#130）
- 次の課題は **長文化・コピペ負担**
- 今回のテンプレは **安全性を保ちながら短縮するための第一歩**
- まずは docs-only テンプレ集として追加し、**次回以降に実運用で試す**
- まだ **Bot 化・自動化・v0.2 本文化には進まない**
- テンプレは **強制ではなく案**、使いづらければ修正する
- 既存 ops docs 9 件は本 PR では未変更
- branch 4 本も未削除（後続 `TOUR-OPS-ACTION-REQUEST-TRIAL-001` 題材）
- Candidate 3 件も Hold 維持
