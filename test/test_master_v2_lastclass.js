#!/usr/bin/env node
// MASTER-V2-LASTCLASS-IMPL: master 更新経路の保存後 re-read verify — 単体テスト
//
// 対象 callsite（設計書 §5.1 Must、docs/specs/20260513_shogi_master_v2_lastclass_design.md）:
//   - S03: handlePastParticipantClassAdd の既登録者クラス変更分岐（changePlayerClass → saveBranchMaster）
//   - S05: handleSuggestClassAdd の既登録者クラス変更分岐（changePlayerClass → saveBranchMaster）
//   - S22: 会員マスタ編集モーダル保存（applyMasterMemberEdit → saveBranchMaster、4 fields）
//
// 新規 helper: verifyMasterFieldPersisted（whitelist=['last_class','member','grade','city']）
//
// 重要前提:
//   - S03 / S05 は既登録者クラス変更分岐のみが verify 対象。未登録新規追加分岐では
//     master.last_class を更新しないため、誤 warn が出ない。
//   - S22 expected は applyMasterMemberEdit 適用後の in-memory master member 値（city は
//     normalizeCity による trim / 20文字丸めが入るため、フォーム生値を expected にすると
//     false negative）。

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

// addEventListener / click を発火可能、getAttribute / setAttribute / getElementsByName 対応の mock。
function makeContext() {
  const elements = {};
  const elementsByName = {};

  function makeElem(id) {
    const handlers = {};
    const attrs = {};
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
        const self = this;
        const fns = handlers.click || [];
        for(let i=0;i<fns.length;i++)fns[i].call(self);
      },
      value: '',
      textContent: '',
      firstChild: null,
      disabled: false,
      getAttribute(k){return Object.prototype.hasOwnProperty.call(attrs,k)?attrs[k]:null;},
      setAttribute(k,v){attrs[k]=String(v);},
      _attrs: attrs,
      _handlers: handlers
    };
  }

  const docMock = {
    _elements: elements,
    _elementsByName: elementsByName,
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElem(id);
      return elements[id];
    },
    getElementsByName(name) {
      return elementsByName[name] || [];
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
  const confirmFn = function(){ return true; };  // case 2 のクラス変更確認を通過させる
  const consoleMock = {
    log: function(){},
    error: function(){},
    warn: function(){
      const parts = Array.prototype.slice.call(arguments).map(function(a){
        if(typeof a==='string')return a;
        try{return JSON.stringify(a);}catch(e){return String(a);}
      });
      warnCalls.push(parts.join(' '));
    }
  };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       STORAGE_KEY:STORAGE_KEY,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       verifyMasterFieldPersisted:verifyMasterFieldPersisted,
       MASTER_V2_VERIFIABLE_FIELDS:MASTER_V2_VERIFIABLE_FIELDS,
       handlePastParticipantClassAdd:handlePastParticipantClassAdd,
       handleSuggestClassAdd:handleSuggestClassAdd,
       bindMasterEditModalEvents:bindMasterEditModalEvents,
       createEmptyBranchMaster:createEmptyBranchMaster,
       saveBranchMaster:saveBranchMaster,
       loadBranchMaster:loadBranchMaster,
       normalizeCity:normalizeCity,
       applyMasterMemberEdit:applyMasterMemberEdit,
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
  api._masterV2Warns = function(){
    return warnCalls.filter(function(w){ return w.indexOf('[MASTER-V2-LASTCLASS]')!==-1; });
  };
  api._clear = function(){
    alertCalls.length = 0;
    warnCalls.length = 0;
  };
  api._registerRadio = function(name,value,checked){
    const r = { name:name, value:value, checked:!!checked, blur:function(){} };
    if(!ctx.document._elementsByName[name])ctx.document._elementsByName[name]=[];
    ctx.document._elementsByName[name].push(r);
    return r;
  };
  return api;
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_master_v2_lastclass.js <html>');
  process.exit(1);
}

let pass=0, fail=0;
function ok(){pass++;}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(); else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(); else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makeMember(id,name,opts){
  opts = opts || {};
  return {
    id:id,
    name:name,
    yomi:opts.yomi||'',
    last_class:(opts.last_class==='A'||opts.last_class==='B')?opts.last_class:(opts.last_class===null?null:null),
    last_attended:'2026-04-01',
    first_attended:'2026-01-01',
    attendance_count:0,
    tournament_ids:[],
    deleted:opts.deleted===true,
    deleted_at:null,
    note:'',
    member:opts.member||'member',
    grade:opts.grade||'ippan',
    city:opts.city||''
  };
}

function seedMaster(env, members){
  const master = env.createEmptyBranchMaster();
  master.members = members;
  env.saveBranchMaster(master);
  return master;
}

function makeEmptyState(){
  return {players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}};
}

// ============================================================================
// SECTION 1: verifyMasterFieldPersisted helper 単体テスト
// ============================================================================

// 1-1: 正常系 last_class='A'
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), true, '1-1 last_class A 一致');
}

// 1-2: 正常系 last_class='B'
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:'B'})]);
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','B'), true, '1-2 last_class B 一致');
}

// 1-3: 正常系 last_class=null
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:null})]);
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',null), true, '1-3 last_class null 一致');
}

// 1-4: 異常系 last_class='A' だが persisted='B' → false
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:'B'})]);
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-4 A expected vs B persisted → false');
}

// 1-5: 異常系 last_class='A' だが persisted=null → false
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:null})]);
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-5 A expected vs null persisted → false');
}

// 1-6: memberId 不在 → false
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  assertEq(env.verifyMasterFieldPersisted('m_unknown','last_class','A'), false, '1-6 memberId 不在 → false');
}

// 1-7: localStorage 値 null → false
{
  const env = loadEnv(targetPath);
  // BRANCH_MASTER_KEY を seed しない
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-7 localStorage 値 null → false');
}

// 1-8: JSON 不正 → false（catch 経由）
{
  const env = loadEnv(targetPath);
  env._ctx.localStorage._['shogi_branch_master'] = 'not-a-valid-json{{';
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-8 JSON 不正 → false');
}

// 1-9: schema_version が想定外（2） → false
{
  const env = loadEnv(targetPath);
  env._ctx.localStorage._['shogi_branch_master'] = JSON.stringify({
    schema_version:2,
    updated_at:'2026-05-13T00:00:00Z',
    members:[{id:'m1',name:'田中',last_class:'A',member:'member',grade:'ippan',city:''}]
  });
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-9 schema_version=2 → false');
}

// 1-10: members が配列でない → false
{
  const env = loadEnv(targetPath);
  env._ctx.localStorage._['shogi_branch_master'] = JSON.stringify({
    schema_version:1, updated_at:'2026-05-13', members:'not-array'
  });
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-10 members が配列でない → false');
}

// 1-11: whitelist 外 field → false
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  assertEq(env.verifyMasterFieldPersisted('m1','name','田中'), false, '1-11 whitelist 外 field (name) → false');
  assertEq(env.verifyMasterFieldPersisted('m1','yomi',''), false, '1-11b whitelist 外 field (yomi) → false');
  assertEq(env.verifyMasterFieldPersisted('m1','deleted',false), false, '1-11c whitelist 外 field (deleted) → false');
}

// 1-12: member / grade / city 一致確認
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{member:'other',grade:'chu',city:'静岡市'})]);
  assertEq(env.verifyMasterFieldPersisted('m1','member','other'), true, '1-12a member 一致 → true');
  assertEq(env.verifyMasterFieldPersisted('m1','member','member'), false, '1-12b member 不一致 → false');
  assertEq(env.verifyMasterFieldPersisted('m1','grade','chu'), true, '1-12c grade 一致 → true');
  assertEq(env.verifyMasterFieldPersisted('m1','grade','ippan'), false, '1-12d grade 不一致 → false');
  assertEq(env.verifyMasterFieldPersisted('m1','city','静岡市'), true, '1-12e city 一致 → true');
  assertEq(env.verifyMasterFieldPersisted('m1','city','沼津市'), false, '1-12f city 不一致 → false');
}

// 1-13: helper 内 catch 経路で console.warn が出ないこと
{
  const env = loadEnv(targetPath);
  env._ctx.localStorage._['shogi_branch_master'] = 'broken{{json';
  env._clear();
  const result = env.verifyMasterFieldPersisted('m1','last_class','A');
  assertEq(result, false, '1-13a 不正 JSON で false 返却');
  assertEq(env._warnCalls.length, 0, '1-13b helper 内 console.warn は呼ばれない（callsite 側 warn 一元化方針）');
}

// 1-14: 入力バリデーション（追加観点）
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  assertEq(env.verifyMasterFieldPersisted('','last_class','A'), false, '1-14a 空文字 memberId → false');
  assertEq(env.verifyMasterFieldPersisted(null,'last_class','A'), false, '1-14b null memberId → false');
  assertEq(env.verifyMasterFieldPersisted('m1','','A'), false, '1-14c 空文字 field → false');
  assertEq(env.verifyMasterFieldPersisted('m1',null,'A'), false, '1-14d null field → false');
}

// ============================================================================
// SECTION 2: S03 handlePastParticipantClassAdd 既登録者クラス変更分岐
// ============================================================================

// 2-1: S03 既登録者クラス変更 正常系 → MASTER-V2 warn なし
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  env.handlePastParticipantClassAdd('m1', 'B');  // A → B クラス変更

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, '2-1 S03 既登録者クラス変更 正常: MASTER-V2 warn なし');

  // master の last_class が B に更新され、persisted も B になっていることを確認
  const reload = env.loadBranchMaster();
  const m = reload.members.find(x=>x.id==='m1');
  assertEq(m.last_class, 'B', '2-1b S03 master.last_class が B に更新済み');
}

// 2-2: S03 既登録者クラス変更 保存失敗 → MASTER-V2 S03 warn
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  env._ctx.localStorage._failOnSet = true;
  env.handlePastParticipantClassAdd('m1', 'B');

  const v2Warns = env._masterV2Warns();
  assert(v2Warns.length >= 1, '2-2a S03 保存失敗時に MASTER-V2 warn が出る');
  assert(v2Warns.some(w => w.indexOf('S03 last_class verify failed')!==-1), '2-2b S03 タグ付き warn');
  assert(v2Warns.some(w => w.indexOf('"memberId":"m1"')!==-1 || w.indexOf("memberId':'m1'")!==-1), '2-2c warn メタに memberId 含まれる');
  assert(v2Warns.some(w => w.indexOf('"expected":"B"')!==-1 || w.indexOf("expected':'B'")!==-1), '2-2d warn メタに expected 含まれる');
}

// 2-3: S03 未登録新規追加分岐では MASTER-V2 verify を呼ばない（誤 warn 防止）
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  env._setState(s);  // 参加者ゼロ
  seedMaster(env, [makeMember('m2','佐藤',{last_class:'A'})]);
  env._clear();

  env._ctx.localStorage._failOnSet = true;  // 保存を強制失敗にしても誤 warn が出ないことを確認
  env.handlePastParticipantClassAdd('m2', 'B');  // 未登録 → case 1 新規追加分岐

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, '2-3 S03 未登録新規追加分岐では MASTER-V2 warn が出ない（誤 warn 防止）');
}

// ============================================================================
// SECTION 3: S05 handleSuggestClassAdd 既登録者クラス変更分岐
// ============================================================================

// 3-1: S05 既登録者クラス変更 正常系 → MASTER-V2 warn なし
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  env.handleSuggestClassAdd('m1', 'B');

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, '3-1 S05 既登録者クラス変更 正常: MASTER-V2 warn なし');

  const reload = env.loadBranchMaster();
  const m = reload.members.find(x=>x.id==='m1');
  assertEq(m.last_class, 'B', '3-1b S05 master.last_class が B に更新済み');
}

// 3-2: S05 既登録者クラス変更 保存失敗 → MASTER-V2 S05 warn
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  env._ctx.localStorage._failOnSet = true;
  env.handleSuggestClassAdd('m1', 'B');

  const v2Warns = env._masterV2Warns();
  assert(v2Warns.length >= 1, '3-2a S05 保存失敗時に MASTER-V2 warn が出る');
  assert(v2Warns.some(w => w.indexOf('S05 last_class verify failed')!==-1), '3-2b S05 タグ付き warn');
}

// 3-3: S05 未登録新規追加分岐では MASTER-V2 verify を呼ばない
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  env._setState(s);
  seedMaster(env, [makeMember('m2','佐藤',{last_class:'A'})]);
  env._clear();

  env._ctx.localStorage._failOnSet = true;
  env.handleSuggestClassAdd('m2', 'B');  // 未登録 → case 1

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, '3-3 S05 未登録新規追加分岐では MASTER-V2 warn が出ない（誤 warn 防止）');
}

// ============================================================================
// SECTION 4: S22 会員マスタ編集モーダル保存
// ============================================================================

// S22 シナリオ共通: bindMasterEditModalEvents() を呼んで me-save click handler を登録し、
// 必要な input / radio / data-mid を mock 経由でセットして click() でハンドラを発火させる。

function setupS22(env, member, formValues){
  formValues = formValues || {};
  const saveBtn = env._ctx.document.getElementById('me-save');
  saveBtn.setAttribute('data-mid', member.id);
  // 入力欄
  env._ctx.document.getElementById('me-name').value = (typeof formValues.name==='string')?formValues.name:member.name;
  env._ctx.document.getElementById('me-yomi').value = (typeof formValues.yomi==='string')?formValues.yomi:(member.yomi||'');
  env._ctx.document.getElementById('me-city').value = (typeof formValues.city==='string')?formValues.city:(member.city||'');
  // radios（getElementsByName 経由）
  env._registerRadio('me-member','member',formValues.memberPick==='member');
  env._registerRadio('me-member','other',formValues.memberPick==='other');
  env._registerRadio('me-grade','ippan',formValues.gradePick==='ippan');
  env._registerRadio('me-grade','chu',formValues.gradePick==='chu');
  env._registerRadio('me-last-class','A',formValues.lastClassPick==='A');
  env._registerRadio('me-last-class','B',formValues.lastClassPick==='B');
  // bindMasterEditModalEvents() で me-save に click handler を登録
  env.bindMasterEditModalEvents();
}

// 4-1: S22 4 fields すべて一致 → MASTER-V2 warn なし
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:'沼津市'});
  seedMaster(env, [member]);
  env._clear();

  setupS22(env, member, {
    memberPick:'other',   // member → other に変更
    gradePick:'chu',      // ippan → chu に変更
    lastClassPick:'B',    // A → B に変更
    city:'静岡市'         // 沼津市 → 静岡市 に変更
  });
  env._ctx.document.getElementById('me-save').click();

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, '4-1 S22 4 fields 一致 正常系: MASTER-V2 warn なし');

  // persisted を確認
  const reload = env.loadBranchMaster();
  const m = reload.members.find(x=>x.id==='m1');
  assertEq(m.last_class, 'B', '4-1b persisted last_class=B');
  assertEq(m.member, 'other', '4-1c persisted member=other');
  assertEq(m.grade, 'chu', '4-1d persisted grade=chu');
  assertEq(m.city, '静岡市', '4-1e persisted city=静岡市');
}

// 4-2: S22 保存失敗時 → 4 fields すべてが warn 対象（field ごとに warn 1 行）
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:'沼津市'});
  seedMaster(env, [member]);
  env._clear();

  setupS22(env, member, {
    memberPick:'other',
    gradePick:'chu',
    lastClassPick:'B',
    city:'静岡市'
  });
  env._ctx.localStorage._failOnSet = true;
  env._ctx.document.getElementById('me-save').click();

  const v2Warns = env._masterV2Warns();
  // 4 fields 全て、in-memory 側の更新後値（last_class=B, member=other, grade=chu, city=静岡市）vs
  // persisted 側（保存失敗なので変更なし: last_class=A, member=member, grade=ippan, city=沼津市）が全て不一致
  // → 4 件の warn が出る
  assertEq(v2Warns.length, 4, '4-2a S22 4 fields 全て不一致 → warn 4 行');
  assert(v2Warns.some(w => w.indexOf('S22 verify failed')!==-1 && w.indexOf('"field":"last_class"')!==-1), '4-2b last_class warn 含む');
  assert(v2Warns.some(w => w.indexOf('S22 verify failed')!==-1 && w.indexOf('"field":"member"')!==-1), '4-2c member warn 含む');
  assert(v2Warns.some(w => w.indexOf('S22 verify failed')!==-1 && w.indexOf('"field":"grade"')!==-1), '4-2d grade warn 含む');
  assert(v2Warns.some(w => w.indexOf('S22 verify failed')!==-1 && w.indexOf('"field":"city"')!==-1), '4-2e city warn 含む');
}

// 4-3: S22 1 field だけ不一致 → その field の warn のみ
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:'沼津市'});
  seedMaster(env, [member]);
  env._clear();

  // ラジオを「変更しない」相当（last_class radio どちらも checked=false）にして
  // member / grade / city は既存値と一致するフォーム値にする
  setupS22(env, member, {
    memberPick:null,      // 変更しない → options.member 未指定 → 既存値維持
    gradePick:null,
    lastClassPick:null,
    city:'沼津市'          // 既存値と一致
  });

  // 一度 click（正常保存）して baseline を作る
  env._ctx.document.getElementById('me-save').click();
  env._clear();

  // persisted 側だけを手動で書換え（last_class だけ「ずれた」状態を作る）
  const corrupted = env.loadBranchMaster();
  const cm = corrupted.members.find(x=>x.id==='m1');
  cm.last_class = 'B';  // 強制不一致を作る
  env.saveBranchMaster(corrupted);

  // 再度 setup + click（今度は in-memory member は元の値、persisted は last_class=B）
  // ※ click のたびに新しい handler が attach されるため、ここでは S22 click を別途トリガするのではなく
  // verify helper を直接呼んで 1-field 不一致を確認する
  const ok_lc = env.verifyMasterFieldPersisted('m1','last_class','A');  // expected=A, persisted=B → false
  const ok_mb = env.verifyMasterFieldPersisted('m1','member','member');  // 一致
  const ok_gr = env.verifyMasterFieldPersisted('m1','grade','ippan');    // 一致
  const ok_cy = env.verifyMasterFieldPersisted('m1','city','沼津市');     // 一致
  assertEq(ok_lc, false, '4-3a 1 field (last_class) のみ不一致 → false');
  assertEq(ok_mb, true, '4-3b member 一致 → true');
  assertEq(ok_gr, true, '4-3c grade 一致 → true');
  assertEq(ok_cy, true, '4-3d city 一致 → true');
}

// 4-4: S22 expected はフォーム生値ではなく applyMasterMemberEdit 適用後の正規化済み値
//      フォーム city に前後空白付きの値を入れて、persisted は normalizeCity 後の trim 済値。
//      実装が正しく in-memory 正規化済み値を expected にしていれば、warn は出ない。
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:''});
  seedMaster(env, [member]);
  env._clear();

  setupS22(env, member, {
    memberPick:'member',
    gradePick:'ippan',
    lastClassPick:'A',
    city:'  沼津市  '   // 前後空白あり → normalizeCity で trim される
  });
  env._ctx.document.getElementById('me-save').click();

  const v2Warns = env._masterV2Warns();
  // expected = in-memory 正規化済み値（'沼津市'）、persisted = '沼津市'（normalizeCity 適用済）→ 一致
  // フォーム生値（'  沼津市  '）を expected にしてしまっていたら、persisted '沼津市' との strict !== で false → warn 1 件
  assertEq(v2Warns.length, 0, '4-4a S22 city expected が正規化済み値: フォーム生値による false negative なし');

  // persisted を直接確認: trim 済み
  const reload = env.loadBranchMaster();
  const m = reload.members.find(x=>x.id==='m1');
  assertEq(m.city, '沼津市', '4-4b persisted city は trim 済み');
  // normalizeCity の動作も間接確認
  assertEq(env.normalizeCity('  沼津市  '), '沼津市', '4-4c normalizeCity の trim 挙動');
}

// 4-5: S22 city が 20 文字超 → normalizeCity で 20 文字丸め、expected も丸め後値で一致確認
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:''});
  seedMaster(env, [member]);
  env._clear();

  const longCity = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';  // 26 文字
  setupS22(env, member, {
    memberPick:'member',
    gradePick:'ippan',
    lastClassPick:'A',
    city: longCity
  });
  env._ctx.document.getElementById('me-save').click();

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, '4-5a S22 city 20 文字超: 丸め後 expected で一致、warn なし');

  const reload = env.loadBranchMaster();
  const m = reload.members.find(x=>x.id==='m1');
  assertEq(m.city.length, 20, '4-5b persisted city 長さ = 20');
}

// ============================================================================
// SECTION 5: helper 内 warn なし / callsite 側 warn ありの方針確認
// ============================================================================

// 5-1: helper 内 catch 経路でも warn が出ないこと（S03 / S05 / S22 不通過時の純 helper 呼び出し）
{
  const env = loadEnv(targetPath);
  env._ctx.localStorage._['shogi_branch_master'] = 'broken{{json';
  env._clear();

  // 直接 helper を呼び出すと、内部で catch されるが console.warn は呼ばれない
  const r = env.verifyMasterFieldPersisted('m1','last_class','A');
  assertEq(r, false, '5-1a helper は false を返す');
  assertEq(env._warnCalls.length, 0, '5-1b helper 内では console.warn は出ない');
}

// 5-2: callsite 側で必ず [MASTER-V2-LASTCLASS] タグ付き warn が出ること（既存テスト群で確認済の再確認）
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  env._ctx.localStorage._failOnSet = true;
  env.handlePastParticipantClassAdd('m1', 'B');

  const v2Warns = env._masterV2Warns();
  assert(v2Warns.length >= 1, '5-2a callsite 側で MASTER-V2 タグ付き warn が出る');
  assert(v2Warns.every(w => w.indexOf('[MASTER-V2-LASTCLASS]')===0), '5-2b すべての MASTER-V2 warn が [MASTER-V2-LASTCLASS] プレフィックス');
}

// ============================================================================
// 結果
// ============================================================================
console.log('\n  MASTER-V2-LASTCLASS-IMPL 単体テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
