#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-2b-wire — 送信ボタンのグルー検証（mock）。
//   pickActiveClubId（純）/ 「☁ クラウドへ送信」ボタン静的存在＋bindReportEvents 結線 /
//   sendTournamentToCloud のガード（未ログイン→auth案内・有効クラブ無→club）＋成功経路（status＋sync 呼出）。
//   config+supabase を事前セットして遅延ロード（script 注入）を回避＝node で実走。実 Supabase 送信はブラウザで人手確認。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var head=n('head');
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { pickActiveClubId:pickActiveClubId, sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver, _setState:function(s){ state=s; } };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;});
  // IN-APP-MODAL-001: 送信前 confirm はアプリ内モーダル化済。同期解決シームで OK 固定（送信フローへ通過）。
  if(typeof env.__setAppModalTestResolver==='function')env.__setAppModalTestResolver(function(){return true;});
  return {env:env,ctx:ctx};
}
// mock supabase client
function makeClient(cfg){
  cfg=cfg||{}; var calls=[];
  function builder(table,rows,opts){var b={_sel:null};b.select=function(c){this._sel=c;return this;};
    b.then=function(res,rej){calls.push({table:table,rows:rows,onConflict:opts&&opts.onConflict});var t=cfg.tables&&cfg.tables[table]||{};return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej);};return b;}
  return { _calls:calls,
    auth:{ getSession:function(){ return Promise.resolve({data:{session:cfg.session!==undefined?cfg.session:null}}); } },
    rpc:function(name){ return Promise.resolve({data:(cfg.memberships!==undefined?cfg.memberships:[]),error:null}); },
    from:function(table){ return { upsert:function(rows,opts){ return builder(table,rows,opts); } }; } };
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function mkState(){return{tournament_id:'t-b2',rounds:1,classes:[{id:'A',name:'A'},{id:'B',name:'B'}],players:{A:[{id:'a1',name:'甲',cls:'A',member_id:'m_a1'}],B:[]},results:{A:[[{p1:'a1',p2:'a2',winner:'a1'}]],B:[]},report:{date:'2026-06-14',title:'六月例会'}};}

console.log('=== P: pickActiveClubId（純）===');
var L=loadEnv();var E=L.env;
ok(E.pickActiveClubId([{status:'active',club_id:'c1'}])==='c1','P1 active→club_id');
ok(E.pickActiveClubId([{status:'suspended',club_id:'c2'},{status:'active',club_id:'c1'}])==='c1','P2 suspended は除外し active を採る');
ok(E.pickActiveClubId([])===null,'P3 空→null');
ok(E.pickActiveClubId([{status:'active'}])===null,'P4 club_id 無し→null');

console.log('=== H: ボタン静的存在＋bind ===');
ok(RAW.indexOf('id="cloudSendBtn"')>=0,'H1 cloudSendBtn が静的 HTML にある');
ok(RAW.indexOf('☁ クラウドへ送信')>=0,'H2 ボタンラベル');
ok(RAW.indexOf('id="cloudSendStatus"')>=0,'H3 status 表示要素');
ok(RAW.indexOf("getElementById('cloudSendBtn')")>=0 && RAW.indexOf('sendTournamentToCloud(')>=0,'H4 bindReportEvents で sendTournamentToCloud に結線');
ok(RAW.indexOf('id="cloudSendBtn"') < RAW.indexOf('id="result-list"') || RAW.indexOf('id="cloudSendBtn"')>RAW.indexOf('printResults()'),'H5 静的領域（印刷ボタン付近）に配置');

function setCloud(ctx,clientCfg){
  ctx.window.SHOGI_CLOUD_CONFIG={url:'https://x.supabase.co',publishableKey:'sb_publishable_ok'};
  ctx.window.supabase={createClient:function(){return makeClient(clientCfg);}};
}

(async function(){
  console.log('=== A: 未ログイン→ログイン案内 ===');
  var a=loadEnv(); a.env._setState(mkState()); setCloud(a.ctx,{session:null});
  var msgA=''; var rA=await a.env.sendTournamentToCloud(function(m){msgA=m;});
  ok(rA&&rA.step==='auth','A1 未ログインは step=auth');
  ok(msgA.indexOf('ログイン')>=0,'A2 ログイン案内メッセージ');

  console.log('=== C: 有効クラブ無し→club ===');
  var c=loadEnv(); c.env._setState(mkState()); setCloud(c.ctx,{session:{user:{}},memberships:[{status:'suspended',club_id:'cX'}]});
  var msgC=''; var rC=await c.env.sendTournamentToCloud(function(m){msgC=m;});
  ok(rC&&rC.step==='club','C1 有効クラブ無→step=club');

  console.log('=== S: 成功経路（session＋active club＋upsert 成功）===');
  var sx=loadEnv(); sx.env._setState(mkState());
  setCloud(sx.ctx,{session:{user:{}},memberships:[{status:'active',club_id:'club-1'}],
    tables:{players:{data:[{id:'p1',member_id:'m_a1'}]},tournaments:{data:[{id:'t-uuid'}]}}});
  var msgS=''; var rS=await sx.env.sendTournamentToCloud(function(m){msgS=m;});
  ok(rS&&rS.ok===true,'S1 ok:true（送信成功）');
  ok(msgS.indexOf('送信しました')>=0,'S2 成功ステータス（送信しました…）');
  ok(rS.counts&&rS.counts.entries===1,'S3 結果1件');

  console.log('=== F: upsert 失敗→失敗ステータス（throw しない）===');
  var fx=loadEnv(); fx.env._setState(mkState());
  setCloud(fx.ctx,{session:{user:{}},memberships:[{status:'active',club_id:'club-1'}],tables:{members:{error:{message:'boom'}}}});
  var msgF=''; var rF=await fx.env.sendTournamentToCloud(function(m){msgF=m;});
  ok(rF&&rF.ok===false&&rF.step==='members','F1 members 失敗→ok:false step=members');
  ok(msgF.indexOf('失敗')>=0&&msgF.indexOf('続行')>=0,'F2 失敗でも運営続行を案内');

  console.log('\nPASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
})();
