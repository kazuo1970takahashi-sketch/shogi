#!/usr/bin/env node
// REPORT-UX-006B: date / start / end state-as-SoT / 旧形式互換
//
// 観点:
//   A. 構造検査
//     A1. normalizeState が date / start / end を専用 helper 経由で復元する
//     A2. populateReportFields が date / start / end を state へ同期書き戻しする
//     A3. updateReportFieldFromElement で key==='date' 分岐があり normalizeReportDateForInput
//         経由 + change 時 DOM 同期
//     A4. updateReportFieldFromElement で key==='start'/'end' 分岐があり normalizeReportTimeForInput
//         経由 + change 時 DOM 同期
//     A5. downloadReport が state.report.date / start / end を SoT として使う
//         （document.getElementById('rep-date|start|end').value 直読みをやめている）
//     A6. downloadReport の ファイル名用 dateNum も state 経由になっている
//
//   B. normalize helper 単体（既存 helper を使う前提の境界確認）
//     B1. date '2026-05-18' → '2026-05-18'
//     B2. date '2026年5月18日' → '2026-05-18' (legacy migration)
//     B3. date '2026年05月18日' → '2026-05-18'
//     B4. date '' → ''
//     B5. date 'invalid' → ''
//     B6. date null → ''
//     B7. start '12:45' → '12:45'
//     B8. start '12時45分' → '12:45' (legacy migration)
//     B9. start '9時05分' → '09:05'
//     B10. start '25:00' → '' (out-of-range)
//     B11. end '17:00' → '17:00'
//     B12. end '17時00分' → '17:00'
//     B13. end '' / null → ''
//
//   C. normalizeState 旧データ互換
//     C1. date='2026-05-18' → '2026-05-18'
//     C2. date='2026年5月18日' → '2026-05-18' (legacy auto-migrate)
//     C3. date='invalid' → '' (defaults will fill at populate time)
//     C4. date 欠落 → '' (schema 既定)
//     C5. start='12:45' → '12:45'
//     C6. start='12時45分' → '12:45'
//     C7. end='17時00分' → '17:00'
//     C8. start=null → ''
//     C9. 他フィールド（place / title / organizer / prize / sei / fuku / note）に影響なし
//
//   D. populateReportFields の state 同期
//     D1. state.report.date='2026年5月18日' → populate 後、state も DOM も '2026-05-18'
//     D2. state.report.start='12時45分' → populate 後、state も DOM も '12:45'
//     D3. state.report.end='17時00分' → populate 後、state も DOM も '17:00'
//     D4. state.report.date='invalid' → populate 後、 ensureReportDateTimeDefaults
//         が today を補完し、state も DOM も today で同期
//     D5. state.report.start='' → populate 後、 ensureReportDateTimeDefaults が '13:00' を補完
//     D6. state.report.end='' → populate 後、 ensureReportDateTimeDefaults が '17:00' を補完
//     D7. populate は title / organizer / place / prize / sei / fuku / note を壊さない
//
//   E. updateReportFieldFromElement / bindReportEvents
//     E1. #rep-date change → state.report.date = 正規化値、DOM 同期
//     E2. #rep-date input → state 更新のみ、DOM 書き戻しなし（picker 中の中間値保護）
//     E3. #rep-start change → state.report.start 正規化、DOM 同期
//     E4. #rep-end change → state.report.end 正規化、DOM 同期
//     E5. 空欄 change → state は ''、DOM も ''
//
//   F. downloadReport state-as-SoT
//     F1. state.report.date='2026-05-18', DOM date='2025-01-01' → 帳票に '2026年5月18日'
//         (state が優先)
//     F2. state.report.start='09:05', DOM start='13:00' → 帳票に '9時05分'
//     F3. state.report.end='17:30', DOM end='17:00' → 帳票に '17時30分'
//     F4. state.report.date='' → 帳票に placeholder '　　年　　月　　日'
//     F5. state.report.start='' / end='' → placeholder '　　時　　分'
//     F6. state.report.date='2026年5月18日' (legacy raw) → 帳票に '2026年5月18日' (再変換)
//     F7. ファイル名: state.report.date='2026-05-18' → '<title>_20260518_報告書'
//
//   G. 既存機能 非影響
//     G1. title / organizer / place / prize の出力が壊れていない
//     G2. sei / fuku / note は state-as-SoT 化していない（DOM/raw 経路維持）
//     G3. 担当役員 / 参加人数 / 収支 / 備考の出力が壊れていない

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_006b.js <html>');
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

// A1: normalizeState が date / start / end を専用 helper 経由
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportDateForInput\s*\(\s*s\.report\.date\s*\)/.test(body),
    'A1-1 normalizeState が normalizeReportDateForInput(s.report.date) を呼ぶ');
  assert(/normalizeReportTimeForInput\s*\(\s*s\.report\.start\s*\)/.test(body),
    'A1-2 normalizeState が normalizeReportTimeForInput(s.report.start) を呼ぶ');
  assert(/normalizeReportTimeForInput\s*\(\s*s\.report\.end\s*\)/.test(body),
    'A1-3 normalizeState が normalizeReportTimeForInput(s.report.end) を呼ぶ');
}

// A2: populateReportFields が date / start / end を state へ同期書き戻し
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/state\.report\.date\s*=\s*v/.test(body),
    'A2-1 populateReportFields が state.report.date = v で同期書き戻しする');
  assert(/state\.report\[k\]\s*=\s*v/.test(body),
    'A2-2 populateReportFields が state.report[k] = v で start/end 同期書き戻しする');
}

// A3: updateReportFieldFromElement の date 分岐
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]date['"]/.test(body),
    'A3-1 updateReportFieldFromElement で key === "date" 分岐がある');
  assert(/normalizeReportDateForInput\s*\(\s*el\.value\s*\)/.test(body),
    'A3-2 date 分岐で normalizeReportDateForInput(el.value) を使う');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedDate/.test(body),
    'A3-3 date 分岐で change イベント時のみ DOM 書き戻し');
}

// A4: updateReportFieldFromElement の start/end 分岐
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]start['"]\s*\|\|\s*key\s*===\s*['"]end['"]/.test(body),
    'A4-1 updateReportFieldFromElement で key === "start" || "end" 分岐がある');
  assert(/normalizeReportTimeForInput\s*\(\s*el\.value\s*\)/.test(body),
    'A4-2 start/end 分岐で normalizeReportTimeForInput(el.value) を使う');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedTime/.test(body),
    'A4-3 start/end 分岐で change イベント時のみ DOM 書き戻し');
}

// A5: downloadReport が state を SoT として使う
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportDateForInput\s*\(\s*state\.report\s*&&\s*state\.report\.date\s*\)/.test(body),
    'A5-1 downloadReport が normalizeReportDateForInput(state.report && state.report.date) を呼ぶ');
  assert(/normalizeReportTimeForInput\s*\(\s*state\.report\s*&&\s*state\.report\.start\s*\)/.test(body),
    'A5-2 downloadReport が normalizeReportTimeForInput(state.report && state.report.start) を呼ぶ');
  assert(/normalizeReportTimeForInput\s*\(\s*state\.report\s*&&\s*state\.report\.end\s*\)/.test(body),
    'A5-3 downloadReport が normalizeReportTimeForInput(state.report && state.report.end) を呼ぶ');
  // DOM 直読みをやめている
  assert(!/getElementById\(['"]rep-date['"]\)\.value/.test(body),
    'A5-4 downloadReport が #rep-date.value を直読みしていない');
  assert(!/getElementById\(['"]rep-start['"]\)\.value/.test(body),
    'A5-5 downloadReport が #rep-start.value を直読みしていない');
  assert(!/getElementById\(['"]rep-end['"]\)\.value/.test(body),
    'A5-6 downloadReport が #rep-end.value を直読みしていない');
}

// A6: ファイル名 dateNum も state 経由
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  // var dateNum=dateRaw.split('-').join(''); 形式（state 経由の dateRaw を再利用）
  assert(/var\s+dateNum\s*=\s*dateRaw\.split\(['"]-['"]\)\.join\(['"]['"]\)/.test(body),
    'A6 ファイル名用 dateNum が state 由来の dateRaw から生成される');
}

// ============================================================
// loadEnv helper
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
       normalizeReportDateForInput: normalizeReportDateForInput,
       normalizeReportTimeForInput: normalizeReportTimeForInput,
       normalizeState: normalizeState,
       populateReportFields: populateReportFields,
       bindReportEvents: bindReportEvents,
       updateReportFieldFromElement: updateReportFieldFromElement,
       ensureReportDateTimeDefaults: ensureReportDateTimeDefaults,
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

// ============================================================
// SECTION B: normalize helper 単体（境界確認）
// ============================================================
{
  const env = loadEnv(targetPath);
  // date
  assertEq(env.normalizeReportDateForInput('2026-05-18'), '2026-05-18', 'B1 ISO date そのまま');
  assertEq(env.normalizeReportDateForInput('2026年5月18日'), '2026-05-18', 'B2 旧 "2026年5月18日" → ISO migration');
  assertEq(env.normalizeReportDateForInput('2026年05月18日'), '2026-05-18', 'B3 旧 "2026年05月18日" (zero-pad) → ISO');
  assertEq(env.normalizeReportDateForInput(''), '', 'B4 空文字 → ""');
  assertEq(env.normalizeReportDateForInput('invalid'), '', 'B5 不正値 → ""');
  assertEq(env.normalizeReportDateForInput(null), '', 'B6 null → ""');
  // start / end (time)
  assertEq(env.normalizeReportTimeForInput('12:45'), '12:45', 'B7 ISO time そのまま');
  assertEq(env.normalizeReportTimeForInput('12時45分'), '12:45', 'B8 旧 "12時45分" → HH:MM migration');
  assertEq(env.normalizeReportTimeForInput('9時05分'), '09:05', 'B9 旧 "9時05分" → "09:05" (zero-pad)');
  assertEq(env.normalizeReportTimeForInput('25:00'), '', 'B10 範囲外 → ""');
  assertEq(env.normalizeReportTimeForInput('17:00'), '17:00', 'B11 end "17:00" そのまま');
  assertEq(env.normalizeReportTimeForInput('17時00分'), '17:00', 'B12 旧 "17時00分" → "17:00"');
  assertEq(env.normalizeReportTimeForInput(''), '', 'B13a end "" → ""');
  assertEq(env.normalizeReportTimeForInput(null), '', 'B13b end null → ""');
}

// ============================================================
// SECTION C: normalizeState 旧データ互換
// ============================================================
{
  const env = loadEnv(targetPath);
  // C1
  const c1 = env.normalizeState({report:{date:'2026-05-18',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}});
  assertEq(c1.report.date, '2026-05-18', 'C1 date ISO そのまま復元');
  // C2: legacy date migration
  const c2 = env.normalizeState({report:{date:'2026年5月18日',start:'',end:'',sei:'',fuku:'',note:''}});
  assertEq(c2.report.date, '2026-05-18', 'C2 旧形式 date を ISO へ自動 migration');
  // C3: invalid date → ''
  const c3 = env.normalizeState({report:{date:'invalid',start:'',end:'',sei:'',fuku:'',note:''}});
  assertEq(c3.report.date, '', 'C3 不正 date → "" (defaults が後段で補完)');
  // C4: date 欠落 → schema 既定 ''
  const c4 = env.normalizeState({report:{place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}});
  assertEq(c4.report.date, '', 'C4 date 欠落 → schema 既定 ""');
  // C5: start
  const c5 = env.normalizeState({report:{date:'',start:'12:45',end:'',sei:'',fuku:'',note:''}});
  assertEq(c5.report.start, '12:45', 'C5 start ISO そのまま');
  // C6: legacy start migration
  const c6 = env.normalizeState({report:{date:'',start:'12時45分',end:'',sei:'',fuku:'',note:''}});
  assertEq(c6.report.start, '12:45', 'C6 旧形式 start を HH:MM へ自動 migration');
  // C7: legacy end migration
  const c7 = env.normalizeState({report:{date:'',start:'',end:'17時00分',sei:'',fuku:'',note:''}});
  assertEq(c7.report.end, '17:00', 'C7 旧形式 end を HH:MM へ自動 migration');
  // C8: null
  const c8 = env.normalizeState({report:{date:'',start:null,end:null,sei:'',fuku:'',note:''}});
  assertEq(c8.report.start, '', 'C8-1 start=null → ""');
  assertEq(c8.report.end, '', 'C8-2 end=null → ""');
  // C9: 他フィールド非影響
  const c9 = env.normalizeState({report:{date:'2026年5月18日',start:'12時45分',end:'17時00分',sei:'山田',fuku:'佐藤',note:'メモ',place:'公民館',title:'特別大会',organizer:'記念連盟',prize:3000}});
  assertEq(c9.report.date, '2026-05-18', 'C9-1 date 移行');
  assertEq(c9.report.start, '12:45', 'C9-2 start 移行');
  assertEq(c9.report.end, '17:00', 'C9-3 end 移行');
  assertEq(c9.report.place, '公民館', 'C9-4 place 維持 (006A)');
  assertEq(c9.report.title, '特別大会', 'C9-5 title 維持 (004)');
  assertEq(c9.report.organizer, '記念連盟', 'C9-6 organizer 維持 (005)');
  assertEq(c9.report.prize, 3000, 'C9-7 prize 維持 (003A)');
  assertEq(c9.report.sei, '山田', 'C9-8 sei 維持 (本タスクではスコープ外、raw コピー)');
  assertEq(c9.report.fuku, '佐藤', 'C9-9 fuku 維持 (raw)');
  assertEq(c9.report.note, 'メモ', 'C9-10 note 維持 (raw)');
}

// ============================================================
// SECTION D: populateReportFields の state 同期
// ============================================================

// D1: legacy date が state も DOM も ISO へ同期
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026年5月18日'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-date').value, '2026-05-18',
    'D1-1 legacy date が DOM に ISO で反映');
  assertEq(env._getState().report.date, '2026-05-18',
    'D1-2 state.report.date も ISO に同期書き戻し (state-as-SoT)');
}

// D2: legacy start
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'12時45分'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-start').value, '12:45',
    'D2-1 legacy start が DOM に HH:MM で反映');
  assertEq(env._getState().report.start, '12:45',
    'D2-2 state.report.start も HH:MM に同期');
}

// D3: legacy end
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',end:'17時00分'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-end').value, '17:00',
    'D3-1 legacy end が DOM に HH:MM で反映');
  assertEq(env._getState().report.end, '17:00',
    'D3-2 state.report.end も HH:MM に同期');
}

// D4: invalid date → ensureReportDateTimeDefaults が today を補完、state/DOM 一致
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'invalid'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  const domVal = env._ctx.document.getElementById('rep-date').value;
  const stateVal = env._getState().report.date;
  assert(/^\d{4}-\d{2}-\d{2}$/.test(domVal),
    'D4-1 不正 date → ensureReportDateTimeDefaults が today を DOM に補完 (YYYY-MM-DD)');
  assertEq(stateVal, domVal,
    'D4-2 不正 date → state.report.date も DOM と同じ today で同期');
}

// D5: empty start → '13:00' default
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:''}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-start').value, '13:00',
    'D5-1 空欄 start → ensureReportDateTimeDefaults が "13:00" 補完');
  assertEq(env._getState().report.start, '13:00',
    'D5-2 空欄 start → state も "13:00" 同期');
}

// D6: empty end → '17:00' default
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',end:''}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-end').value, '17:00',
    'D6-1 空欄 end → ensureReportDateTimeDefaults が "17:00" 補完');
  assertEq(env._getState().report.end, '17:00',
    'D6-2 空欄 end → state も "17:00" 同期');
}

// D7: populate は他フィールドを壊さない
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({
    date:'2026-05-18',start:'13:00',end:'17:00',
    title:'特別大会',organizer:'記念連盟',place:'公民館',prize:3000,
    sei:'山田',fuku:'佐藤',note:'メモ'
  }));
  seedReportDom(env._ctx);
  env.populateReportFields();
  const s = env._getState();
  assertEq(s.report.title, '特別大会', 'D7-1 title 不変');
  assertEq(s.report.organizer, '記念連盟', 'D7-2 organizer 不変');
  assertEq(s.report.place, '公民館', 'D7-3 place 不変');
  assertEq(s.report.prize, 3000, 'D7-4 prize 不変');
  assertEq(s.report.sei, '山田', 'D7-5 sei 不変');
  assertEq(s.report.fuku, '佐藤', 'D7-6 fuku 不変');
  assertEq(s.report.note, 'メモ', 'D7-7 note 不変');
}

// ============================================================
// SECTION E: updateReportFieldFromElement / bindReportEvents
// ============================================================

// E1: rep-date change → state 同期 + DOM 書き戻し
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-date');
  el.value = '2026-06-01';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E1-pre rep-date change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.date, '2026-06-01',
    'E1-1 change で state.report.date 更新');
  assertEq(el.value, '2026-06-01', 'E1-2 DOM 同期書き戻し');
}

// E2: rep-date input → state のみ更新、DOM 書き戻しなし
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-date');
  el.value = '2026-07-15';
  const fns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.date, '2026-07-15',
    'E2-1 input で state.report.date 更新');
  assertEq(el.value, '2026-07-15',
    'E2-2 input イベント時は DOM 書き戻しなし (picker 中の中間値保護)');
}

// E3: rep-start change
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-start');
  el.value = '14:30';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E3-pre rep-start change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.start, '14:30', 'E3-1 change で state.report.start 更新');
  assertEq(el.value, '14:30', 'E3-2 DOM 同期');
}

// E4: rep-end change
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-end');
  el.value = '18:45';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.end, '18:45', 'E4-1 change で state.report.end 更新');
  assertEq(el.value, '18:45', 'E4-2 DOM 同期');
}

// E5: 空欄 change → state も DOM も ''
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00'});
  env.bindReportEvents();
  const dateEl = env._ctx.document.getElementById('rep-date');
  const startEl = env._ctx.document.getElementById('rep-start');
  const endEl = env._ctx.document.getElementById('rep-end');
  dateEl.value = '';
  startEl.value = '';
  endEl.value = '';
  [dateEl, startEl, endEl].forEach(function(el){
    const fns = (el._handlers && el._handlers['change']) || [];
    for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  });
  assertEq(env._getState().report.date, '', 'E5-1 空欄 change → state.date=""');
  assertEq(env._getState().report.start, '', 'E5-2 空欄 change → state.start=""');
  assertEq(env._getState().report.end, '', 'E5-3 空欄 change → state.end=""');
  assertEq(dateEl.value, '', 'E5-4 空欄 change → DOM date=""');
  assertEq(startEl.value, '', 'E5-5 空欄 change → DOM start=""');
  assertEq(endEl.value, '', 'E5-6 空欄 change → DOM end=""');
}

// ============================================================
// SECTION F: downloadReport state-as-SoT
// ============================================================

// F1: state.date != DOM.date → state 優先
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx, {date:'2025-01-01',start:'13:00',end:'17:00',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0,
    'F1-1 state.date が帳票に出る (state 優先)');
  assert(html.indexOf('2025年1月1日') < 0,
    'F1-2 DOM の 2025-01-01 は出ない');
}

// F2: state.start != DOM.start → state 優先
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'09:05',end:'17:00'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('9時05分') >= 0,
    'F2-1 state.start="09:05" が "9時05分" として出る (state 優先)');
  assert(html.indexOf('13時00分') < 0,
    'F2-2 DOM の "13:00" 由来 "13時00分" は出ない');
}

// F3: state.end != DOM.end → state 優先
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:30'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('17時30分') >= 0,
    'F3-1 state.end="17:30" が "17時30分" として出る (state 優先)');
}

// F4: state.date='' → placeholder
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'',start:'13:00',end:'17:00'}));
  // DOM 側に値を入れても無視される
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('　　年　　月　　日') >= 0,
    'F4-1 state.date="" → 帳票に placeholder 「　　年　　月　　日」');
  assert(html.indexOf('2026年5月18日') < 0,
    'F4-2 DOM の "2026-05-18" は出ない (state 優先で空)');
}

// F5: state.start='' / state.end='' → placeholder
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'',end:''}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // start/end が両方 '' なら 「　　時　　分 〜 　　時　　分」になる
  assert(html.indexOf('　　時　　分') >= 0,
    'F5-1 state.start/end="" → placeholder 「　　時　　分」');
}

// F6: state.date に legacy raw が残っていても帳票は和暦表記で出る
{
  const env = loadEnv(targetPath);
  // 通常 normalizeState 経由で migration されるが、ここでは raw を残したケースを直接構築
  env._setState(makeBaseState({date:'2026年5月18日',start:'12時45分',end:'17時00分'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0,
    'F6-1 legacy date raw → downloadReport 内 helper が ISO に migrate して再変換、帳票に "2026年5月18日"');
  assert(html.indexOf('12時45分') >= 0,
    'F6-2 legacy start raw → 帳票に "12時45分"');
  assert(html.indexOf('17時00分') >= 0,
    'F6-3 legacy end raw → 帳票に "17時00分"');
}

// F7: ファイル名が state 由来
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'沼津支部月例将棋大会'}));
  seedReportDom(env._ctx, {date:'2025-01-01',start:'13:00',end:'17:00',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(/<title>沼津支部月例将棋大会_20260518_報告書<\/title>/.test(html),
    'F7-1 ファイル名 <title> が state.date="2026-05-18" 由来 (state-as-SoT)');
}

// ============================================================
// SECTION G: 既存機能 非影響
// ============================================================

// G1: title / organizer / place / prize の出力が壊れていない
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',organizer:'記念連盟',place:'公民館',prize:5000}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',organizer:'記念連盟',place:'公民館',prize:5000});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特別大会報告書') >= 0, 'G1-1 title 出力不変 (004)');
  assert(html.indexOf('記念連盟') >= 0, 'G1-2 organizer 出力不変 (005)');
  assert(html.indexOf('公民館') >= 0, 'G1-3 place 出力不変 (006A)');
  assert(html.indexOf('賞金：▲5,000円') >= 0, 'G1-4 prize 出力不変 (003A)');
}

// G2: sei / fuku / note も帳票に正しく出力される
//   REPORT-UX-006C で state-as-SoT 化された。state と DOM が一致していれば従来通り
//   sei / fuku / note の値が帳票 HTML に現れる。「DOM 経由 vs state 経由」のアサート文言は
//   006C で更新したが、値が帳票に出ることを確認する保証範囲は維持。
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',sei:'山田',fuku:'佐藤',note:'備考メモ'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',sei:'山田',fuku:'佐藤',note:'備考メモ',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('山田') >= 0, 'G2-1 sei が帳票に出力される (REPORT-UX-006C で state-as-SoT 化)');
  assert(html.indexOf('佐藤') >= 0, 'G2-2 fuku が帳票に出力される (REPORT-UX-006C で state-as-SoT 化)');
  assert(html.indexOf('備考メモ') >= 0, 'G2-3 note が帳票に出力される (REPORT-UX-006C で state-as-SoT 化)');
}

// G3: 担当役員 / 参加人数 / 収支 / 備考 構造維持
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',sei:'山田',fuku:'佐藤',note:'なし',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('担当役員') >= 0, 'G3-1 「担当役員」行が維持');
  assert(html.indexOf('参加人数') >= 0, 'G3-2 「参加人数」行が維持');
  assert(html.indexOf('収支') >= 0, 'G3-3 「収支」行が維持');
  assert(html.indexOf('申し送り事項') >= 0, 'G3-4 「申し送り事項」行が維持');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-006B テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
