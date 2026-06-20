#!/usr/bin/env node
// SAVE-UX-NONQUOTA-NOTIFY-001 (Issue #260): saveBranchMaster() の「quota 以外」保存失敗を
//   サイレント握り潰し（console.warn 単独）から notifySaveWarning 経由のユーザー通知へ格上げした
//   ことを検証する単体テスト。
//
// 背景:
//   従来 saveBranchMaster() の catch は quota（isQuotaExceededError=true）のみ notifySaveWarning で
//   showMsg('warn')＋console.warn＋indicator +1 を出し、quota 以外は console.warn 単独＝ユーザー無通知
//   （保存できていないのに成功に見える＝データ消失リスク）だった。本 PR で非quota も notifySaveWarning
//   （kind:'storage-error'）に格上げした。
//
// 観点:
//   A. 非quota（SecurityError 等、isQuotaExceededError=false）で setItem が失敗 →
//      showMsg('warn')（reg-msg に alert-warn 文言）＋ indicator count +1 ＝ユーザー可視。
//      console.warn は二重化せず「ちょうど 1 回」かつ consoleTag は [STORAGE-ERROR]。
//   B. quota（QuotaExceededError）回帰: 従来通り showMsg('warn')＋indicator +1、文言は容量超過、
//      consoleTag は [STORAGE-QUOTA]。挙動は本 PR で不変。
//   C. 正常保存（setItem 成功）: 警告を出さない（reg-msg 空・indicator 0・console.warn 0）かつ
//      localStorage へ実際に書き込まれる（非回帰）。
//   D. 分類ガード: isQuotaExceededError が SecurityError=false / QuotaExceededError=true を返す
//      （mock 例外が想定どおりの分岐へ落ちることの sanity）。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- 軽量 DOM / localStorage mock（test_furigana_mvp_001.js と同型）----
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
       _branchMasterKey:BRANCH_MASTER_KEY,
       _getIndicatorCount:function(){ return saveWarningIndicatorState.count; },
       _getRegMsgHtml:function(){ return document.getElementById('reg-msg').innerHTML; },
       _reset:function(){
         saveWarningIndicatorState.count=0;
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
  api._clearWarn = function(){ warnCalls.length=0; };
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_save_ux_nonquota_notify_001.js <html>');process.exit(1);}

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

// ---- D. 分類ガード（mock 例外が想定どおりの分岐へ落ちる前提を固定）----
assert(env.isQuotaExceededError({name:'SecurityError'})===false, 'D1 SecurityError は isQuotaExceededError=false（＝非quota 分岐）');
assert(env.isQuotaExceededError({name:'QuotaExceededError',code:22})===true, 'D2 QuotaExceededError は isQuotaExceededError=true（＝quota 分岐）');

// ---- A. 非quota 失敗 → ユーザー通知（showMsg＋indicator）かつ console.warn は 1 回だけ ----
env._reset();
env._clearWarn();
ls.setItem = function(){ var e=new Error('blocked'); e.name='SecurityError'; throw e; }; // code 未設定 → isQuotaExceededError=false
env.saveBranchMaster(sampleMaster());
const aMsg = env._getRegMsgHtml();
assert(aMsg.indexOf('alert-warn')>=0, 'A1 非quota 失敗で showMsg(\'warn\') が発火（reg-msg に alert-warn）');
assert(aMsg.indexOf('支部マスタの保存に失敗しました')>=0, 'A2 ユーザー可視文言（バックアップ促し）が表示される');
assert(env._getIndicatorCount()===1, 'A3 indicator count が +1 される（未通知の握り潰しでない）');
assert(env._warnCalls.length===1, 'A4 console.warn は二重化せず ちょうど 1 回（notifySaveWarning 内部の総括のみ）');
assert(env._warnCalls.length===1 && String(env._warnCalls[0][0]).indexOf('[STORAGE-ERROR]')>=0, 'A5 console.warn の tag は [STORAGE-ERROR]（saveBranchMaster setItem failed）');
assert(aMsg.indexOf('保存容量の上限')<0, 'A6 非quota 文言は quota 文言（容量超過）と混同しない');

// ---- B. quota 失敗 → 従来通り（回帰確認）----
env._reset();
env._clearWarn();
ls.setItem = function(){ var e=new Error('quota'); e.name='QuotaExceededError'; e.code=22; throw e; };
env.saveBranchMaster(sampleMaster());
const bMsg = env._getRegMsgHtml();
assert(bMsg.indexOf('alert-warn')>=0, 'B1 quota 失敗でも showMsg(\'warn\') が発火（回帰なし）');
assert(bMsg.indexOf('保存容量の上限に達しました')>=0, 'B2 quota 文言（容量超過）が従来通り表示される');
assert(env._getIndicatorCount()===1, 'B3 quota でも indicator count +1（従来通り）');
assert(env._warnCalls.length===1 && String(env._warnCalls[0][0]).indexOf('[STORAGE-QUOTA]')>=0, 'B4 quota の console.warn tag は [STORAGE-QUOTA]（不変）');

// ---- C. 正常保存（setItem 成功）→ 警告ゼロ かつ 実際に書き込まれる ----
env._reset();
env._clearWarn();
ls.setItem = origSetItem; // 正常 mock に復帰
const beforeKeys = Object.keys(ls._).length;
env.saveBranchMaster(sampleMaster());
assert(env._getRegMsgHtml()==='', 'C1 正常保存では警告 showMsg を出さない（reg-msg 空）');
assert(env._getIndicatorCount()===0, 'C2 正常保存では indicator を加算しない（count 0）');
assert(env._warnCalls.length===0, 'C3 正常保存では console.warn を出さない');
const savedRaw = ls.getItem(env._branchMasterKey);
assert(typeof savedRaw==='string' && savedRaw.length>0, 'C4 BRANCH_MASTER_KEY に実際に書き込まれている（保存成功）');
assert(Object.keys(ls._).length===beforeKeys+1, 'C5 localStorage に支部マスタ 1 件が新規に追加される');
let parsedOk=false;
try{ const o=JSON.parse(savedRaw); parsedOk = Array.isArray(o.members) && o.members.length===1 && o.members[0].name==='架空花子'; }catch(e){ parsedOk=false; }
assert(parsedOk, 'C6 保存された JSON は members を含む正準形（保存内容の健全性）');

console.log('');
console.log('  SAVE-UX-NONQUOTA-NOTIFY-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
