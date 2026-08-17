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
#     - ヒットしても記録の mtime を更新しない（TTL が無限に延びない）
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
echo "7) ヒットしても記録の mtime を延ばさない（TTL が無限に延びない）"
CF="$MUT_CACHE_DIR/t1.$KK"
# ★ この repo と cloud/CI の両方で走るので、mtime 取得は**数字であること**まで見る
#   （GNU stat の -f は --file-system で、BSD 用の書式を先に試すと嘘の値を掴む）。
MT1="$(_mc_mtime "$CF")"
case "$MT1" in ''|*[!0-9]*) ng "mtime が数字で取れない（stat の互換で落ちている: '$MT1'）" ;; *) ok "mtime が数字で取れる" ;; esac
sleep 1
mutcache_hit "t1" "$KK" >/dev/null 2>&1
MT2="$(_mc_mtime "$CF")"
[ "$MT1" = "$MT2" ] && ok "mtime が変わらない" || ng "★ ヒットのたびに TTL が延びている"

echo ""
echo "8) TTL / CI / MUT_FULL"
MUT_CACHE_TTL=0 mutcache_hit "t1" "$KK" >/dev/null 2>&1 && ng "TTL 0 でもヒットした" || ok "TTL を過ぎた記録はヒットしない"

( export CI=true; . "$LIB"; mutcache_hit "t1" "$KK" >/dev/null 2>&1 ) && ng "★ CI でヒットした" || ok "CI ではヒットしない（＝必ずフル実行）"
if ( export CI=true; . "$LIB"; mutcache_key "$SB/target.html" "$SB/gen.js" "$SB/suite.js" ) | grep -q '[0-9a-f]'; then
  ng "★ CI でも鍵を作っている"
else ok "CI では鍵を作らない"; fi

( export MUT_FULL=1; . "$LIB"; mutcache_hit "t1" "$KK" >/dev/null 2>&1 ) && ng "★ MUT_FULL=1 でヒットした" || ok "MUT_FULL=1 ではヒットしない"

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
echo "10) run_e2e.sh 側の契約（この語で集計している）"
if grep -q 'MUTCACHE-SKIP' "$SCRIPT_DIR/run_e2e.sh"; then ok "run_e2e.sh が MUTCACHE-SKIP を見ている"
else ng "run_e2e.sh 側の集計が MUTCACHE-SKIP を見ていない（契約が切れている）"; fi
if grep -q 'MUT_FULL' "$SCRIPT_DIR/run_e2e.sh"; then ok "run_e2e.sh に MUT_FULL の案内がある"
else ng "MUT_FULL の案内が無い"; fi
for c in "$SCRIPT_DIR/tools/chg_inline_error_881_mutation_check.sh" "$SCRIPT_DIR/tools/bulk_inline_error_887_mutation_check.sh"; do
  if grep -q 'mutcache_hit' "$c" && grep -q 'mutcache_store' "$c"; then ok "$(basename "$c") が lib を使っている"
  else ng "$(basename "$c") が lib を使っていない"; fi
done

echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
echo "  ✓ E2E-MUT-SKIP-001 全PASS"
exit 0
