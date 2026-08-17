#!/usr/bin/env bash
# =============================================================================
# land.sh — repo 直下に現れた *.bundle を自動で origin へ push する [LAND-BUNDLE-001]
#
#   なぜ要るか（2026-08-17 実測）:
#     cloud サンドボックスから GitHub への push は全遮断（PAT も不可）なので、
#     変更は必ず作者の端末を経由する。#853 ではこの受け渡しで **3回失敗し約95分**を捨てた
#     （プレースホルダ混入・repo パス誤り・checkout 衝突）。206分のスライスの 46% がここ。
#
#   この常駐スクリプトが受け持つもの:
#     作者は**セッション開始時に1回起動しておくだけ**。
#     cowork は bundle を repo 直下に置く（device_commit_files）＝**作者の操作はゼロ**。
#     land.sh が verify → fetch → push → _landed/ へ退避 までを自動でやる。
#
#   ★ 作業ツリーには一切触らない（checkout も merge もしない）。
#     やるのは「bundle から一時 ref へ fetch」→「その ref を origin へ push」だけ。
#     作者機が production 系や release 枝に居ても衝突しない（#853 の失敗3のクラス）。
#
# 使い方:
#   bash scripts/land.sh                    # 常駐（Ctrl-C で終了）。起動時に既にある bundle は無視
#   bash scripts/land.sh --once             # 1巡だけ見て終了
#   bash scripts/land.sh --include-existing # 起動時に既にある bundle も対象にする
#   bash scripts/land.sh --dry-run          # push しない（何をするかだけ出す）
#   bash scripts/land.sh --repo <path>      # 対象 repo を明示（既定=カレントの git top level）
#   POLL=1 bash scripts/land.sh             # 監視間隔（秒・既定2）
#   ALLOW_PROTECTED=1 ...                   # 保護枝への push を許す（既定は拒否）
#
# 強制 push:
#   既定は fast-forward の push だけ。巻き戻す必要があるときは cowork が
#   `<name>.bundle.force` という空ファイルを同じ場所に置く（bundle と2つ）。
#   その時だけ `--force` を使い、**上書きされた旧 SHA をログに残す**。
#
# 信頼境界（起動する前に理解しておくこと）:
#   これを起動している間、**この repo フォルダに bundle を書ける主体は、非保護枝を1本
#   origin に push できる**（cowork がまさにそれをする）。
#   受けている歯止めは3つ: ①保護枝へは push しない ②既定は fast-forward だけ
#   ③本流へ入れるのは PR ＋作者の承認語（land.sh は PR を作らないしマージもしない）。
#   席を離れるときは Ctrl-C で止めればよい。
#
# 既知の限界:
#   - 1本の bundle に複数の枝が入っていて途中で push が失敗した場合、**先に成功した枝は
#     origin に残る**（ログには出る）。cowork が作る bundle は常に1枝。
#
# 安全:
#   - 保護枝（production / 開発本流 / main / master）へは push しない（ALLOW_PROTECTED=1 で解除）
#   - 書き込み途中の bundle を掴まないよう、サイズが2回続けて同じになるまで待つ
#   - `git bundle verify` に通らないものは push しない（`.failed` へ改名して残す）
#   - push に失敗したものも `.failed` へ改名し、**手で叩ける復旧コマンドをそのまま出す**
#
# 依存: bash 3.2+（macOS 既定）/ git。network は push のときだけ使う。
# 終了コード: 0=正常終了 / 2=前提不備（repo でない・origin が無い等）
# =============================================================================
set -u

POLL="${POLL:-2}"
ONCE=0
INCLUDE_EXISTING=0
DRY_RUN=0
REPO_ARG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --once) ONCE=1 ;;
    --include-existing) INCLUDE_EXISTING=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --repo) shift; [ $# -gt 0 ] || { echo "--repo に値が無い" >&2; exit 2; }; REPO_ARG="$1" ;;
    -h|--help) sed -n '1,45p' "$0"; exit 0 ;;
    *) echo "不明な引数: $1（--help 参照）" >&2; exit 2 ;;
  esac
  shift
done

# --- repo を決める -----------------------------------------------------------
if [ -n "$REPO_ARG" ]; then
  [ -d "$REPO_ARG" ] || { echo "repo が無い: $REPO_ARG" >&2; exit 2; }
  REPO="$(cd "$REPO_ARG" && git rev-parse --show-toplevel 2>/dev/null)" || REPO=""
else
  REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || REPO=""
fi
[ -n "$REPO" ] || { echo "git work tree の中で実行するか --repo <path> を渡すこと" >&2; exit 2; }
cd "$REPO" || exit 2

git remote get-url origin >/dev/null 2>&1 || { echo "origin が無い: $REPO" >&2; exit 2; }
ORIGIN_URL="$(git remote get-url origin 2>/dev/null)"

LANDED="$REPO/_landed"
LOG="$LANDED/land.log"
mkdir -p "$LANDED" || exit 2

# 保護枝（ここへは push しない）。開発本流も PR 経由が原則なので入れてある。
# ★ 枝名を変えたらここも変えること（変えないと**黙って守られなくなる**）。
#   一時的に別の集合にしたいときは PROTECTED_BRANCHES で上書きする。
PROTECTED="${PROTECTED_BRANCHES:-production chore/shogi-tour-apphq-003h-2d-orphan-clean-base main master}"

say() {
  # 画面とログの両方へ。時刻を付ける（後から「いつ着地したか」を追えるように）
  _m="[$(date '+%H:%M:%S')] $*"
  echo "$_m"
  echo "$_m" >> "$LOG" 2>/dev/null
}

# 既に見たもの（起動時にあった bundle・処理済みで名前が残るもの）を改行区切りで持つ
SEEN=""
mark_seen() { SEEN="$SEEN
$1"; }
is_seen() {
  case "
$SEEN
" in *"
$1
"*) return 0 ;; esac
  return 1
}

is_protected() {
  for _p in $PROTECTED; do [ "$_p" = "$1" ] && return 0; done
  return 1
}

# BSD(macOS) と GNU で違う stat
# ★ 罠: GNU stat の `-f` は --file-system。`stat -f %z file` は**成功して別の値**を返すので、
#   「BSD を先に試して失敗したら GNU」と書くと Linux で常に嘘のサイズを掴み、
#   「書き込み途中を掴まない」保護が黙って死ぬ（2026-08-17 に実測）。
#   → GNU を先に試し、数字でなければ BSD を試し、それでも数字でなければ空を返す。
fsize() {
  _v="$(stat -c %s "$1" 2>/dev/null)"
  case "$_v" in ''|*[!0-9]*) _v="$(stat -f %z "$1" 2>/dev/null)" ;; esac
  case "$_v" in ''|*[!0-9]*) _v="" ;; esac
  echo "$_v"
}

# --- 起動時のスナップショット -------------------------------------------------
PRE=0
for b in "$REPO"/*.bundle; do
  [ -e "$b" ] || continue
  if [ "$INCLUDE_EXISTING" -eq 0 ]; then
    mark_seen "$(basename "$b")"
    PRE=$((PRE+1))
  fi
done

echo "=========================================="
echo "  land.sh — bundle 自動着地 [LAND-BUNDLE-001]"
echo "=========================================="
say "repo   : $REPO"
say "origin : $ORIGIN_URL"
say "監視   : $REPO/*.bundle（${POLL}秒ごと）"
if [ "$PRE" -gt 0 ]; then
  say "起動時に既にあった bundle ${PRE}本は**対象外**（過去の受け渡しの残骸を勝手に push しないため）"
  say "  → それも流したいなら: bash scripts/land.sh --include-existing"
fi
[ "$DRY_RUN" -eq 1 ] && say "★ dry-run: push はしない"
say "保護枝（push しない）: $PROTECTED"
echo "  Ctrl-C で終了"
echo "------------------------------------------"

STOP=0
trap 'STOP=1; echo; say "終了します"' INT TERM

fail_out() {
  # fail_out <bundle> <理由...>
  _b="$1"; shift
  say "NG   $(basename "$_b") — $*"
  mv "$_b" "$_b.failed" 2>/dev/null && say "     → $(basename "$_b").failed へ改名（中身は残してある）"
  mark_seen "$(basename "$_b")"
}

process_one() {
  _b="$1"
  _name="$(basename "$_b")"

  # 1) 書き込み途中を掴まない: サイズが2回続けて同じになるまで待つ
  _s1="$(fsize "$_b")"
  sleep 1
  _s2="$(fsize "$_b")"
  if [ "$_s1" != "$_s2" ] || [ -z "$_s2" ] || [ "$_s2" = "0" ]; then
    # まだ書き込み中。常駐なら次の巡で拾えるが、--once では**黙って落とさない**
    [ "$ONCE" -eq 1 ] && say "保留 $_name — まだ書き込み中に見える（size $_s1→$_s2）。--once なので今回は見送り"
    return 0
  fi

  say "検出 $_name（${_s2} bytes）"

  # 2) bundle として妥当か（前提コミットが手元にあるかもここで分かる）
  if ! git bundle verify "$_b" >/dev/null 2>&1; then
    _v="$(git bundle verify "$_b" 2>&1 | tr '\n' ' ')"
    fail_out "$_b" "git bundle verify に通らない: $_v"
    return 0
  fi

  # 3) 中の refs/heads/* を列挙
  _heads="$(git bundle list-heads "$_b" 2>/dev/null | awk '$2 ~ /^refs\/heads\// {print $2}')"
  if [ -z "$_heads" ]; then
    fail_out "$_b" "refs/heads/* が入っていない（list-heads が空）"
    return 0
  fi

  _force=0
  [ -f "$_b.force" ] && _force=1

  _ok=1
  for _ref in $_heads; do
    _branch="${_ref#refs/heads/}"
    if is_protected "$_branch" && [ "${ALLOW_PROTECTED:-0}" != "1" ]; then
      fail_out "$_b" "保護枝 '$_branch' への push は既定で拒否（PR 経由にすること・どうしてもなら ALLOW_PROTECTED=1）"
      return 0
    fi

    # 4) 一時 ref へ fetch（作業ツリーには触らない）
    _tmpref="refs/land/$_branch"
    if ! git fetch "$_b" "+$_ref:$_tmpref" >/dev/null 2>&1; then
      fail_out "$_b" "bundle からの fetch に失敗（$_ref）"
      return 0
    fi
    _sha="$(git rev-parse "$_tmpref" 2>/dev/null)"
    _old="$(git ls-remote origin "$_ref" 2>/dev/null | awk '{print $1}')"
    [ -n "$_old" ] || _old="(新規)"

    if [ "$DRY_RUN" -eq 1 ]; then
      say "     dry-run: git push origin $_tmpref:$_ref  （$_old → $_sha）"
      continue
    fi

    # 5) push
    if [ "$_force" -eq 1 ]; then
      say "     ★ force 指定（$_name.force あり）: $_branch を $_old → $_sha で上書きする"
      _out="$(git push --force origin "$_tmpref:$_ref" 2>&1)"; _rc=$?
    else
      _out="$(git push origin "$_tmpref:$_ref" 2>&1)"; _rc=$?
    fi

    if [ "$_rc" -ne 0 ]; then
      _ok=0
      say "NG   $_name — push 失敗（$_branch）"
      echo "$_out" | sed 's/^/       /'
      echo "$_out" | sed 's/^/       /' >> "$LOG" 2>/dev/null
      say "     早戻り（fast-forward でない）なら、意図した上書きか確かめてから:"
      say "       cd $REPO && git push --force origin $_tmpref:$_ref"
      say "     cowork 側からやるなら bundle と一緒に $_name.force を置くこと"
      fail_out "$_b" "push 失敗"
      return 0
    fi
    say "OK   $_branch ← $_sha（前: $_old）"
    # push できた時点で origin に載っているので、一時 ref は消す（.git を太らせない）。
    # 失敗時は残す — 上に出した復旧コマンドがこの ref を指しているため。
    git update-ref -d "$_tmpref" 2>/dev/null
  done

  if [ "$_ok" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
    mv "$_b" "$LANDED/$_name" 2>/dev/null && say "     → _landed/$_name へ退避"
    [ -f "$_b.force" ] && mv "$_b.force" "$LANDED/$_name.force" 2>/dev/null
  fi
  mark_seen "$_name"
  return 0
}

scan_once() {
  for _b in "$REPO"/*.bundle; do
    [ -e "$_b" ] || continue
    is_seen "$(basename "$_b")" && continue
    process_one "$_b"
  done
}

if [ "$ONCE" -eq 1 ]; then
  scan_once
  say "--once: 1巡して終了"
  exit 0
fi

while [ "$STOP" -eq 0 ]; do
  scan_once
  [ "$STOP" -eq 1 ] && break
  sleep "$POLL"
done
exit 0
