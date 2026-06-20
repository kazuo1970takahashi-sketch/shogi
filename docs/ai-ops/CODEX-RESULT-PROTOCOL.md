# Codex / レビュー結果記録プロトコル（repo 版・単一の正本）

> **これは repo 内の正本（canonical）です。** cowork ワークスペース側 `~/AI_Projects/00_PMO/dispatch/CODEX-RESULT-PROTOCOL.md` の faithful mirror を **v2.1-final の凍結マーカー enum に更新**したもの。パイプライン本体＝[`AI-DEV-PIPELINE.md`](./AI-DEV-PIPELINE.md) / 役割・SoD＝[`AGENT-ROLES-AND-SOD.md`](./AGENT-ROLES-AND-SOD.md)。
>
> 目的: レビュー判定を **必ず GitHub に書き戻す**ことで、reconciler（scheduled actor）の自動前進ループを成立させる。
> 背景: 以前は結果書き戻しがローカル `..._RESULT.md` 書きに変質し、GitHub に結果が残らずループが切れていた（2026-06-20 復旧）。

## 鉄則
**「自分のチャットで判定して終わり」は未完了。** 対象 PR（無ければ Issue）に下記フォーマットのコメントを投稿して初めて1レビュー完了とする。書き戻しが無い限り、reconciler は前進できず、ボードも人間 merge 段取りも止まる。

## 必須フォーマット（機械判定は凍結 YAML マーカーが唯一の正）
レビュアーは対象 **PR にコメントを1件** 投稿する:

1. **先頭行**を人間可読の見出し `## Codexレビュー結果`（設計レビューは `## 設計レビュー結果`）で始める。**見出しは人間向け＝機械判定の正ではない**。
2. 判定理由 ＋ Must Fix / Should Fix / Nice-to-Have を本文に記す。
3. **末尾に機械可読マーカー（fenced YAML）を1ブロック**置く。**reconciler はこの YAML だけを判定に使う**:

```yaml
cowork-status: code-review-result   # 固定列挙: triage | design-done | design-review | implement-done | code-review-result | hold
verdict: go                         # 固定列挙（小文字ASCII）: go | conditional-go | block
reviewer: codex                     # vendor/agent id（SoD 自己レビュー検知に使用）
task: 264                           # 対象 Issue 番号
```

**凍結ルール（[`AI-DEV-PIPELINE.md §3-1`](./AI-DEV-PIPELINE.md) と完全一致）**:
- キー ASCII 固定（`cowork-status` / `verdict` / `reviewer` / `task`）。
- `verdict` は**小文字 ASCII** `go` / `conditional-go` / `block` のみ。**`GO` / `Conditional GO` / `CONDITIONAL_GO` / `BLOCK` は禁止**（旧表記。人間可読に併記する場合も機械判定には使わない）。
- 設計レビューは `cowork-status: design-review`、実装レビューは `cowork-status: code-review-result`。
- **1コメント＝マーカー1ブロック・最新コメント優先（latest-wins）**。
- 人間可読の併記として末尾に `レビュアー素性: <vendor/agent id>` 欄も置く（SoD 機械検知の補助）。

依頼テンプレ等の「## Codex 独立レビュー(L3) 依頼」「## Codex 再レビュー依頼」など**依頼**ヘッダ・依頼マーカーでは前進しない（結果と厳密に区別）。

## Codex の GitHub ネイティブレビューは「例外」として reconciler が読む（実測 2026-06-20 / PR #262）
Codex の GitHub コードレビューは**上記 YAML を書かない**。実測で確認:
- 投稿者 `chatgpt-codex-connector[bot]`（実装者と別 identity＝SoD 自動判別可）。形式は「💡 Codex Review」サマリ（review state=COMMENTED）＋ **P0/P1/P2/P3 バッジ付きインライン指摘**、指摘なしは 👍。
- **reconciler はネイティブ出力を凍結 enum に変換**（最大 severity で決める）:

| Codex ネイティブ出力 | 変換後 `verdict` |
|---|---|
| 指摘なし / 👍 | `go` |
| P2・P3 のみ | `conditional-go` |
| P0・P1 あり | `block`（→ `stage:needs-fix`） |

- トリガー: ①PR をレビュー用に開く ②Draft を Ready にする ③`@codex review` コメント。**Draft 据え置き運用では ③手動 `@codex review` が経路**（自動は Draft に発火しない）。クラウド実行＝デスクトップ非依存。
- 人間 / Claude Code が判定を貼る場合は**凍結 YAML マーカー**を使う。**Codex ネイティブ形式はこの1点のみ例外**。

## 自動前進（reconciler が担当・レビュアーはラベルを触らない）
reconciler（scheduled actor。既存 `cowork-dispatch-refresh` を拡張）が最新の判定（YAML or Codex ネイティブ）を検知し、対象 Issue のラベルを前進させる。**遷移先はマーカーの `cowork-status`（どの工程の判定か）で分岐**する（`verdict` だけでは行き先が一意に決まらない＝design-review と code-review で go の行き先が異なる）:

- **design-review**（`cowork-status: design-review`）: `verdict: go` / `conditional-go` → **`stage:implementing`**（実装へ）／ `verdict: block` → **`stage:design`**（設計やり直し）。
- **code-review**（`cowork-status: code-review-result`）: `verdict: go` / `conditional-go` → **`stage:ready-for-merge`**（人間 merge 待ち）／ `verdict: block` → **`stage:needs-fix`**（実装差し戻し）。
- **L0–2 bypass**: Review Level L0–1（L2 はレビュアー未割当時）は design-review / code-review を省略可。reconciler は `verdict` を待たず `## 設計完了` / `## 実装完了` 検知だけで次工程へ前進（[`AI-DEV-PIPELINE.md §2・§4`](./AI-DEV-PIPELINE.md)）。L3+ は bypass しない。
- **cut over 前の暫定運用**: reconciler 稼働前は cowork が**既存ラベル**（`needs-codex`→`ready-for-human-merge`/`needs-fix`）で手動 reconcile（[`AI-DEV-PIPELINE.md §7`](./AI-DEV-PIPELINE.md)）。

→ **レビュアー自身はラベル付替を行わない**（PAT/権限事情に依存せず、コメント投稿1アクションで完結）。merge / Ready化 / squash / branch削除 / production は人間の明示承認まで誰も行わない。

## レビュアー SPOF / escalation（v2.1-final 条件3）
L3+/L4 を Codex 一者に依存して停止しないよう、**review SLA 超過 → 人間レビュー or 代替レビュアーへ escalation**（無回答時の default action は「前進させない」＝安全側）。詳細＝[`AGENT-ROLES-AND-SOD.md §6`](./AGENT-ROLES-AND-SOD.md)。

## 依頼を出す側（cowork / 人間）の義務
レビュー依頼を発行するときは、本プロトコルの「必須フォーマット」節を**依頼文に必ず同梱**する。「結果の書き戻し先＝ローカル RESULT.md のみ」と書かない（GitHub PR コメントが第一・PAT 対象外 repo のみ RESULT.md 併用）。

## 貼り付け用ブロック（依頼にコピペ）
````
## 結果記録プロトコル（必須・reconciler 連携）
レビュー完了後、対象 PR（無ければ Issue）に**コメントを1件**投稿すること。フォーマット厳守:
- 先頭行を人間可読見出し `## Codexレビュー結果` で始める。
- 判定理由 + Must Fix / Should Fix / Nice-to-Have。
- 末尾に凍結 YAML マーカーを1ブロック（verdict は小文字 go|conditional-go|block のみ・reviewer に素性 ID）:
  ```yaml
  cowork-status: code-review-result
  verdict: go
  reviewer: codex
  task: <issue番号>
  ```
- merge / Ready化 / squash / branch削除 / production は実行しない（read-only 所見のみ）。
チャット返信で終えず、必ず GitHub コメントとして書き戻すこと（書き戻しが無い限り前進しない）。
````

---
正本（repo 版）。パイプライン＝[`AI-DEV-PIPELINE.md`](./AI-DEV-PIPELINE.md) / 役割・SoD＝[`AGENT-ROLES-AND-SOD.md`](./AGENT-ROLES-AND-SOD.md)。
