#!/usr/bin/env node
// @suite: CHG-MODAL-NAME-LABELS-001 (#971) 変更モーダルの見出しは「先手/後手」ではなく今の参加者名
//
//   出どころ: 2026-09-10 作者「先手、後手という表現は違うな。どっちが先手かどうかまで管理する必要はない」。
//   アプリは先手を管理していない（p1/p2 はカード上の並びの位置だけ）。見出しに役の名を出すと嘘になる。
//
//   保証すること（1文）: buildChangePairingModalHtml の 2 つの select の見出しは、今その席に居る参加者の
//   氏名（escape 済み）＋「→ 替える相手」であり、利用者に見える文字列に「先手」「後手」が無い。
//   保証しないこと: select の候補・並び・disabled 規則（#108/#838/#884）／保存処理／エラー文の
//   **出るタイミング**（それは chg_modal_inline_error_881.e2e.js が実ブラウザで固定する）。
//
//   受け入れ基準:
//     L1 見出し 2 つが今の氏名を持つ   L2 出力 HTML に「先手」「後手」が無い
//     L3 氏名の < は &lt; になる       L4 候補に居ない id は「現在の対局」と同じ fallback 文字列
//     L5 利用者に見えるエラー文 3 件が新文言で、旧文言（先手・後手）は残っていない
//     V  変異で赤: V-1 見出しを「先手」「後手」に戻す → L1/L2 が赤
//
//   入力は完全架空。読み取り専用。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = []; const re = /<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}
function makeContext(){
  function makeNode(tag){
    return { tagName:String(tag||'div').toUpperCase(), style:{}, children:[], attributes:{}, dataset:{},
      classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} },
      appendChild(c){ this.children.push(c); return c; }, removeChild(c){ return c; }, insertBefore(c){ return c; },
      setAttribute(k,v){ this.attributes[k]=String(v); }, getAttribute(k){ return (k in this.attributes)?this.attributes[k]:null; },
      removeAttribute(k){ delete this.attributes[k]; }, hasAttribute(k){ return k in this.attributes; },
      addEventListener(){}, removeEventListener(){}, focus(){}, blur(){}, click(){},
      querySelector(){ return null; }, querySelectorAll(){ return []; }, contains(){ return false; },
      getBoundingClientRect(){ return {top:0,left:0,width:0,height:0,bottom:0,right:0}; },
      innerHTML:'', textContent:'', value:'', id:'', className:'', hidden:false, disabled:false, parentNode:null };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
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
const P_LABEL1 = `escapeHtml(seatName1)+' → 替える相手</label>'`;
const P_LABEL2 = `escapeHtml(seatName2)+' → 替える相手</label>'`;
function buildSource(variant){
  switch(variant){
    case 'CURRENT': return SRC;
    case 'V-1': return patch(patch(SRC, P_LABEL1, `'先手</label>'`, 'V-1a'), P_LABEL2, `'後手</label>'`, 'V-1b');
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
     return { buildChangePairingModalHtml:buildChangePairingModalHtml,
              _setState:function(s){ state=s; } };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

// 3卓・勝敗未入力の1回戦（架空名）。q3 の氏名には < を仕込む（escape の検査）。
function makeState(){
  var players=[
    {id:'q1',name:'選手ア',entry_no:1},{id:'q2',name:'選手イ',entry_no:2},
    {id:'q3',name:'選手<b>ウ',entry_no:3},{id:'q4',name:'選手エ',entry_no:4},
    {id:'q5',name:'選手オ',entry_no:5},{id:'q6',name:'選手カ',entry_no:6}];
  return { classes:[{id:'A',name:'A級',started:true}], players:{A:players},
           pairings:{A:[{p1:'q1',p2:'q2',winner:null},{p1:'q3',p2:'q4',winner:null},{p1:'q5',p2:'q6',winner:null}]},
           results:{A:[]} };
}
function labelOf(html, role){
  var re = new RegExp('<label data-chg-seat-label="'+role+'"[^>]*>([\\s\\S]*?)</label>');
  var m = re.exec(html); return m ? m[1] : null;
}

// ---- 本体 ----------------------------------------------------------------
(function(){
  var env = loadEnv('CURRENT');
  var st = makeState(); env._setState(st);

  var html0 = env.buildChangePairingModalHtml('A', 0, st.players.A, st.pairings.A[0]);
  var l1 = labelOf(html0,'p1'), l2 = labelOf(html0,'p2');
  assert(l1==='選手ア → 替える相手', '[L1-1] p1 の見出しは今の参加者名＋「→ 替える相手」  ['+String(l1)+']');
  assert(l2==='選手イ → 替える相手', '[L1-2] p2 の見出しは今の参加者名＋「→ 替える相手」  ['+String(l2)+']');
  assert(html0.indexOf('先手')<0 && html0.indexOf('後手')<0, '[L2] 出力 HTML に「先手」「後手」が無い');

  var html1 = env.buildChangePairingModalHtml('A', 1, st.players.A, st.pairings.A[1]);
  var l3 = labelOf(html1,'p1');
  assert(l3==='選手&lt;b&gt;ウ → 替える相手', '[L3] 氏名の < は &lt; になる（生の <b> を出さない）  ['+String(l3)+']');
  assert(html1.indexOf('<b>ウ')<0, '[L3b] 生の <b> が HTML に出ていない');

  var html2 = env.buildChangePairingModalHtml('A', 0, st.players.A, {p1:'ghost',p2:'q2',winner:null});
  var l4 = labelOf(html2,'p1');
  assert(l4==='A-?? (削除) → 替える相手', '[L4] 候補に居ない id は「現在の対局」と同じ fallback 文字列  ['+String(l4)+']');
  assert(html2.indexOf('data-chg-current-role="p1">A-?? (削除)<')>=0, '[L4b] 対照: 「現在の対局」側も同じ fallback');

  // L5 利用者に見えるエラー文（出るタイミングは e2e が固定する。ここは文言だけ）
  assert(SRC.indexOf('同じ参加者を両方の欄には選べません。')>=0, '[L5-1] 同一参加者のエラー文が新文言');
  assert(SRC.indexOf('どちらかの欄を選び直してください。')>=0, '[L5-2] 変更なしのエラー文が新文言');
  assert(SRC.indexOf('が同じ対局の両方の欄に登録されています。')>=0, '[L5-3] 全試合入力時の alert が新文言');
  var oldMsgs = ['同じ参加者を先手・後手の両方には選べません', '先手か後手を選び直してください', 'が同じ対局の先手・後手に登録されています'];
  var oldLeft = oldMsgs.filter(function(m){ return SRC.indexOf(m)>=0; });
  assert(oldLeft.length===0, '[L5-4] 旧文言（先手・後手）が残っていない  ['+oldLeft.join(' / ')+']');
})();

// ---- 変異: 見出しを「先手」「後手」に戻すと L1/L2 が赤になる（この検査が見出しを本当に読んでいる証明）
(function(){
  var env = loadEnv('V-1');
  var st = makeState(); env._setState(st);
  var html = env.buildChangePairingModalHtml('A', 0, st.players.A, st.pairings.A[0]);
  var l1 = labelOf(html,'p1');
  var l1Red = (l1!=='選手ア → 替える相手');
  var l2Red = (html.indexOf('先手')>=0 || html.indexOf('後手')>=0);
  assert(l1Red && l2Red, '[V-1] 見出しを先手/後手に戻すと L1・L2 が赤になる  [L1 red='+l1Red+' L2 red='+l2Red+']');
})();

console.log('CHG-MODAL-NAME-LABELS-001: PASS='+pass+' FAIL='+fail);
process.exit(fail?1:0);
