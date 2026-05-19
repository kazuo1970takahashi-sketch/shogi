#!/usr/bin/env node
// REPORT-PRINT-003: 全クラスの現ラウンド組み合わせを printPairings() で印刷専用 HTML として出力する。
//
// 観点:
//   A. 構造検査
//     A1. function printPairings() が定義されている
//     A2. tournament pane に onclick="printPairings()" ボタンがある
//     A3. ボタン文言「現在の組み合わせを印刷 / PDF保存」が存在する
//     A4. ボタンのラッパーに class="no-print" が付いている
//     A5. printPairings 本体に DOM 直読み (.pairing-card / getElementById('pane-*')) がない
//     A6. printPairings 本体に getRegistrationClassList() / state.pairings / state.players 参照あり
//     A7. printPairings 本体に A/B 固定 literal がない (state.players.A など)
//     A8. Blob + window.open + win.print + URL.revokeObjectURL を踏襲
//
//   B. 出力 HTML 内容
//     B1. <!DOCTYPE html> / <html lang="ja"> / <meta charset="UTF-8">
//     B2. 大会名が含まれる
//     B3. 日付（YYYY年M月D日 形式）が含まれる（state.report.date が設定されている場合）
//     B4. 「現在の組み合わせ」見出しが含まれる
//     B5. クラス名が含まれる
//     B6. ラウンド番号「N回戦」が含まれる
//     B7. 「第 N 卓」が含まれる
//     B8. entry_no｜氏名 が含まれる
//     B9. 「vs」が含まれる
//
//   C. 含めてはいけないもの (印刷専用 HTML の clean さ)
//     C1. winner-btn / wb_ プレフィックスなし
//     C2. 「変更」ボタン文字列なし
//     C3. 「▲ 勝」マーカーなし
//     C4. submitBtn / 「確定して次へ」なし
//     C5. repairBtn / 「組み合わせを再生成」なし
//     C6. class-action-bar / 「リセット」ボタンなし
//     C7. 暫定成績見出しなし
//     C8. 対戦履歴見出しなし
//     C9. 過去結果見出しなし
//
//   D. state-as-SoT
//     D1. DOM の .pairing-card を読まない
//     D2. state.pairings / state.players / state.results / state.classes 駆動
//     D3. JSON 復元後（state 再代入後）にも同じ HTML が生成される
//
//   E. class 可変対応
//     E1. classes A のみのケース（B 空でも出る）
//     E2. classes A/B 両方のケース
//     E3. 3 クラス（A/B/C）のケース
//     E4. A 開始済み / B 未開始のケース → A のみ出力
//
//   F. XSS / escapeHtml
//     F1. 選手名に <script> を入れても raw 混入しない
//     F2. クラス名に <script> を入れても raw 混入しない
//     F3. 大会名に <script> を入れても raw 混入しない
//
//   G. popup blocked / 印刷対象なし
//     G1. window.open が null を返す場合 alert + URL.revokeObjectURL + return
//     G2. 全クラスで pairings 空 → alert + return（空 HTML を開かない）
//     G3. 全クラス未開始 → alert + return
//     G4. 全クラス done (results.length >= rounds) → alert + return
//
//   H. 既存非影響
//     H1. printResults() / downloadReport() は影響なし
//     H2. report 系 field は影響なし

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  const elements = {};
  function makeElem(id){
    return {
      id:id||'', _innerHTML:'', style:{cssText:'',display:''}, className:'',
      hidden:false,
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(){}, appendChild(){}, remove(){}, focus(){}, click(){},
      value:'', textContent:'', firstChild:null,
      getAttribute(){return null;}, setAttribute(){}
    };
  }
  const docMock = {
    _elements:elements,
    getElementById(id){if(!elements[id])elements[id]=makeElem(id);return elements[id];},
    createElement(){return makeElem();},
    body:{appendChild(){}, removeChild(){}},
    addEventListener(){}, removeEventListener(){}, querySelectorAll(){return [];}
  };
  const winOpenCalls = [];
  let nextOpenReturns = null; // null = default fake window, 'block' = simulate popup blocked
  let lastOpenedWindow = null;
  function makeFakeOpenedWindow(){
    const loadHandlers = [];
    return {
      _loadHandlers:loadHandlers,
      focus(){},
      addEventListener(type, fn){if(type==='load')loadHandlers.push(fn);},
      print(){},
      close(){}
    };
  }
  const winMock = {
    innerWidth:1024,
    open(url, target){
      winOpenCalls.push({url:url, target:target});
      if(nextOpenReturns==='block'){lastOpenedWindow=null;return null;}
      lastOpenedWindow = makeFakeOpenedWindow();
      return lastOpenedWindow;
    },
    _winOpenCalls:winOpenCalls,
    _setNextOpenBlocked(){nextOpenReturns='block';},
    _resetOpenBlocked(){nextOpenReturns=null;}
  };
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=String(v);}, removeItem(k){delete this._[k];}};

  const blobCaptures = [];
  function BlobMock(parts, options){
    const content = (parts && parts[0]) ? String(parts[0]) : '';
    blobCaptures.push({content:content, type:options&&options.type});
    return {_isMockBlob:true, _content:content};
  }
  const revokeCalls = [];
  const urlMock = {
    createObjectURL(blob){return 'blob:mock://'+blobCaptures.length;},
    revokeObjectURL(u){revokeCalls.push(u);}
  };

  return {
    document:docMock,
    window:winMock,
    localStorage:localStorageMock,
    Blob:BlobMock,
    URL:urlMock,
    _blobCaptures:blobCaptures,
    _revokeCalls:revokeCalls
  };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       _setState:function(s){state=s;},
       _getState:function(){return state;},
       printPairings:printPairings,
       printResults:printResults,
       downloadReport:downloadReport,
       getNameWithNo:getNameWithNo,
       entryNoOf:entryNoOf,
       getRegistrationClassList:getRegistrationClassList
     };`
  );
  const alertCalls = [];
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(msg){alertCalls.push(String(msg));},
    function(){return true;},
    function(){return '';},
    function(){}, ctx.Blob, ctx.URL,
    {log(){},warn(){},error(){}}, Promise,
    function(){ /* no-op setTimeout */ }
  );
  api._ctx = ctx;
  api._alertCalls = alertCalls;
  api._getPrintedHtml = function(){
    const caps = ctx._blobCaptures;
    return caps.length>0 ? caps[caps.length-1].content : '';
  };
  api._getBlobCount = function(){return ctx._blobCaptures.length;};
  api._getOpenCalls = function(){return ctx.window._winOpenCalls;};
  api._setNextOpenBlocked = function(){ctx.window._setNextOpenBlocked();};
  api._getRevokeCalls = function(){return ctx._revokeCalls;};
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_report_print_003.js <html>');process.exit(1);}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(msg);else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makePlayer(id,name,cls,entryNo){
  return {id:id,name:name,cls:cls,member:'member',grade:'ippan',entry_no:entryNo};
}

function makeReportDefaults(overrides){
  return Object.assign(
    {date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'沼津支部月例将棋大会',organizer:'日本将棋連盟沼津支部',fax:'943-9443',officeName:'沼津支部事務局',accountingNote:'※役員会で会計長へ収支報告書として提出ください。'},
    overrides||{}
  );
}

function makeStateWithPairings(playersByCls, pairingsByCls, opts){
  opts = opts||{};
  const classes = opts.classes || [
    {id:'A',name:'Aクラス',started:!!(playersByCls.A&&playersByCls.A.length)},
    {id:'B',name:'Bクラス',started:!!(playersByCls.B&&playersByCls.B.length)}
  ];
  const results = {};
  classes.forEach(function(c){results[c.id] = (opts.results&&opts.results[c.id]) || [];});
  // ensure pairings dict has all class keys
  const pairings = {};
  classes.forEach(function(c){pairings[c.id] = (pairingsByCls&&pairingsByCls[c.id]) || [];});
  const players = {};
  classes.forEach(function(c){players[c.id] = (playersByCls&&playersByCls[c.id]) || [];});
  return {
    players:players,
    rounds:opts.rounds||4,
    pairings:pairings,
    results:results,
    started: classes.some(function(c){return c.started===true;}),
    classes:classes,
    report:makeReportDefaults(opts.report)
  };
}

// ============================================================
// SECTION A: 構造検査
// ============================================================

// A1
assert(/function\s+printPairings\s*\(/.test(htmlSrc), 'A1 function printPairings() 定義あり');

// A2 / A3 / A4
{
  // button + onclick="printPairings()" + 文言 + no-print wrapper
  const buttonRe = /<button[^>]*onclick="printPairings\(\)"[^>]*>([^<]+)<\/button>/;
  const m = htmlSrc.match(buttonRe);
  assert(m !== null, 'A2 onclick="printPairings()" ボタンが存在する');
  if(m){
    assert(m[1].indexOf('現在の組み合わせを印刷 / PDF保存') >= 0,
      'A3 ボタン文言「現在の組み合わせを印刷 / PDF保存」が存在する');
  }
  // ボタンの直前 (近接する div) に no-print が付与されている
  const noPrintWrap = /<div[^>]*class="no-print"[^>]*>\s*<button[^>]*onclick="printPairings\(\)"/;
  assert(noPrintWrap.test(htmlSrc), 'A4 printPairings ボタンのラッパーに class="no-print" が付いている');
}

// A5-A8: printPairings 本体 inspection
{
  const m = htmlSrc.match(/function printPairings\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(body.length > 0, 'A5-pre printPairings 本体を抽出できる');

  // A5: DOM 直読み禁止
  assert(!/getElementById\(['"]pane-/.test(body),
    'A5-a printPairings 本体に getElementById("pane-*") がない');
  assert(!/querySelector\(['"]\.pairing-card['"]\)/.test(body),
    'A5-b printPairings 本体に querySelector(".pairing-card") がない');
  assert(!/getElementsByClassName\(['"]pairing-card['"]\)/.test(body),
    'A5-c printPairings 本体に getElementsByClassName("pairing-card") がない');

  // A6: state-driven helper 参照
  assert(/getRegistrationClassList\s*\(/.test(body),
    'A6-a printPairings 本体に getRegistrationClassList() 参照あり');
  assert(/state\.pairings/.test(body),
    'A6-b printPairings 本体に state.pairings 参照あり');
  // 選手名は getNameWithNo(id, cls) 経由で取得（内部で state.players[cls] を読む state-as-SoT 経路）。
  // 直接 state.players を読まなくても、getNameWithNo を呼んでいれば SoT 経路として正しい。
  assert(/getNameWithNo\s*\(/.test(body),
    'A6-c printPairings 本体に getNameWithNo() 参照あり（state.players を経由）');

  // A7: A/B 固定 literal がない
  assert(!/state\.players\.A\b/.test(body),
    'A7-a printPairings 本体に state.players.A 固定 literal がない');
  assert(!/state\.players\.B\b/.test(body),
    'A7-b printPairings 本体に state.players.B 固定 literal がない');
  assert(!/state\.pairings\.A\b/.test(body),
    'A7-c printPairings 本体に state.pairings.A 固定 literal がない');
  assert(!/state\.pairings\.B\b/.test(body),
    'A7-d printPairings 本体に state.pairings.B 固定 literal がない');

  // A8: Blob + open + print 踏襲
  assert(/new Blob\(\[html\]/.test(body),
    'A8-a printPairings が new Blob([html]) を呼ぶ');
  assert(/window\.open\(url,['"]_blank['"]\)/.test(body),
    'A8-b printPairings が window.open(url, _blank) を呼ぶ');
  assert(/win\.print\(\)/.test(body),
    'A8-c printPairings が win.print() を呼ぶ');
  assert(/URL\.revokeObjectURL/.test(body),
    'A8-d printPairings が URL.revokeObjectURL を呼ぶ');
  assert(/escapeHtml\s*\(/.test(body),
    'A8-e printPairings が escapeHtml を使う');
}

// ============================================================
// SECTION B: 出力 HTML 内容
// ============================================================

// 共通シナリオ: A 2 名 (p1 vs p2), B 2 名 (p3 vs p4), 大会名・日付あり
function setupBasic(env){
  const playersA = [makePlayer('p1','山田太郎','A',1), makePlayer('p2','佐藤花子','A',2)];
  const playersB = [makePlayer('p3','鈴木一郎','B',1), makePlayer('p4','田中次郎','B',2)];
  const pairingsA = [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}];
  const pairingsB = [{p1:'p3',p2:'p4',winner:null,lastModifiedBy:'auto'}];
  const s = makeStateWithPairings(
    {A:playersA,B:playersB},
    {A:pairingsA,B:pairingsB},
    {classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
     report:{date:'2026-05-18',title:'沼津支部月例将棋大会'}}
  );
  env._setState(s);
  return s;
}

// B1-B9
{
  const env = loadEnv(targetPath);
  setupBasic(env);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.length > 0, 'B-pre 印刷 HTML が生成された');
  assert(html.indexOf('<!DOCTYPE html>') === 0, 'B1-a <!DOCTYPE html> から始まる');
  assert(html.indexOf('<html lang="ja">') >= 0, 'B1-b <html lang="ja"> を含む');
  assert(html.indexOf('<meta charset="UTF-8">') >= 0, 'B1-c charset UTF-8');
  assert(html.indexOf('沼津支部月例将棋大会') >= 0, 'B2 大会名が含まれる');
  assert(html.indexOf('2026年5月18日') >= 0, 'B3 日付（和暦表記）が含まれる');
  assert(html.indexOf('現在の組み合わせ') >= 0, 'B4 「現在の組み合わせ」見出しが含まれる');
  assert(html.indexOf('Aクラス') >= 0 && html.indexOf('Bクラス') >= 0, 'B5 クラス名が含まれる');
  assert(/1回戦/.test(html), 'B6 ラウンド番号「1回戦」が含まれる');
  assert(html.indexOf('第 1 卓') >= 0, 'B7 「第 1 卓」が含まれる');
  // B8: entry_no｜氏名
  assert(html.indexOf('01｜山田太郎') >= 0, 'B8-a entry_no｜氏名（A 1卓 p1）');
  assert(html.indexOf('02｜佐藤花子') >= 0, 'B8-b entry_no｜氏名（A 1卓 p2）');
  assert(html.indexOf('01｜鈴木一郎') >= 0, 'B8-c entry_no｜氏名（B 1卓 p1）');
  assert(html.indexOf('02｜田中次郎') >= 0, 'B8-d entry_no｜氏名（B 1卓 p2）');
  assert(html.indexOf('vs') >= 0, 'B9 「vs」が含まれる');
}

// ============================================================
// SECTION C: 含めてはいけないもの
// ============================================================
{
  const env = loadEnv(targetPath);
  setupBasic(env);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('winner-btn') < 0, 'C1-a winner-btn class なし');
  assert(html.indexOf('wb_') < 0, 'C1-b wb_ プレフィックスなし');
  // C2: 「変更」ボタン文字列なし（>変更< or >変更</button>）
  assert(!/>変更</.test(html), 'C2 「変更」ボタン文字列なし');
  assert(html.indexOf('▲ 勝') < 0, 'C3 「▲ 勝」マーカーなし');
  assert(html.indexOf('submitBtn') < 0, 'C4-a submitBtn id なし');
  assert(html.indexOf('確定して次へ') < 0, 'C4-b 「確定して次へ」文字列なし');
  assert(html.indexOf('repairBtn') < 0, 'C5-a repairBtn id なし');
  assert(html.indexOf('組み合わせを再生成') < 0, 'C5-b 「組み合わせを再生成」文字列なし');
  assert(html.indexOf('class-action-bar') < 0, 'C6-a class-action-bar クラスなし');
  assert(html.indexOf('リセット') < 0, 'C6-b 「リセット」文字列なし');
  assert(html.indexOf('暫定成績') < 0, 'C7 「暫定成績」見出しなし');
  assert(html.indexOf('対戦履歴') < 0, 'C8 「対戦履歴」見出しなし');
  assert(html.indexOf('過去結果') < 0, 'C9 「過去結果」見出しなし');
}

// ============================================================
// SECTION D: state-as-SoT
// ============================================================

// D1 / D2 は SECTION A5 / A6 で構造的にカバー済。ここでは振る舞いで再確認。
// D3: state 再代入後にも同じ HTML が生成される
{
  const env = loadEnv(targetPath);
  setupBasic(env);
  env.printPairings();
  const html1 = env._getPrintedHtml();
  // 同じ env で再代入 → 同 HTML
  setupBasic(env);
  env.printPairings();
  const html2 = env._getPrintedHtml();
  assert(html1 === html2, 'D3 同じ state を再代入すると同じ HTML が生成される');
}

// ============================================================
// SECTION E: class 可変対応
// ============================================================

// E1: A only (B 空) → A のみ出力
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  const pairingsA = [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}];
  const s = makeStateWithPairings(
    {A:playersA,B:[]},
    {A:pairingsA,B:[]},
    {classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
     report:{date:'2026-05-18'}}
  );
  env._setState(s);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('Aクラス') >= 0, 'E1-a A クラス出力');
  assert(html.indexOf('Bクラス') < 0, 'E1-b B クラスは出力されない（pairings 空 + 未開始）');
  assert(html.indexOf('山田') >= 0, 'E1-c A 選手名出力');
}

// E2: A/B 両方
{
  const env = loadEnv(targetPath);
  setupBasic(env);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('Aクラス') >= 0 && html.indexOf('Bクラス') >= 0, 'E2 A/B 両クラス出力');
}

// E3: 3 クラス（A/B/C）
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','一','A',1), makePlayer('p2','二','A',2)];
  const playersB = [makePlayer('p3','三','B',1), makePlayer('p4','四','B',2)];
  const playersC = [makePlayer('p5','五','C',1), makePlayer('p6','六','C',2)];
  const s = makeStateWithPairings(
    {A:playersA,B:playersB,C:playersC},
    {A:[{p1:'p1',p2:'p2',winner:null}], B:[{p1:'p3',p2:'p4',winner:null}], C:[{p1:'p5',p2:'p6',winner:null}]},
    {classes:[
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true},
      {id:'C',name:'Cクラス',started:true}
    ]}
  );
  env._setState(s);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('Aクラス') >= 0, 'E3-a A クラス出力');
  assert(html.indexOf('Bクラス') >= 0, 'E3-b B クラス出力');
  assert(html.indexOf('Cクラス') >= 0, 'E3-c C クラス出力');
  // page-break が 2 つ (A→B, B→C)
  // CSS の `.cls-pagebreak{...}` 定義もマッチするため、separator div 単体で count する。
  const breaks = (html.match(/<div class="cls-pagebreak"/g) || []).length;
  assert(breaks === 2, 'E3-d 3 クラス間に 2 つの cls-pagebreak div (count='+breaks+')');
}

// E4: A 開始済 / B 未開始 → A のみ
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  const playersB = [makePlayer('p3','鈴木','B',1), makePlayer('p4','田中','B',2)];
  // B は未開始（pairings 空、started=false）
  const s = makeStateWithPairings(
    {A:playersA,B:playersB},
    {A:[{p1:'p1',p2:'p2',winner:null}], B:[]},
    {classes:[
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:false}
    ]}
  );
  env._setState(s);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('Aクラス') >= 0, 'E4-a A 出力');
  assert(html.indexOf('Bクラス') < 0, 'E4-b B 未開始は除外');
  assert(html.indexOf('鈴木') < 0, 'E4-c B 選手名は出ない');
}

// ============================================================
// SECTION F: XSS / escapeHtml
// ============================================================

// F1: 選手名に <script>
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','<script>alert(1)</script>','A',1), makePlayer('p2','佐藤','A',2)];
  const s = makeStateWithPairings(
    {A:playersA,B:[]},
    {A:[{p1:'p1',p2:'p2',winner:null}]},
    {classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}]}
  );
  env._setState(s);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('<script>alert(1)</script>') < 0, 'F1-a 選手名 raw <script> が出ない');
  assert(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(html), 'F1-b 選手名 escapeHtml 済');
}

// F2: クラス名に <script>
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  const s = makeStateWithPairings(
    {A:playersA,B:[]},
    {A:[{p1:'p1',p2:'p2',winner:null}]},
    {classes:[{id:'A',name:'<script>x</script>',started:true},{id:'B',name:'Bクラス',started:false}]}
  );
  env._setState(s);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('<script>x</script>') < 0, 'F2-a クラス名 raw <script> が出ない');
  assert(/&lt;script&gt;x&lt;\/script&gt;/.test(html), 'F2-b クラス名 escapeHtml 済');
}

// F3: 大会名に <script>
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  const s = makeStateWithPairings(
    {A:playersA,B:[]},
    {A:[{p1:'p1',p2:'p2',winner:null}]},
    {classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
     report:{title:'<script>y</script>'}}
  );
  env._setState(s);
  env.printPairings();
  const html = env._getPrintedHtml();
  assert(html.indexOf('<script>y</script>') < 0, 'F3-a 大会名 raw <script> が出ない');
  assert(/&lt;script&gt;y&lt;\/script&gt;/.test(html), 'F3-b 大会名 escapeHtml 済');
}

// ============================================================
// SECTION G: popup blocked / 印刷対象なし
// ============================================================

// G1: popup blocked
{
  const env = loadEnv(targetPath);
  setupBasic(env);
  env._setNextOpenBlocked();
  env.printPairings();
  // popup blocked alert が呼ばれる + revokeObjectURL が呼ばれる
  const alerts = env._alertCalls.filter(function(s){return s.indexOf('ポップアップ') >= 0;});
  assert(alerts.length >= 1, 'G1-a popup blocked 時に alert が呼ばれる');
  const revokes = env._getRevokeCalls();
  assert(revokes.length >= 1, 'G1-b popup blocked 時に URL.revokeObjectURL が呼ばれる');
}

// G2: 全クラスで pairings 空 → alert + return (Blob 生成しない)
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  // started=true だが pairings 空（generatePairing 前 / リセット直後相当）
  const s = makeStateWithPairings(
    {A:playersA,B:[]},
    {A:[],B:[]},
    {classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}]}
  );
  env._setState(s);
  env.printPairings();
  const alerts = env._alertCalls.filter(function(s){return s.indexOf('印刷できる組み合わせがありません') >= 0;});
  assert(alerts.length >= 1, 'G2-a 印刷対象なし alert');
  assert(env._getBlobCount() === 0, 'G2-b Blob 生成なし（空 HTML を開かない）');
}

// G3: 全クラス未開始 → alert + return
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  const s = makeStateWithPairings(
    {A:playersA,B:[]},
    {A:[{p1:'p1',p2:'p2',winner:null}],B:[]},
    {classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}]}
  );
  s.started = false;
  env._setState(s);
  env.printPairings();
  const alerts = env._alertCalls.filter(function(s){return s.indexOf('印刷できる組み合わせがありません') >= 0;});
  assert(alerts.length >= 1, 'G3-a 未開始のみ → 印刷対象なし alert');
  assert(env._getBlobCount() === 0, 'G3-b Blob 生成なし');
}

// G4: 全クラス done (results.length >= rounds) → alert + return
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  const s = makeStateWithPairings(
    {A:playersA,B:[]},
    {A:[{p1:'p1',p2:'p2',winner:'p1'}],B:[]},
    {classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
     rounds:1,
     results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]],B:[]}}
  );
  env._setState(s);
  env.printPairings();
  const alerts = env._alertCalls.filter(function(s){return s.indexOf('印刷できる組み合わせがありません') >= 0;});
  assert(alerts.length >= 1, 'G4-a done のみ → 印刷対象なし alert');
  assert(env._getBlobCount() === 0, 'G4-b Blob 生成なし');
}

// ============================================================
// SECTION H: 既存非影響
// ============================================================

// H1: printResults / downloadReport 関数定義は維持
{
  assert(/function\s+printResults\s*\(/.test(htmlSrc), 'H1-a function printResults() は維持');
  assert(/function\s+downloadReport\s*\(/.test(htmlSrc), 'H1-b function downloadReport() は維持');
}

// H2: report 系 schema literal が変更されていない（accountingNote 同梱が残る）
{
  const m = htmlSrc.match(/officeName:'沼津支部事務局',\s*accountingNote:'※役員会で会計長へ収支報告書として提出ください。'/);
  assert(m !== null, 'H2 report schema literal (accountingNote 同梱) が維持されている');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-PRINT-003 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
