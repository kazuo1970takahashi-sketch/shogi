# AUTO001-GATE-SCRIPT-BASH32-001 結果メモ

- 日付: 2026-06-19
- branch: `fix/auto001-gate-script-bash32-001`
- base: orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` @ `2834ed4b68bed8451614367c7560cfbc730a5d31`（#241 直上）

## 目的

PR #242（gate companion test）の review で判明した、orphan gate スクリプトの **Bash 3.2 / macOS UTF-8 ロケール + `set -u` 互換バグ**を、Bash 変数 bracing のみで最小修正する（ロジック・文言・挙動は不変）。#242 の test 移植 PR は本修正 merge 後に別途 recut する。

## バグの再現条件と機序

- `set -u` 有効時、`$VAR` の直後に**全角日本語記号など多バイト文字**（例 `（`= UTF-8 `EF BC 88`）が隣接する箇所で、**Bash 3.2 が UTF-8 ロケールにおいて多バイト文字の先頭バイトを変数名に取り込んでしまう** → 取り込んだ名前（例 `PR_BASE\xEF`）が未定義 → `set -u` が `unbound variable` で異常終了（rc≠想定）。
- **ロケール依存**: `LC_ALL=C`（本環境の既定＝`LANG` 空）では多バイトを 1 バイトずつ扱い 0xEF は識別子文字でないため**再現しない**。`en_US.UTF-8` / `ja_JP.UTF-8` / `C.UTF-8`（macOS Terminal で一般的）では**再現する**。
- 実測（`/bin/bash` 3.2.57）:
  - `LC_ALL=C   bash -c 'set -u; PR_BASE=main; echo "$PR_BASE（x）"'` → rc=0（正常）
  - `LC_ALL=en_US.UTF-8 …（同上 unbraced）` → **rc=127 `PR_BASE�: unbound variable`**
  - `LC_ALL=en_US.UTF-8 …（`${PR_BASE}（` braced）` → rc=0（正常）

## 修正箇所（`$VAR` → `${VAR}` のみ・6 箇所）

現 base で再確認した、**`$VAR` の直後が多バイト文字**の箇所のみを brace 化（ASCII 隣接の変数や空白隣接の `$PROFILE` 等は対象外＝不変）:

- `scripts/shogi_tour_pr_gate.sh:358` `$PRODUCTION_BRANCH（` → `${PRODUCTION_BRANCH}（`
- `scripts/shogi_tour_pr_gate.sh:368` `$PR_BASE（` → `${PR_BASE}（`（タスク指定）
- `scripts/shogi_tour_pr_gate.sh:376` `$PRODUCTION_BRANCH（` → `${PRODUCTION_BRANCH}（`
- `scripts/shogi_tour_pr_gate.sh:397` `$_ms（` → `${_ms}（`（タスク指定）
- `scripts/shogi_tour_approved_merge.sh:278` `$PR_DRAFT）` → `${PR_DRAFT}）`
- `scripts/shogi_tour_approved_merge.sh:331` `$_head_sha）` → `${_head_sha}）`（タスク指定）

diff numstat = `pr_gate.sh 4/4`・`approved_merge.sh 2/2`（純 bracing・各行は ${} 化のみ）。ロジック・文言・挙動変更なし。`bash -n` 両方 OK。再スキャン（`$VAR`+多バイト隣接）= **残り 0**。

## 検証（実 GitHub / 実 origin / network 非依存）

- `bash -n scripts/shogi_tour_pr_gate.sh` / `scripts/shogi_tour_approved_merge.sh` → OK。
- **#242 test を実 scripts に対し再実行（mock gh + git stub）**:
  - `LC_ALL=C`（既定）: UNFIXED でも `PASS=74/FAIL=0`（このロケールでは元々再現しない）。
  - `LC_ALL=en_US.UTF-8`: **UNFIXED scripts → FAIL=5**（gate が line 368/397 で、amerge が line 331 で `unbound variable` 異常終了）。
- **FIXED vs UNFIXED を同一 mock 環境・`en_US.UTF-8` で in-place 実行**（#242 worktree のファイルは無変更・読み取りのみ）:
  - line 368（gate orphan-dev base=production → BLOCKED 20）: **FIXED=rc20/no-unbound** ／ UNFIXED=rc1/UNBOUND
  - line 397（gate mergeStateStatus!=CLEAN → NEEDS_REVIEW 10）: **FIXED=rc10/no-unbound** ／ UNFIXED=rc1/UNBOUND
  - line 278/331（amerge --execute --yes Step8）: **FIXED=rc0/no-unbound** ／ UNFIXED=rc1/UNBOUND
  - → 今回の Bash 3.2 / UTF-8 / `set -u` 起因 FAIL は本修正で**解消**。
- `npm test`（本 worktree）: baseline 維持（run_tests.sh は orphan base 版で gate ブロック未搭載＝scripts fix の影響なし）。
- `npx html-validate shogi_v4.html`: exit 0（shogi_v4.html 不変）。
- secret/PII grep: 実データ・トークンなし。

## 非実施・据え置き
- **#242 には一切触れていない**（branch/worktree への commit/rebase/push なし。scripts は read-only で in-place 実行のみ）。`approved_merge.sh --execute` は実 GitHub に対して未実行（mock 上のみ）。
- 変更は `scripts/` 2 本の bracing と本メモのみ。`test/`・`docs/ops/`・`shogi_v4.html`・`index.html`・`.gitignore`・`.github`・`docs/operations/`・production・実データ は非接触。
- Ready 化 / merge / branch 削除 / rebase / force push / deploy / release / production 反映なし（Draft 停止）。main `832bc5a` / production `9693a83` / orphan `2834ed4` 不変。
- 後続: 本修正 merge 後に #242 を recut（companion test を新 base から再作成）。
