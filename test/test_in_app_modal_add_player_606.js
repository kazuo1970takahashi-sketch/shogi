#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 開始後クラスへの遅延追加確認のアプリ内モーダル化（静的担保）。
//   対象: addPlayer() の「2回戦以降の追加」native confirm → appConfirm。
//   ・追加は破壊操作でない（affirmative 選択）ため danger なし＝native 既定 Enter=OK 温存。
//   ・追加本体（~83行）は _doAddPlayer に集約（早期 return なし・直線的）。ガード該当時のみ appConfirm→OK で _doAddPlayer、非該当時は即実行＝元の「confirm false で return」と同値。
//   ・呼び出し元は addBtn click / Enter keypress（fire-and-forget）＝sync→async 安全。挙動は test_pairing_odd_leftover_272.js (ADD-5/6/7/8) が現実追従で担保。
//   ※OK/キャンセル/Enter/Esc の実挙動は実ブラウザ検証で担保（#640-643/#663/#681/#682/#683 と同方針）。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// A. appConfirm へ置換（コールバック型・OK時のみ _doAddPlayer）
assert(RAW.indexOf("回戦まで進行しています。\\nいま追加すると") >= 0, 'A0 遅延追加の確認文言は温存');
assert(RAW.indexOf("追加してよろしいですか？',function(_ok){ if(_ok)_doAddPlayer(); })") >= 0, 'A1 遅延追加確認は appConfirm（OK時のみ _doAddPlayer）');

// N. native confirm 撤去
assert(RAW.indexOf("if(!confirm(cls+'クラスはすでに'") < 0, 'N1 addPlayer 遅延追加の native confirm 撤去');

// D. danger なし（affirmative 追加・破壊操作でない＝native 既定温存）。appConfirm 呼びは },{danger:true}) で閉じない
assert(RAW.indexOf("追加してよろしいですか？',function(_ok){ if(_ok)_doAddPlayer(); },{danger:true})") < 0, 'D1 追加確認に danger は付けない（affirmative・native 既定 Enter=OK 温存）');

// S. 追加本体は _doAddPlayer に集約・ガード非該当は即実行（挙動同値）
assert(RAW.indexOf("function _doAddPlayer(){") >= 0, 'S1 追加本体を _doAddPlayer に集約');
assert(RAW.indexOf("  }\n  _doAddPlayer();\n\n  function _doAddPlayer(){") >= 0, 'S2 ガード該当は appConfirm→return／非該当は即 _doAddPlayer()（元の分岐と同値）');
assert(RAW.indexOf("appConfirm(cls+'クラスはすでに'+roundsDone272+") >= 0, 'S3 ガード内でのみ appConfirm（開始後2回戦以降のみ確認）');
assert(RAW.indexOf("showMsg(name+'（'+cls+'クラス）を登録しました','ok');") >= 0, 'S4 追加本体（登録メッセージ）温存');
assert(RAW.indexOf("SAVE-002: addPlayer の保存が確認できませんでした") >= 0, 'S5 追加本体（保存検証）温存');
assert(RAW.indexOf("// end _doAddPlayer") >= 0, 'S6 _doAddPlayer の閉じ（addPlayer の閉じと分離）');

// B. 結線不変（addBtn click / Enter keypress → addPlayer）
assert(RAW.indexOf("getElementById('addBtn').addEventListener('click',addPlayer)") >= 0, 'B1 addBtn click bind 温存');

// M. モーダル基盤
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');

console.log('IN-APP-MODAL-ADD-PLAYER-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
