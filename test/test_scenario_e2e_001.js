#!/usr/bin/env node
// SCENARIO-E2E-001: 実利用フロー統合シナリオ（回帰）
//   1大会を「クラス追加→登録→回戦数設定→ペアリング→勝敗→確定→棄権→順位確定」まで通しで走らせ、
//   さらに 過去実績(マスタ)参照・会費計算・持ち時間表示を横断検証する。
//   既存の個別ユニットテスト（test_withdraw / test_rounds_per_class 等）を、機能連動の観点で束ねた統合版。
//   WITHDRAW-001 fix の回帰pin: 途中棄権（results に棄権者が残る）後の再ペアリングで generatePairing が落ちないこと。
const fs = require('fs');
const target = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(target, 'utf8');

function scripts(){ const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m,o=''; while((m=re.exec(RAW))!==null)o+=m[1]+'\n'; return o; }
function node(){ return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},focus(){},remove(){},insertBefore(){},removeChild(){},classList:{add(){},remove(){},toggle(){},contains(){return false;}}}; }
function makeEnv(confirmVal){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),documentElement:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},location:{href:'',search:''}};
  const exposed='normalizeState,generatePairing,setWinner,submitRound,calcFinal,roundsForClass,formatTimeControl,'
    +'toggleWithdrawn,withdrawMarkHtml,addClass,getFee,isTournamentDone,getWins,normalizeMasterFeeFields,addPlayerFromMaster,__setAppModalTestResolver';
  const names=exposed.split(',');
  const ret='return {'+names.map(n=>n+':(typeof '+n+'!=="undefined"?'+n+':undefined)').join(',')+',_get:function(){return state;},_set:function(v){state=v;}};';
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';'+ret);
  const api=fn(doc,win,ls,{randomUUID:()=>'x'+Math.random().toString(16).slice(2)},()=>{},()=>!!confirmVal,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true});
  // IN-APP-MODAL-001 (#606): 棄権時の不戦勝確認が native confirm→appConfirm に移行。appConfirm を confirmVal で同期解決するよう配線＝S4 系を挙動同値のまま維持。
  if(typeof api.__setAppModalTestResolver==='function')api.__setAppModalTestResolver(function(){return !!confirmVal;});
  return api;
}

let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c){pass++;} else {fail++; fails.push(m); console.log('  FAIL: '+m);} };
function P(n){ var a=[]; for(var i=1;i<=n;i++)a.push({id:'p'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'}); return a; }
function baseState(playersA, extra){
  var s={players:{A:playersA||[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};
  if(extra)for(var k in extra)s[k]=extra[k];
  return s;
}
// 決定論的に「id番号の小さい方が勝つ」で1回戦を確定
function playAndSubmit(E,cls){
  if(!E._get().pairings[cls] || E._get().pairings[cls].length===0) E.generatePairing(cls);
  var prs=E._get().pairings[cls];
  for(var i=0;i<prs.length;i++){
    var m=prs[i];
    var w=(parseInt(m.p1.slice(1),10) <= parseInt(m.p2.slice(1),10)) ? m.p1 : m.p2;
    E.setWinner(cls,i,w);
  }
  E.submitRound(cls);
}

// ============================================================
console.log('=== S1: 大会フル進行（8人/4回戦・スイス式）===');
(function(){
  var E=makeEnv(true);
  E._set(baseState(P(8)));
  ok(E.roundsForClass('A')===4,'S1-0 既定回戦数=4');
  var guard=0;
  while(E._get().results.A.length < E.roundsForClass('A') && guard<10){ playAndSubmit(E,'A'); guard++; }
  var st=E._get();
  ok(st.results.A.length===4,'S1-1 4回戦すべて確定した');
  var finals=E.calcFinal('A');
  ok(finals.length===8,'S1-2 順位表に全8名');
  ok(finals[0].A===4,'S1-3 優勝者は全勝(4勝)');
  ok(finals[0].p.id==='p1','S1-4 最強(p1)が1位');
  var totalWins=0; for(var i=0;i<finals.length;i++) totalWins+=finals[i].A;
  ok(totalWins===16,'S1-5 総勝ち数=16（保存則）');
  var mono=true; for(var j=1;j<finals.length;j++){ if(finals[j].A>finals[j-1].A){mono=false;break;} }
  ok(mono,'S1-6 順位は勝ち数降順で単調');
  var pairSeen={}, rematch=false;
  for(var r=0;r<st.results.A.length;r++){ for(var g=0;g<st.results.A[r].length;g++){ var mm=st.results.A[r][g];
    var key=[mm.p1,mm.p2].sort().join('|'); if(pairSeen[key])rematch=true; pairSeen[key]=true; } }
  ok(!rematch,'S1-7 同一カードの再戦が無い（スイス式）');
})();

// ============================================================
console.log('=== S2: 回戦数の変更（全体既定＋クラス別上書き）===');
(function(){
  var E=makeEnv(true);
  E._set(baseState(P(6)));
  E._get().rounds=5;
  ok(E.roundsForClass('A')===5,'S2-1 全体既定を5に変更→A=5');
  ok(E.roundsForClass('B')===5,'S2-2 Bも全体既定5を継承');
  E._get().classes[0].rounds=3;
  ok(E.roundsForClass('A')===3,'S2-3 Aをクラス別3に上書き');
  ok(E.roundsForClass('B')===5,'S2-4 Bは上書きなし＝全体5のまま');
  var guard=0; while(E._get().results.A.length < E.roundsForClass('A') && guard<10){ playAndSubmit(E,'A'); guard++; }
  ok(E._get().results.A.length===3,'S2-5 上書き3回戦で確定完了');
  ok(E._get().pairings.A.length===0,'S2-6 3回戦後は新ペアリングを生成しない');
})();

// ============================================================
console.log('=== S3: クラス追加 ===');
(function(){
  var E=makeEnv(true);
  E._set(baseState(P(2)));
  var before=E._get().classes.length;
  var id=E.addClass('特別戦');
  var st=E._get();
  ok(!!id,'S3-1 addClass が新クラスIDを返す');
  ok(st.classes.length===before+1,'S3-2 クラスが1つ増える');
  var added=st.classes[st.classes.length-1];
  ok(added.name==='特別戦','S3-3 指定名で追加される');
  ok(Array.isArray(st.players[id])&&Array.isArray(st.pairings[id])&&Array.isArray(st.results[id]),'S3-4 players/pairings/results 配列が初期化される');
  ok(added.started===false,'S3-5 追加直後は未開始');
})();

// ============================================================
console.log('=== S4: 途中棄権（以降除外＋不戦勝＋順位表示＋過去成績保持・再ペアリング非クラッシュ）===');
(function(){
  var E=makeEnv(true); // confirm=YES → 相手を不戦勝
  var s=baseState(P(4),{
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]],B:[]},
    pairings:{A:[{p1:'p1',p2:'p3',winner:null,lastModifiedBy:'auto'},{p1:'p2',p2:'p4',winner:null,lastModifiedBy:'auto'}],B:[]}
  });
  E._set(s);
  E.toggleWithdrawn('p2','A');
  var st=E._get();
  ok(st.players.A[1].withdrawn===true,'S4-1 p2 に棄権フラグ');
  var pr2=st.pairings.A.filter(function(m){return m.p1==='p2'||m.p2==='p2';})[0];
  ok(pr2 && pr2.winner==='p4','S4-2 現回戦の相手(p4)が不戦勝');
  ok(st.results.A.length===1 && st.results.A[0][0].winner==='p1','S4-3 過去成績（1回戦）は保持');
  var crashed=null;
  try { E.generatePairing('A'); } catch(e){ crashed=e.message; }
  ok(crashed===null,'S4-4 棄権者が過去対局済みでも次回戦ペアリングが例外を出さない'+(crashed?'（実際: '+crashed+'）':''));
  var newpr=E._get().pairings.A;
  var hasP2=newpr.some(function(m){return m&&(m.p1==='p2'||m.p2==='p2');});
  ok(!hasP2,'S4-5 再ペアリングで棄権者(p2)を除外');
  ok(E.withdrawMarkHtml('p2','A').indexOf('棄権')>=0,'S4-6 順位表に「棄権」表示');
  ok(E.withdrawMarkHtml('p1','A')==='','S4-7 在籍者はマーク無し（既存表示不変）');
})();

// ============================================================
console.log('=== S5: 過去実績の参照（支部マスタから呼び出し＝会費区分/よみ継承）===');
(function(){
  var E=makeEnv(true);
  var st=baseState([]); E._set(st);
  var master={members:[
    {id:'m1',name:'山田花子',member:'member',grade:'josei',yomi:'やまだはなこ'},
    {id:'m2',name:'佐藤一郎',member:'other',grade:'ippan',yomi:'さとういちろう'}
  ]};
  var r1=E.addPlayerFromMaster('m1','A',master,st);
  ok(r1.success===true,'S5-1 マスタから呼び出し成功(m1)');
  ok(r1.player.member==='member'&&r1.player.grade==='josei','S5-2 会費区分(member/josei)を継承');
  ok(r1.player.yomi==='やまだはなこ','S5-3 よみをスナップショット継承（次回検索用）');
  var r2=E.addPlayerFromMaster('m2','A',master,st);
  ok(r2.success===true&&r2.player.member==='other'&&r2.player.grade==='ippan','S5-4 非支部員/一般も継承');
  ok(st.players.A.length===2,'S5-5 当日名簿に2名追加された');
  var dup=E.addPlayerFromMaster('m1','A',master,st);
  ok(dup.success===false,'S5-6 同一メンバーの二重追加を拒否');
})();

// ============================================================
console.log('=== S6: 持ち時間設定の表示（報告書文言）===');
(function(){
  var E=makeEnv(true);
  ok(E.formatTimeControl({timeType:'sudden',timeMain:25})==='25分切れ負け','S6-1 切れ負け表示');
  ok(E.formatTimeControl({timeType:'byoyomi',timeMain:30,timeByoyomi:60})==='30分（切れたら一手60秒）','S6-2 秒読み表示');
  ok(E.formatTimeControl({timeType:'sudden',timeMain:20})==='20分切れ負け','S6-3 時間変更が反映される');
  ok(E.formatTimeControl({}).indexOf('切れ負け')>=0,'S6-4 未設定は既定（切れ負け）');
})();

// ============================================================
console.log('=== S7: 会費計算（支部員×区分マトリクス）===');
(function(){
  var E=makeEnv(true);
  ok(E.getFee('member','ippan')===500,'S7-1 支部員/一般=500');
  ok(E.getFee('other','ippan')===1000,'S7-2 非支部員/一般=1000');
  ok(E.getFee('member','chu')===0,'S7-3 支部員/中学生以下=無料');
  ok(E.getFee('other','chu')===500,'S7-4 非支部員/中学生以下=500');
  ok(E.getFee('member','josei')===0,'S7-5 支部員/女性=無料');
  ok(E.getFee('other','josei')===500,'S7-6 非支部員/女性=500');
})();

// ============================================================
console.log('');
console.log('SCENARIO-E2E-001: PASS='+pass+' FAIL='+fail);
if(fail>0){ console.log('FAILED:'); fails.forEach(function(m){console.log('  - '+m);}); process.exit(1); }
process.exit(0);
