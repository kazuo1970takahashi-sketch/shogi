#!/usr/bin/env bash
# =============================================================================
# test_check_test_inventory.sh — [TEST-INVENTORY-RENAME-001] 在庫ガードの単体テスト
#   scripts/check_test_inventory.sh を、使い捨ての sandbox repo（mktemp -d + git init）
#   に対してだけ実行する。**この repo の履歴・作業ツリーには一切触れない**。
#
#   固定する性質:
#     - 対象 → 対象の rename は許容（本スライスの主目的・在庫は減らない）
#     - 削除は FAIL / 対象 → 対象外（test/ の外・サブディレクトリ・パターン外）の rename は FAIL
#     - 追加・対象外 → 対象の rename は許容
#     - 改行・タブを含むファイル名（POSIX 上は合法）でも上記の判定が崩れない
#     - 比較元が空文字 / 40 桁ちょうどの全ゼロ SHA は SKIP（exit 0）
#     - 比較元が実在しない revision（"0" / "000" / 39 桁・41 桁のゼロ列を含む）は FAIL closed（exit 2）
#     - 使い方エラー（不明な引数・位置引数過多・値なし --test-dir・test dir 不在）は exit 2
#     - git work tree の外は SKIP（exit 0）
#     - read-only（sandbox の作業ツリーを 1 byte も変えない）
#
# 再帰について: 本テストは test/run_tests.sh を**呼ばない**。run_tests.sh は自動発見で
#   本ファイルを実行するため、ここから run_tests.sh を呼ぶと無限再帰になる。
#   検証対象は常に scripts/check_test_inventory.sh 単体。
#
# 安全: network / gh 不使用。mutating な git 操作は sandbox 内のみ（実データなし・架空 fixture）。
# 使い方: bash test/test_check_test_inventory.sh
# set -e は使わない（個別に判定するため）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="$SCRIPT_DIR/../scripts/check_test_inventory.sh"
ZERO_SHA='0000000000000000000000000000000000000000'
ZERO_39="${ZERO_SHA%0}"                                 # 39 桁: GitHub が渡す値ではない
ZERO_41="${ZERO_SHA}0"                                  # 41 桁: 同上
ABSENT_SHA='1234567890123456789012345678901234567890'   # 形式は正しいが存在しない架空 SHA

# 改行・タブを含むファイル名（'/' と NUL 以外は POSIX のパス名として合法）。
# git diff --name-status を「行 = レコード / タブ = フィールド」で読むと、これらのパスは
# 別レコード・別フィールドに割れて対象判定が外れる＝在庫が減る変更を見逃す。
# ガードが -z（NUL 区切り）で読めていることをこの fixture で固定する。
TAB_JS=$'test_tab\tname_001.js'
TAB_JS2=$'test_tab\tname_002.js'
NL_SH=$'test_nl\nname_001.sh'
NL_SH2=$'test_nl\nname_002.sh'

PASS=0
FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  TEST-INVENTORY-RENAME-001 在庫ガード単体テスト"
echo "=========================================="

if [ ! -f "$GUARD" ]; then echo "✗ scripts/check_test_inventory.sh がない"; exit 1; fi
if ! command -v git >/dev/null 2>&1; then echo "⚠ git 不在 → このテストは実行できない"; exit 0; fi

bash -n "$GUARD" && ok "check_test_inventory.sh 構文 OK (bash -n)" || ng "check_test_inventory.sh 構文エラー"
bash -n "$0"     && ok "このテスト自身 構文 OK (bash -n)"          || ng "このテスト自身 構文エラー"

SBX="$(mktemp -d)"
trap 'rm -rf "$SBX"' EXIT

# --- sandbox ヘルパ -----------------------------------------------------------
# g <repo> <git 引数...> — 実行者の global 設定・hook・署名に依存しない git
g() {
  _gr="$1"; shift
  git -C "$_gr" -c user.name='inventory-test' -c user.email='inventory-test@example.invalid' \
      -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@"
}

# body <名前> — rename 検出（既定の類似度 50%）が効く程度の中身を作る
body() {
  cat <<EOF
// 架空のテスト fixture: $1
var name = '$1';
function main() {
  if (name !== '$1') { throw new Error('mismatch'); }
  return 0;
}
main();
EOF
}

# mkrepo <名前> [--flat] — base コミットを 1 つ持つ使い捨て repo を作り、パスを stdout に返す
#   既定: repo/test/ 配下にテストを置く（本番同様 PREFIX="test/"）
#   --flat: repo 直下にテストを置く（PREFIX="" 分岐の確認用）
mkrepo() {
  _rp="$SBX/$1"
  _flat="${2:-}"
  rm -rf "$_rp"
  if [ "$_flat" = "--flat" ]; then _td="$_rp"; else _td="$_rp/test"; fi
  mkdir -p "$_td"
  g_init_dir="$_rp"
  git init -q "$_rp" >/dev/null 2>&1
  body alpha > "$_td/test_alpha_001.js"
  body beta  > "$_td/test_beta_001.sh"
  body gamma > "$_td/gamma_pgtest.sh"
  body helper > "$_td/helper_notatest.js"
  body tabbed  > "$_td/$TAB_JS"             # 名前にタブを含む対象テスト
  body newline > "$_td/$NL_SH"              # 名前に改行を含む対象テスト
  mkdir -p "$_rp/docs"
  echo 'doc' > "$_rp/docs/note.md"
  g "$_rp" add -A >/dev/null 2>&1
  g "$_rp" commit -q -m 'base' --no-verify >/dev/null 2>&1
  printf '%s' "$_rp"
}

base_sha() { g "$1" rev-parse HEAD; }

commit_all() { g "$1" add -A >/dev/null 2>&1; g "$1" commit -q -m "${2:-change}" --no-verify >/dev/null 2>&1; }

# run_guard <repo> <base> [--flat] — ガードを実行し、rc を GRC / 出力を GOUT に入れる
run_guard() {
  _rr="$1"; _rb="$2"
  if [ "${3:-}" = "--flat" ]; then _rt="$_rr"; else _rt="$_rr/test"; fi
  GOUT="$(bash "$GUARD" "$_rb" --test-dir "$_rt" 2>&1)"
  GRC=$?
}

# expect_rc <期待 rc> <説明>
expect_rc() {
  if [ "$GRC" = "$1" ]; then ok "$2 (rc=$GRC)"; else ng "$2 (expected rc=$1 actual rc=$GRC) :: $(printf '%s' "$GOUT" | tr '\n' ' ')"; fi
}

# expect_out <部分文字列> <説明>
expect_out() {
  case "$GOUT" in
    *"$1"*) ok "$2" ;;
    *) ng "$2 (出力に「$1」がない) :: $(printf '%s' "$GOUT" | tr '\n' ' ')" ;;
  esac
}

# -----------------------------------------------------------------------------
# 1. 比較元の扱い（SKIP / fail closed）
# -----------------------------------------------------------------------------
echo ""
echo "【1】比較元 revision の扱い"

R="$(mkrepo skipcases)"
B="$(base_sha "$R")"

run_guard "$R" ""
expect_rc 0 "空文字の比較元は SKIP"
expect_out "SKIP" "空文字: SKIP と表示される"

run_guard "$R" "$ZERO_SHA"
expect_rc 0 "全ゼロ SHA（ブランチ作成 push）は SKIP"
expect_out "全ゼロ" "全ゼロ SHA: 理由が表示される"

# 空文字 SKIP が「実は削除を見逃しただけ」ではないことを、同じ repo の削除ケースで示す
g "$R" rm -q "$R/test/test_alpha_001.js" >/dev/null 2>&1
commit_all "$R" 'delete alpha'
run_guard "$R" ""
expect_rc 0 "削除があっても比較元が空なら SKIP（比較していない）"
run_guard "$R" "$ZERO_SHA"
expect_rc 0 "削除があっても全ゼロ SHA なら SKIP"
run_guard "$R" "$B"
expect_rc 1 "同じ削除を実在 base と比べると FAIL（SKIP が素通しでない証明）"

run_guard "$R" "$ABSENT_SHA"
expect_rc 2 "実在しない非ゼロ SHA は fail closed"
expect_out "比較元 revision を取得できない" "実在しない SHA: 理由が表示される"

run_guard "$R" "no-such-ref"
expect_rc 2 "実在しない ref 名も fail closed"

# ゼロ列というだけで SKIP してはいけない。SKIP してよいのは 40 桁ちょうどの全ゼロだけで、
# それ以外のゼロ列は変数の取り違え・切り詰めの疑い＝在庫比較を黙って無効化させない。
run_guard "$R" "0"
expect_rc 2 "1 桁の \"0\" は全ゼロ SHA ではなく fail closed"
expect_out "比較元 revision を取得できない" "\"0\": 理由が表示される"

run_guard "$R" "000"
expect_rc 2 "3 桁の \"000\" は全ゼロ SHA ではなく fail closed"

run_guard "$R" "$ZERO_39"
expect_rc 2 "39 桁のゼロ列（切り詰め疑い）は fail closed"

run_guard "$R" "$ZERO_41"
expect_rc 2 "41 桁のゼロ列は fail closed"

run_guard "$R" "$ZERO_SHA"
expect_rc 0 "40 桁ちょうどの全ゼロだけが SKIP（境界の再確認）"

# -----------------------------------------------------------------------------
# 2. 削除・rename・追加の判定（PREFIX="test/"）
# -----------------------------------------------------------------------------
echo ""
echo "【2】削除 / rename / 追加の判定"

# 2-1. 対象 → 対象の rename（本スライスの主目的）
R="$(mkrepo rename_ok)"; B="$(base_sha "$R")"
g "$R" mv "$R/test/test_alpha_001.js" "$R/test/test_alpha_002.js" >/dev/null 2>&1
g "$R" mv "$R/test/test_beta_001.sh" "$R/test/test_beta_002.sh" >/dev/null 2>&1
g "$R" mv "$R/test/gamma_pgtest.sh" "$R/test/gamma2_pgtest.sh" >/dev/null 2>&1
commit_all "$R" 'rename within discovery'
run_guard "$R" "$B"
expect_rc 0 "対象 → 対象の rename は許容（.js / .sh / _pgtest.sh の 3 パターン）"
expect_out "test/test_alpha_001.js → test/test_alpha_002.js" "許容された rename が可視化される"

# 2-2. 削除
R="$(mkrepo deleted)"; B="$(base_sha "$R")"
g "$R" rm -q "$R/test/test_alpha_001.js" >/dev/null 2>&1
commit_all "$R" 'delete'
run_guard "$R" "$B"
expect_rc 1 "対象テストの削除は FAIL"
expect_out "削除" "削除: 理由が表示される"

# 2-3. 対象 → 対象外の rename（test/ の外へ）
R="$(mkrepo moved_out)"; B="$(base_sha "$R")"
mkdir -p "$R/archive"
g "$R" mv "$R/test/test_alpha_001.js" "$R/archive/test_alpha_001.js" >/dev/null 2>&1
commit_all "$R" 'move out of test/'
run_guard "$R" "$B"
expect_rc 1 "test/ の外への移動は FAIL"
expect_out "対象外への移動" "test/ 外への移動: 理由が表示される"

# 2-4. 対象 → 対象外の rename（サブディレクトリ送り＝自動発見されない）
R="$(mkrepo moved_subdir)"; B="$(base_sha "$R")"
mkdir -p "$R/test/legacy"
g "$R" mv "$R/test/test_alpha_001.js" "$R/test/legacy/test_alpha_001.js" >/dev/null 2>&1
commit_all "$R" 'move to subdir'
run_guard "$R" "$B"
expect_rc 1 "test/ サブディレクトリ送りは FAIL（自動発見されなくなる）"

# 2-5. 対象 → 対象外の rename（パターンから外れる改名）
R="$(mkrepo renamed_offpattern)"; B="$(base_sha "$R")"
g "$R" mv "$R/test/test_alpha_001.js" "$R/test/alpha_001_test.js" >/dev/null 2>&1
commit_all "$R" 'rename off pattern'
run_guard "$R" "$B"
expect_rc 1 "パターンから外れる改名（test_ 接頭辞の喪失）は FAIL"

R="$(mkrepo renamed_offext)"; B="$(base_sha "$R")"
g "$R" mv "$R/test/test_alpha_001.js" "$R/test/test_alpha_001.txt" >/dev/null 2>&1
commit_all "$R" 'rename off extension'
run_guard "$R" "$B"
expect_rc 1 "パターンから外れる改名（拡張子の喪失）は FAIL"

# 2-6. 追加・対象外 → 対象の rename は在庫が増える＝許容
R="$(mkrepo additions)"; B="$(base_sha "$R")"
body delta > "$R/test/test_delta_001.js"
g "$R" mv "$R/test/helper_notatest.js" "$R/test/test_helper_001.js" >/dev/null 2>&1
commit_all "$R" 'add and promote'
run_guard "$R" "$B"
expect_rc 0 "追加・対象外 → 対象の rename は許容"

# 2-7. 対象外ファイルの削除・移動は関知しない
R="$(mkrepo unrelated)"; B="$(base_sha "$R")"
g "$R" rm -q "$R/docs/note.md" "$R/test/helper_notatest.js" >/dev/null 2>&1
commit_all "$R" 'delete unrelated'
run_guard "$R" "$B"
expect_rc 0 "自動発見の対象でないファイルの削除は FAIL にしない"

# 2-8. 大幅な書き換えを伴う改名は rename と判定されず削除扱い＝安全側に FAIL
R="$(mkrepo rewrite_rename)"; B="$(base_sha "$R")"
g "$R" rm -q "$R/test/test_alpha_001.js" >/dev/null 2>&1
printf '// 全面書き換え\nvar x = 1;\n' > "$R/test/test_alpha_002.js"
commit_all "$R" 'rewrite while renaming'
run_guard "$R" "$B"
expect_rc 1 "類似度が低い改名は削除扱いで FAIL（安全側・ドキュメント通り）"

# 2-9. 改行・タブを含むファイル名（-z / NUL 区切りで読めていないと判定が外れる）
#   行 / タブ区切りで読む実装だと、下の 3 ケースはいずれも「対象ではないパス」に化けて
#   すり抜ける（削除・対象外への移動が rc=0 になる）。
R="$(mkrepo weird_delete)"; B="$(base_sha "$R")"
g "$R" rm -q "$R/test/$TAB_JS" "$R/test/$NL_SH" >/dev/null 2>&1
commit_all "$R" 'delete weird names'
run_guard "$R" "$B"
expect_rc 1 "名前にタブ / 改行を含む対象テストの削除は FAIL"
expect_out "$TAB_JS" "タブを含むファイル名がそのまま報告される"
expect_out "$NL_SH" "改行を含むファイル名がそのまま報告される"

R="$(mkrepo weird_rename_ok)"; B="$(base_sha "$R")"
g "$R" mv "$R/test/$TAB_JS" "$R/test/$TAB_JS2" >/dev/null 2>&1
g "$R" mv "$R/test/$NL_SH" "$R/test/$NL_SH2" >/dev/null 2>&1
commit_all "$R" 'rename weird names within discovery'
run_guard "$R" "$B"
expect_rc 0 "名前にタブ / 改行を含む 対象 → 対象の rename は許容"
expect_out "test/$TAB_JS → test/$TAB_JS2" "タブを含む許容 rename が可視化される"
expect_out "test/$NL_SH → test/$NL_SH2" "改行を含む許容 rename が可視化される"

R="$(mkrepo weird_rename_ng)"; B="$(base_sha "$R")"
mkdir -p "$R/archive"
g "$R" mv "$R/test/$TAB_JS" "$R/archive/$TAB_JS" >/dev/null 2>&1
commit_all "$R" 'move tab name out of test/'
run_guard "$R" "$B"
expect_rc 1 "名前にタブを含むテストの test/ 外への移動は FAIL"
expect_out "対象外への移動" "タブを含む対象外移動: 理由が表示される"

R="$(mkrepo weird_rename_ng_subdir)"; B="$(base_sha "$R")"
mkdir -p "$R/test/legacy"
g "$R" mv "$R/test/$NL_SH" "$R/test/legacy/$NL_SH" >/dev/null 2>&1
commit_all "$R" 'move newline name to subdir'
run_guard "$R" "$B"
expect_rc 1 "名前に改行を含むテストのサブディレクトリ送りは FAIL"

# 2-10. 変更なしの比較は許容
R="$(mkrepo nochange)"; B="$(base_sha "$R")"
run_guard "$R" "$B"
expect_rc 0 "base == HEAD（差分なし）は許容"
expect_out "テスト削除なし" "差分なし: 正常メッセージ"

# -----------------------------------------------------------------------------
# 3. PREFIX="" 分岐（repo 直下がテストディレクトリ）
# -----------------------------------------------------------------------------
echo ""
echo "【3】repo 直下がテストディレクトリのとき（PREFIX 空）"

R="$(mkrepo flat_ok --flat)"; B="$(base_sha "$R")"
g "$R" mv "$R/test_alpha_001.js" "$R/test_alpha_002.js" >/dev/null 2>&1
commit_all "$R" 'flat rename'
run_guard "$R" "$B" --flat
expect_rc 0 "repo 直下でも 対象 → 対象の rename は許容"

R="$(mkrepo flat_ng --flat)"; B="$(base_sha "$R")"
mkdir -p "$R/sub"
g "$R" mv "$R/test_alpha_001.js" "$R/sub/test_alpha_001.js" >/dev/null 2>&1
commit_all "$R" 'flat move to subdir'
run_guard "$R" "$B" --flat
expect_rc 1 "repo 直下でもサブディレクトリ送りは FAIL"

# -----------------------------------------------------------------------------
# 4. 使い方・環境エラー
# -----------------------------------------------------------------------------
echo ""
echo "【4】使い方・環境エラー"

R="$(mkrepo usage)"; B="$(base_sha "$R")"

GOUT="$(bash "$GUARD" "$B" --unknown-flag 2>&1)"; GRC=$?
expect_rc 2 "不明な引数は exit 2"

GOUT="$(bash "$GUARD" "$B" "$B" 2>&1)"; GRC=$?
expect_rc 2 "位置引数が多いときは exit 2"

GOUT="$(bash "$GUARD" "$B" --test-dir 2>&1)"; GRC=$?
expect_rc 2 "--test-dir に値がないときは exit 2"

GOUT="$(bash "$GUARD" "$B" --test-dir "$SBX/does-not-exist" 2>&1)"; GRC=$?
expect_rc 2 "テストディレクトリ不在は exit 2"

# git work tree の外 → SKIP（非ゼロ base を渡しても比較に入らない）
mkdir -p "$SBX/outside/test"
GOUT="$(bash "$GUARD" "$ABSENT_SHA" --test-dir "$SBX/outside/test" 2>&1)"; GRC=$?
expect_rc 0 "git work tree の外は SKIP"
expect_out "SKIP" "work tree 外: SKIP と表示される"

GOUT="$(bash "$GUARD" --help 2>&1)"; GRC=$?
expect_rc 0 "--help は exit 0"
expect_out "使い方:" "--help: 使い方が出る"
if printf '%s' "$GOUT" | grep -q 'set -uo pipefail'; then
  ng "--help がヘッダを超えて実装コードまで出力している"
else
  ok "--help の出力はヘッダコメントに収まっている"
fi

# 位置引数なしのときだけ環境変数へフォールバックする
R="$(mkrepo envfallback)"; B="$(base_sha "$R")"
g "$R" rm -q "$R/test/test_alpha_001.js" >/dev/null 2>&1
commit_all "$R" 'delete'
GOUT="$(TEST_INVENTORY_BASE="$B" bash "$GUARD" --test-dir "$R/test" 2>&1)"; GRC=$?
expect_rc 1 "位置引数なし: TEST_INVENTORY_BASE を採用して削除を検出"
GOUT="$(TEST_INVENTORY_BASE="$B" bash "$GUARD" "" --test-dir "$R/test" 2>&1)"; GRC=$?
expect_rc 0 "空文字の明示指定は環境変数に引きずられず SKIP"

# -----------------------------------------------------------------------------
# 5. read-only であること
# -----------------------------------------------------------------------------
echo ""
echo "【5】read-only（sandbox を書き換えない）"

R="$(mkrepo readonly)"; B="$(base_sha "$R")"
g "$R" mv "$R/test/test_alpha_001.js" "$R/test/test_alpha_002.js" >/dev/null 2>&1
commit_all "$R" 'rename'
_before_status="$(g "$R" status --porcelain)"
_before_head="$(base_sha "$R")"
run_guard "$R" "$B"
_after_status="$(g "$R" status --porcelain)"
_after_head="$(base_sha "$R")"
if [ "$_before_status" = "$_after_status" ] && [ "$_before_head" = "$_after_head" ]; then
  ok "ガード実行後も作業ツリー・HEAD は不変"
else
  ng "ガードが repo を書き換えた（status/HEAD が変化）"
fi

# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] && echo "  ✓ 在庫ガード単体テスト 全PASS ($PASS 件)" && exit 0
echo "  ✗ 在庫ガード単体テストに失敗あり"
exit 1
