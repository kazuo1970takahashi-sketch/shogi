#!/usr/bin/env node
// REPORT-UX-002: classes-driven downloadReport for C+ classes
//
// 観点:
//   構造検査 (S):
//     S1.  downloadReport 内に state.players.A.length + state.players.B.length の
//          A/B 固定合計 literal が残っていない
//     S2.  downloadReport 内に getTopPlayers('A') / getTopPlayers('B') の固定呼出が残っていない
//     S3.  downloadReport 内に A級優勝 / A級準優勝 / A級3位 / B級優勝 / B級準優勝 / B級3位 の
//          固定 6 行 rankRow 呼出 literal が残っていない
//     S4.  downloadReport が getRegistrationClassList() を呼ぶ
//     S5.  buildClassRankRows() helper が downloadReport 内に定義されている
//     S6.  rankRow() が label に escapeHtml を通している（XSS 安全性強化）
//     S7.  既存 downloadReport の主要構造（formatJapaneseDateFromYmd / Blob /
//          window.open / 報告書タイトル「沼津支部月例将棋大会報告書」）は残っている
//
//   振る舞いテスト (B):
//     B1.  A/B 2 クラスのみ大会で downloadReport を呼ぶと、生成 HTML に
//          「Aクラス優勝」「Aクラス準優勝」「Aクラス3位」「Bクラス優勝」「Bクラス準優勝」「Bクラス3位」
//          が含まれる（label が classes-driven 化されることで A級→Aクラスへ変化、3 行/クラス × 2）
//     B2.  A/B/C 3 クラス大会で C クラスの優勝/準優勝/3位 行が追加で含まれる
//     B3.  A/B/C 3 クラス大会で「参加人数」セルに A+B+C 合計が出る
//     B4.  state.classes[*].name をカスタム名にした場合（例: name='上級'）、ラベルが
//          「上級優勝」等になる
//     B5.  state.classes[*].name 内の HTML 特殊文字（<script>等）が escapeHtml される
//
//   安全性 / 互換 (C):
//     C1.  既存 date/time input 化 (REPORT-UX-001) の出力（formatJapaneseDateFromYmd / HHMM
//          → 和暦風）が壊れていない
//     C2.  プレイヤー名 (top players の name) が引き続き escapeHtml されている
//     C3.  従来の固定要素（タイトル「沼津支部月例将棋大会報告書」、FAX 番号、賞金 7000 円、
//          提出文言）は本 PR では touch しない（後続 REPORT-UX-003+ 持ち越し）

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_report_ux_002.js <html>');
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

// downloadReport 関数本体を抽出
const drMatch = htmlSrc.match(/function downloadReport\(\)[\s\S]*?\n\}\n/);
assert(drMatch !== null, 'S0 downloadReport 関数本体を抽出できる');
const drBody = drMatch ? drMatch[0] : '';

// ============================================================
// SECTION S: 構造検査 — A/B 固定 literal が解消されている
// ============================================================

// S1: allCount A/B 固定合計
assert(drBody.indexOf('state.players.A.length+state.players.B.length') === -1,
  'S1-1 downloadReport 本体に state.players.A.length+state.players.B.length 固定が無い');
assert(drBody.indexOf('state.players.A.length + state.players.B.length') === -1,
  'S1-2 downloadReport 本体に同 literal (空白あり) が無い');

// S2: getTopPlayers('A') / ('B') 固定呼出
assert(drBody.indexOf("getTopPlayers('A')") === -1,
  "S2-1 downloadReport 本体に getTopPlayers('A') 固定呼出が無い");
assert(drBody.indexOf("getTopPlayers('B')") === -1,
  "S2-2 downloadReport 本体に getTopPlayers('B') 固定呼出が無い");

// S3: A級/B級 固定 6 行
[
  "rankRow('A級優勝'",
  "rankRow('A級準優勝'",
  "rankRow('A級3位'",
  "rankRow('B級優勝'",
  "rankRow('B級準優勝'",
  "rankRow('B級3位'",
].forEach(function(pat){
  assert(drBody.indexOf(pat) === -1,
    'S3 固定 rankRow 呼出 ' + pat + ' が残っていない');
});

// S4: getRegistrationClassList 呼出
assert(/getRegistrationClassList\s*\(\s*\)/.test(drBody),
  'S4 downloadReport が getRegistrationClassList() を呼ぶ');

// S5: buildClassRankRows helper
assert(/function\s+buildClassRankRows\s*\(/.test(drBody),
  'S5 downloadReport 内に buildClassRankRows() helper が定義されている');

// S6: rankRow() の label に escapeHtml
{
  const rrMatch = drBody.match(/function rankRow\([\s\S]*?\n  \}/);
  assert(rrMatch !== null, 'S6-0 rankRow 関数本体を抽出できる');
  const rrBody = rrMatch ? rrMatch[0] : '';
  assert(/escapeHtml\s*\(\s*label\s*\)/.test(rrBody),
    'S6-1 rankRow が label を escapeHtml で escape する（XSS 安全性強化）');
  assert(/escapeHtml\s*\(\s*name\s*\)/.test(rrBody),
    'S6-2 rankRow が player name を引き続き escapeHtml で escape する');
}

// S7: 既存主要構造の温存
assert(drBody.indexOf('formatJapaneseDateFromYmd') >= 0,
  'S7-1 REPORT-UX-001 の formatJapaneseDateFromYmd 呼出が残っている');
assert(drBody.indexOf('formatJapaneseTimeFromHhmm') >= 0,
  'S7-2 REPORT-UX-001 の formatJapaneseTimeFromHhmm 呼出が残っている');
assert(drBody.indexOf('new Blob([html]') >= 0,
  'S7-3 Blob 経由の別ウィンドウ open が残っている');
assert(drBody.indexOf('window.open(url') >= 0,
  'S7-4 window.open(url, _blank) が残っている');
// REPORT-UX-004 で本 defer は解消済み。title は state.report.title / normalizeReportTitle 経由に。
//   旧 002 時点の '沼津支部月例将棋大会報告書' ハードコード literal は撤去された。
assert(drBody.indexOf("'沼津支部月例将棋大会報告書'")=== -1 && drBody.indexOf('"沼津支部月例将棋大会報告書"') === -1,
  'S7-5 報告書タイトル literal は REPORT-UX-004 で撤去済み（state.report.title 経由）');
assert(/normalizeReportTitle\s*\(/.test(drBody),
  'S7-5b 004: downloadReport が normalizeReportTitle() を呼ぶ');
// REPORT-UX-003A で本 defer は解消済み。prize は state.report.prize / normalizeReportPrize 経由に。
//   旧 002 時点の `var prize=7000` ハードコード literal は撤去された。
assert(/prize\s*=\s*7000/.test(drBody) === false,
  'S7-6 賞金額 prize=7000 ハードコード literal は REPORT-UX-003A で撤去済み');
assert(/normalizeReportPrize\s*\(/.test(drBody),
  'S7-6b 003A: downloadReport が normalizeReportPrize() を呼ぶ');
// REPORT-UX-007A で本 defer は解消済み。officeName は state.report 経由に。
//   旧 002 時点の 'FAX（943-9443）' / '沼津支部事務局' ハードコード literal は撤去された。
//   FAX削除対応（Codex 追加 Must Fix）: FAX 番号は実在しないため報告書から削除。
//   downloadReport 本体に FAX literal も normalizeReportFax 呼出も残っていないことを確認する。
assert(drBody.indexOf('FAX（943-9443）') === -1,
  'S7-7 FAX 番号 literal は downloadReport 本体に無い（FAX削除）');
assert(!/normalizeReportFax\s*\(/.test(drBody),
  'S7-7b downloadReport は FAX を出力しないため normalizeReportFax() を呼ばない（FAX削除）');
assert(drBody.indexOf("'沼津支部事務局'") === -1 && drBody.indexOf('"沼津支部事務局"') === -1,
  'S7-7c 事務局名 literal は REPORT-UX-007A で撤去済み（state.report.officeName 経由）');
assert(/normalizeReportOfficeName\s*\(/.test(drBody),
  'S7-7d 007A: downloadReport が normalizeReportOfficeName() を呼ぶ');

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
  // Blob モック: 渡された html string を blob.__src として記録
  const Blob = function(arr, opts){
    this.size = (arr && arr[0] && arr[0].length) || 0;
    this.type = (opts && opts.type) || '';
    this.__src = (arr && arr[0]) || '';
  };
  // window.open モック
  const winOpens = [];
  let lastBlobSrc = '';
  const URLMock = {
    createObjectURL: function(blob){
      lastBlobSrc = (blob && blob.__src) || '';
      return 'blob:mock';
    },
    revokeObjectURL: function(){}
  };
  const ctxWindow = ctx.window;
  ctxWindow.open = function(url, target){
    winOpens.push({url:url, target:target});
    return {focus:function(){}, addEventListener:function(){}, print:function(){}, close:function(){}};
  };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       downloadReport: downloadReport,
       getTopPlayers: getTopPlayers,
       getRegistrationClassList: getRegistrationClassList,
       calcFinal: calcFinal,
       calcTotal: calcTotal,
       isSafeClassId: isSafeClassId,
       getReportClassLabel: getReportClassLabel,
       _setState: function(s){state=s;},
       _getState: function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctxWindow, ctx.localStorage, ctx.crypto,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, Blob, URLMock,
    {log(){}, error(){}, warn(){}},
    Promise
  );
  api._ctx = ctx;
  api._winOpens = winOpens;
  api._getLastBlobSrc = function(){return lastBlobSrc;};
  return api;
}

function makePlayer(id,name,cls,opts){
  opts=opts||{};
  return {id:id, name:name, cls:cls, member:opts.member||'member', grade:opts.grade||'ippan', entry_no:opts.entry_no||1};
}

// 報告書フォーム用 DOM 雛形を ctx に注入
function seedReportDom(ctx, repValues){
  repValues = repValues || {};
  ['date','place','start','end','sei','fuku','note'].forEach(function(k){
    const el = ctx.document.getElementById('rep-'+k);
    el.value = (k in repValues) ? repValues[k] : '';
  });
}

// Round-robin 3 ラウンド (4 人/クラス) を生成
function makeRoundRobin3(p){
  // 4 人で 3 ラウンドの round-robin。p[0] が全勝、p[1] が 2 勝、p[2] が 1 勝、p[3] が 0 勝
  return [
    [{p1:p[0].id,p2:p[1].id,winner:p[0].id,lastModifiedBy:'auto'},{p1:p[2].id,p2:p[3].id,winner:p[2].id,lastModifiedBy:'auto'}],
    [{p1:p[0].id,p2:p[2].id,winner:p[0].id,lastModifiedBy:'auto'},{p1:p[1].id,p2:p[3].id,winner:p[1].id,lastModifiedBy:'auto'}],
    [{p1:p[0].id,p2:p[3].id,winner:p[0].id,lastModifiedBy:'auto'},{p1:p[1].id,p2:p[2].id,winner:p[1].id,lastModifiedBy:'auto'}]
  ];
}

// ===== B1: A/B 2 クラスのみで A級/B級 6 行が出る（Codex Should Fix: 級表記回復） =====
{
  const env = loadEnv(targetPath);
  const pA = [
    makePlayer('a1','田中','A'), makePlayer('a2','佐藤','A'),
    makePlayer('a3','鈴木','A'), makePlayer('a4','高橋','A')
  ];
  const pB = [
    makePlayer('b1','伊藤','B'), makePlayer('b2','渡辺','B'),
    makePlayer('b3','山本','B'), makePlayer('b4','中村','B')
  ];
  env._setState({
    players:{A:pA, B:pB},
    rounds:3,
    pairings:{A:[],B:[]},
    results:{A:makeRoundRobin3(pA), B:makeRoundRobin3(pB)},
    started:true,
    classes:[
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.length > 0, 'B1-0 生成 HTML を取得できる');
  // Codex Should Fix: 既存 A/B 帳票表記の「級」を回復（Aクラス → A級）
  ['A級優勝','A級準優勝','A級3位','B級優勝','B級準優勝','B級3位'].forEach(function(lbl){
    assert(html.indexOf(lbl) >= 0, 'B1 ラベル「'+lbl+'」が生成 HTML に含まれる（級表記回復）');
  });
  // 旧 PR #147 初版の「Aクラス優勝」「Bクラス優勝」は出ない
  assert(html.indexOf('Aクラス優勝') < 0, 'B1-no-class A 「Aクラス優勝」は出ない（A級優勝に統合）');
  assert(html.indexOf('Bクラス優勝') < 0, 'B1-no-class B 「Bクラス優勝」は出ない（B級優勝に統合）');
  // A クラス優勝者は a1 (田中)、B クラス優勝者は b1 (伊藤)
  assert(html.indexOf('田中') >= 0, 'B1-A 優勝者「田中」が含まれる');
  assert(html.indexOf('伊藤') >= 0, 'B1-B 優勝者「伊藤」が含まれる');
}

// ===== B2: A/B/C 3 クラスで C 級 3 行が追加される（A/B/C 全て「級」表記） =====
{
  const env = loadEnv(targetPath);
  const pA = [makePlayer('a1','A1','A'),makePlayer('a2','A2','A'),makePlayer('a3','A3','A'),makePlayer('a4','A4','A')];
  const pB = [makePlayer('b1','B1','B'),makePlayer('b2','B2','B'),makePlayer('b3','B3','B'),makePlayer('b4','B4','B')];
  const pC = [makePlayer('c1','C太郎','C'),makePlayer('c2','C次郎','C'),makePlayer('c3','C三郎','C'),makePlayer('c4','C四郎','C')];
  env._setState({
    players:{A:pA, B:pB, C:pC},
    rounds:3,
    pairings:{A:[],B:[],C:[]},
    results:{A:makeRoundRobin3(pA), B:makeRoundRobin3(pB), C:makeRoundRobin3(pC)},
    started:true,
    classes:[
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true},
      {id:'C',name:'Cクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  ['A級優勝','A級準優勝','A級3位',
   'B級優勝','B級準優勝','B級3位',
   'C級優勝','C級準優勝','C級3位'].forEach(function(lbl){
    assert(html.indexOf(lbl) >= 0, 'B2 ラベル「'+lbl+'」が含まれる（C 級含む 9 行）');
  });
  // C クラス優勝者は c1 (C太郎)
  assert(html.indexOf('C太郎') >= 0, 'B2 C 級優勝者「C太郎」が含まれる');
}

// ===== B3: A/B/C 3 クラスで参加人数が A+B+C =====
{
  const env = loadEnv(targetPath);
  const pA = [makePlayer('a1','x','A'),makePlayer('a2','x','A')];                  // 2
  const pB = [makePlayer('b1','x','B'),makePlayer('b2','x','B'),makePlayer('b3','x','B')];  // 3
  const pC = [makePlayer('c1','x','C'),makePlayer('c2','x','C'),makePlayer('c3','x','C'),makePlayer('c4','x','C'),makePlayer('c5','x','C')];  // 5
  env._setState({
    players:{A:pA, B:pB, C:pC},
    rounds:3,
    pairings:{A:[],B:[],C:[]},
    results:{A:[], B:[], C:[]},
    started:true,
    classes:[
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true},
      {id:'C',name:'Cクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // 「参加人数」セルに「10名」 (2+3+5)
  assert(/参加人数[\s\S]*?10名/.test(html),
    'B3 参加人数セルに 10名 (A+B+C 合計) が出る');
}

// ===== B4: state.classes[*].name カスタム（'上級'）が label に反映 =====
{
  const env = loadEnv(targetPath);
  const pA = [makePlayer('a1','上級王','A'),makePlayer('a2','x','A'),makePlayer('a3','x','A'),makePlayer('a4','x','A')];
  env._setState({
    players:{A:pA, B:[]},
    rounds:3,
    pairings:{A:[],B:[]},
    results:{A:makeRoundRobin3(pA), B:[]},
    started:true,
    classes:[
      {id:'A',name:'上級',started:true},   // カスタム name（既定 Aクラス を override）
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  ['上級優勝','上級準優勝','上級3位'].forEach(function(lbl){
    assert(html.indexOf(lbl) >= 0, 'B4 カスタム classes.name が反映され「'+lbl+'」が含まれる');
  });
  // カスタム name は「級」変換しない → 「A級優勝」は出ない
  assert(html.indexOf('A級優勝') < 0, 'B4 カスタム name 時、A 級表記は使われない（'+'上級'+'がそのまま）');
  assert(html.indexOf('Aクラス優勝') < 0, 'B4 旧 PR 初版「Aクラス優勝」も出ない');
}

// ===== B5: state.classes[*].name の HTML 特殊文字が escapeHtml される =====
{
  const env = loadEnv(targetPath);
  const pA = [makePlayer('a1','x','A'),makePlayer('a2','x','A'),makePlayer('a3','x','A'),makePlayer('a4','x','A')];
  env._setState({
    players:{A:pA, B:[]},
    rounds:3,
    pairings:{A:[],B:[]},
    results:{A:makeRoundRobin3(pA), B:[]},
    started:true,
    classes:[
      {id:'A',name:'<script>alert(1)</script>',started:true},  // 危険な name
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // 危険な name は escape されている (raw <script> として出ない)
  assert(html.indexOf('<script>alert(1)</script>優勝') < 0,
    'B5-1 危険な classes.name の <script> が raw として出力されない');
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;優勝/.test(html),
    'B5-2 危険な classes.name が escapeHtml されて出力される');
}

// ============================================================
// SECTION K: getReportClassLabel 単体 + 帳票統合（Codex Should Fix）
// ============================================================

// K1: getReportClassLabel helper の定義
assert(/function\s+getReportClassLabel\s*\(/.test(htmlSrc),
  'K1-1 getReportClassLabel() 関数が定義されている');
// buildClassRankRows が getReportClassLabel を経由する
{
  const m = htmlSrc.match(/function buildClassRankRows\([\s\S]*?\n  \}/);
  const body = m ? m[0] : '';
  assert(/getReportClassLabel\s*\(/.test(body),
    'K1-2 buildClassRankRows が getReportClassLabel() を呼ぶ');
}

// K2: 英字1文字+クラス → 英字+級（既定変換）
{
  const env = loadEnv(targetPath);
  ['S','A','B','C','D','E','F','Z'].forEach(function(letter){
    assertEq(env.getReportClassLabel({id:letter,name:letter+'クラス'}), letter+'級',
      'K2 '+letter+'クラス → '+letter+'級');
  });
}

// K3: 英字1文字+級 はそのまま（二重変換しない）
{
  const env = loadEnv(targetPath);
  ['S','A','B','C','Z'].forEach(function(letter){
    assertEq(env.getReportClassLabel({id:letter,name:letter+'級'}), letter+'級',
      'K3 既に '+letter+'級 → そのまま（二重変換しない）');
  });
}

// K4: カスタム名はそのまま尊重
{
  const env = loadEnv(targetPath);
  ['小学生','初心者','一般','上級','子ども大会','中学生','女性','シニア','プロ'].forEach(function(custom){
    assertEq(env.getReportClassLabel({id:'X',name:custom}), custom,
      'K4 カスタム名「'+custom+'」はそのまま尊重');
  });
}

// K5: 空文字 / 不正値 / fallback
{
  const env = loadEnv(targetPath);
  assertEq(env.getReportClassLabel(null), '', 'K5-1 null → ""');
  assertEq(env.getReportClassLabel(undefined), '', 'K5-2 undefined → ""');
  assertEq(env.getReportClassLabel({id:'A',name:''}), 'Aクラス',
    'K5-3 name 空 + id=A → fallback "Aクラス"');
  assertEq(env.getReportClassLabel({id:'X'}), 'Xクラス',
    'K5-4 name 欠落 + id=X → fallback "Xクラス"');
  assertEq(env.getReportClassLabel({id:'',name:''}), '',
    'K5-5 id/name 両方空 → ""');
}

// K6: 2 文字以上の英字（AB クラス等）は変換しない（規則 1 は 1 文字限定）
{
  const env = loadEnv(targetPath);
  // 2文字以上はカスタム扱い（そのまま）
  assertEq(env.getReportClassLabel({id:'X',name:'ABクラス'}), 'ABクラス',
    'K6 「ABクラス」は変換せずそのまま（規則 1 は英字 1 文字限定）');
}

// K7: 小学生クラスでの帳票統合（カスタム名が「小学生優勝」等になる）
{
  const env = loadEnv(targetPath);
  const pA = [makePlayer('a1','花子','A'),makePlayer('a2','x','A'),makePlayer('a3','x','A'),makePlayer('a4','x','A')];
  env._setState({
    players:{A:pA,B:[]},
    rounds:3,
    pairings:{A:[],B:[]},
    results:{A:makeRoundRobin3(pA),B:[]},
    started:true,
    classes:[
      {id:'A',name:'小学生',started:true},
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  ['小学生優勝','小学生準優勝','小学生3位'].forEach(function(lbl){
    assert(html.indexOf(lbl) >= 0, 'K7 「'+lbl+'」が含まれる（カスタム名尊重）');
  });
  // 「A級優勝」が出ないこと（小学生に置換されているので）
  assert(html.indexOf('A級優勝') < 0, 'K7-no-A 「A級優勝」は出ない（カスタム名「小学生」が優先）');
}

// K8: S クラスのある大会で「S 級優勝」帳票
{
  const env = loadEnv(targetPath);
  const pS = [makePlayer('s1','王者','S'),makePlayer('s2','x','S'),makePlayer('s3','x','S'),makePlayer('s4','x','S')];
  const pA = [makePlayer('a1','x','A'),makePlayer('a2','x','A'),makePlayer('a3','x','A'),makePlayer('a4','x','A')];
  env._setState({
    players:{S:pS, A:pA, B:[]},
    rounds:3,
    pairings:{S:[],A:[],B:[]},
    results:{S:makeRoundRobin3(pS),A:makeRoundRobin3(pA),B:[]},
    started:true,
    classes:[
      {id:'S',name:'Sクラス',started:true},
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  ['S級優勝','S級準優勝','S級3位'].forEach(function(lbl){
    assert(html.indexOf(lbl) >= 0, 'K8-S 「'+lbl+'」が含まれる（S クラス → S 級）');
  });
  ['A級優勝','A級準優勝','A級3位'].forEach(function(lbl){
    assert(html.indexOf(lbl) >= 0, 'K8-A 「'+lbl+'」も含まれる（A クラス → A 級）');
  });
  assert(html.indexOf('王者') >= 0, 'K8 S 級優勝者「王者」が含まれる');
}

// K9: E/F 等 A〜D 以外の英字クラスでも変換が効く
{
  const env = loadEnv(targetPath);
  const pE = [makePlayer('e1','x','E'),makePlayer('e2','x','E'),makePlayer('e3','x','E'),makePlayer('e4','x','E')];
  env._setState({
    players:{E:pE, A:[], B:[]},
    rounds:3,
    pairings:{E:[],A:[],B:[]},
    results:{E:makeRoundRobin3(pE),A:[],B:[]},
    started:true,
    classes:[
      {id:'E',name:'Eクラス',started:true},
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  ['E級優勝','E級準優勝','E級3位'].forEach(function(lbl){
    assert(html.indexOf(lbl) >= 0, 'K9 「'+lbl+'」が含まれる（E クラス → E 級）');
  });
}

// K10: state.classes に既に S 級 が name で設定されているケース（二重変換しない）
{
  const env = loadEnv(targetPath);
  const pS = [makePlayer('s1','x','S'),makePlayer('s2','x','S'),makePlayer('s3','x','S'),makePlayer('s4','x','S')];
  env._setState({
    players:{S:pS, A:[], B:[]},
    rounds:3,
    pairings:{S:[],A:[],B:[]},
    results:{S:makeRoundRobin3(pS),A:[],B:[]},
    started:true,
    classes:[
      {id:'S',name:'S級',started:true},   // 既に「S級」表記
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('S級優勝') >= 0, 'K10 既に「S級」 name → そのまま「S級優勝」（二重変換しない）');
  assert(html.indexOf('S級級優勝') < 0, 'K10-no 「S級級優勝」のような二重変換は起きない');
}

// K11: XSS — name に <script> 含む場合も escapeHtml で安全
{
  const env = loadEnv(targetPath);
  const pA = [makePlayer('a1','x','A'),makePlayer('a2','x','A'),makePlayer('a3','x','A'),makePlayer('a4','x','A')];
  env._setState({
    players:{A:pA,B:[]},
    rounds:3,
    pairings:{A:[],B:[]},
    results:{A:makeRoundRobin3(pA),B:[]},
    started:true,
    classes:[
      {id:'A',name:'<script>alert(2)</script>',started:true},
      {id:'B',name:'Bクラス',started:true}
    ],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  // カスタム name はそのまま尊重するが、rankRow 内で escapeHtml される
  assert(html.indexOf('<script>alert(2)</script>優勝') < 0,
    'K11-1 危険なカスタム name の <script> raw が出ない');
  assert(/&lt;script&gt;alert\(2\)&lt;\/script&gt;優勝/.test(html),
    'K11-2 危険なカスタム name が escapeHtml されて出力される');
}

// ============================================================
// SECTION C: 安全性 / REPORT-UX-001 出力との互換
// ============================================================

// C1: REPORT-UX-001 の日付/時刻の和暦風変換が引き続き効く
{
  const env = loadEnv(targetPath);
  const pA = [makePlayer('a1','x','A'),makePlayer('a2','x','A'),makePlayer('a3','x','A'),makePlayer('a4','x','A')];
  env._setState({
    players:{A:pA, B:[]},
    rounds:3,
    pairings:{A:[],B:[]},
    results:{A:makeRoundRobin3(pA), B:[]},
    started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    report:{date:'2026-05-18',place:'労政会館',start:'09:05',end:'17:30',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'09:05',end:'17:30'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('2026年5月18日') >= 0, 'C1-1 開催日が「2026年5月18日」に変換');
  assert(html.indexOf('9時05分') >= 0, 'C1-2 開始時間が「9時05分」に変換');
  assert(html.indexOf('17時30分') >= 0, 'C1-3 終了時間が「17時30分」に変換');
}

// C2: プレイヤー名の escapeHtml
{
  const env = loadEnv(targetPath);
  const pA = [
    makePlayer('a1','<b>危険</b>','A'),   // 危険な name
    makePlayer('a2','x','A'),
    makePlayer('a3','x','A'),
    makePlayer('a4','x','A')
  ];
  env._setState({
    players:{A:pA, B:[]},
    rounds:3,
    pairings:{A:[],B:[]},
    results:{A:makeRoundRobin3(pA), B:[]},
    started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('<b>危険</b>') < 0, 'C2-1 危険なプレイヤー名 raw <b> が出ない');
  assert(html.indexOf('&lt;b&gt;危険&lt;/b&gt;') >= 0, 'C2-2 escapeHtml されて出力される');
}

// C3: 固定要素の温存（REPORT-UX-003+ 持ち越し範囲）
{
  const env = loadEnv(targetPath);
  env._setState({
    players:{A:[],B:[]}, rounds:3, pairings:{A:[],B:[]}, results:{A:[],B:[]},
    started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00',sei:'',fuku:'',note:''}
  });
  seedReportDom(env._ctx, {date:'2026-05-18',place:'労政会館',start:'13:00',end:'17:00'});
  env.downloadReport();
  const html = env._getLastBlobSrc();
  assert(html.indexOf('沼津支部月例将棋大会報告書') >= 0,
    'C3-1 タイトル「沼津支部月例将棋大会報告書」は本 PR では維持');
  assert(html.indexOf('▲7,000円') >= 0,
    'C3-2 賞金 7,000 円ハードコードは本 PR では維持');
  assert(html.indexOf('FAX') < 0,
    'C3-3 FAX 文言は報告書に出ない（FAX削除）');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-UX-002 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
