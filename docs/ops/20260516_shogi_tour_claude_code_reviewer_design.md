# SHOGI-TOUR｜Claude Code Reviewer 運用設計（TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN）

**Task ID**: `TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN`
**作業種別**: docs-only design / Claude Code Reviewer 運用設計
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `84f6724`（PR #124 squash merge 後の main = TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN）
**位置づけ**: PR #124 で main 投入した RRD 標準設計（`Codex-primary / Claude Code-secondary / ChatGPT-orchestrated review` 方針）の **secondary reviewer = Claude Code Reviewer** を、Claude Code Implementer と分離した「**見る専用エージェント**」として docs-only で設計する。実運用・自動化・テンプレ実ファイル化には進まない。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **前提となる main 反映済 PR**:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN（v0.1、squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001（trial-001 観察、squash `44b49a9`）
  - PR [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) — TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN（RRD 標準設計、squash `84f6724`）
- **非対象（今回 PR では実施しない）**:
  - Claude Code Reviewer の **実運用**
  - `.github/PULL_REQUEST_TEMPLATE.md` 作成 / `.github/ISSUE_TEMPLATE/` 作成 / label 作成 / `docs/ops/ai_work_queue.md` 作成
  - GitHub Actions / Bot / API 連携 / 自動レビュー
  - 自動 Ready 化 / 自動 merge
  - v0.1 ルール本体（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）改訂
  - trial-001 note（`docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md`）改訂
  - RRD design（`docs/ops/20260516_shogi_tour_review_request_template_design.md`）改訂
  - 実装ファイル / テスト / snapshot / workflow / package 系の一切の変更
  - RESET-UX 後続実装
  - 後続タスク（CLAUDE-CODE-REVIEWER-TRIAL-001 / CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT / IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT / V0-2-REVIEW / REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT）の着手

---

## 1. 目的

- PR #124 で定義した **RRD 標準設計** を前提にする（`Codex-primary / Claude Code-secondary / ChatGPT-orchestrated review` 方針、`docs/ops/20260516_shogi_tour_review_request_template_design.md` §3 / §7）。
- **Codex 利用制限時の secondary reviewer** として Claude Code Reviewer を設計する。
- **Claude Code Implementer と Claude Code Reviewer を分離** する（「**作る Claude**」と「**見る Claude**」を分ける）。
- 目的は Codex が使えないときにも、**一定品質の独立レビュー** を維持すること。
- ただし **Codex 完全代替ではなく**、リスクレベルに応じて Codex 待ち / 人間判断 / ChatGPT 司令塔判断を使い分ける。

---

## 2. 背景

- **Codex は GitHub diff / repo 直視レビューの primary reviewer**（PR #124 §3.1）。
- しかし **利用制限により常時使えるとは限らない**（クォータ・レート制限・コンテキスト枯渇）。
- **cowork は GitHub 接続が不安定で、標準 fallback には向かない**（PR #123 / PR #124 trial で確認）。
- PR #124 で **cowork は optional advisory reviewer に下げた**（GitHub 直読み期待しない、貼付本文ベースの補助意見のみ）。
- そのため Codex 制限時の **secondary reviewer として Claude Code Reviewer を設計する必要がある**。
- **Claude Code は repo / diff / files を確認できる** ため、secondary reviewer として有力。
- **ただし Claude Code Implementer と同一セッションでレビューすると独立性が弱い**（自己レビューになる）。よって役割分離を明確化する。

---

## 3. 用語定義

### 3.1 Claude Code Implementer

**役割**：
- branch 作成
- docs / code 変更
- commit / push
- Draft PR 作成
- PR コメント投稿
- 完了報告作成
- HANDOFF.md 追記

**禁止**：
- **自己承認**（自分が作った PR を自分が Reviewer 役で「OK」と判定すること）
- **自律 Ready 化**（髙橋さん明示許可なしの Ready for review 化）
- **自律 merge**（髙橋さん明示許可なしの squash merge）
- **レビュー結果の握りつぶし**（Must Fix を Should Fix に勝手に降格させる等）

### 3.2 Claude Code Reviewer

**役割**：
- PR 差分確認
- repo / related docs / tests / forbidden changes 確認
- Must Fix / Should Fix / Nice to Have 分類
- Go / Conditional Go / No Go 判定
- review report 作成
- 修正指示案の作成

**禁止（強い）**：
- **commit**
- **push**
- **Ready 化**
- **merge**
- **branch 削除**
- **release / deploy / publish**
- **修正実行**
- **PR 本文の勝手な変更**
- **workflow / package / token / branch protection 操作**
- 詳細は §7 を参照

### 3.3 ChatGPT 司令塔

**役割**：
- Reviewer 結果整理
- Must Fix / Should Fix / Nice to Have の **再分類**
- Ready 化 / merge 判断支援（推奨判断 = `Recommended` 段階まで）
- Claude Code Implementer への **修正依頼文作成**（Full Prompt / Short Prompt）
- 後続タスク判断

**注意**：
- **final 決定者ではない**
- 髙橋さんの明示許可が必要な操作を **自律許可しない**

### 3.4 Codex

**役割**：
- **primary reviewer**
- GitHub diff / repo 直視レビュー
- 技術的独立レビュー

**注意**：
- **利用制限時は待つか secondary reviewer（Claude Code Reviewer）を使う**

### 3.5 cowork

- **optional advisory reviewer**（PR #124 §3.5 通り）
- 本設計の secondary reviewer 経路には **入らない**

### 3.6 Grok

- **excluded / not used**（PR #124 §3.6 通り）

---

## 4. Reviewer 独立性ルール

### 4.1 原則

- **Claude Code Implementer と Claude Code Reviewer は分離する**。
- 同一セッションで「**自分が作った PR をレビュー**」しない。
- 可能なら **別 Claude Code セッション / reviewer agent** として扱う。
- Reviewer は **read-only review**。
- Reviewer は **修正しない**。
- Reviewer は修正が必要な場合、**修正依頼案を返す**。
- **Implementer が修正する**（別 Claude Code セッション / 同一セッションで指示を受けた後 commit）。
- **再レビューは Reviewer または Codex** が行う。

### 4.2 独立性レベル

| Level | 名称 | 担当 | 適用範囲 | Go 判定可否 |
|---|---|---|---|---|
| **Level A** | 高独立 | **Codex レビュー** または **別 Claude Code Reviewer セッション**（Implementer とは別文脈） | すべての Risk Level | ◎ Go 判定可 |
| **Level B** | 中独立 | **Claude Code Reviewer**（同じ repo context を持つが、Implementer とは別依頼・別レビュー指示、read-only 制限あり） | Risk Level 0〜3 | ○ Go 判定可（Level 3 以上は Codex クロスチェック推奨） |
| **Level C** | 低独立 | **Implementer が self-check** | Draft PR 前の品質確認のみ | ✗ review として Go 判定には使わない |

**判断指針**：
- Risk Level 0〜2：Level B でも実用可（Codex 制限時の secondary review）
- Risk Level 3 以上：原則 Level A（Codex または別 Claude Code Reviewer セッション）
- Level C は「review」ではなく Implementer の自己品質確認、Go / Conditional Go / No Go 判定には使わない

### 4.3 同一セッションでの Reviewer 役兼任

やむを得ず Implementer 同一セッションで Reviewer 役を兼任する場合：
- 「**Level B 中独立 / 自己レビューに近い**」と明記
- Codex 利用可能時に **クロスチェック推奨** と review report に記載
- ChatGPT 司令塔が結果整理時に「独立性が弱い」フラグを付与
- 髙橋さん明示許可時にこのフラグを考慮した判断を求める

---

## 5. Risk Level 別の使い分け（v0.1 §7 / PR #124 §7.2 と整合）

### 5.1 Level 0：記録・整理 docs

**例**：HANDOFF 追記、closure note、status 整理、PR 一覧整理

**標準レビュー経路**：
- ChatGPT 司令塔レビューで可
- Claude Code Reviewer は **任意**
- Codex が使えれば使ってもよい

**Ready 判断**：
- ChatGPT 司令塔 A / Go で可
- 髙橋さん明示許可は必要

### 5.2 Level 1：docs-only design / trial

**例**：design doc、trial note、本 PR

**標準レビュー経路**：
- **Codex-primary**
- Codex 制限時は **Claude Code Reviewer-secondary**（Level B 独立）
- 低リスクなら ChatGPT 司令塔レビューでも可（PR #124 で実例）

**Ready 判断**：
- Must Fix なしなら Ready 可
- **内容が運用ルールに影響する場合は Claude Code Reviewer または Codex 推奨**

### 5.3 Level 2：IMPL-LIGHT

**例**：文言 1 行変更、テスト期待値 1〜2 行追加、HANDOFF 最小追記

**標準レビュー経路**：
- **Codex-primary**
- Codex 制限時は **Claude Code Reviewer-secondary**（Level B 独立、別セッション推奨）

**Ready 判断**：
- 実装・テスト・変更範囲確認が必要
- Claude Code Reviewer は **read-only で diff / test / forbidden changes を確認**
- **ChatGPT 司令塔単独では原則 Ready 判断しない**（Codex / Claude Code Reviewer のいずれかが必須）

### 5.4 Level 3 以上：UX 導線 / ロジック / データ / セキュリティ影響

**例**：alert / confirm / toast / button 変更、reset logic、localStorage、pairing、participant state、master data

**標準レビュー経路**：
- **Codex または Claude Code Reviewer の独立レビュー必須**（Level A 独立推奨）
- Codex も Claude Code Reviewer も使えない場合は **原則待つ**
- **人間判断必須**

**Ready 判断**：
- **ChatGPT 司令塔単独不可**
- **cowork 代替不可**

---

## 6. Claude Code Reviewer の標準レビュー手順

以下の 17 ステップで実施する：

1. **PR 番号 / branch / head SHA / base を確認**
2. **PR state / draft 状態 / mergeable を確認**（gh pr view --json で取得可能）
3. **changed files を確認**（パス + 行数 + ADDED / MODIFIED / DELETED）
4. **diff を確認**（git diff、または gh pr diff、または raw URL）
5. **変更ファイル本文を確認**（commit SHA 固定 raw URL 経由が望ましい）
6. **関連 docs / 関連実装ファイルを確認**（v0.1 / trial-001 note / RRD design / HANDOFF.md 等）
7. **変更してはいけないファイルが変わっていないか確認**（forbidden files / scope 違反検出）
8. **docs-only なら docs-only を検証**（実装ファイル・テスト・snapshot 等が含まれていないか）
9. **実装 PR ならテスト結果 / 影響範囲を確認**（unit / E2E / VRT、affected callsite、rollback 影響）
10. **token / secret / credential / workflow / package / branch protection を確認**（不適切変更なし）
11. **v0.1 / RRD 設計 / HANDOFF との整合を確認**（v0.1 §3 / §5 / §6 / §8 / §11 / §12 / RRD §3-§9 と矛盾しないか）
12. **Must Fix / Should Fix / Nice to Have を分類**（RRD §4.6 基準）
13. **Go / Conditional Go / No Go を判定**（RRD §8.1 判定基準）
14. **Ready 化可否を判断**（Ready Recommended、推奨判断のみ、Execution Approved は髙橋さん明示許可後）
15. **merge 前修正要否を判断**（Merge Recommended、推奨判断のみ）
16. **review report を PR コメントまたはチャット報告として返す**（§8 標準フォーマット）
17. **修正は実行しない**（§7 禁止事項）

---

## 7. Claude Code Reviewer の禁止事項

**Reviewer は禁止**（commit/push/merge/release 全般 + 修正系 + 不適切変更系）：

### 7.1 git / GitHub 操作系

- **commit**
- **push**
- **Ready 化**（`gh pr ready`）
- **merge**（`gh pr merge` / `gh pr merge --squash` 等すべて）
- **main 直接 push**
- **branch 削除**（`git branch -d` / `git push --delete` / `gh pr merge --delete-branch`）
- **release 作成**（`gh release create`）
- **deploy / publish 系コマンド**

### 7.2 修正系

- **実装修正**（`shogi_v4.html` / `test/` / `test/e2e/` 等への書き込み）
- **テスト修正**
- **snapshot 更新**（VRT `*.png` 上書き）
- **PR 本文の勝手な変更**（`gh pr edit`）

### 7.3 インフラ系

- **workflow 変更**（`.github/workflows/`）
- **`package*.json` / lockfile 変更**
- **`playwright.config.js` 変更**
- **token / secret / credential 操作**
- **branch protection 変更**

### 7.4 周辺ファイル系

- **PR template / Issue template / label / `ai_work_queue.md` 作成**
- **unrelated cleanup**（レビュー対象外ファイルの整形・改修）
- **レビュー対象外 PR の操作**
- **後続タスクへの自律着手**

### 7.5 補足

**Reviewer は「見る」「分類する」「報告する」だけ**。

修正が必要と判断した場合は **修正依頼案を review report に含めて返す**（§8 / §10）。Implementer が別途実装する。

---

## 8. Review Report 標準フォーマット

Claude Code Reviewer が返す review report の標準形式：

### 8.1 必須項目（14 項目）

```markdown
## Review Report — PR #<N>（<Task ID>）by Claude Code Reviewer

### 1. 総合判定
- **A / Go** ／ **B+ / Conditional Go** ／ **No Go** のいずれか

### 2. 確認したもの
- PR 番号: #<N>
- head SHA: <sha>
- base: <base-sha>
- changed files: <list>
- diff: 確認済 / 部分確認 / 未確認
- 関連 docs: <list>
- 関連実装: <list>
- tests: 確認済 / 該当なし / 未確認
- forbidden changes: 未検出 / 該当なし

### 3. 確認できなかったもの
- なし、または留保事項を列挙
- 「raw URL <sha> 経由で本文確認できれば上書きレビュー可」等の上書き条件

### 4. Must Fix（merge blocker）
- なし、または項目を列挙（修正依頼案を §13 に）

### 5. Should Fix（merge blocker ではない）
- なし、または項目を列挙

### 6. Nice to Have（v0.2 / 後続 IMPL-LIGHT）
- なし、または項目を列挙

### 7. Risk Level 評価
- 依頼書通り（Level 0〜5）／ 修正案あり

### 8. 影響評価
- docs-only / implementation / data / security 影響の有無
- 各カテゴリで影響あれば内容

### 9. Ready 化判断（Ready Recommended）
- 可 ／ 条件付き可（Must Fix 反映後） ／ 不可

### 10. merge 前修正要否（Merge Recommended）
- 可 ／ 条件付き可 ／ 不可

### 11. 再レビュー要否
- 不要 ／ Codex クロスチェック推奨 ／ Must Fix 反映後再レビュー必須

### 12. Reviewer 禁止事項遵守確認
- ✅ commit / push / Ready / merge / 修正実行を一切していない
- ✅ workflow / package / token / branch protection 操作なし
- ✅ PR template / Issue template / label / `ai_work_queue.md` 操作なし
- ✅ unrelated cleanup なし
- ✅ 後続タスク着手なし

### 13. 修正依頼案
- Must Fix がある場合、Implementer 向けの修正依頼案を 1〜数行で
- 該当なしの場合は「なし」

### 14. 次アクション
- 例：ChatGPT 司令塔へ本 report を渡す → 結果整理 → Ready 化判断
- 例：Codex 利用可能時にクロスチェック
- 例：Implementer に修正依頼を渡す
```

### 8.2 出力先

- **PR コメント** に直接投稿することを推奨（後続レビュアー / ChatGPT 司令塔が参照しやすい）
- **チャット報告** のみでも可（GitHub への書き込み権限がない reviewer agent の場合）
- 両方に残してもよい

---

## 9. Claude Code Reviewer への依頼文テンプレ案

**注**：今回 PR では `.github/PULL_REQUEST_TEMPLATE.md` 等の実ファイル化はしない。docs 内に「テンプレ案」として記載するだけ。実ファイル化は後続 `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT` で扱う。

### 9.1 標準テンプレ（コピー用）

```markdown
## Claude Code Reviewer 依頼｜PR #<N>（<Task ID>）

### 宛先
**Claude Code Reviewer**（read-only review agent）

### 対象 PR
- Repo: kazuo1970takahashi-sketch/shogi
- PR: #<N>
- Branch: `<branch>`
- head SHA: `<head-sha>`
- Task ID: `<TASK-ID>`
- 作業種別: <docs-only design / IMPL-LIGHT 等>
- Risk Level: Level <0-5>

### Review-only / read-only 明記
このレビューは **read-only review** です。Reviewer は以下を **一切実行しない** でください：
- commit / push
- Ready 化 / merge
- branch 削除
- release / deploy / publish
- 実装修正 / テスト修正 / snapshot 更新
- PR 本文の変更
- workflow / package / token / branch protection 操作
- PR template / Issue template / label / `ai_work_queue.md` 作成
- unrelated cleanup
- 後続タスク着手

修正が必要と判断した場合は **修正依頼案を review report に含めて返す** のみ。Implementer が別途修正します。

### 確認してほしいファイル
- PR diff（`gh pr diff <N>` または `https://github.com/.../pull/<N>.diff`）
- changed files（パス + 行数 + ADDED/MODIFIED/DELETED）
- 主要変更ファイル本文（commit SHA 固定 raw URL 経由が望ましい）
- 関連 docs（v0.1 / trial-001 note / RRD design / HANDOFF.md 等）
- 関連実装ファイル（必要に応じて）
- forbidden changes 検出用：`shogi_v4.html` / `test/` / `test/e2e/` / snapshot / workflow / `package*.json` / lockfile / `playwright.config.js` / token / branch protection / PR template / Issue template / label / `ai_work_queue.md`

### 確認してはいけない操作
（§Review-only / read-only 明記 の禁止リストと同じ。再掲）

### レビュー観点
RRD §4.5 の 10 項目から該当を抜粋：
1. スコープ厳守
2. docs-only / 実装変更の整合
3. v0.1 ルールとの整合
4. trial-001 / RRD design との整合
5. Core 5 / Standard 11 の妥当性
6. Blocked By / Allowed Without / Requires Human Approval の明確さ
7. 危険操作の未実行確認
8. 後続タスク未着手確認
9. Ready 化してよいか（Ready Recommended）
10. merge 前修正が必要か（Merge Recommended）

### Must Fix / Should Fix / Nice to Have 基準
RRD §4.6 をそのまま継承：
- **Must Fix**：危険操作の実行/許可誤読 / docs-only スコープ違反 / v0.1 矛盾 / Ready / merge 自律実行記述 / token / workflow 不適切変更 / レビュー不能 / 対象 PR 不一致
- **Should Fix**：Next Owner 連鎖過多 / Core 5 / Standard 11 重複 / fallback URL 不足 / Review Material Pack 薄 / 観察結果記録先不明 / 留保条件不明 / Ready / merge 根拠弱
- **Nice to Have**：状態遷移図 / observation log 専用ファイル / mermaid / 後続タスク依存図 / テンプレ実ファイル化 / `ai_work_queue.md` 連携 / label / Issue template 連携

### Review Report 形式
本設計 §8.1 の 14 項目フォーマットで返してください。

### 停止条件
- review report 作成 → PR コメント投稿（または チャット報告）までで停止
- 修正は一切実行しない
- Ready 化 / merge は一切実行しない

### 修正禁止 / Ready 化禁止 / merge 禁止
明示的に再掲：**Reviewer は修正しない / Ready 化しない / merge しない**。
```

### 9.2 テンプレ管理

- 本 §9.1 のテンプレ案は **docs 内記載のみ**。
- 実ファイル化（`.github/PULL_REQUEST_TEMPLATE.md` 等）は **後続 `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT`** で扱う。

---

## 10. Implementer への戻し方

Reviewer が Must Fix / Should Fix を出した場合の標準フロー：

### 10.1 標準フロー（8 段階）

1. **Reviewer が review report を出す**（§8 フォーマット）
2. **ChatGPT 司令塔が Must / Should / Nice を再分類**（Reviewer 判定を尊重しつつ最終的な分類を確定）
3. **髙橋さんが修正方針を決める**（Must Fix を本 PR で直すか、別 PR にするか、降格させるか）
4. **Claude Code Implementer に修正依頼**（ChatGPT 司令塔が Full Prompt / Short Prompt を作成）
5. **Implementer が修正 commit**（PR 本体ブランチに追加 commit、または別 branch で別 PR）
6. **Reviewer または Codex が再レビュー**（修正後の diff に対して）
7. **Ready 化判断**（Ready Recommended → 髙橋さん明示許可 → Ready Execution Approved → 実行）
8. **merge 判断**（Merge Recommended → 髙橋さん明示許可 → Merge Execution Approved → 実行）

### 10.2 重要な原則

- **Reviewer は修正しない**。
- **Reviewer は修正依頼案を作るだけ**（§8.13）。
- Implementer が修正する。
- 再レビューは Reviewer または Codex。
- Reviewer 同一セッションでの修正実行は禁止（§4.3 / §7）。

---

## 11. PR コメント運用

### 11.1 論点

- Reviewer review report を PR コメントに残すか
- ChatGPT 司令塔に貼るか
- 両方に残すか
- RRD コメントとの関係
- 完了報告コメントとの関係
- observation log との関係

### 11.2 推奨運用

- **Reviewer review report は PR コメントに残す**（GitHub SSoT 原則、v0.1 §4）。
- **ChatGPT 司令塔にはその内容を貼る**（髙橋さんが PR コメント本文を ChatGPT に貼付）。
- **ChatGPT 司令塔が判断結果を整理する**（Must / Should / Nice 再分類、Ready / merge 推奨判断）。
- **必要なら ChatGPT 整理結果も PR コメントに戻す**（後続レビュアー / 別 AI が参照しやすい）。

### 11.3 PR コメント順序の推奨（RRD §9.3 を継承・拡張）

1. PR 本文（スコープ + Core 5 + Standard 11 + Forbidden Actions）
2. RRD コメント（Review Material Pack 同梱）
3. Claude Code Implementer 完了報告コメント
4. **Reviewer review report コメント（本設計の新規追加）**
5. 必要に応じて ChatGPT 司令塔判定整理コメント
6. 必要に応じて observation log コメント

### 11.4 Reviewer による PR コメント投稿の扱い

- 「Reviewer は read-only」と §7 で禁止しているが、**PR コメント投稿（gh pr comment）は review report の出力先として例外的に許容** する。
- ただし以下は依然禁止：
  - PR 本文の編集（`gh pr edit`）
  - 他コメントの編集 / 削除
  - PR の状態変更（Draft / Ready / merge / 削除）
  - PR への label / assignee / milestone 設定
- review report の PR コメント投稿は **「見る → 分類 → 報告」の "報告" 部分** であり、修正実行ではない。

---

## 12. 今回やらないこと

- **Claude Code Reviewer の実運用**（trial / 実 PR でのレビュー実施）
- GitHub Actions 化 / Bot 化 / 自動レビュー / API 連携
- **`.github/PULL_REQUEST_TEMPLATE.md` 作成** / `.github/ISSUE_TEMPLATE/` 作成
- **label 作成**（`ai:review-waiting` / `risk:light` 等）
- **`docs/ops/ai_work_queue.md` 作成**
- workflow 変更 / package 変更 / `playwright.config.js` 変更
- 実装変更 / テスト変更 / snapshot 変更 / CSS / layout 変更
- **v0.1 ルール本体改訂**（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）
- **trial-001 note 改訂**（`docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md`）
- **RRD design 改訂**（`docs/ops/20260516_shogi_tour_review_request_template_design.md`）
- **branch protection 変更**
- **token / secret / credential 操作**
- **release / deploy / publish**
- **自動 Ready 化 / 自動 merge**
- RESET-UX 後続実装
- 後続タスク着手（§13）

---

## 13. 後続タスク候補

| 候補 Task ID | 種別 | 概要 | 起票タイミング |
|---|---|---|---|
| **TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001** | docs-only trial | 小さな docs-only PR で Claude Code Reviewer を試す（Implementer 別セッション、または同一セッション + 独立性弱フラグ付き） | 第一候補 |
| **TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT** | impl-light | Claude Code Reviewer 依頼文テンプレを docs に実ファイル化（`.github/PULL_REQUEST_TEMPLATE.md` 等への組み込みは別途） | 第二候補 |
| **TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT** | impl-light | 完了報告 / RRD / Review Report の標準化（Core 5 / Standard 11 / Review Report 14 項目の実ファイル化） | 第三候補 |
| **TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT** | impl-light | RRD テンプレ案を実運用テンプレに昇格 | 第四候補 |
| **TOUR-OPS-AI-WORK-QUEUE-DESIGN** | docs-only | `docs/ops/ai_work_queue.md` 設計 | 第五候補 |
| **TOUR-OPS-PR-TEMPLATE-DESIGN** | docs-only | `.github/PULL_REQUEST_TEMPLATE.md` 設計 | 第六候補 |
| **TOUR-OPS-HANDOFF-FORMAT-DESIGN** | docs-only | HANDOFF.md §5.5 書式標準化 | 第七候補 |
| **TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW** | docs-only | v0.1 / trial-001 / RRD design / Claude Code Reviewer design の結果を v0.2 に反映するか検討 | 観察期間後 |

**本 PR では上記すべて着手しない**。起票判断は髙橋さん（ChatGPT 司令塔が候補提示可）。

---

## 14. 結論

- **Codex primary は維持する**（PR #124 §3.1、本設計 §3.4）。
- **Claude Code Reviewer を secondary reviewer として設計する**（本設計 §3.2、Codex 利用制限時の代替）。
- **Claude Code Implementer と Reviewer を分離する**（§3.1 / §3.2 / §4、「作る Claude」と「見る Claude」を分ける）。
- **Reviewer は read-only review 原則**（§4.1）。
- **Reviewer は修正しない**（§7 / §10）。
- **Reviewer は report を出す**（§8 標準 14 項目フォーマット）。
- **ChatGPT 司令塔がレビュー結果を整理する**（§3.3 / §10 / §11）。
- **髙橋さんの明示許可なしに Ready / merge はしない**（v0.1 §5.2 / §8 / §11.2 を継承）。
- **cowork は optional advisory のまま**（PR #124 §3.5 通り、本設計の secondary 経路には入らない）。
- **Grok は使わない**（PR #124 §3.6 通り）。
- **今回は設計のみ** であり、実運用には進まない。実運用は後続 `TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001` で扱う。

本設計は v0.1 ルール本体（PR #122）+ trial-001 観察（PR #123）+ RRD 標準設計（PR #124）の **4 つ目の積み上げ** として、Codex 利用制限時の secondary reviewer 経路を docs-only で確立する。後続 trial / IMPL-LIGHT への **必須入力** となる。
