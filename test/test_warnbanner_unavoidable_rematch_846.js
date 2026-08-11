#!/usr/bin/env node
// WARNBANNER-846-UNAVOIDABLE-REMATCH-001（#846 の小片）
//   「母集団の全ペアが対戦済み＝再戦は組み直しても減らない」を検出し、警告文で明示する。
//   本テストは (1) 判定 rematchUnavoidable の真偽 と (2) 実際に出る警告文 の両方を実測する。
//   入力は完全架空（id は q1.. の記号のみ）。
//
//   ★ 判定は「完全グラフか」だけを見る保守的な実装。true のときは常に真。
//     完全グラフではないが再戦0が不能な形（取りこぼし）は false のまま＝従来表示。
//     T7 でその取りこぼしを「仕様として」固定する（黙って落とさない）。

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
if(!targetPath){ console.error('Usage: node test_warnbanner_unavoidable_rematch_846.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { evaluatePairingQuality:evaluatePairingQuality,
              buildCurrentPairingsHtml:(typeof buildCurrentPairingsHtml==='function')?buildCurrentPairingsHtml:null,
              state:(typeof state!=='undefined')?state:null };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    console, Promise, function(f){ return 0; }
  );
}

const env = loadEnv();
const evalQ = env.evaluatePairingQuality;

let pass=0, fail=0;
function assert(cond, msg){ if(cond){ pass++; console.log('  ✓ '+msg); } else { fail++; console.log('  ✗ '+msg); } }

// ---- ヘルパ: n 名の総当たりを r 回戦ぶん results として作る（円形スケジュール）----
function ids(n){ var a=[]; for(var i=1;i<=n;i++)a.push('q'+i); return a; }
function roundRobinRounds(n){            // n は偶数。n-1 回戦ぶんの [[{p1,p2,winner}]] を返す
  var a=ids(n), rounds=[], fixed=a[0], rot=a.slice(1);
  for(var r=0;r<n-1;r++){
    var round=[], left=[fixed].concat(rot.slice(0,n/2-1)), right=rot.slice(n/2-1).slice().reverse();
    for(var i=0;i<n/2;i++)round.push({p1:left[i],p2:right[i],winner:left[i]});
    rounds.push(round);
    rot.unshift(rot.pop());
  }
  return rounds;
}
function playersOf(n){ return ids(n).map(function(id){ return {id:id}; }); }
function pairAll(list){ var ps=[]; for(var i=0;i<list.length;i+=2)ps.push({p1:list[i],p2:list[i+1]}); return ps; }

console.log('\n[T1] 8名・総当たり7回戦を消化した直後（#846 メモの実測ケース）');
(function(){
  var n=8, results=roundRobinRounds(n);           // 7回戦ぶん＝全ペア消化
  assert(results.length===7, 'T1-0 前提: 生成した回戦数=7（実測 '+results.length+'）');
  // 全ペアが本当に消化されているかを独立に数える（ヘルパ自身の検算）
  var seen={}; results.forEach(function(rd){ rd.forEach(function(m){ seen[[m.p1,m.p2].sort().join('|')]=1; }); });
  assert(Object.keys(seen).length===n*(n-1)/2, 'T1-0b 前提: 消化済みペア数=28（実測 '+Object.keys(seen).length+'）');
  var r = evalQ(pairAll(ids(n)), results, playersOf(n));
  assert(r.rematchUnavoidable===true, 'T1-1 rematchUnavoidable=true');
  assert(r.rematchCount===4, 'T1-2 rematchCount=4（実測 '+r.rematchCount+'）');
  assert(r.warningHit===true, 'T1-3 warningHit=true（従来どおり出る）');
  // どう組み替えても再戦4件で固定であることを全域で確認（8名の完全マッチング105通り）
  var worst=null, best=null, count=0;
  (function perm(rest, acc){
    if(rest.length===0){ count++; var q=evalQ(acc,results,playersOf(n));
      if(worst===null||q.rematchCount>worst)worst=q.rematchCount;
      if(best===null||q.rematchCount<best)best=q.rematchCount; return; }
    var a=rest[0];
    for(var i=1;i<rest.length;i++){ var b=rest[i];
      var nx=rest.slice(1); nx.splice(i-1,1);
      perm(nx, acc.concat([{p1:a,p2:b}])); }
  })(ids(n), []);
  assert(count===105, 'T1-4 全完全マッチングを走査した（105通り・実測 '+count+'）');
  assert(best===4 && worst===4, 'T1-5 105通りすべてで再戦=4＝「避けられません」は厳密に真（min='+best+' max='+worst+'）');
})();

console.log('\n[T2] 8名・6回戦まで（1ペアだけ未対戦）＝発火してはいけない');
(function(){
  var n=8, results=roundRobinRounds(n).slice(0,6);
  var r = evalQ(pairAll(ids(n)), results, playersOf(n));
  assert(r.rematchUnavoidable===false, 'T2-1 rematchUnavoidable=false');
  assert(r.rematchCount>0, 'T2-2 前提: 再戦自体は出ている（'+r.rematchCount+'件）＝差分は文言だけ');
})();

console.log('\n[T3] 通常運用（8名2回戦目）＝発火してはいけない');
(function(){
  var n=8, results=roundRobinRounds(n).slice(0,1);
  var r = evalQ(pairAll(ids(n)), results, playersOf(n));
  assert(r.rematchUnavoidable===false, 'T3-1 rematchUnavoidable=false');
})();

console.log('\n[T4] 奇数クラス: 7名中6名が組まれ1名待機。組まれた6名は総当たり済み');
(function(){
  var results=roundRobinRounds(6);                     // q1..q6 の総当たり5回戦
  var players=playersOf(7);                            // q7 は待機（pairings に居ない）
  var r = evalQ(pairAll(ids(6)), results, players);
  assert(r.rematchUnavoidable===true, 'T4-1 待機者は母集団に数えない＝true');
  assert(r.rematchCount===3, 'T4-2 rematchCount=3（実測 '+r.rematchCount+'）');
})();

console.log('\n[T5] 待機者が過去に対戦していても、組まれていなければ判定に影響しない');
(function(){
  var results=roundRobinRounds(6).concat([[{p1:'q7',p2:'q1',winner:'q7'}]]);
  var r = evalQ(pairAll(ids(6)), results, playersOf(7));
  assert(r.rematchUnavoidable===true, 'T5-1 母集団外の履歴は判定を壊さない');
})();

console.log('\n[T6] 境界');
(function(){
  assert(evalQ([],[],[]).rematchUnavoidable===false, 'T6-1 空 → false');
  assert(evalQ([{p1:'q1'}],[],playersOf(2)).rematchUnavoidable===false, 'T6-2 不完全ペア（p2欠落）→ false');
  assert(evalQ([{p1:'q1',p2:'q2'}],[],playersOf(2)).rematchUnavoidable===false, 'T6-3 2名・未対戦 → false');
  var r2=evalQ([{p1:'q1',p2:'q2'}],[[{p1:'q1',p2:'q2',winner:'q1'}]],playersOf(2));
  assert(r2.rematchUnavoidable===true && r2.rematchCount===1, 'T6-4 2名・対戦済み → true / 再戦1件');
  // players に載っていない id が pairings に居る（棄権や取り込み漏れの形）
  var r3=evalQ([{p1:'zz1',p2:'zz2'}],[[{p1:'zz1',p2:'zz2',winner:'zz1'}]],[]);
  assert(r3.rematchUnavoidable===false, 'T6-5 players 未登録の id は history を持たない → false（誤って true にしない）');
})();

console.log('\n[T7] 取りこぼしの仕様固定: 完全グラフではないが再戦0が不能な形は false のまま');
(function(){
  // q1-q2, q1-q3, q1-q4 のみ対戦済み。q1 は誰と組んでも再戦だが完全グラフではない。
  var results=[[{p1:'q1',p2:'q2',winner:'q1'}],[{p1:'q1',p2:'q3',winner:'q1'}],[{p1:'q1',p2:'q4',winner:'q1'}]];
  var r=evalQ([{p1:'q1',p2:'q2'},{p1:'q3',p2:'q4'}],results,playersOf(4));
  assert(r.rematchUnavoidable===false, 'T7-1 保守側に倒す＝false（これは既知の取りこぼし。設計B2の課題）');
  assert(r.rematchCount>0 && r.warningHit===true, 'T7-2 従来の警告は変わらず出る＝後退なし');
})();

console.log('\n[T8] 実際に出る警告文（buildCurrentPairingsHtml の実出力）');
(function(){
  if(!env.buildCurrentPairingsHtml || !env.state){
    console.log('  - buildCurrentPairingsHtml を環境から取得できず。文言は式で検証する');
  }
  var n=8, cls='A';
  var st=env.state;
  var ok=false;
  try{
    st.classes=[{id:cls,name:'A級'}];
    st.players[cls]=playersOf(n).map(function(p,i){ return {id:p.id,name:'選手'+(i+1),entry_no:i+1}; });
    st.results[cls]=roundRobinRounds(n);
    st.pairings[cls]=pairAll(ids(n));
    var html=env.buildCurrentPairingsHtml(cls, 8, false);
    ok=true;
    assert(html.indexOf('全員と対戦済みのため避けられません')>=0, 'T8-1 実出力に「全員と対戦済みのため避けられません」が含まれる');
    assert(html.indexOf('再戦 4件（全員と対戦済みのため避けられません）')>=0, 'T8-2 文言全体が期待どおり');
    // 対照: 未一巡では出ない
    st.results[cls]=roundRobinRounds(n).slice(0,6);
    var html2=env.buildCurrentPairingsHtml(cls, 7, false);
    assert(html2.indexOf('全員と対戦済みのため避けられません')<0, 'T8-3 対照（6回戦消化）では出ない');
    assert(html2.indexOf('再戦 ')>=0, 'T8-4 対照でも従来の「再戦 N件」は出る＝表示が消えていない');
  }catch(e){
    if(!ok){
      console.log('  - buildCurrentPairingsHtml を直接呼べず（'+e.message+'）。文言生成式で代替検証する');
      var q=evalQ(pairAll(ids(n)), roundRobinRounds(n), playersOf(n));
      var text=q.rematchUnavoidable?'再戦 '+q.rematchCount+'件（全員と対戦済みのため避けられません）':'再戦 '+q.rematchCount+'件';
      assert(text==='再戦 4件（全員と対戦済みのため避けられません）', 'T8-1b 文言＝'+text);
      var src=fs.readFileSync(targetPath,'utf8');
      assert(src.indexOf("?'再戦 '+quality.rematchCount+'件（全員と対戦済みのため避けられません）'")>=0,
        'T8-2b 上記の式が shogi_v4.html に実在する（式の写し間違いでないことの確認）');
    } else { fail++; console.log('  ✗ T8 例外: '+e.message); }
  }
})();

console.log('\n  WARNBANNER-846-UNAVOIDABLE-REMATCH-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
