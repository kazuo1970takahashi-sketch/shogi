# SHOGI-TOUR-APPHQ-003F｜完全架空fixture設計

## 1. 目的

SHOGI-TOUR-APPHQ-003F は、E2Eで使用する完全架空fixtureの設計方針を定める文書である。

この文書では、以下を整理する。

- 完全架空fixtureが必要な理由
- 実データ由来データを使わない原則
- 命名規則
- データ項目方針
- 最小件数方針
- ファイル配置候補
- E2Eでの利用方針
- 禁止事項
- 後続タスクの順序
- Risk Level
- Approval Phrase / 承認境界

本文書は docs-only であり、以下は今回行わない。

- 完全架空fixtureファイルの作成
- E2E specの修正
- 実データ確定JSON `data/import/20260412_participants.json` の変更・削除
- E2E spec `test/e2e/shogi_phase2_import.spec.js` の変更

## 2. 完全架空fixtureが必要な理由

- 現在のE2Eは実データ確定JSON（SHOGI-TOUR-APPHQ-003C にて実データ確定済み）を参照している。
- 実データfixture依存は、CIログ・trace・screenshot・video・artifact・debug outputに実データが混入するリスクがある。
- 実データをfixtureとして残すと、将来の開発者がテスト資産と誤認するおそれがある。
- 実データ撤去（SHOGI-TOUR-APPHQ-003H 以降）の障害になる。
- import機能の回帰確認は必要だが、その確認に実データを使う必要はない。
- 完全架空fixtureに切り替えることで、E2E維持と個人情報保護を両立する。

## 3. 完全架空データの原則

- 実データ由来の匿名化・仮名化は使わない。
- 実名、実住所、実支部、実大会日付、実参加履歴を使わない。
- 実大会・実参加者・実支部・実地域と誤認される値を使わない。
- 人間が見て明らかに架空と分かる値を使う。
- 機械的・連番的な命名を優先する。
- 本番データを加工してfixture化しない。
- localStorageやexportされた実データからfixtureを作らない。
- AIに実データを渡してfixture化させない。

## 4. 命名規則

### 推奨命名

- Fixture User 001
- Fixture User 002
- Synthetic Player 001
- Dummy City 001
- Fixture Branch 001
- Fixture Tournament 001

### 避ける命名

- 実在しそうな日本人氏名
- 実在しそうな住所
- 実在支部名・実地域名
- 実大会名
- 実大会日付に見える日付
- テスト 太郎 / テスト県テスト市 / テスト支部 など、自然人名・実地名に近く見えるもの

### 方針

- fixture名は機械的・連番的・英語ベースを基本とする。
- 日本語UI確認が必要な場合も、実在しないことが明確な名称にする。
- fixtureであることが、ファイル名・値・コメントから分かるようにする。
- 実在物との一致がないか、レビュー時に確認する。

## 5. データ項目方針

E2Eで必要な最小項目だけを持たせる。
実データJSONの値を再現しない。
実データJSONの全項目を無条件に再現しない。

### 候補項目

- `name`
  - `Fixture User 001` 形式
- `city`
  - `Dummy City 001` 形式
- `grade`
  - E2Eで必要な場合のみ
- `last_class`
  - E2Eで必要な場合のみ。A / B 等の非個人値
- `last_played`
  - 実日付ではなく、明らかにfixture用の日付。E2E上不要なら省略
  - **省略を優先する**。`last_played` は実大会日付・実参加履歴に見えやすく、CIログ・trace・screenshot・video に出た場合に実大会日と誤認されるリスクが高い。
  - E2E上どうしても必要な場合も、実日付に見える `YYYY-MM-DD` 形式は避ける選択肢を検討する。
  - 代替案として、`fixture_date_001` / `synthetic_history_001` といった非日付の架空文字列を使う方式を検討する。
  - アプリ仕様上どうしても日付形式が必要な場合は、実大会日・実運用日と誤認されない固定fixture日（例: 明らかに過去でない遠い未来日や、固定の `2099-01-01` 等）を選び、**fixture用であることを docs およびfixtureファイル内コメントに明記する**。
  - なお、本PR (003F) では fixtureファイルそのものは作成しない。実装は 003F-1 で行う。
- `member`
  - E2Eで必要な場合のみ
- `yomi`
  - E2Eで必要な場合のみ
- `_note`
  - fixture説明のみ。実データ由来メモは禁止

### 注意

項目名自体はアプリ仕様上必要な場合があるため、項目名（キー）の使用は許容する。
ただし、値は完全架空とする。
項目の必要性はE2E側の期待動作に基づいて決める。

## 6. 最小件数方針

- E2Eでimport処理を確認できる最小件数にする。
- 多数件数は不要。
- まずは 3〜5 件程度を候補とする。
- クラス分岐が必要なら、A / B が最低限確認できる件数にする。
- 重複名や異常系が必要なら、別fixtureとして分ける。
- 正常系fixture、異常系fixture、境界値fixtureを混在させない。

## 7. ファイル配置候補

### 候補A

`test/fixtures/import/participants_synthetic_minimal.json`

### 候補B

`test/e2e/fixtures/participants_synthetic_minimal.json`

### 候補C

`test/fixtures/shogi_phase2_import_synthetic.json`

### 推奨

`test/fixtures/import/participants_synthetic_minimal.json`

### 理由

- `data/import/` は本番・手動import用に見えるため避ける。
- `test/fixtures/` 配下なら、テスト用であることが明確。
- `import/` サブディレクトリで用途が分かる。
- `synthetic` / `fixture` / `minimal` をファイル名に入れることで、完全架空データと分かる。

## 8. E2Eでの利用方針

- `test/e2e/shogi_phase2_import.spec.js` は実データJSON参照をやめる。
- 完全架空fixtureへの参照に切り替える。
- E2Eログ・trace・screenshot・videoに実データが出ないことを確認する。
- fixtureの値が画面に表示される可能性があるため、値自体が完全架空であることが必須。
- E2E修正PRでは、対象JSONを開かない。
- E2E修正PRでは、実データJSONから値・構造をコピーしない。
- E2E修正PRでは、必要に応じてテスト期待値も完全架空値にする。

## 9. 一時skipとの関係

- 基本は完全架空fixtureへの切替である。
- 一時skipは緊急時の短期策。
- 003F系で完全架空fixture作成後、E2Eを再有効化する。
- skipを恒久対応にしない。

### 9.1 一時skip / 削除の承認必須項目

SHOGI-TOUR-APPHQ-003D-4 と同じ基準を踏襲し、一時skip / 削除を採用する場合は、PR 本文 / commit message / 対応コードコメントに以下 6 項目を **すべて** 明記する。1 つでも欠けた skip / 削除 PR は merge 禁止とする。

1. **skip / 削除理由**
   - なぜ E2E を一時的に止める必要があるのか（例: 実データ依存解除前にCIから実データ流出させないため、など）。
2. **復元条件**
   - 何が満たされたら E2E を復元 (un-skip) するのか（例: `test/fixtures/import/participants_synthetic_minimal.json` が main に存在する、など）。
3. **絶対期限**
   - 復元のデッドライン（具体的な日付）。期限なしの「いずれ」「後日」表現は禁止。
4. **復元責任者または後続Task ID**
   - 誰が、またはどの Task ID（例: SHOGI-TOUR-APPHQ-003F-1 / 003D-4A）が復元責任を持つかを明記する。
5. **テスト負債マーカー**
   - 該当 skip 箇所にコード上のマーカー（例: `// TEST_DEBT: SHOGI-TOUR-APPHQ-003F-1 まで一時skip` 等）を付け、`grep` で機械的に検出可能な状態にする。
6. **復元 blocking 条件**
   - 完全架空fixture (003F-1) または E2E 参照解除 (003D-4A) が main に入った時点で、E2E 復元タスクを **blocking** として扱う（=他作業よりも優先）。

### 9.2 復元条件・期限なしの skip / 削除は禁止

- 上記 6 項目のいずれかが欠けた skip / 削除 PR は **merge 禁止**。
- 復元条件なしの skip は、実質的な恒久 skip と見なす。
- 003F-1 または 003D-4A 完了後は、E2E 復元 PR を blocking 扱いで起票する。

## 10. 後続タスク候補

- **SHOGI-TOUR-APPHQ-003F-1**：完全架空fixture作成
- **SHOGI-TOUR-APPHQ-003D-4A**：E2E参照解除実装
- **SHOGI-TOUR-APPHQ-003D-4B**：一時skip採用時の復元条件管理
- **SHOGI-TOUR-APPHQ-003H**：実データ撤去実行Runbook
- **SHOGI-TOUR-APPHQ-003E**：Git履歴対応要否判断
- **SHOGI-TOUR-APPHQ-003G**：GitHub Pages公開済み影響確認

## 11. 推奨実施順

1. **003F-1**：完全架空fixture作成
2. **003D-4A**：E2E参照解除実装
3. **003H**：実データ撤去実行Runbook
4. **003E**：Git履歴対応要否判断
5. **003G**：GitHub Pages公開済み影響確認

ただし、現行公開影響が強く疑われる場合は **003G を 003H 前後で前倒し可能**。
003G を前倒しする場合でも、本文取得・保存・表示は禁止し、HEAD / メタ情報確認に限定する。

## 12. Risk Level

| 作業 | Risk Level |
|---|---|
| 本方針文書作成（本PR） | docs-only だが実データfixture依存解除に関わるため **Level 3 相当** |
| 完全架空fixture作成 | Level 3 |
| E2E参照解除実装 | Level 3 |
| 一時skip / 削除 | Level 3 |
| 実データ撤去実行 | Level 3〜4 |
| Git履歴改変 / force push | Level 4 |
| GitHub Pages公開済み影響確認 | Level 4候補 |

## 13. Approval Phrase / 承認境界

- 本方針文書作成は docs-only だが **Level 3 相当**。
- 完全架空fixture作成は **別PR・別承認**。
- E2E参照解除実装は **別PR・別承認**。
- 一時skip / 削除を採用する場合は、**§9.1 の 6 項目（理由 / 復元条件 / 絶対期限 / 復元責任者または後続Task ID / テスト負債マーカー / 復元 blocking 条件）をすべて明示する**。1 つでも欠けた PR は merge 禁止。
- 実データ撤去実行は、通常の Ready化 / merge 承認だけでは不十分。
- Git履歴改変・force push・GitHub Pages設定変更は、標準 Approval Phrase では解除不可。

## 14. 今回やらないこと

- 対象JSON（`data/import/20260412_participants.json`）の削除
- 対象JSONの置換
- 対象JSONの本文表示
- E2E spec（`test/e2e/shogi_phase2_import.spec.js`）の修正
- E2E spec の skip / 削除
- 完全架空fixtureファイルの作成
- Git履歴改変
- force push
- GitHub Pages設定変更
- 実データ撤去実行
