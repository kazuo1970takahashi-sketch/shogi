#!/usr/bin/env node
// PAST-ADD-FEE-INHERIT-001: 過去参加者の「一括追加」(finalizeAddPastParticipants) が支部マスタの
//   会費区分(member / grade)を取りこぼさず、「単発追加」(addPlayerFromMaster) と同じ値・同じ getFee を
//   出すことを固定する回帰テスト。
//
//   旧バグ: 一括追加が member:'member' / grade:'ippan' をハードコードし、中学生以下(chu)・女性(josei)・
//     支部員以外(other) を全員「一般・支部員」として登録 → 会費が誤計算されていた（単発 addPlayerFromMaster
//     は正しく引き継ぐため、一括 vs 単発で非対称）。本 PR は両経路を共有 helper normalizeMasterFeeFields に
//     集約して対称化し、josei も新たに保持する。
//
//   観点:
//     H.  normalizeMasterFeeFields(共有 helper・純): chu/josei 保持・other 保持・未知grade→ippan・
//         未定義/欠落→既定(member/ippan)。negative control 込み。
//     S.  addPlayerFromMaster(単発・純): master の member/grade を上記正規化で player に引き継ぐ。
//     B.  finalizeAddPastParticipants(一括・副作用あり): 同じ正規化で引き継ぐ（旧ハードコード回帰）。
//     EQ. 単発 vs 一括の対称性: 同一 master member を両経路で追加 → player.member/grade が一致し、
//         getFee も一致する（特に女性 josei・支部員以外 other で取りこぼさない）。
//     BATCH. 一括で chu/josei/other/ippan を同時追加 → 各自が保持される（全員 ippan/member に潰れない）。
//   データは完全架空(架空…)。実データ不使用。shogi_v4.html は本テストで変更しない。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_past_add_fee_inherit_001.js <html>'); process.exit(1); }
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
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
      disabled:false, type:'',
      style:{}, _attrs:{}, childNodes:[], _listeners:{},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev){ (this._listeners[ev]=this._listeners[ev]||[]).push(true); },
      removeEventListener:function(){},
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

function loadEnv(){
  const ctx = makeContext();
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){} };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeMasterFeeFields:normalizeMasterFeeFields,
       addPlayerFromMaster:addPlayerFromMaster,
       finalizeAddPastParticipants:finalizeAddPastParticipants,
       getFee:getFee,
       normalizeState:normalizeState,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){ /* no-op timer */ }
  );
}

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }
function assertEq(a,b,msg){ (a===b)?ok(msg):ng(msg+'  [期待:'+JSON.stringify(b)+' / 実際:'+JSON.stringify(a)+']'); }

// 完全架空の空 state（A/B 2クラス・未開始）。
function emptyState(){
  return {
    players:{A:[],B:[]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

// 架空 master member を1人作る。grade/member を省略すると欠落（negative control）を再現できる。
function mkMember(over){
  var base={ id:'m-x', name:'架空某', yomi:'かくうぼう', last_class:'A',
    last_attended:'2026-05-01', first_attended:'2025-01-01', attendance_count:1,
    tournament_ids:['t1'], deleted:false, deleted_at:null, note:'', city:'' };
  for(var k in over){ if(over.hasOwnProperty(k)) base[k]=over[k]; }
  // over で member / grade を明示的に消したい場合は undefined を渡す（delete 相当）。
  if(over && over.member===undefined && ('member' in over)) delete base.member;
  if(over && over.grade===undefined && ('grade' in over)) delete base.grade;
  return base;
}

// 会費区分の検証マトリクス。expMember/expGrade=正規化後の期待。expFee=現 getFee の期待額。
//   ※ josei は #326（FEE-JOSEI-001）で getFee が chu と同額に揃った（支部員=0円 / 支部員以外=500円）。
//     本テストは grade='josei' を「値として保持」することを固定し、両経路の getFee 一致を保証する。
var CASES = [
  {key:'chu-mem',  member:'member', grade:'chu',   expMember:'member', expGrade:'chu',   expFee:0    },
  {key:'chu-oth',  member:'other',  grade:'chu',   expMember:'other',  expGrade:'chu',   expFee:500  },
  {key:'jos-mem',  member:'member', grade:'josei', expMember:'member', expGrade:'josei', expFee:0    },
  {key:'jos-oth',  member:'other',  grade:'josei', expMember:'other',  expGrade:'josei', expFee:500  },
  {key:'ipp-mem',  member:'member', grade:'ippan', expMember:'member', expGrade:'ippan', expFee:500  },
  {key:'ipp-oth',  member:'other',  grade:'ippan', expMember:'other',  expGrade:'ippan', expFee:1000 },
  // negative control: 未知 grade（段位文字列）→ ippan に正規化（会費区分へ持ち込まない）
  {key:'dan-mem',  member:'member', grade:'二段',  expMember:'member', expGrade:'ippan', expFee:500  },
  // negative control: member/grade 欠落 → 既定（member / ippan）
  {key:'bare',     member:undefined, grade:undefined, expMember:'member', expGrade:'ippan', expFee:500 }
];

const env = loadEnv();

// =====================================================================
// H. normalizeMasterFeeFields（共有 helper・純）
// =====================================================================
(function(){
  var f = env.normalizeMasterFeeFields;
  assert(typeof f==='function', 'H0 normalizeMasterFeeFields が公開関数として存在');
  assertEq(f({member:'member',grade:'chu'}).grade, 'chu',   'H1 grade=chu は保持');
  assertEq(f({member:'member',grade:'josei'}).grade, 'josei','H2 grade=josei は保持（新規）');
  assertEq(f({member:'member',grade:'ippan'}).grade, 'ippan','H3 grade=ippan は ippan');
  assertEq(f({member:'member',grade:'二段'}).grade, 'ippan', 'H4 未知 grade(二段) は ippan（negative control）');
  assertEq(f({member:'member'}).grade, 'ippan',             'H5 grade 欠落は既定 ippan');
  assertEq(f({grade:'chu'}).member, 'member',               'H6 member 欠落は既定 member');
  assertEq(f({member:'other',grade:'chu'}).member, 'other', 'H7 member=other は保持');
  assertEq(f({member:'member',grade:'chu'}).member, 'member','H8 member=member は member');
  assertEq(f(null).member, 'member',                        'H9 null 入力でも throw せず既定 member');
  assertEq(f(null).grade, 'ippan',                          'H10 null 入力でも throw せず既定 ippan');
})();

// =====================================================================
// S / B / EQ. 単発 addPlayerFromMaster と一括 finalizeAddPastParticipants の対称性
// =====================================================================
CASES.forEach(function(c){
  var over={ id:'m-'+c.key, name:'架空'+c.key };
  if('member' in c) over.member=c.member;
  if('grade' in c) over.grade=c.grade;
  var srcMember = mkMember(over);

  // --- 単発（純）---
  var singleState = env.normalizeState(emptyState());
  var sres = env.addPlayerFromMaster(srcMember.id, 'A',
    {schema_version:1, members:[ JSON.parse(JSON.stringify(srcMember)) ]}, singleState);
  assert(sres && sres.success===true, 'S['+c.key+'] addPlayerFromMaster 成功');
  var sPlayer = sres && sres.player;
  assertEq(sPlayer && sPlayer.member, c.expMember, 'S['+c.key+'] 単発: member='+c.expMember);
  assertEq(sPlayer && sPlayer.grade,  c.expGrade,  'S['+c.key+'] 単発: grade='+c.expGrade);

  // --- 一括（副作用あり）---
  env._setState(env.normalizeState(emptyState()));
  env.finalizeAddPastParticipants([ JSON.parse(JSON.stringify(srcMember)) ], {schema_version:1,members:[]}, false);
  var aList = env._getState().players.A;
  var bPlayer = null;
  for(var i=0;i<aList.length;i++){ if(aList[i] && aList[i].member_id===srcMember.id){ bPlayer=aList[i]; break; } }
  assert(bPlayer!==null, 'B['+c.key+'] 一括追加で player が1名 state に入る');
  assertEq(bPlayer && bPlayer.member, c.expMember, 'B['+c.key+'] 一括: member='+c.expMember+'（旧ハードコード回帰）');
  assertEq(bPlayer && bPlayer.grade,  c.expGrade,  'B['+c.key+'] 一括: grade='+c.expGrade+'（旧ハードコード回帰）');

  // --- EQ: 両経路の値が一致し、getFee も一致（会費が単発・一括で揃う）---
  assertEq(bPlayer && bPlayer.member, sPlayer && sPlayer.member, 'EQ['+c.key+'] member が単発=一括で一致');
  assertEq(bPlayer && bPlayer.grade,  sPlayer && sPlayer.grade,  'EQ['+c.key+'] grade が単発=一括で一致');
  var sFee = env.getFee(sPlayer.member, sPlayer.grade);
  var bFee = env.getFee(bPlayer.member, bPlayer.grade);
  assertEq(bFee, sFee,    'EQ['+c.key+'] getFee が単発=一括で一致');
  assertEq(bFee, c.expFee,'EQ['+c.key+'] getFee='+c.expFee+'円（正しい会費）');
});

// =====================================================================
// BATCH. 一括で chu / josei / other / ippan を同時追加 → 各自が保持される
//   （旧バグなら全員 member:'member'/grade:'ippan' に潰れる。negative control）
// =====================================================================
(function(){
  var picked = [
    mkMember({id:'b-chu',   name:'架空中学', member:'member', grade:'chu'}),
    mkMember({id:'b-josei', name:'架空女子', member:'member', grade:'josei'}),
    mkMember({id:'b-other', name:'架空外部', member:'other',  grade:'ippan'}),
    mkMember({id:'b-ippan', name:'架空一般', member:'member', grade:'ippan'})
  ];
  env._setState(env.normalizeState(emptyState()));
  env.finalizeAddPastParticipants(picked, {schema_version:1,members:[]}, false);
  var A = env._getState().players.A;
  function find(mid){ for(var i=0;i<A.length;i++){ if(A[i]&&A[i].member_id===mid) return A[i]; } return null; }
  assertEq(A.length, 4, 'BATCH-0 4名すべて追加（重複スキップ無し）');

  var pc=find('b-chu'), pj=find('b-josei'), po=find('b-other'), pi=find('b-ippan');
  assert(pc&&pc.grade==='chu'&&pc.member==='member',   'BATCH-1 中学生は grade=chu/member=member を保持（会費0円）');
  assert(pj&&pj.grade==='josei'&&pj.member==='member', 'BATCH-2 女性は grade=josei/member=member を保持');
  assert(po&&po.member==='other'&&po.grade==='ippan',  'BATCH-3 支部員以外は member=other を保持（会費1000円）');
  assert(pi&&pi.member==='member'&&pi.grade==='ippan', 'BATCH-4 一般・支部員はそのまま');

  // 旧バグの否定: 中学生・女性・支部員以外が「一般・支部員」に潰れていない
  assert(!(pc.grade==='ippan'&&pc.member==='member'), 'BATCH-5 [回帰] 中学生が一般・支部員に潰れない');
  assert(!(pj.grade==='ippan'),                       'BATCH-6 [回帰] 女性が ippan に潰れない');
  assert(!(po.member==='member'),                     'BATCH-7 [回帰] 支部員以外が支部員に潰れない');

  // 会費が個別に正しい（旧バグは全員 member/ippan＝一律500円なので 0円・1000円を出せない）。
  assertEq(env.getFee(pc.member,pc.grade), 0,    'BATCH-8 中学生会員の会費=0円（旧バグなら500円）');
  assertEq(env.getFee(po.member,po.grade), 1000, 'BATCH-9 一般・支部員以外の会費=1000円（旧バグなら500円）');
  var total = env.getFee(pc.member,pc.grade)+env.getFee(pj.member,pj.grade)+env.getFee(po.member,po.grade)+env.getFee(pi.member,pi.grade);
  assertEq(total, 1500, 'BATCH-10 4名の会費合計=1500円（chu0+josei0+other1000+ippan500）');
})();

console.log('  過去参加者 一括追加 会費区分引き継ぎ テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
