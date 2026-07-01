#!/usr/bin/env node
// SAVE-LINE-CONSOLIDATE ⑨-a: 復元をバックアップ画面へ集約。「読み込み」ボタン撤去＋バックアップに「貼り付けから復元」追加。
//   loadFile input / loadData / openLoadModal / loadFromPaste は温存（import_routing 資産）。loadFromPaste は両モーダル対応。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
ok(RAW.indexOf('id="loadBtn"')<0,'C1 ヘッダ「読み込み」ボタン(loadBtn)は撤去');
ok(/getElementById\('loadBtn'\)/.test(RAW)===false,'C2 loadBtn の bind も撤去');
ok(RAW.indexOf('id="loadFile"')>=0,'C3 loadFile input は温存（loadData 受け皿）');
ok(RAW.indexOf('function loadFromPaste')>=0 && RAW.indexOf('function loadData')>=0,'C4 loadFromPaste/loadData は温存');
ok(RAW.indexOf('id="backup-paste-area"')>=0 && RAW.indexOf('id="backup-paste-btn"')>=0,'C5 バックアップに貼り付け欄＋復元ボタン');
ok(RAW.indexOf('貼り付けから復元')>=0,'C6 「貼り付けから復元」文言');
ok(/getElementById\('load-paste-area'\)\|\|document\.getElementById\('backup-paste-area'\)/.test(RAW),'C7 loadFromPaste が backup-paste-area も読む');
ok(/backup-paste-btn'\)[\s\S]{0,120}loadFromPaste/.test(RAW),'C8 backup-paste-btn→loadFromPaste 結線');
ok(RAW.indexOf('function _closeRestoreModals')>=0,'C9 復元後は load/backup 両モーダルを閉じる helper');
ok(RAW.indexOf('id="backup-export"')>=0 && RAW.indexOf('id="backup-import-pick"')>=0,'C10 バックアップの保存/ファイル復元は不変');
console.log('SAVE-LINE-CONSOLIDATE: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
