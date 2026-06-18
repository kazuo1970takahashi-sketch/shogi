# Codex レビュー方針 v1（最小）

> Codex は容量制限があるため常時監視に使わない。**非相関性**（Claude 系 subagent と異なるモデル）が要る所にスポット投入する。

## 役割分担（作る前 / 作った後）
- **作る前 = ChatGPT**: 要件ゲートで意図の非相関監査（別解釈の否定）。
- **作った後 = Codex**: 重要 PR のコード / ロジックの非相関レビュー。

## Codex を投入する PR（いずれか該当 → ラベル `needs:codex`）
- state / localStorage / pairing / ranking に触れる（正当性が重要・テストで網羅しにくい）
- 巨大ファイルの大きな変更（例: `shogi_v4.html` の変更行が大きい）
- ロジック変更・アルゴリズム
- **revert 済み機能の再導入**（#221 級リスク）
- テストが薄い / 怪しい PR

## レビュー観点（必ず受入条件を入力にする）
- この diff は requirement gate の **受入条件**を満たすか。
- **対象外**に踏み込んでいないか（過剰実装・別解釈になっていないか）。← #221 firewall
- ロジックの穴 / state 破壊 / 端ケース / テストの盲点。

## Codex を使わない
- lint / 整形（ツールが行う）
- 些末な diff / docs-only
- repo 状態判断・merge 判断（真実源は GitHub/git、判断は gate ＋ 人間）

## 運用
- `needs:codex` 付きの PR は、Codex 承認の記録が無い限り **Ready 化しない**。
- CC adversarial subagent（常時・安価）と Codex（限定・非相関）は補完。subagent 通過は Codex 不要を意味しない。
