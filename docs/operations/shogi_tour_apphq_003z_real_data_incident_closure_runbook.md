# SHOGI-TOUR-APPHQ-003Z｜実データ混入対応 全体収束Runbook

## 1. 目的

本 Runbook は、SHOGI-TOUR に混入した実データ確定 JSON、および実データ由来に見える期待値を含む E2E spec について、**通常 PR で直接削除・置換すると diff 上に実値または実値由来に見える情報が露出する** 問題が判明したことを受け、今後の対応を **収束** させるための全体方針・実行順序・禁止事項・Done 条件を統合する文書である。

本 Runbook は docs-only であり、以下は今回行わない。

- 対象 JSON / E2E spec / fixture / アプリ本体 / CI / GitHub Pages の変更
- 過去 No Go PR の diff 表示
- 実データ由来に見える具体値（氏名・地域・読み・固定日付・件数・クラス分布など）の再掲

## 2. 現在判明している危険資産

具体値は本文書に出さない。資産単位の抽象記述のみ。

| ID | 資産 | リスクの本質 | 通常 PR 適用可否 |
|---|---|---|---|
| **A** | `data/import/20260412_participants.json` | 実データ確定 JSON。通常削除 PR では削除 diff に本文が出る可能性がある。 | **通常 PR で削除・置換しない** |
| **B** | `test/e2e/shogi_phase2_import.spec.js` | 実データ由来に見える期待値（人名・地域・読み・固定日付などのリテラル）を含む。通常編集 PR では削除行に旧値が出る可能性がある。 | **通常 PR で編集・置換・削除しない** |
| **C** | Git 履歴 | 資産 A の導入履歴が残っている可能性。履歴に対するアクションは Level 4。 | 通常 PR では扱わない |
| **D** | GitHub Pages / 公開系 | main merge が公開に影響し得る。公開面のリスク評価が未実施。 | 通常 PR では扱わない |
| **E** | PR diff / PR コメント / レビューコメント / docs | 具体値の引用そのものが露出経路になる。件数・クラス分布・固定日付の具体値も再掲不可。 | docs / コメントでも **具体値再掲は不可** |

## 3. 通常 PR でやってよいこと / いけないこと

### やってよいこと

- 新規 docs 追加（本 Runbook と同性質のもの）
- 新規 synthetic fixture 追加（**§3.1 の許可条件を満たす場合に限る**）
- 新規 synthetic 専用 E2E spec 追加
- 既存危険ファイルに **触れない追加作業**
- 抽象化された Runbook / 設計文書の作成

### 3.1 新規 synthetic fixture 追加の許可条件

新規 synthetic fixture の追加は、以下をすべて満たす場合のみ許可する。

- 実データ由来の **匿名化・仮名化を使わない**（最初から機械的に生成した synthetic のみ）。
- 実データの **件数** に寄せない（特定の総数の再現になるような件数調整をしない）。
- 実データの **クラス分布** に寄せない（特定の A/B 比率の再現になるような分布調整をしない）。
- 実データの **固定日付** に寄せない（実大会日付・実運用日付・特定の `YYYY-MM-DD` への一致を狙わない）。
- 値は機械的・連番的・完全架空（例: `Fixture User NNN` / `Dummy City NNN` 形式の方針に従う）。
- 実データに似せるための件数調整・分布調整・日付調整を **行わない**。
- もし validator / expected values の都合で実データ形状に寄せたくなった場合は、**fixture 側を寄せず**、**validator / expected values 分離タスク（003D-4F）** へ戻す。fixture 側で帳尻を合わせると本 Runbook の前提が崩れる。

### やってはいけないこと

- 実データ JSON の通常削除 PR
- 実データ JSON の通常置換 PR
- 旧 E2E spec の通常編集 PR
- 旧 E2E spec の削除 PR
- 旧期待値リテラルを含む行の通常 diff
- 具体件数・具体クラス分布・固定日付の具体値の再掲（docs / commit message / PR 本文 / PR コメント / レビューコメントすべて）
- PR コメントでの実値・旧値の引用

## 4. 今後の推奨戦略

### 短期

- **旧ファイルを触らない**（資産 A / B を通常 PR で開かない・編集しない・削除しない）
- 新規 synthetic 専用 E2E を追加する
- 新規 E2E は **完全架空 fixture のみ** を参照する
- 既存旧 E2E spec は通常 PR では触らない

### 中期

- CI で旧 E2E をどう扱うかを **diff-safe に設計** する
- validator / expected values を synthetic 向けに分離する
- `shogi_v4.html` 変更が必要な場合は別 PR・Level 3 以上で扱う

### 長期

- 実データ JSON と旧 E2E spec を含む **履歴対応要否を判断** する
- clean tree / orphan branch / 公開系分離 / GitHub Pages 設定変更を検討する
- 実データ非含有 tree への移行を検討する

## 5. 推奨実施順

### Phase 1：安全な新系統を追加

1. **003D-4D**：synthetic 専用 E2E 新設設計
2. **003D-4D-1**：synthetic 専用 E2E 新規追加（実装）
3. **003D-4F**：validator / expected values 分離設計
4. 必要なら **003D-4F-1**：synthetic 用 validator 実装

### Phase 2：旧系統の実行停止を diff-safe に検討

5. **003D-4E**：旧 E2E を CI 対象から外す diff-safe 方式検討
6. **003D-4E-1**：CI 対象変更または safe discovery 方式実装

> **情報露出範囲の事前定義（003D-4E / 003D-4E-1 共通）**
>
> CI 対象変更は、旧 spec 本文だけでなく、**PR diff・PR コメント・レビューコメント・CI config 差分（`.github/workflows/*` / `playwright.config.js` / `package.json` の `scripts` / test discovery 設定など）** も露出経路になる。
> 003D-4E ではまず「**何を diff / コメント / config 差分に出してよいか / 出してはいけないか**」を事前に明文化する。最低限、以下は **出さない**：
>
> - 旧 spec の本文（部分引用含む）
> - 旧期待値リテラル（氏名・地域・読み・固定日付・件数・分布などの具体値）
> - 実データ由来に見える具体値
> - 旧 spec を参照する config 行に、旧 spec の中身や旧期待値を添える形のコメント・説明
>
> パス名（旧 spec のファイルパス）は完全に隠せないこともあるが、**必要最小限の参照** に留め、削除・置換 diff に旧本文が同伴しないよう取り扱う。
> 003D-4E-1 の CI discovery 変更は、**旧 spec の中身を表示・引用・削除 diff 化しないこと** を実装条件にする。

### Phase 3：撤去・履歴・公開系

7. **003H**：実データ撤去実行 Runbook
8. **003E**：Git 履歴対応要否判断
9. **003G**：GitHub Pages 公開済み影響確認
10. **008D**：公開系分離方式検討

ただし、現行公開影響が強く疑われる場合は **003G を 003H 前後で前倒し可能**。前倒し時も本文取得・保存・表示は禁止し、HEAD / メタ情報確認に限定する。

## 6. Done 条件

### 短期 Done

- 新規 synthetic 専用 E2E が存在する
- 新規 synthetic 専用 E2E が完全架空 fixture のみを使う
- 新規 synthetic 専用 E2E が CI で pass する
- 旧 E2E spec を通常 PR で編集していない
- 実データ JSON を通常 PR で削除していない

### 中期 Done

- CI が実データ JSON に依存しない
- CI が旧 E2E spec に依存しない
- synthetic fixture だけで主要 import 回帰が確認できる
- validator / expected values が実データ固定値から分離されている

### 最終 Done

- 実データ JSON が **公開系から除外** されている
- **main または後継 clean tree 上に、危険資産 A（実データ確定 JSON）が残らない** 状態
- **main または後継 clean tree 上に、危険資産 B（実データ由来に見える期待値を含む旧 E2E spec）が残らない** 状態
- 旧 E2E spec の実データ由来期待値が **通常 diff に出ない形で処理** されている（除去・置換・無効化のいずれを採るにせよ、旧本文・旧期待値が PR diff / コメント / config 差分に露出していない）
- Git 履歴対応要否が判断済み
- GitHub Pages 公開影響が評価済み
- 再発防止ルールが docs に反映済み
- 後継 clean tree への移行を採る場合は、**移行後 tree に危険資産 A / B が含まれないこと** を確認済み

> 注: 上記 Done 確認の過程・報告でも、危険資産 A / B の **具体ファイル本文・旧期待値・具体値（件数・分布・固定日付・氏名・地域・読み）は再掲しない**。資産ごとの有無（exists / not exists）と、抽象的な処理結果のみを記録する。

## 7. 以後の禁止ルール（再発防止）

- 実データ確定ファイルを **通常 PR で削除しない**
- 実データ由来に見える期待値を含む spec を **通常 PR で編集しない**
- 旧値が **削除 diff に出る変更をしない**
- 具体件数・具体クラス分布・固定日付の **具体値を再掲しない**（docs / commit message / PR 本文 / PR コメント / レビューコメント / Slack / 議事録 すべて）
- PR コメントでも **具体値を再掲しない**
- 実データを使って fixture を作らない
- 匿名化・仮名化データを fixture にしない（最初から機械的に生成した synthetic のみ）

## 7.1 後続 PR ごとの事前チェックリスト（pre-PR check）

本 Runbook 配下の後続 PR を起こす前に、PR 起票者は以下をすべて確認する。1 つでも No なら起票しない（または設計タスクへ戻す）。

- [ ] 危険資産 A（実データ確定 JSON）を **開かない / 読まない / 表示しない / コピーしない**
- [ ] 危険資産 B（旧 E2E spec）を **本文表示しない / 通常編集しない / 削除 diff にしない**
- [ ] PR diff に旧期待値リテラル・実データ由来に見える具体値が出ない
- [ ] PR 本文・PR コメント・レビューコメント・commit message に具体件数・具体クラス分布・固定日付・氏名・地域・読みを **再掲しない**
- [ ] 新規 fixture を追加する場合、§3.1 の許可条件（件数・分布・日付を実データへ寄せない、機械的・連番・完全架空）をすべて満たす
- [ ] CI / config 変更を含む場合、§5 Phase 2 の情報露出範囲事前定義に従う
- [ ] 過去 No Go PR（資産 A / B 関連）の diff 本文を本 PR 内で取得・引用していない
- [ ] 本 PR の Risk Level（§8）と Approval 境界（§9）を明示している

このチェックは PR 本文の冒頭に「pre-PR check: all pass」の事実のみ記載する。チェック項目内容そのものを PR diff へ展開する必要はない（本 Runbook を参照する形で十分）。

## 8. Risk Level

| 作業 | Risk Level |
|---|---|
| 本 Runbook 作成（本 PR） | docs-only だが実データ混入対応の全体収束方針のため **Level 3 相当** |
| synthetic 専用 E2E 新設 | Level 3 |
| validator / expected values 分離 | Level 3 |
| CI 対象変更 | Level 3〜4 |
| 実データ撤去実行 | Level 3〜4 |
| Git 履歴改変 / force push | Level 4 |
| clean tree / orphan branch / GitHub Pages 設定変更 | Level 4 候補 |

## 9. Approval Phrase / 承認境界

- 本 Runbook 作成は docs-only だが **Level 3 相当**。
- synthetic 専用 E2E 新設は **別 PR・別承認**。
- validator / expected values 分離は **別 PR・別承認**。
- CI 対象変更は **別 PR・別承認**。
- 実データ撤去は通常の Ready化 / merge 承認だけでは不十分。
- Git 履歴改変・force push・orphan branch・GitHub Pages 設定変更は **標準 Approval Phrase では解除不可**。

## 10. 今回やらないこと

- 対象 JSON の削除 / 置換 / 本文表示
- E2E spec 変更
- fixture 変更
- 過去 No Go PR（資産 A / B 関連）の diff 表示
- `shogi_v4.html` 変更
- CI 設定変更
- E2E skip / 削除
- Git 履歴改変
- force push
- GitHub Pages 設定変更
- 実データ撤去実行
