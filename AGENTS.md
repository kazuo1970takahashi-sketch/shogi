# AGENTS.md — Codex 独立レビュー指針（`shogi_v4.html`）

沼津将棋支部の月例大会運営 Web アプリ（`shogi_v4.html` 単一 HTML + localStorage、GitHub Pages 公開）の**コードレビュー**指針。

- リポジトリ: `kazuo1970takahashi-sketch/shogi`（public）／公開 = https://kazuo1970takahashi-sketch.github.io/shogi/
- **レビュー対象 = `shogi_v4.html`**（当日運営中の単一 HTML。PR 差分を read-only でレビューする）。

> **役割境界**: このファイルは **Codex（独立コードレビュアー）の観点**。実装ラインの指針は [`CLAUDE.md`](CLAUDE.md)。ドキュメント役割境界 = `docs/ai-ops/` 運用プロセス正本／[`docs/REFERENCE.md`](docs/REFERENCE.md) コード設計マップ／[`docs/CHANGELOG.md`](docs/CHANGELOG.md) 履歴。役割・SoD の正本 = [`docs/ai-ops/AGENT-ROLES-AND-SOD.md`](docs/ai-ops/AGENT-ROLES-AND-SOD.md)。

## Codex の役割（独立レビュアー）

- Codex はこのリポジトリの **独立コードレビュアー**。PR 差分を **read-only** でレビューし、GitHub に**ネイティブ形式**で書き戻す（投稿者 `chatgpt-codex-connector[bot]`・「💡 Codex Review」サマリ ＋ P0–P3 バッジ付きインライン指摘・指摘なしは 👍）。
- **やらないこと**: 実装・コード変更・merge・Ready 化・branch 削除・production 反映（いずれも人間の専権。AI は実行しない）。
- **自己レビュー禁止（SoD: 作者 ≠ レビュアー / G1）**: 自分が書いたコード・設計はレビューしない。レビューの価値は **作者と独立した敵対的チェック**にある。
- **L4（`scripts` 本体・ゲート/ツール等）の独立 code-review は Codex（クロスベンダー）必須**＝実装者素性と別 identity で SoD を自動判別する。**L3（`shogi_v4.html` の runtime ロジック等）は独立 code-review 必須だが、別セッションの Claude Code レビューア**で可（Codex 週次枠を温存）。継続監視・定期実行はしない（オンデマンド、または `@codex review` トリガ）。

## Review guidelines

`shogi_v4.html` への差分は、下記 **9 つの拘束ルール**に照らして見る。**これらに違反する変更は P0/P1（ブロッキング）として指摘**せよ（実装ラインの [`CLAUDE.md`](CLAUDE.md) と同一）:

1. **動作を変えるリファクタは禁止**（引数整理は許容）— 挙動が変わる差分が「リファクタ」と称されていないか。
2. **build / bind / coordinator パターンを維持** — HTML 組立・イベント結線・呼び出し束ねの分離が壊れていないか。
3. **CSS の動作を変えない** — 特に `<div class="section">` の閉じタグ省略は**元コードからの仕様**（ブラウザ自動補完で動作）。これを「修正」していないか。
4. **ES5 / 古典的クロージャ / グローバル `state` を維持** — モジュール化・フレームワーク化・構造変更をしていないか。
5. **テストが実行され通っているか** — `bash test/run_tests.sh shogi_v4.html`・**WARN=0** 維持。テストは `test/` に置くだけで自動発見される（STAGE0-CONFLICT-FREE-001）ので、`run_tests.sh` への登録追記は**不要**。逆に `run_tests.sh` 本体に手で実行行を足す差分が出ていたら、自動発見の規則から外れていないかを見る。
6. **関数構造の意図しない変化がないか** — 期待関数の present/構造・escape ヒューリスティックを壊していないか・**未エスケープのユーザー入力を innerHTML に流していないか**。
7. **挙動変更を伴う改修がリファクタと別フェーズか** — 1 つの PR にリファクタと挙動変更が混在していないか。
8. **編集対象が `shogi_v4.html` に閉じているか** — 当日運営の無改変・追加/最小改変中心。`index.html` / `.github` / `package*` の不用意な巻き込みがないか。
9. **production 反映時に `?v=N` がインクリメントされているか** — release PR の場合・GitHub Pages キャッシュ回避。

加えて、**回帰・データ消失リスク・保存復元の破壊**も P0/P1 で指摘する（例: `state.pairings` / `state.results` の破壊、match 正準形 `{p1,p2,winner,lastModifiedBy}`＝`sanitizeMatch` からの逸脱、`generatePairing` の意図しない全員上書き、`normalizeState` の往復恒等性が崩れる保存スキーマ変更）。データモデルの詳細は [`docs/REFERENCE.md`](docs/REFERENCE.md)。

UI（ボタン・色・文言・通知・ヘルプ）を触る差分は [`docs/STYLE-GUIDE.md`](docs/STYLE-GUIDE.md)（UI 規約正本）への準拠も確認し、違反は **P2** で指摘する（非ブロッキング）。

## Severity 運用

| severity | 対象 | 区分 |
|---|---|---|
| **P0 / P1** | 上記 9 拘束ルール違反・回帰・データ消失リスク・保存復元の破壊 | **ブロッキング**（要修正） |
| **P2 / P3** | 軽微な改善提案・nice-to-have・スタイル | 非ブロッキング |

- reconciler（scheduled actor）が Codex のネイティブ出力（**最大 severity**）から判定を導出する:
  - 指摘なし / 👍 → **GO**
  - P2・P3 のみ → **Conditional GO**
  - P0・P1 あり → **BLOCK**（→ `stage:needs-fix`）
- **判定の YAML マーカーは書かない**。Codex は GitHub ネイティブ Review 形式（P0–P3）で書き、変換は reconciler が行う。凍結 YAML マーカーは**人間 / Claude Code が判定を貼る場合のみ**＝[`docs/ai-ops/CODEX-RESULT-PROTOCOL.md`](docs/ai-ops/CODEX-RESULT-PROTOCOL.md)。

---

参照: コード設計マップ = [`docs/REFERENCE.md`](docs/REFERENCE.md) ／ 実装履歴 = [`docs/CHANGELOG.md`](docs/CHANGELOG.md) ／ 役割・SoD 正本 = [`docs/ai-ops/AGENT-ROLES-AND-SOD.md`](docs/ai-ops/AGENT-ROLES-AND-SOD.md) ／ 結果書き戻し = [`docs/ai-ops/CODEX-RESULT-PROTOCOL.md`](docs/ai-ops/CODEX-RESULT-PROTOCOL.md)。
