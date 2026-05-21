# SHOGI-TOUR-APPHQ-003D-4E｜旧E2EをCI対象から外すdiff-safe方式検討

## 1. 目的

SHOGI-TOUR-APPHQ-003D-4E は、旧 E2E spec を **通常 PR で編集・削除せず**、GitHub の diff / PR コメント / CI config 差分に実データ由来に見える値を露出させない形で、**CI 対象から外す diff-safe 方式** を検討する設計文書である。

本文書では以下を整理する。

- なぜ旧 E2E を CI 対象から外す必要があるか
- なぜ旧 E2E spec を直接編集・削除しないのか
- CI 対象除外の候補方式
- diff に出してよい情報 / 出してはいけない情報
- PR コメント・レビューコメントでの禁止事項
- CI artifact / trace / screenshot / video の扱い
- 後続タスク
- Risk Level
- Approval Phrase / 承認境界

本文書は **docs-only** であり、以下は今回行わない。

- CI 設定変更
- Playwright config 変更
- GitHub Actions workflow 変更
- 旧 E2E spec の変更 / 削除 / rename / move
- synthetic 専用 E2E spec の変更
- 対象 JSON / fixture / shogi_v4.html / index.html の変更
- 過去 No Go PR の diff 本文表示
- 実データ由来に見える旧期待値・具体値の再掲

## 2. なぜ旧 E2E を CI 対象から外す必要があるか

- 旧 E2E spec (`test/e2e/shogi_phase2_import.spec.js`) は実データ JSON (`data/import/20260412_participants.json`) に依存している可能性がある。
- CI で旧 E2E が実行されると、Playwright の **trace / artifact / screenshot / video / failure output / console log** に operational な情報（実名・住所・最終クラス・最終対局日 等のカテゴリに属する値）が出る可能性がある。
- 003D-4D-1 / 003D-4F-1 により **synthetic 専用 E2E** (`test/e2e/shogi_phase2_import_synthetic.spec.js`) はすでに追加・fixture-driven 化済みである。
- ただし、synthetic 専用 E2E の追加だけでは **旧 E2E が CI で並走実行されるリスクは消えない**。
- そのため、旧 E2E spec を repository から消すことなく、**CI 実行対象から外す方式** を別途検討する必要がある。

> 注: 旧 E2E spec の具体値・旧期待値・実データ由来に見える値は本文書に **再掲しない**（003Z §5 Phase 2 / 003D-4D-FIX1 §9.1 / 003D-4F §2 注釈と整合）。

## 3. なぜ旧 E2E spec を直接編集・削除しないのか

- **PR #174 試行**：既存 E2E spec を通常 PR で置換・編集しようとしたところ、削除 diff に旧期待値リテラルが露出するリスクが確認され、No Go / Closed となった。
- 旧 E2E spec を通常 PR で **削除** しても、削除 diff に本文が GitHub Web UI / PR ファイル変更タブ / 個別 commit ビューに表示される可能性がある。
- 旧 E2E spec の **rename / move** も、git の rename 検出によっては内容差分が出る可能性があり、安全とは言えない。
- 旧 E2E spec 内に **`test.skip` を追加** する形でも、編集 diff の周辺コンテキストに本文が露出する可能性がある。
- そのため、旧 E2E spec の **本文を含む通常 diff を作らない**。
- 旧 E2E spec そのものの削除・置換・履歴対応は **003H / 003E / clean tree 検討側** で扱う。
- 今回 003D-4E では **CI 対象から外す方法だけを検討する**。

> 注: PR #169 / PR #174 の diff 本文・コメント本文は本文書に再掲しない。経緯メモは抽象表現に限定する。

## 4. diff に出してよい情報 / 出してはいけない情報

### 4.1 diff に出してよい情報

| 区分 | 例 |
|---|---|
| 抽象表現 | 旧 E2E spec / real-data dependent E2E / legacy import E2E / legacy phase 2 import spec |
| 安全な spec 名 | `shogi_phase2_import_synthetic.spec.js`（synthetic 専用 E2E） |
| 安全な fixture 名 | `participants_synthetic_minimal.json` |
| CI 対象から外す方針 | synthetic / safe project のみを CI で実行する旨 |
| synthetic 専用 E2E を CI 対象に残す方針 | synthetic 系のみで回帰を担保する旨 |
| 旧 E2E 本文を表示しない旨 | 「本文は再掲しない」「具体値は再掲しない」 |
| 実データ JSON を表示・参照しない旨 | "do not display / reference operational JSON" |

### 4.2 diff に出してはいけない情報

| 区分 | 例 |
|---|---|
| 旧 E2E spec 本文 | spec 内の expected literal / 配列 / オブジェクト |
| 旧期待値リテラル | 旧 spec 内で hard-coded されていた値 |
| 実データ由来に見える属性値 | 氏名 / 地域 / 読み（yomi）/ 最終クラス / 最終対局日 等 |
| 件数 | 入力件数 / 期待件数 |
| クラス分布 | 旧 spec で期待されていたクラス別件数 |
| 固定日付・固定日時 | 旧 spec で参照されていた日付・日時 |
| 対象 JSON 本文 | `data/import/20260412_participants.json` の中身 |
| sample rows / unique values | JSON のサンプル行・ユニーク値・統計値 |
| 過去 No Go PR の diff 本文 | PR #169 / PR #174 のファイル差分・レビュー差分 |

### 4.3 パス名の扱い

- 旧 E2E spec のパス名（`test/e2e/shogi_phase2_import.spec.js`）は **最小限の参照に留める**。
- パス名を出すこと自体は禁止しないが、本文・旧期待値・具体値は **絶対に出さない**。
- CI 設定差分（workflow YAML / Playwright config / shell command）に旧 spec 本文や旧期待値が出ない方式を選ぶ。

## 5. CI 対象除外の候補方式

| 案 | 内容 | 評価 | メリット | デメリット |
|---|---|---|---|---|
| **A** | Playwright config / project の `testIgnore` 等で旧 E2E spec を除外 | 候補 | 旧 spec 本文を編集しない | config 差分に旧 spec パスが出る可能性がある。パス名の扱いに注意が必要 |
| **B** | synthetic 専用 spec のみを CI 対象にする専用コマンド / project に変更 | 候補 | 旧 spec 本文を編集しない | CI config 差分でテスト対象指定が変わる。既存 E2E 全体の回帰範囲が狭くなる可能性 |
| **C** | safe discovery 用ディレクトリに synthetic spec を集約し、CI はそのディレクトリのみ実行 | 候補 | 旧 spec に触らず新系統へ移行しやすい | ディレクトリ設計・移動方針が必要。既存 spec を移動しないため中期整理が必要 |
| **D** | 旧 E2E spec を rename / move して CI 対象外にする | **不可** | （該当なし） | rename / move diff に旧 spec 本文が出る可能性があり危険 |
| **E** | 旧 E2E spec を削除する | **不可** | （該当なし） | 削除 diff に本文が出る可能性があり危険。spec 本文の撤去は 003H / 003E スコープ |
| **F** | 旧 E2E spec 内で `test.skip` する | **不可** | （該当なし） | 旧 spec 本文の編集 diff が出るため危険 |
| **G** | CI 上で grep / exclude pattern を使って旧 spec を除外 | 条件付き候補 | 旧 spec 本文を編集しない | exclude pattern に旧 spec パスが出る。shell 差分の安全性・保守性に注意 |

## 6. 推奨方式

### 6.1 短期推奨

- **案 B または案 C** を第一候補とする。
- synthetic 専用 E2E のみを CI で実行できる **safe path / safe command / safe project** を用意する。
- 旧 E2E spec 本文には **触らない**。
- 旧 E2E spec の削除・rename・skip は **行わない**。
- CI 差分に出る情報は、synthetic 専用 E2E や safe directory 中心にする。

### 6.2 案 A / 案 G について

- 旧 spec パスを **明示的に除外** する必要がある場合は候補とする。
- ただし、PR 本文・コメント・config 差分・shell command 差分で **旧 spec 本文・旧期待値・具体値を出さない** こと。
- パス名も **必要最小限** にする。

### 6.3 不可

- 旧 E2E spec の **通常編集**
- 旧 E2E spec の **削除**
- 旧 E2E spec の **rename / move**
- 旧 E2E spec 内の **skip 追加**

## 7. 003D-4E-1 の想定実装範囲

003D-4E-1 では、以下のいずれかを実装候補とする。

### 7.1 候補1：CI 側コマンド限定（案 B 寄り）

- CI（GitHub Actions workflow）の E2E 実行コマンドを **synthetic 専用 E2E ファイル指定** に限定する（例: `npx playwright test test/e2e/shogi_phase2_import_synthetic.spec.js`）。
- 旧 E2E spec には **触らない**。
- workflow YAML 差分に旧 spec 本文・旧期待値・具体値が出ない設計にする。

### 7.2 候補2：Playwright config safe project / safe testMatch（案 B + 案 A 寄り）

- Playwright config に **safe project** を追加（synthetic 専用 E2E のみを `testMatch` に含める）。
- CI は safe project のみを実行する。
- 旧 E2E spec には **触らない**。
- config 差分に出てよいのは synthetic 系の path / project 名・boilerplate のみ。

### 7.3 候補3：safe discovery 用ディレクトリ（案 C 寄り）

- safe discovery 用ディレクトリ（例: `test/e2e/safe/`）を作り、synthetic 専用 E2E を今後そこに置く。
- CI はその safe directory のみを実行する。
- ただし、**既存 synthetic spec の移動は別途 diff 安全性を確認してから** 行う（既存 spec の移動 diff にも注意）。

### 7.4 003D-4E-1 でやらないこと

- 旧 E2E spec 本文編集
- 旧 E2E spec 削除
- 旧 E2E spec rename / move
- 対象 JSON 削除
- 履歴改変
- force push

## 8. CI artifact / trace / screenshot / video の扱い

- 003D-4E-1 後に CI で実行される E2E は、**synthetic 専用 E2E または safe project に限定** する。
- CI artifact / trace / screenshot / video / console / failure output に出てよい値は **完全架空値のみ**（`Fixture User NNN` / `Dummy City NNN` / `fixture_date_NNN` / `synthetic_updated_at` 等の synthetic 命名規則に従う値）。
- 旧 E2E spec が **CI で実行されない** ことを 003D-4E-1 完了時に確認する。
- ただし、旧 E2E spec が repository に残っている限り、**repository 上の危険資産問題は残る**。
- 旧 E2E spec の撤去・履歴対応は **003H / 003E 側** で扱う。
- synthetic 専用 E2E の側でも、`result.error` 文字列等は page 境界の内側に閉じ込める方針（003D-4D-1-FIX1 / 003D-4F-1 と整合）を維持する。

## 9. 既存旧 E2E との関係

- 旧 E2E spec は **短期では repository に残る**。
- 003D-4E-1 は **CI 実行対象から外すこと** を目的とする。
- 旧 E2E spec の **存在自体を消すものではない**。
- 旧 E2E spec の削除・置換・履歴対応は **通常 PR では行わない**（003H / 003E / clean tree 検討側）。
- 旧 E2E spec が残る限り、**最終 Done ではない**（003Z §2-A/B 準拠：repository 上の危険資産問題は別軸）。

## 10. 後続タスク候補

- **SHOGI-TOUR-APPHQ-003D-4E-1**：CI 対象変更または safe discovery 方式実装
- **SHOGI-TOUR-APPHQ-003H**：実データ撤去実行 Runbook
- **SHOGI-TOUR-APPHQ-003E**：Git 履歴対応要否判断
- **SHOGI-TOUR-APPHQ-003G**：GitHub Pages 公開済み影響確認
- **SHOGI-TOUR-APPHQ-003D-4F-2**：必要な場合の validator 内部追加分離（案 A / C への移行）

## 11. 推奨実施順

1. **003D-4E-1**：CI 対象変更または safe discovery 方式実装
2. **003H**：実データ撤去実行 Runbook
3. **003E**：Git 履歴対応要否判断
4. **003G**：GitHub Pages 公開済み影響確認
5. 必要があれば **003D-4F-2**：validator 内部追加分離

ただし、現行公開影響が強く疑われる場合は **003G を 003H 前後で前倒し可能**。003G を前倒しする場合でも、本文取得・保存・表示は禁止し、HEAD / メタ情報確認に限定する。

## 12. Done 条件

### 12.1 003D-4E の Done（本文書の Done）

- 旧 E2E を CI 対象から外す **diff-safe 方式** が明文化されている
- 旧 E2E spec を **通常 PR で編集・削除しない** 方針が明確
- CI config 差分に **出してよい情報 / 出してはいけない情報** が明確
- 003D-4E-1 の **実装候補** が明確
- 旧 E2E が repository に残る限り **最終 Done ではない** ことが明確

### 12.2 003D-4E-1 の予定 Done

- CI 上の E2E 実行対象が **synthetic / safe project に限定** されている
- 旧 E2E spec は **CI で実行されない**
- 旧 E2E spec 本文は **変更していない**
- 対象 JSON は **変更・削除していない**
- CI artifact / trace / screenshot / video に出てよい値は **完全架空値に限定** されている
- Unit / Security / E2E が **pass** する

> 注: 003D-4E-1 の Done では、旧 E2E spec の存在自体・実データ JSON の存在自体・Git 履歴上の参照は **解決されない**（003H / 003E / 003G スコープ）。

## 13. Risk Level

| 作業 | Risk Level |
|---|---|
| 本設計文書作成（本 PR） | docs-only だが旧 E2E の CI 対象除外に関わるため **Level 3 相当** |
| CI 対象変更（003D-4E-1 実装） | Level 3〜4 |
| Playwright config 変更（003D-4E-1 候補2） | Level 3〜4 |
| GitHub Actions workflow 変更（003D-4E-1 候補1） | Level 3〜4 |
| 旧 E2E spec 削除・rename・move | **Level 4 相当 / 通常 PR では不可** |
| 実データ撤去実行（003H 実装） | Level 3〜4 |
| Git 履歴改変 / force push（003E 実装） | Level 4 |
| clean tree / orphan branch / GitHub Pages 設定変更 | Level 4 候補 |

## 14. Approval Phrase / 承認境界

- 本設計文書作成は docs-only だが **Level 3 相当**。
- **CI 対象変更**（003D-4E-1）は別 PR・別承認。
- **Playwright config 変更** は別 PR・別承認。
- **GitHub Actions workflow 変更** は別 PR・別承認。
- 旧 E2E spec の **削除・置換・rename・move・通常編集** は標準 Approval Phrase だけでは不十分。diff 露出評価とその承認を必須とする。
- **実データ撤去** は通常の Ready 化 / merge 承認だけでは不十分。
- **Git 履歴改変・force push・orphan branch・GitHub Pages 設定変更** は標準 Approval Phrase では解除不可。

## 15. 今回やらないこと

- CI 設定変更
- Playwright config 変更
- GitHub Actions workflow 変更
- 旧 E2E spec 変更
- 旧 E2E spec 削除
- 旧 E2E spec rename / move
- E2E skip 追加
- synthetic 専用 E2E 変更
- 対象 JSON 削除
- 対象 JSON 置換
- 対象 JSON 本文表示
- fixture 変更
- PR #169 / #174 diff 表示
- shogi_v4.html 変更
- Git 履歴改変
- force push
- GitHub Pages 設定変更
- 実データ撤去実行
