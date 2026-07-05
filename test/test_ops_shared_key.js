#!/usr/bin/env node
// OPS-SHARED-KEY-REDESIGN-001 Phase A (#580) — 運営共通キー純関数の検証。
//   generateOpsSharedKey（4桁性・衝突回避・rng注入・線形走査fallback）／
//   opsKeyToTournamentId（t_YYYY_MM_DD_<key> 組立・不正入力→''・normalizeTournamentIdInput 受理）／
//   tournamentIdToOpsKey（末尾4桁抽出・日付のみ/2桁suffixは''）／往復。node で実走。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},select:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var head=n('head');
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];},execCommand:function(){return true;}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { generateOpsSharedKey:generateOpsSharedKey, opsKeyToTournamentId:opsKeyToTournamentId, tournamentIdToOpsKey:tournamentIdToOpsKey, normalizeTournamentIdInput:normalizeTournamentIdInput };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{});
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
var E=loadEnv();

console.log('=== G: generateOpsSharedKey ===');
ok(/^\d{4}$/.test(E.generateOpsSharedKey([])),'G1 4桁数字文字列を返す');
ok(E.generateOpsSharedKey([],function(){return 0;})==='0000','G2 rng=0→0000');
ok(E.generateOpsSharedKey(['0000'],function(){return 0;})==='0001','G3 使用済み0000回避→0001');
ok(E.generateOpsSharedKey([0,1],function(){return 0;})==='0002','G4 existing は4桁正規化（0,1→0000,0001回避）');
var manyUsed=[]; for(var i=0;i<9999;i++){manyUsed.push(('0000'+i).slice(-4));}
ok(E.generateOpsSharedKey(manyUsed,function(){return 0;})==='9999','G5 ほぼ満杯でも線形走査で唯一の空き9999');
ok(E.generateOpsSharedKey([],function(){return 0.4821;})==='4821','G6 rng=0.4821→4821');

console.log('=== K: opsKeyToTournamentId ===');
ok(E.opsKeyToTournamentId('4821','2026-07-05')==='t_2026_07_05_4821','K1 正常組立');
ok(E.opsKeyToTournamentId('0000','2026-07-05')==='t_2026_07_05_0000','K2 0000 も可');
ok(E.opsKeyToTournamentId('482','2026-07-05')==='','K3 3桁は不可→空');
ok(E.opsKeyToTournamentId('48210','2026-07-05')==='','K4 5桁は不可→空');
ok(E.opsKeyToTournamentId('4a21','2026-07-05')==='','K5 数字以外→空');
ok(E.opsKeyToTournamentId('4821','20260705')==='','K6 YYYYMMDD形は不可（YYYY-MM-DD必須）→空');
ok(E.opsKeyToTournamentId('4821','2026-7-5')==='','K7 0詰め無し日付→空');
ok(E.opsKeyToTournamentId('4821',null)==='','K8 ymd null→空');
ok(E.opsKeyToTournamentId(null,'2026-07-05')==='','K9 key null→空');
ok(E.normalizeTournamentIdInput(E.opsKeyToTournamentId('4821','2026-07-05'))==='t_2026_07_05_4821','K10 組立IDは normalizeTournamentIdInput 受理');

console.log('=== T: tournamentIdToOpsKey ===');
ok(E.tournamentIdToOpsKey('t_2026_07_05_4821')==='4821','T1 末尾4桁抽出');
ok(E.tournamentIdToOpsKey('t_2026_07_05')==='','T2 日付のみ（キー無し）→空');
ok(E.tournamentIdToOpsKey('t_2026_07_05_2')==='','T3 1桁suffixは運営共通キーでない→空');
ok(E.tournamentIdToOpsKey('t_2026_07_05_48')==='','T4 2桁suffixは運営共通キーでない→空');
ok(E.tournamentIdToOpsKey('t_2026_07_05_48210')==='','T5 5桁suffix→空');
ok(E.tournamentIdToOpsKey('')==='' && E.tournamentIdToOpsKey(null)==='','T6 空/null→空');

console.log('=== RT: 往復（key→id→key）===');
ok(E.tournamentIdToOpsKey(E.opsKeyToTournamentId('4821','2026-07-05'))==='4821','RT1 key→id→key で戻る');
ok(E.tournamentIdToOpsKey(E.opsKeyToTournamentId('0007','2026-12-31'))==='0007','RT2 別値でも往復一致');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
