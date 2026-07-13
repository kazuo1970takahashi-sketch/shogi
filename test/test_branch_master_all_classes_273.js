#!/usr/bin/env node
// Issue #273: C 以降クラスの参加者が支部マスタ同期・過去大会統合から欠落（['A','B'] ハードコード）の修正テスト。
//   修正方針（ディスパッチ準拠）:
//     1. updateBranchMasterFromTournament（「大会データをコピー」時のマスタ同期）のクラス列挙を
//        state.classes / Object.keys(state.players) 駆動へ。
//     2. mergeTournamentParticipantsIntoMaster（「マスタ」タブの過去大会統合）も同様に全クラス対応。
//     3. last_class ガードは CLASS-VARIABLE-002 (#768) で「isSafeClassId 以外は null」へ一般化
//        （createMemberFromParticipant / normalize / validation / verify も同スライスで追随済み。
//        旧 #273 時点の「A/B/null 不変条件・C は null のまま同期」は撤廃）。
//   観点:
//     SYNC    A2+B2+C2 → master 6 名（C 以降が同期に反映・member_id でリンク）。
//     SYNCAB  A/B のみは件数・行順（A→B・各クラス内 players 順）が不変。
//     LASTCLS 同期後 A→last_class='A' / C→last_class='C'（#768: isSafeClassId のみ採用・不正値は null）。
//     LASTCLS-STALE Codex P1: 既存 member の stale last_class を最新出席のクラスで是正（C 最新→'C' #768 /
//                   古い大会の同期・統合は新しい last_class を潰さない）。
//     MERGE   過去大会統合で A+B+C → master 3 名（C 以降が統合に反映）。A/B のみは不変。
//     HELPER  listClassIdsForMasterSync の union/dedup/順序/空入力。
//   完全架空データのみ（架空 …）。runtime（shogi_v4.html）以外は無改変。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_branch_master_all_classes_273.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  const elements={};
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      disabled:false, checked:false, type:'', style:{}, _attrs:{}, childNodes:[], _listeners:{},
      focus:function(){}, blur:function(){}, click:function(){},
      appendChild:function(c){ this.childNodes.push(c); return c; }, removeChild:function(){}, remove:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); }, getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  const docMock={
    getElementById:function(id){ if(!elements[id]){ const n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); }, createTextNode:function(t){ return {nodeType:3, textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  const winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  const localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

function loadEnv(){
  const ctx = makeContext();
  const warns = [];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  // generateMemberId は crypto.randomUUID をユニーク前提で dedup する。各呼び出しで異なる UUID を返す。
  let uuidCounter = 0;
  const cryptoMock = { randomUUID(){ uuidCounter++; const h=('00000000'+uuidCounter.toString(16)).slice(-8); return h+'-0000-4000-8000-000000000000'; } };
  const js = extractScripts(RAW);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       listClassIdsForMasterSync:listClassIdsForMasterSync,
       updateBranchMasterFromTournament:updateBranchMasterFromTournament,
       mergeTournamentParticipantsIntoMaster:mergeTournamentParticipantsIntoMaster
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(){}
  );
  api._warns = warns;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// spec = {A:['名前',...], B:[...], C:[...]} から normalizeState 済み state を作る。
function buildState(env,spec){
  var classes=[],players={};
  Object.keys(spec).forEach(function(cid){
    classes.push({id:cid,name:cid+'クラス',started:true});
    players[cid]=spec[cid].map(function(nm,i){return {id:cid.toLowerCase()+(i+1),name:nm,cls:cid,member:'member',grade:'ippan',entry_no:i+1,yomi:''};});
  });
  return env.normalizeState({rounds:4,started:true,classes:classes,players:players,pairings:{},results:{},
    tournament_id:'t_test_273',tournament_date:'2026-06-21',report:{}});
}
function memberById(master,id){ for(var i=0;i<master.members.length;i++){ if(master.members[i].id===id)return master.members[i]; } return null; }

// ============================================================
// SYNC. updateBranchMasterFromTournament: A2+B2+C2 → master 6 名（C 反映）。
// ============================================================
{
  var env=loadEnv();
  var s=buildState(env,{A:['架空エー一郎','架空エー二郎'],B:['架空ビー一郎','架空ビー二郎'],C:['架空シー一郎','架空シー二郎']});
  var master={version:2,members:[]};
  env.updateBranchMasterFromTournament(s,master,{tournament_id:'t_test_273',tournament_date:'2026-06-21'});
  assert(master.members.length===6,'SYNC-1 A2+B2+C2 → 支部マスタ 6 名（C 以降が同期に反映）');
  // C 参加者が member_id でマスタにリンクされている（取りこぼしなし）
  var cLinked=s.players.C.every(function(p){ return typeof p.member_id==='string'&&p.member_id&&!!memberById(master,p.member_id); });
  assert(cLinked,'SYNC-2 C 参加者全員が member_id でマスタ member にリンクされる');
  // tournament_ids にも記録されている
  var cMem=memberById(master,s.players.C[0].member_id);
  assert(cMem&&Array.isArray(cMem.tournament_ids)&&cMem.tournament_ids.indexOf('t_test_273')>=0,'SYNC-3 C member の tournament_ids に当大会が記録される');
}

// ============================================================
// SYNCAB. A/B のみは件数・行順（A→B / 各クラス内 players 順）が不変。
// ============================================================
{
  var env=loadEnv();
  var s=buildState(env,{A:['架空甲','架空乙'],B:['架空丙','架空丁']});
  var master={version:2,members:[]};
  env.updateBranchMasterFromTournament(s,master,{tournament_id:'t_ab_only',tournament_date:'2026-06-21'});
  assert(master.members.length===4,'SYNCAB-1 A/B のみ → 4 名（件数不変）');
  assert(master.members[0].id===s.players.A[0].member_id&&master.members[1].id===s.players.A[1].member_id,'SYNCAB-2 先頭2件は A クラス（players 順・行順不変）');
  assert(master.members[2].id===s.players.B[0].member_id&&master.members[3].id===s.players.B[1].member_id,'SYNCAB-3 後続2件は B クラス（A→B 順・行順不変）');
}

// ============================================================
// LASTCLS. 同期後 A→last_class='A' / C→last_class=null（A/B/null 不変条件を破らない）。
// ============================================================
{
  var env=loadEnv();
  var s=buildState(env,{A:['架空エー三郎'],B:['架空ビー三郎'],C:['架空シー三郎']});
  var master={version:2,members:[]};
  env.updateBranchMasterFromTournament(s,master,{tournament_id:'t_lastcls',tournament_date:'2026-06-21'});
  var aMem=memberById(master,s.players.A[0].member_id);
  var bMem=memberById(master,s.players.B[0].member_id);
  var cMem=memberById(master,s.players.C[0].member_id);
  assert(aMem&&aMem.last_class==='A','LASTCLS-1 A 参加者の last_class は "A"（従来どおり）');
  assert(bMem&&bMem.last_class==='B','LASTCLS-2 B 参加者の last_class は "B"（従来どおり）');
  assert(cMem&&cMem.last_class==='C','LASTCLS-3 C 参加者の last_class は "C"（CLASS-VARIABLE-002 #768: 非A/B→null を isSafeClassId 以外→null へ一般化）');
}

// ============================================================
// LASTCLS-STALE. Codex P1: 既存 member の stale last_class を「最新出席のクラス」で是正する。
//   - C 以降が最新出席になると A/B の stale last_class を null へクリア（前回:A/B 誤表示・古いクラス優先を防ぐ）。
//   - より古い大会の同期/統合では新しい last_class を潰さない（最新出席のときだけ上書き）。
// ============================================================
{
  // 同期: 既存 member(last_class='A', 旧 last_attended) が今回 C で最新出席 → null へクリア
  var env=loadEnv();
  var s=buildState(env,{C:['架空シー再来']});
  s.players.C[0].member_id='m_stale_sync';
  var master={version:2,members:[{
    id:'m_stale_sync',name:'架空シー再来',yomi:'',last_class:'A',
    last_attended:'2026-01-01',first_attended:'2026-01-01',attendance_count:1,
    tournament_ids:['t_old'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''
  }]};
  env.updateBranchMasterFromTournament(s,master,{tournament_id:'t_new',tournament_date:'2026-06-21'});
  var m1=memberById(master,'m_stale_sync');
  assert(m1&&m1.last_class==='C','LASTCLS-STALE-1 同期: C で最新出席になった既存 member の stale last_class("A") が "C" に是正される（#768）');
  assert(m1&&m1.last_attended==='2026-06-21','LASTCLS-STALE-2 同期: last_attended が今回の最新日に更新される');

  // 同期: 既存 member(last_class=null, 新しい last_attended) を「過去日」の A で同期 → null のまま（潰さない）
  var env2=loadEnv();
  var s2=buildState(env2,{A:['架空エー古参']});
  s2.players.A[0].member_id='m_keep_sync';
  var master2={version:2,members:[{
    id:'m_keep_sync',name:'架空エー古参',yomi:'',last_class:null,
    last_attended:'2026-12-01',first_attended:'2026-01-01',attendance_count:2,
    tournament_ids:['t_recent'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''
  }]};
  env2.updateBranchMasterFromTournament(s2,master2,{tournament_id:'t_older',tournament_date:'2026-03-01'});
  var m2=memberById(master2,'m_keep_sync');
  assert(m2&&m2.last_class===null,'LASTCLS-STALE-3 同期: 過去日の A 同期は最新の last_class(null) を潰さない（最新出席時のみ上書き）');
  assert(m2&&m2.last_attended==='2026-12-01','LASTCLS-STALE-4 同期: 過去日同期では last_attended も不変（最新を保持）');

  // 統合: 既存 member(last_class='B') を C の大会で最新統合 → null へクリア（C→null 不変条件）
  var env3=loadEnv();
  var master3={version:2,members:[{
    id:'m_stale_merge',name:'架空シー統合済',yomi:'',last_class:'B',
    last_attended:'2026-01-01',first_attended:'2026-01-01',attendance_count:1,
    tournament_ids:['t_old_b'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''
  }]};
  var raw3={rounds:4,started:true,
    classes:[{id:'C',name:'Cクラス',started:true}],
    players:{C:[{id:'c1',name:'架空シー統合済',cls:'C',member:'member',grade:'ippan',entry_no:1,member_id:'m_stale_merge'}]},
    pairings:{},results:{},tournament_id:'t_merge_c_latest',tournament_date:'2026-06-21',report:{date:'2026年6月21日'}};
  env3.mergeTournamentParticipantsIntoMaster([{raw:raw3,filename:'20260621_merge.json'}],master3);
  var m3=memberById(master3,'m_stale_merge');
  assert(m3&&m3.last_class==='C','LASTCLS-STALE-5 統合: C の最新統合で既存 member の stale last_class("B") が "C" に是正される（#768）');
}

// ============================================================
// MERGE. mergeTournamentParticipantsIntoMaster: 過去大会統合で A+B+C → 3 名（C 反映）。
// ============================================================
{
  var env=loadEnv();
  var raw={rounds:4,started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true},{id:'C',name:'Cクラス',started:true}],
    players:{
      A:[{id:'a1',name:'架空統合エー',cls:'A',member:'member',grade:'ippan',entry_no:1}],
      B:[{id:'b1',name:'架空統合ビー',cls:'B',member:'member',grade:'ippan',entry_no:1}],
      C:[{id:'c1',name:'架空統合シー',cls:'C',member:'member',grade:'ippan',entry_no:1}]
    },
    pairings:{},results:{},tournament_id:'t_merge_273',tournament_date:'2026-06-21',report:{date:'2026年6月21日'}};
  var master={version:2,members:[]};
  var summary=env.mergeTournamentParticipantsIntoMaster([{raw:raw,filename:'20260621_test.json'}],master);
  assert(master.members.length===3,'MERGE-1 過去大会統合 A+B+C → 3 名（C 以降が統合に反映）');
  assert(summary&&summary.added===3,'MERGE-2 summary.added===3（3 名すべて新規統合）');
  // 全 member が当大会の tournament_id を持つ
  var allHaveTid=master.members.every(function(m){return Array.isArray(m.tournament_ids)&&m.tournament_ids.indexOf('t_merge_273')>=0;});
  assert(allHaveTid,'MERGE-3 統合した全 member が当大会 tournament_id を保持（C 含む）');
}

// ============================================================
// MERGEAB. 過去大会統合で A/B のみは件数不変（C 以外を増やさない）。
// ============================================================
{
  var env=loadEnv();
  var raw={rounds:4,started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    players:{A:[{id:'a1',name:'架空統合A甲',cls:'A',member:'member',grade:'ippan',entry_no:1}],
             B:[{id:'b1',name:'架空統合B甲',cls:'B',member:'member',grade:'ippan',entry_no:1}]},
    pairings:{},results:{},tournament_id:'t_merge_ab',tournament_date:'2026-06-21',report:{date:'2026年6月21日'}};
  var master={version:2,members:[]};
  var summary=env.mergeTournamentParticipantsIntoMaster([{raw:raw,filename:'20260621_ab.json'}],master);
  assert(master.members.length===2&&summary.added===2,'MERGEAB-1 A/B のみ統合は 2 名（件数不変）');
}

// ============================================================
// HELPER. listClassIdsForMasterSync の union/dedup/順序/空入力。
// ============================================================
{
  var env=loadEnv();
  var f=env.listClassIdsForMasterSync;
  var r1=f({classes:[{id:'A'},{id:'B'},{id:'C'}],players:{A:[],B:[],C:[]}});
  assert(r1.join(',')==='A,B,C','HELPER-1 classes 順に全クラス id を返す（A,B,C）');
  var r2=f({classes:[{id:'A'},{id:'B'}],players:{A:[],B:[]}});
  assert(r2.join(',')==='A,B','HELPER-2 A/B のみは ["A","B"]（従来順）');
  var r3=f({classes:[{id:'A'}],players:{A:[],B:[]}});
  assert(r3.join(',')==='A,B','HELPER-3 players のみに存在する id も union（classes に無い B を後置）');
  var r4=f({classes:[{id:'A'},{id:'A'},{id:'C'}],players:{A:[],C:[]}});
  assert(r4.join(',')==='A,C','HELPER-4 重複 id は除外（dedup）');
  assert(f({}).length===0&&f(null).length===0&&f(undefined).length===0,'HELPER-5 空/不正入力は []');
  var r6=f({players:{A:[],B:[],C:[]}});
  assert(r6.slice().sort().join(',')==='A,B,C','HELPER-6 classes 欠落時も players キーから全クラスを拾う');
}

console.log('');
console.log('  ISSUE-273 BRANCH-MASTER-ALL-CLASSES テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
