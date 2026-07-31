#!/usr/bin/env bash
# @suite: STAGE0 ② changelog_merge 永続transaction安全性
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERGE="$DIR/../scripts/changelog_merge.sh"
REAL_CHANGELOG="$DIR/../docs/CHANGELOG.md"
PASS=0 FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
ng(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$1"; then ok "$2"; else ng "$2"; fi; }
SBX="$(mktemp -d)"
trap 'rm -rf "$SBX"' EXIT
REAL_SIZE="$(wc -c < "$REAL_CHANGELOG" | tr -d ' ')"

setup(){
  rm -rf "$SBX/docs"
  mkdir -p "$SBX/docs/changelog.d"
  printf '%s\n' '# CHANGELOG test' '' '---' '' '## OLD' '' '- old' > "$SBX/docs/CHANGELOG.md"
  printf '%s\n' '# README' > "$SBX/docs/changelog.d/README.md"
}
frag(){ printf '\n## %s\n\n- body\n' "$2" > "$SBX/docs/changelog.d/$1"; }
run(){
  env ${RUN_ENV:-} bash "$MERGE" --changelog "$SBX/docs/CHANGELOG.md" \
    --fragments "$SBX/docs/changelog.d" "$@" > "$SBX/out" 2>&1
}
tx_latest(){ ls -dt "$SBX/docs"/.changelog_merge.txn.* 2>/dev/null | head -1; }
state(){ cat "$(tx_latest)/state" 2>/dev/null; }

echo "=========================================="
echo "  changelog_merge 永続transaction test"
echo "=========================================="
bash -n "$MERGE" && ok "script構文" || ng "script構文"

echo "【基本動作】"
setup
run; rc=$?
check '[ "$rc" = 0 ]' "断片ゼロはno-op"
frag 20260731_b.md B
frag 20260730_a.md A
run; rc=$?
check '[ "$rc" = 0 ]' "正常merge"
order="$(grep -E '^## (A|B)$' "$SBX/docs/CHANGELOG.md" | tr '\n' ' ')"
check '[ "$order" = "## A ## B " ]' "ファイル名順"
check '[ "$(state)" = committed ]' "transactionはcommitted"
check '[ ! -e "$SBX/docs/changelog.d/20260730_a.md" ]' "live断片はquarantineへ移動"
check '[ -f "$(tx_latest)/quarantine/1.frag" ]' "元inodeを成功後も永続保持"
before="$(cat "$SBX/docs/CHANGELOG.md")"
run; rc=$?
check '[ "$rc" = 0 ] && [ "$before" = "$(cat "$SBX/docs/CHANGELOG.md")" ]' "retryはno-op"

echo "【dry-run / validation / top】"
setup; frag 20260730_dry.md DRY
before="$(cat "$SBX/docs/CHANGELOG.md")"
run --dry-run; rc=$?
check '[ "$rc" = 0 ] && [ "$before" = "$(cat "$SBX/docs/CHANGELOG.md")" ] && [ -f "$SBX/docs/changelog.d/20260730_dry.md" ]' "dry-run非破壊"
setup; : > "$SBX/docs/changelog.d/20260730_empty.md"
run; rc=$?
check '[ "$rc" = 2 ] && [ -f "$SBX/docs/changelog.d/20260730_empty.md" ]' "空断片fail closed"
setup; frag 20260730_top.md TOP
run --position top; rc=$?
topline="$(grep -n '^## TOP$' "$SBX/docs/CHANGELOG.md" | cut -d: -f1)"
oldline="$(grep -n '^## OLD$' "$SBX/docs/CHANGELOG.md" | cut -d: -f1)"
check '[ "$rc" = 0 ] && [ "$topline" -lt "$oldline" ]' "top挿入"

echo "【排他lock】"
setup; frag 20260730_lock.md LOCK
mkdir "$SBX/docs/.changelog_merge.lock"
run; rc=$?
check '[ "$rc" = 3 ]' "active/staleを推測せずlock存在はrc3"
rmdir "$SBX/docs/.changelog_merge.lock"
setup; frag 20260730_lock_signal.md LOCK-SIGNAL
RUN_ENV='CHANGELOG_MERGE_TEST_SIGNAL_AT=lock_acquired'; run; rc=$?; RUN_ENV=
check '[ "$rc" != 0 ] && [ ! -d "$SBX/docs/.changelog_merge.lock" ] && [ -f "$SBX/docs/changelog.d/20260730_lock_signal.md" ]' "lock取得中signalを保留処理し、mergeせずlockを解放"

echo "【same-filesystem保証】"
setup; frag 20260730_crossfs.md CROSSFS
mkdir -p "$SBX/bin"
printf '%s\n' '#!/usr/bin/env bash' 'exit 18' > "$SBX/bin/ln"
chmod +x "$SBX/bin/ln"
before="$(cat "$SBX/docs/CHANGELOG.md")"
RUN_ENV="PATH=$SBX/bin:$PATH"; run; rc=$?; RUN_ENV=
check '[ "$rc" != 0 ] && [ -f "$SBX/docs/changelog.d/20260730_crossfs.md" ] && [ "$before" = "$(cat "$SBX/docs/CHANGELOG.md")" ]' "hard-link probe失敗は変更前にfail closed"

echo "【commit前crash recovery】"
setup; frag 20260730_emptytx.md EMPTY-TX
emptytx="$SBX/docs/.changelog_merge.txn.EMPTY"; mkdir "$emptytx"
run; rc=$?
check '[ "$rc" = 0 ] && [ ! -d "$emptytx" ] && grep -q "^## EMPTY-TX$" "$SBX/docs/CHANGELOG.md"' "state作成前の空transactionを安全に除去"

setup; frag 20260730_statetmp.md STATE-TMP
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_initial_state_tmp'; run; rc=$?; RUN_ENV=
tmptx="$(tx_latest)"
check '[ "$rc" = 103 ] && [ ! -f "$tmptx/state" ] && [ -f "$tmptx"/state.tmp.* ]' "初回state tmp作成後crashを保持"
run; rc=$?
check '[ "$rc" = 0 ] && [ ! -d "$tmptx" ] && grep -q "^## STATE-TMP$" "$SBX/docs/CHANGELOG.md"' "state tmpだけのtransactionを安全に除去・再実行"

setup; frag 20260730_pathtmp.md PATH-TMP
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_path_tmp'; run; rc=$?; RUN_ENV=
pathtx="$(tx_latest)"
check '[ "$rc" = 104 ] && [ "$(cat "$pathtx/state")" = preparing ] && [ -f "$pathtx"/paths/1.path.tmp.* ] && [ ! -f "$pathtx/paths/1.path" ]' "path tmp作成後crashで不完全pathを公開しない"
run; rc=$?
check '[ "$rc" = 0 ] && grep -q "^## PATH-TMP$" "$SBX/docs/CHANGELOG.md"' "path tmp crashを自動回復して再実行"

setup; frag 20260730_pre.md PRE
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine'; run; rc=$?; RUN_ENV=
check '[ "$rc" = 97 ] && [ "$(state)" = prepared ]' "quarantine後crashを保持"
check '[ -f "$(tx_latest)/quarantine/1.frag" ]' "crash後も元断片保持"
oldtx="$(tx_latest)"; oldstate="$(state)"
run --dry-run; rc=$?
check '[ "$rc" = 3 ] && [ "$(cat "$oldtx/state")" = "$oldstate" ] && [ ! -e "$SBX/docs/changelog.d/20260730_pre.md" ] && [ -f "$oldtx/quarantine/1.frag" ]' "dry-runは残存transactionを変更せず拒否"
run; rc=$?
check '[ "$rc" = 0 ] && [ "$(grep -c "^## PRE$" "$SBX/docs/CHANGELOG.md")" = 1 ]' "次回にatomic復元後1回だけmerge"

setup; frag 20260730_nodir.md NODIR
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine'; run; rc=$?; RUN_ENV=
oldtx="$(tx_latest)"; rm -rf "$SBX/docs/changelog.d"
run --dry-run; rc=$?
check '[ "$rc" = 3 ] && [ "$(cat "$oldtx/state")" = prepared ] && [ -f "$oldtx/quarantine/1.frag" ]' "fragment dir消失時もdry-runは残存transactionを変更せず拒否"

setup
printf '%s\n' '# A' > "$SBX/docs/A.md"; printf '%s\n' '# B' > "$SBX/docs/B.md"
frag 20260730_scope.md SCOPE-A
env CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine bash "$MERGE" --changelog "$SBX/docs/A.md" --fragments "$SBX/docs/changelog.d" > "$SBX/out" 2>&1; rc=$?
atx="$(tx_latest)"
env bash "$MERGE" --changelog "$SBX/docs/B.md" --fragments "$SBX/docs/changelog.d" > "$SBX/out" 2>&1; rc2=$?
check '[ "$rc" = 97 ] && [ "$rc2" = 0 ] && [ "$(cat "$atx/state")" = prepared ] && ! grep -q SCOPE-A "$SBX/docs/B.md"' "別CHANGELOGのtransactionを回復・混入しない"
env bash "$MERGE" --changelog "$SBX/docs/A.md" --fragments "$SBX/docs/changelog.d" > "$SBX/out" 2>&1; rc=$?
check '[ "$rc" = 0 ] && grep -q SCOPE-A "$SBX/docs/A.md"' "対象CHANGELOGだけが自身のtransactionを回復"

setup; frag 20260730_relative.md RELATIVE
mkdir "$SBX/one" "$SBX/two"
(cd "$SBX/docs" && env CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine bash "$MERGE" --changelog "$SBX/docs/CHANGELOG.md" --fragments changelog.d > "$SBX/out" 2>&1); rc=$?
(cd "$SBX/two" && env bash "$MERGE" --changelog "$SBX/docs/CHANGELOG.md" --fragments ../docs/changelog.d > "$SBX/out" 2>&1); rc2=$?
check '[ "$rc" = 97 ] && [ "$rc2" = 0 ] && grep -q "^## RELATIVE$" "$SBX/docs/CHANGELOG.md" && [ ! -e "$SBX/two/changelog.d/20260730_relative.md" ]' "相対fragment pathを絶対化して元位置へ復元"

echo "【atomic no-clobber recovery】"
setup; frag 20260730_race.md ORIGINAL
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine'; run; rc=$?; RUN_ENV=
printf '%s\n' '## NEW-LIVE' > "$SBX/docs/changelog.d/20260730_race.md"
oldtx="$(tx_latest)"
run; rc=$?
check '[ "$rc" = 3 ]' "同名live競合はrc3"
check 'grep -q NEW-LIVE "$SBX/docs/changelog.d/20260730_race.md"' "新liveを上書きしない"
check 'grep -q ORIGINAL "$oldtx/quarantine/1.frag"' "quarantine原本も保持"

setup; frag 20260730_multi1.md MULTI-1; frag 20260730_multi2.md MULTI-2
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine'; run; rc=$?; RUN_ENV=
oldtx="$(tx_latest)"
printf '%s\n' '## CONFLICT' > "$SBX/docs/changelog.d/20260730_multi2.md"
run; rc=$?
check '[ "$rc" = 3 ] && [ -f "$oldtx/quarantine/1.frag" ] && [ "$SBX/docs/changelog.d/20260730_multi1.md" -ef "$oldtx/quarantine/1.frag" ]' "部分復元失敗でも先行quarantine inodeを保持"
rm -f "$SBX/docs/changelog.d/20260730_multi2.md"
run; rc=$?
check '[ "$rc" = 0 ] && grep -q "^## MULTI-1$" "$SBX/docs/CHANGELOG.md" && grep -q "^## MULTI-2$" "$SBX/docs/CHANGELOG.md"' "部分復元を同一inode判定で安全に再試行"

echo "【commit境界crash / signal】"
setup; frag 20260730_before.md BEFORE
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=before_commit'; run; rc=$?; RUN_ENV=
check '[ "$rc" = 98 ] && [ "$(state)" = publishing ]' "旧版退避前crashはpublishingを保持"
run; rc=$?
check '[ "$rc" = 0 ] && [ "$(grep -c "^## BEFORE$" "$SBX/docs/CHANGELOG.md")" = 1 ]' "旧版退避前crashを復元後1回だけmerge"

setup; frag 20260730_displaced.md DISPLACED
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_displace'; run; rc=$?; RUN_ENV=
check '[ "$rc" = 100 ] && [ "$(state)" = publishing ] && [ ! -e "$SBX/docs/CHANGELOG.md" ]' "旧版退避後crashはpublishingを保持"
run; rc=$?
check '[ "$rc" = 0 ] && [ "$(grep -c "^## DISPLACED$" "$SBX/docs/CHANGELOG.md")" = 1 ]' "CHANGELOG不在でも回復後1回だけmerge"

setup; frag 20260730_commit.md COMMIT
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_commit'; run; rc=$?; RUN_ENV=
check '[ "$rc" = 99 ] && [ "$(state)" = committing ] && grep -q "^## COMMIT$" "$SBX/docs/CHANGELOG.md"' "commit後crashはcommittingを保持"
run; rc=$?
check '[ "$rc" = 0 ] && [ "$(grep -c "^## COMMIT$" "$SBX/docs/CHANGELOG.md")" = 1 ]' "次回にcommit済み判定・重複なし"

setup; frag 20260730_signal.md SIGNAL
RUN_ENV='CHANGELOG_MERGE_TEST_SIGNAL_AT=after_commit'; run; rc=$?; RUN_ENV=
check '[ "$rc" != 0 ] && [ "$(state)" = committing ]' "commit後signalでもrollbackしない"
run; rc=$?
check '[ "$rc" = 0 ] && [ "$(grep -c "^## SIGNAL$" "$SBX/docs/CHANGELOG.md")" = 1 ]' "signal後も次回確定"

echo "【曖昧crashはfail closed】"
setup; frag 20260730_amb.md AMB
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_commit'; run; RUN_ENV=
printf '%s\n' '# EXTERNAL' > "$SBX/docs/CHANGELOG.md"
run; rc=$?
check '[ "$rc" = 3 ] && grep -q "曖昧" "$SBX/out"' "before/published不一致はrc3"

echo "【公開直前CHANGELOG競合】"
setup; frag 20260730_concurrent.md CONCURRENT-FRAG
RUN_ENV='CHANGELOG_MERGE_TEST_CONCURRENT_AT=before_publish'; run; rc=$?; RUN_ENV=
tx="$(tx_latest)"
check '[ "$rc" = 3 ] && grep -q "^# CONCURRENT$" "$SBX/docs/CHANGELOG.md"' "退避直前の並行編集を上書きしない"
check 'grep -q "^# CHANGELOG test$" "$tx/changelog.before" && grep -q "^## CONCURRENT-FRAG$" "$tx/published.image"' "競合時に旧版と公開予定版を保持"

setup; frag 20260730_concurrent2.md CONCURRENT-FRAG-2
RUN_ENV='CHANGELOG_MERGE_TEST_CONCURRENT_AT=after_displace'; run; rc=$?; RUN_ENV=
tx="$(tx_latest)"
check '[ "$rc" = 3 ] && grep -q "^# CONCURRENT$" "$SBX/docs/CHANGELOG.md"' "退避後の並行作成をatomic no-clobberで保護"
check 'grep -q "^# CHANGELOG test$" "$tx/changelog.displaced" && grep -q "^## CONCURRENT-FRAG-2$" "$tx/published.image"' "no-clobber競合時も全版を保持"

echo "【symlink fragment】"
setup; frag 20260730_empty_swap.md EMPTY-SWAP
RUN_ENV='CHANGELOG_MERGE_TEST_EMPTY_AT=before_quarantine'; run; rc=$?; RUN_ENV=
tx="$(tx_latest)"
check '[ "$rc" = 2 ] && [ -f "$SBX/docs/changelog.d/20260730_empty_swap.md" ] && [ -f "$tx/quarantine/1.frag" ]' "validation後の空regular差替えをpost-moveで拒否・保持"
check '! grep -q "^## EMPTY-SWAP$" "$SBX/docs/CHANGELOG.md"' "空regular差替えを誤ってmergeしない"

setup; frag 20260730_snapshot_empty.md SNAPSHOT-EMPTY
RUN_ENV='CHANGELOG_MERGE_TEST_EMPTY_AT=before_snapshot'; run; rc=$?; RUN_ENV=
tx="$(tx_latest)"
check '[ "$rc" = 2 ] && [ -f "$tx/snapshot/1.frag" ] && [ ! -s "$tx/snapshot/1.frag" ]' "copy直前truncateで空snapshotを検出"
check '! grep -q "^## SNAPSHOT-EMPTY$" "$SBX/docs/CHANGELOG.md"' "空snapshotを成功commitしない"

setup
printf '%s\n' '## LINK-TARGET' > "$SBX/docs/target.md"
ln -s ../target.md "$SBX/docs/changelog.d/20260730_link.md"
run; rc=$?
check '[ "$rc" = 2 ] && [ -L "$SBX/docs/changelog.d/20260730_link.md" ] && [ ! -e "$SBX/docs/.changelog_merge.txn."* ]' "relative symlink断片を移動前にfail closed"

setup
ln -s ../missing.md "$SBX/docs/changelog.d/20260730_dangling.md"
run; rc=$?
check '[ "$rc" = 2 ] && [ -L "$SBX/docs/changelog.d/20260730_dangling.md" ]' "dangling symlink断片も黙って無視せずfail closed"

setup; frag 20260730_swap.md SWAP
printf '%s\n' '## SWAP-TARGET' > "$SBX/docs/target.md"
RUN_ENV='CHANGELOG_MERGE_TEST_SYMLINK_AT=before_quarantine'; run; rc=$?; RUN_ENV=
tx="$(tx_latest)"
check '[ "$rc" = 2 ] && [ -L "$SBX/docs/changelog.d/20260730_swap.md" ] && [ -L "$tx/quarantine/1.frag" ]' "validation後のsymlink差替えをpost-move検出し双方保持"
check '! grep -q "^## SWAP-TARGET$" "$SBX/docs/CHANGELOG.md"' "symlink差替えtargetを誤ってmergeしない"

setup; frag 20260730_swap_crash.md SWAP-CRASH
printf '%s\n' '## SWAP-CRASH-TARGET' > "$SBX/docs/target.md"
RUN_ENV='CHANGELOG_MERGE_TEST_SYMLINK_AT=before_quarantine CHANGELOG_MERGE_TEST_CRASH_AT=after_restore_link'; run; rc=$?; RUN_ENV=
tx="$(tx_latest)"
check '[ "$rc" = 101 ] && [ -L "$SBX/docs/changelog.d/20260730_swap_crash.md" ] && [ -L "$tx/quarantine/1.frag" ]' "symlink復元直後crashでhard-link双方を保持"
run; rc=$?
check '[ "$rc" = 2 ] && [ "$(cat "$tx/state")" = aborted ] && [ -L "$SBX/docs/changelog.d/20260730_swap_crash.md" ]' "物理symlink inode一致でcrash後復元を再開"

echo "【open fd post-rename write】"
setup; frag 20260730_fd.md FD
ready="$SBX/ready"; go="$SBX/go"
(
  exec 9>> "$SBX/docs/changelog.d/20260730_fd.md"
  : > "$ready"
  while [ ! -f "$go" ]; do sleep 0.02; done
  printf '%s\n' 'LATE-OPEN-FD-WRITE' >&9
) &
writer=$!
while [ ! -f "$ready" ]; do sleep 0.02; done
run; rc=$?
tx="$(tx_latest)"
: > "$go"; wait "$writer"
check '[ "$rc" = 0 ] && grep -q LATE-OPEN-FD-WRITE "$tx/quarantine/1.frag"' "open fd後書込を永続quarantineに保持"
check '! grep -q LATE-OPEN-FD-WRITE "$SBX/docs/CHANGELOG.md"' "snapshot後書込を誤って連結しない"

echo "【concurrent CHANGELOGをrollbackで上書きしない】"
printf '%s\n' '# CONCURRENT-NEWER' > "$SBX/docs/CHANGELOG.md"
run; rc=$?
check '[ "$rc" = 0 ] && grep -q CONCURRENT-NEWER "$SBX/docs/CHANGELOG.md"' "commit後にrollback経路なし"

check 'grep -qF "docs/.changelog_merge.txn.*/" "$DIR/../.gitignore" && grep -qF "docs/.changelog_merge.lock/" "$DIR/../.gitignore"' "永続transactionとlockはgitignore"
check '[ "$REAL_SIZE" = "$(wc -c < "$REAL_CHANGELOG" | tr -d " ")" ]' "repo原本CHANGELOG不変"
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ]
