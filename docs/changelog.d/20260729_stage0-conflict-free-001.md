## STAGE0-CONFLICT-FREE-001: 調整ファイルの追記点衝突の除去（並行実装の解禁）

- **問題**: 全スライスが `test/run_tests.sh` の末尾と `docs/CHANGELOG.md` を編集していたため、共有の追記点で必ず衝突していた。SPLIT-FEASIBILITY-001 §5 の実測では、直近 20 隣接ペアの並行開発衝突 18 件のうち **12 件（60%）がこの 2 ファイルの追記点だけ**に起因していた（`shogi_v4.html` のモノリスとは無関係）。
- **① テスト登録を「末尾追記」から「自動発見」へ**: `test/test_*.js` と `test/test_*.sh` / `test/*_pgtest.sh` を glob + sort（`LC_ALL=C`）で自動発見して実行する。見出しはテストファイル先頭のコメント行から採る（`// @suite: 説明` で明示上書き可）。**以後、新規テストは `test/` にファイルを置くだけで、`run_tests.sh` に diff は出ない。** 明示リストは 2 種のみ維持（`RETIRED_TESTS` = 撤去済みスタブ `test_start_003.js`／`NO_TARGET_TESTS` = 従来から引数なし呼び出しの 2 本）。
- **走査漏れ検査を追加**: git 追跡テストのうち自動発見されなかったものを FAIL にする（旧方式の warn「登録済みだがファイルが無い」の代替）。正常時は PASS を増やさない。
- **② CHANGELOG を「本体直接編集」から「断片方式」へ**: 各スライスは `docs/changelog.d/<YYYYMMDD>_<スライスID>.md` を 1 本置くだけ。リリース列車の組成時に `bash scripts/changelog_merge.sh` が日付順で本体へ連結し、断片を削除する（冪等・断片ゼロなら no-op）。既存の `docs/CHANGELOG.md` の内容は無改変。
- **既定の連結位置は末尾**: `docs/CHANGELOG.md` は「記載は原文の並び（おおむね時系列・上が古い）」と明記し、直近スライスも実際に末尾へ追記している（例: SB-LIVE-SELECT-WIDTH-001 = `@@ -183,3 +183,10 @@`）。ブリーフの文言は「冒頭追記」だったが、実態と本文の宣言に合わせて末尾を既定とし、`--position top` で切替可能にした。
- **検証**: ①は旧 `run_tests.sh` から機械抽出した登録 187 件と新方式の実行 187 件が完全一致（旧のみ 0・新のみ 0）、フルスイート PASS=233 / FAIL=0 / WARN=0 で変更前と同値。②は `test/test_changelog_merge.sh` 24 項（順序・冪等・no-op・既存本文無改変・dry-run 非破壊・README 除外・`--position top`・不正入力の拒否）が bash 5.3 / macOS bash 3.2.57 × C / ja_JP.UTF-8 ロケールで全 PASS。Review Level L4。
- **この断片自体が新方式の実例**（`docs/CHANGELOG.md` は本スライスでも 1 行も編集していない）。
