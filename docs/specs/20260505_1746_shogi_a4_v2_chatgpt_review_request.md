# ChatGPT メタレビュー依頼：Phase A-4 設計仕様書 v2（再判定）

## 対象

shogi リポジトリ（kazuo1970takahashi-sketch/shogi）main ブランチの
`docs/specs/20260505_1746_shogi_design_phaseA4_v2.md`
を読んで再判定してください。

## 背景

v1.1 のレビューで **B+ / Conditional Go**、Must Fix 2件 + Should Fix 6件 + Nice to Have 3件の指摘をいただきました。
v2 ではこれらすべてを反映しています。

## 主な変更点

### Must Fix 反映
1. **Must Fix 1（手動編集判定）**：§3.1.2 で状態管理ルール（`_yomiAutoBuffer` / `_yomiManuallyEdited` / `_suggestState.selectedMemberId`）と動作ルールを明記
2. **Must Fix 2（シグネチャ一本化）**：§3.3.2 で `applyMasterMemberEdit(memberId, newName, newYomi, master, options)` に統一。旧案を完全排除

### Should Fix 反映
1. **Should Fix 1（Stage 6 切り出し）**：§4 中止条件で「A-4.1として別PR化」明記
2. **Should Fix 2（補助機能位置付け）**：§1「A-4 設計思想」で明記
3. **Should Fix 3（yomi 一時保持）**：§3.1.4 で `_pendingNewYomi` 方式とplayer.yomi非追加を明記
4. **Should Fix 4（共通判定関数）**：§3.5.1 で `isNoYomiMember` を定義
5. **Should Fix 5（e2e 1px許容）**：§3.6.4 で `Math.abs(diff) <= 1` を明記
6. **Should Fix 6（復元後の再反映）**：§3.4.3 + §8 完了条件に明記

### Nice to Have 反映
1. **N1（履歴情報表示）**：§3.3.1 で編集モーダルに履歴情報を読み取り専用表示
2. **N2（補助文）**：§3.1.1 で「自動入力されない場合は手入力してください」追加
3. **N3（削除日時）**：§3.2.3 で削除済みモード時に削除日時表示

### 実装禁止事項拡張
§7 に v2 追加で 8〜17 番（10項目）を追加（IME外部ライブラリ禁止、登録ブロック禁止、CSS推測修正禁止 等）

## レビュー観点

仕様書 §9 の9点を中心に、各反映内容が十分か確認してください。

## 判定

A / B / C / D で再判定をお願いします。
A 判定なら Claude Code 実装着手、Conditional Go 以下なら追加修正します。
