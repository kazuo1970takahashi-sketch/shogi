#!/usr/bin/env node
// @suite: SCOREBOARD-INPROGRESS-MARKS-001（#832）進行中回戦の○×を閲覧側に出す
// SCOREBOARD-INPROGRESS-MARKS-001（Issue #832）
//   勝敗を登録した時点で、閲覧側（ライブ配信・会場スマホ）の星取表に○×を出す。
//   送信は元から勝敗登録の約2秒後に行われていて winner も届いている＝**表示だけの変更**。
//
//   ★ 完了条件（issue #832「実装時の完了条件」1〜5）をそのまま受入に使う。
//     とくに条件1は「マークが出る」ではなく **どの行に○が付くか** まで固定する
//     （マーク有無だけの検証は勝敗逆転実装を緑で通す＝パネルAが実演済み）。
//
//   ★ 設計判断（論点1）: 第4引数 showInProgress の opt-in にした。
//     履歴詳細・クラウド過去大会は**保存済み snapshot の閲覧**なので進行中列を出さない
//     （終わった大会に「進行中」が恒久表示されるのは嘘になる）。
//     副産物として golden と my_view の sha256 pin は無改変で緑のまま（本テスト R-1/R-2 で固定）。
//
//   入力は完全架空。shogi_v4.html は読むだけ。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_scoreboard_inprogress_marks_832.js <html>'); process.exit(1); }
const ABS = path.resolve(targetPath);

let pass=0, fail=0;
function assert(cond, msg){ if(cond){ pass++; console.log('  ✓ '+msg); } else { fail++; console.log('  ✗ '+msg); } }

function makeNode(tag){
  return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
    style:{cssText:''}, _attrs:{}, childNodes:[], disabled:false,
    appendChild:function(c){ this.childNodes.push(c); return c; },
    removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
    setAttribute:function(k,v){ this._attrs[k]=String(v); },
    getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
}
function loadEnv(){
  const html = fs.readFileSync(ABS,'utf8');
  const scripts=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  var elements={};
  const doc={ getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:makeNode, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  const win={ innerWidth:1024, addEventListener:function(){}, open:function(){ return null; } };
  const ls={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  const fn = new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${scripts.join('\n')};
     return { buildScoreboardClassTableHtml:buildScoreboardClassTableHtml,
              buildScoreboardPlayerViewHtml:buildScoreboardPlayerViewHtml,
              sbFindCurrentMatch:sbFindCurrentMatch,
              state:state };`);
  return fn(doc, win, ls, {randomUUID(){return '0';}}, function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL(){return 'b';},revokeObjectURL(){}}, console, Promise, function(){return 0;});
}

const env = loadEnv();
const st = env.state;
const sha = s => crypto.createHash('sha256').update(s,'utf8').digest('hex');

// ---- 陽性対照の state（issue #832 完了条件1 の指定どおり）----
//   4名・rounds=4・1回戦確定済み（p1○ p2×／p3○ p4×）・2回戦は pairings に winner 片方だけ入った状態
function fixture(pairings){
  st.rounds=4;
  st.classes=[{id:'A',name:'Aクラス'}];
  st.players={A:[
    {id:'p1',name:'甲野一郎',yomi:'こうのいちろう',entry_no:1},
    {id:'p2',name:'乙野二郎',yomi:'おつのじろう',entry_no:2},
    {id:'p3',name:'丙野三郎',yomi:'へいのさぶろう',entry_no:3},
    {id:'p4',name:'丁野四郎',yomi:'ていのしろう',entry_no:4}]};
  st.results={A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]]};
  st.pairings={A:pairings};
}
// 行を「対局者 id → その行の HTML」に割る。
//   行の並びは順位順なので index では固定しない（＝完了条件1「どの行に○が付くか」を id で押さえる）。
function rowsById(html){
  const out={};
  const trs=html.split('<tr').slice(1);
  for(const tr of trs){
    const m=tr.match(/data-sbpid="([^"]+)"/);
    if(m)out[m[1]]=tr;
  }
  return out;
}
// 行の N 回戦セル（1-based）を取り出す。td は [0]=順位 [1]=氏名 [2..]=回戦。
function cellOf(rowHtml, roundNo){
  if(!rowHtml)return '';
  const tds=rowHtml.split('<td').slice(1);
  return tds[1+roundNo]||'';
}

console.log('\n[C1] 陽性対照を行単位で固定（完了条件1）');
(function(){
  fixture([{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:null}]);
  const html = env.buildScoreboardClassTableHtml('A',undefined,null,true);
  const R = rowsById(html);
  assert(Object.keys(R).length===4, 'C1-0 前提: 4行取れた（実測 '+Object.keys(R).length+'）');

  const c1=cellOf(R['p1'],2), c3=cellOf(R['p3'],2), c2=cellOf(R['p2'],2), c4=cellOf(R['p4'],2);
  assert(/sb-mark-win[^"]*sb-mark-live[^>]*>○</.test(c1), 'C1-1 甲野(p1)の2回戦＝進行中様式の○（勝者の行に○が付く）');
  assert(/sb-mark-lose[^"]*sb-mark-live[^>]*>×</.test(c3), 'C1-2 丙野(p3)の2回戦＝進行中様式の×（敗者の行に×が付く）');
  assert(/sb-mark-none[^"]*sb-mark-live[^>]*>…</.test(c2), 'C1-3 乙野(p2)の2回戦＝結果待ち「…」');
  assert(/sb-mark-none[^"]*sb-mark-live[^>]*>…</.test(c4), 'C1-4 丁野(p4)の2回戦＝結果待ち「…」');
  assert(!/○/.test(c3)&&!/×/.test(c1), 'C1-5 勝敗が逆になっていない（逆転実装を緑で通さない）');
  assert(/#03/.test(c1)&&/#01/.test(c3), 'C1-6 相手番号は #03 / #01（対戦相手の番号が正しい）');

  // 勝数列は確定分のみ（作者決定1）
  const wmap = {}; Object.keys(R).forEach(k=>{ wmap[k]=(R[k].match(/class="sb-wins">(\d+)</)||[])[1]; });
  assert(wmap['p1']==='1'&&wmap['p3']==='1'&&wmap['p2']==='0'&&wmap['p4']==='0',
    'C1-7 勝数列は 1,1,0,0＝確定分のみ（進行中の○は勝数に入らない）  [実測 '+JSON.stringify(wmap)+']');
  // 1回戦（確定済み）のセルは進行中様式にならない
  assert(!/sb-mark-live/.test(cellOf(R['p1'],1)), 'C1-8 確定済みの1回戦セルは進行中様式にならない');
  assert(!/sb-cell-live/.test(cellOf(R['p1'],1)), 'C1-9 確定済みセルに sb-cell-live は付かない');
  assert(/sb-cell-live/.test(c1), 'C1-10 進行中セルには sb-cell-live が付く');
  // 3・4回戦は従来どおり「－」
  assert(/sb-mark-none[^>]*>－</.test(cellOf(R['p1'],3)), 'C1-11 まだ組まれていない3回戦は従来どおり「－」');
})();

console.log('\n[C2] 視覚区別（完了条件2）');
(function(){
  fixture([{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:null}]);
  const html = env.buildScoreboardClassTableHtml('A',undefined,null,true);
  assert(/<th class="sb-th-live">2回戦<small>進行中<\/small><\/th>/.test(html), 'C2-1 2回戦の見出しに「進行中」が付く');
  assert(/<th>1回戦<\/th>/.test(html)&&/<th>3回戦<\/th>/.test(html), 'C2-2 他の回戦の見出しは従来どおり');
  assert(html.indexOf('まだ確定していない回戦（幹事が確定すると通常の表示になります）')>=0, 'C2-3 凡例に進行中の説明がある');
  assert(html.indexOf('勝・負・B・C・順位は回戦が確定してから動きます')>=0, 'C2-4 凡例に「確定してから動く」と明記');
  assert(html.indexOf('…=結果待ち')>=0, 'C2-5 凡例に「…=結果待ち」がある');
  assert(html.indexOf('途中経過')>=0, 'C2-6 クラス見出しは従来どおり「途中経過」');
})();

console.log('\n[C3] 2周目＝トグル取り消しと勝者入れ替え（完了条件3）');
(function(){
  fixture([{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:null}]);
  const before = rowsById(env.buildScoreboardClassTableHtml('A',undefined,null,true));
  // トグル取り消し（winner を null に戻す）
  st.pairings.A[0].winner=null;
  const after = rowsById(env.buildScoreboardClassTableHtml('A',undefined,null,true));
  assert(/>○</.test(cellOf(before['p1'],2)) && /…/.test(cellOf(after['p1'],2)),
    'C3-1 トグル取り消しで○が「…」に戻る');
  assert(/…/.test(cellOf(after['p3'],2)), 'C3-2 相手側も「…」に戻る');
  // 勝者入れ替え
  st.pairings.A[0].winner='p3';
  const swapped = rowsById(env.buildScoreboardClassTableHtml('A',undefined,null,true));
  assert(/sb-mark-lose[^"]*sb-mark-live[^>]*>×</.test(cellOf(swapped['p1'],2)), 'C3-3 勝者入れ替えに追従（甲野が×）');
  assert(/sb-mark-win[^"]*sb-mark-live[^>]*>○</.test(cellOf(swapped['p3'],2)), 'C3-4 勝者入れ替えに追従（丙野が○）');
})();

console.log('\n[C4] 回帰＋新 fixture の pin（完了条件4）');
(function(){
  // 第4引数を渡さない＝従来出力と完全一致（golden / my_view の pin が無改変で緑である根拠）
  fixture([{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:null}]);
  const off = env.buildScoreboardClassTableHtml('A',undefined,null);
  const on  = env.buildScoreboardClassTableHtml('A',undefined,null,true);
  assert(off.indexOf('sb-mark-live')<0 && off.indexOf('sb-th-live')<0,
    'C4-1 第4引数なしでは進行中列を出さない（履歴詳細・クラウド過去大会＝論点1の裁定）');
  assert(off!==on, 'C4-2 第4引数 true のときだけ出力が変わる');
  assert(env.buildScoreboardClassTableHtml('A',undefined,null,false)===off, 'C4-3 false 明示も従来どおり');
  assert(env.buildScoreboardClassTableHtml('A',undefined,null,1)===off, 'C4-4 true 以外（truthy な 1）は従来どおり＝厳密比較');

  // ★ winner 入り pairings の fixture を新設して pin（完了条件4）。
  //   既存 golden の fixture には winner 入り pairings が1つも無く、進行中列の出力が
  //   どこにも固定されていなかった。ここが唯一の pin。
  //   意図して表示を変えたときは、差分が進行中列だけであることを確認してから更新すること。
  const INPROGRESS_GOLDEN_SHA256='eed5e48730f32e0c18bc740547b4dcec6a217acfb5f0a1450d07b5add833dc09';
  assert(sha(on)===INPROGRESS_GOLDEN_SHA256,
    'C4-5 陽性対照（4名・1回戦確定・2回戦 winner 片方）の出力を sha256 で固定（実測 '+sha(on)+'）');

  // 全回戦確定 state は列が出ない
  st.rounds=1;
  st.results={A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]]};
  st.pairings={A:[]};
  const doneHtml = env.buildScoreboardClassTableHtml('A',undefined,null,true);
  assert(doneHtml.indexOf('sb-mark-live')<0 && doneHtml.indexOf('sb-th-live')<0, 'C4-6 全回戦確定なら進行中列は出ない');
  assert(doneHtml.indexOf('最終結果')>=0, 'C4-7 見出しは「最終結果」');
  assert(doneHtml===env.buildScoreboardClassTableHtml('A',undefined,null), 'C4-8 確定後は第4引数の有無で出力が変わらない');
})();

console.log('\n[C5] パネル済み事実の維持（完了条件5）');
(function(){
  // 確定直後に同一回戦の二重表示が無い（results に移り pairings は次回戦に差し替わる）
  st.rounds=4;
  st.classes=[{id:'A',name:'Aクラス'}];
  st.players={A:[{id:'p1',name:'甲',entry_no:1},{id:'p2',name:'乙',entry_no:2},{id:'p3',name:'丙',entry_no:3},{id:'p4',name:'丁',entry_no:4}]};
  st.results={A:[
    [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}],
    [{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:'p2'}]]};
  st.pairings={A:[{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null}]};
  const h = env.buildScoreboardClassTableHtml('A',undefined,null,true);
  const liveTh=(h.match(/sb-th-live/g)||[]).length;
  assert(liveTh===1, 'C5-1 進行中の見出しは1列だけ＝同一回戦の二重表示なし（実測 '+liveTh+'）');
  assert(/<th class="sb-th-live">3回戦/.test(h), 'C5-2 進行中の列は3回戦（確定済み2回戦の次）');

  // pairings が空なら列は出ない
  st.pairings={A:[]};
  assert(env.buildScoreboardClassTableHtml('A',undefined,null,true).indexOf('sb-th-live')<0,
    'C5-3 pairings が空なら進行中列は出ない');

  // 進行中セルが出す情報は確定セルと同じ（相手の番号だけ・氏名を増やさない＝display_mode 非依存）
  st.pairings={A:[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:null}]};
  const h2 = env.buildScoreboardClassTableHtml('A',undefined,null,true);
  const R2 = rowsById(h2);
  const live = cellOf(R2['p1'],3);
  assert(/<span class="sb-opp">#02<\/span>/.test(live) && live.indexOf('乙')<0,
    'C5-4 進行中セルも相手は番号だけ＝新しい情報を公開しない  [実測 '+live.replace(/\s+/g,'')+']');
})();

console.log('\n[C6] 個人ビューとの整合（論点2）');
(function(){
  fixture([{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:null}]);
  const won = env.buildScoreboardPlayerViewHtml('A','p1');
  assert(won.indexOf('2回戦（進行中）')>=0, 'C6-1 勝敗が入っている人は「2回戦（進行中）」');
  assert(/sb-mark-win[^"]*sb-mark-live[^>]*>○</.test(won), 'C6-2 進行中様式の○が出る');
  assert(won.indexOf('次の対戦')<0, 'C6-3 「次の対戦」とは言わない（星取表と矛盾しない）');
  assert(won.indexOf('まだ確定していません')>=0, 'C6-4 確定前である旨の補足が出る');
  assert(won.indexOf('現在の成績 <b>1</b> 勝')>=0, 'C6-5 勝敗数は確定分のまま（作者決定1）');

  const waiting = env.buildScoreboardPlayerViewHtml('A','p2');
  assert(waiting.indexOf('次の対戦・2回戦')>=0, 'C6-6 まだ勝敗が入っていない人は従来どおり「次の対戦・2回戦」');
  assert(waiting.indexOf('まだ確定していません')<0, 'C6-7 その場合は補足を出さない');

  const cur = env.sbFindCurrentMatch('A','p1');
  assert(cur && cur.won===true && cur.oppId==='p3' && cur.table===1, 'C6-8 sbFindCurrentMatch が won を返す（既存の oppId / table は不変）');
  assert(env.sbFindCurrentMatch('A','p2').won===null, 'C6-9 winner 未入力は won=null');
})();

console.log('\n  SCOREBOARD-INPROGRESS-MARKS-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
