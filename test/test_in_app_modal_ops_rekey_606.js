#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: 運営共通キー張り替え確認（クラウドID）confirm 3件のアプリ内モーダル化（静的担保）。
//   対象: issueOpsSharedKey / applyOpsSharedKey / joinOpsKeylessTournament の
//     `var okc=(typeof confirm==='function')?confirm('この端末は今の大会IDでクラウドへ送信済みです…')` → appConfirm。
//   難所: これらは confirm の同期戻り値を直後に使い（if(!okc)return …）、OK 後も同期で state.tournament_id 確定＋saveData を続け、
//     さらに関数が戻り値（key / {ok:...}）を呼び出し元へ返す契約。呼び出し元（受付タブのボタン）は完了後に refreshOpsKeyDisplay を走らせる。
//   方針:
//     ・確定～通知（state.tournament_id=tid→saveData→setStatus）を `_commit` に集約し、確認 OK 時のみ実行＝旧「confirm OK 後に確定」を厳密保持。
//       キャンセルは _commit 非実行＝旧 confirm false で return と同値（ID 維持）。
//     ・非 confirm 経路（ガード非発火）は従来どおり **同期で戻り値を返す**（既存の戻り値 assert・互換を維持）。
//     ・完了は `onDone(result)` で全経路 1 回通知し、呼び出し元は表示更新 refreshOpsKeyDisplay を onDone 継続で受ける
//       （確認応答後に確定・キャンセル時も反映）＝旧「関数完了後に refreshOpsKeyDisplay」の順序を保持。
//   ※confirm OK で張り替え／キャンセルで ID 維持の実挙動は挙動テスト test_ops_share_ui.js（C6-C9/J5-J6・resolver 配線）が担保。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function count(hay, needle){ return hay.split(needle).length - 1; }

// A. 署名に onDone 継続を追加（3関数）
assert(RAW.indexOf('function issueOpsSharedKey(setStatus, onDone){') >= 0, 'A1 issueOpsSharedKey は onDone を受け取る');
assert(RAW.indexOf('function applyOpsSharedKey(rawInput,setStatus,onDone){') >= 0, 'A2 applyOpsSharedKey は onDone を受け取る');
assert(RAW.indexOf('function joinOpsKeylessTournament(setStatus,onDone){') >= 0, 'A3 joinOpsKeylessTournament は onDone を受け取る');

// B. appConfirm へ置換（3関数とも同一の張り替え確認文言）＋ native confirm 撤去
assert(count(RAW, "appConfirm('この端末は今の大会IDでクラウドへ送信済みです") === 3, 'B1 張り替え確認 3件を appConfirm へ置換');
assert(count(RAW, "okc=(typeof confirm==='function')?confirm(") === 0, 'B2 native confirm（okc）3件すべて撤去（クラウドID張り替え確認）');

// C. 確定～通知を _commit 集約・OK 時のみ実行／全経路 onDone
assert(count(RAW, 'function _commit(){') === 3, 'C1 確定～通知は _commit に集約（3関数）');
assert(count(RAW, 'function _done(r){ if(typeof onDone===\'function\')onDone(r); return r; }') === 3, 'C2 完了通知 _done ヘルパ（onDone を全経路 1 回）');
assert(/if\(!_ok\)\{ if\(setStatus\)setStatus\('発行を中止しました/.test(RAW), 'C3 issue キャンセルは _commit 非実行（ID 維持）＝旧同値');

// D. 非 confirm 経路は同期戻り値を維持（return _commit() / return _done(...)）
assert(count(RAW, 'return _commit();') === 3, 'D1 非 confirm 経路は同期で _commit の戻り値を返す（互換維持）');
assert(count(RAW, 'return _done(') >= 6, 'D2 早期 return も _done 経由で戻り値＋完了通知');

// E. 呼び出し元は refreshOpsKeyDisplay を onDone 継続で受ける（旧: 関数後に直呼び→撤去）
assert(count(RAW, 'function(){ if(typeof refreshOpsKeyDisplay===\'function\')refreshOpsKeyDisplay(); }') === 3, 'E1 3ボタンとも onDone 継続で refreshOpsKeyDisplay を渡す');
assert(RAW.indexOf('issueOpsSharedKey(function(msg){ if(st)st.textContent=msg; }, function(){ if(typeof refreshOpsKeyDisplay') >= 0, 'E2 発行ボタンは onDone 付きで呼ぶ');

// F. 関数構造: 単一定義
assert(count(RAW, 'function issueOpsSharedKey(') === 1, 'F1 issueOpsSharedKey 単一定義');
assert(count(RAW, 'function applyOpsSharedKey(') === 1, 'F2 applyOpsSharedKey 単一定義');
assert(count(RAW, 'function joinOpsKeylessTournament(') === 1, 'F3 joinOpsKeylessTournament 単一定義');

// M. モーダル基盤
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');

console.log('IN-APP-MODAL-OPS-REKEY-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
