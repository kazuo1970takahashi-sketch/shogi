# SHOGI-TOUR｜AI 非同期運用 Phase 1 総括 / v0.2 化判断（TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW）

**Task ID**: `TOUR-OPS-AI-WORKFLOW-V0-2-REVIEW`
**作業種別**: docs-only review / AI 非同期運用 Phase 1 総括 / v0.2 化判断
**作成日**: 2026-05-16
**HEAD（作成時点の main）**: `32a3ab2`（PR #129 squash merge 後の main = TOUR-OPS-AI-TASK-CANDIDATE-TRIAL-001）
**位置づけ**: PR #122〜#129 で積み上がった AI 非同期運用シリーズ 8 PR を Phase 1 として **棚卸し・評価し、v0.2 へ進めるべきか判断する**。今回は **review note の新規作成に閉じる**。v0.2 本文作成・テンプレ実ファイル化・Candidate Registry 作成・branch 削除・Candidate Adopt・後続タスク着手には **進まない**。

---

## 0. メタ情報

- **Project**: SHOGI-TOUR（沼津支部 月例将棋大会 運営ツール）
- **Repo**: kazuo1970takahashi-sketch/shogi
- **前提となる main 反映済 PR**:
  - PR [#122](https://github.com/kazuo1970takahashi-sketch/shogi/pull/122) — TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN（v0.1、squash `ea71e15`）
  - PR [#123](https://github.com/kazuo1970takahashi-sketch/shogi/pull/123) — TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001（v0.1 trial、squash `44b49a9`）
  - PR [#124](https://github.com/kazuo1970takahashi-sketch/shogi/pull/124) — TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN（RRD 標準設計、squash `84f6724`）
  - PR [#125](https://github.com/kazuo1970takahashi-sketch/shogi/pull/125) — TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN（Reviewer 運用設計、squash `20c0a71`）
  - PR [#126](https://github.com/kazuo1970takahashi-sketch/shogi/pull/126) — TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001（Reviewer 明示試験、squash `f989514`）
  - PR [#127](https://github.com/kazuo1970takahashi-sketch/shogi/pull/127) — TOUR-OPS-ACTION-REQUEST-DESIGN（Action Request 標準設計、squash `541feb2`）
  - PR [#128](https://github.com/kazuo1970takahashi-sketch/shogi/pull/128) — TOUR-OPS-AI-TASK-CANDIDATE-DESIGN（AI Task Candidate 標準設計、squash `f15793a`）
  - PR [#129](https://github.com/kazuo1970takahashi-sketch/shogi/pull/129) — TOUR-OPS-AI-TASK-CANDIDATE-TRIAL-001（Candidate trial、squash `32a3ab2`）
- **非対象（今回 PR では実施しない）**:
  - v0.2 本文の作成（`docs/ops/20260516_shogi_tour_async_ai_workflow_v0_2.md` 等の新規作成）
  - 既存 ops docs 8 件の改訂
  - Action Request / RRD / Reviewer 依頼文 / Candidate のテンプレ実ファイル化
  - Candidate Registry 実ファイル化
  - GitHub Issues / GitHub Projects / Bot / GitHub Actions / 自動化
  - `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/` / label / `ai_work_queue.md` 作成
  - 実装 / テスト / snapshot / workflow / package 系の一切の変更
  - branch protection / token / secret / credential 操作
  - release / deploy / publish / **branch 削除**（PR #127 / #128 / #129 の 3 branch 残存中、本 PR では触らない）
  - Candidate Adopt / Task 化 / 実装着手
  - 後続タスク（TEMPLATE-IMPL-LIGHT / ACTION-REQUEST-TRIAL-001 / V0-2-DRAFT / BRANCH-CLEANUP-AR / REGISTRY-DESIGN / CLAUDE-CODE-REVIEWER-TEMPLATE-IMPL-LIGHT / ASYNC-IMPL-LIGHT / RRD-IMPL-LIGHT / WORK-QUEUE / PR-TEMPLATE / HANDOFF-FORMAT）の着手
  - RESET-UX 後続実装

---

## 1. 目的

- PR #122〜#129 の AI 非同期運用シリーズを **Phase 1 として総括** する。
- v0.1 から **v0.2 へ進めるべきか** 判断する。
- 追加設計を増やしすぎる前に **棚卸し** する。
- Action Request / Task Candidate / Reviewer / RRD / Core 5 / Standard 11 の **関係を整理** する。
- 次に実装化するなら何を **優先すべきか** 判断する。
- 今回は **review note** であり、実装・テンプレ化・Registry 化・branch 削除には **進まない**。

---

## 2. 背景

- **PR #122** で AI 非同期運用ルール v0.1 を設計した（Core 5 / Standard 11 / Short Prompt / Blocked By / Phase 1 段階導入）。
- **PR #123** で v0.1 初回 trial を行った（PR 本文 Core 5 / Standard 11、Review Request Draft、完了報告コメント、cowork 留保観察）。
- **PR #124** で Review Request Draft 標準設計を作成した（Codex-primary / Claude Code-secondary / ChatGPT-orchestrated、Review Material Pack、raw/patch/diff URL 直接同梱）。
- **PR #125** で Claude Code Reviewer 運用設計を作成した（Implementer / Reviewer 分離、read-only review、独立性レベル、17 ステップ、14 項目 Report、8 段階戻し方）。
- **PR #126** で Claude Code Reviewer trial-001 が成功した（別セッション read-only review、A/Go、Ready/Merge Recommended、§7 禁止遵守）。
- **PR #127** で Action Request 標準設計を作成し、**自己実証** まで成立した（無効承認文の §7.2 厳格判定、12 項目 AR、7 条件 Approval Phrase、Ready/merge、branch 削除別許可遵守）。
- **PR #128** で AI Task Candidate 標準設計を作成した（15 項目フォーマット、9 状態、8 段階フロー、4 段階 Approval Phrase、Reviewer 発 Candidate `CAND-PR128-001` を Task 化せず Hold）。
- **PR #129** で Candidate を 3 件に絞り、すべて Hold する trial を実施した（CAND-PR128-001 / CAND-PR127-001 / CAND-PR127-002 を 15 項目記録、CAND-OPS-001 は観察メモ、Reviewer Nice to Have 5 件も新規 Candidate 化せず）。
- ここまでで **「作る AI / 見る AI / 整理する AI / 許可する人 / 短文承認 / 改善候補管理」** の骨格が揃った。
- 一方で運用 docs が 8 件に増えたため、**Phase 1 として棚卸し** する必要がある。

---

## 3. Phase 1 成果一覧（PR #122〜#129）

| PR | Task ID | 目的 | 成果 | 自己実証 | 現在の状態 | v0.2 反映要否 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #122 | TOUR-OPS-ASYNC-AI-WORKFLOW-DESIGN | v0.1 ルール本体 | Core 5 / Standard 11 / Short Prompt / Phase 1 段階導入 | trial-001 で間接実証 | main 反映済 | **必須**（v0.2 土台） | 章立て継承 |
| #123 | TOUR-OPS-ASYNC-AI-WORKFLOW-TRIAL-001 | v0.1 初回手動 trial | Core 5 / Standard 11 / RRD / Blocked By 観察 | trial として完了 | main 反映済（trial note 保持） | **要点抽出**（全文統合不要） | 観察記録 |
| #124 | TOUR-OPS-REVIEW-REQUEST-TEMPLATE-DESIGN | RRD 標準設計 | Codex-primary / Claude Code-secondary / Review Material Pack / 留保欄 | PR #124〜#129 の RRD で間接実証 | main 反映済 | **必須**（レビュー依頼ルールとして） | RRD 本文長くなりやすい |
| #125 | TOUR-OPS-CLAUDE-CODE-REVIEWER-DESIGN | Claude Code Reviewer 運用 | Implementer/Reviewer 分離、read-only、独立性 A/B/C、17 ステップ、14 項目 Report | trial-001 で間接実証 | main 反映済 | **必須**（Secondary Reviewer 運用） | Codex 制限時の代替 |
| #126 | TOUR-OPS-CLAUDE-CODE-REVIEWER-TRIAL-001 | Reviewer 明示試験 | 別セッション read-only review、A/Go 判定、§7 禁止遵守 | trial として完了 | main 反映済（trial note 保持） | **要点抽出**（全文統合不要） | 観察記録 |
| #127 | TOUR-OPS-ACTION-REQUEST-DESIGN | Action Request 標準設計 | 12 項目 AR、7 条件 Approval Phrase、5 種類、5 例 | PR #127 自己実証（無効承認文厳格判定 → Ready → merge） | main 反映済 | **中核として必須** | 自己実証で機能確認済み |
| #128 | TOUR-OPS-AI-TASK-CANDIDATE-DESIGN | AI Task Candidate 標準設計 | 15 項目 Candidate、9 状態、8 段階フロー、4 段階 Approval Phrase | PR #128 自己実証（Reviewer 発 CAND-PR128-001 を Hold） | main 反映済 | **中核として必須** | Adopt 慎重運用 |
| #129 | TOUR-OPS-AI-TASK-CANDIDATE-TRIAL-001 | Candidate trial | 3 件正式 Candidate + 1 件観察メモ、すべて Hold、Nice to Have 5 件も新規化せず | trial として完了 | main 反映済（trial note 保持） | **要点抽出**（Candidate 過多防止・Hold 運用） | 観察記録 |

---

## 4. Phase 1 で完成したもの

PR #122〜#129 を通じて **明確に成立した** 機能・原則：

1. **Claude Code Implementer / Reviewer の分離**（PR #125 §3 §4）
2. **Claude Code Reviewer read-only review**（PR #125 §7、PR #126 trial で遵守実証）
3. **Review Request Draft（RRD）**（PR #124 §4、本文に raw/patch/diff URL 直接同梱）
4. **Action Request**（PR #127 §5、12 項目フォーマット）
5. **Approval Phrase**（PR #127 §7.1、7 条件成立で有効）
6. **head SHA guard**（PR #127 §5.6、実行直前再確認）
7. **Staleness Rule**（PR #127 §5.12、head/state/changedFiles 変化で無効）
8. **Ready / merge の二段承認**（PR #127 §6.1 §6.2）
9. **branch 削除を別許可にする原則**（PR #127 §4.7、PR #127/#128/#129 で 3 連続遵守）
10. **Task Candidate**（PR #128 §3.1、15 項目）
11. **Candidate Hold**（PR #128 §8、Adopt しない保留状態）
12. **Candidate を勝手に Task 化しない原則**（PR #128 §4.2 §3.7 Auto-Implementation Prohibited）
13. **Candidate を増やしすぎない原則**（PR #128 §11、1 review 1〜3 件、PR #129 で実証）
14. **Candidate Registry を急がない判断**（PR #128 §11.2、PR #129 で「不要見込」判定）
15. **Core 5 / Standard 11 の自己適用**（PR #122 §6、PR #123〜#129 で 7 連続適用）
16. **PR コメントによる SSoT 補助**（v0.1 §4、Review Request Draft / 完了報告 / Post-Execution Report）
17. **ChatGPT 司令塔による整理・AR 発行**（PR #127 §8、PR #128 §14 Triage Summary）
18. **髙橋さんの明示承認**（PR #127 §7.1 条件 7、final 決定権）
19. **§7.2 無効承認文の厳格判定**（PR #127 / #128 / #129 で 3 連続成立）

---

## 5. Phase 1 で未完成のもの

明確に **未実施 / 未完成** のもの：

1. **v0.2 本文への統合**（v0.1 + #124〜#128 + trial 要点を 1 つのルール本体に統合）
2. **Action Request テンプレの実ファイル化**（毎回のコピペ AR を短縮）
3. **Review Request Draft テンプレの実ファイル化**（毎回の RRD を短縮）
4. **Claude Code Reviewer 依頼テンプレの実ファイル化**（別セッション起動時のコピペ短縮）
5. **Candidate 整理テンプレの実ファイル化**（Triage Summary の標準ファイル）
6. **branch cleanup trial**（PR #127/#128/#129 の 3 branch をまとめて削除 AR で消す trial）
7. **Candidate Adoption trial**（Candidate を実際に Adopt → Task 化 → AR → Approval Phrase → 実行する trial）
8. **Candidate Registry 設計**（候補数増加時の Registry）
9. **GitHub Issue / Project 連携**
10. **GitHub Actions / Bot 連携**
11. **自動化**（自動 Task 化 / 自動 Ready / 自動 merge）
12. **PR template / Issue template / label 連携**
13. **`ai_work_queue.md` 連携**
14. **docs 横断の参照導線整理**（8 件の ops docs を横断する目次・索引）

---

## 6. Action Request の評価（PR #127 / #128 / #129 自己適用ベース）

### 6.1 観点別評価

| 観点 | 結果 |
| --- | --- |
| 対応 AR 不在の短文承認を止められたか | ✅ **3 連続成立**（PR #127/#128/#129 で 1 回目 `承認：Ready化` を §7.2 で停止） |
| Ready / merge で機能したか | ✅ 全 6 回（Ready × 3 + merge × 3）で機能 |
| head SHA guard は機能したか | ✅ 全実行で実行直前再確認、SHA 変化なし確認 |
| Staleness Rule は機能したか | ✅ main HEAD race / state 変化 / changedFiles の事前確認で機能 |
| Forbidden Actions は守られたか | ✅ 全実行で Allowed Scope 外（branch 削除 / 後続タスク着手 / Candidate Adopt 等）に手を出していない |
| branch 削除別許可は守られたか | ✅ 3 連続遵守（3 branch 残存中、本 PR でも触らない） |
| AR 本文が長すぎる問題はあるか | ⚠️ あり（特に Forbidden Actions リストが膨張、Post-Execution Report Requirements も冗長化） |
| どこをテンプレ化すべきか | Forbidden Actions の共通骨子、Preconditions の共通骨子、Post-Execution Report Requirements の共通骨子 |
| いま Bot 化すべきか | **時期尚早**。手動運用で十分機能、まずテンプレ化 → 観察 → 自動化検討の順 |

### 6.2 暫定判断

- Action Request は **有効**
- Ready / merge では **十分機能**
- ただし **AR 本文が長くなりやすい**
- 次は **テンプレ実ファイル化** か、v0.2 統合で **短縮ルールを定義** する価値あり
- Bot 化は **まだ早い**

---

## 7. AI Task Candidate の評価（PR #128 / #129 自己適用ベース）

### 7.1 観点別評価

| 観点 | 結果 |
| --- | --- |
| Candidate と Action Request を分離できたか | ✅ 4 段階 Approval Phrase（Adopt / 着手 / Ready / merge）で完全分離 |
| Candidate を勝手に Adopt しなかったか | ✅ PR #128 Reviewer 発 CAND-PR128-001 を Hold、PR #129 でも 3 件すべて Hold |
| Candidate を勝手に Task 化しなかったか | ✅ trial-001 で 3 件 Hold 維持、Reviewer Nice to Have 5 件も新規化せず |
| Candidate を 3 件に絞れたか | ✅ PR #129 で正式 3 件 + 観察メモ 1 件 = §11.1 「1 review 1〜3 件」遵守 |
| 観察メモ扱いを使えたか | ✅ CAND-OPS-001 を「正式 Candidate にしない」判断が機能 |
| Reviewer Nice to Have を勝手に Candidate 化しなかったか | ✅ PR #129 review で 5 件出たが、すべて trial 内 Hold（新規 Candidate 化せず） |
| Candidate Registry は必要か | ❌ **不要見込**（3 件管理可能、増加トレンドなし） |
| Candidate Adoption trial は必要か | △ いずれ必要だが急がない（Action Request trial が先） |
| Candidate 運用は現時点で重すぎないか | ⚠️ 15 項目フォーマットがやや重い。Level 1 docs-only では Notes 省略可など短縮余地あり |

### 7.2 暫定判断

- Candidate 設計は **有効**
- 初回 trial では **すべて Hold** で妥当
- Registry は **まだ不要**
- Candidate Adoption trial は **まだ急がなくてよい**
- 当面は **ChatGPT 司令塔が Triage する軽量運用** で十分

---

## 8. Claude Code Reviewer の評価（PR #125 / #126 / #127 / #128 / #129 ベース）

### 8.1 観点別評価

| 観点 | 結果 |
| --- | --- |
| read-only を守れたか | ✅ 4 回の review 全てで commit / push / Ready / merge / PR コメント投稿 / branch 削除を実行せず |
| Reviewer 自身を Candidate Owner にしなかったか | ✅ PR #128 §6.1 を遵守、Candidate 提案時も Owner は Implementer or 髙橋さん |
| Review Report の品質 | ✅ 14 項目 Report で A/Go 判定 + Must/Should/Nice 分類 + 留保欄 |
| Codex primary / Claude Code secondary の位置づけ | ✅ PR #124 §3 / §7 / PR #125 §5 で確立 |
| Level 1 docs-only で Claude Code Reviewer 単独で十分か | ✅ PR #126/#127/#128/#129 すべて A/Go で merge 成功 |
| Codex クロスチェックが必要な条件 | Level 2 以上、実装影響、UX 導線、データ・ロジック変更時 |

### 8.2 暫定判断

- Claude Code Reviewer は **Codex 制限時の secondary reviewer として有効**
- **Level 1 docs-only** では十分機能
- **Level 2 以上、または実装影響がある場合は Codex クロスチェック推奨**
- **Level 3 以上は Codex 必須寄り**

---

## 9. Review Request Draft の評価（PR #124 以降ベース）

### 9.1 観点別評価

| 観点 | 結果 |
| --- | --- |
| PR URL / diff / patch / raw URL を含める運用は有効か | ✅ 全 RRD で同梱、Reviewer が GitHub 制約下でも fallback 可能 |
| GitHub が読めない場合の fallback として機能するか | ✅ L0〜L3 段階方針が PR #124 §5 で確立 |
| Reviewer 留保欄は有効か | ✅ PR #124 §6、Reviewer Report に標準欄として記載 |
| Review Report 標準フォーマットは有効か | ✅ PR #125 §8.1 14 項目、判定 + 分類 + 確認不能範囲 |
| RRD 本文が長くなりすぎる問題はあるか | ⚠️ 顕著にあり（毎回 200〜400 行）。観点リスト・Must/Should/Nice 基準・fallback 方針・Reviewer 注意事項が毎回コピペされる |
| テンプレ化すべきか | ✅ **最優先**（毎回の長文コピペ削減に直結） |

### 9.2 暫定判断

- RRD は **有効**
- 特に AI 間レビューでは **有効**
- ただし毎回長くなるため **テンプレ実ファイル化候補**
- v0.2 では **「必須項目」と「省略可能項目」を整理** した方がよい

---

## 10. Core 5 / Standard 11 の評価

### 10.1 観点別評価

| 観点 | 結果 |
| --- | --- |
| 完了報告で有効だったか | ✅ PR #123〜#129 で 7 連続適用、Next Action / Blocked By が明確化 |
| 何度も繰り返すことで冗長になっていないか | ⚠️ Standard 11 の Forbidden Actions が膨張傾向（10 行以上になることも） |
| Core 5 は残すべきか | ✅ 必須（状態管理の最小情報） |
| Standard 11 は毎回全文必要か | ⚠️ Level 1 docs-only では短縮版で十分な余地あり |
| Action Request と重複していないか | △ Standard 11 Forbidden Actions と AR Forbidden Actions が部分的に重複 |
| v0.2 で短縮版 / 詳細版に分けるべきか | ✅ Risk Level 別の表現粒度を v0.2 で定義する価値あり |

### 10.2 暫定判断

- Core 5 は **有効なので継続**
- Standard 11 は **有効だが長い**
- Level 1 docs-only では **短縮版を検討可能**
- ただし初期段階では **安全優先で維持**

---

## 11. 残存 branch の扱い

### 11.1 現状

PR #127/#128/#129 の merge 済 branch が remote / local に **すべて残存**：

- `docs/tour-ops-action-request-design`（PR #127、HEAD `d544029`）
- `docs/tour-ops-ai-task-candidate-design`（PR #128、HEAD `ea75680`）
- `docs/tour-ops-ai-task-candidate-trial-001`（PR #129、HEAD `eba75265`）

### 11.2 観点

| 観点 | 評価 |
| --- | --- |
| branch 削除は安全か | ✅ 3 つとも MERGED、squash で main に内容反映済 |
| Action Request trial の題材として使う価値があるか | ✅ 高い（CAND-PR127-002 = branch 削除別 AR trial にも合致） |
| 削除前に v0.2 review を終えるべきか | ✅ 本 PR でレビュー → 次に branch cleanup trial が自然な順 |
| まとめて削除するか、1 本ずつ削除するか | まとめて 1 AR で削除する方が AR の「複数操作許可」パターンの実証になる |
| branch 削除 AR を正式に試すべきか | ✅ CAND-PR127-002 の Adoption と兼用可能 |

### 11.3 暫定判断

- branch 削除自体は **掃除タスク**
- ただし **Action Request trial の良い題材**
- **本 PR では削除しない**（review note 範囲外）
- 後続 `TOUR-OPS-ACTION-REQUEST-TRIAL-001` の **第一候補** として扱う

---

## 12. v0.2 化判断（案 A / B / C 比較）

### 案 A：今すぐ v0.2 本文を作る

| 項目 | 内容 |
| --- | --- |
| 範囲 | `docs/ops/20260516_shogi_tour_async_ai_workflow_v0_2.md`（新規作成、v0.1 + #124〜#128 + trial 要点を統合） |
| メリット | ルール一本化 / 参照容易 / Phase 1 成果整理 |
| デメリット | テンプレ実ファイル化前で細部流動的 / branch 削除 trial 前 / Action Request と Candidate の細部がまだ動く可能性 |
| 推奨度 | △ |

### 案 B：v0.2 review note までに留める

| 項目 | 内容 |
| --- | --- |
| 範囲 | 本 PR が該当（review note のみ、ルール本体改訂なし） |
| メリット | いきなり本体改訂しない / 次の一手整理 / 過剰統合回避 |
| デメリット | 参照 docs はまだ複数に分散 |
| 推奨度 | ✅ **推奨** |

### 案 C：先に template / trial を追加してから v0.2

| 項目 | 内容 |
| --- | --- |
| 範囲 | TEMPLATE-IMPL-LIGHT 1 件 + ACTION-REQUEST-TRIAL-001 1 件を先行 → その後 v0.2 |
| メリット | 実運用材料が増える / v0.2 がより安定 |
| デメリット | docs がさらに増える / そろそろ散らかり始める |
| 推奨度 | △ |

### 12.1 推奨

**案 B**。今回の PR は v0.2 review note に **留める**。すぐ v0.2 本文改訂には進まない。次に必要な **1〜2 タスクを選ぶ** のみ。

---

## 13. 次タスク候補の比較

### 候補 1：`TOUR-OPS-ACTION-REQUEST-TRIAL-001`（branch 削除 AR trial）

| 項目 | 内容 |
| --- | --- |
| 内容 | 残存 branch 3 本をまとめて削除する Action Request trial |
| メリット | 残存 branch を片付け / branch 削除別許可原則を実証 / CAND-PR127-002 対応 |
| デメリット | 削除操作を伴う / docs 設計の本質より運用掃除 |
| 関連 Candidate | CAND-PR127-002（Hold）/ CAND-PR127-001（Hold） |

### 候補 2：`TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT`（テンプレ実ファイル化）

| 項目 | 内容 |
| --- | --- |
| 内容 | Action Request / RRD / Candidate のテンプレを軽量に実ファイル化 |
| メリット | 毎回の AR/RRD が短縮 / 長文コピペ削減に直結 / PR #127〜#129 の Nice to Have を吸収 |
| デメリット | テンプレ設計を誤ると硬くなりすぎる / 既存 docs との重複整理が必要 |
| 関連 Candidate | CAND-PR128-001（Hold）/ CAND-PR127-001（Hold） |

### 候補 3：`TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT`（v0.2 本文作成）

| 項目 | 内容 |
| --- | --- |
| 内容 | v0.2 ルール本体作成 |
| メリット | ルール一本化 |
| デメリット | 今は少し早い / テンプレ化前に本文統合するとまた改訂が必要 |
| 関連 Candidate | CAND-OPS-001（観察メモ） |

### 候補 4：`TOUR-OPS-BRANCH-CLEANUP-AR`（branch 削除のみ）

| 項目 | 内容 |
| --- | --- |
| 内容 | 残存 branch 削除だけを AR で実行（trial 構造なし） |
| メリット | 小さい / すぐ終わる |
| デメリット | 学びが少ない / trial note としては弱い |
| 関連 Candidate | CAND-PR127-002（Hold）の最小実行版 |

### 候補 5：`TOUR-OPS-AI-TASK-CANDIDATE-REGISTRY-DESIGN`（Registry 設計）

| 項目 | 内容 |
| --- | --- |
| 内容 | Candidate Registry 設計 |
| メリット | 候補が増えた場合に便利 |
| デメリット | PR #129 で不要見込判定済 / 今は過剰 |
| 関連 Candidate | なし |

### 13.1 推奨順位

1. **`TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT`**（テンプレ実ファイル化 = 長文コピペ削減に直結）
2. **`TOUR-OPS-ACTION-REQUEST-TRIAL-001`**（branch 削除 AR trial = 残存 branch 片付け + CAND-PR127-002 対応）
3. **`TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT`**（v0.2 本文作成 = テンプレ化後の方が安定）
4. **`TOUR-OPS-BRANCH-CLEANUP-AR`**（branch 削除のみ = 小タスク）
5. **`TOUR-OPS-AI-TASK-CANDIDATE-REGISTRY-DESIGN`**（Registry = 不要見込）

ただし、**今回の review note では次タスクに着手しない**。

---

## 14. Phase 1 完了判定

### 14.1 判定

**Phase 1 は完了と判定してよい**。

### 14.2 完了理由

- 非同期運用ルール（v0.1）がある
- Reviewer 分離（PR #125）がある
- RRD（PR #124）がある
- Action Request（PR #127）がある
- Task Candidate（PR #128）がある
- それぞれ trial（#123 / #126 / #129）または自己実証（#127）がある
- Ready / merge / Candidate Hold が **実運用で確認済み**
- **禁止事項を守って止まれること** が確認済み（§7.2 厳格判定 3 連続成立）

### 14.3 ただし

Phase 1 は「**設計・trial 完了**」であり、「**運用自動化完了**」ではない。

- テンプレ実ファイル化前
- branch cleanup 未実施
- Candidate Adoption trial 未実施
- 自動化 / Bot / GitHub Actions 未着手
- v0.2 本文未作成

---

## 15. v0.2 に入れるべき要素

v0.2 本文（後続 `TOUR-OPS-AI-WORKFLOW-V0-2-DRAFT`）に統合すべき要素：

1. **AI roles**（ChatGPT 司令塔 / Claude Code Implementer / Claude Code Reviewer / Codex / 髙橋さん / cowork）
2. **Level 別 review**（Level 0〜3+、Codex / Claude Code Reviewer の使い分け）
3. **Core 5 / Standard 11**（短縮版 / 詳細版の Risk Level 別表現）
4. **Review Request Draft**（必須項目 / 省略可能項目の整理）
5. **Claude Code Reviewer read-only**（PR #125 §7 禁止事項）
6. **Action Request**（12 項目フォーマット、5 種類）
7. **Approval Phrase**（7 条件、無効例、有効例）
8. **head SHA guard**
9. **Staleness Rule**
10. **Task Candidate**（15 項目、9 状態、4 段階 Approval Phrase）
11. **Candidate Hold**（Adopt しない保留の運用）
12. **branch 削除別許可**（常時別 AR）
13. **Forbidden Actions**（共通骨子）
14. **ChatGPT 司令塔の役割**（Triage / AR 発行案 / Approval Phrase 案 / final 決定権なし）
15. **髙橋さんの最終判断**（明示承認 / Adopt / Hold / Reject / Split / Merge）
16. **GitHub SSoT**（PR コメント / Review Request Draft / 完了報告 / Post-Execution Report）
17. **Codex primary / Claude Code secondary**（PR #124 §3 §7、PR #125 §5）

---

## 16. v0.2 にまだ入れない方がよいもの

v0.2 本文にも **当面入れない** 方がよいもの（時期尚早、または不要見込）：

1. **Bot**
2. **GitHub Actions 自動化**
3. **自動 Task 化**
4. **自動 Ready 化**
5. **自動 merge**
6. **Candidate Registry**（PR #129 で不要見込判定）
7. **GitHub Issues / Projects 連携**
8. **PR template 強制**
9. **Issue template 強制**
10. **label 運用**
11. **`ai_work_queue.md` 連携**
12. **Candidate 自動採用**
13. **branch 自動削除**

これらは v0.2 着地後、運用観察を経て **Phase 2 以降** で検討する。

---

## 17. 結論

- **PR #122〜#129 は AI 非同期運用 Phase 1 として完了判定できる**。
- Action Request と Task Candidate は **実運用に乗り始めた**（自己実証 3 連続成立）。
- ただし、**いきなり v0.2 本文改訂には進まず**、まず本 PR の review note で **棚卸し** するのが妥当（案 B 推奨）。
- 次の推奨は **Action Request / RRD / Candidate のテンプレ実ファイル化** を軽量に検討すること（`TOUR-OPS-ACTION-REQUEST-TEMPLATE-IMPL-LIGHT`、長文コピペ削減に直結）。
- **branch cleanup trial** は有用だが、次点（`TOUR-OPS-ACTION-REQUEST-TRIAL-001`、CAND-PR127-002 対応）。
- **Candidate Registry はまだ不要**（PR #129 で実証）。
- **自動化 / Bot / GitHub Actions はまだ早い**（Phase 2 以降）。
- ここからは「**増築**」より「**短縮・テンプレ化・読みやすさ改善**」が重要。
