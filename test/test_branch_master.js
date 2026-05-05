#!/usr/bin/env node
// 支部マスタ機能の性質テスト・破損テスト・二重加算防止テスト・同名異人テスト
// (Phase A-1, 仕様書 v4 7.1〜7.6 / 実装プロンプト §3.1.1〜3.1.5 準拠)

const fs = require('fs');

function extractScripts(path) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(opts) {
  const elements = {};
  function makeElem(id) {
    return {
      id: id || '',
      _innerHTML: '',
      style: { _cssText: '', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      className: '',
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(){},
      appendChild(){},
      remove(){},
      focus(){},
      click(){},
      value: '',
      firstChild: null,
      getAttribute(){return null;},
      setAttribute(){}
    };
  }
  const docMock = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElem(id);
      return elements[id];
    },
    createElement(tag){return makeElem();},
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){},
    querySelectorAll(){return [];}
  };
  const winMock = { innerWidth: 1024 };
  const localStorageMock = {_:{}, getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;}, setItem(k,v){this._[k]=String(v);}, removeItem(k){delete this._[k];}};
  const defaultCrypto = {
    randomUUID(){
      const chars='abcdef0123456789';
      let s='';
      for(let i=0;i<32;i++)s+=chars[Math.floor(Math.random()*chars.length)];
      return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20,32);
    }
  };
  let cryptoOut;
  if (opts && opts.noCrypto) cryptoOut = undefined;
  else if (opts && opts.crypto) cryptoOut = opts.crypto;
  else cryptoOut = defaultCrypto;
  return {
    document: docMock,
    window: winMock,
    localStorage: localStorageMock,
    crypto: cryptoOut
  };
}

function loadEnv(path, opts) {
  const ctx = makeContext(opts);
  const js = extractScripts(path);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       BRANCH_MASTER_SCHEMA_VERSION:BRANCH_MASTER_SCHEMA_VERSION,
       createEmptyBranchMaster:createEmptyBranchMaster,
       generateMemberId:generateMemberId,
       normalizePersonName:normalizePersonName,
       normalizeYomi:normalizeYomi,
       getYomiInitialRow:getYomiInitialRow,
       matchesPastParticipantQuery:matchesPastParticipantQuery,
       buildPastParticipantsPanelHtml:buildPastParticipantsPanelHtml,
       buildYomiInputModalHtml:buildYomiInputModalHtml,
       applyYomiInputsToMaster:applyYomiInputsToMaster,
       buildMigrationModalHtml:buildMigrationModalHtml,
       parseTournamentTextInput:parseTournamentTextInput,
       _phaseA2State:_phaseA2State,
       isValidYmd:isValidYmd,
       todayYmd:todayYmd,
       normalizeBranchMaster:normalizeBranchMaster,
       loadBranchMaster:loadBranchMaster,
       saveBranchMaster:saveBranchMaster,
       findMemberCandidates:findMemberCandidates,
       findMasterSuggestions:findMasterSuggestions,
       applyMasterMemberEdit:applyMasterMemberEdit,
       applyMasterMemberDelete:applyMasterMemberDelete,
       applyMasterMemberRestore:applyMasterMemberRestore,
       serializeBranchMasterForExport:serializeBranchMasterForExport,
       buildMasterExportFilename:buildMasterExportFilename,
       detectImportFormat:detectImportFormat,
       applyOverwriteImport:applyOverwriteImport,
       applyMergeImport:applyMergeImport,
       safeParseImportText:safeParseImportText,
       applyQuickFilter:applyQuickFilter,
       computeLatestAttendedDate:computeLatestAttendedDate,
       computeDateBefore:computeDateBefore,
       QUICK_FILTER_RECENT_LAST:QUICK_FILTER_RECENT_LAST,
       QUICK_FILTER_WITHIN_3MO:QUICK_FILTER_WITHIN_3MO,
       QUICK_FILTER_REGULAR:QUICK_FILTER_REGULAR,
       ensureTournamentId:ensureTournamentId,
       attachMemberIdToPlayer:attachMemberIdToPlayer,
       addTournamentIdOnce:addTournamentIdOnce,
       recalcMemberAttendance:recalcMemberAttendance,
       createMemberFromParticipant:createMemberFromParticipant,
       updateBranchMasterFromTournament:updateBranchMasterFromTournament,
       deriveTournamentMetaForMigration:deriveTournamentMetaForMigration,
       mergeTournamentParticipantsIntoMaster:mergeTournamentParticipantsIntoMaster,
       normalizeState:normalizeState,
       syncBranchMasterOnSave:syncBranchMasterOnSave,
       _localStorage:localStorage,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  return fn(ctx.document, ctx.window, ctx.localStorage, ctx.crypto, ()=>{}, ()=>true, ()=>'', function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}}, console, Promise);
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_branch_master.js <html>');
  process.exit(1);
}

let pass=0, fail=0;
function ok(msg){pass++;}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg); else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(msg); else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

const env = loadEnv(targetPath);

// ============================================================
// 6.2.1 ユニットテスト
// ============================================================

// generateMemberId
{
  const m = env.createEmptyBranchMaster();
  const id = env.generateMemberId(m);
  assert(typeof id==='string' && id.indexOf('m_')===0, 'generateMemberId: prefix m_');
  assert(id.length===14, 'generateMemberId: total length 14 (m_ + 12)');
  assert(id.indexOf('-')===-1, 'generateMemberId: ハイフン非含有（必ず replace 後 slice）');

  const seen={};
  let dup=false;
  for(let i=0;i<10000;i++){
    const x=env.generateMemberId(m);
    if(seen[x]){dup=true;break;}
    seen[x]=true;
  }
  assert(!dup, 'generateMemberId: 10000回ループで衝突なし');

  m.members.push({id:'m_aaaaaaaaaaaa',name:'X',yomi:'',last_class:null,last_attended:'2026-01-01',first_attended:'2026-01-01',attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:''});
  const id2 = env.generateMemberId(m);
  assert(id2!=='m_aaaaaaaaaaaa', 'generateMemberId: 既存IDと衝突しない（衝突再生成）');
}

// generateMemberId: 3回連続衝突で throw
{
  const collidingCrypto = { randomUUID:()=>'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };
  const env2 = loadEnv(targetPath, {crypto:collidingCrypto});
  const m = env2.createEmptyBranchMaster();
  m.members.push({id:'m_aaaaaaaaaaaa',name:'Z',yomi:'',last_class:null,last_attended:'2026-01-01',first_attended:'2026-01-01',attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:''});
  let threw=false;
  try { env2.generateMemberId(m); } catch(e){ threw=true; }
  assert(threw, 'generateMemberId: 3回連続衝突で throw');
}

// generateMemberId: 確実にハイフン除去後に slice しているか（文字列特性チェック）
{
  // UUID 文字目8番目はハイフン。slice(0,12) を replace の前に行うとハイフンが残る。
  // 直接実装の挙動を確認するため、固定 UUID で生成 ID を見る。
  const fixedCrypto = { randomUUID:()=>'12345678-90ab-cdef-1234-567890abcdef' };
  const envF = loadEnv(targetPath, {crypto:fixedCrypto});
  const m = envF.createEmptyBranchMaster();
  let id='';
  try { id = envF.generateMemberId(m); } catch(e){}
  // 期待値: 'm_' + '1234567890ab'（ハイフン除去後12文字）
  assert(id==='m_1234567890ab', 'generateMemberId: replace を slice より先に適用（'+id+'）');
}

// normalizePersonName
{
  assertEq(env.normalizePersonName('  山田 太郎  '),'山田 太郎','normalizePersonName: 前後空白除去');
  assertEq(env.normalizePersonName('山田　太郎'),'山田 太郎','normalizePersonName: 全角空白を半角に');
  assertEq(env.normalizePersonName('山田  太郎'),'山田 太郎','normalizePersonName: 連続半角空白を単一に');
  assertEq(env.normalizePersonName('山田　　太郎'),'山田 太郎','normalizePersonName: 連続全角空白も単一半角に');
  assertEq(env.normalizePersonName(null),'','normalizePersonName: null は空文字');
  assertEq(env.normalizePersonName(undefined),'','normalizePersonName: undefined は空文字');
  assertEq(env.normalizePersonName(123),'','normalizePersonName: 非文字列は空文字');
}

// ensureTournamentId
{
  const master = env.createEmptyBranchMaster();
  const today = env.todayYmd();
  const baseId = 't_'+today.replace(/-/g,'_');

  const state1 = {players:{A:[],B:[]}};
  const id1 = env.ensureTournamentId(state1, master);
  assert(id1===baseId, 'ensureTournamentId: 初回は base ID');
  assert(state1.tournament_id===baseId, 'ensureTournamentId: state に書き戻す');

  master.members.push({id:'m_001',name:'X',yomi:'',last_class:null,last_attended:today,first_attended:today,attendance_count:1,tournament_ids:[id1],deleted:false,deleted_at:null,note:''});
  const state2 = {players:{A:[],B:[]}};
  const id2 = env.ensureTournamentId(state2, master);
  assert(id2===baseId+'_2', 'ensureTournamentId: 同日重複時に _2 suffix');

  master.members.push({id:'m_002',name:'Y',yomi:'',last_class:null,last_attended:today,first_attended:today,attendance_count:1,tournament_ids:[id2],deleted:false,deleted_at:null,note:''});
  const state3 = {players:{A:[],B:[]}};
  const id3 = env.ensureTournamentId(state3, master);
  assert(id3===baseId+'_3', 'ensureTournamentId: 続けて _3 suffix');

  const state4 = {players:{A:[],B:[]}, tournament_id:'t_existing'};
  const id4 = env.ensureTournamentId(state4, master);
  assert(id4==='t_existing', 'ensureTournamentId: 既存 tournament_id を保持');
}

// addTournamentIdOnce
{
  const m = {tournament_ids:[]};
  assert(env.addTournamentIdOnce(m,'t1')===true, 'addTournamentIdOnce: 初回追加で true');
  assert(env.addTournamentIdOnce(m,'t1')===false, 'addTournamentIdOnce: 同IDで false（二重加算防止）');
  assert(env.addTournamentIdOnce(m,'t2')===true, 'addTournamentIdOnce: 別IDで true');
  assertEq(m.tournament_ids,['t1','t2'],'addTournamentIdOnce: 配列に重複なし');
}

// recalcMemberAttendance
{
  const m = {tournament_ids:['t1','t2','t3'],attendance_count:99};
  env.recalcMemberAttendance(m);
  assert(m.attendance_count===3,'recalcMemberAttendance: tournament_ids.length に再計算');
  const m2 = {tournament_ids:[],attendance_count:5};
  env.recalcMemberAttendance(m2);
  assert(m2.attendance_count===0,'recalcMemberAttendance: 空配列で 0');
}

// ============================================================
// 6.2.2 normalizeBranchMaster 破損テスト（仕様書 7.4）
// ============================================================
{
  assert(env.normalizeBranchMaster(null).members.length===0,'normalizeBranchMaster: null → 空マスタ');
  assert(env.normalizeBranchMaster(undefined).members.length===0,'normalizeBranchMaster: undefined → 空マスタ');
  assert(env.normalizeBranchMaster('string').members.length===0,'normalizeBranchMaster: 文字列 → 空マスタ');
  assert(env.normalizeBranchMaster(123).members.length===0,'normalizeBranchMaster: 数値 → 空マスタ');
  assert(env.normalizeBranchMaster([]).members.length===0,'normalizeBranchMaster: 配列 → 空マスタ');

  // schema_version 不在 → 1 扱いで読み続ける
  const r1 = env.normalizeBranchMaster({members:[{id:'m_001',name:'A',tournament_ids:[]}]});
  assert(r1.members.length===1,'normalizeBranchMaster: schema_version 不在 → 1 扱い');

  // schema_version 未知 → 空マスタ
  const r2 = env.normalizeBranchMaster({schema_version:999,members:[{id:'m_001',name:'A'}]});
  assert(r2.members.length===0,'normalizeBranchMaster: schema_version 未知 → 空マスタ');

  // members 非配列 → 空配列
  const r3 = env.normalizeBranchMaster({schema_version:1,members:'not array'});
  assert(r3.members.length===0,'normalizeBranchMaster: members 非配列 → 空配列');

  // tournament_ids 不在
  const r4 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A'}]});
  assertEq(r4.members[0].tournament_ids,[],'normalizeBranchMaster: tournament_ids 不在 → []');

  // tournament_ids 非配列
  const r5 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A',tournament_ids:'oops'}]});
  assertEq(r5.members[0].tournament_ids,[],'normalizeBranchMaster: tournament_ids 非配列 → []');

  // deleted 不在 → false
  const r6 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A'}]});
  assert(r6.members[0].deleted===false,'normalizeBranchMaster: deleted 不在 → false');

  // attendance_count ズレ → tournament_ids.length に再計算
  const r7 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A',tournament_ids:['t1','t2'],attendance_count:99}]});
  assert(r7.members[0].attendance_count===2,'normalizeBranchMaster: attendance_count を tournament_ids.length で再計算');

  // 同 id 重複 → 該当 member 除外
  const r8 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A'},{id:'m_001',name:'B'}]});
  assert(r8.members.length===1,'normalizeBranchMaster: 同 id 重複は除外');

  // 同 tournament_id 重複 → 除去
  const r9 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A',tournament_ids:['t1','t1','t2','t2','t3']}]});
  assertEq(r9.members[0].tournament_ids,['t1','t2','t3'],'normalizeBranchMaster: tournament_id 重複を除去');
  assert(r9.members[0].attendance_count===3,'normalizeBranchMaster: 重複除去後の attendance_count');

  // name 空 / 不在 の member は除外
  const r10 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:''},{id:'m_002',name:'A'},{id:'m_003'}]});
  assert(r10.members.length===1,'normalizeBranchMaster: name 空/不在 は除外');
  assert(r10.members[0].id==='m_002','normalizeBranchMaster: 残ったのは name のある member');

  // last_class 不正 → null
  const r11 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A',last_class:'C'}]});
  assert(r11.members[0].last_class===null,'normalizeBranchMaster: last_class 不正 → null');

  // last_attended 不正 → first_attended で補正、または今日
  const r12 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A',last_attended:'invalid',first_attended:'2026-04-01'}]});
  assert(r12.members[0].last_attended==='2026-04-01','normalizeBranchMaster: last_attended 不正 → first_attended に補正');

  // first_attended 不正 → last_attended で補正
  const r13 = env.normalizeBranchMaster({schema_version:1,members:[{id:'m_001',name:'A',last_attended:'2026-04-01',first_attended:'bad'}]});
  assert(r13.members[0].first_attended==='2026-04-01','normalizeBranchMaster: first_attended 不正 → last_attended に補正');

  // updated_at 不在 → 現在時刻（文字列）
  const r14 = env.normalizeBranchMaster({schema_version:1,members:[]});
  assert(typeof r14.updated_at==='string' && r14.updated_at.length>0,'normalizeBranchMaster: updated_at 不在時に補完');
}

// loadBranchMaster: 破損データを自動で空上書きしない（§3.1.2）
{
  env._localStorage.setItem('shogi_branch_master','{ this is not valid json');
  const before = env._localStorage.getItem('shogi_branch_master');
  const origWarn = console.warn;
  console.warn = function(){}; // 期待される警告を抑止
  const m = env.loadBranchMaster();
  console.warn = origWarn;
  const after = env._localStorage.getItem('shogi_branch_master');
  assert(before===after, 'loadBranchMaster: 破損データを自動で空上書きしない（§3.1.2 復旧不能事故防止）');
  assert(m.members.length===0, 'loadBranchMaster: 破損時は空マスタを返す');
  env._localStorage.removeItem('shogi_branch_master');
}

// ============================================================
// 6.2.3 既存大会運営の非破壊テスト（仕様書 7.3）
// ============================================================
{
  // マスタなしで normalizeState が動く
  const ns = env.normalizeState({players:{A:[{name:'X'}]}});
  assert(ns.players.A.length===1,'normalizeState: マスタなしで動作');
  assert(ns.players.A[0].name==='X','normalizeState: name 保持');
  assert(typeof ns.players.A[0].member_id==='undefined','normalizeState: 既存JSON(member_id なし)は undefined');

  // member_id 保持（§3.1.4）
  const ns2 = env.normalizeState({players:{A:[{name:'X',member_id:'m_abc'}]}});
  assert(ns2.players.A[0].member_id==='m_abc','normalizeState: player.member_id を保持（§3.1.4）');

  // tournament_id 保持
  const ns3 = env.normalizeState({tournament_id:'t_2026_01_01',players:{A:[],B:[]}});
  assert(ns3.tournament_id==='t_2026_01_01','normalizeState: tournament_id を保持');

  // tournament_id なしの旧JSONで undefined
  const ns4 = env.normalizeState({players:{A:[],B:[]}});
  assert(typeof ns4.tournament_id==='undefined','normalizeState: tournament_id なしの旧JSONは undefined');

  // resetAll() のソース静的検査: shogi_branch_master を消していないか（§3.1.5）
  const html = fs.readFileSync(targetPath,'utf8');
  assert(html.indexOf("removeItem('shogi_branch_master')")===-1 && html.indexOf('removeItem("shogi_branch_master")')===-1, 'resetAll/その他: shogi_branch_master を removeItem していない（§3.1.5）');
  assert(html.indexOf('支部マスタは保持されます')>=0, 'resetAll: 確認ダイアログで支部マスタ保持を明示');
}

// ============================================================
// 6.2.4 同名異人テスト（仕様書 7.5）
// ============================================================
{
  const master = env.createEmptyBranchMaster();
  master.members.push({id:'m_001',name:'山田太郎',yomi:'',last_class:'A',last_attended:'2026-04-01',first_attended:'2026-01-01',attendance_count:1,tournament_ids:['t1'],deleted:false,deleted_at:null,note:''});
  master.members.push({id:'m_002',name:'山田太郎',yomi:'',last_class:'B',last_attended:'2026-03-01',first_attended:'2026-02-01',attendance_count:1,tournament_ids:['t2'],deleted:false,deleted_at:null,note:''});

  const c1 = env.findMemberCandidates({name:'山田太郎'},master);
  assert(c1.length===2,'findMemberCandidates: 同名異人 → 複数候補');

  // 仕様書 7.5: 「山田太郎」と「山田 太郎」（空白差）は別人として扱う＝自動統合しない
  const c2 = env.findMemberCandidates({name:'山田 太郎'},master);
  assert(c2.length===0,'findMemberCandidates: 半角空白差は同一視しない（仕様書 7.5 同名異人）');

  // 仕様書 7.5: 「山田太郎」と「山田　太郎」（全角空白）は別人として扱う
  const c3 = env.findMemberCandidates({name:'山田　太郎'},master);
  assert(c3.length===0,'findMemberCandidates: 全角空白差も同一視しない');

  // ただし入力の全角/半角空白の差は normalizePersonName で吸収する
  master.members.push({id:'m_05a',name:'佐藤 一郎',yomi:'',last_class:'A',last_attended:'2026-04-01',first_attended:'2026-01-01',attendance_count:1,tournament_ids:['t5'],deleted:false,deleted_at:null,note:''});
  const c3b = env.findMemberCandidates({name:'佐藤　一郎'},master);
  assert(c3b.length===1,'findMemberCandidates: 全角→半角統一の入力差は吸収（同一人物扱い）');

  // 髙 vs 高 は自動統合しない
  master.members.push({id:'m_003',name:'髙橋',yomi:'',last_class:'A',last_attended:'2026-04-01',first_attended:'2026-01-01',attendance_count:1,tournament_ids:['t3'],deleted:false,deleted_at:null,note:''});
  const c4 = env.findMemberCandidates({name:'高橋'},master);
  assert(c4.length===0,'findMemberCandidates: 髙橋⇔高橋は自動統合しない（§3.4 異体字非対応）');

  // deleted member は候補に含まれない
  master.members.push({id:'m_004',name:'削除太郎',yomi:'',last_class:'A',last_attended:'2026-04-01',first_attended:'2026-01-01',attendance_count:1,tournament_ids:['t4'],deleted:true,deleted_at:'2026-04-15T00:00:00Z',note:''});
  const c5 = env.findMemberCandidates({name:'削除太郎'},master);
  assert(c5.length===0,'findMemberCandidates: deleted=true は候補から除外');
}

// ============================================================
// 6.2.5 二重加算防止テスト（仕様書 7.6）
// ============================================================
{
  const master = env.createEmptyBranchMaster();
  const state = {players:{A:[{id:'p1',name:'佐藤太郎',cls:'A',member:'member',grade:'ippan'}],B:[]}};
  env.ensureTournamentId(state,master);
  const tid = state.tournament_id;

  env.updateBranchMasterFromTournament(state,master,{tournament_id:tid,tournament_date:'2026-04-01'});
  assert(master.members.length===1,'updateBranchMasterFromTournament: 初回で1名追加');
  assert(master.members[0].attendance_count===1,'updateBranchMasterFromTournament: 初回 attendance_count=1');

  // 2回目（同 tournament_id）→ 増えない
  env.updateBranchMasterFromTournament(state,master,{tournament_id:tid,tournament_date:'2026-04-01'});
  assert(master.members.length===1,'updateBranchMasterFromTournament: 2回目でメンバー増えず');
  assert(master.members[0].attendance_count===1,'updateBranchMasterFromTournament: 2回目で attendance_count 不変（二重加算防止）');
  assertEq(master.members[0].tournament_ids,[tid],'updateBranchMasterFromTournament: tournament_ids に重複なし');

  // 別 tournament_id → +1
  env.updateBranchMasterFromTournament(state,master,{tournament_id:'t_2026_05_01',tournament_date:'2026-05-01'});
  assert(master.members[0].attendance_count===2,'updateBranchMasterFromTournament: 別 tournament_id なら +1');
  assertEq(master.members[0].tournament_ids,[tid,'t_2026_05_01'],'updateBranchMasterFromTournament: 別IDが追加');
}

// 統合テスト: 既存JSON(member_id なし)を normalize → 大会同期 → 別JSON(member_id 付与済) → 同期
{
  const master = env.createEmptyBranchMaster();
  // 1回目: 古いJSON 風の state（member_id なし）
  const oldState = env.normalizeState({players:{A:[{name:'山田太郎',cls:'A'}],B:[]},report:{date:'2026年1月15日',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}});
  env.ensureTournamentId(oldState,master);
  env.updateBranchMasterFromTournament(oldState,master,{tournament_id:oldState.tournament_id,tournament_date:'2026-01-15'});
  assert(master.members.length===1,'統合: 古いJSONから新規 member 作成');
  const memberId = master.members[0].id;
  assert(oldState.players.A[0].member_id===memberId,'統合: oldState の player に member_id が紐付けられた');

  // 2回目: 新しいJSON 風の state（member_id 付与済）
  const newState = {tournament_id:'t_2026_02_01',players:{A:[{name:'山田太郎',cls:'A',member_id:memberId}],B:[]}};
  env.updateBranchMasterFromTournament(newState,master,{tournament_id:newState.tournament_id,tournament_date:'2026-02-01'});
  assert(master.members.length===1,'統合: 同一 member_id では新規追加されない');
  assert(master.members[0].attendance_count===2,'統合: 別大会で attendance_count=2');
}

// migration: old JSON で同名複数が既に存在 → 自動統合せず新規
{
  const master = env.createEmptyBranchMaster();
  master.members.push({id:'m_aaa',name:'山田太郎',yomi:'',last_class:'A',last_attended:'2026-04-01',first_attended:'2026-01-01',attendance_count:1,tournament_ids:['t_x'],deleted:false,deleted_at:null,note:''});
  master.members.push({id:'m_bbb',name:'山田太郎',yomi:'',last_class:'B',last_attended:'2026-03-01',first_attended:'2026-02-01',attendance_count:1,tournament_ids:['t_y'],deleted:false,deleted_at:null,note:''});
  const tournaments = [{
    raw:{players:{A:[{name:'山田太郎',cls:'A'}],B:[]},report:{date:'2026年5月1日',place:'',start:'',end:'',sei:'',fuku:'',note:''}},
    filename:'shogi_20260501_1200.json'
  }];
  const summary = env.mergeTournamentParticipantsIntoMaster(tournaments,master);
  assert(master.members.length===3,'mergeTournamentParticipantsIntoMaster: 同名複数候補は自動統合せず新規（仕様書 7.5）');
  assert(summary.added===1,'mergeTournamentParticipantsIntoMaster: 新規追加1名');
}

// ============================================================
// Codex MF #1: tournament_id を大会日ベースで生成（仕様書 v5 §3.3）
// ============================================================
{
  const master = env.createEmptyBranchMaster();
  const state = {players:{A:[],B:[]}};
  const id = env.ensureTournamentId(state, master, '2026-04-15');
  assert(id==='t_2026_04_15','ensureTournamentId: 大会日 2026-04-15 → t_2026_04_15');
  assert(state.tournament_id==='t_2026_04_15','ensureTournamentId: state に大会日ベース ID 書き戻し');

  // 既存 state.tournament_id がある場合は保持される
  const state2 = {players:{A:[],B:[]}, tournament_id:'t_existing'};
  const id2 = env.ensureTournamentId(state2, master, '2026-04-15');
  assert(id2==='t_existing','ensureTournamentId: 既存 tournament_id を保持（大会日が違っても）');

  // 同日重複時の _2 suffix が大会日ベースで付く
  const master2 = env.createEmptyBranchMaster();
  master2.members.push({id:'m_001',name:'X',yomi:'',last_class:null,last_attended:'2026-04-15',first_attended:'2026-04-15',attendance_count:1,tournament_ids:['t_2026_04_15'],deleted:false,deleted_at:null,note:''});
  const state3 = {players:{A:[],B:[]}};
  const id3 = env.ensureTournamentId(state3, master2, '2026-04-15');
  assert(id3==='t_2026_04_15_2','ensureTournamentId: 大会日ベースで _2 suffix');

  // 無効な日付はフォールバックで today
  const state4 = {players:{A:[],B:[]}};
  const id4 = env.ensureTournamentId(state4, master, 'invalid');
  const baseToday='t_'+env.todayYmd().replace(/-/g,'_');
  assert(id4===baseToday,'ensureTournamentId: 無効な大会日は todayYmd() フォールバック');
}

// ============================================================
// Codex MF #2: 同名複数候補時のマスタ同期スキップ（仕様書 v5 §3.4.2 / §3.4.4）
// ============================================================
{
  const master = env.createEmptyBranchMaster();
  // 同名 member を2件登録（既に同名異人が居る状態）
  master.members.push({id:'m_aaa',name:'山田太郎',yomi:'',last_class:'A',last_attended:'2026-03-01',first_attended:'2026-01-01',attendance_count:1,tournament_ids:['t_old1'],deleted:false,deleted_at:null,note:''});
  master.members.push({id:'m_bbb',name:'山田太郎',yomi:'',last_class:'B',last_attended:'2026-03-01',first_attended:'2026-02-01',attendance_count:1,tournament_ids:['t_old2'],deleted:false,deleted_at:null,note:''});
  // 同名 participant を含む大会 state、+ 別名の participant も1名
  const state = {
    tournament_id:'t_2026_04_15',
    players:{
      A:[{id:'p1',name:'山田太郎',cls:'A',member:'member',grade:'ippan'},
         {id:'p2',name:'佐藤花子',cls:'A',member:'member',grade:'ippan'}],
      B:[]
    }
  };
  // console.warn を抑止（期待される警告）
  const origWarn=console.warn;
  console.warn=function(){};
  env.updateBranchMasterFromTournament(state,master,{tournament_id:'t_2026_04_15',tournament_date:'2026-04-15'});
  console.warn=origWarn;

  // 同名 participant の member_id は付与されない
  assert(typeof state.players.A[0].member_id==='undefined','MF#2: 同名複数候補の participant に member_id を付与しない');
  // 既存 same-name members の tournament_ids に t_2026_04_15 が混入していない
  const m_aaa=master.members.filter(x=>x.id==='m_aaa')[0];
  const m_bbb=master.members.filter(x=>x.id==='m_bbb')[0];
  assert(m_aaa.tournament_ids.indexOf('t_2026_04_15')===-1,'MF#2: m_aaa.tournament_ids に新 ID は追加されない');
  assert(m_bbb.tournament_ids.indexOf('t_2026_04_15')===-1,'MF#2: m_bbb.tournament_ids に新 ID は追加されない');
  // attendance_count も増えない
  assert(m_aaa.attendance_count===1,'MF#2: 既存 member の attendance_count 不変');
  assert(m_bbb.attendance_count===1,'MF#2: 既存 member の attendance_count 不変（2件目）');

  // 別名 participant（佐藤花子）は新規作成され、member_id が付与される
  const sato=master.members.filter(x=>x.name==='佐藤花子')[0];
  assert(!!sato,'MF#2: 別名 participant は新規 member として追加される');
  assert(sato.tournament_ids.indexOf('t_2026_04_15')>=0,'MF#2: 別名 participant の tournament_ids に新 ID 追加');
  assert(state.players.A[1].member_id===sato.id,'MF#2: 別名 participant の同期は継続（member_id 付与）');
}

// ============================================================
// Codex MF #3: 破損マスタの saveData 経由保護（仕様書 v5 §3.5）
// ============================================================
{
  // loadBranchMaster は破損 raw に対し _loaded_with_corruption フラグを返す
  env._localStorage.setItem('shogi_branch_master','{ broken json no good');
  const origWarn1=console.warn;
  console.warn=function(){};
  const m1 = env.loadBranchMaster();
  console.warn=origWarn1;
  assert(m1._loaded_with_corruption===true,'MF#3: 破損 raw 読込で _loaded_with_corruption フラグが立つ');

  // saveBranchMaster は永続化時に _loaded_with_corruption を含めない
  const m2 = env.createEmptyBranchMaster();
  m2.members.push({id:'m_x',name:'A',yomi:'',last_class:'A',last_attended:'2026-04-01',first_attended:'2026-04-01',attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:''});
  m2._loaded_with_corruption=true;  // 仮にフラグが付いていても
  env.saveBranchMaster(m2);
  const persisted = JSON.parse(env._localStorage.getItem('shogi_branch_master'));
  assert(typeof persisted._loaded_with_corruption==='undefined','MF#3: saveBranchMaster は _loaded_with_corruption を永続化対象に含めない');

  // クリーンアップ
  env._localStorage.removeItem('shogi_branch_master');
}

// syncBranchMasterOnSave: 破損マスタを上書きしない / save() は継続
{
  const env3 = loadEnv(targetPath);
  // 破損 raw を localStorage にセット
  env3._localStorage.setItem('shogi_branch_master','{ corrupted master raw');
  const before = env3._localStorage.getItem('shogi_branch_master');
  // state を最低限セット（players は空）
  env3._setState({players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'2026年4月15日',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}});
  // shogi_v4 キーは事前に空にしておく
  env3._localStorage.removeItem('shogi_v4');

  const origWarn=console.warn;
  console.warn=function(){};
  env3.syncBranchMasterOnSave();
  console.warn=origWarn;

  const after = env3._localStorage.getItem('shogi_branch_master');
  assert(before===after,'MF#3: syncBranchMasterOnSave 経由でも破損 raw を上書きしない');

  // save() は呼ばれる（大会JSON保存は継続）→ shogi_v4 キーが書かれている
  const stateRaw = env3._localStorage.getItem('shogi_v4');
  assert(typeof stateRaw==='string'&&stateRaw.length>0,'MF#3: 破損マスタ検出時も save() は呼ばれる（大会JSON 保存継続）');

  // クリーンアップ
  env3._localStorage.removeItem('shogi_branch_master');
  env3._localStorage.removeItem('shogi_v4');
}

// ============================================================
// Codex MF #4: crypto.randomUUID 不在時の明示 throw（仕様書 v5 §3.3）
// ============================================================
{
  const envNoCrypto = loadEnv(targetPath, {noCrypto:true});
  const m = envNoCrypto.createEmptyBranchMaster();
  let threw=false; let msg='';
  try { envNoCrypto.generateMemberId(m); } catch(e){ threw=true; msg=String(e&&e.message?e.message:e); }
  assert(threw,'MF#4: crypto.randomUUID 不在で generateMemberId が throw');
  assert(msg.indexOf('crypto.randomUUID')>=0,'MF#4: throw メッセージに crypto.randomUUID 言及あり（古環境向け案内）');

  // 不正な 'm_' のみの ID が member.id として保存されていないこと
  // （generateMemberId が throw するため、createMemberFromParticipant 経由でも作成不可）
  let createdInvalid=false;
  try {
    envNoCrypto.createMemberFromParticipant({name:'X',cls:'A'},m,'2026-04-15');
    // 例外なしで member が返ったら「m_」だけかチェック
    createdInvalid=true;
  } catch(e){
    // 期待: throw される
  }
  assert(!createdInvalid,'MF#4: crypto 不在では createMemberFromParticipant も throw（不正 m_ ID 非保存）');
}

// ============================================================
// Codex Minor: isValidYmd の実在検証強化（仕様書 v5 §3.5）
// ============================================================
{
  // 形式上は valid だが実在しない日付
  assert(env.isValidYmd('2026-99-99')===false,'isValidYmd: 2026-99-99 → false（実在しない月日）');
  assert(env.isValidYmd('2026-02-30')===false,'isValidYmd: 2026-02-30 → false（2月30日は実在しない）');
  assert(env.isValidYmd('2026-13-01')===false,'isValidYmd: 2026-13-01 → false（13月は実在しない）');
  assert(env.isValidYmd('2026-04-31')===false,'isValidYmd: 2026-04-31 → false（4月31日は実在しない）');

  // うるう年判定
  assert(env.isValidYmd('2026-02-29')===false,'isValidYmd: 2026-02-29 → false（2026 はうるう年でない）');
  assert(env.isValidYmd('2024-02-29')===true,'isValidYmd: 2024-02-29 → true（2024 はうるう年）');
  assert(env.isValidYmd('2000-02-29')===true,'isValidYmd: 2000-02-29 → true（400年ルールでうるう年）');
  assert(env.isValidYmd('1900-02-29')===false,'isValidYmd: 1900-02-29 → false（100年ルールでうるう年でない）');

  // 正常系
  assert(env.isValidYmd('2026-04-15')===true,'isValidYmd: 2026-04-15 → true（正常）');
  assert(env.isValidYmd('2026-01-01')===true,'isValidYmd: 2026-01-01 → true（正常）');
  assert(env.isValidYmd('2026-12-31')===true,'isValidYmd: 2026-12-31 → true（正常）');

  // 形式不正・型不正
  assert(env.isValidYmd('2026/04/15')===false,'isValidYmd: スラッシュ区切り → false');
  assert(env.isValidYmd('not a date')===false,'isValidYmd: 文字列でも形式違反 → false');
  assert(env.isValidYmd(null)===false,'isValidYmd: null → false');
  assert(env.isValidYmd(undefined)===false,'isValidYmd: undefined → false');
  assert(env.isValidYmd(20260415)===false,'isValidYmd: 数値 → false');
}

// ============================================================
// Phase A-2 §3.4 / §3.5: normalizeYomi / getYomiInitialRow
// ============================================================

// normalizeYomi
{
  // カタカナ → ひらがな変換
  assertEq(env.normalizeYomi('ヤマダ'),'やまだ','normalizeYomi: 全角カタカナ → ひらがな');
  assertEq(env.normalizeYomi('サトウタロウ'),'さとうたろう','normalizeYomi: 複数文字カタカナ → ひらがな');

  // 前後空白除去
  assertEq(env.normalizeYomi('  たろう  '),'たろう','normalizeYomi: 前後半角空白除去');
  assertEq(env.normalizeYomi('　たろう　'),'たろう','normalizeYomi: 前後全角空白除去');

  // 全角・半角空白の削除（途中含めて削除）
  assertEq(env.normalizeYomi('やまだ たろう'),'やまだたろう','normalizeYomi: 途中半角空白削除');
  assertEq(env.normalizeYomi('やまだ　たろう'),'やまだたろう','normalizeYomi: 途中全角空白削除');

  // 長音符（ー）保持
  assertEq(env.normalizeYomi('らーめん'),'らーめん','normalizeYomi: 長音符保持');
  assertEq(env.normalizeYomi('ラーメン'),'らーめん','normalizeYomi: カタカナ＋長音符 → ひらがな＋長音符');

  // 小書き文字保持
  assertEq(env.normalizeYomi('しゃーろっく'),'しゃーろっく','normalizeYomi: 小書き文字保持（ゃ・っ）');

  // 空文字・null・undefined・非文字列 → 空文字
  assertEq(env.normalizeYomi(''),'','normalizeYomi: 空文字は空文字');
  assertEq(env.normalizeYomi(null),'','normalizeYomi: null は空文字');
  assertEq(env.normalizeYomi(undefined),'','normalizeYomi: undefined は空文字');
  assertEq(env.normalizeYomi(123),'','normalizeYomi: 数値は空文字');
  assertEq(env.normalizeYomi({}),'','normalizeYomi: オブジェクトは空文字');

  // ヴ → ゔ、ヵ → ゕ、ヶ → ゖ
  assertEq(env.normalizeYomi('ヴァイオリン'),'ゔぁいおりん','normalizeYomi: ヴ → ゔ');
  assertEq(env.normalizeYomi('ヵヶ'),'ゕゖ','normalizeYomi: ヵ → ゕ、ヶ → ゖ');

  // 半角カナはそのまま（A-2 非対応明記、ChatGPT M2 反映）
  assertEq(env.normalizeYomi('ｻﾄｳ'),'ｻﾄｳ','normalizeYomi: 半角カナは変換しない（A-2 非対応）');
}

// getYomiInitialRow
{
  // 各行の判定（清音）
  assertEq(env.getYomiInitialRow('あい'),'a','getYomiInitialRow: あ → a 行');
  assertEq(env.getYomiInitialRow('かき'),'ka','getYomiInitialRow: か → ka 行');
  assertEq(env.getYomiInitialRow('さし'),'sa','getYomiInitialRow: さ → sa 行');
  assertEq(env.getYomiInitialRow('たち'),'ta','getYomiInitialRow: た → ta 行');
  assertEq(env.getYomiInitialRow('なに'),'na','getYomiInitialRow: な → na 行');
  assertEq(env.getYomiInitialRow('はひ'),'ha','getYomiInitialRow: は → ha 行');
  assertEq(env.getYomiInitialRow('まみ'),'ma','getYomiInitialRow: ま → ma 行');
  assertEq(env.getYomiInitialRow('やゆ'),'ya','getYomiInitialRow: や → ya 行');
  assertEq(env.getYomiInitialRow('らり'),'ra','getYomiInitialRow: ら → ra 行');
  assertEq(env.getYomiInitialRow('わを'),'wa','getYomiInitialRow: わ → wa 行');

  // 濁音・半濁音は同行
  assertEq(env.getYomiInitialRow('がっこう'),'ka','getYomiInitialRow: が → ka 行（濁音）');
  assertEq(env.getYomiInitialRow('ざるそば'),'sa','getYomiInitialRow: ざ → sa 行（濁音）');
  assertEq(env.getYomiInitialRow('だるま'),'ta','getYomiInitialRow: だ → ta 行（濁音）');
  assertEq(env.getYomiInitialRow('ばんごう'),'ha','getYomiInitialRow: ば → ha 行（濁音）');
  assertEq(env.getYomiInitialRow('ぱんだ'),'ha','getYomiInitialRow: ぱ → ha 行（半濁音）');

  // 小書き文字も同行
  assertEq(env.getYomiInitialRow('ぁ'),'a','getYomiInitialRow: ぁ → a 行（小書き）');
  assertEq(env.getYomiInitialRow('ょ'),'ya','getYomiInitialRow: ょ → ya 行（小書き）');
  assertEq(env.getYomiInitialRow('っ'),'ta','getYomiInitialRow: っ → ta 行（小書き）');

  // 「他」判定
  assertEq(env.getYomiInitialRow(''),'other','getYomiInitialRow: 空文字 → other');
  assertEq(env.getYomiInitialRow(null),'other','getYomiInitialRow: null → other');
  assertEq(env.getYomiInitialRow(undefined),'other','getYomiInitialRow: undefined → other');
  assertEq(env.getYomiInitialRow('ゔ'),'other','getYomiInitialRow: ゔ（ヴ由来）→ other');
  assertEq(env.getYomiInitialRow('ゕ'),'other','getYomiInitialRow: ゕ（ヵ由来）→ other');
  assertEq(env.getYomiInitialRow('ゖ'),'other','getYomiInitialRow: ゖ（ヶ由来）→ other');
  assertEq(env.getYomiInitialRow('ｻﾄｳ'),'other','getYomiInitialRow: 半角カナ → other（A-2 非対応）');
  assertEq(env.getYomiInitialRow('123'),'other','getYomiInitialRow: 数字 → other');
  assertEq(env.getYomiInitialRow('Smith'),'other','getYomiInitialRow: アルファベット → other');
  assertEq(env.getYomiInitialRow('!?'),'other','getYomiInitialRow: 記号 → other');
  assertEq(env.getYomiInitialRow('ーらん'),'other','getYomiInitialRow: 先頭長音符 → other');
}

// ============================================================
// Phase A-2 §3.2: F5b ふりがな検索（matchesPastParticipantQuery）
// ============================================================

{
  var mYama={id:'m_y',name:'山田 太郎',yomi:'やまだたろう',last_class:null,last_attended:'2026-04-01',first_attended:'2026-04-01',attendance_count:1,tournament_ids:[],deleted:false,deleted_at:null,note:''};
  var mSato={id:'m_s',name:'佐藤次郎',yomi:'さとうじろう',last_class:null,last_attended:'2026-04-01',first_attended:'2026-04-01',attendance_count:1,tournament_ids:[],deleted:false,deleted_at:null,note:''};
  var mNoYomi={id:'m_n',name:'田中三郎',yomi:'',last_class:null,last_attended:'2026-04-01',first_attended:'2026-04-01',attendance_count:1,tournament_ids:[],deleted:false,deleted_at:null,note:''};
  var mForeign={id:'m_f',name:'Smith',yomi:'',last_class:null,last_attended:'2026-04-01',first_attended:'2026-04-01',attendance_count:1,tournament_ids:[],deleted:false,deleted_at:null,note:''};

  // 空 query → 全件
  assert(env.matchesPastParticipantQuery(mYama,'')===true,'matchesQuery: 空 query → true');
  assert(env.matchesPastParticipantQuery(mNoYomi,'')===true,'matchesQuery: 空 query は yomi 空でも true');

  // 漢字一致のみ → ヒット（既存動作維持）
  assert(env.matchesPastParticipantQuery(mYama,'山田')===true,'matchesQuery: 漢字部分一致でヒット');
  assert(env.matchesPastParticipantQuery(mYama,'太郎')===true,'matchesQuery: 名側の漢字部分一致でもヒット');

  // ふりがな一致のみ → ヒット
  assert(env.matchesPastParticipantQuery(mYama,'やまだ')===true,'matchesQuery: ひらがな yomi 部分一致でヒット');
  assert(env.matchesPastParticipantQuery(mSato,'さとう')===true,'matchesQuery: ひらがな yomi 部分一致でヒット（佐藤）');

  // カタカナ入力（「サトウ」）→「さとう」と同じヒット
  assert(env.matchesPastParticipantQuery(mSato,'サトウ')===true,'matchesQuery: カタカナ入力でヒット（normalizeYomi 経由）');
  assert(env.matchesPastParticipantQuery(mYama,'ヤマダ')===true,'matchesQuery: カタカナ入力でヒット（山田）');

  // 両方一致 → boolean なので1回のみヒット（filter で重複しない）
  assert(env.matchesPastParticipantQuery(mYama,'やまだ')===true,'matchesQuery: 両方一致でも boolean true（重複なし）');

  // どちらも不一致 → ヒットせず
  assert(env.matchesPastParticipantQuery(mYama,'鈴木')===false,'matchesQuery: 不一致漢字 → false');
  assert(env.matchesPastParticipantQuery(mYama,'すずき')===false,'matchesQuery: 不一致ふりがな → false');

  // ローマ字（「sa」）→ A-2 では非対応 → 漢字 name に sa が入っていない限り false
  assert(env.matchesPastParticipantQuery(mSato,'sa')===false,'matchesQuery: ローマ字検索は非対応');

  // yomi 空の member → 漢字でしか引けない
  assert(env.matchesPastParticipantQuery(mNoYomi,'田中')===true,'matchesQuery: yomi 空でも漢字で引ける');
  assert(env.matchesPastParticipantQuery(mNoYomi,'たなか')===false,'matchesQuery: yomi 空はふりがなで引けない');

  // 外国名（yomi 空 + 漢字でない name）
  assert(env.matchesPastParticipantQuery(mForeign,'Smith')===true,'matchesQuery: 外国名は name 一致で引ける');
  assert(env.matchesPastParticipantQuery(mForeign,'すみす')===false,'matchesQuery: yomi 空の外国名はふりがなで引けない');

  // プレースホルダ確認
  var master={schema_version:1,updated_at:'2026-04-01',members:[mYama,mSato]};
  var html=env.buildPastParticipantsPanelHtml(master,'');
  assert(html.indexOf('placeholder="氏名で検索（漢字・ふりがな）"')>=0,'F5b: 検索ボックスのプレースホルダが「漢字・ふりがな」に更新されている');
  assert(html.indexOf('placeholder="氏名で検索（漢字部分一致）"')<0,'F5b: 旧プレースホルダ「漢字部分一致」が残っていない');

  // フィルタ統合: パネル HTML でカタカナ入力でも該当 member のみ含む
  var htmlKana=env.buildPastParticipantsPanelHtml(master,'サトウ');
  assert(htmlKana.indexOf('佐藤次郎')>=0,'F5b: カタカナ「サトウ」検索で佐藤次郎が表示される');
  assert(htmlKana.indexOf('山田 太郎')<0,'F5b: カタカナ「サトウ」検索で山田太郎は表示されない');
}

// ============================================================
// Phase A-2 §3.3 / §4.1: F6 50音タブ
// ============================================================

{
  function mkMember(id,name,yomi){
    return {id:id,name:name,yomi:yomi,last_class:null,last_attended:'2026-04-01',first_attended:'2026-04-01',attendance_count:1,tournament_ids:[],deleted:false,deleted_at:null,note:''};
  }
  // 各行を満たす member を用意
  var mAi=mkMember('m_a','青木','あおき');
  var mKa=mkMember('m_k','加藤','かとう');
  var mSa=mkMember('m_s','佐藤','さとう');
  var mTa=mkMember('m_t','田中','たなか');
  var mNa=mkMember('m_n','中村','なかむら');
  var mHa=mkMember('m_h','橋本','はしもと');
  var mMa=mkMember('m_m','松本','まつもと');
  var mYa=mkMember('m_y','山田','やまだ');
  var mRa=mkMember('m_r','林','りん');
  var mWa=mkMember('m_w','渡辺','わたなべ');
  var mGa=mkMember('m_g','後藤','ごとう'); // 濁音 → ka 行
  var mPa=mkMember('m_p','坂東','ばんどう'); // 濁音 → ha 行
  var mEmpty=mkMember('m_e','匿名一郎',''); // yomi 空 → 他
  var mForeign=mkMember('m_f','Smith','smith'); // ローマ字 yomi → 他
  var mNum=mkMember('m_d','123','123'); // 数字 yomi → 他

  var master={schema_version:1,updated_at:'2026-04-01',members:[mAi,mKa,mSa,mTa,mNa,mHa,mMa,mYa,mRa,mWa,mGa,mPa,mEmpty,mForeign,mNum]};

  // 「全」タブで全 member 表示
  var htmlAll=env.buildPastParticipantsPanelHtml(master,'','all');
  for(var im=0;im<master.members.length;im++){
    assert(htmlAll.indexOf(master.members[im].name)>=0,'F6: 「全」タブで '+master.members[im].name+' が表示');
  }

  // 「あ」タブで a 行のみ表示
  var htmlA=env.buildPastParticipantsPanelHtml(master,'','a');
  assert(htmlA.indexOf('青木')>=0,'F6: 「あ」タブで青木が表示');
  assert(htmlA.indexOf('加藤')<0,'F6: 「あ」タブで加藤は非表示');
  assert(htmlA.indexOf('Smith')<0,'F6: 「あ」タブで Smith は非表示');

  // 「か」タブで濁音「ご」も含む
  var htmlKa=env.buildPastParticipantsPanelHtml(master,'','ka');
  assert(htmlKa.indexOf('加藤')>=0,'F6: 「か」タブで加藤が表示');
  assert(htmlKa.indexOf('後藤')>=0,'F6: 「か」タブで後藤（濁音「ご」）が表示');
  assert(htmlKa.indexOf('佐藤')<0,'F6: 「か」タブで佐藤は非表示');

  // 「は」タブで半濁音/濁音も含む
  var htmlHa=env.buildPastParticipantsPanelHtml(master,'','ha');
  assert(htmlHa.indexOf('橋本')>=0,'F6: 「は」タブで橋本が表示');
  assert(htmlHa.indexOf('坂東')>=0,'F6: 「は」タブで坂東（濁音「ば」）が表示');

  // 「他」タブで yomi 空 + ローマ字 + 数字
  var htmlOther=env.buildPastParticipantsPanelHtml(master,'','other');
  assert(htmlOther.indexOf('匿名一郎')>=0,'F6: 「他」タブで yomi 空 member が表示');
  assert(htmlOther.indexOf('Smith')>=0,'F6: 「他」タブでローマ字 yomi member が表示');
  assert(htmlOther.indexOf('123')>=0,'F6: 「他」タブで数字 yomi member が表示');
  assert(htmlOther.indexOf('青木')<0,'F6: 「他」タブで青木は非表示');

  // yomi 空が「他」タブで先頭に来る
  var idxEmpty=htmlOther.indexOf('匿名一郎');
  var idxSmith=htmlOther.indexOf('Smith');
  assert(idxEmpty>=0&&idxSmith>=0&&idxEmpty<idxSmith,'F6: 「他」タブで yomi 空が先頭、後方に other');

  // タブ + 検索の AND 条件
  var htmlSaAnd=env.buildPastParticipantsPanelHtml(master,'いとう','sa');
  assert(htmlSaAnd.indexOf('佐藤')<0,'F6: タブ「さ」+ 検索「いとう」→ 佐藤は非表示（AND 条件）');

  var htmlSaSatou=env.buildPastParticipantsPanelHtml(master,'さとう','sa');
  assert(htmlSaSatou.indexOf('佐藤')>=0,'F6: タブ「さ」+ 検索「さとう」→ 佐藤が表示');
  assert(htmlSaSatou.indexOf('青木')<0,'F6: タブ「さ」+ 検索「さとう」→ 青木は非表示');

  // 件数保存則: 全タブ件数 = 各行 + 他 の合計
  var rows=['a','ka','sa','ta','na','ha','ma','ya','ra','wa','other'];
  var totalRowCount=0;
  for(var ri=0;ri<rows.length;ri++){
    var rowMembers=master.members.filter(function(m){return env.getYomiInitialRow(env.normalizeYomi(m.yomi))===rows[ri];});
    totalRowCount+=rowMembers.length;
  }
  assertEq(totalRowCount,master.members.length,'F6: 件数保存則（各行 + 他 = 全 member 数）');

  // 50音タブ HTML 構造
  assert(htmlAll.indexOf('class="pp-yomi-tab')>=0,'F6: 50音タブ要素が描画されている');
  assert(htmlAll.indexOf('data-row="all"')>=0,'F6: 「全」タブが描画');
  assert(htmlAll.indexOf('data-row="other"')>=0,'F6: 「他」タブが描画');
  assert(htmlAll.indexOf('他: ふりがな未登録・その他')>=0,'F6 M3: 「他」タブの補足文が表示');

  // active クラスの付与（選択中タブ）
  assert(htmlAll.indexOf('class="pp-yomi-tab active"')>=0&&htmlAll.indexOf('data-row="all"')>=0,'F6: 「全」選択時に active クラス付与');
  var htmlSaTab=env.buildPastParticipantsPanelHtml(master,'','sa');
  // 「さ」が active であることを構造的に確認
  assert(htmlSaTab.indexOf('class="pp-yomi-tab active" data-row="sa"')>=0,'F6: 「さ」選択時に「さ」タブが active');

  // タブ未指定時のデフォルト = all
  var htmlDefault=env.buildPastParticipantsPanelHtml(master,'');
  assert(htmlDefault.indexOf('class="pp-yomi-tab active" data-row="all"')>=0,'F6: yomiRow 未指定はデフォルト all');
}

// ============================================================
// Phase A-2 §3.1 / §4.2: F4 ふりがな入力ダイアログ
// ============================================================

{
  function mkM(id,name,yomi){
    return {id:id,name:name,yomi:yomi||'',last_class:null,last_attended:'2026-04-01',first_attended:'2026-04-01',attendance_count:1,tournament_ids:[],deleted:false,deleted_at:null,note:''};
  }

  // buildYomiInputModalHtml の構造
  var members=[mkM('m_a','山田太郎',''),mkM('m_b','佐藤次郎','')];
  var dlgHtml=env.buildYomiInputModalHtml(members);

  // 各 member の入力欄
  assert(dlgHtml.indexOf('山田太郎')>=0,'F4: ダイアログに山田太郎が表示');
  assert(dlgHtml.indexOf('佐藤次郎')>=0,'F4: ダイアログに佐藤次郎が表示');
  assert(dlgHtml.indexOf('data-mid="m_a"')>=0,'F4: data-mid 属性が member id を保持');
  assert(dlgHtml.indexOf('data-mid="m_b"')>=0,'F4: data-mid 属性が member id を保持');
  assert(dlgHtml.indexOf('inputmode="kana"')>=0,'F4: inputmode=kana でスマホかな入力');

  // ボタン
  assert(dlgHtml.indexOf('id="yomi-cancel"')>=0,'F4: キャンセルボタン存在');
  assert(dlgHtml.indexOf('id="yomi-add"')>=0,'F4: 追加ボタン存在');
  assert(dlgHtml.indexOf('追加する')>=0,'F4: 追加ボタンの文言');
  assert(dlgHtml.indexOf('キャンセル')>=0,'F4: キャンセルボタンの文言');

  // ChatGPT M1 反映: 説明強化
  assert(dlgHtml.indexOf('50音タブ・ふりがな検索で探しやすくなります')>=0,'F4 M1: ダイアログ説明強化文言');
  assert(dlgHtml.indexOf('空欄のままでも追加できます')>=0,'F4 M1: 空欄追加が可能であることを明示');
  assert(dlgHtml.indexOf('キャンセルすると、選択した参加者は追加されません')>=0,'F4 M1: キャンセル補足文');

  // applyYomiInputsToMaster
  // 全員入力済み
  {
    var master={schema_version:1,updated_at:'2026-04-01',members:[mkM('m_a','山田太郎',''),mkM('m_b','佐藤次郎',''),mkM('m_c','田中三郎','たなかさぶろう')]};
    var emptyMs=master.members.slice(0,2);
    var inputs={'m_a':'やまだたろう','m_b':'サトウジロウ'};
    var r=env.applyYomiInputsToMaster(master,emptyMs,inputs);
    assert(r.allEmpty===false,'F4: 全員入力 → allEmpty=false');
    assertEq(r.updatedCount,2,'F4: 全員入力 → 2名更新');
    assertEq(master.members[0].yomi,'やまだたろう','F4: m_a の yomi が保存（normalize 後）');
    assertEq(master.members[1].yomi,'さとうじろう','F4: m_b の yomi が保存（カタカナ→ひらがな）');
    assertEq(master.members[2].yomi,'たなかさぶろう','F4: 既存 yomi の m_c は変更されない');
  }
  // 全員空欄
  {
    var master2={schema_version:1,updated_at:'2026-04-01',members:[mkM('m_a','山田太郎',''),mkM('m_b','佐藤次郎','')]};
    var emptyMs2=master2.members.slice();
    var inputs2={'m_a':'','m_b':'   '};
    var r2=env.applyYomiInputsToMaster(master2,emptyMs2,inputs2);
    assert(r2.allEmpty===true,'F4: 全員空欄 → allEmpty=true');
    assertEq(r2.updatedCount,0,'F4: 全員空欄 → 0名更新');
    assertEq(master2.members[0].yomi,'','F4: 空欄なら yomi 空のまま');
  }
  // 部分入力
  {
    var master3={schema_version:1,updated_at:'2026-04-01',members:[mkM('m_a','A',''),mkM('m_b','B',''),mkM('m_c','C','')]};
    var emptyMs3=master3.members.slice();
    var inputs3={'m_a':'えー','m_b':'','m_c':'しー'};
    var r3=env.applyYomiInputsToMaster(master3,emptyMs3,inputs3);
    assert(r3.allEmpty===false,'F4: 部分入力 → allEmpty=false');
    assertEq(r3.updatedCount,2,'F4: 部分入力 → 入力された2名のみ更新');
    assertEq(master3.members[0].yomi,'えー','F4: 入力ありの m_a は保存');
    assertEq(master3.members[1].yomi,'','F4: 空欄の m_b は変更なし');
    assertEq(master3.members[2].yomi,'しー','F4: 入力ありの m_c は保存');
  }
  // 不正入力（master/inputs なし等）
  {
    var r4=env.applyYomiInputsToMaster(null,[mkM('m_a','A','')],{m_a:'えー'});
    assert(r4.allEmpty===true,'F4: master null → allEmpty=true');
    assertEq(r4.updatedCount,0,'F4: master null → 0名更新');

    var master5={schema_version:1,updated_at:'2026-04-01',members:[mkM('m_a','A','')]};
    var r5=env.applyYomiInputsToMaster(master5,[mkM('m_a','A','')],null);
    assertEq(r5.updatedCount,0,'F4: inputs null → 0名更新');
  }

  // ChatGPT M1 反映: yomi 空が0名のときダイアログの代わりに直接追加されること（条件分岐の基本確認）
  // 実フロー（DOM 含む）は addSelectedPastParticipants だが、テストでは applyYomiInputsToMaster の境界を確認
}

// ============================================================
// Phase A-2 §3.6 / §3.7: Codex Minor #1 / #2
// ============================================================

// Minor #1: 破損マスタ警告
{
  var htmlNormal=env.buildMigrationModalHtml();
  assert(htmlNormal.indexOf('既存の支部マスタが破損していました')<0,'Minor #1: 通常マスタでマイグレ起動 → 警告なし');
  assert(htmlNormal.indexOf('過去大会の統合')>=0,'Minor #1: 通常マスタで本来のヘッダーは表示');

  var htmlOptsFalse=env.buildMigrationModalHtml({corrupted:false});
  assert(htmlOptsFalse.indexOf('既存の支部マスタが破損していました')<0,'Minor #1: corrupted:false でも警告なし');

  var htmlCorrupted=env.buildMigrationModalHtml({corrupted:true});
  assert(htmlCorrupted.indexOf('既存の支部マスタが破損していました')>=0,'Minor #1: 破損マスタ → 警告バナー表示');
  assert(htmlCorrupted.indexOf('再構築されます')>=0,'Minor #1: 警告に再構築の説明を含む');
  assert(htmlCorrupted.indexOf('mig-corrupt-warning')>=0,'Minor #1: 警告バナーに識別 class が付く');
  // 警告は本来のヘッダーより前に出る（順序確認）
  var idxWarn=htmlCorrupted.indexOf('既存の支部マスタが破損していました');
  var idxHead=htmlCorrupted.indexOf('過去大会の統合');
  assert(idxWarn>=0&&idxHead>=0&&idxWarn<idxHead,'Minor #1: 警告がヘッダーより前に出る');
}

// Minor #2: crypto 不在通知（noCrypto 環境で env をロード）
{
  const envNc = loadEnv(targetPath, {noCrypto:true});
  // 初期状態
  assert(envNc._phaseA2State.cryptoNotificationShown===false,'Minor #2: 初期状態で通知フラグ false');

  // state を最小構成でセット（参加者1名）
  envNc._setState({
    tournament_id:'',
    players:{A:[{id:'p1',name:'山田太郎',cls:'A',member:'member',grade:'ippan'}],B:[]},
    report:{}
  });

  // 1度目の syncBranchMasterOnSave → crypto throw を内部 catch、通知フラグ true
  envNc.syncBranchMasterOnSave();
  assert(envNc._phaseA2State.cryptoNotificationShown===true,'Minor #2: 1回目の crypto エラーで通知フラグが true になる');

  // 2度目の呼び出し → フラグは true のまま（過剰繰返し防止）
  envNc.syncBranchMasterOnSave();
  assert(envNc._phaseA2State.cryptoNotificationShown===true,'Minor #2: 2回目以降も true 維持（過剰繰返し防止）');

  // crypto 利用可能な環境では通知フラグは初期 false のまま
  const envOk = loadEnv(targetPath);
  assert(envOk._phaseA2State.cryptoNotificationShown===false,'Minor #2: crypto 正常環境で初期状態 false');
  envOk._setState({
    tournament_id:'',
    players:{A:[{id:'p1',name:'山田太郎',cls:'A',member:'member',grade:'ippan'}],B:[]},
    report:{}
  });
  envOk.syncBranchMasterOnSave();
  assert(envOk._phaseA2State.cryptoNotificationShown===false,'Minor #2: crypto 正常環境では通知フラグ false のまま');
}

// =====================================================
// parseTournamentTextInput tests (A-2.5, ChatGPT M1/M2)
// =====================================================
{
  // 単一大会
  {
    const single = JSON.stringify({schema_version:1,type:'shogi_tournament',ymd:'2026-04-15',a_class:{participants:[],results:[]},b_class:{participants:[],results:[]}});
    const r = env.parseTournamentTextInput(single);
    assert(r.tournaments.length===1,'A2.5-pti-1: 単一大会 tournaments=1');
    assert(r.errors.length===0,'A2.5-pti-2: 単一大会 errors=0');
  }

  // 複数大会（空行区切り）
  {
    const t1 = JSON.stringify({schema_version:1,ymd:'2026-04-15'});
    const t2 = JSON.stringify({schema_version:1,ymd:'2026-05-15'});
    const t3 = JSON.stringify({schema_version:1,ymd:'2026-06-15'});
    const multi = t1+'\n\n'+t2+'\n\n'+t3;
    const r = env.parseTournamentTextInput(multi);
    assert(r.tournaments.length===3,'A2.5-pti-3: 3大会 tournaments=3');
    assert(r.errors.length===0,'A2.5-pti-4: 3大会 errors=0');
  }

  // 連続空行も1つの区切り扱い
  {
    const t1 = JSON.stringify({schema_version:1,ymd:'2026-04-15'});
    const t2 = JSON.stringify({schema_version:1,ymd:'2026-05-15'});
    const multi = t1+'\n\n\n\n'+t2;
    const r = env.parseTournamentTextInput(multi);
    assert(r.tournaments.length===2,'A2.5-pti-5: 連続空行も区切り扱い');
  }

  // 末尾空行
  {
    const t = JSON.stringify({schema_version:1});
    const r = env.parseTournamentTextInput(t+'\n\n\n');
    assert(r.tournaments.length===1,'A2.5-pti-6: 末尾空行を許容');
    assert(r.errors.length===0,'A2.5-pti-7: 末尾空行 errors=0');
  }

  // 先頭空行
  {
    const t = JSON.stringify({schema_version:1});
    const r = env.parseTournamentTextInput('\n\n'+t);
    assert(r.tournaments.length===1,'A2.5-pti-8: 先頭空行を許容');
  }

  // CRLF 改行
  {
    const t1 = JSON.stringify({schema_version:1,ymd:'2026-04-15'});
    const t2 = JSON.stringify({schema_version:1,ymd:'2026-05-15'});
    const r = env.parseTournamentTextInput(t1+'\r\n\r\n'+t2);
    assert(r.tournaments.length===2,'A2.5-pti-9: CRLF 改行を許容');
  }

  // CR のみ改行
  {
    const t1 = JSON.stringify({schema_version:1,ymd:'2026-04-15'});
    const t2 = JSON.stringify({schema_version:1,ymd:'2026-05-15'});
    const r = env.parseTournamentTextInput(t1+'\r\r'+t2);
    assert(r.tournaments.length===2,'A2.5-pti-10: CR 改行を許容');
  }

  // BOM 付き
  {
    const t = JSON.stringify({schema_version:1});
    const r = env.parseTournamentTextInput('﻿'+t);
    assert(r.tournaments.length===1,'A2.5-pti-11: BOM 付きを許容');
  }

  // 空文字
  {
    const r = env.parseTournamentTextInput('');
    assert(r.tournaments.length===0,'A2.5-pti-12: 空文字 tournaments=0');
    assert(r.errors.length===0,'A2.5-pti-13: 空文字 errors=0');
  }

  // 空白のみ
  {
    const r = env.parseTournamentTextInput('   \n\n  \t  \n  ');
    assert(r.tournaments.length===0,'A2.5-pti-14: 空白のみ tournaments=0');
    assert(r.errors.length===0,'A2.5-pti-15: 空白のみ errors=0');
  }

  // 全件パース失敗
  {
    const bad = '{ broken json'+'\n\n'+'{ also broken';
    const r = env.parseTournamentTextInput(bad);
    assert(r.tournaments.length===0,'A2.5-pti-16: 全件失敗 tournaments=0');
    assert(r.errors.length===2,'A2.5-pti-17: 全件失敗 errors=2');
  }

  // 一部成功
  {
    const t = JSON.stringify({schema_version:1});
    const mixed = t+'\n\n'+'{ broken'+'\n\n'+t;
    const r = env.parseTournamentTextInput(mixed);
    assert(r.tournaments.length===2,'A2.5-pti-18: 一部成功 tournaments=2');
    assert(r.errors.length===1,'A2.5-pti-19: 一部成功 errors=1');
  }

  // undefined / null 入力
  {
    const r1 = env.parseTournamentTextInput(undefined);
    assert(r1.tournaments.length===0,'A2.5-pti-20: undefined tournaments=0');
    const r2 = env.parseTournamentTextInput(null);
    assert(r2.tournaments.length===0,'A2.5-pti-21: null tournaments=0');
  }
}

// ============================================================
// A-3 Stage 1: 登録画面サジェスト
// ============================================================
{
  // master schema 拡張: member / grade
  {
    const m = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_aaaaaaaaaaaa',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],member:'other',grade:'chu'},
        {id:'m_bbbbbbbbbbbb',name:'鈴木一郎',yomi:'すずきいちろう',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t2']}
      ]
    });
    assertEq(m.members[0].member,'other','A3-S1-norm-01: member=other を保持');
    assertEq(m.members[0].grade,'chu','A3-S1-norm-02: grade=chu を保持');
    assertEq(m.members[1].member,'member','A3-S1-norm-03: 既存マスタは member=member にデフォルト');
    assertEq(m.members[1].grade,'ippan','A3-S1-norm-04: 既存マスタは grade=ippan にデフォルト');
  }

  // 不正値はデフォルトに落ちる
  {
    const m = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_cccccccccccc',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],member:'foo',grade:'bar'}]
    });
    assertEq(m.members[0].member,'member','A3-S1-norm-05: member 不正値 → member');
    assertEq(m.members[0].grade,'ippan','A3-S1-norm-06: grade 不正値 → ippan');
  }

  // createMemberFromParticipant: player の member / grade を引き継ぐ
  {
    const master = env.createEmptyBranchMaster();
    const p = {name:'佐藤花子',cls:'A',member:'other',grade:'chu'};
    const m = env.createMemberFromParticipant(p,master,'2026-05-05');
    assertEq(m.member,'other','A3-S1-create-01: player.member=other を反映');
    assertEq(m.grade,'chu','A3-S1-create-02: player.grade=chu を反映');
    const p2 = {name:'田中次郎',cls:'B'};
    const m2 = env.createMemberFromParticipant(p2,master,'2026-05-05');
    assertEq(m2.member,'member','A3-S1-create-03: 未指定はデフォルト member');
    assertEq(m2.grade,'ippan','A3-S1-create-04: 未指定はデフォルト ippan');
  }

  // findMasterSuggestions: 漢字部分一致
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']},
        {id:'m_222222222222',name:'山本一郎',yomi:'やまもといちろう',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t2']},
        {id:'m_333333333333',name:'佐藤花子',yomi:'さとうはなこ',first_attended:'2026-03-01',last_attended:'2026-05-01',tournament_ids:['t3']}
      ]
    });
    const r = env.findMasterSuggestions('山',master,[]);
    assert(r.length===2,'A3-S1-sugg-01: 「山」で部分一致 2件');
    assertEq(r[0].id,'m_111111111111','A3-S1-sugg-02: 1件目');
    assertEq(r[1].id,'m_222222222222','A3-S1-sugg-03: 2件目');
  }

  // findMasterSuggestions: ふりがな部分一致（カタカナ入力でひらがな yomi にヒット）
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']}
      ]
    });
    const r = env.findMasterSuggestions('ヤマダ',master,[]);
    assert(r.length===1,'A3-S1-sugg-04: カタカナ「ヤマダ」で yomi ヒット');
  }

  // findMasterSuggestions: deleted=true 除外
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],deleted:true,deleted_at:'2026-04-10'},
        {id:'m_222222222222',name:'山本一郎',yomi:'やまもといちろう',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t2']}
      ]
    });
    const r = env.findMasterSuggestions('山',master,[]);
    assert(r.length===1,'A3-S1-sugg-05: deleted=true は候補に出さない');
    assertEq(r[0].id,'m_222222222222','A3-S1-sugg-06: 残るのは生存 member');
  }

  // findMasterSuggestions: excludedMemberIds で除外
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']},
        {id:'m_222222222222',name:'山本一郎',yomi:'やまもといちろう',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t2']}
      ]
    });
    const r = env.findMasterSuggestions('山',master,['m_111111111111']);
    assert(r.length===1,'A3-S1-sugg-07: 当日登録済み member_id を除外');
    assertEq(r[0].id,'m_222222222222','A3-S1-sugg-08: 残るのは未登録');
  }

  // findMasterSuggestions: 最大5件
  {
    const arr=[];
    for(let i=0;i<10;i++){
      arr.push({id:'m_'+('aaaaaaaaaaaa'+i).slice(-12),name:'山田'+i,yomi:'やまだ',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t'+i]});
    }
    const master = env.normalizeBranchMaster({schema_version:1,members:arr});
    const r = env.findMasterSuggestions('山',master,[]);
    assert(r.length===5,'A3-S1-sugg-09: 最大5件で打ち切り');
  }

  // findMasterSuggestions: 空クエリ・空白のみは空配列
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']}]
    });
    assert(env.findMasterSuggestions('',master,[]).length===0,'A3-S1-sugg-10: 空クエリ → []');
    assert(env.findMasterSuggestions('   ',master,[]).length===0,'A3-S1-sugg-11: 空白のみ → []');
    assert(env.findMasterSuggestions(null,master,[]).length===0,'A3-S1-sugg-12: null → []');
  }

  // updateBranchMasterFromTournament: player の member / grade を master に記録
  {
    const master = env.createEmptyBranchMaster();
    const state = {
      tournament_id:'t_2026_05_05',
      players:{
        A:[{id:'p1',name:'山田太郎',cls:'A',member:'other',grade:'chu'}],
        B:[]
      }
    };
    env.updateBranchMasterFromTournament(state,master,{tournament_id:'t_2026_05_05',tournament_date:'2026-05-05'});
    assert(master.members.length===1,'A3-S1-upd-01: 新規 member 1件作成');
    assertEq(master.members[0].member,'other','A3-S1-upd-02: master に member=other 記録');
    assertEq(master.members[0].grade,'chu','A3-S1-upd-03: master に grade=chu 記録');
  }

  // updateBranchMasterFromTournament: 既存 member の member / grade を上書き更新
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t_old'],member:'member',grade:'ippan'}]
    });
    const state = {
      tournament_id:'t_2026_05_05',
      players:{
        A:[{id:'p1',name:'山田太郎',cls:'A',member_id:'m_111111111111',member:'other',grade:'chu'}],
        B:[]
      }
    };
    env.updateBranchMasterFromTournament(state,master,{tournament_id:'t_2026_05_05',tournament_date:'2026-05-05'});
    assertEq(master.members[0].member,'other','A3-S1-upd-04: 既存 member の member を新値で上書き');
    assertEq(master.members[0].grade,'chu','A3-S1-upd-05: 既存 member の grade を新値で上書き');
  }
}

// ============================================================
// A-3 Stage 2: F7 編集（name + yomi のみ）
// ============================================================
{
  // 通常編集: name + yomi 更新
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','山田 太郎','やまだ たろう',master);
    assert(r.success===true,'A3-S2-edit-01: 編集成功');
    assertEq(master.members[0].name,'山田 太郎','A3-S2-edit-02: name 正規化（連続空白等の整理）');
    assertEq(master.members[0].yomi,'やまだたろう','A3-S2-edit-03: yomi 正規化（空白除去）');
    assertEq(master.members[0].attendance_count,1,'A3-S2-edit-04: 参加履歴は不変');
    assertEq(master.members[0].tournament_ids[0],'t1','A3-S2-edit-05: tournament_ids 不変');
    assertEq(r.duplicateCount,0,'A3-S2-edit-06: 同名なし → 0');
  }

  // 全角空白の正規化
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    env.applyMasterMemberEdit('m_111111111111','　佐藤　花子　','サトウ ハナコ',master);
    assertEq(master.members[0].name,'佐藤 花子','A3-S2-edit-07: 全角→半角空白 + 前後空白除去');
    assertEq(master.members[0].yomi,'さとうはなこ','A3-S2-edit-08: yomi カタカナ→ひらがな + 空白除去');
  }

  // 空 name エラー
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','   ','',master);
    assert(r.success===false,'A3-S2-edit-09: 空 name は失敗');
    assertEq(r.error,'empty_name','A3-S2-edit-10: error=empty_name');
    assertEq(master.members[0].name,'X','A3-S2-edit-11: 失敗時はマスタ不変');
  }

  // 存在しない id エラー
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    const r = env.applyMasterMemberEdit('m_does_not_exist','Y','',master);
    assert(r.success===false,'A3-S2-edit-12: 不存在 id は失敗');
    assertEq(r.error,'not_found','A3-S2-edit-13: error=not_found');
  }

  // deleted=true は編集禁止
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','Y','',master);
    assert(r.success===false,'A3-S2-edit-14: deleted=true は編集不可');
    assertEq(r.error,'deleted','A3-S2-edit-15: error=deleted');
  }

  // 同名重複検知（warning のみ・自動統合しない）
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]},
        {id:'m_222222222222',name:'佐藤花子',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}
      ]
    });
    const r = env.applyMasterMemberEdit('m_222222222222','山田太郎','',master);
    assert(r.success===true,'A3-S2-edit-16: 同名でも編集自体は成功');
    assertEq(r.duplicateCount,1,'A3-S2-edit-17: duplicateCount=1（warning 用）');
    assertEq(master.members.length,2,'A3-S2-edit-18: 自動統合せず members 件数維持');
    assertEq(master.members[1].name,'山田太郎','A3-S2-edit-19: 編集対象の name は更新');
    assertEq(master.members[1].id,'m_222222222222','A3-S2-edit-20: id 不変');
  }

  // 同名検知は deleted を除外
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'},
        {id:'m_222222222222',name:'佐藤花子',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}
      ]
    });
    const r = env.applyMasterMemberEdit('m_222222222222','山田太郎','',master);
    assertEq(r.duplicateCount,0,'A3-S2-edit-21: deleted=true は同名重複に含めない');
  }

  // 編集が他のフィールドに影響しない
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'B',note:'memo'}]
    });
    env.applyMasterMemberEdit('m_111111111111','Y','よみ',master);
    const m=master.members[0];
    assertEq(m.first_attended,'2026-01-01','A3-S2-edit-22: first_attended 不変');
    assertEq(m.last_attended,'2026-04-01','A3-S2-edit-23: last_attended 不変');
    assertEq(m.attendance_count,2,'A3-S2-edit-24: attendance_count 不変');
    assertEq(m.member,'other','A3-S2-edit-25: member 不変');
    assertEq(m.grade,'chu','A3-S2-edit-26: grade 不変');
    assertEq(m.last_class,'B','A3-S2-edit-27: last_class 不変');
    assertEq(m.note,'memo','A3-S2-edit-28: note 不変');
    assertEq(m.tournament_ids.length,2,'A3-S2-edit-29: tournament_ids 不変');
  }
}

// ============================================================
// A-4 Stage 3: applyMasterMemberEdit options 拡張（Must Fix 2 シグネチャ厳守）
//   採用シグネチャ: applyMasterMemberEdit(memberId, newName, newYomi, master, options)
//   options 省略時は member/grade を変更しない（A3-S2-edit-25/26 で既に検証済み）
// ============================================================
{
  // options.member 単独更新
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','X','',master,{member:'other'});
    assert(r.success===true,'A4-S3-edit-01: options.member 単独で成功');
    assertEq(master.members[0].member,'other','A4-S3-edit-02: member が other に更新');
    assertEq(master.members[0].grade,'ippan','A4-S3-edit-03: grade は不変');
  }

  // options.grade 単独更新
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','X','',master,{grade:'chu'});
    assert(r.success===true,'A4-S3-edit-04: options.grade 単独で成功');
    assertEq(master.members[0].grade,'chu','A4-S3-edit-05: grade が chu に更新');
    assertEq(master.members[0].member,'member','A4-S3-edit-06: member は不変');
  }

  // options.member と options.grade の両方を同時更新
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','Y','よみ',master,{member:'other',grade:'chu'});
    assert(r.success===true,'A4-S3-edit-07: 両方更新で成功');
    assertEq(master.members[0].name,'Y','A4-S3-edit-08: name 更新');
    assertEq(master.members[0].yomi,'よみ','A4-S3-edit-09: yomi 更新');
    assertEq(master.members[0].member,'other','A4-S3-edit-10: member 更新');
    assertEq(master.members[0].grade,'chu','A4-S3-edit-11: grade 更新');
  }

  // 不正 member 値 → invalid_member_value（マスタは触らない）
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:[],attendance_count:0,member:'member',grade:'ippan'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','Y','',master,{member:'foo'});
    assert(r.success===false,'A4-S3-edit-12: 不正 member 値で失敗');
    assertEq(r.error,'invalid_member_value','A4-S3-edit-13: error=invalid_member_value');
    assertEq(master.members[0].name,'X','A4-S3-edit-14: 失敗時はマスタ不変（name）');
    assertEq(master.members[0].member,'member','A4-S3-edit-15: 失敗時はマスタ不変（member）');
  }

  // 不正 grade 値 → invalid_grade_value
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:[],attendance_count:0,member:'member',grade:'ippan'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','Y','',master,{grade:'kou'});
    assert(r.success===false,'A4-S3-edit-16: 不正 grade 値で失敗');
    assertEq(r.error,'invalid_grade_value','A4-S3-edit-17: error=invalid_grade_value');
    assertEq(master.members[0].grade,'ippan','A4-S3-edit-18: 失敗時はマスタ不変（grade）');
  }

  // options 空オブジェクト = options 省略と同じ（既存挙動維持）
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:[],attendance_count:0,member:'other',grade:'chu'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','Y','',master,{});
    assert(r.success===true,'A4-S3-edit-19: options 空オブジェクトで成功');
    assertEq(master.members[0].member,'other','A4-S3-edit-20: 空 options では member 不変');
    assertEq(master.members[0].grade,'chu','A4-S3-edit-21: 空 options では grade 不変');
  }

  // options.member='member' でも値は同じ → 動作するが内容変化なし
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:[],attendance_count:0,member:'member',grade:'ippan'}]
    });
    const r = env.applyMasterMemberEdit('m_111111111111','X','',master,{member:'member',grade:'ippan'});
    assert(r.success===true,'A4-S3-edit-22: 同値の指定でも成功');
    assertEq(master.members[0].member,'member','A4-S3-edit-23: 同値再指定で値変化なし');
  }
}

// ============================================================
// A-3 Stage 3: F7 削除（tombstone）
// ============================================================
{
  // 通常削除: deleted=true + deleted_at セット
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1}]
    });
    const r = env.applyMasterMemberDelete('m_111111111111',master,'2026-05-05');
    assert(r.success===true,'A3-S3-del-01: 削除成功');
    assertEq(master.members[0].deleted,true,'A3-S3-del-02: deleted=true');
    assertEq(master.members[0].deleted_at,'2026-05-05','A3-S3-del-03: deleted_at セット');
    // 物理削除しない
    assertEq(master.members.length,1,'A3-S3-del-04: members 件数不変（物理削除しない）');
    assertEq(master.members[0].id,'m_111111111111','A3-S3-del-05: id 不変');
  }

  // 削除しても他フィールドは保持（復元時のため）
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'B',note:'memo'}]
    });
    env.applyMasterMemberDelete('m_111111111111',master,'2026-05-05');
    const m=master.members[0];
    assertEq(m.name,'山田太郎','A3-S3-del-06: name 保持');
    assertEq(m.yomi,'やまだたろう','A3-S3-del-07: yomi 保持');
    assertEq(m.first_attended,'2026-01-01','A3-S3-del-08: first_attended 保持');
    assertEq(m.last_attended,'2026-04-01','A3-S3-del-09: last_attended 保持');
    assertEq(m.attendance_count,2,'A3-S3-del-10: attendance_count 保持');
    assertEq(m.tournament_ids.length,2,'A3-S3-del-11: tournament_ids 保持');
    assertEq(m.member,'other','A3-S3-del-12: member 保持');
    assertEq(m.grade,'chu','A3-S3-del-13: grade 保持');
  }

  // 不正な dateYmd は todayYmd() にフォールバック
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    env.applyMasterMemberDelete('m_111111111111',master,'invalid-date');
    const today = env.todayYmd();
    assertEq(master.members[0].deleted_at,today,'A3-S3-del-14: 不正日付は今日にフォールバック');
  }

  // 存在しない id エラー
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    const r = env.applyMasterMemberDelete('m_does_not_exist',master,'2026-05-05');
    assert(r.success===false,'A3-S3-del-15: 不存在 id は失敗');
    assertEq(r.error,'not_found','A3-S3-del-16: error=not_found');
    assertEq(master.members[0].deleted,false,'A3-S3-del-17: 失敗時は他 member 不変');
  }

  // 既に削除済みの member への再削除はエラー
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}]
    });
    const r = env.applyMasterMemberDelete('m_111111111111',master,'2026-05-05');
    assert(r.success===false,'A3-S3-del-18: 削除済みは再削除不可');
    assertEq(r.error,'already_deleted','A3-S3-del-19: error=already_deleted');
    assertEq(master.members[0].deleted_at,'2026-04-10','A3-S3-del-20: deleted_at は元のまま');
  }

  // 削除後の member は findMasterSuggestions から除外
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']},
        {id:'m_222222222222',name:'山本一郎',yomi:'やまもといちろう',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t2']}
      ]
    });
    env.applyMasterMemberDelete('m_111111111111',master,'2026-05-05');
    const r = env.findMasterSuggestions('山',master,[]);
    assert(r.length===1,'A3-S3-del-21: 削除後はサジェスト候補から除外');
    assertEq(r[0].id,'m_222222222222','A3-S3-del-22: 残るのは生存 member');
  }

  // 削除後の member は findMemberCandidates（マイグレ統合）からも除外
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']}]
    });
    env.applyMasterMemberDelete('m_111111111111',master,'2026-05-05');
    const cands=env.findMemberCandidates({name:'山田太郎'},master);
    assertEq(cands.length,0,'A3-S3-del-23: 削除後は findMemberCandidates 0件');
  }

  // 複数 member のうち 1 件だけ削除
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]},
        {id:'m_222222222222',name:'B',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]},
        {id:'m_333333333333',name:'C',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}
      ]
    });
    env.applyMasterMemberDelete('m_222222222222',master,'2026-05-05');
    assertEq(master.members[0].deleted,false,'A3-S3-del-24: 他 member は影響なし(A)');
    assertEq(master.members[1].deleted,true,'A3-S3-del-25: 対象 member のみ削除(B)');
    assertEq(master.members[2].deleted,false,'A3-S3-del-26: 他 member は影響なし(C)');
  }
}

// ============================================================
// A-4 Stage 4: applyMasterMemberRestore（削除済み member の復元）
//   §3.4.3: 戻り値 {success, error?}、エラー: invalid_master / invalid_id / not_found / not_deleted
//   禁止: 物理削除しない、member_id を変更しない
// ============================================================
{
  // 通常復元: deleted=true → false、deleted_at=null
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}]
    });
    const r = env.applyMasterMemberRestore('m_111111111111',master);
    assert(r.success===true,'A4-S4-restore-01: 復元成功');
    assertEq(master.members[0].deleted,false,'A4-S4-restore-02: deleted が false');
    assertEq(master.members[0].deleted_at,null,'A4-S4-restore-03: deleted_at が null');
    assertEq(master.members[0].id,'m_111111111111','A4-S4-restore-04: member_id 不変');
  }

  // 不存在 id → not_found
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    const r = env.applyMasterMemberRestore('m_does_not_exist',master);
    assert(r.success===false,'A4-S4-restore-05: 不存在 id で失敗');
    assertEq(r.error,'not_found','A4-S4-restore-06: error=not_found');
  }

  // deleted=false → not_deleted
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    const r = env.applyMasterMemberRestore('m_111111111111',master);
    assert(r.success===false,'A4-S4-restore-07: 未削除で失敗');
    assertEq(r.error,'not_deleted','A4-S4-restore-08: error=not_deleted');
    assertEq(master.members[0].deleted,false,'A4-S4-restore-09: 未削除のままマスタ不変');
  }

  // invalid_master / invalid_id
  {
    const r1 = env.applyMasterMemberRestore('m_111111111111',null);
    assert(r1.success===false&&r1.error==='invalid_master','A4-S4-restore-10: master null で invalid_master');
    const r2 = env.applyMasterMemberRestore('',{members:[]});
    assert(r2.success===false&&r2.error==='invalid_id','A4-S4-restore-11: 空 id で invalid_id');
    const r3 = env.applyMasterMemberRestore(null,{members:[]});
    assert(r3.success===false&&r3.error==='invalid_id','A4-S4-restore-12: null id で invalid_id');
  }

  // 復元しても他 member には影響なし
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]},
        {id:'m_222222222222',name:'B',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'},
        {id:'m_333333333333',name:'C',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}
      ]
    });
    env.applyMasterMemberRestore('m_222222222222',master);
    assertEq(master.members[0].deleted,false,'A4-S4-restore-13: 他 member 影響なし(A)');
    assertEq(master.members[1].deleted,false,'A4-S4-restore-14: 対象のみ復元(B)');
    assertEq(master.members[2].deleted,true,'A4-S4-restore-15: 他 deleted member は維持(C)');
  }

  // 復元後の参加履歴・属性は不変（attendance_count / tournament_ids / member / grade 等）
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'よみ',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'B',deleted:true,deleted_at:'2026-04-10',note:'memo'}]
    });
    env.applyMasterMemberRestore('m_111111111111',master);
    const m=master.members[0];
    assertEq(m.attendance_count,2,'A4-S4-restore-16: attendance_count 不変');
    assertEq(m.tournament_ids.length,2,'A4-S4-restore-17: tournament_ids 不変');
    assertEq(m.member,'other','A4-S4-restore-18: member 不変');
    assertEq(m.grade,'chu','A4-S4-restore-19: grade 不変');
    assertEq(m.last_class,'B','A4-S4-restore-20: last_class 不変');
    assertEq(m.note,'memo','A4-S4-restore-21: note 不変');
    assertEq(m.yomi,'よみ','A4-S4-restore-22: yomi 不変');
  }
}

// ============================================================
// A-3 Stage 4: F8-a エクスポート
// ============================================================
{
  // 通常エクスポート: schema_version / updated_at / members を含む JSON 文字列
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      updated_at:'2026-05-05T12:00:00.000Z',
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']}]
    });
    const json = env.serializeBranchMasterForExport(master);
    assert(typeof json==='string','A3-S4-exp-01: 文字列を返す');
    const parsed = JSON.parse(json);
    assertEq(parsed.schema_version,1,'A3-S4-exp-02: schema_version 含む');
    assertEq(parsed.updated_at,'2026-05-05T12:00:00.000Z','A3-S4-exp-03: updated_at 含む');
    assert(Array.isArray(parsed.members),'A3-S4-exp-04: members は配列');
    assertEq(parsed.members.length,1,'A3-S4-exp-05: members 件数');
    assertEq(parsed.members[0].id,'m_111111111111','A3-S4-exp-06: member id 保持');
    assertEq(parsed.members[0].name,'山田太郎','A3-S4-exp-07: name 保持');
    assertEq(parsed.members[0].yomi,'やまだたろう','A3-S4-exp-08: yomi 保持');
  }

  // tombstone を含めて書き出す
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      updated_at:'2026-05-05T12:00:00.000Z',
      members:[
        {id:'m_111111111111',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]},
        {id:'m_222222222222',name:'B',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}
      ]
    });
    const parsed = JSON.parse(env.serializeBranchMasterForExport(master));
    assertEq(parsed.members.length,2,'A3-S4-exp-09: tombstone も含めて2件');
    assertEq(parsed.members[1].deleted,true,'A3-S4-exp-10: tombstone deleted=true 出力');
    assertEq(parsed.members[1].deleted_at,'2026-04-10','A3-S4-exp-11: tombstone deleted_at 出力');
  }

  // member / grade / last_class / note などすべて保持
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      updated_at:'2026-05-05T12:00:00.000Z',
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'B',note:'memo'}]
    });
    const parsed = JSON.parse(env.serializeBranchMasterForExport(master));
    const m = parsed.members[0];
    assertEq(m.member,'other','A3-S4-exp-12: member 保持');
    assertEq(m.grade,'chu','A3-S4-exp-13: grade 保持');
    assertEq(m.last_class,'B','A3-S4-exp-14: last_class 保持');
    assertEq(m.note,'memo','A3-S4-exp-15: note 保持');
    assertEq(m.attendance_count,2,'A3-S4-exp-16: attendance_count 保持');
    assert(Array.isArray(m.tournament_ids)&&m.tournament_ids.length===2,'A3-S4-exp-17: tournament_ids 保持');
    assertEq(m.first_attended,'2026-01-01','A3-S4-exp-18: first_attended 保持');
    assertEq(m.last_attended,'2026-04-01','A3-S4-exp-19: last_attended 保持');
  }

  // 空マスタもエクスポート可能
  {
    const master = env.createEmptyBranchMaster();
    const json = env.serializeBranchMasterForExport(master);
    const parsed = JSON.parse(json);
    assertEq(parsed.members.length,0,'A3-S4-exp-20: 空マスタは members:[]');
    assertEq(parsed.schema_version,1,'A3-S4-exp-21: 空でも schema_version 出力');
  }

  // null / undefined / 不正な master は null を返す（呼び出し側でエラー処理）
  {
    assertEq(env.serializeBranchMasterForExport(null),null,'A3-S4-exp-22: null → null');
    assertEq(env.serializeBranchMasterForExport(undefined),null,'A3-S4-exp-23: undefined → null');
    assertEq(env.serializeBranchMasterForExport('foo'),null,'A3-S4-exp-24: 文字列 → null');
  }

  // _loaded_with_corruption は出力に含まれない（内部フラグ）
  {
    const master = env.normalizeBranchMaster({
      schema_version:1,
      updated_at:'2026-05-05T12:00:00.000Z',
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    master._loaded_with_corruption = true;
    const parsed = JSON.parse(env.serializeBranchMasterForExport(master));
    assertEq(parsed._loaded_with_corruption,undefined,'A3-S4-exp-25: 内部フラグは出力しない');
  }

  // ロードトリップ: export → JSON.parse → normalizeBranchMaster で完全復元
  {
    const orig = env.normalizeBranchMaster({
      schema_version:1,
      updated_at:'2026-05-05T12:00:00.000Z',
      members:[
        {id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2,member:'other',grade:'chu',last_class:'B',note:'memo'},
        {id:'m_222222222222',name:'B',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}
      ]
    });
    const json = env.serializeBranchMasterForExport(orig);
    const restored = env.normalizeBranchMaster(JSON.parse(json));
    assertEq(restored.members.length,orig.members.length,'A3-S4-exp-26: roundtrip members 件数');
    assertEq(restored.members[0].name,orig.members[0].name,'A3-S4-exp-27: roundtrip name');
    assertEq(restored.members[0].member,orig.members[0].member,'A3-S4-exp-28: roundtrip member');
    assertEq(restored.members[0].grade,orig.members[0].grade,'A3-S4-exp-29: roundtrip grade');
    assertEq(restored.members[1].deleted,true,'A3-S4-exp-30: roundtrip tombstone');
    assertEq(restored.members[1].deleted_at,'2026-04-10','A3-S4-exp-31: roundtrip deleted_at');
  }

  // ファイル名フォーマット: shogi_branch_master_YYYY-MM-DD.json
  {
    assertEq(env.buildMasterExportFilename('2026-05-05'),'shogi_branch_master_2026-05-05.json','A3-S4-exp-32: ファイル名フォーマット');
  }

  // 不正日付は today にフォールバック
  {
    const today = env.todayYmd();
    assertEq(env.buildMasterExportFilename('invalid-date'),'shogi_branch_master_'+today+'.json','A3-S4-exp-33: 不正日付は today');
    assertEq(env.buildMasterExportFilename(undefined),'shogi_branch_master_'+today+'.json','A3-S4-exp-34: undefined は today');
  }
}

// ============================================================
// A-3 Stage 5: F8-b 上書きインポート
// ============================================================
{
  // detectImportFormat: branch master 形式
  {
    const r = env.detectImportFormat({schema_version:1,members:[]});
    assertEq(r,'branch_master','A3-S5-fmt-01: members 配列あり → branch_master');
  }
  {
    const r = env.detectImportFormat({members:[{id:'m_x',name:'X'}]});
    assertEq(r,'branch_master','A3-S5-fmt-02: schema_version なくても members あれば branch_master');
  }

  // detectImportFormat: tournament 形式
  {
    const r = env.detectImportFormat({schema_version:4,tournament_id:'t1',players:{A:[],B:[]}});
    assertEq(r,'tournament','A3-S5-fmt-03: players オブジェクト → tournament');
  }
  {
    const r = env.detectImportFormat({players:{A:[],B:[]},members:[]});
    assertEq(r,'tournament','A3-S5-fmt-04: players 優先（両方ある場合）');
  }

  // detectImportFormat: unknown
  {
    assertEq(env.detectImportFormat(null),'unknown','A3-S5-fmt-05: null → unknown');
    assertEq(env.detectImportFormat(undefined),'unknown','A3-S5-fmt-06: undefined → unknown');
    assertEq(env.detectImportFormat('foo'),'unknown','A3-S5-fmt-07: 文字列 → unknown');
    assertEq(env.detectImportFormat([]),'unknown','A3-S5-fmt-08: 配列 → unknown');
    assertEq(env.detectImportFormat({}),'unknown','A3-S5-fmt-09: 空オブジェクト → unknown');
    assertEq(env.detectImportFormat({members:'not-array'}),'unknown','A3-S5-fmt-10: members 非配列 → unknown');
    assertEq(env.detectImportFormat({players:[]}),'unknown','A3-S5-fmt-11: players 配列（オブジェクトでない）→ unknown');
  }

  // applyOverwriteImport: 通常成功
  {
    const r = env.applyOverwriteImport({
      schema_version:1,
      updated_at:'2026-05-05T12:00:00.000Z',
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']}]
    });
    assert(r.success===true,'A3-S5-ovw-01: 上書き成功');
    assertEq(r.newMaster.members.length,1,'A3-S5-ovw-02: members 件数');
    assertEq(r.newMaster.members[0].name,'山田太郎','A3-S5-ovw-03: name 反映');
  }

  // applyOverwriteImport: tombstone を保持して書き込む
  {
    const r = env.applyOverwriteImport({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]},
        {id:'m_222222222222',name:'B',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}
      ]
    });
    assert(r.success===true,'A3-S5-ovw-04: tombstone 含み成功');
    assertEq(r.newMaster.members.length,2,'A3-S5-ovw-05: tombstone も件数に含む');
    assertEq(r.newMaster.members[1].deleted,true,'A3-S5-ovw-06: deleted=true 保持');
    assertEq(r.newMaster.members[1].deleted_at,'2026-04-10','A3-S5-ovw-07: deleted_at 保持');
  }

  // applyOverwriteImport: 大会データ形式はエラー（マイグレ機能を案内）
  {
    const r = env.applyOverwriteImport({
      schema_version:4,
      tournament_id:'t1',
      players:{A:[{id:'p1',name:'X'}],B:[]}
    });
    assert(r.success===false,'A3-S5-ovw-08: 大会データは失敗');
    assertEq(r.error,'tournament_format','A3-S5-ovw-09: error=tournament_format');
  }

  // applyOverwriteImport: 不正形式エラー
  {
    const r1 = env.applyOverwriteImport(null);
    assertEq(r1.error,'invalid_format','A3-S5-ovw-10: null は invalid_format');
    const r2 = env.applyOverwriteImport({foo:'bar'});
    assertEq(r2.error,'invalid_format','A3-S5-ovw-11: 無関係オブジェクトは invalid_format');
    const r3 = env.applyOverwriteImport([1,2,3]);
    assertEq(r3.error,'invalid_format','A3-S5-ovw-12: 配列は invalid_format');
  }

  // applyOverwriteImport: 空マスタも成功（members:[]）
  {
    const r = env.applyOverwriteImport({schema_version:1,members:[]});
    assert(r.success===true,'A3-S5-ovw-13: 空マスタも成功');
    assertEq(r.newMaster.members.length,0,'A3-S5-ovw-14: members 0件');
  }

  // applyOverwriteImport: schema_version が違うと normalizeBranchMaster が空マスタにする
  {
    const r = env.applyOverwriteImport({
      schema_version:99,
      members:[{id:'m_111111111111',name:'X',yomi:''}]
    });
    assert(r.success===true,'A3-S5-ovw-15: フォーマットは認識されるが…');
    assertEq(r.newMaster.members.length,0,'A3-S5-ovw-16: schema_version 不一致で normalize が空マスタを返す');
  }

  // applyOverwriteImport: input を mutate しない
  {
    const input = {
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:''}]
    };
    const inputCopy = JSON.parse(JSON.stringify(input));
    env.applyOverwriteImport(input);
    assertEq(JSON.stringify(input),JSON.stringify(inputCopy),'A3-S5-ovw-17: 入力を mutate しない');
  }

  // safeParseImportText: 正常 JSON
  {
    const r = env.safeParseImportText('{"a":1}');
    assertEq(r.a,1,'A3-S5-prs-01: 正常 JSON パース');
  }

  // safeParseImportText: BOM 除去
  {
    const r = env.safeParseImportText('﻿{"a":1}');
    assertEq(r.a,1,'A3-S5-prs-02: BOM 付き JSON もパース');
  }

  // safeParseImportText: 空文字・null・空白のみ
  {
    assertEq(env.safeParseImportText(''),null,'A3-S5-prs-03: 空文字 → null');
    assertEq(env.safeParseImportText(null),null,'A3-S5-prs-04: null → null');
    assertEq(env.safeParseImportText('   \n\t  '),null,'A3-S5-prs-05: 空白のみ → null');
  }

  // safeParseImportText: 不正 JSON
  {
    assertEq(env.safeParseImportText('{ broken'),null,'A3-S5-prs-06: 不正 JSON → null');
    assertEq(env.safeParseImportText('not json'),null,'A3-S5-prs-07: 非 JSON → null');
  }
}

// ============================================================
// A-3 Stage 6: F8-b マージインポート（既存側優先）
// ============================================================
{
  // tournament 形式・不正形式エラー
  {
    const r1 = env.applyMergeImport({players:{A:[],B:[]}},env.createEmptyBranchMaster());
    assertEq(r1.error,'tournament_format','A3-S6-mrg-01: 大会データは tournament_format');
    const r2 = env.applyMergeImport(null,env.createEmptyBranchMaster());
    assertEq(r2.error,'invalid_format','A3-S6-mrg-02: null は invalid_format');
  }

  // 既存空 + 新規追加
  {
    const current = env.createEmptyBranchMaster();
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1']}
    ]};
    const r = env.applyMergeImport(imported,current);
    assert(r.success===true,'A3-S6-mrg-03: 空マスタに新規追加 成功');
    assertEq(r.newMaster.members.length,1,'A3-S6-mrg-04: 1件追加');
    assertEq(r.summary.added,1,'A3-S6-mrg-05: summary.added=1');
    assertEq(r.summary.merged,0,'A3-S6-mrg-06: summary.merged=0');
    assertEq(r.summary.total,1,'A3-S6-mrg-07: summary.total=1');
  }

  // 既存非空 + 入力空 → 変化なし
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1']}]
    });
    const r = env.applyMergeImport({schema_version:1,members:[]},current);
    assertEq(r.summary.added,0,'A3-S6-mrg-08: 入力空 added=0');
    assertEq(r.summary.merged,0,'A3-S6-mrg-09: 入力空 merged=0');
    assertEq(r.newMaster.members.length,1,'A3-S6-mrg-10: 既存件数維持');
    assertEq(r.newMaster.members[0].name,'A','A3-S6-mrg-11: 既存名前維持');
  }

  // id 一致 → 統合（name / yomi は既存維持）
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-02-01',last_attended:'2026-03-01',tournament_ids:['t_old'],attendance_count:1,member:'member',grade:'ippan',last_class:'A',note:'memo_existing'}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'別の名前',yomi:'べつのなまえ',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t_new'],attendance_count:5,member:'other',grade:'chu',last_class:'B',note:'memo_imported'}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.summary.added,0,'A3-S6-mrg-12: id 一致は added 0');
    assertEq(r.summary.merged,1,'A3-S6-mrg-13: merged 1');
    const m = r.newMaster.members[0];
    assertEq(m.name,'山田太郎','A3-S6-mrg-14: name は既存維持');
    assertEq(m.yomi,'やまだたろう','A3-S6-mrg-15: yomi は既存維持');
    assertEq(m.member,'member','A3-S6-mrg-16: member は既存維持');
    assertEq(m.grade,'ippan','A3-S6-mrg-17: grade は既存維持');
    assertEq(m.last_class,'A','A3-S6-mrg-18: last_class は既存維持');
    assertEq(m.note,'memo_existing','A3-S6-mrg-19: note は既存維持');
  }

  // tournament_ids: union 重複除去
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1','t2','t3']}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t2','t3','t4','t5']}
    ]};
    const r = env.applyMergeImport(imported,current);
    const ids = r.newMaster.members[0].tournament_ids;
    assertEq(ids.length,5,'A3-S6-mrg-20: tournament_ids union 5件');
    assert(ids.indexOf('t1')>=0&&ids.indexOf('t2')>=0&&ids.indexOf('t3')>=0&&ids.indexOf('t4')>=0&&ids.indexOf('t5')>=0,'A3-S6-mrg-21: union 全要素含む');
  }

  // last_attended: 新しい日付を採用
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-03-01',tournament_ids:[]}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-15',tournament_ids:[]}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.newMaster.members[0].last_attended,'2026-04-15','A3-S6-mrg-22: last_attended は新しい方');
  }

  // last_attended: 既存の方が新しければ既存維持
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-05-01',tournament_ids:[]}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-03-01',tournament_ids:[]}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.newMaster.members[0].last_attended,'2026-05-01','A3-S6-mrg-23: 既存の方が新しければ既存維持');
  }

  // first_attended: 古い日付を採用
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-03-01',last_attended:'2026-04-01',tournament_ids:[]}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-15',last_attended:'2026-04-01',tournament_ids:[]}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.newMaster.members[0].first_attended,'2026-01-15','A3-S6-mrg-24: first_attended は古い方');
  }

  // attendance_count: max(existing, imported, unionTournamentIds.length)
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1','t2'],attendance_count:2}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t3','t4','t5','t6'],attendance_count:4}
    ]};
    const r = env.applyMergeImport(imported,current);
    // unionIds.length = 6, existing=2, imported=4 → max=6
    assertEq(r.newMaster.members[0].attendance_count,6,'A3-S6-mrg-25: attendance_count = max(2,4,6) = 6');
  }

  // attendance_count: 既存の attendance_count が突出して大きい場合（union より大）
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1'],attendance_count:99}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1','t2'],attendance_count:1}
    ]};
    const r = env.applyMergeImport(imported,current);
    // 注: normalizeBranchMaster は attendance_count を tournament_ids.length に強制する
    //      よって current.members[0].attendance_count は 1 になる（normalize 後）
    //      union後は 2件 → max(1,1,2) = 2
    assertEq(r.newMaster.members[0].attendance_count,2,'A3-S6-mrg-26: normalize 後の値で max を取る');
  }

  // tombstone: 既存 deleted=true は imported deleted=false でも復元しない
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.newMaster.members[0].deleted,true,'A3-S6-mrg-27: deleted=true は自動復元しない（既存維持）');
    assertEq(r.newMaster.members[0].deleted_at,'2026-04-10','A3-S6-mrg-28: deleted_at は既存維持');
  }

  // tombstone 安全側（OR）: 既存 deleted=false + imported deleted=true → deleted=true（安全側）
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[]}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.newMaster.members[0].deleted,true,'A3-S6-mrg-29: 既存 deleted=false + imported deleted=true → 結果は deleted=true（安全側）');
    assertEq(r.newMaster.members[0].deleted_at,'2026-04-10','A3-S6-mrg-29b: deleted_at はインポート側を採用');
  }

  // 新規 import が tombstone（既存にない id）→ そのまま追加
  {
    const current = env.createEmptyBranchMaster();
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:[],deleted:true,deleted_at:'2026-04-10'}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.newMaster.members.length,1,'A3-S6-mrg-30: 新規 tombstone 追加');
    assertEq(r.newMaster.members[0].deleted,true,'A3-S6-mrg-31: 新規 tombstone の deleted=true 保持');
  }

  // name+yomi 一致だけでは自動統合しない（id 違いは別人）
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1']}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_222222222222',name:'山田太郎',yomi:'やまだたろう',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t2']}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.summary.added,1,'A3-S6-mrg-32: name+yomi 一致でも id 違いは別人 added=1');
    assertEq(r.summary.merged,0,'A3-S6-mrg-33: 自動統合しない merged=0');
    assertEq(r.newMaster.members.length,2,'A3-S6-mrg-34: 2件存在（同名異人）');
  }

  // 入力 mutate 防止
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[{id:'m_111111111111',name:'X',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1']}]
    });
    const imported = {schema_version:1,members:[
      {id:'m_111111111111',name:'Y',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t2']}
    ]};
    const importedJson = JSON.stringify(imported);
    const currentMembers0 = JSON.parse(JSON.stringify(current.members[0]));
    env.applyMergeImport(imported,current);
    assertEq(JSON.stringify(imported),importedJson,'A3-S6-mrg-35: 入力 parsed を mutate しない');
    assertEq(JSON.stringify(current.members[0]),JSON.stringify(currentMembers0),'A3-S6-mrg-36: currentMaster を mutate しない');
  }

  // 混合: 既存 + 新規 + 統合
  {
    const current = env.normalizeBranchMaster({
      schema_version:1,
      members:[
        {id:'m_111111111111',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1']},
        {id:'m_222222222222',name:'B',yomi:'',first_attended:'2026-02-01',last_attended:'2026-02-01',tournament_ids:['t2']}
      ]
    });
    const imported = {schema_version:1,members:[
      {id:'m_222222222222',name:'B-imp',yomi:'',first_attended:'2026-02-01',last_attended:'2026-04-01',tournament_ids:['t3']},
      {id:'m_333333333333',name:'C',yomi:'',first_attended:'2026-03-01',last_attended:'2026-03-01',tournament_ids:['t4']}
    ]};
    const r = env.applyMergeImport(imported,current);
    assertEq(r.summary.added,1,'A3-S6-mrg-37: 新規 1件 (m_333..)');
    assertEq(r.summary.merged,1,'A3-S6-mrg-38: 統合 1件 (m_222..)');
    assertEq(r.summary.total,3,'A3-S6-mrg-39: 合計 3件');
    // m_222 の name は既存維持
    let mB=null;
    for(let i=0;i<r.newMaster.members.length;i++){if(r.newMaster.members[i].id==='m_222222222222'){mB=r.newMaster.members[i];break;}}
    assertEq(mB.name,'B','A3-S6-mrg-40: 統合された member の name は既存維持');
    assertEq(mB.last_attended,'2026-04-01','A3-S6-mrg-41: 統合された member の last_attended は新しい方');
  }
}

// ============================================================
// A-3 Stage 7: クイックフィルタ（前回参加・3ヶ月以内・常連）
// ============================================================
{
  const sample = [
    {id:'m_aaaaaaaaaaaa',name:'A',yomi:'',first_attended:'2026-01-01',last_attended:'2026-05-05',tournament_ids:['t1','t2','t3','t4','t5','t6'],attendance_count:6},
    {id:'m_bbbbbbbbbbbb',name:'B',yomi:'',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1','t2'],attendance_count:2},
    {id:'m_cccccccccccc',name:'C',yomi:'',first_attended:'2025-01-01',last_attended:'2026-01-15',tournament_ids:['t1'],attendance_count:1},
    {id:'m_dddddddddddd',name:'D',yomi:'',first_attended:'2024-01-01',last_attended:'2024-06-01',tournament_ids:['t1','t2','t3','t4','t5'],attendance_count:5},
    {id:'m_eeeeeeeeeeee',name:'E',yomi:'',first_attended:'2026-04-15',last_attended:'2026-05-05',tournament_ids:['t1'],attendance_count:1}
  ];

  // computeLatestAttendedDate
  {
    assertEq(env.computeLatestAttendedDate(sample),'2026-05-05','A3-S7-qf-01: 最大日 2026-05-05');
    assertEq(env.computeLatestAttendedDate([]),'','A3-S7-qf-02: 空配列 → 空文字');
    assertEq(env.computeLatestAttendedDate([{last_attended:''}]),'','A3-S7-qf-03: 空 last_attended → 空');
  }

  // computeDateBefore
  {
    assertEq(env.computeDateBefore('2026-05-05',90),'2026-02-04','A3-S7-qf-04: 90日前計算（2026-02-04）');
    assertEq(env.computeDateBefore('2026-05-05',0),'2026-05-05','A3-S7-qf-05: 0日前は同日');
    assertEq(env.computeDateBefore('invalid',90),'','A3-S7-qf-06: 不正日付は空');
  }

  // applyQuickFilter: 未指定（null）は全件
  {
    const r = env.applyQuickFilter(sample,null,'2026-05-05');
    assertEq(r.length,sample.length,'A3-S7-qf-07: null は全件');
  }

  // applyQuickFilter: 前回参加（最終大会日と一致するもののみ）
  {
    const r = env.applyQuickFilter(sample,env.QUICK_FILTER_RECENT_LAST,'2026-05-05');
    assertEq(r.length,2,'A3-S7-qf-08: 前回参加は 2件 (A, E)');
    const ids = r.map(function(m){return m.id;}).sort();
    assertEq(ids[0],'m_aaaaaaaaaaaa','A3-S7-qf-09: A 含む');
    assertEq(ids[1],'m_eeeeeeeeeeee','A3-S7-qf-10: E 含む');
  }

  // applyQuickFilter: 前回参加（全員空 last_attended は空）
  {
    const r = env.applyQuickFilter([{id:'x',last_attended:''}],env.QUICK_FILTER_RECENT_LAST,'2026-05-05');
    assertEq(r.length,0,'A3-S7-qf-11: 全員空 → 0件');
  }

  // applyQuickFilter: 3ヶ月以内（90日以内）
  {
    // today=2026-05-05、threshold=2026-02-04
    // A=2026-05-05, B=2026-04-01, C=2026-01-15, D=2024-06-01, E=2026-05-05
    // C は閾値 2026-02-04 より前 → 除外、D も除外
    // A, B, E が含まれる
    const r = env.applyQuickFilter(sample,env.QUICK_FILTER_WITHIN_3MO,'2026-05-05');
    assertEq(r.length,3,'A3-S7-qf-12: 3ヶ月以内は 3件 (A, B, E)');
    const ids = r.map(function(m){return m.id;}).sort();
    assertEq(ids[0],'m_aaaaaaaaaaaa','A3-S7-qf-13: A 含む');
    assertEq(ids[1],'m_bbbbbbbbbbbb','A3-S7-qf-14: B 含む');
    assertEq(ids[2],'m_eeeeeeeeeeee','A3-S7-qf-15: E 含む');
  }

  // applyQuickFilter: 3ヶ月以内（境界日: 閾値ちょうどは含む）
  {
    const ms=[{id:'x',last_attended:'2026-02-04',attendance_count:1}];
    const r = env.applyQuickFilter(ms,env.QUICK_FILTER_WITHIN_3MO,'2026-05-05');
    assertEq(r.length,1,'A3-S7-qf-16: 閾値ちょうど（2026-02-04）は含む');
  }

  // applyQuickFilter: 3ヶ月以内（閾値より前は除外）
  {
    const ms=[{id:'x',last_attended:'2026-02-03',attendance_count:1}];
    const r = env.applyQuickFilter(ms,env.QUICK_FILTER_WITHIN_3MO,'2026-05-05');
    assertEq(r.length,0,'A3-S7-qf-17: 閾値より前（2026-02-03）は除外');
  }

  // applyQuickFilter: 3ヶ月以内（未来日付は除外）
  {
    const ms=[{id:'x',last_attended:'2099-01-01',attendance_count:1}];
    const r = env.applyQuickFilter(ms,env.QUICK_FILTER_WITHIN_3MO,'2026-05-05');
    assertEq(r.length,0,'A3-S7-qf-18: 未来日付は除外（不正データ防御）');
  }

  // applyQuickFilter: 3ヶ月以内（today 不正なら空）
  {
    const r = env.applyQuickFilter(sample,env.QUICK_FILTER_WITHIN_3MO,'invalid');
    assertEq(r.length,0,'A3-S7-qf-19: today 不正 → 空');
  }

  // applyQuickFilter: 常連（attendance_count >= 5）
  {
    const r = env.applyQuickFilter(sample,env.QUICK_FILTER_REGULAR,'2026-05-05');
    assertEq(r.length,2,'A3-S7-qf-20: 常連は 2件 (A:6回, D:5回)');
    const ids = r.map(function(m){return m.id;}).sort();
    assertEq(ids[0],'m_aaaaaaaaaaaa','A3-S7-qf-21: A 含む（6回）');
    assertEq(ids[1],'m_dddddddddddd','A3-S7-qf-22: D 含む（ちょうど5回）');
  }

  // applyQuickFilter: 常連（境界 attendance_count=4 は含まない）
  {
    const ms=[{id:'x',last_attended:'2026-01-01',attendance_count:4}];
    const r = env.applyQuickFilter(ms,env.QUICK_FILTER_REGULAR,'2026-05-05');
    assertEq(r.length,0,'A3-S7-qf-23: 4回は常連に含まない');
  }

  // applyQuickFilter: 不明な filterKey は全件返す
  {
    const r = env.applyQuickFilter(sample,'unknown_key','2026-05-05');
    assertEq(r.length,sample.length,'A3-S7-qf-24: 不明 key は全件');
  }

  // applyQuickFilter: 入力 mutate 防止
  {
    const ms=[{id:'x',last_attended:'2026-05-05',attendance_count:6}];
    const before = JSON.stringify(ms);
    env.applyQuickFilter(ms,env.QUICK_FILTER_REGULAR,'2026-05-05');
    assertEq(JSON.stringify(ms),before,'A3-S7-qf-25: 入力配列 mutate しない');
  }

  // applyQuickFilter: 配列以外は []
  {
    assertEq(env.applyQuickFilter(null,env.QUICK_FILTER_REGULAR,'2026-05-05').length,0,'A3-S7-qf-26: null は []');
    assertEq(env.applyQuickFilter(undefined,null,'2026-05-05').length,0,'A3-S7-qf-27: undefined は []');
  }
}

// 結果出力
if (fail===0) {
  console.log('  支部マスタ機能テスト: PASS '+pass+'件 / FAIL 0件');
  process.exit(0);
} else {
  console.error('  支部マスタ機能テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(1);
}
