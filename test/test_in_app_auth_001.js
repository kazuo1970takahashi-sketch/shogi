#!/usr/bin/env node
// IN-APP-AUTH-001 Slice1/2 (#645): 本体のログイン状態表示＋アプリ内ログアウト。
//   S: ソース＝auth-status-bar 要素・新関数・autoPull 相乗り・visibilitychange 結線が存在。
//   P: 純関数＝buildAuthChipHtml 分岐 / computeAuthChipState / _pickActiveClubName / escape(XSS)。
//   F: 機能＝mock client 注入で refreshAuthChip（in/out）と doAppLogout（appConfirm→signOut→未ログイン化）。
//   client は mock 注入（__setAuthClientTestFactory）・confirm/alert は __setAppModalTestResolver（実 createClient/DOM 依存なし）。
//   fixture は完全架空のみ。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,href:'',download:'',style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},click(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const alerts=[];
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator','Blob','URL','FileReader',
    scripts()+';return {buildAuthChipHtml:buildAuthChipHtml,computeAuthChipState:computeAuthChipState,_pickActiveClubName:_pickActiveClubName,refreshAuthChip:refreshAuthChip,doAppLogout:doAppLogout,__setAuthClientTestFactory:__setAuthClientTestFactory,__setAppModalTestResolver:__setAppModalTestResolver};');
  const env=fn(doc,win,ls,{randomUUID:()=>'00000000-0000-0000-0000-000000000000'},function(m){alerts.push(String(m));},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,
    {onLine:true},function(){},{createObjectURL:()=>'blob:mock',revokeObjectURL(){}},function(){return null;});
  return {env,store,els,alerts};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
const flush=async(n=8)=>{for(let i=0;i<n;i++)await Promise.resolve();};
function statefulClient(session,memberships){
  const st={session:session||null,signOutCalls:0,rpcCalls:0};
  return {_st:st,
    auth:{getSession(){return Promise.resolve({data:{session:st.session},error:null});},
          signOut(opts){st.signOutCalls++;st.lastScope=opts&&opts.scope;st.session=null;return Promise.resolve({error:null});}},
    rpc(){st.rpcCalls++;return Promise.resolve({data:memberships||[],error:null});}};
}

(async function(){
console.log('=== IN-APP-AUTH-001 Slice1/2（ログイン状態表示＋アプリ内ログアウト） ===');

// ---- S: ソース検証 ----
console.log('=== S: ソース ===');
ok(RAW.indexOf('id="auth-status-bar"')>=0,'S1 auth-status-bar 要素が存在');
ok(/id="auth-status-bar"[^>]*display:none/.test(RAW),'S2 初期は display:none（クラウド未設定時に出さない）');
ok(RAW.indexOf('function buildAuthChipHtml')>=0 && RAW.indexOf('function refreshAuthChip')>=0 && RAW.indexOf('function doAppLogout')>=0,'S3 主要関数が存在');
ok(RAW.indexOf('_renderAuthChip(computeAuthChipState(session,(rc&&rc.data)||[]))')>=0,'S4 autoPull 相乗りでチップ更新（追加RPCなし）');
ok(RAW.indexOf("addEventListener('visibilitychange'")>=0 && RAW.indexOf('refreshAuthChip(false)')>=0,'S5 visibilitychange で RPCなし再確認');
ok(RAW.indexOf('signOut(')>=0,'S6 signOut を呼ぶ');
ok(RAW.indexOf('この端末の大会データ・名簿は消えません')>=0,'S7 ログアウト確認に安心材料の文言');
ok(RAW.indexOf("signOut({scope:'local'})")>=0,'S8 signOut は scope:local（全デバイスを切らない）');
ok(RAW.indexOf('auth-logout-btn')>=0 && RAW.indexOf('.auth-status-bar{')>=0,'S9 色はCSSクラス（インライン色を撤去）');
ok(RAW.indexOf("showToast('ログアウトしました')")>=0,'S10 成功はトースト（モーダルでない）');
ok(RAW.indexOf('_cloudCfgReady()&&typeof refreshAuthChip')>=0,'S11 visibilitychange はクラウド設定判明時のみ');
ok(RAW.indexOf("_renderAuthChip({status:'in',email:(session.user&&session.user.email)")>=0,'S12 claim 前に fail-soft でログイン中を先行描画');

const {env,els,alerts}=makeEnv();
const toastEl=()=>{ if(!els['app-toast'])els['app-toast']={id:'app-toast',textContent:'',className:'',style:{}}; return els['app-toast']; };

// ---- P: 純関数 ----
console.log('=== P: 純関数 ===');
ok(env.buildAuthChipHtml({status:'out'}).indexOf('未ログイン')>=0,'P1 out→未ログイン表示');
ok(env.buildAuthChipHtml({status:'loading'}).indexOf('確認中')>=0,'P2 loading→確認中');
ok(env.buildAuthChipHtml({status:'offline'}).indexOf('オフライン')>=0,'P3 offline→オフライン');
var hIn=env.buildAuthChipHtml({status:'in',email:'a@b.c',clubName:'沼津支部'});
ok(hIn.indexOf('ログイン中：a@b.c・沼津支部')>=0 && hIn.indexOf('id="authLogoutBtn"')>=0,'P4 in→ログイン中＋ログアウトボタン');
ok(env.buildAuthChipHtml({status:'in',email:'<b>x</b>'}).indexOf('<b>x</b>')<0,'P5 メールは escape（XSS安全）');
ok(env._pickActiveClubName([{club_id:'c1',club_name:'沼津支部',status:'active'}])==='沼津支部','P6 active クラブ名を取得');
ok(env._pickActiveClubName([])==='' ,'P7 memberships 空→空文字');
var st=env.computeAuthChipState({user:{email:'x@y.z'}},[{club_id:'c1',club_name:'クラブA',status:'active'}]);
ok(st.status==='in'&&st.email==='x@y.z'&&st.clubName==='クラブA','P8 computeAuthChipState(in)');
ok(env.computeAuthChipState(null,[]).status==='out','P9 computeAuthChipState(session なし)→out');

// ---- F: 機能（mock client）----
console.log('=== F: 機能 ===');
// F1: ログイン中 → チップに email＋クラブ名
env.__setAuthClientTestFactory(function(){ return statefulClient({user:{email:'me@club.jp'}},[{club_id:'c1',club_name:'沼津支部',status:'active'}]); });
env.refreshAuthChip(true); await flush();
var bar=els['auth-status-bar'];
ok(bar.innerHTML.indexOf('ログイン中：me@club.jp・沼津支部')>=0,'F1 refreshAuthChip(in)→チップにメール＋クラブ名');
ok(bar.style.display==='flex','F2 ログイン中はバー表示（flex）');

// F3: 未ログイン → 未ログイン表示
env.__setAuthClientTestFactory(function(){ return statefulClient(null,[]); });
env.refreshAuthChip(true); await flush();
ok(bar.innerHTML.indexOf('未ログイン')>=0,'F3 refreshAuthChip(out)→未ログイン');

// F4: ログアウト（OK）→ signOut 実行＋未ログイン化＋通知
var shared=statefulClient({user:{email:'me@club.jp'}},[{club_id:'c1',club_name:'沼津支部',status:'active'}]);
env.__setAuthClientTestFactory(function(){ return shared; });
env.refreshAuthChip(true); await flush();
ok(bar.innerHTML.indexOf('ログイン中')>=0,'F4a 事前状態＝ログイン中');
var seen=[];
toastEl().textContent='';
env.__setAppModalTestResolver(function(type,message){ seen.push(String(message||'')); return true; }); // confirm=OK・全モーダル文言を捕捉
env.doAppLogout(); await flush();
ok(shared._st.signOutCalls===1,'F4b signOut が1回呼ばれた');
ok(shared._st.lastScope==='local','F4b2 signOut は scope:local（この端末のみ）');
ok(bar.innerHTML.indexOf('未ログイン')>=0,'F4c ログアウト後は未ログイン表示');
ok(seen.join('|').indexOf('ログアウトしますか')>=0,'F4d 確認モーダルが出た');
ok(toastEl().textContent.indexOf('ログアウトしました')>=0,'F4e 完了はトースト通知');
ok(seen.slice(1).join('|').indexOf('ログアウトしました')<0,'F4f 成功はモーダルを出さない');

// F5: ログアウト（キャンセル）→ signOut を呼ばない
var shared2=statefulClient({user:{email:'me@club.jp'}},[{club_id:'c1',club_name:'沼津支部',status:'active'}]);
env.__setAuthClientTestFactory(function(){ return shared2; });
env.refreshAuthChip(true); await flush();
env.__setAppModalTestResolver(function(){ return false; }); // confirm=キャンセル
env.doAppLogout(); await flush();
ok(shared2._st.signOutCalls===0,'F5 キャンセル時は signOut を呼ばない');
ok(bar.innerHTML.indexOf('ログイン中')>=0,'F5b キャンセル後もログイン中のまま');

// F6: signOut が {error} を解決（reject でない失敗）→ 成功通知を出さず失敗通知・チップ維持
var errCli={_st:{},auth:{getSession:function(){return Promise.resolve({data:{session:{user:{email:'me@club.jp'}}}});},signOut:function(){return Promise.resolve({error:{message:'boom'}});}},rpc:function(){return Promise.resolve({data:[{club_id:'c1',club_name:'沼津支部',status:'active'}]});}};
env.__setAuthClientTestFactory(function(){ return errCli; });
env.refreshAuthChip(true); await flush();
toastEl().textContent='';
var seen2=[];
env.__setAppModalTestResolver(function(type,message){ seen2.push(String(message||'')); return true; });
env.doAppLogout(); await flush();
ok(seen2.join('|').indexOf('ログアウトに失敗')>=0,'F6 signOut が{error}解決時は失敗通知（appAlert）');
ok(toastEl().textContent.indexOf('ログアウトしました')<0,'F6b 失敗時は成功トーストを出さない');

console.log('');
console.log('PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
})();
