#!/usr/bin/env node
// CLOUD-MEMBER-ATTR-MERGE-001 (#853): ☁送信が会員属性（member_kind/grade/city）をローカルの
//   **既定値**でクラウドに上書きし、会費区分が消えて誤徴収になる問題の受入テスト。
//
//   ローカル名簿は「未設定」と「既定値」を区別できない（normalize が member/ippan に確定する）。
//   作者裁定「案E」(2026-08-17): 送信直前にクラウド members を**読み取り専用**で取得し、送信行の
//   属性3列を**フィールド単位で合成**する。非既定値だけが「人が明示的に入れた情報」と確実に言える
//   ので、それは常にローカル優先。既定値の欄は情報が無いものとしてクラウド値を尊重する。
//
//   ★ 反証パネル（2026-08-17）が実測した罠を検査に落としている:
//     - syncTournamentToCloud は buildCloudSyncPayload へ opts を**明示列挙**で渡す。転送を書き忘れると
//       合成が一切効かないまま ok:true になり、**既存テストは全部緑のまま**通る。→ B 系は必ず
//       syncTournamentToCloud 経由で測る（buildCloudSyncPayload 直呼びでは穴を検出できない）。
//     - クラウド取得の失敗/空を区別しないと、無音で #853 のバグ挙動に戻る。→ D/E 系。
//     - pullMembersFromCloud は saveBranchMaster を伴い**ローカルの訂正を巻き戻す**ので送信経路で使わない。→ F。
//
//   実データ不使用（架空 fixture のみ）。実クラウドへは出ない（mock client のみ）。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',hidden:false,style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];},getBoundingClientRect:function(){return{top:0,bottom:0,height:0,width:0};}};}
function loadEnv(winExtra){
  var el={};
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),head:n('head'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  for(var k in (winExtra||{}))win[k]=winExtra[k];
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  const js=extractScripts(target);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return {
      composeCloudMemberFieldCols:composeCloudMemberFieldCols, _cloudMemberFieldCols:_cloudMemberFieldCols,
      _fetchCloudMemberAttrs:_fetchCloudMemberAttrs, syncTournamentToCloud:syncTournamentToCloud,
      sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver,
      saveBranchMaster:saveBranchMaster, loadBranchMaster:loadBranchMaster,
      _setState:function(s){ state=s; }, _getLs:function(){ return localStorage; } };`);
  return fn(doc,win,ls,{randomUUID:function(){return '00000000-0000-0000-0000-000000000000';},getRandomValues:function(a){return a;}},
    function(){},function(){return true;},function(){return '';},function(){},function(){},
    {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log:function(){},warn:function(){},error:function(){}},Promise,function(f){return setTimeout(f,0);},{onLine:true});
}
// mock supabase client（既存 cloud テストと同型＋members の select を差し替え可能に）
function makeClient(cfg){
  cfg=cfg||{}; var calls=[];
  function upsertBuilder(table,rows,opts){ var b={_sel:null};
    b.select=function(c){ this._sel=c; return this; };
    b.then=function(res,rej){ calls.push({op:'upsert',table:table,rows:rows,onConflict:opts&&opts.onConflict});
      var t=cfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  function selectBuilder(table,cols){ var b={_eq:[]};
    b.eq=function(k,v){ this._eq.push([k,v]); return this; };
    b.then=function(res,rej){ calls.push({op:'select',table:table,cols:cols,eq:b._eq});
      var t=cfg['select:'+table]||cfg[table]||{};
      if(t.reject)return Promise.reject(new Error('network')).then(res,rej);
      return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  return { _calls:calls,
    auth:{ getSession:function(){ return Promise.resolve({data:{session:{user:{id:'u1'}}}}); } },
    rpc:function(name){ calls.push({op:'rpc',name:name}); return Promise.resolve({data:[{club_id:'club-1',status:'active'}]}); },
    from:function(table){ return { upsert:function(rows,opts){ return upsertBuilder(table,rows,opts); }, select:function(cols){ return selectBuilder(table,cols); } }; } };
}
let pass=0,fail=0; function ok(c,m){ if(c)pass++; else { fail++; console.log('  FAIL: '+m); } }

function mkState(){ return { tournament_id:'t-853', rounds:1, classes:[{id:'A',name:'A',started:true}],
  players:{ A:[{id:'a1',name:'架空花子',yomi:'かくうはなこ',cls:'A',member_id:'m_h',entry_no:1,member:'member',grade:'ippan'},
               {id:'a2',name:'架空次郎',yomi:'かくうじろう',cls:'A',member_id:'m_j',entry_no:2,member:'member',grade:'ippan'}] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] }, pairings:{ A:[] },
  report:{ date:'2026-08-17', title:'八月例会' } }; }
// ローカル名簿＝既定値しか持たない（＝#853 の前提）
function mkLocalDefaults(){ return { schema_version:1, members:[
  {id:'m_h',name:'架空花子',yomi:'かくうはなこ',member:'member',grade:'ippan'},
  {id:'m_j',name:'架空次郎',yomi:'かくうじろう',member:'member',grade:'ippan'}] }; }
const CLOUD_ROWS=[{member_id:'m_h',name:'架空花子',member_kind:'member',grade:'josei',city:'沼津市'},
                  {member_id:'m_j',name:'架空次郎',member_kind:'other',grade:'chu',city:'三島市'}];
function membersRow(cli,mid){ var u=cli._calls.filter(function(c){return c.table==='members'&&c.op==='upsert';})[0];
  var rows=(u&&u.rows)||[]; for(var i=0;i<rows.length;i++)if(rows[i].member_id===mid)return rows[i]; return null; }

(async function(){
  const env=loadEnv();

  // ===== A: 合成の純関数（規則の全表）=====
  const C=env.composeCloudMemberFieldCols;
  ok(JSON.stringify(C({member:'member',grade:'ippan',city:''},{member_kind:'other',grade:'josei',city:'沼津市'}))
     ===JSON.stringify({member_kind:'other',grade:'josei',city:'沼津市'}),
    'A1 ローカルが全部既定値ならクラウド値を採用（#853 の本体ケース）');
  ok(JSON.stringify(C({member:'other',grade:'josei',city:'沼津市'},{member_kind:'member',grade:'ippan',city:'三島市'}))
     ===JSON.stringify({member_kind:'other',grade:'josei',city:'沼津市'}),
    'A2 ★ローカルが非既定値なら常にローカル優先（編集の巻き戻りを起こさない）');
  ok(JSON.stringify(C({member:'member',grade:'ippan',city:''},null))
     ===JSON.stringify(env._cloudMemberFieldCols({member:'member',grade:'ippan',city:''})),
    'A3 クラウド行が無いときは従来（_cloudMemberFieldCols）と同値');
  ok(JSON.stringify(C({member:'member',grade:'ippan',city:''},{member_kind:null,grade:null,city:null}))
     ===JSON.stringify({member_kind:'member',grade:'ippan',city:null}),
    'A4 クラウドが NULL（旧行）なら既定値のまま＝NULL は載せない');
  ok(JSON.stringify(C({member:'member',grade:'ippan',city:''},{member_kind:'bogus',grade:'zzz',city:''}))
     ===JSON.stringify({member_kind:'member',grade:'ippan',city:null}),
    'A5 不正語彙・空文字は採用しない（語彙 allowlist）');
  ok(JSON.stringify(C({member:'member',grade:'chu',city:''},{member_kind:'other',grade:'josei',city:'沼津市'}))
     ===JSON.stringify({member_kind:'other',grade:'chu',city:'沼津市'}),
    'A6 フィールド単位で独立に合成（grade はローカル・kind/city はクラウド）');
  ok(JSON.stringify(C(undefined,undefined))===JSON.stringify({member_kind:'member',grade:'ippan',city:null}),
    'A7 入力欠損でも壊れない');

  // ===== B: syncTournamentToCloud 経由（★転送の穴もここで殺す）=====
  {
    env._setState(mkState());
    var cli=makeClient({ players:{data:[{id:'p1',member_id:'m_h'},{id:'p2',member_id:'m_j'}]}, tournaments:{data:[{id:'t-uuid'}]} });
    var byId={}; CLOUD_ROWS.forEach(function(r){ byId[r.member_id]=r; });
    var r=await env.syncTournamentToCloud(cli,mkLocalDefaults(),{clubId:'club-1',cloudMembersById:byId});
    ok(r&&r.ok===true,'B0 送信は成立する');
    var rowH=membersRow(cli,'m_h');
    ok(rowH&&rowH.grade==='josei'&&rowH.city==='沼津市',
      'B1 ★ローカル既定値の欄にクラウド値が載る（合成が syncTournamentToCloud 経由で効いている）  [実測 '+JSON.stringify(rowH&&{g:rowH.grade,c:rowH.city})+']');
    var rowJ=membersRow(cli,'m_j');
    ok(rowJ&&rowJ.member_kind==='other'&&rowJ.grade==='chu','B2 区分・学年も同様に載る');
  }
  {
    // 逆向き: ローカルが非既定値ならクラウドが新しくてもローカルが勝つ
    env._setState(mkState());
    var cli2=makeClient({ players:{data:[{id:'p1',member_id:'m_h'}]}, tournaments:{data:[{id:'t-uuid'}]} });
    var local2={ schema_version:1, members:[{id:'m_h',name:'架空花子',member:'other',grade:'josei',city:'沼津市'}] };
    await env.syncTournamentToCloud(cli2,local2,{clubId:'club-1',cloudMembersById:{m_h:{member_id:'m_h',member_kind:'member',grade:'ippan',city:'三島市'}}});
    var row2=membersRow(cli2,'m_h');
    ok(row2&&row2.member_kind==='other'&&row2.grade==='josei'&&row2.city==='沼津市',
      'B3 ★ローカルの非既定値はクラウドで上書きされない（旧方針の巻き戻りを作らない）  [実測 '+JSON.stringify(row2&&{k:row2.member_kind,g:row2.grade,c:row2.city})+']');
  }
  {
    // 後方互換: opts 未指定なら現行と同値
    env._setState(mkState());
    var cli3=makeClient({ players:{data:[{id:'p1',member_id:'m_h'}]}, tournaments:{data:[{id:'t-uuid'}]} });
    await env.syncTournamentToCloud(cli3,mkLocalDefaults(),{clubId:'club-1'});
    var row3=membersRow(cli3,'m_h');
    ok(row3&&row3.member_kind==='member'&&row3.grade==='ippan'&&row3.city===null,
      'B4 cloudMembersById 未指定なら従来どおり（既存の呼び出し・テストの挙動不変）');
  }

  // ===== C: 読み取り専用フェッチャ（成功・失敗・0件の区別）=====
  {
    var cliOk=makeClient({ 'select:members':{data:CLOUD_ROWS} });
    var a1=await env._fetchCloudMemberAttrs(cliOk,'club-1');
    ok(a1&&a1.byId&&a1.byId.m_h&&a1.byId.m_h.grade==='josei'&&a1.note==='','C1 取得成功: byId が引ける・注記なし');
    var sel=cliOk._calls.filter(function(c){return c.op==='select'&&c.table==='members';})[0];
    ok(sel&&JSON.stringify(sel.eq)===JSON.stringify([['club_id','club-1']]),'C2 club_id で絞って読む');
    ok(cliOk._calls.filter(function(c){return c.op==='upsert';}).length===0,'C3 ★読み取りだけ（書き込みゼロ）');

    var cliErr=makeClient({ 'select:members':{error:{message:'boom'}} });
    var a2=await env._fetchCloudMemberAttrs(cliErr,'club-1');
    ok(a2&&a2.byId===null&&a2.note.indexOf('⚠')>=0,'C4 ★取得失敗は byId=null ＋ ⚠注記（無音でバグ挙動に戻らない）');

    var cliEmpty=makeClient({ 'select:members':{data:[]} });
    var a3=await env._fetchCloudMemberAttrs(cliEmpty,'club-1');
    ok(a3&&a3.byId&&Object.keys(a3.byId).length===0&&a3.note==='','C5 ★取得0件は「読めた」＝注記なし（失敗と区別する）');

    var cliRej=makeClient({ 'select:members':{reject:true} });
    var a4=await env._fetchCloudMemberAttrs(cliRej,'club-1');
    ok(a4&&a4.byId===null&&a4.note.indexOf('⚠')>=0,'C6 例外（通信断）でも throw せず注記に落とす');
  }

  // ===== D: 送信の通し（sendTournamentToCloud）=====
  async function runSend(selectCfg){
    var cli=makeClient(Object.assign({ players:{data:[{id:'p1',member_id:'m_h'},{id:'p2',member_id:'m_j'}]},
      tournaments:{data:[{id:'t-uuid'}]} }, selectCfg));
    var e=loadEnv({ SHOGI_CLOUD_CONFIG:{url:'https://example.test',publishableKey:'pk_test'},
      supabase:{ createClient:function(){ return cli; } } });
    e._setState(mkState());
    e.saveBranchMaster(mkLocalDefaults());
    // ★ master 全体は ensureTournamentId が大会IDを記録するため正当に変わる（HEAD も同じ）。
    //   ここで守りたい不変条件は「**会員属性がクラウド値で巻き戻らない**」なので属性だけを比べる。
    function attrsOf(){ try{ var m=JSON.parse(e._getLs()._['shogi_branch_master']||'{}');
      return JSON.stringify((m.members||[]).map(function(x){ return [x.id,x.member,x.grade,x.city||null]; })); }catch(_){ return 'ERR'; } }
    var lsBefore=attrsOf();
    e.__setAppModalTestResolver(function(){ return true; });
    var status=[];
    var res=await e.sendTournamentToCloud(function(m){ status.push(m); });
    return { res:res, cli:cli, status:status.join('\n'), lsBefore:lsBefore, lsAfter:attrsOf() };
  }
  {
    var d1=await runSend({ 'select:members':{data:CLOUD_ROWS} });
    ok(d1.res&&d1.res.ok===true,'D0 通しで送信成立（mock クラウド）  [step='+((d1.res&&d1.res.step)||'-')+']');
    var rowH=membersRow(d1.cli,'m_h');
    ok(rowH&&rowH.grade==='josei'&&rowH.city==='沼津市',
      'D1 ★送信の通しでも合成が効く（_send が読み取り→cloudMembersById まで結線されている）  [実測 '+JSON.stringify(rowH&&{g:rowH.grade,c:rowH.city})+']');
    ok(d1.status.indexOf('⚠ 会員の区分')<0,'D2 取得できたときは属性の⚠注記を出さない');
    ok(d1.lsBefore===d1.lsAfter&&d1.lsBefore.indexOf('ippan')>=0,
      'D3 ★送信でローカル名簿の会員属性が書き換わらない（pullMembersFromCloud を使わない＝訂正を巻き戻さない）  [実測 '+d1.lsAfter+']');
  }
  {
    var d2=await runSend({ 'select:members':{error:{message:'boom'}} });
    ok(d2.res&&d2.res.ok===true,'D4 取得に失敗しても送信は止めない（当日運営を止めない）');
    var rowH2=membersRow(d2.cli,'m_h');
    ok(rowH2&&rowH2.grade==='ippan','D5 取得失敗時はローカル値で送る（従来動作）');
    ok(d2.status.indexOf('⚠ 会員の区分')>=0,'D6 ★取得失敗は結果メッセージで明示する（無音で #853 に戻らない）');
  }

  // ===== E: 配線と文言のピン（消しても緑にならないように）=====
  ok(/buildCloudSyncPayload\(master,\{clubId:clubId, classesFilter:opts\.classesFilter, cloudMembersById:opts\.cloudMembersById\}\)/.test(RAW),
    'E1 ★syncTournamentToCloud が cloudMembersById を buildCloudSyncPayload へ転送している（明示列挙・忘れると無音 no-op）');
  ok(/_fetchCloudMemberAttrs\(client,clubId\)\.then\(function\(_attrRes\)/.test(RAW),
    'E2 ★_send がクラウド属性を読み取ってから送信している');
  ok(/cloudMembersById:\(_attrRes&&_attrRes\.byId\)\|\|null/.test(RAW),'E3 読み取り結果が送信 opts に渡っている');
  ok(RAW.indexOf('☁送信時にも同期されます）')<0,
    'E4 ★「☁送信時にも同期されます」の約束は残っていない（案E では既定値方向の訂正を拾えないため）');
  ok((RAW.match(/名簿タブの「☁ 名簿全体をクラウドへ一括送信」で反映できます/g)||[]).length===3,
    'E5 代わりに確実に届く経路（一括送信＝常にローカル優先）を3箇所すべてで案内している');
  {
    // 送信経路が pullMembersFromCloud を呼んでいない（＝ローカルを巻き戻さない）ことをソースで固定
    var sendSrc=RAW.slice(RAW.indexOf('function sendTournamentToCloud'), RAW.indexOf('function sendTournamentToCloud')+9000);
    ok(sendSrc.indexOf('pullMembersFromCloud')<0,
      'E6 ★送信経路で pullMembersFromCloud を呼ばない（あれは saveBranchMaster で訂正を巻き戻す）');
  }

  console.log('\nCLOUD-MEMBER-ATTR-MERGE-001: PASS='+pass+' FAIL='+fail);
  process.exit(fail?1:0);
})().catch(function(e){ console.log('  FAIL: 例外 '+(e&&e.stack||e)); console.log('\nCLOUD-MEMBER-ATTR-MERGE-001: PASS='+pass+' FAIL='+(fail+1)); process.exit(1); });
