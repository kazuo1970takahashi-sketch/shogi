# Codex 独立レビュー依頼：Phase A-4.2 実装

**作成日時**: 2026-05-05 19:48 JST
**対象 PR**: https://github.com/kazuo1970takahashi-sketch/shogi/pull/9
**ブランチ**: `feat/phase-a4-2-class-buttons`
**依頼者**: 髙橋一雄（沼津支部運営）

---

## 0. 対象

shogi リポジトリ（kazuo1970takahashi-sketch/shogi）の PR #9 を独立レビューしてください。

### 関連ドキュメント

すべて main または PR ブランチに存在：

- 設計仕様書 v2: `docs/specs/20260505_1904_shogi_design_phaseA4_2_v2.md`（ChatGPT メタレビュー A/Go）
- Claude Code 実装依頼書: `docs/specs/20260505_1909_shogi_a4_2_claude_code_task.md`
- ChatGPT v1 → v2 メタレビュー記録: `docs/specs/20260505_1857_shogi_a4_2_v1_chatgpt_review_request.md` / `20260505_1904_shogi_a4_2_v2_chatgpt_review_request.md`
- A-4 仕様書 v2（A-4.2 の根拠）: `docs/specs/20260505_1746_shogi_design_phaseA4_v2.md`

---

## 1. レビュー観点

### 1.1 仕様準拠（最重要）

設計仕様書 v2 の §3.1 / §3.2 / §3.3 / §3.4 への準拠を確認してください。

#### §3.3 addPlayerFromMaster 純粋関数

- [ ] シグネチャ：`addPlayerFromMaster(memberId, cls, master, state)` で tournamentMeta を受け取らない
- [ ] エラーコード：`invalid_master` / `invalid_state` / `invalid_id` / `invalid_class` / `not_found` / `deleted` / `duplicate_member` / `duplicate_name` の全 8 種類が正しく分岐
- [ ] **重複チェックは member_id 優先**（duplicate_member）→ 残り全 player を normalizePersonName 比較し同名なら duplicate_name
- [ ] **same_name_different_member_id を安全側で duplicate_name として止める**
- [ ] 関数内で `master.yomi` / `master.last_class` / `master.attendance_count` / `master.last_attended` / `master.tournament_ids` を**一切変更しない**
- [ ] 関数内で `save()` / `renderRegList()` を呼ばない（純粋関数）
- [ ] `_pendingNewYomi` を触らない

#### §3.1 過去参加者パネル

- [ ] 各行に A/B 両方のボタン（min 44×44px、`pp-add-btn` クラス、data-cls 属性）
- [ ] `aria-label="氏名をXクラスで追加"` / `title="Xクラスで追加"`
- [ ] **行本体タップ無効**（cursor:default、hover 効果なし）
- [ ] 「追加先を選択（A/Bボタンで指定クラスへ追加）」ヒントテキスト表示
- [ ] last_class 強調（背景 #FFD580、文字色 #7a3e00、bold）
- [ ] 「前回:Aクラス」「前回:Bクラス」テキスト併記（last_class=null は非表示）

#### §3.2 サジェストリスト（最重要：Must Fix 1）

- [ ] **行本体タップでフォーム反映が残る**（A-4 既存挙動の維持）
- [ ] A/B ボタンで stopPropagation（行本体タップとの二重発火防止）
- [ ] mousedown / touchstart / click 全てで preventDefault + stopPropagation
- [ ] A/B 直接追加成功時：氏名欄・ふりがな欄クリア + サジェストリストを閉じる
- [ ] **A/B 直接追加経路で `master.yomi` を変更しない**（Should Fix 6）
- [ ] 行本体タップでフォーム反映 → 「追加」ボタン経由では既存挙動（master.yomi 空のときのみ補完）が維持

#### §3.4 last_class 表示

- [ ] A/B ボタン押下では `master.last_class` を更新しない
- [ ] saveData → syncBranchMasterOnSave 経由で `master.last_class` が `player.cls` に更新される（既存挙動）

### 1.2 Must Fix / Should Fix 反映状況

| 項目 | 確認 |
|------|------|
| Must Fix 1（サジェスト併用方式） | §3.2 確認 + e2e Stage 3 #29-32 |
| Must Fix 2（duplicate_member / duplicate_name 分離） | §3.3 確認 + 単体 add-09/13/14 |
| Should Fix 1（責務明記、master 副作用なし） | 単体 add-15/16 |
| Should Fix 2（last_class 更新タイミング） | e2e Stage 4 #65/66 |
| Should Fix 3（ヒントテキスト + aria-label） | e2e Stage 2 #5/13 |
| Should Fix 4（stopPropagation 二重発火防止） | e2e Stage 3 #31/32 |
| Should Fix 5（mobile-430 横スクロール）| e2e Stage 5 全件 |
| Should Fix 6（master.yomi 不変） | e2e Stage 3 #38/39 |

### 1.3 §7 実装禁止事項 21項目

特に以下を確認：

- [ ] schema_version を変更していない
- [ ] 新規スキーマフィールドを追加していない
- [ ] regular_class / 主クラスを追加していない
- [ ] player.yomi を追加していない
- [ ] マスタ編集モーダルにクラス編集 UI を追加していない
- [ ] applyMasterMemberEdit シグネチャを変更していない
- [ ] サジェストの行本体タップ→フォーム反映を完全削除していない
- [ ] 既存 addPlayer の大規模リファクタリングをしていない（新規関数追加のみ）
- [ ] A-4.1 のレイアウト揺れ修正を先取りしていない

### 1.4 既存機能の保護

- [ ] 既存テスト緑維持：smoke 50件、単体 554件（A-4.2 で +41）、e2e 182件（A-4.2 で +90）
- [ ] A-3 のサジェスト・member_id 連携の挙動が壊れていない
- [ ] A-3 の F8 branch master インポート挙動が壊れていない
- [ ] A-4 のふりがな入力欄・IME 自動取得・サジェスト yomi 同期の挙動が壊れていない
- [ ] A-4 のマスタ編集モーダルの member/grade 編集挙動が壊れていない
- [ ] A-4 の削除済み member tombstone 復元挙動が壊れていない
- [ ] A-4 の `_pendingNewYomi` 機能が壊れていない

---

## 2. 確認手順

### 2.1 ブランチ取得

```bash
git fetch origin
git checkout feat/phase-a4-2-class-buttons
git diff main...HEAD --stat
```

### 2.2 テスト実行

```bash
# smoke
bash test/run_tests.sh shogi_v4.html
# 期待: PASS=50, FAIL=0

# 単体
node test/test_branch_master.js shogi_v4.html
# 期待: 支部マスタ機能テスト: PASS 595件 / FAIL 0件

# e2e（chromium-desktop + mobile-375 の 2 project）
npx playwright test
# 期待: 272 passed / 0 failed
```

### 2.3 git diff --check

```bash
git diff --check origin/main...HEAD
# 期待: 問題なし
```

---

## 3. 実装上の留意点（Claude Code 報告より）

レビュー時に予め把握しておいてください。

### 3.1 dead code として残置されている関数

旧バルク追加 UI（過去参加者パネルのチェックボックス → 一括追加 → yomi 確認モーダル）の以下関数は、UI からの呼び出しを全削除したが、**単体テスト（test_branch_master.js）が依存しているためソースに残置**：

- `addSelectedPastParticipants`
- `finalizeAddPastParticipants`
- `applyYomiInputsToMaster`
- `buildYomiInputModalHtml`
- `bindYomiInputModalEvents`
- `openYomiInputDialog`

これらは無害な dead code として保持されており、UI からのエントリポイントは削除済みです。レビュー時にこれを「未使用関数の残置」として扱うか「テスト互換のため意図的残置」として扱うか判断してください。

### 3.2 player ID 生成パターン

仕様書 §3.3.3 step 5 では「既存 `genPlayerId()` を再利用」と記載しましたが、実コードには `genPlayerId()` 関数が存在せず、既存 `addPlayer` 内で `'p'+Date.now()+Math.floor(Math.random()*1000)` をインライン生成しているため、同じパターンを `addPlayerFromMaster` でも踏襲しています。

### 3.3 mousedown / touchstart / click の3イベント全てで stopPropagation

サジェストリストの A/B ボタン押下時、実機ブラウザ間（iPhone Safari / Android Chrome / Desktop）の挙動差を吸収するため、mousedown / touchstart / click の3イベント全てで `event.preventDefault() + event.stopPropagation()` を呼んでいます。

### 3.4 .pp-check 互換維持

過去参加者パネルの旧 UI（チェックボックス）に依存する A-3 e2e テストが3箇所あるため、`<input type="hidden" class="pp-check">` を行ごとに**隠しマーカー**として残置しています。data-mid は親 `.pp-row` 要素に1つだけ付与（A-4 e2e の `#ppPanel [data-mid]` 件数カウント互換）。

### 3.5 iPhone Safari 実機確認は未実施

A-4.2 では Playwright（Chromium / mobile-375）と仕様書で要求された mobile-430 e2e（45 ケース）をクリアしていますが、**iPhone 16 Plus 実機での A/B ボタン押下感・長い氏名表示・last_class 強調色の視認性**は未確認です。これは A-4.1（実機揺れ修正）と合わせて運用試験で確認予定。

---

## 4. 期待アウトプット

以下のフォーマットでレビュー結果をお願いします。

```
## 総合判定
A / A- / B+ / B / C / D （Must Fix の有無で決定）

## マージ判断
Yes / No （main にマージしてよいか）

## 確認結果
- bash test/run_tests.sh shogi_v4.html: PASS=X, FAIL=Y
- node test/test_branch_master.js shogi_v4.html: PASS=X件 / FAIL=Y件
- npx playwright test: X passed / Y failed
- git diff --check: 問題なし / 問題あり

## 仕様準拠（§3.1 / §3.2 / §3.3 / §3.4）
（各セクションの実装が仕様書通りか）

## Must Fix / Should Fix 反映確認
（v2 で指定された Must Fix 2件、Should Fix 6件、Nice to Have 2件の反映状況）

## §7 実装禁止事項 21項目
（特に違反がないか）

## 残リスク
（Must Fix ではないが気になった点）

## A-4.1 / 月例運用試験との関係
（本 PR を main に進めて問題ないか、A-4.1 でカバーされる残課題は何か）
```

---

## 5. 補足

- A-4.2 完了後の予定：本 PR を main にマージ → A-4.1（iPhone 16 Plus 実機揺れ修正）着手 → 月例大会で運用試験 → A-7（基盤拡張・schema v2・city 追加・tournament_archive 構造）に進行
- 本 PR が合格した場合、**A-4.2 機能（過去参加者パネル / サジェストの A/B ボタン）が次回月例大会の運用試験対象**になります。
