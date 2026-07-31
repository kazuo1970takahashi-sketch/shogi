#!/usr/bin/env bash
# =============================================================================
# check_test_inventory.sh — [TEST-INVENTORY-RENAME-001] テスト在庫ガード（rename 対応）
#   CI から渡された安定した base revision と HEAD を突き合わせ、**自動発見の対象から
#   テストが静かに消える変更だけ**を FAIL にする。
#
#   自動発見の対象（STAGE0-CONFLICT-FREE-001 / test/run_tests.sh と同一規則）:
#     test/ 直下の  test_*.js / test_*.sh / *_pgtest.sh
#     （サブディレクトリ配下は自動発見されないので「対象外」）
#
#   判定:
#     - 削除（D）                          … FAIL（在庫が減る）
#     - 対象 → 対象外への rename（R）      … FAIL（test/ の外へ移動・サブディレクトリ送り・
#                                             パターンから外れる改名。実行されなくなる）
#     - 対象 → 対象の rename（R）          … 許容（本スクリプトの主目的。在庫は減らない）
#     - 追加（A）・対象外 → 対象の rename  … 許容（在庫が増える）
#
#   比較元（base revision）の扱い:
#     - 未指定（空文字）    … SKIP（exit 0）。ローカル実行の既定。
#     - 40 桁ちょうどの全ゼロ SHA … SKIP（exit 0）。ブランチ作成 push の github.event.before は
#                              この値で、比較元が存在しない正常ケース。
#     - 実在しない revision … FAIL（exit 2）。取り違え・fetch 不足を黙って通さない（fail closed）。
#                              "0" / "000" / 39 桁・41 桁のゼロ列は GitHub が渡す値ではなく、
#                              切り詰め・取り違えの疑いがあるのでここに落ちる（SKIP しない）。
#
# なぜ rename 対応が要るか:
#   旧実装（test/run_tests.sh に直書き）は `--no-renames --diff-filter=D` だったため、
#   test/test_foo_001.js → test/test_foo_002.js のような**在庫が減らない改名**まで
#   「削除」と報告して CI を落としていた。ここでは rename 検出を有効にし、
#   移動先が自動発見の対象かどうかで判定する（在庫が減る移動だけを落とす）。
#   なお git の rename 検出は類似度 50%（既定）以上が対象。大幅に書き換えながらの改名は
#   削除＋追加として報告される＝FAIL に倒れる（安全側）。
#
# 使い方:
#   bash scripts/check_test_inventory.sh <base-rev> [--test-dir DIR]
#   bash scripts/check_test_inventory.sh                  # 位置引数なし → $TEST_INVENTORY_BASE
#   bash scripts/check_test_inventory.sh "" --test-dir /path/to/test
#
# 終了コード: 0 = 問題なし / SKIP、1 = 在庫が減る変更を検出、2 = 使い方・環境エラー。
# 依存: bash 3.2+ / git / awk。network 不使用。**read-only**（repo を 1 byte も書き換えない）。
# =============================================================================

set -uo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/test"
BASE=""
BASE_SET="no"

require_option_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "${1} には値が必要" >&2
    exit 2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --test-dir) require_option_value "$@"; TEST_DIR="$2"; shift 2 ;;
    # 先頭のヘッダコメントだけを出す（行番号固定にしないのでヘッダを増減しても壊れない）
    -h|--help)  awk 'NR==1 { next } /^#/ { print; next } { exit }' "${BASH_SOURCE[0]}"; exit 0 ;;
    --*)        echo "不明な引数: ${1}" >&2; exit 2 ;;
    *)
      if [ "$BASE_SET" = "yes" ]; then echo "位置引数が多い: ${1}" >&2; exit 2; fi
      BASE="$1"; BASE_SET="yes"; shift ;;
  esac
done

# 位置引数が 1 つも無いときだけ環境変数へフォールバックする。
# （空文字を明示指定した場合は「未指定 = SKIP」の意味で、環境変数に引きずられない）
if [ "$BASE_SET" = "no" ]; then BASE="${TEST_INVENTORY_BASE:-}"; fi

# --- 環境の確認 ---------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "git 不在 → テスト在庫ガードは SKIP"
  exit 0
fi
if [ ! -d "$TEST_DIR" ]; then
  echo "テストディレクトリがない: ${TEST_DIR}" >&2
  exit 2
fi
if ! git -C "$TEST_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "git work tree の外 → テスト在庫ガードは SKIP"
  exit 0
fi

# --- 比較元の解決（SKIP / fail closed の分岐） --------------------------------
if [ -z "$BASE" ]; then
  echo "TEST_INVENTORY_BASE 未指定 → 在庫比較（削除・移動検査）は SKIP"
  exit 0
fi
# 全ゼロ SHA（ブランチ作成 push の github.event.before）は比較元なしと同義。
# SKIP するのは **40 桁ちょうどの全ゼロ** だけ。"0" や "000"、39 桁・41 桁のゼロ列は
# GitHub が渡す値ではなく、変数の取り違え・切り詰めの疑いがある。ゼロ列というだけで
# SKIP すると在庫比較が黙って無効化されるので、実 revision として検証させ fail closed に倒す。
ZERO_SHA40='0000000000000000000000000000000000000000'
if [ "$BASE" = "$ZERO_SHA40" ]; then
  echo "比較元が全ゼロ SHA（ブランチ作成 push）→ 在庫比較は SKIP"
  exit 0
fi

TOP="$(git -C "$TEST_DIR" rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$TOP" ]; then
  echo "repo の toplevel を解決できない: ${TEST_DIR}" >&2
  exit 2
fi
# 自動発見の対象は test/ 直下。toplevel から見た test/ の位置（末尾 / 付き・toplevel 直下なら空）。
PREFIX="$(git -C "$TEST_DIR" rev-parse --show-prefix 2>/dev/null)"

if ! git -C "$TOP" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "HEAD を解決できない（コミットがない）" >&2
  exit 2
fi
if ! git -C "$TOP" cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "テスト在庫の比較元 revision を取得できない: ${BASE}" >&2
  exit 2
fi

# --- 自動発見の対象判定 -------------------------------------------------------
# is_discovered <path> — PREFIX 直下（サブディレクトリは対象外）で
#   test_*.js / test_*.sh / *_pgtest.sh のいずれかなら 0 を返す。
#   PREFIX は case のパターン中でも引用して literal 扱いにする（パスに [ や * を含む repo 対策）。
is_discovered() {
  _p="$1"
  if [ -n "$PREFIX" ]; then
    case "$_p" in
      "$PREFIX"*) _rest="${_p#"$PREFIX"}" ;;
      *) return 1 ;;
    esac
  else
    _rest="$_p"
  fi
  case "$_rest" in
    ''|*/*) return 1 ;;                     # 空 / サブディレクトリ配下は自動発見されない
  esac
  case "$_rest" in
    test_*.js|test_*.sh|*_pgtest.sh) return 0 ;;
  esac
  return 1
}

# --- 差分の取得と分類 ---------------------------------------------------------
# pathspec で test/ に絞らない: 絞ると「test/ の外へ出る rename」の移動先が落ちてしまい、
# rename ではなく削除として見えてしまう（対象内 rename と区別できなくなる）。
# 対象かどうかの判定は is_discovered（PREFIX + パターン）で行う。
#
# `-z` = NUL 区切り・引用なしの生パス。改行やタブは POSIX のパス名として合法で、
# 既定の --name-status（レコード = 行 / フィールド = タブ）ではそれらを含むパスが
# 別レコード・別フィールドに割れる＝対象判定が外れて **在庫が減る変更を見逃す**。
# NUL は shell 変数に格納できないので、NUL は常に **区切り** としてだけ扱い
# （read -d ''）、変数に入るのは NUL を含まないレコード本体だけにする。
# レコード構成: 状態（D / R100 …）→ パス。R / C は old → new の 2 パスを消費する。
DIFF_Z="$(mktemp "${TMPDIR:-/tmp}/check_test_inventory.XXXXXX" 2>/dev/null)"
if [ -z "$DIFF_Z" ] || [ ! -f "$DIFF_Z" ]; then
  echo "一時ファイルを作成できない（TMPDIR: ${TMPDIR:-/tmp}）" >&2
  exit 2
fi
trap 'rm -f "$DIFF_Z"' EXIT HUP INT TERM

if ! git -C "$TOP" diff -z --find-renames --diff-filter=DR \
     --name-status "$BASE" HEAD >"$DIFF_Z" 2>/dev/null; then
  echo "git diff に失敗した（比較元: ${BASE}）" >&2
  exit 2
fi

NL='
'
VIOLATIONS=''
ALLOWED=''
while IFS= read -r -d '' _status; do
  [ -n "$_status" ] || continue
  _code="${_status:0:1}"                    # R100 / R087 → R
  case "$_code" in
    R|C)                                    # 2 パス消費（C は --diff-filter 上出ないが念のため）
      IFS= read -r -d '' _src || break
      IFS= read -r -d '' _dst || break
      ;;
    *)                                      # D を含む残りは 1 パス消費
      IFS= read -r -d '' _src || break
      _dst=''
      ;;
  esac
  case "$_code" in
    D)
      if is_discovered "$_src"; then
        VIOLATIONS="${VIOLATIONS}  - 削除: ${_src}${NL}"
      fi
      ;;
    R)
      if is_discovered "$_src"; then
        if is_discovered "$_dst"; then
          ALLOWED="${ALLOWED}rename（自動発見の対象内）: ${_src} → ${_dst}${NL}"
        else
          VIOLATIONS="${VIOLATIONS}  - 自動発見の対象外への移動: ${_src} → ${_dst}${NL}"
        fi
      fi
      ;;
  esac
done <"$DIFF_Z"

if [ -n "$VIOLATIONS" ]; then
  echo "base revision から自動発見の対象が減っている（削除 / 対象外への移動）:" >&2
  # パス自体に改行を含みうるので整形（sed でのインデント付け）はしない＝そのまま出す
  printf '%s' "$VIOLATIONS" >&2
  echo "  ※ 改名は test/ 直下の test_*.js / test_*.sh / *_pgtest.sh 同士なら許容される。" >&2
  echo "  ※ 大幅な書き換えを伴う改名は git が rename と判定せず削除扱いになる（改名を単独コミットに分ける）。" >&2
  exit 1
fi

if [ -n "$ALLOWED" ]; then
  printf '%s' "$ALLOWED"
fi
echo "base revision からのテスト削除なし（自動発見の対象内 rename は許容）"
exit 0
