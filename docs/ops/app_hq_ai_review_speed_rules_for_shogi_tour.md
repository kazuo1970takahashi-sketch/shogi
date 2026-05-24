# SHOGI-TOUR｜APP-HQ AIレビュー高速化運用 反映ルール

## 1. 目的

本ドキュメントは、APP-HQ-OPS-007 / OPS-008 / OPS-009 で採用・補強・展開方針整理した AIレビュー高速化運用を、SHOGI-TOUR / 将棋大会運営アプリ repo に反映するためのものである。

APP-HQ-ROLL-TOUR-001 の目的は、SHOGI-TOUR repo の運用docsから APP-HQ 共通ルールを参照できるようにすることである。

APP-HQ-ROLL-TOUR-001 の目的は、アプリ実装を変更することではない。

APP-HQ-ROLL-TOUR-001 の目的は、実参加者名、支部マスタ、大会データ、組み合わせ実績データを扱うことではない。

APP-HQ-ROLL-TOUR-001 の目的は、本番大会データやlocalStorage実データを読み取ることではない。

APP-HQ-ROLL-TOUR-001 の目的は、SHOGI-LEARN repoへ反映することではない。

APP-HQ-ROLL-TOUR-001 の目的は、branch削除を行うことではない。

## 2. 位置づけ

SHOGI-TOUR は、SHOGI-HQ 管理下の個別プロジェクトである。

```text
Project ID:
SHOGI-TOUR

Project Name:
将棋大会運営アプリ

Repo:
kazuo1970takahashi-sketch/shogi

目的:
将棋大会の受付・対局管理・運営支援
```

SHOGI-TOUR は、SHOGI-LEARN とは別プロジェクトである。

```text
SHOGI-TOUR:
将棋大会を運営するためのアプリ

SHOGI-LEARN:
将棋を強くするための学習アプリ
```

本ドキュメントは SHOGI-TOUR 用であり、SHOGI-LEARN repo には適用しない。
SHOGI-LEARN への反映は、別タスク・別PRで扱う。

## 3. SHOGI-TOURのデータ安全方針

SHOGI-TOURでは、以下を個人情報または個人情報に準じる情報として扱う。

- 参加者名
- 支部員名
- 支部マスタ
- 参加者マスタ
- 大会データ
- 組み合わせ実績データ
- 対局結果
- 出席情報
- 会員区分
- 一般 / 支部員区分
- 住所
- 連絡先
- localStorage に保存された実大会データ
- JSON export された大会データ
- バックアップファイル

氏名だけでも個人情報として扱う。

したがって、AIレビューや実装依頼では、原則として実参加者名・支部マスタ・大会データを貼らない。

必要な場合は、以下を使う。

```text
ダミー参加者001
ダミー参加者002
架空支部A
架空大会001
dummy_player_001
dummy_branch_001
dummy_tournament_001
```

以下は避ける。

```text
実在しそうな氏名
実際の支部員名
実際の大会参加者名
実住所
実連絡先
実localStorageデータ
過去大会の実データ
```

## 4. APP-HQ 側で採用済みの共通ルール

APP-HQ では、以下が採用済みである。

### 4.1 APP-HQ-OPS-007

AIレビュー高速化運用を共通ルール化した。

主な内容:

- Level A / B / C 分類
- Claude Code依頼の軽量化
- Reviewer Input Pack 必須化
- Codex GitHub探索なし版レビュー
- ChatGPT / Claude Code / Codex の役割整理
- 承認ルールの維持
- 実環境・機密情報・個人情報の高リスク扱い

### 4.2 APP-HQ-OPS-008

OPS-007 を補強した。

主な内容:

- Review Pack貼付確認
- 素材不足時は「確認不能」
- Level C 通常レビュー切替条件
- Codex自律探索の禁止
- 通常レビュー切替時の明示条件

### 4.3 APP-HQ-OPS-009

個別repo反映方針を整理した。

主な内容:

- FO / BP-MATCH / SHOGI-TOUR / SHOGI-LEARN への展開順を整理
- SHOGI-TOUR はPR運用が活発で、Reviewer Input Pack標準化の効果が大きいと整理
- 参加者名・支部マスタ・大会データの扱いに注意すると整理
- SHOGI-LEARN と混同しないと整理
- 個別repo反映は別タスク・別PR
- Task ID は髙橋さんが決定、Claude Code は新規発行しない

## 5. SHOGI-TOUR repo に反映する運用

SHOGI-TOUR repo では、以下を標準運用として扱う。

### 5.1 Level A / B / C 分類

SHOGI-TOUR repo の AI作業は、原則として Level A / B / C に分類する。

```text
Level A:
docs-only / 貼り付け適用タスク

Level B:
fixture / dummy data / sample data 限定の軽量実行、または軽微編集

Level C:
調査・設計・実装・テスト・データ処理・高リスク作業
```

### 5.2 Level A

Level A は、ChatGPT が本文や依頼文を完成形で作成し、Claude Code は貼り付け・最小更新・Draft PR化に集中する。

SHOGI-TOURでの主な対象:

- docs-only
- AI作業ルール
- 運用テンプレート
- 完了宣言
- 到達点整理
- レビュー結果整理
- Reviewer Input Pack 整理
- Codexレビュー依頼文の整備
- Ready化 / merge承認文の整備

Level Aでやらないこと:

- shogi_v4.html の変更
- scripts変更
- tests変更
- workflow変更
- settings変更
- 実参加者データread
- 実支部マスタread
- 実大会データread
- localStorage実データread
- 実ファイル操作
- branch削除
- Ready化 / merge の自律実行

### 5.3 Level B

Level B は、限定実行または軽微編集タスクである。

SHOGI-TOURでの主な対象:

- dummy data / fixture / sample data 限定検証
- 架空大会データのみを使う軽量実行
- reviewer指摘の軽微修正
- docs整合化
- VRT影響の軽微整理
- PR説明の補強

Level Bでやらないこと:

- 実参加者名の読み取り
- 実支部マスタの読み取り
- 実大会データの読み取り
- localStorage実データの読み取り
- 本番大会データを使ったテスト
- 実ファイルコピー
- 実ファイル mv / cp / rm
- permission allow変更
- branch削除の自律実行

### 5.4 Level C

Level C は、調査・設計・実装・テスト・データ処理・高リスク作業である。

SHOGI-TOURでの主な対象:

- shogi_v4.html の実装変更
- localStorage schema 変更
- 支部マスタ関連変更
- 参加者マスタ関連変更
- 大会データ保存処理変更
- pairing / result / report / reset / restore / backup 関連変更
- tests / workflow / VRT 変更
- security / privacy / data handling 変更
- 実データに近づく可能性がある設計

Level Cでは、従来通り詳細な安全柵を必須とする。

特に、参加者名・支部マスタ・大会データに近づく可能性がある場合は、通常のLevel Cよりさらに慎重に扱う。

## 6. SHOGI-TOUR固有の安全境界

SHOGI-TOUR repo では、以下を特に高リスク扱いとする。

- 実参加者名
- 実支部員名
- 実参加者マスタ
- 実支部マスタ
- 実大会データ
- 実組み合わせ実績データ
- 実対局結果
- 実出席情報
- 実住所
- 実連絡先
- localStorage実データ
- JSON export 実データ
- バックアップファイル
- 本番大会データ
- 参加費・会費など金銭情報
- 参加者の会員区分
- 個人を識別できるログ

これらは、原則としてAIに貼らない。

必要性がある場合でも、まず別途安全設計タスクを作り、匿名化・ダミー化・共有範囲・削除方針を整理する必要がある。

## 7. SHOGI-TOURの基本データ方針

SHOGI-TOURでは、以下を基本方針とする。

```text
扱ってよい:
- 完全架空のダミー参加者
- fixture
- sample data
- テスト用に生成した架空支部名
- テスト用に生成した架空大会名
- dummy_player_001
- dummy_branch_001
- dummy_tournament_001
- docsに記載された安全なサンプル

扱ってはいけない:
- 実参加者名
- 実支部員名
- 実支部マスタ
- 実大会データ
- 実localStorageデータ
- 実JSON export
- 実バックアップファイル
- 実住所
- 実連絡先
- 実会費情報
```

docs-onlyタスクでも、実参加者名や実大会データ例を使わない。

例示が必要な場合は、明らかに架空と分かる名前を使う。

推奨例:

```text
ダミー参加者001
ダミー参加者002
架空支部A
架空大会001
dummy_player_001
dummy_branch_001
dummy_tournament_001
```

非推奨例:

```text
実在しそうな氏名
実在しそうな支部名
実際の大会名に見える名称
過去大会の参加者名
実localStorageから取った値
```

## 8. Reviewer Input Pack

SHOGI-TOUR repo では、Claude Code が Draft PR 作成後、完了報告コメントに Reviewer Input Pack を含める。

必須項目:

1. Repo
2. PR番号
3. PR URL
4. Branch
5. Base branch
6. Head commit
7. 変更ファイル一覧
8. diff stat
9. 主要変更箇所の抜粋
10. レビュー観点
11. 安全性確認
12. Ready化 / merge 判断に必要な条件

SHOGI-TOURでは、必要に応じて以下も追加する。

- 実参加者データ不使用確認
- 実支部マスタ不使用確認
- 実大会データ不使用確認
- localStorage実データ不使用確認
- fixture / sample data のみであること
- 個人情報を含まないこと
- VRT影響
- Unit / Security / E2E結果
- schema / storage 影響
- rollback方針
- self-check

## 9. Review Pack 貼付確認

Reviewer Input Pack は、PRコメントに残すだけでは不十分である。

Codexレビュー依頼時には、Reviewer Input Pack本文またはレビュー素材を、レビュー依頼本文にも貼る。

SHOGI-TOUR repo では、Codexレビュー依頼前に以下を確認する。

```text
Review material self-check:
- Reviewer Input Pack posted to PR comment: yes
- Reviewer Input Pack pasted into review request body: yes / no
- Review request includes repo / PR / branch / head commit: yes
- Review request forbids GitHub / gh / local exploration unless explicitly allowed: yes
- If material is insufficient, reviewer must say "確認不能" instead of guessing: yes
- real participant data included in review material: no
- real branch master data included in review material: no
- real tournament data included in review material: no
- SHOGI-LEARN mixed into scope: no
```

`Reviewer Input Pack pasted into review request body` が `yes` でない場合、原則としてCodexレビュー依頼を出さない。

`real participant data included in review material` が `no` でない場合、レビュー依頼を出さない。

`SHOGI-LEARN mixed into scope` が `no` でない場合、レビュー依頼を出さない。

## 10. Codex GitHub探索なし版レビュー

SHOGI-TOUR repo の Codexレビューでは、原則として GitHub探索なし版を使う。

Codexレビュー依頼では以下を明記する。

```text
今回は GitHub API / gh コマンド / ローカル作業ディレクトリ探索を使わないでください。
PRコメントを取得しに行かないでください。
以下に貼るレビュー素材だけを一次情報としてレビューしてください。
素材に不足がある場合は、推測せず「確認不能」と明記してください。
実参加者名・支部マスタ・大会データ・localStorage実データが含まれている可能性がある場合は、内容を展開せず、その可能性を指摘してください。
SHOGI-LEARN と混同しないでください。
```

素材不足時の扱い:

```text
この観点は、提示素材だけでは確認不能です。
理由: <不足している情報>
```

GitHub API / gh / ローカル探索を使ってよいのは、依頼文で明示許可された場合のみである。

## 11. Level C の通常レビュー切替

GitHub探索なし版レビューを標準とする。

ただし、Level C では、以下の場合に通常レビューへ切り替えることがある。

- 実装変更の差分確認が必要な場合
- test / workflow / VRT / script の実変更がある場合
- shogi_v4.html の変更がある場合
- localStorage schema / storage の変更がある場合
- pairing / result / report / reset / restore / backup 関連変更がある場合
- security / privacy / data handling に関わる変更がある場合
- 提示素材だけでは安全性や挙動を確認できない場合
- reviewer が「確認不能」と判断し、人間が追加探索を許可した場合

通常レビューへ切り替える場合でも、以下を明記する。

- Repo
- PR番号
- PR URL
- Branch
- Base
- Head commit
- 許可する探索範囲
- 禁止する探索範囲
- 実参加者名・支部マスタ・大会データを開いてよいかどうか
- localStorage実データを見てよいかどうか
- GitHub / gh / ローカル探索のどこまでを許可するか
- SHOGI-LEARN は対象外であること

通常レビューへの切り替えは、Codexの自律判断ではなく、人間またはChatGPT司令塔の明示指示に基づいて行う。

この探索許可は、当該レビューに限定される。

恒久的な permission allow 変更ではない。

## 12. 承認ルール

本運用は、承認ルールを緩めるものではない。

以下は明示承認が必要である。

- Ready化
- merge
- branch削除
- main直接push
- force push
- release
- deploy
- publish
- 実参加者データ読み取り
- 実支部マスタ読み取り
- 実大会データ読み取り
- localStorage実データ読み取り
- 実ファイル操作
- permission allow変更
- restore
- rollback
- 個人情報を含む可能性があるデータの読み取り

承認文には、少なくとも以下を含める。

- 解除対象
- 対象
- 実行範囲

branch削除は、Ready化 / merge とは別承認にする。

## 13. SHOGI-TOURで無効な承認文言

以下は承認として扱わない。

```text
参加者データを少し見て
支部マスタを確認して
大会データを見て
localStorageを軽く確認して
個人情報は出さない範囲で見て
安全そうな範囲でやって
前と同じ感じで
shogiの方でやって
将棋のやつを見て
```

理由:
解除対象・対象・実行範囲・実行コマンド・AI共有範囲・停止条件が明示されていないため。

特に、SHOGI-TOURでは「shogi」「将棋のやつ」のような曖昧表現が、SHOGI-LEARN との混同を招くため危険である。

## 14. APP-HQ-ROLL-TOUR-001でやらないこと

APP-HQ-ROLL-TOUR-001 は docs-only の運用反映タスクである。

以下は行わない。

- shogi_v4.html の変更
- app実装変更
- tests / workflow / scripts の変更
- VRT更新
- 実参加者名の読み取り
- 実支部マスタの読み取り
- 実大会データの読み取り
- localStorage実データの読み取り
- 実JSON export の読み取り
- 実バックアップファイルの読み取り
- SHOGI-LEARN repoへの反映
- branch削除

## 15. 停止位置

APP-HQ-ROLL-TOUR-001 では、本ドキュメントを作成し、必要な既存docsを最小更新し、Draft PR を作成したら停止する。

APP-HQ-ROLL-TOUR-001 完了後に自動でSHOGI-TOUR実装タスクへ進んではいけない。

APP-HQ-ROLL-TOUR-001 完了後に自動でSHOGI-LEARN反映へ進んではいけない。

APP-HQ-ROLL-TOUR-001 完了後に branch 後始末を行ってはいけない。

Ready化、merge、branch削除は明示承認があるまで行わない。

## 16. 推奨判定

APP-HQ-ROLL-TOUR-001 の推奨判定は以下である。

```text
Conditional Go
```

意味:

- SHOGI-TOUR repo へのAIレビュー高速化運用反映として採用してよい
- 実参加者データ利用許可ではない
- 支部マスタ・大会データ利用許可ではない
- localStorage実データ利用許可ではない
- SHOGI-LEARN への反映許可ではない
- branch削除許可ではない
- 次のSHOGI-TOUR実装タスクへの着手許可ではない
