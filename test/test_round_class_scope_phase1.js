#!/usr/bin/env node
// ROUND-CLASS-SCOPE-IMPL-LIGHT-PHASE1
// docs/specs/20260516_shogi_round_class_scope_001.md §4 / §5 / §8 / §11
//
// Phase 1 の最小実装に対する単体テスト。
//
// 観点:
//   構造検査:
//     S1. state リテラルに classes:[{id:'A',...},{id:'B',...}] が含まれる
//     S2. startTournamentForClass / resetClassForClass / isClassStarted /
//         setClassStarted / classStartedInPersisted helper が定義されている
//     S3. normalizeState が state.classes の正規化を行う（旧データ互換）
//     S4. UI: #startBtnA / #startBtnB が DOM に存在し、bind されている
//     S5. startTournament が state.classes を同期する（setClassStarted 呼出）
//     S6. resetTournamentProgressOnly が state.classes を同期する
//     S7. resetAll が state.classes:[{id:'A',started:false},{id:'B',started:false}] を初期化する
//     S8. 既存 state.started 参照箇所が破綻していない（grep ベース）
//   振る舞いテスト（loadEnv 経由）:
//     B1. startTournamentForClass('A') で A の pairings が生成され、B は破壊されない
//     B2. A 結果入力後に startTournamentForClass('B') しても A の results / pairings は保持される
//     B3. startTournamentForClass('B') 後、A の pairings / results / classes[A].started は維持
//     B4. resetClassForClass('A') で A のみがリセットされ、B は維持
//     B5. setClassStarted(A,true) → state.started === true / setClassStarted(A,false) + B false → state.started === false
//     B6. normalizeState 旧データ (state.classes 未定義 + state.started:true) → 両クラス started:true
//     B7. normalizeState 旧データ (state.started:false) → 両クラス started:false
//     B8. normalizeState 旧データ (一部 classes 既存) → 不足クラスを補完
//     B9. classStartedInPersisted: 新 schema を優先、旧 schema は state.started を fallback

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_round_class_scope_phase1.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }
function assertEq(a, b, msg){
  if(JSON.stringify(a)===JSON.stringify(b)) ok(msg);
  else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));
}

// ============================================================
// SECTION S: 構造検査
// ============================================================

// S1. state リテラルに classes が含まれる
{
  assert(/classes:\s*\[\s*\{\s*id:\s*'A'\s*,\s*name:\s*'A?クラス'\s*,\s*started:\s*false\s*\}\s*,\s*\{\s*id:\s*'B'/.test(htmlSrc),
    'S1 state リテラルに classes:[{id:A,...},{id:B,...}] が含まれる');
}

// S2. 新 helper / 新関数の存在
{
  assert(/function\s+startTournamentForClass\s*\(\s*classId\s*\)/.test(htmlSrc),
    'S2-1 startTournamentForClass(classId) が定義されている');
  assert(/function\s+resetClassForClass\s*\(\s*classId\s*\)/.test(htmlSrc),
    'S2-2 resetClassForClass(classId) が定義されている');
  assert(/function\s+isClassStarted\s*\(\s*classId\s*\)/.test(htmlSrc),
    'S2-3 isClassStarted(classId) が定義されている');
  assert(/function\s+setClassStarted\s*\(\s*classId\s*,\s*value\s*\)/.test(htmlSrc),
    'S2-4 setClassStarted(classId, value) が定義されている');
  assert(/function\s+classStartedInPersisted\s*\(\s*persisted\s*,\s*classId\s*\)/.test(htmlSrc),
    'S2-5 classStartedInPersisted(persisted, classId) が定義されている');
}

// S3. normalizeState が state.classes を正規化する
{
  const nsMatch = htmlSrc.match(/function normalizeState\([\s\S]*?\n\}\n/);
  assert(nsMatch !== null, 'S3 normalizeState 関数本体を抽出できる');
  const nsBody = nsMatch ? nsMatch[0] : '';
  assert(nsBody.indexOf('classes') >= 0, 'S3-1 normalizeState 内で classes を参照する');
  assert(/Array\.isArray\(s\.classes\)/.test(nsBody),
    'S3-2 normalizeState 内で s.classes の Array 判定を行う');
  assert(nsBody.indexOf("'Aクラス'") >= 0 && nsBody.indexOf("'Bクラス'") >= 0,
    'S3-3 normalizeState 内で Aクラス/Bクラスのデフォルト名を持つ');
}

// S4. UI ボタン #startBtnA / #startBtnB の存在 + bind
{
  assert(/id="startBtnA"/.test(htmlSrc), 'S4-1 #startBtnA が DOM に存在する');
  assert(/id="startBtnB"/.test(htmlSrc), 'S4-2 #startBtnB が DOM に存在する');
  assert(/id="startBtnA"[\s\S]{0,100}Aクラスを開始/.test(htmlSrc),
    'S4-3 #startBtnA の文言が「Aクラスを開始」');
  assert(/id="startBtnB"[\s\S]{0,100}Bクラスを開始/.test(htmlSrc),
    'S4-4 #startBtnB の文言が「Bクラスを開始」');
  const bindMatch = htmlSrc.match(/function bindRegistrationEvents\([\s\S]*?\n\}\n/);
  assert(bindMatch !== null, 'S4-5 bindRegistrationEvents を抽出できる');
  const bindBody = bindMatch ? bindMatch[0] : '';
  assert(bindBody.indexOf("startTournamentForClass('A')") >= 0,
    "S4-6 bindRegistrationEvents 内で startTournamentForClass('A') を bind");
  assert(bindBody.indexOf("startTournamentForClass('B')") >= 0,
    "S4-7 bindRegistrationEvents 内で startTournamentForClass('B') を bind");
}

// S5. startTournament が state.classes を同期する
{
  const stMatch = htmlSrc.match(/function startTournament\([\s\S]*?\n\}\n/);
  assert(stMatch !== null, 'S5 startTournament 関数本体を抽出できる');
  const stBody = stMatch ? stMatch[0] : '';
  assert(/setClassStarted\s*\(\s*cls\s*,\s*true\s*\)/.test(stBody),
    'S5-1 startTournament 内で setClassStarted(cls,true) を呼ぶ');
  // 既存 guard は維持
  assert(/if\s*\(\s*state\.started\s*===\s*true\s*\)/.test(stBody),
    'S5-2 startTournament の state.started===true guard が維持');
  // 既存挙動: state.pairings={A:[],B:[]} 代入も維持（互換）
  assert(/state\.pairings\s*=\s*\{\s*A\s*:\s*\[\s*\]\s*,\s*B\s*:\s*\[\s*\]\s*\}/.test(stBody),
    'S5-3 startTournament の既存 state.pairings={A:[],B:[]} 初期化が維持');
}

// S6. resetTournamentProgressOnly が state.classes を同期する
{
  const rtpMatch = htmlSrc.match(/function resetTournamentProgressOnly\([\s\S]*?\n\}\n/);
  assert(rtpMatch !== null, 'S6 resetTournamentProgressOnly 関数本体を抽出できる');
  const rtpBody = rtpMatch ? rtpMatch[0] : '';
  assert(rtpBody.indexOf('state.classes') >= 0,
    'S6-1 resetTournamentProgressOnly 内で state.classes を参照する');
  assert(/state\.classes\[ci\]\.started\s*=\s*false/.test(rtpBody) || /\.started\s*=\s*false/.test(rtpBody),
    'S6-2 resetTournamentProgressOnly 内で classes[*].started=false を代入');
}

// S7. resetAll が state.classes:[A,B] を初期化する
{
  const raMatch = htmlSrc.match(/function resetAll\([\s\S]*?\n\}\n/);
  assert(raMatch !== null, 'S7 resetAll 関数本体を抽出できる');
  const raBody = raMatch ? raMatch[0] : '';
  assert(/classes\s*:\s*\[\s*\{\s*id\s*:\s*'A'/.test(raBody),
    'S7-1 resetAll 内で classes:[{id:A,...}] 初期化');
  assert(/classes\s*:\s*\[[\s\S]*\{\s*id\s*:\s*'B'/.test(raBody),
    'S7-2 resetAll 内で classes に id:B も含まれる');
}

// S8. 既存 state.started 参照箇所の数（regression: 一部の場所で state.started を消していないこと）
{
  const startedRefs = (htmlSrc.match(/state\.started\b/g) || []).length;
  assert(startedRefs >= 5,
    'S8 既存 state.started 参照箇所が依然残る（互換維持）。実測 = ' + startedRefs);
}

// ============================================================
// SECTION B: 振る舞いテスト（loadEnv 経由）
// ============================================================

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
    _: {},
    getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;},
    setItem(k,v){this._[k]=String(v);},
    removeItem(k){delete this._[k];}
  };
}

function makeContext(){
  const elements = {};
  function makeElem(id){
    return {
      id: id||'',
      _innerHTML: '',
      hidden: false,
      style: { _cssText:'', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      set innerHTML(v){this._innerHTML=String(v==null?'':v);},
      get innerHTML(){return this._innerHTML;},
      value: '',
      checked: false,
      classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
      appendChild(){}, removeChild(){}, remove(){},
      addEventListener(){}, removeEventListener(){},
      focus(){}, blur(){}, click(){}
    };
  }
  const docMock = {
    _elements: elements,
    getElementById(id){
      if(!elements[id]) elements[id] = makeElem(id);
      return elements[id];
    },
    getElementsByName(){return [];},
    createElement(){return makeElem();},
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){}, removeEventListener(){},
    querySelectorAll(){return [];}
  };
  return {
    document: docMock,
    window: { innerWidth: 1024 },
    localStorage: makeLocalStorage(),
    crypto: {
      randomUUID(){
        const chars='abcdef0123456789';
        let s='';
        for(let i=0;i<32;i++)s+=chars[Math.floor(Math.random()*chars.length)];
        return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20,32);
      }
    }
  };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const alertCalls = [];
  const warnCalls = [];
  const msgCalls = [];
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       startTournamentForClass:startTournamentForClass,
       resetClassForClass:resetClassForClass,
       isClassStarted:isClassStarted,
       setClassStarted:setClassStarted,
       classStartedInPersisted:classStartedInPersisted,
       normalizeState:normalizeState,
       generatePairing:generatePairing,
       save:save,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
    function(m){alertCalls.push(String(m));},
    function(){return true;},
    function(){return '';},
    function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}},
    { log(){}, error(){}, warn(){} },
    Promise
  );
  api._ctx = ctx;
  api._alertCalls = alertCalls;
  api._warnCalls = warnCalls;
  // showMsg は document に依存するので最低限のスタブを既存スクリプトに任せる
  return api;
}

// ヘルパー: 参加者付きの初期 state を作る
function makeStateWithPlayers(){
  return {
    players: {
      A: [
        {id:'a1', name:'A一郎', cls:'A', member:'member', grade:'ippan', entry_no:1},
        {id:'a2', name:'A二郎', cls:'A', member:'member', grade:'ippan', entry_no:2},
        {id:'a3', name:'A三郎', cls:'A', member:'member', grade:'ippan', entry_no:3},
        {id:'a4', name:'A四郎', cls:'A', member:'member', grade:'ippan', entry_no:4}
      ],
      B: [
        {id:'b1', name:'B一郎', cls:'B', member:'member', grade:'ippan', entry_no:1},
        {id:'b2', name:'B二郎', cls:'B', member:'member', grade:'ippan', entry_no:2}
      ]
    },
    rounds: 4,
    pairings: {A:[], B:[]},
    results: {A:[], B:[]},
    started: false,
    classes: [
      {id:'A', name:'Aクラス', started:false},
      {id:'B', name:'Bクラス', started:false}
    ],
    report: {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}
  };
}

// B1. startTournamentForClass('A') で A の pairings が生成され、B は破壊されない
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers());
  env.startTournamentForClass('A');
  const s = env._getState();
  assert(s.classes[0].started === true, 'B1-1 A クラスの started が true');
  assert(s.classes[1].started === false, 'B1-2 B クラスの started は false のまま');
  assert(s.pairings.A.length === 2, 'B1-3 A の pairings が 2 試合生成された');
  assert(s.pairings.B.length === 0, 'B1-4 B の pairings は空のまま');
  assert(s.results.A.length === 0, 'B1-5 A の results は初期化された');
  assert(s.results.B.length === 0, 'B1-6 B の results は空のまま');
  assert(s.started === true, 'B1-7 旧 state.started は all-class OR で true');
  assert(s.players.A.length === 4, 'B1-8 A の players は破壊されない');
  assert(s.players.B.length === 2, 'B1-9 B の players は破壊されない');
}

// B2. A 結果入力後に startTournamentForClass('B') しても A の results / pairings は保持される
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers());
  env.startTournamentForClass('A');
  // A の Round 1 結果を確定（mock: pairings を results に push）
  let s = env._getState();
  const aRound1 = JSON.parse(JSON.stringify(s.pairings.A));
  aRound1[0].winner = aRound1[0].p1;
  aRound1[1].winner = aRound1[1].p1;
  s.results.A.push(aRound1);
  const aRound1Snap = JSON.stringify(s.results.A);
  const aPairingsSnap = JSON.stringify(s.pairings.A);
  // B クラスを後追い開始
  env.startTournamentForClass('B');
  s = env._getState();
  assert(JSON.stringify(s.results.A) === aRound1Snap,
    'B2-1 B 後追い開始でも A の results は破壊されない');
  assert(JSON.stringify(s.pairings.A) === aPairingsSnap,
    'B2-2 B 後追い開始でも A の pairings は破壊されない');
  assert(s.classes[0].started === true, 'B2-3 A の started は true 維持');
  assert(s.classes[1].started === true, 'B2-4 B の started は true に');
  assert(s.pairings.B.length === 1, 'B2-5 B の pairings が 1 試合生成');
}

// B3. startTournamentForClass('B') 単独で A は無傷
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers());
  env.startTournamentForClass('B');
  const s = env._getState();
  assert(s.classes[0].started === false, 'B3-1 A の started は false 維持');
  assert(s.classes[1].started === true, 'B3-2 B の started が true');
  assert(s.pairings.A.length === 0, 'B3-3 A の pairings は空のまま');
  assert(s.pairings.B.length === 1, 'B3-4 B の pairings が 1 試合生成');
  assert(s.results.A.length === 0, 'B3-5 A の results は空のまま');
}

// B4. resetClassForClass('A') で A のみがリセットされ、B は維持
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers());
  env.startTournamentForClass('A');
  env.startTournamentForClass('B');
  // B 状態を snapshot
  let s = env._getState();
  const bPairingsSnap = JSON.stringify(s.pairings.B);
  const bResultsSnap = JSON.stringify(s.results.B);
  const bStartedSnap = s.classes[1].started;
  // A クラスのみリセット
  env.resetClassForClass('A');
  s = env._getState();
  assert(s.pairings.A.length === 0, 'B4-1 A の pairings がリセットされた');
  assert(s.results.A.length === 0, 'B4-2 A の results がリセットされた');
  assert(s.classes[0].started === false, 'B4-3 A の started が false に');
  assert(JSON.stringify(s.pairings.B) === bPairingsSnap, 'B4-4 B の pairings は維持');
  assert(JSON.stringify(s.results.B) === bResultsSnap, 'B4-5 B の results は維持');
  assert(s.classes[1].started === bStartedSnap, 'B4-6 B の started は維持');
  assert(s.started === true, 'B4-7 旧 state.started は B が開始済なので true');
}

// B5. setClassStarted の state.started 同期
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers());
  let s = env._getState();
  assert(s.started === false, 'B5-1 初期は state.started=false');
  env.setClassStarted('A', true);
  s = env._getState();
  assert(s.started === true, 'B5-2 A started=true 後に state.started=true');
  env.setClassStarted('A', false);
  s = env._getState();
  assert(s.started === false, 'B5-3 A started=false かつ B started=false で state.started=false');
  env.setClassStarted('B', true);
  s = env._getState();
  assert(s.started === true, 'B5-4 B started=true 後に state.started=true');
}

// B6. normalizeState: 旧データ (classes 未定義 + started:true) → 両クラス started:true
{
  const env = loadEnv(targetPath);
  const legacy = {
    players: {A:[], B:[]},
    rounds: 4,
    pairings: {A:[], B:[]},
    results: {A:[], B:[]},
    started: true
  };
  const normalized = env.normalizeState(legacy);
  assert(Array.isArray(normalized.classes), 'B6-1 normalized.classes が Array');
  assert(normalized.classes.length === 2, 'B6-2 normalized.classes が 2 件');
  assert(normalized.classes[0].id === 'A' && normalized.classes[0].started === true,
    'B6-3 classes[0]={id:A, started:true} （保守案 a）');
  assert(normalized.classes[1].id === 'B' && normalized.classes[1].started === true,
    'B6-4 classes[1]={id:B, started:true}');
  assert(normalized.started === true, 'B6-5 normalized.started === true');
}

// B7. normalizeState: 旧データ (started:false) → 両クラス started:false
{
  const env = loadEnv(targetPath);
  const legacy = {players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false};
  const normalized = env.normalizeState(legacy);
  assert(normalized.classes[0].started === false, 'B7-1 classes[A].started=false');
  assert(normalized.classes[1].started === false, 'B7-2 classes[B].started=false');
}

// B8. normalizeState: 一部 classes 既存 → 不足クラスを補完
{
  const env = loadEnv(targetPath);
  const partial = {
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]},
    started:false,
    classes:[{id:'A', name:'カスタムA', started:true}]  // B 不在
  };
  const normalized = env.normalizeState(partial);
  assert(normalized.classes.length === 2, 'B8-1 不足クラスを補完して 2 件');
  const findId = function(id){
    for(let i=0;i<normalized.classes.length;i++){
      if(normalized.classes[i].id===id) return normalized.classes[i];
    }
    return null;
  };
  const ca = findId('A');
  const cb = findId('B');
  assert(ca && ca.started === true && ca.name === 'カスタムA',
    'B8-2 既存 A クラスの started / name が保持される');
  assert(cb && cb.started === false && cb.name === 'Bクラス',
    'B8-3 不足 B クラスがデフォルト値で補完される');
}

// B9. classStartedInPersisted: 新 schema 優先 / 旧 schema は started fallback
{
  const env = loadEnv(targetPath);
  // 新 schema
  const persistedNew = {
    classes:[{id:'A',started:true},{id:'B',started:false}],
    started:true
  };
  assert(env.classStartedInPersisted(persistedNew, 'A') === true,
    'B9-1 新 schema: A started=true');
  assert(env.classStartedInPersisted(persistedNew, 'B') === false,
    'B9-2 新 schema: B started=false');
  // 旧 schema (classes 未定義) → fallback to persisted.started
  const persistedOld = { started: true };
  assert(env.classStartedInPersisted(persistedOld, 'A') === true,
    'B9-3 旧 schema (classes 未定義): A は started fallback で true');
  assert(env.classStartedInPersisted({started:false}, 'A') === false,
    'B9-4 旧 schema: started=false なら false');
  // null persisted
  assert(env.classStartedInPersisted(null, 'A') === false,
    'B9-5 persisted=null は false');
}

// B10. 旧データ互換: localStorage に旧形式 (classes 未定義) の JSON を入れて load() しても落ちない
{
  const env = loadEnv(targetPath);
  const legacyJson = JSON.stringify({
    players: {A:[{id:'a1',name:'旧A1',cls:'A',member:'member',grade:'ippan',entry_no:1}],B:[]},
    rounds: 4,
    pairings: {A:[],B:[]},
    results: {A:[],B:[]},
    started: false
    // classes 未定義
  });
  env._ctx.localStorage.setItem('shogi_v4', legacyJson);
  // normalizeState 経由で load した state を再構築
  const normalized = env.normalizeState(JSON.parse(legacyJson));
  assert(Array.isArray(normalized.classes) && normalized.classes.length === 2,
    'B10 旧 localStorage データ load 時に classes が補完される');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  ROUND-CLASS-SCOPE-IMPL-LIGHT-PHASE1 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
