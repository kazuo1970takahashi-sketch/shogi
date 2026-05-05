# A-T 仕様書 v1.3 への改訂パッチ（ChatGPT メタレビュー Should Fix 7 件反映）

**作成日時**: 2026-05-06 01:05 JST
**対象**: docs/specs/20260506_0045_shogi_at_spec_v1_2.md（v1.2、commit 3faca98）
**改訂結果**: docs/specs/20260506_0105_shogi_at_spec_v1_3.md（v1.3 として新規配置）
**根拠**: ChatGPT メタレビュー A- 判定（Must Fix なし、Should Fix 7 件）

---

## 変更点サマリ

| # | 章 | 変更内容 | 由来 |
|---|------|--------|------|
| 1 | §4.3.7 末尾 | カタログ拡張ルール追加 | Should Fix #1 |
| 2 | §5 Stage 1 完了基準 | 「偽陽性なし」フォールバック追加 | Should Fix #2 |
| 3 | §0.2 US-4 | 表現を「実機運用試験への依存を最小化」に修正 | Should Fix #3 |
| 4 | §5 Stage 2 | 2a/2b/2c に分割 | Should Fix #4 |
| 5 | §7 末尾 | CI 5 分は努力目標、merge blocker ではない明記 | Should Fix #5 |
| 6 | §5 Stage 2 完了基準 + §6 受け入れ基準 | Codex Yes YAML 出力項目定義 | Should Fix #6 |
| 7 | §5 Stage 2 着手前条件 | L0 業務モデル文書の存在確認を必須化 | Should Fix #7 |

---

## 詳細パッチ

### 1. §4.3.7 末尾にカタログ拡張ルール追加（Should Fix #1）

§4.3.7 shogi 固有 primary assertion カタログの直後（「このカタログは Stage 2 着手時に refactor / 拡張する。」の後）に以下を追加：

```markdown
#### 4.3.8 新規 click 操作の追加ルール（v1.3 新設）

A-7 / A-8 / A-9 等で新規 click 操作を追加する場合、以下を必須とする：

1. **操作名を §4.3.7 primary assertion カタログに追加する**（カタログにない操作のテストを書くことを禁止）
2. **操作の業務目的を 1 文で記載する**（「ユーザーは何を達成したいのか」）
3. **primary semantic assertion を state / DOM / 永続化 / URL のいずれかで最低 1 つ定義する**
4. **UI 重要操作（v1.2.5 §1.4）の場合、通知表示のみを成功条件にしない**
5. **既存カテゴリに当てはまらない場合は、Stage 着手前に ChatGPT / Codex レビューへ回す**

判定責任：
- **新規操作の業務目的整理**：Claude.ai（仕様書段階）
- **primary assertion の妥当性確認**：ChatGPT メタレビュー
- **カタログ反映と実装**：Claude Code（Stage 着手時）
- **PR レビューでの抜け検出**：Codex（v1.2.5 §13.4 YAML フォーマットで機械検証）
```

---

### 2. §5 Stage 1 完了基準に「偽陽性なし」フォールバック追加（Should Fix #2）

Stage 1 完了基準の末尾（パッチ E の Stage 1 セクション）に以下を追加：

```markdown
**偽陽性なし判定時のフォールバック**（v1.3 新設・ChatGPT Should Fix #2 反映）：
- Stage 1 で偽陽性疑いが 0 件と判定された場合でも、A-4.2 既知不具合 commit 73961d3 に対して **A/B クラスボタン操作の最小再現テスト**を 1 件追加し、当該 commit で**赤になることを確認**する
- 赤にならない場合、Stage 1 の「偽陽性なし」判定は**無効**とし、検証観点を追加して再調査する
- 検証観点不足の例：state snapshot 取得対象が不完全、業務状態の参照漏れ、CSS overlay の検出不能、UI 経由でない関数直接呼び出しの見逃し

これにより、Stage 1 が楽観判定で抜けるリスクを構造的に防ぐ。
```

---

### 3. §0.2 US-4 の表現修正（Should Fix #3）

§0.2 US-4 の本文を以下に置換：

**変更前**：
```markdown
> プロジェクトオーナー（髙橋さん）として、A-T 完了後は **実機での運用試験を経なくても** A-4.2 型の「e2e は緑だが実機で動かない」リグレッションが PR ごとに自動検出される状態を確保したい。
> v1.2.5 §13「実装以降の人間ゼロ介在フロー」で段階 1 移行を可能にし、AI 開発の 10 倍速を阻害する人間レビュー律速を排除するため。
```

**変更後**：
```markdown
> プロジェクトオーナー（髙橋さん）として、A-T 完了後は **通常操作で再現できる** A-4.2 型の「e2e は緑だが実機で動かない」リグレッションが PR ごとに自動検出され、**実機運用試験への依存を最小化**したい。
> v1.2.5 §13「実装以降の人間ゼロ介在フロー」で段階 1 移行を可能にし、AI 開発の 10 倍速を阻害する人間レビュー律速を排除するため。端末固有・ブラウザ固有・タッチ挙動固有の問題は実機試験で別途確認する。
```

---

### 4. §5 Stage 2 を 2a/2b/2c に分割（Should Fix #4）

§5 Stage 2 の構成を以下に置換：

**変更前**：
```
Stage 2: expectClickable + clickAndExpectChange ヘルパ実装 + 既存テスト全置換
```

**変更後**：
```markdown
Stage 2 を以下の 3 ステージに分割（v1.3 で分割・ChatGPT Should Fix #4 反映）：

#### Stage 2a: ヘルパ実装

- expectClickable ヘルパが §4.2 の 7 段階検証すべて実装
- clickAndExpectChange ヘルパが §4.3 の primary semantic assertion 必須化を強制
- §4.3.7 shogi 固有 primary assertion カタログ完備（新規操作追加ルール §4.3.8 含む）
- ヘルパ単体テスト追加
- 完了基準：ヘルパが完成し、サンプル 1 件で primary assertion ありなしの判定が動作

#### Stage 2b: A-4.2 関連テスト置換

- shogi_app_a4_2.spec.js 内の既存 click を clickAndExpectChange に置換
- A-4.2 関連の primary assertion 宣言済み
- A-4.2 関連の force: true をゼロに
- 完了基準：A-4.2 関連テストが新ヘルパで動作、Stage 4（A-4.2 回帰テスト）の前提が整う

#### Stage 2c: 既存 272 件の段階的置換

- 残り 4 spec ファイル（index_layout, shogi_app, shogi_app_a3, shogi_app_a4）の click を順次置換
- リポジトリ全体で force: true 使用箇所ゼロ（grep で検証）
- UI 重要操作（v1.2.5 §1.4）の primary assertion すべて宣言済み
- Codex レビュー A 以上
- 完了基準：272 件全件が clickAndExpectChange を経由

**Stage 2a + Stage 2b + Stage 4 を先に完了させ、A-4.2 再発防止効果を早期に得る**。Stage 2c は後段で段階的に進める。

#### Stage 2 着手前条件（v1.3 新設・ChatGPT Should Fix #7 反映）

Stage 2a 着手前に以下を確認：
- shogi リポジトリ内に **L0 業務モデル文書が存在する** こと（v1.2.5 §2.2 L0 必須）
  - 確認場所：`docs/specs/_business_model.md` または同等のファイル
  - 含むべき内容：ユーザージャーニー、データフロー、データフィールド全リスト、業務フェーズと機能の対応表
- 不足する場合は **A-T 用の最小業務モデル文書を Stage 2a 着手前に作成**する（少なくとも shogi_v4 の主要 state / master.member フィールド / players 配列の構造を文書化）

これがないと、§4.3.7 カタログの拡張時に primary assertion が業務目的に対応しているかの判定ができない。
```

---

### 5. §7 末尾に CI 5 分の位置づけ追加（Should Fix #5）

§7 実装方針・原則の末尾（CI ランタイム言及部分）に以下を追加：

```markdown
**CI ランタイム 5 分以内の位置づけ**（v1.3 で明確化・ChatGPT Should Fix #5 反映）：
- 「CI ランタイム 5 分以内」は shogi A-T における **PR CI の努力目標** であり、**v1.2.5 全体の SLA ではない**
- v1.2.5 §6.4 では CI ランタイム上限は SLA としては未定、本格対処は v2.0
- 5 分超過時は**即 merge blocker としない**。テスト分割、Nightly 移行、PR CI 軽量化を検討する
- Release / Nightly では 5 分超過を許容する
- 努力目標として 5 分を目指すが、達成できなくても Stage 完了を阻害しない
```

---

### 6. §5 Stage 2 完了基準 + §6 受け入れ基準に Codex Yes YAML 定義（Should Fix #6）

§5 Stage 2c 完了基準と §6 受け入れ基準に以下を追加：

```markdown
**Codex Yes YAML 出力（v1.3 新設・ChatGPT Should Fix #6 反映）**：

Stage 2 以降の Codex レビューでは、自然文 Yes/No に加え、以下の構造化出力を必須とする（v1.2.5 §13.4 Codex Yes 構造化と整合）：

```yaml
codex_l4_review:
  force_true_count: 0  # リポジトリ全体での force: true 使用箇所
  click_without_expectClickable_count: 0  # expectClickable 経由でない click
  click_without_clickAndExpectChange_count: 0  # clickAndExpectChange 経由でない click
  primary_assertion_missing_count: 0  # primary assertion 不在の click 操作
  notification_only_assertion_count: 0  # 通知表示のみを成功条件にしている click
  ui_important_operation_coverage: "100%"  # UI 重要操作（v1.2.5 §1.4）の primary assertion 宣言率
  catalog_completeness: "100%"  # §4.3.7 カタログの新規操作カバー率
  verdict: "Yes"  # Yes / No / changes_requested
```

これにより、Codex Yes が形式的な Yes で終わるリスクを構造的に防ぐ。
GitHub Actions / bot がこの YAML をパースし、自動マージ条件（v1.2.5 §13.6 段階別ホワイトリスト ∧ §3.3 必須項目全緑）を機械的に判定する。
```

---

### 7. 改訂履歴に v1.3 行追加（既出の Should Fix #7 は §5 Stage 2 着手前条件で対応済み）

改訂履歴に以下を追加：

```markdown
| v1.3 | 2026-05-06 01:05 | ChatGPT メタレビュー A- 判定（Must Fix なし、Should Fix 7 件）を反映。①§4.3.8 新規操作カタログ拡張ルール新設、②Stage 1「偽陽性なし」フォールバック追加、③§0.2 US-4 表現を「実機運用試験への依存を最小化」に修正、④Stage 2 を 2a/2b/2c に分割、⑤§7 CI 5 分は努力目標と明記、⑥Stage 2 Codex Yes YAML 出力定義、⑦Stage 2 着手前条件として L0 業務モデル文書の存在確認を追加 |
```

---

### 8. ヘッダー更新

`# Phase A-T 仕様書 v1.2` を `# Phase A-T 仕様書 v1.3` に変更。
ヘッダー部の `**作成日時**` 行を以下に更新：

```markdown
**作成日時**: 2026-05-05 20:46 JST（v1）/ 2026-05-06 00:45 JST（v1.2）/ 2026-05-06 01:05 JST（v1.3）
**v1.2 ファイル**: `docs/specs/20260506_0045_shogi_at_spec_v1_2.md`（履歴として保持）
**v1.3 改訂理由**: ChatGPT メタレビュー A- 判定の Should Fix 7 件を反映。Stage 1 着手前の最終整備版
```

---

## 適用後の確認項目（Claude Code 用）

1. ファイル名: `docs/specs/20260506_0105_shogi_at_spec_v1_3.md` として新規配置
2. v1.2（`20260506_0045_shogi_at_spec_v1_2.md`）はそのまま残す（履歴）
3. ロードマップ更新：v18 として A-T spec v1.3 確定を記録
4. git commit: `docs(A-T): spec v1.3 (ChatGPT Should Fix 7 件反映)`
5. push: feat/phase-a-t-test-hardening ブランチへ

これで A-T spec v1.3 が確定し、Stage 1 着手準備が完了。実装本体（Stage 1: 偽陽性検証）は次のセッションで Claude Code が着手。
