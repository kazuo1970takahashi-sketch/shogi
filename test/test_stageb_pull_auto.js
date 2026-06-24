#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-3c-auto — 起動時 auto-pull のグルー検証（mock）。
//   autoPullMembersOnStartup：config 検出＋既存セッション時のみ背景 pull・無音・fail-soft。
//   観点: 未ログイン→{step:auth} 無音（master 不変・status 不設定）/ セッション有＋変更→master 保存
//         （マスタ非表示なら status 不設定・表示中なら status 設定）/ config 無→{step:deps} throw なし /
//         scheduleAutoPullMembers 存在＋DOMContentLoaded 結線（静的）。実 Supabase はブラウザで人手確認。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var head=n('head');
  head.appendChild=function(c){ if(c&&typeof c.onerror==='function'){ try{c.onerror();}catch(e){} } this.childNodes.push(c); return c; };
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { autoPullMembersOnStartup:autoPullMembersOnStartup, scheduleAutoPullMembers:scheduleAutoPullMembers, loadBranchMaster:loadBranchMaster, saveBranchMaster:saveBranchMaster };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;});
  return {env:env,ctx:ctx};
}
function makeClient(cfg){
  cfg=cfg||{};
  function b(table){ var o={};
    o.select=function(){return this;};
    o.eq=function(){return this;};
    o.then=function(res,rej){var t=(cfg.tables&&cfg.tables[table])||{};return Promise.resolve({data:(t.data!==undefined?t.data:[]),error:(t.error||null)}).then(res,rej);};
    return o; }
  return { auth:{ getSession:function(){ return Promise.resolve({data:{session:cfg.session!==undefined?cfg.session:null}}); } },
    rpc:function(){ return Promise.resolve({data:(cfg.memberships!==undefined?cfg.memberships:[]),error:null}); },
    from:function(table){ return b(table); } };
}
function installCloud(ctx,cfg){
  ctx.window.SHOGI_CLOUD_CONFIG={url:'https://example.supabase.co',publishableKey:'pk_test_123'};
  ctx.window.supabase={createClient:function(){ return makeClient(cfg); }};
}
function seedMaster(env){ env.saveBranchMaster({schema_version:1,members:[{id:'old1',name:'既存',yomi:'きそん',tournament_ids:[]}]}); }
function has(master,id){ for(var i=0;i<master.members.length;i++)if(master.members[i].id===id)return true; return false; }
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

console.log('=== H: 静的（scheduleAutoPullMembers 存在＋DOMContentLoaded 結線）===');
ok(/function scheduleAutoPullMembers\(/.test(RAW),'H1 scheduleAutoPullMembers 定義あり');
ok(/DOMContentLoaded[\s\S]{0,400}scheduleAutoPullMembers\(\)/.test(RAW),'H2 DOMContentLoaded で scheduleAutoPullMembers 呼出');
ok(/function autoPullMembersOnStartup\(/.test(RAW),'H3 autoPullMembersOnStartup 定義あり');

(async function(){
  console.log('=== A: 未ログイン→無音（{step:auth}・master 不変・status 不設定）===');
  var L1=loadEnv(); seedMaster(L1.env); installCloud(L1.ctx,{session:null});
  var before=L1.env.loadBranchMaster().members.length;
  var r1=await L1.env.autoPullMembersOnStartup();
  ok(r1&&r1.ok===false&&r1.step==='auth','A1 未ログイン→{ok:false,step:auth}');
  ok(L1.env.loadBranchMaster().members.length===before,'A2 master 不変');
  ok(L1.ctx.document.getElementById('masterCloudPullStatus').textContent==='','A3 status 不設定（無音）');

  console.log('=== B: セッション有＋変更＋マスタ非表示→保存するが status 出さない ===');
  var L2=loadEnv(); seedMaster(L2.env);
  installCloud(L2.ctx,{session:{user:{id:'u1'}},memberships:[{status:'active',club_id:'club-1'}],
    tables:{ members:{ data:[ {member_id:'cloudA',name:'雲A',yomi:'くもA'} ] } }});
  // tab-master は active にしない（既定 className='' のまま）
  var r2=await L2.env.autoPullMembersOnStartup();
  ok(r2&&r2.ok===true&&r2.counts&&r2.counts.added===1,'B1 pull 成功・added=1');
  ok(has(L2.env.loadBranchMaster(),'cloudA'),'B2 master に保存される（非表示でも保存は実施）');
  ok(L2.ctx.document.getElementById('masterCloudPullStatus').textContent==='','B3 マスタ非表示なので status は出さない（無音）');

  console.log('=== C: セッション有＋変更＋マスタ表示中→保存＋status ===');
  var L3=loadEnv(); seedMaster(L3.env);
  installCloud(L3.ctx,{session:{user:{id:'u1'}},memberships:[{status:'active',club_id:'club-1'}],
    tables:{ members:{ data:[ {member_id:'cloudB',name:'雲B',yomi:'くもB'} ] } }});
  L3.ctx.document.getElementById('tab-master').className='tab active'; // マスタ表示中
  var r3=await L3.env.autoPullMembersOnStartup();
  ok(r3&&r3.ok===true&&has(L3.env.loadBranchMaster(),'cloudB'),'C1 保存される');
  var st=L3.ctx.document.getElementById('masterCloudPullStatus').textContent||'';
  ok(st.indexOf('自動取得')>=0,'C2 マスタ表示中は status に自動取得を表示');

  console.log('=== D: config 無→{step:deps} throw なし（無音）===');
  var L4=loadEnv(); seedMaster(L4.env); // installCloud せず
  var threw=false,r4;
  try{ r4=await L4.env.autoPullMembersOnStartup(); }catch(e){ threw=true; }
  ok(!threw,'D1 throw しない');
  ok(r4&&r4.ok===false&&r4.step==='deps','D2 config 無→{ok:false,step:deps}');
  ok(L4.ctx.document.getElementById('masterCloudPullStatus').textContent==='','D3 status 不設定');

  console.log('=== E: 有効クラブ無→無音（master 不変）===');
  var L5=loadEnv(); seedMaster(L5.env);
  installCloud(L5.ctx,{session:{user:{id:'u1'}},memberships:[{status:'suspended',club_id:'c9'}]});
  var b5=L5.env.loadBranchMaster().members.length;
  var r5=await L5.env.autoPullMembersOnStartup();
  ok(r5&&r5.ok===false&&r5.step==='club','E1 有効クラブ無→{step:club}');
  ok(L5.env.loadBranchMaster().members.length===b5,'E2 master 不変');

  console.log('\nPASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
})();
