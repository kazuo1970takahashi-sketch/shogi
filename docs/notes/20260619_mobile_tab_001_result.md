# MOBILE-TAB-001 結果メモ（スマホ幅 320px の active タブ折り返し改善）

- 日付: 2026-06-19
- branch: `feature/mobile-tab-001-active-tab-wrap`
- base: orphan `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` HEAD `3631121112663a2a7b2db41b287e2e3571926fa4`(PR #238 merge 後)
- 変更ファイル: `shogi_v4.html`（CSS のみ）/ 本メモ

## 背景 / 課題
MOBILE-HEADER-001（PR #236）でスマホ上部ヘッダー崩れは解消済み。残課題として、
320px 幅で対局管理画面上部の active タブ「参加者登録」（5 文字）が 2 行に折り返していた。
文字単位の縦割れではなく可読だが、見た目改善として本スライスで対応する。

## 原因
`.tab` は `flex:1` の等幅配分で、5 タブが横幅を 1/5 ずつ占める。最長ラベル「参加者登録」が
基準になり、320px では 1 タブあたりのテキスト領域（約 52px）に対し 12px×5 文字（約 60px）が
収まらず折り返す。active タブは `font-weight:500` でわずかに広く、最初に 2 行化する。

## 対応（CSS のみ・`.tab-bar` / `.tab` 周辺に限定）
新規 `@media(max-width:360px)` を既存 `@media(max-width:480px)` の直後に追加:

```css
@media(max-width:360px){
  .tab-bar{gap:2px;padding:3px}
  .tab{font-size:11px;padding:10px 0}
}
```

- font-size 11px（既存 480px の 12px から −1px の自然な段階。極端な縮小はしない）。
- tab-bar の `gap` / `padding` と `.tab` の横パディングを詰めて 1 タブの可用幅を拡張。
- 縦パディング 10px は維持 → タップ高さ不変。`.tab` は `flex:1` のためタブ幅（タップ領域）も不変。
  横パディング 0 でも等幅 flex + ボタン既定の中央寄せで左右に視覚的余白が残る。
- CJK 全角は約 1em 幅で端末差が小さく、320px で約 2.6px の余白で 1 行に収まる。
- `white-space:nowrap` には**あえて頼らない**：想定外の端末フォントでも最悪は折り返しに留め、
  禁止事項の横スクロールを発生させない。
- 361px 以上（390 / 600 / PC）は従来表示（12px / 13px）のまま＝非破壊。

## 検証
- `npm test`: **PASS=67 / FAIL=0 / WARN=35**（baseline `3631121` と同一）
- `npx html-validate shogi_v4.html`: exit 0（エラーなし）
- ブラウザ目視（python http.server 実機レンダリング, preview）:
  - 320px: active「参加者登録」が **1 行**・全 5 タブ 1 行・横スクロールなし（tab 幅 57.6px / 高さ 36.5px）
  - 360px: 11px で 1 行・横スクロールなし
  - 390px: 12px（変更なし）・1 行・横スクロールなし
  - 600px: 13px（変更なし）・1 行・横スクロールなし
  - PC 1280px: 13px（変更なし）・1 行・横スクロールなし
  - console エラーなし
- 非劣化確認（320px）:
  - スマホ上部ヘッダー（PR #236 修正箇所）: 崩れなし
  - `.player-row-buttons`（名前編集 / ふりがな / 削除）: `flex-wrap:wrap` 維持・viewport はみ出しなし
  - `.class-action-bar`（対局管理タブの開始/部分開始ボタン）: viewport はみ出しなし

## スコープ外（未実施・禁止事項）
Ready 化 / merge / branch 削除 / rebase / force push / deploy / release / production 反映は行わない（Draft 据置）。
HTML 構造・JS ロジック・index.html・test/・.github・scripts・docs/ops・production・実データには触れていない。
