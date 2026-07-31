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
#   - **原子的な反映（partial write が原本に届かない）**: 新しい本文は CHANGELOG と同じ
#     ディレクトリに作った作業領域 `.changelog_merge.XXXXXX/` の中で組み立て、完成して
#     空でないことを確認してから `mv`（= 同一ファイルシステムの rename(2)）で差し替える。
#     組み立ての途中で失敗しても、書きかけの内容は CHANGELOG.md に一切届かない。
#   - **retry-safe な断片削除**: 反映後の削除が途中で失敗したら、CHANGELOG と
#     「すでに削除した断片」を両方とも元に戻してから非ゼロ終了する。状態は実行前と同じに
#     戻るので、原因を直して再実行すれば **1 回だけ** 反映される（重複連結しない）。
#     ロールバック自体に失敗した場合は、作業領域（原本と全断片の退避物）を**消さずに残し**、
#     復旧手順を示して exit 3 する。
#   - **割り込み（INT / TERM / HUP）でも中途半端な状態を残さない**: 反映が済んだあと・断片の
#     削除中にシグナルを受けても、そのままプロセスを落とさずロールバックしてから終了する
#     （＝「CHANGELOG は反映済み・断片は一部だけ消えた」状態で終わらない）。ロールバック中は
#     同じシグナルを無視して復旧を完遂させ、それでも失敗したら退避物を残して exit 3 する。
#   - **断片の TOCTOU を排除**: 連結入力は「退避した断片のスナップショット」であって live の
#     ファイルではない。さらに live 断片を消す直前に、退避物と **1 byte 単位で同一** かを
#     確認する。退避後に書き換えられた（＝まだ連結していない新しい内容を持つ）断片は
#     **削除せず**、全体をロールバックして非ゼロ終了する。
#   - **空 / 空白のみの断片は全変更の前に拒否**: 1 本でも空なら全体を中止し、
#     CHANGELOG.md は不変・断片は 1 本も削除しない（部分反映しない）。
#   - README.md は断片として扱わない（規約の説明ファイル）。
#
# 終了コード:
#   0 = 成功 / no-op
#   1 = I/O 失敗・割り込み（状態は実行前のまま。反映後ならロールバック済み）
#   2 = 引数・入力の不正（空/空白のみの断片を含む。何も変更していない）
#   3 = ロールバック失敗（作業領域を保持。**手動復旧が必要**）
#
# 依存: bash 3.2+ / awk / sort / grep / cmp / cp / mv / rm / mktemp（macOS の既定で動く）。
#   network 不使用。
#   多バイト文字が隣接する変数参照は #243 と同じく ${VAR} で bracing する
#   （bash 3.2 + UTF-8 ロケール + set -u で「未割り当ての変数」になるため）。
# =============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGELOG="$REPO_ROOT/docs/CHANGELOG.md"
FRAG_DIR="$REPO_ROOT/docs/changelog.d"
POSITION="end"
DRY_RUN="no"

WORK=""
KEEP_WORK="no"
# "yes" になった時点から先は「CHANGELOG が差し替わっているかもしれない」区間。
# ここで失敗・割り込みが起きたら必ず rollback を通す（arm は差し替えの直前に行う）。
ROLLBACK_ARMED="no"

cleanup() {
  if [ -n "$WORK" ] && [ -d "$WORK" ] && [ "$KEEP_WORK" = "no" ]; then
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

# --- 割り込み（INT / TERM / HUP）---------------------------------------------
# 既定のままだと、反映後・断片削除中に Ctrl-C / kill を受けた瞬間にプロセスが落ち、
# 「CHANGELOG は反映済み・断片は一部だけ消えた」状態（再実行で二重連結）で残る。
# シグナルはトラップして、反映後ならロールバックしてから終了する。
# ※ bash はコマンド実行の完了後にトラップを走らせるので、rm 1 本の途中で切れることはない。
on_signal() {
  # ロールバック中に同じシグナルが再度届いても復旧を中断しない。
  trap '' INT TERM HUP
  echo "" >&2
  echo "シグナル ${1} を受けた → 安全に中断する" >&2
  if [ "$ROLLBACK_ARMED" = "yes" ]; then
    handle_post_publish_failure
    exit $?
  fi
  echo "  反映前なので CHANGELOG.md も断片も変更していない（作業領域だけ片付ける）" >&2
  exit 1
}
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP' HUP

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
    -h|--help)    sed -n '2,58p' "${BASH_SOURCE[0]}"; exit 0 ;;
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

# --- 事前検証: 空 / 空白のみ / 読めない 断片は「1 本でもあれば」全体を中止 -----
# ここは CHANGELOG も断片も 1 byte も触っていない地点。混在（正常な断片 + 空の断片）
# でも部分反映せず全体を中止する。
# 読み取り可否は [ -r ] ではなく実際の読み取り結果で判定する（root では [ -r ] が
# 常に真になり判定にならないため）。grep: 0=非空白あり / 1=空か空白のみ / 2+=読めない。
BLANK_FRAGS=""
UNREADABLE_FRAGS=""
while IFS= read -r f; do
  grep -q '[^[:space:]]' "$f" 2>/dev/null
  case "$?" in
    0) : ;;
    1) BLANK_FRAGS="${BLANK_FRAGS}  - $(basename "$f")
" ;;
    *) UNREADABLE_FRAGS="${UNREADABLE_FRAGS}  - ${f}
" ;;
  esac
done <<EOF
$FRAGS
EOF

if [ -n "$UNREADABLE_FRAGS" ]; then
  echo "断片を読めない → 全体を中止（CHANGELOG.md は不変・断片は全て保持）:" >&2
  printf '%s' "$UNREADABLE_FRAGS" >&2
  exit 1
fi

if [ -n "$BLANK_FRAGS" ]; then
  echo "空（または空白のみ）の断片がある → 全体を中止（CHANGELOG.md は不変・断片は全て保持）:" >&2
  printf '%s' "$BLANK_FRAGS" >&2
  echo "  ※ 1 本でも空なら他の断片も連結しない（部分反映しない）。中身を書くか、断片を削除してから再実行する。" >&2
  exit 2
fi

if [ "$DRY_RUN" = "yes" ]; then
  echo "--dry-run のため書き換えない（断片も削除しない）"
  exit 0
fi

# 書き込み・削除が明らかに不能な場合は、作業を始める前に中止する（非 root の早期検出）。
[ -w "$CHANGELOG" ] || { echo "CHANGELOG に書き込めない: ${CHANGELOG}" >&2; exit 1; }
[ -w "$FRAG_DIR" ] || { echo "断片を削除できないディレクトリ: ${FRAG_DIR}" >&2; exit 1; }

# --- 前後の空行を落として本文だけを出す --------------------------------------
strip_blank_edges() {
  awk '
    { l[NR] = $0; if (NF) { if (!s) s = NR; p = NR } }
    END { if (!s) exit; for (i = s; i <= p; i++) print l[i] }
  ' "$1"
}

# --- 作業領域（CHANGELOG と同じディレクトリ = 同一ファイルシステム） ----------
# ここに ①原本の退避 ②新しい本文 ③全断片の退避 を置く。
# 同じファイルシステムに置くのは、差し替え・復元を mv（rename(2)）で原子的に行うため。
CHANGELOG_DIR="$(cd "$(dirname "$CHANGELOG")" && pwd)" || {
  echo "CHANGELOG のディレクトリを解決できない: ${CHANGELOG}" >&2; exit 1; }
CHANGELOG_ABS="${CHANGELOG_DIR}/$(basename "$CHANGELOG")"

WORK="$(mktemp -d "${CHANGELOG_DIR}/.changelog_merge.XXXXXX")" || {
  echo "作業領域を作れない: ${CHANGELOG_DIR}" >&2; exit 1; }

BACKUP="$WORK/changelog.bak"      # 原本の退避（ロールバックの元）
NEW="$WORK/changelog.new"         # 新しい本文（完成後に mv で差し替える）
RESTORE="$WORK/changelog.restore" # ロールバック時の中継（原子的復元用）
FRAG_BAK="$WORK/frags"            # 全断片の退避
QUARANTINE="$WORK/quarantine"      # 削除前に原子的に隔離した live 断片

if ! cp -p "$CHANGELOG_ABS" "$BACKUP"; then
  echo "原本を退避できない → 中止（CHANGELOG.md は不変・断片は全て保持）" >&2
  exit 1
fi
# NEW はまず原本のコピーとして作り、モード（権限）を引き継がせてから中身を書き換える。
# BSD/GNU 差のある stat/chmod --reference を使わずにモードを保つための手順。
if ! cp -p "$CHANGELOG_ABS" "$NEW"; then
  echo "作業ファイルを作れない → 中止（CHANGELOG.md は不変・断片は全て保持）" >&2
  exit 1
fi
if ! mkdir -p "$FRAG_BAK" "$QUARANTINE"; then
  echo "断片の退避先を作れない → 中止（CHANGELOG.md は不変・断片は全て保持）" >&2
  exit 1
fi

# --- 全断片を先に退避する（＝連結入力のスナップショット兼、復元元） -----------
# ここで取った退避物が **このあとの唯一の連結入力** になる。live の断片は二度と読まない。
# こうしないと「連結時に読んだ内容」と「削除時に消える内容」がズレうる（TOCTOU）。
FRAG_COUNT=0
while IFS= read -r f; do
  FRAG_COUNT=$((FRAG_COUNT + 1))
  if ! cp -p "$f" "${FRAG_BAK}/${FRAG_COUNT}.frag"; then
    echo "断片を退避できない: ${f} → 中止（CHANGELOG.md は不変・断片は全て保持）" >&2
    exit 1
  fi
  if ! printf '%s\n' "$f" > "${FRAG_BAK}/${FRAG_COUNT}.path"; then
    echo "断片の退避情報を書けない: ${f} → 中止（CHANGELOG.md は不変・断片は全て保持）" >&2
    exit 1
  fi
done <<EOF
$FRAGS
EOF

# 退避物（＝実際の連結入力）に対して空検査をやり直す。事前検証から退避までの間に
# 断片が空にされていた場合をここで捕まえる。この地点は CHANGELOG も断片も未変更。
SNAP_BLANK=""
n=1
while [ "$n" -le "$FRAG_COUNT" ]; do
  grep -q '[^[:space:]]' "${FRAG_BAK}/${n}.frag" 2>/dev/null || SNAP_BLANK="${FRAG_BAK}/${n}.frag"
  n=$((n + 1))
done
if [ -n "$SNAP_BLANK" ]; then
  echo "断片が退避の直前に空になった（または退避物を読めない）→ 全体を中止（CHANGELOG.md は不変・断片は全て保持）" >&2
  exit 2
fi

# --- 新しい本文を作業領域で組み立てる（ここでの失敗は原本に届かない） ---------
# 入力は live の断片ではなく退避したスナップショット。
emit_fragments() {
  local n=1
  while [ "$n" -le "$FRAG_COUNT" ]; do
    [ -f "${FRAG_BAK}/${n}.frag" ] || { echo "断片の退避物が消失した: ${FRAG_BAK}/${n}.frag" >&2; return 1; }
    printf '\n'
    strip_blank_edges "${FRAG_BAK}/${n}.frag" || return 1
    n=$((n + 1))
  done
}

if [ "$POSITION" = "end" ]; then
  if ! strip_blank_edges "$CHANGELOG_ABS" > "$NEW"; then
    echo "既存CHANGELOGの読み込みに失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
  if ! emit_fragments >> "$NEW"; then
    echo "断片の生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
else
  # ヘッダブロック（先頭から最初の水平線 `---` まで）の直後へ挿入する。
  # `---` が無い場合は先頭 1 行（見出し）の直後に入れる。
  SPLIT=$(awk '$0 == "---" { print NR; exit }' "$CHANGELOG_ABS")
  [ -n "$SPLIT" ] || SPLIT=1
  if ! awk -v n="$SPLIT" 'NR <= n' "$CHANGELOG_ABS" > "$NEW"; then
    echo "ヘッダの生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
  if ! emit_fragments >> "$NEW"; then
    echo "断片の生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
  printf '\n' >> "$NEW" || { echo "作業ファイルへの書き込みに失敗 → 中止（CHANGELOG.md は不変）" >&2; exit 1; }
  if ! awk -v n="$SPLIT" 'NR > n' "$CHANGELOG_ABS" | strip_blank_edges /dev/stdin >> "$NEW"; then
    echo "連結内容の生成に失敗 → 中止（CHANGELOG.md は不変）" >&2
    exit 1
  fi
fi

printf '\n' >> "$NEW" || { echo "作業ファイルへの書き込みに失敗 → 中止（CHANGELOG.md は不変）" >&2; exit 1; }

# 空になっていないことを最低限確認してから差し替える
if [ ! -s "$NEW" ]; then
  echo "生成結果が空になった → 中止（CHANGELOG.md は不変）" >&2
  exit 1
fi

# --- ロールバック（反映後の失敗・割り込みで、実行前の状態へ完全に戻す） -------
rollback() {
  local failed="no"
  echo "ロールバックする（CHANGELOG と全断片を実行前の状態へ戻す）" >&2

  # ① CHANGELOG を原本へ戻す（退避物は消さずに残したいので cp → mv の 2 段）
  if cp -p "$BACKUP" "$RESTORE" && mv -f "$RESTORE" "$CHANGELOG_ABS"; then
    :
  else
    failed="yes"
    echo "  ✗ CHANGELOG の復元に失敗: ${CHANGELOG_ABS}" >&2
  fi

  # ② すでに削除された断片を書き戻す（残っている断片はそのまま = 冪等）
  local j=1
  local p=""
  while [ "$j" -le "$FRAG_COUNT" ]; do
    if [ ! -f "${FRAG_BAK}/${j}.path" ] || ! IFS= read -r p < "${FRAG_BAK}/${j}.path"; then
      failed="yes"
      echo "  ✗ 退避情報を読めない: ${FRAG_BAK}/${j}.path" >&2
      j=$((j + 1))
      continue
    fi
    if [ -e "${QUARANTINE}/${j}.frag" ]; then
      if [ -e "$p" ]; then
        failed="yes"
        echo "  ✗ 元パスに新しい断片が存在するため上書きしない: ${p}" >&2
      elif mv "${QUARANTINE}/${j}.frag" "$p"; then
        :
      else
        failed="yes"
        echo "  ✗ 隔離した断片の復元に失敗: ${p}" >&2
      fi
    elif [ ! -e "$p" ]; then
      if cp -p "${FRAG_BAK}/${j}.frag" "$WORK/frag.restore" && mv -f "$WORK/frag.restore" "$p"; then
        :
      else
        failed="yes"
        echo "  ✗ 断片の復元に失敗: ${p}" >&2
      fi
    fi
    j=$((j + 1))
  done

  [ "$failed" = "no" ]
}

# 反映後（= ROLLBACK_ARMED）に起きた失敗・割り込みの共通処理。
# 戻り値 1 = ロールバック成功（状態は実行前と同じ）／3 = ロールバック失敗（退避物を保持）。
handle_post_publish_failure() {
  if rollback; then
    echo "ロールバック完了: CHANGELOG.md も断片も実行前の状態に戻した。" >&2
    echo "原因を解消してから再実行すれば、1 回だけ反映される。" >&2
    return 1
  fi
  KEEP_WORK="yes"
  echo "" >&2
  echo "!! ロールバックに失敗した。手動復旧が必要 !!" >&2
  echo "   退避物は消さずに残してある: ${WORK}" >&2
  echo "     - ${BACKUP}          … 実行前の CHANGELOG.md" >&2
  echo "     - ${FRAG_BAK}/N.frag … 実行前の断片本体（対応する N.path が元のパス）" >&2
  echo "   これらを手で戻し、確認後に ${WORK} を削除すること。" >&2
  return 3
}

# --- 反映（原子的差し替え）---------------------------------------------------
# ここまでは CHANGELOG.md を 1 byte も触っていない。差し替えは rename(2) 1 回で、
# 中途半端な内容が見えることはない。
# arm は mv の**前**に行う: mv 完了直後にシグナルを受けた場合でも（トラップはコマンド
# 完了後に走るため）反映済みとして扱い、確実にロールバックを通すため。
ROLLBACK_ARMED="yes"
if ! mv -f "$NEW" "$CHANGELOG_ABS"; then
  echo "CHANGELOG の反映に失敗: ${CHANGELOG_ABS}" >&2
  handle_post_publish_failure
  exit $?
fi

# --- 連結が成功したので断片を原子的に隔離し、内容を照合する ------------------
# live 断片を同一ファイルシステム上の quarantine へ rename してから照合する。
# これにより「照合成功後・rm 直前」に別プロセスが同じ inode を更新する窓をなくす。
# 不一致・失敗・割り込み時は quarantine の実体を元パスへ戻すため、新内容も失わない。
DELETE_FAILED=""
MUTATED=""
j=1
p=""
while [ "$j" -le "$FRAG_COUNT" ]; do
  if [ ! -f "${FRAG_BAK}/${j}.path" ] || ! IFS= read -r p < "${FRAG_BAK}/${j}.path"; then
    DELETE_FAILED="${FRAG_BAK}/${j}.path（退避情報を読めない）"
    break
  fi
  if ! mv "$p" "${QUARANTINE}/${j}.frag"; then
    DELETE_FAILED="$p"
    break
  fi
  if ! cmp -s "${QUARANTINE}/${j}.frag" "${FRAG_BAK}/${j}.frag"; then
    MUTATED="$p"
    break
  fi
  j=$((j + 1))
done

if [ -n "$MUTATED" ]; then
  echo "断片が退避後に変更された（または消失した）: ${MUTATED}" >&2
  echo "  連結したのは退避時点の内容なので、この断片は削除しない（新しい内容を失わないため）。" >&2
  handle_post_publish_failure
  exit $?
fi

if [ -n "$DELETE_FAILED" ]; then
  echo "連結済み断片の削除に失敗: ${DELETE_FAILED}" >&2
  handle_post_publish_failure
  exit $?
fi

echo "連結完了。断片は削除した（残りは ${FRAG_DIR}/README.md のみ）。"
