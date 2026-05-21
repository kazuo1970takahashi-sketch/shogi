# SHOGI-TOUR-APPHQ-003D-4F｜validator / expected values 分離設計

## 1. 目的

SHOGI-TOUR-APPHQ-003D-4F は、Phase 2 import 周辺の **validator / expected values が実データ由来に見える固定条件に寄っている問題** を解消するため、synthetic fixture を実データの件数・分布・固定日付へ寄せなくても import 回帰を検証できるようにするための **分離設計** を docs-only でまとめる文書である。

本文書では以下を整理する。

- なぜ validator / expected values 分離が必要か
- 分離対象
- synthetic 用 validator の考え方
- expected values の導出方針
- `shogi_v4.html` 変更時の注意
- 実装候補
- 推奨方式
- 既存旧 E2E / 実データ JSON との関係
- 後続タスク
- Risk Level
- Approval Phrase / 承認境界

本文書は docs-only であり、以下は今回行わない。

- validator / expected values 分離の実装
- `shogi_v4.html` / 既存 E2E spec / synthetic 専用 E2E / fixture / 対象 JSON / CI / GitHub Pages 設定の変更
- 過去 No Go PR の diff 本文表示
- 実データ由来に見える旧期待値・具体値の再掲

## 2. なぜ分離が必要か

- PR #174 試行で、**synthetic fixture を既存 validator に合わせようとすると、件数・クラス分布・固定日付の点で実データ再現に見えるリスク** が判明した（fixture 側を実データ形状へ寄せる動機が生じる）。
- fixture を validator に合わせるのではなく、**validator / expected values 側を synthetic 用に分離** する必要がある（003Z §3.1 / 003D-4D §5 準拠）。
- 完全架空 fixture は、件数・クラス分布・固定日付を **実データから独立** に保つ。
- import 機能の回帰確認は、**実データ固定条件ではなく、fixture 自身から導出される expected values** で検証する。
- これにより、synthetic 専用 E2E（003D-4D-1 で main 反映済）が「安全な新系統」として実質的な意味を持つ。

> 注: PR #174 の具体値・旧期待値・固定条件の具体値は本文書に再掲しない（003Z §5 Phase 2 / 003D-4D-FIX1 §9.1 準拠）。`shogi_v4.html` 内の具体的な定数名・値も引用しない。

## 3. 分離対象

分離対象は **抽象カテゴリ** として扱う。具体値は本文書に再掲しない。実装時も旧 E2E spec から値・期待値・構造をコピーしない。

| カテゴリ | 概要 |
|---|---|
| import 用 validator | 入力配列を検証するロジック全体 |
| expected record count | 入力件数の期待値 |
| expected class distribution | クラス分布の期待値 |
| expected date / history value | 日付・参加履歴系の期待値 |
| expected name / city / yomi values | 人名・地域・読み系の期待値 |
| error message に含まれる operational な説明 | 件数 / 分布 / 日付などを文中に含むメッセージ |
| E2E 側の固定期待値 | E2E spec 内にハードコードされた assertion 値 |
| `shogi_v4.html` 内の固定期待値または helper | アプリ側に存在する固定定数・固定 helper |

## 4. synthetic 用 validator の考え方

synthetic 用 validator は、以下のような検証を **優先** する。

- top-level が配列であること
- 各要素が想定スキーマに沿うこと
- `name` / `city` / `last_class` 等の必要項目が存在すること
- 値が完全架空命名規則（例: `Fixture User NNN` / `Dummy City NNN`）に沿うこと
- fixture の length と、import 後の件数が **相対的に一致** すること
- class 集計は **fixture から導出** すること（外部固定値と比較しない）
- date / history 系は **実日付に見える固定値を要求しない** こと
- **error message 文字列を E2E 側へ返さない** こと（page 境界の内側に閉じ込める / 003D-4D-1 / 003D-4D-1-FIX1 と整合）

synthetic 用 validator が **確認しないこと**：

- 実データと同じ件数
- 実データと同じクラス分布
- 実データと同じ日付
- 旧 E2E spec の期待値再現
- 実データ JSON との一致

## 5. expected values の導出方針

- **expected values は fixture から導出** する。
- 固定値の **直書きは最小化** する。
- 件数は `fixture.length` への **相対チェック** にする。
- クラス分布は fixture の `last_class` から **その場で算出** する（外部固定値と比較しない）。
- 名前・地域系は `Fixture User NNN` / `Dummy City NNN` 等、**完全架空命名のみ** に限定する。
- 日付・履歴系は `fixture_date_NNN` 等、**実日付に見えない synthetic marker** を優先する。
- どうしてもアプリ側が日付形式を要求する場合は、値そのものを **CI artifact / trace / failure output に出さない設計** にする（page 境界の内側で扱う / boolean / 相対値のみ test 側へ返す）。

## 6. `shogi_v4.html` 変更時の注意

- validator / expected values 分離で `shogi_v4.html` を変更する場合は、**実装 PR として Level 3 相当** で扱う。
- 本設計 PR では `shogi_v4.html` を **変更しない**。
- 既存旧 E2E spec や実データ JSON に **依存しない helper** を追加する。
- 実データ由来値を **コード内に新規追加しない**。
- 固定日付・固定件数・固定分布を **新規追加しない**。
- エラーメッセージに **operational な値（件数・分布・固定日付など）を含めない**。
- public API / helper を使う場合、E2E artifact に **実値が流れないよう** に設計する（戻り値を boolean / 相対値に限定するなど）。
- 既存機能への **影響範囲を最小化** する（既存 import フローの挙動を変えない）。

## 7. 実装候補

| 案 | 内容 | 評価 | メリット | デメリット |
|---|---|---|---|---|
| **A** | synthetic 専用 validator helper を `shogi_v4.html` に追加 | 候補 | synthetic 専用 E2E から安全に呼べる | アプリ本体変更となるため Level 3。影響確認が必要 |
| **B** | E2E 側で fixture-driven expected values を計算する | **短期候補** | アプリ本体変更を回避できる。導入が早い | E2E 側ロジックが増える。既存 import 内部挙動の検証は限定的 |
| **C** | import 処理を pure helper 化し、validator と import 適用を分離する | 中期候補 | テスト容易性が高い。長期的に最も健全 | 設計・実装範囲が大きい |
| **D** | 既存 validator を汎用化する | 候補だが注意 | 既存処理に近い | 旧実データ向け固定条件を誤って残すリスク |
| **E** | synthetic fixture を既存 validator に合わせる | **不可** | （該当なし） | fixture が実データの件数・分布・固定日付へ寄り、003Z / 003D-4D 方針に反する |

## 8. 推奨方式

### 短期推奨

- まずは **案 B** を採用し、**E2E 側で fixture-driven expected values を計算** する。
- synthetic 専用 E2E では、`fixture.length` / fixture 由来の class 集計 / 完全架空命名規則 を確認する。
- 既存旧 E2E spec や実データ JSON には **触らない**。
- `result.error` 文字列を E2E 側に出さない（003D-4D-1-FIX1 の Must Fix 2 と同方針）。

### 中期推奨

- **案 A または案 C** を検討し、`shogi_v4.html` 側に **安全な synthetic-friendly helper** を用意する。
- helper は実データ固定条件を含まない。
- helper は artifact に実値を出さない。
- import validation と expected values を **分離** する（validator が pass しても expected values は呼び出し側が決められる構造）。

### 不可

- synthetic fixture を既存 validator に合わせて **実データ由来に見える固定条件へ寄せること**（案 E）。

## 9. 既存旧 E2E との関係

- 既存旧 E2E spec は **今回も触らない**。
- 旧 E2E spec の停止・CI 対象除外は **003D-4E** で diff-safe に設計する。
- 旧 E2E spec の削除・置換・履歴対応は **003H / 003E / clean tree 検討側** で扱う。
- validator 分離が完了しても、旧 E2E spec の **安全問題が自動解決するわけではない**（並存期間中も旧 spec は危険資産として扱う / 003Z §2-A/B 準拠）。

## 10. 後続タスク候補

- **SHOGI-TOUR-APPHQ-003D-4F-1**：synthetic 用 validator / expected values 分離実装
- **SHOGI-TOUR-APPHQ-003D-4E**：旧 E2E を CI 対象から外す diff-safe 方式検討
- **SHOGI-TOUR-APPHQ-003D-4E-1**：CI 対象変更または safe discovery 方式実装
- **SHOGI-TOUR-APPHQ-003H**：実データ撤去実行 Runbook
- **SHOGI-TOUR-APPHQ-003E**：Git 履歴対応要否判断
- **SHOGI-TOUR-APPHQ-003G**：GitHub Pages 公開済み影響確認

## 11. 推奨実施順

1. **003D-4F-1**：synthetic 用 validator / expected values 分離実装
2. **003D-4E**：旧 E2E を CI 対象から外す diff-safe 方式検討
3. **003D-4E-1**：CI 対象変更または safe discovery 方式実装
4. **003H**：実データ撤去実行 Runbook
5. **003E**：Git 履歴対応要否判断
6. **003G**：GitHub Pages 公開済み影響確認

ただし、現行公開影響が強く疑われる場合は **003G を 003H 前後で前倒し可能**。前倒し時も本文取得・保存・表示は禁止し、HEAD / メタ情報確認に限定する。

## 12. Done 条件

### 003D-4F の Done（本文書の Done）

- validator / expected values 分離方針が明文化されている
- synthetic fixture を実データの件数・分布・固定日付へ寄せない方針が明確
- expected values を fixture-driven にする方針が明確
- `shogi_v4.html` 変更時の注意が明確
- 後続タスク 003D-4F-1 の入口条件が明確

### 003D-4F-1 の予定 Done

- synthetic 専用 E2E が **fixture-driven expected values** で検証できる
- 実データ JSON を **参照しない**
- 既存旧 E2E spec を **変更しない**
- fixture を実データ固定条件へ **寄せない**
- `result.error` 文字列を E2E 側へ **出さない**
- Unit / Security / E2E がすべて pass する

## 13. Risk Level

| 作業 | Risk Level |
|---|---|
| 本設計文書作成（本 PR） | docs-only だが実データ由来 E2E 依存解除に関わるため **Level 3 相当** |
| synthetic 用 validator / expected values 分離実装（003D-4F-1） | Level 3 |
| `shogi_v4.html` 変更（案 A / C 採用時） | Level 3 |
| CI 対象変更（003D-4E 実装） | Level 3〜4 |
| 実データ撤去実行（003H 実装） | Level 3〜4 |
| Git 履歴改変 / force push（003E 実装） | Level 4 |
| clean tree / orphan branch / GitHub Pages 設定変更 | Level 4 候補 |

## 14. Approval Phrase / 承認境界

- 本設計文書作成は docs-only だが **Level 3 相当**。
- synthetic 用 validator / expected values 分離実装は **別 PR・別承認**。
- `shogi_v4.html` 変更は **別 PR・別承認**（アプリ本体変更）。
- CI 対象変更は **別 PR・別承認**。
- **旧 E2E spec の削除・置換・通常編集は、標準 Approval Phrase だけでは不十分**。diff 露出評価とその承認を必須とする。
- 実データ撤去は通常の Ready化 / merge 承認だけでは不十分。
- Git 履歴改変・force push・orphan branch・GitHub Pages 設定変更は **標準 Approval Phrase では解除不可**。

## 15. 今回やらないこと

- validator 実装
- expected values 分離実装
- `shogi_v4.html` 変更
- synthetic 専用 E2E (`test/e2e/shogi_phase2_import_synthetic.spec.js`) 変更
- 既存 E2E spec (`test/e2e/shogi_phase2_import.spec.js`) 変更
- 対象 JSON (`data/import/20260412_participants.json`) の削除 / 置換 / 本文表示
- fixture (`test/fixtures/import/participants_synthetic_minimal.json`) 変更
- 過去 No Go PR の diff 表示
- CI 設定変更
- E2E skip / 削除
- Git 履歴改変
- force push
- GitHub Pages 設定変更
- 実データ撤去実行
