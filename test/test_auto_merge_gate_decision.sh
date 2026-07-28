#!/usr/bin/env bash
# =============================================================================
# test_auto_merge_gate_decision.sh — AUTO-MERGE-GATE-001 発火判定の単体テスト
# -----------------------------------------------------------------------------
# scripts/auto_merge_gate_decision.sh（純関数）を source し、憲章 §5 の
# 発火条件・停止条件の全分岐を、実 GitHub / 実 merge を一切伴わずに検証する
# （= L4 の dry-run 証明）。あわせて .github/workflows/auto-merge-gate.yml の
# 静的安全（最小権限・head-CAS 使用・新規 secret なし・production ガード委譲）を
# grep で固定する。
#
# 安全: network / gh / git 不使用。mutating 操作ゼロ。ダミー値のみ。
# 使い方: bash test/test_auto_merge_gate_decision.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DECISION="$SCRIPT_DIR/../scripts/auto_merge_gate_decision.sh"
WORKFLOW="$SCRIPT_DIR/../.github/workflows/auto-merge-gate.yml"
ORPHAN_BASE="chore/shogi-tour-apphq-003h-2d-orphan-clean-base"

PASS=0
FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  AUTO-MERGE-GATE-001 decision 単体テスト"
echo "=========================================="

if [ ! -f "$DECISION" ]; then echo "✗ decision script なし: $DECISION"; exit 1; fi
if [ ! -f "$WORKFLOW" ]; then echo "✗ workflow なし: $WORKFLOW"; exit 1; fi

bash -n "$DECISION" && ok "decision script 構文 OK (bash -n)" || ng "decision script 構文エラー"

# shellcheck disable=SC1090
. "$DECISION"

# decide <期待出力> <ケース名> ＋ env（AMG_* は呼び出し側で設定）
decide() {
  _expected="$1"; _name="$2"
  _actual=$(amg_decide 2>/dev/null)
  _rc=$?
  if [ "${_actual}" = "${_expected}" ] && [ "${_rc}" = "0" ]; then
    ok "${_name} -> ${_actual}"
  else
    ng "${_name} (expected='${_expected}' actual='${_actual}' rc=${_rc})"
  fi
}

# 既定の「発火してよい」状態（ここから 1 要素ずつ壊して停止条件を確認する）
reset_env() {
  AMG_BASE_REF="$ORPHAN_BASE"
  AMG_STATE="OPEN"
  AMG_LABELS="codex-go"
  AMG_CHECKS_TOTAL=3
  AMG_CHECKS_FAILED=0
  AMG_CHECKS_PENDING=0
  AMG_PRODUCTION_BRANCH=""
  AMG_ALLOWED_BASES=""
  export AMG_BASE_REF AMG_STATE AMG_LABELS AMG_CHECKS_TOTAL \
         AMG_CHECKS_FAILED AMG_CHECKS_PENDING AMG_PRODUCTION_BRANCH AMG_ALLOWED_BASES
}

echo ""
echo "【発火条件（両方揃ったときのみ FIRE）】"
reset_env
decide "FIRE" "base=orphan + codex-go + CI green(3/0/0)"

reset_env; AMG_BASE_REF="main"
decide "FIRE" "base=main + codex-go + CI green"

reset_env; AMG_LABELS="doc-sync,codex-go,merged"
decide "FIRE" "codex-go が他ラベルと混在していても FIRE"

echo ""
echo "【停止条件 1: base=production（最重要ガード・受け入れ基準 2）】"
reset_env; AMG_BASE_REF="production"
decide "SKIP base-production" "base=production はラベル+CI green でも絶対に発火しない"

reset_env; AMG_BASE_REF="release/v113-world-std-align-002"
decide "SKIP base-production" "base=release/* も production 扱いで発火しない"

reset_env; AMG_BASE_REF="my-production"; AMG_PRODUCTION_BRANCH="my-production"
decide "SKIP base-production" "production ブランチ名の上書き（AMG_PRODUCTION_BRANCH）も効く"

reset_env; AMG_BASE_REF="feature/other-branch"
decide "SKIP base-not-allowed" "allowlist 外 base（feature→feature）は発火しない"

echo ""
echo "【停止条件 2: ラベル（受け入れ基準 3）】"
reset_env; AMG_LABELS=""
decide "SKIP label-missing" "codex-go なしは発火しない"

reset_env; AMG_LABELS="codex-golf"
decide "SKIP label-missing" "部分一致（codex-golf）を codex-go と誤認しない"

reset_env; AMG_LABELS="codex-go,needs-codex"
decide "SKIP label-blocked" "needs-codex があれば codex-go があっても発火しない"

reset_env; AMG_LABELS="codex-go,codex-block"
decide "SKIP label-blocked" "codex-block があれば発火しない"

echo ""
echo "【停止条件 3: CI（受け入れ基準 3）】"
reset_env; AMG_CHECKS_FAILED=1
decide "SKIP ci-red" "CI 赤（fail=1）は発火しない"

reset_env; AMG_CHECKS_PENDING=1
decide "SKIP ci-pending" "CI 未完了（pending=1）は発火しない"

reset_env; AMG_CHECKS_TOTAL=0
decide "SKIP ci-none" "check ゼロ（CI 未発火）は green の証明なし = 発火しない"

echo ""
echo "【停止条件 4: PR 状態】"
reset_env; AMG_STATE="MERGED"
decide "SKIP pr-not-open" "merged 済み PR には何もしない"

reset_env; AMG_STATE="CLOSED"
decide "SKIP pr-not-open" "closed PR には何もしない"

echo ""
echo "【入力エラー（rc=2）】"
reset_env; AMG_BASE_REF=""
_out=$(amg_decide 2>/dev/null); _rc=$?
[ "${_rc}" = "2" ] && ok "base 欠落は rc=2" || ng "base 欠落 (rc=${_rc})"

reset_env; AMG_CHECKS_TOTAL="abc"
_out=$(amg_decide 2>/dev/null); _rc=$?
[ "${_rc}" = "2" ] && ok "check 数が数値でないときは rc=2" || ng "check 数不正 (rc=${_rc})"

echo ""
echo "【workflow 静的安全（auto-merge-gate.yml）】"
grep -q 'contents: write' "$WORKFLOW" && grep -q 'pull-requests: write' "$WORKFLOW" \
  && ok "permissions は contents/pull-requests write を明示" || ng "permissions 明示なし"

_perm_lines=$(grep -cE '^\s+(contents|pull-requests|actions|checks|deployments|id-token|issues|packages|pages|repository-projects|security-events|statuses): ' "$WORKFLOW")
[ "${_perm_lines}" = "2" ] && ok "権限は 2 種のみ（最小権限）" || ng "権限が 2 種でない (${_perm_lines})"

grep -q -- '--match-head-commit' "$WORKFLOW" \
  && ok "merge は --match-head-commit（head-CAS）付き" || ng "head-CAS なし"

grep -q -- '--squash' "$WORKFLOW" && ok "squash merge を使用" || ng "squash 指定なし"

_secrets=$(grep -c 'secrets\.' "$WORKFLOW" || true)
[ "${_secrets}" = "0" ] && ok "新規 secret 参照ゼロ（github.token のみ）" || ng "secrets 参照あり (${_secrets})"

grep -q 'auto_merge_gate_decision.sh' "$WORKFLOW" \
  && ok "判定は decision script へ委譲（テスト済み経路のみで発火）" || ng "decision script 未使用"

grep -q "dry_run" "$WORKFLOW" && ok "workflow_dispatch dry-run モードあり" || ng "dry-run モードなし"

echo ""
echo "=========================================="
echo "  結果: PASS=${PASS}, FAIL=${FAIL}"
echo "=========================================="
[ "${FAIL}" = "0" ] || exit 1
exit 0
