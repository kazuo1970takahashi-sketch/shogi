#!/usr/bin/env node
// HISTORY-CLOUD (#343): 当日アプリ「大会履歴」のクラウド過去大会セクション（①別セクション）。
//   純ビルダー（一覧/結果表）＋取得オーケストレーション（loadCloudPastTournamentsUI・mock client・fail-soft）。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
function makeCtx(){
  var el={};var head=n('head');
  head.appendChild=function(c){ if(c&&typeof c.onerror==='function'){try{c.onerror();}catch(e){}} this.childNodes.push(c); return c; };
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return {doc:doc,win:win,ls:ls,el:el};
}
function loadEnv(){
  var ctx=makeCtx();var js=extractScripts(RAW);
  var fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return {buildCloudTournamentListHtml:buildCloudTournamentListHtml,buildCloudEntriesTableHtml:buildCloudEntriesTableHtml,loadCloudPastTournamentsUI:loadCloudPastTournamentsUI,pickActiveClubId:pickActiveClubId};`);
  var env=fn(ctx.doc,ctx.win,ctx.ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'b';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;},{onLine:true});
  return {env:env,ctx:ctx};
}
function makeClient(cfg){cfg=cfg||{};
  function b(table){var o={};o.select=function(){return this;};o.eq=function(){return this;};o.then=function(res,rej){var t=(cfg.tables&&cfg.tables[table])||{};return Promise.resolve({data:(t.data!==undefined?t.data:[]),error:(t.error||null)}).then(res,rej);};return o;}
  return {auth:{getSession:function(){return Promise.resolve({data:{session:cfg.session!==undefined?cfg.session:null}});}},rpc:function(){return Promise.resolve({data:(cfg.memberships!==undefined?cfg.memberships:[]),error:null});},from:function(t){return b(t);}};
}
function installCloud(ctx,cfg){ ctx.win.SHOGI_CLOUD_CONFIG={url:'https://x.supabase.co',publishableKey:'pk'}; ctx.win.supabase={createClient:function(){return makeClient(cfg);}}; }
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

console.log('=== 純ビルダー: 大会一覧 ===');
var E=loadEnv().env;
ok(E.buildCloudTournamentListHtml([]).indexOf('過去大会がありません')>=0,'L1 空');
var lh=E.buildCloudTournamentListHtml([{id:'t1',name:'四月例会',date:'2026-04-12',season:'2026年度'},{id:'t2',name:'三月',date:'2026-03-08',season:'2025年度'}]);
ok(lh.indexOf('cloud-history-row')>=0&&lh.indexOf('data-tid="t1"')>=0,'L2 行＋data-tid');
ok(lh.indexOf('2026-04-12')<lh.indexOf('2026-03-08'),'L3 日付降順（新しい順）');

console.log('=== 純ビルダー: 結果表 ===');
ok(E.buildCloudEntriesTableHtml([]).indexOf('結果がありません')>=0,'T1 空');
var th=E.buildCloudEntriesTableHtml([
  {final_rank:2,'class':'A',wins:3,losses:1,sos:5,sodos:4,players:{members:{name:'乙',yomi:'おつ'}}},
  {final_rank:1,'class':'A',wins:4,losses:0,sos:6,sodos:6,players:{members:{name:'甲',yomi:'こう'}}}
]);
ok(th.indexOf('甲')>=0&&th.indexOf('乙')>=0,'T2 氏名表示');
ok(th.indexOf('甲')<th.indexOf('乙'),'T3 同クラスは順位昇順（甲1位→乙2位）');
ok(/<ruby>/.test(th),'T4 ふりがなルビ');

console.log('=== 取得オーケストレーション（fail-soft）===');
(async function(){
  var A=loadEnv(); installCloud(A.ctx,{session:null});
  var r1=await A.env.loadCloudPastTournamentsUI(function(){});
  ok(r1.ok===false&&r1.step==='auth','O1 未ログイン→{step:auth}');
  var B=loadEnv(); installCloud(B.ctx,{session:{user:{id:'u'}},memberships:[{status:'suspended',club_id:'c'}]});
  var r2=await B.env.loadCloudPastTournamentsUI(function(){});
  ok(r2.ok===false&&r2.step==='club','O2 有効クラブ無→{step:club}');
  var C=loadEnv(); installCloud(C.ctx,{session:{user:{id:'u'}},memberships:[{status:'active',club_id:'c1'}],tables:{tournaments:{data:[{id:'t1',name:'四月',date:'2026-04-12',season:'2026年度'}]}}});
  var r3=await C.env.loadCloudPastTournamentsUI(function(){});
  ok(r3.ok===true&&r3.tournaments.length===1,'O3 成功→tournaments 取得');
  ok((C.ctx.el['history-cloud-list']||{}).innerHTML.indexOf('cloud-history-row')>=0,'O4 一覧を #history-cloud-list に描画');

  console.log('=== 配線（RAW）===');
  ok(RAW.indexOf('id="history-cloud-load"')>=0,'W1 読み込みボタン（大会履歴内）');
  ok(/getElementById\('history-cloud-load'\)[\s\S]{0,200}loadCloudPastTournamentsUI/.test(RAW),'W2 ボタン→loadCloudPastTournamentsUI 結線');
  ok(RAW.indexOf("client.from('entries').select('final_rank,class,wins,losses,sos,sodos,players(member_id,members(name,yomi))')")>=0,'W3 entries 取得クエリ');

  console.log('HISTORY-CLOUD: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})();
