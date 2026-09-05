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
#   使い方:
#     bash scripts/serve_for_verify.sh <repo> <ref> <port> <staging-config-dir>
#       repo               : git リポジトリ（例 /tmp/shogi-dev）
#       ref                : 検証対象（例 origin/production / origin/<開発本流>）
#       port               : 配信ポート（例 8140）
#       staging-config-dir : config.js（必要なら config.public.js）が入ったディレクトリ
#
#   終了コード: 0=配信開始 / 2=引数不正 / 3=★検査に落ちた（配信していない）
# =============================================================================
set -eu

REPO="${1:-}"; REF="${2:-}"; PORT="${3:-}"; SCFG="${4:-}"
if [ -z "$REPO" ] || [ -z "$REF" ] || [ -z "$PORT" ] || [ -z "$SCFG" ]; then
  echo "使い方: bash scripts/serve_for_verify.sh <repo> <ref> <port> <staging-config-dir>" >&2
  exit 2
fi
[ -f "$SCFG/config.js" ] || { echo "✗ $SCFG/config.js が無い" >&2; exit 2; }

WORK="$(mktemp -d /tmp/serve_verify.XXXXXX)"
echo "作業ディレクトリ: $WORK"

# ---- 1) 検証対象のツリーを取り出す（コードは触らない）----
git -C "$REPO" archive "$REF" | tar -x -C "$WORK"
echo "取り出し: $REF"

# ---- 2) config だけ staging に差し替える ----
mkdir -p "$WORK/app"
cp "$SCFG/config.js" "$WORK/app/config.js"
if [ -f "$SCFG/config.public.js" ]; then
  cp "$SCFG/config.public.js" "$WORK/app/config.public.js"
elif [ -f "$WORK/app/config.public.js" ]; then
  # staging 側に公開 config が無いなら、本番の実値を**残さない**（消す方が安全）
  rm -f "$WORK/app/config.public.js"
  echo "注意: staging 側に config.public.js が無いので、取り出したものを削除しました（ライブ配信は試せません）"
fi

# ---- 3) ★ 検査（ここを通らなければ配信しない）----
fail=0

# 3-a) 本番の印を production ブランチ自身から取る（ハードコードしない）
PROD_REF=""
if git -C "$REPO" cat-file -e "origin/production:app/config.public.js" 2>/dev/null; then
  PROD_REF="$(git -C "$REPO" show origin/production:app/config.public.js \
              | sed -nE "s#.*https://([a-z0-9]+)\.supabase\.co.*#\1#p" | head -1)"
fi
if [ -z "$PROD_REF" ]; then
  echo "✗ 本番の project ref を production ブランチから読めませんでした（検査できないので中止）" >&2
  fail=1
else
  if grep -rqF "$PROD_REF" "$WORK" 2>/dev/null; then
    echo "✗ 配信ディレクトリに **本番の project ref** が残っています:" >&2
    grep -rlF "$PROD_REF" "$WORK" 2>/dev/null | sed "s#^$WORK/#    #" >&2
    fail=1
  else
    echo "✓ 本番の project ref はどこにも無い"
  fi
fi

# 3-b) 配信する config が staging を名乗っていること
if grep -qE "env:[[:space:]]*['\"]staging['\"]" "$WORK/app/config.js"; then
  echo "✓ app/config.js は env:'staging'"
else
  echo "✗ app/config.js に env:'staging' がありません（staging 用の config ではない）" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "★ 検査に落ちたので配信しません。作業ディレクトリは残してあります: $WORK" >&2
  exit 3
fi

# ---- 4) 配信 ----
cd "$WORK"
setsid nohup python3 -m http.server "$PORT" --bind 127.0.0.1 < /dev/null > /tmp/serve_verify_"$PORT".log 2>&1 &
disown || true
sleep 1
echo "✓ 配信開始: http://127.0.0.1:$PORT/shogi_v4.html"
echo "  ディレクトリ: $WORK"
