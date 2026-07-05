#!/usr/bin/env node
// NAME-INPUT-AUTOFILL-001 (#620): 氏名/ふりがな入力欄のブラウザ標準入力履歴候補の抑止。
//   applyAutofillGuard を抽出し、(1) autofill 抑止4属性の付与 (2) name の nf- 非固定化（毎回異なる）
//   (3) null 渡し/例外時の fail-soft (4) bind 側の結線 (5) name 付与の安全性根拠（<form> 不在）を検証。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');

const m=RAW.match(/function applyAutofillGuard\(inp\)\{[\s\S]*?\n\}/);
if(!m){console.log('  FAIL: applyAutofillGuard が抽出できない');process.exit(1);}
const applyAutofillGuard=new Function('return ('+m[0]+')')();

function mockInput(){
  return {attrs:{},setAttribute:function(k,v){this.attrs[k]=v;}};
}

let pass=0,fail=0; const ok=(c,msg)=>{c?pass++:(fail++,console.log('  FAIL: '+msg));};

console.log('=== (1) autofill 抑止属性の付与 ===');
var inp=mockInput();
applyAutofillGuard(inp);
ok(inp.attrs.autocomplete==='off','autocomplete=off が設定される');
ok(inp.attrs.autocorrect==='off'&&inp.attrs.autocapitalize==='off','autocorrect/autocapitalize=off が設定される');
ok(inp.attrs.spellcheck==='false','spellcheck=false が設定される');

console.log('=== (2) name の非固定化 ===');
ok(typeof inp.attrs.name==='string'&&inp.attrs.name.indexOf('nf-')===0&&inp.attrs.name.length>3,'name が nf- 始まりのランダム値');
var inp2=mockInput();
applyAutofillGuard(inp2);
ok(inp2.attrs.name!==inp.attrs.name,'name は呼び出しごとに異なる（履歴キー非固定化）');

console.log('=== (3) fail-soft ===');
var threw=false;
try{applyAutofillGuard(null);}catch(e){threw=true;}
ok(!threw,'null 渡しで throw しない');
threw=false;
try{applyAutofillGuard({setAttribute:function(){throw new Error('boom');}});}catch(e){threw=true;}
ok(!threw,'setAttribute 例外でも throw しない（try/catch fail-soft）');

console.log('=== (4) bind 結線 ===');
ok(/var inpName=document\.getElementById\('inp-name'\);\s*\n\s*applyAutofillGuard\(inpName\);/.test(RAW),'bindRegistrationEvents で inp-name に適用');
ok(/var inpYomi=document\.getElementById\('inp-yomi'\);\s*\n\s*applyAutofillGuard\(inpYomi\);/.test(RAW),'bindRegistrationEvents で inp-yomi に適用');

console.log('=== (5) name 付与の安全性根拠 ===');
ok(!/<form[\s>]/i.test(RAW),'<form> 要素が存在しない（name はフォーム送信に不使用）');

console.log('NAME-INPUT-AUTOFILL: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
