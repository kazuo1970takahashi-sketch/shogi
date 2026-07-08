#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 対戦相手変更（再戦保存 / 入れ替え）confirm 2件のアプリ内モーダル化（静的担保）。
//   対象: bindChangePairingModalEvents の chg-save クリックハンドラ内 native confirm 2件
//     ①再戦保存 '…再戦として保存しますか？'（otherIdx===-1 かつ pairHasRematch 経路）
//     ②入れ替え実行 '入れ替えを実行します。…'（swap 経路）
//   ・confirm 後の共通後処理（modal 除去→renderTournament→save→SAVE-003b 保存検証）を
//     _finishChangePairing() に集約し、OK 経路のみで呼ぶ＝元の「confirm OK 後に後処理」の順序・分岐を厳密保持。
//   ・取消（_ok=false で return）・swap の重複検出ロールバック（return）はいずれも _finishChangePairing 非実行＝confirm false で return と同値。
//   ・両操作とも肯定操作ゆえ danger 無し（native 既定 Enter=OK を温存）。
//   ※OK/キャンセル/Enter/Esc の実挙動は実ブラウザ検証で担保（#640-643/#663/#681-684 と同方針）。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// A. 共通後処理ヘルパへの集約
assert(RAW.indexOf('function _finishChangePairing(){') >= 0, 'A1 共通後処理は _finishChangePairing に集約');
assert(RAW.indexOf("document.getElementById('chg-modal').remove();\n      renderTournament(cls);save();") >= 0, 'A2 modal 除去→renderTournament→save の順序を helper 内に温存');
assert(RAW.indexOf('SAVE-003b: bindChangePairingModalEvents の保存が確認できませんでした') >= 0, 'A3 SAVE-003b 保存検証(notifySaveWarning)を helper 内に温存');

// B. 再戦保存 confirm → appConfirm（danger 無し）＋ OK 経路のみ確定→後処理
assert(RAW.indexOf("appConfirm('この組み合わせは過去に対戦済みです。再戦として保存しますか？',function(_ok){") >= 0, 'B1 再戦保存は appConfirm（コールバック型）');
assert(RAW.indexOf("if(!confirm('この組み合わせは過去に対戦済みです。再戦として保存しますか？'))return;") < 0, 'B2 再戦保存の native confirm 撤去');

// C. 入れ替え実行 confirm → appConfirm（danger 無し）
assert(RAW.indexOf("appConfirm('入れ替えを実行します。\\n  ('+getName(oldP1,cls)") >= 0, 'C1 入れ替え実行は appConfirm（コールバック型・文言不変）');
assert(RAW.indexOf("if(!confirm('入れ替えを実行します。") < 0, 'C2 入れ替え実行の native confirm 撤去');

// D. 分岐同値: OK 時のみ確定→_finishChangePairing、取消/重複ロールバックは return（helper 非実行）
assert(/appConfirm\('この組み合わせは過去に対戦済みです。再戦として保存しますか？',function\(_ok\)\{\s*if\(!_ok\)return;/.test(RAW), 'D1 再戦保存 callback は if(!_ok)return で取消中断');
assert((RAW.match(/_finishChangePairing\(\);/g) || []).length >= 3, 'D2 _finishChangePairing は 再戦OK・非再戦・入れ替えOK の 3 経路で実行（分岐同値）');
assert(RAW.indexOf('内部エラー: 入れ替え後の重複を検出しました。変更を取り消し、元の組み合わせに戻しました') >= 0, 'D3 swap 重複検出ロールバックの文言・分岐を温存（return で helper 非実行）');

// E. 肯定操作ゆえ danger 無し（この 2 呼び出しに danger:true を付けない＝Enter=OK 温存）
assert(RAW.indexOf("再戦として保存しますか？',function(_ok){\n          if(!_ok)return;\n          state.pairings[cls][idx]={p1:newP1,p2:newP2,winner:null,lastModifiedBy:'manual'};\n          _finishChangePairing();\n        });") >= 0, 'E1 再戦保存は danger オプション無しで閉じる');

// F. モーダル基盤
assert(RAW.indexOf('function appConfirm(') >= 0, 'F1 appConfirm 基盤');

// N. 関数構造: bindChangePairingModalEvents は単一定義のまま
assert((RAW.match(/function bindChangePairingModalEvents\(cls, idx\)\{/g) || []).length === 1, 'N1 bindChangePairingModalEvents は単一定義（重複なし）');

console.log('IN-APP-MODAL-CHANGE-PAIRING-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
