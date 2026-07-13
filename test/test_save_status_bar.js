#!/usr/bin/env node
// SAVE-STATUS-BAR-REMOVE-001 (#716): 保存状態バー撤去の単体テスト（SAVE-STATUS-BAR-001 の後継）。
//   常時表示バー（💾自動保存｜📋名簿｜バックアップ｜☁送信）は撤去し、記録レイヤ
//   （SAVE_STATUS_KEY / loadSaveStatus / markSaveStatus / markAutosaveStatus / formatSaveStatusTime）は温存。
//   backup 時刻の表示はバックアップ modal 冒頭「最終バックアップ:」へ移設。
//   検証:
//     R: loadSaveStatus（空/破損→{}）・markSaveStatus（記録）・formatSaveStatusTime（未/当日/別日）＝記録レイヤ非劣化。
//     S: save() 成功で autosave が記録される（STORAGE_KEY 保存は非劣化）・markSaveStatus は fail-soft。
//     X: 撤去の検証＝静的 #save-status-bar 不在・renderSaveStatusBar/buildSaveStatusBarText 不在・
//        bindHeaderEvents に結線なし＆mock で例外なく実行・markSaveStatus が描画を呼ばない。
//     K: 4フック（save/syncBranchMasterOnSave/exportTournamentBackup/sendTournamentToCloud）がソース上に温存。
//     B: バックアップ modal 冒頭に「最終バックアップ:」表示（未実行=「未」・実行後=時刻）。
//     T: HELP_TEXTS['save-systems'] は撤去済み・既存 topic（tournament/cloud/save-warning）は非劣化。
//   データは完全架空のみ。state スキーマには何も追加しない（別キー保存）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_save_status_bar.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（test_help_004.js と同方針）。
function makeContext(){
  var elements={};
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
      disabled:false, type:'',
      style:{}, _attrs:{}, childNodes:[], _listeners:{}, _parent:null,
      appendChild:function(c){ c._parent=this; this.childNodes.push(c); if(c.id)elements[c.id]=c; return c; },
      remove:function(){
        if(this._parent){
          var arr=this._parent.childNodes;
          for(var i=0;i<arr.length;i++){ if(arr[i]===this){ arr.splice(i,1); break; } }
          this._parent=null;
        }
        if(this.id && elements[this.id]===this) delete elements[this.id];
      },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

function loadEnv(){
  const ctx = makeContext();
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){} };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       HELP_TEXTS:HELP_TEXTS,
       buildHelpModalHtml:buildHelpModalHtml,
       openHelpModal:openHelpModal,
       loadSaveStatus:loadSaveStatus,
       markSaveStatus:markSaveStatus,
       markAutosaveStatus:markAutosaveStatus,
       formatSaveStatusTime:formatSaveStatusTime,
       buildBackupModalHtml:buildBackupModalHtml,
       bindHeaderEvents:bindHeaderEvents,
       save:save,
       SAVE_STATUS_KEY:SAVE_STATUS_KEY,
       STORAGE_KEY:STORAGE_KEY
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('\n【SAVE-STATUS-BAR-REMOVE-001 (#716) 保存状態バー撤去（記録レイヤ温存）】');

// R レジストリ/ヘルパ（記録レイヤ非劣化）
const env = loadEnv();
assert(env.SAVE_STATUS_KEY==='shogi_save_status_v1', 'R1 SAVE_STATUS_KEY が専用キー（state 別キー・温存）');
assert(JSON.stringify(env.loadSaveStatus())==='{}', 'R2 未保存時 loadSaveStatus は {}');
env._ctx.localStorage.setItem(env.SAVE_STATUS_KEY,'{broken json');
assert(JSON.stringify(env.loadSaveStatus())==='{}', 'R3 破損 JSON でも {} を返す（fail-soft）');
env._ctx.localStorage.setItem(env.SAVE_STATUS_KEY,'[1,2]');
assert(JSON.stringify(env.loadSaveStatus())==='{}', 'R4 配列など object 以外も {} に落とす');
env._ctx.localStorage.removeItem(env.SAVE_STATUS_KEY);
env.markSaveStatus('backup');
const st1=env.loadSaveStatus();
assert(typeof st1.backup==='number'&&st1.backup>0, 'R5 markSaveStatus(backup) が epoch ms を記録（温存）');
assert(env.formatSaveStatusTime(undefined)==='未'&&env.formatSaveStatusTime(0)==='未'&&env.formatSaveStatusTime('x')==='未', 'R6 未実行/不正値は「未」');
const nowT=Date.now();
assert(/^\d{2}:\d{2}$/.test(env.formatSaveStatusTime(nowT)), 'R7 当日は HH:MM');
const past=new Date(new Date().getFullYear()-1,0,5,9,7,0).getTime();
assert(env.formatSaveStatusTime(past)===(new Date().getFullYear()-1)+'/01/05 09:07', 'R8 別日は YYYY/MM/DD HH:MM（年つき8桁・ゼロ埋め）');

// S save() フック（非劣化＋autosave 記録）
const es = loadEnv();
es.save();
assert(!!es._ctx.localStorage._[es.STORAGE_KEY], 'S1 save() が STORAGE_KEY へ保存（非劣化）');
const stS=es.loadSaveStatus();
assert(typeof stS.autosave==='number'&&stS.autosave>0, 'S2 save() 成功で autosave が記録される（温存）');
let threwS=false; try{ es.save(); es.save(); }catch(e){ threwS=true; }
assert(!threwS, 'S3 連続 save()（分単位スロットル経路）でも例外なし');

// X 撤去の検証（表示レイヤ不在）
assert(RAW.indexOf('id="save-status-bar"')<0, 'X1 静的 #save-status-bar が HTML に存在しない（撤去）');
assert(RAW.indexOf('function renderSaveStatusBar')<0, 'X2 renderSaveStatusBar が存在しない（撤去）');
assert(RAW.indexOf('function buildSaveStatusBarText')<0, 'X3 buildSaveStatusBarText が存在しない（撤去）');
const bheStart=RAW.indexOf('function bindHeaderEvents');
const bheBody=RAW.slice(bheStart,RAW.indexOf('function bindRegistrationEvents'));
assert(bheStart>=0&&bheBody.indexOf('save-status-bar')<0&&bheBody.indexOf('renderSaveStatusBar')<0, 'X4 bindHeaderEvents にバー結線・初期描画が無い');
const mssStart=RAW.indexOf('function markSaveStatus');
const mssSrc=RAW.slice(mssStart,mssStart+400);
assert(mssStart>=0&&mssSrc.indexOf('renderSaveStatusBar')<0, 'X5 markSaveStatus が描画を呼ばない（記録のみ）');
const ew = loadEnv();
let threwW=false; try{ ew.bindHeaderEvents(); }catch(e){ threwW=true; }
assert(!threwW, 'X6 bindHeaderEvents が mock DOM で例外なく実行される（撤去後も非劣化）');

// K 4フックの存在（記録レイヤ温存のソース検証）
const saveSrc=RAW.slice(RAW.indexOf('function save()'),RAW.indexOf('function save()')+900);
assert(saveSrc.indexOf('markAutosaveStatus()')>=0, 'K1 save() 成功パスで markAutosaveStatus（温存）');
const syncSrc=RAW.slice(RAW.indexOf('function syncBranchMasterOnSave'),RAW.indexOf('function saveData'));  // YOMI-SYNC-OVERWRITE-001 で関数が伸びたため関数全体を対象に
assert(/masterSaved!==false\)\{[\s\S]{0,1200}markSaveStatus\('meibo'\)/.test(syncSrc), 'K2 名簿同期成功時のみ meibo 記録（温存）');
const expSrc=RAW.slice(RAW.indexOf('function exportTournamentBackup'),RAW.indexOf('function exportTournamentBackup')+1400);
assert(expSrc.indexOf("markSaveStatus('backup')")>=0&&expSrc.indexOf("markSaveStatus('backup')")<expSrc.indexOf('return true;')+30, 'K3 バックアップ成功時に backup 記録（温存）');
// SEND-DATE-CONFIRM-002 (#622)/SEND-DATE-GUARD-001 (#600): 冒頭の日付確認ガードで関数が伸びたため窓を 5200 に拡大（チェック内容は不変）。
// GUEST-TOURNAMENT-MODE-001 (#760): 冒頭のゲスト大会ガードでさらに伸びたため窓を 6400 に拡大（チェック内容は不変）。
const cloudSrc=RAW.slice(RAW.indexOf('function sendTournamentToCloud'),RAW.indexOf('function sendTournamentToCloud')+6400);
assert(/res&&res\.ok[\s\S]{0,900}markSaveStatus\('cloud'\)/.test(cloudSrc), 'K4 送信 res.ok 時に cloud 記録（温存）');

// B バックアップ modal 冒頭の「最終バックアップ」表示（backup 時刻の移設先）
const eb = loadEnv();
const htmlBefore=eb.buildBackupModalHtml();
assert(htmlBefore.indexOf('最終バックアップ:')>=0, 'B1 バックアップ modal 冒頭に「最終バックアップ:」を表示');
assert(htmlBefore.indexOf('<strong>未</strong>')>=0, 'B2 未実行時は「未」');
eb.markSaveStatus('backup');
const htmlAfter=eb.buildBackupModalHtml();
assert(/<strong>\d{2}:\d{2}<\/strong>/.test(htmlAfter), 'B3 実行後は当日 HH:MM を表示');
const bbmStart=RAW.indexOf('function buildBackupModalHtml');
const bbmSrc=RAW.slice(bbmStart,bbmStart+900);
assert(bbmSrc.indexOf('formatSaveStatusTime')>=0&&bbmSrc.indexOf('loadSaveStatus')>=0, 'B4 表示は formatSaveStatusTime(loadSaveStatus().backup) 由来（固定文言のみ・XSS 面なし）');

// T ヘルプ topic（save-systems 撤去・既存 topic 非劣化）
assert(!env.HELP_TEXTS['save-systems'], 'T1 HELP_TEXTS[save-systems] は撤去済み（導線がバーのみだった dead topic を残さない）');
assert(RAW.indexOf("openHelpModal('save-systems')")<0, 'T2 save-systems を開く導線が残っていない');
assert(env.HELP_TEXTS['tournament']&&env.HELP_TEXTS['cloud']&&env.HELP_TEXTS['save-warning'], 'T3 既存 topic（tournament/cloud/save-warning）非劣化');
const mh=env.buildHelpModalHtml('save-warning');
assert(typeof mh==='string'&&mh.length>0, 'T4 buildHelpModalHtml が既存 topic で引き続き動作');

console.log('\n  SAVE-STATUS-BAR-REMOVE テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
