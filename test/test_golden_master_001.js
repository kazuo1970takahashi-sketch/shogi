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
       getName:getName,
       getNameWithNo:getNameWithNo,
       formatParticipantLabel:formatParticipantLabel,
       renderPlayerNameWithRuby:renderPlayerNameWithRuby,
       playerNameRubyHtml:playerNameRubyHtml,
       nameWithNoRubyHtml:nameWithNoRubyHtml,
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

// B-4a（#293）: 過去参加者パネルの comparator 分岐を byte 固定するための架空マスタ群。
// 「他」タブ（_ppCompareOtherRow）: ふりがな空2名（→空が先・氏名昇順）＋ other 行1名（ゔ始まり）。
function mkPpOtherRowMaster(){
  return { schema_version:1, members:[
    {id:'o-empty-wo',name:'を員乙',yomi:'',last_class:'A',last_attended:'2026-03-03',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'o-empty-a',name:'あ員甲',yomi:'',last_class:'A',last_attended:'2026-02-02',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'o-other-vu',name:'ゔ員丙',yomi:'ゔあ',last_class:'A',last_attended:'2026-01-01',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''}
  ]};
}
// within_3mo（FixedDate todayYmd=2024-06-14・UTC 機では 06-13）を TZ 非依存にする架空マスタ。
//   採用 last_attended は threshold(≈2024-03-15/16)と today(2024-06-13/14)の両境界から十分離す:
//   2024-05-01・2024-04-10 は ±1 日の境界揺れでも常に窓内、2024-01-01 は常に窓外。
//   → スナップショット出力（窓内2名・降順）はローカル TZ に依存しない。
function mkWithin3moMaster(){
  return { schema_version:1, members:[
    {id:'w-in-1',name:'近員甲',yomi:'',last_class:'A',last_attended:'2024-05-01',first_attended:'2024-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'w-in-2',name:'近員乙',yomi:'',last_class:'A',last_attended:'2024-04-10',first_attended:'2024-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'w-out',name:'遠員丙',yomi:'',last_class:'A',last_attended:'2024-01-01',first_attended:'2023-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''}
  ]};
}
// 同 last_attended・同 name・id のみ相違（_ppCompareAllRow の「同値→1」境界＝2要素で入力順保持）。
function mkPpTieMaster(){
  return { schema_version:1, members:[
    {id:'tie-1',name:'同名一致',yomi:'',last_class:'A',last_attended:'2026-05-10',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'tie-2',name:'同名一致',yomi:'',last_class:'A',last_attended:'2026-05-10',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''}
  ]};
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

  // --- 過去参加者パネル B-4a（#293）: comparator 分岐 + 日付フィルタ + tie-break を FixedDate 下で byte 固定。---
  //   state.players 空（全 member→未エントリー）で comparator/フィルタ出力に集中。
  //   recent_last は todayStr 非依存（最終参加日の最大値）/ within_3mo は境界回避 fixture で TZ 非依存。
  env._setState({players:{A:[],B:[]}});
  cap('buildPastParticipantsPanelHtml__other_row', function(){ return env.buildPastParticipantsPanelHtml(mkPpOtherRowMaster(), '', 'other', null); });
  cap('buildPastParticipantsPanelHtml__yomi_row_ka', function(){ return env.buildPastParticipantsPanelHtml(mkMaster(), '', 'ka', null); });
  cap('buildPastParticipantsPanelHtml__quick_recent_last', function(){ return env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', 'recent_last'); });
  cap('buildPastParticipantsPanelHtml__quick_within_3mo', function(){ return env.buildPastParticipantsPanelHtml(mkWithin3moMaster(), '', 'all', 'within_3mo'); });
  cap('buildPastParticipantsPanelHtml__sort_tie_all', function(){ return env.buildPastParticipantsPanelHtml(mkPpTieMaster(), '', 'all', null); });

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

  // ============================================================
  // PHASE B-3 characterization: 参加者表示ヘルパーの現状出力を pin する。
  //   対象: getName / getNameWithNo / nameWithNoRubyHtml / renderPlayerNameWithRuby /
  //         playerNameRubyHtml / formatParticipantLabel（Issue #289 のリファクタ対象）。
  //   網羅: ふりがな有/無・番号有/無(欠落→index+1 fallback)・HTML を含む名前のエスケープ現状・
  //         not-found（(削除)/--）・全角空白ふりがな（trim→空）・引数 null。
  //   注意: クラス不在で throw する経路は採取しない（golden は throw を FAIL 扱いするため）。
  //         本ケースは現行（未リファクタ）コードで採取＝現状の挙動（バグごと）を固定し、
  //         リファクタ後は snapshot 非更新の byte 一致で挙動不変を証明する。
  // ============================================================
  function serializeNode(n){
    if(n==null)return null;
    if(typeof n!=='object')return n;
    var o={nodeType:n.nodeType};
    if(n.nodeType===1)o.tagName=n.tagName;
    if(('textContent' in n)&&(n.nodeType===3||!(n.childNodes&&n.childNodes.length)))o.textContent=n.textContent;
    if(n.childNodes&&n.childNodes.length)o.childNodes=n.childNodes.map(serializeNode);
    return o;
  }
  // id→player を引く関数群（getName/getNameWithNo/nameWithNoRubyHtml）用の架空 state。
  //   b3p1: 番号有・ふりがな有 / b3p2: 番号有・ふりがな無 / b3p3: 番号欠落(→index+1)・名前に HTML・ふりがな無 /
  //   b3p4: 番号有(10)・名前に &"' ・ふりがな全角空白(trim→空)。
  env._setState({players:{A:[
    {id:'b3p1',name:'山田太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'やまだたろう'},
    {id:'b3p2',name:'佐藤花子',cls:'A',member:'other',grade:'chu',entry_no:2,yomi:''},
    {id:'b3p3',name:'<b>強</b>',cls:'A',member:'member',grade:'ippan'},
    {id:'b3p4',name:'A&B"C\'D',cls:'A',member:'member',grade:'ippan',entry_no:10,yomi:'　'}
  ],B:[]}});
  cap('participantDisplay__getName_found', function(){ return env.getName('b3p1','A'); });
  cap('participantDisplay__getName_not_found', function(){ return env.getName('zzz','A'); });
  cap('participantDisplay__getNameWithNo_entry_no_present', function(){ return env.getNameWithNo('b3p1','A'); });
  cap('participantDisplay__getNameWithNo_entry_no_fallback', function(){ return env.getNameWithNo('b3p3','A'); });
  cap('participantDisplay__getNameWithNo_not_found', function(){ return env.getNameWithNo('zzz','A'); });
  cap('participantDisplay__nameWithNoRubyHtml_furigana', function(){ return env.nameWithNoRubyHtml('b3p1','A'); });
  cap('participantDisplay__nameWithNoRubyHtml_no_furigana', function(){ return env.nameWithNoRubyHtml('b3p2','A'); });
  cap('participantDisplay__nameWithNoRubyHtml_html_name_fallback', function(){ return env.nameWithNoRubyHtml('b3p3','A'); });
  cap('participantDisplay__nameWithNoRubyHtml_zenkaku_space_yomi', function(){ return env.nameWithNoRubyHtml('b3p4','A'); });
  cap('participantDisplay__nameWithNoRubyHtml_not_found', function(){ return env.nameWithNoRubyHtml('zzz','A'); });

  // ルビ生成（DOM 版 / string 版・引数直渡し。state 非依存）。
  cap('participantDisplay__renderRuby_with_yomi', function(){ return serializeNode(env.renderPlayerNameWithRuby('山田太郎','やまだたろう')); });
  cap('participantDisplay__renderRuby_empty_yomi', function(){ return serializeNode(env.renderPlayerNameWithRuby('山田太郎','')); });
  cap('participantDisplay__renderRuby_zenkaku_space_yomi', function(){ return serializeNode(env.renderPlayerNameWithRuby('山田太郎','　')); });
  cap('participantDisplay__renderRuby_html_in_name', function(){ return serializeNode(env.renderPlayerNameWithRuby('<b>強</b>','つよし')); });
  cap('participantDisplay__renderRuby_null_args', function(){ return serializeNode(env.renderPlayerNameWithRuby(null,null)); });
  cap('participantDisplay__rubyHtml_with_yomi', function(){ return env.playerNameRubyHtml('山田太郎','やまだたろう'); });
  cap('participantDisplay__rubyHtml_empty_yomi', function(){ return env.playerNameRubyHtml('山田太郎',''); });
  cap('participantDisplay__rubyHtml_zenkaku_space_yomi', function(){ return env.playerNameRubyHtml('山田太郎','　'); });
  cap('participantDisplay__rubyHtml_html_escape', function(){ return env.playerNameRubyHtml('<b>強</b>','<i>つよし</i>'); });
  cap('participantDisplay__rubyHtml_quotes_amp', function(){ return env.playerNameRubyHtml('A&B"C\'D',''); });
  cap('participantDisplay__rubyHtml_null_args', function(){ return env.playerNameRubyHtml(null,null); });

  // formatParticipantLabel（player オブジェクト→ラベル。#289 では無改変だが現状を pin）。
  cap('participantDisplay__label_compact', function(){ return env.formatParticipantLabel({cls:'A',entry_no:12,name:'山田太郎'},{}); });
  cap('participantDisplay__label_compact_record', function(){ return env.formatParticipantLabel({cls:'A',entry_no:12,name:'山田太郎'},{includeRecord:true,record:{wins:2,losses:0}}); });
  cap('participantDisplay__label_standard_category', function(){ return env.formatParticipantLabel({cls:'A',entry_no:1,name:'山田',member:'member'},{mode:'standard',includeCategory:true}); });
  cap('participantDisplay__label_standard_cat_record', function(){ return env.formatParticipantLabel({cls:'B',entry_no:3,name:'佐藤',member:'other'},{mode:'standard',includeCategory:true,includeRecord:true,record:{wins:1,losses:2}}); });
  cap('participantDisplay__label_no_name', function(){ return env.formatParticipantLabel({cls:'A',entry_no:5},{}); });
  cap('participantDisplay__label_no_entry_no', function(){ return env.formatParticipantLabel({cls:'A',name:'匿名'},{}); });
  cap('participantDisplay__label_null', function(){ return env.formatParticipantLabel(null,{}); });
  cap('participantDisplay__label_html_name_unescaped', function(){ return env.formatParticipantLabel({cls:'A',entry_no:1,name:'<b>x</b>'},{}); });

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
