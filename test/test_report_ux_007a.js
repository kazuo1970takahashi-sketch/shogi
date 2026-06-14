#!/usr/bin/env node
// REPORT-UX-007A: footer 1行目 FAX番号 / 事務局名 の state-as-SoT / 旧データ互換 / IME-safe
//
// 観点:
//   A. 構造検査
//     A1. normalizeReportFax / normalizeReportOfficeName helper 定義あり
//     A2. normalizeState が fax / officeName を専用 helper 経由で復元する
//     A3. populateReportFields が fax / officeName を state へ同期書き戻し
//     A4. updateReportFieldFromElement で key === 'fax' / 'officeName' 分岐あり、change 時のみ DOM 同期
//     A5. downloadReport が footer 1行目で state.report.fax / officeName を SoT として使う
//     A6. resetAll が #rep-fax / #rep-office-name を default に戻す
//     A7. 報告書フォームに #rep-fax / #rep-office-name input がある
//
//   B. helper 単体
//     B-fax:
//       '943-9443' → '943-9443'
//       ' 943-9443 ' → '943-9443'
//       '055-943-9443' → '055-943-9443'
//       '' / '   ' / null / undefined / 数値 / object → '943-9443'
//     B-office:
//       '沼津支部事務局' → '沼津支部事務局'
//       ' 沼津支部事務局 ' → '沼津支部事務局'
//       '富士支部事務局' → '富士支部事務局'
//       '' / '   ' / null / undefined / 数値 / object → '沼津支部事務局'
//
//   C. normalizeState 旧データ互換
//     C1. fax / officeName 欠落 → default
//     C2. null → default
//     C3. 数値 / object → default
//     C4. 空白のみ → default
//     C5. 通常文字列 → trim
//     C6. 他フィールド非影響
//
//   D. populateReportFields の state 同期
//     D1. state.report.fax = '055-111-2222' → #rep-fax.value = '055-111-2222', state も同じ
//     D2. state.report.officeName = '富士支部事務局' → #rep-office-name.value = '富士支部事務局', state も同じ
//     D3. 空欄 / null / 非文字列は default に補正される、state 側も同期
//     D4. 他フィールド非影響
//
//   E. updateReportFieldFromElement / bindReportEvents (IME-safe)
//     E1. #rep-fax change → state 更新 + DOM 同期
//     E2. #rep-fax input → state のみ更新、DOM 書き戻しなし
//     E3. #rep-office-name change → state 更新 + DOM 同期
//     E4. #rep-office-name input → state のみ更新、DOM 書き戻しなし
//     E5. 空欄 change → state も DOM も default に補正
//
//   F. downloadReport state-as-SoT
//     F1. default の場合、footer 1行目は現行と完全一致
//     F2. state.report.fax を変えると footer に反映される
//     F3. state.report.officeName を変えると footer に反映される
//     F4. DOM と state が異なる場合、state が優先される
//     F5. escapeHtml が維持される
//     F6. raw <script> が footer に混入しない
//     F7. footer 2行目「※役員会で会計長へ収支報告書として提出ください。」は変更されない
//
//   G. 非影響確認
//     G1. title / organizer / place / date / start / end / sei / fuku / note / prize は壊れていない
//     G2. footer 2行目は変更されない
//     G3. ファイル名出力は不変

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_007a.js <html>');
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
assert(/function\s+normalizeReportFax\s*\(/.test(htmlSrc), 'A1-1 normalizeReportFax() 関数定義あり');
assert(/function\s+normalizeReportOfficeName\s*\(/.test(htmlSrc), 'A1-2 normalizeReportOfficeName() 関数定義あり');

// A2
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportFax\s*\(\s*s\.report\.fax\s*\)/.test(body),
    'A2-1 normalizeState が normalizeReportFax(s.report.fax) を呼ぶ');
  assert(/normalizeReportOfficeName\s*\(\s*s\.report\.officeName\s*\)/.test(body),
    'A2-2 normalizeState が normalizeReportOfficeName(s.report.officeName) を呼ぶ');
}

// A3
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportFax\s*\(\s*state\.report\.fax\s*\)/.test(body),
    'A3-1 populateReportFields が normalizeReportFax(state.report.fax) を呼ぶ');
  assert(/normalizeReportOfficeName\s*\(\s*state\.report\.officeName\s*\)/.test(body),
    'A3-2 populateReportFields が normalizeReportOfficeName(state.report.officeName) を呼ぶ');
  assert(/state\.report\.fax\s*=\s*normalizedFax/.test(body),
    'A3-3 populateReportFields が state.report.fax に書き戻す');
  assert(/state\.report\.officeName\s*=\s*normalizedOfficeName/.test(body),
    'A3-4 populateReportFields が state.report.officeName に書き戻す');
}

// A4
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]fax['"]/.test(body), 'A4-1 key === "fax" 分岐がある');
  assert(/key\s*===\s*['"]officeName['"]/.test(body), 'A4-2 key === "officeName" 分岐がある');
  assert(/normalizeReportFax\s*\(\s*el\.value\s*\)/.test(body), 'A4-3 fax 分岐で normalizeReportFax(el.value) を使う');
  assert(/normalizeReportOfficeName\s*\(\s*el\.value\s*\)/.test(body), 'A4-4 officeName 分岐で normalizeReportOfficeName(el.value) を使う');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedFax/.test(body),
    'A4-5 fax 分岐で change 時のみ DOM 書き戻し (IME-safe)');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedOfficeName/.test(body),
    'A4-6 officeName 分岐で change 時のみ DOM 書き戻し');
}

// A5
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportFax\s*\(\s*state\.report\s*&&\s*state\.report\.fax\s*\)/.test(body),
    'A5-1 downloadReport が normalizeReportFax(state.report && state.report.fax) を呼ぶ');
  assert(/normalizeReportOfficeName\s*\(\s*state\.report\s*&&\s*state\.report\.officeName\s*\)/.test(body),
    'A5-2 downloadReport が normalizeReportOfficeName(state.report && state.report.officeName) を呼ぶ');
  // DOM 直読み撤去
  assert(!/getElementById\(['"]rep-fax['"]\)\.value/.test(body),
    'A5-3 downloadReport が #rep-fax.value を直読みしていない');
  assert(!/getElementById\(['"]rep-office-name['"]\)\.value/.test(body),
    'A5-4 downloadReport が #rep-office-name.value を直読みしていない');
  // footer 1行目に escapeHtml(fax) / escapeHtml(officeName) を経由
  assert(/escapeHtml\s*\(\s*fax\s*\)/.test(body),
    'A5-5 downloadReport が escapeHtml(fax) を使う');
  assert(/escapeHtml\s*\(\s*officeName\s*\)/.test(body),
    'A5-6 downloadReport が escapeHtml(officeName) を使う');
}

// A6: resetAll が #rep-fax / #rep-office-name を default に戻す
{
  const m = htmlSrc.match(/function resetAll\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/getElementById\(['"]rep-fax['"]\)/.test(body), 'A6-1 resetAll で #rep-fax を初期化する');
  assert(/getElementById\(['"]rep-office-name['"]\)/.test(body), 'A6-2 resetAll で #rep-office-name を初期化する');
  assert(/['"]943-9443['"]/.test(body), 'A6-3 resetAll で fax を "943-9443" に戻す');
  assert(/['"]沼津支部事務局['"]/.test(body), 'A6-4 resetAll で officeName を "沼津支部事務局" に戻す');
}

// A7: form input element
assert(/id="rep-fax"/.test(htmlSrc), 'A7-1 report form に <input id="rep-fax"> がある');
assert(/id="rep-office-name"/.test(htmlSrc), 'A7-2 report form に <input id="rep-office-name"> がある');

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
       normalizeReportFax: normalizeReportFax,
       normalizeReportOfficeName: normalizeReportOfficeName,
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

function seedReportDom(ctx, repValues){
  repValues = repValues || {};
  const pairs = [
    ['date','rep-date'],['place','rep-place'],['start','rep-start'],['end','rep-end'],
    ['sei','rep-sei'],['fuku','rep-fuku'],['note','rep-note'],['prize','rep-prize'],
    ['title','rep-title'],['organizer','rep-organizer'],
    ['fax','rep-fax'],['officeName','rep-office-name']
  ];
  pairs.forEach(function(p){
    const k = p[0], id = p[1];
    const el = ctx.document.getElementById(id);
    if(typeof el === 'object') el.value = (k in repValues) ? String(repValues[k]) : '';
  });
}

function makeBaseState(reportOverrides){
  const report = Object.assign(
    {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部',fax:'943-9443',officeName:'沼津支部事務局'},
    reportOverrides || {}
  );
  return {
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:report
  };
}

// ============================================================
// SECTION B: helper 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  // fax
  assertEq(env.normalizeReportFax('943-9443'), '943-9443', 'B-fax-1 通常値');
  assertEq(env.normalizeReportFax(' 943-9443 '), '943-9443', 'B-fax-2 trim');
  assertEq(env.normalizeReportFax('055-943-9443'), '055-943-9443', 'B-fax-3 市外局番付き');
  assertEq(env.normalizeReportFax(''), '943-9443', 'B-fax-4 空文字 → default');
  assertEq(env.normalizeReportFax('   '), '943-9443', 'B-fax-5 空白のみ → default');
  assertEq(env.normalizeReportFax(null), '943-9443', 'B-fax-6 null → default');
  assertEq(env.normalizeReportFax(undefined), '943-9443', 'B-fax-7 undefined → default');
  assertEq(env.normalizeReportFax(123), '943-9443', 'B-fax-8 数値 → default');
  assertEq(env.normalizeReportFax({}), '943-9443', 'B-fax-9 object → default');
  assertEq(env.normalizeReportFax([]), '943-9443', 'B-fax-10 array → default');
  // officeName
  assertEq(env.normalizeReportOfficeName('沼津支部事務局'), '沼津支部事務局', 'B-office-1 通常値');
  assertEq(env.normalizeReportOfficeName(' 沼津支部事務局 '), '沼津支部事務局', 'B-office-2 trim');
  assertEq(env.normalizeReportOfficeName('富士支部事務局'), '富士支部事務局', 'B-office-3 他支部名');
  assertEq(env.normalizeReportOfficeName(''), '沼津支部事務局', 'B-office-4 空文字 → default');
  assertEq(env.normalizeReportOfficeName('   '), '沼津支部事務局', 'B-office-5 空白のみ → default');
  assertEq(env.normalizeReportOfficeName(null), '沼津支部事務局', 'B-office-6 null → default');
  assertEq(env.normalizeReportOfficeName(undefined), '沼津支部事務局', 'B-office-7 undefined → default');
  assertEq(env.normalizeReportOfficeName(123), '沼津支部事務局', 'B-office-8 数値 → default');
  assertEq(env.normalizeReportOfficeName({}), '沼津支部事務局', 'B-office-9 object → default');
}

// ============================================================
// SECTION C: normalizeState 旧データ互換
// ============================================================
{
  const env = loadEnv(targetPath);
  // C1: 欠落
  const c1 = env.normalizeState({report:{date:'',place:'労政会館',start:'',end:''}});
  assertEq(c1.report.fax, '943-9443', 'C1-1 fax 欠落 → default');
  assertEq(c1.report.officeName, '沼津支部事務局', 'C1-2 officeName 欠落 → default');
  // C2: null
  const c2 = env.normalizeState({report:{fax:null,officeName:null}});
  assertEq(c2.report.fax, '943-9443', 'C2-1 fax=null → default');
  assertEq(c2.report.officeName, '沼津支部事務局', 'C2-2 officeName=null → default');
  // C3: 数値 / object
  const c3 = env.normalizeState({report:{fax:123,officeName:456}});
  assertEq(c3.report.fax, '943-9443', 'C3-1 fax=数値 → default');
  assertEq(c3.report.officeName, '沼津支部事務局', 'C3-2 officeName=数値 → default');
  const c3b = env.normalizeState({report:{fax:{},officeName:[]}});
  assertEq(c3b.report.fax, '943-9443', 'C3-3 fax=object → default');
  assertEq(c3b.report.officeName, '沼津支部事務局', 'C3-4 officeName=array → default');
  // C4: 空白のみ
  const c4 = env.normalizeState({report:{fax:'   ',officeName:'　　'}});
  assertEq(c4.report.fax, '943-9443', 'C4-1 fax 空白 → default');
  assertEq(c4.report.officeName, '沼津支部事務局', 'C4-2 officeName 全角空白 → default');
  // C5: 通常文字列 trim
  const c5 = env.normalizeState({report:{fax:' 055-111-2222 ',officeName:' 富士支部事務局 '}});
  assertEq(c5.report.fax, '055-111-2222', 'C5-1 fax trim');
  assertEq(c5.report.officeName, '富士支部事務局', 'C5-2 officeName trim');
  // C6: 他フィールド非影響
  const c6 = env.normalizeState({report:{date:'2026-05-18',start:'13:00',end:'17:00',place:'公民館',title:'特別大会',organizer:'記念連盟',prize:3000,sei:'山田',fuku:'佐藤',note:'メモ',fax:'055-999-8888',officeName:'富士支部事務局'}});
  assertEq(c6.report.date, '2026-05-18', 'C6-1 date 不変');
  assertEq(c6.report.start, '13:00', 'C6-2 start 不変');
  assertEq(c6.report.end, '17:00', 'C6-3 end 不変');
  assertEq(c6.report.place, '公民館', 'C6-4 place 不変');
  assertEq(c6.report.title, '特別大会', 'C6-5 title 不変');
  assertEq(c6.report.organizer, '記念連盟', 'C6-6 organizer 不変');
  assertEq(c6.report.prize, 3000, 'C6-7 prize 不変');
  assertEq(c6.report.sei, '山田', 'C6-8 sei 不変');
  assertEq(c6.report.fuku, '佐藤', 'C6-9 fuku 不変');
  assertEq(c6.report.note, 'メモ', 'C6-10 note 不変');
  assertEq(c6.report.fax, '055-999-8888', 'C6-11 fax 復元');
  assertEq(c6.report.officeName, '富士支部事務局', 'C6-12 officeName 復元');
}

// ============================================================
// SECTION D: populateReportFields の state 同期
// ============================================================

// D1: fax 通常値
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({fax:'055-111-2222'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-fax').value, '055-111-2222', 'D1-1 fax → DOM');
  assertEq(env._getState().report.fax, '055-111-2222', 'D1-2 fax → state 同期');
}

// D2: officeName 通常値
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({officeName:'富士支部事務局'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-office-name').value, '富士支部事務局', 'D2-1 officeName → DOM');
  assertEq(env._getState().report.officeName, '富士支部事務局', 'D2-2 officeName → state 同期');
}

// D3: 空欄 / null / 非文字列 → default に補正
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({fax:'',officeName:null}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-fax').value, '943-9443', 'D3-1 fax "" → DOM default');
  assertEq(env._getState().report.fax, '943-9443', 'D3-2 fax "" → state default');
  assertEq(env._ctx.document.getElementById('rep-office-name').value, '沼津支部事務局', 'D3-3 officeName null → DOM default');
  assertEq(env._getState().report.officeName, '沼津支部事務局', 'D3-4 officeName null → state default');
}

// D3b: legacy raw (前後空白) → trim 同期
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({fax:' 943-9443 ',officeName:' 沼津支部事務局 '}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-fax').value, '943-9443', 'D3b-1 fax legacy trim → DOM');
  assertEq(env._getState().report.fax, '943-9443', 'D3b-2 fax legacy trim → state migration');
  assertEq(env._ctx.document.getElementById('rep-office-name').value, '沼津支部事務局', 'D3b-3 officeName legacy trim → DOM');
  assertEq(env._getState().report.officeName, '沼津支部事務局', 'D3b-4 officeName legacy trim → state migration');
}

// D4: 他フィールド非影響
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({
    date:'2026-05-18',start:'13:00',end:'17:00',
    title:'特別大会',organizer:'記念連盟',place:'公民館',prize:3000,
    sei:'山田',fuku:'佐藤',note:'メモ',
    fax:'055-111-2222',officeName:'富士支部事務局'
  }));
  seedReportDom(env._ctx);
  env.populateReportFields();
  const s = env._getState();
  assertEq(s.report.date, '2026-05-18', 'D4-1 date 不変');
  assertEq(s.report.start, '13:00', 'D4-2 start 不変');
  assertEq(s.report.end, '17:00', 'D4-3 end 不変');
  assertEq(s.report.place, '公民館', 'D4-4 place 不変');
  assertEq(s.report.title, '特別大会', 'D4-5 title 不変');
  assertEq(s.report.organizer, '記念連盟', 'D4-6 organizer 不変');
  assertEq(s.report.prize, 3000, 'D4-7 prize 不変');
  assertEq(s.report.sei, '山田', 'D4-8 sei 不変');
  assertEq(s.report.fuku, '佐藤', 'D4-9 fuku 不変');
  assertEq(s.report.note, 'メモ', 'D4-10 note 不変');
}

// ============================================================
// SECTION E: updateReportFieldFromElement (IME-safe)
// ============================================================

// E1: #rep-fax change → state + DOM
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-fax');
  el.value = '055-111-2222';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E1-pre rep-fax change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.fax, '055-111-2222', 'E1-1 change で state.fax 更新');
  assertEq(el.value, '055-111-2222', 'E1-2 DOM 同期書き戻し');
}

// E2: #rep-fax input → state のみ
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-fax');
  el.value = '055-111-2222';
  const fns = (el._handlers && el._handlers['input']) || [];
  assert(fns.length >= 1, 'E2-pre rep-fax input handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.fax, '055-111-2222', 'E2-1 input で state 更新');
  assertEq(el.value, '055-111-2222', 'E2-2 input 時は DOM 書き戻しなし (IME-safe)');
}

// E3: #rep-office-name change → state + DOM
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-office-name');
  el.value = '富士支部事務局';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E3-pre rep-office-name change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.officeName, '富士支部事務局', 'E3-1 change で state.officeName 更新');
  assertEq(el.value, '富士支部事務局', 'E3-2 DOM 同期書き戻し');
}

// E4: #rep-office-name input → state のみ
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-office-name');
  el.value = '富士支部事務局';
  const fns = (el._handlers && el._handlers['input']) || [];
  assert(fns.length >= 1, 'E4-pre rep-office-name input handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.officeName, '富士支部事務局', 'E4-1 input で state 更新');
  assertEq(el.value, '富士支部事務局', 'E4-2 input 時は DOM 書き戻しなし (IME-safe)');
}

// E5: 空欄 change → state も DOM も default に補正
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({fax:'055-111-2222',officeName:'富士支部事務局'}));
  seedReportDom(env._ctx, {fax:'055-111-2222',officeName:'富士支部事務局'});
  env.bindReportEvents();
  // fax 空欄 change
  {
    const el = env._ctx.document.getElementById('rep-fax');
    el.value = '';
    const fns = (el._handlers && el._handlers['change']) || [];
    for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  }
  // officeName 空欄 change
  {
    const el = env._ctx.document.getElementById('rep-office-name');
    el.value = '';
    const fns = (el._handlers && el._handlers['change']) || [];
    for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  }
  assertEq(env._getState().report.fax, '943-9443', 'E5-1 空欄 change → state.fax default');
  assertEq(env._ctx.document.getElementById('rep-fax').value, '943-9443', 'E5-2 空欄 change → DOM fax default');
  assertEq(env._getState().report.officeName, '沼津支部事務局', 'E5-3 空欄 change → state.officeName default');
  assertEq(env._ctx.document.getElementById('rep-office-name').value, '沼津支部事務局', 'E5-4 空欄 change → DOM officeName default');
}

// E5b: trim change
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-fax');
  el.value = ' 055-111-2222 ';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.fax, '055-111-2222', 'E5b-1 " 055-111-2222 " change → state trim');
  assertEq(el.value, '055-111-2222', 'E5b-2 " 055-111-2222 " change → DOM trim');
}

// ============================================================
// SECTION F: downloadReport state-as-SoT
// ============================================================

// F1: default 出力 - footer 1行目が現行固定値と完全一致
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('※ホームページ掲載の為、当日夜までにFAX（943-9443）、メールまたは直接沼津支部事務局まで') >= 0,
    'F1-1 default の場合、footer 1行目は現行と完全一致');
}

// F2: fax を変えると footer に反映される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',fax:'055-111-2222'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('FAX（055-111-2222）') >= 0, 'F2-1 fax が footer に反映');
  assert(html.indexOf('FAX（943-9443）') < 0, 'F2-2 旧 default fax が出ない');
}

// F3: officeName を変えると footer に反映される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',officeName:'富士支部事務局'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('直接富士支部事務局まで') >= 0, 'F3-1 officeName が footer に反映');
  assert(html.indexOf('直接沼津支部事務局まで') < 0, 'F3-2 旧 default officeName が出ない');
}

// F4: DOM と state が異なる場合、state が優先される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',fax:'055-111-2222',officeName:'富士支部事務局'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',fax:'別FAX',officeName:'別事務局',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('055-111-2222') >= 0, 'F4-1 state.fax が帳票に出る (state 優先)');
  assert(html.indexOf('別FAX') < 0, 'F4-2 DOM の "別FAX" は出ない');
  assert(html.indexOf('富士支部事務局') >= 0, 'F4-3 state.officeName が帳票に出る');
  assert(html.indexOf('別事務局') < 0, 'F4-4 DOM の "別事務局" は出ない');
}

// F5: escapeHtml が維持される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',fax:'<b>raw-fax</b>',officeName:'<i>raw-office</i>'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<b>raw-fax</b>') < 0, 'F5-1 fax の <b> は raw として出ない');
  assert(html.indexOf('&lt;b&gt;raw-fax&lt;/b&gt;') >= 0, 'F5-2 fax は escapeHtml される');
  assert(html.indexOf('<i>raw-office</i>') < 0, 'F5-3 officeName の <i> は raw として出ない');
  assert(html.indexOf('&lt;i&gt;raw-office&lt;/i&gt;') >= 0, 'F5-4 officeName は escapeHtml される');
}

// F6: raw <script> が footer に混入しない
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',fax:'<script>alert(1)</script>',officeName:'<script>alert(2)</script>'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // footer 1行目を切り出して script タグ raw 混入が無いことを確認
  const footerLine = html.match(/※ホームページ掲載の為[\s\S]*?<\/p>/);
  assert(footerLine, 'F6-pre footer 1行目を切り出せる');
  assert(footerLine && footerLine[0].indexOf('<script>alert(1)</script>') < 0,
    'F6-1 footer 1行目に raw <script>(fax 由来) が混入しない');
  assert(footerLine && footerLine[0].indexOf('<script>alert(2)</script>') < 0,
    'F6-2 footer 1行目に raw <script>(officeName 由来) が混入しない');
  assert(footerLine && /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(footerLine[0]),
    'F6-3 footer 1行目で fax 由来 script は escapeHtml された形で出る');
  assert(footerLine && /&lt;script&gt;alert\(2\)&lt;\/script&gt;/.test(footerLine[0]),
    'F6-4 footer 1行目で officeName 由来 script は escapeHtml された形で出る');
}

// F7: footer 2行目は変更されない
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',fax:'055-111-2222',officeName:'富士支部事務局'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('※役員会で会計長へ収支報告書として提出ください。') >= 0,
    'F7 footer 2行目は変更されない');
}

// ============================================================
// SECTION G: 既存機能 非影響
// ============================================================

// G1: title / organizer / place / prize / date / start / end / sei / fuku / note 出力不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',organizer:'記念連盟',place:'公民館',prize:5000,sei:'山田',fuku:'佐藤',note:'メモ',fax:'055-111-2222',officeName:'富士支部事務局'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特別大会報告書') >= 0, 'G1-1 title (004) 不変');
  assert(html.indexOf('記念連盟') >= 0, 'G1-2 organizer (005) 不変');
  assert(html.indexOf('公民館') >= 0, 'G1-3 place (006A) 不変');
  assert(html.indexOf('賞金：▲5,000円') >= 0, 'G1-4 prize (003A) 不変');
  assert(html.indexOf('2026年5月18日') >= 0, 'G1-5 date (006B) 和暦変換不変');
  assert(html.indexOf('13時00分') >= 0, 'G1-6 start (006B) 和暦変換不変');
  assert(html.indexOf('17時00分') >= 0, 'G1-7 end (006B) 和暦変換不変');
  assert(html.indexOf('山田') >= 0, 'G1-8 sei (006C) 不変');
  assert(html.indexOf('佐藤') >= 0, 'G1-9 fuku (006C) 不変');
  assert(html.indexOf('メモ') >= 0, 'G1-10 note (006C) 不変');
}

// G2: ファイル名出力不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',fax:'055-111-2222',officeName:'富士支部事務局'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(/<title>2026年5月度特別大会報告書<\/title>/.test(html), 'G2 ファイル名（新仕様 YYYY年M月度{大会名}{種別}）(004/006B 整合)');
}

// G3: footer 2行目は変更されない（default fax / officeName でも他値でも）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('※役員会で会計長へ収支報告書として提出ください。') >= 0,
    'G3 footer 2行目はそのまま');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-007A テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
