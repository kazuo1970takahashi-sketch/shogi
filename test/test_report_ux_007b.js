#!/usr/bin/env node
// REPORT-UX-007B-1: footer 2行目 会計提出文 (state.report.accountingNote) の
//   state-as-SoT / 旧データ互換 / IME-safe / 改行保持 / escapeHtml
//
// 観点:
//   A. 構造検査
//     A1. normalizeReportAccountingNote helper 定義あり
//     A2. normalizeState が accountingNote を専用 helper 経由で復元する
//     A3. populateReportFields が accountingNote を state へ同期書き戻し
//     A4. updateReportFieldFromElement で key === 'accountingNote' 分岐あり、change 時のみ DOM 同期
//     A5. downloadReport が footer 2行目で state.report.accountingNote を SoT として使う
//     A6. resetAll が #rep-accounting-note を default に戻す
//     A7. 報告書フォームに #rep-accounting-note textarea がある
//     A8. footer 2行目に '※役員会で会計長へ収支報告書として提出ください。' literal が残っていない
//
//   B. helper 単体
//     - default → default（自己同一）
//     - '  ' + default + '  ' → default（trim）
//     - '1行目\n2行目' → '1行目\n2行目'（中間改行維持）
//     - '' / '   ' / null / undefined / 数値 / object → default
//
//   C. normalizeState 旧データ互換
//     C1. accountingNote 欠落 → default
//     C2. null → default
//     C3. 数値 / object → default
//     C4. 空白のみ → default
//     C5. 通常文字列 → trim
//     C6. 中間改行は維持
//     C7. 他フィールド非影響
//
//   D. populateReportFields の state 同期
//     D1. 任意文言 → textarea + state
//     D2. 空欄 / null → default
//     D3. legacy raw (前後空白) → trim 同期
//     D4. 中間改行は維持
//     D5. 他フィールド非影響
//
//   E. updateReportFieldFromElement / bindReportEvents (IME-safe)
//     E1. change → state 更新 + DOM 同期
//     E2. input → state のみ更新、DOM 書き戻しなし
//     E3. 空欄 change → default に補正
//     E4. trim change
//     E5. 中間改行 change で保持される
//
//   F. downloadReport state-as-SoT
//     F1. default の場合、footer 2行目は現行と完全一致
//     F2. accountingNote を変えると footer 2行目に反映される
//     F3. DOM と state が異なる場合、state が優先される
//     F4. escapeHtml が維持される
//     F5. raw <script> が footer に混入しない
//     F6. 中間改行は <br> に変換される
//     F7. footer 1行目（FAX / officeName）は変更されない
//
//   G. resetAll
//     G1. resetAll 後 state.report.accountingNote が default
//     G2. #rep-accounting-note も default
//
//   H. 非影響確認
//     H1. title / organizer / place / date / start / end / sei / fuku / note / prize / fax / officeName は壊れていない
//     H2. ファイル名出力は不変
//     H3. footer 1行目テンプレート文言は不変

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_007b.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

const DEFAULT_NOTE = '※役員会で会計長へ収支報告書として提出ください。';

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
assert(/function\s+normalizeReportAccountingNote\s*\(/.test(htmlSrc),
  'A1 normalizeReportAccountingNote() 関数定義あり');

// A2
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportAccountingNote\s*\(\s*s\.report\.accountingNote\s*\)/.test(body),
    'A2 normalizeState が normalizeReportAccountingNote(s.report.accountingNote) を呼ぶ');
}

// A3
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportAccountingNote\s*\(\s*state\.report\.accountingNote\s*\)/.test(body),
    'A3-1 populateReportFields が normalizeReportAccountingNote(state.report.accountingNote) を呼ぶ');
  assert(/state\.report\.accountingNote\s*=\s*normalizedAccountingNote/.test(body),
    'A3-2 populateReportFields が state.report.accountingNote に書き戻す');
}

// A4
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]accountingNote['"]/.test(body),
    'A4-1 key === "accountingNote" 分岐がある');
  assert(/normalizeReportAccountingNote\s*\(\s*el\.value\s*\)/.test(body),
    'A4-2 accountingNote 分岐で normalizeReportAccountingNote(el.value) を使う');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedAccountingNote/.test(body),
    'A4-3 accountingNote 分岐で change 時のみ DOM 書き戻し (IME-safe)');
}

// A5
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportAccountingNote\s*\(\s*state\.report\s*&&\s*state\.report\.accountingNote\s*\)/.test(body),
    'A5-1 downloadReport が normalizeReportAccountingNote(state.report && state.report.accountingNote) を呼ぶ');
  // DOM 直読み撤去
  assert(!/getElementById\(['"]rep-accounting-note['"]\)\.value/.test(body),
    'A5-2 downloadReport が #rep-accounting-note.value を直読みしていない');
  // escapeHtml(accountingNote) を経由
  assert(/escapeHtml\s*\(\s*accountingNote\s*\)/.test(body),
    'A5-3 downloadReport が escapeHtml(accountingNote) を使う');
  // 改行を <br> に変換
  assert(/escapeHtml\s*\(\s*accountingNote\s*\)\.split\(\s*['"]\\n['"]\s*\)\.join\(\s*['"]<br>['"]\s*\)/.test(body),
    'A5-4 downloadReport が escapeHtml(accountingNote).split("\\n").join("<br>") を使う');
  // footer 2行目の固定 literal が撤去されている
  assert(body.indexOf('">※役員会で会計長へ収支報告書として提出ください。<') === -1,
    'A5-5 downloadReport 本体に footer 2行目固定 literal が残っていない');
}

// A6: resetAll が #rep-accounting-note を default に戻す
{
  const m = htmlSrc.match(/function resetAll\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/getElementById\(['"]rep-accounting-note['"]\)/.test(body),
    'A6-1 resetAll で #rep-accounting-note を初期化する');
  assert(body.indexOf(DEFAULT_NOTE) >= 0,
    'A6-2 resetAll で accountingNote を default 文言に戻す');
}

// A7: form textarea element
assert(/id="rep-accounting-note"/.test(htmlSrc),
  'A7-1 report form に <textarea id="rep-accounting-note"> がある');
assert(/<textarea[^>]*id="rep-accounting-note"/.test(htmlSrc),
  'A7-2 #rep-accounting-note は textarea である');

// A8: schema literal 6 箇所すべてに accountingNote が含まれる
{
  const literalCount = (htmlSrc.match(/officeName:'沼津支部事務局',accountingNote:'※役員会で会計長へ収支報告書として提出ください。'/g) || []).length;
  const literalCountSpaced = (htmlSrc.match(/officeName:'沼津支部事務局', accountingNote:'※役員会で会計長へ収支報告書として提出ください。'/g) || []).length;
  assert(literalCount + literalCountSpaced === 6,
    'A8 schema literal 6 箇所すべてに accountingNote が含まれる (count=' + (literalCount + literalCountSpaced) + ')');
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
       normalizeReportAccountingNote: normalizeReportAccountingNote,
       normalizeState: normalizeState,
       populateReportFields: populateReportFields,
       bindReportEvents: bindReportEvents,
       updateReportFieldFromElement: updateReportFieldFromElement,
       downloadReport: downloadReport,
       resetAll: resetAll,
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
    ['fax','rep-fax'],['officeName','rep-office-name'],
    ['accountingNote','rep-accounting-note']
  ];
  pairs.forEach(function(p){
    const k = p[0], id = p[1];
    const el = ctx.document.getElementById(id);
    if(typeof el === 'object') el.value = (k in repValues) ? String(repValues[k]) : '';
  });
}

function makeBaseState(reportOverrides){
  const report = Object.assign(
    {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部',fax:'943-9443',officeName:'沼津支部事務局',accountingNote:DEFAULT_NOTE},
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
  assertEq(env.normalizeReportAccountingNote(DEFAULT_NOTE), DEFAULT_NOTE, 'B-1 default 通常値');
  assertEq(env.normalizeReportAccountingNote('  ' + DEFAULT_NOTE + '  '), DEFAULT_NOTE, 'B-2 trim');
  assertEq(env.normalizeReportAccountingNote('別の文言'), '別の文言', 'B-3 別文言');
  assertEq(env.normalizeReportAccountingNote('1行目\n2行目'), '1行目\n2行目', 'B-4 中間改行維持');
  assertEq(env.normalizeReportAccountingNote(' 1行目\n2行目 '), '1行目\n2行目', 'B-5 両端 trim + 中間改行維持');
  assertEq(env.normalizeReportAccountingNote(''), DEFAULT_NOTE, 'B-6 空文字 → default');
  assertEq(env.normalizeReportAccountingNote('   '), DEFAULT_NOTE, 'B-7 空白のみ → default');
  assertEq(env.normalizeReportAccountingNote('　　'), DEFAULT_NOTE, 'B-8 全角空白のみ → default');
  assertEq(env.normalizeReportAccountingNote(null), DEFAULT_NOTE, 'B-9 null → default');
  assertEq(env.normalizeReportAccountingNote(undefined), DEFAULT_NOTE, 'B-10 undefined → default');
  assertEq(env.normalizeReportAccountingNote(123), DEFAULT_NOTE, 'B-11 数値 → default');
  assertEq(env.normalizeReportAccountingNote({}), DEFAULT_NOTE, 'B-12 object → default');
  assertEq(env.normalizeReportAccountingNote([]), DEFAULT_NOTE, 'B-13 array → default');
}

// ============================================================
// SECTION C: normalizeState 旧データ互換
// ============================================================
{
  const env = loadEnv(targetPath);
  // C1: 欠落
  const c1 = env.normalizeState({report:{date:'',place:'労政会館',start:'',end:''}});
  assertEq(c1.report.accountingNote, DEFAULT_NOTE, 'C1 accountingNote 欠落 → default');
  // C2: null
  const c2 = env.normalizeState({report:{accountingNote:null}});
  assertEq(c2.report.accountingNote, DEFAULT_NOTE, 'C2 accountingNote=null → default');
  // C3: 数値 / object
  const c3a = env.normalizeState({report:{accountingNote:123}});
  assertEq(c3a.report.accountingNote, DEFAULT_NOTE, 'C3-1 accountingNote=数値 → default');
  const c3b = env.normalizeState({report:{accountingNote:{}}});
  assertEq(c3b.report.accountingNote, DEFAULT_NOTE, 'C3-2 accountingNote=object → default');
  const c3c = env.normalizeState({report:{accountingNote:[]}});
  assertEq(c3c.report.accountingNote, DEFAULT_NOTE, 'C3-3 accountingNote=array → default');
  // C4: 空白のみ
  const c4 = env.normalizeState({report:{accountingNote:'   '}});
  assertEq(c4.report.accountingNote, DEFAULT_NOTE, 'C4-1 accountingNote 空白 → default');
  const c4b = env.normalizeState({report:{accountingNote:'　　'}});
  assertEq(c4b.report.accountingNote, DEFAULT_NOTE, 'C4-2 accountingNote 全角空白 → default');
  // C5: 通常文字列 trim
  const c5 = env.normalizeState({report:{accountingNote:' 別文言 '}});
  assertEq(c5.report.accountingNote, '別文言', 'C5 accountingNote trim');
  // C6: 中間改行は維持
  const c6 = env.normalizeState({report:{accountingNote:' 1行目\n2行目 '}});
  assertEq(c6.report.accountingNote, '1行目\n2行目', 'C6 中間改行は維持');
  // C7: 他フィールド非影響
  const c7 = env.normalizeState({report:{date:'2026-05-18',start:'13:00',end:'17:00',place:'公民館',title:'特別大会',organizer:'記念連盟',prize:3000,sei:'山田',fuku:'佐藤',note:'メモ',fax:'055-999-8888',officeName:'富士支部事務局',accountingNote:'カスタム会計提出文'}});
  assertEq(c7.report.date, '2026-05-18', 'C7-1 date 不変');
  assertEq(c7.report.start, '13:00', 'C7-2 start 不変');
  assertEq(c7.report.end, '17:00', 'C7-3 end 不変');
  assertEq(c7.report.place, '公民館', 'C7-4 place 不変');
  assertEq(c7.report.title, '特別大会', 'C7-5 title 不変');
  assertEq(c7.report.organizer, '記念連盟', 'C7-6 organizer 不変');
  assertEq(c7.report.prize, 3000, 'C7-7 prize 不変');
  assertEq(c7.report.sei, '山田', 'C7-8 sei 不変');
  assertEq(c7.report.fuku, '佐藤', 'C7-9 fuku 不変');
  assertEq(c7.report.note, 'メモ', 'C7-10 note 不変');
  assertEq(c7.report.fax, '055-999-8888', 'C7-11 fax 不変');
  assertEq(c7.report.officeName, '富士支部事務局', 'C7-12 officeName 不変');
  assertEq(c7.report.accountingNote, 'カスタム会計提出文', 'C7-13 accountingNote 復元');
}

// ============================================================
// SECTION D: populateReportFields の state 同期
// ============================================================

// D1: 任意文言
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({accountingNote:'別会計提出文'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-accounting-note').value, '別会計提出文', 'D1-1 任意文言 → DOM');
  assertEq(env._getState().report.accountingNote, '別会計提出文', 'D1-2 任意文言 → state 同期');
}

// D2: 空欄 / null → default
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({accountingNote:''}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-accounting-note').value, DEFAULT_NOTE, 'D2-1 "" → DOM default');
  assertEq(env._getState().report.accountingNote, DEFAULT_NOTE, 'D2-2 "" → state default');
}
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({accountingNote:null}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-accounting-note').value, DEFAULT_NOTE, 'D2-3 null → DOM default');
  assertEq(env._getState().report.accountingNote, DEFAULT_NOTE, 'D2-4 null → state default');
}

// D3: legacy raw (前後空白) → trim 同期
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({accountingNote:'  ' + DEFAULT_NOTE + '  '}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-accounting-note').value, DEFAULT_NOTE, 'D3-1 legacy trim → DOM');
  assertEq(env._getState().report.accountingNote, DEFAULT_NOTE, 'D3-2 legacy trim → state migration');
}

// D4: 中間改行は維持
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({accountingNote:'1行目\n2行目'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-accounting-note').value, '1行目\n2行目', 'D4-1 改行維持 → DOM');
  assertEq(env._getState().report.accountingNote, '1行目\n2行目', 'D4-2 改行維持 → state');
}

// D5: 他フィールド非影響
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({
    date:'2026-05-18',start:'13:00',end:'17:00',
    title:'特別大会',organizer:'記念連盟',place:'公民館',prize:3000,
    sei:'山田',fuku:'佐藤',note:'メモ',
    fax:'055-111-2222',officeName:'富士支部事務局',
    accountingNote:'別会計提出文'
  }));
  seedReportDom(env._ctx);
  env.populateReportFields();
  const s = env._getState();
  assertEq(s.report.date, '2026-05-18', 'D5-1 date 不変');
  assertEq(s.report.start, '13:00', 'D5-2 start 不変');
  assertEq(s.report.end, '17:00', 'D5-3 end 不変');
  assertEq(s.report.place, '公民館', 'D5-4 place 不変');
  assertEq(s.report.title, '特別大会', 'D5-5 title 不変');
  assertEq(s.report.organizer, '記念連盟', 'D5-6 organizer 不変');
  assertEq(s.report.prize, 3000, 'D5-7 prize 不変');
  assertEq(s.report.sei, '山田', 'D5-8 sei 不変');
  assertEq(s.report.fuku, '佐藤', 'D5-9 fuku 不変');
  assertEq(s.report.note, 'メモ', 'D5-10 note 不変');
  assertEq(s.report.fax, '055-111-2222', 'D5-11 fax 不変');
  assertEq(s.report.officeName, '富士支部事務局', 'D5-12 officeName 不変');
}

// ============================================================
// SECTION E: updateReportFieldFromElement (IME-safe)
// ============================================================

// E1: change → state + DOM
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-accounting-note');
  el.value = '別会計提出文';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E1-pre rep-accounting-note change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.accountingNote, '別会計提出文', 'E1-1 change で state.accountingNote 更新');
  assertEq(el.value, '別会計提出文', 'E1-2 DOM 同期書き戻し');
}

// E2: input → state のみ
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-accounting-note');
  el.value = '別会計提出文';
  const fns = (el._handlers && el._handlers['input']) || [];
  assert(fns.length >= 1, 'E2-pre rep-accounting-note input handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.accountingNote, '別会計提出文', 'E2-1 input で state 更新');
  assertEq(el.value, '別会計提出文', 'E2-2 input 時は DOM 書き戻しなし (IME-safe)');
}

// E3: 空欄 change → default に補正
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({accountingNote:'別会計提出文'}));
  seedReportDom(env._ctx, {accountingNote:'別会計提出文'});
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-accounting-note');
  el.value = '';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.accountingNote, DEFAULT_NOTE, 'E3-1 空欄 change → state default');
  assertEq(env._ctx.document.getElementById('rep-accounting-note').value, DEFAULT_NOTE, 'E3-2 空欄 change → DOM default');
}

// E4: trim change
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-accounting-note');
  el.value = '  別会計提出文  ';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.accountingNote, '別会計提出文', 'E4-1 trim change → state');
  assertEq(el.value, '別会計提出文', 'E4-2 trim change → DOM');
}

// E5: 中間改行 change で保持される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-accounting-note');
  el.value = ' 1行目\n2行目 ';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.accountingNote, '1行目\n2行目', 'E5-1 改行維持 + 両端 trim → state');
  assertEq(el.value, '1行目\n2行目', 'E5-2 改行維持 → DOM');
}

// ============================================================
// SECTION F: downloadReport state-as-SoT
// ============================================================

// F1: default 出力 - footer 2行目が現行固定値と完全一致
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<p style="font-size:11px">' + DEFAULT_NOTE + '</p>') >= 0,
    'F1 default の場合、footer 2行目は現行と完全一致');
}

// F2: accountingNote を変えると footer 2行目に反映される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',accountingNote:'別会計提出文'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<p style="font-size:11px">別会計提出文</p>') >= 0,
    'F2-1 accountingNote が footer 2行目に反映');
  assert(html.indexOf(DEFAULT_NOTE) < 0, 'F2-2 default 文言は出ない');
}

// F3: DOM と state が異なる場合、state が優先される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',accountingNote:'state優先文言'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',accountingNote:'DOM文言',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部',fax:'943-9443',officeName:'沼津支部事務局'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('state優先文言') >= 0, 'F3-1 state.accountingNote が帳票に出る (state 優先)');
  assert(html.indexOf('DOM文言') < 0, 'F3-2 DOM の "DOM文言" は出ない');
}

// F4: escapeHtml が維持される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',accountingNote:'<b>raw-note</b>'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<b>raw-note</b>') < 0, 'F4-1 accountingNote の <b> は raw として出ない');
  assert(html.indexOf('&lt;b&gt;raw-note&lt;/b&gt;') >= 0, 'F4-2 accountingNote は escapeHtml される');
}

// F5: raw <script> が footer に混入しない
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',accountingNote:'<script>alert(3)</script>'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // footer 2行目を切り出して script タグ raw 混入が無いことを確認
  // (footer 1行目に続く 2 番目の <p style="font-size:11px"> ... </p> を取る)
  const all = html.match(/<p style="font-size:11px">[\s\S]*?<\/p>/g) || [];
  // 1 行目は margin-top:12px を含むため style 文字列が異なる。font-size:11px のみで margin-top なしのものを抽出
  const footer2 = all.find(function(s){return s.indexOf('margin-top') < 0;});
  assert(footer2, 'F5-pre footer 2行目を切り出せる');
  assert(footer2 && footer2.indexOf('<script>alert(3)</script>') < 0,
    'F5-1 footer 2行目に raw <script> が混入しない');
  assert(footer2 && /&lt;script&gt;alert\(3\)&lt;\/script&gt;/.test(footer2),
    'F5-2 footer 2行目で accountingNote 由来 script は escapeHtml された形で出る');
}

// F6: 中間改行は <br> に変換される
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',accountingNote:'1行目\n2行目'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<p style="font-size:11px">1行目<br>2行目</p>') >= 0,
    'F6 中間改行が <br> に変換され footer 2行目に出る');
}

// F7: footer 1行目（FAX / officeName）は変更されない
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',accountingNote:'別会計提出文'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('※ホームページ掲載の為、当日夜までにメールまたは直接沼津支部事務局まで') >= 0,
    'F7 footer 1行目は FAX 抜きの自然文（FAX削除後のテンプレート）');
  assert(html.indexOf('FAX') < 0, 'F7-2 footer に FAX 文言は出ない（FAX削除）');
}

// ============================================================
// SECTION G: resetAll
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({accountingNote:'別会計提出文'}));
  seedReportDom(env._ctx, {accountingNote:'別会計提出文'});
  env.resetAll();
  assertEq(env._getState().report.accountingNote, DEFAULT_NOTE, 'G1 resetAll 後 state.accountingNote が default');
  assertEq(env._ctx.document.getElementById('rep-accounting-note').value, DEFAULT_NOTE, 'G2 #rep-accounting-note も default');
}

// ============================================================
// SECTION H: 既存機能 非影響
// ============================================================

// H1: title / organizer / place / prize / date / start / end / sei / fuku / note / fax / officeName 出力不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',organizer:'記念連盟',place:'公民館',prize:5000,sei:'山田',fuku:'佐藤',note:'メモ',fax:'055-111-2222',officeName:'富士支部事務局',accountingNote:'別会計提出文'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特別大会報告書') >= 0, 'H1-1 title (004) 不変');
  assert(html.indexOf('記念連盟') >= 0, 'H1-2 organizer (005) 不変');
  assert(html.indexOf('公民館') >= 0, 'H1-3 place (006A) 不変');
  assert(html.indexOf('賞金：▲5,000円') >= 0, 'H1-4 prize (003A) 不変');
  assert(html.indexOf('2026年5月18日') >= 0, 'H1-5 date (006B) 和暦変換不変');
  assert(html.indexOf('13時00分') >= 0, 'H1-6 start (006B) 和暦変換不変');
  assert(html.indexOf('17時00分') >= 0, 'H1-7 end (006B) 和暦変換不変');
  assert(html.indexOf('山田') >= 0, 'H1-8 sei (006C) 不変');
  assert(html.indexOf('佐藤') >= 0, 'H1-9 fuku (006C) 不変');
  assert(html.indexOf('メモ') >= 0, 'H1-10 note (006C) 不変');
  assert(html.indexOf('FAX') < 0, 'H1-11 fax は報告書に出ない（FAX削除・state にあっても非出力）');
  assert(html.indexOf('直接富士支部事務局まで') >= 0, 'H1-12 officeName (007A) 不変');
}

// H2: ファイル名出力不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',accountingNote:'別会計提出文'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(/<title>2026年5月度特別大会報告書<\/title>/.test(html), 'H2 ファイル名（新仕様 YYYY年M月度{大会名}{種別}）(004/006B 整合)');
}

// H3: footer 1行目テンプレート文言（FAX削除後）は不変（default 値で出力したケース）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('※ホームページ掲載の為、当日夜までにメールまたは直接沼津支部事務局まで') >= 0,
    'H3 footer 1行目テンプレート文言（FAX削除後）は不変');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-007B テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
