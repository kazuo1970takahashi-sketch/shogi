#!/usr/bin/env node
// CLASS-SPLIT-CLOUD-MERGE-001 Phase 3 (#572) — 成績発表の統合レポート（級別結合・閲覧専用）検証。
//   resolveReportTournamentId（純・state.tournament_id を既存 normalizeTournamentIdInput で解決／生成しない）／
//   buildCloudMergedReportHtml（純・☁閲覧専用バナー＋既存 buildCloudResultBlocksHtml 流用＝級別セクション）／
//   静的 HTML（専用ボタン・status・コンテナ）＋ bindReportEvents 結線／loadCloudMergedReportUI が読取専用
//   （saveData を呼ばない）＋ 既存読取関数の再利用（fetchCloudEntriesForTournament）を固定する。
//   実クラウド通信はブラウザ人手確認（本テストは純関数＋ソース構造）。node で実走。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},_a:{},childNodes:[],appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},select:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var head=n('head');
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},head:head,body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];},execCommand:function(){return true;}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { resolveReportTournamentId:resolveReportTournamentId, buildCloudMergedReportHtml:buildCloudMergedReportHtml };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{});
  return {env:env,ctx:ctx};
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

console.log('=== R: resolveReportTournamentId（純・生成しない）===');
var L=loadEnv();var E=L.env;
ok(E.resolveReportTournamentId({tournament_id:'t_2026_07_04'})==='t_2026_07_04','R1 正常形はそのまま');
ok(E.resolveReportTournamentId({tournament_id:'t_2026_07_04_2'})==='t_2026_07_04_2','R2 サフィックス付きも受理');
ok(E.resolveReportTournamentId({})==='','R3 未設定→空（新規生成しない）');
ok(E.resolveReportTournamentId(null)==='','R4 null state→空');
ok(E.resolveReportTournamentId({tournament_id:'bad'})==='','R5 不正形→空');

console.log('=== B: buildCloudMergedReportHtml（純・バナー＋既存レンダラ流用）===');
var entries=[
  {final_rank:1,'class':'A',wins:3,losses:0,sos:5,sodos:4,player_id:'p1',players:{member_id:'m1',members:{name:'架空甲',yomi:'かくうこう'}}},
  {final_rank:2,'class':'A',wins:2,losses:1,sos:4,sodos:3,player_id:'p2',players:{member_id:'m2',members:{name:'架空乙',yomi:'かくうおつ'}}},
  {final_rank:1,'class':'B',wins:3,losses:0,sos:3,sodos:2,player_id:'p3',players:{member_id:'m3',members:{name:'架空丙',yomi:'かくうへい'}}}
];
var h=E.buildCloudMergedReportHtml(entries,false);
ok(h.indexOf('成績発表・統合レポート')>=0,'B1 統合レポートのバナー見出しあり');
ok(h.indexOf('閲覧専用')>=0,'B2 閲覧専用の明示あり');
ok(h.indexOf('Aクラス 最終結果')>=0,'B3 A級セクション（buildCloudResultBlocksHtml 流用）');
ok(h.indexOf('Bクラス 最終結果')>=0,'B4 B級セクション');
ok(h.indexOf('架空甲')>=0&&h.indexOf('架空丙')>=0,'B5 両級の氏名が描画される');
ok(h.indexOf('Aクラス 最終結果')<h.indexOf('Bクラス 最終結果'),'B6 級はソート順（A→B）で並ぶ');
var he=E.buildCloudMergedReportHtml([],false);
ok(he.indexOf('成績発表・統合レポート')>=0&&he.indexOf('この大会の結果がありません')>=0,'B7 空でもバナー＋空メッセージ（既存挙動へ委譲）');

console.log('=== H: 静的 HTML＋bindReportEvents 結線 ===');
ok(RAW.indexOf('id="cloudMergedReportBtn"')>=0,'H1 統合レポートボタン');
ok(RAW.indexOf('id="cloudMergedReportStatus"')>=0,'H2 status 表示要素');
ok(RAW.indexOf('id="cloudMergedReport"')>=0,'H3 描画コンテナ');
ok(RAW.indexOf('両級まとめて表示（統合レポート）')>=0,'H4 ボタンラベル');
ok(RAW.indexOf('id="cloudMergedReportBtn"')>RAW.indexOf('id="applyTidBtn"'),'H5 大会IDシェア枠の後（報告書エリア）に配置');
ok(RAW.indexOf("getElementById('cloudMergedReportBtn')")>=0&&RAW.indexOf('loadCloudMergedReportUI(')>=0,'H6 click 結線');

console.log('=== S: 読取専用＋既存資産の再利用 ===');
// loadCloudMergedReportUI 本体（関数宣言から次の function まで）を切り出し、read-only（saveData 非呼出）と
//   既存読取関数の再利用（fetchCloudEntriesForTournament / buildCloudMergedReportHtml）を固定する。
var mo=RAW.indexOf('function loadCloudMergedReportUI(');
var body=mo>=0?RAW.slice(mo,RAW.indexOf('\nfunction ',mo+1)):'';
ok(mo>=0,'S1 loadCloudMergedReportUI 定義あり');
ok(body.indexOf('saveData')<0,'S2 読取専用（当日運営 state を saveData で書き換えない）');
ok(body.indexOf('fetchCloudEntriesForTournament(')>=0,'S3 既存 entries 読取を再利用');
ok(body.indexOf('resolveReportTournamentId(')>=0,'S4 現在の大会IDを resolveReportTournamentId で解決');
ok(body.indexOf('buildCloudMergedReportHtml(')>=0,'S5 純レンダラで描画');
ok(body.indexOf('fetchCloudTournamentIdByAppId(')>=0,'S7 hotfix: app_tournament_id→uuid を解決してから entries を引く');
ok(body.indexOf('fetchCloudTournamentIdByAppId(')<body.indexOf('fetchCloudEntriesForTournament('),'S8 hotfix: uuid 解決は entries 取得より前');
ok(body.indexOf('fetchCloudEntriesForTournament(client,tr.id')>=0,'S9 hotfix: entries には解決済み uuid(tr.id) を渡す');
var moh=RAW.indexOf('function fetchCloudTournamentIdByAppId(');
var hb=moh>=0?RAW.slice(moh,RAW.indexOf('\nfunction ',moh+1)):'';
ok(moh>=0,'S10 hotfix: fetchCloudTournamentIdByAppId 定義あり');
ok(hb.indexOf("from('tournaments')")>=0&&hb.indexOf("eq('app_tournament_id'")>=0,'S11 hotfix: tournaments を app_tournament_id で照合');
ok(hb.indexOf("select('id')")>=0,'S12 hotfix: uuid(id) を取得');

ok(RAW.indexOf("id=\"cloudMergedReport\"")>RAW.indexOf("id=\"cloudSendBtn\""),'S6 クラウド送信近傍（報告書エリア）に配置');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
