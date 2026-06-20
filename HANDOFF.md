# SHOGI-TOUR 引き継ぎ書

> **🔴 実装着手前に必読 — AI 開発パイプライン正本（PMO-OPS v2.1-final）**
> 工程・状態機械・結果書き戻しプロトコル・凍結マーカー = [`docs/ai-ops/AI-DEV-PIPELINE.md`](docs/ai-ops/AI-DEV-PIPELINE.md)。
> 役割・職務分離（SoD G1〜G6 / L0–L4） = [`docs/ai-ops/AGENT-ROLES-AND-SOD.md`](docs/ai-ops/AGENT-ROLES-AND-SOD.md)。
> Codex / レビュー結果書き戻し = [`docs/ai-ops/CODEX-RESULT-PROTOCOL.md`](docs/ai-ops/CODEX-RESULT-PROTOCOL.md)。
> 各工程の完了は **GitHub に定型コメント＋凍結マーカー1ブロックを書き戻すまでが1工程**（自分のチャットで終わりは未完了）。

> 別チャットで作業を再開するための最小コンテキスト。詳細設計は `docs/specs/` および `docs/notes/` を参照。

## プロジェクト概要

- 沼津将棋支部の月例大会運営用 Web アプリ。スイス式トーナメントのペアリング自動生成・成績集計・順位決定。
- `shogi_v4.html` 単一 HTML + localStorage で完結。GitHub Pages 公開。スマホ運用前提。
- リポジトリ: `kazuo1970takahashi-sketch/shogi`（public）。

## ブランチ運用（重要）

- **PR の base は orphan clean base**（`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`）。`main` を base にしない。
- production 反映は `index.html` + `shogi_v4.html` の 2 ファイルを公開する **release PR**（base=production）で別途行う。
- 実データはコミットしない。テスト fixture は架空のみ。

## 現在の HEAD（2026-06-17 時点）

| ブランチ | HEAD |
|---|---|
| production | `9693a83079b3dbc4dec74a8c03b42b34575c221f`（#221 rollback 後。#220 誤実装は revert 済み。#213 ふりがな ruby / #214 大会履歴 Step1 は残存） |
| main | `832bc5a77c699b198bda64eed3146d03ecf0fa96`（今回対象外） |
| orphan clean base | `021faa885f144e3a2de63270f7217541f78a9a3a`（#225 開始導線集約 / #226 FRP 棚卸し merge 後の HEAD。#218/#219 の START 実装は orphan 側に残存・FRP とは別物。production からは #221 で revert 済） |

## 詳細の所在（このファイルは軽量 stub）

このリポジトリの引き継ぎ情報は Issue #267（HANDOFF 軽量化）で役割ごとに分離しました。
**本ファイルは現在地・ブランチ運用・必読リンクのポインタのみ**を保持します（履歴・設計は下記へ移設・原文は削除していません）。

- **実装履歴（スライス単位の作業記録）** → [`docs/CHANGELOG.md`](docs/CHANGELOG.md)（旧 HANDOFF 本体の履歴を原文移設）。
- **コード設計マップ（関数構造・データ構造）** → [`docs/REFERENCE.md`](docs/REFERENCE.md)。
- **開発プロセス（工程・状態機械・SoD・結果書き戻し）の正本** → [`docs/ai-ops/`](docs/ai-ops/)。
- **各機能の権威ある詳細設計 / 実装結果メモ** → [`docs/specs/`](docs/specs/) ／ [`docs/notes/`](docs/notes/)。
- AI 別の作業指針 → [`CLAUDE.md`](CLAUDE.md)（Claude Code 実装ライン）／ [`AGENTS.md`](AGENTS.md)（Codex レビュー）。

> **ドキュメント役割境界**: `docs/ai-ops/` = 運用プロセス正本／`docs/REFERENCE.md` = コード設計マップ／`docs/CHANGELOG.md` = 履歴。

> 注: 上記「現在の HEAD」表は **2026-06-17 時点のスナップショット**。orphan clean base は以降も前進しており（履歴は `docs/CHANGELOG.md`）、最新 HEAD は branch ref `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` を正とする。production `9693a83…` / main `832bc5a…` は不変。
