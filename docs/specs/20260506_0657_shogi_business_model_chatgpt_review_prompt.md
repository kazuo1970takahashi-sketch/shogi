# ChatGPT レビュー依頼：shogi L0 業務モデル文書 v1.0

**作成日時**: 2026-05-06 06:57 JST
**配置先**: `docs/specs/20260506_0657_shogi_business_model_chatgpt_review_prompt.md`
**実行方法**: 本プロンプトを ChatGPT（GitHub 連携あり）にコピペ 1 回で実行
**ファイル添付**: 不要（GitHub 連携で読み取り）

---

## ChatGPT への指示（ここから下を ChatGPT にコピペ）

あなたは沼津支部月例将棋大会管理アプリ（shogi_v4）の業務ドメインに精通した、独立レビュアです。以下のレビューを実施してください。

### レビュー対象

リポジトリ: `kazuo1970takahashi-sketch/shogi`
ブランチ: `feat/phase-a-t-test-hardening`
主対象ファイル: `docs/specs/_business_model.md`（493 行、commit 6335c2b で新規追加）

### 関連参照（同ブランチ）

- `docs/specs/20260506_0045_shogi_at_spec_v1_3.md`（A-T 仕様書 v1.3、Stage 2a の対象仕様）
- `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`（Stage 1 完了レポート、124 tests / 130 clicks の偽陽性分析）
- `shogi_v4.html`（実装本体、約 3,800 行）

### 関連参照（main ブランチ）

- `docs/specs/20260505_1500_shogi_roadmap.md`（ロードマップ v16）
- `docs/specs/20260505_1938_shogi_a7_a8_a9_design_memo.md`（A-7/A-8/A-9 設計メモ）

### 関連参照（shogi-coach リポジトリ）

- `docs/specs/zero_bug_declaration_v1_2_5.md`（DevSecOps 運用方針 v1.2.5、§13.4 が L0 業務モデル文書を必須化）

### コンテキスト

本文書は v1.2.5 §13.4 で「業務モデル文書を `docs/specs/_business_model.md` に常駐」として必須化されたもの。次フェーズ（A-T Stage 2a：`expectClickable` + `clickAndExpectChange` ヘルパ実装）の着手前条件として位置づけられている。本文書が Stage 2a 仕様（特に primary semantic assertion カタログ）の起点として機能するため、品質要求は高い。

A-T spec v1.3 + Stage 1 レポートで判明した「観点 2（クリック前検証不在）が e2e 130/130 件 = 100% 該当」が A-4.2 リグレッション（A/B クラスボタンが実機で動作しない）すり抜けの主因。本業務モデル文書 §1.4「UI 重要操作カタログ」は、この再発防止の中核となる。

### レビュー観点（必須 7 項目）

各観点について、根拠を引用しながら判定してください。

1. **完全性**：実装の全ドメイン（4 タブ、参加者 / マスタ / 結果 / 報告書）を網羅しているか。`shogi_v4.html` を grep して、本文書 §5 のフィールド一覧から漏れている重要フィールドが無いか確認。
2. **正確性**：本文書の記述（特に §4 データモデル、§5 フィールド一覧、§6 データフロー）が `shogi_v4.html` の実装と一致するか。誤った行番号・存在しない ID・不正確なスキーマが無いか。
3. **§1.4 UI 重要操作カタログの完全性**：Stage 2a の `clickAndExpectChange` ヘルパが参照する起点として十分か。「クリックしたら状態が変わるべき」操作で、カタログから漏れているものが無いか。primary assertion 例の妥当性も評価。
4. **§7 不変条件の妥当性**：INV-PL/PA/MA/RE 計 14 件が、(a) 業務上守るべき制約として妥当か、(b) Contract Testing で検証可能な粒度か、(c) 抜け漏れが無いか。
5. **§2 ジャーニーの実際性**：A〜F の 6 ジャーニーが、月例大会の運用フロー（受付〜大会終了〜報告書提出）を漏れなく表現しているか。Edge case（中断・復旧、奇数人 BYE、過去対局修正）が適切に含まれているか。
6. **Stage 2a への接続性**：本文書から Stage 2a 仕様書 §0 ユーザーストーリーが派生可能か。特に §1.4 と A-T spec v1.3 §4.3.7（shogi 固有 primary assertion カタログ）の整合性。
7. **常駐文書としての保守性**：§9.3 の更新トリガー一覧が運用に乗るか。本文書が「真実の源」として機能し続けるための仕組みとして妥当か。

### 評価基準

- **A**：そのまま v1.0 として確定可、Stage 2a 着手 OK
- **A-**：軽微修正後に v1.0 確定可、Stage 2a 着手 OK
- **B+**：Must Fix 1〜2 件あり、修正後に再レビュー推奨
- **B**：Must Fix 3 件以上 or 構造的な問題あり
- **C**：文書を書き直す必要あり

### 出力フォーマット

```
## 総合評価
[A / A- / B+ / B / C のいずれか]

## Must Fix（v1.0 確定前必須修正）
- [箇条書き、根拠付き、引用付き（行番号 or §番号）]

## Should Fix（推奨修正、v1.1 で対応可）
- [同上]

## Nice to Have（任意）
- [同上]

## 良い点
- [箇条書き]

## 全体所感
[3〜5 行]

## Stage 2a 着手判断
[「着手可」or「Must Fix 反映後に着手可」or「再レビュー必須」のいずれか + 1〜2 行の理由]
```

### 重要

- DevSecOps v1.2.5（特に §1.4 / §2.2 / §13.4）に準拠した観点でレビューしてください
- 「業務モデル文書は永続常駐」という性質上、フェーズに紐付かないドメイン定義の正確性を最優先で見てください
- Stage 2a で実装される `clickAndExpectChange` の primary assertion 起点として §1.4 が機能するかを特に厳しく評価してください

---

## レビュー後のフロー（人間用メモ、ChatGPT には渡さない）

1. ChatGPT から評価が返る
2. **A 判定** → 即 main マージ判断 → Stage 2a ヘルパ実装の Claude Code キックオフへ
3. **A- 判定** → Must Fix を v1.0 内で反映（commit 追加）→ main マージ → Stage 2a 着手
4. **B+ 判定** → 文書を v1.1 として Must Fix 反映 → 再 push → 再レビュー
5. **B 以下** → Claude.ai に戻して文書再構築

## 関連ファイル

- 本体: `docs/specs/_business_model.md`（commit 6335c2b）
- 本プロンプト: `docs/specs/20260506_0657_shogi_business_model_chatgpt_review_prompt.md`
