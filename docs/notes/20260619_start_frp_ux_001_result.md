# START-FRP-UX-001 実装結果メモ

- 日付: 2026-06-19
- 対象: `shogi_v4.html`（当日運営ツール）
- ブランチ: `feature/start-frp-ux-001`（base = orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` の HEAD = #234 `829d464`）
- 目的: 大会当日に幹事が迷わず操作できるよう、(1) A/B クラス別開始の主導線化、(2) 1回戦中だけの途中参加、(3) 参加者一覧のふりがな（登録後の編集を含む）を提供する。

## 前提（orphan base に既存）

本タスクの機能要件の大半は orphan base に既に実装済みだった（#218/#219 のクラス別開始 helper・#225 開始導線の対局管理タブ集約・#227〜#234 の FRP 1局目部分手合い・#210/#213 のふりがな）。本 PR は **不足分の純追加** と **受入条件のテスト固定** に限定し、既存実装の作り直し（unrelated refactor）はしない。

| 機能 | 既存（流用） | 本 PR の追加 |
|------|------|------|
| (1) クラス別開始 | `startTournamentForClass` / `resetClassForClass` / `buildClassActionBarHtml`（対局管理タブ・A/B 独立）。`#startBtn` は #225 で nav 専用（「登録内容を確認して対局管理へ」）＝全体開始は既に主役でない。 | `buildClassActionBarHtml`: 開始ボタンを full-size `btn-primary` 化（`btn-sm` 除去＝主導線）。開始済みクラスは先頭に「✓ <className> 開始済み」状態ラベルを置き、破壊的リセット（`btn-danger btn-sm` 据え置き）が単独で目立つ状態を解消。 |
| (2) 途中参加（1回戦中だけ） | `startClassPartial` / `getUnassignedFirstRoundPlayers`（`results` 非空で空）/ `buildFirstRoundPartialPairs` / `appendFirstRoundPairs`（`results>=1` 全面ブロック・既存 winner 保持の post-check rollback）/ `buildFirstRoundPartialSectionHtml`。A/B 独立・FRP-IMPL-004A/B 保存安全化と再生成 gate も既存。 | コード変更なし。受入テストで 8 条件を横断固定（既存挙動の回帰防止）。 |
| (3) ふりがな（参加者一覧） | `player.yomi` + `addPlayer` が `inp-yomi` を保存 + `makePlayerRow`/`renderPlayerNameWithRuby` が受付一覧にルビ表示 + `normalizeState` で `yomi:''` 補完。 | `editPlayerYomi(id,cls)` 新設 + `makePlayerRow` に「ふりがな」編集ボタン追加（既存「名前編集」「削除」は保持）。登録後でも `player.yomi` を編集／空でルビ解除。保存・保存検証・再描画は既存 `updateField(field='yomi')`（SAVE-003b 経路）へ委譲。氏名編集（`editPlayer`/MASTER-001 会員マスタ同期）には触れない。会員マスタ側 yomi 反映は本スライス対象外。 |

## 変更ファイル

- `shogi_v4.html`
  - `makePlayerRow`: 「ふりがな」編集ボタンを追加（`editPlayerYomi` を bind。`addEventListener` 経由で innerHTML 連結なし）。
  - `editPlayerYomi`（新規）: `editPlayer` の直後に追加。
  - `buildClassActionBarHtml`: 開始ボタン full-size 化 + 開始済み状態ラベル + コンテナ `flex-wrap:wrap`。id/文言/未開始・開始済みの分岐は不変（テスト pin 保持）。
- `test/test_start_frp_ux_001.js`（新規）: 受入条件 8 + 純追加分（`editPlayerYomi` / 主導線化）を 56 assert で固定。
- `test/run_tests.sh`: 上記テストを登録。

## テスト結果

- `npm test`（`bash test/run_tests.sh shogi_v4.html`）= **PASS 67 / FAIL 0 / WARN 35**（baseline 66→67・新規テスト +1・WARN 35 は未コミットの dev-only テスト不在による既知の environment warning で本 PR と無関係）。
- `npx html-validate shogi_v4.html` = エラーなし（exit 0）。
- ブラウザ実機確認（静的サーブ + localStorage 架空 fixture）: 受付一覧でルビ表示＋「名前編集/ふりがな/削除」、対局管理タブで開始済み A は状態ラベル＋リセット・未開始 B は full-size 開始ボタン・1局目未割当（途中参加）セクションを確認。

## 受入条件（テスト対応）

1. A/B クラス別開始が独立して動作する → C1
2. A/B クラス別リセットが既存挙動を壊さない → C2
3. 1回戦中の途中参加は組み込める → C3
4. 2回戦以降の途中参加はブロックされる → C4
5. 勝敗入力済みでは勝敗保護が優先される → C5
6. ルビ未入力の既存データでも壊れない → C6
7. ルビ入力済みなら参加者一覧に表示される（+ 登録後の編集） → C7 / U1
8. 保存 → reload 後もルビとクラス別状態が維持される → C8

## 対象外 / 残課題

- 対局表・順位表・PDF/印刷へのルビ表示（FURIGANA-VIEW-002 で別途展開済みだが本タスクのスコープ外として未追加検証）。
- ふりがな編集の会員マスタ（`branch master`）側 yomi への反映（本スライスは当日 `player.yomi` のみ）。
- production 反映 / deploy / publish / release / branch 削除（本 PR は Draft まで）。
- 004C UI 文言補助は対象外（FRP の別スライス）。
