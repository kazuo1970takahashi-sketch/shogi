# Codex レビュー依頼: shogi_v4 Phase 0-4 ロードマップ 再々評価

## 依頼の背景

前回(2026-05-01)のロードマップ評価から以下の事実が新たに判明・確定した。
これらを踏まえて Phase 0-4 ロードマップを再評価してほしい。

---

## 前回評価からの変更事実

### 1. HANDOFF.md が汚染されていた(修正済み)

前回の評価時に渡した HANDOFF.md は、別プロジェクトのファイルで誤上書きされた
汚染版だった。今回はサニタイズ済みの正しい版(本パッケージ内 HANDOFF.md)を
使用している。前回評価はこの汚染版を前提にしていたため、再評価が必要。

### 2. リポジトリは public(前回資料の誤記を修正)

前回資料では「private」と記載していたが、実態は public。
- GitHub Pages を使用しているため public が必須(GitHub Free プランの制約)
- public のまま運用継続を確定済み
- 公開ファイルには個人名・社内情報を含まないサニタイズ運用で対応

### 3. Git 正規管理への移行が完了(Step A 完了)

これまで GitHub Web UI 手動アップロードで運用していたが、
2026-05-02 に正規 Git 管理へ移行完了。

変更前:
- ローカルは Git 未管理の単一ディレクトリ
- GitHub には shogi_v4.html と index.html の 2 ファイルのみ
- バックアップ・履歴なし → HANDOFF 汚染事故の根本原因

変更後:
- ~/projects/shogi/ で Git 正規管理
- HANDOFF.md / test/ / docs/ / archive/ / ai-requests/ を追加コミット(76f874f)
- .gitignore 整備済み

### 4. 開発体制を軽量二者体制に決定

shogi は HTML 1 ファイル + localStorage の小規模アプリのため、
DevSecOps フル装備は見送り、以下の軽量体制で運用する:

- Claude.ai: 設計・手順案
- Claude Code Desktop: 実装・Git 操作

DevSecOps の学習は別の専用リポジトリ(devsecops-sandbox、別途立ち上げ予定)で
実施し、知見を shogi に選択的に輸出する方針。

---

## 評価してほしいこと

以下の観点で Phase 0-4 ロードマップを再評価してください。

### Q1. 上記4点を踏まえ、Phase 0-4 の方向性・優先順位に変更はあるか

特に:
- public リポジトリ前提での Phase 0 CI 構築の注意点
- Git 正規管理が完了したことで Phase 0 の土台として十分か
- 軽量二者体制での Phase 0 推進に懸念点はあるか

### Q2. Phase 0 の各項目(下記)の優先順位評価

1. CI 構築(GitHub Actions で run_tests.sh / 比較テスト / 性質テスト 自動実行)
2. P2 修正(5件、詳細は HANDOFF.md セクション6参照)
3. データバックアップ導線強化(localStorage 運用の生命線)
4. 当日運用マニュアル整備(紙1枚版/スマホ版/トラブル版)
5. 変更要求の受け皿整備

### Q3. 新たな P1 相当の問題は検出されるか

HANDOFF.md・test/・docs/ を読んだ上で、見落としている本番投入前必須の
問題があれば指摘してほしい。

---

## 渡すファイル一覧

```
HANDOFF.md                    ← サニタイズ済み正規版(今回新規)
docs/CODEX_P1_FIX_REPORT.md  ← P1 修正レポート
test/run_tests.sh             ← テスト本体
test/test_pairing_properties.js ← P1 修正で追加した性質テスト
test/compare_render.js
test/compare_results.js
test/compare_modals_v2.js
test/test_tab_selection.js
test/data_*.json              ← 仮名・ダミーデータ(個人情報なし)
```

shogi_v4.html 本体は必要であれば別途渡す。

---

## 参考: これまでの Codex レビュー履歴

| 回 | 時期 | 判定 | 概要 |
|---|---|---|---|
| 1 | 2026-04-30 | B- | P1-1(削除クラッシュ)/ P1-2(ペアリング誤り)を検出 |
| 2 | 2026-05-01 | A- | P1 修正確認、P2 系5件を次フェーズ送り |
| 3 | 2026-05-01 | (初回ロードマップ評価) | 汚染 HANDOFF を前提に Phase 0-4 評価 → 今回再評価 |
