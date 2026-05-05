# ChatGPT レビュー依頼：shogi A-3 設計仕様書 v7.3

## 前回レビューからの変更

前回（v7.2）のレビュー結果（B+ / Conditional Go）を受けて、
サジェスト仕様の Must Fix 3件を反映した v7.3 を作成しました。

### Must Fix 反映内容

1. **member_id 保持を明記**
   - サジェスト選択時に selectedMasterMemberId を保持
   - 追加時に player.member_id として設定
   - 氏名手修正時は解除

2. **既存フォームとの差分を確定（案A）**
   - 追加前: 氏名・クラスのみ変更可能
   - 支部員区分・中学生以下区分: 追加後の行内セレクトで変更
   - 登録フォームに新規入力欄は追加しない

3. **サジェスト候補の対象・除外条件を明記**
   - deleted=true は除外
   - 当日登録済み member_id は二重追加しない
   - 候補選択後に氏名変更で member_id を解除

---

## 依頼

shogi リポジトリ（kazuo1970takahashi-sketch/shogi）の
docs/specs/20260505_1800_shogi_design_phaseA3_v7_3.md
を読んで、以下の観点でレビューしてください。

### 確認してほしい観点

1. 前回 Must Fix 3件が適切に解消されているか
2. サジェスト仕様全体として Claude Code に渡せる状態か
3. 新たな穴・矛盾がないか
4. 全体として Go / Conditional Go / No Go

### 判定

Must Fix / Should Fix / Nice to Have の3段階と、
Go / Conditional Go / No Go でお願いします。
