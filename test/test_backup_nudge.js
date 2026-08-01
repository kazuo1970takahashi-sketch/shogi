#!/usr/bin/env node
// BACKUP-NUDGE (当日第2弾⑫): 節目（大会開始/クラス完了/全終了）で非ブロッキングにバックアップを促す。
//   節目ごと1回・あとで可・端末事故の全損防止。reset 安全網(⑩)と別系統。
// 読込は共通ヘルパへ集約 [PHASE1-LOADER-001]（同じ全束を1コンテキストで評価する・意味論不変）
const {loadApp,readHtml}=require('./lib/app_harness');
const RAW=readHtml();
// 節ごとに環境を作り直す（stub と記録が節をまたいで漏れないようにする）
function makeEnv(){const app=loadApp();return {env:app.ctx,els:app.els};}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== マークアップ（RAW） ===');
ok(/id="backup-nudge"[\s\S]*?display:none/.test(RAW),'M1 促しバナーは既定で非表示');
ok(RAW.indexOf('id="backup-nudge-do"')>=0&&RAW.indexOf('id="backup-nudge-later"')>=0,'M2 「バックアップする」「あとで」ボタン');
ok(RAW.indexOf('id="backup-nudge-msg"')>=0,'M3 文言領域');
ok(RAW.indexOf('class="no-print"')>=0&&/id="backup-nudge"[^>]*no-print/.test(RAW),'M4 印刷非表示');

console.log('=== 節目フック（RAW） ===');
ok(/verifyStartSavedForCandidates\(\[v\.candidateClassId\]\);\s*\n\s*if\(typeof promptMilestoneBackup[\s\S]{0,80}'start'/.test(RAW),'H1 クラス開始(startTournamentForClass)で start 促し');
ok(/renderTournament\(cls\);\s*\n\s*if\(typeof promptMilestoneBackup[\s\S]{0,80}'start'/.test(RAW),'H1b 部分開始(startClassPartial)で start 促し');
ok(/state\.results\[cls\]\.length>=roundsForClass\(cls\)[\s\S]{0,200}promptMilestoneBackup\('class:'\+cls/.test(RAW),'H2 クラス完走で class 促し');
ok(/isTournamentDone\(\)\)promptMilestoneBackup\('all'/.test(RAW),'H3 全クラス終了で all 促し');

console.log('=== 開閉ロジック ===');
var E=makeEnv();
E.env.promptMilestoneBackup('start','大会を開始しました');
ok(E.els['backup-nudge'].style.display==='flex','L1 促しでバナー表示');
ok(E.els['backup-nudge-msg'].innerHTML.indexOf('バックアップ')>=0,'L2 文言にバックアップ');
ok(typeof E.els['backup-nudge-do'].onclick==='function','L3 「バックアップする」に onclick 結線');
ok(typeof E.els['backup-nudge-later'].onclick==='function','L4 「あとで」に onclick 結線');
E.els['backup-nudge-later'].onclick();
ok(E.els['backup-nudge'].style.display==='none','L5 「あとで」で閉じる');
E.env.promptMilestoneBackup('start','再');     // 同じ節目key
ok(E.els['backup-nudge'].style.display==='none','L6 同じ節目は再表示しない（1回だけ）');
E.env.promptMilestoneBackup('class:A','Aクラスが終了しました');
ok(E.els['backup-nudge'].style.display==='flex','L7 別の節目key は表示する');
E.env.hideBackupNudge();
ok(E.els['backup-nudge'].style.display==='none','L8 hideBackupNudge で閉じる');

console.log('BACKUP-NUDGE: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
