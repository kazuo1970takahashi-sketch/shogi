#!/usr/bin/env node
// ROUNDS-PER-CLASS-001 + SAVE-BTN-MEIBO-001:
//   (1) 回戦数をクラス別に上書きできる（state.classes[i].rounds・roundsForClass(cls) で解決・全体既定は state.rounds）。
//   (2) 保存ボタンを「📋 参加者を名簿に反映」（MASTER-SYNC-CLARITY-001 #757 改名前は「📋 名簿を更新」）に
//       一本化＝syncBranchMasterOnSave のみ（クリップボードコピー撤去）。
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
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const alerts=[];
  var clip={called:false};
  const nav={onLine:true,clipboard:{writeText:function(){clip.called=true;return Promise.resolve();}}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {roundsForClass:roundsForClass,onChangeClassRounds:onChangeClassRounds,saveData:saveData,normalizeState:normalizeState,_get:function(){return state;},_set:function(v){state=v;},STORAGE_KEY:STORAGE_KEY};');
  const env=fn(doc,win,ls,{randomUUID:()=>'0'},function(m){alerts.push(String(m));},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,nav);
  return {env,ls,store,doc,els,alerts,clip:clip,win};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function classOf(st,id){for(var i=0;i<st.classes.length;i++)if(st.classes[i].id===id)return st.classes[i];return null;}

console.log('=== roundsForClass（既定＋クラス上書き） ===');
var E=makeEnv();
ok(E.env.roundsForClass('A')===4,'F1 既定は4（全体 state.rounds）');
var s=E.env._get();s.rounds=5;E.env._set(s);
ok(E.env.roundsForClass('A')===5,'F2 全体既定変更が反映（上書き無し）');
classOf(E.env._get(),'A').rounds=3;
ok(E.env.roundsForClass('A')===3,'F3 クラスA上書き=3が優先');
ok(E.env.roundsForClass('B')===5,'F4 上書き無しBは全体既定5');
ok(E.env.roundsForClass('ZZZ')===5,'F5 未知クラスは全体既定');
classOf(E.env._get(),'A').rounds=0;
ok(E.env.roundsForClass('A')===5,'F6 不正上書き(0)は全体既定へフォールバック');

console.log('=== onChangeClassRounds（設定/既定戻し/開始後ロック） ===');
var Eo=makeEnv();
Eo.env.onChangeClassRounds('A','3');
ok(classOf(Eo.env._get(),'A').rounds===3,'O1 A上書き=3を設定');
ok(typeof Eo.store[Eo.env.STORAGE_KEY]==='string'&&JSON.parse(Eo.store[Eo.env.STORAGE_KEY]).classes.some(c=>c.id==='A'&&c.rounds===3),'O2 save()で永続化');
Eo.env.onChangeClassRounds('A','');
ok(classOf(Eo.env._get(),'A').rounds==null,'O3 既定選択で上書き削除（rounds無し）');
var El=makeEnv();
classOf(El.env._get(),'B').started=true;
El.env.onChangeClassRounds('B','5');
ok(classOf(El.env._get(),'B').rounds==null,'O4 開始後クラスは変更拒否');

console.log('=== normalizeState でクラス別 rounds を保持/正規化 ===');
var En=makeEnv();
var norm=En.env.normalizeState({classes:[{id:'A',name:'Aクラス',started:false,rounds:5},{id:'B',name:'Bクラス',started:false,rounds:0}],rounds:4,players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
ok(classOf(norm,'A').rounds===5,'N1 正の整数上書きを保持');
ok(classOf(norm,'B').rounds==null,'N2 不正上書き(0)はキーを落とす（既定に従う）');

console.log('=== 保存ボタン「参加者を名簿に反映」一本化（挙動） ===');
var Es=makeEnv();
Es.env.saveData();
ok(Es.clip.called===false,'S1 saveData はクリップボードへコピーしない');
// NOTIFY-N2-SAVE-001: 成功通知は alert → toast へ移行（STYLE-GUIDE §3 N2）。旧「控えはバックアップ」誘導は
// 保存状態バー＋save-systems ヘルプ（?v=56）へ移管済みのため S3 は「成功に alert を使わない」検証へ差し替え。
// MASTER-SYNC-CLARITY-001 (#757): 固定文言 → 結果報告の3型へ。参加者ゼロの env では差分ゼロ型になる。
ok(Es.els['app-toast']&&String(Es.els['app-toast'].textContent).indexOf('📋 名簿は反映済みです（変更なし）')>=0,'S2 反映結果を toast で通知（差分ゼロ型）');
ok(Es.alerts.every(a=>a.indexOf('名簿に反映')<0&&a.indexOf('名簿は反映済み')<0),'S3 成功通知に blocking alert を使わない（N2）');

console.log('=== 静的HTML / 配線（RAW） ===');
ok(RAW.indexOf('>📋 参加者を名簿に反映</button>')>=0,'R1 ボタン名は「📋 参加者を名簿に反映」（MASTER-SYNC-CLARITY-001 #757）');
ok(!/function saveData\(\)\{[\s\S]{0,400}navigator\.clipboard/.test(RAW),'R2 saveData にクリップボード書き出しが無い');
// IN-APP-MODAL-001 (#606): YOMI 上書き確認の appConfirm 非同期化に伴い、saveData は完了通知(showToast)を
//   syncBranchMasterOnSave の onDone 継続で受ける（引数付き呼び出し）。名簿同期の維持（呼出の存在）を担保する意図は不変。
// MASTER-SYNC-CLARITY-001 (#757): saveData 冒頭の注釈が増えたため走査幅のみ 600→900（担保する意図は不変）。
ok(/function saveData\(\)\{[\s\S]{0,900}syncBranchMasterOnSave\(/.test(RAW),'R3 saveData は名簿同期を維持（onDone 継続付き）');
ok(RAW.indexOf('回戦数（全クラス既定）')>=0,'R4 共通欄は「全クラス既定」と明示');
ok(/renderClassManager\(\)\{[\s\S]*createElement\('select'\)[\s\S]*onChangeClassRounds/.test(RAW),'R5 クラス管理行に回戦数selectと結線');
ok(/roundsSel\.disabled=isClassStarted\(c\.id\)/.test(RAW),'R6 クラス別selectは開始後ロック');
ok(RAW.indexOf('function roundsForClass(')>=0,'R7 roundsForClass ヘルパ定義');

console.log('ROUNDS-PER-CLASS: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
