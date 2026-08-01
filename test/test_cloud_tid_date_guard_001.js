#!/usr/bin/env node
// CLOUD-TID-GUARD-001 (#800 案#2): 送信先のクラウド大会レコードと食い違う送信を、不可逆な書き込みの直前で止めるガードの受入テスト。
//   #800 の事故: 大会日を 2026-07-12 → 2026-08-01 に変えても state.tournament_id が t_2026_07_12 のまま残り、
//   upsert(onConflict:'club_id,app_tournament_id') が 7 月の大会レコードを書き換えた（7月の大会がクラウドから消えた）。
//   既存 SEND-DATE-CONFIRM-002 (#622) はローカルの日付しか見ない（実施日 8/1 は事実として正しい）ため構造的に捕まえられない。
//
//   L4 反証パネル（cowork 4体・Codex）の差し戻しを受けた再設計。判定の根拠は「日付が違うこと」ではなく
//   「送信先に、今回いない参加者の記録が残っていること」＝日付相違は弱い証拠にすぎない。
//   本テストが固定するもの:
//     P: 純関数 cloudTidDateConflict / cloudTidSendConflict / cloudTidLocalScope（DOM もネットワークも触らない）
//     G: mock client で syncTournamentToCloud を叩き、衝突時に members/players/tournaments/entries の
//        upsert が「1回も」呼ばれないこと（本命＝「止まったつもりで書いていた」を防ぐ）
//     Q: 追加受入基準1「1回送信 → 実施日を訂正 → 再送信」で鳴らないこと（R2 の再現）
//     A: opts.allowDateMismatch:true なら従来どおり全部通る（逃げ道はこれ1つ・既定は安全側）
//     S: 照会が error / 読み取り非対応 client のときは fail-open（送信成立＋precheck:'skipped'）
//     F: 追加受入基準3「fail-open で途中失敗したとき、⚠注記が出ること」（R1 / Codex P1）
//     I: 暦不正な実施日は precheck:'skipped-invalid-date'（偽の「照合済み」を残さない・R9 / Codex P2）
//     N: クラウドに該当レコードが無い（新規大会）ときに余計な確認が出ない
//     D: 確認ダイアログ（断定を書かない・観測事実のみ・実在の復帰導線）
//     R: 追加受入基準4「案内した導線を実行すると tid が変わる」ことを実測（R3 の再発防止）
//     U: 追加受入基準5「ダイアログ内の UI 文言が shogi_v4.html に完全一致で実在する」機械検査（R6 の再発防止）
//     E: sendTournamentToCloud の通し（確認→上書き／中止・照合が未連携ガードより前に来ること＝R10）
//     W: ソース配線
//   実データ不使用（架空 fixture のみ）・読み取り専用。実クラウドへは一切出ない（mock のみ）。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
// 読込方式は近傍の既存テスト（test_cloud_history_scoreboard_765.js / test_cloud_send_unlinked_guard_001.js）に合わせる。
function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
function loadEnv(){
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},scrollTo:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  const js=extractScripts(target);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { cloudTidDateConflict:cloudTidDateConflict, cloudTidSendConflict:cloudTidSendConflict,
      cloudTidLocalScope:cloudTidLocalScope, fetchCloudTournamentDateByAppId:fetchCloudTournamentDateByAppId,
      fetchCloudTidRemoteInfo:fetchCloudTidRemoteInfo, syncTournamentToCloud:syncTournamentToCloud,
      _confirmDateMismatchBeforeSend:_confirmDateMismatchBeforeSend, _tidMismatchDialogMessage:_tidMismatchDialogMessage,
      _tidMismatchRecoverySteps:_tidMismatchRecoverySteps, _tidMismatchCancelStatus:_tidMismatchCancelStatus,
      _tidPrecheckSkippedNote:_tidPrecheckSkippedNote, _tidPrecheckFailedNote:_tidPrecheckFailedNote,
      _tidPrecheckSkipped:_tidPrecheckSkipped, classifyCloudStatusKind:classifyCloudStatusKind,
      issueOpsSharedKey:issueOpsSharedKey, applyOpsSharedKey:applyOpsSharedKey, joinOpsKeylessTournament:joinOpsKeylessTournament,
      sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver,
      _setState:function(s){ state=s; }, _getState:function(){ return state; }, _win:window };`);
  return fn(doc,win,ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

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
// #800 の再現 fixture: 7月の大会IDを持ったまま、実施日だけ 8/1 に変えた端末。
function mkState800(){ return { tournament_id:'t_2026_07_12', rounds:1, classes:[{id:'A',name:'A'}],
  players:{ A:[{id:'a1',name:'架空甲',yomi:'かくうこう',cls:'A',member_id:'m_a1',entry_no:1},
               {id:'a2',name:'架空乙',yomi:'かくうおつ',cls:'A',member_id:'m_a2',entry_no:2}] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] }, pairings:{ A:[] },
  report:{ date:'2026-08-01', title:'八月例会' } }; }
const master={ members:[{id:'m_a1',name:'架空甲',yomi:'かくうこう'},{id:'m_a2',name:'架空乙',yomi:'かくうおつ'}] };
// クラウド側の entries（fetchCloudEntriesForTournament が返す形＝players.member_id を JS 側で埋めたもの）を
//   selCfg 用に組む。#800 では「7月の大会に出ていた別の顔ぶれ」が残っている。
function cloudEntries(list){ var rows=[]; for(var i=0;i<list.length;i++){ rows.push({'class':list[i].cls||'A',player_id:'p_'+list[i].mid}); } return rows; }
function cloudPlayers(list){ var rows=[]; for(var i=0;i<list.length;i++){ rows.push({id:'p_'+list[i].mid,member_id:list[i].mid,members:{name:list[i].name}}); } return rows; }
const JULY=[{mid:'m_j1',name:'架空丙',cls:'A'},{mid:'m_j2',name:'架空丁',cls:'A'}];
const SAME=[{mid:'m_a1',name:'架空甲',cls:'A'},{mid:'m_a2',name:'架空乙',cls:'A'}];
const env=loadEnv();

console.log('=== P: 純関数 ===');
// P-a: cloudTidDateConflict（日付が動くかどうかの一次判定・従来どおり）
ok(env.cloudTidDateConflict('','2026-08-01')==='','P1 remote 無し（クラウドに該当レコードなし＝新規大会）→動かない');
ok(env.cloudTidDateConflict(null,'2026-08-01')==='','P2 remote=null →動かない');
ok(env.cloudTidDateConflict('2026-07-12','')==='','P3 local 空 →動かない（#622 の担当領域・二重に止めない）');
ok(env.cloudTidDateConflict('2026-07-12','2026-13-99')==='','P4 local 無効な日付 →動かない');
ok(env.cloudTidDateConflict('2026-07-12','2026-02-30')==='','P5 暦に無い日付 →動かない（isValidYmd）');
ok(env.cloudTidDateConflict('2026-08-01','2026-08-01')==='','P6 同一 →動かない');
ok(env.cloudTidDateConflict('2026-07-12','2026-08-01')==='2026-07-12','P7 相違 →動く（remote を返す）');
ok(env.cloudTidDateConflict(20260712,'2026-08-01')==='','P8 remote 非文字列 →動かない（fail-open）');
// P-b: cloudTidSendConflict（止めるかどうかの最終判定＝顔ぶれで見る）
function rem(date,list,found){ return {found:(found!==false),date:date,
  entries:(list||[]).map(function(x){return {member_id:x.mid,'class':x.cls||'A',name:x.name};})}; }
function loc(date,classes,ids){ return {date:date,classes:classes,memberIds:ids}; }
ok(env.cloudTidSendConflict(rem('2026-08-01',JULY),loc('2026-08-01',['A'],['m_a1']))===null,
  'P9 日付が動かない→衝突なし（顔ぶれが違っても既存の同一大会への追記＝従来の挙動）');
ok(env.cloudTidSendConflict(rem('2026-07-12',SAME),loc('2026-08-01',['A'],['m_a1','m_a2']))===null,
  'P10 ★同じ顔ぶれの日付訂正→衝突なし（R2: #622 の案内どおり実施日を直した再送信で鳴らない）');
var c800=env.cloudTidSendConflict(rem('2026-07-12',JULY),loc('2026-08-01',['A'],['m_a1','m_a2']));
ok(c800&&c800.missing_count===2&&c800.remote_count===2&&c800.remote_date==='2026-07-12'&&c800.local_date==='2026-08-01',
  'P11 ★別の顔ぶれ＋日付が動く→衝突（#800 の再現。件数と日付を返す）');
ok(c800&&c800.missing_names.join('・')==='架空丙・架空丁','P12 今回いない人の氏名を返す（確認文言の材料）');
ok(env.cloudTidSendConflict(rem('2026-07-12',JULY.concat(SAME)),loc('2026-08-01',['A'],['m_a1','m_a2'])).missing_count===2,
  'P13 一部だけ今回いない→その人数だけを数える');
ok(env.cloudTidSendConflict(rem('2026-07-12',[{mid:'m_b1',name:'架空戊',cls:'B'}]),loc('2026-08-01',['A'],['m_a1']))===null,
  'P14 ★別級の記録は数えない（Codex: 2台分担で相手の級を毎回誤検知しない）');
ok(env.cloudTidSendConflict(rem('2026-07-12',[]),loc('2026-08-01',['A'],['m_a1']))===null,
  'P15 送信先に記録が1件も無い→衝突なし（混ざる相手がいない）');
ok(env.cloudTidSendConflict(rem('2026-07-12',JULY,false),loc('2026-08-01',['A'],['m_a1']))===null,
  'P16 送信先レコードが無い（新規大会）→衝突なし');
ok(env.cloudTidSendConflict(rem('2026-07-12',JULY),loc('2026-08-01',[],['m_a1']))!==null,
  'P17 送信級が判らない（entries 空）→全件比較＝安全側に鳴る');
ok(env.cloudTidSendConflict(null,loc('2026-08-01',['A'],[]))===null&&env.cloudTidSendConflict(rem('2026-07-12',JULY),null)===null,
  'P18 null 入力でも throw しない');
// P-c: cloudTidLocalScope（送信対象の級と member_id を payload から取る＝classesFilter に自動追随）
var sc=env.cloudTidLocalScope({tournament:{date:'2026-08-01'},entries:[
  {'class':'A',member_id:'m_a1'},{'class':'A',member_id:'m_a2'},{'class':'B',member_id:'m_b1'},{'class':'A',member_id:'m_a1'}]});
ok(sc.date==='2026-08-01'&&sc.classes.join(',')==='A,B'&&sc.memberIds.join(',')==='m_a1,m_a2,m_b1',
  'P19 級と member_id を重複なく取り出す');
ok(env.cloudTidLocalScope({tournament:{date:'2026-08-01'},entries:[]}).classes.length===0,
  'P20 entries 空→classes 空（P17 の全件比較へ倒れる）');

// resolve 漏れ（ハング）を silent PASS にしないウォッチドッグ（test_cloud_send_unlinked_guard_001.js と同型）。
var _wd=setTimeout(function(){
  console.log('  FAIL: timeout（syncTournamentToCloud の Promise が resolve されていない疑い）');
  console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+(fail+1));
  process.exit(1);
},15000);

(async function(){
  // 標準の selCfg（precheck が引く3つ）: tournaments（id,date）→ entries → players
  function sel(date,list){ return { tournaments:{data:[{id:'t-uuid',date:date}]},
    entries:{data:cloudEntries(list||[])}, players:{data:cloudPlayers(list||[])} }; }
  function ups(){ return { players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} }; }

  console.log('=== G: 衝突時はクラウドへ1件も書かない（本命）===');
  env._setState(mkState800());
  var cliG=makeClient(ups(),sel('2026-07-12',JULY));   // クラウドの t_2026_07_12 は 7/12・別の顔ぶれ
  var rG=await env.syncTournamentToCloud(cliG,master,{clubId:'club-1'});
  ok(rG&&rG.ok===false&&rG.step==='date-mismatch','G1 衝突→{ok:false,step:"date-mismatch"}（throw しない＝既存契約どおり）');
  ok(rG.remote_date==='2026-07-12'&&rG.local_date==='2026-08-01'&&rG.app_tournament_id==='t_2026_07_12'
     &&rG.missing_count===2&&rG.remote_count===2&&rG.missing_names.length===2,
    'G2 remote_date/local_date/app_tournament_id と件数・氏名を返す（確認文言の材料）');
  ok(writeCount(cliG)===0,'G3 members/players/tournaments/entries/tournament_snapshots の upsert が1回も呼ばれない (got '+writeCount(cliG)+')');
  var opsG=cliG._calls.map(function(c){return c.op+':'+c.table;}).join(',');
  ok(opsG==='select:tournaments,select:entries,select:players','G4 発行したクラウド操作は読み取りだけ (got '+opsG+')');
  var selG=cliG._calls[0];
  ok(selG.cols==='id,date','G5 大会の照会は select("id,date")（既存 fetchCloudTournamentIdByAppId と同型＋date）');
  ok(selG.eq.length===2&&selG.eq[0][0]==='club_id'&&selG.eq[0][1]==='club-1'
     &&selG.eq[1][0]==='app_tournament_id'&&selG.eq[1][1]==='t_2026_07_12',
    'G6 大会の照会は eq(club_id).eq(app_tournament_id)（既存パターン流用）');

  console.log('=== Q: 追加受入基準1「送信 → 実施日を訂正 → 再送信」で鳴らない（R2）===');
  // 送信先に残っているのは、この大会の1回目の送信そのもの（＝同じ顔ぶれ）。混ざる相手も消える大会も存在しない。
  env._setState(mkState800());
  var cliQ=makeClient(ups(),sel('2026-08-05',SAME));   // 1回目を 8/5 として送信済み → 8/1 に訂正して再送信
  var rQ=await env.syncTournamentToCloud(cliQ,master,{clubId:'club-1'});
  ok(rQ&&rQ.ok===true&&rQ.step===undefined,'Q1 ★同一大会の日付訂正は止めない（旧実装はここで毎回鳴っていた）');
  ok(rQ.precheck==='ok','Q2 precheck:"ok"（照合は成立・衝突なし）');
  var tblQ=cliQ._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblQ==='members,players,tournaments,entries,tournament_snapshots','Q3 書き込みは従来どおり全工程 (got '+tblQ+')');
  // 日付が動かない通常の再送信では顔ぶれを引かない（往復を増やさない）
  env._setState(mkState800());
  var cliQ2=makeClient(ups(),sel('2026-08-01',SAME));
  var rQ2=await env.syncTournamentToCloud(cliQ2,master,{clubId:'club-1'});
  var selQ2=cliQ2._calls.filter(function(c){return c.op==='select';}).map(function(c){return c.table;}).join(',');
  ok(rQ2.ok===true&&selQ2==='tournaments','Q4 同日の再送信は読み取り1回だけ（entries を引かない）(got '+selQ2+')');

  console.log('=== A: allowDateMismatch:true（唯一の逃げ道・明示承諾時のみ）===');
  env._setState(mkState800());
  var cliA=makeClient(ups(),sel('2026-07-12',JULY));
  var rA=await env.syncTournamentToCloud(cliA,master,{clubId:'club-1',allowDateMismatch:true});
  ok(rA&&rA.ok===true,'A1 allowDateMismatch:true→従来どおり送信成立');
  ok(rA.counts&&rA.counts.entries===2,'A2 entries 2件（従来どおり）');
  var tblA=cliA._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblA==='members,players,tournaments,entries,tournament_snapshots','A3 upsert 順は従来どおり (got '+tblA+')');
  ok(cliA._calls.filter(function(c){return c.op==='select';}).length===0,'A4 承諾済みなら照会もしない（無駄な往復を増やさない）');
  ok(rA.precheck==='bypassed','A5 承諾で通した送信は precheck:"bypassed" が残る（監査の手掛かり）');

  console.log('=== S: 照会失敗は fail-open（当日運営を止めない）===');
  env._setState(mkState800());
  var cliS=makeClient(ups(),{ tournaments:{error:{message:'network'}} });
  var rS=await env.syncTournamentToCloud(cliS,master,{clubId:'club-1'});
  ok(rS&&rS.ok===true&&rS.counts.entries===2,'S1 大会の照会 error→送信は従来どおり成立（fail-open）');
  ok(rS.precheck==='skipped','S2 結果に precheck:"skipped" が残る（黙って素通りさせない）');
  // 顔ぶれ（entries）が読めないときも判定できない＝fail-open
  env._setState(mkState800());
  var cliS1b=makeClient(ups(),{ tournaments:{data:[{id:'t-uuid',date:'2026-07-12'}]}, entries:{error:{message:'rls'}} });
  var rS1b=await env.syncTournamentToCloud(cliS1b,master,{clubId:'club-1'});
  ok(rS1b&&rS1b.ok===true&&rS1b.precheck==='skipped','S3 顔ぶれが読めない→判定できないので fail-open（precheck:"skipped"）');
  // 読み取り非対応の client（from() が upsert しか持たない）でも例外にせず fail-open
  env._setState(mkState800());
  var cliS2=makeUpsertOnlyClient(ups());
  var rS2=await env.syncTournamentToCloud(cliS2,master,{clubId:'club-1'});
  ok(rS2&&rS2.ok===true&&rS2.precheck==='skipped','S4 読み取り非対応 client でも throw せず fail-open（既存テストの mock 互換）');
  // 注記が成功トーストに載る形になっている（全角スペース区切り・'\n' を使わない）
  var noteS=env._tidPrecheckSkippedNote();
  ok(noteS.indexOf('　')===0,'S5 注記は全角スペース始まり（.cloud-status は pre-wrap なし＝"\\n" は改行にならない）');
  ok(noteS.indexOf('\n')<0,'S6 注記に改行を含めない（_unlinkedSkippedNote と同方式）');
  ok(noteS.indexOf('⚠')>=0&&noteS.indexOf('省略')>=0,'S7 注記は⚠付きでガードを省略した旨を明示');
  ok(env.classifyCloudStatusKind('送信しました（名簿 2 名・結果 2 件）'+noteS)==='warn','S8 注記付き送信後メッセージは warn(橙)');
  ok(RAW.indexOf('id="cloudSendStatus" class="cloud-status" role="status" aria-live="polite" style="font-size:12px;min-height:0;text-align:center"')>=0,
    'S9 #cloudSendStatus にインライン color が無い（Codex P2: warn/err 色がインライン指定に負けて紺のままにならない）');

  console.log('=== F: 追加受入基準3 fail-open で途中失敗したときの⚠注記（R1 / Codex P1）===');
  // 照会は error（fail-open）→ members/players/tournaments は成功 → entries で失敗。
  //   送信先の大会日は既に書き換わっているのに、旧実装は赤い「送信に失敗しました」しか出さなかった。
  env._setState(mkState800());
  var cliF=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]},
    tournaments:{data:[{id:'t-uuid'}]}, entries:{error:{message:'timeout'}} }, { tournaments:{error:{message:'network'}} });
  var rF=await env.syncTournamentToCloud(cliF,master,{clubId:'club-1'});
  ok(rF&&rF.ok===false&&rF.step==='entries'&&rF.precheck==='skipped','F1 失敗結果にも precheck:"skipped" が乗る');
  var noteF=env._tidPrecheckFailedNote();
  ok(noteF.indexOf('　')===0&&noteF.indexOf('\n')<0,'F2 失敗注記も全角スペース区切りの1行');
  ok(noteF.indexOf('既に書き換わっている可能性')>=0&&noteF.indexOf('クラウド管理ページ')>=0,
    'F3 「確認を省略しました」で終わらせず、既に書き換わっている可能性と確認先を書く');
  ok(env._tidPrecheckSkipped('skipped')&&env._tidPrecheckSkipped('skipped-invalid-date')
     &&!env._tidPrecheckSkipped('ok')&&!env._tidPrecheckSkipped('bypassed'),'F4 注記対象は skipped 系のみ');
  ok(env.classifyCloudStatusKind('送信に失敗しました：timeout（entries）（運営は続行できます・再送できます）'+noteF)==='err',
    'F5 注記付き失敗メッセージは err(赤)のまま（⚠注記を足しても警告色が弱まらない）');

  console.log('=== I: 暦不正な実施日は偽の「照合済み」を残さない（R9 / Codex P2）===');
  var st900=mkState800(); st900.report.date='2026-02-30';
  env._setState(st900);
  var cliI=makeClient(ups(),sel('2026-07-12',JULY));
  var rI=await env.syncTournamentToCloud(cliI,master,{clubId:'club-1'});
  ok(rI&&rI.precheck==='skipped-invalid-date','I1 暦不正→precheck:"skipped-invalid-date"（"ok" を名乗らない）');
  ok(cliI._calls.filter(function(c){return c.op==='select';}).length===0,'I2 照合が成立しないので照会もしない');
  ok(env._tidPrecheckSkippedNote('skipped-invalid-date').indexOf('暦にない日付')>=0,'I3 注記は暦不正であることを書く');

  console.log('=== N: 新規大会（クラウドに該当レコード無し）は素通り ===');
  env._setState(mkState800());
  var cliN=makeClient(ups(),{ tournaments:{data:[]} });
  var rN=await env.syncTournamentToCloud(cliN,master,{clubId:'club-1'});
  ok(rN&&rN.ok===true&&rN.step===undefined,'N1 新規大会→date-mismatch を返さない（余計な確認は出ない）');
  ok(rN.precheck==='ok','N2 precheck:"ok"（照会は成立・衝突なし）＝トーストに注記は付かない');
  var tblN=cliN._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblN==='members,players,tournaments,entries,tournament_snapshots','N3 書き込みは従来どおり全工程 (got '+tblN+')');

  console.log('=== D: 確認ダイアログ（appConfirm 2択・既定は中止・断定を書かない）===');
  var envD=loadEnv();
  var seen=[];
  envD.__setAppModalTestResolver(function(type,message){ seen.push({type:type,message:String(message==null?'':message)}); return false; });
  envD._setState(mkState800());
  var chose=null;
  envD._confirmDateMismatchBeforeSend({app_tournament_id:'t_2026_07_12',remote_date:'2026-07-12',local_date:'2026-08-01',
    remote_count:22,missing_count:22,missing_names:['架空丙','架空丁','架空戊','架空己']},
    function(){ chose='overwrite'; }, function(){ chose='cancel'; });
  ok(seen.length===1&&seen[0].type==='confirm','D1 appConfirm の2択1枚（新規モーダル部品を増やさない）');
  ok(chose==='cancel','D2 キャンセル応答→onCancel（中止側に倒れる）');
  var msg=seen[0].message;
  ok(msg.indexOf('t_2026_07_12')>=0&&msg.indexOf('2026-07-12')>=0&&msg.indexOf('2026-08-01')>=0,'D3 大会ID・送信先の記録日・今回の実施日を明示');
  ok(msg.indexOf('すでに 22 名の記録があります')>=0&&msg.indexOf('そのうち 22 名は今回の参加者に含まれていません')>=0,
    'D4 ★観測した事実（残っている件数・今回いない人数）を書く');
  ok(msg.indexOf('架空丙・架空丁・架空戊')>=0&&msg.indexOf('ほか1名')>=0,'D5 今回いない人を3名まで例示し残りは件数（長くしない）');
  ok(msg.indexOf('この大会の記録日は 2026-07-12 → 2026-08-01 に変わります')>=0,'D6 起きること＝記録日が変わることを書く');
  ok(msg.indexOf('混ざります')<0&&msg.indexOf('一覧から消えます')<0&&msg.indexOf('前回成績')<0,
    'D7 ★起きないことがある断定（混ざる・大会が消える・成績上書き）を書かない');
  ok(msg.indexOf('今日の大会に合流')<0,'D8 ★機能しない導線「今日の大会に合流」を案内しない（R3/R4・Codex P1）');
  ok(msg.indexOf('参加回数')<0&&msg.indexOf('大会データを全リセット')<0,'D9 事実と違う説明（参加回数）と破壊的な導線を出さない（R7）');
  ok(msg.indexOf('確認がもう1枚出ます')>=0,'D10 追加の confirm が挟まることを先に予告（R5）');
  // OK 応答→onOverwrite
  var envD2=loadEnv(); var chose2=null;
  envD2._setState(mkState800());
  envD2.__setAppModalTestResolver(function(){ return true; });
  envD2._confirmDateMismatchBeforeSend({app_tournament_id:'t_x',remote_date:'2026-07-12',local_date:'2026-08-01',
    remote_count:2,missing_count:2,missing_names:['架空丙','架空丁']},
    function(){ chose2='overwrite'; }, function(){ chose2='cancel'; });
  ok(chose2==='overwrite','D11 OK 応答→onOverwrite（明示承諾のときだけ上書きへ進む）');
  // 導線は state（キー有無）で出し分ける
  ok(env._tidMismatchRecoverySteps({tournament_id:'t_2026_07_12'}).indexOf('「運営共通キーを発行」')>=0,
    'D12 キーなしIDには「運営共通キーを発行」を案内');
  ok(env._tidMismatchRecoverySteps({tournament_id:'t_2026_07_12_9116'}).indexOf('「このキーに合わせる」')>=0
     &&env._tidMismatchRecoverySteps({tournament_id:'t_2026_07_12_9116'}).indexOf('9116')>=0,
    'D13 キー付きIDには「このキーに合わせる」＋いまの4桁を案内（発行は発行済み扱いで効かないため）');

  console.log('=== R: 追加受入基準4 案内した導線を実行すると tid が変わる（R3 の再発防止）===');
  // R-a: キーなしID → 「運営共通キーを発行」で t_<実施日>_<4桁> に振り直る（参加者・結果は残る）
  var envR=loadEnv();
  envR.__setAppModalTestResolver(function(){ return true; });   // 送信済みIDからの張り替え確認は「はい」
  var stR=mkState800(); stR.cloud_sent_tid='t_2026_07_12';
  envR._setState(stR);
  envR.issueOpsSharedKey(function(){},function(){});
  var tidR=envR._getState().tournament_id;
  ok(/^t_2026_08_01_\d{4}$/.test(tidR),'R1 ★「運営共通キーを発行」で実施日の新しい大会IDになる (got '+tidR+')');
  ok(envR._getState().players.A.length===2&&envR._getState().results.A[0].length===1,'R2 参加者・結果はそのまま残る');
  // R-b: キー付きID → 「このキーに合わせる」に同じ4桁を入れ直すと実施日側の新しいIDになる
  var envR2=loadEnv();
  envR2.__setAppModalTestResolver(function(){ return true; });
  var stR2=mkState800(); stR2.tournament_id='t_2026_07_12_9116'; stR2.cloud_sent_tid='t_2026_07_12_9116';
  envR2._setState(stR2);
  envR2.applyOpsSharedKey('9116',function(){},function(){});
  ok(envR2._getState().tournament_id==='t_2026_08_01_9116',
    'R3 ★同じ4桁の入れ直しで実施日側の新しい大会IDになる (got '+envR2._getState().tournament_id+')');
  // R-c: 旧案内「今日の大会に合流」は #800 の状態では何も変えない（＝案内から外した根拠）
  var envR3=loadEnv();
  envR3.__setAppModalTestResolver(function(){ return true; });
  var stR3=mkState800(); stR3.tournament_id='t_2026_08_01';   // = t_<報告書の実施日>
  envR3._setState(stR3);
  envR3.joinOpsKeylessTournament(function(){},function(){});
  ok(envR3._getState().tournament_id==='t_2026_08_01',
    'R4 ★「今日の大会に合流」は既に同じIDなら何も変えない＝復帰導線にならない（案内しない根拠）');

  console.log('=== U: 追加受入基準5 ダイアログの UI 文言が実在する（R6 の再発防止）===');
  // ダイアログ本文から「」で囲われた UI 名を機械的に抜き、shogi_v4.html に完全一致で存在することを確かめる。
  var envU=loadEnv(); envU._setState(mkState800());
  var msgU=envU._tidMismatchDialogMessage({app_tournament_id:'t_2026_07_12',remote_date:'2026-07-12',
    local_date:'2026-08-01',remote_count:2,missing_count:2,missing_names:['架空丙','架空丁']},envU._getState());
  var uiNames=[],mU,reU=/「([^」]+)」/g;
  while((mU=reU.exec(msgU))!==null){ if(uiNames.indexOf(mU[1])<0)uiNames.push(mU[1]); }
  // 除外するのは (a) 大会ID そのもの (b) このダイアログ自身のボタン（okText/cancelText＝HTML には無い）。
  //   (b) は appConfirm へ渡している文字列と突き合わせて実在を確かめる。
  var ownBtns=['それでも上書きする','中止'];
  ok(RAW.indexOf("okText:'"+ownBtns[0]+"',cancelText:'"+ownBtns[1]+"',danger:true")>=0,
    'U1a ダイアログ自身のボタン名は appConfirm へ渡している文字列と一致');
  var missingUi=uiNames.filter(function(nm){
    return nm.indexOf('t_')!==0&&ownBtns.indexOf(nm)<0&&RAW.indexOf('>'+nm+'<')<0&&RAW.indexOf('>'+nm+'<span')<0; });
  ok(missingUi.length===0,'U1b ★ダイアログが名指しする UI 文言はすべて HTML に完全一致で実在する (missing: '+missingUi.join(',')+')');
  ok(msgU.indexOf('参加者登録タブ')>=0&&RAW.indexOf('id="tab-reg">参加者登録<')>=0,
    'U2 ★タブ名は「参加者登録」（「受付タブ」というタブは存在しない＝R6）');
  ok(msgU.indexOf('▷ 2台で分担して入力するとき')>=0&&RAW.indexOf('>▷ 2台で分担して入力するとき<')>=0,
    'U3 折りたたみ名が summary と完全一致');
  ok(RAW.indexOf('id="opsIssueBtn"')>=0&&RAW.indexOf('>運営共通キーを発行<')>=0,'U4 「運営共通キーを発行」ボタンが実在');
  ok(RAW.indexOf('id="opsApplyBtn"')>=0&&RAW.indexOf('>このキーに合わせる<')>=0,'U5 「このキーに合わせる」ボタンが実在');
  // 中止 status も同じ導線を指す
  var cancelU=envU._tidMismatchCancelStatus(envU._getState());
  ok(cancelU.indexOf('送信を中止しました')>=0&&cancelU.indexOf('参加者登録タブ')>=0&&cancelU.indexOf('運営共通キーを発行')>=0,
    'U6 中止 status もダイアログと同じ導線');
  ok(cancelU.indexOf('\n')<0,'U7 中止 status に改行を含めない（.cloud-status は pre-wrap なし）');

  console.log('=== E: sendTournamentToCloud の通し（確認→上書き／中止）===');
  // loadCloudDeps は window.SHOGI_CLOUD_CONFIG / window.supabase を見るだけ（揃っていれば CDN 注入をしない）。
  //   そこへ mock を差し込み、既存3ガード（#622 日付 / #567 多クラス / 未連携）と併せて端から端まで通す。実クラウドへは出ない。
  function runSend(answers,stateOverride,selOverride){
    var E=loadEnv();
    var prompts=[],unexpected=[],statuses=[];
    E.__setAppModalTestResolver(function(type,message){
      var m=String(message==null?'':message); prompts.push(m);
      if(m.indexOf('実施日')>=0&&m.indexOf('として記録します')>=0)return true;              // #622（従来どおり「はい」）
      if(m.indexOf('送信先の大会に、今回の参加者ではない記録が残っています')>=0)return answers.overwrite;
      if(m.indexOf('名簿に反映してから送信しますか')>=0)return answers.link;                // 未連携ガード1段目
      if(m.indexOf('このまま送信しますか')>=0)return answers.asis;                          // 未連携ガード2段目
      unexpected.push(m); return true;
    });
    var cli=makeClient(ups(),selOverride||sel('2026-07-12',JULY));
    cli.auth={ getSession:function(){ return Promise.resolve({data:{session:{user:'u'}}}); } };
    cli.rpc=function(){ return Promise.resolve({data:[{status:'active',club_id:'club-1'}]}); };
    E._win.SHOGI_CLOUD_CONFIG={url:'https://example.invalid',publishableKey:'pk_fake'};
    E._win.supabase={createClient:function(){ return cli; }};
    E._setState(stateOverride||mkState800());
    return {env:E,cli:cli,prompts:prompts,unexpected:unexpected,statuses:statuses,
      send:function(){ return E.sendTournamentToCloud(function(s){ statuses.push(String(s)); }); }};
  }
  function dlgCount(prompts){ var c=0; for(var i=0;i<prompts.length;i++){ if(prompts[i].indexOf('送信先の大会に、今回の参加者ではない記録が残っています')>=0)c++; } return c; }

  // E1: 中止（既定側）→ 1件も書かない・やり直し手順を status に出す
  var e1=runSend({overwrite:false});
  var r1=await e1.send();
  ok(dlgCount(e1.prompts)===1,'E1-1 送信ボタン経路で確認ダイアログが1回出る');
  ok(r1&&r1.ok===false&&r1.step==='cancelled-date-mismatch','E1-2 中止→{ok:false,step:"cancelled-date-mismatch"}（exactly-once resolve）');
  ok(writeCount(e1.cli)===0,'E1-3 中止時はクラウドへ1件も書かない (got '+writeCount(e1.cli)+')');
  var st1=e1.statuses[e1.statuses.length-1]||'';
  ok(st1.indexOf('送信を中止しました')>=0&&st1.indexOf('運営共通キーを発行')>=0,'E1-4 中止 status に実在のやり直し導線');
  ok(e1.prompts.filter(function(m){return m.indexOf('として記録します')>=0;}).length===1,'E1-5 #622 の日付 confirm は従来どおり1回出る（不変）');
  ok(e1.unexpected.length===0,'E1-6 想定外の confirm は出ない');

  // E2: 「それでも上書きする」→ allowDateMismatch:true で従来どおり全工程が通る
  var e2=runSend({overwrite:true});
  var r2=await e2.send();
  ok(r2&&r2.ok===true,'E2-1 承諾→送信成立');
  ok(dlgCount(e2.prompts)===1,'E2-2 確認は1回だけ（再実行でループしない）');
  var tblE=e2.cli._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblE==='members,players,tournaments,entries,tournament_snapshots','E2-3 承諾後は従来どおり全工程 (got '+tblE+')');
  var selE=e2.cli._calls.filter(function(c){return c.op==='select';}).map(function(c){return c.table;}).join(',');
  ok(selE==='tournaments,entries,players','E2-4 照会は送信前の1組だけ（承諾後は再照会しない）(got '+selE+')');
  var st2=e2.statuses[e2.statuses.length-1]||'';
  ok(st2.indexOf('送信しました')>=0,'E2-5 成功トーストは従来どおり');
  ok(st2.indexOf('送信先の大会日の確認は省略')<0,'E2-6 照会が成立した送信に skipped 注記は付かない');
  ok(e2.unexpected.length===0,'E2-7 想定外の confirm は出ない');

  // E3: 追加受入基準（R10 / Codex P1）— 未連携ガードの「名簿に反映して送信」より前に止まる
  //   甲を未連携にした state。旧実装は syncBranchMasterOnSave が先に走り、古い tid が支部マスタへ永久に混入した。
  var st3=mkState800(); delete st3.players.A[0].member_id;
  var e3=runSend({overwrite:false,link:true},st3,sel('2026-07-12',JULY));
  var r3=await e3.send();
  ok(r3&&r3.step==='cancelled-date-mismatch','E3-1 中止で終わる');
  ok(e3.prompts.filter(function(m){return m.indexOf('名簿に未連携の参加者')>=0;}).length===0,
    'E3-2 ★未連携ガードより前に止まる（名簿へ1文字も書かせない・R10）');
  ok(writeCount(e3.cli)===0,'E3-3 クラウドへも1件も書かない');
  ok(e3.unexpected.length===0,'E3-4 想定外の confirm は出ない');

  // E4: 衝突が無いときは未連携ガードが従来どおり出る（順序を入れ替えただけで潰していない）
  var st4=mkState800(); delete st4.players.A[0].member_id;
  var e4=runSend({overwrite:false,link:false,asis:true},st4,sel('2026-08-01',SAME));
  var r4=await e4.send();
  ok(dlgCount(e4.prompts)===0,'E4-1 衝突なし→date-mismatch の確認は出ない');
  ok(e4.prompts.filter(function(m){return m.indexOf('名簿に未連携の参加者')>=0;}).length===1,'E4-2 未連携ガードは従来どおり出る');
  ok(r4&&r4.ok===true,'E4-3 「このまま送信」で送信成立');
  ok(e4.unexpected.length===0,'E4-4 想定外の confirm は出ない');

  console.log('=== W: ソース配線 ===');
  ok(RAW.indexOf('function cloudTidDateConflict(')>=0,'W1 純関数 cloudTidDateConflict が存在');
  ok(RAW.indexOf('function cloudTidSendConflict(')>=0&&RAW.indexOf('function cloudTidLocalScope(')>=0,
    'W2 顔ぶれ判定 cloudTidSendConflict / cloudTidLocalScope が存在');
  ok(RAW.indexOf('function fetchCloudTidRemoteInfo(')>=0&&RAW.indexOf('function fetchCloudTournamentDateByAppId(')>=0,
    'W3 照会 fetchCloudTidRemoteInfo / fetchCloudTournamentDateByAppId が存在');
  ok(RAW.indexOf("client.from('tournaments')")>=0&&RAW.indexOf(".select('id,date').eq('club_id',clubId).eq('app_tournament_id',appTid)")>=0,
    'W4 照会は既存パターン（eq(club_id).eq(app_tournament_id)）の流用');
  ok(RAW.indexOf('fetchCloudEntriesForTournament(client,t.id,clubId)')>=0,
    'W5 顔ぶれは既存 fetchCloudEntriesForTournament で引く（新しい引き方を増やさない）');
  ok(RAW.indexOf("opts.allowDateMismatch===true")>=0,'W6 逃げ道は opts.allowDateMismatch===true のみ（既定 false）');
  ok(RAW.indexOf("step:'date-mismatch'")>=0,'W7 衝突は step:"date-mismatch" を返す（throw しない）');
  ok(RAW.indexOf("okText:'それでも上書きする',cancelText:'中止',danger:true")>=0,
    'W8 確認は okText/cancelText＋danger:true（＝OK は破壊色・フォーカスはキャンセル）');
  ok(RAW.indexOf("else if(k===13){ if(e.preventDefault)e.preventDefault(); if(opts.danger&&type==='confirm')return; onOk(); }")>=0,
    'W9 ★danger confirm は Enter の既定動作ごと抑止（Codex P1: Tab→Enter で上書きを確定できた）');
  ok(RAW.indexOf("step:'cancelled-date-mismatch'")>=0,'W10 中止は step:"cancelled-date-mismatch"');
  ok(RAW.indexOf('if(_tidPrecheckSkipped(res.precheck))base+=_tidPrecheckSkippedNote(res.precheck)')>=0,
    'W11 precheck 省略は成功トーストへ⚠注記');
  ok(RAW.indexOf('if(res&&_tidPrecheckSkipped(res.precheck))fmsg+=_tidPrecheckFailedNote()')>=0,
    'W12 ★precheck 省略は失敗トーストへも⚠注記（R1 / Codex P1）');
  ok(RAW.indexOf('var CLOUD_TID_PRECHECK_TIMEOUT_MS=')>=0&&RAW.indexOf('_withPrecheckTimeout(p,CLOUD_TID_PRECHECK_TIMEOUT_MS,_skip())')>=0,
    'W13 ★事前照会にタイムアウト（Codex P1: 半切断で「送信中…」のまま固まらない）');
  ok(RAW.indexOf('cloudSendBtn.disabled=true')>=0&&RAW.indexOf('if(cloudSendBtn.disabled)return;')>=0,
    'W14 ★送信中は送信ボタンを無効化（R8 / Codex P1: モーダル孤児化による「中止しました」化けを入口で塞ぐ）');
  ok(RAW.indexOf('if(_allowMismatch)o.allowDateMismatch=true; else if(_pre&&_pre.ok)o.remoteInfo=_pre;')>=0,
    'W15 照会結果を syncTournamentToCloud へ渡して往復を増やさない（ガード本体はあちら側に残す）');
  // 既存3ガード（#622 / #567 / 未連携）を置換していないこと（追加であって置換ではない）
  ok(RAW.indexOf('として記録します。違う場合は報告書の日付欄')>=0,'W16 #622 の日付 confirm 文言は不変');
  ok(RAW.indexOf("resolve({ok:false,step:'cancelled-date'})")>=0,'W17 #622 のキャンセル契約 step:"cancelled-date" は不変');
  ok(RAW.indexOf("この大会IDで全クラスを送信しますか？")>=0&&RAW.indexOf("resolve({ok:false,step:'cancelled'})")>=0,'W18 #567 多クラス confirm は不変');
  ok(RAW.indexOf('名簿に反映してから送信しますか？')>=0&&RAW.indexOf("step:'cancelled-unlinked'")>=0,'W19 未連携ガードは不変');
  ok(RAW.indexOf('syncBranchMasterOnSave(function(){ _send(); })')>=0,'W20 「名簿に反映して送信」の実装は不変');
  // ensureTournamentId / entries delete / upsert キーには手を出さない（案#1/#3/#4 は今回やらない）
  ok(RAW.indexOf('function ensureTournamentId(state,master,tournamentDate){\n  if(state&&typeof state.tournament_id===\'string\'&&state.tournament_id)return state.tournament_id;')>=0,
    'W21 ensureTournamentId は無改変（案#1 に手を出さない）');
  ok(RAW.indexOf(".from('entries').delete(")<0,'W22 entries の delete は追加していない（案#3 に手を出さない）');
  ok(RAW.indexOf("onConflict:'tournament_id,player_id'")>=0,'W23 entries の upsert キーは不変（案#4 に手を出さない）');
  // joinOpsKeylessTournament 本体は無改変（案内から外しただけ）
  ok(RAW.indexOf('この端末はすでに今日の大会（キーなし）に合流済みです。そのまま入力・送信してください')>=0,
    'W24 joinOpsKeylessTournament は無改変（導線として案内しないだけ・別 Issue）');

  clearTimeout(_wd);
  console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})().catch(function(e){ console.log('  FAIL: 例外: '+((e&&e.stack)||e)); console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+(fail+1)); process.exit(1); });
