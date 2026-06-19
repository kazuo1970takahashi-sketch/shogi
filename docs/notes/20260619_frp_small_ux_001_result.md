# FRP-SMALL-UX-001 実装結果メモ

- 日付: 2026-06-19
- 対象: `shogi_v4.html`（当日運営ツール）
- ブランチ: `feature/frp-small-ux-001`（base = orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` の HEAD = #245 `ed23298`）
- 依頼: cowork `ai-requests/2026-06-19_claude-code_frp-small-ux.md`（Review Level 3・Draft PR + Codex review まで）

## 目的

1局目部分開始(FRP)セクションの最小・高価値な表示系UX改善を1つ実施する。#245 `FRP-UNASSIGNED-COUNT-001`（見出しに未割当人数を併記）を踏まえ、その人数を「運営が次に取る操作の結果（作れる組数・待機の有無）」まで具体化する。

## 変更内容（表示専用の純追加）

`buildFirstRoundPartialSectionHtml(cls)` の見出し（`1局目 未割当参加者（N名）`）直下に、未割当人数から導出した**組成見込み1行**（`.frp-pairing-projection`）を追加する。

| 未割当数 | 表示 | 色 |
|------|------|------|
| 偶数（≥2） | いま未割当の全員（N名）を選ぶと、N/2 組の対局を1局目に追加できます。 | navy `#1F3864` |
| 奇数（≥3） | いま未割当の全員（N名）を選ぶと、(N-1)/2 組の対局を追加でき、1名が未割当のまま残ります（奇数）。 | amber `#9a3412` |
| 1名 | 現在の未割当は1名です。対局を作るには、あと1名以上の受付をお待ちください。 | amber `#9a3412` |

- 派生表示のみ＝**state を保存しない / mutate しない / addEventListener を持たない**（`unassigned.length` は既存算出値を再利用）。append で人数が減れば既存の再描画で自動更新される。
- 既存の挙動・関数・ペアリングロジックは一切変更しない（HANDOFF.md 絶対ルール「動作を変えるリファクタ禁止」遵守）。
- 既存テスト pin は見出し部分一致（`1局目 未割当参加者`）で後方互換を維持。

## 変更ファイル

- `shogi_v4.html`（+17 行・FRP セクション helper の表示行追加のみ）
- `test/test_frp_impl_002.js`（+16 行・D-sec1d/1e/1f・D-sec3c/3d・D-sec6a/6b/6c の3分岐アサーション追加）
- `docs/notes/20260619_frp_small_ux_001_result.md`（本メモ）

`index.html` / `scripts/` / `.github/` / `data/` は未 touch。

## 検証

- `node test/test_frp_impl_002.js shogi_v4.html`: PASS 89 / FAIL 0（既存81 + 新規8）
- `node test/test_frp_impl_003.js`: PASS 64 / FAIL 0（回帰なし）
- `node test/test_start_frp_ux_001.js`: PASS 56 / FAIL 0（回帰なし）
- `npm test`（全体）: **PASS=69 / FAIL=0 / WARN=35**（#245 baseline と同値・回帰なし）
- `npx html-validate shogi_v4.html`: exit 0（クリーン）
- secret / PII grep（追加行）: 一致なし。テストは架空名（架空太郎/架空梅子 等）のみ。
- ブラウザ実機確認（preview 8137）: 偶数4名＝navy「全員（4名）→2組」/ 奇数3名＝amber「全員（3名）→1組、1名待機」を実描画で確認。computed color = `#1F3864` / `#9a3412`・font-weight 600・12px。

## 非実施（依頼の停止条件遵守）

Ready化 / merge / squash / branch削除 / production反映 / deploy / release は実施しない。Draft PR で停止し `needs-codex` を付与（Codex read-only review 必須＝runtime 変更のため）。
