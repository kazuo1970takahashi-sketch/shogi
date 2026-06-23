#!/usr/bin/env node
// FEE-JOSEI-001 (#325): 会費区分に「女性」(josei) を追加（会費は中学生以下=chu と完全同額）受入テスト。
//   観点:
//     F.  getFee: josei は chu と同額（member→0 / other→500）。ippan/chu 非回帰。
//     T.  calcTotal: 女性参加者を含む合算が getFee 経由で正しい（旧2値実装なら誤差が出るネガコン込み）。
//     N.  正規化往復: josei の player を normalizeState 往復 / save→load で取りこぼさない。未知値は ippan 既定（非回帰）。
//     I.  取込: normalizeBranchMaster（アプリ native 往復で josei 保持・外部段位は ippan 既定維持）/
//         convertPhase2ParticipantsToMembers / addPlayerFromMaster / createMemberFromParticipant が josei を保持。
//     E.  applyMasterMemberEdit: options.grade='josei' を受理して保持・不正値は invalid_grade_value で拒否。
//     M.  マスタ一覧（buildMasterTabHtml）: ヘッダ「会費区分」/ josei 行ラベル「女性」。
//     U.  入力UI: buildMasterEditModalHtml に女性 radio（value=josei・legend「会費区分」）/ makePlayerRow の会費区分 select に女性 option。
//   データは完全架空のみ（架空 …）。shogi_v4.html は変更しない（test/ のみ）。

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
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_fee_josei_001.js <html>');process.exit(1);}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  // generateMemberId は master 内 id 重複時に再採番→3回失敗で throw する。複数 member を生成する
  //   テスト（convertPhase2 等）のため randomUUID は呼出ごとに一意な値を返す（先頭12hex を可変に）。
  let _uuidSeq = 0;
  const cryptoMock = {randomUUID(){
    _uuidSeq++;
    const hex = ('00000000000' + _uuidSeq.toString(16)).slice(-12);
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-4000-8000-000000000000';
  }};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       getFee:getFee,
       calcTotal:calcTotal,
       normalizeState:normalizeState,
       normalizeBranchMaster:normalizeBranchMaster,
       convertPhase2ParticipantsToMembers:convertPhase2ParticipantsToMembers,
       addPlayerFromMaster:addPlayerFromMaster,
       createMemberFromParticipant:createMemberFromParticipant,
       applyMasterMemberEdit:applyMasterMemberEdit,
       buildMasterTabHtml:buildMasterTabHtml,
       buildMasterEditModalHtml:buildMasterEditModalHtml,
       makePlayerRow:makePlayerRow,
       save:save, load:load,
       STORAGE_KEY:STORAGE_KEY,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 完全架空の最小 state（A/B 2クラス・未開始）。
function fxState(playersA, playersB){
  return {
    players:{A:playersA||[], B:playersB||[]},
    rounds:0, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

// option ノードを childNodes から再帰収集（makePlayerRow の会費区分 select 検証用）。
function collectOptions(node, acc){
  acc = acc || [];
  if(!node || typeof node!=='object') return acc;
  if(node.tagName==='option' || node.tagName==='OPTION') acc.push(node);
  if(Array.isArray(node.childNodes)) node.childNodes.forEach(function(c){ collectOptions(c, acc); });
  return acc;
}

// ============================================================
// F. getFee: josei は chu と同額（member→0 / other→500）。ippan/chu 非回帰。
// ============================================================
{
  const env = loadEnv();
  const f = env.getFee;
  assert(f('member','josei')===0,  'F1 getFee(member, josei)=0（中学生以下と同額・支部員は無料）');
  assert(f('other','josei')===500, 'F2 getFee(other, josei)=500（中学生以下と同額・支部員以外）');
  // chu と完全一致であること（同額の不変条件）
  assert(f('member','josei')===f('member','chu'), 'F3 josei は支部員会費が chu と一致');
  assert(f('other','josei')===f('other','chu'),   'F4 josei は支部員以外会費が chu と一致');
  // 非回帰: ippan / chu の既存4パターン
  assert(f('member','ippan')===500,  'F5 getFee(member, ippan)=500（非回帰）');
  assert(f('other','ippan')===1000,  'F6 getFee(other, ippan)=1000（非回帰）');
  assert(f('member','chu')===0,      'F7 getFee(member, chu)=0（非回帰）');
  assert(f('other','chu')===500,     'F8 getFee(other, chu)=500（非回帰）');
}

// ============================================================
// T. calcTotal: 女性参加者を含む合算が getFee 経由で正しい。
//    旧2値実装（josei→ippan 潰し）なら josei が ippan 課金になり総額がズレる＝ネガコン。
// ============================================================
{
  const env = loadEnv();
  // A: member/ippan(500) + member/chu(0) + member/josei(0)
  // B: other/josei(500) + other/chu(500) + other/ippan(1000)
  // 期待合計 = 500+0+0 + 500+500+1000 = 2500
  env._setState(fxState(
    [
      {id:'a1',name:'架空一郎',cls:'A',member:'member',grade:'ippan',entry_no:1},
      {id:'a2',name:'架空中学',cls:'A',member:'member',grade:'chu',entry_no:2},
      {id:'a3',name:'架空女子',cls:'A',member:'member',grade:'josei',entry_no:3}
    ],
    [
      {id:'b1',name:'架空女史',cls:'B',member:'other',grade:'josei',entry_no:1},
      {id:'b2',name:'架空中子',cls:'B',member:'other',grade:'chu',entry_no:2},
      {id:'b3',name:'架空他郎',cls:'B',member:'other',grade:'ippan',entry_no:3}
    ]
  ));
  assert(env.calcTotal()===2500, 'T1 calcTotal=2500（女性=chu 同額で合算・member/other 女性とも反映）');

  // 女性のみ: member/josei=0 ・ other/josei=500
  env._setState(fxState(
    [{id:'j1',name:'架空花',cls:'A',member:'member',grade:'josei',entry_no:1}],
    [{id:'j2',name:'架空菊',cls:'B',member:'other',grade:'josei',entry_no:1}]
  ));
  assert(env.calcTotal()===500, 'T2 calcTotal=500（女性のみ: member 0 + other 500）');
}

// ============================================================
// N. 正規化往復: josei を normalizeState 往復 / save→load で取りこぼさない。未知値は ippan 既定。
// ============================================================
{
  const env = loadEnv();
  function rawWithGrades(){
    return {
      players:{A:[
        {id:'n1',name:'架空女',cls:'A',member:'member',grade:'josei',entry_no:1},
        {id:'n2',name:'架空中',cls:'A',member:'other',grade:'chu',entry_no:2},
        {id:'n3',name:'架空般',cls:'A',member:'member',grade:'ippan',entry_no:3},
        {id:'n4',name:'架空謎',cls:'A',member:'member',grade:'dan2',entry_no:4} // 未知値 → ippan 既定
      ],B:[]},
      rounds:0, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
      classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}], report:{}
    };
  }
  const s1 = env.normalizeState(rawWithGrades());
  const g = {}; s1.players.A.forEach(function(p){ g[p.id]=p.grade; });
  assert(g.n1==='josei', 'N1 normalizeState: josei を保持');
  assert(g.n2==='chu',   'N2 normalizeState: chu を保持（非回帰）');
  assert(g.n3==='ippan', 'N3 normalizeState: ippan を保持（非回帰）');
  assert(g.n4==='ippan', 'N4 normalizeState: 未知値(dan2) は ippan 既定（非回帰）');

  // 往復恒等（normalize(normalize)）
  const s2 = env.normalizeState(JSON.parse(JSON.stringify(s1)));
  assert(JSON.stringify(s1)===JSON.stringify(s2), 'N5 normalizeState 往復恒等（josei 含む）');

  // 実 save → load の往復（localStorage mock 経由）
  env._setState(env.normalizeState(rawWithGrades()));
  env.save();
  const stored = JSON.parse(env._ctx.localStorage.getItem(env.STORAGE_KEY));
  const storedJosei = stored.players.A.filter(function(p){return p.id==='n1';})[0];
  assert(storedJosei && storedJosei.grade==='josei', 'N6 save: localStorage に josei が永続化される');
  env._setState(fxState()); // 一旦クリア
  env.load();
  const after = env._getState();
  const reload = {}; after.players.A.forEach(function(p){ reload[p.id]=p.grade; });
  assert(reload.n1==='josei', 'N7 load: reload 後も josei を保持（save→load 往復）');
  assert(reload.n4==='ippan', 'N8 load: reload 後も 未知値→ippan 既定（非回帰）');
}

// ============================================================
// I. 取込（import / master 生成）が josei を保持。外部段位は ippan 既定維持。
// ============================================================
{
  const env = loadEnv();

  // I-1: normalizeBranchMaster — アプリ native master 往復で josei/chu 保持・段位は ippan
  const nbm = env.normalizeBranchMaster({
    schema_version:1,
    members:[
      {id:'m1',name:'架空女',member:'member',grade:'josei'},
      {id:'m2',name:'架空中',member:'other',grade:'chu'},
      {id:'m3',name:'架空段',member:'member',grade:'二段'}, // 外部段位 → ippan 既定
      {id:'m4',name:'架空般',member:'member',grade:'ippan'}
    ]
  });
  const mg = {}; nbm.members.forEach(function(m){ mg[m.id]=m.grade; });
  assert(mg.m1==='josei', 'I1 normalizeBranchMaster: josei を保持（native 往復）');
  assert(mg.m2==='chu',   'I2 normalizeBranchMaster: chu を保持（非回帰）');
  assert(mg.m3==='ippan', 'I3 normalizeBranchMaster: 外部段位「二段」は ippan 既定（方針維持）');
  assert(mg.m4==='ippan', 'I4 normalizeBranchMaster: ippan を保持（非回帰）');

  // I-2: convertPhase2ParticipantsToMembers — josei 保持
  const master0 = {schema_version:1, updated_at:'2026-06-23T00:00:00.000Z', members:[]};
  const conv = env.convertPhase2ParticipantsToMembers(
    [{name:'架空女',member:'member',grade:'josei'},{name:'架空般',member:'other',grade:'ippan'}],
    master0
  );
  assert(conv.success===true, 'I5 convertPhase2ParticipantsToMembers: success');
  assert(conv.members[0].grade==='josei', 'I6 convertPhase2: josei を保持');
  assert(conv.members[1].grade==='ippan', 'I7 convertPhase2: ippan を保持（非回帰）');

  // I-3: addPlayerFromMaster — master member の josei を当日 player へ引き継ぐ
  const master1 = {schema_version:1, members:[
    {id:'mm1',name:'架空女',member:'member',grade:'josei',deleted:false}
  ]};
  const st1 = fxState();
  const addRes = env.addPlayerFromMaster('mm1','A',master1,st1);
  assert(addRes.success===true, 'I8 addPlayerFromMaster: success');
  assert(addRes.player.grade==='josei', 'I9 addPlayerFromMaster: master の josei を player に引き継ぐ');

  // I-4: createMemberFromParticipant — 過去大会 participant の josei を member へ
  const m2 = env.createMemberFromParticipant({name:'架空女',member:'other',grade:'josei',cls:'A'}, {schema_version:1,members:[]}, '2026-06-23');
  assert(m2.grade==='josei', 'I10 createMemberFromParticipant: participant の josei を member に保持');
}

// ============================================================
// E. applyMasterMemberEdit: options.grade='josei' を受理・保持。不正値は拒否。edit で josei 維持。
// ============================================================
{
  const env = loadEnv();
  const master = {schema_version:1, members:[
    {id:'e1',name:'架空般',yomi:'',member:'member',grade:'ippan',deleted:false,last_class:null,city:''}
  ]};
  const r1 = env.applyMasterMemberEdit('e1','架空般','', master, {grade:'josei'});
  assert(r1.success===true, 'E1 applyMasterMemberEdit: options.grade=josei を受理');
  assert(master.members[0].grade==='josei', 'E2 edit: 対象 member の grade が josei に更新・保持');

  // 既に josei の member を別項目だけ編集 → josei 維持
  const r2 = env.applyMasterMemberEdit('e1','架空姫','', master, {member:'other'});
  assert(r2.success===true && master.members[0].grade==='josei', 'E3 edit: grade 無指定の編集で josei が維持される');

  // 不正値は拒否（invalid_grade_value）し target を変更しない
  const before = master.members[0].grade;
  const r3 = env.applyMasterMemberEdit('e1','架空姫','', master, {grade:'xyz'});
  assert(r3.success===false && r3.error==='invalid_grade_value', 'E4 edit: 不正な grade 値は invalid_grade_value で拒否');
  assert(master.members[0].grade===before, 'E5 edit: 拒否時は grade を変更しない');
}

// ============================================================
// M. マスタ一覧（buildMasterTabHtml）: ヘッダ「会費区分」/ josei 行ラベル「女性」。
// ============================================================
{
  const env = loadEnv();
  env._setState(fxState());
  const masterHtml = env.buildMasterTabHtml({schema_version:1, members:[
    {id:'mz1',name:'架空女',yomi:'',member:'member',grade:'josei',deleted:false,last_attended:'2026-06-01',attendance_count:1,tournament_ids:['t'],city:''},
    {id:'mz2',name:'架空中',yomi:'',member:'other',grade:'chu',deleted:false,last_attended:'2026-05-01',attendance_count:1,tournament_ids:['t'],city:''},
    {id:'mz3',name:'架空般',yomi:'',member:'member',grade:'ippan',deleted:false,last_attended:'2026-04-01',attendance_count:1,tournament_ids:['t'],city:''}
  ]});
  assert(masterHtml.indexOf('会費区分')>=0, 'M1 マスタ一覧ヘッダが「会費区分」（中学生以下区分から変更）');
  assert(masterHtml.indexOf('中学生以下区分')<0, 'M2 旧ヘッダ「中学生以下区分」は残存しない');
  assert(masterHtml.indexOf('女性')>=0, 'M3 josei member の行ラベルに「女性」を表示');
  // 既存ラベル（中学 / 一般）は非回帰で残る
  assert(masterHtml.indexOf('中学')>=0, 'M4 chu ラベル「中学」は非回帰で残る');
  assert(masterHtml.indexOf('一般')>=0, 'M5 ippan ラベル「一般」は非回帰で残る');
}

// ============================================================
// U. 入力UI: 編集モーダルの女性 radio / 受付一覧 行の会費区分 select の女性 option。
// ============================================================
{
  const env = loadEnv();

  // U-1: buildMasterEditModalHtml — legend「会費区分」+ josei radio（既存値 josei で checked）
  const modalJosei = env.buildMasterEditModalHtml({id:'u1',name:'架空女',yomi:'',member:'member',grade:'josei',last_class:null,city:''});
  assert(modalJosei.indexOf('会費区分')>=0, 'U1 編集モーダルの fieldset legend が「会費区分」');
  assert(modalJosei.indexOf('value="josei"')>=0, 'U2 編集モーダルに女性 radio（value="josei"）が存在');
  // josei の member を開いたら josei radio が checked
  const joseiRadioIdx = modalJosei.indexOf('value="josei"');
  assert(modalJosei.slice(joseiRadioIdx, joseiRadioIdx+60).indexOf('checked')>=0, 'U3 grade=josei の member は女性 radio が checked');

  // ippan の member を開いたら josei radio は未 checked（非回帰の確認）
  const modalIppan = env.buildMasterEditModalHtml({id:'u2',name:'架空般',yomi:'',member:'member',grade:'ippan',last_class:null,city:''});
  const joseiIdx2 = modalIppan.indexOf('value="josei"');
  assert(modalIppan.slice(joseiIdx2, joseiIdx2+60).indexOf('checked')<0, 'U4 grade=ippan の member は女性 radio が未 checked');

  // U-2: makePlayerRow — 会費区分 select に女性 option（value=josei）が存在し、josei player では選択状態
  env._setState(fxState([{id:'pr1',name:'架空女',cls:'A',member:'member',grade:'josei',entry_no:1,yomi:''}]));
  const row = env.makePlayerRow({id:'pr1',name:'架空女',cls:'A',member:'member',grade:'josei',entry_no:1,yomi:''},'A',0);
  const opts = collectOptions(row);
  const joseiOpt = opts.filter(function(o){return o.value==='josei';})[0];
  assert(!!joseiOpt, 'U5 受付一覧行の会費区分 select に女性 option（value=josei）が存在');
  assert(joseiOpt && joseiOpt.textContent==='女性', 'U6 女性 option のラベルが「女性」');
  assert(joseiOpt && joseiOpt.selected===true, 'U7 grade=josei の player は女性 option が selected');

  // ippan player では女性 option は未選択（非回帰）
  env._setState(fxState([{id:'pr2',name:'架空般',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''}]));
  const row2 = env.makePlayerRow({id:'pr2',name:'架空般',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},'A',0);
  const opts2 = collectOptions(row2);
  const joseiOpt2 = opts2.filter(function(o){return o.value==='josei';})[0];
  assert(joseiOpt2 && joseiOpt2.selected!==true, 'U8 grade=ippan の player は女性 option が未選択（非回帰）');
}

console.log('FEE-JOSEI-001: pass='+pass+' fail='+fail);
process.exit(fail?1:0);
