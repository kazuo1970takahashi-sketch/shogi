# Codex フェーズ境界レビュー依頼：A-T

**作成日時**: 2026-05-05 20:46 JST
**運用方式**: Codex 独立レビュー（DevSecOps 運用方針 v1.2 final 準拠）

---

## レビュータイミング（A-T では 3 回）

| # | レビュー対象 Stage | 主眼 |
|---|------------------|------|
| 1 | Stage 2 完了時：`expectClickable` ヘルパ実装 + 既存テスト全置換 | 偽陽性排除ロジックの厳密性 |
| 2 | Stage 4 完了時：A-4.2 A/B ボタン回帰テスト追加 | 新規テストが本当に対象バグを検出できるか |
| 3 | Stage 8 完了時：全体 PR 直前 | A-T 全体の一貫性・既存機能との整合 |

---

## Codex への依頼テンプレート（各回共通）

```
GitHub kazuo1970takahashi-sketch/shogi の feat/phase-a-t-test-hardening ブランチをレビューしてください。

【背景】
A-4.2 で重大なリグレッションが発生した。e2e 272 件・単体 595 件・Codex・ChatGPT のレビューをすべてすり抜けた。原因は「テストが UI の実動作を検証できていなかった」こと。A-T フェーズで UI テスト基盤を構造的に強化している。

【今回のレビュー対象】
A-T Stage [N] の実装：[Stage 名]

【参照すべき仕様書】
- docs/specs/20260505_2046_shogi_at_spec_v1.md（A-T 仕様書 v1）
- docs/specs/[Stage 1 報告書のパス]（特定された偽陽性パターン）

【特に厳しく見てほしい観点（Stage 共通）】

1. force click が使われていないか（{ force: true } が一切ないこと）
2. evaluate 経由の el.click() で DOM 経由を迂回していないか
3. 関数を直接呼んでアサートしているテストはないか
4. クリック後のアサートが「DOM の状態変化」を検証しているか
   （関数が呼ばれたかどうかだけでは不十分）
5. expectClickable ヘルパが click 前にすべて挿入されているか
6. selector が strict 設定で実 DOM とマッチすることが保証されているか

【Stage 別の追加観点】

# Stage 2 レビュー時
- expectClickable の elementFromPoint ヒットテストが正しく実装されているか
- shadow DOM / iframe 内要素の扱いが妥当か
- 既存 272 件のうち書き換え対象がすべて書き換えられているか
- 互換性のため残した「force click を許容するケース」があれば、その正当性

# Stage 4 レビュー時
- 新規回帰テストが現状の実装で「赤になる」ことを確認できるか
  （テスト自体に偽陽性がないかの再帰検証）
- テストの粒度：1 つのテストで複数のバグパターンを検出していないか
  （切り分けやすさ）
- A-4.2 のすべてのバグパターンを網羅しているか
  （前回 A クラスのハイライト時、サジェスト経由、過去参加者パネル経由、それぞれ）

# Stage 8 レビュー時
- A-T 全体で禁止事項（仕様書 §8）の違反がないか
- shogi_v4.html のロジックに不必要な変更が混入していないか
- CI ランタイム 5 分以内が達成されているか
- visual regression の baseline が CI 環境のフォントで生成されているか

【出力形式】

1. 総合判定：A / A- / B+ / B / C
2. Must Fix（マージ前必須）：箇条書き、ファイル:行 と問題箇所引用
3. Should Fix（強く推奨）：箇条書き
4. Nice to Have：箇条書き
5. 良い点：箇条書き
6. 全体所感

【判定基準】

- A：そのままマージ可
- A-：軽微修正後マージ可
- B+：Must Fix 1〜2 件、修正後再レビュー
- B：Must Fix 3 件以上 or 構造的問題
- C：実装方針の見直しが必要

【DevSecOps 運用方針 v1.2 final（shogi-coach docs/specs/）に準拠】
```

---

## Codex への依頼運用ルール

1. **Stage 2 / 4 / 8 の各完了時に Claude Code が独自に commit & push を行ってから依頼**
2. 依頼前に Claude.ai に「Stage [N] 完了。Codex レビュー入ります」と一報
3. Codex の判定が **B+ 以下** なら Claude.ai が Must Fix 反映方針を立てる
4. Codex の判定が **A / A-** なら次の Stage へ進行
5. **Codex のレビュー結果は `docs/specs/` に反映記録は残さない**（実装の git history で追跡）

---

## A-4.2 リグレッションを 4 重レビューが見逃した教訓

Codex が前回 A-4.2 PR#9 で B+ → trailing whitespace 修正後 Yes を出した事実：
- trailing whitespace は表面的な修正
- 実動作の検証はレビュー時点では不可能（テスト実行環境がない）
- **Codex のレビューは「コードの整合性」までは見るが「実動作の正しさ」は保証しない**

A-T 以降の Codex への依頼では、以下を明示的に伝える：

> 「実動作の検証はテスト基盤に委ねる。Codex は『テスト基盤そのものが偽陽性を含まないか』『テストが本当にバグを検出できる構造か』を厳密に見る」

これにより、Codex の責務範囲が明確化される。

---

## 関連ファイル

- 仕様書本体：`docs/specs/20260505_2046_shogi_at_spec_v1.md`
- ChatGPT レビュー依頼：`docs/specs/20260505_2046_shogi_at_chatgpt_review_prompt.md`
- Claude Code Stage 1 キックオフ：`docs/specs/20260505_2046_shogi_at_claude_code_kickoff.md`
- 本依頼文：`docs/specs/20260505_2046_shogi_at_codex_review_prompt.md`
