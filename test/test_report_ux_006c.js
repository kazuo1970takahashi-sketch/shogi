#!/usr/bin/env node
// REPORT-UX-006C: sei / fuku / note state-as-SoT / 旧データ互換 / IME-safe / 改行保持
//
// 観点:
//   A. 構造検査
//     A1. normalizeReportSei / normalizeReportFuku / normalizeReportNote helper 定義あり
//     A2. normalizeState が sei / fuku / note を専用 helper 経由で復元する
//     A3. populateReportFields が sei / fuku / note を state へ同期書き戻し
//     A4. updateReportFieldFromElement で key === 'sei' / 'fuku' / 'note' 分岐あり、change 時のみ DOM 同期
//     A5. downloadReport が state.report.sei / fuku / note を SoT として使う（DOM 直読み撤去）
//     A6. downloadReport で note のみ '特になし' 表示 fallback（state には保存しない）
//
//   B. helper 単体（B-sei / B-fuku / B-note）
//     B1. sei '山田' → '山田'
//     B2. sei ' 山田 ' → '山田'
//     B3. sei '' / '   ' / null / undefined / 数値 / object → ''
//     B4. fuku は sei と同等
//     B5. note '1行目\n2行目' → '1行目\n2行目' (中間改行維持)
//     B6. note ' 1行目\n2行目 ' → '1行目\n2行目' (両端 trim、中間改行維持)
//     B7. note '' / '   ' / null / undefined / 数値 / object → ''
//     B8. note '\n\n' → '' (空白のみ扱い)
//     B9. note '1行目\n2行目\n3行目' → '1行目\n2行目\n3行目' (複数改行維持)
//
//   C. normalizeState 旧データ互換
//     C1. sei / fuku / note 欠落 → '' (schema 既定)
//     C2. sei = null → ''
//     C3. fuku = 数値 → ''
//     C4. note = object → ''
//     C5. sei = '  山田  ' → '山田' (trim)
//     C6. note = ' 1行目\n2行目 ' → '1行目\n2行目'
//     C7. note = '   ' → '' (空白のみ)
//     C8. 他フィールド非影響（title / organizer / place / prize / date / start / end）
//
//   D. populateReportFields の state 同期
//     D1. state.report.sei = '山田' → #rep-sei.value = '山田'、state も '山田'
//     D2. state.report.fuku = '佐藤' → #rep-fuku.value = '佐藤'、state も '佐藤'
//     D3. state.report.note = '1行目\n2行目' → #rep-note.value = '1行目\n2行目'、state も同じ
//     D4. state.report.sei = ' 山田 ' (legacy raw) → #rep-sei.value = '山田'、state も '山田' (migration)
//     D5. state.report.note = '' → #rep-note.value = '' (DOM に '特になし' を入れない)
//     D6. state.report.note = '   ' → #rep-note.value = '' (空白も '' に正規化)
//     D7. populateReportFields は title / organizer / place / prize / date / start / end を壊さない
//
//   E. updateReportFieldFromElement / bindReportEvents (IME-safe)
//     E1. #rep-sei change → state.report.sei 更新 + DOM 同期
//     E2. #rep-sei input → state のみ更新、DOM 書き戻しなし (IME-safe)
//     E3. #rep-fuku change → state.report.fuku 更新 + DOM 同期
//     E4. #rep-fuku input → state のみ更新
//     E5. #rep-note change → state.report.note 更新 + DOM 同期、中間改行維持
//     E6. #rep-note input → state のみ更新、DOM 書き戻しなし
//     E7. 空欄 change → state も DOM も ''（'特になし' は書き戻さない）
//     E8. ' 山田 ' change → trim 後 '山田' が state / DOM 両方
//     E9. ' 1行目\n2行目 ' change → trim 後 '1行目\n2行目' が state / DOM 両方 (中間改行維持)
//
//   F. downloadReport state-as-SoT
//     F1. state.report.sei = '山田', DOM = '別人' → 帳票に '山田' (state 優先)
//     F2. state.report.fuku = '佐藤', DOM = '別人' → 帳票に '佐藤' (state 優先)
//     F3. state.report.note = '備考メモ', DOM = '別ノート' → 帳票に '備考メモ' (state 優先)
//     F4. state.report.note = '' → 帳票に '特になし' (表示時 fallback、state は '' のまま)
//     F5. state.report.sei = '' → 帳票の正セルが空（fallback なし）
//     F6. state.report.fuku = '' → 帳票の副セルが空
//     F7. note の改行 → 帳票で <br> に変換される
//     F8. XSS: note に <script> → escapeHtml で raw として出ない
//     F9. escapeHtml(sei) / (fuku) / (note) は維持
//     F10. ファイル名や title / organizer / place / prize / date 出力は破壊しない
//
//   G. 既存機能 非影響
//     G1. title / organizer / place / prize の出力が壊れていない
//     G2. date / start / end の出力が壊れていない
//     G3. 「担当役員」「正」「副」「申し送り事項」セル構造維持

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_006c.js <html>');
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
assert(/function\s+normalizeReportSei\s*\(/.test(htmlSrc), 'A1-1 normalizeReportSei() 関数定義あり');
assert(/function\s+normalizeReportFuku\s*\(/.test(htmlSrc), 'A1-2 normalizeReportFuku() 関数定義あり');
assert(/function\s+normalizeReportNote\s*\(/.test(htmlSrc), 'A1-3 normalizeReportNote() 関数定義あり');

// A2
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportSei\s*\(\s*s\.report\.sei\s*\)/.test(body),
    'A2-1 normalizeState が normalizeReportSei(s.report.sei) を呼ぶ');
  assert(/normalizeReportFuku\s*\(\s*s\.report\.fuku\s*\)/.test(body),
    'A2-2 normalizeState が normalizeReportFuku(s.report.fuku) を呼ぶ');
  assert(/normalizeReportNote\s*\(\s*s\.report\.note\s*\)/.test(body),
    'A2-3 normalizeState が normalizeReportNote(s.report.note) を呼ぶ');
}

// A3
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportSei\s*\(\s*state\.report\.sei\s*\)/.test(body),
    'A3-1 populateReportFields が normalizeReportSei(state.report.sei) を呼ぶ');
  assert(/normalizeReportFuku\s*\(\s*state\.report\.fuku\s*\)/.test(body),
    'A3-2 populateReportFields が normalizeReportFuku(state.report.fuku) を呼ぶ');
  assert(/normalizeReportNote\s*\(\s*state\.report\.note\s*\)/.test(body),
    'A3-3 populateReportFields が normalizeReportNote(state.report.note) を呼ぶ');
  assert(/state\.report\.sei\s*=\s*normalizedSei/.test(body),
    'A3-4 populateReportFields が state.report.sei に書き戻す');
  assert(/state\.report\.fuku\s*=\s*normalizedFuku/.test(body),
    'A3-5 populateReportFields が state.report.fuku に書き戻す');
  assert(/state\.report\.note\s*=\s*normalizedNote/.test(body),
    'A3-6 populateReportFields が state.report.note に書き戻す');
}

// A4
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]sei['"]/.test(body), 'A4-1 updateReportFieldFromElement で key === "sei" 分岐がある');
  assert(/key\s*===\s*['"]fuku['"]/.test(body), 'A4-2 updateReportFieldFromElement で key === "fuku" 分岐がある');
  assert(/key\s*===\s*['"]note['"]/.test(body), 'A4-3 updateReportFieldFromElement で key === "note" 分岐がある');
  assert(/normalizeReportSei\s*\(\s*el\.value\s*\)/.test(body), 'A4-4 sei 分岐で normalizeReportSei(el.value) を使う');
  assert(/normalizeReportFuku\s*\(\s*el\.value\s*\)/.test(body), 'A4-5 fuku 分岐で normalizeReportFuku(el.value) を使う');
  assert(/normalizeReportNote\s*\(\s*el\.value\s*\)/.test(body), 'A4-6 note 分岐で normalizeReportNote(el.value) を使う');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedSei/.test(body),
    'A4-7 sei 分岐で change 時のみ DOM 書き戻し (IME-safe)');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedFuku/.test(body),
    'A4-8 fuku 分岐で change 時のみ DOM 書き戻し');
  assert(/eventType\s*===\s*['"]change['"]\s*\)\s*el\.value\s*=\s*normalizedNote/.test(body),
    'A4-9 note 分岐で change 時のみ DOM 書き戻し');
}

// A5
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportSei\s*\(\s*state\.report\s*&&\s*state\.report\.sei\s*\)/.test(body),
    'A5-1 downloadReport が normalizeReportSei(state.report && state.report.sei) を呼ぶ');
  assert(/normalizeReportFuku\s*\(\s*state\.report\s*&&\s*state\.report\.fuku\s*\)/.test(body),
    'A5-2 downloadReport が normalizeReportFuku(state.report && state.report.fuku) を呼ぶ');
  assert(/normalizeReportNote\s*\(\s*state\.report\s*&&\s*state\.report\.note\s*\)/.test(body),
    'A5-3 downloadReport が normalizeReportNote(state.report && state.report.note) を呼ぶ');
  // DOM 直読み撤去
  assert(!/getElementById\(['"]rep-sei['"]\)\.value/.test(body),
    'A5-4 downloadReport が #rep-sei.value を直読みしていない');
  assert(!/getElementById\(['"]rep-fuku['"]\)\.value/.test(body),
    'A5-5 downloadReport が #rep-fuku.value を直読みしていない');
  assert(!/getElementById\(['"]rep-note['"]\)\.value/.test(body),
    'A5-6 downloadReport が #rep-note.value を直読みしていない');
}

// A6: note 表示 fallback は state には保存せず downloadReport 内
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  // noteRaw||'特になし' の形で表示時 fallback がある
  assert(/noteRaw\s*\|\|\s*['"]特になし['"]/.test(body),
    'A6-1 downloadReport 内に `noteRaw || "特になし"` の表示時 fallback がある');
  // escapeHtml + split('\n').join('<br>') が維持されている
  assert(/escapeHtml\s*\(\s*note\s*\)\.split\(['"]\\n['"]\)\.join\(['"]<br>['"]\)/.test(body),
    'A6-2 downloadReport が escapeHtml(note).split("\\n").join("<br>") で改行表示を維持');
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
       normalizeReportSei: normalizeReportSei,
       normalizeReportFuku: normalizeReportFuku,
       normalizeReportNote: normalizeReportNote,
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
// SECTION B: helper 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  // sei
  assertEq(env.normalizeReportSei('山田'), '山田', 'B1-1 sei 通常文字列');
  assertEq(env.normalizeReportSei(' 山田 '), '山田', 'B1-2 sei trim');
  assertEq(env.normalizeReportSei(''), '', 'B1-3 sei "" → ""');
  assertEq(env.normalizeReportSei('   '), '', 'B1-4 sei 空白のみ → ""');
  assertEq(env.normalizeReportSei(null), '', 'B1-5 sei null → ""');
  assertEq(env.normalizeReportSei(undefined), '', 'B1-6 sei undefined → ""');
  assertEq(env.normalizeReportSei(123), '', 'B1-7 sei 数値 → ""');
  assertEq(env.normalizeReportSei({}), '', 'B1-8 sei object → ""');
  // fuku
  assertEq(env.normalizeReportFuku('佐藤'), '佐藤', 'B4-1 fuku 通常文字列');
  assertEq(env.normalizeReportFuku(' 佐藤 '), '佐藤', 'B4-2 fuku trim');
  assertEq(env.normalizeReportFuku(''), '', 'B4-3 fuku "" → ""');
  assertEq(env.normalizeReportFuku(null), '', 'B4-4 fuku null → ""');
  assertEq(env.normalizeReportFuku(456), '', 'B4-5 fuku 数値 → ""');
  // note
  assertEq(env.normalizeReportNote('1行目\n2行目'), '1行目\n2行目', 'B5 note 中間改行維持');
  assertEq(env.normalizeReportNote(' 1行目\n2行目 '), '1行目\n2行目', 'B6 note 両端 trim、中間改行維持');
  assertEq(env.normalizeReportNote(''), '', 'B7-1 note "" → ""');
  assertEq(env.normalizeReportNote('   '), '', 'B7-2 note 空白のみ → ""');
  assertEq(env.normalizeReportNote(null), '', 'B7-3 note null → ""');
  assertEq(env.normalizeReportNote(undefined), '', 'B7-4 note undefined → ""');
  assertEq(env.normalizeReportNote(789), '', 'B7-5 note 数値 → ""');
  assertEq(env.normalizeReportNote({}), '', 'B7-6 note object → ""');
  assertEq(env.normalizeReportNote('\n\n'), '', 'B8 note 改行のみ → "" (空白扱い)');
  assertEq(env.normalizeReportNote('1行目\n2行目\n3行目'), '1行目\n2行目\n3行目', 'B9 note 複数改行維持');
}

// ============================================================
// SECTION C: normalizeState 旧データ互換
// ============================================================
{
  const env = loadEnv(targetPath);
  // C1: 欠落
  const c1 = env.normalizeState({report:{date:'',place:'労政会館',start:'',end:''}});
  assertEq(c1.report.sei, '', 'C1-1 sei 欠落 → ""');
  assertEq(c1.report.fuku, '', 'C1-2 fuku 欠落 → ""');
  assertEq(c1.report.note, '', 'C1-3 note 欠落 → ""');
  // C2: null
  const c2 = env.normalizeState({report:{sei:null,fuku:null,note:null}});
  assertEq(c2.report.sei, '', 'C2-1 sei=null → ""');
  assertEq(c2.report.fuku, '', 'C2-2 fuku=null → ""');
  assertEq(c2.report.note, '', 'C2-3 note=null → ""');
  // C3: 数値
  const c3 = env.normalizeState({report:{sei:123,fuku:456,note:789}});
  assertEq(c3.report.sei, '', 'C3-1 sei=数値 → ""');
  assertEq(c3.report.fuku, '', 'C3-2 fuku=数値 → ""');
  assertEq(c3.report.note, '', 'C3-3 note=数値 → ""');
  // C4: object
  const c4 = env.normalizeState({report:{sei:{},fuku:[],note:{a:1}}});
  assertEq(c4.report.sei, '', 'C4-1 sei=object → ""');
  assertEq(c4.report.fuku, '', 'C4-2 fuku=array → ""');
  assertEq(c4.report.note, '', 'C4-3 note=object → ""');
  // C5: trim
  const c5 = env.normalizeState({report:{sei:'  山田  ',fuku:'  佐藤  '}});
  assertEq(c5.report.sei, '山田', 'C5-1 sei "  山田  " → "山田"');
  assertEq(c5.report.fuku, '佐藤', 'C5-2 fuku "  佐藤  " → "佐藤"');
  // C6: note 中間改行維持
  const c6 = env.normalizeState({report:{note:' 1行目\n2行目 '}});
  assertEq(c6.report.note, '1行目\n2行目', 'C6 note " 1行目\\n2行目 " → "1行目\\n2行目"');
  // C7: 空白のみ
  const c7 = env.normalizeState({report:{sei:'   ',fuku:'　　',note:'   '}});
  assertEq(c7.report.sei, '', 'C7-1 sei 空白 → ""');
  assertEq(c7.report.fuku, '', 'C7-2 fuku 全角空白 → ""');
  assertEq(c7.report.note, '', 'C7-3 note 空白 → ""');
  // C8: 他フィールド非影響
  const c8 = env.normalizeState({report:{date:'2026-05-18',start:'13:00',end:'17:00',place:'公民館',title:'特別大会',organizer:'記念連盟',prize:3000,sei:'山田',fuku:'佐藤',note:'メモ'}});
  assertEq(c8.report.date, '2026-05-18', 'C8-1 date 不変');
  assertEq(c8.report.start, '13:00', 'C8-2 start 不変');
  assertEq(c8.report.end, '17:00', 'C8-3 end 不変');
  assertEq(c8.report.place, '公民館', 'C8-4 place 不変');
  assertEq(c8.report.title, '特別大会', 'C8-5 title 不変');
  assertEq(c8.report.organizer, '記念連盟', 'C8-6 organizer 不変');
  assertEq(c8.report.prize, 3000, 'C8-7 prize 不変');
  assertEq(c8.report.sei, '山田', 'C8-8 sei 復元');
  assertEq(c8.report.fuku, '佐藤', 'C8-9 fuku 復元');
  assertEq(c8.report.note, 'メモ', 'C8-10 note 復元');
}

// ============================================================
// SECTION D: populateReportFields の state 同期
// ============================================================

// D1: sei 通常値
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({sei:'山田'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-sei').value, '山田', 'D1-1 sei → DOM');
  assertEq(env._getState().report.sei, '山田', 'D1-2 sei → state 同期');
}

// D2: fuku 通常値
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({fuku:'佐藤'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-fuku').value, '佐藤', 'D2-1 fuku → DOM');
  assertEq(env._getState().report.fuku, '佐藤', 'D2-2 fuku → state 同期');
}

// D3: note 改行込み
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({note:'1行目\n2行目'}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-note').value, '1行目\n2行目', 'D3-1 note 改行込み → DOM');
  assertEq(env._getState().report.note, '1行目\n2行目', 'D3-2 note 改行込み → state 同期');
}

// D4: sei 旧 raw → migration
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({sei:' 山田 '}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-sei').value, '山田', 'D4-1 sei " 山田 " → DOM "山田" (trim)');
  assertEq(env._getState().report.sei, '山田', 'D4-2 sei " 山田 " → state "山田" (trim migration)');
}

// D5: note '' → DOM '' (「特になし」を入れない)
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({note:''}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-note').value, '', 'D5-1 note "" → #rep-note.value ""');
  assertEq(env._getState().report.note, '', 'D5-2 state.report.note も ""');
  // textarea には '特になし' が入っていないこと
  assert(env._ctx.document.getElementById('rep-note').value.indexOf('特になし') < 0,
    'D5-3 #rep-note.value に "特になし" は書き戻さない (placeholder のみで案内)');
}

// D6: note 空白のみ → ''
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({note:'   '}));
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-note').value, '', 'D6-1 note "   " → DOM ""');
  assertEq(env._getState().report.note, '', 'D6-2 note "   " → state ""');
}

// D7: 他フィールド不変
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
  assertEq(s.report.date, '2026-05-18', 'D7-1 date 不変');
  assertEq(s.report.start, '13:00', 'D7-2 start 不変');
  assertEq(s.report.end, '17:00', 'D7-3 end 不変');
  assertEq(s.report.place, '公民館', 'D7-4 place 不変');
  assertEq(s.report.title, '特別大会', 'D7-5 title 不変');
  assertEq(s.report.organizer, '記念連盟', 'D7-6 organizer 不変');
  assertEq(s.report.prize, 3000, 'D7-7 prize 不変');
}

// ============================================================
// SECTION E: updateReportFieldFromElement (IME-safe)
// ============================================================

// E1: rep-sei change
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-sei');
  el.value = '田中';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E1-pre rep-sei change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.sei, '田中', 'E1-1 change で state.report.sei 更新');
  assertEq(el.value, '田中', 'E1-2 DOM 同期書き戻し');
}

// E2: rep-sei input → state のみ
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-sei');
  el.value = '山田';
  const fns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.sei, '山田', 'E2-1 input で state 更新');
  assertEq(el.value, '山田', 'E2-2 input 時は DOM 書き戻しなし (IME-safe)');
}

// E3: rep-fuku change
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-fuku');
  el.value = '高橋';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E3-pre rep-fuku change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.fuku, '高橋', 'E3-1 change で state.report.fuku 更新');
  assertEq(el.value, '高橋', 'E3-2 DOM 同期');
}

// E4: rep-fuku input → state のみ
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-fuku');
  el.value = '佐藤';
  const fns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.fuku, '佐藤', 'E4-1 input で state 更新');
  assertEq(el.value, '佐藤', 'E4-2 input 時は DOM 書き戻しなし');
}

// E5: rep-note change 改行維持
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-note');
  el.value = '1行目\n2行目';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'E5-pre rep-note change handler bind あり');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.note, '1行目\n2行目', 'E5-1 change で state.note 更新 (改行維持)');
  assertEq(el.value, '1行目\n2行目', 'E5-2 DOM 同期 (改行維持)');
}

// E6: rep-note input → state のみ
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-note');
  el.value = '途中入力';
  const fns = (el._handlers && el._handlers['input']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.note, '途中入力', 'E6-1 input で state 更新');
  assertEq(el.value, '途中入力', 'E6-2 input 時は DOM 書き戻しなし (IME-safe; textarea)');
}

// E7: 空欄 change → state も DOM も ''（「特になし」を書き戻さない）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({sei:'山田',fuku:'佐藤',note:'メモ'}));
  seedReportDom(env._ctx, {sei:'山田',fuku:'佐藤',note:'メモ'});
  env.bindReportEvents();
  ['sei','fuku','note'].forEach(function(k){
    const el = env._ctx.document.getElementById('rep-'+k);
    el.value = '';
    const fns = (el._handlers && el._handlers['change']) || [];
    for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  });
  assertEq(env._getState().report.sei, '', 'E7-1 空欄 change → state.sei ""');
  assertEq(env._getState().report.fuku, '', 'E7-2 空欄 change → state.fuku ""');
  assertEq(env._getState().report.note, '', 'E7-3 空欄 change → state.note ""');
  assertEq(env._ctx.document.getElementById('rep-sei').value, '', 'E7-4 空欄 change → DOM sei ""');
  assertEq(env._ctx.document.getElementById('rep-fuku').value, '', 'E7-5 空欄 change → DOM fuku ""');
  assertEq(env._ctx.document.getElementById('rep-note').value, '', 'E7-6 空欄 change → DOM note ""');
  // 「特になし」が書き戻されていないこと
  assert(env._ctx.document.getElementById('rep-note').value.indexOf('特になし') < 0,
    'E7-7 #rep-note.value に "特になし" を書き戻さない');
}

// E8: ' 山田 ' change → trim 同期
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-sei');
  el.value = ' 山田 ';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.sei, '山田', 'E8-1 " 山田 " change → state.sei trim');
  assertEq(el.value, '山田', 'E8-2 " 山田 " change → DOM trim');
}

// E9: ' 1行目\n2行目 ' change → trim、中間改行維持
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState());
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-note');
  el.value = ' 1行目\n2行目 ';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.note, '1行目\n2行目', 'E9-1 " 1行目\\n2行目 " change → state trim (中間改行維持)');
  assertEq(el.value, '1行目\n2行目', 'E9-2 " 1行目\\n2行目 " change → DOM trim (中間改行維持)');
}

// ============================================================
// SECTION F: downloadReport state-as-SoT
// ============================================================

// F1: sei state ≠ DOM → state 優先
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',sei:'山田'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',sei:'別人',fuku:'',note:'',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('山田') >= 0, 'F1-1 state.sei="山田" が帳票に出る (state 優先)');
  assert(html.indexOf('別人') < 0, 'F1-2 DOM の "別人" は出ない');
}

// F2: fuku state ≠ DOM → state 優先
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',fuku:'佐藤'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',sei:'',fuku:'別人',note:'',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('佐藤') >= 0, 'F2-1 state.fuku="佐藤" が帳票に出る (state 優先)');
  assert(html.indexOf('別人') < 0, 'F2-2 DOM の "別人" は出ない');
}

// F3: note state ≠ DOM → state 優先
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',note:'備考メモ'}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',sei:'',fuku:'',note:'別ノート',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('備考メモ') >= 0, 'F3-1 state.note="備考メモ" が帳票に出る (state 優先)');
  assert(html.indexOf('別ノート') < 0, 'F3-2 DOM の "別ノート" は出ない');
}

// F4: note '' → 帳票に '特になし' 表示時 fallback、state は '' のまま
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',note:''}));
  seedReportDom(env._ctx, {date:'2026-05-18',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',place:'労政会館',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特になし') >= 0, 'F4-1 state.note="" → 帳票に「特になし」表示時 fallback');
  // state には '特になし' が保存されていない
  assertEq(env._getState().report.note, '', 'F4-2 state.report.note は "" のまま（"特になし" を保存しない）');
}

// F5: sei '' → 帳票の正セルは空（fallback なし）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',sei:''}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // 「正」セルの直後（td タグ閉じ後）に escapeHtml('') が入る → 空セル
  // パターン: <td ...>正</td><td ...></td>
  assert(/>正<\/td>\s*<td[^>]*><\/td>/.test(html), 'F5 state.sei="" → 帳票の「正」セルは空（"特になし" など fallback なし）');
}

// F6: fuku '' → 副セルが空
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',fuku:''}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(/>副<\/td>\s*<td[^>]*><\/td>/.test(html), 'F6 state.fuku="" → 帳票の「副」セルは空');
}

// F7: note 改行 → 帳票で <br>
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',note:'1行目\n2行目\n3行目'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('1行目<br>2行目<br>3行目') >= 0,
    'F7 note 改行 → 帳票で "<br>" に変換される');
}

// F8: XSS - note に <script>
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',note:'<script>alert(1)</script>'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // raw <script> として帳票に混入しないこと（note 由来部分）
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(html),
    'F8-1 note の <script> が escapeHtml された形で出る');
  // raw '<script>alert(1)' で始まる部分は body 中の note セル内に存在しないこと（id 等を除外して最も
  //   厳密には '申し送り事項' 行内をスキャン）
  const noteRowMatch = html.match(/申し送り事項[\s\S]*?<\/table>/);
  assert(noteRowMatch && noteRowMatch[0].indexOf('<script>alert(1)</script>') < 0,
    'F8-2 note セル内に raw <script> が混入しない');
}

// F9: escapeHtml が sei / fuku / note 全てに通っている（XSS 各 field）
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',sei:'<b>seiraw</b>',fuku:'<i>fukuraw</i>',note:'<u>noteraw</u>'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<b>seiraw</b>') < 0 && html.indexOf('&lt;b&gt;seiraw&lt;/b&gt;') >= 0,
    'F9-1 sei が escapeHtml される');
  assert(html.indexOf('<i>fukuraw</i>') < 0 && html.indexOf('&lt;i&gt;fukuraw&lt;/i&gt;') >= 0,
    'F9-2 fuku が escapeHtml される');
  assert(html.indexOf('<u>noteraw</u>') < 0 && html.indexOf('&lt;u&gt;noteraw&lt;/u&gt;') >= 0,
    'F9-3 note が escapeHtml される');
}

// F10: 他フィールド出力は破壊しない
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',organizer:'記念連盟',place:'公民館',prize:5000,sei:'山田',fuku:'佐藤',note:'メモ'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特別大会報告書') >= 0, 'F10-1 title 出力不変 (004)');
  assert(html.indexOf('記念連盟') >= 0, 'F10-2 organizer 出力不変 (005)');
  assert(html.indexOf('公民館') >= 0, 'F10-3 place 出力不変 (006A)');
  assert(html.indexOf('賞金：▲5,000円') >= 0, 'F10-4 prize 出力不変 (003A)');
  assert(html.indexOf('2026年5月18日') >= 0, 'F10-5 date 和暦変換不変 (006B)');
  assert(html.indexOf('13時00分') >= 0, 'F10-6 start 和暦変換不変 (006B)');
  assert(html.indexOf('17時00分') >= 0, 'F10-7 end 和暦変換不変 (006B)');
  assert(/<title>特別大会_20260518_報告書<\/title>/.test(html), 'F10-8 ファイル名不変 (004/006B)');
}

// ============================================================
// SECTION G: 既存機能 非影響 / 構造維持
// ============================================================

// G1: title / organizer / place / prize 出力不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',title:'特別大会',organizer:'記念連盟',place:'公民館',prize:5000,sei:'山田',fuku:'佐藤',note:'メモ'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('特別大会報告書') >= 0, 'G1-1 title');
  assert(html.indexOf('記念連盟') >= 0, 'G1-2 organizer');
  assert(html.indexOf('公民館') >= 0, 'G1-3 place');
  assert(html.indexOf('賞金：▲5,000円') >= 0, 'G1-4 prize');
}

// G2: date / start / end 不変
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'09:05',end:'17:30',sei:'',fuku:'',note:''}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0, 'G2-1 date 和暦変換');
  assert(html.indexOf('9時05分') >= 0, 'G2-2 start 和暦変換');
  assert(html.indexOf('17時30分') >= 0, 'G2-3 end 和暦変換');
}

// G3: 構造維持
{
  const env = loadEnv(targetPath);
  env._setState(makeBaseState({date:'2026-05-18',start:'13:00',end:'17:00',sei:'山田',fuku:'佐藤',note:'なし'}));
  seedReportDom(env._ctx);
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('担当役員') >= 0, 'G3-1 「担当役員」行が維持');
  assert(html.indexOf('>正<') >= 0, 'G3-2 「正」セル維持');
  assert(html.indexOf('>副<') >= 0, 'G3-3 「副」セル維持');
  assert(html.indexOf('申し送り事項') >= 0, 'G3-4 「申し送り事項」行が維持');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-006C テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
