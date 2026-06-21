#!/usr/bin/env node
// CHARACTERIZATION: normalizeClasses（クラス配列の正規化・後方互換補完・純関数）。
//   Issue #283 Phase A deliverable 3。被覆マップで「直接 THIN（normalizeState 経由の間接被覆のみ）」
//   と判定された分岐を現状挙動として固定する。
//
//   対象（shogi_v4.html）: function normalizeClasses(raw)
//     - raw.classes 不在 → A/B 既定（raw.started を両方へ展開）
//     - raw.classes 有 → id-safety フィルタ + {id,name,started} 正規化 + A/B 互換補完
//     - 過渡期互換（spec §9.3）: raw.started=true かつ started:true が皆無 → 全 class へ started=true 展開
//     - appendMissingClassesFromDicts（spec §9.2）: players/pairings/results の dict key を class へ補完
//   入力は完全架空。shogi_v4.html は一切変更しない。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[], appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(){}, getAttribute:function(){ return null; }, addEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  var elements={};
  var docMock={ getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); }, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_char_normalize_classes_001.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return { normalizeClasses:normalizeClasses };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }
function byId(arr,id){ for(var i=0;i<arr.length;i++)if(arr[i].id===id)return arr[i]; return null; }
function ids(arr){ return arr.map(function(c){return c.id;}); }

const env = loadEnv();
const nc = env.normalizeClasses;

// ---- N0: classes 不在・started なし → A/B 既定（両方 started:false）----
(function(){
  var r = nc({});
  assert(ids(r).join(',')==='A,B', 'N0-1 classes 不在 → [A,B]');
  assert(byId(r,'A').started===false && byId(r,'B').started===false, 'N0-2 既定は両方 started:false');
  assert(byId(r,'A').name==='Aクラス' && byId(r,'B').name==='Bクラス', 'N0-3 既定名は {id}クラス');
})();

// ---- N1: classes 不在・started:true → A/B 既定（旧 v0/v1 互換で両方 started:true）----
(function(){
  var r = nc({started:true});
  assert(byId(r,'A').started===true && byId(r,'B').started===true, 'N1-1 classes 不在で started:true → A/B 両方 started:true');
})();

// ---- N2: classes 有 → name 保持・A/B 互換補完（不足側を started:false で push）----
(function(){
  var r = nc({classes:[{id:'A',name:'A級',started:true},{id:'C',name:'Cクラス',started:false}]});
  assert(ids(r).join(',')==='A,C,B', 'N2-1 入力順(A,C)の後ろに不足 B を補完 → [A,C,B]');
  assert(byId(r,'A').name==='A級', 'N2-2 既存 name(A級) は保持');
  assert(byId(r,'A').started===true && byId(r,'C').started===false && byId(r,'B').started===false, 'N2-3 started は個別保持・補完 B は false');
})();

// ---- N3: name 欠落 → {id}クラス・started の真偽強制（=== true のみ true）----
(function(){
  var r = nc({classes:[{id:'C'},{id:'D',started:1},{id:'E',started:'true'}]});
  assert(byId(r,'C').name==='Cクラス', 'N3-1 name 欠落 → {id}クラス');
  assert(byId(r,'D').started===false, 'N3-2 started:1（非 true）→ false に正規化');
  assert(byId(r,'E').started===false, 'N3-3 started:"true"（文字列）→ false に正規化');
})();

// ---- N4: 過渡期互換（spec §9.3）raw.started=true かつ started:true 皆無 → 全 class へ started 展開 ----
(function(){
  var r = nc({started:true, classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false},{id:'C',name:'Cクラス',started:false}]});
  assert(byId(r,'A').started===true && byId(r,'B').started===true && byId(r,'C').started===true, 'N4-1 started:true 皆無時は全 class へ started=true 展開');
})();

// ---- N5: §9.3 は「皆無」時のみ。既に started:true が1つでもあれば展開しない ----
(function(){
  var r = nc({started:true, classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}]});
  assert(byId(r,'A').started===true && byId(r,'B').started===false, 'N5-1 started:true が既存なら未開始クラスは false のまま（誤展開しない）');
})();

// ---- N6: appendMissingClassesFromDicts（spec §9.2）players/pairings/results の dict key を補完 ----
(function(){
  var r = nc({classes:[{id:'A',name:'Aクラス',started:false}], players:{C:[]}, pairings:{D:[]}, results:{E:[]}, started:false});
  var idset = ids(r);
  assert(idset.indexOf('C')>=0 && idset.indexOf('D')>=0 && idset.indexOf('E')>=0, 'N6-1 players/pairings/results の dict key(C,D,E)を class へ補完');
  assert(byId(r,'C').started===false && byId(r,'C').name==='Cクラス', 'N6-2 補完 class は started:false・{id}クラス');
  assert(idset.indexOf('A')>=0 && idset.indexOf('B')>=0, 'N6-3 A/B 互換補完も併存');
})();

// ---- N7: id-safety フィルタ（不正 classId は採用しない・DOM id 破綻防止）----
(function(){
  var r = nc({classes:[{id:'A B',name:'不正',started:false},{id:'C',name:'Cクラス',started:false}]});
  assert(byId(r,'A B')===null, 'N7-1 スペース入り不正 classId は除外される');
  assert(byId(r,'C')!==null && byId(r,'A')!==null && byId(r,'B')!==null, 'N7-2 正常 C と互換 A/B は残る');
})();

console.log('  normalizeClasses characterization テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
