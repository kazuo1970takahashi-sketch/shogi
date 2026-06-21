# Phase B-1: normalizeReport* 集約（normalizeReportField + 設定テーブル）/ Issue #285

- 日付: 2026-06-21
- Issue: #285（shogi_v4.html リファクタ Phase B-1）
- base: orphan clean base `0ba7c9b`（Phase A #284 マージ後 HEAD）
- 分類: **動作を変えないリファクタ**（挙動完全同値・1 バイトも変えない）／L2-L3（report 文字列フィールドの純ヘルパー集約・データ破壊性なし）
- 状態: **Draft PR で停止**（Ready化/merge/branch削除/production は人間承認まで未実施）

## やったこと

`shogi_v4.html` の report 正規化ヘルパー 10 関数（同型処理の重複）を、
**1 つの汎用関数 `normalizeReportField(value, key)` ＋ 設定テーブル `REPORT_FIELD_SPECS`** へ集約。

- 対象 10 関数: `normalizeReportTitle` / `Organizer` / `Fax` / `OfficeName` / `AccountingNote` / `Place` / `Sei` / `Fuku` / `Note` / `Prize`
- 各関数は **本テーブルを引く 1 行ラッパー**へ退避（例: `function normalizeReportTitle(value){ return normalizeReportField(value,'title'); }`）。
- **呼び出し側（`normalizeState` / `downloadReport` / `populateReportFields` 等）と既存テストは完全無改変**。
  - 呼出側の `typeof normalizeReportTitle==='function'` ガード（8557/8564/8744 等）を壊さないため、公開関数名はラッパーとして維持する設計を選択。

### 設定テーブルの表現

| key | def | 特殊処理 |
|-----|-----|----------|
| title | `沼津支部月例将棋大会` | `stripSuffix`: trim 後に末尾「報告書」を 1 回除去＋trailing 空白再 trim |
| organizer | `日本将棋連盟沼津支部` | — |
| fax | `943-9443` | — |
| officeName | `沼津支部事務局` | — |
| accountingNote | `※役員会で会計長へ収支報告書として提出ください。` | — |
| place | `労政会館` | — |
| sei / fuku / note | `''` | — |
| prize | `7000` | `numeric`: 0 以上の有限数のみ採用（0 は有効値）。NaN/Infinity/負数/非数値は def |

string 共通仕様: 文字列なら trim、結果が非空ならそれを返し、空 / 非文字列は def。

## 拘束ルール遵守

- 挙動完全同値（golden master byte 一致で機械検証）。ES5 / 古典的クロージャ / グローバル state 維持。
- build-bind-coordinator 維持・CSS 不変・match 正準形 / 保存スキーマ / `normalizeState` 往復恒等性に未接触。
- 編集は `shogi_v4.html`（+65/-81＝純 -16 行）＋ `test/`（新規ユニットテスト＋run_tests.sh 配線）のみ。
- `index.html` / `.github` / `package*` / `data` 不変・`?v=N` 据置（production 反映なし）。

## 検証（安全網フル活用）

1. **ゴールデンマスター byte 一致**: `test_golden_master_001.js` 比較 **PASS 22/0（スナップショット非更新）**。report 出力を含むケースも byte 一致。
2. **全スイート**: `bash test/run_tests.sh shogi_v4.html` = **PASS=87 / FAIL=0 / WARN=0**（baseline 86 + 新規 1 ブロック）。
3. **関数本体ハッシュ比較**（`run_tests.sh <target> <baseline 0ba7c9b>`）: 差分は **ちょうど 11 件 = 10 ラッパー本体 + `normalizeReportField` 新規のみ**。他関数は不変＝変更が当該集約に限定。
4. **集約点の薄いユニットテスト**: `test_normalize_report_field_001.js` = **244 assert PASS**（既定値 / trim / title 報告書除去 / prize の 0・Infinity・負数・数値文字列 / 全ラッパーの委譲恒等性）。
5. **html-validate** (v10.17.0): exit 0・指摘なし。

## レビュー方針

Issue 記載どおり、本スライスは report 文字列フィールドの純ヘルパー集約＝データ破壊性なし。
Codex 温存方針に沿い独立セッションの Claude Code レビューエージェント想定（一次ゲート＝golden master byte 一致）。
L3-critical の線引き（Codex 必須か CC レビューか）は人間（髙橋さん）の最終確認を待つ。指定なき場合は CC レビューで進行。
