#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-2b-core — syncTournamentToCloud オーケストレーション検証（mock client）。
//   観点: upsert 順(members→players→tournaments→entries) / onConflict キー / players.select で id 解決 /
//         entries に tournament_id・player_id 解決＆member_id/app_tournament_id 除去 / 未解決は drop+count /
//         error 経路で {ok:false,step} 返し throw しない / clubId 無し / 大会ID 無し。実データ不使用。
const fs=require('fs');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
const target=process.argv[2]||'shogi_v4.html';
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(target);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { syncTournamentToCloud:syncTournamentToCloud, _setState:function(s){ state=s; } };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
// mock supabase client：upsert 呼び出しを記録、table 別に結果を返す
function makeClient(cfg){
  cfg=cfg||{}; var calls=[];
  function builder(table,rows,opts){ var b={_sel:null};
    b.select=function(c){ this._sel=c; return this; };
    b.then=function(res,rej){ calls.push({table:table,rows:rows,onConflict:opts&&opts.onConflict,select:b._sel});
      var t=cfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  return { _calls:calls, from:function(table){ return { upsert:function(rows,opts){ return builder(table,rows,opts); } }; } };
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();
function mkState(){ return { tournament_id:'t-b2', rounds:1, classes:[{id:'A',name:'A'},{id:'B',name:'B'}],
  players:{ A:[{id:'a1',name:'甲',cls:'A',member_id:'m_a1'},{id:'a2',name:'乙',cls:'A',member_id:'m_a2'}], B:[] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]], B:[] }, report:{ date:'2026-06-14', title:'六月例会' } }; }
const master={ members:[{id:'m_a1',name:'甲',yomi:'こう'},{id:'m_a2',name:'乙',yomi:'おつ'}] };

(async function(){
  // happy path
  env._setState(mkState());
  var cli=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} });
  var r=await env.syncTournamentToCloud(cli,master,{clubId:'club-1'});
  ok(r.ok===true,'H1 ok:true（送信成功）');
  ok(r.tournament_id==='t-uuid','H2 tournament_id 解決');
  ok(r.counts&&r.counts.entries===2,'H3 entries 2件');
  var tbls=cli._calls.map(function(c){return c.table;});
  ok(tbls.join(',')==='members,players,tournaments,entries','H4 upsert 順 members→players→tournaments→entries (got '+tbls.join(',')+')');
  var mc=cli._calls.filter(function(c){return c.table==='members';})[0];
  ok(mc.onConflict==='club_id,member_id','H5 members onConflict=club_id,member_id');
  var pc=cli._calls.filter(function(c){return c.table==='players';})[0];
  ok(pc.onConflict==='club_id,member_id'&&pc.select==='id,member_id','H6 players onConflict＋select(id,member_id)');
  var tc=cli._calls.filter(function(c){return c.table==='tournaments';})[0];
  ok(tc.onConflict==='club_id,app_tournament_id'&&tc.select==='id','H7 tournaments onConflict＋select(id)');
  var ec=cli._calls.filter(function(c){return c.table==='entries';})[0];
  ok(ec.onConflict==='tournament_id,player_id','H8 entries onConflict=tournament_id,player_id');
  var er=ec.rows[0];
  ok(er.tournament_id==='t-uuid'&&(er.player_id==='p1'||er.player_id==='p2'),'H9 entries 行に tournament_id/player_id を解決');
  ok(!('member_id' in er)&&!('app_tournament_id' in er),'H10 entries 行から member_id/app_tournament_id を除去');
  ok(er.club_id==='club-1'&&'sos' in er&&'sodos' in er&&'final_rank' in er,'H11 club_id/sos/sodos/final_rank を保持');

  // clubId 無し
  env._setState(mkState());
  var r2=await env.syncTournamentToCloud(makeClient({}),master,{});
  ok(r2.ok===false&&r2.step==='club','E1 clubId 無し→ok:false step=club');

  // members error
  env._setState(mkState());
  var r3=await env.syncTournamentToCloud(makeClient({members:{error:{message:'boom'}}}),master,{clubId:'c1'});
  ok(r3.ok===false&&r3.step==='members','E2 members error→step=members');

  // players error（entries 未到達）
  env._setState(mkState());
  var cliPE=makeClient({players:{error:{message:'x'}}});
  var r4=await env.syncTournamentToCloud(cliPE,master,{clubId:'c1'});
  ok(r4.ok===false&&r4.step==='players','E3 players error→step=players');
  ok(cliPE._calls.filter(function(c){return c.table==='entries';}).length===0,'E4 players 失敗時 entries は呼ばれない');

  // tournament id 取れない
  env._setState(mkState());
  var r5=await env.syncTournamentToCloud(makeClient({players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]},tournaments:{data:[]}}),master,{clubId:'c1'});
  ok(r5.ok===false&&r5.step==='tournament','E5 tournament id 無し→step=tournament');

  // 未解決 player（players select に member_id 欠落）→ drop+count
  env._setState(mkState());
  var cliU=makeClient({players:{data:[{id:'p1',member_id:'m_a1'}]},tournaments:{data:[{id:'t-uuid'}]}}); // m_a2 欠落
  var r6=await env.syncTournamentToCloud(cliU,master,{clubId:'c1'});
  ok(r6.ok===true&&r6.counts.unresolved===1&&r6.counts.entries===1,'E6 未解決 player は drop＋unresolved カウント');

  console.log('\nPASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
})();
