#!/usr/bin/env node
// STATE-NORMALIZE-GUARD (#312): normalizeState 近辺の state 正規化バグ2件の回帰テスト。
//   closes #277（rounds 正規化）/ closes #276（entry_no 衝突回避採番）。
//
//   観点A（#277 rounds・L813 旧 Number(s.rounds)||4）:
//     負数(-3)・小数(2.7) が素通りし、rounds=0 が 4 に化けていた。
//     受入: -3→4 / 2.7→2 / 0→4 / ''→4 / undefined(キーあり)→4 / キー不在→4 / NaN→4 /
//           正の整数 n→n / 文字列の正整数 '5'→5 / 1→1（境界）/ 100→100（上限クランプなし）。
//
//   観点B（#276 entry_no・normalizeState 補完 ＋ nextEntryNoForClass）:
//     旧実装は entry_no 不在を配列 index+1 で補完 → 別レコードの明示 entry_no=1 等と衝突＝重複。
//     不変条件: クラス内 entry_no は正の整数で一意。明示の有効・一意値は保持。
//     不在/無効/重複（後発）のみ max(existing)+1 から一意採番。欠番は再利用しない（§11.8）。
//
//   データは完全架空のみ（架空 …）。実データ・PII 不使用。
//   ※ 真の回帰テスト: 未修正 base では観点B（重複ゼロ等）と観点A（-3/2.7/0）が FAIL する。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_state_normalize_guard_312.js <html>'); process.exit(1); }
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 最小 DOM / window / localStorage モック（normalizeState 自体は不要だが script 全体評価のため）。
function makeContext(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      disabled:false, type:'', style:{}, _attrs:{}, childNodes:[], _listeners:{},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3, textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(RAW);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       nextEntryNoForClass:nextEntryNoForClass
     };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log:function(){},error:function(){},warn:function(){}}, Promise, function(){}
  );
}

const env = loadEnv();

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ if(cond)ok(msg); else ng(msg); }

// 2クラスの最小 raw を組む（classes は A/B 固定の架空）。over で上書き。
function mkRaw(over){
  var base = {
    players:{A:[],B:[]}, pairings:{A:[],B:[]}, results:{A:[],B:[]},
    classes:[{id:'A',name:'A',started:false},{id:'B',name:'B',started:false}],
    report:{}
  };
  over = over || {};
  for(var k in over){ if(Object.prototype.hasOwnProperty.call(over,k))base[k]=over[k]; }
  return base;
}

// A クラスに players を入れて normalize し、players.A を返す。
function normA(playersA){
  return env.normalizeState(mkRaw({players:{A:playersA,B:[]}})).players.A;
}

// 配列の値が全て一意か。
function allUnique(arr){
  var seen={};
  for(var i=0;i<arr.length;i++){ if(seen[arr[i]])return false; seen[arr[i]]=true; }
  return true;
}
// 全て正の整数か。
function allPositiveInt(arr){
  for(var i=0;i<arr.length;i++){ var v=arr[i]; if(typeof v!=='number'||v<=0||Math.floor(v)!==v)return false; }
  return true;
}

console.log('STATE-NORMALIZE-GUARD #312 テスト');

// =========================================================
// 観点A: #277 rounds 正規化
// =========================================================
// rounds キーありの上書き
function roundsOf(v){ return env.normalizeState(mkRaw({rounds:v})).rounds; }

assert(roundsOf(-3)===4,           'A1 rounds=-3 → 4（負数は既定）');
assert(roundsOf(2.7)===2,          'A2 rounds=2.7 → 2（小数は floor）');
assert(roundsOf(0)===4,            'A3 rounds=0 → 4（0 は既定）');
assert(roundsOf('')===4,           'A4 rounds="" → 4（空文字は既定）');
assert(roundsOf(undefined)===4,    'A5 rounds=undefined（キーあり）→ 4');
assert(env.normalizeState(mkRaw()).rounds===4, 'A6 rounds キー不在 → 4');
assert(roundsOf(NaN)===4,          'A7 rounds=NaN → 4');
assert(roundsOf(null)===4,         'A8 rounds=null → 4');
assert(roundsOf(5)===5,            'A9 rounds=5（正の整数）→ 5');
assert(roundsOf('5')===5,          'A10 rounds="5"（文字列の正整数）→ 5');
assert(roundsOf(1)===1,            'A11 rounds=1（境界）→ 1');
assert(roundsOf(100)===100,        'A12 rounds=100 → 100（上限クランプなし）');
assert(roundsOf(-0.5)===4,         'A13 rounds=-0.5 → 4（floor(-0.5)=-1<1）');
assert(roundsOf(3.999)===3,        'A14 rounds=3.999 → 3（floor）');
assert(typeof roundsOf(5)==='number', 'A15 rounds は number 型で返る');

// =========================================================
// 観点B: #276 entry_no 衝突回避採番（normalizeState 補完）
// =========================================================
// B1: 「明示 entry_no=1 ＋ entry_no 不在 player（index0）」混在（issue 指定の中心ケース）。
(function(){
  var pA = normA([
    {id:'x0',name:'架空零',cls:'A',member:'member',grade:'ippan'},           // entry_no 不在（index0）
    {id:'x1',name:'架空一',cls:'A',member:'member',grade:'ippan',entry_no:1}  // 明示 1
  ]);
  var byId={}; pA.forEach(function(p){ byId[p.id]=p.entry_no; });
  var nos = pA.map(function(p){return p.entry_no;});
  assert(byId.x1===1, 'B1a 明示 entry_no=1 を保持');
  assert(byId.x0===2, 'B1b 不在 player は max+1=2 に採番（index+1=1 で衝突しない）');
  assert(allUnique(nos), 'B1c クラス内 entry_no 重複ゼロ');
  assert(allPositiveInt(nos), 'B1d 全て正の整数');
})();

// B2: 明示値の重複（同 entry_no=1 が2件）→ 後発を再採番。
(function(){
  var pA = normA([
    {id:'d1',name:'架空甲',cls:'A',member:'member',grade:'ippan',entry_no:1},
    {id:'d2',name:'架空乙',cls:'A',member:'member',grade:'ippan',entry_no:1}, // 重複（後発）
    {id:'d3',name:'架空丙',cls:'A',member:'member',grade:'ippan',entry_no:3}
  ]);
  var byId={}; pA.forEach(function(p){ byId[p.id]=p.entry_no; });
  var nos = pA.map(function(p){return p.entry_no;});
  assert(byId.d1===1, 'B2a 重複の初出（d1）は 1 を保持');
  assert(byId.d3===3, 'B2b 一意の明示値（d3=3）を保持');
  assert(byId.d2===4, 'B2c 重複の後発（d2）は max+1=4 に再採番');
  assert(allUnique(nos), 'B2d 重複解消（一意）');
})();

// B3: 全て一意の正の整数 → 完全保持（非回帰・冪等）。
(function(){
  var pA = normA([
    {id:'u1',name:'架空1',cls:'A',member:'member',grade:'ippan',entry_no:1},
    {id:'u2',name:'架空2',cls:'A',member:'member',grade:'ippan',entry_no:2},
    {id:'u3',name:'架空3',cls:'A',member:'member',grade:'ippan',entry_no:3}
  ]);
  var nos = pA.map(function(p){return p.entry_no;});
  assert(JSON.stringify(nos)===JSON.stringify([1,2,3]), 'B3a 一意の明示値はそのまま保持（非回帰）');
})();

// B4: 欠番維持（削除済の歯抜け [1,3,5]）→ 明示一意値は保持、欠番を埋め直さない。
(function(){
  var pA = normA([
    {id:'g1',name:'架空a',cls:'A',member:'member',grade:'ippan',entry_no:1},
    {id:'g3',name:'架空c',cls:'A',member:'member',grade:'ippan',entry_no:3},
    {id:'g5',name:'架空e',cls:'A',member:'member',grade:'ippan',entry_no:5}
  ]);
  var nos = pA.map(function(p){return p.entry_no;});
  assert(JSON.stringify(nos)===JSON.stringify([1,3,5]), 'B4a 欠番 [1,3,5] は再利用せず保持（§11.8）');
})();

// B5: 無効値（0 / 負数 / 非数値 / NaN / null / 非整数）→ 一意な正の整数へ採番。
(function(){
  var pA = normA([
    {id:'i1',name:'架空z',cls:'A',member:'member',grade:'ippan',entry_no:0},      // 非正
    {id:'i2',name:'架空y',cls:'A',member:'member',grade:'ippan',entry_no:-2},     // 負数
    {id:'i3',name:'架空x',cls:'A',member:'member',grade:'ippan',entry_no:'2'},    // 文字列（非 number）
    {id:'i4',name:'架空w',cls:'A',member:'member',grade:'ippan',entry_no:NaN},    // NaN
    {id:'i5',name:'架空v',cls:'A',member:'member',grade:'ippan',entry_no:2.5},    // 非整数
    {id:'i6',name:'架空u',cls:'A',member:'member',grade:'ippan',entry_no:4}       // 唯一の有効値
  ]);
  var byId={}; pA.forEach(function(p){ byId[p.id]=p.entry_no; });
  var nos = pA.map(function(p){return p.entry_no;});
  assert(byId.i6===4, 'B5a 唯一の有効値（4）を保持');
  assert(allUnique(nos), 'B5b 無効値混在でも重複ゼロ');
  assert(allPositiveInt(nos), 'B5c 無効値は全て正の整数へ採番');
  assert(byId.i1>4 && byId.i2>4 && byId.i3>4 && byId.i4>4 && byId.i5>4, 'B5d 無効値は max(=4)+1 以降へ採番');
})();

// B6: クラス独立（A と B はそれぞれ独立に一意化。A の重複は B に影響しない）。
(function(){
  var s = env.normalizeState(mkRaw({players:{
    A:[{id:'aa',name:'架空A',cls:'A',member:'member',grade:'ippan'}],       // 不在
    B:[{id:'bb',name:'架空B',cls:'B',member:'member',grade:'ippan',entry_no:1}]
  }}));
  assert(s.players.A[0].entry_no===1, 'B6a A クラスの不在は A 内で 1 採番');
  assert(s.players.B[0].entry_no===1, 'B6b B クラスの明示 1 を保持（A と独立）');
})();

// B7: 名前空（filter で除去）後に採番。除去された行は採番に影響しない。
(function(){
  var pA = normA([
    {id:'n1',name:'',cls:'A',member:'member',grade:'ippan',entry_no:1},     // name 空 → 除去
    {id:'n2',name:'架空残',cls:'A',member:'member',grade:'ippan'},          // 不在 → 採番
    {id:'n3',name:'架空残2',cls:'A',member:'member',grade:'ippan',entry_no:2}
  ]);
  var ids = pA.map(function(p){return p.id;});
  var nos = pA.map(function(p){return p.entry_no;});
  assert(ids.indexOf('n1')===-1, 'B7a name 空の行は除去される（既存挙動）');
  assert(allUnique(nos), 'B7b 除去後も entry_no 一意');
  assert(allPositiveInt(nos), 'B7c 除去後も全て正の整数');
})();

// =========================================================
// 観点B': nextEntryNoForClass の衝突回避（in-place 一意化 ＋ max+1 返却）
// =========================================================
// B8: 不在(index0) ＋ 明示1 → 一意化して衝突しない max+1 を返す（旧実装は 1 をダブらせていた）。
(function(){
  var st = { players:{ A:[
    {id:'y0',name:'架空0',cls:'A'},                 // 不在（index0）
    {id:'y1',name:'架空1',cls:'A',entry_no:1}       // 明示 1
  ] } };
  var n = env.nextEntryNoForClass('A', st);
  var byId={}; st.players.A.forEach(function(p){ byId[p.id]=p.entry_no; });
  var nos = st.players.A.map(function(p){return p.entry_no;});
  assert(byId.y1===1, 'B8a 明示 1 を保持');
  assert(byId.y0===2, 'B8b 不在は 2 に一意化（index+1=1 で衝突しない）');
  assert(allUnique(nos), 'B8c in-place で重複ゼロに正規化');
  assert(n===3, 'B8d 返り値は一意化後の max+1=3');
})();

// B9: 既存重複（[1,1]）でも一意を返す（issue: 既存重複時も一意）。
(function(){
  var st = { players:{ A:[
    {id:'z1',name:'架空甲',cls:'A',entry_no:1},
    {id:'z2',name:'架空乙',cls:'A',entry_no:1}      // 重複
  ] } };
  var n = env.nextEntryNoForClass('A', st);
  var nos = st.players.A.map(function(p){return p.entry_no;});
  assert(allUnique(nos), 'B9a 既存重複を in-place で一意化');
  assert(n>Math.max(nos[0],nos[1]), 'B9b 返り値は採番済み最大値より大（衝突しない次番号）');
  assert(allUnique(nos.concat([n])), 'B9c 返り値も既存と衝突しない');
})();

// B10: 全て一意 → 冪等（mutate しない・max+1 を返す）。
(function(){
  var st = { players:{ A:[
    {id:'k1',name:'架空1',cls:'A',entry_no:1},
    {id:'k2',name:'架空2',cls:'A',entry_no:2},
    {id:'k3',name:'架空3',cls:'A',entry_no:5}
  ] } };
  var n = env.nextEntryNoForClass('A', st);
  var nos = st.players.A.map(function(p){return p.entry_no;});
  assert(JSON.stringify(nos)===JSON.stringify([1,2,5]), 'B10a 一意な既存値は不変（冪等）');
  assert(n===6, 'B10b 返り値は max(5)+1=6（欠番 3,4 は再利用しない）');
})();

// B11: 空クラス → 1 を返す。
(function(){
  var st = { players:{ A:[] } };
  assert(env.nextEntryNoForClass('A', st)===1, 'B11 空クラスは 1 を返す');
})();

console.log('');
console.log('  STATE-NORMALIZE-GUARD (#312 / closes #277,#276) テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
