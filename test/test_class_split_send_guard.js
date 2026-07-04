#!/usr/bin/env node
// CLASS-SPLIT-CLOUD-MERGE-001 Phase 2 (#567) — 送信規律ガード検証。
//   ①buildCloudSyncPayload の opt-in classesFilter（非空配列のときのみ対象級に絞る・既定は全級＝挙動不変）
//   ②sendTargetClasses（純・players を持つ級の一覧＝getReportClassLabel でラベル化）
//   ③静的HTML（送信対象表示）＋refreshSendTargetClasses／showTab結線／sendTournamentToCloud 確認ガード／syncTournamentToCloud 通し。
//   入力は完全架空。当日運営テストへ非干渉（追加のみ）。実クラウドはブラウザ人手確認。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},select:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),head:n('head'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];},execCommand:function(){return true;}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls,el:el};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { buildCloudSyncPayload:buildCloudSyncPayload, sendTargetClasses:sendTargetClasses, getReportClassLabel:getReportClassLabel, refreshSendTargetClasses:refreshSendTargetClasses, _setState:function(s){ state=s; }, _doc:document };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{});
  return {env:env,ctx:ctx};
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

function mkState(){
  return { tournament_id:'t_2026_07_04', rounds:1,
    classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'}],
    players:{ A:[
      {id:'a1',name:'甲',yomi:'こう',cls:'A',member_id:'m_a1'},
      {id:'a2',name:'乙',yomi:'おつ',cls:'A',member_id:'m_a2'}
    ], B:[
      {id:'b1',name:'丙',yomi:'へい',cls:'B',member_id:'m_b1'},
      {id:'b2',name:'丁',yomi:'てい',cls:'B',member_id:'m_b2'}
    ] },
    results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]], B:[[{p1:'b1',p2:'b2',winner:'b1'}]] },
    report:{ date:'2026-07-04', title:'七月例会' } };
}
const master={ schema_version:1, members:[
  {id:'m_a1',name:'甲',yomi:'こう'},{id:'m_a2',name:'乙',yomi:'おつ'},
  {id:'m_b1',name:'丙',yomi:'へい'},{id:'m_b2',name:'丁',yomi:'てい'}
]};
function clsSet(entries){var s={};for(var i=0;i<entries.length;i++)s[entries[i]['class']]=true;return Object.keys(s).sort().join(',');}

console.log('=== F: classesFilter（opt-in・既定は挙動不変）===');
var L=loadEnv();var E=L.env;
E._setState(mkState());
var plAll=E.buildCloudSyncPayload(master,{clubId:'club-1'});
ok(clsSet(plAll.entries)==='A,B','F1 既定（filter 無し）は全級 entries（A,B）');
ok(plAll.entries.length===4,'F2 既定 entries は4件');
E._setState(mkState());
var plA=E.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:['A']});
ok(clsSet(plA.entries)==='A','F3 classesFilter=[A]→A のみ');
ok(plA.entries.length===2,'F4 A のみ entries 2件');
ok(plA.members.length===2&&plA.players.length===2,'F5 A のみ members/players 2件（B会員は載らない）');
ok(plA.members.filter(function(m){return m.member_id==='m_b1';}).length===0,'F6 B会員 m_b1 は含まれない');
E._setState(mkState());
var plB=E.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:['B']});
ok(clsSet(plB.entries)==='B'&&plB.entries.length===2,'F7 classesFilter=[B]→B のみ2件');
E._setState(mkState());
var plEmpty=E.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:[]});
ok(clsSet(plEmpty.entries)==='A,B','F8 空配列は既定と同じ全級（footgun 回避＝挙動不変）');
E._setState(mkState());
var plUnknown=E.buildCloudSyncPayload(master,{clubId:'club-1',classesFilter:['Z']});
ok(plUnknown.entries.length===0,'F9 非該当級のみ指定→0件（該当なし）');

console.log('=== G: sendTargetClasses（純・players を持つ級）===');
var g=loadEnv();var G=g.env;
ok(G.sendTargetClasses(mkState()).length===2,'G1 A/B とも players→2件');
var tg=G.sendTargetClasses(mkState());
ok(tg[0].id==='A'&&tg[0].label==='A級'&&tg[0].count===2,'G2 A級・count=2（getReportClassLabel でラベル）');
ok(tg[1].id==='B'&&tg[1].label==='B級'&&tg[1].count===2,'G3 B級・count=2');
var stOneEmpty=mkState(); stOneEmpty.players.B=[];
ok(G.sendTargetClasses(stOneEmpty).length===1&&G.sendTargetClasses(stOneEmpty)[0].id==='A','G4 空の級は除外（A のみ）');
ok(G.sendTargetClasses(null).length===0,'G5 null→空');
ok(G.sendTargetClasses({classes:'x'}).length===0,'G6 classes 非配列→空');

console.log('=== H: 静的HTML＋結線 ===');
ok(RAW.indexOf('id="sendTargetLine"')>=0,'H1 送信対象表示要素');
ok(RAW.indexOf('function sendTargetClasses(')>=0,'H2 sendTargetClasses 定義');
ok(RAW.indexOf('function refreshSendTargetClasses(')>=0,'H3 refreshSendTargetClasses 定義');
ok(RAW.indexOf("if(t==='result'){renderResults();")>=0&&RAW.indexOf('refreshSendTargetClasses();}')>=0,'H4 showTab(result) で refresh 結線');
ok(RAW.indexOf('classesFilter:opts.classesFilter')>=0,'H5 syncTournamentToCloud→buildCloudSyncPayload に classesFilter 通し');
ok(RAW.indexOf("step:'cancelled'")>=0&&RAW.indexOf('sendTargetClasses((typeof state')>=0,'H6 送信ガード（confirm→cancelled）が sendTournamentToCloud に存在');
ok(RAW.indexOf('sendTargetLine')>RAW.indexOf('id="cloudSendStatus"'),'H7 送信対象表示はクラウド送信近傍（cloudSendStatus 後）');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
