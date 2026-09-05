#!/usr/bin/env node
// @suite: CHG-MODAL-REMATCH-SUBJECT-001 (#838) 「（再戦になる）」の主語を実ペアの氏名で名指す
//
//   出どころ: 2026-08-09 沼津月例会。卓「04×01」の後手 select で 07 が「（再戦になる）」と出たが、
//   04 と 07 は一度も対戦していない。真因は玉突きで動く 01×03 の再戦。R-rematch-swap の 34% がこの形。
//
//   保証すること（1文）: R-rematch-swap で塞がれた候補のラベルは、実際に再戦になるペアを**全部**・
//   **それだけ**氏名で名指す（双方向一致）。候補本人が無関係なら候補の名前は理由文に出ない。
//   保証しないこと: 判定条件そのもの（#108 のまま）／replace 経路（#884 の「対戦済み」印）／
//   select の幅・折り返し（実機）。
//
//   受け入れ基準（Issue #838 コメント・設計 v2）:
//     A 双方向一致（全 draw・全セル）        B 旧定数「再戦になる」の残置ゼロ
//     C 「候補が無関係」と「2組同時」が各1件以上出た draw だけ有効（0件 draw は失敗）
//     D Issue の局面を架空名で再現（07 の理由文に 01×03 が出て 07 の名は出ない）
//     E モーダル HTML（disabled option の文字列）で読む
//     V 変異3種で赤: V-1 短絡（先頭1組だけ）／V-2 候補本人を主語に／V-3 定数「再戦になる」に戻す
//
//   入力は完全架空（p1..p10 / 「選手ア」〜「選手コ」）。読み取り専用。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = []; const re = /<script[^>]*>([\s\S]*?)<\/script>/g; let m;
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

// 変異の当て先は「置換元が1回だけ現れる」ことを毎回検査する（空振りで緑を防ぐ・#889 の型）
function patch(src, from, to, tag){
  const n = src.split(from).length-1;
  if(n!==1) throw new Error('[patch:'+tag+'] 置換元の出現回数が '+n+' 件（1件であること）: '+from.slice(0,60));
  return src.split(from).join(to);
}
const P_SECOND = `  if(Y&&pairHasRematch(cls,droppedFromTarget,Y))rematchPairs.push([droppedFromTarget,Y]);`;
const P_SUBJECT = `      parts.push(na+'×'+nb+'が再戦');`;
const P_LABEL = `reasonLabel:buildRematchReasonLabel(cls,candidateId,rematchPairs),rematchPairs:rematchPairs`;
function buildSource(variant){
  switch(variant){
    case 'CURRENT': return SRC;
    case 'V-1': return patch(SRC, P_SECOND, `  if(!rematchPairs.length&&Y&&pairHasRematch(cls,droppedFromTarget,Y))rematchPairs.push([droppedFromTarget,Y]);`, 'V-1'); // 短絡＝先頭1組だけ
    case 'V-2': return patch(SRC, P_SUBJECT, `      parts.push(getName(candidateId,cls)+'と再戦');`, 'V-2');                 // 候補本人を主語に
    case 'V-3': return patch(SRC, P_LABEL, `reasonLabel:'再戦になる',rematchPairs:rematchPairs`, 'V-3');                     // 定数に戻す
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
              buildRematchReasonLabel:buildRematchReasonLabel,
              _setState:function(s){ state=s; } };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

// ---- 再現可能な draw（Math.random は使わない）--------------------------------
function lcg(seed){ var s=seed>>>0; return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function shuffle(arr, rnd){ var a=arr.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(rnd()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
const IDS = ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'];
const NAMES = {};
// 氏名は互いに部分文字列にならない形（「選手1」は「選手10」に含まれ indexOf が誤判定する）
IDS.forEach(function(id,i){ NAMES[id]='選手'+'アイウエオカキクケコ'.charAt(i); });
function makeDraw(seed, rounds){
  var rnd = lcg(seed);
  var results = [];
  for(var r=0;r<rounds;r++){
    var order = shuffle(IDS, rnd); var round=[];
    for(var i=0;i+1<order.length;i+=2)round.push({p1:order[i],p2:order[i+1],winner:order[i]});
    results.push(round);
  }
  var order2 = shuffle(IDS, rnd); var pairings=[];
  for(var k=0;k+1<order2.length;k+=2)pairings.push({p1:order2[k],p2:order2[k+1],winner:null});
  return { classes:[{id:'A',name:'A級',started:true}],
           players:{A:IDS.map(function(id,i){ return {id:id,name:NAMES[id],entry_no:i+1}; })},
           pairings:{A:pairings}, results:{A:results} };
}
// 独立判定（実装の関数は使わない）
function playedBefore(st,a,b){
  var rs=st.results.A;
  for(var r=0;r<rs.length;r++)for(var m=0;m<rs[r].length;m++){ var x=rs[r][m]; if((x.p1===a&&x.p2===b)||(x.p1===b&&x.p2===a))return true; }
  return false;
}
function otherPairOf(st,idx,cid){
  var ps=st.pairings.A;
  for(var i=0;i<ps.length;i++){ if(i===idx)continue; if(ps[i].p1===cid||ps[i].p2===cid)return ps[i]; }
  return null;
}
function keyOf(a,b){ return a<b?(a+'|'+b):(b+'|'+a); }

// 1 変種ぶんの総当たり。期待ペア集合は独立判定で組む（swap 経路だけ・winner 無し・棄権なし）。
function sweep(env, draws){
  var acc={ blocked:0, bothMatch:0, leak:0, missing:0, oldConst:0, unrelated:0, unrelatedNamesCandidate:0,
            two:0, twoJoined:0, selfForm:0, selfFormOk:0, noPairsKey:0 };
  for(var d=0; d<draws; d++){
    var st=makeDraw(2000+d, 2+(d%5));
    env._setState(st);
    for(var idx=0; idx<st.pairings.A.length; idx++){
      var match=st.pairings.A[idx];
      ['p1','p2'].forEach(function(role){
        var current=(role==='p1')?match.p1:match.p2;
        var keep=(role==='p1')?match.p2:match.p1;
        for(var i=0;i<IDS.length;i++){
          var cid=IDS[i];
          if(cid===current||cid===keep)continue;
          var op=otherPairOf(st,idx,cid);
          if(!op)continue;                                   // replace 経路は対象外（#884）
          var Y=(op.p1===cid)?op.p2:op.p1;
          var expect={};
          if(playedBefore(st,keep,cid))expect[keyOf(keep,cid)]=1;
          if(playedBefore(st,current,Y))expect[keyOf(current,Y)]=1;
          var clf=env.classifyChangePairingCandidate('A',idx,cid,role);
          var nExp=Object.keys(expect).length;
          if(nExp===0){ if(clf.reasonId==='R-rematch-swap')acc.leak++; continue; }
          if(clf.status!=='blocked'||clf.reasonId!=='R-rematch-swap'){ acc.missing++; continue; }
          acc.blocked++;
          if(clf.reasonLabel==='再戦になる')acc.oldConst++;
          if(!Array.isArray(clf.rematchPairs)){ acc.noPairsKey++; continue; }
          // A 双方向一致: 返ったペア集合 == 期待集合
          var got={}; clf.rematchPairs.forEach(function(p){ got[keyOf(p[0],p[1])]=1; });
          var same=Object.keys(got).length===nExp && Object.keys(expect).every(function(k){ return got[k]; });
          if(same)acc.bothMatch++;
          // 形: 候補本人が無関係（keep×cid が再戦でない）なら候補名は出ない
          var candInvolved=!!expect[keyOf(keep,cid)];
          if(!candInvolved){ acc.unrelated++; if(clf.reasonLabel.indexOf(NAMES[cid])>=0)acc.unrelatedNamesCandidate++; }
          else { acc.selfForm++; if(clf.reasonLabel.indexOf(NAMES[keep]+'と再戦')>=0)acc.selfFormOk++; }
          if(nExp===2){ acc.two++; if(clf.reasonLabel.indexOf('・')>0 && clf.reasonLabel.indexOf(NAMES[current])>=0 && clf.reasonLabel.indexOf(NAMES[Y])>=0)acc.twoJoined++; }
        }
      });
    }
  }
  return acc;
}

// =============================================================================
console.log('=== [A] 双方向一致（10名×24draw・swap 経路の総当たり・独立判定）===');
const envCur=loadEnv('CURRENT');
const cur=sweep(envCur, 24);
assert(cur.blocked>0, '[A0] R-rematch-swap の blocked が 0 件ではない（'+cur.blocked+' 件）');
assert(cur.unrelated>0, '[C1] ★ 「候補が無関係」のセルが 1 件以上（'+cur.unrelated+' 件）＝空振りで緑にならない');
assert(cur.two>0, '[C2] ★ 「2組同時」のセルが 1 件以上（'+cur.two+' 件）');
assert(cur.missing===0 && cur.leak===0, '[A1] 判定条件は不変（期待と食い違うセル 0：missing='+cur.missing+' leak='+cur.leak+'）');
assert(cur.noPairsKey===0, '[A2] blocked/R-rematch-swap は必ず rematchPairs を持つ（欠落 '+cur.noPairsKey+'）');
assert(cur.bothMatch===cur.blocked, '[A3] ★ 名指ししたペア集合が期待集合と**双方向で**一致（'+cur.bothMatch+'/'+cur.blocked+'）');
assert(cur.oldConst===0, '[B1] ★ 旧定数「再戦になる」の残置ゼロ（'+cur.oldConst+' 件）');
assert(cur.unrelatedNamesCandidate===0, '[A4] ★ 候補本人が無関係なとき候補の氏名は理由文に出ない（違反 '+cur.unrelatedNamesCandidate+'/'+cur.unrelated+'）');
assert(cur.selfFormOk===cur.selfForm, '[A5] 候補本人が当事者なら「<残る人>と再戦」の形（'+cur.selfFormOk+'/'+cur.selfForm+'）');
assert(cur.twoJoined===cur.two, '[A6] 2組同時は「・」で連結して両方の氏名が出る（'+cur.twoJoined+'/'+cur.two+'）');

// =============================================================================
console.log('=== [D] Issue #838 の局面を架空名で再現（卓 04×01・後手候補 07・真因は 01×03）===');
// 番号を Issue に合わせるため 8 名・entry_no 1..8。q4×q1 が現卓、q7 は別卓（q7×q3）。
// 履歴: q1×q3 は対戦済み（2回戦）。q4×q7 は未対戦。→ q7 を後手に入れる swap は q1×q3 を作る。
const Q=['q1','q2','q3','q4','q5','q6','q7','q8'];
const QN={q1:'大場 善一',q2:'岡本 和夫',q3:'清川 昇太',q4:'工内 聡',q5:'佐倉 太一',q6:'佐久 太郎',q7:'品野 悦男',q8:'山口 花'};
const ST_D={ classes:[{id:'A',name:'A級',started:true}],
  players:{A:Q.map(function(id,i){ return {id:id,name:QN[id],entry_no:i+1}; })},
  results:{A:[
    [{p1:'q1',p2:'q2',winner:'q1'},{p1:'q3',p2:'q4',winner:'q3'},{p1:'q5',p2:'q6',winner:'q5'},{p1:'q7',p2:'q8',winner:'q7'}],
    [{p1:'q1',p2:'q3',winner:'q1'},{p1:'q5',p2:'q7',winner:'q5'},{p1:'q2',p2:'q4',winner:'q2'},{p1:'q6',p2:'q8',winner:'q6'}]
  ]},
  // 3回戦（現卓）: 第1卓 = 「04×01」／q7 は第4卓（q7×q3）。q4×q7 は未対戦・q1×q3 は2回戦で対戦済み。
  pairings:{A:[{p1:'q4',p2:'q1',winner:null},{p1:'q2',p2:'q6',winner:null},{p1:'q5',p2:'q8',winner:null},{p1:'q7',p2:'q3',winner:null}]} };
envCur._setState(ST_D);
const clfD=envCur.classifyChangePairingCandidate('A',0,'q7','p2');   // 卓0「q4×q1」の後手を q7 に
assert(clfD.status==='blocked'&&clfD.reasonId==='R-rematch-swap', '[D0] 前提: q7 は R-rematch-swap で塞がれる');
assert(clfD.reasonLabel.indexOf(QN.q1)>=0 && clfD.reasonLabel.indexOf(QN.q3)>=0, '[D1] ★ 理由文が 01 と 03 を名指す  ['+clfD.reasonLabel+']');
assert(clfD.reasonLabel.indexOf(QN.q7)<0 && clfD.reasonLabel.indexOf(QN.q4)<0, '[D2] ★ 07（候補）と 04（残る人）の氏名は理由文に出ない');
assert(/が再戦$/.test(clfD.reasonLabel), '[D3] 候補が無関係の形「<a>×<b>が再戦」');

// [E] モーダル HTML（幹事が唯一読む場所）で読む
function selectsOf(env, st, idx){
  env._setState(st);
  var html=env.buildChangePairingModalHtml('A', idx, st.players.A, st.pairings.A[idx]);
  var m2=html.match(/<select id="chg-p2"[^>]*>([\s\S]*?)<\/select>/);
  return (m2&&m2[1])||'';
}
function optionOf(inner,pid){ var m=inner.match(new RegExp('<option value="'+pid+'"[^>]*>[^<]*<\\/option>')); return m?m[0]:null; }
const optD=optionOf(selectsOf(envCur,ST_D,0),'q7');
assert(!!optD && / disabled/.test(optD), '[E0] 後手 select の q7 option は disabled  ['+String(optD).slice(0,90)+']');
assert(!!optD && optD.indexOf('（'+QN.q1+'×'+QN.q3+'が再戦）')>0, '[E1] ★ option 文字列が「（大場 善一×清川 昇太が再戦）」で終わる（カッコは1重）');
assert(!!optD && optD.indexOf('（（')<0 && optD.indexOf('））')<0, '[E2] 二重カッコになっていない');
assert(!!optD && optD.indexOf('（再戦になる）')<0, '[E3] ★ 旧文字列「（再戦になる）」が出ていない');
// [E4] 氏名は callsite で一括エスケープされる（ラベル関数は生文字列を返す＝二重エスケープしない）。
//   run_tests.sh の未エスケープ検査は行単位の grep なので、ここで「実際に < が &lt; になる」ことを測る。
const ST_X=JSON.parse(JSON.stringify(ST_D)); ST_X.players.A[0].name='大場<b>善一'; ST_X.players.A[2].name='清川&昇太';
const optX=optionOf(selectsOf(envCur,ST_X,0),'q7');
assert(!!optX && optX.indexOf('大場&lt;b&gt;善一')>0 && optX.indexOf('清川&amp;昇太')>0 && optX.indexOf('<b>')<0,
  '[E4] ★ 理由文の氏名は option で HTML エスケープされている  ['+String(optX).slice(0,120)+']');

// =============================================================================
console.log('=== [V] 変異で赤（この検査が理由で赤になることの証明）===');
function sweepOk(env){ var a=sweep(env,24); return a.bothMatch===a.blocked && a.unrelatedNamesCandidate===0 && a.oldConst===0 && a.twoJoined===a.two; }
assert(sweepOk(envCur), '[V0] 現行は総当たりで緑（前提）');
assert(!sweepOk(loadEnv('V-1')), '[V-1] ★ 短絡（先頭1組だけ）に戻すと双方向一致が赤');
assert(!sweepOk(loadEnv('V-2')), '[V-2] ★ 候補本人を主語にすると「無関係なら候補名を出さない」が赤');
assert(!sweepOk(loadEnv('V-3')), '[V-3] ★ 定数「再戦になる」に戻すと残置ゼロが赤');

console.log('CHG-MODAL-REMATCH-SUBJECT-001: PASS='+pass+', FAIL='+fail);
process.exit(fail?1:0);
