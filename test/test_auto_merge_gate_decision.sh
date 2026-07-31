#!/usr/bin/env bash
# =============================================================================
# test_auto_merge_gate_decision.sh — AUTO-MERGE-GATE-001 発火判定の単体テスト
# -----------------------------------------------------------------------------
# scripts/auto_merge_gate_decision.sh（純関数）を source し、憲章 §5 の
# 発火条件・停止条件の全分岐を、実 GitHub / 実 merge を一切伴わずに検証する
# （= L4 の dry-run 証明）。あわせて .github/workflows/auto-merge-gate.yml の
# 静的安全（job ごとの最小権限・head-CAS 使用・新規 secret なし・production ガード委譲・
# boolean dry_run・synchronize でのラベル剥奪・merge 直前の base 再検証）を固定する。
#
# 001b で追加した観点（Codex レビュー P1×6 / P2×2）:
#   P1-1 必須チェック名の allowlist（列挙した全チェックが存在＋SUCCESS で初めて FIRE）
#        ＋ allowlist と e2e.yml の job 名のドリフト検出
#   P1-2 conclusion は SUCCESS のみ green（STALE/NEUTRAL/SKIPPED/CANCELLED/TIMED_OUT… は停止）
#   P1-3 未登録（0 件）は poll 対象（ci-unregistered）／打ち切り後に ci-none
#   P1-4 承認 head と現在 head の不一致で停止＋synchronize での codex-go 剥奪 job
#   P1-5 merge 直前の base 再検証（base-changed）
#   P1-6 dry_run は boolean input（fail closed）
#   P2-7 merge 後の e2e.yml 明示 dispatch（＋e2e.yml 側の workflow_dispatch 受け口）
#   P2-8 gh pr list --limit 100
#
# 安全: network / gh / git 不使用。mutating 操作ゼロ。ダミー値のみ。
# 使い方: bash test/test_auto_merge_gate_decision.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DECISION="$SCRIPT_DIR/../scripts/auto_merge_gate_decision.sh"
WORKFLOW="$SCRIPT_DIR/../.github/workflows/auto-merge-gate.yml"
E2E="$SCRIPT_DIR/../.github/workflows/e2e.yml"
ORPHAN_BASE="chore/shogi-tour-apphq-003h-2d-orphan-clean-base"
TAB="$(printf '\t')"

PASS=0
FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  AUTO-MERGE-GATE-001 decision 単体テスト"
echo "=========================================="

if [ ! -f "$DECISION" ]; then echo "✗ decision script なし: $DECISION"; exit 1; fi
if [ ! -f "$WORKFLOW" ]; then echo "✗ workflow なし: $WORKFLOW"; exit 1; fi
if [ ! -f "$E2E" ]; then echo "✗ e2e.yml なし: $E2E"; exit 1; fi

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

# mk_checks "名前|status|conclusion" ... → AMG_CHECKS_TSV を組み立てる
mk_checks() {
  AMG_CHECKS_TSV=""
  for _spec in "$@"; do
    _n="${_spec%%|*}"; _r="${_spec#*|}"; _s="${_r%%|*}"; _c="${_r#*|}"
    AMG_CHECKS_TSV="${AMG_CHECKS_TSV}${_n}${TAB}${_s}${TAB}${_c}
"
  done
  export AMG_CHECKS_TSV
}

# branch ruleset と同じ必須 2 チェックがすべて SUCCESS の状態
green_checks() {
  mk_checks "Unit (run_tests.sh)|COMPLETED|SUCCESS" \
            "Security Scan|COMPLETED|SUCCESS"
}

# 既定の「発火してよい」状態（ここから 1 要素ずつ壊して停止条件を確認する）
reset_env() {
  AMG_BASE_REF="$ORPHAN_BASE"
  AMG_STATE="OPEN"
  AMG_LABELS="codex-go"
  AMG_HEAD_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  AMG_APPROVED_HEAD_SHA=""
  AMG_BASE_AT_DECISION=""
  AMG_POLL_EXHAUSTED="false"
  AMG_PRODUCTION_BRANCH=""
  AMG_ALLOWED_BASES=""
  unset AMG_REQUIRED_CHECKS
  green_checks
  export AMG_BASE_REF AMG_STATE AMG_LABELS AMG_HEAD_SHA AMG_APPROVED_HEAD_SHA \
         AMG_BASE_AT_DECISION AMG_POLL_EXHAUSTED AMG_PRODUCTION_BRANCH AMG_ALLOWED_BASES
}

echo ""
echo "【発火条件（必須チェックが全て存在＋SUCCESS のときのみ FIRE）】"
reset_env
decide "FIRE" "base=orphan + codex-go + 必須2チェック SUCCESS"

reset_env; AMG_BASE_REF="main"
decide "SKIP base-not-allowed" "旧defaultの main は自動マージ対象外"

reset_env; AMG_LABELS="doc-sync,codex-go,merged"
decide "FIRE" "codex-go が他ラベルと混在していても FIRE"

reset_env; AMG_APPROVED_HEAD_SHA="$AMG_HEAD_SHA"
decide "FIRE" "承認 head == 現在 head なら FIRE"

reset_env; AMG_BASE_AT_DECISION="$ORPHAN_BASE"
decide "FIRE" "判定時 base と現在 base が同じなら FIRE"

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
echo "【停止条件 2: base 付け替え（P1-5・merge 直前の再検証）】"
reset_env; AMG_BASE_AT_DECISION="legacy/development"
decide "SKIP base-changed" "判定時から base が変わっていれば停止"

reset_env; AMG_BASE_AT_DECISION="$ORPHAN_BASE"; AMG_BASE_REF="production"
decide "SKIP base-production" "判定後に production へ付け替え → production ガードが先に効く"

echo ""
echo "【停止条件 3: ラベル（受け入れ基準 3）】"
reset_env; AMG_LABELS=""
decide "SKIP label-missing" "codex-go なしは発火しない"

reset_env; AMG_LABELS="codex-golf"
decide "SKIP label-missing" "部分一致（codex-golf）を codex-go と誤認しない"

reset_env; AMG_LABELS="codex-go,needs-codex"
decide "SKIP label-blocked" "needs-codex があれば codex-go があっても発火しない"

reset_env; AMG_LABELS="codex-go,codex-block"
decide "SKIP label-blocked" "codex-block があれば発火しない"

echo ""
echo "【停止条件 4: 承認 head への束縛（P1-4）】"
reset_env; AMG_APPROVED_HEAD_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
decide "SKIP head-changed" "ラベル付与時 head ≠ 現在 head（追い push）は発火しない"

reset_env; AMG_APPROVED_HEAD_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; AMG_LABELS="codex-go,needs-codex"
decide "SKIP label-blocked" "head 不一致より先にラベル停止条件が効く（順序固定）"

echo ""
echo "【停止条件 5: 必須チェック allowlist（P1-1）】"
reset_env; mk_checks "Unit (run_tests.sh)|COMPLETED|SUCCESS"
decide "SKIP ci-unregistered" "必須2件のうち Security Scan が未登録なら FIRE しない"

reset_env; mk_checks "some-unrelated-check|COMPLETED|SUCCESS"
decide "SKIP ci-unregistered" "無関係な check が成功していても『CI green』とみなさない（001 の穴）"

reset_env; AMG_POLL_EXHAUSTED="true"; mk_checks "some-unrelated-check|COMPLETED|SUCCESS"
decide "SKIP ci-none" "poll 打ち切り後は ci-none（green の証明なしで終了）"

reset_env; AMG_CHECKS_TSV=""; export AMG_CHECKS_TSV
decide "SKIP ci-unregistered" "check ゼロ件でも poll 対象（P1-3・ci-none で即終了しない）"

reset_env; AMG_CHECKS_TSV=""; export AMG_CHECKS_TSV; AMG_POLL_EXHAUSTED="true"
decide "SKIP ci-none" "check ゼロ件のまま打ち切り → ci-none"

reset_env; AMG_REQUIRED_CHECKS=""; export AMG_REQUIRED_CHECKS
decide "SKIP ci-config" "必須チェック allowlist が空＝設定不備は fail closed"

reset_env; AMG_REQUIRED_CHECKS="Only One"; export AMG_REQUIRED_CHECKS
mk_checks "Only One|COMPLETED|SUCCESS"
decide "FIRE" "allowlist を上書きでき、その全てが SUCCESS なら FIRE"

reset_env
mk_checks "Unit (run_tests.sh)|COMPLETED|SUCCESS" \
          "Security Scan|COMPLETED|SUCCESS" \
          "E2E (Playwright)|COMPLETED|SKIPPED" \
          "auto-merge-gate|IN_PROGRESS|"
decide "FIRE" "allowlist 外のskip E2Eと未完了ゲートは発火を妨げない"

echo ""
echo "【停止条件 6: conclusion は SUCCESS のみ green（P1-2）】"
for _bad in STALE NEUTRAL SKIPPED CANCELLED TIMED_OUT ACTION_REQUIRED FAILURE STARTUP_FAILURE; do
  reset_env
  mk_checks "Unit (run_tests.sh)|COMPLETED|SUCCESS" \
            "Security Scan|COMPLETED|${_bad}"
  decide "SKIP ci-red" "完了かつ conclusion=${_bad} は green でない"
done

reset_env
mk_checks "Unit (run_tests.sh)|COMPLETED|SUCCESS" \
          "Security Scan|COMPLETED|"
decide "SKIP ci-red" "完了かつ conclusion が空でも green とみなさない"

reset_env
mk_checks "Unit (run_tests.sh)|COMPLETED|success" \
          "Security Scan|COMPLETED|SUCCESS"
decide "SKIP ci-red" "小文字 'success' は allowlist に一致しない（表記ゆれで通さない）"

echo ""
echo "【停止条件 7: 未完了チェック】"
reset_env
mk_checks "Unit (run_tests.sh)|IN_PROGRESS|" \
          "Security Scan|COMPLETED|SUCCESS"
decide "SKIP ci-pending" "必須チェックが未完了なら発火しない"

reset_env
mk_checks "Unit (run_tests.sh)|QUEUED|" \
          "Security Scan|COMPLETED|FAILURE"
decide "SKIP ci-red" "赤と未完了が混在するときは赤を優先（待っても直らない）"

reset_env
mk_checks "Unit (run_tests.sh)|COMPLETED|FAILURE" \
          "Unit (run_tests.sh)|COMPLETED|SUCCESS" \
          "Security Scan|COMPLETED|SUCCESS"
decide "SKIP ci-red" "同名 check に赤が混ざるときは安全側（RED）へ丸める"

reset_env
mk_checks "Unit (run_tests.sh)|PENDING|" \
          "Security Scan|COMPLETED|SUCCESS"
decide "SKIP ci-pending" "StatusContext 正規化（PENDING）も未完了として扱う"

echo ""
echo "【停止条件 8: PR 状態】"
reset_env; AMG_STATE="MERGED"
decide "SKIP pr-not-open" "merged 済み PR には何もしない"

reset_env; AMG_STATE="CLOSED"
decide "SKIP pr-not-open" "closed PR には何もしない"

echo ""
echo "【入力エラー（rc=2）】"
reset_env; AMG_BASE_REF=""
_out=$(amg_decide 2>/dev/null); _rc=$?
[ "${_rc}" = "2" ] && ok "base 欠落は rc=2" || ng "base 欠落 (rc=${_rc})"

reset_env; AMG_STATE=""
_out=$(amg_decide 2>/dev/null); _rc=$?
[ "${_rc}" = "2" ] && ok "state 欠落は rc=2" || ng "state 欠落 (rc=${_rc})"

echo ""
echo "【静的検査の前提: コメント行を除いた「実効定義」に対して検査する】"
# コメントに書いてあるだけの語（例: 説明文中の --match-head-commit）を
# 実装の証拠と取り違えないよう、行頭 # のコメント行を除いた版を作って検査する。
# YAML コメントも run ブロック内のシェルコメントも行頭 # で始まる。
WF_EFF="$(mktemp)"; grep -vE '^[[:space:]]*#' "$WORKFLOW" > "$WF_EFF"
E2E_EFF="$(mktemp)"; grep -vE '^[[:space:]]*#' "$E2E" > "$E2E_EFF"
if grep -q 'match-head-commit' "$WORKFLOW" && grep -q 'match-head-commit' "$WF_EFF"; then
  ok "コメント除去後も実装行が残る（前提成立）"
else
  ng "コメント除去の前提が崩れている"
fi

echo ""
echo "【必須チェック allowlist ⇄ e2e.yml job 名のドリフト検出（P1-1）】"
# decision script の既定・workflow の env・e2e.yml の job 表示名が三者一致していること。
_wf_required=$(grep -E "^\s+AMG_REQUIRED_CHECKS:" "$WF_EFF" | sed -E "s/^[^:]+:[[:space:]]*'?//; s/'[[:space:]]*$//")
if [ "$_wf_required" = "$AMG_DEFAULT_REQUIRED_CHECKS" ]; then
  ok "workflow の AMG_REQUIRED_CHECKS が decision script の既定と一致"
else
  ng "allowlist 不一致 (workflow='$_wf_required' decision='$AMG_DEFAULT_REQUIRED_CHECKS')"
fi

# e2e.yml に存在する、ruleset対象の2つのjob表示名だけを抽出して照合する。
# skip中の E2E (Playwright) は意図的に必須対象外。
_e2e_names=$(grep -E '^    name: (Unit \(run_tests\.sh\)|Security Scan)$' "$E2E_EFF" \
  | sed 's/^    name: //' | tr '\n' ',' | sed 's/,$//')
if [ -n "$_e2e_names" ] && [ "$_e2e_names" = "$AMG_DEFAULT_REQUIRED_CHECKS" ]; then
  ok "e2e.yml の必須job表示名2件が allowlist と完全一致（順序込み）"
else
  ng "e2e.yml の job 名とのドリフト (e2e='$_e2e_names' allowlist='$AMG_DEFAULT_REQUIRED_CHECKS')"
fi

# allowlist にゲート自身の check 名が入っていないこと（自己デッドロック防止）
case ",$AMG_DEFAULT_REQUIRED_CHECKS," in
  *,auto-merge-gate,*) ng "allowlist にゲート自身が入っている（自己デッドロック）" ;;
  *) ok "allowlist にゲート自身は入っていない" ;;
esac

echo ""
echo "【workflow 静的安全（auto-merge-gate.yml）】"
grep -qE '^permissions: \{\}' "$WF_EFF" \
  && ok "workflow 既定権限はゼロ（job ごとに最小付与）" || ng "workflow 既定権限がゼロでない"

_perm_lines=$(grep -cE '^ +(contents|pull-requests|actions|checks|deployments|id-token|issues|packages|pages|repository-projects|security-events|statuses): ' "$WF_EFF")
[ "${_perm_lines}" = "5" ] && ok "権限行は 5 行のみ（gate=contents:write/pull-requests:write/actions:write・revoke=contents:read/pull-requests:write）" \
  || ng "権限行が 5 行でない (${_perm_lines})"
# 剥奪 job は書き込み権限を contents へ持たない（ラベル操作だけができればよい）
if awk '/^  [A-Za-z0-9_-]+:/{f=($0=="  revoke-codex-go-on-push:"); p=0}
        f&&/^    permissions:/{p=1;next}
        p&&/^    [A-Za-z]/{p=0}
        f&&p' "$WF_EFF" | grep -q 'contents: write'; then
  ng "剥奪 job が contents: write を持っている（過大権限）"
else
  ok "剥奪 job は contents: read まで（過大権限なし）"
fi

grep -q -- '--match-head-commit' "$WF_EFF" \
  && ok "merge は --match-head-commit（head-CAS）付き" || ng "head-CAS なし"

grep -q -- '--squash' "$WF_EFF" && ok "squash merge を使用" || ng "squash 指定なし"

_secrets=$(grep -c 'secrets\.' "$WF_EFF" || true)
[ "${_secrets}" = "0" ] && ok "新規 secret 参照ゼロ（github.token のみ）" || ng "secrets 参照あり (${_secrets})"

grep -q 'auto_merge_gate_decision.sh' "$WF_EFF" \
  && ok "判定は decision script へ委譲（テスト済み経路のみで発火）" || ng "decision script 未使用"

# P1-6: dry_run は boolean input（文字列比較の fail-open を排除）
if grep -A5 -E '^      dry_run:' "$WF_EFF" | grep -q 'type: boolean'; then
  ok "P1-6: dry_run は boolean input"
else
  ng "P1-6: dry_run が boolean input でない"
fi
if grep -A5 -E '^      dry_run:' "$WF_EFF" | grep -qE 'default: true'; then
  ok "P1-6: dry_run の既定は true（既定で非破壊）"
else
  ng "P1-6: dry_run の既定が true でない"
fi
_failclosed=$(grep -c 'true|false)' "$WF_EFF" || true)
[ "${_failclosed}" -ge 2 ] && ok "P1-6: dry_run は true/false 以外を fail closed（2 段で検証）" \
  || ng "P1-6: dry_run の fail-closed 検証が足りない (${_failclosed})"

# P1-3: 未登録も poll 対象
grep -q 'SKIP ci-unregistered' "$WF_EFF" \
  && ok "P1-3: ci-unregistered を poll 継続条件に含む" || ng "P1-3: ci-unregistered が poll 対象でない"
grep -q 'AMG_POLL_EXHAUSTED="true"' "$WF_EFF" \
  && ok "P1-3: poll 打ち切り時に ci-none へ確定させる" || ng "P1-3: poll 打ち切りの確定処理がない"

# P1-4: synchronize での codex-go 剥奪
grep -q 'types: \[labeled, synchronize\]' "$WF_EFF" \
  && ok "P1-4: pull_request[synchronize] を購読" || ng "P1-4: synchronize を購読していない"
grep -q -- '--remove-label codex-go' "$WF_EFF" \
  && ok "P1-4: 追い push で codex-go を剥奪" || ng "P1-4: codex-go 剥奪がない"
grep -q "github.event.action == 'labeled' && github.event.label.name == 'codex-go'" "$WF_EFF" \
  && ok "P1-4: gate job は codex-go の labeled のみで起動" || ng "P1-4: gate job の起動条件が広い"
grep -q 'AMG_APPROVED_HEAD_SHA' "$WF_EFF" \
  && ok "P1-4: 承認 head を判定へ渡す" || ng "P1-4: 承認 head を渡していない"

# P1-5: merge 直前の base 再検証
grep -q 'AMG_BASE_AT_DECISION="\$BASE_AT_DECISION"' "$WF_EFF" \
  && ok "P1-5: merge 直前に base を再検証する" || ng "P1-5: base の再検証がない"
_recheck_line=$(grep -n 'RECHECK=' "$WF_EFF" | head -1 | cut -d: -f1)
_merge_line=$(grep -n 'gh pr merge' "$WF_EFF" | head -1 | cut -d: -f1)
if [ -n "$_recheck_line" ] && [ -n "$_merge_line" ] && [ "$_recheck_line" -lt "$_merge_line" ]; then
  ok "P1-5: 再検証は merge コマンドより前に置かれている"
else
  ng "P1-5: 再検証の位置が merge より後（recheck=$_recheck_line merge=$_merge_line）"
fi

# P2-7 / P2-8
grep -q 'gh workflow run e2e.yml' "$WF_EFF" \
  && ok "P2-7: merge 後に e2e.yml を明示 dispatch" || ng "P2-7: post-merge dispatch がない"
grep -qE '^  workflow_dispatch:' "$E2E_EFF" \
  && ok "P2-7: e2e.yml 側に workflow_dispatch の受け口がある" || ng "P2-7: e2e.yml に workflow_dispatch がない"
grep -q -- 'gh pr list .*--limit 100' "$WF_EFF" \
  && ok "P2-8: gh pr list に --limit 100 を明示" || ng "P2-8: --limit 100 がない"

echo ""
echo "=========================================="
echo "  結果: PASS=${PASS}, FAIL=${FAIL}"
echo "=========================================="
[ "${FAIL}" = "0" ] || exit 1
exit 0
