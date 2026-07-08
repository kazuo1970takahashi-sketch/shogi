#!/usr/bin/env node
// PROGRESSIVE-PAIRING-IMPL-P1: 1局目逐次手合「クラス別『1卓追加』（受付順の先頭2名）」単体テスト。
//   正本仕様: ai-requests/2026-06-20_progressive-pairing-CONFIRMED-spec.md（Phase P1 / 受入条件1〜8）
//   依頼:     ai-requests/2026-06-20_claude-code_progressive-pairing-impl-phase1.md
//   スコープ: 部分開始中クラスの未手合い（getUnassignedFirstRoundPlayers＝受付順＝entry_no 昇順）の
//     「先頭2名」で round=1 の1卓を append する onClickAddOneTable と、その導線ボタン/bind を検証する。
//     実装は追加のみ。生成は既存 buildFirstRoundPartialPairs、append は既存 appendFirstRoundPairs に委譲し、
//     待機（奇数末尾1人）は派生 getUnassignedFirstRoundPlayers に自動的に残す（state に二重保存しない）。
//   観点（受入1〜7 + 周辺）:
//     AC1 受付順: 未手合いの先頭2名（entry_no 昇順・配列順に依存しない）で1卓。押すたびに次の2名。
//     AC2 同クラス2人で1卓・クラスまたぎなし。
//     AC3 奇数: 末尾1人は待機（対局を作らない・不戦勝にしない・未割当一覧に残る）。
//     AC4/5 重複防止: 作成済みは未手合いから除外・再度組まれない／部分手合い中は再生成ボタンを隠し一括上書きを構造的に防ぐ。
//     AC6 既存一括非回帰: generatePairing（全員上書き）は無改変・onClickAddOneTable は旧開始関数を呼ばない。
//     AC7 reload: append 済み卓は normalizeState 往復で復元・待機は派生で再計算・A/B 非混線。
//     ISO A/B 独立 / BIND ボタン bind・文言・disabled / CONFIRM 誤押下防止 / REENTRY 二重 append しない。
//   既存スキーマを変えない（match は {p1,p2,winner,lastModifiedBy}）。データは完全架空のみ（架空 …）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_progressive_pairing_p1.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// リッチ DOM mock（test_frp_impl_003.js と同型）: addEventListener が callback を保持する。
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
       onClickAppendFirstRound:onClickAppendFirstRound,
       shouldShowRegenerateButton:shouldShowRegenerateButton,
       buildFirstRoundPartialSectionHtml:buildFirstRoundPartialSectionHtml,
       bindClassActionBarEvents:bindClassActionBarEvents,
       renderTournament:renderTournament,
       generatePairing:generatePairing,
       startTournamentForClass:startTournamentForClass,
       applyStartForCandidates:applyStartForCandidates,
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
  // IN-APP-MODAL-001 (#606): FRP追加(1卓/選択式)の確認は appConfirm へ移行。__setAppModalTestResolver を confirmFn へ配線し
  //   （confirmCalls への push・opts.confirm 戻り値・再入副作用を保持）、AC/再入 assert を挙動同値で維持。
  if(typeof api.__setAppModalTestResolver==='function'){ api.__setAppModalTestResolver(function(type,message){ return confirmFn(message); }); }
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
// AC1. 受付順（entry_no 昇順）の先頭2名で1卓。押すたびに次の2名。
// ============================================================
{
  // 偶数4名 → 1回目(a1,a2) / 2回目(a3,a4)
  const env = loadEnv(); startedClass(env,'A',[]);
  env.onClickAddOneTable('A');
  let st = env._getState();
  assert(st.pairings.A.length===1, 'AC1-1 1回目の「1卓追加」で1卓だけ作成される');
  assert(st.pairings.A[0].p1==='a1' && st.pairings.A[0].p2==='a2', 'AC1-2 先頭2名(a1,a2)で1卓（受付順）');
  assert(st.pairings.A[0].winner===null && st.pairings.A[0].lastModifiedBy==='auto', 'AC1-3 卓は {winner:null,lastModifiedBy:auto}（既存スキーマ）');
  env.onClickAddOneTable('A');
  st = env._getState();
  assert(st.pairings.A.length===2, 'AC1-4 2回目の「1卓追加」で次の1卓を追加（合計2卓）');
  assert(st.pairings.A[1].p1==='a3' && st.pairings.A[1].p2==='a4', 'AC1-5 2回目は次の先頭2名(a3,a4)');

  // 受付順は entry_no 駆動（配列順に依存しない）: 配列順を入替え、entry_no だけ正しい状態
  const env2 = loadEnv();
  const s2 = env2.normalizeState(fxState());
  s2.players.A = [
    {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
    {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
    {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''},
    {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''}
  ];
  s2.classes[0].started=true; s2.started=true;
  env2._setState(s2);
  env2.onClickAddOneTable('A');
  const t2 = env2._getState().pairings.A;
  assert(t2.length===1 && t2[0].p1==='a1' && t2[0].p2==='a2', 'AC1-6 配列順が乱れていても entry_no 昇順の先頭2名(a1,a2)');

  // confirm キャンセルでは作成しない（誤押下防止）
  const env3 = loadEnv({confirm:false}); startedClass(env3,'A',[]);
  env3.onClickAddOneTable('A');
  assert(env3._getState().pairings.A.length===0, 'AC1-7 confirm キャンセルで1卓を作成しない');
  assert(env3._confirmCalls.length===1, 'AC1-8 append 前に confirm を提示（誤押下防止）');
}

// ============================================================
// AC2. 同クラス2人で1卓・クラスまたぎ卓は作られない。
// ============================================================
{
  const env = loadEnv(); startedClass(env,'A',[]);
  env.onClickAddOneTable('A');
  const m = env._getState().pairings.A[0];
  const idsA = {a1:1,a2:1,a3:1,a4:1};
  assert(!!idsA[m.p1] && !!idsA[m.p2], 'AC2-1 1卓の両者ともクラスAの参加者（クラスまたぎなし）');
  assert(m.p1!==m.p2, 'AC2-2 同一人物同士の卓は作られない');
  assert(env._getState().pairings.B.length===0, 'AC2-3 A の「1卓追加」は B に卓を作らない');
}

// ============================================================
// AC3. 奇数: 末尾1人は待機（対局を作らない・不戦勝にしない・未割当一覧に残る）。
// ============================================================
{
  // B=3名（奇数）を部分開始。1卓追加 → (b1,b2) 1卓、b3 は待機（未割当のまま）。
  const env = loadEnv(); startedClass(env,'B',[]);
  env.onClickAddOneTable('B');
  const st = env._getState();
  assert(st.pairings.B.length===1, 'AC3-1 奇数3名でも「1卓追加」は1卓だけ（先頭2名）');
  assert(st.pairings.B[0].p1==='b1' && st.pairings.B[0].p2==='b2', 'AC3-2 先頭2名(b1,b2)で1卓');
  const un = env.getUnassignedFirstRoundPlayers('B').map(function(p){return p.id;});
  assert(un.indexOf('b3')>=0, 'AC3-3 末尾の b3 は未割当（待機）として一覧に残る');
  // b3 は対局に入っていない（不戦勝にしない＝勝敗・結果に入れない）
  let b3InPairing=false;
  for(let i=0;i<st.pairings.B.length;i++){ if(st.pairings.B[i].p1==='b3'||st.pairings.B[i].p2==='b3') b3InPairing=true; }
  assert(!b3InPairing, 'AC3-4 待機者 b3 は pairings に入らない（対局を作らない）');
  assert(st.results.B.length===0, 'AC3-5 待機者を不戦勝にしない（results は空のまま）');
  // 待機者が2人未満なら次は作れない（disabled 相当）: もう1卓追加しても b3 単独では作れない
  env.onClickAddOneTable('B');
  assert(env._getState().pairings.B.length===1, 'AC3-6 残り1名（b3）では1卓を作れない（待機継続）');
}

// ============================================================
// AC4 / AC5. 重複防止: 作成済みは未手合いから除外・再度組まれない／一括上書きを構造的に防ぐ。
// ============================================================
{
  const env = loadEnv(); startedClass(env,'A',[]);
  env.onClickAddOneTable('A');   // (a1,a2)
  const un1 = env.getUnassignedFirstRoundPlayers('A').map(function(p){return p.id;});
  assert(un1.indexOf('a1')<0 && un1.indexOf('a2')<0, 'AC4-1 作成済み a1,a2 は未手合い一覧から除外される');
  assert(un1.indexOf('a3')>=0 && un1.indexOf('a4')>=0, 'AC4-2 未作成 a3,a4 は未手合いに残る');
  env.onClickAddOneTable('A');   // (a3,a4) — 再び a1,a2 を組まない
  const all = env._getState().pairings.A;
  assert(all.length===2 && all[1].p1==='a3' && all[1].p2==='a4', 'AC4-3 2回目は a3,a4（a1,a2 を再度組まない）');

  // appendFirstRoundPairs は既割当者の再追加を拒否（重複防止の核）
  const rej = env.appendFirstRoundPairs('A',[{p1:'a1',p2:'a3',winner:null,lastModifiedBy:'auto'}]);
  assert(rej===false, 'AC5-1 既に1局目対局がある参加者(a1)の再追加は拒否');

  // 部分手合い中（results 空・卓あり・未割当>0）は再生成ボタンを隠す＝一括上書き経路を構造的に塞ぐ
  const env2 = loadEnv(); startedClass(env2,'A',[]);
  env2.onClickAddOneTable('A');   // 1卓 + 未割当 a3,a4 残
  assert(env2.shouldShowRegenerateButton('A')===false, 'AC5-2 部分手合い中（未割当>0）は再生成ボタンを非表示＝一括上書きを防ぐ');
  // 全員割当て後（未割当0）は由来を識別できないため表示に戻る（設計どおり・通常 round1 を壊さない）
  env2.onClickAddOneTable('A');   // a3,a4 → 未割当0
  assert(env2.getUnassignedFirstRoundPlayers('A').length===0, 'AC5-3 全員割当後は未手合い0');
  assert(env2.shouldShowRegenerateButton('A')===true, 'AC5-4 未割当0 は由来非依存で再生成ボタン表示（設計 §5.4.1）');
}

// ============================================================
// AC6. 既存一括非回帰: generatePairing（全員上書き）は無改変・旧開始関数を呼ばない。
// ============================================================
{
  // generatePairing は従来どおり「全員を一括ペア」する（逐次を使わないクラスの既存挙動不変）
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started=true; s.started=true; // A 開始（pairings 空）
  env._setState(s);
  env.generatePairing('A');   // 全員一括
  const gp = env._getState().pairings.A;
  assert(gp.length===2, 'AC6-1 generatePairing は従来どおり全員を一括ペア（4名→2卓）');
  const covered={}; for(let i=0;i<gp.length;i++){covered[gp[i].p1]=1;covered[gp[i].p2]=1;}
  assert(covered.a1&&covered.a2&&covered.a3&&covered.a4, 'AC6-2 generatePairing は全員を1卓ずつに含める（既存挙動）');

  // NOCALL: onClickAddOneTable は旧開始関数（全員上書き経路）を呼ばない
  const body = fnBody('onClickAddOneTable');
  assert(body.indexOf('generatePairing')<0, 'AC6-3 onClickAddOneTable は generatePairing を呼ばない');
  assert(body.indexOf('startTournamentForClass')<0 && body.indexOf('applyStartForCandidates')<0, 'AC6-4 onClickAddOneTable は startTournamentForClass/applyStartForCandidates を呼ばない');
  assert(body.indexOf('appendFirstRoundPairs')>=0 && body.indexOf('buildFirstRoundPartialPairs')>=0, 'AC6-5 onClickAddOneTable は既存 append/builder に委譲する（追加のみ）');
  // generatePairing 本体は append/逐次の語を含まない（無改変の確認）
  const gpBody = fnBody('generatePairing');
  assert(gpBody.indexOf('onClickAddOneTable')<0 && gpBody.indexOf('appendFirstRoundPairs')<0, 'AC6-6 generatePairing 本体は逐次手合いの語を含まない（無改変）');
}

// ============================================================
// AC7. reload: append 済み卓は normalizeState 往復で復元・待機は派生・A/B 非混線。
// ============================================================
{
  const env = loadEnv(); startedClass(env,'B',[]);
  env.onClickAddOneTable('B');   // (b1,b2) 1卓・b3 待機
  const saved = env._ctx.localStorage.getItem(env.STORAGE_KEY);
  assert(!!saved, 'AC7-1 「1卓追加」は localStorage に保存される（save 経由）');
  const reloaded = env.normalizeState(JSON.parse(saved));
  assert(Array.isArray(reloaded.pairings.B) && reloaded.pairings.B.length===1, 'AC7-2 reload 往復で B の卓数（1）が復元される');
  assert(reloaded.pairings.B[0].p1==='b1' && reloaded.pairings.B[0].p2==='b2', 'AC7-3 reload 後も卓の p1/p2 が一致');
  assert(reloaded.pairings.B[0].winner===null && reloaded.pairings.B[0].lastModifiedBy==='auto', 'AC7-4 reload 後も winner=null / lastModifiedBy=auto');
  // 待機（b3）は保存されず派生で再計算される
  const reEnv = loadEnv(); reEnv._setState(reloaded);
  const un = reEnv.getUnassignedFirstRoundPlayers('B').map(function(p){return p.id;});
  assert(un.length===1 && un[0]==='b3', 'AC7-5 待機者 b3 は保存されず getUnassignedFirstRoundPlayers の派生で再計算される');
  // A/B 非混線
  assert(Array.isArray(reloaded.pairings.A) && reloaded.pairings.A.length===0, 'AC7-6 B の append は reload 後も A に混線しない');
}

// ============================================================
// ISO. A/B 独立（A の「1卓追加」が B に波及しない／逆も）。
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started=true; s.classes[1].started=true; s.started=true;
  env._setState(s);
  env.onClickAddOneTable('A');
  let st = env._getState();
  assert(st.pairings.A.length===1, 'ISO1 A に1卓');
  assert(st.pairings.B.length===0 && st.results.B.length===0, 'ISO2 A の「1卓追加」は B に波及しない');
  env.onClickAddOneTable('B');
  st = env._getState();
  assert(st.pairings.B.length===1 && st.pairings.A.length===1, 'ISO3 B の「1卓追加」後も A は1卓のまま（独立）');
}

// ============================================================
// BIND. ボタン bind・文言・disabled（未手合い1名）。
// ============================================================
{
  // 未開始から startClassPartial で開始＋描画 → addTableBtn_A に click handler が bind される
  // ①「1卓追加」UI 撤去（受付運用上ほぼ不要・奇数調整は③で代替）。ボタン非出力・未bind を確認（ハンドラ onClickAddOneTable は #274/AC 回帰資産として温存）。
  const env = loadEnv(); env._setState(env.normalizeState(fxState())); env.startClassPartial('A');
  const btn = env._ctx.document.getElementById('addTableBtn_A');
  assert(!(btn._listeners.click && btn._listeners.click.length>=1), 'BIND1 ①「1卓追加」ボタンは未bind（UI撤去）');
  const secA = env.buildFirstRoundPartialSectionHtml('A');
  assert(secA.indexOf('1卓追加（受付順の先頭2名で1局目を作成）')<0, 'BIND2 ①ボタン文言は非出力');
  assert(secA.indexOf('addTableBtn_A')<0, 'BIND3 addTableBtn_A は非出力');
  // ②「まとめて」は健在・未手合い2名以上で有効
  assert(secA.indexOf('id="addAllTablesBtn_A"')>=0 && !/addAllTablesBtn_A[^>]*disabled/.test(secA), 'BIND4 ②まとめては残り未手合い2名以上で有効');
  // 未手合い1名のとき ②まとめて は disabled（B に1卓作って b3 を1名残す。onClickAddOneTable は温存ハンドラ）
  const env2 = loadEnv(); env2._setState(env2.normalizeState(fxState())); env2.startClassPartial('B');
  env2.onClickAddOneTable('B'); // b1,b2 → b3 のみ残る
  const secB = env2.buildFirstRoundPartialSectionHtml('B');
  assert(/addAllTablesBtn_B[^>]*disabled/.test(secB), 'BIND5 未手合い1名のとき②まとめては disabled');
  // 既存の選択式ボタン(frpAddBtn_)は併置されたまま（純追加・既存導線を壊さない）
  assert(secB.indexOf('frpAddBtn_B')>=0 && secB.indexOf('選択した参加者で1局目を追加作成')>=0, 'BIND6 既存の選択式「選択した参加者で1局目を追加作成」も併置される（純追加）');
}

// ============================================================
// CONFIRM / REENTRY. 誤押下防止と二重 append 防止。
// ============================================================
{
  // confirm が1回提示され、本文に「追加します」「氏名」「変更されません」を含む
  let msgSeen='';
  const env = loadEnv({confirm:function(m){ msgSeen=m; return true; }}); startedClass(env,'A',[]);
  env.onClickAddOneTable('A');
  assert(env._confirmCalls.length===1, 'CONF1 append 前に confirm を1回提示');
  assert(msgSeen.indexOf('追加します')>=0 && msgSeen.indexOf('架空太郎')>=0 && msgSeen.indexOf('変更されません')>=0, 'CONF2 confirm 文に件数・氏名・非破壊の明記');
  // 「1卓追加」は先頭2名のみ＝leftover なし → confirm に待機者行を出さない
  assert(msgSeen.indexOf('待機')<0, 'CONF3 「1卓追加」は先頭2名のみ（leftover なし）＝confirm に待機者行を出さない');

  // 連打: 4名で2回押すと2卓（同じ2名を二重に組まない）
  const env2 = loadEnv(); startedClass(env2,'A',[]);
  env2.onClickAddOneTable('A');
  env2.onClickAddOneTable('A');
  assert(env2._getState().pairings.A.length===2, 'RE1 連打で2卓（a1,a2)(a3,a4)＝同じ2名を二重に組まない');

  // confirm 中の再入は in-flight guard で弾く（confirm は1回だけ）
  let envRef;
  const env3 = loadEnv({confirm:function(){
    if(envRef && !envRef._didReenter){ envRef._didReenter=true; envRef.onClickAddOneTable('A'); }
    return true;
  }});
  envRef = env3; startedClass(env3,'A',[]);
  env3.onClickAddOneTable('A');
  assert(env3._confirmCalls.length===1, 'RE2 再入防止: confirm 中の再呼び出しは in-flight guard で弾かれ confirm は1回だけ');
  assert(env3._getState().pairings.A.length===1, 'RE2b 二重 append されず1卓のみ');
}

console.log('');
console.log('  PROGRESSIVE-PAIRING-IMPL-P1 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
