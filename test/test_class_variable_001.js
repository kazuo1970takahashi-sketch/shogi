#!/usr/bin/env node
// CLASS-VARIABLE-001 (CV-1): 「A/B 固定をやめ 3 クラス以上に増やせる」第一スライスの受入テスト。
//   本スライスのスコープ＝① クラス管理UI（追加/改名/削除）② 削除ガード ③ 登録プルダウン inp-class の
//   class 駆動化 ④ 既存 A/B 動作の後方互換維持。データモデル（normalizeState/normalizeClasses/
//   emptyClassDict）・保存復元・ペアリング・集計・印刷は既存（class 駆動・本 PR で改変しない）。
//
//   受入条件（テスト要件）:
//     G1. inp-class の class 駆動化（populateClassSelect が state.classes から option 生成・選択保持・名前反映）
//     G2. クラス追加（addClass：id 採番 C..Z / dict 初期化 / 既定名）
//     G3. ★ 3 クラス目（C）に参加者を登録できる（addClass→inp-class='C'→addPlayer→state.players.C に入る）
//     G4. クラス改名（renameClass：名前更新・空名拒否・受付見出し/プルダウンへ反映）
//     G5. 削除ガード（canDeleteClass：A/B builtin 不可 / 開始済み不可 / 在籍者あり不可 / 空 C は可）
//     G6. クラス削除（removeClass：空 C は削除・dict 削除 / A/B・開始済み・在籍ありは不可）
//     G7. 後方互換（classes 無しは A/B 既定 / allRegisteredPlayers は A/B のみなら従来同一・C 横断重複検知）
//     G8. 保存→reload 後も追加クラス C と登録参加者・改名が維持される
//     G9. renderClassManager（クラス毎に行描画・削除ボタン disabled 制御）
//   データは完全架空のみ（架空 …）。新 schema は足さない（既存 classes/players/pairings/results のみ）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_class_variable_001.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（test_start_frp_ux_001.js と同方針：createElement/appendChild を実体保持）。
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
      style:{}, _attrs:{}, _innerHTML:'', childNodes:[], parentNode:null,
      appendChild:function(c){ if(c)c.parentNode=this; this.childNodes.push(c); return c; },
      insertBefore:function(c){ if(c)c.parentNode=this; this.childNodes.unshift(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); if(c)c.parentNode=null; return c; },
      remove:function(){ if(this.parentNode){ var i=this.parentNode.childNodes.indexOf(this); if(i>=0)this.parentNode.childNodes.splice(i,1); this.parentNode=null; } },
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
      set innerHTML(v){ this._innerHTML=String(v); if(v===''){ for(var i=0;i<this.childNodes.length;i++)this.childNodes[i].parentNode=null; this.childNodes=[]; } }
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

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function serialize(node){
  if(node==null)return '';
  if(node.nodeType===3)return esc(node.textContent);
  var tag=String(node.tagName||'').toLowerCase(), inner='', ch=node.childNodes||[];
  for(var i=0;i<ch.length;i++)inner+=serialize(ch[i]);
  return '<'+tag+'>'+inner+'</'+tag+'>';
}

// opts.promptValue で prompt 戻り値を固定（null=cancel も可）。opts.confirm で confirm 戻り値を固定（既定 true）。
function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  const promptState = { value: ('promptValue' in opts) ? opts.promptValue : '' };
  const alerts = [];
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       save:save, load:load, STORAGE_KEY:STORAGE_KEY,
       addClass:addClass, renameClass:renameClass, removeClass:removeClass,
       canDeleteClass:canDeleteClass, nextClassId:nextClassId, classHasPlayers:classHasPlayers,
       allRegisteredPlayers:allRegisteredPlayers, getRegistrationClassList:getRegistrationClassList,
       populateClassSelect:populateClassSelect, renderClassManager:renderClassManager,
       regClassNameId:regClassNameId, renderRegList:renderRegList,
       addPlayer:addPlayer, isClassStarted:isClassStarted, setClassStarted:setClassStarted,
       getCurrentlyRegisteredMemberIds:getCurrentlyRegisteredMemberIds, verifyStatePersisted:verifyStatePersisted,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const promptFn = function(){ return promptState.value; };
  const confirmFn = function(){ return ('confirm' in opts) ? opts.confirm : true; };
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){} };
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(m){ alerts.push(m); }, confirmFn, promptFn,
    function(){}, ctx.Blob, ctx.URL, consoleMock, Promise, function(){}
  );
  api._ctx = ctx;
  api._alerts = alerts;
  api._setPromptValue = function(v){ promptState.value = v; };
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空 state：A=2名・B=2名（既定 A/B のみ）。
function fxAB(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

function optionPairs(selNode){
  var out=[];
  var ch=selNode.childNodes||[];
  for(var i=0;i<ch.length;i++){ out.push({value:ch[i].value, text:ch[i].textContent}); }
  return out;
}

// ============================================================
// G1. inp-class の class 駆動化（populateClassSelect）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxAB()));
  env.populateClassSelect();
  const sel = env._ctx.document.getElementById('inp-class');
  const opts = optionPairs(sel);
  assert(opts.length===2, 'G1-1 A/B 状態では option は2つ');
  assert(opts[0].value==='A' && opts[1].value==='B', 'G1-2 option の value は A,B（state.classes 順）');
  assert(opts[0].text==='Aクラス' && opts[1].text==='Bクラス', 'G1-3 option の表示名は state.classes[].name');

  // C を追加すると option が3つになり C を含む
  env.addClass('Cクラス');
  const opts2 = optionPairs(env._ctx.document.getElementById('inp-class'));
  assert(opts2.length===3 && opts2[2].value==='C', 'G1-4 クラス追加後は option に C が増える');

  // 現在の選択値が有効なら保持
  sel.value='B';
  env.populateClassSelect();
  assert(sel.value==='B', 'G1-5 現在の選択値(B)が有効なら populateClassSelect 後も保持される');

  // 無効な選択値は先頭クラスへフォールバック
  sel.value='ZZZ';
  env.populateClassSelect();
  assert(sel.value==='A', 'G1-6 無効な選択値は先頭クラス(A)へフォールバック');
}

// ============================================================
// G2. クラス追加（addClass）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxAB()));
  const id = env.addClass('Cクラス');
  const st = env._getState();
  assert(id==='C', 'G2-1 最初の追加 classId は C（A/B の次）');
  assert(st.classes.length===3 && st.classes[2].id==='C', 'G2-2 state.classes に C が push される');
  assert(st.classes[2].name==='Cクラス', 'G2-3 指定した名前が入る');
  assert(st.classes[2].started===false, 'G2-4 追加直後は started=false');
  assert(Array.isArray(st.players.C) && st.players.C.length===0, 'G2-5 players.C が空配列で初期化');
  assert(Array.isArray(st.pairings.C) && st.pairings.C.length===0, 'G2-6 pairings.C が空配列で初期化');
  assert(Array.isArray(st.results.C) && st.results.C.length===0, 'G2-7 results.C が空配列で初期化');

  // 連番採番：2回目は D
  const id2 = env.addClass('');
  assert(id2==='D', 'G2-8 2回目の追加 classId は D（連番）');
  assert(env._getState().classes[3].name==='Dクラス', 'G2-9 空名は "{id}クラス" が既定名');

  // nextClassId は state を mutate しない（pure 読み取り）
  const before = env._getState().classes.length;
  const peek = env.nextClassId();
  assert(peek==='E' && env._getState().classes.length===before, 'G2-10 nextClassId は次 id(E) を返すが state を変えない');
}

// ============================================================
// G3. ★ 3 クラス目（C）に参加者を登録できる（本 Issue の中核要件）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxAB()));
  env.addClass('Cクラス'); // C 追加
  const doc = env._ctx.document;
  doc.getElementById('inp-class').value = 'C';
  doc.getElementById('inp-name').value = '架空三郎';
  doc.getElementById('inp-yomi').value = '';
  env.addPlayer();
  const st = env._getState();
  assert(st.players.C.length===1, 'G3-1 ★ C クラスに参加者が1名登録される');
  assert(st.players.C[0].name==='架空三郎', 'G3-2 登録された参加者の氏名が一致');
  assert(st.players.C[0].cls==='C', 'G3-3 登録された参加者の cls は C');
  assert(st.players.C[0].entry_no===1, 'G3-4 C クラス内の entry_no は 1 から採番');
  assert(st.players.A.length===2 && st.players.B.length===2, 'G3-5 A/B の参加者は影響を受けない');

  // 続けて2人目も C に登録できる
  doc.getElementById('inp-class').value = 'C';
  doc.getElementById('inp-name').value = '架空四郎';
  env.addPlayer();
  assert(env._getState().players.C.length===2, 'G3-6 C クラスへ続けて2人目も登録できる');
  assert(env._getState().players.C[1].entry_no===2, 'G3-7 2人目の entry_no は 2');
}

// ============================================================
// G4. クラス改名（renameClass）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxAB()));
  // A を改名（A/B も改名は可・永続する）
  const r1 = env.renameClass('A','上級');
  assert(r1===true && env._getState().classes[0].name==='上級', 'G4-1 A を「上級」に改名できる');
  // 受付見出し（a-name span）に反映
  env.renderRegList();
  assert(env._ctx.document.getElementById('a-name').textContent==='上級', 'G4-2 受付見出し a-name に改名が反映される');
  // 登録プルダウンにも反映
  assert(optionPairs(env._ctx.document.getElementById('inp-class'))[0].text==='上級', 'G4-3 inp-class の option 表示名にも反映される');
  // 追加クラス C の改名
  env.addClass('Cクラス');
  const r2 = env.renameClass('C','初級');
  assert(r2===true && env.getRegistrationClassList()[2].name==='初級', 'G4-4 追加クラス C も改名できる');
  // 空名は拒否（変更なし）
  const r3 = env.renameClass('C','   ');
  assert(r3===false && env.getRegistrationClassList()[2].name==='初級', 'G4-5 空名（空白のみ）は拒否され名前は変わらない');
  // 未知クラスは false
  assert(env.renameClass('ZZZ','x')===false, 'G4-6 未知 classId の改名は false');
}

// ============================================================
// G5. 削除ガード（canDeleteClass）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxAB()));
  assert(env.canDeleteClass('A').ok===false && env.canDeleteClass('A').reason==='builtin', 'G5-1 A は builtin で削除不可');
  assert(env.canDeleteClass('B').ok===false && env.canDeleteClass('B').reason==='builtin', 'G5-2 B は builtin で削除不可');
  // 空の C は削除可
  env.addClass('Cクラス');
  assert(env.canDeleteClass('C').ok===true, 'G5-3 空・未開始の C は削除可');
  // C に在籍者を入れると不可
  env._getState().players.C.push({id:'c1',name:'架空五郎',cls:'C',member:'member',grade:'ippan',entry_no:1});
  assert(env.canDeleteClass('C').ok===false && env.canDeleteClass('C').reason==='hasPlayers', 'G5-4 在籍者ありの C は削除不可（hasPlayers）');
  // 在籍者を消し、開始済みにすると不可
  env._getState().players.C.length=0;
  env.setClassStarted('C',true);
  assert(env.canDeleteClass('C').ok===false && env.canDeleteClass('C').reason==='started', 'G5-5 開始済みの C は削除不可（started）');
}

// ============================================================
// G6. クラス削除（removeClass）
// ============================================================
{
  const env = loadEnv({confirm:true});
  env._setState(env.normalizeState(fxAB()));
  env.addClass('Cクラス');
  const before = env._getState().classes.length;
  const ok1 = env.removeClass('C');
  const st = env._getState();
  assert(ok1===true, 'G6-1 空・未開始の C は removeClass が成功する');
  assert(st.classes.length===before-1, 'G6-2 state.classes から C が1件減る');
  assert(!st.classes.some(function(c){return c.id==='C';}), 'G6-3 classes に C が存在しない');
  assert(!('C' in st.players) && !('C' in st.pairings) && !('C' in st.results), 'G6-4 players/pairings/results の C dict が削除される');
  // 削除後 inp-class から C が消える
  assert(!optionPairs(env._ctx.document.getElementById('inp-class')).some(function(o){return o.value==='C';}), 'G6-5 削除後 inp-class の option から C が消える');

  // A/B は builtin ガードで削除不可
  assert(env.removeClass('A')===false && env._getState().classes.some(function(c){return c.id==='A';}), 'G6-6 A は removeClass しても削除されない（builtin）');

  // 在籍者ありの C は削除不可
  const env2 = loadEnv({confirm:true});
  env2._setState(env2.normalizeState(fxAB()));
  env2.addClass('Cクラス');
  env2._getState().players.C.push({id:'c1',name:'架空六郎',cls:'C',member:'member',grade:'ippan',entry_no:1});
  assert(env2.removeClass('C')===false && env2._getState().classes.some(function(c){return c.id==='C';}), 'G6-7 在籍者ありの C は削除されない');

  // 開始済みの C は削除不可
  const env3 = loadEnv({confirm:true});
  env3._setState(env3.normalizeState(fxAB()));
  env3.addClass('Cクラス');
  env3.setClassStarted('C',true);
  assert(env3.removeClass('C')===false && env3._getState().classes.some(function(c){return c.id==='C';}), 'G6-8 開始済みの C は削除されない');
}

// ============================================================
// G7. 後方互換（A/B 既定 + allRegisteredPlayers 汎用化）
// ============================================================
{
  // classes 無しの旧データは A/B 既定（normalizeState 既存挙動）
  const env = loadEnv();
  const norm = env.normalizeState({players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  assert(norm.classes.length>=2 && norm.classes[0].id==='A' && norm.classes[1].id==='B', 'G7-1 classes 無しデータは A/B 既定（後方互換）');

  // allRegisteredPlayers：A/B のみなら従来の concat(A,B) と同一
  env._setState(env.normalizeState(fxAB()));
  const all = env.allRegisteredPlayers();
  assert(all.length===4, 'G7-2 A/B のみなら allRegisteredPlayers は A+B の4名（従来同一）');

  // C 追加 + C に在籍 → allRegisteredPlayers は C も横断
  env.addClass('Cクラス');
  env._getState().players.C.push({id:'c1',name:'架空七郎',cls:'C',member:'member',grade:'ippan',entry_no:1});
  assert(env.allRegisteredPlayers().length===5, 'G7-3 C 在籍も含め全クラス横断で集約される');

  // 重複名チェックの class 横断：C にいる名前は A への登録時も弾かれる
  const env2 = loadEnv();
  env2._setState(env2.normalizeState(fxAB()));
  env2._getState().players.A.length=0; env2._getState().players.B.length=0;
  env2.addClass('Cクラス');
  env2._getState().players.C.push({id:'c1',name:'架空重複',cls:'C',member:'member',grade:'ippan',entry_no:1});
  const doc2 = env2._ctx.document;
  doc2.getElementById('inp-class').value='A';
  doc2.getElementById('inp-name').value='架空重複';
  doc2.getElementById('inp-yomi').value='';
  env2.addPlayer();
  assert(env2._getState().players.A.length===0, 'G7-4 C に既にいる氏名は A への登録時も重複として弾かれる（class 横断）');
}

// ============================================================
// G8. 保存→reload 後も追加クラス C・登録参加者・改名が維持される
// ============================================================
{
  const env1 = loadEnv();
  env1._setState(env1.normalizeState(fxAB()));
  env1.addClass('Cクラス');
  env1.renameClass('C','初級');
  const doc1 = env1._ctx.document;
  doc1.getElementById('inp-class').value='C';
  doc1.getElementById('inp-name').value='架空八郎';
  doc1.getElementById('inp-yomi').value='';
  env1.addPlayer();
  const savedJson = env1._ctx.localStorage.getItem(env1.STORAGE_KEY);
  assert(!!savedJson, 'G8-0 前提：保存 JSON が存在する');

  const env2 = loadEnv();
  env2._ctx.localStorage.setItem(env2.STORAGE_KEY, savedJson);
  env2.load();
  const st = env2._getState();
  assert(st.classes.some(function(c){return c.id==='C';}), 'G8-1 reload 後も追加クラス C が維持される');
  const cClass = st.classes.filter(function(c){return c.id==='C';})[0];
  assert(cClass && cClass.name==='初級', 'G8-2 reload 後も改名（初級）が維持される');
  assert(Array.isArray(st.players.C) && st.players.C.length===1 && st.players.C[0].name==='架空八郎', 'G8-3 reload 後も C の登録参加者が維持される');
}

// ============================================================
// G9. renderClassManager（行描画・削除ボタン disabled 制御）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxAB()));
  env.addClass('Cクラス');
  env.renderClassManager();
  const host = env._ctx.document.getElementById('class-manager-list');
  const rows = host.childNodes;
  assert(rows.length===3, 'G9-1 クラス数（A/B/C）だけ行が描画される');
  // 各行の最後のボタン＝削除ボタン。A/B は disabled、空 C は有効。
  function delBtnOf(row){ var ch=row.childNodes; return ch[ch.length-1]; }
  assert(delBtnOf(rows[0]).disabled===true, 'G9-2 A の削除ボタンは disabled（builtin）');
  assert(delBtnOf(rows[1]).disabled===true, 'G9-3 B の削除ボタンは disabled（builtin）');
  assert(delBtnOf(rows[2]).disabled!==true, 'G9-4 空・未開始の C の削除ボタンは有効');
  // C に在籍させると削除ボタンが disabled になる
  env._getState().players.C.push({id:'c1',name:'架空九郎',cls:'C',member:'member',grade:'ippan',entry_no:1});
  env.renderClassManager();
  assert(delBtnOf(env._ctx.document.getElementById('class-manager-list').childNodes[2]).disabled===true, 'G9-5 在籍者ありの C は削除ボタンが disabled になる');
}

// ============================================================
// G10. CV-1 Codex BLOCK 対応（P2×2）: C 登録解禁後の class 横断
//   P2-1 getCurrentlyRegisteredMemberIds（member_id 重複を全クラスで検知）
//   P2-2 verifyStatePersisted（C 参加者の名前編集/一括編集の保存確認が false negative にならない）
//   いずれも A/B のみ時は従来と同一結果（後方互換）。
// ============================================================

// 架空 state：A=2名(うち a1 のみ member_id)・B=1名(member_id)・C=1名(member_id)。
function fxMemberIds(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'',member_id:'m-a1'},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:'',member_id:'m-b1'}
    ],C:[
      {id:'c1',name:'架空三郎',cls:'C',member:'member',grade:'ippan',entry_no:1,yomi:'',member_id:'m-c1'}
    ]},
    rounds:4, pairings:{A:[],B:[],C:[]}, results:{A:[],B:[],C:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false},{id:'C',name:'Cクラス',started:false}],
    report:{}
  };
}

// P2-1: member_id 収集が全クラス横断
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxMemberIds()));
  const st = env._getState();
  assert(st.players.C && st.players.C.length===1 && st.players.C[0].member_id==='m-c1', 'G10-0 前提：C 参加者と member_id が維持される');
  const ids = env.getCurrentlyRegisteredMemberIds();
  assert(ids.indexOf('m-c1')>=0, 'G10-1 [P2-1] C 登録済み会員の member_id が収集される（重複見落とし解消）');
  assert(ids.indexOf('m-a1')>=0 && ids.indexOf('m-b1')>=0, 'G10-2 [P2-1] A・B の member_id も収集される');
  assert(ids.length===3, 'G10-3 [P2-1] member_id 未保持(a2)は含めない＝計3件');
}

// P2-1 後方互換: A/B のみなら従来 concat(A,B) と同一結果・順序
{
  const env = loadEnv();
  const fx = fxMemberIds();
  delete fx.players.C; delete fx.pairings.C; delete fx.results.C;
  fx.classes = fx.classes.filter(function(c){return c.id!=='C';});
  env._setState(env.normalizeState(fx));
  const ids = env.getCurrentlyRegisteredMemberIds();
  assert(ids.length===2 && ids[0]==='m-a1' && ids[1]==='m-b1', 'G10-4 [P2-1] A/B のみ時は従来同一（[m-a1,m-b1] の順）');
}

// P2-2: C 参加者の保存確認が成功（false negative にならない）
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxMemberIds()));
  env.save();
  assert(!!env._ctx.localStorage.getItem(env.STORAGE_KEY), 'G10-5 前提：state が localStorage に保存される');
  assert(env.verifyStatePersisted('c1','架空三郎')===true, 'G10-6 [P2-2] C 参加者の保存確認が true（誤「保存未確認」警告が出ない）');
  assert(env.verifyStatePersisted('c1','別の名前')===false, 'G10-7 [P2-2] 名前不一致は従来どおり false');
}

// P2-2 後方互換: A 参加者の保存確認は従来どおり true・不在 id は false
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxMemberIds()));
  env.save();
  assert(env.verifyStatePersisted('a1','架空太郎')===true, 'G10-8 [P2-2] A 参加者の保存確認は従来どおり true（後方互換）');
  assert(env.verifyStatePersisted('zzz','架空太郎')===false, 'G10-9 [P2-2] 存在しない id は false');
}

console.log('');
console.log('  CLASS-VARIABLE-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0)process.exit(1);
