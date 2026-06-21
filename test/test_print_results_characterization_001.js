#!/usr/bin/env node
// PRINT-RESULTS-CHARACTERIZATION-001 (Issue #298 / リファクタ B-5a):
//   printResults() は内部でローカル `html` 文字列を組み立ててから末尾で
//   Blob([html]) → URL.createObjectURL → window.open → load → print → afterprint close
//   → revokeObjectURL する副作用関数。中身の大半は純粋な HTML 組立。
//
//   本ハーネスは「副作用 stub による特性化」で、現行 printResults が組み立てる
//   HTML payload を捕捉し golden master に byte 固定する。B-5a で HTML 生成部を
//   buildPrintResultsHtml() へ抽出した後も、同 stub で再捕捉した payload が
//   **1 バイトも変わらない**ことを snapshot 非更新で要求する（＝挙動完全同値の一次ゲート）。
//
//   使い方:
//     node test/test_print_results_characterization_001.js shogi_v4.html              … 比較モード（既定）
//     UPDATE_GOLDEN=1 node test/test_print_results_characterization_001.js shogi_v4.html … 採取（抽出前に1回だけ）
//
//   golden: test/fixtures/golden_master/print_results_payload_001.json（canonical JSON・キー昇順）。
//
//   stub 設計（相談役 #297 の最小 stub を踏襲）:
//     - Blob=function(chunks,opts){captured=chunks;capturedOpts=opts;return {...}}（chunks[0]=html を捕捉）。
//     - URL.createObjectURL→'blob:stub' / revokeObjectURL→no-op。
//     - window.open→{focus,addEventListener,print,close} の no-op オブジェクト（open 成功経路）。
//   golden は open 成功経路の HTML 固定に絞る（window.open→null 分岐・print/afterprint は
//   別途 smoke で確認し golden の主対象にしない）。
//
//   決定性: Date は FixedDate（now / 引数なし new を固定）。report.date は常に明示するため
//           日付ヘッダ・PDF ファイル名は今日/TZ に依存しない。入力 fixture は完全架空（PII 不使用）。
//
//   このファイルは shogi_v4.html を一切変更しない（test/ のみ）。

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'golden_master', 'print_results_payload_001.json');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- 決定的 Date（now / 引数なし new を固定。引数つき new Date('2026-06-14') は実 parse を維持）----
const FIXED_NOW = 1718323200000; // 固定エポック（任意・安定値）
const RealDate = Date;
const FixedDate = new Proxy(RealDate, {
  apply: function(){ return new RealDate(FIXED_NOW).toString(); },
  construct: function(target, args){ return Reflect.construct(target, args.length ? args : [FIXED_NOW]); },
  get: function(target, prop){
    if(prop === 'now') return function(){ return FIXED_NOW; };
    var v = target[prop];
    return (typeof v === 'function') ? v.bind(target) : v;
  }
});

// ---- 副作用 stub（Blob / URL / window.open）----
// captured[0] が printResults の組み立てた html。capturedOpts.type も検証する。
var captured = null;
var capturedOpts = null;
var openCalls = 0;
var alertCalls = 0;
function resetCapture(){ captured = null; capturedOpts = null; openCalls = 0; alertCalls = 0; }

function makeContext(openReturnsNull){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  // window.open: 成功経路では {focus,addEventListener,print,close} を返す no-op。
  //   openReturnsNull=true のときだけ null を返し、!win 分岐（alert + return）を通す。
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){
      openCalls++;
      if(openReturnsNull)return null;
      return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}};
    } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_print_results_characterization_001.js <html>'); process.exit(1); }

function loadEnv(openReturnsNull){
  const ctx = makeContext(openReturnsNull);
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const BlobStub = function(chunks, opts){ captured = chunks; capturedOpts = opts; return {size:0, type:(opts&&opts.type)||''}; };
  const URLStub = { createObjectURL:function(){ return 'blob:stub'; }, revokeObjectURL:function(){} };
  const alertStub = function(){ alertCalls++; };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','Date',
    `${js};
     return {
       normalizeState:normalizeState,
       printResults:printResults,
       buildPrintResultsHtml:(typeof buildPrintResultsHtml==='function')?buildPrintResultsHtml:null,
       _setState:function(s){ state=s; },
       _getState:function(){ return state; }
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    alertStub, function(){ return true; }, function(){ return ''; },
    function(){}, BlobStub, URLStub,
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }, FixedDate
  );
  return api;
}

// ============================================================
// fixtures（完全架空・report.date 明示で日付/TZ 非依存）
// ============================================================
var REPORT = {date:'2026-06-14',place:'架空会館',start:'10:00',end:'16:00',sei:'架空一郎',fuku:'架空四郎',note:'架空メモ',prize:7000,title:'架空将棋大会',organizer:'架空支部'};

// (1) 空 finals 全クラス: players が両クラス空 → calcFinal=[] → 全 buildTable='' →
//     tables=[] でも HTML 文書を作って開く現行挙動を固定する。
function mkStateAllEmpty(){
  return {
    rounds:2, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    players:{A:[],B:[]},
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    report:REPORT,
    tournament_id:'gt_empty'
  };
}

// (2) 片方クラスのみ finals あり: A=4名/2回戦・B=空 → table は A のみ（page-break なし）。
//     単一クラス → ファイル名にクラス名トークンが付く経路。ふりがな有(p1/p3)/無(p2/p4) 両分岐。
function mkStateOneClass(){
  return {
    rounds:2, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    players:{
      A:[
        {id:'p1',name:'架空一郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくういちろう'},
        {id:'p2',name:'架空二郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
        {id:'p3',name:'架空三郎',cls:'A',member:'other',grade:'chu',entry_no:3,yomi:'かくうさぶろう'},
        {id:'p4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''}
      ],
      B:[]
    },
    pairings:{A:[],B:[]},
    results:{
      A:[
        [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p4'}],
        [{p1:'p1',p2:'p4',winner:'p1'},{p1:'p2',p2:'p3',winner:'p2'}]
      ],
      B:[]
    },
    report:REPORT,
    tournament_id:'gt_one'
  };
}

// (3) 複数クラス: A=4名・B=2名ともに finals あり → table 2 枚 + page-break。
//     複数クラス → ファイル名にクラス名トークンが付かない経路。
function mkStateMultiClass(){
  var s = mkStateOneClass();
  s.players.B = [
    {id:'q1',name:'架空乙一',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:'かくうおついち'},
    {id:'q2',name:'架空乙二',cls:'B',member:'other',grade:'ippan',entry_no:2,yomi:''}
  ];
  s.results.B = [
    [{p1:'q1',p2:'q2',winner:'q1'}],
    [{p1:'q1',p2:'q2',winner:'q2'}]
  ];
  s.tournament_id = 'gt_multi';
  return s;
}

var FIXTURES = [
  {name:'all_empty',     mk:mkStateAllEmpty},
  {name:'one_class',     mk:mkStateOneClass},
  {name:'multi_class',   mk:mkStateMultiClass}
];

// ---- canonical JSON（オブジェクトのキーを昇順に固定）----
function canon(v){
  return JSON.stringify(v, function(key, value){
    if(value && typeof value==='object' && !Array.isArray(value)){
      var sorted={}; Object.keys(value).sort().forEach(function(k){ sorted[k]=value[k]; }); return sorted;
    }
    return value;
  }, 2);
}

// ============================================================
// payload 採取（open 成功経路）
// ============================================================
function capturePayloads(){
  const env = loadEnv(false);
  const snap = {};
  const builderEquiv = {}; // buildPrintResultsHtml が存在する場合の builder()==captured 検証用
  FIXTURES.forEach(function(fx){
    env._setState(env.normalizeState(fx.mk()));
    resetCapture();
    env.printResults();
    snap[fx.name] = { html: captured && captured[0], blobType: capturedOpts && capturedOpts.type };
    // 抽出後のみ: builder を直接呼び、wrapper の捕捉値と byte 一致するか（同一 state 再注入）。
    if(env.buildPrintResultsHtml){
      env._setState(env.normalizeState(fx.mk()));
      builderEquiv[fx.name] = (env.buildPrintResultsHtml() === snap[fx.name].html);
    }
  });
  return { snap: snap, builderEquiv: builderEquiv, hasBuilder: !!env.buildPrintResultsHtml };
}

const result = capturePayloads();
const current = result.snap;

if(process.env.UPDATE_GOLDEN){
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), {recursive:true});
  fs.writeFileSync(SNAPSHOT_PATH, canon(current) + '\n', 'utf8');
  console.log('PRINT-RESULTS-CHAR: 採取完了 ' + Object.keys(current).length + ' ケース → ' + path.relative(process.cwd(), SNAPSHOT_PATH));
  process.exit(0);
}

// ---- 比較モード ----
if(!fs.existsSync(SNAPSHOT_PATH)){
  console.error('  ✗ golden 未採取: ' + SNAPSHOT_PATH);
  console.error('    初回は `UPDATE_GOLDEN=1 node test/test_print_results_characterization_001.js ' + targetPath + '` で採取（抽出前に）。');
  process.exit(1);
}

const committed = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
let pass=0, fail=0;
const curKeys = Object.keys(current);
const comKeys = Object.keys(committed);

// ケースの増減検知
comKeys.forEach(function(k){
  if(curKeys.indexOf(k)<0){ fail++; console.error('  ✗ ケース消失（committed にあるが現行に無い）: ' + k); }
});
curKeys.forEach(function(k){
  if(comKeys.indexOf(k)<0){ fail++; console.error('  ✗ 新ケース未採取（現行にあるが committed に無い）: ' + k); return; }
  // blobType（MIME）も固定
  if((current[k].blobType||'') !== 'text/html;charset=utf-8'){
    fail++; console.error('  ✗ Blob MIME 不一致: ' + k + ' → ' + current[k].blobType); return;
  }
  var a = canon(current[k]);
  var b = canon(committed[k]);
  if(a === b){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+k); }
  else{
    fail++;
    console.error('  ✗ payload 差分（挙動が変わった可能性）: ' + k);
    var la=a.split('\n'), lb=b.split('\n'), n=Math.max(la.length,lb.length);
    for(var i=0;i<n;i++){ if(la[i]!==lb[i]){ console.error('    @line'+(i+1)+' committed: '+(lb[i]||'(なし)')); console.error('    @line'+(i+1)+' current  : '+(la[i]||'(なし)')); break; } }
  }
});

// ---- 抽出後の追加検証: builder()==wrapper 捕捉（buildPrintResultsHtml が存在する場合のみ）----
if(result.hasBuilder){
  FIXTURES.forEach(function(fx){
    if(result.builderEquiv[fx.name]===true){ pass++; if(process.env.VERBOSE) console.log('  ✓ builder_equiv:'+fx.name); }
    else{ fail++; console.error('  ✗ buildPrintResultsHtml() != printResults 捕捉 payload: ' + fx.name); }
  });
}

// ---- smoke: window.open→null 分岐でも html は同一に組み立てられ alert が呼ばれる（golden 非対象）----
(function smokeOpenNull(){
  const env = loadEnv(true);
  env._setState(env.normalizeState(mkStateOneClass()));
  resetCapture();
  env.printResults();
  var htmlSame = captured && captured[0] === committed['one_class'].html;
  if(htmlSame && openCalls===1 && alertCalls===1){ pass++; if(process.env.VERBOSE) console.log('  ✓ smoke_open_null'); }
  else{ fail++; console.error('  ✗ smoke(open→null): htmlSame='+htmlSame+' openCalls='+openCalls+' alertCalls='+alertCalls); }
})();

console.log('  PRINT-RESULTS-CHAR テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail ? 1 : 0);
