#!/usr/bin/env bash
# =============================================================================
# mutation_cache.sh — 変異チェックを「入力が前回 PASS 時と同一なら走らせない」
#   [E2E-MUT-SKIP-001]
#
#   背景と、畳めない残余リスク (5) の受け方は test/tools/mutation_input_key.js の
#   ヘッダに全部書いてある。**先にそちらを読むこと。**
#
#   ここが守る規律:
#     - キャッシュは **repo 内 .mutcache/（.gitignore 済み・コミット対象外）**。
#       クリーン checkout には存在しない ＝ **CI は必ずフル実行**。
#     - **CI 環境（$CI が非空）ではキャッシュを引かない・書かない**。
#     - `MUT_FULL=1` でいつでもフル強制（release / マージ直前はこれを使う）。
#     - 記録するのは **FAIL=0 で完走したときだけ**。
#     - TTL（既定24時間）を過ぎた記録は使わない。**ヒットしても記録の mtime は触らない**
#       （触ると TTL が無限に延びて「無期限に緑を持ち回る」状態になる）。
#     - skip したときは `MUTCACHE-SKIP` を必ず標準出力に出す。run_e2e.sh はこの語で
#       「PASS」ではなく「スキップ」として集計・表示する（緑と非実行を区別する）。
#
# 使い方（チェッカー .sh 側）:
#   . "$HERE/../lib/mutation_cache.sh"
#   MUTKEY="$(mutcache_key "$TARGET" "$GEN" "$SUITE" "$0")" || MUTKEY=""
#   if mutcache_hit "chg881" "$MUTKEY"; then exit 0; fi
#   ... 実行 ...
#   [ "$fail" -eq 0 ] && mutcache_store "chg881" "$MUTKEY"
#
# 依存: bash 3.2+（macOS 既定）/ node。network 不使用。
# =============================================================================

# このファイルの場所から repo 直下を求める（test/lib/ の2つ上）
_MC_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_MC_REPO_ROOT="$(cd "$_MC_LIB_DIR/../.." && pwd)"
# ★ 置き場所と TTL は **呼ぶたびに** 環境変数を読む。source した時点で1回だけ確定させると、
#   `MUT_CACHE_TTL=0 mutcache_hit ...` のような1回限りの指定が黙って効かない（実測）。
_mc_dir() { echo "${MUT_CACHE_DIR:-$_MC_REPO_ROOT/.mutcache}"; }
_mc_ttl() { echo "${MUT_CACHE_TTL:-86400}"; }

# 環境ごとに違う stat（GNU は -c %Y・BSD/macOS は -f %m）
# ★ 罠: GNU stat の `-f` は --file-system で、`stat -f %m file` は**成功して mount point**
#   （"/"）を返す。「BSD を先に試して失敗したら GNU」と書くと Linux で常に "/" を掴み、
#   キャッシュが黙って一度も当たらなくなる（2026-08-17 に実測）。
#   → **GNU を先に試し、数字でなければ BSD を試し、それでも数字でなければ空**にする。
_mc_mtime() {
  _v="$(stat -c %Y "$1" 2>/dev/null)"
  case "$_v" in ''|*[!0-9]*) _v="$(stat -f %m "$1" 2>/dev/null)" ;; esac
  case "$_v" in ''|*[!0-9]*) _v="" ;; esac
  echo "$_v"
}

# キャッシュを使ってよい状況か（0=使ってよい）
_mc_enabled() {
  [ "${MUT_FULL:-0}" = "1" ] && return 1
  [ -n "${CI:-}" ] && return 1
  return 0
}

# mutcache_key <target> <gen.js> <suite.js> <checker.sh> [extra...]
#   成功=鍵を標準出力へ / 失敗=何も出さず非0（呼び出し側はフル実行する）
mutcache_key() {
  _mc_enabled || return 1
  _mc_target="$1"; _mc_gen="$2"; _mc_suite="$3"; shift 3
  _mc_extra_args=""
  for _f in "$@"; do _mc_extra_args="$_mc_extra_args --extra $_f"; done
  # ★ この lib と鍵生成ツール自身も鍵に含める（算法が変われば旧キャッシュは当たらない）
  node "$_MC_LIB_DIR/../tools/mutation_input_key.js" \
    --target "$_mc_target" --gen "$_mc_gen" --suite "$_mc_suite" \
    --extra "$_MC_LIB_DIR/mutation_cache.sh" \
    --extra "$_MC_LIB_DIR/../tools/mutation_input_key.js" \
    $_mc_extra_args 2>/dev/null
}

# mutcache_hit <name> <key> — 0=有効な記録がある（＝skip してよい・理由も出力済み）
mutcache_hit() {
  _mc_name="$1"; _mc_key="${2:-}"
  _mc_enabled || return 1
  [ -n "$_mc_key" ] || return 1
  _mc_f="$(_mc_dir)/$_mc_name.$_mc_key"
  [ -f "$_mc_f" ] || return 1
  # ★ Codex P1 (r3794397150) とその同型を **クラスごと**塞ぐ:
  #   「時刻・数値が異常なときに、比較が素通りしてヒット側へ落ちる」経路を全部 fail closed にする。
  #     - mtime が非数値（stat の互換崩れ）      → フル実行
  #     - now が非数値（date の異常）             → フル実行
  #     - **TTL が非数値**（`MUT_CACHE_TTL=abc`）→ `[ ... -ge ... ]` が **エラーで偽**を返し、
  #       「TTL 超過ではない」＝**ヒット**に落ちていた。数値でなければフル実行にする
  #     - **age が負**（スナップショット復元・時刻補正で mtime が未来）→ TTL を無期限に回避
  #       できてしまうのでフル実行
  _mc_now="$(date +%s)"
  _mc_mt="$(_mc_mtime "$_mc_f")"
  _mc_ttl_v="$(_mc_ttl)"
  case "$_mc_now" in ''|*[!0-9]*) echo "  （現在時刻を取得できない → フル実行する）"; return 1 ;; esac
  case "$_mc_mt"  in ''|*[!0-9]*) return 1 ;; esac
  case "$_mc_ttl_v" in ''|*[!0-9]*)
    echo "  （TTL が数値でない: '$_mc_ttl_v' → フル実行する）"; return 1 ;;
  esac
  _mc_age=$((_mc_now - _mc_mt))
  if [ "$_mc_age" -lt 0 ]; then
    echo "  （記録の時刻が未来（age=${_mc_age}秒）＝時計が飛んでいる → フル実行する）"
    return 1
  fi
  if [ "$_mc_age" -ge "$_mc_ttl_v" ]; then
    echo "  （前回 PASS の記録はあるが TTL 超過: ${_mc_age}秒 ≥ ${_mc_ttl_v}秒 → フル実行する）"
    return 1
  fi
  echo "MUTCACHE-SKIP $_mc_name"
  echo "  スキップ: 入力が前回 PASS 時と **byte 単位で同一**（鍵 $(echo "$_mc_key" | cut -c1-12)…）"
  echo "  前回の実測: $(head -1 "$_mc_f" 2>/dev/null)（${_mc_age}秒前・TTL ${_mc_ttl_v}秒）"
  echo "  同一と判定した入力: チェッカー本体 / 変異ジェネレータ / e2e スイート / 変異が当たる HTML 領域＋前後400字 / node・playwright 版"
  echo "  ★ 再検証していないもの: 上記領域**以外**の HTML 変更。素の e2e（対照）は今回も走っている。"
  echo "  ★ CI は毎回フル実行（キャッシュ不在）。手元で全部走らせるには MUT_FULL=1。"
  return 0
}

# mutcache_store <name> <key> — FAIL=0 のときだけ呼ぶこと
mutcache_store() {
  _mc_name="$1"; _mc_key="${2:-}"
  _mc_enabled || return 0
  [ -n "$_mc_key" ] || return 0
  _mc_d="$(_mc_dir)"
  mkdir -p "$_mc_d" 2>/dev/null || return 0
  echo "$(date '+%Y-%m-%d %H:%M:%S')" > "$_mc_d/$_mc_name.$_mc_key" 2>/dev/null || return 0
  # 掃除は **TTL を過ぎた記録だけ**。
  # ★ 「同名・別鍵は用済み」として消すと、枝を行き来する使い方（A で実行 → B で実行 → A に戻る）で
  #   毎回消し合って一度も当たらなくなる。鍵は入力そのものなので、複数残っていても誤ヒットしない。
  _mc_now2="$(date +%s)"
  _mc_ttl_v2="$(_mc_ttl)"
  # 掃除も同じ規律。値が異常なら**何も消さない**（消しすぎより残すほうが安全側）
  case "$_mc_now2"   in ''|*[!0-9]*) return 0 ;; esac
  case "$_mc_ttl_v2" in ''|*[!0-9]*) return 0 ;; esac
  for _f in "$_mc_d/$_mc_name".*; do
    [ -e "$_f" ] || continue
    [ "$_f" = "$_mc_d/$_mc_name.$_mc_key" ] && continue
    _mc_mt2="$(_mc_mtime "$_f")"
    case "$_mc_mt2" in ''|*[!0-9]*) continue ;; esac
    [ $((_mc_now2 - _mc_mt2)) -ge "$_mc_ttl_v2" ] && rm -f "$_f" 2>/dev/null
  done
  return 0
}
