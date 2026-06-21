#!/usr/bin/env node
// GOLDEN-MASTER-001: shogi_v4.html の純関数 / build* 系の「現状出力スナップショット」ハーネス。
//   Issue #283 Phase A（テスト安全網整備）の deliverable 2。
//
//   目的: 後続の段階リファクタ（Phase B 以降）で、build*/純関数の出力が
//         **バイト一致（HTML 文字列）/ 構造一致（JSON）** であることを機械的に要求する。
//         リファクタ前後で出力が 1 文字でも変わればここで FAIL する＝挙動完全不変の番人。
//
//   使い方:
//     node test/test_golden_master_001.js shogi_v4.html              … 比較モード（既定。CI / run_tests.sh）
//     UPDATE_GOLDEN=1 node test/test_golden_master_001.js shogi_v4.html … スナップショット再採取（人間が意図的に更新する時のみ）
//
//   スナップショット: test/fixtures/golden_master/golden_snapshot_001.json（canonical JSON・キー昇順）。
//
//   決定性の担保（重要・スナップショットがマシン/TZ 非依存である根拠）:
//     - crypto.randomUUID は固定値モック。Date は FixedDate（now/引数なし new は固定エポック）。
//     - **出力に「今日」を埋め込むケースは採用しない**（quickFilter=null・tournament_date は常に明示）。
//       これにより本スナップショットはローカルタイムゾーンに依存しない。
//     - 入力 fixture は完全架空（実データ・PII 不使用）。
//
//   このファイルは shogi_v4.html を一切変更しない（test/ のみ）。

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'golden_master', 'golden_snapshot_001.json');

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

function makeContext(){
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
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_golden_master_001.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','Date',
    `${js};
     return {
       normalizeState:normalizeState,
       normalizeClasses:normalizeClasses,
       normalizeBranchMaster:normalizeBranchMaster,
       normalizeReportTitle:normalizeReportTitle,
       normalizeReportPlace:normalizeReportPlace,
       normalizeReportSei:normalizeReportSei,
       evaluatePairingQuality:evaluatePairingQuality,
       buildScoreboardClassTableHtml:buildScoreboardClassTableHtml,
       buildResultsClassHtml:buildResultsClassHtml,
       buildCurrentPairingsHtml:buildCurrentPairingsHtml,
       buildTournamentPdfFilename:buildTournamentPdfFilename,
       buildPastParticipantsPanelHtml:buildPastParticipantsPanelHtml,
       buildArchiveEntryFromState:buildArchiveEntryFromState,
       updateBranchMasterFromTournament:updateBranchMasterFromTournament,
       mergeTournamentParticipantsIntoMaster:mergeTournamentParticipantsIntoMaster,
       calcFinal:calcFinal,
       getWins:getWins,
       getTopPlayers:getTopPlayers,
       _setState:function(s){ state=s; },
       _getState:function(){ return state; }
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; },
    {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }, FixedDate
  );
  return api;
}

// ============================================================
// fixtures（完全架空）
// ============================================================

// 架空の進行中 A クラス大会（4名・2回戦消化・report 設定済）。build*/集計/PDF/archive を駆動する。
function mkRawStateA(){
  return {
    rounds:4, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    players:{
      A:[
        {id:'gp1',name:'架空一郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくういちろう'},
        {id:'gp2',name:'架空二郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
        {id:'gp3',name:'架空三郎',cls:'A',member:'other',grade:'chu',entry_no:3,yomi:'かくうさぶろう'},
        {id:'gp4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''}
      ],
      B:[]
    },
    pairings:{
      A:[{p1:'gp1',p2:'gp3',winner:''},{p1:'gp2',p2:'gp4',winner:''}],
      B:[]
    },
    results:{
      A:[
        [{p1:'gp1',p2:'gp2',winner:'gp1'},{p1:'gp3',p2:'gp4',winner:'gp4'}],
        [{p1:'gp1',p2:'gp4',winner:'gp1'},{p1:'gp2',p2:'gp3',winner:'gp2'}]
      ],
      B:[]
    },
    report:{date:'2026-06-14',place:'架空会館',start:'10:00',end:'16:00',sei:'架空一郎',fuku:'架空四郎',note:'架空メモ\n2行目',prize:7000,title:'架空将棋大会',organizer:'架空支部',fax:'000-0000',officeName:'架空事務局',accountingNote:'架空会計注記'},
    tournament_id:'gt_2026_06_14'
  };
}

// 架空の支部マスタ（3名・墓石1名は別途付与しない最小形）。
function mkMaster(){
  return {
    schema_version:1,
    members:[
      {id:'m-001',name:'架空一郎',yomi:'かくいちろう',last_class:'A',last_attended:'2026-05-10',first_attended:'2025-01-01',attendance_count:6,tournament_ids:['gt_2025_01','gt_2026_05'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:'架空市'},
      {id:'m-002',name:'架空二郎',yomi:'',last_class:'B',last_attended:'2026-04-12',first_attended:'2025-03-03',attendance_count:2,tournament_ids:['gt_2026_04'],deleted:false,deleted_at:null,note:'',member:'other',grade:'ippan',city:''},
      {id:'m-003',name:'架空五郎',yomi:'かくうごろう',last_class:'A',last_attended:'2026-06-01',first_attended:'2024-12-01',attendance_count:9,tournament_ids:['gt_2026_06'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:'架空町'}
    ]
  };
}

// ============================================================
// スナップショット採取
// ============================================================
function buildSnapshot(env){
  const snap = {};
  function cap(name, thunk){
    try { snap[name] = thunk(); }
    catch(e){ snap[name] = {__error:String(e && e.message ? e.message : e)}; }
  }

  // --- 純関数: normalizeClasses（互換補完・appendMissingClassesFromDicts の分岐）---
  cap('normalizeClasses__empty', function(){ return env.normalizeClasses({}); });
  cap('normalizeClasses__legacy_started', function(){ return env.normalizeClasses({started:true}); });
  cap('normalizeClasses__with_dicts_C', function(){
    return env.normalizeClasses({classes:[{id:'A',name:'Aクラス',started:false}], players:{C:[],D:[]}, started:false});
  });

  // --- normalizeState 往復恒等性（往復後の JSON を pin。s1==s2 を別途 assert）---
  cap('normalizeState__roundtrip', function(){
    var s1 = env.normalizeState(mkRawStateA());
    var s2 = env.normalizeState(JSON.parse(JSON.stringify(s1)));
    return { identical: JSON.stringify(s1) === JSON.stringify(s2), state: s1 };
  });

  // --- normalizeReport*（純・代表入力）---
  cap('normalizeReportTitle__trim', function(){ return env.normalizeReportTitle('  架空大会  '); });
  cap('normalizeReportPlace__empty_default', function(){ return env.normalizeReportPlace(''); });
  cap('normalizeReportSei__plain', function(){ return env.normalizeReportSei('架空一郎'); });

  // --- evaluatePairingQuality（同勝数/勝数差/再戦/手動/警告ラベルの組合せ）---
  cap('evaluatePairingQuality__empty', function(){ return env.evaluatePairingQuality([],[],[]); });
  cap('evaluatePairingQuality__mixed', function(){
    var players=[{id:'q1'},{id:'q2'},{id:'q3'},{id:'q4'}];
    var results=[
      [{p1:'q1',p2:'q2',winner:'q1'},{p1:'q3',p2:'q4',winner:'q3'}]
    ];
    // q1(1勝) vs q2(0勝)=勝数差1・再戦, q3(1勝) vs q4(0勝)=勝数差1・再戦・手動
    var pairings=[
      {p1:'q1',p2:'q2'},
      {p1:'q3',p2:'q4',lastModifiedBy:'manual'}
    ];
    return env.evaluatePairingQuality(pairings,results,players);
  });

  // --- 状態依存 build*（state を注入してからクラス別呼び出し）---
  env._setState(env.normalizeState(mkRawStateA()));
  cap('buildScoreboardClassTableHtml__A', function(){ return env.buildScoreboardClassTableHtml('A'); });
  cap('buildResultsClassHtml__A_pc', function(){ return env.buildResultsClassHtml('A', false); });
  cap('buildResultsClassHtml__A_sp', function(){ return env.buildResultsClassHtml('A', true); });
  cap('buildCurrentPairingsHtml__A', function(){ return env.buildCurrentPairingsHtml('A', 3, false); });
  cap('buildTournamentPdfFilename__report_A', function(){ return env.buildTournamentPdfFilename('report','A'); });
  cap('calcFinal__A', function(){ return env.calcFinal('A'); });
  cap('getWins__A', function(){ return env.getWins('A'); });
  cap('getTopPlayers__A', function(){ return env.getTopPlayers('A'); });
  cap('buildArchiveEntryFromState__A', function(){ return env.buildArchiveEntryFromState(env._getState(), '2026-06-14T12:00:00.000Z'); });

  // --- 過去参加者パネル（quickFilter=null＝今日非依存。state は注入済み）---
  cap('buildPastParticipantsPanelHtml__all', function(){ return env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', null); });
  cap('buildPastParticipantsPanelHtml__search', function(){ return env.buildPastParticipantsPanelHtml(mkMaster(), '架空', 'all', null); });

  // --- 支部マスタ同期（valid tournament_date＝今日非依存。返り値 master を pin）---
  cap('updateBranchMasterFromTournament__existing_and_new', function(){
    var st = {players:{
      A:[{id:'sp1',name:'架空一郎',cls:'A',member:'member',grade:'ippan',member_id:'m-001'},
         {id:'sp2',name:'架空新人',cls:'A',member:'member',grade:'ippan'}],
      B:[]
    }};
    var master = mkMaster();
    var meta = {tournament_id:'gt_sync_001', tournament_date:'2026-06-14'};
    var out = env.updateBranchMasterFromTournament(st, master, meta);
    return out;
  });
  cap('mergeTournamentParticipantsIntoMaster__one_backup', function(){
    var tournaments=[{filename:'archive_2026_06_14.json', raw:{
      players:{A:[{id:'bp1',name:'架空一郎',cls:'A'},{id:'bp2',name:'架空七郎',cls:'A'}],B:[]},
      report:{date:'2026-06-14',title:'架空バックアップ大会'}
    }}];
    var master = mkMaster();
    var summary = env.mergeTournamentParticipantsIntoMaster(tournaments, master);
    return { summary: summary, memberCount: master.members.length };
  });

  return snap;
}

// ---- canonical JSON（オブジェクトのキーを昇順に固定）----
function canon(v){
  return JSON.stringify(v, function(key, value){
    if(value && typeof value==='object' && !Array.isArray(value)){
      var sorted={}; Object.keys(value).sort().forEach(function(k){ sorted[k]=value[k]; }); return sorted;
    }
    return value;
  }, 2);
}

const env = loadEnv();
const current = buildSnapshot(env);

// 採取時にエラーを孕んだケースは UPDATE/比較とも警告（fixture 不整合の早期検知）
var errored = Object.keys(current).filter(function(k){ return current[k] && current[k].__error; });

if(process.env.UPDATE_GOLDEN){
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), {recursive:true});
  fs.writeFileSync(SNAPSHOT_PATH, canon(current) + '\n', 'utf8');
  if(errored.length){
    console.error('  ⚠ 採取時エラーのケース（要確認）: ' + errored.join(', '));
    errored.forEach(function(k){ console.error('     - '+k+': '+current[k].__error); });
  }
  console.log('GOLDEN-MASTER: 採取完了 ' + Object.keys(current).length + ' ケース → ' + path.relative(process.cwd(), SNAPSHOT_PATH));
  process.exit(errored.length ? 1 : 0);
}

// ---- 比較モード ----
if(!fs.existsSync(SNAPSHOT_PATH)){
  console.error('  ✗ スナップショット未採取: ' + SNAPSHOT_PATH);
  console.error('    初回は `UPDATE_GOLDEN=1 node test/test_golden_master_001.js ' + targetPath + '` で採取してください。');
  process.exit(1);
}

const committed = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
let pass=0, fail=0;
const curKeys = Object.keys(current);
const comKeys = Object.keys(committed);

// 採取エラーは即 FAIL（リファクタで純関数が throw するようになった等）
errored.forEach(function(k){
  fail++; console.error('  ✗ ケース実行エラー: ' + k + ' → ' + current[k].__error);
});

// ケースの増減検知
comKeys.forEach(function(k){
  if(curKeys.indexOf(k)<0){ fail++; console.error('  ✗ ケース消失（committed にあるが現行に無い）: ' + k); }
});
curKeys.forEach(function(k){
  if(comKeys.indexOf(k)<0){
    fail++;
    console.error('  ✗ 新ケース未採取（現行にあるが committed に無い）: ' + k + ' … UPDATE_GOLDEN で採取要');
    return;
  }
  if(current[k] && current[k].__error) return; // 既に上で FAIL 計上
  var a = canon(current[k]);
  var b = canon(committed[k]);
  if(a === b){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+k); }
  else{
    fail++;
    console.error('  ✗ 出力差分（挙動が変わった可能性）: ' + k);
    if(process.env.VERBOSE){
      console.error('    --- committed ---\n'+b);
      console.error('    --- current ---\n'+a);
    } else {
      // 先頭の相違点だけ簡潔に提示
      var la=a.split('\n'), lb=b.split('\n'), n=Math.max(la.length,lb.length);
      for(var i=0;i<n;i++){ if(la[i]!==lb[i]){ console.error('    @line'+(i+1)+' committed: '+(lb[i]||'(なし)')); console.error('    @line'+(i+1)+' current  : '+(la[i]||'(なし)')); break; } }
    }
  }
});

console.log('  GOLDEN-MASTER テスト: PASS ' + pass + '件 / FAIL ' + fail + '件 (全' + curKeys.length + 'ケース)');
process.exit(fail ? 1 : 0);
