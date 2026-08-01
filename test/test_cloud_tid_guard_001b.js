#!/usr/bin/env node
// @suite: CLOUD-TID-GUARD-001b 送信先の大会ガード（顔ぶれ判定）
// CLOUD-TID-GUARD-001b (#800 案#2・PR #801 差し戻し再設計): 「送信先の大会が、いま送ろうとしている大会と
//   別物ではないか」を、不可逆な書き込みの前に確かめるガードの受入テスト。
//   #800 の事故: 大会日を 2026-07-12 → 2026-08-01 に直しても state.tournament_id が t_2026_07_12 のまま残り、
//     upsert(onConflict:'club_id,app_tournament_id') が7月の大会レコードを書き換えた。
//   初版（PR #801）は「日付が違えば止める」だったため、**実施日を訂正して再送信する**という最も頻度の高い
//     正常操作（ジャーニーB）で誤発火した。判定材料を日付から**顔ぶれ**（送信先に既にある entries）に変える。
//   本テストが固定するもの:
//     P : 純関数（cloudTidDateConflict / cloudTidSendClasses / cloudTidSendMemberIds /
//         cloudTidRosterMissing / cloudTidNamesExample）
//     JB: ジャーニーB（1回送信 → 実施日を訂正 → 再送信）で確認ダイアログが出ない＝誤発火しない【最重要】
//     JA: ジャーニーA（別の顔ぶれで同じ tournament_id に送る）で止まり、upsert が1件も発生しない
//     CL: クラス絞り（2台分担で相手の級を「今回に含まれない人」に数えない）
//     S : 事前照会の失敗は fail-open（送信は成立・precheck:'skipped'）。res.ok が false のときも⚠注記が出る
//     T : 照会が無応答のときデッドラインで打ち切って送信が進む（⑧）
//     K : danger confirm は Enter で確定しない（⑨）
//     R : ダイアログが案内する導線を**実際に実行して** tournament_id が変わる（受入基準6）
//     L : ダイアログ中の UI 名（タブ名・ボタン名）が shogi_v4.html に完全一致で実在する（受入基準8）
//     W : ソース配線（順序・既定・逃げ道・送信ボタンの無効化）
//   実データ不使用（架空 fixture のみ）・読み取り専用。実クラウドへは一切出ない（mock のみ）。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
// 読込方式は近傍の既存テスト（test_cloud_history_scoreboard_765.js / test_cloud_send_unlinked_guard_001.js）に合わせる。
function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
// opts: {setTimeout: fn} テスト側でデッドラインの時計を差し替える（既定は「発火しないスタブ」＝従来どおり）。
function loadEnv(opts){
  opts=opts||{};
  var evs={};
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),
    addEventListener:function(k,f){ (evs[k]||(evs[k]=[])).push(f); },
    removeEventListener:function(k,f){ var a=evs[k]||[]; for(var i=0;i<a.length;i++){ if(a[i]===f){a.splice(i,1);break;} } },
    querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},scrollTo:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  const js=extractScripts(target);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { cloudTidDateConflict:cloudTidDateConflict, cloudTidSendClasses:cloudTidSendClasses,
      cloudTidSendMemberIds:cloudTidSendMemberIds, cloudTidRosterMissing:cloudTidRosterMissing,
      cloudTidNamesExample:cloudTidNamesExample, cloudTidPrecheck:cloudTidPrecheck,
      fetchCloudTournamentDateByAppId:fetchCloudTournamentDateByAppId, fetchCloudTournamentRoster:fetchCloudTournamentRoster,
      syncTournamentToCloud:syncTournamentToCloud, _confirmDateMismatchBeforeSend:_confirmDateMismatchBeforeSend,
      _tidPrecheckSkippedNote:_tidPrecheckSkippedNote, _tidPrecheckFailedNote:_tidPrecheckFailedNote,
      classifyCloudStatusKind:classifyCloudStatusKind, buildCloudSyncPayload:buildCloudSyncPayload,
      sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver,
      appConfirm:appConfirm, issueOpsSharedKey:issueOpsSharedKey, applyOpsSharedKey:applyOpsSharedKey,
      loadBranchMaster:loadBranchMaster, collectUnlinkedParticipantsForSend:collectUnlinkedParticipantsForSend,
      CLOUD_TID_PRECHECK_TIMEOUT_MS:CLOUD_TID_PRECHECK_TIMEOUT_MS,
      _setState:function(s){ state=s; }, _getState:function(){ return state; }, _win:window };`);
  var env=fn(doc,win,ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,
    (typeof opts.setTimeout==='function')?opts.setTimeout:function(){return 0;});
  env._docEvents=evs;
  return env;
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

// mock supabase client（test_cloud_history_scoreboard_765.js と同型。select は upsert と別 cfg で返せる
//   ＝事前照会の読み取り結果と tournaments.upsert().select('id') の戻りを独立に組める）。
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
      var t=selCfg[table]||{};
      if(t.hang)return new Promise(function(){});                   // 半切断（成功も失敗も返らない）の再現
      return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
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
// #800 の再現 fixture: 7月の大会IDを持ったまま、実施日だけ 8/1 に直した端末（A級2名）。
function mkState800(){ return { tournament_id:'t_2026_07_12', rounds:1, classes:[{id:'A',name:'A'}],
  players:{ A:[{id:'a1',name:'架空甲',yomi:'かくうこう',cls:'A',member_id:'m_a1',entry_no:1},
               {id:'a2',name:'架空乙',yomi:'かくうおつ',cls:'A',member_id:'m_a2',entry_no:2}] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] }, pairings:{ A:[] },
  report:{ date:'2026-08-01', title:'八月例会' } }; }
const master={ members:[{id:'m_a1',name:'架空甲',yomi:'かくうこう'},{id:'m_a2',name:'架空乙',yomi:'かくうおつ'}] };
// クラウド側の「顔ぶれ」fixture 生成（entries / players / members の3照会ぶん）。
function cloudRoster(rows){
  var entries=[],players=[],members=[];
  for(var i=0;i<rows.length;i++){
    entries.push({player_id:rows[i].pid,'class':rows[i].cls||'A'});
    players.push({id:rows[i].pid,member_id:rows[i].mid});
    members.push({member_id:rows[i].mid,name:rows[i].name});
  }
  return { entries:{data:entries}, players:{data:players}, members:{data:members} };
}
function selWith(tournamentRows,rosterCfg){
  var s={ tournaments:{data:tournamentRows} };
  if(rosterCfg){ s.entries=rosterCfg.entries; s.players=rosterCfg.players; s.members=rosterCfg.members; }
  return s;
}
const WRITE_CFG={ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} };
const env=loadEnv();

console.log('=== P: 純関数 ===');
ok(env.cloudTidDateConflict('','2026-08-01')==='','P1 remote 無し（クラウドに該当レコードなし＝新規大会）→食い違いなし');
ok(env.cloudTidDateConflict('2026-07-12','')==='','P2 local 空 →食い違いなし（#622 の担当領域・二重に止めない）');
ok(env.cloudTidDateConflict('2026-07-12','2026-13-99')==='','P3 local 無効な日付 →食い違いなし');
ok(env.cloudTidDateConflict('2026-08-01','2026-08-01')==='','P4 同一 →食い違いなし');
ok(env.cloudTidDateConflict('2026-07-12','2026-08-01')==='2026-07-12','P5 相違 →食い違いあり（remote を返す）');
var _pl={entries:[{member_id:'m1','class':'A'},{member_id:'m2','class':'A'},{member_id:'m3','class':'B'}]};
ok(env.cloudTidSendClasses(_pl).join(',')==='A,B','P6 送信クラスの集合（重複を畳む）');
ok(env.cloudTidSendClasses({entries:[]})===null,'P7 entries が空なら null（クラスで絞らない＝安全側）');
var _ids=env.cloudTidSendMemberIds(_pl);
ok(_ids.m1===true&&_ids.m3===true&&_ids.m9===undefined,'P8 member_id 集合');
var _roster=[{player_id:'p1','class':'A',member_id:'m1',name:'架空甲'},
             {player_id:'p2','class':'A',member_id:'mX',name:'架空丙'},
             {player_id:'p3','class':'B',member_id:'mY',name:'架空丁'}];
var _m1=env.cloudTidRosterMissing(_roster,['A'],{m1:true});
ok(_m1.total===2&&_m1.missing===1&&_m1.names.join(',')==='架空丙','P9 クラス絞り＋今回に含まれない人だけを数える');
var _m2=env.cloudTidRosterMissing(_roster,null,{m1:true});
ok(_m2.total===3&&_m2.missing===2,'P10 sendClasses=null ならクラスで絞らない');
var _m3=env.cloudTidRosterMissing(_roster,['A'],{m1:true,mX:true});
ok(_m3.missing===0,'P11 全員が今回の参加者に含まれる→0名（＝鳴らさない）');
var _m4=env.cloudTidRosterMissing([{player_id:'p9','class':'A',member_id:'',name:''}],['A'],{m1:true});
ok(_m4.missing===1&&_m4.names[0]==='（氏名不明）','P12 member_id を解決できない行は「含まれない人」に数える（安全側）');
ok(env.cloudTidNamesExample([])==='','P13 例示は0名なら空');
ok(env.cloudTidNamesExample(['甲'])==='甲','P14 例示1名');
ok(env.cloudTidNamesExample(['甲','乙'])==='甲・乙','P15 例示2名（「ほか」を付けない）');
ok(env.cloudTidNamesExample(['甲','乙','丙','丁'])==='甲・乙 ほか2名','P16 例示は先頭2名＋ほかN名');

// resolve 漏れ（ハング）を silent PASS にしないウォッチドッグ（test_cloud_send_unlinked_guard_001.js と同型）。
var _wd=setTimeout(function(){
  console.log('  FAIL: timeout（Promise が resolve されていない疑い）');
  console.log('CLOUD-TID-GUARD-001b: PASS='+pass+' FAIL='+(fail+1));
  process.exit(1);
},20000);

// ☁送信ボタン経路を端から端まで通すヘルパ（loadCloudDeps は window の mock を見るだけ＝CDN 注入なし・実クラウドへ出ない）。
function runSend(o){
  o=o||{};
  var E=loadEnv(o.envOpts);
  var prompts=[],unexpected=[],statuses=[];
  E.__setAppModalTestResolver(function(type,message){
    var m=String(message==null?'':message); prompts.push(m);
    if(m.indexOf('実施日')>=0&&m.indexOf('として記録します')>=0)return true;                  // #622（従来どおり「はい」）
    if(m.indexOf('送信先の大会に、今回の参加者ではない方の記録があります')>=0)return o.overwrite===true;
    unexpected.push(m); return true;
  });
  var cli=makeClient(o.cfg||WRITE_CFG,o.selCfg||{});
  cli.auth={ getSession:function(){ return Promise.resolve({data:{session:{user:'u'}}}); } };
  cli.rpc=function(){ return Promise.resolve({data:[{status:'active',club_id:'club-1'}]}); };
  E._win.SHOGI_CLOUD_CONFIG={url:'https://example.invalid',publishableKey:'pk_fake'};
  E._win.supabase={createClient:function(){ return cli; }};
  E._setState(o.state||mkState800());
  return {env:E,cli:cli,prompts:prompts,unexpected:unexpected,statuses:statuses,
    send:function(){ return E.sendTournamentToCloud(function(s){ statuses.push(String(s)); }); }};
}
function guardCount(prompts){ var c=0; for(var i=0;i<prompts.length;i++){ if(prompts[i].indexOf('送信先の大会に、今回の参加者ではない方の記録があります')>=0)c++; } return c; }

(async function(){
  console.log('=== JB: ジャーニーB（実施日を訂正して再送信）は鳴らない【最重要】===');
  // クラウドには 2026-08-05 として t_2026_08_05 が入っており、顔ぶれは今回とまったく同じ2名。
  //   運営者は「実施日を間違えた、本当は 8/1 だった」と気づいて日付を直し、再送信する。
  var stB=mkState800(); stB.tournament_id='t_2026_08_05'; stB.report.date='2026-08-01';
  var b=runSend({state:stB,selCfg:selWith([{id:'t-uuid',date:'2026-08-05'}],
    cloudRoster([{pid:'p1',mid:'m_a1',name:'架空甲'},{pid:'p2',mid:'m_a2',name:'架空乙'}]))});
  var rB=await b.send();
  ok(guardCount(b.prompts)===0,'JB1 確認ダイアログが出ない（日付は違うが顔ぶれが完全一致＝同じ大会の訂正）');
  ok(rB&&rB.ok===true,'JB2 送信は成立する');
  ok(rB.precheck==='ok','JB3 precheck:"ok"（照会は成立・鳴らす理由なし）＝⚠注記も付かない');
  var stB1=b.statuses[b.statuses.length-1]||'';
  ok(stB1.indexOf('送信しました')>=0&&stB1.indexOf('確認は省略')<0,'JB4 成功トーストは従来どおり（余計な注記なし）');
  ok(b.unexpected.length===0,'JB5 想定外の confirm は出ない');

  console.log('=== JA: ジャーニーA（別の顔ぶれ＝#800 の事故）は鳴る・1バイトも書かない ===');
  var a=runSend({overwrite:false,selCfg:selWith([{id:'t-uuid',date:'2026-07-12'}],
    cloudRoster([{pid:'p9',mid:'m_x1',name:'架空丙'},{pid:'p8',mid:'m_x2',name:'架空丁'},{pid:'p7',mid:'m_x3',name:'架空戊'}]))});
  var rA=await a.send();
  ok(guardCount(a.prompts)===1,'JA1 確認ダイアログが1回出る');
  ok(rA&&rA.ok===false&&rA.step==='cancelled-date-mismatch','JA2 中止→{ok:false,step:"cancelled-date-mismatch"}（exactly-once resolve）');
  ok(writeCount(a.cli)===0,'JA3 upsert が1件も発生しない (got '+writeCount(a.cli)+')');
  var opsA=a.cli._calls.map(function(c){return c.op+':'+c.table;}).join(',');
  ok(opsA==='select:tournaments,select:entries,select:players,select:members','JA4 発行したのは読み取り4回だけ (got '+opsA+')');
  var msgA=''; for(var i=0;i<a.prompts.length;i++){ if(a.prompts[i].indexOf('送信先の大会に、今回の参加者ではない方の記録があります')>=0)msgA=a.prompts[i]; }
  ok(msgA.indexOf('既に 3 名の記録があります')>=0,'JA5 文言に送信先の記録数');
  ok(msgA.indexOf('そのうち 3 名は今回の参加者に含まれていません')>=0,'JA6 文言に「今回に含まれない人数」');
  ok(msgA.indexOf('架空丙・架空丁 ほか1名')>=0,'JA7 文言に氏名の例（先頭2名＋ほかN名）');
  ok(msgA.indexOf('その方々の記録は残ったまま今回の 2 名が追加され')>=0,'JA8 文言は観測事実のみ（entries は upsert＝既存行は消えない）');
  ok(msgA.indexOf('大会の記録日は 2026-07-12 → 2026-08-01 に変わります')>=0,'JA9 文言に日付の変化');
  ok(msgA.indexOf('混ざります')<0&&msgA.indexOf('一覧から消えます')<0,'JA10 起きないこと（混ざる・一覧から消える）を書かない（③）');
  ok(msgA.indexOf('今日の大会に合流')<0,'JA11 機能しない導線（合流）を案内しない（④ R3）');
  var stA=a.statuses[a.statuses.length-1]||'';
  ok(stA.indexOf('送信を中止しました')>=0&&stA.indexOf('運営共通キーを発行')>=0,'JA12 中止 status も新しい導線を案内');
  ok(a.unexpected.length===0,'JA13 想定外の confirm は出ない');

  // 「それでも上書きする」→ 従来どおり全工程が通る（逃げ道は明示承諾のみ）
  var a2=runSend({overwrite:true,selCfg:selWith([{id:'t-uuid',date:'2026-07-12'}],
    cloudRoster([{pid:'p9',mid:'m_x1',name:'架空丙'}]))});
  var rA2=await a2.send();
  ok(rA2&&rA2.ok===true,'JA14 承諾→送信成立');
  ok(guardCount(a2.prompts)===1,'JA15 確認は1回だけ（再実行でループしない）');
  var tblA2=a2.cli._calls.filter(function(c){return c.op==='upsert';}).map(function(c){return c.table;}).join(',');
  ok(tblA2==='members,players,tournaments,entries,tournament_snapshots','JA16 承諾後は従来どおり全工程 (got '+tblA2+')');
  ok(a2.cli._calls.filter(function(c){return c.op==='select';}).length===4,'JA17 照会は最初の1巡だけ（再実行では照会しない）');
  ok(rA2.precheck==='bypassed','JA18 承諾で通した送信は precheck:"bypassed"（監査の手掛かり）');

  console.log('=== O: ガードは未連携ガードより前（⑥ R10）===');
  // 未連携者（member_id 無し）が居る状態でジャーニーAを起こし、中止する。
  //   旧順序では、先に未連携ガードの選択肢①「名簿に反映して送信」が走り得て、ローカル支部マスタに
  //   **古い tournament_id** の参加履歴が永久に混入していた（ガードが「1バイトも書かずに止めました」と言っても戻らない）。
  var stO=mkState800();
  stO.players.A=[{id:'a1',name:'架空甲',cls:'A'},                       // 未連携（member_id 無し）
                 {id:'a2',name:'架空乙',cls:'A',member_id:'m_a2'}];
  stO.results={ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] };
  var o1=runSend({state:stO,overwrite:false,selCfg:selWith([{id:'t-uuid',date:'2026-07-12'}],
    cloudRoster([{pid:'p9',mid:'m_x1',name:'架空丙'}]))});
  var unlBefore=o1.env.collectUnlinkedParticipantsForSend().length;
  var rO=await o1.send();
  ok(unlBefore===1,'O1 前提: 未連携者が1名いる');
  ok(guardCount(o1.prompts)===1,'O2 送信先ガードは出る');
  ok(o1.prompts.filter(function(m){return m.indexOf('名簿に未連携の参加者')>=0;}).length===0,
    'O3 中止した場合、未連携ガードは表示されない（＝送信先ガードが先）');
  ok(rO&&rO.step==='cancelled-date-mismatch','O4 中止の契約は変わらない');
  ok(o1.env.collectUnlinkedParticipantsForSend().length===1,'O5 ローカル支部マスタは書き換わっていない（member_id 付与なし）');
  var mO=(o1.env.loadBranchMaster()||{}).members||[];
  var hasKoO=false; for(var oi=0;oi<mO.length;oi++){ if(mO[oi]&&mO[oi].name==='架空甲')hasKoO=true; }
  ok(!hasKoO,'O6 未連携者が名簿へ新規登録されていない（古い大会IDの履歴が混入しない）');

  console.log('=== CL: クラス絞り（2台分担で相手の級を巻き込まない）===');
  // A級端末の送信。クラウドには相手が入れた B級2名が居るが、これは「今回に含まれない人」ではない。
  var c1=runSend({selCfg:selWith([{id:'t-uuid',date:'2026-07-12'}],
    cloudRoster([{pid:'p1',mid:'m_a1',name:'架空甲',cls:'A'},{pid:'p2',mid:'m_a2',name:'架空乙',cls:'A'},
                 {pid:'p5',mid:'m_b1',name:'架空戊',cls:'B'},{pid:'p6',mid:'m_b2',name:'架空己',cls:'B'}]))});
  var rC=await c1.send();
  ok(guardCount(c1.prompts)===0,'CL1 相手の級（B）は数えない＝鳴らない');
  ok(rC&&rC.ok===true&&rC.precheck==='ok','CL2 送信は従来どおり成立');

  console.log('=== S: 事前照会の失敗は fail-open（当日運営を止めない）===');
  // S-a: 大会日の照会が error
  var s1=runSend({selCfg:{tournaments:{error:{message:'network'}}}});
  var rS1=await s1.send();
  ok(rS1&&rS1.ok===true&&rS1.precheck==='skipped','S1 日付照会 error→送信成立・precheck:"skipped"');
  ok((s1.statuses[s1.statuses.length-1]||'').indexOf('送信先の大会の確認は省略しました')>=0,'S2 成功トーストに⚠注記');
  // S-b: 顔ぶれの照会が error（日付は食い違っている）
  var s2=runSend({selCfg:{tournaments:{data:[{id:'t-uuid',date:'2026-07-12'}]},entries:{error:{message:'rls'}}}});
  var rS2=await s2.send();
  ok(rS2&&rS2.ok===true&&rS2.precheck==='skipped','S3 顔ぶれ照会 error→送信成立・precheck:"skipped"（受入基準4）');
  ok(guardCount(s2.prompts)===0,'S4 照会できないときに確認ダイアログを出さない（fail-open）');
  // S-c: 読み取り非対応 client（from() が upsert しか持たない）でも例外にせず fail-open
  env._setState(mkState800());
  var cliS3=makeUpsertOnlyClient(WRITE_CFG);
  var rS3=await env.syncTournamentToCloud(cliS3,master,{clubId:'club-1'});
  ok(rS3&&rS3.ok===true&&rS3.precheck==='skipped','S5 読み取り非対応 client でも throw せず fail-open（既存 mock 互換）');
  // S-d: 注記の形（全角スペース区切り・改行なし・warn 分類）
  var noteS=env._tidPrecheckSkippedNote();
  ok(noteS.indexOf('　')===0&&noteS.indexOf('\n')<0,'S6 注記は全角スペース始まり・改行なし（.cloud-status は pre-wrap なし）');
  ok(noteS.indexOf('⚠')>=0&&noteS.indexOf('省略')>=0,'S7 注記は⚠付きでガードを省略した旨を明示');
  ok(env.classifyCloudStatusKind('送信しました（名簿 2 名・結果 2 件）'+noteS)==='warn','S8 注記付き送信後メッセージは warn(橙)');
  // S-e: 【② R1】fail-open で送って途中で失敗したとき、res.ok が false でも⚠注記が出る
  var s4=runSend({selCfg:{tournaments:{error:{message:'network'}}},
    cfg:{ players:WRITE_CFG.players, tournaments:{data:[{id:'t-uuid'}]}, entries:{error:{message:'boom'}} }});
  var rS4=await s4.send();
  ok(rS4&&rS4.ok===false,'S9 entries で失敗（res.ok===false）');
  var stS4=s4.statuses[s4.statuses.length-1]||'';
  ok(stS4.indexOf('送信に失敗しました')>=0,'S10 失敗表示は従来どおり');
  ok(stS4.indexOf('既に書き換わっている可能性があります')>=0,'S11 res.ok が false でも⚠注記が出る（「失敗＝無傷」と読ませない）');
  // S-f: 【⑦】暦上あり得ない日付は「照合済み・衝突なし」に倒さない
  var stInv=mkState800(); stInv.report.date='2026-02-30';
  var s5=runSend({state:stInv,selCfg:selWith([{id:'t-uuid',date:'2026-07-12'}],null)});
  var rS5=await s5.send();
  ok(rS5&&rS5.precheck==='skipped-invalid-date','S12 暦不正日付は precheck:"skipped-invalid-date"（偽の「照合済み」を残さない）');
  ok(s5.cli._calls.filter(function(c){return c.op==='select';}).length===0,'S13 暦不正日付では照会そのものをしない');
  ok((s5.statuses[s5.statuses.length-1]||'').indexOf('送信先の大会の確認は省略しました')>=0,'S14 その送信にも⚠注記が付く');

  console.log('=== T: 事前照会のデッドライン（⑧）===');
  ok(env.CLOUD_TID_PRECHECK_TIMEOUT_MS>=5000&&env.CLOUD_TID_PRECHECK_TIMEOUT_MS<=8000,
    'T1 デッドラインは 5〜8 秒（実測 '+env.CLOUD_TID_PRECHECK_TIMEOUT_MS+'ms）');
  var msSeen=[];
  var t1=runSend({selCfg:{tournaments:{hang:true}},                 // 半切断：成功も失敗も返らない
    envOpts:{ setTimeout:function(fn,ms){ msSeen.push(ms); return setTimeout(fn,0); } }});
  var rT=await t1.send();
  ok(msSeen.length>=1&&msSeen[0]===env.CLOUD_TID_PRECHECK_TIMEOUT_MS,'T2 照会に明示デッドラインを掛けている (got '+msSeen[0]+')');
  ok(rT&&rT.ok===true&&rT.precheck==='skipped','T3 期限超過も precheck:"skipped" 扱いで従来どおりの送信へ進む（固まらない）');
  ok(writeCount(t1.cli)>0,'T4 期限超過後に実際の送信が行われている');

  console.log('=== K: danger confirm の Enter 抑止（⑨）===');
  // 実 showAppModal を動かす（__setAppModalTestResolver を使わない）。Tab でフォーカスを OK 側へ移した状態は
  //   mock DOM では再現できないため、「Enter の既定動作を必ず抑止していること」＝preventDefault の呼び出しで固定する
  //   （フォーカス中ボタンのブラウザ既定 click は preventDefault でしか止まらない＝これが抑止の実体）。
  var K=loadEnv(); var kRes=null, kPrevented=0;
  K.appConfirm('危険な操作の確認',function(v){ kRes=v; },{okText:'それでも上書きする',cancelText:'中止',danger:true});
  var kHandlers=K._docEvents.keydown||[];
  ok(kHandlers.length===1,'K1 keydown ハンドラが1本登録される');
  kHandlers[0]({keyCode:13,preventDefault:function(){ kPrevented++; }});
  ok(kRes===null,'K2 danger confirm は Enter で確定しない（フォーカスが OK 側でも確定しない）');
  ok(kPrevented===1,'K3 Enter の既定動作を抑止している（preventDefault を呼ぶ＝フォーカス中ボタンの click が発火しない）');
  kHandlers[0]({keyCode:27,preventDefault:function(){}});
  ok(kRes===false,'K4 Esc は従来どおり中止（逃げ道は残す）');
  // 非 danger の confirm は従来どおり Enter で確定する（回帰）
  var K2=loadEnv(); var k2Res=null;
  K2.appConfirm('ふつうの確認',function(v){ k2Res=v; });
  (K2._docEvents.keydown||[])[0]({keyCode:13,preventDefault:function(){}});
  ok(k2Res===true,'K5 非 danger の confirm は従来どおり Enter で確定（挙動不変）');

  console.log('=== R: ダイアログが案内する導線を実際に実行する（受入基準6）===');
  // R-a: 大会IDにキーが無い場合＝「運営共通キーを発行」で t_<報告書の実施日>_<4桁> に振り直される
  var R=loadEnv();
  R.__setAppModalTestResolver(function(){ return true; });          // 送信済みIDからの張り替え確認は「はい」
  R._setState(mkState800());                                        // tournament_id='t_2026_07_12' / 実施日 2026-08-01
  R._getState().cloud_sent_tid='t_2026_07_12';
  R.issueOpsSharedKey(function(){},function(){});
  var tidAfter=R._getState().tournament_id;
  ok(/^t_2026_08_01_\d{4}$/.test(tidAfter),'R1 「運営共通キーを発行」で大会IDが今回の実施日のものに変わる (got '+tidAfter+')');
  ok(tidAfter!=='t_2026_07_12','R2 送信先とは別の大会IDになる（＝再送信でガードは鳴らない）');
  ok(R._getState().players.A.length===2,'R3 参加者・結果は無改変（合流と違ってデータを触らない）');
  // R-b: 既に4桁キーが付いている場合＝「運営共通キーを発行」は no-op（※ 文言で案内している分岐）
  var R2=loadEnv();
  R2.__setAppModalTestResolver(function(){ return true; });
  var st2=mkState800(); st2.tournament_id='t_2026_07_12_9116';
  R2._setState(st2);
  R2.issueOpsSharedKey(function(){},function(){});
  ok(R2._getState().tournament_id==='t_2026_07_12_9116','R4 キー付きIDでは「運営共通キーを発行」は大会IDを変えない（※の前提）');
  // R-c: その場合の案内＝「このキーに合わせる」に別の4桁 → t_<実施日>_<入れた4桁>
  R2.applyOpsSharedKey('4821',function(){},function(){});
  ok(R2._getState().tournament_id==='t_2026_08_01_4821','R5 「このキーに合わせる」に別の4桁で大会IDが変わる (got '+R2._getState().tournament_id+')');

  console.log('=== L: ダイアログ中の UI 名がコードに実在する（受入基準8）===');
  var L=loadEnv(); var lMsg='';
  L.__setAppModalTestResolver(function(type,message){ lMsg=String(message==null?'':message); return false; });
  L._confirmDateMismatchBeforeSend({app_tournament_id:'t_2026_07_12',remote_date:'2026-07-12',local_date:'2026-08-01',
    existing_count:22,missing_count:22,missing_names:['架空甲','架空乙'],sending_count:7,class_filtered:true},
    function(){},function(){});
  var labels=['▷ 2台で分担して入力するとき','運営共通キーを発行','このキーに合わせる'];
  for(var li=0;li<labels.length;li++){
    ok(lMsg.indexOf(labels[li])>=0&&RAW.indexOf('>'+labels[li])>=0,
      'L'+(li+1)+' ダイアログの UI 名「'+labels[li]+'」が shogi_v4.html に完全一致で実在する（要素のテキストとして）');
  }
  // タブ名は tab-* ボタンの定義から読む（ハードコードしない＝scripts/verify_ui_labels.py の検査2 と同じ考え方）
  var tabDefs=[]; var reTab=/<button[^>]*\bclass="[^"]*\btab\b[^"]*"[^>]*\bid="tab-[^"]*"[^>]*>([^<]+)<\/button>/g, mT;
  while((mT=reTab.exec(RAW))!==null)tabDefs.push(mT[1].trim());
  var claimed=[]; var reC=/([^\s、。「」（）()・]{1,12}?)タブ/g, mC;
  while((mC=reC.exec(lMsg))!==null)claimed.push(mC[1]);
  var tabsOk=true; for(var ti=0;ti<claimed.length;ti++){ if(tabDefs.indexOf(claimed[ti])<0)tabsOk=false; }
  ok(claimed.length>0&&tabsOk,'L4 ダイアログが挙げるタブ名が実在する (挙げた='+claimed.join('/')+' 実在='+tabDefs.join('/')+')');
  ok(lMsg.indexOf('受付タブ')<0,'L5 存在しない「受付タブ」を書いていない');

  console.log('=== W: ソース配線 ===');
  ok(RAW.indexOf('function cloudTidPrecheck(')>=0,'W1 事前照会 cloudTidPrecheck が存在');
  ok(RAW.indexOf('function cloudTidRosterMissing(')>=0,'W2 顔ぶれ判定の純関数 cloudTidRosterMissing が存在');
  ok(RAW.indexOf('function fetchCloudTournamentRoster(')>=0,'W3 顔ぶれ照会 fetchCloudTournamentRoster が存在');
  ok(RAW.indexOf(".select('player_id,class').eq('club_id',clubId).eq('tournament_id',tournamentUuid)")>=0,
    'W4 顔ぶれ照会は既存パターン（eq(club_id).eq(...)）の流用');
  ok(RAW.indexOf('opts.allowDateMismatch===true')>=0,'W5 逃げ道は opts.allowDateMismatch===true のみ（既定＝ガードが効く）');
  ok(RAW.indexOf("step:'date-mismatch'")>=0,'W6 衝突は step:"date-mismatch" を返す（throw しない）');
  ok(RAW.indexOf("okText:'それでも上書きする',cancelText:'中止',danger:true")>=0,'W7 確認は okText/cancelText＋danger:true（既定は中止）');
  ok(RAW.indexOf("step:'cancelled-date-mismatch'")>=0,'W8 中止は step:"cancelled-date-mismatch"');
  ok(RAW.indexOf('function _precheckSkipped(res)')>=0&&RAW.indexOf('if(_precheckSkipped(res))em+=_tidPrecheckFailedNote();')>=0,
    'W9 ② res.ok の外側でも precheck を見る（失敗時の注記）');
  // 判定材料に state.cloud_sent_tid を使わない（#800 では cloud_sent_tid===tournament_id になるので判別できない）。
  //   ガード層（cloudTid* / fetchCloudTournamentRoster）のソース範囲に限って走査する
  //   （cloud_sent_tid 自体は OPS-SHARED-KEY Phase C の既存機能として別の場所で使われている＝そちらは無関係）。
  var guardSrc=RAW.slice(RAW.indexOf('function cloudTidDateConflict('),RAW.indexOf('// CLOUD SYNC (B-2b-core / #343)'));
  ok(guardSrc.length>1000&&guardSrc.indexOf('cloud_sent_tid')<0,'W10 判定に state.cloud_sent_tid を使わない（#800 でも一致するため判別できない）');
  // ⑥ 事前照会は未連携ガード（＝ローカル支部マスタの書き換え）より前。
  //   ソース上の記述順ではなく**呼び出しの入れ子**で固定する（未連携ガードは事前照会の結果コールバックの中でしか呼ばれない）。
  ok(RAW.indexOf("if(kind!=='conflict')return _guardThenWrite(client,clubId,master,kind);")>=0,
    'W11 ⑥ 未連携ガード（_guardThenWrite）は事前照会の結果を受けてから呼ばれる');
  ok(RAW.indexOf("_confirmDateMismatchBeforeSend(pre.info,")>=0&&RAW.indexOf("_rz(_guardThenWrite(client,clubId,master,'bypassed'));")>=0,
    'W12 ⑥ 確認ダイアログも未連携ガードより前（承諾後に初めて _guardThenWrite へ進む）');
  // ⑤ 送信中はボタンを無効化
  ok(RAW.indexOf('if(cloudSendBtn.disabled)return;')>=0&&RAW.indexOf('cloudSendBtn.disabled=true;')>=0
     &&RAW.indexOf('cloudSendBtn.disabled=false;')>=0,'W13 ⑤ 送信中は cloudSendBtn を disabled にし、完了/中止で戻す');
  // ⑨ danger confirm の Enter は既定動作ごと抑止
  ok(RAW.indexOf("else if(k===13){ if(e.preventDefault)e.preventDefault(); if(opts.danger&&type==='confirm')return; onOk(); }")>=0,
    'W14 ⑨ danger confirm の Enter は preventDefault してから return（既定動作の click を止める）');
  // 触らないこと（案#1/#3/#4）
  ok(RAW.indexOf("function ensureTournamentId(state,master,tournamentDate){\n  if(state&&typeof state.tournament_id==='string'&&state.tournament_id)return state.tournament_id;")>=0,
    'W15 ensureTournamentId は無改変（案#1 に手を出さない）');
  ok(RAW.indexOf(".from('entries').delete(")<0,'W16 entries の delete は追加していない（案#3 に手を出さない／顔ぶれは select のみ）');
  ok(RAW.indexOf("onConflict:'tournament_id,player_id'")>=0,'W17 entries の upsert キーは不変（案#4 に手を出さない）');
  // 既存3ガード（#622 / #567 / 未連携）は文言・選択肢とも不変
  ok(RAW.indexOf('として記録します。違う場合は報告書の日付欄')>=0&&RAW.indexOf("resolve({ok:false,step:'cancelled-date'})")>=0,'W18 #622 の日付 confirm は不変');
  ok(RAW.indexOf('この大会IDで全クラスを送信しますか？')>=0&&RAW.indexOf("resolve({ok:false,step:'cancelled'})")>=0,'W19 #567 多クラス confirm は不変');
  ok(RAW.indexOf('名簿に反映してから送信しますか？')>=0&&RAW.indexOf("step:'cancelled-unlinked'")>=0,'W20 未連携ガードの文言・契約は不変');

  clearTimeout(_wd);
  console.log('CLOUD-TID-GUARD-001b: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})().catch(function(e){ console.log('  FAIL: 例外: '+((e&&e.stack)||e)); console.log('CLOUD-TID-GUARD-001b: PASS='+pass+' FAIL='+(fail+1)); process.exit(1); });
