# FRP-UNASSIGNED-COUNT-001 結果メモ

## 目的
部分開始（1局目途中参加）中クラスの「1局目 未割当参加者」セクション見出しに、現在の
未割当（1局目待機）人数を併記する。幹事が「あと何人が1局目待ちか」を一目で把握できるように
する運営 UX の小改善。

## 変更内容（純追加・表示専用）
- `shogi_v4.html` `buildFirstRoundPartialSectionHtml`：見出しを
  `1局目 未割当参加者` → `1局目 未割当参加者（N名）` に変更（N=`unassigned.length`）。
  - `unassigned` は同関数内で既に算出済みの派生値（`getUnassignedFirstRoundPlayers` 由来・state 非保存）。
  - 数値（`.length`）の補間のため escapeHtml は不要（既存の数値補間と同流儀）。
  - append で人数が減ると再描画で自動更新される。空（0名）のときは従来どおりセクション自体を非表示。
- `test/test_frp_impl_002.js`：companion assertion を 2 件追加（既存 assertion は不変）。
  - `D-sec1c` A（4名未割当）→ 見出しに `（4名）`。
  - `D-sec3b` B（b1,b2 割当済→未割当 b3 のみ）→ 見出しに `（1名）`（人数が実数を反映することを固定）。

## 後方互換
- 既存 pin `D-sec1`（`secA.indexOf('1局目 未割当参加者')>=0`）は**部分一致**のため、見出しへの
  `（N名）` 追記後も成立（既存 FRP-IMPL-002/003/004/004B・START-FRP-UX-001 のテスト不変）。
- ロジック層（`getUnassignedFirstRoundPlayers` / `buildFirstRoundPartialPairs` /
  `appendFirstRoundPairs` / `startClassPartial`）は一切変更なし。表示文字列のみ。

## 検証
- 対象: `node test/test_frp_impl_002.js shogi_v4.html` = PASS 81 / FAIL 0（baseline 79 → +2）。
- 全体: `npm test` = PASS 69 / FAIL 0 / WARN 35。
  - 素の `6a46aca` baseline も実測 69 / 0 / 35（stash 比較）＝群レベル増減ゼロ・回帰なし。
  - WARN 35 は既存の環境要因（未追跡 fixture 等）で本変更非由来。
- `npx html-validate shogi_v4.html` = exit 0（クリーン）。
- secret / PII grep = 一致なし（追加はクラス内 UI 文言と数値カウントのみ・実データ非混入）。

## 範囲外（やらないこと）
- 「全選択 / 選択クリア」等の選択補助は本 PR 非対象（一括開始ボタンとの役割重複の仕様判断を伴うため）。
- 選択中人数のライブ表示（チェックに連動）は handler 追加を伴うため非対象。本 PR は静的な派生カウントのみ。

## ベース / 運用
- base orphan: `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` HEAD `6a46aca`。
- production / main 不変。Draft PR まで。Ready 化 / merge / branch 削除 / production 反映は人間明示承認後のみ。
