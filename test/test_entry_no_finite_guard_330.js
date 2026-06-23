#!/usr/bin/env node
// REPRO / NEGATIVE-CONTROL for Issue #330 (QA P2 latent):
//   reconcileEntryNos の有効値ガードが Number.isFinite/SafeInteger を見ないため、
//   Infinity / 1e21（非安全整数）が「正の整数」として素通りし、#276 の不変条件
//   「クラス内 entry_no は正の整数で一意」が破れる（重複採番）。
//
//   修正方針: 共有 isValidEntryNo(en)=isFinite(en)&&en>0&&Math.floor(en)===en&&en<=MAX_SAFE_INTEGER
//   を reconcileEntryNos / normalizeState / export builder で使い、非有限/非安全整数は
//   無効=再採番対象（null）に回す。明示の有効・一意値は保持・欠番は再利用しない（#276 維持）。
//
//   入力は完全架空。未修正 base で Infinity/1e21 ケースが FAIL するネガティブコントロール。

const fs=require('fs');
function extractScripts(p){ const html=fs.readFileSync(p,'utf8'); const s=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m; while((m=re.exec(html))!==null)s.push(m[1]); return s.join('\n'); }
function makeContext(){
  function makeNode(tag){ return { nodeType:1,tagName:String(tag||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_attrs:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return [];} }; }
  var el={};
  var doc={ getElementById:function(id){ if(!el[id]){var n=makeNode('div');n.id=id;el[id]=n;} return el[id]; }, createElement:function(t){return makeNode(t);}, createTextNode:function(t){return {nodeType:3,textContent:String(t==null?'':t)};}, body:makeNode('body'), addEventListener:function(){}, querySelector:function(){return null;}, querySelectorAll:function(){return [];} };
  var win={ innerWidth:1024, addEventListener:function(){}, open:function(){return {focus:function(){},print:function(){},close:function(){}};} };
  var ls={ _:{}, getItem:function(k){return (k in this._)?this._[k]:null;}, setItem:function(k,v){this._[k]=String(v);}, removeItem:function(k){delete this._[k];} };
  return { document:doc, window:win, localStorage:ls };
}
const targetPath=process.argv[2];
if(!targetPath){ console.error('Usage: node test_entry_no_finite_guard_330.js <html>'); process.exit(1); }
function loadEnv(){
  const ctx=makeContext(); const js=extractScripts(targetPath);
  const cryptoMock={ randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       reconcileEntryNos:reconcileEntryNos,
       nextEntryNoForClass:nextEntryNoForClass,
       normalizeState:normalizeState
     };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){});
}
let pass=0,fail=0;
function ok(c,msg){ if(c)pass++; else {fail++; console.log('  FAIL: '+msg);} }
function nos(list){ return list.map(function(p){return p.entry_no;}); }
function allUniquePosSafeInt(list){
  var seen={}; for(var i=0;i<list.length;i++){ var e=list[i].entry_no;
    if(!(typeof e==='number'&&isFinite(e)&&e>0&&Math.floor(e)===e&&e<=9007199254740991))return false;
    if(seen[e])return false; seen[e]=true; } return true;
}
const env=loadEnv();
const MAXS=9007199254740991;

console.log('=== B1. Infinity 混入 → 一意採番されるべき（バグ本体）===');
(function(){
  var list=[{id:'a',name:'甲',entry_no:Infinity},{id:'b',name:'乙'}];
  env.reconcileEntryNos(list);
  ok(allUniquePosSafeInt(list), 'B1: 全 entry_no が正の安全整数で一意 (got '+JSON.stringify(nos(list))+')  ← 未修正 base は Infinity 重複で FAIL');
})();

console.log('=== B2. 1e21（非安全整数）混入 → 一意採番されるべき（save/reload 越え永続バグ）===');
(function(){
  var list=[{id:'a',name:'甲',entry_no:1e21},{id:'b',name:'乙'}];
  env.reconcileEntryNos(list);
  ok(allUniquePosSafeInt(list), 'B2: 1e21 が無効化され一意採番 (got '+JSON.stringify(nos(list))+')  ← 未修正 base は 1e21 重複で FAIL');
})();

console.log('=== B3. -Infinity / NaN / 負 / 小数 混在 → すべて無効→一意採番 ===');
(function(){
  var list=[{id:'a',name:'甲',entry_no:-Infinity},{id:'b',name:'乙',entry_no:NaN},{id:'c',name:'丙',entry_no:-3},{id:'d',name:'丁',entry_no:2.7},{id:'e',name:'戊'}];
  env.reconcileEntryNos(list);
  ok(allUniquePosSafeInt(list)&&list.length===5, 'B3: 5名すべて正の安全整数で一意 (got '+JSON.stringify(nos(list))+')');
})();

console.log('=== B4. normalizeState 経由でも Infinity が一意化される（end-to-end）===');
(function(){
  var raw={ tournament_id:'t', rounds:4, classes:[{id:'A',name:'A'},{id:'B',name:'B'}],
    players:{ A:[{id:'a',name:'甲',entry_no:Infinity},{id:'b',name:'乙'}], B:[] }, report:{} };
  var st=env.normalizeState(raw);
  ok(allUniquePosSafeInt(st.players.A), 'B4: normalizeState 後 A クラスの entry_no が一意の正安全整数 (got '+JSON.stringify(nos(st.players.A))+')');
})();

console.log('=== R1. 非回帰: 有効な連番は保持（1,2,3 不変）===');
(function(){
  var list=[{id:'a',name:'甲',entry_no:1},{id:'b',name:'乙',entry_no:2},{id:'c',name:'丙',entry_no:3}];
  env.reconcileEntryNos(list);
  ok(nos(list).join(',')==='1,2,3', 'R1: 1,2,3 保持 (got '+JSON.stringify(nos(list))+')');
})();

console.log('=== R2. 非回帰: 明示の欠番は保持・不在は max+1（欠番再利用なし）===');
(function(){
  var list=[{id:'a',name:'甲',entry_no:2},{id:'b',name:'乙',entry_no:5},{id:'c',name:'丙'}];
  env.reconcileEntryNos(list);
  ok(list[0].entry_no===2&&list[1].entry_no===5&&list[2].entry_no===6, 'R2: 2,5 保持・不在は 6 (got '+JSON.stringify(nos(list))+')');
})();

console.log('=== R3. 非回帰: 重複（後発）は再採番・先発は保持 ===');
(function(){
  var list=[{id:'a',name:'甲',entry_no:1},{id:'b',name:'乙',entry_no:1}];
  env.reconcileEntryNos(list);
  ok(list[0].entry_no===1&&list[1].entry_no===2, 'R3: 先発 1 保持・後発 2 へ (got '+JSON.stringify(nos(list))+')');
})();

console.log('=== R4. 非回帰: 上限ちょうど(MAX_SAFE_INTEGER)は有効値として保持（境界受理）===');
(function(){
  var list=[{id:'a',name:'甲',entry_no:MAXS}];
  env.reconcileEntryNos(list);
  ok(list[0].entry_no===MAXS, 'R4: MAX_SAFE_INTEGER は有効値として保持 (got '+JSON.stringify(nos(list))+')');
})();

console.log('');
console.log('PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
