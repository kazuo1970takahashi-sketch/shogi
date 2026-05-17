#!/usr/bin/env node
// ROUND-CLASS-START-004: 対局開始 atomic wrapper / class atomic 実装の単体テスト
// docs/specs/20260517_round_class_start_state_spec.md §6 / §7.6 / §13
//
// 観点：
//   pure validator:
//     V1. validateStartableClass: skip-empty / skip-already-started / too-few / odd / ok の優先順位
//     V2. validateStartableClass: 他クラス state を参照しない（引数のみで動作）
//   bulk collector:
//     C1. total<2 → total-too-few 最優先
//     C2. 1 件でも error → 全件 reject (errors のみ、candidates 空)
//     C3. 全クラス skip → no-candidate（skip 内訳で文言分岐）
//     C4. 全件 ok → candidates 配列、skip も並走
//   single collector:
//     S1. ok / skip-* / too-few / odd / unknown-class
//     S2. 他クラス state を見ない（class atomic、引きずられない）
//   mutate / verify writer:
//     W1. applyStartForCandidates: validate 済 candidates のみ mutate
//     W2. applyStartForCandidates: 全 candidate 妥当性チェックで部分 mutation 防止
//     W3. verifyStartSavedForCandidates: classId 単位の callsiteId
//   bulk atomic wrapper:
//     B1. A 開始可能 / B 奇数 → 全件 reject、state 不変
//     B2. A 開始可能 / B 開始可能 → 両クラス started、state.started=true
//     B3. A 0人 / B 開始可能 → B のみ started
//     B4. 全クラス 0人 → no-candidate、state 不変
//   class atomic wrapper:
//     CA1. A 開始可能 / B 奇数 → startTournamentForClass('A') 成功（B に引きずられない）
//     CA2. A 奇数 / B 開始可能 → startTournamentForClass('A') 失敗、state 不変
//     CA3. unknown classId → error / state 不変
//     CA4. 既開始 classId → 二重開始しない / state 不変

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_round_class_start_004.js <html>');
  process.exit(1);
}

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
    _:{},
    _failOnSet:false,
    getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;},
    setItem(k,v){if(this._failOnSet)throw new Error('forced setItem failure'); this._[k]=String(v);},
    removeItem(k){delete this._[k];}
  };
}

function makeContext(){
  const elements = {};
  function makeElem(id){
    return {
      id:id||'',
      _innerHTML:'',
      _innerHTMLHistory:[],
      hidden:false,
      style:{_cssText:'', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:''},
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=String(v==null?'':v); this._innerHTMLHistory.push(this._innerHTML);},
      value:'', checked:false,
      classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
      appendChild(){}, removeChild(){}, remove(){},
      addEventListener(){}, removeEventListener(){},
      focus(){}, blur(){}, click(){}
    };
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
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       validateStartableClass: validateStartableClass,
       collectStartCandidates: collectStartCandidates,
       collectStartCandidateForClass: collectStartCandidateForClass,
       applyStartForCandidates: applyStartForCandidates,
       verifyStartSavedForCandidates: verifyStartSavedForCandidates,
       startTournament: startTournament,
       startTournamentForClass: startTournamentForClass,
       resolveNoCandidateMessage: resolveNoCandidateMessage,
       showStartValidationErrors: showStartValidationErrors,
       setClassStarted: setClassStarted,
       isClassStarted: isClassStarted,
       readPersistedState: readPersistedState,
       save: save,
       _setState: function(s){state=s;},
       _getState: function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
    function(m){alertCalls.push(String(m));},
    function(){return true;},
    function(){return '';},
    function(){}, function(){}, {createObjectURL:()=>'', revokeObjectURL:()=>{}},
    {log(){}, error(){}, warn(){
      const parts = Array.prototype.slice.call(arguments).map(function(a){
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
  return api;
}

function makePlayer(id,name,cls,entryNo){
  var p={id:id,name:name,cls:cls,member:'member',grade:'ippan'};
  if(typeof entryNo==='number')p.entry_no=entryNo;
  return p;
}

function makeState(opts){
  opts = opts || {};
  return {
    players:{
      A:Array.isArray(opts.playersA)?opts.playersA:[],
      B:Array.isArray(opts.playersB)?opts.playersB:[]
    },
    rounds:4,
    pairings:{A:[], B:[]},
    results:{A:[], B:[]},
    started:!!opts.started,
    classes:[
      {id:'A', name:'Aクラス', started:!!opts.aStarted},
      {id:'B', name:'Bクラス', started:!!opts.bStarted}
    ],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  };
}

let pass = 0, fail = 0;
function ok(msg){pass++; console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg); else ng(msg);}
function assertEq(a,b,msg){
  if(JSON.stringify(a)===JSON.stringify(b))ok(msg);
  else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));
}

// ============================================================
// SECTION V: validateStartableClass (pure)
// ============================================================

// V1: 優先順位 too-few > odd / skip 系
{
  const env = loadEnv(targetPath);
  const v = env.validateStartableClass;
  assertEq(v({id:'A',name:'Aクラス',started:false},[]).kind, 'skip-empty', 'V1-1 cnt=0 → skip-empty');
  assertEq(v({id:'A',name:'Aクラス',started:true},[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)]).kind, 'skip-already-started', 'V1-2 started=true → skip-already-started（cnt>0 でも）');
  assertEq(v({id:'A',name:'Aクラス',started:false},[makePlayer('a1','a','A',1)]).kind, 'too-few', 'V1-3 cnt=1 → too-few');
  assertEq(v({id:'A',name:'Aクラス',started:false},[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2),makePlayer('a3','c','A',3)]).kind, 'odd', 'V1-4 cnt=3 → odd');
  assertEq(v({id:'A',name:'Aクラス',started:false},[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)]).kind, 'ok', 'V1-5 cnt=2 偶数 → ok');
  // too-few message に className を含む
  const tooFewRes = v({id:'A',name:'Aクラス',started:false},[makePlayer('a1','a','A',1)]);
  assert(tooFewRes.message && tooFewRes.message.indexOf('Aクラス')>=0, 'V1-6 too-few message に className 含む');
  // odd message に className を含む
  const oddRes = v({id:'B',name:'Bクラス',started:false},[makePlayer('b1','a','B',1),makePlayer('b2','b','B',2),makePlayer('b3','c','B',3)]);
  assert(oddRes.message && oddRes.message.indexOf('Bクラス')>=0, 'V1-7 odd message に className 含む');
}

// V2: pure（他クラス state 非参照）
{
  const env = loadEnv(targetPath);
  // state を汚しても validateStartableClass の結果は引数のみで決まる
  env._setState(makeState({playersA:[makePlayer('a1','a','A',1)], playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]}));
  const r = env.validateStartableClass({id:'A',name:'Aクラス',started:false},[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)]);
  assertEq(r.kind, 'ok', 'V2-1 引数の players が偶数 → ok（state.players は無関係）');
}

// ============================================================
// SECTION C: collectStartCandidates (bulk pure)
// ============================================================

// C1: total<2 → total-too-few 最優先
{
  const env = loadEnv(targetPath);
  const classes = [{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}];
  const r = env.collectStartCandidates(classes, {A:[], B:[makePlayer('b1','b','B',1)]});
  assertEq(r.ok, false, 'C1-1 total=1 → ok:false');
  assertEq(r.candidates.length, 0, 'C1-2 candidates 空');
  assertEq(r.errors.length, 1, 'C1-3 errors 1 件');
  assertEq(r.errors[0].kind, 'total-too-few', 'C1-4 kind=total-too-few');
  assert(r.errors[0].message && r.errors[0].message.indexOf('参加者が少なすぎます')>=0, 'C1-5 message に「参加者が少なすぎます」');
}

// C2: 1 件でも error → 全件 reject
{
  const env = loadEnv(targetPath);
  const classes = [{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}];
  const players = {
    A:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    B:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2),makePlayer('b3','d','B',3)]
  };
  const r = env.collectStartCandidates(classes, players);
  assertEq(r.ok, false, 'C2-1 A:OK / B:odd → ok:false（bulk all-or-nothing）');
  assertEq(r.candidates.length, 0, 'C2-2 candidates 空（A も候補に含まれない）');
  assertEq(r.errors.length, 1, 'C2-3 errors 1 件（B odd）');
  assertEq(r.errors[0].kind, 'odd', 'C2-4 B の odd error');
  assertEq(r.errors[0].classId, 'B', 'C2-5 classId=B');
}

// C3: 全クラス skip → no-candidate
{
  const env = loadEnv(targetPath);
  const classes = [{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}];
  // total>=2 だが全クラス skip-already-started
  const players = {
    A:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    B:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]
  };
  const r = env.collectStartCandidates(classes, players);
  assertEq(r.ok, false, 'C3-1 全 skip → ok:false');
  assertEq(r.errors.length, 1, 'C3-2 errors=1（no-candidate）');
  assertEq(r.errors[0].kind, 'no-candidate', 'C3-3 kind=no-candidate');
  assert(r.errors[0].message && r.errors[0].message.indexOf('未開始のクラスはありません')>=0, 'C3-4 全既開始 → 「未開始のクラスはありません」');
  assertEq(r.skipped.length, 2, 'C3-5 skipped 2 件');
}

// C4: 全件 ok → candidates と skip 並走
{
  const env = loadEnv(targetPath);
  const classes = [{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}];
  const players = {
    A:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    B:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]
  };
  const r = env.collectStartCandidates(classes, players);
  assertEq(r.ok, true, 'C4-1 両クラス偶数 → ok:true');
  assertEq(r.candidates, ['A','B'], 'C4-2 candidates=[A,B]');
  assertEq(r.errors.length, 0, 'C4-3 errors なし');
}

// ============================================================
// SECTION S: collectStartCandidateForClass (single pure)
// ============================================================

// S1: 各 kind の挙動
{
  const env = loadEnv(targetPath);
  const classes = [{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}];
  const players = {
    A:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    B:[]
  };
  // ok
  const r1 = env.collectStartCandidateForClass('A', classes, players);
  assertEq(r1.ok, true, 'S1-1 A 偶数 → ok:true');
  assertEq(r1.candidateClassId, 'A', 'S1-2 candidateClassId=A');
  // skip-empty
  const r2 = env.collectStartCandidateForClass('B', classes, players);
  assertEq(r2.ok, false, 'S1-3 B 0 名 → ok:false');
  assertEq(r2.error.kind, 'skip-empty', 'S1-4 kind=skip-empty');
  // unknown-class
  const r3 = env.collectStartCandidateForClass('Z', classes, players);
  assertEq(r3.ok, false, 'S1-5 未知 classId → ok:false');
  assertEq(r3.error.kind, 'unknown-class', 'S1-6 kind=unknown-class');
  // skip-already-started
  const startedClasses = [{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}];
  const r4 = env.collectStartCandidateForClass('A', startedClasses, players);
  assertEq(r4.ok, false, 'S1-7 既開始 → ok:false');
  assertEq(r4.error.kind, 'skip-already-started', 'S1-8 kind=skip-already-started');
  // odd
  const oddPlayers = {A:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2),makePlayer('a3','c','A',3)], B:[]};
  const r5 = env.collectStartCandidateForClass('A', classes, oddPlayers);
  assertEq(r5.ok, false, 'S1-9 A 奇数 → ok:false');
  assertEq(r5.error.kind, 'odd', 'S1-10 kind=odd');
  // too-few
  const oneAPlayer = {A:[makePlayer('a1','a','A',1)], B:[]};
  const r6 = env.collectStartCandidateForClass('A', classes, oneAPlayer);
  assertEq(r6.ok, false, 'S1-11 A 1 名 → ok:false');
  assertEq(r6.error.kind, 'too-few', 'S1-12 kind=too-few');
}

// S2: 他クラスの状態に引きずられない（class atomic 核）
{
  const env = loadEnv(targetPath);
  // A:OK, B:奇数 / B 未開始
  const classes = [{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}];
  const players = {
    A:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    B:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2),makePlayer('b3','d','B',3)]
  };
  const r = env.collectStartCandidateForClass('A', classes, players);
  assertEq(r.ok, true, 'S2-1 B が odd でも A 単独 ok（class atomic）');
  assertEq(r.candidateClassId, 'A', 'S2-2 A が candidate');
  // total<2 クラス横断 error は適用されない（B のみ 1 名でも）
  const oneAB = {A:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)], B:[makePlayer('b1','b','B',1)]};
  const r2 = env.collectStartCandidateForClass('A', classes, oneAB);
  assertEq(r2.ok, true, 'S2-3 B が 1 名（クラス横断 total-too-few 該当しない）でも A 単独 ok');
}

// ============================================================
// SECTION B: startTournament (bulk atomic wrapper)
// ============================================================

// B1: A 開始可能 / B 奇数 → 全件 reject、state 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2),makePlayer('b3','d','B',3)]
  }));
  env.startTournament();
  const s = env._getState();
  assertEq(s.started, false, 'B1-1 state.started 変化なし');
  assertEq(s.classes[0].started, false, 'B1-2 A.started=false');
  assertEq(s.classes[1].started, false, 'B1-3 B.started=false');
  assertEq(s.pairings.A.length, 0, 'B1-4 A.pairings 空（部分開始なし）');
  assertEq(s.pairings.B.length, 0, 'B1-5 B.pairings 空');
  assertEq(s.results.A.length, 0, 'B1-6 A.results 空');
  assertEq(s.results.B.length, 0, 'B1-7 B.results 空');
}

// B2: A 開始可能 / B 開始可能 → 両クラス started
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]
  }));
  env.startTournament();
  const s = env._getState();
  assertEq(s.started, true, 'B2-1 state.started=true');
  assertEq(s.classes[0].started, true, 'B2-2 A.started=true');
  assertEq(s.classes[1].started, true, 'B2-3 B.started=true');
  assertEq(s.pairings.A.length, 1, 'B2-4 A.pairings 生成（2 名 = 1 試合）');
  assertEq(s.pairings.B.length, 1, 'B2-5 B.pairings 生成');
}

// B3: A 0 人 / B 開始可能 → B のみ started
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]
  }));
  env.startTournament();
  const s = env._getState();
  assertEq(s.classes[0].started, false, 'B3-1 A.started=false（skip-empty）');
  assertEq(s.classes[1].started, true, 'B3-2 B.started=true');
  assertEq(s.started, true, 'B3-3 state.started=true（B が開始済）');
  assertEq(s.pairings.A.length, 0, 'B3-4 A.pairings は空のまま');
  assertEq(s.pairings.B.length, 1, 'B3-5 B.pairings 生成');
}

// B4: 全クラス 0 人 → no-candidate、state 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeState({playersA:[], playersB:[]}));
  env.startTournament();
  const s = env._getState();
  assertEq(s.started, false, 'B4-1 state.started 変化なし');
  assertEq(s.classes[0].started, false, 'B4-2 A.started=false');
  assertEq(s.classes[1].started, false, 'B4-3 B.started=false');
  // total<2 のため total-too-few error が出る（showMsg('err')）
  assertEq(env._alertCalls.length, 0, 'B4-4 alert は呼ばれない（showMsg 経由）');
}

// ============================================================
// SECTION CA: startTournamentForClass (class atomic wrapper)
// ============================================================

// CA1: A 開始可能 / B 奇数 → A 単独開始成功（B に引きずられない）
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2),makePlayer('b3','d','B',3)]
  }));
  env.startTournamentForClass('A');
  const s = env._getState();
  assertEq(s.classes[0].started, true, 'CA1-1 A.started=true');
  assertEq(s.classes[1].started, false, 'CA1-2 B.started=false（引きずられない）');
  assertEq(s.started, true, 'CA1-3 state.started=true（A が開始済）');
  assertEq(s.pairings.A.length, 1, 'CA1-4 A.pairings 生成');
  assertEq(s.pairings.B.length, 0, 'CA1-5 B.pairings 変化なし');
}

// CA2: A 奇数 → startTournamentForClass('A') 失敗、state 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2),makePlayer('a3','c','A',3)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]
  }));
  env.startTournamentForClass('A');
  const s = env._getState();
  assertEq(s.classes[0].started, false, 'CA2-1 A.started=false（odd 失敗）');
  assertEq(s.classes[1].started, false, 'CA2-2 B.started=false（A の失敗で B は影響なし）');
  assertEq(s.started, false, 'CA2-3 state.started=false');
  assertEq(s.pairings.A.length, 0, 'CA2-4 A.pairings 変化なし');
  assertEq(s.pairings.B.length, 0, 'CA2-5 B.pairings 変化なし');
}

// CA3: unknown classId → error / state 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[]
  }));
  env.startTournamentForClass('Z');
  const s = env._getState();
  assertEq(s.started, false, 'CA3-1 state.started 変化なし');
  assertEq(s.classes[0].started, false, 'CA3-2 A 変化なし');
  assertEq(s.classes[1].started, false, 'CA3-3 B 変化なし');
}

// CA4: 既開始 classId → 二重開始しない / state 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[],
    aStarted:true,
    started:true
  }));
  // 先に A を 1 round 進行させた状態をシミュレート
  let s = env._getState();
  s.pairings.A = [{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}];
  s.results.A = [[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];
  const pairingsSnap = JSON.stringify(s.pairings.A);
  const resultsSnap = JSON.stringify(s.results.A);

  env.startTournamentForClass('A');
  s = env._getState();
  assertEq(s.classes[0].started, true, 'CA4-1 A.started=true 維持（二重開始しない）');
  assertEq(JSON.stringify(s.pairings.A), pairingsSnap, 'CA4-2 A.pairings 変化なし');
  assertEq(JSON.stringify(s.results.A), resultsSnap, 'CA4-3 A.results 変化なし');
  assert(env._alertCalls.length >= 1, 'CA4-4 alert（すでに開始されています）が出る');
}

// CA5: 後追い開始シナリオ — A 進行中 + B 開始可能 → startTournamentForClass('B') で B 開始、A 無傷
{
  const env = loadEnv(targetPath);
  // A 開始済 + 結果入力済
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)],
    aStarted:true,
    started:true
  }));
  let s = env._getState();
  s.pairings.A = [{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}];
  s.results.A = [[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];
  const aPairingsSnap = JSON.stringify(s.pairings.A);
  const aResultsSnap = JSON.stringify(s.results.A);

  // B 後追い開始
  env.startTournamentForClass('B');
  s = env._getState();
  assertEq(s.classes[0].started, true, 'CA5-1 A.started 維持');
  assertEq(s.classes[1].started, true, 'CA5-2 B.started=true');
  assertEq(JSON.stringify(s.pairings.A), aPairingsSnap, 'CA5-3 A.pairings 破壊されない');
  assertEq(JSON.stringify(s.results.A), aResultsSnap, 'CA5-4 A.results 破壊されない');
  assertEq(s.pairings.B.length, 1, 'CA5-5 B.pairings 生成');
}

// ============================================================
// SECTION W: applyStartForCandidates (writer)
// ============================================================

// W1: validate 済 candidates のみ mutate
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]
  }));
  env.applyStartForCandidates(['A']);
  const s = env._getState();
  assertEq(s.classes[0].started, true, 'W1-1 A.started=true');
  assertEq(s.classes[1].started, false, 'W1-2 B.started=false（candidates に含まれない）');
  assertEq(s.pairings.A.length, 1, 'W1-3 A.pairings 生成');
  assertEq(s.pairings.B.length, 0, 'W1-4 B.pairings 変化なし');
}

// W2: unknown classId が candidates に混入 → 部分 mutation 防止
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)],
    playersB:[makePlayer('b1','b','B',1),makePlayer('b2','c','B',2)]
  }));
  env.applyStartForCandidates(['A','Z']);   // Z は不正
  const s = env._getState();
  assertEq(s.classes[0].started, false, 'W2-1 A.started=false（preflight チェックで A も mutate されない）');
  assertEq(s.pairings.A.length, 0, 'W2-2 A.pairings 変化なし');
}

// W3: empty candidates → no-op
{
  const env = loadEnv(targetPath);
  env._setState(makeState({
    playersA:[makePlayer('a1','a','A',1),makePlayer('a2','b','A',2)]
  }));
  env.applyStartForCandidates([]);
  const s = env._getState();
  assertEq(s.classes[0].started, false, 'W3-1 候補空 → state 不変');
}

// ============================================================
// SECTION R: resolveNoCandidateMessage
// ============================================================
{
  const env = loadEnv(targetPath);
  // 全 skip-empty
  assertEq(env.resolveNoCandidateMessage([{classId:'A',kind:'skip-empty'},{classId:'B',kind:'skip-empty'}]),
    '開始できるクラスがありません。参加者を登録してください。', 'R1 全 skip-empty');
  // 全 skip-already-started
  assertEq(env.resolveNoCandidateMessage([{classId:'A',kind:'skip-already-started'}]),
    '未開始のクラスはありません。', 'R2 全 skip-already-started');
  // 混在
  assertEq(env.resolveNoCandidateMessage([{classId:'A',kind:'skip-empty'},{classId:'B',kind:'skip-already-started'}]),
    '開始対象のクラスがありません。', 'R3 混在');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  ROUND-CLASS-START-004 atomic wrapper テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
