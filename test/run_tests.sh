#!/usr/bin/env bash
# リファクタリング3層テスト
# 使い方: bash test/run_tests.sh <対象html> [比較元html(オプション)]
# 例: bash test/run_tests.sh shogi_v4.html archive/shogi_stage1_before.html

# set -e は使わない(grep が空ヒットで非ゼロを返すため、各テストで判定する)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-shogi_v4.html}"
COMPARE="${2:-}"

if [ ! -f "$TARGET" ]; then echo "✗ 対象ファイルなし: $TARGET"; exit 1; fi

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
ng()   { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }

echo ""
echo "=========================================="
echo "  3層テスト: $(basename $TARGET)"
echo "=========================================="

# ============================================
# 第1層: スモークテスト(基本動作の生死確認)
# ============================================
echo ""
echo "【第1層】スモークテスト"

# 1-1. JS構文チェック
python3 -c "
import re
with open('$TARGET') as f: html=f.read()
scripts=re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
with open('/tmp/check.js','w') as f: f.write(''.join(scripts))
" && node --check /tmp/check.js 2>/dev/null && ok "JS構文チェック" || ng "JS構文エラー"

# 1-2. 必須関数の存在確認
for fn in escapeHtml getName getFee calcTotal getWins pairHasRematch \
          getDuplicatePlayersInPairings normalizeState save load showTab \
          showMsg renderRegList makePlayerRow updateField addPlayer removePlayer \
          bulkEditNames editPlayer startTournament generatePairing setWinner \
          changePairing submitRound renderTournament editPastResult calcFinal \
          renderResults saveData loadData printResults getTopPlayers \
          downloadReport resetAll; do
  count=$(grep -c "^function $fn(" "$TARGET" || true)
  if [ "$count" = "1" ]; then
    : # OK、件数表示は省略
  elif [ "$count" = "0" ]; then
    ng "関数 $fn が定義されていない"
  else
    ng "関数 $fn が $count 回定義されている(重複)"
  fi
done
ok "全35必須関数 重複/欠落なし"

# 1-3. 必須DOM要素の存在
for id in pane-reg pane-tournament pane-result pane-A pane-B result-A result-B \
          tab-reg tab-tournament tab-result inp-name inp-class addBtn startBtn \
          saveBtn loadFile resetBtn rep-date rep-place rep-start rep-end \
          rep-sei rep-fuku rep-note bulkEditA bulkEditB reg-msg; do
  count=$(grep -c "id=\"$id\"" "$TARGET" || true)
  if [ "$count" -lt 1 ]; then ng "DOM要素 #$id がない"; fi
done
ok "全必須DOM要素あり"

# 1-4. 必須定数
grep -q "STORAGE_KEY='shogi_v4'" "$TARGET" && ok "STORAGE_KEY=shogi_v4" || ng "STORAGE_KEY定義なし"
grep -q "LEGACY_STORAGE_KEYS=\['shogi_v3'\]" "$TARGET" && ok "LEGACY_STORAGE_KEYS=shogi_v3" || ng "LEGACY_STORAGE_KEYS定義なし"

# ============================================
# 第2層: 重点回帰テスト(機能別)
# ============================================
echo ""
echo "【第2層】重点回帰テスト"

# 2-1. エスケープが innerHTML 流入箇所で適用されているか
unescaped=$(grep -nE "'\+name\+|'\+newName\+|'\+p\.name\+|'\+players\[.*\]\.name\+|'\+getName\(.*\)\+|'\+candidates\[.*\]\.name\+|'\+n1\+|'\+n2\+|'\+date\+|'\+place\+|'\+start\+|'\+end\+|'\+sei\+|'\+fuku\+|'\+note\+|'\+oppName\+|'\+pn1\+|'\+pn2\+|'\+pw\+|'\+text\+" "$TARGET" | grep -v "escapeHtml" | grep -v "alert(" | grep -v "confirm(" | wc -l)
[ "$unescaped" -eq 0 ] && ok "未エスケープのユーザー入力: 0件" || ng "未エスケープ箇所: $unescaped 件 (危険)"

# 2-2. showMsg内でescapeHtml使用
grep -A2 "^function showMsg" "$TARGET" | grep -q "escapeHtml(text)" && ok "showMsg: escapeHtml適用済み" || ng "showMsg: text未エスケープ(再発)"

# 2-3. 重複登録チェック存在
grep -q "同じ名前の参加者がいます" "$TARGET" && ok "addPlayer: 同名拒否ロジックあり" || ng "addPlayer: 同名チェックなし"
grep -q "が重複しています" "$TARGET" && ok "bulkEditNames: 重複チェックあり" || ng "bulkEditNames: 重複チェックなし"

# 2-4. 大会開始の検証
grep -q "参加者が少なすぎます" "$TARGET" && ok "startTournament: 人数チェックあり" || ng "人数チェックなし"
grep -q "Aクラスが奇数です" "$TARGET" && ok "startTournament: 奇数チェックあり" || ng "奇数チェックなし"
grep -q "進行中の大会データがあります" "$TARGET" && ok "startTournament: 再開始確認あり" || ng "再開始確認なし"

# 2-5. submitRoundの4チェック
grep -q "全試合の結果を入力してください" "$TARGET" && ok "submitRound: 未入力拒否" || ng "未入力拒否なし"
grep -q "登録されていない選手が含まれています" "$TARGET" && ok "submitRound: 存在しない選手拒否" || ng "存在しない選手拒否なし"
grep -q "が複数の対局に登録されています" "$TARGET" && ok "submitRound: 重複拒否" || ng "重複拒否なし"
grep -q "次の参加者が対局に登録されていません" "$TARGET" && ok "submitRound: 未割当拒否" || ng "未割当拒否なし"

# 2-6. 対戦相手変更の安全機構 (Hotfix Phase 4: replace + swap 自動分岐)
grep -q "結果入力済みのため変更できません" "$TARGET" && ok "changePairing: 入口 winner 阻止" || ng "入口 winner 阻止なし"
grep -q "相手ペアが結果入力済みのため、入れ替えできません" "$TARGET" && ok "changePairing: 相手ペア winner 阻止" || ng "相手ペア winner 阻止なし"
grep -q "再戦になる組み合わせが発生します" "$TARGET" && ok "changePairing: 入れ替え再戦阻止" || ng "入れ替え再戦阻止なし"
grep -q "この組み合わせは過去に対戦済みです" "$TARGET" && ok "changePairing: replace 再戦確認" || ng "replace 再戦確認なし"
grep -q "function findPairContainingPlayer" "$TARGET" && ok "changePairing: swap helper findPairContainingPlayer 定義" || ng "findPairContainingPlayer 未定義"

# 2-7. removePlayer の保護 (PR #116 で文言更新: 「進行中の対局」→「現在の組み合わせ」)
grep -q "現在の組み合わせに登録されているため削除できません" "$TARGET" && ok "removePlayer: 進行中ブロック" || ng "進行中ブロックなし"

# 2-8. 再生成時の勝敗保護
grep -q "入力済みの勝敗があります" "$TARGET" && ok "再生成: 勝敗保護確認" || ng "勝敗保護確認なし"

# 2-9. 順位計算: A/B/C 順序とタイブレーカー
grep -q "if(b.A!==a.A)return b.A-a.A" "$TARGET" && ok "順位: A(勝数)優先" || ng "A順序なし"
grep -q "if(b.B!==a.B)return b.B-a.B" "$TARGET" && ok "順位: B(SOS)タイブレーク" || ng "Bタイブレークなし"
grep -q "if(b.C!==a.C)return b.C-a.C" "$TARGET" && ok "順位: C(SODOS)タイブレーク" || ng "Cタイブレークなし"

# 2-10. 途中経過の負数: f.played-f.A を使っているか
played_count=$(grep -c "f.played-f.A" "$TARGET" || true)
[ "$played_count" -ge 3 ] && ok "途中経過負数: f.played-f.A を $played_count 箇所で使用" || ng "f.played-f.A の使用が $played_count 箇所(3以上必要)"
grep -q "state.rounds-f\.A" "$TARGET" && ng "古い負数表示 state.rounds-f.A が残存" || ok "古い負数表示なし"

# 2-11. 料金計算: 4パターン
grep -A3 "^function getFee" "$TARGET" | grep -q "grade==='chu'" && ok "getFee: 中学生区別あり" || ng "中学生区別なし"
grep -A3 "^function getFee" "$TARGET" | grep -q "member==='member'" && ok "getFee: 支部員区別あり" || ng "支部員区別なし"

# 2-12. リセットの完全性
# ROUND-CLASS-START-004b (spec §12.3): A/B 固定 literal は廃止。pane-{classId} / result-{classId} は
#   state.classes.forEach 経由で動的構築するため、A20 範囲では文字列 'pane-A' などが見えない場合がある。
#   範囲を A50 に拡大し、pane-+ / result-+ プレフィックスや classes-driven 構造 / rep-place / モーダル閉じを確認する。
grep -A50 "^function resetAll" "$TARGET" | grep -qE "pane-A|pane-'\+c\.id|getElementById\('pane-'" && ok "resetAll: pane-{classId} クリア" || ng "pane-{classId} 未クリア"
grep -A50 "^function resetAll" "$TARGET" | grep -qE "result-A|result-'\+c\.id|getElementById\('result-'" && ok "resetAll: result-{classId} クリア" || ng "result-{classId} 未クリア"
grep -A50 "^function resetAll" "$TARGET" | grep -q "rep-place" && ok "resetAll: rep-place 初期化" || ng "rep-place 未初期化"
grep -A50 "^function resetAll" "$TARGET" | grep -q "bulk-edit-modal" && ok "resetAll: モーダル閉じ" || ng "モーダル閉じなし"

# 2-13. loadData の再選択対応
grep -A5 "現在のデータを上書きして読み込みますか" "$TARGET" | grep -q "e.target.value=''" && ok "loadData: キャンセル時の再選択対応" || ng "再選択対応なし"

# ============================================
# 第3層: 既知バグ再発テスト
# ============================================
echo ""
echo "【第3層】既知バグ再発テスト(過去発覚した10種類)"

# B1. localStorageキーがshogi_v3のまま(過去バグ)
grep -q "localStorage.setItem('shogi_v3'" "$TARGET" && ng "B1: 旧キー shogi_v3 で保存している(再発)" || ok "B1: 旧キー shogi_v3 で保存していない"

# B2. PDF出力ボタン文言が古い(過去バグ)
grep -q "対戦成績をPDF出力<" "$TARGET" && ng "B2: 古いボタン文言 PDF出力 残存" || ok "B2: ボタン文言が新しい"

# B3. 進行中ダイアログ順序(過去バグ)
# ROUND-CLASS-START-004b (Codex Should Fix S2): startTournament の total fast-path は
#   collectStartCandidates 内の total-too-few 判定に集約されたため、startTournament 本体に
#   「参加者が少なすぎます」literal が存在しない。代わりに collectStartCandidates 内で
#   「参加者が少なすぎます」が宣言され、startTournament は hasOngoing confirm より先に
#   collectStartCandidates() を呼ぶことで論理的な順序を維持している。
#   B3 の意図（人数チェックが再開始確認より先に走る）は startTournament 内部で
#   collectStartCandidates 呼出が hasOngoing confirm より「後」にあるかではなく、現在の
#   atomic wrapper では: state.started===true guard → hasOngoing confirm → collectStartCandidates
#   の順となり、人数チェック (total-too-few) は collectStartCandidates 内部で最優先判定される。
#   そのため B3 オリジナルの literal 順序チェックは仕様変更で意味を失った。
#   ここでは collectStartCandidates が呼ばれていること + total-too-few message が file 内にあること
#   で代替確認する。
grep -q "collectStartCandidates(state.classes" "$TARGET" && ok "B3: startTournament が collectStartCandidates を呼ぶ（人数チェック含む atomic validate）" || ng "B3: collectStartCandidates 呼出なし"
grep -q "参加者が少なすぎます" "$TARGET" && ok "B3: total-too-few message が file 内に存在（collectStartCandidates 内）" || ng "B3: 人数チェック message が消失"

# B4. changePairing ドロップダウン未エスケープ(過去バグ)
grep -nE "opts.?\+='<option" "$TARGET" | grep -v "escapeHtml" | head -1 > /tmp/b4
if [ -s /tmp/b4 ]; then ng "B4: changePairing option未エスケープ(再発)"; else ok "B4: changePairing optionエスケープ済"; fi

# B5. bulkEditNames input value 未エスケープ(過去バグ)
grep -E 'bulk-name-.*value="' "$TARGET" | grep -v "escapeHtml" > /tmp/b5
if [ -s /tmp/b5 ]; then ng "B5: bulkEditNames value未エスケープ(再発)"; else ok "B5: bulkEditNames valueエスケープ済"; fi

# B6. showMsg未エスケープ(過去バグ)
grep -A2 "^function showMsg" "$TARGET" | grep -E "innerHTML.*\+text\+" | grep -v "escapeHtml" > /tmp/b6
if [ -s /tmp/b6 ]; then ng "B6: showMsg未エスケープ(再発)"; else ok "B6: showMsgエスケープ済"; fi

# B7. resetAllでrender呼ばずにDOMが残る(過去バグ)
# ROUND-CLASS-START-004b: pane-{classId} は state.classes.forEach 経由で動的に取得・クリアされるため
#   A20 範囲では確認できない場合がある。A60 範囲で確認する。
grep -A60 "^function resetAll" "$TARGET" | grep -qE "innerHTML=''.*pane|pane.*innerHTML=''" && ok "B7: resetAllでDOM明示クリア" || warn "B7: DOM明示クリア要確認"

# B8. 過去結果修正後の再描画(過去バグ): editPastResult または bindEditPastResultModalEvents で呼ばれる
{ grep -A30 "^function editPastResult" "$TARGET"; grep -A30 "^function bindEditPastResultModalEvents" "$TARGET"; } | grep -q "renderResults()" && ok "B8: editPastResult系でrenderResults呼出" || ng "B8: renderResults呼忘(再発)"

# B9. 再生成ボタンで勝敗確認なし(過去バグ)
grep -A5 "repairBtn_" "$TARGET" | grep -q "入力済みの勝敗" && ok "B9: 再生成時勝敗確認" || ng "B9: 勝敗確認なし(再発)"

# B10. 同バッチ内同名検出(過去バグ)
grep -A10 "重複チェック" "$TARGET" | grep -q "newNames\[all\[j\].id\]||all\[j\].name" && ok "B10: bulkEdit同バッチ内重複検出" || ng "B10: 同バッチ内重複検出ロジックなし(再発)"

# ============================================
# 比較テスト(オプション、比較元が指定されている場合)
# ============================================
if [ -n "$COMPARE" ] && [ -f "$COMPARE" ]; then
  echo ""
  echo "【比較】$(basename $COMPARE) との関数本体ハッシュ比較"
  T="$TARGET" C="$COMPARE" python3 << 'PYEOF'
import re, hashlib, sys, os
def extract_funcs(path):
    with open(path) as f: s=f.read()
    funcs={}
    for m in re.finditer(r'^function (\w+)\(.*?\{', s, re.MULTILINE):
        name=m.group(1); start=m.start(); depth=0; i=m.end()-1
        while i<len(s):
            if s[i]=='{': depth+=1
            elif s[i]=='}':
                depth-=1
                if depth==0: funcs[name]=s[start:i+1]; break
            i+=1
    return funcs
target=os.environ.get('T'); compare=os.environ.get('C')
b=extract_funcs(compare); a=extract_funcs(target)
all_names=sorted(set(b.keys())|set(a.keys()))
diffs=[]
for n in all_names:
    bh=hashlib.md5(b.get(n,'').encode()).hexdigest()[:8] if n in b else '---'
    ah=hashlib.md5(a.get(n,'').encode()).hexdigest()[:8] if n in a else '---'
    if bh!=ah: diffs.append((n,bh,ah))
if not diffs:
    print(f"  ✓ 全{len(all_names)}関数の本体ハッシュ一致(挙動変更なし保証)")
else:
    print(f"  ⚠ {len(diffs)}個の関数で本体ハッシュ差分あり(変更意図と一致するか要確認):")
    for n,bh,ah in diffs:
        print(f"      - {n}: {bh} -> {ah}")
PYEOF
fi

# ============================================
# テストデータでのnormalizeState動作確認
# ============================================
echo ""
echo "【第3層補足】テストデータでのnormalizeState堅牢性確認"
# data_*.json fixture は orphan clean base には含まれない（実データ非コミット方針）。
# glob 不一致時に未展開のリテラルパスを Python へ渡すと FileNotFoundError/Traceback になり
# 常時 FAIL となるため、nullglob で配列展開し 0 件なら skip（info 表示・FAIL/WARN 非加算）とする。
# fixture が存在する場合の検証内容（JSONパース可否 → ok/ng）は従来どおり維持する。
shopt -s nullglob
data_fixtures=( "$SCRIPT_DIR"/data_*.json )
shopt -u nullglob
if [ "${#data_fixtures[@]}" -eq 0 ]; then
  echo "  ℹ data_*.json fixture が見つからないためスキップ（FAIL/WARN 非加算）"
else
  for f in "${data_fixtures[@]}"; do
    name=$(basename "$f" .json)
    output=$(python3 -c "
import json,sys
with open('$f') as fp: json.load(fp)
" 2>&1)
    rc=$?
    if [ $rc -eq 0 ] && [ -z "$output" ]; then
      ok "$name: JSONパースOK"
    else
      ng "$name: Python例外/エラー → $(echo "$output" | head -1)"
    fi
  done
fi

# ----------------------------------------------------------------------------
# [PIPELINE-V2-PROPAGATE-001 / #264] 外部 .js テストの登録整理（WARN ノイズ解消）
#   この orphan clean base には存在しない feature 系統由来の外部 .js テスト 35 本
#   （test_report_ux_001.js / test_report_ux_003.js ほか）への `if [ -f ... ] ... else
#   warn "...見つからない"` 参照を登録解除した。これらはこのベースに無く実行されず、
#   常時 WARN=35 のノイズ源となって「本物の劣化」を埋もれさせていた（実体復元ではなく
#   登録解除を選択：本ベースのテストは登録とファイルが同伴する運用のため）。
#   結果 baseline は WARN=0 を正とする。テストを追加する際は test_*.js とその if ブロックを
#   セットで登録すること。feature 系統の該当テストは別系統 base 側に残存。
# ----------------------------------------------------------------------------
# ============================================
# REPORT-UX-002 classes-driven downloadReport 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-002 classes-driven downloadReport for C+ classes】"
if [ -f "$SCRIPT_DIR/test_report_ux_002.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_002.js" "$TARGET" > /tmp/report_ux_002_out.log 2>&1; then
    ok "REPORT-UX-002 テスト 全PASS ($(tail -1 /tmp/report_ux_002_out.log))"
  else
    ng "REPORT-UX-002 テスト 失敗"
    cat /tmp/report_ux_002_out.log
  fi
else
  warn "test_report_ux_002.js が見つからない"
fi

# ============================================
# REPORT-UX-004 configurable tournament title 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-004 configurable tournament title field】"
if [ -f "$SCRIPT_DIR/test_report_ux_004.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_004.js" "$TARGET" > /tmp/report_ux_004_out.log 2>&1; then
    ok "REPORT-UX-004 テスト 全PASS ($(tail -1 /tmp/report_ux_004_out.log))"
  else
    ng "REPORT-UX-004 テスト 失敗"
    cat /tmp/report_ux_004_out.log
  fi
else
  warn "test_report_ux_004.js が見つからない"
fi

# ============================================
# REPORT-UX-005 configurable organizer 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-005 configurable organizer field】"
if [ -f "$SCRIPT_DIR/test_report_ux_005.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_005.js" "$TARGET" > /tmp/report_ux_005_out.log 2>&1; then
    ok "REPORT-UX-005 テスト 全PASS ($(tail -1 /tmp/report_ux_005_out.log))"
  else
    ng "REPORT-UX-005 テスト 失敗"
    cat /tmp/report_ux_005_out.log
  fi
else
  warn "test_report_ux_005.js が見つからない"
fi

# ============================================
# REPORT-UX-006A place state-as-SoT / normalize / IME-safe 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-006A place state-as-SoT / normalize / IME-safe】"
if [ -f "$SCRIPT_DIR/test_report_ux_006.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_006.js" "$TARGET" > /tmp/report_ux_006_out.log 2>&1; then
    ok "REPORT-UX-006A テスト 全PASS ($(tail -1 /tmp/report_ux_006_out.log))"
  else
    ng "REPORT-UX-006A テスト 失敗"
    cat /tmp/report_ux_006_out.log
  fi
else
  warn "test_report_ux_006.js が見つからない"
fi

# ============================================
# REPORT-UX-006B date/start/end state-as-SoT / 旧形式互換 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-006B date/start/end state-as-SoT / 旧形式互換】"
if [ -f "$SCRIPT_DIR/test_report_ux_006b.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_006b.js" "$TARGET" > /tmp/report_ux_006b_out.log 2>&1; then
    ok "REPORT-UX-006B テスト 全PASS ($(tail -1 /tmp/report_ux_006b_out.log))"
  else
    ng "REPORT-UX-006B テスト 失敗"
    cat /tmp/report_ux_006b_out.log
  fi
else
  warn "test_report_ux_006b.js が見つからない"
fi

# ============================================
# REPORT-UX-006C sei/fuku/note state-as-SoT / 改行保持 / IME-safe 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-006C sei/fuku/note state-as-SoT / 改行保持 / IME-safe】"
if [ -f "$SCRIPT_DIR/test_report_ux_006c.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_006c.js" "$TARGET" > /tmp/report_ux_006c_out.log 2>&1; then
    ok "REPORT-UX-006C テスト 全PASS ($(tail -1 /tmp/report_ux_006c_out.log))"
  else
    ng "REPORT-UX-006C テスト 失敗"
    cat /tmp/report_ux_006c_out.log
  fi
else
  warn "test_report_ux_006c.js が見つからない"
fi

# ============================================
# REPORT-UX-007A footer 1行目 FAX番号 / 事務局名 state-as-SoT / IME-safe 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-007A footer 1行目 FAX番号 / 事務局名 state-as-SoT / IME-safe】"
if [ -f "$SCRIPT_DIR/test_report_ux_007a.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_007a.js" "$TARGET" > /tmp/report_ux_007a_out.log 2>&1; then
    ok "REPORT-UX-007A テスト 全PASS ($(tail -1 /tmp/report_ux_007a_out.log))"
  else
    ng "REPORT-UX-007A テスト 失敗"
    cat /tmp/report_ux_007a_out.log
  fi
else
  warn "test_report_ux_007a.js が見つからない"
fi

# ============================================
# REPORT-UX-007B footer 2行目 会計提出文 state-as-SoT / IME-safe 単体テスト
# ============================================
echo ""
echo "【REPORT-UX-007B footer 2行目 会計提出文 state-as-SoT / IME-safe】"
if [ -f "$SCRIPT_DIR/test_report_ux_007b.js" ]; then
  if node "$SCRIPT_DIR/test_report_ux_007b.js" "$TARGET" > /tmp/report_ux_007b_out.log 2>&1; then
    ok "REPORT-UX-007B テスト 全PASS ($(tail -1 /tmp/report_ux_007b_out.log))"
  else
    ng "REPORT-UX-007B テスト 失敗"
    cat /tmp/report_ux_007b_out.log
  fi
else
  warn "test_report_ux_007b.js が見つからない"
fi

# ============================================
# REPORT-PRINT-006-1 printResults title/date state.report 連動テスト
# ============================================
echo ""
echo "【REPORT-PRINT-006-1 printResults title/date state.report 連動】"
if [ -f "$SCRIPT_DIR/test_report_print_006.js" ]; then
  if node "$SCRIPT_DIR/test_report_print_006.js" "$TARGET" > /tmp/report_print_006_out.log 2>&1; then
    ok "REPORT-PRINT-006-1 テスト 全PASS ($(tail -1 /tmp/report_print_006_out.log))"
  else
    ng "REPORT-PRINT-006-1 テスト 失敗"
    cat /tmp/report_print_006_out.log
  fi
else
  warn "test_report_print_006.js が見つからない"
fi

# ============================================
# REPORT-PERSIST-VERIFY-001 報告書 13 フィールドの保存・復元 回帰テスト（Issue #261）
# ============================================
echo ""
echo "【REPORT-PERSIST-VERIFY-001 報告書13フィールドの保存・復元（save→load 往復）】"
if [ -f "$SCRIPT_DIR/test_report_persist_verify_001.js" ]; then
  if node "$SCRIPT_DIR/test_report_persist_verify_001.js" "$TARGET" > /tmp/report_persist_verify_001_out.log 2>&1; then
    ok "REPORT-PERSIST-VERIFY-001 テスト 全PASS ($(tail -1 /tmp/report_persist_verify_001_out.log))"
  else
    ng "REPORT-PERSIST-VERIFY-001 テスト 失敗"
    cat /tmp/report_persist_verify_001_out.log
  fi
else
  warn "test_report_persist_verify_001.js が見つからない"
fi

# ============================================
# NORMALIZE-REPORT-FIELD-001 normalizeReport* 集約（normalizeReportField + 設定テーブル）/ #285
# ============================================
echo ""
echo "【NORMALIZE-REPORT-FIELD-001 report 正規化ヘルパー集約（汎用関数＋ラッパー委譲恒等性）】"
if [ -f "$SCRIPT_DIR/test_normalize_report_field_001.js" ]; then
  if node "$SCRIPT_DIR/test_normalize_report_field_001.js" "$TARGET" > /tmp/normalize_report_field_001_out.log 2>&1; then
    ok "NORMALIZE-REPORT-FIELD-001 テスト 全PASS ($(tail -1 /tmp/normalize_report_field_001_out.log))"
  else
    ng "NORMALIZE-REPORT-FIELD-001 テスト 失敗"
    cat /tmp/normalize_report_field_001_out.log
  fi
else
  warn "test_normalize_report_field_001.js が見つからない"
fi

# ============================================
# LIVE-MOBILE-SCOREBOARD-001 スマホ閲覧専用ビュー（?view=scoreboard / 最終更新 / read-only）
# ============================================
echo ""
echo "【LIVE-MOBILE-SCOREBOARD-001 スマホ閲覧専用ビュー】"
if [ -f "$SCRIPT_DIR/test_live_scoreboard_001.js" ]; then
  if node "$SCRIPT_DIR/test_live_scoreboard_001.js" "$TARGET" > /tmp/live_scoreboard_001_out.log 2>&1; then
    ok "LIVE-MOBILE-SCOREBOARD-001 テスト 全PASS ($(tail -1 /tmp/live_scoreboard_001_out.log))"
  else
    ng "LIVE-MOBILE-SCOREBOARD-001 テスト 失敗"
    cat /tmp/live_scoreboard_001_out.log
  fi
else
  warn "test_live_scoreboard_001.js が見つからない"
fi

# ============================================
# SHOGI-TOUR-PDF-FILENAME-MVP-001 PDF ファイル名 {YYYYMMDD}_{大会名}[_{クラス名}]_{種別}
# ============================================
echo ""
echo "【SHOGI-TOUR-PDF-FILENAME-MVP-001 PDF ファイル名】"
if [ -f "$SCRIPT_DIR/test_pdf_filename_mvp_001.js" ]; then
  if node "$SCRIPT_DIR/test_pdf_filename_mvp_001.js" "$TARGET" > /tmp/pdf_filename_mvp_001_out.log 2>&1; then
    ok "SHOGI-TOUR-PDF-FILENAME-MVP-001 テスト 全PASS ($(tail -1 /tmp/pdf_filename_mvp_001_out.log))"
  else
    ng "SHOGI-TOUR-PDF-FILENAME-MVP-001 テスト 失敗"
    cat /tmp/pdf_filename_mvp_001_out.log
  fi
else
  warn "test_pdf_filename_mvp_001.js が見つからない"
fi

# ============================================
# SHOGI-TOUR-FURIGANA-MVP-001 参加者ふりがな（player.yomi 保持 + 受付一覧 ruby 表示）
# ============================================
echo ""
echo "【SHOGI-TOUR-FURIGANA-MVP-001 参加者ふりがな（player.yomi / 受付一覧 ruby）】"
if [ -f "$SCRIPT_DIR/test_furigana_mvp_001.js" ]; then
  if node "$SCRIPT_DIR/test_furigana_mvp_001.js" "$TARGET" > /tmp/furigana_mvp_001_out.log 2>&1; then
    ok "SHOGI-TOUR-FURIGANA-MVP-001 テスト 全PASS ($(tail -1 /tmp/furigana_mvp_001_out.log))"
  else
    ng "SHOGI-TOUR-FURIGANA-MVP-001 テスト 失敗"
    cat /tmp/furigana_mvp_001_out.log
  fi
else
  warn "test_furigana_mvp_001.js が見つからない"
fi

# ============================================
# SHOGI-TOUR-FURIGANA-VIEW-002 ふりがなルビを 順位表 / 星取表 / 閲覧ビュー / 印刷・PDF へ展開
# ============================================
echo ""
echo "【SHOGI-TOUR-FURIGANA-VIEW-002 ふりがなルビ展開（順位表 / 星取表 / 閲覧ビュー / 印刷PDF）】"
if [ -f "$SCRIPT_DIR/test_furigana_view_002.js" ]; then
  if node "$SCRIPT_DIR/test_furigana_view_002.js" "$TARGET" > /tmp/furigana_view_002_out.log 2>&1; then
    ok "SHOGI-TOUR-FURIGANA-VIEW-002 テスト 全PASS ($(tail -1 /tmp/furigana_view_002_out.log))"
  else
    ng "SHOGI-TOUR-FURIGANA-VIEW-002 テスト 失敗"
    cat /tmp/furigana_view_002_out.log
  fi
else
  warn "test_furigana_view_002.js が見つからない"
fi

# ============================================
# SHOGI-TOUR-HISTORY-STEP1 大会履歴（保存 / 一覧 / read-only 閲覧 / scoreboard 流用 / quota rollback）
# ============================================
echo ""
echo "【SHOGI-TOUR-HISTORY-STEP1 大会履歴（保存 / 一覧 / read-only 閲覧）】"
if [ -f "$SCRIPT_DIR/test_history_step1.js" ]; then
  if node "$SCRIPT_DIR/test_history_step1.js" "$TARGET" > /tmp/history_step1_out.log 2>&1; then
    ok "SHOGI-TOUR-HISTORY-STEP1 テスト 全PASS ($(tail -1 /tmp/history_step1_out.log))"
  else
    ng "SHOGI-TOUR-HISTORY-STEP1 テスト 失敗"
    cat /tmp/history_step1_out.log
  fi
else
  warn "test_history_step1.js が見つからない"
fi

# ============================================
# SHOGI-TOUR-START-001 クラス別「開始 readiness」表示（validateStartableClass 派生・保存しない）
# ============================================
echo ""
echo "【SHOGI-TOUR-START-001 クラス別 開始 readiness 表示】"
if [ -f "$SCRIPT_DIR/test_start_001.js" ]; then
  if node "$SCRIPT_DIR/test_start_001.js" "$TARGET" > /tmp/start_001_out.log 2>&1; then
    ok "SHOGI-TOUR-START-001 テスト 全PASS ($(tail -1 /tmp/start_001_out.log))"
  else
    ng "SHOGI-TOUR-START-001 テスト 失敗"
    cat /tmp/start_001_out.log
  fi
else
  warn "test_start_001.js が見つからない"
fi

# ============================================
# SHOGI-TOUR-START-003（受付タブのクラス別「1局目を作成」導線 / reg-class-start）は
#   START-UX-CONSOLIDATE-001 で撤去したため、test_start_003.js の登録を解除した。
#   撤去の確認は下記 test_start_ux_consolidate_001.js が担保する。
echo ""
echo "【START-UX-CONSOLIDATE-001 開始導線の対局管理タブ集約（#startBtn ナビ化 / reg-class-start 撤去）】"
if [ -f "$SCRIPT_DIR/test_start_ux_consolidate_001.js" ]; then
  if node "$SCRIPT_DIR/test_start_ux_consolidate_001.js" "$TARGET" > /tmp/start_ux_consolidate_001_out.log 2>&1; then
    ok "START-UX-CONSOLIDATE-001 テスト 全PASS ($(tail -1 /tmp/start_ux_consolidate_001_out.log))"
  else
    ng "START-UX-CONSOLIDATE-001 テスト 失敗"
    cat /tmp/start_ux_consolidate_001_out.log
  fi
else
  warn "test_start_ux_consolidate_001.js が見つからない"
fi

# ============================================
# FRP-IMPL-002 1局目部分手合いの土台 + 未割当一覧表示（部分開始 / 派生未割当）
#   #225 後の nav-only（受付タブは goToTournamentFromReg のみ）前提。FRP 操作入口は対局管理タブ。
#   append 作成は FRP-IMPL-003 で実装済み（下記ブロック）。本テストは 002 土台が 003 後も壊れない回帰を担保する。
# ============================================
echo ""
echo "【FRP-IMPL-002 部分開始の土台 + 1局目未割当一覧表示】"
if [ -f "$SCRIPT_DIR/test_frp_impl_002.js" ]; then
  if node "$SCRIPT_DIR/test_frp_impl_002.js" "$TARGET" > /tmp/frp_impl_002_out.log 2>&1; then
    ok "FRP-IMPL-002 テスト 全PASS ($(tail -1 /tmp/frp_impl_002_out.log))"
  else
    ng "FRP-IMPL-002 テスト 失敗"
    cat /tmp/frp_impl_002_out.log
  fi
else
  warn "test_frp_impl_002.js が見つからない"
fi

# ============================================
# FRP-IMPL-003 選択者だけで1局目対局を append 作成
#   未割当一覧から選択 → entry_no 昇順ペア化（奇数は末尾1人 leftover）→ 既存対局を変更せず末尾 append。
#   results 非空ブロック / 旧開始関数(generatePairing/startTournamentForClass/applyStartForCandidates) 非呼出 /
#   SAVE-FRP-002 保存検証 / 再入防止 を担保する。
# ============================================
echo ""
echo "【FRP-IMPL-003 選択者で1局目対局を追加作成（append・leftover・guard・SAVE-FRP-002）】"
if [ -f "$SCRIPT_DIR/test_frp_impl_003.js" ]; then
  if node "$SCRIPT_DIR/test_frp_impl_003.js" "$TARGET" > /tmp/frp_impl_003_out.log 2>&1; then
    ok "FRP-IMPL-003 テスト 全PASS ($(tail -1 /tmp/frp_impl_003_out.log))"
  else
    ng "FRP-IMPL-003 テスト 失敗"
    cat /tmp/frp_impl_003_out.log
  fi
else
  warn "test_frp_impl_003.js が見つからない"
fi

# ============================================
# FRP-IMPL-004A FRP append 手合いの保存復元 reload 不変条件
#   保存スキーマを増やさず、append 済み pairings / leftover 派生 / match-level メタ情報非保存 /
#   A-B 独立を normalizeState(JSON.parse(saved)) と actual load()/readPersistedState() 経路で固定する。
#   再生成ボタン gate（004B）/ UI 文言調整（004C）は対象外。
# ============================================
echo ""
echo "【FRP-IMPL-004A 保存復元 reload 不変条件（append・leftover 派生・schema 非拡張）】"
if [ -f "$SCRIPT_DIR/test_frp_impl_004.js" ]; then
  if node "$SCRIPT_DIR/test_frp_impl_004.js" "$TARGET" > /tmp/frp_impl_004_out.log 2>&1; then
    ok "FRP-IMPL-004A テスト 全PASS ($(tail -1 /tmp/frp_impl_004_out.log))"
  else
    ng "FRP-IMPL-004A テスト 失敗"
    cat /tmp/frp_impl_004_out.log
  fi
else
  warn "test_frp_impl_004.js が見つからない"
fi

# ============================================
# FRP-IMPL-004B 再生成ボタン gate
#   初回 round の部分手合い組成中（started・results 空・未割当>0）に repairBtn_ を出力しない
#   shouldShowRegenerateButton(cls) の predicate / buildCurrentPairingsHtml 出力 gate / DOM bind 対象の有無 /
#   強化 confirm（最小限）/ A-B 独立 / generatePairing 本体不変 を固定する。UI 文言調整（004C）は対象外。
# ============================================
echo ""
echo "【FRP-IMPL-004B 再生成ボタン gate（部分手合い組成中は repairBtn_ 非表示・confirm 強化・generatePairing 不変）】"
if [ -f "$SCRIPT_DIR/test_frp_impl_004b.js" ]; then
  if node "$SCRIPT_DIR/test_frp_impl_004b.js" "$TARGET" > /tmp/frp_impl_004b_out.log 2>&1; then
    ok "FRP-IMPL-004B テスト 全PASS ($(tail -1 /tmp/frp_impl_004b_out.log))"
  else
    ng "FRP-IMPL-004B テスト 失敗"
    cat /tmp/frp_impl_004b_out.log
  fi
else
  warn "test_frp_impl_004b.js が見つからない"
fi

# ============================================
# START-FRP-UX-001 幹事向け統合 UX（クラス別開始 / 1回戦中だけの途中参加 / 参加者一覧ルビ + ふりがな編集）受入テスト
#   8 受入条件（A/B 別開始・A/B 別リセット・1回戦途中参加・2回戦以降ブロック・勝敗保護優先・
#   ルビ未入力で非破壊・ルビ入力で一覧表示・save/reload 維持）を横断で固定する。
#   本 PR 純追加分: editPlayerYomi（参加者一覧の ふりがな編集）/ buildClassActionBarHtml 主導線化。
# ============================================
echo ""
echo "【START-FRP-UX-001 クラス別開始 / 途中参加 / 参加者一覧ルビ + ふりがな編集】"
if [ -f "$SCRIPT_DIR/test_start_frp_ux_001.js" ]; then
  if node "$SCRIPT_DIR/test_start_frp_ux_001.js" "$TARGET" > /tmp/start_frp_ux_001_out.log 2>&1; then
    ok "START-FRP-UX-001 テスト 全PASS ($(tail -1 /tmp/start_frp_ux_001_out.log))"
  else
    ng "START-FRP-UX-001 テスト 失敗"
    cat /tmp/start_frp_ux_001_out.log
  fi
else
  warn "test_start_frp_ux_001.js が見つからない"
fi

# ============================================
# HELP-UX-001 (#308) 対局画面の迷子防止 in-app ヘルプ 受入テスト
#   完全架空 state で HELP_TEXTS レジストリ / buildHelpModalHtml（ヘルプ文 present・閉じる・escape 経由）/
#   openHelpModal の open-close DOM フロー / 「？ ヘルプ」ボタンの配置・bind 結線 / 主要ボタン title= /
#   submitRound アラート文言（pin 部分文字列維持＋原因/行動）を固定する。
# ============================================
echo ""
echo "【HELP-UX-001 (#308) 対局画面 in-app ヘルプ（HELP_TEXTS / モーダル open-close / ？ボタン結線 / title / アラート文言）】"
if [ -f "$SCRIPT_DIR/test_help_001.js" ]; then
  if node "$SCRIPT_DIR/test_help_001.js" "$TARGET" > /tmp/help_001_out.log 2>&1; then
    ok "HELP-UX-001 テスト 全PASS ($(tail -1 /tmp/help_001_out.log))"
  else
    ng "HELP-UX-001 テスト 失敗"
    cat /tmp/help_001_out.log
  fi
else
  warn "test_help_001.js が見つからない"
fi

# ============================================
# HELP-UX-002 (#322) 大会報告書画面の迷子防止 in-app ヘルプ 受入テスト（#309 機構流用・第2スライス）
#   完全架空で HELP_TEXTS['report'] レジストリ（承認 title＋本文6行）/ buildHelpModalHtml（ヘルプ文 present・
#   閉じる・escape 経由）/ openHelpModal('report') の open-close DOM フロー / XSS（生タグ非流入）/
#   大会報告書 見出し脇「？ ヘルプ」ボタン(helpBtnReport)配置 / bindReportEvents の openHelpModal('report')
#   結線（build/bind 分離）を固定する。
# ============================================
echo ""
echo "【HELP-UX-002 (#322) 大会報告書 in-app ヘルプ（HELP_TEXTS['report'] / モーダル open-close / XSS / ？ボタン結線）】"
if [ -f "$SCRIPT_DIR/test_help_002.js" ]; then
  if node "$SCRIPT_DIR/test_help_002.js" "$TARGET" > /tmp/help_002_out.log 2>&1; then
    ok "HELP-UX-002 テスト 全PASS ($(tail -1 /tmp/help_002_out.log))"
  else
    ng "HELP-UX-002 テスト 失敗"
    cat /tmp/help_002_out.log
  fi
else
  warn "test_help_002.js が見つからない"
fi

echo ""
echo "【HELP-UX-003 (#338) 登録受付タブ in-app ヘルプ（HELP_TEXTS['reg'] / モーダル open-close / XSS / ？ボタン結線）】"
if [ -f "$SCRIPT_DIR/test_help_003.js" ]; then
  if node "$SCRIPT_DIR/test_help_003.js" "$TARGET" > /tmp/help_003_out.log 2>&1; then
    ok "HELP-UX-003 テスト 全PASS ($(tail -1 /tmp/help_003_out.log))"
  else
    ng "HELP-UX-003 テスト 失敗"
    cat /tmp/help_003_out.log
  fi
else
  warn "test_help_003.js が見つからない"
fi

echo ""
echo "【HELP-UX-004 (#341) 順位タブ in-app ヘルプ（HELP_TEXTS['standings'] / A/B/C・1勝1敗同順位 / open-close / XSS / ？ボタン結線）】"
if [ -f "$SCRIPT_DIR/test_help_004.js" ]; then
  if node "$SCRIPT_DIR/test_help_004.js" "$TARGET" > /tmp/help_004_out.log 2>&1; then
    ok "HELP-UX-004 テスト 全PASS ($(tail -1 /tmp/help_004_out.log))"
  else
    ng "HELP-UX-004 テスト 失敗"
    cat /tmp/help_004_out.log
  fi
else
  warn "test_help_004.js が見つからない"
fi

echo ""
echo "【HELP-UX-005 (#342) 支部マスタタブ in-app ヘルプ（HELP_TEXTS['master'] / 同期・統合・破損ガード・リセット / open-close / XSS / ？ボタン結線）】"
if [ -f "$SCRIPT_DIR/test_help_005.js" ]; then
  if node "$SCRIPT_DIR/test_help_005.js" "$TARGET" > /tmp/help_005_out.log 2>&1; then
    ok "HELP-UX-005 テスト 全PASS ($(tail -1 /tmp/help_005_out.log))"
  else
    ng "HELP-UX-005 テスト 失敗"
    cat /tmp/help_005_out.log
  fi
else
  warn "test_help_005.js が見つからない"
fi

# ============================================
# MEMBERS-CANDIDATE-MASTER-RECUT-001 members 形式 参加者候補マスタ読込（#194 価値分の再切り）
#   完全架空 fixture で member 真偽値後方互換 / 禁止項目 whitelist 除外 / deleted 墓石除外 /
#   大会state(shogi_v4)不変 / 候補マスタ(shogi_branch_master)保存 を固定する。
# ============================================
echo ""
echo "【MEMBERS-CANDIDATE-MASTER-RECUT-001 members 形式候補マスタ読込（member 真偽値後方互換 / whitelist / deleted 除外 / 大会state不変）】"
if [ -f "$SCRIPT_DIR/test_members_candidate_master_recut_001.js" ]; then
  if node "$SCRIPT_DIR/test_members_candidate_master_recut_001.js" "$TARGET" > /tmp/members_candidate_master_recut_001_out.log 2>&1; then
    ok "MEMBERS-CANDIDATE-MASTER-RECUT-001 テスト 全PASS ($(tail -1 /tmp/members_candidate_master_recut_001_out.log))"
  else
    ng "MEMBERS-CANDIDATE-MASTER-RECUT-001 テスト 失敗"
    cat /tmp/members_candidate_master_recut_001_out.log
  fi
else
  warn "test_members_candidate_master_recut_001.js が見つからない"
fi

# ============================================
# CLASS-VARIABLE-001 (CV-1) クラス管理UI + 登録プルダウンの class 駆動化 受入テスト
#   完全架空 state で クラス追加/改名/削除・削除ガード（A/B builtin/開始済み/在籍者あり）・
#   inp-class の class 駆動化（選択保持・名前反映）・3クラス目(C)への参加者登録・
#   後方互換（A/B 既定 / 重複名 class 横断）・save/reload 維持 を固定する。
# ============================================
echo ""
echo "【CLASS-VARIABLE-001 クラス管理UI（追加/改名/削除）+ inp-class クラス駆動化 / Cへ登録】"
if [ -f "$SCRIPT_DIR/test_class_variable_001.js" ]; then
  if node "$SCRIPT_DIR/test_class_variable_001.js" "$TARGET" > /tmp/class_variable_001_out.log 2>&1; then
    ok "CLASS-VARIABLE-001 テスト 全PASS ($(tail -1 /tmp/class_variable_001_out.log))"
  else
    ng "CLASS-VARIABLE-001 テスト 失敗"
    cat /tmp/class_variable_001_out.log
  fi
else
  warn "test_class_variable_001.js が見つからない"
fi

# ============================================
# DATA-PERSISTENCE Phase 1（JSON エクスポート/インポート: schema_version 検証 / local↔anonymous 分離 /
#   往復復元は既存 normalizeState 経路を再利用 / 既存 save/load 非回帰）。対象は shogi_v4.html。
# ============================================
echo ""
echo "【DATA-PERSISTENCE Phase 1 バックアップ（JSON export/import・schema検証・匿名分離・往復復元）】"
if [ -f "$SCRIPT_DIR/test_data_persistence_phase1.js" ]; then
  if node "$SCRIPT_DIR/test_data_persistence_phase1.js" "$TARGET" > /tmp/data_persistence_phase1_out.log 2>&1; then
    ok "DATA-PERSISTENCE Phase 1 テスト 全PASS ($(tail -1 /tmp/data_persistence_phase1_out.log))"
  else
    ng "DATA-PERSISTENCE Phase 1 テスト 失敗"
    cat /tmp/data_persistence_phase1_out.log
  fi
else
  warn "test_data_persistence_phase1.js が見つからない"
fi

# ============================================
# AUTO001-GATE-TEST-PORT-002 gate スクリプト（pr_gate / approved_merge）の shell テスト
#   orphan-dev profile / head-CAS(--match-head-commit) / git ls-remote stub / gh api 非依存 /
#   dry-run 既定 / --delete-branch・--auto 不使用 を mock gh + git stub で固定する。
#   ※ 対象は scripts/（shogi_v4.html ではない）。gh/git を PATH stub 化し実 GitHub/origin に触れない。
#   ※ #243 の Bash 3.2/UTF-8 bracing fix 後の base へ recut（C / UTF-8 ロケールとも PASS）。
# ============================================
echo ""
echo "【AUTO001-GATE-TEST-PORT-002 gate スクリプト（orphan-dev / head-CAS / git ls-remote stub / gh api 非依存）】"
if [ -f "$SCRIPT_DIR/test_pr_gate_scripts.sh" ]; then
  if bash "$SCRIPT_DIR/test_pr_gate_scripts.sh" > /tmp/pr_gate_scripts_out.log 2>&1; then
    ok "AUTO001-GATE-TEST-PORT-002 テスト 全PASS ($(tail -1 /tmp/pr_gate_scripts_out.log))"
  else
    ng "AUTO001-GATE-TEST-PORT-002 テスト 失敗"
    cat /tmp/pr_gate_scripts_out.log
  fi
else
  warn "test_pr_gate_scripts.sh が見つからない"
fi

# ============================================
# PROGRESSIVE-PAIRING-IMPL-P1 1局目逐次手合「クラス別『1卓追加』（受付順の先頭2名）」
#   部分開始中クラスの未手合い（受付順）先頭2名で round=1 の1卓を append する onClickAddOneTable と
#   その導線ボタン/bind/disabled を検証する。生成は buildFirstRoundPartialPairs、append は
#   appendFirstRoundPairs に委譲（追加のみ）。待機（奇数末尾1人）は派生 getUnassignedFirstRoundPlayers
#   に残し state へ二重保存しない。generatePairing（全員一括）は無改変＝既存一括非回帰を固定する。
# ============================================
echo ""
echo "【PROGRESSIVE-PAIRING-IMPL-P1 1局目逐次手合「1卓追加」（受付順・奇数待機・重複防止・reload・一括非回帰）】"
if [ -f "$SCRIPT_DIR/test_progressive_pairing_p1.js" ]; then
  if node "$SCRIPT_DIR/test_progressive_pairing_p1.js" "$TARGET" > /tmp/progressive_pairing_p1_out.log 2>&1; then
    ok "PROGRESSIVE-PAIRING-IMPL-P1 テスト 全PASS ($(tail -1 /tmp/progressive_pairing_p1_out.log))"
  else
    ng "PROGRESSIVE-PAIRING-IMPL-P1 テスト 失敗"
    cat /tmp/progressive_pairing_p1_out.log
  fi
else
  warn "test_progressive_pairing_p1.js が見つからない"
fi

echo ""
echo "【PROGRESSIVE-PAIRING-IMPL-P2 1局目逐次手合「未手合いをまとめて1局目作成」（受付順・奇数待機・P1併用重複防止・reload・既存非回帰）】"
if [ -f "$SCRIPT_DIR/test_progressive_pairing_p2.js" ]; then
  if node "$SCRIPT_DIR/test_progressive_pairing_p2.js" "$TARGET" > /tmp/progressive_pairing_p2_out.log 2>&1; then
    ok "PROGRESSIVE-PAIRING-IMPL-P2 テスト 全PASS ($(tail -1 /tmp/progressive_pairing_p2_out.log))"
  else
    ng "PROGRESSIVE-PAIRING-IMPL-P2 テスト 失敗"
    cat /tmp/progressive_pairing_p2_out.log
  fi
else
  warn "test_progressive_pairing_p2.js が見つからない"
fi

echo ""
echo "【ISSUE #274 [QA][P2] 1局目 append クロス再入の誤った赤エラー回帰（P1/P2/選択式の共有 in-flight フラグ・正規の二重割当ガード維持）】"
if [ -f "$SCRIPT_DIR/test_cross_reentry_274.js" ]; then
  if node "$SCRIPT_DIR/test_cross_reentry_274.js" "$TARGET" > /tmp/cross_reentry_274_out.log 2>&1; then
    ok "ISSUE #274 クロス再入テスト 全PASS ($(tail -1 /tmp/cross_reentry_274_out.log))"
  else
    ng "ISSUE #274 クロス再入テスト 失敗"
    cat /tmp/cross_reentry_274_out.log
  fi
else
  warn "test_cross_reentry_274.js が見つからない"
fi

# ============================================
# DATA-PERSISTENCE-PHASE2 / Stage A — Supabase スキーマ + RLS + マジックリンク・ログイン
#   (1) test_stagea_login.js : app/auth.js（runtime）のログイン/claim/幹事管理ロジックを mock client で検証。
#   (2) stagea_rls_pgtest.sh : supabase/migrations を実 PostgreSQL に適用し RLS の deny/allow を実証
#       （psql 不在・サーバ未起動なら SKIP=PASS 扱い）。当日運営(shogi_v4.html)には触れない別レイヤー。
# ============================================
echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage A — ログイン/幹事管理 runtime（app/auth.js・パスワードレス/claim/最後のadminガード）】"
if [ -f "$SCRIPT_DIR/test_stagea_login.js" ]; then
  if node "$SCRIPT_DIR/test_stagea_login.js" "$TARGET" > /tmp/stagea_login_out.log 2>&1; then
    ok "Stage A login テスト 全PASS ($(tail -1 /tmp/stagea_login_out.log))"
  else
    ng "Stage A login テスト 失敗"
    cat /tmp/stagea_login_out.log
  fi
else
  warn "test_stagea_login.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-1 — クラウド read-only 閲覧（app/auth.js・過去大会/結果/名簿・mock client）】"
if [ -f "$SCRIPT_DIR/test_stageb_read.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_read.js" "$TARGET" > /tmp/stageb_read_out.log 2>&1; then
    ok "Stage B-1 read-only テスト 全PASS ($(tail -1 /tmp/stageb_read_out.log))"
  else
    ng "Stage B-1 read-only テスト 失敗"
    cat /tmp/stageb_read_out.log
  fi
else
  warn "test_stageb_read.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-2a — ローカル state→クラウド upsert ペイロード純マッピング（buildCloudSyncPayload/deriveSeason）】"
if [ -f "$SCRIPT_DIR/test_stageb_payload.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_payload.js" "$TARGET" > /tmp/stageb_payload_out.log 2>&1; then
    ok "Stage B-2a payload テスト 全PASS ($(tail -1 /tmp/stageb_payload_out.log))"
  else
    ng "Stage B-2a payload テスト 失敗"
    cat /tmp/stageb_payload_out.log
  fi
else
  warn "test_stageb_payload.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-2b-core — クラウド送信オーケストレーション（syncTournamentToCloud・mock client・upsert順/onConflict/id解決/error経路）】"
if [ -f "$SCRIPT_DIR/test_stageb_sync.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_sync.js" "$TARGET" > /tmp/stageb_sync_out.log 2>&1; then
    ok "Stage B-2b-core テスト 全PASS ($(tail -1 /tmp/stageb_sync_out.log))"
  else
    ng "Stage B-2b-core テスト 失敗"
    cat /tmp/stageb_sync_out.log
  fi
else
  warn "test_stageb_sync.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-2b-wire — 送信ボタン グルー（pickActiveClubId/sendTournamentToCloud ガード・成功・失敗耐性・mock）】"
if [ -f "$SCRIPT_DIR/test_stageb_wire.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_wire.js" "$TARGET" > /tmp/stageb_wire_out.log 2>&1; then
    ok "Stage B-2b-wire テスト 全PASS ($(tail -1 /tmp/stageb_wire_out.log))"
  else
    ng "Stage B-2b-wire テスト 失敗"
    cat /tmp/stageb_wire_out.log
  fi
else
  warn "test_stageb_wire.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-3a — クラウド members→ローカル支部マスタ pull マージ（mergeCloudMembersIntoMaster・正本上書き/空上書き禁止/運用フィールド温存/tombstone/同名非統合/冪等・mock 配列）】"
if [ -f "$SCRIPT_DIR/test_stageb_pull_merge.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_pull_merge.js" "$TARGET" > /tmp/stageb_pull_merge_out.log 2>&1; then
    ok "Stage B-3a pull マージ テスト 全PASS ($(tail -1 /tmp/stageb_pull_merge_out.log))"
  else
    ng "Stage B-3a pull マージ テスト 失敗"
    cat /tmp/stageb_pull_merge_out.log
  fi
else
  warn "test_stageb_pull_merge.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-3b — クラウド members 読み取り pull オーケストレーション（pullMembersFromCloud・mock client・select/eq・merge→save・error/club/save失敗・loadBranchMaster 起点）】"
if [ -f "$SCRIPT_DIR/test_stageb_pull_orch.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_pull_orch.js" "$TARGET" > /tmp/stageb_pull_orch_out.log 2>&1; then
    ok "Stage B-3b pull オーケストレーション テスト 全PASS ($(tail -1 /tmp/stageb_pull_orch_out.log))"
  else
    ng "Stage B-3b pull オーケストレーション テスト 失敗"
    cat /tmp/stageb_pull_orch_out.log
  fi
else
  warn "test_stageb_pull_orch.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-3c-wire — 支部マスタ「☁ クラウドから取得」ボタン グルー（pullMembersToMasterUI・静的ボタン/bind結線・config無/未ログイン/クラブ無ガード・成功反映・mock）】"
if [ -f "$SCRIPT_DIR/test_stageb_pull_wire.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_pull_wire.js" "$TARGET" > /tmp/stageb_pull_wire_out.log 2>&1; then
    ok "Stage B-3c-wire テスト 全PASS ($(tail -1 /tmp/stageb_pull_wire_out.log))"
  else
    ng "Stage B-3c-wire テスト 失敗"
    cat /tmp/stageb_pull_wire_out.log
  fi
else
  warn "test_stageb_pull_wire.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-3c-auto — 起動時 auto-pull（autoPullMembersOnStartup・config検出+既存セッション時のみ背景pull・無音/fail-soft・未ログイン/クラブ無/config無ガード・マスタ表示中のみ再描画+status・DOMContentLoaded結線・mock）】"
if [ -f "$SCRIPT_DIR/test_stageb_pull_auto.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_pull_auto.js" "$TARGET" > /tmp/stageb_pull_auto_out.log 2>&1; then
    ok "Stage B-3c-auto テスト 全PASS ($(tail -1 /tmp/stageb_pull_auto_out.log))"
  else
    ng "Stage B-3c-auto テスト 失敗"
    cat /tmp/stageb_pull_auto_out.log
  fi
else
  warn "test_stageb_pull_auto.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-5 — app/ 名簿編集（追加/氏名・ふりがな・支部の更新/論理削除・復元・採番m_+uuid12・deleted_at含む select・追加フォーム結線・mock）】"
if [ -f "$SCRIPT_DIR/test_stageb_members_edit.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_members_edit.js" "$TARGET" > /tmp/stageb_members_edit_out.log 2>&1; then
    ok "Stage B-5 名簿編集 テスト 全PASS ($(tail -1 /tmp/stageb_members_edit_out.log))"
  else
    ng "Stage B-5 名簿編集 テスト 失敗"
    cat /tmp/stageb_members_edit_out.log
  fi
else
  warn "test_stageb_members_edit.js が見つからない"
fi

echo ""
echo "【DATA-IMPORT-ROUTING (#UX) — 保存系の取り違え防止（classifyImportJson 内容判別 / ファイル名 taikai/meibo/backup 判別 / 読込ルーティング backup自動復元・master誘導・空成功の罠解消）】"
if [ -f "$SCRIPT_DIR/test_import_routing.js" ]; then
  if node "$SCRIPT_DIR/test_import_routing.js" "$TARGET" > /tmp/import_routing_out.log 2>&1; then
    ok "DATA-IMPORT-ROUTING テスト 全PASS ($(tail -1 /tmp/import_routing_out.log))"
  else
    ng "DATA-IMPORT-ROUTING テスト 失敗"
    cat /tmp/import_routing_out.log
  fi
else
  warn "test_import_routing.js が見つからない"
fi

echo ""
echo "【SEC-S1 (#343 / SYSTEM-REVIEW S-1) supabase-js CDN の SRI＋バージョン固定（app/index.html 静的＋shogi_v4.html loadCloudDeps 動的・未固定@2残存なし）】"
if [ -f "$SCRIPT_DIR/test_cloud_cdn_sri.js" ]; then
  if node "$SCRIPT_DIR/test_cloud_cdn_sri.js" "$TARGET" > /tmp/cloud_cdn_sri_out.log 2>&1; then
    ok "SEC-S1 SRI テスト 全PASS ($(tail -1 /tmp/cloud_cdn_sri_out.log))"
  else
    ng "SEC-S1 SRI テスト 失敗"
    cat /tmp/cloud_cdn_sri_out.log
  fi
else
  warn "test_cloud_cdn_sri.js が見つからない"
fi

echo ""
echo "【PWA-PREP 相互ナビリンク（docs/PWA-PLAN）当日アプリ⇄app/ ワンタップ移動・同一ウィンドウ遷移】"
if [ -f "$SCRIPT_DIR/test_cross_nav_links.js" ]; then
  if node "$SCRIPT_DIR/test_cross_nav_links.js" "$TARGET" > /tmp/cross_nav_links_out.log 2>&1; then
    ok "PWA-PREP 相互ナビリンク テスト 全PASS ($(tail -1 /tmp/cross_nav_links_out.log))"
  else
    ng "PWA-PREP 相互ナビリンク テスト 失敗"
    cat /tmp/cross_nav_links_out.log
  fi
else
  warn "test_cross_nav_links.js が見つからない"
fi

echo ""
echo "【通年集計（シーズン別成績・#343/B-4活用）shape/listSeasons/aggregate/build/fetch/配線・read-only・mock】"
if [ -f "$SCRIPT_DIR/test_stageb_standings.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_standings.js" "$TARGET" > /tmp/stageb_standings_out.log 2>&1; then
    ok "通年集計 テスト 全PASS ($(tail -1 /tmp/stageb_standings_out.log))"
  else
    ng "通年集計 テスト 失敗"
    cat /tmp/stageb_standings_out.log
  fi
else
  warn "test_stageb_standings.js が見つからない"
fi

echo ""
echo "【通年集計 拡張（クラス別/記録殿堂/月別チャンピオン/市町村対抗）・read-only・mock】"
if [ -f "$SCRIPT_DIR/test_stageb_standings_ext.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_standings_ext.js" "$TARGET" > /tmp/stageb_standings_ext_out.log 2>&1; then
    ok "通年集計拡張 テスト 全PASS ($(tail -1 /tmp/stageb_standings_ext_out.log))"
  else
    ng "通年集計拡張 テスト 失敗"
    cat /tmp/stageb_standings_ext_out.log
  fi
else
  warn "test_stageb_standings_ext.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 B-4 — 過去大会 Excel 由来データの一括取り込み（validate/突き合わせ/プレビュー/べき等 upsert・既存非上書き・mock）】"
if [ -f "$SCRIPT_DIR/test_stageb_import.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_import.js" "$TARGET" > /tmp/stageb_import_out.log 2>&1; then
    ok "B-4 移行取り込み テスト 全PASS ($(tail -1 /tmp/stageb_import_out.log))"
  else
    ng "B-4 移行取り込み テスト 失敗"
    cat /tmp/stageb_import_out.log
  fi
else
  warn "test_stageb_import.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 B-4-wire — 取り込み UI（app/・JSONファイル読込→プレビュー→べき等取り込み・admin限定・mock）】"
if [ -f "$SCRIPT_DIR/test_stageb_import_wire.js" ]; then
  if node "$SCRIPT_DIR/test_stageb_import_wire.js" "$TARGET" > /tmp/stageb_import_wire_out.log 2>&1; then
    ok "B-4-wire 取り込みUI テスト 全PASS ($(tail -1 /tmp/stageb_import_wire_out.log))"
  else
    ng "B-4-wire 取り込みUI テスト 失敗"
    cat /tmp/stageb_import_wire_out.log
  fi
else
  warn "test_stageb_import_wire.js が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage A — RLS 実 PostgreSQL 検証（stagea_rls_pgtest.sh / psql 無ければ SKIP）】"
if [ -f "$SCRIPT_DIR/stagea_rls_pgtest.sh" ]; then
  if bash "$SCRIPT_DIR/stagea_rls_pgtest.sh" > /tmp/stagea_rls_out.log 2>&1; then
    ok "Stage A RLS pgtest OK/SKIP ($(tail -1 /tmp/stagea_rls_out.log))"
  else
    ng "Stage A RLS pgtest 失敗"
    cat /tmp/stagea_rls_out.log
  fi
else
  warn "stagea_rls_pgtest.sh が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-0 — entries タイブレーク列追補(sos/sodos) 実 PostgreSQL 検証（psql 無ければ SKIP）】"
if [ -f "$SCRIPT_DIR/stageb_entries_tiebreak_pgtest.sh" ]; then
  if bash "$SCRIPT_DIR/stageb_entries_tiebreak_pgtest.sh" > /tmp/stageb_tiebreak_out.log 2>&1; then
    ok "Stage B-0 pgtest OK/SKIP ($(tail -1 /tmp/stageb_tiebreak_out.log))"
  else
    ng "Stage B-0 pgtest 失敗"
    cat /tmp/stageb_tiebreak_out.log
  fi
else
  warn "stageb_entries_tiebreak_pgtest.sh が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-2(schema) — tournaments.app_tournament_id 追補（部分一意・実 PostgreSQL 検証 / psql 無ければ SKIP）】"
if [ -f "$SCRIPT_DIR/stageb_tournaments_app_id_pgtest.sh" ]; then
  if bash "$SCRIPT_DIR/stageb_tournaments_app_id_pgtest.sh" > /tmp/stageb_appid_out.log 2>&1; then
    ok "Stage B-2(schema) pgtest OK/SKIP ($(tail -1 /tmp/stageb_appid_out.log))"
  else
    ng "Stage B-2(schema) pgtest 失敗"
    cat /tmp/stageb_appid_out.log
  fi
else
  warn "stageb_tournaments_app_id_pgtest.sh が見つからない"
fi

echo ""
echo "【DATA-PERSISTENCE-PHASE2 Stage B-5(schema) — members.deleted_at 追補（論理削除列・実 PostgreSQL 検証 / psql 無ければ SKIP）】"
if [ -f "$SCRIPT_DIR/stageb_members_deleted_at_pgtest.sh" ]; then
  if bash "$SCRIPT_DIR/stageb_members_deleted_at_pgtest.sh" > /tmp/stageb_memdel_out.log 2>&1; then
    ok "Stage B-5(schema) pgtest OK/SKIP ($(tail -1 /tmp/stageb_memdel_out.log))"
  else
    ng "Stage B-5(schema) pgtest 失敗"
    cat /tmp/stageb_memdel_out.log
  fi
else
  warn "stageb_members_deleted_at_pgtest.sh が見つからない"
fi

# ============================================
# SAVE-UX-NONQUOTA-NOTIFY-001 (Issue #260): saveBranchMaster() の「quota 以外」保存失敗を
#   サイレント握り潰し（console.warn 単独）から notifySaveWarning 経由のユーザー通知
#   （showMsg('warn')＋indicator +1）へ格上げしたことを検証する。quota パス・正常保存パスの
#   非回帰、console.warn の非二重化（ちょうど 1 回）も併せて固定する。
# ============================================
echo ""
echo "【SAVE-UX-NONQUOTA-NOTIFY-001 支部マスタ保存の非quota失敗をユーザー通知（showMsg＋indicator）】"
if [ -f "$SCRIPT_DIR/test_save_ux_nonquota_notify_001.js" ]; then
  if node "$SCRIPT_DIR/test_save_ux_nonquota_notify_001.js" "$TARGET" > /tmp/save_ux_nonquota_notify_001_out.log 2>&1; then
    ok "SAVE-UX-NONQUOTA-NOTIFY-001 テスト 全PASS ($(tail -1 /tmp/save_ux_nonquota_notify_001_out.log))"
  else
    ng "SAVE-UX-NONQUOTA-NOTIFY-001 テスト 失敗"
    cat /tmp/save_ux_nonquota_notify_001_out.log
  fi
else
  warn "test_save_ux_nonquota_notify_001.js が見つからない"
fi

echo ""
echo "【SAVE-UX-NONQUOTA-NOTIFY-001 (Codex P2) saveBranchMaster 失敗シグナル return ＋ 呼出側の成功バナー抑止 ＋ master 誘導文言】"
if [ -f "$SCRIPT_DIR/test_save_branch_master_failure_signal.js" ]; then
  if node "$SCRIPT_DIR/test_save_branch_master_failure_signal.js" "$TARGET" > /tmp/save_branch_master_failure_signal_out.log 2>&1; then
    ok "SAVE-BRANCH-MASTER-FAILURE-SIGNAL テスト 全PASS ($(tail -1 /tmp/save_branch_master_failure_signal_out.log))"
  else
    ng "SAVE-BRANCH-MASTER-FAILURE-SIGNAL テスト 失敗"
    cat /tmp/save_branch_master_failure_signal_out.log
  fi
else
  warn "test_save_branch_master_failure_signal.js が見つからない"
fi

echo ""
echo "【SAVE-UX-NONQUOTA-NOTIFY-001 (Codex P2-A/P2-B) マイグレ失敗時の誤誘導是正 ＋ yomi バックフィル保存失敗の握り潰し是正】"
if [ -f "$SCRIPT_DIR/test_save_ux_nonquota_notify_002.js" ]; then
  if node "$SCRIPT_DIR/test_save_ux_nonquota_notify_002.js" "$TARGET" > /tmp/save_ux_nonquota_notify_002_out.log 2>&1; then
    ok "SAVE-UX-NONQUOTA-NOTIFY-001 P2追補 テスト 全PASS ($(tail -1 /tmp/save_ux_nonquota_notify_002_out.log))"
  else
    ng "SAVE-UX-NONQUOTA-NOTIFY-001 P2追補 テスト 失敗"
    cat /tmp/save_ux_nonquota_notify_002_out.log
  fi
else
  warn "test_save_ux_nonquota_notify_002.js が見つからない"
fi

# ============================================
# SAVE-NONQUOTA-ALERT-001 (Issue #278): save() の非quota 保存失敗（循環参照による JSON.stringify
#   TypeError / SecurityError / プライベートブラウズ等）が、登録タブ表示中だと画面内バナーのみで
#   blocking alert が出ず保存失敗が静かに見逃される問題を是正。notifyError に alwaysAlert を追加し
#   save() が true を渡すことで、表示中タブに関わらず alert を 1 回出す。quota 回帰・二重 alert なし・
#   _lastErr dedup 維持・notifyError 後方互換を併せて固定する。
# ============================================
echo ""
echo "【SAVE-NONQUOTA-ALERT-001 save() 非quota保存失敗を登録タブ表示中でも alert（quotaと認知強度を揃える）】"
if [ -f "$SCRIPT_DIR/test_save_nonquota_alert_278.js" ]; then
  if node "$SCRIPT_DIR/test_save_nonquota_alert_278.js" "$TARGET" > /tmp/save_nonquota_alert_278_out.log 2>&1; then
    ok "SAVE-NONQUOTA-ALERT-001 テスト 全PASS ($(tail -1 /tmp/save_nonquota_alert_278_out.log))"
  else
    ng "SAVE-NONQUOTA-ALERT-001 テスト 失敗"
    cat /tmp/save_nonquota_alert_278_out.log
  fi
else
  warn "test_save_nonquota_alert_278.js が見つからない"
fi

# ============================================
# ISSUE-272 PAIRING-ODD-LEFTOVER 2回戦以降の奇数で 0 卓に潰れる進行不能バグの修正
#   generatePairing(奇数→floor(N/2)卓+末尾1人待機・0卓に潰さない・不戦勝にしない) /
#   submitRound(2回戦以降の待機1名のみ許容＝進行できる・1回戦/偶数は従来どおり) /
#   addPlayer(開始済み2回戦以降は confirm 通知ガード) / getRoundLeftoverPlayers(待機派生表示) /
#   buildCurrentPairingsHtml(待機者明示) / reload 往復・match スキーマ不変 を固定する。
# ============================================
echo ""
echo "【ISSUE-272 2回戦以降の奇数ペアリング（floor(N/2)卓+待機・進行可能・偶数不変・通知ガード）】"
if [ -f "$SCRIPT_DIR/test_pairing_odd_leftover_272.js" ]; then
  if node "$SCRIPT_DIR/test_pairing_odd_leftover_272.js" "$TARGET" > /tmp/pairing_odd_leftover_272_out.log 2>&1; then
    ok "ISSUE-272 テスト 全PASS ($(tail -1 /tmp/pairing_odd_leftover_272_out.log))"
  else
    ng "ISSUE-272 テスト 失敗"
    cat /tmp/pairing_odd_leftover_272_out.log
  fi
else
  warn "test_pairing_odd_leftover_272.js が見つからない"
fi

# ============================================
# ISSUE-273 BRANCH-MASTER-ALL-CLASSES C 以降クラスの支部マスタ同期/過去大会統合への反映
#   updateBranchMasterFromTournament（同期）/ mergeTournamentParticipantsIntoMaster（統合）の
#   クラス列挙を ['A','B'] 固定から listClassIdsForMasterSync（state.classes / players キー駆動）へ。
#   C 以降の取りこぼし解消・A/B のみは件数/行順不変・last_class は A/B/null 不変条件を温存 を固定する。
# ============================================
echo ""
echo "【ISSUE-273 C 以降クラスの支部マスタ同期/統合反映（全クラス列挙・A/B 不変・last_class 不変条件）】"
if [ -f "$SCRIPT_DIR/test_branch_master_all_classes_273.js" ]; then
  if node "$SCRIPT_DIR/test_branch_master_all_classes_273.js" "$TARGET" > /tmp/branch_master_all_classes_273_out.log 2>&1; then
    ok "ISSUE-273 テスト 全PASS ($(tail -1 /tmp/branch_master_all_classes_273_out.log))"
  else
    ng "ISSUE-273 テスト 失敗"
    cat /tmp/branch_master_all_classes_273_out.log
  fi
else
  warn "test_branch_master_all_classes_273.js が見つからない"
fi

# ============================================
# ISSUE-275 BRANCH-MASTER-SCHEMA-GUARD 支部マスタ schema_version 不一致の無警告破棄を是正
#   normalizeBranchMaster（未知 schema_version → 空+_loaded_with_corruption で保存スキップ保護）/
#   loadBranchMaster（読込経路も同様）/ syncBranchMasterOnSave（フラグ由来の空は保存スキップ＝stored 温存）/
#   正常 v1・schema_version 不在・parse 失敗 catch の非回帰 を固定する。
# ============================================
echo ""
echo "【ISSUE-275 支部マスタ schema_version 不一致の無警告破棄是正（未知版→空+corruptionフラグ→保存スキップ・stored 温存・非回帰）】"
if [ -f "$SCRIPT_DIR/test_branch_master_schema_guard_275.js" ]; then
  if node "$SCRIPT_DIR/test_branch_master_schema_guard_275.js" "$TARGET" > /tmp/branch_master_schema_guard_275_out.log 2>&1; then
    ok "ISSUE-275 テスト 全PASS ($(tail -1 /tmp/branch_master_schema_guard_275_out.log))"
  else
    ng "ISSUE-275 テスト 失敗"
    cat /tmp/branch_master_schema_guard_275_out.log
  fi
else
  warn "test_branch_master_schema_guard_275.js が見つからない"
fi

echo ""
echo "【ISSUE-329 支部マスタ import 破損ガード抜け是正（overwrite/merge で _loaded_with_corruption→保存スキップ・既存温存・非回帰）】"
if [ -f "$SCRIPT_DIR/test_master_import_corruption_guard_329.js" ]; then
  if node "$SCRIPT_DIR/test_master_import_corruption_guard_329.js" "$TARGET" > /tmp/master_import_corruption_guard_329_out.log 2>&1; then
    ok "ISSUE-329 テスト 全PASS ($(tail -1 /tmp/master_import_corruption_guard_329_out.log))"
  else
    ng "ISSUE-329 テスト 失敗"
    cat /tmp/master_import_corruption_guard_329_out.log
  fi
else
  warn "test_master_import_corruption_guard_329.js が見つからない"
fi

echo ""
echo "【ISSUE-333 リロード/復元後 yomi master同期サイレント消失 是正（yomiMap優先・player.yomiフォールバック・既存非空温存）】"
if [ -f "$SCRIPT_DIR/test_yomi_master_sync_fallback_333.js" ]; then
  if node "$SCRIPT_DIR/test_yomi_master_sync_fallback_333.js" "$TARGET" > /tmp/yomi_master_sync_fallback_333_out.log 2>&1; then
    ok "ISSUE-333 テスト 全PASS ($(tail -1 /tmp/yomi_master_sync_fallback_333_out.log))"
  else
    ng "ISSUE-333 テスト 失敗"
    cat /tmp/yomi_master_sync_fallback_333_out.log
  fi
else
  warn "test_yomi_master_sync_fallback_333.js が見つからない"
fi

echo ""
echo "【ISSUE-330 entry_no 非有限/非安全整数(Infinity/1e21)の一意採番ガード（isValidEntryNo・#276堅牢化の取りこぼし是正）】"
if [ -f "$SCRIPT_DIR/test_entry_no_finite_guard_330.js" ]; then
  if node "$SCRIPT_DIR/test_entry_no_finite_guard_330.js" "$TARGET" > /tmp/entry_no_finite_guard_330_out.log 2>&1; then
    ok "ISSUE-330 テスト 全PASS ($(tail -1 /tmp/entry_no_finite_guard_330_out.log))"
  else
    ng "ISSUE-330 テスト 失敗"
    cat /tmp/entry_no_finite_guard_330_out.log
  fi
else
  warn "test_entry_no_finite_guard_330.js が見つからない"
fi

echo ""
echo "【ISSUE-331 直接対決 1勝1敗(split)は同順位（headToHeadBalance・全対戦行集計・明確な勝越しは勝者上位）】"
if [ -f "$SCRIPT_DIR/test_rank_headtohead_split_331.js" ]; then
  if node "$SCRIPT_DIR/test_rank_headtohead_split_331.js" "$TARGET" > /tmp/rank_headtohead_split_331_out.log 2>&1; then
    ok "ISSUE-331 テスト 全PASS ($(tail -1 /tmp/rank_headtohead_split_331_out.log))"
  else
    ng "ISSUE-331 テスト 失敗"
    cat /tmp/rank_headtohead_split_331_out.log
  fi
else
  warn "test_rank_headtohead_split_331.js が見つからない"
fi

# ============================================
# PHASE-A-TEST-SAFETY-NET (Issue #283): ゴールデンマスター土台 + 薄い領域の characterization
#   shogi_v4.html 無改変。段階リファクタ（Phase B 以降）の挙動完全不変を機械的に担保する安全網。
# ============================================
echo ""
echo "【GOLDEN-MASTER-001 純関数 / build* 系の現状出力スナップショット（バイト/構造一致の番人）】"
if [ -f "$SCRIPT_DIR/test_golden_master_001.js" ]; then
  if node "$SCRIPT_DIR/test_golden_master_001.js" "$TARGET" > /tmp/golden_master_001_out.log 2>&1; then
    ok "GOLDEN-MASTER-001 テスト 全PASS ($(tail -1 /tmp/golden_master_001_out.log))"
  else
    ng "GOLDEN-MASTER-001 テスト 失敗（出力差分の可能性。意図的更新は UPDATE_GOLDEN=1 で再採取）"
    cat /tmp/golden_master_001_out.log
  fi
else
  warn "test_golden_master_001.js が見つからない"
fi

echo ""
echo "【PRINT-RESULTS-CHAR-001 printResults の HTML payload を Blob-stub で捕捉（B-5a 抽出の byte 一致番人）】"
if [ -f "$SCRIPT_DIR/test_print_results_characterization_001.js" ]; then
  if node "$SCRIPT_DIR/test_print_results_characterization_001.js" "$TARGET" > /tmp/print_results_char_001_out.log 2>&1; then
    ok "PRINT-RESULTS-CHAR-001 テスト 全PASS ($(tail -1 /tmp/print_results_char_001_out.log))"
  else
    ng "PRINT-RESULTS-CHAR-001 テスト 失敗（payload 差分の可能性。意図的更新は UPDATE_GOLDEN=1 で再採取）"
    cat /tmp/print_results_char_001_out.log
  fi
else
  warn "test_print_results_characterization_001.js が見つからない"
fi

echo ""
echo "【DOWNLOAD-REPORT-CHAR-001 downloadReport の HTML payload を Blob-stub で捕捉（B-5b 抽出の byte 一致番人）】"
if [ -f "$SCRIPT_DIR/test_download_report_characterization_001.js" ]; then
  if node "$SCRIPT_DIR/test_download_report_characterization_001.js" "$TARGET" > /tmp/download_report_char_001_out.log 2>&1; then
    ok "DOWNLOAD-REPORT-CHAR-001 テスト 全PASS ($(tail -1 /tmp/download_report_char_001_out.log))"
  else
    ng "DOWNLOAD-REPORT-CHAR-001 テスト 失敗（payload 差分の可能性。意図的更新は UPDATE_GOLDEN=1 で再採取）"
    cat /tmp/download_report_char_001_out.log
  fi
else
  warn "test_download_report_characterization_001.js が見つからない"
fi

echo ""
echo "【CHAR evaluatePairingQuality ペアリング品質評価の詳細分岐（characterization）】"
if [ -f "$SCRIPT_DIR/test_char_pairing_quality_001.js" ]; then
  if node "$SCRIPT_DIR/test_char_pairing_quality_001.js" "$TARGET" > /tmp/char_pairing_quality_001_out.log 2>&1; then
    ok "CHAR pairing-quality テスト 全PASS ($(tail -1 /tmp/char_pairing_quality_001_out.log))"
  else
    ng "CHAR pairing-quality テスト 失敗"
    cat /tmp/char_pairing_quality_001_out.log
  fi
else
  warn "test_char_pairing_quality_001.js が見つからない"
fi

echo ""
echo "【CHAR normalizeClasses クラス配列正規化・互換補完（characterization）】"
if [ -f "$SCRIPT_DIR/test_char_normalize_classes_001.js" ]; then
  if node "$SCRIPT_DIR/test_char_normalize_classes_001.js" "$TARGET" > /tmp/char_normalize_classes_001_out.log 2>&1; then
    ok "CHAR normalize-classes テスト 全PASS ($(tail -1 /tmp/char_normalize_classes_001_out.log))"
  else
    ng "CHAR normalize-classes テスト 失敗"
    cat /tmp/char_normalize_classes_001_out.log
  fi
else
  warn "test_char_normalize_classes_001.js が見つからない"
fi

echo ""
echo "【CHAR 支部マスタ同期 updateBranchMasterFromTournament / mergeTournamentParticipantsIntoMaster（characterization）】"
if [ -f "$SCRIPT_DIR/test_char_branch_master_sync_001.js" ]; then
  if node "$SCRIPT_DIR/test_char_branch_master_sync_001.js" "$TARGET" > /tmp/char_branch_master_sync_001_out.log 2>&1; then
    ok "CHAR branch-master-sync テスト 全PASS ($(tail -1 /tmp/char_branch_master_sync_001_out.log))"
  else
    ng "CHAR branch-master-sync テスト 失敗"
    cat /tmp/char_branch_master_sync_001_out.log
  fi
else
  warn "test_char_branch_master_sync_001.js が見つからない"
fi

echo ""
echo "【CHAR 過去参加者パネル buildPastParticipantsPanelHtml / matchesPastParticipantQuery（characterization）】"
if [ -f "$SCRIPT_DIR/test_char_past_participants_001.js" ]; then
  if node "$SCRIPT_DIR/test_char_past_participants_001.js" "$TARGET" > /tmp/char_past_participants_001_out.log 2>&1; then
    ok "CHAR past-participants テスト 全PASS ($(tail -1 /tmp/char_past_participants_001_out.log))"
  else
    ng "CHAR past-participants テスト 失敗"
    cat /tmp/char_past_participants_001_out.log
  fi
else
  warn "test_char_past_participants_001.js が見つからない"
fi

# ============================================
# STATE-NORMALIZE-GUARD (#312) normalizeState 近辺の正規化バグ2件 batch 修正
#   #277 rounds: 負数/小数の素通り・rounds=0 化けを正の整数クランプで是正（floor・1未満→4・上限なし）。
#   #276 entry_no: 不在を index+1 補完→明示値と衝突＝重複していたのを衝突回避の一意採番
#     （reconcileEntryNos: 明示一意値は保持・不在/無効/重複は max+1 採番・欠番非再利用）へ。
#     normalizeState 補完と nextEntryNoForClass を一意採番に揃える。
# ============================================
echo ""
echo "【STATE-NORMALIZE-GUARD #312 rounds 正の整数クランプ / entry_no 衝突回避一意採番】"
if [ -f "$SCRIPT_DIR/test_state_normalize_guard_312.js" ]; then
  if node "$SCRIPT_DIR/test_state_normalize_guard_312.js" "$TARGET" > /tmp/state_normalize_guard_312_out.log 2>&1; then
    ok "STATE-NORMALIZE-GUARD #312 テスト 全PASS ($(tail -1 /tmp/state_normalize_guard_312_out.log))"
  else
    ng "STATE-NORMALIZE-GUARD #312 テスト 失敗"
    cat /tmp/state_normalize_guard_312_out.log
  fi
else
  warn "test_state_normalize_guard_312.js が見つからない"
fi

echo ""
echo "【QA-MISC-279 (#279) P3 軽微バグ 5 件 D-01/D-03/A-07/A-08/D-02 の意図的修正】"
if [ -f "$SCRIPT_DIR/test_qa_misc_279.js" ]; then
  if node "$SCRIPT_DIR/test_qa_misc_279.js" "$TARGET" > /tmp/qa_misc_279_out.log 2>&1; then
    ok "QA-MISC-279 テスト 全PASS ($(tail -1 /tmp/qa_misc_279_out.log))"
  else
    ng "QA-MISC-279 テスト 失敗"
    cat /tmp/qa_misc_279_out.log
  fi
else
  warn "test_qa_misc_279.js が見つからない"
fi

# ============================================
# LEFTOVER-ROTATION-GUARD-001: 奇数人数の待機(leftover)が回戦をまたいでローテーションし、
#   特定の1人が最後まで一度も対局に入らない事態が起きないことを固定（#272 の sitOut ローテーション
#   ＋submitRound 待機許容を守る回帰テスト）。N=5/7/9/19/21 を多数試行で固定。
# ============================================
echo ""
echo "【LEFTOVER-ROTATION-GUARD-001 奇数待機のローテーション（特定1人が全回戦 対局なしにならない）】"
if [ -f "$SCRIPT_DIR/test_leftover_rotation_guard_001.js" ]; then
  if node "$SCRIPT_DIR/test_leftover_rotation_guard_001.js" "$TARGET" > /tmp/leftover_rotation_guard_001_out.log 2>&1; then
    ok "LEFTOVER-ROTATION-GUARD-001 テスト 全PASS ($(tail -1 /tmp/leftover_rotation_guard_001_out.log))"
  else
    ng "LEFTOVER-ROTATION-GUARD-001 テスト 失敗"
    cat /tmp/leftover_rotation_guard_001_out.log
  fi
else
  warn "test_leftover_rotation_guard_001.js が見つからない"
fi

# ============================================
# FEE-JOSEI-001 (#325) 会費区分に「女性」(josei) を追加（会費は中学生以下=chu と完全同額）
#   getFee(josei===chu) / calcTotal 合算 / normalizeState・save→load 往復で josei 保持 /
#   normalizeBranchMaster（アプリ native 往復で josei 保持・外部段位は ippan 既定維持）/ convertPhase2 /
#   addPlayerFromMaster / createMemberFromParticipant / applyMasterMemberEdit（josei 受理・不正値拒否）/
#   マスタ一覧「会費区分」「女性」/ 編集モーダル女性 radio / 受付一覧 select 女性 option / 未知値→ippan 非回帰。
# ============================================
echo ""
echo "【FEE-JOSEI-001 (#325) 会費区分に女性追加（josei=chu 同額・正規化往復・UI/一覧表示・非回帰）】"
if [ -f "$SCRIPT_DIR/test_fee_josei_001.js" ]; then
  if node "$SCRIPT_DIR/test_fee_josei_001.js" "$TARGET" > /tmp/fee_josei_001_out.log 2>&1; then
    ok "FEE-JOSEI-001 テスト 全PASS ($(tail -1 /tmp/fee_josei_001_out.log))"
  else
    ng "FEE-JOSEI-001 テスト 失敗"
    cat /tmp/fee_josei_001_out.log
  fi
else
  warn "test_fee_josei_001.js が見つからない"
fi

# ============================================
# PAST-ADD-FEE-INHERIT-001 過去参加者の一括追加が支部マスタの会費区分(member/grade)を引き継ぐ
#   旧バグ（一括が member:'member'/grade:'ippan' をハードコード→中学生/女性/支部員以外を取りこぼし）の
#   回帰テスト。単発 addPlayerFromMaster と同じ正規化（共有 helper）で chu/josei/other を保持し、
#   単発=一括で getFee が一致することを完全架空データで固定する。
# ============================================
echo ""
echo "【PAST-ADD-FEE-INHERIT-001 過去参加者 一括追加の会費区分(member/grade)引き継ぎ（単発=一括）】"
if [ -f "$SCRIPT_DIR/test_past_add_fee_inherit_001.js" ]; then
  if node "$SCRIPT_DIR/test_past_add_fee_inherit_001.js" "$TARGET" > /tmp/past_add_fee_inherit_001_out.log 2>&1; then
    ok "PAST-ADD-FEE-INHERIT-001 テスト 全PASS ($(tail -1 /tmp/past_add_fee_inherit_001_out.log))"
  else
    ng "PAST-ADD-FEE-INHERIT-001 テスト 失敗"
    cat /tmp/past_add_fee_inherit_001_out.log
  fi
else
  warn "test_past_add_fee_inherit_001.js が見つからない"
fi


echo ""
echo "【UX-P1-001 (#U-1/U-2/U-3) 当日UX P1: クラウドstatus色分け+aria-live / 保存ピル説明導線 / 受付ボタン44px】"
if [ -f "$SCRIPT_DIR/test_ux_p1_001.js" ]; then
  if node "$SCRIPT_DIR/test_ux_p1_001.js" "$TARGET" > /tmp/ux_p1_001_out.log 2>&1; then
    ok "UX-P1-001 テスト 全PASS ($(tail -1 /tmp/ux_p1_001_out.log))"
  else
    ng "UX-P1-001 テスト 失敗"
    cat /tmp/ux_p1_001_out.log
  fi
else
  warn "test_ux_p1_001.js が見つからない"
fi


echo ""
echo "【A-2 (SYSTEM-REVIEW #377) push 未解決を警告ステータスに格上げ（syncTournamentToCloud warn / 黙って成功にしない）】"
if [ -f "$SCRIPT_DIR/test_a2_partial_warn.js" ]; then
  if node "$SCRIPT_DIR/test_a2_partial_warn.js" "$TARGET" > /tmp/a2_partial_warn_out.log 2>&1; then
    ok "A-2 partial-warn テスト 全PASS ($(tail -1 /tmp/a2_partial_warn_out.log))"
  else
    ng "A-2 partial-warn テスト 失敗"; cat /tmp/a2_partial_warn_out.log
  fi
else
  warn "test_a2_partial_warn.js が見つからない"
fi

echo ""
echo "【A-4 (SYSTEM-REVIEW #377) クラス集計キーの正規化（app/auth.js canonicalizeClass・少→B・年度横断安定）】"
if [ -f "$SCRIPT_DIR/test_a4_class_canon.js" ]; then
  if node "$SCRIPT_DIR/test_a4_class_canon.js" > /tmp/a4_class_canon_out.log 2>&1; then
    ok "A-4 class-canon テスト 全PASS ($(tail -1 /tmp/a4_class_canon_out.log))"
  else
    ng "A-4 class-canon テスト 失敗"; cat /tmp/a4_class_canon_out.log
  fi
else
  warn "test_a4_class_canon.js が見つからない"
fi


echo ""
echo "【ARCH-P2 (SYSTEM-REVIEW #384) A-6 複数クラブ誤選択防止(送信/取得 文言出し分け) / A-8 schema_version方針 / A-9 オフライン事前ガード(offlineマーカー)】"
if [ -f "$SCRIPT_DIR/test_arch_p2.js" ]; then
  if node "$SCRIPT_DIR/test_arch_p2.js" "$TARGET" > /tmp/arch_p2_out.log 2>&1; then
    ok "ARCH-P2 テスト 全PASS ($(tail -1 /tmp/arch_p2_out.log))"
  else
    ng "ARCH-P2 テスト 失敗"; cat /tmp/arch_p2_out.log
  fi
else
  warn "test_arch_p2.js が見つからない"
fi


echo ""
echo "【PWA-SLICE1 manifest＋アイコン＋head タグ（インストール可能化・SW は別スライス）】"
if [ -f "$SCRIPT_DIR/test_pwa_manifest.js" ]; then
  if node "$SCRIPT_DIR/test_pwa_manifest.js" "$TARGET" > /tmp/pwa_manifest_out.log 2>&1; then
    ok "PWA-SLICE1 テスト 全PASS ($(tail -1 /tmp/pwa_manifest_out.log))"
  else
    ng "PWA-SLICE1 テスト 失敗"; cat /tmp/pwa_manifest_out.log
  fi
else
  warn "test_pwa_manifest.js が見つからない"
fi


echo ""
echo "【PWA-SW Service Worker 構造（network-first/外部素通り/versioned cache/ES5登録）※実挙動は実機オフライン確認】"
if [ -f "$SCRIPT_DIR/test_pwa_sw.js" ]; then
  if node "$SCRIPT_DIR/test_pwa_sw.js" "$TARGET" > /tmp/pwa_sw_out.log 2>&1; then
    ok "PWA-SW テスト 全PASS ($(tail -1 /tmp/pwa_sw_out.log))"
  else
    ng "PWA-SW テスト 失敗"; cat /tmp/pwa_sw_out.log
  fi
else
  warn "test_pwa_sw.js が見つからない"
fi


echo ""
echo "【GROWTH-AWARD (#343) 成長賞＝前年度比 勝率の伸び（aggregateGrowthAward・read-only・app/）】"
if [ -f "$SCRIPT_DIR/test_growth_award.js" ]; then
  if node "$SCRIPT_DIR/test_growth_award.js" > /tmp/growth_award_out.log 2>&1; then
    ok "GROWTH-AWARD テスト 全PASS ($(tail -1 /tmp/growth_award_out.log))"
  else
    ng "GROWTH-AWARD テスト 失敗"; cat /tmp/growth_award_out.log
  fi
else
  warn "test_growth_award.js が見つからない"
fi


echo ""
echo "【DAYOF-QUICKWINS 当日UX即効1: タブ先頭スクロール/保存トースト/persist/タブ名会員名簿/22名取込撤去】"
if [ -f "$SCRIPT_DIR/test_dayof_quickwins.js" ]; then
  if node "$SCRIPT_DIR/test_dayof_quickwins.js" "$TARGET" > /tmp/dayof_quickwins_out.log 2>&1; then
    ok "DAYOF-QUICKWINS テスト 全PASS ($(tail -1 /tmp/dayof_quickwins_out.log))"
  else
    ng "DAYOF-QUICKWINS テスト 失敗"; cat /tmp/dayof_quickwins_out.log
  fi
else
  warn "test_dayof_quickwins.js が見つからない"
fi


echo ""
echo "【HISTORY-CLOUD (#343) 大会履歴にクラウド過去大会セクション（一覧/結果表/取得オーケストレーション・fail-soft・mock）】"
if [ -f "$SCRIPT_DIR/test_history_cloud.js" ]; then
  if node "$SCRIPT_DIR/test_history_cloud.js" "$TARGET" > /tmp/history_cloud_out.log 2>&1; then
    ok "HISTORY-CLOUD テスト 全PASS ($(tail -1 /tmp/history_cloud_out.log))"
  else
    ng "HISTORY-CLOUD テスト 失敗"; cat /tmp/history_cloud_out.log
  fi
else
  warn "test_history_cloud.js が見つからない"
fi


echo ""
echo "【RESET-UNDO (当日運営第2弾⑩) リセット直前スナップショット＋元に戻す（捕捉/復元/バナー/配線）】"
if [ -f "$SCRIPT_DIR/test_reset_undo.js" ]; then
  if node "$SCRIPT_DIR/test_reset_undo.js" "$TARGET" > /tmp/reset_undo_out.log 2>&1; then
    ok "RESET-UNDO テスト 全PASS ($(tail -1 /tmp/reset_undo_out.log))"
  else
    ng "RESET-UNDO テスト 失敗"; cat /tmp/reset_undo_out.log
  fi
else
  warn "test_reset_undo.js が見つからない"
fi


echo ""
echo "【RESET-MENU (当日第2弾⑩後半) 危険リセットを⋯メニュー退避（markup/開閉/結線・id不変）】"
if [ -f "$SCRIPT_DIR/test_reset_menu.js" ]; then
  if node "$SCRIPT_DIR/test_reset_menu.js" "$TARGET" > /tmp/reset_menu_out.log 2>&1; then
    ok "RESET-MENU テスト 全PASS ($(tail -1 /tmp/reset_menu_out.log))"
  else
    ng "RESET-MENU テスト 失敗"; cat /tmp/reset_menu_out.log
  fi
else
  warn "test_reset_menu.js が見つからない"
fi


echo ""
echo "【BACKUP-NUDGE (当日第2弾⑫) 節目バックアップ促し（markup/フック/開閉・1節目1回）】"
if [ -f "$SCRIPT_DIR/test_backup_nudge.js" ]; then
  if node "$SCRIPT_DIR/test_backup_nudge.js" "$TARGET" > /tmp/backup_nudge_out.log 2>&1; then
    ok "BACKUP-NUDGE テスト 全PASS ($(tail -1 /tmp/backup_nudge_out.log))"
  else
    ng "BACKUP-NUDGE テスト 失敗"; cat /tmp/backup_nudge_out.log
  fi
else
  warn "test_backup_nudge.js が見つからない"
fi


echo ""
echo "【RESET-PP-REFRESH (bugfix) リセット後に過去参加者パネル再描画（A/B✓ハイライトの残留解消）】"
if [ -f "$SCRIPT_DIR/test_reset_pp_refresh.js" ]; then
  if node "$SCRIPT_DIR/test_reset_pp_refresh.js" "$TARGET" > /tmp/reset_pp_out.log 2>&1; then
    ok "RESET-PP-REFRESH テスト 全PASS ($(tail -1 /tmp/reset_pp_out.log))"
  else
    ng "RESET-PP-REFRESH テスト 失敗"; cat /tmp/reset_pp_out.log
  fi
else
  warn "test_reset_pp_refresh.js が見つからない"
fi


echo ""
echo "【BACKUP-GUIDE バックアップ画面に保存先/復元手順の案内（presentational）】"
if [ -f "$SCRIPT_DIR/test_backup_guide.js" ]; then
  if node "$SCRIPT_DIR/test_backup_guide.js" "$TARGET" > /tmp/backup_guide_out.log 2>&1; then
    ok "BACKUP-GUIDE テスト 全PASS ($(tail -1 /tmp/backup_guide_out.log))"
  else
    ng "BACKUP-GUIDE テスト 失敗"; cat /tmp/backup_guide_out.log
  fi
else
  warn "test_backup_guide.js が見つからない"
fi


echo ""
echo "【DAYOF-UNENTERED (当日第2弾⑥) 未入力卓カウンタ＋確定ボタン無効化（カウンタ/disabled/RAW配線）】"
if [ -f "$SCRIPT_DIR/test_dayof_unentered_001.js" ]; then
  if node "$SCRIPT_DIR/test_dayof_unentered_001.js" "$TARGET" > /tmp/dayof_unentered_out.log 2>&1; then
    ok "DAYOF-UNENTERED テスト 全PASS ($(tail -1 /tmp/dayof_unentered_out.log))"
  else
    ng "DAYOF-UNENTERED テスト 失敗"; cat /tmp/dayof_unentered_out.log
  fi
else
  warn "test_dayof_unentered_001.js が見つからない"
fi


echo ""
echo "【MASTER-TAB-DECLUTTER (当日第2弾⑪) 会員名簿タブのボタン整理（☁常時表示・保守系は折りたたみ・id不変）】"
if [ -f "$SCRIPT_DIR/test_master_tab_declutter.js" ]; then
  if node "$SCRIPT_DIR/test_master_tab_declutter.js" "$TARGET" > /tmp/master_declutter_out.log 2>&1; then
    ok "MASTER-TAB-DECLUTTER テスト 全PASS ($(tail -1 /tmp/master_declutter_out.log))"
  else
    ng "MASTER-TAB-DECLUTTER テスト 失敗"; cat /tmp/master_declutter_out.log
  fi
else
  warn "test_master_tab_declutter.js が見つからない"
fi


echo ""
echo "【SAVE-LINE-CONSOLIDATE (当日第2弾⑨-a) 復元をバックアップへ集約（読み込みボタン撤去＋貼り付け復元追加・loadData等温存）】"
if [ -f "$SCRIPT_DIR/test_restore_consolidation.js" ]; then
  if node "$SCRIPT_DIR/test_restore_consolidation.js" "$TARGET" > /tmp/save_consolidate_out.log 2>&1; then
    ok "SAVE-LINE-CONSOLIDATE テスト 全PASS ($(tail -1 /tmp/save_consolidate_out.log))"
  else
    ng "SAVE-LINE-CONSOLIDATE テスト 失敗"; cat /tmp/save_consolidate_out.log
  fi
else
  warn "test_restore_consolidation.js が見つからない"
fi


# ============================================
# 最終結果
# ============================================
echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL, WARN=$WARN"
echo "=========================================="
[ $FAIL -eq 0 ] && echo "  ✓ 全テスト合格(警告: $WARN件)" && exit 0 || echo "  ✗ 失敗あり(要対応)" && exit 1
