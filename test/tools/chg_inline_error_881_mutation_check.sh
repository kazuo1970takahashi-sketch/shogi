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
# ★ Codex P2 (r3790541883): 「exit≠0 なら理由を問わず殺せた」は誤り。
#   goto/waitForFunction/セレクタ/未捕捉例外/目的外アサーションの失敗も ok になってしまう。
#   → **変異ごとに「落ちるべきアサーション ID」**を持ち、それが実際に落ちたことまで見る。
#   → ハーネスエラー（E2E ERROR）と未捕捉例外は **kill ではなく検査失敗**として扱う。
#   ★ R1〜R9 は「ガードが止めなくなった」ことの現れ方が場面で違う（実測）:
#     早い段のガード（E1/E2）は**後続のガードまで流れて別の文言が入る**ので [E*-2] が落ち、
#     後段は **appConfirm まで進む**ので [E*-6] が落ちる。
#     どちらも「その場面自身の検査」なので、**その場面の検査 ID の集合**で受ける
#     （別の場面の失敗は kill と認めない）。
want_ids(){ case "$1" in
  M1)  echo "E1-3";;    # 表示しない → 見えない
  M2)  echo "D-chg-p1";;
  M2b) echo "D-chg-p2";;
  M4)  echo "F1";;      # fail-safe の alert
  M5)  echo "E2-2";;    # 文言一致
  M8)  echo "E1 E3";;   # info の器・文言
  N4)  echo "E2";;      # info の色
  X6)  echo "C4";;      # 器の位置
  R1)  echo "E1-2 E1-4 E1-6";;  R2) echo "E2-2 E2-4 E2-6";;  R3) echo "E3-2 E3-4 E3-6";;
  R4)  echo "E4-2 E4-4 E4-6";;  R5) echo "E5-2 E5-4 E5-6";;  R6) echo "E6-2 E6-4 E6-6";;
  R7)  echo "E7-2 E7-4 E7-6";;  R8) echo "E8-2 E8-4 E8-6";;  R9) echo "E9-2 E9-4 E9-6";;
esac; }

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
  out="$MUT/out_$m.txt"
  node "$SUITE" "$f" > "$out" 2>&1
  rc=$?
  want="$(want_ids "$m")"
  if [ -z "$want" ]; then ng "$m  落ちるべきアサーション ID が未定義"; continue; fi
  # ★ ハーネスエラー／未捕捉例外は kill ではなく検査失敗
  if grep -q 'E2E ERROR' "$out"; then
    ng "$m  ハーネスエラー（E2E ERROR）＝変異固有の失敗と区別できない"; continue
  fi
  if grep -q '✗ FAIL: 未捕捉例外なし' "$out"; then
    ng "$m  未捕捉例外で落ちている＝変異固有の失敗と区別できない"; continue
  fi
  if [ $rc -eq 0 ]; then
    ng "$m  e2e が緑のまま ＝ この変異を殺せていない"; continue
  fi
  # ★ 期待する（その場面自身の）アサーションが実際に落ちたか
  hitid=""
  for w in $want; do
    if grep -q "✗ FAIL: \[$w\]" "$out"; then hitid="$w"; break; fi
  done
  if [ -n "$hitid" ]; then
    ok "$m → [$hitid] が赤（狙った検査が殺した）"
  else
    ng "$m  exit=$rc だが {$want} のどれも落ちていない ＝ 別の理由で赤い  [$(grep -o '✗ FAIL: \[[^]]*\]' "$out" | head -3 | tr '\n' ' ')]"
  fi
done

# ★ Codex P2 (r3790588019): 生成されたファイルだけを列挙すると、**期待する変異が消えても**
#   気づけない（実測: mut_X1.html を消しても全部「担当あり」で通った）。
#   → **期待する全集合と生成物が完全一致**することを両方向で見る。
echo ""
echo "2) 期待する変異の集合と生成物が完全一致すること（欠落も余剰も落とす）"
STATIC="X1 X2 X3 X3r X3a X4 X4h X5 X7 M3b M3c M7"
EXPECTED="$DYN $STATIC"
# (a) 期待した名前に対応するファイルが必ず1本ある
for k in $EXPECTED; do
  if [ -f "$MUT/mut_$k.html" ]; then ok "$k  生成されている"
  else ng "$k  期待した変異が生成されていない（generator から消えた？）"; fi
done
# (b) 生成物のうち期待に無いものが無い
for f in "$MUT"/mut_*.html; do
  [ -e "$f" ] || continue
  n="$(basename "$f" .html)"; n="${n#mut_}"
  hit=0
  for k in $EXPECTED; do [ "$k" = "$n" ] && hit=1; done
  [ "$hit" -eq 1 ] || ng "$n  担当が無い（静的 pin にも動的検査にも入っていない）"
done

rm -rf "$MUT"
echo ""
echo "=========================================="
echo "  結果: PASS=$pass, FAIL=$fail"
echo "=========================================="
[ "$fail" -eq 0 ] || exit 1
echo "  ✓ #881 動的変異チェック 全PASS"
exit 0
