#!/usr/bin/env node
// START-FRP-UX-001: 大会当日の幹事向け統合 UX（クラス別開始 / 1回戦中だけの途中参加 / 参加者一覧ルビ）の受入テスト。
//   本スライスは「既に orphan base にある実装（#218/#225/#227-234 由来）の受入条件を 1 ファイルに固定」しつつ、
//   本 PR の純追加分（参加者一覧の ふりがな編集 editPlayerYomi / クラス別開始の主導線化 buildClassActionBarHtml）を担保する。
//   既存テスト（FRP-IMPL-002/003/004B・FURIGANA-MVP-001・START-UX-CONSOLIDATE-001）と重複する詳細挙動は
//   それぞれの専用テストが担保する。本ファイルはタスクの 8 受入条件を横断で確認する。
//
//   タスク受入条件（テスト要件）:
//     C1. A/B クラス別開始が独立して動作する（startTournamentForClass(A) は A だけ・B 非破壊／その逆）
//     C2. A/B クラス別リセットが既存挙動を壊さない（resetClassForClass(A) は A だけクリア・B 保持）
//     C3. 1回戦中の途中参加は組み込める（appendFirstRoundPairs：started・results 空で選択者を末尾 append・既存対局保持）
//     C4. 2回戦以降の途中参加はブロックされる（results 非空＝1局目確定後/2回戦以降は append/未割当一覧とも不可）
//     C5. 勝敗入力済みでは勝敗保護が優先される（results に勝敗あり→append 全面ブロック／pairings 内 既存 winner は append で不変）
//     C6. ルビ未入力の既存データでも壊れない（normalizeState で yomi:'' 補完／renderPlayerNameWithRuby・makePlayerRow は氏名のみ）
//     C7. ルビ入力済みなら参加者一覧に表示される（makePlayerRow に <ruby>…<rt>…</rt></ruby>）＋ editPlayerYomi で登録後も編集できる
//     C8. 保存→reload 後もルビとクラス別状態が維持される（save→別 env load：yomi / classes[].started / pairings 保持）
//   追加（本 PR の純追加分）:
//     U1. editPlayerYomi: prompt 値を normalizeYomi して player.yomi を更新・save 検証経路（updateField）を通る／空でルビ解除／cancel・無変更は no-op
//     U2. クラス別開始の主導線化: buildClassActionBarHtml の startBtnClass_ が full-size（btn-sm を外す）／開始済みは「開始済み」状態ラベル＋リセットは据え置き
//   開始状態は派生でなく state（既存 schema）。新 schema は足さない。データは完全架空のみ（架空 …）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_start_frp_ux_001.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（createElement / createTextNode / appendChild を実体保持し、ruby 構造を serialize で検証可能にする）。
function makeContext(){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function gatherText(node){
    if(node==null)return '';
    if(node.nodeType===3)return node.textContent;
    var s='', ch=node.childNodes||[];
    for(var i=0;i<ch.length;i++)s+=gatherText(ch[i]);
    return s;
  }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'',
      type:'', selected:false, checked:false, disabled:false, hidden:false,
      style:{}, _attrs:{}, _innerHTML:'', childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      insertBefore:function(c){ this.childNodes.unshift(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
      remove:function(){},
      addEventListener:function(){}, removeEventListener:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      removeAttribute:function(k){ delete this._attrs[k]; },
      focus:function(){}, blur:function(){}, click:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
      get firstChild(){ return this.childNodes[0]||null; },
      get lastChild(){ return this.childNodes[this.childNodes.length-1]||null; },
      get children(){ return this.childNodes.filter(function(n){return n.nodeType===1;}); },
      get textContent(){ return gatherText(this); },
      set textContent(v){ this.childNodes=[makeText(v)]; },
      get innerHTML(){ return this._innerHTML; },
      set innerHTML(v){ this._innerHTML=String(v); if(v==='')this.childNodes=[]; }
    };
  }
  var elements={};
  var docMock={
    _elements:elements,
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
  function BlobMock(parts,opt){ return {_isMockBlob:true, _content:(parts&&parts[0])?String(parts[0]):'', type:opt&&opt.type}; }
  var urlMock={ createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){} };
  return { document:docMock, window:winMock, localStorage:localStorageMock, Blob:BlobMock, URL:urlMock };
}

// ノードツリー → HTML 文字列（text ノードは escape して連結＝ブラウザの textContent 描画相当）
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function serialize(node){
  if(node==null)return '';
  if(node.nodeType===3)return esc(node.textContent);
  var tag=String(node.tagName||'').toLowerCase(), inner='', ch=node.childNodes||[];
  for(var i=0;i<ch.length;i++)inner+=serialize(ch[i]);
  return '<'+tag+'>'+inner+'</'+tag+'>';
}

// opts.promptValue で prompt の戻り値を固定（null=cancel も可）。opts.confirm で confirm の戻り値を固定（既定 true）。
function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  const promptState = { value: ('promptValue' in opts) ? opts.promptValue : '' };
  const warns = [];
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       startTournamentForClass:startTournamentForClass,
       resetClassForClass:resetClassForClass,
       startClassPartial:startClassPartial,
       getUnassignedFirstRoundPlayers:getUnassignedFirstRoundPlayers,
       buildFirstRoundPartialPairs:buildFirstRoundPartialPairs,
       appendFirstRoundPairs:appendFirstRoundPairs,
       buildFirstRoundPartialSectionHtml:buildFirstRoundPartialSectionHtml,
       buildClassActionBarHtml:buildClassActionBarHtml,
       isClassStarted:isClassStarted,
       renderPlayerNameWithRuby:renderPlayerNameWithRuby,
       makePlayerRow:makePlayerRow,
       editPlayerYomi:editPlayerYomi,
       __setAppModalTestResolver:__setAppModalTestResolver,
       updateField:updateField,
       normalizeYomi:normalizeYomi,
       getName:getName,
       renderRegList:renderRegList,
       renderTournament:renderTournament,
       save:save, load:load,
       STORAGE_KEY:STORAGE_KEY,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  // prompt は env 構築時の opts.promptValue を返す（null=cancel も表現できる）。
  const promptFn = function(){ return promptState.value; };
  const confirmFn = function(){ return ('confirm' in opts) ? opts.confirm : true; };
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, confirmFn, promptFn,
    function(){}, ctx.Blob, ctx.URL, consoleMock, Promise, function(){}
  );
  api._ctx = ctx;
  api._warns = warns;
  api._setPromptValue = function(v){ promptState.value = v; };
  // IN-APP-MODAL-001 (#606): prompt を appPrompt へ移行したため、アプリ内モーダルの結果を
  //   従来の promptState.value / opts.confirm から同期解決する（DOM 非依存・_setPromptValue 互換）。
  if(typeof api.__setAppModalTestResolver==='function'){
    api.__setAppModalTestResolver(function(type){ if(type==='prompt')return promptState.value; if(type==='confirm')return ('confirm' in opts)?opts.confirm:true; return true; });
  }
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空 state：A=4名(偶数), B=2名(偶数)。両クラス開始可能。yomi は一部のみ。
function fxState(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくうたろう'},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
      {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

// ============================================================
// C1. A/B クラス別開始が独立して動作する
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  env.startTournamentForClass('A');
  const st = env._getState();
  assert(env.isClassStarted('A')===true, 'C1-1 startTournamentForClass(A) で A は started=true');
  assert(env.isClassStarted('B')===false, 'C1-2 A 開始後も B は started=false（独立）');
  assert(st.pairings.A.length>0, 'C1-3 A の1局目 pairings が生成される');
  assert(st.pairings.B.length===0, 'C1-4 B の pairings は空のまま（A 開始に巻き込まれない）');

  const env2 = loadEnv();
  env2._setState(env2.normalizeState(fxState()));
  env2.startTournamentForClass('B');
  const st2 = env2._getState();
  assert(env2.isClassStarted('B')===true && env2.isClassStarted('A')===false, 'C1-5 startTournamentForClass(B) は B だけ開始・A 非破壊');
  assert(st2.pairings.B.length>0 && st2.pairings.A.length===0, 'C1-6 B の pairings 生成・A は空のまま');
}

// ============================================================
// C2. A/B クラス別リセットが既存挙動を壊さない（confirm=true）
// ============================================================
{
  const env = loadEnv({confirm:true});
  env._setState(env.normalizeState(fxState()));
  env.startTournamentForClass('A');
  env.startTournamentForClass('B');
  assert(env.isClassStarted('A')===true && env.isClassStarted('B')===true, 'C2-0 前提：A・B とも開始済み');
  const bPairsBefore = JSON.stringify(env._getState().pairings.B);
  env.resetClassForClass('A');
  const st = env._getState();
  assert(env.isClassStarted('A')===false, 'C2-1 resetClassForClass(A) で A は started=false');
  assert(st.pairings.A.length===0 && st.results.A.length===0, 'C2-2 A の pairings/results はクリアされる');
  assert(env.isClassStarted('B')===true, 'C2-3 A リセット後も B は started=true（他クラス保持）');
  assert(JSON.stringify(st.pairings.B)===bPairsBefore, 'C2-4 A リセットで B の pairings は不変（他クラス非破壊）');
  // confirm=false ならリセットしない（既存挙動：誤操作防止）
  const env2 = loadEnv({confirm:false});
  env2._setState(env2.normalizeState(fxState()));
  env2.startTournamentForClass('A');
  env2.resetClassForClass('A');
  assert(env2.isClassStarted('A')===true, 'C2-5 confirm キャンセル時はリセットしない（既存ガード維持）');
}

// ============================================================
// C3. 1回戦中の途中参加は組み込める（appendFirstRoundPairs）
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started=true;                 // A を部分開始相当（started・pairings 空）
  s.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}]; // 既に a1-a2 は1局目あり
  env._setState(s);
  // 途中参加（未割当 a3,a4）を選択して append
  const unassigned = env.getUnassignedFirstRoundPlayers('A');
  assert(unassigned.map(function(p){return p.id;}).join(',')==='a3,a4', 'C3-0 未割当一覧は a3,a4（既に1局目がある a1,a2 を除外）');
  const built = env.buildFirstRoundPartialPairs(unassigned);
  const okAppend = env.appendFirstRoundPairs('A', built.pairs);
  const st = env._getState();
  assert(okAppend===true, 'C3-1 1回戦中（started・results 空）は appendFirstRoundPairs が成功する');
  assert(st.pairings.A.length===2, 'C3-2 選択者の対局が末尾 append される（1→2 件）');
  assert(st.pairings.A[0].p1==='a1' && st.pairings.A[0].p2==='a2', 'C3-3 既存対局(a1-a2)は先頭で不変');
  assert(st.pairings.A[1].p1==='a3' && st.pairings.A[1].p2==='a4', 'C3-4 追加対局 a3-a4 が末尾に入る');
  assert(env.isClassStarted('B')===false && st.pairings.B.length===0, 'C3-5 A の途中参加は B に波及しない（A/B 独立判定）');
  // 奇数選択時は末尾1人が leftover として未割当に残る
  const env2 = loadEnv();
  const s2 = env2.normalizeState(fxState());
  s2.classes[0].started=true; s2.pairings.A=[];
  env2._setState(s2);
  const built3 = env2.buildFirstRoundPartialPairs(env2.getUnassignedFirstRoundPlayers('A')); // 4名→2組
  assert(built3.pairs.length===2 && built3.leftover===null, 'C3-6 偶数4名選択→2組・leftover なし');
}

// ============================================================
// C4. 2回戦以降の途中参加はブロックされる（results 非空）
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started=true;
  s.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'manual'}];
  s.results.A=[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'manual'}]]; // 1局目確定済み（2回戦以降）
  env._setState(s);
  assert(env.getUnassignedFirstRoundPlayers('A').length===0, 'C4-1 results 非空では未割当一覧は空（途中参加導線の対象外）');
  assert(env.buildFirstRoundPartialSectionHtml('A')==='', 'C4-2 results 非空では未割当セクションを描画しない');
  const before = JSON.stringify(env._getState().pairings.A);
  const okAppend = env.appendFirstRoundPairs('A', [{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  assert(okAppend===false, 'C4-3 results 非空では appendFirstRoundPairs はブロック（false）');
  assert(JSON.stringify(env._getState().pairings.A)===before, 'C4-4 ブロック時は pairings を一切変更しない');
}

// ============================================================
// C5. 勝敗入力済みでは勝敗保護が優先される
// ============================================================
{
  // (a) results に勝敗あり→途中参加は全面ブロック（勝敗保護が優先）
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started=true;
  s.results.A=[[{p1:'a1',p2:'a2',winner:'a1'}]];   // 勝敗入力済み
  env._setState(s);
  assert(env.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null}])===false, 'C5-1 勝敗入力済み（results 非空）では途中参加をブロック＝勝敗保護が優先');

  // (b) pairings 内に既存 winner があっても（results 空なら）append は許可し、既存 winner を不変で保持する
  const env2 = loadEnv();
  const s2 = env2.normalizeState(fxState());
  s2.classes[0].started=true;
  s2.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'manual'}]; // 既存対局に winner 入力済み・results は空
  env2._setState(s2);
  const okAppend = env2.appendFirstRoundPairs('A',[{p1:'a3',p2:'a4',winner:null,lastModifiedBy:'auto'}]);
  const st2 = env2._getState();
  assert(okAppend===true, 'C5-2 results 空なら（pairings 内 winner 入力済みでも）途中参加は許可される');
  assert(st2.pairings.A[0].winner==='a1', 'C5-3 既存対局の winner(a1) は append 後も不変（勝敗保護）');
  assert(st2.pairings.A.length===2 && st2.pairings.A[1].winner===null, 'C5-4 追加対局は winner:null で末尾追加');
}

// ============================================================
// C6. ルビ未入力の既存データでも壊れない
// ============================================================
{
  const env = loadEnv();
  // 既存保存データ（yomi キー不在）→ normalizeState で yomi:'' 補完
  const ns = env.normalizeState({
    players:{A:[{id:'p1',name:'架空太郎',member:'member',grade:'ippan',entry_no:1}],B:[]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'}]
  });
  assert(ns.players.A[0].yomi==='', 'C6-1 yomi 不在の既存データ → normalizeState が yomi:"" を補完');
  // ふりがな空 → ルビなし（氏名のみ・空 <rt> を出さない）
  const node = env.renderPlayerNameWithRuby('佐藤','');
  assert(node.nodeType===3, 'C6-2 yomi 空 → text ノード（ruby を使わない）');
  assert(serialize(node)==='佐藤', 'C6-3 yomi 空 → 氏名のみ表示（空 <rt> なし）');
  // 受付一覧の行も氏名のみ
  env._setState(ns);
  const h = serialize(env.makePlayerRow(ns.players.A[0],'A',0));
  assert(h.indexOf('<ruby>')<0 && h.indexOf('<rt>')<0, 'C6-4 yomi 空の行はルビ無し（参加者一覧が壊れない）');
  assert(h.indexOf('架空太郎')>=0, 'C6-5 氏名は表示される');
}

// ============================================================
// C7. ルビ入力済みなら参加者一覧に表示される（+ 登録後の編集 editPlayerYomi）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  // yomi あり（a1=かくうたろう）→ 行にルビ
  const row = serialize(env.makePlayerRow(env._getState().players.A[0],'A',0));
  assert(row.indexOf('<ruby>')>=0 && row.indexOf('<rt>かくうたろう</rt>')>=0, 'C7-1 yomi ありの参加者は一覧にルビ表示（<ruby>氏名<rt>よみ</rt></ruby>）');
  // 行の編集導線（REG-TAB-TIDY-001 (#743) ⑤b: 3ボタン→「⋯ 編集」1ボタン＋シートへ集約。
  //   意図＝名前編集/ふりがな編集/削除の導線が退行しないこと・呼び先関数（editPlayer/editPlayerYomi/removePlayer）不変）
  assert(row.indexOf('⋯ 編集')>=0, 'C7-2 行に「⋯ 編集」集約ボタン（旧: 名前編集/削除ボタン）');
  assert(RAW.indexOf('ふりがなを編集')>=0 && RAW.indexOf('editPlayerYomi(playerId,cls)')>=0, 'C7-3 編集シートに「ふりがなを編集」項目→editPlayerYomi');

  // editPlayerYomi: 登録後でも yomi を編集・保存できる（a2 は yomi 空 → 入力で付与）
  const env2 = loadEnv({promptValue:'かくうじろう'});
  env2._setState(env2.normalizeState(fxState()));
  env2.editPlayerYomi('a2','A');
  const a2 = env2._getState().players.A.find(function(p){return p.id==='a2';});
  assert(a2.yomi==='かくうじろう', 'C7-4 editPlayerYomi で登録後の参加者に yomi を付与できる');
  const persisted = JSON.parse(env2._ctx.localStorage.getItem(env2.STORAGE_KEY)||'{}');
  const pa2 = persisted.players.A.find(function(p){return p.id==='a2';});
  assert(pa2 && pa2.yomi==='かくうじろう', 'C7-5 editPlayerYomi の更新が localStorage に保存される（updateField 経由）');
  // 編集後の行にルビが出る
  const row2 = serialize(env2.makePlayerRow(a2,'A',1));
  assert(row2.indexOf('<rt>かくうじろう</rt>')>=0, 'C7-6 編集後は参加者一覧にルビが表示される');
}

// ============================================================
// U1. editPlayerYomi の細目（カタカナ正規化 / 空でルビ解除 / cancel・無変更は no-op）
// ============================================================
{
  // カタカナ入力 → normalizeYomi でひらがな化して保存
  const env = loadEnv({promptValue:'ヤマダ'});
  env._setState(env.normalizeState(fxState()));
  env.editPlayerYomi('a2','A');
  assert(env._getState().players.A.find(function(p){return p.id==='a2';}).yomi==='やまだ', 'U1-1 カタカナ入力は normalizeYomi でひらがな化して保存');

  // 空入力 → ルビ解除（yomi:''）
  const env2 = loadEnv({promptValue:''});
  env2._setState(env2.normalizeState(fxState()));
  env2.editPlayerYomi('a1','A'); // a1 は元々 yomi あり
  assert(env2._getState().players.A.find(function(p){return p.id==='a1';}).yomi==='', 'U1-2 空入力でルビ解除（yomi:""）できる');

  // cancel(null) → 変更しない
  const env3 = loadEnv({promptValue:null});
  env3._setState(env3.normalizeState(fxState()));
  env3.editPlayerYomi('a1','A');
  assert(env3._getState().players.A.find(function(p){return p.id==='a1';}).yomi==='かくうたろう', 'U1-3 prompt cancel(null) は yomi を変更しない');

  // 存在しない id → no-op（例外を投げない）
  const env4 = loadEnv({promptValue:'てすと'});
  env4._setState(env4.normalizeState(fxState()));
  let threw=false; try{ env4.editPlayerYomi('zzz','A'); }catch(e){ threw=true; }
  assert(!threw, 'U1-4 未知 id でも例外を投げない（no-op）');
}

// ============================================================
// U2. クラス別開始の主導線化（buildClassActionBarHtml）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  const barA = env.buildClassActionBarHtml('A'); // 未開始・偶数
  assert(barA.indexOf('id="startBtnClass_A"')>=0 && barA.indexOf('全員で1局目を開始')>=0, 'U2-1 未開始クラスに開始ボタン(startBtnClass_A)が出る（id・文言維持）');
  // 主導線化：開始ボタンは full-size（btn-sm を付けない）
  const startBtnTag = barA.slice(barA.indexOf('id="startBtnClass_A"')-60, barA.indexOf('id="startBtnClass_A"')+10);
  assert(/class="btn-primary"/.test(barA.slice(0, barA.indexOf('id="startBtnClass_A"'))) , 'U2-2 開始ボタンは full-size btn-primary（btn-sm を外して主導線化）');
  assert(barA.indexOf('btn-primary btn-sm" id="startBtnClass_A"')<0, 'U2-3 開始ボタンに btn-sm が付いていない（主役化）');

  // 開始済みクラス：状態ラベル「開始済み」＋リセットボタン据え置き（「リセットだけが目立つ」を解消）
  const env2 = loadEnv();
  const s2 = env2.normalizeState(fxState());
  s2.classes[0].started=true;
  env2._setState(s2);
  const barStarted = env2.buildClassActionBarHtml('A');
  assert(barStarted.indexOf('開始済み')>=0, 'U2-4 開始済みクラスの action bar に「開始済み」状態ラベルが出る');
  assert(barStarted.indexOf('id="resetBtnClass_A"')>=0 && barStarted.indexOf('をリセット')>=0, 'U2-5 リセットボタン(id・文言)は据え置き（既存挙動不変）');
  assert(barStarted.indexOf('class="btn-danger btn-sm" id="resetBtnClass_A"')>=0, 'U2-6 リセットは btn-danger btn-sm のまま（破壊操作は控えめに据え置き）');
}

// ============================================================
// C8. 保存→reload 後もルビとクラス別状態が維持される
// ============================================================
{
  // env1 で yomi 付与 + A を開始（started・pairings 生成）→ save
  const env1 = loadEnv({promptValue:'かくうじろう'});
  env1._setState(env1.normalizeState(fxState()));
  env1.editPlayerYomi('a2','A');     // a2 に yomi 付与（save 済み）
  env1.startTournamentForClass('A'); // A 開始（started=true・pairings 生成・save 済み）
  const savedJson = env1._ctx.localStorage.getItem(env1.STORAGE_KEY);
  assert(!!savedJson, 'C8-0 前提：保存 JSON が存在する');

  // 別 env に savedJson を流し込んで load()（reload 相当）
  const env2 = loadEnv();
  env2._ctx.localStorage.setItem(env2.STORAGE_KEY, savedJson);
  env2.load();
  const st = env2._getState();
  const a1 = st.players.A.find(function(p){return p.id==='a1';});
  const a2 = st.players.A.find(function(p){return p.id==='a2';});
  assert(a1.yomi==='かくうたろう', 'C8-1 reload 後も既存の yomi(a1) が維持される');
  assert(a2.yomi==='かくうじろう', 'C8-2 reload 後も編集した yomi(a2) が維持される');
  assert(env2.isClassStarted('A')===true, 'C8-3 reload 後も A の開始状態(started=true)が維持される');
  assert(env2.isClassStarted('B')===false, 'C8-4 reload 後も B は未開始のまま（クラス別状態の独立維持）');
  assert(st.pairings.A.length>0, 'C8-5 reload 後も A の pairings が維持される');
  assert(st.pairings.B.length===0, 'C8-6 reload 後も B の pairings は空のまま');
  // reload 後の参加者一覧でもルビが出る（描画の再現性）
  const row = serialize(env2.makePlayerRow(a2,'A',1));
  assert(row.indexOf('<rt>かくうじろう</rt>')>=0, 'C8-7 reload 後の参加者一覧でも編集した yomi のルビが表示される');
}

console.log('');
console.log('  START-FRP-UX-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
