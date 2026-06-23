#!/usr/bin/env node
// QA-MASTER-IMPORT-CORRUPTION-GUARD-329 (Issue #329) — 支部マスタ import の破損ガード抜けを是正。
//
// 背景:
//   normalizeBranchMaster() は未知の schema_version（例 2＝将来版・端末間の版差・手編集）を受け取ると
//   空マスタ + _loaded_with_corruption=true を返す（#275）。他4箇所（migration wizard / syncBranchMasterOnSave
//   / loadBranchMaster 等）はこのフラグを確認して保存をスキップするが、**マスタ import ハンドラ
//   processMasterImportText だけ未確認**だった。
//
//   B-01（上書き）: applyOverwriteImport({schema_version:2,...}) は newMaster._loaded_with_corruption=true でも
//     success:true。ハンドラがフラグを見ず confirm（「読込予定: 0名」）後に saveBranchMaster(空) → 既存全消失。
//   B-02（マージ）: 保存済みが未知 schema だと current=loadBranchMaster() が空+corruption。merge 結果＝import 側
//     のみを、フラグ未確認・confirm 無しで保存 → 旧会員が黙って消える（confirm が無いぶん特に危険）。
//
// 修正:
//   overwrite=result.newMaster／merge=current の _loaded_with_corruption を確認し、true なら保存せずエラー表示で
//   既存マスタを保持（syncBranchMasterOnSave / loadBranchMaster と同じ保全パターン）。
//
// 観点（ネガティブコントロール = 未修正 base では FAIL する保全アサーション）:
//   B1 overwrite: 既存2件 + 未知 schema(2) ファイル → 保存スキップ・既存2件温存・confirm 未到達・エラー表示。
//   B2 merge:     保存済み未知 schema(2)（中身2件）+ 正常ファイル → 保存スキップ・stored 温存・エラー表示。
//   R  非回帰: import ファイル側が未知 schema のマージは従来どおり no-op 安全（既存温存・成功扱い・エラー無し）。
//   R2 非回帰: overwrite 正常ファイル → 置換成功（confirm 到達・members 反映・成功通知・エラー無し）。
//   R3 非回帰: merge 正常ファイル（保存済みも正常）→ 統合成功（既存温存 + 新規追加・成功通知・エラー無し）。
//   P  純関数: applyOverwriteImport(未知)=success+corruption フラグ源 / applyMergeImport(未知ファイル,正常)=no-op。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- 軽量 DOM / localStorage mock（test_branch_master_schema_guard_275.js と同型）----
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
  const confirmCalls = [];
  const consoleMock = { log:function(){}, warn:function(){ warnCalls.push([].slice.call(arguments)); }, error:function(){} };
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  // confirm はデフォルト true（ユーザーが「置換に同意」した状況を模す）。破損ガードが効けば呼ばれないはず。
  const confirmMock = function(msg){ confirmCalls.push(String(msg)); return true; };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};
     return {
       processMasterImportText:processMasterImportText,
       applyOverwriteImport:applyOverwriteImport,
       applyMergeImport:applyMergeImport,
       normalizeBranchMaster:normalizeBranchMaster,
       loadBranchMaster:loadBranchMaster,
       saveBranchMaster:saveBranchMaster,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       BRANCH_MASTER_SCHEMA_VERSION:BRANCH_MASTER_SCHEMA_VERSION
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, confirmMock, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, consoleMock, Promise, function(){},
    {clipboard:null, userAgent:'node-test'}
  );
  api._ctx = ctx;
  api._warnCalls = warnCalls;
  api._confirmCalls = confirmCalls;
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_master_import_corruption_guard_329.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const env = loadEnv(targetPath);
const ls = env._ctx.localStorage;
function clearStorage(){ for(var k in ls._){ if(Object.prototype.hasOwnProperty.call(ls._,k))delete ls._[k]; } }
function storedMembers(){ var raw=ls.getItem(env.BRANCH_MASTER_KEY); if(!raw)return null; try{return JSON.parse(raw);}catch(e){return null;} }

// ---- 架空 members（PII無し）----
function twoMembers(){
  return [
    { id:'m1', name:'架空一郎', yomi:'かくういちろう', member:'member', grade:'ippan' },
    { id:'m2', name:'架空二郎', yomi:'かくうじろう', member:'member', grade:'ippan' }
  ];
}
function oneNewMember(){
  return [ { id:'m9', name:'架空九郎', yomi:'かくうくろう', member:'member', grade:'ippan' } ];
}
// setStatus キャプチャ（import モーダルのステータス欄相当）
function makeStatus(){ var calls=[]; var fn=function(s){ calls.push(String(s)); }; fn.calls=calls; return fn; }
// 成功通知（showMsg('...','ok')）は reg-msg 要素の innerHTML に 'alert-ok' として現れる
function regMsgHtml(){ return env._ctx.document.getElementById('reg-msg').innerHTML || ''; }
function resetRegMsg(){ env._ctx.document.getElementById('reg-msg').innerHTML=''; }

// ============================================================
// B1. overwrite: 既存2件 + 未知 schema(2) ファイル → 保存スキップ・既存温存・confirm 未到達・エラー表示
//     （未修正 base では既存が全消失 = ネガティブコントロール）
// ============================================================
(function(){
  clearStorage(); resetRegMsg();
  const good = JSON.stringify({schema_version:1, members:twoMembers()});
  ls.setItem(env.BRANCH_MASTER_KEY, good);
  const before = ls.getItem(env.BRANCH_MASTER_KEY);
  const confirmBefore = env._confirmCalls.length;

  const setStatus = makeStatus();
  let threw=false;
  try{ env.processMasterImportText(JSON.stringify({schema_version:2, members:twoMembers()}), 'overwrite', setStatus); }
  catch(e){ threw=true; }
  assert(!threw, 'B1-0 overwrite ハンドラが例外で落ちない');

  const after = storedMembers();
  assert(after && after.members.length===2, 'B1-1 既存 members 2件が温存される（ネガコン: 未修正 base では 0件 = 全消失）');
  assert(ls.getItem(env.BRANCH_MASTER_KEY)===before, 'B1-2 localStorage は一切書き換えられない（保存スキップ）');
  assert(env._confirmCalls.length===confirmBefore, 'B1-3 confirm に到達しない（誤解を招く「読込予定: 0名」を出さない）');
  assert(setStatus.calls.length>=1 && /非対応|読み込めません|schema_version/.test(setStatus.calls[setStatus.calls.length-1]), 'B1-4 エラー（非対応版）を setStatus で表示');
  assert(regMsgHtml().indexOf('alert-ok')<0, 'B1-5 成功通知（showMsg ok）は出さない');
})();

// ============================================================
// B2. merge: 保存済みが未知 schema(2)（中身2件）+ 正常ファイル → 保存スキップ・stored 温存・エラー表示
//     （未修正 base では confirm 無しで旧2件が消える = ネガティブコントロール）
// ============================================================
(function(){
  clearStorage(); resetRegMsg();
  // 保存済みマスタ自体が未知 schema（版差混入）。中身の2件はユーザーの資産で、失ってはならない。
  const storedUnknown = JSON.stringify({schema_version:2, updated_at:'2099-01-01T00:00:00.000Z', members:twoMembers()});
  ls.setItem(env.BRANCH_MASTER_KEY, storedUnknown);
  const confirmBefore = env._confirmCalls.length;

  const setStatus = makeStatus();
  let threw=false;
  try{ env.processMasterImportText(JSON.stringify({schema_version:1, members:oneNewMember()}), 'merge', setStatus); }
  catch(e){ threw=true; }
  assert(!threw, 'B2-0 merge ハンドラが例外で落ちない');

  assert(ls.getItem(env.BRANCH_MASTER_KEY)===storedUnknown, 'B2-1 stored（schema2 / 2件）が温存され上書きされない（ネガコン: 未修正 base では旧2件消失）');
  const reparsed = storedMembers();
  assert(reparsed && reparsed.schema_version===2 && reparsed.members.length===2, 'B2-2 温存データの中身が無傷（schema2 / members 2件）');
  assert(env._confirmCalls.length===confirmBefore, 'B2-3 merge は元々 confirm 無し（保存もしない＝静かな破壊を防ぐ）');
  assert(setStatus.calls.length>=1 && /非対応|読み込めません|マージを中止/.test(setStatus.calls[setStatus.calls.length-1]), 'B2-4 エラー（保存済みが非対応版）を setStatus で表示');
  assert(regMsgHtml().indexOf('alert-ok')<0, 'B2-5 成功通知（showMsg ok）は出さない');
})();

// ============================================================
// R. 非回帰: import ファイル側が未知 schema のマージ → 従来どおり no-op 安全
//    （保存済みが正常なら imported.members 空＝既存温存・成功扱い。修正でここを過剰ブロックしない）
// ============================================================
(function(){
  clearStorage(); resetRegMsg();
  const good = JSON.stringify({schema_version:1, members:twoMembers()});
  ls.setItem(env.BRANCH_MASTER_KEY, good);

  const setStatus = makeStatus();
  let threw=false;
  try{ env.processMasterImportText(JSON.stringify({schema_version:2, members:oneNewMember()}), 'merge', setStatus); }
  catch(e){ threw=true; }
  assert(!threw, 'R-0 ハンドラが例外で落ちない');

  const after = storedMembers();
  assert(after && after.members.length===2, 'R-1 既存2件は温存（未知ファイル側は no-op で追加されない）');
  assert(after && after.members.some(function(m){return m.id==='m9';})===false, 'R-2 未知 schema ファイルの新規 m9 は取り込まれない');
  const errLike = setStatus.calls.some(function(s){return /非対応|読み込めません|マージを中止/.test(s);});
  assert(!errLike, 'R-3 破損エラーは出さない（保存済みは正常なので過剰ブロックしない）');
  assert(regMsgHtml().indexOf('alert-ok')>=0, 'R-4 マージ成功通知（showMsg ok）が出る = 従来どおり成功扱い');
})();

// ============================================================
// R2. 非回帰: overwrite 正常ファイル → 置換成功（confirm 到達・members 反映・成功通知・エラー無し）
// ============================================================
(function(){
  clearStorage(); resetRegMsg();
  ls.setItem(env.BRANCH_MASTER_KEY, JSON.stringify({schema_version:1, members:oneNewMember()}));
  const confirmBefore = env._confirmCalls.length;

  const setStatus = makeStatus();
  env.processMasterImportText(JSON.stringify({schema_version:1, members:twoMembers()}), 'overwrite', setStatus);

  const after = storedMembers();
  assert(after && after.members.length===2, 'R2-1 正常ファイルで上書き → members 2件に置換');
  assert(after && after.members.some(function(m){return m.id==='m1';}) && after.members.some(function(m){return m.id==='m2';}), 'R2-2 置換後 members は import 内容（m1/m2）');
  assert(env._confirmCalls.length===confirmBefore+1, 'R2-3 正常時は confirm に到達する（破損ガードで早期 return しない）');
  const errLike = setStatus.calls.some(function(s){return /非対応|読み込めません|失敗|認識できません/.test(s);});
  assert(!errLike, 'R2-4 エラーは出さない');
  assert(regMsgHtml().indexOf('alert-ok')>=0, 'R2-5 成功通知（showMsg ok）が出る');
})();

// ============================================================
// R3. 非回帰: merge 正常ファイル（保存済みも正常）→ 統合成功（既存温存 + 新規追加・エラー無し）
// ============================================================
(function(){
  clearStorage(); resetRegMsg();
  ls.setItem(env.BRANCH_MASTER_KEY, JSON.stringify({schema_version:1, members:twoMembers()}));

  const setStatus = makeStatus();
  env.processMasterImportText(JSON.stringify({schema_version:1, members:oneNewMember()}), 'merge', setStatus);

  const after = storedMembers();
  assert(after && after.members.length===3, 'R3-1 正常マージ → 既存2 + 新規1 = 3件');
  assert(after && after.members.some(function(m){return m.id==='m9';}), 'R3-2 新規 m9 が追加される');
  const errLike = setStatus.calls.some(function(s){return /非対応|読み込めません|マージを中止/.test(s);});
  assert(!errLike, 'R3-3 エラーは出さない');
  assert(regMsgHtml().indexOf('alert-ok')>=0, 'R3-4 マージ成功通知（showMsg ok）が出る');
})();

// ============================================================
// P. 純関数: フラグ源（apply* 戻り値）の確認 — ハンドラが見るべき信号が正しく立つ/立たない
// ============================================================
(function(){
  // overwrite: 未知 schema ファイルは success:true だが newMaster._loaded_with_corruption=true（ハンドラが見る信号）
  const ow = env.applyOverwriteImport({schema_version:2, members:twoMembers()});
  assert(ow && ow.success===true, 'P1 applyOverwriteImport(未知) は success:true（フォーマットは branch_master）');
  assert(ow && ow.newMaster && ow.newMaster._loaded_with_corruption===true, 'P2 newMaster._loaded_with_corruption=true（B-01 でハンドラが確認すべき信号）');
  assert(ow && ow.newMaster && ow.newMaster.members.length===0, 'P3 未知 schema は空 members');

  // merge: 未知ファイル × 正常 current → working は current 維持・追加0（no-op）・結果に corruption フラグ無し
  const cur = env.normalizeBranchMaster({schema_version:1, members:twoMembers()});
  const mr = env.applyMergeImport({schema_version:2, members:oneNewMember()}, cur);
  assert(mr && mr.success===true, 'P4 applyMergeImport(未知ファイル, 正常current) は success:true');
  assert(mr && mr.newMaster && mr.newMaster.members.length===2, 'P5 未知ファイルは no-op（current の2件を維持）');
  assert(mr && mr.summary && mr.summary.added===0, 'P6 added=0（未知ファイルから新規追加されない）');
  assert(mr && mr.newMaster && !mr.newMaster._loaded_with_corruption, 'P7 正常 current 由来の結果に corruption フラグは付かない');
})();

console.log('PASS='+pass+' FAIL='+fail);
if(fail>0) process.exit(1);
