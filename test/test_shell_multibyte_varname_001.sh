#!/usr/bin/env bash
# @suite: SHELL-MB-VARNAME-001 — `$var` の直後に全角文字を置いていないか（bash 3.2 互換）
# =============================================================================
# なぜ要るか（2026-08-19 実測）:
#   作者機（macOS 既定の **bash 3.2**）は UTF-8 ロケールで **高位バイトを変数名に取り込む**。
#   そのため `say "検出 $_name（${_s2} bytes）"` のような行は、`_name` が代入済みでも
#   `set -u` の下で「`_name?`: 未割り当ての変数です」で落ちる。
#   **cloud / CI の bash 5 では再現しない**＝POSIX BRE と同類の「そこでしか見えない互換差」で、
#   全量テストが緑のまま作者機だけが壊れる。
#
#   実害の記録:
#     - `$EXPECT_PASS）` … test_bulk_inline_error_pins_887.sh のヘッダに実測として残っている
#     - `$_name（`       … scripts/land.sh 228 行。**#909 便2 の受け渡しが実際にここで止まった**
#   規約はコメントとして repo に書かれていたが、**それを守らせる機械が無かった**ので再発した。
#   これがその機械。
#
# 検査: git 追跡下の *.sh 全部。行頭が `#` の行（＝この規約自体を説明しているコメント）は除く。
# 直し方: `${var}` と波括弧で囲む。
# 使い方: bash test/test_shell_multibyte_varname_001.sh
# 終了コード: 0=違反なし / 1=違反あり
# 依存: bash 3.2+ / git / grep（-P が無い環境では perl 相当の代替へ落ちる）
# =============================================================================
set -u
cd "$(dirname "$0")/.." || exit 1

pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ✓ $1"; }
ng(){ fail=$((fail+1)); echo "  ✗ $1"; }

echo ""
echo "【SHELL-MB-VARNAME-001】\$var の直後の全角文字（bash 3.2 で変数名に食われる）"

FILES="$(git ls-files '*.sh' 2>/dev/null)"
if [ -z "$FILES" ]; then
  echo "  ✗ 検査対象の *.sh が 0 件（git 管理下で実行していない）＝緑と『何も見ていない』を区別できない"
  exit 1
fi
NFILES="$(printf '%s\n' "$FILES" | wc -l | tr -d ' ')"

# 行頭 `#` のコメント行を落としてから走査する（規約そのものを書いた行を違反にしない）。
scan_one(){
  # $1=ファイル。違反行を "行番号:内容" で出す。
  awk '{ line=$0; s=line; sub(/^[ \t]+/, "", s); if (substr(s,1,1) == "#") next; print NR ":" line }' "$1" \
    | grep -P '\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]' 2>/dev/null
}

if ! echo 'x' | grep -qP 'x' 2>/dev/null; then
  echo "  ⚠ grep -P が使えないため SHELL-MB-VARNAME-001 を SKIP（FAIL/WARN 非加算）"
  exit 0
fi

# ★ 違反は **1 行ひ1 件**数える。パイプの while だと子シェルで回って
#   fail の加算が親へ戻らない（件数がファイル単位に丸まる）ので here-string で回す。
VIOL=0
for f in $FILES; do
  hits="$(scan_one "$f")"
  [ -n "$hits" ] || continue
  VIOL=1
  while IFS= read -r h; do
    [ -n "$h" ] || continue
    ng "$f:$h"
  done <<< "$hits"
done
[ "$VIOL" -eq 0 ] && ok "追跡下の *.sh ${NFILES} 本に違反なし（\$var の直後は必ず ASCII か \${var}）"

# ★ 自己検査: この検査器が本当に違反を見つけられるか（＝空振りで緑になっていない証拠）。
#   検出装置を攻撃する変異を1本、毎回その場で当てる。
#   ★ fixture の全角文字は **変数経由で組み立てる**。このファイル自身に
#     `$V（` という並びを書くと、この検査器が自分を違反として拾う。
FW="$(printf '\xef\xbc\x88')"   # 全角の開き括弧
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
printf '%s\n' 'V=1' "echo \"検出 \$V${FW}bytes\"" > "$TMPD/bad.sh"
if [ -n "$(scan_one "$TMPD/bad.sh")" ]; then ok "自己検査: 違反サンプルを実際に検出できる"
else ng "自己検査: 違反サンプルを検出できない＝この検査器は空振りしている"; fi
printf '%s\n' 'V=1' "echo \"検出 \${V}${FW}bytes\"" "echo \"# \${V}${FW}コメントではない\"" > "$TMPD/good.sh"
GOODHITS="$(scan_one "$TMPD/good.sh")"
if [ -z "$GOODHITS" ]; then ok "自己検査: 正しい形（\${var}）を誤検出しない"
else ng "自己検査: 正しい形を誤検出する [$GOODHITS]"; fi
printf '%s\n' "  # 説明: \$V${FW}この行はコメント）" > "$TMPD/comment.sh"
if [ -z "$(scan_one "$TMPD/comment.sh")" ]; then ok "自己検査: 行頭 # のコメント行は対象外"
else ng "自己検査: コメント行を違反にしてしまう"; fi

echo ""
echo "  SHELL-MB-VARNAME-001: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] || exit 1
