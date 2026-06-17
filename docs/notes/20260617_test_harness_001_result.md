# TEST-HARNESS-001 実装結果メモ — data_*.json 不在時の run_tests.sh 常時FAIL解消

| 項目 | 値 |
|---|---|
| ID | TEST-HARNESS-001 |
| 種別 | テストハーネス修正（`test/run_tests.sh` のみ・`shogi_v4.html` 無変更） |
| 日付 | 2026-06-17 |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `b33e7b6`（#229=FRP-IMPL-003 merge 後の HEAD、parent `3394e4a`=#228） |
| branch | `test/test-harness-001-skip-missing-data-fixtures` |
| 状態 | Draft・未 merge（Ready化 / merge / production 反映は別途・人間の明示承認後） |

> orphan clean base は **実データ非コミット方針**のため `test/data_*.json` fixture を含まない。
> 既存 `run_tests.sh` は当該 glob が不一致でも**未展開のリテラルパス**（`…/data_*.json`）を Python に渡すため、
> `FileNotFoundError` / `Traceback` を出して **常時 FAIL=1** になっていた。
> 本修正で fixture 不在時を **skip（info 表示・FAIL/WARN 非加算）** とし、回帰検出の見通しを改善する。
> **fixture が存在する場合の検証内容（JSONパース可否 → ok/ng）は従来どおり維持**。

---

## 1. 背景（FAIL=1 の正体）

`test/run_tests.sh` の「第3層補足: テストデータでの normalizeState 堅牢性確認」ブロックは、
クリーンな orphan base チェックアウト（tracked file のみ）で必ず1件 FAIL していた。

```
✗ data_*: Python例外/エラー → Traceback (most recent call last):
```

原因は bash の既定 glob 挙動。`for f in "$SCRIPT_DIR"/data_*.json` は一致ファイルが
0件のとき**パターン文字列そのまま**（`…/test/data_*.json`）を `$f` に代入する。その literal を
`python3 -c "... open('$f') ..."` に渡すため `FileNotFoundError` となり、`ng`（FAIL+1）が呼ばれていた。

この FAIL は FRP-IMPL-003（#229）とは無関係の**既存テストハーネス要因**であり、
HANDOFF.md でも従来「FAIL=1 は既存 `data_*` 環境要因」と注記されていた。

## 2. 修正内容（`test/run_tests.sh` の1ブロックのみ）

`nullglob` で glob を配列展開し、**0件なら skip（info 行・FAIL/WARN 非加算）**、
**1件以上なら従来どおりの検証ループ**を回す。検証ループ本体（`json.load` → `ok`/`ng`）は無改変。

```bash
shopt -s nullglob
data_fixtures=( "$SCRIPT_DIR"/data_*.json )
shopt -u nullglob
if [ "${#data_fixtures[@]}" -eq 0 ]; then
  echo "  ℹ data_*.json fixture が見つからないためスキップ（FAIL/WARN 非加算）"
else
  for f in "${data_fixtures[@]}"; do
    # 既存検証ロジック（JSONパース → ok/ng）を無改変で実行
    ...
  done
fi
```

- `shopt -s nullglob` … glob 不一致時に**未展開リテラルを残さず空に**する。
- `shopt -u nullglob` … 取得直後に既定挙動へ復帰（他ブロックへの副作用なし。本スクリプト内の glob 利用は本ブロックのみ）。
- スキップ表示は `ok`/`ng`/`warn` を呼ばず**素の echo**（`ℹ`）にとどめ、PASS/FAIL/WARN いずれも増やさない。
- 本スクリプトは先頭コメントどおり `set -e` 不使用。`set -euo pipefail` との整合懸念は対象外（既存方針を踏襲）。

## 3. 検証

### 3.1 クリーン orphan base（fixture 不在 = 本来の対象環境）

`git worktree` で `b33e7b6` を素のままチェックアウト（tracked file のみ・`data_*.json` なし）し実行。

| | PASS | FAIL | WARN |
|---|---|---|---|
| before（修正前） | 64 | **1** | 35 |
| after（修正後） | 64 | **0** | 35 |

- before/after の差分は **3行のみ**: 当該データ行（`✗ Traceback` → `ℹ skip`）・結果サマリ（`FAIL=1` → `FAIL=0`）・合否行。
- **WARN 35行は before/after で byte 一致**（既存 WARN 内容は不変）。
- `Traceback` / `FileNotFoundError` の出力は **0件**。
- スクリプト exit code = **0**。

### 3.2 FRP テストの assert 数（ログ上確認）

- `FRP-IMPL-002 テスト: PASS 79件 / FAIL 0件`（維持）
- `FRP-IMPL-003 テスト: PASS 64件 / FAIL 0件`（維持）

### 3.3 fixture が存在する場合の挙動（変更ブロック単体の再現テスト）

修正後ブロックを `SCRIPT_DIR` 差し替えで単体実行し、3シナリオを確認。

| シナリオ | 入力 | 結果 |
|---|---|---|
| 不在 | `data_*.json` 0件 | skip（`ℹ`）・PASS=0 FAIL=0 WARN=0 |
| 正常 | 有効 JSON 2件 | 2件とも `JSONパースOK`・PASS=2 FAIL=0 |
| 破損混在 | 有効 JSON 2件 + 不正 JSON 1件 | 有効2件 PASS・不正1件 `✗`（FAIL=1） |

→ **fixture 存在時の検証内容は不変**。**壊れた fixture は従来どおり FAIL**。

## 4. 制約遵守

- `shogi_v4.html` 機能変更 **なし**（diff 0）。
- `index.html` / `package*` / `.github`（workflow） **無変更**。
- FRP-IMPL-004 以降 **未着手**。
- Ready化 / merge / branch 削除 / deploy / publish / release / production 反映 **なし**。
- `main` / production / orphan base への直接 push **なし**（作業ブランチのみ）。
- #222 / #223 / #229 への操作 **なし**。

## 5. 変更ファイル一覧

- `test/run_tests.sh`（data_*.json ブロックを nullglob skip 化）
- `HANDOFF.md`（本タスクの追記）
- `docs/notes/20260617_test_harness_001_result.md`（本ファイル・新規）
