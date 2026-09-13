#!/usr/bin/env node
// @suite: FILE-DOWNLOAD-STANDALONE-001 ホーム画面アプリ（standalone）では共有シートでファイルを渡す
//   問題: iPhone の「ホーム画面に追加」したアプリでは <a download> が効かず JSON が同じ画面に表示され、
//   戻る手段が無い（2026-09-12 大会当日・作者報告）。standalone かつ Web Share API（files）が使える
//   環境だけ navigator.share({files}) へ切り替え、それ以外は従来の <a download> を 1 バイトも変えない。
//   命題は「どの環境でどちらの経路が選ばれ、done に何が返るか」。呼び出し（download 経路の同期性・
//   share 経路のキャンセル扱い）まで実際に通す（存在チェックで済ませない）。
const {loadApp}=require('./lib/app_harness');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

// Node の File を評価コンテキストへ渡す（ブラウザと同じ「File があるとき」の経路を通す）。
function makeEnv(nav,win){
  var overrides={};
  if(nav)overrides.navigator=nav;
  var app=loadApp({overrides:overrides,globals:{File:File}});
  if(win){ for(var k in win)app.ctx.window[k]=win[k]; }
  return app;
}

console.log('=== 純関数 pickFileDeliveryRoute ===');
{
  const api=loadApp().ctx;
  ok(api.pickFileDeliveryRoute({standalone:true,canShareFiles:true})==='share','R1 standalone かつ共有可 → share');
  ok(api.pickFileDeliveryRoute({standalone:true,canShareFiles:false})==='download','R2 standalone でも共有不可 → download（従来）');
  ok(api.pickFileDeliveryRoute({standalone:false,canShareFiles:true})==='download','R3 通常ブラウザは共有可でも download（従来）');
  ok(api.pickFileDeliveryRoute({})==='download','R4 環境不明 → download');
  ok(api.pickFileDeliveryRoute(null)==='download','R5 null → download');
}

console.log('=== 通常ブラウザ（navigator.standalone 無し）＝従来の <a download> が同期に走る ===');
{
  const app=makeEnv({onLine:true,share:function(){throw new Error('share must not be called');},canShare:function(){return true;}});
  const api=app.ctx;
  var clicked=[];
  const origCreate=api.document.createElement;
  api.document.createElement=function(tag){ var el=origCreate.call(api.document,tag); if(String(tag).toLowerCase()==='a')el.click=function(){clicked.push(el.download);}; return el; };
  var got=null;
  api.deliverTextFile('{"x":1}','t.json','application/json',function(r){got=r;});
  ok(got&&got.ok===true&&got.route==='download','D1 download 経路で ok');
  ok(got&&got.cancelled===false,'D2 cancelled=false');
  ok(clicked.length===1&&clicked[0]==='t.json','D3 <a download="t.json"> が 1 回 click された');
}

console.log('=== standalone だが共有 API が無い（古い iOS / Android の一部）＝従来経路 ===');
{
  const app=makeEnv({onLine:true,standalone:true,share:undefined});
  const api=app.ctx;
  var clicked=0;
  const origCreate=api.document.createElement;
  api.document.createElement=function(tag){ var el=origCreate.call(api.document,tag); if(String(tag).toLowerCase()==='a')el.click=function(){clicked++;}; return el; };
  var got=null;
  api.deliverTextFile('{}','t.json','application/json',function(r){got=r;});
  ok(got&&got.route==='download'&&clicked===1,'S0 canShare 無し → download にフォールバック');
}

console.log('=== standalone（navigator.standalone=true）かつ共有可＝navigator.share({files}) ===');
(async function(){
  var shared=[];
  const app=makeEnv({onLine:true,standalone:true,
    canShare:function(d){ return !!(d&&d.files&&d.files.length===1); },
    share:function(d){ shared.push(d); return Promise.resolve(); }});
  const api=app.ctx;
  var clicked=0;
  const origCreate=api.document.createElement;
  api.document.createElement=function(tag){ var el=origCreate.call(api.document,tag); if(String(tag).toLowerCase()==='a')el.click=function(){clicked++;}; return el; };
  var got=null;
  api.deliverTextFile('{"y":2}','b.json','application/json',function(r){got=r;});
  ok(got===null,'S1 share 経路は同期には done を呼ばない（共有先を選んだ後）');
  await new Promise(function(res){setTimeout(res,0);});
  ok(got&&got.ok===true&&got.route==='share','S2 共有完了で ok/route=share');
  ok(shared.length===1&&shared[0].files&&shared[0].files.length===1,'S3 navigator.share に files 1 件');
  ok(shared[0].files[0].name==='b.json'&&shared[0].files[0].type==='application/json','S4 File 名と MIME');
  ok(clicked===0,'S5 <a download> は click されない');
  const txt=await shared[0].files[0].text();
  ok(txt==='{"y":2}','S6 File の中身は渡した JSON そのもの');

  console.log('=== standalone（display-mode media query 経由）＝同じく share ===');
  var shared2=[];
  const app2=makeEnv({onLine:true,canShare:function(){return true;},share:function(d){shared2.push(d);return Promise.resolve();}},
    {matchMedia:function(q){ return {matches:q==='(display-mode: standalone)'}; }});
  var got2=null;
  app2.ctx.deliverTextFile('{}','c.json','application/json',function(r){got2=r;});
  await new Promise(function(res){setTimeout(res,0);});
  ok(got2&&got2.route==='share'&&shared2.length===1,'M1 matchMedia(display-mode: standalone) でも share');

  console.log('=== 共有シートを閉じた（AbortError）＝失敗ではなく「保存していない」 ===');
  const app3=makeEnv({onLine:true,standalone:true,canShare:function(){return true;},
    share:function(){ var e=new Error('abort'); e.name='AbortError'; return Promise.reject(e); }});
  var got3=null;
  app3.ctx.deliverTextFile('{}','d.json','application/json',function(r){got3=r;});
  await new Promise(function(res){setTimeout(res,0);});
  ok(got3&&got3.ok===false&&got3.cancelled===true&&got3.route==='share','C1 AbortError → ok=false/cancelled=true');

  const app4=makeEnv({onLine:true,standalone:true,canShare:function(){return true;},
    share:function(){ return Promise.reject(new Error('NotAllowed')); }});
  var got4=null;
  app4.ctx.deliverTextFile('{}','e.json','application/json',function(r){got4=r;});
  await new Promise(function(res){setTimeout(res,0);});
  ok(got4&&got4.ok===false&&got4.cancelled===false,'C2 その他の失敗 → ok=false/cancelled=false');

  console.log('=== 呼び出し側の結線（バックアップ／マスタ書き出し／大会データ保存） ===');
  {
    // download 経路: exportTournamentBackup は従来どおり同期に toast と markSaveStatus('backup') を出す
    const app5=makeEnv({onLine:true,share:undefined});
    const api5=app5.ctx;
    const origCreate5=api5.document.createElement;
    api5.document.createElement=function(tag){ var el=origCreate5.call(api5.document,tag); if(String(tag).toLowerCase()==='a')el.click=function(){}; return el; };
    var toasts=[],marks=[];
    app5.stub('showToast',function(m){toasts.push(String(m));});
    app5.stub('markSaveStatus',function(k){marks.push(k);});
    api5.exportTournamentBackup();
    ok(toasts.length===1&&toasts[0].indexOf('ダウンロードフォルダ')>=0,'B1 download 経路のバックアップ toast は従来文言');
    ok(marks.length===1&&marks[0]==='backup','B2 markSaveStatus(backup) が同期に 1 回');
  }
  {
    // share 経路でキャンセル: toast は「保存していません」・markSaveStatus は呼ばれない
    const app6=makeEnv({onLine:true,standalone:true,canShare:function(){return true;},
      share:function(){ var e=new Error('abort'); e.name='AbortError'; return Promise.reject(e); }});
    const api6=app6.ctx;
    var toasts6=[],marks6=[];
    app6.stub('showToast',function(m){toasts6.push(String(m));});
    app6.stub('markSaveStatus',function(k){marks6.push(k);});
    api6.exportTournamentBackup();
    await new Promise(function(res){setTimeout(res,0);});
    ok(toasts6.length===1&&toasts6[0].indexOf('保存していません')>=0,'B3 キャンセル時の toast は「保存していません」');
    ok(marks6.length===0,'B4 キャンセル時は「最終バックアップ」を更新しない');
    ok(app6.record.alert.length===0,'B5 キャンセルは alert しない（失敗ではない）');
  }
  {
    // share 経路で成功: markSaveStatus('backup') が呼ばれる
    const app7=makeEnv({onLine:true,standalone:true,canShare:function(){return true;},share:function(){return Promise.resolve();}});
    var marks7=[],toasts7=[];
    app7.stub('showToast',function(m){toasts7.push(String(m));});
    app7.stub('markSaveStatus',function(k){marks7.push(k);});
    app7.ctx.exportTournamentBackup();
    await new Promise(function(res){setTimeout(res,0);});
    ok(marks7.length===1&&marks7[0]==='backup','B6 共有成功で markSaveStatus(backup)');
    ok(toasts7.length===1&&toasts7[0].indexOf('ダウンロードフォルダ')<0,'B7 共有成功の toast は保存先を断定しない');
  }
  {
    // saveDataAsFile: download 経路は従来の alert 文言そのまま
    const app8=makeEnv({onLine:true,share:undefined});
    const api8=app8.ctx;
    const origCreate8=api8.document.createElement;
    api8.document.createElement=function(tag){ var el=origCreate8.call(api8.document,tag); if(String(tag).toLowerCase()==='a')el.click=function(){}; return el; };
    api8.saveDataAsFile('{}');
    ok(app8.record.alert.length===1&&/^shogi_taikai_\d{8}_\d{4}\.json に保存しました（端末のダウンロードフォルダ）$/.test(app8.record.alert[0]),'V1 saveDataAsFile の download 文言は従来どおり');
  }
  {
    // 静的: 3 経路とも共通関数を通る（<a download> の直書きが残っていない）
    const {readHtml}=require('./lib/app_harness');
    const RAW=readHtml();
    const n=(RAW.match(/a\.download=/g)||[]).length;
    ok(n===1,'W1 a.download= の直書きは deliverTextFile の 1 箇所だけ（実測 '+n+'）');
    ok(/id="backup-export"[\s\S]{0,600}ファイルに保存/.test(RAW),'W2 バックアップ画面の案内にホーム画面アプリの手順');
  }

  console.log('FILE-DOWNLOAD-STANDALONE-001: PASS='+pass+' FAIL='+fail);
  process.exit(fail===0?0:1);
})().catch(function(e){ console.log('  FAIL: exception '+(e&&e.stack||e)); process.exit(1); });
