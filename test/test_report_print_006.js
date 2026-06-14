#!/usr/bin/env node
// REPORT-PRINT-006-1: printResults() の <title> / PDF 保存時のデフォルトファイル名相当を
//   state.report.title / state.report.date 連動にする（downloadReport / printPairings と命名規約統一）。
//
// 観点:
//   A. 構造検査
//     A1. printResults() 関数定義あり
//     A2. h2 「スイス式トーナメント　対戦成績」が維持されている
//     A3. UI ボタン文言「対戦成績を印刷 / PDF保存」が維持されている
//     A4. printResults 本体が共通 helper(buildTournamentPdfFilename / buildPdfDocHeaderHtml)経由で
//         ファイル名/見出しを生成し、その helper が normalize 系を必ず通す（正規化の意図は不変）
//     A5. 旧 literal 「沼津支部月例将棋大会 対戦成績」「沼津支部_<y>年<m>月度_月例将棋大会結果」
//         が printResults 本体から撤去されている
//     A6. printResults 本体に escapeHtml 経由の <title> 生成あり
//
//   B. state.report.title 連動
//     B1. state.report.title='特別大会' → 生成 HTML <title> に '特別大会' が含まれる
//     B2. default ('沼津支部月例将棋大会') → 生成 HTML <title> に '沼津支部月例将棋大会' が含まれる
//     B3. title 末尾「報告書」付き入力でも normalizeReportTitle で除去される（state.report.title 化の波及）
//     B4. title に <script> 等を入れても sanitizeFilenamePart で危険文字を除去し <title> が安全
//     B5. title 空欄 / 不正値 → default '沼津支部月例将棋大会' に fallback
//
//   C. state.report.date 連動（Codex Must Fix 2: 新仕様「YYYY年M月度」月度ラベル）
//     C1. state.report.date='2026-05-19' → <title> に '2026年5月度' が含まれる（8桁日付は出ない）
//     C2. 旧形式 '2026年5月19日' → normalizeReportDateForInput で '2026-05-19' に migrate
//         → <title> に '2026年5月度' が含まれる
//     C3. state.report.date 空 → 月度ラベル省略の graceful（大会名+種別で成立、undefined/null/NaN なし）
//     C4. state.report.date 不正値 (null / 数値) → 同上 graceful（実行日 fallback はしない）
//
//   D. ファイル名構造（Codex Must Fix 2: URL 由来でない月度ベースの基底名）
//     D1. fileTitleName = '{YYYY年M月度}{大会名}{種別}' 形式（'_' 区切り・8桁日付を使わない）
//     D2. default state → '2026年5月度沼津支部月例将棋大会対戦成績'
//     D3. 旧 literal '沼津支部_<y>年<m>月度_月例将棋大会結果' / 旧 '_YYYYMMDD_対戦成績' は出ない
//
//   E. 既存互換
//     E1. h2 「スイス式トーナメント　対戦成績」維持
//     E2. table 構造 (順位 / 氏名 / N回戦 / 勝数(A) / 負数 / B / C) 維持
//     E3. entry_no 非表示維持（RANK-PRINT-001、'｜' 区切りなし）
//     E4. B/C 注釈「対戦相手の最終勝数合計」維持
//     E5. classes-driven (A/B 固定 literal なし) 維持
//
//   F. XSS
//     F1. state.report.title に <script> raw 混入なし
//     F2. 選手名に <script> raw 混入なし（既存 escapeHtml 経路の動作確認）
//
//   G. 既存非影響
//     G1. downloadReport() 関数定義は維持
//     G2. printPairings() 関数定義は維持
//     G3. save / load / normalizeState 系の関数定義は維持
//     G4. state.report schema literal が壊れていない (accountingNote 同梱が残る)
//
//   H. VRT 不要確認 (静的検査)
//     H1. result tab UI に変更がない（ボタン onclick="printResults()" / 文言維持）

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
      lastOpenedWindow = makeFakeOpenedWindow();
      return lastOpenedWindow;
    },
    _winOpenCalls:winOpenCalls
  };
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=String(v);}, removeItem(k){delete this._[k];}};

  const blobCaptures = [];
  function BlobMock(parts, options){
    const content = (parts && parts[0]) ? String(parts[0]) : '';
    blobCaptures.push({content:content, type:options&&options.type});
    return {_isMockBlob:true, _content:content};
  }
  const urlMock = {
    createObjectURL(blob){return 'blob:mock://'+blobCaptures.length;},
    revokeObjectURL(){}
  };

  return {
    document:docMock,
    window:winMock,
    localStorage:localStorageMock,
    Blob:BlobMock,
    URL:urlMock,
    _blobCaptures:blobCaptures
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
       printResults:printResults,
       downloadReport:downloadReport,
       printPairings:printPairings,
       normalizeReportTitle:normalizeReportTitle,
       normalizeReportDateForInput:normalizeReportDateForInput,
       normalizeState:normalizeState,
       save:save,
       load:load
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
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_report_print_006.js <html>');process.exit(1);}
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

function makeStateWithMatches(playersA, resultsA, rounds, reportOverrides){
  return {
    players:{A:playersA,B:[]},
    rounds:rounds||resultsA.length,
    pairings:{A:[],B:[]},
    results:{A:resultsA,B:[]},
    started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    report:makeReportDefaults(reportOverrides||{})
  };
}

// ============================================================
// SECTION A: 構造検査
// ============================================================

// A1
assert(/function\s+printResults\s*\(/.test(htmlSrc), 'A1 function printResults() 定義あり');

// A2: h2 維持
assert(htmlSrc.indexOf("<h2>スイス式トーナメント　対戦成績</h2>") >= 0,
  'A2 h2「スイス式トーナメント　対戦成績」が維持されている');

// A3: UI ボタン文言維持
assert(/onclick="printResults\(\)"[^>]*>対戦成績を印刷 \/ PDF保存</.test(htmlSrc),
  'A3 UI ボタン文言「対戦成績を印刷 / PDF保存」が維持されている');

// A4 / A5 / A6: printResults 本体 inspection
{
  const m = htmlSrc.match(/function printResults\(\)[\s\S]*?\n\}\n/);
  const body = m ? m[0] : '';
  assert(body.length > 0, 'A4-pre printResults 本体を抽出できる');

  // A4 (Codex Must Fix 2): printResults 本体はファイル名/見出しを共通 helper に委譲する。
  //   委譲先 (buildTournamentPdfFilename / buildPdfDocHeaderHtml) が内部で normalizeReportTitle /
  //   normalizeReportDateForInput を必ず通すため、printResults からの直接参照ではなく
  //   「helper 経由で正規化済みの大会情報由来になっている」ことを検査する（意図は不変）。
  assert(/buildTournamentPdfFilename\s*\(/.test(body),
    'A4-a printResults 本体が buildTournamentPdfFilename() 経由でファイル名を生成（正規化済み大会名由来）');
  assert(/buildPdfDocHeaderHtml\s*\(/.test(body),
    'A4-b printResults 本体が buildPdfDocHeaderHtml() 経由で見出しを生成（正規化済み日付/大会名由来）');
  // A4-c/A4-d: 委譲先 helper が normalize helper を必ず通すこと（正規化の意図を担保）
  assert(/function buildTournamentPdfFilename[\s\S]*?normalizeReportTitle\s*\(/.test(htmlSrc),
    'A4-c buildTournamentPdfFilename() が normalizeReportTitle() を通す');
  assert(/function buildTournamentTargetMonthLabel[\s\S]*?normalizeReportDateForInput\s*\(/.test(htmlSrc),
    'A4-d 月度ラベル生成 buildTournamentTargetMonthLabel() が normalizeReportDateForInput() を通す');

  // A5: 旧 literal が printResults 本体の **アクティブコード** から撤去されている
  //   （コメント中の歴史的記述には残るが、それは migration 説明として許容する。
  //    アクティブな string literal 形式 / template 形式のみを禁止する。）
  // A5-a: 旧 <title> literal '<title>沼津支部月例将棋大会 対戦成績</title>' （HTML 形式）が出ない
  assert(body.indexOf('<title>沼津支部月例将棋大会 対戦成績</title>') < 0,
    'A5-a printResults 本体に旧 <title> literal 「<title>沼津支部月例将棋大会 対戦成績</title>」が残っていない');
  // A5-b: 旧 file 名 template `+y+'年'+m+'月度_月例将棋大会結果'` が出ない
  assert(!/\+y\+'年'\+m\+'月度_月例将棋大会結果'/.test(body),
    'A5-b printResults 本体に旧 file 名 template 「+y+\'年\'+m+\'月度_月例将棋大会結果\'」が残っていない');
  // A5-c: 旧 接頭辞 literal '沼津支部_' (single-quoted) が出ない
  assert(body.indexOf("'沼津支部_'") < 0,
    'A5-c printResults 本体に旧 literal 接頭辞 "沼津支部_" が残っていない');
  // A5-d: 旧 二段階置換 (html.replace) が撤去されている
  assert(body.indexOf('html.replace') < 0,
    'A5-d printResults 本体で <title> の二段階置換 (html.replace) が撤去されている');

  // A6: escapeHtml 経由 <title>
  assert(/<title>'\+escapeHtml\(/.test(body) || /<title>['"]\s*\+\s*escapeHtml\s*\(/.test(body),
    'A6 printResults 本体で <title> に escapeHtml 経由の値が入る');
}

// ============================================================
// SECTION B: state.report.title 連動
// ============================================================

// 共通: 基本シナリオ - A 2 名 / 1 回戦
function setupBasic(env, reportOverrides){
  const players = [makePlayer('p1','山田','A',1), makePlayer('p2','佐藤','A',2)];
  const results = [[{p1:'p1',p2:'p2',winner:'p1'}]];
  env._setState(makeStateWithMatches(players, results, 1, reportOverrides||{date:'2026-05-19'}));
}

function extractTitle(html){
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1] : '';
}

// B1: title='特別大会'
{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:'特別大会', date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('特別大会') >= 0, 'B1-a <title> に "特別大会" が含まれる');
  assert(title.indexOf('沼津支部月例将棋大会') < 0, 'B1-b <title> に default 大会名が出ない');
}

// B2: default title
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('沼津支部月例将棋大会') >= 0, 'B2 default title → <title> に "沼津支部月例将棋大会"');
}

// B3: 末尾「報告書」付き入力でも除去される（normalizeReportTitle の効果が printResults にも波及）
{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:'特別大会報告書', date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('特別大会') >= 0, 'B3-a 末尾「報告書」除去後の "特別大会" が <title> に出る');
  assert(title.indexOf('特別大会報告書') < 0, 'B3-b 末尾「報告書」付きの raw 値は出ない');
}

// B4: title XSS escape
{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:'<script>alert(1)</script>', date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  // <title> 内の raw <script> は出ない
  assert(html.indexOf('<title><script>alert(1)</script>') < 0,
    'B4-a <title> 内に raw <script> が混入しない');
  // Codex Must Fix 2: ファイル名は sanitizeFilenamePart が < > / を「除去」してから生成するため、
  //   <title> には raw タグも実体参照(&lt;script&gt;)も残らない（除去方式での XSS 安全）。
  const b4title = extractTitle(html);
  assert(!/[<>]/.test(b4title),
    'B4-b title 由来の危険文字 < > が <title> から除去される（sanitize 除去で XSS 安全）');
  assert(b4title.indexOf('対戦成績') >= 0,
    'B4-c 危険 title でも種別「対戦成績」は保持される（基底名が破綻しない）');
}

// B5: title 空欄 / 不正値 → default fallback
{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:'', date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('沼津支部月例将棋大会') >= 0, 'B5-a 空欄 title → default に fallback');
}
{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:null, date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('沼津支部月例将棋大会') >= 0, 'B5-b null title → default に fallback');
}
{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:'   ', date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('沼津支部月例将棋大会') >= 0, 'B5-c 空白のみ title → default に fallback');
}

// ============================================================
// SECTION C: state.report.date 連動
// ============================================================

// C1: ISO date
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('2026年5月度') >= 0, 'C1 ISO 日付 → <title> に "2026年5月度"');
  assert(!/\d{8}/.test(title), 'C1-b 旧 YYYYMMDD（8桁連続日付）形式は出ない');
}

// C2: 旧形式日付 migration (normalizeReportDateForInput 経由)
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026年5月19日'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(title.indexOf('2026年5月度') >= 0, 'C2 旧形式 "2026年5月19日" → migrate 経由で <title> に "2026年5月度"');
}

// C3: 空 date → 実行日 fallback (YYYYMMDD 8 桁が含まれる)
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:''});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  // Codex Must Fix 2: 空 date は実行日 fallback せず、月度ラベルを省いて 大会名+種別 で graceful に成立させる
  assert(title.indexOf('沼津支部月例将棋大会') >= 0 && title.indexOf('対戦成績') >= 0,
    'C3-a 空 date → 月度ラベルなしでも 大会名+種別 で <title> が成立');
  assert(title.indexOf('月度') < 0, 'C3-b 空 date では「YYYY年M月度」ラベルが付かない');
  assert(!/undefined|null|NaN/.test(title), 'C3-c 空 date でも undefined/null/NaN を含まない（graceful fallback）');
}

// C4: 不正値 (null / 数値)
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:null});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(!/undefined|null|NaN/.test(title) && title.indexOf('対戦成績') >= 0,
    'C4-a date=null → graceful（undefined/null/NaN なし・種別「対戦成績」あり）');
  assert(title.indexOf('月度') < 0, 'C4-a2 date=null では月度ラベルが付かない');
}
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:12345});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assert(!/undefined|null|NaN/.test(title) && title.indexOf('対戦成績') >= 0,
    'C4-b date=数値 → graceful（undefined/null/NaN なし・種別「対戦成績」あり）');
}

// ============================================================
// SECTION D: ファイル名構造
// ============================================================

// D1 / D2: '<reportTitle>_<YYYYMMDD>_対戦成績' 形式
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assertEq(title, '2026年5月度沼津支部月例将棋大会対戦成績',
    'D1/D2 default state → "2026年5月度沼津支部月例将棋大会対戦成績"');
  // URL 由来でない: 旧 '_' 区切り / 8桁連続日付を含まない
  assert(title.indexOf('_') < 0 && !/\d{8}/.test(title),
    'D1-c ファイル名に "_" 区切り・8桁連続日付（URL風）を含まない');
  // 危険文字（OS 禁止文字 / パス区切り）を含まない
  assert(!/[\\/:*?"<>|]/.test(title), 'D1-d ファイル名に OS 禁止文字（\\ / : * ? " < > |）を含まない');
}

{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:'特別大会', date:'2026-12-31'});
  env.printResults();
  const html = env._getPrintedHtml();
  const title = extractTitle(html);
  assertEq(title, '2026年12月度特別大会対戦成績',
    'D1-b カスタム title + date → "2026年12月度特別大会対戦成績"');
}

// D3: 旧 literal が出ない
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  assert(html.indexOf('沼津支部月例将棋大会 対戦成績') < 0, 'D3-a 旧 <title> literal 出ない');
  assert(html.indexOf('月度_月例将棋大会結果') < 0, 'D3-b 旧 file 名 literal 出ない');
  assert(!/沼津支部月例将棋大会_\d{8}_対戦成績/.test(html), 'D3-c 旧 "_YYYYMMDD_対戦成績" 形式が出ない');
}

// ============================================================
// SECTION E: 既存互換
// ============================================================

// E1: h2 維持
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  assert(html.indexOf('<h2>スイス式トーナメント　対戦成績</h2>') >= 0,
    'E1 h2「スイス式トーナメント　対戦成績」維持');
}

// E2: table 構造維持
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  ['順位','氏名','勝数(A)','負数','>B<','>C<','1回戦'].forEach(function(label){
    assert(html.indexOf(label) !== -1, 'E2 table ヘッダ "'+label+'" 維持');
  });
}

// E3: entry_no 非表示維持 (RANK-PRINT-001)
{
  const env = loadEnv(targetPath);
  const players = [
    makePlayer('p1','山田太郎','A',1),
    makePlayer('p2','佐藤花子','A',2)
  ];
  const results = [[{p1:'p1',p2:'p2',winner:'p1'}]];
  env._setState(makeStateWithMatches(players, results, 1, {date:'2026-05-19'}));
  env.printResults();
  const html = env._getPrintedHtml();
  assertEq(html.indexOf('｜'), -1, 'E3-a 印刷 HTML に "｜" 区切り (entry_no) が含まれない');
  assert(html.indexOf('山田太郎') !== -1, 'E3-b bare 氏名 "山田太郎" は出る');
  assert(html.indexOf('佐藤花子') !== -1, 'E3-c bare 氏名 "佐藤花子" は出る');
}

// E4: B/C 注釈維持
{
  const env = loadEnv(targetPath);
  setupBasic(env, {date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  assert(html.indexOf('対戦相手の最終勝数合計') !== -1,
    'E4 B/C 注釈「対戦相手の最終勝数合計」維持');
}

// E5: classes-driven (A/B 固定 literal なし、3 クラス対応)
{
  const env = loadEnv(targetPath);
  const playersA = [makePlayer('p1','一','A',1), makePlayer('p2','二','A',2)];
  const playersB = [makePlayer('p3','三','B',1), makePlayer('p4','四','B',2)];
  const playersC = [makePlayer('p5','五','C',1), makePlayer('p6','六','C',2)];
  env._setState({
    players:{A:playersA,B:playersB,C:playersC},
    rounds:1,
    pairings:{A:[],B:[],C:[]},
    results:{
      A:[[{p1:'p1',p2:'p2',winner:'p1'}]],
      B:[[{p1:'p3',p2:'p4',winner:'p3'}]],
      C:[[{p1:'p5',p2:'p6',winner:'p5'}]]
    },
    started:true,
    classes:[
      {id:'A',name:'Aクラス',started:true},
      {id:'B',name:'Bクラス',started:true},
      {id:'C',name:'Cクラス',started:true}
    ],
    report:makeReportDefaults({date:'2026-05-19'})
  });
  env.printResults();
  const html = env._getPrintedHtml();
  assert(html.indexOf('Aクラス') >= 0, 'E5-a A クラス出力');
  assert(html.indexOf('Bクラス') >= 0, 'E5-b B クラス出力');
  assert(html.indexOf('Cクラス') >= 0, 'E5-c C クラス出力');
}

// ============================================================
// SECTION F: XSS
// ============================================================

// F1: title <script> raw 混入なし
{
  const env = loadEnv(targetPath);
  setupBasic(env, {title:'<b>raw</b>', date:'2026-05-19'});
  env.printResults();
  const html = env._getPrintedHtml();
  const titleArea = html.match(/<title>[\s\S]*?<\/title>/);
  assert(titleArea, 'F1-pre <title> エリア抽出可');
  if(titleArea){
    const f1inner = titleArea[0].replace(/^<title>/, '').replace(/<\/title>$/, '');
    assert(f1inner.indexOf('<b>raw</b>') < 0, 'F1-a <title> 内に raw <b> 混入なし');
    // Codex Must Fix 2: 新仕様は sanitizeFilenamePart が < > / を「除去」してから escapeHtml するため、
    //   <title> 内容には危険文字も実体参照も残らない（除去方式での XSS 安全）。
    assert(!/[<>]/.test(f1inner), 'F1-b <title> 内容に危険文字 < > が残らない（sanitize 除去で XSS 安全）');
    assert(f1inner.indexOf('対戦成績') >= 0, 'F1-c 危険 title でも種別「対戦成績」は保持される');
  }
}

// F2: 選手名 <script> raw 混入なし（既存挙動確認）
{
  const env = loadEnv(targetPath);
  const players = [
    makePlayer('p1','<script>alert(2)</script>','A',1),
    makePlayer('p2','佐藤','A',2)
  ];
  const results = [[{p1:'p1',p2:'p2',winner:'p1'}]];
  env._setState(makeStateWithMatches(players, results, 1, {date:'2026-05-19'}));
  env.printResults();
  const html = env._getPrintedHtml();
  assert(html.indexOf('<script>alert(2)</script>') < 0, 'F2-a 選手名 raw <script> 混入なし');
  assert(/&lt;script&gt;alert\(2\)&lt;\/script&gt;/.test(html), 'F2-b 選手名 escapeHtml');
}

// ============================================================
// SECTION G: 既存非影響
// ============================================================

// G1 / G2 / G3: 関数定義維持
assert(/function\s+downloadReport\s*\(/.test(htmlSrc), 'G1 function downloadReport() 維持');
assert(/function\s+printPairings\s*\(/.test(htmlSrc), 'G2 function printPairings() 維持');
assert(/function\s+save\s*\(\s*\)/.test(htmlSrc), 'G3-a function save() 維持');
assert(/function\s+load\s*\(\s*\)/.test(htmlSrc), 'G3-b function load() 維持');
assert(/function\s+normalizeState\s*\(/.test(htmlSrc), 'G3-c function normalizeState() 維持');

// G4: state.report schema literal 維持
{
  const m = htmlSrc.match(/officeName:'沼津支部事務局',\s*accountingNote:'※役員会で会計長へ収支報告書として提出ください。'/);
  assert(m !== null, 'G4 state.report schema literal (accountingNote 同梱) 維持');
}

// ============================================================
// SECTION H: VRT 不要確認（静的検査）
// ============================================================

// H1: result tab UI 不変（ボタン文言 / onclick 維持）
{
  const buttonRe = /<button[^>]*onclick="printResults\(\)"[^>]*>対戦成績を印刷 \/ PDF保存<\/button>/;
  assert(buttonRe.test(htmlSrc), 'H1 result tab UI: onclick="printResults()" ボタンと文言が維持されている (VRT 不要)');
}

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  REPORT-PRINT-006-1 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
