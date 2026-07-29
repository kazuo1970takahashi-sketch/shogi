#!/usr/bin/env bash
# =============================================================================
# test_supabase_keepalive_workflow.sh — KEEPALIVE-001 の静的ゲート
#
#   .github/workflows/supabase-keepalive.yml の「受け入れ基準 2」
#   （新しい secret・新しい公開窓・DB 書き込みを一切作らない）を機械固定する。
#   ネットワークには一切触れない（YAML の静的検査のみ）。
#
#   PyYAML が無い環境では YAML parse 系の項目のみ SKIP し、文字列レベルの
#   安全ゲートは常に実行する（＝安全側の判定は環境非依存で必ず走る）。
#
# 使い方: bash test/test_supabase_keepalive_workflow.sh
# set -e は使わない（個別に判定するため）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WF="$SCRIPT_DIR/../.github/workflows/supabase-keepalive.yml"

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
# 1. YAML 構造（PyYAML があるときのみ）
# -----------------------------------------------------------------------------
echo ""
echo "【1】YAML 構造"
if python3 -c 'import yaml' >/dev/null 2>&1; then
  STRUCT=$(WF="$WF" python3 - <<'PY'
import os, sys, yaml

errs = []
with open(os.environ['WF']) as f:
    doc = yaml.safe_load(f)

# PyYAML は素の on: を True(bool) に解決する（YAML 1.1 の真偽値）
triggers = doc.get('on', doc.get(True))
if not isinstance(triggers, dict):
    errs.append('on: がマップでない')
else:
    if 'workflow_dispatch' not in triggers:
        errs.append('workflow_dispatch トリガが無い（手動テスト不能）')
    sched = triggers.get('schedule')
    if not isinstance(sched, list) or not sched:
        errs.append('schedule トリガが無い')
    else:
        crons = [str(e.get('cron', '')) for e in sched if isinstance(e, dict)]
        if len(crons) != 1:
            errs.append('cron 定義は 1 本のはず: %r' % crons)
        else:
            fields = crons[0].split()
            if len(fields) != 5:
                errs.append('cron のフィールド数が 5 でない: %r' % crons[0])
            else:
                dow = fields[4]
                days = [d for d in dow.split(',') if d != '']
                if len(days) != 2:
                    errs.append('週2回でない（曜日フィールド=%r）' % dow)
                if fields[2] != '*' or fields[3] != '*':
                    errs.append('日/月フィールドが * でない（週次にならない）: %r' % crons[0])

    if set(triggers) - {'schedule', 'workflow_dispatch'}:
        errs.append('想定外のトリガがある: %r' % sorted(set(triggers)))

perms = doc.get('permissions')
if perms != {'contents': 'read'}:
    errs.append('permissions が {contents: read} でない: %r' % (perms,))

jobs = doc.get('jobs') or {}
if len(jobs) != 1:
    errs.append('job は 1 本のはず: %r' % sorted(jobs))
for name, job in jobs.items():
    if 'timeout-minutes' not in job:
        errs.append('job %s に timeout-minutes が無い' % name)
    for step in job.get('steps') or []:
        uses = step.get('uses', '')
        if uses and not uses.startswith('actions/checkout@'):
            errs.append('想定外の action を使っている: %r' % uses)
        if uses.startswith('actions/checkout@'):
            with_ = step.get('with') or {}
            if with_.get('persist-credentials') is not False:
                errs.append('checkout が persist-credentials: false でない')
            if not with_.get('sparse-checkout'):
                errs.append('checkout が sparse-checkout でない（全ツリー取得は不要）')

# run ブロックの bash 構文
runs = [s.get('run') for j in jobs.values() for s in (j.get('steps') or []) if s.get('run')]
print('RUNS=%d' % len(runs))
for i, r in enumerate(runs):
    open('/tmp/keepalive_run_%d.sh' % i, 'w').write(r)

for e in errs:
    print('ERR:' + e)
PY
)
  if [ $? -ne 0 ]; then
    ng "YAML parse に失敗（構文エラー）"
  else
    ERRS=$(echo "$STRUCT" | grep '^ERR:' | sed 's/^ERR://')
    if [ -z "$ERRS" ]; then
      ok "YAML 構造 OK（schedule 週2回＋workflow_dispatch／permissions=contents:read のみ／checkout 以外の action なし）"
    else
      while IFS= read -r line; do ng "YAML 構造: $line"; done <<< "$ERRS"
    fi
    NRUNS=$(echo "$STRUCT" | sed -n 's/^RUNS=//p')
    i=0
    SYNTAX_OK=1
    while [ "$i" -lt "${NRUNS:-0}" ]; do
      bash -n "/tmp/keepalive_run_$i.sh" 2>/dev/null || SYNTAX_OK=0
      i=$((i + 1))
    done
    [ "$SYNTAX_OK" = "1" ] && ok "run ブロックの bash 構文 OK（${NRUNS:-0} 本）" || ng "run ブロックに bash 構文エラー"
  fi
else
  echo "  ⚠ PyYAML 未インストール → YAML 構造検査は SKIP（下記の静的ゲートは実行する）"
fi

# -----------------------------------------------------------------------------
# 以降は「コメント行を除いた実効定義」に対して検査する。
# （YAML コメントも run ブロック内のシェルコメントも、行頭 # で始まる行として除去する。
#   本 workflow は行末コメントを使わない＝この単純な除去で実効行だけが残る。）
# -----------------------------------------------------------------------------
WF_EFF="$(mktemp)"
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
if grep -qE '\$\{\{[[:space:]]*secrets\.' "$WF_EFF"; then
  ng "secrets.* を参照している（受け入れ基準 2 違反）"
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

# anon で書き込み得る RPC / テーブル直叩きが混入していないこと
FORBIDDEN_HIT=0
for forbidden in publish_live_snapshot start_live_session stop_live_session \
                 hard_delete_member rest/v1/members rest/v1/tournaments \
                 rest/v1/entries rest/v1/public_live_snapshots rest/v1/tournament_snapshots; do
  if grep -q "$forbidden" "$WF_EFF"; then
    ng "書き込み系/テーブル直読の参照がある: $forbidden"
    FORBIDDEN_HIT=1
  fi
done
[ "$FORBIDDEN_HIT" -eq 0 ] && ok "書き込み系 RPC・テーブル直読の参照ゼロ"

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
grep -q 'exit 1' "$WF_EFF" && ok "異常時に exit 1（GitHub の失敗通知で検知）" || ng "異常時の exit 1 が無い"
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

echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
