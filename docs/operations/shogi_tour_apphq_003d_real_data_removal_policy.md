# SHOGI-TOUR-APPHQ-003D｜実データ確定時の撤去・架空化方針

Task ID：SHOGI-TOUR-APPHQ-003D  
Task Name：実データ確定時の撤去・架空化方針作成  
Project ID：SHOGI-TOUR  
Parent Project ID：APP-HQ  
Repo：kazuo1970takahashi-sketch/shogi  
種別：docs-only / 方針文書 新規作成  
関連：SHOGI-TOUR-APPHQ-003、003A、003B、003C、008

---

## 0. この文書の位置づけ

本文書は、SHOGI-TOUR-APPHQ-003B（値非表示構造確認）および SHOGI-TOUR-APPHQ-003C（人間ローカル確認による A 判定）を経て、`data/import/20260412_participants.json` が**実データ確定**となったことを受け、対象ファイルの撤去・架空化方針を docs-only で定めるものである。

本文書の作成時点で、対象 JSON の中身は AI 側では確認していない。本文書も実値を記載しない。  
本文書は方針整理であり、実際の撤去・置換・削除・履歴改変はいずれも本文書では実行しない。

APP-HQ の方針に従い、氏名のみでも個人情報として扱う。本件は氏名に加え住所・最終クラス・最終対局日が含まれていることが 003C で確認されたため、個人情報・個人関連情報を含む実データとして扱う。

---

## 1. 目的

本タスク SHOGI-TOUR-APPHQ-003D は、`data/import/20260412_participants.json` が実データ確定となったことを受け、対象ファイルの撤去・架空化方針を定める文書である。

本文書は、実データを表示せずに以下を整理する。

- 現在のリスク
- 即時対応方針
- repo 上の撤去方針
- 代替の完全架空データ方針
- Git 履歴対応の扱い
- GitHub Pages 公開済み影響の扱い
- 後続タスクの順序

---

## 2. 判定結果

| 区分 | 結果 |
|---|---|
| SHOGI-TOUR-APPHQ-003B（値非表示構造確認） | 実データ疑い継続（強い疑い） |
| SHOGI-TOUR-APPHQ-003C（人間ローカル確認） | **A 実データ確定** |
| 含まれていた項目種別 | 氏名 / 住所 / 最終クラス / 最終対局日 |
| AI への実値共有 | なし |
| 本文書への実値記載 | なし |

---

## 3. リスク評価

- 氏名のみでも個人情報として扱う（APP-HQ 方針）。
- 本件は氏名に加え、住所・最終クラス・最終対局日が含まれている。
- 住所を含むため個人情報リスクは高い。
- 最終クラス・最終対局日は、特定個人の大会参加履歴・活動履歴と結びつく個人関連情報になり得る。
- 対象ファイルは `main` で追跡されており、GitHub Pages 公開 repo に含まれている可能性がある（公開影響は 003G で別途確認）。
- Git 履歴にも追加 commit が残っている（003B 確認時点で history count = 1、status = A）。
- 対象ファイルの**現行 tree からの撤去は必要**。
- Git 履歴改変は Level 4 相当のため、本文書では撤去手段としては採用せず、別判断（003E）に分離する。

---

## 4. 即時対応方針

判定確定時点から、以下を即時に遵守する。

- これ以上、対象 JSON の値を AI へ共有しない。
- 対象 JSON をサンプルデータ・fixture・テストデータとして使わない。
- 対象 JSON を今後の AI レビュー、E2E、VRT、デバッグに使わない。
- 対象 JSON を新しいテスト環境にコピーしない（ローカル含む）。
- 対象 JSON の内容を PR 本文・コメント・docs に引用しない。
- まず repo 上から**撤去または完全架空データへ置換**する。
- 置換する場合は**完全架空データ**のみ使う。
- 本番データの**匿名化・仮名化データを代替にしない**（再識別リスクのため）。

---

## 5. 推奨対応案

| 案 | 内容 | メリット | デメリット | 推奨度 |
|---|---|---|---|---|
| A | 対象 JSON を repo から削除する（`git rm` + 通常 PR） | 実データを現行 tree から除去できる | そのファイルを使う import 動線やテストがある場合に影響する可能性 | **高** |
| B | 完全架空データに置換する | import サンプルが必要な場合に機能確認を残せる | 架空データ設計が必要（003F） | 中〜高 |
| C | `data/import/` から `test/fixtures/` 等へ架空データとして移動する | 用途が明確になる | 既存参照の確認が必要、依然として架空データ作成が必要 | 中 |
| D | 現状維持 | なし | 個人情報を含む実データが repo に残る | **不可** |

**推奨方針**：

- 短期は **案 A または案 B**。
- 実装影響が不明なら、先に**参照確認（003D-1）**を行い、対象 JSON が**未参照なら案 A（削除）を優先**。
- 参照があるなら**案 B（完全架空データへの置換）を検討**。
- いずれの場合も、Git 履歴対応（003E）と GitHub Pages 公開影響確認（003G）は別判断・別承認とする。

---

## 6. 実施前に必要な確認

撤去 / 置換 PR を起こす前に、以下を**値非表示で**確認する。

- `shogi_v4.html` から対象 JSON を参照しているか
- `test/` / E2E / `playwright.config.js` / fixtures から対象 JSON を参照しているか
- `docs/` から対象 JSON をサンプルとして参照しているか
- `data/import/` 配下の用途が定義されているか
- GitHub Pages で対象 JSON に直接アクセス可能か（**HEAD / メタ情報確認のみ。本文取得・表示・保存はしない。**詳細は 8.1 参照）
- GitHub Pages 公開影響があるか（影響評価は 003G。ただし 003G を待って現行公開からの撤去を遅らせない。詳細は 8.2 参照）
- 削除した場合にテストが壊れるか（CI 影響）
- 架空データが必要か（業務的に import サンプルが必須か）

注意：

- **確認時も実値を表示しない**。
- 参照確認はパス名検索（`grep -rl '20260412_participants'` 等、ファイル名・パスでの検索）のみで行い、JSON 本文は開かない。
- 参照箇所のコンテキストを読む場合も、対象 JSON 自体は開かない。

---

## 7. Git 履歴対応の扱い

- **現行 tree からの撤去**と、**Git 履歴からの除去**は分けて判断する。
- まず通常 PR（base=main、通常 push、squash merge）で現行 tree から撤去または完全架空データへ置換する。
- Git 履歴対応は **SHOGI-TOUR-APPHQ-003E** で別途判断する。
- Git 履歴改変（`git filter-repo`、`git filter-branch`、interactive rebase + force push、BFG 等）、force push はいずれも **Level 4 相当**。
- Git 履歴改変は標準 Approval Phrase では解除不可。
- 履歴改変が必要な場合は、以下を明示した別 Runbook（003E）が必要：
  - 影響範囲（変更対象 commit、影響 branch、forks の有無）
  - rollback 方針
  - 関係 branch / open PR の rebase 計画
  - GitHub Pages 公開影響
  - 関係者通知計画

---

## 8. GitHub Pages 公開済み影響

- 対象 JSON が GitHub Pages 経由で公開されている可能性がある（SHOGI-TOUR は `main` merge が公開へ反映される運用）。
- 公開 URL に直接アクセスできる場合、**現行 tree から削除しても過去履歴・キャッシュには残る**。
- まず**現行公開からの撤去を優先**する（案 A または案 B のいずれの場合も、merge により公開反映され現行公開コンテンツから消える）。
- 公開済み影響、CDN / ブラウザキャッシュ、過去 commit URL（`raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>` 等）、fork / clone 済みデータ、Wayback 等のアーカイブの扱いは別判断（003G）。
- **本文書では公開 URL 経由での実データ確認は行わない**（実値を取得することになるため）。
- GitHub Pages 設定変更は今回行わない。

### 8.1 公開有無確認の方法（HEAD / メタ情報限定）

GitHub Pages 上で対象ファイルが公開されているかを確認する場合、本文取得を避けるため、以下のように HEAD リクエストやメタ情報確認に限定する。

- 原則として **HTTP HEAD リクエスト**または**メタ情報確認**のみを用いる（例：`curl -I <url>`、`curl --head <url>`、`curl -sS -o /dev/null -w '%{http_code} %{content_length} %{content_type}\n' --head <url>`）。
- **本文（response body）を表示しない**（`curl <url>` を素のまま実行しない、`-o -` や標準出力リダイレクトで本文を流さない）。
- **本文をファイルへ保存しない**（`curl -O`、`curl -o file`、`wget` 等の本文保存は禁止）。
- 標準出力に本文を出さない（pager、ターミナル履歴、画面共有経由の漏えい防止）。
- 確認に使ってよいのは、**HTTP status、Content-Length、Content-Type、Last-Modified、ETag** などのメタ情報のみ。
- 公開有無確認の段階でも、**実データ内容を取得・表示・保存しない**。
- ブラウザで開く場合は、URL バーへ直接入力する操作で公開有無のみを判別する用途に限定し、ページ本文の閲覧・スクロール・スクリーンショット・コピーは行わない（実値取得に該当）。

### 8.2 003G と現行公開からの撤去の優先順位

- **SHOGI-TOUR-APPHQ-003G（GitHub Pages 公開済み影響確認）は、撤去 PR の前後どちらで実施してもよい。**
- ただし、**003G の完了を待つことを理由に、現行 tree / 現行公開からの撤去を不必要に遅らせない**。
- 個人情報を含む実データが現行 tree に残り続けるリスクの方が、公開済み影響確認の事前完了よりも優先される。
- 推奨運用：
  - 003D-1（参照確認）→ 003D-2（撤去 PR）を先行させ、できるだけ早く現行 tree / 現行公開から実データを取り除く。
  - 003G（履歴・キャッシュ・過去 commit URL / fork / アーカイブの影響評価）は、撤去 PR の前後どちらでも並行・後続で実施してよい。
- ただし 003G の結果次第で履歴改変（003E）の要否判断が変わるため、撤去 PR と 003E の間で必ず実施する。

---

## 9. 後続タスク候補

| Task ID | 内容 | Risk Level |
|---|---|---|
| SHOGI-TOUR-APPHQ-003D-1 | 対象 JSON の参照確認（パス検索のみ、値非表示） | Level 3 |
| SHOGI-TOUR-APPHQ-003D-2 | 対象 JSON の現行 tree からの撤去 PR（案 A） | Level 3 |
| SHOGI-TOUR-APPHQ-003D-3 | 完全架空 import サンプルの要否判断 | Level 3 |
| SHOGI-TOUR-APPHQ-003E | Git 履歴対応要否判断 | Level 4 |
| SHOGI-TOUR-APPHQ-003F | 完全架空サンプルデータ作成（必要な場合） | Level 3 |
| SHOGI-TOUR-APPHQ-003G | GitHub Pages 公開済み影響確認 | Level 4 候補 |

推奨実施順（実装影響が不明な場合）：

1. **003D-1**：参照確認（値非表示）
2. **003D-3**：架空サンプル要否判断（参照確認結果を踏まえて）
3. **003D-2** または **003F → 003D-2**：撤去 PR（未参照なら削除、参照ありなら架空データ作成後に置換）
4. **003G**：GitHub Pages 公開影響確認（撤去 PR の前後どちらでも実施可。**003G を待って現行公開からの撤去を遅らせない**。詳細は 8.2 参照）
5. **003E**：Git 履歴対応要否判断（最後、別 Runbook + Level 4 承認。003G の結果を踏まえて要否判断）

---

## 10. Risk Level

| 作業 | Risk Level |
|---|---|
| 本方針文書作成（docs-only、実データ・個人情報・公開影響に関わる） | Level 3 相当 |
| 参照確認（パス検索のみ、値非表示） | Level 3 |
| 現行 tree からの削除（案 A） | Level 3 |
| 完全架空データへの置換（案 B） | Level 3 |
| GitHub Pages 公開済み影響確認 | Level 4 候補 |
| Git 履歴改変 / force push | Level 4 |

---

## 11. Approval Phrase / 承認条件

- 本方針文書作成は docs-only だが **Level 3 相当**として扱う。
- **現行 tree からの削除・置換は、通常の Ready 化 / merge / branch 削除用 Approval Phrase だけでは解除不可。** 実データ確定ファイルの撤去・置換は、以下を満たす**別承認**を必要とする：
  - 専用タスク ID（例：003D-2）の起票
  - 専用 Runbook の作成
  - 対象ファイル・パスの明示
  - 実行範囲の明示
  - rollback 方針の明示
  - 影響範囲（参照箇所 / CI / 公開影響）の明示
  - 人間による明示承認
- 削除・置換 PR そのものを merge する場合も、**docs-only PR より高い確認密度**で扱う（差分の値非表示性、参照箇所の影響、CI 結果、GitHub Pages 反映影響を個別確認）。
- 標準 Approval Phrase（例：「APPROVE … READY ONLY」「… SQUASH MERGE ONLY」「… DELETE MERGED BRANCH ONLY」）で許可されるのは、その**専用タスクで人間が明示した範囲に限る**。Phrase の存在だけで撤去操作を解除しない。
- **Git 履歴改変・force push** はさらに別の **Level 4 相当**承認とする。標準 Approval Phrase では解除不可。専用 Runbook + 明示承認 + 影響評価が必要。
- **GitHub Pages 公開済み影響対応** も別 Runbook と Level 4 相当の人間承認が必要。
- **実データの値確認は人間ローカル限定**（AI セッションには実値を渡さない）。
- AI には実値を渡さない方針を継続する（003C 以降同様）。

---

## 12. 今回やらないこと

本タスク SHOGI-TOUR-APPHQ-003D は docs-only の方針文書作成タスクであり、以下は本タスクの範囲外である。

- 対象 JSON の値表示
- 対象 JSON の編集
- 対象 JSON の削除
- 完全架空データ作成（003F の責務）
- Git 履歴改変
- force push
- GitHub Pages 設定変更
- 公開 URL 経由での実データ確認
- 実データのコピー（ローカル含む）
- AI への実値共有
- 既存参照箇所の特定実行（003D-1 の責務）

---

## 13. 参考

- SHOGI-TOUR-APPHQ-003：data/import 取扱い判定 Runbook（`docs/operations/shogi_tour_apphq_003_data_import_runbook.md`）
- SHOGI-TOUR-APPHQ-003A：data/import 値非表示・構造確認手順（`docs/operations/shogi_tour_apphq_003a_data_import_structure_check.md`）
- SHOGI-TOUR-APPHQ-003B：値非表示・構造確認実施（チャット内レポート、ドキュメント化はしていない）
- SHOGI-TOUR-APPHQ-003C：人間ローカル判定（チャット内レポート、ドキュメント化はしていない）
- SHOGI-TOUR-APPHQ-008：環境分離方針（`docs/operations/shogi_tour_apphq_008_environment_separation.md`）
