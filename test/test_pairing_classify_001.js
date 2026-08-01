#!/usr/bin/env node
// CHARACTERIZATION: classifyChangePairingCandidate（「対戦相手を変更」モーダルの候補分類・47行/return 7箇所）。
//   [PAIRING-CLASSIFY-TEST-001] Phase 2 開始ゲート③（料金・順位・ペアリングに振る舞いベースのテストがある）の
//   残っていた唯一の空白。着手時点で test/ 全体にこの関数名が1度も出てこなかった（文字列検査すら無い）。
//   近傍の test_in_app_modal_change_pairing_606.js は同じ「対戦相手を変更」機能を扱うが中身は RAW.indexOf(...)
//   によるソース検査だけで、関数を1度も呼んでいない（#798 と同じ形の穴）。本テストは**関数を実際に呼ぶ**。
//
//   これは characterization test（現状固定）である。
//     目的は「正しさの証明」ではなく「Phase 2 の前後で振る舞いが変わっていないことの担保」。
//     おかしいと思った挙動も直さず期待値として固定し、気になった点は RESULT に別記する。
//     shogi_v4.html は1行も変更しない。既存テストも1本も変更しない。
//
//   呼び出し規約（実測）:
//     classifyChangePairingCandidate(cls, idx, candidateId, role)   role は 'p1' | 'p2'
//     戻り: {status:'ok'|'blocked', reasonId, reasonLabel}
//   グローバル依存3つ（テスト側で組み立てる）:
//     state.pairings[cls]  … [{p1,p2,winner?}, …]
//     state.results[cls]   … pairHasRematch が走査する回戦別の配列
//     同ファイル内の findPairContainingPlayer / pairHasRematch
//
//   return 7箇所 ⇄ テストの対応（RESULT の対応表と同じ）:
//     R1 pairings[idx] が無い                     → blocked / 'R-invalid'         … 群 [1]
//     R2 候補 = その役の現在値                     → ok                            … 群 [2]
//     R3 候補 = 反対側の現在値                     → blocked / 'R-self'            … 群 [3]
//     R4 候補が他ペアに属さない（otherIdx===-1）   → ok（replace 経路）             … 群 [4]
//     R5 相手ペアに winner が入っている            → blocked / 'R-winner-locked'   … 群 [5]
//     R6 swap で再戦が発生（2条件の OR）           → blocked / 'R-rematch-swap'    … 群 [6a][6b]
//     R7 swap で再戦なし                          → ok                            … 群 [7]
//
//   入力は完全架空（id は x1/x2/y1/y2/z1 の記号のみ・実データ不使用）。読み取り専用。
//   読込方式は近傍の test_char_pairing_quality_001.js に合わせる（Phase 1 スライス2 で共通化予定のため
//   ここで独自方式を持ち込まない）。state を触る必要があるので _setState だけ足している。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

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
    createElement:function(tag){ return makeNode(tag); }, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2] || 'shogi_v4.html';
if(!fs.existsSync(targetPath)){ console.error('対象ファイルなし: '+targetPath); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { classifyChangePairingCandidate:classifyChangePairingCandidate,
              findPairContainingPlayer:findPairContainingPlayer,
              pairHasRematch:pairHasRematch,
              _setState:function(s){ state=s; } };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }

const env = loadEnv();
const classify = env.classifyChangePairingCandidate;

// ---- 盤面ヘルパ ------------------------------------------------------------
// 対象ペア（idx=0）は role によって鏡像にする。こうすると **どちらの role でも**
//   その役の現在値      = 'x1'
//   反対側の現在値      = 'x2'
//   swap で残る人       = 'x2'（keepPlayer）
//   swap で外れる人     = 'x1'（droppedFromTarget）
// になり、#2〜#7 の期待値を role によらず同一に書ける（＝左右非対称のバグはここで落ちる）。
function targetPair(role){ return (role==='p1') ? {p1:'x1',p2:'x2'} : {p1:'x2',p2:'x1'}; }
function setBoard(role, otherPair, results, extra){
  var pairings=[targetPair(role)];
  if(otherPair)pairings.push(otherPair);
  if(extra)for(var i=0;i<extra.length;i++)pairings.push(extra[i]);
  env._setState({
    classes:[{id:'A',name:'A級',started:true}],
    players:{ A:[{id:'x1'},{id:'x2'},{id:'y1'},{id:'y2'},{id:'z1'}] },
    pairings:{ A:pairings },
    results:{ A:results||[] }
  });
  return pairings;
}
// 1回戦だけの対戦履歴を組む（winner は再戦判定に影響しないので付けない）。
function history(pairs){ return pairs.length ? [pairs.map(function(p){ return {p1:p[0],p2:p[1],winner:''}; })] : []; }
function is(r,status,reasonId){ return !!r && r.status===status && r.reasonId===reasonId; }
const ROLES=['p1','p2'];

console.log('=== [1] R1: pairings[idx] が無い → blocked/R-invalid ===');
ROLES.forEach(function(role){
  setBoard(role,{p1:'y1',p2:'y2'},[]);
  var r=classify('A',99,'y1',role);
  assert(is(r,'blocked','R-invalid'),'[1-1/'+role+'] idx 範囲外 → blocked/R-invalid');
  assert(r.reasonLabel==='選択不可','[1-2/'+role+'] reasonLabel は 選択不可');
  assert(is(classify('A',-1,'y1',role),'blocked','R-invalid'),'[1-3/'+role+'] idx 負数 → blocked/R-invalid');
});
// pairings[cls] そのものが無い / 対象要素が null（穴）でも throw せず R1 に倒れる
env._setState({ classes:[{id:'A'}], players:{A:[]}, pairings:{}, results:{A:[]} });
assert(is(classify('A',0,'y1','p1'),'blocked','R-invalid'),'[1-4] pairings[cls] 不在 → blocked/R-invalid（throw しない）');
env._setState({ classes:[{id:'A'}], players:{A:[]}, pairings:{A:[null,{p1:'y1',p2:'y2'}]}, results:{A:[]} });
assert(is(classify('A',0,'y1','p1'),'blocked','R-invalid'),'[1-5] pairings[idx] が null（穴）→ blocked/R-invalid');

console.log('=== [2] R2: 候補 = その役の現在値 → ok（変更なし）===');
ROLES.forEach(function(role){
  setBoard(role,{p1:'y1',p2:'y2'},[]);
  var r=classify('A',0,'x1',role);
  assert(is(r,'ok',null),'[2-1/'+role+'] その役の現在値 → ok / reasonId=null');
  assert(r.reasonLabel==='','[2-2/'+role+'] reasonLabel は空文字');
  // 現在値は「他ペアに属さないか」より先に判定される（＝過去に自分自身と対戦していても ok のまま）
  setBoard(role,{p1:'y1',p2:'y2'},history([['x1','x2']]));
  assert(is(classify('A',0,'x1',role),'ok',null),'[2-3/'+role+'] 対象ペアが再戦でも現在値の据え置きは ok（現在値判定が先）');
});

console.log('=== [3] R3: 候補 = 反対側の現在値 → blocked/R-self ===');
ROLES.forEach(function(role){
  setBoard(role,{p1:'y1',p2:'y2'},[]);
  var r=classify('A',0,'x2',role);
  assert(is(r,'blocked','R-self'),'[3-1/'+role+'] 反対側の現在値 → blocked/R-self');
  assert(r.reasonLabel==='同じ選手','[3-2/'+role+'] reasonLabel は 同じ選手');
});

console.log('=== [4] R4: 候補が他ペアに属さない（otherIdx===-1）→ ok（replace 経路）===');
ROLES.forEach(function(role){
  // z1 はどのペアにも入っていない（未組・待機の選手）
  setBoard(role,{p1:'y1',p2:'y2'},[]);
  assert(is(classify('A',0,'z1',role),'ok',null),'[4-1/'+role+'] 他ペアに属さない候補 → ok');
  // **再戦でも blocked にしない**（既存 confirm に委ねる設計・PR #108 §9.1）。ここが R6 と分かれる境目。
  setBoard(role,{p1:'y1',p2:'y2'},history([['x2','z1']]));
  assert(is(classify('A',0,'z1',role),'ok',null),'[4-2/'+role+'] replace 経路は残る人と再戦になっても ok（候補側では止めない）');
  setBoard(role,{p1:'y1',p2:'y2'},history([['x1','z1']]));
  assert(is(classify('A',0,'z1',role),'ok',null),'[4-3/'+role+'] replace 経路は外れる人と再戦履歴があっても ok');
  // 相手ペアが1つも無い（対象ペアだけ）ときも -1 に倒れる
  setBoard(role,null,[]);
  assert(is(classify('A',0,'z1',role),'ok',null),'[4-4/'+role+'] 相手ペアが存在しない盤面でも ok');
});

console.log('=== [5] R5: 相手ペアに winner が入っている → blocked/R-winner-locked ===');
ROLES.forEach(function(role){
  setBoard(role,{p1:'y1',p2:'y2',winner:'y1'},[]);
  var r=classify('A',0,'y1',role);
  assert(is(r,'blocked','R-winner-locked'),'[5-1/'+role+'] 候補が相手ペアの p1 側・結果入力済 → blocked/R-winner-locked');
  assert(r.reasonLabel==='結果入力済','[5-2/'+role+'] reasonLabel は 結果入力済');
  assert(is(classify('A',0,'y2',role),'blocked','R-winner-locked'),'[5-3/'+role+'] 候補が相手ペアの p2 側でも同じ（勝者本人でなくても）');
  // winner 判定は再戦判定より先（再戦が同時に成立していても R-winner-locked が返る）
  setBoard(role,{p1:'y1',p2:'y2',winner:'y1'},history([['x2','y1']]));
  assert(is(classify('A',0,'y1',role),'blocked','R-winner-locked'),'[5-4/'+role+'] 再戦も成立する盤面では winner 判定が優先');
});

console.log('=== [6a] R6 条件1: keepPlayer（残る人）× 候補 の再戦 → blocked/R-rematch-swap ===');
ROLES.forEach(function(role){
  // x2（残る人）と y1（候補）に対戦履歴。条件2（x1 × Y=y2）は成立させない。
  setBoard(role,{p1:'y1',p2:'y2'},history([['x2','y1']]));
  var r=classify('A',0,'y1',role);
  assert(is(r,'blocked','R-rematch-swap'),'[6a-1/'+role+'] 残る人と候補が再戦 → blocked/R-rematch-swap');
  assert(r.reasonLabel==='再戦になる','[6a-2/'+role+'] reasonLabel は 再戦になる');
  assert(env.pairHasRematch('A','x1','y2')===false,'[6a-3/'+role+'] このケースで条件2（外れる人×Y）は成立していない（条件1だけで blocked）');
  // 候補が相手ペアの p2 側にいる場合も同じ（keepPlayer 側の判定は Y の決め方に依存しない）
  setBoard(role,{p1:'y1',p2:'y2'},history([['x2','y2']]));
  assert(is(classify('A',0,'y2',role),'blocked','R-rematch-swap'),'[6a-4/'+role+'] 候補が相手ペアの p2 側でも条件1で blocked');
});

console.log('=== [6b] R6 条件2: droppedFromTarget（外れる人）× Y の再戦 → blocked/R-rematch-swap ===');
ROLES.forEach(function(role){
  // Y = 候補の相方。候補が相手ペアの p1 側 → Y は p2 側。
  setBoard(role,{p1:'y1',p2:'y2'},history([['x1','y2']]));
  assert(env.pairHasRematch('A','x2','y1')===false,'[6b-1/'+role+'] このケースで条件1（残る人×候補）は成立していない');
  assert(is(classify('A',0,'y1',role),'blocked','R-rematch-swap'),'[6b-2/'+role+'] 候補=相手ペア p1 側・Y=p2 側との再戦 → blocked（条件2だけで blocked）');
  // 候補が相手ペアの p2 側 → Y は p1 側。
  setBoard(role,{p1:'y1',p2:'y2'},history([['x1','y1']]));
  assert(env.pairHasRematch('A','x2','y2')===false,'[6b-3/'+role+'] このケースで条件1は成立していない');
  assert(is(classify('A',0,'y2',role),'blocked','R-rematch-swap'),'[6b-4/'+role+'] 候補=相手ペア p2 側・Y=p1 側との再戦 → blocked（条件2だけで blocked）');
});

console.log('=== [7] R7: swap で再戦なし → ok ===');
ROLES.forEach(function(role){
  setBoard(role,{p1:'y1',p2:'y2'},[]);
  assert(is(classify('A',0,'y1',role),'ok',null),'[7-1/'+role+'] 相手ペアの p1 側・履歴なし → ok');
  assert(is(classify('A',0,'y2',role),'ok',null),'[7-2/'+role+'] 相手ペアの p2 側・履歴なし → ok');
  // 無関係な組み合わせの履歴があっても ok のまま（2条件のどちらにも当たらない）
  setBoard(role,{p1:'y1',p2:'y2'},history([['y1','y2'],['x1','x2']]));
  assert(is(classify('A',0,'y1',role),'ok',null),'[7-3/'+role+'] 2条件のどちらにも当たらない履歴では ok');
  // 相手ペアに winner が無い（空文字）ときは R5 に落ちない
  setBoard(role,{p1:'y1',p2:'y2',winner:''},[]);
  assert(is(classify('A',0,'y1',role),'ok',null),'[7-4/'+role+'] winner が空文字なら結果未入力扱いで ok');
});

console.log('=== [8] 壊れた入力で throw しないこと（UI から呼ばれる＝throw は当日の画面停止）===');
function noThrow(fn,msg){
  try{ fn(); ok(msg); }
  catch(e){ ng(msg+' … throw した: '+((e&&e.message)||e)); }
}
// pairings[cls] に穴（null 要素）— findPairContainingPlayer の if(!pair)continue が想定している形
setBoard('p1',null,[],[null,{p1:'y1',p2:'y2'}]);
noThrow(function(){ classify('A',0,'y1','p1'); },'[8-1] pairings に null 要素があっても throw しない');
assert(is(classify('A',0,'y1','p1'),'ok',null),'[8-2] 穴を飛ばして相手ペアを見つけ、履歴なし → ok');
// results[cls] が空配列
setBoard('p1',{p1:'y1',p2:'y2'},[]);
noThrow(function(){ classify('A',0,'y1','p1'); },'[8-3] results[cls] が空配列でも throw しない');
// 回戦だけあって中身が空（[[]]）
setBoard('p1',{p1:'y1',p2:'y2'},[[]]);
noThrow(function(){ classify('A',0,'y1','p1'); },'[8-4] results[cls]=[[]]（空の回戦）でも throw しない');
// idx が範囲外・負数・非数値
setBoard('p1',{p1:'y1',p2:'y2'},[]);
noThrow(function(){ classify('A',999,'y1','p1'); },'[8-5] idx 範囲外でも throw しない');
noThrow(function(){ classify('A',-3,'y1','p1'); },'[8-6] idx 負数でも throw しない');
noThrow(function(){ classify('A',null,'y1','p1'); },'[8-7] idx が null でも throw しない');
// candidateId が null / undefined / 未知のID
noThrow(function(){ classify('A',0,null,'p1'); },'[8-8] candidateId が null でも throw しない');
noThrow(function(){ classify('A',0,undefined,'p1'); },'[8-9] candidateId が undefined でも throw しない');
noThrow(function(){ classify('A',0,'unknown-id','p1'); },'[8-10] 未知の candidateId でも throw しない');
// 未知の cls（pairings[cls] 不在）
noThrow(function(){ classify('ZZ',0,'y1','p1'); },'[8-11] 未知の cls でも throw しない（R1 に倒れる）');

console.log('=== [9] 現状の戻り値をそのまま固定（characterization・良し悪しは判定しない）===');
setBoard('p1',{p1:'y1',p2:'y2'},[]);
assert(is(classify('A',0,null,'p1'),'ok',null),'[9-1] candidateId=null は「選択可（ok）」に倒れる（R4 経路）');
assert(is(classify('A',0,'unknown-id','p1'),'ok',null),'[9-2] 未知の candidateId も「選択可（ok）」に倒れる（R4 経路）');
// role は 'p1' 以外がすべて p2 扱い（三項演算子 (role==='p1')?…:… の素の挙動）
setBoard('p2',{p1:'y1',p2:'y2'},[]);
var rP2=classify('A',0,'x2','p2'), rUnknownRole=classify('A',0,'x2','P1');
assert(is(rP2,'blocked','R-self')&&is(rUnknownRole,'blocked','R-self'),
  '[9-3] role が p1 以外（大文字 P1 等）は p2 と同じ扱いになる');
// 戻り値の形（3キー）が全経路で揃っていること
(function(){
  setBoard('p1',{p1:'y1',p2:'y2',winner:'y1'},[]);
  var samples=[classify('A',99,'y1','p1'),classify('A',0,'x1','p1'),classify('A',0,'x2','p1'),
               classify('A',0,'z1','p1'),classify('A',0,'y1','p1')];
  var shapeOk=samples.every(function(r){
    return r&&typeof r.status==='string'&&('reasonId' in r)&&typeof r.reasonLabel==='string';
  });
  assert(shapeOk,'[9-4] どの return も {status,reasonId,reasonLabel} の3キーを返す');
})();

// ---- 参考観測（アサートしない）----------------------------------------------
// state.results[cls] が「空配列」ではなく **不在** のとき、R6 経路で pairHasRematch が
// state.results[cls].length を読んで throw する。ブリーフが列挙した壊れた入力（空配列）には
// 含まれないため期待値としては固定しない（throw を仕様として固定しない、という指示に従う）。
// 観測結果は RESULT に報告し、Issue 化は cowork が判断する。
(function(){
  env._setState({ classes:[{id:'A'}], players:{A:[]},
    pairings:{ A:[{p1:'x1',p2:'x2'},{p1:'y1',p2:'y2'}] }, results:{} });
  var observed='throw しない';
  try{ classify('A',0,'y1','p1'); }catch(e){ observed='throw する: '+((e&&e.message)||e); }
  console.log('  （参考観測・非アサート）results[cls] 不在のとき R6 経路は '+observed);
})();

console.log('  classifyChangePairingCandidate characterization テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
