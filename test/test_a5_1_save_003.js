#!/usr/bin/env node
// A-5.1-SAVE-003: 大会進行 core path の保存未確認検知 — 単体テスト
//
// 対象 4 関数（A-5.1-SAVE-DESIGN-001 / 依頼書 §今回の実装スコープ 準拠）:
//   1. startTournament()   — state.started が localStorage 上で true か
//   2. generatePairing()   — state.pairings[cls] の件数が一致するか
//   3. setWinner()         — pairings[cls][idx].winner が一致するか
//   4. submitRound()       — results[cls] 件数増 + pairings[cls] が新値で一致するか
//
// helper:
//   readPersistedState() の正常系 / 異常系（空 / 不正 JSON / 構造不正 / 例外）

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
       readPersistedState:readPersistedState,
       startTournament:startTournament,
       generatePairing:generatePairing,
       setWinner:setWinner,
       submitRound:submitRound,
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
  console.error('Usage: node test_a5_1_save_003.js <html>');
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
  var p={id:id,name:name,cls:cls,member:'member',grade:'ippan'};
  if(typeof entryNo==='number')p.entry_no=entryNo;
  return p;
}

// ============================================================
// 1. readPersistedState 正常系: 保存済み state を返す
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1)];
  env._setState(s);
  env.save();

  const got = env.readPersistedState();
  assert(got !== null, '1-1 正常 JSON は state を返す（null ではない）');
  assert(got && got.players && Array.isArray(got.players.A), '1-2 戻り値に players.A 配列が含まれる');
  assertEq(got.players.A.length, 1, '1-3 players.A の件数が一致');
  assertEq(got.players.A[0].id, 'p1', '1-4 player.id が一致');
}

// ============================================================
// 2. readPersistedState 異常系: 空 / 不正 JSON / 構造不正 / 例外で null
// ============================================================
{
  const env = loadEnv(targetPath);
  // localStorage 空
  assertEq(env.readPersistedState(), null, '2-1 localStorage 空は null');

  // 壊れた JSON
  env._ctx.localStorage._[env.STORAGE_KEY] = '{ not json';
  assertEq(env.readPersistedState(), null, '2-2 JSON 不可は null');

  // null 文字列ではなく "null"（JSON.parse で null になる）
  env._ctx.localStorage._[env.STORAGE_KEY] = 'null';
  assertEq(env.readPersistedState(), null, '2-3 parsed が null は null');

  // typeof !== 'object'（数値）
  env._ctx.localStorage._[env.STORAGE_KEY] = '42';
  assertEq(env.readPersistedState(), null, '2-4 parsed が非 object は null');

  // getItem 例外
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]}});
  env._ctx.localStorage._failOnGet = true;
  assertEq(env.readPersistedState(), null, '2-5 getItem 例外は null');
  env._ctx.localStorage._failOnGet = false;
}

// ============================================================
// 3. startTournament 正常: 保存検証成功 / warn なし / alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  env._setState(s);

  env.startTournament();

  const after = env._getState();
  assertEq(after.started, true, '3-1 in-memory: started=true');
  // localStorage 上も started=true
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.started, true, '3-2 localStorage: started=true');
  // warn / alert なし
  assertEq(env._warnCalls.length, 0, '3-3 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '3-4 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '3-5 showMsg(.., warn) は出ていない');
}

// ============================================================
// 4. startTournament 保存失敗: warn 表示 / rollback なし / alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  env._setState(s);

  env._ctx.localStorage._failOnSet = true;
  env.startTournament();

  const after = env._getState();
  // in-memory は反映（rollback しない）
  assertEq(after.started, true, '4-1 in-memory: started=true（rollback しない）');
  // localStorage は更新失敗のため null
  assertEq(env.readPersistedState(), null, '4-2 localStorage 未更新（null）');
  // warn 表示
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '4-3 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '4-4 「保存未確認」表現の文言');
  assert(env._regMsgHtml().indexOf('保存失敗') === -1, '4-5 「保存失敗」と断定しない');
  // console.warn
  const warnText = env._warnCalls.join('\n');
  assert(env._warnCalls.length >= 1, '4-6 console.warn が呼ばれる');
  assert(warnText.indexOf('SAVE-003') !== -1, '4-7 console.warn に SAVE-003 タグ');
  assert(warnText.indexOf('startTournament') !== -1, '4-8 console.warn に startTournament を含む');
  // alert は呼ばれない
  assertEq(env._alertCalls.length, 0, '4-9 alert は呼ばれない');
}

// ============================================================
// 5. generatePairing 正常: 保存検証成功 / warn なし / alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p2','佐藤','A',2),
    makePlayer('p3','鈴木','A',3),
    makePlayer('p4','高橋','A',4),
  ];
  s.started = true;
  env._setState(s);

  env.generatePairing('A');

  const after = env._getState();
  assertEq(after.pairings.A.length, 2, '5-1 in-memory: pairings.A 件数 = 2');
  // localStorage 上も同件数
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.pairings && persisted.pairings.A.length, 2, '5-2 localStorage: pairings.A 件数 = 2');
  assertEq(env._warnCalls.length, 0, '5-3 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '5-4 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '5-5 showMsg(.., warn) は出ていない');
}

// ============================================================
// 6. generatePairing 保存失敗: warn 表示 / rollback なし / alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A',1),
    makePlayer('p2','佐藤','A',2),
  ];
  s.started = true;
  env._setState(s);

  env._ctx.localStorage._failOnSet = true;
  env.generatePairing('A');

  const after = env._getState();
  // in-memory に pairings は生成されている
  assertEq(after.pairings.A.length, 1, '6-1 in-memory: pairings.A 件数 = 1（rollback しない）');
  // localStorage は未更新
  assertEq(env.readPersistedState(), null, '6-2 localStorage 未更新（null）');
  // warn 表示
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '6-3 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '6-4 「保存未確認」表現の文言');
  // console.warn
  const warnText = env._warnCalls.join('\n');
  assert(env._warnCalls.length >= 1, '6-5 console.warn が呼ばれる');
  assert(warnText.indexOf('SAVE-003') !== -1, '6-6 console.warn に SAVE-003 タグ');
  assert(warnText.indexOf('generatePairing') !== -1, '6-7 console.warn に generatePairing を含む');
  assert(warnText.indexOf('cls=A') !== -1, '6-8 console.warn に cls=A を含む');
  // alert は呼ばれない
  assertEq(env._alertCalls.length, 0, '6-9 alert は呼ばれない');
}

// ============================================================
// 7. setWinner 正常: 保存検証成功 / warn なし / alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  env.setWinner('A', 0, 'p1');

  const after = env._getState();
  assertEq(after.pairings.A[0].winner, 'p1', '7-1 in-memory: winner=p1');
  // localStorage 上も同じ
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.pairings.A[0].winner, 'p1', '7-2 localStorage: winner=p1');
  assertEq(env._warnCalls.length, 0, '7-3 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '7-4 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '7-5 showMsg(.., warn) は出ていない');
}

// ============================================================
// 8. setWinner: 同 wid 再タップで toggle off（winner=null）も検証成功
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  // 同じ wid を再タップ → toggle off
  env.setWinner('A', 0, 'p1');

  const after = env._getState();
  assertEq(after.pairings.A[0].winner, null, '8-1 in-memory: winner=null（toggle off）');
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.pairings.A[0].winner, null, '8-2 localStorage: winner=null');
  assertEq(env._warnCalls.length, 0, '8-3 console.warn は呼ばれない');
}

// ============================================================
// 9. setWinner 保存失敗: warn 表示 / rollback なし / alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  env._ctx.localStorage._failOnSet = true;
  env.setWinner('A', 0, 'p2');

  const after = env._getState();
  // in-memory は反映
  assertEq(after.pairings.A[0].winner, 'p2', '9-1 in-memory: winner=p2（rollback しない）');
  // localStorage は古い値（winner=null）のまま
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.pairings.A[0].winner, null, '9-2 localStorage: winner=null（更新失敗）');
  // warn 表示
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '9-3 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '9-4 「保存未確認」表現の文言');
  // console.warn
  const warnText = env._warnCalls.join('\n');
  assert(env._warnCalls.length >= 1, '9-5 console.warn が呼ばれる');
  assert(warnText.indexOf('SAVE-003') !== -1, '9-6 console.warn に SAVE-003 タグ');
  assert(warnText.indexOf('setWinner') !== -1, '9-7 console.warn に setWinner を含む');
  assert(warnText.indexOf('cls=A') !== -1, '9-8 console.warn に cls=A を含む');
  assert(warnText.indexOf('idx=0') !== -1, '9-9 console.warn に idx=0 を含む');
  assert(warnText.indexOf('expected=p2') !== -1, '9-10 console.warn に expected=p2 を含む');
  // alert は呼ばれない
  assertEq(env._alertCalls.length, 0, '9-11 alert は呼ばれない');
}

// ============================================================
// 10. submitRound 正常（rounds=1、最終回戦扱い）: 保存検証成功 / warn なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState(1);  // rounds=1 で内部 generatePairing を回避
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  env.submitRound('A');

  const after = env._getState();
  assertEq(after.results.A.length, 1, '10-1 in-memory: results.A 件数 = 1');
  assertEq(after.pairings.A.length, 0, '10-2 in-memory: pairings.A は空');
  // localStorage 上も同じ
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.results.A.length, 1, '10-3 localStorage: results.A 件数 = 1');
  assertEq(persisted && persisted.pairings.A.length, 0, '10-4 localStorage: pairings.A 空');
  assertEq(env._warnCalls.length, 0, '10-5 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '10-6 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '10-7 showMsg(.., warn) は出ていない');
}

// ============================================================
// 11. submitRound 保存失敗（rounds=1）: warn 表示 / rollback なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState(1);
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  // 保存済み snapshot を取り、以降の setItem を失敗させる
  env._ctx.localStorage._failOnSet = true;
  env.submitRound('A');

  const after = env._getState();
  // in-memory は反映（rollback しない）
  assertEq(after.results.A.length, 1, '11-1 in-memory: results.A 件数 = 1（rollback しない）');
  assertEq(after.pairings.A.length, 0, '11-2 in-memory: pairings.A 空');
  // localStorage は古い値のまま（results 件数=0、pairings 件数=1）
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.results.A.length, 0, '11-3 localStorage: results.A 件数 = 0（更新失敗）');
  assertEq(persisted && persisted.pairings.A.length, 1, '11-4 localStorage: pairings.A 件数 = 1（更新失敗）');
  // warn 表示
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '11-5 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '11-6 「保存未確認」表現の文言');
  // console.warn（submitRound タグ含む）
  const warnText = env._warnCalls.join('\n');
  // 注: submitRound 内で SAVE-003 warn が出る。alert は出ない（submitRound が submitRound 内バリデーションを通過済み）
  assert(env._warnCalls.length >= 1, '11-7 console.warn が呼ばれる');
  assert(warnText.indexOf('SAVE-003') !== -1, '11-8 console.warn に SAVE-003 タグ');
  assert(warnText.indexOf('submitRound') !== -1, '11-9 console.warn に submitRound を含む');
  // alert は呼ばれない（submitRound 内のバリデーション alert も通過していないため）
  assertEq(env._alertCalls.length, 0, '11-10 alert は呼ばれない');
}

// ============================================================
// 12. submitRound（rounds=2、内部で generatePairing が再実行）正常時の verify
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState(2);
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  env.submitRound('A');

  const after = env._getState();
  // results に 1 round 追加、in-memory の pairings は内部 generatePairing で再生成（1 件）
  assertEq(after.results.A.length, 1, '12-1 in-memory: results.A 件数 = 1');
  assertEq(after.pairings.A.length, 1, '12-2 in-memory: pairings.A 再生成（1 件）');
  // localStorage 上も同じ
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.results.A.length, 1, '12-3 localStorage: results.A 件数 = 1');
  assertEq(persisted && persisted.pairings.A.length, 1, '12-4 localStorage: pairings.A 件数 = 1');
  // 正常パスでは warn なし
  assertEq(env._warnCalls.length, 0, '12-5 正常パス: console.warn なし');
  assertEq(env._alertCalls.length, 0, '12-6 alert は呼ばれない');
}

// ============================================================
// 13. setWinner: localStorage 構造不正（pairings 欠落）でも warn 1 回（クラッシュしない）
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  // setItem 後の localStorage を pairings 欠落の壊れた構造で上書きしておく ＋ 以降 setItem を失敗
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({rounds:4});
  env._ctx.localStorage._failOnSet = true;

  env.setWinner('A', 0, 'p1');

  // 構造不正で readPersistedState は state を返すが pairings が無いため verify false
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '13-1 showMsg(.., warn) が出ている');
  assert(env._warnCalls.length >= 1, '13-2 console.warn が呼ばれる');
  assertEq(env._alertCalls.length, 0, '13-3 alert は呼ばれない');
}

// ============================================================
// 14. SAVE-001 / SAVE-002 共存: 既存 helper が同居していても干渉しない
// ============================================================
{
  const env = loadEnv(targetPath);
  // readPersistedState は新規 helper として呼べる
  assert(typeof env.readPersistedState === 'function', '14-1 readPersistedState がエクスポート可能');
  // 既存 4 関数も呼べる
  assert(typeof env.startTournament === 'function', '14-2 startTournament がエクスポート可能');
  assert(typeof env.generatePairing === 'function', '14-3 generatePairing がエクスポート可能');
  assert(typeof env.setWinner === 'function', '14-4 setWinner がエクスポート可能');
  assert(typeof env.submitRound === 'function', '14-5 submitRound がエクスポート可能');
}

// ============================================================
// 結果
// ============================================================
console.log('PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
