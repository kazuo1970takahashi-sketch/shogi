# SHOGI-TOUR｜AI非同期運用ルール v0.1 設計（TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN）

**Task ID**: `TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN`
**作業種別**: docs-only design / 運用設計
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `94d1755`（PR #121 squash merge 後の main = RESET-UX-SERIES-CLOSURE-DOCS）
**位置づけ**: SHOGI-TOUR における AI チーム（ChatGPT / Claude / Claude Code / Codex / cowork）の非同期運用ルール **v0.1** を docs-only で整理する設計文書。実装・自動化・workflow 変更・Bot 連携・GitHub Actions 変更には進まない。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **対象**: AI チーム間ハンドオフ、Claude Code 完了報告、PR 状態管理、レビュー依頼の流通
- **非対象（今回 PR では実施しない）**:
  - 実装ファイル変更（`shogi_v4.html` / `test/` / `test/e2e/` / `index.html` / `data/`）
  - workflow 変更（`.github/workflows/`）
  - 自動化実装（GitHub Actions / Bot / API 連携）
  - `package*.json` / lockfile / `playwright.config.js` 変更
  - VRT snapshot 変更
  - CSS / layout 変更
  - 既存 PR template / Issue template の改修
  - branch protection 変更
  - token / secret / credential 操作
  - 後続タスク（`TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` 等）の着手

---

## 1. 目的

SHOGI-TOUR においては、これまで以下の AI 分担で高品質な進行ができている：

- ChatGPT：司令塔・依頼文作成・レビュー結果整理・Must Fix / Should Fix / Nice to Have 分類・Ready / merge 判断支援
- Claude：設計相談・方針整理・仕様/設計レビュー
- Claude Code：実装・docs 更新・テスト・commit / push / Draft PR 作成・完了報告コメント投稿
- Codex / cowork：独立レビュー・PR diff 直視レビュー・A / Go、B+ / Conditional Go、No Go 判定

直近 RESET-UX 文言整合シリーズ（PR #112〜#121）では DESIGN → IMPL-LIGHT → review → Ready → merge → closure のサイクルが極めて安定して回った。

一方で、現状の最大の問題は **各 AI 間の受け渡しがすべて髙橋さん（運営者 / Product Owner）の手動コピペに依存していること**。

本 v0.1 で目指す状態は以下：

1. **GitHub を AI 間ハンドオフの Single Source of Truth（SSoT）とする**
2. **PR 本文 / PR コメント / HANDOFF.md / docs/notes / docs/ops に状態を残す**
3. **Claude Code 完了報告に Next Action / Next Owner / Blocked By を必ず含める**
4. **髙橋さんは「コピペ係」ではなく「承認者・方針決定者」として関与する**
5. **低リスク作業は Draft PR 作成やレビュー依頼文生成まで進められる**
6. **危険操作は必ず停止する**
7. **Ready 化 / merge / snapshot 更新 / release / deploy / publish / branch 削除などは明示許可なしに行わない**

すなわち、**危険操作の自動化ではなく、低リスク作業の非同期化** を目指す。

---

## 2. 背景と問題

### 2.1 現状の AI 分担はうまく機能している

- 役割分担が明確（司令塔 / 設計 / 実装 / レビュー）
- DESIGN → IMPL-LIGHT 分離で小さい PR を回せている
- 禁止事項を明示することで自律的な逸脱が抑制できている
- Codex / cowork の外部視点レビューが品質を支えている
- RESET-UX 文言整合シリーズ（PR #112〜#121）で 10 件以上の連続成功

### 2.2 しかし AI 間の受け渡しは髙橋さんの手動コピペに依存している

実際の流れ：

1. ChatGPT が依頼文を作る
2. **髙橋さんが Claude / Claude Code / Codex / cowork にコピーする**
3. それぞれの AI が応答する
4. **髙橋さんがその結果を ChatGPT にコピーする**
5. ChatGPT が次判断を作る
6. **髙橋さんがまたコピーする**

各ステップに人手が必須。

### 2.3 髙橋さん不在時に作業が止まる

- 髙橋さんが業務 / 移動 / 体調不良 / 睡眠中 等で離席している間は AI チームの進行が完全停止
- 「次に何をすべきか」が GitHub 上に残っていない場合、別 AI が再開しても判断できない
- 結果として **髙橋さんがプロジェクト進行のボトルネック** になっている

### 2.4 髙橋さんが伝令・転記係・進行管理者になっている

本来の役割は Product Owner / 運営者（最終決定者・方針決定者・承認者）だが、現状は **伝令・転記係・ルーター・進行管理者** が支配的な業務になっている。

### 2.5 これを解消するには

GitHub 上に以下を残す必要がある：

- 現在状態（Draft / Review Waiting / Ready Approved 等）
- 次アクション（Next Action）
- 次の担当（Next Owner）
- 停止理由（Blocked By）
- 人間承認が必要かどうか（Requires Human Approval / Allowed Without Human Approval）

これにより、髙橋さん不在時でも GitHub を見れば「今どこにいて、次に誰が何をすべきか」が分かる状態を目指す。

---

## 3. AI 役割定義

SHOGI-TOUR における各 AI / 人間の役割を以下のように定義する。

### 3.1 ChatGPT — 司令塔

- 役割：初稿作成・依頼文作成・レビュー結果整理・Go / Conditional Go / No Go 判断支援
- 出力例：Claude Code 向けの「【Claude Code 依頼｜SHOGI-TOUR ...】」テンプレ、cowork / Codex 向けのレビュー依頼文、Ready 化判断、merge 判断
- **最終決定者ではない**（最終判断は髙橋さん）
- ChatGPT は GitHub への直接書き込みを持たないため、出力はチャットで提示し、髙橋さん（または別 AI 経由）で GitHub に転写する
- v0.1 では「ChatGPT の出力は **PR コメントにそのまま貼れる形** で出すこと」を運用ルールとする

### 3.2 Claude — 設計・壁打ち

- 役割：設計相談・方針整理・仕様 / 設計レビュー・複雑な論点の壁打ち
- 出力例：設計案の比較・原則整理・トレードオフ説明・代替案提示
- **実装には進まない**（Claude Code に明確に渡す）
- **最終決定者ではない**

### 3.3 Claude Code — 実装担当

- 役割：実装・docs 更新・テスト・commit / push / Draft PR 作成・完了報告コメント投稿・次アクション候補の提示
- 出力例：Draft PR、完了報告コメント、HANDOFF 追記、design doc、軽量テスト
- **以下は明示許可がなければ実行しない**：
  - Ready 化（Mark PR as Ready for Review / Draft 解除）
  - merge / squash merge
  - main 直接 push
  - release / deploy / publish
  - branch 削除
  - VRT snapshot 更新
  - VRT threshold 緩和・skip
  - workflow 変更
  - `package*.json` / lockfile 変更
  - `playwright.config.js` 変更
  - branch protection 変更
  - token / secret / credential 操作
  - 後続タスクの自律着手
- 完了報告には **必須メタ情報テンプレ（§6）** を埋める

### 3.4 Codex — 独立レビュー

- 役割：PR diff 直視レビュー・コード / 設計の外部視点チェック・Must Fix / Should Fix / Nice to Have 分類
- 出力例：A / Go、B+ / Conditional Go、No Go 判定、改善提案、リスク指摘
- **最終決定者ではない**
- Codex は SHOGI-TOUR の主要レビュー責任者（過去 PR で実績多数）

### 3.5 cowork — 代替レビュー

- 役割：Codex 不在時の代替レビュー、PR diff 直視レビュー、A / Go 等の判定
- **最終決定者ではない**
- ChatGPT と Codex の中間的位置づけ（外部視点を提供）

### 3.6 髙橋さん — Product Owner / 最終判断者

- 役割：
  - 最終判断者（Ready 化 / merge / release / 危険操作の承認）
  - 方針決定者（スコープ確定、優先順位決定、リスク許容範囲決定）
  - 大会運営者（リアル大会での実機確認、運用観察フィードバック提供）
- **コピペ係ではない方向へ移行する**
- v0.1 では「髙橋さんが GitHub を見るだけで状況把握できる」を目標にする

---

## 4. GitHub を SSoT にする

### 4.1 GitHub 上の情報源

以下を AI チームの公式情報源として扱う：

- **PR 本文**：タスク全体のスコープ・含めない範囲・想定変更ファイル・テスト結果
- **PR コメント**：完了報告・レビュー結果・次アクション・依頼文・判断記録
- **HANDOFF.md**：プロジェクト全体の最新到達点・関数構造マップ・データ構造・テスト基盤・履歴・持ち越し
- **docs/notes/**：個別タスクの design doc / impl-light 着地ノート / closure note
- **docs/ops/**：運用・workflow・AI チーム連携設計
- **将来候補**：`docs/ops/ai_work_queue.md`（Task ID / PR / Status / Blocked By 一覧、Phase 2 で検討）

### 4.2 原則

1. **重要な完了報告はチャットだけでなく PR コメントにも残す**
   - Claude Code 完了報告は PR コメント投稿を必須化
   - チャット上の応答が消えても GitHub に残る状態を作る

2. **次アクションは PR 本文または PR コメントに残す**
   - 「次に何をすべきか」を AI / 髙橋さんが GitHub だけで判断できるようにする

3. **ChatGPT / Claude / cowork / Codex に渡す依頼文も、可能なら PR コメントに残す**
   - 依頼文がチャットに閉じていると再利用できない
   - 別 AI / 別チャットで同じ依頼を再現可能にする

4. **後続 AI はチャット履歴だけに依存しない**
   - 「GitHub を見れば最新状態が分かる」を目指す
   - チャットはあくまで補助、SSoT は GitHub

5. **GitHub 上で「今どこか」が分かる状態にする**
   - PR の Draft / Ready / Merged 状態
   - PR 本文の Current Status 欄
   - PR コメントの Next Action 欄
   - HANDOFF.md の最新エントリ

### 4.3 SSoT の二段構え

- **タスクレベル**：個別 PR の本文・コメント（このタスクで今何をしている / 次は何）
- **プロジェクトレベル**：HANDOFF.md（プロジェクト全体で今どこ / 何が持ち越し）

両者が乖離しないよう、PR closure 時に HANDOFF.md へ短い entry を必ず追加する（RESET-UX シリーズで既に実践済の運用を標準化）。

---

## 5. 状態遷移モデル

PR / Task の状態を以下のように定義する。

### 5.1 状態一覧

| 状態 | 意味 | 次に動くべき担当 | 自動進行 | 人間承認 | 停止条件 |
|---|---|---|---|---|---|
| **Draft** | Claude Code が Draft PR を作成した状態 | Claude Code（review request draft 作成） → 髙橋さん（レビュー指示） | △（review request 作成までは可） | 不要（Draft 維持の範囲） | Ready 化 / merge 禁止 |
| **Review Waiting** | cowork / Codex / ChatGPT などのレビュー待ち | レビュアー AI | × | 不要（レビュー実施自体は承認不要） | レビュー結果が出るまで |
| **Review Done** | A / Go、B+ / Conditional Go、No Go が出た状態 | ChatGPT 司令塔（結果整理） → 髙橋さん（Ready 化判断） | × | Ready 化判断は要承認 | Must Fix / Should Fix 残存時は Ready 化不可 |
| **Ready Approved** | ChatGPT 司令塔または髙橋さんが Ready 化可と判断した状態 | Claude Code（Ready 化 実行）… 但し **実際の Ready 化は明示許可が必要** | × | 必要 | 髙橋さん明示許可なし |
| **Ready Done** | PR が Ready for Review 状態になった | レビュアー AI（最終 review）または ChatGPT（merge 可否判断） | × | merge 判断は要承認 | Conditional Go の Must Fix 残存時は merge 不可 |
| **Merge Approved** | merge 可判断が出た状態 | Claude Code（squash merge 実行）… 但し **実際の merge は明示許可が必要** | × | 必要 | 髙橋さん明示許可なし |
| **Merged** | main に反映済み | Claude Code（closure note / HANDOFF 追記）または運用観察フェーズ | △（closure docs-only は可、後続実装は不可） | closure 後の後続実装は要承認 | 後続実装の自律着手禁止 |
| **Observation** | 実運用で様子を見る状態 | 髙橋さん（実機確認 / フィードバック） | × | 不要（観察のみ） | 追加実装には進まない |
| **Blocked** | 判断待ち、外部レビュー待ち、VRT 判断待ち、人間承認待ちなど | Blocked By に応じて変化 | × | 多くは要承認 | 解除条件が満たされるまで |

### 5.2 状態ごとの動き

#### Draft
- Claude Code が「Draft PR を作成した直後」の状態。
- この時点で **Ready 化はしない**。
- 次は (a) Claude Code が review request draft（cowork / Codex / ChatGPT 向け）を PR コメントに作成 → (b) 髙橋さんが実際にレビュアー AI に渡す、または将来は Phase 2+ でレビュアーが直接 PR を見る。
- 髙橋さんがコピペしなくても、PR コメントにレビュー依頼文があれば再利用可能。

#### Review Waiting
- cowork / Codex / ChatGPT へレビュー依頼を渡した直後の状態。
- 髙橋さんはレビュアー AI の応答を PR コメントに転記（または将来は AI が直接コメント）。
- AI チーム内のレビュー実施そのものには髙橋さんの承認は不要（レビュー依頼を渡すかどうかは髙橋さん判断）。

#### Review Done
- A / Go、B+ / Conditional Go、No Go の判定が PR コメントに揃った状態。
- Must Fix が残っているか、Should Fix の取扱いをどうするかで次が変わる。
- Must Fix 残存：Claude Code が修正 → Review Waiting へ戻す
- Should Fix 受容：ChatGPT 司令塔が「Conditional Go の条件を満たした」と判断 → Ready Approved 検討
- A / Go：直接 Ready Approved 検討

#### Ready Approved
- ChatGPT 司令塔または髙橋さんが「Ready 化して良い」と判断した状態。
- **判断は出ているが、実際の Ready 化は別アクション**。
- Claude Code に Ready 化を指示するには **髙橋さんの明示許可が必要**（v0.1 では自律 Ready 化を禁止）。

#### Ready Done
- PR が Ready for Review になった。
- 場合によっては最終レビュー（cowork / Codex）を再依頼。
- merge 可否判断が出たら Merge Approved へ。

#### Merge Approved
- merge 可判断が出た状態。
- 実際の squash merge は **髙橋さんの明示許可が必要**。
- merge 実行時の確認事項：Ready / OPEN / head SHA 一致 / branch 削除禁止 等。

#### Merged
- main に反映済み。
- 次は (a) closure / HANDOFF 追記（docs-only、Level 1 相当、Draft PR 作成までは可）、または (b) 運用観察フェーズ（実機確認）。
- 後続実装タスクへの **自律着手は禁止**。

#### Observation
- RESET-UX シリーズで実践したパターン。実機運用で様子を見る。
- 観察期間は追加実装に進まない。
- 観察結果が出たら次タスク起票判断は髙橋さん（ChatGPT が候補提示）。

#### Blocked
- 判断待ち / 外部レビュー待ち / VRT 判断待ち / 人間承認待ち / 仕様不明 / データリスク / セキュリティリスク / ツール不可 / コンテキスト不足 などで停止している状態。
- Blocked By を必ず明記（§12 で分類）。

### 5.3 RESET-UX シリーズで観測された遷移パターン

DESIGN → IMPL-LIGHT 分離での標準パターン（PR #117 → #118 を例に）：

1. Claude Code が design doc PR を Draft 作成（Draft）
2. ChatGPT がレビュー依頼文を生成（Review Waiting）
3. cowork / Codex がレビュー（Review Done）
4. ChatGPT が結果整理・Ready 化判断（Ready Approved）
5. 髙橋さん明示許可 → Ready 化（Ready Done）
6. ChatGPT が merge 可否判断（Merge Approved）
7. 髙橋さん明示許可 → squash merge（Merged）
8. Claude Code が IMPL-LIGHT PR を Draft 作成（次タスクの Draft へ）
9. 以下繰り返し

このパターンを v0.1 の標準フローとして明文化する。

---

## 6. 必須メタ情報テンプレート

Claude Code の完了報告 / PR 本文 / PR コメントに、以下の欄を **必須化する設計** にする（v0.1 は設計のみ、実装は IMPL-LIGHT で行う）。

### 6.1 必須欄

| 欄 | 意味 | 記入例 |
|---|---|---|
| **Task ID** | 命名規約に従ったタスク識別子 | `TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN` |
| **PR 番号** | GitHub PR 番号 | `#122` |
| **Branch** | 作業ブランチ名 | `docs/tour-ops-async-ai-workflow-design` |
| **Commit SHA** | 報告時点の HEAD commit SHA（短縮可） | `abc1234` |
| **Current Status** | §5.1 の状態名 | `Draft` |
| **Next Action** | 次に実行すべき具体的アクション | `cowork / Codex 向けレビュー依頼文を生成し PR コメントに投稿する` |
| **Next Owner** | 次に動くべき AI / 人間 | `Claude Code（review request draft 作成）` / `髙橋さん（レビュアー AI への依頼）` |
| **Blocked By** | 停止理由（あれば） | `Human Approval`（§12 の分類から選択）/ `null`（ない場合） |
| **Allowed Without Human Approval** | 人間承認なしで進めて良い範囲 | `Draft PR 作成 / review request draft 生成 / PR コメント投稿 / HANDOFF 追記` |
| **Requires Human Approval** | 人間承認が必要な操作 | `Ready 化 / merge / branch 削除 / VRT snapshot 更新 / release / deploy / publish` |
| **Forbidden Actions** | 明示的に禁止する操作 | `main 直接 push / force push / workflow 変更 / package*.json 変更 / token 操作` |
| **Changed Files** | 変更ファイル一覧 | `docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md` / `HANDOFF.md` |
| **Tests** | テスト結果 | `docs-only のため未実施` / `bash test/run_tests.sh shogi_v4.html: 76 stanza PASS / FAIL=0 / WARN=0` |
| **Risk Level** | §7 の Level 0〜5 | `Level 1: docs-only design` |
| **Review Needed** | 必要なレビュアー | `cowork`（独立レビュー） / `Codex`（独立レビュー） / `ChatGPT 司令塔`（Go 判定） |
| **Handoff URL / comment URL** | 次担当者が見るべき URL | `https://github.com/kazuo1970takahashi-sketch/shogi/pull/122` |

### 6.2 特に重要な欄

以下の 5 欄は **省略不可**。これが揃わない完了報告は不完全とみなす：

- **Next Action**
- **Next Owner**
- **Blocked By**
- **Allowed Without Human Approval**
- **Requires Human Approval**

これにより、髙橋さん不在時でも、別 AI / 別チャットが PR を見れば「次に何をすべきか」を判断できる。

### 6.3 記入例（本 PR を想定）

```
- Task ID: TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN
- PR 番号: #(本 PR 番号)
- Branch: docs/tour-ops-async-ai-workflow-design
- Commit SHA: (commit 後に確定)
- Current Status: Draft
- Next Action: cowork / Codex / ChatGPT 司令塔のいずれかへレビュー依頼。最終的に Ready 化は髙橋さん明示許可後。
- Next Owner: 髙橋さん（レビュアー指定） → レビュアー AI（レビュー実施） → ChatGPT 司令塔（Go 判定）
- Blocked By: Human Approval（レビュアー選定および Ready 化判断）
- Allowed Without Human Approval: Draft PR 維持 / 修正コミット追加 / review request draft 投稿 / HANDOFF 追記
- Requires Human Approval: Ready 化 / squash merge / branch 削除
- Forbidden Actions: workflow 変更 / 自動化実装 / Bot 実装 / 実装ファイル変更 / package*.json 変更 / VRT snapshot 変更
- Changed Files: docs/ops/20260516_shogi_tour_async_ai_workflow_v0_1.md, HANDOFF.md
- Tests: docs-only のため未実施（git diff --check clean を確認）
- Risk Level: Level 1: docs-only design
- Review Needed: cowork（独立レビュー）/ Codex（独立レビュー）/ ChatGPT 司令塔（Go 判定）
- Handoff URL: (PR URL)
```

---

## 7. リスクレベル分類

タスクを以下の 6 段階で分類する。各レベルで「Claude Code が自律的に進めて良い範囲」と「人間承認が必要な操作」を明確化する。

### 7.1 Level 0：記録・整理

**例**：
- HANDOFF 追記のみ
- closure note 作成
- status 整理
- PR 一覧整理

**許可範囲**：
- Draft PR 作成まで可
- review request 作成まで可
- **Ready / merge は不可**

### 7.2 Level 1：docs-only design

**例**：
- design doc 作成（本 PR がこれ）
- 後続候補整理
- 非スコープ明記
- 比較案・推奨案提示

**許可範囲**：
- Draft PR 作成まで可
- review request 作成まで可
- **Ready / merge は不可**

### 7.3 Level 2：IMPL-LIGHT

**例**：
- 文言 1 行変更
- テスト期待値 1〜2 行追加
- HANDOFF 最小追記
- **CSS なし / ロジックなし / VRT 影響なし**
- RESET-UX-TOAST-LABEL-IMPL-LIGHT（PR #120）が典型例

**許可範囲**：
- Draft PR 作成まで可
- テスト実行可
- review request 作成可
- **Ready / merge は不可**

### 7.4 Level 3：IMPL-MEDIUM / UX 導線変更

**例**：
- alert / confirm / toast / button 関係変更
- 複数テスト更新
- VRT 影響可能性あり

**許可範囲**：
- **原則 design 必須**（事前 docs-only design doc 着地）
- review 必須
- snapshot 更新は明示許可必要
- **Ready / merge は不可**

### 7.5 Level 4：ロジック・データ影響

**例**：
- reset logic 変更（`resetAll` / `resetTournamentProgressOnly` 仕様変更）
- localStorage schema 変更
- pairing algorithm 変更（`generatePairing` / Fisher-Yates）
- participant state 構造変更
- master data 構造変更
- save / load 変更

**許可範囲**：
- design 必須
- review 必須
- テスト強化必須
- **人間承認なしに実装着手しない**

### 7.6 Level 5：運用・公開・破壊的操作

**例**：
- release
- deploy
- publish
- branch 削除
- main 直接 push
- force push
- snapshot 大量更新
- workflow 変更
- branch protection 変更

**許可範囲**：
- **明示許可なしに実行禁止**

### 7.7 v0.1 タスクへの適用

本 PR（`TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN`）は **Level 1** に該当。Draft PR 作成 + 完了報告コメント投稿までを許可範囲とし、Ready 化・merge は明示許可制とする。

---

## 8. 人間承認が必須の操作

以下の操作は v0.1 において **必ず明示許可が必要** とする。Claude Code は自律的に実行しない：

- **PR 操作**：
  - Ready 化（Mark PR as Ready for Review / Draft 解除）
  - squash merge / regular merge
  - main 直接 push
  - force push（任意 branch を含む）
  - branch 削除（remote / local 問わず）
- **公開・運用**：
  - release（GitHub Releases 作成）
  - deploy（GitHub Pages 公開反映）
  - publish（任意の外部公開）
- **VRT・テスト基盤**：
  - VRT snapshot 更新（`*.png` 上書き）
  - VRT threshold 緩和
  - VRT skip（test.skip / suite.skip 追加）
  - `playwright.config.js` 変更
- **CI / インフラ**：
  - workflow 変更（`.github/workflows/`）
  - branch protection 変更
- **依存・schema**：
  - `package*.json` / lockfile 変更
  - localStorage schema 変更（`STORAGE_KEY` / `LEGACY_STORAGE_KEYS` / `BRANCH_MASTER_KEY` 変更）
- **コアロジック**：
  - reset logic 変更（`resetAll` / `resetTournamentProgressOnly`）
  - pairing 変更（`generatePairing` / Fisher-Yates / `evaluatePairingQuality`）
  - master data 構造変更
- **セキュリティ**：
  - token / secret / credential 操作

判断基準：「失敗時のロールバックが容易か」「外部に影響が出るか」「データ破壊リスクがあるか」「テストで担保されない領域か」のいずれかが Yes なら明示許可制。

---

## 9. 髙橋さん不在時に AI が進めてよいこと

髙橋さん不在時でも Claude Code が **自律的に進めて良い** 候補：

### 9.1 進めてよい候補

- **docs-only Draft PR 作成**（Level 0 / 1）
- **IMPL-LIGHT Draft PR 作成**（Level 2）
  - ただし事前 design doc が着地済みで、かつ仕様が完全に確定している場合のみ
- grep / test / diff check 等の読み取り系操作
- PR 本文更新（誤字修正・欄追加など）
- 完了報告コメント投稿
- 次レビュー依頼文（cowork / Codex / ChatGPT 向け）の **draft 作成**（実際の依頼は髙橋さんが行う）
- HANDOFF 最小追記
- closure note 作成
- status 整理

### 9.2 進めてはいけない（不在時でも禁止）

- **Ready 化しない**
- **merge しない**
- **snapshot 更新しない**
- **release / deploy / publish しない**
- **branch 削除しない**
- **危険な後続タスクに自律着手しない**
- **workflow 変更しない**
- **package*.json / lockfile 変更しない**
- **branch protection 変更しない**
- **token / secret / credential 操作しない**
- **main 直接 push しない**
- **force push しない**

### 9.3 判断に迷ったら止まる

仕様不明 / コンテキスト不足 / Level 判定が曖昧 / 影響範囲が読めない場合は **Blocked: Context Missing / Spec Ambiguity** として停止し、PR コメントに状況を残す。

---

## 10. AI 間ハンドオフ手順

チャットコピペ依存を減らすため、**GitHub PR コメントに以下を残す運用** を設計する。

### 10.1 Claude Code 完了時

PR コメントに以下を投稿：

```
## Claude Code 完了報告 — <Task ID>

### 実装内容
- (変更内容の要約)

### 変更ファイル
- (file path)
- (file path)

### テスト結果
- (test command と結果)

### 必須メタ情報（§6 テンプレ）
- Task ID: ...
- Current Status: Draft
- Next Action: ...
- Next Owner: ...
- Blocked By: ...
- Allowed Without Human Approval: ...
- Requires Human Approval: ...
- Risk Level: Level X
- Review Needed: ...

### Review Request Draft（cowork / Codex / ChatGPT 司令塔 向け）
（PR コメントとしてレビュアーがそのまま読めるドラフト文をここに）

### 後続候補（着手しない）
- (Task ID 列挙)
```

### 10.2 レビュー完了時（cowork / Codex）

PR コメントに以下を投稿（または髙橋さん経由で転記）：

```
## cowork / Codex レビュー結果 — PR #xxx

### 判定
A / Go ／ B+ / Conditional Go ／ No Go のいずれか

### Must Fix
- (項目)

### Should Fix
- (項目)

### Nice to Have
- (項目)

### Ready 化可否
可 ／ 条件付き可（Must Fix 解消後） ／ 不可

### merge 可否
可 ／ 条件付き可 ／ 不可

### 次アクション
- (Must Fix 修正依頼 / Ready 化推奨 / merge 推奨 等)
```

### 10.3 ChatGPT 司令塔判断時

ChatGPT 出力はチャットだが、**PR コメントにそのまま貼れる形** で出すこと：

```
## ChatGPT 司令塔判断 — PR #xxx

### 判定
Go ／ Conditional Go ／ No Go

### Ready 化可否
可 ／ 条件付き可 ／ 不可

### merge 可否
可 ／ 条件付き可 ／ 不可

### 修正依頼文（Claude Code 向け）
（コピペでそのまま渡せる短い指示）

### 禁止解除対象
（今回明示的に解除する禁止項目）

### 実行範囲
（今回 Claude Code に許可するアクションの上限）
```

### 10.4 v0.1 での運用

- v0.1 では「コメント投稿」は **髙橋さん経由でも可**（AI 直接書き込み権限はまだ与えない）
- 重要なのは「**GitHub 上に文字として残る**」状態
- Phase 2+ で AI 直接コメント / Bot 経由を検討

---

## 11. 依頼文の短縮・テンプレ化

髙橋さんのコピペ負担を減らすため、依頼文を以下の形式に分ける。

### 11.1 Full Prompt（長い）

**用途**：
- 新規タスク開始時
- 危険度が高い作業
- 初回実装
- 初めて触れる領域

**特徴**：背景・目的・スコープ・含めない範囲・停止条件・禁止事項を全部明示。RESET-UX-PARTIAL-RESET-IMPL-LIGHT 等で実際に使われた長い依頼文がこれに該当。

### 11.2 Short Prompt（短い）

**用途**：
- Ready 化
- merge
- review request
- minor fix

**特徴**：1〜3 行で完結。

**Ready 化 Short Prompt 例**：
```
PR #xxx は A / Go、Must Fixなし、Should Fixなし。
以下条件確認後、Ready化のみ実行。merge禁止。
- Ready 前状態: Draft / OPEN / head SHA xxx
- 確認後 Mark as Ready for Review を実行
```

**merge Short Prompt 例**：
```
PR #xxx は Ready / OPEN、head SHA xxx、A / Go。
以下条件確認後、squash mergeのみ実行。branch削除禁止。
- merge 前状態: Ready / OPEN
- squash merge を実行
- 完了後 branch 削除はしない（手動判断のため）
```

**Review Request Short Prompt 例**：
```
cowork / Codex にレビュー依頼。
- PR #xxx の diff を直視レビュー
- A / B+ / No Go 判定
- Must Fix / Should Fix / Nice to Have 分類
```

### 11.3 PR Comment Template

GitHub に残す用 / AI 間ハンドオフ用。§10 のテンプレートをそのまま使う。

### 11.4 テンプレ管理

v0.1 では「設計上の型」として明文化のみ。実ファイル化（`.github/PULL_REQUEST_TEMPLATE.md` 等）は別タスク `TOUR-OPS-PR-TEMPLATE-DESIGN` で扱う。

---

## 12. Blocked By の可視化

PR が停止している場合、以下のいずれかを Blocked By として明記する。

### 12.1 Blocked By の分類

| 分類 | 意味 | 解除条件 |
|---|---|---|
| **Human Approval** | 髙橋さんの明示許可待ち（Ready 化 / merge / 危険操作） | 髙橋さんが「実行可」と明示 |
| **Review** | cowork / Codex / ChatGPT のレビュー結果待ち | レビュー結果が PR コメントに揃う |
| **VRT Decision** | VRT snapshot mismatch の対応判断待ち | 髙橋さんが「snapshot 更新可」または「ロジック修正」を指示 |
| **CI Red** | CI が失敗している | CI を緑にする修正 |
| **Spec Ambiguity** | 仕様が確定していない | 髙橋さんまたは ChatGPT 司令塔が仕様確定 |
| **Data Risk** | データ破壊リスクが懸念される | リスク分析 + 安全策合意 |
| **Security Risk** | セキュリティリスクが懸念される | セキュリティレビュー完了 |
| **Tool Unavailable** | 必要なツール / 権限がない | ツール / 権限取得 |
| **Context Missing** | コンテキスト不足で判断不能 | 必要情報が提供される |
| **Human Copy/Paste**（v0.1 で新設） | 髙橋さんの手動コピペが必要 = 自動化候補 | （該当時は次フェーズの自動化・テンプレ化候補として記録） |

### 12.2 Human Copy/Paste の特別扱い

「Human Copy/Paste」が発生している場合、それは **将来自動化・テンプレ化すべき候補**。Blocked By: Human Copy/Paste と明記しつつ、PR コメントまたは HANDOFF に「ここに人手が必要だった」事実を残す。これにより：

- Phase 2 以降の改善対象が GitHub 上に蓄積される
- 「何度も同じコピペが必要だった」パターンが可視化される
- テンプレ化 / 半自動化の優先順位付けに使える

### 12.3 各 PR / Task で Blocked By を明記

完了報告テンプレ（§6.1）の Blocked By 欄に上記分類のいずれか、または `null`（停止していない）を記入する。

---

## 13. 禁止事項

本運用設計（v0.1）そのものの禁止事項を明記する。

### 13.1 設計の前提として禁止すること

- **AI 同士の完全自動連携を前提にしない**
  - v0.1 では「AI が AI を呼ぶ」「AI が AI のコメントを自動転記する」前提は採らない
- **危険操作を自動化しない**
  - Ready / merge / release / deploy / publish / branch 削除 / snapshot 更新等は人間承認制を維持
- **GitHub Actions や Bot 実装に進まない**
  - v0.1 は運用ルール設計のみ
  - Actions / Bot は Phase 5 で別設計・別レビュー・別承認
- **token / secret / credential を扱わない**
  - 本設計内で trial 的にも認証情報には触れない
- **branch protection を変更しない**
  - 既存の保護設定はそのまま
- **release / deploy / publish を自動化しない**
  - 公開系は明示許可制を維持
- **main 直接 push を許可しない**
  - PR 経由を必須とする
- **人間承認なしの merge を許可しない**

### 13.2 本 PR の禁止事項

- 実装ファイル変更禁止（`shogi_v4.html` / `test/` / `test/e2e/` / `index.html` / `data/`）
- workflow 変更禁止
- 自動化実装禁止
- Bot 実装禁止
- `package*.json` / lockfile 変更禁止
- `playwright.config.js` 変更禁止
- VRT snapshot 変更禁止
- CSS / layout 変更禁止
- token / secret / credential 操作禁止
- branch protection 変更禁止
- 後続タスク着手禁止（§16 候補すべて）
- RESET-UX の後続実装着手禁止
- unrelated docs cleanup 禁止
- unrelated refactor 禁止
- Ready 化 / merge / main 直接 push / release / deploy / publish / branch 削除 禁止

---

## 14. 段階的導入計画

v0.1 では運用ルール設計のみ。段階的に以下を検討する。

### 14.1 Phase 1（v0.1 着地直後の最初の実用化候補）

- **PR 本文 / コメントに Next Action 欄を必須化**
- **Claude Code 完了報告テンプレを改善**（§6 テンプレ準拠）
- **review request draft を PR コメントに残す**

タスク候補：`TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT`

### 14.2 Phase 2

- **`docs/ops/ai_work_queue.md` を作成**
  - Task ID / PR / Status / Blocked By / Next Action / Next Owner を一覧化
  - HANDOFF.md とは別の高速参照表
- 既存 PR / Task の一括棚卸し

タスク候補：`TOUR-OPS-AI-WORK-QUEUE-DESIGN`

### 14.3 Phase 3

- **GitHub Issue を task board として使う**
- **label 運用を検討**：
  - `ai:review-waiting` — レビュー待ち
  - `ai:human-approval-needed` — 人間承認待ち
  - `ai:blocked` — 何らかの理由で停止
  - `risk:light` — Level 0〜2
  - `risk:medium` — Level 3
  - `risk:heavy` — Level 4〜5

タスク候補：未命名（Phase 3 検討時に起票）

### 14.4 Phase 4

- **低リスク作業の半自動化を検討**
- ただし **Ready / merge は引き続き明示許可制**
- 候補：HANDOFF 追記の半自動化 / closure note 生成支援 / PR 本文の Next Action 欄テンプレ展開

### 14.5 Phase 5

- **GitHub Actions / Bot / API 連携を検討**
- ただし **別設計・別レビュー・別承認** が必要
- v0.1 のスコープ外

---

## 15. RESET-UX シリーズから得た教訓

PR #112〜#121 を具体例として、以下を整理する。

### 15.1 良かったこと（v0.1 で標準化）

- **DESIGN → IMPL-LIGHT 分離**：design doc を docs-only で先行着地 → IMPL は最小限。レビュー対象が分割され、リスク評価が容易に。
- **小さい PR**：1 PR 1 関心事。merge コスト / 切り戻しコストが低い。
- **禁止事項明示**：依頼文末尾に「やってはいけないこと」を列挙したため自律逸脱が起きない。
- **VRT 自律更新禁止**：snapshot 更新は必ず髙橋さん明示許可。VRT red が出ても勝手に baseline を上書きしない運用が定着。
- **closure PR**：シリーズ単位で closure note を作成（PR #121）。後続 AI が一望できるエントリポイントを提供。
- **review 結果を Must Fix / Should Fix / Nice to Have に分類**：判定が機械的に拾えるため Ready 化判断が高速化。

### 15.2 重かったこと（v0.1 で改善対象）

- **コピペ依存**：髙橋さんの手動コピペが各ステップで必須だった。
- **依頼文が長い**：DESIGN 依頼文も IMPL 依頼文も Full Prompt（数千文字）になりがち。Ready 化や merge 等の繰り返し操作にも長い依頼文を使っていた。
- **review 依頼を毎回手動作成**：cowork / Codex 向け依頼文を毎 PR で組み立てていた。
- **髙橋さん不在時に止まる**：上記すべてが髙橋さん依存のため、夜間 / 休日 / 業務時間中は進行停止。

### 15.3 今後活かすこと（v0.1 で組み込み）

- **PR コメントに次アクションを残す**（§4.2 / §6 / §10）
- **review request draft を Claude Code に作らせる**（§9.1 / §10.1）
- **closure はシリーズ単位**（RESET-UX-SERIES-CLOSURE のパターン継続）
- **risk level によって手順を変える**（§7 の Level 0〜5）
- **Short Prompt の活用**（Ready 化 / merge / minor fix は短いプロンプトで足りる、§11.2）

---

## 16. 後続タスク候補

今回の運用設計後に考えられる後続タスクを整理する。**本 PR では着手しない**。

### 16.1 候補一覧

| 候補 Task ID | 種別 | 概要 | 優先度 |
|---|---|---|---|
| **TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT** | impl-light | Claude Code 完了報告テンプレの改訂 / PR 本文に Next Action / Blocked By 欄追加 | 第一 |
| **TOUR-OPS-AI-WORK-QUEUE-DESIGN** | docs-only | `docs/ops/ai_work_queue.md` の設計 | 第二 |
| **TOUR-OPS-PR-TEMPLATE-DESIGN** | docs-only | SHOGI-TOUR 用 PR テンプレート（`.github/PULL_REQUEST_TEMPLATE.md`）設計 | 第三 |
| **TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN** | docs-only | cowork / Codex / ChatGPT 用レビュー依頼テンプレ設計 | 第四 |
| **TOUR-OPS-HANDOFF-FORMAT-DESIGN** | docs-only | HANDOFF.md エントリ書式の整理 / Section 5.5 の構造化検討 | 第五 |
| **TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW** | docs-only | v0.1 実運用 1〜2 ヶ月後の反省と v0.2 への更新 | 観察後 |

### 16.2 注意

- 本 PR では上記すべて **着手しない**
- 起票判断は髙橋さん（ChatGPT 司令塔が候補提示可）
- 第一候補 `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` の実装内容は、v0.1 レビュー結果を反映してから決定する

---

## 17. 結論

- **SHOGI-TOUR の AI チーム運用は機能している**
  - RESET-UX 文言整合シリーズ（PR #112〜#121）で 10 件以上の連続成功
  - DESIGN → IMPL-LIGHT 分離 / 小さい PR / closure note のパターンが定着
- **しかし現状は髙橋さんの手動コピペに依存している**
  - 各 AI 間の受け渡しが髙橋さん経由
  - 髙橋さん不在時に作業が停止
  - 「コピペ係」業務が支配的になっている
- **v0.1 では GitHub 上に状態・次アクション・停止条件を残すことで、まずコピペ依存を減らす**
  - SSoT を GitHub に置く
  - 必須メタ情報テンプレを定義（Next Action / Next Owner / Blocked By 等）
  - リスクレベル分類（Level 0〜5）と人間承認必須操作リストで自律実行範囲を明確化
- **危険操作の自動化ではなく、低リスク作業の非同期化を目指す**
  - Ready / merge / release / deploy / publish / branch 削除 / VRT 更新 / workflow 変更 / token 操作 は明示許可制を維持
  - Level 0〜2 の docs-only / IMPL-LIGHT は Draft PR 作成・review request draft 生成まで自律可
- **髙橋さんの役割は「コピペ係」ではなく「承認者・方針決定者」へ移行する**
  - 不在時でも GitHub を見れば「今どこか / 次に誰が何をすべきか」が分かる状態を作る
  - 復帰時の判断（Ready 化 / merge / 後続起票）に集中できるよう、判断材料を GitHub 上に整備しておく

本 v0.1 は **設計のみ**。実装（テンプレ改訂・PR 本文欄追加・work queue 作成）は後続 `TOUR-OPS-ASYNC-AI-WORKFLOW-IMPL-LIGHT` 以降で扱う。v0.1 着地後は 1〜2 ヶ月の運用観察を経て v0.2 改訂を検討する。
