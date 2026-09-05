#!/usr/bin/env node
// @suite: WARNBANNER-846-ONE-STEP-001 (#846) ⚠バナーの「『変更』1回で縮められる手」の提案
//
//   出どころ: 8/9 当日、Aクラスで ⚠ が全 160 手で消えず幹事の判断材料にならなかった。
//   設計B（Blossom で到達可能な最小）は到達不能 82〜89%・棄権・#272 衝突で差し戻し → 作者裁定（2026-09-05 案A）
//   「到達可能＝『変更』モーダルで実際にできる手」に定義し直し、1手先だけを見る。
//
//   保証すること（1文）: 提案する手は必ずモーダルで実行でき（classify が ok）、実行後の指標は表示した値になり、
//   かつ 1 手の全探索で最良（辞書順 (再戦, 最大勝数差, 勝数差合計)）である。無ければ null。
//   保証しないこと: 2 手以上の改善／warningHit の発火条件／generatePairing。
//
//   受け入れ基準（Issue #846 設計完了コメント）: 1 到達可能／2 自己整合／3 全探索一致／4 改善手なし→null／
//   5 変異3種で赤（V-1 再戦を目的関数から外す・V-2 classify を見ない・V-3 常に null）／
//   H バナー HTML に 1 行出る（有り・無し）・氏名はエスケープ
//
//   入力は完全架空（p1..p10 / 「選手ア」〜）。読み取り専用。

const fs = require('fs');
function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8'); const scripts=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]); return scripts.join('\n');
}
function makeContext(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
      style:{}, _attrs:{}, childNodes:[], children:[], classList:{add:function(){},remove:function(){},contains:function(){return false;},toggle:function(){}},
      appendChild:function(c){ this.childNodes.push(c); return c; }, removeChild:function(){}, remove:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); }, getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      removeAttribute:function(){}, hasAttribute:function(){ return false; },
      addEventListener:function(){}, removeEventListener:function(){}, focus:function(){}, click:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }, getBoundingClientRect:function(){ return {top:0,left:0,width:0,height:0,bottom:0,right:0}; } };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); }, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), documentElement:makeNode('html'), addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }, activeElement:null };
  var winMock={ innerWidth:1024, innerHeight:800, addEventListener:function(){}, removeEventListener:function(){}, scrollTo:function(){},
    open:function(){ return {focus:function(){},print:function(){},close:function(){}}; }, matchMedia:function(){ return {matches:false,addListener:function(){},addEventListener:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}
const targetPath = process.argv[2] || 'shogi_v4.html';
if(!fs.existsSync(targetPath)){ console.error('対象ファイルなし: '+targetPath); process.exit(1); }
const SRC = extractScripts(targetPath);

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }
function patch(src, from, to, tag){
  const n=src.split(from).length-1;
  if(n!==1) throw new Error('[patch:'+tag+'] 置換元の出現回数が '+n+' 件（1件であること）: '+from.slice(0,60));
  return src.split(from).join(to);
}
const P_KEY = `function qualityKey(q){ return [q.rematchCount||0,q.maxWinDiff||0,q.totalWinDiff||0]; }`;
const P_CLF = `        if(!clf||clf.status!=='ok')continue;`;
const P_RET = `  return best;
}
// 提案文`;
function buildSource(v){
  switch(v){
    case 'CURRENT': return SRC;
    case 'V-1': return patch(SRC, P_KEY, `function qualityKey(q){ return [0,q.maxWinDiff||0,q.totalWinDiff||0]; }`, 'V-1');   // 再戦を見ない
    case 'V-2': return patch(SRC, P_CLF, `        if(!clf)continue;`, 'V-2');                                              // 到達可能性を見ない
    case 'V-3': return patch(SRC, P_RET, `  return null;
}
// 提案文`, 'V-3');                                                                                                        // 常に null
    default: throw new Error('unknown variant '+v);
  }
}
function loadEnv(v){
  const ctx=makeContext(); const js=buildSource(v);
  const cryptoMock={ randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { findOneStepImprovement:findOneStepImprovement, buildOneStepHintText:buildOneStepHintText,
              applyOneStepMove:applyOneStepMove, evaluatePairingQuality:evaluatePairingQuality,
              classifyChangePairingCandidate:classifyChangePairingCandidate, findPairContainingPlayer:findPairContainingPlayer,
              buildCurrentPairingsHtml:(typeof buildCurrentPairingsHtml==='function')?buildCurrentPairingsHtml:null,
              _setState:function(s){ state=s; }, _getState:function(){ return state; } };`);
  return fn(ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; });
}

// ---- 再現可能な draw ---------------------------------------------------------
function lcg(seed){ var s=seed>>>0; return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function shuffle(a0,rnd){ var a=a0.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(rnd()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
const IDS=['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'];
const KANA='アイウエオカキクケコ';
function mkPlayers(ids){ return ids.map(function(id,i){ return {id:id,name:'選手'+KANA.charAt(i),entry_no:i+1}; }); }
// n 名（偶数=全員卓・奇数=1名待機）・rounds 回戦消化・現卓は乱数（勝者は乱数）
function makeDraw(seed, n, rounds, withWinners){
  var ids=IDS.slice(0,n); var rnd=lcg(seed); var results=[];
  for(var r=0;r<rounds;r++){ var o=shuffle(ids,rnd); var round=[]; for(var i=0;i+1<o.length;i+=2)round.push({p1:o[i],p2:o[i+1],winner:(rnd()<0.5?o[i]:o[i+1])}); results.push(round); }
  var o2=shuffle(ids,rnd); var pairings=[];
  for(var k=0;k+1<o2.length;k+=2)pairings.push({p1:o2[k],p2:o2[k+1],winner:(withWinners&&rnd()<0.3)?o2[k]:null});
  return { classes:[{id:'A',name:'A級',started:true}], players:{A:mkPlayers(ids)}, pairings:{A:pairings}, results:{A:results} };
}
function keyOf(q){ return [q.rematchCount,q.maxWinDiff,q.totalWinDiff]; }
function less(a,b){ for(var i=0;i<3;i++){ if(a[i]<b[i])return true; if(a[i]>b[i])return false; } return false; }
function sameKey(a,b){ return a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]; }

// 独立の全探索（実装の findOneStepImprovement は使わない。classify と evaluate は実装のものを「入力」として使う）
function bruteBest(env, st){
  env._setState(st);
  var base=keyOf(env.evaluatePairingQuality(st.pairings.A, st.results.A, st.players.A));
  var best=null;
  for(var idx=0; idx<st.pairings.A.length; idx++){
    var m=st.pairings.A[idx]; if(m.winner)continue;
    ['p1','p2'].forEach(function(role){
      var cur=(role==='p1')?m.p1:m.p2;
      st.players.A.forEach(function(pl){
        var cid=pl.id; if(cid===cur)return;
        var clf=env.classifyChangePairingCandidate('A',idx,cid,role); if(clf.status!=='ok')return;
        var oi=env.findPairContainingPlayer('A',cid,idx);
        // 独立に適用（モーダルの保存処理と同じ形）
        var next=JSON.parse(JSON.stringify(st.pairings.A));
        var dropped=cur; if(role==='p1')next[idx].p1=cid; else next[idx].p2=cid;
        if(oi>=0){ if(next[oi].p1===cid)next[oi].p1=dropped; else next[oi].p2=dropped; }
        var k=keyOf(env.evaluatePairingQuality(next, st.results.A, st.players.A));
        if(!less(k,base))return;
        if(!best||less(k,best.key))best={key:k,idx:idx,role:role,cid:cid,oi:oi};
      });
    });
  }
  return {base:base,best:best};
}

// =============================================================================
console.log('=== [S] sweep（8〜10名×30draw・勝者あり/なし）: 到達可能・自己整合・全探索一致 ===');
const envCur=loadEnv('CURRENT');
function sweep(env){
  var acc={draws:0, withMove:0, noMove:0, unreachable:0, selfMismatch:0, notBest:0, nullButExists:0, replaceMoves:0, swapMoves:0};
  for(var d=0; d<30; d++){
    var n=8+(d%3); var st=makeDraw(3000+d, n, 1+(d%4), d%2===1);
    acc.draws++;
    var br=bruteBest(env, st);
    env._setState(st);
    var mv=env.findOneStepImprovement('A');
    if(!mv){ acc.noMove++; if(br.best)acc.nullButExists++; continue; }
    acc.withMove++;
    if(mv.kind==='swap')acc.swapMoves++; else acc.replaceMoves++;
    // 1 到達可能
    var clf=env.classifyChangePairingCandidate('A',mv.idx,mv.candidateId,mv.role);
    if(clf.status!=='ok')acc.unreachable++;
    // 2 自己整合: 名指した手を独立に適用して評価すると afterKey と一致
    var next=JSON.parse(JSON.stringify(st.pairings.A));
    if(mv.role==='p1')next[mv.idx].p1=mv.candidateId; else next[mv.idx].p2=mv.candidateId;
    if(mv.otherIdx>=0){ if(next[mv.otherIdx].p1===mv.candidateId)next[mv.otherIdx].p1=mv.dropped; else next[mv.otherIdx].p2=mv.dropped; }
    var k=keyOf(env.evaluatePairingQuality(next, st.results.A, st.players.A));
    if(!sameKey(k,mv.afterKey)||!sameKey(br.base,mv.beforeKey))acc.selfMismatch++;
    // 3 全探索一致（指標値で比較・同点の手は別でもよい）
    if(!br.best||!sameKey(br.best.key,mv.afterKey))acc.notBest++;
  }
  return acc;
}
const cur=sweep(envCur);
assert(cur.withMove>0 && cur.noMove>0, '[S0] 手あり・手なしの両方の draw が出ている（あり '+cur.withMove+'／なし '+cur.noMove+'）＝空振りで緑にならない');
assert(cur.swapMoves>0 && cur.replaceMoves>0, '[S1] swap と replace（待機者）の両方が提案として出ている（swap '+cur.swapMoves+'／replace '+cur.replaceMoves+'）');
assert(cur.unreachable===0, '[1] ★ 名指した手は全部モーダルで実行できる（到達不能 '+cur.unreachable+'/'+cur.withMove+'）');
assert(cur.selfMismatch===0, '[2] ★ 名指した手を独立に適用すると表示した前後の値と一致（不一致 '+cur.selfMismatch+'）');
assert(cur.notBest===0, '[3] ★ 1手の全探索で最良（劣る提案 '+cur.notBest+'）');
assert(cur.nullButExists===0, '[3b] ★ 改善手が存在するのに null を返した draw が無い（'+cur.nullButExists+'）');

// =============================================================================
console.log('=== [N] 改善手が無い盤面 → null ===');
{ // 他卓が全部結果入力済＝swap 不能・待機者なし（偶数）＝replace 不能
  var st=makeDraw(4242, 8, 2, false);
  st.pairings.A.forEach(function(m,i){ if(i>0)m.winner=m.p1; });
  envCur._setState(st);
  assert(envCur.findOneStepImprovement('A')===null, '[4] 他卓が全て結果入力済・待機者なし → null');
}
{ // 明らかな改善手がある盤面: 2勝×0勝 と 1勝×1勝 を入れ替えれば勝数差 2→0
  var st={ classes:[{id:'A',name:'A級',started:true}], players:{A:mkPlayers(['p1','p2','p3','p4'])},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}],[{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:'p4'}]]},
    pairings:{A:[{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null}]} };  // p1=2勝 p2=0勝 / p3=1勝 p4=1勝（p1×p2, p3×p4 は再戦）
  envCur._setState(st);
  var mv=envCur.findOneStepImprovement('A');
  assert(!!mv && mv.afterKey[0]<mv.beforeKey[0], '[4b] 再戦 2 件の盤面で再戦を減らす手が提案される  ['+(mv?envCur.buildOneStepHintText('A',mv):'null')+']');
  var txt=envCur.buildOneStepHintText('A',mv);
  assert(/^第[12]卓の 選手[アイウエ] を 第[12]卓の 選手[アイウエ] と入れ替える（再戦 2 → [01] 件）$/.test(txt), '[T1] 提案文の形（swap・再戦）  ['+txt+']');
}

// =============================================================================
console.log('=== [C] 規模上限（評価回数 > 3000 で省略・skipped を返す）===');
{ var ids60=[]; for(var i=0;i<60;i++)ids60.push('q'+i);
  var rnd=lcg(9); var o=shuffle(ids60,rnd); var pr=[]; for(var k=0;k+1<o.length;k+=2)pr.push({p1:o[k],p2:o[k+1],winner:null});
  var st60={ classes:[{id:'A',name:'A級',started:true}], players:{A:ids60.map(function(id,i){ return {id:id,name:'n'+i,entry_no:i+1}; })}, pairings:{A:pr}, results:{A:[]} };
  envCur._setState(st60);
  var r60=envCur.findOneStepImprovement('A');
  assert(!!r60 && r60.skipped===true, '[C1] 60名（30卓×2×60=3600 > 3000）→ skipped');
  var ids30=ids60.slice(0,30); var o30=shuffle(ids30,rnd); var pr30=[]; for(var k2=0;k2+1<o30.length;k2+=2)pr30.push({p1:o30[k2],p2:o30[k2+1],winner:null});
  envCur._setState({ classes:[{id:'A',name:'A級',started:true}], players:{A:ids30.map(function(id,i){ return {id:id,name:'n'+i,entry_no:i+1}; })}, pairings:{A:pr30}, results:{A:[]} });
  var r30=envCur.findOneStepImprovement('A');
  assert(!(r30&&r30.skipped), '[C2] 30名（15×2×30=900）は省略しない');
}

console.log('=== [H] バナー HTML に 1 行出る（有り／無し・エスケープ）===');
if(envCur.buildCurrentPairingsHtml){
  // 有り
  var stH={ classes:[{id:'A',name:'A級',started:true}], players:{A:mkPlayers(['p1','p2','p3','p4'])},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}],[{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:'p4'}]]},
    pairings:{A:[{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null}]} };
  stH.players.A[0].name='選手<b>ア'; stH.players.A[2].name='選手&ウ';
  envCur._setState(stH);
  var h1=envCur.buildCurrentPairingsHtml('A');
  assert(h1.indexOf('↪ 「変更」1回で縮められます：')>0, '[H1] ★ 改善手あり → 「縮められます：<手>」の行が出る');
  assert(h1.indexOf('<b>')<0 && (h1.indexOf('選手&lt;b&gt;ア')>0 || h1.indexOf('選手&amp;ウ')>0), '[H4] ★ 提案文の氏名は HTML エスケープされている');
  // 無し（他卓が結果入力済）
  var stN=makeDraw(4242, 8, 2, false); stN.pairings.A.forEach(function(m,i){ if(i>0)m.winner=m.p1; });
  envCur._setState(stN);
  var h2=envCur.buildCurrentPairingsHtml('A');
  var q=envCur.evaluatePairingQuality(stN.pairings.A, stN.results.A, stN.players.A);
  if(q.warningHit) assert(h2.indexOf('↪ 「変更」1回で縮められる手はありません')>0, '[H2] ★ 改善手なし＋⚠ → 「手はありません」の行が出る');
  else ok('[H2] （この fixture は ⚠ 非発火のため行なし＝対象外）');
  assert(h2.indexOf('縮められます：')<0, '[H3] 改善手なしのとき「縮められます」は出ない');
}else{ ng('[H0] buildCurrentPairingsHtml が取れない'); }

// =============================================================================
console.log('=== [V] 変異で赤 ===');
function sweepOk(env){ var a=sweep(env); return a.unreachable===0 && a.selfMismatch===0 && a.notBest===0 && a.nullButExists===0 && a.withMove>0; }
assert(sweepOk(envCur), '[V0] 現行は sweep で緑（前提）');
assert(!sweepOk(loadEnv('V-1')), '[V-1] ★ 再戦を目的関数から外すと全探索一致が赤');
assert(!sweepOk(loadEnv('V-2')), '[V-2] ★ classify を見ないと到達不能な提案が出て赤');
assert(!sweepOk(loadEnv('V-3')), '[V-3] ★ 常に null にすると「存在するのに null」が赤');

console.log('WARNBANNER-846-ONE-STEP-001: PASS='+pass+', FAIL='+fail);
process.exit(fail?1:0);
