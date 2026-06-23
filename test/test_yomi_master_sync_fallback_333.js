#!/usr/bin/env node
// REPRO / NEGATIVE-CONTROL for Issue #333 (QA P2):
//   リロード/JSON復元後に _pendingNewYomi が {} になると、master 同期で
//   player.yomi（復元済み）が member.yomi に引き継がれずサイレント消失する。
//
//   修正方針: master 同期時 yomi を「yomiMap 優先・無ければ player.yomi フォールバック」に。
//     - createMemberFromParticipant が player.yomi を取り込む（yomi:'' ハードコードをやめる）
//     - updateBranchMasterFromTournament の既存 member 補完が yomiMap と player.yomi 両方を見る
//     - 既存 member の非空 yomi は温存（空上書き禁止）
//
//   入力は完全架空。crypto.randomUUID 固定モック → 新規 member は1呼び出し1名に制限。
//   このテストは「未修正 base で FAIL（yomi='' を検出）」する真の回帰テスト。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p,'utf8');
  const scripts=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}
function makeContext(){
  function makeNode(tag){ return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
    style:{}, _attrs:{}, childNodes:[], appendChild:function(c){this.childNodes.push(c);return c;},
    setAttribute:function(){}, getAttribute:function(){return null;}, addEventListener:function(){},
    querySelector:function(){return null;}, querySelectorAll:function(){return [];} }; }
  var elements={};
  var docMock={ getElementById:function(id){ if(!elements[id]){var n=makeNode('div');n.id=id;elements[id]=n;} return elements[id]; },
    createElement:function(tag){return makeNode(tag);}, createTextNode:function(t){return {nodeType:3,textContent:String(t==null?'':t)};},
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){return null;}, querySelectorAll:function(){return [];} };
  var winMock={ innerWidth:1024, addEventListener:function(){}, open:function(){return {focus:function(){},print:function(){},close:function(){}};} };
  var localStorageMock={ _:{}, getItem:function(k){return (k in this._)?this._[k]:null;}, setItem:function(k,v){this._[k]=String(v);}, removeItem:function(k){delete this._[k];} };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}
const targetPath=process.argv[2];
if(!targetPath){ console.error('Usage: node test_yomi_master_sync_fallback_333.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx=makeContext();
  const js=extractScripts(targetPath);
  let uuidN=0;
  const cryptoMock={ randomUUID(){ uuidN++; return '00000000-0000-0000-0000-0000000000'+String(10+uuidN).slice(-2); } };
  const fn=new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       updateBranchMasterFromTournament:updateBranchMasterFromTournament,
       createMemberFromParticipant:(typeof createMemberFromParticipant==='function')?createMemberFromParticipant:null,
       normalizeYomi:normalizeYomi
     };`
  );
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,
    function(){},function(){return true;},function(){return '';},
    function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}},Promise,function(){return 0;});
}

let pass=0,fail=0;
function ok(c,msg){ if(c){pass++;} else {fail++; console.log('  FAIL: '+msg);} }

const env=loadEnv();
const YOMI='かくうたろう';

// --- 共通: ふりがな付き player を1名持つ大会 state を作り、JSON 往復で _pendingNewYomi 消失を模す ---
function freshTournamentState(memberId){
  var raw={
    tournament_id:'t-333',
    rounds:4,
    classes:[{id:'A',name:'A級'},{id:'B',name:'B級'}],
    players:{ A:[{ id:'p1', name:'架空太郎', yomi:YOMI, cls:'A', member:'member', grade:'ippan'
                  // member_id を意図的に付けない（または下で付与）→ 新規 or 既存マッチ経路を選択
                }], B:[] },
    report:{}
  };
  if(memberId)raw.players.A[0].member_id=memberId;
  // JSON 往復 = リロード/バックアップ復元の模擬（player.yomi は normalizeState で復元される）
  return env.normalizeState(JSON.parse(JSON.stringify(raw)));
}

console.log('=== A. player.yomi は JSON往復後も復元される（前提確認）===');
(function(){
  var st=freshTournamentState(null);
  ok(st.players.A[0].yomi===YOMI, 'normalizeState 後も player.yomi が保持される (got: '+JSON.stringify(st.players.A[0].yomi)+')');
})();

console.log('=== B. 新規 member 作成: yomiMap 空でも player.yomi を引き継ぐべき（バグ本体）===');
(function(){
  var st=freshTournamentState(null);            // member_id 無し → master 新規作成経路
  var master={ schema_version:1, members:[] };
  // リロード後相当: _pendingNewYomi は再構築されない → yomiMap は空
  env.updateBranchMasterFromTournament(st, master, {tournament_id:'t-333', tournament_date:'2026-06-23', yomiMap:{}});
  ok(master.members.length===1, '新規 member が1名作られる (got '+master.members.length+')');
  var m=master.members[0];
  // ★ 期待（修正後）: member.yomi が player.yomi で保持される
  // ★ 未修正 base: member.yomi==='' （ネガティブコントロール＝ここで FAIL するのが正しい）
  ok(m && env.normalizeYomi(m.yomi)===YOMI,
     '新規 member.yomi が player.yomi を引き継ぐ (got: '+JSON.stringify(m&&m.yomi)+')  ← 未修正 base では空でFAIL（=バグ実証）');
})();

console.log('=== C. 既存 member(yomi空) 補完: yomiMap 空でも player.yomi で埋めるべき ===');
(function(){
  var st=freshTournamentState('m_existing0001');
  var master={ schema_version:1, members:[
    { id:'m_existing0001', name:'架空太郎', yomi:'', member:'member', grade:'ippan',
      last_class:'A', last_attended:'2026-01-01', first_attended:'2026-01-01',
      attendance_count:0, tournament_ids:[], deleted:false, deleted_at:null, note:'', city:'' }
  ]};
  env.updateBranchMasterFromTournament(st, master, {tournament_id:'t-333', tournament_date:'2026-06-23', yomiMap:{}});
  var m=master.members[0];
  ok(m && env.normalizeYomi(m.yomi)===YOMI,
     '既存 member(空yomi) が player.yomi で補完される (got: '+JSON.stringify(m&&m.yomi)+')  ← 未修正 base では空でFAIL');
})();

console.log('=== D. 非回帰: yomiMap に値があれば従来どおり優先（登録セッション中の通常経路）===');
(function(){
  var st=freshTournamentState(null);
  st.players.A[0].yomi='';                        // player 側は空でも
  var master={ schema_version:1, members:[] };
  env.updateBranchMasterFromTournament(st, master, {tournament_id:'t-333', tournament_date:'2026-06-23', yomiMap:{ p1:'やまだはなこ' }});
  var m=master.members[0];
  ok(m && env.normalizeYomi(m.yomi)==='やまだはなこ', 'yomiMap 値が従来どおり優先される (got: '+JSON.stringify(m&&m.yomi)+')');
})();

console.log('=== E. 非回帰: 既存 member の非空 yomi は空上書きしない（温存）===');
(function(){
  var st=freshTournamentState('m_existing0002');
  st.players.A[0].yomi='';                        // player 側 空・yomiMap 空
  var master={ schema_version:1, members:[
    { id:'m_existing0002', name:'架空太郎', yomi:'きそんのよみ', member:'member', grade:'ippan',
      last_class:'A', last_attended:'2026-01-01', first_attended:'2026-01-01',
      attendance_count:0, tournament_ids:[], deleted:false, deleted_at:null, note:'', city:'' }
  ]};
  env.updateBranchMasterFromTournament(st, master, {tournament_id:'t-333', tournament_date:'2026-06-23', yomiMap:{}});
  var m=master.members[0];
  ok(m && env.normalizeYomi(m.yomi)==='きそんのよみ', '既存の非空 yomi が温存される(空上書きしない) (got: '+JSON.stringify(m&&m.yomi)+')');
})();

console.log('');
console.log('PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
