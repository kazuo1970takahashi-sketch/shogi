# SHOGI-TOUR｜Action Request 標準設計（TOUR-OPS-ACTION-REQUEST-DESIGN）

**Task ID**: `TOUR-OPS-ACTION-REQUEST-DESIGN`
**作業種別**: docs-only design / Action Request 標準設計
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `f989514`（PR #126 squash merge 後の main = TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001）
**位置づけ**: PR #122〜#126 で積み上げた「作る AI / 見る AI / 整理する AI / 許可する人」の分担を前提に、PR コメント上で次の実行候補を **Action Request** として標準形式で残し、髙橋さんが短い **Approval Phrase** で Ready 化 / squash merge / 修正依頼 / 再レビュー / 後続タスク着手などを許可できるようにする半自動化の前段設計。実運用・自動化・テンプレ実ファイル化・GitHub Actions / Bot 化には進まない。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **前提となる main 反映済 PR**:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN（v0.1、squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001（v0.1 trial、squash `44b49a9`）
  - PR [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) — TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN（RRD 標準設計、squash `84f6724`）
  - PR [#125](https://github.com/kazuo1970takahashi-sketch/shogi/pull/125) — TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN（Reviewer 運用設計、squash `20c0a71`）
  - PR [#126](https://github.com/kazuo1970takahashi-sketch/shogi/pull/126) — TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001（Reviewer 明示試験、squash `f989514`）
- **非対象（今回 PR では実施しない）**:
  - Action Request の実運用（本 PR 完了報告で 1 件の Action Request 案を提示するのは本設計のセルフ適用例であり、実運用展開ではない）
  - Action Request テンプレ実ファイル化（`.github/PULL_REQUEST_TEMPLATE.md` / Issue template / label / `docs/ops/ai_work_queue.md` 作成）
  - GitHub Actions / Bot / API 連携 / 自動 Action Request 生成 / 自動承認 / 自動 Ready / 自動 merge
  - 既存 ops docs 改訂（v0.1 本体 / async workflow trial-001 note / RRD design / Claude Code Reviewer design / Claude Code Reviewer trial-001 note いずれも未変更）
  - 実装ファイル / テスト / snapshot / workflow / package 系の一切の変更
  - branch protection 変更 / token / secret / credential 操作
  - release / deploy / publish / branch 削除
  - RESET-UX 後続実装
  - 後続タスク（ACTION-REQUEST-TRIAL-001 / ACTION-REQUEST-TEMPLATE-IMPL-LIGHT / AI-TASK-CANDIDATE-DESIGN / CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT / ASYNC-AI-WORKFLOW-IMPL-LIGHT / REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT / V0-2-REVIEW）の着手

---

## 1. 目的

本設計の目的は次のとおり。

- 髙橋さんの **長文コピペ負担を減らす**。
- PR コメント上に **Action Request を標準形式で残す**（実行候補の標準化）。
- 髙橋さんが **短い承認文（Approval Phrase）** で Ready 化 / squash merge / 修正依頼 / 再レビュー / 後続タスク着手などを許可できるようにする。
- AI は **承認前提の実行候補を提示するだけ** であり、勝手に実行しない。
- 完全自動化ではなく、**半自動化に向けた前段階** として位置付ける。
- v0.1 §11.2 Short Prompt の考え方（「許可後の伝達を短くする形式」「許可そのものではない」「明示許可後の実行指示伝達」）を、**より運用しやすい形に整理** する（Action Request という命名で実行候補と承認文を分離し、有効条件を明文化する）。
- 最終判断者は **髙橋さん** である。
- ChatGPT 司令塔は **判断支援・整理役** であり、final 決定権者ではない。

---

## 2. 背景

### 2.1 これまでの積み上げ

- **PR #122** で AI 非同期運用ルール v0.1 を設計した（Core 5 / Standard 11 / Short Prompt / Blocked By 可視化 / Phase 1 段階導入）。
- **PR #123** で v0.1 初回 trial を行った（PR 本文に Core 5 / Standard 11、PR コメントに Review Request Draft、完了報告コメント、cowork レビュー留保観察）。
- **PR #124** で Review Request Draft 標準設計を作成した（Codex-primary / Claude Code-secondary / ChatGPT-orchestrated、Review Material Pack、raw / patch / diff URL 直接同梱、レビュアー留保欄標準化）。
- **PR #125** で Claude Code Reviewer 運用設計を作成した（Implementer / Reviewer 分離、read-only review、独立性レベル A/B/C、17 ステップ手順、14 項目 Report、8 段階戻し方）。
- **PR #126** で Claude Code Reviewer trial-001 が成功した（別セッション Reviewer による read-only review、A / Go、Ready Recommended、Merge Recommended、§7 禁止事項遵守を実証）。

### 2.2 役割分担は固まってきた

| 役割 | 担当 | 出力 |
| --- | --- | --- |
| 作る AI | Claude Code Implementer | commit / push / Draft PR / Review Request Draft / 完了報告 |
| 見る AI | Claude Code Reviewer / Codex / (cowork) | read-only review report（A / B+ / No Go、Must / Should / Nice） |
| 整理する AI | ChatGPT 司令塔 | レビュー結果整理、依頼文骨子、承認文案、Must/Should/Nice 再分類 |
| 許可する人 | 髙橋さん | Ready 化 / merge / 危険操作の明示許可（final 決定） |

### 2.3 残っている課題

- それでも依然として **髙橋さんの長文コピペ負担が大きい**。
- 現在の流れ：
  1. ChatGPT 司令塔が長い依頼文を作る
  2. 髙橋さんが Claude Code Implementer / Reviewer に **コピペ** する
  3. Claude Code が実行・報告する
  4. 髙橋さんが報告を ChatGPT に **コピペ** する
  5. ChatGPT が次の長い依頼文を作る
  6. 髙橋さんが再び **コピペ** する
- この方式は **安全だが** 髙橋さんの **コピペ負担が大きい**。
- **次の課題は、実行許可のやり取りを短文化すること** である。

### 2.4 本設計の意図

- AI が PR コメントに **次の実行候補を Action Request として残す**。
- 髙橋さんは、その Action Request を見て **短い Approval Phrase で許可する**。
- AI は **承認なしには実行しない**（v0.1 §11.2 と整合）。
- Action Request は **実行候補** であり、**実行許可ではない**。
- Approval Phrase が **対応する Action Request の Target / Action / Scope と一致** したときだけ実行可能になる。
- これにより、髙橋さんの長文コピペは「**承認文 1 行**」に短縮できる（許可後の伝達は AI 間で完結）。

---

## 3. 用語定義

### 3.1 Action Request

AI が PR コメントまたは完了報告内に残す「**次に実行してよい候補操作**」の標準ブロック。

例：
- Ready 化依頼
- squash merge 依頼
- 修正依頼（Must Fix / Should Fix 反映）
- 再レビュー依頼
- 後続タスク起票依頼
- docs-only 微修正依頼

Action Request は **実行候補** であり、**実行許可ではない**。承認なしに AI は実行しない。

### 3.2 Approval Phrase

髙橋さんが短く許可を出すための **承認文**。

例：
- `承認：PR #126 Ready化`
- `承認：PR #126 squash merge`
- `承認：PR #127 Must Fix 修正依頼`
- `承認：TOUR-OPS-AI-TASK-CANDIDATE-DESIGN 着手`
- `承認：PR #128 Claude Code Reviewer read-only review`

Approval Phrase は **対応する Action Request が存在し**、**Target / Action / Scope が一致** したときだけ有効。

### 3.3 Execution Boundary

承認された操作の **範囲**。
- 対象 PR / 対象 Task ID
- 対象操作（Ready / merge / 修正 / 再レビュー / 後続タスク着手）
- 対象 branch
- 期待 head SHA（race condition 防止）
- 禁止事項（branch 削除 / release / deploy / publish / main 直接 push / workflow / package / token / branch protection / PR template / Issue template / label / `ai_work_queue.md` 作成 / 後続タスク着手 など）
- 実行範囲（docs-only / 指定ファイルのみ / 指定 commit のみ など）

### 3.4 Precondition

実行前に **必ず確認すべき条件**。
- PR state（OPEN / CLOSED / MERGED）
- isDraft（Draft / Ready）
- mergeable（MERGEABLE / CONFLICTING / UNKNOWN）
- mergeStateStatus（CLEAN / BLOCKED / BEHIND / DIRTY 等）
- head SHA（期待値と一致するか）
- changedFiles（想定範囲内か）
- docs-only 確認（想定外ファイルが含まれていないか）
- forbidden changes なし（workflow / package / snapshot / token / branch protection 等が変わっていないか）
- working tree clean
- `git diff --check` clean

### 3.5 Forbidden Actions

**承認があっても実行してはいけない操作**（別許可が必要、または常時禁止）。
- branch 削除（常に別許可）
- release / deploy / publish（常に別許可）
- main 直接 push（常に禁止）
- workflow 変更（`.github/workflows/`）
- package / lockfile 変更
- token / secret / credential 操作
- branch protection 変更
- PR template / Issue template 変更
- label 作成
- `ai_work_queue.md` 作成
- 後続タスク着手（別 Action Request + 別 Approval Phrase が必要）
- 対象外 PR への操作
- unrelated cleanup / unrelated refactor

---

## 4. Action Request の基本原則

以下を本設計の基本原則として明文化する。

1. **Action Request は実行候補であり、実行許可ではない**。
2. AI は Action Request を出せるが、**承認なしに実行しない**。
3. **Approval Phrase があって初めて実行可能になる**（v0.1 §11.2 と整合）。
4. Approval Phrase は **Target / Action / Scope が明確な場合のみ有効**。
5. **曖昧な承認文では実行しない**（§7.2 無効例参照）。
6. **head SHA guard を原則** にする（race condition 防止）。
7. **branch 削除は常に別許可**。
8. **release / deploy / publish は常に別許可**。
9. **GitHub Actions / workflow / package / token / branch protection は常に別設計・別許可**（本設計の範囲外）。
10. **後続タスク着手は常に別許可**（別 Action Request + 別 Approval Phrase）。
11. Action Request は **PR コメントに残すのが望ましい**（GitHub を SSoT として、v0.1 §4 と整合）。
12. ChatGPT 司令塔は Action Request の **内容を確認・整理し、必要なら短い承認文案を作る**（実行許可は出さない）。
13. Action Request は **Expiration / Staleness Rule に従う**（head SHA / state / changedFiles が変わったら無効、§5.12）。
14. Claude Code Reviewer は **Action Request の提案はできるが自分では実行しない**（read-only review 原則を維持、§10）。

---

## 5. Action Request 標準フォーマット

Action Request は以下の **12 項目** を必須項目とする。

### 5.1 Action Request ID

世代管理用の識別子。

形式：`AR-<対象識別子>-<操作種別>-<連番>`

例：
- `AR-PR126-MERGE-001`
- `AR-PR127-FIX-001`
- `AR-PR128-REVIEW-001`
- `AR-TASK-AI-TASK-CANDIDATE-DESIGN-START-001`

### 5.2 Target

- PR 番号 / branch / Task ID
- 例：`PR #126 / TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001 / docs/tour-ops-claude-code-reviewer-trial-001`

### 5.3 Proposed Action

- Ready 化 / squash merge / 修正依頼 / 再レビュー / 後続タスク起票 / docs-only 微修正 / その他

### 5.4 Reason

- なぜこの Action が妥当か（A/Go 判定根拠 / Must Fix なし / Ready 化基準充足 等）。

### 5.5 Preconditions

- 実行前に確認すべき条件（§3.4 参照）。
- PR state / isDraft / mergeable / mergeStateStatus / head SHA / changedFiles / docs-only / forbidden changes なし / working tree clean / `git diff --check` clean などから、該当する条件を列挙する。

### 5.6 Expected Head SHA

- race condition 防止のための **期待 head SHA**。
- 実行直前に `gh pr view <N> --json headRefOid` で再確認すること。
- 一致しなければ Action Request は **stale**（§5.12）として扱う。

### 5.7 Allowed Scope

- 実行してよい **範囲**。
- 例：`Ready 化のみ / branch 削除禁止 / merge 禁止`、`squash merge のみ / branch 削除禁止`、`read-only review / Review Report 返却のみ / PR コメント投稿禁止`。

### 5.8 Forbidden Actions

- 実行してはいけない操作（§3.5 参照）。
- 必ず明示列挙する（暗黙の禁止に頼らない）。

### 5.9 Required Approval Phrase

- 髙橋さんが許可するときに使う **承認文の標準形**。
- 例：`承認：PR #126 squash merge`、`承認：PR #127 Must Fix 修正依頼`、`承認：TOUR-OPS-AI-TASK-CANDIDATE-DESIGN 着手`。

### 5.10 Execution Owner

- Action を実行する主体。
- Claude Code Implementer / Claude Code Reviewer / ChatGPT 司令塔 / 髙橋さん / Codex / cowork のいずれか。
- Reviewer は **提案までで実行しない**（§10）ため、Reviewer が出した Action Request の Execution Owner は通常 Implementer または髙橋さん。

### 5.11 Post-Execution Report Requirements

- 実行後に **報告すべきこと**。
- 例：実行結果（成功 / 失敗 / 部分実行）、実行後の PR state / head SHA、副作用の有無、次の Action Request 案、Core 5 / Standard 11 の自己適用、禁止事項遵守確認。

### 5.12 Expiration / Staleness Rule

Action Request は **次のいずれかが変わったら無効**（stale）として扱う：

- head SHA が変わった → 新しい Action Request が必要
- main HEAD が進んだ（base が動いた）→ 再確認が必要
- PR state が変わった（OPEN → CLOSED / Draft → Ready など）→ 再確認が必要
- changedFiles が変わった → 新しい Action Request が必要
- 一定期間（例：24 時間）経過 → 再確認推奨
- 条件が変わった（mergeable / mergeStateStatus 等）→ 新しい Action Request が必要

---

## 6. Action Request の種類

本設計では当面、次の 5 種類を標準とする。

### 6.1 Ready 化 Action Request

**対象**: Draft PR を Ready for review にする。

**必要条件（Preconditions）**:
- PR state: OPEN
- isDraft: true
- head SHA 一致
- changedFiles 想定内
- docs-only / implementation scope 確認
- review 結果確認（A / Go または B+ / Conditional Go）
- Must Fix なし
- Should Fix 扱い整理済み（merge 前に直すか、別 PR で扱うか確定）
- forbidden changes なし

**禁止（Forbidden Actions）**:
- merge
- branch 削除
- 後続タスク着手
- release / deploy / publish
- workflow / package / token / branch protection 変更
- 対象外 PR への操作

**Approval Phrase 例**:
```
承認：PR #126 Ready化
```

### 6.2 squash merge Action Request

**対象**: Ready PR を squash merge する。

**必要条件（Preconditions）**:
- PR state: OPEN
- isDraft: false
- mergeable: MERGEABLE
- mergeStateStatus: CLEAN
- head SHA 一致
- base: main
- main HEAD race 確認（base が動いていないか、または rebase 済み）
- changedFiles 想定内
- review 結果確認（A / Go または B+ / Conditional Go かつ条件解消済み）
- Ready 化済み
- forbidden changes なし

**禁止（Forbidden Actions）**:
- branch 削除（別許可）
- release / deploy / publish
- 後続タスク着手
- main 直接 push
- workflow / package / token / branch protection 変更

**Approval Phrase 例**:
```
承認：PR #126 squash merge
```

### 6.3 修正依頼 Action Request

**対象**: Must Fix / Should Fix に基づき Implementer に修正を依頼する。

**必要条件（Preconditions）**:
- Reviewer report がある（Claude Code Reviewer / Codex / ChatGPT 司令塔整理済み）
- Must / Should / Nice 分類が整理済み
- 修正対象ファイルが明確
- 修正禁止範囲が明確（unrelated cleanup / unrelated refactor 禁止）
- Ready / merge 禁止（修正中）

**禁止（Forbidden Actions）**:
- Ready 化
- merge
- branch 削除
- 修正範囲外への変更
- forbidden files への変更
- 後続タスク着手

**Approval Phrase 例**:
```
承認：PR #127 Must Fix 修正依頼
```

### 6.4 再レビュー Action Request

**対象**: 修正後に Codex / Claude Code Reviewer に再レビューを依頼する。

**必要条件（Preconditions）**:
- 修正 commit SHA が確定
- 前回指摘との対応表が用意されている（Must / Should / Nice ごとに「対応済 / 未対応 / 別 PR 送り」を明示）
- review-only / read-only 指定
- PR コメント投稿可否（Reviewer 設計上は原則禁止、ただし依頼書で許容される場合のみ可）
- 禁止事項（commit / push / Ready / merge / 修正実行禁止）

**禁止（Forbidden Actions）**:
- commit / push
- Ready 化 / merge
- branch 削除
- 修正実行
- PR 本文編集
- 対象外 PR への操作

**Approval Phrase 例**:
```
承認：PR #127 Claude Code Reviewer 再レビュー
```

### 6.5 後続タスク起票 Action Request

**対象**: 新しい Task ID / branch / docs-only design / IMPL-LIGHT などの着手を許可する。

**必要条件（Preconditions）**:
- Candidate 理由（なぜ次に必要か）
- Risk Level（v0.1 §7）
- 目的
- scope（docs-only / IMPL-LIGHT / その他）
- 禁止事項
- 推奨 branch 名
- 停止条件（Draft PR 作成 / Ready 化前 / merge 前 など）

**禁止（Forbidden Actions）**:
- 起票だけ承認の場合は **同 PR での実装着手は禁止**（別セッション / 別 PR）
- main 直接 push
- 関連しない既存 PR への操作
- 既存 docs の改訂（明示許可がない限り）

**Approval Phrase 例**:
```
承認：TOUR-OPS-AI-TASK-CANDIDATE-DESIGN 着手
```

---

## 7. Approval Phrase の有効条件

### 7.1 Approval Phrase が有効になる 7 条件

Approval Phrase は次の **7 条件をすべて満たすとき** に限り有効。

1. **Target が明確**：PR 番号または Task ID が明示されている。
2. **Action が明確**：Ready 化 / squash merge / 修正依頼 / 再レビュー / タスク着手など、操作種別が明示されている。
3. **Scope が明確**：PR 単位 / branch 単位 / docs-only / 修正範囲 など、実行範囲が明示または対応 Action Request から特定できる。
4. **対応する Action Request が存在する**：PR コメントまたは完了報告に該当 Action Request が残っており、Target / Action / Scope が一致する。
5. **head SHA / state / changedFiles などの precondition が実行直前に確認される**：実行寸前に再取得して期待値と一致することを確認する。
6. **禁止事項が維持されている**：Action Request の Forbidden Actions と矛盾しない（例：merge 承認に branch 削除を勝手に含めない）。
7. **髙橋さんの明示許可である**：髙橋さん本人が直接出した（チャット / PR コメント等で本人発言として）承認文である。ChatGPT 司令塔の承認文案は許可そのものではない。

### 7.2 無効な承認文の例

次のような承認文は **無効**（Implementer / Reviewer は実行してはいけない）。

| 無効例 | 不足要素 |
| --- | --- |
| 「いいよ」 | Target / Action / Scope すべて不明 |
| 「進めて」 | Target / Action / Scope すべて不明 |
| 「やって」 | 同上 |
| 「次」 | 同上 |
| 「OK」 | 同上 |
| 「任せる」 | 範囲が無限定（暗黙の白紙委任は受けない） |
| 「merge して」（PR 番号なし） | Target 不明 |
| 「Ready にして」（PR 番号なし） | Target 不明 |
| 「承認：PR #126 merge」（Action Request が古い、head SHA 変更後） | Staleness（§5.12） |
| 「承認：PR #126 Ready化」だが対応 Action Request が存在しない | 対応 Action Request 不在 |
| 「承認：PR #126 squash merge」だが Forbidden Actions に branch 削除を含めて要求 | Forbidden Actions と矛盾 |
| 「承認：PR #126 merge して branch も削除して」 | 別許可必要（branch 削除は常に別 Action Request） |

### 7.3 有効な承認文の例

次のような承認文は **有効**（対応 Action Request が PR コメントに存在し、precondition が満たされていることを実行直前に確認したうえで実行可能）。

- `承認：PR #126 Ready化`
- `承認：PR #126 squash merge`
- `承認：PR #127 Must Fix 修正依頼`
- `承認：TOUR-OPS-AI-TASK-CANDIDATE-DESIGN 着手`
- `承認：PR #128 Claude Code Reviewer read-only review`
- `承認：PR #128 Codex review`

---

## 8. ChatGPT 司令塔の役割

ChatGPT 司令塔は次を担う。

- Action Request を **読んで妥当性を確認** する（Target / Proposed Action / Reason / Preconditions / Forbidden Actions に矛盾がないか）。
- 髙橋さん向けに **短い Approval Phrase 案を作る**（コピペ 1 行で済むように）。
- Reviewer の Must / Should / Nice を **再分類** する（merge blocker 該当性、別 PR 送り該当性）。
- Risk Level を確認する（v0.1 §7）。
- Forbidden Actions が十分か確認する（不足があれば追記提案）。
- precondition が不足していれば補う（head SHA / changedFiles / mergeStateStatus 等の確認項目を追記提案）。
- **実行許可そのものは出さない**（final 決定者ではない）。
- 髙橋さんの **明示許可が必要** であることを毎回確認する。

ChatGPT 司令塔が「Approval Phrase 案」を提示した時点では **まだ許可ではない**。髙橋さんが本人発言として承認文を発したときに初めて Approval Phrase として有効になる。

---

## 9. Claude Code Implementer の役割

Claude Code Implementer は次を担う。

- **完了報告時に Action Request を提案できる**（次に許可してほしい具体操作を 1〜複数提示）。
- Ready 化 / merge / 修正依頼 / 後続タスク着手などの Action Request を出せる。
- **承認前に実行しない**（v0.1 §11.2 と整合）。
- Approval Phrase を受け取ったら、**precondition を実行直前に再確認** する：
  - `gh pr view <N> --json state,isDraft,mergeable,mergeStateStatus,headRefOid,changedFiles,baseRefName,headRefName`
  - 期待 head SHA と一致するか
  - main HEAD が進んでいないか
  - changedFiles が想定範囲内か
  - forbidden changes が含まれていないか
- **承認範囲内のみ実行する**（Ready 化承認で merge しない、merge 承認で branch 削除しない）。
- 実行後に **Post-Execution Report** を出す（実行結果 / 副作用の有無 / 次の Action Request 案 / Core 5 / Standard 11 自己適用 / 禁止事項遵守確認）。
- **branch 削除は別許可なしにしない**。
- **release / deploy / publish は別許可なしにしない**。
- **後続タスク着手は別 Approval Phrase なしにしない**。

---

## 10. Claude Code Reviewer の役割

Claude Code Reviewer は次を担う（PR #125 設計を維持しつつ、Action Request 提案を追加可能とする）。

- read-only review report の最後に **Action Request 候補を提案できる**（提案までで、自分では実行しない）。
- `Ready Recommended` / `Merge Recommended` を **判定として出せる**（PR #125 §8.1 §10 と整合）。
- **Action Request を提案できるが、Ready / merge は自分でしない**（read-only 原則を維持）。
- PR コメント投稿の可否は **依頼書に従う**（PR #125 §11、原則禁止、依頼書で許容される場合のみ可）。
- 修正が必要なら **修正依頼 Action Request 案を出す**（修正自体はしない）。
- Reviewer が提案する Action Request の **Execution Owner は Reviewer ではなく Implementer または髙橋さん** にする。

Reviewer が出す Action Request の典型は：
- Ready 化 Action Request（Implementer 実行）
- squash merge Action Request（Implementer または髙橋さん実行）
- 修正依頼 Action Request（Implementer 実行）
- 後続タスク起票 Action Request（髙橋さん判断 / 別セッション）

---

## 11. Action Request と既存 Core 5 / Standard 11 の関係

### 11.1 Core 5（v0.1 §6.1）

Core 5 は **状態管理**：

1. Next Action
2. Next Owner
3. Blocked By
4. Allowed Without Human Approval
5. Requires Human Approval

### 11.2 Standard 11（v0.1 §6.2）

Standard 11 は **PR 状態の補足情報**：

1. Task ID
2. PR 番号
3. Branch
4. Commit SHA
5. Current Status
6. Forbidden Actions
7. Changed Files
8. Tests
9. Risk Level
10. Review Needed
11. Handoff URL（または comment URL）

### 11.3 Action Request の位置付け

- Action Request は「**次に許可してほしい具体操作**」を表す。
- **Core 5 / Standard 11 / Action Request は競合しない**。
- Core 5 = いま誰が次に動くか（状態）。Standard 11 = いま何が起きているか（補足）。Action Request = 次に何を許可してほしいか（提案）。
- **完了報告では Core 5 / Standard 11 に加えて、必要なら Action Request を 1 つ以上提示する**。
- Action Request があることで、髙橋さんは **短い Approval Phrase を出しやすくなる**（Core 5 の Next Action / Requires Human Approval を読み、対応する Action Request を見て承認文を返す）。
- Reviewer report（PR #125 §8.1 14 項目）の末尾に Action Request 提案を追加するのも、本設計と整合する。

---

## 12. Action Request の例

### 12.1 Ready 化例

```
Action Request:
- Action Request ID: AR-PR126-READY-001
- Target: PR #126 / TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001
- Proposed Action: Ready 化（Draft → Ready for review）
- Reason: Claude Code Reviewer trial-001 が A / Go、Must Fix なし、Should Fix なし。docs-only trial として Ready 化判断に十分。
- Preconditions:
  - PR state: OPEN
  - isDraft: true
  - head SHA: <expected SHA>
  - changedFiles: 2（docs/ops/20260516_shogi_tour_claude_code_reviewer_trial_001.md / HANDOFF.md）
  - docs-only
  - forbidden changes なし
- Expected Head SHA: <expected SHA>
- Allowed Scope: Ready 化のみ
- Forbidden Actions:
  - merge
  - branch 削除
  - release / deploy / publish
  - 後続タスク着手
  - workflow / package / token / branch protection 変更
- Required Approval Phrase: 承認：PR #126 Ready化
- Execution Owner: Claude Code Implementer（別セッション / または髙橋さん本人）
- Post-Execution Report Requirements:
  - 実行後の PR state / isDraft
  - 実行後 head SHA
  - 次 Action Request 案（squash merge）
  - Core 5 / Standard 11 自己適用
  - 禁止事項遵守確認
- Expiration / Staleness Rule:
  - head SHA 変更時は無効
  - PR state 変更時は再確認
  - changedFiles 変更時は再確認
  - 24 時間経過時は再確認推奨
```

### 12.2 squash merge 例

```
Action Request:
- Action Request ID: AR-PR126-MERGE-001
- Target: PR #126 / TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001
- Proposed Action: squash merge
- Reason: Ready 化済み、A / Go、Must Fix なし、Should Fix なし、main HEAD race なし。
- Preconditions:
  - PR state: OPEN
  - isDraft: false
  - mergeable: MERGEABLE
  - mergeStateStatus: CLEAN
  - head SHA: <expected SHA>
  - base: main
  - main HEAD: <expected main SHA>
  - changedFiles: 2
  - docs-only
  - forbidden changes なし
- Expected Head SHA: <expected SHA>
- Allowed Scope: squash merge のみ
- Forbidden Actions:
  - branch 削除（別許可）
  - release / deploy / publish
  - 後続タスク着手
  - main 直接 push
  - workflow / package / token / branch protection 変更
- Required Approval Phrase: 承認：PR #126 squash merge
- Execution Owner: Claude Code Implementer（別セッション / または髙橋さん本人）
- Post-Execution Report Requirements:
  - 実行後の PR state（MERGED）
  - squash commit SHA
  - main HEAD 更新確認
  - 副作用の有無
  - Core 5 / Standard 11 自己適用
  - 禁止事項遵守確認（branch 削除していないこと）
- Expiration / Staleness Rule:
  - head SHA 変更時は無効
  - main HEAD 変更時は再確認（base 進行）
  - PR state 変更時は無効
  - mergeable / mergeStateStatus 変更時は再確認
```

### 12.3 Must Fix 修正依頼例

```
Action Request:
- Action Request ID: AR-PR127-FIX-001
- Target: PR #127 / TOUR-OPS-XXX
- Proposed Action: Must Fix 修正依頼（Reviewer report に基づく）
- Reason: Claude Code Reviewer が B+ / Conditional Go、Must Fix 2 件を指摘。docs-only design の §3 用語定義に誤記、§7 表に列ずれ。
- Preconditions:
  - Reviewer report が PR コメント / チャットに存在
  - Must / Should / Nice 分類整理済み
  - 修正対象ファイルが明確（docs/ops/20260516_shogi_tour_xxx.md のみ）
  - 修正範囲が明確（§3 / §7）
  - Ready / merge 未実施
- Expected Head SHA: <expected SHA>
- Allowed Scope:
  - 指定ファイル（docs/ops/20260516_shogi_tour_xxx.md）の §3 / §7 のみ
  - docs-only 維持
- Forbidden Actions:
  - Ready 化
  - merge
  - branch 削除
  - 修正範囲外への変更
  - 他 docs 改訂
  - 実装 / テスト / snapshot / workflow / package 変更
  - 後続タスク着手
- Required Approval Phrase: 承認：PR #127 Must Fix 修正依頼
- Execution Owner: Claude Code Implementer（別セッション）
- Post-Execution Report Requirements:
  - 修正 commit SHA
  - 修正前後の対応表（Must Fix #1 / #2 ごとに変更箇所）
  - 修正後の changedFiles
  - 再レビュー Action Request 案
  - Core 5 / Standard 11 自己適用
  - 禁止事項遵守確認
- Expiration / Staleness Rule:
  - head SHA 変更時は再確認
  - PR state 変更時は無効
  - 別 Must Fix が追加された場合は新しい Action Request
```

### 12.4 Claude Code Reviewer read-only review 例

```
Action Request:
- Action Request ID: AR-PR128-REVIEW-001
- Target: PR #128 / TOUR-OPS-XXX
- Proposed Action: Claude Code Reviewer read-only review
- Reason: Draft PR 作成完了後、独立 reviewer による A / Go / B+ / No Go 判定が必要。Implementer / Reviewer 分離原則（PR #125 §4）に従う。
- Preconditions:
  - PR is Draft / OPEN
  - head SHA: <expected SHA>
  - changedFiles: 想定範囲内（docs-only）
  - docs-only
  - forbidden changes なし
  - Review Request Draft コメントが PR に存在
- Expected Head SHA: <expected SHA>
- Allowed Scope:
  - read-only review
  - Review Report 返却（チャットへ）
- Forbidden Actions:
  - commit
  - push
  - Ready 化
  - merge
  - PR コメント投稿
  - branch 削除
  - 実装修正
  - PR 本文編集
  - 対象外 PR への操作
  - 後続タスク着手
- Required Approval Phrase: 承認：PR #128 Claude Code Reviewer read-only review
- Execution Owner: Claude Code Reviewer（別セッション）
- Post-Execution Report Requirements:
  - A / Go、B+ / Conditional Go、No Go のいずれか
  - Must Fix / Should Fix / Nice to Have 分類
  - Ready 化判断（Ready Recommended / 条件付き / 不可）
  - merge 前修正要否
  - Reviewer 禁止事項遵守確認（commit / push / Ready / merge / PR コメント投稿なし）
  - 確認不能範囲の明示（CI / VRT 未確認など）
- Expiration / Staleness Rule:
  - head SHA 変更時は無効
  - PR state 変更時は再確認
  - changedFiles 変更時は再確認
  - Review Request Draft が更新された場合は新しい Action Request
```

### 12.5 後続タスク着手例

```
Action Request:
- Action Request ID: AR-TASK-AI-TASK-CANDIDATE-DESIGN-START-001
- Target: TOUR-OPS-AI-TASK-CANDIDATE-DESIGN（新 Task ID）
- Proposed Action: 後続タスク起票（docs-only design）
- Reason: AI レビュー中の改善候補を Implementer が勝手に実装せず、Candidate として記録する器が必要。本設計（Action Request）と隣接する設計領域。
- Preconditions:
  - Candidate 理由: AI が改善案を提示した場合の扱いが未設計
  - Risk Level: Level 1（docs-only design）
  - 目的: AI の改善案を「Candidate として記録」する器の標準化
  - Scope: docs-only design memo の新規追加のみ
  - 推奨 branch: docs/tour-ops-ai-task-candidate-design
  - 停止条件: Draft PR 作成、Review Request Draft 投稿、完了報告投稿で停止
- Expected Head SHA: <main HEAD SHA>（base = main）
- Allowed Scope:
  - 新規 docs ファイル 1 件追加（docs/ops/20260516_shogi_tour_ai_task_candidate_design.md または日付別）
  - HANDOFF.md 最小限追記
  - Draft PR 作成
- Forbidden Actions:
  - 既存 ops docs 改訂
  - 実装 / テスト / snapshot / workflow / package 変更
  - Ready 化 / merge / main 直接 push
  - branch 削除 / release / deploy / publish
  - GitHub Actions / Bot / template / label / `ai_work_queue.md` 作成
  - 後続タスク（本タスク以外）着手
- Required Approval Phrase: 承認：TOUR-OPS-AI-TASK-CANDIDATE-DESIGN 着手
- Execution Owner: Claude Code Implementer（別セッション）
- Post-Execution Report Requirements:
  - 作成 branch / Draft PR 番号 / commit SHA
  - 変更ファイル一覧
  - design note 概要
  - Action Request 案（read-only review 依頼）
  - Core 5 / Standard 11 自己適用
  - 禁止事項遵守確認
- Expiration / Staleness Rule:
  - main HEAD が大きく動いた場合は再確認
  - 設計前提（PR #122〜#126 + 本設計）が変わった場合は再確認
```

---

## 13. 今回やらないこと

本 PR では次は **行わない**。

- Action Request の **実運用強制**（本 PR は設計のみ。完了報告内で 1 件の Action Request 案を提示するのはセルフ適用例）
- GitHub Actions 化 / Bot 化 / API 連携 / 自動 Action Request 生成
- 自動承認 / 自動 Ready 化 / 自動 merge
- `.github/PULL_REQUEST_TEMPLATE.md` 変更
- `.github/ISSUE_TEMPLATE/` 変更
- label 作成
- `docs/ops/ai_work_queue.md` 作成
- workflow 変更（`.github/workflows/`）
- package / lockfile 変更
- 実装変更（`shogi_v4.html` / `index.html` / `data/` 等）
- テスト変更（`test/` / `test/e2e/`）
- snapshot 変更
- v0.1 ルール本体（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md`）改訂
- async workflow trial-001 note（`docs/ops/20260516_shogi_tour_async_ai_workflow_trial_001.md`）改訂
- RRD design（`docs/ops/20260516_shogi_tour_review_request_template_design.md`）改訂
- Claude Code Reviewer design（`docs/ops/20260516_shogi_tour_claude_code_reviewer_design.md`）改訂
- Claude Code Reviewer trial-001 note（`docs/ops/20260516_shogi_tour_claude_code_reviewer_trial_001.md`）改訂
- branch protection 変更
- token / secret / credential 操作
- release / deploy / publish
- branch 削除
- 後続タスク着手（§14 のいずれも本 PR では着手しない）

---

## 14. 後続タスク候補

本 PR では着手しない。Action Request + 髙橋さん明示許可が揃ったときに別 PR / 別セッションで進める。

| 優先 | Task ID | 内容 |
| --- | --- | --- |
| 第一 | `TOUR-OPS-ACTION-REQUEST-TRIAL-001` | 小さな docs-only PR で Action Request を実際に使う初回 trial |
| 第二 | `TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT` | Action Request テンプレを docs に実ファイル化する |
| 第三 | `TOUR-OPS-AI-TASK-CANDIDATE-DESIGN` | AI が改善候補を勝手に実装せず Candidate として記録する器を設計する |
| 並走可 | `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT` | Reviewer 依頼文テンプレ実ファイル化（PR #125 §13 後続） |
| 並走可 | `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` | 完了報告テンプレ / RRD コメント / Core 5 / Standard 11 記載場所の実装 |
| 並走可 | `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` | RRD テンプレ実ファイル化 |
| 並走可 | `TOUR-OPS-AI-WORK-QUEUE-DESIGN` | `ai_work_queue.md` 設計 |
| 並走可 | `TOUR-OPS-PR-TEMPLATE-DESIGN` | `.github/PULL_REQUEST_TEMPLATE.md` 設計 |
| 並走可 | `TOUR-OPS-HANDOFF-FORMAT-DESIGN` | HANDOFF.md フォーマット設計 |
| 観察後 | `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` | #122〜#126 と本設計を v0.2 に統合するか検討 |

---

## 15. 結論

- 自動化への次の現実的ステップは、**完全自動化ではなく Action Request による短文承認化** である。
- 髙橋さんの **長文コピペ負担を減らす**。
- AI は **実行候補を出す**（Action Request、12 項目フォーマット）。
- 髙橋さんは **短い Approval Phrase で許可する**（7 条件を満たすときに限り有効）。
- Claude Code Implementer は **承認範囲内だけ実行する**（precondition 実行直前再確認、head SHA guard、Forbidden Actions 厳守）。
- Claude Code Reviewer は **read-only で提案まで**（Action Request 提案可、自身では Ready / merge しない）。
- ChatGPT 司令塔は **妥当性確認と承認文案作成** を担う（実行許可は出さない）。
- Ready / merge / release / deploy / publish / branch 削除 / 後続タスク着手 は **引き続き明示許可制**（v0.1 §8 と整合）。
- 今回は **設計のみ** であり、実運用や自動化には進まない。後続 `TOUR-OPS-ACTION-REQUEST-TRIAL-001` で初回 trial、`TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT` でテンプレ実ファイル化、`TOUR-OPS-AI-TASK-CANDIDATE-DESIGN` で隣接設計、`TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` で v0.2 統合判断、の順に積み上げる。
