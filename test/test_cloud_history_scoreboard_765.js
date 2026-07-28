#!/usr/bin/env node
// CLOUD-HISTORY-SCOREBOARD-001 (#765): クラウド過去大会の星取表（案A・送信時スナップショット同梱）の受入テスト。
//   上り: syncTournamentToCloud が entries 成立後に tournament_snapshots へ冪等 upsert（fail-soft＝
//         snapshot 失敗でも entries 送信は成立・受入基準4）。
//   下り: buildCloudSnapshotScoreboardHtml が snapshot をローカル履歴と同経路（normalizeState →
//         buildScoreboardClassTableHtml）で星取表化。無効/欠損は ''（現行順位表へフォールバック・受入基準2）。
//   ゲスト: #760 の☁送信 冒頭ガードが効いている＝ゲスト大会は snapshot 経路に乗らないことをピン（依頼 §設計論点）。
//   実データ不使用（架空 fixture のみ）・読み取り専用。
const fs=require('fs');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},scrollTo:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(target);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { syncTournamentToCloud:syncTournamentToCloud, sendTournamentToCloud:sendTournamentToCloud,
      buildPublicLiveSnapshot:buildPublicLiveSnapshot, buildCloudSnapshotScoreboardHtml:buildCloudSnapshotScoreboardHtml,
      fetchCloudSnapshotForTournament:fetchCloudSnapshotForTournament,
      _setState:function(s){ state=s; }, _getState:function(){ return state; } };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
// mock supabase client（test_stageb_sync と同型＋select().eq() 読み取りチェーンを追加）
function makeClient(cfg){
  cfg=cfg||{}; var calls=[];
  function upsertBuilder(table,rows,opts){ var b={_sel:null};
    b.select=function(c){ this._sel=c; return this; };
    b.then=function(res,rej){ calls.push({op:'upsert',table:table,rows:rows,onConflict:opts&&opts.onConflict,select:b._sel});
      var t=cfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  function selectBuilder(table,cols){ var b={_eq:[]};
    b.eq=function(k,v){ this._eq.push([k,v]); return this; };
    b.then=function(res,rej){ calls.push({op:'select',table:table,cols:cols,eq:b._eq});
      var t=cfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  return { _calls:calls, from:function(table){ return {
    upsert:function(rows,opts){ return upsertBuilder(table,rows,opts); },
    select:function(cols){ return selectBuilder(table,cols); } }; } };
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();
function mkState(){ return { tournament_id:'t-765', rounds:2, classes:[{id:'A',name:'A',started:true}],
  players:{ A:[{id:'a1',name:'架空甲',yomi:'かくうこう',cls:'A',member_id:'m_a1',entry_no:1},{id:'a2',name:'架空乙',yomi:'かくうおつ',cls:'A',member_id:'m_a2',entry_no:2}] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}],[{p1:'a1',p2:'a2',winner:'a2'}]] },
  pairings:{ A:[] }, report:{ date:'2026-07-12', title:'七月例会' } }; }
const master={ members:[{id:'m_a1',name:'架空甲',yomi:'かくうこう'},{id:'m_a2',name:'架空乙',yomi:'かくうおつ'}] };

(async function(){
  // ---- U. 上り（送信時同梱・fail-soft）----
  env._setState(mkState());
  var cli=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} });
  var r=await env.syncTournamentToCloud(cli,master,{clubId:'club-1'});
  ok(r.ok===true&&r.snapshot_ok===true,'U1 送信成功＋snapshot_ok:true');
  var sc=cli._calls.filter(function(c){return c.table==='tournament_snapshots';})[0];
  ok(!!sc&&sc.op==='upsert'&&sc.onConflict==='tournament_id','U2 tournament_snapshots へ onConflict=tournament_id で冪等 upsert');
  ok(sc&&sc.rows&&sc.rows.tournament_id==='t-uuid'&&sc.rows.club_id==='club-1','U3 行に解決済み tournament_id(uuid)＋club_id');
  var snap=sc&&sc.rows&&sc.rows.snapshot;
  ok(snap&&snap.schema_version===1&&snap.state&&snap.state.results&&Array.isArray(snap.state.results.A)&&snap.state.results.A.length===2,
    'U4 snapshot は buildPublicLiveSnapshot 形（schema_version/回戦別 results 入り）');
  ok(snap&&snap.state.players&&snap.state.players.A[0]&&snap.state.players.A[0].name==='架空甲'&&!('member_id' in snap.state.players.A[0]),
    'U5 display_mode:full＝氏名あり・member_id 等はホワイトリスト外（wire に載らない）');
  var order=cli._calls.map(function(c){return c.table;}).join(',');
  ok(order==='members,players,tournaments,entries,tournament_snapshots','U6 snapshot upsert は entries 成立後の末尾工程 (got '+order+')');

  // snapshot upsert 失敗 → entries 送信は成立（受入基準4・fail-soft）
  env._setState(mkState());
  var cliF=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]},
    tournament_snapshots:{error:{message:'boom'}} });
  var rF=await env.syncTournamentToCloud(cliF,master,{clubId:'club-1'});
  ok(rF.ok===true&&rF.snapshot_ok===false,'U7 snapshot 失敗でも ok:true（entries 送信成立）＋snapshot_ok:false');
  ok(rF.counts&&rF.counts.entries===2,'U8 snapshot 失敗でも entries counts は成立（トースト文言の素材が保たれる）');

  // entries 失敗 → snapshot 工程に進まない（従来どおり step:'entries' fail）
  env._setState(mkState());
  var cliE=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]},
    entries:{error:{message:'x'}} });
  var rE=await env.syncTournamentToCloud(cliE,master,{clubId:'club-1'});
  ok(rE.ok===false&&rE.step==='entries','U9 entries 失敗は従来どおり step=entries');
  ok(cliE._calls.filter(function(c){return c.table==='tournament_snapshots';}).length===0,'U10 entries 失敗時 snapshot upsert は呼ばれない');

  // snapshotSource:null（snapshot が作れない）→ 送信は成立・upsert 無し
  env._setState(mkState());
  var cliN=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} });
  var rN=await env.syncTournamentToCloud(cliN,master,{clubId:'club-1',snapshotSource:null});
  ok(rN.ok===true&&rN.snapshot_ok===false&&cliN._calls.filter(function(c){return c.table==='tournament_snapshots';}).length===0,
    'U11 snapshot が作れない場合も送信成立（upsert 自体を出さない・fail-soft）');

  // ---- D. 下り（星取表描画・フォールバック）----
  env._setState(mkState());
  var snapFix=env.buildPublicLiveSnapshot(mkState(),{display_mode:'full'});
  var before=JSON.stringify(env._getState());
  var html=env.buildCloudSnapshotScoreboardHtml(snapFix);
  ok(typeof html==='string'&&html.indexOf('sb-class')>=0&&html.indexOf('sb-table')>=0,'D1 snapshot → 星取表（buildScoreboardClassTableHtml 経路）');
  ok(html.indexOf('○')>=0&&html.indexOf('×')>=0,'D2 回戦別の ○× マークが出る（回戦セルあり）');
  ok(html.indexOf('架空甲')>=0&&html.indexOf('架空乙')>=0,'D3 氏名が出る');
  ok(html.indexOf('#01')>=0&&html.indexOf('#02')>=0,'D4 相手番号（#NN・entryNoOf の2桁ゼロ詰め）が出る');
  ok(JSON.stringify(env._getState())===before,'D5 描画後も global state 不変（withSourceState 退避→復元）');
  ok(env.buildCloudSnapshotScoreboardHtml(null)===''&&env.buildCloudSnapshotScoreboardHtml({})===''&&env.buildCloudSnapshotScoreboardHtml({state:null})==='',
    'D6 snapshot 無し/不正 → 空文字（現行順位表へフォールバック＝後方互換）');
  ok(env.buildCloudSnapshotScoreboardHtml({schema_version:1,state:{classes:[],players:{},results:{}}})==='',
    'D7 参加者のいるクラスが無い snapshot も空文字（フォールバック）');

  // fetch: エラー/欠損は snapshot:null（fail-soft）
  var cliS=makeClient({ tournament_snapshots:{data:[{snapshot:snapFix}]} });
  var fr=await env.fetchCloudSnapshotForTournament(cliS,'t-uuid');
  ok(fr.ok===true&&fr.snapshot===snapFix,'D8 fetchCloudSnapshotForTournament が snapshot を返す');
  var frE=await env.fetchCloudSnapshotForTournament(makeClient({tournament_snapshots:{error:{message:'denied'}}}),'t-uuid');
  ok(frE.ok===false&&frE.snapshot===null,'D9 取得エラーは snapshot:null（順位表のみ表示へフォールバック）');
  var frN=await env.fetchCloudSnapshotForTournament(makeClient({tournament_snapshots:{data:[]}}),'t-uuid');
  ok(frN.ok===true&&frN.snapshot===null,'D10 行なし（旧大会）は snapshot:null');

  // ---- S. 静的ピン（2段構成・フォールバック無改変）----
  function extractFn(name){
    const idx=RAW.indexOf('function '+name+'(');
    if(idx<0)return null;
    let depth=0,i=RAW.indexOf('{',idx);
    for(;i<RAW.length;i++){ if(RAW[i]==='{')depth++; else if(RAW[i]==='}'){depth--; if(depth===0)return RAW.slice(idx,i+1);} }
    return null;
  }
  var det=extractFn('renderCloudTournamentDetail')||'';
  ok(det.indexOf('fetchCloudSnapshotForTournament')>=0,'S1 詳細描画が snapshot も取得する');
  ok(det.indexOf('buildCloudSnapshotScoreboardHtml')>=0&&det.indexOf('buildCloudResultBlocksHtml')>=0,
    'S2 2段構成＝星取表（上段）＋現行順位表（下段・buildCloudResultBlocksHtml 無改変呼び出し維持）');
  var blocks=extractFn('buildCloudResultBlocksHtml')||'';
  ok(blocks.indexOf('tournament_snapshots')<0&&blocks.indexOf('snapshot')<0,'S3 現行順位表ビルダーは無改変（snapshot 非依存のまま）');

  // ---- G. ゲスト大会は snapshot 経路に乗らない（#760 冒頭ガードのピン・依頼 §設計論点）----
  var gs=mkState(); gs.tournament_kind='guest';
  env._setState(gs);
  var statuses=[];
  var gr=await env.sendTournamentToCloud(function(m){statuses.push(m);});
  ok(gr&&gr.ok===false&&gr.step==='guest-mode','G1 ゲスト大会は☁送信 冒頭で遮断（{ok:false,step:guest-mode}）＝snapshot 経路に到達しない');
  ok(statuses.join('|').indexOf('ゲスト大会の結果はクラウドに送信できません')>=0,'G2 遮断は理由の説明つき');
  var send=extractFn('sendTournamentToCloud')||'';
  ok(send.indexOf("step:'guest-mode'")>=0&&send.indexOf('guest-mode')<send.indexOf('syncTournamentToCloud'),
    'G3 ガードは syncTournamentToCloud（snapshot 同梱送信）より前段');

  console.log('\nPASS='+pass+' FAIL='+fail);
  process.exit(fail>0?1:0);
})();
