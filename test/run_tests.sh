#!/usr/bin/env bash
# リファクタリング3層テスト
# 使い方: bash test/run_tests.sh <対象html> [比較元html(オプション)]
# 例: bash test/run_tests.sh shogi_v4.html archive/shogi_stage1_before.html

# set -e は使わない(grep が空ヒットで非ゼロを返すため、各テストで判定する)

# ★ cloud/CI の POSIX locale では Ruby 等が US-ASCII 扱いになり偽 FAIL する（2026-08-16 実測:
#   test_supabase_keepalive_workflow.sh が「invalid multibyte char」で赤）。UTF-8 でない時だけ
#   上書きする（作者機 macOS の UTF-8 環境には触らない）。
case "$(locale charmap 2>/dev/null)" in
  UTF-8) : ;;
  *) export LC_ALL=C.UTF-8 LANG=C.UTF-8 ;;
esac
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
          inp-rounds saveBtn loadFile resetBtn rep-date rep-place rep-start rep-end \
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
#   除外: escapeHtml 適用済／native alert()・confirm()（textContent 相当のプレーン表示）／
#         アプリ内モーダル appConfirm()・appAlert()・appPrompt()（showAppModal が msg.textContent で描画＝innerHTML 非流入で安全・native confirm/alert と同クラス。IN-APP-MODAL-001 #606）／
#         showBulkEditError()（.bulk-err-body へ textContent で描画＝innerHTML 非流入。BULK-EDIT-INLINE-ERROR-001 #887）。
#   ★ この除外は「安全だと主張する」だけでは足りない。裏づけは test_bulk_inline_error_pins_887.sh の Q4
#     ＝ showBulkEditError/clearBulkEditError の中に innerHTML/outerHTML/insertAdjacentHTML が1つも無いこと、
#        かつ .bulk-err-head / .bulk-err-body のどちらにも innerHTML 系を使わないこと。Q4 が赤なら除外の前提が崩れている。
#   ★ 除外は**行単位**なので、showBulkEditError( と別の innerHTML 流入を同じ行に書かないこと。
#   除外に dupMsgs.push( を追加（BULK-EDIT-ALL-ERRORS-001 #889）。全件報告にしたことで、氏名を含む
#   文面の**組み立て**が showBulkEditError( の行から離れ、この行単位の除外では見えなくなった。
#   ★ 裏づけ（「安全だと主張するだけ」にしない）: test_bulk_all_errors_pins_889.sh の P8
#     ＝ 保存ハンドラのスコープ内に innerHTML/outerHTML/insertAdjacentHTML が1つも無く、
#        組み立てた文面の**唯一の行き先が showBulkEditError()** であること。P8 が赤なら除外の前提が崩れている。
unescaped=$(grep -nE "'\+name\+|'\+newName\+|'\+p\.name\+|'\+players\[.*\]\.name\+|'\+getName\(.*\)\+|'\+candidates\[.*\]\.name\+|'\+n1\+|'\+n2\+|'\+date\+|'\+place\+|'\+start\+|'\+end\+|'\+sei\+|'\+fuku\+|'\+note\+|'\+oppName\+|'\+pn1\+|'\+pn2\+|'\+pw\+|'\+text\+" "$TARGET" | grep -v "escapeHtml" | grep -v "alert(" | grep -v "confirm(" | grep -v "appConfirm(" | grep -v "appAlert(" | grep -v "appPrompt(" | grep -v "showBulkEditError(" | grep -v "dupMsgs.push(" | wc -l)
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
# FIRSTROUND-ODD-001: 旧「未割当拒否」(1回戦の全員割当必須)は廃止。#272 の Codex P1 で
#   意図的にロックされたが、同じ Codex が 2026-08-09 に「1回戦だけ別の状態機械は誤り」と
#   再評価したため解除。代わりに (a) 旧アラートの再導入が無いこと (b) 空回戦ガードが
#   1回戦にも効く統一形で在ることを pin する。
grep -q "全試合の結果を入力してください" "$TARGET" && ok "submitRound: 未入力拒否" || ng "未入力拒否なし"
grep -q "登録されていない選手が含まれています" "$TARGET" && ok "submitRound: 存在しない選手拒否" || ng "存在しない選手拒否なし"
grep -q "が複数の対局に登録されています" "$TARGET" && ok "submitRound: 重複拒否" || ng "重複拒否なし"
grep -q "この回戦の組み合わせがありません" "$TARGET" && ok "submitRound: 空回戦拒否（1回戦にも統一適用）" || ng "空回戦拒否なし"
if grep -q "次の参加者が対局に登録されていません" "$TARGET"; then ng "旧・1回戦未割当拒否が再導入されている（FIRSTROUND-ODD-001 違反）"; else ok "submitRound: 1回戦の全員割当必須は廃止済み"; fi

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
grep -A90 "^function resetAll" "$TARGET" | grep -q "rep-place" && ok "resetAll: rep-place 初期化" || ng "rep-place 未初期化"
grep -A50 "^function resetAll" "$TARGET" | grep -q "bulk-edit-modal" && ok "resetAll: モーダル閉じ" || ng "モーダル閉じなし"

# 2-13. loadData の再選択対応
grep -A12 "現在のデータを上書きして読み込みますか" "$TARGET" | grep -q "e.target.value=''" && ok "loadData: キャンセル時の再選択対応（appConfirm＋末尾クリーンアップ）" || ng "再選択対応なし"

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
# [PIPELINE-V2-PROPAGATE-001 / #264] 外部 .js テストの登録整理（WARN ノイズ解消・経緯）
#   この orphan clean base に存在しない feature 系統由来の外部 .js テスト 35 本への
#   `if [ -f ... ] ... else warn "...見つからない"` 参照を登録解除した。これらはこのベースに
#   無く実行されず、常時 WARN=35 のノイズ源となって「本物の劣化」を埋もれさせていた。
#   baseline は WARN=0 を正とする。
#
# [STAGE0-CONFLICT-FREE-001] 外部テストの登録を「末尾追記」から「自動発見」へ
#   スライスごとに実行行をここへ手で追記する方式をやめ、test/ を glob + sort で走査して
#   自動実行する方式にした。共有の追記点が消えるので、並行する複数スライスが
#   run_tests.sh で衝突しなくなる（SPLIT-FEASIBILITY-001 §5: 実測した並行衝突 18 件のうち
#   12 件が、この追記点と docs/CHANGELOG.md の冒頭追記だけに起因していた）。
#
#   **テストを増やすときは test/ にファイルを置くだけでよい。run_tests.sh に diff は出ない。**
#
#   発見規則（実行順は LC_ALL=C の sort 順＝決定的）:
#     - node: test/test_*.js                    … 引数は "$TARGET"（NO_TARGET_TESTS を除く）
#     - bash: test/test_*.sh / test/*_pgtest.sh … 引数なし
#     （run_tests.sh 自身はどちらのパターンにも一致しない）
#   見出しと成功文言はテストファイル自身の先頭コメントから採る＝説明の置き場所も
#   ファイル側に閉じるので、ここに新しい追記点を作らない。明示的に指定したい場合は
#   テストファイルへ `// @suite: 説明`（.sh は `# @suite: 説明`）を 1 行書く。
# ----------------------------------------------------------------------------

# 自動発見から除外するファイル（撤去済みスタブ等）。カンマ区切り。
#   test_start_003.js: SHOGI-TOUR-START-003 は START-UX-CONSOLIDATE-001 で撤去済み。本体は
#     「撤去済みを示す最小スタブ」で、従来から run_tests.sh へ未登録＝スイート非実行だった
#     （ファイル自身のヘッダにも「登録解除済み」と明記されている）。新仕様の担保は
#     test_start_ux_consolidate_001.js。自動発見でも従来どおり実行しない。
RETIRED_TESTS='test_start_003.js'

# "$TARGET" を渡さないテスト（従来の呼び出しを原文どおり維持する）。カンマ区切り。
#   この 2 本は従来から引数なしで呼ばれてきた（テスト側の既定対象を使う）。
NO_TARGET_TESTS='test_a4_class_canon.js,test_growth_award.js'

# suite_title <file> — テストファイル先頭コメントから 1 行見出しを取り出す。
#   優先順: `@suite:` の明示 → 先頭 6 行の実質的なコメント行 → ファイル名。
suite_title() {
  _stf="$1"
  _stt=$(awk '/@suite:/ { sub(/^.*@suite:[ \t]*/, ""); print; exit }' "$_stf")
  if [ -z "$_stt" ]; then
    _stt=$(awk '
      NR == 1 && /^#!/ { next }
      NR <= 6 {
        line = $0
        if (sub(/^[ \t]*(\/\/|#)[ \t]*/, "", line) == 0) next   # コメント行でない
        if (line ~ /^[ =*_-]+$/) next                            # 罫線だけの行
        if (length(line) > 0) { print line; exit }
      }
    ' "$_stf")
  fi
  [ -z "$_stt" ] && _stt="$(basename "$_stf")"
  printf '%s' "$_stt"
}

# run_suite <file> <runner: node|bash> <pass_target: yes|no>
run_suite() {
  _rsf="$1"; _rsrunner="$2"; _rstarget="$3"
  _rsb="$(basename "$_rsf")"
  _rslog="/tmp/shogi_suite_${_rsb}.log"
  echo ""
  echo "【$(suite_title "$_rsf")】"
  _rsrc=0
  if [ "$_rstarget" = "yes" ]; then
    "$_rsrunner" "$_rsf" "$TARGET" > "$_rslog" 2>&1 || _rsrc=$?
  else
    "$_rsrunner" "$_rsf" > "$_rslog" 2>&1 || _rsrc=$?
  fi
  if [ "$_rsrc" -eq 0 ]; then
    ok "$_rsb 全PASS ($(tail -1 "$_rslog"))"
  else
    ng "$_rsb 失敗"
    cat "$_rslog"
  fi
}

echo ""
echo "=========================================="
echo "  外部テスト（自動発見: test/ に置くだけで実行される）"
echo "=========================================="

DISCOVERED=''

# --- node テスト: test/test_*.js ---------------------------------------------
_js_list=$(printf '%s\n' "$SCRIPT_DIR"/test_*.js | LC_ALL=C sort)
while IFS= read -r _f; do
  [ -f "$_f" ] || continue
  _b="$(basename "$_f")"
  case ",$RETIRED_TESTS," in
    *",$_b,"*) echo ""; echo "  － $_b は登録解除済み（撤去スタブ）→ 実行しない"; continue ;;
  esac
  DISCOVERED="$DISCOVERED$_b
"
  case ",$NO_TARGET_TESTS," in
    *",$_b,"*) run_suite "$_f" node no ;;
    *)         run_suite "$_f" node yes ;;
  esac
done <<EOF
$_js_list
EOF

# --- shell テスト: test/test_*.sh / test/*_pgtest.sh -------------------------
_sh_list=$(printf '%s\n' "$SCRIPT_DIR"/test_*.sh "$SCRIPT_DIR"/*_pgtest.sh | LC_ALL=C sort -u)
while IFS= read -r _f; do
  [ -f "$_f" ] || continue
  _b="$(basename "$_f")"
  case ",$RETIRED_TESTS," in
    *",$_b,"*) echo ""; echo "  － $_b は登録解除済み → 実行しない"; continue ;;
  esac
  DISCOVERED="$DISCOVERED$_b
"
  run_suite "$_f" bash no
done <<EOF
$_sh_list
EOF

# --- 走査漏れ検査 -------------------------------------------------------------
#   旧方式は「登録済みだがファイルが無い」を warn で拾っていた。自動発見ではその warn が
#   構造上ありえない代わりに、取り違え削除・移動が黙って通る。そこで git 追跡ファイルと
#   突合して「追跡されているのに実行されなかったテスト」を検出する（旧 warn の代替・より厳しい）。
#   正常時は PASS を増やさない（＝スイート集合と PASS 総数を旧方式と一致させるため）。異常時のみ FAIL。
echo ""
echo "【自動発見の網羅性（git 追跡ファイルとの突合）】"
if command -v git >/dev/null 2>&1 && git -C "$SCRIPT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  _tracked=$(git -C "$SCRIPT_DIR" ls-files 'test_*.js' 'test_*.sh' '*_pgtest.sh' 2>/dev/null)
  _missing=''
  while IFS= read -r _t; do
    [ -n "$_t" ] || continue
    _tb="$(basename "$_t")"
    case ",$RETIRED_TESTS," in *",$_tb,"*) continue ;; esac
    if ! printf '%s\n' "$DISCOVERED" | grep -qxF "$_tb"; then
      _missing="$_missing $_tb"
    fi
  done <<EOF
$_tracked
EOF
  if [ -z "$_missing" ]; then
    echo "  ・git 追跡テストはすべて自動発見された（走査漏れなし）"
  else
    ng "git が追跡しているのに実行されなかったテスト:$_missing"
  fi

  # 現在の index だけでは、PR 内で削除・別名移動されたテストが一覧から消えて検出できない。
  # CI から渡す安定した base revision との突合は scripts/check_test_inventory.sh に切り出した
  # （[TEST-INVENTORY-RENAME-001]）。旧実装はここに直書きの `--no-renames --diff-filter=D` で、
  # test/test_foo_001.js → test/test_foo_002.js のような**在庫が減らない改名**まで削除として
  # 落としていた。切り出し先は rename を検出し、移動先が自動発見の対象かどうかで判定する。
  # 単体テストは test/test_check_test_inventory.sh（このスイートからは呼び出さない＝自己再帰なし）。
  _inventory_guard="$SCRIPT_DIR/../scripts/check_test_inventory.sh"
  if [ -f "$_inventory_guard" ]; then
    if _inventory_out=$(bash "$_inventory_guard" "${TEST_INVENTORY_BASE:-}" --test-dir "$SCRIPT_DIR" 2>&1); then
      printf '%s\n' "$_inventory_out" | sed 's/^/  ・/'
    else
      ng "テスト在庫ガード: $(printf '%s' "$_inventory_out" | tr '\n' ' ')"
    fi
  else
    ng "テスト在庫ガードが見つからない: scripts/check_test_inventory.sh"
  fi
else
  echo "  ・git 不在 → 網羅性検査は SKIP（自動発見自体は実行済み）"
fi
# ============================================
# 最終結果
# ============================================
echo ""
echo "=========================================="
echo "  結果: PASS=$PASS, FAIL=$FAIL, WARN=$WARN"
echo "=========================================="
[ $FAIL -eq 0 ] && echo "  ✓ 全テスト合格(警告: ${WARN}件)" && exit 0 || echo "  ✗ 失敗あり(要対応)" && exit 1
