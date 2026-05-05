# ChatGPT レビュー依頼：shogi A-3 設計仕様書 v7.2

## 前回レビューからの変更

前回（v7.1）のレビュー結果（B+ / Conditional Go）を受けて、
Must Fix 2件を反映した v7.2 を作成しました。

変更点:
1. Must Fix 1 反映: F8のデータ種別を明確に分離（branch master形式のみ）
2. Must Fix 2 反映: tombstoneのマージインポート時挙動を確定（復活させない）
3. 新規追加: 登録画面×マスタ接続（サジェスト方式）をA-3スコープに追加
4. Should Fix反映: 救済路・確認ダイアログ強化・クイックフィルタ名称・Stage中止条件

## 依頼

shogi リポジトリ（kazuo1970takahashi-sketch/shogi）の
docs/specs/20260505_1700_shogi_design_phaseA3_v7_2.md
を読んで、以下の観点でレビューしてください。

### 確認してほしい観点

1. Must Fix 2件が適切に解消されているか
2. 新規追加のサジェスト仕様（登録画面×マスタ接続）に問題がないか
3. F8の分離（branch master形式のみ）で設計上の穴が生じていないか
4. tombstoneのマージ挙動確定により、テスト計画に不整合がないか
5. 全体として Claude Code 実装に渡せる状態か

### 判定

Must Fix / Should Fix / Nice to Have の3段階と、
Go / Conditional Go / No Go でお願いします。
