#!/usr/bin/env node
// PROGRESSIVE-PAIRING-IMPL-P2: 1局目逐次手合「クラス別『未手合いをまとめて1局目作成』」単体テスト。
//   正本仕様: ai-requests/2026-06-20_progressive-pairing-CONFIRMED-spec.md（Phase P2）
//   依頼:     ai-requests/2026-06-20_claude-code_progressive-pairing-impl-phase2.md
//   スコープ: 部分開始中クラスの未手合い（getUnassignedFirstRoundPlayers＝受付順＝entry_no 昇順）の
//     「全員」を 2人ずつペア化して round=1 の卓をまとめて append する onClickAddAllTables と、その導線
//     ボタン/bind を検証する。実装は追加のみ。生成は既存 buildFirstRoundPartialPairs（偶数=全ペア・奇数=
//     末尾1人 leftover）、append は既存 appendFirstRoundPairs に委譲し、待機（奇数末尾1人）は派生
//     getUnassignedFirstRoundPlayers に自動的に残す（state に二重保存しない）。P1「1卓追加」と併置。
//   観点（CONFIRMED Phase P2 受入）:
//     P2-1 まとめて(偶数): 未手合い全員を受付順で2人ずつ全卓（4名→2卓 a1a2/a3a4）。1回で全部。
//     P2-2 奇数: 末尾1人は待機（対局を作らない・不戦勝にしない・未割当一覧に残る）。
//     P2-3 P1併用: 「1卓追加」で1卓後に「まとめて」→ 残りだけ・既存卓は不変（重複なし）。
//     P2-4 重複防止: 既に1局目に入った参加者は対象外。まとめて連打で増えない。
//     P2-5 クラス独立: A の「まとめて」は B に波及しない・クラスまたぎ卓なし。
//     P2-6 既存非回帰: generatePairing 無改変・旧開始関数を呼ばない・既存 append/builder に委譲・
//          選択式 frpAddBtn_/onClickAppendFirstRound・P1 onClickAddOneTable 健在。
//     P2-7 reload: まとめて作成済み卓は normalizeState 往復で復元・待機は派生・A/B 非混線。
//     P2-8 confirm/reentry: confirm 1回・件数/氏名/非破壊・奇数時は待機者明示・連打/再入で二重 append しない。
//     BIND: addAllTablesBtn_ の id・文言・disabled（未手合い<2）・render 後 bind・P1 ボタンと併置。
//   既存スキーマを変えない（match は {p1,p2,winner,lastModifiedBy}）。データは完全架空のみ（架空 …）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_progressive_pairing_p2.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// リッチ DOM mock（test_progressive_pairing_p1.js と同型）: addEventListener が callback を保持する。
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

// opts.breakStorage=true で保存未確認を模擬。opts.confirm で native confirm の戻り（と副作用）を注入。
function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  if(opts.breakStorage){ ctx.localStorage.setItem = function(){ /* no-op: 書込失敗 */ }; }
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
       startClassPartial:startClassPartial,
       buildFirstRoundPartialPairs:buildFirstRoundPartialPairs,
       appendFirstRoundPairs:appendFirstRoundPairs,
       onClickAddOneTable:onClickAddOneTable,
       onClickAddAllTables:onClickAddAllTables,
       onClickAppendFirstRound:onClickAppendFirstRound,
       shouldShowRegenerateButton:shouldShowRegenerateButton,
       buildFirstRoundPartialSectionHtml:buildFirstRoundPartialSectionHtml,
       bindClassActionBarEvents:bindClassActionBarEvents,
       renderTournament:renderTournament,
       generatePairing:generatePairing,
       startTournamentForClass:startTournamentForClass,
       applyStartForCandidates:applyStartForCandidates,
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
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空 state: A=4名(偶数), B=3名(奇数), 全未開始, rounds=4。
function fxState(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
      {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'b3',name:'架空梅子',cls:'B',member:'member',grade:'ippan',entry_no:3,yomi:''}
    ]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

// 指定クラスを部分開始済み（started=true, results 空）にして env に流す。pairingsForCls 任意。
function startedClass(env, cls, pairingsForCls){
  const s = env.normalizeState(fxState());
  for(let i=0;i<s.classes.length;i++){ if(s.classes[i].id===cls){ s.classes[i].started=true; } }
  s.started=true;
  if(pairingsForCls) s.pairings[cls] = pairingsForCls;
  env._setState(s);
  return env._getState();
}

// src からトップレベル関数の本体を粗くスライス（構造ガード用）。
function fnBody(name){
  const i = RAW.indexOf('function '+name+'(');
  if(i<0) return '';
  const j = RAW.indexOf('\nfunction ', i+1);
  return RAW.slice(i, j<0?RAW.length:j);
}

// ============================================================
// P2-1. まとめて作成（偶数）: 未手合い全員を受付順で2人ずつ全卓。1回で全部。
// ============================================================
{
  // 偶数4名 → 「まとめて」1回で 2卓 (a1,a2)(a3,a4)
  const env = loadEnv(); startedClass(env,'A',[]);
  env.onClickAddAllTables('A');
  const st = env._getState();
  assert(st.pairings.A.length===2, 'P2-1-1 偶数4名で「まとめて」1回で2卓を作成（全卓・1回で全部）');
  assert(st.pairings.A[0].p1==='a1' && st.pairings.A[0].p2==='a2', 'P2-1-2 1卓目は受付順の先頭2名(a1,a2)');
  assert(st.pairings.A[1].p1==='a3' && st.pairings.A[1].p2==='a4', 'P2-1-3 2卓目は次の2名(a3,a4)');
  assert(st.pairings.A[0].winner===null && st.pairings.A[0].lastModifiedBy==='auto', 'P2-1-4 卓は {winner:null,lastModifiedBy:auto}（既存スキーマ）');
  assert(env.getUnassignedFirstRoundPlayers('A').length===0, 'P2-1-5 まとめて後は未手合い0（全員割当）');
  assert(st.results.A.length===0, 'P2-1-6 まとめて作成は results を変えない（1局目は未確定）');

  // 受付順は entry_no 駆動（配列順に依存しない）: 6名・配列順を乱して entry_no だけ正しい
  const env2 = loadEnv();
  const s2 = env2.normalizeState(fxState());
  s2.players.A = [
    {id:'a5',name:'架空五郎',cls:'A',member:'member',grade:'ippan',entry_no:5,yomi:''},
    {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
    {id:'a6',name:'架空六郎',cls:'A',member:'member',grade:'ippan',entry_no:6,yomi:''},
    {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
    {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''},
    {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''}
  ];
  s2.classes[0].started=true; s2.started=true;
  env2._setState(s2);
  env2.onClickAddAllTables('A');
  const t2 = env2._getState().pairings.A;
  assert(t2.length===3, 'P2-1-7 偶数6名で「まとめて」1回で3卓');
  assert(t2[0].p1==='a1'&&t2[0].p2==='a2' && t2[1].p1==='a3'&&t2[1].p2==='a4' && t2[2].p1==='a5'&&t2[2].p2==='a6',
    'P2-1-8 配列順が乱れていても entry_no 昇順で (a1a2)(a3a4)(a5a6)');
}

// ============================================================
// P2-2. 奇数: 末尾1人は待機（対局を作らない・不戦勝にしない・未割当一覧に残る）。
// ============================================================
{
  // B=3名（奇数）→「まとめて」で 1卓(b1,b2) + b3 待機
  const env = loadEnv(); startedClass(env,'B',[]);
  env.onClickAddAllTables('B');
  const st = env._getState();
  assert(st.pairings.B.length===1, 'P2-2-1 奇数3名で「まとめて」は1卓（末尾1人は組まない）');
  assert(st.pairings.B[0].p1==='b1' && st.pairings.B[0].p2==='b2', 'P2-2-2 受付順の先頭2名(b1,b2)で1卓');
  const un = env.getUnassignedFirstRoundPlayers('B').map(function(p){return p.id;});
  assert(un.length===1 && un[0]==='b3', 'P2-2-3 末尾の b3 は未割当（待機）として一覧に残る');
  let b3InPairing=false;
  for(let i=0;i<st.pairings.B.length;i++){ if(st.pairings.B[i].p1==='b3'||st.pairings.B[i].p2==='b3') b3InPairing=true; }
  assert(!b3InPairing, 'P2-2-4 待機者 b3 は pairings に入らない（対局を作らない）');
  assert(st.results.B.length===0, 'P2-2-5 待機者を不戦勝にしない（results は空のまま）');
  // 待機1名のままさらに「まとめて」を押しても増えない（2人未満）
  env.onClickAddAllTables('B');
  assert(env._getState().pairings.B.length===1, 'P2-2-6 残り1名（b3）では「まとめて」も卓を作れない（待機継続）');
}

// ============================================================
// P2-3. P1併用: 「1卓追加」で1卓後に「まとめて」→ 残りだけ・既存卓は不変（重複なし）。
// ============================================================
{
  // 6名 A: P1「1卓追加」で (a1,a2) → 「まとめて」で残り (a3,a4)(a5,a6)。既存卓不変。
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.players.A = [
    {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
    {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
    {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
    {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''},
    {id:'a5',name:'架空五郎',cls:'A',member:'member',grade:'ippan',entry_no:5,yomi:''},
    {id:'a6',name:'架空六郎',cls:'A',member:'member',grade:'ippan',entry_no:6,yomi:''}
  ];
  s.classes[0].started=true; s.started=true;
  env._setState(s);
  env.onClickAddOneTable('A');   // P1: (a1,a2)
  assert(env._getState().pairings.A.length===1, 'P2-3-1 P1「1卓追加」で1卓 (a1,a2)');
  const firstTable = env._getState().pairings.A[0];
  env.onClickAddAllTables('A');  // P2: 残り (a3,a4)(a5,a6)
  const all = env._getState().pairings.A;
  assert(all.length===3, 'P2-3-2 「まとめて」で残りが組まれ合計3卓');
  assert(all[0].p1===firstTable.p1 && all[0].p2===firstTable.p2, 'P2-3-3 P1 で作った既存卓(a1,a2)は不変（壊さない）');
  assert(all[1].p1==='a3'&&all[1].p2==='a4' && all[2].p1==='a5'&&all[2].p2==='a6', 'P2-3-4 まとめては残り(a3,a4)(a5,a6)だけを組む（重複なし）');
  // 全 pairings に同一 pid が2回出ない（重複検査）
  const seen={}; let dup=false;
  for(let i=0;i<all.length;i++){ [all[i].p1,all[i].p2].forEach(function(pid){ if(seen[pid])dup=true; seen[pid]=true; }); }
  assert(!dup, 'P2-3-5 どの参加者も2卓に出ない（重複防止の核）');
  assert(env.getUnassignedFirstRoundPlayers('A').length===0, 'P2-3-6 P1+まとめてで未手合い0');
}

// ============================================================
// P2-4. 重複防止: 既に1局目に入った参加者は対象外。まとめて連打で増えない。
// ============================================================
{
  const env = loadEnv(); startedClass(env,'A',[]);
  env.onClickAddAllTables('A');   // 2卓・未手合い0
  assert(env._getState().pairings.A.length===2, 'P2-4-1 まとめて1回で2卓');
  env.onClickAddAllTables('A');   // 連打: 未手合い0 のため増えない
  assert(env._getState().pairings.A.length===2, 'P2-4-2 まとめて連打しても未手合い0なら卓は増えない（重複なし）');
  // appendFirstRoundPairs は既割当者の再追加を拒否（重複防止の核）
  const rej = env.appendFirstRoundPairs('A',[{p1:'a1',p2:'a3',winner:null,lastModifiedBy:'auto'}]);
  assert(rej===false, 'P2-4-3 既に1局目対局がある参加者(a1,a3)の再追加は拒否される');
}

// ============================================================
// P2-5. クラス独立: A の「まとめて」は B に波及しない・クラスまたぎ卓なし。
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started=true; s.classes[1].started=true; s.started=true;
  env._setState(s);
  env.onClickAddAllTables('A');
  let st = env._getState();
  assert(st.pairings.A.length===2, 'P2-5-1 A の「まとめて」で A に2卓');
  assert(st.pairings.B.length===0 && st.results.B.length===0, 'P2-5-2 A の「まとめて」は B に波及しない');
  // A の全卓は A の参加者のみ（クラスまたぎなし）
  const idsA={a1:1,a2:1,a3:1,a4:1}; let crossed=false;
  for(let i=0;i<st.pairings.A.length;i++){ if(!idsA[st.pairings.A[i].p1]||!idsA[st.pairings.A[i].p2])crossed=true; }
  assert(!crossed, 'P2-5-3 A の卓は A の参加者のみ（クラスまたぎ卓なし）');
  env.onClickAddAllTables('B');
  st = env._getState();
  assert(st.pairings.B.length===1 && st.pairings.A.length===2, 'P2-5-4 B の「まとめて」後も A は2卓のまま（独立）');
}

// ============================================================
// P2-6. 既存非回帰: generatePairing 無改変・旧開始関数を呼ばない・既存 append/builder に委譲。
// ============================================================
{
  // generatePairing は従来どおり「全員を一括ペア」（逐次を使わないクラスの既存挙動不変）
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started=true; s.started=true;
  env._setState(s);
  env.generatePairing('A');
  const gp = env._getState().pairings.A;
  assert(gp.length===2, 'P2-6-1 generatePairing は従来どおり全員を一括ペア（4名→2卓）');

  // NOCALL: onClickAddAllTables は旧開始関数（全員上書き経路）を呼ばない
  const body = fnBody('onClickAddAllTables');
  assert(body.indexOf('generatePairing')<0, 'P2-6-2 onClickAddAllTables は generatePairing を呼ばない');
  assert(body.indexOf('startTournamentForClass')<0 && body.indexOf('applyStartForCandidates')<0, 'P2-6-3 onClickAddAllTables は startTournamentForClass/applyStartForCandidates を呼ばない');
  assert(body.indexOf('appendFirstRoundPairs')>=0 && body.indexOf('buildFirstRoundPartialPairs')>=0, 'P2-6-4 onClickAddAllTables は既存 append/builder に委譲する（追加のみ）');
  // generatePairing 本体は逐次手合いの語を含まない（無改変の確認）
  const gpBody = fnBody('generatePairing');
  assert(gpBody.indexOf('onClickAddAllTables')<0 && gpBody.indexOf('appendFirstRoundPairs')<0, 'P2-6-5 generatePairing 本体は逐次手合いの語を含まない（無改変）');

  // 既存の選択式 append（onClickAppendFirstRound）と P1（onClickAddOneTable）は健在
  const env2 = loadEnv(); startedClass(env2,'A',[]);
  env2.onClickAddOneTable('A');
  assert(env2._getState().pairings.A.length===1, 'P2-6-6 P1 onClickAddOneTable は無改変で従来どおり1卓');
  assert(typeof env2.onClickAppendFirstRound==='function', 'P2-6-7 選択式 onClickAppendFirstRound は健在（純追加で壊さない）');
}

// ============================================================
// P2-7. reload: まとめて作成済み卓は normalizeState 往復で復元・待機は派生・A/B 非混線。
// ============================================================
{
  const env = loadEnv(); startedClass(env,'B',[]);
  env.onClickAddAllTables('B');   // (b1,b2) 1卓・b3 待機
  const saved = env._ctx.localStorage.getItem(env.STORAGE_KEY);
  assert(!!saved, 'P2-7-1 「まとめて」は localStorage に保存される（save 経由）');
  const reloaded = env.normalizeState(JSON.parse(saved));
  assert(Array.isArray(reloaded.pairings.B) && reloaded.pairings.B.length===1, 'P2-7-2 reload 往復で B の卓数（1）が復元される');
  assert(reloaded.pairings.B[0].p1==='b1' && reloaded.pairings.B[0].p2==='b2', 'P2-7-3 reload 後も卓の p1/p2 が一致');
  assert(reloaded.pairings.B[0].winner===null && reloaded.pairings.B[0].lastModifiedBy==='auto', 'P2-7-4 reload 後も winner=null / lastModifiedBy=auto');
  // 待機（b3）は保存されず派生で再計算される
  const reEnv = loadEnv(); reEnv._setState(reloaded);
  const un = reEnv.getUnassignedFirstRoundPlayers('B').map(function(p){return p.id;});
  assert(un.length===1 && un[0]==='b3', 'P2-7-5 待機者 b3 は保存されず getUnassignedFirstRoundPlayers の派生で再計算される');
  assert(Array.isArray(reloaded.pairings.A) && reloaded.pairings.A.length===0, 'P2-7-6 B の append は reload 後も A に混線しない');
}

// ============================================================
// BIND. ボタン bind・文言・disabled（未手合い<2）・P1 ボタンと併置。
// ============================================================
{
  // 未開始から startClassPartial で開始＋描画 → addAllTablesBtn_A に click handler が bind される
  const env = loadEnv(); env._setState(env.normalizeState(fxState())); env.startClassPartial('A');
  const btn = env._ctx.document.getElementById('addAllTablesBtn_A');
  assert(btn._listeners.click && btn._listeners.click.length>=1, 'BIND1 render 後 addAllTablesBtn_A に click handler が bind される');
  const secA = env.buildFirstRoundPartialSectionHtml('A');
  assert(secA.indexOf('未手合いをまとめて1局目作成')>=0, 'BIND2 ボタン文言「未手合いをまとめて1局目作成」');
  assert(secA.indexOf('addAllTablesBtn_A')>=0, 'BIND3 addAllTablesBtn_A の id が出力される');
  // 未手合い2名以上のときボタンは有効（disabled でない）
  assert(!/addAllTablesBtn_A[^>]*disabled/.test(secA), 'BIND4 未手合い2名以上ではボタン有効（disabled でない）');
  // P1「1卓追加」(addTableBtn_)と併置（両方残す・純追加）
  assert(secA.indexOf('addTableBtn_A')<0, 'BIND5 ①「1卓追加」(addTableBtn_)は撤去済み（②のみ）');
  // 未手合い1名のときは disabled（B に1卓作って b3 を1名残す）
  const env2 = loadEnv(); env2._setState(env2.normalizeState(fxState())); env2.startClassPartial('B');
  env2.onClickAddOneTable('B'); // b1,b2 → b3 のみ残る
  const secB = env2.buildFirstRoundPartialSectionHtml('B');
  assert(/addAllTablesBtn_B[^>]*disabled/.test(secB), 'BIND6 未手合い1名のとき addAllTablesBtn は disabled');
  // 選択式ボタン(frpAddBtn_)も併置されたまま（純追加・既存導線を壊さない）
  assert(secB.indexOf('frpAddBtn_B')>=0 && secB.indexOf('選択した参加者で1局目を追加作成')>=0, 'BIND7 既存の選択式「選択した参加者で1局目を追加作成」も併置される（純追加）');
}

// ============================================================
// P2-8. confirm / reentry. 誤押下防止と二重 append 防止。
// ============================================================
{
  // 偶数: confirm 本文に件数・氏名・非破壊／leftover なし＝待機者行を出さない
  let msgEven='';
  const env = loadEnv({confirm:function(m){ msgEven=m; return true; }}); startedClass(env,'A',[]);
  env.onClickAddAllTables('A');
  assert(env._confirmCalls.length===1, 'CONF1 append 前に confirm を1回提示');
  assert(msgEven.indexOf('追加します')>=0 && msgEven.indexOf('架空太郎')>=0 && msgEven.indexOf('架空四郎')>=0 && msgEven.indexOf('変更されません')>=0,
    'CONF2 confirm 文に件数・全組の氏名・非破壊の明記');
  assert(msgEven.indexOf('待機')<0, 'CONF3 偶数（leftover なし）は confirm に待機者行を出さない');

  // 奇数: confirm に待機者（奇数末尾）を明示
  let msgOdd='';
  const envB = loadEnv({confirm:function(m){ msgOdd=m; return true; }}); startedClass(envB,'B',[]);
  envB.onClickAddAllTables('B');
  assert(msgOdd.indexOf('待機')>=0 && msgOdd.indexOf('架空梅子')>=0, 'CONF4 奇数では confirm に待機者（架空梅子）を明示');

  // confirm キャンセルでは作成しない（誤押下防止）
  const env3 = loadEnv({confirm:false}); startedClass(env3,'A',[]);
  env3.onClickAddAllTables('A');
  assert(env3._getState().pairings.A.length===0, 'CONF5 confirm キャンセルで卓を作成しない');

  // confirm 中の再入は in-flight guard で弾く（confirm は1回だけ・二重 append なし）
  let envRef;
  const env4 = loadEnv({confirm:function(){
    if(envRef && !envRef._didReenter){ envRef._didReenter=true; envRef.onClickAddAllTables('A'); }
    return true;
  }});
  envRef = env4; startedClass(env4,'A',[]);
  env4.onClickAddAllTables('A');
  assert(env4._confirmCalls.length===1, 'RE1 再入防止: confirm 中の再呼び出しは in-flight guard で弾かれ confirm は1回だけ');
  assert(env4._getState().pairings.A.length===2, 'RE2 二重 append されず2卓のみ（4名→2卓）');
}

console.log('');
console.log('  PROGRESSIVE-PAIRING-IMPL-P2 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
