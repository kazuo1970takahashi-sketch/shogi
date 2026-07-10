#!/usr/bin/env node
// ============================================================
// INPUT-KBD-COEXIST-004 (#734 / スライス④): 過去参加者ピッカー（#pp-fullscreen）検索のキーボード共存
//   検証内容:
//   S1. JS: 定数（PP_GRID_FIT_MIN/MAX・PP_KBD_SHRINK・PP_SEARCH_HEADROOM）が存在
//   S2. JS: 結線（#pp-search focus 300ms / blur 200ms・refocus 直後の再適用・vv resize/scroll・
//       #pp-fullscreen scroll passive・closePpFullscreen の reset）
//   S3. JS: 既存 queueSuggestFit / resize 結線（001 の静的契約）が不変
//   B1. isPpSearchKbdActive: 非活性条件（vv 無し／フォーカス無し／縮み不足／ピンチズーム）で false
//   B2. isPpSearchKbdActive: キーボード縮みで true
//   B3. fitPpGridToViewport: 活性時にオーバーレイ配置＋max-height＋内側スクロール（contain）
//   B4. fitPpGridToViewport: 非活性時は inline style を全除去（通常フロー復帰）
//   B5. ensurePpSearchVisible: 余白十分なら scrollTop を動かさない／不足なら overlay を動かす
// 使い方: node test/test_input_kbd_coexist_004.js shogi_v4.html
// データは完全架空のみ。
// ============================================================
'use strict';
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_input_kbd_coexist_004.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const RAW = fs.readFileSync(targetPath,'utf8');

// ============================================================
// 静的検査（JS ソース）
// ============================================================
{
  assert(/var PP_GRID_FIT_MIN_PX=96;/.test(RAW) && /var PP_GRID_FIT_MAX_PX=480;/.test(RAW),
    'S1-1 グリッド fit の min/max 定数（96/480）');
  assert(/var PP_KBD_SHRINK_PX=100;/.test(RAW) && /var PP_SEARCH_HEADROOM_PX=140;/.test(RAW),
    'S1-2 キーボード検出閾値(100)・検索欄余白(140) 定数');
  assert(/input\.addEventListener\('focus',function\(\)\{setTimeout\(function\(\)\{ensurePpSearchVisible\(\);fitPpGridToViewport\(\);\},300\);\}\);/.test(RAW),
    'S2-1 #pp-search focus は 300ms 遅延でスクロール＋適用');
  assert(/input\.addEventListener\('blur',function\(\)\{setTimeout\(fitPpGridToViewport,200\);\}\);/.test(RAW),
    'S2-2 #pp-search blur は 200ms 遅延で解除（セルタップ競合回避）');
  assert(/if\(ni&&ni\.focus\)\{ ni\.focus\(\);[^\n]*\n[^\n]*\n\s*if\(typeof fitPpGridToViewport==='function'\)fitPpGridToViewport\(\);/.test(RAW),
    'S2-3 再描画後の refocus 直後に再適用');
  assert(/window\.visualViewport\.addEventListener\('resize',function\(\)\{queuePpGridFit\(\);ensurePpSearchVisible\(\);\}\);/.test(RAW) &&
         /window\.visualViewport\.addEventListener\('scroll',queuePpGridFit\);/.test(RAW),
    'S2-4 visualViewport resize/scroll に pp 系統（rAF 間引き）を結線');
  assert(/ppOverlayEl\.addEventListener\('scroll',queuePpGridFit,\{passive:true\}\)/.test(RAW),
    'S2-5 #pp-fullscreen 自身の scroll でも追従（passive）');
  assert(/el\.style\.display='none';[\s\S]{0,400}if\(typeof resetPpGridOverlay==='function'\)resetPpGridOverlay\(null\);/.test(RAW),
    'S2-6 closePpFullscreen で inline style を解除');
  assert(/window\.visualViewport\.addEventListener\('resize',function\(\)\{queueSuggestFit\(\);ensureRegNameInputVisible\(\);\}\);/.test(RAW) &&
         /window\.visualViewport\.addEventListener\('scroll',queueSuggestFit\);/.test(RAW),
    'S3 既存サジェスト系統（001 静的契約）の結線は不変');
}

// ============================================================
// サンドボックス（test_input_kbd_coexist_003.js と同型の最小モック）
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
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements, _makeNode:makeNode };
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { isPpSearchKbdActive:isPpSearchKbdActive,
              positionPpGridOverlay:positionPpGridOverlay,
              resetPpGridOverlay:resetPpGridOverlay,
              fitPpGridToViewport:fitPpGridToViewport,
              ensurePpSearchVisible:ensurePpSearchVisible };`
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

// 活性状態の共通セットアップ: 全画面ビュー open・#pp-search フォーカス・キーボードで vv 縮小。
//   rect は「header56+modebar48+summary+input行」を模した架空値。
function setupActive(api,opts){
  opts=opts||{};
  const ctx=api._ctx;
  const doc=ctx.document, win=ctx.window;
  const fsEl=doc.getElementById('pp-fullscreen');
  fsEl.style.display='block';
  fsEl.scrollTop=(typeof opts.scrollTop==='number')?opts.scrollTop:0;
  fsEl.querySelector=function(sel){
    if(sel==='.pp-mode-bar')return { getBoundingClientRect:function(){ return {top:56,bottom:opts.barBottom!=null?opts.barBottom:104}; } };
    return null;
  };
  const inp=doc.getElementById('pp-search');
  inp.getBoundingClientRect=function(){ return opts.inputRect||{top:120,bottom:160}; };
  inp.parentNode={ getBoundingClientRect:function(){ return opts.rowRect||{top:114,bottom:166}; } };
  doc.activeElement=inp;
  const panel=doc.getElementById('ppPanel');
  panel.getBoundingClientRect=function(){ return opts.panelRect||{top:104,bottom:800}; };
  const grid=ctx._makeNode('div');
  grid.className='pp-dense-grid';
  grid.getBoundingClientRect=function(){ return opts.gridRect||{top:172,bottom:700}; };
  panel.querySelector=function(sel){ return sel==='.pp-dense-grid'?grid:null; };
  // キーボードで縮んだ visualViewport（innerHeight 667 → 可視 360）
  win.visualViewport=opts.vv!==undefined?opts.vv:{offsetTop:0,height:360,scale:1,addEventListener:function(){}};
  return {fsEl:fsEl,inp:inp,panel:panel,grid:grid};
}

// B1: 非活性条件で false
{
  const api=loadEnv();
  setupActive(api,{vv:null});                             // vv 無し
  assert(api.isPpSearchKbdActive()===false, 'B1-1 visualViewport 非対応 → 非活性');
  const api2=loadEnv();
  const s2=setupActive(api2);
  api2._ctx.document.activeElement=null;                  // フォーカス無し
  assert(api2.isPpSearchKbdActive()===false, 'B1-2 #pp-search 非フォーカス → 非活性');
  const api3=loadEnv();
  setupActive(api3,{vv:{offsetTop:0,height:660,scale:1,addEventListener:function(){}}}); // 縮み7px
  assert(api3.isPpSearchKbdActive()===false, 'B1-3 縮み不足（キーボード無し）→ 非活性');
  const api4=loadEnv();
  setupActive(api4,{vv:{offsetTop:0,height:333.5,scale:2,addEventListener:function(){}}}); // ピンチズーム: 333.5*2=667
  assert(api4.isPpSearchKbdActive()===false, 'B1-4 ピンチズーム（scale 補正で差ゼロ）→ 非活性');
  const api5=loadEnv();
  const s5=setupActive(api5);
  s5.fsEl.style.display='none';                           // 全画面ビュー閉
  assert(api5.isPpSearchKbdActive()===false, 'B1-5 全画面ビューが閉→ 非活性');
}

// B2: キーボード縮みで true
{
  const api=loadEnv();
  setupActive(api);                                       // 667-360=307 > 100
  assert(api.isPpSearchKbdActive()===true, 'B2 キーボードで可視域が縮んでいれば活性');
}

// B3: 活性時のオーバーレイ配置＋fit＋内側スクロール
{
  const api=loadEnv();
  const s=setupActive(api);
  api.fitPpGridToViewport();
  assert(s.grid.style.position==='absolute'&&s.grid.style.left==='0'&&s.grid.style.right==='0',
    'B3-1 グリッドを absolute オーバーレイ化');
  assert(s.grid.style.top==='68px',                        // rowRect.bottom(166)-panelRect.top(104)+6
    'B3-2 検索欄行の直下に配置（top=68px・実測 '+s.grid.style.top+'）');
  assert(s.grid.style.zIndex==='3'&&s.grid.style.background==='#eef2f7',
    'B3-3 z-index はモードバー(4)未満・背景で下の50音タブを遮蔽');
  assert(s.grid.style.overflowY==='auto'&&s.grid.style.overscrollBehavior==='contain',
    'B3-4 内側スクロール化＋scroll chaining 遮断（②c）');
  assert(s.grid.style.maxHeight==='180px',                 // vv 360 - grid.top(172) - 8
    'B3-5 fitToVisualViewport で可視域へ追従（180px・実測 '+s.grid.style.maxHeight+'）');
  assert(s.panel.style.position==='relative',
    'B3-6 配置基準の #ppPanel を relative 化');
}

// B4: 非活性化で inline style 全除去（通常フロー復帰）
{
  const api=loadEnv();
  const s=setupActive(api);
  api.fitPpGridToViewport();                               // まず活性
  api._ctx.window.visualViewport={offsetTop:0,height:667,scale:1,addEventListener:function(){}}; // キーボード閉
  api.fitPpGridToViewport();
  const g=s.grid.style;
  assert(g.position===''&&g.left===''&&g.right===''&&g.top===''&&g.zIndex===''&&g.background===''&&
         g.maxHeight===''&&g.overflowY===''&&g.overscrollBehavior==='',
    'B4 キーボードが閉じたら inline style を全除去（overlay スクロール1本へ復帰）');
}

// B5: ensurePpSearchVisible のスクロール条件（overlay の scrollTop を動かす）
{
  const api=loadEnv();
  // 余白十分: 入力欄 top(120) >= barBottom(104) かつ bottom(160)+140 <= visBottom(360)
  const s=setupActive(api,{inputRect:{top:120,bottom:160}});
  api.ensurePpSearchVisible();
  assert(s.fsEl.scrollTop===0, 'B5-1 余白十分ならスクロールしない（scrollTop=0 不変）');
  // 余白不足: 入力欄が可視域下部（bottom+140 > 360）→ 行を barBottom+8 へ引き上げ
  const api2=loadEnv();
  const s2=setupActive(api2,{inputRect:{top:300,bottom:340},scrollTop:50});
  api2.ensurePpSearchVisible();
  assert(s2.fsEl.scrollTop===238,                          // 50 + (300-(104+8))
    'B5-2 余白不足なら overlay の scrollTop を進める（238・実測 '+s2.fsEl.scrollTop+'）');
  // 入力欄が sticky バーの下に潜っている（top < barBottom）→ 巻き戻し・負値は 0 クランプ
  const api3=loadEnv();
  const s3=setupActive(api3,{inputRect:{top:60,bottom:100},scrollTop:20});
  api3.ensurePpSearchVisible();
  assert(s3.fsEl.scrollTop===0,                            // 20 + (60-112) = -32 → 0
    'B5-3 バー下に潜ったら巻き戻す（負値は 0 クランプ・実測 '+s3.fsEl.scrollTop+'）');
}

console.log('INPUT-KBD-COEXIST-004: PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
