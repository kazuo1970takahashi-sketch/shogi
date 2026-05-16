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
  - 後続タスク（IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT / V0-2-REVIEW / REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT）の着手

---

## 1. 目的

- PR #122 で定義した **AI 非同期運用ルール v0.1** を前提にする。
- PR #123 trial-001 で得た観察を反映する（Review Access Fallback / cowork の GitHub 直読み制約 / fallback URL 別コメントの不十分性）。
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

### 3.1 Codex — 第一候補・独立レビュー担当

**位置づけ**：第一候補の独立レビュー担当。GitHub に対する読み取り能力が比較的安定。

**向いていること**：
- GitHub diff / repo / code の **直視レビュー**
- 実装ファイル・テストファイル・差分確認
- Must Fix / Should Fix / Nice to Have の **技術的判定**
- docs と実装の整合確認
- ロジック・セキュリティ・データ構造影響の評価

**注意**：
- **利用制限にかかることがある**（クォータ・レート制限・コンテキスト枯渇等）
- **常時使える前提にしない**
- 利用制限時の代替は cowork（§3.2）

### 3.2 cowork — Codex 利用制限時の代替 / 構造レビュー担当

**位置づけ**：Codex 利用制限時の代替レビュー担当、または構造レビュー担当。

**向いていること**：
- 貼付された **Review Material Pack の読解**
- **設計構造** の妥当性確認
- **論点整理**
- レビュー依頼文そのものの品質確認
- **読めた範囲 / 読めなかった範囲を留保してレビュー** すること

**注意**：
- GitHub diff / raw / patch / Files changed の **直接取得が不安定な場合がある**
- cowork には「PR を読んで」ではなく **「この素材パックを読んでレビューして」と渡す**
- 読めない範囲は **必ず留保させる**（レビュアー留保欄、§6）

### 3.3 ChatGPT 司令塔 — 結果整理・進行判断支援

**位置づけ**：レビュー結果整理・進行判断支援。

**向いていること**：
- Codex / cowork レビュー結果の整理
- Must Fix / Should Fix / Nice to Have の **再分類**
- **Ready 化 / merge の判断支援**（推奨判断 = `Recommended` 段階まで）
- Claude Code への依頼文作成（Full Prompt / Short Prompt）
- trial 観察結果の **後続タスク化**

**注意**：
- **final 決定権者ではない**（最終判断は髙橋さん）
- 髙橋さんの明示許可が必要な操作を **自律許可しない**（v0.1 §5.2 / §8 と整合）

### 3.4 役割マトリクス

| 観点 | Codex | cowork | ChatGPT 司令塔 |
|---|---|---|---|
| GitHub diff / raw / patch 直読み | ◎ | △（不安定） | △（補助） |
| 貼付素材のみでのレビュー | ○ | ◎ | ◎ |
| 技術的 Must Fix 検出 | ◎ | ○ | ○ |
| 構造的 Should Fix 検出 | ○ | ◎ | ◎ |
| Ready / merge 推奨判断 | ○ | ○ | ◎ |
| 利用安定性 | △（制限あり） | ◎ | ◎ |
| 第一推奨 | ◎ | fallback | 整理役 |

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

## 7. Codex-first / cowork-fallback 方針

### 7.1 標準方針

- **Codex が利用可能** な場合は **Codex-first**。
- **Codex が利用制限中、またはレビュー待ちが重い** 場合は **cowork-fallback**。
- cowork には **Review Material Pack を直接渡す**。
- cowork に **GitHub 直読みだけを期待しない**。
- cowork には **「読めない場合は読めないと明記して、貼付情報の範囲でレビューする」よう依頼** する。

### 7.2 判断フロー

```
1. PR を Draft で作成
2. Claude Code が RRD を PR コメントに投稿（Review Material Pack 同梱）
3. ChatGPT 司令塔がレビュー対象判定 → Codex / cowork のどちらに渡すか提案
4. 髙橋さんが Codex に渡す → 利用可なら Codex-first
   ├─ Codex 利用制限なし: Codex がレビュー → 判定返却
   └─ Codex 利用制限あり: 髙橋さんが cowork に渡す → cowork-fallback
5. cowork レビュー時は Review Material Pack を直接渡す（GitHub URL のみは渡さない）
6. cowork レビュー結果に「レビューの限界」「留保条件」が含まれることを確認
7. 必要に応じて Codex 利用可能時に上書きレビュー
8. ChatGPT 司令塔が結果整理 → Ready 化 / merge 推奨判断
```

### 7.3 v0.1 §3 役割定義との整合

v0.1 §3.4 Codex の役割（独立レビュー、Must Fix / Should Fix / Nice to Have 分類）と §3.5 cowork の役割（代替レビュー、Codex 不在時、構造レビュー）の差をより具体化したのが本方針。v0.1 §3 自体は変更しない（v0.2 検討時に組み込み候補）。

---

## 8. Review Request Draft テンプレ案

実際にコピーできるテンプレ案。**本 PR では `.github/PULL_REQUEST_TEMPLATE.md` 等の実ファイル化はしない**。docs 内に「テンプレ案」として記載するだけ。実ファイル化は後続 `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` で扱う。

### 8.1 標準テンプレ（コピー用）

```markdown
## Review Request Draft｜PR #<N>（<Task ID>）

> 以下は **髙橋さんがそのまま Codex / cowork に貼って渡せる粒度のレビュー依頼文** です。最小編集でレビュアー AI に渡してください。

---

### 宛先
Codex（第一候補）/ cowork（fallback）/ ChatGPT 司令塔（結果整理）

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
3. Claude Code 完了報告コメント
4. 必要に応じて observation log コメント
5. レビュアーのレビュー結果コメント（cowork / Codex / ChatGPT 司令塔）

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
- RESET-UX 後続実装
- 後続タスク着手（§11）

---

## 11. 後続タスク候補

| 候補 Task ID | 種別 | 概要 | 起票タイミング |
|---|---|---|---|
| **TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT** | impl-light | Claude Code 完了報告テンプレ / RRD コメント標準化 / Core 5・Standard 11 の記載場所整理 | 第一候補 |
| **TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT** | impl-light | docs 内テンプレ案（§8.1）を実運用テンプレに昇格、必要なら PR コメント用テンプレファイル化 | 本設計直後の第二候補 |
| **TOUR-OPS-AI-WORK-QUEUE-DESIGN** | docs-only | AI 作業台帳設計（`docs/ops/ai_work_queue.md`） | 第三候補 |
| **TOUR-OPS-PR-TEMPLATE-DESIGN** | docs-only | PR 本文テンプレ設計（`.github/PULL_REQUEST_TEMPLATE.md`） | 第四候補 |
| **TOUR-OPS-HANDOFF-FORMAT-DESIGN** | docs-only | HANDOFF.md §5.5 の記録形式標準化 | 第五候補 |
| **TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW** | docs-only | v0.1 + trial-001 + RRD design の観察結果を v0.2 に反映するか検討 | 観察期間後 |

**本 PR では上記すべて着手しない**。起票判断は髙橋さん（ChatGPT 司令塔が候補提示可）。

---

## 12. 結論

- **PR #123 trial-001 により、Review Request Draft の有効性と限界が明確化された**。
- **Codex-first / cowork-fallback 方針が妥当**（§3.4 役割マトリクス、§7 判断フロー）。
- **cowork には Review Material Pack を渡す必要がある**（§3.2、§4.4）。GitHub 直読み依存は脆い。
- **fallback URL を別コメントに置くだけでは不十分な場合がある**（§9.2、trial-001 §7.7 で実証）。
- **今後は Review Request Draft 本文に raw / patch / diff URL と主要抜粋を直接同梱する**（§4.4 Review Material Pack、§9.2 推奨）。
- **レビュアーが読めなかった範囲を明示する留保欄を標準化する**（§6、trial-001 §7.7 §7.8 から継承）。
- **今回は設計のみ**。テンプレ実ファイル化や自動化には進まない。実ファイル化は後続 `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` で trial を 1〜2 件追加で経たうえで扱う。

本設計は v0.1 ルール本体（PR #122）+ trial-001 観察（PR #123）の **3 つ目の積み上げ** として、後続 IMPL-LIGHT 系タスクへの **必須入力** となる。
