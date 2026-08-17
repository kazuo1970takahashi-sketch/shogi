#!/usr/bin/env bash
# =============================================================================
# test_mutation_cache_001.sh — [E2E-MUT-SKIP-001] 変異チェックの条件付き実行の companion test
#
#   使い捨ての sandbox（mktemp -d に架空の HTML / 架空のジェネレータ / 架空のスイート）
#   に対してだけ実行する。**実 e2e もブラウザも走らせない**（数秒で終わる）。
#   検証対象は test/tools/mutation_input_key.js と test/lib/mutation_cache.sh。
#
#   固定する性質（＝skip が安全であるための条件そのもの）:
#     - 同じ入力なら鍵は同じ
#     - **変異が当たらない領域**の HTML 変更では鍵が変わらない（＝これが時間短縮の源）
#     - **変異が当たる領域**の HTML 変更では鍵が変わる
#     - e2e スイート / ジェネレータ / チェッカー本体 / この lib のどれが変わっても鍵が変わる
#     - 変異の生成に失敗したら鍵を出さない（exit 3）＝呼び出し側はフル実行になる
#     - 記録が無ければヒットしない。記録した後だけヒットする
#     - **CI（$CI 非空）と MUT_FULL=1 では鍵を作らない・ヒットしない**（＝必ずフル実行）
#     - TTL を過ぎた記録はヒットしない
#     - TTL は**記録の中身の成功時刻**で測る（cp で復元しても延びない）・ヒットで書き換えない
#     - ヒット時は `MUTCACHE-SKIP` を必ず出す（run_e2e.sh がこの語で「緑」と区別する）
#
# 使い方: bash test/test_mutation_cache_001.sh
# set -e は使わない（個別に判定するため）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYTOOL="$SCRIPT_DIR/tools/mutation_input_key.js"
LIB="$SCRIPT_DIR/lib/mutation_cache.sh"

PASS=0
FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  E2E-MUT-SKIP-001 変異チェック条件付き実行の単体テスト"
echo "=========================================="

for f in "$KEYTOOL" "$LIB"; do
  [ -f "$f" ] || { echo "  ✗ $f が無い"; exit 1; }
done
command -v node >/dev/null 2>&1 || { echo "  ✗ node が無い"; exit 1; }

SB="$(mktemp -d "${TMPDIR:-/tmp}/mutcache.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

# --- 架空の対象 HTML --------------------------------------------------------
#   変異が当たる場所（ANCHOR-A / ANCHOR-B）と、当たらない場所（FAR-*）を
#   400字（＝鍵に含める文脈幅）より十分に離して置く。
PAD1="$(node -e 'process.stdout.write("<!-- pad -->".repeat(120))')"
PAD2="$(node -e 'process.stdout.write("<!-- pad2 -->".repeat(120))')"
{
  echo "<html><body>"
  echo "FAR-TOP-marker-original"
  echo "$PAD1"
  echo "  var a = 'ANCHOR-A-original';"
  echo "$PAD2"
  echo "  var b = 'ANCHOR-B-original';"
  echo "$PAD1"
  echo "FAR-BOTTOM-marker-original"
  echo "</body></html>"
} > "$SB/target.html"

# --- 架空のジェネレータ（本物と同じく「出現回数1」を assert する） -----------
cat > "$SB/gen.js" <<'GENEOF'
'use strict';
const fs = require('fs'), path = require('path');
const target = process.argv[2], outDir = process.argv[3];
const base = fs.readFileSync(target, 'utf8');
fs.mkdirSync(outDir, { recursive: true });
let bad = 0;
function mut(name, old, neu) {
  const parts = base.split(old);
  if (parts.length - 1 !== 1) { console.error('!! ' + name + ' 出現回数=' + (parts.length - 1)); bad++; return; }
  fs.writeFileSync(path.join(outDir, 'mut_' + name + '.html'), parts[0] + neu + parts[1], 'utf8');
}
mut('A1', "ANCHOR-A-original", "ANCHOR-A-broken");
mut('B1', "ANCHOR-B-original", "ANCHOR-B-broken");
if (bad) process.exit(1);
console.log('ok');
GENEOF

echo "dummy suite v1" > "$SB/suite.js"
echo "dummy checker v1" > "$SB/checker.sh"

key() { node "$KEYTOOL" --target "$SB/target.html" --gen "$SB/gen.js" --suite "$SB/suite.js" --extra "$SB/checker.sh" 2>/dev/null; }

# ---------------------------------------------------------------------------
echo ""
echo "1) 鍵の同一性"
K1="$(key)"
K2="$(key)"
if [ -n "$K1" ] && [ "$K1" = "$K2" ]; then ok "同じ入力なら同じ鍵（$(echo "$K1" | cut -c1-8)…）"
else ng "同じ入力で鍵が揺れる（$K1 / $K2）"; fi

echo ""
echo "2) 変異が当たらない領域の変更では鍵が変わらない（＝短縮の源）"
perl -pi -e 's/FAR-TOP-marker-original/FAR-TOP-marker-CHANGED/' "$SB/target.html" 2>/dev/null \
  || sed -i.bak 's/FAR-TOP-marker-original/FAR-TOP-marker-CHANGED/' "$SB/target.html"
K3="$(key)"
[ "$K3" = "$K1" ] && ok "遠く離れた領域の変更は鍵に影響しない" || ng "無関係な変更で鍵が変わった（＝短縮が効かない）"

echo ""
echo "3) 変異が当たる領域の変更では鍵が変わる"
cp "$SB/target.html" "$SB/target.html.keep"
perl -pi -e "s/var a = 'ANCHOR-A-original';/var a = 'ANCHOR-A-original'; \/* touched *\//" "$SB/target.html" 2>/dev/null \
  || sed -i.bak "s/var a = 'ANCHOR-A-original';/var a = 'ANCHOR-A-original'; \/* touched *\//" "$SB/target.html"
K4="$(key)"
[ -n "$K4" ] && [ "$K4" != "$K3" ] && ok "変異が当たる行の直近を触ると鍵が変わる" || ng "★ 変異領域を触っても鍵が変わらない"
cp "$SB/target.html.keep" "$SB/target.html"

echo ""
echo "4) スイート / ジェネレータ / チェッカーの変更で鍵が変わる"
echo "dummy suite v2" > "$SB/suite.js"
K5="$(key)"
[ "$K5" != "$K3" ] && ok "e2e スイートが変われば鍵が変わる" || ng "スイート変更が鍵に出ない"
echo "dummy suite v1" > "$SB/suite.js"

echo "dummy checker v2" > "$SB/checker.sh"
K6="$(key)"
[ "$K6" != "$K3" ] && ok "チェッカー本体が変われば鍵が変わる" || ng "チェッカー変更が鍵に出ない"
echo "dummy checker v1" > "$SB/checker.sh"

cp "$SB/gen.js" "$SB/gen.js.keep"
printf '\n// tweak\n' >> "$SB/gen.js"
K7="$(key)"
[ "$K7" != "$K3" ] && ok "ジェネレータが変われば鍵が変わる" || ng "ジェネレータ変更が鍵に出ない"
cp "$SB/gen.js.keep" "$SB/gen.js"

echo ""
echo "5) 変異の生成に失敗したら鍵を出さない（＝フル実行になる）"
#   アンカーを2つに増やして「出現回数=2」にする＝本物と同じ失敗のさせ方
cp "$SB/target.html" "$SB/target.html.keep2"
printf "\n  var dup = 'ANCHOR-A-original';\n" >> "$SB/target.html"
OUT="$(node "$KEYTOOL" --target "$SB/target.html" --gen "$SB/gen.js" --suite "$SB/suite.js" 2>&1)"; RC=$?
[ "$RC" -eq 3 ] && ok "exit 3 で落ちる（呼び出し側はフル実行）" || ng "生成失敗なのに exit=$RC"
case "$OUT" in *"出現回数"*) ok "失敗理由（置換元が一意でない）が出る" ;; *) ng "失敗理由が出ない: $OUT" ;; esac
if node "$KEYTOOL" --target "$SB/target.html" --gen "$SB/gen.js" --suite "$SB/suite.js" 2>/dev/null | grep -q '^[0-9a-f]\{64\}$'; then
  ng "生成失敗なのに鍵を出した"
else ok "鍵を出さない"; fi
cp "$SB/target.html.keep2" "$SB/target.html"

# ---------------------------------------------------------------------------
echo ""
echo "6) キャッシュの読み書き"
export MUT_CACHE_DIR="$SB/cache"
unset CI
unset MUT_FULL
# shellcheck source=/dev/null
. "$LIB"

KK="$(mutcache_key "$SB/target.html" "$SB/gen.js" "$SB/suite.js" "$SB/checker.sh")"
[ -n "$KK" ] && ok "lib 経由で鍵が取れる" || ng "lib 経由で鍵が取れない"

if mutcache_hit "t1" "$KK" >/dev/null 2>&1; then ng "記録が無いのにヒットした"; else ok "記録が無ければヒットしない"; fi
mutcache_store "t1" "$KK"
HITOUT="$(mutcache_hit "t1" "$KK" 2>&1)"; HITRC=$?
[ "$HITRC" -eq 0 ] && ok "記録した後はヒットする" || ng "記録してもヒットしない"
case "$HITOUT" in *MUTCACHE-SKIP*) ok "MUTCACHE-SKIP を出す（run_e2e.sh がこの語で緑と区別する）" ;; *) ng "MUTCACHE-SKIP を出していない" ;; esac
case "$HITOUT" in *"再検証していないもの"*) ok "何を再検証していないかを明示する" ;; *) ng "残余リスクの表示が無い" ;; esac

echo ""
echo "7) ヒットしても記録の成功時刻を書き換えない（TTL が無限に延びない）"
CF="$MUT_CACHE_DIR/t1.$KK"
BODY1="$(cat "$CF")"
sleep 1
mutcache_hit "t1" "$KK" >/dev/null 2>&1
BODY2="$(cat "$CF")"
[ "$BODY1" = "$BODY2" ] && ok "記録の中身が変わらない" || ng "★ ヒットのたびに TTL が延びている"
case "$BODY1" in [0-9]*) ok "記録の1行目が epoch で始まる（TTL の基準）" ;; *) ng "記録に epoch が無い: $BODY1" ;; esac

echo ""
echo "8) TTL / CI / MUT_FULL"
MUT_CACHE_TTL=0 mutcache_hit "t1" "$KK" >/dev/null 2>&1 && ng "TTL 0 でもヒットした" || ok "TTL を過ぎた記録はヒットしない"

( export CI=true; . "$LIB"; mutcache_hit "t1" "$KK" >/dev/null 2>&1 ) && ng "★ CI でヒットした" || ok "CI ではヒットしない（＝必ずフル実行）"
if ( export CI=true; . "$LIB"; mutcache_key "$SB/target.html" "$SB/gen.js" "$SB/suite.js" ) | grep -q '[0-9a-f]'; then
  ng "★ CI でも鍵を作っている"
else ok "CI では鍵を作らない"; fi

( export MUT_FULL=1; . "$LIB"; mutcache_hit "t1" "$KK" >/dev/null 2>&1 ) && ng "★ MUT_FULL=1 でヒットした" || ok "MUT_FULL=1 ではヒットしない"

# ★ Codex P1 (r3794397150) とその同型（＝「比較が素通りしてヒット側へ落ちる」クラス全部）
echo ""
echo "8b) 時刻・数値が異常なときは fail closed（フル実行へ落ちる）"
CF1="$MUT_CACHE_DIR/t1.$KK"
#  (a) 記録の成功時刻が未来（スナップショット復元・時刻補正）→ age が負
printf '%s\t%s\n' "$(( $(date +%s) + 100000 ))" "future" > "$CF1"
OUT8="$(mutcache_hit "t1" "$KK" 2>&1)"; RC8=$?
[ "$RC8" -ne 0 ] && ok "記録の時刻が未来ならヒットしない" || ng "★ 未来の時刻でヒットした（TTL を無期限に回避できる）"
case "$OUT8" in *"未来"*) ok "理由（時計が飛んでいる）を出す" ;; *) ng "理由が出ない: $OUT8" ;; esac
mutcache_store "t1" "$KK"   # 正常な記録へ戻す
mutcache_hit "t1" "$KK" >/dev/null 2>&1 && ok "戻せば再びヒットする" || ng "戻してもヒットしない"
#  (b) TTL が非数値 → `[ ... -ge ... ]` がエラーで偽を返し、従来は**ヒット側**へ落ちていた
OUT8B="$(MUT_CACHE_TTL=abc mutcache_hit "t1" "$KK" 2>&1)"; RC8B=$?
[ "$RC8B" -ne 0 ] && ok "TTL が非数値ならヒットしない" || ng "★ 非数値 TTL でヒットした"
case "$OUT8B" in *"数値でない"*) ok "理由（TTL が数値でない）を出す" ;; *) ng "理由が出ない: $OUT8B" ;; esac

echo ""
echo "9) 記録は入力ごと（別の鍵ではヒットしない）"
echo "dummy checker v9" > "$SB/checker.sh"
KK2="$(mutcache_key "$SB/target.html" "$SB/gen.js" "$SB/suite.js" "$SB/checker.sh")"
if mutcache_hit "t1" "$KK2" >/dev/null 2>&1; then ng "★ 別入力の鍵でヒットした"; else ok "入力が変われば当たらない"; fi
# ★ 枝を行き来する使い方（A で実行 → B で実行 → A に戻る）で消し合わないこと。
#   「同名・別鍵は用済み」として消す実装だと、戻ったときに必ずフル実行になる。
mutcache_store "t1" "$KK2"
if mutcache_hit "t1" "$KK" >/dev/null 2>&1; then ok "別入力を記録しても前の記録は残る（枝の行き来で消し合わない）"
else ng "★ 別入力の記録が前の記録を消している"; fi

echo ""
echo "10) 実行環境が鍵に入っていること（★Codex P1 r3794397136）"
#   同じ checkout を macOS と Linux で共有すると、レイアウト・画素を見る e2e は結果が変わりうる。
#   platform/arch/実 Chromium/locale/TZ を鍵に入れたことを、環境変数で振って実測する。
K_TZ_A="$(TZ=Asia/Tokyo key)"
K_TZ_B="$(TZ=UTC key)"
[ -n "$K_TZ_A" ] && [ "$K_TZ_A" != "$K_TZ_B" ] && ok "TZ が変われば鍵が変わる" || ng "TZ が鍵に入っていない"
K_LC_A="$(LC_ALL=C.UTF-8 key)"
K_LC_B="$(LC_ALL=C key)"
[ "$K_LC_A" != "$K_LC_B" ] && ok "LC_ALL が変われば鍵が変わる" || ng "locale が鍵に入っていない"
if node "$KEYTOOL" --target "$SB/target.html" --gen "$SB/gen.js" --suite "$SB/suite.js" --dump-parts 2>/dev/null | grep -q '^platform='; then
  ok "platform/arch を鍵の材料に含めている"
else
  # --dump-parts が無い実装でも、材料に入っていることは上の TZ/LC で間接的に測れている。
  # ここは「材料の列挙を目で確認できる」ことの pin なので、無ければ NG。
  ng "鍵の材料を確認できない（--dump-parts が無い）"
fi

echo ""
echo "11) ★ 結線そのものを動かす（★Codex P2 r3794397147 — grep では no-op 実装を見抜けない）"
#   架空の「チェッカー」に本物の lib を source させ、初回=実行 / 2回目=skip /
#   入力変更=再実行 / 失敗時=記録しない を**実際に走らせて**観測する。
cat > "$SB/fakechecker.sh" <<'FCEOF'
#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="$SBDIR/target.html"; GEN="$SBDIR/gen.js"; SUITE="$SBDIR/suite.js"
. "$LIBPATH"
MUTKEY="$(mutcache_key "$TARGET" "$GEN" "$SUITE" "$0")" || MUTKEY=""
if mutcache_hit "fake" "$MUTKEY"; then exit 0; fi
echo "RAN" >> "$SBDIR/ran.log"
if [ "${FAKE_FAIL:-0}" = "1" ]; then echo "  結果: FAIL"; exit 1; fi
mutcache_store "fake" "$MUTKEY"
echo "  結果: PASS"
exit 0
FCEOF
runs() { wc -l < "$SB/ran.log" 2>/dev/null | tr -d ' '; }
: > "$SB/ran.log"
export SBDIR="$SB" LIBPATH="$LIB"
( unset CI; bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
[ "$(runs)" = "1" ] && ok "初回は実行される" || ng "初回に実行されない（runs=$(runs)）"
OUT2="$( ( unset CI; bash "$SB/fakechecker.sh" 2>&1 ) )"
[ "$(runs)" = "1" ] && ok "2回目は実行されない（キャッシュが効いた）" || ng "2回目も実行された＝結線されていない"
case "$OUT2" in *MUTCACHE-SKIP*) ok "2回目は MUTCACHE-SKIP を出す" ;; *) ng "skip の合図が出ていない" ;; esac
echo "dummy suite v11" > "$SB/suite.js"
( unset CI; bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
[ "$(runs)" = "2" ] && ok "入力が変われば再実行される" || ng "入力を変えても再実行されない（★危険）"

# 失敗した実行は記録してはいけない ＝ 同じ入力でも**毎回走り直す**。
# 絶対値ではなく差分で測る（前段の設計を変えても壊れないように）。
echo "dummy suite v12" > "$SB/suite.js"
BEF="$(runs)"
( unset CI; FAKE_FAIL=1 bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
( unset CI; FAKE_FAIL=1 bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
[ "$(( $(runs) - BEF ))" = "2" ] && ok "失敗した実行は記録されない（同じ入力でも走り直す）" \
  || ng "失敗を記録している（差分=$(( $(runs) - BEF ))・期待2）"

# その直後に成功させれば記録され、次は skip になる（＝記録は成功時だけ、を両方向で固定）
BEF="$(runs)"
( unset CI; bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
( unset CI; bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
[ "$(( $(runs) - BEF ))" = "1" ] && ok "成功した実行だけが記録される（次は skip）" \
  || ng "成功しても記録されない（差分=$(( $(runs) - BEF ))・期待1）"

BEF="$(runs)"
( export CI=true; bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
[ "$(( $(runs) - BEF ))" = "1" ] && ok "CI では記録があっても必ず実行される" || ng "CI で skip された（★致命）"

BEF="$(runs)"
( unset CI; MUT_FULL=1 bash "$SB/fakechecker.sh" >/dev/null 2>&1 )
[ "$(( $(runs) - BEF ))" = "1" ] && ok "MUT_FULL=1 でも必ず実行される" || ng "MUT_FULL=1 で skip された"

echo ""
echo "12) ★ 本物のチェッカー2本が実際に skip 経路へ入ること"
#   鍵をこちらで作って**先に記録**しておき、本物のチェッカーを起動する。
#   結線されていれば数秒で MUTCACHE-SKIP を出して終わる。されていなければ
#   変異生成＋実ブラウザに入って戻ってこない（＝時間切れで NG）。
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
try_real() {
  _label="$1"; _name="$2"; _gen="$3"; _suite="$4"; _chk="$5"
  ( cd "$REPO_ROOT" || exit 1
    unset CI
    export MUT_CACHE_DIR="$SB/realcache"
    . "$LIB"
    K="$(mutcache_key shogi_v4.html "$_gen" "$_suite" "$_chk")" || K=""
    [ -n "$K" ] || { echo "NOKEY"; exit 9; }
    mutcache_store "$_name" "$K"
    # ★ Codex P2 (r3794610449): 結線が壊れていた場合、このチェッカーは node/Chromium を
    #   多数バックグラウンド起動する。親だけに TERM を送っても孤児が残り、後続テストの
    #   CPU/メモリを奪う。**専用のプロセスグループ**を作り、時間切れ時はグループごと止める。
    set -m
    bash "$_chk" > "$SB/real_$_name.out" 2>&1 &
    _pid=$!
    set +m
    _i=0
    while [ $_i -lt 60 ]; do
      kill -0 "$_pid" 2>/dev/null || break
      sleep 1; _i=$((_i+1))
    done
    if kill -0 "$_pid" 2>/dev/null; then
      kill -TERM -"$_pid" 2>/dev/null || kill -TERM "$_pid" 2>/dev/null
      sleep 1
      kill -KILL -"$_pid" 2>/dev/null
      wait "$_pid" 2>/dev/null
      echo "TIMEOUT"; exit 8
    fi
    wait "$_pid"; exit $?
  )
}
for spec in \
  "chg_inline_error_881|test/tools/chg_inline_error_881_mutants.js|test/e2e/chg_modal_inline_error_881.e2e.js|test/tools/chg_inline_error_881_mutation_check.sh" \
  "bulk_inline_error_887|test/tools/bulk_inline_error_887_mutants.js|test/e2e/bulk_modal_inline_error_887.e2e.js|test/tools/bulk_inline_error_887_mutation_check.sh" ; do
  NAME="${spec%%|*}"; REST="${spec#*|}"
  GENF="${REST%%|*}"; REST="${REST#*|}"
  SUITEF="${REST%%|*}"; CHKF="${REST#*|}"
  RES="$(try_real "$NAME" "$NAME" "$GENF" "$SUITEF" "$CHKF")"; RC=$?
  if [ "$RC" -eq 0 ] && grep -q 'MUTCACHE-SKIP' "$SB/real_$NAME.out" 2>/dev/null; then
    ok "$NAME が記録済みの鍵で skip 経路へ入った（本物の結線）"
  else
    ng "$NAME が skip しない（rc=$RC $RES）＝結線が切れているか鍵の作り方が食い違っている"
  fi
done

echo ""
echo "12b) ★ 記録の TTL は「中身の成功時刻」で測る（Codex P1 r3794610415）"
#   .mutcache をバックアップから cp で戻すと mtime だけ新しくなる。mtime で測っていると
#   古い記録がさらに24時間生き延びる。中身の epoch で測れば延びない。
export MUT_CACHE_DIR="$SB/cache2"
KE="$(mutcache_key "$SB/target.html" "$SB/gen.js" "$SB/suite.js")"
mutcache_store "t2" "$KE"
CF2="$MUT_CACHE_DIR/t2.$KE"
OLDEP=$(( $(date +%s) - 100000 ))          # TTL(86400) より前
printf '%s\t%s\n' "$OLDEP" "2026-01-01 00:00:00" > "$CF2"
touch "$CF2"                                # ← 復元で mtime だけ新しくなった状態
if mutcache_hit "t2" "$KE" >/dev/null 2>&1; then ng "★ mtime を新しくしただけで TTL が延びた"
else ok "mtime を新しくしても中身が古ければヒットしない"; fi
#   逆に中身が新しければヒットする（測る場所を間違えていない）
printf '%s\t%s\n' "$(date +%s)" "now" > "$CF2"
mutcache_hit "t2" "$KE" >/dev/null 2>&1 && ok "中身が新しければヒットする" || ng "中身が新しくてもヒットしない"
#   旧書式（epoch 行が無い）は読めない＝フル実行
echo "2026-08-17 00:00:00" > "$CF2"
mutcache_hit "t2" "$KE" >/dev/null 2>&1 && ng "★ 旧書式の記録でヒットした" || ok "旧書式の記録はヒットしない（fail closed）"

echo ""
echo "12c) ★ TTL の桁あふれ（Codex P1 r3794610386）"
mutcache_store "t2" "$KE"
OUT12C="$(MUT_CACHE_TTL=999999999999999999999 mutcache_hit "t2" "$KE" 2>&1)"; RC12C=$?
[ "$RC12C" -ne 0 ] && ok "桁が大きすぎる TTL はヒットしない" || ng "★ 桁あふれ TTL で skip へ進んだ"
case "$OUT12C" in *"桁が大きすぎる"*) ok "理由を出す" ;; *) ng "理由が出ない: $OUT12C" ;; esac

echo ""
echo "12d) ★ パスに空白があってもキャッシュが機能する（Codex P2 r3794610404）"
SPACE_DIR="$SB/dir with space"
mkdir -p "$SPACE_DIR"
cp "$SB/target.html" "$SB/gen.js" "$SB/suite.js" "$SPACE_DIR/" 2>/dev/null
echo "checker with space" > "$SPACE_DIR/checker.sh"
KSP="$(mutcache_key "$SPACE_DIR/target.html" "$SPACE_DIR/gen.js" "$SPACE_DIR/suite.js" "$SPACE_DIR/checker.sh")"
if [ -n "$KSP" ]; then ok "空白入りのパスでも鍵が取れる（1要素=1引数で渡している）"
else ng "★ 空白入りのパスで鍵が取れない＝その端末でキャッシュが一度も効かない"; fi

echo ""
echo "12e) ★ 保存の直前に鍵を作り直す（Codex P1 r3794610379）"
#   検査中に入力が変わったら、開始時の鍵に PASS を保存してはいけない。
cat > "$SB/fakechecker2.sh" <<'FC2EOF'
#!/usr/bin/env bash
set -u
TARGET="$SBDIR/t2.html"; GEN="$SBDIR/gen.js"; SUITE="$SBDIR/suite2.js"
. "$LIBPATH"
MUTKEY="$(mutcache_key "$TARGET" "$GEN" "$SUITE" "$0")" || MUTKEY=""
if mutcache_hit "fake2" "$MUTKEY"; then exit 0; fi
echo "RAN" >> "$SBDIR/ran2.log"
# ← 「検査中に入力が変わった」を再現
[ "${MUTATE_MID:-0}" = "1" ] && echo "changed mid-run" >> "$SUITE"
MUTKEY2="$(mutcache_key "$TARGET" "$GEN" "$SUITE" "$0")" || MUTKEY2=""
if [ -n "$MUTKEY" ] && [ "$MUTKEY" = "$MUTKEY2" ]; then
  mutcache_store "fake2" "$MUTKEY"
elif [ -n "$MUTKEY" ]; then
  echo "  （検査中に入力が変わったため記録しない）"
fi
exit 0
FC2EOF
cp "$SB/target.html" "$SB/t2.html"
echo "suite2 v1" > "$SB/suite2.js"
: > "$SB/ran2.log"
runs2() { wc -l < "$SB/ran2.log" 2>/dev/null | tr -d ' '; }
( unset CI; MUTATE_MID=1 bash "$SB/fakechecker2.sh" >/dev/null 2>&1 )
( unset CI; MUTATE_MID=0 bash "$SB/fakechecker2.sh" >/dev/null 2>&1 )
[ "$(runs2)" = "2" ] && ok "検査中に入力が変わった実行は記録されない（次も走る）" \
  || ng "★ 開始時の鍵に PASS が保存された（検査していない版がヒットする）"
( unset CI; MUTATE_MID=0 bash "$SB/fakechecker2.sh" >/dev/null 2>&1 )
[ "$(runs2)" = "2" ] && ok "変わらなければ記録され、次は skip" || ng "変わらなくても記録されない"

echo ""
echo "13) ★ run_e2e.sh の集計が MUTCACHE-SKIP で動くこと（本物のファイルを sandbox で走らせる）"
#   実ブラウザも playwright も要らない形で、run_e2e.sh **そのもの**を走らせて出力を測る。
#   node は PATH 先頭の stub に差し替える（test_pr_gate_scripts.sh と同じ手口）。
mkdir -p "$SB/rt/test/e2e" "$SB/bin"
cp "$SCRIPT_DIR/run_e2e.sh" "$SB/rt/test/run_e2e.sh"
cat > "$SB/bin/node" <<'NODEEOF'
#!/usr/bin/env bash
# playwright の存在確認（node -e ...）だけ肯定し、それ以外は本物の node へ委ねる stub
for a in "$@"; do [ "$a" = "-e" ] && exit 0; done
exec "$REAL_NODE" "$@"
NODEEOF
chmod +x "$SB/bin/node"
REAL_NODE="$(command -v node)"; export REAL_NODE
echo 'console.log("ok suite");' > "$SB/rt/test/e2e/a_ok.e2e.js"
echo 'console.log("MUTCACHE-SKIP fake"); console.log("  スキップ: 入力が同一");' > "$SB/rt/test/e2e/b_skip.e2e.js"
OUT13="$(PATH="$SB/bin:$PATH" bash "$SB/rt/test/run_e2e.sh" dummy.html 2>&1)"; RC13=$?
[ "$RC13" -eq 0 ] && ok "sandbox の run_e2e.sh が正常終了する" || ng "run_e2e.sh が異常終了（rc=$RC13）"
case "$OUT13" in *"【SKIP】"*) ok "skip したジョブの見出しに【SKIP】が付く" ;; *) ng "【SKIP】が付かない" ;; esac
case "$OUT13" in *"スキップ 1 件"*) ok "最終行で PASS と別に数えている" ;; *) ng "スキップが PASS に混ざっている（★危険）"; esac
case "$OUT13" in *"1/2 スイート PASS"*) ok "PASS 数に skip を含めていない" ;; *) ng "PASS 数に skip が含まれている"; esac
case "$OUT13" in *"MUT_FULL=1"*) ok "全部実測する方法を案内している" ;; *) ng "MUT_FULL の案内が出ない" ;; esac
# 逆向き: 合図が無ければ従来どおり「2/2 PASS」で、スキップ行は出ない
echo 'console.log("ok suite 2");' > "$SB/rt/test/e2e/b_skip.e2e.js"
OUT13B="$(PATH="$SB/bin:$PATH" bash "$SB/rt/test/run_e2e.sh" dummy.html 2>&1)"
case "$OUT13B" in
  *"2/2 スイート PASS"*) case "$OUT13B" in *"スキップ"*) ng "合図が無いのにスキップ扱い" ;; *) ok "合図が無ければ従来どおり 2/2 PASS" ;; esac ;;
  *) ng "合図が無いときの集計が壊れている" ;;
esac

echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
echo "  ✓ E2E-MUT-SKIP-001 全PASS"
exit 0
