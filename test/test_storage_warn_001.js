#!/usr/bin/env node
// STORAGE-WARN-001 (⑬): 起動時に localStorage 書込不可を検知して常時警告バナーを出す。
//   probeStorageWritable（pure・throw/読戻し不一致で false）と checkStorageAndWarn（バナー表示切替）を検証。
// 読込は共通ヘルパへ集約 [PHASE1-LOADER-001]（同じ全束を1コンテキストで評価する・意味論不変）
//   localStorage は「評価前 override」で差し替える（ブラウザ API 側なので二相の前段）。
//   節（＝ls の種類）ごとに loadApp し直す＝環境の使い回しをしない。
const {loadApp}=require('./lib/app_harness');
function makeEnv(ls){
  const app=loadApp({overrides:{localStorage:ls}});
  // 旧テストが返していた _doc（評価コンテキストの document）を同名で見えるようにする。
  const env=Object.create(app.ctx);
  env._doc=app.document;
  return env;
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
