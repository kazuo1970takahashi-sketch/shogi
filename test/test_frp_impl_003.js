#!/usr/bin/env node
// FRP-IMPL-003: 1局目部分手合い「選択者だけで1局目対局を append 作成」単体テスト。
//   設計: docs/specs/20260617_frp_design_002_post_225_partial_first_round.md（FRP-DESIGN-002 §6/§7/§9）
//   本スライスの範囲: FRP-IMPL-002 の未割当一覧から選択者を選び、選択者だけの1局目対局を既存対局へ append 作成する。
//     - 偶数は全員ペア化 / 3人以上の奇数は entry_no 昇順で 2人ずつ + 末尾1人を leftover として未割当のまま残す。
//     - 0人 / 1人 は作成不可。leftover は state に保存せず getUnassignedFirstRoundPlayers の派生で一覧に残す。
//   観点（タスク test 要件）:
//     BP. buildFirstRoundPartialPairs（pure）: 偶数/奇数/0/1 / entry_no 昇順 / 欠損は末尾 / 同値は id 昇順 / ペア構造。
//     AP. appendFirstRoundPairs（mutate）: 既存対局を消さず末尾 append / 件数=既存+新規 / 既存 winner 不変 / leftover 残置。
//     GUARD. results 非空ブロック / pairings 内 winner 入力済みでも results 空なら許可 / 別クラス・既割当・重複・p1==p2・未開始・unknown を拒否。
//     SAVE. SAVE-FRP-002: 保存成功時 warn なし / 保存未確認（書込不能）時のみ warn・rollback しない（運営継続）。
//     HANDLER. onClickAppendFirstRound: チェック2人で append / 1人以下は不可 / pane スコープ外は無視 / confirm キャンセルで不実行 / 奇数は確認文に待機者名。
//     REENTRY. 連打/再入で二重 append しない（実行時再検証 + in-flight guard。confirm は1回だけ）。
//     ISO. A/B クラス独立（A の append が B に波及しない）。
//     NOCALL. startTournamentForClass / generatePairing / applyStartForCandidates を呼ばない（source 文字列 + 挙動 proxy）。
//     BIND. render 後に frpAddBtn_ へ click handler が bind される。
//   既存スキーマを変えない（match は {p1,p2,winner,lastModifiedBy}）。データは完全架空のみ（架空 …）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_frp_impl_003.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// リッチ DOM mock: addEventListener が callback を保持し、pane.querySelectorAll('.frp-unassigned-cb') が
//   登録済みチェックボックスを返す（ブラウザが innerHTML を parse した状態を模擬）。checkbox は .checked/.disabled を持つ。
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
       onClickAppendFirstRound:onClickAppendFirstRound,
       collectCheckedUnassignedPids:collectCheckedUnassignedPids,
       buildFrpAppendConfirmMessage:buildFrpAppendConfirmMessage,
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

// A を部分開始済み（started=true, results 空）にし、pairingsA を任意設定して env に流す。
function startedA(env, pairingsA){
  const s = env.normalizeState(fxState());
  s.classes[0].started=true; s.started=true;
  if(pairingsA) s.pairings.A = pairingsA;
  env._setState(s);
  return env._getState();
}

// 部分開始後の未割当者からチェックボックス mock を pane-{cls} に登録し、checkedPids を checked にする。
function setupCheckboxes(env, cls, checkedPids, extraBoxes){
  const unassigned = env.getUnassignedFirstRoundPlayers(cls);
  const pane = env._ctx.document.getElementById('pane-'+cls);
  const boxes = unassigned.map(function(p){
    const cb = env._ctx._makeNode('input');
    cb.className='frp-unassigned-cb'; cb.type='checkbox'; cb.value=p.id;
    cb.setAttribute('data-frp-pid', p.id);
    cb.checked = (checkedPids.indexOf(p.id)>=0);
    cb.disabled = false;
    return cb;
  });
  if(Array.isArray(extraBoxes)) for(let i=0;i<extraBoxes.length;i++) boxes.push(extraBoxes[i]);
  pane._frpBoxes = boxes;
  return boxes;
}

// src からトップレベル関数の本体を粗くスライス（構造ガード用）。
function fnBody(name){
  const i = RAW.indexOf('function '+name+'(');
  if(i<0) return '';
  const j = RAW.indexOf('\nfunction ', i+1);
  return RAW.slice(i, j<0?RAW.length:j);
}

// ============================================================
// BP. buildFirstRoundPartialPairs（pure・entry_no 昇順・奇数 leftover・0/1 空・tie-break）
// ============================================================
{
  const env = loadEnv();
  const bp = env.buildFirstRoundPartialPairs;
  // 偶数2名 → 1ペア / leftover null
  const r2 = bp([{id:'a1',entry_no:1},{id:'a2',entry_no:2}]);
  assert(r2.pairs.length===1 && r2.leftover===null, 'BP1 偶数2名 → 1ペア・leftover なし');
  assert(r2.pairs[0].p1==='a1' && r2.pairs[0].p2==='a2', 'BP1b ペアは entry_no 昇順で (a1,a2)');
  assert(r2.pairs[0].winner===null && r2.pairs[0].lastModifiedBy==='auto', 'BP1c ペア構造 winner=null / lastModifiedBy=auto');
  // 偶数4名 → 2ペア
  const r4 = bp([{id:'a1',entry_no:1},{id:'a2',entry_no:2},{id:'a3',entry_no:3},{id:'a4',entry_no:4}]);
  assert(r4.pairs.length===2 && r4.leftover===null, 'BP2 偶数4名 → 2ペア・leftover なし');
  assert(r4.pairs[0].p1==='a1'&&r4.pairs[0].p2==='a2'&&r4.pairs[1].p1==='a3'&&r4.pairs[1].p2==='a4', 'BP2b (a1,a2),(a3,a4)');
  // 奇数3名 → 1ペア + 末尾 leftover
  const r3 = bp([{id:'a1',entry_no:1},{id:'a2',entry_no:2},{id:'a3',entry_no:3}]);
  assert(r3.pairs.length===1 && r3.leftover && r3.leftover.id==='a3', 'BP3 奇数3名 → 1ペア・末尾a3が leftover');
  // 奇数5名 → 2ペア + 末尾 leftover
  const r5 = bp([{id:'a1',entry_no:1},{id:'a2',entry_no:2},{id:'a3',entry_no:3},{id:'a4',entry_no:4},{id:'a5',entry_no:5}]);
  assert(r5.pairs.length===2 && r5.leftover && r5.leftover.id==='a5', 'BP4 奇数5名 → 2ペア・末尾a5が leftover');
  // 1名 → 0ペア（作成不可）
  const r1 = bp([{id:'a1',entry_no:1}]);
  assert(r1.pairs.length===0, 'BP5 1名 → 0ペア（作成不可）');
  // 0名 → 0ペア・leftover null
  const r0 = bp([]);
  assert(r0.pairs.length===0 && r0.leftover===null, 'BP6 0名 → 0ペア・leftover null');
  // entry_no 昇順（配列順に依存しない）
  const ro = bp([{id:'x',entry_no:3},{id:'y',entry_no:1},{id:'z',entry_no:2},{id:'w',entry_no:4}]);
  assert(ro.pairs[0].p1==='y'&&ro.pairs[0].p2==='z'&&ro.pairs[1].p1==='x'&&ro.pairs[1].p2==='w', 'BP7 entry_no 昇順で (y,z),(x,w)');
  // entry_no 欠損/不正は末尾へ
  const rm = bp([{id:'a',entry_no:2},{id:'b'},{id:'c',entry_no:1}]);
  assert(rm.pairs.length===1 && rm.pairs[0].p1==='c' && rm.pairs[0].p2==='a' && rm.leftover.id==='b', 'BP8 entry_no 欠損は末尾（(c,a)・b が leftover）');
  // entry_no 同値は id 昇順で tie-break
  const rt = bp([{id:'a2',entry_no:1},{id:'a1',entry_no:1}]);
  assert(rt.pairs[0].p1==='a1' && rt.pairs[0].p2==='a2', 'BP9 entry_no 同値は id 昇順（(a1,a2)）');
  // ランダム要素なし: 同入力で2回呼んで同結果
  const x1 = JSON.stringify(bp([{id:'a3',entry_no:3},{id:'a1',entry_no:1},{id:'a2',entry_no:2}]).pairs);
  const x2 = JSON.stringify(bp([{id:'a3',entry_no:3},{id:'a1',entry_no:1},{id:'a2',entry_no:2}]).pairs);
  assert(x1===x2, 'BP10 決定的（ランダム要素なし）');
}

// ============================================================
// AP. appendFirstRoundPairs（mutate・append のみ・既存保持・leftover 残置）
// ============================================================
{
  // 空の1局目に2名 append → 1ペア
  const env = loadEnv(); startedA(env, []);
  setupCheckboxes(env,'A',[]); // pane だけ用意（直接 append を呼ぶ）
  const okR = env.appendFirstRoundPairs('A',[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]);
  const st = env._getState();
  assert(okR===true && st.pairings.A.length===1, 'AP1 空の1局目に2名 append → 1ペア追加');

  // 既存1ペアに2名 append → 既存保持して末尾追加（件数=既存+新規）
  const env2 = loadEnv(); startedA(env2, [{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]);
  const ok2 = env2.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  const st2 = env2._getState();
  assert(ok2===true && st2.pairings.A.length===2, 'AP2 既存1ペア + 新規1ペア = 2ペア（件数=既存+新規）');
  assert(st2.pairings.A[0].p1==='a1' && st2.pairings.A[0].p2==='a2', 'AP2b 既存対局(a1,a2)は先頭に保持され消えない');
  assert(st2.pairings.A[1].p1==='a3' && st2.pairings.A[1].p2==='a4', 'AP2c 新規対局(a3,a4)は末尾に追加');

  // 既存 winner は変更されない（pairings 内 winner 入力済み・results 空）
  const env3 = loadEnv(); startedA(env3, [{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'manual'}]);
  const ok3 = env3.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  const st3 = env3._getState();
  assert(ok3===true && st3.pairings.A.length===2, 'AP3 winner 入力済み match があっても results 空なら append 許可');
  assert(st3.pairings.A[0].winner==='a1', 'AP3b 既存 match の winner(a1) は変更されない');
  assert(st3.pairings.A[0].lastModifiedBy==='manual', 'AP3c 既存 match の lastModifiedBy(manual) も保持');

  // 奇数3名 append → 1ペアのみ、末尾1人は未割当のまま残る（leftover 派生）
  const env4 = loadEnv(); startedA(env4, []);
  const built = env4.buildFirstRoundPartialPairs([{id:'a1',entry_no:1},{id:'a2',entry_no:2},{id:'a3',entry_no:3}]);
  env4.appendFirstRoundPairs('A', built.pairs);
  const un4 = env4.getUnassignedFirstRoundPlayers('A').map(function(p){return p.id;});
  assert(env4._getState().pairings.A.length===1, 'AP4 奇数3名選択 → 1ペアだけ append（a1,a2）');
  assert(un4.indexOf('a3')>=0 && un4.indexOf('a1')<0 && un4.indexOf('a2')<0, 'AP4b 末尾a3は未割当一覧に残る（leftover を保存せず派生で残す。a4は未選択で別途残る）');
}

// ============================================================
// GUARD. append 許可条件（実行時再検証・UI を信用しない）
// ============================================================
{
  // results 非空（1局目確定済み/2回戦以降）→ 全面ブロック
  const env = loadEnv(); const s = env.normalizeState(fxState());
  s.classes[0].started=true; s.started=true; s.results.A=[[{p1:'a1',p2:'a2',winner:'a1'}]];
  env._setState(s);
  const before = JSON.stringify(env._getState().pairings.A);
  const r = env.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  assert(r===false && JSON.stringify(env._getState().pairings.A)===before, 'GUARD1 results 非空は append 不可（pairings 不変）');

  // 別クラス参加者の混入 → 拒否（players[cls] 在籍チェック）
  const env2 = loadEnv(); startedA(env2, []);
  const r2 = env2.appendFirstRoundPairs('A',[{p1:'a1',p2:'b1',winner:null,lastModifiedBy:'auto'}]);
  assert(r2===false && env2._getState().pairings.A.length===0, 'GUARD2 別クラス(b1)混入は拒否（append しない）');

  // 既割当者の混入 → 拒否
  const env3 = loadEnv(); startedA(env3, [{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]);
  const r3 = env3.appendFirstRoundPairs('A',[{p1:'a1',p2:'a3',winner:null,lastModifiedBy:'auto'}]);
  assert(r3===false && env3._getState().pairings.A.length===1, 'GUARD3 既に1局目対局がある参加者(a1)の混入は拒否');

  // 新規 pairs 内 id 重複 → 拒否
  const env4 = loadEnv(); startedA(env4, []);
  const r4 = env4.appendFirstRoundPairs('A',[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'},{p1:'a2',p2:'a3',winner:null,lastModifiedBy:'auto'}]);
  assert(r4===false && env4._getState().pairings.A.length===0, 'GUARD4 新規 pairs 内の重複(a2)は拒否');

  // p1 === p2 → 拒否
  const env5 = loadEnv(); startedA(env5, []);
  const r5 = env5.appendFirstRoundPairs('A',[{p1:'a1',p2:'a1',winner:null,lastModifiedBy:'auto'}]);
  assert(r5===false && env5._getState().pairings.A.length===0, 'GUARD5 p1===p2 は拒否');

  // 空 pairs → 拒否（2人以上を選択）
  const env6 = loadEnv(); startedA(env6, []);
  assert(env6.appendFirstRoundPairs('A',[])===false, 'GUARD6 空 pairs は拒否（2人以上を選択）');

  // 未開始クラス → 拒否
  const env7 = loadEnv(); env7._setState(env7.normalizeState(fxState())); // A 未開始
  const r7 = env7.appendFirstRoundPairs('A',[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]);
  assert(r7===false && env7._getState().pairings.A.length===0, 'GUARD7 未開始クラスは append 不可');

  // unknown class → 拒否（mutate しない）
  const env8 = loadEnv(); startedA(env8, []);
  const beforeAll = JSON.stringify(env8._getState());
  assert(env8.appendFirstRoundPairs('ZZ',[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}])===false, 'GUARD8 unknown class は拒否');
  assert(JSON.stringify(env8._getState())===beforeAll, 'GUARD8b unknown class で state を変更しない');
}

// ============================================================
// SAVE. SAVE-FRP-002（保存検証・成功時 warn なし / 未確認時 warn・rollback しない）
// ============================================================
{
  // 成功時：SAVE-FRP-002 warn は発火しない
  const env = loadEnv(); startedA(env, []);
  env.appendFirstRoundPairs('A',[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]);
  const warnedOk = env._warns.some(function(w){ return String(w[0]).indexOf('SAVE-FRP-002')>=0; });
  assert(!warnedOk, 'SAVE1 保存成功時は SAVE-FRP-002 warn を出さない');
  // 保存後 persisted に append が反映されている
  const persisted = JSON.parse(env._ctx.localStorage.getItem(env.STORAGE_KEY)||'{}');
  assert(persisted.pairings && Array.isArray(persisted.pairings.A) && persisted.pairings.A.length===1, 'SAVE2 append 成功後 persisted.pairings.A に反映');

  // 未確認時：localStorage 書込不能 → snapshot 不一致 → SAVE-FRP-002 warn・ただし in-memory は append 済（rollback しない）
  const envB = loadEnv({breakStorage:true}); startedA(envB, []);
  let threw=false; try{ envB.appendFirstRoundPairs('A',[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]); }catch(e){ threw=true; }
  assert(!threw, 'SAVE3a 保存未確認でも appendFirstRoundPairs は例外を投げない');
  const warnedNg = envB._warns.some(function(w){ return String(w[0]).indexOf('SAVE-FRP-002')>=0; });
  assert(warnedNg, 'SAVE3 保存未確認（書込不能）のとき SAVE-FRP-002 warn が発火する');
  assert(envB._getState().pairings.A.length===1, 'SAVE4 保存未確認でも in-memory の append は保持（rollback しない・運営継続）');
}

// ============================================================
// HANDLER. onClickAppendFirstRound（チェック集約 → 再検証 → confirm → append）
// ============================================================
{
  // 偶数2名チェック → append（1ペア）
  const env = loadEnv(); startedA(env, []); env.startClassPartial('A');
  setupCheckboxes(env,'A',['a1','a2']);
  env.onClickAppendFirstRound('A');
  assert(env._getState().pairings.A.length===1, 'H1 チェック2名 → append（1ペア）');
  assert(env._confirmCalls.length===1, 'H1b append 前に confirm が1回呼ばれる（誤押下防止）');

  // 1名チェック → append しない（2人以上を選択）
  const env2 = loadEnv(); startedA(env2, []); env2.startClassPartial('A');
  setupCheckboxes(env2,'A',['a1']);
  env2.onClickAppendFirstRound('A');
  assert(env2._getState().pairings.A.length===0, 'H2 チェック1名は append しない');

  // 0名チェック → append しない
  const env3 = loadEnv(); startedA(env3, []); env3.startClassPartial('A');
  setupCheckboxes(env3,'A',[]);
  env3.onClickAppendFirstRound('A');
  assert(env3._getState().pairings.A.length===0, 'H3 チェック0名は append しない');

  // pane スコープ外の混入（別クラス pid のボックスを pane-A に置いても）→ 再検証で除外
  const env4 = loadEnv(); startedA(env4, []); env4.startClassPartial('A');
  const stray = env4._ctx._makeNode('input');
  stray.className='frp-unassigned-cb'; stray.checked=true; stray.disabled=false;
  stray.setAttribute('data-frp-pid','b1'); stray.value='b1';
  setupCheckboxes(env4,'A',['a1','a2'],[stray]); // a1,a2 + 紛れ込んだ b1
  env4.onClickAppendFirstRound('A');
  const st4 = env4._getState();
  assert(st4.pairings.A.length===1, 'H4 別クラス pid(b1) は再検証で除外され a1,a2 のみ append');
  assert(st4.pairings.A[0].p1==='a1' && st4.pairings.A[0].p2==='a2', 'H4b append されたのは同一クラスの a1,a2');

  // confirm キャンセル → append しない
  const env5 = loadEnv({confirm:false}); startedA(env5, []); env5.startClassPartial('A');
  setupCheckboxes(env5,'A',['a1','a2']);
  env5.onClickAppendFirstRound('A');
  assert(env5._getState().pairings.A.length===0, 'H5 confirm キャンセルで append しない');
  assert(env5._confirmCalls.length===1, 'H5b confirm は提示される（ユーザーがキャンセル）');

  // 奇数3名チェック → 1ペア append + confirm 文に待機者名（leftover）
  let msgSeen='';
  const env6 = loadEnv({confirm:function(m){ msgSeen=m; return true; }}); startedA(env6, []); env6.startClassPartial('A');
  setupCheckboxes(env6,'A',['a1','a2','a3']);
  env6.onClickAppendFirstRound('A');
  assert(env6._getState().pairings.A.length===1, 'H6 奇数3名チェック → 1ペアだけ append');
  assert(msgSeen.indexOf('待機')>=0 && msgSeen.indexOf('架空三郎')>=0, 'H6b confirm 文に待機者名（架空三郎）を表示');
  assert(env6.getUnassignedFirstRoundPlayers('A').map(function(p){return p.id;}).indexOf('a3')>=0, 'H6c a3 は未割当に残る');
}

// ============================================================
// REENTRY. 二重 append しない（連打 + confirm 中の再入 guard）
// ============================================================
{
  // 連打（同一選択で2回）→ 1回分だけ（再検証で2回目は既割当を除外）
  const env = loadEnv(); startedA(env, []); env.startClassPartial('A');
  setupCheckboxes(env,'A',['a1','a2','a3','a4']);
  env.onClickAppendFirstRound('A');
  env.onClickAppendFirstRound('A');
  assert(env._getState().pairings.A.length===2, 'RE1 連打しても append は1回分（4名→2ペア。2回目は再検証で除外）');

  // confirm 中の再入 → in-flight guard で弾く（confirm は1回だけ）
  let envRef;
  const env2 = loadEnv({confirm:function(){
    if(envRef && !envRef._didReenter){ envRef._didReenter=true; envRef.onClickAppendFirstRound('A'); }
    return true;
  }});
  envRef = env2;
  startedA(env2, []); env2.startClassPartial('A');
  setupCheckboxes(env2,'A',['a1','a2','a3','a4']);
  env2.onClickAppendFirstRound('A');
  assert(env2._confirmCalls.length===1, 'RE2 再入防止: confirm 中の再呼び出しは in-flight guard で弾かれ confirm は1回だけ');
  assert(env2._getState().pairings.A.length===2, 'RE2b 二重 append されず append は1回分（2ペア）');
}

// ============================================================
// ISO. A/B クラス独立
// ============================================================
{
  const env = loadEnv(); const s = env.normalizeState(fxState());
  s.classes[0].started=true; s.classes[1].started=true; s.started=true; // A,B とも部分開始
  env._setState(s);
  env.appendFirstRoundPairs('A',[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]);
  const st = env._getState();
  assert(st.pairings.A.length===1, 'ISO1 A に append される');
  assert(st.pairings.B.length===0 && st.results.B.length===0, 'ISO2 A の append は B の pairings/results に波及しない');
  // B 側 append は A に波及しない
  env.appendFirstRoundPairs('B',[{p1:'b1',p2:'b2',winner:null,lastModifiedBy:'auto'}]);
  const st2 = env._getState();
  assert(st2.pairings.B.length===1 && st2.pairings.A.length===1, 'ISO3 B の append 後も A は1ペアのまま（独立）');
}

// ============================================================
// NOCALL. 旧開始関数を呼ばない（source 文字列 + 挙動 proxy）
// ============================================================
{
  const env = loadEnv();
  // 旧開始関数は健在（無改変で存在する）
  assert(typeof env.generatePairing==='function' && typeof env.startTournamentForClass==='function' && typeof env.applyStartForCandidates==='function', 'NC0 旧開始関数は存在（無改変・参照健在）');
  // source: append 経路の各関数本体に旧開始関数の呼出を含まない
  const apBody = fnBody('appendFirstRoundPairs');
  assert(apBody.indexOf('generatePairing')<0, 'NC1 appendFirstRoundPairs は generatePairing を呼ばない');
  assert(apBody.indexOf('startTournamentForClass')<0 && apBody.indexOf('applyStartForCandidates')<0, 'NC2 appendFirstRoundPairs は startTournamentForClass/applyStartForCandidates を呼ばない');
  const bpBody = fnBody('buildFirstRoundPartialPairs');
  assert(bpBody.indexOf('generatePairing')<0 && bpBody.indexOf('startTournamentForClass')<0 && bpBody.indexOf('applyStartForCandidates')<0, 'NC3 buildFirstRoundPartialPairs は旧開始関数を呼ばない');
  const onBody = fnBody('onClickAppendFirstRound');
  assert(onBody.indexOf('generatePairing')<0 && onBody.indexOf('startTournamentForClass')<0 && onBody.indexOf('applyStartForCandidates')<0, 'NC4 onClickAppendFirstRound は旧開始関数を呼ばない');
  // 挙動 proxy: 既存に winner 入りペアがある状態で append しても、generatePairing の全上書き(=winner 消滅/順序再生成)が起きていない
  const env2 = loadEnv(); startedA(env2, [{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'manual'}]);
  env2.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  const st2 = env2._getState();
  assert(st2.pairings.A.length===2 && st2.pairings.A[0].winner==='a1', 'NC5 挙動 proxy: append は全上書きでなく末尾追加（既存 winner 残存 → generatePairing 不使用）');
  assert(st2.results.A.length===0 && st2.classes[0].started===true, 'NC6 挙動 proxy: results/started を初期化し直さない（startTournamentForClass 不使用）');
}

// ============================================================
// BIND. render 後に frpAddBtn_ へ click handler が bind される
// ============================================================
{
  // 未開始から startClassPartial で開始＋描画（既に started のクラスは refuse されるため fresh state を使う）。
  const env = loadEnv(); env._setState(env.normalizeState(fxState())); env.startClassPartial('A'); // started=true + render 込み
  const btn = env._ctx.document.getElementById('frpAddBtn_A');
  assert(btn._listeners.click && btn._listeners.click.length>=1, 'BIND1 render 後 frpAddBtn_A に click handler が bind される');
  // 表示: 有効なチェックボックス・ボタン・確定文言が出る
  const secA = env.buildFirstRoundPartialSectionHtml('A');
  assert(secA.indexOf('選択した参加者で1局目を追加作成')>=0, 'BIND2 ボタン文言「選択した参加者で1局目を追加作成」');
  assert(secA.indexOf('既に1局目対局がある参加者は表示されません')>=0, 'BIND3 補助文「既に1局目対局がある参加者は表示されません」');
  assert(!/frp-unassigned-cb[^>]*disabled/.test(secA) && !/frpAddBtn_A[^>]*disabled/.test(secA), 'BIND4 checkbox/ボタンは有効（disabled でない）');
}

console.log('');
console.log('  FRP-IMPL-003 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
