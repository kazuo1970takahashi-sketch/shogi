# SHOGI-TOUR-APPHQ-008｜本番環境・テスト環境分離方針

Task ID：SHOGI-TOUR-APPHQ-008  
Task Name：本番環境・テスト環境分離方針 設計  
Project ID：SHOGI-TOUR  
Parent Project ID：APP-HQ  
Repo：kazuo1970takahashi-sketch/shogi  
種別：docs-only / 設計方針 新規作成  

---

## 0. この文書の位置づけ

この文書は、SHOGI-TOUR の本番環境を維持しながら、安全なテスト環境を構築するための設計方針を定めるものである。

実装・設定変更・GitHub Pages 変更・データ削除・履歴改変は本文書では行わない。実装は後続タスク（§10 参照）で別 PR・別承認として扱う。

APP-HQ の方針（APP-OPS-001〜005 / 011 / 012）および SHOGI-TOUR 既存 ops doc（PR workflow v1.0 / 司令塔冗長化 v1.0 / TOUR-OPS v0.2 Draft）と整合させる。

---

## 1. 目的

SHOGI-TOUR-APPHQ-008 は、SHOGI-TOUR の本番環境を維持しながら、安全なテスト環境を構築するための設計方針を定める文書である。

この文書は、以下を目的とする。

- 本番環境とテスト環境を分離する
- 本番データとテストデータを分離する
- localStorage key を分離する
- AI に渡してよいデータ範囲を明確にする
- 実データをテスト環境へ持ち込まない
- main merge が Production publish 相当であることを明確にする
- 今後の安全な開発・テスト・レビュー・本番反映の流れを設計する

---

## 2. 現状整理

- 現在の本番公開は GitHub Pages と考えられる。
- main merge により公開アプリが更新される可能性がある。
- そのため main merge は単なるコード統合ではなく、Production publish 相当として扱う。
- 現在のアプリは localStorage 中心。
- localStorage key として `shogi_v4` / 旧 `shogi_v3` が使われている（SHOGI-TOUR-APPHQ-001 read-only 棚卸しで確認）。
- 参加者名、参加者マスタ、支部マスタ、大会データ、組み合わせ実績データは個人情報または個人関連情報として扱う。
- `data/import/20260412_participants.json` は実データ混入候補として SHOGI-TOUR-APPHQ-003 Runbook で別途扱う。本文書では中身を確認・参照しない。
- 現時点では本番環境とテスト環境の境界が弱い。

---

## 3. 環境定義

### 3.1 Production

#### 用途
- 実大会運用
- 実参加者データ、支部マスタ、大会データを扱う可能性がある
- GitHub Pages 公開 URL
- main 反映が公開アプリに影響する

#### 扱い
- Risk Level 4 候補
- AI による直接操作禁止
- release / deploy / publish / Production 操作は標準 Approval Phrase で解除不可
- 人間承認、Runbook、rollback 方針、影響範囲確認が必要
- 実データ・個人情報を扱うため、AI へのデータ投入禁止

### 3.2 Test

#### 用途
- 開発確認
- E2E
- VRT
- 操作練習
- AI レビュー用の再現確認

#### 扱い
- 完全架空データのみ
- 本番データを持ち込まない
- 本番 localStorage を流用しない
- AI に渡せるのは原則この環境の情報のみ
- GitHub Pages の別 URL、別 repo、別 branch、またはローカル起動で実現する
- 実データ汚染が発覚した場合は、即座に Test 環境としての扱いを停止し、SHOGI-TOUR-APPHQ-003 Runbook の判定手順へ移す

### 3.3 Local Development

#### 用途
- 開発者のローカル確認
- Playwright / run_tests.sh
- 一時的な UI 確認

#### 扱い
- 原則として架空データのみ
- 実データを使う場合は人間ローカル限定（AI に送らない）
- localStorage の本番 key を汚染しない
- 同一ブラウザで本番 URL を併用する場合、Origin / key prefix で分離する

---

## 4. 推奨する分離方針

### 4.1 推奨案

本番とテストで URL と localStorage key を分離する。

#### Production 例

- URL：`https://kazuo1970takahashi-sketch.github.io/shogi/`
- localStorage key：`shogi_v4`
- 用途：実大会運用

#### Test 例

- URL：`https://kazuo1970takahashi-sketch.github.io/shogi-test/`
- localStorage key：`shogi_v4_test`
- 用途：開発・E2E・VRT・操作練習・AI レビュー

### 4.2 代替案

- 同一 repo 内の `test-pages` branch を GitHub Pages の preview として公開
- 別 repo `shogi-test` を新設
- ローカル起動専用（GitHub Pages を Test に使わない）
- GitHub Pages preview 用 branch を都度 publish

### 4.3 案の比較

| 観点 | (1) 別 path/test repo＋URL分離 | (2) 同一 repo test-pages branch | (3) 別 repo `shogi-test` | (4) ローカル起動専用 | (5) preview 用 branch（都度） |
|---|---|---|---|---|---|
| 本番影響の小ささ | 高（URL・origin 分離） | 中（同一 repo、誤 merge リスク） | 高（repo 分離） | 最高（公開なし） | 中（preview 反映に注意） |
| 実装コスト | 中（path or 新 repo 作成 + Pages 設定） | 低〜中（branch 設定のみ） | 中〜高（repo 同期方針が要る） | 低（webserver 起動のみ） | 中（運用フロー要定義） |
| 運用しやすさ | 高 | 中（branch 切替誤りリスク） | 中（同期負担） | 中（共有レビュー不可） | 低（毎回手動） |
| GitHub Pages との相性 | 高 | 高 | 高 | N/A | 中 |
| localStorage 分離しやすさ | 高（origin 分離で完全独立も可） | 中（同 origin の場合は key prefix で分離） | 高（origin 分離） | 高（key prefix で分離） | 中 |
| AI に渡しやすいか | 高（Test 由来の情報のみ共有可） | 中（同一 repo のため誤共有リスク） | 高 | 中（共有 URL なし） | 中 |
| 将来の DB 化・クラウド化への拡張性 | 高（環境別 endpoint） | 中 | 高 | 中 | 低 |

各案のメリット・デメリットは SHOGI-TOUR-APPHQ-008A（採用案決定）で評価する。

---

## 5. localStorage key 分離方針

### 5.1 現状

- `shogi_v4`
- 旧 `shogi_v3`（レガシー読み込み）

### 5.2 課題

- 同じ URL / 同じ key でテストすると、本番データを上書き・破損する可能性がある。
- 同じ key を使うと、E2E や操作練習で本番データに影響する可能性がある。
- 旧 `shogi_v3` 移行処理がある場合、Test 環境で誤って Production key を読む可能性がある。

### 5.3 方針

- Production 用 key と Test 用 key を分ける。
- 例：
  - Production：`shogi_v4`
  - Test：`shogi_v4_test`
  - Development：`shogi_v4_dev`
- 将来的には、環境変数または URL query / build flag / config object により storage prefix を切り替える。
- 旧 `shogi_v3` 移行処理がある場合、Test / Development 環境で Production key を読まないよう注意する。
- key 分離の実装変更は本文書では行わない。SHOGI-TOUR-APPHQ-008B で別 PR・別承認として扱う。

---

## 6. テストデータ方針

- Test 環境では完全架空データのみ使う。
- 実参加者名、実支部名、実大会日付を使わない。
- 実大会の組み合わせ、勝敗、参加履歴を再現しない。
- 架空データは `sample` / `fixtures` / `test` 配下に配置する。
- 架空データであることをファイル名・コメント・docs に明記する（例：`sample_` / `fixture_` / `_dummy` などの prefix・suffix）。
- 本番データからの匿名化・仮名化は原則避ける（マスク漏れ・準識別子残存リスクのため）。
- どうしても本番データ由来の検証が必要な場合は、人間ローカル限定で扱い、AI に渡さない。
- 既存の `test/data_*.json` / `test/fixtures/*.json` の架空性は別タスク（SHOGI-TOUR-APPHQ-008C）で確認する。本文書では確認しない。

---

## 7. AI に渡してよい情報 / 渡してはいけない情報

### 7.1 渡してよい

- アプリコード
- 架空データ
- テスト結果
- E2E / VRT 結果
- 個人情報を含まないエラーメッセージ
- 実データ内容を含まない構造情報
- 存在・パス・種類・リスク

### 7.2 渡してはいけない

- 実参加者名（氏名のみでも個人情報として扱う）
- 実支部名
- 実大会参加履歴
- 実大会の勝敗・組み合わせ履歴
- JSON export の実内容
- localStorage の実内容
- secret / credential / token
- 個人情報・個人関連情報
- 実データを含むスクリーンショット
- 実データを部分マスク・モザイク・サンプル抽出した断片（マスク漏れリスクのため一律禁止）

### 7.3 AI の区別

- 個人向け AI（個人プラン / 法人契約外）：いかなる実データも投入禁止。
- 法人向け AI / DPA 締結済み AI：実データ投入は別承認・別 Runbook が必要。本文書の方針ではデフォルト禁止。

---

## 8. main merge / release / deploy / publish の扱い

- SHOGI-TOUR では main merge が GitHub Pages 公開に影響する可能性がある。
- したがって main merge は Production publish 相当として扱う。
- 通常の Ready 化 / merge / branch 削除用 Approval Phrase だけでは、Production publish の解除には不十分。
- GitHub Pages 公開に影響する merge は、Production 影響確認（公開差分の把握、rollback 手順、影響範囲、実行者、実行後確認）を含める。
- 将来的には、main merge と production publish を分離できる構成を検討する。
- 例：
  - `main` = 開発統合
  - `production` branch = 公開
  - `gh-pages` branch = 公開
  - release tag = 公開判断
- ただし、本文書では設定変更しない。分離設計は SHOGI-TOUR-APPHQ-008E で扱う。

---

## 9. 推奨ロードマップ

### Phase 0：現状維持・追加リスクを増やさない

- 実データ候補ファイルの扱い Runbook 作成（SHOGI-TOUR-APPHQ-003 で対応中）
- 内容表示禁止
- 新たな実データ追加禁止
- 本文書（APPHQ-008）の設計方針確定

### Phase 1：テストデータ整備

- 完全架空データセット作成
- E2E / VRT / 操作練習で架空データを使う
- 既存 `test/data_*.json` / `test/fixtures/*.json` の架空性確認

### Phase 2：localStorage key 分離

- `shogi_v4_test` / `shogi_v4_dev` を導入
- Test / Dev で本番 key を読まない設計にする
- 旧 `shogi_v3` 移行処理の Test 環境での挙動確認

### Phase 3：テスト公開環境構築

- 別 URL / 別 repo / `test-pages` branch / local-only のいずれかを選定
- Test 環境を AI レビュー・人間確認に使う
- Test 環境への実データ持ち込み禁止を運用に反映

### Phase 4：Production publish 分離

- main merge と GitHub Pages 公開の分離を検討
- release / publish 承認 Runbook を整備
- 公開差分プレビュー手順を整備

各 Phase は別 PR・別承認で着手する。本文書では設計方針のみを定義する。

---

## 10. 後続タスク候補

- **SHOGI-TOUR-APPHQ-008A**：環境分離方式の比較・採用案決定（§4.3 の表を踏まえた評価）
- **SHOGI-TOUR-APPHQ-008B**：localStorage key 分離設計（storage prefix / config / 旧 `shogi_v3` 移行整合）
- **SHOGI-TOUR-APPHQ-008C**：完全架空テストデータ設計（既存 fixture の架空性確認を含む）
- **SHOGI-TOUR-APPHQ-008D**：GitHub Pages テスト URL 方式検討（path / branch / 別 repo / preview）
- **SHOGI-TOUR-APPHQ-008E**：main merge / production publish 分離 Runbook
- **SHOGI-TOUR-APPHQ-008F**：E2E / VRT の Test 環境対応方針

---

## 11. Risk Level

| 作業 | Risk Level | 根拠 |
|---|---|---|
| 本 docs-only 設計文書作成 | Level 1 | 設計記述のみ、実データ未表示、設定変更なし |
| localStorage key 分離の設計（docs-only） | Level 2〜3 | アプリ挙動に影響する設計、Production と隣接 |
| localStorage key 分離の実装 | Level 3 | コード変更、本番データの読み書き境界に影響 |
| 本番データ移行・退避・削除 | Level 3〜4 | 個人情報、不可逆性 |
| GitHub Pages 設定変更 | Level 4 候補 | Production 公開挙動の変更 |
| main merge / publish 分離 | Level 4 候補 | 公開フロー全体の変更 |
| 実データを使った検証 | Level 3 以上、人間ローカル限定 | 個人情報、AI 投入禁止 |
| Git 履歴改変 / force push | Level 4 | 不可逆、共有ブランチへの影響 |

APP-OPS-003 の主定義に従い、docs-only でも secret / 個人情報 / Production / 権限に関わる場合は Level 3 以上として扱う。

---

## 12. 明示的に今回やらないこと

- GitHub Pages 設定変更
- Test URL 作成
- 別 repo 作成
- localStorage key 実装変更
- `shogi_v4.html` 変更
- `index.html` 変更
- `data/import/20260412_participants.json` の確認・変更・削除
- 実データのコピー
- 本番データのバックアップ／リストア
- Git 履歴改変
- force push
- workflows / `package.json` / `playwright.config.js` の変更
- 既存 docs / HANDOFF.md の変更

---

## 13. 関連文書

- APP-OPS-001：全アプリ共通 AI 開発運用方針 v0.1
- APP-OPS-002：環境分離・AI 権限設計 v0.1
- APP-OPS-003：全アプリ共通 Risk Level 0〜4 詳細化 v0.1
- APP-OPS-004：AI ハンドオフテンプレート v0.1
- APP-OPS-011：各プロジェクト適用ルール v0.1
- APP-OPS-012：各プロジェクト適用チェックリスト v0.1
- SHOGI-TOUR `docs/operations/20260510_2200_pr_workflow_v1.md`：PR 運用ルール v1.0
- SHOGI-TOUR `docs/operations/20260510_2210_command_redundancy_v1.md`：司令塔冗長化ルール v1.0
- SHOGI-TOUR `docs/ops/20260516_shogi_tour_ai_workflow_v0_2.md`：TOUR-OPS AI 非同期運用ルール v0.2 Draft
- SHOGI-TOUR `docs/operations/shogi_tour_apphq_003_data_import_runbook.md`：`data/import` 取扱い判定 Runbook（PR #165 で導入中）

本文書は、APP-OPS-001〜005 / APP-OPS-011 / APP-OPS-012 / SHOGI-TOUR 既存 ops doc 群と整合し、SHOGI-TOUR-APPHQ-003 Runbook と補完関係にある。既存 ops doc 本文の更新は本文書では行わない。
