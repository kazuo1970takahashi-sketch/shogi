# CLAUDE.md — shogi（SHOGI-TOUR）リポジトリ指針

沼津将棋支部の月例大会運営 Web アプリ（`shogi_v4.html` 単一 HTML + localStorage、GitHub Pages 公開、スマホ運用前提）。

> **役割（このファイル）= Claude Code（実装ライン）の作業指針。** ドキュメント役割境界 = `docs/ai-ops/` 運用プロセス正本／[`docs/REFERENCE.md`](docs/REFERENCE.md) コード設計マップ／[`docs/CHANGELOG.md`](docs/CHANGELOG.md) 履歴／[`HANDOFF.md`](HANDOFF.md) 現在地。Codex のレビュー観点は [`AGENTS.md`](AGENTS.md)。

## 🔴 実装着手前に必読（AI 開発パイプライン正本 / PMO-OPS v2.1-final）

全 AI（Claude Code / Codex / レビューエージェント）と人間が共有する開発プロセスの**正本は repo 内 `docs/ai-ops/`** にあります。**着手前に必ず読むこと**:

- [`docs/ai-ops/AI-DEV-PIPELINE.md`](docs/ai-ops/AI-DEV-PIPELINE.md) — 工程・状態機械（`stage:` ラベル）・**結果書き戻しプロトコル**・**凍結マーカー（fenced YAML / `verdict: go|conditional-go|block`）**。
- [`docs/ai-ops/AGENT-ROLES-AND-SOD.md`](docs/ai-ops/AGENT-ROLES-AND-SOD.md) — 役割定義・**職務分離 SoD（G1〜G6・L0–L4）**・役割境界（継続監視/定期実行は scheduled actor）・レビュアー SPOF escalation。
- [`docs/ai-ops/CODEX-RESULT-PROTOCOL.md`](docs/ai-ops/CODEX-RESULT-PROTOCOL.md) — レビュー結果の GitHub 書き戻し仕様（Codex ネイティブ形式の読み取り含む）。

**要点**: 各工程の完了は **GitHub に定型ヘッダ付きコメント＋末尾に凍結マーカー1ブロックを書き戻すまでが1工程**（自分のチャットで終わりは未完了）。`stage:` ラベルの付け替えは reconciler（scheduled actor）が唯一の書き手。レビューは作者と別セッション・別素性（L3+ の code-review は Codex 必須）。

## 編集時の拘束ルール（9 項目・違反は実装前に停止）

`shogi_v4.html` は本番運用中の単一 HTML。以下を厳守する（**リファクタと挙動変更を混ぜない**）。Codex は同じ 9 項目で差分をレビューする（[`AGENTS.md`](AGENTS.md)・違反は P0/P1）:

1. **動作を変えるリファクタは禁止**（引数整理は許容）。
2. **build / bind / coordinator パターンを維持**（HTML 組立・イベント結線・呼び出し束ねの分離。`docs/REFERENCE.md` 参照）。
3. **CSS の動作を変えない**（特に `<div class="section">` の閉じタグ省略は**元コードからの仕様**＝ブラウザ自動補完で動作。修正禁止）。
4. **ES5 / 古典的クロージャ / グローバル `state` を維持**（モジュール化・フレームワーク化しない）。
5. **テストを必ず実行**: `bash test/run_tests.sh shogi_v4.html`（baseline は **WARN=0** を維持＝実在しないテスト参照を増やさない）。
6. **関数構造の意図しない変化がないか確認**（期待関数の present/構造チェック・escape ヒューリスティックを壊さない）。
7. **挙動変更を伴う改修はリファクタと別フェーズ**として扱う（混在させない）。
8. **編集対象は `shogi_v4.html`**（当日運営は無改変・**追加/最小改変中心**）。`index.html` / `.github` / `package*` は原則触らない。
9. **production 反映（デプロイ）時は `?v=N` をインクリメント**（GitHub Pages キャッシュ回避）。

## 絶対ルール・現在地

- ブランチ運用・current HEAD・進行中タスク・制約は [`HANDOFF.md`](HANDOFF.md) が正本（PR の base は orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`・`main` を base にしない／production 反映は別 release PR）。
- コード設計マップ（関数構造・データ構造）= [`docs/REFERENCE.md`](docs/REFERENCE.md)／実装履歴 = [`docs/CHANGELOG.md`](docs/CHANGELOG.md)／プロセス正本 = [`docs/ai-ops/`](docs/ai-ops/)。
- **追加/最小改変中心**・`shogi_v4.html` の当日運営は無改変・**Draft PR で停止**（Ready化/merge/squash/branch削除/production は人間の明示承認まで未実施）・**secret/実データ不使用**（テスト fixture は架空のみ）。
- テスト: `bash test/run_tests.sh shogi_v4.html`（baseline は WARN=0 を維持＝実在しないテスト参照を増やさない）。
