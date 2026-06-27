# エージェント役割定義と職務分離（SoD）正本（repo 版）

> **これは repo 内の正本（canonical）です。** cowork ワークスペース側 `~/AI_Projects/00_PMO/AGENT-ROLES-AND-SOD.md` の faithful mirror。パイプライン本体＝[`AI-DEV-PIPELINE.md`](./AI-DEV-PIPELINE.md) / 書き戻し＝[`CODEX-RESULT-PROTOCOL.md`](./CODEX-RESULT-PROTOCOL.md)。
>
> 目的: 各エージェントの役割をブレなく固定し、「作者が自分の成果物をレビューする（自己レビュー）」を構造的に禁止する。レビューの価値＝**作者と独立した敵対的チェック**を担保する。
> 背景: 役割が滲んでいた（cowork が「二次レビュー」でコード判定まで出す／Claude Code が設計・実装・レビューを同一ラインで持ちうる＝自己レビュー）。これを職務分離（Separation of Duties, SoD）で塞ぐ。

## 1. 役割（1エージェント・1セッション＝1役割／タスク）
| 役割 | 素性(vendor) | 担当 stage | やること | やってはいけないこと |
|---|---|---|---|---|
| **人間** | — | intake / ready-for-merge 承認 | 要求発信・最終承認・merge・production | — |
| **cowork（PM）** | Anthropic（本セッション系） | triage / reconcile / monitor | 棚卸し・割当・可視化・drift 検知・承認段取り | **設計・実装・コードレビュー判定**（レビューの“判定”を出さない）|
| **Claude Code（実装ライン）** | Anthropic | design / implementing / needs-fix | 設計・実装・self-check・Draft PR・結果書き戻し | **自分の成果物のレビュー判定**・Ready化/merge |
| **レビュアー（設計/実装）** | **独立**：L4=Codex(OpenAI・クロスベンダー必須) / L3=別セッションの Claude Code レビューエージェント(独立必須) / L≤2=同一ベンダー別セッション可(任意) | design-review / code-review | read-only 判定（`verdict: go / conditional-go / block`）＋Must/Should/Nice | 実装・自作箇所のレビュー・merge |
| **ChatGPT（相談役）** | OpenAI | （工程外）consult | 仕様割れ・BLOCK・再設計・優先順位の相談 | 実装・承認 |
| **独立検証エージェント** | 別セッション（必要時 別vendor） | （工程外）audit | PM/reconciler 出力の監査・高リスク作業の最終確認 | 実装・承認 |
| **scheduled actor（reconciler 等）** | 定期実行タスク | reconcile / monitor / audit | 継続監視・ラベル前進（単一ライター）・整合性チェック・ゼロ記憶監査の定例化 | 設計・実装・レビュー判定・承認 |

## 2. 絶対ゲート（SoD・独立性）
- **G1 作者≠レビュアー**: あるタスクの design を作った素性は、その design-review をしない。implement した素性は、その code-review をしない。
- **G2 独立コンテキスト**: レビューは**作者と別セッション**で、入力は PR/Issue 本文＋diff のみ（設計セッションの記憶を引き継がない）。
- **G3 L レベル別レビュー要否＋L4 クロスベンダー**: design-review/code-review の要否を **L0–L4** で分岐（L0-1=省略可 / L2=任意・同一ベンダー別セッション可 / L3=独立必須 / L4=クロスベンダー必須）。**L4 の code-review は Codex（OpenAI・クロスベンダー）必須**＝最重要層は Anthropic の実装を Anthropic が自己採点しない。**L3 は独立 code-review 必須だが、別セッション・別素性の Claude Code レビューエージェントで可**（Codex 週次枠を温存するため L3 までは同一ベンダー別素性で独立性を担保。作者≠レビュアー・実装者の自己レビュー禁止は厳守）。（相談役 #265 反映・全件 design-review は課さない）
- **G4 self-check ≠ レビュー**: Claude Code の self-check は「実装」工程の一部。**code-review ゲートを満たさない**（別途独立レビューが要る）。
- **G5 1セッション1役割**: 同一セッションで design と review、implement と review を**同居させない**。役割は1タスクにつき1つ。
- **G6 PM の独立監査**: cowork（PM）は**レビュー判定を出さない**。PM/reconciler 自身の正しさは独立検証エージェントが監査する（PM が自分を採点しない）。

### 2-1. L レベル別レビュー要否（早見表）
| L | 例（憲章 L1–L5 対応） | design-review | code-review |
|---|---|---|---|
| L0 | 雑務（コメント/ラベル等） | 省略可 | 省略可 |
| L1-2 | docs・test・小 CSS | 省略可 | 任意（同一ベンダー別セッション可） |
| L3 | runtime（shogi_v4.html ロジック等） | 推奨 | **独立 code-review 必須（別セッション Claude Code レビューア）** |
| L4 | scripts 本体・ゲート/ツール | **必須** | **クロスベンダー必須（Codex）** |
| L5 | production 反映 | — | **人間専用**（AI は実行しない） |

## 3. v2 パイプラインとの対応（誰がどの前進を書くか）
- `## 設計完了`＋マーカー `cowork-status: design-done`＝Claude Code（design）→ design-review は**別素性レビュアー**が `## 設計レビュー結果`＋マーカー `cowork-status: design-review` / `verdict:`。
- `## 実装完了`＋マーカー `cowork-status: implement-done`＝Claude Code（implementing）→ code-review は**別素性レビュアー（L4=Codex / L3=別セッション Claude Code レビューア）**が `## Codexレビュー結果`＋マーカー `cowork-status: code-review-result` / `verdict:`。
- ラベル前進は reconciler のみ（単一ライター）。reconciler は前進時に**レビュアー素性 ≠ その工程の作者素性**（design-review は設計者、code-review は実装者＝**stage 別**）を検証し、自己レビューを検知したら前進を拒否して `flag:sod-violation` を立てる（詳細 §4）。

## 4. 独立性の検証（自己レビューを機械検知）
- 各レビュー書き戻しコメントは、機械可読マーカーの **`reviewer:` フィールドに素性 ID** を記す（[`AI-DEV-PIPELINE.md §3-1`](./AI-DEV-PIPELINE.md)）。人間可読の併記として末尾に **`レビュアー素性: <vendor/agent id>`** 欄も置く（テンプレ常設）。
- reconciler は前進時に、**工程ごとに照合相手を変えて**自己レビューを機械検知する（**SoD は stage 別＝G1**）:
  - **design-review**: レビュアー素性（`## 設計レビュー結果` マーカーの `reviewer:`）≠ **設計者素性**（`## 設計完了` マーカーの `reviewer:` ＝ design actor）。
  - **code-review**: レビュアー素性（`## Codexレビュー結果` マーカーの `reviewer:`）≠ **実装者素性**（`## 実装完了` マーカーの `reviewer:` ＝ implement actor）。
  - いずれも一致＝SoD 違反（G1）として前進せず人間に上げる（`flag:sod-violation`）。※ 同一素性が design と implement を兼ねるのは可（禁止は各工程の self-**review** のみ）。
- 識別子の付与・チェックの実装は #264 系で repo に反映済（`.github/pull_request_template.md` に「レビュアー素性」欄・構造化フィールド・凍結マーカー雛形を常設）。

## 5. 各エージェントの実測 capability（仮定しない・台帳化）— **役割境界（v2.1-final 条件4）**
役割割当は「できるはず」で決めない。**実測した能力**に合わせる。新エージェントを役割に充てる前に、本人に capability を宣言/実測させ（例: Issue #265 で ChatGPT が実測宣言）、この表を更新する。

> **役割境界の原則（v2.1-final 条件4）**: 継続監視・定期実行（reconciler）・ゼロ記憶監査の定例化は **scheduled actor（スケジュール実行タスク）の担当**。**Claude Code / Codex / 相談役は「呼ばれたら1工程を完遂して書き戻す」起動駆動**であり、**自律ポーリング（常時ボードを見て前進させる）はしない／できない**。capability を仮定して監視役を割り当てない。

| エージェント | できる（実測） | できない（実測） | 向く役割 |
|---|---|---|---|
| 相談役(ChatGPT) | GitHub 経由で Issue/PR/コメント/一部ファイルを読む・Issue へコメント書き戻し（#265 実測） | 継続監視・自動定期実行・ローカル未push変更の把握・Actions ログ常時監視・人間専用承認の代行 | **オンデマンド**の設計/実装レビュー・相談（バス経由）。監視/定期実行は不可＝scheduled actor(reconciler) が担当 |
| Codex | **実測済(#262)**: `@codex review` で Draft PR 含むレビューを GitHub に投稿（`chatgpt-codex-connector[bot]` 名義・💡サマリ＋P0-P3 バッジ＋👍・クラウド実行でデスクトップ非依存） | 継続監視/定期実行は不可（オンデマンド or PR オープン時トリガ）・Plus はスコープ「自分のPR」・YAML マーカーは書かない（ネイティブ形式） | **L4** の独立 code-review（クロスベンダー・bot identity で SoD 自動判別）。L3 は週次枠温存のため別セッション Claude Code レビューアに委譲 |
| Claude Code | 設計・実装・self-check・Draft PR・repo 書込 | 自作のレビュー（SoD で禁止）・merge/Ready/承認・**自律ポーリング/継続監視** | design / implementing |
| cowork(PM) | GitHub Issue/PR/コメント・ラベル読書き・定期タスク(reconciler)・可視化 | **ラベル新規作成・repo Contents 書込**・merge/Ready/承認 | triage / reconcile / monitor |
| scheduled actor(reconciler) | 継続監視・定期実行・ラベル前進（単一ライター）・整合性チェック・ゼロ記憶監査の定例化 | 設計・実装・レビュー判定・承認 | reconcile / monitor / audit |

→ 重要: 相談役・Codex・Claude Code は**継続監視ができない**＝「常時ボードを見て前進させる」役は担えない。その責務は **scheduled actor（reconciler）**が持つ。**ラベルの新規作成は cowork でも不可**（実測）＝ラベル作成は Claude Code（repo 書込可）が #264 系で実施する。役割は capability に従って割り当てる。

## 6. レビュアー SPOF の手当て（escalation・v2.1-final 条件3）
**L4 の code-review を Codex 一者に依存すると、Codex が応答しないときにパイプラインが停止**する（単一障害点＝SPOF）。decision queue（[`AI-DEV-PIPELINE.md §8` 項目5](./AI-DEV-PIPELINE.md)）に下記 escalation を**必ず含める**:

- **review SLA**: code-review/design-review 依頼から一定時間（既定: 運用で定める。例 24h）応答が無い＝stale。
- **SLA 超過時の escalation**: ①**人間レビュー**にエスカレーション、または ②**代替レビュアー**（別セッションの Claude Code レビューエージェント＝L≤2 の場合 / 別の独立素性）へ振り替え。
- **default action（無回答時の安全側既定）**: 既定は**前進させない**（merge しない）。SLA 超過は decision queue に「要人間判断」カードとして必ず浮かせ、放置で勝手に GO にならない（安全側に倒す）。
- SoD は維持: 代替レビュアーも **G1（作者≠レビュアー）/ G3（L レベル別）** を満たすこと。Codex 不在を理由に実装者素性が自己レビューすることは禁止。

---
正本（repo 版）。パイプライン＝[`AI-DEV-PIPELINE.md`](./AI-DEV-PIPELINE.md) / 書き戻し＝[`CODEX-RESULT-PROTOCOL.md`](./CODEX-RESULT-PROTOCOL.md) / 憲章 `AI-PMO-CHARTER.md`（cowork ワークスペース側サイドカー）。
