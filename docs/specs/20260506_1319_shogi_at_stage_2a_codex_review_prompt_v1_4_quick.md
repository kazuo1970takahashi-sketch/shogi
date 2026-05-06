# Codex 独立 Quick Review 依頼:shogi A-T Stage 2a 仕様書 v1.4

**作成日時**: 2026-05-06 13:19 JST
**運用方式**: Codex Quick Review(Claude.ai 応答スタイル指針 + レビュー深度ポリシー v2026-05-06 改訂2 準拠)
**ベース**: `docs/specs/20260506_1218_shogi_at_stage_2a_codex_review_prompt_v1_3.md`(v1.3 用 Full Review、commit 0c96cb2)を v1.4 用 Quick Review に短縮

---

## 0. 本依頼の位置づけ

v1.3 用 Codex 独立再レビュー(commit 0c96cb2)で B+ 判定(Must Fix 2 + Should Fix 2 + Nice to Have 2)を受領。v1.4 でこれら 6 件を最小範囲(A 案、過剰品質ゲート回避)で吸収し、commit 260049e で main 反映済み。

本依頼は **Quick Review**: 前回 Codex 自身が指摘した 6 件の吸収を確認するのみ。新規 Should Fix / Nice to Have の提示は不要。Stage 進行(Stage 2a 実装着手)を止める問題のみ報告。

レビュー対象は引き続き **コードではなく仕様書**(PR 化前、実装着手前)。本依頼が通れば Stage 2a 実装着手フェーズへ進む。

---

## 1. レビュー対象

- リポジトリ: `kazuo1970takahashi-sketch/shogi`(private)
- ブランチ: `feat/phase-a-t-stage-2a-helpers`
- 対象 commit: **260049e**(Stage 2a 仕様書 v1.4 同名上書き、v1.3 → v1.4、+143/-18、net +125)
- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.4、1,484 行)

---

## 2. Codex への依頼テンプレート(コピペ用)

以下のコードブロック内側を全選択コピーして Codex に投入してください。

````markdown
GitHub `kazuo1970takahashi-sketch/shogi` の `feat/phase-a-t-stage-2a-helpers` ブランチ、commit **260049e** をレビューしてください(v1.3 commit db8d5ab → v1.4 commit 260049e、Quick Review 指定)。

## レビュー深度: Quick Review

**今回は Quick Review です。Must Fix のみ指摘してください。Should Fix / Nice to Have は原則不要です。Stage 進行(Stage 2a 実装着手)を止める問題だけ見てください。**

前回 v1.3 レビュー(commit 0c96cb2 投入)で出した B+ 判定(Must Fix 2 + Should Fix 2 + Nice to Have 2)の吸収状況のみ確認してください。観点 A〜F(v1.2 → v1.3 で評価済み)の再評価は不要。新規論点の提示も不要。

## 背景

A-4.2(commit 73961d3)で重大なリグレッション(A/B クラスボタンが実機で動作しないが、e2e 124 件・単体 595 件のテストが全 pass)が発生。Stage 1 完了レポートで「観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当」が主因と判明。

v1.3 にあなたが出した B+ 判定で、`stateLoadedFromFile` の confirm + FileReader 非同期 + alert の実体接続不足が指摘された。v1.4 で最小範囲(A 案、過剰品質ゲート回避)で吸収。stateLoaded(#19) / stateReset(#21) / masterImported(file 経由) の factory レベル対応は §10.4 Stage 2b 申し送りに移管(Stage 2a テスト側責任として §3.4 末尾に明記)。

## 確認してほしい観点(前回 Codex 指摘 6 件のみ)

### Must Fix 吸収

- **G-1. MF#1**(`stateLoadedFromFile` の実体接続): v1.4 §4.3 #20 で factory に `beforeClick`(dialog auto-accept で confirm + alert 受諾)+ `afterClick`(`page.waitForFunction` で `FileReader.onload` 完了 + state 反映待ち)追加。`description` を実体に合わせて更新。§5.2 サンプル e2e で実コード反映。前回指摘した「同期実行と書いているが実体は非同期」の問題を真に解決しているか
- **G-2. MF#2**(§3.4 表 #20 と §4.3 #20 の factory 署名不整合): v1.4 §3.4 表 #20 で `stateLoadedFromFile(filePath, expectedPlayersA, expectedPlayersB)` を `stateLoadedFromFile(expectedPlayersA, expectedPlayersB)` に修正。コードと整合しているか

### Should Fix 吸収

- **G-3. SF#1**(confirm-gated P0 操作一覧 + dialog handling 標準形): v1.4 §3.4 末尾に「confirm-gated P0 操作一覧」表(#17 / #19 / #20 / #21 の 4 操作 + 各 confirm/alert/非同期/disabled 有無)+ `setupDialogAutoAccept` 標準パターン + `waitForFunction` 非同期完了待ち標準形を追加。Stage 2a で factory レベル対応するのは #20 のみ、残り 3 件はテスト側責任 + §10.4 Stage 2b 申し送りに移管。前回指摘の「Stage 2b で factory を引けばゼロ介在で置換できる状態」への入口として十分か
- **G-4. SF#2**(§8 リスク行「現実装は同期」が実体と逆): v1.4 §8 リスク表で「現実装は同期」を「現実装は `FileReader.onload` で非同期、`waitForFunction` で完了待ち」に修正。stateLoaded/stateReset/masterImported(file) の dialog handling リスク行を追加。実体と整合しているか

### Nice to Have 吸収

- **G-5. NH#1**(§0 対象ブランチ行更新): v1.4 §0 ヘッダーで「現 HEAD 0c96cb2 = v1.3 用 Codex 再レビュー依頼追加」に更新済み
- **G-6. NH#2**(サンプル e2e で confirm/FileReader/alert/UI 反映の 5 段検証): v1.4 §5.2 サンプル e2e の `stateLoadedFromFile` 正常系コメントで 5 段(setInputFiles / dialog auto-accept / FileReader / alert / waitForFunction)を明示。Stage 2b 担当 AI の見本として十分か

## 出力形式

1. **総合判定**: A / A- / B+ / B / C
2. **観点別判定**: G-1〜G-6 を Yes / No / Partial で
3. **Must Fix**(マージ前必須):もしあれば箇条書き、§番号と問題箇所引用
4. **全体所感**(2〜3 行で簡潔に)

Should Fix / Nice to Have / 良い点 / 観点 A〜F 再評価は **出力不要**。

## 判定基準

- **A**: 実装着手可
- **A-**: 軽微修正(行数 +30 以内)後、実装着手可
- **B+**: Must Fix 1 件以上、修正後再レビュー
- **B**: Must Fix 複数 + 構造的問題、v1.5 起草必要

## DevSecOps 運用方針 v1.2 final + レビュー深度ポリシー v2026-05-06 準拠

ChatGPT v1.3 簡易確認は A 判定済み(参考情報、本 Quick Review では参照不要)。本依頼は A-T フェーズ最後の Full Review の延長(v1.4 = v1.3 への Codex MF/SF/NH 吸収のみ)であり、A-T 完了後は Stage 2b/2c/4 すべて Gate Review に切替の方針。本 Quick Review が A 判定なら Stage 2a 実装着手へ即進行。
````

---

## 3. 投入後の運用ルール

### Codex の判定別の進行

| 判定 | Claude.ai のアクション |
|---|---|
| A | Stage 2a 実装着手(Claude Code に実装依頼、ChatGPT v1.3 提示の最小追記 + ヘルパ選択注意 1 行を実装依頼書に組込) |
| A- | 軽微修正(+30 行以内)を v1.5 として反映、Codex に再 Quick Review 依頼 |
| B+ | Must Fix 反映方針を Claude.ai が立て、v1.5 起草、Codex に再 Quick Review 依頼 |
| B | Stage 2a 仕様書の構造的見直し(過剰品質ゲートの罠を再検討) |

### Codex への依頼運用ルール(20260505_2046 から踏襲)

1. Codex のレビュー結果は `docs/specs/` に反映記録は残さない(実装の git history で追跡)
2. Codex 判定が **A / A-** なら次の実装着手フェーズへ進行
3. Codex 判定が **B+ 以下** なら Claude.ai が Must Fix 反映方針を立てる(レビュー深度ポリシー上、もう 1 ラウンド回すかは過剰品質ゲート回避と相談)

---

## 4. 関連ファイル

- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.4、commit 260049e)
- v1.3 用 Codex 独立再レビュー依頼: `docs/specs/20260506_1218_shogi_at_stage_2a_codex_review_prompt_v1_3.md`(commit 0c96cb2、本依頼の派生元、B+ 判定受領済み)
- v1.3 用 ChatGPT 簡易確認依頼: `docs/specs/20260506_1206_shogi_at_stage_2a_chatgpt_review_prompt_v1_3.md`(commit e2701bf、A 判定維持受領済み)
- A-T 仕様書 v1.3: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- 本依頼文: `docs/specs/20260506_1319_shogi_at_stage_2a_codex_review_prompt_v1_4_quick.md`
