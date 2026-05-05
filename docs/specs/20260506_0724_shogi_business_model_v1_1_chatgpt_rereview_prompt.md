# ChatGPT 再レビュー依頼:shogi L0 業務モデル文書 v1.1

**作成日時**: 2026-05-06 07:24 JST
**配置先**: `docs/specs/20260506_0724_shogi_business_model_v1_1_chatgpt_rereview_prompt.md`
**対象 commit**: a5fda4a(v1.1、395 insertions / 168 deletions、最終 約 720 行)
**前回レビュー**: B+(v1.0、commit 6335c2b、Must Fix 2 件 + Should Fix 7 件 + Nice to Have 3 件指摘)

---

## ⚠️ ChatGPT への貼り付け方法

**下のコードブロック(``` で囲まれた部分)の中身を全選択コピーして ChatGPT にそのまま貼り付けてください。**

ファイル添付・GitHub URL 案内は不要(GitHub 連携で直接読み取られます)。

---

## ChatGPT に貼り付ける本文(↓ここから)

````markdown
あなたは沼津支部月例将棋大会管理アプリ(shogi_v4)の業務ドメインに精通した、独立レビュアです。本依頼は v1.1 への再レビューです。前回 v1.0 は B+ 判定で、Must Fix 2 件 + Should Fix 7 件 + Nice to Have 3 件の指摘を受けています。それらが v1.1 で適切に反映されているかを判定してください。

## レビュー対象

リポジトリ: `kazuo1970takahashi-sketch/shogi`
ブランチ: `feat/phase-a-t-test-hardening`
主対象ファイル: `docs/specs/_business_model.md`(commit a5fda4a、v1.1)
比較対象: 同ファイルの commit 6335c2b(v1.0、前回レビュー時点)
diff: 395 insertions / 168 deletions

## 関連参照(同ブランチ)

- `docs/specs/20260506_0045_shogi_at_spec_v1_3.md`(A-T 仕様書 v1.3)
- `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`(Stage 1 完了レポート)
- `shogi_v4.html`(実装本体)
- `docs/specs/20260506_0657_shogi_business_model_chatgpt_review_prompt.md`(前回 v1.0 レビュー依頼プロンプト、参考)

## 関連参照(shogi-coach リポジトリ)

- `docs/specs/zero_bug_declaration_v1_2_5.md`(DevSecOps 運用方針 v1.2.5)

## 前回 v1.0 で指摘された Must Fix(v1.1 で反映必須)

### Must Fix #1: §4.2 state スキーマが実装と一致していない

v1.0 では `currentRound` / `rep` / `players[].yomi` を含むスキーマを記述していたが、実装(`shogi_v4.html` line 204、`normalizeState()` L286)では `rounds` / `report` / `member` / `grade` / `tournament_id` 構造であった。

### Must Fix #2: §1.4 UI 重要操作カタログが Stage 2a 起点として不足

v1.0 では 11 操作のみ。リセット、読み込みモーダル起動、過去参加者パネル開閉、対戦相手変更、過去対局編集、名前一括編集、マスタインポート実行、削除済み表示切替などが漏れていた。Stage 2a の `clickAndExpectChange` 起点として不十分。

## 前回 v1.0 で指摘された Should Fix(v1.1 で反映可能なら反映)

1. §7 不変条件に参加費・report・読み込み正規化系の Contract 追加
2. §2 ジャーニーに受付時の参加費・会計確認を明示
3. §2.2 BYE 方針について実装・運用との統一(奇数前段ブロック vs BYE 自動処理)
4. §3 のタブ構成で共通ヘッダー操作(saveBtn/loadBtn/resetBtn)を別枠化
5. §5 フィールド一覧に player の member/grade UI を明示
6. §6 データフローにマスタ追加・編集・削除・インポートを追加
7. §9.3 更新トリガーに UI 重要操作・primary assertion・不変条件変更を明示

## 前回 v1.0 で指摘された Nice to Have(v1.1 で反映可能なら反映)

1. §1.4 UI 重要操作に優先度 P0/P1/P2 を付与
2. §7 不変条件に検証方法列を追加
3. §4.4 player ⇄ master 連携に member_id 欠損時の扱いを追加
4. §8.2 永続見送りに BYE 方針との関係を追記

## 今回 v1.1 の起草者の主張(Claude.ai)

v1.1 では Must Fix 2 件 + Should Fix 7 件 + Nice to Have 主要 3 件(#1, #2, #3)を反映したと主張している。実装根拠は `shogi_v4.html` の grep 出力(state 初期化 L204、normalizeState L286、getFee L235、calcTotal L240、奇数ブロック L2709-2710、共通ヘッダー L89、localStorage キー L213-214/L364)で確定。

## レビュー観点(必須 4 項目)

各観点について、根拠を引用しながら判定してください。

### 観点 1: Must Fix 2 件の反映品質

- §4.2 state スキーマが実装(line 204、normalizeState L286)と完全に一致しているか
- §1.5 UI 重要操作カタログが P0/P1/P2 3 層に再編され、漏れていた操作(リセット、読み込みモーダル、対戦相手変更、過去対局編集、マスタインポート等)が網羅されているか
- 反映の質に妥協がないか(例:形式的に書いただけで実装と齟齬が残っていないか)

### 観点 2: Should Fix 7 件の反映状況

- 7 件中、何件が反映されたか
- 反映されていない項目があれば、その理由が文書に明記されているか
- 反映の質は十分か

### 観点 3: 新たな問題の混入

v1.0 → v1.1 で新たに追加された記述(参加費表 §1.4、player 正規化コード §4.2、INV-FE/RP/ST §7.5-7.7 等)の中に、実装と齟齬する記述や論理矛盾が無いか。

### 観点 4: Stage 2a 着手判断

v1.1 が `expectClickable` + `clickAndExpectChange` ヘルパ実装の起点として十分な品質に到達したか。primary semantic assertion カタログ(§1.5 P0)、Contract Testing 起点(§7 検証方法列)、業務フロー(§2)、データモデル(§4.2)が一貫しているか。

## 評価基準

- **A**: そのまま v1.1 確定可、Stage 2a 即着手 OK
- **A-**: 軽微修正後に v1.1 確定可、Stage 2a 着手 OK
- **B+**: Must Fix 1〜2 件あり、修正後に再レビュー推奨
- **B**: Must Fix 3 件以上 or 構造的な問題あり
- **C**: 文書を書き直す必要あり

## 出力フォーマット

```
## 総合評価
[A / A- / B+ / B / C のいずれか]

## v1.0 → v1.1 反映状況サマリ
- Must Fix 反映: [2/2 完全反映 / 部分反映 / 未反映 のいずれか + 理由]
- Should Fix 反映: [N/7 反映、未反映項目とその扱い]
- Nice to Have 反映: [N/4 反映]

## Must Fix(v1.1 確定前必須修正)
- [新たに発見した必須修正、根拠付き]

## Should Fix(推奨修正、v1.2 で対応可)
- [箇条書き、根拠付き]

## Nice to Have(任意)
- [箇条書き]

## 良い点
- [v1.1 で改善された点を中心に]

## 全体所感
[3〜5 行]

## Stage 2a 着手判断
[「即着手可」or「Must Fix 反映後に着手可」or「再レビュー必須」+ 1〜2 行の理由]
```

## 重要

- DevSecOps v1.2.5(特に §1.4 / §2.2 / §13.4)に準拠した観点でレビュー
- v1.0 の指摘がきちんと反映されたかを最優先で評価
- 反映されていない指摘があれば、文書内で「今回見送り、理由は〜」と明記されているかも確認
- Stage 2a で実装される `clickAndExpectChange` の primary assertion 起点として §1.5 P0 が機能するかを厳しく評価
````

## ChatGPT に貼り付ける本文(↑ここまで)

---

## レビュー後のフロー(人間用メモ、ChatGPT には渡さない)

1. ChatGPT から評価が返る
2. **A 判定** → 即 main マージ判断 → Stage 2a ヘルパ実装の Claude Code キックオフへ
3. **A- 判定** → Must Fix を v1.1 内で反映(commit 追加)→ main マージ → Stage 2a 着手
4. **B+ 判定** → 文書を v1.2 として Must Fix 反映 → 再 push → 再々レビュー
5. **B 以下** → Claude.ai に戻して文書再構築

## 関連ファイル

- 本体: `docs/specs/_business_model.md`(commit a5fda4a)
- v1.0 レビュー依頼: `docs/specs/20260506_0657_shogi_business_model_chatgpt_review_prompt.md`
- 本プロンプト: `docs/specs/20260506_0724_shogi_business_model_v1_1_chatgpt_rereview_prompt.md`
