# MOBILE-HEADER-001 実装結果メモ

- 日付: 2026-06-19
- 対象: `shogi_v4.html`（当日運営ツール）の CSS / レスポンシブ領域のみ
- ブランチ: `feature/mobile-header-001-responsive`（base = orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` の HEAD = #235 `06ee615`）
- 目的: スマホ表示で画面上部ヘッダーのボタン群が崩れる（長い日本語ラベルが 1 文字ずつ縦に割れる）問題を修正する。あわせて PR #235 レビューで繰り越した受付一覧 `.player-row-buttons` の折返し対応を同じモバイルレスポンシブ修正として実施する。

## 問題

`.header` は `display:flex; justify-content:space-between` で、子は「タイトル div」と「操作ボタン群 div（5 ボタン）」の 2 つ。スマホ幅では従来 `@media(max-width:480px)` の `.header h1{font-size:13px}` しか効かず、ボタン群側に何の折返し指定もなかった。そのため狭幅で 5 ボタンが 1 行に押し込まれて圧縮され、`大会データを全リセット` のような長いラベルが 1 文字ずつ縦に割れて読めず・押しづらい状態になっていた。受付一覧の `.player-row-buttons`（名前編集 / ふりがな / 削除）も `flex-wrap` 無指定で最狭幅で横溢れする懸念があり、#235 レビューで繰り越されていた。

## 変更内容（CSS のみ。JS・HTML は無変更）

`shogi_v4.html` の `<style>` 内のみ、合計 +15 / -1 行：

1. `.player-row-buttons`（#235 繰越）: `flex-wrap:wrap` を追加。最狭幅で 3 ボタンが入り切らないときだけ折り返す。PC 幅は十分広く 1 行に収まるため折り返さず見た目不変。#235 で追加済みの `.class-action-bar`（inline `flex-wrap:wrap`）と同じ流儀で矛盾しない。
2. 既存 `@media(max-width:600px)` ブロックを拡張して上部ヘッダーをスマホ幅でのみ段組み化：
   - `.header{flex-wrap:wrap;gap:8px}` … タイトル行とボタン行を折り返す。
   - `.header>div:last-child{width:100%;flex-wrap:wrap}` … 操作ボタン群（`.header` の 2 番目＝最後の直下 div）を全幅・折返し可にして 1 行強制を解く。
   - `.header button{white-space:nowrap}` … 各ボタンのラベル文字の縦割れを防止する。
   - 危険操作ボタン（全リセット / 進行リセット）は `btn-sm` サイズのまま維持し縮小しない。

`.header` の直下 div は 2 個（タイトル / 操作ボタン群）で固定のため `:last-child` で操作ボタン群を一意に指定できる（HTML 変更不要）。操作ボタン群 div の inline style は `display:flex;gap:8px;align-items:center` で `width`/`flex-wrap` は未指定のため、追加した宣言が衝突せず適用される。PC 幅（>600px）はこの `@media` 外なので従来の 1 行レイアウトのまま不変。

## 変更ファイル

- `shogi_v4.html`（CSS のみ +15 / -1）
- `docs/notes/20260619_mobile_header_001_result.md`（本メモ・新規）

index.html / production / release / deploy は無変更。JavaScript ロジック（`startTournamentForClass` / `appendFirstRoundPairs` / `editPlayerYomi` 等）は無変更。

## テスト結果

- `npm test`（`bash test/run_tests.sh shogi_v4.html`）= **PASS 67 / FAIL 0 / WARN 35**（baseline = `06ee615` と同値。CSS のみのため件数変化なし。WARN 35 は未コミットの dev-only fixture/test 不在による既知の environment warning で本 PR と無関係）。
- `npx html-validate shogi_v4.html`（v10.14.0）= エラーなし（exit 0）。

## 目視確認（静的サーブ + ブラウザ実機）

| 幅 | ヘッダー | 受付一覧 `.player-row-buttons` | 対局管理 `.class-action-bar` |
|----|---------|------|------|
| 320px | タイトル 1 行＋ボタン 3 行に折返し・文字の縦割れなし・タイトルとボタン非重複（title bottom=30 < buttons top=38）・危険ボタン 169×34 / 182×34px（縮小なし） | [名前編集][ふりがな] / [削除] に折返し・行内 maxRight=255 < 299・横溢れなし | full-width で stack・bar right=299 で viewport 内・横溢れなし |
| 360px | 同上（3 行折返し）・崩れなし | 折返し OK | stack OK |
| 390px | タイトル 1 行＋ボタン 2 行・崩れなし | 折返し OK | stack OK |
| 600px | タイトル 1 行＋ボタン折返し・崩れなし（`max-width:600px` 含む＝モバイル規則適用） | 折返し OK | stack OK |
| 1280px（PC） | タイトル左＋5 ボタン 1 行（従来どおり・`@media` 外で不変） | 1 行（折返さず従来どおり） | 従来どおり |

- いずれの幅でも `document.scrollWidth == innerWidth`（横スクロール発生なし）、`#resetBtn` の computed `white-space=nowrap`、`.header` / `.player-row-buttons` / `.class-action-bar` の computed `flex-wrap=wrap` を確認。
- console エラーなし。

## 受入条件 充足

- スマホ幅で上部ボタンの文字が縦割れしない ✓
- タイトルとボタン群が重ならない ✓
- 上部ボタンがすべて押せる ✓
- 赤い危険操作ボタンがスマホでも誤タップしにくい（34px 高・full ラベル幅を維持） ✓
- 受付一覧の「名前編集 / ふりがな / 削除」が最狭幅で横溢れしない ✓
- PC 表示が大きく崩れない（>600px は不変） ✓
- 対局管理タブの `.class-action-bar` が悪化しない（無変更・表示確認済み） ✓
- 既存テスト維持（67/0/35） ✓

## 対象外 / 残課題 / 運用

- `.tab-bar` / `.tab` は対象外。320px では active タブ「参加者登録」が 2 行に折り返すが、これは既存 `@media(max-width:480px)` の `flex:1`+`font-size:12px` 由来の挙動で、文字単位の縦割れではなく可読。本 PR では触れていない（必要なら別スライス）。
- Draft PR 作成までで停止。Ready 化 / merge / rebase / push（branch への）/ branch 削除 / production 反映 / deploy / publish / release はしない。
- 本 PR は CSS のみ・回帰なしのため新規テストファイルは追加していない（指示「CSSのみで済むなら shogi_v4.html と結果メモ程度に抑えて」に従う）。
