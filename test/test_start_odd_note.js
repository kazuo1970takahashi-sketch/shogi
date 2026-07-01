#!/usr/bin/env node
// START-FRP-UX-002: 未開始で「全員で1局目を開始」が出せない（奇数 or 1名）とき、理由＋対処の案内を出す。
//   一括開始ボタンが黙って消えないようにする。既存の開始/部分開始/リセットの id・文言・条件は不変。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},focus(){},remove(){}};}
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {buildClassActionBarHtml:buildClassActionBarHtml,_get:function(){return state;},_set:function(v){state=v;}};');
  return fn(doc,win,ls,{randomUUID:()=>'0'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true});
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function players(n){var a=[];for(var i=0;i<n;i++)a.push({id:'p'+i,name:'選手'+i});return a;}

var E=makeEnv();
function setA(n,started){var s=E._get();s.players=s.players||{};s.players.A=players(n);for(var i=0;i<s.classes.length;i++)if(s.classes[i].id==='A')s.classes[i].started=!!started;E._set(s);}

console.log('=== 偶数（4名・未開始）: 全員開始ボタン・案内なし ===');
setA(4,false);
var h4=E.buildClassActionBarHtml('A');
ok(h4.indexOf('id="startBtnClass_A"')>=0,'E1 偶数は「全員で1局目を開始」ボタンあり');
ok(h4.indexOf('class-start-note')<0,'E2 偶数は奇数案内を出さない');

console.log('=== 奇数（7名・未開始）: 全員開始ボタン無し＋理由案内 ===');
setA(7,false);
var h7=E.buildClassActionBarHtml('A');
ok(h7.indexOf('id="startBtnClass_A"')<0,'O1 奇数は「全員で1局目を開始」ボタンを出さない（既存条件）');
ok(h7.indexOf('class-start-note')>=0 && h7.indexOf('奇数（7名）')>=0,'O2 奇数は理由（奇数7名）を明示');
ok(h7.indexOf('部分開始')>=0,'O3 対処として部分開始へ誘導（部分開始ボタンは併置）');
ok(h7.indexOf('id="startBtnPartial_A"')>=0,'O4 部分開始ボタンは従来通り出る');

console.log('=== 1名（未開始）: もう1名案内 ===');
setA(1,false);
var h1=E.buildClassActionBarHtml('A');
ok(h1.indexOf('id="startBtnClass_A"')<0,'S1 1名は一括開始ボタン無し');
ok(h1.indexOf('class-start-note')>=0 && h1.indexOf('まだ1名')>=0,'S2 1名は「もう1名で開始できる」案内');

console.log('=== 開始済み: 案内を出さない（状態ラベル＋リセット） ===');
setA(7,true);
var hs=E.buildClassActionBarHtml('A');
ok(hs.indexOf('class-start-note')<0,'D1 開始済みは開始案内を出さない');
ok(hs.indexOf('開始済み')>=0,'D2 開始済みは状態ラベル');

console.log('START-ODD-NOTE: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
