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
  return {
    document: docMock,
    window: winMock,
    localStorage: localStorageMock,
    crypto: (opts && opts.crypto) ? opts.crypto : defaultCrypto
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
       _localStorage:localStorage
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

// 結果出力
if (fail===0) {
  console.log('  支部マスタ機能テスト: PASS '+pass+'件 / FAIL 0件');
  process.exit(0);
} else {
  console.error('  支部マスタ機能テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(1);
}
