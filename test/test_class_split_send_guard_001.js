#!/usr/bin/env node
// CLASS-SPLIT-CLOUD-MERGE-001 Phase 2 — 送信規律ガード（opt-in classesFilter）検証。
//   buildCloudSyncPayload(master,{classesFilter:[...]}) の追加挙動を純関数レベルで検証する。
//   観点（設計 §3.3 / design #541・verdict conditional-go）:
//     - 既定（classesFilter 未指定 / null / 空配列 / 非配列）は従来どおり全級送信＝挙動不変（opt-in gate）。
//     - classesFilter=['A'] は A 級だけ送る（entries/members/players とも B 級由来を除外）。
//     - classesFilter=['B'] は B 級だけ送る。
//     - 相手級しか含まないフィルタ（存在しない級・自級に該当なし）は空送信（誤って全送信しない）。
//     - clubId スタンプ等の既存挙動はフィルタ併用でも保持。
//   入力は完全架空。当日運営テストへ非干渉（純追加関数・追加のみ）。
const fs=require('fs');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function makeNode(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',style:{},_attrs:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};
  var doc={getElementById:function(id){if(!el[id]){var n=makeNode('div');n.id=id;el[id]=n;}return el[id];},createElement:function(t){return makeNode(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:makeNode('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
const target=process.argv[2]; if(!target){console.error('usage: node test_class_split_send_guard_001.js <html>');process.exit(1);}
function loadEnv(){
  const ctx=makeContext(); const js=extractScripts(target);
  const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { buildCloudSyncPayload:buildCloudSyncPayload, _setState:function(s){ state=s; } };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();
function mkState(){
  return { tournament_id:'t-split', rounds:1,
    classes:[{id:'A',name:'A級'},{id:'B',name:'B級'}],
    players:{ A:[
      {id:'a1',name:'甲',yomi:'こう',cls:'A',member_id:'m_a1'},
      {id:'a2',name:'乙',yomi:'おつ',cls:'A',member_id:'m_a2'}
    ], B:[
      {id:'b1',name:'丙',yomi:'へい',cls:'B',member_id:'m_b1'},
      {id:'b2',name:'丁',yomi:'てい',cls:'B',member_id:'m_b2'}
    ] },
    results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]], B:[[{p1:'b1',p2:'b2',winner:'b1'}]] },
    report:{ date:'2026-06-14', title:'六月例会' } };
}
const master={ schema_version:1, members:[
  {id:'m_a1',name:'甲',yomi:'こう'},{id:'m_a2',name:'乙',yomi:'おつ'},
  {id:'m_b1',name:'丙',yomi:'へい'},{id:'m_b2',name:'丁',yomi:'てい'}
]};
function classesOf(pl){var s={};for(var i=0;i<pl.entries.length;i++)s[pl.entries[i]['class']]=true;var a=[];for(var k in s)a.push(k);a.sort();return a.join(',');}
function memberIds(pl){var a=[];for(var i=0;i<pl.members.length;i++)a.push(pl.members[i].member_id);a.sort();return a.join(',');}

console.log('=== D: 既定（フィルタ無し）は全級送信＝挙動不変 ===');
env._setState(mkState());
var d0=env.buildCloudSyncPayload(master,{clubId:'club-1'});
ok(d0.entries.length===4,'D1 フィルタ無し: entries=4（A2+B2）');
ok(classesOf(d0)==='A,B','D2 フィルタ無し: class は A,B 両方');
ok(memberIds(d0)==='m_a1,m_a2,m_b1,m_b2','D3 フィルタ無し: members 4件');
ok(d0.players.length===4,'D4 フィルタ無し: players 4件');
env._setState(mkState());
var dNull=env.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:null});
ok(dNull.entries.length===4,'D5 classesFilter:null は全級（既定と同じ）');
env._setState(mkState());
var dEmpty=env.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:[]});
ok(dEmpty.entries.length===4,'D6 classesFilter:[] は全級（空配列は opt-in しない＝既定）');
env._setState(mkState());
var dBad=env.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:'A'});
ok(dBad.entries.length===4,'D7 classesFilter が非配列(文字列)は無視＝全級（既定・堅牢化）');

console.log('=== A: classesFilter=[A] は A 級だけ送る ===');
env._setState(mkState());
var pA=env.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:['A']});
ok(pA.entries.length===2,'A1 A級のみ: entries=2');
ok(classesOf(pA)==='A','A2 A級のみ: class は A だけ');
ok(memberIds(pA)==='m_a1,m_a2','A3 A級のみ: members は m_a1,m_a2（B級会員を送らない）');
ok(pA.players.length===2,'A4 A級のみ: players 2件');
ok(pA.entries.filter(function(e){return e['class']==='B';}).length===0,'A5 A級のみ: B級 entry は 0');
ok(pA.tournament.app_tournament_id==='t-split','A6 tournament 行は不変（両担当で一致前提）');
ok(pA.entries[0].club_id==='club-1'&&pA.members[0].club_id==='club-1','A7 clubId スタンプはフィルタ併用でも保持');

console.log('=== B: classesFilter=[B] は B 級だけ送る ===');
env._setState(mkState());
var pB=env.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:['B']});
ok(pB.entries.length===2,'B1 B級のみ: entries=2');
ok(classesOf(pB)==='B','B2 B級のみ: class は B だけ');
ok(memberIds(pB)==='m_b1,m_b2','B3 B級のみ: members は m_b1,m_b2');

console.log('=== N: 該当級を持たない端末のフィルタは空送信（誤って全送信しない）===');
env._setState(mkState());
var pN=env.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:['C']});
ok(pN.entries.length===0,'N1 存在しない級 C フィルタ: entries=0');
ok(pN.members.length===0&&pN.players.length===0,'N2 members/players も 0');
ok(pN.tournament.app_tournament_id==='t-split','N3 tournament 行は生成される（空 entries でも大会は不変）');

console.log('=== M: 複数級指定（[A,B]）は両方送る＝全級と同値 ===');
env._setState(mkState());
var pAB=env.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:['A','B']});
ok(pAB.entries.length===4,'M1 [A,B]: entries=4');
ok(classesOf(pAB)==='A,B','M2 [A,B]: class 両方');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
