#!/usr/bin/env node
// SAVE-NONQUOTA-ALERT-001 (Issue #278): save() の「quota 以外」保存失敗が、登録タブ表示中だと
//   画面内バナーのみで blocking alert が出ず、保存失敗（=データ消失リスク）の認知が quota より弱い
//   問題を是正したことを検証する単体テスト。
//
// 背景:
//   save() の catch は quota（isQuotaExceededError=true）では常に alert() を出すが、非quota は
//   notifyError() に委譲しており、notifyError は「登録タブが見えていない場合のみ alert」する設計だった。
//   そのため登録タブ表示中に非quota 失敗（循環参照による JSON.stringify TypeError / SecurityError /
//   プライベートブラウズ等）が起きると alert が出ず、保存失敗が静かに見逃される（Issue #278・T6）。
//   本 PR で notifyError に任意引数 alwaysAlert を追加し、save() が true を渡すことで、表示中タブに
//   関わらず非quota 失敗でも alert を確実に 1 回出すようにした（quota と認知強度を揃える）。
//
// 観点:
//   A. 循環参照 state（Issue #278 再現 T6）・登録タブ表示中 → alert がちょうど 1 回・バックアップ促し文言・
//      画面内バナー（alert-err）も維持。
//   B. setItem が非quota（SecurityError）throw・登録タブ表示中 → alert がちょうど 1 回・バナー維持。
//   C. quota（QuotaExceededError）回帰 → 従来どおり alert がちょうど 1 回（quota 文言）・バナーは warn。
//   D. 二重 alert なし: 登録タブ非表示で非quota 失敗 → alert はちょうど 1 回（save 側 alert と notifyError
//      alert の二重発火がない）。
//   E. dedup 維持: 同一メッセージの非quota 失敗を 3 秒以内に 2 連発 → alert は合計 1 回（2 回目は dedup で抑止）・
//      画面内バナーは維持。
//   F. notifyError 後方互換: alwaysAlert を渡さない既存呼出は従来どおり（登録タブ表示中は alert 抑止）。

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
  const alertCalls = [];
  const alertSpy = function(msg){ alertCalls.push(String(msg)); };
  const consoleMock = { log:function(){}, warn:function(){}, error:function(){} };
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       save:save,
       notifyError:notifyError,
       isQuotaExceededError:isQuotaExceededError,
       _setState:function(s){ state=s; },
       _getRegMsgHtml:function(){ return document.getElementById('reg-msg').innerHTML; },
       _setRegVisible:function(v){ document.getElementById('pane-reg').style.display = v ? '' : 'none'; },
       _resetLastErr:function(){ _lastErr={text:'',at:0}; },
       _resetRegMsg:function(){ document.getElementById('reg-msg').innerHTML=''; }
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    alertSpy, function(){return true;}, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, consoleMock, Promise, function(){}
  );
  api._ctx = ctx;
  api._alertCalls = alertCalls;
  api._clearAlert = function(){ alertCalls.length=0; };
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_save_nonquota_alert_278.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const env = loadEnv(targetPath);
const ls = env._ctx.localStorage;
const origSetItem = ls.setItem;
function failSetItem(name,code){ ls.setItem = function(){ var e=new Error('blocked'); e.name=name||'SecurityError'; if(code!==undefined)e.code=code; throw e; }; }
function okSetItem(){ ls.setItem = origSetItem; }

function normalState(){
  return { players:{A:[],B:[]}, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false, report:{} };
}
function circularState(){
  var s = normalState();
  s.self = s; // 循環参照 → JSON.stringify が TypeError（Issue #278 T6）
  return s;
}
function resetCase(regVisible){
  env._resetLastErr();
  env._resetRegMsg();
  env._clearAlert();
  env._setRegVisible(regVisible);
}

// ============================================================
// A. 循環参照 state（Issue #278 再現 T6）・登録タブ表示中
// ============================================================
okSetItem();
resetCase(true);
env._setState(circularState());
env.save();
assert(env._alertCalls.length===1, 'A1 循環参照の非quota失敗・登録タブ表示中でも alert がちょうど 1 回（Issue #278 是正）');
assert(env._alertCalls.length>=1 && env._alertCalls[0].indexOf('バックアップ')>=0, 'A2 alert 文言は原因＋バックアップ促し（既存文言踏襲）');
assert(env._getRegMsgHtml().indexOf('alert-err')>=0, 'A3 画面内バナー（showMsg err）も維持される');

// ============================================================
// B. setItem 非quota（SecurityError）throw・登録タブ表示中
// ============================================================
resetCase(true);
env._setState(normalState());
failSetItem('SecurityError');
env.save();
assert(env._alertCalls.length===1, 'B1 SecurityError の非quota失敗・登録タブ表示中でも alert がちょうど 1 回');
assert(env._getRegMsgHtml().indexOf('alert-err')>=0, 'B2 画面内バナー（showMsg err）も維持される');

// ============================================================
// C. quota（QuotaExceededError）回帰: 従来どおり alert（quota 文言）・バナーは warn
// ============================================================
resetCase(true);
env._setState(normalState());
failSetItem('QuotaExceededError',22);
env.save();
assert(env._alertCalls.length===1, 'C1 quota 失敗は従来どおり alert がちょうど 1 回（回帰なし）');
assert(env._alertCalls.length>=1 && env._alertCalls[0].indexOf('保存容量の上限')>=0, 'C2 quota の alert 文言は容量超過（非quota 文言と混同しない）');
assert(env._getRegMsgHtml().indexOf('alert-warn')>=0, 'C3 quota は notifySaveWarning 経由で showMsg(\'warn\')（不変）');

// ============================================================
// D. 二重 alert なし: 登録タブ非表示で非quota 失敗 → alert はちょうど 1 回
// ============================================================
resetCase(false);
env._setState(normalState());
failSetItem('SecurityError');
env.save();
assert(env._alertCalls.length===1, 'D1 登録タブ非表示の非quota失敗でも alert は 1 回（save 側と notifyError の二重 alert がない）');

// ============================================================
// E. dedup 維持: 同一メッセージ 3 秒以内 2 連発 → alert は合計 1 回・バナーは維持
// ============================================================
resetCase(true);
env._setState(normalState());
failSetItem('SecurityError');
env.save();
env.save();
assert(env._alertCalls.length===1, 'E1 同一メッセージ 3 秒以内 2 連発で alert は合計 1 回（_lastErr dedup を壊さない）');
assert(env._getRegMsgHtml().indexOf('alert-err')>=0, 'E2 dedup 中でも画面内バナーは毎回出る（showMsg は dedup の外）');

// ============================================================
// F. notifyError 後方互換: alwaysAlert を渡さない既存呼出は従来どおり
// ============================================================
okSetItem();
resetCase(true);
env.notifyError('X-非常時メッセージ', true);
assert(env._alertCalls.length===1, 'F1 notifyError(text,true) は登録タブ表示中でも alert を出す');

resetCase(true);
env.notifyError('Y-非常時メッセージ');
assert(env._alertCalls.length===0, 'F2 notifyError(text) は従来どおり登録タブ表示中は alert を抑止（後方互換）');

resetCase(false);
env.notifyError('Z-非常時メッセージ');
assert(env._alertCalls.length===1, 'F3 notifyError(text) は登録タブ非表示なら従来どおり alert（後方互換）');

okSetItem();
console.log('');
console.log('  SAVE-NONQUOTA-ALERT-001 (Issue #278) テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
