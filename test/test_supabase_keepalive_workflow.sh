#!/usr/bin/env bash
# =============================================================================
# test_supabase_keepalive_workflow.sh — KEEPALIVE-001 の静的ゲート
#
#   .github/workflows/supabase-keepalive.yml の「受け入れ基準 2」
#   （新しい secret・新しい公開窓・DB 書き込みを一切作らない）を機械固定する。
#   ネットワークには一切触れない（YAML の静的検査のみ）。
#
#   外部YAML parserへ依存せず、固定する構造を必須の文字列ゲートで検証する。
#
# 使い方: bash test/test_supabase_keepalive_workflow.sh
# set -e は使わない（個別に判定するため）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WF="$SCRIPT_DIR/../.github/workflows/supabase-keepalive.yml"

# 中間ファイルは専用の一時ディレクトリに閉じ込め、EXIT トラップでまとめて削除する
#   （固定名 /tmp/... を使わない＝共有ランナーでの衝突・先回り作成を避ける。
#     早期 exit の経路も含めて必ず片付くように、以降の処理より前にトラップを張る）。
KA_TMPDIR="$(mktemp -d)"
trap 'rm -rf "$KA_TMPDIR"' EXIT

PASS=0
FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=========================================="
echo "  KEEPALIVE-001 workflow 静的ゲート"
echo "=========================================="

if [ ! -f "$WF" ]; then
  echo "  ✗ workflow が見つからない: $WF"
  echo "  結果: PASS=0, FAIL=1"
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. YAML 構造（依存追加なし・固定構造をfail closedで検証）
# -----------------------------------------------------------------------------
echo ""
echo "【1】YAML 構造"
if [ "$(grep -c '^  schedule:$' "$WF")" = "1" ] \
   && [ "$(grep -c '^  workflow_dispatch:$' "$WF")" = "1" ] \
   && [ "$(grep -c '^    - cron:' "$WF")" = "1" ] \
   && [ "$(awk '/^on:$/{inside=1; next} /^permissions:$/{inside=0} inside && /^  [^[:space:]#][^:]*:$/ { print }' "$WF")" = "$(printf '%s\n%s' '  schedule:' '  workflow_dispatch:')" ]; then
  ok "trigger はschedule 1本＋workflow_dispatchのみ"
else
  ng "trigger構造が固定形でない"
fi
if [ "$(grep -c '^permissions:$' "$WF")" = "1" ] \
   && [ "$(grep -c '^  contents: read$' "$WF")" = "1" ] \
   && [ "$(grep -c '^[[:space:]]*permissions:' "$WF")" = "1" ]; then
  ok "permissionsはworkflow-level contents:readのみ"
else
  ng "permissionsの欠落・過大化・job-level上書きを検出"
fi
if [ "$(grep -c '^jobs:$' "$WF")" = "1" ] \
   && [ "$(awk '/^jobs:$/{inside=1; next} inside && /^  [^[:space:]#][^:]*:$/ { print }' "$WF")" = "  ping:" ] \
   && [ "$(grep -c '^      - name:' "$WF")" = "2" ] \
   && [ "$(grep -c '^        run: |$' "$WF")" = "1" ] \
   && grep -q '^    timeout-minutes: 5$' "$WF"; then
  ok "jobはtimeout付きping 1本"
else
  ng "job構造が固定形でない"
fi
USES=$(grep -E '^[[:space:]]*uses:' "$WF" | sed 's/^[[:space:]]*uses:[[:space:]]*//')
[ "$USES" = "actions/checkout@v4" ] && ok "使用actionはcheckout@v4のみ" || ng "想定外action: $USES"
grep -q '^          ref: production$' "$WF" \
  && grep -q '^          sparse-checkout: app/config.public.js$' "$WF" \
  && grep -q '^          persist-credentials: false$' "$WF" \
  && ok "checkoutはproduction公開config限定・資格情報非保持" \
  || ng "checkoutのref/sparse/persist-credentialsが固定形でない"

# run: | の内容は本workflowで1本。10桁indentを外してbash構文を直接検査する。
RUN_FILE="$KA_TMPDIR/run.sh"
awk '
  /^        run: \|$/ { in_run=1; next }
  in_run && /^          / { sub(/^          /, ""); print; next }
  in_run && /^[[:space:]]*$/ { print ""; next }
  in_run { exit }
' "$WF" > "$RUN_FILE"
[ -s "$RUN_FILE" ] && bash -n "$RUN_FILE" \
  && ok "runブロックのbash構文OK" || ng "runブロック欠落またはbash構文エラー"

# -----------------------------------------------------------------------------
# 以降は「コメント行を除いた実効定義」に対して検査する。
# （YAML コメントも run ブロック内のシェルコメントも、行頭 # で始まる行として除去する。
#   本 workflow は行末コメントを使わない＝この単純な除去で実効行だけが残る。）
# -----------------------------------------------------------------------------
WF_EFF="$KA_TMPDIR/workflow.effective.yml"
grep -vE '^[[:space:]]*#' "$WF" > "$WF_EFF"
if grep -qE '[^[:space:]][[:space:]]+#[[:space:]]' "$WF_EFF"; then
  ng "実効行に行末コメントがある（本テストの前提が崩れる／コメント除去を見直すこと）"
else
  ok "実効行に行末コメントなし（コメント除去の前提が成立）"
fi

# -----------------------------------------------------------------------------
# 2. secret を作らない / 使わない
# -----------------------------------------------------------------------------
echo ""
echo "【2】secret 非使用"
if grep -qE '\$\{\{[^}]*secrets[[:space:]]*(\.|\[)' "$WF_EFF"; then
  ng "secrets context を参照している（dot/bracket形式とも受け入れ基準 2 違反）"
else
  ok "secrets.* 参照ゼロ"
fi

# 公開値であっても workflow へ直書きしない（production の config.public.js から実行時抽出する設計）
if grep -qE "sb_publishable_[A-Za-z0-9_-]|https://[a-z0-9]+\.supabase\.co" "$WF_EFF"; then
  ng "Supabase の URL / キーを workflow へ直書きしている（config.public.js からの抽出に統一すること）"
else
  ok "URL / publishable key の直書きなし（出荷物 app/config.public.js から抽出）"
fi

# -----------------------------------------------------------------------------
# 3. 公開窓を増やさない・DB へ書き込まない
# -----------------------------------------------------------------------------
echo ""
echo "【3】read-only（公開窓は get_live_snapshot のみ）"
RPCS=$(grep -oE 'rpc/[A-Za-z0-9_]+' "$WF_EFF" | sort -u)
if [ "$RPCS" = "rpc/get_live_snapshot" ]; then
  ok "呼び出す RPC は get_live_snapshot のみ"
else
  ng "想定外の RPC を呼んでいる: $(echo "$RPCS" | tr '\n' ' ')"
fi

# REST target は既知テーブルのdenylistではなく、唯一のread-only RPCだけをallowlistする。
REST_TARGETS=$(grep -oE 'rest/v1/[A-Za-z0-9_/-]+' "$WF_EFF" | sort -u)
if [ "$REST_TARGETS" = "rest/v1/rpc/get_live_snapshot" ]; then
  ok "REST target は read-only get_live_snapshot のみ"
else
  ng "想定外のREST targetがある: $(echo "$REST_TARGETS" | tr '\n' ' ')"
fi

# HTTP メソッドは POST（＝RPC 実行）のみ。PostgREST の書き込み動詞を使わない。
METHODS=$(grep -oE "\-X[[:space:]]+[A-Z]+" "$WF_EFF" | awk '{print $2}' | sort -u)
if [ "$METHODS" = "POST" ]; then
  ok "curl の HTTP メソッドは POST（RPC 実行）のみ"
else
  ng "想定外の HTTP メソッド: $(echo "$METHODS" | tr '\n' ' ')"
fi

# -----------------------------------------------------------------------------
# 4. 失敗を握り潰さない（＝死活監視として機能する）
# -----------------------------------------------------------------------------
echo ""
echo "【4】fail-closed"
if awk '
  /keepalive が .* 回とも失敗した/ { terminal=1; next }
  terminal && /^[[:space:]]*exit 1[[:space:]]*$/ { found=1 }
  END { exit(found ? 0 : 1) }
' "$WF_EFF"; then
  ok "全retry失敗後のterminal pathが exit 1"
else
  ng "全retry失敗後のterminal exit 1が無い"
fi
if grep -qE 'continue-on-error:[[:space:]]*true' "$WF_EFF"; then
  ng "continue-on-error: true がある（失敗が通知されない）"
else
  ok "continue-on-error による握り潰しなし"
fi
# 実在し得ない slug（発行される slug は 'live-<uuid32>' 形式のみ）＝正常応答は常に null
if grep -qE 'KEEPALIVE_SLUG:[[:space:]]*live-' "$WF_EFF"; then
  ng "keepalive slug が実在し得る形式（live-…）＝誤判定の可能性"
else
  ok "keepalive slug は実在し得ない形式（正常応答が常に null）"
fi

# -----------------------------------------------------------------------------
# 5. 応答本文をログに出さない（HTTP エラー本文の意図せぬ露出防止）
# -----------------------------------------------------------------------------
echo ""
echo "【5】応答本文をログに出さない"
# echo/printf 系で $BODY を直接展開している行が残っていないこと。
# 許容パターンは「HTTP コードだけを出す／本文は捨てる」形式のみ。
if grep -nE '(echo|printf)[^#]*\$(BODY\b|\{BODY\})' "$WF_EFF" >/dev/null; then
  ng "失敗時に応答本文 (\$BODY) をログ出力している行がある（不定コンテンツの露出防止のため禁止）"
  grep -nE '(echo|printf)[^#]*\$(BODY\b|\{BODY\})' "$WF_EFF" | sed 's/^/      /'
else
  ok "応答本文 (\$BODY) をログに出す echo/printf は無い"
fi
BODY_FILE_REFS=$(grep -c 'BODY_FILE' "$WF_EFF")
if [ "$BODY_FILE_REFS" = "5" ] \
   && grep -Fq 'BODY_FILE="$(mktemp)"' "$WF_EFF" \
   && grep -Fq 'trap '\''rm -f "$BODY_FILE"'\'' EXIT' "$WF_EFF" \
   && grep -Fq ': > "$BODY_FILE"' "$WF_EFF" \
   && grep -Fq -- '-o "$BODY_FILE" -w' "$WF_EFF" \
   && grep -Fq 'BODY=$(tr -d '\'' \t\r\n'\'' < "$BODY_FILE")' "$WF_EFF"; then
  ok "BODY_FILE参照はmktemp・削除・空化・curl出力・捕捉読取の5用途だけ"
else
  ng "BODY_FILEにallowlist外の参照がある（ログ露出の可能性）"
fi

# -----------------------------------------------------------------------------
# 6. 一時ファイルの後始末（trap で EXIT 時に必ず削除）
# -----------------------------------------------------------------------------
echo ""
echo "【6】mktemp の後始末（trap による確実な削除）"
if grep -qE 'mktemp' "$WF_EFF"; then
  # ループ内で mktemp してリークしないこと（ループ外で1本だけ確保する運用に統一）。
  if awk '
    /^[[:space:]]*while / { in_loop=1 }
    /^[[:space:]]*done/   { in_loop=0 }
    in_loop && /mktemp/   { found=1 }
    END { exit(found ? 0 : 1) }
  ' "$WF_EFF"; then
    ng "while ループ内で mktemp している（リーク源。ループ外で 1 本確保し使い回すこと）"
  else
    ok "while ループ内で mktemp していない（リーク源なし）"
  fi
  # 少なくとも 1 本の EXIT trap で rm されていること。
  # 引数内の引用符は多様（'..."$X"...' 等）なので、trap 行に rm -f と EXIT が
  # 同居していることのみを確認する（過剰に厳しい正規表現は逆に壊れやすい）。
  if grep -E '^[[:space:]]*trap[[:space:]]' "$WF_EFF" | grep -q 'rm[[:space:]]\+-f' \
     && grep -E '^[[:space:]]*trap[[:space:]]' "$WF_EFF" | grep -qE '[[:space:]]EXIT([[:space:]]|$)'; then
    ok "trap ... EXIT で tempfile を削除している"
  else
    ng "mktemp した tempfile を trap ... EXIT で削除していない（漏れリスク）"
  fi
else
  ok "mktemp を使っていない（tempfile 経路そのものが無い）"
fi

# -----------------------------------------------------------------------------
# 7. コメントに古いブランチ名（"main" などのハードコード）が残っていないこと
#    → 「デフォルトブランチに取り込まれた後に発火」という一般化表現に統一済み。
# -----------------------------------------------------------------------------
echo ""
echo "【7】stale なブランチ名の記述が残っていない"
# 「main に届く」「main ブランチ」等の、ブランチ名決め打ちの古い文言が残っていないこと。
# （リポジトリのデフォルトブランチは将来変わり得るため、ブランチ名を書かないのが安全側。）
if grep -nE '(main[[:space:]]*(ブランチ|に届く|に取り込)|デフォルトブランチ[[:space:]]*[（(]main[)）])' "$WF" >/dev/null; then
  ng "コメントに 'main' 決め打ちの古い記述が残っている（デフォルトブランチという一般表現に統一すること）"
  grep -nE '(main[[:space:]]*(ブランチ|に届く|に取り込)|デフォルトブランチ[[:space:]]*[（(]main[)）])' "$WF" | sed 's/^/      /'
else
  ok "コメントに 'main' 決め打ちのブランチ名記述は残っていない"
fi
# 逆に「デフォルトブランチ」への言及は残っていること（schedule/workflow_dispatch の
# 発火条件を利用者に伝えるため）。
if grep -qE 'デフォルトブランチ' "$WF"; then
  ok "デフォルトブランチに取り込み後に発火する旨のコメントが残っている"
else
  ng "デフォルトブランチに関する説明コメントが失われている（schedule/workflow_dispatch の発火条件を伝えるため必須）"
fi

# -----------------------------------------------------------------------------
# 8. cron の固定（週3回：17 21 * * 0,2,4）
#    schedule は本 workflow の SLO を規定する重要パラメータ。
#    誤って書き換えると pause 検知の間隔が伸びるため文字列一致で凍結する。
# -----------------------------------------------------------------------------
echo ""
echo "【8】cron 表現の凍結"
if grep -qE "cron:[[:space:]]*'17 21 \* \* 0,2,4'" "$WF_EFF"; then
  ok "cron は '17 21 * * 0,2,4'（JST 月・水・金 06:17）で凍結"
else
  ng "cron が '17 21 * * 0,2,4' でない（週3回の冗長度が崩れる可能性）"
fi

echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
