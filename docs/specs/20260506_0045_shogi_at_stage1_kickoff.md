# A-T Stage 1 キックオフ依頼（Claude Code 用）

**作成日時**: 2026-05-06 00:45 JST
**対象リポジトリ**: shogi（~/projects/shogi）
**対象ブランチ**: feat/phase-a-t-test-hardening
**フェーズ**: A-T（UI テスト基盤強化）
**Stage**: 1（既存 272 件の偽陽性検証）+ A-T spec v1.2 への更新

---

## 0. 前提

v1.2.5（ゼロバグ宣言）が 2026-05-06 00:33 に正式採用された（shogi-coach リポジトリ main マージ済み）。
A-T spec v1（2026-05-05 20:46 起草）は v1.2.5 確定前のため、v1.2 への更新が必要。

本キックオフは以下 2 つを実施：
- **Phase 0: A-T spec v1.2 への更新**（パッチ適用）
- **Phase 1: A-T Stage 1 着手**（既存 272 件の偽陽性検証）

実装本体（Stage 2 = expectClickable + clickAndExpectChange ヘルパ実装、Stage 4 = A-4.2 回帰テスト）は別セッションで着手。

---

## Phase 0: A-T spec v1.2 への更新

### Phase 0.1 パッチ参照

`docs/specs/20260506_0045_shogi_at_spec_v1_2_patch.md` を参照し、変更点 A〜G を v1 に適用して v1.2 を作成。

### Phase 0.2 適用手順

```bash
cd ~/projects/shogi
git checkout feat/phase-a-t-test-hardening
git pull --ff-only origin feat/phase-a-t-test-hardening

# v1 をベースに v1.2 を作成
cp docs/specs/20260505_2046_shogi_at_spec_v1.md \
   docs/specs/20260506_0045_shogi_at_spec_v1_2.md

# パッチ参照の変更点 A〜G を順次適用
# （Claude Code が patch を読みながら手動編集）
```

### Phase 0.3 適用後の確認

- [ ] §0 末尾に v1.2 改訂理由が記載されている
- [ ] §4.2 expectClickable が 7 段階検証 + 5 点 hit-test に強化されている
- [ ] §4.3 clickAndExpectChange ヘルパ仕様が新設されている
- [ ] §4.3.7 shogi 固有 primary assertion カタログが完備されている
- [ ] §5 Stage 2 / Stage 4 完了基準に primary assertion 必須化が反映されている
- [ ] §6 受け入れ基準に v1.2.5 §2.2 L4 完全整合が追加されている
- [ ] 改訂履歴に v1.2 行が追加されている

### Phase 0.4 commit & push

```bash
git add docs/specs/20260506_0045_shogi_at_spec_v1_2.md
git commit -m "docs(A-T): spec v1.2 (v1.2.5 §2.2 L4 反映)

v1.2.5 が 2026-05-06 00:33 に正式採用されたことを受け、A-T spec を v1.2 に更新。

主要変更:
- §0: v1.2 改訂理由を末尾に追記
- §4.2 expectClickable: 7 段階検証 + 5 点 hit-test + force:true 禁止 + CSS 踏み抜き要因検証
- §4.3 clickAndExpectChange: 新設（primary semantic assertion 必須化、UI 重要操作で通知のみ禁止、画面遷移系例外）
- §4.3.7 shogi 固有 primary assertion カタログ: 8 操作分を完備
- §5 Stage 2 完了基準: primary assertion 宣言済みを追加
- §5 Stage 4 完了基準: A-4.2 回帰テストの primary assertion で赤を追加
- §6 受け入れ基準: v1.2.5 §2.2 L4 完全整合を追加

v1 (20260505_2046_shogi_at_spec_v1.md) はそのまま残置（履歴）。"

git push origin feat/phase-a-t-test-hardening
```

---

## Phase 1: A-T Stage 1 着手（既存 272 件の偽陽性検証）

### Phase 1.1 目的

既存 272 件の e2e テスト全件緑だったにもかかわらず、A-4.2 が実機で動かなかった原因を特定する。
**「テストは何を見ていなかったのか」** を明らかにし、Stage 2 で何を置換すべきかの判断材料とする。

### Phase 1.2 対象ファイル

```
test/e2e/index_layout.spec.js         (2,665 bytes)
test/e2e/shogi_app.spec.js            (5,052 bytes)
test/e2e/shogi_app_a3.spec.js         (22,672 bytes)
test/e2e/shogi_app_a4.spec.js         (31,648 bytes)
test/e2e/shogi_app_a4_2.spec.js       (27,032 bytes)  ← A-4.2 リグレッションを通過した spec
```

### Phase 1.3 検証観点（v1.2 §4.1 の 4 原則と照合）

各テストについて、以下を確認：

**観点 1: force: true 利用の有無**
- `grep -rn "force: true" test/e2e/` で全箇所抽出
- 利用箇所と理由を記録

**観点 2: クリック前検証の不在**
- `page.click()` 直前に `expectClickable` 相当の検証があるか
- toBeVisible()、toBeEnabled() のみで止まっていないか

**観点 3: クリック後の意味的検証の不在（最重要）**
- click 後に **state / DOM / 永続化 / URL の変化を assert しているか**
- showMsg / toast / alert の表示のみで成功とみなしているテストはないか
- A-4.2 の場合、`state.players[lastIndex].cls === 'A'` を assert していたか

**観点 4: 関数直接呼び出しによる UI バイパス**
- `page.evaluate(() => addPlayerFromMaster(...))` のように、UI を経由せず純粋関数を直接呼んでいないか
- これは「実装の単体テスト」であり「UI テスト」ではない

**観点 5: クリック対象セレクタの曖昧さ**
- `getByRole('button')` で複数要素にマッチする可能性
- nth(0) / first() で最初の要素を取っているが、それが正しい要素か検証していない

### Phase 1.4 偽陽性レポートの形式

`docs/specs/20260506_HHMM_shogi_at_stage1_falsepositive_report.md` として作成：

```markdown
# A-T Stage 1: 既存 272 件の偽陽性レポート

## 1. サマリ
- 検証対象: 5 ファイル、272 件
- 偽陽性疑い: N 件
- 構造的問題: M 件
- A-4.2 すり抜け原因: ...

## 2. ファイル別偽陽性

### 2.1 shogi_app_a4_2.spec.js
| 行 | テスト名 | 観点 1〜5 のどれに該当 | 詳細 |
|----|---------|---------------------|------|
| ... | ... | 観点 3 | クリック後 toast 確認のみで state 未検証 |

### 2.2 shogi_app_a4.spec.js
...

## 3. A-4.2 リグレッション通過の根本原因
（観点 1〜5 のうちどれが効いたか、複数該当の場合は優先順位）

## 4. Stage 2 への申し送り
- 必ず置換すべきパターン
- 既存テストのうち primary assertion を持っていたテスト数
- 完全書き直しが必要なテスト数
```

### Phase 1.5 commit & push

Stage 1 の調査結果は実装変更を伴わない docs 追加のみ。
- 偽陽性レポートを `docs/specs/` に配置
- ロードマップを v17 に更新（A-T Stage 1 完了）

```bash
git add docs/specs/20260506_*_shogi_at_stage1_falsepositive_report.md \
        ROADMAP.md または該当のロードマップファイル

git commit -m "docs(A-T Stage 1): 既存 272 件の偽陽性レポート

A-T spec v1.2 §4.1 の 4 原則 + v1.2.5 §2.2 L4 観点で全件精査。

主な発見:
- 観点 1 (force: true): N 件
- 観点 2 (クリック前検証不在): M 件
- 観点 3 (意味的検証不在): K 件 ← A-4.2 すり抜け主因
- 観点 4 (関数直接呼び出し): J 件
- 観点 5 (セレクタ曖昧): I 件

Stage 2 への申し送り: 完全書き直し N 件 / 部分置換 M 件。

A-T spec v1.2 §6 受け入れ基準への準拠状況を Stage 2 で測定。"

git push origin feat/phase-a-t-test-hardening
```

### Phase 1.6 完了報告

Stage 1 完了時、以下を Claude.ai に報告：
1. 偽陽性疑い件数とカテゴリ別内訳
2. A-4.2 すり抜けの主因（観点 1〜5 のどれか）
3. Stage 2 への影響見積（完全書き直し vs 部分置換の比率）
4. ロードマップ v17 の commit hash

---

## 2. Phase 0 / Phase 1 の完了見積

| Phase | 内容 | 工数見積 |
|-------|------|---------|
| Phase 0 | A-T spec v1 → v1.2 更新（パッチ適用 + push） | 30 分 |
| Phase 1 | 既存 272 件の偽陽性検証 + レポート作成 | 1〜2 セッション |

Phase 0 は今のセッションで完走可能。Phase 1 は別セッションで着手。

---

## 3. 重要な確認事項

### 3.1 v1.2.5 採用後初の Stage 着手

- このタスクは v1.2.5 §2.2 L0「業務モデル文書」「§0 ユーザーストーリー」が前提
- shogi リポジトリには既に shogi_v4.html の業務モデルが docs/specs/ に存在するか確認
- 不足する場合は Phase 0 と並行して整備（ただし Stage 1 の進捗を阻害しない範囲）

### 3.2 段階的導入（v1.2.5 §13.6 段階 1）

- A-T 全体は段階 1 自動マージ範囲を超える
- Stage 1 完了時 = 偽陽性レポート（docs のみ）= 段階 1 で自動マージ可能
- Stage 2 以降 = ヘルパ実装、テスト書き換え = 段階 2/3 移行後でないと自動マージ不可
- 当面は Stage ごとに PR を切り、髙橋さん手動承認 → main マージ

### 3.3 §0 ユーザーストーリー必須

A-T spec v1.2 起草時に §0 にユーザーストーリーが含まれているか確認。
v1.2.5 §2.2 L1「§0 ユーザーストーリーがないフェーズ仕様書は ChatGPT メタレビューで自動的に B 判定」のため必須。
不足する場合は Phase 0 で追加（テスト基盤強化のユーザーストーリー：「テストが緑なら実機でも動くと信頼できる」「リグレッションが起きたら CI で自動検出される」等）。

---

## 4. Phase 0 完了後の指示

Phase 0 完了したら、以下を報告：
1. v1.2 ファイル名 + commit hash
2. push 確認
3. §0 にユーザーストーリーが既存だったか / 追加したか
4. ChatGPT に v1.2 のメタレビューを依頼するかどうかの判断

ChatGPT メタレビューを依頼する場合は、v1.2.5 §2.2 L2 Devil's Advocate プロンプトを必ず投入する。
