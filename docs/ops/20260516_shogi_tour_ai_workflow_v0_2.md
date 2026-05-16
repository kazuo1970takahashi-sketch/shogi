# SHOGI-TOUR｜AI 非同期運用ルール v0.2 Draft（TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT）

**Task ID**: `TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT`
**作業種別**: docs-only / v0.2 本文ドラフト作成
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `7b51d28`（PR #132 squash merge 後の main = TOUR-OPS-ACTION-REQUEST-TRIAL-001）
**状態**: **Draft**（v0.2 本文の **ドラフト** であり、正式採用までは v0.1 本体を置き換えない）

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **v0.1 本体（履歴資料として残す、本 Draft では置き換えない）**:
  - `docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`（PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122)）
- **v0.2 化判断（PR #130 v0.2 review note）**:
  - `docs/ops/20260516_shogi_tour_ai_workflow_v0_2_review.md`（案 B 推奨だったが、PR #131 軽量テンプレ集 + PR #132 branch 削除 trial + AR-BRANCH-DELETE-PHASE1-BATCH-001 実行結果が揃ったため、本 Draft で統合に進む）
- **前提となる main 反映済 PR**（v0.2 統合対象）:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN（v0.1 本体、squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001（v0.1 trial、squash `44b49a9`）
  - PR [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) — TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN（RRD 標準設計、squash `84f6724`）
  - PR [#125](https://github.com/kazuo1970takahashi-sketch/shogi/pull/125) — TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN（Reviewer 運用設計、squash `20c0a71`）
  - PR [#126](https://github.com/kazuo1970takahashi-sketch/shogi/pull/126) — TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001（Reviewer trial、squash `f989514`）
  - PR [#127](https://github.com/kazuo1970takahashi-sketch/shogi/pull/127) — TOUR-OPS-ACTION-REQUEST-DESIGN（Action Request 標準設計、squash `541feb2`）
  - PR [#128](https://github.com/kazuo1970takahashi-sketch/shogi/pull/128) — TOUR-OPS-AI-TASK-CANDIDATE-DESIGN（Task Candidate 標準設計、squash `f15793a`）
  - PR [#129](https://github.com/kazuo1970takahashi-sketch/shogi/pull/129) — TOUR-OPS-AI-TASK-CANDIDATE-TRIAL-001（Candidate trial、squash `32a3ab2`）
  - PR [#130](https://github.com/kazuo1970takahashi-sketch/shogi/pull/130) — TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW（Phase 1 総括、squash `ae11cd3`）
  - PR [#131](https://github.com/kazuo1970takahashi-sketch/shogi/pull/131) — TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT（軽量テンプレ集、squash `926ef60`）
  - PR [#132](https://github.com/kazuo1970takahashi-sketch/shogi/pull/132) — TOUR-OPS-ACTION-REQUEST-TRIAL-001（branch 削除 trial 設計、squash `7b51d28`）
  - **AR-BRANCH-DELETE-PHASE1-BATCH-001**：PR #122〜#132 対応 remote branch cleanup 実行（PR #132 の Post-Execution Report として完了報告済）
- **本 PR で実施しない**:
  - **v0.1 本体（`async_ai_workflow_v0_1.md`）の上書き・削除**
  - 既存 ops docs 11 件の改訂
  - 自動化実装 / Bot 実装 / GitHub Actions 変更
  - PR template / Issue template / label 強制化
  - Candidate Registry 作成 / `ai_work_queue.md` 作成
  - 実装 / テスト / snapshot / workflow / package 系の一切の変更
  - branch protection / token / secret / credential 操作
  - release / deploy / publish / branch 削除（local 1 件残存中、本 PR では触らない）
  - Ready 化 / merge / main 直接 push
  - Candidate Adopt / Task 化 / 実装着手
  - 後続タスク（V0-2-REVIEW / PR-TEMPLATE-DESIGN / WORK-QUEUE-DESIGN / CANDIDATE-REGISTRY-DESIGN / AUTOMATION-FEASIBILITY 等）の着手
  - SHOGI-LEARN 等の他 repo への展開

---

## 1. 目的

SHOGI-TOUR における AI 非同期運用ルールを **v0.1 + Phase 1 設計群（PR #122〜#130）+ Phase 2 入口（PR #131 軽量テンプレ集）+ Phase 2 trial（PR #132 branch 削除 trial）+ AR-BRANCH-DELETE-PHASE1-BATCH-001 実行結果** を統合した v0.2 として整理する。

具体的には以下を達成する：

1. **複数 AI / 複数セッション / GitHub PR 運用での混乱防止**：誰が何を担い、誰が承認するかを明確化する。
2. **実装暴走の防止**：Claude Code Implementer / Reviewer が docs-only スコープを超えない、Reviewer が修正しない。
3. **勝手な merge の防止**：明示 Approval Phrase + 対応 Action Request がない限り merge しない。
4. **勝手な branch 削除の防止**：merge と branch 削除は別 AR、`gh pr merge --delete-branch` は使わない。
5. **勝手な Candidate 化の防止**：Reviewer Nice to Have を自動的に Candidate にしない、Candidate を勝手に Adopt / Task 化しない。
6. **コピペ負担の軽減**：軽量テンプレ集（PR #131）を Level 別に整理し、毎回ゼロから書かない。
7. **既存 v0.1 を尊重**：v0.2 は v0.1 を置き換えるのではなく、Phase 1 全体を整理した「Draft」として併存させる。

本 Draft は **設計のドラフト** であり、正式採用（v0.1 退役）は別タスク（後続 `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`）の判断を待つ。

---

## 2. 適用範囲

### 2.1 適用対象

- SHOGI-TOUR `docs/` 配下（特に `docs/ops/`、`docs/notes/`）
- SHOGI-TOUR の **運用設計 / 運用ルール / 運用 trial / template / branch cleanup**
- SHOGI-TOUR の **Review Request Draft / Claude Code Reviewer / Action Request / Task Candidate / Approval Phrase**
- SHOGI-TOUR の **完了報告 / Post-Execution Report / HANDOFF.md 追記**

### 2.2 実装タスクに適用する場合の注意

- 本ルールは Phase 1 において **docs-only / 運用設計** を中心に成立してきた。
- **実装タスク** に適用する場合、§4 Risk Level で Level 2 以上として扱い、Codex クロスチェック / Human review を必須寄りに引き上げる。
- 実装は **DESIGN → IMPL-LIGHT** の 2 段階を原則とする（RESET-UX シリーズ PR #112〜#121 / v0.1 §15.1 で確立）。

### 2.3 適用しない範囲

- **SHOGI-LEARN や他 repo には自動適用しない**。各 repo の運用文化を尊重し、必要に応じて個別判断で導入する。
- **個人開発 / 一時的な検証 branch**：本ルールは複数 AI 協働 + 髙橋さん最終承認を前提とした重めの運用であり、軽い検証には適用しなくてよい。
- **緊急のセキュリティパッチ / hotfix**：通常の AR / Approval Phrase サイクルを通すと遅延が発生するため、別途緊急時運用を設計する余地を残す（v0.2 では未確定、後続検討）。

---

## 3. 基本原則

### 3.1 SSoT = GitHub

- **Single Source of Truth は GitHub**。
- 主要な状態・依頼文・承認・完了報告は **PR 本文 / PR コメント / HANDOFF.md / docs/ops / docs/notes** に残す。
- チャット履歴は補助（保存性が低い）。重要事項は GitHub に転記する（v0.1 §4）。
- 髙橋さん不在時でも GitHub を見れば「今どこにいて、次に誰が何をすべきか」が判る状態を目指す。

### 3.2 役割分担

| AI / 人間 | 役割 | 主な禁止事項 |
| --- | --- | --- |
| **ChatGPT** | 司令塔 / Triage / 依頼文作成 / Approval Phrase 案 / 整理 | final 決定権なし / 直接 GitHub 書き込みなし |
| **Claude** | 設計・壁打ち | 実装に進まない（Implementer に渡す）/ final 決定権なし |
| **Claude Code Implementer** | 設計・実装・docs 更新 / commit / push / Draft PR / 完了報告投稿 | §8 人間承認必須操作の自律実行 / Reviewer 兼任 |
| **Claude Code Reviewer** | read-only review | commit / push / Ready / merge / branch 削除 / PR コメント投稿 / PR 本文編集 / 修正実行 / Candidate Owner 化 |
| **Codex** | 任意の独立クロスチェック | final 決定権なし |
| **cowork** | optional advisory（Codex / Claude Code Reviewer 不在時の代替） | final 決定権なし |
| **髙橋さん** | Product Owner / 最終承認者 | （承認すべきものを承認しないと進行が止まる） |

### 3.3 Human Approval

- **Ready 化 / merge / branch 削除 / Candidate Adopt / Task 化 / 後続着手** は **すべて髙橋さんの明示 Approval Phrase が必須**。
- 「いいよ」「進めて」「OK」等の曖昧な承認文は無効（§8 / PR #127 §7.2）。
- AI 同士の推奨（Ready Recommended / Merge Recommended）は **実行承認ではない**。実行には別途髙橋さん明示許可が必要。

### 3.4 安全側に倒す

- 仕様不明 / コンテキスト不足 / Level 判定が曖昧 / 影響範囲が読めない場合は **停止して PR コメントに状況を残す**（Blocked: Context Missing / Spec Ambiguity）。
- 「勝手に進める」より「停止して確認」が常に優先。

---

## 4. Risk Level

タスクを以下の 4 段階で分類する（v0.1 §7 の Level 0〜5 を v0.2 では 1〜3 に集約・整理）。

### 4.1 Level 1：docs-only / trial / template 案

**例**：
- design doc / trial note / closure note / review note
- 後続候補整理 / 非スコープ明記
- template 案（強制化なし、`.github/` 配下を変更しない）
- HANDOFF 追記のみ

**必要レビュー**：
- Claude Code Reviewer による read-only review で十分（PR #126/#127/#128/#129/#130/#131/#132 で実証）
- Codex クロスチェックは **optional**

**禁止事項（Level 1 共通、§11.1 参照）**：
- 実装ファイル変更 / テスト変更 / snapshot 変更 / workflow 変更 / package 変更
- `.github/` 配下変更 / PR template / Issue template / label 変更
- Candidate Registry 作成 / `ai_work_queue.md` 作成
- Ready 化 / merge / branch 削除 / release / deploy / publish

### 4.2 Level 2：既存 ops docs 改訂 / branch cleanup / 運用ルール統合

**例**：
- v0.1 本体改訂 / 複数 ops docs の同時改訂
- branch cleanup（remote / local 削除）
- 運用ルール統合（本 Draft はこれに該当する側面あり）

**必要レビュー**：
- Claude Code Reviewer read-only review 必須
- Codex クロスチェック **推奨**（Level 2 以上）
- 髙橋さんの最終 Approval Phrase 必須

**禁止事項（Level 1 共通 + 以下）**：
- branch 削除は **常に別 AR**（merge と同時に行わない、§12 参照）
- 既存 v0.1 本体の **破壊的上書き禁止**（履歴資料として残す）

### 4.3 Level 3：実装 / workflow / automation / template 強制化 / Bot / GitHub Actions

**例**：
- `shogi_v4.html` / `index.html` / `data/` の実装変更
- `test/` / `test/e2e/` のテスト変更
- snapshot / VRT 更新
- `.github/workflows/` 変更
- `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` / label 強制化
- Bot 実装 / GitHub Actions / API 連携
- `package*.json` / lockfile / `playwright.config.js` 変更
- branch protection 変更 / token 操作

**必要レビュー**：
- Codex review **必須寄り**
- Claude Code Reviewer + Codex の二段レビュー推奨
- 髙橋さん明示 Approval Phrase 必須
- Risk Level 別の precondition / forbidden actions を AR Full Template（§5.4 / PR #131 §4.2）で完全展開

**禁止事項**：
- Level 1 + Level 2 + 以下
- 人間承認なしでの実行（自動化があっても髙橋さん介在を維持）
- 段階導入なしの一気実装

### 4.4 Risk Level 別の表現粒度（Core 5 / Standard 11、§9 と連動）

| Level | Core 5 | Standard 11 | AR | RRD | Completion Report |
| --- | --- | --- | --- | --- | --- |
| Level 1 | 必須 | 簡略可 | Short | Short | Short |
| Level 2 | 必須 | 完全記載 | Full | Full | Full |
| Level 3 | 必須 | 完全記載 + 拡張 | Full + Higher Risk add-on | Full + Codex 同送 | Full + Post-Execution Report |

### 4.5 SHOGI-LEARN や他 repo に展開する場合

- 他 repo は **本 Risk Level を流用しない**。
- 各 repo の文化 / リリース体制 / 承認体制に合わせて、独自の Level 表を作る。
- v0.2 は SHOGI-TOUR 用に最適化されているため、汎用設計ではない。

---

## 5. Review Request Draft (RRD)

### 5.1 目的

- 別セッション Reviewer（Claude Code Reviewer / Codex / ChatGPT 司令塔）に **PR 内容を独立に渡す** ためのコメント形式の依頼文。
- GitHub が読めない / 制約がある場合の **fallback 経路**（raw / patch / diff URL）を含む。
- レビュー観点 / Must / Should / Nice の基準 / Reviewer 禁止事項を毎回明示し、漏れを防ぐ。
- 詳細：PR #124 / PR #131 §5。

### 5.2 Short / Full の使い分け

| 場合 | テンプレ |
| --- | --- |
| Level 1 docs-only / 小さい diff / GitHub が読める前提 | **RRD Short**（PR #131 §5.1） |
| Level 2 以上 / 大きい diff / GitHub 制約あり / Codex review 向け | **RRD Full**（PR #131 §5.2、Review Material Pack を含む） |

### 5.3 Reviewer read-only 原則

- Reviewer は **commit / push / Ready / merge / branch 削除 / PR コメント投稿 / PR 本文編集 / 修正実行 を一切行わない**（PR #125 §7）。
- Reviewer は **Review Report をチャット返却**（PR コメント投稿しない）。チャット返却された Report は Implementer または髙橋さんが PR コメントに転記する判断を行う（§6.5 参照）。

### 5.4 PR コメント投稿 vs チャット返却

- **Review Report 本体**：チャット返却（Reviewer は PR コメント投稿しない原則、§6 / PR #125 §7）。
- **RRD 本体**：PR コメントに投稿可（Implementer または髙橋さんが投稿）。
- 例外的に Reviewer が PR コメントに何か残したい場合は、Implementer 経由で転記する（Reviewer 自身が投稿しない）。

### 5.5 fallback L0〜L3（PR #124 §5）

| Level | 状況 | 動作 |
| --- | --- | --- |
| L0 | GitHub PR を直視できる | PR ページを開いて diff / commits / files を読む |
| L1 | GitHub にアクセス可能だが PR ページが重い / 大きい | RRD 内の §3 抜粋 + Material Pack を使う |
| L2 | GitHub 制約あり（リダイレクト / 認証等） | 固定 raw URL（`raw.githubusercontent.com/<owner>/<repo>/<SHA>/<path>`）取得を試す |
| L3 | いずれも不可 | 「読めていない」と Review Report に明示 → No Go / 留保 |

### 5.6 Must / Should / Nice の基準

| 区分 | 内容 |
| --- | --- |
| **Must Fix** | docs-only 逸脱 / 既存 ops docs の破壊的改訂 / forbidden changes / 安全原則違反 / Risk Level 評価誤り / Approval Phrase の不整合 |
| **Should Fix** | 用語揺れ / 例不足 / 後続候補優先順位の不整合 / HANDOFF.md 追記の過不足 / 重要な観察事項の取り違え |
| **Nice to Have** | 後続 IMPL-LIGHT で扱える改善案 / より良い表現 / 追加で残すと有用な情報 / **自動的に Candidate ではない**（§10.4） |

### 5.7 必須項目と省略可能項目（PR #131 Nice to Have 反映）

**必須項目**：
- 対象 PR / Task ID / Risk Level / HEAD（main）/ Head SHA / base / branch / changedFiles
- PR URL / diff URL / patch URL / 固定 raw URL
- review scope / forbidden changes 確認
- Must / Should / Nice 基準
- Reviewer 禁止事項
- Review Report 14 項目フォーマット参照

**省略可能項目（Level 1 docs-only で diff が小さい場合）**：
- Review Material Pack 詳細（Full 版でのみ必須）
- fallback L0〜L3 詳細（Full 版でのみ必須、Short 版では参照リンクのみで可）
- 関連 design / trial note の全文参照（Full 版でのみ必須）

---

## 6. Claude Code Reviewer

### 6.1 Reviewer の役割

- **Implementer とは別セッション** で起動する read-only Reviewer。
- 対象 PR の diff / patch / raw / 関連 design note を読み、Review Report 14 項目をチャット返却する。
- Codex 不在 / Codex 利用不可時の **secondary reviewer** として運用（PR #124 §3 / PR #125 §5）。

### 6.2 read-only 原則

- **読み取り専用**。書き込み系操作（commit / push / Ready / merge / branch 削除 / PR コメント投稿 / PR 本文編集 / 修正実行）は **一切実行しない**。
- 違反した場合は trial 自体が失敗（PR #126 trial-001 で 0 違反実証 / PR #129 / #131 / #132 review でも遵守継続）。

### 6.3 禁止事項

Reviewer は以下を **一切実行しない**：

- commit / push / Ready / merge / branch 削除 / `gh pr merge` 全般
- PR コメント投稿 / PR 本文編集
- 修正コミット作成 / patch 提案ファイル作成
- Candidate の勝手な Adopt / Task 化
- **Reviewer 自身を Candidate Suggested Owner にしない**（PR #128 §6.1）
- template 強制化 / v0.2 本文作成
- 既存 ops docs の改訂

### 6.4 Review Report 14 項目（PR #131 §6）

```
1. 総合判定: A / Go、B+ / Conditional Go、No Go
2. 確認したもの
3. 確認できなかったもの
4. Must Fix
5. Should Fix
6. Nice to Have（自動的に Candidate ではない）
7. Risk Level 評価
8. 影響評価（docs-only / implementation / data / security / forbidden changes 有無）
9. Ready 化判断（Recommended / Conditional / Not Recommended）
10. merge 前修正要否
11. 再レビュー要否（Codex クロスチェック含む）
12. Reviewer 禁止事項遵守確認
13. 修正依頼案
14. 次アクション（次 AR 案）
```

### 6.5 PR コメント投稿しない原則 / Reviewer 自身を Candidate Owner にしない原則

- Reviewer は **Review Report を PR コメントに投稿しない**（チャット返却）。
- Implementer または髙橋さんが転記するかどうかを判断する。
- Reviewer が Candidate を提案する場合、**Suggested Owner には自分（Reviewer）以外**を置く（Implementer / 髙橋さん / 司令塔 / Codex のいずれか）。
- これは「Reviewer が自分を後続実装の責任者にすると read-only 原則と矛盾する」ため（PR #128 §6.1）。

---

## 7. Action Request (AR)

### 7.1 目的

- AI（特に Claude Code Implementer）に **具体的な操作実行を依頼するためのフォーマット**。
- 12 項目で構成され、対応する Approval Phrase（§8）と組で初めて実行可能になる。
- 自己実証：PR #127〜#132 + AR-BRANCH-DELETE-PHASE1-BATCH-001 = **計 7 回の AR 適用**で機能確認済。

### 7.2 12 項目構成（PR #127 §5 / PR #131 §4.2）

```
1. Action Request ID
2. Target（PR / Task / Branch）
3. Proposed Action
4. Reason
5. Preconditions
6. Expected Head SHA
7. Allowed Scope
8. Forbidden Actions
9. Required Approval Phrase
10. Execution Owner
11. Post-Execution Report Requirements
12. Expiration / Staleness Rule
```

### 7.3 Approval Phrase 7 条件（§8 参照）

AR と組で有効になる Approval Phrase は以下 7 条件すべて成立で有効：

1. Target 明確
2. Action 明確
3. Scope 明確
4. **対応する Action Request が存在する**（最重要）
5. precondition を実行直前再確認
6. 禁止事項維持
7. 髙橋さんの明示許可

詳細：§8。

### 7.4 無効な承認文（PR #127 §7.2 / PR #127〜#131 で 5 連続厳格判定）

- 「いいよ」「進めて」「OK」「やって」「まかせる」「Ready で」（PR 番号なし）
- 対応 AR 不在の承認文
- Target / Action / Scope が対応 AR と不一致
- head SHA 変更後の古い承認文（Staleness Rule 違反）
- Forbidden Actions と矛盾する承認文

### 7.5 Ready 化 AR

- 対象 PR を `gh pr ready <N>` で Ready for review に変更する AR。
- 例：`AR-PR<N>-READY-001`、Required Approval Phrase: `承認：PR #<N> Ready化`。
- **merge / branch 削除 / 後続タスク着手は Forbidden Actions**。
- 詳細：PR #131 §4.3。

### 7.6 squash merge AR

- 対象 PR を `gh pr merge <N> --squash`（**`--delete-branch` フラグなし**）で squash merge する AR。
- 例：`AR-PR<N>-MERGE-001`、Required Approval Phrase: `承認：PR #<N> squash merge`。
- **branch 削除 / `--delete-branch` 使用 / main 直接 push / release / deploy / publish / 後続タスク着手は Forbidden Actions**。
- 詳細：PR #131 §4.4 / PR #127〜#132 で 6 連続自己実証。

### 7.7 branch 削除 AR（PR #132 trial 設計 + AR-BRANCH-DELETE-PHASE1-BATCH-001 実行結果反映）

- **常に別 AR**（merge と同時に行わない、§12.1 参照）。
- 案 A（1 AR / 1 branch）と案 B（1 AR / N branches）を Risk / 効率トレードオフで使い分け（PR #132 §5〜§8）。
- Required Approval Phrase: `承認：PR #<N> branch 削除` または `承認：PR #<N1> #<N2> ... branch 削除`。
- **Option Y（10 件超の集約形式）の Approval Phrase**：PR #132 Nice to Have 反映として、長くなる列挙は **「承認：PR #<N1>〜#<Nm> branch 削除（合計 N 件、列挙詳細は AR 本文を参照）」** のような集約形式も許容する（ただし AR 本文に対象 PR 番号を **すべて明示** することが必須、§12.6 参照）。
- 詳細：PR #131 §4.5 / PR #132 / AR-BRANCH-DELETE-PHASE1-BATCH-001（§12 / §18 付録）。

### 7.8 Staleness Rule

- AR は以下のいずれかで **無効化**：
  - head SHA 変更
  - PR state 変更（Draft / OPEN / Ready / MERGED の遷移）
  - changedFiles 変更
- main HEAD 進行時は **再確認**（race による precondition 崩れの可能性）。
- 24 時間経過時は **再確認推奨**（時間経過による状態ドリフト）。
- 詳細：PR #127 §5.12 / PR #131 §4.2 12 項。

### 7.9 head SHA guard

- AR 実行直前に **expected head SHA を再確認**（`gh pr view <N> --json headRefOid`）。
- 一致しなければ実行停止 → 髙橋さんに状態変化を報告。
- 詳細：PR #127 §5.6 / PR #127〜#132 で 6 連続自己実証。

---

## 8. Approval Phrase

### 8.1 有効条件（PR #127 §7.1 / §7.3 参照）

Approval Phrase は **対応 AR とセット** で初めて有効。以下 7 条件すべて成立：

1. **Target 明確**：対象 PR / Task ID / Branch が承認文に明示されている
2. **Action 明確**：操作内容（Ready 化 / squash merge / branch 削除 / Candidate Adopt / Task 化 / 着手）が明示
3. **Scope 明確**：Allowed Scope が AR と一致
4. **対応 AR 存在**：対応する Action Request が PR コメントまたは設計 doc に存在し、Target / Action / Scope が承認文と一致
5. **precondition 実行直前確認**：head SHA / state / changedFiles 等を実行直前に再確認
6. **禁止事項維持**：Forbidden Actions が承認文と矛盾しない
7. **髙橋さんの明示許可**：髙橋さんが「承認：...」形式で発話している

### 8.2 無効条件

- 上記 7 条件のいずれかが欠ける
- 「いいよ」「進めて」「OK」「やって」「まかせる」（PR 番号なし）
- 対応 AR 不在 / 古い AR / 別 PR への流用
- Target / Action / Scope の不一致

### 8.3 有効例（PR #131 §8.1 ベース）

```
承認：PR #<N> Claude Code Reviewer read-only review
承認：PR #<N> Codex review
承認：PR #<N> Ready化
承認：PR #<N> squash merge
承認：PR #<N> Must Fix 修正依頼
承認：PR #<N> branch 削除
承認：PR #<N1> #<N2> ... branch 削除
承認：CAND-<XXX> を Hold
承認：CAND-<XXX> を Adopt
承認：CAND-<XXX> を Reject
承認：CAND-<XXX> を Split
承認：CAND-<XXX> を Merge with CAND-<YYY>
承認：<Task ID> 着手
承認：Phase 1 Codex クロスチェック依頼
```

### 8.4 「状態確認」は実行承認ではない

- 「PR #<N> の状態は？」「main HEAD は？」「branch は残っている？」等は **状態確認のリクエスト**であり、実行承認ではない。
- 状態確認の応答に対して、AI / Implementer は **報告のみ行い、操作実行に進まない**。
- 例：「branch 残っているか確認して」→ 確認結果を報告するのみ、削除に進まない。

### 8.5 「次いこう」は具体実行承認ではない

- 「次いこう」「次行こう」「次は？」は **司令塔に次タスク提案を要求する発話** として扱う。
- これは具体的な操作（Ready 化 / merge / branch 削除）を承認するものではない。
- 司令塔 ChatGPT は **次タスク候補を整理して提示** する。
- 髙橋さんが具体タスクを選び、対応 AR + Approval Phrase を発行して初めて実行可能。

---

## 9. Completion Report

### 9.1 Core 5（省略不可、v0.1 §6.1 継承）

| # | 項目 | 意味 |
| --- | --- | --- |
| 1 | Next Action | 次に実行すべき具体的アクション |
| 2 | Next Owner | 次に動くべき AI / 人間 |
| 3 | Blocked By | 停止理由（Human Approval / Review / VRT Decision / CI Red / Spec Ambiguity / Data Risk / Security Risk / Tool Unavailable / Context Missing / Human Copy/Paste / null） |
| 4 | Allowed Without Human Approval | 人間承認なしで進めて良い範囲 |
| 5 | Requires Human Approval | 人間承認が必要な操作 |

### 9.2 Standard 11（原則記載、短いタスクで簡略化可、v0.1 §6.2 継承）

| # | 項目 | 意味 |
| --- | --- | --- |
| 1 | Task ID | 命名規約に従ったタスク識別子 |
| 2 | PR 番号 | GitHub PR 番号 |
| 3 | Branch | 作業ブランチ名 |
| 4 | Commit SHA | 報告時点の HEAD commit SHA |
| 5 | Current Status | Draft / OPEN / Ready / MERGED / Observation / Blocked |
| 6 | Forbidden Actions | 明示的に禁止する操作リスト |
| 7 | Changed Files | 変更ファイル一覧 |
| 8 | Tests | テスト結果（docs-only 未実施 / `bash test/run_tests.sh` 結果） |
| 9 | Risk Level | §4 の Level 1〜3 |
| 10 | Review Needed | 必要なレビュアー（Codex / Claude Code Reviewer / ChatGPT 司令塔） |
| 11 | Handoff URL | 次担当者が見るべき URL |

### 9.3 表形式の採用判断（PR #131 Nice to Have 反映）

- v0.1 §6.4 / §6.5 では Core 5 / Standard 11 を **箇条書き形式** で例示していたが、PR #131 / PR #132 完了報告コメントで **表形式** が読みやすいことが確認された。
- v0.2 では **両形式を許容** する：
  - **表形式（推奨）**：Level 2 以上、または複数項目を一覧したい場合
  - **箇条書き形式**：Level 1 docs-only / 短いタスクで簡素にしたい場合
- 形式選択は Implementer の判断、Reviewer が表形式統一を Must / Should Fix にしない。

### 9.4 Short / Full の使い分け

| Level | Completion Report 版 | Standard 11 |
| --- | --- | --- |
| Level 1 | Short（PR #131 §7.1） | 簡略可（GitHub UI 参照で代替） |
| Level 2 | Full（PR #131 §7.2） | 完全記載 |
| Level 3 | Full + Post-Execution Report | 完全記載 + 拡張 |

### 9.5 Ready 化 / squash merge / branch 削除 完了報告（Post-Execution Report）

- **Ready 化完了報告**：PR state / isDraft / head SHA / mergeable / mergeStateStatus / main HEAD / precondition 再確認 / 実行コマンド / Reviewer review 結果 / Forbidden Actions 遵守 / 次 AR 案（PR #131 §7.3）
- **squash merge 完了報告**：mergedAt / squash commit SHA / main HEAD（旧→新）/ 実行コマンド（`gh pr merge <N> --squash`、`--delete-branch` なし）/ merge 前 precondition / branch の現状（削除なし）/ Candidate / template / v0.2 本文の扱い / Forbidden Actions 遵守（PR #131 §7.4）
- **branch 削除完了報告**：削除対象 PR / branch 一覧 / 各 PR MERGED / squash main 反映 / 削除コマンド / remote 削除結果 / local 削除結果 / 削除失敗詳細（あれば）/ main HEAD 不変 / working tree clean / Forbidden Actions 遵守 / 後続タスク未着手（AR-BRANCH-DELETE-PHASE1-BATCH-001 報告で実証）

---

## 10. AI Task Candidate

### 10.1 目的

- Reviewer Nice to Have / Implementer 観察 / 司令塔整理 / 運用観察などから生まれる **将来タスク候補** を整理するためのフォーマット。
- Candidate は **タスクそのものではない**。Adopt → Task 化 → 着手の段階を経る（4 段階 Approval Phrase、§10.5）。
- 詳細：PR #128 / PR #129。

### 10.2 Nice to Have と Candidate の違い（PR #128 §3.1 / PR #131 §6 注記）

| 区分 | 性質 |
| --- | --- |
| **Nice to Have**（Reviewer Review Report §6） | レビュー所見。**自動的には Candidate ではない**。 |
| **Candidate** | 「次の検討対象として残す」と司令塔または髙橋さんが判断した正式候補。15 項目記載。 |
| **Observation Memo**（§10.3） | 観察メモ。Candidate ですらない。Revisit timing を記載して将来再評価する。 |

### 10.3 Observation Memo は Candidate ではない（PR #131 §9.3 / PR #129 で実証）

- Reviewer Nice to Have のうち、**正式 Candidate にしないと判断したもの** は Observation Memo として残す。
- Observation Memo は **Task 化されない**、**Adopt されない**、**Suggested Owner を持たない**。
- **Revisit timing**（PR #131 Nice to Have 反映）：Observation Memo には「いつ再評価するか」を記載する。例：
  - `Revisit timing: v0.2 本文作成時`
  - `Revisit timing: Phase 2 中盤（branch cleanup trial 終了後）`
  - `Revisit timing: 3 ヶ月後の運用観察時`
  - `Revisit timing: 未定（観察のみ、再評価不要見込）`
- Revisit timing が「未定 / 不要見込」のものは、半年〜1 年後の Phase 棚卸し時にまとめて整理する。

### 10.4 Candidate Adopt 禁止 / Candidate Task 化禁止（無断で）

- **Candidate を勝手に Adopt しない**（PR #128 §3.7 Auto-Implementation Prohibited / PR #129 で 3 連続 Hold 実証）。
- **Candidate を勝手に Task 化しない**（同上）。
- Adopt / Task 化には **髙橋さんの明示 Approval Phrase が必須**（§10.5）。

### 10.5 Candidate の状態遷移（PR #128 §8 / 4 段階 Approval Phrase）

```
（生成）→ Candidate (proposed)
         ↓ 承認：CAND-<XXX> を Adopt
       Adopted
         ↓ 承認：<Task ID> 着手
       Task 化 → Implementer 作業開始
         ↓ 承認：PR #<N> Ready化
       Ready
         ↓ 承認：PR #<N> squash merge
       Merged
         ↓ 観察 / 後続検討
       Closed
```

4 段階 Approval Phrase：
1. `承認：CAND-<XXX> を Adopt`
2. `承認：<Task ID> 着手`
3. `承認：PR #<N> Ready化`
4. `承認：PR #<N> squash merge`

その他の遷移：
- `承認：CAND-<XXX> を Hold`（保留、PR #128/#129 で実証）
- `承認：CAND-<XXX> を Reject`
- `承認：CAND-<XXX> を Split`（2 つ以上に分解）
- `承認：CAND-<XXX> を Merge with CAND-<YYY>`（統合）

### 10.6 Suggested Owner に Reviewer を置かない原則（PR #128 §6.1）

- Candidate の Suggested Owner には **Reviewer 以外**（Implementer / 髙橋さん / 司令塔 / Codex）を置く。
- 理由：Reviewer 自身を Owner にすると read-only 原則と矛盾し、Reviewer が後続実装に踏み込む誘惑が発生するため。

---

## 11. Forbidden Actions

### 11.1 Level 1 docs-only 共通（PR #131 §10.1）

```
- merge
- main 直接 push
- release / deploy / publish
- branch 削除（別 AR 必要）
- GitHub Actions / workflow / .github/workflows/ 変更
- Bot 実装 / API 連携
- package*.json / lockfile / playwright.config.js 変更
- token / secret / credential 操作
- branch protection 変更
- 実装ファイル（shogi_v4.html / index.html / data/）変更
- テストファイル（test/ / test/e2e/）変更
- snapshot / VRT PNG 変更
- CSS / layout 変更
- .github/PULL_REQUEST_TEMPLATE.md / .github/ISSUE_TEMPLATE/ 変更
- label 作成・変更
- ai_work_queue.md 作成・変更
- Candidate Registry 作成
- Candidate Adopt / Task 化 / 実装着手
- template 強制化（運用強制を含む）
- v0.2 本文の正式採用（既存 v0.1 の置き換え）
- 既存 ops docs 本体改訂（v0.1 / async trial-001 / RRD design / Reviewer design / Reviewer trial-001 / Action Request design / AI Task Candidate design / AI Task Candidate trial-001 / v0.2 review note / 軽量テンプレ集 / branch 削除 trial 設計）
- 後続タスク着手
- RESET-UX 後続実装
- unrelated cleanup / unrelated refactor
```

### 11.2 Ready 化用（§11.1 + 以下、PR #131 §10.2）

```
- merge
- branch 削除
- Candidate Adopt / Task 化
- 後続タスク着手
- template 強制化 / v0.2 本文作成
```

### 11.3 merge 用（§11.1 + 以下、PR #131 §10.2）

```
- branch 削除（**常に別許可**、§12.1）
- gh pr merge --delete-branch の使用（**全 PR 共通禁止**、§12.4 / PR #132 Nice to Have 反映）
- Candidate Adopt / Task 化
- template 強制化 / v0.2 本文作成
- 後続タスク着手
- main 直接 push
- release / deploy / publish
```

### 11.4 branch 削除用（§12 参照）

```
- 対象外 branch（列挙にない branch、main / master / develop 等）への操作
- tag 削除
- release / deploy / publish
- 後続タスク着手
- PR template / Issue template / label 操作
- workflow / package / token / branch protection 変更
- `gh pr merge --delete-branch` の使用（branch 削除専用 AR で実行する原則維持）
- 強制削除（`-D` フラグでも本ルールでは「local 残存」を許容、§12.7 参照）
```

### 11.5 Higher Risk Forbidden Actions add-on（Level 2 以上、PR #131 §10.3）

```
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

### 11.6 カテゴリ整理（PR #131 Nice to Have 反映）

Forbidden Actions は次のカテゴリに分類して読みやすくする：

1. **PR 操作系**：merge / Ready / branch 削除 / main 直接 push / `gh pr merge --delete-branch`
2. **公開系**：release / deploy / publish
3. **CI / インフラ系**：GitHub Actions / workflow / branch protection / Bot
4. **依存・schema 系**：package / lockfile / playwright.config.js / localStorage schema
5. **コアロジック系**：実装ファイル / テスト / snapshot / CSS / layout
6. **template 強制化系**：.github/PULL_REQUEST_TEMPLATE.md / .github/ISSUE_TEMPLATE/ / label / ai_work_queue.md / Candidate Registry
7. **運用ルール系**：既存 ops docs 改訂 / v0.2 本文の正式採用 / Candidate Adopt / Task 化 / 後続タスク着手
8. **セキュリティ系**：token / secret / credential

各 AR の Forbidden Actions 欄では、上記カテゴリから該当するものを **抜粋** して列挙する（全件列挙すると AR 本文が肥大化するため）。

### 11.7 template 強制化 / Bot / workflow / GitHub Actions 変更は別タスク

- これらは v0.2 では **明示的にスコープ外**。
- 後続候補：`TOUR-OPS-PR-TEMPLATE-DESIGN`、`TOUR-OPS-AUTOMATION-FEASIBILITY` 等で別途検討。

---

## 12. branch cleanup

### 12.1 branch 削除は専用 AR で行う

- **merge と branch 削除を同時に行わない**（PR #127 §4 / §6.2、PR #131 §10.2、PR #132 / AR-BRANCH-DELETE-PHASE1-BATCH-001 で実証）。
- branch 削除には **専用の Action Request + 専用の Approval Phrase** が必要。

### 12.2 `gh pr merge --delete-branch` は使わない（全 PR 共通、PR #132 Nice to Have 反映）

- `--delete-branch` フラグは **使わない**。
- これは特定の PR / 特定のシリーズに限らず **全 PR 共通の原則**。
- 理由：
  - merge 実行と branch 削除実行は **本来別の操作**であり、別々の Approval Phrase で承認するべき
  - `--delete-branch` を使うと merge 完了報告と branch 削除報告が混ざり、責任分界が不明確になる
  - 「branch 削除は常に別 AR」原則と直接矛盾する
- PR #127〜#132 の 6 連続自己実証で本原則を確立した。

### 12.3 remote 削除と local 削除の違い（AR-BRANCH-DELETE-PHASE1-BATCH-001 実行結果反映）

| 操作 | コマンド | 影響範囲 | 失敗時の影響 |
| --- | --- | --- | --- |
| **remote 削除** | `git push origin --delete <branch>` | GitHub 上 / 他者の clone 影響 | **大**（取り消しは reflog 不可、squash SHA から再 push が必要） |
| **local 削除** | `git branch -D <branch>` | 自分の worktree のみ | **小**（reflog から復元可能） |

### 12.4 失敗時の停止ルール（remote / local 別、PR #132 Nice to Have + AR-BRANCH-DELETE-PHASE1-BATCH-001 結果反映）

remote 削除と local 削除は **失敗時の停止ルールを分けて記述** する：

#### 12.4.1 remote 削除失敗時

- **1 件でも失敗したら、残りの remote 削除を即時停止** し、髙橋さんに状態報告。
- 理由：remote 失敗は通信・権限・branch protection・race condition など重大原因の可能性があり、続行は他 branch を破壊しかねない。
- 報告内容：失敗した branch / エラーメッセージ / 残り未削除 branch / main HEAD 不変確認 / 状態確認結果。

#### 12.4.2 local 削除失敗時

- **1 件失敗しても、残りの local 削除は継続可能**（Implementer 判断 + 報告必須）。
- 理由：
  - local branch 削除は worktree-local の cleanup であり、他 branch / remote に影響なし
  - 多くの場合の失敗原因は「親 worktree で checkout 中」（git の安全制約）であり、強制削除よりも放置のほうが安全
  - 残りの local 削除を継続しても、追加破壊は発生しない
- ただし、**継続実行する場合は Post-Execution Report で明示的に surfaced** する（実行ルール変則として記録）。
- AR-BRANCH-DELETE-PHASE1-BATCH-001 で本パターンを surfaced：1 件失敗（親 worktree 使用中）後も残り local 削除を継続した点を Post-Execution Report で透明性をもって報告。
- 本ルールは AR-BRANCH-DELETE-PHASE1-BATCH-001 の実行結果を踏まえた **正式化**（v0.1 / PR #131 / PR #132 段階では未明文化）。

### 12.5 親 worktree 使用中 branch の扱い（AR-BRANCH-DELETE-PHASE1-BATCH-001 で surfaced）

- worktree が複数ある場合、別 worktree で checkout 中の branch は **強制削除しない**。
- 削除コマンドは失敗するが、それは **git の安全制約** であり、回避すべきものではない。
- 対処方針：
  - 本 AR では **強制削除しない**（親 worktree の状態を尊重、安全優先）
  - 親 worktree 側で `git checkout main` 等を行った後、別 AR / 手動で local 削除する選択肢
  - もしくはそのまま放置（影響なし、reflog から復元可能）
- 強制削除が必要な場合は **別 AR で明示 Approval Phrase**（例：`承認：local branch <name> 強制削除`）。

### 12.6 Option Y Approval Phrase の集約形式（PR #132 Nice to Have 反映）

- PR 番号 10 件超の集約形式を許容：
  - `承認：PR #122〜#132 branch 削除（合計 11 件）`
  - `承認：PR #122 #123 #124 #125 #126 #127 #128 #129 #130 #131 #132 branch 削除`
- どちらの形式でも、**AR 本文に対象 PR 番号 / branch 名をすべて明示** することが必須。
- 集約形式の承認文は AR と組で初めて有効（§8.1 条件 4）。

### 12.7 PR #122〜#132 remote cleanup 完了記録

- **AR-BRANCH-DELETE-PHASE1-BATCH-001** により以下が達成：
  - remote 11/11 削除成功 ✅（PR #122〜#132 由来 11 branch 全件、GitHub 上は完全 cleanup 済み）
  - local 10/11 削除成功（1 件は親 worktree 使用中で安全保留）
  - main HEAD 不変（`7b51d28`）
  - 削除対象外 branch（main / claude/* / chore/* / docs/a4-* / docs/a5-* / docs/master-* / docs/ops-pr-* / docs/pairing-* 等）への無影響確認
  - `gh pr merge --delete-branch` 不使用原則 6 連続遵守
- 残存 local 1 件：`docs/tour-ops-claude-code-reviewer-trial-001`（PR #126 由来、親 worktree `/Users/takahashikazuo/projects/shogi` で checkout 中）。本 v0.2 Draft でも触らない。

### 12.8 local 削除失敗後の継続実行の改善候補（AR テンプレ改善候補）

- AR-BRANCH-DELETE-PHASE1-BATCH-001 では、local 削除 1 件失敗後に残り local 削除を継続実行した。
- 厳密には AR テンプレ §11 Post-Execution Report Requirements / Staleness Rule との整合性に課題（「失敗時は停止して報告」の文言が remote / local を分けていなかった）。
- 改善候補（後続 `TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT-V2` または別タスクで）：
  - AR テンプレに「remote 削除失敗時の停止ルール」「local 削除失敗時の継続可否ルール」を明示分離（§12.4 参照）
  - 継続実行する場合の Post-Execution Report 形式の標準化
  - 強制削除（`-D`）が必要な場合の別 AR フォーマット定義

---

## 13. Template use

### 13.1 PR #131 軽量テンプレ集の位置づけ

- PR #131 `docs/ops/20260516_shogi_tour_ai_workflow_templates_impl_light.md` は **Phase 2 入口の軽量テンプレ集**。
- 内容：Action Request Short / Full、RRD Short / Full、Review Report 14 項目、Completion Report Short / Full、Approval Phrase、Task Candidate Short / Full、Observation Memo、Forbidden Actions 共通ブロック、Level 別使い分け表。
- v0.2 ではこの軽量テンプレ集を **正式な参照テンプレ集** として位置付ける。

### 13.2 テンプレは案であり強制ではない（PR #131 §13）

- テンプレは **強制ではなく案**。
- 新しい状況 / 例外的 Risk Level では、テンプレを使わずに長文で書くことも引き続き許容される。
- 目的は **硬直化ではなく、長文コピペ削減と漏れ防止**。
- 使いづらければ修正する。

### 13.3 Short / Full / Level 別の使い分け（PR #131 §11）

詳細は PR #131 §11 を参照。v0.2 では §4.4 / §5.2 / §9.4 で各章ごとに使い分け基準を明示。

### 13.4 `.github/PULL_REQUEST_TEMPLATE.md` 化は別タスク

- PR template の実ファイル化（`.github/PULL_REQUEST_TEMPLATE.md`）は **別タスク** `TOUR-OPS-PR-TEMPLATE-DESIGN`。
- 強制化（PR 作成時に自動でテンプレが出る）は **Level 3 相当の change**（運用フロー全体に影響）であり、慎重に設計する。

### 13.5 Issue template 化も別タスク

- `.github/ISSUE_TEMPLATE/` の作成・運用ルール化は別タスク。
- v0.2 段階では GitHub Issue は使っていない（PR ベース運用）。Issue 連携は Phase 2 中盤以降で検討。

---

## 14. 運用フロー

### 14.1 新規 docs タスク

```
1. 髙橋さん（または ChatGPT 司令塔）が Task ID / 目的 / スコープ / 禁止事項を提示
2. Implementer がブランチ作成 → docs 作成 → HANDOFF.md 追記 → Draft PR 作成
3. Implementer が PR コメントに完了報告投稿（Core 5 + Standard 11 簡略版）
4. Implementer が次 AR 案（典型例：AR-PR<N>-REVIEW-001）を提示して停止
```

### 14.2 Review Request Draft

```
5. 髙橋さんが「承認：PR #<N> Claude Code Reviewer read-only review」を発話
6. Implementer が RRD を PR コメントに投稿（§5）
7. Implementer は Reviewer 起動準備のみ（実際の Reviewer 起動は別セッション）
```

### 14.3 Reviewer read-only review

```
8. 別セッションで Claude Code Reviewer 起動（依頼テンプレ：PR #131 §5.3）
9. Reviewer が diff / patch / raw / 関連 design note を読む
10. Reviewer が Review Report 14 項目をチャット返却（PR コメント投稿しない、§6.5）
11. Implementer または髙橋さんが Report を PR コメントに転記（判断）
```

### 14.4 Ready 化

```
12. 司令塔が Review Report を整理 → Ready Recommended 判断
13. 髙橋さんが「承認：PR #<N> Ready化」を発話 + 対応 AR（AR-PR<N>-READY-001）が PR コメントに存在
14. Implementer が precondition 再確認 → `gh pr ready <N>` 実行
15. Implementer が Post-Execution Report を PR コメント投稿（§9.5）
```

### 14.5 squash merge

```
16. 司令塔が Merge Recommended 判断
17. 髙橋さんが「承認：PR #<N> squash merge」を発話 + 対応 AR（AR-PR<N>-MERGE-001）が存在
18. Implementer が precondition 再確認（mergeable: MERGEABLE / mergeStateStatus: CLEAN / main HEAD race なし）
19. Implementer が `gh pr merge <N> --squash`（`--delete-branch` なし）実行
20. Implementer が Post-Execution Report 投稿（§9.5）
21. branch は削除しない（別 AR、§12.1）
```

### 14.6 branch 削除

```
22. 累積した merged branch を別 AR で削除
23. 案 A（1 AR / 1 branch）か案 B（1 AR / N branches）を髙橋さん判断
24. 髙橋さんが「承認：PR #<N1> #<N2> ... branch 削除」を発話 + 対応 AR が存在
25. Implementer が remote 削除 → local 削除を実行（§12.3 / §12.4 の失敗時停止ルール遵守）
26. Implementer が Post-Execution Report 投稿（§9.5）
```

### 14.7 Candidate 化

```
27. Reviewer Nice to Have や Implementer 観察から Candidate 候補を抽出
28. 司令塔（または Implementer）が 15 項目 Candidate を起票（Suggested Owner は Reviewer 以外、§10.6）
29. 髙橋さんが「承認：CAND-<XXX> を Hold / Adopt / Reject / Split / Merge」を発話
30. Adopt されたら次の Task 化フェーズへ
```

### 14.8 後続タスク化

```
31. Adopt 後、髙橋さんが「承認：<Task ID> 着手」を発話
32. Implementer が新規 Task として §14.1 から再スタート
```

### 14.9 Codex クロスチェック任意判断

- Codex クロスチェックは **Level 2 以上で推奨**、**Level 3 以上で必須寄り**。
- Level 1 docs-only では **optional**。Claude Code Reviewer 単独で十分（PR #126〜#132 で実証）。
- Codex クロスチェック発動は髙橋さんの明示判断（`承認：PR #<N> Codex review`）。

---

## 15. 失敗条件

### 15.1 設計の前提として失敗とみなす行為

以下は v0.2 運用における **明確な失敗**：

1. **承認なしに実行した**
   - 対応 AR 不在 / Approval Phrase 不在で Ready 化 / merge / branch 削除 / Candidate Adopt / Task 化 / 後続着手した
2. **対象外 PR を操作した**
   - AR の Target に明示されていない PR を Ready / merge / branch 削除した
3. **branch 削除を merge と同時に行った**
   - `gh pr merge --delete-branch` を使った
   - merge と branch 削除を 1 つの AR で済ませた
4. **Reviewer が修正した**
   - Claude Code Reviewer が commit / push / Ready / merge / PR コメント投稿 / PR 本文編集 / 修正実行を行った
5. **Nice to Have を勝手に Candidate 化した**
   - Reviewer Nice to Have を Implementer が独断で 15 項目 Candidate に起票した（司令塔 / 髙橋さん判断を経ていない）
6. **Candidate を勝手に Task 化した**
   - `承認：CAND-<XXX> を Adopt` および `承認：<Task ID> 着手` がない状態で実装着手した
7. **template を勝手に強制化した**
   - `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` / label を独断で作成・適用した
8. **v0.2 Draft 作成中に実装や workflow を触った**
   - 本タスクで `shogi_v4.html` / `test/` / `.github/workflows/` 等を変更した
9. **v0.1 本体を破壊的に上書きした**
   - 本タスクで `async_ai_workflow_v0_1.md` を削除 / 上書きした
10. **既存 ops docs を破壊的に改訂した**
    - 本タスクで PR #122〜#132 由来の既存 ops docs 11 件を変更した

### 15.2 失敗発生時の対処

- 即時に **作業停止 + 状態報告**
- PR コメントに「失敗が発生した」事実を記録
- 必要に応じて revert（reset --hard ではなく `git revert` を優先、明示 Approval Phrase 受領後）
- 司令塔・髙橋さんと再設計

---

## 16. 今回の v0.2 Draft でやらないこと

本 PR では以下を **一切実施しない**：

1. **Bot 実装**
2. **GitHub Actions 変更**
3. **PR template 強制化**（`.github/PULL_REQUEST_TEMPLATE.md` 作成・運用強制）
4. **Issue template 強制化**（`.github/ISSUE_TEMPLATE/` 作成）
5. **Candidate Registry 作成**
6. **`ai_work_queue.md` 作成**
7. **実装ファイル変更**（`shogi_v4.html` / `index.html` / `data/`）
8. **テスト変更**（`test/` / `test/e2e/`）
9. **snapshot 変更**
10. **workflow / package 変更**（`.github/workflows/` / `package*.json` / lockfile / `playwright.config.js`）
11. **自動 merge**
12. **自動 branch 削除**
13. **既存 v0.1 本体の削除 / 上書き**（履歴資料として残す）
14. **既存 ops docs 11 件の改訂**（v0.1 / async trial-001 / RRD design / Reviewer design / Reviewer trial-001 / Action Request design / Candidate design / Candidate trial-001 / v0.2 review note / 軽量テンプレ集 / branch 削除 trial 設計）
15. **他 repo への展開**（SHOGI-LEARN 等）
16. **Ready 化 / merge / branch 削除**
17. **Candidate Adopt / Task 化 / 後続着手**
18. **本 v0.2 Draft の正式採用**（正式採用判断は後続 `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` で行う）

---

## 17. 後続候補

本 PR では着手しない。Adopt + 髙橋さん明示許可受領後に別 PR / 別セッションで進める。

| 優先 | Task ID | 内容 |
| --- | --- | --- |
| 第一 | **`TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`** | 本 Draft のレビュー / v0.2 正式採用判断 / v0.1 退役判断 |
| 第二 | `TOUR-OPS-PR-TEMPLATE-DESIGN` | `.github/PULL_REQUEST_TEMPLATE.md` 設計（強制化を含む） |
| 第三 | `TOUR-OPS-WORK-QUEUE-DESIGN` | `ai_work_queue.md` 設計（Task ID / PR / Status / Blocked By 一覧） |
| 第四 | `TOUR-OPS-CANDIDATE-REGISTRY-DESIGN` | Candidate Registry 設計（PR #129 / #130 で不要見込判定だが、必要なら検討） |
| 第五 | `TOUR-OPS-AUTOMATION-FEASIBILITY` | Bot / GitHub Actions / API 連携の実現性検討（Phase 5 相当） |
| 並走可 | **SHOGI-TOUR 実装系への適用方針検討** | docs-only 中心だった v0.2 を実装タスクに適用する場合の差分検討 |
| 並走可 | `TOUR-OPS-HANDOFF-FORMAT-DESIGN` | HANDOFF.md エントリ書式設計 |
| 並走可 | `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` | v0.1 §10.1 完了報告テンプレ等の実装 |
| 並走可 | `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT` | Reviewer 依頼テンプレ独立化（PR #131 §5.3 と重複の可能性） |
| 並走可 | `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` | RRD 部分独立化（PR #131 §5 と重複の可能性） |

---

## 18. 付録

### 18.1 PR #122〜#132 一覧

| PR | Task ID | 種別 | main 反映 squash SHA | v0.2 反映 |
| --- | --- | --- | --- | --- |
| [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) | TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN | v0.1 本体 | `ea71e15` | §1 / §3 / §4 / §9（章立て継承） |
| [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) | TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001 | v0.1 trial | `44b49a9` | §9（Core 5 / Standard 11 実証） |
| [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) | TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN | RRD 標準設計 | `84f6724` | §5 全般 / §6（Reviewer 役割） |
| [#125](https://github.com/kazuo1970takahashi-sketch/shogi/pull/125) | TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN | Reviewer 運用設計 | `20c0a71` | §6 全般 |
| [#126](https://github.com/kazuo1970takahashi-sketch/shogi/pull/126) | TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001 | Reviewer trial | `f989514` | §6（trial 実証） |
| [#127](https://github.com/kazuo1970takahashi-sketch/shogi/pull/127) | TOUR-OPS-ACTION-REQUEST-DESIGN | AR 標準設計 | `541feb2` | §7 全般 / §8 全般 |
| [#128](https://github.com/kazuo1970takahashi-sketch/shogi/pull/128) | TOUR-OPS-AI-TASK-CANDIDATE-DESIGN | Candidate 標準設計 | `f15793a` | §10 全般 |
| [#129](https://github.com/kazuo1970takahashi-sketch/shogi/pull/129) | TOUR-OPS-AI-TASK-CANDIDATE-TRIAL-001 | Candidate trial | `32a3ab2` | §10（trial 実証 / Hold 運用） |
| [#130](https://github.com/kazuo1970takahashi-sketch/shogi/pull/130) | TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW | Phase 1 総括 | `ae11cd3` | §1 / §15 / §17（v0.2 化判断） |
| [#131](https://github.com/kazuo1970takahashi-sketch/shogi/pull/131) | TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT | 軽量テンプレ集 | `926ef60` | §5.2 / §7.2 / §9.3 / §13 / §11.6（Nice to Have 反映） |
| [#132](https://github.com/kazuo1970takahashi-sketch/shogi/pull/132) | TOUR-OPS-ACTION-REQUEST-TRIAL-001 | branch 削除 trial 設計 | `7b51d28` | §7.7 / §12 全般（Nice to Have 反映） |

### 18.2 各 PR の位置づけ

| Phase | 範囲 | 成果 |
| --- | --- | --- |
| Phase 1 設計 | PR #122 / #124 / #125 / #127 / #128 | v0.1 + RRD + Reviewer + AR + Candidate の 5 本柱設計 |
| Phase 1 trial | PR #123 / #126 / #129 | trial による 3 連続実証 |
| Phase 1 総括 | PR #130 | 棚卸し / v0.2 化判断（案 B：review note 留め推奨） |
| Phase 2 入口 | PR #131 | 軽量テンプレ集（Action Request / RRD / Completion Report / Approval Phrase / Candidate / Forbidden Actions の Short / Full） |
| Phase 2 trial | PR #132 + AR-BRANCH-DELETE-PHASE1-BATCH-001 | branch 削除 trial 設計 + 実行（remote 11/11、local 10/11） |
| Phase 2 統合（本 Draft） | **本 PR** | v0.1 + Phase 1 + Phase 2 入口 + Phase 2 trial を 1 つの v0.2 Draft に統合 |

### 18.3 remote branch cleanup 完了記録

AR-BRANCH-DELETE-PHASE1-BATCH-001（PR #132 Post-Execution Report として完了報告済）：

| 項目 | 結果 |
| --- | --- |
| 削除対象 PR | #122〜#132（11 件） |
| 削除対象 branch | 11 件（`docs/tour-ops-*` 全件） |
| remote 削除 | **11/11 成功 ✅** |
| local 削除 | **10/11 成功**（1 件は親 worktree 使用中で安全保留） |
| 残存 local branch | `docs/tour-ops-claude-code-reviewer-trial-001`（PR #126 由来） |
| main HEAD | 不変（`7b51d28`） |
| 削除対象外 branch | 無影響（main / claude/* / chore/* / docs/a4-* / docs/a5-* / docs/master-* / docs/ops-pr-* / docs/pairing-* 等） |
| `--delete-branch` 使用 | なし（6 連続遵守） |
| 後続タスク着手 | なし |
| Forbidden Actions 違反 | なし |

### 18.4 未解決 Nice to Have の扱い

PR #131 / PR #132 / Phase 1 トータルで surfaced されたが正式 Candidate にしていない Nice to Have / Observation Memo は、以下のように扱う：

| 区分 | 対応 |
| --- | --- |
| 本 v0.2 Draft に反映済み | §5.2 / §5.7 / §7.7 / §9.3 / §11.6 / §12.4 / §12.6 / §12.8 ほか |
| Observation Memo として残す | Revisit timing を記載（§10.3）。本 Draft の Reviewer review で再評価 |
| 正式 Candidate 化候補 | 後続 `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` で 判断 |
| Reject 候補 | 後続 review で判断 |

### 18.5 local branch 1 件保留メモ

- branch: `docs/tour-ops-claude-code-reviewer-trial-001`
- 状態: local 残存（親 worktree `/Users/takahashikazuo/projects/shogi` で checkout 中）
- remote: 削除済み（GitHub 上は完全 cleanup 済み）
- 対応方針：
  - 本 v0.2 Draft では **触らない**（§12.5 親 worktree 使用中 branch の扱いに従う）
  - 親 worktree 側で `git checkout main` を行った後、別 AR / 手動で削除する選択肢
  - もしくは放置（影響なし、reflog から復元可能）
- 強制削除する場合は別 AR + 明示 Approval Phrase（例：`承認：local branch docs/tour-ops-claude-code-reviewer-trial-001 強制削除`）。

---

## 19. 判定基準と完了条件（PR #132 Nice to Have 反映：役割分離）

### 19.1 判定基準（本 Draft の品質判定）

**成功条件**：

- v0.2 Draft 文書が PR #122〜#132 + AR-BRANCH-DELETE-PHASE1-BATCH-001 の成果を統合している
- v0.1 本体が削除・上書きされていない
- 既存 ops docs 11 件が破壊的に改訂されていない
- PR #131 / PR #132 Nice to Have が反映されている
- branch cleanup 実行結果（remote 11/11、local 10/11）が反映されている
- 後続 Action Request 案が提示されている
- 本 Draft の正式採用判断は後続タスクに委ねる構造になっている

**失敗条件**：

- v0.1 本体を削除 / 上書きしている
- 既存 ops docs 11 件を破壊的に改訂している
- 本 Draft 内で branch 削除 / Ready 化 / merge を実行している
- 自動化 / Bot / GitHub Actions / template 強制化を実装している
- Candidate を勝手に Adopt / Task 化している
- 後続タスクに着手している
- 他 repo に展開している

### 19.2 完了条件（本 PR の完了判定）

- docs-only ✅
- v0.2 Draft 文書（本 doc）が作成されている
- HANDOFF.md に最小限の履歴が追記されている
- `git diff --check` clean
- Draft PR が作成されている
- PR コメントに完了報告が投稿されている
- 次の Action Request 案が提示されている
- Ready 化 / merge / branch 削除は **未実行** で停止している

判定基準（§19.1）は **本 Draft の中身の良し悪し** を判定する基準、完了条件（§19.2）は **本 PR の作業が手順通りに終わったか** を判定する基準であり、両者を分離して記述する（PR #132 Nice to Have 反映）。

---

## 20. 結論

- **PR #122〜#132 + AR-BRANCH-DELETE-PHASE1-BATCH-001 で SHOGI-TOUR AI 非同期運用 Phase 1 + Phase 2 入口 + Phase 2 trial が完了** した。
- 本 v0.2 Draft はそれらを **1 本のルール本体に統合した「Draft」**。
- **既存 v0.1 本体は履歴資料として残し、本 Draft は v0.2 として併存**（正式採用は後続 `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` の判断後）。
- **Bot / GitHub Actions / template 強制化 / Candidate Registry / `ai_work_queue.md` / 自動 merge / 自動 branch 削除は v0.2 にも入れない**（Phase 2 中盤以降で別検討）。
- **branch cleanup 完了**（remote 11/11、local 10/11）により Phase 1 全体の累積が解消され、main HEAD = `7b51d28` で次フェーズに進む準備が整った。
- 本 Draft では **branch 削除を実行しない**（local 1 件残存中、§12.5 / §18.5 に従う）。
- 次の AR 候補は `AR-PR<N>-REVIEW-001`（本 Draft の Claude Code Reviewer read-only review）。
