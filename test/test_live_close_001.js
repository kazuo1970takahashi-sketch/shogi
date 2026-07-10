#!/usr/bin/env node
// ============================================================
// LIVE-CLOSE-001 (案C 作者承認 2026-07-10): 参加者QR配信ビューの「✕ 閉じる」＋終了画面フォールバック
//   検証内容:
//   S1. sbLiveCanShowClose が live 限定＋kiosk 除外（静的）
//   S2. sbLiveShowDoneView が フラグ→停止→再描画 の順（静的）
//   S3. CSS .sb-done / .sb-done-return が定義されている（静的）
//   S4. _sbLiveDone ゲート（sbLiveFetchOnce / sbLiveStartPolling の先頭 early-return）（静的）
//   B1. live（非kiosk・envelope 未受信）→ 待機画面に ✕ 閉じる を描画（配信終了・古いQRでも閉じられる）
//   B2. live＋kiosk=1 → 描画しない（#712 誤タップ防止の継承）
//   B3. live（envelope 受信後の本描画）→ sb-head に ✕ 閉じる・運営導線なし（read-only 不変）
//   B4. ✕ click → window.close() 試行 → 250ms 後も未クローズなら終了画面（_sbLiveDone=true・ありがとう文言・戻るボタン）
//   B5. 終了画面中は renderScoreboard 再呼び出しでも終了画面を維持・sbLiveStartPolling は再開しない（通信停止）
//   B6. 「▶ 星取表に戻る」click → フラグ解除・ポーリング再開（setInterval 発火）・星取表へ復帰
//   B7. window.close() が効いたブラウザ（closed=true）→ 終了画面へは行かない
// 使い方: node test/test_live_close_001.js shogi_v4.html
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2] || path.join(__dirname, '..', 'shogi_v4.html');
let pass = 0, fail = 0;
function assert(cond, label){
  if(cond){ pass++; }
  else { fail++; console.error('  ✗ FAIL: ' + label); }
}

const htmlSrc = fs.readFileSync(targetPath, 'utf8');

// ============================================================
// 静的検査
// ============================================================
{
  const m1 = htmlSrc.match(/function sbLiveCanShowClose\(\)\{[\s\S]*?\n\}/);
  assert(!!m1, 'S1-1 sbLiveCanShowClose が存在する');
  assert(!!m1 && /sbIsLiveRoute/.test(m1[0]) && /sbIsKioskMode/.test(m1[0]), 'S1-2 live 限定＋kiosk 除外を含む');
  const m2 = htmlSrc.match(/function sbLiveShowDoneView\(\)\{[\s\S]*?\n\}/);
  assert(!!m2, 'S2-1 sbLiveShowDoneView が存在する');
  assert(!!m2 && /_sbLiveDone=true[\s\S]*sbLiveStopPolling[\s\S]*renderScoreboard/.test(m2[0]), 'S2-2 フラグ→停止→再描画の順');
  assert(/\.sb-done\{/.test(htmlSrc) && /\.sb-done-return\{/.test(htmlSrc), 'S3 CSS .sb-done / .sb-done-return が定義されている');
  assert(/function sbLiveFetchOnce\(\)\{\s*\n?\s*if\(_sbLiveDone\)return/.test(htmlSrc), 'S4-1 sbLiveFetchOnce に _sbLiveDone ゲート（終了画面中は通信しない）');
  assert(/function sbLiveStartPolling\(\)\{\s*\n?\s*if\(_sbLiveDone\)return/.test(htmlSrc), 'S4-2 sbLiveStartPolling に _sbLiveDone ゲート');
}

// ============================================================
// サンドボックス（test_sb_close_opener_001.js と同型＋timer/fetch を差し替え）
// ============================================================
function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}
function makeLocalStorage(){
  return {
    _:{},
    getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;},
    setItem(k,v){this._[k]=String(v);},
    removeItem(k){delete this._[k];}
  };
}
function makeClassList(){
  const set={};
  return {
    add(c){set[c]=1;}, remove(c){delete set[c];},
    toggle(c){ if(set[c])delete set[c]; else set[c]=1; },
    contains(c){return !!set[c];}
  };
}
function makeElem(id){
  const handlers={}; const attrs={};
  return {
    id:id||'', _innerHTML:'', _handlers:handlers,
    style:{display:'', cssText:''},
    className:'', hidden:false, value:'', checked:false, type:'', textContent:'',
    classList:makeClassList(),
    get innerHTML(){return this._innerHTML;},
    set innerHTML(v){this._innerHTML=String(v==null?'':v);},
    appendChild(c){return c;}, removeChild(){}, remove(){},
    addEventListener(e,fn){(handlers[e]||(handlers[e]=[])).push(fn);},
    removeEventListener(){}, dispatchEvent(){},
    setAttribute(k,v){attrs[k]=String(v);},
    getAttribute(k){return Object.prototype.hasOwnProperty.call(attrs,k)?attrs[k]:null;},
    querySelector(){return null;}, querySelectorAll(){return [];},
    focus(){}, blur(){}, click(){}
  };
}
function makeContext(){
  const byId={}; const bySel={};
  const body=makeElem('body');
  const doc={
    _byId:byId, _bySel:bySel,
    getElementById(id){return byId[id]||(byId[id]=makeElem(id));},
    querySelector(sel){return bySel[sel]||(bySel[sel]=makeElem(sel));},
    querySelectorAll(){return [];},
    createElement(){return makeElem();},
    body:body,
    addEventListener(){}, removeEventListener(){}
  };
  const location={hash:'#scoreboard', search:'?live=kakuu-slug', pathname:'/shogi_v4.html', href:''};
  const win={
    innerWidth:390,
    addEventListener(){}, removeEventListener(){},
    open(){return {focus(){}, close(){}};},
    close(){win._closed=(win._closed||0)+1;},
    _closed:0,
    location:location
  };
  return {
    document:doc, window:win, location:location,
    localStorage:makeLocalStorage(),
    crypto:{randomUUID(){return '00000000-0000-0000-0000-000000000000';}}
  };
}
function loadEnv(p){
  const ctx = makeContext();
  const js = extractScripts(p);
  const Blob = function(arr,opts){this.__src=(arr&&arr[0])||'';this.type=(opts&&opts.type)||'';};
  const URLMock = {createObjectURL(){return 'blob:mock';}, revokeObjectURL(){}};
  // timer / fetch はスパイに差し替え（実タイマー・実通信を使わない）
  const timeouts=[]; const intervals=[]; let cleared=0;
  const fakeSetTimeout=function(fn,ms){timeouts.push({fn:fn,ms:ms});return timeouts.length;};
  const fakeSetInterval=function(fn,ms){intervals.push({fn:fn,ms:ms});return intervals.length;};
  const fakeClearInterval=function(){cleared++;};
  const fakeFetch=function(){return Promise.resolve({ok:false,json:function(){return Promise.resolve(null);}});};
  const fn = new Function(
    'document','window','location','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','setInterval','clearInterval','fetch',
    `${js};
     return {
       _setState:function(s){state=s;},
       _setLiveViewState:function(s){_sbLiveViewState=s;},
       _getLiveDone:function(){return _sbLiveDone;},
       renderScoreboard:renderScoreboard,
       sbCanCloseWindow:sbCanCloseWindow,
       sbLiveCanShowClose:sbLiveCanShowClose,
       sbLiveShowDoneView:sbLiveShowDoneView,
       sbLiveStartPolling:sbLiveStartPolling
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.location, ctx.localStorage, ctx.crypto,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, Blob, URLMock,
    {log(){}, warn(){}, error(){}}, Promise,
    fakeSetTimeout, fakeSetInterval, fakeClearInterval, fakeFetch
  );
  api._ctx = ctx;
  api._timeouts = timeouts;
  api._intervals = intervals;
  api._clearedCount = function(){return cleared;};
  return api;
}
// 実 state（架空データのみ）
function makeState(){
  return {
    classes:[{id:'A',name:'架空A級',started:true}],
    players:{A:[
      {id:'p1',name:'架空 太郎',cls:'A',member:'member',grade:'ippan',entry_no:1},
      {id:'p2',name:'架空 次郎',cls:'A',member:'member',grade:'ippan',entry_no:2}
    ]},
    pairings:{A:[]},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]]},
    rounds:1,
    started:true,
    report:{title:'架空将棋大会',date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',organizer:'架空連盟'}
  };
}

// B1: live（非kiosk・envelope 未受信）→ 待機画面に ✕ 閉じる
{
  const env = loadEnv(targetPath);
  env._setState(makeState());
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(/sb-empty/.test(html), 'B1-0 待機画面が描画される');
  assert(/id="sb-close-btn"/.test(html), 'B1-1 待機画面に ✕ 閉じる を描画する（配信終了・古いQRでも閉じられる）');
  assert(/この配信画面を閉じる/.test(html), 'B1-2 aria-label は参加者向け文言');
  assert(env.sbLiveCanShowClose() === true, 'B1-3 sbLiveCanShowClose=true');
  assert(!/運営画面へ/.test(html), 'B1-4 運営導線なし（read-only 不変）');
}

// B2: live＋kiosk=1 → 描画しない
{
  const env = loadEnv(targetPath);
  env._ctx.location.search = '?live=kakuu-slug&kiosk=1';
  env._setState(makeState());
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(!/sb-close-btn/.test(html), 'B2-1 kiosk=1 では ✕ 閉じる を描画しない（#712 誤タップ防止の継承）');
  assert(env.sbLiveCanShowClose() === false, 'B2-2 sbLiveCanShowClose=false（kiosk）');
}

// B3: live 本描画（envelope 受信後相当＝_sbLiveViewState 注入）→ sb-head に ✕ 閉じる・運営導線なし
{
  const env = loadEnv(targetPath);
  const s = makeState();
  env._setState(s);
  env._setLiveViewState(s); // state===_sbLiveViewState → 本描画パス
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(/sb-head/.test(html) && /星取表/.test(html), 'B3-0 本描画（sb-head）が出る');
  assert(/id="sb-close-btn"/.test(html), 'B3-1 本描画の sb-head に ✕ 閉じる を描画する');
  assert(/この配信画面を閉じる/.test(html), 'B3-2 aria-label は参加者向け文言（運営向け文言ではない）');
  assert(!/運営画面へ/.test(html), 'B3-3 運営導線なし（read-only 不変）');
  assert(env.sbCanCloseWindow() === false, 'B3-4 opener 経路（sbCanCloseWindow）は live で false のまま');
}

// B4: ✕ click → close 試行 → 250ms 後も未クローズなら終了画面
{
  const env = loadEnv(targetPath);
  env._setState(makeState());
  const view = env._ctx.document.getElementById('scoreboard-view');
  const closeStub = makeElem('sb-close-btn');
  view.querySelector = function(sel){ return sel === '#sb-close-btn' ? closeStub : null; };
  view.querySelectorAll = function(){ return []; };
  env.renderScoreboard();
  const clicks = closeStub._handlers['click'] || [];
  assert(clicks.length === 1, 'B4-1 ✕ 閉じる に click が1件束縛される');
  if(clicks.length === 1){
    clicks[0].call(closeStub);
    assert(env._ctx.window._closed === 1, 'B4-2 click で window.close() を試行する');
    const t = env._timeouts.filter(function(x){return x.ms === 250;});
    assert(t.length === 1, 'B4-3 250ms のフォールバック確認が予約される');
    if(t.length === 1){
      env._ctx.window.closed = false;           // close が効かなかったブラウザ相当
      view.querySelector = function(){ return null; }; // 以降は素の innerHTML 検査
      t[0].fn();
      assert(env._getLiveDone() === true, 'B4-4 終了画面フラグが立つ');
      const html = view.innerHTML;
      assert(/ご覧いただきありがとうございました/.test(html), 'B4-5 終了画面（ありがとう文言）が描画される');
      assert(/id="sb-live-return-btn"/.test(html), 'B4-6 「▶ 星取表に戻る」がある（誤タップ復帰1タップ）');
      assert(!/運営画面へ/.test(html) && !/href=/.test(html), 'B4-7 終了画面にも運営導線・リンクなし（read-only 不変）');
    } else { fail += 4; }
    assert(env._ctx.location.hash === '#scoreboard' && env._ctx.location.href === '', 'B4-8 画面遷移は発生しない');
  } else { fail += 7; }
}

// B5: 終了画面中は再描画でも維持・sbLiveStartPolling は再開しない（通信停止）
{
  const env = loadEnv(targetPath);
  env._setState(makeState());
  env.sbLiveShowDoneView();
  const view = env._ctx.document.getElementById('scoreboard-view');
  assert(/ありがとうございました/.test(view.innerHTML), 'B5-1 sbLiveShowDoneView で終了画面');
  env.renderScoreboard();
  assert(/ありがとうございました/.test(view.innerHTML), 'B5-2 再描画でも終了画面を維持');
  const before = env._intervals.length;
  env.sbLiveStartPolling();
  assert(env._intervals.length === before, 'B5-3 終了画面中は sbLiveStartPolling が再開しない（ゲート）');
}

// B6: 「▶ 星取表に戻る」→ フラグ解除・ポーリング再開・星取表へ復帰
{
  const env = loadEnv(targetPath);
  env._setState(makeState());
  const view = env._ctx.document.getElementById('scoreboard-view');
  const returnStub = makeElem('sb-live-return-btn');
  view.querySelector = function(sel){ return sel === '#sb-live-return-btn' ? returnStub : null; };
  view.querySelectorAll = function(){ return []; };
  env.sbLiveShowDoneView();
  const clicks = returnStub._handlers['click'] || [];
  assert(clicks.length === 1, 'B6-1 戻るボタンに click が1件束縛される');
  if(clicks.length === 1){
    const before = env._intervals.length;
    view.querySelector = function(){ return null; };
    clicks[0].call(returnStub);
    assert(env._getLiveDone() === false, 'B6-2 フラグ解除');
    assert(env._intervals.length === before + 1, 'B6-3 ポーリング再開（setInterval が1回予約される）');
    assert(/sb-empty|sb-head/.test(view.innerHTML) && !/ありがとうございました/.test(view.innerHTML), 'B6-4 星取表（待機/本描画）へ復帰');
  } else { fail += 3; }
}

// B7: window.close() が効いたブラウザ → 終了画面へは行かない
{
  const env = loadEnv(targetPath);
  env._setState(makeState());
  const view = env._ctx.document.getElementById('scoreboard-view');
  const closeStub = makeElem('sb-close-btn');
  view.querySelector = function(sel){ return sel === '#sb-close-btn' ? closeStub : null; };
  view.querySelectorAll = function(){ return []; };
  env.renderScoreboard();
  const clicks = closeStub._handlers['click'] || [];
  if(clicks.length === 1){
    clicks[0].call(closeStub);
    env._ctx.window.closed = true; // close が効いたブラウザ相当
    const t = env._timeouts.filter(function(x){return x.ms === 250;});
    if(t.length === 1) t[0].fn();
    assert(env._getLiveDone() === false, 'B7-1 クローズ成功時は終了画面へ行かない');
  } else {
    fail += 1; console.error('  ✗ FAIL: B7-0 click 束縛が取れない');
  }
}

console.log('LIVE-CLOSE-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
