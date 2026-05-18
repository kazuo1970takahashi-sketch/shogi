#!/usr/bin/env node
// REPORT-UX-003A: configurable prize field
//
// 観点:
//   A. 構造検査
//     A1. #rep-prize input が存在し、type=number / min=0 / step=100 / placeholder=7000
//     A2. state リテラル / resetAll の report 初期値に prize:7000 が含まれる
//     A3. normalizeState が prize の復元を行う
//     A4. populateReportFields が rep-prize を扱う
//     A5. bindReportEvents の field list に 'prize' が含まれる
//     A6. updateReportFieldFromElement で key==='prize' のとき normalizeReportPrize 経由
//     A7. downloadReport が normalizeReportPrize 経由で prize を取得し、ハードコード 7000 は撤去
//
//   B. 旧データ互換 (normalizeReportPrize / normalizeState)
//     B1. prize 欠落 → 7000 fallback
//     B2. prize=5000 → 5000
//     B3. prize=0 → 0 （有効値、フォールバックされない）
//     B4. prize=-1 → 7000
//     B5. prize='abc' → 7000
//     B6. prize=null → 7000
//     B7. prize=NaN → 7000
//     B8. prize=Infinity → 7000
//     B9. prize='5000' → 5000 （文字列数値も解釈）
//     B10. prize='0' → 0
//     B11. prize='' → 7000
//     B12. prize=undefined → 7000
//
//   C. populate / bind
//     C1. populateReportFields で rep-prize に 7000 が表示される（既定）
//     C2. state.report.prize=5000 なら 5000 が表示される
//     C3. state.report.prize=0 なら '0' が表示される（0 は有効）
//     C4. rep-prize change で state.report.prize が数値として更新される
//     C5. rep-prize input イベントでも更新される
//     C6. 不正値入力 ('abc') で state.report.prize は 7000 に正規化される
//     C7. 0 入力で state.report.prize=0 として保存される
//
//   D. downloadReport
//     D1. prize=7000 のとき HTML に「7,000円」が出る
//     D2. prize=5000 のとき HTML に「5,000円」が出る
//     D3. prize=0 のとき HTML に「0円」が出る
//     D4. balance が prize に応じて再計算される
//     D5. 旧固定文字列「2,000円＋1,000円＋500円」は撤去されている
//     D6. 旧 'prize=7000' literal は撤去されている
//
//   E. 安全性 / 既存挙動温存
//     E1. date/time/place/sei/fuku/note の挙動は壊れない
//     E2. prize が数値以外でも HTML escape を通る（prizeDisplay の escapeHtml）
//     E3. resetAll 後に rep-prize が 7000 で表示される

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_003.js <html>');
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

// A1: #rep-prize input
{
  const m=htmlSrc.match(/<input[^>]*id="rep-prize"[^>]*>/);
  assert(m !== null, 'A1-0 #rep-prize input が DOM に存在する');
  const tag=m?m[0]:'';
  assert(/type="number"/.test(tag), 'A1-1 #rep-prize が type="number"');
  assert(/min="0"/.test(tag), 'A1-2 #rep-prize が min="0"');
  assert(/step="100"/.test(tag), 'A1-3 #rep-prize が step="100"');
  assert(/placeholder="7000"/.test(tag), 'A1-4 #rep-prize が placeholder="7000"');
}

// A2: schema literals
{
  // `report:{...,prize:7000}` 形式と `state.report={...,prize:7000}` 形式を両方カウント
  // （初期 state / normalizeState base / resetAll / 3 箇所の defensive `if(!state.report)` 等）。
  const matches = htmlSrc.match(/\{\s*date\s*:\s*['"][\s\S]*?prize\s*:\s*7000\s*\}/g) || [];
  assert(matches.length >= 4,
    'A2 schema リテラル （state 初期化 / normalizeState base / resetAll / defensive）に prize:7000 が含まれる（>=4 箇所、実測 '+matches.length+'）');
}

// A3: normalizeState restores prize
{
  const m = htmlSrc.match(/function normalizeState\(raw\)[\s\S]*?\n\}\n/);
  assert(m !== null, 'A3-0 normalizeState を抽出できる');
  const body = m ? m[0] : '';
  assert(/s\.report\s*,\s*['"]prize['"]/.test(body) || /s\.report,'prize'\)/.test(body) || /hasOwnProperty\.call\(s\.report,'prize'\)/.test(body),
    'A3 normalizeState が s.report に prize を含むかを判定する');
  assert(/normalizeReportPrize\s*\(\s*s\.report\.prize\s*\)/.test(body),
    'A3-2 normalizeState が normalizeReportPrize(s.report.prize) で復元');
}

// A4: populateReportFields handles rep-prize
{
  const m = htmlSrc.match(/function populateReportFields[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/getElementById\(['"]rep-prize['"]\)/.test(body) || /rep-prize/.test(body),
    'A4-1 populateReportFields が rep-prize を参照');
  assert(/normalizeReportPrize\s*\(/.test(body),
    'A4-2 populateReportFields が normalizeReportPrize を呼ぶ');
}

// A5: bindReportEvents field list includes 'prize'
{
  const m = htmlSrc.match(/function bindReportEvents\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/'date'\s*,\s*'place'\s*,\s*'start'\s*,\s*'end'\s*,\s*'sei'\s*,\s*'fuku'\s*,\s*'note'\s*,\s*'prize'/.test(body),
    "A5 bindReportEvents の forEach field list に 'prize' が含まれる");
}

// A6: updateReportFieldFromElement coerces prize
{
  const m = htmlSrc.match(/function updateReportFieldFromElement[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/key\s*===\s*['"]prize['"]/.test(body),
    'A6-1 updateReportFieldFromElement で key === "prize" 分岐がある');
  assert(/normalizeReportPrize\s*\(\s*el\.value\s*\)/.test(body),
    'A6-2 prize 分岐で normalizeReportPrize(el.value) を使う');
}

// A7: downloadReport uses normalizeReportPrize and no hardcoded prize=7000
{
  const m = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(/normalizeReportPrize\s*\(/.test(body),
    'A7-1 downloadReport が normalizeReportPrize() を呼ぶ');
  assert(/var\s+prize\s*=\s*7000\s*;/.test(body) === false,
    'A7-2 旧 var prize=7000 ハードコード literal は撤去されている');
  assert(body.indexOf('2,000円＋1,000円＋500円') === -1,
    'A7-3 旧固定内訳「2,000円＋1,000円＋500円」literal は撤去されている');
}

// ============================================================
// SECTION B/C/D/E: 振る舞いテスト (loadEnv 経由)
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
       normalizeReportPrize: normalizeReportPrize,
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

// ===== SECTION B: normalizeReportPrize / normalizeState =====

// B1: prize 欠落 → 7000
{
  const env = loadEnv(targetPath);
  const normalized = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}});
  assertEq(normalized.report.prize, 7000, 'B1 prize 欠落の旧 report → 7000 fallback');
}

// B2: prize=5000 → 5000
{
  const env = loadEnv(targetPath);
  const normalized = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',prize:5000}});
  assertEq(normalized.report.prize, 5000, 'B2 prize=5000 → 5000');
}

// B3: prize=0 → 0
{
  const env = loadEnv(targetPath);
  const normalized = env.normalizeState({report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',prize:0}});
  assertEq(normalized.report.prize, 0, 'B3 prize=0 → 0（有効値、fallback されない）');
}

// B4-B8: 不正値 → 7000
{
  const env = loadEnv(targetPath);
  [
    {input:-1, label:'B4 prize=-1 → 7000'},
    {input:'abc', label:'B5 prize="abc" → 7000'},
    {input:null, label:'B6 prize=null → 7000'},
    {input:NaN, label:'B7 prize=NaN → 7000'},
    {input:Infinity, label:'B8 prize=Infinity → 7000'},
    {input:-Infinity, label:'B8b prize=-Infinity → 7000'}
  ].forEach(function(c){
    assertEq(env.normalizeReportPrize(c.input), 7000, c.label);
  });
}

// B9-B12: 文字列・空・undefined
{
  const env = loadEnv(targetPath);
  assertEq(env.normalizeReportPrize('5000'), 5000, 'B9 prize="5000" → 5000 (文字列数値も解釈)');
  assertEq(env.normalizeReportPrize('0'), 0, 'B10 prize="0" → 0');
  assertEq(env.normalizeReportPrize(''), 7000, 'B11 prize="" → 7000');
  assertEq(env.normalizeReportPrize(undefined), 7000, 'B12 prize=undefined → 7000');
}

// ===== SECTION C: populate / bind =====

function seedReportDom(ctx, repValues){
  repValues = repValues || {};
  ['date','place','start','end','sei','fuku','note','prize'].forEach(function(k){
    const el = ctx.document.getElementById('rep-'+k);
    if(typeof el === 'object') el.value = (k in repValues) ? String(repValues[k]) : '';
  });
}

// C1: populate で 7000 既定表示
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000}
  });
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-prize').value, '7000', 'C1 既定 prize=7000 が rep-prize に表示');
}

// C2: state.report.prize=5000 → '5000' 表示
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:5000}
  });
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-prize').value, '5000', 'C2 prize=5000 → "5000" 表示');
}

// C3: state.report.prize=0 → '0' 表示
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:0}
  });
  seedReportDom(env._ctx);
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-prize').value, '0', 'C3 prize=0 → "0" 表示（fallback されない）');
}

// C4: change event で state.report.prize が数値として更新
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-prize');
  el.value = '3000';
  const fns = (el._handlers && el._handlers['change']) || [];
  assert(fns.length >= 1, 'C4-pre rep-prize change handler が bind されている');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.prize, 3000, 'C4 change で state.report.prize=3000 (number)');
}

// C5: input event でも更新
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-prize');
  el.value = '8500';
  const fns = (el._handlers && el._handlers['input']) || [];
  assert(fns.length >= 1, 'C5-pre rep-prize input handler が bind されている');
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'input', target:el});
  assertEq(env._getState().report.prize, 8500, 'C5 input で state.report.prize=8500');
}

// C6: 不正値入力 'abc' で 7000 に正規化
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:5000}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-prize');
  el.value = 'abc';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.prize, 7000, 'C6 不正値 "abc" 入力で state.report.prize=7000 に正規化');
}

// C7: 0 入力で 0 として保存
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000}
  });
  seedReportDom(env._ctx);
  env.bindReportEvents();
  const el = env._ctx.document.getElementById('rep-prize');
  el.value = '0';
  const fns = (el._handlers && el._handlers['change']) || [];
  for(let i=0;i<fns.length;i++) fns[i].call(el, {type:'change', target:el});
  assertEq(env._getState().report.prize, 0, 'C7 "0" 入力で state.report.prize=0 (fallback されない)');
}

// ===== SECTION D: downloadReport =====

function makeStateForDownload(prize){
  return {
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',prize:prize}
  };
}

// D1: prize=7000 → '7,000円' 表示
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload(7000));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:7000});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('7,000円') >= 0, 'D1 prize=7000 → HTML に「7,000円」が出る');
  assert(html.indexOf('賞金：▲7,000円') >= 0, 'D1-b 賞金行が「賞金：▲7,000円」');
}

// D2: prize=5000 → '5,000円'
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload(5000));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:5000});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('5,000円') >= 0, 'D2 prize=5000 → HTML に「5,000円」が出る');
  assert(html.indexOf('賞金：▲5,000円') >= 0, 'D2-b 賞金行が「賞金：▲5,000円」');
  assert(html.indexOf('▲7,000円') < 0, 'D2-no 旧固定「▲7,000円」は出ない');
}

// D3: prize=0 → '0円' (valid)
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload(0));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:0});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('賞金：▲0円') >= 0, 'D3 prize=0 → HTML に「賞金：▲0円」が出る（fallback されない）');
  assert(html.indexOf('▲7,000円') < 0, 'D3-no 旧固定「▲7,000円」は出ない');
}

// D4: balance が prize に応じて再計算
{
  const env = loadEnv(targetPath);
  // 参加費合計を生成するために、A クラスに 2 名（一般支部員 500 円 × 2 = 1000 円）
  const players = [
    {id:'a1',name:'x',cls:'A',member:'member',grade:'ippan'},
    {id:'a2',name:'y',cls:'A',member:'member',grade:'ippan'}
  ];
  env._setState({
    players:{A:players,B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',prize:500}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:500});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // total = 500*2 = 1000円, prize = 500円, balance = 1000-500 = 500円
  assert(/会費合計：1,000円/.test(html), 'D4-1 会費合計：1,000円');
  assert(/賞金：▲500円/.test(html), 'D4-2 賞金：▲500円（prize=500 に同期）');
  assert(/収支：500円/.test(html), 'D4-3 収支：500円（balance=total-prize=500 に再計算）');
}

// D5/D6: 旧 literal 撤去（structural）— SECTION A7 でカバー済み（drBody スキャン）
// ここでは生成 HTML 側を確認
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload(5000));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:5000});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2,000円＋1,000円＋500円') === -1,
    'D5 生成 HTML に旧固定内訳「2,000円＋1,000円＋500円」が出ない');
}

// ===== SECTION E: 安全性 / 既存挙動温存 =====

// E1: 他フィールドの挙動温存（date 日本語変換が引き続き動く）
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload(7000));
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'09:05',end:'17:30',prize:7000});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0, 'E1-1 date 和暦変換が壊れない');
  assert(html.indexOf('9時05分') >= 0, 'E1-2 start 和暦変換が壊れない');
  assert(html.indexOf('17時30分') >= 0, 'E1-3 end 和暦変換が壊れない');
  assert(html.indexOf('労政会館') >= 0, 'E1-4 place が出力される');
}

// E2: prize が数値しか入らないため XSS は構造的に発生しないが、normalizeReportPrize 経由で
//   不正値が 7000 に丸められることで XSS 文字列が prize 経由で出力されないことを確認
{
  const env = loadEnv(targetPath);
  // 仮に state.report.prize に文字列 '<script>alert(1)</script>' が入っていたとしても
  // normalizeReportPrize が 7000 に正規化し、HTML 出力は数値起源になる
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:'',prize:'<script>alert(1)</script>'}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',prize:7000});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<script>alert(1)</script>') < 0,
    'E2 prize 経由の XSS payload は HTML に raw として出ない（normalizeReportPrize で 7000 に丸められる）');
  assert(html.indexOf('賞金：▲7,000円') >= 0,
    'E2-b XSS 入力は 7000 fallback として出力される');
}

// E3: resetAll 後に rep-prize が 7000 で表示される
{
  const env = loadEnv(targetPath);
  env._setState(makeStateForDownload(12345));
  seedReportDom(env._ctx, {prize:12345});
  // resetAll は confirm() を経るので mock confirm:true で進む
  env.resetAll();
  const after = env._ctx.document.getElementById('rep-prize');
  assertEq(after.value, '7000', 'E3 resetAll 後に rep-prize が "7000" で表示される');
  assertEq(env._getState().report.prize, 7000, 'E3-b resetAll 後 state.report.prize=7000');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-003A テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
