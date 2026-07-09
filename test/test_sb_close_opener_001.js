#!/usr/bin/env node
// ============================================================
// SB-CLOSE-OPENER-001 (#712): スマホ星取表の「✕ 閉じる」（運営タブ限定）
//   検証内容:
//   S1. sbCanCloseWindow が window.opener を判定条件に含む（静的）
//   S2. ✕ 閉じる の束縛が window.close() のみ（静的・運営導線を束縛しない）
//   S3. CSS .sb-close が定義されている（静的）
//   B1. opener 無し（URL 直接アクセス相当）→ sb-close-btn を描画しない
//   B2. opener 有り（運営タブから window.open）→ ✕ 閉じる を描画する
//   B3. B2 の描画結果にも「運営画面へ」導線が無い（read-only 徹底の E13 対称）
//   B4. live ルート（?live= あり）は opener があっても描画しない
//   B5. ✕ 閉じる click → window.close() が呼ばれる（1回・他の副作用なし）
//   B6. opener アクセスで例外 → fail-soft で描画しない
// 使い方: node test/test_sb_close_opener_001.js shogi_v4.html
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
  const fnm = htmlSrc.match(/function sbCanCloseWindow\(\)\{[\s\S]*?\n\}/);
  assert(!!fnm, 'S1-1 sbCanCloseWindow が存在する');
  assert(!!fnm && /window\.opener/.test(fnm[0]), 'S1-2 判定条件に window.opener を含む');
  assert(!!fnm && /sbIsLiveRoute/.test(fnm[0]), 'S1-3 live ルート除外を含む');
  // 束縛箇所: sb-close-btn には window.close のみ（location 遷移・hash 書換を束縛しない）
  const bindm = htmlSrc.match(/sb-close-btn'\):null;\s*\n\s*if\(sbCloseEl\)sbCloseEl\.addEventListener\('click',function\(\)\{([\s\S]*?)\}\);/);
  assert(!!bindm, 'S2-1 ✕ 閉じる の click 束縛が存在する');
  assert(!!bindm && /window\.close\(\)/.test(bindm[1]), 'S2-2 束縛は window.close() を呼ぶ');
  assert(!!bindm && !/location|hash|href/.test(bindm[1]), 'S2-3 束縛に画面遷移（location/hash/href）を含まない');
  assert(/\.sb-close\{/.test(htmlSrc), 'S3 CSS .sb-close が定義されている');
}

// ============================================================
// サンドボックス（test_live_scoreboard_001.js と同型の最小モック）
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
  const location={hash:'#scoreboard', search:'', pathname:'/shogi_v4.html', href:''};
  const win={
    innerWidth:390,
    addEventListener(){}, removeEventListener(){},
    open(){return {focus(){}, close(){}};},
    close(){win._closed=(win._closed||0)+1;},
    _closed:0,
    location:location
    // opener はテスト側で設定（既定 undefined = URL 直接アクセス相当）
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
  const fn = new Function(
    'document','window','location','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       _setState:function(s){state=s;},
       renderScoreboard:renderScoreboard,
       sbCanCloseWindow:sbCanCloseWindow
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.location, ctx.localStorage, ctx.crypto,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, Blob, URLMock,
    {log(){}, warn(){}, error(){}}, Promise
  );
  api._ctx = ctx;
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

// B1: opener 無し → ボタンを描画しない
{
  const env = loadEnv(targetPath);
  env._setState(makeState());
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(html.length > 0, 'B1-0 描画される');
  assert(!/sb-close-btn/.test(html), 'B1-1 opener 無し（URL直接）では ✕ 閉じる を描画しない');
  assert(env.sbCanCloseWindow() === false, 'B1-2 sbCanCloseWindow=false');
}

// B2/B3: opener 有り → ボタンを描画する・運営導線は無いまま
{
  const env = loadEnv(targetPath);
  env._ctx.window.opener = {};
  env._setState(makeState());
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(/id="sb-close-btn"/.test(html), 'B2-1 opener 有りで ✕ 閉じる を描画する');
  assert(/✕ 閉じる/.test(html), 'B2-2 ラベルは「✕ 閉じる」');
  assert(/class="sb-close"/.test(html), 'B2-3 class は sb-close');
  assert(env.sbCanCloseWindow() === true, 'B2-4 sbCanCloseWindow=true');
  assert(!/運営画面へ/.test(html), 'B3-1 「運営画面へ」導線は描画されない（read-only 徹底不変）');
  assert(!/<input(?![^>]*class="sb-search")/.test(html), 'B3-2 編集系 input は描画されない');
}

// B4: live ルート（?live= あり）は opener があっても描画しない
{
  const env = loadEnv(targetPath);
  env._ctx.window.opener = {};
  env._ctx.location.search = '?live=kakuu-slug';
  env._setState(makeState());
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(!/sb-close-btn/.test(html), 'B4-1 live ルートでは ✕ 閉じる を描画しない');
  assert(env.sbCanCloseWindow() === false, 'B4-2 sbCanCloseWindow=false（live）');
}

// B5: click → window.close() が1回呼ばれる
{
  const env = loadEnv(targetPath);
  env._ctx.window.opener = {};
  env._setState(makeState());
  // view.querySelector をフックして #sb-close-btn だけ実要素を返す
  const view = env._ctx.document.getElementById('scoreboard-view');
  const closeStub = makeElem('sb-close-btn');
  view.querySelector = function(sel){ return sel === '#sb-close-btn' ? closeStub : null; };
  view.querySelectorAll = function(){ return []; };
  env.renderScoreboard();
  const clicks = closeStub._handlers['click'] || [];
  assert(clicks.length === 1, 'B5-1 ✕ 閉じる に click が1件束縛される');
  if(clicks.length === 1){
    clicks[0].call(closeStub);
    assert(env._ctx.window._closed === 1, 'B5-2 click で window.close() が1回呼ばれる');
    assert(env._ctx.location.hash === '#scoreboard' && env._ctx.location.href === '', 'B5-3 画面遷移は発生しない');
  } else {
    fail += 2;
  }
}

// B6: opener アクセスで例外 → fail-soft で描画しない
{
  const env = loadEnv(targetPath);
  Object.defineProperty(env._ctx.window, 'opener', { get(){ throw new Error('cross-origin'); } });
  env._setState(makeState());
  let threw = false;
  try { env.renderScoreboard(); } catch(e){ threw = true; }
  assert(!threw, 'B6-1 描画が例外で落ちない（fail-soft）');
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(!/sb-close-btn/.test(html), 'B6-2 例外時は描画しない');
}

console.log(`SB-CLOSE-OPENER-001: PASS ${pass}件 / FAIL ${fail}件`);
process.exit(fail === 0 ? 0 : 1);
