# SHOGI-TOUR｜AI Task Candidate 標準設計（TOUR-OPS-AI-TASK-CANDIDATE-DESIGN）

**Task ID**: `TOUR-OPS-AI-TASK-CANDIDATE-DESIGN`
**作業種別**: docs-only design / AI Task Candidate 標準設計
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `541feb2`（PR #127 squash merge 後の main = TOUR-OPS-ACTION-REQUEST-DESIGN）
**位置づけ**: PR #122〜#127 で積み上げた「作る AI / 見る AI / 整理する AI / 許可する人 / 短文承認」基盤の上に、AI が能動的に出す **改善候補（Task Candidate）** を勝手に実装させず、髙橋さんの採用判断を挟んで Task → Action Request → Approval Phrase の安全経路に流す器を docs-only で設計する。AI の能動性と人間の最終判断を両立させるための前段。実運用・Candidate Registry 実ファイル化・自動 Task 化・自動実装には進まない。

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
  - PR [#127](https://github.com/kazuo1970takahashi-sketch/shogi/pull/127) — TOUR-OPS-ACTION-REQUEST-DESIGN（Action Request 標準設計、squash `541feb2`）
- **非対象（今回 PR では実施しない）**:
  - Candidate Registry の実ファイル化（`docs/ops/ai_task_candidates.md` 等の作成）
  - GitHub Issues / GitHub Projects 化
  - Bot / GitHub Actions / API 連携 / 自動 Task 化 / 自動実装 / 自動 Ready / 自動 merge
  - `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` / label / `ai_work_queue.md` 作成
  - 既存 ops docs 改訂（v0.1 本体 / async workflow trial-001 note / RRD design / Reviewer design / Reviewer trial-001 note / Action Request design いずれも未変更）
  - 実装 / テスト / snapshot / workflow / package 系の一切の変更
  - branch protection 変更 / token / secret / credential 操作
  - release / deploy / publish / branch 削除
  - RESET-UX 後続実装
  - 後続タスク（AI-TASK-CANDIDATE-TRIAL-001 / AI-TASK-CANDIDATE-REGISTRY-DESIGN / ACTION-REQUEST-TRIAL-001 / ACTION-REQUEST-TEMPLATE-IMPL-LIGHT / CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT / ASYNC-AI-WORKFLOW-IMPL-LIGHT / REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT / V0-2-REVIEW）の着手

---

## 1. 目的

本設計の目的は次のとおり。

- AI がレビュー・実装・完了報告・設計整理の中で見つけた **改善候補を記録できるようにする**。
- AI が **勝手に実装せず**、Candidate として **提案するだけ** に留める。
- 髙橋さんが採用した Candidate **だけ** を Task / Action Request に進める。
- AI の **能動性を安全に受け止める**（提案は歓迎、実装は許可制）。
- 自動実装ではなく、**能動提案の器** である。
- Action Request は「**承認された具体操作**」、Task Candidate は「**まだ採用前の改善候補**」として明確に分ける。
- 最終判断者は **髙橋さん** である。
- ChatGPT 司令塔は Candidate の **整理・優先度案・Task 化案** を作るが、final 決定者ではない。

---

## 2. 背景

### 2.1 これまでの積み上げ

- **PR #122** で AI 非同期運用ルール v0.1 を設計した（Core 5 / Standard 11 / Short Prompt / Blocked By 可視化 / Phase 1 段階導入）。
- **PR #123** で v0.1 初回 trial を行った（PR 本文に Core 5 / Standard 11、PR コメントに Review Request Draft、完了報告コメント、cowork レビュー留保観察）。
- **PR #124** で Review Request Draft 標準設計を作成した（Codex-primary / Claude Code-secondary / ChatGPT-orchestrated、Review Material Pack、raw / patch / diff URL 直接同梱、レビュアー留保欄標準化）。
- **PR #125** で Claude Code Reviewer 運用設計を作成した（Implementer / Reviewer 分離、read-only review、独立性レベル A/B/C、17 ステップ手順、14 項目 Report、8 段階戻し方）。
- **PR #126** で Claude Code Reviewer trial-001 が成功した（別セッション Reviewer による read-only review、A / Go、Ready Recommended、Merge Recommended、§7 禁止事項遵守を実証）。
- **PR #127** で Action Request 標準設計を作成し、**自己実証** まで成立した（無効承認文の厳格判定 → 12 項目 AR / 7 条件 Approval Phrase で Ready 化 → squash merge、branch 削除は別許可で残存）。

### 2.2 基盤は整った

| 役割 | 担当 | 出力 |
| --- | --- | --- |
| 作る AI | Claude Code Implementer | commit / push / Draft PR / Review Request Draft / 完了報告 / Action Request 提案 |
| 見る AI | Claude Code Reviewer / Codex / (cowork) | read-only review report、A/B+/No Go、Must/Should/Nice、Action Request 提案（実行はしない） |
| 整理する AI | ChatGPT 司令塔 | レビュー結果整理、優先度案、Approval Phrase 案、Action Request 案 |
| 短文承認 | Approval Phrase | 承認：PR #N Ready化 / squash merge / 修正依頼 等 |
| 許可する人 | 髙橋さん | 明示許可（final 決定） |

### 2.3 残っている課題

- AI が **能動的に改善候補を出せる** ようにしたい（受動的な指示待ちから一歩前へ）。
- ただし AI が **勝手に実装・Ready 化・merge・後続タスク着手するのは危険**（v0.1 §11.2、PR #127 §4 と整合）。
- 必ず Candidate として **記録し、髙橋さんの採用判断を挟む** 必要がある。
- Candidate と Action Request を **明確に分離する**（候補 vs 採用後の具体操作）。

### 2.4 本設計の意図

- AI が **「次にこれをやると良さそうです」** と気軽に出せる器を作る（Candidate）。
- 提案は歓迎、ただし **採用判断は髙橋さん** に集約する。
- Candidate は **実装許可ではない**（Auto-Implementation Prohibited）。
- 採用後も **Task 化 → Action Request → Approval Phrase → 実行** の安全経路を必ず通る。
- これにより **AI の能動性と人間の最終判断を両立** できる。

---

## 3. 用語定義

### 3.1 Task Candidate（タスク候補）

AI が見つけた改善候補。**まだ正式 Task ではない**。**実装してよいという意味ではない**。

性質：
- 「何をやると良さそうか」の提案
- 採用には髙橋さんの明示判断が必要
- 採用されなければ消える（Hold / Reject / Superseded）

### 3.2 Candidate ID

候補を識別する ID。形式：`CAND-<対象識別子>-<連番>`

例：
- `CAND-PR127-001`（PR #127 から派生）
- `CAND-REVIEW-20260516-001`（2026-05-16 のレビューから派生）
- `CAND-HANDOFF-001`（HANDOFF.md 整理から派生）
- `CAND-USER-20260516-001`（ユーザー発言から派生）

### 3.3 Source

Candidate が発生した元。例：
- Reviewer Nice to Have（Claude Code Reviewer / Codex）
- Implementer 完了報告（Claude Code Implementer）
- ChatGPT 司令塔整理
- Codex review
- PR merge 後の振り返り
- ユーザー発言（髙橋さん）
- 既存 docs の不整合・矛盾発見
- v0.2 検討時の派生

### 3.4 Proposed Task

Candidate を採用した場合に作られる可能性のある Task。例：
- `TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT`
- `TOUR-OPS-ACTION-REQUEST-TRIAL-001`
- `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`

### 3.5 Adoption（採用）

髙橋さんが Candidate を **正式に採用** すること。採用後に Task ID / branch / Action Request に進む。Adoption の Approval Phrase は **Task 化承認のみ** であり、実装着手承認とは別。

### 3.6 Rejection / Hold

- **Rejection**: 不採用（理由を明記して Candidate を閉じる）
- **Hold**: 今はやらない、保留（後で見直し可能）

### 3.7 Auto-Implementation Prohibited

Candidate は **実装許可ではない**。AI は Candidate を見つけても **勝手に branch 作成・commit・PR 作成をしない**。Candidate 発行は提案行為に限定される。

### 3.8 Triage（仕分け）

ChatGPT 司令塔が Candidate を整理する作業。重複統合、優先度案、Task ID 案、推奨 Timing を補う。

---

## 4. Task Candidate の基本原則

以下を本設計の基本原則として明文化する。

1. **Candidate は改善候補であり、実行許可ではない**。
2. AI は Candidate を **提案できる** が、**承認なしに実装しない**。
3. Candidate を **Task 化するには髙橋さんの明示承認が必要**。
4. Candidate は **Action Request とは別物**：
   - Candidate = 「何をやると良さそうか」（採用前）
   - Action Request = 「何を今実行してよいか」（採用後の具体操作）
5. Candidate は **複数溜めてよい**（採用は別判断）。
6. 優先度は **ChatGPT 司令塔が案を出せる** が、最終決定は髙橋さん。
7. Candidate は **Must / Should / Nice と混同しない**：
   - Must Fix は原則として対象 PR 内で解消すべきもの
   - Should Fix は当該 PR 修正推奨、範囲外なら理由を明記して Candidate 化可
   - Nice to Have は Candidate 化しやすいが、**すべて Candidate にする必要はない**
8. Candidate にしても **即着手ではない**（Adoption → Task 化 → Action Request → Approval Phrase → 実行 の順を必ず通る）。
9. **実装・Ready 化・merge・release・deploy・publish・branch 削除は常に別許可**（Action Request 設計と整合）。
10. Candidate の **Execution Owner は Reviewer ではない**（PR #125 §4 read-only 原則を維持）。
11. Candidate は **head SHA / commit に縛られない**（Action Request と違い、状態より「アイデア」に近い）。
12. Candidate は **何度でも見直し可能**（Adopt / Hold / Reject / Split / Merge）。

---

## 5. Task Candidate 標準フォーマット

Candidate は次の **15 項目** を必須項目とする（Action Request の 12 項目とは別）。

### 5.1 Candidate ID

世代管理用の識別子（§3.2 参照）。例：`CAND-PR127-001`。

### 5.2 Source

どこで見つかったか（§3.3 参照）。例：`PR #127 Claude Code Reviewer Nice to Have #2`。

### 5.3 Proposal

何を改善する候補か。**1〜3 行で簡潔に**。

### 5.4 Reason

なぜ必要か（背景・きっかけ・現場の課題）。

### 5.5 Expected Benefit

期待効果。例：
- 安全性向上（誤操作防止）
- コピペ負担削減
- AI 間連携改善
- レビュー品質向上
- ドキュメント整合性
- 後続タスクの前提整備

### 5.6 Risk Level

採用後の作業 Risk Level（v0.1 §7）。
- Level 0：記録・整理
- Level 1：docs-only design
- Level 2：IMPL-LIGHT
- Level 3+：UX 導線 / ロジック / データ / セキュリティ影響

### 5.7 Suggested Task ID

採用時の Task ID 案。例：`TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT`。

### 5.8 Suggested Owner

採用後の作業主体案。
- ChatGPT 司令塔
- Claude Code Implementer
- Claude Code Reviewer（提案までで実行はしない）
- Codex
- 髙橋さん

### 5.9 Suggested Timing

採用時の着手タイミング案。
- **Now**: 今期内に着手したい
- **Next**: 直近の次タスク候補
- **Later**: 観察後 / 状況が整ってから
- **Hold**: 保留
- **Reject**: 不採用推奨

### 5.10 Required Human Decision

髙橋さんが下すべき判断種別。
- **Adopt**: 採用 → Task 化
- **Hold**: 保留
- **Reject**: 不採用
- **Split**: 分割（複数 Candidate に分ける）
- **Merge with another Candidate**: 他 Candidate と統合

### 5.11 Auto-Implementation

常に `Prohibited`（実装許可ではない）。Candidate に Approval Phrase を出してもただちに実装ではない。

### 5.12 Acceptance Criteria Draft

採用時の完了条件案（Task 化後の AC 候補）。docs-only / IMPL-LIGHT / IMPL-MEDIUM ごとに記述粒度は変える。

### 5.13 Forbidden Scope

この Candidate を Task 化した際に **触ってはいけない範囲**。Action Request の Forbidden Actions と同じ趣旨で先に書いておく。

### 5.14 Related PR / Docs

関連 PR / 関連 docs ファイル。例：`PR #127 / docs/ops/20260516_shogi_tour_action_request_design.md`。

### 5.15 Notes

補足。重複統合の経緯、再評価時のメモ、観察ポイントなど。

---

## 6. Candidate の発生源

### 6.1 Claude Code Reviewer

- Review Report の **Nice to Have から Candidate を提案できる**。
- Must Fix / Should Fix と Candidate を **分ける**（Must は当該 PR で直す、Candidate は後続）。
- Ready Recommended と Candidate 提案は **両立する**（Ready で OK だが将来こうしたい）。
- 自分では **実装しない**（read-only 原則維持、PR #125 §4）。
- Candidate の **Suggested Owner を自分にしない**（Reviewer は提案までで実行しない）。

### 6.2 Claude Code Implementer

- 完了報告の中で **「次の改善候補」を Candidate として提案できる**。
- ただし **後続タスク着手はしない**（Action Request 設計と整合）。
- Draft PR 作成後に Candidate を出してもよい。
- Ready / merge 後の Post-Execution Report で Candidate を出してもよい。
- Candidate と Action Request を **混同しない**（Candidate = 候補、Action Request = 採用後の具体操作）。

### 6.3 ChatGPT 司令塔

- Reviewer / Implementer / Codex / ユーザー発言から Candidate を **整理（Triage）** する。
- **重複をまとめる**（CAND-A と CAND-B が同じ趣旨なら Merge 提案）。
- **優先度案を出す**（P0/P1/P2/P3、§10 参照）。
- **Task ID 案を作る**。
- **Action Request 化する前** に Candidate として整理する（必須中継地点）。
- final 決定者ではない（採用は髙橋さん）。

### 6.4 Codex

- review result の **Nice to Have / Should Fix から Candidate を出せる**。
- ただし Codex review の Must Fix は基本的に Candidate ではなく **当該 PR の修正対象**。

### 6.5 髙橋さん

- ユーザー要望として **Candidate を直接出せる**。
- 例：
  - 「この辺、自動化したい」
  - 「コピペ減らしたい」
  - 「AI が能動提案できるようにしたい」
  - 「Reviewer report のテンプレが欲しい」

ユーザー由来の Candidate は **優先度が一段上がる傾向** にある（Risk Level を逸脱しない範囲で）。

### 6.6 cowork（optional advisory）

- 貼付本文ベースの補助意見から Candidate を抽出可能（PR #124 §3.5、optional advisory）。
- ただし GitHub URL を直読みしない前提のため、確度は低い扱い。

---

## 7. Candidate と Must / Should / Nice の関係

| 種別 | 性質 | Candidate 化 |
| --- | --- | --- |
| **Must Fix** | merge 前に解消すべき | **Candidate 化して後回しにしない**（当該 PR で直す） |
| **Should Fix** | 原則は当該 PR で修正推奨 | 範囲外なら Candidate 化してよい。**理由を明記する** |
| **Nice to Have** | merge blocker ではない | Candidate 化に **適している**。ただし全部を Candidate にすると候補過多になる |
| **Candidate** | 後続改善候補 | merge blocker ではない。**採用には明示判断が必要** |

### 7.1 Should Fix を Candidate 化する条件

- 当該 PR のスコープを **明らかに超える**（別の設計領域に踏み込む）
- 当該 PR で直すと **scope creep になる**
- 別 PR で扱う方が **レビュー効率が良い**
- 髙橋さんの判断を **挟んだ方が安全**

これらの条件を満たさなければ、当該 PR 内で直すのが原則。

### 7.2 Nice to Have を Candidate 化する基準

- **有用性**: 後で見ても価値があるか
- **再利用性**: 他タスクの前提になるか
- **後続価値**: v0.2 / IMPL-LIGHT などで生きるか

これらが揃わない Nice to Have は **メモに留めて Candidate にしない**（候補過多防止、§11）。

---

## 8. Candidate の状態

Candidate は次の状態遷移をとる。

```
Proposed → Triaged → Adopted → Converted to Task → In Progress → Done
                ↓
              Hold / Rejected / Superseded
```

### 8.1 状態定義

- **Proposed**: AI または人間が提案した状態（初期状態）
- **Triaged**: ChatGPT 司令塔が整理した状態（優先度案・Task ID 案が付与済み）
- **Adopted**: 髙橋さんが採用した状態（Adopt 承認文を受領）
- **Converted to Task**: Task ID / branch / Action Request に変換された状態
- **In Progress**: 実装または docs 作業中
- **Done**: 完了・merge 済み
- **Hold**: 保留（再評価可能）
- **Rejected**: 不採用（理由明記）
- **Superseded**: 他 Candidate に統合または置換された

### 8.2 状態遷移の典型例

1. Reviewer が `Proposed` で出す
2. ChatGPT 司令塔が `Triaged` に整理（優先度 P1、Suggested Task ID 補完）
3. 髙橋さんが `Adopt` 承認 → `Adopted`
4. Implementer が新 Task 着手 → `Converted to Task` → `In Progress`
5. Draft PR → Review → Ready → merge → `Done`

### 8.3 例外パターン

- 緊急性が低ければ `Triaged` → `Hold` で長期保留
- 重複が見つかれば `Superseded`（他 Candidate に統合）
- 価値が低いと判断されれば `Rejected`（理由明記）

---

## 9. Candidate 採用フロー

### 9.1 基本フロー（8 段階）

1. AI または髙橋さんが **Candidate を提案**（`Proposed`）
2. ChatGPT 司令塔が **Candidate を整理**（重複統合、優先度案、Task ID 案、Risk Level、Suggested Timing）→ `Triaged`
3. 髙橋さんが **Adopt / Hold / Reject / Split / Merge を判断**
4. Adopt された場合のみ **Task 化**（`Adopted` → `Converted to Task`）
5. Task 化後、**Action Request を発行**（PR #127 §5 標準 12 項目）
6. 髙橋さんが **Approval Phrase で着手許可**
7. Claude Code Implementer が **承認範囲内で Draft PR 作成**
8. Claude Code Reviewer / Codex が **review** → Ready 化 Action Request → squash merge Action Request → `Done`

### 9.2 重要原則

- **Candidate から直接実装に飛ばない**。
- 必ず **Task 化 → Action Request → Approval Phrase** を通る。
- Candidate 採用の Approval Phrase と、Task 着手の Approval Phrase と、Ready 化の Approval Phrase と、merge の Approval Phrase は **全て別**（§13 参照）。

### 9.3 Adoption 承認文の形式

```
承認：CAND-PR127-001 を Task 化
```

または、Suggested Task ID が明確であれば直接 Task 着手承認に飛ぶことも可能：

```
承認：TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT 着手
```

ただし後者は Adoption と Task 着手承認を **兼ねる** ことになるため、AI 側は両方の意図を読み取って precondition 再確認すること。

---

## 10. Candidate の優先度基準

### 10.1 優先度判断の観点

ChatGPT 司令塔は次の観点で **優先度案** を出す（最終決定は髙橋さん）。

- **安全性を高めるか**（誤操作防止、データ損失防止）
- **コピペ負担を減らすか**
- **AI 間連携を改善するか**
- **レビュー品質を上げるか**
- **実装リスクが低いか**（docs-only か / IMPL-LIGHT か）
- **docs-only で済むか**
- **既存運用の混乱を減らすか**
- **すぐに効果が出るか**
- **他タスクの前提になるか**
- **今やると過剰設計にならないか**（早すぎる最適化を避ける）

### 10.2 優先度分類（P0〜P3）

- **P0**: 安全性・誤操作防止に直結（例：head SHA guard 不在、Approval Phrase 誤発火経路）
- **P1**: 現在の運用負担を大きく減らす（例：コピペ削減、テンプレ実ファイル化）
- **P2**: 後続改善として有効（例：v0.2 統合検討、Registry 設計）
- **P3**: アイデア段階（例：将来構想、未確定の自動化）

### 10.3 優先度と Risk Level の独立性

- 優先度（P0〜P3）と Risk Level（Level 0〜3+）は **独立** している。
- P0 でも docs-only Level 1 で済むことが多い（安全運用設計）。
- P3 で Level 3+ の大改造は **着手しない**（過剰設計）。

---

## 11. Candidate の数を増やしすぎないルール

### 11.1 候補過多を防ぐ原則

- **Nice to Have をすべて Candidate にしない**（§7.2 基準を満たすものだけ）。
- **1 review で Candidate は原則 1〜3 件まで**（Reviewer / Implementer が出すとき）。
- **重複 Candidate は統合する**（ChatGPT 司令塔が Triage で Merge 提案）。
- **小さすぎる改善は近い Task にまとめる**（独立 Candidate にしない）。
- **大きすぎる Candidate は Split 候補にする**（Adopt 前に分割）。
- **すぐやらないものは Hold にする**（Candidate を膨張させない）。

### 11.2 Registry 化の判断基準

- Candidate が **頻繁に増え、消化されない** ようになったら `TOUR-OPS-AI-TASK-CANDIDATE-REGISTRY-DESIGN` を検討する。
- **本 PR では Registry 実ファイル化に進まない**（早すぎる体系化を避ける）。
- 当面は Candidate を **PR コメント / 完了報告 / Reviewer Report に分散記載** する運用で様子を見る。

---

## 12. Candidate 標準例

### 12.1 例 1：Reviewer Nice to Have 由来

```
Task Candidate:
- Candidate ID: CAND-PR127-001
- Source: PR #127 Claude Code Reviewer Nice to Have
- Proposal: Approval Phrase の誤字・表記揺れルールを整理する（「承認：mege」「承認：PR #127 Ready 化」全角空白入り等の誤発火を防ぐ）
- Reason: §7.1 有効 7 条件で「Action が明確」と判定する際、誤字や表記揺れが入った承認文の扱いが未定義。実運用では「承認：PR #127 Ready化」とそれ以外の表記揺れを区別する基準が必要
- Expected Benefit: 安全性向上（誤操作防止）、Approval Phrase 運用の安定化
- Risk Level: Level 1（docs-only design）
- Suggested Task ID: TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT
- Suggested Owner: Claude Code Implementer
- Suggested Timing: Later
- Required Human Decision: Adopt / Hold（Action Request 設計の trial 結果を踏まえて判断推奨）
- Auto-Implementation: Prohibited
- Acceptance Criteria Draft: Action Request テンプレ実ファイル化時に「Approval Phrase 正規化ルール」セクションを追加（誤字検出、表記揺れの扱い、ambiguity 時の停止条件）
- Forbidden Scope: 自動承認ロジックの実装、Bot 化、GitHub Actions 化、PR #127 Action Request design 本体の改訂
- Related PR / Docs: PR #127 / docs/ops/20260516_shogi_tour_action_request_design.md
- Notes: PR #127 自己実証で「承認：PR #127 Ready化」が一度発火しなかった経緯（対応 AR 不在）を踏まえている
```

### 12.2 例 2：Implementer 完了報告由来

```
Task Candidate:
- Candidate ID: CAND-PR127-002
- Source: PR #127 squash merge 完了報告（AR-PR127-MERGE-001 Post-Execution Report §18）
- Proposal: branch 削除を別 Action Request として扱う trial を行う（squash merge と分離した運用を実証する）
- Reason: PR #127 で「branch 削除は常に別許可」を遵守したが、別 AR 発行 / 別 Approval Phrase を経て削除する流れを実運用で試したことがない
- Expected Benefit: branch 削除の安全運用パターン確立、Action Request 設計の追加実証
- Risk Level: Level 1（docs-only trial + 1 回の branch 削除）
- Suggested Task ID: TOUR-OPS-ACTION-REQUEST-TRIAL-001
- Suggested Owner: Claude Code Implementer
- Suggested Timing: Next
- Required Human Decision: Adopt / Hold
- Auto-Implementation: Prohibited
- Acceptance Criteria Draft: 小さな docs-only PR で AR を発行 → Adoption → 着手 → Draft → Review → Ready 化 AR → merge AR → branch 削除 AR の全 7 段階を 1 回試す
- Forbidden Scope: main branch / 他 branch への操作、tag 削除、release / deploy / publish
- Related PR / Docs: PR #127 完了報告 / docs/ops/20260516_shogi_tour_action_request_design.md
- Notes: PR #127 の branch は現在も削除されず残存中。本 Candidate を採用する場合、PR #127 branch を題材にしてもよい
```

### 12.3 例 3：ユーザー発言由来

```
Task Candidate:
- Candidate ID: CAND-USER-20260516-001
- Source: ユーザー発言「まだ、コピペが続いているけど自動化への道のりはまだ遠い？」
- Proposal: 長文コピペを短文承認に置き換える Action Request 設計を作る
- Reason: 髙橋さんの長文コピペ負担が大きい。司令塔→Implementer→Reviewer→司令塔の往復で毎回長文を運ぶ運用が続いている
- Expected Benefit: コピペ負担削減、短文承認化、半自動化前段
- Risk Level: Level 1（docs-only design）
- Suggested Task ID: TOUR-OPS-ACTION-REQUEST-DESIGN
- Suggested Owner: Claude Code Implementer
- Suggested Timing: Done（PR #127 で実装済み、main `541feb2`）
- Required Human Decision: Adopt（実施済み）
- Auto-Implementation: Prohibited
- Acceptance Criteria Draft: 達成済み（PR #127 self-application で実証）
- Forbidden Scope: 自動承認、Bot 化、GitHub Actions 化
- Related PR / Docs: PR #127 / docs/ops/20260516_shogi_tour_action_request_design.md
- Notes: 本 Candidate は **遡及的に記録された例** であり、本設計フォーマットの動作確認も兼ねる
```

### 12.4 例 4：将来構想由来

```
Task Candidate:
- Candidate ID: CAND-USER-20260516-002
- Source: ユーザー発言「AI たちが能動的に機能強化を提案して…」
- Proposal: AI が改善候補を出す Candidate 管理を設計する
- Reason: AI の能動性を活かしつつ、勝手な実装を防ぐ器が必要
- Expected Benefit: AI 能動提案の安全な受け止め、Candidate 化と Adoption の分離
- Risk Level: Level 1（docs-only design）
- Suggested Task ID: TOUR-OPS-AI-TASK-CANDIDATE-DESIGN
- Suggested Owner: Claude Code Implementer
- Suggested Timing: Now（本 PR）
- Required Human Decision: Adopt（実施中）
- Auto-Implementation: Prohibited
- Acceptance Criteria Draft: docs/ops/ に Candidate 設計メモを追加し、PR コメント / 完了報告での運用方法を整理
- Forbidden Scope: Registry 実ファイル化、GitHub Issues 連携、Bot 化、自動 Task 化
- Related PR / Docs: 本 PR / docs/ops/20260516_shogi_tour_ai_task_candidate_design.md
- Notes: 本 PR 自身が本 Candidate の Adoption 結果。本設計フォーマットの自己実証としても機能する
```

### 12.5 例 5：HANDOFF.md 整理由来（Hold 例）

```
Task Candidate:
- Candidate ID: CAND-HANDOFF-001
- Source: PR #122 以降の HANDOFF.md 追記が長文化している観察
- Proposal: HANDOFF.md フォーマット見直し（5.5 機能修正履歴 entry の構造化、見出し / リスト形式の標準化、長文 1 段落の分割）
- Reason: 1 entry が数千文字に達しており、可読性が低下している
- Expected Benefit: 引き継ぎ書としての可読性向上、検索性向上
- Risk Level: Level 1（docs-only design）
- Suggested Task ID: TOUR-OPS-HANDOFF-FORMAT-DESIGN
- Suggested Owner: Claude Code Implementer
- Suggested Timing: Later（v0.2 統合と前後して判断）
- Required Human Decision: Hold（v0.2 検討と同時に再評価推奨）
- Auto-Implementation: Prohibited
- Acceptance Criteria Draft: HANDOFF.md の追記テンプレを標準化（見出し / リスト / 必須項目 / 任意項目）
- Forbidden Scope: 既存 entry の書き換え（新規 entry のみフォーマット適用）、v0.1 ルール本体改訂
- Related PR / Docs: HANDOFF.md / docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md
- Notes: 既存 entry を遡及的に書き換えると過去 PR との整合性が崩れる懸念あり。新規 entry からの段階適用を推奨
```

---

## 13. Action Request との関係

### 13.1 役割分担

- **Task Candidate** は「**採用前の候補**」（What might be done）
- **Action Request** は「**採用後、次に実行してよい具体操作**」（What is allowed now）
- Candidate に Approval Phrase を出しても **ただちに実装ではない**。
- Candidate 採用の Approval Phrase と Action Request 実行の Approval Phrase を **明確に分ける**。

### 13.2 4 段階の Approval Phrase

| 段階 | 承認文の例 | 効果 |
| --- | --- | --- |
| ① Candidate 採用 | `承認：CAND-PR127-001 を Task 化` | Candidate → Task ID 確定（branch / commit はまだない） |
| ② Task 着手 | `承認：TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT 着手` | branch 作成 / Draft PR 作成許可（Action Request 設計 §6.5 と整合） |
| ③ Ready 化 | `承認：PR #128 Ready化` | Draft → Ready 化（Action Request 設計 §6.1） |
| ④ merge | `承認：PR #128 squash merge` | squash merge 実行（Action Request 設計 §6.2） |

### 13.3 兼用パターン

Suggested Task ID が明確で Risk Level が低い場合、① と ② を **兼ねる承認文** も許容する：

```
承認：TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT 着手
```

ただしこの場合、AI 側は「Candidate Adoption」と「Task 着手」の **両方の意図** を読み取り、precondition を実行直前再確認すること。曖昧な場合は停止して確認する。

### 13.4 Candidate に Forbidden Actions を先取りする利点

Candidate の §5.13 Forbidden Scope に **触ってはいけない範囲** を先に書いておくと、Task 化後の Action Request で Forbidden Actions を作るときに **そのまま流用** できる。Candidate → Task → Action Request の情報伝搬が滑らかになる。

---

## 14. ChatGPT 司令塔の Candidate 整理フォーマット

ChatGPT 司令塔が Candidate を整理（Triage）する際の **標準フォーマット**。

```
=== Candidate Triage Summary ===

Candidate 一覧:
- CAND-XXX-001: <Proposal 1 行要約>（優先度 P1、Risk Level 1、Timing Next）
- CAND-XXX-002: <Proposal 1 行要約>（優先度 P2、Risk Level 1、Timing Later）
- CAND-XXX-003: <Proposal 1 行要約>（優先度 P3、Risk Level 2、Timing Hold）
- ...

採用推奨:
- CAND-XXX-001（理由：安全性向上、docs-only、即効性）

保留推奨:
- CAND-XXX-002（理由：v0.2 統合検討と同時期推奨）
- CAND-XXX-003（理由：早すぎる最適化リスク、観察後）

統合推奨:
- CAND-XXX-004 と CAND-XXX-007 は同趣旨 → 統合提案

却下推奨:
- CAND-XXX-008（理由：scope 過大、現状の運用負担を増やす方向）

次にやるべき 1 件:
- CAND-XXX-001

理由:
- <なぜこれを次にやるべきか、3〜5 行で>

推奨 Approval Phrase:
- 承認：CAND-XXX-001 を Task 化
- または 承認：<Suggested Task ID> 着手

推奨 Action Request:
- <Suggested Task ID> 着手 AR の骨子（Allowed Scope / Forbidden Actions の要点を先取り）

注意すべき禁止事項:
- 自動 Task 化禁止
- Adoption 承認なしに branch 作成禁止
- 後続タスク着手禁止（採用された Candidate 以外）
- Reviewer 提案 Candidate の Owner を Reviewer にしない
```

司令塔は **採用そのものを決定しない**（髙橋さんが Adopt 承認を出すまで Candidate のまま）。

---

## 15. 今回やらないこと

本 PR では次は **行わない**。

- Candidate Registry 実ファイル化（`docs/ops/ai_task_candidates.md` 等の作成）
- GitHub Issues 化 / GitHub Projects 化
- Bot 化 / GitHub Actions 化 / API 連携
- 自動 Task 化 / 自動実装 / 自動 Ready 化 / 自動 merge
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
- Action Request design（`docs/ops/20260516_shogi_tour_action_request_design.md`）改訂
- branch protection 変更
- token / secret / credential 操作
- release / deploy / publish / branch 削除
- 後続タスク着手（§16 のいずれも本 PR では着手しない）
- RESET-UX 後続実装

---

## 16. 後続タスク候補

本 PR では着手しない。Candidate Adoption + 髙橋さん明示許可が揃ったときに別 PR / 別セッションで進める。

| 優先 | Task ID | 内容 |
| --- | --- | --- |
| 第一 | `TOUR-OPS-AI-TASK-CANDIDATE-TRIAL-001` | Candidate を実際に 1〜3 件出して整理する trial |
| 第二 | `TOUR-OPS-AI-TASK-CANDIDATE-REGISTRY-DESIGN` | Candidate が増えた場合の Registry 設計 |
| 第三 | `TOUR-OPS-ACTION-REQUEST-TRIAL-001` | Action Request を最初から trial としてもう 1 回試す（branch 削除 AR を含む 7 段階フロー実証） |
| 並走可 | `TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT` | Action Request テンプレを docs に実ファイル化 |
| 並走可 | `TOUR-OPS-CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT` | Reviewer 依頼文テンプレ実ファイル化 |
| 並走可 | `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` | 完了報告テンプレ / RRD コメント / Core 5 / Standard 11 記載場所の実装 |
| 並走可 | `TOUR-OPS-REVIEW-REQUEST-TEMPLATE-IMPL-LIGHT` | RRD テンプレ実ファイル化 |
| 並走可 | `TOUR-OPS-AI-WORK-QUEUE-DESIGN` | `ai_work_queue.md` 設計 |
| 並走可 | `TOUR-OPS-PR-TEMPLATE-DESIGN` | `.github/PULL_REQUEST_TEMPLATE.md` 設計 |
| 並走可 | `TOUR-OPS-HANDOFF-FORMAT-DESIGN` | HANDOFF.md フォーマット設計 |
| 観察後 | `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` | #122〜#127 と本設計を v0.2 に統合するか検討 |

---

## 17. 結論

- AI が **能動的に改善候補を出す世界** に進むには、まず Candidate として **安全に受け止める器** が必要。
- Candidate は **実装許可ではない**（Auto-Implementation Prohibited）。
- 採用には **髙橋さんの明示判断が必要**（Adopt / Hold / Reject / Split / Merge）。
- 採用後も **Task 化 → Action Request → Approval Phrase → 実行** の安全経路を必ず通る。
- これにより **AI の能動性と人間の最終判断を両立** できる。
- 今回は **設計のみ** であり、実運用・Registry・自動化・Task 化には進まない。後続 `TOUR-OPS-AI-TASK-CANDIDATE-TRIAL-001` で初回 trial、`TOUR-OPS-AI-TASK-CANDIDATE-REGISTRY-DESIGN` は **Candidate 過多が観察されたときだけ** 検討、`TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW` で v0.2 統合判断、の順に積み上げる。
