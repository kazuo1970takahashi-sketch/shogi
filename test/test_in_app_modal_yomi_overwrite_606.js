#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: YOMI 上書き確認（📋 参加者を名簿に反映 時のふりがな上書き）confirm 1件のアプリ内モーダル化（静的担保）。
//   対象: syncBranchMasterOnSave 内の native confirm('当日編集したふりがな…更新しますか？') → appConfirm。
//   難所: confirm の答えを saveBranchMaster 前に確定する必要がある（confirm OK 時のみ master.yomi を上書きしてから保存）。
//   方針:
//     ・保存以降の tail（saveBranchMaster→_pendingNewYomi クリア→yomiDirty 解除→markSaveStatus→save）を
//       _finishMasterSync に集約し、OK 時は上書き後・キャンセル/差分なし時はそのまま tail を実行＝旧「confirm 応答後に保存」の順序・分岐を厳密保持。
//     ・YOMI 差分検出が例外なく完走したときのみ（_ydiffsReady）確認を出す＝旧「検出～confirm を同一 try 内」を保持（検出 throw で confirm 非到達）。
//     ・呼び出し元 saveData は完了通知 showToast を onDone 継続で受ける＝旧「同期反映後に通知」の順序を保持。
//     ・corruption スキップ／例外の全経路でも _done() を呼び、完了通知を1回だけ発火。
//   ※OK で上書き・キャンセルで非上書きの実挙動は実ブラウザ検証で担保（#640-643/#663/#681-684 と同方針）。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function count(hay, needle){ return hay.split(needle).length - 1; }

// A. appConfirm へ置換＋onDone 契約
assert(RAW.indexOf('function syncBranchMasterOnSave(onDone){') >= 0, 'A1 syncBranchMasterOnSave は onDone 継続を受け取る');
assert(RAW.indexOf("appConfirm('当日編集したふりがなが名簿と異なる会員がいます。名簿のふりがなを次のとおり更新しますか？") >= 0, 'A2 YOMI 上書き確認は appConfirm（コールバック型・文言不変）');

// N. native confirm 撤去
assert(count(RAW, "if(confirm('当日編集したふりがな") === 0, 'N1 YOMI の native confirm 撤去');
assert(count(RAW, "_ydiffs.length>0&&typeof confirm==='function'") === 0, 'N2 旧 typeof confirm ガード撤去');

// B. tail を _finishMasterSync に集約（保存以降を confirm 応答後に実行）
assert(RAW.indexOf('var _finishMasterSync=function(){') >= 0, 'B1 保存以降の tail を _finishMasterSync に集約');
assert(RAW.indexOf('var masterSaved=saveBranchMaster(master);') >= 0, 'B2 saveBranchMaster を tail 内に温存');
assert(RAW.indexOf("markSaveStatus('meibo');") >= 0, 'B3 markSaveStatus(meibo) を tail 内に温存');

// D. 分岐同値: OK 時のみ上書き→tail、差分なし/キャンセルもそのまま tail、検出完走時のみ確認
assert(RAW.indexOf('if(_ok){ try{ for(var _ai=0;_ai<_ydiffs.length;_ai++){ _ydiffs[_ai].mem.yomi=_ydiffs[_ai].to; }') >= 0, 'D1 OK 時のみ master.yomi を上書き（キャンセルは非上書き）');
assert(RAW.indexOf('if(_ydiffsReady&&_ydiffs.length>0){') >= 0, 'D2 検出が例外なく完走したときのみ確認を出す（_ydiffsReady）');
assert(count(RAW, '_finishMasterSync();') >= 2, 'D3 _finishMasterSync は 確認OK/キャンセル経路（callback 内）＋差分なし経路の両方から呼ばれる');

// C. 呼び出し元 saveData は完了通知を onDone 継続で受ける（順序保持）
assert(RAW.indexOf('syncBranchMasterOnSave(function(){') >= 0, 'C1 saveData は onDone 継続を渡す');
// MASTER-SYNC-CLARITY-001 (#757): onDone は counts を受け取り、文言は formatMasterSyncResultToast に委譲（位置＝onDone 内は不変）。
assert(/syncBranchMasterOnSave\(function\(counts\)\{[\s\S]{0,600}showToast\(formatMasterSyncResultToast\(counts\)\);[\s\S]{0,20}\}\);/.test(RAW), 'C2 showToast は onDone 内へ移設（同期反映後に通知）');

// E. 完了通知の全経路担保: _done ヘルパ＋corruption/例外経路
// MASTER-SYNC-CLARITY-001 (#757): onDone は同期結果の内訳（_counts）を引数で受ける（呼び出し回数・経路は不変）。
assert(/function _done\(\)\{ if\(typeof onDone===['"]function['"]\)onDone\(_counts\); \}/.test(RAW), 'E1 _done ヘルパ（onDone を安全に1回呼ぶ）');
assert(RAW.indexOf('      save();\n      _done();\n      return;') >= 0, 'E2 corruption スキップ経路でも _done を呼ぶ（完了通知）');

// F. 関数構造: 単一定義
assert(count(RAW, 'function syncBranchMasterOnSave(') === 1, 'F1 syncBranchMasterOnSave 単一定義');
assert(count(RAW, 'function saveData(') === 1, 'F2 saveData 単一定義');

// M. モーダル基盤
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');

console.log('IN-APP-MODAL-YOMI-OVERWRITE-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
