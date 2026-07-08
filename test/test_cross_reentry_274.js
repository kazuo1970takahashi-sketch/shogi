#!/usr/bin/env node
// ISSUE #274 [QA][P2]: 1局目 append の「クロス再入で正常なのに誤った赤エラー」回帰テスト。
//   背景: P1「1卓追加」(onClickAddOneTable) / P2「まとめて作成」(onClickAddAllTables) / 選択式
//     (onClickAppendFirstRound) の再入防止フラグが **ハンドラ毎に独立** だと、片方の confirm 表示中に
//     もう片方を発火させるとクロス再入を防げず、後発 append が appendFirstRoundPairs の正規の二重割当
//     ガード（'すでに1局目の対局がある参加者が含まれています'）を踏んで「データは正常なのに誤った赤エラー」
//     を表示する（QA P2）。修正は3導線で **共有の単一フラグ firstRoundAppendInFlight** を使うこと。
//   観点:
//     X1 P1→P2 クロス再入: P1 の confirm 表示中に P2 を発火 → P2 はブロックされ confirm は1回・誤赤エラー
//        なし・P1 の1卓のみ・重複なし。
//     X2 P2→P1 クロス再入: P2 の confirm 表示中に P1 を発火 → P1 はブロックされ confirm は1回・誤赤エラー
//        なし・P2 の全卓のみ・重複なし。
//     X3 P1→選択式 クロス再入: P1 の confirm 表示中に onClickAppendFirstRound を発火 → 選択式は共有フラグで
//        ブロック（ガードより先には進まない＝'2人以上を選択してください' warn すら出さない）・P1 の1卓のみ。
//     G1 正規ガード維持: 既に1局目に割当済みの参加者を含む append を appendFirstRoundPairs に直接渡すと、
//        従来どおり 'すでに1局目の対局がある参加者が含まれています' の err を表示し追加しない（本物の異常検知は残す）。
//     N1/N2 非回帰: 単独 P1 / 単独 P2 の正常系は誤エラーなしで従来どおり卓を作る。
//   実装方針上、未修正 base（独立フラグ）では X1/X2/X3 が FAIL する（回帰テスト）。データは完全架空のみ。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_cross_reentry_274.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// リッチ DOM mock（test_progressive_pairing_p2.js と同型）: addEventListener が callback を保持する。
function makeContext(){
  const elements={};
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      disabled:false, checked:false, type:'', style:{}, _attrs:{}, childNodes:[], _listeners:{}, _frpBoxes:null,
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      querySelector:function(){ return null; },
      querySelectorAll:function(sel){
        if(sel==='.frp-unassigned-cb' && Array.isArray(this._frpBoxes)) return this._frpBoxes.slice();
        return [];
      },
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

// opts.confirm で native confirm の戻り（と副作用）を注入できる（クロス再入の再現に使う）。
function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  const warns = [];
  const confirmCalls = [];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  const confirmFn = function(message){ confirmCalls.push(String(message)); return (typeof opts.confirm==='function')?opts.confirm(message):(opts.confirm!==false); };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState, save:save, STORAGE_KEY:STORAGE_KEY,
       isClassStarted:isClassStarted,
       getUnassignedFirstRoundPlayers:getUnassignedFirstRoundPlayers,
       buildFirstRoundPartialPairs:buildFirstRoundPartialPairs,
       appendFirstRoundPairs:appendFirstRoundPairs,
       onClickAddOneTable:onClickAddOneTable,
       onClickAddAllTables:onClickAddAllTables,
       onClickAppendFirstRound:onClickAppendFirstRound,
       renderTournament:renderTournament,
       __setAppModalTestResolver:(typeof __setAppModalTestResolver==='function'?__setAppModalTestResolver:null),
       _setState:function(s){state=s;}, _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, confirmFn, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx; api._warns = warns; api._confirmCalls = confirmCalls;
  // IN-APP-MODAL-001 (#606): FRP追加の確認は appConfirm へ移行。__setAppModalTestResolver を confirmFn へ配線し
  //   （confirmCalls への push・opts.confirm 戻り値・クロス再入副作用を保持）、クロス再入ガード X 系 assert を挙動同値で維持。
  if(typeof api.__setAppModalTestResolver==='function'){ api.__setAppModalTestResolver(function(type,message){ return confirmFn(message); }); }
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// reg-msg（showMsg の出力先）の innerHTML を読む。未生成なら ''。
function regMsg(env){ const el=env._ctx._elements['reg-msg']; return (el&&el.innerHTML)||''; }
// pairings に同一 pid が複数回出ていないか（重複検査）。
function hasDup(pairings){
  const seen={};
  for(let i=0;i<pairings.length;i++){ const m=pairings[i]; if(!m)continue;
    for(const pid of [m.p1,m.p2]){ if(!pid)continue; if(seen[pid])return true; seen[pid]=true; } }
  return false;
}

// 架空 state: A=6名（偶数・受付順 entry_no 昇順）, B=2名, 全未開始, rounds=4。
function fxState(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
      {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''},
      {id:'a5',name:'架空五郎',cls:'A',member:'member',grade:'ippan',entry_no:5,yomi:''},
      {id:'a6',name:'架空六郎',cls:'A',member:'member',grade:'ippan',entry_no:6,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

// 指定クラスを部分開始済み（started=true, results 空）にして env に流す。
function startedClass(env, cls){
  const s = env.normalizeState(fxState());
  for(let i=0;i<s.classes.length;i++){ if(s.classes[i].id===cls){ s.classes[i].started=true; } }
  s.started=true;
  env._setState(s);
  return env._getState();
}

// ============================================================
// X1. P1→P2 クロス再入: P1 の confirm 表示中に P2 を発火しても、共有フラグでブロック＝誤赤エラーなし。
//     （未修正 base＝独立フラグでは P2 が走って全員 append → P1 の append が二重割当を誤検知し赤エラー）
// ============================================================
{
  let envRef, fired=false;
  const env = loadEnv({confirm:function(){
    if(envRef && !fired){ fired=true; envRef.onClickAddAllTables('A'); }   // P1 の confirm 中に P2 を発火
    return true;
  }});
  envRef = env; startedClass(env,'A');
  env.onClickAddOneTable('A');
  const st = env._getState();
  assert(env._confirmCalls.length===1, 'X1-1 P1 の confirm 中に P2 を発火しても共有フラグでブロック＝confirm は1回だけ');
  assert(st.pairings.A.length===1, 'X1-2 P1 の1卓のみ（クロス再入の P2 は append しない）');
  assert(st.pairings.A[0].p1==='a1' && st.pairings.A[0].p2==='a2', 'X1-3 作られた1卓は受付順の先頭2名(a1,a2)');
  assert(regMsg(env).indexOf('alert-err')<0, 'X1-4 正常完了なので誤った赤エラーを出さない（reg-msg に alert-err なし）');
  assert(regMsg(env).indexOf('すでに1局目の対局がある参加者が含まれています')<0, 'X1-5 誤検知の二重割当エラー文言を出さない');
  assert(!hasDup(st.pairings.A), 'X1-6 重複なし（データは正常）');
  assert(env.getUnassignedFirstRoundPlayers('A').length===4, 'X1-7 残り4名は未割当のまま（次の卓を作れる）');
}

// ============================================================
// X2. P2→P1 クロス再入: P2 の confirm 表示中に P1 を発火しても、共有フラグでブロック＝誤赤エラーなし。
// ============================================================
{
  let envRef, fired=false;
  const env = loadEnv({confirm:function(){
    if(envRef && !fired){ fired=true; envRef.onClickAddOneTable('A'); }   // P2 の confirm 中に P1 を発火
    return true;
  }});
  envRef = env; startedClass(env,'A');
  env.onClickAddAllTables('A');
  const st = env._getState();
  assert(env._confirmCalls.length===1, 'X2-1 P2 の confirm 中に P1 を発火しても共有フラグでブロック＝confirm は1回だけ');
  assert(st.pairings.A.length===3, 'X2-2 P2 の全卓のみ（6名→3卓）。クロス再入の P1 は append しない');
  assert(regMsg(env).indexOf('alert-err')<0, 'X2-3 正常完了なので誤った赤エラーを出さない（reg-msg に alert-err なし）');
  assert(regMsg(env).indexOf('すでに1局目の対局がある参加者が含まれています')<0, 'X2-4 誤検知の二重割当エラー文言を出さない');
  assert(!hasDup(st.pairings.A), 'X2-5 重複なし（データは正常）');
  assert(env.getUnassignedFirstRoundPlayers('A').length===0, 'X2-6 6名全員が割当済み');
}

// ============================================================
// X3. P1→選択式 クロス再入: 共有フラグは選択式 append（onClickAppendFirstRound）も同じく弾く。
//     （未修正 base では選択式が走り、未選択ゆえ '2人以上を選択してください' warn まで進む＝フラグ非共有の証跡）
// ============================================================
{
  let envRef, fired=false;
  const env = loadEnv({confirm:function(){
    if(envRef && !fired){ fired=true; envRef.onClickAppendFirstRound('A'); }   // P1 の confirm 中に選択式を発火
    return true;
  }});
  envRef = env; startedClass(env,'A');
  env.onClickAddOneTable('A');
  const st = env._getState();
  assert(env._confirmCalls.length===1, 'X3-1 P1 の confirm 中に選択式を発火しても共有フラグでブロック＝confirm は1回だけ');
  assert(st.pairings.A.length===1, 'X3-2 P1 の1卓のみ（クロス再入の選択式は走らない）');
  assert(regMsg(env).indexOf('2人以上を選択してください')<0, 'X3-3 選択式はガードより先に進まない（未選択 warn すら出ない＝共有フラグ）');
  assert(regMsg(env).indexOf('alert-err')<0, 'X3-4 誤った赤エラーを出さない');
}

// ============================================================
// G1. 正規の二重割当ガードは維持: 本物の異常（割当済み参加者を含む append）は従来どおり err で弾く。
// ============================================================
{
  const env = loadEnv(); startedClass(env,'A');
  // a1,a2 を先に1卓割当済みにする
  env.onClickAddOneTable('A');
  const before = env._getState().pairings.A.length;
  // a1（割当済み）を含むペアを appendFirstRoundPairs に直接渡す＝本物の二重割当
  const ret = env.appendFirstRoundPairs('A', [{p1:'a1', p2:'a3', winner:null, lastModifiedBy:'auto'}]);
  const st = env._getState();
  assert(ret===false, 'G1-1 割当済み参加者を含む append は false を返す（追加しない）');
  assert(regMsg(env).indexOf('すでに1局目の対局がある参加者が含まれています')>=0, 'G1-2 正規の二重割当ガードの err 文言を従来どおり表示');
  assert(regMsg(env).indexOf('alert-err')>=0, 'G1-3 これは本物の異常なので err（alert-err）で通知する');
  assert(st.pairings.A.length===before, 'G1-4 既存対局は変化しない（追加が拒否される）');
}

// ============================================================
// N1/N2. 単独 P1 / 単独 P2 の正常系は誤エラーなしで従来どおり（非回帰）。
// ============================================================
{
  const env1 = loadEnv(); startedClass(env1,'A');
  env1.onClickAddOneTable('A');
  assert(env1._getState().pairings.A.length===1 && regMsg(env1).indexOf('alert-err')<0, 'N1 単独 P1 は1卓・誤エラーなし');

  const env2 = loadEnv(); startedClass(env2,'A');
  env2.onClickAddAllTables('A');
  assert(env2._getState().pairings.A.length===3 && regMsg(env2).indexOf('alert-err')<0, 'N2 単独 P2 は3卓・誤エラーなし');
}

console.log('');
console.log('  ISSUE #274 クロス再入 誤赤エラー回帰テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
