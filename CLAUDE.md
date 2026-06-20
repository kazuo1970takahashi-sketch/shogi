# CLAUDE.md — shogi（SHOGI-TOUR）リポジトリ指針

沼津将棋支部の月例大会運営 Web アプリ（`shogi_v4.html` 単一 HTML + localStorage、GitHub Pages 公開、スマホ運用前提）。

## 🔴 実装着手前に必読（AI 開発パイプライン正本 / PMO-OPS v2.1-final）

全 AI（Claude Code / Codex / レビューエージェント）と人間が共有する開発プロセスの**正本は repo 内 `docs/ai-ops/`** にあります。**着手前に必ず読むこと**:

- [`docs/ai-ops/AI-DEV-PIPELINE.md`](docs/ai-ops/AI-DEV-PIPELINE.md) — 工程・状態機械（`stage:` ラベル）・**結果書き戻しプロトコル**・**凍結マーカー（fenced YAML / `verdict: go|conditional-go|block`）**。
- [`docs/ai-ops/AGENT-ROLES-AND-SOD.md`](docs/ai-ops/AGENT-ROLES-AND-SOD.md) — 役割定義・**職務分離 SoD（G1〜G6・L0–L4）**・役割境界（継続監視/定期実行は scheduled actor）・レビュアー SPOF escalation。
- [`docs/ai-ops/CODEX-RESULT-PROTOCOL.md`](docs/ai-ops/CODEX-RESULT-PROTOCOL.md) — レビュー結果の GitHub 書き戻し仕様（Codex ネイティブ形式の読み取り含む）。

**要点**: 各工程の完了は **GitHub に定型ヘッダ付きコメント＋末尾に凍結マーカー1ブロックを書き戻すまでが1工程**（自分のチャットで終わりは未完了）。`stage:` ラベルの付け替えは reconciler（scheduled actor）が唯一の書き手。レビューは作者と別セッション・別素性（L3+ の code-review は Codex 必須）。

## 絶対ルール・現在地

- ブランチ運用・current HEAD・進行中タスク・制約は [`HANDOFF.md`](HANDOFF.md) が正本（PR の base は orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`・`main` を base にしない／production 反映は別 release PR）。
- **追加/最小改変中心**・`shogi_v4.html` の当日運営は無改変・**Draft PR で停止**（Ready化/merge/squash/branch削除/production は人間の明示承認まで未実施）・**secret/実データ不使用**（テスト fixture は架空のみ）。
- テスト: `bash test/run_tests.sh shogi_v4.html`（baseline は WARN=0 を維持＝実在しないテスト参照を増やさない）。
