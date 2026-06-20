# PROGRESSIVE-PAIRING-IMPL-P1 実装メモ（1局目逐次手合「1卓追加」）

- 日付: 2026-06-20
- 依頼: `ai-requests/2026-06-20_claude-code_progressive-pairing-impl-phase1.md`
- 正本仕様: `ai-requests/2026-06-20_progressive-pairing-CONFIRMED-spec.md`（Phase P1 / 受入1〜8）
- base: orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base`（`dade7a8`）
- branch: `feature/progressive-pairing-impl-p1`
- Review Level: **L3（`shogi_v4.html` runtime）→ Draft 後 Codex read-only review 必須**

## 何を追加したか（追加のみ）
受付中、同クラスの未手合い参加者を「来場順（受付順＝entry_no 昇順）で先頭2人ずつ」1卓として `round=1` に追加する
**クラス別「1卓追加」導線**を追加した。押すたびに次の先頭2名で1卓。既存の一括開始・FRP 選択式 append は無改変で共存。

### 追加した関数・配線（`shogi_v4.html` +47/-0・挿入のみ）
1. `onClickAddOneTable(cls)`（新規 handler）
   - `getUnassignedFirstRoundPlayers(cls)` の先頭2名 → `buildFirstRoundPartialPairs` で1ペア（leftover なし）→ `appendFirstRoundPairs` に委譲。
   - guard: 未開始/results 非空/未手合い2人未満は何もしない。confirm（`buildFrpAppendConfirmMessage` 再利用）で誤押下防止。
   - 再入防止 `addOneTableInFlight`（`onClickAppendFirstRound` と同型）。
2. `buildFirstRoundPartialSectionHtml(cls)` に「1卓追加」ボタン `addTableBtn_{cls}` を追加（未手合い2人未満＝実質1名で `disabled`）。既存 `frpAddBtn_`（選択式）はそのまま併置。
3. `bindClassActionBarEvents(cls)` に `addTableBtn_` → `onClickAddOneTable` の bind を追加。

### 既存資産の再利用（新規ロジックを増やさない）
- 未手合い算出 = 既存 `getUnassignedFirstRoundPlayers`（派生・保存に二重持ちしない・results 非空で空）。
- ペア生成 = 既存 `buildFirstRoundPartialPairs`（entry_no 昇順・偶数全員/奇数末尾 leftover）。
- append = 既存 `appendFirstRoundPairs`（実行時再検証・既存対局保持・重複拒否・rollback・SAVE-FRP-002・save／復元）。
- 待機（奇数末尾1人）= 派生 `getUnassignedFirstRoundPlayers` に自動的に残る（state 非保存）。

## 重複防止（受入5）の成立根拠（`generatePairing` は無改変）
- `appendFirstRoundPairs` が既割当者を実行時に拒否（逐次は二重に組まない）。
- 作成済みは `getUnassignedFirstRoundPlayers` から除外される（次の「1卓追加」は次の2名）。
- 部分手合い組成中（results 空・卓あり・未割当>0）は `shouldShowRegenerateButton` が false で「組み合わせを再生成」(`generatePairing` 全員上書き) を**非表示**＝一括上書き経路が構造的に塞がれている（FRP-IMPL-004B）。
- 通常開始クラスは validator が偶数要求で常に未割当0＝この gate は発火せず既存挙動不変。

## スコープ境界（P1）
- 「未手合いをまとめて1局目作成」= **P2**（本PR未実装）。よって「残り未手合いだけ一括生成」UI は本PRに**入れない**。
  受入5の「逐次後に一括生成しても作成済みは除外」は、上記の構造的防止＋派生除外で成立させ、テストで固定した。
- 逐次卓の取消／勝敗入力済み防止 = **P3**（未実装）。2回戦生成ガード = 別タスク。

## テスト / 検証
- `test/test_progressive_pairing_p1.js`（新規 51 assert・全PASS）: AC1 受付順/AC2 同クラス2人/AC3 奇数待機/AC4-5 重複防止/AC6 一括非回帰/AC7 reload/ISO/BIND/CONFIRM/REENTRY。
- `bash test/run_tests.sh shogi_v4.html` = **PASS=71 / FAIL=0 / WARN=35**（baseline `dade7a8` の 70/0/35 から +1・新規 FAIL/WARN 0）。
- `npx html-validate shogi_v4.html` = exit 0。
- 実ブラウザ（python http.server 8143 で worktree 配信）: 「1卓追加」描画・先頭2名で1卓・奇数末尾は待機（不戦勝なし・results 空）・残り1名でボタン disabled・console error 0 を確認。

## 変更ファイル
| ファイル | 増減 |
|---|---|
| `shogi_v4.html` | +47 / -0（handler ＋ ボタン ＋ bind） |
| `test/test_progressive_pairing_p1.js` | 新規 |
| `test/run_tests.sh` | +20（テスト登録） |
| `docs/notes/20260620_progressive_pairing_impl_p1.md` | 新規（本メモ） |

`index.html` 無変更。
