#!/usr/bin/env bash
# =============================================================================
# test_bulk_inline_error_pins_887.sh — BULK-EDIT-INLINE-ERROR-001 (#887) の静的 pin
#
#   #881 の4段自己検査と同じ型。①実装後に緑 / ②ベースに赤 / ③各変異に対して赤 /
#   ④AND の各項が単独で② ＋ ★⑤ 担当変異ゼロの pin を落とす。
#
#   ★★ ⑤ を足した理由（反証パネル2巡目が実証）:
#     #881 の ③ は「変異 → 赤になるべき pin」の方向しか見ないので、
#     **担当変異がゼロの pin は素通り**する。実測で Q11 の担当は 0 本だった
#     （S12 は関数も条件分岐も残すので静的に殺せない＝動的担当）。
#     さらに「担当を表から読む」実装だと表の誤りに気づけないので、
#     **⑤は③の実測 kill 結果から数える**。
#
#   ★ ベースに既存の語との衝突（#881 が4回連続で踏んだ病気）:
#     #881 は `scrollIntoView({block:'nearest'})` / `#fdecea` / `role="alert"` /
#     `body.textContent=` を**ベースに入れてしまった**ので、#887 の pin は
#     #881 のとき以上に噛まない危険がある。→ ② を必ず回すこと。
#     Q1 は関数本体だけを切り出してから見る（バイト距離窓は日本語コメント1行で偽赤になる）。
#
#   ★ POSIX BRE 禁止事項: 交替 `\|` は GNU 拡張。BSD grep ではリテラル `a|b` を要求し
#     **否定項が恒久 true** になる（#881 の7巡目）。交替は必ず `grep -E` の `(a|b)` で書く。
#
# 使い方:
#   bash test/test_bulk_inline_error_pins_887.sh [target.html]
#     BASE_HTML=<path>  ベース（既定: git show <BASE_REF>:shogi_v4.html）
#     BASE_REF=<ref>    既定 5926aa1
#     MUT_DIR=<dir>     変異ファイル置き場（無ければ実行時に生成）
#
# 依存: bash 3.2+（macOS 既定）/ grep / awk / tr。GNU 拡張は使わない。network 不使用。
# 終了コード: 0=全段 PASS / 1=いずれか FAIL
# =============================================================================
set -u

TARGET="${1:-shogi_v4.html}"
BASE_REF="${BASE_REF:-5926aa1}"
MUT_DIR="${MUT_DIR:-}"
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ok   $1"; }
ng(){ fail=$((fail+1)); echo "  NG   $1"; }

# --- スコープ切り出し ---------------------------------------------------------
# ★ バイト距離窓（.{0,400}）は使わない。実測で余裕が 368/400 しかなく、
#   日本語コメント1行（約90字）を足すだけで偽赤になる。
scope_show(){ awk '/^function showBulkEditError/{f=1} f{print} f&&/^}/{exit}' "$1"; }
# ★ 行コメントを剥いでから見る。実測: 実装側の「// 本文は textContent のみ…」の説明文に
#   pin の探す語が入ると ① が偽赤になった（自分のコメントで自分の pin を壊す）。
scope_api(){ awk '/^function showBulkEditError/{f=1} /^function clearBulkEditError/{f=1} f{print} f&&/^}/{f=0}' "$1" | sed 's://.*::'; }

# --- pin 本体 -----------------------------------------------------------------
Q1(){ scope_show "$1" | tr -d '\n' | grep -qE "cardEl\.lastElementChild\.scrollIntoView\( *[{] *block: *['\"]nearest['\"]"; }
Q2(){ tr -d '\n' < "$1" | grep -qE "\.bulk-err[{][^}]*#fdecea"; }
Q3(){ grep -q 'id="bulk-err"' "$1" \
   && grep 'id="bulk-err"' "$1" | grep -q 'role="alert"' \
   && grep 'id="bulk-err"' "$1" | grep -q 'aria-live="assertive"'; }
# ★ 否定項は head/body の両方に掛ける。実測で `.bulk-err-head` へ innerHTML を流す変異（S4hh）は
#   **実 XSS** なのに、body だけ見る版では pin も run_tests.sh:82 の除外も素通りした。
# ★ 変数名決め打ちの否定（slotBody\.innerHTML）は禁止＝改名と pin がセットでないと死に項になる。
#   代わりに **API のスコープ内に innerHTML 系が1つも無い**ことを要求する。
Q4(){ scope_show "$1" | grep -qE "\.bulk-err-body'\)" \
   && grep -qE "slotBody\.textContent=msg" "$1" \
   && ! scope_api "$1" | grep -qE "(innerHTML|outerHTML|insertAdjacentHTML)" \
   && ! grep -qE "\.bulk-err-(head|body)'\) *\. *(innerHTML|outerHTML|insertAdjacentHTML)" "$1"; }
Q5(){ grep -q 'class="bulk-err-head"' "$1"; }
# ★ 括弧まで見る。`function clearBulkEditError` だけだと `..._removed(){` に前方一致して
#   定義を消す変異（S8）を殺せなかった（実測）。
Q6(){ grep -qE "function showBulkEditError\(msg\)" "$1" && grep -qE "function clearBulkEditError\(\)" "$1"; }
Q7(){ tr -d '\n' < "$1" | grep -qE "addEventListener\('input', *function\( *\) *[{] *clearBulkEditError\(\)"; }
# ★ Q8 は entry_no（§5.1 の作者裁定）と「次の行動」の両方を見る。
Q8(){ grep -qE "entryNoOf\(cls,players\[i\]\.id\)\+' の名前が空です。" "$1" \
   && grep -q "名前を入力してから保存してください。" "$1"; }
Q9(){ grep -q 'が重複しています。' "$1" && grep -q '別の名前に直してください。' "$1"; }
# ★ Q10: クラス側にあり、カードのインライン style には無いこと（両方向）。
Q10(){ tr -d '\n' < "$1" | grep -qE "\.bulk-card[{][^}]*max-height:80vh" \
   && ! grep -qE 'class="bulk-card" style="[^"]*max-height' "$1"; }
Q11(){ grep -qE "function isBulkKbdActive\(\)" "$1" \
   && tr -d '\n' < "$1" | grep -qE "if\(!isBulkKbdActive\(\)\)[{][^}]*alignSelf=''[^}]*marginTop=''[^}]*maxHeight=''"; }
Q12(){ tr -d '\n' < "$1" | grep -qE "\.bulk-err-body[{][^}]*overflow-wrap:anywhere"; }
# ★ Q13c は語境界が要る。`bindBulkViewportFollow\(\);` だけだと **unbind**BulkViewportFollow(); に
#   部分一致して、結線を消す変異（D5）を殺せなかった（実測）。#881 が4回踏んだのと同じ病気。
Q13(){ grep -qE "vv\.addEventListener\('resize',_bulkVvHandler\)" "$1" \
   && grep -qE "vv\.addEventListener\('scroll',_bulkVvHandler\)" "$1" \
   && grep -qE "(^|[^a-zA-Z])bindBulkViewportFollow\(\);" "$1"; }

PINS="Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8 Q9 Q10 Q11 Q12 Q13"
desc(){ case "$1" in
  Q1)  echo "scrollIntoView の送り先がボタン行（cardEl.lastElementChild）";;
  Q2)  echo ".bulk-err が danger 面色 #fdecea（STYLE-GUIDE §1）";;
  Q3)  echo "#bulk-err に role=alert と aria-live=assertive（同 §3 N5）";;
  Q4)  echo "本文は textContent（API 内に innerHTML 系ゼロ・head/body とも）";;
  Q5)  echo "見出し語 .bulk-err-head（色だけに意味を載せない・同 §3.1）";;
  Q6)  echo "API が2つある";;
  Q7)  echo "input で消す結線がある";;
  Q8)  echo "B1 が entry_no を名指しし、次の行動がある（§5.1 作者裁定）";;
  Q9)  echo "B2 の主文と次の行動がある";;
  Q10) echo "カード高は .bulk-card（クラス）側。inline には無い（リセットの厳密性）";;
  Q11) echo "キーボード判定があり、非活性時に3プロパティを空へ戻す（fail-soft）";;
  Q12) echo "本文に overflow-wrap:anywhere（氏名が長いと横へはみ出す）";;
  Q13) echo "visualViewport の resize/scroll に結線（STYLE-GUIDE §10.4）";;
esac; }

# ④の対象（AND の各項）。否定項は含めない。
AND_ITEMS="Q3a Q3b Q3c Q4a Q4b Q6a Q6b Q8a Q8b Q9a Q9b Q10a Q11a Q11b Q13a Q13b Q13c"
anditem(){ case "$1" in
  Q3a) grep -q 'id="bulk-err"' "$2";;
  Q3b) grep 'id="bulk-err"' "$2" 2>/dev/null | grep -q 'role="alert"';;
  Q3c) grep 'id="bulk-err"' "$2" 2>/dev/null | grep -q 'aria-live="assertive"';;
  Q4a) scope_show "$2" | grep -qE "\.bulk-err-body'\)";;
  Q4b) grep -qE "slotBody\.textContent=msg" "$2";;
  Q6a) grep -qE "function showBulkEditError\(msg\)" "$2";;
  Q6b) grep -qE "function clearBulkEditError\(\)" "$2";;
  Q8a) grep -qE "entryNoOf\(cls,players\[i\]\.id\)\+' の名前が空です。" "$2";;
  Q8b) grep -q "名前を入力してから保存してください。" "$2";;
  Q9a) grep -q 'が重複しています。' "$2";;
  Q9b) grep -q '別の名前に直してください。' "$2";;
  Q10a) tr -d '\n' < "$2" | grep -qE "\.bulk-card[{][^}]*max-height:80vh";;
  Q11a) grep -qE "function isBulkKbdActive\(\)" "$2";;
  Q11b) tr -d '\n' < "$2" | grep -qE "if\(!isBulkKbdActive\(\)\)[{][^}]*alignSelf=''[^}]*marginTop=''[^}]*maxHeight=''";;
  Q13a) grep -qE "vv\.addEventListener\('resize',_bulkVvHandler\)" "$2";;
  Q13b) grep -qE "vv\.addEventListener\('scroll',_bulkVvHandler\)" "$2";;
  Q13c) grep -qE "(^|[^a-zA-Z])bindBulkViewportFollow\(\);" "$2";;
esac; }

# 動的検査が担当する変異（静的 pin では殺せない）
DYN_OWNED="D1 D3 D4 R1 R2 S12 S18"
STATIC_OWNED="S1 S2 S3 S3a S3r S4 S4b S4h S4hh S4hh2 S4x S4y S5 S6 S6b S8 S9 S9b S10 S10b S11 S11b S12b S12c S15 S21 S22 D2 D5"
MUTCHK="test/tools/bulk_inline_error_887_mutation_check.sh"
mut_expect(){ case "$1" in
  S1)  echo Q1;;   S6)  echo Q1;;   S6b) echo Q1;;
  S2)  echo Q2;;
  S3)  echo Q3;;   S3r) echo Q3;;   S3a) echo Q3;;
  S4)  echo Q4;;   S4b) echo Q4;;   S4h) echo Q4;;   S4hh) echo Q4;;
  S4x) echo Q4;;  S4y) echo Q4;;  S4hh2) echo Q4;;
  S5)  echo Q5;;
  S8)  echo Q6;;
  D2)  echo Q7;;
  D5)  echo Q13;; S21) echo Q13;;  S22) echo Q13;;
  S9)  echo Q8;;   S9b) echo Q8;;
  S10) echo Q9;;   S10b) echo Q9;;
  S11) echo Q10;;  S11b) echo Q10;;
  S12b) echo Q11;; S12c) echo Q11;;
  S15) echo Q12;;
  *)   echo "-";;
esac; }

echo "=========================================="
echo " #887 静的 pin（5段の自己検査）"
echo " 対象: $TARGET"

# --- ベースを用意 -------------------------------------------------------------
BASE="${BASE_HTML:-}"
TMPBASE=""
if [ -z "$BASE" ]; then
  TMPBASE="$(mktemp "${TMPDIR:-/tmp}/bulkpin887.XXXXXX")"
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
    if $p "$BASE"; then ng "$p がベースでも緑 ＝ この pin は #887 の成果を識別していない"; else ok "$p ベースで赤"; fi
  done
else
  ng "ベースが無いので② を実行できない"
fi

# --- ③ ------------------------------------------------------------------------
echo ""
echo "③ 各変異に対して狙った pin が赤 ＝『素に赤だが変異を殺せない』を落とす"
TMPMUT=""
if [ -z "$MUT_DIR" ]; then
  GEN="$(dirname "$0")/tools/bulk_inline_error_887_mutants.js"
  if [ -f "$GEN" ] && command -v node >/dev/null 2>&1; then
    TMPMUT="$(mktemp -d "${TMPDIR:-/tmp}/bulkmut887.XXXXXX")"
    if node "$GEN" "$TARGET" "$TMPMUT" >/dev/null 2>&1; then MUT_DIR="$TMPMUT"; else
      echo "  ⚠ 変異の生成に失敗（置換元が一意でない等）"; fi
  fi
fi
KILLED=""   # ★ ⑤ で使う「実測で赤になった pin」の記録
if [ -n "$MUT_DIR" ] && [ -d "$MUT_DIR" ]; then
  found=0
  for f in "$MUT_DIR"/*.html; do
    [ -e "$f" ] || continue
    found=$((found+1))
    name="$(basename "$f" .html)"; name="${name#mut_}"
    want="$(mut_expect "$name")"
    if [ "$want" = "-" ]; then
      hit=0
      for k in $DYN_OWNED; do [ "$k" = "$name" ] && hit=1; done
      if [ "$hit" -eq 1 ]; then echo "  --   $name  動的担当（$MUTCHK で実証）"
      else ng "$name  担当が無い（静的 pin にも動的検査にも入っていない）"; fi
      continue
    fi
    if $want "$f"; then ng "$name  $want が緑のまま ＝ この変異を殺せていない"
    else ok "$name → $want 赤"; KILLED="$KILLED $want"; fi
  done
  [ "$found" -eq 0 ] && ng "変異ファイルが1つも無い（MUT_DIR=${MUT_DIR}）"
  # ★ 期待する全集合の存在（欠落を落とす。#881 が Codex P2 で足した対策と同型）
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

# --- ⑤ ------------------------------------------------------------------------
echo ""
echo "⑤ 担当変異がゼロの pin が無い ＝『pin を足したが一度も試されていない』を落とす"
echo "   ★ 表ではなく③の実測 kill 結果から数える（表を読むと表の誤りに気づけない）"
for p in $PINS; do
  hit=0
  for k in $KILLED; do [ "$k" = "$p" ] && hit=1; done
  if [ "$hit" -eq 1 ]; then ok "$p  ③で実際に赤にした変異がある"
  else ng "$p  担当変異ゼロ ＝ この pin は一度も試されていない"; fi
done

# ★ bash 3.2 互換: 変数展開の**直後に全角文字**を置くときは必ず ${var} で囲むこと。
#   bash 3.2 は UTF-8 ロケールで高位バイトを変数名に取り込み、set -u で
#   「未割り当ての変数」になる（実測: 作者機 macOS で `$EXPECT_PASS）` が落ちた。
#   cloud の bash 5 では再現しない＝POSIX BRE と同類の「ここでしか見えない互換差」）。
# --- ⑥ 台帳の整合（3巡目パネル C3-3） -----------------------------------------
#   同じ情報が4つの台帳（PINS / AND_ITEMS / mut_expect+*_OWNED / mutation_check の DYN）に
#   手書きで重複しており、**台帳から消す方向のドリフト**はどの段も検出しなかった（実測4変種:
#   PINS から Q12 削除→80/0 緑・AND_ITEMS から Q13c 削除→82/0 緑・anditem を緩める→83/0 緑・
#   mutation_check の DYN から D1 を外す→41/0 緑）。
echo ""
echo "⑥ 台帳の整合"
# (a) 期待 PASS 総数のメタ pin（PINS や AND_ITEMS の項が静かに消えると総数が減る）
EXPECT_PASS=85
if [ "$pass" -eq "$EXPECT_PASS" ]; then ok "PASS 総数が期待どおり（${EXPECT_PASS}）"
else ng "PASS 総数が ${pass}（期待 ${EXPECT_PASS}）＝ 台帳のどれかが痩せた/太った。意図した変更なら EXPECT_PASS を更新すること"; fi
# (b) mutation_check の DYN= と自分の DYN_OWNED の突合（③の表示「動的担当（…で実証）」を虚偽にしない）
if [ -f "$MUTCHK" ]; then
  CHK_DYN="$(grep '^DYN=' "$MUTCHK" | head -1 | sed 's/^DYN="//;s/"$//')"
  if [ "$CHK_DYN" = "$DYN_OWNED" ]; then ok "DYN_OWNED と mutation_check の DYN が一致"
  else ng "DYN_OWNED（${DYN_OWNED}）と mutation_check の DYN（${CHK_DYN}）が食い違う ＝『動的担当（で実証）』が虚偽になる"; fi
else
  ng "$MUTCHK が無い ＝ 動的担当の実証が消えている"
fi

[ -n "$TMPBASE" ] && rm -f "$TMPBASE"
[ -n "$TMPMUT" ] && rm -rf "$TMPMUT"
echo ""
echo "=========================================="
echo "  結果: PASS=$pass, FAIL=$fail"
echo "=========================================="
[ "$fail" -eq 0 ] || exit 1
echo "  ✓ #887 静的 pin 全PASS"
exit 0
