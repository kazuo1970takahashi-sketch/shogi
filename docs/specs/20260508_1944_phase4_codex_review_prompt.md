# Hotfix Phase 4 Codex Quick Gate Review Prompt

- 配置日: 2026-05-08(木)
- 対象 PR: feat(phase4): pairing change UI from replace to swap (Hotfix)
- 参照 spec: `docs/specs/20260508_1907_phase4_pairing_swap_spec.md` (v2, commit `1bc99df`, ChatGPT A 判定済)
- 参照 plan: `docs/specs/20260508_1937_phase4_pairing_swap_plan.md` (commit `10e58da`)

---

## Codex プロンプト本文

```
GitHub の kazuo1970takahashi-sketch/shogi リポジトリの PR #<番号> を Quick Gate Review してください。

【背景】
5/10(日)月例将棋大会の本番直前 Hotfix。
ペアリングの「変更」ボタンが事実上機能しない問題に対し、
1 名置換 replace から 2 ペア間 swap に動作仕様変更を実装しました。

【参照】
- spec: docs/specs/20260508_1907_phase4_pairing_swap_spec.md (v2, commit 1bc99df, ChatGPT A 判定済)
- plan: docs/specs/20260508_1937_phase4_pairing_swap_plan.md (commit 10e58da, §3 #1〜#5 実コード確認 + 追加発見 A/B/C 反映済)

【レビュー観点】
1. spec §4.5 prerequisite チェック 5 項目すべて実装されているか
   - #1 対象ペア winner 入力済み拒否(modal 開く前)
   - #2 swap 相手ペア winner 入力済み拒否(保存時)
   - #3 同ペア内 swap 拒否(保存時防御)
   - #4 swap 後の getDuplicatePlayersInPairings 防御層
   - #5 pairHasRematch 過去ラウンドのみ限定(plan §3 #1 で確認済 = 修正不要)
2. spec §4.2 系統 A/B 分岐ロジックの正確性
   - X 所属判定範囲が現在ラウンドの同クラス pairings に限定されているか
   - 系統 A (replace) で 1 ペアのみ更新、系統 B (swap) で 2 ペア同時更新
3. swap 後のロールバック実装(防御層 #4 検出時)が正しく backup1/backup2 を復元しているか
4. winner 入力済みペアの巻き込みが両方の prerequisite で防がれているか
5. e2e 8 ケースのカバレッジが spec §7 通りか(test/e2e/shogi_phase4_pairing_swap.spec.js)
6. 既存 702 件 e2e + run_tests.sh の全件 green を維持しているか
7. spec §8 範囲外項目に手を出していないか
   - 自動ペアリング本体 / UI 全面刷新 / クラス間 swap / 過去ラウンド swap / 3 ペア循環 swap / winner 修正
8. plan で明示した「2 選手同時変更を spec §8 範囲外として拒否」判断は妥当か(spec 明記なし、Plan 独自判断)
9. plan で明示した「spec §4.4 の state.results を実コード state.pairings に読み替え」判断の整合性
10. ヘルパ追加が findPairContainingPlayer 1 つのみに留まっているか(spec §5 関数追加最小化方針)

【判定】
- A: マージ可
- A-: 微修正後マージ可
- B: 構造的修正必要

判定理由 + Must Fix / Should Fix / Nice-to-Have を分けて記載してください。
```

---

## 想定実装ボリューム(参考)

- production (`shogi_v4.html`): +63 / -19 (新規ヘルパ 10 行 + chg-save ハンドラ置換 + changePairing winner 入口チェック)
- 試験 (`test/e2e/shogi_phase4_pairing_swap.spec.js`): +175 (8 ケース)
- 試験 (`test/run_tests.sh`): +5 / -2 (安全機構 grep 検査の Hotfix Phase 4 対応)

## 確認済み

- run_tests.sh: PASS=53, FAIL=0
- playwright e2e: 718 件 全件 green(既存 702 + 新規 16=8 ケース×2 projects)
- spec §3 #1〜#5 実コード確認 + 追加発見 A/B/C(plan §3 / 追加発見セクション参照)
