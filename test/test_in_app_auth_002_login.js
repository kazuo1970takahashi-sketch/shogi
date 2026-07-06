#!/usr/bin/env node
// IN-APP-AUTH-001 Slice3 (#645): 本体のアプリ内ログイン（マジックリンク送信）＋帰着時の早期セッション確立。
//   S: ソース＝［ログイン］ボタン・新関数・emailRedirectTo・DOMContentLoaded 帰着ブートの順序が存在。
//   P: 純関数＝isValidEmail / formatMagicLinkError（429/汎用/空）/ detectAuthCallback（hash/search 判定）。
//   F: 機能＝mock client 注入で requestMagicLink（成功/{error}/reject）・doAppLogin（送信/キャンセル/不正メール）・
//      bootAuthCallback（帰着＝ログイン中描画／非帰着＝skip）・#access_token= は isScoreboardRoute false。
//   client は __setAuthClientTestFactory・modal は __setAppModalTestResolver（実 createClient/DOM 依存なし）。fixture は架空のみ。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,href:'',download:'',style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},click(){},remove(){},insertBefore(){},removeChild(){}};}
const LOC={origin:'https://example.org',pathname:'/shogi_v4.html',hash:'',search:''};
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const warns=[];
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator','Blob','URL','FileReader','location',
    scripts()+';return {isValidEmail:isValidEmail,formatMagicLinkError:formatMagicLinkError,requestMagicLink:requestMagicLink,detectAuthCallback:detectAuthCallback,doAppLogin:doAppLogin,bootAuthCallback:bootAuthCallback,isScoreboardRoute:isScoreboardRoute,refreshAuthChip:refreshAuthChip,buildAuthChipHtml:buildAuthChipHtml,__setAuthClientTestFactory:__setAuthClientTestFactory,__setAppModalTestResolver:__setAppModalTestResolver};');
  const env=fn(doc,win,ls,{randomUUID:()=>'00000000-0000-0000-0000-000000000000'},function(){},()=>true,()=>'',{log(){},warn(m){warns.push(String(m));},error(){}},Promise,cb=>0,
    {onLine:true},function(){},{createObjectURL:()=>'blob:mock',revokeObjectURL(){}},function(){return null;},LOC);
  return {env,store,els,warns};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
const flush=async(n=8)=>{for(let i=0;i<n;i++)await Promise.resolve();};
function resetLoc(){ LOC.hash=''; LOC.search=''; }
// signInWithOtp を持つ mock client（+getSession/rpc）。opts: {session,memberships,error,reject}
function otpClient(opts){
  opts=opts||{};
  const st={otpCalls:0,lastEmail:'',lastRedirect:''};
  return {_st:st, auth:{
    signInWithOtp(p){ st.otpCalls++; st.lastEmail=p&&p.email; st.lastRedirect=p&&p.options&&p.options.emailRedirectTo;
      if(opts.reject)return Promise.reject(opts.rejectErr||{message:'neterr'});
      return Promise.resolve(opts.error?{error:opts.error}:{data:{},error:null}); },
    getSession(){ return Promise.resolve({data:{session:opts.session||null},error:null}); },
    signOut(){ return Promise.resolve({error:null}); } },
    rpc(){ return Promise.resolve({data:opts.memberships||[],error:null}); }};
}

(async function(){
console.log('=== IN-APP-AUTH-001 Slice3（アプリ内ログイン＋帰着ブート） ===');

// ---- S: ソース ----
console.log('=== S: ソース ===');
ok(RAW.indexOf('id="authLoginBtn"')>=0 && RAW.indexOf('auth-login-btn')>=0,'S1 未ログインチップに［ログイン］ボタン');
ok(RAW.indexOf('function doAppLogin')>=0 && RAW.indexOf('function requestMagicLink')>=0 && RAW.indexOf('function detectAuthCallback')>=0 && RAW.indexOf('function bootAuthCallback')>=0 && RAW.indexOf('function formatMagicLinkError')>=0 && RAW.indexOf('function isValidEmail')>=0,'S2 Slice3 主要関数が存在');
ok(RAW.indexOf('signInWithOtp(')>=0 && RAW.indexOf('emailRedirectTo:_authRedirectTo()')>=0,'S3 signInWithOtp＋emailRedirectTo=本体URL');
ok(RAW.indexOf('location.origin+location.pathname')>=0,'S4 戻り先は origin+pathname（ハッシュ/クエリ非含）');
ok(RAW.indexOf('_authCallbackClient=')>=0,'S5 帰着 client は module 変数へ封じ込め');
var iBoot=RAW.indexOf("if(typeof bootAuthCallback==='function')bootAuthCallback();");
var iScore=RAW.indexOf('initScoreboard();');
ok(iBoot>=0 && iScore>=0 && iBoot<iScore,'S6 DOMContentLoaded で帰着ブートを initScoreboard より前に呼ぶ（順序保証）');
ok(RAW.indexOf('読むだけ・消費しない')>=0,'S7 detectAuthCallback は読むだけ（消費は createClient）を明記');
ok(RAW.indexOf('function refreshAuthChip(fetchMembership,skipLoading)')>=0 && RAW.indexOf('if(!skipLoading)_renderAuthChip')>=0,'S8 refreshAuthChip に skipLoading ガード（チラつき防止）');
ok(RAW.indexOf('refreshAuthChip(true,true)')>=0,'S9 帰着ブートは skipLoading=true で確定状態へ一発描画');

const {env,els,warns}=makeEnv();
const bar=()=>els['auth-status-bar'];

// ---- P: 純関数 ----
console.log('=== P: 純関数 ===');
ok(env.isValidEmail('a@b.co')===true,'P1 valid email');
ok(env.isValidEmail(' a@b.co ')===true,'P2 前後空白を許容（trim）');
ok(env.isValidEmail('x')===false && env.isValidEmail('a@b')===false && env.isValidEmail('')===false,'P3 invalid email 群');
ok(env.formatMagicLinkError({status:429}).indexOf('上限')>=0,'P4 429→レート制限文言');
ok(env.formatMagicLinkError({message:'rate limit'}).indexOf('上限')>=0,'P5 rate limit 文字列→レート制限文言');
var g=env.formatMagicLinkError({});ok(g.indexOf('送信できませんでした')>=0,'P6 空 err→汎用文言（throw しない）');
ok(env.formatMagicLinkError({status:500}).indexOf('管理者')>=0,'P7 500→汎用（次の行動を添える）');
ok(warns.length>=1,'P8 失敗詳細は console.warn（画面に生エラーを出さない）');
resetLoc(); LOC.hash='#access_token=xx&refresh_token=yy&type=magiclink';
ok(env.detectAuthCallback()===true,'P9 #access_token= 帰着→true');
resetLoc(); LOC.search='?code=abc';
ok(env.detectAuthCallback()===true,'P10 ?code= 帰着→true（防御的分岐）');
resetLoc(); LOC.hash='#scoreboard';
ok(env.detectAuthCallback()===false,'P11 #scoreboard は認証帰着でない→false');
resetLoc();
ok(env.detectAuthCallback()===false,'P12 ハッシュ/クエリ無し→false');

// ---- F: 機能 ----
console.log('=== F: 機能 ===');
// F1: requestMagicLink 成功
var c1=otpClient({});
var r1=await env.requestMagicLink(c1,' me@club.jp ');
ok(r1.ok===true && c1._st.otpCalls===1,'F1 成功→ok:true・signInWithOtp 1回');
ok(c1._st.lastEmail==='me@club.jp','F1b メールは trim して送信');
ok(c1._st.lastRedirect==='https://example.org/shogi_v4.html','F1c emailRedirectTo=本体URL');
// F2: 不正メールは client を呼ばない
var c2=otpClient({});
var r2=await env.requestMagicLink(c2,'bad');
ok(r2.ok===false && c2._st.otpCalls===0,'F2 不正メール→送信せず ok:false');
// F3: {error} 解決
var c3=otpClient({error:{status:429,message:'rate limit'}});
var r3=await env.requestMagicLink(c3,'me@club.jp');
ok(r3.ok===false && r3.message.indexOf('上限')>=0,'F3 {error:429}→ok:false・レート制限文言');
// F4: reject でも {ok:false}（未処理にしない）
var c4=otpClient({reject:true});
var r4=await env.requestMagicLink(c4,'me@club.jp');
ok(r4.ok===false && r4.message.indexOf('送信できませんでした')>=0,'F4 reject→ok:false（throw しない）');

// F5: doAppLogin 成功（prompt=メール→送信→送信済み案内）
resetLoc();
var sent=otpClient({});
env.__setAuthClientTestFactory(function(){ return sent; });
var alerts=[];
env.__setAppModalTestResolver(function(type,message){ if(type==='alert'){alerts.push(String(message||''));return true;} if(type==='prompt')return 'me@club.jp'; return true; });
env.doAppLogin(); await flush();
ok(sent._st.otpCalls===1,'F5 doAppLogin→signInWithOtp 1回');
ok(alerts.join('|').indexOf('送りました')>=0,'F5b 送信済み案内モーダル');
// F6: doAppLogin キャンセル（prompt=null）→ 送信しない
var notsent=otpClient({});
env.__setAuthClientTestFactory(function(){ return notsent; });
env.__setAppModalTestResolver(function(type){ if(type==='prompt')return null; return true; });
env.doAppLogin(); await flush();
ok(notsent._st.otpCalls===0,'F6 キャンセル→送信しない');
// F7: doAppLogin 不正メール→送信せず形式エラー
var bad=otpClient({});
env.__setAuthClientTestFactory(function(){ return bad; });
var alerts2=[];
env.__setAppModalTestResolver(function(type,message){ if(type==='alert'){alerts2.push(String(message||''));return true;} if(type==='prompt')return 'notanemail'; return true; });
env.doAppLogin(); await flush();
ok(bad._st.otpCalls===0 && alerts2.join('|').indexOf('形式が正しくありません')>=0,'F7 不正メール→送信せず形式エラー');

// F8: bootAuthCallback 帰着（session あり）→ ログイン中を描画
resetLoc(); LOC.hash='#access_token=xx&type=magiclink';
env.__setAuthClientTestFactory(function(){ return otpClient({session:{user:{email:'me@club.jp'}},memberships:[{club_id:'c1',club_name:'沼津支部',status:'active'}]}); });
var b8=await env.bootAuthCallback(); await flush();
ok(bar().innerHTML.indexOf('ログイン中：me@club.jp')>=0,'F8 帰着ブート→ログイン状態バーがログイン中');
ok(b8 && b8.skipped!==true,'F8b 帰着時は skip しない');
// F9: bootAuthCallback 非帰着→ skip（何もしない）
resetLoc();
bar().innerHTML='__UNTOUCHED__';
var b9=await env.bootAuthCallback(); await flush();
ok(b9 && b9.skipped===true,'F9 非帰着→skipped:true');
ok(bar().innerHTML==='__UNTOUCHED__','F9b 非帰着ではバーを触らない（通常起動ゼロ改変）');
// F10: #access_token= は scoreboard ルートに一致しない（運営ビュー維持）
resetLoc(); LOC.hash='#access_token=xx';
ok(env.isScoreboardRoute()===false,'F10 #access_token= は isScoreboardRoute false（誤ルーティングなし）');
resetLoc();

// F11: skipLoading（帰着チラつき防止）＝中間 loading 描画を出さず確定状態へ一発
resetLoc();
env.__setAuthClientTestFactory(function(){ return otpClient({session:{user:{email:'me@club.jp'}},memberships:[{club_id:'c1',club_name:'沼津支部',status:'active'}]}); });
var barEl=bar();
barEl.innerHTML='';
env.refreshAuthChip(true,true);   // skipLoading=true（bootAuthCallback と同じ経路）
ok(barEl.innerHTML.indexOf('確認中')<0,'F11 skipLoading=true→同期時点で loading(確認中) を描画しない');
await flush();
ok(barEl.innerHTML.indexOf('ログイン中：me@club.jp')>=0,'F11b 最終はログイン中を一発描画');
// F12: 既定（skipLoading 無し）は従来どおり loading を出す（visibilitychange 等の後方互換）
barEl.innerHTML='';
env.refreshAuthChip(true);
ok(barEl.innerHTML.indexOf('確認中')>=0,'F12 既定は loading 中間描画を出す（後方互換）');
await flush();
ok(barEl.innerHTML.indexOf('ログイン中')>=0,'F12b 既定も最終はログイン中');

console.log('');
console.log('PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
})();
