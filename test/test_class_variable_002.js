#!/usr/bin/env node
// CLASS-VARIABLE-002 (#768): 受付コアの A/B 固定を全クラス化（CV-1 の完結・C クラス分割運用の解禁）。
//   設計: Issue #768 設計完了 v1/v2（設計レビュー conditional-go 条件反映済み）。
//   観点:
//     ADD.  addPlayerFromMaster: C への追加成功（採番/属性/重複判定は A/B と同等）・未知/不正クラス reject・A/B 従来不変。
//     CHG.  changePlayerClass: A⇄C/B⇄C 移動・master.last_class=C 記録・skipMasterUpdate(#760) 契約不変・探索の全クラス化。
//     LCLS. last_class 不変条件の一般化（isSafeClassId 以外→null）: createMemberFromParticipant / normalizeBranchMaster(load) /
//           updateBranchMasterFromTournament(📋名簿を更新) / ☁復元（buildDerivedMemberStatsFromCloud / mergeDerivedStatsIntoMaster）。
//     PIN.  ppDenseSelectableClasses=getRegistrationClassList 素通し・旧「※A/B 以外は手入力」注記撤去・
//           finalizeAddPastParticipants 第4引数 cls 化・verifyMasterFieldPersisted の受理集合一般化。
//   データは完全架空のみ。
var fs = require('fs');
var targetPath = process.argv[2] || 'shogi_v4.html';
var RAW = fs.readFileSync(targetPath, 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

function extractFn(src, name){
  var idx = src.indexOf('function ' + name + '(');
  if(idx < 0) return null;
  var i = src.indexOf('{', idx);
  var depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(idx, i + 1); }
  }
  return null;
}
function buildEnv(names, prelude){
  var srcs = names.map(function(n){ var s = extractFn(RAW, n); if(!s) throw new Error('extract fail: ' + n); return s; });
  var body = (prelude || 'var state=null;') + srcs.join('\n') + '\nreturn {' + names.map(function(n){ return n + ':' + n; }).join(',') + '};';
  return new Function('Date', 'Math', body)(Date, Math);
}

var DEPS_ADD = ['isSafeClassId','isValidEntryNo','reconcileEntryNos','nextEntryNoForClass','normalizePersonName','normalizeYomi','normalizeCity','normalizeMasterFeeFields','addPlayerFromMaster'];
var DEPS_CHG = ['isSafeClassId','isValidEntryNo','reconcileEntryNos','nextEntryNoForClass','listClassIdsForMasterSync','changePlayerClass'];

function fxStateABC(){
  return {
    classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'},{id:'C',name:'Cクラス'}],
    players:{
      A:[{id:'pa1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',member_id:'m-a1',entry_no:1}],
      B:[],
      C:[{id:'pc1',name:'架空三郎',cls:'C',member:'member',grade:'ippan',member_id:'m-c1',entry_no:1}]
    }
  };
}
function fxMaster(){
  return {members:[
    {id:'m-a1',name:'架空太郎',yomi:'かくうたろう',last_class:'A',deleted:false,member:'member',grade:'ippan',city:''},
    {id:'m-c1',name:'架空三郎',yomi:'かくうさぶろう',last_class:'C',deleted:false,member:'member',grade:'ippan',city:''},
    {id:'m-new',name:'架空新子',yomi:'かくうしんこ',last_class:null,deleted:false,member:'member',grade:'josei',city:'沼津市'},
    {id:'m-new2',name:'架空新次',yomi:'かくうしんじ',last_class:null,deleted:false,member:'other',grade:'ippan',city:''}
  ]};
}

// ---- ADD. addPlayerFromMaster ----
{
  var eA = buildEnv(DEPS_ADD);
  // ADD-1: C への追加成功（採番=2・属性引き継ぎ・cls='C'）
  var st = fxStateABC();
  var r = eA.addPlayerFromMaster('m-new','C',fxMaster(),st);
  assert(r && r.success === true && st.players.C.length === 2, 'ADD-1 C クラスへ 📋名簿から追加できる');
  assert(r.success && r.player.cls === 'C' && r.player.entry_no === 2, 'ADD-2 cls="C"・entry_no は C 内で max+1 採番');
  assert(r.success && r.player.member === 'member' && r.player.grade === 'josei' && r.player.city === '沼津市', 'ADD-3 会費区分/市町村の引き継ぎは A/B と同等');
  // ADD-4: 全クラス横断重複（C 在籍の member_id を A に追加 → duplicate_member）
  var st2 = fxStateABC();
  var r2 = eA.addPlayerFromMaster('m-c1','A',fxMaster(),st2);
  assert(r2 && r2.success === false && r2.error === 'duplicate_member', 'ADD-4 C 在籍者の A への二重追加は duplicate_member（横断判定不変）');
  // ADD-5: 受け皿の無い未知クラス / 不正 id は invalid_class
  var st3 = fxStateABC();
  assert(eA.addPlayerFromMaster('m-new','ZZZ',fxMaster(),st3).error === 'invalid_class', 'ADD-5 受け皿配列の無い未知クラスは invalid_class');
  assert(eA.addPlayerFromMaster('m-new','C C',fxMaster(),st3).error === 'invalid_class', 'ADD-6 DOM 不安全な classId は invalid_class（isSafeClassId）');
  // ADD-7: A/B 従来挙動不変
  var st4 = fxStateABC();
  var r4 = eA.addPlayerFromMaster('m-new','B',fxMaster(),st4);
  assert(r4 && r4.success === true && st4.players.B.length === 1 && r4.player.entry_no === 1, 'ADD-7 B への追加は従来どおり');
}

// ---- CHG. changePlayerClass ----
{
  var eC = buildEnv(DEPS_CHG);
  // CHG-1: A→C 移動＋master.last_class='C' 記録（受け入れ基準3）
  var st = fxStateABC(), ms = fxMaster();
  var r = eC.changePlayerClass('m-a1','C',ms,st);
  assert(r && r.success === true && st.players.A.length === 0 && st.players.C.length === 2, 'CHG-1 A→C 移動できる');
  assert(r.success && r.player.cls === 'C' && r.player.entry_no === 2, 'CHG-2 C 内で entry_no 再採番');
  assert(ms.members[0].last_class === 'C', 'CHG-3 master.last_class に "C" が記録される（受け入れ基準3）');
  // CHG-4: C→B（C 在籍者の探索＝全クラス走査）
  var st2 = fxStateABC(), ms2 = fxMaster();
  var r2 = eC.changePlayerClass('m-c1','B',ms2,st2);
  assert(r2 && r2.success === true && r2.oldCls === 'C' && st2.players.B.length === 1, 'CHG-4 C 在籍者を B へ移動できる（探索の全クラス化）');
  assert(ms2.members[1].last_class === 'B', 'CHG-5 C→B でも master.last_class 更新');
  // CHG-6: skipMasterUpdate（#760 ゲスト大会）契約不変（C 移動でも master 不変）
  var st3 = fxStateABC(), ms3 = fxMaster();
  var r3 = eC.changePlayerClass('m-a1','C',ms3,st3,{skipMasterUpdate:true});
  assert(r3 && r3.success === true && ms3.members[0].last_class === 'A', 'CHG-6 skipMasterUpdate:true は C 移動でも master 不変（#760 契約）');
  // CHG-7: reject 系
  var st4 = fxStateABC();
  assert(eC.changePlayerClass('m-a1','ZZZ',fxMaster(),st4).error === 'invalid_class', 'CHG-7 未知クラスへの移動は invalid_class');
  assert(eC.changePlayerClass('m-c1','C',fxMaster(),fxStateABC()).error === 'same_class', 'CHG-8 同一クラス（C→C）は same_class');
  // CHG-9: A/B のみの state で従来挙動不変（探索順 A→B）
  var stAB = {players:{A:[{id:'p1',name:'架空太郎',cls:'A',member_id:'m-a1',entry_no:1}],B:[]}};
  var r9 = eC.changePlayerClass('m-a1','B',fxMaster(),stAB);
  assert(r9 && r9.success === true && r9.oldCls === 'A' && stAB.players.B.length === 1, 'CHG-9 A/B のみの state は従来どおり（listClassIdsForMasterSync 同順）');
}

// ---- LCLS. last_class 不変条件の一般化 ----
{
  // createMemberFromParticipant
  var eM = buildEnv(['isSafeClassId','generateMemberId','normalizePersonName','normalizeYomi','createMemberFromParticipant']);
  var m1 = eM.createMemberFromParticipant({name:'架空四郎',yomi:'かくうしろう',cls:'C',member:'member',grade:'ippan'},{members:[]},'2026-07-13');
  assert(m1.last_class === 'C', 'LCLS-1 createMemberFromParticipant: cls=C を last_class に記録');
  var m2 = eM.createMemberFromParticipant({name:'架空五郎',cls:'C C',member:'member',grade:'ippan'},{members:[]},'2026-07-13');
  assert(m2.last_class === null, 'LCLS-2 不正 classId は従来どおり null');

  // normalizeBranchMaster（load 正規化で C を消さない）
  var eN = buildEnv(['isSafeClassId','isValidYmd','todayYmd','normalizeCity','normalizeBranchMaster'],'var state=null;var BRANCH_MASTER_SCHEMA_VERSION=1;');
  var raw = {schema_version:1,updated_at:'x',members:[
    {id:'m1',name:'架空六郎',last_class:'C',last_attended:'2026-06-01',first_attended:'2026-06-01'},
    {id:'m2',name:'架空七郎',last_class:'あ',last_attended:'2026-06-01',first_attended:'2026-06-01'}
  ]};
  var nm = eN.normalizeBranchMaster(raw);
  assert(nm.members[0].last_class === 'C', 'LCLS-3 load 正規化が last_class="C" を保持（W1・これが無いと次回 load で消える）');
  assert(nm.members[1].last_class === null, 'LCLS-4 不正値（非 ASCII 等）は従来どおり null');

  // mergeDerivedStatsIntoMaster（☁復元マージが C を落とさない）
  var eG = buildEnv(['isSafeClassId','isValidYmd','mergeDerivedStatsIntoMaster']);
  var master = {members:[{id:'m-c9',name:'架空八郎',last_class:null,last_attended:'',first_attended:'',tournament_ids:[],attendance_count:0}]};
  eG.mergeDerivedStatsIntoMaster(master,{'m-c9':{member_id:'m-c9',last_class:'C',last_attended:'2026-06-14',first_attended:'2026-06-14',tournament_ids:['t_x']}});
  assert(master.members[0].last_class === 'C', 'LCLS-5 ☁復元マージで last_class="C" が採用される（W6）');
}

// ---- PIN. ソース構造ピン ----
assert(/function ppDenseSelectableClasses\(\)\{\s*return getRegistrationClassList\(\);\s*\}/.test(RAW), 'PIN-1 ppDenseSelectableClasses は getRegistrationClassList 素通し');
assert(RAW.indexOf('※A/B 以外は登録画面の手入力で受付') < 0, 'PIN-2 旧「※A/B 以外は手入力」注記は撤去');
assert(RAW.indexOf('function finalizeAddPastParticipants(picked,master,allEmptyYomi,cls){') >= 0, 'PIN-3 finalizeAddPastParticipants は第4引数 cls 化（#761 が自前 cls を渡せる）');
assert(RAW.indexOf("var allowedA=(isSafeClassId(expected)||expected===null);") >= 0, 'PIN-4 verifyMasterFieldPersisted の last_class 受理集合を一般化（S03/S22 の C verify）');
assert(RAW.indexOf("var cls=isSafeClassId(e['class'])?e['class']:null;") >= 0, 'PIN-5 ☁復元収集の class coercion を一般化（W5）');
assert(RAW.indexOf("if(isLatestAttendance273)member.last_class=isSafeClassId(p.cls)?p.cls:null;") >= 0, 'PIN-6 📋名簿更新（W3）が isSafeClassId 化');
assert((RAW.match(/member\.last_class=isSafeClassId\(p\.cls\)\?p\.cls:null;/g) || []).length === 2, 'PIN-7 W3（同期）と W4（統合）の両経路が一般化');
assert(RAW.indexOf("if(!isSafeClassId(cls)||!Array.isArray(state.players[cls]))return {success:false,error:'invalid_class'};") >= 0, 'PIN-8 addPlayerFromMaster の新ガード');
assert(RAW.indexOf("if(!isSafeClassId(newCls)||!Array.isArray(state.players[newCls]))return {success:false,error:'invalid_class'};") >= 0, 'PIN-9 changePlayerClass の新ガード');
assert(RAW.indexOf("var classes=listClassIdsForMasterSync(state);") >= 0, 'PIN-10 changePlayerClass の探索は全クラス走査');

console.log('CLASS-VARIABLE-002: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
