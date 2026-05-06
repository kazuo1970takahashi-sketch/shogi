# ChatGPT 再レビュー依頼:shogi A-T Stage 2a 仕様書 v1.1

**作成日時**: 2026-05-06 09:23 JST
**配置先**: `docs/specs/20260506_0923_shogi_at_stage_2a_chatgpt_review_v1_1_prompt.md`
**対象 commit**: 76c38fa(Stage 2a 仕様書 v1.1、1,014 行、v1 から +710 / -310 行)

---

## ⚠️ ChatGPT への貼り付け方法

**下のコードブロック(```` で囲まれた部分)の中身を全選択コピーして ChatGPT にそのまま貼り付けてください。**

ファイル添付不要(GitHub 連携で直接読み取られます)。

---

## ChatGPT に貼り付ける本文(↓ここから)

````markdown
あなたは沼津支部月例将棋大会管理アプリ(shogi_v4)の業務ドメイン + Playwright Test の e2e テストインフラに精通した、独立メタレビュアです。Stage 2a 仕様書 v1(B+ 判定)に対して提示された Must Fix 2 件 + Should Fix 7 件 + Nice to Have 4 件すべてを v1.1 で吸収したと Claude.ai が主張しています。**真に吸収されたか / 形式的反映に留まっていないか** を厳しく評価してください。

## レビュー対象

リポジトリ: `kazuo1970takahashi-sketch/shogi`
ブランチ: `feat/phase-a-t-stage-2a-helpers`
主対象ファイル: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(commit 76c38fa、1,014 行)

差分: v1 → v1.1 で +710 / -310 行(ファイル全体の約 70% を書き換え)

## v1 → v1.1 主要変更点(Claude.ai の主張)

### Must Fix 反映(2 件)

- **Must Fix #1**:`clickAndExpectChange` API を **factory 形式 + ctx 形式併存** に拡張、`primaryAssertions >= 1` を機械検証(0 件で必ず赤)
- **Must Fix #2**:`options.beforeClick/afterClick` 追加、factory 内蔵の `beforeClick/afterClick` も自動拾い、`page` 引数追加 → clipboard/print/file 系を P0 で扱える

### Should Fix 反映(7 件)

- #1: `tournamentStarted` で A/B 両方の pairings 確認
- #2: `roundConfirmed(cls, options)` で `options.isFinal` 分岐
- #3: `pairingsRegenerated(cls, options)` で `options.allowSameContent` 緩和
- #4: `masterImported(options)` で expectedNewCount / existingMemberIds / tombstoneOrIds / schema_version の 4 要素分離検証
- #5: `tournamentDataCopied` の `meta.setupRequired` で permission 明示 + 完了基準にも追加
- #6: サンプル e2e に「正常系 1 + 異常系 2(空 expectedChange / 通知のみ)で必ず赤になる」を実装
- #7: 完了基準に「primaryAssertions=0 が必ず赤」を明記

### Nice to Have 反映(4 件)

- #1: `getStateSnapshot(page, options)` の DOM query option
- #2: hit-test 小要素対応(width<4px で中央 1 点のみ、重複点除去)
- #3: `stableStringify` + `expectStateChanged/Unchanged` ヘルパ新設(§3.7)
- #4: §6 末尾に Codex Yes YAML 仮定義

### 構造変更(P2 → P0 統合)

v1 では P2(印刷/ファイル選択/クリップボード)を Stage 2c 送りとしていたが、Must Fix #2 解決の API 拡張で P0 内に統合。Stage 2b/2c の作業が単純化。

## レビュー観点(必須 8 項目、前回 7 項目 + 新規観点 8)

### 観点 1:Must Fix #1 の真の解決(最優先)

§3.2 の `clickAndExpectChange` 実装で:

- factory 戻り値の場合、`expectedChange.meta.primaryAssertions >= 1` を機械検証する流れになっているか
- raw callback の場合、`ctx.primary()` 呼び出し回数を `primaryCount` で集計し、`>= 1` を検証する流れになっているか
- 両形式で **`primaryAssertions === 0` の場合、必ず例外が throw される** ことが §5.1 ヘルパ単体テスト + §5.2 サンプル e2e 異常系で証明されているか
- 「primary assertion を書き忘れ得ない」US-2a-1 の要件が**形式的反映ではなく実質的に保証**されているか

### 観点 2:Must Fix #2 の真の解決

§3.2 + §4.3 で:

- `options.beforeClick/afterClick` が `page` を受け取り、テスト側で spy 注入等の事前準備を実行できるか
- factory 戻り値に `beforeClick/afterClick` を内蔵でき、`clickAndExpectChange` 側で自動拾いされるか
- §4.3 の `tournamentDataCopied`(#18 clipboard)・`stateLoadedFromFile`(#20 ファイル選択)・`reportDownloaded`(#22 print/blob/anchor)が **実際にこの API で実装可能か**
- `getStateSnapshot(page, options)` に `page` を渡せる構造になっているか

### 観点 3:§3.4 カタログの 22 行が L0 §1.5 P0 を網羅し続けているか

v1 の §3.4 カタログ正確性問題が v1.1 でも継続して解決されているか:

- L0 §1.5 P0 の 19 操作 + サジェスト分割で 22 行が完備
- 各 primary assertion が `shogi_v4.html` の実装と整合している(grep 確認は Stage 2a 実装着手時に予定)
- Should Fix #1〜#4 の各反映(B クラス pairings / 最終ラウンド分岐 / ペアリング再生成緩和 / マスタインポート 4 要素分離)が assertion ロジックに正しく組み込まれているか

### 観点 4:§4.3 `shogi_assertions.js` の 22 factory コード品質

各 factory が `{ assertion, meta, beforeClick?, afterClick? }` 構造で:

- `meta.primaryAssertions >= 1` を持つ
- `meta.operation` が一意の文字列
- `meta.primaryTypes` が定義された値(state / state-master / clipboard / spy / localStorage / tab 等)
- `assertion(before, after, page)` のシグネチャが統一されている
- factory が必要とする setup(`beforeClick`)が internal に閉じている(テスト側の負担を最小化)
- 22 関数が**実装可能なコード**として記述されている(疑似コードレベルではない)

### 観点 5:Should Fix #1〜#7 の真の吸収(形式的でないか)

各 SF について:

- **SF #1 B クラス pairings**:`tournamentStarted` で `before.state.players.B.length >= 2` の条件で B の pairings を検証する条件分岐が現実的か(0 人 B クラス運用のケースを許容しているか)
- **SF #2 最終ラウンド分岐**:`options.isFinal` の使い分けがテスト側で迷わない設計か(誰がどう `isFinal` を判定して渡すのか)
- **SF #3 ペアリング再生成緩和**:`options.allowSameContent` をテスト側が指定する責任は妥当か / 自動判定すべきか
- **SF #4 マスタインポート分離**:4 要素(expectedNewCount / existingMemberIds / tombstoneOrIds / schema_version)を呼び出し側が網羅して指定するのは現実的か
- **SF #5 clipboard permission**:`meta.setupRequired` を文字列で明記しているが、これを **実装側でどう参照させる** 設計か(ドキュメント上の記述だけだと形式的)
- **SF #6 サンプル e2e 異常系**:§5.2 の 2 件目・3 件目が「空 expectedChange」「通知のみ」で**実際に赤になる**ことを try/catch で検証しているか
- **SF #7 完了基準**:§6 に「primaryAssertions=0 が必ず赤になる単体テスト + e2e テスト」が追加され、機械検証可能か

### 観点 6:Nice to Have #1〜#4 の吸収品質

- **NH #1**:`getStateSnapshot(page, options)` の DOM query option が、Stage 2b で P1 操作(モーダル開閉)に拡張可能な設計か
- **NH #2**:hit-test の小要素対応(width<4px)で正常な要素まで偽陽性で fail しないか / 重複点除去ロジックが妥当か
- **NH #3**:`stableStringify` の実装(§3.7)が、ネスト・配列・null・undefined を正しく扱えているか
- **NH #4**:Codex Yes YAML 仮定義が Stage 2a 完了判定に必要十分か

### 観点 7:DevSecOps v1.2.5 段階 1 自動マージ範囲との整合

v1.1 で扱う変更(test/helpers/ + test/e2e/sample/ のみ、production code `shogi_v4.html` 未変更)が、DevSecOps v1.2.5 §13 段階 1 自動マージ範囲(test/typo/docs)に該当することの根拠が妥当か。

### 観点 8(新規):v1.1 内部の整合性

v1 から v1.1 で +710 / -310 行と大幅変更したため、**v1.1 内部で矛盾が生じていないか**:

- §3.2 の API 仕様 と §4.3 の factory 実装コードが整合
- §3.4 カタログ表 と §4.3 factory のシグネチャが一致(関数名・引数・戻り値)
- §3.6 P0/P1/P2 表 と §1.2 スコープ表で「P2 を P0 に統合」が一貫して反映
- §5.1 ヘルパ単体テスト計画 と §6 完了基準の項目数が整合
- §0 改訂履歴 の v1.1 行が実際の変更を網羅
- §4.5 v1 → v1.1 吸収マッピング表 と本文各章の実態が一致(形式的に書いただけで本文に反映されていないものがないか)

## 評価基準

- **A**:そのまま v1.1 確定、Stage 2a 実装着手 OK、Codex 独立レビューに進める
- **A-**:軽微修正後に v1.1 確定可、実装着手 OK
- **B+**:Must Fix 1〜2 件、修正後に再レビュー(v1.2 化)
- **B**:Must Fix 3 件以上 or v1 から後退している点あり
- **C**:書き直し

## 出力フォーマット

```
## 総合評価
[A / A- / B+ / B / C]

## v1 → v1.1 進化の総括
[3 行程度で「v1.1 で何が解決され、何が残っているか」]

## 観点別評価サマリ
- 観点 1(Must Fix #1 の真の解決): [○/△/×] + 1 行
- 観点 2(Must Fix #2 の真の解決): [○/△/×] + 1 行
- 観点 3(§3.4 カタログ網羅): [○/△/×] + 1 行
- 観点 4(§4.3 factory コード品質): [○/△/×] + 1 行
- 観点 5(SF #1-#7 真の吸収): [○/△/×] + 1 行
- 観点 6(NH #1-#4 吸収品質): [○/△/×] + 1 行
- 観点 7(DevSecOps 段階 1 整合): [○/△/×] + 1 行
- 観点 8(v1.1 内部整合性): [○/△/×] + 1 行

## Must Fix(v1.1 確定前必須修正、あれば)
- [箇条書き、根拠付き、§番号引用]

## Should Fix(v1.2 化または Stage 2b 着手前)
- [箇条書き、対応 Stage を明記]

## Nice to Have(任意)
- [箇条書き]

## v1 → v1.1 で生じた新規懸念(回帰)
- [v1 にはなく v1.1 で混入した可能性のある問題、なければ「なし」]

## 良い点(v1.1 で改善された点)
- [箇条書き]

## 全体所感
[3〜5 行]

## Stage 2a 実装着手判断
[「即着手可」/「軽微修正後着手可」/「再レビュー必須」+ 1〜2 行の理由]
```

## 重要

- 本仕様書 v1.1 は v1 B+ レビューの全 13 件(Must Fix 2 + Should Fix 7 + Nice to Have 4)を吸収したと主張。**形式的に書いただけで実質的に解決されていないものがないか** を最優先で確認してください
- 特に Must Fix #1(primary assertion 必須化を機械保証)は Stage 2a の中核要件。§3.2 + §4.3 + §5.2 で**コードレベルで実装可能か** を厳しく評価してください
- v1 → v1.1 で大幅変更したため、v1.1 内部の整合性(観点 8)を必ず確認してください。表と本文の不一致、§4.5 マッピング表の形式的記述などを見つけたら指摘してください
- L0 業務モデル文書 v1.1(Must Fix 0 で確定済み、commit a5fda4a)との整合性も確認してください
````

## ChatGPT に貼り付ける本文(↑ここまで)

---

## Claude.ai のセルフ Devil's Advocate(本依頼文書そのもの)

### 検出した問題と自己修正

- [観点 ④(章同士の矛盾)] 観点 7 観点まで増やすと ChatGPT が読み切れない懸念 → 観点を 8 に絞り、各観点に 1 行のサマリ要求で集中度を保つ
- [観点 ⑤(曖昧語)] 「真に吸収」「形式的反映ではなく実質的」が抽象的 → 各観点で具体的なチェック項目(§番号 / コードレベル / 機械検証可能か)を明記
- [観点 ⑥(粒度)] ChatGPT が答えやすいよう、各観点で「○/△/×」+ 1 行を要求し、最後に Must/Should/NH の構造を明示
- [観点 ⑧(将来破綻)] v1 → v1.1 で大規模変更したため、v1.1 内部矛盾の検出が新規論点 → 観点 8 として独立追加

### 残存リスク

- ChatGPT が観点 1(Must Fix #1)を「形式的反映」で許容してしまうリスクが本依頼の最大リスク。これは ChatGPT の判断品質に依存し、依頼文書側で完全には防げない(対策:観点 1 で「コードレベルで実装可能か」「`primaryAssertions === 0` の場合に必ず例外 throw か」を明示的に要求)
- v1.1 が 1,014 行と長大化しており、ChatGPT がすべてを精読できないリスク。観点 8 で v1.1 内部矛盾を見つけてもらう設計だが、見逃しの可能性は残る

### ChatGPT に重点的に見てほしい箇所

- **§3.2 `clickAndExpectChange` 実装の `primaryCount` 検証ロジック**:Must Fix #1 の核心
- **§4.3 `shogi_assertions.js` の 22 factory コード**:Must Fix #2 の核心、特に #18 / #20 / #22 の clipboard/file/print 系
- **§4.5 v1 → v1.1 吸収マッピング表**:形式的に書いただけで本文に反映されていない可能性

---

## 髙橋さんへの確認

このまま ChatGPT に投げて良いですか?

確認 1 つ:

- **観点 8(v1.1 内部整合性)を新規追加**しました。v1 → v1.1 で大幅変更したため、内部矛盾検出を ChatGPT に明示的に依頼する観点です。これは前回(v1 レビュー時)には無かった観点。追加して OK ですか?

特になければ「OK」で進めます。
