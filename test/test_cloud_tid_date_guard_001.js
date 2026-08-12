#!/usr/bin/env node
// CLOUD-TID-GUARD-001 (#800 案#2): 送信先のクラウド大会と食い違う送信を、不可逆な書き込みの直前で止めるガードの受入テスト。
//   #800 の事故: 大会日を 2026-07-12 → 2026-08-01 に変えても state.tournament_id が t_2026_07_12 のまま残り、
//   upsert(onConflict:'club_id,app_tournament_id') が 7 月の大会レコードを書き換えた（7月の大会がクラウドから消えた）。
//   既存 SEND-DATE-CONFIRM-002 (#622) はローカルの日付しか見ない（実施日 8/1 は事実として正しい）ため構造的に捕まえられない。
//
//   L4 反証パネル2回目の差し戻しを受けた再設計。**判定は対称**（日付が動く送信では顔ぶれの完全一致だけを通す）。
//   前版は「送信先にいて今回いない人」だけを数える非対称判定だったため、今回が上位集合なら素通りした。
//   本テストが固定するもの:
//     P: 純関数 cloudTidDateConflict / cloudTidSendConflict / cloudTidLocalScope（DOM もネットワークも触らない）
//     X: 非対称判定で素通りしていた4ケース（高1 常連継続＋新人 / 高2 級入れ替え / 高3 昇降級 / 中2 送信先0件）
//     G: mock client で syncTournamentToCloud を叩き、衝突時に upsert が「1回も」呼ばれないこと（本命）
//     Q: 「1回送信 → 実施日を訂正 → 再送信」で鳴らないこと（R2。対称化しても偽陽性にしない）
//     L: 未連携者を「今回いない人」と呼ばないこと（高4）と、そのときの復帰導線
//     A: opts.allowDateMismatch:true なら従来どおり全部通る（逃げ道はこれ1つ・既定は安全側）
//     S: 照会が error / 読み取り非対応 client のときは fail-open（送信成立＋precheck:'skipped'）
//     F: fail-open で途中失敗したとき ⚠ 注記が出ること（R1 / Codex P1）
//     I: 暦不正な実施日は precheck:'skipped-invalid-date'（偽の「照合済み」を残さない・R9 / Codex P2）
//     N: クラウドに該当レコードが無い（新規大会）ときに余計な確認が出ない
//     D: 確認ダイアログ（断定を書かない・観測事実のみ・実在の復帰導線）
//     R: 案内した導線を実行すると tid が変わること（キーなし／キー付き日付ズレ／**キー付き日付一致**の3通り・高6）
//     K: 大会IDを取り直しても名簿の参加回数が二重計上されないこと（中7）
//     C: 中止表示が成功色（緑）にならないこと（中6）
//     T: 接続一式が無応答でも必ず resolve すること＝送信ボタンが復帰すること（高5）
//     U: ダイアログ内の UI 文言が shogi_v4.html に完全一致で実在すること（R6）
//     E: sendTournamentToCloud の通し（確認→上書き／中止・照合が未連携ガードより前に来ること＝R10）
//     W: ソース配線
//   実データ不使用（架空 fixture のみ）・読み取り専用。実クラウドへは一切出ない（mock のみ）。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
// 読込方式は近傍の既存テスト（test_cloud_history_scoreboard_765.js / test_cloud_send_unlinked_guard_001.js）に合わせる。
function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
// opt.manualTimers: setTimeout を手動発火にする（高5 のタイムアウト検証用。既定は従来どおり no-op ＝タイマーは鳴らない）。
function loadEnv(opt){
  opt=opt||{};
  var timers=[];
  var stimer=opt.manualTimers?function(fn,ms){ timers.push({fn:fn,ms:ms}); return timers.length; }:function(){ return 0; };
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),head:n('head'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},scrollTo:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  const js=extractScripts(target);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { cloudTidDateConflict:cloudTidDateConflict, cloudTidSendConflict:cloudTidSendConflict,
      cloudTidLocalScope:cloudTidLocalScope, fetchCloudTournamentDateByAppId:fetchCloudTournamentDateByAppId,
      fetchCloudTidRemoteInfo:fetchCloudTidRemoteInfo, syncTournamentToCloud:syncTournamentToCloud,
      _confirmDateMismatchBeforeSend:_confirmDateMismatchBeforeSend, _tidMismatchDialogMessage:_tidMismatchDialogMessage,
      _tidMismatchRecoverySteps:_tidMismatchRecoverySteps, _tidUnlinkedOnlyRecoverySteps:_tidUnlinkedOnlyRecoverySteps,
      _tidMismatchCancelStatus:_tidMismatchCancelStatus,
      _tidPrecheckSkippedNote:_tidPrecheckSkippedNote, _tidPrecheckFailedNote:_tidPrecheckFailedNote,
      _tidPrecheckSkipped:_tidPrecheckSkipped, classifyCloudStatusKind:classifyCloudStatusKind,
      rekeyTournamentIdInMaster:rekeyTournamentIdInMaster, applyTournamentIdRekeyToMaster:applyTournamentIdRekeyToMaster,
      loadBranchMaster:loadBranchMaster, saveBranchMaster:saveBranchMaster,
      issueOpsSharedKey:issueOpsSharedKey, applyOpsSharedKey:applyOpsSharedKey, joinOpsKeylessTournament:joinOpsKeylessTournament,
      sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver,
      _setState:function(s){ state=s; }, _getState:function(){ return state; }, _win:window };`);
  var api=fn(doc,win,ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,stimer);
  api._timerCount=function(){ return timers.length; };
  api._fireTimers=function(){ var t=timers.splice(0,timers.length); for(var i=0;i<t.length;i++){ try{ t[i].fn(); }catch(e){} } return t.length; };
  return api;
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function tick(){ return new Promise(function(r){ setImmediate(r); }); }

// mock supabase client（test_cloud_history_scoreboard_765.js と同型。select は upsert と別 cfg で返せるようにした
//   ＝precheck の読み取り結果と tournaments.upsert().select('id') の戻りを独立に組める）。
//   entries/players の select は precheck の顔ぶれ照合（fetchCloudEntriesForTournament）が使う。
function makeClient(cfg,selCfg){
  cfg=cfg||{}; selCfg=selCfg||{}; var calls=[];
  function upsertBuilder(table,rows,opts){ var b={_sel:null};
    b.select=function(c){ this._sel=c; return this; };
    b.then=function(res,rej){ calls.push({op:'upsert',table:table,rows:rows,onConflict:opts&&opts.onConflict,select:b._sel});
      var t=cfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  function selectBuilder(table,cols){ var b={_eq:[]};
    b.eq=function(k,v){ this._eq.push([k,v]); return this; };
    b.then=function(res,rej){ calls.push({op:'select',table:table,cols:cols,eq:b._eq});
      var t=selCfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  return { _calls:calls, from:function(table){ return {
    upsert:function(rows,opts){ return upsertBuilder(table,rows,opts); },
    select:function(cols){ return selectBuilder(table,cols); } }; } };
}
// 読み取り非対応 client（test_stageb_sync.js / test_a2_partial_warn.js の mock と同型＝from() が upsert しか持たない）。
function makeUpsertOnlyClient(cfg){
  cfg=cfg||{}; var calls=[];
  function upsertBuilder(table,rows,opts){ var b={_sel:null};
    b.select=function(c){ this._sel=c; return this; };
    b.then=function(res,rej){ calls.push({op:'upsert',table:table,rows:rows,onConflict:opts&&opts.onConflict,select:b._sel});
      var t=cfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  return { _calls:calls, from:function(table){ return { upsert:function(rows,opts){ return upsertBuilder(table,rows,opts); } }; } };
}
function writeCount(cli){
  var w=0, t=['members','players','tournaments','entries','tournament_snapshots'];
  for(var i=0;i<cli._calls.length;i++){ var c=cli._calls[i]; if(c.op==='upsert'&&t.indexOf(c.table)>=0)w++; }
  return w;
}
// ---- fixture ----
// 参加者定義: {mid, name, cls}。mid が null なら名簿未連携（member_id 無し）。
function mkPlayer(i,p){ var o={id:'p'+i,name:p.name,yomi:'かくう',cls:p.cls||'A',entry_no:i}; if(p.mid)o.member_id=p.mid; return o; }
function mkState(list, tid, date){
  var classes=[], seen={}, players={};
  for(var i=0;i<list.length;i++){
    var c=list[i].cls||'A';
    if(!seen[c]){ seen[c]=true; classes.push({id:c,name:c}); players[c]=[]; }
    players[c].push(mkPlayer(i+1,list[i]));
  }
  var results={}, pairings={};
  for(var k=0;k<classes.length;k++){ results[classes[k].id]=[[]]; pairings[classes[k].id]=[]; }
  return { tournament_id:tid||'t_2026_07_12', rounds:1, classes:classes, players:players,
    results:results, pairings:pairings, report:{ date:date||'2026-08-01', title:'八月例会' } };
}
function mkMaster(list){
  var ms=[];
  for(var i=0;i<list.length;i++){ if(list[i].mid)ms.push({id:list[i].mid,name:list[i].name,yomi:'かくう'}); }
  return { members:ms };
}
// クラウド側の entries/players（fetchCloudEntriesForTournament が読む形）
function cloudEntries(list){ var r=[]; for(var i=0;i<list.length;i++)r.push({'class':list[i].cls||'A',player_id:'pl_'+list[i].mid}); return r; }
function cloudPlayers(list){ var r=[]; for(var i=0;i<list.length;i++)r.push({id:'pl_'+list[i].mid,member_id:list[i].mid,members:{name:list[i].name}}); return r; }

const A1={mid:'m_a1',name:'架空甲',cls:'A'}, A2={mid:'m_a2',name:'架空乙',cls:'A'}, A3={mid:'m_a3',name:'架空丙',cls:'A'};
const J1={mid:'m_j1',name:'架空丁',cls:'A'}, J2={mid:'m_j2',name:'架空戊',cls:'A'};
const B1={mid:'m_b1',name:'架空己',cls:'B'}, B2={mid:'m_b2',name:'架空庚',cls:'B'};
const SAME=[A1,A2], JULY=[J1,J2];
const env=loadEnv();

console.log('=== P: 純関数 ===');
// P-a: cloudTidDateConflict（日付が動くかどうかの一次判定）
ok(env.cloudTidDateConflict('','2026-08-01')==='','P1 remote 無し（新規大会）→動かない');
ok(env.cloudTidDateConflict(null,'2026-08-01')==='','P2 remote=null →動かない');
ok(env.cloudTidDateConflict('2026-07-12','')==='','P3 local 空 →動かない（#622 の担当領域）');
ok(env.cloudTidDateConflict('2026-07-12','2026-02-30')==='','P4 暦に無い日付 →動かない（isValidYmd）');
ok(env.cloudTidDateConflict('2026-08-01','2026-08-01')==='','P5 同一 →動かない');
ok(env.cloudTidDateConflict('2026-07-12','2026-08-01')==='2026-07-12','P6 相違 →動く（remote を返す）');
ok(env.cloudTidDateConflict(20260712,'2026-08-01')==='','P7 remote 非文字列 →動かない（fail-open）');
// P-b: cloudTidSendConflict（対称判定）
function rem(date,list,found){ return {found:(found!==false),date:date,
  entries:(list||[]).map(function(x){return {member_id:x.mid,'class':x.cls||'A',name:x.name};})}; }
// pairs のキー組み立ては本体の _tidPairKey と同じ規則（級 + U+0001 + member_id）に合わせる。
function pairKey(cls,mid){ return String(cls)+''+String(mid); }
function loc(date,classes,list,unlinkedNames){
  var pairs=[],ids=[];
  for(var i=0;i<(list||[]).length;i++){ var x=list[i]; pairs.push(pairKey(x.cls||'A',x.mid)); if(ids.indexOf(x.mid)<0)ids.push(x.mid); }
  return {date:date,classes:classes,memberIds:ids,pairs:pairs,unlinkedNames:unlinkedNames||[]};
}
ok(env.cloudTidSendConflict(rem('2026-08-01',JULY),loc('2026-08-01',['A'],SAME))===null,
  'P8 日付が動かない→衝突なし（同一大会への冪等な再送信＝従来どおり素通り）');
ok(env.cloudTidSendConflict(rem('2026-07-12',SAME),loc('2026-08-01',['A'],SAME))===null,
  'P9 ★顔ぶれ完全一致の日付訂正→衝突なし（R2 の再現操作で鳴らない）');
var c800=env.cloudTidSendConflict(rem('2026-07-12',JULY),loc('2026-08-01',['A'],SAME));
ok(c800&&c800.missing_count===2&&c800.added_count===2&&c800.remote_count===2,
  'P10 ★別の顔ぶれ＋日付が動く→衝突（#800 の再現。いない人 2・増えた人 2）');
ok(c800&&c800.missing_names.join('・')==='架空丁・架空戊','P11 送信先にいて今回いない人の氏名を返す');
ok(env.cloudTidSendConflict(rem('2026-07-12',SAME.concat([J1])),loc('2026-08-01',['A'],SAME)).missing_count===1,
  'P12 一部だけ今回いない→その人数を数える');
ok(env.cloudTidSendConflict(rem('2026-07-12',[B1]),loc('2026-08-01',['A'],SAME))!==null,
  'P13 送信先が別級だけ→今回だけの人がいるので衝突（高2 の芽）');
ok(env.cloudTidSendConflict(rem('2026-07-12',SAME.concat([B1])),loc('2026-08-01',['A'],SAME))===null,
  'P14 ★分担運用（相手の級 B が送信先にあり、こちらは A のみ）→鳴らさない');
ok(env.cloudTidSendConflict(rem('2026-07-12',JULY,false),loc('2026-08-01',['A'],SAME))===null,
  'P15 送信先レコードが無い（新規大会）→衝突なし');
ok(env.cloudTidSendConflict(null,loc('2026-08-01',['A'],SAME))===null&&env.cloudTidSendConflict(rem('2026-07-12',JULY),null)===null,
  'P16 null 入力でも throw しない');
// P-c: cloudTidLocalScope
var scP=env.cloudTidLocalScope({tournament:{date:'2026-08-01'},skipped:['架空三'],entries:[
  {'class':'A',member_id:'m_a1'},{'class':'A',member_id:'m_a2'},{'class':'B',member_id:'m_b1'},{'class':'A',member_id:'m_a1'}]},null,null);
ok(scP.classes.join(',')==='A,B'&&scP.memberIds.join(',')==='m_a1,m_a2,m_b1'
   &&scP.pairs.join(',')===[pairKey('A','m_a1'),pairKey('A','m_a2'),pairKey('B','m_b1')].join(','),
  'P17 級・member_id・(級+member_id) の組を重複なく取り出す');
ok(scP.unlinkedNames.join(',')==='架空三','P18 payload.skipped を未連携者の氏名として持つ');
// 中3: 参加者が全員未連携の級は entries に出ないが scope には入れる
var scU=env.cloudTidLocalScope({tournament:{date:'2026-08-01'},skipped:['架空辛'],entries:[{'class':'A',member_id:'m_a1'}]},
  {classes:[{id:'A'},{id:'B'}],players:{A:[{name:'架空甲'}],B:[{name:'架空辛'}]}},null);
ok(scU.classes.indexOf('B')>=0,'P19 ★未連携者しかいない級も scope に入る（中3: 級ごと照合をすり抜けない）');
var scF=env.cloudTidLocalScope({tournament:{date:'2026-08-01'},entries:[{'class':'A',member_id:'m_a1'}]},
  {classes:[{id:'A'},{id:'B'}],players:{A:[{name:'架空甲'}],B:[{name:'架空辛'}]}},['A']);
ok(scF.classes.join(',')==='A','P20 classesFilter 指定時は対象級だけ（#567 の級絞り込みに追随）');

console.log('=== X: 非対称判定で素通りしていたケース（高1/高2/高3/中2）===');
// 高1: 7月の常連が8月も全員参加＋新人2名。前版は missing=0 で precheck:'ok' を名乗って通した。
ok(env.cloudTidSendConflict(rem('2026-07-12',SAME),loc('2026-08-01',['A'],SAME.concat([A3])))!==null,
  'X1 ★常連が全員継続参加＋新人追加→鳴る（高1: 常連クラブの最頻ケースで #800 が再発していた）');
ok(env.cloudTidSendConflict(rem('2026-07-12',SAME),loc('2026-08-01',['A'],SAME.concat([A3]))).added_count===1,
  'X2 増えた人数を数える（missing=0 でも通さない＝対称）');
// 高2: 7月はA級担当→8月はB級担当。前版は inScope=0 → missing=0 で完全に別人でも素通り。
ok(env.cloudTidSendConflict(rem('2026-07-12',JULY),loc('2026-08-01',['B'],[B1,B2]))!==null,
  'X3 ★級が1つも重ならない分担入れ替え→鳴る（高2）');
// 高3: 7月A級だった3名が8月はB級（昇降級）。前版は member_id だけ見ていたので一致扱いだった。
ok(env.cloudTidSendConflict(rem('2026-07-12',[A1,A2]),
     loc('2026-08-01',['B'],[{mid:'m_a1',name:'架空甲',cls:'B'},{mid:'m_a2',name:'架空乙',cls:'B'}]))!==null,
  'X4 ★昇降級（A→B）→鳴る（高3: 比較単位は member_id ではなく (級, member_id)）');
// 中2: 送信先の entries が0件（tournaments まで書けて entries で失敗した後の再送信がまさにこれ）。
ok(env.cloudTidSendConflict(rem('2026-07-12',[]),loc('2026-08-01',['A'],SAME))!==null,
  'X5 ★送信先の記録が0件→鳴る（中2: 前版は必ず素通りしていた）');

// resolve 漏れ（ハング）を silent PASS にしないウォッチドッグ（test_cloud_send_unlinked_guard_001.js と同型）。
var _wd=setTimeout(function(){
  console.log('  FAIL: timeout（syncTournamentToCloud の Promise が resolve されていない疑い）');
  console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+(fail+1));
  process.exit(1);
},15000);

(async function(){
  function sel(date,list){ return { tournaments:{data:[{id:'t-uuid',date:date}]},
    entries:{data:cloudEntries(list||[])}, players:{data:cloudPlayers(list||[])} }; }
  function ups(list){ var pl=[]; for(var i=0;i<(list||SAME).length;i++){ var x=(list||SAME)[i]; if(x.mid)pl.push({id:'p'+i,member_id:x.mid}); }
    return { players:{data:pl}, tournaments:{data:[{id:'t-uuid'}]} }; }

  console.log('=== G: 衝突時はクラウドへ1件も書かない（本命）===');
  env._setState(mkState(SAME));
  var cliG=makeClient(ups(),sel('2026-07-12',JULY));
  var rG=await env.syncTournamentToCloud(cliG,mkMaster(SAME),{clubId:'club-1'});
  ok(rG&&rG.ok===false&&rG.step==='date-mismatch','G1 衝突→{ok:false,step:"date-mismatch"}（throw しない＝既存契約どおり）');
  ok(rG.remote_date==='2026-07-12'&&rG.local_date==='2026-08-01'&&rG.app_tournament_id==='t_2026_07_12'
     &&rG.missing_count===2&&rG.added_count===2&&rG.remote_count===2,'G2 確認文言の材料を返す');
  ok(writeCount(cliG)===0,'G3 upsert が1回も呼ばれない (got '+writeCount(cliG)+')');
  var opsG=cliG._calls.map(function(c){return c.op+':'+c.table;}).join(',');
  ok(opsG==='select:tournaments,select:entries,select:players','G4 発行したクラウド操作は読み取りだけ (got '+opsG+')');
  ok(cliG._calls[0].cols==='id,date','G5 大会の照会は select("id,date")');
  ok(cliG._calls[0].eq.length===2&&cliG._calls[0].eq[0][0]==='club_id'&&cliG._calls[0].eq[1][0]==='app_tournament_id',
    'G6 大会の照会は eq(club_id).eq(app_tournament_id)（既存パターン流用）');

  console.log('=== Q: 「送信 → 実施日を訂正 → 再送信」で鳴らない（R2）===');
  env._setState(mkState(SAME));
  var cliQ=makeClient(ups(),sel('2026-08-05',SAME));
  var rQ=await env.syncTournamentToCloud(cliQ,mkMaster(SAME),{clubId:'club-1'});
  ok(rQ&&rQ.ok===true&&rQ.step===undefined&&rQ.precheck==='ok','Q1 ★同一大会の日付訂正は止めない');
  // 日付が動かない通常の再送信では顔ぶれを引かない（往復を増やさない）
  env._setState(mkState(SAME));
  var cliQ2=makeClient(ups(),sel('2026-08-01',SAME));
  var rQ2=await env.syncTournamentToCloud(cliQ2,mkMaster(SAME),{clubId:'club-1'});
  var selQ2=cliQ2._calls.filter(function(c){return c.op==='select';}).map(function(c){return c.table;}).join(',');
  ok(rQ2.ok===true&&selQ2==='tournaments','Q2 同日の再送信は読み取り1回だけ（entries を引かない）(got '+selQ2+')');
  // 分担運用（相手の級が送信先にある）でも鳴らない
  env._setState(mkState(SAME));
  var cliQ3=makeClient(ups(),sel('2026-08-05',SAME.concat([B1])));
  var rQ3=await env.syncTournamentToCloud(cliQ3,mkMaster(SAME),{clubId:'club-1'});
  ok(rQ3&&rQ3.ok===true,'Q3 ★分担運用（相手の級 B が送信先にある）で日付を訂正しても鳴らない');

  console.log('=== L: 未連携者を「今回いない人」と呼ばない（高4）===');
  // 今回: 架空甲(連携済) と 架空三(未連携)。送信先: 架空甲 と 架空三（過去は連携済みだった）。
  var UNL={mid:null,name:'架空三',cls:'A'};
  var REMOTE_L=[A1,{mid:'m_x3',name:'架空三',cls:'A'}];
  env._setState(mkState([A1,UNL]));
  var cliL=makeClient(ups([A1]),sel('2026-07-12',REMOTE_L));
  var rL=await env.syncTournamentToCloud(cliL,mkMaster([A1]),{clubId:'club-1'});
  ok(rL&&rL.step==='date-mismatch','L1 衝突する（送信内容と送信先が一致しない）');
  ok(rL.missing_count===0&&rL.unlinked_count===1&&rL.unlinked_names[0]==='架空三',
    'L2 ★参加者一覧にいる未連携者は missing ではなく unlinked に数える (missing='+rL.missing_count+')');
  var envL=loadEnv(); envL._setState(mkState([A1,UNL]));
  envL.__setAppModalTestResolver(function(){ return false; });
  var msgL=envL._tidMismatchDialogMessage(rL,envL._getState());
  ok(msgL.indexOf('今回の送信対象に含まれていない方')<0,'L3 ★missing 0 名のときは「含まれていません」の行を出さない');
  ok(msgL.indexOf('名簿未連携のため今回の送信に含まれない方: 1 名')>=0,'L4 未連携は専用の文言で数える');
  ok(msgL.indexOf('📋 参加者を名簿に反映')>=0&&msgL.indexOf('運営共通キーを発行')<0,
    'L5 ★未連携だけが原因なら復帰導線は「名簿に反映」（大会IDの取り直しでは解決しない）');
  ok(envL._tidMismatchCancelStatus(envL._getState(),rL).indexOf('📋 参加者を名簿に反映')>=0,
    'L6 中止 status も同じ導線');

  console.log('=== A: allowDateMismatch:true（唯一の逃げ道・明示承諾時のみ）===');
  env._setState(mkState(SAME));
  var cliA=makeClient(ups(),sel('2026-07-12',JULY));
  var rA=await env.syncTournamentToCloud(cliA,mkMaster(SAME),{clubId:'club-1',allowDateMismatch:true});
  ok(rA&&rA.ok===true&&rA.counts.entries===2,'A1 allowDateMismatch:true→従来どおり送信成立');
  var tblA=cliA._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblA==='members,players,tournaments,entries,tournament_snapshots','A2 upsert 順は従来どおり (got '+tblA+')');
  ok(cliA._calls.filter(function(c){return c.op==='select';}).length===0,'A3 承諾済みなら照会もしない');
  ok(rA.precheck==='bypassed','A4 precheck:"bypassed" が残る（監査の手掛かり）');

  console.log('=== S: 照会失敗は fail-open（当日運営を止めない）===');
  env._setState(mkState(SAME));
  var cliS=makeClient(ups(),{ tournaments:{error:{message:'network'}} });
  var rS=await env.syncTournamentToCloud(cliS,mkMaster(SAME),{clubId:'club-1'});
  ok(rS&&rS.ok===true&&rS.precheck==='skipped','S1 大会の照会 error→fail-open＋precheck:"skipped"');
  env._setState(mkState(SAME));
  var cliS2=makeClient(ups(),{ tournaments:{data:[{id:'t-uuid',date:'2026-07-12'}]}, entries:{error:{message:'rls'}} });
  var rS2=await env.syncTournamentToCloud(cliS2,mkMaster(SAME),{clubId:'club-1'});
  ok(rS2&&rS2.ok===true&&rS2.precheck==='skipped','S2 顔ぶれが読めない→判定できないので fail-open');
  env._setState(mkState(SAME));
  var cliS3=makeUpsertOnlyClient(ups());
  var rS3=await env.syncTournamentToCloud(cliS3,mkMaster(SAME),{clubId:'club-1'});
  ok(rS3&&rS3.ok===true&&rS3.precheck==='skipped','S3 読み取り非対応 client でも throw せず fail-open');
  // 照会結果の注入（中5: fail-open の _pre を渡しても再照会しない）
  env._setState(mkState(SAME));
  var cliS4=makeClient(ups(),sel('2026-07-12',JULY));
  var rS4=await env.syncTournamentToCloud(cliS4,mkMaster(SAME),{clubId:'club-1',remoteInfo:{ok:false,found:false,date:'',entries:[]}});
  ok(rS4&&rS4.ok===true&&rS4.precheck==='skipped'&&cliS4._calls.filter(function(c){return c.op==='select';}).length===0,
    'S4 ★失敗した照会結果を渡せば再照会しない（中5: 半切断で 8s+8s 待たされない）');
  var noteS=env._tidPrecheckSkippedNote();
  ok(noteS.indexOf('　')===0&&noteS.indexOf('\n')<0,'S5 注記は全角スペース始まりの1行（.cloud-status は pre-wrap なし）');
  ok(env.classifyCloudStatusKind('送信しました（名簿 2 名・結果 2 件）'+noteS)==='warn','S6 注記付き送信後メッセージは warn(橙)');
  ok(RAW.indexOf('id="cloudSendStatus" class="cloud-status" role="status" aria-live="polite" style="font-size:12px;min-height:0;text-align:center"')>=0,
    'S7 #cloudSendStatus にインライン color が無い（Codex P2）');

  console.log('=== F: fail-open で途中失敗したときの⚠注記（R1 / Codex P1）===');
  env._setState(mkState(SAME));
  var cliF=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]},
    tournaments:{data:[{id:'t-uuid'}]}, entries:{error:{message:'timeout'}} }, { tournaments:{error:{message:'network'}} });
  var rF=await env.syncTournamentToCloud(cliF,mkMaster(SAME),{clubId:'club-1'});
  ok(rF&&rF.ok===false&&rF.step==='entries'&&rF.precheck==='skipped','F1 失敗結果にも precheck:"skipped" が乗る');
  var noteF=env._tidPrecheckFailedNote();
  ok(noteF.indexOf('　')===0&&noteF.indexOf('\n')<0,'F2 失敗注記も全角スペース区切りの1行');
  ok(noteF.indexOf('既に書き換わっている可能性')>=0&&noteF.indexOf('クラウド管理ページ')>=0,'F3 既に書き換わっている可能性と確認先を書く');
  ok(env._tidPrecheckSkipped('skipped')&&env._tidPrecheckSkipped('skipped-invalid-date')
     &&!env._tidPrecheckSkipped('ok')&&!env._tidPrecheckSkipped('bypassed'),'F4 注記対象は skipped 系のみ');
  ok(env.classifyCloudStatusKind('送信に失敗しました：timeout（entries）（運営は続行できます・再送できます）'+noteF)==='err',
    'F5 注記付き失敗メッセージは err(赤)のまま');

  console.log('=== I: 暦不正な実施日（R9 / Codex P2）===');
  env._setState(mkState(SAME,'t_2026_07_12','2026-02-30'));
  var cliI=makeClient(ups(),sel('2026-07-12',JULY));
  var rI=await env.syncTournamentToCloud(cliI,mkMaster(SAME),{clubId:'club-1'});
  ok(rI&&rI.precheck==='skipped-invalid-date','I1 暦不正→precheck:"skipped-invalid-date"（"ok" を名乗らない）');
  ok(cliI._calls.filter(function(c){return c.op==='select';}).length===0,'I2 照合が成立しないので照会もしない');
  ok(env._tidPrecheckSkippedNote('skipped-invalid-date').indexOf('暦にない日付')>=0,'I3 注記は暦不正であることを書く');

  console.log('=== N: 新規大会（クラウドに該当レコード無し）は素通り ===');
  env._setState(mkState(SAME));
  var cliN=makeClient(ups(),{ tournaments:{data:[]} });
  var rN=await env.syncTournamentToCloud(cliN,mkMaster(SAME),{clubId:'club-1'});
  ok(rN&&rN.ok===true&&rN.step===undefined&&rN.precheck==='ok','N1 新規大会→date-mismatch を返さない');
  var tblN=cliN._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblN==='members,players,tournaments,entries,tournament_snapshots','N2 書き込みは従来どおり全工程');

  console.log('=== D: 確認ダイアログ（2択・既定は中止・断定を書かない）===');
  var envD=loadEnv();
  var seen=[];
  envD.__setAppModalTestResolver(function(type,message){ seen.push({type:type,message:String(message==null?'':message)}); return false; });
  envD._setState(mkState(SAME));
  var chose=null;
  var infoD={app_tournament_id:'t_2026_07_12',remote_date:'2026-07-12',local_date:'2026-08-01',
    remote_count:22,missing_count:22,missing_names:['架空丁','架空戊','架空己','架空庚'],
    unlinked_count:0,unlinked_names:[],added_count:2};
  envD._confirmDateMismatchBeforeSend(infoD,function(){ chose='overwrite'; },function(){ chose='cancel'; });
  ok(seen.length===1&&seen[0].type==='confirm','D1 appConfirm の2択1枚（新規モーダル部品を増やさない）');
  ok(chose==='cancel','D2 キャンセル応答→onCancel（中止側に倒れる）');
  var msg=seen[0].message;
  ok(msg.indexOf('t_2026_07_12')>=0&&msg.indexOf('2026-07-12')>=0&&msg.indexOf('2026-08-01')>=0,'D3 大会ID・送信先の記録日・今回の実施日を明示');
  ok(msg.indexOf('すでに 22 名の記録があります')>=0&&msg.indexOf('今回の送信対象に含まれていない方: 22 名')>=0,
    'D4 ★観測した事実（残っている件数・今回いない人数）を書く');
  ok(msg.indexOf('架空丁・架空戊・架空己')>=0&&msg.indexOf('ほか1名')>=0,'D5 3名まで例示し残りは件数（長くしない）');
  ok(msg.indexOf('今回だけ送られる方: 2 名')>=0,'D6 ★今回だけにいる人も出す（対称判定の根拠を隠さない）');
  ok(msg.indexOf('記録日は 2026-07-12 → 2026-08-01 に変わります')>=0,'D7 起きること＝記録日が変わることを書く');
  ok(msg.indexOf('混ざります')<0&&msg.indexOf('一覧から消えます')<0&&msg.indexOf('前回成績')<0,
    'D8 ★起きないことがある断定を書かない');
  ok(msg.indexOf('今日の大会に合流')<0,'D9 ★機能しない導線「今日の大会に合流」を案内しない');
  ok(msg.indexOf('参加回数')<0&&msg.indexOf('大会データを全リセット')<0,'D10 事実と違う説明と破壊的な導線を出さない');
  var envD2=loadEnv(); var chose2=null;
  envD2._setState(mkState(SAME));
  envD2.__setAppModalTestResolver(function(){ return true; });
  envD2._confirmDateMismatchBeforeSend(infoD,function(){ chose2='overwrite'; },function(){ chose2='cancel'; });
  ok(chose2==='overwrite','D11 OK 応答→onOverwrite（明示承諾のときだけ上書きへ進む）');

  console.log('=== R: 案内した導線を実行すると tid が変わる（高6・3通り）===');
  // R-a: キーなしID → 「運営共通キーを発行」
  var envR=loadEnv(); envR.__setAppModalTestResolver(function(){ return true; });
  var stR=mkState(SAME,'t_2026_07_12'); stR.cloud_sent_tid='t_2026_07_12'; envR._setState(stR);
  ok(envR._tidMismatchRecoverySteps(stR,'2026-08-01').indexOf('「運営共通キーを発行」')>=0,'R1 キーなしID→「運営共通キーを発行」を案内');
  envR.issueOpsSharedKey(function(){},function(){});
  ok(/^t_2026_08_01_\d{4}$/.test(envR._getState().tournament_id),
    'R2 ★実行すると実施日の新しい大会IDになる (got '+envR._getState().tournament_id+')');
  ok(envR._getState().players.A.length===2,'R3 参加者はそのまま残る');
  // R-b: キー付き・tid の日付が実施日とズレている → 同じ4桁で変わる
  var envR2=loadEnv(); envR2.__setAppModalTestResolver(function(){ return true; });
  var stR2=mkState(SAME,'t_2026_07_12_9116'); stR2.cloud_sent_tid='t_2026_07_12_9116'; envR2._setState(stR2);
  var stepR2=envR2._tidMismatchRecoverySteps(stR2,'2026-08-01');
  ok(stepR2.indexOf('いまと同じ4桁「9116」')>=0,'R4 キー付き・日付ズレ→「同じ4桁」を案内');
  envR2.applyOpsSharedKey('9116',function(){},function(){});
  ok(envR2._getState().tournament_id==='t_2026_08_01_9116','R5 ★実行すると新しい大会IDになる (got '+envR2._getState().tournament_id+')');
  // R-c: キー付き・tid の日付が実施日と一致 → 同じ4桁は no-op。違う4桁が正解（前版が無限ループしていたケース）
  var envR3=loadEnv(); envR3.__setAppModalTestResolver(function(){ return true; });
  var stR3=mkState(SAME,'t_2026_08_01_4821'); stR3.cloud_sent_tid='t_2026_08_01_4821'; envR3._setState(stR3);
  var stepR3=envR3._tidMismatchRecoverySteps(stR3,'2026-08-01');
  ok(stepR3.indexOf('いまと違う4桁')>=0&&stepR3.indexOf('いまと同じ4桁')<0,
    'R6 ★キー付き・日付一致→「違う4桁」を案内（「同じ4桁」は no-op＝前版の無限ループ）');
  ok(stepR3.indexOf('いまと同じ「4821」では大会IDが変わりません')>=0,'R7 変わらない理由を明示');
  var candR=/（例: (\d{4})）/.exec(stepR3);
  ok(candR&&candR[1]!=='4821','R8 衝突しない候補の4桁を1つ提示する (got '+(candR&&candR[1])+')');
  // 案内どおり「違う4桁」を入れると本当に変わる／「同じ4桁」では変わらない（実測）
  envR3.applyOpsSharedKey('4821',function(){},function(){});
  ok(envR3._getState().tournament_id==='t_2026_08_01_4821','R9 ★同じ4桁では変わらない（案内しない根拠を実測で固定）');
  envR3.applyOpsSharedKey(candR[1],function(){},function(){});
  ok(envR3._getState().tournament_id==='t_2026_08_01_'+candR[1],
    'R10 ★案内した違う4桁を入れると変わる (got '+envR3._getState().tournament_id+')');
  // 旧案内「今日の大会に合流」は #800 の状態では何も変えない（案内から外した根拠）
  var envR4=loadEnv(); envR4.__setAppModalTestResolver(function(){ return true; });
  var stR4=mkState(SAME,'t_2026_08_01'); envR4._setState(stR4);
  envR4.joinOpsKeylessTournament(function(){},function(){});
  ok(envR4._getState().tournament_id==='t_2026_08_01','R11 ★「今日の大会に合流」は既に同じIDなら何も変えない');
  // 追加 confirm の予告は、実際に出るときだけ書く（中8）
  var stR5=mkState(SAME,'t_2026_07_12'); stR5.cloud_sent_tid='t_2026_07_12';
  var stR6=mkState(SAME,'t_2026_07_12');   // 未送信＝opsRekeyNeedsConfirm は false
  ok(env._tidMismatchRecoverySteps(stR5,'2026-08-01').indexOf('確認がもう1枚出ます')>=0,'R12 送信済みなら追加 confirm を予告');
  ok(env._tidMismatchRecoverySteps(stR6,'2026-08-01').indexOf('確認がもう1枚出ます')<0,
    'R13 ★未送信なら予告しない（中8: 出ないのに予告すると案内が外れる）');

  console.log('=== K: 大会IDの取り直しで参加回数が二重計上されない（中7）===');
  ok(env.rekeyTournamentIdInMaster(null,'a','b')===0,'K1 master が無くても throw しない');
  var mK={members:[{id:'m1',tournament_ids:['t_2026_07_12'],attendance_count:1},
                   {id:'m2',tournament_ids:['t_2026_06_01','t_2026_07_12'],attendance_count:2},
                   {id:'m3',tournament_ids:['t_2026_06_01'],attendance_count:1}]};
  var nK=env.rekeyTournamentIdInMaster(mK,'t_2026_07_12','t_2026_08_01_1234');
  ok(nK===2,'K2 旧IDを持つ会員だけ書き換える (got '+nK+')');
  ok(mK.members[0].tournament_ids.join(',')==='t_2026_08_01_1234'&&mK.members[0].attendance_count===1,
    'K3 ★旧ID→新IDの置換＝1大会で +2 されない');
  ok(mK.members[2].tournament_ids.join(',')==='t_2026_06_01','K4 無関係な会員は触らない');
  var mK2={members:[{id:'m1',tournament_ids:['t_old','t_new'],attendance_count:2}]};
  env.rekeyTournamentIdInMaster(mK2,'t_old','t_new');
  ok(mK2.members[0].tournament_ids.join(',')==='t_new'&&mK2.members[0].attendance_count===1,'K5 新IDが既にあれば畳む');
  ok(env.rekeyTournamentIdInMaster(mK2,'t_new','t_new')===0,'K6 同一IDなら何もしない');
  // 通し: 「運営共通キーを発行」で tid を取り直しても参加回数が増えない
  var envK=loadEnv(); envK.__setAppModalTestResolver(function(){ return true; });
  var stK=mkState(SAME,'t_2026_07_12'); stK.cloud_sent_tid='t_2026_07_12'; envK._setState(stK);
  var masterK=envK.loadBranchMaster();
  masterK.members=[{id:'m_a1',name:'架空甲',yomi:'かくう',tournament_ids:['t_2026_07_12'],attendance_count:1}];
  envK.saveBranchMaster(masterK);
  envK.issueOpsSharedKey(function(){},function(){});
  var afterK=(envK.loadBranchMaster().members||[]).filter(function(m){return m.id==='m_a1';})[0]||{};
  ok((afterK.tournament_ids||[]).indexOf('t_2026_07_12')<0,'K7 ★取り直し後に旧IDが残らない');
  ok((afterK.tournament_ids||[]).length===1&&afterK.attendance_count===1,
    'K8 ★参加回数は1のまま（常連判定 >=5 が前倒しで立たない）(got '+JSON.stringify(afterK.tournament_ids)+')');

  console.log('=== C: 中止表示を成功色にしない（中6）===');
  ok(env.classifyCloudStatusKind('送信を中止しました　参加者登録タブ「▷ 2台で分担して入力するとき」で…')==='warn',
    'C1 ★date-mismatch の中止は warn(橙)＝成功の緑と見分けが付く');
  ok(env.classifyCloudStatusKind('送信を中止しました（「📋 参加者を名簿に反映」→ 再送信で未連携者も反映できます）')==='warn',
    'C2 未連携ガードの中止も warn');
  ok(env.classifyCloudStatusKind('送信を中止しました（報告書の日付欄で実施日を確認・修正してから再送信してください）')==='warn',
    'C3 #622 の中止も warn');
  ok(env.classifyCloudStatusKind('送信しました（名簿 2 名・結果 2 件）')==='ok','C4 成功は従来どおり ok(緑)');
  ok(env.classifyCloudStatusKind('送信に失敗しました：x')==='err','C5 失敗は従来どおり err(赤)');
  ok(RAW.indexOf('#cloudSendBtn:disabled{opacity:.5}')>=0,'C6 送信中のボタンが見た目でも押せないと分かる（中4）');

  console.log('=== E: sendTournamentToCloud の通し（確認→上書き／中止）===');
  const DLG='送信先の大会の顔ぶれが、今回の送信内容と一致しません';
  function runSend(answers,st,selOverride,upsOverride,opt){
    var E=loadEnv(opt);
    var prompts=[],unexpected=[],statuses=[];
    E.__setAppModalTestResolver(function(type,message){
      var m=String(message==null?'':message); prompts.push(m);
      if(m.indexOf('実施日')>=0&&m.indexOf('として記録します')>=0)return true;              // #622（従来どおり「はい」）
      if(m.indexOf(DLG)>=0)return answers.overwrite;
      if(m.indexOf('名簿に反映してから送信しますか')>=0)return answers.link;                // 未連携ガード1段目
      if(m.indexOf('このまま送信しますか')>=0)return answers.asis;                          // 未連携ガード2段目
      unexpected.push(m); return true;
    });
    var cli=makeClient(upsOverride||ups(),selOverride||sel('2026-07-12',JULY));
    cli.auth={ getSession:function(){ return (opt&&opt.hangAuth)?new Promise(function(){}):Promise.resolve({data:{session:{user:'u'}}}); } };
    cli.rpc=function(){ return (opt&&opt.hangRpc)?new Promise(function(){}):Promise.resolve({data:[{status:'active',club_id:'club-1'}]}); };
    E._win.SHOGI_CLOUD_CONFIG={url:'https://example.invalid',publishableKey:'pk_fake'};
    if(!(opt&&opt.hangCdn))E._win.supabase={createClient:function(){ return cli; }};
    E._setState(st||mkState(SAME));
    return {env:E,cli:cli,prompts:prompts,unexpected:unexpected,statuses:statuses,
      send:function(){ return E.sendTournamentToCloud(function(s){ statuses.push(String(s)); }); }};
  }
  function dlgCount(p){ var c=0; for(var i=0;i<p.length;i++){ if(p[i].indexOf(DLG)>=0)c++; } return c; }

  // E1: 中止（既定側）→ 1件も書かない・やり直し手順を status に出す
  var e1=runSend({overwrite:false});
  var r1=await e1.send();
  ok(dlgCount(e1.prompts)===1,'E1-1 送信ボタン経路で確認ダイアログが1回出る');
  ok(r1&&r1.ok===false&&r1.step==='cancelled-date-mismatch','E1-2 中止→step:"cancelled-date-mismatch"（exactly-once resolve）');
  ok(writeCount(e1.cli)===0,'E1-3 中止時はクラウドへ1件も書かない (got '+writeCount(e1.cli)+')');
  var st1=e1.statuses[e1.statuses.length-1]||'';
  ok(st1.indexOf('送信を中止しました')>=0&&st1.indexOf('運営共通キーを発行')>=0,'E1-4 中止 status に実在のやり直し導線');
  ok(e1.env.classifyCloudStatusKind(st1)==='warn','E1-5 ★中止 status は成功色にならない（中6）');
  ok(e1.prompts.filter(function(m){return m.indexOf('として記録します')>=0;}).length===1,'E1-6 #622 の日付 confirm は従来どおり1回（不変）');
  ok(e1.unexpected.length===0,'E1-7 想定外の confirm は出ない');

  // E2: 「それでも上書きする」→ allowDateMismatch:true で従来どおり全工程
  var e2=runSend({overwrite:true});
  var r2=await e2.send();
  ok(r2&&r2.ok===true,'E2-1 承諾→送信成立');
  ok(dlgCount(e2.prompts)===1,'E2-2 確認は1回だけ（再実行でループしない）');
  var tblE=e2.cli._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblE==='members,players,tournaments,entries,tournament_snapshots','E2-3 承諾後は従来どおり全工程 (got '+tblE+')');
  var selE=e2.cli._calls.filter(function(c){return c.op==='select';}).map(function(c){return c.table;}).join(',');
  ok(selE==='tournaments,entries,players','E2-4 照会は送信前の1組だけ（承諾後は再照会しない）(got '+selE+')');
  ok(e2.unexpected.length===0,'E2-5 想定外の confirm は出ない');

  // E3: 未連携ガードの「名簿に反映して送信」より前に止まる（R10）
  var e3=runSend({overwrite:false,link:true},mkState([A1,{mid:null,name:'架空辛',cls:'A'}]),sel('2026-07-12',JULY),ups([A1]));
  var r3=await e3.send();
  ok(r3&&r3.step==='cancelled-date-mismatch','E3-1 中止で終わる');
  ok(e3.prompts.filter(function(m){return m.indexOf('名簿に未連携の参加者')>=0;}).length===0,
    'E3-2 ★未連携ガードより前に止まる（名簿へ1文字も書かせない・R10）');
  ok(writeCount(e3.cli)===0,'E3-3 クラウドへも1件も書かない');
  ok(e3.unexpected.length===0,'E3-4 想定外の confirm は出ない');

  // E4: 衝突が無いときは未連携ガードが従来どおり出る（順序を入れ替えただけで潰していない）
  var e4=runSend({overwrite:false,link:false,asis:true},mkState([A1,{mid:null,name:'架空辛',cls:'A'}]),
    sel('2026-08-01',[A1]),ups([A1]));
  var r4=await e4.send();
  ok(dlgCount(e4.prompts)===0,'E4-1 衝突なし→date-mismatch の確認は出ない');
  ok(e4.prompts.filter(function(m){return m.indexOf('名簿に未連携の参加者')>=0;}).length===1,'E4-2 未連携ガードは従来どおり出る');
  ok(r4&&r4.ok===true,'E4-3 「このまま送信」で送信成立');
  ok(e4.unexpected.length===0,'E4-4 想定外の confirm は出ない');

  // E5: 高1 の再現を通しで（常連が全員継続＋新人1名）
  var e5=runSend({overwrite:false},mkState([A1,A2,A3]),sel('2026-07-12',SAME),ups([A1,A2,A3]));
  var r5=await e5.send();
  ok(dlgCount(e5.prompts)===1&&r5.step==='cancelled-date-mismatch',
    'E5-1 ★常連が全員継続参加＋新人追加でも通しで止まる（高1）');
  ok(writeCount(e5.cli)===0,'E5-2 クラウドへ1件も書かない');

  console.log('=== T: 接続一式が無応答でも必ず resolve する（高5）===');
  // 前版は precheck だけに期限があり、その手前（CDN 注入／getSession／rpc）で止まると resolve せず、
  //   cloudSendBtn が disabled のままリロードまで復帰しなかった。
  async function runHang(opt,label){
    var h=runSend({overwrite:false},mkState(SAME),sel('2026-07-12',JULY),ups(),
      Object.assign({manualTimers:true},opt));
    var p=h.send();
    await tick(); await tick();
    ok(h.env._timerCount()>0,label+'-a 接続一式にタイムアウトが仕掛けられている');
    h.env._fireTimers();
    var r=await p;
    ok(r&&r.ok===false,label+'-b 無応答でも Promise が resolve する＝送信ボタンが復帰できる (got '+JSON.stringify(r)+')');
    var s=h.statuses[h.statuses.length-1]||'';
    ok(s.indexOf('応答がありません')>=0,label+'-c 何が起きたか status に出る (got "'+s+'")');
    return r;
  }
  await runHang({hangAuth:true},'T1 auth.getSession 無応答');
  await runHang({hangRpc:true},'T2 claim_organizer_seat 無応答');
  await runHang({hangCdn:true},'T3 CDN 注入 無応答');
  // 送信ボタンの復帰が Promise の全経路に付いていること（配線）
  ok(RAW.indexOf('if(p&&typeof p.then===\'function\')p.then(_release,_release); else _release();')>=0,
    'T4 復帰は resolve/reject 双方に付いている');

  console.log('=== U: ダイアログの UI 文言が実在する（R6）===');
  var envU=loadEnv(); envU._setState(mkState(SAME,'t_2026_07_12'));
  var msgU=envU._tidMismatchDialogMessage({app_tournament_id:'t_2026_07_12',remote_date:'2026-07-12',
    local_date:'2026-08-01',remote_count:2,missing_count:2,missing_names:['架空丁','架空戊'],
    unlinked_count:0,unlinked_names:[],added_count:2},envU._getState());
  var uiNames=[],mU,reU=/「([^」]+)」/g;
  while((mU=reU.exec(msgU))!==null){ if(uiNames.indexOf(mU[1])<0)uiNames.push(mU[1]); }
  // 除外は (a) 大会ID (b) このダイアログ自身のボタン (c) 追加 confirm の答え。いずれも HTML には無いので別経路で実在を確かめる。
  var ownBtns=['それでも上書きする','中止','はい'];
  ok(RAW.indexOf("okText:'それでも上書きする',cancelText:'中止',danger:true")>=0,'U1 ダイアログ自身のボタン名は appConfirm へ渡す文字列と一致');
  ok(RAW.indexOf("opts.okText||(type==='confirm'?'はい':'OK')")>=0,'U2 追加 confirm の既定 OK 文言は「はい」');
  var missingUi=uiNames.filter(function(nm){ return nm.indexOf('t_')!==0&&ownBtns.indexOf(nm)<0&&RAW.indexOf('>'+nm+'<')<0; });
  ok(missingUi.length===0,'U3 ★ダイアログが名指しする UI 文言はすべて HTML に完全一致で実在する (missing: '+missingUi.join(',')+')');
  ok(msgU.indexOf('参加者登録タブ')>=0&&RAW.indexOf('id="tab-reg">参加者登録<')>=0,'U4 ★タブ名は「参加者登録」（「受付タブ」は存在しない）');
  ok(RAW.indexOf('>▷ 2台で分担して入力するとき<')>=0,'U5 折りたたみ名が summary と完全一致');
  ok(RAW.indexOf('id="opsIssueBtn"')>=0&&RAW.indexOf('>運営共通キーを発行<')>=0,'U6 「運営共通キーを発行」ボタンが実在');
  ok(RAW.indexOf('id="opsApplyBtn"')>=0&&RAW.indexOf('>このキーに合わせる<')>=0,'U7 「このキーに合わせる」ボタンが実在');
  ok(RAW.indexOf('id="saveBtn"')>=0&&RAW.indexOf('>📋 参加者を名簿に反映<')>=0,'U8 「📋 参加者を名簿に反映」ボタンが実在');
  ok(envU._tidMismatchCancelStatus(envU._getState(),null).indexOf('\n')<0,'U9 中止 status に改行を含めない');
  // 低: アプリ内ヘルプ／統合レポート案内に「受付タブ」が残っていない（本 PR が直したと主張している導線）
  ok(RAW.indexOf('受付タブの「▷ 2台で分担して入力するとき」')<0,'U10 ★ヘルプ等に「受付タブの「▷ 2台で…」」が残っていない');

  console.log('=== W: ソース配線 ===');
  ok(RAW.indexOf('function cloudTidDateConflict(')>=0&&RAW.indexOf('function cloudTidSendConflict(')>=0
     &&RAW.indexOf('function cloudTidLocalScope(')>=0,'W1 純関数3本が存在');
  ok(RAW.indexOf('function fetchCloudTidRemoteInfo(')>=0&&RAW.indexOf('function fetchCloudTournamentDateByAppId(')>=0,'W2 照会2本が存在');
  ok(RAW.indexOf(".select('id,date').eq('club_id',clubId).eq('app_tournament_id',appTid)")>=0,'W3 照会は既存パターンの流用');
  ok(RAW.indexOf('fetchCloudEntriesForTournament(client,t.id,clubId)')>=0,'W4 顔ぶれは既存 fetchCloudEntriesForTournament で引く');
  ok(RAW.indexOf('opts.allowDateMismatch===true')>=0,'W5 逃げ道は opts.allowDateMismatch===true のみ');
  ok(RAW.indexOf("step:'date-mismatch'")>=0&&RAW.indexOf("step:'cancelled-date-mismatch'")>=0,'W6 衝突・中止の契約');
  ok(RAW.indexOf("okText:'それでも上書きする',cancelText:'中止',danger:true")>=0,'W7 確認は danger:true（既定は中止）');
  ok(RAW.indexOf("else if(k===13){ if(e.preventDefault)e.preventDefault(); if(opts.danger&&type==='confirm')return; onOk(); }")>=0,
    'W8 danger confirm は Enter の既定動作ごと抑止（Codex P1）');
  ok(RAW.indexOf('if(_tidPrecheckSkipped(res.precheck))base+=_tidPrecheckSkippedNote(res.precheck)')>=0,'W9 成功トーストへ⚠注記');
  ok(RAW.indexOf('if(res&&_tidPrecheckSkipped(res.precheck))fmsg+=_tidPrecheckFailedNote()')>=0,'W10 失敗トーストへも⚠注記（R1）');
  ok(RAW.indexOf('var CLOUD_TID_PRECHECK_TIMEOUT_MS=')>=0&&RAW.indexOf('_withPrecheckTimeout(p,CLOUD_TID_PRECHECK_TIMEOUT_MS,_skip())')>=0,
    'W11 事前照会にタイムアウト');
  ok(RAW.indexOf('var CLOUD_CONNECT_TIMEOUT_MS=')>=0&&RAW.indexOf('_withPrecheckTimeout(_connectChain(),CLOUD_CONNECT_TIMEOUT_MS,')>=0,
    'W12 ★接続一式にもタイムアウト（高5）');
  ok(RAW.indexOf('cloudSendBtn.disabled=true')>=0&&RAW.indexOf('if(cloudSendBtn.disabled)return;')>=0,'W13 送信中は送信ボタンを無効化（R8）');
  ok(RAW.indexOf('if(_allowMismatch)o.allowDateMismatch=true; else if(_pre)o.remoteInfo=_pre;')>=0,
    'W14 ★照会結果は失敗分も渡して再照会しない（中5）');
  ok(RAW.indexOf('function rekeyTournamentIdInMaster(')>=0&&RAW.indexOf('applyTournamentIdRekeyToMaster(_old,tid)')>=0,
    'W15 ★大会ID取り直し時の参加回数二重計上を防ぐ（中7）');
  // 既存3ガードは分岐・文言とも不変（追加であって置換ではない）
  ok(RAW.indexOf('として記録します。違う場合は報告書の日付欄')>=0&&RAW.indexOf("resolve({ok:false,step:'cancelled-date'})")>=0,'W16 #622 は不変');
  ok(RAW.indexOf('この大会IDで全クラスを送信しますか？')>=0&&RAW.indexOf("resolve({ok:false,step:'cancelled'})")>=0,'W17 #567 は不変');
  ok(RAW.indexOf('名簿に反映してから送信しますか？')>=0&&RAW.indexOf("step:'cancelled-unlinked'")>=0
     &&RAW.indexOf('syncBranchMasterOnSave(function(){ _send(); })')>=0,'W18 未連携ガードは不変');
  // 案#1/#3/#4 には手を出さない
  ok(RAW.indexOf('function ensureTournamentId(state,master,tournamentDate){\n  if(state&&typeof state.tournament_id===\'string\'&&state.tournament_id)return state.tournament_id;')>=0,
    'W19 ensureTournamentId は無改変（案#1）');
  ok(RAW.indexOf(".from('entries').delete(")<0,'W20 entries の delete は追加していない（案#3）');
  ok(RAW.indexOf("onConflict:'tournament_id,player_id'")>=0,'W21 entries の upsert キーは不変（案#4）');
  ok(RAW.indexOf('この端末はすでに今日の大会（キーなし）に合流済みです。そのまま入力・送信してください')>=0,
    'W22 joinOpsKeylessTournament は無改変（導線として案内しないだけ・別 Issue）');

  clearTimeout(_wd);
  console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})().catch(function(e){ console.log('  FAIL: 例外: '+((e&&e.stack)||e)); console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+(fail+1)); process.exit(1); });
