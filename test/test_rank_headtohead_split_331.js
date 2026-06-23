#!/usr/bin/env node
// REPRO / NEGATIVE-CONTROL for Issue #331 (QA P3・作者方針=同順位):
//   A(勝数)/B(SOS)/C(SODOS) 完全同点の2人が直接対決で 1勝1敗(スプリット)のとき、
//   calcFinal の直接対決ループと isSameDisplayedRank が「最初の対戦行で early-return」
//   するため、早い回戦の勝者が上位/別順位に固定される。
//   作者方針: 1-1 は決着なし＝同順位（最終くじ引き）。
//
//   修正方針: 共有 headToHeadBalance(pid1,pid2,cls) で全対戦行を集計し、勝越し差で判定。
//     calcFinal 比較子: bal>0→pid1上位(-1)/ bal<0→pid2上位(+1)/ bal==0(1-1や対戦なし)→同順位(0)
//     isSameDisplayedRank: bal!==0 なら別順位、0 なら同順位
//   明確な勝越し(2-0等)は従来どおり勝者上位（非回帰）。
//
//   入力は完全架空。未修正 base では 1-1 split ケースが FAIL するネガティブコントロール。

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
if(!targetPath){ console.error('Usage: node test_rank_headtohead_split_331.js <html>'); process.exit(1); }
function loadEnv(){
  const ctx=makeContext(); const js=extractScripts(targetPath);
  const cryptoMock={ randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       calcFinal:calcFinal,
       computeDisplayRanks:computeDisplayRanks,
       isSameDisplayedRank:isSameDisplayedRank,
       _setState:function(s){ state=s; }
     };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){});
}
let pass=0,fail=0;
function ok(c,msg){ if(c)pass++; else {fail++; console.log('  FAIL: '+msg);} }

const env=loadEnv();
function mkState(playersIds, resultRounds){
  var players=playersIds.map(function(id){return {id:id,name:id.toUpperCase(),cls:'A',entry_no:null};});
  return { tournament_id:'t', rounds:resultRounds.length, classes:[{id:'A',name:'A'},{id:'B',name:'B'}],
    players:{A:players,B:[]}, results:{A:resultRounds,B:[]}, report:{} };
}
// ranks を id->rank の map に
function ranksById(finals,ranks){ var o={}; for(var i=0;i<finals.length;i++)o[finals[i].p.id]=ranks[i]; return o; }

console.log('=== B1. 4人2回戦・全員同点・互いに 1-1 split → 全員同順位 rank[1,1,1,1]（バグ本体）===');
(function(){
  // R1: a1>a2, a3>a4 / R2: a2>a1(rematch), a4>a3(rematch)
  var st=mkState(['a1','a2','a3','a4'],[
    [{p1:'a1',p2:'a2',winner:'a1'},{p1:'a3',p2:'a4',winner:'a3'}],
    [{p1:'a2',p2:'a1',winner:'a2'},{p1:'a4',p2:'a3',winner:'a4'}]
  ]);
  env._setState(st);
  var finals=env.calcFinal('A');
  var ranks=env.computeDisplayRanks(finals,'A');
  var allOne=ranks.every(function(r){return r===1;});
  ok(allOne, 'B1: 全員 rank 1（同順位） (got ranks='+JSON.stringify(ranks)+' for '+JSON.stringify(finals.map(function(f){return f.p.id;}))+')  ← 未修正 base は [1,2,2,4] 等で FAIL');
})();

console.log('=== B2. isSameDisplayedRank: 1-1 split の2人は同順位 ===');
(function(){
  var st=mkState(['a1','a2'],[
    [{p1:'a1',p2:'a2',winner:'a1'}],
    [{p1:'a2',p2:'a1',winner:'a2'}]
  ]);
  env._setState(st);
  var finals=env.calcFinal('A');
  // finals[0],finals[1] は同 A/B/C・直接対決 1-1
  ok(env.isSameDisplayedRank(finals[0],finals[1],'A')===true, 'B2: isSameDisplayedRank(1-1)=true  ← 未修正 base は false で FAIL');
})();

console.log('=== R1. 非回帰: 明確な勝越し 2-0 は勝者が上位（別順位）===');
(function(){
  // a1 が a2 に2連勝。両者 A 等しくないと到達しないので、外部相手で A/B/C を揃える設計は複雑なため
  //   ここは「直接対決で決着がつく場合に同順位にしない」ことを isSameDisplayedRank で確認する。
  var st=mkState(['a1','a2'],[
    [{p1:'a1',p2:'a2',winner:'a1'}],
    [{p1:'a1',p2:'a2',winner:'a1'}]
  ]);
  env._setState(st);
  var finals=env.calcFinal('A');
  // a1: A=2, a2: A=0 → A で差がつくので別順位（直接対決まで到達しない通常ケース）
  var ranks=env.computeDisplayRanks(finals,'A');
  ok(finals[0].p.id==='a1'&&ranks[0]===1&&ranks[1]===2, 'R1: 2-0 は a1 が1位・a2 が2位 (got '+JSON.stringify(finals.map(function(f){return f.p.id;}))+' ranks='+JSON.stringify(ranks)+')');
})();

console.log('=== R2. 非回帰: A が異なれば従来どおり勝数順（直接対決に到達しない）===');
(function(){
  // 3人総当たり風: a1 全勝, a2 1勝, a3 0勝
  var st=mkState(['a1','a2','a3'],[
    [{p1:'a1',p2:'a2',winner:'a1'}],
    [{p1:'a1',p2:'a3',winner:'a1'}],
    [{p1:'a2',p2:'a3',winner:'a2'}]
  ]);
  env._setState(st);
  var finals=env.calcFinal('A');
  var ids=finals.map(function(f){return f.p.id;});
  var ranks=env.computeDisplayRanks(finals,'A');
  ok(ids[0]==='a1'&&ranks.join(',')==='1,2,3', 'R2: 勝数順 a1>a2>a3・rank 1,2,3 (got '+JSON.stringify(ids)+' '+JSON.stringify(ranks)+')');
})();

console.log('=== R3. 非回帰: 完全同点だが直接対決が決着(片方2-0)→ 別順位（勝者上位）===');
(function(){
  // 4人で A/B/C を揃えつつ a1-a2 は 2-0、a3-a4 は対称にして A=B=C 同点に近い構成は複雑。
  //   ここでは isSameDisplayedRank で「直接対決が決着(勝越し)なら同順位にしない」を確認。
  var st=mkState(['a1','a2'],[
    [{p1:'a1',p2:'a2',winner:'a1'}],
    [{p1:'a2',p2:'a1',winner:'a1'}]  // 2局とも a1 勝ち=2-0
  ]);
  env._setState(st);
  var finals=env.calcFinal('A');
  // a1:A=2 a2:A=0 → そもそも A で差。だが直接対決決着の同順位否定を直接確認:
  ok(env.isSameDisplayedRank(finals[0],finals[1],'A')===false, 'R3: 直接対決決着(2-0)は別順位 isSameDisplayedRank=false (got '+env.isSameDisplayedRank(finals[0],finals[1],'A')+')');
})();

console.log('=== R4. 非回帰: 対戦なしで A/B/C 同点 → 同順位（従来どおり return 0 / true）===');
(function(){
  // a1,a2 は互いに未対戦、外部で同条件。簡易に2人とも0戦(played0)→ A=B=C=0・直接対決なし
  var st=mkState(['a1','a2'],[]);
  env._setState(st);
  var finals=env.calcFinal('A');
  ok(env.isSameDisplayedRank(finals[0],finals[1],'A')===true, 'R4: 未対戦・同点は同順位=true (got '+env.isSameDisplayedRank(finals[0],finals[1],'A')+')');
})();

console.log('');
console.log('PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
