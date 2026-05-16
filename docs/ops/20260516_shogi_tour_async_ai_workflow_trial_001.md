# SHOGI-TOUR｜AI 非同期運用ルール v0.1 初回手動試験記録（TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001）

**Task ID**: `TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001`
**作業種別**: docs-only trial / 運用ルール v0.1 の初回手動試験
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `ea71e15`（PR #122 squash merge 後の main = TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN）
**位置づけ**: PR #122 で main に投入した [AI 非同期運用ルール v0.1](20260516_shogi_tour_async_ai_workflow_v0_1.md) を、最初の **手動試験** として実際の Draft PR / PR コメント運用に 1 回適用する。自動化ではない。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **対象ルール**: AI 非同期運用ルール v0.1（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）
- **PR #122 squash commit**: `ea71e15148fcb5fbc2cb390f050369e2cb6f2428`
- **非対象（今回 PR では実施しない）**:
  - 実装ファイル変更（`shogi_v4.html` / `test/` / `test/e2e/` / `index.html` / `data/`）
  - workflow 変更（`.github/workflows/`）
  - 自動化実装（GitHub Actions / Bot / API 連携）
  - PR テンプレ変更（`.github/PULL_REQUEST_TEMPLATE.md`）
  - Issue テンプレ変更（`.github/ISSUE_TEMPLATE/`）
  - label 作成
  - `ai_work_queue.md` 作成
  - `package*.json` / lockfile / `playwright.config.js` 変更
  - VRT snapshot 変更
  - CSS / layout 変更
  - branch protection 変更
  - token / secret / credential 操作
  - 後続タスク（`TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` 等）の着手

---

## 1. 目的

- PR #122 で設計した **AI 非同期運用ルール v0.1** を、**最初の手動試験** として適用する。
- 目的は自動化ではなく、**GitHub 上のハンドオフ情報で次アクションが判断できるか確認すること**。
- 髙橋さんのコピペ負担を減らすために、**どの情報を PR コメントに残すべきか確認** すること。
- 今回は **docs-only trial** であり、運用ルール本体の改訂やテンプレ実装には進まない。

具体的には：

1. trial PR 自体に、v0.1 §6 Core 5 / Standard 11 を PR 本文 / PR コメントとして適用する
2. trial PR の PR コメントに、v0.1 §10.2 形式の **Review Request Draft**（cowork / Codex 向けレビュー依頼文の叩き台）を残す
3. trial PR の完了報告コメントに、v0.1 §6 のメタ情報テンプレを自己適用する
4. Ready 化 / merge / 危険操作は実行せず、Draft で停止する
5. trial の観察結果は、後続 `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` の入力として残す

---

## 2. 試験対象

### 2.1 対象ルール

- **AI 非同期運用ルール v0.1**：[`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`](20260516_shogi_tour_async_ai_workflow_v0_1.md)（PR #122 にて main に投入済）

### 2.2 試験対象セクション

| § | タイトル | 試験の焦点 |
|---|---|---|
| §6 | 必須メタ情報テンプレート（Core 5 / Standard 11） | 完了報告の必須欄が実際の PR で記入可能か、形骸化していないか |
| §10 | AI 間ハンドオフ手順 | Claude Code 完了報告テンプレ / Review Request Draft が PR コメントに残せるか |
| §11 | 依頼文の短縮・テンプレ化（Short Prompt） | Review Request Draft の実用粒度 / Short Prompt の自律実行抑止が機能するか |
| §12 | Blocked By の可視化 | Blocked By の分類が trial PR で実際に当てはまるか |
| §14 | 段階的導入計画（Phase 1） | Phase 1 で何を IMPL-LIGHT 化すべきかの輪郭が trial 後に見えるか |
| §16 | 後続タスク候補 | 後続候補 6 件のうち、最初に手を付けるべきものが trial 後に絞れるか |

---

## 3. 今回の trial で適用するもの

### 3.1 Core 5（省略不可、本 trial で必ず PR 本文 / PR コメントに記載）

| 欄 | 本 trial での記入値 |
|---|---|
| **Next Action** | trial PR 作成完了 → Review Request Draft を PR コメントに投稿 → cowork / Codex 向けレビュー依頼を髙橋さんから渡してもらう |
| **Next Owner** | 髙橋さん（レビュアー指定） → レビュアー AI（trial 観察結果のレビュー） → ChatGPT 司令塔（後続 IMPL-LIGHT の起票判断） |
| **Blocked By** | Review（cowork / Codex のレビュー待ち） + Human Approval（Ready 化 / merge 判断） |
| **Allowed Without Human Approval** | Draft PR 維持 / 修正コミット追加 / PR コメント投稿 / HANDOFF 追記 / trial note の修正 |
| **Requires Human Approval** | Ready 化 / squash merge / branch 削除 / VRT snapshot 変更 / release / deploy / publish |

### 3.2 Standard 11（原則記載・短いタスクでは簡略化可、本 trial では完全記載）

| 欄 | 本 trial での記入値 |
|---|---|
| **Task ID** | `TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001` |
| **PR 番号** | 本 PR 番号（commit 後に確定） |
| **Branch** | `docs/tour-ops-async-ai-workflow-trial-001` |
| **Commit SHA** | （commit 後に確定） |
| **Current Status** | Draft（§5.2 Draft 段階） |
| **Forbidden Actions** | Ready 化 / merge / main 直接 push / force push / branch 削除 / release / deploy / publish / workflow 変更 / Actions 変更 / Bot 実装 / 実装ファイル変更 / テストファイル変更 / snapshot 変更 / CSS / layout / `package*.json` / lockfile / `playwright.config.js` / token / branch protection / PR template / Issue template / label / `ai_work_queue.md` / 後続タスク着手 |
| **Changed Files** | `docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md`（新規）/ `HANDOFF.md`（最小追記） |
| **Tests** | docs-only trial のため未実施（`git diff --check` clean 確認） |
| **Risk Level** | Level 1: docs-only design / trial |
| **Review Needed** | cowork（独立レビュー、trial 観察結果の妥当性確認）/ Codex（独立レビュー）/ ChatGPT 司令塔（後続 IMPL-LIGHT 起票判断） |
| **Handoff URL** | 本 PR の URL（commit 後に確定） |

### 3.3 Review Request Draft（v0.1 §10.2 形式）

trial PR 作成後、PR コメントに **cowork / Codex に渡せる粒度のレビュー依頼文** を投稿する。髙橋さんがゼロから組み立てる必要がなく、そのままコピペして渡せる粒度。

含める内容：
- 対象 PR 番号 / PR diff URL
- Task ID
- 変更ファイル
- docs-only trial であることの明示
- レビュー観点 6 項目
- Must Fix / Should Fix / Nice to Have の基準
- Ready 化判断（A / B+ / No Go）
- merge 前修正が必要か
- v0.1 trial として妥当か

### 3.4 Blocked By（v0.1 §12 形式）

本 trial の状態遷移ごとに Blocked By を明記：

| 段階 | Blocked By |
|---|---|
| Draft PR 作成直後 | **Review**（cowork / Codex / ChatGPT 司令塔のいずれかのレビュー待ち） |
| review 結果が出た後 | **Human Approval**（Ready 化判断） |
| Ready 化後 | **Human Approval**（merge 判断） |
| merge 後 | （merge は本 trial では行わないため発生しない） |
| **Human Copy/Paste**（v0.1 §12 で新設） | trial 内で発生した場合は記録 — 例：レビュー依頼を髙橋さんが cowork / Codex に手動で渡す部分は現状 Human Copy/Paste 必須。これは Phase 1 / Phase 2 で自動化候補とすべきポイントとして残す |

---

## 4. 今回の trial でやらないこと

以下は **本 PR では一切実施しない**（後続タスクで扱う）：

- **テンプレ実ファイル化**：`.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` 作成
- **label 作成**：`ai:review-waiting` / `ai:human-approval-needed` / `ai:blocked` / `risk:light` / `risk:medium` / `risk:heavy` 等
- **work queue 作成**：`docs/ops/ai_work_queue.md`
- **GitHub Actions 変更**：`.github/workflows/`
- **Bot 実装** / **API 連携**
- **自動 Ready 化 / 自動 merge**
- **snapshot 更新**：VRT / `test/e2e/**/*-snapshots/`
- **release / deploy / publish**
- **branch 削除**：trial 終了後も `docs/tour-ops-async-ai-workflow-trial-001` は保持
- **RESET-UX 後続実装**：`RESET-UX-TOAST-LABEL-IMPL-MEDIUM` 等
- **v0.1 ルール本体の改訂**：trial の結果が出るまでは v0.1 本体に手を入れない（必要なら別 PR `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` で扱う）
- **後続タスク着手**：`TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` / `TOUR-OPS-AI-WORK-QUEUE-DESIGN` / `TOUR-OPS-PR-TEMPLATE-DESIGN` / `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN` / `TOUR-OPS-HANDOFF-FORMAT-DESIGN` / `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`

---

## 5. 試験手順

本 trial PR 自体で、以下のフローを実施する（== v0.1 §5.2 の Draft 段階の動きを再現する）：

1. **Draft PR を作成する**：`docs/tour-ops-async-ai-workflow-trial-001` → `main`、Draft 状態、タイトル `docs(ops): AI非同期運用ルールの初回試験を記録`。
2. **PR 本文に Core 5 / Standard 11 を記載する**：本 trial note の §3.1 / §3.2 を PR 本文にも転記し、GitHub UI から直接読み取れる状態にする。
3. **PR コメントに Review Request Draft を残す**：§3.3 の内容を「cowork / Codex にそのままコピペして渡せる粒度」で投稿する。
4. **Blocked By を明記する**：§3.4 の遷移表を PR コメントに含める。
5. **Allowed Without Human Approval / Requires Human Approval を明記する**：§3.1 Core 5 の通り PR コメントに残す。
6. **完了報告コメントを v0.1 §10.1 形式で投稿する**：Core 5 を必ず含め、Standard 11 を完全記載。Review Request Draft を別コメント、または完了報告内に含める。
7. **Ready 化 / merge / 危険操作はしない**：Draft のまま停止。
8. **後続タスクには着手しない**：§4 リスト通り。

---

## 6. 成功条件

本 trial が「成功した」と言える条件は以下：

- **(S1) GitHub PR コメントだけを見て、次に誰が何をすべきか分かる**：Core 5 の Next Action / Next Owner が機能する。
- **(S2) ChatGPT / cowork / Codex に渡すレビュー依頼文のたたき台が PR コメントに残っている**：Review Request Draft が存在し、コピペ可能な粒度になっている。
- **(S3) 髙橋さんがゼロからレビュー依頼文を作らなくてよい**：Review Request Draft をそのまま渡せる、または最小編集で渡せる。
- **(S4) Blocked By が明確である**：v0.1 §12 の分類に従って記載されている。
- **(S5) Allowed Without Human Approval と Requires Human Approval が明確である**：§3.1 Core 5 に従って記載されている。
- **(S6) Ready 化 / merge / 危険操作が自律実行されていない**：Draft のまま停止しており、`gh pr ready` / `gh pr merge` / `release` / `deploy` / `publish` / branch 削除を実行していない。

---

## 7. 観察ポイント

本 trial の結果から、後続 `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` の入力として観察するポイント：

### 7.1 Core 5 は実際に役立つか

- Next Action / Next Owner / Blocked By / Allowed Without Human Approval / Requires Human Approval の 5 欄を実際に書いてみて、判断材料として有効か。
- 「Next Owner が複数 (A → B → C) になる場合の書き方」が trial PR で必要になったか。
- 5 欄のうち書きにくかったもの、書きやすかったものを記録する。

### 7.2 Standard 11 は重すぎないか

- Core 5 に加えて 11 欄を完全記載する負担はどの程度か。
- 短いタスクでは「§6.5 簡略化」を適用すべきだが、trial PR は試験のため完全記載。実運用では Level 1〜2 の小タスクで Standard 11 を簡略化する形が自然か検証する。
- 完了報告が長くなり読まれない問題が出ていないか。

### 7.3 Review Request Draft は髙橋さんのコピペ負担を減らすか

- 「PR コメントに残しておく → 髙橋さんが cowork / Codex に渡す」の流れで、髙橋さんの組み立て負担が減るか。
- 渡す前に修正が必要だった場合、どの部分か（テンプレ改善候補）。
- 「PR diff URL」「Task ID」「レビュー観点」「Must Fix / Should Fix / Nice to Have の基準」が揃っているか。

### 7.4 Blocked By: Human Copy/Paste をどう記録すべきか

- v0.1 §12 で新設した「Human Copy/Paste」を本 trial で実際に発生したポイントに紐付ける。
- 例：レビュー依頼を髙橋さんが cowork / Codex に渡す手作業、レビュー結果を髙橋さんが PR コメントに転記する手作業。
- 蓄積されると Phase 1 / Phase 2 で自動化・テンプレ化候補が浮かび上がる。

### 7.5 完了報告が長すぎないか

- Core 5 + Standard 11 + Review Request Draft + Forbidden Actions リストで完了報告が肥大化していないか。
- 後続 IMPL-LIGHT で「短縮版テンプレ」を用意すべきか検討する材料にする。
- 短縮の余地：Forbidden Actions / Changed Files / Tests 等は GitHub UI 参照で代替可能か。

### 7.6 次の TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT で何をテンプレ化すべきか

- 本 trial を経て、最初に IMPL-LIGHT 化すべきものを絞る。候補：
  - **Claude Code 完了報告テンプレ**：v0.1 §10.1 の形を `docs/ops/claude_code_completion_template.md` 等に固定文書化
  - **Review Request Draft テンプレ**：v0.1 §10.2 の形を同様に固定文書化
  - **Core 5 / Standard 11 の記載場所**：PR 本文に書くべきか、PR コメントに書くべきか、両方か
  - **Blocked By の記録慣習**：絵文字 / バッジ / 構造化 markdown 等
- IMPL-LIGHT で何を「実ファイル化」すべきかは trial 後の判断。

---

## 8. 後続判断

本 trial の結果を見て、以下のいずれかに進む。**本 PR では着手しない**。

| 候補 Task ID | 種別 | 概要 | 起票タイミング |
|---|---|---|---|
| **TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT** | impl-light | trial で見えたテンプレ化候補（Claude Code 完了報告テンプレ / Review Request Draft 標準化 / Core 5・Standard 11 の記載場所決定）を実ファイル化 | 第一候補、trial レビュー後 |
| **TOUR-OPS-AI-WORK-QUEUE-DESIGN** | docs-only | `docs/ops/ai_work_queue.md` を設計（Task ID / PR / Status / Blocked By / Next Action / Next Owner 一覧） | 第二候補 |
| **TOUR-OPS-PR-TEMPLATE-DESIGN** | docs-only | `.github/PULL_REQUEST_TEMPLATE.md` の SHOGI-TOUR 専用設計（v0.1 Core 5 / Standard 11 を最小組込） | 第三候補 |
| **TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN** | docs-only | cowork / Codex / ChatGPT 用レビュー依頼テンプレ設計（v0.1 §10.2 を実ファイル化） | 第四候補 |
| **TOUR-OPS-HANDOFF-FORMAT-DESIGN** | docs-only | HANDOFF.md §5.5 のエントリ書式整理 / 構造化検討 | 第五候補 |
| **TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW** | docs-only | v0.1 実運用 1〜2 ヶ月後の反省と v0.2 への更新 | 観察期間後 |

### 8.1 後続着手の前提

- 本 trial PR が cowork / Codex のレビュー（A / Go または Conditional Go）を通過していること
- 髙橋さんから明示的に後続起票許可が出ていること
- v0.1 ルール本体に **trial 経由で大きな問題が見つからなかった** こと

trial の結果、v0.1 ルール本体に重大な問題が見つかった場合は、後続 IMPL-LIGHT ではなく `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`（v0.2 化）を先行させる判断もありうる。

---

## 9. 結論

- **PR #122 で設計した AI 非同期運用ルール v0.1 は main に反映済み**（squash commit `ea71e15`）。
- **今回は v0.1 の初回手動試験**（TRIAL-001）であり、自動化ではない。
- 本 trial PR 自体が v0.1 §6 Core 5 / Standard 11 / §10 ハンドオフ手順 / §11 Short Prompt 抑止 / §12 Blocked By を **実際に運用した最初の事例** となる。
- **PR テンプレ / Actions / Bot / API 連携には進まない**。これらは段階的導入計画（v0.1 §14 Phase 1〜5）に従い、別タスクで扱う。
- 本 trial の結果（観察ポイント §7）を見て、最初にテンプレ化・実ファイル化すべき項目を絞り、後続 `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` 等で扱う。
- **Ready 化 / merge / 危険操作は本 PR では行わない**。Draft のまま停止し、後続レビュー待ち。
