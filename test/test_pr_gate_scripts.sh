#!/usr/bin/env bash
# =============================================================================
# test_pr_gate_scripts.sh — AUTO001-GATE-TEST-PORT-002
#   main 系 auto-001 の companion test を、進化後の orphan gate スクリプト
#   （scripts/shogi_tour_pr_gate.sh / scripts/shogi_tour_approved_merge.sh）向けに
#   *適応移植* したもの。AS-IS 移植ではない。
#   PORT-001（#242）で適応移植した companion test を、#243（Bash 3.2/macOS UTF-8 +
#   set -u の多バイト隣接変数 unbound バグの bracing 修正）を取り込んだ最新 orphan base へ
#   recut したもの（test 本体は PORT-001 と同一・scripts は #243 で修正済み）。
#
# 適応点（#237/#238 で進化した orphan scripts に追従）:
#   - orphan-dev profile（base = orphan clean base 要求）を網羅
#   - mock PR JSON に headRefOid を含め、head SHA 表示 / --expect-head / --match-head-commit を固定
#   - approved_merge の Step7/8（base/head の git ls-remote 照会）を PATH stub で mock し、
#     実 origin / network に一切触れない
#   - gh api 実行依存が無いこと（静的＋mock log）を固定
#   - head-CAS（--match-head-commit）/ --delete-branch 不使用 / --auto 不使用 / dry-run 既定を固定
#   - #243 の bracing 修正により、UTF-8 ロケール（en_US.UTF-8 等）でも gate/amerge が
#     unbound variable で異常終了せず、本テストが PASS する（C ロケールでも従来どおり PASS）。
#
# 安全: 本テストは実 GitHub / 実 origin に対して mutating 操作を一切行わない。
#       gh / git は PATH 先頭の mock に差し替えて実行経路だけを検証する（--execute も mock 上のみ）。
#       実データ・実 PII・トークンは含まない（PR 番号・SHA・branch 名はすべて架空のダミー）。
#
# 使い方: bash test/test_pr_gate_scripts.sh
# set -e は使わない（個別に判定するため）。
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/../scripts/shogi_tour_pr_gate.sh"
AMERGE="$SCRIPT_DIR/../scripts/shogi_tour_approved_merge.sh"
ORPHAN_BASE="chore/shogi-tour-apphq-003h-2d-orphan-clean-base"
HEAD_SHA="1111111111111111111111111111111111111111"   # 架空 head SHA（headRefOid）
LSR_SHA="2222222222222222222222222222222222222222"    # 架空 git ls-remote stub SHA

PASS=0
FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
expect_eq() { if [ "$1" = "$2" ]; then ok "$3 ($1)"; else ng "$3 (expected=$2 actual=$1)"; fi; }
expect_rc() { if [ "$1" = "$2" ]; then ok "$3 (rc=$1)"; else ng "$3 (expected rc=$2 actual rc=$1)"; fi; }

echo "=========================================="
echo "  AUTO001-GATE-TEST-PORT-002 (orphan gate)"
echo "=========================================="

# -----------------------------------------------------------------------------
# 0. 構文 + 静的安全（pr_gate=read-only / 危険オプション不使用 / gh api 非依存）
# -----------------------------------------------------------------------------
echo ""
echo "【0】構文 + 静的安全"
bash -n "$GATE"   && ok "bash -n shogi_tour_pr_gate.sh"        || ng "bash -n shogi_tour_pr_gate.sh"
bash -n "$AMERGE" && ok "bash -n shogi_tour_approved_merge.sh" || ng "bash -n shogi_tour_approved_merge.sh"
bash -n "$0"      && ok "bash -n (このテスト自身)"             || ng "bash -n (このテスト自身)"
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -S warning "$GATE" "$AMERGE" >/dev/null 2>&1 && ok "shellcheck (warning+)" || ng "shellcheck で指摘あり"
else
  echo "  ⚠ shellcheck 未インストール → bash -n のみで代替"
fi

# 「実行コード」だけを対象に静的 grep（# コメント・echo/printf/note/cat の説明文字列を除外）。
code_only() { grep -vE '^[[:space:]]*#' "$1" | grep -vE '^[[:space:]]*(echo|printf|note|cat)[[:space:]]'; }
if { code_only "$GATE"; code_only "$AMERGE"; } | grep -q -- '--delete-branch'; then
  ng "実行コードに --delete-branch（禁止）"
else
  ok "実行コードで --delete-branch を使用していない (point 10)"
fi
if { code_only "$GATE"; code_only "$AMERGE"; } | grep -q -- '--auto'; then
  ng "実行コードに --auto（禁止）"
else
  ok "実行コードで --auto を使用していない (point 10)"
fi
if { code_only "$GATE"; code_only "$AMERGE"; } | grep -qE 'gh[[:space:]]+api'; then
  ng "実行コードに gh api（当環境 deny / 依存禁止）"
else
  ok "実行コードで gh api を使用していない (point 12)"
fi
# pr_gate は read-only：mutating な gh（ready/merge/comment）を実行コードに持たない
if code_only "$GATE" | grep -qE 'gh[[:space:]]+pr[[:space:]]+(ready|merge|comment)'; then
  ng "pr_gate の実行コードに mutating gh（read-only 違反）"
else
  ok "pr_gate は read-only（gh pr ready/merge/comment を呼ばない, point 1)"
fi
# approved_merge は head-CAS / git ls-remote を持つ
grep -q -- '--match-head-commit' "$AMERGE" && ok "approved_merge に --match-head-commit（head-CAS, point 8)" || ng "approved_merge に --match-head-commit が無い"
grep -q 'git ls-remote' "$AMERGE"           && ok "approved_merge は git ls-remote で post-merge 検証（gh-api 非依存, point 11/12)" || ng "approved_merge に git ls-remote が無い"

# -----------------------------------------------------------------------------
# 1. 純粋関数（gate を source。BASH_SOURCE ガードで main は走らない）
# -----------------------------------------------------------------------------
echo ""
echo "【1】純粋関数 valid_profile / classify_path / realdata_risk_path（orphan-dev 追加）"
# shellcheck disable=SC1090
. "$GATE"

valid_profile production-minimal; expect_rc $? 0 "valid_profile production-minimal は有効"
valid_profile main-dev;           expect_rc $? 0 "valid_profile main-dev は有効"
valid_profile orphan-dev;         expect_rc $? 0 "valid_profile orphan-dev は有効 (point 2)"
valid_profile docs-only;          expect_rc $? 0 "valid_profile docs-only は有効"
valid_profile test-only;          expect_rc $? 0 "valid_profile test-only は有効"
valid_profile bogus;              expect_rc $? 1 "valid_profile bogus は無効"

# classify_path : orphan-dev（許可範囲は main-dev 同等＝data/ のみ禁止, point 4）
expect_eq "$(classify_path orphan-dev shogi_v4.html)"               ALLOWED   "orphan-dev: shogi_v4.html 許可"
expect_eq "$(classify_path orphan-dev test/x.js)"                   ALLOWED   "orphan-dev: test/ 許可"
expect_eq "$(classify_path orphan-dev docs/ops/ai_workflow_v1.md)"  ALLOWED   "orphan-dev: docs/ 許可"
expect_eq "$(classify_path orphan-dev scripts/shogi_tour_pr_gate.sh)" ALLOWED "orphan-dev: scripts/ 許可"
expect_eq "$(classify_path orphan-dev data/import/x.json)"          FORBIDDEN "orphan-dev: data/ 禁止"
expect_eq "$(classify_path orphan-dev sub/data/y.json)"             FORBIDDEN "orphan-dev: */data/ 禁止"
# classify_path : 既存 profile の回帰
expect_eq "$(classify_path production-minimal shogi_v4.html)" ALLOWED   "prod-min: shogi_v4.html 許可"
expect_eq "$(classify_path production-minimal index.html)"    ALLOWED   "prod-min: index.html 許可"
expect_eq "$(classify_path production-minimal docs/x.md)"     FORBIDDEN "prod-min: docs/ 禁止"
expect_eq "$(classify_path production-minimal test/x.js)"     FORBIDDEN "prod-min: test/ 禁止"
expect_eq "$(classify_path docs-only docs/x.md)"             ALLOWED   "docs-only: docs/ 許可"
expect_eq "$(classify_path docs-only HANDOFF.md)"            ALLOWED   "docs-only: HANDOFF.md 許可"
expect_eq "$(classify_path docs-only shogi_v4.html)"         FORBIDDEN "docs-only: shogi_v4.html 禁止"
expect_eq "$(classify_path test-only test/fixtures/y.json)" ALLOWED   "test-only: fixtures 許可"
expect_eq "$(classify_path test-only shogi_v4.html)"        FORBIDDEN "test-only: shogi_v4.html 禁止"

# realdata_risk_path
expect_eq "$(realdata_risk_path data/import/x.json)"                                          RISK  "realdata: data/ は RISK"
expect_eq "$(realdata_risk_path test/fixtures/import/members_candidate_recut_001_synthetic.json)" CLEAR "realdata: synthetic fixture は CLEAR"
expect_eq "$(realdata_risk_path package.json)"                                                CLEAR "realdata: package.json は CLEAR"
expect_eq "$(realdata_risk_path participants.json)"                                           WARN  "realdata: 非 synthetic な root json は WARN"
expect_eq "$(realdata_risk_path test/data_basic4.json)"                                       CLEAR "realdata: test/data_* は CLEAR"
expect_eq "$(realdata_risk_path shogi_v4.html)"                                               CLEAR "realdata: html は CLEAR"

# -----------------------------------------------------------------------------
# 2. 引数エラー（gh 呼び出し前に exit すること）
# -----------------------------------------------------------------------------
echo ""
echo "【2】引数不足 / profile 不正でエラー終了"
bash "$GATE" --profile orphan-dev >/dev/null 2>&1;        expect_rc $? 2 "gate: --pr 無しは rc=2"
bash "$GATE" --pr 1 >/dev/null 2>&1;                      expect_rc $? 2 "gate: --profile 無しは rc=2"
bash "$GATE" --pr 1 --profile bogus >/dev/null 2>&1;      expect_rc $? 2 "gate: 不正 profile は rc=2"
bash "$GATE" --pr abc --profile orphan-dev >/dev/null 2>&1; expect_rc $? 2 "gate: 非数値 --pr は rc=2"
bash "$AMERGE" --pr 1 >/dev/null 2>&1;                    expect_rc $? 2 "amerge: --profile 無しは rc=2"
bash "$AMERGE" --profile orphan-dev >/dev/null 2>&1;      expect_rc $? 2 "amerge: --pr 無しは rc=2"
bash "$AMERGE" --pr 1 --profile orphan-dev --dry-run --execute >/dev/null 2>&1; expect_rc $? 2 "amerge: dry-run と execute 同時は rc=2"
bash "$AMERGE" --pr 1 --profile orphan-dev --post-comment >/dev/null 2>&1;      expect_rc $? 2 "amerge: post-comment は execute 必須 rc=2"

# -----------------------------------------------------------------------------
# 3. mock gh + git stub 環境
# -----------------------------------------------------------------------------
echo ""
echo "【3】mock gh + git ls-remote stub（実 GitHub / 実 origin に触れない）"
MOCK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/shogi_gate_mock.XXXXXX")"
GH_MOCK_LOG="$MOCK_DIR/gh_calls.log"
GIT_MOCK_LOG="$MOCK_DIR/git_calls.log"
: > "$GH_MOCK_LOG"; : > "$GIT_MOCK_LOG"
printf '%s' "$HEAD_SHA" > "$MOCK_DIR/merge_head.txt"

write_pr() { cat > "$MOCK_DIR/pr.json"; }
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"$ORPHAN_BASE","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"},{"path":"test/x.js"}]}
JSON

# mock gh: 引数を LOG に記録。pr view は -q.headRefOid のときだけ merge_head.txt（raw SHA）、
#          それ以外は pr.json（full JSON）を返す。ready/merge/comment は no-op(0)。api は呼ばれない想定。
cat > "$MOCK_DIR/gh" <<MOCK
#!/usr/bin/env bash
echo "\$*" >> "$GH_MOCK_LOG"
case "\$1" in
  pr)
    case "\$2" in
      view)
        _hasq=0; for _a in "\$@"; do [ "\$_a" = "-q" ] && _hasq=1; done
        if [ "\$_hasq" = "1" ]; then cat "$MOCK_DIR/merge_head.txt"; else cat "$MOCK_DIR/pr.json"; fi
        ;;
      ready|merge|comment|*) exit 0 ;;
    esac
    ;;
  repo) echo "owner/repo" ;;
  api)  echo "GH_API_SHOULD_NOT_BE_CALLED" ;;
  *)    exit 0 ;;
esac
exit 0
MOCK
chmod +x "$MOCK_DIR/gh"

# mock git: ls-remote だけ canned（実 origin/network に触れない）。それ以外は no-op(0)。
cat > "$MOCK_DIR/git" <<MOCK
#!/usr/bin/env bash
echo "\$*" >> "$GIT_MOCK_LOG"
if [ "\$1" = "ls-remote" ]; then
  _b=""; for _a in "\$@"; do _b="\$_a"; done   # 末尾引数 = branch 名
  printf '%s\trefs/heads/%s\n' "$LSR_SHA" "\$_b"
  exit 0
fi
exit 0
MOCK
chmod +x "$MOCK_DIR/git"

mock() { PATH="$MOCK_DIR:$PATH" "$@"; }

# 3-1. gate orphan-dev + base=orphan + CLEAN → READY_CANDIDATE(0)（points 1,2,3,5）
: > "$GH_MOCK_LOG"
out="$(mock bash "$GATE" --pr 999 --profile orphan-dev --repo owner/repo 2>&1)"; rc=$?
expect_rc "$rc" 0 "gate(mock): orphan-dev + base=orphan は READY_CANDIDATE(0)"
printf '%s' "$out" | grep -qE "head SHA.*$HEAD_SHA"     && ok "gate(mock): head SHA(headRefOid) を表示 (point 5)" || ng "gate(mock): head SHA 表示なし"
printf '%s' "$out" | grep -q  "mergeable : MERGEABLE / CLEAN" && ok "gate(mock): mergeable / mergeStateStatus を併記" || ng "gate(mock): mergeable 併記なし"
if grep -qE 'pr (ready|merge|comment)' "$GH_MOCK_LOG"; then ng "gate(mock): mutating gh を呼んだ"; else ok "gate(mock): mutating gh を呼んでいない（read-only, point 1)"; fi

# 3-2. gate orphan-dev + base=production → BLOCKED(20)（point 3）
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"production","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"}]}
JSON
mock bash "$GATE" --pr 999 --profile orphan-dev --repo owner/repo >/dev/null 2>&1; expect_rc $? 20 "gate(mock): orphan-dev + base=production は BLOCKED(20) (point 3)"

# 3-3. gate orphan-dev + base=main → BLOCKED(20)
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"main","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"}]}
JSON
mock bash "$GATE" --pr 999 --profile orphan-dev --repo owner/repo >/dev/null 2>&1; expect_rc $? 20 "gate(mock): orphan-dev + base=main は BLOCKED(20)"

# 3-4. gate orphan-dev + data/ → BLOCKED（forbidden + RISK, point 4）
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"$ORPHAN_BASE","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"data/import/real.json"}]}
JSON
mock bash "$GATE" --pr 999 --profile orphan-dev --repo owner/repo >/dev/null 2>&1; expect_rc $? 20 "gate(mock): orphan-dev + data/ は BLOCKED(20) (forbidden+RISK, point 4)"

# 3-5. gate mergeStateStatus != CLEAN → NEEDS_REVIEW(10)
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"$ORPHAN_BASE","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"BLOCKED","files":[{"path":"shogi_v4.html"}]}
JSON
mock bash "$GATE" --pr 999 --profile orphan-dev --repo owner/repo >/dev/null 2>&1; expect_rc $? 10 "gate(mock): mergeStateStatus!=CLEAN は NEEDS_REVIEW(10)"

# 3-6. gate --expect-head 一致/不一致（point 5,9）
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"$ORPHAN_BASE","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"}]}
JSON
mock bash "$GATE" --pr 999 --profile orphan-dev --repo owner/repo --expect-head "$HEAD_SHA" >/dev/null 2>&1; expect_rc $? 0  "gate(mock): --expect-head 一致は READY_CANDIDATE(0) (point 5)"
mock bash "$GATE" --pr 999 --profile orphan-dev --repo owner/repo --expect-head 9999999999999999999999999999999999999999 >/dev/null 2>&1; expect_rc $? 20 "gate(mock): --expect-head 不一致は BLOCKED(20) (point 9)"

# -----------------------------------------------------------------------------
# 4. approved_merge: dry-run 既定 / execute ガード / head-CAS / git ls-remote stub
# -----------------------------------------------------------------------------
echo ""
echo "【4】approved_merge dry-run / execute（mock）"
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"$ORPHAN_BASE","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"}]}
JSON

# 4-1. 既定(dry-run): mutating を呼ばない / preview に --match-head-commit（points 6,7,8）
: > "$GH_MOCK_LOG"
out="$(mock bash "$AMERGE" --pr 999 --profile orphan-dev --repo owner/repo 2>&1)"; rc=$?
expect_rc "$rc" 0 "amerge(mock): 既定(dry-run)は rc=0 (point 6)"
if grep -qE 'pr (ready|merge)' "$GH_MOCK_LOG"; then ng "amerge(mock): 既定 dry-run で ready/merge を呼んだ"; else ok "amerge(mock): 既定 dry-run で mutating を呼ばない (point 7)"; fi
printf '%s' "$out" | grep -q -- '--match-head-commit' && ok "amerge(mock): dry-run preview に --match-head-commit（head-CAS, point 8)" || ng "amerge(mock): preview に --match-head-commit が無い"

# 4-2. 明示 --dry-run でも同様
: > "$GH_MOCK_LOG"
mock bash "$AMERGE" --pr 999 --profile orphan-dev --repo owner/repo --dry-run >/dev/null 2>&1; expect_rc $? 0 "amerge(mock): 明示 --dry-run は rc=0"
if grep -qE 'pr (ready|merge)' "$GH_MOCK_LOG"; then ng "amerge(mock): --dry-run で mutating"; else ok "amerge(mock): --dry-run で mutating 無し"; fi

# 4-3. --execute だが非対話 + --yes 無し → 中止(4)、mutating 無し（points 7,13）
: > "$GH_MOCK_LOG"
mock bash "$AMERGE" --pr 999 --profile orphan-dev --repo owner/repo --execute </dev/null >/dev/null 2>&1; expect_rc $? 4 "amerge(mock): --execute 非対話 + --yes 無しは中止(4) (point 7)"
if grep -qE 'pr (ready|merge)' "$GH_MOCK_LOG"; then ng "amerge(mock): 無承認 execute で mutating を呼んだ"; else ok "amerge(mock): 無承認 execute で mutating を呼ばない (point 13)"; fi

# 4-4. --execute --yes（mock 上のみ）: squash + match-head-commit / delete-branch・auto 不使用 /
#      Ready 化 / gh api 非呼出 / git ls-remote stub 経由（points 8,10,11,12,13）
: > "$GH_MOCK_LOG"; : > "$GIT_MOCK_LOG"
out="$(mock bash "$AMERGE" --pr 999 --profile orphan-dev --repo owner/repo --execute --yes </dev/null 2>&1)"; rc=$?
expect_rc "$rc" 0 "amerge(mock): --execute --yes は rc=0（mock 上のみ）"
grep -q "pr merge 999 .*--squash" "$GH_MOCK_LOG"          && ok "amerge(mock): merge は --squash で実行"                       || ng "amerge(mock): merge が --squash でない"
grep -q -- "--match-head-commit $HEAD_SHA" "$GH_MOCK_LOG" && ok "amerge(mock): merge に --match-head-commit <headSHA>（head-CAS, point 8)" || ng "amerge(mock): merge に --match-head-commit が無い"
if grep -q -- "--delete-branch" "$GH_MOCK_LOG"; then ng "amerge(mock): --delete-branch を使った（絶対禁止）"; else ok "amerge(mock): --delete-branch を一切使わない (point 10)"; fi
if grep -q -- "--auto" "$GH_MOCK_LOG"; then ng "amerge(mock): --auto を使った（絶対禁止）"; else ok "amerge(mock): --auto を一切使わない (point 10)"; fi
grep -q "pr ready 999" "$GH_MOCK_LOG" && ok "amerge(mock): --execute --yes で Ready 化を実行" || ng "amerge(mock): Ready 化していない"
if grep -q '^api' "$GH_MOCK_LOG"; then ng "amerge(mock): gh api を呼んだ（依存禁止）"; else ok "amerge(mock): gh api を一切呼ばない (point 12)"; fi
grep -q "ls-remote --heads origin" "$GIT_MOCK_LOG" && ok "amerge(mock): Step7/8 は git ls-remote stub 経由（実 origin 非依存, point 11)" || ng "amerge(mock): git ls-remote stub を経由していない"
printf '%s' "$out" | grep -q "$LSR_SHA" && ok "amerge(mock): ls-remote stub の canned SHA が出力に現れる（network 非依存, point 11)" || ng "amerge(mock): canned SHA が出力に無い"

# 4-5. --execute --yes だが gate=BLOCKED（orphan-dev + base=production）→ rc=20、merge しない
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"production","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"}]}
JSON
: > "$GH_MOCK_LOG"
mock bash "$AMERGE" --pr 999 --profile orphan-dev --repo owner/repo --execute --yes </dev/null >/dev/null 2>&1; expect_rc $? 20 "amerge(mock): gate=BLOCKED は rc=20 で停止"
if grep -q "pr merge" "$GH_MOCK_LOG"; then ng "amerge(mock): BLOCKED なのに merge を呼んだ"; else ok "amerge(mock): BLOCKED では merge を呼ばない"; fi

# 4-6. Step6 head-CAS: gate は通過するが merge 直前 head が変化（--expect-head 不一致）→ 停止(4)（point 9 深掘り）
write_pr <<JSON
{"number":999,"state":"OPEN","isDraft":true,"baseRefName":"$ORPHAN_BASE","headRefName":"feature/test-head","headRefOid":"$HEAD_SHA","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","files":[{"path":"shogi_v4.html"}]}
JSON
printf '%s' "3333333333333333333333333333333333333333" > "$MOCK_DIR/merge_head.txt"   # merge 直前(-q.headRefOid)だけ別 head を返す
: > "$GH_MOCK_LOG"
mock bash "$AMERGE" --pr 999 --profile orphan-dev --repo owner/repo --execute --yes --expect-head "$HEAD_SHA" </dev/null >/dev/null 2>&1; expect_rc $? 4 "amerge(mock): merge 直前に head 変化（--expect-head 不一致）で停止(4) (point 9 / Step6 CAS)"
if grep -q "pr merge" "$GH_MOCK_LOG"; then ng "amerge(mock): head 変化なのに merge を呼んだ"; else ok "amerge(mock): head 変化で merge を呼ばない (point 9)"; fi
printf '%s' "$HEAD_SHA" > "$MOCK_DIR/merge_head.txt"   # 後始末（復元）

rm -rf "$MOCK_DIR"

# -----------------------------------------------------------------------------
# 結果
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓ 全テスト合格"
  exit 0
else
  echo "  ✗ 失敗あり(要対応)"
  exit 1
fi
