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
check '[ "$rc" = 0 ] && [ ! -d "$SBX/docs/.changelog_merge.lock" ]' "lock取得クリティカル区間のsignalでstale lockを残さない"

echo "【same-filesystem保証】"
setup; frag 20260730_crossfs.md CROSSFS
mkdir -p "$SBX/bin"
printf '%s\n' '#!/usr/bin/env bash' 'exit 18' > "$SBX/bin/ln"
chmod +x "$SBX/bin/ln"
before="$(cat "$SBX/docs/CHANGELOG.md")"
RUN_ENV="PATH=$SBX/bin:$PATH"; run; rc=$?; RUN_ENV=
check '[ "$rc" != 0 ] && [ -f "$SBX/docs/changelog.d/20260730_crossfs.md" ] && [ "$before" = "$(cat "$SBX/docs/CHANGELOG.md")" ]' "hard-link probe失敗は変更前にfail closed"

echo "【commit前crash recovery】"
setup; frag 20260730_pre.md PRE
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine'; run; rc=$?; RUN_ENV=
check '[ "$rc" = 97 ] && [ "$(state)" = prepared ]' "quarantine後crashを保持"
check '[ -f "$(tx_latest)/quarantine/1.frag" ]' "crash後も元断片保持"
run; rc=$?
check '[ "$rc" = 0 ] && [ "$(grep -c "^## PRE$" "$SBX/docs/CHANGELOG.md")" = 1 ]' "次回にatomic復元後1回だけmerge"

echo "【atomic no-clobber recovery】"
setup; frag 20260730_race.md ORIGINAL
RUN_ENV='CHANGELOG_MERGE_TEST_CRASH_AT=after_quarantine'; run; rc=$?; RUN_ENV=
printf '%s\n' '## NEW-LIVE' > "$SBX/docs/changelog.d/20260730_race.md"
oldtx="$(tx_latest)"
run; rc=$?
check '[ "$rc" = 3 ]' "同名live競合はrc3"
check 'grep -q NEW-LIVE "$SBX/docs/changelog.d/20260730_race.md"' "新liveを上書きしない"
check 'grep -q ORIGINAL "$oldtx/quarantine/1.frag"' "quarantine原本も保持"

echo "【commit境界crash / signal】"
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
