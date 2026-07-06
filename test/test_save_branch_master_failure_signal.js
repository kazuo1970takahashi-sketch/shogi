#!/usr/bin/env node
// SAVE-UX-NONQUOTA-NOTIFY-001 (Issue #260) — Codex Conditional GO P2×3 の回帰テスト。
//
// 背景:
//   先行コミット d518f82 で saveBranchMaster() の非quota保存失敗を notifySaveWarning（ユーザー可視）へ
//   格上げした。しかし Codex レビューが「saveBranchMaster() が失敗ステータスを返さないため、警告を出しても
//   呼び出し側が直後に showMsg(...,'ok') で成功バナーを上書きしてしまう」と指摘（P2）。本テストは追補修正
//   （①失敗シグナル return / ②master 誘導文言 / ③呼び出し側の成功抑止）を固定する。
//
// 観点:
//   R 戻り値契約: saveBranchMaster() は成功で true / 非quota失敗で false / quota失敗で false を返す。
//   W 文言（P2-2）: 非quota失敗の文言は失敗対象（支部マスタ）に合わせ「マスタをエクスポート」へ誘導し、
//      旧「大会データをコピー」（state 本体 save() 用の誤誘導）を含まない。プレフィックスは保持。
//   S 呼び出し側の成功抑止（P2-1）: 直接呼べる代表経路 processMasterImportText（overwrite / merge）で、
//      非quota保存失敗時に成功バナー（showMsg(...,'ok')）を出さず warn を残すこと、保存成功時は従来通り
//      成功バナーを出すこと（非回帰）を実証する。reset / delete / restore / phase2-import / migration の各
//      経路も同一の `saved&&` ガードで成功を抑止する（戻り値契約 R と同一機構）。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- 軽量 DOM / localStorage mock（test_save_ux_nonquota_notify_001.js と同型）----
function makeContext(){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function gatherText(node){
    if(node==null)return '';
    if(node.nodeType===3)return node.textContent;
    var s='', ch=node.childNodes||[];
    for(var i=0;i<ch.length;i++)s+=gatherText(ch[i]);
    return s;
  }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'',
      type:'', selected:false, checked:false, disabled:false, hidden:false,
      style:{}, _attrs:{}, _innerHTML:'', childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      insertBefore:function(c){ this.childNodes.unshift(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
      remove:function(){},
      addEventListener:function(){}, removeEventListener:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      removeAttribute:function(k){ delete this._attrs[k]; },
      focus:function(){}, blur:function(){}, click:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
      get firstChild(){ return this.childNodes[0]||null; },
      get lastChild(){ return this.childNodes[this.childNodes.length-1]||null; },
      get children(){ return this.childNodes.filter(function(n){return n.nodeType===1;}); },
      get textContent(){ return gatherText(this); },
      set textContent(v){ this.childNodes=[makeText(v)]; },
      get innerHTML(){ return this._innerHTML; },
      set innerHTML(v){ this._innerHTML=String(v); if(v==='')this.childNodes=[]; }
    };
  }
  var elements={};
  var docMock={
    _elements:elements,
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
  function BlobMock(parts,opt){ return {_isMockBlob:true, _content:(parts&&parts[0])?String(parts[0]):'', type:opt&&opt.type}; }
  var urlMock={ createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){} };
  return { document:docMock, window:winMock, localStorage:localStorageMock, Blob:BlobMock, URL:urlMock };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const warnCalls = [];
  const consoleMock = { log:function(){}, warn:function(){ warnCalls.push([].slice.call(arguments)); }, error:function(){} };
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       saveBranchMaster:saveBranchMaster,
       isQuotaExceededError:isQuotaExceededError,
       processMasterImportText:processMasterImportText,
       __setAppModalTestResolver:__setAppModalTestResolver,
       loadBranchMaster:loadBranchMaster,
       _branchMasterKey:BRANCH_MASTER_KEY,
       _getIndicatorCount:function(){ return saveWarningIndicatorState.count; },
       _getRegMsgHtml:function(){ return document.getElementById('reg-msg').innerHTML; },
       _reset:function(){
         saveWarningIndicatorState.count=0;
         if(typeof _resetSaveWarningAggregationState==='function')_resetSaveWarningAggregationState();
         if(typeof updateSaveWarningIndicator==='function')updateSaveWarningIndicator();
         document.getElementById('reg-msg').innerHTML='';
       }
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, consoleMock, Promise, function(){}
  );
  api._ctx = ctx;
  api._warnCalls = warnCalls;
  // IN-APP-MODAL-001 Phase 1b: overwrite confirm はアプリ内モーダル化済。同期解決シームで OK 固定（callback を同期実行）。
  if(api.__setAppModalTestResolver){ api.__setAppModalTestResolver(function(){ return true; }); }
  api._clearWarn = function(){ warnCalls.length=0; };
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_save_branch_master_failure_signal.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const env = loadEnv(targetPath);
const ls = env._ctx.localStorage;
const origSetItem = ls.setItem;

function sampleMaster(){
  return { schema_version:1, updated_at:'', members:[
    { id:'m1', name:'架空花子', yomi:'かくうはなこ', member:'member', grade:'ippan' }
  ] };
}
function importPayload(){
  // detectImportFormat: members 配列を持つ → 'branch_master'（players を持たない）
  return JSON.stringify({ schema_version:1, members:[
    { id:'m1', name:'架空花子', yomi:'かくうはなこ', member:'member', grade:'ippan' }
  ] });
}
function failSetItem(name){ ls.setItem = function(){ var e=new Error('blocked'); e.name=name||'SecurityError'; throw e; }; }
function failSetItemQuota(){ ls.setItem = function(){ var e=new Error('quota'); e.name='QuotaExceededError'; e.code=22; throw e; }; }
function okSetItem(){ ls.setItem = origSetItem; }
function clearStorage(){ for(var k in ls._){ if(Object.prototype.hasOwnProperty.call(ls._,k))delete ls._[k]; } }

// ============================================================
// R. 戻り値契約（P2-1 の芯：失敗シグナルを返す）
// ============================================================
env._reset(); env._clearWarn(); okSetItem();
assert(env.saveBranchMaster(sampleMaster())===true, 'R1 保存成功で saveBranchMaster() は true を返す');

env._reset(); env._clearWarn(); failSetItem('SecurityError');
assert(env.saveBranchMaster(sampleMaster())===false, 'R2 非quota失敗で saveBranchMaster() は false を返す（呼び出し側が成功抑止できる）');

env._reset(); env._clearWarn(); failSetItemQuota();
assert(env.saveBranchMaster(sampleMaster())===false, 'R3 quota失敗でも saveBranchMaster() は false を返す（従来 return; からの追補）');

// ============================================================
// W. 文言（P2-2：誘導先を master のバックアップ経路へ）
// ============================================================
env._reset(); env._clearWarn(); failSetItem('SecurityError');
env.saveBranchMaster(sampleMaster());
const wMsg = env._getRegMsgHtml();
assert(wMsg.indexOf('マスタをエクスポート')>=0, 'W1 非quota失敗の文言は「マスタをエクスポート」へ誘導する（失敗対象＝支部マスタ）');
assert(wMsg.indexOf('大会データをコピー')<0, 'W2 旧「大会データをコピー」（state 本体 save() 用）へは誘導しない');
assert(wMsg.indexOf('支部マスタの保存に失敗しました')>=0, 'W3 「支部マスタの保存に失敗しました」プレフィックスは保持（既存通知の非回帰）');

// ============================================================
// S. 呼び出し側の成功抑止（代表経路 processMasterImportText）
// ============================================================
// S-overwrite-fail: 非quota保存失敗時、上書きインポートの成功バナーを出さない（warn を残す）
env._reset(); env._clearWarn(); clearStorage(); failSetItem('SecurityError');
env.processMasterImportText(importPayload(),'overwrite',function(){});
const ovFail = env._getRegMsgHtml();
assert(ovFail.indexOf('alert-warn')>=0, 'S1 overwrite-import 保存失敗で warn が残る（saveBranchMaster の通知）');
assert(ovFail.indexOf('参加者マスタを読み込みました')<0, 'S2 overwrite-import 保存失敗で成功バナー「参加者マスタを読み込みました」を出さない（抑止）');
assert(ovFail.indexOf('alert-ok')<0, 'S3 overwrite-import 保存失敗で alert-ok（成功表示）が出ない');
assert(env._getIndicatorCount()===1, 'S4 overwrite-import 保存失敗で indicator が +1（ユーザー可視）');

// S-overwrite-ok: 保存成功時は従来通り成功バナーを出す（非回帰）
env._reset(); env._clearWarn(); clearStorage(); okSetItem();
env.processMasterImportText(importPayload(),'overwrite',function(){});
const ovOk = env._getRegMsgHtml();
assert(ovOk.indexOf('参加者マスタを読み込みました')>=0, 'S5 overwrite-import 保存成功で成功バナーを出す（非回帰）');
assert(ovOk.indexOf('alert-ok')>=0, 'S6 overwrite-import 保存成功は alert-ok 表示');
assert(ovOk.indexOf('alert-warn')<0, 'S7 overwrite-import 保存成功で warn は出ない');

// S-merge-fail: 非quota保存失敗時、マージインポートの成功バナーを出さない
env._reset(); env._clearWarn(); clearStorage(); failSetItem('SecurityError');
env.processMasterImportText(importPayload(),'merge',function(){});
const mgFail = env._getRegMsgHtml();
assert(mgFail.indexOf('alert-warn')>=0, 'S8 merge-import 保存失敗で warn が残る');
assert(mgFail.indexOf('参加者マスタにマージしました')<0, 'S9 merge-import 保存失敗で成功バナー「マージしました」を出さない（抑止）');

// S-merge-ok: 保存成功時は従来通り成功バナーを出す（非回帰）
env._reset(); env._clearWarn(); clearStorage(); okSetItem();
env.processMasterImportText(importPayload(),'merge',function(){});
const mgOk = env._getRegMsgHtml();
assert(mgOk.indexOf('参加者マスタにマージしました')>=0, 'S10 merge-import 保存成功で成功バナーを出す（非回帰）');
assert(mgOk.indexOf('alert-warn')<0, 'S11 merge-import 保存成功で warn は出ない');

console.log('');
console.log('  SAVE-BRANCH-MASTER-FAILURE-SIGNAL テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
