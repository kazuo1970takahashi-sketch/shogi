# Codex 独立レビュー依頼:shogi A-T Stage 2a 仕様書 v1.2

**作成日時**: 2026-05-06 11:35 JST
**運用方式**: Codex 独立レビュー(DevSecOps 運用方針 v1.2 final 準拠)
**ベース**: `docs/specs/20260505_2046_shogi_at_codex_review_prompt.md`(A-T フェーズ境界テンプレート集)の Stage 2 用テンプレを Stage 2a 専用に派生

---

## 0. 本依頼の位置づけ

A-T フェーズ境界レビューはテンプレート集(20260505_2046)で **Stage 2 / Stage 4 / Stage 8 の 3 回**が想定されていたが、Stage 2 は実装範囲の重さから **Stage 2a / 2b / 2c** に細分化された。本依頼は **Stage 2a(ヘルパ基盤 + サンプル e2e のみ、既存テスト置換は 2b/2c に申し送り)** の仕様書レビュー(PR 化前、実装着手前)である。

レビュー対象は **コードではなく仕様書** であり、Codex の責務は以下の通り:

> 「Stage 2a の仕様書が偽陽性を許容しない構造になっているか / Stage 2b 以降で偽陽性を排除できる設計になっているか」を厳密に判定する。実装コードの動作検証は実装後の Stage 2a 完了時 PR レビューに委ねる。

---

## 1. レビュー対象

- リポジトリ: `kazuo1970takahashi-sketch/shogi`(private)
- ブランチ: `feat/phase-a-t-stage-2a-helpers`
- 対象 commit: **77c5e06**(Stage 2a 仕様書 v1.2 同名上書き)、**a1c7568**(ChatGPT v1.2 再レビュー依頼追加)
- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.2、1,236 行)
- ChatGPT v1.2 再レビュー依頼: `docs/specs/20260506_1021_shogi_at_stage_2a_chatgpt_review_prompt_v1_2.md`(参考、A 判定受領済み)

---

## 2. Codex への依頼テンプレート(コピペ用)

以下のコードブロック内側を全選択コピーして Codex に投入してください。

````markdown
GitHub `kazuo1970takahashi-sketch/shogi` の `feat/phase-a-t-stage-2a-helpers` ブランチ、commit **77c5e06** をレビューしてください。

## 背景

A-4.2(commit 73961d3)で重大なリグレッション(A/B クラスボタンが実機で動作しないが、e2e 124 件・単体 595 件のテストが全 pass)が発生。Stage 1 完了レポートで「観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当」が主因と判明。Playwright の `locator.click()` が `pointer-events: none` / overlay / inert を踏み抜き、`onClick` ハンドラを直接トリガーしていた。A-T フェーズで UI テスト基盤を構造的に強化中。

## 今回のレビュー対象

A-T Stage 2a 仕様書 v1.2(`expectClickable` + `clickAndExpectChange` ヘルパ基盤 + 22 factory カタログ + サンプル e2e、PR 化前の仕様書レビュー)。

**重要: Stage 2a は基盤整備のみ。既存 e2e 124 件の置換は Stage 2b 以降の申し送り。** 本仕様書では `shogi_v4.html`(production code)を一切変更しない方針(DevSecOps v1.2.5 §13 段階 1)。

## 参照すべき仕様書

- `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.2、本レビュー対象)
- `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`(A-T spec v1.3、Stage 2a の上位仕様)
- `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`(Stage 1 完了レポート、特定された偽陽性パターン)
- `docs/specs/_business_model.md`(L0 業務モデル文書 v1.1、§1.5 P0 が Stage 2a 対象)
- shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`(DevSecOps v1.2.5)

## 特に厳しく見てほしい観点(Stage 2a 共通)

### 観点 A: 偽陽性排除の構造的健全性(最重要)

A-1 〜 A-T 1〜A-T 5: 以下を Yes/No で判定:

- A-1. `expectClickable` ヘルパ仕様(§3.1)は、Playwright の `locator.click()` が踏み抜く 5 経路(`pointer-events: none` / 祖先 `display: none` / 祖先 `inert` / 中央 overlay ブロック / 角 overlay ブロック)を全て検出する構造になっているか
- A-2. `clickAndExpectChange` ヘルパ仕様(§3.2)は、`primaryAssertions=0` の expectedChange を **必ず** 赤にする機械保証(`primaryCount >= 1` 検証、§3.2 末尾)を含むか
- A-3. §3.3 の primary semantic assertion 必須化は、L0 §1.5 P0 操作で「通知表示のみを成功条件」とすることを禁止しているか(A-4.2 型悪用防止)
- A-4. §3.4 の 22 factory カタログは、L0 §1.5 P0 19 操作を漏れなく網羅しているか(分割で 22 になる構造の正当性も含む)
- A-5. raw callback 形式の悪用余地(`ctx.primary()` を呼ぶだけで実 assertion 無しでも primaryCount が増える)に対し、§3.2 末尾の使用ガイドライン + §6 完了基準「P0 e2e で raw callback 使用ゼロ(grep 検証)」+ Codex YAML `raw_callback_usage_count` の 3 重防御は構造として十分か

### 観点 B: v1.1 → v1.2 の ChatGPT 指摘吸収の真贋

ChatGPT v1.1 レビュー A- → v1.2 で以下を吸収。形式的吸収か実質吸収かを判定:

- B-1. **SF#1**(raw callback の `ctx.primary()` 悪用余地): §3.2 末尾「raw callback 形式の使用ガイドライン」+ §6 Codex YAML(`raw_callback_usage_count`)+ §6 完了基準「P0 e2e で raw callback ゼロ」の組合せで、A-4.2 型バグ再発を構造的に抑えられるか
- B-2. **SF#2**(`meta.setupRequired` 構造化): §4.3 #18 `tournamentDataCopied` の `meta.requiredPermissions = ['clipboard-read', 'clipboard-write']` 構造化と、§5.2 サンプル e2e の `context.grantPermissions(factory.meta.requiredPermissions)` 実行 + clipboard 内容検証は、文字列メモから実態保証への昇格として機能するか
- B-3. **SF#3**(grep 微調整の確定/実装時確認分離): §3.4 の確定仕様(factory 名 / 責務 / primary 種別 / failure 条件) vs 実装時確認可(selector / 関数名 / mode 分岐)の境界は、実装担当 AI が誤って責務を変更するリスクを抑えられるか
- B-4. **SF#6**(P2→P0 統合の説明): §3.6 v1.2 補足は、L0 §1.5 P2 区分(業務優先度)を **維持** したまま Stage 2a 検証実装範囲上の統合であることを説明できているか / L0 と Stage 2a 仕様書の整合は取れているか
- B-5. **NH#3**(JSDoc typedef): §4.3 冒頭の `ExpectedChangeFactory` typedef は、`shogi_assertions.js` 22 factory の構造を Codex / Claude Code が読みやすい形にしているか / `clickAndExpectChange.js` 側からの参照(§3.2 冒頭)は機能するか
- B-6. **回帰懸念 3 件**(§8 リスクと緩和):API 高機能化 / Stage 2a 範囲拡大 / raw callback 規律弱化 への緩和策は形式的記述ではなく具体アクション(factory 形式標準化 / Stage 2a 完了条件絞込 / Codex YAML 観測)を伴うか

### 観点 C: §10 Stage 2b 申し送りの妥当性

ChatGPT v1.1 レビューで指摘された Should Fix #4(`roundConfirmed` の `isFinal` 自動判定)/ Should Fix #5(`pairingsRegenerated` の `allowSameContent` 運用ルール)を §10 Stage 2b 申し送りに移管している。以下を独立判定:

- C-1. SF#4 を Stage 2a で決着しないことは妥当か(`options.isFinal` 手指定で Stage 2a が止まらない論理 + Stage 2b 既存 spec 置換時の指定ミス頻度を見ないと判断できない論理は成立するか)
- C-2. SF#5 を Stage 2a で決着しないことは妥当か(`allowSameContent=true` がテストデータ設計に依存し、Stage 2a の helper 単体 + サンプル e2e では使わない論理は成立するか)
- C-3. §10 で残した方向性(SF#4 案A/案B、SF#5 運用ルール候補)は、Stage 2b 仕様書起草時に十分な入力となるか / Stage 2b で再判断できる構造で残せているか

### 観点 D: スコープ統制(Stage 2a が膨らみすぎていないか)

- D-1. §1.2 IN/OUT は明確に分離されているか / OUT(既存 e2e 置換、新規 click 操作追加、L0 §1.5 P1、Codex L4 YAML 正式化、SF#4/#5)は v1.2 でも維持されているか
- D-2. §6 完了基準は「P0 22 factory + 単体テスト + サンプル e2e 4 件 + raw callback ゼロ + production code 不変」に限定されているか / 既存 e2e 124 件への影響(全件緑のまま)は完了基準として明記されているか
- D-3. v1.1 → v1.2 で +222 行(1,014 → 1,236)に増加しているが、これは内部肥大化(同じ概念を別表現で繰り返す)ではなく、追加的吸収項目(§10 / §3.6 補足 / §3.4 分離 / §4.3 typedef / §5.2 e2e 1 件追加 / §8 リスク 3 行)による必然的増加か

### 観点 E: 内部整合性

- E-1. §3.4 表 #18 の注記(`requiredPermissions = ['clipboard-read', 'clipboard-write']` 必須)と §4.3 #18 のコード(`meta.requiredPermissions: [...]`)は同期しているか
- E-2. §3.6 表「P2 = 0 操作」と §3.6 v1.2 補足「L0 §1.5 P2 区分は維持」は、表記上矛盾していないか / どちらも「Stage 2a 検証実装範囲上の統合」で説明できる構造か
- E-3. §4.5(v1.0 → v1.1 吸収)と §4.6(v1.1 → v1.2 吸収)は重複なく整理されているか / Should Fix #4/#5 の扱い(v1.1 で吸収方向 → v1.2 で §10 Stage 2b 申し送り移管)の遷移は読み取れるか
- E-4. §0 改訂履歴 v1.2 行と §4.6 / §10 / §8(回帰懸念 3 件追加)の本文反映は一致しているか

### 観点 F: ChatGPT 提示の「実装担当 AI 向け最小追記 6 項目」の包含

ChatGPT v1.2 レビューで「実装依頼書に入れるとよい最小追記」として以下 6 項目が提示された。仕様書 v1.2 がこれらを既にカバーしているか / Claude Code 実装依頼書側に転記が必要かを判定:

- F-1. 「P0 操作は factory 形式のみ使用」→ §3.2 末尾ガイドラインで明記済みか
- F-2. 「raw callback は helper 単体テスト・異常系サンプルのみ許可」→ §3.2 末尾 + §6 完了基準で明記済みか
- F-3. 「P0 e2e の raw callback 使用数は 0」→ §6 完了基準で明記済みか
- F-4. 「`requiredPermissions` を持つ factory は、サンプル e2e で `context.grantPermissions(factory.meta.requiredPermissions)` を使う」→ §5.2 + §6 完了基準で明記済みか
- F-5. 「production code `shogi_v4.html` は変更禁止」→ §1.2 OUT + §6 完了基準で明記済みか
- F-6. 「§10 SF#4/#5 は Stage 2b 申し送りであり、Stage 2a では実装しない」→ §1.2 OUT + §10 で明記済みか

## 出力形式

1. **総合判定**: A / A- / B+ / B / C
2. **観点別判定**: A-1〜A-5 / B-1〜B-6 / C-1〜C-3 / D-1〜D-3 / E-1〜E-4 / F-1〜F-6 を Yes / No / Partial で
3. **Must Fix**(マージ前必須):箇条書き、§番号 と問題箇所引用
4. **Should Fix**(強く推奨):箇条書き
5. **Nice to Have**:箇条書き
6. **良い点**:箇条書き
7. **全体所感**

## 判定基準

- **A**:そのまま実装着手可
- **A-**:軽微修正(行数 +30 以内)後、実装着手可
- **B+**:Must Fix 1〜2 件、修正後再レビュー
- **B**:Must Fix 3 件以上 or 構造的問題あり、v1.3 起草必要
- **C**:Stage 2a スコープ自体の見直しが必要

## DevSecOps 運用方針 v1.2 final 準拠

ChatGPT v1.2 再レビューは A 判定済み(`docs/specs/20260506_1021_shogi_at_stage_2a_chatgpt_review_prompt_v1_2.md` 経由で投入、結果は本依頼の参考情報として既読前提)。Codex は **独立レビュー**として、ChatGPT 判定に引きずられず観点 A〜F を独立判定してください。
````

---

## 3. 投入後の運用ルール

### Codex の判定別の進行

| 判定 | Claude.ai のアクション |
|---|---|
| A | Stage 2a 実装着手(Claude Code に実装依頼) |
| A- | 軽微修正(+30 行以内)を v1.3 として反映、Codex に再レビュー依頼 |
| B+ | Must Fix 反映方針を Claude.ai が立て、v1.3 起草、Codex に再レビュー依頼 |
| B | Stage 2a 仕様書の構造的見直し、ChatGPT に再相談 |
| C | Stage 2a スコープ自体の見直し(2a' / 2a'' 等への再分割含む) |

### Codex への依頼運用ルール(20260505_2046 から踏襲)

1. **Codex のレビュー結果は `docs/specs/` に反映記録は残さない**(実装の git history で追跡)
2. Codex 判定が **A / A-** なら次の実装着手フェーズへ進行
3. Codex 判定が **B+ 以下** なら Claude.ai が Must Fix 反映方針を立てる

### A-T リグレッション 4 重レビュー見逃し教訓の継承

Codex が A-4.2 PR#9 で「trailing whitespace 修正後 Yes」を出した教訓:
- **Codex は『コードの整合性』までは見るが、『実動作の正しさ』は保証しない**
- A-T 以降の依頼では「実動作の検証はテスト基盤に委ねる。Codex は『テスト基盤そのものが偽陽性を含まないか』『テストが本当にバグを検出できる構造か』を厳密に見る」を明示

本 Stage 2a レビューでは更に上記を **「仕様書段階」に拡張**:

> Codex は本仕様書 v1.2 が「Stage 2b 以降で偽陽性を排除できる設計になっているか」「Stage 2a 実装で偽陽性を許容しない構造になっているか」を判定する。実装コードの動作検証は Stage 2a 完了時 PR レビューに委ねる。

---

## 4. 関連ファイル

- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.2、commit 77c5e06)
- ChatGPT v1.2 再レビュー依頼: `docs/specs/20260506_1021_shogi_at_stage_2a_chatgpt_review_prompt_v1_2.md`(commit a1c7568、A 判定受領済み)
- A-T 仕様書 v1.3: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- Stage 1 完了レポート: `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`
- L0 業務モデル文書 v1.1: `docs/specs/_business_model.md`
- DevSecOps v1.2.5: shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`
- A-T フェーズ境界テンプレート集: `docs/specs/20260505_2046_shogi_at_codex_review_prompt.md`(本依頼の派生元)
- 本依頼文: `docs/specs/20260506_1135_shogi_at_stage_2a_codex_review_prompt.md`
