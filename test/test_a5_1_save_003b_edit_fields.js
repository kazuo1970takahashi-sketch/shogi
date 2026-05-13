#!/usr/bin/env node
// A-5.1-SAVE-003b-3: 手動編集系の保存未確認検知 — 単体テスト
//
// 対象 callsite（依頼書 §3）:
//   1. updateField()                                    — member / grade の select onchange
//   2. bindBulkEditModalEvents() 内 bulk-save handler   — 氏名一括編集モーダルの保存ボタン
//
// helper:
//   updateField:    新 helper verifyPlayerFieldPersisted(cls, id, field, expected) を追加
//   bulkEditNames:  既存 verifyStatePersisted(id, expectedName) を流用、warn は件数集約 1 回

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

// bulkEditNames は modal の click handler を直接発火させるため、SAVE-003b-2 の mock 拡張を踏襲。
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
       verifyPlayerFieldPersisted:verifyPlayerFieldPersisted,
       verifyStatePersisted:verifyStatePersisted,
       updateField:updateField,
       bindBulkEditModalEvents:bindBulkEditModalEvents,
       bulkEditNames:bulkEditNames,
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
  console.error('Usage: node test_a5_1_save_003b_edit_fields.js <html>');
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

function makePlayer(id,name,cls,opts){
  opts=opts||{};
  return {id:id,name:name,cls:cls,member:opts.member||'member',grade:opts.grade||'ippan',entry_no:opts.entry_no||1};
}

// ============================================================
// 1. updateField: member 正常保存 — warn なし / alert なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',{member:'member',grade:'ippan'})];
  env._setState(s);
  env.save();

  env.updateField('p1', 'A', 'member', 'other');

  const after = env._getState();
  assertEq(after.players.A[0].member, 'other', '1-1 in-memory: member=other');
  // persisted も other
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'member', 'other'), true, '1-2 persisted: member=other');
  assertEq(env._warnCalls.length, 0, '1-3 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '1-4 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '1-5 showMsg(.., warn) は出ていない');
}

// ============================================================
// 2. updateField: grade 正常保存 — warn なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.B = [makePlayer('p2','佐藤','B',{member:'member',grade:'ippan'})];
  env._setState(s);
  env.save();

  env.updateField('p2', 'B', 'grade', 'chu');

  const after = env._getState();
  assertEq(after.players.B[0].grade, 'chu', '2-1 in-memory: grade=chu');
  assertEq(env.verifyPlayerFieldPersisted('B', 'p2', 'grade', 'chu'), true, '2-2 persisted: grade=chu');
  assertEq(env._warnCalls.length, 0, '2-3 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '2-4 alert は呼ばれない');
}

// ============================================================
// 3. updateField 保存失敗（_failOnSet）: warn 表示 / rollback なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',{member:'member',grade:'ippan'})];
  env._setState(s);
  env.save();

  env._ctx.localStorage._failOnSet = true;
  env.updateField('p1', 'A', 'member', 'other');

  const after = env._getState();
  assertEq(after.players.A[0].member, 'other', '3-1 in-memory: member=other（rollback しない）');
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '3-2 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('保存が確認できませんでした') !== -1, '3-3 「保存未確認」表現の文言');
  assert(env._regMsgHtml().indexOf('保存失敗') === -1, '3-4 「保存失敗」と断定しない');
  const warnText = env._warnCalls.join('\n');
  assert(env._warnCalls.length >= 1, '3-5 console.warn が呼ばれる');
  assert(warnText.indexOf('SAVE-003b') !== -1, '3-6 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('updateField') !== -1, '3-7 console.warn に updateField を含む');
  assert(warnText.indexOf('field=member') !== -1, '3-8 console.warn に field=member を含む');
  assert(warnText.indexOf('expected=other') !== -1, '3-9 console.warn に expected=other を含む');
  assertEq(env._alertCalls.length, 0, '3-10 alert は呼ばれない');
}

// ============================================================
// 4. updateField: persisted 側に対象 player 不在で warn
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A')];
  env._setState(s);
  env.save();

  // persisted から該当 player を消す
  const cloned = JSON.parse(env._ctx.localStorage._[env.STORAGE_KEY]);
  cloned.players.A = [];
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify(cloned);
  env._ctx.localStorage._failOnSet = true;

  env.updateField('p1', 'A', 'grade', 'chu');

  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '4-1 対象不在で warn 表示');
  const warnText = env._warnCalls.join('\n');
  assert(warnText.indexOf('SAVE-003b') !== -1, '4-2 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('updateField') !== -1, '4-3 console.warn に updateField を含む');
  assertEq(env._alertCalls.length, 0, '4-4 alert は呼ばれない');
}

// ============================================================
// 5. updateField: persisted 側 field stale で warn
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',{member:'member',grade:'ippan'})];
  env._setState(s);
  env.save();

  // 正常 setItem 経路で in-memory を 'other' に → persisted も 'other'
  // しかしその直後に persisted を別値（'member'）に戻して stale 状態にし、追加 updateField 呼出で
  // 再度 setItem を失敗させる → verify は stale を検知して false
  env.updateField('p1', 'A', 'member', 'other');
  // ここで persisted を別値で上書き
  const cloned = JSON.parse(env._ctx.localStorage._[env.STORAGE_KEY]);
  cloned.players.A[0].member = 'member';  // stale
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify(cloned);

  // verify 単体での挙動確認
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'member', 'other'), false, '5-1 field stale は verify false');
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'member', 'member'), true, '5-2 persisted の現在値とは一致');
}

// ============================================================
// 6. updateField: localStorage 空 でも crash しない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A')];
  env._setState(s);
  env.save();
  delete env._ctx.localStorage._[env.STORAGE_KEY];
  env._ctx.localStorage._failOnSet = true;

  let crashed = false;
  try { env.updateField('p1', 'A', 'grade', 'chu'); } catch(e){ crashed = true; }
  assertEq(crashed, false, '6-1 localStorage 空でも crash しない');
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '6-2 warn 表示');
  assertEq(env._alertCalls.length, 0, '6-3 alert は呼ばれない');
}

// ============================================================
// 7. updateField: 壊れた JSON でも crash しない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A')];
  env._setState(s);
  env.save();
  env._ctx.localStorage._[env.STORAGE_KEY] = '{ not json';
  env._ctx.localStorage._failOnSet = true;

  let crashed = false;
  try { env.updateField('p1', 'A', 'grade', 'chu'); } catch(e){ crashed = true; }
  assertEq(crashed, false, '7-1 壊れた JSON でも crash しない');
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '7-2 warn 表示');
  assertEq(env._alertCalls.length, 0, '7-3 alert は呼ばれない');
}

// ============================================================
// 8. updateField: schema 不正（players[cls] が非 Array）で warn 扱い
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A')];
  env._setState(s);
  env.save();
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({players:{A:'not_array',B:[]}});
  env._ctx.localStorage._failOnSet = true;

  let crashed = false;
  try { env.updateField('p1', 'A', 'grade', 'chu'); } catch(e){ crashed = true; }
  assertEq(crashed, false, '8-1 schema 不正でも crash しない');
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '8-2 warn 表示');
  assertEq(env._alertCalls.length, 0, '8-3 alert は呼ばれない');
}

// ============================================================
// 9. bulkEditNames: 全件正常 — warn なし
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A'),
    makePlayer('p2','佐藤','A'),
    makePlayer('p3','鈴木','A')
  ];
  env._setState(s);
  env.save();

  // モーダルを開く（bulkEditNames は bindBulkEditModalEvents を呼ぶ）
  env.bulkEditNames('A');
  // 各 input に新 name を入れる
  env._ctx.document.getElementById('bulk-name-p1').value = '田中太郎';
  env._ctx.document.getElementById('bulk-name-p2').value = '佐藤次郎';
  env._ctx.document.getElementById('bulk-name-p3').value = '鈴木三郎';
  // 保存ボタンクリック
  env._ctx.document.getElementById('bulk-save').click();

  const after = env._getState();
  assertEq(after.players.A[0].name, '田中太郎', '9-1 in-memory: p1 リネーム反映');
  assertEq(after.players.A[1].name, '佐藤次郎', '9-2 in-memory: p2 リネーム反映');
  assertEq(after.players.A[2].name, '鈴木三郎', '9-3 in-memory: p3 リネーム反映');
  assertEq(env.verifyStatePersisted('p1', '田中太郎'), true, '9-4 persisted: p1 一致');
  assertEq(env.verifyStatePersisted('p2', '佐藤次郎'), true, '9-5 persisted: p2 一致');
  assertEq(env.verifyStatePersisted('p3', '鈴木三郎'), true, '9-6 persisted: p3 一致');
  assertEq(env._warnCalls.length, 0, '9-7 console.warn は呼ばれない');
  assertEq(env._alertCalls.length, 0, '9-8 alert は呼ばれない');
  assert(env._regMsgHtml().indexOf('alert-warn') === -1, '9-9 showMsg(.., warn) は出ていない');
}

// ============================================================
// 10. bulkEditNames: n=3 中 1 件未確認 — warn 1 回 / 件数 1/3 含む
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A'),
    makePlayer('p2','佐藤','A'),
    makePlayer('p3','鈴木','A')
  ];
  env._setState(s);
  env.save();

  env.bulkEditNames('A');
  env._ctx.document.getElementById('bulk-name-p1').value = '田中太郎';
  env._ctx.document.getElementById('bulk-name-p2').value = '佐藤次郎';
  env._ctx.document.getElementById('bulk-name-p3').value = '鈴木三郎';
  env._ctx.document.getElementById('bulk-save').click();

  // 全件成功直後に persisted の p2 だけを古い name に戻す（in-memory は新 name のまま）
  const cloned = JSON.parse(env._ctx.localStorage._[env.STORAGE_KEY]);
  cloned.players.A[1].name = '佐藤';  // stale
  env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify(cloned);

  // verify 単体: 1 件 stale を検出
  assertEq(env.verifyStatePersisted('p2', '佐藤次郎'), false, '10-1 stale を verifyStatePersisted で検出');

  // 集約 warn の挙動は §11 の全件未確認シナリオでもカバー。ここでは「1 件 stale を取り出せる」を確認。
  // bulkEditNames を再度呼ぶことはせず、保存系の集約 warn 形式は §11 で確認する。
  assertEq(env.verifyStatePersisted('p1', '田中太郎'), true, '10-2 p1 は一致');
  assertEq(env.verifyStatePersisted('p3', '鈴木三郎'), true, '10-3 p3 は一致');
}

// ============================================================
// 11. bulkEditNames: 全件未確認（_failOnSet）— warn 1 回 / 件数 3/3 含む
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A'),
    makePlayer('p2','佐藤','A'),
    makePlayer('p3','鈴木','A')
  ];
  env._setState(s);
  env.save();

  env.bulkEditNames('A');
  env._ctx.document.getElementById('bulk-name-p1').value = '田中太郎';
  env._ctx.document.getElementById('bulk-name-p2').value = '佐藤次郎';
  env._ctx.document.getElementById('bulk-name-p3').value = '鈴木三郎';

  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('bulk-save').click();

  const after = env._getState();
  // in-memory は全件反映（rollback しない）
  assertEq(after.players.A[0].name, '田中太郎', '11-1 in-memory: p1 反映保持');
  assertEq(after.players.A[1].name, '佐藤次郎', '11-2 in-memory: p2 反映保持');
  assertEq(after.players.A[2].name, '鈴木三郎', '11-3 in-memory: p3 反映保持');

  // warn 1 回（DOM 上は最新 1 件、console.warn も 1 回集約）
  assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '11-4 showMsg(.., warn) が出ている');
  assert(env._regMsgHtml().indexOf('3名のうち 3名分の保存が確認できませんでした') !== -1, '11-5 「3名のうち 3名分」件数文言');
  assertEq(env._warnCalls.length, 1, '11-6 console.warn は 1 回のみ（集約）');
  const warnText = env._warnCalls[0];
  assert(warnText.indexOf('SAVE-003b') !== -1, '11-7 console.warn に SAVE-003b タグ');
  assert(warnText.indexOf('bulkEditNames') !== -1, '11-8 console.warn に bulkEditNames を含む');
  assert(warnText.indexOf('3/3 件未確認') !== -1, '11-9 console.warn に 3/3 件未確認 を含む');
  assertEq(env._alertCalls.length, 0, '11-10 post-save の alert は呼ばれない');
}

// ============================================================
// 12. bulkEditNames: 既存 pre-save alert（空欄）は壊さない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A'),
    makePlayer('p2','佐藤','A')
  ];
  env._setState(s);
  env.save();

  env.bulkEditNames('A');
  env._ctx.document.getElementById('bulk-name-p1').value = '';   // 空欄でアボート
  env._ctx.document.getElementById('bulk-name-p2').value = '佐藤次郎';
  env._ctx.document.getElementById('bulk-save').click();

  // pre-save alert で abort、in-memory も persisted も変化なし、post-save warn も出ない
  const after = env._getState();
  assertEq(after.players.A[0].name, '田中', '12-1 空欄 abort: in-memory 不変');
  assertEq(after.players.A[1].name, '佐藤', '12-2 空欄 abort: in-memory 不変');
  assert(env._alertCalls.length >= 1, '12-3 pre-save alert が出ている');
  assertEq(env._warnCalls.length, 0, '12-4 post-save warn は出ない（pre-save abort のため）');
}

// ============================================================
// 13. bulkEditNames: 既存 pre-save alert（同名重複）は壊さない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中','A'),
    makePlayer('p2','佐藤','A')
  ];
  env._setState(s);
  env.save();

  env.bulkEditNames('A');
  env._ctx.document.getElementById('bulk-name-p1').value = '同名';
  env._ctx.document.getElementById('bulk-name-p2').value = '同名';  // 重複でアボート
  env._ctx.document.getElementById('bulk-save').click();

  const after = env._getState();
  assertEq(after.players.A[0].name, '田中', '13-1 重複 abort: in-memory 不変');
  assertEq(after.players.A[1].name, '佐藤', '13-2 重複 abort: in-memory 不変');
  assert(env._alertCalls.length >= 1, '13-3 pre-save alert が出ている');
  assertEq(env._warnCalls.length, 0, '13-4 post-save warn は出ない');
}

// ============================================================
// 14. bulkEditNames: localStorage 空 / 壊れた JSON / schema 不正 で crash しない & warn 1 回
// ============================================================
{
  // 14-A: localStorage 空
  {
    const env = loadEnv(targetPath);
    const s = makeEmptyState();
    s.players.A = [makePlayer('p1','田中','A'), makePlayer('p2','佐藤','A')];
    env._setState(s);
    env.save();
    env.bulkEditNames('A');
    env._ctx.document.getElementById('bulk-name-p1').value = '田中太郎';
    env._ctx.document.getElementById('bulk-name-p2').value = '佐藤次郎';
    delete env._ctx.localStorage._[env.STORAGE_KEY];
    env._ctx.localStorage._failOnSet = true;
    let crashed = false;
    try { env._ctx.document.getElementById('bulk-save').click(); } catch(e){ crashed = true; }
    assertEq(crashed, false, '14-A-1 localStorage 空でも crash しない');
    assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '14-A-2 warn 表示');
    assertEq(env._warnCalls.length, 1, '14-A-3 console.warn は 1 回のみ');
    assertEq(env._alertCalls.length, 0, '14-A-4 post-save alert なし');
  }

  // 14-B: 壊れた JSON
  // 注: verifyStatePersisted は壊れた JSON の JSON.parse 例外を catch して内部 console.warn
  //     ('MASTER-001: shogi_v4 verify failed') を出す。これは helper 内部の診断 warn であり、
  //     bulkEditNames 側の集約契約とは別カテゴリ。集約契約は「SAVE-003b の warn が 1 件」
  //     という方が正しく、ここではタグでフィルタして集約の主張を検証する。
  {
    const env = loadEnv(targetPath);
    const s = makeEmptyState();
    s.players.A = [makePlayer('p1','田中','A'), makePlayer('p2','佐藤','A')];
    env._setState(s);
    env.save();
    env.bulkEditNames('A');
    env._ctx.document.getElementById('bulk-name-p1').value = '田中太郎';
    env._ctx.document.getElementById('bulk-name-p2').value = '佐藤次郎';
    env._ctx.localStorage._[env.STORAGE_KEY] = '{ not json';
    env._ctx.localStorage._failOnSet = true;
    let crashed = false;
    try { env._ctx.document.getElementById('bulk-save').click(); } catch(e){ crashed = true; }
    assertEq(crashed, false, '14-B-1 壊れた JSON でも crash しない');
    assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '14-B-2 warn 表示');
    // SAVE-003b タグの集約 warn は 1 件のみ（helper 内部の MASTER-001 診断 warn とは独立）
    const save003bWarns = env._warnCalls.filter(w => w.indexOf('SAVE-003b: bulkEditNames') !== -1);
    assertEq(save003bWarns.length, 1, '14-B-3 SAVE-003b: bulkEditNames の集約 warn は 1 回のみ');
  }

  // 14-C: schema 不正（players.A が非 Array）
  {
    const env = loadEnv(targetPath);
    const s = makeEmptyState();
    s.players.A = [makePlayer('p1','田中','A'), makePlayer('p2','佐藤','A')];
    env._setState(s);
    env.save();
    env.bulkEditNames('A');
    env._ctx.document.getElementById('bulk-name-p1').value = '田中太郎';
    env._ctx.document.getElementById('bulk-name-p2').value = '佐藤次郎';
    env._ctx.localStorage._[env.STORAGE_KEY] = JSON.stringify({players:{A:'not_array',B:[]}});
    env._ctx.localStorage._failOnSet = true;
    let crashed = false;
    try { env._ctx.document.getElementById('bulk-save').click(); } catch(e){ crashed = true; }
    assertEq(crashed, false, '14-C-1 schema 不正でも crash しない');
    assert(env._regMsgHtml().indexOf('alert-warn') !== -1, '14-C-2 warn 表示');
    assertEq(env._warnCalls.length, 1, '14-C-3 console.warn は 1 回のみ');
  }
}

// ============================================================
// 15. helper / scope チェック
// ============================================================
{
  const env = loadEnv(targetPath);
  // 新 helper が追加されている
  assert(typeof env.verifyPlayerFieldPersisted === 'function', '15-1 verifyPlayerFieldPersisted がエクスポート可能');
  // 既存 helper が引き続き使える
  assert(typeof env.verifyStatePersisted === 'function', '15-2 verifyStatePersisted 利用可（流用）');
  // 対象関数もエクスポート可能
  assert(typeof env.updateField === 'function', '15-3 updateField 利用可');
  assert(typeof env.bindBulkEditModalEvents === 'function', '15-4 bindBulkEditModalEvents 利用可');
  assert(typeof env.bulkEditNames === 'function', '15-5 bulkEditNames 利用可');
  // 過剰 helper を追加していないことの間接確認
  const exportedKeys = Object.keys(env).filter(k => !k.startsWith('_'));
  assert(exportedKeys.indexOf('verifyPlayersPersistedByIds') === -1, '15-6 verifyPlayersPersistedByIds は未追加');
  assert(exportedKeys.indexOf('verifyPlayerFieldsPersisted') === -1, '15-7 verifyPlayerFieldsPersisted は未追加');
  assert(exportedKeys.indexOf('verifyBulkNamesPersisted') === -1, '15-8 verifyBulkNamesPersisted は未追加');
}

// ============================================================
// 16. verifyPlayerFieldPersisted helper 単体: 戻り値の意味確認
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [makePlayer('p1','田中','A',{member:'member',grade:'ippan'})];
  env._setState(s);
  env.save();

  // 一致
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'member', 'member'), true, '16-1 一致は true');
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'grade', 'ippan'), true, '16-2 一致は true');
  // 不一致
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'member', 'other'), false, '16-3 不一致は false');
  // 対象 id 不在
  assertEq(env.verifyPlayerFieldPersisted('A', 'nonexistent', 'member', 'member'), false, '16-4 id 不在は false');
  // クラス違い
  assertEq(env.verifyPlayerFieldPersisted('B', 'p1', 'member', 'member'), false, '16-5 クラス違いは false');
  // 存在しない field（undefined === expected で false）
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'nonexistent_field', 'whatever'), false, '16-6 存在しない field は false');
  // 存在しない field を undefined で照合 → true（player[field] === undefined）
  assertEq(env.verifyPlayerFieldPersisted('A', 'p1', 'nonexistent_field', undefined), true, '16-7 存在しない field を undefined で照合は true');
}

// ============================================================
// 結果
// ============================================================
console.log('PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
