#!/usr/bin/env node
// IN-APP-MODAL-001 (#606) スライス: FRP（1局目の逐次追加）confirm 3件のアプリ内モーダル化（静的担保）。
//   対象: onClickAppendFirstRound（選択式）/ onClickAddOneTable（先頭2名で1卓）/ onClickAddAllTables（未手合い一括）
//     各々の native confirm(buildFrpAppendConfirmMessage(...)) → appConfirm。
//   ・3関数とも共有フラグ firstRoundAppendInFlight による再入ガード（#274・連打/クロス再入を弾く）の try/finally 内にあり、
//     confirm を非同期化すると finally が応答前にフラグを戻す→ガード崩壊。よってモーダル到達時のみ解除を callback へ委譲し
//     （_frpDeferred=true → 外側 finally は解除しない）、confirm 応答～append 完了まで再入ガードを保持する。
//   ・OK 時のみ append＝旧 confirm false で return と同値。append/例外いずれの経路でも callback の finally でフラグ解除。
//   ・その他の全 return / 同期例外は従来どおり外側 finally で解除＝旧 try/finally と同値。
//   ※confirm 中の再入/クロス再入で二重 append しないことは挙動テスト（test_frp_impl_003 RE/ test_cross_reentry_274 X/
//     test_progressive_pairing_p1・p2）が __setAppModalTestResolver 配線で担保。ここは静的構造の担保。
var fs = require('fs');
var RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function count(hay, needle){ return hay.split(needle).length - 1; }

// A. appConfirm へ置換（3関数とも同一の確認文言関数を使用）
assert(count(RAW, 'appConfirm(buildFrpAppendConfirmMessage(cls,built.pairs,built.leftover),function(_ok){') === 3, 'A1 FRP 3関数とも appConfirm(buildFrpAppendConfirmMessage(...)) へ置換');

// N. native confirm 撤去（旧 typeof confirm ガード + confirm 直呼びの撤去）
assert(count(RAW, 'if(!confirm(buildFrpAppendConfirmMessage(cls,built.pairs,built.leftover)))return;') === 0, 'N1 FRP の native confirm 3件すべて撤去');

// D. 再入ガード保持＝モーダル到達時のみ解除を callback へ委譲
assert(count(RAW, 'var _frpDeferred=false;') === 3, 'D1 _frpDeferred フラグを 3関数に導入');
assert(count(RAW, '_frpDeferred=true;') === 3, 'D2 appConfirm 到達時に _frpDeferred=true（外側 finally は解除しない）');
assert(count(RAW, 'if(!_frpDeferred)firstRoundAppendInFlight=false;') === 3, 'D3 外側 finally は未委譲時のみ解除＝全 return/同期例外は旧同値');
assert(count(RAW, 'finally{ firstRoundAppendInFlight=false; }') === 3, 'D4 callback は append/例外いずれでも finally で再入ガードを解除');
assert(count(RAW, 'try{ if(_ok)appendFirstRoundPairs(cls,built.pairs); }') === 3, 'D5 OK 時のみ append＝旧 confirm false で return と同値');

// G. 再入ガードの設定/入口チェックは不変（3関数）
assert(count(RAW, 'if(firstRoundAppendInFlight)return;') === 3, 'G1 入口の再入ガード（連打/クロス再入を弾く）3関数で不変');
assert(count(RAW, 'firstRoundAppendInFlight=true;') === 3, 'G2 入口でフラグを立てる 3関数で不変');

// F. 関数構造: 3ハンドラは単一定義のまま
assert(count(RAW, 'function onClickAppendFirstRound(cls){') === 1, 'F1 onClickAppendFirstRound 単一定義');
assert(count(RAW, 'function onClickAddOneTable(cls){') === 1, 'F2 onClickAddOneTable 単一定義');
assert(count(RAW, 'function onClickAddAllTables(cls){') === 1, 'F3 onClickAddAllTables 単一定義');

// NC. 旧開始関数を呼ばない（回帰防止・FRP-IMPL-003 NOCALL と同趣旨）
assert(RAW.indexOf('function onClickAppendFirstRound(cls){') >= 0, 'NC0 対象関数が存在');

// M. モーダル基盤
assert(RAW.indexOf('function appConfirm(') >= 0, 'M1 appConfirm 基盤');

console.log('IN-APP-MODAL-FRP-APPEND-606: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
