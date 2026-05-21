# SHOGI-TOUR-APPHQ-003｜data/import 取扱い判定 Runbook

Task ID：SHOGI-TOUR-APPHQ-003  
Task Name：data/import/20260412_participants.json 取扱い判定 Runbook 作成  
Project ID：SHOGI-TOUR  
Parent Project ID：APP-HQ  
Repo：kazuo1970takahashi-sketch/shogi  
種別：docs-only / Runbook 新規作成  

---

## 0. この文書の位置づけ

この Runbook は、SHOGI-TOUR-APPHQ-001 read-only 棚卸しで確認された `data/import/20260412_participants.json` を、実データ混入候補として安全に扱うための判定手順を定めるものである。

本 Runbook 作成時点で、対象 JSON の中身は確認していない。  
本 Runbook は、内容を表示しないまま判定・後続対応を進められるよう設計する。

APP-HQ の方針に従い、実データ・個人情報・secret が疑われる場合は、内容を表示せず、存在・パス・種類・リスクのみで扱う。氏名のみでも個人情報として扱う。

---

## 1. 目的

- `data/import/20260412_participants.json` を実データ混入候補として安全に判定する。
- 内容を表示せず、存在・パス・種類・リスクのみで扱う。
- 実データだった場合の後続対応（削除・架空化・履歴対応）を、Runbook 化前に AI が単独で実行しないよう、人間承認へ分離する。

---

## 2. 対象ファイル

- パス：`data/import/20260412_participants.json`
- サイズ：3,880 bytes（read-only 棚卸し時点）
- 追跡状態：`origin/main` で追跡中
- ファイル名の含意：`20260412` は 2026-04-12 の大会日付に見える。`participants` は参加者データを示唆する。
- 内容：**未確認**。本 Runbook 作成にあたっても開いていない。
- 想定リスク：実参加者名、所属支部、段級位、参加履歴、大会日付の組み合わせが含まれる可能性。

---

## 3. 基本方針

- 氏名のみでも個人情報として扱う。
- 実参加者名、支部名、段級位、参加履歴、大会日付の組み合わせは個人情報または個人関連情報として扱う。
- 個人向け AI（ChatGPT 個人 / Claude 個人 / Gemini 個人 / cowork 等）に内容を貼らない。
- チャット、PR 本文、レビューコメント、Issue、外部ストレージに実データ内容を表示しない。
- 判定時は、**存在・パス・種類・サイズ・キー構造・件数・リスク**のみを扱う。
- 内容確認が必要な場合は、人間がローカルで確認し、実値を外部 AI へ送らない。
- 判断に迷う場合は高リスク側に倒す。
- 本 Runbook は判定・整理用であり、削除・架空化・履歴改変・force push を本 Runbook 単独で承認しない。

---

## 4. read-only で許可する確認

以下は許可する（いずれもファイル内容を表示しない手段）。

- `git log -- data/import/20260412_participants.json`（追加・変更の commit 履歴）
- `git ls-files data/import/20260412_participants.json`（追跡確認）
- `git ls-tree -l origin/main data/import/20260412_participants.json`（サイズ・blob SHA）
- `git status`（作業ツリーの状態確認）
- ファイル名・パス・サイズの確認
- JSON のトップレベル構造（キー名のみ）の確認。**値は表示しない**。
- 件数確認（配列長など、属性値を伴わない件数）。**氏名・支部名・属性値は表示しない**。
- キー名確認。**値は表示しない**。
- スキーマ妥当性確認（型のみ）。**値は表示しない**。

許可される確認も、出力先（チャット・PR 本文・コメント・docs）に実値が露出しないことを確認したうえで実行する。

---

## 5. 禁止する確認

以下は禁止する。

- 実名、支部名、段級位、参加者属性の値をチャットに表示する。
- JSON 本文を AI に貼る。
- ファイル内容を PR 本文 / コメント / Issue に引用する。
- 実データを含むスクリーンショットを貼る。
- 値を一部マスク・モザイク・サンプル抽出して表示する（マスク漏れリスクのため、本 Runbook では一律禁止）。
- ファイルを削除する。
- ファイルを編集する。
- Git history rewrite（`git filter-repo` / `git filter-branch` / `git reset --hard` で過去 commit を消す等）を行う。
- force push を行う。
- GitHub 上のファイル内容を外部 AI（個人向け AI、不明な権限の AI）で解析させる。
- GitHub Pages 公開済みデータの取り下げを本 Runbook 単独で実行する。

---

## 6. 判定区分

判定は以下の 4 区分に分類する。

### 6.A 実データ確定

人間がローカルで確認し、以下のいずれかに該当する場合。

- 実参加者の氏名（姓のみ・名のみを含む）が確認できる。
- 実支部名が確認できる。
- 実大会の参加記録・段級位・連絡先・年齢・所属が確認できる。
- 上記の組み合わせから個人を識別可能。

### 6.B 実データ疑い

- ファイル名、日付、構造、件数から実データの可能性が高いが、内容確認前。
- 人間が確認したが架空・実データの判定ができない。
- サンプルに実名らしき文字列が混入している疑いがある。

### 6.C 架空データ

- 人間がローカルで確認し、完全架空であると判断できる場合。
- すべての氏名・支部名・属性値がサンプル用文字列（例：`架空太郎` / `テスト支部` 等の明示）で構成されている。
- 架空である根拠を docs に記録できる。

### 6.D 判定保留

- 内容確認できない。
- 判断に迷う。
- 確認担当者が不在。

判定保留は実データ疑い相当として扱う。

---

## 7. 判定結果ごとの対応方針

### 7.A 実データ確定

- repo から削除または架空化が必要。
- 削除のみでは Git 履歴に残るため、履歴対応の要否を別 Runbook（後続タスク）で判断する。
- すでに GitHub に push 済みかつ public repo のため、公開範囲・影響範囲（クローン済み・キャッシュ・検索結果・外部ミラー）を確認する。
- force push / history rewrite は Risk Level 4 相当として、別 Runbook と別承認（人間最終承認、影響範囲、rollback 方針、実行者、実行後確認の明示）が必須。
- 代替として、完全架空 fixture を新規作成し、`data/import/` から `test/fixtures/` または `docs/samples/` 等の架空データ専用ディレクトリへ移行する。
- 関係者（参加者・支部・大会主催側）への通知要否は人間判断とする。

### 7.B 実データ疑い

- 内容を表示しないまま、人間確認へエスカレーション。
- AI には存在・パス・種類・リスクのみ共有。
- 安全側に倒して一時的に高リスク扱い（実データ確定相当の取扱い）とする。
- 別 Runbook（後続タスク）で確認手順を定義する。
- 確認完了まで本ファイルへの参照・利用を停止する。

### 7.C 架空データ

- 架空である根拠（確認日、確認者、確認方法、サンプル文字列のパターン）を docs に記録する。
- ファイル名が実大会日付に見える場合（`20260412_` 等）はリネームを検討する（例：`sample_participants_v1.json`）。
- 配置場所を `data/import/`（実データ用ディレクトリの含意）から `test/fixtures/` や `docs/samples/` 等の架空データ専用ディレクトリへの移動を検討する。
- いずれもファイル変更を伴うため、別 PR・別承認で扱う。

### 7.D 判定保留

- 実データ疑い（7.B）として扱う。
- AI への投入禁止。
- 確認担当者・確認方法・期限を明示し、後続タスクで再確認する。

---

## 8. 後続タスク候補

本 Runbook 作成では実行しない。判定区分に応じて、以下の後続タスクを別 Runbook / 別 PR / 別承認で起票する。

- **SHOGI-TOUR-APPHQ-003A**：`data/import/` ファイル構造の値非表示確認（キー名・型・件数のみ抽出）。
- **SHOGI-TOUR-APPHQ-003B**：人間による実データ性判定（ローカル確認、AI 投入禁止）。
- **SHOGI-TOUR-APPHQ-003C**：実データ確定時の撤去・架空化方針（撤去手順 / 代替 fixture 設計）。
- **SHOGI-TOUR-APPHQ-003D**：Git 履歴対応要否判断（履歴改変の必要性 / 影響範囲評価 / force push 承認条件）。
- **SHOGI-TOUR-APPHQ-003E**：完全架空サンプルデータ作成（テスト・PoC 用、`test/fixtures/` または `docs/samples/` 配置）。

各後続タスクは、本 Runbook の判定結果と人間承認を前提に着手する。

---

## 9. Risk Level

各作業の Risk Level 暫定評価。

| 作業 | Risk Level | 根拠 |
|---|---|---|
| 本 Runbook の作成 | Level 1 | docs-only、実データ未表示 |
| 実データ疑いの構造確認（キー名・型・件数のみ） | Level 3 | 個人情報を扱う可能性のあるファイル参照のため、安全側で Level 3 |
| 実データ確定後の削除・架空化 | Level 3 | 個人情報を含むファイルの撤去・架空化 |
| Git 履歴改変 / force push | Level 4 | 不可逆操作、共有ブランチへの影響 |
| GitHub Pages 公開済みデータの撤去判断 | Level 4 候補 | 公開 = Production 操作相当、影響範囲が外部に及ぶ |

APP-OPS-003 の主定義に従い、docs-only でも secret / 個人情報 / Production / 権限に関わる場合は Level 3 以上として扱う。

---

## 10. Approval Phrase / 承認条件

### 10.1 本 Runbook 作成

- docs-only。
- 通常の PR 運用（Draft 先行、Codex / Claude.ai レビュー、Ready 化、明示マージ、branch 削除を別承認）に従う。
- 標準 Approval Phrase（Ready 化 / merge / merge 済み branch 削除）で解除可能。
- ただし、APP-OPS-004 §2.1 の precondition 確認を省略しない。

### 10.2 標準 Approval Phrase で解除できない作業

以下は、本 Runbook の判定結果に基づき、別 Runbook・別承認で扱う。

- 対象 JSON の削除
- 対象 JSON の架空化（内容書き換え）
- Git 履歴改変（`filter-repo`、`filter-branch`、過去 commit の `--amend` / `reset --hard` 等）
- force push
- GitHub Pages 公開済みデータの撤去判断
- 関係者通知
- 公開済みクローン・キャッシュ・外部ミラーへの影響評価

これらは、APP-OPS-004 §2.2 に準拠し、個別 Runbook、人間最終承認、rollback 方針、影響範囲、実行者、確認項目の明示が必須。

### 10.3 AI への投入禁止

- 本 Runbook 自体は docs-only のため、AI への共有が可能。
- ただし、対象 JSON の中身は AI に貼らない、添付しない、共有しない。
- 個人向け AI（個人プラン / 法人契約外）へは内容を一切送らない。
- 法人向け AI / DPA 締結済み AI へ送る場合も、本 Runbook の §5 禁止事項に従う。

---

## 11. 関連文書

- APP-OPS-001：全アプリ共通 AI 開発運用方針 v0.1
- APP-OPS-002：環境分離・AI 権限設計 v0.1
- APP-OPS-003：全アプリ共通 Risk Level 0〜4 詳細化 v0.1
- APP-OPS-004：AI ハンドオフテンプレート v0.1
- APP-OPS-011：各プロジェクト適用ルール v0.1
- APP-OPS-012：各プロジェクト適用チェックリスト v0.1
- SHOGI-TOUR `docs/operations/20260510_2200_pr_workflow_v1.md`：PR 運用ルール v1.0
- SHOGI-TOUR `docs/operations/20260510_2210_command_redundancy_v1.md`：司令塔冗長化ルール v1.0
- SHOGI-TOUR `docs/ops/20260516_shogi_tour_ai_workflow_v0_2.md`：TOUR-OPS AI 非同期運用ルール v0.2 Draft

本 Runbook は、APP-OPS-001〜005 / APP-OPS-011 / APP-OPS-012 を前提とし、SHOGI-TOUR 既存 ops doc 群と矛盾しない範囲で `data/import/` 取扱い判定手順のみを追加定義する。既存 ops doc 本文の更新は本文書では行わない。
