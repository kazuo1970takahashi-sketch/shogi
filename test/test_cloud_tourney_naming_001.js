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
// NUMAZU-BEHAVIOR-001 (#840 ①・2026-08-11): 「月例」を含む名前を沼津へ集約する挙動を撤去したため、
//   期待値を反転させた（削除ではなく反転＝#835 と同じやり方）。日付サフィックス除去は維持される。
//   沼津の過去大会でこの形の生名は、一覧に生名のまま並ぶ（#840 受け入れ基準5・作者が許容）。
eq(E.canonicalizeCloudTournamentName('月例将棋大会2026-04'),'月例将棋大会','C1 埋込日付除去（月例集約は撤去済み＝生名を保つ）');
eq(E.canonicalizeCloudTournamentName('沼津支部月例将棋大会'),'沼津支部月例将棋大会','C2 既に正規名→同');
eq(E.canonicalizeCloudTournamentName(''),'沼津支部月例将棋大会','C3 空→既定');
// NUMAZU-BEHAVIOR-001 (#840 ①): 同上。末尾「報告書」除去は維持（受け入れ基準3）。
eq(E.canonicalizeCloudTournamentName('月例将棋大会 報告書'),'月例将棋大会','C4 報告書除去（月例集約は撤去済み＝生名を保つ）');
eq(E.canonicalizeCloudTournamentName('第10回沼津竜王戦'),'第10回沼津竜王戦','C5 非月例固有名→温存');
eq(E.canonicalizeCloudTournamentName('○○杯2026-04'),'○○杯','C6 固有名＋末尾日付→末尾除去して温存');
eq(E.canonicalizeCloudTournamentName('沼津支部月例将棋大会 2026年4月'),'沼津支部月例将棋大会','C7 末尾「YYYY年M月」除去→正規名');
// NUMAZU-BEHAVIOR-001 (#840 ①): 同上。全角括弧の日付サフィックス除去は維持（受け入れ基準3）。
eq(E.canonicalizeCloudTournamentName('月例大会（2026-04）'),'月例大会','C8 全角括弧日付除去（月例集約は撤去済み＝生名を保つ）');
// #657 P1: 裸の4桁数字は日付とみなさず温存（区切り/月成分が必須）
eq(E.canonicalizeCloudTournamentName('支部対抗戦2025'),'支部対抗戦2025','C9 [P1] 裸4桁は日付でない→温存');
eq(E.canonicalizeCloudTournamentName('○○杯2026'),'○○杯2026','C10 [P1] 裸4桁は日付でない→温存');
// #657 P2: 固有名が日付/報告書のみ→strip後空→月例既定（意図を固定）
eq(E.canonicalizeCloudTournamentName('2026-04'),'沼津支部月例将棋大会','C11 [P2] 日付のみ→空化→月例既定');
eq(E.canonicalizeCloudTournamentName('   '),'沼津支部月例将棋大会','C12 空白のみ→既定');

console.log('=== T: buildCloudTournamentDisplayTitle ===');
// NUMAZU-BEHAVIOR-001 (#840 ①): GOLDEN も反転。月度プレフィックスの付与自体は不変。
eq(E.buildCloudTournamentDisplayTitle('月例将棋大会2026-04','2026-04-15'),'2026年4月度 月例将棋大会','T1 合成（GOLDEN・月例集約は撤去済み）');
eq(E.buildCloudTournamentDisplayTitle('沼津支部月例将棋大会','2026-04-15'),'2026年4月度 沼津支部月例将棋大会','T2 正規名＋period');
eq(E.buildCloudTournamentDisplayTitle('第10回沼津竜王戦','2026-05-10'),'2026年5月度 第10回沼津竜王戦','T3 特別名は温存し前に月度');
eq(E.buildCloudTournamentDisplayTitle('沼津支部月例将棋大会',''),'沼津支部月例将棋大会','T4 日付欠損→base のみ（fail-soft）');
eq(E.buildCloudTournamentDisplayTitle('○○杯2026','2026-07-05'),'2026年7月度 ○○杯2026','T5 裸4桁温存＋月度');
// 二重付与ガード（#657 P2）: base 先頭に既に「YYYY年M月度」があれば period を重ねない
eq(E.buildCloudTournamentDisplayTitle('2026年4月度 特別戦','2026-04-15'),'2026年4月度 特別戦','T6 [P2] 先頭 period 重複を防ぐ');
eq(E.buildCloudTournamentDisplayTitle('','2026-04-15'),'2026年4月度 沼津支部月例将棋大会','T7 空名→月例既定＋月度');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
