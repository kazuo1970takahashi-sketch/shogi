#!/usr/bin/env bash
# =============================================================================
# auto_merge_gate_decision.sh — AUTO-MERGE-GATE-001 発火判定（純関数・read-only）
# -----------------------------------------------------------------------------
# 憲章 v2.0/v2.1 §5「自動マージゲート」の発火/停止判定だけを行う純関数スクリプト。
# gh / git / network には一切触れない。事実（PR の状態・ラベル・CI 集計）を env で
# 受け取り、判定を 1 行で標準出力に返す。
#
#   FIRE            … 全条件成立。呼び出し側（.github/workflows/auto-merge-gate.yml）が
#                     Ready化 → head-CAS 付き squash merge → branch削除 → 完了コメント を実行してよい。
#   SKIP <code>     … 停止条件に該当。何もしない（Draft 維持）。
#
# 入力（env）:
#   AMG_BASE_REF        PR の base branch 名（必須）
#   AMG_STATE           OPEN / CLOSED / MERGED（必須）
#   AMG_LABELS          ラベル名のカンマ区切り（例: "codex-go,doc-sync"。空可）
#   AMG_CHECKS_TOTAL    ゲート自身を除く check 総数（必須・数値）
#   AMG_CHECKS_FAILED   失敗した check 数（必須・数値）
#   AMG_CHECKS_PENDING  未完了の check 数（必須・数値）
#   AMG_PRODUCTION_BRANCH  production ブランチ名（省略時: production）
#   AMG_ALLOWED_BASES   自動マージを許す base のカンマ区切り allowlist
#                       （省略時: main,chore/shogi-tour-apphq-003h-2d-orphan-clean-base）
#
# SKIP code（憲章 §5 停止条件と 1:1）:
#   base-production   base が production / release/*（L5 は対象外・最重要ガード）
#   base-not-allowed  base が allowlist 外（feature→feature 等へは merge しない）
#   pr-not-open       PR が closed / merged 済み
#   label-blocked     needs-codex / codex-block ラベルあり
#   label-missing     codex-go ラベルなし
#   ci-none           check が 1 つも無い（CI 未発火 = green の証明が無いので発火しない）
#   ci-red            失敗 check あり
#   ci-pending        未完了 check あり
#
# 終了コード: 0=判定成功（FIRE/SKIP とも） 2=入力エラー
#
# 安全方針:
#   - mutating 操作ゼロ（判定のみ）。head-CAS そのものは merge API の sha パラメータ
#     （gh pr merge --match-head-commit）で GitHub 側が原子的に保証する。
#   - 判定順は「production ガード最優先」。ラベル・CI が全部揃っていても base が
#     production 系なら必ず SKIP base-production を返す。
#
# 依存: bash 3.2+ のみ（macOS /bin/bash で動作。多バイト隣接は ${VAR} bracing 統一）。
# test/test_auto_merge_gate_decision.sh から source して単体テストする。
# =============================================================================

# amg_has_label <labels_csv> <name> -> 0(あり)/1(なし)
amg_has_label() {
  case ",$1," in
    *",$2,"*) return 0 ;;
    *) return 1 ;;
  esac
}

# amg_base_allowed <base> <allowlist_csv> -> 0(許可)/1(不許可)
amg_base_allowed() {
  case ",$2," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

# amg_is_number <値> -> 0(非負整数)/1(それ以外)
amg_is_number() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

# amg_decide — env を読み、判定 1 行を stdout へ。rc 0=判定成功 / 2=入力エラー
amg_decide() {
  _base="${AMG_BASE_REF:-}"
  _state="${AMG_STATE:-}"
  _labels="${AMG_LABELS:-}"
  _total="${AMG_CHECKS_TOTAL:-}"
  _failed="${AMG_CHECKS_FAILED:-}"
  _pending="${AMG_CHECKS_PENDING:-}"
  _prod="${AMG_PRODUCTION_BRANCH:-production}"
  _allowed="${AMG_ALLOWED_BASES:-main,chore/shogi-tour-apphq-003h-2d-orphan-clean-base}"

  if [ -z "${_base}" ] || [ -z "${_state}" ]; then
    echo "ERROR missing-input" >&2
    return 2
  fi
  if ! amg_is_number "${_total}" || ! amg_is_number "${_failed}" || ! amg_is_number "${_pending}"; then
    echo "ERROR bad-check-counts" >&2
    return 2
  fi

  # 1. 最重要ガード: base=production / release/* は L5 = 自動マージ対象外
  case "${_base}" in
    "${_prod}"|release/*)
      echo "SKIP base-production"; return 0 ;;
  esac

  # 2. allowlist（feature→main または dev base に限る・憲章 §3）
  if ! amg_base_allowed "${_base}" "${_allowed}"; then
    echo "SKIP base-not-allowed"; return 0
  fi

  # 3. PR が open であること
  if [ "${_state}" != "OPEN" ]; then
    echo "SKIP pr-not-open"; return 0
  fi

  # 4. 停止ラベル
  if amg_has_label "${_labels}" "needs-codex" || amg_has_label "${_labels}" "codex-block"; then
    echo "SKIP label-blocked"; return 0
  fi

  # 5. GO ラベル
  if ! amg_has_label "${_labels}" "codex-go"; then
    echo "SKIP label-missing"; return 0
  fi

  # 6. CI: 1 つ以上・全完了・全 green
  if [ "${_total}" -eq 0 ]; then
    echo "SKIP ci-none"; return 0
  fi
  if [ "${_failed}" -gt 0 ]; then
    echo "SKIP ci-red"; return 0
  fi
  if [ "${_pending}" -gt 0 ]; then
    echo "SKIP ci-pending"; return 0
  fi

  echo "FIRE"
  return 0
}

# 直接実行時のみ判定を走らせる（source 時は関数提供のみ = 単体テスト用）
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  amg_decide
  exit $?
fi
