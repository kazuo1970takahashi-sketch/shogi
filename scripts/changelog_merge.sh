#!/usr/bin/env bash
# =============================================================================
# changelog_merge.sh — STAGE0-CONFLICT-FREE-001 ②
#   docs/changelog.d/ に置かれた「1 スライス = 1 ファイル」の断片を、日付順に
#   docs/CHANGELOG.md へ連結し、連結した断片を削除する。
#
# なぜ: 従来は各スライスが docs/CHANGELOG.md を直接編集していたため、共有の追記点で
#   全スライスが衝突していた（SPLIT-FEASIBILITY-001 §5: 実測した並行衝突 18 件のうち
#   12 件が run_tests.sh の末尾追記と CHANGELOG.md の追記だけに起因）。
#   断片方式にすると、各スライスは自分専用のファイルを 1 本置くだけになり衝突しない。
#   連結はリリース列車の組成時に 1 回だけ行う。
#
# 使い方:
#   bash scripts/changelog_merge.sh                 # 連結して断片を削除
#   bash scripts/changelog_merge.sh --dry-run       # 何も書き換えず、やることだけ表示
#   bash scripts/changelog_merge.sh --position top  # 冒頭（ヘッダ直後）へ挿入
#   bash scripts/changelog_merge.sh --changelog PATH --fragments DIR   # 対象の差し替え（テスト用）
#
# 既定の挿入位置 = end（末尾）:
#   docs/CHANGELOG.md は冒頭に「記載は原文の並び（おおむね時系列・**上が古い**）」と明記されており、
#   実際の直近スライスも末尾へ追記している（例: SB-LIVE-SELECT-WIDTH-001 は `@@ -183,3 +183,10 @@`）。
#   したがって既定は末尾連結とし、冒頭へ入れたい場合だけ --position top を使う。
#
# 性質:
#   - 冪等: 断片が 0 本なら何もしない（CHANGELOG.md を 1 byte も触らない・exit 0）。
#   - 決定的: 断片は LC_ALL=C の sort 順で連結する。ファイル名を `<YYYYMMDD>_<スライスID>.md`
#     にしておけば sort 順 = 日付順になる。
#   - 安全: いったん一時ファイルへ組み立て、空でないことを確認してから CHANGELOG.md へ流し込む
#     （既存ファイルの inode/権限を保つため mv ではなく上書き）。断片の削除は連結が成功したあとだけ。
#   - README.md は断片として扱わない（規約の説明ファイル）。
#
# 依存: bash 3.2+ / awk / sort（macOS の既定で動く）。network 不使用。
#   多バイト文字が隣接する変数参照は #243 と同じく ${VAR} で bracing する
#   （bash 3.2 + UTF-8 ロケール + set -u で「未割り当ての変数」になるため）。
# =============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGELOG="$REPO_ROOT/docs/CHANGELOG.md"
FRAG_DIR="$REPO_ROOT/docs/changelog.d"
POSITION="end"
DRY_RUN="no"

require_option_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "${1} には値が必要" >&2
    exit 2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)    DRY_RUN="yes"; shift ;;
    --position)   require_option_value "$@"; POSITION="$2"; shift 2 ;;
    --changelog)  require_option_value "$@"; CHANGELOG="$2"; shift 2 ;;
    --fragments)  require_option_value "$@"; FRAG_DIR="$2"; shift 2 ;;
    -h|--help)    sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "不明な引数: ${1}" >&2; exit 2 ;;
  esac
done

case "$POSITION" in
  end|top) : ;;
  *) echo "--position は end / top のみ（指定値: '${POSITION}'）" >&2; exit 2 ;;
esac

[ -f "$CHANGELOG" ] || { echo "CHANGELOG がない: ${CHANGELOG}" >&2; exit 2; }
[ -r "$CHANGELOG" ] || { echo "CHANGELOG を読めない: ${CHANGELOG}" >&2; exit 1; }

if [ ! -d "$FRAG_DIR" ]; then
  echo "断片ディレクトリがない: ${FRAG_DIR} → 何もしない"
  exit 0
fi

# --- 断片の列挙（README.md は除外・LC_ALL=C sort で決定的） -------------------
FRAGS=$(printf '%s\n' "$FRAG_DIR"/*.md 2>/dev/null \
        | while IFS= read -r f; do
            [ -f "$f" ] || continue
            [ "$(basename "$f")" = "README.md" ] && continue
            echo "$f"
          done | LC_ALL=C sort)

if [ -z "$FRAGS" ]; then
  echo "断片なし（${FRAG_DIR}）→ 何もしない（CHANGELOG.md は不変）"
  exit 0
fi

echo "連結する断片（この順）:"
printf '%s\n' "$FRAGS" | while IFS= read -r f; do echo "  - $(basename "$f")"; done
echo "連結先: ${CHANGELOG}（position=${POSITION}）"

if [ "$DRY_RUN" = "yes" ]; then
  echo "--dry-run のため書き換えない（断片も削除しない）"
  exit 0
fi

# 読み取り・削除不能が明らかな場合は、CHANGELOG を上書きする前に中止する。
# 実際の書き込み・削除も個別に終了コードを確認し、途中の失敗を成功扱いしない。
while IFS= read -r f; do
  [ -r "$f" ] || { echo "断片を読めない: ${f}" >&2; exit 1; }
done <<EOF
$FRAGS
EOF
[ -w "$CHANGELOG" ] || { echo "CHANGELOG に書き込めない: ${CHANGELOG}" >&2; exit 1; }
[ -w "$FRAG_DIR" ] || { echo "断片を削除できないディレクトリ: ${FRAG_DIR}" >&2; exit 1; }

# --- 前後の空行を落として本文だけを出す --------------------------------------
strip_blank_edges() {
  awk '
    { l[NR] = $0; if (NF) { if (!s) s = NR; p = NR } }
    END { if (!s) exit; for (i = s; i <= p; i++) print l[i] }
  ' "$1"
}

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

emit_fragments() {
  while IFS= read -r f; do
    [ -f "$f" ] || { echo "断片が消失した: ${f}" >&2; return 1; }
    printf '\n'
    strip_blank_edges "$f" || return 1
  done <<EOF
$FRAGS
EOF
}

if [ "$POSITION" = "end" ]; then
  if ! strip_blank_edges "$CHANGELOG" > "$TMP"; then
    echo "既存CHANGELOGの読み込みに失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
  if ! emit_fragments >> "$TMP"; then
    echo "断片の生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
else
  # ヘッダブロック（先頭から最初の水平線 `---` まで）の直後へ挿入する。
  # `---` が無い場合は先頭 1 行（見出し）の直後に入れる。
  SPLIT=$(awk '$0 == "---" { print NR; exit }' "$CHANGELOG")
  [ -n "$SPLIT" ] || SPLIT=1
  if ! awk -v n="$SPLIT" 'NR <= n' "$CHANGELOG" > "$TMP"; then
    echo "ヘッダの生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
  if ! emit_fragments >> "$TMP"; then
    echo "断片の生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
  printf '\n' >> "$TMP" || { echo "一時ファイルへの書き込みに失敗" >&2; exit 1; }
  if ! awk -v n="$SPLIT" 'NR > n' "$CHANGELOG" | strip_blank_edges /dev/stdin >> "$TMP"; then
    echo "連結内容の生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
fi

printf '\n' >> "$TMP" || { echo "一時ファイルへの書き込みに失敗" >&2; exit 1; }

# 空になっていないことを最低限確認してから差し替える
if [ ! -s "$TMP" ]; then
  echo "生成結果が空になった → 中止（CHANGELOG.md は不変）" >&2
  exit 1
fi

if ! cat "$TMP" > "$CHANGELOG"; then
  echo "CHANGELOG の書き込みに失敗（断片は保持）: ${CHANGELOG}" >&2
  exit 1
fi

# --- 連結が成功したので断片を削除する ----------------------------------------
while IFS= read -r f; do
  [ -f "$f" ] || { echo "削除前に断片が消失した: ${f}" >&2; exit 1; }
  if ! rm -f "$f"; then
    echo "連結済み断片の削除に失敗: ${f}" >&2
    exit 1
  fi
done <<EOF
$FRAGS
EOF

echo "連結完了。断片は削除した（残りは ${FRAG_DIR}/README.md のみ）。"
