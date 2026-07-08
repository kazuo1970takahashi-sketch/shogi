#!/usr/bin/env node
// LIVE-BROADCAST-001 Phase 4: Realtime Broadcast 上乗せ（受信→即再取得）テスト。
//   設計 = docs/specs/20260704_live_broadcast_001_participant_realtime_design.md（§2/§6/§7①/§4.2 P2-a・受入 §8-14）
//   検証範囲（サンドボックスで決定的に検証できる層）:
//     - liveRealtimeTopic 純関数（topic = slug）
//     - fail-soft ガード: sbLiveStartRealtime は off-route/slug 無しで no-op（例外なし・client 非生成）、
//       sbLiveStopRealtime は未購読でも例外なし
//     - 追加のみ・退避不変: ポーリング（LIVE_POLL_MS=5000）は温存され、start/stop に realtime 起動/停止が結線、
//       受信ハンドラは sbLiveFetchOnce を撃つ（Broadcast を真実源にしない・§7①）
//     - migration の SQL 契約: DB trigger 起点送信・private・anon は受信(SELECT)のみ・送信(INSERT)不可・
//       broadcast に payload を載せない（合図のみ）
//   ※ 実 WS 購読/受信の E2E は realtime スキーマ非搭載のため対象外（live スモークで確認）。
//   すべて架空・実データ不使用。
const fs=require('fs');
const path=require('path');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},parentNode:null,childNodes:[],
  appendChild(c){c.parentNode=this;this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},remove(){},insertBefore(){},removeChild(c){this.childNodes=this.childNodes.filter(x=>x!==c);return c;}};}
function makeEnv(loc){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const headNode=node();
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:headNode,querySelector(){return null;},querySelectorAll(){return[];},hidden:false};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const nav={onLine:true,clipboard:{writeText:function(){return Promise.resolve();}}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','clearTimeout','setInterval','clearInterval','navigator','location',
    scripts()+';return {'
    +'liveRealtimeTopic:liveRealtimeTopic,'
    +'sbLiveStartRealtime:sbLiveStartRealtime,sbLiveStopRealtime:sbLiveStopRealtime,'
    +'loadLiveRealtimeLib:loadLiveRealtimeLib,sbIsLiveRoute:sbIsLiveRoute,'
    +'_rt:function(){return _sbLiveRt;},_rtClient:function(){return _sbLiveRtClient;},'
    +'_win:function(){return window;}};');
  return fn(doc,win,ls,{randomUUID:()=>'0'},function(){},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,
    cb=>0,()=>{}, (cb)=>0, ()=>{}, nav, loc||{search:'',hash:''});
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

// --- 1. liveRealtimeTopic 純関数（topic = slug） ---
(function(){
  const api=makeEnv({search:'',hash:''});
  ok(api.liveRealtimeTopic('live-abc123')==='live-abc123','topic は slug をそのまま返す');
  ok(api.liveRealtimeTopic(null)==='','null → 空文字（fixture 互換）');
  ok(api.liveRealtimeTopic(undefined)==='','undefined → 空文字');
})();

// --- 2. fail-soft: off-route では no-op（例外なし・client 非生成） ---
(function(){
  const api=makeEnv({search:'',hash:''}); // 非 scoreboard ルート
  ok(api.sbIsLiveRoute()===false,'off-route は live ルートでない');
  let threw=false;
  try{api.sbLiveStartRealtime();}catch(e){threw=true;}
  ok(!threw,'off-route の sbLiveStartRealtime は例外を投げない');
  ok(api._rt()==null,'off-route では channel を購読しない');
  ok(api._rtClient()==null,'off-route では anon client を生成しない');
})();

// --- 3. fail-soft: 未購読の停止は no-op（例外なし） ---
(function(){
  const api=makeEnv({search:'?live=live-x',hash:'#scoreboard'});
  let threw=false;
  try{api.sbLiveStopRealtime();}catch(e){threw=true;}
  ok(!threw,'未購読の sbLiveStopRealtime は例外を投げない');
  ok(api._rt()==null,'停止後も channel は null');
})();

// --- 4. loadLiveRealtimeLib: supabase 済みなら即 true・未ロードでも例外なし ---
(function(){
  const api=makeEnv({search:'?live=live-x',hash:'#scoreboard'});
  const win=api._win();
  win.supabase={createClient:function(){return {};}};
  let val=null,threw=false;
  try{ api.loadLiveRealtimeLib().then(function(v){val=v;}); }catch(e){threw=true;}
  ok(!threw,'loadLiveRealtimeLib は例外を投げない');
  // マイクロタスク後に評価
  Promise.resolve().then(function(){ ok(val===true,'supabase 済みロード時は即 true（短絡）'); });
})();

// --- 5. 追加のみ・退避不変（ソース契約） ---
(function(){
  const src=RAW;
  // 5-1. ポーリング（Phase3 fallback）は温存
  ok(/var\s+LIVE_POLL_MS\s*=\s*5000/.test(src),'LIVE_POLL_MS=5000（ポーリング退避は不変）');
  // 5-2. start/stop に realtime 起動/停止が結線
  const mStart=src.match(/function\s+sbLiveStartPolling\s*\(\)\s*\{[\s\S]*?\n\}/);
  ok(!!mStart && /sbLiveStartRealtime\s*\(/.test(mStart[0]),'sbLiveStartPolling が sbLiveStartRealtime を呼ぶ');
  ok(!!mStart && /sbLiveFetchOnce\s*\(/.test(mStart[0]),'sbLiveStartPolling は sbLiveFetchOnce（初回取得）を維持');
  const mStop=src.match(/function\s+sbLiveStopPolling\s*\(\)\s*\{[\s\S]*?\n\}/);
  ok(!!mStop && /sbLiveStopRealtime\s*\(/.test(mStop[0]),'sbLiveStopPolling が sbLiveStopRealtime を呼ぶ');
  // 5-3. 受信ハンドラは sbLiveRequestRefetch（追い焚き経由の再取得＝真実源）を撃つ・§7①
  const mRt=src.match(/function\s+sbLiveStartRealtime\s*\(\)\s*\{[\s\S]*?\n\}/);
  ok(!!mRt && /on\(\s*['"]broadcast['"]\s*,\s*\{\s*event\s*:\s*['"]snapshot['"]\s*\}\s*,\s*function\(\)\{[\s\S]*?sbLiveRequestRefetch\s*\(/.test(mRt[0]),'broadcast 受信で sbLiveRequestRefetch を撃つ（Broadcast を真実源にしない）');
  ok(!!mRt && /private\s*:\s*true/.test(mRt[0]),'private channel を購読（§4.2 P2-a）');
  // 5-5. Codex P2: fetch 実行中の broadcast を取りこぼさない追い焚き（take-latest）
  ok(/function\s+sbLiveRequestRefetch\s*\(\)/.test(src),'sbLiveRequestRefetch（追い焚き要求）が存在');
  ok(/function\s+sbLiveDrainPendingRefetch\s*\(\)/.test(src),'sbLiveDrainPendingRefetch（完了後ドレイン）が存在');
  ok(/var\s+_sbLivePendingRefetch\s*=\s*false/.test(src),'_sbLivePendingRefetch フラグを持つ');
  const mReq=src.match(/function\s+sbLiveRequestRefetch\s*\(\)\s*\{[\s\S]*?\n\}/);
  ok(!!mReq && /_sbLiveFetching\s*\)\s*\{\s*_sbLivePendingRefetch\s*=\s*true/.test(mReq[0]),'fetch 実行中は追い焚きを予約（多重は畳む）');
  const mFetch=src.match(/function\s+sbLiveFetchOnce\s*\(\)\s*\{[\s\S]*?\n\}/);
  ok(!!mFetch && /sbLiveDrainPendingRefetch\s*\(/.test(mFetch[0]),'sbLiveFetchOnce 完了時に追い焚きをドレイン');
  // 5-6. Codex P2: 初回失敗/切断でも購読を毎周回リトライ（ポーリングに固定されない）
  ok(!!mStart && /!\s*_sbLiveRt\s*\)\s*sbLiveStartRealtime\s*\(/.test(mStart[0]),'ポーリング周回で購読が無ければ realtime を再試行');
  // 5-7. Codex 2巡目 P2: 購読失敗（CHANNEL_ERROR/TIMED_OUT/CLOSED）は subscribe ステータスコールバックで来る →
  //   _sbLiveRt を解放してリトライを再開できるようにする＋二重 subscribe を防ぐ starting ガード
  ok(!!mRt && /subscribe\(\s*function\(\s*status\s*\)/.test(mRt[0]),'subscribe はステータスコールバックを取る');
  ok(!!mRt && /CHANNEL_ERROR/.test(mRt[0]) && /TIMED_OUT/.test(mRt[0]) && /CLOSED/.test(mRt[0]),'CHANNEL_ERROR/TIMED_OUT/CLOSED を検知');
  ok(!!mRt && /_sbLiveRt\s*===\s*ch\s*\)\s*_sbLiveRt\s*=\s*null/.test(mRt[0]),'購読失敗時は _sbLiveRt を解放（リトライ再開）');
  ok(!!mRt && /_sbLiveRt\s*=\s*ch\s*;[\s\S]*?\.subscribe\(/.test(mRt[0]),'_sbLiveRt は subscribe 前にセット（同期発火でも解放可能）');
  ok(/var\s+_sbLiveRtStarting\s*=\s*false/.test(src),'_sbLiveRtStarting（二重 subscribe 防止）フラグを持つ');
  ok(!!mRt && /_sbLiveRt\s*\|\|\s*_sbLiveRtStarting\s*\)\s*return/.test(mRt[0]),'起動中は再入せず二重 subscribe を防ぐ');
  // 5-4. supabase-js は運営経路と同一 CDN+SRI を遅延ロード
  ok(/@supabase\/supabase-js@2\.108\.2\/dist\/umd\/supabase\.js/.test(src),'viewer realtime は supabase-js@2.108.2 を遅延ロード');
  ok((src.match(/sha384-nD3dwv4\+ZqdYnmZKe\/249ImlV04om7xTCcsoSeQYI\+RO\+XlKPoqAWaJR1M5SJH9p/g)||[]).length>=2,'supabase-js の SRI は運営経路と同一を再利用');
})();

// --- 6. migration の SQL 契約（§4.2 P2-a・受入 §8-14） ---
(function(){
  const dir=path.join(path.dirname(target),'supabase','migrations');
  const alt=path.join('supabase','migrations');
  let mig='';
  const cands=[path.join(dir,'20260708120000_live_broadcast_phase4_realtime.sql'),
               path.join(alt,'20260708120000_live_broadcast_phase4_realtime.sql')];
  for(const c of cands){ try{ if(fs.existsSync(c)){ mig=fs.readFileSync(c,'utf8'); break; } }catch(e){} }
  ok(!!mig,'phase4 realtime migration が存在する');
  if(mig){
    ok(/realtime\.send\s*\(/.test(mig),'送信は realtime.send（DB trigger 起点）');
    ok(/after\s+update\s+of\s+version\s+on\s+public\.public_live_snapshots/i.test(mig),'publish（version 更新）起点の AFTER UPDATE トリガ');
    ok(/is_public/.test(mig) && /is\s+distinct\s+from\s+OLD\.version/i.test(mig),'公開中かつ version が進んだ時のみ発火');
    ok(/'snapshot'/.test(mig),"event 名は 'snapshot'（viewer と一致）");
    ok(/true\s*\)/.test(mig) || /private/i.test(mig),'private broadcast（Realtime Authorization 要求）');
    ok(!/NEW\.payload/.test(mig),'broadcast に payload を載せない（合図のみ・§7①）');
    // 受信は anon に SELECT のみ。送信(INSERT)は anon に付与しない。
    ok(/on\s+realtime\.messages/i.test(mig),'realtime.messages に RLS ポリシー');
    ok(/for\s+select/i.test(mig) && /to\s+anon/i.test(mig),'anon は受信(SELECT)可');
    ok(/realtime\.topic\s*\(\s*\)/.test(mig),'topic = is_public な slug に限定（列挙不可の一貫）');
    ok(!/for\s+insert[\s\S]*?to\s+anon/i.test(mig),'anon への INSERT(送信)ポリシーを作らない（spoof 不可・受入 §8-14）');
    // Codex P1: RLS の USING はテーブル直 SELECT でなく SECURITY DEFINER helper 経由（Phase3 で anon revoke 済のため）
    ok(/create\s+or\s+replace\s+function\s+public\.live_slug_is_public\s*\(\s*p_slug\s+text\s*\)/i.test(mig),'live_slug_is_public helper を定義（列挙不可のまま参照経路を付与）');
    ok(/security\s+definer/i.test(mig) && /set\s+search_path/i.test(mig),'helper は SECURITY DEFINER＋search_path 固定');
    ok(/grant\s+execute\s+on\s+function\s+public\.live_slug_is_public\s*\(\s*text\s*\)\s+to\s+anon/i.test(mig),'helper EXECUTE を anon に付与');
    ok(/public\.live_slug_is_public\s*\(\s*realtime\.topic\s*\(\s*\)\s*\)/i.test(mig),'受信ポリシーは helper 経由（テーブル直 SELECT でない）');
    // Codex P2: トリガの realtime.send は fail-soft（publish を巻き戻さない）
    ok(/exception\s+when\s+others\s+then/i.test(mig),'realtime.send を fail-soft 例外ブロックで包む（publish は真実源）');
  }
})();

setTimeout(function(){
  console.log('LIVE-BROADCAST Phase4: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail>0?1:0);
},10);
