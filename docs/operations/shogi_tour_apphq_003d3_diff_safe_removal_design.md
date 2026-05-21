# SHOGI-TOUR-APPHQ-003D-3｜実データ確定JSONのdiff露出なし撤去方式 設計

- Task ID: SHOGI-TOUR-APPHQ-003D-3
- 対象プロジェクト: SHOGI-TOUR｜将棋大会運営アプリ
- 親プロジェクト: APP-HQ｜全アプリ開発司令塔
- Repo: kazuo1970takahashi-sketch/shogi
- 作成日: 2026-05-21
- 文書種別: 設計（docs-only）
- 状態: ドラフト

---

## 1. 目的

本文書は、実データ確定 JSON `data/import/20260412_participants.json` を、GitHub の PR diff・PR 本文・コメント・レビュー結果・通知・キャッシュ等に **実データ本文を露出させず** に SHOGI-TOUR repo 現行 tree から撤去するための方式を設計する。

本文書では以下を整理する。

- 通常の削除 PR が危険な理由
- E2E が実データ JSON に依存している問題
- diff 露出なし撤去に必要な前提
- 採用候補方式（A〜F）
- 推奨手順
- 後続タスクの順序と注意点
- Git 履歴対応との関係
- GitHub Pages 公開済み影響との関係
- Risk Level と承認境界

本文書は **設計のみ** であり、対象 JSON の削除・置換・履歴改変・force push・E2E 修正・GitHub Pages 操作は一切行わない。

---

## 2. これまでの判定と経緯

| Task ID | 内容 | 判定・結果 |
|---|---|---|
| SHOGI-TOUR-APPHQ-003B | 値非表示構造確認 | 実データ疑い継続（強い疑い） |
| SHOGI-TOUR-APPHQ-003C | 人間ローカル判定 | **A 実データ確定** |
| SHOGI-TOUR-APPHQ-003D | 撤去・架空化方針作成 | 方針確定（docs-only） |
| SHOGI-TOUR-APPHQ-003D-1 | 参照確認（read-only） | 対象 repo 取り違え（app-hq で実行）→ 003D-2 で SHOGI repo にて再実行・整合確認済 |
| SHOGI-TOUR-APPHQ-003D-2 | 通常 git rm 削除 PR 試行 | **No Go**（PR #169 / Closed / Not Merged / branch 削除済） |

含まれていた項目種別（実値は本文書および AI に共有していない）:

- 氏名
- 住所
- 最終クラス
- 最終対局日

PR #169 が No Go となった理由:

1. 通常の `git rm` 削除 PR では、GitHub PR diff 上に削除前 JSON 本文が表示される可能性が高い
2. `test/e2e/shogi_phase2_import.spec.js` が対象ファイルを直接参照しており、E2E が `ENOENT` で失敗

現在の状態（本文書作成時点）:

- PR #169: CLOSED / Not Merged / branch（remote + local）削除済み
- 対象 JSON `data/import/20260412_participants.json`: **main に残存 / git tracked**
- main HEAD: `c7fedd8`
- 実データ撤去は未実施

---

## 3. 通常削除 PR の問題

通常の `git rm <path>` による削除 PR には次の問題がある。

- GitHub の PR diff は、削除されたテキストファイルについて削除前の本文を red 表示で **PR ページ上に展開する**。実データを削除するための PR が、かえって実データを GitHub 上に **露出させる** 危険が高い。
- PR diff は以下の経路で残存・拡散しうる。
  - GitHub PR ページ本体
  - PR レビューコメント・サジェスト
  - GitHub 通知メール（HTML 本文）
  - GitHub Webhook / 連携サービス（CI ログ、Slack、Linear、ChatOps 等）
  - ブラウザキャッシュ・スクリーンショット
  - 検索結果（社外向けには既定で非公開だが、Public repo では公開）
- 一度 PR diff として露出した内容は、PR を後から Close / 削除しても、上記の派生コピーには残る可能性がある。
- 削除側で JSON を空にしてから commit しても、history 上の元 commit に本文が残るため、history 越しの diff（compare URL 等）から再表示できる。

したがって **実データ確定ファイルを通常の削除 PR で扱うことは採用不可** とする。今後、実データ確定ファイル相当を削除する場合は、PR diff 露出を事前に評価する必要がある。

---

## 4. E2E 依存の問題

- `test/e2e/shogi_phase2_import.spec.js` が `20260412_participants.json` を参照していることが SHOGI-TOUR-APPHQ-003D-2 の参照確認で判明している（一致行は表示せずファイル名のみで確認）。
- 対象 JSON を削除すると当該 E2E が `ENOENT` で失敗する（PR #169 のレビューで指摘済み）。
- 実データファイルを E2E fixture として参照している状態自体が不適切である。
- したがって、撤去の前に **E2E の実データ依存を外す** 必要がある。
- E2E 修正時にも対象 JSON の本文は開かない。
- 完全架空 fixture への置換、あるいは当該テストの一時 skip / 削除のいずれを採用するかは別タスク（003D-4）で判断する。

---

## 5. diff 露出なし撤去の候補方式

| 案 | 概要 | 評価 | メリット | デメリット・リスク |
|---|---|---|---|---|
| A | GitHub 上で通常 PR 削除（`git rm`） | **不可** | 手順が単純 | 削除 diff に実データ本文が GitHub 上で表示される。すでに 003D-2 で No Go 判定済。 |
| B | 通常 PR で空ファイルまたは伏せ字ファイルに置換 | **原則不可 / 要注意** | tree 上には残るが値は消える | 置換 diff に削除前本文が表示される可能性。さらに history に元本文が残り、compare URL 等から再表示可能。 |
| C | E2E 依存解除後、履歴対応 Runbook と合わせて `git filter-repo` 等で対象ファイルを **履歴ごと除去** | **候補（Level 4）** | 履歴からも対象ファイルを除去可能。リポジトリ上の痕跡を最小化できる。 | force push 必須、全 branch 影響、全 clone 影響、GitHub Pages 影響、全開発者と CI / 連携系への周知が必要。すでに公開済み内容の派生コピーは消せない。 |
| D | 新規 clean repo / orphan branch / sanitized import で再公開系を再構成 | **候補（Level 4）** | 実データを含まないクリーンな公開系を作れる。Pages の公開ソースを差し替えやすい。 | 移行コスト大。GitHub Pages 設定、branch 保護、既存 PR・履歴との関係整理、Issue / PR 番号や CI バッジの取り扱いが必要。 |
| E | GitHub Pages 公開系のみを安全な別 branch に切り替え、main 履歴対応は別途判断 | **候補（Level 4 候補）** | 外部公開面からの実データ除去を **先に** 実現できる。Risk Level を段階的に下げられる。 | **GitHub Pages 設定変更（公開 source branch 切替）を伴うため Level 4 候補として扱う**。main 履歴問題は残るため、履歴対応要否判断（案 C 系）とは分離して扱う必要がある。Pages 反映ラグ・公開 URL 切替・外部リンク・キャッシュ・CI 連携への影響評価が必要。 |
| F | Private 化または公開停止を一時的に検討 | **緊急時候補** | 外部公開リスクを短時間で大幅に下げられる | 運用影響が大きい。SHOGI-TOUR 利用者・関係者への影響を伴う。通常タスク範囲外であり、明示承認と上位判断が必要。 |

採用判断の基本方針:

- 案 A・B は実データ露出につながるため採用しない。
- 案 C・D は Level 4 の履歴対応・公開系再構成を伴うため、専用 Runbook と明示承認をもって別タスクで検討する。
- 案 E は「外部公開面の実データ撤去を先行」するための段階的アプローチとして有力。ただし repo 履歴側の対応は残る。
- 案 F は外部露出インシデント等の緊急時の選択肢として保持し、平時タスクでは選ばない。

---

## 6. 推奨方針

### 短期推奨（直近で進めるべき順）

1. **E2E の実データ依存を外す**（後続タスク 003D-4）。
2. **完全架空 fixture を作る**、または当該 E2E を一時停止する（後続タスク 003F・003D-4）。
3. その上で、**履歴対応**（案 C）または **公開系再構築**（案 D / E）の方式を選ぶ。

#### E2E の一時 skip / 削除に関する注意（テスト負債化の防止）

- E2E の一時 skip / 削除は、実データ fixture 依存を止めるための **短期策として許容し得る**。
- ただし、長期的には **完全架空 fixture で E2E を復元する** ことを前提とする（テスト負債として放置しない）。
- 003D-4 では、一時 skip / 削除を採用する場合に **復元条件または期限** を明記する。例:
  - 「003F の完全架空 fixture 作成完了後に再有効化する」
  - 「SHOGI-TOUR-APPHQ-003F の merge をブロッキングとして再有効化する」
  - 「一時 skip 期限を `<YYYY-MM-DD>` までとし、期限超過時は復元計画を再評価する」
  - skip / 削除した spec ファイルに `// TODO: SHOGI-TOUR-APPHQ-003F 完了後に復元` 等のテスト負債マーカーを残す
- 復元条件・期限のないまま skip / 削除を放置することは **禁止**。

### 中期推奨

- GitHub Pages 公開系を、実データを含まない tree から再構成する（案 D または E）。
- main merge と Production publish を分離し、公開する tree を明示的に限定する（後続タスク 008D に接続）。
- テスト・E2E・VRT には完全架空データのみを使う運用に切り替える（後続タスク 003F）。

### 直近で **しない** こと

- 通常の削除 PR の再試行（案 A）
- 空ファイル / 伏せ字置換 PR の試行（案 B）
- force push / 履歴改変（案 C の実行）
- GitHub Pages 設定変更（案 D / E の実行）
- 公開停止 / Private 化（案 F）

---

## 7. 推奨する後続タスク順序

| 順 | Task ID | 内容 | Risk Level |
|---|---|---|---|
| 1 | SHOGI-TOUR-APPHQ-003D-4 | E2E の実データ依存解除方針 | Level 3 |
| 2 | SHOGI-TOUR-APPHQ-003F | 完全架空 fixture / sample data 作成方針 | Level 3 |
| 3 | SHOGI-TOUR-APPHQ-003E | Git 履歴対応要否判断 | Level 3〜4 |
| 4 | SHOGI-TOUR-APPHQ-003G | GitHub Pages 公開済み影響確認 | Level 4 候補 |
| 5 | SHOGI-TOUR-APPHQ-003H | 実データ撤去実行 Runbook | Level 3〜4 |
| 6 | SHOGI-TOUR-APPHQ-008B | localStorage key 分離設計 | Level 3 |
| 7 | SHOGI-TOUR-APPHQ-008D | テスト URL / 公開系分離方式検討 | Level 3〜4 |

順序の意図:

- 1〜2 で E2E を実データから切り離し、削除後に CI が落ちない状態を先に作る。
- 3 で履歴対応の要否（Level 4 を払う価値があるか）を判断する。
- 4 で公開済み影響の規模（既に外部に出ている範囲）を確認する。
- 5 で実データ撤去の実行 Runbook を確定する。
- 6〜7 で SHOGI-TOUR 側の運用基盤（localStorage 分離・公開系分離）を整え、再発防止の足場にする。

---

## 8. 後続タスク別の注意点

### 003D-4（E2E の実データ依存解除方針）

- `test/e2e/shogi_phase2_import.spec.js` の参照を外すことが目的。
- 対象 JSON を開かない。
- 実データを fixture として使わない。
- E2E を通すために実データを再導入しない。
- skip / 削除 / 完全架空 fixture 差し替えのうちどれを採用するかを明文化する。
- **一時 skip / 削除を採用する場合は、復元条件または期限を必ず明記する**（テスト負債化を防止するため）。
  - 例: 「SHOGI-TOUR-APPHQ-003F 完了後に再有効化する」「`<YYYY-MM-DD>` までに復元する」「003F merge をブロッキングとする」など、復元責任者・復元タイミング・復元方式が一意に特定できる条件を設ける。
  - skip / 削除した spec には負債マーカー（コメント / TODO / issue 参照）を残す。
  - 復元条件・期限のないまま skip / 削除を merge することは **不可** とする。

### 003F（完全架空 fixture / sample data 作成方針）

- 完全架空データのみ作成する。
- 本番データの匿名化・仮名化（同一構造のままの置換）は **使わない**（再識別リスクを残すため）。
- 実大会日付・実支部・実参加者と誤認されない命名規則・値域を定義する。
- 例: 大会日付は将来日付ではなく架空年・架空月、参加者名は明らかに架空の語幹を使う、住所は架空地名のみ、等。

### 003E（Git 履歴対応要否判断）

- Git 履歴改変は **Level 4**。
- force push、branch 整理、clone 再作成、CI / 連携系再構築、GitHub Pages 影響、全開発者周知を含めて判断する。
- 判断材料: 公開済み範囲、外部派生コピーの有無、利害関係者への影響、撤去価値とコストの比較。

### 003G（GitHub Pages 公開済み影響確認）

- GitHub Pages 確認は **HEAD / メタ情報限定**。
- 本文取得・表示・保存・スクリーンショット保存は禁止。
- 外部キャッシュ（検索エンジン、Web Archive 等）への取り扱いは別途判断。

### 003H（実データ撤去実行 Runbook）

- 実データ撤去実行は **専用 Runbook**・**明示承認**・**rollback 方針** が必須。
- PR diff 露出を事前検証する。
- 通常 PR を使う場合は、GitHub 上に本文が出ないことを確認できる方式に限る（本文書 §5 の評価を満たすこと）。
- 実行前に確認する項目: 対象ファイル、実行方式、影響範囲、rollback、実行者、所要時間、関係者通知。

---

## 9. Risk Level

| 項目 | Risk Level | 備考 |
|---|---|---|
| 本設計文書作成（本タスク） | **Level 3 相当** | docs-only だが、実データ撤去方式・公開影響・履歴対応に関わるため |
| E2E 依存解除方針（003D-4） | Level 3 | テスト範囲のみだが、実データ確定ファイルの取り扱いに直結 |
| 完全架空 fixture 作成（003F） | Level 3 | 公開アプリ挙動には影響しないが、再識別リスク回避設計が必要 |
| GitHub Pages 公開済み影響確認（003G） | **Level 4 候補** | 公開系・外部キャッシュに関わる |
| Git 履歴改変 / force push（003E 実行） | **Level 4** | 全 branch・全 clone・CI / 連携系・GitHub Pages 影響 |
| 新規 clean repo / orphan branch / 公開系再構成（案 D） | **Level 4 候補** | リポジトリ構造そのものの変更 |
| 実データ撤去実行（003H） | **Level 3〜4** | 採用方式に依存 |

---

## 10. Approval Phrase / 承認境界

- 本設計文書作成は docs-only だが **Level 3 相当**。Draft PR 作成までを本タスクの範囲とし、Ready 化・merge は別承認。
- E2E 依存解除（003D-4）は **別 PR・別承認**。
- 完全架空 fixture 作成（003F）は **別 PR・別承認**。
- **Git 履歴対応は標準 Approval Phrase では解除不可**。
  - force push / `git filter-repo` / `git filter-branch` / orphan branch 化 / GitHub Pages 設定変更 等は **Level 4 相当** で、専用 Runbook と明示承認が必要。
- 実データ撤去実行（003H）は、通常の Ready 化 / merge 承認だけでは不十分。以下を明示した上での承認が必要:
  - 対象ファイル
  - 実行方式（採用した案）
  - 影響範囲（branch / Pages / 連携系 / 公開済み範囲）
  - rollback 手順
  - 実行者
  - 確認項目（PR diff 露出有無、CI 状態、Pages 反映状態、関係者通知）

---

## 11. 今回（003D-3）でやらないこと

- `data/import/20260412_participants.json` の削除
- `data/import/20260412_participants.json` の置換
- `data/import/20260412_participants.json` の本文表示
- `test/e2e/shogi_phase2_import.spec.js` の修正
- 完全架空 fixture / sample data の作成
- Git 履歴改変（`filter-repo` / `filter-branch` / rebase 履歴書換 等）
- force push
- GitHub Pages 設定変更
- clean repo / orphan branch 作成
- 公開 URL 本文確認・スクリーンショット保存
- 実データ撤去実行
- 本タスク branch の Ready 化 / merge / 削除

---

## 関連タスク

- [SHOGI-TOUR-APPHQ-003｜実データ確定時の撤去・架空化方針](./shogi_tour_apphq_003_data_import_runbook.md)
- [SHOGI-TOUR-APPHQ-003A｜data import 構造確認手順](./shogi_tour_apphq_003a_data_import_structure_check.md)
- [SHOGI-TOUR-APPHQ-003D｜実データ撤去ポリシー](./shogi_tour_apphq_003d_real_data_removal_policy.md)
- SHOGI-TOUR-APPHQ-003D-4（予定）
- SHOGI-TOUR-APPHQ-003E（予定）
- SHOGI-TOUR-APPHQ-003F（予定）
- SHOGI-TOUR-APPHQ-003G（予定）
- SHOGI-TOUR-APPHQ-003H（予定）
- [SHOGI-TOUR-APPHQ-008｜開発環境分離方針](./shogi_tour_apphq_008_environment_separation.md)
