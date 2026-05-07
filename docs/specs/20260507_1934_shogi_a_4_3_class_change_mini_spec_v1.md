# shogi A-4.3 Mini 仕様書: 過去参加者からのクラス変更機能 + マスタ last_class 表示

**作成日時**: 2026-05-07 19:34 JST
**文書種別**: Mini 仕様書(目標 200 行前後)
**前提**: A-T フェーズ完了(commit be270cb、A-4.2.1 hotfix revert 済)
**実装担当**: Claude Code
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**main HEAD 前提**: be270cb

---

## 0. 背景

### 0.1 経緯
- A-4.2 リグレッション(commit `73961d3` 混入)の実機調査で、過去参加者パネルで既登録者の A/B ボタンが silent fail することが判明
- A-4.2.1 hotfix(event handler 戦略変更)は的外れだったため revert(PR #20、commit `be270cb`)
- 真の課題は UX 仕様: **「過去参加者から既登録者のクラスを変更する手段がない」**「マスタにクラスが表示されていない」
- 本 A-4.3 で 2 つの課題を一括解決

### 0.2 ユーザーストーリー(髙橋さん実機運用視点)
1. 「過去参加者の○○さんを A クラスに登録したい」(未登録者の場合)
2. 「過去参加者の○○さん(現在 B 登録)を A に変更したい」(クラス変更)
3. 「○○さんの前回参加クラスをマスタ画面で確認したい」(マスタの `last_class` 表示)

---

## 1. スコープ

### IN(対象)
- 過去参加者パネル / サジェスト両方の A/B ボタン押下時に **確認ダイアログ追加**
- 3 ケース別の挙動分岐(未登録 / 別クラス / 同クラス)
- 過去参加者パネル / サジェストでの **現クラス強調表示**(A=青、B=琥珀、チェック印)
- クラス変更時に `state.players` の `cls` + マスタの `last_class` を **即更新**
- マスタ一覧テーブルに **`last_class` カラム追加**
- F7 編集モーダルで `last_class` 表示・編集可能

### OUT(別フェーズ判断)
- `attendance_count` / `tournament_ids` の変更(クラス変更では更新しない、同じ大会内の操作のため)
- サジェスト側の「既登録者除外」ロジックの撤廃(現状維持、サジェストは新規追加用、過去参加者パネルがクラス変更を担う)
- アンドゥ機能(別 PR で議論)
- 「前回参加クラス」と「直近参加クラス」の区別(現状の `last_class` 単一フィールドで運用)

---

## 2. UI 仕様

### 2.1 過去参加者パネル(現クラス強調表示)
- 各行: 氏名 + A ボタン + B ボタン
- **現クラス強調**:
  - A 登録済 → A ボタンに青背景(`--color-background-info`)+ 青枠 + チェック印
  - B 登録済 → B ボタンに琥珀背景(`--color-background-warning`)+ 琥珀枠 + チェック印
  - 未登録 → 両ボタンともプレーン(border-tertiary、文字色 secondary)

### 2.2 確認ダイアログ(3 ケース)
**ケース 1(未登録)**: 「○○さんを **A クラス** に追加しますか?」(キャンセル / OK)
**ケース 2(別クラス登録済)**: 「○○さんは現在 **B クラス** に登録されています。**A クラス** に変更しますか?」(キャンセル / OK)
**ケース 3(同クラス登録済)**: 「○○さんは既に **A クラス** に登録されています。」(OK のみ、削除提案なし)

### 2.3 サジェスト
- 過去参加者パネルと同じ確認ダイアログ(メンタルモデル一貫性)
- 「既登録者除外」は現状維持(サジェストには既登録者は表示されない、ケース 1 のみ発生)

### 2.4 マスタ一覧テーブル
- 既存カラム + 「**前回クラス**」カラム追加(値: A / B / `-` で未参加 = `last_class` 不在)

### 2.5 F7 編集モーダル
- 既存項目 + 「**前回クラス**」表示・編集(A / B / 未設定 のドロップダウン or ラジオ)

---

## 3. 実装範囲

### 3.1 production code 修正対象(`shogi_v4.html`)
1. **`addPlayerFromMaster`**(L936): 既登録者検知時の分岐(現状の duplicate_member return を保持しつつ、UI 側で確認ダイアログ + クラス変更を呼び出す)
2. **新規関数 `changePlayerClass(member_id, new_cls)`**: 既登録者の `cls` を更新、マスタの `last_class` も即更新
3. **`bindPastParticipantsPanelEvents`**(L1294 周辺): A/B ボタン handler を確認ダイアログ + 3 ケース分岐に置換
4. **サジェスト側 handler**(L2361 周辺): 同様に確認ダイアログ + 3 ケース分岐
5. **`renderRegList` / `renderPastParticipantsPanel`**: 現クラス強調表示の追加(背景色 + チェック印)
6. **マスタ一覧テーブル描画関数**: `last_class` カラム追加
7. **F7 編集モーダル**: `last_class` 表示・編集 UI

### 3.2 production code 修正規模(見積もり)
- `shogi_v4.html`: 概ね **+250〜350 行 / -50 行**(機能追加のため A-T 着手以来初の大規模修正)
- 1 ファイル / 6 箇所(機能ごとに分かれる)

### 3.3 テスト
- 既存 465 件緑維持(必要に応じて軽微な修正)
- 新規 e2e 追加(過去参加者パネルでクラス変更、確認ダイアログのキャンセル/OK、マスタ一覧 last_class 表示、F7 編集モーダル)
- 単体テスト追加(`changePlayerClass`、`addPlayerFromMaster` の分岐)

---

## 4. 制約

- A-T で達成した「production code 不変原則」は本 PR では **意図的に解除**(機能追加のため、A-T 着手以来初の本格的 production 修正)
- 既存 465 件緑維持(可能な限り破壊しない、破壊する場合は新仕様に合わせて test 側を修正)
- A-T で構築した factory / helpers を活用(新規 factory 追加可、既存 factory 維持)
- **確認ダイアログは `window.confirm` で実装**(既存実装と統一、F8 import 等で先例あり、本 PR では新規モーダル UI 作成しない)
- マスタ更新タイミング: クラス変更時に **即更新**(`saveBranchMaster` を呼ぶ)、`syncBranchMasterOnSave` との整合性は Codex に確認

---

## 5. 受け入れ条件

| # | 観点 | 検証方法 |
|---|---|---|
| 1 | 過去参加者パネル A/B ボタン押下時に確認ダイアログ表示 | e2e + 実機 |
| 2 | 3 ケース(未登録 / 別クラス / 同クラス)が正しく動作 | e2e + 実機 |
| 3 | クラス変更時に `state.players` + マスタ `last_class` 即更新 | e2e |
| 4 | マスタ一覧に `last_class` カラム表示 | e2e |
| 5 | F7 編集モーダルで `last_class` 編集可能 | e2e |
| 6 | 既存 465 件 + 新規 e2e すべて緑 | `npm test` + `npx playwright test` |
| 7 | **iPhone 実機目視確認**で 3 ケースが期待通り動作 | 髙橋さんの実機 tap |
| 8 | Codex Gate Review A 判定 | Codex |

---

## 6. レビュー方針(運用ルール初適用)

### 6.1 ChatGPT メタレビュー: スキップ(Gate 運用、memory #22)

### 6.2 Codex Gate Review: 1 回、Devil's Advocate prompt 必須質問

A-4.2 リグレッションの教訓を踏まえ、Codex への質問テンプレに以下を **必ず含める**:
- 「iOS Safari 固有の罠は?(click event 不安定 / pointer-events / touch event 制約)」
- 「他箇所と event handler 戦略が非対称になっていないか?」
- 「この変更が壊しうる業務シナリオを 5 つ挙げて」
- 「`addPlayerFromMaster` / `changePlayerClass` の境界が曖昧でないか?」

### 6.3 実機目視確認: Definition of Done として merge 前に必須

A-4.2 リグレッションがレビュー網全すり抜けで実機で死んだ教訓を踏まえ、本 PR で「**実機目視確認 = Definition of Done**」を初適用。髙橋さんが iPhone Safari で 3 ケース全て tap して動作確認するまで merge しない。

---

## 7. 想定工数

- 仕様書配置 + ブランチ準備: 15 分
- 実装(過去参加者パネル + サジェスト + addPlayerFromMaster + changePlayerClass): 2〜3 時間
- 実装(マスタ一覧 last_class カラム + F7 編集モーダル last_class): 1〜2 時間
- 既存 e2e 緑維持確認 + 新規 e2e 追加: 1〜2 時間
- Codex review request 作成 + PR: 30〜60 分
- 実機目視確認: 5〜10 分
- 合計: **5〜8 時間**(1〜2 セッション完了想定)

---

## 8. リスクと予防

- **R1**: 既存 465 件が破壊される → A-T factory の primary assertion で多くは検出可能、修正必要な test は sub-1 桁想定
- **R2**: production diff が大きい(+250〜350 行)→ レビュー難度上がるが、機能の同根性で 1 PR 妥当(2.1/2.4/2.5 を 2 PR 化案は議論済、髙橋さん判断で (a) 1 PR 採用)
- **R3**: マスタ更新タイミング変更で既存挙動に影響 → `syncBranchMasterOnSave` との整合性を Codex に確認
- **R4**: 確認ダイアログ追加で既存 UX が変化 → 髙橋さんの実機目視確認で吸収

---

## 9. 申し送り(A-4.3 完了後)

- 運用ルール正式追加: 「実機目視確認 = Definition of Done」「Devil's Advocate prompt 常用化」を memory + DevSecOps v1.2.1 に追記(本 PR 完了後)
- A-4.4 候補(別 PR): アンドゥ機能 / `tournament_ids` 履歴の編集 UI / 削除ボタン追加 / サジェスト側にも既登録者を含める案 等

---

**END**
