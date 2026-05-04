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
       isValidYmd:isValidYmd,
       todayYmd:todayYmd,
       normalizeBranchMaster:normalizeBranchMaster,
       loadBranchMaster:loadBranchMaster,
       saveBranchMaster:saveBranchMaster,
       findMemberCandidates:findMemberCandidates,
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

// 結果出力
if (fail===0) {
  console.log('  支部マスタ機能テスト: PASS '+pass+'件 / FAIL 0件');
  process.exit(0);
} else {
  console.error('  支部マスタ機能テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(1);
}
