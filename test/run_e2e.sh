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
# 使い方:
#   bash test/run_e2e.sh                 # 既定は同じリポジトリの shogi_v4.html
#   bash test/run_e2e.sh <html-or-url>   # 対象を明示（各スイートの第1引数へ渡す）
#
# 終了コード: 0=全スイート PASS / 1=1つでも失敗 / 2=対象0件・環境不備
# 依存: bash 3.2+（macOS 既定）/ node / playwright。network 不使用。
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$SCRIPT_DIR/e2e"
TARGET="${1:-}"

if ! command -v node >/dev/null 2>&1; then
  echo "node が無い → E2E を実行できない" >&2
  exit 2
fi
if [ ! -d "$E2E_DIR" ]; then
  echo "E2E ディレクトリが無い: $E2E_DIR" >&2
  exit 2
fi

echo "=========================================="
echo "  E2E（実ブラウザ）"
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

FAILED=""
OKC=0
for f in $SUITES; do
  name="$(basename "$f")"
  echo "------------------------------------------"
  echo "【$name】"
  if [ -n "$TARGET" ]; then
    node "$f" "$TARGET"
  else
    node "$f"
  fi
  rc=$?
  if [ $rc -eq 0 ]; then
    OKC=$((OKC+1))
  else
    FAILED="$FAILED $name(exit=$rc)"
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
