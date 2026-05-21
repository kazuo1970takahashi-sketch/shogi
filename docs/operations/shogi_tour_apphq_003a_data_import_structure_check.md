# SHOGI-TOUR-APPHQ-003A｜data/import 値非表示・構造確認手順

Task ID：SHOGI-TOUR-APPHQ-003A  
Task Name：data/import 値非表示・構造確認手順書作成  
Project ID：SHOGI-TOUR  
Parent Project ID：APP-HQ  
Repo：kazuo1970takahashi-sketch/shogi  
種別：docs-only / 手順書 新規作成  
関連：SHOGI-TOUR-APPHQ-003（取扱い判定 Runbook）、SHOGI-TOUR-APPHQ-008（環境分離方針）

---

## 0. この文書の位置づけ

本手順書は、SHOGI-TOUR-APPHQ-003 で定めた `data/import/20260412_participants.json` 取扱い判定 Runbook を前提に、対象 JSON の**値を表示せず**に構造のみを安全に確認するための具体手順を定めるものである。

本手順書の作成時点で、対象 JSON の中身は確認していない。  
本手順書は、それ自体が docs-only であり、対象 JSON の構造確認を実行する文書ではない。  
構造確認の実施は、後続タスク SHOGI-TOUR-APPHQ-003B（実施タスク）として分離する。

APP-HQ の方針に従い、実データ・個人情報・secret が疑われる場合は、内容を表示せず、存在・パス・種類・リスク・統計値のみで扱う。氏名のみでも個人情報として扱う。

---

## 1. 目的

本手順書 SHOGI-TOUR-APPHQ-003A は、`data/import/20260412_participants.json` を実データ混入候補として扱い、**値を表示せず**に構造確認を行うための具体手順を定める文書である。

本手順書の目的は以下である。

- 実値を表示しない。
- 個人情報を AI や PR 本文に出さない。
- 構造・キー・件数・サイズ・履歴・リスクのみを確認する。
- 後続の人間判定・撤去・架空化判断へ安全につなげる。

---

## 2. 対象ファイル

- パス：`data/import/20260412_participants.json`
- 追跡状態：`origin/main` で追跡中
- 区分：実データ混入候補
- 内容：**未確認**（本手順書作成時点で表示していない）
- 取扱い：氏名のみでも個人情報として扱う
- 本手順書では値確認を行わない（値確認は後続タスク 003B 以降の責務）

---

## 3. 基本原則

構造確認を実施する際は、以下の原則を遵守する。

- 値を表示しない。
- JSON 本文を表示しない。
- AI に実データを送らない（個人向け AI／cowork／外部 LLM すべてを含む）。
- チャット、PR 本文、レビューコメント、Runbook、Issue、外部ストレージに実値を貼らない。
- 構造確認はローカル CLI またはローカルスクリプトで行う。
- 出力するのは、**存在・パス・種類・サイズ・キー名・件数・統計値・リスクのみ**。
- キー名自体に個人情報が含まれる可能性がある場合は、キー名も伏せる。
- 判断に迷う場合は高リスク側に倒す。

---

## 4. 許可する確認

以下の確認は、いずれもファイル内容（値）を表示しない手段である。

| # | 確認項目 | 手段の例 | 出力に含めてよいもの |
|---|---|---|---|
| 1 | ファイル存在確認 | `ls`、`test -f` | 存在 / 非存在 |
| 2 | ファイルサイズ確認 | `ls -la`、`stat`、`wc -c` | バイト数 |
| 3 | Git 追跡確認 | `git ls-files <path>` | 追跡されているか |
| 4 | Git 履歴確認 | `git log --name-only -- <path>`、`git log --oneline -- <path>` | commit SHA、メッセージ、ファイル名 |
| 5 | Git 差分確認 | `git diff --name-only`、`git diff --stat` | 変更ファイル名、行数のみ |
| 6 | JSON 妥当性確認 | `python -c "import json; json.load(open(p))"` | 成功 / 失敗のみ |
| 7 | トップレベル型確認 | `type()` の結果のみ | `dict` / `list` 等の型名 |
| 8 | トップレベルキー名確認 | `dict.keys()` の集合のみ | キー名（個人情報疑いなら伏せる） |
| 9 | 配列件数確認 | `len(list)` | 件数のみ |
| 10 | オブジェクト件数確認 | `len(dict)` | 件数のみ |
| 11 | 各レコードのキー集合確認 | キー名の和集合 | キー名集合 |
| 12 | 値型の分布確認 | `type(v).__name__` の集計 | `string` / `number` / `boolean` / `null` / `array` / `object` の件数 |
| 13 | 値の最大長・最小長・空欄数などの統計 | `len(str_value)` の min/max/avg | 統計値のみ（値そのものは出さない） |
| 14 | 重複件数確認 | `len(set(...))` と全体件数の差 | 件数のみ（重複値は出さない） |

許可される確認の出力は、すべて**値そのものを含まない統計・型・件数情報のみ**でなければならない。

---

## 5. 禁止する確認

以下は禁止する。

| # | 禁止する操作 | 理由 |
|---|---|---|
| 1 | `cat data/import/20260412_participants.json` | 本文表示 |
| 2 | `jq . data/import/20260412_participants.json` | 整形本文表示 |
| 3 | `head` / `tail` で本文表示 | 部分本文表示 |
| 4 | 実名を表示する | 個人情報表示 |
| 5 | 支部名を表示する | 個人関連情報表示 |
| 6 | 段級位を表示する | 個人関連情報表示 |
| 7 | 参加者属性値を表示する | 個人関連情報表示 |
| 8 | メールアドレス、電話番号、住所などを表示する | 個人情報表示 |
| 9 | JSON 本文を AI に貼る | 外部 AI への漏えい |
| 10 | 実データを含むスクリーンショットを貼る | 個人情報漏えい |
| 11 | ファイルを削除する | 本手順書の範囲外（003D の判断対象） |
| 12 | ファイルを編集する | 本手順書の範囲外 |
| 13 | Git 履歴を改変する | 本手順書の範囲外（003E の判断対象） |
| 14 | force push する | 本手順書の範囲外 |

---

## 6. 推奨する値非表示確認コマンド方針

> 注意：本章では具体的なコマンド案を記載するが、いずれも**出力に値が出ないこと**を前提とする。  
> 値が出る恐れがあるコマンドは「**使用禁止**」と明記する。

### 6.1 推奨方針（値非表示）

- Python で JSON を読み、**値を print しない**。
- 出力するのは以下のみに限定する。
  - path
  - file size
  - top-level type
  - top-level keys（キー名に個人情報が疑われる場合は伏せる）
  - record count
  - key set（各レコードのキー和集合）
  - value type distribution
  - null count
  - empty string count
  - max / min string length
- string 値そのものは出力しない。
- number 値も必要がなければ出力しない。
- 文字列の先頭数文字を出す処理（`str[:n]`、`repr(str)` 等）は**使用禁止**。
- unique values の表示は**使用禁止**。
- sample rows の表示は**使用禁止**。

### 6.2 安全な擬似コード方針

以下の方針のみを許可する。

- `json.load` する。
- `type()` だけ見る。
- `dict.keys()` だけ見る。
- `len()` だけ見る。
- 値は `repr` / `str` / `print` しない。
- 統計（件数、min/max 長、null/空欄数、型分布）のみ出す。

### 6.3 使用禁止コマンド

- `cat <path>` — 本文表示
- `jq . <path>` — 整形本文表示
- `head <path>` / `tail <path>` — 部分本文表示
- `less <path>` / `more <path>` — 本文表示
- `grep <pattern> <path>` で値が出る使い方 — 値漏えい
- `xxd <path>` / `od <path>` — バイナリ本文表示
- `python -c "import json; print(json.load(open(p)))"` — 本文 print
- `python -c "... print(d[k]) ..."` — 値 print
- 任意の AI へ JSON 本文を貼る操作

---

## 7. レポート出力形式

構造確認を実施した場合（後続タスク 003B 等）、報告は以下の形式に限定する。

```
# data/import 構造確認レポート

- 対象ファイル：
- 内容表示：
  - していない
- ファイル変更：
  - していない
- ファイルサイズ：
- Git 追跡：
- top-level type：
- top-level keys：
- record count：
- key set：
- value type distribution：
- null / empty counts：
- risk：
- 判定：
  - 実データ疑い / 架空データ疑い / 判定保留
- 次アクション：
```

レポートに含めることを禁止する項目：

- 実値
- サンプル行
- 具体的な参加者名
- 具体的な支部名
- 具体的な段級位
- 具体的な属性値

---

## 8. 判定基準

構造確認の結果に基づき、以下のいずれかに判定する。

### A. 実データ疑い継続

- ファイル名、日付、構造、件数、キー構成から実データの可能性がある。
- 値確認なしでは架空と断定できない。
- 原則、この判定を初期値とする。

### B. 架空データ疑い

- ファイル名、構造、コメント、docs などから架空データの可能性が高い。
- ただし値確認なしでは確定しない。

### C. 判定保留

- 構造確認だけでは判断できない。
- 人間ローカル確認（003C）へ進める。

### D. 実データ確定

- 値確認が必要なため、AI や PR 上では実施しない。
- 人間がローカルで確認し、実値を外部 AI へ出さない。
- 確定後は 003D（撤去・架空化方針）へ進める。

---

## 9. 後続タスク候補

| Task ID | 内容 |
|---|---|
| SHOGI-TOUR-APPHQ-003B | 値非表示構造確認の実施 |
| SHOGI-TOUR-APPHQ-003C | 人間による実データ性判定 |
| SHOGI-TOUR-APPHQ-003D | 実データ確定時の撤去・架空化方針 |
| SHOGI-TOUR-APPHQ-003E | Git 履歴対応要否判断 |
| SHOGI-TOUR-APPHQ-003F | 完全架空サンプルデータ作成 |

---

## 10. Risk Level

| 作業 | Risk Level |
|---|---|
| 本手順書作成（docs-only、実データ・個人情報候補に関わる） | Level 3 相当 |
| 値非表示の構造確認実施 | Level 3 |
| 人間による実値確認 | Level 3 以上、人間ローカル限定 |
| ファイル削除・架空化 | Level 3 |
| Git 履歴改変 / force push | Level 4 |
| GitHub Pages 公開済みデータの撤去判断 | Level 4 候補 |

---

## 11. 今回やらないこと

本タスク SHOGI-TOUR-APPHQ-003A は docs-only の手順書作成タスクであり、以下は本タスクの範囲外である。

- 対象 JSON の値確認
- 対象 JSON の構造確認の実行（実施は 003B）
- 対象 JSON の編集
- 対象 JSON の削除
- Git 履歴確認の実行
- Git 履歴改変
- force push
- 架空データ作成
- GitHub Pages 操作

---

## 12. 参考

- SHOGI-TOUR-APPHQ-001：read-only 棚卸し
- SHOGI-TOUR-APPHQ-003：data/import 取扱い判定 Runbook（`docs/operations/shogi_tour_apphq_003_data_import_runbook.md`）
- SHOGI-TOUR-APPHQ-008：環境分離方針（`docs/operations/shogi_tour_apphq_008_environment_separation.md`）
