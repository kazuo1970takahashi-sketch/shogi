#!/usr/bin/env node
// FRP-IMPL-004A: FRP append 手合いの保存復元 reload 不変条件テスト。
//   設計: docs/specs/20260617_frp_impl_004_save_restore_regenerate_design.md
//   本スライスの範囲: 保存スキーマを増やさず、append 済み pairings / leftover 派生 /
//     match-level メタ情報非保存 / A-B 独立を normalizeState(JSON.parse(saved)) と
//     actual load()/readPersistedState() 経路で固定する。
//   004B/004C（再生成ボタン gate / UI 文言調整）は対象外。shogi_v4.html は変更しない前提。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_frp_impl_004.js <html>');process.exit(1);}
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
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      querySelector:function(){ return null; },
      querySelectorAll:function(){ return []; }
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
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

function loadEnv(){
  const ctx = makeContext();
  const warns = [];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       save:save,
       load:load,
       readPersistedState:readPersistedState,
       pairingsMatchSnapshot:pairingsMatchSnapshot,
       STORAGE_KEY:STORAGE_KEY,
       getUnassignedFirstRoundPlayers:getUnassignedFirstRoundPlayers,
       buildFirstRoundPartialPairs:buildFirstRoundPartialPairs,
       appendFirstRoundPairs:appendFirstRoundPairs,
       buildCurrentPairingsHtml:buildCurrentPairingsHtml,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(){ /* no-op timer */ }
  );
  api._ctx = ctx;
  api._warns = warns;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

function fxState(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
      {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''},
      {id:'a5',name:'架空五郎',cls:'A',member:'member',grade:'ippan',entry_no:5,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'b3',name:'架空梅子',cls:'B',member:'member',grade:'ippan',entry_no:3,yomi:''}
    ]},
    rounds:4,
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

function seedPartialState(env){
  const s = env.normalizeState(fxState());
  s.classes[0].started=true;
  s.classes[1].started=true;
  s.started=true;
  // A は既存1ペア + 追加予定2名 + leftover 1名。B は独立性確認用に既存 pairings を持つ。
  s.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}];
  s.pairings.B=[{p1:'b1',p2:'b2',winner:null,lastModifiedBy:'auto'}];
  s.results.A=[];
  s.results.B=[];
  env._setState(s);
  return s;
}

function matchHasNoMeta(match){
  return match &&
    !Object.prototype.hasOwnProperty.call(match,'round') &&
    !Object.prototype.hasOwnProperty.call(match,'table') &&
    !Object.prototype.hasOwnProperty.call(match,'source') &&
    !Object.prototype.hasOwnProperty.call(match,'generatedBy') &&
    !Object.prototype.hasOwnProperty.call(match,'leftover');
}

function allMatchesHaveNoMeta(stateObj, cls){
  const matches = (stateObj.pairings && stateObj.pairings[cls]) || [];
  for(let i=0;i<matches.length;i++){
    if(!matchHasNoMeta(matches[i]))return false;
  }
  return true;
}

function ids(arr){ return arr.map(function(p){return p.id;}); }

// ============================================================
// R. normalizeState(JSON.parse(saved)) 相当の reload 往復
// ============================================================
{
  const env = loadEnv();
  seedPartialState(env);
  const built = env.buildFirstRoundPartialPairs([
    {id:'a3',entry_no:3},
    {id:'a4',entry_no:4},
    {id:'a5',entry_no:5}
  ]);
  assert(built.pairs.length===1 && built.leftover && built.leftover.id==='a5', 'R0 奇数選択は1ペア + leftover(a5) を返す');
  assert(env.appendFirstRoundPairs('A', built.pairs)===true, 'R1 appendFirstRoundPairs は A に1ペアを append');

  const saved = env._ctx.localStorage.getItem(env.STORAGE_KEY);
  assert(typeof saved==='string' && saved.length>0, 'R2 save 後 localStorage に state JSON が保存される');
  const raw = JSON.parse(saved);
  assert(raw.pairings.A.length===2, 'R3 raw persisted pairings.A は既存+append の2組');
  assert(raw.pairings.A[1].p1==='a3' && raw.pairings.A[1].p2==='a4', 'R4 raw persisted append match の p1/p2 は a3/a4');
  assert(raw.pairings.A[1].winner===null, 'R5 raw persisted append match の winner は null');
  assert(raw.pairings.A[1].lastModifiedBy==='auto', 'R6 raw persisted append match の lastModifiedBy は auto');
  assert(allMatchesHaveNoMeta(raw,'A'), 'R7 raw persisted match に round/table/source/generatedBy/leftover を保存しない');
  assert(!Object.prototype.hasOwnProperty.call(raw,'leftover'), 'R8 state top-level に leftover を保存しない');

  const restored = env.normalizeState(JSON.parse(saved));
  assert(restored.pairings.A.length===2, 'R9 normalize reload 後も pairings.A は2組で残る');
  assert(restored.pairings.A[0].p1==='a1' && restored.pairings.A[0].p2==='a2', 'R10 normalize reload 後も既存 match の順序/p1/p2 を保持');
  assert(restored.pairings.A[1].p1==='a3' && restored.pairings.A[1].p2==='a4', 'R11 normalize reload 後も append match の p1/p2 を保持');
  assert(restored.pairings.A[0].winner===null && restored.pairings.A[1].winner===null, 'R12 normalize reload 後も winner は null のまま保持');
  assert(restored.pairings.A[0].lastModifiedBy==='auto' && restored.pairings.A[1].lastModifiedBy==='auto', 'R13 normalize reload 後も lastModifiedBy は auto のまま保持');
  assert(allMatchesHaveNoMeta(restored,'A'), 'R14 normalize reload 後も match-level メタ情報を復元しない');
  assert(restored.results.A.length===0, 'R15 results 空の初回 round 状態でも pairings は消えず results は空を維持');
  assert(restored.classes[0].started===true && restored.started===true, 'R16 class started と互換 state.started の整合を維持');

  env._setState(restored);
  const unassignedA = ids(env.getUnassignedFirstRoundPlayers('A'));
  assert(unassignedA.indexOf('a5')>=0, 'R17 leftover a5 は保存値でなく派生未割当として reload 後も残る');
  assert(unassignedA.indexOf('a1')<0 && unassignedA.indexOf('a2')<0 && unassignedA.indexOf('a3')<0 && unassignedA.indexOf('a4')<0, 'R18 pairings の p1/p2 は reload 後の未割当から除外される');
}

// ============================================================
// L. actual load() / readPersistedState() 経路も1本固定
// ============================================================
{
  const env = loadEnv();
  seedPartialState(env);
  env.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  const beforeLoad = env._getState();
  const persisted = env.readPersistedState();
  assert(!!persisted && persisted.pairings.A.length===2, 'L1 readPersistedState は normalized pairings.A 2組を返す');
  assert(env.pairingsMatchSnapshot(persisted.pairings.A, beforeLoad.pairings.A)===true, 'L2 readPersistedState 経路でも pairingsMatchSnapshot が一致');

  env._setState(env.normalizeState(fxState())); // in-memory を別状態にしてから actual load()
  env.load();
  const loaded = env._getState();
  assert(loaded.pairings.A.length===2 && loaded.pairings.A[1].p1==='a3' && loaded.pairings.A[1].p2==='a4', 'L3 actual load() 後も append match を復元');
  assert(loaded.pairings.A[1].winner===null && loaded.pairings.A[1].lastModifiedBy==='auto', 'L4 actual load() 後も winner=null / lastModifiedBy=auto');
  assert(ids(env.getUnassignedFirstRoundPlayers('A')).indexOf('a5')>=0, 'L5 actual load() 後も leftover は派生未割当として残る');
}

// ============================================================
// M. 派生メタ情報: 卓番号=index+1、round=results.length+1
// ============================================================
{
  const env = loadEnv();
  seedPartialState(env);
  env.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  const st = env._getState();
  const roundNum = st.results.A.length + 1;
  assert(roundNum===1, 'M1 現 round は保存値でなく results.length+1 (=1) から派生');
  const html = env.buildCurrentPairingsHtml('A', roundNum, false);
  assert(html.indexOf('1回戦 組み合わせ')>=0 && html.indexOf('1 / 4回戦')>=0, 'M2 round 表示は派生 roundNum から描画される');
  // TABLE-NO-REMOVE-001 (#941): 卓番号を撤去したので「第 N 卓」の命題は消えた。
  //   ★ 生きている命題は「カードが pairings 配列の順に index 付きで描かれる」ことそのもの。
  //     id の連番（wb_A_0_p1 / wb_A_1_p1）で測る＝index が描画に効いていることを見る。
  assert(html.indexOf('第 ')<0 && html.indexOf(' 卓</div>')<0, 'M3a 卓番号バッジは描画されない');
  const i0 = html.indexOf('id="wb_A_0_p1"'), i1 = html.indexOf('id="wb_A_1_p1"');
  assert(i0>=0 && i1>=0 && i0<i1, 'M3 カードは pairings 配列の順に index 付きで描画される');
  const saved = JSON.parse(env._ctx.localStorage.getItem(env.STORAGE_KEY));
  assert(!Object.prototype.hasOwnProperty.call(saved.pairings.A[0],'table') && !Object.prototype.hasOwnProperty.call(saved.pairings.A[1],'table'), 'M4 卓番号 table は match に保存しない');
  assert(!Object.prototype.hasOwnProperty.call(saved.pairings.A[0],'round') && !Object.prototype.hasOwnProperty.call(saved.pairings.A[1],'round'), 'M5 round は match に保存しない');
}

// ============================================================
// ISO. A/B クラス独立
// ============================================================
{
  const env = loadEnv();
  seedPartialState(env);
  env.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  const restored = env.normalizeState(JSON.parse(env._ctx.localStorage.getItem(env.STORAGE_KEY)));
  assert(restored.pairings.A.length===2, 'ISO1 A は既存+append の2組');
  assert(restored.pairings.B.length===1 && restored.pairings.B[0].p1==='b1' && restored.pairings.B[0].p2==='b2', 'ISO2 B の pairings は reload 後も混線せず保持');
  assert(restored.results.A.length===0 && restored.results.B.length===0, 'ISO3 A/B の results はそれぞれ空のまま保持');
  assert(restored.classes[0].started===true && restored.classes[1].started===true, 'ISO4 A/B の started は独立に保持');
  env._setState(restored);
  const unassignedB = ids(env.getUnassignedFirstRoundPlayers('B'));
  assert(unassignedB.length===1 && unassignedB[0]==='b3', 'ISO5 B の未割当は B の pairings から派生し、A の append に影響されない');
}

console.log('');
console.log('  FRP-IMPL-004A テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
