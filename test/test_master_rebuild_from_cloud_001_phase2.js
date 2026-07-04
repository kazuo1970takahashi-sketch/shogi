#!/usr/bin/env node
// MASTER-REBUILD-FROM-CLOUD-001 (#551 Phase 2): pull→導出→保存の in-memory オーケストレーション
//   rebuildMasterFromCloud(client,{clubId}) の単体テスト（mock client・throw しない・{ok,counts} 型）。
//   設計 v2（docs/specs/20260704_master_rebuild_from_cloud_001_design.md §2）準拠。
//   観点:
//     GUARD-INIT   client 未接続/clubId 不在 → {ok:false,step:init/club}（fetch しない）。
//     BASIC        members(空履歴)→tournaments/players/entries 結合で last_class/最終参加/tournament_ids を反映・saved=true。
//     COUNTS       counts{members,tournaments,players,entries,historyUpdated} が実データと一致。
//     NOCHANGE     導出が既存と一致 → historyUpdated=0・saveBranchMaster を呼ばない（saved=false）。
//     CHUNK        tournament の DB id が 100 超 → entries を 100 件チャンクで分割取得し全連結。
//     FAIL-MEMBERS members fetch error → {ok:false,step:members}。
//     FAIL-TOURN   tournaments fetch error → {ok:false,step:tournaments}。
//     FAIL-ENTRIES entries fetch error → {ok:false,step:entries}。
//     THROW        query が reject → 外側 catch で {ok:false,step:exception}（throw しない）。
//   完全架空データのみ。runtime（shogi_v4.html）以外は無改変。

const fs = require('fs');
const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_master_rebuild_from_cloud_001_phase2.js <html>');process.exit(1);}
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
       rebuildMasterFromCloud:(typeof rebuildMasterFromCloud==='function')?rebuildMasterFromCloud:null,
       _fetchCloudEntriesChunked:(typeof _fetchCloudEntriesChunked==='function')?_fetchCloudEntriesChunked:null,
       saveBranchMaster:(typeof saveBranchMaster==='function')?saveBranchMaster:null,
       loadBranchMaster:(typeof loadBranchMaster==='function')?loadBranchMaster:null
     };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,
    function(){},function(){return true;},function(){return '';},
    function(){},function(){return null;},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock,Promise,function(cb){return cb&&cb();});
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// ---- mock Supabase client -------------------------------------------------
// resp(table, ctx) → {data,error} を返す設定関数。ctx.ids は entries の .in() 引数。
// throwTables に含まれる table は .then で reject（例外経路の検証）。
function makeClient(resp, counters){
  counters=counters||{};
  function builder(table){
    var st={table:table, ids:null};
    var b={
      select:function(){return b;},
      eq:function(){return b;},
      in:function(col,ids){st.ids=ids; if(table==='entries')counters.entriesCalls=(counters.entriesCalls||0)+1; return b;},
      then:function(onF,onR){
        return new Promise(function(resolve){ resolve(resp(table, st)); }).then(onF,onR);
      }
    };
    return b;
  }
  return { from:function(table){return builder(table);}, auth:{}, rpc:function(){return Promise.resolve({data:[]});} };
}

function member(id,over){return Object.assign({id:id,name:'架空'+id,yomi:'かくう',last_class:null,last_attended:'',first_attended:'',
  attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},over||{});}

async function run(){
  const env=loadEnv();
  assert(typeof env.rebuildMasterFromCloud==='function','SETUP rebuildMasterFromCloud が存在');
  assert(typeof env._fetchCloudEntriesChunked==='function','SETUP _fetchCloudEntriesChunked が存在');

  // ---- GUARD-INIT ----
  {
    var r1=await env.rebuildMasterFromCloud(null,{clubId:'club1'});
    assert(r1&&r1.ok===false&&r1.step==='init','GUARD-INIT-1 client 未接続 → step=init');
    var r2=await env.rebuildMasterFromCloud({from:function(){}},{});
    assert(r2&&r2.ok===false&&r2.step==='club','GUARD-INIT-2 clubId 不在 → step=club');
  }

  // ---- BASIC + COUNTS ----
  {
    env.saveBranchMaster({schema_version:1,updated_at:'x',members:[member('mA'),member('mB')]});
    var cloudMembers=[{member_id:'mA',name:'架空mA',yomi:'かくう'},{member_id:'mB',name:'架空mB',yomi:'かくう'}];
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
    var resp=function(table,st){
      if(table==='members')return {data:cloudMembers};
      if(table==='tournaments')return {data:tournaments};
      if(table==='players')return {data:players};
      if(table==='entries'){var out=[];for(var i=0;i<entries.length;i++){if(st.ids.indexOf(entries[i].tournament_id)>=0)out.push(entries[i]);}return {data:out};}
      return {data:[]};
    };
    var res=await env.rebuildMasterFromCloud(makeClient(resp),{clubId:'club1'});
    assert(res&&res.ok===true,'BASIC-1 ok=true');
    assert(res.saved===true,'BASIC-2 履歴変更あり → saved=true');
    var mA=res.master.members[0], mB=res.master.members[1];
    assert(mA.last_class==='B'&&mA.last_attended==='2026-06-14','BASIC-3 mA 最新(6/14 B)を反映');
    assert(mA.first_attended==='2026-05-10','BASIC-4 mA first_attended=最古');
    assert(mA.tournament_ids.length===2,'BASIC-5 mA tournament_ids に両大会');
    assert(mB.last_class==='B'&&mB.tournament_ids.length===1,'BASIC-6 mB は 1 大会 B');
    var c=res.counts||{};
    assert(c.members===2&&c.tournaments===2&&c.players===2&&c.entries===3,'COUNTS-1 members/tournaments/players/entries が実データ一致');
    assert(c.historyUpdated===2,'COUNTS-2 historyUpdated=2（mA/mB 反映）');
  }

  // ---- NOCHANGE: 導出が既存と一致 → historyUpdated=0・saved=false ----
  {
    env.saveBranchMaster({schema_version:1,updated_at:'x',members:[member('mA',{last_class:'B',last_attended:'2026-06-14',
      first_attended:'2026-05-10',tournament_ids:['t_2026_05_10','t_2026_06_14'],attendance_count:2})]});
    var tournaments=[
      {id:'T1',app_tournament_id:'t_2026_05_10',date:'2026-05-10'},
      {id:'T2',app_tournament_id:'t_2026_06_14',date:'2026-06-14'}
    ];
    var players=[{id:'P1',member_id:'mA'}];
    var entries=[{tournament_id:'T1',player_id:'P1','class':'A'},{tournament_id:'T2',player_id:'P1','class':'B'}];
    var resp=function(table,st){
      if(table==='members')return {data:[]};
      if(table==='tournaments')return {data:tournaments};
      if(table==='players')return {data:players};
      if(table==='entries'){var out=[];for(var i=0;i<entries.length;i++){if(st.ids.indexOf(entries[i].tournament_id)>=0)out.push(entries[i]);}return {data:out};}
      return {data:[]};
    };
    var res=await env.rebuildMasterFromCloud(makeClient(resp),{clubId:'club1'});
    assert(res.ok===true,'NOCHANGE-1 ok=true');
    assert(res.counts.historyUpdated===0,'NOCHANGE-2 導出一致 → historyUpdated=0');
    assert(res.saved===false,'NOCHANGE-3 無変更 → saveBranchMaster 呼ばず saved=false');
  }

  // ---- CHUNK: tournament 150 件 → entries を 100+50 の 2 チャンクで取得し全連結 ----
  {
    env.saveBranchMaster({schema_version:1,updated_at:'x',members:[member('mA')]});
    var tournaments=[], players=[{id:'P1',member_id:'mA'}], entries=[];
    for(var i=0;i<150;i++){
      var mm=(i<9?'0':'')+(i+1);
      var mon=(i%12)+1; var mstr=(mon<10?'0':'')+mon;
      tournaments.push({id:'TID'+i,app_tournament_id:'t_2026_'+mstr+'_'+((i%28<9?'0':'')+((i%28)+1))+'_'+i,date:'2026-'+mstr+'-01'});
      entries.push({tournament_id:'TID'+i,player_id:'P1','class':'A'});
    }
    var counters={};
    var resp=function(table,st){
      if(table==='members')return {data:[]};
      if(table==='tournaments')return {data:tournaments};
      if(table==='players')return {data:players};
      if(table==='entries'){var out=[];for(var k=0;k<entries.length;k++){if(st.ids.indexOf(entries[k].tournament_id)>=0)out.push(entries[k]);}return {data:out};}
      return {data:[]};
    };
    var res=await env.rebuildMasterFromCloud(makeClient(resp,counters),{clubId:'club1'});
    assert(res.ok===true,'CHUNK-1 ok=true');
    assert(res.counts.entries===150,'CHUNK-2 entries 150 件を全連結');
    assert(counters.entriesCalls===2,'CHUNK-3 entries は 100+50 の 2 チャンクで取得');
    assert(res.master.members[0].tournament_ids.length===150,'CHUNK-4 mA tournament_ids 150（重複なし）');
  }

  // ---- FAIL-MEMBERS ----
  {
    env.saveBranchMaster({schema_version:1,updated_at:'x',members:[member('mA')]});
    var resp=function(table){ if(table==='members')return {error:{message:'boom'}}; return {data:[]}; };
    var res=await env.rebuildMasterFromCloud(makeClient(resp),{clubId:'club1'});
    assert(res.ok===false&&res.step==='members','FAIL-MEMBERS-1 members error → step=members');
  }

  // ---- FAIL-TOURN ----
  {
    env.saveBranchMaster({schema_version:1,updated_at:'x',members:[member('mA')]});
    var resp=function(table){ if(table==='members')return {data:[]}; if(table==='tournaments')return {error:{message:'boom'}}; return {data:[]}; };
    var res=await env.rebuildMasterFromCloud(makeClient(resp),{clubId:'club1'});
    assert(res.ok===false&&res.step==='tournaments','FAIL-TOURN-1 tournaments error → step=tournaments');
  }

  // ---- FAIL-ENTRIES ----
  {
    env.saveBranchMaster({schema_version:1,updated_at:'x',members:[member('mA')]});
    var resp=function(table){
      if(table==='members')return {data:[]};
      if(table==='tournaments')return {data:[{id:'T1',app_tournament_id:'t_2026_05_10',date:'2026-05-10'}]};
      if(table==='players')return {data:[{id:'P1',member_id:'mA'}]};
      if(table==='entries')return {error:{message:'boom'}};
      return {data:[]};
    };
    var res=await env.rebuildMasterFromCloud(makeClient(resp),{clubId:'club1'});
    assert(res.ok===false&&res.step==='entries','FAIL-ENTRIES-1 entries error → step=entries');
  }

  // ---- THROW: query が reject → 外側 catch → step=exception（throw しない） ----
  {
    env.saveBranchMaster({schema_version:1,updated_at:'x',members:[member('mA')]});
    var resp=function(table){ if(table==='members')return {data:[]}; if(table==='tournaments')throw new Error('kaboom'); return {data:[]}; };
    var threw=false, res=null;
    try{ res=await env.rebuildMasterFromCloud(makeClient(resp),{clubId:'club1'}); }catch(e){ threw=true; }
    assert(!threw,'THROW-1 例外を投げない（fail-soft）');
    assert(res&&res.ok===false&&res.step==='exception','THROW-2 reject → step=exception');
  }

  console.log('MASTER-REBUILD-FROM-CLOUD-001 Phase2: pass='+pass+' fail='+fail);
  process.exit(fail>0?1:0);
}
run().catch(function(e){ console.error('RUNNER EXCEPTION', e); process.exit(1); });
