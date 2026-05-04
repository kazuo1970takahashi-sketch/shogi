# ChatGPT 設計メタレビュー結果（v3）— shogi_v4 Phase A

**レビュー実施日**: 2026-05-05
**レビュー対象**:
- 仕様書: `docs/specs/20260504_2341_shogi_design_phaseA_reception_v3.md`
- 依頼文: `docs/reviews/20260505_0018_shogi_chatgpt_review_request_phaseA.md`
- ブランチ: `docs/phase-a-design-and-chatgpt-request`
- 参照必須: `HANDOFF.md`（将棋版で確認済）

**判定**: **B+ / Conditional Go**

---

## 0. HANDOFF.md 確認

HANDOFF.md は冒頭から「沼津支部 月例将棋大会 運営ツール」と明記されており、内容もスイス式トーナメント、shogi_v4.html、GitHub Pages、スマホ運用前提の将棋大会アプリとして説明されている。

したがって、今回参照した HANDOFF.md はゴルフコンペ版ではなく、将棋版であることを確認済み。

---

## 1. 全体判定

**Conditional Go / B+**

設計方針そのものは妥当。ただし、A-1 実装前に仕様書 v4 で修正した方がよい Must Fix が3点ある。

方向性として、「受付効率化」「過去参加者のワンクリック呼び出し」「localStorage 完結」「Phase A-1 → 運用試験 → A-2」という流れは妥当。
2026-05-01 の方針（運用の信頼性を上げる、Phase 0→1、便利機能を主要導線に混ぜない）とも概ね整合。

ただし、現仕様のまま実装に進むと、次の3点で事故りやすい。

### Must Fix 1
A-1 に F9 マイグレーションを入れているのに、F9 の起動場所が A-2 の「マスタ」タブ前提になっている。

### Must Fix 2
member_id が UUID 先頭6文字なのは短すぎる。

### Must Fix 3
大会JSONへの member_id 追記と、既存 state 構造との接続仕様がまだ曖昧。
また、支部マスタの normalize 仕様が不足している。

main へのマージは現時点では待った方がよい。
ただし、これは No-Go ではなく、仕様書 v4 で軽く補正すれば Phase A-1 実装へ進めてよい、という評価。

---

## 2. 観点別レビュー（要約）

### A. データモデルの妥当性 — Minor〜Must Fix 混在
- 2.1 schema_version: 方向は OK。ただし破損時の補正仕様が薄い → **MF3 に集約**
- 2.2 tombstone: OK / Minor。A-1 では予約のみ、操作 UI は A-2 と明記すべき
- 2.3 ID付与ルール: **Must Fix（MF2）**。6文字 → 12文字以上に
- 2.4 tournament_ids[]: OK / Minor。attendance_count を派生値扱いに
- 2.5 マスタ更新ロジック: OK / Minor。A-1 は「漢字氏名一致中心」と明記、空白正規化を追加

### B. アーキテクチャ転換ポイントとの距離 — OK / 黄色信号
- 沼津支部単独の月例大会レベルなら localStorage で十分
- ただし以下が出たら転換ポイント：複数端末同時受付、複数幹事共有、他支部展開、年間ランキング、氏名以外の個人情報、監査ログ、キオスク分離、端末故障時の復元
- 現仕様はまだ手前。ただし Phase B キオスクや他支部展開を考えると境界線は近い

### C. HANDOFF.md との整合 — Minor / 一部 Must Fix
- Phase A は機能追加でリファクタではないので大筋 OK
- 4.1 既存 state と支部マスタを混ぜないこと（resetAll でマスタを消さない、JSON 保存の意味分離）
- 4.2 build/bind/coordinator パターン維持（既存 renderRegList に詰め込まない）

### D. YAGNI / 過剰設計 — Minor
- 50音タブ、ふりがな入力、tombstone、tournament_ids は妥当（A-2 送り or A-1 データのみ）
- クイックフィルタ（前回参加者・3ヶ月以内・常連）は A-1 では不要、A-2 へ

### E. A-1 / A-2 分割の妥当性 — Must Fix あり
- **最大の矛盾（MF1）**：F9 は A-1 だが起動場所が A-2 のマスタタブ前提
- 推奨案1：A-1 に最小マスタタブを含める
- 漢字検索を A-1 に入れる判断は OK
- A-1 完結条件を明記すべき

### F. テスト計画の十分性 — Minor / 追加推奨
- 既存壊れないテスト、マスタ破損時テスト、同名異人テスト、ID衝突テスト、二重加算防止テストの追加推奨

### G. その他 — Minor
- 8.1 個人情報（F10 を A-1 に前倒し推奨）
- 8.2 マスタ同期タイミングの明確化（save / saveData の責務分離、二重加算防止）
- 8.3 tournament_id 同日重複ルール（suffix `_2`, `_3`）
- 8.4 shogi-coach 連携：member_id を安定した長いIDに

---

## 3. Must Fix 一覧

| # | 内容 | 推奨修正 |
|---|---|---|
| MF1 | A-1 / A-2 の矛盾 | A-1 に最小マスタタブを含める（登録人数表示・マイグレ起動・簡易一覧・利用目的のみ） |
| MF2 | member_id 短すぎ | `m_` + crypto.randomUUID().slice(0, 12) + 衝突再生成 |
| MF3 | 正規化仕様不足 | `normalizeBranchMaster(raw)` を仕様に追加（schema_version、members、deleted、tournament_ids、attendance_count 再計算、name 空除外、壊れたマスタを読んでも既存大会運営を止めない） |

---

## 4. Minor 改善一覧

- F10 利用目的明示は A-1 に前倒し
- attendance_count は tournament_ids.length から再計算
- tournament_id の同日重複ルールを追加
- localStorage 保存と JSONバックアップ保存のどちらでマスタ同期するかを明記
- resetAll() がマスタを消さないと明記
- A-1 の曖昧マッチは「漢字氏名一致中心」と明記
- 空白差異・全角半角差異の正規化ルールを追加
- マスタ破損時テストを追加
- 同名異人テストを必須化
- 同一 tournament_id の二重加算防止テストを追加
- 既存大会 state と支部マスタを混ぜないと明記
- 既存 build/bind/coordinator パターンを新規UIにも適用する

---

## 5. 推奨する Phase A-1 再定義

### Phase A-1
- F1 支部マスタのデータ層
- F2 大会保存時または明示タイミングでの自動マスタ更新
- F3 ワンクリック呼び出しUI
- F5a 漢字部分一致検索
- F9 マイグレーションウィザード
- F10 利用目的の最小表示
- 最小マスタタブ（登録人数表示・マイグレーション起動・簡易一覧・利用目的表示）

### Phase A-1 ではやらない
- ふりがな入力、ふりがな検索、50音タブ
- マスタ編集、tombstone 操作
- エクスポート/インポート
- 常連フィルタ
- 詳細なマスタ管理画面

### Phase A-2
- ふりがな入力、ふりがな検索、50音タブ
- マスタ管理画面、編集、削除/tombstone
- エクスポート/インポート
- クイックフィルタ
- 利用目的表示の詳細化

---

## 6. 最終結論

**main へのマージは、現時点ではまだ待った方がよい。**

ただし、設計の方向性は良い。これは No-Go ではない。

### 最終判定
**B+ / Conditional Go**

### 推奨フロー
1. 仕様書 v4 を作成
2. Must Fix 3点を反映
3. Minor 改善のうち、F10 前倒し・同期タイミング・resetAll()・二重加算防止を反映
4. Phase A-1 実装プロンプトを作成
5. Claude Code で実装
6. 既存テスト + 新規マスタテストを実行
7. Codex 実装レビュー
8. 次回月例大会で運用試験

### Conditional Go の条件
以下3点を仕様書 v4 に反映してから実装に進むこと：

1. A-1 に最小マスタタブを含める、または F9 を A-2 に送る
2. member_id を UUID 先頭12文字以上にする
3. normalizeBranchMaster(raw) とマスタ破損時の扱いを明記する

この3点を直せば、Phase A-1 は実装に進めてよい。

---

**END OF REVIEW**
