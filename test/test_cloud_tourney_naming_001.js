#!/usr/bin/env node
// CLOUD-TOURNEY-NAMING-001 (#608) — クラウド過去大会一覧/詳細の表記統一（表示側正規化）純関数の検証。
//   buildMonthlyPeriodLabel（date の暦月→「YYYY年M月度」・fail-soft）／
//   canonicalizeCloudTournamentName（報告書/末尾日付除去・月例集約・固有名温存・#657 P1 区切り必須）／
//   buildCloudTournamentDisplayTitle（合成・二重付与ガード・日付欠損 fail-soft）。node で実走・GOLDEN pin。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function loadEnv(){
  const js=extractScripts(RAW);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { buildMonthlyPeriodLabel:buildMonthlyPeriodLabel, canonicalizeCloudTournamentName:canonicalizeCloudTournamentName, buildCloudTournamentDisplayTitle:buildCloudTournamentDisplayTitle };`);
  const noop=function(){};
  return fn({getElementById:function(){return null;},createElement:function(){return {};},head:{},body:{},addEventListener:noop},
            {innerWidth:1024,addEventListener:noop},
            {getItem:function(){return null;},setItem:noop,removeItem:noop},
            {randomUUID:function(){return '0';}},noop,function(){return true;},function(){return '';},noop,noop,
            {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:noop},
            {log:noop,warn:noop,error:noop},Promise,function(){return 0;},{});
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}
var E=loadEnv();

console.log('=== M: buildMonthlyPeriodLabel ===');
eq(E.buildMonthlyPeriodLabel('2026-04-15'),'2026年4月度','M1 4月度（先頭ゼロ無し）');
eq(E.buildMonthlyPeriodLabel('2026-12-01'),'2026年12月度','M2 12月度');
eq(E.buildMonthlyPeriodLabel('2026-01-31'),'2026年1月度','M3 1月度');
eq(E.buildMonthlyPeriodLabel(''),'','M4 空→空');
eq(E.buildMonthlyPeriodLabel('bad'),'','M5 パース不可→空');
eq(E.buildMonthlyPeriodLabel('2026-13-01'),'','M6 13月→空（範囲外）');
eq(E.buildMonthlyPeriodLabel('2026-00-01'),'','M7 0月→空（範囲外）');
eq(E.buildMonthlyPeriodLabel(null),'','M8 null→空');
eq(E.buildMonthlyPeriodLabel('2026-4-5'),'','M9 0詰め無し→空（YYYY-MM-DD 必須）');

console.log('=== C: canonicalizeCloudTournamentName ===');
// ★NUMAZU-BEHAVIOR-001 (#840・作者決定 2026-08-11「入れたものをそのまま出す」):
//   #608 の3整形（末尾「報告書」除去・末尾日付除去・「月例」→沼津名の集約）を**すべて外した**。
//   以下の期待値は削除ではなく**反転**させてある（#835 で pin を逆向きの番人にしたのと同じやり方）。
//   反転の理由は各行のコメントに残す。整形が復活したらここが落ちる＝再発の番人。
eq(E.canonicalizeCloudTournamentName('月例将棋大会2026-04'),'月例将棋大会2026-04','C1 [反転] 末尾日付も「月例」集約も効かない＝生名そのまま');
eq(E.canonicalizeCloudTournamentName('沼津支部月例将棋大会'),'沼津支部月例将棋大会','C2 既に正規名→同（不変）');
eq(E.canonicalizeCloudTournamentName(''),'(名称未設定)','C3 [反転] 空の既定は沼津名ではなく (名称未設定)＝記録に無い名前を画面が作らない');
eq(E.canonicalizeCloudTournamentName('月例将棋大会 報告書'),'月例将棋大会 報告書','C4 [反転] 末尾「報告書」も落とさない＝生名そのまま');
eq(E.canonicalizeCloudTournamentName('第10回沼津竜王戦'),'第10回沼津竜王戦','C5 非月例固有名→温存（不変）');
eq(E.canonicalizeCloudTournamentName('○○杯2026-04'),'○○杯2026-04','C6 [反転] 末尾日付を落とさない＝生名そのまま');
eq(E.canonicalizeCloudTournamentName('沼津支部月例将棋大会 2026年4月'),'沼津支部月例将棋大会 2026年4月','C7 [反転] 末尾「YYYY年M月」も落とさない');
eq(E.canonicalizeCloudTournamentName('月例大会（2026-04）'),'月例大会（2026-04）','C8 [反転] 全角括弧日付も落とさない');
eq(E.canonicalizeCloudTournamentName('支部対抗戦2025'),'支部対抗戦2025','C9 裸4桁は日付でない→温存（不変）');
eq(E.canonicalizeCloudTournamentName('○○杯2026'),'○○杯2026','C10 裸4桁は日付でない→温存（不変）');
eq(E.canonicalizeCloudTournamentName('2026-04'),'2026-04','C11 [反転] 日付だけの名前も打ったまま出す');
eq(E.canonicalizeCloudTournamentName('   '),'(名称未設定)','C12 [反転] 空白のみは空扱い→(名称未設定)');
// ★受け入れ基準1（#840）: allowlist 実装（特定文字列だけ素通し）で緑にならないことの担保。
//   「月例」を含む他クラブ名を4種、いずれも生名のまま返ること。
eq(E.canonicalizeCloudTournamentName('松本支部月例将棋大会'),'松本支部月例将棋大会','C13 他クラブ①＝生名そのまま');
eq(E.canonicalizeCloudTournamentName('〇〇将棋クラブ月例会'),'〇〇将棋クラブ月例会','C14 他クラブ②＝生名そのまま');
eq(E.canonicalizeCloudTournamentName('高崎こども将棋クラブ 月例戦'),'高崎こども将棋クラブ 月例戦','C15 他クラブ③＝生名そのまま');
eq(E.canonicalizeCloudTournamentName('MATSUMOTO月例CUP'),'MATSUMOTO月例CUP','C16 他クラブ④＝生名そのまま');
eq(E.canonicalizeCloudTournamentName('六月例会'),'六月例会','C17 「六月」＋「例会」の誤爆も無くなる');

console.log('=== T: buildCloudTournamentDisplayTitle ===');
eq(E.buildCloudTournamentDisplayTitle('月例将棋大会2026-04','2026-04-15'),'2026年4月度 月例将棋大会2026-04','T1 [反転] 合成（GOLDEN）＝生名に月度を前置するだけ');
eq(E.buildCloudTournamentDisplayTitle('沼津支部月例将棋大会','2026-04-15'),'2026年4月度 沼津支部月例将棋大会','T2 正規名＋period（不変＝きちんと入力した行は見た目が変わらない）');
eq(E.buildCloudTournamentDisplayTitle('第10回沼津竜王戦','2026-05-10'),'2026年5月度 第10回沼津竜王戦','T3 特別名は温存し前に月度（不変）');
eq(E.buildCloudTournamentDisplayTitle('沼津支部月例将棋大会',''),'沼津支部月例将棋大会','T4 日付欠損→base のみ（fail-soft・不変）');
eq(E.buildCloudTournamentDisplayTitle('○○杯2026','2026-07-05'),'2026年7月度 ○○杯2026','T5 裸4桁温存＋月度（不変）');
eq(E.buildCloudTournamentDisplayTitle('2026年4月度 特別戦','2026-04-15'),'2026年4月度 特別戦','T6 先頭 period 重複を防ぐ（不変）');
eq(E.buildCloudTournamentDisplayTitle('','2026-04-15'),'2026年4月度 (名称未設定)','T7 [反転] 空名→(名称未設定)＋月度');
eq(E.buildCloudTournamentDisplayTitle('松本支部月例将棋大会','2026-08-09'),'2026年8月度 松本支部月例将棋大会','T8 他クラブの月例会が沼津名に化けない（本 issue の主症状）');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
