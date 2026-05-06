# Codex 独立 Quick Review 依頼:shogi A-T Stage 2a 仕様書 v1.5

**作成日時**: 2026-05-06 15:01 JST
**運用方式**: Codex Quick Review(Claude.ai 応答スタイル指針 + レビュー深度ポリシー v2026-05-06 改訂2 準拠)
**ベース**: `docs/specs/20260506_1319_shogi_at_stage_2a_codex_review_prompt_v1_4_quick.md`(v1.4 用 Quick Review、commit edca3e5)を v1.5 用に派生

---

## 0. 本依頼の位置づけ

v1.4 用 Codex Quick Review(commit edca3e5)で A 判定を取得し、Stage 2a 実装に進んだ。Stage 2a 実装(commit 7afd060、全 438 件緑)で 5 件の spec 見落としが発覚し、v1.5 で spec→実装の同期反映を行った(commit de70dc1)。

本依頼は **v1.5 の Quick Review**: 実装(commit 7afd060)で動作確認済みの 5 件が v1.5 spec に正確に同期反映されているかの確認のみ。新規 Should Fix / Nice to Have の提示は不要。Stage 進行(A-T Stage 2a 完了宣言)を止める問題のみ報告。

---

## 1. レビュー対象

- リポジトリ: `kazuo1970takahashi-sketch/shogi`(private)
- ブランチ: `feat/phase-a-t-stage-2a-helpers`
- 対象 commit: **de70dc1**(Stage 2a 仕様書 v1.5 同名上書き、v1.4 → v1.5、+100/-17、net +83)
- 関連 commit: **7afd060**(Stage 2a 実装、全 438 件緑、本 v1.5 はこの実装と spec の同期を取った)
- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.5、1,567 行)

---

## 2. Codex への依頼テンプレート(コピペ用)

以下のコードブロック内側を全選択コピーして Codex に投入してください。

````markdown
GitHub `kazuo1970takahashi-sketch/shogi` の `feat/phase-a-t-stage-2a-helpers` ブランチ、commit **de70dc1** をレビューしてください(v1.4 commit 260049e → v1.5 commit de70dc1、Quick Review 指定)。

## レビュー深度: Quick Review

**今回は Quick Review です。Must Fix のみ指摘してください。Should Fix / Nice to Have は原則不要です。Stage 進行(A-T Stage 2a 完了宣言)を止める問題だけ見てください。**

v1.4 用 Quick Review(commit edca3e5)で A 判定を取得し、Stage 2a 実装に進んだ。実装(commit 7afd060、全 438 件緑)で 5 件の spec 見落としが発覚し、v1.5 で spec→実装の同期反映を行った。本依頼は **5 件が正確に同期反映されているかの確認のみ**。観点 A〜G(過去レビューで評価済み)の再評価は不要。新規論点の提示も不要。

## 背景

A-4.2(commit 73961d3)で重大なリグレッション(A/B クラスボタンが実機で動作しないが、e2e 124 件・単体 595 件のテストが全 pass)が発生。Stage 1 完了レポートで「観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当」が主因と判明。

v1.4 spec で実装着手 → Stage 2a 実装(commit 7afd060)で全 438 件緑。実装中に shogi_v4.html の以下を発見、v1.5 で spec に同期反映:

- shogi_v4.html の button が `border-radius: 8px` で hit-test inset=2 が角座標を親要素にヒットさせる
- about:blank / page.setContent ページで localStorage が SecurityError
- saveData() の `clipboard.writeText().then(() => alert(...))` 非同期構造
- syncBranchMasterOnSave() が新規 player に member_id を補完する production mutation

## 確認してほしい観点(Stage 2a 実装→v1.5 spec 同期 5 件のみ)

### 観点 H: Stage 2a 実装(commit 7afd060)→ v1.5 spec 同期の正確性

- **H-1**(§3.1 段階 0 `scrollIntoViewIfNeeded` timeout + try/catch): v1.5 §3.1 段階 0 のコード + コメントで `try { await locator.scrollIntoViewIfNeeded({ timeout: 1000 }); } catch (e) {}` が反映されているか。display:none 要素で auto-wait が hang しないことの理由がコメントで明示されているか
- **H-2**(§3.1 段階 6 hit-test の inset 動的計算): v1.5 §3.1 段階 4 styles に `borderRadius` 追加 + 段階 6 で `Math.max(2, Math.ceil(br * 0.35))` の計算が反映されているか。spec の固定 inset=2 が border-radius >= 4px の要素で角座標を親要素にヒットさせる根拠と、円弧 (1 - 1/√2) ≈ 0.293 から 0.35 倍を選んだ根拠がコメントで明示されているか
- **H-3**(§4.1 `getStateSnapshot.js` の localStorage 個別 try/catch): v1.5 §4.1 ファイル配置注記で「v1.5 で localStorage 個別 try/catch」追記されているか。実装ファイル `getStateSnapshot.js` で各キー(`shogi_v4` / `shogi_branch_master` / `shogi_v3`)が個別に `try { ... } catch (e) { return null; }` でラップされていることが spec から読み取れるか(spec 本文の意図伝達 + 実装の整合性)
- **H-4**(§4.3 #18 `tournamentDataCopied` factory に beforeClick + polling 反映): v1.5 §4.3 #18 で `beforeClick`(`page.on('dialog', d => d.accept())` で alert auto-accept)+ `assertion` 内で `for (let i = 0; i < 40; i++) { ... await page.waitForTimeout(50); }` の clipboard polling 待ちが反映されているか。`saveData()` の `writeText().then(alert)` 非同期構造への対応理由がコメントで明示されているか
- **H-5**(§4.3 #18 比較対象を `before.state.players` → `after.state.players`): v1.5 §4.3 #18 assertion で `expect(parsed.players).toEqual(after.state.players)` が反映されているか。`syncBranchMasterOnSave()` の production mutation が理由としてコメントで明示されているか

### 観点 I: 派生する内部整合性

- **I-1**(§4.9 新設マトリクスの内容整合): v1.5 §4.9 の Stage 2a 実装→spec 同期マトリクス 5 件が、観点 H-1〜H-5 と完全に対応しているか。漏れ・重複なし
- **I-2**(§10.5 Stage 2b 申し送りの妥当性): v1.5 §10.5 で「他 factory(#22 reportDownloaded / #19 stateLoaded / #9-10 等)での同種パターン(非同期 + DOM mutation)再発リスク」+ Stage 2b 置換時の標準対応手順(production 関数本体確認 → 非同期/mutation/dialog 検出 → factory 修正パターン適用)が示されているか。Stage 2b 担当が見て対応可能な粒度か
- **I-3**(§0 改訂履歴 v1.5 行と本文の整合): v1.5 §0 改訂履歴 v1.5 行に列挙された 5 件 + §4.9 + §10.5 が、本文 §3.1 / §4.1 / §4.3 #18 / §4.9 / §10.5 と一致しているか

## 出力形式

1. **総合判定**: A / A- / B+ / B / C
2. **観点別判定**: H-1〜H-5 / I-1〜I-3 を Yes / No / Partial で
3. **Must Fix**(マージ前必須):もしあれば箇条書き、§番号と問題箇所引用
4. **全体所感**(2〜3 行で簡潔に)

Should Fix / Nice to Have / 良い点 / 観点 A〜G 再評価は **出力不要**。

## 判定基準

- **A**: A-T Stage 2a 完了宣言可、Stage 2b 着手準備フェーズへ
- **A-**: 軽微修正(行数 +20 以内)後、A-T Stage 2a 完了宣言可
- **B+**: Must Fix 1 件以上、修正後再 Quick Review

## DevSecOps 運用方針 v1.2 final + レビュー深度ポリシー v2026-05-06 準拠

本依頼は A-T フェーズ最後のレビュー(v1.5 = 実装→spec 同期のみ)であり、A 判定なら A-T Stage 2a 完了宣言 → Stage 2b 着手準備フェーズへ移行(Stage 2b 以降は原則 Gate Review)。
````

---

## 3. 投入後の運用ルール

### Codex の判定別の進行

| 判定 | Claude.ai のアクション |
|---|---|
| A | A-T Stage 2a **完了宣言**(本ブランチを main へ PR、または継続作業)、Stage 2b 着手準備(L0 §1.5 P1 整備、A-4.2 関連 e2e 7 件置換等) |
| A- | 軽微修正(+20 行以内)を v1.6 として反映、Codex に再 Quick Review 依頼 |
| B+ | Must Fix 反映方針を Claude.ai が立て、v1.6 起草、Codex に再 Quick Review 依頼 |

### 過剰品質ゲート回避原則

本依頼で B+ 以下が出た場合も、Stage 2a 実装は既に動作確認済み(全 438 件緑)。Must Fix が「実装と乖離する spec 表記」のみなら v1.6 で表記修正のみ、実装変更は不要。

---

## 4. 関連ファイル

- 仕様書本体: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(v1.5、commit de70dc1)
- v1.4 用 Codex Quick Review 依頼: `docs/specs/20260506_1319_shogi_at_stage_2a_codex_review_prompt_v1_4_quick.md`(commit edca3e5、A 判定受領済み、本依頼の派生元)
- Stage 2a 実装 commit: 7afd060(全 438 件緑、本 v1.5 spec の元)
- A-T 仕様書 v1.3: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- 本依頼文: `docs/specs/20260506_1501_shogi_at_stage_2a_codex_review_prompt_v1_5_quick.md`
