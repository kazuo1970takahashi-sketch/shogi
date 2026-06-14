#!/usr/bin/env node
// PDF-FILENAME-MVP-001: PDF（印刷帳票）保存時の既定ファイル名改善
//
// 命名規約: '<YYYYMMDD>_<大会名>_<クラス名(単一クラス時のみ)>_<帳票種別>'（空パートは除外）。
//   - printResults  → 対戦成績
//   - printPairings → 現在の組み合わせ
//   - downloadReport→ 報告書（大会全体のサマリ帳票のためクラス名は付けない）
//
// 観点:
//   A. 構造検査（3 ヘルパー定義 / 各印刷経路が buildPdfFilename を使用）
//   B. sanitizeFilenamePart 単体（禁止文字置換 / 空白畳み込み / fallback）
//   C. buildPdfFilename 単体（連結 / 空パート除外 / 全空 fallback）
//   D. pickSingleClassLabel 単体（単一クラス時のみ名前 / 複数・0 は空）
//   E. 結合（printResults / printPairings / downloadReport の <title> 出力）
//
// 本テストは PDF 本文・レイアウト・保存データ構造を一切検証対象にしない（ファイル名のみ）。
// テストデータは完全架空（御殿場支部将棋大会 等）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_pdf_filename_mvp_001.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass=0, fail=0;
function ok(msg){pass++; console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg); else ng(msg);}
function assertEq(a,b,msg){
  if(JSON.stringify(a)===JSON.stringify(b))ok(msg);
  else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));
}

// ============================================================
// SECTION A: 構造検査
// ============================================================
assert(/function\s+sanitizeFilenamePart\s*\(/.test(htmlSrc), 'A1 sanitizeFilenamePart() 定義あり');
assert(/function\s+buildPdfFilename\s*\(/.test(htmlSrc), 'A2 buildPdfFilename() 定義あり');
assert(/function\s+pickSingleClassLabel\s*\(/.test(htmlSrc), 'A3 pickSingleClassLabel() 定義あり');

function fnBody(name){
  const m = htmlSrc.match(new RegExp('function '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'));
  return m ? m[0] : '';
}
{
  const pr = fnBody('printResults');
  assert(pr.indexOf('buildPdfFilename(') >= 0, 'A4-1 printResults が buildPdfFilename を使用');
  assert(pr.indexOf('pickSingleClassLabel(printedClassNames)') >= 0, 'A4-2 printResults が単一クラス名を付与');
  assert(pr.indexOf("'対戦成績'") >= 0, 'A4-3 printResults の帳票種別は 対戦成績');
}
{
  const pp = fnBody('printPairings');
  assert(pp.indexOf('buildPdfFilename(') >= 0, 'A5-1 printPairings が buildPdfFilename を使用');
  assert(pp.indexOf('pickSingleClassLabel(pairingClassNames)') >= 0, 'A5-2 printPairings が単一クラス名を付与');
  assert(pp.indexOf("'現在の組み合わせ'") >= 0, 'A5-3 printPairings の帳票種別は 現在の組み合わせ');
}
{
  const dr = fnBody('downloadReport');
  assert(dr.indexOf('buildPdfFilename(') >= 0, 'A6-1 downloadReport が buildPdfFilename を使用');
  assert(dr.indexOf('pickSingleClassLabel') < 0, 'A6-2 downloadReport はクラス名を付けない（pickSingleClassLabel 不使用）');
  assert(dr.indexOf("'報告書'") >= 0, 'A6-3 downloadReport の帳票種別は 報告書');
}

// ============================================================
// サンドボックス（既存 test_*.js と同方式: extractScripts + new Function）
// ============================================================
function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
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
function makeContext(){
  const elements = {};
  function makeElem(id,tagName){
    const handlers = {};
    const attrs = {};
    const elem = {
      id:id||'', _tagName:(tagName||'div').toUpperCase(), _innerHTML:'',
      _handlers:handlers, _attrs:attrs, hidden:false,
      style:{_cssText:'', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'', marginTop:''},
      textContent:'', className:'', value:'', checked:false, type:'',
      classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=String(v==null?'':v);},
      appendChild(c){return c;}, removeChild(){}, remove(){},
      addEventListener(evt,fn){if(!handlers[evt])handlers[evt]=[];handlers[evt].push(fn);},
      removeEventListener(){}, dispatchEvent(){},
      click(){const fns=(handlers['click']||[]).slice();for(let i=0;i<fns.length;i++)fns[i].call(elem,{type:'click'});},
      setAttribute(k,v){attrs[k]=String(v);},
      getAttribute(k){return Object.prototype.hasOwnProperty.call(attrs,k)?attrs[k]:null;},
      focus(){}, blur(){}
    };
    return elem;
  }
  const doc = {
    _elements:elements,
    getElementById(id){ if(!elements[id])elements[id]=makeElem(id); return elements[id]; },
    getElementsByName(){return [];},
    createElement(tag){return makeElem('',tag);},
    body:{appendChild(){}, removeChild(){}},
    addEventListener(){}, removeEventListener(){}, querySelectorAll(){return [];}
  };
  return {
    document:doc, window:{innerWidth:1024}, localStorage:makeLocalStorage(),
    crypto:{randomUUID(){return 'uuid';}}
  };
}
function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  let lastBlobSrc = '';
  const Blob = function(arr){ this.__src=(arr&&arr[0])||''; };
  const URLMock = { createObjectURL(blob){lastBlobSrc=(blob&&blob.__src)||''; return 'blob:mock';}, revokeObjectURL(){} };
  ctx.window.open = function(){ return {focus(){}, addEventListener(){}, print(){}, close(){}}; };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       sanitizeFilenamePart: sanitizeFilenamePart,
       buildPdfFilename: buildPdfFilename,
       pickSingleClassLabel: pickSingleClassLabel,
       printResults: printResults,
       printPairings: printPairings,
       downloadReport: downloadReport,
       _setState: function(s){state=s;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, Blob, URLMock, {log(){}, error(){}, warn(){}}, Promise,
    function(fn2){ /* no-op timer */ return 0; }
  );
  api._ctx = ctx;
  api._getLastBlobSrc = function(){return lastBlobSrc;};
  return api;
}
function titleOf(html){
  const m = html.match(/<title>([\s\S]*?)<\/title>/);
  return m ? m[1] : null;
}

// ============================================================
// SECTION B: sanitizeFilenamePart 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  const f = env.sanitizeFilenamePart;
  assertEq(f('沼津支部月例将棋大会'), '沼津支部月例将棋大会', 'B1 通常文字列はそのまま');
  assertEq(f('A/B:大会'), 'A_B_大会', 'B2 禁止文字 / : を _ に置換');
  assertEq(f('a\\b*c?d"e<f>g|h'), 'a_b_c_d_e_f_g_h', 'B3 \\ * ? " < > | を _ に置換');
  assertEq(f('  大会  '), '大会', 'B4 前後空白は trim（_ にならず除去）');
  assertEq(f('A B\tC\nD'), 'A_B_C_D', 'B5 空白類（半角/タブ/改行）を _ に畳み込む');
  assertEq(f('A//B::C'), 'A_B_C', 'B6 連続する禁止文字は _ 1 個に畳み込む');
  assertEq(f('第1-2回'), '第1-2回', 'B7 ハイフンは有効文字として保持する');
  assertEq(f(''), '', 'B8 空文字 → 空');
  assertEq(f(null), '', 'B9 null → 空');
  assertEq(f(undefined), '', 'B10 undefined → 空');
  assertEq(f({}), '', 'B11 オブジェクト → 空');
  assertEq(f(20260614), '20260614', 'B12 数値は文字列化');
  assertEq(f('///'), '', 'B13 禁止文字のみ → trim 後 空');
  assertEq(f('A'+String.fromCharCode(1)+'B'), 'A_B', 'B14 制御文字 0x01 を _ に置換');
}

// ============================================================
// SECTION C: buildPdfFilename 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  const b = env.buildPdfFilename;
  assertEq(b(['20260614','御殿場支部将棋大会','A級','対戦成績'],'対戦成績'),
    '20260614_御殿場支部将棋大会_A級_対戦成績', 'C1 全パート連結');
  assertEq(b(['20260614','御殿場支部将棋大会','','報告書'],'報告書'),
    '20260614_御殿場支部将棋大会_報告書', 'C2 空のクラスパートは除外（二重 _ にならない）');
  assertEq(b(['','御殿場支部将棋大会','','報告書'],'報告書'),
    '御殿場支部将棋大会_報告書', 'C3 空の開催日も除外（先頭二重 _ にならない）');
  assertEq(b(['','','',''],'報告書'), '報告書', 'C4 全パート空 → fallback の帳票種別');
  assertEq(b([],'対戦成績'), '対戦成績', 'C5 空配列 → fallback');
  assertEq(b([], ''), 'shogi', 'C6 全空 + fallback も空 → shogi');
  assertEq(b('not-array','報告書'), '報告書', 'C7 配列でない parts → fallback');
  assertEq(b(['2026/06','大会:名'],'x'), '2026_06_大会_名', 'C8 パートも sanitize される');
}

// ============================================================
// SECTION D: pickSingleClassLabel 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  const p = env.pickSingleClassLabel;
  assertEq(p(['A級']), 'A級', 'D1 単一クラス → その名前');
  assertEq(p(['A級','B級']), '', 'D2 複数クラス → 空');
  assertEq(p([]), '', 'D3 0 クラス → 空');
  assertEq(p(['A級','A級']), 'A級', 'D4 同名重複は単一扱い');
  assertEq(p(['A級','',null,'  ']), 'A級', 'D5 空 / null / 空白を除外して単一なら名前');
  assertEq(p('not-array'), '', 'D6 配列でない → 空');
}

// ============================================================
// SECTION E: 結合（<title> 出力）
// ============================================================
function baseReport(over){
  const r = {date:'', place:'労政会館', start:'', end:'', sei:'', fuku:'', note:'',
    prize:7000, title:'御殿場支部将棋大会', organizer:'日本将棋連盟御殿場支部',
    fax:'000-0000', officeName:'御殿場支部事務局', accountingNote:'※架空'};
  if(over) for(const k in over) r[k]=over[k];
  return r;
}
function players1(){ return [{id:'p1',name:'架空太郎',entry_no:1}]; }
function players2(){ return [{id:'p1',name:'架空太郎',entry_no:1},{id:'p2',name:'架空次郎',entry_no:2}]; }

// E1: downloadReport 既定（日付あり・複数クラス）→ 日付_大会名_報告書
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:baseReport({date:'2026-06-14'})
  });
  env.downloadReport();
  assertEq(titleOf(env._getLastBlobSrc()), '20260614_御殿場支部将棋大会_報告書',
    'E1 downloadReport: 20260614_御殿場支部将棋大会_報告書');
}

// E2: downloadReport 日付なし → 二重 _ にならず 大会名_報告書
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:baseReport({date:''})
  });
  env.downloadReport();
  const t = titleOf(env._getLastBlobSrc());
  assertEq(t, '御殿場支部将棋大会_報告書', 'E2-1 日付なし → 御殿場支部将棋大会_報告書');
  assert(t.indexOf('__') < 0, 'E2-2 二重アンダースコアが出ない（旧 title__報告書 回避）');
}

// E3: downloadReport 不正文字を含む大会名 → sanitize
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:baseReport({date:'2026-06-14', title:'A/B:大会'})
  });
  env.downloadReport();
  assertEq(titleOf(env._getLastBlobSrc()), '20260614_A_B_大会_報告書',
    'E3 不正文字の大会名 A/B:大会 → 20260614_A_B_大会_報告書');
}

// E4: printResults 単一クラス → 日付_大会名_クラス_対戦成績
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:players1()}, rounds:3, pairings:{A:[]}, results:{A:[]}, started:true,
    classes:[{id:'A',name:'A級',started:true}],
    report:baseReport({date:'2026-06-14'})
  });
  env.printResults();
  assertEq(titleOf(env._getLastBlobSrc()), '20260614_御殿場支部将棋大会_A級_対戦成績',
    'E4 printResults 単一クラス: 20260614_御殿場支部将棋大会_A級_対戦成績');
}

// E5: printResults 複数クラス → クラス名は付かない
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:players1(),B:players1()}, rounds:3, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:true,
    classes:[{id:'A',name:'A級',started:true},{id:'B',name:'B級',started:true}],
    report:baseReport({date:'2026-06-14'})
  });
  env.printResults();
  const t = titleOf(env._getLastBlobSrc());
  assertEq(t, '20260614_御殿場支部将棋大会_対戦成績',
    'E5-1 printResults 複数クラス: 20260614_御殿場支部将棋大会_対戦成績');
  assert(t.indexOf('A級') < 0 && t.indexOf('B級') < 0, 'E5-2 複数クラス時はクラス名を含めない');
}

// E6: printPairings 単一クラス → 日付_大会名_クラス_現在の組み合わせ
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:players2()}, rounds:3, pairings:{A:[{p1:'p1',p2:'p2'}]}, results:{A:[]}, started:true,
    classes:[{id:'A',name:'A級',started:true}],
    report:baseReport({date:'2026-06-14'})
  });
  env.printPairings();
  assertEq(titleOf(env._getLastBlobSrc()), '20260614_御殿場支部将棋大会_A級_現在の組み合わせ',
    'E6 printPairings 単一クラス: 20260614_御殿場支部将棋大会_A級_現在の組み合わせ');
}

// E7: printPairings 複数クラス → クラス名は付かない
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:players2(),B:players2()}, rounds:3,
    pairings:{A:[{p1:'p1',p2:'p2'}],B:[{p1:'p1',p2:'p2'}]}, results:{A:[],B:[]}, started:true,
    classes:[{id:'A',name:'A級',started:true},{id:'B',name:'B級',started:true}],
    report:baseReport({date:'2026-06-14'})
  });
  env.printPairings();
  const t = titleOf(env._getLastBlobSrc());
  assertEq(t, '20260614_御殿場支部将棋大会_現在の組み合わせ',
    'E7-1 printPairings 複数クラス: 20260614_御殿場支部将棋大会_現在の組み合わせ');
  assert(t.indexOf('A級') < 0 && t.indexOf('B級') < 0, 'E7-2 複数クラス時はクラス名を含めない');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  PDF-FILENAME-MVP-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
