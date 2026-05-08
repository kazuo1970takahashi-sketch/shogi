# Phase 1 Mini 仕様書: マスタ「市町村」(city) フィールド追加

- 対象: shogi_v4.html(沼津支部運営ツール)
- 関連: roadmap v21、DevSecOps v2.0 Slim v1.1、Postmortem v2(L-1〜L-4)
- 目的: 5/10 月例将棋大会本番で過去参加者パネル + 市町村情報を活用するための前提整備
- 区分: Mini Spec / Gate Review
- 改訂: 2026-05-08 ChatGPT レビュー(判定 A-)指摘反映

---

## 1. 目的・背景

5/10 本番に向け、過去 1 回分(2026-04-12 開催)の参加者 22 名をマスタに取り込む(Phase 2)。取り込み時に **市町村** 情報も同時保持したいため、先にマスタスキーマへ `city` を追加する。マスタ一覧画面の 5 列構成(roadmap v21 確定: 氏名/支部員区分/中学生以下区分/編集/削除)は本フェーズでは維持し、city は F7 編集モーダル内のみで扱う。

## 2. スキーマ変更

```
person = {
  ...existing fields...,
  city: string  // ← NEW. 例: 沼津市 / 三島市 / 長泉町 / 清水町。default = ""。maxlength = 20
}
```

- 既存フィールド(name / yomi / member / grade / last_class / last_played など)は変更なし
- スキーマバージョン bump 要否は Plan Mode で判断(基準は §8 参照)

### 2.1 正規化ルール (ChatGPT Must Fix 1 反映)

- 保存前に `String(value ?? "").trim()` で正規化する
- 未入力・null・undefined はすべて `""` として扱う
- maxlength=20 は UI 入力時と保存時バリデーションの両方で保証する
- city は任意項目であり、空文字を有効値とする
- 手入力・JSON import・旧データ読込補完 すべてで同一ルールを適用する(自由入力・旧データ・import データの扱いを揃える)

## 3. UI 変更

- F7 編集モーダル: 市町村入力欄追加(`<input type="text">`、placeholder=`例:沼津市`、maxlength=20、必須ではない)
  - 表示位置: 既存項目に揃えた素直なレイアウト(L-1〜L-4 安全境界準拠)
- マスタ一覧画面: **変更なし**(5 列維持)
- インポート/エクスポート JSON: city フィールドを含める

## 4. 移行・下位互換

- 既存 localStorage 内の person オブジェクトに city が無い場合 → 読み込み時に `""` を補完(§2.1 正規化ルール準拠)
- 旧バックアップ JSON のリストア時 → 同様に `""` 補完
- **(ChatGPT Should Fix 1 反映)** city 付き JSON を旧版相当の読み込み処理で読み込んだ場合に unknown field を無視して壊れないことを、**Claude Code が既存 import/restore 実装を読み取り確認**する。必要なら最小 e2e または手動確認を追加(ChatGPT は実コード実行不可のため確認主体を実装側に寄せる)

## 5. 受け入れ条件 (Gate-level e2e)

1. F7 モーダル: city 入力 → 保存 → モーダル再オープンで保持されている
2. §2.1 正規化ルールが手入力・JSON import・旧データ補完すべてで適用される(trim・空文字補完・null/undefined→"")
3. city 不在の旧データを読み込み → city = "" として表示・編集できる
4. バックアップ → リストア の round-trip で city が保持される
5. マスタ一覧の 5 列構成・既存挙動に変化がない
6. **既存 e2e 594 緑(2026-05-08 整備 Sprint 完了時点)を維持**

## 6. Out of Scope(別タスク化)

- マスタ一覧への city 列追加(将来検討、本フェーズでは F7 内確認のみ)
- city のサジェスト/プルダウン化(自由記述で開始)
- city による絞り込み・並び替え
- schema_version 新設(§8.1 参照、本フェーズでは行わない)

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

### 8.1 スキーマバージョン bump 判断基準 (ChatGPT Should Fix 2 反映)

- 既存に `schema_version` / migration 関数 が **ある場合** → 規定どおり bump する
- 既存に **無い場合** → 読み込み時補完のみで対応し、schema_version 新設は本フェーズ Out of Scope(過剰実装防止)

## 9. レビュー深度

- 仕様書: ChatGPT Mini Spec レビュー(A- → 軽微修正反映済、再レビュー省略)
- 実装後: Codex Gate Review(P0 + 保存読込 + データ破壊 + 既存挙動破壊の観点のみ)

## 10. 次フェーズ予告

Phase 1 マージ後、Phase 2 仕様書 (Mini) で 22 名取り込みを定義する。Phase 2 はリセット + import + runbook の 3 点セットで、**データ破壊 P0** として扱う。Phase 2 着手条件は Phase 2 仕様書 §1.1 に明記。
