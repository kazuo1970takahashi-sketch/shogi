#!/usr/bin/env bash
# =============================================================================
# serve_for_verify.sh — 実機確認の配信を「必ず staging を向いた状態」で立てる
#
#   なぜ要るか（2026-08-24 / STAGING-ENV-001）:
#     これまでの実機確認は production のツリーをそのまま配信していた。
#     production には **実値の app/config.js / app/config.public.js がコミットされている**
#     ので、配信された画面でログインや ☁送信を1回でも押すと **本番 Supabase に届く**。
#     #800 の本番データ破損はこの構造から出た。
#
#   この道具がすること:
#     1. 指定した ref のツリーを作業ディレクトリへ取り出す（byte はそのまま）
#     2. **config だけ staging のものに差し替える**（コードは検証対象のまま・向き先だけ変える）
#     3. ★ 差し替えが本当に効いているかを検査し、**効いていなければ配信しない**
#     4. 検査を通ったら http.server で配信する
#
#   ★ 検査に使う「本番の印」は production ブランチ自身の config から取る（ハードコードしない）。
#     本番の URL が変わっても勝手に追従する。
#
#   ★ この道具が守るのは「config の取り違え」だけ（保証しないことは runbook の同名の節に列挙）:
#     - 守る: 配信 tree に本番の印が残る／staging を名乗らない config を配る → 検査で止める
#     - 守らない: 悪意ある tree（repo は作者の管理下）・共有マシンの /tmp を狙う攻撃・ブラウザ側の状態
#       symlink は中身を検査できないので「うっかり」の範囲として tree 内の全部を拒否する（それ以上は見ない）
#
#   使い方:
#     bash scripts/serve_for_verify.sh <repo> <ref> <port> <staging-config-dir>
#       repo               : git リポジトリ（例 /tmp/shogi-dev）
#       ref                : 検証対象（例 origin/production / origin/<開発本流>）
#       port               : 配信ポート（例 8140）
#       staging-config-dir : config.js（必要なら config.public.js）が入ったディレクトリ
#
#   終了コード: 0=配信開始 / 2=引数不正 / 3=★検査に落ちた（配信していない） / 4=★配信を立てられなかった（ポート占有など・配信していない）
# =============================================================================
set -eu

REPO="${1:-}"; REF="${2:-}"; PORT="${3:-}"; SCFG="${4:-}"
if [ -z "$REPO" ] || [ -z "$REF" ] || [ -z "$PORT" ] || [ -z "$SCFG" ]; then
  echo "使い方: bash scripts/serve_for_verify.sh <repo> <ref> <port> <staging-config-dir>" >&2
  exit 2
fi
[ -f "$SCFG/config.js" ] || { echo "✗ $SCFG/config.js が無い" >&2; exit 2; }

# ---- 0) origin を先に更新する（取り出しも検査も、新しい ref で行う）----
#   ★Codex P1（PR #938 2巡目）: fetch を検査の直前に置くと、<ref> が origin/production のとき
#     取り出しは古い tree・検査は新しい印、という食い違いが起きる。→ 取り出す前に fetch し、
#     <ref> は不変の commit ID に解決してから使う（報告にも ID を出す）。
#   ★Codex P1（PR #938 3巡目）: refspec 無しの fetch は remote.origin.fetch が絞られた clone
#     （single-branch 等）だと production を更新せずに 0 を返す。→ refspec を明示して
#     origin/production と、<ref> が origin/<枝> ならその枝も名指しで更新する。
REFSPECS="+refs/heads/production:refs/remotes/origin/production"
case "$REF" in
  origin/*) REF_BRANCH="${REF#origin/}"
            [ "$REF_BRANCH" = "production" ] || REFSPECS="$REFSPECS +refs/heads/$REF_BRANCH:refs/remotes/origin/$REF_BRANCH" ;;
esac
# shellcheck disable=SC2086  # REFSPECS は空白区切りで複数渡す
if ! git -C "$REPO" fetch --quiet origin $REFSPECS 2>/dev/null; then
  echo "✗ origin の production（と指定の枝）を fetch できませんでした（取り出す ref も本番の印も新しいと言えないので中止）" >&2
  exit 3
fi
REF_OID="$(git -C "$REPO" rev-parse --verify --quiet "$REF^{commit}" || true)"
if [ -z "$REF_OID" ]; then
  echo "✗ ref を解決できませんでした: $REF" >&2
  exit 2
fi

#   作業ディレクトリは mktemp が作る1つだけ。配信する tree は その下の site/、ログと pid は同じ
#   ディレクトリ直下（配信されない・予測可能な /tmp パスに書かない＝★Codex P1 PR #938 4巡目）。
WORK="$(mktemp -d /tmp/serve_verify.XXXXXX)"
SITE="$WORK/site"
LOG="$WORK/server.log"
PIDFILE="$WORK/server.pid"
mkdir "$SITE"
echo "作業ディレクトリ: ${WORK}（配信するのは site/）"

# ---- 1) 検証対象のツリーを取り出す（コードは触らない）----
git -C "$REPO" archive "$REF_OID" | tar -x -C "$SITE"
echo "取り出し: $REF = $REF_OID"

#   ★Codex P1（PR #938 2巡目・4巡目）: tree に symlink があると、cp はたどって外を上書きしうるし、
#     http.server はたどって外の中身を配る（grep は中身を見ない）。→ 種類を問わず tree 内の symlink は
#     1本でもあれば中止（この道具は中身を検査できないものを配らない）。
SYMLINKS="$(find "$SITE" -type l 2>/dev/null)"
if [ -n "$SYMLINKS" ]; then
  echo "✗ 取り出した tree に symlink があります（中身を検査できないので配信しない）:" >&2
  printf '%s\n' "$SYMLINKS" | sed "s#^$SITE/#    #" >&2
  exit 3
fi

# ---- 2) config だけ staging に差し替える ----
mkdir -p "$SITE/app"
rm -f "$SITE/app/config.js"
cp "$SCFG/config.js" "$SITE/app/config.js"
if [ -f "$SCFG/config.public.js" ]; then
  rm -f "$SITE/app/config.public.js"
  cp "$SCFG/config.public.js" "$SITE/app/config.public.js"
elif [ -f "$SITE/app/config.public.js" ]; then
  # staging 側に公開 config が無いなら、本番の実値を**残さない**（消す方が安全）
  rm -f "$SITE/app/config.public.js"
  echo "注意: staging 側に config.public.js が無いので、取り出したものを削除しました（ライブ配信は試せません）"
fi

# ---- 3) ★ 検査（ここを通らなければ配信しない）----
fail=0

# 3-a) 本番の印を production ブランチ自身から取る（ハードコードしない）
#   ★Codex P1（PR #938 初巡）: origin/production は remote-tracking ref＝fetch しなければ古いまま。
#     古い印で検査すると、今の本番 URL を含むツリーが緑で通る。→ 冒頭 0) で必ず fetch してから読む
#     （fetch できなければそこで中止＝fail-closed）。
#   ★Codex P1（同）: 印の抽出は「url: '…'」の property 行に限定し、ちょうど1件でなければ中止。
#     コメントに旧 URL が残っていると head -1 が旧の印を拾う（`.github/workflows/supabase-keepalive.yml` と同じ形）。
PROD_REF=""
if git -C "$REPO" cat-file -e "origin/production:app/config.public.js" 2>/dev/null; then
  URL_MATCHES="$(git -C "$REPO" show origin/production:app/config.public.js \
    | sed -n \
        -e "s/^[[:space:]]*url:[[:space:]]*'\([^']*\)'[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p" \
        -e 's/^[[:space:]]*url:[[:space:]]*"\([^"]*\)"[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p')"
  URL_COUNT="$(printf '%s\n' "$URL_MATCHES" | awk 'NF { n++ } END { print n + 0 }')"
  if [ "$URL_COUNT" != "1" ]; then
    echo "✗ production の app/config.public.js で url: が一意でない（url=${URL_COUNT}）＝印を決められないので中止" >&2
    fail=1
  else
    PROD_REF="$(printf '%s\n' "$URL_MATCHES" | sed -nE 's#^https://([a-z0-9]+)\.supabase\.co/?$#\1#p')"
  fi
fi
if [ "$fail" -ne 0 ]; then
  :
elif [ -z "$PROD_REF" ]; then
  echo "✗ 本番の project ref を production ブランチから読めませんでした（検査できないので中止）" >&2
  fail=1
else
  if grep -rqF "$PROD_REF" "$SITE" 2>/dev/null; then
    echo "✗ 配信ディレクトリに **本番の project ref** が残っています:" >&2
    grep -rlF "$PROD_REF" "$SITE" 2>/dev/null | sed "s#^$SITE/#    #" >&2
    fail=1
  else
    echo "✓ 本番の project ref はどこにも無い"
  fi
fi

# 3-b) 配信する config が staging を名乗っていること
#   ★Codex P1（PR #938 2巡目）: unanchored grep だとコメント行の // env:'staging' でも通る。
#     → url: と同じく property 行だけを読み、値がちょうど1件で 'staging' のときだけ ✓。
ENV_MATCHES="$(sed -n \
    -e "s/^[[:space:]]*env:[[:space:]]*'\([^']*\)'[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p" \
    -e 's/^[[:space:]]*env:[[:space:]]*"\([^"]*\)"[[:space:]]*,\{0,1\}[[:space:]]*$/\1/p' \
    "$SITE/app/config.js")"
ENV_COUNT="$(printf '%s\n' "$ENV_MATCHES" | awk 'NF { n++ } END { print n + 0 }')"
if [ "$ENV_COUNT" = "1" ] && [ "$ENV_MATCHES" = "staging" ]; then
  echo "✓ app/config.js は env:'staging'（property 行・1件）"
else
  echo "✗ app/config.js の env: property が 'staging' 1件ではありません（env=${ENV_COUNT} 件・値=${ENV_MATCHES:-無し}）＝staging 用の config ではない" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "★ 検査に落ちたので配信しません。作業ディレクトリは残してあります: $WORK" >&2
  exit 3
fi

# ---- 4) 配信 ----
#   ★Codex P1（PR #938 初巡）: 起動を待たずに exit 0 にすると、ポートが占有済みでも「配信開始」と出て
#     古い配信（production ツリーかもしれない）へ誘導する。→ 起動した PID が生きていて、かつ
#     このディレクトリだけに置いた目印ファイルがそのポートから読めることを確かめてから 0 を返す。
cd "$SITE"
MARK=".serve_verify_$$_$(date +%s)"
printf 'serve_for_verify %s\n' "$SITE" > "$MARK"
#   ★Codex P1（PR #938 2巡目）: setsid は util-linux＝素の macOS に無い。作者機（bash 3.2）で動くのが
#     この道具の前提なので nohup だけで起こす（親シェルが終わっても HUP で死なない）。
nohup python3 -m http.server "$PORT" --bind 127.0.0.1 < /dev/null > "$LOG" 2>&1 &
SRV_PID=$!
disown 2>/dev/null || true
printf '%s\n' "$SRV_PID" > "$PIDFILE"
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.3
  if ! kill -0 "$SRV_PID" 2>/dev/null; then break; fi
  if curl -fsS --noproxy "*" --max-time 2 "http://127.0.0.1:$PORT/$MARK" 2>/dev/null | grep -qF "$SITE"; then ok=1; break; fi
done
rm -f "$MARK"
if [ "$ok" -ne 1 ]; then
  kill "$SRV_PID" 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "✗ ポート ${PORT} でこのディレクトリを配信できませんでした（占有済みか起動失敗。ログ: ${LOG}）" >&2
  echo "★ 配信していません。別のポートで再実行してください。" >&2
  exit 4
fi
echo "✓ 配信開始: http://127.0.0.1:${PORT}/shogi_v4.html"
echo "  配信ディレクトリ: ${SITE}（${REF} = ${REF_OID}・config だけ staging）"
echo "  PID: ${SRV_PID}（止めるとき: kill ${SRV_PID}／同じ値を ${PIDFILE} に書いた・ログ: ${LOG}）"
#   ★Codex P1（PR #938 2巡目・runbook）: ブラウザは origin（127.0.0.1:ポート）ごとに SW キャッシュを持つ。
#     以前このポートで本番 config を配信していたなら、そのキャッシュが残っていて網羅できない。
echo "  ⚠ このポートで以前に別のツリーを配信したことがあるなら、開く前にブラウザのこの origin のサイトデータ（SW とキャッシュ）を消すこと。runbook 参照。"
