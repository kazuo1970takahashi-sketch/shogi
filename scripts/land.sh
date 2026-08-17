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
#   - 処理する bundle は**専用名へ確保（claim）**してから触る。置き直された修正版を
#     取り違えて未処理のまま退避することがない
#   - `git bundle verify` に通らないものは push しない
#   - 失敗した bundle は **試行ごとに一意な名前**で `_landed/failed/` へ退避し、
#     内容は `refs/land/failed/<sha>` に保持。**手で叩ける復旧コマンド（確定 SHA 指定）**を出す
#   - `--dry-run` は ref を1本も作らない。`--once` は失敗があれば非0で返す
#   - Ctrl-C 後は新しい push を始めない
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
# ★ Codex P2 (r3794610421): `https://user:token@github.com/...` を設定している端末では、
#   URL をそのままログへ書くと **PAT が平文で残る**。userinfo をマスクして記録する。
ORIGIN_URL="$(git remote get-url origin 2>/dev/null | sed -e 's#://[^/@]*@#://***@#')"

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
fmtime() {
  _v="$(stat -c %Y "$1" 2>/dev/null)"
  case "$_v" in ''|*[!0-9]*) _v="$(stat -f %m "$1" 2>/dev/null)" ;; esac
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
FAILS=0
trap 'STOP=1; echo; say "終了します"' INT TERM

fail_out() {
  # fail_out <作業中ファイル> <表示名> <理由...>
  #   ★ Codex P1 (r3794610400): 同じ名前の修正版がまた失敗すると、隔離ファイルも ref も
  #     前回を上書きして「不変」でなくなる。**試行ごとに一意な名前**へ退避する。
  _b="$1"; _dispname="$2"; shift 2
  say "NG   $_dispname — $*"
  _stamp="$(date '+%Y%m%d-%H%M%S')-$$"
  mkdir -p "$LANDED/failed" 2>/dev/null
  mv "$_b" "$LANDED/failed/$_dispname.$_stamp.failed" 2>/dev/null \
    && say "     → _landed/failed/$_dispname.$_stamp.failed へ退避（中身は残してある）"
  # 残骸を次の bundle へ持ち越さない（Codex P1 r3794397144）
  if [ -f "$_b.force" ]; then
    mv "$_b.force" "$LANDED/failed/$_dispname.$_stamp.force" 2>/dev/null \
      && say "     → force マーカーも同じ場所へ隔離（次の bundle に持ち越さない）"
  fi
  FAILS=$((FAILS+1))
}

process_one() {
  _src="$1"
  _name="$(basename "$_src")"

  # 1) 書き込み途中を掴まない: サイズが2回続けて同じになるまで待つ
  _s1="$(fsize "$_src")"
  sleep 1
  _s2="$(fsize "$_src")"
  if [ "$_s1" != "$_s2" ] || [ -z "$_s2" ] || [ "$_s2" = "0" ]; then
    # まだ書き込み中。常駐なら次の巡で拾えるが、--once では**黙って落とさない**
    [ "$ONCE" -eq 1 ] && say "保留 $_name — まだ書き込み中に見える（size $_s1→$_s2）。--once なので今回は見送り"
    return 0
  fi

  # ★ Codex P2 (r3794610456): Ctrl-C の後に**新しい remote 書き込みを始めない**。
  #   trap は STOP を立てるだけなので、待ちから戻った所で必ず見る。
  if [ "$STOP" -eq 1 ]; then
    say "保留 $_name — 停止要求が出ているので着手しない"
    return 0
  fi

  # 2) ★ claim（Codex P1 r3794610391 とその同型をまとめて畳む）
  #   処理対象を**専用の名前へ確保**してから触る。こうすると:
  #     - push 中に producer が同名の修正版を atomic rename で置いても、退避するのは
  #       いま検証・push した現物だけ（未処理の新版を黙って _landed/ へ持って行かない）
  #     - verify → fetch → push の間に中身が差し替わることが原理的に起きない
  #       （以前は size+mtime を再照合していたが、claim で不要になった）
  #     - 置き直された修正版は次の巡で普通に処理される
  #   `*.bundle.landing-<pid>` は監視対象の `*.bundle` に一致しない名前。
  _b="$_src.landing-$$"
  if ! mv "$_src" "$_b" 2>/dev/null; then
    say "保留 $_name — 確保できなかった（消えた or 権限）"
    return 0
  fi
  [ -f "$_src.force" ] && mv "$_src.force" "$_b.force" 2>/dev/null

  say "検出 $_name（${_s2} bytes）"

  # 3) bundle として妥当か（前提コミットが手元にあるかもここで分かる）
  if ! git bundle verify "$_b" >/dev/null 2>&1; then
    _v="$(git bundle verify "$_b" 2>&1 | tr '\n' ' ')"
    fail_out "$_b" "$_name" "git bundle verify に通らない: $_v"
    return 0
  fi

  # 4) 中の refs/heads/* を列挙
  _heads="$(git bundle list-heads "$_b" 2>/dev/null | awk '$2 ~ /^refs\/heads\// {print $2}')"
  if [ -z "$_heads" ]; then
    fail_out "$_b" "$_name" "refs/heads/* が入っていない（list-heads が空）"
    return 0
  fi

  _force=0
  [ -f "$_b.force" ] && _force=1

  for _ref in $_heads; do
    _branch="${_ref#refs/heads/}"
    if is_protected "$_branch" && [ "${ALLOW_PROTECTED:-0}" != "1" ]; then
      fail_out "$_b" "$_name" "保護枝 '$_branch' への push は既定で拒否（PR 経由にすること・どうしてもなら ALLOW_PROTECTED=1）"
      return 0
    fi

    # ★ Codex P2 (r3794610442): dry-run では **ref を1本も作らない**。
    #   以前は fetch してから continue していたので、確認だけのはずが
    #   ローカル ref と到達可能なオブジェクトが恒久的に残っていた。
    #   bundle の SHA は list-heads から読めるので fetch は要らない。
    if [ "$DRY_RUN" -eq 1 ]; then
      _sha="$(git bundle list-heads "$_b" 2>/dev/null | awk -v r="$_ref" '$2==r{print $1}')"
      _old="$(git ls-remote origin "$_ref" 2>/dev/null | awk '{print $1}')"
      _oldshow="$_old"; [ -n "$_oldshow" ] || _oldshow="(新規)"
      say "     dry-run: $_branch を $_oldshow → $_sha にする（ref も push も作らない）"
      continue
    fi

    # 5) 一時 ref へ fetch（作業ツリーには触らない）
    _tmpref="refs/land/$_branch"
    if ! git fetch "$_b" "+$_ref:$_tmpref" >/dev/null 2>&1; then
      fail_out "$_b" "$_name" "bundle からの fetch に失敗（$_ref）"
      return 0
    fi
    _sha="$(git rev-parse "$_tmpref" 2>/dev/null)"

    if [ "$STOP" -eq 1 ]; then
      git update-ref -d "$_tmpref" 2>/dev/null
      fail_out "$_b" "$_name" "停止要求が出たので push しなかった（再度置けば着地する）"
      return 0
    fi

    _old="$(git ls-remote origin "$_ref" 2>/dev/null | awk '{print $1}')"
    _oldshow="$_old"
    [ -n "$_oldshow" ] || _oldshow="(新規)"

    # 6) push
    # ★ Codex P1 (r3794397139): `ls-remote` で読んでから push するまでの間に他の誰かが
    #   同じ枝を進めていると、無条件の `--force` はその新しいコミットまで消す。
    #   しかもログに残るのは**実際に上書きした SHA ではなく古い `_old`** ＝監査記録も嘘になる。
    #   → **観測した `_old` を期待値にした `--force-with-lease`** にする（原子的に弾ける）。
    #     枝が存在しない（新規）ときは force 自体が不要なので通常 push で作る。
    if [ "$_force" -eq 1 ] && [ -n "$_old" ]; then
      say "     ★ force 指定（$_name.force あり）: $_branch を $_old → $_sha で上書きする"
      say "       （--force-with-lease: 観測した $_old のままである場合にだけ通す）"
      _out="$(git push --force-with-lease="$_ref:$_old" origin "$_tmpref:$_ref" 2>&1)"; _rc=$?
    elif [ "$_force" -eq 1 ]; then
      say "     ★ force 指定だが origin に $_branch が無い＝新規作成（force は不要）"
      _out="$(git push origin "$_tmpref:$_ref" 2>&1)"; _rc=$?
    else
      _out="$(git push origin "$_tmpref:$_ref" 2>&1)"; _rc=$?
    fi

    if [ "$_rc" -ne 0 ]; then
      say "NG   $_name — push 失敗（$_branch）"
      echo "$_out" | sed 's/^/       /'
      echo "$_out" | sed 's/^/       /' >> "$LOG" 2>/dev/null
      # ★ Codex P2 (r3794397154) / P1 (r3794610400): 復旧手段を後続処理で壊さない。
      #   ① 内容そのもので一意な不変 ref（`refs/land/failed/<sha>`）に保持してオブジェクトを残す
      #   ② 復旧コマンドは **ref ではなく確定した SHA** を直接指す
      _keepref="refs/land/failed/$_sha"
      git update-ref "$_keepref" "$_sha" 2>/dev/null
      git update-ref -d "$_tmpref" 2>/dev/null
      say "     この bundle の内容は $_keepref に保持した（$_sha）"
      say "     早戻り（fast-forward でない）なら、意図した上書きか確かめてから:"
      if [ -n "$_old" ]; then
        say "       cd $REPO && git push --force-with-lease=$_ref:$_old origin $_sha:$_ref"
      else
        say "       cd $REPO && git push origin $_sha:$_ref"
      fi
      say "     cowork 側からやるなら bundle と一緒に $_name.force を置くこと"
      fail_out "$_b" "$_name" "push 失敗"
      return 0
    fi
    say "OK   $_branch ← $_sha（前: $_oldshow）"
    # push できた時点で origin に載っているので、一時 ref は消す（.git を太らせない）
    git update-ref -d "$_tmpref" 2>/dev/null
  done

  if [ "$DRY_RUN" -eq 1 ]; then
    # 確認だけ。元の名前へ戻して、次の実行で普通に処理できるようにする
    mv "$_b" "$_src" 2>/dev/null
    [ -f "$_b.force" ] && mv "$_b.force" "$_src.force" 2>/dev/null
    mark_seen "$_name"
    return 0
  fi

  mv "$_b" "$LANDED/$_name" 2>/dev/null && say "     → _landed/$_name へ退避"
  [ -f "$_b.force" ] && mv "$_b.force" "$LANDED/$_name.force" 2>/dev/null
  return 0
}

scan_once() {
  # ★ 残骸の持ち越し対策（Codex P1 r3794397144）の残り半分:
  #   bundle の無い `.force` マーカーが転がっていると、後で**同じ名前の bundle** が来たときに
  #   黙って強制上書きになる。見つけたら一度だけ知らせる（消しはしない＝意図的に置いた場合がある）。
  for _fm in "$REPO"/*.bundle.force; do
    [ -e "$_fm" ] || continue
    _fb="${_fm%.force}"
    [ -e "$_fb" ] && continue
    is_seen "marker:$(basename "$_fm")" && continue
    say "⚠ $(basename "$_fm") は bundle が無いのに残っている。同名の bundle が来たら**強制上書き**になる"
    say "   意図が無ければ削除すること: rm '$_fm'"
    mark_seen "marker:$(basename "$_fm")"
  done
  for _b in "$REPO"/*.bundle; do
    [ -e "$_b" ] || continue
    is_seen "$(basename "$_b")" && continue
    process_one "$_b"
  done
}

if [ "$ONCE" -eq 1 ]; then
  scan_once
  # ★ Codex P2 (r3794610437): `land.sh --once && 次の処理` のような自動化が、
  #   1本も着地していないのに先へ進んでいた。**失敗があれば非0で返す。**
  if [ "$FAILS" -gt 0 ]; then
    say "--once: 1巡して終了（失敗 ${FAILS} 件）"
    exit 1
  fi
  say "--once: 1巡して終了"
  exit 0
fi

while [ "$STOP" -eq 0 ]; do
  scan_once
  [ "$STOP" -eq 1 ] && break
  sleep "$POLL"
done
# 常駐モードは「止めた」ことが成功。失敗の有無はログと _landed/failed/ を見る
[ "$FAILS" -gt 0 ] && say "この常駐中に失敗した bundle: ${FAILS} 件（_landed/failed/ を見ること）"
exit 0
