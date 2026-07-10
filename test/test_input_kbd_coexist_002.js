#!/usr/bin/env node
// ============================================================
// INPUT-KBD-COEXIST-002 (#728 / スライス②b): サジェストのタップ/スクロール判別＋行圧縮＋氏名行直下オーバーレイ
//   検証内容:
//   S1. JS: touchstart 即選択（旧実装）が存在しない・touchstart/touchmove は passive
//   S2. JS: タップ判定は SUGGEST_TAP_SLOP_PX(10) 閾値・touchend で preventDefault＋onSuggestTap
//   S3. JS: positionSuggestOverlay / resetSuggestOverlay が存在し、render（表示前）/close で結線
//   S4. CSS: @media(max-width:480px) の候補行圧縮（padding 7px 12px・si-meta 11px）
//   S5. CSS: .suggest-list の max-height:280px 不変・オーバーレイ用の影・z-index=30（タブバー40未満）
//   B1. タップ（移動なし touchstart→touchend）→ 選択（氏名反映・リスト close・preventDefault）
//   B2. スクロール（touchmove で閾値超え）→ 選択されない（リスト開いたまま・氏名不変）
//   B3. 閾値以下の微動 → タップ扱いで選択
//   B4. マルチタッチ → 選択されない
//   B5. mousedown（デスクトップ）→ 従来どおり選択
//   B6. オーバーレイ: render で親 relative 化＋absolute/top=氏名行下端/z-index30、close で全て解除
// 使い方: node test/test_input_kbd_coexist_002.js shogi_v4.html
// データは完全架空のみ。
// ============================================================
'use strict';
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_input_kbd_coexist_002.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const RAW = fs.readFileSync(targetPath,'utf8');

// ============================================================
// 静的検査（JS / CSS ソース）
// ============================================================
{
  assert(!/touchstart',function\(e\)\{\s*\n\s*e\.preventDefault\(\);\s*\n\s*onSuggestTap\(m\);/.test(RAW),
    'S1-1 旧 touchstart 即選択（preventDefault＋onSuggestTap）が存在しない');
  assert(/item\.addEventListener\('touchstart',function\(e\)\{[\s\S]*?\},\{passive:true\}\);/.test(RAW),
    'S1-2 touchstart は passive（ネイティブスクロールを妨げない）');
  assert(/item\.addEventListener\('touchmove',function\(e\)\{[\s\S]*?\},\{passive:true\}\);/.test(RAW),
    'S1-3 touchmove は passive');
  assert(/var SUGGEST_TAP_SLOP_PX=10;/.test(RAW),
    'S2-1 タップ判定閾値 SUGGEST_TAP_SLOP_PX=10');
  assert(/Math\.abs\(t\.clientX-_tx\)>SUGGEST_TAP_SLOP_PX\|\|Math\.abs\(t\.clientY-_ty\)>SUGGEST_TAP_SLOP_PX/.test(RAW),
    'S2-2 X/Y いずれかの移動が閾値超えでスクロール扱い');
  assert(/item\.addEventListener\('touchend',function\(e\)\{\s*\n\s*if\(_tMoved\)return;\s*\n\s*if\(e\.cancelable!==false&&e\.preventDefault\)e\.preventDefault\(\);\s*\n\s*onSuggestTap\(m\);/.test(RAW),
    'S2-3 touchend: 移動なしのときだけ preventDefault（合成 mouse 抑止）＋選択');
  assert(/function positionSuggestOverlay\(list\)\{/.test(RAW) && /function resetSuggestOverlay\(list\)\{/.test(RAW),
    'S3-1 positionSuggestOverlay / resetSuggestOverlay が存在する');
  assert(/positionSuggestOverlay\(list\);\s*\n\s*list\.style\.display='block';/.test(RAW),
    'S3-2 renderSuggestList は表示前にオーバーレイ配置（top 確定後に高さフィット）');
  assert(/resetSuggestOverlay\(list\);/.test(RAW),
    'S3-3 closeSuggestList でオーバーレイ解除の結線がある');
  const mq = RAW.match(/@media\(max-width:480px\)\{[\s\S]*?\n\}/);
  assert(!!mq && /\.suggest-item\{padding:7px 12px\}/.test(mq[0]),
    'S4-1 スマホ幅で候補行 padding 圧縮（7px 12px）');
  assert(!!mq && /\.suggest-item \.si-meta\{font-size:11px;margin-top:1px\}/.test(mq[0]),
    'S4-2 スマホ幅で si-meta 11px 化');
  assert(/\.suggest-list\{margin-top:6px;[^}]*max-height:280px;[^}]*box-shadow:0 6px 16px rgba\(0,0,0,0\.18\)\}/.test(RAW),
    'S5-1 .suggest-list: max-height 280px 不変＋オーバーレイ用の影');
  assert(/list\.style\.zIndex='30';/.test(RAW) && /\.tab-bar\{[^}]*z-index:40/.test(RAW),
    'S5-2 オーバーレイ z-index=30 は sticky タブバー(40)未満');
}

// ============================================================
// サンドボックス（test_input_kbd_coexist_001.js と同型＋リスナー記録つきモック）
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
      style:{}, _attrs:{}, childNodes:[], _listeners:{},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(type,fn,opts){ (this._listeners[type]=this._listeners[type]||[]).push({fn:fn,opts:opts}); },
      removeEventListener:function(){},
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
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements, makeNode:makeNode };
}

function fire(node,type,ev){
  var ls=(node._listeners&&node._listeners[type])||[];
  for(var i=0;i<ls.length;i++)ls[i].fn(ev);
  return ls.length;
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       renderSuggestList:renderSuggestList,
       closeSuggestList:closeSuggestList,
       positionSuggestOverlay:positionSuggestOverlay,
       resetSuggestOverlay:resetSuggestOverlay
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, {randomUUID:function(){return '00000000-0000-4000-8000-000000000000';}},
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  api._fire = fire;
  return api;
}

const MEMBER = { id:'m_test000000001', name:'架空 太郎', yomi:'かくう たろう', last_class:'A', last_attended:'2026-06' };

function freshList(api){
  const list = api._ctx.document.getElementById('suggest-list');
  list.childNodes.length=0;
  list.innerHTML='';
  api.renderSuggestList([MEMBER]);
  return list;
}

// B1: タップ（移動なし）→ 選択・close・preventDefault
{
  const api = loadEnv();
  const doc = api._ctx.document;
  const list = freshList(api);
  assert(list.childNodes.length===1 && list.style.display==='block', 'B1-0 候補1件が表示される');
  const item = list.childNodes[0];
  let prevented=false;
  fire(item,'touchstart',{touches:[{clientX:100,clientY:200}]});
  fire(item,'touchend',{cancelable:true,preventDefault:function(){prevented=true;}});
  assert(doc.getElementById('inp-name').value==='架空 太郎', 'B1-1 タップで氏名が入力欄へ反映される');
  assert(doc.getElementById('inp-yomi').value==='かくう たろう', 'B1-2 ふりがなも反映される');
  assert(list.style.display==='none', 'B1-3 選択後リストは閉じる');
  assert(prevented, 'B1-4 タップ確定時は preventDefault（合成 mouse→blur 競合の抑止）');
}

// B2: スクロール（閾値超えの touchmove）→ 選択されない
{
  const api = loadEnv();
  const doc = api._ctx.document;
  const list = freshList(api);
  const item = list.childNodes[0];
  let prevented=false;
  fire(item,'touchstart',{touches:[{clientX:100,clientY:200}]});
  fire(item,'touchmove',{touches:[{clientX:100,clientY:240}]});   // 40px 縦移動 > 10px
  fire(item,'touchend',{cancelable:true,preventDefault:function(){prevented=true;}});
  assert(doc.getElementById('inp-name').value==='', 'B2-1 スクロール後の touchend では選択されない');
  assert(list.style.display==='block', 'B2-2 リストは開いたまま（スクロール継続可能）');
  assert(!prevented, 'B2-3 スクロール時は preventDefault しない');
}

// B3: 閾値以下の微動 → タップ扱い
{
  const api = loadEnv();
  const doc = api._ctx.document;
  const list = freshList(api);
  const item = list.childNodes[0];
  fire(item,'touchstart',{touches:[{clientX:100,clientY:200}]});
  fire(item,'touchmove',{touches:[{clientX:104,clientY:206}]});   // 6px 移動 <= 10px
  fire(item,'touchend',{cancelable:true,preventDefault:function(){}});
  assert(doc.getElementById('inp-name').value==='架空 太郎', 'B3 閾値以下の微動はタップ扱いで選択される');
}

// B4: マルチタッチ → 選択されない
{
  const api = loadEnv();
  const doc = api._ctx.document;
  const list = freshList(api);
  const item = list.childNodes[0];
  fire(item,'touchstart',{touches:[{clientX:100,clientY:200},{clientX:150,clientY:200}]});
  fire(item,'touchend',{cancelable:true,preventDefault:function(){}});
  assert(doc.getElementById('inp-name').value==='', 'B4 マルチタッチは選択しない');
}

// B5: mousedown（デスクトップ）→ 従来どおり選択
{
  const api = loadEnv();
  const doc = api._ctx.document;
  const list = freshList(api);
  const item = list.childNodes[0];
  let prevented=false;
  fire(item,'mousedown',{preventDefault:function(){prevented=true;}});
  assert(doc.getElementById('inp-name').value==='架空 太郎' && prevented, 'B5 mousedown は従来どおり即選択（blur より先）');
}

// B6: オーバーレイ配置と解除
{
  const api = loadEnv();
  const ctx = api._ctx;
  const doc = ctx.document;
  const list = doc.getElementById('suggest-list');
  const inp = doc.getElementById('inp-name');
  const parent = ctx.makeNode('div');
  const row = ctx.makeNode('div');
  row.offsetTop=100; row.offsetHeight=44;
  row.parentNode=parent;
  inp.parentNode=row;
  list.parentNode=parent;
  api.renderSuggestList([MEMBER]);
  assert(parent.style.position==='relative', 'B6-1 親を position:relative 化');
  assert(list.style.position==='absolute' && list.style.top==='144px', 'B6-2 リストは氏名行下端（100+44=144px）に absolute 配置');
  assert(list.style.left==='0' && list.style.right==='0' && list.style.zIndex==='30', 'B6-3 全幅＋z-index 30');
  api.closeSuggestList();
  assert(list.style.position==='' && list.style.top==='' && list.style.zIndex==='' && list.style.left==='' && list.style.right==='',
    'B6-4 close でオーバーレイ配置を全解除（通常フロー復帰）');
  // 位置計算に必要な値が無い環境では何もしない（fail-soft）
  const api2 = loadEnv();
  const list2 = api2._ctx.document.getElementById('suggest-list');
  api2.renderSuggestList([MEMBER]);
  assert(list2.style.position===undefined||list2.style.position==='', 'B6-5 親子関係/offset が無い環境ではインラインフローのまま（fail-soft）');
}

console.log('INPUT-KBD-COEXIST-002: PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
