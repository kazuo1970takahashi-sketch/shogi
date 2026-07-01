# test/e2e — Playwright 実ブラウザ E2E

実 Chromium で `shogi_v4.html` を開き、UI を実操作して主要フローが壊れていないかを検証する。
node/jsdom モックの回帰スイート（`test/run_tests.sh`）を補完する、ブラウザレベルの確認。

> Chromium 本体が必要なため CI/サンドボックス（root 権限なし）では動かない。**Mac 等の実機で手動実行**する。

## セットアップ（初回のみ）

```
npm i -g playwright
npx playwright install chromium
```

## 実行

リポジトリ直下から（`__dirname` 基準で `shogi_v4.html` を解決するのでどこからでも可）:

```
NODE_PATH="$(npm root -g)" node test/e2e/shogi_ui_e2e.js
```

本番を対象にする場合（実データは実行前後で退避・復元される）:

```
NODE_PATH="$(npm root -g)" node test/e2e/shogi_ui_e2e.js "https://kazuo1970takahashi-sketch.github.io/shogi/shogi_v4.html?v=54"
```

終了コード 0=全PASS / 1=失敗。

## スクリプト

- `shogi_ui_e2e.js` — 統合スイート（S1〜S5）:
  - S1 途中棄権 →「組み合わせを再生成」実クリックでクラッシュしない／棄権者を除外
  - S2 「クラスを追加」ボタン実クリックでクラスが増える
  - S3 回戦数セレクト(`#inp-rounds`)の実操作で回戦数が反映／クラス別上書きも効く
  - S4 持ち時間設定が報告書表示に反映（切れ負け/秒読み）
  - S5 支部マスタからの過去参加者呼び出しで会費区分・よみを継承
- `withdraw_regenerate.e2e.js` — WITHDRAW-001-FIX の焦点回帰（棄権後の再生成クラッシュ）。

## メモ

`test/run_tests.sh`（node 全回帰・GOLDEN）には**組み込まない**（ブラウザ非依存を保つため）。
リリース前チェックの順序: ① `bash test/run_tests.sh shogi_v4.html`（or 各 test_*.js を node 直実行）→ ② 実機で本 E2E。
