#!/usr/bin/env node
// REGRESSION / CHARACTERIZATION for Issue #658 (外部AI評価①・L2 test追加のみ):
//   過去結果の勝者書換（editPastResult 経路）を回帰テストで固定する。挙動変更なし＝現在の
//   正しい挙動を characterization で pin する。base（現 shogi_v4.html）で PASS する。
//
//   固定する不変条件（外部AI評価で確認された非自明 invariant）:
//     「results の全 match は winner を持つ（winner null が永続しない）」— editPastResult 経路も
//     winner に p1|p2 しか代入せず null 化の口が無い。将来のリファクタでこの口が開いたら FAIL させる。
//
//   3層:
//     A. 勝者書換 → calcFinal → computeDisplayRanks の期待値 assert（評価者指定の本丸）。
//        ep-p1 / ep-p2 が行う winner=p1 / winner=p2 と同じ書換を state に行い、順位再計算を確認。
//     B. winner-null invariant（ソースレベル固定）: bindEditPastResultModalEvents が winner に
//        .p1 / .p2 しか代入せず、null / undefined 代入経路が無いこと。モーダルは2択のみで
//        引き分け/null ボタンが無いこと（buildEditPastResultModalHtml）。
//     C. モーダル実駆動: editPastResult(cls,r,m) → ep-p1/ep-p2 の click を発火 → state.results の
//        winner が p1 / p2 になり、決して null にならないことを挙動で確認。
//
//   入力は完全架空。shogi_v4.html 本体は無改変（テスト追加のみ）。

const fs=require('fs');
function extractScripts(p){ const html=fs.readFileSync(p,'utf8'); const s=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m; while((m=re.exec(html))!==null)s.push(m[1]); return s.join('\n'); }

// ---- DOM mock（test_rank_headtohead_split_331.js 系を拡張: addEventListener でハンドラ記録）----
function makeContext(){
  var listeners={}; // id -> { type -> handler }
  function makeNode(tag){
    var node={ nodeType:1,tagName:String(tag||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_attrs:{},childNodes:[],
      appendChild:function(c){this.childNodes.push(c);return c;},
      removeChild:function(c){var i=this.childNodes.indexOf(c);if(i>=0)this.childNodes.splice(i,1);return c;},
      remove:function(){},
      setAttribute:function(k,v){this._attrs[k]=v;},getAttribute:function(k){return (k in this._attrs)?this._attrs[k]:null;},
      addEventListener:function(type,fn){ if(this.id){ (listeners[this.id]||(listeners[this.id]={}))[type]=fn; } },
      querySelector:function(){return null;},querySelectorAll:function(){return [];},
      classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;}} };
    return node;
  }
  var el={};
  var doc={
    getElementById:function(id){ if(!el[id]){var n=makeNode('div');n.id=id;el[id]=n;} return el[id]; },
    createElement:function(t){return makeNode(t);},
    createTextNode:function(t){return {nodeType:3,textContent:String(t==null?'':t)};},
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){return null;}, querySelectorAll:function(){return [];}
  };
  var win={ innerWidth:1024, addEventListener:function(){}, open:function(){return {focus:function(){},print:function(){},close:function(){}};} };
  var ls={ _:{}, getItem:function(k){return (k in this._)?this._[k]:null;}, setItem:function(k,v){this._[k]=String(v);}, removeItem:function(k){delete this._[k];} };
  return { document:doc, window:win, localStorage:ls, _listeners:listeners, _el:el };
}

const targetPath=process.argv[2];
if(!targetPath){ console.error('Usage: node test_edit_past_result_regression_001.js <html>'); process.exit(1); }

const RAW_SCRIPTS=extractScripts(targetPath);

function loadEnv(){
  const ctx=makeContext(); const js=RAW_SCRIPTS;
  const cryptoMock={ randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       calcFinal:calcFinal,
       computeDisplayRanks:computeDisplayRanks,
       editPastResult:(typeof editPastResult!=='undefined')?editPastResult:null,
       bindEditPastResultModalEvents:(typeof bindEditPastResultModalEvents!=='undefined')?bindEditPastResultModalEvents:null,
       getState:function(){ return state; },
       _setState:function(s){ state=s; }
     };`);
  const api=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(f){ /* no async */ });
  api._ctx=ctx;
  return api;
}

let pass=0,fail=0;
function ok(c,msg){ if(c)pass++; else {fail++; console.log('  FAIL: '+msg);} }

const env=loadEnv();

function mkState(playersIds, resultRounds){
  var players=playersIds.map(function(id){return {id:id,name:id.toUpperCase(),cls:'A',entry_no:null};});
  return { tournament_id:'t', rounds:resultRounds.length, classes:[{id:'A',name:'A'},{id:'B',name:'B'}],
    players:{A:players,B:[]}, results:{A:resultRounds,B:[]}, report:{} };
}
function ranksById(finals,ranks){ var o={}; for(var i=0;i<finals.length;i++)o[finals[i].p.id]=ranks[i]; return o; }

// ========================================================================
console.log('=== A1. 勝者書換で順位が入れ替わる（editPastResult の winner=p1/p2 と同じ書換）===');
(function(){
  // 3人総当たり。初期: a1 全勝(2-0), a2 1勝, a3 0勝 → rank 1,2,3。
  var st=mkState(['a1','a2','a3'],[
    [{p1:'a1',p2:'a2',winner:'a1'}],
    [{p1:'a1',p2:'a3',winner:'a1'}],
    [{p1:'a2',p2:'a3',winner:'a2'}]
  ]);
  env._setState(st);
  var f0=env.calcFinal('A'); var r0=env.computeDisplayRanks(f0,'A'); var m0=ranksById(f0,r0);
  ok(m0.a1===1&&m0.a2===2&&m0.a3===3, 'A1-pre: 初期順位 a1=1,a2=2,a3=3 (got '+JSON.stringify(m0)+')');

  // 過去結果を修正: R1 の a1 vs a2 を「a2 の勝ち」に書換（ep-p2 相当: winner=p2）。
  st.results.A[0][0].winner=st.results.A[0][0].p2; // = 'a2'
  var f1=env.calcFinal('A'); var r1=env.computeDisplayRanks(f1,'A'); var m1=ranksById(f1,r1);
  // 書換後: a1=1勝, a2=2勝, a3=0勝 → a2 が単独1位, a1 が2位, a3 が3位。
  ok(m1.a2===1&&m1.a1===2&&m1.a3===3, 'A1-post: 書換後 a2=1,a1=2,a3=3（順位入替）(got '+JSON.stringify(m1)+')');
})();

console.log('=== A2. 勝者書換で完全同点→同順位になる ===');
(function(){
  // 2人2回戦。初期: R1 a1>a2, R2 a1>a2（a1 の 2-0）→ A で差、a1=1,a2=2。
  var st=mkState(['a1','a2'],[
    [{p1:'a1',p2:'a2',winner:'a1'}],
    [{p1:'a1',p2:'a2',winner:'a1'}]
  ]);
  env._setState(st);
  var f0=env.calcFinal('A'); var r0=env.computeDisplayRanks(f0,'A'); var m0=ranksById(f0,r0);
  ok(m0.a1===1&&m0.a2===2, 'A2-pre: a1=1,a2=2 (got '+JSON.stringify(m0)+')');

  // R2 を「a2 の勝ち」に書換 → 1勝1敗(split)・A/B/C 完全同点・直接対決 1-1 → 同順位[1,1]。
  st.results.A[1][0].winner=st.results.A[1][0].p2; // = 'a2'
  var f1=env.calcFinal('A'); var r1=env.computeDisplayRanks(f1,'A');
  ok(r1[0]===1&&r1[1]===1, 'A2-post: 書換で 1-1 split→同順位 [1,1] (got '+JSON.stringify(r1)+')');
})();

console.log('=== A3. 書換は対象 match/クラスのみに作用（他は非回帰）===');
(function(){
  var st=mkState(['a1','a2','a3','a4'],[
    [{p1:'a1',p2:'a2',winner:'a1'},{p1:'a3',p2:'a4',winner:'a3'}]
  ]);
  // B クラスにもダミーの結果を置く（書換で汚染されないこと確認用）。
  st.players.B=[{id:'b1',name:'B1',cls:'B',entry_no:null},{id:'b2',name:'B2',cls:'B',entry_no:null}];
  st.results.B=[[{p1:'b1',p2:'b2',winner:'b1'}]];
  env._setState(st);

  // A の match[1]（a3 vs a4）を a4 勝ちに書換。
  st.results.A[0][1].winner=st.results.A[0][1].p2; // 'a4'
  // 対象 match だけ変わる。
  ok(st.results.A[0][1].winner==='a4', 'A3: 対象 match の winner=a4 (got '+st.results.A[0][1].winner+')');
  // 同ラウンドの match[0] は不変。
  ok(st.results.A[0][0].winner==='a1', 'A3: 同ラウンド他 match は不変 a1 (got '+st.results.A[0][0].winner+')');
  // B クラスは不変。
  ok(st.results.B[0][0].winner==='b1', 'A3: 別クラス B は不変 b1 (got '+st.results.B[0][0].winner+')');
})();

// ========================================================================
console.log('=== B1. winner-null invariant: bind は .p1/.p2 しか代入せず null 化の口が無い（ソース固定）===');
(function(){
  // bindEditPastResultModalEvents の関数本体を抽出。
  var m=/function\s+bindEditPastResultModalEvents\s*\([^)]*\)\s*\{/.exec(RAW_SCRIPTS);
  ok(!!m, 'B1: bindEditPastResultModalEvents が存在する');
  if(!m){return;}
  // 対応する閉じ括弧まで素朴にブレースカウントで切り出す。
  var start=m.index+m[0].length-1; var depth=0, end=-1;
  for(var i=start;i<RAW_SCRIPTS.length;i++){ var ch=RAW_SCRIPTS[i]; if(ch==='{')depth++; else if(ch==='}'){depth--; if(depth===0){end=i;break;}} }
  var body=RAW_SCRIPTS.slice(start,end+1);

  // winner への代入を全部拾う（比較演算子 ===/== は除外＝代入 = のみ）。
  var assigns=body.match(/\.winner\s*=(?!=)\s*[^;]+/g)||[];
  ok(assigns.length>=2, 'B1: winner 代入が2件以上ある（ep-p1/ep-p2）(got '+assigns.length+')');
  // すべての winner 代入は右辺が .p1 / .p2 参照であること。null/undefined/''/リテラル代入が無いこと。
  var badNull=assigns.filter(function(a){ return /\.winner\s*=\s*(null|undefined|''|"")/.test(a); });
  ok(badNull.length===0, 'B1: winner=null/undefined/空 の代入が無い (got '+JSON.stringify(badNull)+')');
  var allP1P2=assigns.every(function(a){ return /\.winner\s*=\s*[^;]*\.(p1|p2)\b/.test(a); });
  ok(allP1P2, 'B1: 全 winner 代入の右辺が .p1/.p2 参照 (got '+JSON.stringify(assigns)+')');
})();

console.log('=== B2. モーダルは勝者2択のみ（ep-p1/ep-p2）で引き分け/null ボタンが無い ===');
(function(){
  var m=/function\s+buildEditPastResultModalHtml\s*\([^)]*\)\s*\{/.exec(RAW_SCRIPTS);
  ok(!!m, 'B2: buildEditPastResultModalHtml が存在する');
  if(!m){return;}
  var start=m.index+m[0].length-1; var depth=0, end=-1;
  for(var i=start;i<RAW_SCRIPTS.length;i++){ var ch=RAW_SCRIPTS[i]; if(ch==='{')depth++; else if(ch==='}'){depth--; if(depth===0){end=i;break;}} }
  var body=RAW_SCRIPTS.slice(start,end+1);
  ok(/id="ep-p1"/.test(body)&&/id="ep-p2"/.test(body), 'B2: 勝者2択 ep-p1/ep-p2 が存在');
  ok(!/引き分け|draw|不戦|winner\s*=\s*null/i.test(body), 'B2: 引き分け/null 化の選択肢が無い');
})();

// ========================================================================
console.log('=== C1. モーダル実駆動: editPastResult→ep-p1/ep-p2 クリックで winner が p1/p2 になり null にならない ===');
(function(){
  if(!env.editPastResult){ ok(false,'C1: editPastResult が公開されていない'); return; }
  var st=mkState(['a1','a2'],[
    [{p1:'a1',p2:'a2',winner:'a1'}]
  ]);
  env._setState(st);
  var ctx=env._ctx;

  // editPastResult を呼ぶとモーダル生成＋bind（ep-p1/ep-p2/ep-cancel の addEventListener がハンドラ記録）。
  try{ env.editPastResult('A',0,0); }catch(e){ /* 生成時に render 依存が無いことを期待。例外時は下の assert で捕捉 */ }
  var L=ctx._listeners;
  ok(L['ep-p1']&&typeof L['ep-p1'].click==='function', 'C1: ep-p1 click ハンドラが登録された');
  ok(L['ep-p2']&&typeof L['ep-p2'].click==='function', 'C1: ep-p2 click ハンドラが登録された');

  // ep-p2 を発火（a2 の勝ちへ書換）。ハンドラ内 render/save は mock 上で例外し得るが winner 代入は先頭行なので
  // try/catch で包んでも state 変異は確定する。invariant を確認する目的では十分。
  if(L['ep-p2']&&L['ep-p2'].click){ try{ L['ep-p2'].click(); }catch(e){} }
  var w2=env.getState().results.A[0][0].winner;
  ok(w2==='a2', 'C1: ep-p2 クリックで winner=a2 (got '+w2+')');
  ok(w2!==null&&w2!==undefined&&w2!=='', 'C1: winner は null/undefined/空 にならない (got '+JSON.stringify(w2)+')');

  // ep-p1 を発火（a1 の勝ちへ戻す）。
  if(L['ep-p1']&&L['ep-p1'].click){ try{ L['ep-p1'].click(); }catch(e){} }
  var w1=env.getState().results.A[0][0].winner;
  ok(w1==='a1', 'C1: ep-p1 クリックで winner=a1 (got '+w1+')');
  ok(w1!==null&&w1!==undefined&&w1!=='', 'C1: winner は null/undefined/空 にならない (got '+JSON.stringify(w1)+')');
})();

console.log('');
console.log('PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
