#!/usr/bin/env node
// REBUILD-SEMANTICS-001 (#609) Phase1: 「☁ クラウドから完全再構築」の文言明確化（ローカル温存仕様の明示）。
//   Q1=A（「完全」を外す）。ボタン名・title・confirm から「端末の新しい記録は残る（温存）」が読め、
//   クリック可能なボタンラベルに「完全再構築」が残らないことを静的に検証する。実データ不使用。
var fs=require('fs');
var RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

// ボタン（masterRebuildBtn）のラベルから「完全」除去＋新ラベル＋title 温存文
var btnLine=(RAW.split('\n').filter(function(l){return l.indexOf('id="masterRebuildBtn"')>=0;})[0])||'';
ok(btnLine.indexOf('☁ クラウドから名簿を再計算（参加履歴を反映）')>=0,'S1 新ボタンラベル（「完全」除去）');
ok(btnLine.indexOf('完全再構築')<0,'S2 ボタンラベルに「完全再構築」が残らない');
ok(btnLine.indexOf('title="')>=0 && btnLine.indexOf('端末の新しい記録は残したまま')>=0,'S3 title に温存フレーズ');
ok(btnLine.indexOf('クラウドへ完全一致はしません')>=0,'S4 title に「完全一致はしません」明示');

// confirm（rebuild）の温存強調
ok(RAW.indexOf('この端末の新しい参加記録はそのまま残ります（クラウドへ完全一致はしません）。')>=0,'S5 confirm の温存強調文');
ok(RAW.indexOf('氏名・ふりがな・区分・市町村・削除状態は変更しません。')>=0,'S6 confirm 非変更項目の明記は維持');

// クリックハンドラは挙動不変（rebuildMasterFromCloudUI を呼ぶ）
ok(RAW.indexOf("getElementById('masterRebuildBtn')")>=0 && RAW.indexOf('rebuildMasterFromCloudUI(_masterCloudStatusFn())')>=0,'S7 rebuild 結線は挙動不変（bind＋rebuildMasterFromCloudUI 呼出を維持）');

console.log('REBUILD-SEMANTICS-WORDING-609: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
