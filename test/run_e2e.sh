#!/usr/bin/env bash
# =============================================================================
# run_e2e.sh — [E2E-NOT-RUN-001 #865] test/e2e/*.e2e.js を全部走らせる
#
#   なぜ要るか: これらは「DOM モックでは測れないもの」（select.value / sessionStorage /
#   window.opener / 可視性 / レイアウトの押し下げ量）を測るために作られたのに、
#   **CI でも test/run_tests.sh の全量でも1回も実行されていなかった**。
#     - run_tests.sh の自動発見は test/ 直下の test_*.js / test_*.sh / *_pgtest.sh のみ
#       （サブディレクトリは対象外・STAGE0-CONFLICT-FREE-001）
#     - .github/workflows/e2e.yml の E2E ジョブは `if: false` で止まっていた
#   結果、2スイートが**ずっと落ちたまま誰にも気づかれていなかった**（IN-APP-MODAL-001 #606 で
#   native confirm がアプリ内モーダルへ変わった際に追従できていなかった）。
#
#   ★「走っているつもりで走っていない」を繰り返さないため、対象が 0 件なら**失敗**にする。
#     緑と「何も検査していない」を区別できない状態を作らない。
#
# 並列実行 [E2E-PARALLEL-001]:
#   スイートと変異チェッカーを既定4並列で走らせる（E2E_JOBS で変更・E2E_JOBS=1 で従来の直列）。
#   - 並列で安全な根拠: 全スイートはポート/サーバを使わず（grep で実測0件・各自が
#     browser を起動して file/URL を開くだけ）、変異チェッカーは mktemp -d の専用
#     ディレクトリに生成する＝ジョブ間の共有資源が無い。
#   - 各ジョブの出力はジョブ別ログに貯め、**終了後に起動した順序どおり**まとめて表示する
#     （交互に混ざった出力を出さない。各見出しに実測秒数を添える）。
#
# 使い方:
#   bash test/run_e2e.sh                 # 既定は同じリポジトリの shogi_v4.html
#   bash test/run_e2e.sh <html-or-url>   # 対象を明示（各スイートの第1引数へ渡す）
#   E2E_JOBS=1 bash test/run_e2e.sh      # 直列（従来どおり）
#
# 終了コード: 0=全スイート PASS / 1=1つでも失敗 / 2=対象0件・環境不備
# 依存: bash 3.2+（macOS 既定）/ node / playwright。network 不使用。
# =============================================================================

set -uo pipefail

# ★ cloud/CI の POSIX locale では Ruby 等が US-ASCII 扱いになり偽 FAIL する（2026-08-16 実測）。
#   UTF-8 でない時だけ上書きする（作者機 macOS の UTF-8 環境には触らない）。
case "$(locale charmap 2>/dev/null)" in
  UTF-8) : ;;
  *) export LC_ALL=C.UTF-8 LANG=C.UTF-8 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"
TARGET="${1:-}"

JOBS="${E2E_JOBS:-4}"
case "$JOBS" in ''|*[!0-9]*) JOBS=4 ;; esac
[ "$JOBS" -lt 1 ] && JOBS=1

if ! command -v node >/dev/null 2>&1; then
  echo "node が無い → E2E を実行できない" >&2
  exit 2
fi
if [ ! -d "$E2E_DIR" ]; then
  echo "E2E ディレクトリが無い: $E2E_DIR" >&2
  exit 2
fi

echo "=========================================="
echo "  E2E（実ブラウザ・${JOBS}並列）"
echo "=========================================="

SUITES=""
for f in "$E2E_DIR"/*.e2e.js; do
  [ -e "$f" ] || continue
  SUITES="$SUITES $f"
done

COUNT=0
for f in $SUITES; do COUNT=$((COUNT+1)); done

if [ "$COUNT" -eq 0 ]; then
  # ★ 0件を成功にしない。命名規約から外れたファイルは「静かに走らない」ので、
  #   ここで落として気づけるようにする。
  echo "対象が0件（$E2E_DIR/*.e2e.js）。命名が *.e2e.js から外れていないか確認すること。" >&2
  exit 2
fi

echo "対象 ${COUNT} スイート"
echo

# ★ playwright の確認は「0件チェックの後」に置く。順序が逆だと、playwright が入っていない
#   環境では 0件でも「playwright が無い」で落ちてしまい、0件チェックが効いているかを
#   確かめられない（test/test_e2e_wired_001.js [O-2] が空ディレクトリで実測するため）。
if ! node -e "require('playwright')" >/dev/null 2>&1; then
  echo "playwright を require できない → npm ci / npm i -D playwright を先に実行すること" >&2
  echo "  （NODE_PATH でグローバル導入を使う場合: NODE_PATH=\"\$(npm root -g)\" bash test/run_e2e.sh）" >&2
  exit 2
fi

LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/e2erun.XXXXXX")"
trap 'rm -rf "$LOGDIR"' EXIT

# 空きスロットが出るまで待つ（bash 3.2 には wait -n が無いためポーリングで代用）
throttle() {
  while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$JOBS" ]; do sleep 0.2; done
}

# launch <表示名> <コマンド...> — 背景で実行し、出力と終了コード・秒数をジョブ別ファイルへ
IDX=0
ORDER=""
launch() {
  _name="$1"; shift
  _idx="$IDX"; IDX=$((IDX+1))
  ORDER="$ORDER $_idx"
  echo "$_name" > "$LOGDIR/$_idx.name"
  throttle
  (
    _s="$(date +%s)"
    "$@" > "$LOGDIR/$_idx.log" 2>&1
    _rc=$?
    _e="$(date +%s)"
    echo "$_rc $((_e - _s))" > "$LOGDIR/$_idx.rc"
  ) &
}

for f in $SUITES; do
  launch "$(basename "$f")" node "$f" ${TARGET:+"$TARGET"}
done

FAILED=""
OKC=0

# ★ CHG-MODAL-INLINE-ERROR-001 (#881) / Codex P2 (r3790541881):
#   変異チェッカーを「手動実行用」に置くだけだと、17本の動的変異が生き残っても
#   必須チェックは緑のままになる。ここ（必須の E2E 経路）から呼ぶ。
#   ★ 対象を明示された実行（TARGET 指定）では回さない — 変異は repo の
#     shogi_v4.html を前提に作られるため。
#   ★ Codex P2 (r3790588017): `[ -f ]` で任意扱いにすると、改名・削除で**静かに省略**され
#     通常 E2E だけで緑になる。**既定実行でチェッカーが無ければ失敗**させる。
#     TARGET 指定による意図的な除外とは分ける。
MUTCHK="$SCRIPT_DIR/tools/chg_inline_error_881_mutation_check.sh"
if [ -z "$TARGET" ]; then
  COUNT=$((COUNT+1))
  if [ ! -f "$MUTCHK" ]; then
    echo "$MUTCHK が無い（改名・削除された？）。任意扱いにはしない。" >&2
    FAILED="$FAILED chg_inline_error_881_mutation_check.sh(missing)"
  else
    launch "動的変異チェック（#881）" bash "$MUTCHK"
  fi
fi

# BULK-EDIT-INLINE-ERROR-001 (#887): 同型の動的変異チェック。
#   #881 と同じ規律（既定実行で欠落なら FAIL・TARGET 指定時は変異の前提が崩れるので回さない）。
MUTCHK887="$SCRIPT_DIR/tools/bulk_inline_error_887_mutation_check.sh"
if [ -z "$TARGET" ]; then
  COUNT=$((COUNT+1))
  if [ ! -f "$MUTCHK887" ]; then
    echo "$MUTCHK887 が無い（改名・削除された？）。任意扱いにはしない。" >&2
    FAILED="$FAILED bulk_inline_error_887_mutation_check.sh(missing)"
  else
    launch "動的変異チェック（#887）" bash "$MUTCHK887"
  fi
else
  echo "（TARGET 指定のため #881 / #887 動的変異チェックは回さない: 変異は repo の shogi_v4.html が前提）"
  echo
fi

wait

# 全ジョブの出力を、起動した順に表示（並列でも読み順は従来どおり）
for idx in $ORDER; do
  name="$(cat "$LOGDIR/$idx.name" 2>/dev/null || echo "job-$idx")"
  rc=1; secs="?"
  if [ -f "$LOGDIR/$idx.rc" ]; then
    read -r rc secs < "$LOGDIR/$idx.rc"
  fi
  echo "------------------------------------------"
  echo "【${name}】(${secs}秒)"
  cat "$LOGDIR/$idx.log" 2>/dev/null
  if [ "$rc" -eq 0 ]; then
    OKC=$((OKC+1))
  else
    FAILED="$FAILED ${name}(exit=$rc)"
  fi
  echo
done

echo "=========================================="
if [ -n "$FAILED" ]; then
  echo "  E2E 結果: ${OKC}/${COUNT} スイート PASS"
  echo "  失敗:${FAILED}"
  echo "=========================================="
  exit 1
fi
echo "  E2E 結果: ${COUNT}/${COUNT} スイート PASS"
echo "=========================================="
exit 0
