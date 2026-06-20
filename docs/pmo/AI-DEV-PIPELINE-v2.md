# AI 開発パイプライン v2 — 工程・状態機械・可視化の正本

> 目的: 人間1人が 200〜300 タスクを並行で回しても**漏れが構造的に起きない**ように、工程・状態・前進トリガ・可視化を一本化する。
> 原則: **状態の正本は GitHub（ラベル＋定型コメント）。マトリクスボードはそれを映す鏡。** 各工程の完了は GitHub への書き込みで記録され、定期タスク（reconciler）がラベルを1段だけ前進させる。だから「押し忘れ・言い忘れ」が前進を止めない。
> 背景: v1 は「Codex 判定コメントを拾ってラベル前進」しか見ておらず、Issue↔PR の整合性チェックが無く、ラベル語彙も複数あってドリフトした（2026-06-20 棚卸しで #254/#255/#257/#261 の崩れを検出）。v2 はこれを状態機械＋reconciler で恒久的に塞ぐ。

---

## 1. 役割（誰が何をするか）
- **人間** = 要求の発信者・最終承認者（merge / production）。
- **cowork（PM）** = 受付→トリアージ（範囲確定・Review Level 判定・担当割当・ChatGPT 要否判断）・横断可視化・滞留監視・整合性監視。実装はしない。
- **ChatGPT（相談役）** = 仕様割れ・BLOCK・優先順位の大再設計・法務労務経営の相談。工程ではなくフラグ（`flag:consult-chatgpt`）。
- **Claude Code（実装ライン）** = 設計・実装・自己検証・Draft PR・結果コメント書き戻し。
- **Codex / レビューエージェント** = 設計レビュー・実装レビュー（read-only）。判定を GitHub コメントで書き戻す。

## 2. 工程と状態（1タスク＝1 Issue＝`stage:` ラベル1個）
`stage:` ラベルは**常に1つだけ**付く＝そのタスクの現在地。複数付けない。

| # | stage ラベル | 工程 | 担当 | この工程を**完了**した記録（前進トリガ） | 次 |
|---|---|---|---|---|---|
| 0 | `stage:intake` | 要求受付 | 人間 | 要求 Issue 起票（タイトル冒頭 `[req]`） | PM が拾う→1 |
| 1 | `stage:triage` | トリアージ | cowork | コメント `## トリアージ`（範囲・Review Level L1-5・担当・ChatGPT 要否） | →2（設計）|
| 2 | `stage:design` | 設計 | Claude Code | コメント `## 設計完了`（設計ノート/Draft PR・対象ファイル） | →3 |
| 3 | `stage:design-review` | 設計レビュー | Codex/レビューエージェント | コメント `## 設計レビュー結果` + `判定: GO / Conditional GO / BLOCK` | GO→4 / BLOCK→2 |
| 4 | `stage:implementing` | 実装 | Claude Code | コメント `## 実装完了`（Draft PR・固定 head SHA・検証結果） | →5 |
| 5 | `stage:code-review` | 実装レビュー | Codex/レビューエージェント | コメント `## Codexレビュー結果` + `判定: GO / Conditional GO / BLOCK` | GO→6 / BLOCK→`needs-fix` |
| - | `stage:needs-fix` | 差し戻し実装 | Claude Code | 再 push＋コメント `## 実装完了`（更新 head SHA） | →5（再レビュー）|
| 6 | `stage:ready-for-merge` | 最終確認/人間承認 | 人間 | PR を merge（明示承認語） | →7 |
| 7 | `stage:done` | 完了 | — | Issue close（PR merged 検知で自動） | — |
| - | `stage:blocked` / `stage:on-hold` | 保留 | any | コメント `## 保留`（理由・解除条件） | 解除で元工程へ |

補助フラグ（stage と直交・複数可）: `flag:consult-chatgpt` / `flag:human-decision`（人間判断待ち）/ `flag:secret-risk` / `flag:aging`（SLA 超過・reconciler 自動付与）。

## 3. 前進プロトコル（全工程共通・書き戻し必須）
各工程の担当は、完了時に**対象 Issue（実装系は PR）に定型ヘッダ付きコメントを1件**投稿する。フォーマット:
- 先頭行を上表の**完了ヘッダ完全一致**で始める（`## トリアージ` / `## 設計完了` / `## 設計レビュー結果` / `## 実装完了` / `## Codexレビュー結果`）。
- 判定が要る工程（3,5）は本文に `判定: GO` / `判定: Conditional GO` / `判定: BLOCK` を1行入れる。
- 「自分のチャットで終わり」は未完了。GitHub に書き戻すまでが1工程。
- 詳細な Codex 書き戻し仕様は `dispatch/CODEX-RESULT-PROTOCOL.md`（設計レビューも同形式）。

## 4. ラベルを書くのは reconciler だけ（単一ライター原則）
- 人間/エージェントは**コメントを置くだけ**。`stage:` ラベルの付け替えは**定期タスク（reconciler）が唯一の書き手**。
- これにより二重書き込み・競合・Issue↔PR ラベルずれ（v1 の #254/#255 ドリフト）が原理的に起きない。
- reconciler（既存 `cowork-dispatch-refresh` を拡張）の毎回の処理:
  1. 全 `[req]`/`[cowork-dispatch]` Issue と PR を取得し、1タスク=1 Issue / Issue↔PR を対応付け。
  2. 各 Issue の最新の完了ヘッダコメントを読み、`stage:` を1段前進（GO/BLOCK で分岐）。
  3. PR が merged なら `stage:done` ＋ Issue close。
  4. **整合性チェック（drift detector）** を実行し、異常をボードの「⚠️ 要注意」へ。
  5. 各タスクの「現工程の滞留時間」を計算し SLA 超過に `flag:aging`。
  6. マトリクスボードを再生成。

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

## 7. v1 からの移行（ラベル対応）
- 旧 `needs-codex` → `stage:code-review`。旧 `ready-for-human-merge`/`codex-go` → `stage:ready-for-merge`。旧 `needs-fix`/`codex-block` → `stage:needs-fix`。
- 既存の Codex 書き戻し（`## Codexレビュー結果` + `判定:`）はそのまま工程5の前進トリガとして有効。
- 移行は reconciler 拡張時に一括マッピング（人間の破壊的操作なし）。

## 8. v2.1 改訂（相談役 条件付きGO 反映・2026-06-20 / consult Issue #265）
相談役レビュー＝「思想は GO。ただし下記を入れずに 200-300 並行へ拡大は危険」。GO 条件を v2.1 として正式に取り込む。

1. **reconciler 2段階化（dry-run→proposed→apply）**: 各 run はまず *proposed-actions* を出すだけ。ポリシー内の安全アクションのみ *apply*。危険/曖昧は提案止まりで decision queue へ。誤前進を構造的に防ぐ。
2. **監査ログ**: stage ラベル更新は必ず監査ログ（actor=reconciler / 時刻 / 旧→新 / 根拠コメントID）を残す。誤前進の追跡・巻き戻しを可能に。
3. **機械可読マーカー（ヘッダ完全一致を廃止）**: 判定の機械検知は fenced YAML ブロックで行う。人間可読の見出し（`## Codexレビュー結果`）は併記可だが*正*ではない。全角/半角/コピペ崩れに強い。例:
   ```yaml
   cowork-status: code-review-result   # triage|design-done|design-review|implement-done|code-review-result|...
   verdict: GO                         # GO | conditional-go | block （判定工程のみ）
   reviewer: codex                     # vendor/agent id（SoD 自己レビュー検知に使用）
   task: 260
   ```
4. **SoD は L0–L4 リスクレベル別**（全件 design-review 必須をやめる）: L0-1=レビュー省略可 / L2=任意・同一ベンダー別セッション可 / L3=独立 code-review 必須 / L4=クロスベンダー必須。（憲章 L1–L5 対応: L0≈雑務 / L1-2≈docs・test・小CSS / L3≈runtime / L4≈scripts本体 / L5≈production=人間専用）。
5. **decision queue 強化**: 各決定カードに SLA（期限）/ stale 判定 / escalation（放置時の上げ先）/ **default action**（無回答時の安全側既定挙動）を持たせる。人間が詰まっても既定で安全に倒れる。
6. **ゼロ記憶監査の定例化**: 「記憶ゼロ再構築」監査を定期実行（reconciler とは別セッションの独立監査）。実態と不一致＝仕組み欠陥として decision queue へ。

### 8-1. ライフサイクル（相談役の最重要追加指摘）
状態に「終わり方」と「関係」を明示する。無いと孤児 Issue / 廃案 PR / merged 放置が出る（今日の #257/#261/#255 がまさにこれ）。
- **終了理由ラベル**: `closed:done` / `closed:duplicate` / `closed:superseded` / `closed:not-planned`。
- **関係メタ（Issue/PR 本文の構造化フィールド）**: `supersedes:` / `superseded_by:` / `related_pr:` / `canonical_decision:`。
- reconciler はこれを使い、superseded を自動クローズ候補に、`related_pr` が merged の open Issue を done に、duplicate を束ねる。

### 8-2. Codex の GitHub レビューはネイティブ形式で読む（実測 2026-06-20 / PR #262）
Codex の GitHub コードレビューは**私たちの YAML マーカーでは書かない**。実測で確認:
- 投稿者 `chatgpt-codex-connector[bot]`（実装者と別 identity＝SoD 自動判別可）。形式は「💡 Codex Review」サマリ（review state=COMMENTED）＋ **P0/P1/P2/P3 バッジ付きインライン指摘**、指摘なしは 👍。
- トリガー: ①PR をレビュー用に開く ②Draft を Ready にする ③`@codex review` コメント。**Draft 据え置き運用では ③手動 `@codex review` が経路**（自動は Draft に発火しない）。Plus プランはスコープ「自分の PR」（Claude Code は自アカウント gh で開くので該当）。クラウド実行＝デスクトップ非依存。
- **reconciler は Codex ネイティブ出力を判定に変換**（YAML を期待しない）: 指摘なし/👍 → **GO** / P2・P3 のみ → **Conditional GO** / P0・P1 あり → **BLOCK(needs-fix)**。最大 severity で決める。
- §8 項目3 の YAML マーカーは Claude Code の `## 実装完了` や人間が貼る場合用。**Codex の GitHub レビューはネイティブ形式の例外**として reconciler が読む。

→ 3・4・8-1・8-2 のラベル/マーカー/フィールド/Codex 読取は repo 反映（#264）と reconciler 実装に落とす。相談役 capability（GitHub 読/コメント可・継続監視/定期実行/未push把握/承認は不可）も役割割当の前提（→ `AGENT-ROLES-AND-SOD.md §5`）。

---
正本。Codex 書き戻し詳細＝`dispatch/CODEX-RESULT-PROTOCOL.md`。憲章＝`AI-PMO-CHARTER.md`。横断キュー＝`QUEUE.md`。
