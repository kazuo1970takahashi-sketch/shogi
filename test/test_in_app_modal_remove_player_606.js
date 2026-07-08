#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 参加者削除確認のアプリ内モーダル化（静的担保）。
//   対象: removePlayer(id,cls) の native confirm → appConfirm({danger:true})。
//   ・removePlayer は呼び出し元 pp-sheet-remove（3431 相当）が削除後に pp パネル再描画を同期実行していたため、
//     継続を onDone 引数で受け取り confirm 解決後（OK/取消いずれも）に実行＝元の後処理順序を保持（sync→async 安全化）。
//   ・削除本体は if(_ok) 内、onDone は常に実行。破壊操作ゆえ danger:true（既定キャンセル）。
//   ・click 削除（delBtn→removePlayer(pid,c)）は onDone なし＝従来どおり。
//   ※OK/キャンセル/Enter/Esc の実挙動は実ブラウザ検証で担保（#640-643/#663/#681/#682 と同方針）。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// A. appConfirm へ置換＋onDone 継続シグネチャ
assert(RAW.indexOf("function removePlayer(id,cls,onDone){") >= 0, 'A1 removePlayer は onDone 継続を受け取る');
assert(RAW.indexOf("var msg=name+'を削除しますか？';\n  appConfirm(msg,function(_ok){") >= 0, 'A2 削除確認は appConfirm（コールバック型）');

// N. native confirm 撤去
assert(RAW.indexOf("var msg=name+'を削除しますか？';\n  if(!confirm(msg))return;") < 0, 'N1 removePlayer の native confirm 撤去');

// D. danger:true ＋ 分岐同値（削除は OK 時のみ・onDone は常に実行）
assert(RAW.indexOf("if(_ok){\n      var arr=state.players[cls];") >= 0, 'D1 削除本体は OK 時のみ（取消で非実行）');
assert(RAW.indexOf("if(typeof onDone==='function')onDone();\n  },{danger:true});") >= 0, 'D2 onDone は confirm 解決後に常に実行・danger:true で閉じる');

// S. 削除本体（save/verify/notify）は callback 内に温存
assert(RAW.indexOf("state.players[cls]=arr.filter(function(p){return p.id!==id;});") >= 0, 'S1 フィルタ削除ロジック温存');
assert(RAW.indexOf("SAVE-001: removePlayer の保存が確認できませんでした") >= 0, 'S2 保存検証(notifySaveWarning)温存');
assert(RAW.indexOf("renderRegList();save();") >= 0, 'S3 renderRegList/save 温存');

// C. 呼び出し元の追従: pp-sheet-remove は onDone で pp パネル再描画（元の同期後処理）
assert(RAW.indexOf("removePlayer(pid,currentCls,function(){") >= 0, 'C1 pp-sheet-remove は onDone で継続を渡す');
assert(RAW.indexOf("renderPastParticipantsPanel(inp?inp.value:'');") >= 0, 'C2 pp パネル再描画は onDone 内に移設（順序保持）');

// B. click 削除は従来どおり2引数（onDone なし）
assert(RAW.indexOf("removePlayer(pid,c);") >= 0, 'B1 delBtn click 削除は removePlayer(pid,c)（onDone なし＝従来挙動）');

// E. 厳密同値: ガードブロック経路でも onDone を実行（元の「removePlayer 後に無条件で後処理」を全経路で再現）＋ ガード文言不変
assert((RAW.match(/if\(typeof onDone==='function'\)onDone\(\);/g) || []).length >= 3, 'E1 onDone は confirm callback ＋ 2ガード（inPairings/pastMatches）の計3経路で実行＝全経路で後処理（厳密同値）');
assert(RAW.indexOf("は現在の組み合わせに登録されているため削除できません") >= 0, 'E2 inPairings ガード文言 不変');
assert(RAW.indexOf("試合分の勝敗結果があるため削除できません") >= 0, 'E3 pastMatches ガード文言 不変');

// M. モーダル基盤
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');
assert(RAW.indexOf("okBtn.className=(opts.danger?'btn-danger'") >= 0, 'M2 danger スタイル基盤');

console.log('IN-APP-MODAL-REMOVE-PLAYER-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
