#!/usr/bin/env node
// QA-BRANCH-MASTER-SCHEMA-GUARD-275 (Issue #275) — 支部マスタ schema_version 不一致の無警告破棄を是正。
//
// 背景:
//   normalizeBranchMaster() は未知の有効な schema_version（例 2＝新しい版・端末間の版差）を受け取ると
//   createEmptyBranchMaster() を返していた。corruption フラグが無いため saveBranchMaster/sync の
//   保存スキップ保護が効かず、空マスタが localStorage の良データを上書きし得た（＝全 members サイレント破棄）。
//
// 修正:
//   未知 schema_version は破棄せず、空マスタに _loaded_with_corruption=true を付けて返す
//   （loadBranchMaster の parse 失敗 catch と同じ保全パターン）。前方互換の移行は入れない。
//
// 観点:
//   U  normalizeBranchMaster: 未知 schema_version → 空 members + _loaded_with_corruption===true。
//   L  loadBranchMaster: stored が未知 schema_version → 空 members + フラグ（読込時も同様）。
//   S  syncBranchMasterOnSave: フラグ由来の空マスタは保存スキップ＝stored の元 members を温存（上書きしない）。
//   R  非回帰: 正常 schema_version=1 / schema_version 不在 → members 保持・フラグ無し。
//   R2 非回帰: parse 失敗 catch は従来どおり 空 + フラグ（既存保全を壊さない）。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- 軽量 DOM / localStorage mock（test_save_branch_master_failure_signal.js と同型）----
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
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};
     return {
       normalizeBranchMaster:normalizeBranchMaster,
       loadBranchMaster:loadBranchMaster,
       saveBranchMaster:saveBranchMaster,
       syncBranchMasterOnSave:syncBranchMasterOnSave,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       BRANCH_MASTER_SCHEMA_VERSION:BRANCH_MASTER_SCHEMA_VERSION
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, consoleMock, Promise, function(){},
    {clipboard:null, userAgent:'node-test'}
  );
  api._ctx = ctx;
  api._warnCalls = warnCalls;
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_branch_master_schema_guard_275.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const env = loadEnv(targetPath);
const ls = env._ctx.localStorage;
function clearStorage(){ for(var k in ls._){ if(Object.prototype.hasOwnProperty.call(ls._,k))delete ls._[k]; } }

// ---- 架空 members（PII無し）----
function twoMembers(){
  return [
    { id:'m1', name:'架空一郎', yomi:'かくういちろう', member:'member', grade:'ippan' },
    { id:'m2', name:'架空二郎', yomi:'かくうじろう', member:'member', grade:'ippan' }
  ];
}

// ============================================================
// U. normalizeBranchMaster: 未知 schema_version は破棄せずフラグ付き空マスタ
// ============================================================
(function(){
  const out = env.normalizeBranchMaster({schema_version:2, members:twoMembers()});
  assert(out && Array.isArray(out.members), 'U1 未知 schema_version でも落ちず members 配列を返す');
  assert(out.members.length===0, 'U2 未知 schema_version の members は空（読めないため）');
  assert(out._loaded_with_corruption===true, 'U3 未知 schema_version は _loaded_with_corruption=true（保存スキップ保護）');
  assert(out.schema_version===env.BRANCH_MASTER_SCHEMA_VERSION, 'U4 戻り値の schema_version は現行版に正規化');

  // 他の未知有効値（3 / 999）でも同様
  const out3 = env.normalizeBranchMaster({schema_version:3, members:twoMembers()});
  assert(out3.members.length===0 && out3._loaded_with_corruption===true, 'U5 schema_version=3 も空+フラグ');
  const out999 = env.normalizeBranchMaster({schema_version:999, members:[]});
  assert(out999._loaded_with_corruption===true, 'U6 schema_version=999（members空）も corruption フラグ付与');
})();

// ============================================================
// L. loadBranchMaster: stored が未知 schema_version → 空+フラグ（読込経路）
// ============================================================
(function(){
  clearStorage();
  const stored = JSON.stringify({schema_version:2, members:twoMembers()});
  ls.setItem(env.BRANCH_MASTER_KEY, stored);
  const m = env.loadBranchMaster();
  assert(m.members.length===0, 'L1 stored=schema_version2 のロードは members 空');
  assert(m._loaded_with_corruption===true, 'L2 ロード結果に _loaded_with_corruption=true');
  // ロード自体は stored を書き換えない
  assert(ls.getItem(env.BRANCH_MASTER_KEY)===stored, 'L3 loadBranchMaster は stored を上書きしない（元の2件を保持）');
})();

// ============================================================
// S. syncBranchMasterOnSave: フラグ由来の空マスタは保存スキップ＝stored 温存
// ============================================================
(function(){
  clearStorage();
  const stored = JSON.stringify({schema_version:2, updated_at:'2099-01-01T00:00:00.000Z', members:twoMembers()});
  ls.setItem(env.BRANCH_MASTER_KEY, stored);

  let threw=false;
  try{ env.syncBranchMasterOnSave(); }catch(e){ threw=true; }
  assert(!threw, 'S1 syncBranchMasterOnSave が例外で落ちない');

  // 自動同期は shogi_branch_master を上書きしない（元の schema_version2 / 2 members を温存）
  const after = ls.getItem(env.BRANCH_MASTER_KEY);
  assert(after===stored, 'S2 自動同期後も stored の元 members（schema_version2 / 2件）が温存され上書きされない');
  const reparsed = JSON.parse(after);
  assert(reparsed.schema_version===2 && reparsed.members.length===2, 'S3 温存データの中身（schema_version2 / members 2件）が無傷');
})();

// ============================================================
// R. 非回帰: 正常 schema_version=1 / 不在は members 保持・フラグ無し
// ============================================================
(function(){
  const v1 = env.normalizeBranchMaster({schema_version:1, members:twoMembers()});
  assert(v1.members.length===2, 'R1 schema_version=1 は members を保持（2件）');
  assert(!v1._loaded_with_corruption, 'R2 schema_version=1 に corruption フラグは付かない');

  // schema_version 不在 → 現行版に正規化され保持（L1497 経路、L1498 分岐に来ない）
  const noVer = env.normalizeBranchMaster({members:twoMembers()});
  assert(noVer.members.length===2, 'R3 schema_version 不在は現行版に正規化し members 保持');
  assert(!noVer._loaded_with_corruption, 'R4 schema_version 不在に corruption フラグは付かない');

  // schema_version が非数値（NaN）→ 現行版扱い（既存挙動）
  const nanVer = env.normalizeBranchMaster({schema_version:'x', members:twoMembers()});
  assert(nanVer.members.length===2 && !nanVer._loaded_with_corruption, 'R5 非数値 schema_version は現行版扱いで members 保持・フラグ無し');
})();

// ============================================================
// R2. 非回帰: parse 失敗 catch は従来どおり 空+フラグ（既存保全を壊さない）
// ============================================================
(function(){
  clearStorage();
  ls.setItem(env.BRANCH_MASTER_KEY, '{not valid json');
  const m = env.loadBranchMaster();
  assert(m.members.length===0 && m._loaded_with_corruption===true, 'R6 parse 失敗 raw は空+_loaded_with_corruption（既存保全）');
})();

console.log('PASS='+pass+' FAIL='+fail);
if(fail>0) process.exit(1);
