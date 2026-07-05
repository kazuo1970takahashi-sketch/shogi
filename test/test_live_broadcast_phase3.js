#!/usr/bin/env node
// LIVE-BROADCAST-001 Phase 3: 配信実用ライン（display_mode / envelope 受入 / ポーリング補助 / キオスク）テスト。
//   設計 = docs/specs/20260704_live_broadcast_001_participant_realtime_design.md（§3.2 受入 #17・§5.2・§5.3 受入 #8・§7）
//   ＋ #598 code-review Nice-to-Have 1〜3 の取込を検証:
//     - Nice 1: sbSetLiveEnvelope の slug 一致検証・version 単調性（巻き戻り防止）
//     - Nice 2: normalizeState の try/catch（fail-soft 無条件保証）
//     - Nice 3: E9 厳密化は test_live_scoreboard_001.js 側で実施（本ファイルでは liveToggleBtn 等の静的要素と
//               液漏れ（display_mode='given+no' で氏名/よみが wire に出ない）を検査）
//   すべて架空 fixture・実データ不使用。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(loc){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const nav={onLine:true,clipboard:{writeText:function(){return Promise.resolve();}}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','clearTimeout','setInterval','clearInterval','navigator','location',
    scripts()+';return {normalizeState:normalizeState,buildPublicLiveSnapshot:buildPublicLiveSnapshot,'
    +'sbLiveAcceptEnvelope:sbLiveAcceptEnvelope,sbSetLiveEnvelope:sbSetLiveEnvelope,'
    +'liveRpcUrl:liveRpcUrl,liveBuildViewerUrl:liveBuildViewerUrl,'
    +'sbIsKioskMode:sbIsKioskMode,sbKioskReset:sbKioskReset,'
    +'liveIsActive:liveIsActive,liveSchedulePublish:liveSchedulePublish,'
    +'renderScoreboard:renderScoreboard,'
    +'_set:function(v){state=v;},_get:function(){return state;},'
    +'_env:function(){return _sbLiveEnvelope;},_vs:function(){return _sbLiveViewState;},'
    +'_setFocus:function(c,i){_sbFocusCls=c;_sbFocusId=i;},_setSearch:function(v){_sbSearch=v;},_setFilter:function(v){_sbClassFilter=v;},'
    +'_kioskVars:function(){return {focusId:_sbFocusId,focusCls:_sbFocusCls,search:_sbSearch,filter:_sbClassFilter};},'
    +'_view:function(){return document.getElementById("scoreboard-view");}};');
  return fn(doc,win,ls,{randomUUID:()=>'0'},function(){},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,
    cb=>0,()=>{}, (cb)=>0, ()=>{}, nav, loc||{search:'',hash:''});
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function has(o,k){return Object.prototype.hasOwnProperty.call(o,k);}

// 架空 fixture（実データ不使用）。空白あり/なし氏名・member/grade 混入で液漏れを検査。
function makeSrc(){
  return {
    rounds:3,
    report:{title:'架空テスト大会'},
    classes:[{id:'A',name:'架空A級',started:true}],
    players:{A:[
      {id:'p1',name:'架空 太郎',yomi:'かくう たろう',entry_no:1,member:'m-1',grade:'三段'},
      {id:'p2',name:'架空次郎',yomi:'かくうじろう',entry_no:2,member:'m-2'},
      {id:'p3',name:'',entry_no:3}
    ]},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'staff-x'}]]},
    pairings:{A:[{p1:'p1',p2:'p3',winner:null}]}
  };
}

// ---- D. display_mode（受入 #17） ----
{
  const E=makeEnv();
  const full1=E.buildPublicLiveSnapshot(makeSrc());
  const full2=E.buildPublicLiveSnapshot(makeSrc(),{display_mode:'full'});
  ok(JSON.stringify(full1)===JSON.stringify(full2),'D1 opts 省略と display_mode:full の出力が完全一致（Phase1 互換）');
  ok(full1.state.players.A[0].name==='架空 太郎'&&full1.state.players.A[0].yomi==='かくう たろう','D2 full はフルネーム/よみを公開');

  const anon=E.buildPublicLiveSnapshot(makeSrc(),{display_mode:'given+no'});
  const pA=anon.state.players.A;
  ok(pA[0].name==='架空（1）','D3 given+no: 空白区切り氏名は姓＋番号（架空（1））');
  ok(pA[1].name==='架（2）','D4 given+no: 空白なし氏名は先頭1文字＋番号（安全側）');
  ok(pA[2].name==='選手（3）','D5 given+no: 氏名空は「選手」＋番号');
  const wire=JSON.stringify(anon);
  ok(wire.indexOf('太郎')===-1&&wire.indexOf('次郎')===-1,'D6 given+no: 下の名前が wire に出ない');
  ok(wire.indexOf('かくう')===-1,'D7 given+no: よみ（yomi）が wire に出ない');
  ok(!has(pA[0],'yomi')&&!has(pA[1],'yomi'),'D8 given+no: yomi キー自体を出さない');
  ok(wire.indexOf('member')===-1&&wire.indexOf('grade')===-1&&wire.indexOf('lastModifiedBy')===-1,'D9 given+no でも除外項目（member/grade/lastModifiedBy）は不変で出ない');
  ok(pA[0].entry_no===1&&pA[0].id==='p1','D10 given+no でも id/entry_no は保持（星取表・検索が成立）');
  // state 形のまま（描画系は my_view テストで GOLDEN 担保済み。ここでは normalizeState が通ることのみ）。
  const vs=E.normalizeState(anon.state);
  ok(vs&&vs.players&&vs.players.A.length===3,'D11 given+no 出力が normalizeState を通る（state 形）');
}

// ---- A. sbLiveAcceptEnvelope（Nice 1 の純関数） ----
{
  const E=makeEnv();
  const snap=E.buildPublicLiveSnapshot(makeSrc());
  const env=(v,slug)=>({slug:slug===undefined?'s1':slug,version:v,updated_at:'2026-07-05T01:00:00Z',payload:snap?JSON.parse(JSON.stringify({schema_version:1,meta:{title:'架空テスト大会'},state:snap.state})):null});
  ok(E.sbLiveAcceptEnvelope(null,'s1',undefined)==='invalid','A1 null は invalid');
  ok(E.sbLiveAcceptEnvelope({},'s1',undefined)==='invalid','A2 payload 無しは invalid');
  ok(E.sbLiveAcceptEnvelope({payload:{state:null}},'s1',undefined)==='invalid','A3 payload.state 無しは invalid');
  ok(E.sbLiveAcceptEnvelope(env(1),'s1',undefined)==='ok','A4 slug 一致・初回は ok');
  ok(E.sbLiveAcceptEnvelope(env(1,'sX'),'s1',undefined)==='slug','A5 slug 不一致は slug（無視）');
  ok(E.sbLiveAcceptEnvelope(env(1,''),'s1',undefined)==='ok','A6 env.slug 空は照合しない（fixture 互換）');
  ok(E.sbLiveAcceptEnvelope(env(1),'',undefined)==='ok','A7 期待 slug 空は照合しない');
  ok(E.sbLiveAcceptEnvelope(env(2),'s1',3)==='stale','A8 version 巻き戻りは stale（無視）');
  ok(E.sbLiveAcceptEnvelope(env(3),'s1',3)==='ok','A9 同 version は ok（再取得・冪等）');
  ok(E.sbLiveAcceptEnvelope(env(4),'s1',3)==='ok','A10 前進 version は ok');
}

// ---- S. sbSetLiveEnvelope の統合挙動（Nice 1/2・live ルート上） ----
{
  const E=makeEnv({search:'?live=fake-slug-p3',hash:'#scoreboard'});
  const mk=(v,title,slug)=>({slug:slug===undefined?'fake-slug-p3':slug,version:v,updated_at:'2026-07-05T01:00:00Z',
    payload:{schema_version:1,meta:{title:title},state:E.buildPublicLiveSnapshot(makeSrc()).state}});
  E.sbSetLiveEnvelope(mk(2,'架空タイトルv2'));
  const v=E._view();
  ok(/架空タイトルv2/.test(v.innerHTML),'S1 正常 envelope が描画される');
  E.sbSetLiveEnvelope(mk(1,'架空タイトルv1'));
  ok(/架空タイトルv2/.test(v.innerHTML)&&E._env().version===2,'S2 巻き戻り envelope（v1<v2）は無視＝既存表示を保持（Nice 1）');
  E.sbSetLiveEnvelope(mk(3,'架空タイトルv3','other-slug'));
  ok(/架空タイトルv2/.test(v.innerHTML)&&E._env().version===2,'S3 slug 不一致 envelope は無視（Nice 1）');
  // Nice 2: normalizeState が throw する壊れた state → 直前の正常表示を保持（クラッシュしない）
  let threw=false;
  try{E.sbSetLiveEnvelope({slug:'fake-slug-p3',version:5,updated_at:'x',payload:{state:Object.create(null,{players:{get(){throw new Error('架空破損');}}})}});}
  catch(e){threw=true;}
  ok(!threw,'S4 壊れた state でも throw しない（try/catch・Nice 2）');
  ok(E._vs()&&E._env().version===2,'S5 壊れた envelope 後も直前の正常表示を保持（fail-soft）');
  E.sbSetLiveEnvelope(mk(3,'架空タイトルv3'));
  ok(/架空タイトルv3/.test(v.innerHTML)&&E._env().version===3,'S6 前進 version は反映される');
  E.sbSetLiveEnvelope(null);
  ok(/ライブ配信のデータを待っています/.test(v.innerHTML),'S7 null は破棄して待機へ（Phase2 L13 互換）');
}

// ---- U. ポーリング補助の純関数 ----
{
  const E=makeEnv();
  ok(E.liveRpcUrl('https://kakuu.supabase.co','get_live_snapshot')==='https://kakuu.supabase.co/rest/v1/rpc/get_live_snapshot','U1 liveRpcUrl');
  ok(E.liveRpcUrl('https://kakuu.supabase.co///','get_live_snapshot')==='https://kakuu.supabase.co/rest/v1/rpc/get_live_snapshot','U2 末尾スラッシュを正規化');
  ok(E.liveBuildViewerUrl('https://kakuu.example/shogi_v4.html','live-abc')==='https://kakuu.example/shogi_v4.html?live=live-abc#scoreboard','U3 参加者URL');
  ok(E.liveBuildViewerUrl('b','a b')==='b?live=a%20b#scoreboard','U4 slug を encodeURIComponent');
}

// ---- K. キオスク（§5.3・受入 #8） ----
{
  const E=makeEnv({search:'?live=fake-slug-p3&kiosk=1',hash:'#scoreboard'});
  ok(E.sbIsKioskMode()===true,'K1 ?live&kiosk=1 はキオスク');
  const E2=makeEnv({search:'?live=fake-slug-p3',hash:'#scoreboard'});
  ok(E2.sbIsKioskMode()===false,'K2 kiosk 無しはキオスクでない');
  const E3=makeEnv({search:'?kiosk=1',hash:'#scoreboard'});
  ok(E3.sbIsKioskMode()===false,'K3 live でなければキオスクでない（通常閲覧ビューに影響しない）');
  const E4=makeEnv({search:'?live=x&kiosk=10',hash:'#scoreboard'});
  ok(E4.sbIsKioskMode()===false,'K4 kiosk=10 等は不一致（=1 のみ）');
  // リセット: 個人ビュー/検索/絞り込みを解除して全体星取表へ
  E._setFocus('A','p1');E._setSearch('架空');E._setFilter('A');
  E.sbKioskReset();
  const kv=E._kioskVars();
  ok(kv.focusId===null&&kv.focusCls===null&&kv.search===''&&kv.filter==='all','K5 sbKioskReset が選択/検索/絞り込みを全解除（memory-only・state 非接触）');
}

// ---- H. 静的 HTML / 結線・既定値（受入 #17: 氏名公開を暗黙の既定にしない） ----
{
  ok(/id="liveToggleBtn"/.test(RAW),'H1 配信トグル（liveToggleBtn）が静的 HTML にある');
  ok(/id="liveDisplayMode"/.test(RAW),'H2 表示名セレクト（liveDisplayMode）がある');
  ok(/value="given\+no" selected/.test(RAW),'H3 表示名の既定選択は「姓＋番号のみ」（氏名公開を既定にしない・受入 #17）');
  ok(/id="live-bar"/.test(RAW)&&/id="liveBarStopBtn"/.test(RAW),'H4 📡 配信中バー＋停止ボタンがある（J1）');
  ok(/id="liveQrBox"/.test(RAW)&&/id="liveCopyUrlBtn"/.test(RAW),'H5 QR 掲示ボックス＋URLコピーがある（J2）');
  ok(/氏名・成績をインターネット公開する/.test(RAW),'H6 掲示物への公開告知の案内文言がある（受入 #17）');
  ok(/config\.public\.js/.test(RAW),'H7 公開 config（app/config.public.js）を読む経路がある（P1-c）');
  ok(/qrcode-generator@1\.5\.0\/qrcode\.js'[\s\S]{0,200}integrity='sha384-/.test(RAW),'H8 QR ライブラリは SRI 付きで遅延ロード');
  const saveBody=RAW.match(/function save\(\)\{[\s\S]{0,1500}/);
  ok(!!saveBody&&/liveSchedulePublish/.test(saveBody[0]),'H9 save() に publish フックがある（確定状態で throttle 送信）');
  const iv=RAW.indexOf('visibilitychange');
  ok(iv!==-1&&/sbLiveFetchOnce/.test(RAW),'H10 可視化復帰の再取得（§7②）がある');
}

// ---- O. 配信 OFF（既定）の不変（受入 §8-1 の静的確認） ----
{
  const E=makeEnv();
  ok(E.liveIsActive()===false,'O1 既定で配信 OFF（liveIsActive=false）');
  let threw=false;
  try{E.liveSchedulePublish();}catch(e){threw=true;}
  ok(!threw,'O2 配信 OFF で liveSchedulePublish は何もしない（保存経路に影響なし）');
}

console.log('LIVE-BROADCAST-001 Phase3: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
