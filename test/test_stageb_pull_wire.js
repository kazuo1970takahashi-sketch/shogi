#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-3c-wire — 支部マスタ「☁ クラウドから取得」ボタンのグルー検証（mock）。
//   pickActiveClubId（純・再掲）/ ボタン静的存在＋bindMasterTabEvents 結線 /
//   pullMembersToMasterUI のガード（config無/未ログイン→auth案内/有効クラブ無→club）＋成功経路（status＋pull 反映）。
//   config+supabase を事前セットして遅延ロード（script 注入）を回避＝node 実走。実 Supabase 取得はブラウザで人手確認。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var head=n('head');
  // 実機の遅延ロード失敗（オフライン/Config 不在）を再現: script 追加時に onerror を即発火させ
  // loadCloudDeps の injof Promise を resolve(false) させる（テストが無限待機しないように）。
  head.appendChild=function(c){ if(c&&typeof c.onerror==='function'){ try{c.onerror();}catch(e){} } this.childNodes.push(c); return c; };
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { pickActiveClubId:pickActiveClubId, pullMembersToMasterUI:pullMembersToMasterUI, loadBranchMaster:loadBranchMaster, saveBranchMaster:saveBranchMaster };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;});
  return {env:env,ctx:ctx};
}
// mock supabase read client: auth.getSession / rpc(claim_organizer_seat) / from().select().eq()->thenable
function makeClient(cfg){
  cfg=cfg||{}; var calls=[];
  function b(table){ var o={_sel:null,_eq:null};
    o.select=function(c){this._sel=c;return this;};
    o.eq=function(col,val){this._eq={col:col,val:val};calls.push({table:table,select:this._sel,eq:this._eq});return this;};
    o.then=function(res,rej){var t=(cfg.tables&&cfg.tables[table])||{};return Promise.resolve({data:(t.data!==undefined?t.data:[]),error:(t.error||null)}).then(res,rej);};
    return o; }
  return { _calls:calls,
    auth:{ getSession:function(){ return Promise.resolve({data:{session:cfg.session!==undefined?cfg.session:null}}); } },
    rpc:function(name){ return Promise.resolve({data:(cfg.memberships!==undefined?cfg.memberships:[]),error:null}); },
    from:function(table){ return b(table); } };
}
function installCloud(ctx,cfg){
  ctx.window.SHOGI_CLOUD_CONFIG={url:'https://example.supabase.co',publishableKey:'pk_test_123'};
  ctx.window.supabase={createClient:function(){ return makeClient(cfg); }};
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

console.log('=== P: pickActiveClubId（純・再掲）===');
var L0=loadEnv();
ok(L0.env.pickActiveClubId([{status:'active',club_id:'c1'}])==='c1','P1 active→club_id');
ok(L0.env.pickActiveClubId([{status:'suspended',club_id:'c2'},{status:'active',club_id:'c1'}])==='c1','P2 suspended 除外');
ok(L0.env.pickActiveClubId([])===null,'P3 空→null');

console.log('=== H: ボタン静的存在＋bind ===');
ok(RAW.indexOf('id="masterCloudPullBtn"')>=0,'H1 masterCloudPullBtn が静的 HTML にある');
ok(RAW.indexOf('☁ クラウドから取得')>=0,'H2 ボタンラベル');
ok(RAW.indexOf('id="masterCloudPullStatus"')>=0,'H3 status 要素あり');
ok(/getElementById\('masterCloudPullBtn'\)[\s\S]{0,200}pullMembersToMasterUI/.test(RAW),'H4 bind→pullMembersToMasterUI 結線');

console.log('=== G: ガード（未ログイン→auth案内）===');
(async function(){
  var L1=loadEnv(); installCloud(L1.ctx,{session:null});
  var r1=await L1.env.pullMembersToMasterUI(function(){});
  ok(r1.ok===false&&r1.step==='auth','G1 未ログイン→{ok:false,step:auth}');

  // 有効クラブ無し
  var L2=loadEnv(); installCloud(L2.ctx,{session:{user:{id:'u1'}},memberships:[{status:'suspended',club_id:'c9'}]});
  var r2=await L2.env.pullMembersToMasterUI(function(){});
  ok(r2.ok===false&&r2.step==='club','G2 有効クラブ無→{ok:false,step:club}');

  console.log('=== S: 成功経路（pull 反映＋status）===');
  var L3=loadEnv(); installCloud(L3.ctx,{session:{user:{id:'u1'}},memberships:[{status:'active',club_id:'club-1'}],
    tables:{ members:{ data:[ {member_id:'mA',name:'雲取太郎',yomi:'くもとり',branch:'沼津'} ] } }});
  var statusLog=[];
  var r3=await L3.env.pullMembersToMasterUI(function(msg){statusLog.push(msg);});
  ok(r3&&r3.ok===true,'S1 成功 ok:true');
  ok(r3.counts&&r3.counts.added===1,'S2 counts.added=1');
  var fin=statusLog[statusLog.length-1]||'';
  ok(fin.indexOf('取得しました')>=0&&fin.indexOf('新規 1')>=0,'S3 status に取得結果（新規 1 名）');
  var stored=L3.env.loadBranchMaster();
  var has=false; for(var i=0;i<stored.members.length;i++)if(stored.members[i].id==='mA')has=true;
  ok(has,'S4 取得した会員が支部マスタに保存される');

  console.log('=== N: config 無し→非ブロッキング案内 ===');
  var L4=loadEnv(); // installCloud せず＝SHOGI_CLOUD_CONFIG 無し
  var r4=await L4.env.pullMembersToMasterUI(function(){});
  ok(r4.ok===false&&r4.step==='config','N1 config 無→{ok:false,step:config}（throw しない）');

  console.log('\nPASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
})();
