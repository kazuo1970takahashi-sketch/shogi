#!/usr/bin/env node
// MASTER-REBUILD-FROM-CLOUD-001 (#551 Phase 1): 端末クリーン運用でクラウドから名簿を完全再構築する
//   純関数 2 本（buildDerivedMemberStatsFromCloud / mergeDerivedStatsIntoMaster）の単体テスト。
//   設計 v2（docs/specs/20260704_master_rebuild_from_cloud_001_design.md §2・§3・§6 Phase 1）準拠。
//   観点:
//     BUILD-BASIC  entries→member_id 結合で last_class/last_attended/first_attended/tournament_ids を導出。
//     BUILD-NONAB  最新大会の class が非 A/B → last_class=null（#273 不変条件）。
//     BUILD-DATENULL date 無効の大会は日付導出から除外・tie-break/last_class には算入。
//     BUILD-TIEBREAK 同日複数大会は app_tournament_id 昇順の最後を最新（決定的）。
//     BUILD-APPTIDNULL app_tournament_id NULL の大会は tournament_ids へ入れない（date/last_class は算入）。
//     MERGE-EMPTY   ローカル tournament_ids 空 → 導出値で全上書き。
//     MERGE-NEWER   ローカル非空＋導出が新しい date → last_class/last_attended 上書き・union。
//     MERGE-NOROLLBACK ローカル非空＋導出が古い date → last_* は巻き戻さない・union は行う。
//     MERGE-UNION   tournament_ids 和集合・attendance_count は length 再計算。
//     MERGE-UNTOUCH 氏名/ふりがな/削除状態は不変。
//     MERGE-NOSTAT  導出に現れない会員は不変。
//   完全架空データのみ（架空 …）。runtime（shogi_v4.html）以外は無改変。

const fs = require('fs');
const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_master_rebuild_from_cloud_001.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}
function makeContext(){
  const elements={};
  function makeNode(tag){
    return {nodeType:1,tagName:String(tag||'div'),id:'',className:'',value:'',innerHTML:'',
      disabled:false,checked:false,type:'',style:{},_attrs:{},childNodes:[],_listeners:{},
      focus:function(){},blur:function(){},click:function(){},
      appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},remove:function(){},
      setAttribute:function(k,v){this._attrs[k]=String(v);},getAttribute:function(k){return (k in this._attrs)?this._attrs[k]:null;},
      addEventListener:function(){},removeEventListener:function(){},
      querySelector:function(){return null;},querySelectorAll:function(){return [];}};
  }
  const docMock={getElementById:function(id){if(!elements[id]){const n=makeNode('div');n.id=id;elements[id]=n;}return elements[id];},
    createElement:function(tag){return makeNode(tag);},createTextNode:function(t){return {nodeType:3,textContent:String(t==null?'':t)};},
    body:makeNode('body'),addEventListener:function(){},removeEventListener:function(){},
    querySelector:function(){return null;},querySelectorAll:function(){return [];}};
  const winMock={innerWidth:1024,addEventListener:function(){},removeEventListener:function(){},
    open:function(){return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}};}};
  const localStorageMock={_:{},getItem:function(k){return (k in this._)?this._[k]:null;},
    setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return {document:docMock,window:winMock,localStorage:localStorageMock};
}
function loadEnv(){
  const ctx=makeContext();
  const consoleMock={log:function(){},error:function(){},warn:function(){}};
  const cryptoMock={randomUUID(){return '00000000-0000-4000-8000-000000000000';}};
  const js=extractScripts(RAW);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       buildDerivedMemberStatsFromCloud:buildDerivedMemberStatsFromCloud,
       mergeDerivedStatsIntoMaster:mergeDerivedStatsIntoMaster,
       isValidYmd:(typeof isValidYmd==='function')?isValidYmd:null
     };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,
    function(){},function(){return true;},function(){return '';},
    function(){},function(){return null;},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock,Promise,function(){});
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}
function member(id,over){return Object.assign({id:id,name:'架空'+id,yomi:'かくう',last_class:null,last_attended:'',first_attended:'',
  attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},over||{});}

const env=loadEnv();
assert(typeof env.buildDerivedMemberStatsFromCloud==='function','SETUP buildDerivedMemberStatsFromCloud が存在');
assert(typeof env.mergeDerivedStatsIntoMaster==='function','SETUP mergeDerivedStatsIntoMaster が存在');

// ============================================================
// BUILD-BASIC: 2 会員・2 大会。member_id 結合で導出。
// ============================================================
{
  var tournaments=[
    {id:'T1',app_tournament_id:'t_2026_05_10',date:'2026-05-10',season:'2026'},
    {id:'T2',app_tournament_id:'t_2026_06_14',date:'2026-06-14',season:'2026'}
  ];
  var players=[{id:'P1',member_id:'mA'},{id:'P2',member_id:'mB'}];
  var entries=[
    {tournament_id:'T1',player_id:'P1','class':'A'},
    {tournament_id:'T2',player_id:'P1','class':'B'},
    {tournament_id:'T1',player_id:'P2','class':'B'}
  ];
  var stats=env.buildDerivedMemberStatsFromCloud(tournaments,players,entries);
  assert(stats.mA&&stats.mA.last_class==='B','BUILD-BASIC-1 mA 最新(6/14)は B クラス');
  assert(stats.mA.last_attended==='2026-06-14','BUILD-BASIC-2 mA last_attended=最新大会 date');
  assert(stats.mA.first_attended==='2026-05-10','BUILD-BASIC-3 mA first_attended=最古 date');
  assert(stats.mA.tournament_ids.length===2&&stats.mA.tournament_ids.indexOf('t_2026_05_10')>=0&&stats.mA.tournament_ids.indexOf('t_2026_06_14')>=0,'BUILD-BASIC-4 mA tournament_ids に両大会');
  assert(stats.mB&&stats.mB.last_class==='B'&&stats.mB.last_attended==='2026-05-10'&&stats.mB.tournament_ids.length===1,'BUILD-BASIC-5 mB は 1 大会・B');
}

// ============================================================
// BUILD-NONAB: 最新大会 class が非 A/B → last_class=null。
// ============================================================
{
  var tournaments=[
    {id:'T1',app_tournament_id:'t_2026_05_10',date:'2026-05-10'},
    {id:'T2',app_tournament_id:'t_2026_06_14',date:'2026-06-14'}
  ];
  var players=[{id:'P1',member_id:'mC'}];
  var entries=[
    {tournament_id:'T1',player_id:'P1','class':'A'},
    {tournament_id:'T2',player_id:'P1','class':'C'}   // 最新が C
  ];
  var stats=env.buildDerivedMemberStatsFromCloud(tournaments,players,entries);
  assert(stats.mC.last_class===null,'BUILD-NONAB-1 最新 class=C → last_class=null');
  assert(stats.mC.last_attended==='2026-06-14','BUILD-NONAB-2 last_attended は最新大会（非 A/B でも date は採用）');
}

// ============================================================
// BUILD-DATENULL: date 無効の大会は日付導出から除外・tie-break/last_class には算入。
// ============================================================
{
  var tournaments=[
    {id:'T1',app_tournament_id:'t_2026_05_10',date:'2026-05-10'},
    {id:'T2',app_tournament_id:'t_nodate',date:''}       // date 無効
  ];
  var players=[{id:'P1',member_id:'mD'}];
  var entries=[
    {tournament_id:'T1',player_id:'P1','class':'A'},
    {tournament_id:'T2',player_id:'P1','class':'B'}
  ];
  var stats=env.buildDerivedMemberStatsFromCloud(tournaments,players,entries);
  // '' date は先頭にソート → 最新は T1(2026-05-10,A)
  assert(stats.mD.last_class==='A','BUILD-DATENULL-1 date 無効大会は先頭ソート・最新=有効 date 大会');
  assert(stats.mD.last_attended==='2026-05-10','BUILD-DATENULL-2 last_attended は有効 date のみ');
  assert(stats.mD.first_attended==='2026-05-10','BUILD-DATENULL-3 first_attended は date 無効を除外');
  assert(stats.mD.tournament_ids.length===2,'BUILD-DATENULL-4 tournament_ids には両方（app_tid 有効）算入');
}

// ============================================================
// BUILD-TIEBREAK: 同日 2 大会 → app_tournament_id 昇順の最後を最新（決定的）。
// ============================================================
{
  var tournaments=[
    {id:'T1',app_tournament_id:'t_2026_06_14',date:'2026-06-14'},
    {id:'T2',app_tournament_id:'t_2026_06_14_2',date:'2026-06-14'}  // 同日・app_tid 大
  ];
  var players=[{id:'P1',member_id:'mE'}];
  var entries=[
    {tournament_id:'T1',player_id:'P1','class':'A'},
    {tournament_id:'T2',player_id:'P1','class':'B'}   // app_tid 大 → 最新
  ];
  var stats1=env.buildDerivedMemberStatsFromCloud(tournaments,players,entries);
  var stats2=env.buildDerivedMemberStatsFromCloud(tournaments.slice().reverse(),players,entries.slice().reverse());
  assert(stats1.mE.last_class==='B','BUILD-TIEBREAK-1 同日は app_tid 昇順の最後(=_2)を最新→B');
  assert(stats2.mE.last_class==='B','BUILD-TIEBREAK-2 入力順を変えても結果は不変（決定的）');
}

// ============================================================
// BUILD-APPTIDNULL: app_tournament_id NULL(manual/json_import) は tournament_ids へ入れない。
//   ただし date/last_class の導出には算入（attendance_count が過少になり得る旨は仕様）。
// ============================================================
{
  var tournaments=[
    {id:'T1',app_tournament_id:'t_2026_05_10',date:'2026-05-10'},
    {id:'T2',app_tournament_id:null,date:'2026-06-14'}   // NULL app_tid・最新 date
  ];
  var players=[{id:'P1',member_id:'mF'}];
  var entries=[
    {tournament_id:'T1',player_id:'P1','class':'B'},
    {tournament_id:'T2',player_id:'P1','class':'A'}
  ];
  var stats=env.buildDerivedMemberStatsFromCloud(tournaments,players,entries);
  assert(stats.mF.last_class==='A','BUILD-APPTIDNULL-1 NULL app_tid でも最新 date の class を算入');
  assert(stats.mF.last_attended==='2026-06-14','BUILD-APPTIDNULL-2 NULL app_tid の date も last_attended に算入');
  assert(stats.mF.tournament_ids.length===1&&stats.mF.tournament_ids[0]==='t_2026_05_10','BUILD-APPTIDNULL-3 tournament_ids には NULL app_tid を入れない（skip）');
}

// ============================================================
// MERGE-EMPTY: ローカル tournament_ids 空 → 導出値で全上書き。
// ============================================================
{
  var master={schema_version:1,updated_at:'x',members:[member('mA',{last_class:null,last_attended:'',first_attended:''})]};
  var stats={mA:{member_id:'mA',last_class:'A',last_attended:'2026-06-14',first_attended:'2026-01-11',tournament_ids:['t_2026_01_11','t_2026_06_14']}};
  var r=env.mergeDerivedStatsIntoMaster(master,stats);
  var m=master.members[0];
  assert(m.last_class==='A'&&m.last_attended==='2026-06-14'&&m.first_attended==='2026-01-11','MERGE-EMPTY-1 空ローカルは導出値で全上書き');
  assert(m.tournament_ids.length===2&&m.attendance_count===2,'MERGE-EMPTY-2 tournament_ids/attendance_count 反映');
  assert(r.updated===1,'MERGE-EMPTY-3 updated 件数=1');
}

// ============================================================
// MERGE-NEWER: ローカル非空＋導出が新しい date → last_* 上書き・union。
// ============================================================
{
  var master={schema_version:1,updated_at:'x',members:[member('mA',{last_class:'B',last_attended:'2026-03-08',first_attended:'2026-03-08',
    tournament_ids:['t_2026_03_08'],attendance_count:1})]};
  var stats={mA:{member_id:'mA',last_class:'A',last_attended:'2026-06-14',first_attended:'2026-01-11',tournament_ids:['t_2026_01_11','t_2026_06_14']}};
  env.mergeDerivedStatsIntoMaster(master,stats);
  var m=master.members[0];
  assert(m.last_class==='A'&&m.last_attended==='2026-06-14','MERGE-NEWER-1 導出が新しい→last_class/last_attended 上書き');
  assert(m.first_attended==='2026-01-11','MERGE-NEWER-2 より古い first_attended を採用');
  assert(m.tournament_ids.length===3&&m.attendance_count===3,'MERGE-NEWER-3 tournament_ids 和集合・count 再計算');
}

// ============================================================
// MERGE-NOROLLBACK: ローカル非空＋導出が古い date → last_* 巻き戻さない・union は行う。
// ============================================================
{
  var master={schema_version:1,updated_at:'x',members:[member('mA',{last_class:'A',last_attended:'2026-06-14',first_attended:'2026-06-14',
    tournament_ids:['t_2026_06_14'],attendance_count:1})]};
  var stats={mA:{member_id:'mA',last_class:'B',last_attended:'2026-03-08',first_attended:'2026-03-08',tournament_ids:['t_2026_03_08']}};
  env.mergeDerivedStatsIntoMaster(master,stats);
  var m=master.members[0];
  assert(m.last_class==='A'&&m.last_attended==='2026-06-14','MERGE-NOROLLBACK-1 導出が古い→last_* 巻き戻さない（☁未送信の直近実績を保持）');
  assert(m.first_attended==='2026-03-08','MERGE-NOROLLBACK-2 より古い first_attended は採用');
  assert(m.tournament_ids.length===2&&m.attendance_count===2,'MERGE-NOROLLBACK-3 union は行う');
}

// ============================================================
// MERGE-UNION: 重複除去・順序（ローカル既存→導出の新規）。
// ============================================================
{
  var master={schema_version:1,updated_at:'x',members:[member('mA',{last_attended:'2026-06-14',first_attended:'2026-05-10',
    tournament_ids:['t_2026_05_10','t_2026_06_14'],attendance_count:2})]};
  var stats={mA:{member_id:'mA',last_class:'A',last_attended:'2026-06-14',first_attended:'2026-05-10',tournament_ids:['t_2026_06_14','t_2026_07_12']}};
  env.mergeDerivedStatsIntoMaster(master,stats);
  var m=master.members[0];
  assert(m.tournament_ids.length===3,'MERGE-UNION-1 重複除去で 3 件');
  assert(m.tournament_ids[0]==='t_2026_05_10'&&m.tournament_ids[2]==='t_2026_07_12','MERGE-UNION-2 順序=ローカル既存→導出新規');
  assert(m.attendance_count===3,'MERGE-UNION-3 attendance_count=union length');
}

// ============================================================
// MERGE-UNTOUCH: 氏名/ふりがな/削除状態は不変。
// ============================================================
{
  var master={schema_version:1,updated_at:'x',members:[member('mA',{name:'架空太郎',yomi:'かくうたろう',deleted:true,deleted_at:'2026-01-01T00:00:00Z'})]};
  var stats={mA:{member_id:'mA',last_class:'A',last_attended:'2026-06-14',first_attended:'2026-06-14',tournament_ids:['t_2026_06_14']}};
  env.mergeDerivedStatsIntoMaster(master,stats);
  var m=master.members[0];
  assert(m.name==='架空太郎'&&m.yomi==='かくうたろう'&&m.deleted===true&&m.deleted_at==='2026-01-01T00:00:00Z','MERGE-UNTOUCH-1 氏名/ふりがな/削除状態は不変');
}

// ============================================================
// MERGE-NOSTAT: 導出に現れない会員は不変・updated に数えない。
// ============================================================
{
  var master={schema_version:1,updated_at:'x',members:[
    member('mA',{last_class:'B',last_attended:'2026-06-14',tournament_ids:['t_2026_06_14'],attendance_count:1}),
    member('mZ',{last_class:'A',last_attended:'2026-05-10',tournament_ids:['t_2026_05_10'],attendance_count:1})
  ]};
  var stats={mA:{member_id:'mA',last_class:'A',last_attended:'2026-07-12',first_attended:'2026-06-14',tournament_ids:['t_2026_07_12']}};
  var r=env.mergeDerivedStatsIntoMaster(master,stats);
  var mZ=master.members[1];
  assert(mZ.last_class==='A'&&mZ.last_attended==='2026-05-10'&&mZ.tournament_ids.length===1,'MERGE-NOSTAT-1 導出に無い mZ は不変');
  assert(r.updated===1,'MERGE-NOSTAT-2 updated は mA のみ=1');
}

// ============================================================
// ROBUST: 破損・空入力で throw しない。
// ============================================================
{
  var ok1=true;
  try{
    env.buildDerivedMemberStatsFromCloud(null,null,null);
    env.buildDerivedMemberStatsFromCloud([{}],[{}],[{}]);
    env.mergeDerivedStatsIntoMaster(null,null);
    env.mergeDerivedStatsIntoMaster({members:null},[]);
  }catch(e){ok1=false;}
  assert(ok1,'ROBUST-1 null/破損入力でも throw しない（fail-soft）');
}

console.log('MASTER-REBUILD-FROM-CLOUD-001 Phase1: pass='+pass+' fail='+fail);
process.exit(fail>0?1:0);
