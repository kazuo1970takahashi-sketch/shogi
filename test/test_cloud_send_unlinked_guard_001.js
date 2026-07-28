#!/usr/bin/env node
// CLOUD-SEND-UNLINKED-GUARD-001: クラウド送信時、会員マスタ未連携（member_id 無し）の参加者は
//   buildCloudSyncPayload で entries が作られず「対象外」＝クラウドの共有結果に載らない（1位でも黙って欠落し得る）。
//   (A) 送信前ガード＝未連携者がいれば confirm（名簿に反映して送信／このまま送信／中止。
//       L2-SWEEP-01 ④ #782 レビュー Nice-2: 旧「名簿を更新して送信」から新語彙へ・文言のみ・分岐不変）。
//   (C) 送信後注記＝skipped>0 を ⚠(warn/橙) に格上げし最上位者＋直し方を明示（#377 の中立注記を格上げ）。
//   本テストは (R/C) 純関数・(W) ソース配線に加え、(B) __setAppModalTestResolver によるガード3経路の
//   挙動テスト（L3 レビュー指摘1対応）を固定する。B 系は loadCloudDeps を config 不在で止め、
//   res.step==='config' 到達＝「_send まで進んだ」ことの証明に使う（実クラウドへは出ない・mock のみ）。
//   架空データのみ。
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
    `${js};return { collectUnlinkedParticipantsForSend:collectUnlinkedParticipantsForSend, _unlinkedTopLabel:_unlinkedTopLabel, _unlinkedSkippedNote:_unlinkedSkippedNote, classifyCloudStatusKind:classifyCloudStatusKind, sendTournamentToCloud:sendTournamentToCloud, __setAppModalTestResolver:__setAppModalTestResolver, loadBranchMaster:loadBranchMaster, _setState:function(s){ state=s; } };`);
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

// === B: ガード3経路の挙動テスト（L3 レビュー指摘1対応）===
//   モーダルは __setAppModalTestResolver で自動応答（message 内容でディスパッチ）。
//   loadCloudDeps は config/supabase 不在＋script 注入失敗（mock）で {cfg:false} → step:'config'。
//   よって res.step==='config' ＝「ガードを通過して _send に到達した」ことの決定的な証拠になる。
// L3 再レビュー指摘1 対応: resolve 漏れ（ハング）を silent PASS にしないウォッチドッグ。
//   実 setTimeout（sandbox 外の node 実タイマー）なのでイベントループが維持され、
//   「未解決 await → ループ枯渇 → exit 0」の fail-open が起きず、必ず FAIL(exit 1) になる。
var _wd=setTimeout(function(){
  console.log('  FAIL: timeout（sendTournamentToCloud の Promise が resolve されていない疑い）');
  console.log('CLOUD-SEND-UNLINKED-GUARD-001: PASS='+pass+' FAIL='+(fail+1));
  process.exit(1);
},15000);
function runSend(answers){
  // answers: {date:bool, guard1:bool, guard2:bool}。prompts: 表示された confirm メッセージの記録。
  // L3 再レビュー指摘2 対応: 既知パターン以外の confirm は unexpected に記録し、各経路で 0 件をアサートする
  //   （無条件 return true の広い許容をやめ、想定外モーダルの出現を検知可能にする。応答は true で先へ進め、ハングはさせない）。
  var env=loadEnv();
  var prompts=[],unexpected=[];
  env.__setAppModalTestResolver(function(type,message){
    var m=String(message==null?'':message); prompts.push(m);
    if(m.indexOf('実施日')>=0)return answers.date;
    if(m.indexOf('名簿に反映してから送信しますか')>=0)return answers.guard1;
    if(m.indexOf('このまま送信しますか')>=0)return answers.guard2;
    unexpected.push(m); return true;
  });
  var statuses=[];
  return {env:env,prompts:prompts,unexpected:unexpected,statuses:statuses,
    send:function(){ return env.sendTournamentToCloud(function(s){statuses.push(String(s));}); }};
}
function guardShown(prompts){ var c=0; for(var i=0;i<prompts.length;i++){ if(prompts[i].indexOf('名簿に未連携の参加者')>=0)c++; } return c; }
function stage2Shown(prompts){ var c=0; for(var i=0;i<prompts.length;i++){ if(prompts[i].indexOf('このまま送信しますか')>=0)c++; } return c; }

(async function(){
  console.log('=== B: 挙動（3経路・mock）===');
  // B1: 全員連携済み → ガードは出ず _send 到達（step:'config'）
  var t1=runSend({date:true});
  t1.env._setState({ tournament_id:'t-b1', rounds:1, classes:[{id:'A',name:'A'}],
    players:{ A:[{id:'a1',name:'甲',cls:'A',member_id:'m_a1'},{id:'a2',name:'乙',cls:'A',member_id:'m_a2'}] },
    results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] }, report:{ date:'2026-06-14', title:'六月例会' } });
  var r1=await t1.send();
  ok(guardShown(t1.prompts)===0,'B1-1 全員連携済み→ガード confirm は表示されない');
  ok(r1&&r1.ok===false&&r1.step==='config','B1-2 従来どおり _send へ到達（step:config）');
  ok(t1.unexpected.length===0,'B1-3 想定外の confirm は表示されない');

  // B2: 未連携あり・1段目=反映しない・2段目=中止 → cancelled-unlinked（送信未到達）
  var t2=runSend({date:true,guard1:false,guard2:false});
  t2.env._setState(mkState());
  var r2=await t2.send();
  ok(guardShown(t2.prompts)===1&&stage2Shown(t2.prompts)===1,'B2-1 ガード2段が表示される');
  ok(r2&&r2.ok===false&&r2.step==='cancelled-unlinked','B2-2 中止→{ok:false,step:cancelled-unlinked} で exactly-once resolve');
  ok(t2.statuses.length&&t2.statuses[t2.statuses.length-1].indexOf('送信を中止しました')>=0,'B2-3 中止 status に再送信案内');
  ok(t2.unexpected.length===0,'B2-4 想定外の confirm は表示されない');

  // B3: 未連携あり・1段目=反映しない・2段目=このまま送信 → _send 到達
  var t3=runSend({date:true,guard1:false,guard2:true});
  t3.env._setState(mkState());
  var r3=await t3.send();
  ok(r3&&r3.step==='config','B3-1 このまま送信→ _send へ到達（step:config）');
  ok(t3.unexpected.length===0,'B3-2 想定外の confirm は表示されない');

  // B4: 未連携あり・1段目=名簿に反映して送信 → syncBranchMasterOnSave が member_id を付与してから _send 到達
  var t4=runSend({date:true,guard1:true});
  t4.env._setState(mkState());
  var before=t4.env.collectUnlinkedParticipantsForSend();
  var r4=await t4.send();
  var after=t4.env.collectUnlinkedParticipantsForSend();
  var members=(t4.env.loadBranchMaster()||{}).members||[];
  var hasKo=false; for(var mi=0;mi<members.length;mi++){ if(members[mi]&&members[mi].name==='甲')hasKo=true; }
  ok(before.length===1&&after.length===0,'B4-1 反映して送信→未連携が解消される（member_id 付与）');
  ok(hasKo,'B4-2 初参加者が支部マスタへ新規登録される');
  ok(r4&&r4.step==='config','B4-3 名簿反映後に _send へ到達（step:config）');
  ok(stage2Shown(t4.prompts)===0,'B4-4 1段目 OK なら2段目は表示されない');
  ok(t4.unexpected.length===0,'B4-5 想定外の confirm は表示されない（名簿反映経路含む）');

  clearTimeout(_wd);
  console.log('CLOUD-SEND-UNLINKED-GUARD-001: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})().catch(function(e){ console.log('  FAIL: B 系で例外: '+((e&&e.stack)||e)); console.log('CLOUD-SEND-UNLINKED-GUARD-001: PASS='+pass+' FAIL='+(fail+1)); process.exit(1); });

console.log('=== W: ソース配線（RAW）===');
ok(RAW.indexOf('function collectUnlinkedParticipantsForSend(')>=0,'W1 未連携検知の純関数が存在');
ok(RAW.indexOf('function _confirmUnlinkedBeforeSend(')>=0,'W2 送信前ガードの確認関数が存在');
ok(RAW.indexOf('function _guardThenSend(')>=0,'W3 _guardThenSend が存在');
ok(RAW.indexOf('} else { _guardThenSend(); }')>=0&&RAW.indexOf('_guardThenSend();\n        });')>=0,'W4 送信は _dateGate→_guardThenSend 経由（_send 直呼びを置換）');
ok(RAW.indexOf("syncBranchMasterOnSave(function(){ _send(); })")>=0,'W5 「名簿に反映して送信」は既存 syncBranchMasterOnSave→送信');
ok(RAW.indexOf("okText:'名簿に反映して送信'")>=0&&RAW.indexOf("okText:'このまま送信'")>=0,'W6 3択（反映して送信／このまま送信）の文言を appConfirm 2 段で構成');
ok(RAW.indexOf("step:'cancelled-unlinked'")>=0,'W7 中止は step:cancelled-unlinked（fail-soft・運営続行）');
ok(RAW.indexOf('if(c.skipped)base+=_unlinkedSkippedNote(c.skipped)')>=0,'W8 送信後 skipped は _unlinkedSkippedNote で⚠格上げ');
// 総括・exit は非同期 B 系（上の async IIFE）が担う（同期側で exit すると B 実行前に落ちるため置かない）。
