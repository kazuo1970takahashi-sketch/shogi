#!/usr/bin/env node
// QA-MISC-279 (#279): QA 並列テストで見つかった軽微バグ（P3）5 件の意図的バグ修正の固定テスト。
//   D-01 報告書 賞金 0 円の「▲0円」表示 → 賞金>0 のときのみ ▲
//   D-03 printResults が全クラス空でも空帳票を window.open → 0 件なら alert+return
//   A-07 過去大会統合で import 側 deleted_at の取りこぼし → 既存欠落時は採用（既存値は温存）
//   A-08 detectImportFormat: players+members 併存 JSON の master 取込不可 → members 優先
//   D-02 calcFinal が players 不在 id で TypeError（latent）→ 未登録 id 行はスキップ
//
//   各項目は「修正後の期待挙動」を assert する。未修正 base（53d87f3）に対して走らせると
//   5 項目すべてが FAIL する（ネガティブコントロール）。
//
//   このファイルは shogi_v4.html を一切変更しない（test/ のみ）。完全架空フィクスチャ・PII 不使用。
//   ハーネスは characterization テスト（test_print_results_characterization_001.js）の
//   副作用 stub 方式を踏襲する。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- 決定的 Date（now / 引数なし new を固定。引数つき new Date('2026-06-14') は実 parse 維持）----
const FIXED_NOW = 1718323200000;
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

// ---- 副作用 stub（Blob / URL / window.open / alert）----
var captured = null, capturedOpts = null, openCalls = 0, alertCalls = 0;
function resetCapture(){ captured = null; capturedOpts = null; openCalls = 0; alertCalls = 0; }

function makeContext(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3, textContent:String(t==null?'':t)}; },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ openCalls++; return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_qa_misc_279.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
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
       detectImportFormat:detectImportFormat,
       applyMergeImport:applyMergeImport,
       calcFinal:calcFinal,
       buildReportHtml:(typeof buildReportHtml==='function')?buildReportHtml:null,
       printResults:printResults,
       _setState:function(s){ state=s; },
       _getState:function(){ return state; }
     };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    alertStub, function(){ return true; }, function(){ return ''; },
    function(){}, BlobStub, URLStub,
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }, FixedDate
  );
}

// ============================================================
// fixtures（完全架空・report.date 明示で日付/TZ 非依存）
// ============================================================
function mkState(opts){
  opts = opts||{};
  return {
    rounds:1, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    players:{
      A:[
        {id:'p1',name:'架空一郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくういちろう'},
        {id:'p2',name:'架空二郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''}
      ],
      B:[]
    },
    pairings:{A:[],B:[]},
    results:{ A:[[{p1:'p1',p2:'p2',winner:'p1'}]], B:[] },
    report:{date:'2026-06-14', prize:(opts.prize!=null?opts.prize:7000), note:''},
    tournament_id:'gt_qa279'
  };
}
function mkStateEmpty(){
  var s = mkState({prize:0});
  s.players={A:[],B:[]};
  s.results={A:[],B:[]};
  return s;
}
// D-02: players 不在 id（ghost）を results に残した latent state（normalizeState は通さない）。
function mkStateGhost(){
  return {
    rounds:1, started:true,
    classes:[{id:'A',name:'Aクラス',started:true}],
    players:{A:[
      {id:'p1',name:'架空一郎',cls:'A',member:'member',grade:'ippan',entry_no:1},
      {id:'p2',name:'架空二郎',cls:'A',member:'member',grade:'ippan',entry_no:2}
    ]},
    pairings:{A:[]},
    results:{A:[[{p1:'p1',p2:'ghost-removed',winner:'p1'}]]},
    report:{date:'2026-06-14'},
    tournament_id:'gt_qa279_ghost'
  };
}

// ============================================================
let pass=0, fail=0;
function assert(cond,msg){ if(cond){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);} else {fail++; console.error('  ✗ '+msg);} }

const env = loadEnv();

// ---- D-01: 報告書 賞金行（prize=0 → ▲なし / prize>0 → ▲） ----
(function d01(){
  if(!env.buildReportHtml){ fail++; console.error('  ✗ D-01: buildReportHtml が見つからない'); return; }
  env._setState(env.normalizeState(mkState({prize:0})));
  var html0 = env.buildReportHtml();
  assert(/賞金：0円/.test(html0), 'D-01 prize=0 → 賞金行は「0円」（▲なし）');
  assert(!/賞金：▲0円/.test(html0), 'D-01 prize=0 → 「▲0円」を出さない');
  env._setState(env.normalizeState(mkState({prize:7000})));
  var html7 = env.buildReportHtml();
  assert(/賞金：▲7,000円/.test(html7), 'D-01 prize>0 → 賞金行は「▲7,000円」（▲維持）');
})();

// ---- D-03: printResults 全クラス空 → 開かず alert / 印刷対象あり → 開く ----
(function d03(){
  env._setState(env.normalizeState(mkStateEmpty()));
  resetCapture();
  env.printResults();
  assert(openCalls===0 && alertCalls===1, 'D-03 全クラス空 → window.open せず alert');
  env._setState(env.normalizeState(mkState({prize:7000})));
  resetCapture();
  env.printResults();
  assert(openCalls===1, 'D-03 印刷対象あり → 従来どおり window.open');
})();

// ---- A-07: applyMergeImport 既存削除済み deleted_at 欠落時は import を採用 / 既存値は温存 ----
(function a07(){
  // (a) 既存 deleted=true・deleted_at 欠落 + import に有効値 → 採用
  var curA = {schema_version:1, updated_at:'2026-01-01T00:00:00.000Z',
    members:[{id:'m1', name:'架空削除一', deleted:true, deleted_at:null, tournament_ids:[]}]};
  var impA = {schema_version:1,
    members:[{id:'m1', name:'架空削除一', deleted:true, deleted_at:'2026-03-15', tournament_ids:[]}]};
  var rA = env.applyMergeImport(impA, curA);
  assert(rA && rA.success, 'A-07 (a) merge 成功');
  var mA = rA && rA.newMaster.members.filter(function(x){return x.id==='m1';})[0];
  assert(!!mA && mA.deleted===true, 'A-07 (a) deleted=true 維持');
  assert(!!mA && mA.deleted_at==='2026-03-15', 'A-07 (a) 既存 deleted_at 欠落 → import の deleted_at を採用');
  // (b) 既存 deleted_at あり → 温存（import で上書きしない）
  var curB = {schema_version:1,
    members:[{id:'m2', name:'架空削除二', deleted:true, deleted_at:'2026-02-02', tournament_ids:[]}]};
  var impB = {schema_version:1,
    members:[{id:'m2', name:'架空削除二', deleted:true, deleted_at:'2026-03-15', tournament_ids:[]}]};
  var rB = env.applyMergeImport(impB, curB);
  var mB = rB && rB.newMaster.members.filter(function(x){return x.id==='m2';})[0];
  assert(!!mB && mB.deleted_at==='2026-02-02', 'A-07 (b) 既存 deleted_at があれば温存（import で上書きしない）');
})();

// ---- A-08: detectImportFormat の判定（players のみ / members のみ / 併存 / 不明）----
(function a08(){
  assert(env.detectImportFormat({players:{A:[],B:[]}})==='tournament', 'A-08 players のみ → tournament（誤判定なし）');
  assert(env.detectImportFormat({members:[]})==='branch_master', 'A-08 members のみ → branch_master');
  assert(env.detectImportFormat({players:{A:[]}, members:[{id:'x',name:'架空'}]})==='branch_master',
    'A-08 players+members 併存 → branch_master（master 取込可）');
  assert(env.detectImportFormat({foo:1})==='unknown', 'A-08 不明形式 → unknown');
})();

// ---- D-02: calcFinal が players 不在 id を含む results でも throw しない（latent 防御）----
(function d02(){
  env._setState(mkStateGhost()); // normalizeState を通さない（sanitizeMatch 前の latent 経路再現）
  var threw=false, finals=null;
  try{ finals = env.calcFinal('A'); }catch(e){ threw=true; }
  assert(!threw, 'D-02 players 不在 id を含む results でも calcFinal が throw しない');
  assert(Array.isArray(finals) && finals.length===2, 'D-02 calcFinal は登録 2 名分の結果配列を返す');
})();

console.log('  QA-MISC-279 (#279) テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail ? 1 : 0);
