---
name: cowork dispatch (PMO-OPS v2.1-final)
about: cowork(PMO) から実装ラインへの作業ディスパッチ。パイプライン正本を by construction で携える。
title: "[cowork-dispatch] "
labels: []
---

<!--
正本: docs/ai-ops/AI-DEV-PIPELINE.md ／ 役割・SoD: docs/ai-ops/AGENT-ROLES-AND-SOD.md ／ 書き戻し: docs/ai-ops/CODEX-RESULT-PROTOCOL.md
着手前に上記 docs/ai-ops/ を必読。stage ラベルは reconciler（scheduled actor）が付与する（このテンプレは stage を pre-apply しない）。
-->

## なぜこの Issue か（根本原因 / 価値）
<!-- 何を・なぜ。背景の不具合や狙う価値。 -->

## やること
<!-- 箇条書き。1タスク=1 Issue（相互排他）。 -->

## トリアージ（cowork が記入）
- 範囲:
- Review Level: <!-- L0 / L1-2 / L3 / L4（docs/ai-ops/AGENT-ROLES-AND-SOD.md §2-1）。L3+ code-review は Codex 必須。 -->
- 担当:         <!-- 既定: Claude Code（実装ライン） -->
- ChatGPT 要否: <!-- 要なら flag:consult-chatgpt -->

## 構造化フィールド（reconciler が関係を機械的に辿る・該当行のみ残す）
- related_pr:
- supersedes:
- superseded_by:
- canonical_decision:

## 制約（HANDOFF.md 絶対ルール）
追加/最小改変中心・`shogi_v4.html` 当日運営は無改変・Draft PR で停止（Ready化/merge/squash/branch削除/production は人間の明示承認まで未実施）・secret/実データ不使用。

---

## 結果書き戻しプロトコル（全工程共通・必須）
正本 = `docs/ai-ops/AI-DEV-PIPELINE.md §3`。各工程の担当は完了時、対象 Issue（実装系は PR）に**定型ヘッダ付きコメントを1件**投稿し、**末尾に凍結マーカー（fenced YAML）を1ブロック**置く。**機械判定はこの YAML が唯一の正**（見出し・旧 `判定: GO` は併記可・正ではない）。「自分のチャットで終わり」は未完了＝**GitHub に書き戻すまでが1工程**。

### stage 定義（1タスク=1 Issue=`stage:` ラベル1個・付け替えは reconciler だけ）
`stage:intake → triage → design → design-review → implementing → code-review → ready-for-merge → done`（差し戻し `needs-fix` / 保留 `blocked`・`on-hold`）。フラグ: `flag:consult-chatgpt` / `flag:human-decision` / `flag:secret-risk` / `flag:aging` / `flag:sod-violation`。終了理由: `closed:done` / `closed:duplicate` / `closed:superseded` / `closed:not-planned`。

### 凍結マーカー雛形（末尾に1ブロック）
トリアージは**判定工程ではない**ため `verdict` 行は付けない（`verdict` は design-review / code-review のみ）:
```yaml
cowork-status: triage           # 固定列挙: triage | design-done | design-review | implement-done | code-review-result | hold
reviewer: cowork                # vendor/agent id（マーカーを出した素性）
task: 0                         # 対象 Issue 番号
```
- 判定工程（design-review / code-review）でのみ `verdict:` 行を**小文字** `go | conditional-go | block` で付ける（`GO`/`Conditional GO`/`CONDITIONAL_GO` 禁止）。それ以外の工程（triage / design-done / implement-done / hold）は `verdict` 行を省略する。
- **1コメント＝マーカー1ブロック・最新コメント優先**。

🤖 PMO-OPS v2.1-final / cowork PMO dispatch
