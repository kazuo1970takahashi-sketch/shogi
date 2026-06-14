#!/usr/bin/env node
// REPORT-UX-004: configurable tournament title field
//
// 観点:
//   A. 構造検査
//     A1. normalizeReportTitle() 定義
//     A2. #rep-title input が存在し、type=text または無指定（既定 text）
//     A3. state.report schema 6 箇所すべてに title:'沼津支部月例将棋大会' 既定値
//     A4. normalizeState が title 復元を行う
//     A5. populateReportFields が rep-title を扱う
//     A6. bindReportEvents の field list に 'title' が含まれる
//     A7. updateReportFieldFromElement で key==='title' 分岐があり normalizeReportTitle 経由 + DOM 同期
//     A8. downloadReport が normalizeReportTitle 経由で title を取得し、旧固定 literal は撤去
//
//   B. normalizeReportTitle helper 単体
//     B1. 通常文字列: '特別大会' → '特別大会'
//     B2. trim: '  大会名  ' → '大会名'
//     B3. 空文字: '' → '沼津支部月例将棋大会' fallback
//     B4. trim 空: '   ' → '沼津支部月例将棋大会' fallback
//     B5. null → '沼津支部月例将棋大会'
//     B6. undefined → '沼津支部月例将棋大会'
//     B7. 数値 → '沼津支部月例将棋大会'
//     B8. オブジェクト → '沼津支部月例将棋大会'
//
//   C. 旧データ互換 (normalizeState)
//     C1. title 欠落 → '沼津支部月例将棋大会' fallback
//     C2. title='特別大会' → '特別大会' 復元
//     C3. title=null → '沼津支部月例将棋大会' fallback
//     C4. title='' → '沼津支部月例将棋大会' fallback
//
//   D. populate / bind / DOM 同期
//     D1. populateReportFields で rep-title に既定値が反映
//     D2. state.report.title='特別大会' なら '特別大会' が反映
//     D3. rep-title change で state.report.title が更新（DOM 同期）
//     D4. 空欄入力 → state.title=既定値 / DOM=既定値 (同期書き戻し)
//     D5. input イベント経路でも更新
//
//   E. downloadReport 連動
//     E1. 既定 title: HTML title / h2 / ファイル名に '沼津支部月例将棋大会報告書' が含まれる
//     E2. カスタム title='特別大会': '特別大会報告書' が含まれる
//     E3. 「報告書」が二重にならない（title に '報告書' を入れても repeat しない方針:
//         今回は title に「報告書」を付けない既定運用としてテストを書く）
//     E4. XSS: title='<script>alert(1)</script>' → escapeHtml されて出る
//     E5. ファイル名: 既定 title + 日付 + '報告書' 構成
//
//   F. 既存機能 非影響
//     F1. state.report.prize / #rep-prize / downloadReport の賞金表示が壊れていない
//     F2. date/time/place/sei/fuku/note の挙動は不変

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_004.js <html>');
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

// A1
assert(/function\s+normalizeReportTitle\s*\(/.test(htmlSrc), 'A1 normalizeReportTitle() 関数定義あり');

// A2
{
  const m = htmlSrc.match(/<input[^>]*id="rep-title"[^>]*>/);
  assert(m !== null, 'A2 #rep-title input が DOM に存在する');
}

// A3
{
  const count = (htmlSrc.match(/title\s*:\s*['"]沼津支部月例将棋大会['"]/g) || []).length;
  assert(count >= 6,
    'A3 schema literal に title:"沼津支部月例将棋大会" が 6 箇所以上ある（実測 '+count+'）');
}

// A4
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportTitle\s*\(\s*s\.report\.title\s*\)/.test(body),
    'A4 normalizeState が normalizeReportTitle(s.report.title) を呼ぶ');
}

// A5
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/getElementById\(['"]rep-title['"]\)/.test(body),
    'A5-1 populateReportFields が rep-title を参照');
  assert(/normalizeReportTitle\s*\(/.test(body),
    'A5-2 populateReportFields が normalizeReportTitle を呼ぶ');
}

// A6
{
  const m = htmlSrc.match(/function bindReportEvents\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/'note'\s*,\s*'prize'\s*,\s*'title'/.test(body),
    "A6 bindReportEvents の field list に 'title' が含まれる");
}

// A7
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]title['"]/.test(body),
    'A7-1 updateReportFieldFromElement で key === "title" 分岐がある');
  assert(/normalizeReportTitle\s*\(\s*el\.value\s*\)/.test(body),
    'A7-2 title 分岐で normalizeReportTitle(el.value) を使う');
  // 003B と同じ DOM 同期パターン（el.value = normalizedTitle）
  assert(/el\.value\s*=\s*normalizedTitle/.test(body),
    'A7-3 title 分岐で DOM 同期書き戻し (el.value = normalizedTitle)');
}

// A8
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportTitle\s*\(/.test(body),
    'A8-1 downloadReport が normalizeReportTitle() を呼ぶ');
  // 旧固定 literal '沼津支部月例将棋大会報告書' が string literal として残っていないこと
  //   （escapeHtml(reportTitleWithSuffix) 経由で動的に生成されるため、quoted literal は不要）
  assert(body.indexOf("'沼津支部月例将棋大会報告書'") === -1,
    'A8-2 旧 \'沼津支部月例将棋大会報告書\' single-quoted literal は撤去されている');
  assert(body.indexOf('"沼津支部月例将棋大会報告書"') === -1,
    'A8-3 旧 "沼津支部月例将棋大会報告書" double-quoted literal は撤去されている');
}

// ============================================================
// SECTION B: normalizeReportTitle 単体
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
       normalizeReportTitle: normalizeReportTitle,
       normalizeReportPrize: normalizeReportPrize,
       normalizeState: normalizeState,
       populateReportFields: populateReportFields,
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

// B1-B8
{
  const env = loadEnv(targetPath);
  assertEq(env.normalizeReportTitle('特別大会'), '特別大会', 'B1 通常文字列 そのまま');
  assertEq(env.normalizeReportTitle('  大会名  '), '大会名', 'B2 trim');
  assertEq(env.normalizeReportTitle(''), '沼津支部月例将棋大会', 'B3 空文字 fallback');
  assertEq(env.normalizeReportTitle('   '), '沼津支部月例将棋大会', 'B4 trim 空 fallback');
  assertEq(env.normalizeReportTitle(null), '沼津支部月例将棋大会', 'B5 null fallback');
  assertEq(env.normalizeReportTitle(undefined), '沼津支部月例将棋大会', 'B6 undefined fallback');
  assertEq(env.normalizeReportTitle(42), '沼津支部月例将棋大会', 'B7 数値 fallback');
  assertEq(env.normalizeReportTitle({}), '沼津支部月例将棋大会', 'B8 オブジェクト fallback');
}

// B9-B14: 末尾「報告書」除去（Codex Must Fix PR #150）
{
  const env = loadEnv(targetPath);
  assertEq(env.normalizeReportTitle('特別大会報告書'), '特別大会',
    'B9 末尾「報告書」を除去 → "特別大会"');
  assertEq(env.normalizeReportTitle(' 特別大会報告書 '), '特別大会',
    'B10 前後 trim + 末尾「報告書」除去');
  assertEq(env.normalizeReportTitle('特別大会  報告書'), '特別大会',
    'B11 中間空白 + 末尾「報告書」も除去後 trim');
  assertEq(env.normalizeReportTitle('報告書'), '沼津支部月例将棋大会',
    'B12 "報告書" 単体 → 除去後空 → 既定値 fallback');
  assertEq(env.normalizeReportTitle('  報告書  '), '沼津支部月例将棋大会',
    'B13 "  報告書  " → trim 後 "報告書" → 除去後空 → 既定値 fallback');
  assertEq(env.normalizeReportTitle('沼津支部月例将棋大会報告書'), '沼津支部月例将棋大会',
    'B14 既定 + 末尾報告書 → 既定大会名のみ（state には大会名のみ保存）');
  // 「報告書」が中間にある場合は除去しない（末尾の 1 回のみ）
  assertEq(env.normalizeReportTitle('報告書大会'), '報告書大会',
    'B15 中間の「報告書」は除去しない（末尾のみ対象）');
  // 既に末尾除去済（'報告書' なし）は変化なし
  assertEq(env.normalizeReportTitle('特別大会'), '特別大会',
    'B16 「報告書」なしはそのまま（二重除去しない）');
}

// ============================================================
// SECTION C: normalizeState 旧データ互換
// ============================================================
{
  const env = loadEnv(targetPath);
  // C1: title 欠落 → 既定値
  const c1 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}});
  assertEq(c1.report.title, '沼津支部月例将棋大会', 'C1 旧 report (title 欠落) → 既定値 fallback');
  // C2: title='特別大会'
  const c2 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',title:'特別大会'}});
  assertEq(c2.report.title, '特別大会', 'C2 title="特別大会" → "特別大会" 復元');
  // C3: null
  const c3 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',title:null}});
  assertEq(c3.report.title, '沼津支部月例将棋大会', 'C3 title=null → 既定値 fallback');
  // C4: empty string
  const c4 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',title:''}});
  assertEq(c4.report.title, '沼津支部月例将棋大会', 'C4 title="" → 既定値 fallback');
  // C5: 「報告書」付きが旧データから来た場合の除去（Codex Must Fix PR #150）
  const c5 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',title:'特別大会報告書'}});
  assertEq(c5.report.title, '特別大会',
    'C5 title="特別大会報告書" → "特別大会" として復元（末尾除去で二重防止）');
  // C6: 「報告書」単体 → 除去後空 → 既定値
  const c6 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',title:'報告書'}});
  assertEq(c6.report.title, '沼津支部月例将棋大会',
    'C6 title="報告書" → 除去後空 → 既定値 fallback');
}

// ============================================================
// SECTION D: populate / bind / DOM 同期
// ============================================================

function seedReportDom(ctx, repValues){
  repValues = repValues || {};
  ['date','place','start','end','sei','fuku','note','prize','title'].forEach(function(k){
    const el = ctx.document.getElementById('rep-'+k);
    if(typeof el === 'object') el.value = (k in repValues) ? String(repValues[k]) : '';
  });
}

// D1: 既定値表示
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会'}
  });
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-title').value, '沼津支部月例将棋大会',
    'D1 既定 title が rep-title に表示');
}

// D2: カスタム値表示
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'特別大会'}
  });
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-title').value, '特別大会',
    'D2 state.report.title="特別大会" → rep-title="特別大会"');
}

// D3: change で state 更新
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会'}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-title');
  el.value = '記念大会';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'D3-pre rep-title change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.title, '記念大会', 'D3-1 change で state.report.title="記念大会"');
  assertEq(el.value, '記念大会', 'D3-2 DOM も "記念大会" のまま');
}

// D4: 空欄入力 → fallback + DOM 同期
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'特別大会'}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-title');
  el.value = '';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.title, '沼津支部月例将棋大会', 'D4-1 空欄 → state title 既定値 fallback');
  assertEq(el.value, '沼津支部月例将棋大会', 'D4-2 空欄 → DOM 同期書き戻し');
}

// D5: input event 経路 (IME-safe: state 更新のみ、DOM 書き戻しなし)
//   Codex Should Fix (PR #150): input イベントは IME 編集中にも発火するため、
//   DOM 書き戻しすると日本語入力のカーソル / composing 状態が壊れる可能性。
//   そのため input イベントでは state 更新のみで、DOM 書き戻しは行わない。
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会'}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-title');
  el.value = '記念大会';
  const fns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.title, '記念大会', 'D5-1 input イベント経路でも state title 更新');
  // input イベントでは DOM 書き戻しなし → el.value は変化なし
  assertEq(el.value, '記念大会', 'D5-2 input イベント時は DOM 書き戻し無し (IME-safe)');
}

// D6: input イベント時、'特別大会報告書' を入力しても DOM は触られない
//   state は正規化された '特別大会' に更新されるが、DOM 上は IME 編集途中扱いで '特別大会報告書' のまま
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会'}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-title');
  el.value = '特別大会報告書';
  const inputFns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<inputFns.length;i++) inputFns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.title, '特別大会',
    'D6-1 input イベント: state は正規化済の "特別大会" (二重防止)');
  assertEq(el.value, '特別大会報告書',
    'D6-2 input イベント: DOM は書き戻しなし (IME-safe、ユーザー編集を妨げない)');
  // 次に change イベントを発火すると DOM も正規化値に書き戻される
  const changeFns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<changeFns.length;i++) changeFns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.title, '特別大会',
    'D6-3 change イベント: state は引き続き "特別大会"');
  assertEq(el.value, '特別大会',
    'D6-4 change イベント: DOM が "特別大会" に同期書き戻し');
}

// D7: change で '特別大会報告書' 入力 → state も DOM も '特別大会' に正規化
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会'}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-title');
  el.value = '特別大会報告書';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.title, '特別大会',
    'D7-1 change: "特別大会報告書" → state.report.title="特別大会"');
  assertEq(el.value, '特別大会',
    'D7-2 change: DOM も "特別大会" に同期書き戻し');
}

// ============================================================
// SECTION E: downloadReport 連動
// ============================================================

function makeStateForDownload(title){
  return {
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',prize:7000,title:title}
  };
}

// E1: 既定 title
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload('沼津支部月例将棋大会'));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<h2 style="text-align:center;font-size:16px;margin-bottom:6px">沼津支部月例将棋大会報告書</h2>') >= 0,
    'E1-1 既定 title: h2 に "沼津支部月例将棋大会報告書"（§4 doc-header 併記のため margin-bottom:16px→6px）');
}

// E2: カスタム title
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload('特別大会'));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:7000,title:'特別大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特別大会報告書') >= 0,
    'E2-1 カスタム title: HTML 内に "特別大会報告書" が出る');
  assert(html.indexOf('沼津支部月例将棋大会報告書') < 0,
    'E2-2 既定値 "沼津支部月例将棋大会報告書" は出ない（カスタムで置換）');
}

// E3: 「報告書」二重防止 — title 既定運用では '報告書' を含めない
// 既定値が '沼津支部月例将棋大会'（末尾に '報告書' なし）であることを確認し、
// downloadReport で末尾に '報告書' が一回だけ付与されていることを assert。
{
  const env = loadEnv(targetPath);
  assertEq(env.normalizeReportTitle(undefined), '沼津支部月例将棋大会',
    'E3-1 既定 title に "報告書" は含まれない');
  // h2 出力では '報告書' が末尾に 1 回だけ出る
  env._setState(makeStateForDownload('沼津支部月例将棋大会'));
  seedReportDom(env._ctx, {title:'沼津支部月例将棋大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // '報告書' 連続 (報告書報告書) が出ない
  assert(html.indexOf('報告書報告書') < 0, 'E3-2 "報告書報告書" のような二重表記が出ない');
}

// E4: XSS - title に <script> を入れても escapeHtml される
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload('<script>alert(1)</script>'));
  seedReportDom(env._ctx, {title:'<script>alert(1)</script>'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<script>alert(1)</script>報告書') < 0,
    'E4-1 危険な title の <script> が raw として出ない');
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;報告書/.test(html),
    'E4-2 危険な title が escapeHtml されて出力される');
}

// E5: ファイル名 — <title> タグに reportTitle + dateNum + 報告書 が含まれる
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload('沼津支部月例将棋大会'));
  seedReportDom(env._ctx, {date:'2026-05-18',title:'沼津支部月例将棋大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // 最終 html の <title> は filename タイトル（fileTitleName）で上書きされる
  assert(/<title>2026年5月度沼津支部月例将棋大会報告書<\/title>/.test(html),
    'E5-1 ファイル名 <title> = "2026年5月度沼津支部月例将棋大会報告書"（新仕様 YYYY年M月度{大会名}{種別}）');
}

// E5b: カスタム title でファイル名
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload('特別大会'));
  seedReportDom(env._ctx, {date:'2026-05-18',title:'特別大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(/<title>2026年5月度特別大会報告書<\/title>/.test(html),
    'E5-2 カスタム title "特別大会" でファイル名 "2026年5月度特別大会報告書"（新仕様 YYYY年M月度）');
}

// ===== E6: Codex Must Fix PR #150 — 「報告書報告書」二重防止 =====

// E6-A: state.report.title='特別大会報告書' で downloadReport
//   normalizeReportTitle で '特別大会' に正規化 → downloadReport で「特別大会報告書」になる（二重にならない）
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload('特別大会報告書'));
  seedReportDom(env._ctx, {date:'2026-05-18',title:'特別大会報告書'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('報告書報告書') < 0,
    'E6-A1 state.title="特別大会報告書" で「報告書報告書」が HTML に出ない');
  assert(html.indexOf('特別大会報告書') >= 0,
    'E6-A2 h2 等に「特別大会報告書」が 1 回だけ表示される');
  assert(html.indexOf('特別大会報告書報告書') < 0,
    'E6-A3 「特別大会報告書報告書」のような二重表記は出ない');
  // ファイル名にも報告書報告書が出ない
  assert(/<title>2026年5月度特別大会報告書<\/title>/.test(html),
    'E6-A4 ファイル名は "2026年5月度特別大会報告書"（「特別大会報告書…報告書」のような二重構造でない・新仕様 YYYY年M月度）');
  assert(html.indexOf('特別大会報告書_') < 0,
    'E6-A5 ファイル名側にも 特別大会報告書_ プレフィックスが出ない');
}

// E6-B: 旧保存データ由来で state.report.title='沼津支部月例将棋大会報告書' のケース
//   既定 title の末尾「報告書」も同じく除去される
{
  const env = loadEnv(targetPath);
  // normalizeState 経由でセット
  const normalized = env.normalizeState({
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会報告書'}
  });
  // 復元結果は title='沼津支部月例将棋大会'（末尾除去）
  assertEq(normalized.report.title, '沼津支部月例将棋大会',
    'E6-B0 normalizeState で title="沼津支部月例将棋大会報告書" → "沼津支部月例将棋大会"');
  env._setState(normalized);
  seedReportDom(env._ctx, {date:'2026-05-18',title:'沼津支部月例将棋大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('報告書報告書') < 0,
    'E6-B1 旧データ "沼津支部月例将棋大会報告書" 由来でも「報告書報告書」が出ない');
  // 表示は「沼津支部月例将棋大会報告書」が 1 回だけ出る
  const count = (html.match(/沼津支部月例将棋大会報告書/g) || []).length;
  assert(count >= 1, 'E6-B2 「沼津支部月例将棋大会報告書」表記が HTML に存在');
  assert(html.indexOf('沼津支部月例将棋大会報告書報告書') < 0,
    'E6-B3 「沼津支部月例将棋大会報告書報告書」のような二重表記は出ない');
}

// E6-C: '報告書' 単体入力 → state は既定値にフォールバック → 帳票も既定 title 1 回
{
  const env = loadEnv(targetPath);
  // populateReportFields 経由で正規化（normalizeState 等価）
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',prize:7000,title:'報告書'}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',title:'報告書'});
  // populateReportFields を呼んで state.title を正規化 fallback で上書きしてから downloadReport
  env.populateReportFields();
  assertEq(env._getState().report.title, '沼津支部月例将棋大会',
    'E6-C0 populateReportFields で title="報告書" → 既定値 fallback');
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('報告書報告書') < 0, 'E6-C1 "報告書" 単体入力でも「報告書報告書」が出ない');
}

// ============================================================
// SECTION F: 既存機能 非影響
// ============================================================

// F1: prize 機能不変
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',prize:5000,title:'沼津支部月例将棋大会'}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:5000,title:'沼津支部月例将棋大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('賞金：▲5,000円') >= 0,
    'F1 prize=5000 → 賞金：▲5,000円（REPORT-UX-003A 機能不変）');
}

// F2: 他フィールド (date/time) 不変
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'09:05',end:'17:30',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会'}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'09:05',end:'17:30',prize:7000,title:'沼津支部月例将棋大会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0, 'F2-1 date 和暦変換が壊れない');
  assert(html.indexOf('9時05分') >= 0, 'F2-2 start 和暦変換が壊れない');
  assert(html.indexOf('17時30分') >= 0, 'F2-3 end 和暦変換が壊れない');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-004 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
