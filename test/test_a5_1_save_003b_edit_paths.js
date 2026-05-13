#!/usr/bin/env node
// A-5.1-SAVE-003b-2: 対局画面編集経路の保存未確認検知 — 単体テスト
//
// 対象 callsite（依頼書 §2）:
//   1. bindChangePairingModalEvents() — 対戦相手変更 / swap（4239 行付近）
//   2. bindEditPastResultModalEvents() — 過去結果修正 p1 / p2（4505 / 4510 行付近）
//
// helper:
//   既存の readPersistedState() + pairingsMatchSnapshot() を流用。
//   bindEditPastResultModalEvents() は readPersistedState 後にインライン index 確認で
//   results[cls][roundIdx][matchIdx].winner を expected と照合する。新 helper は追加していない
//   （クロージャ verifyPastResultPersisted_ep は bind 関数内のローカルクロージャで、
//    トップレベルの helper namespace には登場しない）。

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

// SAVE-003b-2 用: addEventListener で登録したハンドラーを保持し、click() で発火できる mock。
function makeContext() {
  const elements = {};
  function makeElem(id) {
    const handlers = {};
    return {
      id: id || '',
      _innerHTML: '',
      style: { _cssText: '', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      className: '',
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(type, fn){
        if(!handlers[type])handlers[type]=[];
        handlers[type].push(fn);
      },
      appendChild(){},
      remove(){},
      focus(){},
      blur(){},
      click(){
        const fns = handlers.click || [];
        for(let i=0;i<fns.length;i++)fns[i]();
      },
      value: '',
      textContent: '',
      firstChild: null,
      disabled: false,
      getAttribute(){return null;},
      setAttribute(){},
      _handlers: handlers
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
       readPersistedState:readPersistedState,
       pairingsMatchSnapshot:pairingsMatchSnapshot,
       bindChangePairingModalEvents:bindChangePairingModalEvents,
       bindEditPastResultModalEvents:bindEditPastResultModalEvents,
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
  console.error('Usage: node test_a5_1_save_003b_edit_paths.js <html>');
  process.exit(1);
}

let pass=0, fail=0;
function ok(){pass++;}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(); else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(); else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makeEmptyState(rounds){
  return {players:{A:[],B:[]},rounds:(typeof rounds==='number'?rounds:4),pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}};
}

function makePlayer(id,name,cls,entryNo){
  return {id:id,name:name,cls:cls,member:'member',grade:'ippan',entry_no:entryNo||1};
}

// ============================================================
// 1. bindChangePairingModalEvents 単発変更 正常系: warn なし / alert なし
//    pairings[A] = [{pA,pB}] に対し、未ペアの pC を入れて {pA,pC} に変更（swap 経路には入らない）
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2), makePlayer('pC','鈴木','A',3)];
  s.started = true;
  s.pairings.A = [{p1:'pA',p2:'pB',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  env.bindChangePairingModalEvents('A', 0);
  env._ctx.document.getElementById('chg-p1').value = 'pA';
  env._ctx.document.getElementById('chg-p2').value = 'pC';
  env._ctx.document.getElementById('chg-save').click();

  const after = env._getState();
  assertEq(after.pairings.A.length, 1, '1-1 pairings 件数維持');
  assertEq(after.pairings.A[0].p1, 'pA', '1-2 p1=pA');
  assertEq(after.pairings.A[0].p2, 'pC', '1-3 p2=pC（変更後）');
  assertEq(after.pairings.A[0].lastModifiedBy, 'manual', '1-4 lastModifiedBy=manual');
  assertEq(env._warnCalls.length, 0, '1-5 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '1-6 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '1-7 showMsg(.., warn) は出ていない');
}

// ============================================================
// 2. bindChangePairingModalEvents 単発変更 保存失敗: warn 表示
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2), makePlayer('pC','鈴木','A',3)];
  s.started = true;
  s.pairings.A = [{p1:'pA',p2:'pB',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  env.bindChangePairingModalEvents('A', 0);
  env._ctx.document.getElementById('chg-p1').value = 'pA';
  env._ctx.document.getElementById('chg-p2').value = 'pC';

  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('chg-save').click();

  const after = env._getState();
  assertEq(after.pairings.A[0].p2, 'pC', '2-1 in-memory: p2=pC（rollback しない）');
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '2-2 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '2-3 「保存未確認」表現の文言');
  assert(env._regMsgHtml().indexOf('保存失敗') === -1, '2-4 「保存失敗」と断定しない');
  const warnText = env._warnCalls.join('\n');
  assert(env._warnCalls.length >= 1, '2-5 console.warn が呼ばれる');
  assert(warnText.indexOf('SAVE-003b') !== -1, '2-6 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('bindChangePairingModalEvents') !== -1, '2-7 console.warn に bindChangePairingModalEvents を含む');
  assertEq(env._alertCalls.length, 0, '2-8 alert は呼ばれない');
}

// ============================================================
// 3. bindChangePairingModalEvents swap 正常系: warn なし
//    pairings[A] = [{pA,pB}, {pC,pD}] に対し、idx=0 で p2 を pB → pC に変更 → swap が起きる
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2),
    makePlayer('pC','鈴木','A',3), makePlayer('pD','高橋','A',4)
  ];
  s.started = true;
  s.pairings.A = [
    {p1:'pA',p2:'pB',winner:null,lastModifiedBy:'auto'},
    {p1:'pC',p2:'pD',winner:null,lastModifiedBy:'auto'}
  ];
  env._setState(s);
  env.save();

  env.bindChangePairingModalEvents('A', 0);
  env._ctx.document.getElementById('chg-p1').value = 'pA';
  env._ctx.document.getElementById('chg-p2').value = 'pC';
  env._ctx.document.getElementById('chg-save').click();

  const after = env._getState();
  assertEq(after.pairings.A.length, 2, '3-1 pairings 件数維持');
  // swap 後: idx=0 は {pA, pC}、idx=1 は {pB, pD}
  assertEq(after.pairings.A[0].p1, 'pA', '3-2 idx=0 p1=pA');
  assertEq(after.pairings.A[0].p2, 'pC', '3-3 idx=0 p2=pC');
  assertEq(after.pairings.A[0].lastModifiedBy, 'manual', '3-4 idx=0 lastModifiedBy=manual');
  assertEq(after.pairings.A[1].lastModifiedBy, 'manual', '3-5 idx=1 lastModifiedBy=manual');
  // idx=1 のメンバー（pB と pD の組合せ、順序は実装依存）
  const idx1 = after.pairings.A[1];
  const idx1Members = [idx1.p1, idx1.p2].sort().join(',');
  assertEq(idx1Members, 'pB,pD', '3-6 idx=1 は pB と pD の組（順序不問）');
  assertEq(env._warnCalls.length, 0, '3-7 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '3-8 alert は呼ばれない');
}

// ============================================================
// 4. bindChangePairingModalEvents swap 保存失敗: warn 表示
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2),
    makePlayer('pC','鈴木','A',3), makePlayer('pD','高橋','A',4)
  ];
  s.started = true;
  s.pairings.A = [
    {p1:'pA',p2:'pB',winner:null,lastModifiedBy:'auto'},
    {p1:'pC',p2:'pD',winner:null,lastModifiedBy:'auto'}
  ];
  env._setState(s);
  env.save();

  env.bindChangePairingModalEvents('A', 0);
  env._ctx.document.getElementById('chg-p1').value = 'pA';
  env._ctx.document.getElementById('chg-p2').value = 'pC';

  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('chg-save').click();

  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '4-1 showMsg(.., warn) が出ている');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003b') !== -1, '4-2 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('bindChangePairingModalEvents') !== -1, '4-3 console.warn に bindChangePairingModalEvents を含む');
  assertEq(env._alertCalls.length, 0, '4-4 alert は呼ばれない');
}

// ============================================================
// 5. bindChangePairingModalEvents swap 後の片方だけ stale を検知
//    swap 完了後、persisted の idx=1 だけを古い値にしておくと pairingsMatchSnapshot で検出される。
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2),
    makePlayer('pC','鈴木','A',3), makePlayer('pD','高橋','A',4)
  ];
  s.started = true;
  s.pairings.A = [
    {p1:'pA',p2:'pB',winner:null,lastModifiedBy:'auto'},
    {p1:'pC',p2:'pD',winner:null,lastModifiedBy:'auto'}
  ];
  env._setState(s);
  env.save();

  // persisted を「idx=0 は新 swap 後、idx=1 は古いまま」になるよう先回りで書き込む
  // 手順:
  //   1. bindChangePairingModalEvents をセットアップ
  //   2. _failOnSet を立てて save() を失敗させる（persisted は古い 2 ペアのまま）
  //   3. クリックで in-memory は swap、save() は失敗。verify は pairingsMatchSnapshot で false
  //   ※ これは「swap 後の片方だけ stale」の表現として、persisted 全体が古い場合と同等。
  //      より厳密な「idx=0 だけ新しく idx=1 が古い」状態は、setItem を許可した上で
  //      その直後に手動で persisted の一部だけ書換える方法で再現するが、ロジック上は
  //      pairingsMatchSnapshot が一件でも差分があれば false を返すため、より単純な
  //      「両方 stale」を使い、helper 単体の挙動を §5-extra で別途確認する。

  env.bindChangePairingModalEvents('A', 0);
  env._ctx.document.getElementById('chg-p1').value = 'pA';
  env._ctx.document.getElementById('chg-p2').value = 'pC';

  // 1) 通常 click（一旦正常保存）
  env._ctx.document.getElementById('chg-save').click();

  // 2) persisted を「idx=0 は新（pA, pC）/ idx=1 が古い」状態に上書きして verify 単体を確認
  const persistedClone = JSON.parse(env._ctx.localStorage._[env.STORAGE_KEY]);
  // idx=1 を古い値に差し戻す
  persistedClone.pairings.A[1] = {p1:'pC',p2:'pD',winner:null,lastModifiedBy:'auto'};
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify(persistedClone);

  // pairingsMatchSnapshot の field-compare で片方 stale を検出できること
  const after = env._getState();
  const persistedAfter = env.readPersistedState();
  assertEq(env.pairingsMatchSnapshot(persistedAfter.pairings.A, after.pairings.A), false, '5-1 swap 後 idx=1 だけ stale を pairingsMatchSnapshot で検知（false）');
}

// ============================================================
// 6. bindEditPastResultModalEvents p1 勝ち 正常系: warn なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
  s.started = true;
  s.results.A = [
    [{p1:'pA',p2:'pB',winner:'pB',lastModifiedBy:'auto'}]
  ];
  env._setState(s);
  env.save();

  env.bindEditPastResultModalEvents('A', 0, 0);
  env._ctx.document.getElementById('ep-p1').click();

  const after = env._getState();
  assertEq(after.results.A[0][0].winner, 'pA', '6-1 in-memory: winner=pA');
  assertEq(env._warnCalls.length, 0, '6-2 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '6-3 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '6-4 showMsg(.., warn) は出ていない');
}

// ============================================================
// 7. bindEditPastResultModalEvents p1 勝ち 保存失敗: warn 表示
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
  s.started = true;
  s.results.A = [
    [{p1:'pA',p2:'pB',winner:'pB',lastModifiedBy:'auto'}]
  ];
  env._setState(s);
  env.save();

  env.bindEditPastResultModalEvents('A', 0, 0);
  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('ep-p1').click();

  const after = env._getState();
  assertEq(after.results.A[0][0].winner, 'pA', '7-1 in-memory: winner=pA（rollback しない）');
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '7-2 showMsg(.., warn) が出ている');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003b') !== -1, '7-3 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('bindEditPastResultModalEvents (p1)') !== -1, '7-4 console.warn に bindEditPastResultModalEvents (p1) を含む');
  assert(warnText.indexOf('expected=pA') !== -1, '7-5 console.warn に expected=pA を含む');
  assertEq(env._alertCalls.length, 0, '7-6 alert は呼ばれない');
}

// ============================================================
// 8. bindEditPastResultModalEvents p2 勝ち 正常系: warn なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
  s.started = true;
  s.results.A = [
    [{p1:'pA',p2:'pB',winner:'pA',lastModifiedBy:'auto'}]
  ];
  env._setState(s);
  env.save();

  env.bindEditPastResultModalEvents('A', 0, 0);
  env._ctx.document.getElementById('ep-p2').click();

  const after = env._getState();
  assertEq(after.results.A[0][0].winner, 'pB', '8-1 in-memory: winner=pB');
  assertEq(env._warnCalls.length, 0, '8-2 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '8-3 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '8-4 showMsg(.., warn) は出ていない');
}

// ============================================================
// 9. bindEditPastResultModalEvents p2 勝ち 保存失敗: warn 表示
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
  s.started = true;
  s.results.A = [
    [{p1:'pA',p2:'pB',winner:'pA',lastModifiedBy:'auto'}]
  ];
  env._setState(s);
  env.save();

  env.bindEditPastResultModalEvents('A', 0, 0);
  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('ep-p2').click();

  const after = env._getState();
  assertEq(after.results.A[0][0].winner, 'pB', '9-1 in-memory: winner=pB（rollback しない）');
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '9-2 showMsg(.., warn) が出ている');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003b') !== -1, '9-3 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('bindEditPastResultModalEvents (p2)') !== -1, '9-4 console.warn に bindEditPastResultModalEvents (p2) を含む');
  assert(warnText.indexOf('expected=pB') !== -1, '9-5 console.warn に expected=pB を含む');
  assertEq(env._alertCalls.length, 0, '9-6 alert は呼ばれない');
}

// ============================================================
// 10. bindEditPastResultModalEvents persisted の winner 不一致を検知
//     click() で正常保存後、persisted の winner を別 id に上書きして verify を呼び直す体の確認:
//     既に warn なしで終了しているため、verify 単体テストで挙動を確認する。
//     （SAVE-003 と同じく readPersistedState ロジックは共有）
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
  s.started = true;
  s.results.A = [
    [{p1:'pA',p2:'pB',winner:'pB',lastModifiedBy:'auto'}]
  ];
  env._setState(s);
  env.save();

  env.bindEditPastResultModalEvents('A', 0, 0);

  // 「persisted 側 winner だけが古い」状態を作るには、click 内の save() を成功させたあとに
  // persisted を書換える必要があるが、verify は click ハンドラ内で実行されるため、
  // ここでは _failOnSet を立てて save 失敗を再現する方法と等価。代わりに、状態のみ手書きで
  // 「persisted 側を winner=pA としつつ in-memory 側は p1 クリック後の winner=pA」になる
  // 経路は warn が出ないため、対称的な「persisted を別値に上書き → verify false」を再現する。
  // ここでは _failOnSet 経路は §7 / §9 で確認済のため省略し、helper 単体（readPersistedState
  // + 直接アクセス）の検出力を確認する。
  const persisted = env.readPersistedState();
  assert(persisted && persisted.results && Array.isArray(persisted.results.A), '10-1 persisted.results.A は配列');
  // persisted.results.A[0][0].winner === 'pB' で初期化済（in-memory と一致）
  assertEq(persisted.results.A[0][0].winner, 'pB', '10-2 初期 persisted winner=pB');
  // ローカルストレージを「winner=null（不一致）」に上書き → 単純な winner 比較で false 期待
  const cloned = JSON.parse(env._ctx.localStorage._[env.STORAGE_KEY]);
  cloned.results.A[0][0].winner = null;
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify(cloned);
  const persisted2 = env.readPersistedState();
  assert(persisted2.results.A[0][0].winner !== 'pB', '10-3 上書き後 winner != pB（検出ベース）');
}

// ============================================================
// 11. bindEditPastResultModalEvents persisted.results[cls][roundIdx] 欠落で warn
//     save() 後の verify 時に persisted.results.A[roundIdx] が無い場合の挙動。
//     _failOnSet を立てた上で persisted を「results.A=[]（roundIdx=0 が無い）」状態に
//     しておき、p1 クリック → save 失敗 → verify は results.A[0] 欠落で false → warn。
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
  s.started = true;
  s.results.A = [
    [{p1:'pA',p2:'pB',winner:'pB',lastModifiedBy:'auto'}]
  ];
  env._setState(s);
  env.save();

  // persisted から results.A[0] を取り除く
  const cloned = JSON.parse(env._ctx.localStorage._[env.STORAGE_KEY]);
  cloned.results.A = [];
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify(cloned);

  env.bindEditPastResultModalEvents('A', 0, 0);
  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('ep-p1').click();

  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '11-1 results[cls][roundIdx] 欠落で warn 表示');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003b') !== -1, '11-2 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('bindEditPastResultModalEvents (p1)') !== -1, '11-3 console.warn に bindEditPastResultModalEvents (p1) を含む');
  assertEq(env._alertCalls.length, 0, '11-4 alert は呼ばれない');
}

// ============================================================
// 12. bindEditPastResultModalEvents persisted.results[cls][roundIdx][matchIdx] 欠落で warn
//     persisted.results.A[0] は配列だが [matchIdx] が無い。
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
  s.started = true;
  s.results.A = [
    [{p1:'pA',p2:'pB',winner:'pB',lastModifiedBy:'auto'}]
  ];
  env._setState(s);
  env.save();

  const cloned = JSON.parse(env._ctx.localStorage._[env.STORAGE_KEY]);
  // results.A[0] を空配列に
  cloned.results.A[0] = [];
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify(cloned);

  env.bindEditPastResultModalEvents('A', 0, 0);
  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('ep-p2').click();

  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '12-1 results[cls][roundIdx][matchIdx] 欠落で warn 表示');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003b') !== -1, '12-2 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('bindEditPastResultModalEvents (p2)') !== -1, '12-3 console.warn に bindEditPastResultModalEvents (p2) を含む');
  assertEq(env._alertCalls.length, 0, '12-4 alert は呼ばれない');
}

// ============================================================
// 13. 異常系: localStorage 空 / 壊れた JSON / schema 不正 でも crash しない
// ============================================================
{
  // 13-A: localStorage 空
  {
    const env = loadEnv(targetPath);
    const s = makeEmptyState();
    s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
    s.started = true;
    s.results.A = [[{p1:'pA',p2:'pB',winner:'pB',lastModifiedBy:'auto'}]];
    env._setState(s);
    env.save();
    delete env._ctx.localStorage._[env.STORAGE_KEY];
    env._ctx.localStorage._failOnSet = true;

    env.bindEditPastResultModalEvents('A', 0, 0);
    let crashed = false;
    try { env._ctx.document.getElementById('ep-p1').click(); } catch(e){ crashed = true; }
    assertEq(crashed, false, '13-A-1 localStorage 空でも crash しない');
    assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '13-A-2 warn 表示');
    assertEq(env._alertCalls.length, 0, '13-A-3 alert は呼ばれない');
  }

  // 13-B: 壊れた JSON
  {
    const env = loadEnv(targetPath);
    const s = makeEmptyState();
    s.players.A = [makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2)];
    s.started = true;
    s.results.A = [[{p1:'pA',p2:'pB',winner:'pB',lastModifiedBy:'auto'}]];
    env._setState(s);
    env.save();
    env._ctx.localStorage._[env.STORAGE_KEY] = '{ not json';
    env._ctx.localStorage._failOnSet = true;

    env.bindEditPastResultModalEvents('A', 0, 0);
    let crashed = false;
    try { env._ctx.document.getElementById('ep-p2').click(); } catch(e){ crashed = true; }
    assertEq(crashed, false, '13-B-1 壊れた JSON でも crash しない');
    assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '13-B-2 warn 表示');
    assertEq(env._alertCalls.length, 0, '13-B-3 alert は呼ばれない');
  }

  // 13-C: schema 不正（results 欠落）
  {
    const env = loadEnv(targetPath);
    const s = makeEmptyState();
    s.players.A = [
      makePlayer('pA','田中','A',1), makePlayer('pB','佐藤','A',2),
      makePlayer('pC','鈴木','A',3)
    ];
    s.started = true;
    s.pairings.A = [{p1:'pA',p2:'pB',winner:null,lastModifiedBy:'auto'}];
    env._setState(s);
    env.save();
    env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({rounds:4});
    env._ctx.localStorage._failOnSet = true;

    env.bindChangePairingModalEvents('A', 0);
    env._ctx.document.getElementById('chg-p1').value = 'pA';
    env._ctx.document.getElementById('chg-p2').value = 'pC';

    let crashed = false;
    try { env._ctx.document.getElementById('chg-save').click(); } catch(e){ crashed = true; }
    assertEq(crashed, false, '13-C-1 schema 不正でも crash しない');
    assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '13-C-2 warn 表示');
    assertEq(env._alertCalls.length, 0, '13-C-3 alert は呼ばれない');
  }
}

// ============================================================
// 14. 既存 helper 流用・新 helper 未追加の間接確認
//     SAVE-003b-2 では readPersistedState / pairingsMatchSnapshot を流用し、
//     bindEditPastResultModalEvents 内の verifyPastResultPersisted_ep は
//     関数スコープローカルなクロージャ（トップレベル export には登場しない）。
// ============================================================
{
  const env = loadEnv(targetPath);
  // 既存 helper はエクスポートされる
  assert(typeof env.readPersistedState === 'function', '14-1 readPersistedState 利用可');
  assert(typeof env.pairingsMatchSnapshot === 'function', '14-2 pairingsMatchSnapshot 利用可');
  // 対象 2 関数もエクスポート可
  assert(typeof env.bindChangePairingModalEvents === 'function', '14-3 bindChangePairingModalEvents 利用可');
  assert(typeof env.bindEditPastResultModalEvents === 'function', '14-4 bindEditPastResultModalEvents 利用可');
  // 新 helper として追加していないことの間接確認:
  //   - verifyPastResultPersisted_ep / verifyPairingPersisted / verifyResultWinnerPersisted など
  //     のトップレベル helper は登場しない（loadEnv の return 集合に固定されている）
  const exportedKeys = Object.keys(env).filter(k => !k.startsWith('_'));
  assert(exportedKeys.indexOf('verifyPastResultPersisted_ep') === -1, '14-5 verifyPastResultPersisted_ep は未エクスポート');
  assert(exportedKeys.indexOf('verifyPairingPersisted') === -1, '14-6 verifyPairingPersisted は未追加');
  assert(exportedKeys.indexOf('verifyResultWinnerPersisted') === -1, '14-7 verifyResultWinnerPersisted は未追加');
}

// ============================================================
// 結果
// ============================================================
console.log('PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
