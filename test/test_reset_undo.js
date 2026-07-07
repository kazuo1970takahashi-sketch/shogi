#!/usr/bin/env node
// RESET-UNDO (当日運営レビュー第2弾⑩): リセット直前スナップショット＋「元に戻す」。
//   全リセット/進行リセットの直前に state を1回分退避し、実行後に復元できる安全網。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {captureResetSnapshot:captureResetSnapshot,undoLastReset:undoLastReset,hasResetUndoSnapshot:hasResetUndoSnapshot,showResetUndoBanner:showResetUndoBanner,_get:function(){return state;},_set:function(v){state=v;},UNDO_KEY:UNDO_KEY,STORAGE_KEY:STORAGE_KEY};');
  const env=fn(doc,win,ls,{randomUUID:()=>'0'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true});
  return {env,ls,store,doc,els};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== スナップショット捕捉 ===');
var E=makeEnv();
var orig=E.env._get();
ok(orig&&Array.isArray(orig.classes),'前提: 既定 state に classes');
E.env.captureResetSnapshot('all');
ok(!!E.store[E.env.UNDO_KEY],'C1 UNDO_KEY に退避される');
var snap=JSON.parse(E.store[E.env.UNDO_KEY]);
ok(snap.kind==='all'&&typeof snap.savedAt==='number'&&typeof snap.payload==='string','C2 kind/savedAt/payload を保持');
ok(JSON.parse(snap.payload).classes.length===orig.classes.length,'C3 payload は現在 state と一致');
ok(E.env.hasResetUndoSnapshot()===true,'C4 hasResetUndoSnapshot=true');

console.log('=== 元に戻す（復元） ===');
var E2=makeEnv();
E2.env.captureResetSnapshot('all');             // 既定 state（classes A/B）を退避
E2.env._set({players:{},pairings:{},results:{},classes:[{id:'Z',name:'Zクラス',started:false}],started:false,rounds:4,report:{}}); // リセット後相当
ok(E2.env._get().classes.length===1,'前提: リセット後 state に差し替え');
E2.env.undoLastReset();
var restored=E2.env._get();
ok(restored.classes.some(function(c){return c.id==='A';}),'U1 元の state（Aクラス含む）に復元');
ok(!E2.store[E2.env.UNDO_KEY],'U2 復元後は UNDO_KEY を消去（一段のみ）');
ok(typeof E2.store[E2.env.STORAGE_KEY]==='string','U3 復元内容を STORAGE_KEY にも保存');
ok(E2.env.hasResetUndoSnapshot()===false,'U4 復元後 hasResetUndoSnapshot=false');

console.log('=== 退避なしでの元に戻す（安全） ===');
var E3=makeEnv();
ok(E3.env.undoLastReset()===false,'U5 退避が無ければ false（落ちない）');

console.log('=== バナー描画 ===');
var E4=makeEnv();
E4.env.showResetUndoBanner('大会データを全リセットしました');
var msgEl=E4.els['reg-msg'];
ok(msgEl&&msgEl.innerHTML.indexOf('reset-undo-btn')>=0,'B1 #reg-msg に「元に戻す」ボタン');
ok(msgEl.innerHTML.indexOf('全リセットしました')>=0,'B2 成功メッセージを併記');

console.log('=== 配線（RAW） ===');
ok(/function resetAll\(\)\{[\s\S]{0,600}captureResetSnapshot\('all'\)/.test(RAW),'W1 resetAll が confirm 後に snapshot');
ok(/function resetTournamentProgressOnly\(\)\{[\s\S]{0,600}captureResetSnapshot\('progress'\)/.test(RAW),'W2 resetProgress が confirm 後に snapshot');
ok(RAW.indexOf("showResetUndoBanner('大会データを全リセットしました')")>=0,'W3 全リセット成功で undo バナー');
ok(RAW.indexOf("showResetUndoBanner('大会進行データをリセットしました')")>=0,'W4 進行リセット成功で undo バナー');
ok(/id="reset-undo-btn"[\s\S]{0,200}undoLastReset\(\)/.test(RAW)||/reset-undo-btn'\)[\s\S]{0,120}undoLastReset/.test(RAW),'W5 元に戻すボタン→undoLastReset 結線');

console.log('RESET-UNDO: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
