#!/usr/bin/env node
// @suite: [CHG-MODAL-HINTS-883-884] 対戦相手変更モーダル: replace 再戦の印(#884) と 候補ゼロ案内の言い分け(#883)
//
// このテストが守るもの（受け入れ基準は #884 §5 / #883 のコメント）:
//   #884-1 replace 経路で再戦になる候補の 100% に印が付く（現状 0%）
//   #884-2 対照: 再戦にならない replace 候補には印が付かない（一律に印を付けて緑にできない）
//   #884-3 選べる状態が変わらない: disabled になる候補集合が1件も変わらない
//   #884-4 swap 側の判定が1件も変わらない（status / reasonId が同一）
//   #884-6 0件の照合を失敗にする（対象が0件しか出なければテスト自体を失敗）
//   #883-1 候補ゼロの原因が棄権だけのとき、案内文が棄権を名指しする
//   #883-2 対照: 棄権が原因でないときは従来の汎用文のまま（棄権を名指ししない）
//   #883-3 待機者がいる場面では従来どおり差し替えできる（塞ぎを増やしていない）
//
// ★ 「前後比較」の作り方（この repo で繰り返し踏んだ「緑だが何も測っていない」への対策）:
//   ベース commit を git show で取りに行くと --filter=blob:none の clone で偽 FAIL になる（既知の罠3）。
//   代わりに **同じソースから逆パッチを当てた版をメモリ上で組み立てて** 「前」とする。
//   逆パッチの当たり先が1箇所でなければ即 FAIL＝実装が動いたら黙って素通りしない。
//
// ★ 変異はこのファイル内で当てる（別台帳を作らない＝中車線）。
//   V-A 印を出さない → #884-1 が赤／V-B 常に印を出す → #884-2 が赤
//   V-C R-self を除かない → #883-1 が赤（分岐が永久に false になる形を捕まえる）
//   V-D 常に棄権扱い → #883-2 が赤
//
// 入力は完全架空（p1..p9 / 「選手N」）。読み取り専用。

const fs = require('fs');

// ---- 読込（近傍 test_pairing_classify_001.js と同方式）------------------------
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
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2] || 'shogi_v4.html';
if(!fs.existsSync(targetPath)){ console.error('対象ファイルなし: '+targetPath); process.exit(1); }
const SRC = extractScripts(targetPath);

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }

// ---- 逆パッチ / 変異の当て先（1箇所ヒットを強制）-------------------------------
// 「置換元が1回だけ現れる」ことを毎回検査する。実装が動いて当たらなくなったら
// 変異が空振りしたまま緑になる（#889 で実際に踏んだ形）ので、ここで落とす。
function patch(src, from, to, tag){
  const n = src.split(from).length-1;
  if(n!==1) throw new Error('[patch:'+tag+'] 置換元の出現回数が '+n+' 件（1件であること）: '+from.slice(0,60));
  return src.split(from).join(to);
}

const P884_WARN = `    var keepForReplace=(role==='p1')?match.p2:match.p1;
    if(pairHasRematch(cls,keepForReplace,candidateId)){
      return {status:'ok',reasonId:null,reasonLabel:'',warnId:'W-rematch-replace',warnLabel:'対戦済み'};
    }
`;
const P883_RSELF = `        if(k==='R-self')continue;`;
const P883_CALL  = `  var emptyByWithdrawn=(!hasAlternative)&&chgEmptyNoticeIsWithdrawnOnly([sel1,sel2]);`;

function buildSource(variant){
  switch(variant){
    case 'CURRENT': return SRC;
    // 「前」= #884 の印と #883 の言い分けを両方外した版
    case 'BASE':
      return patch(patch(SRC, P884_WARN, '', 'base-884'),
                   P883_CALL, '  var emptyByWithdrawn=false;', 'base-883');
    case 'V-A': return patch(SRC, P884_WARN, '', 'V-A');                      // 印を出さない
    case 'V-B': return patch(SRC, `    if(pairHasRematch(cls,keepForReplace,candidateId)){`,
                                  `    if(true){`, 'V-B');                     // 常に印を出す
    case 'V-C': return patch(SRC, P883_RSELF, '', 'V-C');                      // R-self を除かない
    case 'V-D': return patch(SRC, P883_CALL,
                             '  var emptyByWithdrawn=!hasAlternative;', 'V-D'); // 常に棄権扱い
    default: throw new Error('unknown variant '+variant);
  }
}

function loadEnv(variant){
  const ctx = makeContext();
  const js = buildSource(variant);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { classifyChangePairingCandidate:classifyChangePairingCandidate,
              buildChangePairingModalHtml:buildChangePairingModalHtml,
              findPairContainingPlayer:findPairContainingPlayer,
              _setState:function(s){ state=s; } };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

// =============================================================================
// A. #884: 9名 × 30 draw の総当たり（独立判定 = state.results 直読み）
// =============================================================================
console.log('=== [A] #884 replace 経路の再戦に印が付く（9名30draw・独立判定）===');

// 再現可能な擬似乱数（Math.random は使わない＝失敗が再現できる形にする）
function lcg(seed){ var s=seed>>>0; return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function shuffle(arr, rnd){ var a=arr.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(rnd()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }

const IDS = ['p1','p2','p3','p4','p5','p6','p7','p8','p9'];
const PLAYERS = IDS.map(function(id,i){ return {id:id, name:'選手'+(i+1), entry_no:i+1}; });

// 1 draw = 「消化済み results（rounds 回戦）」＋「現在の pairings（4卓・1人待機）」
function makeDraw(seed, rounds){
  var rnd = lcg(seed);
  var results = [];
  for(var r=0;r<rounds;r++){
    var order = shuffle(IDS, rnd);
    var round = [];
    for(var i=0;i+1<order.length;i+=2)round.push({p1:order[i],p2:order[i+1],winner:order[i]});
    results.push(round);
  }
  var order2 = shuffle(IDS, rnd);
  var pairings = [];
  for(var k=0;k+1<order2.length;k+=2)pairings.push({p1:order2[k],p2:order2[k+1],winner:null});
  return { classes:[{id:'A',name:'A級',started:true}],
           players:{A:PLAYERS.map(function(p){ return {id:p.id,name:p.name,entry_no:p.entry_no}; })},
           pairings:{A:pairings}, results:{A:results} };
}

// 独立判定: state.results を直接読んで「この2人は対戦済みか」を数える（実装の関数は使わない）
function playedBefore(st, a, b){
  var rs = st.results.A;
  for(var r=0;r<rs.length;r++)for(var m=0;m<rs[r].length;m++){
    var x=rs[r][m];
    if((x.p1===a&&x.p2===b)||(x.p1===b&&x.p2===a))return true;
  }
  return false;
}
// 独立判定: 候補が他の卓に居るか（居なければ replace 経路）
function inOtherPair(st, idx, cid){
  var ps = st.pairings.A;
  for(var i=0;i<ps.length;i++){ if(i===idx)continue; if(ps[i].p1===cid||ps[i].p2===cid)return true; }
  return false;
}

// 1 変種ぶんの総当たりを回して集計を返す
function sweep(env){
  var acc = { replaceTotal:0, expectWarn:0, gotWarnOnExpected:0, warnOnNonRematch:0,
              swapTotal:0, warnOnSwap:0, cells:[] };
  for(var d=0; d<30; d++){
    var st = makeDraw(1000+d, 2 + (d % 5));   // 消化回戦を 2〜6 で振る（序盤〜ほぼ総当たり）
    env._setState(st);
    for(var idx=0; idx<st.pairings.A.length; idx++){
      var match = st.pairings.A[idx];
      ['p1','p2'].forEach(function(role){
        var current = (role==='p1')?match.p1:match.p2;
        var opposite= (role==='p1')?match.p2:match.p1;
        for(var i=0;i<IDS.length;i++){
          var cid = IDS[i];
          var clf = env.classifyChangePairingCandidate('A', idx, cid, role);
          // 前後比較のため全セルの status / reasonId を記録
          acc.cells.push(clf.status+'|'+String(clf.reasonId));
          if(cid===current||cid===opposite)continue;
          if(inOtherPair(st, idx, cid)){
            acc.swapTotal++;
            if(clf.warnId)acc.warnOnSwap++;
            continue;
          }
          acc.replaceTotal++;
          var expected = playedBefore(st, opposite, cid);   // keepPlayer = 反対側の現在値
          if(expected){ acc.expectWarn++; if(clf.warnId==='W-rematch-replace')acc.gotWarnOnExpected++; }
          else if(clf.warnId){ acc.warnOnNonRematch++; }
        }
      });
    }
  }
  return acc;
}

const envCur = loadEnv('CURRENT');
const cur = sweep(envCur);

// #884-6: 0件の照合を失敗にする
assert(cur.replaceTotal>0, '[A0-1] replace 候補が0件ではない（'+cur.replaceTotal+' 件）');
assert(cur.expectWarn>0,  '[A0-2] ★ 再戦になる replace 候補が0件ではない（'+cur.expectWarn+' 件）＝空振りで緑にならない');
// #884-1
assert(cur.gotWarnOnExpected===cur.expectWarn,
  '[A1] 再戦になる replace 候補の 100% に印が付く（'+cur.gotWarnOnExpected+'/'+cur.expectWarn+'）');
// #884-2
assert(cur.warnOnNonRematch===0,
  '[A2] 対照: 再戦にならない replace 候補には印が付かない（付いた件数 '+cur.warnOnNonRematch+'）');
// swap 側には印を出さない（swap は塞がれる側＝reasonLabel「再戦になる」の担当）
assert(cur.warnOnSwap===0, '[A3] swap 候補には warn を出していない（'+cur.swapTotal+' 件中 '+cur.warnOnSwap+' 件）');

// =============================================================================
// B. #884-3 / #884-4: 前後比較（逆パッチ版と status / reasonId が完全一致）
// =============================================================================
console.log('=== [B] #884 選べる状態も swap 判定も1件も変わらない（逆パッチ版との突合）===');
const base = sweep(loadEnv('BASE'));
assert(base.cells.length===cur.cells.length && base.cells.length>0,
  '[B0] 突合したセル数が一致し0件でない（'+cur.cells.length+' セル）');
var diffCells = 0;
for(var i=0;i<cur.cells.length;i++)if(cur.cells[i]!==base.cells[i])diffCells++;
assert(diffCells===0, '[B1] ★ 全セルで status / reasonId が「前」と同一（差 '+diffCells+' 件）＝disabled 集合も swap 判定も不変');
function sweepWarnCount(a){ return a.gotWarnOnExpected + a.warnOnNonRematch + a.warnOnSwap; }
assert(base.expectWarn>0 && sweepWarnCount(base)===0, '[B2] 「前」では印が0件（＝この便で 0% → 100% になったことの根拠）');

// =============================================================================
// C. #883: 候補ゼロ案内の言い分け
// =============================================================================
console.log('=== [C] #883 候補ゼロ案内が理由で言い分けられる ===');

function board(players, pairs, results){
  return { classes:[{id:'A',name:'A級',started:true}],
           players:{A:players}, pairings:{A:pairs}, results:{A:results||[]} };
}
function mkPlayers(n, withdrawnIds){
  var w = withdrawnIds||[];
  var out=[];
  for(var i=1;i<=n;i++){
    var p={id:'p'+i,name:'選手'+i,entry_no:i};
    if(w.indexOf(p.id)>=0)p.withdrawn=true;
    out.push(p);
  }
  return out;
}
function notice(env, st, idx){
  env._setState(st);
  var html = env.buildChangePairingModalHtml('A', idx, st.players.A, st.pairings.A[idx]);
  var m = html.match(/<div data-chg-empty-notice="1" data-chg-empty-cause="([a-z]+)"[^>]*>([\s\S]*?)<\/div>/);
  if(!m) return { なし:true, html:html };
  return { cause:m[1], 文言:m[2].replace(/<br>/g,' ') };
}

// C1: 満席（6名3卓）＋ p2 が棄権 → 塞ぐ理由はすべて棄権系 → 棄権を名指しする
const ST_W = board(mkPlayers(6,['p2']), [{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null},{p1:'p5',p2:'p6',winner:null}]);
const nW = notice(envCur, ST_W, 0);
assert(!nW.なし, '[C1-0] 満席＋棄権の卓で候補ゼロ案内が出ている（前提）');
assert(nW.cause==='withdrawn', '[C1-1] ★ 原因が withdrawn と判定される  ['+nW.cause+']');
assert(/棄権した参加者がいます/.test(nW.文言||'') && /組み合わせを再生成/.test(nW.文言||''),
  '[C1-2] ★ 棄権を名指しし、出口（組み合わせを再生成）を案内している  ['+String(nW.文言||'').slice(0,30)+']');

// C2 対照: 満席・棄権ゼロ・相手卓が結果入力済 → 塞ぐ理由は R-winner-locked → 汎用文のまま
const ST_G = board(mkPlayers(6), [{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:'p3'},{p1:'p5',p2:'p6',winner:'p5'}]);
const nG = notice(envCur, ST_G, 0);
assert(!nG.なし, '[C2-0] 棄権ゼロでも候補ゼロ案内は出る（＝「案内が出た＝棄権」ではない）');
assert(nG.cause==='generic', '[C2-1] ★ 対照: 原因は generic  ['+nG.cause+']');
assert(/1人だけ入れ替えできる候補がありません/.test(nG.文言||'') && !/棄権/.test(nG.文言||''),
  '[C2-2] ★ 対照: 従来の汎用文のままで棄権を名指ししない');

// C3 対照: 2名1卓・棄権なし（既存 e2e の E セクションと同じ盤面）→ 汎用文のまま
const ST_2 = board(mkPlayers(2), [{p1:'p1',p2:'p2',winner:null}]);
const n2 = notice(envCur, ST_2, 0);
assert(n2.cause==='generic' && !/棄権/.test(n2.文言||''),
  '[C3] 対照: 2名1卓（既存 e2e E と同じ盤面）は従来どおり汎用文  ['+n2.cause+']');

// C4: 待機者がいれば従来どおり差し替えできる（塞ぎを増やしていない）
const ST_OK = board(mkPlayers(7,['p2']), [{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null},{p1:'p5',p2:'p6',winner:null}]);
const nOK = notice(envCur, ST_OK, 0);
assert(nOK.なし===true, '[C4] ★ 待機者(p7)が居る場面では案内自体が出ない＝差し替えできる（塞ぎを増やしていない）');

// C5: #883 は「前」では出せなかったことの根拠
const nWbase = notice(loadEnv('BASE'), ST_W, 0);
assert(nWbase.cause==='generic', '[C5] 「前」では同じ盤面が汎用文だった（＝この便で言い分けが増えた根拠）');

// =============================================================================
// D. 変異: 「緑だが何も測っていない」を潰す
// =============================================================================
console.log('=== [D] 変異検査（当たらなければ patch() が例外で落ちる）===');

// V-A: 印を出さない → A1 が赤になるはず
const vA = sweep(loadEnv('V-A'));
assert(vA.expectWarn>0 && vA.gotWarnOnExpected===0, '[D-A] ★ 印を外すと A1 が赤になる（'+vA.gotWarnOnExpected+'/'+vA.expectWarn+'）');
// V-B: 常に印を出す → A2 が赤になるはず
const vB = sweep(loadEnv('V-B'));
assert(vB.warnOnNonRematch>0, '[D-B] ★ 常に印を付けると A2 が赤になる（非再戦に付いた件数 '+vB.warnOnNonRematch+'）');
assert(vB.gotWarnOnExpected===vB.expectWarn, '[D-B2] （参考）V-B は A1 だけなら緑＝A1 単独では一律付与を捕まえられない');
// V-C: R-self を除かない → C1 が赤になるはず（分岐が永久に false になる形）
const vC = notice(loadEnv('V-C'), ST_W, 0);
assert(vC.cause==='generic', '[D-C] ★ R-self を除外しないと C1 が赤になる（棄権盤面が generic に落ちる）  ['+vC.cause+']');
// V-D: 常に棄権扱い → C2 / C3 が赤になるはず
const envD = loadEnv('V-D');
assert(notice(envD, ST_G, 0).cause==='withdrawn' && notice(envD, ST_2, 0).cause==='withdrawn',
  '[D-D] ★ 常に棄権扱いにすると C2 / C3（対照）が赤になる');

// =============================================================================
console.log('  結果: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
