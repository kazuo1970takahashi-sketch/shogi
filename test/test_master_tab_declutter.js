#!/usr/bin/env node
// MASTER-TAB-DECLUTTER (当日第2弾⑪): 会員名簿タブのボタン整理。
//   常時表示は「☁ クラウドから取得」のみ。準備/保守系（統合・入出力・削除済み表示・リセット）は
//   <details>「⚙ 名簿のメンテナンス」内へ。id は不変＝既存 bind/動作は温存。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
// 静的 HTML 文字列（buildMasterTabHtml 内）を対象に検証
ok(RAW.indexOf('id="masterCloudPullBtn"')>=0,'D1 ☁クラウドから取得は常時表示で残る');
ok(/<details class="master-maint"/.test(RAW),'D2 「⚙ 名簿のメンテナンス」折りたたみ(details)を新設');
ok(/名簿のメンテナンス/.test(RAW),'D3 summary 文言');
// メンテナンス系5ボタンが details 内（details の後に出現）
var dpos=RAW.indexOf('<details class="master-maint"');
ok(dpos>=0 && RAW.indexOf('id="masterMigrateBtn"')>dpos,'D4 統合は details 内');
ok(dpos>=0 && RAW.indexOf('id="masterExportBtn"')>dpos,'D5 エクスポートは details 内');
ok(dpos>=0 && RAW.indexOf('id="masterImportBtn"')>dpos,'D6 インポートは details 内');
ok(dpos>=0 && RAW.indexOf('id="masterShowDeletedBtn"')>dpos,'D7 削除済み表示は details 内');
ok(dpos>=0 && RAW.indexOf('id="masterResetBtn"')>dpos,'D8 リセットは details 内');
// ☁取得は details より前（常時表示）
ok(RAW.indexOf('id="masterCloudPullBtn"')<dpos,'D9 ☁取得は折りたたみより前（常時表示）');
// 削除済み表示中は details を開いたまま
ok(/_masterShowDeleted\?'"'"' open'"'"':'"'"''"'"'/.test(RAW)||RAW.indexOf("(_masterShowDeleted?' open':'')")>=0,'D10 削除済み表示中は details open');
console.log('MASTER-TAB-DECLUTTER: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
