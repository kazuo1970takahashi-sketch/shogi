#!/usr/bin/env node
// MEMBERS-CANDIDATE-MASTER-RECUT-001: members 形式 参加者候補マスタ読込の単体テスト（#194 価値分の最新 orphan base 再切り）。
//   完全架空の members 形式 JSON を「参加者候補マスタ」として安全に読み込めることを固定する。
//   実名・実参加者・実マスタ・個人情報・secret・対応表は一切含まない（fixture/コメントとも 架空 のみ）。
//
//   検証ゴール:
//     G1 形式判定:   detectImportFormat（members→branch_master / players→tournament / 不明→unknown）、大会データは上書き拒否
//     G2 member 変換: 外部 boolean（true=支部員 / false=一般）を受理。native 'member'/'other' 文字列・未指定は後方互換
//     G3 whitelist:   address/phone/email/birthday/paymentHistory/pastResults 等の禁止項目は正規化で除外（許可キーのみ）
//     G4 フィールド:   name/yomi/last_class/city/note 保持、grade 段位は非取込(ippan)、attendance_count は tournament_ids 長で再計算
//     G5 deleted:     deleted=true は墓石保持だが候補(findMemberCandidates)に出ない・生存は出る・候補数
//     G6 読込先:      候補マスタ(shogi_branch_master)へ保存・大会state(shogi_v4)不変・再読込で残存
//     G7 堅牢性:      破損入力でも落ちず空相当を返す
//
//   ハーネスは既存 test_*.js と同方式（<script> 抽出 → new Function に DOM/localStorage mock を渡して実体ロード）。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_members_candidate_master_recut_001.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/import/members_candidate_recut_001_synthetic.json'),'utf8'));

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM / localStorage mock（既存 test_start_frp_ux_001.js と同方式：top-level 実行が落ちない最小限）。
function makeContext(){
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'',
      type:'', selected:false, checked:false, disabled:false, hidden:false,
      style:{}, _attrs:{}, _innerHTML:'', childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      insertBefore:function(c){ this.childNodes.unshift(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
      remove:function(){},
      addEventListener:function(){}, removeEventListener:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      removeAttribute:function(k){ delete this._attrs[k]; },
      focus:function(){}, blur:function(){}, click:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
      get firstChild(){ return this.childNodes[0]||null; },
      get lastChild(){ return this.childNodes[this.childNodes.length-1]||null; },
      get children(){ return this.childNodes.filter(function(n){return n.nodeType===1;}); },
      get innerHTML(){ return this._innerHTML; },
      set innerHTML(v){ this._innerHTML=String(v); if(v==='')this.childNodes=[]; }
    };
  }
  var elements={};
  var docMock={
    _elements:elements,
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3, textContent:String(t==null?'':t)}; },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  function BlobMock(parts,opt){ return {_isMockBlob:true, _content:(parts&&parts[0])?String(parts[0]):'', type:opt&&opt.type}; }
  var urlMock={ createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){} };
  return { document:docMock, window:winMock, localStorage:localStorageMock, Blob:BlobMock, URL:urlMock };
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeBranchMaster:normalizeBranchMaster,
       detectImportFormat:detectImportFormat,
       applyOverwriteImport:applyOverwriteImport,
       findMemberCandidates:findMemberCandidates,
       createEmptyBranchMaster:createEmptyBranchMaster,
       saveBranchMaster:saveBranchMaster,
       loadBranchMaster:loadBranchMaster,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       STORAGE_KEY:STORAGE_KEY
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, console, Promise, function(){return 0;}
  );
  api._localStorage = ctx.localStorage;
  return api;
}

let pass=0, fail=0;
function ok(){ pass++; }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok():ng(msg); }
function assertEq(a,b,msg){ JSON.stringify(a)===JSON.stringify(b)?ok():ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a)); }
function byId(members,id){ return members.filter(function(m){return m.id===id;})[0]||null; }

const env = loadEnv();

// ---- F0 fixture sanity（完全架空） ----
assert(FIXTURE && Array.isArray(FIXTURE.members) && FIXTURE.members.length===6, 'F0 fixture は members 6件');
FIXTURE.members.forEach(function(m){ assert(/^架空 /.test(m.name), 'F0 fixture name は架空命名: '+m.name); });

// ---- G1 形式判定 ----
assertEq(env.detectImportFormat(FIXTURE), 'branch_master', 'G1 members 形式 → branch_master');
assertEq(env.detectImportFormat({players:{A:[],B:[]}}), 'tournament', 'G1 大会データ(players) → tournament');
assertEq(env.detectImportFormat({foo:1}), 'unknown', 'G1 不明形式 → unknown');
const rej = env.applyOverwriteImport({players:{A:[],B:[]}});
assert(rej.success===false && rej.error==='tournament_format', 'G1 大会データは上書きインポート拒否(tournament_format)');

// ---- G2 member 真偽値変換 + 文字列/未指定 後方互換 ----
const norm = env.normalizeBranchMaster(FIXTURE);
assert(norm.members.length===6, 'G2 normalize 6件(墓石含む)');
assertEq(byId(norm.members,'synthetic-001').member, 'member', 'G2 member:true → member(支部員)');
assertEq(byId(norm.members,'synthetic-002').member, 'other', 'G2 member:false → other(一般)【真偽値後方互換の要】');
assertEq(byId(norm.members,'synthetic-005').member, 'other', 'G2 member:false(禁止項目入り) → other');
assertEq(byId(norm.members,'synthetic-006').member, 'other', 'G2 member:"other"(native文字列) → other');
const inl = env.normalizeBranchMaster({schema_version:1, members:[
  {id:'s-m', name:'架空 七郎', member:'member'},
  {id:'s-d', name:'架空 八郎'}
]});
assertEq(byId(inl.members,'s-m').member, 'member', 'G2 member:"member"(native文字列) → member');
assertEq(byId(inl.members,'s-d').member, 'member', 'G2 member 未指定 → member 既定（後方互換）');

// ---- G3 whitelist: 禁止項目除外・許可キーのみ ----
const m5 = byId(norm.members,'synthetic-005');
['address','住所','phone','tel','電話番号','email','mail','メール','birthday','birthdate','生年月日','paymentHistory','支払履歴','pastResults','過去成績'].forEach(function(k){
  assert(!(k in m5), 'G3 禁止項目 '+k+' は正規化で除外される');
});
const allowed = ['id','name','yomi','last_class','last_attended','first_attended','attendance_count','tournament_ids','deleted','deleted_at','note','member','grade','city'];
Object.keys(m5).forEach(function(k){ assert(allowed.indexOf(k)>=0, 'G3 正規化後キーは whitelist のみ（余分: '+k+'）'); });

// ---- G4 フィールド保持 + grade 非取込 + attendance 再計算 ----
const m3 = byId(norm.members,'synthetic-003');
assertEq(m3.name, '架空 三郎', 'G4 name 保持');
assertEq(m3.yomi, 'かくう さぶろう', 'G4 yomi 保持');
assertEq(m3.last_class, 'A', 'G4 last_class 保持');
assertEq(m3.city, '架空市', 'G4 city 保持');
assertEq(m3.note, '架空メモ', 'G4 note 保持');
assertEq(m3.grade, 'ippan', 'G4 grade 段位"二段"は会費区分へ持込まず既定 ippan');
assertEq(m3.attendance_count, 2, 'G4 attendance_count は入力(99)でなく tournament_ids 長(=2)で再計算');

// ---- G5 deleted 墓石 + 候補除外 ----
const m4 = byId(norm.members,'synthetic-004');
assert(m4 && m4.deleted===true, 'G5 deleted=true は墓石として保持');
assert(env.findMemberCandidates({name:'架空 四郎'}, norm).length===0, 'G5 deleted member は候補(findMemberCandidates)に出ない');
const candLive = env.findMemberCandidates({name:'架空 一郎'}, norm);
assert(candLive.length===1 && candLive[0].id==='synthetic-001', 'G5 生存 member は候補に出る');
assert(norm.members.length===6 && norm.members.filter(function(m){return !m.deleted;}).length===5, 'G5 候補数: 6件中 生存5 + 墓石1');

// ---- G6 読込先＝候補マスタ / 大会state不変 / 再読込で残存 ----
const env2 = loadEnv();
const stateSnapshot = JSON.stringify({players:{A:[{name:'架空 当日'}], B:[]}, round:1});
env2._localStorage.setItem(env2.STORAGE_KEY, stateSnapshot);
assert(env2.loadBranchMaster().members.length===0, 'G6 取込前は候補マスタ空');
const res = env2.applyOverwriteImport(FIXTURE);
assert(res.success===true, 'G6 members 形式の上書きインポート成功');
env2.saveBranchMaster(res.newMaster);
assert(env2._localStorage.getItem(env2.BRANCH_MASTER_KEY)!==null, 'G6 候補マスタが shogi_branch_master に保存される');
assertEq(env2._localStorage.getItem(env2.STORAGE_KEY), stateSnapshot, 'G6 大会state(shogi_v4)は不変（当日参加者を自動登録しない）');
const reloaded = env2.loadBranchMaster();
assert(reloaded.members.length===6 && reloaded.members.filter(function(m){return !m.deleted;}).length===5, 'G6 再読込で候補マスタが残る(6件/生存5)');

// ---- G7 堅牢性: 破損入力でも落ちない ----
[null, undefined, [], {}, {schema_version:999, members:[]}, 'string', 42].forEach(function(bad,i){
  let out=null; try{ out=env.normalizeBranchMaster(bad); }catch(e){ out=null; }
  assert(out && Array.isArray(out.members), 'G7 破損入力#'+i+' で落ちず members 配列を返す');
});

console.log('PASS='+pass+' FAIL='+fail);
if(fail>0) process.exit(1);
