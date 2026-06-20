# AI 開発パイプライン（PMO-OPS v2.1-final）— 工程・状態機械・可視化の正本

> **これは repo 内の正本（canonical）です。** 全 AI（Claude Code / Codex / レビューエージェント）と人間が**実装着手前に必ず読む**場所として `docs/ai-ops/` に配置しています。cowork ワークスペース側 `~/AI_Projects/00_PMO/AI-DEV-PIPELINE-v2.md` の faithful mirror（v2.1-final）であり、差異が出た場合は本 repo 版＋当事者レビューの合意（#266 / v2.1-final）を正とします。
> 関連: 職務分離＝[`AGENT-ROLES-AND-SOD.md`](./AGENT-ROLES-AND-SOD.md) / 結果書き戻し＝[`CODEX-RESULT-PROTOCOL.md`](./CODEX-RESULT-PROTOCOL.md)。
>
> 目的: 人間1人が 200〜300 タスクを並行で回しても**漏れが構造的に起きない**ように、工程・状態・前進トリガ・可視化を一本化する。
> 原則: **状態の正本は GitHub（ラベル＋定型コメント＋機械可読マーカー）。マトリクスボードはそれを映す鏡。** 各工程の完了は GitHub への書き込みで記録され、定期タスク（reconciler）がラベルを1段だけ前進させる。だから「押し忘れ・言い忘れ」が前進を止めない。
> 背景: v1 は「Codex 判定コメントを拾ってラベル前進」しか見ておらず、Issue↔PR の整合性チェックが無く、ラベル語彙も複数あってドリフトした（2026-06-20 棚卸しで #254/#255/#257/#261 の崩れを検出）。v2 はこれを状態機械＋reconciler で恒久的に塞ぐ。

---

## 1. 役割（誰が何をするか）
- **人間** = 要求の発信者・最終承認者（merge / production）。
- **cowork（PM）** = 受付→トリアージ（範囲確定・Review Level 判定・担当割当・ChatGPT 要否判断）・横断可視化・滞留監視・整合性監視。実装はしない。**レビュー判定も出さない**（→ SoD G6）。
- **ChatGPT（相談役）** = 仕様割れ・BLOCK・優先順位の大再設計・法務労務経営の相談。工程ではなくフラグ（`flag:consult-chatgpt`）。
- **Claude Code（実装ライン）** = 設計・実装・自己検証・Draft PR・結果コメント書き戻し。**起動駆動**（呼ばれたら1工程を完遂して書き戻す。自律ポーリングしない → §8-3 条件4）。
- **Codex / レビューエージェント** = 設計レビュー・実装レビュー（read-only）。判定を GitHub コメントで書き戻す。**起動駆動**（`@codex review` 等のトリガで動く）。
- **scheduled actor（reconciler 等の定期実行タスク）** = 継続監視・ラベル前進・整合性チェック・ゼロ記憶監査の定例化。**唯一の継続監視主体**（→ §4・§8-3 条件4）。

## 2. 工程と状態（1タスク＝1 Issue＝`stage:` ラベル1個）
`stage:` ラベルは**常に1つだけ**付く＝そのタスクの現在地。複数付けない。

| # | stage ラベル | 工程 | 担当 | この工程を**完了**した記録（前進トリガ） | 次 |
|---|---|---|---|---|---|
| 0 | `stage:intake` | 要求受付 | 人間 | 要求 Issue 起票（タイトル冒頭 `[req]`） | PM が拾う→1 |
| 1 | `stage:triage` | トリアージ | cowork | コメント `## トリアージ`（範囲・Review Level L0-4・担当・ChatGPT 要否）＋マーカー `cowork-status: triage` | →2（設計）|
| 2 | `stage:design` | 設計 | Claude Code | コメント `## 設計完了`（設計ノート/Draft PR・対象ファイル）＋マーカー `cowork-status: design-done` | →3 |
| 3 | `stage:design-review` | 設計レビュー | Codex/レビューエージェント | コメント `## 設計レビュー結果` ＋マーカー `cowork-status: design-review` / `verdict: go\|conditional-go\|block` | go/conditional-go→4 / block→2 |
| 4 | `stage:implementing` | 実装 | Claude Code | コメント `## 実装完了`（Draft PR・固定 head SHA・検証結果）＋マーカー `cowork-status: implement-done` | →5 |
| 5 | `stage:code-review` | 実装レビュー | Codex/レビューエージェント | コメント `## Codexレビュー結果` ＋マーカー `cowork-status: code-review-result` / `verdict: go\|conditional-go\|block` | go/conditional-go→6 / block→`needs-fix` |
| - | `stage:needs-fix` | 差し戻し実装 | Claude Code | 再 push＋コメント `## 実装完了`（更新 head SHA）＋マーカー `cowork-status: implement-done` | →5（再レビュー）|
| 6 | `stage:ready-for-merge` | 最終確認/人間承認 | 人間 | PR を merge（明示承認語） | →7 |
| 7 | `stage:done` | 完了 | — | Issue close（PR merged 検知で自動） | — |
| - | `stage:blocked` / `stage:on-hold` | 保留 | any | コメント `## 保留`（理由・解除条件）＋マーカー `cowork-status: hold` | 解除で元工程へ |

補助フラグ（stage と直交・複数可）: `flag:consult-chatgpt` / `flag:human-decision`（人間判断待ち）/ `flag:secret-risk` / `flag:aging`（SLA 超過・reconciler 自動付与）/ `flag:sod-violation`（自己レビュー検知・reconciler 自動付与 → SoD §3）。

## 3. 前進プロトコル（全工程共通・書き戻し必須）
各工程の担当は、完了時に**対象 Issue（実装系は PR）に定型ヘッダ付きコメントを1件**投稿する。フォーマット:
- **先頭行**を上表の**完了ヘッダ**で始める（`## トリアージ` / `## 設計完了` / `## 設計レビュー結果` / `## 実装完了` / `## Codexレビュー結果` / `## 保留`）。これは**人間可読の見出し**。
- **末尾に機械可読マーカー（fenced YAML）を1ブロック**置く（§3-1）。**機械判定はこの YAML が唯一の正**。人間可読の見出しや旧 `判定: GO` 行は併記可だが*正ではない*。
- 「自分のチャットで終わり」は未完了。**GitHub に書き戻すまでが1工程**。
- 詳細な Codex 書き戻し仕様（ネイティブ形式の読み取り含む）は [`CODEX-RESULT-PROTOCOL.md`](./CODEX-RESULT-PROTOCOL.md)（設計レビューも同形式）。

### 3-1. 機械可読マーカー（**文法は凍結＝v2.1-final 条件1・唯一の実装 must**）
判定・工程の機械検知は **fenced YAML ブロック**で行う（ヘッダ完全一致は廃止。全角/半角/コピペ崩れに強い）。**以下が唯一の正本フォーマット**:

```yaml
cowork-status: code-review-result   # 固定列挙: triage | design-done | design-review | implement-done | code-review-result | hold
verdict: go                         # 固定列挙（小文字ASCII）: go | conditional-go | block （判定工程 3,5 のみ）
reviewer: codex                     # vendor/agent id（マーカーを出した素性。SoD 自己レビュー検知に使用）
task: 264                           # 対象 Issue 番号
```

**凍結ルール（reconciler の正規表現・各エージェントの emitter はこの enum に厳密一致させる）**:
- キーは **ASCII 固定**: `cowork-status` / `verdict` / `reviewer` / `task`。
- `cowork-status` の値は固定列挙: `triage` / `design-done` / `design-review` / `implement-done` / `code-review-result` / `hold`。
- `verdict` の値は**小文字 ASCII** `go` / `conditional-go` / `block` の**いずれか1つのみ**。`GO` / `Conditional GO` / `CONDITIONAL_GO` / `BLOCK` 等の**表記ゆれは禁止**（旧表記。人間可読として併記する場合も機械判定には使わない）。判定工程（3 design-review・5 code-review）でのみ必須、それ以外では省略。
- `reviewer` は素性 ID（例: `codex` / `claude-code` / `chatgpt`）。判定工程ではレビュアー素性、その他工程ではマーカーを出したアクター素性。
- **1コメント＝マーカー1ブロック**。同一 Issue/PR では**最新コメントのマーカーを優先**（latest-wins）。

## 4. ラベルを書くのは reconciler だけ（単一ライター原則）
- 人間/エージェントは**コメント＋マーカーを置くだけ**。`stage:` ラベルの付け替えは**定期タスク（reconciler）が唯一の書き手**＝**scheduled actor**（→ §8-3 条件4）。
- これにより二重書き込み・競合・Issue↔PR ラベルずれ（v1 の #254/#255 ドリフト）が原理的に起きない。
- reconciler（既存 `cowork-dispatch-refresh` を拡張）の毎回の処理:
  1. 全 `[req]`/`[cowork-dispatch]` Issue と PR を取得し、1タスク=1 Issue / Issue↔PR を対応付け。
  2. 各 Issue の**最新の機械可読マーカー**を読み、`stage:` を1段前進（verdict go/conditional-go/block で分岐）。
  3. PR が merged なら `stage:done` ＋ Issue close。
  4. **整合性チェック（drift detector）** を実行し、異常をボードの「⚠️ 要注意」へ。
  5. 各タスクの「現工程の滞留時間」を計算し SLA 超過に `flag:aging`。
  6. **レビュアー素性 ≠ 実装者素性**を検証し、自己レビューを検知したら前進せず `flag:sod-violation`（→ SoD §3）。
  7. マトリクスボードを再生成。
- **2段階化（dry-run→proposed→apply）**: 各 run はまず *proposed-actions* を出すだけ。ポリシー内の安全アクションのみ *apply*。危険/曖昧は提案止まりで decision queue へ（誤前進を構造的に防ぐ）。
- **監査ログ**: stage ラベル更新は必ず監査ログ（actor=reconciler / 時刻 / 旧→新 / 根拠コメントID）を残す（追跡・巻き戻し可能に）。

### 4-1. 整合性チェック（drift detector）が毎回見る異常クラス
- A: merged 済みなのに open かつ未 done の Issue（例 #261）→ 自動 done クローズ候補。
- B: PR が review 待ちなのに Issue の stage が不一致（例 #254 ラベル欠落）→ stage 同期。
- C: どのボード行にも出ない review 待ち PR（例 #257 フォールバック）→ 孤児レビュー要求として明示。
- D: 同一 PR を複数 Issue が指す（例 #255 と #259）→ 二重トラッキング警告（1タスク=1 Issue 違反）。
- E: テスト baseline の WARN>0（実在しないテスト参照など）→ ノイズ警告。

## 5. マトリクスボード（可視化）
- **行** = タスク（Issue 1本）。**列** = §2 の7工程ステッパー（intake→triage→design→design-review→implement→code-review→merge→done）。
- 各行: 現在地ハイライト / 完了工程はチェック / blocked は赤 / 現工程の担当 / 滞留時間（SLA 色）/ Issue# / PR# / 文脈ボタン（レビュー依頼パックをコピー・PR を開く 等）。
- ボタンや GitHub 書き込みで状態が進む。**状態の正は常に GitHub、ボードは鏡**（ボード上のボタンは補助操作で、押下＝該当 GitHub 書き込みを促す/コピーする）。
- 上部: 工程別件数カード / blocked 件数 / aging 件数 / 「⚠️ 要注意（整合性）」パネル（drift detector 出力）。
- フィルタ: 工程・担当・要注意・プロジェクト（スウィムレーン）。

## 6. 200〜300 並行に耐えるための原則
- **1タスク=1 Issue=stage 1個**（一意・相互排他）。PR の二重トラッキング禁止。
- **単一ライター**（ラベルは reconciler だけ）＝競合・ずれが起きない。
- **例外管理**: 全件を見ない。SLA 超過（aging）・blocked・drift の**詰まった行だけ**が浮く設計。
- **冪等・固定 SHA・タイムスタンプ**: 各前進は冪等で二重実行に強い。レビュー対象は固定 head SHA で「Codex 迷子」を防ぐ。
- **プロジェクト別スウィムレーン**で横断を見つつ案件内の順序も保つ。

## 7. v1 からの移行（ラベル対応表）— **cut over は reconciler 稼働後**
本 #264 reconciliation で行うのは **`stage:` / `closed:*` / `flag:*` ラベルの作成と本対応表の明文化まで**。**既存ラベル（`needs-codex` 等）からの一括張替え（cut over）は行わない**（破壊的操作回避・空振り期間の回避＝v2.1-final 条件2）。

| 旧ラベル | 新 `stage:` | 備考 |
|---|---|---|
| `needs-codex` | `stage:code-review` | code-review 待ち |
| `ready-for-human-merge` / `codex-go` | `stage:ready-for-merge` | 人間 merge 待ち |
| `needs-fix` / `codex-block` | `stage:needs-fix` | 実装差し戻し |
| `human-approved` / `merged` | （履歴ラベル・`stage:done` 相当） | 既存運用を維持 |

**cut over タイミング**: 上記張替えは **reconciler（scheduled actor）が稼働してから一括で行う**。reconciler 稼働までの間は、マーカーを出しても消費する前進主体が居ないため、**cowork が既存ラベル（`needs-codex` 等）で手動 reconcile を継続**する。reconciler 稼働を合図に、対応表に沿って一括 cut over する（人間の破壊的操作なし・冪等マッピング）。既存の Codex 書き戻しは reconciler が読み替えて工程5の前進トリガとして有効。

## 8. v2.1 改訂（相談役 条件付きGO 反映・2026-06-20 / consult Issue #265）
相談役レビュー＝「思想は GO。ただし下記を入れずに 200-300 並行へ拡大は危険」。GO 条件を v2.1 として正式に取り込む。

1. **reconciler 2段階化（dry-run→proposed→apply）**: §4 に反映。
2. **監査ログ**: §4 に反映。
3. **機械可読マーカー（ヘッダ完全一致を廃止・文法凍結）**: §3-1 に反映（**唯一の正本フォーマット**）。
4. **SoD は L0–L4 リスクレベル別**（全件 design-review 必須をやめる）: L0-1=レビュー省略可 / L2=任意・同一ベンダー別セッション可 / L3=独立 code-review 必須 / L4=クロスベンダー必須。詳細＝[`AGENT-ROLES-AND-SOD.md`](./AGENT-ROLES-AND-SOD.md)。
5. **decision queue 強化**: 各決定カードに SLA（期限）/ stale 判定 / escalation（放置時の上げ先）/ **default action**（無回答時の安全側既定挙動）を持たせる。人間が詰まっても既定で安全に倒れる（→ §8-3 条件3 escalation を含む）。
6. **ゼロ記憶監査の定例化**: 「記憶ゼロ再構築」監査を**定期実行**（reconciler とは別セッションの独立監査＝scheduled actor の担当 → §8-3 条件4）。実態と不一致＝仕組み欠陥として decision queue へ。

### 8-1. ライフサイクル（相談役の最重要追加指摘）
状態に「終わり方」と「関係」を明示する。無いと孤児 Issue / 廃案 PR / merged 放置が出る（今日の #257/#261/#255 がまさにこれ）。
- **終了理由ラベル**: `closed:done` / `closed:duplicate` / `closed:superseded` / `closed:not-planned`。
- **関係メタ（Issue/PR 本文の構造化フィールド）**: `supersedes:` / `superseded_by:` / `related_pr:` / `canonical_decision:`（テンプレに常設 → `.github/`）。
- reconciler はこれを使い、superseded を自動クローズ候補に、`related_pr` が merged の open Issue を done に、duplicate を束ねる。

### 8-2. Codex の GitHub レビューはネイティブ形式で読む（実測 2026-06-20 / PR #262）
Codex の GitHub コードレビューは**私たちの YAML マーカーでは書かない**。実測で確認:
- 投稿者 `chatgpt-codex-connector[bot]`（実装者と別 identity＝SoD 自動判別可）。形式は「💡 Codex Review」サマリ（review state=COMMENTED）＋ **P0/P1/P2/P3 バッジ付きインライン指摘**、指摘なしは 👍。
- トリガー: ①PR をレビュー用に開く ②Draft を Ready にする ③`@codex review` コメント。**Draft 据え置き運用では ③手動 `@codex review` が経路**（自動は Draft に発火しない）。Plus プランはスコープ「自分の PR」（Claude Code は自アカウント gh で開くので該当）。クラウド実行＝デスクトップ非依存。
- **reconciler は Codex ネイティブ出力を §3-1 の凍結 enum に変換**（YAML を期待しない）: 指摘なし/👍 → `verdict: go` / P2・P3 のみ → `verdict: conditional-go` / P0・P1 あり → `verdict: block`（needs-fix）。最大 severity で決める。
- §3-1 の YAML マーカーは Claude Code の `## 実装完了` や人間が貼る場合用。**Codex の GitHub レビューはネイティブ形式の例外**として reconciler が読む（詳細 → [`CODEX-RESULT-PROTOCOL.md`](./CODEX-RESULT-PROTOCOL.md)）。

### 8-3. v2.1-final 条件（当事者2者の設計レビューで収束・2026-06-20 / #266）
Claude Code（#266 コメント 4757415323）と Codex（同 4757420499・再レビュー後）がともに **`conditional-go`**、**同一4条件に収束**。人間も運用モデルを GO 済。下記4点を反映して **v2.1-final＝合意成立**とし、#264（本 repo 反映）はこれを前提に実装する。

1. **マーカー文法の凍結（唯一の実装 must）**: `verdict` 表記ゆれ（`GO`/`Conditional GO`/`CONDITIONAL_GO`）を解消。小文字 ASCII `go | conditional-go | block` に固定、キー固定、1コメント1ブロック、最新優先。→ **§3-1 に反映済**（テンプレ `.github/` と [`CODEX-RESULT-PROTOCOL.md`](./CODEX-RESULT-PROTOCOL.md) も同 enum に統一）。
2. **空振り期間の回避**: reconciler（#264 系 scheduled actor）稼働までは `stage:*` への cut over を行わない。稼働までの間はマーカーを出しても消費者が居ないため、**cowork が手動 reconcile**（既存ラベル運用 `needs-codex` 等を継続）。reconciler 稼働を合図に一括 cut over。→ **§7 に反映済**。
3. **レビュアー SPOF の手当て**: L3+/L4 を Codex 一者に依存すると停止する。decision queue（§8 項目5）に **review SLA 超過 → 人間レビュー or 代替レビュアーへ escalation** を必ず含める。→ [`AGENT-ROLES-AND-SOD.md §6`](./AGENT-ROLES-AND-SOD.md) に明記。
4. **役割境界の明記（capability を仮定しない）**: 継続監視・定期実行（reconciler）・ゼロ記憶監査の定例化は **scheduled actor（スケジュール実行タスク）の担当**。Claude Code / Codex は「呼ばれたら1工程を完遂して書き戻す」**起動駆動**で自律ポーリングしない。→ [`AGENT-ROLES-AND-SOD.md §5`](./AGENT-ROLES-AND-SOD.md) に明記。

→ 3・4・8-1・8-2・8-3 のラベル/マーカー/フィールド/Codex 読取/条件反映は repo 反映（#264）と reconciler 実装に落とす。各エージェント capability（継続監視/定期実行は不可＝scheduled actor へ）は役割割当の前提（→ [`AGENT-ROLES-AND-SOD.md §5`](./AGENT-ROLES-AND-SOD.md)）。

---
正本（repo 版）。書き戻し詳細＝[`CODEX-RESULT-PROTOCOL.md`](./CODEX-RESULT-PROTOCOL.md) / 役割・SoD＝[`AGENT-ROLES-AND-SOD.md`](./AGENT-ROLES-AND-SOD.md)。憲章 `AI-PMO-CHARTER.md`・横断キュー `QUEUE.md` は cowork ワークスペース側のサイドカー（本 repo 非収録）。
