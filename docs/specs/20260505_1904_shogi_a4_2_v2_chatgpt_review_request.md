# ChatGPT メタレビュー依頼：Phase A-4.2 設計仕様書 v2（再判定）

## 対象

shogi リポジトリ（kazuo1970takahashi-sketch/shogi）main ブランチの
`docs/specs/20260505_1904_shogi_design_phaseA4_2_v2.md`
を読んで再判定してください。

## 背景

v1 のレビューで **B+ / Conditional Go**、Must Fix 2件 + Should Fix 6件 + Nice to Have 3件の指摘をいただきました。
v2 ではこれらすべてを反映しています。

## 主な変更点

### Must Fix 反映
1. **Must Fix 1（サジェスト併用方式）**：§3.2.2 でサジェスト行本体タップ→フォーム反映を維持。A/B ボタンには `event.preventDefault()` + `event.stopPropagation()` を明記。yomi 修正経路（§3.2.4）を整理
2. **Must Fix 2（member_id 優先重複チェック）**：§3.3.2 で `duplicate_member` を新規エラーコードとして追加。`duplicate_name` は normalizePersonName 後の同名のみ。

### Should Fix 反映
1. **Should Fix 1（責務明記）**：§3.3.3 + §7-18 で `addPlayerFromMaster` 内での master 更新を全面禁止。saveData → syncBranchMasterOnSave 側の責務であることを明記
2. **Should Fix 2（last_class 更新タイミング）**：§3.4.2 + §7-17 で「ボタン押下時には更新せず、大会保存時に更新」を明記
3. **Should Fix 3（UI明確化）**：§3.1.2 で「追加先を選択」ヒントテキスト + 行本体タップ無効化 + cursor 設定を明記
4. **Should Fix 4（stopPropagation）**：§3.1.3 + §3.2.3 + §7-14 で明記
5. **Should Fix 5（mobile-430 確認）**：§6 + §8 完結条件 + §5.2 Stage 5 e2e で明記
6. **Should Fix 6（master.yomi 不変）**：§3.2.4 で yomi 修正経路を 3 経路に整理（行本体タップ / A/B 直接追加 / マスタ編集モーダル）

### Nice to Have 反映
1. **N1（aria-label / title）**：§3.1.4 で明記
2. **N2（前回テキスト併記）**：§3.4.3 で必須化
3. **N3（連打防止）**：duplicate_member チェックで実質防止できるため実装裁量に委ねる

### 単体・e2e テストの拡充
- 単体：12件 → 17件（duplicate_member、duplicate_name_normalized、same_name_different_member_id、last_class 不変、attendance_count 等不変、invalid_id 追加）
- e2e：14件 → 18件（行本体タップ維持、二重発火防止、yomi 不変、last_class 不変、mobile-430 横スクロール、ヒントテキスト、aria-label 等）

### 実装禁止事項拡張
§7 に v2 追加 で 14〜21 番（8項目）を追加（行本体タップ二重発火禁止、サジェスト完全削除禁止、master 各種フィールド更新禁止、name のみ重複チェック禁止、master.yomi 変更禁止、大規模リファクタリング禁止）

## レビュー観点

仕様書 §9 の9点を中心に、各反映内容が十分か確認してください。

## 判定

A / B / C / D で再判定をお願いします。
A 判定なら Claude Code 実装着手、Conditional Go 以下なら追加修正します。
