#!/usr/bin/env bash
# =============================================================================
# test_land_script_001.sh — [LAND-BUNDLE-001] scripts/land.sh の companion test
#
#   使い捨ての sandbox（mktemp -d + git init --bare を origin にした2つの clone）に対して
#   だけ実行する。**この repo の履歴・作業ツリー・実 origin には一切触れない**。
#   network 不使用（origin は同じ tmp 配下の bare repo）。
#
#   固定する性質:
#     - 起動時に既にあった *.bundle は**対象外**（過去の残骸を勝手に push しない）
#     - --include-existing なら対象になる
#     - 正常な bundle は push され、_landed/ へ退避される（枝が origin に立つ）
#     - **作業ツリーを1 byte も変えない**（checkout も merge もしない）
#     - 保護枝（production / 開発本流）への push は既定で拒否し、.failed に残す
#     - 壊れた bundle は verify で止まり、push されない
#     - fast-forward でない push は失敗として扱い、.failed に残す
#     - `<name>.bundle.force` を添えたときだけ --force で上書きできる
#     - --dry-run は push しない
#     - 常駐モードで、**起動後に置かれた** bundle を拾って着地させる
#
# 使い方: bash test/test_land_script_001.sh
# set -e は使わない（個別に判定するため）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAND="$SCRIPT_DIR/../scripts/land.sh"

PASS=0
FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  LAND-BUNDLE-001 bundle 自動着地の単体テスト"
echo "=========================================="

if [ ! -f "$LAND" ]; then
  echo "  ✗ $LAND が無い"
  exit 1
fi

SB="$(mktemp -d "${TMPDIR:-/tmp}/landtest.XXXXXX")"
cleanup() { rm -rf "$SB"; }
trap cleanup EXIT

export GIT_CONFIG_NOSYSTEM=1
export HOME="$SB/home"; mkdir -p "$HOME"
git config --global user.email "t@example.invalid" >/dev/null 2>&1
git config --global user.name  "land test"        >/dev/null 2>&1
git config --global init.defaultBranch main       >/dev/null 2>&1
git config --global protocol.file.allow always    >/dev/null 2>&1

ORIGIN="$SB/origin.git"
A="$SB/mac"      # 作者機の repo に相当
B="$SB/cloud"    # cowork（cloud）側に相当

git init --bare -q "$ORIGIN" 2>/dev/null || git init --bare "$ORIGIN" >/dev/null 2>&1
git init -q "$A" >/dev/null 2>&1
(
  cd "$A" || exit 1
  echo "base" > base.txt
  git add base.txt >/dev/null 2>&1
  git commit -q -m "base" >/dev/null 2>&1
  git branch -M main >/dev/null 2>&1
  git remote add origin "$ORIGIN" >/dev/null 2>&1
  git push -q origin main >/dev/null 2>&1
) || { echo "  ✗ sandbox の作成に失敗"; exit 1; }

git clone -q "$ORIGIN" "$B" >/dev/null 2>&1

# make_bundle <branch> <file> <content> [bundle名]
make_bundle() {
  _br="$1"; _f="$2"; _c="$3"; _out="${4:-$_br}"
  (
    cd "$B" || exit 1
    git checkout -q -B "$_br" origin/main >/dev/null 2>&1
    echo "$_c" > "$_f"
    git add "$_f" >/dev/null 2>&1
    git commit -q -m "$_c" >/dev/null 2>&1
    git bundle create "$SB/$(echo "$_out" | tr '/' '-').bundle" "$_br" --not origin/main >/dev/null 2>&1
  )
  echo "$SB/$(echo "$_out" | tr '/' '-').bundle"
}

remote_sha() { git --git-dir="$ORIGIN" rev-parse --verify "refs/heads/$1" 2>/dev/null; }
run_land() { ( cd "$A" && bash "$LAND" --repo "$A" "$@" 2>&1 ); }

# ---------------------------------------------------------------------------
echo ""
echo "1) 起動時に既にあった bundle は対象外（--include-existing で対象になる）"
BND="$(make_bundle "feat/one" one.txt "one")"
cp "$BND" "$A/pre.bundle"
OUT="$(run_land --once)"
if [ -z "$(remote_sha feat/one)" ] && [ -f "$A/pre.bundle" ]; then ok "起動時にあった pre.bundle は push されず、その場に残る"
else ng "起動時にあった bundle が処理されてしまった"; fi
case "$OUT" in *"対象外"*) ok "その旨がログに出る" ;; *) ng "対象外である旨がログに出ない" ;; esac

OUT="$(run_land --once --include-existing)"
if [ -n "$(remote_sha feat/one)" ]; then ok "--include-existing なら push される"
else ng "--include-existing でも push されない"; fi
if [ -f "$A/_landed/pre.bundle" ] && [ ! -f "$A/pre.bundle" ]; then ok "_landed/ へ退避される"
else ng "_landed/ へ退避されない"; fi

# ---------------------------------------------------------------------------
echo ""
echo "2) 作業ツリーを変えない（checkout も merge もしない）"
BEFORE_HEAD="$(cd "$A" && git rev-parse HEAD)"
BEFORE_BR="$(cd "$A" && git rev-parse --abbrev-ref HEAD)"
BEFORE_TREE="$(cd "$A" && git status --porcelain | grep -v '_landed' | grep -v '\.bundle' | sort)"
BND2="$(make_bundle "feat/two" two.txt "two")"
cp "$BND2" "$A/two.bundle"
run_land --once --include-existing >/dev/null 2>&1
AFTER_HEAD="$(cd "$A" && git rev-parse HEAD)"
AFTER_BR="$(cd "$A" && git rev-parse --abbrev-ref HEAD)"
AFTER_TREE="$(cd "$A" && git status --porcelain | grep -v '_landed' | grep -v '\.bundle' | sort)"
[ "$BEFORE_HEAD" = "$AFTER_HEAD" ] && ok "HEAD が動かない" || ng "HEAD が動いた"
[ "$BEFORE_BR" = "$AFTER_BR" ] && ok "居る枝が変わらない" || ng "枝が変わった（$BEFORE_BR → $AFTER_BR）"
[ "$BEFORE_TREE" = "$AFTER_TREE" ] && ok "作業ツリーの状態が変わらない" || ng "作業ツリーが変わった"
[ -n "$(remote_sha feat/two)" ] && ok "それでも枝は origin に立つ" || ng "枝が立たなかった"

# ---------------------------------------------------------------------------
echo ""
echo "3) 保護枝への push は既定で拒否"
(
  cd "$B" || exit 1
  git checkout -q -B production origin/main >/dev/null 2>&1
  echo "danger" > danger.txt
  git add danger.txt >/dev/null 2>&1
  git commit -q -m "danger" >/dev/null 2>&1
  git bundle create "$SB/prod.bundle" production --not origin/main >/dev/null 2>&1
)
cp "$SB/prod.bundle" "$A/prod.bundle"
OUT="$(run_land --once --include-existing)"
if [ -z "$(remote_sha production)" ]; then ok "production は push されない"
else ng "★ production が push されてしまった"; fi
[ -f "$A/prod.bundle.failed" ] && ok ".failed に改名して残る" || ng ".failed に残らない"
case "$OUT" in *"保護枝"*) ok "拒否理由がログに出る" ;; *) ng "拒否理由がログに出ない" ;; esac

# ---------------------------------------------------------------------------
echo ""
echo "4) 壊れた bundle は verify で止まる"
printf 'not a bundle at all\n' > "$A/broken.bundle"
OUT="$(run_land --once --include-existing)"
[ -f "$A/broken.bundle.failed" ] && ok "壊れた bundle は .failed へ" || ng "壊れた bundle が .failed にならない"
case "$OUT" in *"verify"*) ok "verify で止まったと分かる" ;; *) ng "理由が分からない" ;; esac

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
echo ""
echo "4b) 0 byte の bundle は「まだ書き込み中」として見送る（失敗にしない）"
#   ★ ここは stat 互換の pin も兼ねる: サイズ取得が壊れていると 0 を検出できず、
#     verify まで進んで .failed になる（GNU の `stat -f` は成功して別の値を返す）。
: > "$A/empty.bundle"
OUT="$(run_land --once --include-existing)"
if [ -f "$A/empty.bundle" ] && [ ! -f "$A/empty.bundle.failed" ]; then ok "0 byte は失敗扱いにせずその場に残す"
else ng "0 byte の扱いが違う（サイズ取得が壊れている可能性）"; fi
case "$OUT" in *"保留"*) ok "--once では見送った旨を出す（黙って落とさない）" ;; *) ng "見送りが黙殺されている" ;; esac
rm -f "$A/empty.bundle"

# ---------------------------------------------------------------------------
echo ""
echo "5) fast-forward でない push は失敗にする（.force があるときだけ上書き）"
# feat/two を「巻き戻した」別系列に作り替える
(
  cd "$B" || exit 1
  git checkout -q -B feat/two origin/main >/dev/null 2>&1
  echo "rewritten" > two.txt
  git add two.txt >/dev/null 2>&1
  git commit -q -m "rewritten" >/dev/null 2>&1
  git bundle create "$SB/two-rw.bundle" feat/two --not origin/main >/dev/null 2>&1
)
OLD_TWO="$(remote_sha feat/two)"
cp "$SB/two-rw.bundle" "$A/tworw.bundle"
OUT="$(run_land --once --include-existing)"
if [ "$(remote_sha feat/two)" = "$OLD_TWO" ]; then ok "非 fast-forward は push されない"
else ng "★ 非 fast-forward が黙って通った"; fi
[ -f "$A/tworw.bundle.failed" ] && ok ".failed に残る" || ng ".failed に残らない"
case "$OUT" in *"--force"*) ok "復旧コマンドがそのまま出る" ;; *) ng "復旧コマンドが出ない" ;; esac

cp "$SB/two-rw.bundle" "$A/tworw2.bundle"
: > "$A/tworw2.bundle.force"
OUT="$(run_land --once --include-existing)"
if [ "$(remote_sha feat/two)" != "$OLD_TWO" ] && [ -n "$(remote_sha feat/two)" ]; then ok ".force を添えたときだけ上書きできる"
else ng ".force を添えても上書きされない"; fi
case "$OUT" in *"$OLD_TWO"*) ok "上書きされた旧 SHA をログに残す" ;; *) ng "旧 SHA を残していない" ;; esac

# ---------------------------------------------------------------------------
echo ""
echo "6) --dry-run は push しない"
BND3="$(make_bundle "feat/three" three.txt "three")"
cp "$BND3" "$A/three.bundle"
OUT="$(run_land --once --include-existing --dry-run)"
if [ -z "$(remote_sha feat/three)" ] && [ -f "$A/three.bundle" ]; then ok "push もせず退避もしない"
else ng "dry-run なのに何かした"; fi
case "$OUT" in *"dry-run"*) ok "dry-run と明示される" ;; *) ng "dry-run と分からない" ;; esac
rm -f "$A/three.bundle"

# ---------------------------------------------------------------------------
echo ""
echo "7) 常駐モードは「起動後に置かれた」bundle を拾う"
BND4="$(make_bundle "feat/four" four.txt "four")"
( cd "$A" && POLL=1 bash "$LAND" --repo "$A" > "$SB/watch.log" 2>&1 ) &
WATCH_PID=$!
sleep 2
cp "$BND4" "$A/four.bundle.tmp" && mv "$A/four.bundle.tmp" "$A/four.bundle"
i=0
while [ $i -lt 20 ]; do
  [ -n "$(remote_sha feat/four)" ] && break
  sleep 1
  i=$((i+1))
done
kill "$WATCH_PID" >/dev/null 2>&1
wait "$WATCH_PID" >/dev/null 2>&1
if [ -n "$(remote_sha feat/four)" ]; then ok "起動後に置かれた bundle が自動で着地する（${i}秒）"
else ng "常駐モードで着地しなかった"; fi
[ -f "$A/_landed/four.bundle" ] && ok "_landed/ へ退避される" || ng "_landed/ へ退避されない"
[ -f "$A/_landed/land.log" ] && ok "land.log に記録が残る" || ng "land.log が無い"

# ---------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
echo "  ✓ LAND-BUNDLE-001 全PASS"
exit 0
