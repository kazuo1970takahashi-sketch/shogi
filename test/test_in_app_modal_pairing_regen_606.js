#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 破壊的 confirm 3件（クラス削除・組み合わせ再生成×2）のアプリ内モーダル化（静的担保）。
//   対象: onClickRemoveClass（クラス削除）／ repairBtn click ハンドラ（再生成: 勝敗あり / 初回作り直し）。
//   native confirm → appConfirm（挙動同値=OK続行/取消中断）を inline callback で包む。破壊操作ゆえ danger:true（既定キャンセル）。
//   いずれも click ハンドラ直結（戻り値/同期完了に依存する呼び出し元なし）ゆえ sync→async 化は安全（#663 と同型）。
//   ※OK/キャンセル/Enter/Esc の実挙動は実ブラウザ(Chromium)検証で担保（#640-643/#663 と同方針）。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function count(s){ var n=0,i=0; while((i=RAW.indexOf(s,i))>=0){n++;i+=s.length;} return n; }

// --- A. 3サイトが appConfirm へ置換されている ---
assert(RAW.indexOf("appConfirm('「'+cur+'」を削除しますか？この操作は取り消せません。'") >= 0, 'A1 クラス削除は appConfirm');
assert(RAW.indexOf("appConfirm('入力済みの勝敗があります。組み合わせを再生成すると勝敗が消えます。続けますか？'") >= 0, 'A2 再生成(勝敗あり)は appConfirm');
assert(RAW.indexOf("appConfirm('現在の組み合わせをすべて作り直します。今ある手合いは破棄され、全員をペアし直します。よろしいですか？'") >= 0, 'A3 再生成(作り直し)は appConfirm');

// --- N. この3箇所から native confirm( は撤去 ---
assert(RAW.indexOf("if(!confirm('「'+cur+'」を削除しますか？") < 0, 'N1 クラス削除の native confirm 撤去');
assert(RAW.indexOf("if(!confirm('入力済みの勝敗があります。") < 0, 'N2 再生成(勝敗あり)の native confirm 撤去');
assert(RAW.indexOf("if(!confirm('現在の組み合わせをすべて作り直します。") < 0, 'N3 再生成(作り直し)の native confirm 撤去');

// --- D. danger:true（既定キャンセル）＋ OK時のみ本体実行（挙動同値） ---
assert(RAW.indexOf("if(!_ok)return;\n    removeClass(classId);") >= 0, 'D1 クラス削除は OK 時のみ removeClass（取消で中断）');
assert(RAW.indexOf("続けますか？',function(_ok){ if(!_ok)return; generatePairing(cls);renderTournament(cls); },{danger:true})") >= 0, 'D2 再生成(勝敗あり)は OK 時のみ再生成・danger:true');
assert(RAW.indexOf("よろしいですか？',function(_ok){ if(!_ok)return; generatePairing(cls);renderTournament(cls); },{danger:true})") >= 0, 'D3 再生成(作り直し)は OK 時のみ再生成・danger:true');
assert(RAW.indexOf("  },{danger:true});") >= 0, 'D4 クラス削除も danger:true で閉じる');

// --- S. 挙動同値の構造保証 ---
// 再生成: confirm 各分岐の OK 時と confirm 不要分岐(else)は末尾を同一（generatePairing→renderTournament）にインライン＝元の「if/else 後に一度だけ再生成」と同値。
assert(RAW.indexOf("}else{\n      generatePairing(cls);renderTournament(cls);\n    }") >= 0, 'S1 confirm 不要分岐(else)は従来どおり即再生成（挙動同値）');
// クラス削除本体（removeClass）は inline callback 内に温存（別ヘルパ抽出しない＝構造の意図しない変化を避ける）。
assert(RAW.indexOf("removeClass(classId);") >= 0, 'S2 削除本体 removeClass は温存');

// --- B. 結線不変（id ベース bind 温存＝挙動同値の前提） ---
assert(RAW.indexOf("onClickRemoveClass(c.id)") >= 0, 'B1 クラス削除 bind 温存（delBtn→onClickRemoveClass）');
assert(RAW.indexOf("getElementById('repairBtn_'+cls)") >= 0, 'B2 再生成ボタン bind 温存（repairBtn）');

// --- M. モーダル基盤（前提） ---
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');
assert(RAW.indexOf("opts.danger&&type==='confirm'") >= 0, 'M2 危険確認は Enter 誤爆抑止');

console.log('IN-APP-MODAL-PAIRING-REGEN-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
