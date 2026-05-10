# SHOGI-TOUR A-4 完了報告

## 概要

| 項目 | 内容 |
|---|---|
| Project ID | SHOGI-TOUR |
| Phase | A-4 |
| 完了日 | 2026-05-10 |
| マージコミット | a615594 (PR #33) |
| 関連dep修正 | 050c462 (PR #34) |
| SSoT spec | docs/specs/20260510_1904_shogi_a4_specs.md |
| 関連Issue | #32 (本完了報告と同時に close) |

---

## 1. 実装内容

SSoT spec §9 推奨実装順に対する達成状況。

| # | 項目 | 状態 | 備考 |
|---|---|---|---|
| 1 | B級R1終了状態 fixture | ✅ 実装 | `test/fixtures/b_class_r1_done.json` |
| 2 | ペアリング品質評価関数 | ✅ 実装 | `evaluatePairingQuality`（純粋関数） |
| 3 | 品質評価 単体テスト | ✅ 実装 | 32 → 34 assertions PASS（Codex Must Fix 修正で +2） |
| 4 | B級R2 回帰テスト | ✅ 実装 | 14 assertions PASS |
| 5 | lastModifiedBy フラグ | ✅ 実装 | `normalizeState` 補完含む / 19 assertions PASS |
| 6 | 警告組み込み | ✅ 実装 | `buildCurrentPairingsHtml` 内・表示のみ・ブロックなし |
| 7 | 番号表示 主要画面展開 | ✅ 実装 | PDF 含む全範囲 |
| 8 | 卓番号表示 (MF6-a) | ✅ 実装 | 配列 index+1 で算出・永続化なし |
| 9 | 理由表示ラベル (MF4) | ✅ 実装 | 軽量ラベル方式（§2 準拠） |
| 10 | 勝者番号ボタン (MF6-b) | ⏭️ A-5 送り | 既存 `winner-btn` が「番号｜名前」表示済みで実質的に番号押下 UI と同等のため、UI 重複を避けて A-5 で「卓番号入力 → 勝者番号入力」のリンク式 UI として再設計 |

---

## 2. テスト結果

| 種別 | 結果 |
|---|---|
| 既存テスト（3 層 + ペアリング性質 + タブ選択 + 支部マスタ） | 53/53 PASS |
| A-4 新規 品質評価 単体テスト | 34 assertions PASS |
| A-4 新規 B級R2 回帰テスト | 14 assertions PASS |
| A-4 新規 normalizeState lastModifiedBy 補完テスト | 19 assertions PASS |
| `bash test/run_tests.sh` 合計 | PASS=56 ブロック / FAIL=0 / WARN=0 |
| Security Scan (CI) | ✅ pass（PR #33・PR #34 両方） |
| Unit (CI) | ✅ pass |
| E2E (Playwright) (CI) | ❌ fail（既存 main 由来問題・別タスク化） |

`npm audit --audit-level=high`：merge 後の main で `found 0 vulnerabilities` を確認。

---

## 3. レビュー履歴

| ステップ | レビュアー | 評価 | 備考 |
|---|---|---|---|
| Issue #32 設計レビュー | Claude.ai | Conditional Go | 6 つの Go 条件提示 |
| Issue #32 設計レビュー | ChatGPT 司令塔 | Go | 6 条件確定 |
| 実装初版レビュー | Codex | Conditional Go (B) | `[要確認]` ラベル付与漏れ指摘 |
| 修正後レビュー | Codex | Go (A-) | Must Fix 解消 |
| dep修正PR (#34) レビュー | Codex | Go (A-) | fast-uri 3.1.2 対応 |
| マージ判定 | Claude.ai 代行 | Go | ChatGPT 制限のため代行 |

---

## 4. SSoT spec 遵守度

| 節 | 評価 |
|---|---|
| §1 品質評価しきい値 | ✅ 完全遵守 |
| §2 理由表示フォーマット | ✅ 完全遵守（Must Fix 修正後） |
| §3 MF6 分割 | ✅ MF6-a 完了 / MF6-b A-5 送り |
| §4 lastModifiedBy | ✅ 完全遵守 |
| §5 MF4 理由表示 | ✅ 完全遵守 |
| §6 警告挙動 | ✅ 完全遵守（表示のみ・ブロックなし） |
| §7 影響範囲 | ✅ 完全遵守（entry_no / table_no 永続化なし） |
| §8 非スコープ | ✅ 違反なし |
| §9 実装順 | ✅ 完全遵守 |
| §10 リスク対策 | ✅ 完全遵守 |
| §11 Go 判定条件 | ✅ 完全充足 |
| §12 停止ルール | ✅ 完全遵守（Draft PR → Codex 評価 → 別プロンプトでマージ） |

---

## 5. A-5 送り事項

| 項目 | 区分 | 備考 |
|---|---|---|
| MF6-b 勝者番号ボタン | A-4 から繰越 | 卓番号入力 → 勝者番号入力のリンク式 UI として再設計 |
| Blossom 等の本格完全マッチング | A-5 新規 | 必要性は実戦データに応じて判断 |
| `source` 永続化（3 値以上） | A-5 新規 | `lastModifiedBy` からの拡張 |
| `reason` 永続化 | A-5 新規 | 文章型説明エンジンと連動 |
| `table_no` 永続化 | A-5 新規 | MF6-b と連動検討 |
| ドラフト編集 UI | A-5 新規 | 「分散運営プロトコル基盤」化の一環 |
| 本格監査ログ | A-5 新規 | 役員間状態共有の前段 |
| 複数端末同期 | A-5 新規 | Supabase 等のバックエンド検討含む |
| PC 報告画面 | A-5 新規 | スマホ / PC 役割分担 |
| 結果確認モニター | A-5 新規 | 大会体験向上 |
| 最新バージョン確認 UI ガード | A-5 新規 | B級R2 再発防止の補完（§10 リスク対策） |

---

## 6. 別タスク化事項

| 項目 | 優先度 | 備考 |
|---|---|---|
| E2E (Playwright) 失敗の原因究明と修正 | Should Fix | A-5 着手前に解消推奨。別 Issue 登録予定 |

---

## 7. 学習・知見

- **「Issue=議論履歴 / docs/specs=確定仕様 (SSoT)」の分離原則**を A-4 から確立。Issue は経緯と意図、docs/specs は実装契約として分離することで、合意点の所在が明確化された。
- **ChatGPT 制限時の Claude.ai 司令塔代行ルール（冗長化）**が機能。代行判断 → 別プロンプトでの明示指示というプロトコルにより、過剰な自動進行を抑止できた。
- **Codex Conditional Go → 修正 → A-/Go の改善ループ**が機能。`[要確認]` ラベル付与漏れという spec ズレを 1 ラウンドで解消。
- **B級R2 真因の再評価**：「乱数偶発」ではなく「**旧版 / 手動変更 / 当日版差分**」の可能性が高い。`lastModifiedBy` 導入により次回大会から「現場で何が手動変更されたか」が記録され、原因特定が可能になる。
- **fast-uri 脆弱性の依存源誤認**：当初 playwright 経由と推定されていたが、実際は html-validate → ajv 経由だった。`npm ls <pkg>` での依存チェーン確認は本番修正前に必須。
- **依頼文の冪等指示は素直に再実行する**：`gh pr update-branch` のような idempotent 操作は「既に完了済み」と先回り判断せず、依頼の手順通り実行することで運用一貫性が保たれる。

---

## 8. 次フェーズへの引き継ぎ

- A-5 は「**分散運営プロトコル基盤**」としての本格化フェーズ
- バックエンド導入（Supabase 等）の戦略判断が必要
- 役員間状態共有の実装可否が A-5 最大の論点
- B級R2 真因究明（lastModifiedBy 蓄積データ + 当日版確認 UI ガード）も A-5 の重要テーマ

---

## 9. 履歴

| 日時 | 内容 |
|---|---|
| 2026-05-10 | A-4 完了報告作成、Issue #32 close |
