#!/usr/bin/env node
// @suite: ROUNDS-PER-CLASS-UI-001（#844）クラス別回戦数の上書きが写しから落ちない
// ROUNDS-PER-CLASS-UI-001（Issue #844）
//   クラス別回戦数の上書き（ROUNDS-PER-CLASS-001）が「クラス管理」のセレクタに表示されない。
//   原因: getRegistrationClassList() が state.classes を写すときに rounds を落とすため、
//         renderClassManager の curOv が常に NaN になり value='' ＝「既定(N)」に張り付く。
//
//   ★ 本ファイルは純関数層だけを測る（DOM 不要・run_tests.sh の自動発見対象）。
//     DOM モックで <select> を検証すると、モックの select.value は「合致する option が
//     無くても代入できてしまう」ため、壊れた実装でも緑になる（偽陽性の罠）。
//     実際に描かれた <select> の選択状態は実ブラウザで測る:
//       test/e2e/rounds_per_class_ui_844.e2e.js
//
//   入力は完全架空。shogi_v4.html は読むだけ。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_rounds_per_class_ui_844.js <html>'); process.exit(1); }
const ABS = path.resolve(targetPath);

let pass=0, fail=0;
function assert(cond, msg){ if(cond){ pass++; console.log('  ✓ '+msg); } else { fail++; console.log('  ✗ '+msg); } }

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}
function makeNode(tag){
  return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
    style:{cssText:''}, _attrs:{}, childNodes:[], textContent:'', disabled:false, type:'',
    appendChild:function(c){ this.childNodes.push(c); return c; },
    setAttribute:function(k,v){ this._attrs[k]=String(v); },
    getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
}
function loadEnv(){
  var elements={};
  const doc={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:makeNode, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  const win={ innerWidth:1024, addEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
  const ls={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${extractScripts(ABS)};
     return { getRegistrationClassList:getRegistrationClassList, roundsForClass:roundsForClass, state:state };`
  );
  return fn(doc, win, ls, {randomUUID(){return '0';}}, function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL(){return 'b';},revokeObjectURL(){}}, console, Promise, function(){return 0;});
}

const env = loadEnv();
const st = env.state;

console.log('\n[U] getRegistrationClassList() が rounds を保持するか');
(function(){
  st.rounds = 4;
  st.classes = [{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス',rounds:6},{id:'C',name:'Cクラス',rounds:9}];
  const list = env.getRegistrationClassList();

  assert(list.length===3, 'U-0 前提: 3クラスぶん返る（実測 '+list.length+'）');
  assert(env.roundsForClass('B')===6, 'U-1 前提: 上書きは実際に効いている＝壊れているのは表示だけ（roundsForClass(B)='+env.roundsForClass('B')+'）');
  assert(list[1].rounds===6, 'U-2 B の写しに rounds=6 が乗る（実測 '+JSON.stringify(list[1].rounds)+'）');
  assert(list[2].rounds===9, 'U-3 選択肢外の上書き 9 も落とさない（実測 '+JSON.stringify(list[2].rounds)+'）');
  assert(!('rounds' in list[0]), 'U-4 上書きの無い A には rounds キーを付けない（従来の返り値の形を変えない）');
  assert(list[0].id==='A'&&list[0].name==='Aクラス'&&list[0].started===false, 'U-5 既存フィールド（id/name/started）は不変');
})();

console.log('\n[U2] 不正値は normalizeClasses と同じ基準で落とす');
(function(){
  st.classes = [{id:'A',rounds:0},{id:'B',rounds:-3},{id:'C',rounds:'x'},{id:'D',rounds:null},{id:'E',rounds:NaN}];
  const bad = env.getRegistrationClassList();
  assert(bad.length===5, 'U2-0 前提: 5件返る（実測 '+bad.length+'）');
  assert(bad.every(function(c){ return !('rounds' in c); }),
    'U2-1 0 / 負 / 非数 / null / NaN は rounds を付けない（実測 '+JSON.stringify(bad.map(function(c){return c.rounds;}))+'）');

  st.classes = [{id:'A',rounds:'6'},{id:'B',rounds:6.7}];
  const co = env.getRegistrationClassList();
  assert(co[0].rounds===6, 'U2-2 文字列 "6" は数値 6 に正規化（select の value 比較は文字列化されるため型を揃える）');
  assert(co[1].rounds===6, 'U2-3 6.7 は Math.floor で 6（normalizeClasses と同基準）');
})();

console.log('\n[U3] 境界と fallback');
(function(){
  st.classes = null;
  const fb = env.getRegistrationClassList();
  assert(fb.length===2 && fb[0].id==='A' && fb[1].id==='B', 'U3-1 classes 不在なら従来どおり A/B fallback');
  assert(!('rounds' in fb[0]) && !('rounds' in fb[1]), 'U3-2 fallback に rounds は付けない');

  st.classes = [];
  const fb2 = env.getRegistrationClassList();
  assert(fb2.length===2 && !('rounds' in fb2[0]), 'U3-3 空配列も fallback（従来どおり）');

  st.classes = [{id:'../evil',rounds:6},{id:'A',rounds:5}];
  const safe = env.getRegistrationClassList();
  assert(safe.length===1 && safe[0].id==='A' && safe[0].rounds===5,
    'U3-4 isSafeClassId のふるいは従来どおり効く（不正 id は rounds ごと落ちる）');

  st.classes = [{id:'A',name:'Aクラス',started:true,rounds:5}];
  const stt = env.getRegistrationClassList();
  assert(stt[0].started===true && stt[0].rounds===5, 'U3-5 開始済みクラスでも rounds は返す（表示のため。ロックは UI 側の disabled）');
})();

console.log('\n  ROUNDS-PER-CLASS-UI-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
