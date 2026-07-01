#!/usr/bin/env node
// STORAGE-WARN-001 (⑬): 起動時に localStorage 書込不可を検知して常時警告バナーを出す。
//   probeStorageWritable（pure・throw/読戻し不一致で false）と checkStorageAndWarn（バナー表示切替）を検証。
const fs = require('fs');
const target = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(target, 'utf8');
function scripts(){ const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m,o=''; while((m=re.exec(RAW))!==null)o+=m[1]+'\n'; return o; }
function node(){ return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},focus(){},remove(){},insertBefore(){},removeChild(){}}; }
function makeEnv(ls){
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {probeStorageWritable:(typeof probeStorageWritable!=="undefined"?probeStorageWritable:undefined),checkStorageAndWarn:(typeof checkStorageAndWarn!=="undefined"?checkStorageAndWarn:undefined),_doc:document};');
  return fn(doc,win,ls,{randomUUID:()=>'x'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true});
}
let pass=0,fail=0; const ok=(c,m)=>{ c?pass++:(fail++,console.log('  FAIL: '+m)); };

// 正常な localStorage
function goodLS(){ const s={}; return {getItem:k=>(k in s?s[k]:null),setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k];}}; }
// setItem が throw する（プライベートブラウズ/ストレージ無効相当）
function throwLS(){ return {getItem:()=>null,setItem:()=>{throw new Error('QuotaExceededError');},removeItem:()=>{}}; }
// 書けたように見えるが読み戻せない（セッション隔離相当の一部環境）
function noReadbackLS(){ return {getItem:()=>null,setItem:()=>{},removeItem:()=>{}}; }

console.log('=== probeStorageWritable ===');
ok(makeEnv(goodLS()).probeStorageWritable()===true,'P1 正常環境は true');
ok(makeEnv(throwLS()).probeStorageWritable()===false,'P2 setItem が throw する環境は false');
ok(makeEnv(noReadbackLS()).probeStorageWritable()===false,'P3 書いた値を読み戻せない環境は false');

console.log('=== checkStorageAndWarn（バナー表示切替）===');
var Eg=makeEnv(goodLS()); Eg.checkStorageAndWarn();
ok(Eg._doc.getElementById('storage-warn').style.display==='none','C1 正常環境ではバナー非表示');
var Et=makeEnv(throwLS()); Et.checkStorageAndWarn();
ok(Et._doc.getElementById('storage-warn').style.display==='block','C2 保存不可環境ではバナー表示');

console.log('STORAGE-WARN-001: PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
