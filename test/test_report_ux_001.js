#!/usr/bin/env node
// REPORT-UX-001: tournament report date/time input UX
//
// 観点:
//   構造検査 (S):
//     S1.  #rep-date が type="date"
//     S2.  #rep-start が type="time" + step="300"
//     S3.  #rep-end が type="time" + step="300"
//     S4.  #rep-time-warning が DOM に存在
//     S5.  ensureReportDateTimeDefaults() / formatLocalDateForInput() /
//          formatJapaneseDateFromYmd() / formatJapaneseTimeFromHhmm() /
//          checkReportTimeOrder() helper が定義されている
//     S6.  populateReportFields が ensureReportDateTimeDefaults() を呼ぶ
//     S7.  bindReportEvents が start/end の change event に checkReportTimeOrder を bind
//     S8.  downloadReport が formatJapaneseDateFromYmd / formatJapaneseTimeFromHhmm を使う
//     S9.  toISOString().slice(0,10) のような UTC 依存日付生成が存在しない（REPORT-UX-001 で
//          formatLocalDateForInput を導入したため、本ファイル内で UTC 依存が混入していないこと）
//     S10. getTournamentDateFromReport が YYYY-MM-DD 形式も受け付ける
//
//   振る舞いテスト (B):
//     B1.  formatLocalDateForInput: local date を YYYY-MM-DD で返す（UTC 換算しない）
//     B2.  formatJapaneseDateFromYmd: '2026-05-18' → '2026年5月18日'
//     B3.  formatJapaneseTimeFromHhmm: '13:00' → '13時00分'
//     B4.  ensureReportDateTimeDefaults: 未入力時に today / 13:00 / 17:00 をセット
//     B5.  ensureReportDateTimeDefaults: 既存値ありの場合は上書きしない（冪等）
//     B6.  ensureReportDateTimeDefaults: state.report.date 等も同期更新
//     B7.  populateReportFields: 保存済み state.report.date があれば優先（defaults で上書きしない）
//     B8.  checkReportTimeOrder: end <= start で警告表示
//     B9.  checkReportTimeOrder: end > start で警告が消える
//     B10. checkReportTimeOrder: start / end のいずれかが空なら警告非表示
//     B11. getTournamentDateFromReport: 新 ISO 形式 'YYYY-MM-DD' を受け付ける
//     B12. getTournamentDateFromReport: 旧形式 'YYYY年MM月DD日' も依然受け付ける（互換）

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_001.js <html>');
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
// SECTION S: 構造検査
// ============================================================

// S1: #rep-date type="date"
assert(/<input[^>]*type="date"[^>]*id="rep-date"|<input[^>]*id="rep-date"[^>]*type="date"/.test(htmlSrc),
  'S1 #rep-date が type="date"');

// S2: #rep-start type="time" + step="300"
{
  const m=htmlSrc.match(/<input[^>]*id="rep-start"[^>]*>/);
  assert(m !== null, 'S2-0 #rep-start input 抽出可');
  const tag=m?m[0]:'';
  assert(/type="time"/.test(tag), 'S2-1 #rep-start が type="time"');
  assert(/step="300"/.test(tag), 'S2-2 #rep-start が step="300"');
}

// S3: #rep-end type="time" + step="300"
{
  const m=htmlSrc.match(/<input[^>]*id="rep-end"[^>]*>/);
  assert(m !== null, 'S3-0 #rep-end input 抽出可');
  const tag=m?m[0]:'';
  assert(/type="time"/.test(tag), 'S3-1 #rep-end が type="time"');
  assert(/step="300"/.test(tag), 'S3-2 #rep-end が step="300"');
}

// S4: #rep-time-warning
assert(/id="rep-time-warning"/.test(htmlSrc), 'S4 #rep-time-warning が DOM に存在');

// S5: helper 群の定義
{
  assert(/function\s+formatLocalDateForInput\s*\(/.test(htmlSrc),
    'S5-1 formatLocalDateForInput() 定義');
  assert(/function\s+formatJapaneseDateFromYmd\s*\(/.test(htmlSrc),
    'S5-2 formatJapaneseDateFromYmd() 定義');
  assert(/function\s+formatJapaneseTimeFromHhmm\s*\(/.test(htmlSrc),
    'S5-3 formatJapaneseTimeFromHhmm() 定義');
  assert(/function\s+ensureReportDateTimeDefaults\s*\(/.test(htmlSrc),
    'S5-4 ensureReportDateTimeDefaults() 定義');
  assert(/function\s+checkReportTimeOrder\s*\(/.test(htmlSrc),
    'S5-5 checkReportTimeOrder() 定義');
}

// S6: populateReportFields が ensureReportDateTimeDefaults を呼ぶ
{
  const m=htmlSrc.match(/function populateReportFields\([\s\S]*?\n\}\n/);
  assert(m !== null, 'S6-0 populateReportFields 関数本体抽出可');
  const body=m?m[0]:'';
  assert(/ensureReportDateTimeDefaults\s*\(\s*\)/.test(body),
    'S6 populateReportFields が ensureReportDateTimeDefaults() を呼ぶ');
}

// S7: bindReportEvents が start/end に checkReportTimeOrder を bind
{
  const m=htmlSrc.match(/function bindReportEvents\([\s\S]*?\n\}\n/);
  assert(m !== null, 'S7-0 bindReportEvents 関数本体抽出可');
  const body=m?m[0]:'';
  assert(/checkReportTimeOrder/.test(body),
    'S7 bindReportEvents が checkReportTimeOrder を呼ぶ');
}

// S8: downloadReport が Japanese 変換 helper を使う
{
  const m=htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
  assert(m !== null, 'S8-0 downloadReport 関数本体抽出可');
  const body=m?m[0]:'';
  assert(/formatJapaneseDateFromYmd\s*\(/.test(body),
    'S8-1 downloadReport が formatJapaneseDateFromYmd() を使う');
  assert(/formatJapaneseTimeFromHhmm\s*\(/.test(body),
    'S8-2 downloadReport が formatJapaneseTimeFromHhmm() を使う');
}

// S9: UTC 依存 toISOString().slice(0,10) パターンが REPORT-UX-001 関連 helper には混入していない
//   formatLocalDateForInput body と ensureReportDateTimeDefaults body を見る。
{
  const m1=htmlSrc.match(/function formatLocalDateForInput\([\s\S]*?\n\}\n/);
  const b1=m1?m1[0]:'';
  assert(/toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/.test(b1) === false,
    'S9-1 formatLocalDateForInput body に toISOString().slice(0,10) UTC 依存が無い');
  const m2=htmlSrc.match(/function ensureReportDateTimeDefaults\([\s\S]*?\n\}\n/);
  const b2=m2?m2[0]:'';
  assert(/toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/.test(b2) === false,
    'S9-2 ensureReportDateTimeDefaults body に toISOString().slice(0,10) UTC 依存が無い');
}

// S10: getTournamentDateFromReport が YYYY-MM-DD 形式も受け付ける（structural）
{
  const m=htmlSrc.match(/function getTournamentDateFromReport\([\s\S]*?\n\}\n/);
  assert(m !== null, 'S10-0 getTournamentDateFromReport 関数本体抽出可');
  const body=m?m[0]:'';
  // YYYY-MM-DD 形式 match の存在
  assert(/\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\$|YYYY-MM-DD/.test(body),
    'S10 getTournamentDateFromReport に YYYY-MM-DD 形式 regex / 言及がある');
}

// ============================================================
// SECTION B: 振る舞いテスト (loadEnv 経由)
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
      addEventListener(evt,fn){
        if(!handlers[evt])handlers[evt]=[];
        handlers[evt].push(fn);
      },
      removeEventListener(){},
      dispatchEvent(){},
      click(){
        const fns=(handlers['click']||[]).slice();
        for(let i=0;i<fns.length;i++)fns[i].call(elem,{type:'click'});
      },
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
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       formatLocalDateForInput: formatLocalDateForInput,
       formatJapaneseDateFromYmd: formatJapaneseDateFromYmd,
       formatJapaneseTimeFromHhmm: formatJapaneseTimeFromHhmm,
       ensureReportDateTimeDefaults: ensureReportDateTimeDefaults,
       checkReportTimeOrder: checkReportTimeOrder,
       populateReportFields: populateReportFields,
       getTournamentDateFromReport: getTournamentDateFromReport,
       todayYmd: todayYmd,
       _setState: function(s){state=s;},
       _getState: function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){}, {createObjectURL(){return 'blob:m';}, revokeObjectURL(){}},
    {log(){}, error(){}, warn(){}},
    Promise
  );
  api._ctx = ctx;
  return api;
}

// B1: formatLocalDateForInput
{
  const env = loadEnv(targetPath);
  // 2026-05-18 23:59 JST 相当の Date object
  const d = new Date(2026,4,18,23,59);  // month is 0-indexed (4 = May)
  assertEq(env.formatLocalDateForInput(d), '2026-05-18',
    'B1-1 formatLocalDateForInput(2026-05-18 23:59) = "2026-05-18" (local date、UTC 換算しない)');
  assertEq(env.formatLocalDateForInput(new Date(2026,0,1)), '2026-01-01',
    'B1-2 formatLocalDateForInput(2026-01-01) = "2026-01-01" (zero-padding)');
  assertEq(env.formatLocalDateForInput(new Date(2026,8,9)), '2026-09-09',
    'B1-3 formatLocalDateForInput(2026-09-09) = "2026-09-09" (1桁月日 zero-padding)');
  assertEq(env.formatLocalDateForInput(null), '',
    'B1-4 formatLocalDateForInput(null) = "" (invalid input)');
  assertEq(env.formatLocalDateForInput(new Date('invalid')), '',
    'B1-5 formatLocalDateForInput(invalid Date) = "" (NaN guard)');
}

// B2: formatJapaneseDateFromYmd
{
  const env = loadEnv(targetPath);
  assertEq(env.formatJapaneseDateFromYmd('2026-05-18'), '2026年5月18日',
    'B2-1 "2026-05-18" → "2026年5月18日"');
  assertEq(env.formatJapaneseDateFromYmd('2026-01-01'), '2026年1月1日',
    'B2-2 "2026-01-01" → "2026年1月1日" (zero-pad 除去)');
  assertEq(env.formatJapaneseDateFromYmd('2026-12-31'), '2026年12月31日',
    'B2-3 "2026-12-31" → "2026年12月31日"');
  assertEq(env.formatJapaneseDateFromYmd('invalid'), 'invalid',
    'B2-4 不正値はそのまま返す');
  assertEq(env.formatJapaneseDateFromYmd(''), '',
    'B2-5 空文字は空文字');
}

// B3: formatJapaneseTimeFromHhmm
{
  const env = loadEnv(targetPath);
  assertEq(env.formatJapaneseTimeFromHhmm('13:00'), '13時00分',
    'B3-1 "13:00" → "13時00分"');
  assertEq(env.formatJapaneseTimeFromHhmm('09:30'), '9時30分',
    'B3-2 "09:30" → "9時30分" (時の zero-pad 除去、分は保持)');
  assertEq(env.formatJapaneseTimeFromHhmm('17:00'), '17時00分',
    'B3-3 "17:00" → "17時00分"');
  assertEq(env.formatJapaneseTimeFromHhmm(''), '',
    'B3-4 空文字は空文字');
}

// B4-B6: ensureReportDateTimeDefaults
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}
  });
  // input 雛形（getElementById で auto-create される空 value）
  env.ensureReportDateTimeDefaults();
  const dateEl=env._ctx.document._elements['rep-date'];
  const startEl=env._ctx.document._elements['rep-start'];
  const endEl=env._ctx.document._elements['rep-end'];
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dateEl.value), 'B4-1 rep-date が YYYY-MM-DD 形式で初期化');
  assertEq(startEl.value, '13:00', 'B4-2 rep-start = "13:00" で初期化');
  assertEq(endEl.value, '17:00', 'B4-3 rep-end = "17:00" で初期化');
  assertEq(env._getState().report.start, '13:00', 'B6-1 state.report.start が "13:00" に同期');
  assertEq(env._getState().report.end, '17:00', 'B6-2 state.report.end が "17:00" に同期');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(env._getState().report.date),
    'B6-3 state.report.date が YYYY-MM-DD 形式で同期');
  // 今日の日付であること（local）
  assertEq(dateEl.value, env.formatLocalDateForInput(new Date()),
    'B4-4 rep-date が local today と一致');
}

// B5: 既存値ありの場合は上書きしない（冪等）
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-04-12',place:'労政会館',start:'12:45',end:'16:20',sei:'',fuku:'',note:''}
  });
  // input.value を保存済み値で先に埋める（populateReportFields 相当）
  env._ctx.document._elements['rep-date']=env._ctx.document._elements['rep-date']||{value:''};
  env._ctx.document._elements['rep-start']=env._ctx.document._elements['rep-start']||{value:''};
  env._ctx.document._elements['rep-end']=env._ctx.document._elements['rep-end']||{value:''};
  // getElementById を経由したことになる
  env._ctx.document.getElementById('rep-date').value='2026-04-12';
  env._ctx.document.getElementById('rep-start').value='12:45';
  env._ctx.document.getElementById('rep-end').value='16:20';
  env.ensureReportDateTimeDefaults();
  assertEq(env._ctx.document.getElementById('rep-date').value, '2026-04-12',
    'B5-1 既存 rep-date は上書きされない');
  assertEq(env._ctx.document.getElementById('rep-start').value, '12:45',
    'B5-2 既存 rep-start は上書きされない');
  assertEq(env._ctx.document.getElementById('rep-end').value, '16:20',
    'B5-3 既存 rep-end は上書きされない');

  // 2 回呼んでも冪等
  env.ensureReportDateTimeDefaults();
  env.ensureReportDateTimeDefaults();
  assertEq(env._ctx.document.getElementById('rep-date').value, '2026-04-12',
    'B5-4 ensureReportDateTimeDefaults 3 回呼出後も既存値維持（冪等）');
}

// B7: populateReportFields が保存済み state.report を優先
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2025-12-31',place:'公民館',start:'10:00',end:'15:00',sei:'山田',fuku:'佐藤',note:'特になし'}
  });
  env.populateReportFields();
  assertEq(env._ctx.document.getElementById('rep-date').value, '2025-12-31',
    'B7-1 保存済み rep-date が優先される');
  assertEq(env._ctx.document.getElementById('rep-start').value, '10:00',
    'B7-2 保存済み rep-start が優先される');
  assertEq(env._ctx.document.getElementById('rep-end').value, '15:00',
    'B7-3 保存済み rep-end が優先される');
  assertEq(env._ctx.document.getElementById('rep-place').value, '公民館',
    'B7-4 保存済み rep-place も維持');
}

// B8-B10: checkReportTimeOrder
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  // 雛形
  env._ctx.document.getElementById('rep-start').value='';
  env._ctx.document.getElementById('rep-end').value='';
  env._ctx.document.getElementById('rep-time-warning');

  // B8: end <= start → 警告
  env._ctx.document.getElementById('rep-start').value='15:00';
  env._ctx.document.getElementById('rep-end').value='13:00';
  env.checkReportTimeOrder();
  const w=env._ctx.document.getElementById('rep-time-warning');
  assert(w.textContent.indexOf('終了時間が開始時間以前') >= 0,
    'B8-1 end < start → 警告文言が出る');
  assertEq(w.style.display, 'block', 'B8-2 display:block');
  // end == start も警告
  env._ctx.document.getElementById('rep-end').value='15:00';
  env.checkReportTimeOrder();
  assertEq(w.style.display, 'block', 'B8-3 end == start でも警告');

  // B9: end > start → 警告消える
  env._ctx.document.getElementById('rep-end').value='17:00';
  env.checkReportTimeOrder();
  assertEq(w.style.display, 'none', 'B9-1 end > start → 警告非表示');
  assertEq(w.textContent, '', 'B9-2 警告 textContent クリア');

  // B10: start / end 空 → 警告非表示
  env._ctx.document.getElementById('rep-start').value='';
  env._ctx.document.getElementById('rep-end').value='17:00';
  env.checkReportTimeOrder();
  assertEq(w.style.display, 'none', 'B10-1 start 空 → 警告非表示');
  env._ctx.document.getElementById('rep-start').value='13:00';
  env._ctx.document.getElementById('rep-end').value='';
  env.checkReportTimeOrder();
  assertEq(w.style.display, 'none', 'B10-2 end 空 → 警告非表示');
}

// B11-B12: getTournamentDateFromReport の両形式互換
{
  const env = loadEnv(targetPath);
  // B11: 新 ISO 形式
  assertEq(env.getTournamentDateFromReport({date:'2026-05-18'}), '2026-05-18',
    'B11 新 ISO 形式 "2026-05-18" → "2026-05-18"');
  // B12: 旧形式
  assertEq(env.getTournamentDateFromReport({date:'2026年5月18日'}), '2026-05-18',
    'B12-1 旧形式 "2026年5月18日" → "2026-05-18" (zero-pad)');
  assertEq(env.getTournamentDateFromReport({date:'2026年12月31日'}), '2026-12-31',
    'B12-2 旧形式 "2026年12月31日" → "2026-12-31"');
  // 不正値は今日
  const t=env.getTournamentDateFromReport({date:''});
  assert(/^\d{4}-\d{2}-\d{2}$/.test(t),
    'B12-3 空文字 → 今日 (todayYmd fallback)');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
