# docs/changelog.d/ — CHANGELOG 断片の置き場所

各スライスは **`docs/CHANGELOG.md` を直接編集しない**。代わりに、このディレクトリへ
**1 スライス = 1 ファイル**の断片を置く。

```
docs/changelog.d/<YYYYMMDD>_<スライスID>.md
例: docs/changelog.d/20260729_stage0-conflict-free-001.md
```

## なぜ

従来は全スライスが `docs/CHANGELOG.md` の同じ場所を編集していたため、**共有の追記点で
必ず衝突**していた。SPLIT-FEASIBILITY-001 §5 の実測では、直近 20 隣接ペアの並行開発衝突
18 件のうち **12 件（60%）が `test/run_tests.sh` の末尾追記と `docs/CHANGELOG.md` の追記
だけ**に起因していた（モノリス分割とは無関係）。断片方式にすると各スライスは自分専用の
ファイルを 1 本置くだけになり、ここでは衝突しない。

## 書き方

断片の中身は、これまで `docs/CHANGELOG.md` に書いていた 1 節をそのまま書く。

```markdown
## SLICE-ID: 一行要約

- **問題**: …
- **修正**: …
- テスト: <追加・変更したテストのファイル名>
```

**テストの件数（「全 N 件」「PASS=N」）は書かない。** 件数は同じ PR の中でも巡ごとに変わり
（#946 では 21→26→27 と 3 回腐った）、本体に連結されたあとは誰も直さない。書くのは
ファイル名だけにする。件数は PR の「検証」欄と CI のログに残る（DOC-GUARDS-001 / #951）。

前後の空行は連結時に整えられるので気にしなくてよい。

## いつ本体へ入るか（リリース列車の組成時）

リリース列車を組む担当が **1 回だけ** 次を実行する。

```bash
bash scripts/changelog_merge.sh
```

- 断片を **ファイル名の昇順（= 日付順）** で `docs/CHANGELOG.md` の**末尾**へ連結し、
  連結した断片を削除する。
- `docs/CHANGELOG.md` は冒頭に「記載は原文の並び（おおむね時系列・**上が古い**）」と
  明記されており、実際の直近スライスも末尾へ追記しているため、既定は**末尾連結**。
  冒頭（ヘッダ直後）へ入れたい場合だけ `--position top` を付ける。
- **断片が 0 本なら何もしない**（`CHANGELOG.md` を 1 byte も触らない）＝冪等。
- 事前確認は `bash scripts/changelog_merge.sh --dry-run`。

連結スクリプトの単体テストは `test/test_changelog_merge.sh`（順序・冪等・断片ゼロ時 no-op・
既存本文の無改変・dry-run の非破壊・README 除外を機械固定）。

## 既存の `docs/CHANGELOG.md` は無改変

この方式に変えたのは**今後の追記方法だけ**。すでに `docs/CHANGELOG.md` に書かれている
履歴は 1 行も動かしていない。
