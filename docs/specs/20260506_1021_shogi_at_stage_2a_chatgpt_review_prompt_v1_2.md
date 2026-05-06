# ChatGPT 相談(v1.2 再レビュー依頼):shogi A-T Stage 2a 仕様書

**作成日時**: 2026-05-06 10:21 JST
**対象**: shogi A-T Stage 2a 仕様書 v1.2(`docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`、commit 77c5e06)
**位置づけ**: 前回 v1.1 レビュー A- 判定への対応版。Should Fix #1/#2/#3/#6 + Nice to Have #3 + 回帰懸念 3 件を吸収、Should Fix #4/#5 は §10 Stage 2b 申し送りに移管。A 判定狙い。

---

## ⚠️ ChatGPT への貼り付け方法

**下のコードブロック(```` で囲まれた部分)の中身を全選択コピーして ChatGPT にそのまま貼り付けてください。**

ChatGPT は GitHub 連携で `kazuo1970takahashi-sketch/shogi` リポジトリ、ブランチ `feat/phase-a-t-stage-2a-helpers`、commit `77c5e06` 上の v1.2 spec を直接読みに行ける前提。ファイル添付不要。

---

## ChatGPT に貼り付ける本文(↓ここから)

````markdown
# 続き: shogi A-T Stage 2a 仕様書 v1.2 再レビュー依頼

前回あなたの v1.1 レビュー(総合評価 A-、Must Fix なし、Should Fix 6 + Nice to Have 4 + 回帰懸念 3 件)を踏まえ、v1.2 を起草・main 反映しました。本相談は v1.2 の最終評価依頼です。**A 判定**(軽微修正不要、Stage 2a 実装着手 + Codex 独立レビューへ進む水準)を狙っています。

## 0. 確認対象

- リポジトリ: `kazuo1970takahashi-sketch/shogi`(private)
- ブランチ: `feat/phase-a-t-stage-2a-helpers`
- commit: **77c5e06**(直前は c86ef2d = v1.1 review prompt 追加)
- 対象ファイル: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.1 → v1.2 同名上書き、1,014 → 1,236 行、+222 行)

GitHub 連携で上記 commit の spec 本文を直接読んで判定してください。

## 1. v1.1 → v1.2 で吸収した項目(マトリクス)

前回あなたが提示した Should Fix / Nice to Have / 回帰懸念のうち、本 v1.2 で **何を / どこに / どう** 吸収したかを以下に示します。

| 指摘 | 吸収箇所(v1.2) | 対応内容 |
|---|---|---|
| **Should Fix #1** raw callback の `ctx.primary()` 悪用余地 | §3.2 末尾「raw callback 形式の使用ガイドライン」(新規ブロック) + §6 Codex YAML | factory 形式を P0 必須化 / raw callback はサンプル・例外用 / `ctx.primary()` 直後に `expect(...)` 必須 / Codex YAML に `raw_callback_usage_count` 追加(暫定: helper 単体 + サンプル e2e 異常系のみで P0 e2e は 0) / §6 完了基準に「P0 e2e で raw callback がゼロ(grep 検証)」追加 |
| **Should Fix #2** `meta.setupRequired` 構造化 | §4.3 #18 `tournamentDataCopied` + §5.1 + §5.2 + §6 完了基準 + §6 Codex YAML | 文字列メモ `setupRequired` を `requiredPermissions: string[]` に構造化 / §5.1 単体テストで `requiredPermissions = ['clipboard-read', 'clipboard-write']` 検証 / §5.2 サンプル e2e に「`context.grantPermissions(factory.meta.requiredPermissions)` を実行 → `tournamentDataCopied` で clipboard 内容検証」の正常系テストを 1 件追加 / §6 に `factory_required_permissions_validated` 追加 |
| **Should Fix #3** 「実装着手時 grep で微調整」の確定/作業メモ分離 | §3.4「確定仕様 vs 実装時確認の分離」(新規ブロック) | 確定仕様(変更不可) = factory 名 / 各 factory の責務 / primary 種別 / failure 条件、実装時確認可 = 実 selector / 実装関数名 / mode 分岐の細部、責務変更時は v1.3 仕様書更新対象(grep 微調整では済まない)を明記 |
| **Should Fix #6** P2→P0 統合の説明補足 | §3.6「v1.2 補足」(新規ブロック) | L0 §1.5 P2 区分(業務優先度)は **維持**(v1.2 で L0 を変更しない)、Stage 2a 検証実装範囲上の統合(API 拡張で対応可能になったため)であることを明文化、L0 更新時の優先順位(L0 が先)も明記 |
| **Nice to Have #3** factory 型定義を JSDoc | §4.3 冒頭(`shogi_assertions.js` 内 typedef)+ §3.2 `clickAndExpectChange.js` 冒頭(typedef 参照) | `ExpectedChangeFactory` typedef を `assertion` / `meta`(operation / primaryAssertions / primaryTypes / description / requiredPermissions?)/ `beforeClick?` / `afterClick?` で構造化、両ファイルから参照 |
| **回帰懸念 #1** API 高機能化で実装難度上昇 | §8 リスクと緩和(表に 1 行追加) | factory 形式を Stage 2a 標準化(§3.2 末尾ガイドライン)、helper 単体 → state 系 factory → clipboard/file/print 系の段階実装、Codex YAML(`factory_clipboard_print_supported` + `factory_required_permissions_validated`)で進捗観測 |
| **回帰懸念 #2** P2 を P0 統合で Stage 2a 範囲拡大 | §8 リスクと緩和(表に 1 行追加) | Stage 2a 完了条件を「P0 22 factory + 単体テスト + サンプル e2e 4 件」に限定(§6)、既存 spec 置換は Stage 2b 以降、clipboard/file/print 系は §4.3 で専用ブロックとして分離 |
| **回帰懸念 #3** raw callback の悪用余地で形式的 primary 再発 | §8 リスクと緩和(表に 1 行追加)+ §3.2 末尾ガイドライン + §6 Codex YAML | factory 必須 / `expect(...)` 必須 / Codex YAML 観測(`raw_callback_usage_count`)/ ChatGPT・Codex 独立レビューで P0 e2e の raw callback 使用箇所を重点確認 |

## 2. §10 Stage 2b 申し送り(SF#4/#5 移管)の妥当性

Should Fix #4(`roundConfirmed` の `isFinal` 自動判定)と Should Fix #5(`pairingsRegenerated` の `allowSameContent` 運用ルール)は **Stage 2a では決着せず、§10 Stage 2b 申し送り**に移管しました。理由は以下です。

### SF#4 を Stage 2b 送りにした理由

- **判定タイミングの問題**: `isFinal` の自動判定(案B)を採用するか手指定(案A)を維持するかは、Stage 2b の既存 spec 置換時の指定ミス頻度を見ないと判断できません。Stage 2a の helper 単体テスト + サンプル e2e の段階では実害が観測されないため、判断材料が不足
- **Stage 2a の実装影響**: v1.2 の `roundConfirmed(cls, options)` は手指定 `options.isFinal` で動作するため、Stage 2a 実装は止まらない。Stage 2b で案B 採用時は `options.isFinal` を後方互換として残す形でリファクタ可能
- **§10 で残した内容**: 案A / 案B の選択肢、判断基準(置換ミス頻度 / `state.rounds` 変更頻度)、後方互換の扱い

### SF#5 を Stage 2b 送りにした理由

- **テストデータ設計依存**: `allowSameContent` の運用ルール(原則 false / 理由必須記載 / テストデータ意図設計)は、Stage 2b で書く実テストの内容に依存します。Stage 2a 段階で運用ルールを正式化しても、空文の規範になりやすい
- **Stage 2a の実装影響**: v1.2 の `pairingsRegenerated(cls, { allowSameContent })` は既定 false で動作、Stage 2a の helper 単体 + サンプル e2e では `allowSameContent=true` を使わないため Stage 2a を止めない
- **§10 で残した内容**: 運用ルールの方向性、Codex YAML への観測項目追加(`allow_same_content_true_count`)、テストデータ設計ガイドラインの方向性

### 評価依頼

この 2 件の Stage 2b 送りは、A 判定の障害になりますか?それとも、Stage 2a 仕様書としては妥当な判断と認められますか?もし「これは Stage 2a で決着すべき」と判断する場合、その理由と最低限の修正案をください。

## 3. v1.2 の自己診断(残存リスク)

A 判定狙いなので、Claude.ai 自身が認識している残存リスクを開示します。

### R1:raw callback の悪用余地は規律で補強(完全機械保証ではない)

ChatGPT の SF#1 指摘どおり、`ctx.primary()` を呼ぶだけで `primaryCount` が増える構造は変わっていません。v1.2 では:

- factory 形式を P0 必須化(§3.2 末尾ガイドライン)
- raw callback 使用時は `ctx.primary()` 直後に `expect(...)` 必須(同上)
- Codex YAML で `raw_callback_usage_count` を観測(§6)
- §6 完了基準に「P0 e2e で raw callback がゼロ(grep 検証)」追加

これは **完全機械保証ではなく、書き手規律 + Codex 観測 + grep 検証 の 3 重防御** です。完全機械保証(`ctx.primaryAssert(description, fn)` のような assertion 一体化 API)を採用しなかった理由は、(a) raw callback の柔軟性を完全に殺すと探索的テストが書きにくくなる、(b) factory 形式が P0 必須化された時点で実害は構造的に抑えられる、の 2 点です。

**評価依頼**: この 3 重防御で A 判定の十分条件を満たしますか?それとも完全機械保証(API 一体化)が必要ですか?

### R2:`requiredPermissions` 検証の実態保証は §5.2 サンプル e2e 1 件のみ

v1.2 では `tournamentDataCopied` の `requiredPermissions` 検証を:

- §5.1 単体テスト: factory メタが `requiredPermissions` を持つことを確認
- §5.2 サンプル e2e: `context.grantPermissions(factory.meta.requiredPermissions)` を実行 → 実 clipboard 検証

の 2 段で実施します。ただし、**他に `requiredPermissions` を必要とする factory が出てきた場合の検証**は v1.2 の範囲外(将来 NH#1 で `selector / stage / priority` を追加する際の検討)です。

**評価依頼**: この実態保証で A 判定の十分条件を満たしますか?それとも将来 factory 追加時の検証パターンも今回明文化すべきですか?

### R3:v1.2 の行数増加(1,014 → 1,236 行、+222 行)

v1.2 では §10 新設、§5.2 e2e 追加、§3.6 補足、§3.4 分離、§4.3 typedef 等で +222 行。これは引き継ぎ時想定 +90 行の 2.5 倍です。実装範囲は変えていない(§1.2 OUT で SF#4/#5 を明示)が、仕様書の読み手負担は確実に増えています。

**評価依頼**: この長さは仕様書として妥当な範囲か?それとも一部を別文書に分離すべきか?

## 4. ChatGPT に評価・追加意見をもらいたい点(まとめ)

以下に答えてください:

1. **総合評価**: A / A- / B+ のいずれか
2. **吸収マトリクス §1 の各項目**(SF#1/#2/#3/#6 + NH#3 + 回帰懸念 3 件): 真に解決されているか / 形式的吸収にとどまっているか
3. **§2 SF#4/#5 の Stage 2b 送り**: A 判定の障害になるか / 妥当な判断か
4. **§3 R1〜R3 の残存リスク**: A 判定の十分条件を満たすか / 追加対策が必要か
5. **新たな指摘**: v1.1 にはなく v1.2 で生じた懸念(回帰)があれば指摘
6. **A 判定でない場合の最低修正**: 「これだけ直せば A」の最小修正リスト

### 観点別評価サマリ(あなたが v1.1 レビューで使った観点を踏襲)

- 観点 1(Must Fix #1 = primary assertion 機械保証): v1.2 で更に強化されたか / 既に十分か
- 観点 2(Must Fix #2 = clipboard/print/file の API 境界): v1.2 で `requiredPermissions` 構造化により実用化されたか
- 観点 3(§3.4 カタログ網羅): v1.2 で確定/実装時確認の分離により固定度が上がったか
- 観点 4(§4.3 factory コード品質): v1.2 で typedef 追加により可読性が上がったか / 一部 factory(`reportDownloaded` 3 モード等)の実装時確認は妥当か
- 観点 5(SF/NH 真の吸収): §1 マトリクスの吸収は形式的でなく実質か
- 観点 6(NH 吸収品質): NH#3 typedef は P0 22 factory 全体の可読性を実際に上げているか
- 観点 7(DevSecOps 段階 1 整合): v1.2 でも production code `shogi_v4.html` への変更ゼロが維持されているか
- 観点 8(v1.2 内部整合性): §3.4 表 #18 の注記と §4.3 #18 のコード(meta.requiredPermissions)が同期しているか / §3.6 P2=0 表記と §3.6 v1.2 補足の説明が矛盾していないか / §10 Stage 2b 申し送りと §1.2 OUT が整合しているか

## 5. 判定後の進め方

- **A 判定**: 軽微修正不要、Codex 独立レビュー → 実装着手へ
- **A- 判定**: 軽微修正(行数 +30 以内目標)を v1.3 として反映、再レビュー
- **B+ 以下**: 該当箇所を v1.3 として再構成、再レビュー

総合評価 + 6 点の評価 + 観点別サマリ + 修正提案を、引き続きこのキャッチボール形式で返してください。
````

## ChatGPT に貼り付ける本文(↑ここまで)

---

## Claude.ai のセルフ Devil's Advocate(本依頼文 v1 そのものへの自己チェック)

### 検出した問題と自己修正

- [観点 ②(文章必須/実態任意)] §1 マトリクスで「吸収しました」だけにせず、ファイル名/セクション/行番号(§3.2 末尾、§4.3 #18 等)を必ず添えた
- [観点 ③(章同士の矛盾)] §2 で SF#4/#5 を Stage 2b 送りにした理由を別建てで論じ、ChatGPT が「Stage 2a で決着すべき」と判断する可能性に対抗できる材料を提示
- [観点 ⑤(曖昧語)] 「軽微修正」を §5 で「行数 +30 以内目標」と具体化、「規律で補強」を §3 R1 で「3 重防御(書き手規律 + Codex 観測 + grep 検証)」と具体化
- [観点 ⑥(粒度)] §1 マトリクスを表形式で 8 行に整理、ChatGPT が「形式的か実質か」を即座に判定可能な粒度に
- [観点 ⑦(形式的記述)] 各吸収項目で「対応内容」列に行動を具体記述(「対応する」ではなく「対応した」)
- [観点 ⑧(将来破綻)] §5 判定後の進め方で A / A- / B+ の各分岐後アクションを明示

### 残存リスク

- §3 R1〜R3 で残存リスクを開示しているが、ChatGPT が R1 の「3 重防御」を不十分と判定して **完全機械保証(API 一体化)** を要求してくるリスクあり。その場合は v1.3 で `ctx.primaryAssert(description, fn)` 形式を導入する形になる(行数増加 +20 程度)
- §3 R3 で「+222 行は妥当か」と聞いているが、ChatGPT が「§10 を別文書に分離せよ」と要求してきた場合、Stage 2b 仕様書側に統合する形で対応(本仕様書から §10 を削除、Stage 2b 仕様書起草時に取り込む)

### ChatGPT に重点的に見てほしい箇所

- **§1 マトリクス各項目の「真の吸収か形式的吸収か」判定**:特に SF#1 raw callback の 3 重防御、SF#3 確定/実装時確認の境界
- **§2 §10 Stage 2b 申し送りの妥当性**:A 判定の主要分岐点
- **§3 R1〜R3 の残存リスク評価**:A 判定の十分条件確認

---

## 髙橋さんへの確認

このまま ChatGPT に投げて良いですか?

確認 1 つだけ:

- §3 R1〜R3 の残存リスク開示は「A 判定狙いだが、A- なら受容」の前提で書いています。**「A 以外不可」前提に強めるか、A- も受容のままで OK か** を教えてください。「A- も受容」なら、このまま投げます。

特になければ「OK」で進めます。
