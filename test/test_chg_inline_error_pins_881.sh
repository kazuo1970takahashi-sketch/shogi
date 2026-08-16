#!/usr/bin/env bash
# =============================================================================
# test_chg_inline_error_pins_881.sh — CHG-MODAL-INLINE-ERROR-001 (#881) の静的 pin
#
#   なぜ4段あるか（実測に基づく）:
#     「pin を足したのに既存語に当たって噛んでいない」という欠陥が、設計レビューで
#     4回連続して見つかった。しかも3回は「前の回の直しの中」で作っていた。
#       4巡目: 裸の scrollIntoView / #fdecea / role="alert" / textContent
#              → いずれも v140 に既存（:6114・:527 の #storage-warn・102箇所）
#       5巡目: ! grep "innerHTML"（88箇所・実装後も赤）／裸の removeAttribute（既存2箇所）
#       6巡目: 裸の role="alert" を独立 pin に分けて素で緑に戻した
#       7巡目: \(head\|body\) は GNU 拡張。BSD grep(POSIX BRE) では非マッチ＝否定が恒久 true
#     → ①②③④ はそれぞれ過去の実例で「唯一の検出者」になっている。4段とも要る。
#
#   ① 実装後の対象ファイルで全 pin が緑
#   ② ベース（この便が入る前の byte）で全 pin が赤   ← 「足しただけで噛んでいない」を落とす
#   ③ 各変異ファイルに対して、狙った pin が赤        ← 「素に赤だが変異を殺せない」を落とす
#   ④ AND で束ねた pin は各項が単独で②を満たす      ← 「AND の中に噛まない項」を落とす
#      ★ ただし否定項（! grep）は②の対象外（素には対象文字列自体が無く恒久緑になるため）。
#        否定項は③でその項が守る変異に対して赤になることを要求する。
#
# 使い方:
#   bash test/test_chg_inline_error_pins_881.sh [target.html]
#     BASE_HTML=<path>  ベース（既定: git show <BASE_REF>:shogi_v4.html）
#     BASE_REF=<ref>    既定 47e7bf1
#     MUT_DIR=<dir>     変異ファイル置き場（無ければ ③ は FAIL）
#
# 依存: bash 3.2+（macOS 既定）/ grep / tr。GNU 拡張は使わない。network 不使用。
# 終了コード: 0=全段 PASS / 1=いずれか FAIL
# =============================================================================
set -u

TARGET="${1:-shogi_v4.html}"
BASE_REF="${BASE_REF:-47e7bf1}"
MUT_DIR="${MUT_DIR:-}"
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ok   $1"; }
ng(){ fail=$((fail+1)); echo "  NG   $1"; }

# --- pin 本体 -----------------------------------------------------------------
# 各 pin は「ファイルパスを引数に取り、成立=0 / 不成立=1」を返す関数。
# ★ .chg-err{...} / #chg-err の開始タグ / scrollIntoView(...) は実装側で各1行に書くこと
#   （P2・P3・P1 が行単位で見るため。折ると偽赤になる）

P1(){ tr -d '\n' < "$1" | grep -qE "card\.lastElementChild\.scrollIntoView\( *[{] *block: *['\"]nearest['\"]"; }
P2(){ tr -d '\n' < "$1" | grep -qE "\.chg-err[{][^}]*#fdecea"; }
P3(){ grep -q 'id="chg-err"' "$1" \
   && grep 'id="chg-err"' "$1" | grep -q 'role="alert"' \
   && grep 'id="chg-err"' "$1" | grep -q 'aria-live="assertive"'; }
# ★ 否定側は「本文スロットに innerHTML を使う3つの書き方」を全部塞ぐ。
#   `body.innerHTML` / `.chg-err-body').innerHTML` / `.chg-err-head').innerHTML`
P4(){ grep -qE "\.chg-err-body'\)" "$1" \
   && grep -qE "body\.textContent=" "$1" \
   && ! grep -qE "body\.innerHTML" "$1" \
   && ! grep -qE "\.chg-err-(head|body)'\)\.innerHTML" "$1"; }
P5(){ grep -qE "setAttribute\('data-chg-err','1'\)" "$1" \
   && grep -qE "removeAttribute\('data-chg-err'\)" "$1"; }
P6(){ grep -q 'class="chg-err-head"' "$1"; }
P7(){ tr -d '\n' < "$1" | grep -qE '\[data-chg-card="1"\]\[data-chg-err="1"\][{][^}]*max-height:85vh'; }
P8(){ grep -qE "function showChangePairingError" "$1" && grep -qE "function clearChangePairingError" "$1"; }

PINS="P1 P2 P3 P4 P5 P6 P7 P8"
desc(){ case "$1" in
  P1) echo "scrollIntoView の送り先がボタン行（card.lastElementChild）";;
  P2) echo ".chg-err が danger 面色 #fdecea（STYLE-GUIDE v1.2 §1）";;
  P3) echo "#chg-err に role=alert と aria-live=assertive（同 §3 N5）";;
  P4) echo "本文は textContent（innerHTML を使わない・氏名が入る）";;
  P5) echo "data-chg-err を付けて、消す";;
  P6) echo "見出し語 .chg-err-head（色だけに意味を載せない・同 §3.1）";;
  P7) echo "max-height:85vh はエラー表示中だけ（SCALE-MODAL-001 #767）";;
  P8) echo "API が2つある";;
esac; }
# ④の対象（AND の各項）。否定項は含めない。
AND_ITEMS="P3a P3b P3c P4a P4b P5a P5b P8a P8b"
anditem(){ case "$1" in
  P3a) grep -q 'id="chg-err"' "$2";;
  P3b) grep 'id="chg-err"' "$2" 2>/dev/null | grep -q 'role="alert"';;
  P3c) grep 'id="chg-err"' "$2" 2>/dev/null | grep -q 'aria-live="assertive"';;
  P4a) grep -qE "\.chg-err-body'\)" "$2";;
  P4b) grep -qE "body\.textContent=" "$2";;
  P5a) grep -qE "setAttribute\('data-chg-err','1'\)" "$2";;
  P5b) grep -qE "removeAttribute\('data-chg-err'\)" "$2";;
  P8a) grep -qE "function showChangePairingError" "$2";;
  P8b) grep -qE "function clearChangePairingError" "$2";;
esac; }
# 動的検査が担当する変異（静的 pin では殺せない）。実証は下記スクリプト。
DYN_OWNED="M1 M2 M2b M4 M5 M8 N4 X6 R1 R2 R3 R4 R5 R6 R7 R8 R9"
STATIC_OWNED="X1 X2 X3 X3r X4 X4h X5 X7 M3b M3c M7"
MUTCHK="test/tools/chg_inline_error_881_mutation_check.sh"
# ③ 変異 → 赤になるべき pin（"-" は「pin ではなく動的検査が担当」）
mut_expect(){ case "$1" in
  X1)  echo P1;;   X2)  echo P2;;   X3)  echo P3;;  X3r) echo P3;;
  X4)  echo P4;;   X4h) echo P4;;   X5)  echo P1;;  X7)  echo P5;;
  M3b) echo P7;;   M3c) echo P7;;   M7)  echo P6;;
  *)   echo "-";;
esac; }

echo "=========================================="
echo " #881 静的 pin（4段の自己検査）"
echo " 対象: $TARGET"

# --- ベースを用意 -------------------------------------------------------------
BASE="${BASE_HTML:-}"
TMPBASE=""
if [ -z "$BASE" ]; then
  TMPBASE="$(mktemp "${TMPDIR:-/tmp}/chgpin881.XXXXXX")"
  if git show "$BASE_REF:shogi_v4.html" > "$TMPBASE" 2>/dev/null; then
    BASE="$TMPBASE"
  else
    echo "  ⚠ ベース($BASE_REF)を取得できない → ② を SKIP"
    BASE=""
  fi
fi

# --- ① ------------------------------------------------------------------------
echo ""
echo "① 実装後の $TARGET で全 pin が緑"
for p in $PINS; do
  if $p "$TARGET"; then ok "$p 緑   $(desc $p)"; else ng "$p が赤（実装が足りない）  $(desc $p)"; fi
done

# --- ② ------------------------------------------------------------------------
echo ""
echo "② ベース($BASE_REF)で全 pin が赤 ＝『足しただけで噛んでいない』を落とす"
if [ -n "$BASE" ]; then
  for p in $PINS; do
    if $p "$BASE"; then ng "$p がベースでも緑 ＝ この pin は #881 の成果を識別していない"; else ok "$p ベースで赤"; fi
  done
else
  ng "ベースが無いので② を実行できない"
fi

# --- ③ ------------------------------------------------------------------------
echo ""
echo "③ 各変異に対して狙った pin が赤 ＝『素に赤だが変異を殺せない』を落とす"
# MUT_DIR 未指定なら、その場で生成する（変異ファイルは repo に置かない＝1本 ~1.1MB × 19）
TMPMUT=""
if [ -z "$MUT_DIR" ]; then
  GEN="$(dirname "$0")/tools/chg_inline_error_881_mutants.js"
  if [ -f "$GEN" ] && command -v node >/dev/null 2>&1; then
    TMPMUT="$(mktemp -d "${TMPDIR:-/tmp}/chgmut881.XXXXXX")"
    if node "$GEN" "$TARGET" "$TMPMUT" >/dev/null 2>&1; then MUT_DIR="$TMPMUT"; else
      echo "  ⚠ 変異の生成に失敗（置換元が一意でない等）"; fi
  fi
fi
if [ -n "$MUT_DIR" ] && [ -d "$MUT_DIR" ]; then
  found=0
  for f in "$MUT_DIR"/*.html; do
    [ -e "$f" ] || continue
    found=$((found+1))
    name="$(basename "$f" .html)"; name="${name#mut_}"
    want="$(mut_expect "$name")"
    # ★ Codex P2 (r3790501526): 動的担当を「無条件 PASS」にしない。
    #   ここでは判定せず（＝件数に数えず）、動的検査が本当に殺せることは
    #   test/tools/chg_inline_error_881_mutation_check.sh が実 e2e で確かめる。
    #   ただし「どちらの担当でもない変異」は取りこぼしなので FAIL にする。
    if [ "$want" = "-" ]; then
      hit=0
      for k in $DYN_OWNED; do [ "$k" = "$name" ] && hit=1; done
      if [ "$hit" -eq 1 ]; then echo "  --   $name  動的担当（$MUTCHK で実証）"
      else ng "$name  担当が無い（静的 pin にも動的検査にも入っていない）"; fi
      continue
    fi
    if $want "$f"; then ng "$name  $want が緑のまま ＝ この変異を殺せていない"; else ok "$name → $want 赤"; fi
  done
  [ "$found" -eq 0 ] && ng "変異ファイルが1つも無い（MUT_DIR=$MUT_DIR）"
  # ★ Codex P2 (r3790588019): 生成物だけを列挙すると「期待した変異が消えた」を検出できない
  #   （実測: mut_X1.html を消しても FAIL=0 で通った）。**期待する全集合の存在**を見る。
  for k in $STATIC_OWNED $DYN_OWNED; do
    [ -f "$MUT_DIR/mut_$k.html" ] || ng "$k  期待した変異が生成されていない（generator から消えた？）"
  done
else
  ng "MUT_DIR が未指定/不在 ＝ ③ を実行できない（変異が無ければ FAIL）"
fi

# --- ④ ------------------------------------------------------------------------
echo ""
echo "④ AND の各項が単独でベースに赤（否定項は対象外）"
if [ -n "$BASE" ]; then
  for a in $AND_ITEMS; do
    if anditem "$a" "$BASE"; then ng "$a がベースでも緑 ＝ この項は何も噛んでいない"; else ok "$a 単独でベースに赤"; fi
  done
else
  ng "ベースが無いので④ を実行できない"
fi

[ -n "$TMPBASE" ] && rm -f "$TMPBASE"
[ -n "$TMPMUT" ] && rm -rf "$TMPMUT"
echo ""
echo "=========================================="
echo "  結果: PASS=$pass, FAIL=$fail"
echo "=========================================="
[ "$fail" -eq 0 ] || exit 1
echo "  ✓ #881 静的 pin 全PASS"
exit 0
