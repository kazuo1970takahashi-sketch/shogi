#!/usr/bin/env node
// A-5.1-SAVE-002: 参加者追加時の保存未確認検知 — 単体テスト
//
// テスト観点（A-5.1-SAVE-DESIGN-001 v0.1 §3.2 / 依頼書 §7 準拠）:
//   verifyPlayerPersistedById:
//     1. id + cls + name の3軸一致で true
//     2. id が指定 cls に不在で false
//     3. id は存在するが name が違うと false
//     4. localStorage が空 / JSON 不可 / players 構造不正 で false
//     5. A/B クラス境界を誤判定しない
//     6. 同姓同名の別 player（id 違い）で偽陽性なし
//   addPlayer フロー:
//     7. 通常追加後、verify true、warn なし、alert なし
//     8. save 失敗時、追加は in-memory に反映、verify false で warn 表示 + console.warn
//     9. verify false でも追加自体は rollback しない（運営は継続）
//    10. alert を呼ばない
//    11. 既存追加フローを壊さない（entry_no / member_id / SAVE-001 / NUM-001）

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
      blur(){},
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

function loadEnv(path) {
  const ctx = makeContext();
  const js = extractScripts(path);
  const alertCalls = [];
  const warnCalls = [];
  const alertFn = function(msg){ alertCalls.push(String(msg)); };
  const confirmFn = function(){ return true; };
  const consoleMock = {
    log: function(){},
    error: function(){},
    warn: function(){ warnCalls.push(Array.prototype.slice.call(arguments).map(String).join(' ')); }
  };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       STORAGE_KEY:STORAGE_KEY,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       verifyPlayerPersistedById:verifyPlayerPersistedById,
       verifyPlayerAbsent:verifyPlayerAbsent,
       verifyStatePersisted:verifyStatePersisted,
       verifyMasterPersisted:verifyMasterPersisted,
       addPlayer:addPlayer,
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
  api._setInputs = function(name, cls, yomi){
    const inpName = ctx.document.getElementById('inp-name');
    const inpYomi = ctx.document.getElementById('inp-yomi');
    const inpClass = ctx.document.getElementById('inp-class');
    inpName.value = name;
    inpYomi.value = yomi || '';
    inpClass.value = cls;
  };
  return api;
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_a5_1_save_002.js <html>');
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
// 1. verifyPlayerPersistedById: id + cls + name の3軸一致で true
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p2','佐藤','A',2),
  ];
  env._setState(s);
  env.save();

  assertEq(env.verifyPlayerPersistedById('p1','A','田中'), true, '1-1 3軸一致は true');
  assertEq(env.verifyPlayerPersistedById('p2','A','佐藤'), true, '1-2 別 player でも3軸一致は true');
}

// ============================================================
// 2. id が指定 cls に不在で false
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1)];
  env._setState(s);
  env.save();

  assertEq(env.verifyPlayerPersistedById('p_unknown','A','田中'), false, '2-1 不在 id は false');
}

// ============================================================
// 3. id は存在するが name が違うと false
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1)];
  env._setState(s);
  env.save();

  assertEq(env.verifyPlayerPersistedById('p1','A','違う名前'), false, '3-1 name 不一致は false');
  // 空文字
  assertEq(env.verifyPlayerPersistedById('p1','A',''), false, '3-2 空文字 expected も false');
}

// ============================================================
// 4. localStorage が空 / JSON 不可 / players 構造不正 で false
// ============================================================
{
  const env = loadEnv(targetPath);
  // 空 localStorage
  assertEq(env.verifyPlayerPersistedById('p1','A','田中'), false, '4-1 localStorage 空は false');

  // 壊れた JSON
  env._ctx.localStorage._[env.STORAGE_KEY] = '{ not json';
  assertEq(env.verifyPlayerPersistedById('p1','A','田中'), false, '4-2 JSON 不可は false');

  // players キーなし
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({rounds:4});
  assertEq(env.verifyPlayerPersistedById('p1','A','田中'), false, '4-3 players 構造なしは false');

  // players[cls] が配列でない
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({players:{A:null,B:[]}});
  assertEq(env.verifyPlayerPersistedById('p1','A','田中'), false, '4-4 players[cls] 非配列は false');

  // getItem 例外
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]}});
  env._ctx.localStorage._failOnGet = true;
  assertEq(env.verifyPlayerPersistedById('p1','A','田中'), false, '4-5 getItem 例外は false');
  env._ctx.localStorage._failOnGet = false;
}

// ============================================================
// 5. A/B クラス境界を誤判定しない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p_only_in_a','田中A','A',1)];
  s.players.B = [makePlayer('p_only_in_b','田中B','B',1)];
  env._setState(s);
  env.save();

  // A に存在する id を B で探すと false
  assertEq(env.verifyPlayerPersistedById('p_only_in_a','B','田中A'), false, '5-1 A の id を B で探して false（境界）');
  // B に存在する id を A で探すと false
  assertEq(env.verifyPlayerPersistedById('p_only_in_b','A','田中B'), false, '5-2 B の id を A で探して false（境界）');
  // 正しい cls で探せば true
  assertEq(env.verifyPlayerPersistedById('p_only_in_a','A','田中A'), true, '5-3 正しい cls A で true');
  assertEq(env.verifyPlayerPersistedById('p_only_in_b','B','田中B'), true, '5-4 正しい cls B で true');
}

// ============================================================
// 6. 同姓同名の別 player による偽陽性を起こさない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  // 同名で id が違う 2 名（運用上は addPlayer がブロックするが、helper 単体仕様としては id 主軸を保証）
  s.players.A = [
    makePlayer('p_real','田中','A',1),
    makePlayer('p_other','田中','A',2),  // 同名・別 id（state 整合は別問題、helper の偽陽性チェック）
  ];
  env._setState(s);
  env.save();

  // 存在しない id では false（同名 player があっても拾わない）
  assertEq(env.verifyPlayerPersistedById('p_never','A','田中'), false, '6-1 不在 id は同名でも false（偽陽性なし）');
  // 既存 id では true
  assertEq(env.verifyPlayerPersistedById('p_real','A','田中'), true, '6-2 既存 id は true');
  assertEq(env.verifyPlayerPersistedById('p_other','A','田中'), true, '6-3 別の既存 id も true');
}

// ============================================================
// 7. addPlayer 通常追加: verify true、warn が出ない、alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());

  env._setInputs('田中 太郎','A','');
  env.addPlayer();

  const after = env._getState();
  assertEq(after.players.A.length, 1, '7-1 A に 1 名追加');
  const added = after.players.A[0];
  assertEq(added.name, '田中 太郎', '7-2 追加 player の name');
  assertEq(added.cls, 'A', '7-3 追加 player の cls');
  assert(typeof added.id==='string' && added.id.length>0, '7-4 追加 player に id が付く');
  assertEq(added.entry_no, 1, '7-5 entry_no = 1');

  // localStorage に永続化されている
  assertEq(env.verifyPlayerPersistedById(added.id,'A','田中 太郎'), true, '7-6 verifyPlayerPersistedById true');

  // warn / alert が出ない
  assertEq(env._warnCalls.length, 0, '7-7 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '7-8 alert は呼ばれない');
  // showMsg は 'ok' のまま（warn ではない）
  assert(env._regMsgHtml().indexOf('alert-ok') !== -1, '7-9 showMsg(.., ok) のまま');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '7-10 showMsg(.., warn) は出ていない');
}

// ============================================================
// 8. save 失敗時: in-memory 追加は反映、verify false、warn 表示、alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());

  // 以降の setItem を失敗させる
  env._ctx.localStorage._failOnSet = true;

  env._setInputs('佐藤 花子','B','');
  env.addPlayer();

  // in-memory は追加済（rollback しない）
  const after = env._getState();
  assertEq(after.players.B.length, 1, '8-1 in-memory に追加が反映される（rollback しない）');
  const added = after.players.B[0];
  assertEq(added.name, '佐藤 花子', '8-2 in-memory の name');

  // localStorage は更新失敗のため verify false
  assertEq(env.verifyPlayerPersistedById(added.id,'B','佐藤 花子'), false, '8-3 verify false（localStorage 未更新）');

  // showMsg('warn') が出ている（OK 表示を上書き）
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '8-4 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '8-5 「保存未確認」表現の文言が出ている');
  assert(env._regMsgHtml().indexOf('保存失敗') === -1, '8-6 「保存失敗」と断定する表現を使っていない');

  // console.warn が呼ばれ、id / cls / name を含む
  // 注: save() 失敗時に内部の console.warn は呼ばれない仕様（catch で notifyError のみ）
  //     ここで集計するのは SAVE-002 が出す warn のみ
  const warnText = env._warnCalls.join('\n');
  assert(env._warnCalls.length >= 1, '8-7 console.warn が呼ばれる');
  assert(warnText.indexOf('SAVE-002') !== -1, '8-8 console.warn に SAVE-002 タグを含む');
  assert(warnText.indexOf(added.id) !== -1, '8-9 console.warn に player id を含む');
  assert(warnText.indexOf('B') !== -1, '8-10 console.warn に cls を含む');
  assert(warnText.indexOf('佐藤 花子') !== -1, '8-11 console.warn に name を含む');

  // alert は呼ばれない
  assertEq(env._alertCalls.length, 0, '8-12 alert は呼ばれない');
}

// ============================================================
// 9. A-5.1-NUM-001 欠番維持: addPlayer 後も nextEntryNoForClass は max+1
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  // 既存 A-1 / A-3、A-2 が欠番
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p3','鈴木','A',3),
  ];
  env._setState(s);
  env.save();

  env._setInputs('高橋','A','');
  env.addPlayer();

  const after = env._getState();
  assertEq(after.players.A.length, 3, '9-1 A に 3 名');
  const newOne = after.players.A[after.players.A.length-1];
  assertEq(newOne.entry_no, 4, '9-2 新規 entry_no = 4（欠番 2 を再利用しない）');
  assertEq(env.entryNoOf('A','p1'), '01', '9-3 既存 p1 = 01 不変');
  assertEq(env.entryNoOf('A','p3'), '03', '9-4 既存 p3 = 03 不変');
}

// ============================================================
// 10. A-5.1-SAVE-001 連携: addPlayer → save 成功 → removePlayer が verifyPlayerAbsent true
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());

  env._setInputs('伊藤','A','');
  env.addPlayer();
  const after = env._getState();
  const newId = after.players.A[0].id;

  // SAVE-001 helper も併用できる（無干渉）
  assertEq(env.verifyPlayerAbsent(newId,'A'), false, '10-1 追加直後は verifyPlayerAbsent false（id 存在）');
  assertEq(env.verifyPlayerPersistedById(newId,'A','伊藤'), true, '10-2 SAVE-002 helper は true');

  env.removePlayer(newId,'A');
  assertEq(env.verifyPlayerAbsent(newId,'A'), true, '10-3 削除後 verifyPlayerAbsent true');
  assertEq(env.verifyPlayerPersistedById(newId,'A','伊藤'), false, '10-4 削除後 SAVE-002 helper は false');
}

// ============================================================
// 11. 既存追加フローを壊さない: 空名拒否 / 同名拒否
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());

  // 空名拒否
  env._setInputs('','A','');
  env.addPlayer();
  assertEq(env._getState().players.A.length, 0, '11-1 空名は追加されない');
  // 空名拒否時は verify は走らない（warn が呼ばれない）
  assertEq(env._warnCalls.length, 0, '11-2 空名拒否時 console.warn なし');

  // 1 名追加してから同名追加を試みる
  env._setInputs('田中','A','');
  env.addPlayer();
  assertEq(env._getState().players.A.length, 1, '11-3 1 名追加');

  env._setInputs('田中','A','');
  env.addPlayer();
  assertEq(env._getState().players.A.length, 1, '11-4 同名は追加されない');
}

// ============================================================
// 結果
// ============================================================
console.log('PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
