#!/usr/bin/env bash
# =============================================================================
# auto_merge_gate_decision.sh — AUTO-MERGE-GATE-001 発火判定（純関数・read-only）
# -----------------------------------------------------------------------------
# 憲章 v2.0/v2.1 §5「自動マージゲート」の発火/停止判定だけを行う純関数スクリプト。
# gh / git / network には一切触れない。事実（PR の状態・ラベル・CI の生の集計）を env で
# 受け取り、判定を 1 行で標準出力に返す。
#
#   FIRE            … 全条件成立。呼び出し側（.github/workflows/auto-merge-gate.yml）が
#                     Ready化 → head-CAS 付き squash merge → branch削除 → 完了コメント を実行してよい。
#   SKIP <code>     … 停止条件に該当。何もしない（Draft 維持）。
#
# 001b（Codex レビュー P1×6 / P2×2 の反映）で変わった点:
#   - CI green の判定を「check 数の集計」から **必須チェック名の allowlist 照合** へ変更（P1-1）。
#     列挙した全チェックが存在し、かつ SUCCESS で完了して初めて green とみなす。
#   - conclusion を **SUCCESS のみ green** の allowlist 方式へ変更（P1-2）。
#     STALE / NEUTRAL / SKIPPED / CANCELLED 等、完了かつ非 SUCCESS はすべて停止条件。
#   - check 未登録（0 件）を「待てる状態」として区別（P1-3）。poll 中は ci-unregistered、
#     poll を打ち切った後に初めて ci-none（＝green の証明なしで終了）になる。
#   - 承認（codex-go）を **レビュー済み head SHA に束縛**（P1-4）。
#   - **base の再検証**（判定時 base からの付け替えを検出）（P1-5）。
#
# 入力（env）:
#   AMG_BASE_REF          PR の base branch 名（必須）
#   AMG_STATE             OPEN / CLOSED / MERGED（必須）
#   AMG_LABELS            ラベル名のカンマ区切り（例: "codex-go,doc-sync"。空可）
#   AMG_HEAD_SHA          現在の head SHA（空可＝未取得）
#   AMG_APPROVED_HEAD_SHA 承認（codex-go 付与）が結び付いている head SHA。
#                         空＝「このトリガでは主張しない」（synchronize でのラベル自動剥奪が保証側）。
#                         非空かつ AMG_HEAD_SHA と不一致なら SKIP head-changed。
#   AMG_BASE_AT_DECISION  先行判定時に記録した base。空＝初回評価。
#                         非空かつ AMG_BASE_REF と不一致なら SKIP base-changed（merge 直前の再検証）。
#   AMG_REQUIRED_CHECKS   必須チェック名のカンマ区切り allowlist
#                         （省略時: branch ruleset と同じ2チェック。空文字は設定不備として停止）
#   AMG_CHECKS_TSV        head の check 一覧。1 行 = "<名前>\t<status>\t<conclusion>"。
#                         status は COMPLETED / それ以外（QUEUED・IN_PROGRESS・PENDING 等）。
#                         StatusContext は呼び出し側で同じ 3 列へ正規化して渡す。
#   AMG_POLL_EXHAUSTED    "true" なら CI 完了待ちの poll を打ち切った後の最終評価
#   AMG_PRODUCTION_BRANCH production ブランチ名（省略時: production）
#   AMG_ALLOWED_BASES     自動マージを許す base のカンマ区切り allowlist
#                         （省略時: 現在の開発本流のみ）
#
# SKIP code（憲章 §5 停止条件と 1:1）:
#   base-production   base が production / release/*（L5 は対象外・最重要ガード）
#   base-not-allowed  base が allowlist 外（feature→feature 等へは merge しない）
#   base-changed      判定後に base が付け替えられた（merge 直前の再検証・P1-5）
#   pr-not-open       PR が closed / merged 済み
#   label-blocked     needs-codex / codex-block ラベルあり
#   label-missing     codex-go ラベルなし
#   head-changed      承認された head と現在の head が違う（未レビュー commit・P1-4）
#   ci-config         必須チェック allowlist が空（設定不備＝fail closed・P1-1）
#   ci-unregistered   必須チェックがまだ登録されていない（poll 継続対象・P1-3）
#   ci-none           poll を打ち切っても必須チェックが登録されなかった（green の証明なし）
#   ci-red            必須チェックが完了したが conclusion が SUCCESS でない（P1-2）
#   ci-pending        必須チェックが登録済みだが未完了
#
# 終了コード: 0=判定成功（FIRE/SKIP とも） 2=入力エラー
#
# 安全方針:
#   - mutating 操作ゼロ（判定のみ）。head-CAS そのものは merge API の sha パラメータ
#     （gh pr merge --match-head-commit）で GitHub 側が原子的に保証する。
#   - 判定順は「production ガード最優先」。ラベル・CI が全部揃っていても base が
#     production 系なら必ず SKIP base-production を返す。
#   - CI の判定はすべて allowlist（必須名 × SUCCESS のみ）。未知の状態は必ず安全側に倒れる。
#
# 依存: bash 3.2+ のみ（macOS /bin/bash で動作。多バイト隣接は ${VAR} bracing 統一）。
# test/test_auto_merge_gate_decision.sh から source して単体テストする。
# =============================================================================

# branch ruleset の必須チェック名（= e2e.yml の有効な check run 名）。
# 両者の一致は test/test_auto_merge_gate_decision.sh が機械照合する（ドリフト検出）。
AMG_DEFAULT_REQUIRED_CHECKS='Unit (run_tests.sh),Security Scan,E2E (Playwright)'

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

# amg_check_state <名前> — AMG_CHECKS_TSV から 1 チェックの状態を stdout へ返す。
#   SUCCESS      … 完了かつ conclusion=SUCCESS（allowlist・これだけが green）
#   RED          … 完了かつ conclusion が SUCCESS 以外（STALE/NEUTRAL/SKIPPED/CANCELLED 等を含む）
#   PENDING      … 未完了
#   MISSING      … その名前の check がまだ登録されていない
# 同名が複数ある場合は安全側（RED > PENDING > SUCCESS）で丸める。
amg_check_state() {
  _want="$1"
  _seen_success=0
  _seen_pending=0
  _seen_red=0
  while IFS="$(printf '\t')" read -r _cname _cstatus _cconc _rest; do
    [ -z "${_cname}" ] && continue
    [ "${_cname}" != "${_want}" ] && continue
    if [ "${_cstatus}" != "COMPLETED" ]; then
      _seen_pending=1
    elif [ "${_cconc}" = "SUCCESS" ]; then
      _seen_success=1
    else
      _seen_red=1
    fi
  done <<EOF
${AMG_CHECKS_TSV:-}
EOF
  if [ "${_seen_red}" -eq 1 ]; then echo "RED"; return 0; fi
  if [ "${_seen_pending}" -eq 1 ]; then echo "PENDING"; return 0; fi
  if [ "${_seen_success}" -eq 1 ]; then echo "SUCCESS"; return 0; fi
  echo "MISSING"
}

# amg_decide — env を読み、判定 1 行を stdout へ。rc 0=判定成功 / 2=入力エラー
amg_decide() {
  _base="${AMG_BASE_REF:-}"
  _state="${AMG_STATE:-}"
  _labels="${AMG_LABELS:-}"
  _head="${AMG_HEAD_SHA:-}"
  _approved_head="${AMG_APPROVED_HEAD_SHA:-}"
  _base_at_decision="${AMG_BASE_AT_DECISION:-}"
  _required="${AMG_REQUIRED_CHECKS-${AMG_DEFAULT_REQUIRED_CHECKS}}"
  _exhausted="${AMG_POLL_EXHAUSTED:-false}"
  _prod="${AMG_PRODUCTION_BRANCH:-production}"
  _allowed="${AMG_ALLOWED_BASES:-chore/shogi-tour-apphq-003h-2d-orphan-clean-base}"

  # ※ _required の既定は ${VAR-default}（unset のときだけ既定）。空文字を明示された場合は
  #   既定へ落とさず ci-config で止める＝設定不備を「たまたま既定で動く」形で隠さない。

  if [ -z "${_base}" ] || [ -z "${_state}" ]; then
    echo "ERROR missing-input" >&2
    return 2
  fi

  # 1. 最重要ガード: base=production / release/* は L5 = 自動マージ対象外
  case "${_base}" in
    "${_prod}"|release/*)
      echo "SKIP base-production"; return 0 ;;
  esac

  # 2. allowlist（feature→現在の開発本流に限る・憲章 §3）
  if ! amg_base_allowed "${_base}" "${_allowed}"; then
    echo "SKIP base-not-allowed"; return 0
  fi

  # 3. base の再検証（P1-5）: 判定時から base が付け替えられていたら止める。
  #    ※原子的な完全防御は production 側の branch protection の領分。ここは直前再検証。
  if [ -n "${_base_at_decision}" ] && [ "${_base_at_decision}" != "${_base}" ]; then
    echo "SKIP base-changed"; return 0
  fi

  # 4. PR が open であること
  if [ "${_state}" != "OPEN" ]; then
    echo "SKIP pr-not-open"; return 0
  fi

  # 5. 停止ラベル
  if amg_has_label "${_labels}" "needs-codex" || amg_has_label "${_labels}" "codex-block"; then
    echo "SKIP label-blocked"; return 0
  fi

  # 6. GO ラベル
  if ! amg_has_label "${_labels}" "codex-go"; then
    echo "SKIP label-missing"; return 0
  fi

  # 7. 承認された head への束縛（P1-4）。
  #    承認 head が主張されているのに現在の head と違う＝未レビュー commit なので止める。
  if [ -n "${_approved_head}" ] && [ "${_approved_head}" != "${_head}" ]; then
    echo "SKIP head-changed"; return 0
  fi

  # 8. 必須チェック allowlist（P1-1/P1-2/P1-3）
  if [ -z "${_required}" ]; then
    echo "SKIP ci-config"; return 0
  fi

  _n_missing=0
  _n_pending=0
  _n_red=0
  _old_ifs="$IFS"
  IFS=','
  for _name in ${_required}; do
    IFS="${_old_ifs}"
    [ -z "${_name}" ] && { IFS=','; continue; }
    _st=$(amg_check_state "${_name}")
    case "${_st}" in
      RED)     _n_red=$((_n_red + 1)) ;;
      PENDING) _n_pending=$((_n_pending + 1)) ;;
      MISSING) _n_missing=$((_n_missing + 1)) ;;
    esac
    IFS=','
  done
  IFS="${_old_ifs}"

  # 赤は待っても直らない＝最優先で終了させる
  if [ "${_n_red}" -gt 0 ]; then
    echo "SKIP ci-red"; return 0
  fi
  if [ "${_n_pending}" -gt 0 ]; then
    echo "SKIP ci-pending"; return 0
  fi
  if [ "${_n_missing}" -gt 0 ]; then
    if [ "${_exhausted}" = "true" ]; then
      echo "SKIP ci-none"      # 待ち切っても登録されなかった＝green の証明なし
    else
      echo "SKIP ci-unregistered"   # まだ登録されていないだけ＝poll 継続対象
    fi
    return 0
  fi

  echo "FIRE"
  return 0
}

# 直接実行時のみ判定を走らせる（source 時は関数提供のみ = 単体テスト用）
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  amg_decide
  exit $?
fi
