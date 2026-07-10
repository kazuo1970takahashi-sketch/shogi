#!/usr/bin/env node
// ============================================================
// WORLD-STD-ALIGN-002 (#717): 受付リストの固定列グリッド化（世界標準の揃え②）
//   検証内容:
//   S1. CSS: 既定の .player-row は縮退グリッド3段（No.+氏名+参加費 / 会員区分+種別 / 操作）
//       ＝狭幅・container query 非対応環境のフォールバック
//   S2. CSS: .player-row-main / .player-row-actions が display:contents（DOM 維持で grid 参加）
//   S3. CSS: 氏名=左(既定)+ellipsis / 参加費=右寄せ+tabular-nums / 縮退時の操作は space-between
//   S4. CSS: 列見出し行 .player-row-head は既定で非表示
//   S5. CSS: コンテナ幅による自動切替 — 受付リスト要素がコンテナ（container-type:inline-size）で、
//       @container 広幅時のみ承認済み6列 grid（No.34px/氏名 minmax(120px,1fr)/会員区分118px/
//       種別92px/参加費74px/操作auto）＋列見出し行（行と同一列定義）
//   S6. JS: renderRegList の列見出し行は textContent のみで組立（escape ヒューリスティック非接触）・0名時は出さない
//   B1. makePlayerRow の DOM 構造不変（.player-row > main(4子) + actions(2子)・操作ボタン3個）
//   B2. renderRegList: 参加者ありのクラスは先頭に .player-row-head（span 6個・ラベル一致）＋人数分の .player-row
//   B3. renderRegList: 0名のクラスには列見出し行を出さない
// 使い方: node test/test_world_std_align_002.js shogi_v4.html
// データは完全架空のみ。
// ============================================================
'use strict';
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_world_std_align_002.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const RAW = fs.readFileSync(targetPath,'utf8');

// ============================================================
// 静的検査（CSS / JS ソース）
// ============================================================
{
  // 既定（狭幅・container query 非対応環境のフォールバック）= 縮退グリッド3段
  assert(/\.player-row\{display:grid;grid-template-columns:34px minmax\(0,1fr\) auto;grid-template-areas:"pno pname pfee" "pmember pmember pgrade" "pops pops pops";align-items:center\}/.test(RAW),
    'S1 既定の .player-row は縮退グリッド3段（No.+氏名+参加費 / 会員区分+種別 / 操作）');
  assert(/\.player-row-main,\.player-row-actions\{display:contents\}/.test(RAW),
    'S2 main/actions は display:contents（makePlayerRow の DOM 維持）');
  assert(/\.player-row \.player-name\{grid-area:pname;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/.test(RAW),
    'S3-1 氏名列は ellipsis');
  assert(/\.player-row \.player-fee\{grid-area:pfee;text-align:right;font-variant-numeric:tabular-nums\}/.test(RAW),
    'S3-2 参加費列は右寄せ + tabular-nums');
  assert(/\.player-row \.player-row-buttons\{grid-area:pops;justify-content:space-between\}/.test(RAW),
    'S3-3 縮退時の操作ボタン行は space-between（従来のタップ間隔を維持）');
  assert(/\.player-row-head\{display:none\}/.test(RAW),
    'S4-1 列見出し行は既定で非表示（縮退時・非対応環境で出ない）');
  // コンテナ幅による自動切替（作者決定 2026-07-09・container query）
  assert(/#reg-class-grid\{grid-template-columns:1fr\}/.test(RAW),
    'S5-0 受付タブのクラス section は縦積み（リストに全幅を与える・他タブの .grid2 不変）');
  assert(/#a-list,#b-list,\[id\^="class-list-"\]\{container-type:inline-size\}/.test(RAW),
    'S5-1 受付リスト要素（regClassListId の3系統）がコンテナ');
  const cq = RAW.match(/@container \(min-width:\d+px\)\{[\s\S]*?\n\}/);
  assert(!!cq, 'S5-2 @container ブロックが存在する');
  assert(!!cq && /\.player-row\{grid-template-columns:34px minmax\(120px,1fr\) 118px 92px 74px auto;grid-template-areas:none\}/.test(cq[0]),
    'S5-3 広幅では承認済み6列 grid（34px/minmax(120px,1fr)/118px/92px/74px/auto）');
  assert(!!cq && /\.player-row-head\{display:grid;grid-template-columns:34px minmax\(120px,1fr\) 118px 92px 74px auto;/.test(cq[0]),
    'S5-4 広幅では列見出し行を行と同一列定義で表示');
  assert(!!cq && /grid-area:auto/.test(cq[0]),
    'S5-5 広幅では縮退用 grid-area をリセット（source 順の自動配置に戻す）');
  assert(/headRow\.className='player-row-head'/.test(RAW),
    'S6-1 renderRegList が列見出し行を生成する');
  assert(/hSpan\.textContent=headLabels\[hi\]/.test(RAW),
    'S6-2 見出しは textContent のみで組立（innerHTML 連結なし）');
  assert(/if\(players\.length>0\)\{\s*\n\s*var headRow/.test(RAW),
    'S6-3 0名のクラスには見出し行を出さない');
}

// ============================================================
// サンドボックス（test_fee_josei_001.js と同型の最小モック）
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
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
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
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  let _uuidSeq = 0;
  const cryptoMock = {randomUUID(){
    _uuidSeq++;
    const hex = ('00000000000' + _uuidSeq.toString(16)).slice(-12);
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-4000-8000-000000000000';
  }};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       makePlayerRow:makePlayerRow,
       renderRegList:renderRegList,
       regClassListId:regClassListId,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

// 完全架空の最小 state（A/B 2クラス・未開始）。
function fxState(playersA, playersB){
  return {
    players:{A:playersA||[], B:playersB||[]},
    rounds:0, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}
function fxPlayer(id,name,no){
  return {id:id,name:name,cls:'A',member:'member',grade:'ippan',entry_no:no,yomi:''};
}

// ============================================================
// B1. makePlayerRow の DOM 構造不変（display:contents 前提の 2 コンテナ構成）
// ============================================================
{
  const env = loadEnv();
  env._setState(fxState([fxPlayer('p1','架空 太郎',1)]));
  const row = env.makePlayerRow(env._getState().players.A[0],'A',0);
  assert(row.className==='player-row','B1-1 行 class は player-row のまま');
  assert(row.childNodes.length===2,'B1-2 行直下は 2 要素（main + actions）のまま');
  const main=row.childNodes[0], actions=row.childNodes[1];
  assert(main.className==='player-row-main','B1-3 1つ目は player-row-main');
  assert(actions.className==='player-row-actions','B1-4 2つ目は player-row-actions');
  assert(main.childNodes.length===4,'B1-5 main は 4 子（No./氏名/会員区分/種別）＝grid 参加要素数が仕様どおり');
  assert(main.childNodes[0].tagName==='span','B1-6 No. は span');
  assert(main.childNodes[1].className==='player-name','B1-7 氏名は .player-name');
  assert(main.childNodes[2].tagName==='select'&&main.childNodes[3].tagName==='select','B1-8 会員区分/種別は select×2');
  assert(actions.childNodes.length===2,'B1-9 actions は 2 子（参加費 + 操作ボタン群）');
  assert(actions.childNodes[0].className==='player-fee','B1-10 参加費は .player-fee');
  assert(actions.childNodes[1].className==='player-row-buttons','B1-11 操作は .player-row-buttons');
  assert(actions.childNodes[1].childNodes.length===3,'B1-12 未開始クラスの操作ボタンは 3 個（名前編集/ふりがな/削除）');
}

// ============================================================
// B2/B3. renderRegList: 見出し行の有無（参加者あり=先頭 1 行・0名=なし）
// ============================================================
{
  const env = loadEnv();
  env._setState(fxState([fxPlayer('p1','架空 太郎',1),fxPlayer('p2','架空 次郎',2)],[]));
  let threw=false;
  try{ env.renderRegList(); }catch(e){ threw=true; }
  assert(!threw,'B2-0 renderRegList が例外なく動作する');
  const listA = env._ctx._elements[env.regClassListId('A')];
  assert(!!listA,'B2-1 A クラスのリスト要素が描画対象になる');
  const kidsA = (listA&&listA.childNodes)||[];
  assert(kidsA.length===3,'B2-2 A: 見出し1行 + 参加者2行 = 3 要素');
  assert(kidsA.length>0&&kidsA[0].className==='player-row-head','B2-3 A: 先頭は .player-row-head');
  const headSpans=(kidsA.length>0&&kidsA[0].childNodes)||[];
  assert(headSpans.length===6,'B2-4 見出しは span 6 個（6列と同数）');
  const labels=headSpans.map(function(s){return s.textContent;}).join('|');
  assert(labels==='No.|氏名|会員区分|種別|参加費|操作','B2-5 見出しラベル（No./氏名/会員区分/種別/参加費/操作）');
  assert(kidsA.length===3&&kidsA[1].className==='player-row'&&kidsA[2].className==='player-row','B2-6 見出しの後に .player-row が人数分');
  const listB = env._ctx._elements[env.regClassListId('B')];
  const kidsB = (listB&&listB.childNodes)||[];
  assert(kidsB.length===0,'B3-1 B: 0名のクラスは見出し行も行も出さない');
}

console.log(`WORLD-STD-ALIGN-002: PASS ${pass}件 / FAIL ${fail}件`);
process.exit(fail === 0 ? 0 : 1);
