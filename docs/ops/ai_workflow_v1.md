# AI 並行開発 運用 v1（最小ゲート）

> 最小ゲート導入。ここは「役割」「ゲート順序」「ゲートの回し方」だけ。大規模な運用論は別途。

## 役割（v1.3）
- **主軸 = Claude Code orchestrator**: workflow / subagent / worktree で 実装・一次レビュー・並行調査・ゲート実行・Draft PR。**明示承認後のみ** Ready/merge。
- **作る前の非相関レビュー = ChatGPT**: 要件ゲートで「別解釈」を突く。repo 状態判断はしない。1機能1タッチ。
- **作った後の非相関レビュー = Codex**: 重要 PR のみ（→ `codex_review_policy.md`）。受入条件を入力に。
- **長尺整理・台帳・dashboard = cowork（補助）**: advisory のみ。**STOP/CLEAR/merge 判断の入力にしない**（キャッシュ状態）。
- **人間**: 要件の真実 / GO・STOP / release・deploy・publish / 「本当に欲しいものか」最終判断。

## 真実源
- repo 状態（merged / base / CI / mergeable）の真実源は **GitHub/git**。記憶・会話文脈・dashboard で判断しない。
- 操作直前に live 再取得する（#235 TOCTOU 対策の前提）。

## ゲート順序
1. **要件確定ゲート**（`requirement_gate_template.md`）→ 受入条件・対象外を埋め、ChatGPT 非相関レビュー＋人間 GO。**未通過は着手禁止**。
2. **実装**（隔離 worktree / Draft PR）。
3. **一次レビュー**（Claude Code adversarial subagent）＋ テスト。
4. **重要 PR は Codex レビュー**（`codex_review_policy.md`）→ 受入条件を満たすか / 対象外に踏み込んでいないか。
5. **merge ゲート**（read-only）→ 人間 GO → 承認後 merge（head SHA を CAS 固定）。

## merge ゲートの回し方（runbook）
read-only 判定（merge しない。0=READY_CANDIDATE / 10=NEEDS_REVIEW / 20=BLOCKED）:

~~~
./scripts/shogi_tour_pr_gate.sh --pr <PR> --profile orphan-dev
~~~

出力の「head SHA」を控える（CAS 用）。人間 GO 後に承認 merge（dry-run → execute）:

~~~
./scripts/shogi_tour_approved_merge.sh --pr <PR> --profile orphan-dev --expect-head <40桁SHA> --dry-run
./scripts/shogi_tour_approved_merge.sh --pr <PR> --profile orphan-dev --expect-head <40桁SHA> --execute
~~~

- merge は `gh pr merge --squash --match-head-commit <head SHA>`。**承認後に head が進めば GitHub 側で原子的に拒否**（#235 TOCTOU 防止）。merge-gate は早期・網羅の事前チェック、`--match-head-commit` は最後の CAS。役割が違い、両方必要。
- **branch は削除しない**（`--delete-branch` 不使用）。production / main 直接 push・Pages 変更・deploy はしない。

## wave チェックポイント（orchestrator は SPOF）
複数タスクを束ねたら、merge の節目で人間が安い**照合**だけ行う（全 diff 精読ではない）:
- orphan base が想定 SHA か / merge 集合が各要件1枚と一致するか / footprint 異常（index.html 不変・実データ無）なし。

## 並列・ホットファイル（今は最小）
- merge は直列（orphan 線形 base）。並列は 実装・レビューで出す。
- `shogi_v4.html` の並行 2 本目が出たら、`area:*` label ＋ `git merge-tree` 衝突判定を追加（本 v1 では未導入）。OWNERSHIP.md / 自前状態台帳は作らない（状態は GitHub label が正本）。

## 既存資産との関係（重複を作っていない）
- 本 gate スクリプトは AUTO-001（PR #196/#197・main 系統）の `shogi_tour_pr_gate.sh` / `shogi_tour_approved_merge.sh` を **orphan base へバイト同一で再利用**し、`orphan-dev` profile と `--match-head-commit` head-CAS のみ追記したもの（`[AI-DEV-GATES-V1]` マーカー）。新規重複実装はしていない。
- companion test（main の `test/test_pr_gate_scripts.sh`）の orphan base への移植＋`orphan-dev` / CAS 追加分のテストは **follow-up**（本 v1 は scope=docs/ops + scripts に限定し test/ を触らない）。
- 解消済み follow-up（**AI-DEV-GATES-V1-FOLLOWUP-001**）: `approved_merge.sh` の Step7/8 が使っていた `gh api`（当環境 deny 対象）を撤去し、base 最新 SHA 取得・head branch 残存確認を `git ls-remote --heads origin <branch>` に置換した。これにより **`--execute` 経路の post-merge 検証が gh api 非依存**となり、当環境でも劣化しない。head-CAS（`--match-head-commit`）/ `--delete-branch` 不使用 / dry-run 既定の挙動は不変。
