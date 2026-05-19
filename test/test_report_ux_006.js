#!/usr/bin/env node
// REPORT-UX-006A: place (会場) state-as-SoT / normalize / IME-safe sync
//
// 観点:
//   A. 構造検査
//     A1. normalizeReportPlace() 関数定義あり
//     A2. #rep-place input が DOM に存在
//     A3. schema literal 6 箇所すべてに place:'労政会館' 既定値
//     A4. normalizeState が place 復元を normalizeReportPlace 経由で行う
//     A5. populateReportFields が rep-place を normalizeReportPlace 経由で扱う
//     A6. bindReportEvents の field list に 'place' が含まれる
//     A7. updateReportFieldFromElement で key==='place' 分岐があり normalizeReportPlace 経由 + change 時 DOM 同期
//     A8. downloadReport が normalizeReportPlace(state.report.place) 経由で place を取得し
//         「会場」行を維持・escapeHtml(place) を維持 (REPORT-UX-008-1 で「場所」→「会場」改名)
//
//   B. normalizeReportPlace helper 単体
//     B1. 通常文字列: '公民館' → '公民館'
//     B2. trim: ' 公民館 ' → '公民館'
//     B3. 空文字: '' → '労政会館' fallback
//     B4. trim 空: '   ' → '労政会館' fallback
//     B5. null → '労政会館'
//     B6. undefined → '労政会館'
//     B7. 数値 → '労政会館'
//     B8. オブジェクト → '労政会館'
//
//   C. 旧データ互換 (normalizeState)
//     C1. place 欠落 → '労政会館' fallback
//     C2. place='公民館' → '公民館' 復元
//     C3. place=null → '労政会館' fallback
//     C4. place='' → '労政会館' fallback
//     C5. place='   ' → '労政会館' fallback
//
//   D. populate / bind / DOM 同期
//     D1. populateReportFields で rep-place に既定値が反映
//     D2. state.report.place がカスタム値なら反映
//     D3. rep-place change で state.report.place が更新 (DOM 同期)
//     D4. 空欄 change → state.place=既定値 / DOM=既定値 (同期書き戻し)
//     D5. input イベント時は state 更新のみ、DOM 書き戻しなし (IME-safe)
//     D5b. ' 公民館 ' change → trim 後の '公民館' が state / DOM 両方
//
//   E. downloadReport 連動
//     E1. state.report.place='公民館' → HTML 内に '公民館' が出る (会場行)
//     E2. DOM #rep-place.value と state.report.place が違う場合、state が優先
//     E3. state.place='' / null / '  ' → '労政会館' fallback
//     E4. escapeHtml(place) が維持される (XSS)
//
//   F. 既存機能 非影響
//     F1. state.report.title / downloadReport の大会名連動が壊れていない
//     F2. state.report.prize の賞金表示が壊れていない
//     F3. state.report.organizer の主催連動が壊れていない
//     F4. date / start / end / sei / fuku / note の挙動は不変

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_006.js <html>');
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
assert(/function\s+normalizeReportPlace\s*\(/.test(htmlSrc),
  'A1 normalizeReportPlace() 関数定義あり');

// A2
{
  const m = htmlSrc.match(/<input[^>]*id="rep-place"[^>]*>/);
  assert(m !== null, 'A2 #rep-place input が DOM に存在する');
}

// A3
{
  const count = (htmlSrc.match(/place\s*:\s*['"]労政会館['"]/g) || []).length;
  assert(count >= 6,
    'A3 schema literal に place:"労政会館" が 6 箇所以上ある（実測 '+count+'）');
}

// A4
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportPlace\s*\(\s*s\.report\.place\s*\)/.test(body),
    'A4 normalizeState が normalizeReportPlace(s.report.place) を呼ぶ');
}

// A5
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/getElementById\(['"]rep-place['"]\)/.test(body),
    'A5-1 populateReportFields が rep-place を参照');
  assert(/normalizeReportPlace\s*\(/.test(body),
    'A5-2 populateReportFields が normalizeReportPlace を呼ぶ');
}

// A6
{
  const m = htmlSrc.match(/function bindReportEvents\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/['"]place['"]/.test(body),
    "A6 bindReportEvents の field list に 'place' が含まれる");
}

// A7
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]place['"]/.test(body),
    'A7-1 updateReportFieldFromElement で key === "place" 分岐がある');
  assert(/normalizeReportPlace\s*\(\s*el\.value\s*\)/.test(body),
    'A7-2 place 分岐で normalizeReportPlace(el.value) を使う');
  assert(/el\.value\s*=\s*normalizedPlace/.test(body),
    'A7-3 place 分岐で DOM 同期書き戻し (el.value = normalizedPlace)');
  // IME-safe: DOM 書き戻しは change のみ
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedPlace/.test(body),
    'A7-4 place 分岐で change イベント時のみ DOM 書き戻し (IME-safe)');
}

// A8
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportPlace\s*\(/.test(body),
    'A8-1 downloadReport が normalizeReportPlace() を呼ぶ');
  // 「会場」行が HTML 組立内に含まれる (REPORT-UX-008-1)
  assert(/>会場</.test(body),
    'A8-2 downloadReport の HTML 組立内に「会場」ラベルセルがある');
  // place 由来の値が escapeHtml 経由で組み立てに使われる
  assert(/escapeHtml\s*\(\s*place\s*\)/.test(body),
    'A8-3 downloadReport が escapeHtml(place) で出力する');
  // state-as-SoT: document.getElementById('rep-place').value 直読みをやめている
  assert(!/getElementById\(['"]rep-place['"]\)\.value/.test(body),
    'A8-4 downloadReport が #rep-place.value を直読みしていない (state 経由)');
}

// ============================================================
// loadEnv helper (test_report_ux_005.js 由来、place も export)
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
       normalizeReportPlace: normalizeReportPlace,
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
// SECTION B: normalizeReportPlace 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  assertEq(env.normalizeReportPlace('公民館'), '公民館', 'B1 通常文字列 そのまま');
  assertEq(env.normalizeReportPlace(' 公民館 '), '公民館', 'B2 trim');
  assertEq(env.normalizeReportPlace(''), '労政会館', 'B3 空文字 fallback');
  assertEq(env.normalizeReportPlace('   '), '労政会館', 'B4 trim 空 fallback');
  assertEq(env.normalizeReportPlace(null), '労政会館', 'B5 null fallback');
  assertEq(env.normalizeReportPlace(undefined), '労政会館', 'B6 undefined fallback');
  assertEq(env.normalizeReportPlace(42), '労政会館', 'B7 数値 fallback');
  assertEq(env.normalizeReportPlace({}), '労政会館', 'B8 オブジェクト fallback');
}

// ============================================================
// SECTION C: normalizeState 旧データ互換
// ============================================================
{
  const env = loadEnv(targetPath);
  // C1: place 欠落 → 既定値
  const c1 = env.normalizeState({report:{date:'',start:'',end:'',sei:'',fuku:'',note:''}});
  assertEq(c1.report.place, '労政会館', 'C1 旧 report (place 欠落) → 既定値 fallback');
  // C2: place='公民館'
  const c2 = env.normalizeState({report:{date:'',start:'',end:'',sei:'',fuku:'',note:'',place:'公民館'}});
  assertEq(c2.report.place, '公民館', 'C2 place="公民館" → "公民館" 復元');
  // C3: null
  const c3 = env.normalizeState({report:{date:'',start:'',end:'',sei:'',fuku:'',note:'',place:null}});
  assertEq(c3.report.place, '労政会館', 'C3 place=null → 既定値 fallback');
  // C4: empty string
  const c4 = env.normalizeState({report:{date:'',start:'',end:'',sei:'',fuku:'',note:'',place:''}});
  assertEq(c4.report.place, '労政会館', 'C4 place="" → 既定値 fallback');
  // C5: whitespace
  const c5 = env.normalizeState({report:{date:'',start:'',end:'',sei:'',fuku:'',note:'',place:'   '}});
  assertEq(c5.report.place, '労政会館', 'C5 place="   " → 既定値 fallback');
  // C6: place / title / organizer 併存 (既存機能干渉なし)
  const c6 = env.normalizeState({report:{date:'',start:'',end:'',sei:'',fuku:'',note:'',place:'公民館',title:'特別大会',organizer:'記念大会連盟'}});
  assertEq(c6.report.place, '公民館', 'C6-1 place="公民館" は維持');
  assertEq(c6.report.title, '特別大会', 'C6-2 title="特別大会" は維持');
  assertEq(c6.report.organizer, '記念大会連盟', 'C6-3 organizer="記念大会連盟" は維持');
  // C7: date / start / end / sei / fuku / note は raw string コピー維持 (本タスクでは触らない)
  const c7 = env.normalizeState({report:{date:'2026-05-19',start:'13:00',end:'17:00',sei:'山田',fuku:'佐藤',note:'メモ',place:'公民館'}});
  assertEq(c7.report.date, '2026-05-19', 'C7-1 date は raw コピーされる');
  assertEq(c7.report.start, '13:00', 'C7-2 start は raw コピーされる');
  assertEq(c7.report.end, '17:00', 'C7-3 end は raw コピーされる');
  assertEq(c7.report.sei, '山田', 'C7-4 sei は raw コピーされる');
  assertEq(c7.report.fuku, '佐藤', 'C7-5 fuku は raw コピーされる');
  assertEq(c7.report.note, 'メモ', 'C7-6 note は raw コピーされる');
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
  assertEq(env._ctx.document.getElementById('rep-place').value, '労政会館',
    'D1 既定 place が rep-place に表示');
}

// D2: カスタム値表示
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({place:'公民館'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-place').value, '公民館',
    'D2 state.report.place="公民館" → rep-place="公民館"');
}

// D2b: 空白 state の populate fallback
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({place:'   '}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-place').value, '労政会館',
    'D2b state.report.place="   " (空白) → rep-place が既定値に fallback');
  assertEq(env._getState().report.place, '労政会館',
    'D2b-2 populateReportFields が state も既定値に同期');
}

// D3: change で state 更新 + DOM 同期
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-place');
  el.value = '記念ホール';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'D3-pre rep-place change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.place, '記念ホール',
    'D3-1 change で state.report.place="記念ホール"');
  assertEq(el.value, '記念ホール', 'D3-2 DOM も "記念ホール" のまま');
}

// D4: 空欄入力 → fallback + DOM 同期書き戻し
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({place:'公民館'}));
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-place');
  el.value = '';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.place, '労政会館',
    'D4-1 空欄 → state place 既定値 fallback');
  assertEq(el.value, '労政会館', 'D4-2 空欄 → DOM 同期書き戻し');
}

// D5: input event 経路 (IME-safe: state 更新のみ、DOM 書き戻しなし)
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-place');
  el.value = '公民館';
  const fns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.place, '公民館',
    'D5-1 input イベント経路でも state place 更新');
  assertEq(el.value, '公民館',
    'D5-2 input イベント時は DOM 書き戻し無し (IME-safe; ユーザー入力そのまま)');
}

// D5b: input 時、空欄を入れても DOM は触られない (IME-safe)
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({place:'公民館'}));
  seedReportDom(env._ctx, {place:'公民館'});
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-place');
  el.value = '';
  const inputFns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<inputFns.length;i++) inputFns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.place, '労政会館',
    'D5b-1 input イベント: state は正規化済の既定値 fallback');
  assertEq(el.value, '',
    'D5b-2 input イベント: DOM は書き戻しなし (IME-safe、ユーザー編集を妨げない)');
  // 続けて change を発火すると DOM も既定値に同期書き戻し
  const changeFns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<changeFns.length;i++) changeFns[i].call(el, {type:'change', target:el});
  assertEq(el.value, '労政会館',
    'D5b-3 change イベント: DOM が既定値に同期書き戻し');
}

// D6: ' 公民館 ' change → trim 同期
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-place');
  el.value = ' 公民館 ';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.place, '公民館',
    'D6-1 " 公民館 " change → state は trim 後 "公民館"');
  assertEq(el.value, '公民館',
    'D6-2 " 公民館 " change → DOM も trim 後 "公民館"');
}

// ============================================================
// SECTION E: downloadReport 連動
// ============================================================

// E1: state.report.place='公民館' → HTML 内に '公民館' (会場行)
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',place:'公民館'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'公民館',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('>会場<') >= 0,
    'E1-1 HTML に「会場」ラベル td がある');
  assert(html.indexOf('公民館') >= 0,
    'E1-2 HTML 内に "公民館" が出る');
  // 会場ラベルセルと組合せ
  assert(/>会場<[^]*?公民館/.test(html),
    'E1-3 「会場」ラベルセルの後に "公民館" が出る');
}

// E2: state-as-SoT - DOM と state が異なる場合、state が優先
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',place:'公民館'}));
  // DOM 側は別の値（'記念ホール'）に書き換える
  seedReportDom(env._ctx, {date:'2026-05-18',place:'記念ホール',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('公民館') >= 0,
    'E2-1 state.report.place="公民館" が帳票に出る (state-as-SoT)');
  assert(html.indexOf('記念ホール') < 0,
    'E2-2 DOM の "記念ホール" は帳票に出ない (state 優先)');
}

// E3a: state.place='' → '労政会館' fallback
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',place:''}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('労政会館') >= 0,
    'E3a state.place="" → 帳票に既定値 "労政会館" が出る');
}

// E3b: state.place=null → '労政会館' fallback
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',place:null}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('労政会館') >= 0,
    'E3b state.place=null → 帳票に既定値 "労政会館" が出る');
}

// E3c: state.place='   ' → '労政会館' fallback
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',place:'   '}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'   ',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('労政会館') >= 0,
    'E3c state.place="   " (空白) → 帳票に既定値 "労政会館" が出る');
}

// E4: XSS - place に <script> を入れても escapeHtml される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',place:'<script>alert(1)</script>'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'<script>alert(1)</script>'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<script>alert(1)</script>') < 0
      || html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') >= 0
      || /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(html),
    'E4-1 危険な place の <script> が raw として出ない（escapeHtml される）');
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(html),
    'E4-2 危険な place が escapeHtml されて出力される');
}

// ============================================================
// SECTION F: 既存機能 非影響
// ============================================================

// F1: title 機能不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',place:'公民館'}));
  seedReportDom(env._ctx, {date:'2026-05-18',title:'特別大会',place:'公民館'});
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
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',prize:5000,place:'公民館'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'公民館',start:'13:00',end:'17:00',prize:5000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('賞金：▲5,000円') >= 0,
    'F2 prize=5000 → 賞金：▲5,000円（REPORT-UX-003A 機能不変）');
}

// F3: organizer 機能不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',organizer:'○○大会実行委員会',place:'公民館'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'公民館',start:'13:00',end:'17:00',prize:7000,title:'沼津支部月例将棋大会',organizer:'○○大会実行委員会'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('○○大会実行委員会') >= 0,
    'F3-1 organizer="○○大会実行委員会" が HTML に出る (REPORT-UX-005 機能不変)');
  assert(/>主催<[^]*?○○大会実行委員会/.test(html),
    'F3-2 「主催」ラベルセルの後に "○○大会実行委員会" が出る');
}

// F4: date/time/sei/fuku/note 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'09:05',end:'17:30',sei:'山田',fuku:'佐藤',note:'特記事項あり'}));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'09:05',end:'17:30',sei:'山田',fuku:'佐藤',note:'特記事項あり',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0, 'F4-1 date 和暦変換が壊れない');
  assert(html.indexOf('9時05分') >= 0, 'F4-2 start 和暦変換が壊れない');
  assert(html.indexOf('17時30分') >= 0, 'F4-3 end 和暦変換が壊れない');
  assert(html.indexOf('山田') >= 0, 'F4-4 sei が出る');
  assert(html.indexOf('佐藤') >= 0, 'F4-5 fuku が出る');
  assert(html.indexOf('特記事項あり') >= 0, 'F4-6 note が出る');
}

// F5: normalizeState が title / organizer / prize / date / start / end / sei / fuku / note を壊さない
{
  const env = loadEnv(targetPath);
  const raw = {report:{date:'2026-05-19',start:'13:00',end:'17:00',sei:'山田',fuku:'佐藤',note:'メモ',place:'公民館',title:'特別大会',organizer:'記念連盟',prize:3000}};
  const n = env.normalizeState(raw);
  assertEq(n.report.title, '特別大会', 'F5-1 title 復元');
  assertEq(n.report.organizer, '記念連盟', 'F5-2 organizer 復元');
  assertEq(n.report.prize, 3000, 'F5-3 prize 復元');
  assertEq(n.report.date, '2026-05-19', 'F5-4 date 復元');
  assertEq(n.report.start, '13:00', 'F5-5 start 復元');
  assertEq(n.report.end, '17:00', 'F5-6 end 復元');
  assertEq(n.report.sei, '山田', 'F5-7 sei 復元');
  assertEq(n.report.fuku, '佐藤', 'F5-8 fuku 復元');
  assertEq(n.report.note, 'メモ', 'F5-9 note 復元');
  assertEq(n.report.place, '公民館', 'F5-10 place 復元');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-006 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
