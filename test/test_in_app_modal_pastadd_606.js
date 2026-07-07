#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 過去参加者パネルのクラス追加/変更 confirm 2件のアプリ内モーダル化（静的担保）。
//   対象: handlePastParticipantClassAdd の ケース2（別クラス→変更 confirm）／ケース1（未登録→追加 confirm）。
//   native confirm → appConfirm（挙動同値=OK続行/取消中断）。追加/変更操作ゆえ danger 無し（Enter=OK 維持）。
//   ケース2 は関数途中のため appConfirm 後に return を足し、モーダル表示中にケース1へ落ちない（フォールスルー防止）。
//   ※実挙動（OK/キャンセル/フォールスルー無し）は実ブラウザ(Chromium)検証で担保。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function count(s){ var n=0,i=0; while((i=RAW.indexOf(s,i))>=0){n++;i+=s.length;} return n; }

// 対象関数は存続
assert(RAW.indexOf('function handlePastParticipantClassAdd(memberId,cls){') >= 0, 'F handlePastParticipantClassAdd 存続');

// appConfirm へ置換（メッセージ温存）
assert(RAW.indexOf("appConfirm(memberName+'さんは現在 '+existingCls+'クラス に登録されています。") >= 0, 'A1 変更 confirm は appConfirm');
assert(RAW.indexOf("appConfirm(memberName+'さんを '+cls+'クラス に追加しますか?'") >= 0, 'A2 追加 confirm は appConfirm');
assert(RAW.indexOf('function(_ok2){') >= 0, 'A1c 変更は callback(_ok2)');
assert(RAW.indexOf('function(_ok1){') >= 0, 'A2c 追加は callback(_ok1)');
assert(RAW.indexOf('if(!_ok2)return;') >= 0, 'A1d 変更は OK 時のみ本体（取消で中断）');
assert(RAW.indexOf('if(!_ok1)return;') >= 0, 'A2d 追加は OK 時のみ本体（取消で中断）');

// native confirm( はこの2箇所から撤去
assert(RAW.indexOf("=confirm(memberName+'さんは現在 ") < 0, 'N1 変更の native confirm 撤去');
assert(RAW.indexOf("=confirm(memberName+'さんを '+cls+'クラス に追加しますか?'") < 0, 'N2 追加の native confirm 撤去');

// ケース2 フォールスルー防止: appConfirm callback を閉じた直後に guard return（モーダル表示中にケース1へ落ちない）
assert(RAW.indexOf('    });\n    return;\n  }\n  // ケース 1') >= 0, 'G ケース2 は appConfirm 後に return でケース1 へ落ちない');

// 追加/変更は非破壊ゆえ danger 無し（前回リセット系との方針差＝破壊操作のみ danger）
assert(count('function(_ok1){') === 1 && count('function(_ok2){') === 1, 'D 追加/変更は 1 箇所ずつ（重複変換なし）');

// bind/呼び出しは温存
assert(RAW.indexOf('handlePastParticipantClassAdd(mid,cls)') >= 0, 'B1 一覧側の呼び出し温存');
assert(RAW.indexOf('handlePastParticipantClassAdd(memberId,c)') >= 0, 'B2 シート側 click 呼び出し温存');

// モーダル基盤（前提）
assert(RAW.indexOf('function appConfirm(') >= 0, 'M appConfirm 基盤');

console.log('IN-APP-MODAL-PASTADD-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
