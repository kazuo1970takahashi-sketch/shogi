#!/usr/bin/env node
// CLOUD-SEND-UNLINKED-GUARD-001: クラウド送信時、会員マスタ未連携（member_id 無し）の参加者は
//   buildCloudSyncPayload で entries が作られず「対象外」＝クラウドの共有結果に載らない（1位でも黙って欠落し得る）。
//   (A) 送信前ガード＝未連携者がいれば confirm（名簿を更新して送信／このまま送信／中止）。
//   (C) 送信後注記＝skipped>0 を ⚠(warn/橙) に格上げし最上位者＋直し方を明示（#377 の中立注記を格上げ）。
//   本テストはソース配線＋純関数（collectUnlinkedParticipantsForSend / _unlinkedTopLabel / _unlinkedSkippedNote）を固定する。
//   架空データのみ・保存/順位ロジックには触れない（読み取り専用）。
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
    `${js};return { collectUnlinkedParticipantsForSend:collectUnlinkedParticipantsForSend, _unlinkedTopLabel:_unlinkedTopLabel, _unlinkedSkippedNote:_unlinkedSkippedNote, classifyCloudStatusKind:classifyCloudStatusKind, _setState:function(s){ state=s; } };`);
  return fn(doc,win,ls,{randomUUID:function(){return '0';}},function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();

// 甲(1位・winner)＝未連携（member_id 無し）／ 乙(2位)＝連携済み。実バグ（1位が初参加で未連携）を再現。
function mkState(){ return { tournament_id:'t-guard', rounds:1, classes:[{id:'A',name:'A'}],
  players:{ A:[{id:'a1',name:'甲',cls:'A'},{id:'a2',name:'乙',cls:'A',member_id:'m_a2'}] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] }, report:{ date:'2026-06-14', title:'六月例会' } }; }

console.log('=== R: 純関数（未連携検知・最上位ラベル・注記）===');
env._setState(mkState());
var unl=env.collectUnlinkedParticipantsForSend();
ok(unl.length===1,'R1 未連携は1名（連携済みは除外）');
ok(unl[0]&&unl[0].name==='甲'&&unl[0].rank===1,'R2 未連携の甲を順位1位付きで検知');
ok(env._unlinkedTopLabel(unl)==='最上位：1位 甲','R3 最上位ラベル＝「最上位：1位 甲」');
// 全員連携済みなら空
env._setState({ tournament_id:'t2', rounds:1, classes:[{id:'A',name:'A'}],
  players:{ A:[{id:'a1',name:'甲',cls:'A',member_id:'m_a1'},{id:'a2',name:'乙',cls:'A',member_id:'m_a2'}] },
  results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] }, report:{ date:'2026-06-14', title:'x' } });
ok(env.collectUnlinkedParticipantsForSend().length===0,'R4 全員連携済み→未連携ゼロ（ガードは出ない）');

console.log('=== C: 送信後注記（⚠・warn 分類）===');
env._setState(mkState());
var note=env._unlinkedSkippedNote(1);
ok(note.indexOf('⚠')>=0&&note.indexOf('未反映')>=0&&note.indexOf('再送信')>=0,'C1 注記は⚠＋未反映＋再送信案内を含む');
ok(note.indexOf('最上位：1位 甲')>=0,'C2 注記に最上位者を明示');
ok(env.classifyCloudStatusKind('送信しました（名簿 1 名・結果 1 件）'+note)==='warn','C3 未連携ありの送信後メッセージは warn(橙)');

console.log('=== W: ソース配線（RAW）===');
ok(RAW.indexOf('function collectUnlinkedParticipantsForSend(')>=0,'W1 未連携検知の純関数が存在');
ok(RAW.indexOf('function _confirmUnlinkedBeforeSend(')>=0,'W2 送信前ガードの確認関数が存在');
ok(RAW.indexOf('function _guardThenSend(')>=0,'W3 _guardThenSend が存在');
ok(RAW.indexOf('} else { _guardThenSend(); }')>=0&&RAW.indexOf('_guardThenSend();\n        });')>=0,'W4 送信は _dateGate→_guardThenSend 経由（_send 直呼びを置換）');
ok(RAW.indexOf("syncBranchMasterOnSave(function(){ _send(); })")>=0,'W5 「名簿を更新して送信」は既存 syncBranchMasterOnSave→送信');
ok(RAW.indexOf("okText:'名簿を更新して送信'")>=0&&RAW.indexOf("okText:'このまま送信'")>=0,'W6 3択（更新して送信／このまま送信）の文言を appConfirm 2 段で構成');
ok(RAW.indexOf("step:'cancelled-unlinked'")>=0,'W7 中止は step:cancelled-unlinked（fail-soft・運営続行）');
ok(RAW.indexOf('if(c.skipped)base+=_unlinkedSkippedNote(c.skipped)')>=0,'W8 送信後 skipped は _unlinkedSkippedNote で⚠格上げ');

console.log('CLOUD-SEND-UNLINKED-GUARD-001: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
