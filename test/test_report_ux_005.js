#!/usr/bin/env node
// REPORT-UX-005: configurable organizer field
//
// 観点:
//   A. 構造検査
//     A1. normalizeReportOrganizer() 関数定義あり
//     A2. #rep-organizer input が DOM に存在
//     A3. schema literal 6 箇所すべてに organizer:'日本将棋連盟沼津支部' 既定値
//     A4. normalizeState が organizer 復元を行う
//     A5. populateReportFields が rep-organizer を扱う
//     A6. bindReportEvents の field list に 'organizer' が含まれる
//     A7. updateReportFieldFromElement で key==='organizer' 分岐があり normalizeReportOrganizer 経由 + DOM 同期
//     A8. downloadReport が normalizeReportOrganizer 経由で organizer を取得し HTML に「主催」行を含む
//
//   B. normalizeReportOrganizer helper 単体
//     B1. 通常文字列: '愛知県連盟' → '愛知県連盟'
//     B2. trim: '  ○○連盟  ' → '○○連盟'
//     B3. 空文字: '' → '日本将棋連盟沼津支部' fallback
//     B4. trim 空: '   ' → '日本将棋連盟沼津支部' fallback
//     B5. null → '日本将棋連盟沼津支部'
//     B6. undefined → '日本将棋連盟沼津支部'
//     B7. 数値 → '日本将棋連盟沼津支部'
//     B8. オブジェクト → '日本将棋連盟沼津支部'
//
//   C. 旧データ互換 (normalizeState)
//     C1. organizer 欠落 → '日本将棋連盟沼津支部' fallback
//     C2. organizer='○○連盟' → '○○連盟' 復元
//     C3. organizer=null → '日本将棋連盟沼津支部' fallback
//     C4. organizer='' → '日本将棋連盟沼津支部' fallback
//
//   D. populate / bind / DOM 同期
//     D1. populateReportFields で rep-organizer に既定値が反映
//     D2. state.report.organizer がカスタム値なら反映
//     D3. rep-organizer change で state.report.organizer が更新（DOM 同期）
//     D4. 空欄入力 → state.organizer=既定値 / DOM=既定値 (同期書き戻し)
//     D5. input イベント時は state 更新のみ、DOM 書き戻しなし (IME-safe)
//
//   E. downloadReport 連動
//     E1. 既定 organizer: HTML 内に「主催」行 + '日本将棋連盟沼津支部'
//     E2. カスタム organizer: HTML 内にカスタム値が出る
//     E3. XSS: organizer='<script>alert(1)</script>' → escapeHtml される
//
//   F. 既存機能 非影響
//     F1. state.report.title / #rep-title / downloadReport の大会名連動が壊れていない
//     F2. state.report.prize の賞金表示が壊れていない
//     F3. date/start/end の挙動は不変

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_005.js <html>');
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
assert(/function\s+normalizeReportOrganizer\s*\(/.test(htmlSrc),
  'A1 normalizeReportOrganizer() 関数定義あり');

// A2
{
  const m = htmlSrc.match(/<input[^>]*id="rep-organizer"[^>]*>/);
  assert(m !== null, 'A2 #rep-organizer input が DOM に存在する');
}

// A3
{
  const count = (htmlSrc.match(/organizer\s*:\s*['"]日本将棋連盟沼津支部['"]/g) || []).length;
  assert(count >= 6,
    'A3 schema literal に organizer:"日本将棋連盟沼津支部" が 6 箇所以上ある（実測 '+count+'）');
}

// A4
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportOrganizer\s*\(\s*s\.report\.organizer\s*\)/.test(body),
    'A4 normalizeState が normalizeReportOrganizer(s.report.organizer) を呼ぶ');
}

// A5
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/getElementById\(['"]rep-organizer['"]\)/.test(body),
    'A5-1 populateReportFields が rep-organizer を参照');
  assert(/normalizeReportOrganizer\s*\(/.test(body),
    'A5-2 populateReportFields が normalizeReportOrganizer を呼ぶ');
}

// A6
{
  const m = htmlSrc.match(/function bindReportEvents\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/'title'\s*,\s*'organizer'/.test(body),
    "A6 bindReportEvents の field list に 'organizer' が含まれる");
}

// A7
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]organizer['"]/.test(body),
    'A7-1 updateReportFieldFromElement で key === "organizer" 分岐がある');
  assert(/normalizeReportOrganizer\s*\(\s*el\.value\s*\)/.test(body),
    'A7-2 organizer 分岐で normalizeReportOrganizer(el.value) を使う');
  assert(/el\.value\s*=\s*normalizedOrganizer/.test(body),
    'A7-3 organizer 分岐で DOM 同期書き戻し (el.value = normalizedOrganizer)');
  // IME-safe: DOM 書き戻しは change のみ
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedOrganizer/.test(body),
    'A7-4 organizer 分岐で change イベント時のみ DOM 書き戻し (IME-safe)');
}

// A8
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportOrganizer\s*\(/.test(body),
    'A8-1 downloadReport が normalizeReportOrganizer() を呼ぶ');
  // 「主催」行が HTML 組立内に含まれる
  assert(/>主催</.test(body),
    'A8-2 downloadReport の HTML 組立内に「主催」ラベルセルがある');
  // organizer 由来の値が escapeHtml 経由で組み立てに使われる
  assert(/escapeHtml\s*\(\s*reportOrganizer\s*\)/.test(body),
    'A8-3 downloadReport が escapeHtml(reportOrganizer) で出力する');
}

// ============================================================
// loadEnv helper (test_report_ux_004.js 由来、organizer も export)
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
       normalizeReportOrganizer: normalizeReportOrganizer,
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

// ============================================================
// SECTION B: normalizeReportOrganizer 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  assertEq(env.normalizeReportOrganizer('愛知県連盟'), '愛知県連盟', 'B1 通常文字列 そのまま');
  assertEq(env.normalizeReportOrganizer('  ○○連盟  '), '○○連盟', 'B2 trim');
  assertEq(env.normalizeReportOrganizer(''), '日本将棋連盟沼津支部', 'B3 空文字 fallback');
  assertEq(env.normalizeReportOrganizer('   '), '日本将棋連盟沼津支部', 'B4 trim 空 fallback');
  assertEq(env.normalizeReportOrganizer(null), '日本将棋連盟沼津支部', 'B5 null fallback');
  assertEq(env.normalizeReportOrganizer(undefined), '日本将棋連盟沼津支部', 'B6 undefined fallback');
  assertEq(env.normalizeReportOrganizer(42), '日本将棋連盟沼津支部', 'B7 数値 fallback');
  assertEq(env.normalizeReportOrganizer({}), '日本将棋連盟沼津支部', 'B8 オブジェクト fallback');
}

// ============================================================
// SECTION C: normalizeState 旧データ互換
// ============================================================
{
  const env = loadEnv(targetPath);
  // C1: organizer 欠落 → 既定値
  const c1 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}});
  assertEq(c1.report.organizer, '日本将棋連盟沼津支部', 'C1 旧 report (organizer 欠落) → 既定値 fallback');
  // C2: organizer='○○連盟'
  const c2 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',organizer:'○○連盟'}});
  assertEq(c2.report.organizer, '○○連盟', 'C2 organizer="○○連盟" → "○○連盟" 復元');
  // C3: null
  const c3 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',organizer:null}});
  assertEq(c3.report.organizer, '日本将棋連盟沼津支部', 'C3 organizer=null → 既定値 fallback');
  // C4: empty string
  const c4 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',organizer:''}});
  assertEq(c4.report.organizer, '日本将棋連盟沼津支部', 'C4 organizer="" → 既定値 fallback');
  // C5: title と organizer の併存（既存機能干渉なし）
  const c5 = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',title:'特別大会',organizer:'記念大会連盟'}});
  assertEq(c5.report.title, '特別大会', 'C5-1 title="特別大会" は維持');
  assertEq(c5.report.organizer, '記念大会連盟', 'C5-2 organizer="記念大会連盟" は維持');
}

// ============================================================
// SECTION D: populate / bind / DOM 同期
// ============================================================

function seedReportDom(ctx, repValues){
  repValues = repValues || {};
  ['date','place','start','end','sei','fuku','note','prize','title','organizer'].forEach(function(k){
    const el = ctx.document.getElementById('rep-'+k);
    if(typeof el === 'object') el.value = (k in repValues) ? String(repValues[k]) : '';
  });
}

function makeBaseState(reportOverrides){
  const report = Object.assign(
    {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'},
    reportOverrides || {}
  );
  return {
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:report
  };
}

// D1: 既定値表示
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-organizer').value, '日本将棋連盟沼津支部',
    'D1 既定 organizer が rep-organizer に表示');
}

// D2: カスタム値表示
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({organizer:'○○大会実行委員会'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-organizer').value, '○○大会実行委員会',
    'D2 state.report.organizer="○○大会実行委員会" → rep-organizer="○○大会実行委員会"');
}

// D3: change で state 更新 + DOM 同期
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-organizer');
  el.value = '記念大会連盟';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'D3-pre rep-organizer change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.organizer, '記念大会連盟',
    'D3-1 change で state.report.organizer="記念大会連盟"');
  assertEq(el.value, '記念大会連盟', 'D3-2 DOM も "記念大会連盟" のまま');
}

// D4: 空欄入力 → fallback + DOM 同期書き戻し
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({organizer:'○○連盟'}));
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-organizer');
  el.value = '';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.organizer, '日本将棋連盟沼津支部',
    'D4-1 空欄 → state organizer 既定値 fallback');
  assertEq(el.value, '日本将棋連盟沼津支部', 'D4-2 空欄 → DOM 同期書き戻し');
}

// D5: input event 経路 (IME-safe: state 更新のみ、DOM 書き戻しなし)
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-organizer');
  el.value = '愛知県連盟';
  const fns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.organizer, '愛知県連盟',
    'D5-1 input イベント経路でも state organizer 更新');
  assertEq(el.value, '愛知県連盟',
    'D5-2 input イベント時は DOM 書き戻し無し (IME-safe; ユーザー入力そのまま)');
}

// D5b: input イベント時、空欄を入れても DOM は触られない（IME-safe）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({organizer:'○○連盟'}));
  seedReportDom(env._ctx, {organizer:'○○連盟'});
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-organizer');
  el.value = '';
  const inputFns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<inputFns.length;i++) inputFns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.organizer, '日本将棋連盟沼津支部',
    'D5b-1 input イベント: state は正規化済の既定値 fallback');
  assertEq(el.value, '',
    'D5b-2 input イベント: DOM は書き戻しなし (IME-safe、ユーザー編集を妨げない)');
  // 続けて change を発火すると DOM も既定値に同期書き戻し
  const changeFns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<changeFns.length;i++) changeFns[i].call(el, {type:'change', target:el});
  assertEq(el.value, '日本将棋連盟沼津支部',
    'D5b-3 change イベント: DOM が既定値に同期書き戻し');
}

// ============================================================
// SECTION E: downloadReport 連動
// ============================================================

// E1: 既定 organizer
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('>主催<') >= 0,
    'E1-1 既定 organizer: HTML に「主催」ラベル td がある');
  assert(html.indexOf('日本将棋連盟沼津支部') >= 0,
    'E1-2 既定 organizer: HTML 内に "日本将棋連盟沼津支部" が出る');
}

// E2: カスタム organizer
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',organizer:'○○大会実行委員会'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'○○大会実行委員会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('○○大会実行委員会') >= 0,
    'E2-1 カスタム organizer: HTML 内に "○○大会実行委員会" が出る');
  // 主催ラベルセルと組合せ
  assert(/>主催<[^]*?○○大会実行委員会/.test(html),
    'E2-2 「主催」ラベルセルの後に "○○大会実行委員会" が出る');
}

// E3: XSS - organizer に <script> を入れても escapeHtml される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',organizer:'<script>alert(1)</script>'}));
  seedReportDom(env._ctx, {date:'2026-05-18',organizer:'<script>alert(1)</script>'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<script>alert(1)</script>') < 0
      || html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') >= 0
      || /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(html),
    'E3-1 危険な organizer の <script> が raw として出ない（escapeHtml される）');
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(html),
    'E3-2 危険な organizer が escapeHtml されて出力される');
}

// ============================================================
// SECTION F: 既存機能 非影響
// ============================================================

// F1: title 機能不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',organizer:'○○連盟'}));
  seedReportDom(env._ctx, {date:'2026-05-18',title:'特別大会',organizer:'○○連盟'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特別大会報告書') >= 0,
    'F1-1 title="特別大会" の h2 / <title> / ファイル名に「特別大会報告書」が出る');
  assert(/<title>特別大会_20260518_報告書<\/title>/.test(html),
    'F1-2 title="特別大会" のファイル名は "特別大会_20260518_報告書"（REPORT-UX-004 機能不変）');
}

// F2: prize 機能不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',prize:5000}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:5000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('賞金：▲5,000円') >= 0,
    'F2 prize=5000 → 賞金：▲5,000円（REPORT-UX-003A 機能不変）');
}

// F3: date/time 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'09:05',end:'17:30'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'09:05',end:'17:30',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0, 'F3-1 date 和暦変換が壊れない');
  assert(html.indexOf('9時05分') >= 0, 'F3-2 start 和暦変換が壊れない');
  assert(html.indexOf('17時30分') >= 0, 'F3-3 end 和暦変換が壊れない');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-005 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
