# ChatGPT メタレビュー依頼:shogi A-T Stage 2a 仕様書 v1

**作成日時**: 2026-05-06 07:58 JST
**配置先**: `docs/specs/20260506_0758_shogi_at_stage_2a_chatgpt_review_prompt.md`
**対象 commit**: 3031d6e(Stage 2a 仕様書 v1、614 行、新規)

---

## ⚠️ ChatGPT への貼り付け方法

**下のコードブロック(```` で囲まれた部分)の中身を全選択コピーして ChatGPT にそのまま貼り付けてください。**

ファイル添付不要(GitHub 連携で直接読み取られます)。

---

## ChatGPT に貼り付ける本文(↓ここから)

````markdown
あなたは沼津支部月例将棋大会管理アプリ(shogi_v4)の業務ドメイン + Playwright Test の e2e テストインフラに精通した、独立メタレビュアです。Stage 2a 着手前の仕様書品質を評価してください。

## レビュー対象

リポジトリ: `kazuo1970takahashi-sketch/shogi`
ブランチ: `feat/phase-a-t-stage-2a-helpers`
主対象ファイル: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(commit 3031d6e、614 行、新規)

## 関連参照(同ブランチ + main)

- `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`(A-T spec v1.3、上位仕様)
- `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`(Stage 1 完了レポート、本仕様書の根拠)
- `docs/specs/_business_model.md`(L0 業務モデル文書 v1.1、§1.5 P0 が本仕様書 §3.4 カタログの起点)
- `shogi_v4.html`(実装本体、約 3,800 行、本仕様書 §3.4 カタログの正確性根拠)
- 既存 e2e: `test/e2e/*.spec.js`(全 124 tests / 130 clicks)

## 関連参照(shogi-coach リポジトリ)

- `docs/specs/zero_bug_declaration_v1_2_5.md`(DevSecOps 運用方針 v1.2.5、§1.4 / §2.2 L4 が本仕様書の準拠基盤)

## コンテキスト

A-4.2(commit 73961d3)の「e2e は緑だが実機で動かない」リグレッション再発防止のため、A-T spec v1.3 で `expectClickable` + `clickAndExpectChange` の 2 ヘルパが設計された。Stage 1 完了レポートで「観点 2(クリック前検証不在)が e2e 130/130 = 100% 該当」が主因と特定。本仕様書(Stage 2a)はこの 2 ヘルパの実装と shogi 固有 primary assertion カタログ(L0 §1.5 P0 19 操作分)の整備を担う。

L0 業務モデル文書 v1.1 は ChatGPT 再レビュー A-(Must Fix 0)で確定しており、本 Stage 2a 仕様書はその上に構築されている。L0 v1.1 ChatGPT レビューで挙がった Should Fix #1(報告書 assertion 統一)・#2(pairings/results 用語整理)・#3(P0/P1/P2 Stage 適用範囲)を本仕様書 §3.4 / §3.6 / §4.4 で吸収済みと主張している。

## レビュー観点(必須 7 項目)

各観点について、根拠を引用しながら判定してください。

### 観点 1:A-T spec v1.3 §4 設計方針との整合

- 本仕様書 §3.1 expectClickable は A-T spec v1.3 §4.2 の 7 段階検証を完全に転記しているか
- 本仕様書 §3.2 clickAndExpectChange は A-T spec v1.3 §4.3.2 の 5 ステップを正しく実装しているか
- 本仕様書 §3.3 primary assertion 必須化は A-T spec v1.3 §4.3.3〜§4.3.6 と整合しているか
- 本仕様書 §3.5 新規操作追加ルールは A-T spec v1.3 §4.3.8 と一致しているか

### 観点 2:§3.4 shogi 固有 primary assertion カタログの正確性

- 本仕様書 §3.4 の 22 行(L0 §1.5 P0 19 操作 + サジェスト分割で 22)が L0 §1.5 P0 を網羅しているか
- 各 primary assertion が `shogi_v4.html` の実装と整合しているか(grep で要確認:特に #6 対局開始の `state.started` / `activeTab`、#9 ラウンド確定の `state.results[cls].length`、#10 ペアリング再生成の `state.pairings` / `state.results` 不変、#12 過去対局勝者変更の `state.results[cls][rr][mm].winner`、#16 マスタ論理削除の `master.members[].deleted` / `deleted_at`、#21 リセットの localStorage キー削除範囲)
- A-T spec v1.3 §4.3.7 の 8 操作からの拡張漏れがないか

### 観点 3:§4.3 `shogi_assertions.js` の実装可能性

- 22 関数のシグネチャが Playwright Test の `expectedChange(before, after)` 仕様と整合しているか
- `before` / `after` のスナップショット構造(`getStateSnapshot` の戻り値:`state` / `master` / `localStorage` / `url` / `activeTab`)を正しく参照しているか
- カリー化されたファクトリ関数(例:`participantAdded(cls)` が assertion 関数を返す)の使用パターンが Stage 2b で実用的か
- #18 `tournamentDataCopied` の clipboard 検証(`page.evaluate(() => navigator.clipboard.readText())`)が Playwright の context permission 設定で動くか
- #22 `reportDownloaded` の 3 モード(window-print / pdf-blob / anchor-download)の実装方式判定タイミング(Stage 2a 着手時)が現実的か

### 観点 4:Stage 2b/2c への接続性

- 本仕様書 §3.4 のカタログが Stage 2b で `shogi_app_a4_2.spec.js` を置換する際の辞書として十分か
- Stage 1 レポート §4.2「完全書き直し 4 件」(showMsg のみ 1 件 + `syncBranchMasterOnSave()` 直接呼出 3 件)に対応する assertion がカタログに含まれているか
- §3.6 の P0/P1/P2 Stage 適用範囲表が Stage 2b/2c の作業見積に使えるか

### 観点 5:Should Fix #1〜#3 の吸収品質

- SF #1(報告書 assertion 統一):§3.4 #22 + §4.3 `reportDownloaded` の 3 モード対応が、L0 v1.1 §1.5 P0 #19(「PDF Blob URL 生成または anchor download 属性発火」)と P2(「window.print spy または PDF Blob 生成」)の二重化を解消しているか
- SF #2(pairings/results 用語整理):§3.4 #9/#10/#12 で「pairings = 現在ラウンド未確定、results = 確定済み履歴、`results[cls].length` = 確定済みラウンド数、repairBtn は pairings のみ、過去対局編集は results を変更」が一貫して反映されているか
- SF #3(P0/P1/P2 Stage 適用範囲):§3.6 の表が Stage 2a/2b/2c の境界を明確にしているか、Stage 2a での P0 集中・P1/P2 後送りが妥当か

### 観点 6:§5 テスト計画の妥当性

- §5.1 ヘルパ単体テスト(15+ 件)が A-4.2 型偽陽性パターン(`pointer-events: none` で `onClick` 直接発火)を `expectClickable` が確実に赤にすることを証明できる構成か
- §5.2 サンプル e2e 2 件が「primary assertion ありなしの判定動作確認」として十分か(特に「primary assertion なしテスト」が "ヘルパは何もしない仕様" の文書化として妥当か、それとも別の検証方法が必要か)

### 観点 7:§6 完了基準の機械検証可能性

- 完了基準 10 項目が客観的に判定可能か(grep / テスト件数 / Codex レビュー等で機械検証できるか)
- DevSecOps v1.2.5 §13 段階 1 自動マージ範囲(test/typo/docs)に該当する根拠が妥当か(production code `shogi_v4.html` への変更なし、test/ 配下のみ)

## 評価基準

- **A**:そのまま v1 確定可、Stage 2a 実装着手 OK
- **A-**:軽微修正後に v1 確定可、実装着手 OK
- **B+**:Must Fix 1〜2 件、修正後に再レビュー推奨
- **B**:Must Fix 3 件以上 or 構造的問題あり
- **C**:仕様書を書き直す必要あり

## 出力フォーマット

```
## 総合評価
[A / A- / B+ / B / C のいずれか]

## 観点別評価サマリ
- 観点 1(A-T spec v1.3 整合): [○/△/×] + 1 行
- 観点 2(§3.4 カタログ正確性): [○/△/×] + 1 行
- 観点 3(§4.3 実装可能性): [○/△/×] + 1 行
- 観点 4(Stage 2b/2c 接続性): [○/△/×] + 1 行
- 観点 5(SF #1-#3 吸収品質): [○/△/×] + 1 行
- 観点 6(§5 テスト計画): [○/△/×] + 1 行
- 観点 7(§6 完了基準): [○/△/×] + 1 行

## Must Fix(v1 確定前必須修正)
- [箇条書き、根拠付き、引用付き(§番号 or 行番号)]

## Should Fix(推奨修正、Stage 2b/2c 着手前 or v1.1 で対応可)
- [箇条書き、対応 Stage を明記]

## Nice to Have(任意)
- [箇条書き]

## 良い点
- [箇条書き]

## 全体所感
[3〜5 行]

## Stage 2a 実装着手判断
[「即着手可」or「Must Fix 反映後に着手可」or「再レビュー必須」+ 1〜2 行の理由]
```

## 重要

- DevSecOps v1.2.5 §1.4 / §2.2 L4 / §13.4 に準拠した観点でレビュー
- 本仕様書の §3.4 カタログは Stage 2b で実テストに直接使われるため、**実装(`shogi_v4.html`)との整合性を最優先**で確認
- 特に §4.3 のコード(22 関数)が Playwright Test の API と整合しているかを厳しく評価
- L0 v1.1 ChatGPT レビューの Should Fix #1〜#3 が真に吸収されているか(形式的反映ではなく実質的に解決されているか)を確認
````

## ChatGPT に貼り付ける本文(↑ここまで)

---

## レビュー後のフロー(人間用メモ、ChatGPT には渡さない)

1. ChatGPT から評価が返る
2. **A 判定** → 即 Codex 独立レビュー or 実装着手
3. **A- 判定** → Must Fix を v1 内で反映(commit 追加)→ Codex レビュー → 実装着手
4. **B+ 判定** → 仕様書を v1.1 として Must Fix 反映 → 再 push → 再レビュー
5. **B 以下** → Claude.ai に戻して仕様書再構築

## 関連ファイル

- 本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(commit 3031d6e)
- 本プロンプト: `docs/specs/20260506_0758_shogi_at_stage_2a_chatgpt_review_prompt.md`
