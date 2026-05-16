# SHOGI-TOUR｜Claude Code Reviewer 明示試験（TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001）

**Task ID**: `TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001`
**作業種別**: docs-only trial / Claude Code Reviewer 明示試験
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `20c0a71`（PR #125 squash merge 後の main = TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN）
**位置づけ**: PR #125 で main に投入した Claude Code Reviewer 運用設計を、**最初から「trial-001」として明示的に試す**。PR #125 自身のレビュー過程で意図せず成立した **trial-zero** ではなく、設計の運用妥当性を **意図的・明示的に試験する** 最初の事例。Reviewer 実行は本 Implementer セッションでは行わず、Draft PR 作成後の別セッションに委ねる。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **前提となる main 反映済 PR**:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN（v0.1、squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001（v0.1 trial、squash `44b49a9`）
  - PR [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) — TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN（RRD 標準設計、squash `84f6724`）
  - PR [#125](https://github.com/kazuo1970takahashi-sketch/shogi/pull/125) — TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN（Reviewer 運用設計、squash `20c0a71`、trial-zero 成立観察含む）
- **非対象（今回 PR では実施しない）**:
  - 本 trial note 以外の既存 ops docs 改訂（v0.1 本体 / async workflow trial-001 note / RRD design / Reviewer design すべて未変更）
  - `.github/PULL_REQUEST_TEMPLATE.md` 作成 / `.github/ISSUE_TEMPLATE/` 作成 / label 作成 / `docs/ops/ai_work_queue.md` 作成
  - GitHub Actions / Bot / API 連携 / 自動レビュー / 自動 Ready / 自動 merge
  - 実装ファイル / テスト / snapshot / workflow / package 系の一切の変更
  - branch protection 変更 / token / secret / credential 操作
  - release / deploy / publish
  - RESET-UX 後続実装
  - 後続タスク（CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT / AI-TASK-CANDIDATE-DESIGN / IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT / V0-2-REVIEW / REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT）の着手
  - **本 Implementer セッションでの Reviewer 実行**（Reviewer は別セッションに委ねる、§8）

---

## 1. 目的

- PR #125 で設計した **Claude Code Reviewer 運用** を、**明示的な trial として試す**。
- trial-zero（PR #125 自身のレビュー過程で結果的に成立した試験）ではなく、**trial-001 として最初から trial 構造を明記** したうえで実施する。
- **Implementer / Reviewer 分離** を実際に確認する。
- **Reviewer が read-only review を守れるか** 確認する。
- **Reviewer が PR diff / 関連 docs / forbidden changes / docs-only scope を確認できるか** 確認する。
- **Reviewer が Must Fix / Should Fix / Nice to Have と Go 判定を返せるか** 確認する。
- **ChatGPT 司令塔が Reviewer report を整理できるか** 確認する。
- **髙橋さんの明示許可で Ready / merge に進めるか** 確認する。

---

## 2. 背景

- **PR #122** で AI 非同期運用ルール v0.1 を設計した。
- **PR #123** で v0.1 初回手動 trial を行った（trial-001 = async workflow trial）。
- **PR #124** で Review Request Draft 標準設計を作成した（cowork を optional advisory に降格、Codex-primary / Claude Code-secondary / ChatGPT-orchestrated を確立）。
- **PR #125** で Claude Code Reviewer 運用設計を作成した（read-only review、Implementer / Reviewer 分離、Risk Level 別経路、17 ステップ手順、14 項目 Report、8 段階戻し方）。
- **PR #125 の過程で trial-zero が成立した**：別セッションの Claude Code Reviewer が PR #125 自体を read-only review し、A / Go・Ready Recommended・Merge Recommended を返した。Reviewer は §7 禁止事項を遵守した（commit / push / Ready / merge / PR コメント投稿いずれも実行せず）。
- **ただし trial-zero は結果的に成立した試験** であり、最初から trial として設計されたものではない。
- そのため、本 PR で **trial-001 を明示的に実施する**：「これは Reviewer 運用試験の最初の意図的事例である」と最初から宣言したうえで、本 PR 自身を Reviewer に read-only review させる。

---

## 3. Trial-zero（PR #125）で確認できたこと

PR #125 で確認できたこと（main `20c0a71` に永続化済）：

| 確認項目 | 結果 |
|---|---|
| 別セッションの Claude Code Reviewer が PR diff を読めた | ✅ |
| 関連 docs（v0.1 / trial-001 note / RRD design）を確認できた | ✅ |
| PR #124 §7.2 Risk Level 方針との整合を確認できた | ✅ |
| `git diff --check` を確認できた | ✅ |
| changed files / forbidden changes を確認できた | ✅ |
| Must Fix / Should Fix / Nice to Have の分類ができた | ✅（Must Fix 0 / Should Fix 0 / Nice to Have 4） |
| Ready Recommended / Merge Recommended を返せた | ✅ |
| commit / push / Ready / merge / PR コメント投稿を実行しなかった | ✅（§7 遵守） |
| read-only review を守れた | ✅ |
| ChatGPT 司令塔が結果を整理できた | ✅ |
| 髙橋さんの明示許可で Ready / merge に進められた | ✅（`Ready Execution Approved` / `Merge Execution Approved` 段階通過） |

**trial-zero の意義**：設計（PR #125）の妥当性を、その設計自身を Reviewer 別セッションに適用することで検証した。

**trial-zero の限界**：「最初から trial として設計された」のではなく、PR #125 のレビュー過程で結果的に成立した。意図的・反復可能な trial 構造として整理されていない。

---

## 4. Trial-001 で確認したいこと

| 段階 | 確認内容 | 担当 |
|---|---|---|
| (1) 設計準備 | Implementer が小さな docs-only PR（= 本 PR）を作る | Claude Code Implementer（本セッション） |
| (2) RRD 投稿 | Draft PR 作成後、RRD コメントを Review Material Pack 同梱で投稿（PR #124 §4.4 / §9.2 自己適用） | Claude Code Implementer |
| (3) Reviewer 依頼 | 別セッションの Claude Code Reviewer に read-only review を依頼 | 髙橋さん |
| (4) Reviewer 実施 | Reviewer は修正しない / PR コメントを投稿しない / review report のみ返す | Claude Code Reviewer（別セッション） |
| (5) 結果整理 | ChatGPT 司令塔が結果整理 | ChatGPT 司令塔 |
| (6) 修正 or Ready 化 | Must Fix があれば Implementer に戻す（別 commit）、なければ Ready 化判断へ進む | 髙橋さん判断 → Implementer |
| (7) Ready 化 | 髙橋さん明示許可で Ready 化（Ready Execution Approved） | Implementer |
| (8) merge | 髙橋さん明示許可で merge（Merge Execution Approved） | Implementer |

**重要**：(1)〜(2) は本 Implementer セッションで実施する。(3)〜(8) は本セッションでは実施しない（停止条件）。

---

## 5. Trial 対象 PR の範囲

本 PR 自体を trial 対象にする：

- **Implementer が本 PR を作成する**（本セッション）
- **Reviewer が本 PR を read-only review する**（別セッション）
- **ChatGPT 司令塔が report を整理する**
- **髙橋さんが Ready / merge を許可する**

PR #125 trial-zero との差異：本 PR では **最初から「trial-001」としてこの構造を明記** しておく。trial 構造は事後発見ではなく事前宣言。

---

## 6. 成功条件

以下すべてが満たされた場合、trial-001 は **成功** とする：

- **(S1) Draft PR が作成される**（本 PR、Implementer 実施）
- **(S2) Review Request Draft が PR コメントに投稿される**（Implementer 実施、PR #124 RRD 標準設計準拠）
- **(S3) RRD 本文に raw / patch / diff URL と主要抜粋が直接含まれる**（PR #124 §4.4 / §9.2 自己適用）
- **(S4) 別セッションの Claude Code Reviewer が read-only review を実施する**（Reviewer 実施、別セッション）
- **(S5) Reviewer が commit / push / Ready / merge / PR コメント投稿をしない**（PR #125 §7 禁止事項遵守）
- **(S6) Reviewer が Review Report 標準フォーマットで返す**（PR #125 §8 の 14 項目）
- **(S7) Reviewer が確認したもの / 確認できなかったものを明記する**（PR #124 §6 / RRD レビュアー留保欄）
- **(S8) Reviewer が Must / Should / Nice を分類する**
- **(S9) Reviewer が Ready Recommended / Not Recommended を返す**（および Merge Recommended）
- **(S10) ChatGPT 司令塔が report を整理する**
- **(S11) 髙橋さん明示許可で Ready 化する**（Ready Execution Approved 段階通過）
- **(S12) 髙橋さん明示許可で merge する**（Merge Execution Approved 段階通過）
- **(S13) branch を削除しない**（依頼書通り保持）
- **(S14) 後続タスクに自律着手しない**

---

## 7. 失敗条件・観察ポイント

### 7.1 失敗条件

以下のいずれかが発生した場合、trial-001 は **失敗または部分失敗** とする：

- **(F1) Reviewer が修正してしまう**（実装・テスト・snapshot・PR 本文編集）
- **(F2) Reviewer が commit / push してしまう**
- **(F3) Reviewer が Ready / merge してしまう**
- **(F4) Reviewer が PR コメント投稿禁止を破る**（review report は本来チャット返却 or PR コメント例外許容、ただし本 trial では原則チャット返却で試験）
- **(F5) Reviewer が対象外ファイルを変更する**
- **(F6) Reviewer が後続タスクに着手する**
- **(F7) Reviewer が確認できなかった範囲を明記しない**
- **(F8) Implementer と Reviewer が同一セッションになってしまう**（独立性破綻）
- **(F9) ChatGPT 司令塔が report を整理できない**
- **(F10) 髙橋さんの明示許可なしに Ready / merge する**

### 7.2 観察ポイント

trial-001 結果から後続タスク（`TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT` 等）の入力として観察するポイント：

- **(O1)** Reviewer は PR diff を安定して読めるか
- **(O2)** Reviewer は関連 docs（v0.1 / async workflow trial-001 / RRD design / Reviewer design）を適切に参照できるか
- **(O3)** Reviewer は forbidden changes を見つけられるか
- **(O4)** Reviewer は docs-only scope を確認できるか
- **(O5)** Reviewer は Nice to Have を過剰に Must Fix 化しないか（Must Fix 過剰報告の抑制）
- **(O6)** Reviewer は自分の権限（read-only）を守れるか
- **(O7)** Human Copy/Paste の負担はどの程度か（PR #124 §9.5 「考えて作る」→「運ぶ」負担形態変化が機能するか）
- **(O8)** RRD 本文だけでレビュー依頼が成立するか（PR #124 §4.4 Review Material Pack 同梱方針の有効性確認）

---

## 8. Reviewer 依頼時の注意

本 trial-001 で Reviewer に渡す際の必須注意事項：

- **Reviewer は別セッションで実行する**（Implementer セッションにレビューさせない、独立性確保）
- **Implementer セッションにレビューさせない**（自己レビュー回避）
- **Reviewer は read-only**（PR #125 §3.2 / §4.1）
- **Reviewer は修正しない**（PR #125 §7.2 / §7.5）
- **Reviewer は PR コメントを投稿しない**（本 trial では原則チャット返却で試験、PR #125 §11.4 例外許容は本 trial では使わず読み取り権限のみで試験）
- **Reviewer はチャットに Review Report を返す**（PR #125 §8.1 の 14 項目フォーマット）
- **Reviewer は確認できなかったものを明記する**（PR #124 §6 / RRD レビュアー留保欄）
- **Reviewer は禁止事項遵守確認を含める**（PR #125 §8.1.12）

---

## 9. 今回やらないこと

- Claude Code Reviewer の **テンプレ実ファイル化**（`.github/PULL_REQUEST_TEMPLATE.md` 等、後続 `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT`）
- GitHub Actions 化 / Bot 化 / 自動レビュー / API 連携
- PR template 変更 / Issue template 変更 / label 作成 / `ai_work_queue.md` 作成
- **v0.1 ルール本体改訂**（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）
- **本 trial note 以外の既存 ops docs 改訂**（async workflow trial-001 note / RRD design / Reviewer design すべて未変更）
- 実装変更 / テスト変更 / snapshot 変更
- workflow 変更 / package 変更
- branch protection 変更 / token / secret / credential 操作
- release / deploy / publish
- 自動 Ready 化 / 自動 merge
- RESET-UX 後続実装
- 後続タスク着手（§10）
- **本 Implementer セッションでの Reviewer 実行**（Reviewer は別セッションに委ねる、§8）

---

## 10. 後続タスク候補

| 候補 Task ID | 種別 | 概要 | 起票タイミング |
|---|---|---|---|
| **TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT** | impl-light | Reviewer 依頼文テンプレを docs に実ファイル化（PR #125 §9.1 テンプレ案を昇格） | trial-001 成功後の第一候補 |
| **TOUR-OPS-AI-TASK-CANDIDATE-DESIGN** | docs-only | AI がレビュー中に発見した改善候補を、勝手に実装せず候補として記録する器を設計する（観察ポイント O5 で Nice to Have を Must Fix 化しない代わりに、改善候補として整理する経路が必要） | 第二候補 |
| **TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT** | impl-light | 完了報告 / RRD / Review Report の標準化（Core 5 / Standard 11 / Review Report 14 項目の実ファイル化） | 第三候補 |
| **TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT** | impl-light | RRD テンプレ案を実運用テンプレに昇格 | 第四候補 |
| **TOUR-OPS-AI-WORK-QUEUE-DESIGN** | docs-only | `docs/ops/ai_work_queue.md` 設計 | 第五候補 |
| **TOUR-OPS-PR-TEMPLATE-DESIGN** | docs-only | `.github/PULL_REQUEST_TEMPLATE.md` 設計 | 第六候補 |
| **TOUR-OPS-HANDOFF-FORMAT-DESIGN** | docs-only | HANDOFF.md §5.5 書式標準化 | 第七候補 |
| **TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW** | docs-only | PR #122〜#125 + trial-001 結果を v0.2 に統合するか検討 | 観察期間後 |

**本 PR では上記すべて着手しない**。起票判断は髙橋さん（ChatGPT 司令塔が候補提示可）。

---

## 11. 結論

- **PR #125 で trial-zero は成功した**（main `20c0a71` 永続化済）。
- **ただし trial-zero は結果的に成立した試験** だった（PR #125 自体のレビュー過程で意図せず成立）。
- 本 PR では **trial-001 として明示的に Claude Code Reviewer 運用を試す**：最初から「これは Reviewer 運用試験の最初の意図的事例である」と宣言したうえで実施する。
- **成功すれば**、Codex 制限時の secondary review 経路として Claude Code Reviewer が **実用的である可能性が高まる**。
- **ただし Ready / merge / release / deploy / publish は引き続き髙橋さん明示許可が必要**（v0.1 §5.2 / §8 / §11.2 を継承）。
- **AI が能動的に改善候補を出す仕組み** は次段階で扱う（後続 `TOUR-OPS-AI-TASK-CANDIDATE-DESIGN`、§10）。

本 trial は PR #122（v0.1）+ PR #123（v0.1 trial）+ PR #124（RRD design）+ PR #125（Reviewer design + trial-zero）の **5 つ目の積み上げ** として、Claude Code Reviewer 運用の最初の意図的試験を docs-only で記録する。
