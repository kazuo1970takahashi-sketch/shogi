#!/usr/bin/env bash
# =============================================================================
# shogi_tour_pr_gate.sh  —  SHOGI-TOUR-AUTO-001 PR Gate Check (read-only)
# -----------------------------------------------------------------------------
# 指定した PR 番号を profile 別ルールで検査し、安全に Ready/merge 候補かを判定する。
#
# 本スクリプトは「読み取り専用」。gh pr ready / gh pr merge / gh pr comment /
# branch 削除 等の mutating 操作は一切行わない（それらは shogi_tour_approved_merge.sh）。
#
# 使い方:
#   ./scripts/shogi_tour_pr_gate.sh --pr <番号> --profile <profile> [--repo owner/repo]
#
# profile:
#   production-minimal | main-dev | docs-only | test-only
#
# 終了コード:
#   0  = READY_CANDIDATE   全 OK。人間承認後の Ready/merge 候補。
#   10 = NEEDS_REVIEW      WARN あり。人間レビューが必要。
#   20 = BLOCKED           NG あり。Ready/merge してはいけない。
#   2  = 引数エラー
#   3  = 実行時エラー（gh 取得失敗など）
#
# 安全方針 (依頼 SHOGI-TOUR-AUTO-001):
#   - data/ 配下の実ファイル本文は読まない。PR の path / 状態メタデータのみ参照。
#   - PR 本文 / title は出力しない（実名混入回避）。
#   - branch 削除・production 自動更新・Pages 変更・release/deploy/publish は行わない。
#
# 依存: bash 3.2+, gh (認証済み), python3 (JSON 解析。当リポジトリの既存ツール依存と同じ)
# 注: ライブラリとして source された場合は main を実行せず、純粋関数のみ提供する
#     （test/ から classify_path などを単体テストできるようにするため）。
# =============================================================================

PROG_NAME="$(basename "${BASH_SOURCE[0]}")"

# -----------------------------------------------------------------------------
# 出力ヘルパ（依頼の OK / NG / WARN 一覧。run_tests.sh と同じ ✓ / ✗ / ⚠ 記号）
# -----------------------------------------------------------------------------
GATE_OK_COUNT=0
GATE_NG_COUNT=0
GATE_WARN_COUNT=0
gate_ok()   { GATE_OK_COUNT=$((GATE_OK_COUNT+1));     printf '  \xe2\x9c\x93 OK   %s\n' "$1"; }
gate_ng()   { GATE_NG_COUNT=$((GATE_NG_COUNT+1));     printf '  \xe2\x9c\x97 NG   %s\n' "$1"; }
gate_warn() { GATE_WARN_COUNT=$((GATE_WARN_COUNT+1)); printf '  \xe2\x9a\xa0 WARN %s\n' "$1"; }
gate_err()  { printf '%s: error: %s\n' "$PROG_NAME" "$1" >&2; }

print_usage() {
  cat <<USAGE
使い方: $PROG_NAME --pr <番号> --profile <profile> [options]

必須:
  --pr <番号>            検査対象の PR 番号 (数値)
  --profile <profile>    production-minimal | main-dev | docs-only | test-only

任意:
  --repo <owner/repo>    対象リポジトリ (省略時は gh / git remote から推定)
  --production-branch <名>  production ブランチ名 (default: production)
  --main-branch <名>        main ブランチ名 (default: main)
  -h, --help             この使い方を表示

終了コード: 0=READY_CANDIDATE 10=NEEDS_REVIEW 20=BLOCKED 2=引数エラー 3=実行時エラー
USAGE
}

# -----------------------------------------------------------------------------
# 純粋関数（gh / network 不要。test/ から source して単体テスト可能）
# -----------------------------------------------------------------------------

# valid_profile <profile> -> 0(有効) / 1(無効)
valid_profile() {
  case "$1" in
    production-minimal|main-dev|docs-only|test-only) return 0 ;;
    *) return 1 ;;
  esac
}

# classify_path <profile> <path> -> ALLOWED | FORBIDDEN
#   profile の「変更を許可するファイル範囲」ルール。path（ファイル名）だけで判定し、
#   ファイル本文は一切読まない。
classify_path() {
  _cp_profile="$1"
  _cp_path="$2"
  case "$_cp_profile" in
    production-minimal)
      # 公開最小反映: ルート直下の index.html / shogi_v4.html のみ許可。
      case "$_cp_path" in
        index.html|shogi_v4.html) echo "ALLOWED" ;;
        *) echo "FORBIDDEN" ;;
      esac
      ;;
    main-dev)
      # main 向け開発: test/docs/code を許容。data/（実データ）のみ禁止。
      case "$_cp_path" in
        data/*|*/data/*) echo "FORBIDDEN" ;;
        *) echo "ALLOWED" ;;
      esac
      ;;
    docs-only)
      # docs/ と許可された docs 系ルートファイルのみ。
      case "$_cp_path" in
        docs/*) echo "ALLOWED" ;;
        HANDOFF.md|README.md|CHANGELOG.md) echo "ALLOWED" ;;
        *) echo "FORBIDDEN" ;;
      esac
      ;;
    test-only)
      # test/（fixture 含む）のみ。production / shogi_v4.html は禁止。
      case "$_cp_path" in
        test/*) echo "ALLOWED" ;;
        *) echo "FORBIDDEN" ;;
      esac
      ;;
    *)
      echo "FORBIDDEN"
      ;;
  esac
}

# realdata_risk_path <path> -> CLEAR | WARN | RISK
#   実データ混入の簡易検出（path ベースのみ。ファイル本文は読まない）。
#     RISK : data/ 配下。実マスタ JSON の置き場所。ハード禁止。
#     WARN : synthetic/sample 等が名前に無い .json/.csv/.tsv（実データの疑い）。
#     CLEAR: 既知の設定ファイル、synthetic 名、その他コード/docs。
realdata_risk_path() {
  _rr_path="$1"
  # 既知の安全な設定ファイルは除外
  case "$_rr_path" in
    package.json|package-lock.json|*/package.json|*/package-lock.json) echo "CLEAR"; return ;;
    .htmlvalidate.json|*/.htmlvalidate.json|tsconfig.json|*/tsconfig.json) echo "CLEAR"; return ;;
    .eslintrc.json|*/.eslintrc.json|*.config.json) echo "CLEAR"; return ;;
  esac
  # data/ 配下は実データ置き場 → RISK
  case "$_rr_path" in
    data/*|*/data/*) echo "RISK"; return ;;
  esac
  # それ以外の構造化データファイルは synthetic かどうかで判定
  case "$_rr_path" in
    *.json|*.csv|*.tsv|*.ndjson)
      case "$_rr_path" in
        test/fixtures/*|test/data_*|*synthetic*|*sample*|*example*|*dummy*|*mock*|*fixture*|*template*)
          echo "CLEAR" ;;
        *)
          echo "WARN" ;;
      esac
      ;;
    *)
      echo "CLEAR"
      ;;
  esac
}

# -----------------------------------------------------------------------------
# gh データ層（mock しやすいよう gh 呼び出しを 1 箇所に集約）
#   gh pr view を 1 回だけ呼んで JSON blob を取得し、python3 で解析する。
#   ※ files[].path（パス）のみ取得し、ファイル本文は取得しない。
# -----------------------------------------------------------------------------
fetch_pr_json() {
  # $1=pr $2=repo  -> stdout に JSON blob、失敗時は非ゼロ
  gh pr view "$1" --repo "$2" \
    --json number,state,isDraft,baseRefName,headRefName,mergeable,mergeStateStatus,files
}

resolve_repo() {
  # 引数 --repo が無いときに gh / git remote から推定
  _rr="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)"
  if [ -n "$_rr" ]; then printf '%s\n' "$_rr"; return 0; fi
  _rr="$(git config --get remote.origin.url 2>/dev/null)"
  if [ -n "$_rr" ]; then
    _rr="${_rr%.git}"
    _rr="$(printf '%s\n' "$_rr" | sed -E 's#.*[:/]([^/]+/[^/]+)$#\1#')"
    printf '%s\n' "$_rr"
    return 0
  fi
  return 1
}

# -----------------------------------------------------------------------------
# main
# -----------------------------------------------------------------------------
gate_main() {
  set -u

  PR=""
  PROFILE=""
  REPO=""
  PRODUCTION_BRANCH="production"
  MAIN_BRANCH="main"

  while [ $# -gt 0 ]; do
    case "$1" in
      --pr)               [ $# -ge 2 ] || { gate_err "--pr に値が必要です"; return 2; }; PR="$2"; shift 2 ;;
      --pr=*)             PR="${1#*=}"; shift ;;
      --profile)          [ $# -ge 2 ] || { gate_err "--profile に値が必要です"; return 2; }; PROFILE="$2"; shift 2 ;;
      --profile=*)        PROFILE="${1#*=}"; shift ;;
      --repo)             [ $# -ge 2 ] || { gate_err "--repo に値が必要です"; return 2; }; REPO="$2"; shift 2 ;;
      --repo=*)           REPO="${1#*=}"; shift ;;
      --production-branch) [ $# -ge 2 ] || { gate_err "--production-branch に値が必要です"; return 2; }; PRODUCTION_BRANCH="$2"; shift 2 ;;
      --main-branch)      [ $# -ge 2 ] || { gate_err "--main-branch に値が必要です"; return 2; }; MAIN_BRANCH="$2"; shift 2 ;;
      -h|--help)          print_usage; return 0 ;;
      *)                  gate_err "不明な引数: $1"; print_usage >&2; return 2 ;;
    esac
  done

  # --- 引数検証（gh 呼び出し前に必ず実施） ---
  if [ -z "$PR" ]; then gate_err "--pr は必須です"; print_usage >&2; return 2; fi
  if [ -z "$PROFILE" ]; then gate_err "--profile は必須です"; print_usage >&2; return 2; fi
  if ! valid_profile "$PROFILE"; then
    gate_err "不正な profile: '$PROFILE' (production-minimal|main-dev|docs-only|test-only)"
    return 2
  fi
  case "$PR" in
    ''|*[!0-9]*) gate_err "--pr は数値で指定してください: '$PR'"; return 2 ;;
  esac

  # --- 依存チェック ---
  if ! command -v gh >/dev/null 2>&1; then gate_err "gh が見つかりません"; return 3; fi
  if ! command -v python3 >/dev/null 2>&1; then gate_err "python3 が見つかりません"; return 3; fi

  # --- repo 解決 ---
  if [ -z "$REPO" ]; then
    REPO="$(resolve_repo)" || { gate_err "リポジトリを特定できません。--repo owner/repo を指定してください"; return 3; }
  fi

  # --- PR メタデータ取得（gh pr view を 1 回。path のみ。本文は取得しない） ---
  _gate_err_file="${TMPDIR:-/tmp}/shogi_pr_gate_gherr.$$"
  PR_JSON="$(fetch_pr_json "$PR" "$REPO" 2>"$_gate_err_file")"
  _fetch_rc=$?
  if [ $_fetch_rc -ne 0 ] || [ -z "$PR_JSON" ]; then
    gate_err "PR #$PR ($REPO) の取得に失敗しました (gh exit=$_fetch_rc)"
    [ -s "$_gate_err_file" ] && sed 's/^/  gh: /' "$_gate_err_file" >&2
    rm -f "$_gate_err_file"
    return 3
  fi
  rm -f "$_gate_err_file"

  # --- scalar フィールド抽出（python3 で 1 回パースして 1 行ずつ） ---
  {
    read -r PR_NUMBER
    read -r PR_STATE
    read -r PR_DRAFT
    read -r PR_BASE
    read -r PR_HEAD
    read -r PR_MERGEABLE
    read -r PR_MERGESTATE
  } < <(PR_JSON_ENV="$PR_JSON" python3 <<'PY'
import json, os
d = json.loads(os.environ.get("PR_JSON_ENV", "{}") or "{}")
print(d.get("number", ""))
print(d.get("state", ""))
print("true" if d.get("isDraft") else "false")
print(d.get("baseRefName", ""))
print(d.get("headRefName", ""))
print(d.get("mergeable", ""))
print(d.get("mergeStateStatus", ""))
PY
)

  # --- changed files の path 一覧（本文は取得していない） ---
  CHANGED_FILES=""
  while IFS= read -r _line; do
    [ -n "$_line" ] && CHANGED_FILES="$CHANGED_FILES$_line
"
  done < <(PR_JSON_ENV="$PR_JSON" python3 <<'PY'
import json, os
d = json.loads(os.environ.get("PR_JSON_ENV", "{}") or "{}")
for f in (d.get("files") or []):
    p = f.get("path", "")
    if p:
        print(p)
PY
)

  _file_count=0
  if [ -n "$CHANGED_FILES" ]; then
    _file_count="$(printf '%s' "$CHANGED_FILES" | grep -c .)"
  fi

  # =========================================================================
  # レポート出力
  # =========================================================================
  echo "============================================================"
  echo "  SHOGI-TOUR PR Gate Check"
  echo "============================================================"
  echo "  PR        : #$PR_NUMBER ($REPO)"
  echo "  profile   : $PROFILE"
  echo "  base/head : $PR_BASE  <-  $PR_HEAD"
  if [ "$PR_DRAFT" = "true" ]; then _draft_disp="Draft"; else _draft_disp="Ready"; fi
  echo "  state     : $PR_STATE ($_draft_disp)"
  echo "  mergeable : ${PR_MERGEABLE:-UNKNOWN} / ${PR_MERGESTATE:-UNKNOWN}"
  echo "  changed   : ${_file_count} files"

  echo ""
  echo "[changed files] (path のみ。本文は未取得)"
  if [ "$_file_count" -eq 0 ]; then
    echo "  (なし)"
  else
    printf '%s' "$CHANGED_FILES" | while IFS= read -r _f; do
      [ -n "$_f" ] && echo "  - $_f"
    done
  fi

  # -------------------------------------------------------------------------
  # チェック実行
  # -------------------------------------------------------------------------
  echo ""
  echo "[checks]"

  # state は OPEN であること
  if [ "$PR_STATE" = "OPEN" ]; then
    gate_ok "PR は OPEN"
  else
    gate_ng "PR が OPEN ではない (state=$PR_STATE) → Ready/merge 不可"
  fi

  # draft は情報表示のみ（Ready 化前提なので減点しない）
  if [ "$PR_DRAFT" = "true" ]; then
    gate_ok "Draft 状態（承認後に Ready 化する想定）"
  else
    gate_ok "既に Ready 状態"
  fi

  # base ブランチ profile 別
  case "$PROFILE" in
    production-minimal)
      if [ "$PR_BASE" = "$PRODUCTION_BRANCH" ]; then
        gate_ok "base が $PRODUCTION_BRANCH"
      else
        gate_ng "base が $PRODUCTION_BRANCH ではない (base=$PR_BASE)"
      fi
      ;;
    main-dev)
      if [ "$PR_BASE" = "$MAIN_BRANCH" ]; then
        gate_ok "base が $MAIN_BRANCH"
      elif [ "$PR_BASE" = "$PRODUCTION_BRANCH" ]; then
        gate_ng "main-dev なのに base が $PRODUCTION_BRANCH（production を触る PR）"
      else
        gate_ng "base が $MAIN_BRANCH ではない (base=$PR_BASE)"
      fi
      ;;
    docs-only|test-only)
      # Should Fix 2: profile 定義上 production 以外が条件。base=production は NG（BLOCKED）。
      if [ "$PR_BASE" = "$PRODUCTION_BRANCH" ]; then
        gate_ng "$PROFILE の base が $PRODUCTION_BRANCH（profile 定義上 production 以外が条件 → NG）"
      else
        gate_ok "base は production 以外 ($PR_BASE)"
      fi
      ;;
  esac

  # mergeable + mergeStateStatus（Should Fix 1）
  #   READY_CANDIDATE は mergeable=MERGEABLE かつ mergeStateStatus=CLEAN のときだけ。
  #   mergeable=MERGEABLE でも mergeStateStatus!=CLEAN（BLOCKED/UNSTABLE/BEHIND/DIRTY/
  #   空/UNKNOWN 等）は WARN（NEEDS_REVIEW）として approved_merge を停止させる。
  #   出力には mergeable と mergeStateStatus の両方を必ず明示する。
  _ms="${PR_MERGESTATE:-}"
  case "${PR_MERGEABLE:-}" in
    MERGEABLE)
      case "$_ms" in
        CLEAN)
          gate_ok   "mergeable=MERGEABLE / mergeStateStatus=CLEAN" ;;
        ""|UNKNOWN)
          gate_warn "mergeable=MERGEABLE / mergeStateStatus=${_ms:-UNKNOWN}（算出中/不明。CLEAN を確認するまで保留）" ;;
        *)
          gate_warn "mergeable=MERGEABLE / mergeStateStatus=$_ms（CLEAN でない: BLOCKED/UNSTABLE/BEHIND/DIRTY 等。要確認）" ;;
      esac
      ;;
    CONFLICTING)
      gate_ng   "mergeable=CONFLICTING / mergeStateStatus=${_ms:-UNKNOWN}（コンフリクトあり）" ;;
    ""|UNKNOWN)
      gate_warn "mergeable=${PR_MERGEABLE:-UNKNOWN} / mergeStateStatus=${_ms:-UNKNOWN}（GitHub 算出中。時間をおいて再実行）" ;;
    *)
      gate_warn "mergeable=$PR_MERGEABLE / mergeStateStatus=${_ms:-UNKNOWN}（要確認）" ;;
  esac

  # 変更ファイル数（production-minimal は空も WARN）
  if [ "$_file_count" -eq 0 ]; then
    gate_warn "changed files が 0 件（マージ対象が無い？要確認）"
  fi

  # -------------------------------------------------------------------------
  # forbidden file 判定 + real data risk 判定
  # -------------------------------------------------------------------------
  _forbidden_list=""
  _realdata_risk_list=""
  _realdata_warn_list=""
  if [ "$_file_count" -gt 0 ]; then
    printf '%s' "$CHANGED_FILES" | while IFS= read -r _f; do
      [ -n "$_f" ] || continue
      _cls="$(classify_path "$PROFILE" "$_f")"
      _risk="$(realdata_risk_path "$_f")"
      echo "$_cls|$_risk|$_f"
    done > "${TMPDIR:-/tmp}/shogi_pr_gate_cls.$$"

    while IFS='|' read -r _cls _risk _f; do
      [ -n "$_f" ] || continue
      if [ "$_cls" = "FORBIDDEN" ]; then
        _forbidden_list="$_forbidden_list  - $_f
"
      fi
      if [ "$_risk" = "RISK" ]; then
        _realdata_risk_list="$_realdata_risk_list  - $_f
"
      elif [ "$_risk" = "WARN" ]; then
        _realdata_warn_list="$_realdata_warn_list  - $_f
"
      fi
    done < "${TMPDIR:-/tmp}/shogi_pr_gate_cls.$$"
    rm -f "${TMPDIR:-/tmp}/shogi_pr_gate_cls.$$"
  fi

  echo ""
  echo "[forbidden files] ($PROFILE で許可されないパス)"
  if [ -n "$_forbidden_list" ]; then
    printf '%s' "$_forbidden_list"
    gate_ng "$PROFILE で許可されないファイルが含まれる（上記）"
  else
    echo "  (なし)"
    gate_ok "forbidden file なし"
  fi

  echo ""
  echo "[real data risk] (path ベース簡易検出。本文は読んでいない)"
  if [ -n "$_realdata_risk_list" ]; then
    echo "  RISK (data/ 配下 = 実データ置き場):"
    printf '%s' "$_realdata_risk_list"
    gate_ng "実データの疑いが高いパスが含まれる（data/ 配下）"
  fi
  if [ -n "$_realdata_warn_list" ]; then
    echo "  WARN (synthetic 表記の無い構造化データ):"
    printf '%s' "$_realdata_warn_list"
    gate_warn "実データの可能性があるファイル（synthetic 等の表記なし。要目視）"
  fi
  if [ -z "$_realdata_risk_list" ] && [ -z "$_realdata_warn_list" ]; then
    echo "  (なし)"
    gate_ok "real data risk の簡易検出: 該当なし"
  fi

  # -------------------------------------------------------------------------
  # 最終判定
  # -------------------------------------------------------------------------
  if [ "$GATE_NG_COUNT" -gt 0 ]; then
    _verdict="BLOCKED"; _exit=20
  elif [ "$GATE_WARN_COUNT" -gt 0 ]; then
    _verdict="NEEDS_REVIEW"; _exit=10
  else
    _verdict="READY_CANDIDATE"; _exit=0
  fi

  echo ""
  echo "============================================================"
  echo "  集計: OK=$GATE_OK_COUNT  WARN=$GATE_WARN_COUNT  NG=$GATE_NG_COUNT"
  echo "  最終判定: $_verdict"
  echo "============================================================"

  # 次に必要な人間承認文の例
  echo ""
  echo "[次のアクション]"
  case "$_verdict" in
    READY_CANDIDATE)
      echo "  自動ゲートは通過。ただし Ready 化・merge には人間の明示承認が必要です。"
      echo ""
      echo "  --- 承認文の例（人間が返す） ---"
      echo "  「PR #$PR を $PROFILE として Ready 化し squash merge してよい。branch は保持する。」"
      echo ""
      echo "  --- 承認後に実行するコマンド ---"
      echo "  dry-run : ./scripts/shogi_tour_approved_merge.sh --pr $PR --profile $PROFILE --dry-run"
      echo "  実行    : ./scripts/shogi_tour_approved_merge.sh --pr $PR --profile $PROFILE --execute"
      ;;
    NEEDS_REVIEW)
      echo "  WARN 項目を解消するか、人間が個別にレビュー・承認してください。"
      echo "  解消後にこの gate を再実行し、READY_CANDIDATE を確認してから承認します。"
      ;;
    BLOCKED)
      echo "  NG 項目があるため、この PR を $PROFILE で Ready 化・merge してはいけません。"
      echo "  原因（base 不一致 / forbidden file / 実データ / コンフリクト等）を解消するか、"
      echo "  適切な profile を選び直してください。"
      ;;
  esac

  return "$_exit"
}

# -----------------------------------------------------------------------------
# 直接実行された場合のみ main を呼ぶ（source 時は純粋関数のみ提供）
# -----------------------------------------------------------------------------
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  gate_main "$@"
  exit $?
fi
