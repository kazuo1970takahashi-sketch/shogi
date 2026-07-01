#!/usr/bin/env node
// ROUNDS-CONFIG-001: 回戦数セレクタ（受付タブ #inp-rounds）。
//   state.rounds を駆動（ペアリング/順位/星取/報告書は全て state.rounds 参照）。既定4・選択肢3/4/5。
//   renderRoundsControl が value/disabled/選択肢を同期、onChangeRounds が反映＋save、開始後(state.started)はロック。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
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
    scripts()+';return {renderRoundsControl:renderRoundsControl,onChangeRounds:onChangeRounds,_get:function(){return state;},_set:function(v){state=v;},STORAGE_KEY:STORAGE_KEY};');
  const env=fn(doc,win,ls,{randomUUID:()=>'0'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true,clipboard:null});
  return {env,ls,store,doc,els};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== 静的HTML / 配線（RAW） ===');
ok(RAW.indexOf('id="inp-rounds"')>=0,'S1 回戦数セレクタ #inp-rounds を追加');
ok(RAW.indexOf('id="rounds-config-section"')>=0,'S2 回戦数セクションを追加');
ok(RAW.indexOf('id="rounds-config-note"')>=0,'S3 注記(#rounds-config-note)を追加');
ok(/renderClassManager\(\);\s*renderRoundsControl\(\);/.test(RAW),'S4 renderRegList 経路で renderRoundsControl を呼ぶ');
ok(/getElementById\('inp-rounds'\)[\s\S]{0,120}addEventListener\('change',onChangeRounds\)/.test(RAW),'S5 change→onChangeRounds を bind');
ok(RAW.indexOf('rounds: 4')>=0||/rounds:\s*4/.test(RAW),'S6 既定は4回戦（互換）');

console.log('=== renderRoundsControl（描画同期） ===');
var E=makeEnv();
E.env.renderRoundsControl();
var sel=E.els['inp-rounds'];
ok(sel.innerHTML.indexOf('value="3"')>=0&&sel.innerHTML.indexOf('value="4"')>=0&&sel.innerHTML.indexOf('value="5"')>=0,'R1 選択肢に3/4/5を生成');
ok(sel.innerHTML.indexOf('5回戦')>=0,'R2 表示は「N回戦」');
ok(sel.value==='4','R3 既定 value は4（state.rounds）');
ok(sel.disabled===false,'R4 未開始は変更可（disabled=false）');
ok(E.els['rounds-config-note'].textContent.indexOf('開始前')>=0,'R5 未開始は「開始前に設定」注記');

console.log('=== 現在値が3/4/5以外でも option を含める ===');
var Ec=makeEnv();
var sc=Ec.env._get();sc.rounds=6;Ec.env._set(sc);
Ec.env.renderRoundsControl();
ok(Ec.els['inp-rounds'].innerHTML.indexOf('value="6"')>=0,'R6 現在値6でも option 6 を含める');
ok(Ec.els['inp-rounds'].value==='6','R7 value は現在値6に同期');

console.log('=== 開始後ロック ===');
var El=makeEnv();
var sl=El.env._get();sl.started=true;El.env._set(sl);
El.env.renderRoundsControl();
ok(El.els['inp-rounds'].disabled===true,'L1 開始後は disabled=true');
ok(El.els['rounds-config-note'].textContent.indexOf('開始後は変更できません')>=0,'L2 開始後は「変更できません」注記');

console.log('=== onChangeRounds（反映＋保存） ===');
var Eo=makeEnv();
Eo.env.renderRoundsControl();
Eo.els['inp-rounds'].value='5';
Eo.env.onChangeRounds();
ok(Eo.env._get().rounds===5,'O1 選択で state.rounds=5 に反映');
ok(typeof Eo.store[Eo.env.STORAGE_KEY]==='string'&&JSON.parse(Eo.store[Eo.env.STORAGE_KEY]).rounds===5,'O2 save() で永続化（rounds=5）');
ok(Eo.els['inp-rounds'].value==='5','O3 描画も5に同期');

console.log('=== onChangeRounds 開始後は拒否 ===');
var Er=makeEnv();
var sr=Er.env._get();sr.started=true;sr.rounds=4;Er.env._set(sr);
Er.env.renderRoundsControl();
Er.els['inp-rounds'].value='5';   // disabled を潜り抜けた想定
Er.env.onChangeRounds();
ok(Er.env._get().rounds===4,'O4 開始後は変更を拒否（rounds=4のまま）');
ok(Er.els['inp-rounds'].value==='4','O5 表示も元(4)へ戻す');

console.log('ROUNDS-SELECTOR: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
