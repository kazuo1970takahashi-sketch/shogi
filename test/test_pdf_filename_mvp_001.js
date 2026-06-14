#!/usr/bin/env node
// SHOGI-TOUR-PDF-FILENAME-MVP-001: PDF 保存時の推奨ファイル名（<title> 由来の基底名）を
//   「{YYYYMMDD}_{大会名}[_{クラス名}]_{種別}」形式へ統一する最小実装の単体テスト。
//   ※本タスクは PDF 本文・レイアウト・保存データ構造を変更しない。ファイル名生成のみが対象。
//   ※LIVE-MOBILE-SCOREBOARD-001(PR #204) の「{YYYY年M月度}{大会名}{種別}」形式を
//     運用者の明示要望で意図的に置き換える（既存テストは別途新仕様へ追従済み）。
//
// 観点:
//   N1. helper 単体: buildSafePdfFilename が空トークンを落とし '_' で連結する / 全空は '将棋大会' fallback
//   N2. helper 単体: buildTournamentHeldDateCompact が YYYY-MM-DD→YYYYMMDD、未入力/不正は ''
//   N3. printResults 単一クラス → '{YYYYMMDD}_{大会名}_{クラス名}_対戦成績'（クラス名付与）
//   N4. printResults 複数クラス → '{YYYYMMDD}_{大会名}_対戦成績'（特定クラス名は付けない）
//   N5. printResults 開催日未入力 → 先頭 '_' なし・日付トークン省略で graceful
//   N6. printPairings 単一クラス → '{YYYYMMDD}_{大会名}_{クラス名}_組み合わせ'
//   N7. printPairings 複数クラス → '{YYYYMMDD}_{大会名}_組み合わせ'（クラス名なし）
//   N8. downloadReport → '{YYYYMMDD}_{大会名}_報告書'（大会全体の帳票なのでクラス名なし）
//   N9. 危険文字を含む大会名でも OS 禁止文字を除去（パス区切り混入なし）
//  N10. 拡張子(.pdf)は基底名に埋め込まない（ブラウザ依存のため）

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  const elements = {};
  function makeElem(id){
    return {
      id:id||'', _innerHTML:'', style:{cssText:'',display:''}, className:'',
      hidden:false,
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(){}, appendChild(){}, remove(){}, focus(){}, click(){},
      value:'', textContent:'', firstChild:null,
      getAttribute(){return null;}, setAttribute(){}
    };
  }
  const docMock = {
    _elements:elements,
    getElementById(id){if(!elements[id])elements[id]=makeElem(id);return elements[id];},
    createElement(){return makeElem();},
    body:{appendChild(){}, removeChild(){}},
    addEventListener(){}, removeEventListener(){}, querySelectorAll(){return [];}
  };
  function makeFakeOpenedWindow(){
    const loadHandlers = [];
    return {
      _loadHandlers:loadHandlers,
      focus(){},
      addEventListener(type, fn){if(type==='load')loadHandlers.push(fn);},
      print(){},
      close(){}
    };
  }
  const winMock = {
    innerWidth:1024,
    open(){return makeFakeOpenedWindow();}
  };
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=String(v);}, removeItem(k){delete this._[k];}};

  const blobCaptures = [];
  function BlobMock(parts, options){
    const content = (parts && parts[0]) ? String(parts[0]) : '';
    blobCaptures.push({content:content, type:options&&options.type});
    return {_isMockBlob:true, _content:content};
  }
  const urlMock = {
    createObjectURL(){return 'blob:mock://'+blobCaptures.length;},
    revokeObjectURL(){}
  };

  return {
    document:docMock,
    window:winMock,
    localStorage:localStorageMock,
    Blob:BlobMock,
    URL:urlMock,
    _blobCaptures:blobCaptures
  };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       _setState:function(s){state=s;},
       _getState:function(){return state;},
       printResults:printResults,
       downloadReport:downloadReport,
       printPairings:printPairings,
       buildTournamentPdfFilename:buildTournamentPdfFilename,
       buildTournamentHeldDateCompact:buildTournamentHeldDateCompact,
       buildSafePdfFilename:buildSafePdfFilename,
       sanitizeFilenamePart:sanitizeFilenamePart,
       normalizeReportTitle:normalizeReportTitle
     };`
  );
  const alertCalls = [];
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(msg){alertCalls.push(String(msg));},
    function(){return true;},
    function(){return '';},
    function(){}, ctx.Blob, ctx.URL,
    {log(){},warn(){},error(){}}, Promise,
    function(){ /* no-op setTimeout */ }
  );
  api._ctx = ctx;
  api._alertCalls = alertCalls;
  api._getPrintedHtml = function(){
    const caps = ctx._blobCaptures;
    return caps.length>0 ? caps[caps.length-1].content : '';
  };
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_pdf_filename_mvp_001.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(msg);else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makePlayer(id,name,cls,entryNo){
  return {id:id,name:name,cls:cls,member:'member',grade:'ippan',entry_no:entryNo};
}
function makeReportDefaults(overrides){
  return Object.assign(
    {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部',fax:'943-9443',officeName:'沼津支部事務局',accountingNote:'※役員会で会計長へ収支報告書として提出ください。'},
    overrides||{}
  );
}
function extractTitle(html){
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1] : '';
}

// 単一クラス(A のみ results あり) state
function makeStateOneClass(reportOverrides){
  return {
    players:{A:[makePlayer('p1','山田','A',1),makePlayer('p2','佐藤','A',2)],B:[]},
    rounds:1,
    pairings:{A:[],B:[]},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]],B:[]},
    started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    report:makeReportDefaults(reportOverrides||{})
  };
}
// 複数クラス(A/B 双方 results あり) state
function makeStateTwoClasses(reportOverrides){
  return {
    players:{A:[makePlayer('p1','山田','A',1),makePlayer('p2','佐藤','A',2)],
             B:[makePlayer('p3','鈴木','B',1),makePlayer('p4','田中','B',2)]},
    rounds:1,
    pairings:{A:[],B:[]},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]],B:[[{p1:'p3',p2:'p4',winner:'p3'}]]},
    started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    report:makeReportDefaults(reportOverrides||{})
  };
}
// printPairings 用: 開始済・ペアあり・未消化(results.length<rounds)
function makeStatePairings(twoClasses,reportOverrides){
  return {
    players:{A:[makePlayer('p1','山田','A',1),makePlayer('p2','佐藤','A',2)],
             B:twoClasses?[makePlayer('p3','鈴木','B',1),makePlayer('p4','田中','B',2)]:[]},
    rounds:3,
    pairings:{A:[{p1:'p1',p2:'p2'}],B:twoClasses?[{p1:'p3',p2:'p4'}]:[]},
    results:{A:[],B:[]},
    started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:twoClasses}],
    report:makeReportDefaults(reportOverrides||{})
  };
}

// ============================================================
// N1: buildSafePdfFilename 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  assertEq(env.buildSafePdfFilename(['20260614','大会','対戦成績'],'_'), '20260614_大会_対戦成績',
    'N1-a 空なしトークンを "_" で連結');
  assertEq(env.buildSafePdfFilename(['','大会','','報告書'],'_'), '大会_報告書',
    'N1-b 空トークンは落として連結（先頭/中間の空白トークンで "__" にならない）');
  assertEq(env.buildSafePdfFilename([],'_'), '将棋大会',
    'N1-c 全トークン空は "将棋大会" に fallback');
  assertEq(env.buildSafePdfFilename(['a','b']), 'ab',
    'N1-d sep 省略時は従来どおり区切りなし連結（後方互換）');
}

// ============================================================
// N2: buildTournamentHeldDateCompact 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStateOneClass({date:'2026-06-14'}));
  assertEq(env.buildTournamentHeldDateCompact(), '20260614', 'N2-a YYYY-MM-DD → YYYYMMDD');
  env._setState(makeStateOneClass({date:'2026年6月14日'}));
  assertEq(env.buildTournamentHeldDateCompact(), '20260614', 'N2-b 旧形式も normalize 経由で YYYYMMDD');
  env._setState(makeStateOneClass({date:''}));
  assertEq(env.buildTournamentHeldDateCompact(), '', 'N2-c 未入力は ""');
  env._setState(makeStateOneClass({date:null}));
  assertEq(env.buildTournamentHeldDateCompact(), '', 'N2-d null は ""');
  env._setState(makeStateOneClass({date:12345}));
  assertEq(env.buildTournamentHeldDateCompact(), '', 'N2-e 数値（不正値）は ""');
}

// ============================================================
// N3: printResults 単一クラス → クラス名付与
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStateOneClass({date:'2026-06-14',title:'架空将棋大会'}));
  env.printResults();
  const title = extractTitle(env._getPrintedHtml());
  assertEq(title, '20260614_架空将棋大会_Aクラス_対戦成績',
    'N3 単一クラス printResults → "20260614_架空将棋大会_Aクラス_対戦成績"');
}

// ============================================================
// N4: printResults 複数クラス → 特定クラス名なし
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStateTwoClasses({date:'2026-06-14',title:'架空将棋大会'}));
  env.printResults();
  const title = extractTitle(env._getPrintedHtml());
  assertEq(title, '20260614_架空将棋大会_対戦成績',
    'N4-a 複数クラス printResults → クラス名を付けず "20260614_架空将棋大会_対戦成績"');
  assert(title.indexOf('Aクラス') < 0 && title.indexOf('Bクラス') < 0,
    'N4-b 複数クラス時は特定クラス名（Aクラス/Bクラス）を含めない');
}

// ============================================================
// N5: printResults 開催日未入力 → 先頭 "_" なし・graceful
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStateOneClass({date:'',title:'架空将棋大会'}));
  env.printResults();
  const title = extractTitle(env._getPrintedHtml());
  assertEq(title, '架空将棋大会_Aクラス_対戦成績',
    'N5-a 開催日未入力 → 日付トークン省略 "架空将棋大会_Aクラス_対戦成績"');
  assert(!/^_/.test(title), 'N5-b 先頭が "_" にならない（空日付で "_大会名" にならない）');
  assert(!/undefined|null|NaN/.test(title), 'N5-c undefined/null/NaN を含まない');
}

// ============================================================
// N6: printPairings 単一クラス → クラス名付与・種別「組み合わせ」
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStatePairings(false,{date:'2026-06-14',title:'架空将棋大会'}));
  env.printPairings();
  const title = extractTitle(env._getPrintedHtml());
  assertEq(title, '20260614_架空将棋大会_Aクラス_組み合わせ',
    'N6 単一クラス printPairings → "20260614_架空将棋大会_Aクラス_組み合わせ"');
}

// ============================================================
// N7: printPairings 複数クラス → クラス名なし
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStatePairings(true,{date:'2026-06-14',title:'架空将棋大会'}));
  env.printPairings();
  const title = extractTitle(env._getPrintedHtml());
  assertEq(title, '20260614_架空将棋大会_組み合わせ',
    'N7-a 複数クラス printPairings → クラス名なし "20260614_架空将棋大会_組み合わせ"');
  assert(title.indexOf('Aクラス') < 0 && title.indexOf('Bクラス') < 0,
    'N7-b 複数クラス時は特定クラス名を含めない');
}

// ============================================================
// N8: downloadReport → クラス名なし
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStateOneClass({date:'2026-06-14',title:'架空将棋大会'}));
  env.downloadReport();
  const title = extractTitle(env._getPrintedHtml());
  assertEq(title, '20260614_架空将棋大会_報告書',
    'N8 downloadReport → "20260614_架空将棋大会_報告書"（大会全体帳票・クラス名なし）');
}

// ============================================================
// N9: 危険文字を含む大会名 → OS 禁止文字除去
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStateOneClass({date:'2026-06-14',title:'A/B:大会*?<>|"'}));
  env.printResults();
  const title = extractTitle(env._getPrintedHtml());
  assert(!/[\\/:*?"<>|]/.test(title), 'N9-a ファイル名に OS 禁止文字（\\ / : * ? " < > |）を含まない');
  assert(title.indexOf('20260614') >= 0 && title.indexOf('対戦成績') >= 0,
    'N9-b 危険文字除去後も 開催日・種別 は残り基底名が破綻しない');
}

// ============================================================
// N10: 拡張子 .pdf を基底名に埋め込まない（ブラウザ依存）
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeStateOneClass({date:'2026-06-14',title:'架空将棋大会'}));
  env.printResults();
  const title = extractTitle(env._getPrintedHtml());
  assert(title.indexOf('.pdf') < 0, 'N10 <title> 基底名に ".pdf" を埋め込まない（保存時にブラウザが付与）');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  SHOGI-TOUR-PDF-FILENAME-MVP-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
