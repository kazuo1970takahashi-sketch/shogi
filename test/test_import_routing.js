#!/usr/bin/env node
// DATA-IMPORT-ROUTING (#UX) — 保存系の取り違え防止。
//   classifyImportJson の内容ベース判別（backup/master/state/invalid）／
//   ファイル名の判別性（大会=shogi_taikai_ / マスタ=shogi_meibo_ / バックアップ=shogi_backup_）／
//   loadData・loadFromPaste のルーティング（backup→importTournamentBackupFromText・master→誘導）静的検証。
//   既存 applyLoadedJson の生 state 動作は非回帰（別テスト test_data_persistence_phase1 で担保）。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},appendChild:function(c){return c;},setAttribute:function(){},getAttribute:function(){return null;},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},body:n('body'),addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];}};
  var win={innerWidth:1024,addEventListener:function(){},open:function(){return{focus:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  const ctx=makeContext();const js=extractScripts(RAW);const cryptoMock={randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};return { classifyImportJson:classifyImportJson, buildMasterExportFilename:buildMasterExportFilename, BACKUP_KIND:BACKUP_KIND };`);
  return fn(ctx.document,ctx.window,ctx.localStorage,cryptoMock,function(){},function(){return true;},function(){return '';},function(){},function(){},{createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},{log:function(){},warn:function(){},error:function(){}},Promise,function(){return 0;});
}
let pass=0,fail=0;function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
const env=loadEnv();

console.log('=== C: classifyImportJson 内容判別 ===');
var backup=JSON.stringify({kind:env.BACKUP_KIND,schema_version:1,local:{state:{}},anonymous:{}});
ok(env.classifyImportJson(backup)==='backup','C1 バックアップ形式→backup');
var master=JSON.stringify({schema_version:1,updated_at:'2026-06-24T00:00:00.000Z',members:[{id:'m1',name:'甲'}]});
ok(env.classifyImportJson(master)==='master','C2 支部マスタ形式→master');
var state=JSON.stringify({classes:[{id:'A',name:'A'}],players:{A:[{id:'a1',name:'甲'}]},results:{A:[]},rounds:3,report:{title:'例会'}});
ok(env.classifyImportJson(state)==='state','C3 生の大会データ→state');
ok(env.classifyImportJson('{ not json')==='invalid','C4 不正JSON→invalid');
ok(env.classifyImportJson('[1,2,3]')==='invalid','C5 配列→invalid');
ok(env.classifyImportJson(JSON.stringify({rounds:0,classes:[],players:{}}))==='state','C6 members 無しの大会データ→state');
// member 配列を持つが大会データのキーも持つ紛らわしいケースは state 扱い（取りこぼし防止）
ok(env.classifyImportJson(JSON.stringify({members:[{id:'m1',name:'甲'}],players:{A:[]}}))==='state','C7 members+players 併存→state（大会データ優先）');

console.log('=== F: ファイル名の判別性 ===');
ok(env.buildMasterExportFilename('2026-06-24')==='shogi_meibo_2026-06-24.json','F1 マスタ=shogi_meibo_');
ok(RAW.indexOf("'shogi_taikai_'+y+m+d+'_'+hh+mm+'.json'")>=0,'F2 大会データ保存=shogi_taikai_');
ok(RAW.indexOf("'shogi_backup_'+y+mo+d+'_'+hh+mm+'.json'")>=0,'F3 バックアップ=shogi_backup_（現状維持）');
ok(/shogi_taikai_/.test(RAW)&&/shogi_meibo_/.test(RAW)&&/shogi_backup_/.test(RAW),'F4 3種が別語で判別可能');

console.log('=== R: ルーティング（静的検証）===');
ok(/classifyImportJson\(text\)/.test(RAW),'R1 読込が classifyImportJson を使う');
ok(/kind==='backup'[\s\S]{0,120}importTournamentBackupFromText\(text\)/.test(RAW),'R2 backup→importTournamentBackupFromText に自動誘導');
ok(/kind==='master'[\s\S]{0,160}マスタをインポート/.test(RAW),'R3 master→「マスタをインポート」へ誘導');
ok(/現在のデータを上書きして読み込みますか？'\)\)\{e\.target\.value=''/.test(RAW),'R4 スモーク互換: confirm 直後に e.target.value=（キャンセル再選択）');
ok(/applyLoadedJson\(text\)/.test(RAW),'R5 生 state は従来どおり applyLoadedJson');

console.log('\nPASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
