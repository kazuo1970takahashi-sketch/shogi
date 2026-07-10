#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 棄権時の「相手を不戦勝にするか」確認のアプリ内モーダル化（静的担保）。
//   対象: toggleWithdrawn 内の forfeit 確認（native confirm → appConfirm）。
//   ・棄権自体（pl.withdrawn=true; save()）は confirm より前で確定済み＝本 confirm は affirmative 選択のみ。
//   ・破壊的 reset/削除ではないため danger は付けない（native 既定挙動を温存＝挙動同値）。
//   ・順序保持: 後処理（renderRegList/showMsg）を _finishWithdraw に集約し、OK時 setWinner→後処理／キャンセル・対象なしでも後処理は必ず実行。
//   ・呼び出し元は wdBtn click 1件のみ（戻り値/同期完了非依存）＝sync→async 安全。
//   ※OK/キャンセル/Esc の実挙動は実ブラウザ検証で担保（#640-643/#663/#681 と同方針）。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// A. appConfirm へ置換
assert(RAW.indexOf("appConfirm(getName(id,cls)+'さんを棄権にしました。\\n現在の回戦で '+getName(oppId,cls)+'さんと対局予定です。\\n'+getName(oppId,cls)+'さんを不戦勝（勝ち）にしますか？',function(_ok){") >= 0, 'A1 不戦勝確認は appConfirm（コールバック型）');

// N. native confirm 撤去
assert(RAW.indexOf("confirm(getName(id,cls)+'さんを棄権にしました。") < 0 || RAW.indexOf("     confirm(getName(id,cls)+'さんを棄権にしました。") < 0, 'N1 forfeit の native confirm 撤去');
assert(RAW.indexOf("typeof confirm==='function'&&\n     confirm(getName(id,cls)") < 0, 'N2 旧 compound native confirm 構造の撤去');

// D. 分岐同値: OK時のみ setWinner、後処理は必ず実行、danger なし
assert(RAW.indexOf("if(_ok)setWinner(cls,mIdx,oppId);") >= 0, 'D1 OK時のみ setWinner（不戦勝記録）');
assert(RAW.indexOf("      _finishWithdraw();\n    });") >= 0, 'D2 コールバック末尾で後処理（OK/キャンセル問わず）');
assert(RAW.indexOf("にしますか？',function(_ok){") >= 0 && RAW.indexOf("にしますか？',function(_ok){") === RAW.lastIndexOf("にしますか？',function(_ok){"), 'D3 forfeit appConfirm は1箇所のみ');
// forfeit は破壊的 reset/削除ではないため danger:true を付けない（この appConfirm 呼びは },{danger:true}) で閉じない）
assert(RAW.indexOf("_finishWithdraw();\n    });") >= 0, 'D4 danger なしで閉じる（affirmative 選択・native 既定温存）');

// S. 順序保持の構造: _finishWithdraw を両分岐（対象あり callback / else）で実行
assert(RAW.indexOf("function _finishWithdraw(){") >= 0, 'S1 後処理を _finishWithdraw に集約');
assert(RAW.indexOf("}else{\n    _finishWithdraw();\n  }") >= 0, 'S2 対象なし（oppId/mIdx 無効）でも後処理は実行（元コードと同一順序）');
assert(RAW.indexOf("renderRegList();") >= 0, 'S3 renderRegList は後処理内に温存');

// B. 結線不変（棄権導線 → toggleWithdrawn）
// REG-TAB-TIDY-001 (#743) ⑤b: 行ボタン（wdBtn→toggleWithdrawn(pid,c)）は「⋯ 編集」シート（pes-withdraw→
//   toggleWithdrawn(playerId,cls)）へ移設。呼び先関数と開始後のみ条件は不変。
assert(RAW.indexOf("toggleWithdrawn(playerId,cls)") >= 0, 'B1 棄権導線 bind 温存（編集シート→toggleWithdrawn）');

// M. モーダル基盤
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');

console.log('IN-APP-MODAL-WITHDRAW-FORFEIT-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
