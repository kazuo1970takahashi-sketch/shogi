#!/usr/bin/env node
// ============================================================
// INPUT-KBD-COEXIST-003 (#731 / スライス②c): サジェストのスクロール連鎖遮断＋高さ再計算の安定化
//   検証内容:
//   S1. CSS: .suggest-list に overscroll-behavior:contain（リスト端でページへ連鎖させない）
//   S2. CSS: max-height:280px・オーバーレイ影（②b）は不変
//   S3. JS: fitToVisualViewport に同値ガード（算出値が同じなら style を書き換えない）
//   B1. 同じ可視域で2回 fit → maxHeight の書き込みは1回だけ（同値ガード）
//   B2. 可視域が変わったら書き込みが発生し値も追従する
//   B3. クランプ挙動（min/max）は②のまま不変
// 使い方: node test/test_input_kbd_coexist_003.js shogi_v4.html
// データは完全架空のみ。
// ============================================================
'use strict';
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_input_kbd_coexist_003.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const RAW = fs.readFileSync(targetPath,'utf8');

// ============================================================
// 静的検査（CSS / JS ソース）
// ============================================================
{
  assert(/\.suggest-list\{margin-top:6px;[^}]*overflow-y:auto;overscroll-behavior:contain;[^}]*\}/.test(RAW),
    'S1 .suggest-list に overscroll-behavior:contain（スクロール連鎖遮断）');
  assert(/\.suggest-list\{margin-top:6px;[^}]*max-height:280px;[^}]*box-shadow:0 6px 16px rgba\(0,0,0,0\.18\)\}/.test(RAW),
    'S2 max-height:280px・オーバーレイ影（②b）は不変');
  assert(/var hpx=h\+'px';\s*\n\s*if\(el\.style\.maxHeight!==hpx\)el\.style\.maxHeight=hpx;/.test(RAW),
    'S3 fitToVisualViewport の同値ガード（値が変わったときだけ書き込み）');
}

// ============================================================
// サンドボックス（test_input_kbd_coexist_001.js と同型の最小モック）
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
  var winMock={ innerWidth:375, innerHeight:667, pageYOffset:0,
    addEventListener:function(){}, removeEventListener:function(){},
    scrollTo:function(){},
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
     return { fitToVisualViewport:fitToVisualViewport };`
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

// 書き込み回数を数えられる style を持つ要素モック
function mockElWithCountingStyle(top){
  var writes=0, val='';
  var style={};
  Object.defineProperty(style,'maxHeight',{
    get:function(){return val;},
    set:function(v){writes++;val=v;}
  });
  return {
    style:style,
    getBoundingClientRect:function(){ return {top:top,bottom:top+40}; },
    writes:function(){return writes;}
  };
}

// B1: 同じ可視域で2回 fit → 書き込み1回
{
  const api = loadEnv();
  const win = api._ctx.window;
  win.visualViewport={offsetTop:0,height:300,addEventListener:function(){}};
  const el=mockElWithCountingStyle(100);
  const h1=api.fitToVisualViewport(el,96,280);
  const h2=api.fitToVisualViewport(el,96,280);
  assert(h1===192 && h2===192, 'B1-1 算出値は従来どおり（192）');
  assert(el.writes()===1, 'B1-2 同値なら2回目は style を書き換えない（実測 '+el.writes()+'回）');
}

// B2: 可視域が変わったら書き込みが発生
{
  const api = loadEnv();
  const win = api._ctx.window;
  win.visualViewport={offsetTop:0,height:300,addEventListener:function(){}};
  const el=mockElWithCountingStyle(100);
  api.fitToVisualViewport(el,96,280);
  win.visualViewport={offsetTop:0,height:350,addEventListener:function(){}};   // 350-100-8=242
  const h=api.fitToVisualViewport(el,96,280);
  assert(h===242 && el.style.maxHeight==='242px' && el.writes()===2,
    'B2 可視域変化時は書き込みが発生し値も追従（'+h+'px / '+el.writes()+'回）');
}

// B3: クランプ min/max は②のまま
{
  const api = loadEnv();
  const win = api._ctx.window;
  win.visualViewport={offsetTop:0,height:800,addEventListener:function(){}};
  let el=mockElWithCountingStyle(100);
  assert(api.fitToVisualViewport(el,96,280)===280, 'B3-1 max クランプ 280 不変');
  win.visualViewport={offsetTop:0,height:120,addEventListener:function(){}};
  el=mockElWithCountingStyle(100);
  assert(api.fitToVisualViewport(el,96,280)===96, 'B3-2 min クランプ 96 不変');
}

console.log('INPUT-KBD-COEXIST-003: PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
