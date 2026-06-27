#!/usr/bin/env node
// アーキ残 P2 (SYSTEM-REVIEW #384): A-6 複数 active クラブ誤選択防止（送信/取得で文言出し分け）/
//   A-8 schema_version additive-only ポリシー明文化 / A-9 loadCloudDeps オフライン事前ガード（offline マーカー）。
//   ※A-5（開催日ガード）は実 UI で today 既定に阻まれるため本スライスから除外（Codex #385 P1・別途検討）。
//   mock・架空のみ・fail-soft 維持・GOLDEN/CHAR 非影響。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
function makeCtx(){
  var headCalls=[];var head=n('head');
  head.appendChild=function(c){ headCalls.push(c); if(c&&typeof c.onerror==='function'){ try{c.onerror();}catch(e){} } this.childNodes.push(c); return c; };
  var el={};
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return {doc:doc,win:win,ls:ls,headCalls:headCalls};
}
function loadEnv(nav){
  const ctx=makeCtx();const js=extractScripts(target);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { pickActiveClubId:pickActiveClubId, loadCloudDeps:loadCloudDeps };`);
  return {env:fn(ctx.doc,ctx.win,ctx.ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'b';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;},nav),ctx:ctx};
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

(async function(){
  console.log('=== A-6 複数 active クラブ誤選択防止 ===');
  var P=loadEnv({onLine:true}).env.pickActiveClubId;
  ok(P([{status:'active',club_id:'c1'}])==='c1','A6-1 単一 active→club_id');
  ok(P([{status:'suspended',club_id:'c2'},{status:'active',club_id:'c1'}])==='c1','A6-2 suspended 除外');
  ok(P([{status:'active',club_id:'c1'},{status:'active',club_id:'c1'}])==='c1','A6-3 同一 club の重複 active→その club');
  ok(P([{status:'active',club_id:'c1'},{status:'active',club_id:'c2'}])===null,'A6-4 distinct な active 2件→null（誤クラブ防止）');
  ok(P([])===null,'A6-5 空→null');
  // P3 fix: 送信は「送信先」、取得は「取得元」で出し分け
  ok(RAW.indexOf('送信先クラブを一意に特定できません')>=0,'A6-6 送信側 club 文言（送信先）');
  ok(RAW.indexOf('取得元クラブを一意に特定できません')>=0,'A6-7 取得側 club 文言（取得元）');
  ok(RAW.indexOf('幹事として有効なクラブが見つかりません')<0,'A6-8 旧 club 文言は撤去');

  console.log('=== A-8 schema_version additive-only ポリシー明文化 ===');
  ok(RAW.indexOf('schema_version は **additive-only**')>=0,'A8-1 ポリシーコメントを明文化');

  console.log('=== A-9 loadCloudDeps オフライン事前ガード（offline マーカー）===');
  var off=loadEnv({onLine:false});
  var ro=await off.env.loadCloudDeps();
  ok(off.ctx.headCalls.length===0,'A9-1 offline→script 注入なし（無駄待ち回避）');
  ok(ro&&ro.offline===true,'A9-2 offline→offline:true マーカー');
  var on=loadEnv({onLine:true});
  var rn=await on.env.loadCloudDeps();
  ok(on.ctx.headCalls.length>0,'A9-3 online→script 注入を試みる（従来動作）');
  ok(!rn.offline,'A9-4 online→offline マーカー無し');
  // P3 fix: 呼び出し側が offline を cfg より先に判定し offline 案内
  ok(RAW.indexOf("if(dep.offline){ setStatus('オフラインのため送信できません")>=0,'A9-5 送信 caller が offline を先に判定');
  ok(RAW.indexOf("if(dep.offline){ setStatus('オフラインのため取得できません")>=0,'A9-6 取得 caller が offline を先に判定');
  ok(RAW.indexOf("resolve({cfg:_cloudCfgReady(),sb:_cloudSbReady(),offline:true})")>=0,'A9-7 preguard が offline:true を返す');

  console.log('ARCH-P2: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})();
