#!/usr/bin/env bash
# =============================================================================
# bulk_inline_error_887_mutation_check.sh — #887 の「動的担当」変異を実際に殺す
#
#   静的 pin（test_bulk_inline_error_pins_887.sh）で殺せない変異に、
#   実 e2e を1本ずつ当てて**狙ったアサーション ID で**赤になることを確かめる。
#
#   ★ #881 の学び（Codex 2巡目 P2）をそのまま継承:
#     「exit≠0 なら理由を問わず kill」は誤り。goto/セレクタ/未捕捉例外/目的外アサーションの
#     失敗も ok になってしまう。→ **変異ごとに落ちるべきアサーション ID**を持ち、
#     それが実際に落ちたことまで見る。`E2E ERROR` と未捕捉例外は **kill ではなく検査失敗**。
#
#   ★ 期待集合と生成物を**両方向**で突き合わせる（欠落も余剰も落とす）。
#
# 使い方: bash test/tools/bulk_inline_error_887_mutation_check.sh [target.html]
# 依存: bash 3.2+ / node / playwright。network 不使用。所要は数分（1本 ~50秒 × 8本）。
# 終了コード: 0=全変異が狙った ID で赤 / 1=1つでも生き残った
# =============================================================================
set -u

TARGET="${1:-shogi_v4.html}"
HERE="$(cd "$(dirname "$0")" && pwd)"
GEN="$HERE/bulk_inline_error_887_mutants.js"
SUITE="$HERE/../e2e/bulk_modal_inline_error_887.e2e.js"

# 動的検査が担当する変異（静的 pin では殺せないもの）
DYN="D1 D3 D4 D6 D7 D8 R1 R2 S12 S18"
# ★ 変異ごとに「落ちるべきアサーション ID」。**その場面自身の検査**に限る。
want_ids(){ case "$1" in
  D1)  echo "A3";;         # el.hidden=false を消す → 出てこない
  D3)  echo "H1";;         # 器が無いときの alert フォールバックを消す
  D4)  echo "C5";;         # 表示時の fit を消す → イベント無しで縮んだ vv でスロットが隠れる
                           #   ★ D8（開いた直後の fit）追加で C1/C2 では殺せなくなった（実測）
  D6)  echo "I1";;         # フォーカス欄への nearest 戻しを消す → 140px でフォーカス欄が切れる
  D7)  echo "I4";;         # 追従ハンドラ側の戻しを消す → vv イベント後に欄が再び切れる
  D8)  echo "J1 J2";;      # 開いた時点の fit を消す → キーボード既出のままではカードが 80vh 中央
  R1)  echo "A3 A4";;      # B1 のガードが止めなくなる → 保存が通ってモーダルが消える
  R2)  echo "B4";;         # B2 のガードが止めなくなる
  S12) echo "E1";;         # キーボード判定が常に true → 非活性でも inline style を足す
  S18) echo "A7 A3";;      # show を alert に戻す
esac; }
# 静的 pin が担当する変異（③ が実証する）
STATIC="S1 S2 S3 S3a S3r S4 S4b S4h S4hh S4hh2 S4x S4y S5 S6 S6b S8 S9 S9b S10 S10b S11 S11b S12b S12c S15 S21 S22 D2 D5"

pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ok   $1"; }
ng(){ fail=$((fail+1)); echo "  NG   $1"; }

echo "=========================================="
echo " #887 動的担当の変異を実際に殺せるか"
echo " 対象: $TARGET"

for f in "$GEN" "$SUITE"; do
  [ -f "$f" ] || { echo "  NG   $f が無い"; exit 1; }
done
command -v node >/dev/null 2>&1 || { echo "  NG   node が無い"; exit 1; }

MUT="$(mktemp -d "${TMPDIR:-/tmp}/bulkmut887dyn.XXXXXX")"
node "$GEN" "$TARGET" "$MUT" || { echo "  NG   変異の生成に失敗"; rm -rf "$MUT"; exit 1; }

# ★ [E2E-PARALLEL-001] 対照＋kill 実行は互いに独立（それぞれが別ファイルを読み取り専用で
#   開くだけ・書き込みは自分の out/rc ファイルのみ）なので並列に走らせ、判定は従来の順序で
#   行う。MUT_JOBS=1 で従来どおりの直列。
MJOBS="${MUT_JOBS:-3}"
case "$MJOBS" in ''|*[!0-9]*) MJOBS=3 ;; esac
[ "$MJOBS" -lt 1 ] && MJOBS=1
_throttle(){ while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$MJOBS" ]; do sleep 0.2; done; }

_throttle
( node "$SUITE" "$TARGET" > "$MUT/out_control.txt" 2>&1; echo $? > "$MUT/rc_control" ) &
for m in $DYN; do
  f="$MUT/mut_$m.html"
  [ -f "$f" ] || continue
  _throttle
  ( node "$SUITE" "$f" > "$MUT/out_$m.txt" 2>&1; echo $? > "$MUT/rc_$m" ) &
done
wait

echo ""
echo "0) 対照: 未変異の $TARGET では e2e が緑であること"
if [ "$(cat "$MUT/rc_control" 2>/dev/null || echo 1)" -eq 0 ]; then ok "未変異は緑（＝この検査が空回りしていない）"
else ng "未変異なのに e2e が赤（先にそちらを直すこと）"; fi

echo ""
echo "1) 動的担当の変異ごとに e2e が赤になること"
for m in $DYN; do
  f="$MUT/mut_$m.html"
  if [ ! -f "$f" ]; then ng "$m の変異ファイルが生成されていない"; continue; fi
  out="$MUT/out_$m.txt"
  rc="$(cat "$MUT/rc_$m" 2>/dev/null || echo 1)"
  want="$(want_ids "$m")"
  if [ -z "$want" ]; then ng "$m  落ちるべきアサーション ID が未定義"; continue; fi
  if grep -q 'E2E ERROR' "$out"; then
    ng "$m  ハーネスエラー（E2E ERROR）＝変異固有の失敗と区別できない"; continue
  fi
  if grep -q '✗ FAIL: \[A14\]' "$out"; then
    ng "$m  未捕捉例外で落ちている＝変異固有の失敗と区別できない"; continue
  fi
  if [ $rc -eq 0 ]; then
    ng "$m  e2e が緑のまま ＝ この変異を殺せていない"; continue
  fi
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

echo ""
echo "2) 期待する変異の集合と生成物が完全一致すること（欠落も余剰も落とす）"
EXPECTED="$DYN $STATIC"
for k in $EXPECTED; do
  if [ -f "$MUT/mut_$k.html" ]; then ok "$k  生成されている"
  else ng "$k  期待した変異が生成されていない（generator から消えた？）"; fi
done
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
echo "  ✓ #887 動的変異チェック 全PASS"
exit 0
