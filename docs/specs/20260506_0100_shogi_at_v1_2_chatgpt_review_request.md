# A-T 仕様書 v1.2 ChatGPT メタレビュー依頼

**作成日時**: 2026-05-06 01:00 JST
**対象**: docs/specs/20260506_0045_shogi_at_spec_v1_2.md
**依頼種別**: 仕様メタレビュー（Stage 着手前）
**Devil's Advocate**: 必須投入（v1.2.5 §2.2 L2 仕様化を実運用化、事例 #6 反映）

---

## ChatGPT 用プロンプト（コピペ）

```
あなたは仕様レビュアーとして、shogi リポジトリ（kazuo1970takahashi-sketch/shogi）の feat/phase-a-t-test-hardening ブランチから以下を読んでください。

【今回のレビュー対象】
- docs/specs/20260506_0045_shogi_at_spec_v1_2.md（A-T 仕様書 v1.2、476 行 + §0.2 ユーザーストーリー 5 本）

【参考資料（差分確認用）】
- docs/specs/20260505_2046_shogi_at_spec_v1.md（A-T 仕様書 v1、323 行）
- docs/specs/20260506_0045_shogi_at_spec_v1_2_patch.md（v1 → v1.2 への変更点パッチ A〜G）
- docs/specs/20260506_0045_shogi_at_stage1_kickoff.md（Stage 1 キックオフ依頼）

【背景・上位ルール】
shogi-coach リポジトリの main ブランチに以下が正式採用されています（2026-05-06 00:33）:
- docs/specs/zero_bug_declaration_v1_2_5.md（v1.2.5、ゼロバグ宣言・過渡期版）
- docs/specs/DevSecOps運用方針_v1.2_slim.md（v1.2 final Slim、§14 で v1.2.5 を参照）
- docs/specs/DevSecOps運用方針_v1.2_full.md（v1.2 final Full、§14 で v1.2.5 を参照）

A-T spec v1.2 は v1.2.5 §2.2 L4（primary semantic assertion 必須化）を反映する目的で v1 から更新されました。本レビューはこの整合性確認 + 仕様自体の妥当性検証です。

## レビュー観点

### A. v1 → v1.2 差分の整合性確認
1. §0 経緯と背景の v1.2 改訂理由が v1.2.5 §2.2 L4 確定と整合しているか
2. §4.2 expectClickable ヘルパが v1.2.5 §2.2 L4 の 7 段階検証（toBeAttached/toBeVisible/toBeEnabled / scrollIntoViewIfNeeded / 矩形検証 / CSS 計算値検証 / ancestor chain 検証 / 5 点 hit-test）を網羅しているか
3. §4.2 で force: true 禁止が明文化されているか
4. §4.2 で CSS 由来の踏み抜き要因（pointer-events / visibility / z-index）が L4 検証対象に含まれているか
5. §4.3 clickAndExpectChange ヘルパ仕様（新設）が v1.2.5 §2.2 L4（v2.2.1 確定版）と完全整合しているか:
   - primary semantic assertion 必須化（state / DOM / 永続化 / URL のいずれか 1 つ以上）
   - UI 重要操作（v1.2.5 §1.4）では通知表示のみ禁止
   - 画面遷移系操作では URL 変化のみを primary として許容（v1.2.5 v2.2.1 例外）
   - 補助 assertion（任意）：通知表示
6. §4.3.7 shogi 固有 primary assertion カタログ（8 操作分）が網羅的か
7. §5 Stage 2 完了基準に「primary assertion 宣言済み」が反映されているか
8. §5 Stage 4 完了基準に「A-4.2 回帰テストの primary assertion で赤」が反映されているか
9. §6 受け入れ基準に「v1.2.5 §2.2 L4 完全整合」が追加されているか

### B. §0.2 ユーザーストーリー 5 本の妥当性
1. US-1〜US-5 のシナリオ全体で、A-T フェーズの利用シナリオを網羅しているか
2. v1.2.5 §2.2 L1 の「3〜5 本必須」を満たすか
3. テスト基盤フェーズの特殊性（業務ユーザーではなく開発者・AI が主体）が適切に表現されているか
4. 各ストーリーが「AI が実装中・レビュー中・運用試験中に実際に依拠する」具体性を持つか

### C. Stage 構成（1〜8）の妥当性
1. Stage 1（既存 272 件の偽陽性検証）が Stage 2 のヘルパ実装に必要な調査として十分か
2. Stage 2 + Stage 4 が「3 ステップで 1 日完走」の見積に乗るか（v1.2.5 §13.6 段階 1 移行に直結）
3. Stage 5（モンキーテスト）/ Stage 6（VRT）/ Stage 7（CI 統合）/ Stage 8（全体テスト）が後段に分割されることで、Stage 2/4 までの早期成果取り込みが可能になっているか

### D. CI ランタイムと v1.2.5 §6.4 の整合
1. A-T §7「CI ランタイム 5 分以内」の目標値と v1.2.5 §6.4「SLA 未定」の関係
2. プロジェクト単位の努力目標として保持することの是非

### E. v1.2.5 採用後初の Stage 着手としての妥当性
1. 業務モデル文書（v1.2.5 §2.2 L0）が shogi リポジトリに存在しているか / 不足する場合 A-T で補えるか
2. v1.2.5 §13.6 段階別自動マージ範囲（段階 0 → 段階 1 移行は A-T 完了後）と A-T Stage 構成の整合
3. v1.2.5 §13.4 Codex Yes 構造化（YAML フォーマット）が A-T のテストにどう適用されるか

## Devil's Advocate（v1.2.5 §2.2 L2 必須）

以下を**最低要件**として実施してください：

- **暗黙要件を最低 3 件**：v1.2 で書かれていないが当然必要な前提
- **悪い解釈を最低 2 件**：仕様の最も悪い解釈で発生する問題
- **仕様境界の未定義点を最低 2 件**：仕様が触れていないエッジケース
- 「問題なし」の場合も、なぜ問題なしと言えるかを書く

特に厳しく見てほしい観点：
- §4.3 primary assertion 必須化が「1 つあれば十分」と悪用されるリスク（保存系で state は assert するが localStorage を見ていない、等）
- §4.3.7 カタログに掲載されていない新規操作（A-7 / A-8 / A-9 で追加予定）への適用方法
- Stage 1 偽陽性検証で「偽陽性なし」と判定された場合のフォールバック（実は構造的に検出不能なバグだった可能性）
- §6.5「force: true 使用箇所がリポジトリ全体でゼロ」の grep 検証で、テストコード以外（プロダクションコード）の force 使用への影響
- A-T が shogi 専用基盤になるリスク：将来の golf-compe / bp-matching / shogi-coach に転用する際の汎用化方針

## 引用根拠の確認義務（v1.2.5 §8 + §8.1）

レビュー結果出力には以下を必須で含める：

```yaml
review_metadata:
  citation_verified: true  # 引用根拠を検索/確認したか
  nonexistent_section_check: true  # 存在しない章番号への言及がないか
  v1_2_final_priority_check: true  # v1.2 final / v1.2.5 優先順位に従っているか
```

## 出力形式

1. **総合評価**：A / A- / B+ / B / C
2. **A. v1 → v1.2 差分の整合性確認**：観点 1〜9 について完全整合 / 部分整合 / 不整合を明示
3. **B. §0.2 ユーザーストーリーの妥当性**：US-1〜US-5 各々の評価
4. **C. Stage 構成の妥当性**：観点 1〜3 評価
5. **D. CI ランタイム整合**：是非
6. **E. v1.2.5 採用後初の Stage 着手としての妥当性**：観点 1〜3 評価
7. **新規 Must Fix（あれば）**：箇条書き
8. **新規 Should Fix（あれば）**：箇条書き
9. **Devil's Advocate 結果**：暗黙要件 3 + 悪解釈 2 + 境界未定義 2 = 最低 7 件
10. **review_metadata**：YAML 形式で 3 項目
11. **全体所感**：3〜5 行

## 評価基準

- A：そのまま Stage 1 着手可
- A-：軽微修正後に Stage 1 着手可
- B+：Must Fix 1〜2 件あり、再レビュー推奨
- B：Must Fix 3 件以上 or §0 ユーザーストーリーが不在（v1.2.5 §2.2 L1 違反）
- C：書き直し必要

A-T は v1.2.5 採用後初の Stage 着手フェーズであり、v1.2.5 のテスト基盤として機能することが他全プロジェクトに波及します。厳しく見てください。
```

---

## 実施手順

1. 本ファイルを Claude Code が shogi リポジトリ feat/phase-a-t-test-hardening ブランチに追加 push
2. ChatGPT に上記プロンプトを投入
3. レビュー結果を Claude.ai に集約
4. 判定別アクション：
   - **A 判定** → Stage 1 着手（別セッションで Phase 1: 偽陽性検証）
   - **A- 判定** → 軽微修正反映 → そのまま Stage 1 着手
   - **B+ / B 判定** → v1.3 改訂 → 再レビュー
   - **C 判定** → 書き直し
