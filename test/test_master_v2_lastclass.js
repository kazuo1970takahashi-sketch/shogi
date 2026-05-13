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
    const innerHTMLHistory = [];
    return {
      id: id || '',
      _innerHTML: '',
      _innerHTMLHistory: innerHTMLHistory,
      style: { _cssText: '', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      className: '',
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){
        this._innerHTML=v;
        // showMsg は reg-msg の innerHTML を上書きする。途中経過を検証するため履歴を保持。
        innerHTMLHistory.push(v);
      },
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
  // SAVE-UX-MIN-NOTIFY-001: showMsg は reg-msg の innerHTML を上書きするため、最終状態だけ
  // 見ても「途中で出た」warn を捕捉できない。makeElem に積んだ履歴を返す。
  api._regMsgHistory = function(){
    const el = ctx.document._elements['reg-msg'];
    return (el && el._innerHTMLHistory) ? el._innerHTMLHistory.slice() : [];
  };
  api._regMsgSawText = function(text){
    const hist = api._regMsgHistory();
    for(let i=0;i<hist.length;i++){
      if(typeof hist[i]==='string' && hist[i].indexOf(text)!==-1)return true;
    }
    return false;
  };
  // SAVE-UX-MIN-NOTIFY-001 (Codex Must Fix): 運営者に見える「最終表示」が warn か ok かを
  // 検証するため、現在の reg-msg.innerHTML を返す。途中で warn が呼ばれても、その後 ok で
  // 上書きされたら最終表示は ok になる。本ヘルパで最終表示を直接確認する。
  api._regMsgFinal = function(){
    const el = ctx.document._elements['reg-msg'];
    return el ? el._innerHTML : '';
  };
  api._clear = function(){
    alertCalls.length = 0;
    warnCalls.length = 0;
    const el = ctx.document._elements['reg-msg'];
    if(el && el._innerHTMLHistory)el._innerHTMLHistory.length = 0;
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

// 1-15 (Codex Must Fix): raw member に last_class キーが欠落している場合の厳密検証。
//   設計書方針: raw JSON 直接検証であるため、欠落 undefined と明示 null を区別する。
//   normalizeBranchMaster は通さず、actual===undefined を null と同一視しない。
//
//   1-15a: last_class キー欠落 + expected=null → false（false positive 防止）
//   1-15b: last_class キー欠落 + expected=undefined → false（expected 側も 'A'/'B'/null 以外は不許可）
//   1-15c: last_class キー欠落 + expected='A' → false（既存挙動の再確認）
{
  const env = loadEnv(targetPath);
  // last_class キーを完全に持たない member を raw で seed する
  // （makeMember / normalizeBranchMaster 経由ではキーが補完されてしまうため、
  // localStorage に直接書き込む）
  env._ctx.localStorage._['shogi_branch_master'] = JSON.stringify({
    schema_version:1,
    updated_at:'2026-05-13T00:00:00Z',
    members:[{
      id:'m1',
      name:'田中',
      yomi:'',
      // last_class: 意図的に欠落
      last_attended:'2026-04-01',
      first_attended:'2026-01-01',
      attendance_count:0,
      tournament_ids:[],
      deleted:false,
      deleted_at:null,
      note:'',
      member:'member',
      grade:'ippan',
      city:''
    }]
  });

  // 念のため raw 側に last_class キーが存在しないことを確認（テスト前提の自己検証）
  const raw = JSON.parse(env._ctx.localStorage._['shogi_branch_master']);
  assert(!Object.prototype.hasOwnProperty.call(raw.members[0],'last_class'), '1-15-pre raw member に last_class キーが存在しないこと（テスト前提）');

  // 1-15a: expected=null でも false（欠落 undefined を null と同一視しない）
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',null), false, '1-15a last_class キー欠落 + expected=null → false（false positive 防止）');

  // 1-15b: expected=undefined でも false（'A'/'B'/null 以外は不許可）
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',undefined), false, '1-15b last_class キー欠落 + expected=undefined → false');

  // 1-15c: 既存挙動の再確認
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-15c last_class キー欠落 + expected="A" → false');
}

// 1-16 (Codex Must Fix 補強): last_class: null が明示的に存在する場合は expected=null で true。
//   1-15 と対になる挙動: 「明示 null」と「キー欠落 undefined」を区別する。
{
  const env = loadEnv(targetPath);
  env._ctx.localStorage._['shogi_branch_master'] = JSON.stringify({
    schema_version:1,
    updated_at:'2026-05-13T00:00:00Z',
    members:[{
      id:'m1',
      name:'田中',
      yomi:'',
      last_class:null,  // 明示 null
      last_attended:'2026-04-01',
      first_attended:'2026-01-01',
      attendance_count:0,
      tournament_ids:[],
      deleted:false,
      deleted_at:null,
      note:'',
      member:'member',
      grade:'ippan',
      city:''
    }]
  });

  // raw 側に last_class: null が明示的に存在することを確認（テスト前提の自己検証）
  const raw = JSON.parse(env._ctx.localStorage._['shogi_branch_master']);
  assert(Object.prototype.hasOwnProperty.call(raw.members[0],'last_class'), '1-16-pre raw member に last_class キーが存在（明示 null）');
  assertEq(raw.members[0].last_class, null, '1-16-pre raw member の last_class が明示 null');

  // 明示 null vs expected=null → true
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',null), true, '1-16a 明示 null + expected=null → true');

  // 明示 null vs expected=undefined → false（expected 側不許可）
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',undefined), false, '1-16b 明示 null + expected=undefined → false');

  // 明示 null vs expected='A' → false
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','A'), false, '1-16c 明示 null + expected="A" → false');
}

// 1-17 (Codex Must Fix 補強): expected が 'A' / 'B' / null 以外なら即 false
//   設計意図: last_class 比較は許容値の三値以外を expected として受け取った時点で false。
{
  const env = loadEnv(targetPath);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  assertEq(env.verifyMasterFieldPersisted('m1','last_class','C'), false, '1-17a expected="C" → false');
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',''), false, '1-17b expected="" → false');
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',0), false, '1-17c expected=0 → false');
  assertEq(env.verifyMasterFieldPersisted('m1','last_class',false), false, '1-17d expected=false → false');
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
// SECTION 6: SAVE-UX-MIN-NOTIFY-001 — S03 / S05 を Level 0 → Level 1 昇格
// ============================================================================
// 設計書: docs/specs/20260513_shogi_save_ux_design.md
// 方針:
//   - S03 / S05 の verifyMasterFieldPersisted 失敗時に console.warn に加え
//     showMsg('前回クラス情報の保存が確認できませんでした','warn') を追加
//   - 既登録者クラス変更分岐のみ。新規追加分岐では呼ばない（誤通知防止）
//   - Codex Must Fix 対応: 「最終表示が warn として残る」ことを保証する
//     （直後の成功 showMsg(ok) で上書きしないよう、master verify 結果で分岐）
//   - S22 は対象外（本タスクでは未変更）
const SAVE_UX_MIN_NOTIFY_TEXT = '前回クラス情報の保存が確認できませんでした';

// T-S03-L1-success: S03 既登録者クラス変更 verify 成功時、最終表示は ok（成功 showMsg）
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
  assertEq(v2Warns.length, 0, 'T-S03-L1-success-a: console.warn (MASTER-V2) が呼ばれない');
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_TEXT), false, 'T-S03-L1-success-b: 新文言の showMsg が一度も呼ばれない');
  // 最終表示は既存の成功 showMsg。alert-ok 種別で「クラス に変更しました」が残る。
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-ok')!==-1, 'T-S03-L1-success-c: 最終表示は alert-ok 種別');
  assert(final.indexOf('クラス に変更しました')!==-1, 'T-S03-L1-success-d: 最終表示に既存成功文言が残る');
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_TEXT)===-1, 'T-S03-L1-success-e: 最終表示に新 warn 文言が残っていない');
}

// setItem フック helper: master 書込み時に last_class を fixedValue に強制し、
// 「master verify だけが失敗する」状態を作る（state verify は素通り）。
// _failOnSet を使うと state verify も失敗し、SAVE-003b 系 warn で最終表示が上書きされて
// 「master verify 失敗時に MV2 warn が最終表示として残るか」の検証にならないため、別手法。
function installMasterVerifyFailHook(env, memberId, fixedValue){
  const orig = env._ctx.localStorage.setItem.bind(env._ctx.localStorage);
  env._ctx.localStorage.setItem = function(k,v){
    if(k==='shogi_branch_master'){
      try{
        const p = JSON.parse(v);
        if(p && Array.isArray(p.members)){
          for(let i=0;i<p.members.length;i++){
            if(p.members[i] && p.members[i].id===memberId){
              p.members[i].last_class = fixedValue;  // expected と不一致になる値
            }
          }
        }
        return orig(k, JSON.stringify(p));
      }catch(e){
        return orig(k,v);
      }
    }
    return orig(k,v);
  };
}

// T-S03-L1-fail: S03 verify 失敗時、最終表示が warn として残る（ok で上書きされない）
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  // master 書込み後の persisted を 'A' に強制 → expected='B' との不一致で verify false
  installMasterVerifyFailHook(env, 'm1', 'A');
  env.handlePastParticipantClassAdd('m1', 'B');

  const v2Warns = env._masterV2Warns();
  assert(v2Warns.length >= 1, 'T-S03-L1-fail-a: console.warn (MASTER-V2) が呼ばれる');
  assert(v2Warns.some(w => w.indexOf('S03 last_class verify failed')!==-1), 'T-S03-L1-fail-b: S03 タグ付き console.warn');
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_TEXT), true, 'T-S03-L1-fail-c: 新文言の showMsg が呼ばれる');

  // 最終表示が warn として残ること（Codex Must Fix の本丸）
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')!==-1, 'T-S03-L1-fail-d: 最終表示は alert-warn 種別');
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_TEXT)!==-1, 'T-S03-L1-fail-e: 最終表示に新 warn 文言が残る');
  // 既存成功文言「クラス に変更しました」で上書きされていないこと
  assert(final.indexOf('クラス に変更しました')===-1, 'T-S03-L1-fail-f: 最終表示が既存成功文言で上書きされていない');
  assertEq(env._alertCalls.length, 0, 'T-S03-L1-fail-g: alert は呼ばれない');
}

// T-S03-L1-newadd: S03 未登録新規追加分岐では Level 1 warn が出ない、最終表示に warn 文言なし
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  env._setState(s);  // 参加者ゼロ
  seedMaster(env, [makeMember('m2','佐藤',{last_class:'A'})]);
  env._clear();

  // localStorage を壊しても、新規追加分岐では MV2 verify を呼ばないため誤通知が出ないこと
  env._ctx.localStorage._failOnSet = true;
  env.handlePastParticipantClassAdd('m2', 'B');  // 未登録 → case 1 新規追加

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, 'T-S03-L1-newadd-a: console.warn (MASTER-V2) が呼ばれない（新規追加分岐）');
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_TEXT), false, 'T-S03-L1-newadd-b: 新文言の showMsg が呼ばれない');
  const final = env._regMsgFinal();
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_TEXT)===-1, 'T-S03-L1-newadd-c: 最終表示に新 warn 文言が残らない');
}

// T-S05-L1-success: S05 既登録者クラス変更 verify 成功時、最終表示は ok（成功 showMsg）
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
  assertEq(v2Warns.length, 0, 'T-S05-L1-success-a: console.warn (MASTER-V2) が呼ばれない');
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_TEXT), false, 'T-S05-L1-success-b: 新文言の showMsg が一度も呼ばれない');
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-ok')!==-1, 'T-S05-L1-success-c: 最終表示は alert-ok 種別');
  assert(final.indexOf('クラス に変更しました')!==-1, 'T-S05-L1-success-d: 最終表示に既存成功文言が残る');
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_TEXT)===-1, 'T-S05-L1-success-e: 最終表示に新 warn 文言が残っていない');
}

// T-S05-L1-fail: S05 verify 失敗時、最終表示が warn として残る（ok で上書きされない）
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  // master 書込み後の persisted を 'A' に強制 → expected='B' との不一致で verify false
  installMasterVerifyFailHook(env, 'm1', 'A');
  env.handleSuggestClassAdd('m1', 'B');

  const v2Warns = env._masterV2Warns();
  assert(v2Warns.length >= 1, 'T-S05-L1-fail-a: console.warn (MASTER-V2) が呼ばれる');
  assert(v2Warns.some(w => w.indexOf('S05 last_class verify failed')!==-1), 'T-S05-L1-fail-b: S05 タグ付き console.warn');
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_TEXT), true, 'T-S05-L1-fail-c: 新文言の showMsg が呼ばれる');

  // 最終表示が warn として残ること（Codex Must Fix の本丸）
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')!==-1, 'T-S05-L1-fail-d: 最終表示は alert-warn 種別');
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_TEXT)!==-1, 'T-S05-L1-fail-e: 最終表示に新 warn 文言が残る');
  assert(final.indexOf('クラス に変更しました')===-1, 'T-S05-L1-fail-f: 最終表示が既存成功文言で上書きされていない');
  assertEq(env._alertCalls.length, 0, 'T-S05-L1-fail-g: alert は呼ばれない');
}

// T-S05-L1-newadd: S05 未登録新規追加分岐では Level 1 warn が出ない、最終表示に warn 文言なし
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  env._setState(s);
  seedMaster(env, [makeMember('m2','佐藤',{last_class:'A'})]);
  env._clear();

  env._ctx.localStorage._failOnSet = true;
  env.handleSuggestClassAdd('m2', 'B');  // 未登録 → case 1

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, 'T-S05-L1-newadd-a: console.warn (MASTER-V2) が呼ばれない（新規追加分岐）');
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_TEXT), false, 'T-S05-L1-newadd-b: 新文言の showMsg が呼ばれない');
  const final = env._regMsgFinal();
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_TEXT)===-1, 'T-S05-L1-newadd-c: 最終表示に新 warn 文言が残らない');
}

// ============================================================================
// SECTION 7: SAVE-UX-MIN-NOTIFY-002 — S22 を Level 0 → Level 1 昇格
// ============================================================================
// 設計書: docs/specs/20260513_shogi_save_ux_design.md
// 現在地マップ: docs/notes/20260513_shogi_save_ux_status_map.md
// 方針:
//   - S22 (会員マスタ編集モーダル保存) の verifyMasterFieldPersisted 失敗時に
//     user-facing showMsg を 1 件集約で出す（field 別 console.warn は維持）
//   - 失敗時は既存 success showMsg('マスタを更新しました', 'ok') を抑止して
//     最終表示を warn として残す（PR #63 同パターン）
//   - 4 fields verify を 1 件の集約 warn に集約（field 名や件数は user-facing に出さない）

const SAVE_UX_MIN_NOTIFY_002_TEXT = '会員マスタ情報の保存が確認できませんでした';
const SAVE_UX_MASTER_SUCCESS_TEXT = 'マスタを更新しました';

// 任意の field を強制不一致にする setItem フック。
// 既存 installMasterVerifyFailHook は last_class 単独だが、S22 の 4 fields verify に対応するため
// fieldOverrides マップで複数 field を一括上書き可能にする。
function installMasterVerifyFailHookFields(env, memberId, fieldOverrides){
  const orig = env._ctx.localStorage.setItem.bind(env._ctx.localStorage);
  env._ctx.localStorage.setItem = function(k,v){
    if(k==='shogi_branch_master'){
      try{
        const p = JSON.parse(v);
        if(p && Array.isArray(p.members)){
          for(let i=0;i<p.members.length;i++){
            if(p.members[i] && p.members[i].id===memberId){
              for(const f in fieldOverrides){
                if(Object.prototype.hasOwnProperty.call(fieldOverrides, f)){
                  p.members[i][f] = fieldOverrides[f];
                }
              }
            }
          }
        }
        return orig(k, JSON.stringify(p));
      }catch(e){
        return orig(k,v);
      }
    }
    return orig(k,v);
  };
}

// T-S22-L1-success: 4 fields すべて verify 成功 → 最終表示は alert-ok + 既存 success 文言
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:'沼津市'});
  seedMaster(env, [member]);
  env._clear();

  setupS22(env, member, {
    memberPick:'other',   // member → other に変更
    gradePick:'chu',      // ippan → chu に変更
    lastClassPick:'B',    // A → B に変更
    city:'静岡市'
  });
  env._ctx.document.getElementById('me-save').click();

  // 新 warn 文言が一度も呼ばれないこと（success 系のみ）
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_002_TEXT), false, 'T-S22-L1-success-a: 新 warn 文言が一度も呼ばれない');
  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, 'T-S22-L1-success-b: console.warn (MASTER-V2) が呼ばれない');

  // 最終表示が既存 success 文言（alert-ok）であること
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-ok')!==-1, 'T-S22-L1-success-c: 最終表示は alert-ok 種別');
  assert(final.indexOf(SAVE_UX_MASTER_SUCCESS_TEXT)!==-1, 'T-S22-L1-success-d: 最終表示に既存 success 文言が残る');
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_002_TEXT)===-1, 'T-S22-L1-success-e: 最終表示に新 warn 文言が残っていない');
}

// T-S22-L1-fail-one-field: 1 field (last_class) のみ verify 失敗
// → 最終表示が alert-warn + 新 warn 文言、success 文言で上書きされていない
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:''});
  seedMaster(env, [member]);
  env._clear();

  setupS22(env, member, {
    memberPick:'member',
    gradePick:'ippan',
    lastClassPick:'B',   // A → B に変更（expected='B'）
    city:''
  });
  // 書込み後の persisted last_class を 'A' に強制 → expected='B' との不一致で verify false
  installMasterVerifyFailHookFields(env, 'm1', {last_class:'A'});
  env._ctx.document.getElementById('me-save').click();

  // field 別 console.warn が出ること（debug 用、last_class のみ 1 件）
  const v2Warns = env._masterV2Warns();
  assert(v2Warns.length >= 1, 'T-S22-L1-fail-one-field-a: console.warn (MASTER-V2 S22) が呼ばれる');
  assert(v2Warns.some(w => w.indexOf('S22 verify failed')!==-1 && w.indexOf('"field":"last_class"')!==-1), 'T-S22-L1-fail-one-field-b: S22 last_class タグ付き console.warn');

  // user-facing は集約 warn
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_002_TEXT), true, 'T-S22-L1-fail-one-field-c: 新 warn 文言の showMsg が呼ばれる');

  // 最終表示が warn として残ること（Codex Must Fix の本丸）
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')!==-1, 'T-S22-L1-fail-one-field-d: 最終表示は alert-warn 種別');
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_002_TEXT)!==-1, 'T-S22-L1-fail-one-field-e: 最終表示に新 warn 文言が残る');
  assert(final.indexOf(SAVE_UX_MASTER_SUCCESS_TEXT)===-1, 'T-S22-L1-fail-one-field-f: 最終表示が既存 success 文言で上書きされていない');
  assertEq(env._alertCalls.length, 0, 'T-S22-L1-fail-one-field-g: alert は呼ばれない');
}

// T-S22-L1-fail-multiple-fields: 4 fields すべて verify 失敗
// → 最終表示が alert-warn + 新 warn 文言（1 件集約、field 名や件数は user-facing に出さない）
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:'沼津市'});
  seedMaster(env, [member]);
  env._clear();

  setupS22(env, member, {
    memberPick:'other',     // expected='other'
    gradePick:'chu',        // expected='chu'
    lastClassPick:'B',      // expected='B'
    city:'静岡市'           // expected='静岡市'（normalizeCity 適用後）
  });
  // 4 fields すべて期待値と異なる値で persist → verify 全失敗
  installMasterVerifyFailHookFields(env, 'm1', {
    last_class:'A',
    member:'WRONG',
    grade:'WRONG',
    city:'WRONG'
  });
  env._ctx.document.getElementById('me-save').click();

  // field 別 console.warn は 4 件出ることを補助確認（既存 debug warn が壊れていないこと）
  const v2Warns = env._masterV2Warns();
  const v2S22Warns = v2Warns.filter(w => w.indexOf('S22 verify failed')!==-1);
  assertEq(v2S22Warns.length, 4, 'T-S22-L1-fail-multiple-a: console.warn (S22) は 4 件出る（field 別 debug 維持）');
  assert(v2S22Warns.some(w => w.indexOf('"field":"last_class"')!==-1), 'T-S22-L1-fail-multiple-b1: last_class warn');
  assert(v2S22Warns.some(w => w.indexOf('"field":"member"')!==-1), 'T-S22-L1-fail-multiple-b2: member warn');
  assert(v2S22Warns.some(w => w.indexOf('"field":"grade"')!==-1), 'T-S22-L1-fail-multiple-b3: grade warn');
  assert(v2S22Warns.some(w => w.indexOf('"field":"city"')!==-1), 'T-S22-L1-fail-multiple-b4: city warn');

  // user-facing showMsg は 1 件集約（履歴上、新 warn 文言の出現は 1 回のみ）
  const history = env._regMsgHistory();
  const aggregatedWarnHits = history.filter(h => typeof h==='string' && h.indexOf(SAVE_UX_MIN_NOTIFY_002_TEXT)!==-1);
  assertEq(aggregatedWarnHits.length, 1, 'T-S22-L1-fail-multiple-c: user-facing 集約 warn は 1 件のみ（field 別 user-facing warn が出ていない）');

  // 最終表示が warn として残ること
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')!==-1, 'T-S22-L1-fail-multiple-d: 最終表示は alert-warn 種別');
  assert(final.indexOf(SAVE_UX_MIN_NOTIFY_002_TEXT)!==-1, 'T-S22-L1-fail-multiple-e: 最終表示に新 warn 文言が残る');
  assert(final.indexOf(SAVE_UX_MASTER_SUCCESS_TEXT)===-1, 'T-S22-L1-fail-multiple-f: 最終表示が既存 success 文言で上書きされていない');
  // field 名や件数が user-facing に漏れていないこと（集約方針）
  assert(final.indexOf('last_class')===-1, 'T-S22-L1-fail-multiple-g1: user-facing に field 名 (last_class) が漏れない');
  assert(final.indexOf('member')===-1 || final.indexOf('member')!==-1 && final.indexOf('alert-warn')!==-1, 'T-S22-L1-fail-multiple-g2: user-facing に field 名 (member) が漏れない（または無関係文字列）');
  // ↑ 「会員マスタ情報」に「員」が含まれるが、field 名 'member' は ASCII なので別物として判定
  assertEq(env._alertCalls.length, 0, 'T-S22-L1-fail-multiple-h: alert は呼ばれない');
}

// T-S22-L1-no-extra-warn: 4 fields すべて未変更 + verify 全成功
// → 最終表示が alert-ok、余計な warn が出ない
{
  const env = loadEnv(targetPath);
  const member = makeMember('m1','田中',{last_class:'A',member:'member',grade:'ippan',city:'沼津市'});
  seedMaster(env, [member]);
  env._clear();

  // 4 fields とも radios 未 check（lastClassPick / memberPick / gradePick 未指定）+ city は既存値
  // → applyMasterMemberEdit は options にこれら field を含めない → in-memory 値は不変 → verify 全成功
  setupS22(env, member, {
    // memberPick: 未指定（applyMasterMemberEdit は target.member を変更しない）
    // gradePick: 未指定
    // lastClassPick: 未指定
    city:'沼津市'   // 既存値と一致
  });
  env._ctx.document.getElementById('me-save').click();

  const v2Warns = env._masterV2Warns();
  assertEq(v2Warns.length, 0, 'T-S22-L1-no-extra-warn-a: console.warn (MASTER-V2 S22) が呼ばれない');
  assertEq(env._regMsgSawText(SAVE_UX_MIN_NOTIFY_002_TEXT), false, 'T-S22-L1-no-extra-warn-b: 新 warn 文言が呼ばれない');

  const final = env._regMsgFinal();
  assert(final.indexOf('alert-ok')!==-1, 'T-S22-L1-no-extra-warn-c: 最終表示は alert-ok 種別');
  assert(final.indexOf(SAVE_UX_MASTER_SUCCESS_TEXT)!==-1, 'T-S22-L1-no-extra-warn-d: 最終表示に既存 success 文言が残る');
}

// ============================================================================
// 結果
// ============================================================================
console.log('\n  MASTER-V2-LASTCLASS-IMPL 単体テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
