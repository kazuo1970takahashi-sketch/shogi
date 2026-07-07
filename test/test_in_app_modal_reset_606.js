#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 破壊的リセット/削除 confirm 3件のアプリ内モーダル化（静的担保）。
//   対象: resetClassForClass / resetTournamentProgressOnly / resetAll。
//   native confirm → appConfirm（挙動同値=OK続行/取消中断）を inline callback で包む（本体は関数内に温存）。
//   破壊操作ゆえ danger:true（既定フォーカス=キャンセル・Enter抑止）。
//   ※OK/キャンセル/Enter/Esc の実挙動は実ブラウザ(Chromium)検証で担保（#640-643 と同方針）。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function count(s){ var n=0,i=0; while((i=RAW.indexOf(s,i))>=0){n++;i+=s.length;} return n; }

// 3サイトが appConfirm へ置換されている
assert(RAW.indexOf("appConfirm(className+'の組み合わせ・勝敗結果を削除します。") >= 0, 'A1 クラス別リセットは appConfirm');
assert(RAW.indexOf("appConfirm('参加者一覧は残したまま、") >= 0, 'A2 進行のみリセットは appConfirm');
assert(RAW.indexOf("appConfirm('参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。") >= 0, 'A3 全リセットは appConfirm');

// inline callback + danger:true（既定キャンセル）。3サイト分の閉じ括弧を確認
assert(count('  },{danger:true});') >= 3, 'D1 3サイトとも danger:true で inline callback を閉じる');
assert(count('  if(!_ok)return;') >= 3, 'D2 3サイトとも OK 時のみ本体実行（取消で中断＝挙動同値）');

// この3箇所から native confirm( は撤去
assert(RAW.indexOf("if(!confirm(className+'の組み合わせ") < 0, 'N1 クラス別リセットの native confirm 撤去');
assert(RAW.indexOf("if(!confirm('参加者一覧は残したまま") < 0, 'N2 進行のみリセットの native confirm 撤去');
assert(RAW.indexOf("if(!confirm('参加者一覧・組み合わせ・勝敗結果を含む大会データ") < 0, 'N3 全リセットの native confirm 撤去');

// 本体は関数内に温存（分離ヘルパを作らない＝挙動/構造の意図しない変化を避ける）
assert(RAW.indexOf('_resetAllConfirmed') < 0, 'S1 全リセット本体は resetAll 内に温存（別ヘルパを作らない）');
assert(RAW.indexOf("showMsg(className+'をリセットしました','ok');") >= 0, 'S2 クラス別リセットの本体（className 参照）は関数内クロージャで温存');

// 結線不変（id ベース bind 温存＝挙動同値の前提）
assert(RAW.indexOf("getElementById('resetBtn').addEventListener('click',resetAll)") >= 0, 'B1 全リセット bind 温存');
assert(RAW.indexOf("resetProgressBtn.addEventListener('click',resetTournamentProgressOnly)") >= 0, 'B2 進行リセット bind 温存');
assert(RAW.indexOf('resetClassForClass(c)') >= 0, 'B3 クラス別リセット bind 温存');

// モーダル基盤（前提）
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');
assert(RAW.indexOf("opts.danger&&type==='confirm'") >= 0, 'M2 危険確認は Enter 誤爆抑止');

console.log('IN-APP-MODAL-RESET-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
