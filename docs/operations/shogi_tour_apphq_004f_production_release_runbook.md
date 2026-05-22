# SHOGI-TOUR-APPHQ-004F｜production release Runbook

## 1. 目的

main で開発・検証した変更を、本番公開 branch である `production` に安全に反映する。production には公開に必要な **最小ファイルのみ** を含め、docs / test / data / archive / reports / ai-requests / fixture / artifact を混入させない。

本 Runbook は release の **手順とチェックポイント** を定義する。release の実行自体は本タスクの対象外（Level 4 個別承認で別途）。

## 2. 現在の環境構成

| 項目 | 値 |
|---|---|
| 開発統合 branch | `main` |
| 本番公開 branch | `production`（orphan、04C で作成、004D で検証、004E で Pages source 切替済み） |
| GitHub Pages source | `production:/` |
| default branch | `main` |
| production 初期 commit | `093cab0` |
| production tracked tree | `index.html` / `shogi_v4.html` の 2 件のみ |
| Pages URL | https://kazuo1970takahashi-sketch.github.io/shogi/ |
| Pages status | `built`（https_enforced=true、public=true、build_type=legacy） |
| 保険 branch | `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `7e30119`（remote 保持中） |
| 004C 残置 worktree | `../shogi-004c-production`（残存しているが **release Runbook では触らない**） |

## 3. release の基本原則

- production は main から **自動同期しない**
- production への反映は **明示承認時のみ**
- production には **allowlist 以外を入れない**
- production 反映前に **path-based 検査を必須化** する
- Pages source 切替は通常 release では **不要**（既に `production:/`）
- rollback 第一候補は **GitHub Pages 停止**
- `main:/` へ戻すのは **例外承認**（業務上の公開継続が必要、人間が再承認した場合のみ）

## 4. release 対象ファイル

### 現時点の production allowlist（v1）

- `index.html`
- `shogi_v4.html`

### 原則

release 時に production へ反映してよいのは、**この 2 ファイルのみ**。

将来、`assets/` / `css/` / `js/` / `images/` / `favicon.ico` / `manifest.json` 等を追加する場合は、**先に allowlist 更新タスクを切る**（推奨：004I）。Runbook 上で勝手に allowlist を増やさない。

## 5. release 前 precondition

release 開始前に以下を確認する。

- repo が `kazuo1970takahashi-sketch/shogi` であること
- `main` / `origin/main` が一致していること
- `production` / `origin/production` が一致していること
- default branch が `main` であること
- GitHub Pages source が `production:/` であること
- Pages `status` が `built` であること
- production branch PR が存在しないこと
- production branch に allowlist 2 件以外が含まれないこと（前回 release の tree を `git ls-tree` で確認）
- clean branch (`chore/shogi-tour-apphq-003h-2d-orphan-clean-base`) が remote に保持されていること
- working tree が安全であること（元 dir の untracked が release 用 worktree に影響しないこと）
- **004C 残置 worktree (`../shogi-004c-production`) を release 作業に使わないこと**

## 6. release 候補確認

main 側で何を production に出すか確認する。release 対象は **承認文で固定された approved main SHA**（Should Fix 1 反映）。

- **approved main SHA** の `shogi_v4.html` / `index.html` が release 対象（`origin/main` の現在 HEAD ではない）
- docs / test / data / fixture / workflow は production に出さない
- release 対象の変更内容確認は必要だが、**個人情報・実データ本文に関わるファイルは開かない**
- `shogi_v4.html` / `index.html` の差分確認は release 判断上必要な場合のみ許可

### 差分確認の向き（Should Fix 2 反映）

- 確認対象は **`index.html` / `shogi_v4.html` の 2 ファイルに限定** する（最重要）
- 向きを問う場合の基本は `git diff production..<approved-main-sha> -- index.html shogi_v4.html`（production 側を base、approved main 側を target に置き、release で何が来るかを見る向き）
- ただし重要なのは **向きではなく「対象 2 ファイル以外を見ない・出さない」** こと
- `git diff <approved-main-sha>..production -- index.html shogi_v4.html`（逆向き）でも、対象 2 ファイル限定であれば許容
- docs / test / data / workflow / fixture を差分対象に含めない（`-- index.html shogi_v4.html` の path 指定を必ず付ける）
- 全文閲覧は不要。差分本文を超えた閲覧（前後行つき `--unified=large` / `git show <sha>` 等）が必要なら別承認
- **対象 JSON / 旧 E2E spec / PR #169 / #174 diff 本文は引き続き表示しない**

## 7. production 反映方式

### 案A：production worktree で approved main SHA から allowlist 2 件のみ checkout

```
# <approved-main-sha> は release 承認文で固定されたもの。`main` symbolic ref は使わない。
git worktree add ../shogi-release-<task-id> production
cd ../shogi-release-<task-id>
git checkout <approved-main-sha> -- index.html shogi_v4.html
git status --short  # M index.html, M shogi_v4.html のみ
git add index.html shogi_v4.html  # 明示 path のみ、glob / -A / . 不可
git commit -m "release(apphq): <release task id> bring index.html and shogi_v4.html from main <approved-main-sha>"
```

**評価**：
- シンプル
- allowlist 2 件だけを反映しやすい
- 検査が path metadata 中心で済む
- approved main SHA を fix することで「release 承認後に main が進んで予期せぬ commit が流入する」事故を防げる
- **推奨**

### `main` symbolic ref を使わない理由（Should Fix 1 反映）

`git checkout main -- ...` を使うと、release 承認後に `origin/main` が新しい commit へ進んだ場合、その新 commit の `index.html` / `shogi_v4.html` が production に流入する。これは承認境界を破る。

そのため：
- release 承認文には **approved main SHA を必須で含める**
- release 作業開始時に `git rev-parse origin/main` と approved main SHA を照合する
- 不一致の場合（main が進んでいる場合）は **即停止して人間判断を仰ぐ**
- 進んだ main を反映したいなら、新しい release 承認を取り直す
- `git checkout main -- ...` ではなく `git checkout <approved-main-sha> -- ...` を **標準手順** とする

### 案B：orphan branch を作り直す

**評価**：
- clean だが毎回重い
- production 履歴が release ごとに壊れる
- 通常 release では不要（004C と同じ作業を毎回繰り返すのは過剰）

### 案C：main を merge する

**評価**：
- docs / test / data / workflow / fixture / CI 設定が混入するため **不可**
- 採用しない

### 推奨

**案A**。production worktree で allowlist 2 件のみ明示 checkout / stage / commit する。

## 8. release 作業手順

### release 承認文テンプレ固定項目（Nice to Have 1 反映）

release 実行（004F-1 系のタスク）を始める前に、承認文に以下を **すべて明記** すること。欠けていれば release を開始しない。

- **Task ID**: `SHOGI-TOUR-APPHQ-XXXX`（release ごとに固有）
- **approved main SHA**: `<full 40-char sha>`（release 対象として固定された main の commit）
- **current production SHA**: `<full 40-char sha>`（release 開始時点の production の commit）
- **release 対象ファイル**: `index.html` / `shogi_v4.html` のみ（追加・変更禁止）
- **allowlist 変更**: なし（v1 allowlist 2 件を維持）
- **denylist 変更**: なし
- **Pages source 変更**: なし（`production:/` のまま、切替を伴うなら別承認）
- **Pages source の現状**: `production:/`（変わらないことを承認文に明記）
- **production branch に反映するファイル**: 2 件のみ（`index.html` / `shogi_v4.html`）
- **`git add .` / `git add -A` / glob は禁止**（明示 path のみ）
- **release 実行**: **Level 4 個別承認**（`READY+MERGE+DELETE` バッチ対象外）
- **rollback**: **別承認**（第一候補 = GitHub Pages 停止）
- **`main:/` 戻し**: 原則禁止、例外時のみ別承認（業務上の公開継続が必要かつ人間が再承認した場合）

承認文に上記が揃っていない、または approved main SHA が full 40-char でない / production の現在 SHA と矛盾している / Pages の現状記述と実態が乖離している場合、release を開始しない。

### release 手順

1. **precondition 確認**（§5）
2. **approved main SHA 照合**：`git rev-parse origin/main` の出力が approved main SHA と完全一致することを確認。不一致なら即停止、人間判断を仰ぐ
3. **current production SHA 照合**：`git rev-parse origin/production` が承認文の current production SHA と一致することを確認
4. **isolated worktree 作成**：`git worktree add ../shogi-release-<task-id> production`
   - 既存 path との衝突確認
   - 004C 残置 worktree (`../shogi-004c-production`) は使わない
5. **production branch を checkout**（worktree 内で自動 attach）
6. **approved main SHA から allowlist 2 件のみ取り込む**：`git checkout <approved-main-sha> -- index.html shogi_v4.html`
   - **`main` symbolic ref は使わない**（承認後 main が進んでいると事故になる）
7. **stage path 確認**：`git status --short` で `M index.html` / `M shogi_v4.html` のみであることを確認
   - 他の path が現れていたら **即停止**
   - `git add .` / `git add -A` / glob は使わない
8. **明示 path で stage**：`git add index.html` / `git add shogi_v4.html`
9. **commit**：`git commit -m "release(apphq): <task id> bring index.html and shogi_v4.html from main <approved-main-sha>"`
10. **production tree path 確認**：`git ls-tree -r --name-only HEAD`
11. **allowlist 完全一致確認**：`/usr/bin/diff` による 2 件完全一致
12. **denylist no hit 確認**：path-grep のみ、本文 grep 不可（§9）
13. **危険 path NOT PRESENT 確認**：`git cat-file -e HEAD:<path>` で 12 件
14. **index.html 参照先確認**（§10）：限定 grep で参照属性のみ抽出
15. **release 前 HEAD ベースライン記録**（Nice to Have 2 反映、任意推奨）：push 前に root / `index.html` / `shogi_v4.html` の HEAD で `etag` / `last-modified` を記録しておく。release 後との比較に使う
16. **push**：`git push origin production`（force 不可、`-f` / `--force-with-lease` 不可）
17. **remote production SHA 確認**：`git ls-remote --heads origin production` で local と一致
18. **Pages auto-build 確認**：`gh api .../pages` の status を polling、`status=built` まで
19. **HEAD 確認**：`curl -I --max-time 20` で root / `index.html` / `shogi_v4.html` を **HEAD 200 必須確認**
    - `-L` 不可、body 取得不可、browser 表示不可、screenshot 不可
    - **任意推奨**：`etag` / `last-modified` が release 前ベースラインと変化していることを記録（Pages 反映確認の補助、絶対条件ではない）
20. **release 記録**（§12）
21. **isolated worktree 削除**：`git worktree remove ../shogi-release-<task-id>`
    - `--force` 不可（必要なら個別承認）、`rm -rf` 不可
22. **停止**

## 9. production path-based 検査

004D の検査を release 時にも **必須化** する。

### 必須検査

- `git ls-tree -r --name-only production`
- allowlist 完全一致（`/usr/bin/diff` による）
- denylist no hit（path-grep のみ、本文 grep 不可）
- `git cat-file -e` による危険 path NOT PRESENT
- `index.html` 参照先限定確認（§10）

### denylist

| 種別 | パターン |
|---|---|
| path prefix | `data/`, `data/import/`, `data/import/20260412_participants.json`, `test/`, `test/e2e/`, `test/e2e/shogi_phase2_import.spec.js`, `test/fixtures/`, `docs/`, `archive/`, `reports/`, `ai-requests/`, `.github/`, `playwright-report/`, `test-results/` |
| 単独 file | `HANDOFF.md`, `playwright.config.js`, `package.json`, `package-lock.json`, `.htmlvalidate.json` |
| 拡張子 | `*.csv`, `*.xlsx`, `*.pdf`, `*.zip`, `*.log`, `*.trace` |
| pattern | `backup`, `export`, `upload`, `archive`, `screenshots`, `snapshots` |

denylist hit があれば **即停止**、release を進めない。

### 危険 path NOT PRESENT（必須 12 件）

```
git cat-file -e HEAD:data/import/20260412_participants.json
git cat-file -e HEAD:test/e2e/shogi_phase2_import.spec.js
git cat-file -e HEAD:docs/
git cat-file -e HEAD:test/
git cat-file -e HEAD:.github/
git cat-file -e HEAD:package.json
git cat-file -e HEAD:package-lock.json
git cat-file -e HEAD:playwright.config.js
git cat-file -e HEAD:archive/
git cat-file -e HEAD:reports/
git cat-file -e HEAD:ai-requests/
git cat-file -e HEAD:HANDOFF.md
```

すべて NOT PRESENT を要求する。1 件でも PRESENT なら即停止。

## 10. index.html 参照先確認

004D と同じ方針。`index.html` に限り、以下の参照属性・参照構文だけを限定抽出する。

- `src=`
- `href=`
- `action=`
- `manifest=`
- `import`
- `url(`

### 推奨コマンド

```
grep -Eoi '(src|href|action|manifest)=["'\''][^"'\'']+["'\'']|import[[:space:]]+["'\''][^"'\'']+["'\'']|url\([^)]+\)' index.html
```

### 出力ルール

- 参照属性名 / 参照先 path / URL / hit 件数のみ
- **全文表示・前後行つき grep は禁止**（`-A` / `-B` / `-C` 不可）
- `cat` / `head` / `tail` / `less` / `sed -n` / parser / OCR 不可

### 判定

| 結果 | 判定 |
|---|---|
| 参照先が `shogi_v4.html` のみ | OK |
| fragment / same-page anchor / 空 `href` のみ | OK |
| 外部 URL（http:// / https://） | metadata として記録、必要なら停止して人間判断 |
| `.css` / `.js` / `.png` / `.jpg` / `.svg` / `.ico` / `.webmanifest` / `manifest.json` / `assets/` / `css/` / `js/` / `images/` / その他 allowlist 外相対 path | **NG、即停止** |

### NG 時

- `index.html` を変更しない
- allowlist を勝手に増やさない
- production branch を変更しない
- 報告して停止
- 後続タスクで「allowlist 拡張」または「`index.html` 修正」を判断する（004I）

## 11. Pages 確認

release push 後、Pages source は `production:/` のまま **維持される**。production push により GitHub Pages の auto-build が走る。

### 必須確認項目

- Pages metadata（`gh api .../pages`）
- `source = {"branch": "production", "path": "/"}` を維持
- `status = built`
- root / `index.html` / `shogi_v4.html` の HEAD 確認（`curl -I --max-time 20`）
- **HTTP status 200 を必須確認**
- body 取得なし、browser 表示なし、screenshot なし
- `-L` 不可、`curl -X GET` 不可、`wget` 不可
- response body stored: no

### 任意推奨：etag / last-modified の変化記録（Nice to Have 2 反映）

release 反映が CDN を含めて行き渡ったかの **補助確認** として、`etag` / `last-modified` の変化を記録する。

- release 前のベースライン（手順 §8-15 で記録した値）と release 後の HEAD 出力を比較
- `etag` が変化していれば、新しい build が配信されている強いシグナル
- `last-modified` が release commit / build 直後の時刻に更新されていれば、production からの新規 build である強いシグナル
- ただし：
  - `etag` / `last-modified` は **GitHub Pages / CDN の挙動に依存** する（cache hit / MISS、varnish age、CDN edge 反映遅延などで揺れる）
  - **絶対条件にしない**。HTTP 200 が必須、`etag` / `last-modified` 変化は補助
  - `x-cache: MISS` / `age: 0` も同様に補助シグナルとして記録可
- 記録形式（release 記録 §12 に取り込む）：
  ```
  URL                          | status | etag (post) | etag (pre)  | last-modified (post)
  /shogi/                      | 200    | <hash>      | <hash>      | <RFC1123>
  /shogi/index.html            | 200    | <hash>      | <hash>      | <RFC1123>
  /shogi/shogi_v4.html         | 200    | <hash>      | <hash>      | <RFC1123>
  ```
- body 取得 / browser 表示 / screenshot / Playwright での体感確認は **別承認**

### 注意

- 対象 JSON path への HEAD / GET は **不要**（`data/import/20260412_participants.json` は production にそもそも含まれない）
- raw.githubusercontent.com アクセス禁止

## 12. release 記録

release 後、以下を記録する。

| 項目 | 例 |
|---|---|
| release Task ID | SHOGI-TOUR-APPHQ-XXXX |
| **approved main SHA**（承認文で固定） | `<full 40-char sha>` |
| origin/main SHA（release 開始時点） | `<full 40-char sha>`（approved main SHA と一致したことを記録） |
| production commit SHA (release 前) | `<sha>` |
| production commit SHA (release 後) | `<sha>` |
| release 対象ファイル | `index.html`, `shogi_v4.html` |
| Pages source | `production:/`（変更なし） |
| Pages status | `built` |
| HEAD 確認結果（必須） | root: 200, index.html: 200, shogi_v4.html: 200 |
| HEAD 補助記録（任意推奨） | release 前後の `etag` / `last-modified` / `x-cache` |
| 承認者 | `<user>` |
| 実行日時 | `<YYYY-MM-DD HH:MM TZ>` |
| rollback 方針 | 第一候補：Pages 停止、第二候補：production rollback、例外：main:/ 戻し |
| 実行していないこと | force push なし / PR なし / main 変更なし / default branch 変更なし / Pages source 変更なし（既に production:/）/ 履歴改変なし / repo 移行なし / `git add .` `-A` glob 不使用 / `main` symbolic ref 不使用（approved main SHA 直接指定） |

### 記録場所案

- `docs/operations/release_logs/` などを後続検討（004F-2 で template 化）
- **release logs を production branch に含めない**（main にのみ commit、production には反映しない）

## 13. rollback 方針

004B-FIX1 §10 / §11 の方針を継承する。

### 第一候補

**GitHub Pages 停止**（公開面そのものを閉じる、最も安全）

### 第二候補

production branch を前 commit に戻す（production tree の修復）

### 例外

Pages source を `main:/` に戻す。本番 / テスト分離後にこれを選ぶのは、業務上の公開継続が必要で、かつ人間がリスクを再承認した場合のみ。

### 共通

- すべての rollback は **Level 4 個別承認**
- `READY+MERGE+DELETE` バッチ対象外
- rollback で production branch / clean branch を削除する場合は 004B-FIX1 §14「branch 削除安全チェック」を必須化（完全一致 + 保護名拒否 + PR head 一致 + clean branch 例外）

## 14. 承認レベル

| 対象 | Level |
|---|---|
| release 設計 docs（本 Runbook、template 等） | Level 1 |
| production へ反映する release 実行 | **Level 4** |
| Pages 確認（metadata / HEAD のみ） | release 承認内で可 |
| Pages source 変更 | **Level 4**（rollback / 環境分離見直し時のみ） |
| rollback（Pages 停止 / production rollback / main:/ 戻し） | **Level 4** |
| allowlist 拡張（assets / css / js / images / manifest / favicon 等の追加） | Level 3〜4（追加対象による） |

## 15. 事故りそうな要素

| # | 事故 | 緩和 |
|---|---|---|
| 1 | main を production に merge してしまう | release 手順 §7-§8 で「main merge は不可」を明示、案A（明示 path checkout）を必須化 |
| 2 | `git add .` / `-A` / glob を使う | §8 手順 5-6 で明示 path のみ、検査で stage path を `git status --short` で確認 |
| 3 | docs / test / data を production に混ぜる | denylist + 危険 path NOT PRESENT 必須、§9 で 30 件以上のパターンを path-grep |
| 4 | allowlist を勝手に広げる | Runbook 上での allowlist 拡張禁止、別タスク（004I）で承認 |
| 5 | Pages source を `main:/` に戻してしまう | rollback §13 で「例外扱い、人間再承認必須」と明記 |
| 6 | release 記録を production に入れてしまう | §12「release logs を production branch に含めない」を明記、記録場所は main の `docs/operations/release_logs/` |
| 7 | 004C 残置 worktree を誤って使う | §5 precondition で「使わない」、§8 で別 path (`../shogi-release-<task-id>`) を指定 |
| 8 | production branch 削除事故 | 004B-FIX1 §14 を必須化（保護名 `production` で削除拒否） |
| 9 | branch 名 typo（`production` vs `productiom` 等） | 削除時は変数化 + 完全一致確認、削除前に PR head と一致確認 |
| 10 | rollback 時に main を壊す | branch 削除安全チェック必須、main は default branch として保護名扱い |
| 11 | release 中に作業 worktree を `rm -rf` で削除 | `rm -rf` 禁止、`git worktree remove` を使う、`--force` も別承認 |
| 12 | release push で auto-build が走らず古い tree が公開されたまま | push 後の HEAD 確認で `last-modified` / `etag` 変化を metadata で確認 |

## 16. 004C 残置 worktree の扱い

`../shogi-004c-production` は **004C で残置された worktree**。

- release Runbook では **使わない**
- 削除する場合は **別タスク（004H）で扱う**
- 削除には `git worktree remove --force` が必要になる可能性があるため、個別承認が必要
- **`rm -rf` は禁止**

## 17. 後続タスク

| Task ID | 範囲 |
|---|---|
| SHOGI-TOUR-APPHQ-004F | production release Runbook 作成（本タスク） |
| SHOGI-TOUR-APPHQ-004F-1 | release 実行テンプレート作成（承認文テンプレ、checkpoint 一覧） |
| SHOGI-TOUR-APPHQ-004F-2 | release log テンプレート作成（`docs/operations/release_logs/` の構造設計） |
| SHOGI-TOUR-APPHQ-004G | 本番 / テスト分離運用テンプレート整備（staging 検討含む） |
| SHOGI-TOUR-APPHQ-004H | 004C 残置 worktree cleanup（`git worktree remove --force` の Level 4 個別承認） |
| SHOGI-TOUR-APPHQ-004I | production allowlist 拡張判断（assets / css / js / images / manifest / favicon 追加の検討） |

## 18. Done 条件

- release の目的が明確
- production 反映方式（案A 推奨）が明確
- allowlist / denylist が明確
- release 前後の検査（path metadata + 限定参照 grep + HEAD のみ）が明確
- Pages 確認（metadata / HEAD のみ、body 取得・browser 表示・screenshot 禁止）が明確
- rollback 方針（第一候補は Pages 停止）が明確
- Level 4 境界（release 実行 / Pages source 変更 / rollback / allowlist 拡張）が明確
- 004C 残置 worktree を使わない方針が明確
