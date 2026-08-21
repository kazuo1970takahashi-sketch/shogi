#!/usr/bin/env bash
# =============================================================================
# test_no_tracked_bundles.sh — [REPO-BUNDLE-HYGIENE-001]
#   受け渡し用の `*.bundle` が **追跡された状態で repo に残っていない**ことを固定する。
#   @suite: REPO-BUNDLE-HYGIENE-001 追跡 bundle ゼロ
#
#   なぜ要るか:
#     land.sh の受け渡し物（1本 1MB 前後の binary）は `.gitignore` の `/*.bundle` で
#     untracked のまま無視される。だが **一度 tracked になった経路のファイルには
#     .gitignore は効かない**。実際に repo 直下へ3本（phase1_master_rebuild /
#     phase1_p3 / preset_history）が残っていた。無視規則があることと、
#     いま追跡ゼロであることは**別の命題**なので、後者をここで測る。
#
#   ★ このテストの肝（[[pin-must-exercise-behavior]]）:
#     「追跡ゼロ」は何もしなくても緑になり得る＝**空振りが最も起きやすい形**。
#     そこで同じ検査関数を、bundle を1本コミットした使い捨て sandbox repo にも当て、
#     **赤になることをこのテスト自身の中で確かめる**。検査が壊れれば C1 が落ちる。
#
#   安全: network 不使用。mutating な git 操作は mktemp -d の sandbox 内だけ。
#         この repo の作業ツリー・履歴には一切触れない（読み取りは ls-files のみ）。
#   使い方: bash test/test_no_tracked_bundles.sh
#   依存: bash 3.2+（macOS 既定）/ git。set -e は使わない（個別に判定する）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."

PASS=0
FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  REPO-BUNDLE-HYGIENE-001 追跡 bundle ゼロ"
echo "=========================================="

if ! command -v git >/dev/null 2>&1; then
  echo "⚠ git 不在 → このテストは実行できない（SKIP）"
  exit 0
fi
if ! git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "⚠ git work tree の外（SKIP）"
  exit 0
fi

bash -n "$0" && ok "このテスト自身 構文 OK (bash -n)" || ng "このテスト自身 構文エラー"

# --- 検査関数 ---------------------------------------------------------------
# list_tracked_bundles <repo>
#   .gitignore が受け渡し物として挙げているのと同じ集合を、追跡ファイルの中から拾う。
#   -z（NUL 区切り）で読むのは、改行を含むパス名でもレコードが割れないようにするため。
#   見つかったパスを1行1件で stdout に出す（無ければ何も出さない）。
list_tracked_bundles() {
  git -C "$1" ls-files -z -- \
      '*.bundle' '*.bundle.force' '*.bundle.failed' \
      '*.bundle.force.failed' '*.bundle.landing-*' 2>/dev/null \
    | tr '\0' '\n' | sed '/^$/d'
}

# --- A: この repo に追跡された bundle が無い --------------------------------
found="$(list_tracked_bundles "$REPO_DIR")"
if [ -z "$found" ]; then
  ok "A1 追跡された *.bundle は 0 件"
else
  ng "A1 追跡された *.bundle が残っている:"
  echo "$found" | sed 's/^/       - /'
  echo "       → 削除するには: git rm -- <パス>（手元に残したいときは --cached。以後は .gitignore が効く）"
fi

# --- B: 無視規則が残っている ------------------------------------------------
# A1 を緑に保つ前提。規則が消えると次の受け渡し物がまた tracked になり得る。
if grep -qx '/\*\.bundle' "$REPO_DIR/.gitignore" 2>/dev/null; then
  ok "B1 .gitignore に /*.bundle がある"
else
  ng "B1 .gitignore の /*.bundle が消えている（受け渡し物がまた追跡され得る）"
fi

# --- C: 検査関数が空振りしていない（★ここが本体） ---------------------------
SBX="$(mktemp -d)"
trap 'rm -rf "$SBX"' EXIT

git -C "$SBX" init -q 2>/dev/null
git -C "$SBX" config user.email t@example.invalid
git -C "$SBX" config user.name  tester

: > "$SBX/README.md"
git -C "$SBX" add README.md >/dev/null 2>&1
git -C "$SBX" commit -qm init >/dev/null 2>&1

sbx_found="$(list_tracked_bundles "$SBX")"
if [ -z "$sbx_found" ]; then
  ok "C0 bundle の無い sandbox では 0 件（常に赤ではない）"
else
  ng "C0 bundle の無い sandbox で誤検出した: $sbx_found"
fi

# 追跡された bundle を1本置く（.gitignore があっても -f で入り得る、という現実の経路）
printf 'not a real bundle\n' > "$SBX/handoff.bundle"
printf '/*.bundle\n' > "$SBX/.gitignore"
git -C "$SBX" add -f handoff.bundle .gitignore >/dev/null 2>&1
git -C "$SBX" commit -qm add-bundle >/dev/null 2>&1

sbx_found="$(list_tracked_bundles "$SBX")"
if [ "$sbx_found" = "handoff.bundle" ]; then
  ok "C1 追跡された bundle を1本置くと検出する（.gitignore があっても）"
else
  ng "C1 検出できていない（期待 handoff.bundle / 実際 '$sbx_found'）"
fi

# 退避名（land.sh が失敗時に付ける形）も拾えるか
printf 'x\n' > "$SBX/handoff.bundle.force"
git -C "$SBX" add -f handoff.bundle.force >/dev/null 2>&1
git -C "$SBX" commit -qm add-force >/dev/null 2>&1
sbx_found="$(list_tracked_bundles "$SBX")"
case "$sbx_found" in
  *handoff.bundle.force*) ok "C2 退避名 *.bundle.force も検出する" ;;
  *) ng "C2 退避名を取りこぼした: '$sbx_found'" ;;
esac

# 追跡を外せば 0 件に戻る
git -C "$SBX" rm -q --cached handoff.bundle handoff.bundle.force >/dev/null 2>&1
git -C "$SBX" commit -qm untrack >/dev/null 2>&1
sbx_found="$(list_tracked_bundles "$SBX")"
if [ -z "$sbx_found" ]; then
  ok "C3 追跡を外すと 0 件に戻る（直し方が実際に効く）"
else
  ng "C3 追跡を外しても残っている: '$sbx_found'"
fi

echo "------------------------------------------"
echo "  PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
