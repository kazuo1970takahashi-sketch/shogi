#!/usr/bin/env node
// FRP-IMPL-004B: 初回 round の部分手合い組成中に「組み合わせを再生成」(repairBtn_) で
//   既存 FRP append 手合いを破壊しないよう、再生成ボタン gate を固定するテスト。
//   設計: docs/specs/20260617_frp_impl_004_save_restore_regenerate_design.md (§5.4 / §5.4.1 / §5.4.2)
//   範囲: shouldShowRegenerateButton(cls) の predicate / buildCurrentPairingsHtml 出力 gate /
//     DOM bind 対象の有無 / 強化 confirm（最小限）/ A-B 独立 / generatePairing 本体不変。
//   004C（UI 文言の補助文増量）は対象外。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_frp_impl_004b.js <html>');process.exit(1);}
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
  // _strictIds=null → getElementById は自動生成（004A 互換）。Set を入れると未知 id は null を返す
  //   ＝実 DOM 相当（描画 HTML に出ていない id は bind 対象なし）を再現できる。
  const ctx={ _elements:elements, _confirmCalls:[], _confirmReturn:true, _strictIds:null };
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      disabled:false, checked:false, type:'', style:{}, _attrs:{}, childNodes:[], _listeners:{},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      querySelector:function(){ return null; },
      querySelectorAll:function(){ return []; }
    };
  }
  ctx._makeNode=makeNode;
  ctx.registerHtmlIds=function(html){
    const set=new Set(); const re=/id="([^"]+)"/g; let m;
    while((m=re.exec(html))!==null)set.add(m[1]);
    ctx._strictIds=set; return set;
  };
  ctx.relaxIds=function(){ ctx._strictIds=null; };
  const docMock={
    getElementById:function(id){
      if(ctx._strictIds && !ctx._strictIds.has(id)) return null;
      if(!elements[id]){ const n=makeNode('div'); n.id=id; elements[id]=n; }
      return elements[id];
    },
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
  ctx.document=docMock; ctx.window=winMock; ctx.localStorage=localStorageMock;
  return ctx;
}

function loadEnv(){
  const ctx = makeContext();
  const warns = [];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const confirmMock = function(msg){ ctx._confirmCalls.push(String(msg==null?'':msg)); return ctx._confirmReturn; };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       save:save,
       load:load,
       readPersistedState:readPersistedState,
       STORAGE_KEY:STORAGE_KEY,
       isClassStarted:isClassStarted,
       getUnassignedFirstRoundPlayers:getUnassignedFirstRoundPlayers,
       shouldShowRegenerateButton:shouldShowRegenerateButton,
       buildCurrentPairingsHtml:buildCurrentPairingsHtml,
       bindTournamentEvents:bindTournamentEvents,
       generatePairing:generatePairing,
       __setAppModalTestResolver:(typeof __setAppModalTestResolver==='function'?__setAppModalTestResolver:null),
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, confirmMock, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(){ /* no-op timer */ }
  );
  api._ctx = ctx;
  api._warns = warns;
  // IN-APP-MODAL-001 (#606): 再生成ボタンの確認は native confirm→appConfirm に移行した。
  //   appConfirm は既定で DOM モーダルを出すが、テストでは __setAppModalTestResolver で同期解決に切替え、
  //   従来の confirm スタブ（_confirmCalls/_confirmReturn）へ配線＝既存 C 系 assert を挙動同値のまま維持する。
  if (typeof api.__setAppModalTestResolver === 'function') {
    api.__setAppModalTestResolver(function(type, msg){ ctx._confirmCalls.push(String(msg==null?'':msg)); return ctx._confirmReturn; });
  }
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

function buildPlayers(cls, ids){
  return ids.map(function(id,i){return {id:id,name:'架空'+id,cls:cls,member:'member',grade:'ippan',entry_no:i+1,yomi:''};});
}
function pairsOf(list){
  return list.map(function(pr){return {p1:pr[0],p2:pr[1],winner:(pr[2]||null),lastModifiedBy:'auto'};});
}
function baseState(){
  return {
    players:{A:[],B:[]},
    rounds:4,
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}
// spec: { playersA, pairsA, resultsA, startedA, playersB, pairsB, resultsB, startedB }
function setupState(env, spec){
  const s = env.normalizeState(baseState());
  s.players.A = buildPlayers('A', spec.playersA||[]);
  s.players.B = buildPlayers('B', spec.playersB||[]);
  s.pairings.A = pairsOf(spec.pairsA||[]);
  s.pairings.B = pairsOf(spec.pairsB||[]);
  s.results.A = spec.resultsA||[];
  s.results.B = spec.resultsB||[];
  s.classes[0].started = !!spec.startedA;
  s.classes[1].started = !!spec.startedB;
  s.started = s.classes[0].started || s.classes[1].started;
  env._setState(s);
  return s;
}

// ============================================================
// P. shouldShowRegenerateButton(cls) predicate
// ============================================================
{
  const env = loadEnv();
  // P1: started・results 空・pairings>0・未割当>0（a5 が未割当）→ false（非表示）
  setupState(env,{playersA:['a1','a2','a3','a4','a5'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  assert(env.shouldShowRegenerateButton('A')===false, 'P1 部分手合い組成中（results 空・未割当>0）は false（非表示）');

  // P2: started・results 空・pairings>0・未割当0（4名全員ペア済み）→ true（表示）
  setupState(env,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  assert(env.shouldShowRegenerateButton('A')===true, 'P2 未割当0 は true（由来を問わず表示してよい）');

  // P3: results 非空 → true（既存保護ロジックに委ねる）。未割当判定はここに含めない
  setupState(env,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]], startedA:true});
  assert(env.shouldShowRegenerateButton('A')===true, 'P3 results 非空（2回戦以降/確定後）は true（既存挙動）');

  // P4: pairings 空 → true（既存どおり。描画側で別途 '' になる）
  setupState(env,{playersA:['a1','a2'], pairsA:[], resultsA:[], startedA:true});
  assert(env.shouldShowRegenerateButton('A')===true, 'P4 pairings 空は true（非表示条件に含めない）');

  // P5: 未開始クラス → true（既存挙動を壊さない）
  setupState(env,{playersA:['a1','a2','a3','a4','a5'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:false});
  assert(env.shouldShowRegenerateButton('A')===true, 'P5 未開始クラスは true（gate しない）');

  // P6: A/B 独立（predicate）= A 部分手合い組成中(false) でも B は未割当0(true)
  setupState(env,{
    playersA:['a1','a2','a3','a4','a5'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true,
    playersB:['b1','b2'], pairsB:[['b1','b2']], resultsB:[], startedB:true
  });
  assert(env.shouldShowRegenerateButton('A')===false, 'P6a 同一 state で A は false');
  assert(env.shouldShowRegenerateButton('B')===true, 'P6b 同一 state で B は true（A の状態に影響されない）');
}

// ============================================================
// H. buildCurrentPairingsHtml 出力 gate（HTML 文字列レベル）
// ============================================================
{
  const env = loadEnv();
  // H1: 部分手合い組成中 → repairBtn_A を出力しない
  setupState(env,{playersA:['a1','a2','a3','a4','a5'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  let html = env.buildCurrentPairingsHtml('A', 1, false);
  assert(html.indexOf('id="repairBtn_A"')<0, 'H1 部分手合い組成中の HTML に repairBtn_A が出ない');
  assert(html.indexOf('id="submitBtn_A"')>=0, 'H1b 確定ボタン submitBtn_A は従来どおり出る（gate 対象は再生成のみ）');

  // H2: 未割当0（通常開始 round1 相当：4名全員ペア済み）→ repairBtn_A を出力する
  setupState(env,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  html = env.buildCurrentPairingsHtml('A', 1, false);
  assert(html.indexOf('id="repairBtn_A"')>=0, 'H2 未割当0（通常開始 round1）の HTML に repairBtn_A が出る');

  // H3: results 非空（2回戦）→ repairBtn_A を出力する
  setupState(env,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a3'],['a2','a4']], resultsA:[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'},{p1:'a3',p2:'a4',winner:'a3',lastModifiedBy:'auto'}]], startedA:true});
  html = env.buildCurrentPairingsHtml('A', 2, false);
  assert(html.indexOf('id="repairBtn_A"')>=0, 'H3 results 非空（2回戦）の HTML に repairBtn_A が出る');

  // H4/H5: A/B 独立（出力）= A 部分手合い(repairBtn 無) と B 未割当0(repairBtn 有) を同一 state で
  setupState(env,{
    playersA:['a1','a2','a3','a4','a5'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true,
    playersB:['b1','b2'], pairsB:[['b1','b2']], resultsB:[], startedB:true
  });
  const htmlA = env.buildCurrentPairingsHtml('A', 1, false);
  const htmlB = env.buildCurrentPairingsHtml('B', 1, false);
  assert(htmlA.indexOf('id="repairBtn_A"')<0, 'H4 A 部分手合い組成中は repairBtn_A 非表示');
  assert(htmlB.indexOf('id="repairBtn_B"')>=0, 'H5 同一 state で B(未割当0) は repairBtn_B 表示（A に影響されない）');
}

// ============================================================
// B. DOM bind 対象の有無（strictIds で実 DOM 相当を再現）
// ============================================================
{
  // B1/B2: 部分手合い組成中 → repairBtn は描画されず、bind 対象も null（クリック不能）
  const env = loadEnv();
  setupState(env,{playersA:['a1','a2','a3','a4','a5'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  const htmlA = env.buildCurrentPairingsHtml('A', 1, false);
  env._ctx.registerHtmlIds(htmlA); // 描画 HTML に出た id だけが存在する DOM を再現
  env.bindTournamentEvents('A');
  assert(env._ctx.document.getElementById('repairBtn_A')===null, 'B1 部分手合い組成中は getElementById(repairBtn_A) が null（bind 対象なし＝クリック不能）');
  const sbNode = env._ctx.document.getElementById('submitBtn_A');
  assert(!!sbNode && sbNode._listeners.click && sbNode._listeners.click.length>=1, 'B2 submitBtn_A は存在し bind される（bind 自体は走っている）');

  // B3/B4: 未割当0 → repairBtn が描画され、bind 対象が存在しクリック可能
  const env2 = loadEnv();
  setupState(env2,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  const htmlA2 = env2.buildCurrentPairingsHtml('A', 1, false);
  env2._ctx.registerHtmlIds(htmlA2);
  env2.bindTournamentEvents('A');
  const rbNode = env2._ctx.document.getElementById('repairBtn_A');
  assert(!!rbNode, 'B3 未割当0 では getElementById(repairBtn_A) が存在する');
  assert(!!rbNode && rbNode._listeners.click && rbNode._listeners.click.length>=1, 'B4 未割当0 では repairBtn_A に click が bind される');
}

// ============================================================
// C. 強化 confirm（最小限）。文言全文固定は避け危険語句/呼出有無で確認
// ============================================================
function clickRepair(env, cls){
  const node = env._ctx.document.getElementById('repairBtn_'+cls);
  if(!node || !node._listeners.click) return false;
  const handlers = node._listeners.click.slice();
  for(let i=0;i<handlers.length;i++){ try{ handlers[i](); }catch(e){ /* renderTournament 等の描画副作用は無視 */ } }
  return true;
}
{
  // C1-C3: 未割当0・results 空・winner なし → 「作り直す」旨の confirm が出て、false なら generatePairing しない
  const env = loadEnv();
  setupState(env,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  env._ctx.relaxIds();
  env._ctx.localStorage.removeItem(env.STORAGE_KEY);
  env._ctx._confirmCalls=[]; env._ctx._confirmReturn=false;
  env.bindTournamentEvents('A');
  const clicked = clickRepair(env,'A');
  assert(clicked===true, 'C0 未割当0 では repairBtn_A がクリック可能（前提）');
  assert(env._ctx._confirmCalls.length>=1, 'C1 再生成クリックで confirm が呼ばれる');
  const msg = env._ctx._confirmCalls[env._ctx._confirmCalls.length-1];
  assert(msg.indexOf('作り直')>=0 && msg.indexOf('破棄')>=0, 'C2 confirm 文言に危険語句（作り直す/破棄）が含まれる');
  assert(msg.indexOf('勝敗')<0, 'C2b winner なしのときは「勝敗」ベースの文言ではない（新分岐）');
  assert(env._ctx.localStorage.getItem(env.STORAGE_KEY)===null, 'C3 confirm=false なら generatePairing が走らず save されない（破壊ブロック）');

  // C4: winner 入力済み → 既存の「勝敗が消える」保護 confirm を維持（最優先）
  const envW = loadEnv();
  setupState(envW,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2',null],['a3','a4',null]], resultsA:[], startedA:true});
  const sW = envW._getState(); sW.pairings.A[0].winner='a1'; envW._setState(sW); // results 空のまま winner だけ入力
  envW._ctx.relaxIds();
  envW._ctx.localStorage.removeItem(envW.STORAGE_KEY);
  envW._ctx._confirmCalls=[]; envW._ctx._confirmReturn=false;
  envW.bindTournamentEvents('A');
  clickRepair(envW,'A');
  assert(envW._ctx._confirmCalls.length>=1, 'C4 winner 入力済みでも confirm が呼ばれる');
  assert(envW._ctx._confirmCalls[envW._ctx._confirmCalls.length-1].indexOf('勝敗')>=0, 'C4b winner 入力済みは既存の「勝敗が消える」保護文言（壊さない）');
  assert(envW._ctx.localStorage.getItem(envW.STORAGE_KEY)===null, 'C4c confirm=false なら勝敗保護で再生成しない');

  // C5: confirm=true なら従来どおり generatePairing が走る（save される＝proceeds）
  const envT = loadEnv();
  setupState(envT,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2'],['a3','a4']], resultsA:[], startedA:true});
  envT._ctx.relaxIds();
  envT._ctx.localStorage.removeItem(envT.STORAGE_KEY);
  envT._ctx._confirmCalls=[]; envT._ctx._confirmReturn=true;
  envT.bindTournamentEvents('A');
  clickRepair(envT,'A');
  assert(envT._ctx.localStorage.getItem(envT.STORAGE_KEY)!==null, 'C5 confirm=true なら generatePairing→save が走る（再生成は許可される）');
}

// ============================================================
// G. generatePairing 本体は不変（gate は UI 層のみ。直接呼出は上書きし得る＝設計上許容）
// ============================================================
{
  const env = loadEnv();
  setupState(env,{playersA:['a1','a2','a3','a4'], pairsA:[['a1','a2']], resultsA:[], startedA:true,
                  playersB:['b1','b2'], pairsB:[['b1','b2']], resultsB:[], startedB:true});
  // gate により UI 上は（未割当>0 で）非表示になるが、関数を直接呼べば従来どおり全員上書きされる
  env.generatePairing('A');
  const s = env._getState();
  assert(s.pairings.A.length===2, 'G1 generatePairing 直接呼出は state.pairings[A] を全員(4名→2組)で上書きする（本体不変・破壊的性質を維持）');
  const idsA = s.pairings.A.reduce(function(acc,m){acc.push(m.p1,m.p2);return acc;},[]).sort();
  assert(idsA.join(',')==='a1,a2,a3,a4', 'G1b 上書き後の pairings は A の全参加者を含む');
  assert(s.pairings.B.length===1 && s.pairings.B[0].p1==='b1' && s.pairings.B[0].p2==='b2', 'G2 generatePairing(A) は B の pairings に影響しない（cls スコープ・A/B 独立）');
}

console.log('');
console.log('  FRP-IMPL-004B テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
