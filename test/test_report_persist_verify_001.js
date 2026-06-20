#!/usr/bin/env node
// REPORT-PERSIST-VERIFY-001 (Issue #261):
//   報告書フォーム 13 フィールドの「保存されない」懸念を**検証 + 回帰テストで固定**する。
//   バックログの「報告書入力欄が保存されない」が REPORT-UX-003A〜007B-1 の state-as-SoT 化で
//   実質対応済みであることを、save()→load() の実経路で 13 フィールド一括に証明する。
//
//   対象 13 フィールド（state.report）:
//     date / place / start / end / sei / fuku / note / prize /
//     title / organizer / fax / officeName / accountingNote
//
//   既存テストとの関係（重複ではなく gap 埋め）:
//     - 各フィールドの normalizer 単体・IME・escapeHtml・和暦変換などの **edge case** は
//       既存の dedicated test（test_report_ux_004/005/006/006b/006c/007a/007b 等）が担当。
//     - 本テストは「13 フィールドが揃って **save()→load() の実経路で往復する**」ことを
//       単一の権威的ガードとして固定する。以下を既存に無い形で追加する:
//         (a) normalizeState 単体ではなく **save()(=localStorage JSON 書込) → load()(=読込+JSON.parse+normalizeState)**
//             の実 persistence 経路を 13 フィールド一括で往復させる。
//         (b) 13 フィールドの **空値 / 欠落 → schema 既定値** を系統的に 1 箇所で固定。
//         (c) 二重往復（冪等性）。
//         (d) input→state（bindReportEvents/updateReportFieldFromElement）を 13 フィールド横断で確認。
//         (e) downloadReport（state-as-SoT・出力連動）を 13 フィールド横断で確認（fax は意図的に非出力）。
//
//   観点:
//     A. 構造 / schema guard（静的）
//       A1. normalizeState の base.report schema literal が 13 フィールドを既定値付きで持つ
//       A2. normalizeState が 13 フィールド各々に hasOwnProperty ガード + 専用 normalizer 復元分岐を持つ
//       A3. 13 フィールド分の normalizer 関数が定義されている
//     B. save()→load() 実経路の往復（有効値・13 フィールド）★コア
//       B1. 13 フィールドに架空の有効値 → save() → state 破壊 → load() → 13 フィールド一致
//       B2. 二重往復（save→load→save→load）で冪等
//     C. 空値 / 欠落 → schema 既定値（13 フィールド・load 側 normalizeState）
//       C1. report 全欠落 → 13 フィールドが schema 既定値
//       C2. 各フィールド空文字 → 既定値（date/start/end/sei/fuku/note→''、他→default、prize→7000）
//     D. 入力 → state（dimension 1: bindReportEvents/updateReportFieldFromElement・13 フィールド）
//     E. 出力連動（dimension 3: downloadReport state-as-SoT）
//       E1. 13 フィールドに値 → downloadReport → 出力 12 フィールド反映 + fax は非出力
//       E2. DOM と state 不一致 → state 優先（state-as-SoT 証明・代表フィールド）

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_persist_verify_001.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

// ---- schema 既定値（normalizeState base.report と一致）----
const DEFAULTS = {
  date:'', place:'労政会館', start:'', end:'', sei:'', fuku:'', note:'',
  prize:7000, title:'沼津支部月例将棋大会', organizer:'日本将棋連盟沼津支部',
  fax:'943-9443', officeName:'沼津支部事務局',
  accountingNote:'※役員会で会計長へ収支報告書として提出ください。'
};
const FIELDS = Object.keys(DEFAULTS); // 13 フィールド（schema 定義順）

// ---- 架空の有効値（normalizer 冪等＝往復で不変な値のみ）----
const VALID = {
  date:'2026-05-18', place:'架空会館', start:'13:00', end:'17:00',
  sei:'架空正', fuku:'架空副', note:'架空メモ',
  prize:3000, title:'架空大会', organizer:'架空連盟',
  fax:'012-345-6789', officeName:'架空事務局',
  accountingNote:'架空会計提出文'
};

// field → normalizeState 復元分岐で呼ばれる normalizer 名
const NORMALIZER = {
  date:'normalizeReportDateForInput', place:'normalizeReportPlace',
  start:'normalizeReportTimeForInput', end:'normalizeReportTimeForInput',
  sei:'normalizeReportSei', fuku:'normalizeReportFuku', note:'normalizeReportNote',
  prize:'normalizeReportPrize', title:'normalizeReportTitle',
  organizer:'normalizeReportOrganizer', fax:'normalizeReportFax',
  officeName:'normalizeReportOfficeName', accountingNote:'normalizeReportAccountingNote'
};

// field → 報告書フォームの DOM id
const DOM_ID = {
  date:'rep-date', place:'rep-place', start:'rep-start', end:'rep-end',
  sei:'rep-sei', fuku:'rep-fuku', note:'rep-note', prize:'rep-prize',
  title:'rep-title', organizer:'rep-organizer', fax:'rep-fax',
  officeName:'rep-office-name', accountingNote:'rep-accounting-note'
};

let pass=0, fail=0;
function ok(msg){pass++; console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg); else ng(msg);}
function assertEq(a,b,msg){
  if(JSON.stringify(a)===JSON.stringify(b))ok(msg);
  else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));
}

// ============================================================
// SECTION A: 構造 / schema guard（静的）
// ============================================================

// normalizeState 本体を切り出す
const nsMatch = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
const nsBody = nsMatch ? nsMatch[0] : '';
assert(nsBody.length > 0, 'A0 normalizeState 本体を切り出せる');

// A1: base.report schema literal に 13 フィールドが既定値付きで存在
FIELDS.forEach(function(k){
  // schema literal は `report:{...}` のオブジェクトリテラル。各キー名の出現を確認。
  const re = new RegExp('\\b' + k + ':');
  assert(re.test(nsBody), 'A1 normalizeState schema literal に "' + k + '" キーがある');
});
// 既定値そのものが schema literal に含まれること（代表的な non-empty default）
assert(nsBody.indexOf("place:'労政会館'") >= 0, 'A1-def place 既定値 "労政会館"');
assert(nsBody.indexOf('prize:7000') >= 0, 'A1-def prize 既定値 7000');
assert(nsBody.indexOf("title:'沼津支部月例将棋大会'") >= 0, 'A1-def title 既定値');
assert(nsBody.indexOf("organizer:'日本将棋連盟沼津支部'") >= 0, 'A1-def organizer 既定値');
assert(nsBody.indexOf("fax:'943-9443'") >= 0, 'A1-def fax 既定値');
assert(nsBody.indexOf("officeName:'沼津支部事務局'") >= 0, 'A1-def officeName 既定値');
assert(nsBody.indexOf("accountingNote:'※役員会で会計長へ収支報告書として提出ください。'") >= 0,
  'A1-def accountingNote 既定値');

// A2: 13 フィールド各々に hasOwnProperty ガード + 専用 normalizer 復元分岐
FIELDS.forEach(function(k){
  const guard = new RegExp("hasOwnProperty\\.call\\(\\s*s\\.report\\s*,\\s*['\"]" + k + "['\"]\\s*\\)");
  assert(guard.test(nsBody), 'A2-guard normalizeState が s.report."' + k + '" を hasOwnProperty ガード');
  const norm = new RegExp(NORMALIZER[k] + "\\s*\\(\\s*s\\.report\\." + k + "\\s*\\)");
  assert(norm.test(nsBody),
    'A2-norm "' + k + '" は ' + NORMALIZER[k] + '(s.report.' + k + ') で復元');
});

// A3: 13 フィールド分の normalizer 関数が定義されている（重複名は Set で）
Array.from(new Set(FIELDS.map(function(k){return NORMALIZER[k];}))).forEach(function(fn){
  const def = new RegExp('function\\s+' + fn + '\\s*\\(');
  assert(def.test(htmlSrc), 'A3 ' + fn + '() 関数定義あり');
});

// ============================================================
// loadEnv helper（既存 report テストと同型の最小 DOM/localStorage モック）
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
    const myChildren = [];
    const attrs = {};
    const elem = {
      id:id||'',
      _tagName:(tagName||'div').toUpperCase(),
      _innerHTML:'',
      _handlers:handlers,
      _children:myChildren,
      _attrs:attrs,
      hidden:false,
      style:{_cssText:'', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:''},
      textContent:'',
      className:'',
      value:'', checked:false, type:'',
      classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=String(v==null?'':v);},
      appendChild(c){myChildren.push(c); return c;},
      removeChild(){}, remove(){},
      addEventListener(evt,fn){if(!handlers[evt])handlers[evt]=[];handlers[evt].push(fn);},
      removeEventListener(){},
      dispatchEvent(){},
      click(){const fns=(handlers['click']||[]).slice();for(let i=0;i<fns.length;i++)fns[i].call(elem,{type:'click'});},
      setAttribute(k,v){attrs[k]=String(v);},
      getAttribute(k){return Object.prototype.hasOwnProperty.call(attrs,k)?attrs[k]:null;},
      focus(){}, blur(){}
    };
    return elem;
  }
  const doc = {
    _elements:elements,
    getElementById(id){
      if(!elements[id])elements[id]=makeElem(id);
      return elements[id];
    },
    getElementsByName(){return [];},
    createElement(tag){return makeElem('',tag);},
    body:{appendChild(){}, removeChild(){}},
    addEventListener(){}, removeEventListener(){},
    querySelectorAll(){return [];}
  };
  return {
    document:doc,
    window:{innerWidth:1024},
    localStorage:makeLocalStorage(),
    crypto:{randomUUID(){return 'uuid';}}
  };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  let lastBlobSrc = '';
  const Blob = function(arr, opts){
    this.size=(arr&&arr[0]&&arr[0].length)||0;
    this.type=(opts&&opts.type)||'';
    this.__src=(arr&&arr[0])||'';
  };
  const URLMock = {
    createObjectURL(blob){lastBlobSrc=(blob&&blob.__src)||''; return 'blob:mock';},
    revokeObjectURL(){}
  };
  ctx.window.open = function(){
    return {focus(){}, addEventListener(){}, print(){}, close(){}};
  };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       normalizeState: normalizeState,
       save: save,
       load: load,
       bindReportEvents: bindReportEvents,
       updateReportFieldFromElement: updateReportFieldFromElement,
       downloadReport: downloadReport,
       _setState: function(s){state=s;},
       _getState: function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, Blob, URLMock,
    {log(){}, error(){}, warn(){}},
    Promise
  );
  api._ctx = ctx;
  api._getLastBlobSrc = function(){return lastBlobSrc;};
  return api;
}

function makeBaseState(reportOverrides){
  const report = Object.assign({}, DEFAULTS, reportOverrides || {});
  return {
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:report
  };
}

// ============================================================
// SECTION B: save()→load() 実経路の往復（有効値・13 フィールド）★コア
// ============================================================

// B1: 13 フィールドに架空有効値 → save() → state 破壊 → load() → 13 フィールド一致
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState(VALID));
  env.save(); // localStorage(STORAGE_KEY) へ JSON.stringify(state) を書込

  // load() が確実に localStorage 由来で復元することを示すため、state を破壊しておく
  env._setState(makeBaseState()); // 全フィールド default の別 state に差し替え
  env.load();   // getItem → JSON.parse → normalizeState → state 代入

  const r = env._getState().report;
  FIELDS.forEach(function(k){
    assertEq(r[k], VALID[k], 'B1 save→load 往復で "' + k + '" が保たれる');
  });
  // report オブジェクトに 13 フィールドのみ（余計なキーが増減していない）
  assertEq(Object.keys(r).sort(), FIELDS.slice().sort(), 'B1-keys report は 13 フィールド構成');
}

// B2: 二重往復（save→load→save→load）で冪等
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState(VALID));
  env.save(); env.load();
  const r1 = Object.assign({}, env._getState().report);
  env.save(); env.load();
  const r2 = env._getState().report;
  FIELDS.forEach(function(k){
    assertEq(r2[k], r1[k], 'B2 二重往復で "' + k + '" が冪等');
    assertEq(r2[k], VALID[k], 'B2-val "' + k + '" は有効値のまま');
  });
}

// ============================================================
// SECTION C: 空値 / 欠落 → schema 既定値（load 側 normalizeState）
// ============================================================

// C1: report 全欠落 → 13 フィールドが schema 既定値
{
  const env = loadEnv(targetPath);
  const n = env.normalizeState({}); // report 自体が無い旧データ
  FIELDS.forEach(function(k){
    assertEq(n.report[k], DEFAULTS[k], 'C1 report 欠落 → "' + k + '" が既定値');
  });
}

// C1b: report={} （空オブジェクト）→ 既定値
{
  const env = loadEnv(targetPath);
  const n = env.normalizeState({report:{}});
  FIELDS.forEach(function(k){
    assertEq(n.report[k], DEFAULTS[k], 'C1b report={} → "' + k + '" が既定値');
  });
}

// C2: 各フィールド空文字 → 既定値
//   string 系（date/start/end/sei/fuku/note）は '' のまま、それ以外は default、prize は 7000。
{
  const env = loadEnv(targetPath);
  const emptyReport = {};
  FIELDS.forEach(function(k){ emptyReport[k] = ''; }); // prize も '' を渡す
  const n = env.normalizeState({report:emptyReport});
  FIELDS.forEach(function(k){
    assertEq(n.report[k], DEFAULTS[k], 'C2 "' + k + '"=空文字 → 既定値 ' + JSON.stringify(DEFAULTS[k]));
  });
}

// C3: 全フィールド save→load 往復後も「空値→既定値」が保たれる（実経路）
{
  const env = loadEnv(targetPath);
  const emptyReport = {};
  FIELDS.forEach(function(k){ emptyReport[k] = (k==='prize') ? '' : ''; });
  env._setState(makeBaseState(emptyReport));
  env.save(); env.load();
  const r = env._getState().report;
  FIELDS.forEach(function(k){
    assertEq(r[k], DEFAULTS[k], 'C3 空値 save→load 往復後も "' + k + '" が既定値');
  });
}

// ============================================================
// SECTION D: 入力 → state（bindReportEvents/updateReportFieldFromElement・13 フィールド）
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  env.bindReportEvents();
  FIELDS.forEach(function(k){
    const el = env._ctx.document.getElementById(DOM_ID[k]);
    // change handler が bind されていること
    const fns = (el._handlers && el._handlers['change']) || [];
    assert(fns.length >= 1, 'D-bind "' + k + '" (' + DOM_ID[k] + ') に change handler bind あり');
    // DOM へ値を入れて change を発火 → state へ反映
    el.value = String(VALID[k]);
    for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
    assertEq(env._getState().report[k], VALID[k],
      'D-state "' + k + '" の change で state.report.' + k + ' へ反映（prize は数値化）');
  });
}

// D2: 空欄 change → 既定値補正（state-as-SoT の補正動作・代表 default 系フィールド）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState(VALID));
  env.bindReportEvents();
  [['place','労政会館'],['title','沼津支部月例将棋大会'],['prize',7000],
   ['organizer','日本将棋連盟沼津支部'],['officeName','沼津支部事務局'],
   ['accountingNote','※役員会で会計長へ収支報告書として提出ください。']].forEach(function(p){
    const k = p[0], def = p[1];
    const el = env._ctx.document.getElementById(DOM_ID[k]);
    el.value = '';
    const fns = (el._handlers && el._handlers['change']) || [];
    for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
    assertEq(env._getState().report[k], def, 'D2 "' + k + '" 空欄 change → 既定値補正');
  });
}

// ============================================================
// SECTION E: 出力連動（downloadReport state-as-SoT）
// ============================================================

// E1: 13 フィールドに値 → downloadReport → 出力反映 + fax 非出力
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState(VALID));
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // 出力される 12 フィールド（fax を除く）の state 値が帳票に現れる
  assert(html.indexOf('架空大会報告書') >= 0, 'E1 title → "架空大会報告書"（state-as-SoT）');
  assert(html.indexOf('2026年5月18日') >= 0, 'E1 date → 和暦 "2026年5月18日"');
  assert(html.indexOf('13時00分') >= 0, 'E1 start → 和暦 "13時00分"');
  assert(html.indexOf('17時00分') >= 0, 'E1 end → 和暦 "17時00分"');
  assert(html.indexOf('架空会館') >= 0, 'E1 place → "架空会館"');
  assert(html.indexOf('▲3,000円') >= 0, 'E1 prize → "▲3,000円"');
  assert(html.indexOf('架空連盟') >= 0, 'E1 organizer → "架空連盟"');
  assert(html.indexOf('架空正') >= 0, 'E1 sei → "架空正"');
  assert(html.indexOf('架空副') >= 0, 'E1 fuku → "架空副"');
  assert(html.indexOf('架空メモ') >= 0, 'E1 note → "架空メモ"');
  assert(html.indexOf('架空事務局') >= 0, 'E1 officeName → "架空事務局"');
  assert(html.indexOf('架空会計提出文') >= 0, 'E1 accountingNote → "架空会計提出文"');
  // fax は設計上、報告書には出力しない（state 互換のため schema には残置）
  assert(html.indexOf('012-345-6789') < 0, 'E1 fax は報告書に非出力（設計どおり・state 互換のみ）');
}

// E2: DOM と state が異なる場合 state が優先される（DOM 直読みでない＝state-as-SoT）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({
    date:'2026-05-18', start:'13:00', end:'17:00',
    title:'state大会', note:'state申し送り', accountingNote:'state会計文'
  }));
  // DOM には別の値を仕込む
  ['rep-title','rep-note','rep-accounting-note'].forEach(function(id){
    env._ctx.document.getElementById(id).value = 'DOM側の値';
  });
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('state大会報告書') >= 0, 'E2 title は state 優先');
  assert(html.indexOf('state申し送り') >= 0, 'E2 note は state 優先');
  assert(html.indexOf('state会計文') >= 0, 'E2 accountingNote は state 優先');
  assert(html.indexOf('DOM側の値') < 0, 'E2 DOM 直読みの値は帳票に出ない');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-PERSIST-VERIFY-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
