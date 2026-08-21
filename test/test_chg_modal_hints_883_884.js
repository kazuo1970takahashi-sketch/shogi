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
const P883_CALL  = `  var emptyByWithdrawn=(!hasAlternative)&&_tableHasWithdrawn&&chgEmptyNoticeIsWithdrawnOnly([sel1,sel2]);`;
const P884_LABEL = `        var okLabel=clf.warnLabel?(baseLabel+'（'+clf.warnLabel+'）'):baseLabel;`;
const P884_ATTR  = `        var warnAttr=clf.warnId?(' data-warn-id="'+escapeHtml(clf.warnId)+'"'):'';`;

function buildSource(variant){
  switch(variant){
    case 'CURRENT': return SRC;
    // 「前」= #884 の印と #883 の言い分けを両方外した版
    case 'BASE':
      return patch(patch(SRC, P884_WARN, '', 'base-884'),
                   P883_CALL, '  var emptyByWithdrawn=false;', 'base-883');
    case 'V-A': return patch(SRC, P884_WARN, '', 'V-A');                      // 印を出さない（classify 側）
    case 'V-B': return patch(SRC, `    if(pairHasRematch(cls,keepForReplace,candidateId)){`,
                                  `    if(true){`, 'V-B');                     // 常に印を出す
    case 'V-C': return patch(SRC, P883_RSELF, '', 'V-C');                      // R-self を除かない
    case 'V-D': return patch(SRC, P883_CALL,
                             '  var emptyByWithdrawn=!hasAlternative;', 'V-D'); // 常に棄権扱い
    // ★ 以下はレンズB（2026-08-21）の指摘で足した。足す前は「印を1文字も出さない版」が 22/22 緑だった。
    case 'V-E': return patch(SRC, `      return {status:'ok',reasonId:null,reasonLabel:'',warnId:'W-rematch-replace'`,
                                  `      return {status:'blocked',reasonId:'R-rematch-replace',reasonLabel:'',warnId:'W-rematch-replace'`, 'V-E'); // 印ではなく塞いでしまう
    case 'V-F': return patch(SRC, P884_LABEL, `        var okLabel=baseLabel;`, 'V-F');            // 描画側で印を落とす
    case 'V-G': return patch(SRC, P884_ATTR,  `        var warnAttr='';`, 'V-G');                  // data-warn-id を出さない
    case 'V-H': return patch(SRC, `warnLabel:'対戦済み'`, `warnLabel:'再戦になる'`, 'V-H');         // blocked と同じ語にしてしまう
    case 'V-I': return patch(SRC, `&&_tableHasWithdrawn&&`, `&&`, 'V-I');                          // 卓に棄権者が居るかを見ない
    case 'V-J': return patch(SRC, `'R-withdrawn':1,`, ``, 'V-J');                                  // ホワイトリストから R-withdrawn を落とす
    case 'V-K': return patch(SRC, `'R-withdrawn-stays':1,`, ``, 'V-K');
    case 'V-L': return patch(SRC, `'R-withdrawn-swap':1`, `'_x':1`, 'V-L');
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
  // ★ data-chg-empty-cause は**任意**として読む。必須にすると、この便より前のツリーに
  //   当てたとき「汎用文が正しく出ている」対照まで赤になり、前後比較が使えなくなる
  //   （レンズB 2026-08-21 の指摘）。属性が無い＝差し替え前＝generic とみなす。
  var m = html.match(/<div data-chg-empty-notice="1"([^>]*)>([\s\S]*?)<\/div>/);
  if(!m) return { なし:true, html:html };
  var c = m[1].match(/data-chg-empty-cause="([a-z]+)"/);
  return { cause:c?c[1]:'generic', 文言:m[2].replace(/<br>/g,' ') };
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
// E. #884 の印を「描画された HTML」で測る
//    ★ レンズB (2026-08-21) の指摘で足した群。ここが無かったとき、
//      **UI に「（対戦済み）」が1文字も出ない版が 22/22 緑を通過した**（A 群は classify の
//      戻り値しか読んでいなかった＝受け入れ基準の「印が付く」を誰も測っていなかった）。
// =============================================================================
console.log('=== [E] #884 印が option の HTML に実際に出ている ===');

// 3名・卓「p1×p2」・p3 は待機。p2×p3 だけ対戦済み。
//   先手 select（残る人 = p2）→ p3 は再戦     ＝印が付くはず
//   後手 select（残る人 = p1）→ p3 は再戦でない＝印が付かないはず  ← 同じ盤面の中に対照がある
const ST_R = board(mkPlayers(3), [{p1:'p1',p2:'p2',winner:null}], [[{p1:'p2',p2:'p3',winner:'p2'}]]);
function selectsOf(env, st, idx){
  env._setState(st);
  var html = env.buildChangePairingModalHtml('A', idx, st.players.A, st.pairings.A[idx]);
  var m1 = html.match(/<select id="chg-p1"[^>]*>([\s\S]*?)<\/select>/);
  var m2 = html.match(/<select id="chg-p2"[^>]*>([\s\S]*?)<\/select>/);
  return { p1:(m1&&m1[1])||'', p2:(m2&&m2[1])||'', html:html };
}
function optionOf(inner, pid){
  var re = new RegExp('<option value="'+pid+'"[^>]*>[^<]*<\\/option>');
  var m = inner.match(re);
  return m?m[0]:null;
}
const selR = selectsOf(envCur, ST_R, 0);
const optWarn = optionOf(selR.p1,'p3');
const optPlain= optionOf(selR.p2,'p3');
assert(!!optWarn && !!optPlain, '[E0] 両方の select に候補 p3 の option がある（前提）  ['+String(optWarn)+']');
assert(/（対戦済み）<\/option>/.test(optWarn||''),
  '[E1] ★ 再戦になる replace 候補のラベル末尾に「（対戦済み）」が出ている  ['+String(optWarn).slice(0,60)+']');
assert(/data-warn-id="W-rematch-replace"/.test(optWarn||''),
  '[E2] ★ その option に data-warn-id="W-rematch-replace" が出ている');
assert(!/ disabled/.test(optWarn||''), '[E3] ★ 印は付くが disabled ではない（選べる状態を変えていない）');
assert(selR.p1.indexOf('<optgroup label="選択可能">')>=0 && optWarn.indexOf('（対戦済み）')>0,
  '[E4] 印付き候補は従来どおり「選択可能」optgroup に居る（3つ目の群を作っていない）');
assert(!/（/.test(optPlain||'') && !/data-warn-id/.test(optPlain||''),
  '[E5] ★ 対照: 同じ盤面でも再戦にならない側（後手）の p3 は無印  ['+String(optPlain).slice(0,60)+']');
// blocked 側の語と取り違えていないこと（#884 論点1 の作者裁定＝別の語にする）
assert(!/（再戦になる）/.test(optWarn||''),
  '[E6] ★ 印の語が blocked 側の「（再戦になる）」と同じになっていない');
// 参加者名は従来どおりエスケープされる（印を連結しても弱まらない）
const ST_X = board([{id:'p1',name:'<img src=x onerror=alert(1)>',entry_no:1},{id:'p2',name:'選手2',entry_no:2},{id:'p3',name:'選手3',entry_no:3}],
                   [{p1:'p1',p2:'p2',winner:null}], [[{p1:'p2',p2:'p3',winner:'p2'}]]);
assert(selectsOf(envCur, ST_X, 0).html.indexOf('<img src=x')<0,
  '[E7] 参加者名は印を足しても生タグのまま出ない（escapeHtml を通っている）');

// =============================================================================
// F. #883 の対照ふたつ（レンズA 2026-08-21 の指摘）
// =============================================================================
console.log('=== [F] #883 「棄権者は居るがこの卓には居ない」を棄権と呼ばない ===');

// ★ レンズAが実測した反例。3名・卓「p1×p3」・p2 が棄権して**待機**。
//   先手の内訳は R-self(p3) と R-withdrawn(p2) だけ＝「理由はすべて棄権系」に見えるが、
//   **この卓に棄権者は1人も座っていない**。ここで棄権を名指しすると文の3節すべてが偽になり、
//   しかも再生成しても待機の棄権者は元から卓に入らない＝幹事を破壊操作へ誤誘導する。
const ST_ELSEWHERE = board(mkPlayers(3,['p2']), [{p1:'p1',p2:'p3',winner:null}]);
const nElse = notice(envCur, ST_ELSEWHERE, 0);
assert(!nElse.なし, '[F1-0] この盤面でも候補ゼロ案内自体は出る（前提）');
assert(nElse.cause==='generic' && !/棄権/.test(nElse.文言||''),
  '[F1] ★ 卓に棄権者が座っていなければ棄権を名指ししない  ['+nElse.cause+']');

// ホワイトリスト3件がそれぞれ実際に発火すること（＝外すと赤にできる盤面が在ること）
//   R-withdrawn-stays : 満席＋棄権（C1 の盤面）
//   R-withdrawn-swap  : 同上（棄権者本人の役）
//   R-withdrawn       : 卓に棄権者が座り、待機にも別の棄権者が居る
//   ※ 待機の非棄権者が1人でも居ると、それが棄権者の役の replace 候補になって hasAlternative が
//     真になり案内自体が出ない。R-withdrawn を混ぜるには「待機は棄権者だけ」の盤面が要る。
const ST_TWO_W = board(mkPlayers(5,['p2','p5']),
                       [{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null}]);
const nTwoW = notice(envCur, ST_TWO_W, 0);
assert(nTwoW.cause==='withdrawn',
  '[F2] 卓に棄権者・待機にも棄権者（R-withdrawn が混じる形）でも棄権と判定する  ['+nTwoW.cause+']');
assert(!/全員が卓に入っている/.test(nTwoW.文言||''),
  '[F3] ★ その盤面で「全員が卓に入っている」とは書かない（待機に棄権者が居るので偽になる）');

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

// V-E: 印ではなく塞いでしまう → B1（前後で status/reasonId が同一）が赤になるはず
//   ★ B1 が「緑か例外かの二択」で赤になり得ない検査でないことを、ここで実際に確かめる。
const vE = sweep(loadEnv('V-E'));
var diffE=0;
for(var e=0;e<vE.cells.length;e++)if(vE.cells[e]!==base.cells[e])diffE++;
assert(diffE>0, '[D-E] ★ replace を blocked に変えると B1 が赤になる（差 '+diffE+' セル）＝B1 は恒真ではない');

// V-F / V-G / V-H: 描画側の変異（E 群が無かったときは3つとも全緑だった）
const eF = selectsOf(loadEnv('V-F'), ST_R, 0);
assert(!/（対戦済み）/.test(optionOf(eF.p1,'p3')||''), '[D-F] ★ 描画側で印を落とすと E1 が赤になる');
const eG = selectsOf(loadEnv('V-G'), ST_R, 0);
assert(!/data-warn-id/.test(optionOf(eG.p1,'p3')||''), '[D-G] ★ data-warn-id を出さないと E2 が赤になる');
const eH = selectsOf(loadEnv('V-H'), ST_R, 0);
assert(/（再戦になる）/.test(optionOf(eH.p1,'p3')||''), '[D-H] ★ blocked と同じ語にすると E6 が赤になる');

// V-I: 卓に棄権者が居るかを見ない → F1（レンズAの反例）が赤になるはず
assert(notice(loadEnv('V-I'), ST_ELSEWHERE, 0).cause==='withdrawn',
  '[D-I] ★ 卓の棄権者を見ないと F1 が赤になる（＝この防護は空振りしていない）');

// V-J / V-K / V-L: ホワイトリストの3件は、どれを外しても赤にできる（白紙票が無い）
assert(notice(loadEnv('V-J'), ST_TWO_W, 0).cause==='generic',  '[D-J] ★ R-withdrawn を外すと F2 が赤になる');
assert(notice(loadEnv('V-K'), ST_W, 0).cause==='generic',      '[D-K] ★ R-withdrawn-stays を外すと C1 が赤になる');
assert(notice(loadEnv('V-L'), ST_W, 0).cause==='generic',      '[D-L] ★ R-withdrawn-swap を外すと C1 が赤になる');

// =============================================================================
console.log('  結果: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
