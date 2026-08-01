#!/usr/bin/env node
// CLOUD-TID-GUARD-001 (#800 案#2): 送信先の大会日が食い違うときに、不可逆な書き込みの直前で止めるガードの受入テスト。
//   #800 の事故: 大会日を 2026-07-12 → 2026-08-01 に変えても state.tournament_id が t_2026_07_12 のまま残り、
//   upsert(onConflict:'club_id,app_tournament_id') が 7 月の大会レコードを書き換えた（7月の大会がクラウドから消えた）。
//   既存 SEND-DATE-CONFIRM-002 (#622) はローカルの日付しか見ない（実施日 8/1 は事実として正しい）ため構造的に捕まえられない。
//   本テストが固定するもの:
//     P: 純関数 cloudTidDateConflict（DOM もネットワークも触らない）
//     G: mock client で syncTournamentToCloud を叩き、衝突時に members/players/tournaments/entries の
//        upsert が「1回も」呼ばれないこと（本命＝「止まったつもりで書いていた」を防ぐ）
//     A: opts.allowDateMismatch:true なら従来どおり全部通る（逃げ道はこれ1つ・既定は安全側）
//     S: 照会が error / 読み取り非対応 client のときは fail-open（送信成立＋precheck:'skipped'）
//     N: クラウドに該当レコードが無い（新規大会）ときに余計な確認が出ない
//     W: ソース配線（確認ダイアログの2択・既定キャンセル・文言に「何が上書きされるか」と実在のやり直し導線）
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
    `${js};return { cloudTidDateConflict:cloudTidDateConflict, fetchCloudTournamentDateByAppId:fetchCloudTournamentDateByAppId,
      syncTournamentToCloud:syncTournamentToCloud, _confirmDateMismatchBeforeSend:_confirmDateMismatchBeforeSend,
      _tidPrecheckSkippedNote:_tidPrecheckSkippedNote, classifyCloudStatusKind:classifyCloudStatusKind,
      sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver,
      _setState:function(s){ state=s; }, _win:window };`);
  return fn(doc,win,ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

// mock supabase client（test_cloud_history_scoreboard_765.js と同型。select は upsert と別 cfg で返せるようにした
//   ＝precheck の読み取り結果と tournaments.upsert().select('id') の戻りを独立に組める）。
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
const env=loadEnv();

console.log('=== P: 純関数 cloudTidDateConflict ===');
ok(env.cloudTidDateConflict('','2026-08-01')==='','P1 remote 無し（クラウドに該当レコードなし＝新規大会）→衝突なし');
ok(env.cloudTidDateConflict(null,'2026-08-01')==='','P2 remote=null →衝突なし');
ok(env.cloudTidDateConflict(undefined,'2026-08-01')==='','P3 remote=undefined →衝突なし');
ok(env.cloudTidDateConflict('2026-07-12','')==='','P4 local 空 →衝突なし（#622 の担当領域・二重に止めない）');
ok(env.cloudTidDateConflict('2026-07-12','2026-13-99')==='','P5 local 無効な日付 →衝突なし（#622 の担当領域）');
ok(env.cloudTidDateConflict('2026-08-01','2026-08-01')==='','P6 同一 →衝突なし');
ok(env.cloudTidDateConflict('2026-07-12','2026-08-01')==='2026-07-12','P7 相違 →衝突（remote を返す＝確認文言の材料）');
ok(env.cloudTidDateConflict('2026-08-02','2026-08-01')==='2026-08-02','P8 1日違いでも衝突（文字列比較）');
ok(env.cloudTidDateConflict(20260712,'2026-08-01')==='','P9 remote 非文字列 →衝突なし（fail-open）');

// resolve 漏れ（ハング）を silent PASS にしないウォッチドッグ（test_cloud_send_unlinked_guard_001.js と同型）。
var _wd=setTimeout(function(){
  console.log('  FAIL: timeout（syncTournamentToCloud の Promise が resolve されていない疑い）');
  console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+(fail+1));
  process.exit(1);
},15000);

(async function(){
  console.log('=== G: 衝突時はクラウドへ1件も書かない（本命）===');
  env._setState(mkState800());
  var cliG=makeClient(
    { players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} },
    { tournaments:{data:[{id:'t-uuid',date:'2026-07-12'}]} });   // クラウドの t_2026_07_12 は 7/12 の大会
  var rG=await env.syncTournamentToCloud(cliG,master,{clubId:'club-1'});
  ok(rG&&rG.ok===false&&rG.step==='date-mismatch','G1 衝突→{ok:false,step:"date-mismatch"}（throw しない＝既存契約どおり）');
  ok(rG.remote_date==='2026-07-12'&&rG.local_date==='2026-08-01'&&rG.app_tournament_id==='t_2026_07_12',
    'G2 remote_date/local_date/app_tournament_id を返す（確認文言の材料）');
  ok(writeCount(cliG)===0,'G3 members/players/tournaments/entries/tournament_snapshots の upsert が1回も呼ばれない (got '+writeCount(cliG)+')');
  var opsG=cliG._calls.map(function(c){return c.op+':'+c.table;}).join(',');
  ok(opsG==='select:tournaments','G4 発行したクラウド操作は precheck の読み取り1回だけ (got '+opsG+')');
  var selG=cliG._calls[0];
  ok(selG.cols==='id,date','G5 照会は select("id,date")（既存 fetchCloudTournamentIdByAppId と同型＋date）');
  ok(selG.eq.length===2&&selG.eq[0][0]==='club_id'&&selG.eq[0][1]==='club-1'
     &&selG.eq[1][0]==='app_tournament_id'&&selG.eq[1][1]==='t_2026_07_12',
    'G6 照会は eq(club_id).eq(app_tournament_id)（既存パターン流用）');

  console.log('=== A: allowDateMismatch:true（唯一の逃げ道・明示承諾時のみ）===');
  env._setState(mkState800());
  var cliA=makeClient(
    { players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} },
    { tournaments:{data:[{id:'t-uuid',date:'2026-07-12'}]} });
  var rA=await env.syncTournamentToCloud(cliA,master,{clubId:'club-1',allowDateMismatch:true});
  ok(rA&&rA.ok===true,'A1 allowDateMismatch:true→従来どおり送信成立');
  ok(rA.counts&&rA.counts.entries===2,'A2 entries 2件（従来どおり）');
  var tblA=cliA._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblA==='members,players,tournaments,entries,tournament_snapshots','A3 upsert 順は従来どおり (got '+tblA+')');
  ok(cliA._calls.filter(function(c){return c.op==='select';}).length===0,'A4 承諾済みなら照会もしない（無駄な往復を増やさない）');
  ok(rA.precheck==='bypassed','A5 承諾で通した送信は precheck:"bypassed" が残る（監査の手掛かり）');

  console.log('=== S: 照会失敗は fail-open（当日運営を止めない）===');
  // S-a: 照会が error を返す
  env._setState(mkState800());
  var cliS=makeClient(
    { players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} },
    { tournaments:{error:{message:'network'}} });
  var rS=await env.syncTournamentToCloud(cliS,master,{clubId:'club-1'});
  ok(rS&&rS.ok===true&&rS.counts.entries===2,'S1 照会 error→送信は従来どおり成立（fail-open）');
  ok(rS.precheck==='skipped','S2 結果に precheck:"skipped" が残る（黙って素通りさせない）');
  var tblS=cliS._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblS==='members,players,tournaments,entries,tournament_snapshots','S3 書き込みは従来どおり全工程 (got '+tblS+')');
  // S-b: 読み取り非対応の client（from() が upsert しか持たない）でも例外にせず fail-open
  env._setState(mkState800());
  var cliS2=makeUpsertOnlyClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} });
  var rS2=await env.syncTournamentToCloud(cliS2,master,{clubId:'club-1'});
  ok(rS2&&rS2.ok===true&&rS2.precheck==='skipped','S4 読み取り非対応 client でも throw せず fail-open（既存テストの mock 互換）');
  // S-c: 注記が成功トーストに載る形になっている（全角スペース区切り・'\n' を使わない）
  var noteS=env._tidPrecheckSkippedNote();
  ok(noteS.indexOf('　')===0,'S5 注記は全角スペース始まり（.cloud-status は pre-wrap なし＝"\\n" は改行にならない）');
  ok(noteS.indexOf('\n')<0,'S6 注記に改行を含めない（_unlinkedSkippedNote と同方式）');
  ok(noteS.indexOf('⚠')>=0&&noteS.indexOf('省略')>=0,'S7 注記は⚠付きでガードを省略した旨を明示');
  ok(env.classifyCloudStatusKind('送信しました（名簿 2 名・結果 2 件）'+noteS)==='warn','S8 注記付き送信後メッセージは warn(橙)');

  console.log('=== N: 新規大会（クラウドに該当レコード無し）は素通り ===');
  env._setState(mkState800());
  var cliN=makeClient(
    { players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} },
    { tournaments:{data:[]} });                                   // 該当 app_tournament_id のレコードが無い
  var rN=await env.syncTournamentToCloud(cliN,master,{clubId:'club-1'});
  ok(rN&&rN.ok===true&&rN.step===undefined,'N1 新規大会→date-mismatch を返さない（余計な確認は出ない）');
  ok(rN.precheck==='ok','N2 precheck:"ok"（照会は成立・衝突なし）＝トーストに注記は付かない');
  var tblN=cliN._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblN==='members,players,tournaments,entries,tournament_snapshots','N3 書き込みは従来どおり全工程 (got '+tblN+')');
  // 同日（日付一致）も素通り
  env._setState(mkState800());
  var cliN2=makeClient(
    { players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} },
    { tournaments:{data:[{id:'t-uuid',date:'2026-08-01'}]} });     // 再送信（同じ大会・同じ日）
  var rN2=await env.syncTournamentToCloud(cliN2,master,{clubId:'club-1'});
  ok(rN2&&rN2.ok===true&&rN2.precheck==='ok','N4 同一日の再送信（冪等な上書き修正）は従来どおり通る');

  console.log('=== D: 確認ダイアログ（appConfirm 2択・既定は中止）===');
  var envD=loadEnv();
  var seen=[],optsSeen=null;
  envD.__setAppModalTestResolver(function(type,message){ seen.push({type:type,message:String(message==null?'':message)}); return false; });
  var chose=null;
  envD._confirmDateMismatchBeforeSend({app_tournament_id:'t_2026_07_12',remote_date:'2026-07-12',local_date:'2026-08-01'},
    function(){ chose='overwrite'; }, function(){ chose='cancel'; });
  ok(seen.length===1&&seen[0].type==='confirm','D1 appConfirm の2択1枚（新規モーダル部品を増やさない）');
  ok(chose==='cancel','D2 キャンセル応答→onCancel（中止側に倒れる）');
  var msg=seen[0].message;
  ok(msg.indexOf('t_2026_07_12')>=0&&msg.indexOf('2026-07-12')>=0&&msg.indexOf('2026-08-01')>=0,'D3 大会ID・クラウドの記録日・今回の実施日を明示');
  ok(msg.indexOf('書き換わり')>=0&&msg.indexOf('混ざります')>=0&&msg.indexOf('上書き')>=0&&msg.indexOf('一覧から消えます')>=0,
    'D4 「何が上書きされるか」を先に書いている（日付書換・参加者混在・成績上書き・大会消失）');
  ok(msg.indexOf('今日の大会に合流')>=0&&msg.indexOf('2台で分担して入力するとき')>=0,'D5 やり直し手順に実在の導線「今日の大会に合流」');
  ok(msg.indexOf('大会データを全リセット')>=0,'D6 やり直し手順に実在の導線「大会データを全リセット」');
  // OK 応答→onOverwrite
  var envD2=loadEnv(); var chose2=null;
  envD2.__setAppModalTestResolver(function(){ return true; });
  envD2._confirmDateMismatchBeforeSend({app_tournament_id:'t_x',remote_date:'2026-07-12',local_date:'2026-08-01'},
    function(){ chose2='overwrite'; }, function(){ chose2='cancel'; });
  ok(chose2==='overwrite','D7 OK 応答→onOverwrite（明示承諾のときだけ上書きへ進む）');

  console.log('=== E: sendTournamentToCloud の通し（確認→上書き／中止）===');
  // loadCloudDeps は window.SHOGI_CLOUD_CONFIG / window.supabase を見るだけ（揃っていれば CDN 注入をしない）。
  //   そこへ mock を差し込み、既存3ガード（#622 日付 / #567 多クラス / 未連携）を通過したあとの
  //   date-mismatch 経路を端から端まで通す。実クラウドへは出ない。
  function runSend(answers){
    var E=loadEnv();
    var prompts=[],unexpected=[],statuses=[];
    E.__setAppModalTestResolver(function(type,message){
      var m=String(message==null?'':message); prompts.push(m);
      if(m.indexOf('実施日')>=0&&m.indexOf('として記録します')>=0)return true;              // #622（従来どおり「はい」）
      if(m.indexOf('送信先の大会が、いまの実施日と食い違っています')>=0)return answers.overwrite;
      unexpected.push(m); return true;
    });
    var cli=makeClient(
      { players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} },
      { tournaments:{data:[{id:'t-uuid',date:'2026-07-12'}]} });
    cli.auth={ getSession:function(){ return Promise.resolve({data:{session:{user:'u'}}}); } };
    cli.rpc=function(){ return Promise.resolve({data:[{status:'active',club_id:'club-1'}]}); };
    E._win.SHOGI_CLOUD_CONFIG={url:'https://example.invalid',publishableKey:'pk_fake'};
    E._win.supabase={createClient:function(){ return cli; }};
    E._setState(mkState800());
    return {env:E,cli:cli,prompts:prompts,unexpected:unexpected,statuses:statuses,
      send:function(){ return E.sendTournamentToCloud(function(s){ statuses.push(String(s)); }); }};
  }
  function dlgCount(prompts){ var c=0; for(var i=0;i<prompts.length;i++){ if(prompts[i].indexOf('送信先の大会が、いまの実施日と食い違っています')>=0)c++; } return c; }

  // E1: 中止（既定側）→ 1件も書かない・やり直し手順を status に出す
  var e1=runSend({overwrite:false});
  var r1=await e1.send();
  ok(dlgCount(e1.prompts)===1,'E1-1 送信ボタン経路で確認ダイアログが1回出る');
  ok(r1&&r1.ok===false&&r1.step==='cancelled-date-mismatch','E1-2 中止→{ok:false,step:"cancelled-date-mismatch"}（exactly-once resolve）');
  ok(writeCount(e1.cli)===0,'E1-3 中止時はクラウドへ1件も書かない (got '+writeCount(e1.cli)+')');
  var st1=e1.statuses[e1.statuses.length-1]||'';
  ok(st1.indexOf('送信を中止しました')>=0&&st1.indexOf('今日の大会に合流')>=0,'E1-4 中止 status に実在のやり直し導線');
  ok(e1.prompts.filter(function(m){return m.indexOf('として記録します')>=0;}).length===1,'E1-5 #622 の日付 confirm は従来どおり1回出る（不変）');
  ok(e1.unexpected.length===0,'E1-6 想定外の confirm は出ない');

  // E2: 「それでも上書きする」→ allowDateMismatch:true で再実行し従来どおり全工程が通る
  var e2=runSend({overwrite:true});
  var r2=await e2.send();
  ok(r2&&r2.ok===true,'E2-1 承諾→送信成立');
  ok(dlgCount(e2.prompts)===1,'E2-2 確認は1回だけ（再実行でループしない）');
  var tblE=e2.cli._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblE==='members,players,tournaments,entries,tournament_snapshots','E2-3 承諾後は従来どおり全工程 (got '+tblE+')');
  ok(e2.cli._calls.filter(function(c){return c.op==='select';}).length===1,'E2-4 照会は1回だけ（再実行では allowDateMismatch で照会しない）');
  var st2=e2.statuses[e2.statuses.length-1]||'';
  ok(st2.indexOf('送信しました')>=0,'E2-5 成功トーストは従来どおり');
  ok(st2.indexOf('送信先の大会日の確認は省略')<0,'E2-6 照会が成立した送信に skipped 注記は付かない');
  ok(e2.unexpected.length===0,'E2-7 想定外の confirm は出ない');

  console.log('=== W: ソース配線 ===');
  ok(RAW.indexOf('function cloudTidDateConflict(')>=0,'W1 純関数 cloudTidDateConflict が存在');
  ok(RAW.indexOf('function fetchCloudTournamentDateByAppId(')>=0,'W2 照会 fetchCloudTournamentDateByAppId が存在');
  ok(RAW.indexOf("client.from('tournaments')")>=0&&RAW.indexOf(".select('id,date').eq('club_id',clubId).eq('app_tournament_id',appTid)")>=0,
    'W3 照会は既存パターン（eq(club_id).eq(app_tournament_id)）の流用');
  ok(RAW.indexOf("opts.allowDateMismatch===true")>=0,'W4 逃げ道は opts.allowDateMismatch===true のみ（既定 false）');
  ok(RAW.indexOf("step:'date-mismatch'")>=0,'W5 衝突は step:"date-mismatch" を返す（throw しない）');
  ok(RAW.indexOf("okText:'それでも上書きする',cancelText:'中止',danger:true")>=0,
    'W6 確認は okText/cancelText＋danger:true（＝OK は破壊色・フォーカスはキャンセル・Enter で確定しない＝既定は中止）');
  ok(RAW.indexOf("step:'cancelled-date-mismatch'")>=0,'W7 中止は step:"cancelled-date-mismatch"');
  ok(RAW.indexOf("res.precheck==='skipped')base+=_tidPrecheckSkippedNote()")>=0,'W8 precheck:"skipped" は成功トーストへ⚠注記');
  // ルートから到達可能であること（#799 到達可能性チェックの常設化に allowlist 追記が要らない実装であること）
  ok(RAW.indexOf('fetchCloudTournamentDateByAppId(client,payload.tournament.app_tournament_id,clubId)')>=0,
    'W9 fetchCloudTournamentDateByAppId は syncTournamentToCloud から呼ばれる（UI 到達経路 ☁送信ボタン→sendTournamentToCloud）');
  ok(RAW.indexOf('cloudTidDateConflict(pre.date,payload.tournament.date)')>=0,'W10 cloudTidDateConflict は syncTournamentToCloud から呼ばれる');
  ok(RAW.indexOf('_confirmDateMismatchBeforeSend(res,')>=0,'W11 _confirmDateMismatchBeforeSend は sendTournamentToCloud から呼ばれる');
  ok(RAW.indexOf('_tidPrecheckSkippedNote()')>=0,'W12 _tidPrecheckSkippedNote は sendTournamentToCloud から呼ばれる');
  // 既存3ガード（#622 / #567 / 未連携）を置換していないこと（追加であって置換ではない）
  ok(RAW.indexOf('実施日 '+"'"+'+_recDate+'+"'"+' として記録します')>=0||RAW.indexOf('として記録します。違う場合は報告書の日付欄')>=0,
    'W13 #622 の日付 confirm 文言は不変');
  ok(RAW.indexOf("resolve({ok:false,step:'cancelled-date'})")>=0,'W14 #622 のキャンセル契約 step:"cancelled-date" は不変');
  ok(RAW.indexOf("この大会IDで全クラスを送信しますか？")>=0&&RAW.indexOf("resolve({ok:false,step:'cancelled'})")>=0,'W15 #567 多クラス confirm は不変');
  ok(RAW.indexOf('名簿に反映してから送信しますか？')>=0&&RAW.indexOf("step:'cancelled-unlinked'")>=0,'W16 未連携ガードは不変');
  // ensureTournamentId / entries delete / upsert キーには手を出さない（案#1/#3/#4 は今回やらない）
  ok(RAW.indexOf('function ensureTournamentId(state,master,tournamentDate){\n  if(state&&typeof state.tournament_id===\'string\'&&state.tournament_id)return state.tournament_id;')>=0,
    'W17 ensureTournamentId は無改変（案#1 に手を出さない）');
  ok(RAW.indexOf(".from('entries').delete(")<0,'W18 entries の delete は追加していない（案#3 に手を出さない）');
  ok(RAW.indexOf("onConflict:'tournament_id,player_id'")>=0,'W19 entries の upsert キーは不変（案#4 に手を出さない）');

  clearTimeout(_wd);
  console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})().catch(function(e){ console.log('  FAIL: 例外: '+((e&&e.stack)||e)); console.log('CLOUD-TID-GUARD-001: PASS='+pass+' FAIL='+(fail+1)); process.exit(1); });
