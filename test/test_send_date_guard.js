#!/usr/bin/env node
// SEND-DATE-CONFIRM-002 (#622) — ☁送信前に「記録される実施日」を毎回確認する検証（#600 SEND-DATE-GUARD-001 を置換）。
//   REPORT-UX-001 の日付自動補完（未設定→今日）で UI 上「未設定」状態が存在せず #600 の未設定ガードは実質作動しない。
//   案A（作者決定 2026-07-05）: 未設定のみ confirm → 毎回 confirm。sendTournamentToCloud 冒頭のガードが
//   ①送信のたびに confirm（getTournamentDateFromReport が返す実際の記録日を明示）
//   ②キャンセルで中止（step:'cancelled-date'・fail-soft・次の行動を案内）
//   ③続行なら送信フローへ通過（ブロックしない）を満たすことを確認する。
//   入力は完全架空。当日運営テストへ非干渉（追加のみ）。navigator.onLine=false で実ネットワーク不使用。
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
// confirm を差し替え可能にした env ローダ（confirm 呼び出し履歴を記録）。
function loadEnv(confirmResult){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const calls=[];
  const confirmFn=function(msg){calls.push(String(msg));return confirmResult;};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};return { sendTournamentToCloud:sendTournamentToCloud, todayYmd:todayYmd, __setAppModalTestResolver:__setAppModalTestResolver, _setState:function(s){ state=s; } };`);
  const env=fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},confirmFn,function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(cb){return 0;},{onLine:false});
  // IN-APP-MODAL-001: 送信前 confirm はアプリ内モーダル化済。同期解決シームへ配線（メッセージ捕捉＋confirmResult 返却）。
  if(typeof env.__setAppModalTestResolver==='function')env.__setAppModalTestResolver(function(type,message){ calls.push(String(message)); return confirmResult; });
  return {env:env,ctx:ctx,confirmCalls:calls};
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}

// 1クラスのみ（#567 の複数級 confirm を発火させず、日付ガードだけを見る）。
function mkState(dateVal){
  var st={ tournament_id:'t_test_622', rounds:1,
    classes:[{id:'A',name:'Aクラス'}],
    players:{ A:[
      {id:'a1',name:'甲',yomi:'こう',cls:'A',member_id:'m_a1'},
      {id:'a2',name:'乙',yomi:'おつ',cls:'A',member_id:'m_a2'}
    ] },
    results:{ A:[[{p1:'a1',p2:'a2',winner:'a1'}]] },
    report:{ title:'架空例会' } };
  if(dateVal!==undefined)st.report.date=dateVal;
  return st;
}
function lastStatus(arr){return arr.length?arr[arr.length-1]:'';}

const tests=[];
function t(name,fn){tests.push({name:name,fn:fn});}

t('D1 未設定（空）＋キャンセル→中止（cancelled-date・案内 status・confirm に今日の日付を明示）',function(){
  var L=loadEnv(false);var msgs=[];
  L.env._setState(mkState(''));
  return L.env.sendTournamentToCloud(function(m){msgs.push(m);}).then(function(res){
    ok(res&&res.ok===false&&res.step==='cancelled-date','D1a step=cancelled-date（got '+JSON.stringify(res)+'）');
    ok(L.confirmCalls.length===1,'D1b confirm は1回（got '+L.confirmCalls.length+'）');
    var c=L.confirmCalls[0]||'';
    // [反転] 理由(#840): 確認文言に大会名を並べたため「〜として記録します」から
    //        「この内容でクラウドに記録します。」＋大会名／実施日の2行表示へ変更。
    ok(c.indexOf('この内容でクラウドに記録します')>=0,'D1c [反転] confirm 文言に「この内容でクラウドに記録します」');
    ok(c.indexOf('大会名')>=0&&c.indexOf('架空例会')>=0,'D1c2 confirm に大会名（報告書タブの入力そのまま）を明示');
    ok(c.indexOf(L.env.todayYmd())>=0,'D1d 未設定は自動補完された今日の日付を明示（YYYY-MM-DD）');
    var st=lastStatus(msgs);
    ok(st.indexOf('中止')>=0&&st.indexOf('実施日')>=0,'D1e status は中止＋次の行動（実施日の確認・修正）を案内');
  });
});

t('D2 未設定＋続行→送信フローへ進む（fail-soft・ガードはブロックしない）',function(){
  var L=loadEnv(true);var msgs=[];
  L.env._setState(mkState(''));
  return L.env.sendTournamentToCloud(function(m){msgs.push(m);}).then(function(res){
    ok(L.confirmCalls.length===1,'D2a confirm は1回');
    ok(res&&res.step!=='cancelled-date','D2b 続行でガードは通過（offline 等の後段へ・got '+JSON.stringify(res&&res.step)+'）');
  });
});

t('D3 新 schema（YYYY-MM-DD）設定済でも毎回 confirm（設定日を明示）＋キャンセルで中止',function(){
  var L=loadEnv(false);var msgs=[];
  L.env._setState(mkState('2026-07-04'));
  return L.env.sendTournamentToCloud(function(m){msgs.push(m);}).then(function(res){
    ok(L.confirmCalls.length===1,'D3a 設定済でも confirm は1回（毎回確認＝#622 の変更点）');
    ok((L.confirmCalls[0]||'').indexOf('2026-07-04')>=0,'D3b confirm 文言に設定済みの実施日 2026-07-04 を明示');
    ok(res&&res.step==='cancelled-date','D3c キャンセルで中止');
  });
});

t('D3b 新 schema 設定済＋続行→通過（送信フローへ）',function(){
  var L=loadEnv(true);
  L.env._setState(mkState('2026-07-04'));
  return L.env.sendTournamentToCloud(function(){}).then(function(res){
    ok(L.confirmCalls.length===1,'D3b1 confirm は1回');
    ok(res&&res.step!=='cancelled-date','D3b2 続行で通過');
  });
});

t('D4 旧 schema（YYYY年M月D日）設定済→毎回 confirm・正規化日（YYYY-MM-DD）を明示',function(){
  var L=loadEnv(false);
  L.env._setState(mkState('2026年7月4日'));
  return L.env.sendTournamentToCloud(function(){}).then(function(res){
    ok(L.confirmCalls.length===1,'D4a confirm は1回');
    ok((L.confirmCalls[0]||'').indexOf('2026-07-04')>=0,'D4b 旧 schema も正規化した 2026-07-04 を明示');
    ok(res&&res.step==='cancelled-date','D4c キャンセルで中止');
  });
});

t('D5 report 自体が無い→今日の日付で confirm',function(){
  var L=loadEnv(false);
  var st=mkState();delete st.report;
  L.env._setState(st);
  return L.env.sendTournamentToCloud(function(){}).then(function(res){
    ok(L.confirmCalls.length===1,'D5a confirm は1回');
    ok((L.confirmCalls[0]||'').indexOf(L.env.todayYmd())>=0,'D5b 今日の日付を明示');
    ok(res&&res.step==='cancelled-date','D5c キャンセルで中止');
  });
});

t('D6 不正文字列（日付として解釈不能）→今日の日付で confirm',function(){
  var L=loadEnv(false);
  L.env._setState(mkState('あした'));
  return L.env.sendTournamentToCloud(function(){}).then(function(res){
    ok(L.confirmCalls.length===1,'D6a confirm は1回');
    ok((L.confirmCalls[0]||'').indexOf(L.env.todayYmd())>=0,'D6b 解釈不能は今日の日付へフォールバックして明示');
    ok(res&&res.step==='cancelled-date','D6c キャンセルで中止');
  });
});

console.log('=== S: 静的チェック ===');
ok(RAW.indexOf('SEND-DATE-CONFIRM-002')>=0,'S1 ガードのコメントマーカー（SEND-DATE-CONFIRM-002）が存在');
ok(RAW.indexOf("step:'cancelled-date'")>=0,'S2 cancelled-date 中止経路が存在');
// [反転] 理由(#840): 送信前確認に大会名を並べたため文言が変わった。
ok(RAW.indexOf('この内容でクラウドに記録します')>=0,'S3 [反転] 毎回 confirm 文言（この内容でクラウドに記録します）が存在');
ok(RAW.indexOf('大会名   ')>=0,'S3b 確認文言に大会名の行が存在（#840）');
var iGuard=RAW.indexOf('SEND-DATE-CONFIRM-002 (#622)');
var iSending=RAW.indexOf("setStatus('クラウドへ送信中…')");
ok(iGuard>=0&&iSending>=0&&iGuard<iSending,'S4 ガードは送信開始（クラウドへ送信中…）より前');

(function run(i){
  if(i>=tests.length){
    console.log('\nPASS='+pass+' FAIL='+fail);
    process.exit(fail>0?1:0);
    return;
  }
  console.log('=== '+tests[i].name+' ===');
  Promise.resolve().then(tests[i].fn).catch(function(e){
    fail++;console.log('  FAIL(例外): '+((e&&e.message)||e));
  }).then(function(){run(i+1);});
})(0);
