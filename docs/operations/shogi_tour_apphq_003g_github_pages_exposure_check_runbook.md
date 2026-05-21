# SHOGI-TOUR-APPHQ-003G｜GitHub Pages公開済み影響確認Runbook

## 1. 目的

SHOGI-TOUR-APPHQ-003G は、main に残存している実データ確定 JSON (`data/import/20260412_participants.json`) および関連危険資産（旧 E2E spec 等）に関して、**GitHub Pages 上の公開済み影響を確認するための安全な Runbook** である。

本文書では以下を整理する。

- なぜ GitHub Pages 公開済み影響を確認する必要があるか
- 確認してよい情報 / 確認してはいけない情報
- 許可される確認方法（HEAD / HTTP status / headers / Pages source 設定 / metadata のみ）
- 003G-1 の想定実行手順
- 結果分類（A / B / C / D）
- 報告フォーマット
- 003H / 003E との関係
- 緊急時対応
- rollback 方針
- Risk Level
- Approval Phrase / 承認境界

本文書は **docs-only** であり、以下は今回行わない。

- GitHub Pages 確認の実行
- HTTP HEAD / GET の実行
- response body の取得
- screenshot 取得 / browser 表示
- 対象 JSON 本文表示 / 構造確認
- 旧 E2E spec 本文表示 / 変更 / 削除
- synthetic 専用 E2E / fixture / `shogi_v4.html` / CI 設定の変更
- GitHub Pages 設定変更
- Git 履歴改変 / force push / clean tree / orphan branch / repo 移行
- 過去 No Go PR の diff 本文表示
- 実データ由来に見える旧期待値・具体値の再掲

## 2. なぜ GitHub Pages 公開済み影響を確認するのか

- SHOGI-TOUR は **GitHub Pages 等で公開される可能性** がある（運用形態としての前提）。
- 対象 JSON が repository tree に残っている場合、**Pages 公開元や設定次第では静的ファイルとして公開されていた可能性** がある。
- CI 対象は PR #182 で safe-side に限定済みだが、**Pages 公開影響とは別問題**。
- 現行 tree 撤去（003H）や履歴対応（003E）の **優先度を判断するため**、公開済み影響の有無を把握する必要がある。
- ただし、**本文取得はそれ自体が再露出・保存・ログ化リスクになる** ため、明示的に **禁止** する。

## 3. 確認してよい情報 / 確認してはいけない情報

### 3.1 確認してよい情報

| 区分 | 例 |
|---|---|
| Pages の有効性 | GitHub Pages が enabled / disabled |
| Pages source | source branch / source directory |
| Pages build / deployment | 有無 / latest deployment の metadata |
| 公開 URL | ドメイン / base URL / custom domain 有無 |
| HTTP HEAD status code | 200 / 301 / 302 / 304 / 401 / 403 / 404 / 5xx |
| HTTP headers | Content-Type / Content-Length / Last-Modified / ETag / Cache-Control 等 |
| 対象パスの見え方 | status code が 200 系か 4xx / 5xx 系か |
| GitHub Actions deployment metadata | run id / status / timestamp |
| Pages settings metadata | settings API レスポンスのメタ情報 |

### 3.2 確認してはいけない情報

| 区分 | 例 |
|---|---|
| 対象 JSON 本文 | response body の中身 / 配列 / オブジェクト |
| sample rows / unique values / 統計値 | JSON のサンプル行・ユニーク値・件数推定 |
| 実データ属性 | 実名・住所・地域・読み・日付・属性カテゴリの値 |
| 旧 E2E spec 本文 | spec 内コード・期待値 |
| 旧期待値リテラル | 旧 spec で hard-coded されていた値 |
| PR diff 本文 | PR #169 / PR #174 のファイル差分 / レビュー差分 |
| GET レスポンス body | curl GET / wget で取得した本文 |
| ブラウザ表示 | 実 URL を開いた表示・スクリーンショット |
| 保存物 | HTML / JSON / HAR / trace / screenshot / video |

## 4. 許可される確認方法

### 4.1 許可

- **GitHub CLI / API で Pages 設定 metadata を確認** する（`gh api repos/{owner}/{repo}/pages` 等）。
- repository settings / Pages source のメタ情報を確認する。
- **GitHub Actions deployments / Pages deployments の metadata** を確認する（status / timestamp / commit SHA など）。
- **`curl -I` または同等の HEAD request** で HTTP headers のみ確認する。
- body を **保存しない設定** で HEAD のみ実行する。
- 結果報告では **status code / headers の要約のみ** を書く。
- Content-Length は値そのものを出してよいが、**本文推定・中身推定はしない**。

### 4.2 禁止

- **`curl` で GET する**（`curl URL` も `curl -L URL` も禁止）。
- ブラウザで対象 URL を開く。
- Playwright / screenshot / browser automation で対象 URL を見る。
- `wget` / `httpie` 等で body を保存する。
- response body を log に出す（stdout / stderr / artifact / CI log への露出も禁止）。
- 対象 JSON URL の本文を確認する。
- 対象 JSON URL の中身を **人間・AI に共有** する。
- HEAD 結果に基づいて推測した本文内容を再構成・記述する。

## 5. 対象パスの扱い

- 対象 JSON の repository path は、**既にタスク上の管理対象として認識** されている。
- ただし、Runbook 本文や PR コメントでは **必要最小限の表現** に留める。
- 003G-1 で HEAD 確認を行う場合、対象パスを URL 化する必要があるが、**本文取得は禁止**。
- 対象 URL を報告する場合も、**実データ本文に直結する URL の扱いは慎重** にする。
- 可能であれば「target JSON path」「real-data import asset」など **抽象表現を優先** する。
- **`raw.githubusercontent.com` など本文取得系 URL へのアクセスは原則避ける**（HEAD であっても、誤って body を取りに行く設定ミスのリスクがあるため）。
- GitHub Pages の公開 URL 確認も **HEAD のみに限定** する。

## 6. 003G-1 の想定実行手順

003G-1 では、以下の順序で **read-only に** 確認する。

### 6.1 GitHub Pages 設定確認

- Pages が **有効か**
- **source branch**（main / gh-pages / 等）
- **source directory**（`/` / `/docs` / 等）
- **custom domain** 有無
- **latest deployment** の metadata（run id / status / timestamp / commit SHA）

### 6.2 公開ベース URL 確認

- Pages URL の **存在**
- HEAD / metadata 限定（base URL や trailing index へのアクセスも HEAD のみ）

### 6.3 対象パスの HEAD 確認

- **GET は禁止**
- **body 保存禁止**
- **redirect がある場合も本文取得しない**（`-L` 禁止、`Location` ヘッダの値は記録してよい）
- status code / headers のみ記録

### 6.4 結果分類

§7 の A / B / C / D に従って分類する。

### 6.5 結果に応じた次アクション

- **A / B**：003E / 003H-1 へ進む（標準順）
- **C**：公開影響が強く疑われるため、003H-1 / 003H-2 を優先し、必要なら緊急遮断策を検討
- **D**：追加権限・人間確認を依頼

## 7. 結果分類

### 7.1 A：Pages 無効または公開経路なし

- 公開済み影響は **低い可能性**
- ただし repository / history 上の問題は **残る**
- **003E / 003H-1 へ進む**

### 7.2 B：Pages 有効だが対象パスは本文非公開に見える

- HEAD status が 404 / 403 / 410 等
- 公開影響は **限定的な可能性**
- ただし **過去 deployment / cache / history の問題は残る**
- **003E / 003H-1 へ進む**

### 7.3 C：対象パスが 200 系に見える

- **本文は見ない**
- 公開されている **可能性が高い**
- **緊急度を上げる**
- **003H-1 / 003H-2 / Pages 遮断策を優先検討**
- 必要なら **人間が確認し、法務・管理者判断へエスカレーション**

### 7.4 D：確認不能

- 追加権限やネットワーク到達性不明、API レート制限など
- **追加権限や人間確認が必要**
- **不明なまま本文取得に進まない**

## 8. 報告フォーマット

003G-1 の報告では、以下のみ記載する。

| 項目 | 値 |
|---|---|
| `Pages enabled` | yes / no / unknown |
| `source branch` | 値（または unknown） |
| `source directory` | 値（または unknown） |
| `custom domain` | yes / no / unknown |
| `latest deployment` | metadata のみ（run id / status / timestamp / commit SHA） |
| `target HEAD status` | 200 / 301 / 302 / 304 / 401 / 403 / 404 / 5xx / unknown |
| `target HEAD headers` | Content-Type / Content-Length / Last-Modified / ETag / Cache-Control 等の要約 |
| `body fetched` | **no**（必ず no） |
| `screenshot taken` | **no**（必ず no） |
| `response body stored` | **no**（必ず no） |
| `result category` | A / B / C / D |
| `recommended next action` | 003E / 003H-1 / 003H-2 / 緊急エスカレーション 等 |

報告に **含めないもの**：

- response body
- JSON 本文
- sample rows / unique values / 統計値
- 実名・住所・地域・読み・日付・属性の値
- 旧 E2E spec 本文
- 旧期待値リテラル
- PR #169 / PR #174 diff 本文

## 9. 003H / 003E との関係

- **003G** は公開影響確認（read-only）。
- **003H** は現行 tree / 公開 tree からの撤去方式選定・実行。
- **003E** は Git 履歴対応要否判断。
- 003G で **公開影響が強く疑われる場合**、003H-1 / 003H-2 を **優先** する。
- 003G で **公開影響が低そうでも**、repository 本体と Git 履歴の問題は残るため **003E / 003H は継続** する。
- 003G を **撤去遅延の理由にしない**（並行検討可）。

## 10. 緊急時対応

C 判定（対象パスが 200 系に見える）の場合：

- **本文は見ない**。
- 対象 URL を **広く共有しない**。
- GitHub Pages 設定変更や公開元切替を検討する場合は **Level 4 候補** として扱う。
- repo visibility 変更や Pages 停止を検討する場合も **人間承認が必要**。
- **003H-1 / 003H-2 を優先** する。
- 必要なら **法務・管理者判断へエスカレーション**。
- 緊急遮断策も **rollback / 影響範囲 / 通知先を明記** する（003H §8.1 と整合）。

## 11. rollback 方針

- 003G 自体は **read-only 確認なので rollback 対象はない**。
- 003G 結果を受けた **Pages 設定変更・visibility 変更・branch 切替** は rollback が必要。
- 緊急対応で設定変更する場合は、**事前に戻し方を明文化** する。
- rollback 時も **本文取得は禁止**（rollback 経路でも安全条件は同じ）。

## 12. Risk Level

| 作業 | Risk Level |
|---|---|
| 本 Runbook 作成（本 PR） | docs-only だが公開影響確認に関わるため **Level 3 相当** |
| 003G-1 read-only metadata 確認 | Level 3 |
| HEAD request 確認 | Level 3 |
| GET / body 取得 | **禁止** |
| screenshot / browser 確認 | **禁止** |
| Pages 設定変更 | Level 4 候補 |
| Pages 公開元切替 | Level 4 候補 |
| repo visibility 変更 | Level 3〜4 |
| Git 履歴改変 / force push | **Level 4** |

## 13. Approval Phrase / 承認境界

- 本 Runbook 作成は docs-only だが **Level 3 相当**。
- **003G-1 read-only metadata / HEAD 確認** は別 PR・別承認。
- **GitHub Pages 設定変更** は別承認。
- **Pages 停止 / 公開元切替 / repo visibility 変更** は標準 Approval Phrase では **解除不可**。
- **body 取得 / screenshot / browser 確認は禁止** であり、**標準承認では解除不可**（許可するには本 Runbook §4.2 の禁止項目を改訂する Level 4 承認が必要）。
- **Git 履歴改変・force push・clean tree・repo 移行** は 003G では扱わない（003E / 003H スコープ）。

## 14. 今回やらないこと

- GitHub Pages 確認の実行
- HTTP HEAD 確認の実行
- HTTP GET
- response body 取得
- screenshot 取得
- browser 表示
- 対象 JSON 本文表示
- 対象 JSON 構造確認（値 / 件数 / unique values / sample rows）
- 旧 E2E spec 本文表示
- PR #169 / PR #174 diff 表示
- GitHub Pages 設定変更
- repo visibility 変更
- Git 履歴改変
- force push
- clean tree / orphan branch 作成
- repo 移行
- 対象 JSON 削除
- 旧 E2E spec 削除
- CI 設定変更
- `shogi_v4.html` 変更
- release / deploy / publish

## 15. Done 条件

### 15.1 003G の Done（本文書の Done）

- Pages 公開影響確認の **安全な Runbook が作成** されている
- **本文取得禁止** が明確
- **HEAD / metadata 限定の確認手順** が明確
- **結果分類 A / B / C / D** が明確
- **003H / 003E との関係** が明確
- **Level 4 承認境界** が明確

### 15.2 003G-1 の予定 Done

- Pages 設定 metadata を取得済み
- 対象パスの HEAD / metadata 確認が完了
- **response body を取得していない**
- **screenshot を取得していない**
- **body を保存していない**
- **結果分類 A / B / C / D** が出ている
- **次アクションが明確**
