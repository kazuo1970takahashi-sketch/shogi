#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-2a — ローカル state → クラウド upsert ペイロード純マッピング検証。
//   buildCloudSyncPayload（global state + master）/ deriveSeason。ネットワーク・UI 無し（B-2b 分離）。
//   観点: season導出 / tournament(app_tournament_id,season,status,source,name,date) /
//         members・players の member_id 重複排除＋master由来 name/yomi /
//         entries の wins=A・losses=played-A・sos=B・sodos=C・final_rank / 名簿未紐付けは skipped /
//         opts.clubId スタンプ。入力は完全架空。当日運営テストへ非干渉（純追加関数）。
const fs=require('fs');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function makeNode(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_attrs:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};
  var doc={getElementById:function(id){if(!el[id]){var n=makeNode('div');n.id=id;el[id]=n;}return el[id];},createElement:function(t){return makeNode(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:makeNode('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
const target=process.argv[2]; if(!target){console.error('usage: node test_stageb_payload.js <html>');process.exit(1);}
function loadEnv(){
  const ctx=makeContext(); const js=extractScripts(target);
  const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { buildCloudSyncPayload:buildCloudSyncPayload, deriveSeason:deriveSeason, _setState:function(s){ state=s; } };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();

console.log('=== S: deriveSeason（4月始まり年度）===');
ok(env.deriveSeason('2026-06-14')==='2026年度','S1 6月→2026年度');
ok(env.deriveSeason('2026-04-01')==='2026年度','S2 4/1→2026年度（年度始まり）');
ok(env.deriveSeason('2026-03-31')==='2025年度','S3 3/31→2025年度（前年度末）');
ok(env.deriveSeason('2027-02-01')==='2026年度','S4 翌2月→2026年度');
ok(env.deriveSeason('')==='','S5 空は空');

function mkState(){
  return { tournament_id:'t-b2', rounds:1,
    classes:[{id:'A',name:'A'},{id:'B',name:'B'}],
    players:{ A:[
      {id:'a1',name:'甲',yomi:'こう',cls:'A',member_id:'m_a1'},
      {id:'a2',name:'乙',yomi:'おつ',cls:'A',member_id:'m_a2'},
      {id:'a3',name:'丙',cls:'A'} // member_id 無し→skipped
    ], B:[] },
    results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]], B:[] },
    report:{ date:'2026-06-14', title:'六月例会' } };
}
const master={ schema_version:1, members:[
  {id:'m_a1',name:'甲',yomi:'こう',branch:'沼津'},
  {id:'m_a2',name:'乙',yomi:'おつ'}
]};

console.log('=== T: tournament ペイロード ===');
env._setState(mkState());
var pl=env.buildCloudSyncPayload(master);
ok(pl.tournament.app_tournament_id==='t-b2','T1 app_tournament_id=state.tournament_id');
ok(pl.tournament.season==='2026年度','T2 season 導出');
ok(pl.tournament.status==='confirmed','T3 status=confirmed');
ok(pl.tournament.source==='app_sync','T4 source=app_sync');
ok(pl.tournament.date==='2026-06-14','T5 date');
ok(String(pl.tournament.name).indexOf('六月例会')>=0,'T6 name に大会名');

console.log('=== M/P: members / players（重複排除・master由来）===');
ok(pl.members.length===2,'M1 members は2件（m_a1/m_a2）');
var ma1=pl.members.filter(function(m){return m.member_id==='m_a1';})[0];
ok(ma1&&ma1.name==='甲'&&ma1.yomi==='こう'&&ma1.branch==='沼津','M2 master 由来の name/yomi/branch');
ok(pl.players.length===2,'P1 players は2件');

console.log('=== E: entries（A/B/C 対応・final_rank）===');
ok(pl.entries.length===2,'E1 entries は2件（紐付けありのみ）');
var e1=pl.entries.filter(function(e){return e.member_id==='m_a1';})[0];
var e2=pl.entries.filter(function(e){return e.member_id==='m_a2';})[0];
ok(e1&&e1.wins===1&&e1.losses===0,'E2 a1 wins=1/losses=0');
ok(e1&&e1.sos===0&&e1.sodos===0,'E3 a1 sos=B/sodos=C');
ok(e1&&e1['class']==='A','E4 class=A');
ok(e1&&e1.final_rank===1,'E5 a1 final_rank=1');
ok(e2&&e2.wins===0&&e2.losses===1&&e2.final_rank===2,'E6 a2 wins=0/losses=1/rank=2');
ok(e1&&e1.participated===true&&e1.draws===0,'E7 participated=true/draws=0');

console.log('=== K: skipped（名簿未紐付け）===');
ok(pl.skipped.indexOf('丙')>=0,'K1 member_id 無しの丙は skipped');
ok(pl.entries.filter(function(e){return e.member_id==null;}).length===0,'K2 entries に未紐付けは入らない');

console.log('=== C: clubId スタンプ ===');
env._setState(mkState());
var pl2=env.buildCloudSyncPayload(master,{clubId:'club-1'});
ok(pl2.tournament.club_id==='club-1','C1 tournament に club_id');
ok(pl2.members[0].club_id==='club-1'&&pl2.players[0].club_id==='club-1','C2 members/players に club_id');
ok(pl2.entries[0].club_id==='club-1','C3 entries に club_id');
ok(pl.tournament.club_id===undefined,'C4 clubId 未指定なら付与しない');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
