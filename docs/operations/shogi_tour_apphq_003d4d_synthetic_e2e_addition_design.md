# SHOGI-TOUR-APPHQ-003D-4D｜synthetic専用E2E新設設計

## 1. 目的

SHOGI-TOUR-APPHQ-003D-4D は、既存 E2E spec (`test/e2e/shogi_phase2_import.spec.js`) を **通常 PR で編集せず**、完全架空 fixture のみを使う **synthetic 専用 E2E** を新規追加するための設計文書である。

本文書では以下を整理する。

- なぜ既存 E2E spec を触らないのか
- synthetic 専用 E2E の目的
- 新規 E2E ファイル候補
- 利用 fixture
- テスト対象範囲
- テストで確認すること / しないこと
- 既存 E2E との関係
- CI との関係
- 後続タスク
- Risk Level
- Approval Phrase / 承認境界

本文書は docs-only であり、以下は今回行わない。

- synthetic 専用 E2E 本体の作成
- 既存 E2E spec / fixture / 対象 JSON / `shogi_v4.html` / CI / GitHub Pages 設定の変更
- 過去 No Go PR の diff 本文表示
- 実データ由来に見える旧期待値・具体値の再掲

## 2. なぜ既存 E2E spec を触らないのか

- 既存 E2E spec (`test/e2e/shogi_phase2_import.spec.js`) には、実データ由来に見える期待値リテラル（氏名・地域・読み・固定日付など）が含まれている可能性がある。
- 通常 PR で既存 spec を **置換・削除すると、削除 diff に旧期待値リテラルが出る** 可能性がある。
- PR #174 でこのリスクが実地で確認され、**No Go / Closed** となった（PR #174 の diff 本文は本書で表示しない）。
- そのため、短期では **既存 E2E spec を通常 PR で編集しない** 方針を継続する（003Z Runbook 準拠）。
- 旧 E2E spec の扱い（CI 対象から外す / 削除 / 履歴対応）は **003D-4E / 003H / 003E / clean tree 検討側**で扱う。

> 注: 本文書では、旧 E2E spec から発見された具体リテラル・固定日付・件数・分布などの **具体値は再掲しない**（003Z §3.1 / §5 Phase 2 露出範囲事前定義に従う）。

## 3. synthetic 専用 E2E の目的

- import 機能の **回帰確認を、実データに依存せず継続** する
- **完全架空 fixture だけ** を使う
- CI artifact / trace / screenshot / video / debug output に **実データが混入しない** 経路を確保する
- 既存の危険 E2E spec を **触らずに**、安全な新系統を追加する
- 将来的に旧 E2E から CI を移行するための **受け皿** にする

## 4. 新規 E2E ファイル候補

### 候補

| 案 | パス |
|---|---|
| **A** | `test/e2e/shogi_phase2_import_synthetic.spec.js` |
| **B** | `test/e2e/synthetic_import.spec.js` |
| **C** | `test/e2e/import_synthetic_fixture.spec.js` |

### 推奨

**`test/e2e/shogi_phase2_import_synthetic.spec.js`**

### 理由

- 既存 spec 名（`shogi_phase2_import.spec.js`）との関係が分かりやすい
- `_synthetic` という接尾辞で **synthetic 専用** であることが明確
- 既存 spec を直接編集せず、新規ファイル追加だけで完結できる
- 将来の CI 移行・置換時に新旧の対応を比較しやすい

## 5. 利用 fixture

### 利用 fixture

`test/fixtures/import/participants_synthetic_minimal.json`

### 方針

- **完全架空 fixture のみ** を参照する
- `data/import/20260412_participants.json` は **参照しない**（パス文字列としても spec 内に書かない）
- 実データ JSON を **開かない / 読まない / 値や構造をコピーしない**
- fixture 値は `Fixture User NNN` / `Dummy City NNN` / `fixture_date_NNN` 系など、**完全架空・機械的・連番命名** のみを使う（003F / 003F-FIX1 / 003Z §3.1 準拠）
- validator 都合で実データの **件数・クラス分布・固定日付に寄せない**
- 必要なら **validator / expected values 分離タスク（003D-4F）** へ戻す（fixture 側で帳尻合わせをしない）

## 6. テスト対象範囲

synthetic 専用 E2E では、まず以下を確認対象にする。

- fixture JSON を読み込めること
- import 操作が開始できること
- import 後に画面上または状態上で synthetic fixture の値が反映されること
- `Fixture User NNN` 系の値が確認できること
- `Dummy City NNN` 系の値が確認できること
- **実データ由来の値を期待値にしないこと**
- **実データ JSON に依存しないこと**

> ただし、初回は **最小範囲に限定** する。既存 E2E の全機能をいきなり再現しない。網羅範囲の拡張は別タスクで段階的に進める。

## 7. テストで確認しないこと

synthetic 専用 E2E では、以下を確認対象に **しない**（=fixture を実データに寄せる動機をなくす）。

- 実データと同じ件数であること
- 実データと同じクラス分布であること
- 実データと同じ日付であること
- 実データ由来の氏名・住所・読み・属性
- 旧 E2E spec の全期待値再現
- 旧 E2E spec の構造完全再現
- `data/import/20260412_participants.json` との一致

## 8. 既存 E2E との関係

- 既存 E2E spec は **短期では触らない**（003Z §3 準拠）。
- synthetic 専用 E2E は **既存 E2E の置換ではなく、安全な新系統として追加** する。
- 旧 E2E を CI 対象から外すかどうかは **003D-4E** で diff-safe に設計する。
- 旧 E2E spec の削除・置換・履歴対応は **003H / 003E / clean tree 検討側** で扱う。
- synthetic 専用 E2E が pass しても、旧 E2E spec の安全問題が **自動解決するわけではない**（並存期間中も旧 spec は危険資産として扱う）。

## 9. CI との関係

- 初回の synthetic 専用 E2E 追加 PR では、**既存 CI discovery により自動実行される** 可能性が高い（`test/e2e/` 配下を拾う設定であれば追加 spec も自動的に検知される想定）。
- ただし、**旧 E2E を外す CI 変更は今回（003D-4D / 4D-1）では行わない**。
- CI 対象変更は **003D-4E / 003D-4E-1** で別途設計・承認する（情報露出範囲を 003Z §5 Phase 2 note に従って事前定義する）。
- synthetic 専用 E2E が CI で pass することは **短期 Done 条件の一部**。
- CI artifact / trace / screenshot / video に **出てよい値は完全架空値に限る**。実データ・実データ由来値・実データ寄りの件数や日付は spec / fixture いずれにも出さない。

## 10. 後続タスク候補

- **SHOGI-TOUR-APPHQ-003D-4D-1**：synthetic 専用 E2E 新規追加（実装）
- **SHOGI-TOUR-APPHQ-003D-4F**：validator / expected values 分離設計
- **SHOGI-TOUR-APPHQ-003D-4F-1**：synthetic 用 validator 実装
- **SHOGI-TOUR-APPHQ-003D-4E**：旧 E2E を CI 対象から外す diff-safe 方式検討
- **SHOGI-TOUR-APPHQ-003D-4E-1**：CI 対象変更または safe discovery 方式実装
- **SHOGI-TOUR-APPHQ-003H**：実データ撤去実行 Runbook
- **SHOGI-TOUR-APPHQ-003E**：Git 履歴対応要否判断
- **SHOGI-TOUR-APPHQ-003G**：GitHub Pages 公開済み影響確認

## 11. 推奨実施順

1. **003D-4D-1**：synthetic 専用 E2E 新規追加（実装）
2. **003D-4F**：validator / expected values 分離設計
3. **003D-4F-1**：synthetic 用 validator 実装
4. **003D-4E**：旧 E2E を CI 対象から外す diff-safe 方式検討
5. **003D-4E-1**：CI 対象変更または safe discovery 方式実装
6. **003H**：実データ撤去実行 Runbook
7. **003E**：Git 履歴対応要否判断
8. **003G**：GitHub Pages 公開済み影響確認

ただし、現行公開影響が強く疑われる場合は **003G を 003H 前後で前倒し可能**。前倒し時も本文取得・保存・表示は禁止し、HEAD / メタ情報確認に限定する。

## 12. Done 条件

### 003D-4D の Done（本文書の Done）

- synthetic 専用 E2E 新設方針が明文化されている
- 既存 E2E spec を通常 PR で編集しない方針が明確
- synthetic 専用 E2E のファイル名・利用 fixture・確認範囲が定義されている
- 実データ件数・分布・固定日付へ寄せない方針が明確
- 後続タスク 003D-4D-1 の入口条件が明確

### 003D-4D-1 の予定 Done

- 新規 synthetic 専用 E2E spec が追加されている
- 既存 E2E spec は **変更していない**
- `data/import/20260412_participants.json` は **参照していない**
- **完全架空 fixture のみ** を使用している
- E2E を **skip / 削除していない**
- **CI で synthetic 専用 E2E が pass** している

## 13. Risk Level

| 作業 | Risk Level |
|---|---|
| 本設計文書作成（本PR） | docs-only だが実データ由来 E2E 依存解除に関わるため **Level 3 相当** |
| synthetic 専用 E2E 新規追加（003D-4D-1 実装） | Level 3 |
| validator / expected values 分離（003D-4F 実装） | Level 3 |
| CI 対象変更（003D-4E 実装） | Level 3〜4 |
| 実データ撤去実行（003H 実装） | Level 3〜4 |
| Git 履歴改変 / force push（003E 実装） | Level 4 |
| clean tree / orphan branch / GitHub Pages 設定変更 | Level 4 候補 |

## 14. Approval Phrase / 承認境界

- 本設計文書作成は docs-only だが **Level 3 相当**。
- synthetic 専用 E2E 新規追加は **別 PR・別承認**。
- validator / expected values 分離は **別 PR・別承認**。
- CI 対象変更は **別 PR・別承認**。
- **旧 E2E spec の削除・置換・通常編集は、標準 Approval Phrase だけでは不十分**。diff 露出評価とその承認を必須とする。
- 実データ撤去は通常の Ready化 / merge 承認だけでは不十分。
- Git 履歴改変・force push・orphan branch・GitHub Pages 設定変更は **標準 Approval Phrase では解除不可**。

## 15. 今回やらないこと

- synthetic 専用 E2E 作成（実装）
- 既存 E2E spec (`test/e2e/shogi_phase2_import.spec.js`) の変更
- 対象 JSON (`data/import/20260412_participants.json`) の削除 / 置換 / 本文表示
- fixture (`test/fixtures/import/participants_synthetic_minimal.json`) の変更
- 過去 No Go PR（資産 A / B 関連）の diff 表示
- `shogi_v4.html` 変更
- CI 設定変更
- E2E skip / 削除
- Git 履歴改変
- force push
- GitHub Pages 設定変更
- 実データ撤去実行
