#!/usr/bin/env bash
# changelog_merge.sh — changelog断片を永続transactionで安全に連結する。
# Bash 3.2+ / network不使用。CHANGELOGの同一FS renameだけをcommit pointとする。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGELOG="$REPO_ROOT/docs/CHANGELOG.md"
FRAG_DIR="$REPO_ROOT/docs/changelog.d"
POSITION=end
DRY_RUN=no
TEST_MODE=no
LOCK=""
LOCK_HELD=no
PENDING_SIGNAL=""

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
    --test-mode) TEST_MODE=yes; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
done
case "$POSITION" in end|top) : ;; *) echo "--position は end / top のみ" >&2; exit 2 ;; esac
CHANGELOG_DIR="$(cd "$(dirname "$CHANGELOG")" && pwd)" || exit 1
CHANGELOG_ABS="$CHANGELOG_DIR/$(basename "$CHANGELOG")"
[ ! -L "$CHANGELOG_ABS" ] || { echo "symlink CHANGELOGは参照先を安全に公開できないため拒否: $CHANGELOG_ABS" >&2; exit 2; }
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
defer_signal() {
  [ -n "$PENDING_SIGNAL" ] || PENDING_SIGNAL="$1"
}
trap release_lock EXIT

# lock取得クリティカル区間ではsignalを記録し、owner確立後に処理する。
trap 'defer_signal INT' INT
trap 'defer_signal TERM' TERM
trap 'defer_signal HUP' HUP
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "排他lockが存在するため中止（active/staleを自動判定しない）: $LOCK" >&2
  echo "実行プロセスが無いことを人間が確認してからlockを除去すること。" >&2
  exit 3
fi
LOCK_HELD=yes
printf '%s\n' "$$" > "$LOCK/owner" || exit 1
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_SIGNAL_AT:-}" = lock_acquired ] && kill -TERM "$$"
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP' HUP
[ -z "$PENDING_SIGNAL" ] || on_signal "$PENDING_SIGNAL"

write_state() {
  local dir="$1" value="$2" tmp="$1/state.tmp.$$"
  printf '%s\n' "$value" > "$tmp" || return 1
  [ "$TEST_MODE" = yes ] && [ "$value" = initializing ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_initial_state_tmp ] && {
    echo "test crash after_initial_state_tmp" >&2
    exit 103
  }
  mv -f "$tmp" "$dir/state"
}

is_pristine_transaction() {
  local tx="$1" listing count
  listing=$(LC_ALL=C ls -A "$tx" 2>/dev/null) || return 1
  [ -z "$listing" ] && return 0
  count=$(printf '%s\n' "$listing" | wc -l | tr -d ' ')
  [ "$count" = 1 ] || return 1
  case "$listing" in state.tmp.[0-9]*) return 0 ;; *) return 1 ;; esac
}

write_path() {
  local tx="$1" n="$2" value="$3" tmp="$1/paths/$2.path.tmp.$$"
  printf '%s\n' "$value" > "$tmp" || return 1
  [ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_path_tmp ] && [ "$n" = 1 ] && {
    echo "test crash after_path_tmp" >&2
    exit 104
  }
  mv -f "$tmp" "$tx/paths/$n.path"
}
write_target() {
  local tx="$1" value="$2" tmp="$1/target.tmp.$$"
  printf '%s\n' "$value" > "$tmp" || return 1
  [ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_target_tmp ] && {
    echo "test crash after_target_tmp" >&2
    exit 105
  }
  mv -f "$tmp" "$tx/target"
}

# quarantineから元パスへの復元はhard-link作成をcommit pointにする。
# lnは宛先が既存なら失敗するため、check-then-move raceも上書きも無い。
same_inode() {
  local a="$1" b="$2" ai bi
  if [ -L "$a" ] || [ -L "$b" ]; then
    [ -L "$a" ] && [ -L "$b" ] || return 1
    ai=$(LC_ALL=C ls -di "$a" 2>/dev/null) || return 1
    bi=$(LC_ALL=C ls -di "$b" 2>/dev/null) || return 1
    ai=${ai%%[[:space:]]*}
    bi=${bi%%[[:space:]]*}
    [ -n "$ai" ] && [ "$ai" = "$bi" ]
  else
    [ -e "$a" ] && [ "$a" -ef "$b" ]
  fi
}
restore_precommit() {
  local tx="$1" failed=no n=1 p q
  while [ -f "$tx/paths/$n.path" ]; do
    IFS= read -r p < "$tx/paths/$n.path" || failed=yes
    q="$tx/quarantine/$n.frag"
    if [ -e "$q" ] || [ -L "$q" ]; then
      if same_inode "$p" "$q"; then
        : # 前回の部分復元で作成済み。quarantine inodeは永続保持する。
      elif { [ -L "$q" ] && ln -P "$q" "$p" 2>/dev/null; } ||
           { [ ! -L "$q" ] && ln "$q" "$p" 2>/dev/null; }; then
        : # 全復元成功後もopen FD追記を失わないようhard-linkを保持する。
        [ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_restore_link ] && { echo "test crash after_restore_link" >&2; exit 101; }
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
  local tx state target
  for tx in "$CHANGELOG_DIR"/.changelog_merge.txn.*; do
    [ -d "$tx" ] || continue
    if [ ! -f "$tx/state" ]; then
      if is_pristine_transaction "$tx"; then
        rm -f "$tx"/state.tmp.[0-9]* 2>/dev/null || return 3
        rmdir "$tx" || return 3
        echo "初期化前の空transactionを除去: $tx" >&2
        continue
      fi
      echo "状態不明transaction: $tx" >&2
      return 3
    fi
    IFS= read -r state < "$tx/state" || return 3
    case "$state" in
      committed|aborted) continue ;;
      initializing)
        if [ -f "$tx/target" ]; then
          IFS= read -r target < "$tx/target" || return 3
          [ "$target" = "$CHANGELOG_ABS" ] || continue
        fi
        write_state "$tx" aborted || return 3
        echo "初期化中transactionを中止状態へ確定: $tx" >&2
        continue
        ;;
    esac
    [ -f "$tx/target" ] || { echo "対象不明transaction: $tx" >&2; return 3; }
    IFS= read -r target < "$tx/target" || return 3
    [ "$target" = "$CHANGELOG_ABS" ] || continue
    case "$state" in
      preparing|prepared)
        echo "未commit transactionを復元: $tx" >&2
        restore_precommit "$tx" || { echo "自動復元不能。transactionを保持: $tx" >&2; return 3; }
        ;;
      publishing)
        if [ -f "$tx/published.image" ] && [ -f "$CHANGELOG_ABS" ] && cmp -s "$CHANGELOG_ABS" "$tx/published.image"; then
          write_state "$tx" committed || return 3
          echo "commit済みtransactionを確定: $tx" >&2
        elif [ ! -e "$tx/changelog.displaced" ] && [ -f "$CHANGELOG_ABS" ] &&
             [ "$CHANGELOG_ABS" -ef "$tx/changelog.before.link" ] && cmp -s "$CHANGELOG_ABS" "$tx/changelog.before"; then
          restore_precommit "$tx" || { echo "公開前transactionを復元不能: $tx" >&2; return 3; }
        elif [ ! -e "$CHANGELOG_ABS" ] && [ -f "$tx/changelog.displaced" ]; then
          ln "$tx/changelog.displaced" "$CHANGELOG_ABS" 2>/dev/null || return 3
          restore_precommit "$tx" || { echo "公開前transactionを復元不能: $tx" >&2; return 3; }
        elif [ -f "$tx/changelog.displaced" ] && cmp -s "$CHANGELOG_ABS" "$tx/changelog.displaced"; then
          restore_precommit "$tx" || { echo "公開前transactionを復元不能: $tx" >&2; return 3; }
        else
          echo "CHANGELOG競合または曖昧なpublish state。全版を保持: $tx" >&2
          return 3
        fi
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
if [ "$DRY_RUN" = yes ]; then
  for tx in "$CHANGELOG_DIR"/.changelog_merge.txn.*; do
    [ -d "$tx" ] || continue
    if [ ! -f "$tx/state" ]; then
      is_pristine_transaction "$tx" && continue
      echo "--dry-run: 状態不明transactionを変更せず中止: $tx" >&2
      exit 3
    fi
    IFS= read -r state < "$tx/state" || exit 3
    case "$state" in
      committed|aborted) ;;
      initializing)
        if [ -f "$tx/target" ]; then
          IFS= read -r target < "$tx/target" || exit 3
          [ "$target" = "$CHANGELOG_ABS" ] || continue
        fi
        echo "--dry-run: 残存transactionを変更せず中止 ($state): $tx" >&2; exit 3
        ;;
      *)
        [ -f "$tx/target" ] || { echo "--dry-run: 対象不明transactionを変更せず中止: $tx" >&2; exit 3; }
        IFS= read -r target < "$tx/target" || exit 3
        [ "$target" = "$CHANGELOG_ABS" ] || continue
        echo "--dry-run: 残存transactionを変更せず中止 ($state): $tx" >&2
        exit 3
        ;;
    esac
  done
else
  recover_transactions || exit $?
fi

[ -f "$CHANGELOG" ] || { echo "CHANGELOG がない: $CHANGELOG" >&2; exit 2; }
[ -r "$CHANGELOG" ] || { echo "CHANGELOG を読めない: $CHANGELOG" >&2; exit 1; }
[ -d "$FRAG_DIR" ] || { echo "断片ディレクトリがない: $FRAG_DIR → 何もしない"; exit 0; }
FRAG_DIR="$(cd "$FRAG_DIR" && pwd)" || exit 1

FRAGS=$(printf '%s\n' "$FRAG_DIR"/*.md 2>/dev/null |
  while IFS= read -r f; do
    [ -f "$f" ] || [ -L "$f" ] || continue
    [ "$(basename "$f")" = README.md ] && continue
    printf '%s\n' "$f"
  done | LC_ALL=C sort)
[ -n "$FRAGS" ] || { echo "断片なし（${FRAG_DIR}）→ 何もしない"; exit 0; }

echo "連結する断片（この順）:"
printf '%s\n' "$FRAGS" | while IFS= read -r f; do echo "  - $(basename "$f")"; done

bad=no
while IFS= read -r f; do
  if [ -L "$f" ]; then
    echo "symlink断片は安全にquarantineできないため拒否: $f" >&2
    bad=symlink
    continue
  fi
  grep -q '[^[:space:]]' "$f" 2>/dev/null
  case "$?" in
    0) ;;
    1) echo "空（または空白のみ）の断片: $f" >&2; bad=blank ;;
    *) echo "断片を読めない: $f" >&2; bad=io ;;
  esac
done <<EOF
$FRAGS
EOF
[ "$bad" = no ] || { case "$bad" in blank|symlink) exit 2 ;; *) exit 1 ;; esac; }
[ "$DRY_RUN" = yes ] && { echo "--dry-run のため書き換えない（断片も削除しない）"; exit 0; }

TX="$(mktemp -d "$CHANGELOG_DIR/.changelog_merge.txn.XXXXXX")" || exit 1
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_mktemp ] && { echo "test crash after_mktemp" >&2; exit 102; }
write_state "$TX" initializing || exit 1
write_target "$TX" "$CHANGELOG_ABS" || exit 1
mkdir "$TX/quarantine" "$TX/snapshot" "$TX/paths" || exit 1
ln "$CHANGELOG_ABS" "$TX/changelog.before.link" || exit 1
cp -p "$TX/changelog.before.link" "$TX/changelog.before" || exit 1
write_state "$TX" preparing || exit 1

n=1
while IFS= read -r f; do
  write_path "$TX" "$n" "$f" || exit 1
  # hard-link probeはsame-deviceでだけ成功する。cross-FSのmv(copy+unlink)を禁止する。
  if ! ln "$f" "$TX/.same-fs-probe" 2>/dev/null; then
    echo "断片とCHANGELOGが同一filesystemでないためatomic quarantine不能: $f" >&2
    restore_precommit "$TX" || exit 3
    exit 1
  fi
  rm -f "$TX/.same-fs-probe" || exit 1
  if [ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_SYMLINK_AT:-}" = before_quarantine ] && [ "$n" = 1 ]; then
    rm -f "$f" && ln -s ../target.md "$f"
  fi
  if [ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_EMPTY_AT:-}" = before_quarantine ] && [ "$n" = 1 ]; then
    : > "$f"
  fi
  if ! mv "$f" "$TX/quarantine/$n.frag"; then
    echo "断片のquarantine移動に失敗: $f" >&2
    restore_precommit "$TX" || exit 3
    exit 1
  fi
  if [ -L "$TX/quarantine/$n.frag" ]; then
    echo "quarantine直前にsymlinkへ変更された断片を拒否: $f" >&2
    restore_precommit "$TX" || exit 3
    exit 2
  fi
  if [ ! -f "$TX/quarantine/$n.frag" ]; then
    echo "quarantine直前に非regularへ変更された断片を拒否: $f" >&2
    restore_precommit "$TX" || exit 3
    exit 2
  fi
  if [ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_EMPTY_AT:-}" = before_snapshot ] && [ "$n" = 1 ]; then
    : > "$TX/quarantine/$n.frag"
  fi
  cp -p "$TX/quarantine/$n.frag" "$TX/snapshot/$n.frag" || {
    restore_precommit "$TX" || exit 3
    exit 1
  }
  if [ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_REPLACE_AT:-}" = after_snapshot ] && [ "$n" = 1 ]; then
    printf '%s\n' '## REPLACED-COMPLETE' > "$TX/quarantine/$n.frag"
  fi
  [ -f "$TX/snapshot/$n.frag" ] || { restore_precommit "$TX" || exit 3; exit 1; }
  grep -q '[^[:space:]]' "$TX/snapshot/$n.frag" 2>/dev/null
  rc=$?
  if [ "$rc" != 0 ]; then
    echo "snapshot断片が空または読取不能のため拒否: $f" >&2
    restore_precommit "$TX" || exit 3
    [ "$rc" = 1 ] && exit 2 || exit 1
  fi
  if ! cmp -s "$TX/snapshot/$n.frag" "$TX/quarantine/$n.frag"; then
    echo "snapshot作成中の断片変更を検出。双方を保持: $f" >&2
    restore_precommit "$TX" || exit 3
    exit 3
  fi
  n=$((n + 1))
done <<EOF
$FRAGS
EOF
COUNT=$((n - 1))
write_state "$TX" prepared || exit 1

[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_quarantine ] && { echo "test crash after_quarantine" >&2; exit 97; }

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

# 旧版を退避して同一inodeを検証し、新版をno-clobberで公開する。
# 非協調writerが間に作成した版は上書きせず、transaction内の全版も保持する。
write_state "$TX" publishing || exit 1
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = before_commit ] && { echo "test crash before_commit" >&2; exit 98; }
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CONCURRENT_AT:-}" = before_publish ] && printf '%s\n' '# CONCURRENT' > "$CHANGELOG_ABS"
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CHANGELOG_SYMLINK_AT:-}" = before_displace ] && {
  rm -f "$CHANGELOG_ABS" && ln -s "$TX/changelog.before.link" "$CHANGELOG_ABS"
}
if ! mv "$CHANGELOG_ABS" "$TX/changelog.displaced"; then
  echo "CHANGELOG退避に失敗。transactionを保持: $TX" >&2
  exit 1
fi
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_displace ] && { echo "test crash after_displace" >&2; exit 100; }
if [ -L "$TX/changelog.displaced" ]; then
  ln -P "$TX/changelog.displaced" "$CHANGELOG_ABS" 2>/dev/null || :
  echo "CHANGELOGが公開直前にsymlinkへ変更されたため拒否。双方を保持: $TX" >&2
  exit 3
fi
if [ ! "$TX/changelog.displaced" -ef "$TX/changelog.before.link" ] || ! cmp -s "$TX/changelog.displaced" "$TX/changelog.before"; then
  ln "$TX/changelog.displaced" "$CHANGELOG_ABS" 2>/dev/null || :
  echo "CHANGELOGの並行編集を検出。競合版とtransactionを保持: $TX" >&2
  exit 3
fi
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CONCURRENT_AT:-}" = after_displace ] && printf '%s\n' '# CONCURRENT' > "$CHANGELOG_ABS"
if ! ln "$NEW" "$CHANGELOG_ABS" 2>/dev/null; then
  echo "CHANGELOG公開先に並行版を検出。全版を保持: $TX" >&2
  exit 3
fi
write_state "$TX" committing || {
  echo "CHANGELOG commit済みだがstate確定に失敗。transactionを保持: $TX" >&2
  exit 1
}
if ! rm -f "$NEW"; then
  echo "CHANGELOG commitに失敗。transactionを保持: $TX" >&2
  exit 1
fi
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_CRASH_AT:-}" = after_commit ] && { echo "test crash after_commit" >&2; exit 99; }
[ "$TEST_MODE" = yes ] && [ "${CHANGELOG_MERGE_TEST_SIGNAL_AT:-}" = after_commit ] && kill -TERM "$$"
write_state "$TX" committed || {
  echo "commit済みだがstate確定に失敗。次回判定用transactionを保持: $TX" >&2
  exit 1
}

echo "連結完了。元断片inodeと復旧情報を永続保持: $TX"
exit 0
