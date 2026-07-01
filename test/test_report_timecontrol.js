#!/usr/bin/env node
// TIME-CONTROL-001: 持ち時間（報告書メタ・ロジック非影響）。区分（切れ負け/秒読み）＋持ち時間(分)＋秒読み(秒)を
//   大会ごとに設定でき、報告書に1行出力する。formatTimeControl / normalizer / renderTimeControlFields / 出力・UI 配線。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{display:''},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},focus(){},blur(){},remove(){}};}
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {formatTimeControl:formatTimeControl,normalizeReportTimeType:normalizeReportTimeType,normalizeReportTimeMain:normalizeReportTimeMain,normalizeReportTimeByoyomi:normalizeReportTimeByoyomi,renderTimeControlFields:renderTimeControlFields,_get:function(){return state;},_set:function(v){state=v;}};');
  return {env:fn(doc,win,ls,{randomUUID:()=>'0'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true}),els};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== formatTimeControl（整形） ===');
var E=makeEnv();var f=E.env.formatTimeControl;
ok(f({timeType:'sudden',timeMain:25})==='25分切れ負け','F1 切れ負け → 「25分切れ負け」');
ok(f({timeType:'byoyomi',timeMain:20,timeByoyomi:30})==='20分（切れたら一手30秒）','F2 秒読み → 「20分（切れたら一手30秒）」');
ok(f({})==='25分切れ負け','F3 欠落は既定「25分切れ負け」');
ok(f({timeType:'byoyomi',timeMain:15,timeByoyomi:60})==='15分（切れたら一手60秒）','F4 任意値も整形');

console.log('=== normalizer（クランプ/既定） ===');
ok(E.env.normalizeReportTimeType('byoyomi')==='byoyomi' && E.env.normalizeReportTimeType('x')==='sudden' && E.env.normalizeReportTimeType('')==='sudden','N1 区分はbyoyomi以外sudden');
ok(E.env.normalizeReportTimeMain('20')===20 && E.env.normalizeReportTimeMain(0)===25 && E.env.normalizeReportTimeMain('')===25,'N2 持ち時間(分)は正整数・不正は25');
ok(E.env.normalizeReportTimeByoyomi('30')===30 && E.env.normalizeReportTimeByoyomi(0)===30 && E.env.normalizeReportTimeByoyomi('x')===30,'N3 秒読み(秒)は正整数・不正は30');

console.log('=== 既定 state に持ち時間フィールド ===');
var s=E.env._get();
ok(s.report&&s.report.timeType==='sudden'&&s.report.timeMain===25&&s.report.timeByoyomi===30,'D1 既定 state.report は sudden/25/30');

console.log('=== renderTimeControlFields（秒読み欄トグル＋プレビュー） ===');
var Eb=makeEnv();var sb=Eb.env._get();sb.report.timeType='byoyomi';sb.report.timeMain=20;sb.report.timeByoyomi=30;Eb.env._set(sb);
Eb.env.renderTimeControlFields();
ok(Eb.els['rep-time-byoyomi-wrap'].style.display==='inline-flex','R1 秒読み時は秒欄を表示(inline-flex)');
ok(Eb.els['rep-time-preview'].textContent.indexOf('20分（切れたら一手30秒）')>=0,'R2 プレビューに整形文字列');
var Es=makeEnv();var ss=Es.env._get();ss.report.timeType='sudden';Es.env._set(ss);
Es.env.renderTimeControlFields();
ok(Es.els['rep-time-byoyomi-wrap'].style.display==='none','R3 切れ負け時は秒欄を隠す');

console.log('=== 報告書出力・UI・bind（RAW） ===');
ok(/font-weight:bold">持ち時間<\/td>/.test(RAW),'S1 報告書に「持ち時間」行を出力');
ok(RAW.indexOf('var timeControl=formatTimeControl(state.report)')>=0,'S2 buildReportHtml が formatTimeControl を使用');
ok(RAW.indexOf('id="rep-time-type"')>=0 && RAW.indexOf('id="rep-time-main"')>=0 && RAW.indexOf('id="rep-time-byoyomi"')>=0,'S3 区分/分/秒の入力欄');
ok(/getElementById\('rep-time-type'\)[\s\S]{0,160}addEventListener\('change'/.test(RAW),'S4 区分 change を bind');
ok(/getElementById\('rep-time-main'\)[\s\S]{0,220}normalizeReportTimeMain/.test(RAW),'S5 持ち時間(分)を state へ反映');

console.log('REPORT-TIMECONTROL: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
