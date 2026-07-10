#!/usr/bin/env node
// ============================================================
// INPUT-KBD-COEXIST-001 (スライス②): サジェストのキーボード共存（visualViewport 追従）
//   検証内容:
//   S1. JS: fitToVisualViewport(el,minPx,maxPx) が存在し、visualViewport 非対応時は
//       インライン max-height を除去して CSS 既定へ戻す
//   S2. JS: renderSuggestList は表示直後に fitSuggestListToViewport を呼ぶ
//   S3. JS: closeSuggestList は追従で付けたインライン max-height を除去する
//   S4. JS: bindRegistrationEvents が visualViewport の resize/scroll を rAF 間引きで結線し、
//       氏名欄 focus の遅延スクロール（ensureRegNameInputVisible）と二段構えにする
//   S5. CSS: .suggest-list の既定 max-height(280px) は不変（SUGGEST_FIT_MAX_PX と同値）
//   B1. fitToVisualViewport: 可視域が十分 → maxPx でクランプ
//   B2. fitToVisualViewport: キーボードで可視域が狭い → avail に追従
//   B3. fitToVisualViewport: 可視域が極小 → minPx を下回らない
//   B4. fitToVisualViewport: visualViewport 無し → max-height 除去・null
//   B5. closeSuggestList: display:none ＋ innerHTML 空 ＋ max-height 除去
//   B6. ensureRegNameInputVisible: 余白十分なら scrollTo を呼ばない／余白不足なら呼ぶ
// 使い方: node test/test_input_kbd_coexist_001.js shogi_v4.html
// データは完全架空のみ。
// ============================================================
'use strict';
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_input_kbd_coexist_001.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const RAW = fs.readFileSync(targetPath,'utf8');

// ============================================================
// 静的検査（JS / CSS ソース）
// ============================================================
{
  assert(/function fitToVisualViewport\(el,minPx,maxPx\)\{/.test(RAW),
    'S1-1 fitToVisualViewport(el,minPx,maxPx) が存在する');
  assert(/if\(!vv\)\{el\.style\.maxHeight='';return null;\}/.test(RAW),
    'S1-2 visualViewport 非対応時は max-height 除去＋null（CSS 既定へ戻す）');
  assert(/vv\.offsetTop\+vv\.height-rect\.top/.test(RAW),
    'S1-3 可視域下端（offsetTop+height）− 要素上端で残り高さを算出する');
  assert(/list\.style\.display='block';\s*\n\s*\/\/ INPUT-KBD-COEXIST-001[^\n]*\n\s*fitSuggestListToViewport\(\);/.test(RAW),
    'S2 renderSuggestList は表示直後に fitSuggestListToViewport を呼ぶ');
  assert(/list\.innerHTML='';\s*\n\s*\/\/ INPUT-KBD-COEXIST-001[^\n]*\n\s*if\(list\.style\)list\.style\.maxHeight='';/.test(RAW),
    'S3 closeSuggestList はインライン max-height を除去する');
  assert(/window\.visualViewport\.addEventListener\('resize',function\(\)\{queueSuggestFit\(\);ensureRegNameInputVisible\(\);\}\);/.test(RAW),
    'S4-1 visualViewport resize でサジェスト追従＋氏名欄の可視確保');
  assert(/window\.visualViewport\.addEventListener\('scroll',queueSuggestFit\);/.test(RAW),
    'S4-2 visualViewport scroll でもサジェスト追従（rAF 間引き）');
  assert(/requestAnimationFrame==='function'\)requestAnimationFrame\(run\);else setTimeout\(run,16\);/.test(RAW),
    'S4-3 追従は rAF で1フレーム1回に間引く（非対応時は setTimeout フォールバック）');
  assert(/inpName\.addEventListener\('focus',function\(\)\{setTimeout\(ensureRegNameInputVisible,300\);\}\);/.test(RAW),
    'S4-4 氏名欄 focus の遅延スクロール（300ms・キーボード出現後）と二段構え');
  assert(/\.suggest-list\{margin-top:6px;[^}]*max-height:280px;/.test(RAW),
    'S5-1 CSS .suggest-list の既定 max-height:280px は不変');
  assert(/var SUGGEST_FIT_MAX_PX=280;/.test(RAW),
    'S5-2 SUGGEST_FIT_MAX_PX は CSS 既定と同値（280）');
  assert(/var SUGGEST_FIT_MIN_PX=96;/.test(RAW),
    'S5-3 SUGGEST_FIT_MIN_PX=96（候補1件強を必ず見せる下限）');
}

// ============================================================
// サンドボックス（test_world_std_align_002.js と同型の最小モック）
// ============================================================
function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
      style:{}, _attrs:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3, textContent:String(t==null?'':t)}; },
    body:makeNode('body'),
    activeElement:null,
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, innerHeight:800, pageYOffset:0,
    addEventListener:function(){}, removeEventListener:function(){},
    scrollTo:function(){ winMock._scrollCalls.push(Array.prototype.slice.call(arguments)); },
    _scrollCalls:[],
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       fitToVisualViewport:fitToVisualViewport,
       fitSuggestListToViewport:fitSuggestListToViewport,
       ensureRegNameInputVisible:ensureRegNameInputVisible,
       closeSuggestList:closeSuggestList,
       renderSuggestList:renderSuggestList
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, {randomUUID:function(){return '00000000-0000-4000-8000-000000000000';}},
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

// B1-B3: fitToVisualViewport のクランプ挙動
{
  const api = loadEnv();
  const win = api._ctx.window;
  function mockEl(top){
    return { style:{}, getBoundingClientRect:function(){ return {top:top,bottom:top+40}; } };
  }
  // B1: 可視域が十分（offsetTop=0, height=800, el top=100 → avail=692）→ max=280 でクランプ
  win.visualViewport={offsetTop:0,height:800,addEventListener:function(){}};
  let el=mockEl(100);
  let h=api.fitToVisualViewport(el,96,280);
  assert(h===280 && el.style.maxHeight==='280px',
    'B1 可視域が十分なら maxPx(280) でクランプ（実測 '+h+'）');
  // B2: キーボードで可視域が狭い（height=300, el top=100 → avail=300-100-8=192）→ 追従
  win.visualViewport={offsetTop:0,height:300,addEventListener:function(){}};
  el=mockEl(100);
  h=api.fitToVisualViewport(el,96,280);
  assert(h===192 && el.style.maxHeight==='192px',
    'B2 キーボードで狭い可視域には avail(192) で追従（実測 '+h+'）');
  // B2b: visual viewport が下へオフセット（offsetTop=50, height=300, top=100 → avail=50+300-100-8=242）
  win.visualViewport={offsetTop:50,height:300,addEventListener:function(){}};
  el=mockEl(100);
  h=api.fitToVisualViewport(el,96,280);
  assert(h===242,
    'B2b offsetTop（可視域の移動）も加味する（実測 '+h+'）');
  // B3: 可視域が極小（height=120, el top=100 → avail=12）→ min=96 を下回らない
  win.visualViewport={offsetTop:0,height:120,addEventListener:function(){}};
  el=mockEl(100);
  h=api.fitToVisualViewport(el,96,280);
  assert(h===96 && el.style.maxHeight==='96px',
    'B3 可視域が極小でも minPx(96) を下回らない（実測 '+h+'）');
}

// B4: visualViewport 無し → max-height 除去・null
{
  const api = loadEnv();
  const el={ style:{maxHeight:'123px'}, getBoundingClientRect:function(){ return {top:0,bottom:40}; } };
  const h=api.fitToVisualViewport(el,96,280);
  assert(h===null && el.style.maxHeight==='',
    'B4 visualViewport 非対応環境では max-height を除去して null（CSS 既定へ）');
}

// B5: closeSuggestList は display:none ＋ innerHTML 空 ＋ max-height 除去
{
  const api = loadEnv();
  const list = api._ctx.document.getElementById('suggest-list');
  list.style.display='block';
  list.style.maxHeight='192px';
  list.innerHTML='<div>x</div>';
  api.closeSuggestList();
  assert(list.style.display==='none' && list.innerHTML==='' && list.style.maxHeight==='',
    'B5 closeSuggestList: 非表示化＋クリア＋インライン max-height 除去');
}

// B6: ensureRegNameInputVisible のスクロール条件
{
  const api = loadEnv();
  const doc = api._ctx.document;
  const win = api._ctx.window;
  const inp = doc.getElementById('inp-name');
  doc.activeElement = inp;
  // 余白十分（可視域 800px・入力欄 bottom=200 → 200+150<=800）→ scrollTo しない
  win.visualViewport={offsetTop:0,height:800,addEventListener:function(){}};
  inp.getBoundingClientRect=function(){ return {top:160,bottom:200}; };
  win._scrollCalls.length=0;
  api.ensureRegNameInputVisible();
  assert(win._scrollCalls.length===0,
    'B6-1 余白が十分なら scrollTo を呼ばない（画面を跳ねさせない）');
  // 余白不足（キーボードで可視域 300px・入力欄 bottom=250 → 250+150>300）→ scrollTo する
  win.visualViewport={offsetTop:0,height:300,addEventListener:function(){}};
  inp.getBoundingClientRect=function(){ return {top:210,bottom:250}; };
  win._scrollCalls.length=0;
  api.ensureRegNameInputVisible();
  assert(win._scrollCalls.length===1,
    'B6-2 キーボードで余白不足なら入力欄をタブバー直下へスクロール');
  // フォーカスが氏名欄でない → 何もしない
  doc.activeElement = null;
  win._scrollCalls.length=0;
  api.ensureRegNameInputVisible();
  assert(win._scrollCalls.length===0,
    'B6-3 氏名欄フォーカス中でなければ何もしない');
}

console.log('INPUT-KBD-COEXIST-001: PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
