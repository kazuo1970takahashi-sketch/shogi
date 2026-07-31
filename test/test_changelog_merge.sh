#!/usr/bin/env bash
# =============================================================================
# test_changelog_merge.sh — STAGE0-CONFLICT-FREE-001 ② 連結スクリプトの単体テスト
#   scripts/changelog_merge.sh を、使い捨ての sandbox（mktemp -d）に作った
#   CHANGELOG と断片に対してだけ実行する。**repo の docs/CHANGELOG.md には一切触れない**。
#
#   固定する性質: 順序（ファイル名昇順＝日付順）／冪等（断片ゼロで no-op）／
#   既存本文の無改変／--dry-run の非破壊／README.md の除外／--position top/end／
#   連結後の断片削除／不正な --position の拒否。
#
# 安全: network / git / gh 不使用。mutating 操作は sandbox 内のみ。
# 使い方: bash test/test_changelog_merge.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERGE="$SCRIPT_DIR/../scripts/changelog_merge.sh"
REPO_CHANGELOG="$SCRIPT_DIR/../docs/CHANGELOG.md"

PASS=0
FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  STAGE0 ② changelog_merge 単体テスト"
echo "=========================================="

if [ ! -f "$MERGE" ]; then echo "✗ scripts/changelog_merge.sh がない"; exit 1; fi
bash -n "$MERGE" && ok "changelog_merge.sh 構文 OK (bash -n)" || ng "changelog_merge.sh 構文エラー"

# repo 本体の CHANGELOG が本テストで変わらないことを最後に確認するための指紋
repo_fingerprint() { wc -c < "$REPO_CHANGELOG" | tr -d ' '; }
REPO_BEFORE="$(repo_fingerprint)"

SBX="$(mktemp -d)"
trap 'rm -rf "$SBX"' EXIT

# --- sandbox 準備 -------------------------------------------------------------
setup() {
  rm -rf "$SBX/docs"
  mkdir -p "$SBX/docs/changelog.d"
  cat > "$SBX/docs/CHANGELOG.md" <<'EOF'
# CHANGELOG — テスト用

> 記載は原文の並び（おおむね時系列・上が古い）。

---

## OLD-001: 既存の古い節

- 既存本文はこの 1 行。
EOF
  cat > "$SBX/docs/changelog.d/README.md" <<'EOF'
# 規約の説明ファイル（断片ではない）
EOF
}

frag() {  # frag <ファイル名> <本文1行目>
  cat > "$SBX/docs/changelog.d/$1" <<EOF


## $2

- $2 の本文。

EOF
}

run_merge() {
  bash "$MERGE" --changelog "$SBX/docs/CHANGELOG.md" --fragments "$SBX/docs/changelog.d" "$@" \
    > "$SBX/out.log" 2>&1
}

# --- 1. 断片ゼロ → no-op（byte 単位で不変） ----------------------------------
echo ""
echo "【1】断片ゼロ = 完全な no-op"
setup
BEFORE="$(cat "$SBX/docs/CHANGELOG.md")"
run_merge; RC=$?
AFTER="$(cat "$SBX/docs/CHANGELOG.md")"
[ "$RC" = "0" ] && ok "断片ゼロでも exit 0" || ng "断片ゼロで exit $RC"
[ "$BEFORE" = "$AFTER" ] && ok "断片ゼロなら CHANGELOG は 1 byte も変わらない" || ng "断片ゼロなのに CHANGELOG が変わった"
grep -q '何もしない' "$SBX/out.log" && ok "no-op である旨を出力する" || ng "no-op の出力がない"

# --- 2. 順序（ファイル名昇順＝日付順） ---------------------------------------
echo ""
echo "【2】連結順序はファイル名昇順（＝日付順）"
setup
frag "20260731_slice-c.md" "SLICE-C"
frag "20260729_slice-a.md" "SLICE-A"
frag "20260730_slice-b.md" "SLICE-B"
run_merge; RC=$?
[ "$RC" = "0" ] && ok "連結は exit 0" || ng "連結が exit $RC"
ORDER=$(grep -o 'SLICE-[ABC]' "$SBX/docs/CHANGELOG.md" | awk '!seen[$0]++' | tr '\n' ',' | sed 's/,$//')
[ "$ORDER" = "SLICE-A,SLICE-B,SLICE-C" ] && ok "作成順ではなく日付順で連結された ($ORDER)" || ng "順序が違う ($ORDER)"

# --- 3. 既存本文の無改変＋末尾連結 -------------------------------------------
echo ""
echo "【3】既存本文は無改変・既定は末尾連結"
grep -q '^## OLD-001: 既存の古い節' "$SBX/docs/CHANGELOG.md" && ok "既存の節が残っている" || ng "既存の節が消えた"
OLD_LINE=$(grep -n '^## OLD-001' "$SBX/docs/CHANGELOG.md" | cut -d: -f1)
NEW_LINE=$(grep -n '^## SLICE-A' "$SBX/docs/CHANGELOG.md" | cut -d: -f1)
[ -n "$OLD_LINE" ] && [ -n "$NEW_LINE" ] && [ "$OLD_LINE" -lt "$NEW_LINE" ] \
  && ok "新しい節は既存節より後ろ（末尾連結・上が古い）" || ng "末尾連結になっていない (old=$OLD_LINE new=$NEW_LINE)"
HEAD3=$(head -1 "$SBX/docs/CHANGELOG.md")
[ "$HEAD3" = "# CHANGELOG — テスト用" ] && ok "ヘッダ行は不変" || ng "ヘッダが壊れた ($HEAD3)"

# --- 4. 連結後に断片が削除される（README は残る） ----------------------------
echo ""
echo "【4】連結した断片は削除され、README.md は残る"
REMAIN=$(ls "$SBX/docs/changelog.d" | tr '\n' ' ')
[ "$(echo "$REMAIN" | tr -d ' ')" = "README.md" ] && ok "残るのは README.md だけ ($REMAIN)" || ng "断片が残っている ($REMAIN)"

# --- 5. 冪等（もう一度回しても変わらない） -----------------------------------
echo ""
echo "【5】冪等: 連結後にもう一度実行しても変わらない"
BEFORE2="$(cat "$SBX/docs/CHANGELOG.md")"
run_merge; RC=$?
AFTER2="$(cat "$SBX/docs/CHANGELOG.md")"
[ "$RC" = "0" ] && [ "$BEFORE2" = "$AFTER2" ] && ok "2 回目は no-op（内容一致・exit 0）" || ng "2 回目で内容が変わった (rc=$RC)"

# --- 6. README.md を断片として扱わない ---------------------------------------
echo ""
echo "【6】README.md は断片として連結しない"
grep -q '規約の説明ファイル' "$SBX/docs/CHANGELOG.md" && ng "README.md の中身が連結された" || ok "README.md は連結対象外"

# --- 7. --dry-run は何も壊さない ---------------------------------------------
echo ""
echo "【7】--dry-run は CHANGELOG も断片も変えない"
setup
frag "20260729_dry.md" "DRY-ONE"
BEFORE3="$(cat "$SBX/docs/CHANGELOG.md")"
run_merge --dry-run; RC=$?
AFTER3="$(cat "$SBX/docs/CHANGELOG.md")"
[ "$RC" = "0" ] && ok "--dry-run は exit 0" || ng "--dry-run が exit $RC"
[ "$BEFORE3" = "$AFTER3" ] && ok "--dry-run で CHANGELOG は不変" || ng "--dry-run なのに CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_dry.md" ] && ok "--dry-run で断片は削除されない" || ng "--dry-run なのに断片が消えた"
grep -q '20260729_dry.md' "$SBX/out.log" && ok "--dry-run が対象断片を列挙する" || ng "--dry-run の列挙がない"

# --- 8. --position top -------------------------------------------------------
echo ""
echo "【8】--position top はヘッダ直後へ挿入する"
setup
frag "20260729_top.md" "TOP-ONE"
run_merge --position top; RC=$?
OLD_LINE=$(grep -n '^## OLD-001' "$SBX/docs/CHANGELOG.md" | cut -d: -f1)
NEW_LINE=$(grep -n '^## TOP-ONE' "$SBX/docs/CHANGELOG.md" | cut -d: -f1)
HR_LINE=$(grep -n '^---$' "$SBX/docs/CHANGELOG.md" | head -1 | cut -d: -f1)
[ "$RC" = "0" ] && ok "--position top は exit 0" || ng "--position top が exit $RC"
if [ -n "$HR_LINE" ] && [ -n "$NEW_LINE" ] && [ -n "$OLD_LINE" ] \
   && [ "$HR_LINE" -lt "$NEW_LINE" ] && [ "$NEW_LINE" -lt "$OLD_LINE" ]; then
  ok "水平線の直後・既存節より前に入った (hr=$HR_LINE new=$NEW_LINE old=$OLD_LINE)"
else
  ng "top 挿入位置が違う (hr=$HR_LINE new=$NEW_LINE old=$OLD_LINE)"
fi
grep -q '^# CHANGELOG — テスト用' "$SBX/docs/CHANGELOG.md" && ok "top 挿入でもヘッダは不変" || ng "top 挿入でヘッダが壊れた"
grep -q '^## OLD-001' "$SBX/docs/CHANGELOG.md" && ok "top 挿入でも既存節は残る" || ng "top 挿入で既存節が消えた"

# --- 9. 不正な引数は拒否 -----------------------------------------------------
echo ""
echo "【9】不正入力は fail closed"
setup
run_merge --position sideways; RC=$?
[ "$RC" = "2" ] && ok "不正な --position は rc=2 で拒否" || ng "不正な --position が rc=$RC"
run_merge --nonsense; RC=$?
[ "$RC" = "2" ] && ok "未知の引数は rc=2 で拒否" || ng "未知の引数が rc=$RC"
bash "$MERGE" --changelog "$SBX/does-not-exist.md" --fragments "$SBX/docs/changelog.d" >/dev/null 2>&1; RC=$?
[ "$RC" = "2" ] && ok "CHANGELOG 不在は rc=2 で拒否" || ng "CHANGELOG 不在が rc=$RC"

# --- 10. 値が必要なオプションの欠落は即座に拒否 -----------------------------
echo ""
echo "【10】値が必要なオプションの欠落は rc=2"
for opt in --position --changelog --fragments; do
  bash "$MERGE" "$opt" >"$SBX/out.log" 2>&1; RC=$?
  [ "$RC" = "2" ] && ok "$opt の値欠落は rc=2 で拒否" || ng "$opt の値欠落が rc=$RC"
done

# --- 11. 読み書き・削除不能時は fail closed ----------------------------------
echo ""
echo "【11】I/O 失敗では上書き・削除せず終了する"
setup
frag "20260729_unreadable.md" "UNREADABLE"
BEFORE4="$(cat "$SBX/docs/CHANGELOG.md")"
chmod 000 "$SBX/docs/changelog.d/20260729_unreadable.md"
run_merge; RC=$?
chmod 600 "$SBX/docs/changelog.d/20260729_unreadable.md"
[ "$RC" != "0" ] && ok "読めない断片は非ゼロ終了" || ng "読めない断片を成功扱いした"
[ "$BEFORE4" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "読めない断片で CHANGELOG は不変" || ng "読めない断片で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_unreadable.md" ] && ok "読めない断片は保持" || ng "読めない断片が削除された"

setup
frag "20260729_readonly.md" "READONLY"
BEFORE5="$(cat "$SBX/docs/CHANGELOG.md")"
chmod 444 "$SBX/docs/CHANGELOG.md"
run_merge; RC=$?
chmod 600 "$SBX/docs/CHANGELOG.md"
[ "$RC" != "0" ] && ok "書けない CHANGELOG は非ゼロ終了" || ng "書けない CHANGELOG を成功扱いした"
[ "$BEFORE5" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "書き込み失敗で CHANGELOG は不変" || ng "書き込み失敗で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_readonly.md" ] && ok "書き込み失敗時も断片は保持" || ng "書き込み失敗時に断片が削除された"

setup
frag "20260729_nodelete.md" "NODELETE"
BEFORE6="$(cat "$SBX/docs/CHANGELOG.md")"
chmod 555 "$SBX/docs/changelog.d"
run_merge; RC=$?
chmod 755 "$SBX/docs/changelog.d"
[ "$RC" != "0" ] && ok "削除不能ディレクトリは非ゼロ終了" || ng "削除不能を成功扱いした"
[ "$BEFORE6" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "削除不能なら CHANGELOG を事前に保護" || ng "削除不能なのに CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_nodelete.md" ] && ok "削除不能なら断片は保持" || ng "削除不能なのに断片が消えた"

# --- 12. top 挿入でも断片生成失敗を見逃さない -------------------------------
echo ""
echo "【12】--position top の断片生成失敗は fail closed"
setup
frag "20260729_top-io-fail.md" "TOP-IO-FAIL"
BEFORE7="$(cat "$SBX/docs/CHANGELOG.md")"
REAL_AWK="$(command -v awk)"
mkdir -p "$SBX/bin"
cat > "$SBX/bin/awk" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do
  case "$arg" in
    *top-io-fail.md) exit 1 ;;
  esac
done
exec "$REAL_AWK" "$@"
EOF
chmod 755 "$SBX/bin/awk"
REAL_AWK="$REAL_AWK" PATH="$SBX/bin:$PATH" run_merge --position top; RC=$?
[ "$RC" != "0" ] && ok "top 挿入中の断片生成失敗は非ゼロ終了" || ng "top 挿入中の断片生成失敗を成功扱いした"
[ "$BEFORE7" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "top 断片生成失敗で CHANGELOG は不変" || ng "top 断片生成失敗で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_top-io-fail.md" ] && ok "top 断片生成失敗でも断片は保持" || ng "top 断片生成失敗で断片が消えた"

# --- 13. repo 本体の CHANGELOG を触っていない --------------------------------
echo ""
echo "【13】repo の docs/CHANGELOG.md は不変"
[ "$REPO_BEFORE" = "$(repo_fingerprint)" ] && ok "repo の CHANGELOG.md は 1 byte も変わっていない" \
  || ng "repo の CHANGELOG.md が変わった（テストが本体を触っている）"

echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
