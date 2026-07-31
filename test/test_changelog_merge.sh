#!/usr/bin/env bash
# @suite: STAGE0 ② changelog_merge（連結・原子的反映・ロールバック）
# =============================================================================
# test_changelog_merge.sh — STAGE0-CONFLICT-FREE-001 ② 連結スクリプトの単体テスト
#   scripts/changelog_merge.sh を、使い捨ての sandbox（mktemp -d）に作った
#   CHANGELOG と断片に対してだけ実行する。**repo の docs/CHANGELOG.md には一切触れない**。
#
#   固定する性質: 順序（ファイル名昇順＝日付順）／冪等（断片ゼロで no-op）／
#   既存本文の無改変／--dry-run の非破壊／README.md の除外／--position top/end／
#   連結後の断片削除／不正な --position の拒否／空・空白のみ断片の全体中止／
#   partial write が原本に届かないこと／反映失敗時の不変性／
#   断片削除の途中失敗 → ロールバック → 再実行で 1 回だけ反映（retry-safe）／
#   ロールバック失敗時に退避物を残して exit 3。
#
# 障害注入の方針（chmod を使わない）:
#   権限ビット（chmod 000 / 444 / 555）による障害注入は **root では効かない**ため
#   結果が実行ユーザーに依存する。ここでは代わりに **PATH shim**（sandbox の bin に
#   awk / rm / mv / grep の偽物を置き、特定の引数のときだけ失敗させる）で注入する。
#   PATH の差し替えはサブシェル内だけで行い、テスト本体の PATH は汚さない。
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

frag_empty() { : > "$SBX/docs/changelog.d/$1"; }          # 0 byte
frag_blank() {                                             # 空白・タブ・改行のみ
  printf '\n   \n\t\n \n' > "$SBX/docs/changelog.d/$1"
}

run_merge() {
  bash "$MERGE" --changelog "$SBX/docs/CHANGELOG.md" --fragments "$SBX/docs/changelog.d" "$@" \
    > "$SBX/out.log" 2>&1
}

# PATH shim を有効にして実行する。PATH の書き換えはサブシェル内に閉じる
# （関数呼び出しの前置き代入は現在のシェルに残りうるため、それを避ける）。
run_merge_shimmed() {
  (
    PATH="$SBX/bin:$PATH"
    export PATH
    bash "$MERGE" --changelog "$SBX/docs/CHANGELOG.md" --fragments "$SBX/docs/changelog.d" "$@"
  ) > "$SBX/out.log" 2>&1
}

# --- 障害注入用 PATH shim -----------------------------------------------------
REAL_AWK="$(command -v awk)"
REAL_RM="$(command -v rm)"
REAL_MV="$(command -v mv)"
REAL_GREP="$(command -v grep)"
REAL_CMP="$(command -v cmp)"
mkdir -p "$SBX/bin"

shim_reset() { "$REAL_RM" -f "$SBX"/bin/*; }

# shim_fail <cmd名> <実体パス> <引数 glob> [rc]
#   引数のどれかが glob に一致したら rc（既定 1）で失敗し、それ以外は実体へ委譲する。
shim_fail() {
  local rc="${4:-1}"
  cat > "$SBX/bin/$1" <<SHIM
#!/usr/bin/env bash
for arg in "\$@"; do
  case "\$arg" in
    $3) exit $rc ;;
  esac
done
exec "$2" "\$@"
SHIM
  chmod 755 "$SBX/bin/$1"
}

# shim_awk_partial <引数 glob>
#   一致したら「途中まで出力してから」失敗する（partial write の再現）。
shim_awk_partial() {
  cat > "$SBX/bin/awk" <<SHIM
#!/usr/bin/env bash
for arg in "\$@"; do
  case "\$arg" in
    $1) printf 'PARTIAL-GARBAGE-途中で切れた出力\n'; exit 1 ;;
  esac
done
exec "$REAL_AWK" "\$@"
SHIM
  chmod 755 "$SBX/bin/awk"
}

# cmp の直前に live 断片を書き換え、退避後の並行更新を再現する。
shim_mv_mutate_live() {
  cat > "$SBX/bin/mv" <<SHIM
#!/usr/bin/env bash
for arg in "\$@"; do
  case "\$arg" in
    *20260729_mutated.md)
      printf '## MUTATED-AFTER-SNAPSHOT\n' > "\$arg"
      ;;
  esac
done
exec "$REAL_MV" "\$@"
SHIM
  chmod 755 "$SBX/bin/mv"
}

# publish 後、最初の削除前検査中に親へ TERM を送り、割り込みを再現する。
shim_cmp_signal_parent() {
  cat > "$SBX/bin/cmp" <<SHIM
#!/usr/bin/env bash
kill -TERM "\$PPID"
sleep 1
exec "$REAL_CMP" "\$@"
SHIM
  chmod 755 "$SBX/bin/cmp"
}

# quarantine 後に同名の新しい live 断片を作り、rollback の上書き防止を検証する。
shim_cmp_recreate_live_and_signal() {
  cat > "$SBX/bin/cmp" <<SHIM
#!/usr/bin/env bash
printf '## NEW-LIVE-CONTENT\n' > "$SBX/docs/changelog.d/20260729_recreated.md"
kill -TERM "\$PPID"
sleep 1
exec "$REAL_CMP" "\$@"
SHIM
  chmod 755 "$SBX/bin/cmp"
}

shim_mv_fail_quarantine_and_restore() {
  cat > "$SBX/bin/mv" <<SHIM
#!/usr/bin/env bash
for arg in "\$@"; do
  case "\$arg" in
    *20260730_slice-b.md|*changelog.restore) exit 1 ;;
  esac
done
exec "$REAL_MV" "\$@"
SHIM
  chmod 755 "$SBX/bin/mv"
}

work_leftovers() { ls -d "$SBX/docs/.changelog_merge."* 2>/dev/null | tr '\n' ' '; }

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
LEFT="$(work_leftovers)"
[ -z "$LEFT" ] && ok "成功時に作業領域を残さない" || ng "作業領域が残った ($LEFT)"

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
[ -f "$SBX/docs/changelog.d/20260729_top.md" ] && ng "top 挿入で断片が削除されていない" || ok "top 挿入でも断片は削除される"

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

# --- 11. 空 / 空白のみの断片は全変更の前に拒否 -------------------------------
echo ""
echo "【11】空・空白のみの断片は全体を中止（CHANGELOG 不変・断片は全て保持）"
setup
frag_empty "20260729_empty.md"
BEFORE_E="$(cat "$SBX/docs/CHANGELOG.md")"
run_merge; RC=$?
[ "$RC" = "2" ] && ok "0 byte の断片は rc=2 で拒否" || ng "0 byte の断片が rc=$RC"
[ "$BEFORE_E" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "0 byte の断片で CHANGELOG は不変" || ng "0 byte の断片で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_empty.md" ] && ok "0 byte の断片は保持される" || ng "0 byte の断片が削除された"
grep -q '空（または空白のみ）の断片' "$SBX/out.log" && ok "空断片であることを明示する" || ng "空断片の説明がない"

setup
frag_blank "20260729_blank.md"
BEFORE_B="$(cat "$SBX/docs/CHANGELOG.md")"
run_merge; RC=$?
[ "$RC" = "2" ] && ok "空白のみの断片は rc=2 で拒否" || ng "空白のみの断片が rc=$RC"
[ "$BEFORE_B" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "空白のみの断片で CHANGELOG は不変" || ng "空白のみの断片で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_blank.md" ] && ok "空白のみの断片は保持される" || ng "空白のみの断片が削除された"

echo ""
echo "【11-b】正常な断片と空の断片が混在 → 全体中止（部分反映しない）"
setup
frag "20260729_good-a.md" "MIX-GOOD-A"
frag_blank "20260730_blank.md"
frag "20260731_good-b.md" "MIX-GOOD-B"
BEFORE_M="$(cat "$SBX/docs/CHANGELOG.md")"
run_merge; RC=$?
[ "$RC" = "2" ] && ok "混在は rc=2 で全体中止" || ng "混在が rc=$RC"
[ "$BEFORE_M" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "混在時 CHANGELOG は 1 byte も変わらない" || ng "混在時に CHANGELOG が変わった"
grep -q 'MIX-GOOD' "$SBX/docs/CHANGELOG.md" && ng "正常な断片が部分反映された" || ok "正常な断片も反映されない（部分反映なし）"
MIX_REMAIN=$(ls "$SBX/docs/changelog.d" | tr '\n' ' ')
[ -f "$SBX/docs/changelog.d/20260729_good-a.md" ] && [ -f "$SBX/docs/changelog.d/20260730_blank.md" ] \
  && [ -f "$SBX/docs/changelog.d/20260731_good-b.md" ] \
  && ok "混在時は全断片が保持される ($MIX_REMAIN)" || ng "混在時に断片が消えた ($MIX_REMAIN)"

echo ""
echo "【11-c】--dry-run でも空断片は先に検出する（事前確認として使える）"
setup
frag "20260729_good-a.md" "DRY-GOOD"
frag_empty "20260730_empty.md"
run_merge --dry-run; RC=$?
[ "$RC" = "2" ] && ok "--dry-run でも空断片は rc=2" || ng "--dry-run の空断片が rc=$RC"

# --- 12. 断片が読めない（PATH shim で注入・chmod 非依存） --------------------
echo ""
echo "【12】読めない断片は全変更前に fail closed（grep 失敗を注入）"
setup
frag "20260729_unreadable.md" "UNREADABLE"
frag "20260730_ok.md" "READABLE"
BEFORE_U="$(cat "$SBX/docs/CHANGELOG.md")"
shim_reset
shim_fail grep "$REAL_GREP" '*20260729_unreadable.md' 2
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" != "0" ] && ok "読めない断片は非ゼロ終了 (rc=$RC)" || ng "読めない断片を成功扱いした"
[ "$BEFORE_U" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "読めない断片で CHANGELOG は不変" || ng "読めない断片で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_unreadable.md" ] && [ -f "$SBX/docs/changelog.d/20260730_ok.md" ] \
  && ok "読めない断片があれば全断片を保持" || ng "断片が削除された"

# --- 13. 生成が途中で失敗（partial output）しても原本は 1 byte も変わらない ---
echo ""
echo "【13】partial write は原本に届かない（awk が途中出力して失敗）"
setup
frag "20260729_io-fail.md" "END-IO-FAIL"
BEFORE_P="$(cat "$SBX/docs/CHANGELOG.md")"
shim_reset
shim_awk_partial '*.frag'
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" != "0" ] && ok "末尾挿入の途中失敗は非ゼロ終了 (rc=$RC)" || ng "末尾挿入の途中失敗を成功扱いした"
[ "$BEFORE_P" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "末尾挿入の途中失敗で CHANGELOG は 1 byte も変わらない" || ng "途中失敗で CHANGELOG が変わった"
grep -q 'PARTIAL-GARBAGE' "$SBX/docs/CHANGELOG.md" && ng "書きかけの内容が CHANGELOG に流れ込んだ" || ok "書きかけの内容は CHANGELOG に流れ込まない"
[ -f "$SBX/docs/changelog.d/20260729_io-fail.md" ] && ok "途中失敗でも断片は保持" || ng "途中失敗で断片が消えた"
LEFT="$(work_leftovers)"
[ -z "$LEFT" ] && ok "途中失敗でも作業領域を残さない" || ng "作業領域が残った ($LEFT)"

setup
frag "20260729_io-fail.md" "TOP-IO-FAIL"
BEFORE_P2="$(cat "$SBX/docs/CHANGELOG.md")"
shim_reset
shim_awk_partial '*.frag'
run_merge_shimmed --position top; RC=$?
shim_reset
[ "$RC" != "0" ] && ok "top 挿入の途中失敗は非ゼロ終了 (rc=$RC)" || ng "top 挿入の途中失敗を成功扱いした"
[ "$BEFORE_P2" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "top 挿入の途中失敗で CHANGELOG は不変" || ng "top 途中失敗で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_io-fail.md" ] && ok "top 途中失敗でも断片は保持" || ng "top 途中失敗で断片が消えた"

# --- 14. 反映（差し替え）自体の失敗 ------------------------------------------
echo ""
echo "【14】反映失敗なら CHANGELOG も断片も実行前のまま"
setup
frag "20260729_publish.md" "PUBLISH-FAIL"
BEFORE_PUB="$(cat "$SBX/docs/CHANGELOG.md")"
shim_reset
shim_fail mv "$REAL_MV" '*changelog.new'
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" != "0" ] && ok "反映失敗は非ゼロ終了 (rc=$RC)" || ng "反映失敗を成功扱いした"
[ "$BEFORE_PUB" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "反映失敗で CHANGELOG は不変" || ng "反映失敗で CHANGELOG が変わった"
[ -f "$SBX/docs/changelog.d/20260729_publish.md" ] && ok "反映失敗でも断片は保持" || ng "反映失敗で断片が消えた"
LEFT="$(work_leftovers)"
[ -z "$LEFT" ] && ok "反映失敗でも作業領域を残さない" || ng "作業領域が残った ($LEFT)"

# --- 15. 2 本目の削除失敗 → ロールバック → 再実行で 1 回だけ反映 -------------
echo ""
echo "【15】断片削除の途中失敗は全ロールバック（retry-safe）"
setup
frag "20260729_slice-a.md" "SLICE-A"
frag "20260730_slice-b.md" "SLICE-B"
frag "20260731_slice-c.md" "SLICE-C"
BEFORE_R="$(cat "$SBX/docs/CHANGELOG.md")"
FRAG_A_BEFORE="$(cat "$SBX/docs/changelog.d/20260729_slice-a.md")"
shim_reset
shim_fail mv "$REAL_MV" '*20260730_slice-b.md'
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" != "0" ] && ok "2 本目の削除失敗は非ゼロ終了 (rc=$RC)" || ng "削除失敗を成功扱いした"
[ "$BEFORE_R" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "ロールバックで CHANGELOG は実行前と同一" || ng "CHANGELOG がロールバックされていない"
if [ -f "$SBX/docs/changelog.d/20260729_slice-a.md" ] && [ -f "$SBX/docs/changelog.d/20260730_slice-b.md" ] \
   && [ -f "$SBX/docs/changelog.d/20260731_slice-c.md" ]; then
  ok "削除済み断片も含めて全断片が復元された"
else
  ng "断片が復元されていない ($(ls "$SBX/docs/changelog.d" | tr '\n' ' '))"
fi
[ "$FRAG_A_BEFORE" = "$(cat "$SBX/docs/changelog.d/20260729_slice-a.md")" ] \
  && ok "復元された断片の中身は実行前と同一" || ng "復元された断片の中身が違う"
LEFT="$(work_leftovers)"
[ -z "$LEFT" ] && ok "ロールバック成功時は作業領域を片付ける" || ng "作業領域が残った ($LEFT)"

echo ""
echo "【15-b】原因解消後に再実行すると 1 回だけ反映される（重複しない）"
run_merge; RC=$?
[ "$RC" = "0" ] && ok "再実行は exit 0" || ng "再実行が exit $RC"
DUP=0
for s in SLICE-A SLICE-B SLICE-C; do
  N=$(grep -c "^## $s\$" "$SBX/docs/CHANGELOG.md" | tr -d ' ')
  [ "$N" = "1" ] || { ng "$s が $N 回現れる（1 回であるべき）"; DUP=1; }
done
[ "$DUP" = "0" ] && ok "3 断片すべてがちょうど 1 回だけ反映された"
REMAIN=$(ls "$SBX/docs/changelog.d" | tr '\n' ' ')
[ "$(echo "$REMAIN" | tr -d ' ')" = "README.md" ] && ok "再実行後は断片が消えている ($REMAIN)" || ng "再実行後も断片が残る ($REMAIN)"
grep -q '^## OLD-001' "$SBX/docs/CHANGELOG.md" && ok "再実行後も既存節は無改変" || ng "再実行で既存節が消えた"

# --- 16. ロールバック自体の失敗 → 退避物を保持して rc=3 ----------------------
echo ""
echo "【16】ロールバックが失敗したら退避物を残して rc=3"
setup
frag "20260729_slice-a.md" "RB-A"
frag "20260730_slice-b.md" "RB-B"
ORIG_RB="$(cat "$SBX/docs/CHANGELOG.md")"
shim_reset
shim_mv_fail_quarantine_and_restore
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" = "3" ] && ok "ロールバック失敗は rc=3" || ng "ロールバック失敗が rc=$RC"
grep -q '手動復旧が必要' "$SBX/out.log" && ok "手動復旧が必要である旨を出力する" || ng "手動復旧の案内がない"
KEPT="$(ls -d "$SBX/docs/.changelog_merge."* 2>/dev/null | head -1)"
if [ -n "$KEPT" ] && [ -f "$KEPT/changelog.bak" ]; then
  ok "退避物（作業領域）を消さずに残す ($(basename "$KEPT"))"
  [ "$ORIG_RB" = "$(cat "$KEPT/changelog.bak")" ] && ok "退避された CHANGELOG は実行前と同一（手で戻せる）" || ng "退避された CHANGELOG が実行前と違う"
  [ -f "$KEPT/frags/1.frag" ] && [ -f "$KEPT/frags/1.path" ] && ok "断片の退避物と元パスも残る" || ng "断片の退避物がない"
  grep -q "$(basename "$KEPT")" "$SBX/out.log" && ok "退避先のパスを出力する" || ng "退避先のパスを出力しない"
else
  ng "退避物が残っていない（手動復旧できない）"
fi
"$REAL_RM" -rf "$SBX/docs/.changelog_merge."*

# --- 17. snapshot 後の live 断片更新は削除せず、全体を戻す --------------------
echo ""
echo "【17】退避後に断片が更新されたらデータを失わずロールバック"
setup
frag "20260729_mutated.md" "SNAPSHOT-CONTENT"
BEFORE_MUT="$(cat "$SBX/docs/CHANGELOG.md")"
shim_reset
shim_mv_mutate_live
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" != "0" ] && ok "退避後の断片更新は非ゼロ終了 (rc=$RC)" || ng "退避後の断片更新を成功扱いした"
[ "$BEFORE_MUT" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "断片更新時は CHANGELOG を実行前へ戻す" || ng "断片更新時に CHANGELOG が残った"
grep -q 'MUTATED-AFTER-SNAPSHOT' "$SBX/docs/changelog.d/20260729_mutated.md" \
  && ok "並行更新された live 断片を保持する" || ng "並行更新された live 断片を失った"

# --- 18. publish 後の TERM はロールバックする --------------------------------
echo ""
echo "【18】反映後・削除前の TERM でも実行前へロールバック"
setup
frag "20260729_signal.md" "SIGNAL-CONTENT"
BEFORE_SIG="$(cat "$SBX/docs/CHANGELOG.md")"
FRAG_SIG="$(cat "$SBX/docs/changelog.d/20260729_signal.md")"
shim_reset
shim_cmp_signal_parent
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" != "0" ] && ok "publish 後の TERM は非ゼロ終了 (rc=$RC)" || ng "publish 後の TERM を成功扱いした"
[ "$BEFORE_SIG" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && ok "TERM 後は CHANGELOG を実行前へ戻す" || ng "TERM 後に CHANGELOG が反映済みのまま"
[ "$FRAG_SIG" = "$(cat "$SBX/docs/changelog.d/20260729_signal.md")" ] \
  && ok "TERM 後も断片を保持する" || ng "TERM 後に断片を失った"
LEFT="$(work_leftovers)"
[ -z "$LEFT" ] && ok "TERM のロールバック成功時は作業領域を片付ける" || ng "TERM 後に作業領域が残った ($LEFT)"

# --- 19. rollback は同名で再作成された live 断片を上書きしない ----------------
echo ""
echo "【19】隔離後に再作成されたlive断片は上書きせず退避物を保持"
setup
frag "20260729_recreated.md" "ORIGINAL-SNAPSHOT"
shim_reset
shim_cmp_recreate_live_and_signal
run_merge_shimmed; RC=$?
shim_reset
[ "$RC" = "3" ] && ok "live再作成との競合は手動復旧扱い rc=3" || ng "live再作成との競合が rc=$RC"
grep -q 'NEW-LIVE-CONTENT' "$SBX/docs/changelog.d/20260729_recreated.md" \
  && ok "新しく作られた live 断片を上書きしない" || ng "新しい live 断片が失われた"
KEPT="$(ls -d "$SBX/docs/.changelog_merge."* 2>/dev/null | head -1)"
if [ -n "$KEPT" ] && [ -f "$KEPT/quarantine/1.frag" ]; then
  grep -q 'ORIGINAL-SNAPSHOT' "$KEPT/quarantine/1.frag" \
    && ok "隔離済みの元断片も手動復旧用に保持する" || ng "隔離済み元断片の内容が違う"
else
  ng "隔離済みの元断片が保持されていない"
fi
"$REAL_RM" -rf "$SBX/docs/.changelog_merge."*

# --- 20. repo 本体の CHANGELOG を触っていない --------------------------------
echo ""
echo "【20】repo の docs/CHANGELOG.md は不変"
[ "$REPO_BEFORE" = "$(repo_fingerprint)" ] && ok "repo の CHANGELOG.md は 1 byte も変わっていない" \
  || ng "repo の CHANGELOG.md が変わった（テストが本体を触っている）"

echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
