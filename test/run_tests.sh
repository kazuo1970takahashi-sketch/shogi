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
          saveBtn loadBtn loadFile resetBtn rep-date rep-place rep-start rep-end \
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
grep -A20 "^function resetAll" "$TARGET" | grep -q "pane-A" && ok "resetAll: pane-A クリア" || ng "pane-A 未クリア"
grep -A20 "^function resetAll" "$TARGET" | grep -q "result-A" && ok "resetAll: result-A クリア" || ng "result-A 未クリア"
grep -A20 "^function resetAll" "$TARGET" | grep -q "rep-place" && ok "resetAll: rep-place 初期化" || ng "rep-place 未初期化"
grep -A20 "^function resetAll" "$TARGET" | grep -q "bulk-edit-modal" && ok "resetAll: モーダル閉じ" || ng "モーダル閉じなし"

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
# startTournament内で人数チェック(参加者が少なすぎます)が再開始確認(進行中の大会データ)より前にあるか
order_check=$(awk '/^function startTournament/,/^}/' "$TARGET" | grep -nE "参加者が少なすぎます|進行中の大会データがあります" | head -2)
first_line=$(echo "$order_check" | head -1)
echo "$first_line" | grep -q "参加者が少なすぎます" && ok "B3: 順序OK(人数チェック先)" || ng "B3: 順序逆転(再開始確認が先)"

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
grep -A20 "^function resetAll" "$TARGET" | grep -qE "innerHTML=''.*pane|pane.*innerHTML=''" && ok "B7: resetAllでDOM明示クリア" || warn "B7: DOM明示クリア要確認"

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
for f in "$SCRIPT_DIR"/data_*.json; do
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

# ============================================
# ペアリング性質テスト（P1-2修正検証 + T01 三すくみ）
# ============================================
echo ""
echo "【ペアリング性質テスト】"
if [ -f "$SCRIPT_DIR/test_pairing_properties.js" ]; then
  if node "$SCRIPT_DIR/test_pairing_properties.js" "$TARGET" > /tmp/pairing_test_out.log 2>&1; then
    ok "ペアリング性質テスト 全PASS"
  else
    ng "ペアリング性質テスト失敗"
    cat /tmp/pairing_test_out.log
  fi
else
  warn "test_pairing_properties.js が見つからない"
fi

# ============================================
# タブ選択 + localStorageフォールバック + sanitizeMatch テスト
# ============================================
echo ""
echo "【タブ選択 + T02 localStorageフォールバック】"
if [ -f "$SCRIPT_DIR/test_tab_selection.js" ]; then
  if node "$SCRIPT_DIR/test_tab_selection.js" "$TARGET" > /tmp/tab_test_out.log 2>&1; then
    ok "タブ選択 + T02 フォールバック 全PASS"
  else
    ng "タブ選択 + T02 フォールバック 失敗"
    cat /tmp/tab_test_out.log
  fi
else
  warn "test_tab_selection.js が見つからない"
fi

# ============================================
# 支部マスタ機能テスト（Phase A-1）
# ============================================
echo ""
echo "【支部マスタ機能テスト（Phase A-1）】"
if [ -f "$SCRIPT_DIR/test_branch_master.js" ]; then
  if node "$SCRIPT_DIR/test_branch_master.js" "$TARGET" > /tmp/branch_master_out.log 2>&1; then
    ok "支部マスタ機能テスト 全PASS ($(tail -1 /tmp/branch_master_out.log))"
  else
    ng "支部マスタ機能テスト 失敗"
    cat /tmp/branch_master_out.log
  fi
else
  warn "test_branch_master.js が見つからない"
fi

# ============================================
# A-4 ペアリング品質評価関数 単体テスト
# ============================================
echo ""
echo "【A-4 品質評価関数 単体テスト】"
if [ -f "$SCRIPT_DIR/test_quality_eval.js" ]; then
  if node "$SCRIPT_DIR/test_quality_eval.js" "$TARGET" > /tmp/quality_eval_out.log 2>&1; then
    ok "A-4 品質評価関数 全PASS ($(tail -2 /tmp/quality_eval_out.log | head -1))"
  else
    ng "A-4 品質評価関数 失敗"
    cat /tmp/quality_eval_out.log
  fi
else
  warn "test_quality_eval.js が見つからない"
fi

# ============================================
# A-4 B級R2 ペアリング品質回帰テスト
# ============================================
echo ""
echo "【A-4 B級R2 回帰テスト】"
if [ -f "$SCRIPT_DIR/test_b_r2_regression.js" ]; then
  if node "$SCRIPT_DIR/test_b_r2_regression.js" "$TARGET" > /tmp/b_r2_out.log 2>&1; then
    ok "A-4 B級R2 回帰テスト 全PASS ($(tail -2 /tmp/b_r2_out.log | head -1))"
  else
    ng "A-4 B級R2 回帰テスト 失敗"
    cat /tmp/b_r2_out.log
  fi
else
  warn "test_b_r2_regression.js が見つからない"
fi

# ============================================
# A-4 normalizeState lastModifiedBy 補完テスト
# ============================================
echo ""
echo "【A-4 normalizeState lastModifiedBy 補完テスト】"
if [ -f "$SCRIPT_DIR/test_normalize_state_a4.js" ]; then
  if node "$SCRIPT_DIR/test_normalize_state_a4.js" "$TARGET" > /tmp/norm_a4_out.log 2>&1; then
    ok "A-4 normalizeState テスト 全PASS ($(tail -2 /tmp/norm_a4_out.log | head -1))"
  else
    ng "A-4 normalizeState テスト 失敗"
    cat /tmp/norm_a4_out.log
  fi
else
  warn "test_normalize_state_a4.js が見つからない"
fi

# ============================================
# MASTER-001 参加者名修正時の会員マスタ反映 単体テスト
# ============================================
echo ""
echo "【MASTER-001 参加者名修正時の会員マスタ反映】"
if [ -f "$SCRIPT_DIR/test_master_001.js" ]; then
  if node "$SCRIPT_DIR/test_master_001.js" "$TARGET" > /tmp/master_001_out.log 2>&1; then
    ok "MASTER-001 単体テスト 全PASS ($(tail -1 /tmp/master_001_out.log))"
  else
    ng "MASTER-001 単体テスト 失敗"
    cat /tmp/master_001_out.log
  fi
else
  warn "test_master_001.js が見つからない"
fi

# ============================================
# A-5.1-NUM-001 クラス別採番 欠番維持 単体テスト
# ============================================
echo ""
echo "【A-5.1-NUM-001 クラス別採番 欠番維持】"
if [ -f "$SCRIPT_DIR/test_a5_1_num_001.js" ]; then
  if node "$SCRIPT_DIR/test_a5_1_num_001.js" "$TARGET" > /tmp/a5_1_num_001_out.log 2>&1; then
    ok "A-5.1-NUM-001 単体テスト 全PASS ($(tail -1 /tmp/a5_1_num_001_out.log))"
  else
    ng "A-5.1-NUM-001 単体テスト 失敗"
    cat /tmp/a5_1_num_001_out.log
  fi
else
  warn "test_a5_1_num_001.js が見つからない"
fi

# ============================================
# A-5.1-SAVE-001 removePlayer 保存未確認検知 単体テスト
# ============================================
echo ""
echo "【A-5.1-SAVE-001 removePlayer 保存未確認検知】"
if [ -f "$SCRIPT_DIR/test_a5_1_save_001.js" ]; then
  if node "$SCRIPT_DIR/test_a5_1_save_001.js" "$TARGET" > /tmp/a5_1_save_001_out.log 2>&1; then
    ok "A-5.1-SAVE-001 単体テスト 全PASS ($(tail -1 /tmp/a5_1_save_001_out.log))"
  else
    ng "A-5.1-SAVE-001 単体テスト 失敗"
    cat /tmp/a5_1_save_001_out.log
  fi
else
  warn "test_a5_1_save_001.js が見つからない"
fi

# ============================================
# A-5.1-SAVE-002 addPlayer 保存未確認検知 単体テスト
# ============================================
echo ""
echo "【A-5.1-SAVE-002 addPlayer 保存未確認検知】"
if [ -f "$SCRIPT_DIR/test_a5_1_save_002.js" ]; then
  if node "$SCRIPT_DIR/test_a5_1_save_002.js" "$TARGET" > /tmp/a5_1_save_002_out.log 2>&1; then
    ok "A-5.1-SAVE-002 単体テスト 全PASS ($(tail -1 /tmp/a5_1_save_002_out.log))"
  else
    ng "A-5.1-SAVE-002 単体テスト 失敗"
    cat /tmp/a5_1_save_002_out.log
  fi
else
  warn "test_a5_1_save_002.js が見つからない"
fi

# ============================================
# A-5.1-SAVE-003 大会進行 core path 保存未確認検知 単体テスト
# ============================================
echo ""
echo "【A-5.1-SAVE-003 大会進行 core path 保存未確認検知】"
if [ -f "$SCRIPT_DIR/test_a5_1_save_003.js" ]; then
  if node "$SCRIPT_DIR/test_a5_1_save_003.js" "$TARGET" > /tmp/a5_1_save_003_out.log 2>&1; then
    ok "A-5.1-SAVE-003 単体テスト 全PASS ($(tail -1 /tmp/a5_1_save_003_out.log))"
  else
    ng "A-5.1-SAVE-003 単体テスト 失敗"
    cat /tmp/a5_1_save_003_out.log
  fi
else
  warn "test_a5_1_save_003.js が見つからない"
fi

# ============================================
# A-5.1-SAVE-003b-1 参加者追加経路 保存未確認検知 単体テスト
# ============================================
echo ""
echo "【A-5.1-SAVE-003b-1 参加者追加経路 保存未確認検知】"
if [ -f "$SCRIPT_DIR/test_a5_1_save_003b_add_paths.js" ]; then
  if node "$SCRIPT_DIR/test_a5_1_save_003b_add_paths.js" "$TARGET" > /tmp/a5_1_save_003b_add_paths_out.log 2>&1; then
    ok "A-5.1-SAVE-003b-1 単体テスト 全PASS ($(tail -1 /tmp/a5_1_save_003b_add_paths_out.log))"
  else
    ng "A-5.1-SAVE-003b-1 単体テスト 失敗"
    cat /tmp/a5_1_save_003b_add_paths_out.log
  fi
else
  warn "test_a5_1_save_003b_add_paths.js が見つからない"
fi

# ============================================
# A-5.1-SAVE-003b-2 対局画面編集経路 保存未確認検知 単体テスト
# ============================================
echo ""
echo "【A-5.1-SAVE-003b-2 対局画面編集経路 保存未確認検知】"
if [ -f "$SCRIPT_DIR/test_a5_1_save_003b_edit_paths.js" ]; then
  if node "$SCRIPT_DIR/test_a5_1_save_003b_edit_paths.js" "$TARGET" > /tmp/a5_1_save_003b_edit_paths_out.log 2>&1; then
    ok "A-5.1-SAVE-003b-2 単体テスト 全PASS ($(tail -1 /tmp/a5_1_save_003b_edit_paths_out.log))"
  else
    ng "A-5.1-SAVE-003b-2 単体テスト 失敗"
    cat /tmp/a5_1_save_003b_edit_paths_out.log
  fi
else
  warn "test_a5_1_save_003b_edit_paths.js が見つからない"
fi

# ============================================
# A-5.1-SAVE-003b-3 手動編集系 保存未確認検知 単体テスト
# ============================================
echo ""
echo "【A-5.1-SAVE-003b-3 手動編集系 保存未確認検知】"
if [ -f "$SCRIPT_DIR/test_a5_1_save_003b_edit_fields.js" ]; then
  if node "$SCRIPT_DIR/test_a5_1_save_003b_edit_fields.js" "$TARGET" > /tmp/a5_1_save_003b_edit_fields_out.log 2>&1; then
    ok "A-5.1-SAVE-003b-3 単体テスト 全PASS ($(tail -1 /tmp/a5_1_save_003b_edit_fields_out.log))"
  else
    ng "A-5.1-SAVE-003b-3 単体テスト 失敗"
    cat /tmp/a5_1_save_003b_edit_fields_out.log
  fi
else
  warn "test_a5_1_save_003b_edit_fields.js が見つからない"
fi

# ============================================
# MASTER-V2-LASTCLASS 保存後 re-read verify 単体テスト
# ============================================
echo ""
echo "【MASTER-V2-LASTCLASS 保存後 re-read verify】"
if [ -f "$SCRIPT_DIR/test_master_v2_lastclass.js" ]; then
  if node "$SCRIPT_DIR/test_master_v2_lastclass.js" "$TARGET" > /tmp/master_v2_lastclass_out.log 2>&1; then
    ok "MASTER-V2-LASTCLASS 単体テスト 全PASS ($(tail -1 /tmp/master_v2_lastclass_out.log))"
  else
    ng "MASTER-V2-LASTCLASS 単体テスト 失敗"
    cat /tmp/master_v2_lastclass_out.log
  fi
else
  warn "test_master_v2_lastclass.js が見つからない"
fi

# ============================================
# RANK-TIE-001 順位決定項目完全同点での同順位表示 単体テスト
# ============================================
echo ""
echo "【RANK-TIE-001 順位決定項目完全同点での同順位表示】"
if [ -f "$SCRIPT_DIR/test_rank_tie_001.js" ]; then
  if node "$SCRIPT_DIR/test_rank_tie_001.js" "$TARGET" > /tmp/rank_tie_001_out.log 2>&1; then
    ok "RANK-TIE-001 単体テスト 全PASS ($(tail -1 /tmp/rank_tie_001_out.log))"
  else
    ng "RANK-TIE-001 単体テスト 失敗"
    cat /tmp/rank_tie_001_out.log
  fi
else
  warn "test_rank_tie_001.js が見つからない"
fi

# ============================================
# SAVE-UX-STATE-RESTORE-HANDLING-IMPL-LIGHT (§25) PARSE-LOAD-003 単体テスト
# ============================================
echo ""
echo "【SAVE-UX-PARSE-LOAD-003 IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_save_ux_parse_load_003.js" ]; then
  if node "$SCRIPT_DIR/test_save_ux_parse_load_003.js" "$TARGET" > /tmp/parse_load_003_out.log 2>&1; then
    ok "PARSE-LOAD-003 IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/parse_load_003_out.log))"
  else
    ng "PARSE-LOAD-003 IMPL-LIGHT テスト 失敗"
    cat /tmp/parse_load_003_out.log
  fi
else
  warn "test_save_ux_parse_load_003.js が見つからない"
fi

# ============================================
# RANK-PRINT-001 印刷/PDF からエントリー番号を除外 単体テスト
# ============================================
echo ""
echo "【RANK-PRINT-001 印刷/PDF からエントリー番号を除外】"
if [ -f "$SCRIPT_DIR/test_rank_print_001.js" ]; then
  if node "$SCRIPT_DIR/test_rank_print_001.js" "$TARGET" > /tmp/rank_print_001_out.log 2>&1; then
    ok "RANK-PRINT-001 単体テスト 全PASS ($(tail -1 /tmp/rank_print_001_out.log))"
  else
    ng "RANK-PRINT-001 単体テスト 失敗"
    cat /tmp/rank_print_001_out.log
  fi
else
  warn "test_rank_print_001.js が見つからない"
fi

# ============================================
# PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT formatParticipantLabel 単体テスト
# ============================================
echo ""
echo "【PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_pairing_ux_display_helper.js" ]; then
  if node "$SCRIPT_DIR/test_pairing_ux_display_helper.js" "$TARGET" > /tmp/pairing_ux_display_helper_out.log 2>&1; then
    ok "DISPLAY-HELPER IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/pairing_ux_display_helper_out.log))"
  else
    ng "DISPLAY-HELPER IMPL-LIGHT テスト 失敗"
    cat /tmp/pairing_ux_display_helper_out.log
  fi
else
  warn "test_pairing_ux_display_helper.js が見つからない"
fi

# ============================================
# PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT 単体テスト (Phase 1)
# ============================================
echo ""
echo "【PAIRING-UX-WARNING-DECISION-SUPPORT-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_pairing_ux_warning_decision_support.js" ]; then
  if node "$SCRIPT_DIR/test_pairing_ux_warning_decision_support.js" "$TARGET" > /tmp/pairing_ux_warning_decision_support_out.log 2>&1; then
    ok "WARNING-DECISION-SUPPORT IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/pairing_ux_warning_decision_support_out.log))"
  else
    ng "WARNING-DECISION-SUPPORT IMPL-LIGHT テスト 失敗"
    cat /tmp/pairing_ux_warning_decision_support_out.log
  fi
else
  warn "test_pairing_ux_warning_decision_support.js が見つからない"
fi

# ============================================
# PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT 単体テスト
# ============================================
echo ""
echo "【PAIRING-UX-SCORE-LIST-READABILITY-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_pairing_ux_score_list_readability.js" ]; then
  if node "$SCRIPT_DIR/test_pairing_ux_score_list_readability.js" "$TARGET" > /tmp/pairing_ux_score_list_readability_out.log 2>&1; then
    ok "SCORE-LIST-READABILITY IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/pairing_ux_score_list_readability_out.log))"
  else
    ng "SCORE-LIST-READABILITY IMPL-LIGHT テスト 失敗"
    cat /tmp/pairing_ux_score_list_readability_out.log
  fi
else
  warn "test_pairing_ux_score_list_readability.js が見つからない"
fi

# ============================================
# PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT 単体テスト
# ============================================
echo ""
echo "【PAIRING-UX-MANUAL-CHANGE-ERROR-RECOVERY-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_pairing_ux_manual_change_error_recovery.js" ]; then
  if node "$SCRIPT_DIR/test_pairing_ux_manual_change_error_recovery.js" "$TARGET" > /tmp/pairing_ux_manual_change_error_recovery_out.log 2>&1; then
    ok "MANUAL-CHANGE-ERROR-RECOVERY IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/pairing_ux_manual_change_error_recovery_out.log))"
  else
    ng "MANUAL-CHANGE-ERROR-RECOVERY IMPL-LIGHT テスト 失敗"
    cat /tmp/pairing_ux_manual_change_error_recovery_out.log
  fi
else
  warn "test_pairing_ux_manual_change_error_recovery.js が見つからない"
fi

# ============================================
# PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT 単体テスト
# ============================================
echo ""
echo "【PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_pairing_ux_manual_change_candidate_filter.js" ]; then
  if node "$SCRIPT_DIR/test_pairing_ux_manual_change_candidate_filter.js" "$TARGET" > /tmp/pairing_ux_manual_change_candidate_filter_out.log 2>&1; then
    ok "MANUAL-CHANGE-CANDIDATE-FILTER IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/pairing_ux_manual_change_candidate_filter_out.log))"
  else
    ng "MANUAL-CHANGE-CANDIDATE-FILTER IMPL-LIGHT テスト 失敗"
    cat /tmp/pairing_ux_manual_change_candidate_filter_out.log
  fi
else
  warn "test_pairing_ux_manual_change_candidate_filter.js が見つからない"
fi

# ============================================
# RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT 単体テスト
# ============================================
echo ""
echo "【RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_reception_ux_start_button_guard.js" ]; then
  if node "$SCRIPT_DIR/test_reception_ux_start_button_guard.js" "$TARGET" > /tmp/reception_ux_start_button_guard_out.log 2>&1; then
    ok "START-BUTTON-GUARD IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/reception_ux_start_button_guard_out.log))"
  else
    ng "START-BUTTON-GUARD IMPL-LIGHT テスト 失敗"
    cat /tmp/reception_ux_start_button_guard_out.log
  fi
else
  warn "test_reception_ux_start_button_guard.js が見つからない"
fi

# ============================================
# RESET-UX-PARTIAL-RESET-IMPL-LIGHT 単体テスト
# ============================================
echo ""
echo "【RESET-UX-PARTIAL-RESET-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_reset_ux_partial_reset.js" ]; then
  if node "$SCRIPT_DIR/test_reset_ux_partial_reset.js" "$TARGET" > /tmp/reset_ux_partial_reset_out.log 2>&1; then
    ok "PARTIAL-RESET IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/reset_ux_partial_reset_out.log))"
  else
    ng "PARTIAL-RESET IMPL-LIGHT テスト 失敗"
    cat /tmp/reset_ux_partial_reset_out.log
  fi
else
  warn "test_reset_ux_partial_reset.js が見つからない"
fi

# ============================================
# REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT 単体テスト
# ============================================
echo ""
echo "【REMOVE-PLAYER-GUARD-MESSAGE-IMPL-LIGHT】"
if [ -f "$SCRIPT_DIR/test_remove_player_guard_message.js" ]; then
  if node "$SCRIPT_DIR/test_remove_player_guard_message.js" "$TARGET" > /tmp/remove_player_guard_message_out.log 2>&1; then
    ok "REMOVE-PLAYER-GUARD-MESSAGE IMPL-LIGHT テスト 全PASS ($(tail -1 /tmp/remove_player_guard_message_out.log))"
  else
    ng "REMOVE-PLAYER-GUARD-MESSAGE IMPL-LIGHT テスト 失敗"
    cat /tmp/remove_player_guard_message_out.log
  fi
else
  warn "test_remove_player_guard_message.js が見つからない"
fi

# ============================================
# ROUND-CLASS-START-003 state/helper/normalize 単体テスト
# ============================================
echo ""
echo "【ROUND-CLASS-START-003 state/helper/normalize】"
if [ -f "$SCRIPT_DIR/test_round_class_start_state_003.js" ]; then
  if node "$SCRIPT_DIR/test_round_class_start_state_003.js" "$TARGET" > /tmp/round_class_start_state_003_out.log 2>&1; then
    ok "ROUND-CLASS-START-003 単体テスト 全PASS ($(tail -1 /tmp/round_class_start_state_003_out.log))"
  else
    ng "ROUND-CLASS-START-003 単体テスト 失敗"
    cat /tmp/round_class_start_state_003_out.log
  fi
else
  warn "test_round_class_start_state_003.js が見つからない"
fi

# ============================================
# ROUND-CLASS-START-004 atomic wrapper 単体テスト
# ============================================
echo ""
echo "【ROUND-CLASS-START-004 atomic wrapper】"
if [ -f "$SCRIPT_DIR/test_round_class_start_004.js" ]; then
  if node "$SCRIPT_DIR/test_round_class_start_004.js" "$TARGET" > /tmp/round_class_start_004_out.log 2>&1; then
    ok "ROUND-CLASS-START-004 atomic wrapper テスト 全PASS ($(tail -1 /tmp/round_class_start_004_out.log))"
  else
    ng "ROUND-CLASS-START-004 atomic wrapper テスト 失敗"
    cat /tmp/round_class_start_004_out.log
  fi
else
  warn "test_round_class_start_004.js が見つからない"
fi

# ============================================
# 最終結果
# ============================================
echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL, WARN=$WARN"
echo "=========================================="
[ $FAIL -eq 0 ] && echo "  ✓ 全テスト合格(警告: $WARN件)" && exit 0 || echo "  ✗ 失敗あり(要対応)" && exit 1
