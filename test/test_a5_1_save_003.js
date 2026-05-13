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
       pairingsMatchSnapshot:pairingsMatchSnapshot,
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
  // SAVE-004 で generatePairing の warn タグを SAVE-003 → SAVE-004 に変更
  assert(warnText.indexOf('SAVE-004') !== -1, '6-6 console.warn に SAVE-004 タグ');
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
  // PR #48 Codex Should Fix: pairingsMatchSnapshot helper も追加
  assert(typeof env.pairingsMatchSnapshot === 'function', '14-6 pairingsMatchSnapshot がエクスポート可能');
}

// ============================================================
// 15. PR #48 Codex Must Fix: readPersistedState が state schema 不正 object を null にする
// ============================================================
{
  const env = loadEnv(targetPath);
  const STORAGE_KEY = env.STORAGE_KEY;
  // 15-1: {started:true} のみは不正（players 構造なし）
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({started:true});
  assertEq(env.readPersistedState(), null, '15-1 {started:true} のみは null（players 欠落）');

  // 15-2: players が非 object
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:'not_object',pairings:{A:[],B:[]},results:{A:[],B:[]}});
  assertEq(env.readPersistedState(), null, '15-2 players 非 object は null');

  // 15-3: players.A が Array でない
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:'not_array',B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  assertEq(env.readPersistedState(), null, '15-3 players.A 非 Array は null');

  // 15-4: players.B が Array でない
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:null},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  assertEq(env.readPersistedState(), null, '15-4 players.B 非 Array は null');

  // 15-5: pairings が非 object
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]},pairings:'not_object',results:{A:[],B:[]}});
  assertEq(env.readPersistedState(), null, '15-5 pairings 非 object は null');

  // 15-6: pairings.A が Array でない
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]},pairings:{A:'x',B:[]},results:{A:[],B:[]}});
  assertEq(env.readPersistedState(), null, '15-6 pairings.A 非 Array は null');

  // 15-7: pairings.B が Array でない
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]},pairings:{A:[],B:42},results:{A:[],B:[]}});
  assertEq(env.readPersistedState(), null, '15-7 pairings.B 非 Array は null');

  // 15-8: results が非 object
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]},pairings:{A:[],B:[]},results:'not_object'});
  assertEq(env.readPersistedState(), null, '15-8 results 非 object は null');

  // 15-9: results.A が Array でない
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:'x',B:[]}});
  assertEq(env.readPersistedState(), null, '15-9 results.A 非 Array は null');

  // 15-10: results.B が Array でない
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:false}});
  assertEq(env.readPersistedState(), null, '15-10 results.B 非 Array は null');

  // 15-11: 全フィールド OK は state を返す（最低限 schema を満たせば null にしない）
  env._ctx.localStorage._[STORAGE_KEY] = JSON.stringify({players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]},started:false});
  const got = env.readPersistedState();
  assert(got !== null, '15-11 最低限 schema を満たす object は state を返す');
  assertEq(got && got.started, false, '15-12 戻り値が parsed 内容を保持');
}

// ============================================================
// 16. PR #48 Codex Must Fix: startTournament false positive 防止
//     localStorage に {started:true} のような壊れた object が残っていても、
//     schema 不正で readPersistedState が null を返すため warn が出ること。
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  env._setState(s);

  // 壊れた state を pre-populate（started=true だが players/pairings/results 欠落）
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({started:true});
  // 以降の setItem を失敗させて、startTournament の save() を空振りに
  env._ctx.localStorage._failOnSet = true;

  env.startTournament();

  // localStorage は依然として壊れた state（更新失敗）
  assertEq(env.readPersistedState(), null, '16-1 localStorage は schema 不正で null');
  // 旧実装（schema 検証なし）なら persisted_st.started===true で false negative。
  // 新実装は readPersistedState が null を返すため warn が出る。
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '16-2 startTournament で warn 表示（false positive 防止）');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003') !== -1, '16-3 console.warn に SAVE-003 タグ');
  assert(warnText.indexOf('startTournament') !== -1, '16-4 console.warn に startTournament を含む');
  assertEq(env._alertCalls.length, 0, '16-5 alert は呼ばれない');
}

// ============================================================
// 17. PR #48 Codex Should Fix: submitRound の pairings stale 検知
//     length は同じ 1 だが中身が異なる stale pairings が localStorage に残っている場合、
//     pairingsMatchSnapshot の field-compare で warn が出ること。
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState(2);
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  s.pairings.A = [{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'auto'}];
  env._setState(s);
  env.save();

  // localStorage を「同件数だが中身が異なる stale」で上書き:
  //   results.A は 1 件（length 一致でも results.length チェックを通すため pre-fill）
  //   pairings.A は 1 件で内容が完全に異なる
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({
    players: { A: s.players.A, B: [] },
    rounds: 2,
    started: true,
    pairings: { A: [{p1:'staleX',p2:'staleY',winner:null,lastModifiedBy:'auto'}], B: [] },
    results: { A: [{p1:'r1px',p2:'r1py',winner:'r1px',lastModifiedBy:'auto'}], B: [] },
    report: {date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  env._ctx.localStorage._failOnSet = true;

  env.submitRound('A');

  // in-memory は反映: results.A=[match1 snapshot]、pairings.A=[新ペア（generatePairing 内部）]
  const after = env._getState();
  assertEq(after.results.A.length, 1, '17-1 in-memory: results.A 件数 = 1');
  assertEq(after.pairings.A.length, 1, '17-2 in-memory: pairings.A 件数 = 1（rounds=2 で再生成）');

  // localStorage は stale のまま:
  //   results.A.length は 1（in-memory と一致）
  //   pairings.A.length も 1（in-memory と一致）→ 旧 length-only check ならすり抜ける
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.results.A.length, 1, '17-3 localStorage: results.A 件数 = 1（stale）');
  assertEq(persisted && persisted.pairings.A.length, 1, '17-4 localStorage: pairings.A 件数 = 1（stale 内容）');
  // pairingsMatchSnapshot は中身を見て不一致を検出
  assertEq(env.pairingsMatchSnapshot(persisted.pairings.A, after.pairings.A), false, '17-5 pairingsMatchSnapshot で stale 検知');

  // warn 表示（field-compare による検知）
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '17-6 stale pairings 検知で showMsg(.., warn)');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003') !== -1, '17-7 console.warn に SAVE-003 タグ');
  assert(warnText.indexOf('submitRound') !== -1, '17-8 console.warn に submitRound を含む');
  assertEq(env._alertCalls.length, 0, '17-9 alert は呼ばれない');
}

// ============================================================
// 18. pairingsMatchSnapshot helper 単体: field-compare の挙動確認
// ============================================================
{
  const env = loadEnv(targetPath);
  // 完全一致
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}],
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}]
  ), true, '18-1 完全一致は true');

  // p1 不一致
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'X',p2:'b',winner:null,lastModifiedBy:'auto'}],
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}]
  ), false, '18-2 p1 不一致は false');

  // p2 不一致
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'Y',winner:null,lastModifiedBy:'auto'}],
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}]
  ), false, '18-3 p2 不一致は false');

  // winner 不一致
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'b',winner:'a',lastModifiedBy:'auto'}],
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}]
  ), false, '18-4 winner 不一致は false');

  // length 不一致
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}],
    []
  ), false, '18-5 length 不一致は false');

  // 両側空は true（length 0 == 0）
  assertEq(env.pairingsMatchSnapshot([], []), true, '18-6 両側空は true');

  // 非 Array は false
  assertEq(env.pairingsMatchSnapshot(null, []), false, '18-7 persisted null は false');
  assertEq(env.pairingsMatchSnapshot([], null), false, '18-8 expected null は false');

  // lastModifiedBy が片側のみ → 容認（既存データ互換）
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'b',winner:null}],
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}]
  ), true, '18-9 lastModifiedBy 片側欠損は容認（true）');
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}],
    [{p1:'a',p2:'b',winner:null}]
  ), true, '18-10 expected 側欠損も容認（true）');

  // 両側に lastModifiedBy があり値が違う → false
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'manual'}],
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'}]
  ), false, '18-11 両側 lastModifiedBy 不一致は false');
}

// ============================================================
// 19. A-5.1-SAVE-004: generatePairing の保存確認を pairingsMatchSnapshot で field-compare に強化
//     length 一致だけでは「同件数だが中身が古い stale pairings」を見逃す。
//     pairings.A.length は同じ 1 だが p1/p2 が違う stale を localStorage に残し、
//     pairingsMatchSnapshot による検出で warn が出ること。
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',1), makePlayer('p2','佐藤','A',2)];
  s.started = true;
  env._setState(s);
  env.save();

  // localStorage を「pairings.A は 1 件だが中身が完全に異なる stale」で上書き
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({
    players: { A: s.players.A, B: [] },
    rounds: 4,
    started: true,
    pairings: { A: [{p1:'staleX',p2:'staleY',winner:null,lastModifiedBy:'auto'}], B: [] },
    results: { A: [], B: [] },
    report: {date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  });
  // setItem を失敗させ、save() で stale が上書きされないようにする
  env._ctx.localStorage._failOnSet = true;

  env.generatePairing('A');

  const after = env._getState();
  // in-memory: 新ペア（1 件、p1/p2 = 田中/佐藤 のいずれかの並び）が生成される
  assertEq(after.pairings.A.length, 1, '19-1 in-memory: pairings.A 件数 = 1（rollback しない）');

  // localStorage は stale のまま:
  //   pairings.A.length も 1（in-memory と一致）→ 旧 length-only check ならすり抜ける
  const persisted = env.readPersistedState();
  assertEq(persisted && persisted.pairings.A.length, 1, '19-2 localStorage: pairings.A 件数 = 1（stale 内容）');
  // pairingsMatchSnapshot は中身を見て不一致を検出
  assertEq(env.pairingsMatchSnapshot(persisted.pairings.A, after.pairings.A), false, '19-3 pairingsMatchSnapshot で stale 検知');

  // warn 表示（field-compare による検知）
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '19-4 stale pairings 検知で showMsg(.., warn)');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '19-5 「保存未確認」表現の文言');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-004') !== -1, '19-6 console.warn に SAVE-004 タグ');
  assert(warnText.indexOf('generatePairing') !== -1, '19-7 console.warn に generatePairing を含む');
  assert(warnText.indexOf('cls=A') !== -1, '19-8 console.warn に cls=A を含む');
  // alert / rollback なし
  assertEq(env._alertCalls.length, 0, '19-9 alert は呼ばれない');
}

// ============================================================
// 20. A-5.1-SAVE-004: length-only 回帰防止
//     length 一致のみのチェックでは見逃すケース（p1/p2/winner/lastModifiedBy のいずれかが違う）を
//     pairingsMatchSnapshot 経由で検出し、保存確認成功扱いにしないこと。
// ============================================================
{
  const env = loadEnv(targetPath);

  // 20-1〜20-2: p1 だけ違う / 同件数 → length のみなら一致するが false にならねばならない
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'staleX',p2:'p2',winner:null,lastModifiedBy:'auto'}],
    [{p1:'p1',     p2:'p2',winner:null,lastModifiedBy:'auto'}]
  ), false, '20-1 length 一致でも p1 違いは false');

  // 20-2: p2 だけ違う
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'p1',p2:'staleY',winner:null,lastModifiedBy:'auto'}],
    [{p1:'p1',p2:'p2',     winner:null,lastModifiedBy:'auto'}]
  ), false, '20-2 length 一致でも p2 違いは false');

  // 20-3: winner だけ違う
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'p1',p2:'p2',winner:'p1',lastModifiedBy:'auto'}],
    [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}]
  ), false, '20-3 length 一致でも winner 違いは false');

  // 20-4: lastModifiedBy が両側に存在し値が違う（旧データ互換ではない）
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'manual'}],
    [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}]
  ), false, '20-4 length 一致でも両側 lastModifiedBy 不一致は false');

  // 20-5: 旧データ互換 — lastModifiedBy が片側欠損 → 容認（pairingsMatchSnapshot の既存仕様）
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'p1',p2:'p2',winner:null}],
    [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}]
  ), true, '20-5 lastModifiedBy 片側欠損は true（旧データ互換）');

  // 20-6: 件数が同じ複数件で 1 件だけ違う場合も検出
  assertEq(env.pairingsMatchSnapshot(
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'},{p1:'X',p2:'d',winner:null,lastModifiedBy:'auto'}],
    [{p1:'a',p2:'b',winner:null,lastModifiedBy:'auto'},{p1:'c',p2:'d',winner:null,lastModifiedBy:'auto'}]
  ), false, '20-6 複数件で 1 件だけ違う場合も false');
}

// ============================================================
// 21. A-5.1-SAVE-004: 新規 helper 追加なしの確認
//     SAVE-004 では既存の pairingsMatchSnapshot を流用しており、新 helper を増やしていないこと。
// ============================================================
{
  const env = loadEnv(targetPath);
  // pairingsMatchSnapshot が引き続きエクスポート可能
  assert(typeof env.pairingsMatchSnapshot === 'function', '21-1 pairingsMatchSnapshot は既存のまま流用');
  // generatePairing 用に新規 helper を増やしていないことの間接確認:
  //   pairingsMatchSnapshot 以外の field-compare 系 helper（例: deepEqual / generatePairingMatchSnapshot 等）が
  //   エクスポートに登場していないこと。エクスポート集合は loadEnv の return オブジェクトに固定されている。
  const exportedKeys = Object.keys(env).filter(k => !k.startsWith('_'));
  // 期待エクスポート: STORAGE_KEY / readPersistedState / pairingsMatchSnapshot / startTournament /
  //                  generatePairing / setWinner / submitRound / save
  assert(exportedKeys.indexOf('deepEqual') === -1, '21-2 deepEqual は未追加');
  assert(exportedKeys.indexOf('generatePairingMatchSnapshot') === -1, '21-3 generatePairingMatchSnapshot は未追加');
}

// ============================================================
// 結果
// ============================================================
console.log('PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
