#!/usr/bin/env node
// A-2 (SYSTEM-REVIEW #377 follow): push の未解決 entry を黙って成功扱いにしない。
//   syncTournamentToCloud が unresolved>0 のとき warn:true を返す／sendTournamentToCloud が ⚠ 警告文言
//   （U-1 classifyCloudStatusKind で warn=橙）に格上げ。mock client・架空のみ・冪等再送は不変。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
const RAW=fs.readFileSync(target,'utf8');
function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
function loadEnv(){
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  const js=extractScripts(target);
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { syncTournamentToCloud:syncTournamentToCloud, classifyCloudStatusKind:classifyCloudStatusKind, _setState:function(s){ state=s; } };`);
  return fn(doc,win,ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
function makeClient(cfg){ cfg=cfg||{};
  function builder(table,rows,opts){ var b={_sel:null};
    b.select=function(c){this._sel=c;return this;};
    b.then=function(res,rej){ var t=cfg[table]||{}; return Promise.resolve({data:(t.data!==undefined?t.data:null),error:(t.error||null)}).then(res,rej); };
    return b; }
  return { from:function(table){ return { upsert:function(rows,opts){ return builder(table,rows,opts); } }; } };
}
function mkState(){ return { tournament_id:'t-a2', rounds:1, classes:[{id:'A',name:'A'}],
  players:{ A:[{id:'a1',name:'甲',cls:'A',member_id:'m_a1'},{id:'a2',name:'乙',cls:'A',member_id:'m_a2'}] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] }, report:{ date:'2026-06-14', title:'六月例会' } }; }
const master={ members:[{id:'m_a1',name:'甲'},{id:'m_a2',name:'乙'}] };
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();

(async function(){
  console.log('=== A-2 warn フラグ ===');
  // 全解決＝warn:false
  env._setState(mkState());
  var cliOk=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'},{id:'p2',member_id:'m_a2'}]}, tournaments:{data:[{id:'t-uuid'}]} });
  var r1=await env.syncTournamentToCloud(cliOk,master,{clubId:'c1'});
  ok(r1.ok===true&&r1.warn===false,'A1 全解決→ok:true,warn:false');
  ok(r1.counts.unresolved===0&&r1.counts.entries===2,'A2 unresolved=0,entries=2');

  // players が m_a1 のみ id を返す→m_a2 が未解決＝warn:true
  env._setState(mkState());
  var cliPartial=makeClient({ players:{data:[{id:'p1',member_id:'m_a1'}]}, tournaments:{data:[{id:'t-uuid'}]} });
  var r2=await env.syncTournamentToCloud(cliPartial,master,{clubId:'c1'});
  ok(r2.ok===true&&r2.warn===true,'A3 未解決あり→ok:true,warn:true（黙って成功にしない）');
  ok(r2.counts.unresolved===1,'A4 unresolved=1');
  ok(r2.counts.entries===1,'A5 送れた entries=1（解決分のみ）');

  console.log('=== A-2 メッセージ分類（U-1 連携）===');
  var C=env.classifyCloudStatusKind;
  ok(C('⚠ 一部の結果を送信できませんでした：未解決 1 名。送信しました（名簿 2 名・結果 1 件）支部マスタへ紐付けてから再送してください（冪等・運営は続行できます）')==='warn','M1 ⚠未解決→warn(橙)');
  ok(C('送信しました（名簿 2 名・結果 2 件）')==='ok','M2 完全成功→ok(緑)');
  // CLOUD-SEND-UNLINKED-GUARD-001: #377 の「skipped は中立注記(ok/緑)」を、未連携者が共有結果から
  //   黙って欠落する（1位が消える）問題を受けて ⚠ 警告(warn/橙) に格上げ。M3 の期待も warn へ更新。
  ok(C('送信しました（名簿 2 名・結果 1 件）　⚠ 未連携 1 名（最上位：1位 甲）は共有結果に未反映です。「📋 名簿を更新」→ 再送信で反映できます。')==='warn','M3 未連携ありは⚠→warn(橙・CLOUD-SEND-UNLINKED-GUARD-001 で中立注記から格上げ)');

  console.log('=== A-2 配線（RAW）===');
  ok(/\{ok:true,warn:\(counts\.unresolved>0\),counts:counts,tournament_id:tid\}/.test(RAW),'W1 ok 返却に warn フラグ');
  ok(RAW.indexOf("if(res.warn){ base='⚠ 一部の結果を送信できませんでした")>=0,'W2 sendTournamentToCloud が res.warn で ⚠ 格上げ');
  ok(RAW.indexOf('if(c.skipped)base+=_unlinkedSkippedNote(c.skipped)')>=0,'W3 skipped は _unlinkedSkippedNote(⚠未反映) に格上げ（CLOUD-SEND-UNLINKED-GUARD-001）');

  console.log('A2-PARTIAL-WARN: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})();
