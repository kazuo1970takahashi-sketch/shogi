#!/usr/bin/env node
// FRP-IMPL-002: 1局目部分手合いの「土台 + 1局目未割当一覧表示」単体テスト。
//   設計: docs/specs/20260617_frp_design_002_post_225_partial_first_round.md（FRP-DESIGN-002）
//   本スライスの範囲: 部分開始（startClassPartial）と未割当一覧の「表示」。
//     ※ append 作成（buildFirstRoundPartialPairs / appendFirstRoundPairs / frpAddBtn 有効化）は後続 FRP-IMPL-003 で実装済み。
//       その詳細挙動・guard・SAVE-FRP-002 は test_frp_impl_003.js が担保する。本テストは 002 の土台が 003 実装後も
//       壊れていないことの回帰確認（下記 WIRED ブロックで「未実装ガードが現実に追従」していることを最小確認する）。
//   観点（タスク test 要件）:
//     V.  validatePartialStartableClass: 未開始1名以上で ok / 偶数を要求しない / 開始済み・0名は拒否（pure）。
//     U.  getUnassignedFirstRoundPlayers: pairings 在籍者を除外 / results 非空で空 / entry_no 昇順 / 削除者非混入。
//     P.  startClassPartial: started=true・pairings/results 空・generatePairing/startTournamentForClass 非流用・保存。
//     SAVE. SAVE-FRP-001: 保存成功時は warn 発火しない（初期 started=false を warn と混同しない）/
//           保存未確認（localStorage 書込不能）のときだけ warn 発火・rollback しない。
//     D.  表示: 未開始 pane に部分開始ボタン / started+results空 pane に未割当一覧 / 0・1・2人以上 /
//           A/B 独立 / 奇数でも表示 / checkbox・追加ボタンは有効（FRP-IMPL-003）/ 受付タブに新導線を出さない。
//     WIRED. append 作成は FRP-IMPL-003 で実装済み: append helper が実在し frpAddBtn を bind する
//           （押せる。暫定文言「次スライスで対応予定」は撤去）。詳細挙動は test_frp_impl_003.js。
//     NAV. 受付タブ nav-only / state 不変回帰（#225 後の最重要前提）:
//           goToTournamentFromReg は対局管理タブへ移動するだけ。round 作成なし・started 不変・
//           pairings/results 不変・generatePairing/startTournamentForClass/startClassPartial を呼ばない。
//     S.  既存挙動不変の回帰（構造ガード）: 一括開始 / submitRound missing チェック / validateStartableClass。
//   開始状態は派生でなく state（既存 schema）。新 schema は足さない。データは完全架空のみ（架空 …）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_frp_impl_002.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      disabled:false, type:'',
      style:{}, _attrs:{}, childNodes:[], _listeners:{},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev){ (this._listeners[ev]=this._listeners[ev]||[]).push(true); },
      removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

// opts.breakStorage=true で localStorage.setItem を no-op 化（save が永続化されない状況を模擬）。
function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  if(opts.breakStorage){
    ctx.localStorage.setItem = function(){ /* no-op: 書き込み失敗を模擬（getItem は null のまま） */ };
  }
  const warns = [];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       validateStartableClass:validateStartableClass,
       validatePartialStartableClass:validatePartialStartableClass,
       startClassPartial:startClassPartial,
       getUnassignedFirstRoundPlayers:getUnassignedFirstRoundPlayers,
       buildClassActionBarHtml:buildClassActionBarHtml,
       bindClassActionBarEvents:bindClassActionBarEvents,
       buildFirstRoundPartialSectionHtml:buildFirstRoundPartialSectionHtml,
       isClassStarted:isClassStarted,
       generatePairing:generatePairing,
       startTournamentForClass:startTournamentForClass,
       goToTournamentFromReg:goToTournamentFromReg,
       showTab:showTab,
       renderRegList:renderRegList,
       renderTournament:renderTournament,
       save:save, load:load,
       STORAGE_KEY:STORAGE_KEY,
       _setState:function(s){state=s;},
       _getState:function(){return state;},
       // typeof は未宣言識別子でも throw しない（append helper の不在を実行時に確認できる）
       appendTypeofs:{
         buildFirstRoundPartialPairs: typeof buildFirstRoundPartialPairs,
         appendFirstRoundPairs: typeof appendFirstRoundPairs
       }
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  api._warns = warns;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空 state：A=偶数(4名・未開始), B=奇数(3名・未開始)。pairings/results は空。rounds=4。
function fxState(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくうたろう'},
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

// 開始系 state のスナップショット（pairings / results / started / classes[].started）。
function startStateSnapshot(st){
  return JSON.stringify({
    pairings: st.pairings,
    results: st.results,
    started: st.started,
    classStarted: (st.classes||[]).map(function(c){return {id:c.id,started:c.started===true};})
  });
}

// src からトップレベル関数の本体を粗くスライス（構造ガード用）
function fnBody(name){
  const i = RAW.indexOf('function '+name+'(');
  if(i<0) return '';
  const j = RAW.indexOf('\nfunction ', i+1);
  return RAW.slice(i, j<0?RAW.length:j);
}

// ============================================================
// V. validatePartialStartableClass（pure・偶数を要求しない）
// ============================================================
{
  const env = loadEnv();
  const f = env.validatePartialStartableClass;
  assert(f({id:'A',name:'Aクラス',started:false},[{id:'a1'}]).kind==='ok', 'V1 未開始・1名 → ok');
  assert(f({id:'A',name:'Aクラス',started:false},[{id:'a1'},{id:'a2'}]).kind==='ok', 'V1b 未開始・2名 → ok');
  assert(f({id:'A',name:'Aクラス',started:false},[{id:'a1'},{id:'a2'},{id:'a3'}]).kind==='ok', 'V2 未開始・奇数3名 → ok（偶数を要求しない）');
  assert(f({id:'A',name:'Aクラス',started:true},[{id:'a1'},{id:'a2'}]).kind==='skip-already-started', 'V3 開始済み → skip-already-started');
  assert(f({id:'A',name:'Aクラス',started:false},[]).kind==='skip-empty', 'V4 0名 → skip-empty');
  // 参照：既存 validateStartableClass は奇数3名で odd（一括開始の判定は無改変＝部分開始へ流用していない）
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false},[{id:'a1'},{id:'a2'},{id:'a3'}]).kind==='odd', 'V5 validateStartableClass は奇数3名で odd（一括開始の偶数条件を保持）');
}

// ============================================================
// U. getUnassignedFirstRoundPlayers（派生・非保存）
// ============================================================
{
  const env = loadEnv();
  // pairings 在籍者を除外（＝既に1局目対局がある参加者の除外）
  const s5 = env.normalizeState(fxState());
  s5.classes[0].started=true;
  s5.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s5);
  const u5 = env.getUnassignedFirstRoundPlayers('A').map(function(p){return p.id;});
  assert(u5.length===2 && u5.indexOf('a1')<0 && u5.indexOf('a2')<0 && u5.indexOf('a3')>=0 && u5.indexOf('a4')>=0, 'U5 既に1局目対局がある(a1,a2)を除外し a3,a4 を返す');
  // results 非空 → 空配列（1局目確定後/2回戦以降は対象外）
  const s6 = env.normalizeState(fxState());
  s6.classes[0].started=true;
  s6.results.A=[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];
  env._setState(s6);
  assert(env.getUnassignedFirstRoundPlayers('A').length===0, 'U6 results 非空 → 空配列（追加対象外）');
  // entry_no 昇順（配列順に依存しない）
  const s7 = env.normalizeState(fxState());
  s7.classes[0].started=true;
  s7.players.A=[
    {id:'a3',name:'架空三郎',cls:'A',entry_no:3},
    {id:'a1',name:'架空太郎',cls:'A',entry_no:1},
    {id:'a4',name:'架空四郎',cls:'A',entry_no:4},
    {id:'a2',name:'架空次郎',cls:'A',entry_no:2}
  ];
  env._setState(s7);
  const u7 = env.getUnassignedFirstRoundPlayers('A').map(function(p){return p.entry_no;});
  assert(JSON.stringify(u7)===JSON.stringify([1,2,3,4]), 'U7 entry_no 昇順で返す');
  // 削除済み参加者（players に居ない id）は混入しない＝母集合が players[cls] のため自動充足
  const s8 = env.normalizeState(fxState());
  s8.classes[0].started=true;
  s8.pairings.A=[{p1:'a1',p2:'ghost',winner:null}]; // ghost は players に居ない
  env._setState(s8);
  const u8 = env.getUnassignedFirstRoundPlayers('A').map(function(p){return p.id;});
  assert(u8.indexOf('ghost')<0 && u8.indexOf('a1')<0, 'U8 削除済み/未登録 id は一覧に出ない（母集合は players[cls]）');
}

// ============================================================
// P. startClassPartial（部分開始：state 効果 + generatePairing 非流用 + 保存）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState())); // A=4名(偶数), B=3名(奇数), 全未開始
  let threw=false; try{ env.startClassPartial('A'); }catch(e){ threw=true; console.error(e); }
  assert(!threw, 'P0 startClassPartial(A) が例外を投げない（render 込みで安全）');
  const st = env._getState();
  assert(env.isClassStarted('A')===true, 'P-started 部分開始後 A は started=true');
  assert(Array.isArray(st.pairings.A) && st.pairings.A.length===0, 'P-pair 部分開始後 pairings.A は空配列');
  assert(Array.isArray(st.results.A) && st.results.A.length===0, 'P-res 部分開始後 results.A は空配列');
  // 偶数4名でも pairings が空＝generatePairing/startTournamentForClass を流用していない proxy
  assert(st.pairings.A.length===0, 'P-nogen 偶数クラスでも pairings.A は空（generatePairing 非呼出）');
  // 保存成功（SAVE-FRP-001 正常系）: persisted に started=true / pairings空 / results空 が反映
  const persisted = JSON.parse(env._ctx.localStorage.getItem(env.STORAGE_KEY)||'{}');
  const pA = (persisted.classes||[]).find(function(c){return c.id==='A';});
  assert(pA && pA.started===true, 'P-save1 保存後 persisted.classes[A].started=true');
  assert(Array.isArray(persisted.pairings.A) && persisted.pairings.A.length===0, 'P-save2 保存後 persisted.pairings.A 空');
  assert(Array.isArray(persisted.results.A) && persisted.results.A.length===0, 'P-save3 保存後 persisted.results.A 空');
  // unknown class は mutate しない
  const env2 = loadEnv(); env2._setState(env2.normalizeState(fxState()));
  const before = JSON.stringify(env2._getState());
  env2.startClassPartial('ZZ');
  assert(JSON.stringify(env2._getState())===before, 'P-unknown 未知クラスは state を変更しない（拒否）');
  // 奇数クラスでも部分開始できる（偶数を要求しない）
  const env3 = loadEnv(); env3._setState(env3.normalizeState(fxState()));
  env3.startClassPartial('B'); // 3名・奇数
  assert(env3.isClassStarted('B')===true && env3._getState().pairings.B.length===0, 'P-odd 奇数クラス B も部分開始できる（started=true・pairings空）');
}

// ============================================================
// SAVE. SAVE-FRP-001 保存検証 warn（成功時は出さない／未確認時のみ出す・rollback しない）
// ============================================================
{
  // 成功時：warn は発火しない（初期 started=false 自体を warn と混同しない）
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  env.startClassPartial('A');
  const warnedOk = env._warns.some(function(w){ return String(w[0]).indexOf('SAVE-FRP-001')>=0; });
  assert(!warnedOk, 'SAVE1 保存成功時は SAVE-FRP-001 warn を出さない（started=false 初期値を warn と混同しない）');

  // 未確認時：localStorage 書込不能 → persisted で started=true を確認できない → warn 発火
  const envB = loadEnv({breakStorage:true});
  envB._setState(envB.normalizeState(fxState()));
  let threwB=false; try{ envB.startClassPartial('A'); }catch(e){ threwB=true; }
  assert(!threwB, 'SAVE2a 保存未確認でも startClassPartial は例外を投げない');
  const warnedNg = envB._warns.some(function(w){ return String(w[0]).indexOf('SAVE-FRP-001')>=0; });
  assert(warnedNg, 'SAVE2 保存未確認（書込不能）のとき SAVE-FRP-001 warn が発火する');
  // rollback しない：warn が出ても started は立てたまま・運営継続
  assert(envB.isClassStarted('A')===true, 'SAVE3 保存未確認でも started は立てたまま（rollback しない・運営継続）');
}

// ============================================================
// D. 表示（部分開始ボタン / 未割当一覧 / 0・1・2人以上 / A・B独立 / 奇数 / disabled / 受付タブに出さない）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  // 未開始 pane（対局管理）に部分開始ボタンが出る（buildClassActionBarHtml）
  const barA = env.buildClassActionBarHtml('A'); // 未開始・4名（偶数）
  assert(barA.indexOf('startBtnPartial_A')>=0, 'D-bar1 未開始クラスの action bar に部分開始ボタン(startBtnPartial_A)が出る');
  assert(barA.indexOf('このクラスを部分開始')>=0, 'D-bar1b 部分開始ボタン文言「このクラスを部分開始（未割当者を表示）」');
  assert(barA.indexOf('選んだ人から1局目を開始')<0, 'D-bar1c 完成形に見える旧文言「選んだ人から1局目を開始」は使わない');
  // 偶数クラスでは既存の一括開始導線(startBtnClass_「全員で1局目を開始」)と併置（無変更）
  assert(barA.indexOf('startBtnClass_A')>=0 && barA.indexOf('全員で1局目を開始')>=0, 'D-bar2 偶数A: 一括開始(startBtnClass_A「全員で1局目を開始」)と部分開始を併置');
  // 奇数クラス B（3名・未開始）: 一括開始は出ない（偶数ガード）・部分開始は出る（奇数でも表示）
  const barB = env.buildClassActionBarHtml('B');
  assert(barB.indexOf('startBtnClass_B')<0, 'D-bar3 奇数B: 既存一括開始ボタンは出ない（偶数ガードを変えていない）');
  assert(barB.indexOf('startBtnPartial_B')>=0, 'D-bar4 奇数B: 部分開始ボタンは出る（奇数でも開始導線・未割当表示の入口）');

  // 2人以上の未割当表示：A(4名) 部分開始 → 4名表示
  const e2 = loadEnv(); e2._setState(e2.normalizeState(fxState()));
  e2.startClassPartial('A');
  const secA = e2.buildFirstRoundPartialSectionHtml('A');
  assert(secA.indexOf('1局目 未割当参加者')>=0, 'D-sec1 未割当セクション見出し「1局目 未割当参加者」');
  assert(secA.indexOf('1局目 未割当参加者（4名）')>=0, 'D-sec1c 見出しに未割当人数（4名）を併記（FRP-UNASSIGNED-COUNT-001）');
  // FRP-SMALL-UX-001: 未割当人数からの組成見込み（全員選択時に作れる組数・待機の有無）を派生表示
  assert(secA.indexOf('frp-pairing-projection')>=0, 'D-sec1d 組成見込み行（frp-pairing-projection）を表示（FRP-SMALL-UX-001）');
  assert(secA.indexOf('全員（4名）を選ぶと、2組')>=0, 'D-sec1e 偶数4名: 「全員（4名）を選ぶと、2組…追加できます」と具体化（FRP-SMALL-UX-001）');
  assert(secA.indexOf('1名が未割当のまま残ります')<0, 'D-sec1f 偶数4名: 割り切れるので待機（1名残る）注記は出さない');
  assert(secA.indexOf('選択した参加者で1局目を追加作成')>=0, 'D-sec1b 説明文/ボタンに「選択した参加者で1局目を追加作成」（FRP-IMPL-003 で append 実装済み）');
  assert(secA.indexOf('架空太郎')>=0 && secA.indexOf('架空四郎')>=0, 'D-sec2 2人以上: 未割当の全4名が一覧に出る');
  // render 経路でも pane に出る
  assert(e2._ctx._elements['pane-A'] && e2._ctx._elements['pane-A'].innerHTML.indexOf('1局目 未割当参加者')>=0, 'D-sec2b renderTournament 経路でも pane-A に未割当一覧が描画される');

  // 1人の未割当表示：B(3名) 部分開始 + b1,b2 を pairings に → b3 のみ未割当（奇数でも表示）
  const e1 = loadEnv(); const s1 = e1.normalizeState(fxState());
  s1.classes[1].started=true; s1.pairings.B=[{p1:'b1',p2:'b2',winner:null,lastModifiedBy:'auto'}];
  e1._setState(s1);
  const secB = e1.buildFirstRoundPartialSectionHtml('B');
  assert(secB.indexOf('架空梅子')>=0 && secB.indexOf('架空花子')<0 && secB.indexOf('架空桃子')<0, 'D-sec3 1人: 未割当(b3=架空梅子)のみ表示・在籍者(b1,b2)は出ない（奇数の待機1人を表示）');
  assert(secB.indexOf('1局目 未割当参加者（1名）')>=0, 'D-sec3b 見出しの未割当人数は実数を反映（1名・FRP-UNASSIGNED-COUNT-001）');
  // FRP-SMALL-UX-001: 1名のみは対局を作れないため「あと1名以上」の受付待ち案内に切替（組成見込みの特殊分岐）
  assert(secB.indexOf('現在の未割当は1名です')>=0 && secB.indexOf('あと1名以上')>=0, 'D-sec3c 1名のみ: 「あと1名以上の受付をお待ちください」と案内（FRP-SMALL-UX-001）');
  assert(secB.indexOf('を選ぶと、')<0, 'D-sec3d 1名のみ: 作れないので「全員を選ぶと…組」の組数案内は出さない（FRP-SMALL-UX-001）');

  // FRP-SMALL-UX-001: 奇数（3名・全員未割当）→ 1組できて1名が待機する見込みを明示（奇数分岐）
  const eOdd = loadEnv(); const sOdd = eOdd.normalizeState(fxState());
  sOdd.classes[1].started=true; // B を部分開始（pairings 空 → b1,b2,b3 の3名すべて未割当）
  eOdd._setState(sOdd);
  const secOdd = eOdd.buildFirstRoundPartialSectionHtml('B');
  assert(secOdd.indexOf('1局目 未割当参加者（3名）')>=0, 'D-sec6a 奇数3名: 見出し人数（3名・FRP-UNASSIGNED-COUNT-001）');
  assert(secOdd.indexOf('全員（3名）を選ぶと、1組')>=0, 'D-sec6b 奇数3名: 「全員（3名）を選ぶと、1組…」と具体化（FRP-SMALL-UX-001）');
  assert(secOdd.indexOf('1名が未割当のまま残ります（奇数）')>=0, 'D-sec6c 奇数3名: 「1名が未割当のまま残ります（奇数）」を明示（FRP-SMALL-UX-001）');

  // 0人の未割当表示：A(4名) 全員 pairings に → セクション非表示（'')
  const e0 = loadEnv(); const s0 = e0.normalizeState(fxState());
  s0.classes[0].started=true; s0.pairings.A=[{p1:'a1',p2:'a2',winner:null},{p1:'a3',p2:'a4',winner:null}];
  e0._setState(s0);
  assert(e0.buildFirstRoundPartialSectionHtml('A')==='', 'D-sec4 0人: 未割当が無いときセクションは非表示（空文字）');

  // results 非空（2回戦以降）では未割当セクションを出さない
  const eR = loadEnv(); const sR = eR.normalizeState(fxState());
  sR.classes[0].started=true; sR.results.A=[[{p1:'a1',p2:'a2',winner:'a1'}]];
  eR._setState(sR);
  assert(eR.buildFirstRoundPartialSectionHtml('A')==='', 'D-sec5 results 非空（1局目確定後/2回戦以降）では未割当セクションを出さない');

  // checkbox・追加ボタンは有効（FRP-IMPL-003 で append 実装済み）。暫定文言は撤去。
  assert(!/frp-unassigned-cb[^>]*disabled/.test(secA), 'D-dis1 未割当チェックボックスは有効（FRP-IMPL-003 で選択可能）');
  assert(!/frpAddBtn_A[^>]*disabled/.test(secA), 'D-dis2 「選択した参加者で1局目を追加作成」ボタンは有効（FRP-IMPL-003）');
  assert(secA.indexOf('次スライスで対応予定')<0 && secA.indexOf('選択した参加者で1局目を追加作成')>=0, 'D-dis3 暫定文言「次スライスで対応予定」は撤去され実ボタン文言に置換');
  assert(secA.indexOf('選択者で対局作成')<0, 'D-dis4 完成形と紛らわしい旧文言「選択者で対局作成」は使わない（文言規律を維持）');

  // 受付タブ（renderRegList）に新しい手合作成導線を出さない（受付タブは nav-only / 無変更）
  const eReg = loadEnv(); eReg._setState(eReg.normalizeState(fxState()));
  eReg.renderRegList();
  let regHasNew=false;
  const els = eReg._ctx._elements;
  for(const k in els){
    const h = (els[k] && els[k].innerHTML) || '';
    if(h.indexOf('startBtnPartial_')>=0 || h.indexOf('frpAddBtn_')>=0 || h.indexOf('1局目 未割当参加者')>=0){ regHasNew=true; break; }
  }
  assert(!regHasNew, 'D-reg 受付タブ(renderRegList)に部分開始/未割当の新導線を出さない（受付タブ無変更）');
}

// ============================================================
// ISO. A/B クラス独立（A の部分開始が B の started/pairings/未割当セクションに波及しない）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  env.startClassPartial('A'); // A のみ部分開始
  const st = env._getState();
  assert(env.isClassStarted('A')===true && env.isClassStarted('B')===false, 'ISO1 A 部分開始後も B は未開始（started 独立）');
  assert(st.pairings.B.length===0 && st.results.B.length===0, 'ISO2 A 部分開始で B の pairings/results は不変（空のまま）');
  assert(env.buildFirstRoundPartialSectionHtml('A')!=='' , 'ISO3 A は未割当セクションを表示（部分開始済み）');
  assert(env.buildFirstRoundPartialSectionHtml('B')==='' , 'ISO4 B は未割当セクションを出さない（未開始＝独立）');
  // action bar も独立：A は reset 表示（部分開始済み）/ B は依然 部分開始ボタンを出す
  assert(env.buildClassActionBarHtml('A').indexOf('startBtnPartial_A')<0, 'ISO5 A 部分開始後は action bar に部分開始ボタンを出さない（開始済み）');
  assert(env.buildClassActionBarHtml('B').indexOf('startBtnPartial_B')>=0, 'ISO6 B は未開始のため部分開始ボタンを出し続ける（A に波及しない）');
}

// ============================================================
// WIRED. append 作成は FRP-IMPL-003 で実装済み（helper 実在 / frpAddBtn を bind）。
//   詳細な append 挙動・guard・SAVE-FRP-002 は test_frp_impl_003.js が担保する。本ブロックは
//   「002 が前提とした未実装ガードが、003 実装後の現実に追従している」ことの最小確認（回帰防止）。
// ============================================================
{
  const env = loadEnv();
  // append helper は FRP-IMPL-003 で実装済み（function）
  assert(env.appendTypeofs.buildFirstRoundPartialPairs==='function', 'OFF1 buildFirstRoundPartialPairs は実装済み（function・FRP-IMPL-003）');
  assert(env.appendTypeofs.appendFirstRoundPairs==='function', 'OFF2 appendFirstRoundPairs は実装済み（function・FRP-IMPL-003）');
  // bindClassActionBarEvents は frpAddBtn を取得して onClickAppendFirstRound を bind する（押せる）
  const bindBody = fnBody('bindClassActionBarEvents');
  assert(bindBody.indexOf("getElementById('frpAddBtn")>=0, 'OFF3 bindClassActionBarEvents は frpAddBtn を取得して append handler を bind する（FRP-IMPL-003）');
  assert(bindBody.indexOf('startBtnPartial_')>=0, 'OFF3b bindClassActionBarEvents は部分開始ボタンも bind（startClassPartial）');
  // ソース全体で frpAddBtn を getElementById で取得し click を bind する（押せる）
  assert(RAW.indexOf("getElementById('frpAddBtn")>=0, 'OFF3c ソース全体で frpAddBtn を getElementById で取得し click を bind する（FRP-IMPL-003）');
  const secBody = fnBody('buildFirstRoundPartialSectionHtml');
  assert(secBody.indexOf('addEventListener')<0, 'OFF4 未割当セクション生成に addEventListener を含まない（表示と bind を分離・bind は bindClassActionBarEvents）');
  // 未割当セクション helper 自体は pairings を mutate しない（append は appendFirstRoundPairs に分離）
  assert(secBody.indexOf('.concat(')<0 && secBody.indexOf('state.pairings')<0, 'OFF5 未割当セクション helper は pairings を mutate しない（表示専用・append は別関数）');
}

// ============================================================
// NAV. 受付タブ nav-only / 開始系 state 不変（#225 後の最重要回帰・FRP でも踏襲）
//   A は開始可能(ok)な ready 状態。誤って開始系/部分開始が走れば A の pairings/started が変化＝高い検出力。
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  assert(env.validateStartableClass(env._getState().classes[0], env._getState().players.A).kind==='ok', 'NAV0 前提：A は開始可能(ok)＝nav の不変検出力を担保');
  const before = startStateSnapshot(env._getState());
  let threw=false;
  try{ env.goToTournamentFromReg(); }catch(e){ threw=true; console.error('    nav threw: '+(e&&e.message)); }
  assert(!threw, 'NAV1 goToTournamentFromReg は例外なく実行');
  const st = env._getState();
  // 対局管理タブへ移動
  assert(env._ctx._elements['pane-tournament'].style.display==='block', 'NAV2 対局管理ペインが表示される（pane-tournament=block）');
  assert(env._ctx._elements['pane-reg'].style.display==='none', 'NAV3 受付ペインが非表示になる（pane-reg=none）');
  assert((env._ctx._elements['tab-tournament'].className||'').indexOf('active')>=0, 'NAV4 対局管理タブが active');
  // 開始系 state 不変（round 作成なし / started 不変 / pairings・results 不変）
  assert(startStateSnapshot(st)===before, 'NAV5 開始系 state（pairings/results/started/classes[].started）が不変');
  assert(st.pairings.A.length===0 && st.pairings.B.length===0, 'NAV6 pairings 不変（1回戦を作らない）');
  assert(st.results.A.length===0 && st.results.B.length===0, 'NAV7 results 不変');
  assert(st.classes[0].started===false && st.classes[1].started===false, 'NAV8 classes[].started 不変（部分開始も走らない）');
  assert(st.started===false, 'NAV9 互換 state.started 不変');
  // goToTournamentFromReg 本体は開始系/部分開始を一切呼ばない（構造ガード）。
  //   関数本体のみを抽出する（次関数のコメントを巻き込まないよう { ～ 最初の行頭 } で切る）。
  const navMatch = /function goToTournamentFromReg\(\)\{([\s\S]*?)\n\}/.exec(RAW);
  const navBody = navMatch ? navMatch[1] : '';
  assert(navBody.indexOf('generatePairing')<0, 'NAV10 nav 本体に generatePairing 呼出なし');
  assert(navBody.indexOf('startTournamentForClass')<0, 'NAV11 nav 本体に startTournamentForClass 呼出なし');
  assert(navBody.indexOf('startTournament(')<0, 'NAV11b nav 本体に startTournament() 呼出なし');
  assert(navBody.indexOf('startClassPartial')<0, 'NAV12 nav 本体に startClassPartial 呼出なし（受付タブに部分開始導線を持ち込まない）');
  assert(navBody.indexOf("showTab('tournament')")>=0 && navBody.indexOf('save(')>=0, 'NAV13 nav 本体は save()+showTab(tournament) のみ（対局管理へ移動するだけ）');
}

// ============================================================
// S. 既存挙動不変の回帰（構造ガード）：一括開始 / submitRound 確定条件（FIRSTROUND-ODD-001 で統一） / 部分開始の非流用
// ============================================================
{
  // 受付一括開始 #startBtn 系（legacy startTournament）は無変更で残る・部分開始を混ぜていない
  const stb = fnBody('startTournament');
  assert(stb.indexOf('collectStartCandidates')>=0 && stb.indexOf('applyStartForCandidates')>=0, 'S1 startTournament の一括開始ロジック（collect/apply）が無変更で残る');
  assert(stb.indexOf('startClassPartial')<0 && stb.indexOf('startBtnPartial')<0, 'S2 一括開始フローに部分開始を混入していない');
  // FIRSTROUND-ODD-001: 旧 S4 は「missing チェックが残る（緩和していない）」の番人だった
  //   （#272 Codex P1 による意図的ロック）。同じ Codex の 2026-08-09 再評価（1回戦だけ別の
  //   状態機械になっているのが誤り）を受けて解除し、逆向きの番人（再導入の禁止）に反転した。
  //   S5 は本来「部分手合いロジックの混入防止」であってコメントの検閲ではないため、
  //   コメント除去後の本文で判定する（解説コメントは関数名に言及してよい）。
  const srb = fnBody('submitRound');
  const srbCode = srb.replace(/\/\/[^\n]*/g, '');
  assert(srb.indexOf('全試合の結果を入力してください')>=0, 'S3 submitRound の全結果入力チェックが残る');
  assert(srbCode.indexOf('対局に登録されていません')<0 && srbCode.indexOf('missing')<0, 'S4 submitRound の全員在籍(missing)チェックは廃止済み（FIRSTROUND-ODD-001・再導入しない）');
  assert(srbCode.indexOf('startClassPartial')<0 && srbCode.indexOf('getUnassignedFirstRoundPlayers')<0, 'S5 submitRound 本文（コメント除く）に部分手合いロジックを混ぜていない');
  // startClassPartial は generatePairing / startTournamentForClass / applyStartForCandidates を流用しない
  const scp = fnBody('startClassPartial');
  assert(scp.indexOf('generatePairing')<0, 'S6 startClassPartial は generatePairing を呼ばない');
  assert(scp.indexOf('startTournamentForClass')<0 && scp.indexOf('applyStartForCandidates')<0, 'S7 startClassPartial は startTournamentForClass/applyStartForCandidates を流用しない');
  // 既存の正規開始導線（対局管理タブ startBtnClass_）と validateStartableClass は健在
  assert(RAW.indexOf("id=\"startBtnClass_'+escapeHtml(cls)+'\"")>=0, 'S8 対局管理タブの一括開始ボタン startBtnClass_ は健在（無変更）');
  assert(RAW.indexOf('function validateStartableClass(classInfo,playersForClass)')>=0, 'S9 validateStartableClass のシグネチャ不変');
}

console.log('');
console.log('  FRP-IMPL-002 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
