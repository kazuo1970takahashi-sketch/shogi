# ChatGPT レビュー依頼：A-T 仕様書 v1（UI テスト基盤強化）

**作成日時**: 2026-05-05 20:46 JST
**運用方式**: GitHub 連携・コピペ1回方式

---

## ChatGPT へのプロンプト（以下をコピペ）

```
GitHub kazuo1970takahashi-sketch/shogi の main ブランチ（または feat/phase-a-t-test-hardening ブランチ）から以下を読んでレビューしてください。

【レビュー対象】
- docs/specs/20260505_2046_shogi_at_spec_v1.md（A-T 仕様書 v1）

【背景・接続資料】
- docs/specs/20260505_1500_shogi_roadmap.md（ロードマップ v16）
- docs/specs/20260505_1938_shogi_a7_a8_a9_design_memo.md（A-7/A-8/A-9 設計メモ）
- docs/specs/20260505_2014_shogi_a4_1_spec_v1.md（A-4.1 仕様書、A-T 完了後に再開予定）

## レビュー観点（仕様書 §11 を引用）

1. §4.1 偽陽性排除 4 原則は十分か（漏れている観点はないか）
2. §4.2 expectClickable ヘルパ仕様は厳密か
   - 特に elementFromPoint のヒットテストロジックの正しさ
   - 透明オーバーレイの検出方法
   - shadow DOM / iframe 内要素の扱い
3. §4.3 100 パターンの軸選択と必須カバレッジは適切か
   - 8 軸の独立性
   - 必須カバレッジ 7 項目の網羅性
   - 異体字パターン（髙・吉異体・斎/齋/齊・渡邉/渡邊）の妥当性
4. §4.4 モンキーテスト操作種別に漏れはないか
   - iOS Safari 固有のジェスチャー（長押し・ピンチ・ダブルタップ）
   - IME 入力の再現
   - 連続タップ（300ms 内）
5. §5 Stage 構成は依存関係が正しいか
   - Stage 1（偽陽性検証）が先に来る妥当性
   - Stage 4（A-4.2 回帰テスト追加）の順序
6. §6 受け入れ基準は客観的に判定可能か
7. §8 禁止事項に矛盾や危険な抜け穴がないか
   - playwright の force click 例外は本当に不要か
   - localStorage を直接書き換えるテストパターンの扱い
8. §9 リスク対策は現実的か
   - フォント描画差の対策（OS 依存性）
   - flaky テスト対策の妥当性
9. A-4.2 / A-4.1 / A-7 / A-8 / A-9 への接続性は担保されているか
10. 重要：本仕様書が「テスト基盤の強化」に集中できているか（機能追加・バグ修正に踏み込んでいないか）

## 特に厳しく見てほしい観点

- A-4.2 リグレッションが 4 重レビュー（単体・e2e・Codex・ChatGPT）をすべてすり抜けた事実への対処として、本仕様書は構造的に十分か
- 「次に同じパターンのリグレッションが出ないこと」を保証するメカニズムは明確か
- 4 者協調体制（Claude.ai / ChatGPT / Claude Code / Codex）の役割分担に重複や穴はないか

## 出力形式

1. 総合評価：A / A- / B+ / B / C のいずれか
2. Must Fix（マージ前必須修正）：箇条書き、根拠付き、引用付き（仕様書のセクション番号）
3. Should Fix（推奨修正）：箇条書き、根拠付き
4. Nice to Have（任意）：箇条書き
5. 良い点：箇条書き
6. 全体所感：3〜5 行

## 評価基準

- A：そのまま実装着手可
- A-：軽微修正後に実装着手可
- B+：Must Fix 1〜2 件あり、修正後に再レビュー推奨
- B：Must Fix 3 件以上 or 構造的な問題あり
- C：仕様書を書き直す必要あり

DevSecOps 運用方針 v1.2 final（shogi-coach docs/specs/ 参照）に準拠した観点でレビューしてください。
```

---

## レビュー後のフロー

1. ChatGPT から評価が返る
2. **A / A- 判定** → 即 Claude Code に Stage 1 実装依頼
3. **B+ 判定** → 仕様書 v1.1 として Must Fix 反映 → 再 push → Claude Code 着手
4. **B 以下** → Claude.ai に戻して仕様書再構築

## 関連ファイル

- 仕様書本体：`docs/specs/20260505_2046_shogi_at_spec_v1.md`
- 本プロンプト：`docs/specs/20260505_2046_shogi_at_chatgpt_review_prompt.md`
- Claude Code Stage 1 依頼文：`docs/specs/20260505_2046_shogi_at_claude_code_kickoff.md`
- Codex フェーズ境界レビュー依頼文：`docs/specs/20260505_2046_shogi_at_codex_review_prompt.md`
