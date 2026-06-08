# SHOGI-TOUR-AUTO-001｜PR Gate Check / 承認後 Merge 支援 Runbook

| 項目 | 内容 |
|---|---|
| Doc ID | OPS-AUTO-PR-GATE-001 |
| バージョン | 1.0 |
| 作成日 | 2026-06-08 |
| 対象スクリプト | `scripts/shogi_tour_pr_gate.sh` / `scripts/shogi_tour_approved_merge.sh` |
| テスト | `test/test_pr_gate_scripts.sh` |
| 関連 | `docs/operations/20260510_2200_pr_workflow_v1.md`（PR運用ルール v1.0） |

---

## 1. 目的

SHOGI-TOUR では、PR 作成後の「確認 → Ready 化 → squash merge → branch 保持確認 → 完了報告」が定型化している（特に #194 / #195 のような production 向け最小反映 PR・検証バンドル PR）。本 Runbook と 2 本のスクリプトは、その**検査と承認後 merge を半自動化**しつつ、危険操作を機構的に止めることを目的とする。

- `shogi_tour_pr_gate.sh`（**読み取り専用**）: PR 番号と profile を指定すると、安全性・運用条件を自動検査して `READY_CANDIDATE` / `NEEDS_REVIEW` / `BLOCKED` を判定する。
- `shogi_tour_approved_merge.sh`（**既定 dry-run**）: 人間の明示承認後にだけ Ready 化 → squash merge → branch 保持確認 → 完了報告テンプレ生成を支援する。`--execute` が無い限り何も変更しない。

本 Runbook と実装は **「自動でレビューを置き換えるもの」ではない**。最終的な Ready 化・merge 判断は人間が行い、スクリプトは「同じ観点の確認」と「危険操作の機構的ブロック」を肩代わりするだけである。

### 1.1 このツールが行わないこと（恒久スコープ外）

- branch 削除（`--delete-branch` を**一切使わない**）
- `--execute` と人間承認なしの Ready 化 / merge
- `gh pr merge --auto`（自動 merge 予約）
- production / main への直接 push
- GitHub Pages 設定変更・release・deploy・publish
- `data/` 配下の実ファイル本文の読み取り・表示
- 実名・実データのログ出力（検査は path とメタデータのみ）
- PR 本文 / title の自動更新・表示
- GitHub Actions 化・コメント承認による自動 merge・実名データ検査の高度化

---

## 2. 対象 profile

| profile | 想定 PR | base | 変更を許すファイル | 主な禁止 |
|---|---|---|---|---|
| `production-minimal` | 公開最小反映（#195 型） | `production` | `index.html` / `shogi_v4.html` のみ | docs/ test/ fixture/ data/ .github/ package*.json 等すべて |
| `main-dev` | main/test 環境の機能追加 | `main` | test / docs / code | `data/`（実データ） |
| `docs-only` | ドキュメントのみ | production 以外 | `docs/` と `HANDOFF.md` / `README.md` / `CHANGELOG.md` | `shogi_v4.html` / test/ / workflow / package |
| `test-only` | テスト・fixture のみ | production 以外 | `test/`（fixture 含む） | production / `shogi_v4.html` |

判定ロジックの中核は純粋関数 `classify_path <profile> <path>`（→ `ALLOWED`/`FORBIDDEN`）と `realdata_risk_path <path>`（→ `CLEAR`/`WARN`/`RISK`）。いずれも **path だけで判定し、ファイル本文は読まない**。`test/test_pr_gate_scripts.sh` で単体テスト済み。

---

## 3. 使い方

### 3.1 Gate Check（読み取り専用）

```bash
./scripts/shogi_tour_pr_gate.sh --pr <番号> --profile <profile> [--repo owner/repo]
```

出力:

- changed files（path のみ）
- base / head、draft / open 状態、mergeable 状態
- OK / WARN / NG の一覧
- forbidden file の有無
- real data risk の簡易検出結果
- 最終判定: `READY_CANDIDATE` / `NEEDS_REVIEW` / `BLOCKED`
- 次に必要な人間承認文の例

終了コード:

| code | 意味 |
|---|---|
| 0 | `READY_CANDIDATE`（全 OK。人間承認後の Ready/merge 候補） |
| 10 | `NEEDS_REVIEW`（WARN あり。人間レビュー要） |
| 20 | `BLOCKED`（NG あり。Ready/merge 不可） |
| 2 | 引数エラー |
| 3 | 実行時エラー（gh 取得失敗など） |

### 3.2 Approved Merge（既定 dry-run）

```bash
# 何も変更しない（既定）。gate を実行し、実行予定の操作と完了報告テンプレを表示。
./scripts/shogi_tour_approved_merge.sh --pr <番号> --profile <profile> --dry-run

# 実行（要・人間承認）。対話で YES を入力するか --yes を付ける。
./scripts/shogi_tour_approved_merge.sh --pr <番号> --profile <profile> --execute [--yes] [--post-comment]
```

`--execute` の処理順:

1. `shogi_tour_pr_gate.sh` を内部実行。`READY_CANDIDATE` でなければ**停止**。
2. 実行確認（対話端末で `YES`、または `--yes`）。非対話 + `--yes` 無しは**中止**。
3. `gh pr ready`
4. Ready 化後に gate を**再実行**。`READY_CANDIDATE` でなければ merge せず**停止**。
5. `gh pr merge --squash`（`--delete-branch` なし / `--auto` なし）
6. base branch の最新 SHA を表示
7. head branch が remote に残存していることを確認
8. 完了報告テンプレートを stdout に出力
9. `--post-comment` 指定時のみ、完了報告を PR コメントとして投稿

終了コード: `0`=完了 / `2`=引数エラー / `3`=実行時エラー / `4`=実行中止（確認 NG・無承認・非対話）/ `10`=gate NEEDS_REVIEW / `20`=gate BLOCKED。

---

## 4. dry-run 例

```bash
# production-minimal の最小反映 PR を検査（読み取り専用）
./scripts/shogi_tour_pr_gate.sh --pr 195 --profile production-minimal

# その PR の承認後 merge を「予行」する（何も変更しない）
./scripts/shogi_tour_approved_merge.sh --pr 195 --profile production-minimal --dry-run
```

dry-run は gate を通すだけで、`gh pr ready` / `gh pr merge` を**呼ばない**。`READY_CANDIDATE` の場合に「実行予定の操作」と「完了報告テンプレートのプレビュー」を表示して終了する。

---

## 5. execute 例（要・人間承認）

> **前提:** 直前に gate が `READY_CANDIDATE` であること。かつ人間が「Ready 化 + squash merge してよい」と明示承認していること。

```bash
# 対話端末で実行 → 確認に YES を入力
./scripts/shogi_tour_approved_merge.sh --pr 195 --profile production-minimal --execute

# 無人実行を明示許可する場合（CI 等ではなく、承認済みを人間が保証する前提）
./scripts/shogi_tour_approved_merge.sh --pr 195 --profile production-minimal --execute --yes

# 完了報告を PR コメントにも投稿する場合
./scripts/shogi_tour_approved_merge.sh --pr 195 --profile production-minimal --execute --yes --post-comment
```

`--execute` でも **`--delete-branch` は使わない**。head branch は必ず保持され、merge 後に「remote に残存しているか」を確認して報告する。

---

## 6. 人間承認が必要な境界

| 操作 | スクリプトの扱い |
|---|---|
| PR の検査（gate） | 承認不要（読み取り専用） |
| dry-run | 承認不要（何も変更しない） |
| Ready 化 (`gh pr ready`) | **要承認**。`--execute` + 確認(YES / `--yes`) |
| squash merge (`gh pr merge`) | **要承認**。`--execute` + 確認、かつ gate 2 回とも `READY_CANDIDATE` |
| PR コメント投稿 | **要明示**。`--execute` + `--post-comment` |
| branch 削除 | **行わない**（恒久禁止） |
| production への反映（production-minimal の merge） | **要承認**。下記 §11 も併読 |

「コミット済み」と「main / production 反映済み」は別物（PR運用ルール v1.0 §9）。本ツールの dry-run は「反映していない」状態であることを必ず明示する。

---

## 7. `production-minimal` の適用条件

次を**すべて**満たすときに `READY_CANDIDATE`:

- base が `production`
- changed files が `index.html` / `shogi_v4.html` の**み**
- docs/ test/ fixture/ data/ .github/ package*.json 等を含まない（forbidden file なし）
- 実名・実データらしき path を含まない（real data risk が RISK でない）
- PR が `OPEN`
- `mergeable=MERGEABLE`（clean）

`production` への反映を伴うため、**§11（production 凍結）を必ず確認**してから承認する。

---

## 8. `main-dev` の適用条件

- base が `main`（`production` を base にしていない）
- `data/` 配下（実データ）を含まない
- 実名・実データらしき path を含まない
- test / docs / code の変更は許容
- `OPEN` かつ `mergeable=MERGEABLE`

base が `production` の場合は「production を触る PR」として **NG（BLOCKED）**。production への反映は `production-minimal` で行う。

---

## 9. `docs-only` / `test-only` の適用条件

**docs-only:**

- changed files が `docs/` と許可された docs 系ルートファイル（`HANDOFF.md` / `README.md` / `CHANGELOG.md`）のみ
- `shogi_v4.html` / `test/` / workflow / `package*.json` を含まない
- base が `production` の場合は WARN（想定外。要確認）

**test-only:**

- changed files が `test/`（fixture 含む）のみ
- production（`index.html` / `shogi_v4.html`）を含まない
- base が `production` の場合は WARN（想定外。要確認）
- fixture は**架空のみ**（synthetic / dummy / example.invalid）。実データを置かない（§10）

---

## 10. 実データ取扱い注意

- **`data/` 配下の実ファイル本文は読まない / 表示しない / commit しない。** gate は `gh pr view --json files` の **path だけ**を参照し、本文（diff body）は取得しない。
- `data/` 配下の path は無条件で `RISK` → `BLOCKED`。
- synthetic / sample / example / dummy / mock / fixture / template 等の表記が無い `.json` / `.csv` / `.tsv` は `WARN`（実データの疑い。人間が目視）。
- real data risk 検出は **path ベースの簡易判定**であり、実名データ検査の高度化はスコープ外。最終的な実名混入チェックは人間が行う。
- リポジトリ運用上、実参加者データは端末ローカルの `data/`（`.gitignore` 済み）にのみ置き、PR / docs / test / fixture / コメントには入れない（実データ非コミット原則）。

---

## 11. 6月14日 本番用 production 凍結中の注意点

> **本番（2026-06-14）に向けて `production` は凍結中。** main / test 環境での機能追加は進めるが、`production` への反映は原則行わない。

- `production-minimal` の merge は **`production` を更新する**。凍結期間中は、緊急の最小修正で**人間が明示承認した場合に限り**実行する。
- 凍結中の既定運用は次の 2 つ:
  - `main-dev`: main/test 環境への機能追加 PR を検査・merge 支援（production を触らない）。
  - `docs-only` / `test-only`: ドキュメント・テスト整備。
- production への反映が必要になった場合は、**いったん停止して人間に確認**する（本ツールは判断主体にならない）。
- GitHub Pages 公開元は `production`。Pages 設定変更・deploy・publish は本ツールの対象外であり、**行わない**。

---

## 12. `BLOCKED` / `NEEDS_REVIEW` になった時の対応

### 12.1 `BLOCKED`（NG あり）

代表的な NG と対応:

| NG | 原因 | 対応 |
|---|---|---|
| base 不一致 | profile と base が合っていない | 正しい profile を選ぶ / PR の base を見直す |
| forbidden file | profile の許可範囲外のファイルを含む | PR を分割する（1 PR = 1 目的） / profile を見直す |
| real data RISK | `data/` 配下の path を含む | **実データを PR から外す**。実データはローカル `data/` のみ |
| CONFLICTING | コンフリクトあり | base を取り込み直してコンフリクト解消 |
| PR が OPEN でない | 既に merged / closed | 対象 PR を見直す |

`BLOCKED` の PR は **Ready 化・merge してはいけない**。`approved_merge` は dry-run / execute いずれでも gate 段階で停止する。

### 12.2 `NEEDS_REVIEW`（WARN あり）

- `mergeable=UNKNOWN`: GitHub が算出中。時間をおいて gate を再実行。
- real data WARN: synthetic 表記の無い構造化データ。人間が中身（実データでないこと）を目視確認。
- changed files が 0 件: マージ対象が無い。PR を確認。

WARN を解消するか、人間が個別に承認したうえで、改めて gate を `READY_CANDIDATE` にしてから承認する。

### 12.3 Ready 化後に `READY_CANDIDATE` から外れた場合

`--execute` 中、Ready 化直後の再 gate が `READY_CANDIDATE` でなければ **merge せず停止**する（exit 10/20）。`mergeable=UNKNOWN` が原因なら、少し置いて `--execute` を再実行する（`gh pr ready` の再実行は冪等で無害）。

---

## 13. branch 削除禁止

- 本ツールは `--delete-branch` を**一切使わない**。`gh pr merge` は `--squash` のみで実行する。
- merge 後に `gh api repos/<repo>/branches/<head>` で head branch の残存を確認し、報告する。
- リポジトリ側の "Automatically delete head branches" 設定が ON だと GitHub 側で削除されることがある。その場合でも**本ツールは削除していない**旨を報告に明示する（設定確認は人間が行う）。

---

## 14. テスト

```bash
bash test/test_pr_gate_scripts.sh
```

- `bash -n`（shellcheck が無い環境向け。あれば `shellcheck` も実行）
- `classify_path` / `realdata_risk_path` / `valid_profile` の単体テスト
- 引数不足・profile 不正・非数値 PR でエラー終了すること
- dry-run が既定であること
- `--execute` なしで `gh pr ready` / `gh pr merge` を呼ばないこと（mock gh で検証）
- 無承認 `--execute`（非対話 + `--yes` 無し）で merge せず中止すること
- 承認あり実行時に merge が `--squash` で、`--delete-branch` を使わないこと
- `BLOCKED` の PR を merge しないこと

---

## 15. 停止条件（このツール運用時に人間へエスカレーションする境界）

- production 更新が必要になった場合（凍結中は特に）
- 実名・実データが必要 / 混入の疑いがある場合
- merge の自動実行が無承認で走りそうな場合
- branch 削除の可能性がある場合
- Pages 設定変更 / release / deploy / publish が必要になった場合

上記はいずれも**いったん停止し、人間の判断を仰ぐ**。本ツールは判断主体にならない。

---

## 16. 履歴

| 日時 | 内容 |
|---|---|
| 2026-06-08 | v1.0 初版（SHOGI-TOUR-AUTO-001。Gate Check / Approved Merge / テスト / 本 Runbook を作成。Draft PR まで） |
