#!/usr/bin/env node
// A-5.1-SAVE-001: 参加者削除時の保存未確認検知 — 単体テスト
//
// テスト観点（A-5.1-SAVE-DESIGN-001 v0.1 §3.1 / 依頼書 §7 準拠）:
//   verifyPlayerAbsent:
//     1. 削除対象 id が localStorage に存在しない場合 true
//     2. 削除対象 id が localStorage に残っている場合 false
//     3. localStorage が空 / JSON 不可 / players 構造不正 で false
//     4. A/B クラス境界を誤判定しない
//   removePlayer フロー:
//     5. 通常削除後、verify true で warn が出ない / showMsg は通常完了
//     6. save 失敗時、削除は in-memory に反映、verify false で warn 表示 + console.warn
//     7. verify false でも削除自体は rollback しない（運営は継続）
//     8. alert を呼ばない
//     9. A-5.1-NUM-001 の欠番維持原則を壊さない（他者の entry_no が変わらない）

const fs = require('fs');

function extractScripts(path) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeLocalStorage() {
  return {
    _: {},
    _failOnSet: false,
    _failOnGet: false,
    getItem(k){
      if(this._failOnGet)throw new Error('localStorage.getItem forced failure');
      return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;
    },
    setItem(k,v){
      if(this._failOnSet)throw new Error('localStorage.setItem forced failure');
      this._[k]=String(v);
    },
    removeItem(k){delete this._[k];}
  };
}

function makeContext() {
  const elements = {};
  function makeElem(id) {
    return {
      id: id || '',
      _innerHTML: '',
      style: { _cssText: '', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      className: '',
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(){},
      appendChild(){},
      remove(){},
      focus(){},
      click(){},
      value: '',
      textContent: '',
      firstChild: null,
      disabled: false,
      getAttribute(){return null;},
      setAttribute(){}
    };
  }
  const docMock = {
    _elements: elements,
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElem(id);
      return elements[id];
    },
    createElement(){return makeElem();},
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){},
    removeEventListener(){},
    querySelectorAll(){return [];}
  };
  const winMock = { innerWidth: 1024 };
  const localStorageMock = makeLocalStorage();
  const cryptoMock = {
    randomUUID(){
      const chars='abcdef0123456789';
      let s='';
      for(let i=0;i<32;i++)s+=chars[Math.floor(Math.random()*chars.length)];
      return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20,32);
    }
  };
  return { document: docMock, window: winMock, localStorage: localStorageMock, crypto: cryptoMock };
}

function loadEnv(path, opts) {
  const ctx = makeContext();
  const js = extractScripts(path);
  const alertCalls = [];
  const warnCalls = [];
  const confirmReturn = (opts && opts.confirm !== undefined) ? opts.confirm : true;
  const alertFn = function(msg){ alertCalls.push(String(msg)); };
  const confirmFn = function(){ return confirmReturn; };
  const consoleMock = {
    log: function(){ /* swallow */ },
    error: function(){ /* swallow */ },
    warn: function(){ warnCalls.push(Array.prototype.slice.call(arguments).map(String).join(' ')); }
  };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       STORAGE_KEY:STORAGE_KEY,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       verifyPlayerAbsent:verifyPlayerAbsent,
       verifyStatePersisted:verifyStatePersisted,
       verifyMasterPersisted:verifyMasterPersisted,
       removePlayer:removePlayer,
       entryNoOf:entryNoOf,
       nextEntryNoForClass:nextEntryNoForClass,
       save:save,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
    alertFn, confirmFn, ()=>'',
    function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}},
    consoleMock, Promise
  );
  api._ctx = ctx;
  api._alertCalls = alertCalls;
  api._warnCalls = warnCalls;
  api._regMsgHtml = function(){
    const el = ctx.document._elements['reg-msg'];
    return el ? el._innerHTML : '';
  };
  return api;
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_a5_1_save_001.js <html>');
  process.exit(1);
}

let pass=0, fail=0;
function ok(){pass++;}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(); else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(); else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makeEmptyState(){
  return {players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}};
}

function makePlayer(id,name,cls,entryNo){
  var p={id:id,name:name,cls:cls,member:'member',grade:'ippan'};
  if(typeof entryNo==='number')p.entry_no=entryNo;
  return p;
}

// ============================================================
// 1. verifyPlayerAbsent: 削除対象 id が localStorage に存在しない場合 true
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p3','鈴木','A',3),
  ];
  env._setState(s);
  env.save();  // localStorage に書込み

  // p1 / p3 は存在
  assertEq(env.verifyPlayerAbsent('p1','A'), false, '1-1 verifyPlayerAbsent: 存在する id は false');
  assertEq(env.verifyPlayerAbsent('p3','A'), false, '1-2 verifyPlayerAbsent: 存在する id は false');
  // 削除済 / 不在 id は true
  assertEq(env.verifyPlayerAbsent('p2','A'), true,  '1-3 verifyPlayerAbsent: 不在 id は true');
  assertEq(env.verifyPlayerAbsent('p_never','A'), true, '1-4 verifyPlayerAbsent: 完全に未知の id も true');
}

// ============================================================
// 2. localStorage が空 / JSON 不可 / players 構造不正 で false
// ============================================================
{
  const env = loadEnv(targetPath);
  // 空 localStorage（save 未実行）
  assertEq(env.verifyPlayerAbsent('p1','A'), false, '2-1 verifyPlayerAbsent: localStorage 空は false');

  // 壊れた JSON
  env._ctx.localStorage._[env.STORAGE_KEY] = '{ not json';
  assertEq(env.verifyPlayerAbsent('p1','A'), false, '2-2 verifyPlayerAbsent: JSON parse 不可は false');

  // players キーなし
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({rounds:4});
  assertEq(env.verifyPlayerAbsent('p1','A'), false, '2-3 verifyPlayerAbsent: players 構造なしは false');

  // players[cls] が配列でない
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({players:{A:null,B:[]}});
  assertEq(env.verifyPlayerAbsent('p1','A'), false, '2-4 verifyPlayerAbsent: players[cls] が非配列は false');

  // getItem 例外
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]}});
  env._ctx.localStorage._failOnGet = true;
  assertEq(env.verifyPlayerAbsent('p1','A'), false, '2-5 verifyPlayerAbsent: getItem 例外は false');
  env._ctx.localStorage._failOnGet = false;
}

// ============================================================
// 3. A/B クラス境界を誤判定しない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p_shared','田中A','A',1)];
  s.players.B = [makePlayer('p_shared','田中B','B',1)];  // 同 id を B にも置く（境界テスト）
  env._setState(s);
  env.save();

  // A に存在 → A での判定は false
  assertEq(env.verifyPlayerAbsent('p_shared','A'), false, '3-1 A に存在する id は A クラス判定で false');
  // B に存在 → B での判定は false
  assertEq(env.verifyPlayerAbsent('p_shared','B'), false, '3-2 B に存在する id は B クラス判定で false');

  // A だけ削除した状態を再現
  const s2 = makeEmptyState();
  s2.players.A = [];
  s2.players.B = [makePlayer('p_shared','田中B','B',1)];
  env._setState(s2);
  env.save();

  // A での判定は true、B での判定は false
  assertEq(env.verifyPlayerAbsent('p_shared','A'), true,  '3-3 A 側だけ削除 → A 判定 true');
  assertEq(env.verifyPlayerAbsent('p_shared','B'), false, '3-4 A 側だけ削除 → B 判定 false（誤判定なし）');
}

// ============================================================
// 4. removePlayer 通常削除: verify true、warn が出ない、alert なし
// ============================================================
{
  const env = loadEnv(targetPath, {confirm:true});
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p2','佐藤','A',2),
    makePlayer('p3','鈴木','A',3),
  ];
  env._setState(s);
  env.save();

  env.removePlayer('p2','A');

  const after = env._getState();
  assertEq(after.players.A.length, 2, '4-1 削除後の A クラス件数 = 2');
  assertEq(after.players.A.some(p=>p.id==='p2'), false, '4-2 in-memory に p2 が残らない');

  // localStorage 検証: p2 が消えている
  assertEq(env.verifyPlayerAbsent('p2','A'), true, '4-3 localStorage 上も p2 が消えている');

  // warn / alert が出ない
  assertEq(env._warnCalls.length, 0, '4-4 console.warn は呼ばれない（verify true）');
  assertEq(env._alertCalls.length, 0, '4-5 alert は呼ばれない');
  // showMsg は warn 表示していない（reg-msg に alert-warn が出ていない）
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '4-6 showMsg(.., warn) は出ていない');
}

// ============================================================
// 5. save 失敗時: in-memory 削除は反映、verify false、warn 表示、alert なし
// ============================================================
{
  const env = loadEnv(targetPath, {confirm:true});
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p2','佐藤','A',2),
  ];
  env._setState(s);
  env.save();  // この時点では成功（p2 入り state が保存される）

  // 以降の setItem を失敗させる
  env._ctx.localStorage._failOnSet = true;

  env.removePlayer('p2','A');

  // in-memory は削除済（rollback しない）
  const after = env._getState();
  assertEq(after.players.A.length, 1, '5-1 in-memory 削除は反映される（rollback しない）');
  assertEq(after.players.A[0].id, 'p1', '5-2 p1 のみ残る');

  // localStorage は更新失敗のため p2 がまだ残っている → verify false
  assertEq(env.verifyPlayerAbsent('p2','A'), false, '5-3 verify false（localStorage 未更新）');

  // showMsg('warn') が出ている
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '5-4 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '5-5 「保存未確認」表現の文言が出ている');
  assert(env._regMsgHtml().indexOf('保存失敗') === -1, '5-6 「保存失敗」と断定する表現を使っていない');

  // console.warn が呼ばれ、id と cls を含む
  assert(env._warnCalls.length >= 1, '5-7 console.warn が呼ばれる');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-001') !== -1, '5-8 console.warn に SAVE-001 タグを含む');
  assert(warnText.indexOf('p2') !== -1, '5-9 console.warn に player id を含む');
  assert(warnText.indexOf('A') !== -1, '5-10 console.warn に cls を含む');

  // alert は呼ばれない
  assertEq(env._alertCalls.length, 0, '5-11 alert は呼ばれない（現場停止リスク回避）');
}

// ============================================================
// 6. A-5.1-NUM-001 欠番維持原則を壊さない: 削除しても他者の entry_no が変わらない
// ============================================================
{
  const env = loadEnv(targetPath, {confirm:true});
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p2','佐藤','A',2),
    makePlayer('p3','鈴木','A',3),
  ];
  env._setState(s);
  env.save();

  env.removePlayer('p2','A');

  // p1=01, p3=03 のまま（02 が欠番）
  assertEq(env.entryNoOf('A','p1'), '01', '6-1 削除後も p1 = 01');
  assertEq(env.entryNoOf('A','p3'), '03', '6-2 削除後も p3 = 03（欠番維持、02 に詰めない）');
  assertEq(env.entryNoOf('A','p2'), '--', '6-3 p2 は表示上消える');
  // 次の追加は max+1 = 4 になる（NUM-001 §5.2 の挙動）
  const after = env._getState();
  assertEq(env.nextEntryNoForClass('A', after), 4, '6-4 削除後の next = max+1 = 4');
}

// ============================================================
// 7. confirm キャンセル時: 削除も verify も走らない
// ============================================================
{
  const env = loadEnv(targetPath, {confirm:false});
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1)];
  env._setState(s);
  env.save();

  env.removePlayer('p1','A');

  // 削除されない
  const after = env._getState();
  assertEq(after.players.A.length, 1, '7-1 confirm=false で削除されない');
  // warn / alert も出ない
  assertEq(env._warnCalls.length, 0, '7-2 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '7-3 alert は呼ばれない');
}

// ============================================================
// 結果
// ============================================================
console.log('PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
