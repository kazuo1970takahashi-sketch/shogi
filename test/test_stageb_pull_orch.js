#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-3b — pullMembersFromCloud 読み取りオーケストレーション検証（mock client）。
//   観点: members を select('member_id,name,yomi,branch').eq('club_id',clubId) で取得 →
//         mergeCloudMembersIntoMaster → 変更時のみ saveBranchMaster /
//         成功 {ok:true,counts,saved} / 変更なしは saved:false 保存呼ばず /
//         fetch error は {ok:false,step:'fetch'} throw しない / client 無し→init / clubId 無し→club /
//         save 失敗→{ok:false,step:'save'} / opts.master 省略時 loadBranchMaster 使用。実データ不使用。
const fs=require('fs');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},failSet:false,getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){if(this.failSet)throw new Error('mock setItem failure');this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
const target=process.argv[2]||'shogi_v4.html';
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(target);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { pullMembersFromCloud:pullMembersFromCloud, loadBranchMaster:loadBranchMaster, saveBranchMaster:saveBranchMaster, mergeCloudMembersIntoMaster:mergeCloudMembersIntoMaster, _ls:localStorage };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
// mock supabase read client: from(t).select(cols).eq(col,val) -> thenable {data,error}
function makeReadClient(cfg){
  cfg=cfg||{}; var calls=[];
  function b(table){ var o={_sel:null,_eq:null};
    o.select=function(c){this._sel=c;return this;};
    o.eq=function(col,val){this._eq={col:col,val:val};calls.push({table:table,select:this._sel,eq:this._eq});return this;};
    o.then=function(res,rej){var t=cfg[table]||{};return Promise.resolve({data:(t.data!==undefined?t.data:[]),error:(t.error||null)}).then(res,rej);};
    return o; }
  return { _calls:calls, from:function(table){ return b(table); } };
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();
function localMaster(){ return { schema_version:1, updated_at:'2026-06-01T00:00:00.000Z', members:[
  { id:'m1', name:'山田太郎', yomi:'やまだ', last_class:'A', last_attended:'2026-05-10', first_attended:'2025-01-01', tournament_ids:['t-x'], member:'member', grade:'chu', deleted:false }
]};}
function byId(master,id){ for(var i=0;i<master.members.length;i++)if(master.members[i].id===id)return master.members[i]; return null; }

(async function(){
  console.log('=== P1: happy path（新規+更新 → 保存）===');
  var c1=makeReadClient({ members:{ data:[
    { member_id:'m1', name:'山田太郎', yomi:'やまだたろう', branch:'沼津' },
    { member_id:'m2', name:'新人花子', yomi:'しんじん', branch:'沼津' }
  ]}});
  var m1=localMaster();
  var r1=await env.pullMembersFromCloud(c1,{clubId:'club-1',master:m1});
  ok(r1.ok===true,'P1-1 ok:true');
  ok(r1.counts.fetched===2&&r1.counts.added===1&&r1.counts.updated===1,'P1-2 counts fetched=2/added=1/updated=1');
  ok(r1.saved===true,'P1-3 saved=true');
  ok(byId(m1,'m1').yomi==='やまだたろう'&&byId(m1,'m2')&&byId(m1,'m2').name==='新人花子','P1-4 master に反映');
  ok(byId(m1,'m1').last_class==='A'&&byId(m1,'m1').tournament_ids.length===1,'P1-5 運用フィールド温存');
  var sel=c1._calls[0];
  ok(sel.table==='members'&&sel.select==='member_id,name,yomi,branch','P1-6 select 列が member_id,name,yomi,branch');
  ok(sel.eq.col==='club_id'&&sel.eq.val==='club-1','P1-7 eq(club_id, clubId)');

  console.log('=== P2: 変更なし → 保存しない（saved:false）===');
  var c2=makeReadClient({ members:{ data:[ { member_id:'m1', name:'山田太郎', yomi:'やまだ', branch:null } ]}});
  var m2=localMaster();
  var r2=await env.pullMembersFromCloud(c2,{clubId:'club-1',master:m2});
  ok(r2.ok===true&&r2.saved===false,'P2-1 ok:true/saved:false');
  ok(r2.counts.added===0&&r2.counts.updated===0,'P2-2 added=0/updated=0（空クラウド値で上書きせず変化なし）');

  console.log('=== P3: fetch error → {ok:false,step:fetch} throw しない ===');
  var c3=makeReadClient({ members:{ error:{message:'permission denied'} }});
  var threw3=false,r3;
  try{ r3=await env.pullMembersFromCloud(c3,{clubId:'club-1',master:localMaster()}); }catch(e){ threw3=true; }
  ok(!threw3,'P3-1 throw しない');
  ok(r3&&r3.ok===false&&r3.step==='fetch','P3-2 {ok:false,step:fetch}');
  ok(String(r3.message).indexOf('permission denied')>=0,'P3-3 message に原因');

  console.log('=== P4/P5: ガード（client 無し / clubId 無し）===');
  var r4=await env.pullMembersFromCloud(null,{clubId:'club-1'});
  ok(r4.ok===false&&r4.step==='init','P4 client 無し→init');
  var r5=await env.pullMembersFromCloud(makeReadClient({}),{});
  ok(r5.ok===false&&r5.step==='club','P5 clubId 無し→club');

  console.log('=== P6: save 失敗 → {ok:false,step:save} ===');
  env._ls.failSet=true;
  var c6=makeReadClient({ members:{ data:[ { member_id:'mX', name:'保存太郎', yomi:'ほぞん' } ]}});
  var r6=await env.pullMembersFromCloud(c6,{clubId:'club-1',master:localMaster()});
  env._ls.failSet=false;
  ok(r6.ok===false&&r6.step==='save','P6-1 {ok:false,step:save}');
  ok(r6.counts&&r6.counts.added===1,'P6-2 取得・マージは成功（counts.added=1）');

  console.log('=== P7: 空配列 → no-op 成功 ===');
  var c7=makeReadClient({ members:{ data:[] }});
  var r7=await env.pullMembersFromCloud(c7,{clubId:'club-1',master:localMaster()});
  ok(r7.ok===true&&r7.saved===false&&r7.counts.fetched===0&&r7.counts.added===0,'P7 空配列で no-op 成功');

  console.log('=== P8: opts.master 省略 → loadBranchMaster 使用＋保存反映 ===');
  // 既存マスタを localStorage に seed
  env.saveBranchMaster({ schema_version:1, members:[ { id:'s1', name:'既存', yomi:'きそん', tournament_ids:[] } ] });
  var c8=makeReadClient({ members:{ data:[ { member_id:'s2', name:'追加', yomi:'ついか' } ]}});
  var r8=await env.pullMembersFromCloud(c8,{clubId:'club-1'});
  ok(r8.ok===true&&r8.counts.added===1&&r8.saved===true,'P8-1 loadBranchMaster 起点で追加・保存');
  var reload=env.loadBranchMaster();
  ok(byId(reload,'s1')&&byId(reload,'s2'),'P8-2 保存後 reload に既存+追加が両方残る');

  console.log('\nPASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
})();
