<!--
このテンプレは AI 開発パイプライン（PMO-OPS v2.1-final）を「by construction」で携えるためのものです。
正本: docs/ai-ops/AI-DEV-PIPELINE.md ／ 役割・SoD: docs/ai-ops/AGENT-ROLES-AND-SOD.md ／ 書き戻し: docs/ai-ops/CODEX-RESULT-PROTOCOL.md
実装着手前に上記 docs/ai-ops/ を必読。
-->

## 概要
<!-- 何を・なぜ。1〜3行 -->

## 変更ファイル
<!-- 追加/最小改変中心。shogi_v4.html の当日運営は無改変が原則。 -->

## 検証
<!-- npm test の PASS/FAIL/WARN、html-validate、ブラウザ確認など。固定 head SHA を明記。 -->

## 構造化フィールド（reconciler が関係を機械的に辿る・該当行のみ残す）
<!-- docs/ai-ops/AI-DEV-PIPELINE.md §8-1。不要な行は削除可。 -->
- related_pr:        <!-- 例: #268 -->
- supersedes:        <!-- このPRが置き換える Issue/PR -->
- superseded_by:     <!-- このPRを置き換えた Issue/PR -->
- canonical_decision: <!-- 例: PMO-OPS v2.1-final -->

## 制約（HANDOFF.md 絶対ルール）
- [ ] 追加/最小改変中心・`shogi_v4.html` 当日運営は無改変
- [ ] Draft PR で停止（Ready化/merge/squash/branch削除/production は人間の明示承認まで未実施）
- [ ] secret/実データ不使用

---

## 結果書き戻しプロトコル（全工程共通・必須）
正本 = [`docs/ai-ops/AI-DEV-PIPELINE.md §3`](../docs/ai-ops/AI-DEV-PIPELINE.md)。各工程の担当は完了時、対象 Issue（実装系は本 PR）に**定型ヘッダ付きコメントを1件**投稿する。
- 先頭行＝人間可読見出し（`## トリアージ` / `## 設計完了` / `## 設計レビュー結果` / `## 実装完了` / `## Codexレビュー結果` / `## 保留`）。
- **末尾に凍結マーカー（fenced YAML）を1ブロック**。**機械判定はこの YAML が唯一の正**（見出しや旧 `判定: GO` は併記可・正ではない）。
- 「自分のチャットで終わり」は未完了＝**GitHub に書き戻すまでが1工程**。

### stage 定義（1タスク=1 Issue=`stage:` ラベル1個・付け替えは reconciler だけ）
`stage:intake → triage → design → design-review → implementing → code-review → ready-for-merge → done`（差し戻し `needs-fix` / 保留 `blocked`・`on-hold`）。フラグ（直交）: `flag:consult-chatgpt` / `flag:human-decision` / `flag:secret-risk` / `flag:aging` / `flag:sod-violation`。終了理由: `closed:done` / `closed:duplicate` / `closed:superseded` / `closed:not-planned`。

### 凍結マーカー雛形（[`§3-1`](../docs/ai-ops/AI-DEV-PIPELINE.md)・末尾に1ブロック）
実装完了（`## 実装完了`）は**判定工程ではない**ため `verdict` 行は付けない:
```yaml
cowork-status: implement-done   # 固定列挙: triage | design-done | design-review | implement-done | code-review-result | hold
reviewer: claude-code           # vendor/agent id（マーカーを出した素性。SoD 自己レビュー検知用）
task: 0                          # 対象 Issue 番号
```
- `verdict:` 行は**判定工程（design-review / code-review）のみ**に付け、値は**小文字** `go | conditional-go | block`（`GO`/`Conditional GO`/`CONDITIONAL_GO` 禁止）。実装完了・トリアージ・保留など判定の無い工程では `verdict` 行を省略する。
- **1コメント＝マーカー1ブロック・最新コメント優先**。

### レビュー結果欄（レビュアーが記入・SoD G1〜G6）
> レビュー（design-review / code-review）は**作者と別セッション・別素性**で行う（[`docs/ai-ops/AGENT-ROLES-AND-SOD.md`](../docs/ai-ops/AGENT-ROLES-AND-SOD.md)）。L3+ の code-review は **Codex（OpenAI）必須**。self-check はレビューに代えられない（G4）。
- 判定: <!-- go / conditional-go / block （凍結マーカーにも記す） -->
- **レビュアー素性: <vendor/agent id>**  <!-- 例: codex / claude-code-reviewer。reconciler が実装者素性と突き合わせ自己レビューを検知（SoD §4）。 -->
- Must Fix / Should Fix / Nice-to-Have:

🤖 PMO-OPS v2.1-final / 実装ライン=Claude Code
