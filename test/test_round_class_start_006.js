#!/usr/bin/env node
// ROUND-CLASS-START-006: classes-driven registration counts
//
// 受付一覧 / 人数カウント / calcTotal / classId id-safety / state.classes-absent fallback の単体テスト。
//
// 観点:
//   構造検査 (S):
//     S1.  renderRegList が classes-driven（['A','B'] 固定 literal が body に無い）
//     S2.  calcTotal が classes-driven（state.players.A.concat(state.players.B) 固定が無い）
//     S3.  normalizeClasses 内に isSafeClassId() による classId id-safety が存在
//     S4.  ensureClassRegDomNodes / regClassCountId / regClassListId / regClassBulkEditId /
//          getRegistrationClassList helper が定義されている
//     S5.  reg-class-grid id が DOM に存在し、A/B section に data-class-id が付与されている
//   振る舞いテスト (B) - 3-class case:
//     B1.  state.classes=[A,B,C] で renderRegList が C section を動的補完する
//     B2.  C class の人数表示 (class-count-C) が更新される
//     B3.  C class の player list (class-list-C) が描画される
//     B4.  fee-summary が A+B+C 合計人数で表示される
//     B5.  calcTotal が A+B+C の参加費合計を返す
//     B6.  A/B 既存表示（a-count / b-count / a-list / b-list）が壊れていない
//   classId id-safety (I):
//     I1.  isSafeClassId('A') / 'B' / 'C' / 'class-1' / 'class_2' は true
//     I2.  isSafeClassId('') / 'A B' / 'A"B' / null / undefined は false
//     I3.  normalizeClasses で不正 classId は skip される
//     I4.  appendMissingClassesFromDicts で不正 classId は skip される
//   state.classes-absent fallback (F):
//     F1.  state.classes 未定義でも renderRegList が JS error を投げない
//     F2.  state.classes=[] でも renderRegList が JS error を投げない
//     F3.  getRegistrationClassList は state.classes 不在時に ['A','B'] 既定に戻る
//     F4.  calcTotal は state.classes 不在時に state.players own-key 走査で集計する
//   A/B 固定 literal regression (R):
//     R1.  renderRegList body に 'a-count':'b-count' 三項演算固定が無い
//     R2.  renderRegList body に state.players.A.length + state.players.B.length が無い
//     R3.  calcTotal body に state.players.A.concat(state.players.B) が無い

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_round_class_start_006.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass=0, fail=0;
function ok(msg){pass++; console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg); else ng(msg);}
function assertEq(a,b,msg){
  if(JSON.stringify(a)===JSON.stringify(b))ok(msg);
  else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));
}

// ============================================================
// SECTION S: 構造検査
// ============================================================

// S1. renderRegList body
{
  const m = htmlSrc.match(/function renderRegList\(\)[\s\S]*?\n\}\n/);
  assert(m !== null, 'S1-0 renderRegList 関数本体を抽出できる');
  const body = m ? m[0] : '';
  assert(body.indexOf("var clsList=['A','B']") === -1,
    'S1-1 renderRegList 本体に var clsList=[\'A\',\'B\'] 固定 literal が無い');
  assert(/getRegistrationClassList\s*\(\s*\)/.test(body),
    'S1-2 renderRegList が getRegistrationClassList() を呼ぶ');
  assert(/ensureClassRegDomNodes\s*\(\s*\)/.test(body),
    'S1-3 renderRegList が ensureClassRegDomNodes() を呼ぶ');
  assert(/regClassCountId\(/.test(body),
    'S1-4 renderRegList が regClassCountId() を使う');
  assert(/regClassListId\(/.test(body),
    'S1-5 renderRegList が regClassListId() を使う');
}

// S2. calcTotal body
{
  const m = htmlSrc.match(/function calcTotal\(\)[\s\S]*?\n\}\n/);
  assert(m !== null, 'S2-0 calcTotal 関数本体を抽出できる');
  const body = m ? m[0] : '';
  assert(body.indexOf('state.players.A.concat(state.players.B)') === -1,
    'S2-1 calcTotal 本体に state.players.A.concat(state.players.B) 固定 literal が無い');
  assert(/state\.classes/.test(body),
    'S2-2 calcTotal が state.classes を参照する');
  assert(/isSafeClassId/.test(body),
    'S2-3 calcTotal が isSafeClassId() で classId を検証する');
}

// S3. normalizeClasses 内の id-safety
{
  const m = htmlSrc.match(/function normalizeClasses\([\s\S]*?\n\}\n/);
  assert(m !== null, 'S3-0 normalizeClasses 関数本体を抽出できる');
  const body = m ? m[0] : '';
  assert(/isSafeClassId/.test(body),
    'S3-1 normalizeClasses が isSafeClassId() を呼ぶ（Codex S3）');
}

// S4. helper 関数の定義
{
  assert(/function\s+isSafeClassId\s*\(/.test(htmlSrc),
    'S4-1 isSafeClassId() が定義されている');
  assert(/function\s+ensureClassRegDomNodes\s*\(/.test(htmlSrc),
    'S4-2 ensureClassRegDomNodes() が定義されている');
  assert(/function\s+regClassCountId\s*\(/.test(htmlSrc),
    'S4-3 regClassCountId() が定義されている');
  assert(/function\s+regClassListId\s*\(/.test(htmlSrc),
    'S4-4 regClassListId() が定義されている');
  assert(/function\s+regClassBulkEditId\s*\(/.test(htmlSrc),
    'S4-5 regClassBulkEditId() が定義されている');
  assert(/function\s+getRegistrationClassList\s*\(/.test(htmlSrc),
    'S4-6 getRegistrationClassList() が定義されている');
}

// S5. HTML 構造
{
  assert(/id="reg-class-grid"/.test(htmlSrc),
    'S5-1 #reg-class-grid id が HTML に存在する');
  assert(/data-class-id="A"[\s\S]{0,500}id="a-count"/.test(htmlSrc),
    'S5-2 data-class-id="A" section に a-count が含まれる');
  assert(/data-class-id="B"[\s\S]{0,500}id="b-count"/.test(htmlSrc),
    'S5-3 data-class-id="B" section に b-count が含まれる');
}

// ============================================================
// SECTION B & I & F & R: 振る舞いテスト (loadEnv 経由)
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
    _:{},
    getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;},
    setItem(k,v){this._[k]=String(v);},
    removeItem(k){delete this._[k];}
  };
}

function makeContext(){
  const elements = {};
  const children = {};
  function makeElem(id,tagName){
    const handlers = {};
    const myChildren = [];
    const attrs = {};
    const elem = {
      id:id||'',
      _tagName:(tagName||'div').toUpperCase(),
      _innerHTML:'',
      _innerHTMLHistory:[],
      _handlers:handlers,
      _children:myChildren,
      _attrs:attrs,
      _parent:null,
      hidden:false,
      style:{_cssText:'', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'', marginBottom:'', marginTop:'', color:''},
      textContent:'',
      className:'',
      value:'',
      checked:false,
      type:'',
      classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=String(v==null?'':v); this._innerHTMLHistory.push(this._innerHTML);},
      appendChild(child){
        if(!child)return child;
        myChildren.push(child);
        child._parent=elem;
        // 子要素の id を root elements に登録（getElementById 経由でアクセス可能にする）
        function registerSubtree(e){
          if(e&&e.id)elements[e.id]=e;
          if(e&&Array.isArray(e._children))e._children.forEach(registerSubtree);
        }
        registerSubtree(child);
        return child;
      },
      removeChild(child){
        var idx=myChildren.indexOf(child);
        if(idx>=0)myChildren.splice(idx,1);
        return child;
      },
      remove(){
        if(elem._parent)elem._parent.removeChild(elem);
      },
      addEventListener(evt,fn){
        if(!handlers[evt])handlers[evt]=[];
        handlers[evt].push(fn);
      },
      removeEventListener(){},
      click(){
        var fns=(handlers['click']||[]).slice();
        for(var i=0;i<fns.length;i++)fns[i].call(elem,{type:'click'});
      },
      setAttribute(k,v){attrs[k]=String(v);},
      getAttribute(k){return Object.prototype.hasOwnProperty.call(attrs,k)?attrs[k]:null;},
      focus(){}, blur(){}
    };
    return elem;
  }
  const doc = {
    _elements:elements,
    getElementById(id){
      if(elements[id])return elements[id];
      // 自動生成（registerSubtree でない経路用 fallback）
      return null;
    },
    _ensureElem(id,tagName){
      if(!elements[id])elements[id]=makeElem(id,tagName);
      return elements[id];
    },
    getElementsByName(){return [];},
    createElement(tagName){return makeElem('',tagName);},
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
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       renderRegList: renderRegList,
       calcTotal: calcTotal,
       normalizeClasses: normalizeClasses,
       isSafeClassId: isSafeClassId,
       ensureClassRegDomNodes: ensureClassRegDomNodes,
       regClassCountId: regClassCountId,
       regClassListId: regClassListId,
       regClassBulkEditId: regClassBulkEditId,
       getRegistrationClassList: getRegistrationClassList,
       appendMissingClassesFromDicts: appendMissingClassesFromDicts,
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
    {log(){}, error(){}, warn(){}},
    Promise
  );
  api._ctx = ctx;
  api._alertCalls = alertCalls;
  return api;
}

function makePlayer(id,name,cls,opts){
  opts=opts||{};
  return {
    id:id, name:name, cls:cls,
    member:opts.member||'member',
    grade:opts.grade||'ippan',
    entry_no:opts.entry_no||1
  };
}

// 受付一覧用の DOM 雛形を ctx.document に注入する（簡略）
function seedRegDom(ctx){
  // body コンテナ
  var grid = ctx.document._ensureElem('reg-class-grid','div');
  // A/B 静的 section を雛形として用意
  ['A','B'].forEach(function(cls){
    var section = ctx.document.createElement('div');
    section.setAttribute('data-class-id',cls);
    var cntEl = ctx.document.createElement('span');
    cntEl.id = (cls==='A')?'a-count':'b-count';
    section.appendChild(cntEl);
    var listEl = ctx.document.createElement('div');
    listEl.id = (cls==='A')?'a-list':'b-list';
    section.appendChild(listEl);
    var btn = ctx.document.createElement('button');
    btn.id = (cls==='A')?'bulkEditA':'bulkEditB';
    section.appendChild(btn);
    grid.appendChild(section);
  });
  // fee-summary
  ctx.document._ensureElem('fee-summary','div');
}

// ============================================================
// SECTION B: 3-class case
// ============================================================

// B1, B2, B3: state.classes=[A,B,C] で renderRegList が C section を補完
{
  const env = loadEnv(targetPath);
  seedRegDom(env._ctx);
  env._setState({
    players:{
      A:[makePlayer('a1','田中','A',{entry_no:1})],
      B:[makePlayer('b1','佐藤','B',{entry_no:1})],
      C:[
        makePlayer('c1','鈴木','C',{entry_no:1}),
        makePlayer('c2','高橋','C',{entry_no:2})
      ]
    },
    rounds:4,
    pairings:{A:[],B:[],C:[]},
    results:{A:[],B:[],C:[]},
    started:false,
    classes:[
      {id:'A',name:'Aクラス',started:false},
      {id:'B',name:'Bクラス',started:false},
      {id:'C',name:'Cクラス',started:false}
    ],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  env.renderRegList();
  // C section は ensureClassRegDomNodes で補完されているはず
  const classCountC = env._ctx.document._elements['class-count-C'];
  const classListC = env._ctx.document._elements['class-list-C'];
  assert(!!classCountC, 'B1-1 class-count-C 要素が補完された');
  assert(!!classListC, 'B1-2 class-list-C 要素が補完された');
  assertEq(classCountC.textContent, '(2名)', 'B2 C class の人数表示 (2名)');
  assertEq(classListC._children.length, 2, 'B3 C class の player row が 2 件描画される');
}

// B4: fee-summary が A+B+C 合計人数
{
  const env = loadEnv(targetPath);
  seedRegDom(env._ctx);
  env._setState({
    players:{
      A:[makePlayer('a1','田中','A')],
      B:[makePlayer('b1','佐藤','B'),makePlayer('b2','x','B')],
      C:[makePlayer('c1','鈴木','C'),makePlayer('c2','高橋','C'),makePlayer('c3','y','C')]
    },
    rounds:4, pairings:{A:[],B:[],C:[]}, results:{A:[],B:[],C:[]},
    started:false,
    classes:[
      {id:'A',name:'Aクラス',started:false},
      {id:'B',name:'Bクラス',started:false},
      {id:'C',name:'Cクラス',started:false}
    ],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  env.renderRegList();
  const fee = env._ctx.document._elements['fee-summary'];
  assert(fee && fee._innerHTML.indexOf('参加者計 <strong>6名</strong>') >= 0,
    'B4 fee-summary が A+B+C 合計 6 名で表示される');
}

// B5: calcTotal が A+B+C 合計
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{
      A:[makePlayer('a1','田中','A',{member:'member',grade:'ippan'})],     // 500
      B:[makePlayer('b1','佐藤','B',{member:'other',grade:'ippan'})],      // 1000
      C:[makePlayer('c1','鈴木','C',{member:'member',grade:'chu'})]        // 0
    },
    rounds:4, pairings:{A:[],B:[],C:[]}, results:{A:[],B:[],C:[]},
    started:false,
    classes:[
      {id:'A',name:'Aクラス',started:false},
      {id:'B',name:'Bクラス',started:false},
      {id:'C',name:'Cクラス',started:false}
    ],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  assertEq(env.calcTotal(), 1500, 'B5 calcTotal が A+B+C 合計 = 1500 円');
}

// B6: A/B 既存表示が壊れていない
{
  const env = loadEnv(targetPath);
  seedRegDom(env._ctx);
  env._setState({
    players:{
      A:[makePlayer('a1','田中','A'),makePlayer('a2','x','A')],
      B:[makePlayer('b1','佐藤','B')]
    },
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]},
    started:false,
    classes:[
      {id:'A',name:'Aクラス',started:false},
      {id:'B',name:'Bクラス',started:false}
    ],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  env.renderRegList();
  assertEq(env._ctx.document._elements['a-count'].textContent, '(2名)', 'B6-1 a-count 既存表示');
  assertEq(env._ctx.document._elements['b-count'].textContent, '(1名)', 'B6-2 b-count 既存表示');
  assertEq(env._ctx.document._elements['a-list']._children.length, 2, 'B6-3 a-list 既存描画');
  assertEq(env._ctx.document._elements['b-list']._children.length, 1, 'B6-4 b-list 既存描画');
}

// ============================================================
// SECTION I: classId id-safety
// ============================================================

// I1: 安全な classId
{
  const env = loadEnv(targetPath);
  ['A','B','C','class-1','class_2','D','c123','XYZ_abc-001'].forEach(function(cid){
    assert(env.isSafeClassId(cid) === true, 'I1 isSafeClassId('+JSON.stringify(cid)+')=true');
  });
}

// I2: 不正な classId
{
  const env = loadEnv(targetPath);
  ['','A B','A"B',"A'B",'A.B','A/B','クラス','A B C',null,undefined,42,{}].forEach(function(cid){
    assert(env.isSafeClassId(cid) === false, 'I2 isSafeClassId('+JSON.stringify(cid)+')=false');
  });
}

// I3: normalizeClasses で不正 classId は skip
{
  const env = loadEnv(targetPath);
  const raw = {
    classes:[
      {id:'A',name:'Aクラス',started:false},
      {id:'B',name:'Bクラス',started:false},
      {id:'A B',name:'broken'},     // skip
      {id:'A"X',name:'broken2'},     // skip
      {id:'C',name:'Cクラス',started:true}
    ],
    started:false
  };
  const out = env.normalizeClasses(raw);
  const ids = out.map(function(c){return c.id;});
  assert(ids.indexOf('A B') === -1, 'I3-1 不正 classId "A B" が skip された');
  assert(ids.indexOf('A"X') === -1, 'I3-2 不正 classId \'A"X\' が skip された');
  assert(ids.indexOf('A') >= 0, 'I3-3 A は残る');
  assert(ids.indexOf('B') >= 0, 'I3-4 B は残る');
  assert(ids.indexOf('C') >= 0, 'I3-5 C は残る');
}

// I4: appendMissingClassesFromDicts で不正 classId は skip
{
  const env = loadEnv(targetPath);
  const classes = [{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}];
  const raw = {
    players:{ 'A':[], 'B':[], 'C':[], 'A B':[], 'A"X':[] },
    pairings:{}, results:{}
  };
  env.appendMissingClassesFromDicts(classes, raw);
  const ids = classes.map(function(c){return c.id;});
  assert(ids.indexOf('C') >= 0, 'I4-1 安全な C は補完される');
  assert(ids.indexOf('A B') === -1, 'I4-2 不正 "A B" は dict key 由来でも補完されない');
  assert(ids.indexOf('A"X') === -1, 'I4-3 不正 \'A"X\' は dict key 由来でも補完されない');
}

// ============================================================
// SECTION F: state.classes-absent fallback
// ============================================================

// F1: state.classes 未定義でも renderRegList が JS error を投げない
{
  const env = loadEnv(targetPath);
  seedRegDom(env._ctx);
  env._setState({
    players:{A:[],B:[]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]},
    started:false,
    // classes 未定義
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  let threw = false;
  try{ env.renderRegList(); }catch(e){ threw = true; }
  assert(threw === false, 'F1 state.classes 未定義でも renderRegList が JS error を投げない');
}

// F2: state.classes=[] でも renderRegList が JS error を投げない
{
  const env = loadEnv(targetPath);
  seedRegDom(env._ctx);
  env._setState({
    players:{A:[],B:[]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]},
    started:false,
    classes:[],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  let threw = false;
  try{ env.renderRegList(); }catch(e){ threw = true; }
  assert(threw === false, 'F2 state.classes=[] でも renderRegList が JS error を投げない');
}

// F3: getRegistrationClassList の fallback
{
  const env = loadEnv(targetPath);
  // state.classes 不在
  env._setState({players:{A:[],B:[]}});
  let out = env.getRegistrationClassList();
  assertEq(out.map(function(c){return c.id;}), ['A','B'],
    'F3-1 state.classes 不在 → fallback ["A","B"]');
  // state.classes=[]
  env._setState({players:{A:[],B:[]}, classes:[]});
  out = env.getRegistrationClassList();
  assertEq(out.map(function(c){return c.id;}), ['A','B'],
    'F3-2 state.classes=[] → fallback ["A","B"]');
  // state.classes=[ 不正な classId のみ ]
  env._setState({players:{A:[],B:[]}, classes:[{id:'A B',name:'x'},{id:'',name:'y'}]});
  out = env.getRegistrationClassList();
  assertEq(out.map(function(c){return c.id;}), ['A','B'],
    'F3-3 state.classes が全て不正 classId → fallback ["A","B"]');
}

// F4: calcTotal の fallback
//   ROUND-CLASS-START-007 (Codex S2 修正後):
//     calcTotal は getRegistrationClassList() を唯一の source of truth として使う。
//     state.classes 不在時は ['A','B'] fallback に揃え、renderRegList との表示乖離を防ぐ。
//     よって state.players.C が存在しても classes fallback が ['A','B'] のため C は合計対象外。
//     旧 006 は state.players own-key 走査だったが、S2 で renderRegList と整合させた。
{
  const env = loadEnv(targetPath);
  // state.classes 不在 + state.players に A/B 以外の own-key がある場合
  env._setState({
    players:{
      A:[makePlayer('a1','x','A',{member:'member',grade:'ippan'})],  // 500
      B:[],
      C:[makePlayer('c1','y','C',{member:'other',grade:'ippan'})]    // 1000（fallback ['A','B'] なので集計外）
    }
  });
  assertEq(env.calcTotal(), 500,
    'F4 state.classes 不在時は getRegistrationClassList の ["A","B"] fallback と整合し、A のみ集計 = 500');
}

// ============================================================
// SECTION R: A/B 固定 literal regression detection
// ============================================================

// R1, R2: renderRegList body に A/B 固定 literal が無い
{
  const m = htmlSrc.match(/function renderRegList\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(body.indexOf("cls==='A'?'a-count':'b-count'") === -1,
    'R1 renderRegList 内に cls===A ? a-count : b-count 三項演算固定が無い');
  assert(body.indexOf('state.players.A.length+state.players.B.length') === -1,
    'R2 renderRegList 内に state.players.A.length+state.players.B.length 固定が無い');
}

// R3: calcTotal body
{
  const m = htmlSrc.match(/function calcTotal\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(body.indexOf('state.players.A.concat(state.players.B)') === -1,
    'R3 calcTotal 内に state.players.A.concat(state.players.B) 固定が無い');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  ROUND-CLASS-START-006 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
