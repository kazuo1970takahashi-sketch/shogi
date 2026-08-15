#!/usr/bin/env bash
# =============================================================================
# chg_inline_error_881_mutation_check.sh — #881 の「動的担当」変異を実際に殺す
#
#   ★ Codex P2 (r3790501526):
#     test_chg_inline_error_pins_881.sh の ③ は、静的 pin では殺せない変異を
#     「pin 対象外（動的基準が担当）」として無条件に PASS 扱いしていた。
#     → **動的検査が本当にその変異を殺せるか**は、変異 HTML に対して e2e を
#       実際に走らせないと分からない。将来 E*-6 などが弱まっても 44/44 のままになる。
#     → 本スクリプトが、動的担当の変異ごとに e2e を実行し、**赤になること**を確かめる。
#
#   ★ 同じ指摘で `return` 削除変異（R1〜R9）を追加した。
#     「警告を出したまま処理が続行する」は appConfirm が非同期なので
#     state と modal の不変では殺せない。e2e の [E*-6]（#app-modal が出ない）だけが殺す。
#
# 使い方: bash test/tools/chg_inline_error_881_mutation_check.sh [target.html]
# 依存: bash 3.2+ / node / playwright。network 不使用。所要は数分（変異ごとに実ブラウザ）。
# 終了コード: 0=全変異が赤になった / 1=1つでも生き残った
# =============================================================================
set -u

TARGET="${1:-shogi_v4.html}"
HERE="$(cd "$(dirname "$0")" && pwd)"
GEN="$HERE/chg_inline_error_881_mutants.js"
SUITE="$HERE/../e2e/chg_modal_inline_error_881.e2e.js"

# 動的検査が担当する変異（静的 pin では殺せないもの）
DYN="M1 M2 M2b M4 M5 M8 N4 X6 R1 R2 R3 R4 R5 R6 R7 R8 R9"

pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ok   $1"; }
ng(){ fail=$((fail+1)); echo "  NG   $1"; }

echo "=========================================="
echo " #881 動的担当の変異を実際に殺せるか"
echo " 対象: $TARGET"

for f in "$GEN" "$SUITE"; do
  [ -f "$f" ] || { echo "  NG   $f が無い"; exit 1; }
done
command -v node >/dev/null 2>&1 || { echo "  NG   node が無い"; exit 1; }

MUT="$(mktemp -d "${TMPDIR:-/tmp}/chgmut881dyn.XXXXXX")"
node "$GEN" "$TARGET" "$MUT" || { echo "  NG   変異の生成に失敗"; rm -rf "$MUT"; exit 1; }

echo ""
echo "0) 対照: 未変異の $TARGET では e2e が緑であること"
if node "$SUITE" "$TARGET" >/dev/null 2>&1; then ok "未変異は緑（＝この検査が空回りしていない）"
else ng "未変異なのに e2e が赤（先にそちらを直すこと）"; fi

echo ""
echo "1) 動的担当の変異ごとに e2e が赤になること"
for m in $DYN; do
  f="$MUT/mut_$m.html"
  if [ ! -f "$f" ]; then ng "$m の変異ファイルが生成されていない"; continue; fi
  if node "$SUITE" "$f" >/dev/null 2>&1; then
    ng "$m  e2e が緑のまま ＝ この変異を殺せていない"
  else
    ok "$m → e2e 赤"
  fi
done

# ★ 生成された変異のうち、静的にも動的にも担当が無いものが無いか
echo ""
echo "2) 担当の無い変異が無いこと（静的 pin 側の一覧と足して全件を覆う）"
STATIC="X1 X2 X3 X3r X4 X4h X5 X7 M3b M3c M7"
for f in "$MUT"/mut_*.html; do
  [ -e "$f" ] || continue
  n="$(basename "$f" .html)"; n="${n#mut_}"
  hit=0
  for k in $DYN $STATIC; do [ "$k" = "$n" ] && hit=1; done
  if [ "$hit" -eq 1 ]; then ok "$n  担当あり"; else ng "$n  担当が無い（静的 pin にも動的検査にも入っていない）"; fi
done

rm -rf "$MUT"
echo ""
echo "=========================================="
echo "  結果: PASS=$pass, FAIL=$fail"
echo "=========================================="
[ "$fail" -eq 0 ] || exit 1
echo "  ✓ #881 動的変異チェック 全PASS"
exit 0
