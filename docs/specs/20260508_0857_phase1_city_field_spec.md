# Phase 1 Mini 仕様書: マスタ「市町村」(city) フィールド追加

- 対象: shogi_v4.html(沼津支部運営ツール)
- 関連: roadmap v21、DevSecOps v2.0 Slim v1.1、Postmortem v2(L-1〜L-4)
- 目的: 5/10 月例将棋大会本番で過去参加者パネル + 市町村情報を活用するための前提整備
- 区分: Mini Spec / Gate Review

---

## 1. 目的・背景

5/10 本番に向け、過去 1 回分(2026-04-12 開催)の参加者 22 名をマスタに取り込む(Phase 2)。取り込み時に **市町村** 情報も同時保持したいため、先にマスタスキーマへ `city` を追加する。マスタ一覧画面の 5 列構成(roadmap v21 確定: 氏名/支部員区分/中学生以下区分/編集/削除)は本フェーズでは維持し、city は F7 編集モーダル内のみで扱う。

## 2. スキーマ変更

```
person = {
  ...existing fields...,
  city: string  // ← NEW. 例: "沼津市"。default = ""。maxlength = 20
}
```

- 既存 `name` / `yomi` / `member` / `grade` / `last_class` / `last_played` などは変更なし
- スキーマバージョンの bump 要否は Plan Mode で現状の管理方式を確認のうえ決定

## 3. UI 変更

- F7 編集モーダル: 市町村入力欄追加(`<input type="text">`、placeholder=`例:沼津市`、maxlength=20、必須ではない)
  - 表示位置: 既存項目に揃えた素直なレイアウト(L-1〜L-4 安全境界準拠)
- マスタ一覧画面: **変更なし**(5 列維持)
- インポート/エクスポート JSON: city フィールドを含める

## 4. 移行・下位互換

- 既存 localStorage 内の person オブジェクトに city が無い場合 → 読み込み時に `""` を補完
- 旧バックアップ JSON のリストア時 → 同様に `""` 補完
- city 付き JSON を旧版 shogi_v4.html で読み込んでも壊れないこと(unknown フィールドの寛容な扱い)を ChatGPT レビューで確認

## 5. 受け入れ条件 (Gate-level e2e)

1. F7 モーダル: city 入力 → 保存 → モーダル再オープンで保持されている
2. city 不在の旧データを読み込み → city = "" として表示・編集できる
3. バックアップ → リストア の round-trip で city が保持される
4. マスタ一覧の 5 列構成・既存挙動に変化がない
5. **既存 e2e 594 緑(2026-05-08 整備 Sprint 完了時点)を維持**

## 6. Out of Scope(別タスク化)

- マスタ一覧への city 列追加(将来検討、本フェーズでは F7 内確認のみ)
- city のサジェスト/プルダウン化(自由記述で開始)
- city による絞り込み・並び替え

## 7. リスク (P0 観点)

- localStorage マイグレーション失敗で既存マスタ消失
- バックアップ JSON 下位互換喪失
- F7 モーダルレイアウト破綻(L-1〜L-4 違反)

## 8. Plan Mode で確認すべき項目

Claude Code 着手時、Shift+Tab×2 で Plan Mode に入り、以下を読み取りで確認してから計画を出すこと:

- 現状の person オブジェクト定義箇所と読み書きパス
- スキーマバージョン管理の有無と方式
- F7 編集モーダルの実装箇所と既存入力欄の構造
- バックアップ/リストアの JSON 形式
- 既存 e2e 594 の対象範囲(city 追加で影響を受けるテストの有無)

## 9. レビュー深度

- 仕様書: ChatGPT Mini Spec レビュー(Devil's Advocate 不要)
- 実装後: Codex Gate Review(P0 + 保存読込 + データ破壊 + 既存挙動破壊の観点のみ)

## 10. 次フェーズ予告

Phase 1 マージ後、Phase 2 仕様書 (Mini) で 22 名取り込みを定義する。データは別ファイル `20260412_participants.json` で先行提供済(高橋一雄=B級は name + last_played でマージ判定、大竹智也=A級高校生は grade 補完時に「一般」)。
