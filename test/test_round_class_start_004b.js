#!/usr/bin/env node
// ROUND-CLASS-START-004b: class UI bind + reset literal cleanup の単体テスト
// docs/specs/20260517_round_class_start_state_spec.md §11.3 / §12.1 / §12.2 / §12.3
//
// 観点:
//   resetClassForClass (spec §12.1):
//     R1. 対象 classId のみ pairings / results / started がリセット、他クラスは保持
//     R2. confirm cancel → state 不変
//     R3. unknown classId → error / state 不変
//     R4. setClassStarted 経由で state.started 同期
//     R5. save / showMsg / DOM クリア（pane-{classId} / result-{classId}）
//   resetTournamentProgressOnly (spec §12.2):
//     P1. classes-driven init: state.pairings[c.id]=[] / state.results[c.id]=[]
//     P2. A/B 固定 literal が helper body から消えている
//     P3. syncGlobalStartedFromClasses() で state.started 同期
//     P4. 3-class 構成（A/B/C）でも全クラスが false にリセットされる
//   resetAll (spec §12.3):
//     A1. emptyClassDict 経由の classes-driven 初期化
//     A2. 既定 classes = [{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'}]
//     A3. A/B 固定 literal が body から消えている
//   UI bind (spec §11.3):
//     U1. buildClassActionBarHtml: started=false かつ参加者偶数→「<className>を開始」
//     U2. buildClassActionBarHtml: started=true→「<className>をリセット」
//     U3. buildClassActionBarHtml: 参加者 0 / 奇数 / 1 名→ボタン無し（誤操作防止）
//     U4. renderTournament が action bar を描画し、bindClassActionBarEvents で
//         startTournamentForClass / resetClassForClass を click handler に登録
//   startTournament cleanup (Codex Should Fix S2):
//     S1. startTournament 本体から var total= / if(total<2) inline 検査が消えている
//     S2. hasOngoing が state.classes 駆動になっている（A/B literal 解消）
//     S3. void total; が消えている
//   3-class 回帰防止:
//     T1. state.classes に C を含めた状態で resetTournamentProgressOnly が C も初期化する
//     T2. startTournament が C を含む classes で動作する

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_round_class_start_004b.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeLocalStorage(){
  return {
    _:{}, _failOnSet:false,
    getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;},
    setItem(k,v){if(this._failOnSet)throw new Error('forced'); this._[k]=String(v);},
    removeItem(k){delete this._[k];}
  };
}

function makeContext(){
  const elements = {};
  function makeElem(id){
    const handlers = {};
    const elem = {
      id:id||'',
      _innerHTML:'',
      _innerHTMLHistory:[],
      _handlers:handlers,
      hidden:false,
      style:{_cssText:'', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:''},
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=String(v==null?'':v); this._innerHTMLHistory.push(this._innerHTML);},
      value:'', checked:false,
      classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
      appendChild(){}, removeChild(){}, remove(){},
      addEventListener(evt, fn){
        if(!handlers[evt])handlers[evt]=[];
        handlers[evt].push(fn);
      },
      removeEventListener(){},
      dispatchEvent(evt){
        // ROUND-CLASS-START-004b: snapshot handlers before iteration to avoid
        //   infinite loop when a handler re-attaches itself to the same element
        //   (mock の getElementById auto-create + bindClassActionBarEvents の再 bind 対策)。
        var fns = (handlers[evt.type||'click']||[]).slice();
        for(var i=0;i<fns.length;i++)fns[i].call(elem, evt);
        return true;
      },
      click(){
        var fns = (handlers['click']||[]).slice();
        for(var i=0;i<fns.length;i++)fns[i].call(elem,{type:'click'});
      },
      focus(){}, blur(){}
    };
    return elem;
  }
  const doc = {
    _elements:elements,
    getElementById(id){if(!elements[id])elements[id]=makeElem(id);return elements[id];},
    getElementsByName(){return [];},
    createElement(){return makeElem();},
    body:{appendChild(){}, removeChild(){}},
    addEventListener(){}, removeEventListener(){},
    querySelectorAll(){return [];}
  };
  return {
    document:doc,
    window:{innerWidth:1024},
    localStorage:makeLocalStorage(),
    crypto:{randomUUID(){return 'uuid-mock';}}
  };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const alertCalls = [];
  const warnCalls = [];
  const confirmDecisions = [];  // FIFO queue; default true
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       resetClassForClass: resetClassForClass,
       resetTournamentProgressOnly: resetTournamentProgressOnly,
       resetAll: resetAll,
       startTournament: startTournament,
       startTournamentForClass: startTournamentForClass,
       buildClassActionBarHtml: buildClassActionBarHtml,
       bindClassActionBarEvents: bindClassActionBarEvents,
       renderTournament: renderTournament,
       setClassStarted: setClassStarted,
       isClassStarted: isClassStarted,
       emptyClassDict: emptyClassDict,
       _setState: function(s){state=s;},
       _getState: function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
    function(m){alertCalls.push(String(m));},
    function(){return confirmDecisions.length?confirmDecisions.shift():true;},
    function(){return '';},
    function(){}, function(){}, {createObjectURL:()=>'', revokeObjectURL:()=>{}},
    {log(){}, error(){}, warn(){
      var parts=Array.prototype.slice.call(arguments).map(function(a){
        if(typeof a==='string')return a;
        try{return JSON.stringify(a);}catch(e){return String(a);}
      });
      warnCalls.push(parts.join(' '));
    }},
    Promise
  );
  api._ctx = ctx;
  api._alertCalls = alertCalls;
  api._warnCalls = warnCalls;
  api._setConfirm = function(arr){confirmDecisions.length=0;for(var i=0;i<arr.length;i++)confirmDecisions.push(arr[i]);};
  return api;
}

function makePlayer(id,name,cls,entryNo){
  var p={id:id,name:name,cls:cls,member:'member',grade:'ippan'};
  if(typeof entryNo==='number')p.entry_no=entryNo;
  return p;
}

// 2-class fixture
function make2ClassState(opts){
  opts=opts||{};
  return {
    players:{
      A:Array.isArray(opts.playersA)?opts.playersA:[],
      B:Array.isArray(opts.playersB)?opts.playersB:[]
    },
    rounds:4,
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    started:!!opts.started,
    classes:[
      {id:'A',name:'Aクラス',started:!!opts.aStarted},
      {id:'B',name:'Bクラス',started:!!opts.bStarted}
    ],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  };
}

// 3-class fixture (A/B/C) for regression testing
function make3ClassState(opts){
  opts=opts||{};
  return {
    players:{
      A:Array.isArray(opts.playersA)?opts.playersA:[],
      B:Array.isArray(opts.playersB)?opts.playersB:[],
      C:Array.isArray(opts.playersC)?opts.playersC:[]
    },
    rounds:4,
    pairings:{A:[],B:[],C:[]},
    results:{A:[],B:[],C:[]},
    started:!!opts.started,
    classes:[
      {id:'A',name:'Aクラス',started:!!opts.aStarted},
      {id:'B',name:'Bクラス',started:!!opts.bStarted},
      {id:'C',name:'Cクラス',started:!!opts.cStarted}
    ],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  };
}

let pass=0, fail=0;
function ok(msg){pass++; console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg); else ng(msg);}
function assertEq(a,b,msg){
  if(JSON.stringify(a)===JSON.stringify(b))ok(msg);
  else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));
}

// ============================================================
// SECTION R: resetClassForClass (spec §12.1)
// ============================================================

// R1: 対象 classId のみリセット、他クラス保持
{
  const env = loadEnv(targetPath);
  const s = make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)],
    aStarted:true, bStarted:true, started:true
  });
  s.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}];
  s.results.A=[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];
  s.pairings.B=[{p1:'b1',p2:'b2',winner:null,lastModifiedBy:'auto'}];
  s.results.B=[];
  env._setState(s);

  const bPairingsSnap = JSON.stringify(s.pairings.B);

  env.resetClassForClass('A');
  const after = env._getState();
  assertEq(after.pairings.A.length, 0, 'R1-1 A.pairings がリセット');
  assertEq(after.results.A.length, 0, 'R1-2 A.results がリセット');
  assertEq(after.classes[0].started, false, 'R1-3 A.started=false');
  // B 維持
  assertEq(JSON.stringify(after.pairings.B), bPairingsSnap, 'R1-4 B.pairings 不変');
  assertEq(after.classes[1].started, true, 'R1-5 B.started=true 維持');
  assertEq(after.started, true, 'R1-6 state.started=true（B が開始済）');
  // DOM クリア: resetClassForClass は innerHTML='' で 1 度クリアした後、renderTournament で
  //   action bar 等を再描画するため、最終的に pane-A に「未開始」表示が入る（旧 pairing card は消滅）。
  //   旧の pairing card / 勝敗結果 表示が消えていることを「pairing-card クラス文字列が無い」で確認する。
  var paneAHistory = env._ctx.document._elements['pane-A']._innerHTMLHistory||[];
  // 履歴のどこかで innerHTML='' が走ったことを確認
  var sawEmptyClear = false;
  for(var hi=0;hi<paneAHistory.length;hi++){ if(paneAHistory[hi]==='')sawEmptyClear=true; }
  assert(sawEmptyClear, 'R1-7 pane-A が innerHTML="" で 1 度クリアされた履歴を持つ');
  // 最終状態には旧 pairing-card が残らない（再描画後の action bar / 未開始 表示のみ）
  assert(env._ctx.document._elements['pane-A']._innerHTML.indexOf('pairing-card') === -1,
    'R1-8 pane-A 最終状態に旧 pairing-card が残らない');
}

// R2: confirm cancel → state 完全不変
{
  const env = loadEnv(targetPath);
  env._setConfirm([false]);
  const s = make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    aStarted:true, started:true
  });
  s.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}];
  env._setState(s);
  const snap = JSON.stringify(env._getState());
  env.resetClassForClass('A');
  assertEq(JSON.stringify(env._getState()), snap, 'R2 confirm cancel → state 完全不変');
}

// R3: unknown classId → error / state 不変
{
  const env = loadEnv(targetPath);
  const s = make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    aStarted:true, started:true
  });
  s.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}];
  env._setState(s);
  const snap = JSON.stringify(env._getState());
  env.resetClassForClass('Z');
  assertEq(JSON.stringify(env._getState()), snap, 'R3-1 unknown classId → state 不変');
}

// R4: setClassStarted 経由で state.started 同期
{
  const env = loadEnv(targetPath);
  const s = make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    aStarted:true, started:true  // A だけ開始
  });
  env._setState(s);
  env.resetClassForClass('A');
  const after = env._getState();
  assertEq(after.classes[0].started, false, 'R4-1 A.started=false');
  assertEq(after.started, false, 'R4-2 state.started=false（all-class OR で同期）');
}

// R5: 3-class 構成での resetClassForClass（C 単独リセット）
{
  const env = loadEnv(targetPath);
  const s = make3ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)],
    playersC:[makePlayer('c1','c','C',1),makePlayer('c2','d','C',2)],
    aStarted:true, bStarted:true, cStarted:true, started:true
  });
  s.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}];
  s.pairings.B=[{p1:'b1',p2:'b2',winner:null,lastModifiedBy:'auto'}];
  s.pairings.C=[{p1:'c1',p2:'c2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.resetClassForClass('C');
  const after = env._getState();
  assertEq(after.classes[0].started, true, 'R5-1 A.started=true 維持（3-class）');
  assertEq(after.classes[1].started, true, 'R5-2 B.started=true 維持');
  assertEq(after.classes[2].started, false, 'R5-3 C.started=false（C のみリセット）');
  assertEq(after.pairings.C.length, 0, 'R5-4 C.pairings リセット');
  assertEq(after.pairings.A.length, 1, 'R5-5 A.pairings 維持');
  assertEq(after.pairings.B.length, 1, 'R5-6 B.pairings 維持');
}

// ============================================================
// SECTION P: resetTournamentProgressOnly (spec §12.2)
// ============================================================

// P1: classes-driven init で全クラスリセット
{
  const env = loadEnv(targetPath);
  const s = make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)],
    aStarted:true, bStarted:true, started:true
  });
  s.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}];
  s.pairings.B=[{p1:'b1',p2:'b2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.resetTournamentProgressOnly();
  const after = env._getState();
  assertEq(after.pairings.A.length, 0, 'P1-1 A.pairings リセット');
  assertEq(after.pairings.B.length, 0, 'P1-2 B.pairings リセット');
  assertEq(after.classes[0].started, false, 'P1-3 A.started=false');
  assertEq(after.classes[1].started, false, 'P1-4 B.started=false');
  assertEq(after.started, false, 'P1-5 state.started=false（syncGlobalStartedFromClasses 経由）');
}

// P2: A/B 固定 literal が helper body に存在しない（structural）
{
  const stMatch = htmlSrc.match(/function resetTournamentProgressOnly\([\s\S]*?\n\}\n/);
  assert(stMatch !== null, 'P2-0 resetTournamentProgressOnly 関数本体を抽出できる');
  const body = stMatch ? stMatch[0] : '';
  assert(/state\.pairings\s*=\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(body) === false,
    'P2-1 helper body に state.pairings={A:[],B:[]} 固定 literal が無い');
  assert(/state\.results\s*=\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(body) === false,
    'P2-2 helper body に state.results={A:[],B:[]} 固定 literal が無い');
  assert(/state\.pairings\[\s*c\.id\s*\]\s*=\s*\[\s*\]/.test(body),
    'P2-3 helper body に state.pairings[c.id]=[] への代入が存在');
  assert(/state\.results\[\s*c\.id\s*\]\s*=\s*\[\s*\]/.test(body),
    'P2-4 helper body に state.results[c.id]=[] への代入が存在');
  // DOM クリアも classId ベース
  assert(body.indexOf("'pane-'+c.id") >= 0,
    "P2-5 DOM クリアが 'pane-'+c.id classId ベース");
  assert(body.indexOf("'result-'+c.id") >= 0,
    "P2-6 DOM クリアが 'result-'+c.id classId ベース");
}

// P3: 3-class 回帰テスト
{
  const env = loadEnv(targetPath);
  const s = make3ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersC:[makePlayer('c1','c','C',1),makePlayer('c2','d','C',2)],
    aStarted:true, cStarted:true, started:true
  });
  s.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}];
  s.pairings.C=[{p1:'c1',p2:'c2',winner:'c1',lastModifiedBy:'auto'}];
  s.results.C=[[{p1:'c1',p2:'c2',winner:'c1',lastModifiedBy:'auto'}]];
  env._setState(s);
  env.resetTournamentProgressOnly();
  const after = env._getState();
  assertEq(after.pairings.A.length, 0, 'P3-1 A.pairings リセット');
  assertEq(after.pairings.C.length, 0, 'P3-2 C.pairings リセット（3-class でも）');
  assertEq(after.results.C.length, 0, 'P3-3 C.results リセット');
  assertEq(after.classes[2].started, false, 'P3-4 C.started=false');
  assertEq(after.started, false, 'P3-5 state.started=false（全クラス false で同期）');
}

// ============================================================
// SECTION A: resetAll (spec §12.3)
// ============================================================

// A1: classes-driven init
{
  const env = loadEnv(targetPath);
  const s = make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    aStarted:true, started:true
  });
  s.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.resetAll();
  const after = env._getState();
  assertEq(after.players.A.length, 0, 'A1-1 players.A 空');
  assertEq(after.players.B.length, 0, 'A1-2 players.B 空');
  assertEq(after.classes.length, 2, 'A1-3 classes は A/B 2 件');
  assertEq(after.classes[0].id, 'A', 'A1-4 classes[0].id=A');
  assertEq(after.classes[1].id, 'B', 'A1-5 classes[1].id=B');
  assertEq(after.classes[0].started, false, 'A1-6 A.started=false');
  assertEq(after.classes[1].started, false, 'A1-7 B.started=false');
  assertEq(after.started, false, 'A1-8 state.started=false');
  assertEq(after.rounds, 4, 'A1-9 rounds=4');
}

// A2: A/B 固定 literal が body に存在しない（S2 解消）
{
  const stMatch = htmlSrc.match(/function resetAll\([\s\S]*?\n\}\n/);
  const body = stMatch ? stMatch[0] : '';
  assert(/players\s*:\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(body) === false,
    'A2-1 body に players:{A:[],B:[]} 固定 literal が無い');
  assert(/pairings\s*:\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(body) === false,
    'A2-2 body に pairings:{A:[],B:[]} 固定 literal が無い');
  assert(/results\s*:\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(body) === false,
    'A2-3 body に results:{A:[],B:[]} 固定 literal が無い');
  assert(/players\s*:\s*emptyClassDict\(/.test(body),
    'A2-4 body に players: emptyClassDict(...) が存在');
}

// ============================================================
// SECTION U: UI bind (spec §11.3) — buildClassActionBarHtml
// ============================================================

// U1: started=false / 参加者偶数 → 「Aクラスを開始」ボタン
{
  const env = loadEnv(targetPath);
  env._setState(make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)]
  }));
  const html = env.buildClassActionBarHtml('A');
  assert(html.indexOf('startBtnClass_A') >= 0, 'U1-1 startBtnClass_A id を含む');
  assert(html.indexOf('Aクラスを開始') >= 0, 'U1-2 「Aクラスを開始」文言を含む');
  assert(html.indexOf('resetBtnClass_A') === -1, 'U1-3 reset ボタンは含まない');
}

// U2: started=true → 「Aクラスをリセット」ボタン
{
  const env = loadEnv(targetPath);
  env._setState(make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    aStarted:true, started:true
  }));
  const html = env.buildClassActionBarHtml('A');
  assert(html.indexOf('resetBtnClass_A') >= 0, 'U2-1 resetBtnClass_A id を含む');
  assert(html.indexOf('Aクラスをリセット') >= 0, 'U2-2 「Aクラスをリセット」文言を含む');
  assert(html.indexOf('startBtnClass_A') === -1, 'U2-3 start ボタンは含まない');
}

// U3: 参加者 0 → ボタン無し
{
  const env = loadEnv(targetPath);
  env._setState(make2ClassState({playersA:[]}));
  const html = env.buildClassActionBarHtml('A');
  assert(html.indexOf('startBtnClass_A') === -1, 'U3-1 participants 0 → start なし');
  assert(html.indexOf('resetBtnClass_A') === -1, 'U3-2 participants 0 → reset なし');
}

// U3b: 奇数 → start なし（誤操作防止）
{
  const env = loadEnv(targetPath);
  env._setState(make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2),makePlayer('a3','c','A',3)]
  }));
  const html = env.buildClassActionBarHtml('A');
  assert(html.indexOf('startBtnClass_A') === -1, 'U3-3 奇数 → start なし（誤操作防止）');
}

// U4: renderTournament が action bar を描画し、bind 経由で startTournamentForClass を呼ぶ
{
  const env = loadEnv(targetPath);
  env._setState(make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)]
  }));
  env.renderTournament('A');
  const paneA = env._ctx.document._elements['pane-A'];
  assert(paneA && paneA._innerHTML.indexOf('startBtnClass_A') >= 0,
    'U4-1 renderTournament が pane-A に startBtnClass_A を描画');
  // Click handler 経由で startTournamentForClass('A') が呼ばれる
  const startBtnElem = env._ctx.document._elements['startBtnClass_A'];
  assert(startBtnElem && startBtnElem._handlers && startBtnElem._handlers['click'] && startBtnElem._handlers['click'].length>=1,
    'U4-2 startBtnClass_A に click handler が bind されている');
  startBtnElem.click();
  const after = env._getState();
  assertEq(after.classes[0].started, true, 'U4-3 click → A.started=true（startTournamentForClass 経由）');
  assertEq(after.pairings.A.length, 1, 'U4-4 click → A.pairings 生成');
}

// U4b: started 状態で reset bind が動作する
{
  const env = loadEnv(targetPath);
  env._setState(make2ClassState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    aStarted:true, started:true
  }));
  let s = env._getState();
  s.pairings.A=[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}];
  s.results.A=[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];
  try{ env.renderTournament('A'); }catch(e){ ng('U4b-render error: '+e.message); }
  const resetBtnElem = env._ctx.document._elements['resetBtnClass_A'];
  assert(resetBtnElem && resetBtnElem._handlers && resetBtnElem._handlers['click'],
    'U4b-1 resetBtnClass_A に click handler が bind されている');
  try{ resetBtnElem.click(); }catch(e){ ng('U4b-click error: '+e.message); }
  s = env._getState();
  assertEq(s.classes[0].started, false, 'U4b-2 click → A.started=false（resetClassForClass 経由）');
  assertEq(s.pairings.A.length, 0, 'U4b-3 click → A.pairings リセット');
}

// ============================================================
// SECTION S: startTournament cleanup (Codex Should Fix S2)
// ============================================================
{
  const stMatch = htmlSrc.match(/function startTournament\(\)[\s\S]*?\n\}\n/);
  const body = stMatch ? stMatch[0] : '';
  assert(body.indexOf('var total=state.players.A.length') === -1,
    'S2-1 startTournament 本体に var total=state.players.A.length 直書きが無い（S2 解消）');
  assert(body.indexOf('if(total<2)') === -1,
    'S2-2 startTournament 本体に if(total<2) inline 検査が無い（collectStartCandidates へ集約）');
  assert(body.indexOf('void total') === -1,
    'S2-3 startTournament 本体に void total; が残っていない');
  // hasOngoing は state.classes 駆動
  assert(/state\.pairings\.A\.length\s*>\s*0\s*\|\|\s*state\.pairings\.B\.length\s*>\s*0/.test(body) === false,
    'S2-4 hasOngoing 計算に state.pairings.A.length / state.pairings.B.length 固定 literal が無い');
  assert(/state\.classes\[hi\]|state\.classes\[\s*\w+\s*\]\.id/.test(body),
    'S2-5 hasOngoing が state.classes 駆動になっている');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  ROUND-CLASS-START-004b 004b テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
