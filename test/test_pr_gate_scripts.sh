#!/usr/bin/env bash
# =============================================================================
# test_pr_gate_scripts.sh — SHOGI-TOUR-AUTO-001 の PR Gate / Approved Merge
#                            スクリプトの簡易 shell テスト
#
# 使い方: bash test/test_pr_gate_scripts.sh
#
# 検証内容:
#   - bash -n による構文チェック（shellcheck が無い環境向け。あれば shellcheck も）
#   - classify_path / realdata_risk_path / valid_profile の単体テスト（source して関数直呼び）
#   - 引数不足・profile 不正でエラー終了すること
#   - dry-run がデフォルトであること
#   - --execute なしでは gh pr ready / gh pr merge を呼ばないこと（mock gh で検証）
#   - --execute でも対話確認/--yes が無ければ merge せず中止すること
#   - 承認あり実行時に merge は --squash で、--delete-branch を使わないこと（mock gh で検証）
#
# set -e は使わない（個別に判定するため）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/../scripts/shogi_tour_pr_gate.sh"
AMERGE="$SCRIPT_DIR/../scripts/shogi_tour_approved_merge.sh"

PASS=0
FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

# expect_eq <actual> <expected> <label>
expect_eq() {
  if [ "$1" = "$2" ]; then ok "$3 ($1)"; else ng "$3 (expected=$2 actual=$1)"; fi
}
# expect_rc <actual_rc> <expected_rc> <label>
expect_rc() {
  if [ "$1" = "$2" ]; then ok "$3 (rc=$1)"; else ng "$3 (expected rc=$2 actual rc=$1)"; fi
}

echo "=========================================="
echo "  SHOGI-TOUR-AUTO-001 PR Gate/Merge テスト"
echo "=========================================="

# -----------------------------------------------------------------------------
# 0. 構文チェック
# -----------------------------------------------------------------------------
echo ""
echo "【0】構文チェック"
bash -n "$GATE"   && ok "bash -n shogi_tour_pr_gate.sh"      || ng "bash -n shogi_tour_pr_gate.sh"
bash -n "$AMERGE" && ok "bash -n shogi_tour_approved_merge.sh" || ng "bash -n shogi_tour_approved_merge.sh"
bash -n "$0"      && ok "bash -n (このテスト自身)"            || ng "bash -n (このテスト自身)"
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -S warning "$GATE" "$AMERGE" && ok "shellcheck (warning+)" || ng "shellcheck で指摘あり"
else
  echo "  ⚠ shellcheck 未インストール → bash -n のみで代替"
fi

# -----------------------------------------------------------------------------
# 1. 純粋関数の単体テスト（gate を source。BASH_SOURCE ガードで main は走らない）
# -----------------------------------------------------------------------------
echo ""
echo "【1】純粋関数 classify_path / realdata_risk_path / valid_profile"
# shellcheck disable=SC1090
. "$GATE"

# valid_profile
valid_profile production-minimal; expect_rc $? 0 "valid_profile production-minimal は有効"
valid_profile main-dev;           expect_rc $? 0 "valid_profile main-dev は有効"
valid_profile docs-only;          expect_rc $? 0 "valid_profile docs-only は有効"
valid_profile test-only;          expect_rc $? 0 "valid_profile test-only は有効"
valid_profile bogus;              expect_rc $? 1 "valid_profile bogus は無効"

# classify_path : production-minimal
expect_eq "$(classify_path production-minimal shogi_v4.html)" ALLOWED   "prod-min: shogi_v4.html 許可"
expect_eq "$(classify_path production-minimal index.html)"    ALLOWED   "prod-min: index.html 許可"
expect_eq "$(classify_path production-minimal docs/x.md)"     FORBIDDEN "prod-min: docs/ 禁止"
expect_eq "$(classify_path production-minimal test/x.js)"     FORBIDDEN "prod-min: test/ 禁止"
expect_eq "$(classify_path production-minimal package.json)"  FORBIDDEN "prod-min: package.json 禁止"
expect_eq "$(classify_path production-minimal .github/workflows/e2e.yml)" FORBIDDEN "prod-min: .github 禁止"
expect_eq "$(classify_path production-minimal data/import/x.json)"        FORBIDDEN "prod-min: data/ 禁止"

# classify_path : main-dev
expect_eq "$(classify_path main-dev shogi_v4.html)"   ALLOWED   "main-dev: shogi_v4.html 許可"
expect_eq "$(classify_path main-dev test/x.js)"       ALLOWED   "main-dev: test/ 許可"
expect_eq "$(classify_path main-dev docs/x.md)"       ALLOWED   "main-dev: docs/ 許可"
expect_eq "$(classify_path main-dev data/import/x.json)" FORBIDDEN "main-dev: data/ 禁止"

# classify_path : docs-only
expect_eq "$(classify_path docs-only docs/x.md)"   ALLOWED   "docs-only: docs/ 許可"
expect_eq "$(classify_path docs-only HANDOFF.md)"  ALLOWED   "docs-only: HANDOFF.md 許可"
expect_eq "$(classify_path docs-only shogi_v4.html)" FORBIDDEN "docs-only: shogi_v4.html 禁止"
expect_eq "$(classify_path docs-only test/x.js)"   FORBIDDEN "docs-only: test/ 禁止"

# classify_path : test-only
expect_eq "$(classify_path test-only test/x.js)"                 ALLOWED   "test-only: test/ 許可"
expect_eq "$(classify_path test-only test/fixtures/y.json)"      ALLOWED   "test-only: fixtures 許可"
expect_eq "$(classify_path test-only shogi_v4.html)"             FORBIDDEN "test-only: shogi_v4.html 禁止"
expect_eq "$(classify_path test-only docs/x.md)"                 FORBIDDEN "test-only: docs/ 禁止"

# realdata_risk_path
expect_eq "$(realdata_risk_path data/import/20260412_participants.json)" RISK  "realdata: data/ は RISK"
expect_eq "$(realdata_risk_path test/fixtures/import/participants_synthetic_minimal.json)" CLEAR "realdata: synthetic fixture は CLEAR"
expect_eq "$(realdata_risk_path package.json)"        CLEAR "realdata: package.json は CLEAR"
expect_eq "$(realdata_risk_path package-lock.json)"   CLEAR "realdata: package-lock.json は CLEAR"
expect_eq "$(realdata_risk_path .htmlvalidate.json)"  CLEAR "realdata: .htmlvalidate.json は CLEAR"
expect_eq "$(realdata_risk_path test/data_basic4.json)" CLEAR "realdata: test/data_* は CLEAR"
expect_eq "$(realdata_risk_path participants.json)"   WARN  "realdata: 非 synthetic な root json は WARN"
expect_eq "$(realdata_risk_path shogi_v4.html)"       CLEAR "realdata: html は CLEAR"

# -----------------------------------------------------------------------------
# 2. 引数エラー（gh 呼び出し前に exit すること）
# -----------------------------------------------------------------------------
echo ""
echo "【2】引数不足 / profile 不正でエラー終了"
bash "$GATE" --profile production-minimal >/dev/null 2>&1; expect_rc $? 2 "gate: --pr 無しは rc=2"
bash "$GATE" --pr 1 >/dev/null 2>&1;                       expect_rc $? 2 "gate: --profile 無しは rc=2"
bash "$GATE" --pr 1 --profile bogus >/dev/null 2>&1;       expect_rc $? 2 "gate: 不正 profile は rc=2"
bash "$GATE" --pr abc --profile main-dev >/dev/null 2>&1;  expect_rc $? 2 "gate: 非数値 --pr は rc=2"
bash "$AMERGE" --pr 1 >/dev/null 2>&1;                     expect_rc $? 2 "merge: --profile 無しは rc=2"
bash "$AMERGE" --profile main-dev >/dev/null 2>&1;         expect_rc $? 2 "merge: --pr 無しは rc=2"
bash "$AMERGE" --pr 1 --profile main-dev --dry-run --execute >/dev/null 2>&1; expect_rc $? 2 "merge: dry-run と execute 同時は rc=2"
bash "$AMERGE" --pr 1 --profile main-dev --post-comment >/dev/null 2>&1;      expect_rc $? 2 "merge: post-comment は execute 必須 rc=2"

# -----------------------------------------------------------------------------
# 3. mock gh を使った動作テスト（dry-run デフォルト / execute ガード）
# -----------------------------------------------------------------------------
echo ""
echo "【3】mock gh による dry-run / execute ガード検証"

MOCK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/shogi_gh_mock.XXXXXX")"
GH_MOCK_LOG="$MOCK_DIR/gh_calls.log"
: > "$GH_MOCK_LOG"

# READY_CANDIDATE になる production-minimal の PR を模した JSON
cat > "$MOCK_DIR/pr.json" <<'JSON'
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"production","headRefName":"feat/test-head","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"}]}
JSON
cat > "$MOCK_DIR/api.json" <<'JSON'
{"name":"feat/test-head","commit":{"sha":"abc123def4567890"}}
JSON

# mock gh 本体
cat > "$MOCK_DIR/gh" <<MOCK
#!/usr/bin/env bash
# mock gh : 呼び出し引数を LOG に記録し、read 系は canned データを返す。
echo "\$*" >> "$GH_MOCK_LOG"
sub="\$1"; shift 2>/dev/null || true
case "\$sub" in
  pr)
    action="\$1"; shift 2>/dev/null || true
    case "\$action" in
      view)    cat "$MOCK_DIR/pr.json" ;;
      ready)   exit 0 ;;
      merge)   exit 0 ;;
      comment) exit 0 ;;
      *)       exit 0 ;;
    esac
    ;;
  api)   cat "$MOCK_DIR/api.json" ;;
  repo)  echo "owner/repo" ;;
  *)     exit 0 ;;
esac
exit 0
MOCK
chmod +x "$MOCK_DIR/gh"

run_with_mock() {
  # PATH 先頭に mock gh を差し込んで実行（log は呼び出しごとに引数を追記）
  PATH="$MOCK_DIR:$PATH" "$@"
}

# 3-1. gate 単体が mock で READY_CANDIDATE(0) を返す
: > "$GH_MOCK_LOG"
run_with_mock bash "$GATE" --pr 999 --profile production-minimal --repo owner/repo >/dev/null 2>&1
expect_rc $? 0 "gate(mock): production-minimal は READY_CANDIDATE(0)"

# 3-2. dry-run がデフォルト：mode 未指定でも ready/merge を呼ばない
: > "$GH_MOCK_LOG"
run_with_mock bash "$AMERGE" --pr 999 --profile production-minimal --repo owner/repo >/dev/null 2>&1
dry_rc=$?
expect_rc "$dry_rc" 0 "merge(mock): 既定(dry-run)は rc=0"
if grep -q "pr ready" "$GH_MOCK_LOG" || grep -q "pr merge" "$GH_MOCK_LOG"; then
  ng "merge(mock): 既定 dry-run で ready/merge が呼ばれた（あってはならない）"
else
  ok "merge(mock): 既定 dry-run で ready/merge を呼んでいない"
fi

# 3-3. 明示 --dry-run でも同様
: > "$GH_MOCK_LOG"
run_with_mock bash "$AMERGE" --pr 999 --profile production-minimal --repo owner/repo --dry-run >/dev/null 2>&1
expect_rc $? 0 "merge(mock): 明示 --dry-run は rc=0"
if grep -q "pr ready" "$GH_MOCK_LOG" || grep -q "pr merge" "$GH_MOCK_LOG"; then
  ng "merge(mock): --dry-run で ready/merge が呼ばれた（あってはならない）"
else
  ok "merge(mock): --dry-run で ready/merge を呼んでいない"
fi

# 3-4. --execute でも 非対話 + --yes 無し は中止(4)。ready/merge を呼ばない
: > "$GH_MOCK_LOG"
run_with_mock bash "$AMERGE" --pr 999 --profile production-minimal --repo owner/repo --execute </dev/null >/dev/null 2>&1
expect_rc $? 4 "merge(mock): --execute だが非対話 + --yes 無しは中止(4)"
if grep -q "pr ready" "$GH_MOCK_LOG" || grep -q "pr merge" "$GH_MOCK_LOG"; then
  ng "merge(mock): 無承認 --execute で ready/merge が呼ばれた（あってはならない）"
else
  ok "merge(mock): 無承認 --execute で ready/merge を呼んでいない"
fi

# 3-5. --execute --yes（承認あり）：merge は --squash で呼ばれ、--delete-branch を使わない
: > "$GH_MOCK_LOG"
run_with_mock bash "$AMERGE" --pr 999 --profile production-minimal --repo owner/repo --execute --yes </dev/null >/dev/null 2>&1
exec_rc=$?
expect_rc "$exec_rc" 0 "merge(mock): --execute --yes は rc=0"
if grep -q "pr merge 999 .*--squash" "$GH_MOCK_LOG"; then
  ok "merge(mock): merge は --squash で実行"
else
  ng "merge(mock): merge が --squash で実行されていない"
fi
if grep -q -- "--delete-branch" "$GH_MOCK_LOG"; then
  ng "merge(mock): --delete-branch が使われた（絶対禁止）"
else
  ok "merge(mock): --delete-branch を一切使っていない"
fi
if grep -q "pr ready 999" "$GH_MOCK_LOG"; then
  ok "merge(mock): --execute --yes では Ready 化を実行"
else
  ng "merge(mock): --execute --yes で Ready 化していない"
fi

# 3-6. gate が BLOCKED の PR は merge しない（base 不一致を模す）
cat > "$MOCK_DIR/pr.json" <<'JSON'
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"main","headRefName":"feat/test-head","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"data/import/real.json"}]}
JSON
: > "$GH_MOCK_LOG"
run_with_mock bash "$AMERGE" --pr 999 --profile production-minimal --repo owner/repo --execute --yes </dev/null >/dev/null 2>&1
blocked_rc=$?
expect_rc "$blocked_rc" 20 "merge(mock): gate=BLOCKED は rc=20 で停止"
if grep -q "pr merge" "$GH_MOCK_LOG"; then
  ng "merge(mock): BLOCKED なのに merge が呼ばれた（あってはならない）"
else
  ok "merge(mock): BLOCKED では merge を呼んでいない"
fi

rm -rf "$MOCK_DIR"

# -----------------------------------------------------------------------------
# 結果
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓ 全テスト合格"
  exit 0
else
  echo "  ✗ 失敗あり(要対応)"
  exit 1
fi
