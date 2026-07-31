#!/usr/bin/env bash
# changelog_merge.sh — changelog断片を永続transactionで安全に連結する。
# Bash 3.2+ / network不使用。CHANGELOGの同一FS renameだけをcommit pointとする。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGELOG="$REPO_ROOT/docs/CHANGELOG.md"
FRAG_DIR="$REPO_ROOT/docs/changelog.d"
POSITION=end
DRY_RUN=no
LOCK=""
LOCK_HELD=no

usage() {
  echo "usage: changelog_merge.sh [--dry-run] [--position end|top] [--changelog PATH] [--fragments DIR]"
}
need_value() { [ "$#" -ge 2 ] && [ -n "$2" ] || { echo "$1 には値が必要" >&2; exit 2; }; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=yes; shift ;;
    --position) need_value "$@"; POSITION="$2"; shift 2 ;;
    --changelog) need_value "$@"; CHANGELOG="$2"; shift 2 ;;
    --fragments) need_value "$@"; FRAG_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
done
case "$POSITION" in end|top) : ;; *) echo "--position は end / top のみ" >&2; exit 2 ;; esac
[ -f "$CHANGELOG" ] || { echo "CHANGELOG がない: $CHANGELOG" >&2; exit 2; }
[ -r "$CHANGELOG" ] || { echo "CHANGELOG を読めない: $CHANGELOG" >&2; exit 1; }
[ -d "$FRAG_DIR" ] || { echo "断片ディレクトリがない: $FRAG_DIR → 何もしない"; exit 0; }

CHANGELOG_DIR="$(cd "$(dirname "$CHANGELOG")" && pwd)" || exit 1
CHANGELOG_ABS="$CHANGELOG_DIR/$(basename "$CHANGELOG")"
LOCK="$CHANGELOG_DIR/.changelog_merge.lock"
release_lock() {
  if [ "$LOCK_HELD" = yes ]; then
    rm -f "$LOCK/owner" 2>/dev/null || :
    rmdir "$LOCK" 2>/dev/null || :
    LOCK_HELD=no
  fi
}
on_signal() {
  trap '' INT TERM HUP
  echo "シグナル $1: transactionは保持し、次回の安全判定に委ねる" >&2
  exit 1
}
trap release_lock EXIT

# lock取得クリティカル区間ではsignalを一時保留し、owner無しlockを残さない。
trap '' INT TERM HUP
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "排他lockが存在するため中止（active/staleを自動判定しない）: $LOCK" >&2
  echo "実行プロセスが無いことを人間が確認してからlockを除去すること。" >&2
  exit 3
fi
LOCK_HELD=yes
printf '%s\n' "$$" > "$LOCK/owner" || exit 1
[ "${CHANGELOG_MERGE_TEST_SIGNAL_AT:-}" = lock_acquired ] && kill -TERM "$$"
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP' HUP

write_state() {
  local dir="$1" value="$2" tmp="$1/state.tmp.$$"
  printf '%s\n' "$value" > "$tmp" && mv -f "$tmp" "$dir/state"
}

# quarantineから元パスへの復元はhard-link作成をcommit pointにする。
# lnは宛先が既存なら失敗するため、check-then-move raceも上書きも無い。
restore_precommit() {
  local tx="$1" failed=no n=1 p q
  while [ -f "$tx/paths/$n.path" ]; do
    IFS= read -r p < "$tx/paths/$n.path" || failed=yes
    q="$tx/quarantine/$n.frag"
    if [ -f "$q" ]; then
      if ln "$q" "$p" 2>/dev/null; then
        rm -f "$q" || failed=yes
      else
        failed=yes
        echo "復元先が存在するか復元不能。双方を保持: $p / $q" >&2
      fi
    fi
    n=$((n + 1))
  done
  [ "$failed" = no ] || return 1
  write_state "$tx" aborted
}

# 前回crashの判定。committingだけがcommit境界を跨いだ可能性を持つ。
recover_transactions() {
  local tx state
  for tx in "$CHANGELOG_DIR"/.changelog_merge.txn.*; do
    [ -d "$tx" ] || continue
    [ -f "$tx/state" ] || { echo "状態不明transaction: $tx" >&2; return 3; }
    IFS= read -r state < "$tx/state" || return 3
    case "$state" in
      committed|aborted) ;;
      preparing|prepared)
        echo "未commit transactionを復元: $tx" >&2
        restore_precommit "$tx" || { echo "自動復元不能。transactionを保持: $tx" >&2; return 3; }
        ;;
      committing)
        if [ -f "$tx/published.image" ] && cmp -s "$CHANGELOG_ABS" "$tx/published.image"; then
          write_state "$tx" committed || return 3
          echo "commit済みtransactionを確定: $tx" >&2
        elif [ -f "$tx/changelog.before" ] && cmp -s "$CHANGELOG_ABS" "$tx/changelog.before"; then
          restore_precommit "$tx" || { echo "未commit transactionを復元不能: $tx" >&2; return 3; }
        else
          echo "CHANGELOGがbefore/publishedのどちらとも一致しない。曖昧なcrash state: $tx" >&2
          return 3
        fi
        ;;
      *) echo "未知のtransaction state '$state': $tx" >&2; return 3 ;;
    esac
  done
  return 0
}
recover_transactions || exit $?

FRAGS=$(printf '%s\n' "$FRAG_DIR"/*.md 2>/dev/null |
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" = README.md ] && continue
    printf '%s\n' "$f"
  done | LC_ALL=C sort)
[ -n "$FRAGS" ] || { echo "断片なし（${FRAG_DIR}）→ 何もしない"; exit 0; }

echo "連結する断片（この順）:"
printf '%s\n' "$FRAGS" | while IFS= read -r f; do echo "  - $(basename "$f")"; done

bad=no
while IFS= read -r f; do
  grep -q '[^[:space:]]' "$f" 2>/dev/null
  case "$?" in
    0) ;;
    1) echo "空（または空白のみ）の断片: $f" >&2; bad=blank ;;
    *) echo "断片を読めない: $f" >&2; bad=io ;;
  esac
done <<EOF
$FRAGS
EOF
[ "$bad" = no ] || { [ "$bad" = blank ] && exit 2 || exit 1; }
[ "$DRY_RUN" = yes ] && { echo "--dry-run のため書き換えない（断片も削除しない）"; exit 0; }

TX="$(mktemp -d "$CHANGELOG_DIR/.changelog_merge.txn.XXXXXX")" || exit 1
mkdir "$TX/quarantine" "$TX/snapshot" "$TX/paths" || exit 1
cp -p "$CHANGELOG_ABS" "$TX/changelog.before" || exit 1
write_state "$TX" preparing || exit 1

n=1
while IFS= read -r f; do
  printf '%s\n' "$f" > "$TX/paths/$n.path" || exit 1
  # hard-link probeはsame-deviceでだけ成功する。cross-FSのmv(copy+unlink)を禁止する。
  if ! ln "$f" "$TX/.same-fs-probe" 2>/dev/null; then
    echo "断片とCHANGELOGが同一filesystemでないためatomic quarantine不能: $f" >&2
    restore_precommit "$TX" || exit 3
    exit 1
  fi
  rm -f "$TX/.same-fs-probe" || exit 1
  if ! mv "$f" "$TX/quarantine/$n.frag"; then
    echo "断片のquarantine移動に失敗: $f" >&2
    restore_precommit "$TX" || exit 3
    exit 1
  fi
  cp -p "$TX/quarantine/$n.frag" "$TX/snapshot/$n.frag" || {
    restore_precommit "$TX" || exit 3
    exit 1
  }
  n=$((n + 1))
done <<EOF
$FRAGS
EOF
COUNT=$((n - 1))
write_state "$TX" prepared || exit 1

[ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_quarantine ] && { echo "test crash after_quarantine" >&2; exit 97; }

strip_edges() {
  awk '{ a[NR]=$0; if (NF) { if (!s) s=NR; e=NR } } END { for(i=s;i<=e;i++) print a[i] }' "$1"
}
emit_fragments() {
  local i=1
  while [ "$i" -le "$COUNT" ]; do
    printf '\n'
    strip_edges "$TX/snapshot/$i.frag" || return 1
    i=$((i + 1))
  done
}

NEW="$TX/changelog.new"
cp -p "$CHANGELOG_ABS" "$NEW" || exit 1
if [ "$POSITION" = end ]; then
  strip_edges "$TX/changelog.before" > "$NEW" || exit 1
  emit_fragments >> "$NEW" || exit 1
else
  SPLIT=$(awk '$0=="---"{print NR;exit}' "$TX/changelog.before"); [ -n "$SPLIT" ] || SPLIT=1
  awk -v n="$SPLIT" 'NR<=n' "$TX/changelog.before" > "$NEW" || exit 1
  emit_fragments >> "$NEW" || exit 1
  printf '\n' >> "$NEW"
  awk -v n="$SPLIT" 'NR>n' "$TX/changelog.before" | strip_edges /dev/stdin >> "$NEW" || exit 1
fi
printf '\n' >> "$NEW" || exit 1
[ -s "$NEW" ] || exit 1
cp -p "$NEW" "$TX/published.image" || exit 1

# ここから先はrollbackしない。committing + before/publishedでcrashを判定できる。
write_state "$TX" committing || exit 1
[ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = before_commit ] && { echo "test crash before_commit" >&2; exit 98; }
if ! mv -f "$NEW" "$CHANGELOG_ABS"; then
  echo "CHANGELOG commitに失敗。transactionを保持: $TX" >&2
  exit 1
fi
[ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_commit ] && { echo "test crash after_commit" >&2; exit 99; }
[ "${CHANGELOG_MERGE_TEST_SIGNAL_AT:-}" = after_commit ] && kill -TERM "$$"
write_state "$TX" committed || {
  echo "commit済みだがstate確定に失敗。次回判定用transactionを保持: $TX" >&2
  exit 1
}

echo "連結完了。元断片inodeと復旧情報を永続保持: $TX"
exit 0
