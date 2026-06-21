#!/usr/bin/env node
// Issue #272: 2回戦以降に奇数人数で generatePairing が 0 卓に潰れて進行不能になるバグの修正テスト。
//   修正方針（ディスパッチ準拠）:
//     1. generatePairing(cls): 奇数のとき末尾1人を「待機(leftover)」として組み合わせから外し、
//        残り偶数人で floor(N/2) 卓を生成する（0 卓に潰さない・不戦勝にしない）。
//     2. submitRound(cls): 2回戦以降(results>=1)かつ奇数のときに限り未割当1名までを許容して確定可能に
//        する（＝進行できる）。1回戦・偶数は従来どおり全員割当必須。
//     3. addPlayer(): 開始済みクラスの2回戦以降(results>=1)への追加は confirm で運営に通知/ガード。
//     4. 0 卓検知時に運営警告（safety net）。
//     5. getRoundLeftoverPlayers(cls): 待機者を派生で返す表示専用 reader（state 非保存）。
//   観点:
//     ODD     N=5/7/9 の2回戦: floor(N/2) 卓 + 余り1名待機・二重登録なし・0 卓にならない・進行できる。
//     EVEN    N=6/8 の2回戦: N/2 卓・待機0・従来挙動不変。
//     BYE     待機者は不戦勝にしない（勝数・results に勝ちが入らない）。
//     SUBMIT  round1 は未割当をブロック / round2 以降は待機者数でブロックしない（複数の途中追加も確定可・
//             Codex P1）/ round2 以降の0卓（参加者あり）は退行的空回戦としてガード。
//     LEFTOVER getRoundLeftoverPlayers が pairings 由来で正しく1名を返す（round1/未生成は []）。
//     DISPLAY buildCurrentPairingsHtml が待機者を明示（奇数）/ 出さない（偶数）。
//     ADD     未開始/1回戦中は confirm なし追加 / 2回戦以降は confirm（true で追加・false で中止）。
//     RELOAD  奇数2回戦の append 済み pairings が normalizeState 往復で復元・待機は派生で再計算。
//     F2      待機ローテーション: 過去回戦で不在(sitOut 大)の選手は待機に選ばれず対局に入る（Codex P1）。
//     F3      再戦回避: 待機を固定せず候補を試し、回避可能な再戦(a1対a2)を強制しない（Codex P1）。
//   完全架空データのみ（架空 …）。既存スキーマ不変（match は {p1,p2,winner,lastModifiedBy}）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_pairing_odd_leftover_272.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// リッチ DOM mock（test_progressive_pairing_p1.js / test_furigana_mvp_001.js と同型）。
function makeContext(){
  const elements={};
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      disabled:false, checked:false, type:'', style:{}, _attrs:{}, childNodes:[], _listeners:{},
      focus:function(){}, blur:function(){}, click:function(){},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      removeChild:function(){}, remove:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      querySelector:function(){ return null; },
      querySelectorAll:function(){ return []; },
      _fire:function(ev){ const ls=this._listeners[ev]||[]; for(let i=0;i<ls.length;i++){ if(typeof ls[i]==='function') ls[i](); } }
    };
  }
  const docMock={
    getElementById:function(id){ if(!elements[id]){ const n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3, textContent:String(t==null?'':t)}; },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  const winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  const localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements, _makeNode:makeNode };
}

// opts.confirm: native confirm の戻り（関数 or boolean）。既定 true。
function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  const warns = [];
  const alerts = [];
  const confirmCalls = [];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  const alertFn = function(message){ alerts.push(String(message)); };
  const confirmFn = function(message){ confirmCalls.push(String(message)); return (typeof opts.confirm==='function')?opts.confirm(message):(opts.confirm!==false); };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState, save:save, STORAGE_KEY:STORAGE_KEY,
       generatePairing:generatePairing, submitRound:submitRound, addPlayer:addPlayer,
       setWinner:setWinner, getWins:getWins, isClassStarted:isClassStarted,
       getRoundLeftoverPlayers:getRoundLeftoverPlayers,
       getUnassignedFirstRoundPlayers:getUnassignedFirstRoundPlayers,
       getDuplicatePlayersInPairings:getDuplicatePlayersInPairings,
       buildCurrentPairingsHtml:buildCurrentPairingsHtml,
       renderTournament:renderTournament,
       _setState:function(s){state=s;}, _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    alertFn, confirmFn, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx; api._warns = warns; api._alerts = alerts; api._confirmCalls = confirmCalls;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空 N 名のクラスを作る（entry_no は 1..N）。
function makePlayers(cls,n){
  var arr=[];
  for(var i=1;i<=n;i++) arr.push({id:cls.toLowerCase()+i,name:'架空'+cls+'参加者'+i,cls:cls,member:'member',grade:'ippan',entry_no:i,yomi:''});
  return arr;
}
// クラス cls を N 名・1回戦確定済み（results.length===1）にした state を env に流す。
//   1回戦は先頭 floor(N/2) 卓（winner=p1）。奇数なら末尾1名は1回戦未対局（＝後から参加した想定）。
function stateRound2(env,cls,n){
  var s=env.normalizeState({
    rounds:4, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    players:{A:[],B:[]}, pairings:{A:[],B:[]}, results:{A:[],B:[]}
  });
  s.players[cls]=makePlayers(cls,n);
  var rp=s.players[cls];
  var r1=[]; var k=Math.floor(rp.length/2);
  for(var i=0;i<k;i++) r1.push({p1:rp[2*i].id,p2:rp[2*i+1].id,winner:rp[2*i].id,lastModifiedBy:'auto'});
  s.results[cls]=[r1];
  s.pairings[cls]=[];
  for(var c=0;c<s.classes.length;c++){ if(s.classes[c].id===cls) s.classes[c].started=true; }
  env._setState(s);
  return env._getState();
}
function assignedSet(pairings){
  var a={}; for(var i=0;i<pairings.length;i++){ var m=pairings[i]; if(!m)continue; if(m.p1)a[m.p1]=1; if(m.p2)a[m.p2]=1; } return a;
}

// ============================================================
// ODD. N=5/7/9 の2回戦: floor(N/2) 卓 + 余り1名待機・二重登録なし・0卓にならない・進行できる。
// ============================================================
[5,7,9].forEach(function(n){
  var env=loadEnv(); stateRound2(env,'A',n);
  env.generatePairing('A');
  var st=env._getState();
  var pr=st.pairings.A;
  var floorN=Math.floor(n/2);
  assert(pr.length===floorN, 'ODD-'+n+'-1 N='+n+' の2回戦で floor(N/2)='+floorN+' 卓を生成（0卓に潰れない）');
  assert(pr.length>0, 'ODD-'+n+'-2 N='+n+' は 0 卓にならない');
  // 二重登録なし & 1名だけ待機
  assert(env.getDuplicatePlayersInPairings('A').length===0, 'ODD-'+n+'-3 同一人物の二重登録なし');
  var assigned=assignedSet(pr);
  var distinct=Object.keys(assigned).length;
  assert(distinct===floorN*2, 'ODD-'+n+'-4 卓に入る人数は '+(floorN*2)+' 名（重複なし）');
  var leftover=st.players.A.filter(function(p){return !assigned[p.id];});
  assert(leftover.length===1, 'ODD-'+n+'-5 余り（待機）はちょうど1名');
  // getRoundLeftoverPlayers が同じ1名を返す
  var glp=env.getRoundLeftoverPlayers('A');
  assert(glp.length===1 && glp[0].id===leftover[0].id, 'ODD-'+n+'-6 getRoundLeftoverPlayers が待機1名を派生で返す');
  // 待機者は不戦勝にしない（results 不変・勝ち未付与）
  assert(st.results.A.length===1, 'ODD-'+n+'-7 generatePairing は results を増やさない（不戦勝にしない）');
  var winsAfter=env.getWins('A');
  var winSum=0; Object.keys(winsAfter).forEach(function(id){winSum+=winsAfter[id];});
  assert(winSum===Math.floor(n/2), 'ODD-'+n+'-8 勝ち数合計は1回戦の勝者数のみ（待機で勝ちが増えない）');
  // 進行できる: 全卓 winner を入れて submitRound → 2回戦が確定（results.length 2）
  for(var i=0;i<st.pairings.A.length;i++) st.pairings.A[i].winner=st.pairings.A[i].p1;
  env.submitRound('A');
  assert(env._getState().results.A.length===2, 'ODD-'+n+'-9 待機1名を許容して2回戦を確定できる（進行できる）');
});

// ============================================================
// EVEN. N=6/8 の2回戦: N/2 卓・待機0・従来挙動不変。
// ============================================================
[6,8].forEach(function(n){
  var env=loadEnv(); stateRound2(env,'A',n);
  env.generatePairing('A');
  var st=env._getState();
  var pr=st.pairings.A;
  assert(pr.length===n/2, 'EVEN-'+n+'-1 N='+n+' は従来どおり N/2='+(n/2)+' 卓');
  var assigned=assignedSet(pr);
  assert(Object.keys(assigned).length===n, 'EVEN-'+n+'-2 全 '+n+' 名が卓に入る（待機なし）');
  assert(env.getRoundLeftoverPlayers('A').length===0, 'EVEN-'+n+'-3 待機0（getRoundLeftoverPlayers 空）');
  assert(env.getDuplicatePlayersInPairings('A').length===0, 'EVEN-'+n+'-4 二重登録なし');
  for(var i=0;i<st.pairings.A.length;i++) st.pairings.A[i].winner=st.pairings.A[i].p1;
  env.submitRound('A');
  assert(env._getState().results.A.length===2, 'EVEN-'+n+'-5 偶数も従来どおり確定できる');
});

// ============================================================
// SUBMIT. submitRound の許容範囲（round1 / 偶数 / 余り>1 はブロック）。
// ============================================================
{
  // round1（results 空）で1名未割当 → 従来どおりブロック（待機を許容しない）
  var env1=loadEnv();
  var s1=env1.normalizeState({rounds:4,started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    players:{A:makePlayers('A',5),B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  // 1回戦 pairings: 先頭2卓（a5 未割当）・全 winner 入力済
  s1.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'},{p1:'a3',p2:'a4',winner:'a3',lastModifiedBy:'auto'}];
  env1._setState(s1);
  env1.submitRound('A');
  assert(env1._getState().results.A.length===0, 'SUBMIT-1 1回戦は未割当1名でも確定をブロック（待機を許容しない）');
  assert(env1._alerts.length>=1 && env1._alerts.join('\n').indexOf('対局に登録されていません')>=0, 'SUBMIT-2 1回戦ブロック時に未割当アラート');

  // Codex P1: round2 偶数（N=6）で組み合わせ外の待機2名（途中追加相当）→ ブロックせず確定できる。
  //   旧挙動（偶数は許容0でブロック）は複数の途中追加を進行不能にしたため改める。
  var env2=loadEnv(); stateRound2(env2,'A',6);
  var s2=env2._getState();
  s2.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'},{p1:'a3',p2:'a4',winner:'a3',lastModifiedBy:'auto'}]; // a5,a6 待機
  assert(env2.getRoundLeftoverPlayers('A').length===2, 'SUBMIT-3 2回戦・偶数でも組み合わせ外の待機者(2名)を検出（待機バナー対象）');
  env2.submitRound('A');
  assert(env2._getState().results.A.length===2, 'SUBMIT-3b 2回戦・偶数で待機2名でも確定できる（複数の途中追加を進行不能にしない＝Codex P1）');

  // round2 奇数（N=7）で待機3名 → 2回戦以降は待機者数でブロックしない（確定できる）
  var env3=loadEnv(); stateRound2(env3,'A',7);
  var s3=env3._getState();
  s3.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'},{p1:'a3',p2:'a4',winner:'a3',lastModifiedBy:'auto'}]; // a5,a6,a7 待機(3)
  env3.submitRound('A');
  assert(env3._getState().results.A.length===2, 'SUBMIT-4 2回戦・奇数で待機3名でも確定できる（待機者数でブロックしない）');

  // round2 で 0卓（pairings 空）かつ参加者あり → 退行的な空回戦をガードして確定しない
  var env4=loadEnv(); stateRound2(env4,'A',6);
  env4._getState().pairings.A=[];
  env4.submitRound('A');
  assert(env4._getState().results.A.length===1, 'SUBMIT-5 2回戦で0卓（参加者あり）は空回戦をガードして確定しない');
  assert(env4._alerts.join('\n').indexOf('組み合わせがありません')>=0, 'SUBMIT-6 0卓ガード時は再生成を促すアラート');
}

// ============================================================
// LEFTOVER. getRoundLeftoverPlayers の境界（round1 / 未生成は []）。
// ============================================================
{
  var env=loadEnv();
  // round1（results 空）: 対象外で []
  var s=env.normalizeState({rounds:4,started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    players:{A:makePlayers('A',5),B:[]},
    pairings:{A:[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}],B:[]},results:{A:[],B:[]}});
  env._setState(s);
  assert(env.getRoundLeftoverPlayers('A').length===0, 'LEFTOVER-1 1回戦(results 空)は対象外で []（未割当は別 reader）');
  // 2回戦・pairings 未生成（空）: 対象外で []
  var env2=loadEnv(); stateRound2(env2,'A',5); // results 1 / pairings 空
  assert(env2.getRoundLeftoverPlayers('A').length===0, 'LEFTOVER-2 pairings 未生成(空)は対象外で []');
}

// ============================================================
// DISPLAY. buildCurrentPairingsHtml が待機者を明示（奇数）/ 出さない（偶数）。
// ============================================================
{
  var envOdd=loadEnv(); stateRound2(envOdd,'A',5);
  envOdd.generatePairing('A');
  var leftover=envOdd.getRoundLeftoverPlayers('A')[0];
  var htmlOdd=envOdd.buildCurrentPairingsHtml('A',2,false);
  assert(htmlOdd.indexOf('待機')>=0, 'DISPLAY-1 奇数2回戦は「待機」表示を出す');
  assert(htmlOdd.indexOf(leftover.name)>=0, 'DISPLAY-2 待機表示に待機者の氏名を含む');
  assert(htmlOdd.indexOf('不戦勝にはなりません')>=0, 'DISPLAY-3 「不戦勝にはなりません」を明記（誤解防止）');

  var envEven=loadEnv(); stateRound2(envEven,'A',6);
  envEven.generatePairing('A');
  var htmlEven=envEven.buildCurrentPairingsHtml('A',2,false);
  assert(htmlEven.indexOf('次の参加者が待機')<0, 'DISPLAY-4 偶数2回戦は待機表示を出さない（従来表示不変）');
}

// ============================================================
// ADD. addPlayer の通知ガード（未開始/1回戦中は confirm なし / 2回戦以降は confirm）。
// ============================================================
{
  // 未開始クラス: confirm なしで追加
  var envA=loadEnv();
  var sA=envA.normalizeState({rounds:4,started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  envA._setState(sA);
  envA._ctx.document.getElementById('inp-name').value='架空新規一郎';
  envA._ctx.document.getElementById('inp-class').value='A';
  envA.addPlayer();
  assert(envA._getState().players.A.length===1, 'ADD-1 未開始クラスは従来どおり追加できる');
  assert(envA._confirmCalls.length===0, 'ADD-2 未開始クラスの追加では確認 confirm を出さない');

  // 開始済み・1回戦中（results 空）: FRP 途中受付として confirm なしで追加
  var envB=loadEnv();
  var sB=envB.normalizeState({rounds:4,started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    players:{A:makePlayers('A',2),B:[]},
    pairings:{A:[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}],B:[]},results:{A:[],B:[]}});
  envB._setState(sB);
  envB._ctx.document.getElementById('inp-name').value='架空途中二郎';
  envB._ctx.document.getElementById('inp-class').value='A';
  envB.addPlayer();
  assert(envB._getState().players.A.length===3, 'ADD-3 開始済みでも1回戦中(results 空)は confirm なしで追加（途中受付）');
  assert(envB._confirmCalls.length===0, 'ADD-4 1回戦中の追加では確認を出さない');

  // 開始済み・2回戦以降（results>=1）+ confirm OK → 追加
  var envC=loadEnv({confirm:true}); stateRound2(envC,'A',4);
  envC._ctx.document.getElementById('inp-name').value='架空途中三郎';
  envC._ctx.document.getElementById('inp-class').value='A';
  envC.addPlayer();
  assert(envC._confirmCalls.length===1, 'ADD-5 2回戦以降の追加は confirm で通知/ガードする');
  assert(envC._getState().players.A.length===5, 'ADD-6 confirm OK なら追加される');

  // 開始済み・2回戦以降 + confirm キャンセル → 追加しない
  var envD=loadEnv({confirm:false}); stateRound2(envD,'A',4);
  envD._ctx.document.getElementById('inp-name').value='架空途中四郎';
  envD._ctx.document.getElementById('inp-class').value='A';
  envD.addPlayer();
  assert(envD._confirmCalls.length===1, 'ADD-7 2回戦以降はキャンセル可能な confirm を出す');
  assert(envD._getState().players.A.length===4, 'ADD-8 confirm キャンセルなら追加しない（ガード）');
}

// ============================================================
// RELOAD. 奇数2回戦の append 済み pairings が normalizeState 往復で復元・待機は派生で再計算。
// ============================================================
{
  var env=loadEnv(); stateRound2(env,'B',5);
  env.generatePairing('B');
  var prBefore=env._getState().pairings.B;
  var leftBefore=env.getRoundLeftoverPlayers('B')[0].id;
  var saved=env._ctx.localStorage.getItem(env.STORAGE_KEY);
  assert(!!saved, 'RELOAD-1 generatePairing は localStorage に保存される');
  var reloaded=env.normalizeState(JSON.parse(saved));
  assert(reloaded.pairings.B.length===prBefore.length, 'RELOAD-2 reload 往復で卓数が復元される');
  assert(reloaded.results.B.length===1, 'RELOAD-3 reload 後も results（1回戦）が保持される');
  // match 正準形（{p1,p2,winner,lastModifiedBy}）以外のキーが増えていない
  var keys=Object.keys(reloaded.pairings.B[0]).sort().join(',');
  assert(keys==='lastModifiedBy,p1,p2,winner', 'RELOAD-4 match のスキーマが不変（{p1,p2,winner,lastModifiedBy}）');
  // 待機は派生で再計算される（保存していない）
  var reEnv=loadEnv(); reEnv._setState(reloaded);
  var glp=reEnv.getRoundLeftoverPlayers('B');
  assert(glp.length===1 && glp[0].id===leftBefore, 'RELOAD-5 待機者は保存されず派生で同じ1名が再計算される');
}

// ============================================================
// F2 (Codex P1). 待機ローテーション: 過去回戦で不在(sitOut 大)の選手は待機に選ばれず対局に入る。
//   2名クラス(a1 が a2 に勝利)へ a3 を途中追加した想定。a3 は1回戦不在＝sitOut=1 なので、
//   待機候補順(sitOut 昇順→勝ち数昇順)では最後尾になり、何度試行しても待機に選ばれない。
// ============================================================
{
  var env=loadEnv();
  var s=env.normalizeState({rounds:5,started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    players:{A:[
      {id:'a1',name:'架空甲',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'a2',name:'架空乙',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空丙',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''}
    ],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  s.results.A=[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];   // 1回戦は a1,a2 のみ・a3 不在(sitOut=1)
  env._setState(s);
  var a3Waited=false;
  for(var tF2=0;tF2<24;tF2++){
    env.generatePairing('A');
    var loF2=env.getRoundLeftoverPlayers('A');
    if(loF2.length===1&&loF2[0].id==='a3')a3Waited=true;
    env._getState().pairings.A=[];   // 次試行のため pairings をクリア（results は不変）
  }
  assert(!a3Waited,'F2-1 過去回戦で不在(sitOut=1)の選手は24回試行しても待機に選ばれない（連続待機の固定を防ぐ）');
}

// ============================================================
// F3 (Codex P1). 再戦回避: 待機を固定せず候補を試し、回避可能な再戦(a1対a2)を強制しない。
//   a1 が a2 に勝った後 a3 を加えた3名。a1対a2 を再戦させず a3 を絡めれば再戦を回避できるので、
//   待機を a1/a2 のいずれかにして a?-a3 を組む（a1対a2 の卓は作らない）。
// ============================================================
{
  var env=loadEnv();
  var s=env.normalizeState({rounds:5,started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    players:{A:[
      {id:'a1',name:'架空甲',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'a2',name:'架空乙',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空丙',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''}
    ],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  s.results.A=[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];   // a1対a2 は対局済み（再戦回避対象）
  env._setState(s);
  var rematch=false,allOneTable=true;
  for(var tF3=0;tF3<24;tF3++){
    env.generatePairing('A');
    var prF3=env._getState().pairings.A;
    if(prF3.length!==1)allOneTable=false;
    for(var iF3=0;iF3<prF3.length;iF3++){
      var mF3=prF3[iF3];
      if((mF3.p1==='a1'&&mF3.p2==='a2')||(mF3.p1==='a2'&&mF3.p2==='a1'))rematch=true;
    }
    env._getState().pairings.A=[];
  }
  assert(allOneTable,'F3-1 3名は毎回 1卓+待機1名（0卓に潰れない）');
  assert(!rematch,'F3-2 24回試行しても a1対a2 の再戦を強制しない（待機候補を試して再戦回避を優先）');
}

console.log('');
console.log('  ISSUE-272 PAIRING-ODD-LEFTOVER テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
