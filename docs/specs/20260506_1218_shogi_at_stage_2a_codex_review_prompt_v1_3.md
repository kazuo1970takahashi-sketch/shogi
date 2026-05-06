# Codex 独立再レビュー依頼:shogi A-T Stage 2a 仕様書 v1.3

**作成日時**: 2026-05-06 12:18 JST
**運用方式**: Codex 独立レビュー(DevSecOps 運用方針 v1.2 final 準拠)
**ベース**: `docs/specs/20260506_1135_shogi_at_stage_2a_codex_review_prompt.md`(v1.2 用、commit d6832af)を v1.3 用に派生

---

## 0. 本依頼の位置づけ

v1.2 用 Codex 独立レビュー依頼(commit d6832af)で B+ 判定(Must Fix 2 + Should Fix 3 + Nice to Have 2)を受領。v1.3 でこれら 7 件を構造修正で吸収し、commit db8d5ab で main 反映済み。本依頼は v1.3 の **再レビュー** であり、目標は **A 判定**(Codex 独立レビューでの実装着手 OK)。

並行して ChatGPT v1.3 簡易確認では **A 判定維持** を受領済み(参考情報、独立判定に影響させない)。

レビュー対象は引き続き **コードではなく仕様書**(PR 化前、実装着手前)。Codex の責務は「Stage 2a の仕様書が偽陽性を許容しない構造になっているか / Stage 2b 以降で偽陽性を排除できる設計になっているか」を厳密に判定する。

---

## 1. レビュー対象

- リポジトリ: `kazuo1970takahashi-sketch/shogi`(private)
- ブランチ: `feat/phase-a-t-stage-2a-helpers`
- 対象 commit: **db8d5ab**(Stage 2a 仕様書 v1.3 同名上書き、v1.2 → v1.3、+383/-260、net +123)、**e2701bf**(ChatGPT v1.3 簡易確認依頼追加)
- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.3、1,359 行)
- v1.2 → v1.3 構造修正差分:
  - §3.2.5 新設(`triggerInputFileAndExpectChange` ヘルパ仕様)
  - §3.1 段階 0(`scrollIntoViewIfNeeded`)復活 + 段階 6 hit-test 祖先許容削除
  - §3.4 表 #20 注記更新(`triggerInputFileAndExpectChange` 経由、`#loadFile` 直接ターゲット)
  - §3.4 末尾「実装時確認可」に `masterImported` 追加要件
  - §4.1 ファイル配置に `getStateSnapshot.js` + `triggerInputFileAndExpectChange.js` 分離追加
  - §4.3 #20 `stateLoadedFromFile` 再設計
  - §4.7 新設(Codex v1.2 → v1.3 指摘吸収マトリクス)
  - §5.1 単体テストに `triggerInputFileAndExpectChange.test.js` + `getStateSnapshot.test.js` 追加
  - §5.2 サンプル e2e の clipboard 系事前準備 raw click 排除 + ファイル系正常系追加
  - §6 完了基準追加 + Codex YAML 内訳分離 + factory 一覧追加
  - §8 リスク 2 件追加(API 数増加、setInputFiles 副作用 async)
  - §10.3 新設(`masterImported` 関連 Stage 2b 申し送り)

---

## 2. Codex への依頼テンプレート(コピペ用)

以下のコードブロック内側を全選択コピーして Codex に投入してください。

````markdown
GitHub `kazuo1970takahashi-sketch/shogi` の `feat/phase-a-t-stage-2a-helpers` ブランチ、commit **db8d5ab** をレビューしてください(v1.2 commit 77c5e06 → v1.3 commit db8d5ab、再レビュー依頼)。

## 背景

A-4.2(commit 73961d3)で重大なリグレッション(A/B クラスボタンが実機で動作しないが、e2e 124 件・単体 595 件のテストが全 pass)が発生。Stage 1 完了レポートで「観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当」が主因と判明。Playwright の `locator.click()` が `pointer-events: none` / overlay / inert を踏み抜き、`onClick` ハンドラを直接トリガーしていた。

v1.2 にあなたが出した B+ 判定(Must Fix 2 + Should Fix 3 + Nice to Have 2)を v1.3 で吸収。本依頼は v1.3 の再レビュー。

## 今回のレビュー対象

A-T Stage 2a 仕様書 v1.3。**重要: Stage 2a は基盤整備のみ。既存 e2e 124 件の置換は Stage 2b 以降の申し送り。** 本仕様書では `shogi_v4.html`(production code)を一切変更しない方針(DevSecOps v1.2.5 §13 段階 1)。

v1.3 で導入された主な構造変更:

- **`triggerInputFileAndExpectChange` ヘルパ新設**(§3.2.5):ファイル input 型操作専用、`expectClickable` をスキップ、`<input type="file">` の `setInputFiles` 直接実行
- **`getStateSnapshot` を別ファイルに分離**(§4.1):`clickAndExpectChange.js` と `triggerInputFileAndExpectChange.js` の両方から共通利用
- **`stateLoadedFromFile` 再設計**(§4.3 #20):`#loadFile`(隠し file input、L94)を直接ターゲット、仲介 button `#load-pick-file` は使わない
- **`expectClickable` SF 反映**(§3.1):段階 0 `scrollIntoViewIfNeeded()` 復活 + 段階 6 hit-test の祖先許容削除
- **`masterImported` 追加要件の §3.4 末尾 + §10.3 集約**:mi-mode 設定 / confirm 受諾 / ファイル経由 / 異常系を Stage 2a 実装時責任 + Stage 2b 申し送り

## 参照すべき仕様書

- `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.3、本レビュー対象、commit db8d5ab)
- `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`(A-T spec v1.3、Stage 2a の上位仕様)
- `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`(Stage 1 完了レポート、特定された偽陽性パターン)
- `docs/specs/_business_model.md`(L0 業務モデル文書 v1.1、§1.5 P0 が Stage 2a 対象)
- shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`(DevSecOps v1.2.5)

## 特に厳しく見てほしい観点

### 観点 A〜F: v1.2 用観点を v1.3 で再評価

v1.2 用 Codex 依頼の観点 A〜F を v1.3 で再判定してください(項目は前回と同一、判定は v1.3 の構造修正を踏まえて再評価)。

**観点 A: 偽陽性排除の構造的健全性**(A-1〜A-5):

- A-1. `expectClickable` ヘルパ仕様(§3.1)は、Playwright の `locator.click()` が踏み抜く 5 経路(`pointer-events: none` / 祖先 `display: none` / 祖先 `inert` / 中央 overlay ブロック / 角 overlay ブロック)を全て検出する構造になっているか。**v1.3 で段階 0 `scrollIntoViewIfNeeded` 復活 + 段階 6 hit-test 祖先許容削除を含めて評価**
- A-2. `clickAndExpectChange` ヘルパ仕様(§3.2)は、`primaryAssertions=0` を **必ず** 赤にする機械保証を含むか
- A-3. §3.3 の primary semantic assertion 必須化は、L0 §1.5 P0 操作で「通知表示のみを成功条件」とすることを禁止しているか
- A-4. §3.4 の 22 factory カタログは、L0 §1.5 P0 19 操作を漏れなく網羅しているか
- A-5. raw callback 形式の悪用余地に対し、§3.2 末尾ガイドライン + §6 完了基準「P0 e2e で raw callback 使用ゼロ」+ Codex YAML `raw_callback_usage` 内訳の 3 重防御は構造として十分か(**v1.3 で内訳化**)

**観点 B: v1.1 → v1.2 の ChatGPT 指摘吸収の真贋**(B-1〜B-6):

(項目は v1.2 と同一、判定基準も同一)

**観点 C: §10 Stage 2b 申し送りの妥当性**(C-1〜C-3):

- C-1. SF#4 を Stage 2a で決着しないことは妥当か
- C-2. SF#5 を Stage 2a で決着しないことは妥当か
- C-3. **v1.3 で追加された §10.3 `masterImported` 関連申し送り**(mi-mode 設定 / confirm 受諾 / ファイル経由 / 異常系)は、Stage 2b 仕様書起草時に十分な入力となるか / Stage 2a の §3.4 末尾「実装時確認可」と二重管理になっていないか

**観点 D: スコープ統制**(D-1〜D-3):

- D-1. §1.2 IN/OUT は明確に分離されているか / OUT(既存 e2e 置換、新規 click 操作追加、L0 §1.5 P1、Codex L4 YAML 正式化、SF#4/#5、`masterImported` 追加要件)は v1.3 でも維持されているか
- D-2. §6 完了基準は v1.3 で拡張された範囲(P0 22 factory + 単体テスト 35 件以上 + サンプル e2e 5 件 + raw click ゼロ + production code 不変 + `triggerInputFileAndExpectChange` 関連検証)に限定されているか
- D-3. v1.2 → v1.3 で +123 行(1,236 → 1,359)の増加は、内部肥大化ではなく必然的な構造修正(§3.2.5 新設 / §4.7 新設 / §5.1 §5.2 §6 §8 §10.3 追記)か

**観点 E: 内部整合性**(E-1〜E-4):

- E-1. §3.4 表 #18 / #20 の注記と §4.3 #18 / #20 のコードは同期しているか(**特に v1.3 で再設計された #20**)
- E-2. §3.6 表「P2 = 0 操作」と §3.6 v1.2 補足 + v1.3 でファイル系ヘルパ分離の説明は矛盾していないか
- E-3. §4.5 / §4.6 / §4.7 の v1.0 → v1.1 / v1.1 → v1.2 / v1.2 → v1.3 吸収マトリクスは重複なく整理されているか
- E-4. §0 改訂履歴 v1.3 行と §3.2.5 / §4.3 / §4.7 / §5.1 / §5.2 / §6 / §8 / §10.3 の本文反映は一致しているか

**観点 F: ChatGPT 提示「実装担当 AI 向け最小追記 6 項目」の包含**(F-1〜F-6):

(項目は v1.2 と同一、判定は v1.3 で再評価)

### 観点 G: 前回 Codex 指摘の吸収(v1.3 で新規追加、最重要)

v1.2 用 Codex 独立レビューで提示した Must Fix 2 + Should Fix 3 + Nice to Have 2 の各項目について、v1.3 で **形式的吸収** か **実質吸収** かを判定:

- G-1. **Must Fix #1**(§5.2 clipboard サンプルの raw `#addBtn.click()`):v1.3 で `clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'))` に置換 + §6 完了基準「§5.2 raw click 呼出ゼロ」+ Codex YAML `sample_e2e_raw_click_count: 0` 追加。「サンプル e2e は新しい世界の見本」という前回の指摘本質を構造的に解決しているか
- G-2. **Must Fix #2**(`stateLoadedFromFile` の selector / change handler 不整合):v1.3 で `triggerInputFileAndExpectChange` ヘルパ新設(§3.2.5)+ `#loadFile` 直接ターゲット + `setInputFiles` 直接実行 + `expectClickable` スキップ。前回指摘した 3 段構造(`#loadFile` 隠し input + `#load-pick-file` 仲介 button + change handler)の問題を真に解決しているか / Playwright の挙動と整合しているか
- G-3. **Should Fix #1**(`scrollIntoViewIfNeeded()` 復活):v1.3 §3.1 段階 0 として復活。viewport 外要素の hit-test 失敗を防ぐ位置付けで A-T spec v1.3 §4.2 + DevSecOps v1.2.5 L4 と整合しているか
- G-4. **Should Fix #2**(hit-test の `top.contains(el)` 許容削除):v1.3 §3.1 段階 6 で `top === el || el.contains(top)` のみ許容、祖先許容(`top.contains(el)`)を削除。判断理由のコメントは妥当か / 将来「祖先 div で onclick 委譲」が必要なケースへの代替案(個別 factory の beforeClick)は十分か
- G-5. **Should Fix #3**(`raw_callback_usage_count` 内訳分離):v1.3 §6 Codex YAML で `raw_callback_usage: { helper_unit: N, sample_negative: 2, p0_e2e: 0 }` に内訳化。Stage 2c で機械判定しやすい構造になっているか
- G-6. **Nice to Have #1**(file input 型 helper 別 API):v1.3 で `triggerInputFileAndExpectChange` 新設により実現。クリック型と file input 型の責務分離は API レベルで成立しているか / 単一関数 option 切替(案 α)を採用しなかった判断は妥当か
- G-7. **Nice to Have #2**(`requiredPermissions` factory 一覧の YAML 配列化):v1.3 §6 Codex YAML に `factory_with_required_permissions: ['tournamentDataCopied']` + `factory_with_trigger_input_file: ['stateLoadedFromFile']` 追加。後続レビューで一覧確認が容易になっているか

### 観点 G-8: ChatGPT v1.3 簡易確認で提示された新規回帰懸念への対応

- G-8. ChatGPT v1.3 簡易確認は新規回帰懸念として「ヘルパ選択ミス」(`clickAndExpectChange` と `triggerInputFileAndExpectChange` の 2 系統で AI が誤選択するリスク)を挙げ、§3.4 表「ヘルパ」列 + §3.5 ファイル系判定基準 + §6 Codex YAML `factory_with_trigger_input_file` で対策されていると判定した。Codex 独立観点としてこの判定は妥当か / 仕様書修正不要(実装依頼書側で 1 行追記で十分)で A 判定の障害にならないか

## 出力形式

1. **総合判定**: A / A- / B+ / B / C
2. **観点別判定**: A-1〜A-5 / B-1〜B-6 / C-1〜C-3 / D-1〜D-3 / E-1〜E-4 / F-1〜F-6 / **G-1〜G-8** を Yes / No / Partial で
3. **Must Fix**(マージ前必須):箇条書き、§番号 と問題箇所引用
4. **Should Fix**(強く推奨):箇条書き
5. **Nice to Have**:箇条書き
6. **良い点**:箇条書き
7. **全体所感**

## 判定基準

- **A**:そのまま実装着手可
- **A-**:軽微修正(行数 +30 以内)後、実装着手可
- **B+**:Must Fix 1〜2 件、修正後再レビュー
- **B**:Must Fix 3 件以上 or 構造的問題あり、v1.4 起草必要
- **C**:Stage 2a スコープ自体の見直しが必要

## DevSecOps 運用方針 v1.2 final 準拠

ChatGPT v1.3 簡易確認は A 判定済み(`docs/specs/20260506_1206_shogi_at_stage_2a_chatgpt_review_prompt_v1_3.md`、commit e2701bf 経由で投入、結果は本依頼の参考情報として既読前提)。Codex は **独立再レビュー**として、ChatGPT 判定に引きずられず観点 A〜G を独立判定してください。前回 v1.2 で指摘した Must Fix 2 + Should Fix 3 + Nice to Have 2 の吸収状況(観点 G)を最重視。
````

---

## 3. 投入後の運用ルール

### Codex の判定別の進行

| 判定 | Claude.ai のアクション |
|---|---|
| A | Stage 2a 実装着手(Claude Code に実装依頼、ChatGPT 提示の最小追記 6 項目 + ヘルパ選択注意 1 行を実装依頼書に組込) |
| A- | 軽微修正(+30 行以内)を v1.4 として反映、Codex に再レビュー依頼 |
| B+ | Must Fix 反映方針を Claude.ai が立て、v1.4 起草、Codex に再レビュー依頼 |
| B | Stage 2a 仕様書の構造的見直し、ChatGPT に再相談 |
| C | Stage 2a スコープ自体の見直し |

### Codex への依頼運用ルール(20260505_2046 から踏襲)

1. **Codex のレビュー結果は `docs/specs/` に反映記録は残さない**(実装の git history で追跡)
2. Codex 判定が **A / A-** なら次の実装着手フェーズへ進行
3. Codex 判定が **B+ 以下** なら Claude.ai が Must Fix 反映方針を立てる

---

## 4. 関連ファイル

- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.3、commit db8d5ab)
- v1.2 用 Codex 独立レビュー依頼: `docs/specs/20260506_1135_shogi_at_stage_2a_codex_review_prompt.md`(commit d6832af、本依頼の派生元、B+ 判定受領済み)
- v1.3 用 ChatGPT 簡易確認依頼: `docs/specs/20260506_1206_shogi_at_stage_2a_chatgpt_review_prompt_v1_3.md`(commit e2701bf、A 判定維持受領済み)
- A-T 仕様書 v1.3: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- Stage 1 完了レポート: `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`
- L0 業務モデル文書 v1.1: `docs/specs/_business_model.md`
- DevSecOps v1.2.5: shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`
- A-T フェーズ境界 Codex テンプレート集: `docs/specs/20260505_2046_shogi_at_codex_review_prompt.md`
- 本依頼文: `docs/specs/20260506_1218_shogi_at_stage_2a_codex_review_prompt_v1_3.md`
