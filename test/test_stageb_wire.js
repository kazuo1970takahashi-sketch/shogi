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
    `${js};return { pickActiveClubId:pickActiveClubId, sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver, classifyCloudStatusKind:classifyCloudStatusKind, _setState:function(s){ state=s; } };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;});
  // IN-APP-MODAL-001: 送信前 confirm はアプリ内モーダル化済。同期解決シームで OK 固定（送信フローへ通過）。
  if(typeof env.__setAppModalTestResolver==='function')env.__setAppModalTestResolver(function(){return true;});
  return {env:env,ctx:ctx};
}
// mock supabase client
function makeClient(cfg){
  cfg=cfg||{}; var calls=[];
  function builder(table,rows,opts){var b={_sel:null};b.select=function(c){this._sel=c;return this;};
    b.then=function(res,rej){calls.push({table:table,rows:rows,onConflict:opts&&opts.onConflict});
      // NUMAZU-BEHAVIOR-001 (#840・Codex P2 PR #857 3巡目): upsert 列の**途中**を再現するフック。
      //   照合を通った後・星取表スナップショット生成前に報告書を編集する状況を作る。
      if(typeof cfg.onUpsert==='function'){ try{ cfg.onUpsert(table); }catch(e){} }
      var t=cfg.tables&&cfg.tables[table]||{};return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej);};return b;}
  return { _calls:calls,
    auth:{ getSession:function(){ return Promise.resolve({data:{session:cfg.session!==undefined?cfg.session:null}}); } },
    // NUMAZU-BEHAVIOR-001 (#840・Codex P2 PR #857 2巡目): 確認 → payload 生成の間の**非同期区間**を
    //   再現するためのフック。この区間はモーダルが閉じており、報告書タブは編集できる。
    rpc:function(name){ if(typeof cfg.onRpc==='function'){ try{ cfg.onRpc(); }catch(e){} } return Promise.resolve({data:(cfg.memberships!==undefined?cfg.memberships:[]),error:null}); },
    // CLOUD-MEMBER-ATTR-MERGE-001 (#853): 送信は upsert の前に members を**読む**ようになったため、
    //   mock も select().eq() を持つ実クライアント同型にする（無いと read が例外→⚠注記が付き、
    //   成功メッセージの分類が ok から warn に変わって D5b が落ちる＝mock の追随漏れ）。
    from:function(table){ return {
      upsert:function(rows,opts){ return builder(table,rows,opts); },
      select:function(cols){ var sb={_eq:[]};
        sb.eq=function(k,v){ this._eq.push([k,v]); return this; };
        sb.then=function(res,rej){ calls.push({op:'select',table:table,cols:cols,eq:sb._eq});
          var t=cfg.tables&&cfg.tables[table]||{};
          return Promise.resolve({data:(t.selectData!==undefined?t.selectData:[]),error:(t.selectError||null)}).then(res,rej); };
        return sb; } }; } };
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

  // ============================================================================
  // D: NUMAZU-BEHAVIOR-001 (#840・Codex P2 PR #857 2巡目)
  //    確認した内容が、送信中（loadCloudDeps / getSession / claim_organizer_seat の非同期区間）に
  //    編集されたら送信しない。buildCloudSyncPayload は payload 生成時に state.report を読み直すため、
  //    ここを守らないと「確認した名前と違う名前が共有履歴に残る」。
  // ============================================================================
  console.log('=== D: 確認後に報告書が編集されたら送信しない ===');
  var okCloud={session:{user:{}},memberships:[{status:'active',club_id:'club-1'}],
    tables:{players:{data:[{id:'p1',member_id:'m_a1'}]},tournaments:{data:[{id:'t-uuid'}]}}};

  // D1 大会名が変わった
  var d1=loadEnv(); var st1=mkState(); d1.env._setState(st1);
  var cli1=null;
  d1.ctx.window.SHOGI_CLOUD_CONFIG={url:'https://x.supabase.co',publishableKey:'sb_publishable_ok'};
  d1.ctx.window.supabase={createClient:function(){ cli1=makeClient(Object.assign({},okCloud,{onRpc:function(){ st1.report.title='別の大会名'; }})); return cli1; }};
  var msgD1=''; var rD1=await d1.env.sendTournamentToCloud(function(m){msgD1=m;});
  ok(rD1&&rD1.ok===false&&rD1.step==='changed-after-confirm','D1 大会名が変わったら step=changed-after-confirm（got '+JSON.stringify(rD1)+'）');
  ok(msgD1.indexOf('大会名')>=0&&msgD1.indexOf('六月例会')>=0&&msgD1.indexOf('別の大会名')>=0,'D1b 中止メッセージが確認時と現在の大会名を両方示す');
  ok(msgD1.indexOf('続行')>=0,'D1c 運営は続行できると案内（fail-soft）');
  ok(cli1&&cli1._calls.length===0,'D1d ★1件も upsert していない（クラウドに何も書いていない）');

  // D2 実施日が変わった（#622 の確認にも同じ穴がある＝片側だけ直さない）
  var d2=loadEnv(); var st2=mkState(); d2.env._setState(st2);
  var cli2=null;
  d2.ctx.window.SHOGI_CLOUD_CONFIG={url:'https://x.supabase.co',publishableKey:'sb_publishable_ok'};
  d2.ctx.window.supabase={createClient:function(){ cli2=makeClient(Object.assign({},okCloud,{onRpc:function(){ st2.report.date='2026-06-21'; }})); return cli2; }};
  var msgD2=''; var rD2=await d2.env.sendTournamentToCloud(function(m){msgD2=m;});
  ok(rD2&&rD2.ok===false&&rD2.step==='changed-after-confirm','D2 実施日が変わっても step=changed-after-confirm');
  ok(msgD2.indexOf('実施日')>=0&&msgD2.indexOf('2026-06-14')>=0&&msgD2.indexOf('2026-06-21')>=0,'D2b 中止メッセージが確認時と現在の実施日を両方示す');
  ok(cli2&&cli2._calls.length===0,'D2c ★1件も upsert していない');

  // D3 何も編集していなければ従来どおり送信できる（ガードが常時ブロックしていないこと）
  var d3=loadEnv(); d3.env._setState(mkState());
  setCloud(d3.ctx,okCloud);
  var msgD3=''; var rD3=await d3.env.sendTournamentToCloud(function(m){msgD3=m;});
  ok(rD3&&rD3.ok===true,'D3 編集が無ければ従来どおり成功（ガードは通常経路を止めない）');
  ok(msgD3.indexOf('送信しました')>=0,'D3b 成功ステータス');

  // D4 確認した内容がそのまま payload に載る（確認 = 送信内容）
  var d4=loadEnv(); d4.env._setState(mkState());
  var cli4=null;
  d4.ctx.window.SHOGI_CLOUD_CONFIG={url:'https://x.supabase.co',publishableKey:'sb_publishable_ok'};
  d4.ctx.window.supabase={createClient:function(){ cli4=makeClient(okCloud); return cli4; }};
  await d4.env.sendTournamentToCloud(function(){});
  var tRow=null;
  for(var di=0;di<((cli4&&cli4._calls.length)||0);di++){ if(cli4._calls[di].table==='tournaments')tRow=cli4._calls[di].rows; }
  var tName=(tRow&&(Array.isArray(tRow)?tRow[0]:tRow))?((Array.isArray(tRow)?tRow[0]:tRow).name):null;
  ok(tName==='六月例会','D4 送信された tournaments.name が確認した大会名と一致（生名・#840 で集約しない・got '+JSON.stringify(tName)+'）');

  // D5 中止ステータスは warn（橙）に分類される（Codex P2 3巡目）。
  //   「送信を中止しました」は classifyCloudStatusKind の「〜しました」分岐に落ちるため、
  //   ⚠ が無いと **送れていない送信が成功色（緑）で出る**。
  ok(d1.env.classifyCloudStatusKind(msgD1)==='warn',
     'D5 確認内容の食い違いによる中止は warn 分類（got '+d1.env.classifyCloudStatusKind(msgD1)+'）');
  ok(d1.env.classifyCloudStatusKind(msgD3)==='ok','D5b 成功は従来どおり ok 分類（分類そのものを壊していない）');

  // D6 1回の送信が作る成果物は同じ state から作る（Codex P2 3巡目）。
  //   照合を通った後・entries upsert の時点で大会名を編集しても、
  //   tournaments.name と tournament_snapshots.snapshot.meta.title が食い違わないこと。
  var d6=loadEnv(); var st6=mkState(); d6.env._setState(st6);
  var cli6=null;
  d6.ctx.window.SHOGI_CLOUD_CONFIG={url:'https://x.supabase.co',publishableKey:'sb_publishable_ok'};
  d6.ctx.window.supabase={createClient:function(){
    cli6=makeClient(Object.assign({},okCloud,{onUpsert:function(table){ if(table==='entries')st6.report.title='送信中に変えた名前'; }}));
    return cli6; }};
  var rD6=await d6.env.sendTournamentToCloud(function(){});
  ok(rD6&&rD6.ok===true,'D6 送信自体は成立する（この経路はガードで止めない）');
  var tRow6=null,snapRow6=null;
  for(var dj=0;dj<((cli6&&cli6._calls.length)||0);dj++){
    var cl=cli6._calls[dj];
    if(cl.table==='tournaments')tRow6=Array.isArray(cl.rows)?cl.rows[0]:cl.rows;
    if(cl.table==='tournament_snapshots')snapRow6=Array.isArray(cl.rows)?cl.rows[0]:cl.rows;
  }
  var snapTitle=snapRow6&&snapRow6.snapshot&&snapRow6.snapshot.meta?snapRow6.snapshot.meta.title:null;
  ok(snapRow6!==null,'D6pre 星取表スナップショットが送られている（送られていないと D6b が無意味に通る）');
  ok(tRow6&&tRow6.name==='六月例会','D6b tournaments.name は確認した名前（got '+JSON.stringify(tRow6&&tRow6.name)+'）');
  ok(snapTitle==='六月例会','D6c snapshot.meta.title も確認した名前（送信中の編集を拾わない・got '+JSON.stringify(snapTitle)+'）');
  ok(st6.report.title==='送信中に変えた名前','D6d 運営者の編集自体は state に残る（写しを取るだけで書き戻さない）');

  console.log('\nPASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
})();
