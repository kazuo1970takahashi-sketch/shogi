#!/usr/bin/env node
// CHARACTERIZATION: evaluatePairingQuality（ペアリング品質評価・純関数）。
//   Issue #283 Phase A deliverable 3。被覆マップで「被覆ゼロ」と判定された詳細分岐を
//   現状の挙動として固定（characterization）する。リファクタ時の番人。
//
//   対象（shogi_v4.html）: function evaluatePairingQuality(pairings, results, players)
//     - pairings: 当該クラスの「現在の組み合わせ」フラット配列 [{p1,p2,lastModifiedBy?}, ...]
//     - results : 当該クラスのラウンド配列 [[{p1,p2,winner}, ...], ...]（勝数・対戦履歴の算定元）
//     - players : 当該クラスの参加者フラット配列 [{id}, ...]
//   返り値: {totalWinDiff,maxWinDiff,sameScorePairCount,rematchCount,avoidableWinDiffPairs,warningHit,pairDetails[]}
//
//   入力は完全架空（id は q1.. の記号のみ）。shogi_v4.html は一切変更しない。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); }, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_char_pairing_quality_001.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { evaluatePairingQuality:evaluatePairingQuality };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }
function eqArr(a,b){ return JSON.stringify(a)===JSON.stringify(b); }

const env = loadEnv();
const evalQ = env.evaluatePairingQuality;

// ---- C0: ガード（null/壊れ値）→ 安全な既定（ゼロ・空 pairDetails・warningHit false）----
(function(){
  var r = evalQ(null, null, null);
  assert(r.totalWinDiff===0 && r.maxWinDiff===0 && r.sameScorePairCount===0, 'C0-1 null 入力で集計は全ゼロ');
  assert(r.rematchCount===0 && r.avoidableWinDiffPairs===0 && r.warningHit===false, 'C0-2 null 入力で warningHit=false');
  assert(Array.isArray(r.pairDetails) && r.pairDetails.length===0, 'C0-3 null 入力で pairDetails は空配列');
})();

// ---- C1: 空入力 → 全ゼロ・warningHit false ----
(function(){
  var r = evalQ([], [], []);
  assert(r.warningHit===false && r.pairDetails.length===0, 'C1-1 空入力 warningHit=false・pairDetails 空');
})();

// ---- C2: 同勝数ペア（全員0勝・再戦なし）→ '同勝数'/'再戦なし'・要確認なし・warningHit false ----
(function(){
  var players=[{id:'q1'},{id:'q2'},{id:'q3'},{id:'q4'}];
  var pairings=[{p1:'q1',p2:'q2'},{p1:'q3',p2:'q4'}];
  var r = evalQ(pairings, [], players);
  assert(r.sameScorePairCount===2, 'C2-1 同勝数ペアが2件');
  assert(r.maxWinDiff===0 && r.totalWinDiff===0, 'C2-2 勝数差は全0');
  assert(r.rematchCount===0 && r.avoidableWinDiffPairs===0, 'C2-3 再戦0・回避可能勝数差ペア0');
  assert(r.warningHit===false, 'C2-4 warningHit=false');
  assert(eqArr(r.pairDetails[0].labels, ['同勝数','再戦なし']), 'C2-5 ラベルは [同勝数, 再戦なし]（要確認なし）');
})();

// ---- C3: 再戦（同じ2人を再ペア）→ isRematch true・'再戦'・'要確認'・rematchCount・warningHit ----
(function(){
  var players=[{id:'q1'},{id:'q2'}];
  var results=[[{p1:'q1',p2:'q2',winner:'q1'}]]; // q1=1勝, q2=0勝, 履歴 q1-q2
  var pairings=[{p1:'q1',p2:'q2'}];
  var r = evalQ(pairings, results, players);
  assert(r.pairDetails[0].isRematch===true, 'C3-1 過去対戦済み → isRematch=true');
  assert(r.rematchCount===1 && r.warningHit===true, 'C3-2 rematchCount=1・warningHit=true');
  assert(r.pairDetails[0].winDiff===1, 'C3-3 勝数差=1（1勝 vs 0勝）');
  assert(eqArr(r.pairDetails[0].labels, ['勝数差1','再戦','要確認']), 'C3-4 ラベルは [勝数差1, 再戦, 要確認]');
})();

// ---- C4: 勝数差>=2 → '要確認'・maxWinDiff・warningHit（再戦でなくても）----
(function(){
  var players=[{id:'q1'},{id:'q2'},{id:'q3'},{id:'q4'}];
  // round0: q1>q2, q3>q4 / round1: q1>q3, q2>q4  → wins q1=2,q2=1,q3=1,q4=0
  var results=[
    [{p1:'q1',p2:'q2',winner:'q1'},{p1:'q3',p2:'q4',winner:'q3'}],
    [{p1:'q1',p2:'q3',winner:'q1'},{p1:'q2',p2:'q4',winner:'q2'}]
  ];
  var pairings=[{p1:'q1',p2:'q4'}]; // 2勝 vs 0勝・未対戦
  var r = evalQ(pairings, results, players);
  assert(r.pairDetails[0].winDiff===2 && r.maxWinDiff===2, 'C4-1 勝数差=2・maxWinDiff=2');
  assert(r.pairDetails[0].isRematch===false, 'C4-2 q1-q4 は未対戦 → isRematch=false');
  assert(r.warningHit===true, 'C4-3 maxWinDiff>=2 で warningHit=true');
  assert(eqArr(r.pairDetails[0].labels, ['勝数差2','再戦なし','要確認']), 'C4-4 ラベルは [勝数差2, 再戦なし, 要確認]');
})();

// ---- C5: avoidableWinDiffPairs（回避可能な勝数差ペア）> 0 → '要確認'・warningHit ----
(function(){
  var players=[{id:'q1'},{id:'q2'},{id:'q3'},{id:'q4'}];
  // round0: q1>q3, q2>q4 → wins q1=1,q2=1,q3=0,q4=0 / 履歴 q1-q3, q2-q4
  var results=[[{p1:'q1',p2:'q3',winner:'q1'},{p1:'q2',p2:'q4',winner:'q2'}]];
  // クロス group ペア（1勝×0勝）だが内部マッチング可能＝回避可能。未対戦の組み合わせを選ぶ
  var pairings=[{p1:'q1',p2:'q4'},{p1:'q2',p2:'q3'}];
  var r = evalQ(pairings, results, players);
  assert(r.avoidableWinDiffPairs===2, 'C5-1 回避可能な勝数差ペア=2');
  assert(r.rematchCount===0, 'C5-2 いずれも未対戦（rematchCount=0）');
  assert(r.warningHit===true, 'C5-3 avoidableWinDiffPairs>0 で warningHit=true');
  assert(r.pairDetails[0].labels.indexOf('要確認')>=0 && r.pairDetails[1].labels.indexOf('要確認')>=0, 'C5-4 両ペアに 要確認 が付く');
})();

// ---- C6: 手動変更ラベル（lastModifiedBy==='manual'）----
(function(){
  var players=[{id:'q1'},{id:'q2'}];
  var pairings=[{p1:'q1',p2:'q2',lastModifiedBy:'manual'}];
  var r = evalQ(pairings, [], players);
  assert(r.pairDetails[0].labels.indexOf('手動変更')>=0, 'C6-1 lastModifiedBy=manual で 手動変更 ラベル');
  assert(r.pairDetails[0].labels[r.pairDetails[0].labels.length-1]==='手動変更', 'C6-2 手動変更 は末尾に付与');
  assert(r.warningHit===false, 'C6-3 手動変更だけでは warningHit=false（同勝数・未対戦）');
})();

// ---- C7: 不完全ペア（p2 欠落）→ 空ラベルのプレースホルダ ----
(function(){
  var players=[{id:'q1'},{id:'q2'}];
  var pairings=[{p1:'q1'}]; // p2 なし
  var r = evalQ(pairings, [], players);
  assert(r.pairDetails.length===1, 'C7-1 不完全ペアも pairDetails に1件入る');
  assert(r.pairDetails[0].p1==='' && r.pairDetails[0].p2==='', 'C7-2 不完全ペアは p1/p2 を空文字に正規化');
  assert(eqArr(r.pairDetails[0].labels, []), 'C7-3 不完全ペアのラベルは空配列');
})();

console.log('  evaluatePairingQuality characterization テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
