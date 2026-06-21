#!/usr/bin/env node
// CHARACTERIZATION: 支部マスタ同期（updateBranchMasterFromTournament / mergeTournamentParticipantsIntoMaster）。
//   Issue #283 Phase A deliverable 3。被覆マップで「直接被覆なし/THIN」と判定された
//   マスタ統合ロジックの分岐を現状挙動として固定する。
//
//   対象（shogi_v4.html）:
//     - updateBranchMasterFromTournament(state, master, tournamentMeta)
//         当日大会の参加者を支部マスタへ反映。member_id 一致 → 名前候補1件で自動紐付け →
//         同名複数候補は **同期スキップ**（事故防止）→ 0件は新規 member 作成。
//     - mergeTournamentParticipantsIntoMaster(tournaments, master)
//         過去大会バックアップ群をマスタへ一括統合。{tournaments,added,matched,skipped} を返す。
//         **同名複数候補は新規作成（update 側のスキップと挙動が異なる点を固定）**。
//   入力は完全架空（架空 / m-xxx）。tournament_date は常に明示（todayYmd 非依存＝決定的）。
//   crypto.randomUUID は固定モック → 新規 member id は 'm_000000000000'。
//   1 呼び出しにつき新規 member は最大1名に制限（モック UUID 衝突回避）。shogi_v4.html は不変。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[], appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(){}, getAttribute:function(){ return null; }, addEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  var elements={};
  var docMock={ getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); }, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_char_branch_master_sync_001.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       updateBranchMasterFromTournament:updateBranchMasterFromTournament,
       mergeTournamentParticipantsIntoMaster:mergeTournamentParticipantsIntoMaster,
       findMemberCandidates:findMemberCandidates,
       normalizeYomi:normalizeYomi,
       _setState:function(s){ state=s; }
     };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }
function byId(master,id){ for(var i=0;i<master.members.length;i++)if(master.members[i].id===id)return master.members[i]; return null; }
function hasTid(member,tid){ return member && Array.isArray(member.tournament_ids) && member.tournament_ids.indexOf(tid)>=0; }

const env = loadEnv();

// 架空マスタ（m-001 架空一郎[yomi 有], m-002 架空二郎[yomi 空], 同名2件 m-dup1/m-dup2 架空同名）
function mkMaster(){
  return { schema_version:1, members:[
    {id:'m-001',name:'架空一郎',yomi:'かくいちろう',last_class:'A',last_attended:'2026-01-10',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['gt_old'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'m-002',name:'架空二郎',yomi:'',last_class:'B',last_attended:'2026-02-10',first_attended:'2025-02-01',attendance_count:1,tournament_ids:['gt_old2'],deleted:false,deleted_at:null,note:'',member:'other',grade:'ippan',city:''},
    {id:'m-dup1',name:'架空同名',yomi:'',last_class:'A',last_attended:'2026-03-01',first_attended:'2025-03-01',attendance_count:1,tournament_ids:['gt_d1'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'m-dup2',name:'架空同名',yomi:'',last_class:'B',last_attended:'2026-03-02',first_attended:'2025-03-02',attendance_count:1,tournament_ids:['gt_d2'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''}
  ]};
}

// =====================================================================
// updateBranchMasterFromTournament（当日大会 → マスタ反映）
// =====================================================================

// ---- U0: ガード（不正引数 → master 無改変で返す）----
(function(){
  var master = mkMaster();
  var before = master.members.length;
  var r1 = env.updateBranchMasterFromTournament(null, master, {tournament_id:'t1',tournament_date:'2026-06-14'});
  assert(r1===master && master.members.length===before, 'U0-1 state=null → master 無改変で返す');
  var r2 = env.updateBranchMasterFromTournament({players:{A:[],B:[]}}, master, {tournament_date:'2026-06-14'});
  assert(r2===master && master.members.length===before, 'U0-2 tournament_id 欠落 → master 無改変で返す');
})();

// ---- U1: 既存 member_id 紐付け済 → tid 追加・attendance 再計算・last_class 更新 ----
(function(){
  var master = mkMaster();
  var state = {players:{A:[{id:'p1',name:'架空一郎',cls:'A',member:'member',grade:'ippan',member_id:'m-001'}],B:[]}};
  env.updateBranchMasterFromTournament(state, master, {tournament_id:'gt_new',tournament_date:'2026-06-14'});
  var m = byId(master,'m-001');
  assert(hasTid(m,'gt_new'), 'U1-1 既存 member に当日 tid を追加');
  assert(m.attendance_count===m.tournament_ids.length, 'U1-2 attendance_count=tournament_ids.length に再計算');
  assert(m.last_attended==='2026-06-14', 'U1-3 last_attended を当日(より新しい)へ更新');
  assert(master.members.length===4, 'U1-4 member 新規作成は発生しない');
})();

// ---- U2: member_id 無 + 同名候補1件 → 自動紐付け（player.member_id 付与・tid 追加）----
(function(){
  var master = mkMaster();
  var p = {id:'p2',name:'架空一郎',cls:'A',member:'member',grade:'ippan'};
  var state = {players:{A:[p],B:[]}};
  env.updateBranchMasterFromTournament(state, master, {tournament_id:'gt_link',tournament_date:'2026-06-14'});
  assert(p.member_id==='m-001', 'U2-1 同名候補1件 → player.member_id を自動付与');
  assert(hasTid(byId(master,'m-001'),'gt_link'), 'U2-2 紐付け先 member に tid 追加');
  assert(master.members.length===4, 'U2-3 新規 member は作られない');
})();

// ---- U3: member_id 無 + 同名候補が複数 → 同期スキップ（事故防止）----
(function(){
  var master = mkMaster();
  var p = {id:'p3',name:'架空同名',cls:'A',member:'member',grade:'ippan'};
  var state = {players:{A:[p],B:[]}};
  env.updateBranchMasterFromTournament(state, master, {tournament_id:'gt_skip',tournament_date:'2026-06-14'});
  assert(p.member_id===undefined, 'U3-1 同名複数候補 → player.member_id は付与しない（スキップ）');
  assert(master.members.length===4, 'U3-2 新規 member も作らない');
  assert(!hasTid(byId(master,'m-dup1'),'gt_skip') && !hasTid(byId(master,'m-dup2'),'gt_skip'), 'U3-3 どちらの候補にも tid を足さない');
})();

// ---- U4: member_id 無 + 候補0件 → 新規 member 作成（master へ push）----
(function(){
  var master = mkMaster();
  var p = {id:'p4',name:'架空全新',cls:'A',member:'member',grade:'ippan'};
  var state = {players:{A:[p],B:[]}};
  env.updateBranchMasterFromTournament(state, master, {tournament_id:'gt_new4',tournament_date:'2026-06-14'});
  assert(master.members.length===5, 'U4-1 候補0件 → master.members が1件増える');
  var nm = byId(master,'m_000000000000');
  assert(nm!==null && nm.name==='架空全新', 'U4-2 新規 member は固定モック id・氏名保持');
  assert(hasTid(nm,'gt_new4') && nm.last_attended==='2026-06-14', 'U4-3 新規 member に tid・last_attended');
  assert(p.member_id==='m_000000000000', 'U4-4 player にも member_id を付与');
})();

// ---- U5: yomiMap（新規は反映 / 既存は空のときだけ補完・非空は上書きしない）----
(function(){
  var master = mkMaster();
  var pNew = {id:'pNew',name:'架空読新',cls:'A'};            // 新規（候補0件）→ yomi 反映
  var pEmpty = {id:'pEmpty',name:'架空二郎',cls:'A',member_id:'m-002'};  // 既存・yomi 空 → 補完
  var pKept  = {id:'pKept',name:'架空一郎',cls:'A',member_id:'m-001'};   // 既存・yomi 非空 → 維持
  var state = {players:{A:[pNew,pEmpty,pKept],B:[]}};
  var meta = {tournament_id:'gt_yomi',tournament_date:'2026-06-14',yomiMap:{pNew:'かくうよみしん',pEmpty:'かくうじろう',pKept:'うわがきしない'}};
  env.updateBranchMasterFromTournament(state, master, meta);
  var nm = byId(master,'m_000000000000');
  assert(nm!==null && env.normalizeYomi(nm.yomi)===env.normalizeYomi('かくうよみしん'), 'U5-1 新規 member に yomiMap の yomi を反映');
  assert(env.normalizeYomi(byId(master,'m-002').yomi)===env.normalizeYomi('かくうじろう'), 'U5-2 既存・yomi 空 → yomiMap で補完');
  assert(byId(master,'m-001').yomi==='かくいちろう', 'U5-3 既存・yomi 非空 → 上書きしない');
})();

// =====================================================================
// mergeTournamentParticipantsIntoMaster（過去バックアップ → 一括統合）
// =====================================================================

// ---- M0: 空入力 → 全0サマリ ----
(function(){
  var master = mkMaster();
  var s = env.mergeTournamentParticipantsIntoMaster([], master);
  assert(s.tournaments===0 && s.added===0 && s.matched===0 && s.skipped===0, 'M0-1 空 tournaments → {0,0,0,0}');
})();

// ---- M1: raw 不在エントリ → skipped ----
(function(){
  var master = mkMaster();
  var s = env.mergeTournamentParticipantsIntoMaster([{filename:'x.json'}], master);
  assert(s.skipped===1 && s.added===0 && s.matched===0, 'M1-1 raw 不在 → skipped=1');
})();

// ---- M2: 新規参加者 → added ----
(function(){
  var master = mkMaster();
  var t = [{filename:'a.json',raw:{players:{A:[{id:'b1',name:'架空全新',cls:'A'}],B:[]},report:{date:'2026-06-14',title:'架空バックアップ'}}}];
  var s = env.mergeTournamentParticipantsIntoMaster(t, master);
  assert(s.added===1 && s.matched===0, 'M2-1 未知の参加者 → added=1');
  assert(master.members.length===5, 'M2-2 master.members が1件増える');
})();

// ---- M3: 既存同名（候補1件）→ matched ----
(function(){
  var master = mkMaster();
  var t = [{filename:'b.json',raw:{players:{A:[{id:'b2',name:'架空一郎',cls:'A'}],B:[]},report:{date:'2026-06-14',title:'架空バックアップ'}}}];
  var s = env.mergeTournamentParticipantsIntoMaster(t, master);
  assert(s.matched===1 && s.added===0, 'M3-1 既存と同名1件 → matched=1（新規作成しない）');
  assert(master.members.length===4, 'M3-2 member 数は不変');
})();

// ---- M4: 同名複数候補 → 新規作成（update 側のスキップと挙動が異なる）----
(function(){
  var master = mkMaster();
  var t = [{filename:'c.json',raw:{players:{A:[{id:'b3',name:'架空同名',cls:'A'}],B:[]},report:{date:'2026-06-14',title:'架空バックアップ'}}}];
  var s = env.mergeTournamentParticipantsIntoMaster(t, master);
  assert(s.added===1 && s.matched===0, 'M4-1 merge は同名複数候補を新規作成（added=1）＝update のスキップと対照的');
  assert(master.members.length===5, 'M4-2 master.members が1件増える');
})();

console.log('  支部マスタ同期 characterization テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
