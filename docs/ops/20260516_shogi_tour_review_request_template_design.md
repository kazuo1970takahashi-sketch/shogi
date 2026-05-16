# SHOGI-TOUR｜Review Request Draft 標準設計（TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN）

**Task ID**: `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN`
**作業種別**: docs-only design / Review Request Draft 標準設計
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `44b49a9`（PR #123 squash merge 後の main = TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001）
**位置づけ**: PR #122 で main 投入した [AI 非同期運用ルール v0.1](20260516_shogi_tour_async_ai_workflow_v0_1.md)、および PR #123 で得た trial-001 観察結果（特に Review Access Fallback / Codex-first / cowork-fallback / Review Material Pack / レビュアー留保欄）を踏まえ、**Review Request Draft の標準構造** を docs-only で設計する。実ファイル化・自動化には進まない。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **前提となる main 反映済 PR**:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN（squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001（squash `44b49a9`）
- **非対象（今回 PR では実施しない）**:
  - `.github/PULL_REQUEST_TEMPLATE.md` 作成 / `.github/ISSUE_TEMPLATE/` 作成 / label 作成 / `docs/ops/ai_work_queue.md` 作成
  - GitHub Actions / Bot / API 連携
  - 自動レビュー依頼 / 自動 Ready 化 / 自動 merge
  - v0.1 ルール本体（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）改訂
  - trial-001 note（`docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md`）改訂
  - 実装ファイル / テスト / snapshot / workflow / package 系の一切の変更
  - RESET-UX 後続実装
  - 後続タスク（CLAUDE-CODE-REVIEWER-DESIGN / IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT / V0-2-REVIEW / REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT）の着手

---

## 1. 目的

- PR #122 で定義した **AI 非同期運用ルール v0.1** を前提にする。
- PR #123 trial-001 で得た観察を反映する（Review Access Fallback / cowork の GitHub 直読み制約 / fallback URL 別コメントの不十分性）。
- **PR #124 自身のレビュー試行（2026-05-16）で得た観察を反映する**：cowork は GitHub PR / commits / files / diff / patch / raw に安定アクセスできず、PR URL provenance 制約 / issuecomment 到達不能 / Chrome 未接続・JS 描画・cache 影響により、standard fallback reviewer として採用するには不安定。**Codex-primary / Claude Code Reviewer-secondary / ChatGPT-orchestrated** の現実路線に方針再整理（§3 / §7 改訂）。
- **Review Request Draft の標準構造** を定義する。
- 髙橋さんがレビュー依頼文をゼロから作らなくてもよい状態に近づける。
- Codex / cowork / ChatGPT 司令塔に渡せるレビュー素材を **PR コメント上に直接残す**。
- GitHub を読めないレビュアーでも、貼付情報ベースで一定範囲のレビューができるようにする。

---

## 2. 背景

### 2.1 これまでの運用

- Claude Code 完了報告を髙橋さんが ChatGPT に貼り、ChatGPT がレビュー依頼文を作り、それを髙橋さんが cowork / Codex に貼る、という流れ。
- すべての受け渡しに髙橋さんの手動コピペが介在。

### 2.2 PR #123 trial-001 で試したこと

- Review Request Draft（以下 RRD）を **PR コメント** に残す運用を初めて試した。
- RRD 自体は有効に機能し、コピペで cowork に渡せた。

### 2.3 PR #123 trial-001 で見えた制約

| 観察 | 影響 |
|---|---|
| cowork が GitHub の Files changed / diff / raw / patch を **安定して読めない** ことがある | 「読めた範囲では A / Go」の留保付きレビューになり、本文細部の Should Fix が漏れる可能性 |
| fallback URL を **別コメント** に残すだけでは、レビュアーがそのコメントに到達できない場合がある | 別コメント分離は弱い fallback |
| RRD 本文に直接 raw / patch / diff URL と主要抜粋を **同梱** する必要がある | RRD 本体が「素材パック」を兼ねるべき |
| レビュアーが **読めなかった範囲を明示する** 留保欄が必要 | A / Go と留保を両立させる標準形式が必要 |

### 2.4 本設計の意図

これら trial 観察を踏まえ、**RRD を「PR コメント」ではなく「Review Material Pack 同梱の素材パック」として標準化する**。これにより、cowork / Codex / ChatGPT のいずれが受け取っても、GitHub への直読み権限に依存せずレビューを開始できる。

---

## 3. レビュー担当 AI の役割分担

**注**：本章は PR #124 のレビュー試行を経て **2026-05-16 に大幅見直し** された。当初は「Codex-first / cowork-fallback」寄りで設計していたが、cowork の GitHub 直読み制約（PR URL provenance 制約、issuecomment 到達不能、diff/patch/raw 取得不安定、Chrome 未接続・JS 描画・cache 影響）により、cowork を **標準 fallback reviewer** とするのは不安定と判明。現実路線として **Codex-primary / Claude Code Reviewer-secondary / ChatGPT-orchestrated** に再整理する。

### 3.1 Codex — primary reviewer

**位置づけ**：primary reviewer。GitHub diff / repo 直視レビューの第一候補。

**向いていること**：
- GitHub diff / repo / code の **直視レビュー**
- 実装ファイル・テストファイル・差分確認
- Must Fix / Should Fix / Nice to Have の **技術的判定**
- docs と実装の整合確認
- ロジック・セキュリティ・データ構造影響の評価
- PR 全体の独立レビュー

**注意**：
- **利用制限にかかることがある**（クォータ・レート制限・コンテキスト枯渇等）
- **常時使える前提にしない**
- ただし **利用可能なら第一候補**
- 利用制限時の代替は Claude Code Reviewer（§3.2）。cowork は代替にしない（§3.5）

### 3.2 Claude Code Reviewer — secondary reviewer

**位置づけ**：secondary reviewer。Codex 利用制限時の代替候補。**GitHub diff / repo 確認が可能なレビューエージェント** として扱う。

**向いていること**：
- GitHub diff / repo / code の確認
- PR 差分レビュー
- docs-only PR の整合確認
- 実装 PR の変更箇所確認
- 関連ファイル確認
- review report 作成
- Must Fix / Should Fix / Nice to Have 分類

**注意（read-only review 原則）**：
- **Claude Code Implementer とは分離** する（§3.3）
- 実装した同一セッションでレビューしない
- 可能なら **別 Claude Code セッション / reviewer agent** として扱う
- **read-only review 原則**
- **commit / push / Ready 化 / merge / branch 削除 / 修正実行は禁止**
- 修正が必要な場合は **修正提案のみ返す**（review report / PR comment）
- Reviewer が直接修正せず、Implementer へ修正依頼を返す
- 実装者と同一コンテキストの場合は **独立性が弱い** ことを明記し、Codex 利用可能になり次第クロスチェック推奨

### 3.3 Claude Code Implementer — 実装・docs 更新担当

**位置づけ**：実装・docs 更新担当。本 PR を含む、これまでの Claude Code 作業はすべてこの役割。

**向いていること**：
- branch 作成
- docs / code 変更
- commit / push
- Draft PR 作成
- PR コメント投稿
- 完了報告作成

**注意**：
- **自分の PR を自己承認しない**
- Ready 化 / merge は **明示許可制**（v0.1 §5.2 / §8 / §11.2）
- レビュー担当（§3.2 Claude Code Reviewer）と **役割を分ける**
- Implementer が自分のレビューを Reviewer 役で兼任する場合、独立性が弱いことを明記する

### 3.4 ChatGPT 司令塔 — orchestration / PM / review result organizer

**位置づけ**：orchestration / PM / review result organizer。

**向いていること**：
- Codex / Claude Code Reviewer のレビュー結果整理
- Must Fix / Should Fix / Nice to Have の **再分類**
- **Ready 化 / merge の判断支援**（推奨判断 = `Recommended` 段階まで）
- Claude Code Implementer への **修正依頼文作成**（Full Prompt / Short Prompt）
- trial 観察結果の **後続タスク化**
- レビュー体制の **設計改善**

**注意**：
- **final 決定権者ではない**（最終判断は髙橋さん）
- 髙橋さんの明示許可が必要な操作を **自律許可しない**（v0.1 §5.2 / §8 と整合）

### 3.5 cowork — optional advisory reviewer

**位置づけ**：**optional advisory reviewer**。pasted-material reviewer。**標準 fallback reviewer ではない**。

**向いていること**：
- 貼付された **Review Material Pack の読解**
- **GitHub 直読み不要の文章レビュー**
- 設計構造の **壁打ち**
- 論点整理
- **セカンドオピニオン**

**注意**：
- **GitHub PR レビューの標準経路には入れない**
- **Codex / Claude Code Reviewer の代替とは扱わない**
- GitHub diff / raw / patch / Files changed の **直接取得を期待しない**
- cowork に依頼する場合は、**RRD 本文や主要セクションをチャットに貼付** する（PR コメント参照ではなく、本文を直接渡す）
- cowork レビューは **補助意見** として扱う
- PR #123 / PR #124 のレビュー試行で判明した cowork の制約（PR URL provenance 制約、issuecomment 到達不能、diff/patch/raw 取得不安定）は標準 fallback として採用不可な水準

### 3.6 Grok — not used / excluded

**位置づけ**：**現時点では標準レビュー経路に含めない**。

**注意**：
- PR レビュー運用の前提にしない
- 必要が出た時点で別途検討。本設計のスコープ外。

### 3.7 役割マトリクス（2026-05-16 改訂版）

| 観点 | Codex | Claude Code Reviewer | ChatGPT 司令塔 | cowork | Grok |
|---|---|---|---|---|---|
| 位置づけ | **primary** | **secondary**（Codex 制限時） | orchestration | optional advisory only | excluded |
| GitHub diff / raw / patch 直読み | ◎ | ◎ | △（補助） | × | — |
| 貼付素材のみでのレビュー | ○ | ○ | ◎ | ◎ | — |
| 技術的 Must Fix 検出 | ◎ | ○ | ○ | △ | — |
| 構造的 Should Fix 検出 | ○ | ○ | ◎ | ◎ | — |
| Ready / merge 推奨判断 | ○ | ○ | ◎ | △ | — |
| 利用安定性 | △（制限あり） | ◎ | ◎ | ◎ | — |
| Implementer / Reviewer 独立性 | ◎（外部） | △（要セッション分離） | ◎ | ◎ | — |
| commit / push / Ready / merge | × | **×（read-only）** | × | × | — |
| 標準経路 | ◎ | ◎ | ◎ | × | × |

---

## 4. Review Request Draft 標準構造

RRD は以下 4 ブロック構成。**すべて PR コメント本文に直接同梱** する（別コメント分離は §9 で論じる通り弱い fallback）。

### 4.1 ヘッダー（必須）

| 項目 | 例 |
|---|---|
| Project | SHOGI-TOUR |
| Repo | kazuo1970takahashi-sketch/shogi |
| Task ID | `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN` |
| PR 番号 | #124 |
| Branch | `docs/tour-ops-review-request-template-design` |
| Base | `main`（`44b49a9` 等、PR #123 squash 後） |
| head SHA | 短縮 + 完全形（例：`abc1234` / `abc1234567890...`） |
| 作業種別 | docs-only design / docs-only trial / IMPL-LIGHT / IMPL-MEDIUM 等 |
| Risk Level | Level 0〜5（v0.1 §7） |
| Current Status | Draft / Ready Done / Merged 等（v0.1 §5.1） |

### 4.2 参照 URL（必須）

| 項目 | 例 |
|---|---|
| PR URL | `https://github.com/<owner>/<repo>/pull/<n>` |
| PR diff URL | `https://github.com/<owner>/<repo>/pull/<n>.diff` |
| PR patch URL | `https://github.com/<owner>/<repo>/pull/<n>.patch` |
| commit 固定 raw URL（主要変更ファイル毎） | `https://raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/<path>` |
| 主要変更ファイルのリポジトリ内パス | `docs/ops/20260516_shogi_tour_review_request_template_design.md` |
| commit URL | `https://github.com/<owner>/<repo>/commit/<sha>` |
| PR comments URL（必要に応じて） | `https://github.com/<owner>/<repo>/pull/<n>#issuecomment-<id>` |

**重要な原則**：
- **raw URL は branch 名（`main` 等）ではなく commit SHA 固定** が望ましい。branch ベースだと後続 commit で内容が変動し、レビュー時点の状態を再現できなくなる。
- **diff / patch / raw が読めないレビュアーがいる前提** で設計する。URL を載せるのは「読めるなら使ってもらう」用途であって、それだけに依存しない。

### 4.3 変更ファイル一覧（必須）

| 項目 | 説明 |
|---|---|
| changed files | パス + 行数 + ADDED / MODIFIED / DELETED |
| docs-only かどうか | yes / no |
| 変更していない重要ファイル | 例：`shogi_v4.html` 未変更 / `test/` 未変更 / snapshot 未変更 / workflow 未変更 / `package*.json` 未変更 / v0.1 ルール本体未変更 / PR template / Issue template / label / `ai_work_queue.md` 未作成・未変更 |

「変更していない重要ファイル」の明示は、レビュアーが diff を読めない場合に **「何が触られていないか」を貼付情報だけで確認させる** ための補助情報として機能する。

### 4.4 Review Material Pack（必須、本設計の核）

RRD 本文に **直接含めるべき素材**。別コメント分離は禁止（§9）。

#### 共通必須項目

- **変更内容の要約**（3〜5 行）
- **主要セクションの本文抜粋**（docs / コード問わず、レビュー判断に必要な範囲）
- **重要な追加・変更箇所の説明**
- **レビュー判断に必要な前提**（関連 PR / 関連 commit / 仕様メモへのリンク）
- **完了報告の要約**
- **Core 5**（v0.1 §6.1 — Next Action / Next Owner / Blocked By / Allowed Without Human Approval / Requires Human Approval）
- **Standard 11**（v0.1 §6.2 — Task ID / PR / Branch / Commit SHA / Current Status / Forbidden Actions / Changed Files / Tests / Risk Level / Review Needed / Handoff URL）
- **Blocked By**（v0.1 §12 分類から選択）
- **Allowed Without Human Approval**
- **Requires Human Approval**
- **Forbidden Actions**
- **後続タスク未着手の確認**

#### docs-only PR の場合（追加）

- 新規 docs の **章立て**
- **重要セクションの本文抜粋**（Review Material Pack 本体）
- **観察結果・判断理由**
- **後続タスク候補**
- **今回やらないこと**

#### 実装 PR の場合（追加）

- **変更関数 / 変更箇所**（ファイル:行番号）
- **影響範囲**（呼出元、データ依存、UI 影響）
- **テスト結果**（unit / E2E / VRT）
- **セキュリティ影響**
- **データ構造影響**（state schema / localStorage / master data 等）
- **rollback / correction 影響**

### 4.5 レビュー観点（必須）

標準観点（PR 種別に応じて取捨選択）：

- **スコープ厳守**：依頼書記載のスコープを越えていないか
- **docs-only / 実装変更の整合**：作業種別と実 diff が一致するか
- **v0.1 ルールとの整合**：Core 5 / Standard 11 / Blocked By / 危険操作の扱いが v0.1 と矛盾しないか
- **Core 5 / Standard 11 の妥当性**：5 / 11 欄が形骸化していないか
- **Blocked By の明確さ**：v0.1 §12 分類から選択され、解除条件が読める状態か
- **Allowed Without Human Approval / Requires Human Approval の明確さ**
- **危険操作の未実行確認**：Ready / merge / release / deploy / publish / branch 削除 / VRT snapshot 更新 / workflow 変更 / token 操作 等が実行されていないか
- **後続タスク未着手確認**
- **Ready 化してよいか**（Ready Recommended 判定）
- **merge 前修正が必要か**（Merge Recommended 判定）
- **再レビューが必要か**（Should Fix 反映後の上書きレビュー要否）

### 4.6 Must Fix / Should Fix / Nice to Have 基準（必須）

#### Must Fix（merge blocker、本 PR で必ず直す）

- **危険操作の実行または許可誤読**
- **docs-only スコープ違反**（実装ファイル変更等）
- **v0.1 ルールとの矛盾**
- **Ready / merge の自律実行につながる記述**
- **token / secret / credential / branch protection / workflow 等への不適切変更**
- **主要ファイル本文がまったく確認できず、レビュー不能な状態**
- **レビュー依頼文が対象 PR と不一致**

#### Should Fix（merge blocker ではないが直した方がよい）

- Next Owner が連鎖しすぎている（4 段以上の手数）
- Core 5 / Standard 11 が重複しすぎている
- fallback URL が不足（raw URL の commit SHA 固定漏れ、patch URL 不掲載等）
- Review Material Pack が薄い（主要セクション抜粋なし、要約のみ等）
- 観察結果の記録先が不明（trial note / HANDOFF / observation log のどこに残るか不明）
- レビュアーの留保条件が不明（読めなかった範囲の明示がない）
- Ready / merge 判断の根拠が弱い

#### Nice to Have（v0.2 / 後続 IMPL-LIGHT で扱う）

- 状態遷移図（mermaid 等）
- observation log の専用ファイル化
- mermaid 図
- 後続タスク依存図
- テンプレ実ファイル化（`.github/PULL_REQUEST_TEMPLATE.md` 等）
- `ai_work_queue.md` 連携
- label / Issue template 連携

---

## 5. GitHub が読めない場合の fallback 方針

PR #123 trial-001 で得た最重要観察に基づく方針：

### 5.1 基本原則

- レビュアーが GitHub diff / raw / patch を読めない場合がある。
- その場合、**Review Request Draft 本文に含まれる Review Material Pack を一次情報としてレビューしてよい**。
- ただし、**読めなかった範囲は必ず明示** する（§6 レビュアー留保欄）。
- 「読めたもの」「読めなかったもの」「所与として扱ったもの」「留保する判断」を **レビュー結果に含める**。
- 全文確認できていない場合は **A / Go でも「留保付き」と明記** する。
- **GitHub 接続失敗そのものも trial / observation log の対象** にする（trial-001 §7.7 のパターン継承）。

### 5.2 fallback の階層

| 段階 | 一次情報 | 適用条件 |
|---|---|---|
| **L0：通常レビュー** | GitHub diff + raw URL + Files changed + Review Material Pack | レビュアーが GitHub に直接アクセスできる場合 |
| **L1：素材パック中心** | Review Material Pack（RRD 本文） + commit SHA 固定 raw URL | diff / Files changed が読めない場合 |
| **L2：抜粋ベース** | Review Material Pack（RRD 本文）に同梱された主要セクション抜粋のみ | raw / patch URL も読めない場合 |
| **L3：留保付き** | 上記 L2 + 「読めなかった範囲」の明示 | 全文確認不能でも A / Go / B+ / No Go を判定する必要がある場合 |

trial-001 で cowork が採った判定（「読めた範囲では A / Go、本文細部は留保」）は **L2〜L3 段階の標準形** として今後採用する。

---

## 6. レビュアー留保欄の標準化

レビュー依頼文に、レビュアーへ以下を求める欄を設ける。

### 6.1 レビュアーへの依頼（必須欄）

- **確認できたもの**
- **確認できなかったもの**
- **直接読めた一次情報**（PR 本文 / コメント / diff / raw / Files changed のうちどれか）
- **貼付情報として読んだもの**（Review Material Pack 本文）
- **所与として扱ったもの**（Standard 11 の Task ID / Branch / Commit SHA 等、確認手段がない場合）
- **判断の留保**
- **追加確認が必要なもの**

### 6.2 レビュー結果に含める標準欄

レビュアーが返すレビュー結果には以下の標準セクションを含める：

- **「レビューの限界」**：使用ツールの制約、読めなかった URL、provenance 外として除外したもの
- **「未確認範囲」**：trial note 本体細部 / 関連ファイル / 過去 PR の context 等
- **「留保条件」**：「raw URL `<sha>` 経由で本文確認できれば上書きレビュー可」「Codex 利用可能になれば再レビュー推奨」等
- **「追加確認推奨」**：次回レビュー時または別レビュアーに引き継ぐべき確認項目

### 6.3 trial-001 で得られた具体例

PR #123 cowork レビューで実際に採られた留保表明：

- **判定**：A / Go（読めた範囲では Must Fix なし）
- **レビューの限界**：trial note 本体 249 行を直接取得できなかった
- **留保条件**：trial note 本体を fetch 可能な URL（patch-diff URL / raw URL）で提示できれば上書きレビュー可能
- **追加確認推奨**：本文細部の Should Fix の有無

この **判定 + 留保 + 上書き条件** の 3 点セットを、後続 RRD テンプレで **Reviewer 留保表明の標準形式** として採用する。

---

## 7. Codex-primary / Claude Code-secondary / ChatGPT-orchestrated review 方針

**注**：本章は PR #124 のレビュー試行を経て **2026-05-16 に大幅改訂** された。当初は「Codex-first / cowork-fallback」だったが、cowork の GitHub 直読み制約により standard fallback としては不安定と判明したため、現実路線として **Codex-primary / Claude Code Reviewer-secondary / ChatGPT-orchestrated** に変更する。cowork は optional advisory only、Grok は標準経路から除外（§3.5 / §3.6）。

### 7.1 標準方針

- **Codex が利用可能** な場合は **Codex-primary**。
- **Codex が利用制限中、またはレビュー待ちが重い** 場合は **Claude Code Reviewer-secondary**（§3.2、read-only review、Implementer と分離）。
- **ChatGPT 司令塔** が Codex / Claude Code Reviewer のレビュー結果を整理し、Ready / merge 推奨判断を支援する。
- **cowork** は optional advisory only。GitHub URL を読ませない。RRD 本文や主要セクションをチャットに貼付して補助意見を求める。
- **Grok** は今回の標準経路から除外。

### 7.2 リスクレベル別の標準レビュー経路

| Level | 種別例 | 標準レビュー経路 | cowork | Grok |
|---|---|---|---|---|
| **Level 0** | 記録・整理 docs | ChatGPT 司令塔レビューで進行可。必要なら Claude Code Reviewer。Codex 利用可ならば Codex も可。 | 任意補助のみ | 除外 |
| **Level 1** | docs-only design / trial | **Codex-primary**。Codex 制限時は **Claude Code Reviewer-secondary**。ChatGPT 司令塔が結果整理。 | 標準経路に含めない | 除外 |
| **Level 2** | IMPL-LIGHT（文言 1 行 / テスト期待値 1〜2 行 / VRT 影響なし） | **Codex-primary**。Codex 制限時は **Claude Code Reviewer-secondary**。**Implementer と Reviewer を分離**。ChatGPT 司令塔が結果整理。 | 代替不可 | 除外 |
| **Level 3 以上** | UX 導線 / ロジック / データ / セキュリティ影響 | **Codex または Claude Code Reviewer の独立レビュー必須**。両方使えない場合は **原則待つ**。**人間判断必須**。 | 代替不可 | 除外 |

### 7.3 判断フロー（2026-05-16 改訂版）

```
1. PR を Draft で作成
2. Claude Code Implementer が RRD を PR コメントに投稿（Review Material Pack 同梱）
3. ChatGPT 司令塔がレビュー対象判定 → Codex 利用可否 + Level 別経路を提案
4. 髙橋さんが Codex に渡す
   ├─ Codex 利用可: Codex がレビュー → 判定返却（primary review）
   └─ Codex 利用制限あり: 髙橋さんが Claude Code Reviewer agent に渡す
       └─ Claude Code Reviewer が read-only review → review report 返却（secondary review）
          - Implementer 同一セッションは独立性が弱いため、可能なら別 reviewer agent で実行
          - 修正は Reviewer が直接行わず、Implementer へ修正提案を返す
5. 必要に応じて cowork に optional advisory を求める（RRD 本文をチャットに貼付、補助意見のみ）
6. ChatGPT 司令塔が結果整理 → Must Fix / Should Fix / Nice to Have 再分類 → Ready / merge 推奨判断
7. 髙橋さん明示許可 → Ready 化（Ready Execution Approved 段階）
8. 必要なら Codex 利用可能時に上書きレビュー、または別 reviewer agent でクロスチェック
```

### 7.4 Implementer / Reviewer 分離原則

**重要**：Claude Code は本設計において **2 つの役割** を持つ：

- **Claude Code Implementer**（§3.3）：実装・docs 更新・commit / push・Draft PR 作成・完了報告
- **Claude Code Reviewer**（§3.2）：read-only review・PR diff 確認・review report 作成（修正実行禁止）

**両役割は同一セッションで兼任しない** ことが望ましい。同一セッションで兼任せざるを得ない場合は「独立性が弱い」と明記し、Codex 利用可能時にクロスチェックを推奨する。

### 7.5 v0.1 §3 役割定義との整合

v0.1 §3.4 Codex の役割（独立レビュー、Must Fix / Should Fix / Nice to Have 分類）と §3.5 cowork の役割は **v0.1 設計時点での想定**。PR #123 / PR #124 の trial を経て、cowork は standard fallback としては不安定と判明したため、本設計で Claude Code Reviewer-secondary を追加した。v0.1 §3 自体は本 PR では変更しない（v0.2 検討時に組み込み候補、後続 `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`）。

---

## 8. Review Request Draft テンプレ案

実際にコピーできるテンプレ案。**本 PR では `.github/PULL_REQUEST_TEMPLATE.md` 等の実ファイル化はしない**。docs 内に「テンプレ案」として記載するだけ。実ファイル化は後続 `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` で扱う。

### 8.1 標準テンプレ（コピー用）

```markdown
## Review Request Draft｜PR #<N>（<Task ID>）

> 以下は **髙橋さんがそのまま Codex / Claude Code Reviewer に貼って渡せる粒度のレビュー依頼文** です。最小編集でレビュアー AI に渡してください。

---

### Review target AI（2026-05-16 改訂版）

- **Codex** — primary reviewer（利用可能なら第一候補）
- **Claude Code Reviewer** — secondary reviewer（Codex 利用制限時、read-only review）
- **ChatGPT 司令塔** — orchestration（結果整理、Ready / merge 推奨判断）
- **cowork** — **optional advisory only**（GitHub 直読みを期待しない、補助意見・論点整理のみ）
- **Grok** — **excluded / not used**（標準レビュー経路から除外）

### 対象 PR
- **Project**: SHOGI-TOUR
- **Repo**: kazuo1970takahashi-sketch/shogi
- **Task ID**: `<TASK-ID>`
- **PR**: #<N>
- **Branch**: `<branch>`
- **Base**: `main`（`<base-sha>`）
- **head SHA**: `<head-sha>`
- **作業種別**: <docs-only design / IMPL-LIGHT 等>
- **Risk Level**: Level <0-5>
- **Current Status**: Draft

### 目的
<1〜3 行で本 PR の目的を要約>

### 前提
- 関連 PR：<PR #122 等、main 反映済の関連 PR>
- 関連設計：<docs/ops/... 等>
- 関連観察：<trial note 等>

### 参照 URL（読めるなら使ってください、読めない場合は §Review Material Pack を一次情報に）
- **PR URL**：https://github.com/kazuo1970takahashi-sketch/shogi/pull/<N>
- **PR diff URL**：https://github.com/kazuo1970takahashi-sketch/shogi/pull/<N>.diff
- **PR patch URL**：https://github.com/kazuo1970takahashi-sketch/shogi/pull/<N>.patch
- **commit URL**：https://github.com/kazuo1970takahashi-sketch/shogi/commit/<head-sha>
- **主要変更ファイル raw URL（commit SHA 固定）**：
  - `<file path>`: https://raw.githubusercontent.com/kazuo1970takahashi-sketch/shogi/<head-sha>/<file path>

### 変更ファイル
- `<path>` （ADDED, +<n> 行）
- `<path>` （MODIFIED, +<n>/-<n> 行）

### 変更していない重要ファイル
- `shogi_v4.html` 未変更
- `test/` / `test/e2e/` 未変更
- snapshot 未変更 / workflow 未変更 / `package*.json` / lockfile / `playwright.config.js` 未変更
- v0.1 ルール本体（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）未変更
- PR template / Issue template / label / `ai_work_queue.md` 未作成・未変更

### Review Material Pack（本文を直接読む素材）

#### 変更内容の要約
<3〜5 行>

#### 主要セクション抜粋
<docs 章立て + 重要セクションの本文抜粋>
<コードの場合：変更関数 / 影響範囲 / テスト結果>

#### 完了報告の要約
<Claude Code 完了報告のサマリ>

### Core 5（v0.1 §6.1 — 省略不可）
- **Next Action**: <次に実行すべき具体的アクション>
- **Next Owner**: <次に動くべき AI / 人間>
- **Blocked By**: <v0.1 §12 分類から選択>
- **Allowed Without Human Approval**: <人間承認なしで進めて良い範囲>
- **Requires Human Approval**: <人間承認が必要な操作>

### Standard 11（v0.1 §6.2）
- Task ID / PR / Branch / Commit SHA / Current Status / Forbidden Actions / Changed Files / Tests / Risk Level / Review Needed / Handoff URL

### Forbidden Actions
<本 PR で禁止されている操作リスト>

### レビュー観点（6〜10 項目）
1. スコープ厳守
2. docs-only / 実装変更の整合
3. v0.1 ルールとの整合
4. Core 5 / Standard 11 の妥当性
5. Blocked By / Allowed Without / Requires Human Approval の明確さ
6. 危険操作の未実行確認
7. 後続タスク未着手確認
8. Ready 化してよいか
9. merge 前修正が必要か
10. 再レビューが必要か

### 判定基準
- **A / Go**：Must Fix なし、Should Fix なし、または Should Fix があっても merge blocker でない
- **B+ / Conditional Go**：Must Fix なし、Should Fix あり。Must Fix は不要だが Should Fix を反映してから Ready 化を推奨
- **No Go**：Must Fix あり、または設計そのものに問題あり

### Must Fix / Should Fix / Nice to Have 基準
<§4.6 の基準をそのまま転記または要約>

### GitHub が読めない場合の fallback（必読）
- diff / Files changed / raw URL が読めない場合は、**本 RRD §Review Material Pack を一次情報として** レビューしてください
- 読めなかった範囲は必ず明示してください
- 全文確認できていない場合は A / Go でも「留保付き」と明記してください
- 詳細：v0.1 §11.2 / TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN §5

### レビュアー留保欄（必須）
レビュー結果に以下を含めてください：
- **判定**：A / Go / B+ / Conditional Go / No Go
- **レビューの限界**：使用ツールの制約、読めなかった URL、provenance 外として除外したもの
- **未確認範囲**：本文細部 / 関連ファイル / 過去 PR の context 等
- **留保条件**：「<どの素材が読めれば> 上書きレビュー可」
- **追加確認推奨**：次回レビュー時または別レビュアーに引き継ぐべき確認項目

### Ready / Merge 判断依頼
- Ready 化してよいか（Ready Recommended）：可 / 条件付き可 / 不可
- merge 可否（Merge Recommended）：可 / 条件付き可 / 不可
- 実行は髙橋さん明示許可後（v0.1 §5.2 / §11.2）。本判定は **推奨判断のみ**。

### Claude Code Reviewer に渡す場合の注意（secondary review、§3.2 / §7.4 参照）
- このレビューは **read-only review**
- **commit / push / Ready 化 / merge / branch 削除 は禁止**
- 修正が必要な場合は **修正提案のみ返す**（review report / PR comment）
- 実装者（Implementer）と同一セッションの場合は **独立性が弱い** ため、可能なら別 reviewer agent / 別 Claude Code セッションで行う
- Review report には **Must Fix / Should Fix / Nice to Have** と **A / Go ／ B+ / Conditional Go ／ No Go** を含める

### cowork に渡す場合の注意（optional advisory only、§3.5 参照）
- GitHub URL を読ませる前提にしない
- **RRD 本文・主要セクション・Review Material Pack を貼付** する（PR コメント参照ではなく、チャットに直接貼る）
- **読めた範囲 / 読めなかった範囲 / 所与として扱った範囲** を明記させる
- cowork レビューは **補助意見** であり、Codex / Claude Code Reviewer の **代替ではない**

### Grok に渡す場合
- 現時点では **渡さない**（標準レビュー経路から除外、§3.6）
```

### 8.2 テンプレ管理

- 本 §8.1 のテンプレ案は **docs 内記載のみ**。
- `.github/PULL_REQUEST_TEMPLATE.md` 等への実ファイル化は **後続 `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT`** で扱う。
- 実ファイル化時には trial / observation を 1〜2 件追加で経たうえで反映する（trial-001 で見えた制約が再現するかの確認込み）。

---

## 9. PR コメント運用案

RRD をどこに置くべきかの整理。

### 9.1 論点

| 場所 | 用途 | RRD を置くか |
|---|---|---|
| **PR 本文** | スコープと状態管理（Core 5 / Standard 11 / 変更ファイル / 禁止事項） | △（要約のみ） |
| **PR コメント（RRD 専用）** | レビュアー向け素材パック（Review Material Pack 同梱） | ◎（本設計の推奨） |
| **PR コメント（完了報告）** | 実行記録（Claude Code 完了報告） | △（補助情報のみ） |
| **PR コメント（Review Access Fallback、別）** | fallback URL のみを別出し | × **trial-001 で弱いと判明** |
| **observation log（必要に応じて別コメント）** | trial / 観察結果の記録 | △（必要時のみ） |

### 9.2 PR #123 観察を踏まえた推奨

trial-001 §7.7 / §7.8 で確認した「fallback URL を別コメントに分離するだけでは弱い」事実を踏まえ：

- **RRD 本文に fallback URL / raw URL / patch URL / 主要抜粋を直接同梱する**（§4.4 Review Material Pack）。
- **別コメントに分離するだけでは弱い**。RRD を読んだレビュアーが別コメントまで遡らないと対象本文に到達できない構造は避ける。
- PR 本文 は **スコープと状態管理に専念**（Core 5 / Standard 11 / Forbidden Actions / 変更ファイル / 後続タスク未着手）。
- RRD コメント は **レビュアー向け素材パック**（Review Material Pack 同梱）。
- 完了報告コメント は **実行記録**（Claude Code が何をしたかのログ）。
- observation log は **必要に応じて別コメント**（trial PR では §7.7 のような新規観察を記録するため有用）。

### 9.3 コメント順序の推奨

1. PR 本文（スコープ + Core 5 + Standard 11 + Forbidden Actions）
2. **RRD コメント（Review Material Pack 同梱）**
3. Claude Code Implementer 完了報告コメント
4. 必要に応じて observation log コメント
5. レビュアーのレビュー結果コメント（Codex / Claude Code Reviewer / ChatGPT 司令塔）

### 9.4 レビュアー別の PR コメント取り回し（2026-05-16 改訂版）

| レビュアー | PR コメント参照 | RRD 本文をチャットに貼る必要 | Human Copy/Paste 負担 |
|---|---|---|---|
| **Codex** | ◎（PR URL から直接取得可能） | 通常不要 | 軽（URL のみ渡す） |
| **Claude Code Reviewer** | ◎（PR URL から直接取得可能、§3.2） | 通常不要 | 軽（URL のみ渡す） |
| **ChatGPT 司令塔** | △（補助、URL もしくは本文貼付） | 場合による | 中 |
| **cowork**（optional advisory only） | × **PR URL を読ませない**（§3.5） | **必須**（RRD 本文・主要セクションをチャットに貼付） | 重（本文丸ごと貼付） |
| **Grok** | — | — | 除外 |

### 9.5 Phase 1 で Human Copy/Paste は完全には消えない

- **Phase 1 では Human Copy/Paste は完全には消えない**。
- ただし、コピペ対象は **ChatGPT が毎回作る依頼文ではなく、Claude Code Implementer が生成済みの RRD 本文** になる。
- これにより「**考えて作る負担**」は減るが、「**運ぶ負担**」は残る。
- 特に cowork に渡す場合は RRD 本文の丸ごと貼付が必要となる（§3.5 / §9.4）。
- Codex / Claude Code Reviewer は PR URL から直接読み取れるため、運ぶ負担も軽い。
- **完全削減は Phase 2 以降の GitHub 連携・Bot/API 等の検討対象**（v0.1 §14 Phase 5）。本設計のスコープ外。

---

## 10. 今回やらないこと

- **`.github/PULL_REQUEST_TEMPLATE.md` 等の実ファイル化**（後続 `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT`）
- `.github/ISSUE_TEMPLATE/` 作成
- label 作成（`ai:review-waiting` / `risk:light` 等）
- `docs/ops/ai_work_queue.md` 作成
- GitHub Actions 変更
- Bot 実装 / API 連携
- 自動レビュー依頼 / 自動 Ready 化 / 自動 merge
- branch 削除
- release / deploy / publish
- 実装変更（`shogi_v4.html` 等）
- テスト変更（`test/` / `test/e2e/`）
- snapshot 変更
- **v0.1 ルール本体改訂**（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）
- **trial-001 note 改訂**（`docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md`）
- **Claude Code Reviewer agent 専用設計の本格化**（後続 `TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN`、本 §3.2 / §7.4 では位置づけのみ示し、実運用フロー / review report template / 禁止事項詳細 / 評価基準は別 design で扱う）
- **Grok の標準経路組み込み検討**（本設計のスコープ外）
- RESET-UX 後続実装
- 後続タスク着手（§11）

---

## 11. 後続タスク候補

| 候補 Task ID | 種別 | 概要 | 起票タイミング |
|---|---|---|---|
| **TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN** | docs-only | Claude Code Reviewer agent の役割・制約・read-only review 運用を設計（Implementer / Reviewer 分離、review report template、禁止事項、GitHub PR レビュー手順） | **新規・第一候補**（本設計で追加された secondary reviewer の運用標準化） |
| **TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT** | impl-light | Claude Code 完了報告テンプレ / RRD コメント標準化 / Core 5・Standard 11 の記載場所整理 / **Claude Code Reviewer secondary 運用の標準化** / **RRD の Claude Code Reviewer 向け拡張** | 第二候補 |
| **TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT** | impl-light | docs 内テンプレ案（§8.1）を実運用テンプレに昇格、必要なら PR コメント用テンプレファイル化 | 第三候補 |
| **TOUR-OPS-AI-WORK-QUEUE-DESIGN** | docs-only | AI 作業台帳設計（`docs/ops/ai_work_queue.md`） | 第四候補 |
| **TOUR-OPS-PR-TEMPLATE-DESIGN** | docs-only | PR 本文テンプレ設計（`.github/PULL_REQUEST_TEMPLATE.md`） | 第五候補 |
| **TOUR-OPS-HANDOFF-FORMAT-DESIGN** | docs-only | HANDOFF.md §5.5 の記録形式標準化 | 第六候補 |
| **TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW** | docs-only | v0.1 + trial-001 + RRD design の観察結果を v0.2 に反映するか検討（cowork を standard fallback から optional advisory へ降格、Claude Code Reviewer secondary 追加、Grok 除外 の 3 件を v0.1 §3 に組み込み検討） | 観察期間後 |

**本 PR では上記すべて着手しない**。起票判断は髙橋さん（ChatGPT 司令塔が候補提示可）。

---

## 12. 結論（2026-05-16 改訂版）

- **PR #123 trial-001** により、Review Request Draft の有効性と限界が明確化された。
- **PR #124 のレビュー試行** により、**cowork を standard fallback reviewer にするのは不安定** と判明した（PR URL provenance 制約、issuecomment 到達不能、diff/patch/raw 取得不安定、Chrome 未接続・JS 描画・cache 影響）。
- **Codex-primary を維持** する（§3.1）。GitHub diff / repo 直視レビューの第一候補。
- **Codex 制限時の有力な second reviewer として Claude Code Reviewer を位置づける**（§3.2、read-only review、Implementer と分離）。**新規追加**。
- **ChatGPT 司令塔が orchestration とレビュー結果整理を担う**（§3.4）。
- **cowork は optional advisory reviewer として限定利用** する（§3.5）。GitHub PR レビューの標準経路から外す。貼付本文ベースの補助意見・論点整理に限定。
- **Grok は今回の標準レビュー経路から外す**（§3.6）。
- **Review Material Pack は引き続き有効**（§4.4）。docs-only PR / 実装 PR それぞれで必須項目を定義。
- **RRD 本文への raw / patch / diff URL と主要抜粋の直接同梱は継続**（§4.2 / §9.2）。
- **レビュアー留保欄の標準化を継続**（§6、trial-001 cowork の判定 + 留保 + 上書き条件 3 点セットを採用）。
- **Phase 1 では Human Copy/Paste は残る**（§9.5）。ただし、コピペ対象は ChatGPT が毎回作る依頼文ではなく、Claude Code Implementer が生成済みの RRD 本文になり、「考えて作る負担」は減るが「運ぶ負担」は残る。Codex / Claude Code Reviewer は PR URL から直接読めるため運ぶ負担も軽い。cowork に渡す場合のみ本文貼付が必要。完全削減は Phase 2+ の GitHub 連携・Bot / API 検討対象（v0.1 §14 Phase 5）。
- **今回は設計のみ**。テンプレ実ファイル化や自動化には進まない。実ファイル化は後続 `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` / `TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN` で扱う。

本設計は v0.1 ルール本体（PR #122）+ trial-001 観察（PR #123）+ PR #124 レビュー試行 の **3 つの積み上げ + 1 つのレビュー体制再整理** として、後続 IMPL-LIGHT 系タスクへの **必須入力** となる。
