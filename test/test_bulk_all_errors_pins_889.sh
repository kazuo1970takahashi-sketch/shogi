#!/usr/bin/env bash
# =============================================================================
# test_bulk_all_errors_pins_889.sh — BULK-EDIT-ALL-ERRORS-001 (#889) の静的 pin
#   @suite: BULK-EDIT-ALL-ERRORS-001 (#889) 全件報告の静的 pin（4段の自己検査）
#
#   #887 の5段（test_bulk_inline_error_pins_887.sh）と同じ型を、段数だけ絞って使う。
#     ① 実装後に全 pin が緑
#     ② ベース（#889 の直前）で全 pin が赤 ＝「足しただけで噛んでいない」を落とす
#     ③ 各変異に対して狙った pin が赤 ＝「素に赤だが変異を殺せない」を落とす
#     ④ 担当変異ゼロの pin が無い ＝「pin を足したが一度も試されていない」を落とす
#        ★ 表ではなく③の実測 kill から数える（表を読むと表の誤りに気づけない）
#
#   ★ 挙動そのもの（5名空欄なら5件出る・他クラスは B01 で名指し・偽の重複を出さない等）は
#     test/e2e/bulk_all_errors_889.e2e.js が実ブラウザで測る。ここは**形**だけを固定する。
#
#   ★ POSIX BRE 禁止事項（#887 から継承）: 交替 `\|` は GNU 拡張。BSD grep ではリテラル
#     `a|b` を要求し**否定項が恒久 true** になる。交替は必ず `grep -E` の `(a|b)` で書く。
#
#   ★ コメントを剥いでから見る（#887 の学び）。実装側の説明文に pin の探す語が入ると
#     偽緑・偽赤になる。実測: 保存ハンドラの解説に「break」が2回出る。
#
# 使い方:
#   bash test/test_bulk_all_errors_pins_889.sh [target.html]
#     BASE_HTML=<path>  ベース（既定: git show <BASE_REF>:shogi_v4.html）
#     BASE_REF=<ref>    既定 86fe1f5（#889 の直前 = REPO-BUNDLE-HYGIENE-001 まで）
#     MUT_DIR=<dir>     変異ファイル置き場（無ければ実行時に生成）
#
# 依存: bash 3.2+（macOS 既定）/ grep / awk / sed。GNU 拡張は使わない。network 不使用。
# 終了コード: 0=全段 PASS / 1=いずれか FAIL
# =============================================================================
set -u

TARGET="${1:-shogi_v4.html}"
BASE_REF="${BASE_REF:-86fe1f5}"
MUT_DIR="${MUT_DIR:-}"
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ok   $1"; }
ng(){ fail=$((fail+1)); echo "  NG   $1"; }

# --- スコープ切り出し ---------------------------------------------------------
# 保存ハンドラ本体だけを見る（行コメントは剥ぐ）。
scope_save(){ awk "/document.getElementById\('bulk-save'\).addEventListener/{f=1} f{print} f&&/^  \}\);\$/{exit}" "$1" | sed 's://.*::'; }
# ラベル表の関数本体だけを見る。
scope_labels(){ awk '/^function registeredPlayerLabels\(\)/{f=1} f{print} f&&/^}/{exit}' "$1" | sed 's://.*::'; }

# --- pin 本体 -----------------------------------------------------------------
# P1: 空欄を見つけても走査を止めない（break がスコープ内に1つも無い）＋集めている
P1(){ scope_save "$1" | grep -qE "emptyNos\.push\(cls\+entryNoOf\(cls,players\[i\]\.id\)\)" \
   && ! scope_save "$1" | grep -qE "(^|[^a-zA-Z_])break *;"; }
# P2: 集めた全件を1つの文にして出す
P2(){ scope_save "$1" | tr -d '\n' | grep -qE "emptyNos\.join\(' / '\)\+' の名前が空です。"; }
# P3: 重複は**両方の行**を名指しする
P3(){ scope_save "$1" | grep -qE "dupMsgs\.push\(lo\+' と '\+hi\+' の " \
   && scope_save "$1" | grep -q 'が重複しています。'; }
# P4: 同じ組を i/j 入れ替えで二重に出さない（順序を固定した鍵で覚える）
P4(){ scope_save "$1" | grep -qE "var lo=\(me<you\?me:you\), hi=\(me<you\?you:me\)" \
   && scope_save "$1" | grep -qE "if\(dupSeen\[key\]\)continue;" \
   && scope_save "$1" | grep -qE "dupSeen\[key\]=1;"; }
# P5: 空欄の行は重複判定から**自分側も相手側も**外す（旧名照合で偽の重複を出さない）
# ★ 相手側にも同型のガードを置いていたが、2つは互いに冗長で片方を外しても e2e が緑だった
#   （実測）。検査できないガードは残さない方針で1つに絞ってある。
P5(){ scope_save "$1" | grep -qE "if\(!newName\)continue;" \
   && scope_save "$1" | grep -qE "if\(emptyIds\[all\[j\]\.id\]\)continue;"; }
# P6: 他クラスの行ラベルはクラスを保ったまま作る（連結後には作れない）
P6(){ grep -qE "^function registeredPlayerLabels\(\)" "$1" \
   && scope_labels "$1" | grep -qE "out\[arr\[k\]\.id\]=cid\+entryNoOf\(cid,arr\[k\]\.id\)" \
   && scope_save "$1" | grep -qE "var labelOf=registeredPlayerLabels\(\);"; }
# P7: 拒否は1か所で、空欄と重複の**両方**を条件にし、必ず return する
P7(){ scope_save "$1" | grep -qE "if\(emptyNos\.length\|\|dupMsgs\.length\)\{" \
   && scope_save "$1" | tr -d '\n' | grep -qE "showBulkEditError\(blocks\.join\('.n'\)\); *return;"; }

# P8: 組み立てた文面の**唯一の行き先が showBulkEditError()** で、スコープ内に innerHTML 系が無い。
#   ★ run_tests.sh 2-1 が `dupMsgs.push(` を未エスケープ検査から除外している、その裏づけ。
#     氏名が入る文面を組み立てる行が showBulkEditError( の行から離れたため、行単位の除外では
#     見えなくなった。「安全だと主張するだけ」にしないよう、ここで機械的に確かめる。
P8(){ ! scope_save "$1" | grep -qE "(innerHTML|outerHTML|insertAdjacentHTML)" \
   && [ "$(scope_save "$1" | grep -cE "blocks\.join\(" )" = "1" ] \
   && scope_save "$1" | tr -d '\n' | grep -qE "showBulkEditError\(blocks\.join\("; }

PINS="P1 P2 P3 P4 P5 P6 P7 P8"
desc(){ case "$1" in
  P1) echo "空欄で走査を止めない（スコープ内に break が無い）＋ entry_no で集める";;
  P2) echo "集めた全件を1つの文にして出す（join）";;
  P3) echo "重複は両方の行を名指しする";;
  P4) echo "同じ組を入れ替えで二重に出さない（順序固定の鍵）";;
  P5) echo "名前が未定の行を照合しない（自分側＝空欄・相手側＝空欄の行）";;
  P6) echo "他クラスの行ラベルはクラスを保ったまま作る";;
  P7) echo "拒否は1か所・空欄と重複の両方が条件・必ず return";;
  P8) echo "文面の行き先は showBulkEditError() だけ・スコープ内に innerHTML 系ゼロ";;
esac; }

MUT_EXPECT="M1:P1 M2:P2 M3:P3 M4:P4 M5:P5 M6:P6 M7:P7 M8:P5 M9:P8"
mut_expect(){ for e in $MUT_EXPECT; do
    case "$e" in "$1":*) echo "${e#*:}"; return;; esac
  done; echo "-"; }

echo "=========================================="
echo " #889 静的 pin（4段の自己検査）"
echo " 対象: $TARGET"

# --- ベースを用意 -------------------------------------------------------------
BASE="${BASE_HTML:-}"
TMPBASE=""
if [ -z "$BASE" ]; then
  TMPBASE="$(mktemp "${TMPDIR:-/tmp}/bulkpin889.XXXXXX")"
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
    if $p "$BASE"; then ng "$p がベースでも緑 ＝ この pin は #889 の成果を識別していない"
    else ok "$p ベースで赤"; fi
  done
else
  ng "ベースが無いので② を実行できない"
fi

# --- ③ ------------------------------------------------------------------------
echo ""
echo "③ 各変異に対して狙った pin が赤 ＝『素に赤だが変異を殺せない』を落とす"
TMPMUT=""
if [ -z "$MUT_DIR" ]; then
  GEN="$(dirname "$0")/tools/bulk_all_errors_889_mutants.js"
  if [ -f "$GEN" ] && command -v node >/dev/null 2>&1; then
    TMPMUT="$(mktemp -d "${TMPDIR:-/tmp}/bulkmut889.XXXXXX")"
    if node "$GEN" "$TARGET" "$TMPMUT" >/dev/null 2>&1; then MUT_DIR="$TMPMUT"
    else echo "  ⚠ 変異の生成に失敗（置換元が一意でない等）"; fi
  fi
fi
KILLED=""
if [ -n "$MUT_DIR" ] && [ -d "$MUT_DIR" ]; then
  found=0
  for f in "$MUT_DIR"/*.html; do
    [ -e "$f" ] || continue
    found=$((found+1))
    name="$(basename "$f" .html)"; name="${name#mut_}"
    want="$(mut_expect "$name")"
    if [ "$want" = "-" ]; then ng "$name  担当が無い（MUT_EXPECT に入っていない）"; continue; fi
    if $want "$f"; then ng "$name  $want が緑のまま ＝ この変異を殺せていない"
    else ok "$name → $want 赤"; KILLED="$KILLED $want"; fi
  done
  [ "$found" -eq 0 ] && ng "変異ファイルが1つも無い（MUT_DIR=${MUT_DIR}）"
  for e in $MUT_EXPECT; do
    k="${e%%:*}"
    [ -f "$MUT_DIR/mut_$k.html" ] || ng "$k  期待した変異が生成されていない（generator から消えた？）"
  done
else
  ng "MUT_DIR が未指定/不在 ＝ ③ を実行できない（変異が無ければ FAIL）"
fi

# --- ④ ------------------------------------------------------------------------
echo ""
echo "④ 担当変異がゼロの pin が無い"
for p in $PINS; do
  hit=0
  for k in $KILLED; do [ "$k" = "$p" ] && hit=1; done
  if [ "$hit" -eq 1 ]; then ok "$p  ③で実際に赤にした変異がある"
  else ng "$p  担当変異ゼロ ＝ この pin は一度も試されていない"; fi
done

[ -n "$TMPBASE" ] && rm -f "$TMPBASE"
[ -n "$TMPMUT" ] && rm -rf "$TMPMUT"
echo ""
echo "=========================================="
echo "  結果: PASS=$pass, FAIL=$fail"
echo "=========================================="
[ "$fail" -eq 0 ] || exit 1
echo "  ✓ #889 静的 pin 全PASS"
exit 0
