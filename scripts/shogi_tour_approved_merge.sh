#!/usr/bin/env bash
# =============================================================================
# shogi_tour_approved_merge.sh  —  SHOGI-TOUR-AUTO-001 承認後 merge 支援
# -----------------------------------------------------------------------------
# 人間の明示承認後にだけ、PR の Ready 化 → squash merge → branch 保持確認 →
# 完了報告テンプレート生成 を支援する。
#
# !! 安全方針（依頼 SHOGI-TOUR-AUTO-001）!!
#   - デフォルトは dry-run。--execute が無い限り gh pr ready / gh pr merge は実行しない。
#   - 実行前に shogi_tour_pr_gate.sh を内部で呼び、READY_CANDIDATE でなければ停止する。
#   - 実行は対話確認（YES 入力）または --yes が必要。無承認 merge は走らせない。
#   - --delete-branch は絶対に使わない（branch 削除しない）。
#   - gh pr merge に --auto は使わない（自動 merge 予約をしない）。
#   - production / main への直接 push、Pages 設定変更、release/deploy/publish はしない。
#   - PR 本文の自動更新はしない。実名・実データはログに出さない（gate が path のみ検査）。
#
# 使い方:
#   ./scripts/shogi_tour_approved_merge.sh --pr <番号> --profile <profile> --dry-run
#   ./scripts/shogi_tour_approved_merge.sh --pr <番号> --profile <profile> --execute [--yes] [--post-comment]
#
# 終了コード:
#   0  正常（dry-run 完了 / execute 完了）
#   2  引数エラー
#   3  実行時エラー（gate スクリプト無し / gh 失敗など）
#   4  実行中止（確認 NG / 無承認 / 非対話）
#   10 gate=NEEDS_REVIEW のため停止
#   20 gate=BLOCKED のため停止
#
# 依存: bash 3.2+, gh (認証済み), python3
# =============================================================================

PROG_NAME="$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE_SCRIPT="$SCRIPT_DIR/shogi_tour_pr_gate.sh"

err()  { printf '%s: error: %s\n' "$PROG_NAME" "$1" >&2; }
note() { printf '%s\n' "$1"; }

print_usage() {
  cat <<USAGE
使い方: $PROG_NAME --pr <番号> --profile <profile> [--dry-run|--execute] [options]

必須:
  --pr <番号>            対象 PR 番号 (数値)
  --profile <profile>    production-minimal | main-dev | docs-only | test-only

モード（省略時は dry-run）:
  --dry-run              何も変更しない。gate を実行し、実行予定の操作を表示するだけ。
  --execute              Ready 化 + squash merge を実行する（要確認 / 要 --yes）。

任意:
  --yes                  --execute 時の対話確認をスキップ（無人実行を明示許可）。
  --post-comment         merge 後に完了報告を PR コメントとして投稿（--execute 時のみ）。
  --repo <owner/repo>    対象リポジトリ（省略時は gh / git remote から推定）。
  --production-branch <名>  production ブランチ名 (default: production)
  --main-branch <名>        main ブランチ名 (default: main)
  -h, --help             この使い方を表示。

安全: --delete-branch / --auto は使用しない。production/main へ直接 push しない。
USAGE
}

# JSON blob から指定キーを取り出す（python3。--jq に依存しないので mock しやすい）
json_get() {
  # $1=blob  $2=python式(dを使って値を出す)
  BLOB_ENV="$1" python3 - "$2" <<'PY'
import json, os, sys
expr = sys.argv[1]
d = json.loads(os.environ.get("BLOB_ENV", "{}") or "{}")
try:
    v = eval(expr, {"__builtins__": {}}, {"d": d})
except Exception:
    v = ""
print("" if v is None else v)
PY
}

run_gate() {
  # gate を実行（出力はそのまま表示）。終了コードを返す。
  bash "$GATE_SCRIPT" --pr "$PR" --profile "$PROFILE" --repo "$REPO" \
    --production-branch "$PRODUCTION_BRANCH" --main-branch "$MAIN_BRANCH"
}

print_completion_report() {
  # $1 = base 最新 SHA（不明なら "(dry-run: 未取得)" など）
  # $2 = head branch 保持状態の文言
  _sha="$1"
  _head_state="$2"
  echo "=== 完了報告テンプレート (SHOGI-TOUR PR #$PR) ==="
  echo "- 対象 PR      : #$PR ($REPO)"
  echo "- profile      : $PROFILE"
  echo "- base <- head : $PR_BASE  <-  $PR_HEAD"
  echo "- 操作          : Ready 化 → squash merge（--delete-branch 不使用 / --auto 不使用）"
  echo "- $PR_BASE 反映 : 最新 SHA $_sha"
  echo "- head branch   : $_head_state"
  echo "- 実データ      : gate で path ベース検査済み（READY_CANDIDATE）"
  echo "- 未実施        : branch 削除 / Pages 設定変更 / release / deploy / publish / PR 本文更新"
  echo "=== ここまで ==="
}

amerge_main() {
  set -u

  PR=""
  PROFILE=""
  REPO=""
  PRODUCTION_BRANCH="production"
  MAIN_BRANCH="main"
  MODE="dry-run"
  MODE_SET=""
  ASSUME_YES="0"
  POST_COMMENT="0"

  while [ $# -gt 0 ]; do
    case "$1" in
      --pr)               [ $# -ge 2 ] || { err "--pr に値が必要です"; return 2; }; PR="$2"; shift 2 ;;
      --pr=*)             PR="${1#*=}"; shift ;;
      --profile)          [ $# -ge 2 ] || { err "--profile に値が必要です"; return 2; }; PROFILE="$2"; shift 2 ;;
      --profile=*)        PROFILE="${1#*=}"; shift ;;
      --repo)             [ $# -ge 2 ] || { err "--repo に値が必要です"; return 2; }; REPO="$2"; shift 2 ;;
      --repo=*)           REPO="${1#*=}"; shift ;;
      --production-branch) [ $# -ge 2 ] || { err "--production-branch に値が必要です"; return 2; }; PRODUCTION_BRANCH="$2"; shift 2 ;;
      --main-branch)      [ $# -ge 2 ] || { err "--main-branch に値が必要です"; return 2; }; MAIN_BRANCH="$2"; shift 2 ;;
      --dry-run)          if [ "$MODE_SET" = "execute" ]; then err "--dry-run と --execute は同時指定不可"; return 2; fi; MODE="dry-run"; MODE_SET="dry-run"; shift ;;
      --execute)          if [ "$MODE_SET" = "dry-run" ]; then err "--dry-run と --execute は同時指定不可"; return 2; fi; MODE="execute"; MODE_SET="execute"; shift ;;
      --yes)              ASSUME_YES="1"; shift ;;
      --post-comment)     POST_COMMENT="1"; shift ;;
      -h|--help)          print_usage; return 0 ;;
      *)                  err "不明な引数: $1"; print_usage >&2; return 2 ;;
    esac
  done

  # --- 引数検証 ---
  if [ -z "$PR" ]; then err "--pr は必須です"; print_usage >&2; return 2; fi
  if [ -z "$PROFILE" ]; then err "--profile は必須です"; print_usage >&2; return 2; fi
  case "$PROFILE" in
    production-minimal|main-dev|docs-only|test-only) : ;;
    *) err "不正な profile: '$PROFILE'"; return 2 ;;
  esac
  case "$PR" in
    ''|*[!0-9]*) err "--pr は数値で指定してください: '$PR'"; return 2 ;;
  esac
  if [ "$POST_COMMENT" = "1" ] && [ "$MODE" != "execute" ]; then
    err "--post-comment は --execute 時のみ有効です"; return 2
  fi

  # --- 依存チェック ---
  if [ ! -f "$GATE_SCRIPT" ]; then err "gate スクリプトが見つかりません: $GATE_SCRIPT"; return 3; fi
  if ! command -v gh >/dev/null 2>&1; then err "gh が見つかりません"; return 3; fi
  if ! command -v python3 >/dev/null 2>&1; then err "python3 が見つかりません"; return 3; fi

  # --- repo 解決（read-only） ---
  if [ -z "$REPO" ]; then
    REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)"
    if [ -z "$REPO" ]; then err "リポジトリを特定できません。--repo owner/repo を指定してください"; return 3; fi
  fi

  echo "============================================================"
  echo "  SHOGI-TOUR Approved Merge  (mode: $MODE)"
  echo "  PR #$PR / profile=$PROFILE / repo=$REPO"
  echo "============================================================"

  # --- PR の base/head/state を取得（read-only。本文は取らない） ---
  _meta="$(gh pr view "$PR" --repo "$REPO" --json baseRefName,headRefName,state 2>/dev/null)"
  if [ -z "$_meta" ]; then err "PR #$PR ($REPO) のメタデータ取得に失敗しました"; return 3; fi
  PR_BASE="$(json_get "$_meta" 'd.get("baseRefName","")')"
  PR_HEAD="$(json_get "$_meta" 'd.get("headRefName","")')"
  PR_STATE="$(json_get "$_meta" 'd.get("state","")')"
  echo "  base <- head : $PR_BASE  <-  $PR_HEAD   (state=$PR_STATE)"

  # =========================================================================
  # Step 1: gate（READY_CANDIDATE でなければ停止）
  # =========================================================================
  echo ""
  echo "----- Step 1: PR Gate Check -----"
  run_gate
  _gate_rc=$?
  if [ "$_gate_rc" -ne 0 ]; then
    echo ""
    err "gate が READY_CANDIDATE ではありません (exit=$_gate_rc) → ここで停止します。"
    case "$_gate_rc" in
      10) err "判定: NEEDS_REVIEW（WARN 解消後に再実行してください）"; return 10 ;;
      20) err "判定: BLOCKED（NG 解消 / profile 見直しが必要）"; return 20 ;;
      *)  err "gate 実行時エラー"; return 3 ;;
    esac
  fi
  echo ""
  note "gate 判定: READY_CANDIDATE"

  # =========================================================================
  # Step 2: dry-run なら、ここで「実行予定の操作」を表示して終了（変更しない）
  # =========================================================================
  if [ "$MODE" = "dry-run" ]; then
    echo ""
    echo "----- DRY-RUN: 以下は実行しません（--execute で実行） -----"
    echo "  1) gh pr ready  $PR --repo $REPO"
    echo "  2) (Ready 化後) gate を再実行し READY_CANDIDATE を再確認"
    echo "  3) gh pr merge  $PR --repo $REPO --squash      # --delete-branch なし / --auto なし"
    echo "  4) $PR_BASE の最新 SHA を表示"
    echo "  5) head branch '$PR_HEAD' が remote に残存していることを確認"
    if [ "$POST_COMMENT" = "1" ]; then
      echo "  6) （--post-comment）完了報告を PR コメントとして投稿"
    fi
    echo ""
    echo "----- 完了報告テンプレート（プレビュー） -----"
    print_completion_report "(dry-run: 未取得)" "保持予定（削除しない）"
    echo ""
    note "DRY-RUN 完了。実際に実行するには:"
    note "  ./scripts/$PROG_NAME --pr $PR --profile $PROFILE --execute"
    note "（対話端末で YES を入力、または --yes を付与。無人実行は --yes 明示時のみ）"
    return 0
  fi

  # =========================================================================
  # Step 3: execute — 実行前の確認（無承認 merge 防止）
  # =========================================================================
  echo ""
  echo "############################################################"
  echo "#  実行確認 (EXECUTE MODE)"
  echo "#  PR #$PR を Ready 化し squash merge します。"
  echo "#    base <- head : $PR_BASE  <-  $PR_HEAD"
  echo "#    profile      : $PROFILE"
  echo "#    操作         : gh pr ready  →  gh pr merge --squash"
  echo "#    branch 削除  : しません（--delete-branch 不使用）"
  echo "#    自動 merge   : しません（--auto 不使用）"
  echo "#  production/main への直接 push・Pages 変更・deploy は行いません。"
  echo "############################################################"
  if [ "$ASSUME_YES" = "1" ]; then
    note "  --yes 指定により対話確認をスキップして続行します。"
  elif [ -t 0 ]; then
    printf '  続行するには大文字で YES と入力: '
    read -r _reply
    if [ "$_reply" != "YES" ]; then
      err "'YES' 以外が入力されたため中止しました。"
      return 4
    fi
  else
    err "対話端末ではなく --yes も無いため、安全のため中止します（無承認 merge 防止）。"
    return 4
  fi

  # --- Step 4: Ready 化 ---
  echo ""
  echo "----- Step: gh pr ready -----"
  if ! gh pr ready "$PR" --repo "$REPO"; then
    err "gh pr ready に失敗しました。merge せず停止します。"
    return 3
  fi
  note "Ready 化しました。"

  # --- Step 5: Ready 化後に gate を再実行（READY_CANDIDATE でなければ merge しない） ---
  echo ""
  echo "----- Step: Ready 化後の再 Gate Check -----"
  run_gate
  _gate_rc2=$?
  if [ "$_gate_rc2" -ne 0 ]; then
    echo ""
    err "Ready 化後の gate が READY_CANDIDATE ではありません (exit=$_gate_rc2) → merge せず停止します。"
    err "（mergeable=UNKNOWN の場合は GitHub の算出待ち。少し置いて --execute を再実行してください）"
    return "$_gate_rc2"
  fi
  note "再 gate 判定: READY_CANDIDATE"

  # --- Step 6: squash merge（--delete-branch なし / --auto なし） ---
  echo ""
  echo "----- Step: gh pr merge --squash -----"
  if ! gh pr merge "$PR" --repo "$REPO" --squash; then
    err "gh pr merge に失敗しました。"
    return 3
  fi
  note "squash merge を実行しました（branch は削除していません）。"

  # --- Step 7: base 最新 SHA ---
  echo ""
  echo "----- Step: $PR_BASE の最新 SHA -----"
  _base_blob="$(gh api "repos/$REPO/branches/$PR_BASE" 2>/dev/null)"
  _base_sha="$(json_get "$_base_blob" 'd.get("commit",{}).get("sha","")')"
  if [ -z "$_base_sha" ]; then _base_sha="(取得できず。gh api repos/$REPO/branches/$PR_BASE を手動確認)"; fi
  note "  $PR_BASE head SHA: $_base_sha"

  # --- Step 8: head branch が remote に残存しているか確認 ---
  echo ""
  echo "----- Step: head branch '$PR_HEAD' の残存確認 -----"
  _head_blob="$(gh api "repos/$REPO/branches/$PR_HEAD" 2>/dev/null)"
  _head_name="$(json_get "$_head_blob" 'd.get("name","")')"
  if [ -n "$_head_name" ]; then
    _head_state="保持されています（remote に '$PR_HEAD' が存在。削除していません）"
    note "  OK: head branch '$PR_HEAD' は remote に残存しています。"
  else
    _head_state="!! remote に '$PR_HEAD' が見つかりません（本スクリプトは削除していません。リポジトリの自動削除設定や手動操作を確認してください）"
    note "  WARN: head branch '$PR_HEAD' が見つかりません。"
    note "        本スクリプトは --delete-branch を使用していません。"
    note "        リポジトリの 'Automatically delete head branches' 設定や手動削除を確認してください。"
  fi

  # --- Step 9: 完了報告テンプレート ---
  echo ""
  echo "----- 完了報告テンプレート -----"
  print_completion_report "$_base_sha" "$_head_state"

  # --- Step 10: （任意）PR コメント投稿 ---
  if [ "$POST_COMMENT" = "1" ]; then
    echo ""
    echo "----- Step: 完了報告を PR コメント投稿（--post-comment） -----"
    _comment_body="$(print_completion_report "$_base_sha" "$_head_state")"
    if gh pr comment "$PR" --repo "$REPO" --body "$_comment_body"; then
      note "  PR #$PR に完了報告コメントを投稿しました。"
    else
      err "  PR コメント投稿に失敗しました（merge は完了済み）。"
    fi
  fi

  echo ""
  note "EXECUTE 完了。branch 削除・Pages 変更・deploy・release は行っていません。"
  return 0
}

# 直接実行された場合のみ main を呼ぶ（source 時は関数のみ提供）
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  amerge_main "$@"
  exit $?
fi
