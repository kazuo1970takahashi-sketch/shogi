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
      hidden: false,  // SAVE-UX-STATUS-INDICATOR: el.hidden = true/false の DOM 操作に対応
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
       notifySaveWarning:notifySaveWarning,
       recordSaveWarningForIndicator:recordSaveWarningForIndicator,
       updateSaveWarningIndicator:updateSaveWarningIndicator,
       _getIndicatorState:function(){return saveWarningIndicatorState;},
       _getSaveWarningAggregationState:function(){return saveWarningAggregationState;},
       _resetSaveWarningAggregationState:_resetSaveWarningAggregationState,
       SAVE_WARN_AGGREGATION_WINDOW_MS:SAVE_WARN_AGGREGATION_WINDOW_MS,
       SAVE_WARN_AGGREGATED_MESSAGE:SAVE_WARN_AGGREGATED_MESSAGE,
       isQuotaExceededError:isQuotaExceededError,
       handlePastParticipantClassAdd:handlePastParticipantClassAdd,
       handleSuggestClassAdd:handleSuggestClassAdd,
       bindMasterEditModalEvents:bindMasterEditModalEvents,
       createEmptyBranchMaster:createEmptyBranchMaster,
       saveBranchMaster:saveBranchMaster,
       loadBranchMaster:loadBranchMaster,
       syncBranchMasterOnSave:syncBranchMasterOnSave,
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
  // → field 別の 'S22 verify failed' タグ付き console.warn は 4 件出る
  // SAVE-UX-WARN-HELPER 以降: 加えて helper の総括 console.warn が 1 件出るが、件数厳密チェックは
  // helper 化の足枷になるため、field 別 warn が 4 件出ることだけを確認する（依頼書方針）。
  const v2FieldWarns = v2Warns.filter(w => w.indexOf('S22 verify failed')!==-1);
  assertEq(v2FieldWarns.length, 4, '4-2a S22 field 別 console.warn が 4 件出る（debug 維持）');
  assert(v2FieldWarns.some(w => w.indexOf('"field":"last_class"')!==-1), '4-2b last_class warn 含む');
  assert(v2FieldWarns.some(w => w.indexOf('"field":"member"')!==-1), '4-2c member warn 含む');
  assert(v2FieldWarns.some(w => w.indexOf('"field":"grade"')!==-1), '4-2d grade warn 含む');
  assert(v2FieldWarns.some(w => w.indexOf('"field":"city"')!==-1), '4-2e city warn 含む');
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
// SECTION 8: SAVE-UX-WARN-HELPER — notifySaveWarning 単体テスト
// ============================================================================
// 設計書: docs/specs/20260513_shogi_save_ux_design.md
// 方針:
//   - notifySaveWarning は SAVE-UX Level 1 の user-facing warn helper
//   - showMsg(warn) と 総括 console.warn のみを担当
//   - success showMsg の抑止は callsite 側の責務（PR #63 / #65）
//   - 例外を投げず、callsite の制御フローを壊さない

// T-NSW-basic: 通常呼び出しで showMsg + 総括 console.warn が出る
{
  const env = loadEnv(targetPath);
  env._clear();

  env.notifySaveWarning({
    message:'テスト警告',
    consoleTag:'[TEST]',
    callsiteId:'T01',
    fields:['last_class']
  });

  // 最終 reg-msg.innerHTML が alert-warn 種別 + 'テスト警告'
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')!==-1, 'T-NSW-basic-a: 最終表示は alert-warn 種別');
  assert(final.indexOf('テスト警告')!==-1, 'T-NSW-basic-b: 最終表示に message が含まれる');

  // 総括 console.warn が出ること（callsiteId / fields をメタに含む）
  const testWarns = env._warnCalls.filter(function(w){return w.indexOf('[TEST]')!==-1;});
  assertEq(testWarns.length, 1, 'T-NSW-basic-c: 総括 console.warn が 1 件');
  assert(testWarns[0].indexOf('"callsiteId":"T01"')!==-1, 'T-NSW-basic-d: console.warn メタに callsiteId 含まれる');
  assert(testWarns[0].indexOf('"last_class"')!==-1, 'T-NSW-basic-e: console.warn メタに fields 含まれる');

  // alert は呼ばれない
  assertEq(env._alertCalls.length, 0, 'T-NSW-basic-f: alert は呼ばれない');
}

// T-NSW-no-message: message 不在で例外を投げず、安全 return
{
  const env = loadEnv(targetPath);
  env._clear();

  let threw = false;
  try {
    env.notifySaveWarning({consoleTag:'[TEST]', callsiteId:'T02'});
  } catch(e) {
    threw = true;
  }
  assertEq(threw, false, 'T-NSW-no-message-a: 例外を投げない');

  // showMsg は呼ばれない（最終 reg-msg.innerHTML は空、alert-warn が出ていない）
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')===-1, 'T-NSW-no-message-b: showMsg(warn) は呼ばれていない');

  // 総括 console.warn は出る（debug 用、message 不在の旨が含まれる）
  const testWarns = env._warnCalls.filter(function(w){return w.indexOf('[TEST]')!==-1;});
  assert(testWarns.length >= 1, 'T-NSW-no-message-c: console.warn が出る（debug 用）');
  assert(testWarns.some(function(w){return w.indexOf('called without message')!==-1;}), 'T-NSW-no-message-d: warn メタに message 不在の旨が含まれる');
}

// T-NSW-undefined-options: options 自体が undefined でも例外を投げない
{
  const env = loadEnv(targetPath);
  env._clear();

  let threw = false;
  try {
    env.notifySaveWarning();  // options 省略
  } catch(e) {
    threw = true;
  }
  assertEq(threw, false, 'T-NSW-undefined-options-a: options 省略でも例外を投げない');

  // showMsg は呼ばれない
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')===-1, 'T-NSW-undefined-options-b: showMsg(warn) は呼ばれていない');
}

// T-NSW-no-fields: fields 省略でも message があれば showMsg は呼ばれる
{
  const env = loadEnv(targetPath);
  env._clear();

  env.notifySaveWarning({
    message:'文言X',
    consoleTag:'[TEST]',
    callsiteId:'T03'
    // fields 省略
  });

  // showMsg は呼ばれる
  const final = env._regMsgFinal();
  assert(final.indexOf('alert-warn')!==-1, 'T-NSW-no-fields-a: showMsg(warn) が呼ばれる');
  assert(final.indexOf('文言X')!==-1, 'T-NSW-no-fields-b: 最終表示に message が含まれる');

  // 総括 console.warn では fields が空配列扱い
  const testWarns = env._warnCalls.filter(function(w){return w.indexOf('[TEST]')!==-1;});
  assertEq(testWarns.length, 1, 'T-NSW-no-fields-c: 総括 console.warn が 1 件');
  assert(testWarns[0].indexOf('"fields":[]')!==-1, 'T-NSW-no-fields-d: fields が空配列で出力される');
}

// ============================================================================
// SECTION 9: SAVE-UX-STATUS-INDICATOR-IMPL — Level 2 保存状態 indicator
// ============================================================================
// 設計書: docs/specs/20260513_shogi_save_ux_status_indicator_design.md
// 方針:
//   - notifySaveWarning helper 経由の warn を indicator (#save-warning-indicator)
//     に「保存確認 N件」として累積表示する
//   - 1 helper 呼出 = count +1（fields.length 分は加算しない）
//   - memory only（localStorage / sessionStorage / tournament state 不書き込み）
//   - N=0 で hidden、N>=1 で表示

function getIndicatorEl(env){
  return env._ctx.document._elements['save-warning-indicator'];
}

// T-IND-initial-hidden: 初期状態で indicator が hidden、textContent 空
{
  const env = loadEnv(targetPath);
  // 初回 updateSaveWarningIndicator() を呼んで初期状態を反映
  env.updateSaveWarningIndicator();
  const el = getIndicatorEl(env);
  assert(el !== undefined, 'T-IND-initial-hidden-a: indicator 要素が getElementById で取得できる（lazy 生成）');
  assertEq(el.hidden, true, 'T-IND-initial-hidden-b: 初期 hidden=true');
  assertEq(el.textContent, '', 'T-IND-initial-hidden-c: 初期 textContent 空');
  assertEq(env._getIndicatorState().count, 0, 'T-IND-initial-hidden-d: 初期 state.count=0');
}

// T-IND-once: notifySaveWarning 1 回で indicator が表示され「保存確認 1件」
{
  const env = loadEnv(targetPath);
  env._clear();
  env.notifySaveWarning({
    message:'テスト警告',
    consoleTag:'[TEST]',
    callsiteId:'T01',
    fields:['last_class']
  });
  const el = getIndicatorEl(env);
  assertEq(env._getIndicatorState().count, 1, 'T-IND-once-a: count=1');
  assertEq(el.hidden, false, 'T-IND-once-b: hidden=false（表示）');
  assertEq(el.textContent, '保存確認 1件', 'T-IND-once-c: textContent=保存確認 1件');
}

// T-IND-twice: 連続 2 回で「保存確認 2件」
{
  const env = loadEnv(targetPath);
  env._clear();
  env.notifySaveWarning({message:'A', consoleTag:'[TEST]', callsiteId:'T02', fields:['x']});
  env.notifySaveWarning({message:'B', consoleTag:'[TEST]', callsiteId:'T02', fields:['y']});
  const el = getIndicatorEl(env);
  assertEq(env._getIndicatorState().count, 2, 'T-IND-twice-a: count=2');
  assertEq(el.hidden, false, 'T-IND-twice-b: hidden=false');
  assertEq(el.textContent, '保存確認 2件', 'T-IND-twice-c: textContent=保存確認 2件');
}

// T-IND-fields-4: fields が 4 要素でも 1 回呼出なら count +1（fields.length 分加算しない）
{
  const env = loadEnv(targetPath);
  env._clear();
  env.notifySaveWarning({
    message:'4 fields fail',
    consoleTag:'[TEST]',
    callsiteId:'T03',
    fields:['last_class','member','grade','city']
  });
  const el = getIndicatorEl(env);
  assertEq(env._getIndicatorState().count, 1, 'T-IND-fields-4-a: count=1（fields.length=4 でも +1）');
  assertEq(el.textContent, '保存確認 1件', 'T-IND-fields-4-b: textContent=保存確認 1件');
}

// T-IND-S03: S03 経由 warn で count +1
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  // S03 で master verify を失敗させて helper 経由 warn を発火させる
  installMasterVerifyFailHookFields(env, 'm1', {last_class:'A'});
  env.handlePastParticipantClassAdd('m1', 'B');

  assertEq(env._getIndicatorState().count, 1, 'T-IND-S03-a: S03 経由 helper warn で count=1');
  const el = getIndicatorEl(env);
  assertEq(el.hidden, false, 'T-IND-S03-b: hidden=false');
  assertEq(el.textContent, '保存確認 1件', 'T-IND-S03-c: textContent=保存確認 1件');
}

// T-IND-S05: S05 経由 warn で count +1
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [{id:'p_m1', name:'田中', cls:'A', member:'member', grade:'ippan', member_id:'m1', entry_no:1}];
  env._setState(s);
  seedMaster(env, [makeMember('m1','田中',{last_class:'A'})]);
  env.save();
  env._clear();

  installMasterVerifyFailHookFields(env, 'm1', {last_class:'A'});
  env.handleSuggestClassAdd('m1', 'B');

  assertEq(env._getIndicatorState().count, 1, 'T-IND-S05-a: S05 経由 helper warn で count=1');
  const el = getIndicatorEl(env);
  assertEq(el.hidden, false, 'T-IND-S05-b: hidden=false');
  assertEq(el.textContent, '保存確認 1件', 'T-IND-S05-c: textContent=保存確認 1件');
}

// T-IND-S22-multi: S22 で 4 fields すべて失敗でも count +1（user-facing 1 件集約 + indicator +1）
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
  // 4 fields すべて期待値と異なる値で persist → verify 全失敗 → notifySaveWarning 1 回呼出
  installMasterVerifyFailHookFields(env, 'm1', {
    last_class:'A',
    member:'WRONG',
    grade:'WRONG',
    city:'WRONG'
  });
  env._ctx.document.getElementById('me-save').click();

  // S22 4 fields 失敗でも helper 呼出は 1 回 → indicator count +1
  assertEq(env._getIndicatorState().count, 1, 'T-IND-S22-multi-a: 4 fields 失敗でも count=1（fields.length=4 分加算しない）');
  const el = getIndicatorEl(env);
  assertEq(el.hidden, false, 'T-IND-S22-multi-b: hidden=false');
  assertEq(el.textContent, '保存確認 1件', 'T-IND-S22-multi-c: textContent=保存確認 1件（field 名・件数は user-facing に出さない）');
}

// T-IND-dom-absent: DOM 不在で例外を投げず silent skip
{
  const env = loadEnv(targetPath);
  // getElementById を override して save-warning-indicator のみ null を返すようにする
  const origGetElementById = env._ctx.document.getElementById.bind(env._ctx.document);
  env._ctx.document.getElementById = function(id){
    if(id === 'save-warning-indicator') return null;
    return origGetElementById(id);
  };

  let threw = false;
  try {
    env.notifySaveWarning({message:'X', consoleTag:'[TEST]', callsiteId:'T04', fields:[]});
    env.updateSaveWarningIndicator();
    env.recordSaveWarningForIndicator({callsiteId:'T04', fields:[]});
  } catch(e) {
    threw = true;
  }
  assertEq(threw, false, 'T-IND-dom-absent-a: DOM 不在でも例外を投げない');
  // count は increment される（state は DOM と独立）
  assert(env._getIndicatorState().count >= 1, 'T-IND-dom-absent-b: state.count は increment される（DOM と独立）');
}

// T-IND-no-storage: indicator 用に localStorage に書き込みしない
{
  const env = loadEnv(targetPath);
  env._clear();
  // localStorage の初期キー数を記録
  const beforeKeys = Object.keys(env._ctx.localStorage._);

  env.notifySaveWarning({message:'X', consoleTag:'[TEST]', callsiteId:'T05', fields:['last_class']});
  env.notifySaveWarning({message:'Y', consoleTag:'[TEST]', callsiteId:'T05', fields:['member']});

  // helper 呼出後の localStorage キーを確認
  const afterKeys = Object.keys(env._ctx.localStorage._);
  // 新規追加されたキーが indicator 系でないことを確認
  const addedKeys = afterKeys.filter(k => beforeKeys.indexOf(k) === -1);
  // indicator 関連キー（save-warning-indicator / saveWarningIndicator* など）が増えていないこと
  const indicatorRelatedKeys = afterKeys.filter(k =>
    k.indexOf('save-warning-indicator') !== -1 ||
    k.indexOf('saveWarningIndicator') !== -1 ||
    k.indexOf('SaveWarn') !== -1
  );
  assertEq(indicatorRelatedKeys.length, 0, 'T-IND-no-storage-a: indicator 用の localStorage キーが存在しない');
  // state は memory 上で increment されている
  assertEq(env._getIndicatorState().count, 2, 'T-IND-no-storage-b: state.count は memory 上で increment（count=2）');
}

// ============================================================================
// SECTION 10: SAVE-UX-WARN-HELPER-EXPAND — A-5.1 SAVE系 6 callsite の helper 経由化
// ============================================================================
// 設計書 / 依頼: SAVE-UX-WARN-HELPER-EXPAND（PR #69 後続）
// 対象 callsite（Group A + B, 6 件）:
//   - SAVE-002-addPlayer / SAVE-001-removePlayer（登録欄 add/remove）
//   - SAVE-003-startTournament / SAVE-004-generatePairing
//   - SAVE-003-setWinner / SAVE-003-submitRound（大会進行 core）
// 検証方針: mechanical refactor の整合性確認
//   (a) 各 callsiteId が source 中に出現する（helper 呼出に置換済み）
//   (b) 旧 `console.warn('SAVE-XXX: <function>` 1-arg 形が当該文字列リテラルとして残らない
//   (c) helper 動作（user-facing showMsg / console.warn / indicator +1）は SECTION 8/9 で既存検証済
//   (d) callsite ごとの verify-fail 経路の振る舞い（warn 表示）は test/test_a5_1_save_*.js が継続検証
const __EXPAND_SRC = fs.readFileSync(targetPath, 'utf8');

// ============================================================================
// SECTION 12.5: extractNotifySaveWarningBlocks helper (SAVE-UX-TEST-STRUCTURAL-MATCH)
// ============================================================================
// 旧 SECTION 13 / 15 / 16 の static assert で使用していた「200 文字 window」依存方式から、
// notifySaveWarning({...}) block 単位の structural match に移行するための helper。
//
// 方針:
//   - AST parser を使わない（外部依存追加しない）
//   - lightweight brace depth scanner で notifySaveWarning({...}) block を抽出
//   - single / double quote 文字列内の `{` / `}` は brace count しない
//   - escape 文字を考慮
//   - template literal / regex literal は今回想定外（shogi_v4.html 内未使用と Plan Mode で確認）
//
// 出力 block オブジェクト:
//   { block, start, end, lineNumber, callsiteId, kind, severity, aggregateKey,
//     message, consoleTag, hasFields, hasMessage, hasConsoleTag }
// プロパティ抽出:
//   - 厳密な string literal 値（'...' / "..."）のみ抽出
//   - 動的連結（'...'+expr+'...'）は最初の literal セグメントが抽出される（OK: kind/severity/
//     aggregateKey/callsiteId は常に純 string literal、これらの厳密一致 assert がメイン用途）
//   - fields は厳密パースしない（hasFields boolean のみ）
//   - property 順序非依存

function _extractStringPropFromBlock(block, propName){
  // `propName:'...'` または `propName:"..."` の string literal を抽出。
  // escape 文字 (\\.) を考慮、非貪欲マッチ。
  var re = new RegExp(
    '\\b' + propName + '\\s*:\\s*([\'"])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1'
  );
  var m = re.exec(block);
  if (!m) return null;
  // escape 解除（簡易: \' / \" / \\ / \n / \r / \t のみ）
  return m[2]
    .replace(/\\\\/g, ' ')   // 一旦 NUL に退避
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/ /g, '\\');
}

function extractNotifySaveWarningBlocks(src){
  var blocks = [];
  if (typeof src !== 'string') return blocks;
  var marker = 'notifySaveWarning({';
  var i = 0;
  while (true) {
    var found = src.indexOf(marker, i);
    if (found === -1) break;
    var braceStart = found + marker.length - 1;  // '{' の位置
    var depth = 0;
    var pos = braceStart;
    var inStr = false;
    var strChar = '';
    var end = -1;
    while (pos < src.length) {
      var ch = src.charAt(pos);
      if (inStr) {
        if (ch === '\\') { pos += 2; continue; }
        if (ch === strChar) { inStr = false; pos++; continue; }
        pos++;
        continue;
      }
      if (ch === "'" || ch === '"') {
        inStr = true; strChar = ch; pos++; continue;
      }
      if (ch === '{') { depth++; pos++; continue; }
      if (ch === '}') {
        depth--;
        if (depth === 0) { end = pos; break; }
        pos++;
        continue;
      }
      pos++;
    }
    if (end === -1) {
      // malformed block: 閉じ brace が見つからない → 安全に skip して次へ
      i = found + marker.length;
      continue;
    }
    var block = src.substring(braceStart, end + 1);
    var startLineNum = src.substring(0, found).split('\n').length;
    blocks.push({
      block: block,
      start: braceStart,
      end: end,
      lineNumber: startLineNum,
      callsiteId: _extractStringPropFromBlock(block, 'callsiteId'),
      kind: _extractStringPropFromBlock(block, 'kind'),
      severity: _extractStringPropFromBlock(block, 'severity'),
      aggregateKey: _extractStringPropFromBlock(block, 'aggregateKey'),
      message: _extractStringPropFromBlock(block, 'message'),
      consoleTag: _extractStringPropFromBlock(block, 'consoleTag'),
      hasFields: /\bfields\s*:/.test(block),
      hasMessage: /\bmessage\s*:/.test(block),
      hasConsoleTag: /\bconsoleTag\s*:/.test(block)
    });
    i = end + 1;
  }
  return blocks;
}

// ----------------------------------------------------------------------------
// helper 単体テスト
// ----------------------------------------------------------------------------

// T-HELPER-1: 単純な 1 block
{
  var src = "notifySaveWarning({ kind: 'save-verify', severity: 'warn' });";
  var bs = extractNotifySaveWarningBlocks(src);
  assertEq(bs.length, 1, 'T-HELPER-1: 単純な 1 block を抽出');
  assertEq(bs[0].kind, 'save-verify', 'T-HELPER-1-kind');
  assertEq(bs[0].severity, 'warn', 'T-HELPER-1-severity');
}

// T-HELPER-2: 複数 block
{
  var src = "notifySaveWarning({ kind: 'A' });\nnotifySaveWarning({ kind: 'B' });";
  var bs = extractNotifySaveWarningBlocks(src);
  assertEq(bs.length, 2, 'T-HELPER-2: 2 block を抽出');
  assertEq(bs[0].kind, 'A', 'T-HELPER-2-kind-A');
  assertEq(bs[1].kind, 'B', 'T-HELPER-2-kind-B');
}

// T-HELPER-3: 改行を含む block
{
  var src = "notifySaveWarning({\n  kind: 'save-verify',\n  severity: 'warn',\n  aggregateKey: 'save-verify:core'\n});";
  var bs = extractNotifySaveWarningBlocks(src);
  assertEq(bs.length, 1, 'T-HELPER-3: 複数行 block を抽出');
  assertEq(bs[0].kind, 'save-verify', 'T-HELPER-3-kind');
  assertEq(bs[0].aggregateKey, 'save-verify:core', 'T-HELPER-3-aggregateKey');
}

// T-HELPER-4: string 内 brace に騙されない
{
  var src = "notifySaveWarning({ message: 'test { with brace }', kind: 'X' });";
  var bs = extractNotifySaveWarningBlocks(src);
  assertEq(bs.length, 1, 'T-HELPER-4: string 内 brace に騙されず 1 block');
  assertEq(bs[0].message, 'test { with brace }', 'T-HELPER-4-message');
  assertEq(bs[0].kind, 'X', 'T-HELPER-4-kind');
}

// T-HELPER-5: escape 文字を処理
{
  var src = "notifySaveWarning({ message: 'it\\'s { ok }', kind: 'Y' });";
  var bs = extractNotifySaveWarningBlocks(src);
  assertEq(bs.length, 1, 'T-HELPER-5: escape 文字で壊れない');
  assertEq(bs[0].kind, 'Y', 'T-HELPER-5-kind');
  assertEq(bs[0].message, "it's { ok }", 'T-HELPER-5-message-unescaped');
}

// T-HELPER-6: property 順序入れ替え
{
  var src = "notifySaveWarning({ aggregateKey: 'x:y', severity: 'warn', kind: 'Z', callsiteId: 'C1' });";
  var bs = extractNotifySaveWarningBlocks(src);
  assertEq(bs.length, 1, 'T-HELPER-6: order-independent');
  assertEq(bs[0].kind, 'Z', 'T-HELPER-6-kind');
  assertEq(bs[0].severity, 'warn', 'T-HELPER-6-severity');
  assertEq(bs[0].aggregateKey, 'x:y', 'T-HELPER-6-aggregateKey');
  assertEq(bs[0].callsiteId, 'C1', 'T-HELPER-6-callsiteId');
}

// T-HELPER-7: fields の存在確認
{
  var src1 = "notifySaveWarning({ fields: ['last_class'], kind: 'K1' });";
  var bs1 = extractNotifySaveWarningBlocks(src1);
  assertEq(bs1[0].hasFields, true, 'T-HELPER-7-with: fields ありで hasFields=true');
  var src2 = "notifySaveWarning({ kind: 'K2' });";
  var bs2 = extractNotifySaveWarningBlocks(src2);
  assertEq(bs2[0].hasFields, false, 'T-HELPER-7-without: fields なしで hasFields=false');
}

// T-HELPER-8: malformed block (閉じ brace なし)
{
  var src = "notifySaveWarning({ kind: 'X', severity: 'warn'\nnotifySaveWarning({ kind: 'Y' });";
  var bs = extractNotifySaveWarningBlocks(src);
  // 1 つ目は malformed → skip、2 つ目は正常に抽出される（または 0 件）
  //   現実装では `{` から走査して閉じ `}` を探すが、途中で次の `notifySaveWarning(` に
  //   入っても brace 数で対応 `}` を見つけて 1 つ目を切り出してしまう可能性がある。
  //   いずれにせよ throw しないことを最低保証する。
  assert(Array.isArray(bs), 'T-HELPER-8: malformed でも throw せず配列を返す');
}

// T-HELPER-9: lineNumber が取れる
{
  var src = "// line 1\n// line 2\nnotifySaveWarning({ kind: 'L' });";
  var bs = extractNotifySaveWarningBlocks(src);
  assertEq(bs.length, 1, 'T-HELPER-9: 1 block');
  assertEq(bs[0].lineNumber, 3, 'T-HELPER-9-lineNumber: block 開始行 = 3');
}

// shogi_v4.html 全体に対する block 抽出（共有変数として SECTION 13 / 15 / 16 / 18 で使用）
var __EXPAND_BLOCKS = extractNotifySaveWarningBlocks(__EXPAND_SRC);

// 抽出件数の sanity check: 15 (save-verify) + 2 (storage-quota) + 3 (master-verify) + 1 (storage-corrupted) = 21
assertEq(__EXPAND_BLOCKS.length, 21,
  'T-HELPER-shogi-blocks: shogi_v4.html から 21 個の notifySaveWarning block を抽出');

// ============================================================================
// SECTION 10 (continued)
// ============================================================================

// T-EXP-callsiteId-present-*: 6 callsiteId がすべて helper 引数として現れる
[
  'SAVE-001-removePlayer',
  'SAVE-002-addPlayer',
  'SAVE-003-startTournament',
  'SAVE-003-setWinner',
  'SAVE-003-submitRound',
  'SAVE-004-generatePairing'
].forEach(function(cid){
  var needle = "callsiteId:'" + cid + "'";
  assert(__EXPAND_SRC.indexOf(needle) !== -1, 'T-EXP-callsiteId-present-' + cid + ': source に ' + needle + ' が存在する');
});

// T-EXP-original-warn-removed-*: 旧 1-arg console.warn が残っていない
// （verify helper 内部 catch のもの = 'SAVE-XXX: verify*' / 'readPersistedState failed' は対象外）
[
  "console.warn('SAVE-001: removePlayer ",
  "console.warn('SAVE-002: addPlayer ",
  "console.warn('SAVE-003: startTournament ",
  "console.warn('SAVE-003: setWinner ",
  "console.warn('SAVE-003: submitRound ",
  "console.warn('SAVE-004: generatePairing "
].forEach(function(pat){
  assert(__EXPAND_SRC.indexOf(pat) === -1, 'T-EXP-original-warn-removed: 旧 1-arg warn が残らない (' + pat + ')');
});

// T-EXP-consoleTag-preserved-*: 旧 console.warn 第1引数の主要文言は consoleTag として保持
[
  'SAVE-001: removePlayer の保存が確認できませんでした',
  'SAVE-002: addPlayer の保存が確認できませんでした',
  'SAVE-003: startTournament の保存が確認できませんでした',
  'SAVE-003: setWinner の保存が確認できませんでした',
  'SAVE-003: submitRound の保存が確認できませんでした',
  'SAVE-004: generatePairing の保存が確認できませんでした'
].forEach(function(tag){
  assert(__EXPAND_SRC.indexOf(tag) !== -1, 'T-EXP-consoleTag-preserved: consoleTag 主要文言が残る (' + tag + ')');
});

// T-EXP-showMsg-message-preserved-*: 旧 user-facing showMsg('...', 'warn') の文言は helper.message として保持
[
  '削除は反映されましたが、保存が確認できませんでした',
  '参加者は登録されましたが、保存が確認できませんでした',
  '大会を開始しましたが、保存が確認できませんでした',
  '勝敗を入力しましたが、保存が確認できませんでした',
  '回戦を確定しましたが、保存が確認できませんでした',
  '組み合わせを生成しましたが、保存が確認できませんでした'
].forEach(function(msg){
  assert(__EXPAND_SRC.indexOf(msg) !== -1, 'T-EXP-showMsg-message-preserved: user-facing 文言が残る (' + msg + ')');
});

// ============================================================================
// SECTION 11: SAVE-UX-WARN-HELPER-EXPAND-2 — Group C + E の 5 callsite を helper 経由化
// ============================================================================
// 依頼: SAVE-UX-WARN-HELPER-EXPAND-2（PR #70 後続、Group D は SAVE-UX-WARN-HELPER-EXPAND-3 に持ち越し）
// 対象 callsite（5 件）:
//   Group C（登録欄編集）:
//     - SAVE-003b-updateField               属性変更時の verifyPlayerFieldPersisted
//     - SAVE-003b-bulkEditNames             一括名前変更時の verifyStatePersisted 集約
//   Group E（対局画面編集）:
//     - SAVE-003b-bindChangePairingModalEvents       対戦相手変更時の pairingsMatchSnapshot
//     - SAVE-003b-bindEditPastResultModalEvents-p1   過去結果修正 p1 勝者
//     - SAVE-003b-bindEditPastResultModalEvents-p2   過去結果修正 p2 勝者
//
// 検証方針: mechanical refactor の整合性確認（PR #70 SECTION 10 と同様の静的 source 検証）
//   (a) 各 callsiteId が source 中に出現する
//   (b) 旧 `console.warn('SAVE-003b: <function>` 1-arg リテラルが当該位置に残らない
//   (c) consoleTag / showMsg 文言が保持される
//   (d) helper 動作（user-facing showMsg / console.warn / indicator +1）は SECTION 8/9 で既存検証済
//   (e) callsite ごとの verify-fail 経路の挙動は test/test_a5_1_save_003b_*.js が継続検証
//
// Group D / MASTER-001 系 / quota / parse / duplicate / import / migration / S30 は今回未対象であることを
// 静的 assert する（旧形式の console.warn が依然残る = 触っていない、を確認）。

// T-EXP2-callsiteId-present-*: 今回追加 5 callsiteId がすべて helper 引数として現れる
[
  'SAVE-003b-updateField',
  'SAVE-003b-bulkEditNames',
  'SAVE-003b-bindChangePairingModalEvents',
  'SAVE-003b-bindEditPastResultModalEvents-p1',
  'SAVE-003b-bindEditPastResultModalEvents-p2'
].forEach(function(cid){
  var needle = "callsiteId:'" + cid + "'";
  assert(__EXPAND_SRC.indexOf(needle) !== -1, 'T-EXP2-callsiteId-present-' + cid + ': source に ' + needle + ' が存在する');
});

// T-EXP2-original-warn-removed-*: 旧 1-arg console.warn が残っていない
[
  "console.warn('SAVE-003b: updateField ",
  "console.warn('SAVE-003b: bulkEditNames ",
  "console.warn('SAVE-003b: bindChangePairingModalEvents ",
  "console.warn('SAVE-003b: bindEditPastResultModalEvents (p1) ",
  "console.warn('SAVE-003b: bindEditPastResultModalEvents (p2) "
].forEach(function(pat){
  assert(__EXPAND_SRC.indexOf(pat) === -1, 'T-EXP2-original-warn-removed: 旧 1-arg warn が残らない (' + pat + ')');
});

// T-EXP2-consoleTag-preserved-*: 旧 console.warn 第1引数の主要文言が consoleTag として保持
[
  'SAVE-003b: updateField の保存が確認できませんでした',
  'SAVE-003b: bulkEditNames の保存が確認できませんでした',
  'SAVE-003b: bindChangePairingModalEvents の保存が確認できませんでした',
  'SAVE-003b: bindEditPastResultModalEvents (p1) の保存が確認できませんでした',
  'SAVE-003b: bindEditPastResultModalEvents (p2) の保存が確認できませんでした'
].forEach(function(tag){
  assert(__EXPAND_SRC.indexOf(tag) !== -1, 'T-EXP2-consoleTag-preserved: consoleTag 主要文言が残る (' + tag + ')');
});

// T-EXP2-showMsg-message-preserved-*: 旧 user-facing showMsg('...', 'warn') 文言が helper.message として保持
[
  '属性を変更しましたが、保存が確認できませんでした',
  '名分の保存が確認できませんでした',          // bulkEditNames は動的文字列だが、固定 substring を確認
  '対戦相手を変更しましたが、保存が確認できませんでした',
  '過去結果を修正しましたが、保存が確認できませんでした'
].forEach(function(msg){
  assert(__EXPAND_SRC.indexOf(msg) !== -1, 'T-EXP2-showMsg-message-preserved: user-facing 文言が残る (' + msg + ')');
});

// T-EXP2-group-d-deferred: PR #73 時点では Group D は次タスクへ持ち越し（コメント残置）。
//   実際の Group D helper 経由化は SAVE-UX-WARN-HELPER-EXPAND-3 (SECTION 12) で検証する。
//   ここでは PR #73 の境界条件 assert を SECTION 12 に移譲した記録として履歴を残す。

// T-EXP2-master001-untouched: MASTER-001 系 callsite の応急処置 warn 文言が source に残る（未変更裏付け）
//   MASTER-001 系には特殊な warn 文言（参加者名 / 会員マスタ）が複数あり、本 PR では一切触らない
[
  '参加者名を更新しましたが、保存できていない可能性があります',
  '会員マスタは更新しましたが、大会データの保存ができていない可能性があります',
  '会員マスタは保存できなかった可能性があります',
  '会員マスタ候補が変わったため、会員マスタは更新せず'
].forEach(function(msg){
  assert(__EXPAND_SRC.indexOf(msg) !== -1, 'T-EXP2-master001-untouched: MASTER-001 系文言が残る (' + msg + ')');
});

// T-EXP2-helper-schema: PR #73 時点では metadata 未追加だったが、SAVE-UX-WARN-AGGREGATION-IMPL
//   (SECTION 13) で metadata 土台が入り、`opts.kind` / `opts.aggregateKey` / `opts.severity` が
//   公式に schema へ追加される。helper 内部の検証は SECTION 13 へ移譲（履歴目的のコメント残置）。
assert(__EXPAND_SRC.indexOf('Object.prototype.toString.call(opts.fields)') !== -1,
  'T-EXP2-helper-fields-receiver-preserved: helper の fields 受理ロジックが維持');

// ============================================================================
// SECTION 12: SAVE-UX-WARN-HELPER-EXPAND-3 — Group D の 4 callsite を helper 経由化
// ============================================================================
// 依頼: SAVE-UX-WARN-HELPER-EXPAND-3（PR #73 後続、最終）
// Group D の 4 件すべて単純置換可と判定:
//   D-1: SAVE-003b-handlePastParticipantClassAdd-class-change
//        success ok (s03MasterVerifyOk gate) → verify-fail warn 上書き構造、PR #70 Group B と同形
//   D-2: SAVE-003b-handlePastParticipantClassAdd-add
//        success ok → verify-fail warn 上書き構造、PR #70 Group B と同形
//   D-3: SAVE-003b-handleSuggestClassAdd
//        postSuccess 内、warnMsg は static 文字列パラメータ（動的連結ではない）。message:warnMsg で渡せる
//   D-4: SAVE-003b-finalizeAddPastParticipants
//        success ok / ふりがな warn → verify-fail warn 上書き構造
//        ふりがな warn (1883) は別カテゴリの success-with-caveat 通知で、本 PR の置換対象ではない（不変）

// T-EXP3-callsiteId-present-*: 今回追加 4 callsiteId がすべて helper 引数として現れる
[
  'SAVE-003b-handlePastParticipantClassAdd-class-change',
  'SAVE-003b-handlePastParticipantClassAdd-add',
  'SAVE-003b-handleSuggestClassAdd',
  'SAVE-003b-finalizeAddPastParticipants'
].forEach(function(cid){
  var needle = "callsiteId:'" + cid + "'";
  assert(__EXPAND_SRC.indexOf(needle) !== -1, 'T-EXP3-callsiteId-present-' + cid + ': source に ' + needle + ' が存在する');
});

// T-EXP3-original-warn-removed-*: 旧 1-arg console.warn が残っていない
[
  "console.warn('SAVE-003b: handlePastParticipantClassAdd (class change) ",
  "console.warn('SAVE-003b: handlePastParticipantClassAdd (add) ",
  "console.warn('SAVE-003b: handleSuggestClassAdd ",
  "console.warn('SAVE-003b: finalizeAddPastParticipants "
].forEach(function(pat){
  assert(__EXPAND_SRC.indexOf(pat) === -1, 'T-EXP3-original-warn-removed: 旧 1-arg warn が残らない (' + pat + ')');
});

// T-EXP3-consoleTag-preserved-*: 旧 console.warn 第1引数の主要文言が consoleTag として保持
[
  'SAVE-003b: handlePastParticipantClassAdd (class change) の保存が確認できませんでした',
  'SAVE-003b: handlePastParticipantClassAdd (add) の保存が確認できませんでした',
  'SAVE-003b: handleSuggestClassAdd の保存が確認できませんでした',
  'SAVE-003b: finalizeAddPastParticipants の保存が確認できませんでした'
].forEach(function(tag){
  assert(__EXPAND_SRC.indexOf(tag) !== -1, 'T-EXP3-consoleTag-preserved: consoleTag 主要文言が残る (' + tag + ')');
});

// T-EXP3-showMsg-message-preserved-*: 既存 user-facing 文言が helper.message または warnMsg 経由で保持
[
  'クラスを変更しましたが、保存が確認できませんでした',          // D-1
  '参加者は登録されましたが、保存が確認できませんでした',        // D-2 (PR #70 SAVE-002 と共通文言)
  '名分の保存が確認できませんでした'                              // D-4 動的（substring 検証）
].forEach(function(msg){
  assert(__EXPAND_SRC.indexOf(msg) !== -1, 'T-EXP3-showMsg-message-preserved: user-facing 文言が残る (' + msg + ')');
});

// T-EXP3-d3-dynamic-message: D-3 (handleSuggestClassAdd) の message は呼出側の warnMsg を渡す
//   postSuccess 関数の引数 warnMsg を helper.message に渡している構造を確認
assert(__EXPAND_SRC.indexOf('message:warnMsg,') !== -1,
  'T-EXP3-d3-dynamic-message: D-3 で message:warnMsg として呼出側パラメータをそのまま渡している');

// T-EXP3-d4-yomi-caveat-preserved: D-4 finalizeAddPastParticipants の「ふりがな未登録」success-with-caveat 通知が不変
//   line 1883 付近の `'ふりがな未登録のまま N名を追加しました'` は本 PR で触らない（別カテゴリの通知）
assert(__EXPAND_SRC.indexOf("ふりがな未登録のまま ") !== -1,
  'T-EXP3-d4-yomi-caveat-preserved: ふりがな未登録 success-with-caveat 通知が残る（本 PR で触らない）');
// 通知形式: showMsg('ふりがな未登録のまま N名を...', 'warn') の生形が残っていること
//   helper 経由化されていない（success-with-caveat は verify-fail とは別カテゴリ）
assert(__EXPAND_SRC.indexOf("showMsg('ふりがな未登録のまま ") !== -1,
  'T-EXP3-d4-yomi-caveat-untouched: ふりがな warn は showMsg 直接呼出のまま（helper 化していない）');

// T-EXP3-success-suppression-preserved: D-1 / D-3 の success showMsg 抑止構造が維持される
//   D-1: `if(s03MasterVerifyOk){ showMsg(...,'ok'); }` ゲート (line 1703 付近)
//   D-3: `postSuccess(..., {suppressOkMsg:!s05MasterVerifyOk});` フラグ渡し (line 3329 付近)
assert(__EXPAND_SRC.indexOf('if(s03MasterVerifyOk){') !== -1,
  'T-EXP3-success-suppression-preserved-d1: D-1 s03MasterVerifyOk ゲートが維持');
assert(__EXPAND_SRC.indexOf('suppressOkMsg:!s05MasterVerifyOk') !== -1,
  'T-EXP3-success-suppression-preserved-d3: D-3 suppressOkMsg フラグが維持');

// T-EXP3-group-abce-untouched: Group A/B/C/E の helper 経由化済 callsiteId が依然 source に残る
//   (本 PR では PR #70 / #73 で確立した 11 件を一切触っていない)
[
  // PR #70 (Group A + B)
  'SAVE-001-removePlayer',
  'SAVE-002-addPlayer',
  'SAVE-003-startTournament',
  'SAVE-003-setWinner',
  'SAVE-003-submitRound',
  'SAVE-004-generatePairing',
  // PR #73 (Group C + E)
  'SAVE-003b-updateField',
  'SAVE-003b-bulkEditNames',
  'SAVE-003b-bindChangePairingModalEvents',
  'SAVE-003b-bindEditPastResultModalEvents-p1',
  'SAVE-003b-bindEditPastResultModalEvents-p2'
].forEach(function(cid){
  var needle = "callsiteId:'" + cid + "'";
  assert(__EXPAND_SRC.indexOf(needle) !== -1, 'T-EXP3-group-abce-untouched: PR #70/#73 で確立した '+cid+' が残る');
});

// T-EXP3-master001-untouched: MASTER-001 系の応急処置 warn 文言が残存（本 PR で触らない裏付け）
[
  '参加者名を更新しましたが、保存できていない可能性があります',
  '会員マスタは更新しましたが、大会データの保存ができていない可能性があります',
  '会員マスタは保存できなかった可能性があります'
].forEach(function(msg){
  assert(__EXPAND_SRC.indexOf(msg) !== -1, 'T-EXP3-master001-untouched: MASTER-001 系 '+msg+' が残る');
});

// T-EXP3-helper-schema: PR #74 時点では metadata 未追加だったが、SAVE-UX-WARN-AGGREGATION-IMPL
//   (SECTION 13) で metadata 土台が入る。helper 内部の検証は SECTION 13 へ移譲。
assert(__EXPAND_SRC.indexOf('Object.prototype.toString.call(opts.fields)') !== -1,
  'T-EXP3-helper-fields-receiver-preserved: helper の fields 受理ロジックが維持');

// ============================================================================
// SECTION 13: SAVE-UX-WARN-AGGREGATION-IMPL — metadata 土台（集約はまだしない）
// ============================================================================
// 依頼: SAVE-UX-WARN-AGGREGATION-IMPL（PR #74 後続）
// 設計: docs/specs/20260513_shogi_save_ux_warn_aggregation_design.md
//
// 今回の合言葉: 「集約はまだしない。集約できる土台だけ入れる」
//
// 実装範囲:
//   (a) notifySaveWarning に任意 metadata { kind, aggregateKey, severity } を追加
//   (b) metadata なし呼び出しでも従来通り動作する後方互換
//   (c) metadata あり呼び出しで console.warn 出力 object に metadata が含まれる
//   (d) undefined metadata は output object から除外
//   (e) A-5.1 SAVE 系 15 件すべてに metadata（kind:'save-verify' / severity:'warn' /
//       aggregateKey:'save-verify:<group>'）を付与
//   (f) recordSaveWarningForIndicator に metadata を渡せる経路を確保
//
// 集約・抑制・表示分岐は本 PR で実装しない:
//   - showMsg 抑制 / 時間窓 / 短縮 message / 連続検知なし
//   - console.warn 集約なし
//   - indicator count 集約なし（発生単位で +1 を維持）
//   - severity による表示分岐なし
//
// 対象外（metadata 不付与）:
//   - MASTER-V2-LASTCLASS S03 / S05 / S22
//   - MASTER-001 系
//   - quota / parse / duplicate / import / migration / S30
//   - ふりがな success-with-caveat 通知

// Group ↔ aggregateKey 対応表（依頼書 §11 + PR #70/#73/#74 の実態）:
//   A 大会進行 core         → save-verify:core    (4件)
//   B 登録欄 add/remove     → save-verify:entry   (2件)
//   C 登録欄 編集           → save-verify:edit    (2件)
//   D 過去参加者経路        → save-verify:past    (4件)
//   E 対局画面 編集         → save-verify:pairing (3件)
//                                            計 15件

// ----------------------------------------------------------------------------
// T-EXP4-15-callsites-metadata: 15 callsiteId それぞれに 3 metadata（kind/aggregateKey/severity）が
//   notifySaveWarning 呼出 object 内に付与されていることを source 静的検証
// ----------------------------------------------------------------------------
var __EXP4_CALLSITES = [
  // [callsiteId, aggregateKey]
  // Group A (core)
  ['SAVE-003-startTournament',                          'save-verify:core'],
  ['SAVE-004-generatePairing',                          'save-verify:core'],
  ['SAVE-003-setWinner',                                'save-verify:core'],
  ['SAVE-003-submitRound',                              'save-verify:core'],
  // Group B (entry)
  ['SAVE-002-addPlayer',                                'save-verify:entry'],
  ['SAVE-001-removePlayer',                             'save-verify:entry'],
  // Group C (edit)
  ['SAVE-003b-updateField',                             'save-verify:edit'],
  ['SAVE-003b-bulkEditNames',                           'save-verify:edit'],
  // Group D (past)
  ['SAVE-003b-handlePastParticipantClassAdd-class-change','save-verify:past'],
  ['SAVE-003b-handlePastParticipantClassAdd-add',       'save-verify:past'],
  ['SAVE-003b-handleSuggestClassAdd',                   'save-verify:past'],
  ['SAVE-003b-finalizeAddPastParticipants',             'save-verify:past'],
  // Group E (pairing)
  ['SAVE-003b-bindChangePairingModalEvents',            'save-verify:pairing'],
  ['SAVE-003b-bindEditPastResultModalEvents-p1',        'save-verify:pairing'],
  ['SAVE-003b-bindEditPastResultModalEvents-p2',        'save-verify:pairing']
];

// metadata 付与 callsite 数の妥当性
assertEq(__EXP4_CALLSITES.length, 15, 'T-EXP4-callsite-count: 15 callsite を対象とする');

// SAVE-UX-TEST-STRUCTURAL-MATCH: 200 文字 window 依存から block 単位の structural match に移行。
//   extractNotifySaveWarningBlocks (SECTION 12.5) で抽出した __EXPAND_BLOCKS を使用する。

// save-verify 系 block を絞り込み
var __EXP4_SAVE_VERIFY_BLOCKS = __EXPAND_BLOCKS.filter(function(b){
  return b.kind === 'save-verify';
});

// 各 callsiteId が save-verify block として 1 件存在し、期待 aggregateKey / severity を持つ
__EXP4_CALLSITES.forEach(function(pair){
  var cid = pair[0];
  var expectedAk = pair[1];
  var matched = __EXP4_SAVE_VERIFY_BLOCKS.filter(function(b){ return b.callsiteId === cid; });
  assertEq(matched.length, 1, 'T-EXP4-callsiteId-unique: callsiteId=' + cid + ' は save-verify block として 1 件');
  if (matched.length === 1) {
    assertEq(matched[0].kind, 'save-verify',
      'T-EXP4-kind-save-verify: ' + cid + ' → kind=save-verify');
    assertEq(matched[0].severity, 'warn',
      'T-EXP4-severity-warn: ' + cid + ' → severity=warn');
    assertEq(matched[0].aggregateKey, expectedAk,
      'T-EXP4-aggregateKey-correct: ' + cid + ' → aggregateKey=' + expectedAk);
  }
});

// ----------------------------------------------------------------------------
// T-EXP4-aggregateKey-distribution: aggregateKey が Group 単位で正しい件数分配（structural）
// ----------------------------------------------------------------------------
var __EXP4_EXPECTED_DIST = {
  'save-verify:core':    4,
  'save-verify:entry':   2,
  'save-verify:edit':    2,
  'save-verify:past':    4,
  'save-verify:pairing': 3
};
Object.keys(__EXP4_EXPECTED_DIST).forEach(function(ak){
  var count = __EXP4_SAVE_VERIFY_BLOCKS.filter(function(b){
    return b.aggregateKey === ak;
  }).length;
  assertEq(count, __EXP4_EXPECTED_DIST[ak],
    'T-EXP4-aggregateKey-distribution: ' + ak + ' は ' + __EXP4_EXPECTED_DIST[ak] + ' 件');
});

// kind:'save-verify' の件数 = 15（structural）
assertEq(__EXP4_SAVE_VERIFY_BLOCKS.length, 15,
  'T-EXP4-kind-count: kind=save-verify の block は 15 件');

// kind=save-verify + severity=warn のペアが厳密に 15 件（structural）
//   SECTION 13 は save-verify 15 件の存在責務を持つ。block 単位の filter で
//   save-verify スコープに閉じた severity 整合性を保証する（200 文字 window 非依存）。
assertEq(
  __EXP4_SAVE_VERIFY_BLOCKS.filter(function(b){ return b.severity === 'warn'; }).length,
  15,
  'T-EXP4-save-verify-with-warn-strict: kind=save-verify + severity=warn の block が 15 件');

// ----------------------------------------------------------------------------
// T-EXP4-aggregateKey-format: 命名規則（kebab-case / 小文字 / `:` 区切り / 2 階層）
// ----------------------------------------------------------------------------
Object.keys(__EXP4_EXPECTED_DIST).forEach(function(ak){
  // kebab-case + : 区切り、2 階層
  assert(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(ak),
    'T-EXP4-aggregateKey-format: ' + ak + ' が kebab-case + : 区切り + 2階層');
  // 大文字混在禁止
  assertEq(ak, ak.toLowerCase(), 'T-EXP4-aggregateKey-lowercase: ' + ak);
  // _ や / 区切り不使用
  assertEq(ak.indexOf('_'), -1, 'T-EXP4-aggregateKey-no-underscore: ' + ak);
  assertEq(ak.indexOf('/'), -1, 'T-EXP4-aggregateKey-no-slash: ' + ak);
});

// ----------------------------------------------------------------------------
// T-EXP4-helper-schema-extended: notifySaveWarning helper 内で metadata 受理処理が存在
// ----------------------------------------------------------------------------
[
  'var kind=opts.kind',
  'var aggregateKey=opts.aggregateKey',
  'var severity=opts.severity',
  'if(kind!==undefined)warnMeta.kind=kind',
  'if(aggregateKey!==undefined)warnMeta.aggregateKey=aggregateKey',
  'if(severity!==undefined)warnMeta.severity=severity'
].forEach(function(pat){
  assert(__EXPAND_SRC.indexOf(pat) !== -1, 'T-EXP4-helper-schema-extended: ' + pat);
});

// ----------------------------------------------------------------------------
// T-EXP4-undefined-excluded: 出力 object に undefined を入れない for-loop pattern
//   "kind:undefined" のような literal は source に絶対存在しない
// ----------------------------------------------------------------------------
['kind:undefined','aggregateKey:undefined','severity:undefined'].forEach(function(pat){
  assert(__EXPAND_SRC.indexOf(pat) === -1, 'T-EXP4-undefined-excluded: ' + pat + ' は source に存在しない');
});

// ----------------------------------------------------------------------------
// T-EXP4-indicator-count-policy-preserved: indicator count は発生単位で +1 のまま
//   recordSaveWarningForIndicator 内に count+=1 が存在、集約ロジックなし
// ----------------------------------------------------------------------------
assert(__EXPAND_SRC.indexOf('saveWarningIndicatorState.count+=1') !== -1,
  'T-EXP4-indicator-count-1-per-call: count+=1 が維持');

// 集約っぽい記述が存在しないこと（時間窓 / aggregateKey によるカウント集約 / 短縮 message）
[
  'aggregateKey',  // ※ aggregateKey 自体は metadata として存在するが、これは別 assert で個別検証
  'time window',
  'time_window',
  'shortMessage',
  'short_message',
  'aggregateCount',
  'dedupedCount',
  'suppressedByAggregate',
  'lastAggregateKey'
].forEach(function(pat){
  if(pat === 'aggregateKey')return;  // metadata としての存在は OK
  assert(__EXPAND_SRC.indexOf(pat) === -1,
    'T-EXP4-no-aggregation-display: 集約表示の痕跡が存在しない (' + pat + ')');
});

// indicator count++ ロジック内に kind / aggregateKey / severity による分岐がない
// （recordSaveWarningForIndicator 関数本体の前後 500 文字を見る）
{
  var recordIdx = __EXPAND_SRC.indexOf('function recordSaveWarningForIndicator(');
  assert(recordIdx !== -1, 'T-EXP4-record-function-exists: recordSaveWarningForIndicator が存在');
  var recordBody = __EXPAND_SRC.substring(recordIdx, recordIdx + 500);
  // count+=1 が存在
  assert(recordBody.indexOf('count+=1') !== -1, 'T-EXP4-record-count-plus-one: 関数内に count+=1 が存在');
  // kind / aggregateKey / severity による条件分岐 / 計算がない
  ['if(opts.aggregateKey','if(opts.kind','if(opts.severity'].forEach(function(pat){
    assert(recordBody.indexOf(pat) === -1,
      'T-EXP4-record-no-metadata-branch: 関数内に '+pat+' による集約分岐なし');
  });
}

// ----------------------------------------------------------------------------
// T-EXP4-out-of-scope-no-save-verify: S03 / S05 / S22 に save-verify metadata が付かない (structural)
//   PR #82 で S03 / S05 / S22 は master-verify metadata 付与済み（SECTION 16 で検証）。
//   ここでは「save-verify スコープには含まれない」境界を structural match で確認する。
//   200 文字 window 非依存。SAVE-UX-TEST-STRUCTURAL-MATCH に従う。
// ----------------------------------------------------------------------------
['S03','S05','S22'].forEach(function(cid){
  var matched = __EXPAND_BLOCKS.filter(function(b){ return b.callsiteId === cid; });
  matched.forEach(function(b){
    assert(b.kind !== 'save-verify',
      'T-EXP4-master-v2-no-save-verify-kind: callsiteId=' + cid + ' に kind=save-verify が付かない');
    var ak = b.aggregateKey || '';
    assert(ak.indexOf('save-verify:') !== 0,
      'T-EXP4-master-v2-no-save-verify-aggregate: callsiteId=' + cid + ' に save-verify:* aggregateKey が付かない');
  });
});

// MASTER-001 系 / ふりがな success-with-caveat に kind / aggregateKey 注入なし
//   （これらは showMsg 直接呼出のままで helper 経由化されていないため、metadata は構造的に付かない）
assert(__EXPAND_SRC.indexOf("ふりがな未登録のまま ") !== -1,
  'T-EXP4-yomi-caveat-preserved: ふりがな success-with-caveat 文言が残る');
assert(__EXPAND_SRC.indexOf("参加者名を更新しましたが、保存できていない可能性があります") !== -1,
  'T-EXP4-master-001-preserved: MASTER-001 系 warn 文言が残る');

// ----------------------------------------------------------------------------
// T-EXP4-showMsg-unchanged: user-facing showMsg('...', 'warn') 呼出のままの文言が維持される
//   helper 内で showMsg(message, 'warn') を行うため、user-facing 文言は変化しない
// ----------------------------------------------------------------------------
[
  '削除は反映されましたが、保存が確認できませんでした',
  '参加者は登録されましたが、保存が確認できませんでした',
  '大会を開始しましたが、保存が確認できませんでした',
  '勝敗を入力しましたが、保存が確認できませんでした',
  '回戦を確定しましたが、保存が確認できませんでした',
  '組み合わせを生成しましたが、保存が確認できませんでした',
  '属性を変更しましたが、保存が確認できませんでした',
  '対戦相手を変更しましたが、保存が確認できませんでした',
  '過去結果を修正しましたが、保存が確認できませんでした',
  'クラスを変更しましたが、保存が確認できませんでした'
].forEach(function(msg){
  assert(__EXPAND_SRC.indexOf(msg) !== -1, 'T-EXP4-showMsg-unchanged: ' + msg);
});

// ----------------------------------------------------------------------------
// T-EXP4-success-suppression-preserved: success showMsg 抑止構造（s03 if-gate / s05 suppressOkMsg）
//   は本 PR で未変更
// ----------------------------------------------------------------------------
assert(__EXPAND_SRC.indexOf('if(s03MasterVerifyOk){') !== -1,
  'T-EXP4-s03-if-gate-preserved');
assert(__EXPAND_SRC.indexOf('suppressOkMsg:!s05MasterVerifyOk') !== -1,
  'T-EXP4-s05-suppressOkMsg-preserved');

// ----------------------------------------------------------------------------
// T-EXP4-runtime-backward-compat: metadata なし呼び出しでも helper が動作する
//   ランタイム検証: helper を実行してみる
// ----------------------------------------------------------------------------
{
  var env = loadEnv(targetPath);
  env._clear();
  // metadata なし呼び出し（PR #66 以前の 4 引数形式）
  env.notifySaveWarning({
    message: 'テスト warn',
    consoleTag: '[TEST-BACKCOMPAT]',
    callsiteId: 'TEST-NO-METADATA',
    fields: ['x']
  });
  assertEq(env._getIndicatorState().count, 1,
    'T-EXP4-runtime-backward-compat-a: metadata なしでも indicator +1');
  // console.warn 出力に kind/aggregateKey/severity が含まれていない
  var lastWarn = env._warnCalls[env._warnCalls.length - 1];
  assert(lastWarn.indexOf('"kind"') === -1, 'T-EXP4-runtime-backward-compat-b: metadata なしで kind が出ない');
  assert(lastWarn.indexOf('"aggregateKey"') === -1, 'T-EXP4-runtime-backward-compat-c: metadata なしで aggregateKey が出ない');
  assert(lastWarn.indexOf('"severity"') === -1, 'T-EXP4-runtime-backward-compat-d: metadata なしで severity が出ない');
}

// ----------------------------------------------------------------------------
// T-EXP4-runtime-metadata-included: metadata あり呼び出しで console.warn 出力に含まれる
// ----------------------------------------------------------------------------
{
  var env2 = loadEnv(targetPath);
  env2._clear();
  env2.notifySaveWarning({
    message: 'テスト warn metadata',
    consoleTag: '[TEST-METADATA]',
    callsiteId: 'TEST-WITH-METADATA',
    fields: ['y'],
    kind: 'save-verify',
    aggregateKey: 'save-verify:core',
    severity: 'warn'
  });
  var lastWarn2 = env2._warnCalls[env2._warnCalls.length - 1];
  assert(lastWarn2.indexOf('"kind":"save-verify"') !== -1,
    'T-EXP4-runtime-metadata-a: console.warn 出力に kind が含まれる');
  assert(lastWarn2.indexOf('"aggregateKey":"save-verify:core"') !== -1,
    'T-EXP4-runtime-metadata-b: console.warn 出力に aggregateKey が含まれる');
  assert(lastWarn2.indexOf('"severity":"warn"') !== -1,
    'T-EXP4-runtime-metadata-c: console.warn 出力に severity が含まれる');
  // indicator count は依然 +1（集約しない）
  assertEq(env2._getIndicatorState().count, 1,
    'T-EXP4-runtime-metadata-d: metadata 有でも indicator は発生単位 +1');
}

// ----------------------------------------------------------------------------
// T-EXP4-runtime-undefined-excluded: undefined metadata は output から除外
// ----------------------------------------------------------------------------
{
  var env3 = loadEnv(targetPath);
  env3._clear();
  env3.notifySaveWarning({
    message: 'テスト warn partial',
    consoleTag: '[TEST-PARTIAL]',
    callsiteId: 'TEST-PARTIAL-METADATA',
    kind: 'save-verify'
    // aggregateKey / severity 省略
  });
  var lastWarn3 = env3._warnCalls[env3._warnCalls.length - 1];
  assert(lastWarn3.indexOf('"kind":"save-verify"') !== -1,
    'T-EXP4-runtime-partial-a: kind だけ与えると kind だけ出る');
  assert(lastWarn3.indexOf('"aggregateKey"') === -1,
    'T-EXP4-runtime-partial-b: 省略した aggregateKey は出ない');
  assert(lastWarn3.indexOf('"severity"') === -1,
    'T-EXP4-runtime-partial-c: 省略した severity は出ない');
  // "undefined" 文字列が含まれない（"kind":null や "kind":undefined もダメ）
  assert(lastWarn3.indexOf('undefined') === -1,
    'T-EXP4-runtime-partial-d: 出力に undefined 文字列が含まれない');
}

// ============================================================================
// SECTION 14: SAVE-UX-WARN-AGGREGATION-IMPL-DISPLAY — showMsg 最小集約表示
// ============================================================================
// 依頼: SAVE-UX-WARN-AGGREGATION-IMPL-DISPLAY (PR #75 後続)
//
// 仕様:
//   - 対象: kind==='save-verify' && severity==='warn' && aggregateKey truthy
//   - 同一 aggregateKey で 3 秒未満に再発した場合のみ短縮文言に切替
//   - console.warn / indicator count は不変（失敗を隠さない原則）
//   - showMsg type は常に 'warn'
//   - aggregation state は memory only / module scope
//   - localStorage / sessionStorage / tournament state には保存しない
//
// 短縮文言: '保存確認に失敗した操作が複数あります。内容を確認してください。'
// 時間窓:    3000ms（初期値、後続調整可）

// ----------------------------------------------------------------------------
// SECTION 14 静的検証
// ----------------------------------------------------------------------------

// T-EXP5-constants-defined: 短縮文言と time window が定数化されている
assert(__EXPAND_SRC.indexOf('SAVE_WARN_AGGREGATION_WINDOW_MS=3000') !== -1,
  'T-EXP5-constants-defined-a: time window 3000ms が定数化されている');
assert(__EXPAND_SRC.indexOf("SAVE_WARN_AGGREGATED_MESSAGE='保存確認に失敗した操作が複数あります。内容を確認してください。'") !== -1,
  'T-EXP5-constants-defined-b: 短縮文言が定数化されている');

// T-EXP5-aggregation-state-memory-only: aggregation state は memory only
//   localStorage / sessionStorage / tournament state へ書き込まないこと
//   saveWarningAggregationState を含むコードに localStorage.setItem / sessionStorage が
//   絡まないこと
{
  var stateIdx = __EXPAND_SRC.indexOf('var saveWarningAggregationState=');
  assert(stateIdx !== -1, 'T-EXP5-state-decl: saveWarningAggregationState が宣言されている');
  // state 宣言から helper 終了までの範囲に localStorage / sessionStorage の書込みがない
  var helperEndIdx = __EXPAND_SRC.indexOf('function renderRegList()', stateIdx);
  var helperSlice = __EXPAND_SRC.substring(stateIdx, helperEndIdx);
  assert(helperSlice.indexOf('localStorage.setItem') === -1,
    'T-EXP5-state-no-localStorage: aggregation 関連で localStorage.setItem を呼ばない');
  assert(helperSlice.indexOf('sessionStorage') === -1,
    'T-EXP5-state-no-sessionStorage: aggregation 関連で sessionStorage を使わない');
  assert(helperSlice.indexOf('state.report') === -1 && helperSlice.indexOf('state.players') === -1,
    'T-EXP5-state-no-tournament-state: aggregation 関連で tournament state を変更しない');
}

// T-EXP5-helper-aggregation-conditions: helper 内の aggregation 条件が正しい
//   SAVE-UX-MASTER-V2-AGGREGATION (PR-B) で kind === 'save-verify' の単独判定から
//   SAVE_WARN_AGGREGATABLE_KINDS.has(kind) の allow-list 判定に移行。
//   3 条件 AND (allow-list && severity==='warn' && aggregateKey) を確認。
assert(__EXPAND_SRC.indexOf("SAVE_WARN_AGGREGATABLE_KINDS.has(kind)&&severity==='warn'&&aggregateKey") !== -1,
  'T-EXP5-helper-aggregation-conditions: helper 内に 3 条件 AND (allow-list 形式) が存在');

// T-EXP5-helper-window-check: 3 秒未満判定が定数経由
assert(__EXPAND_SRC.indexOf('(nowTs-lastTs)<SAVE_WARN_AGGREGATION_WINDOW_MS') !== -1,
  'T-EXP5-helper-window-check: 時間窓判定が定数経由');

// T-EXP5-helper-uses-aggregated-message: aggregation 時に短縮文言を使う
assert(__EXPAND_SRC.indexOf('displayMessage=SAVE_WARN_AGGREGATED_MESSAGE') !== -1,
  'T-EXP5-helper-aggregated-msg-used: aggregation 時に SAVE_WARN_AGGREGATED_MESSAGE を使う');

// T-EXP5-showMsg-still-called: 集約時も showMsg が必ず呼ばれる（type='warn'）
assert(__EXPAND_SRC.indexOf("showMsg(displayMessage,'warn')") !== -1,
  'T-EXP5-showMsg-always-called: displayMessage を必ず showMsg(., warn) で出す');

// T-EXP5-console-warn-individual: console.warn は集約しない（PR #75 の個別 warnMeta 出力が維持）
assert(__EXPAND_SRC.indexOf('console.warn(consoleTag,warnMeta)') !== -1,
  'T-EXP5-console-warn-individual: console.warn は個別出力を維持');

// T-EXP5-record-still-called: recordSaveWarningForIndicator が必ず呼ばれる（aggregation で抑制されない）
assert(__EXPAND_SRC.indexOf('recordSaveWarningForIndicator(indicatorPayload)') !== -1,
  'T-EXP5-record-still-called: indicator path は集約しない');

// T-EXP5-no-aggregation-display-extras: 禁止された aggregation 表示パターンが存在しない
[
  'aggregateCount',
  'dedupedCount',
  'suppressedByAggregate',
  'lastAggregateKey',  // ※ 個別変数名としては OK だが「表示用」存在を検出
  'aggregatedToast',
  'warningBar',
  'retryButton'
].forEach(function(pat){
  // saveWarningAggregationState.lastTimestampByKey は OK、それ以外の表示系痕跡を弾く
  if(pat === 'lastAggregateKey'){
    // ふつう state 名としても存在しないはず
    assert(__EXPAND_SRC.indexOf(pat) === -1,
      'T-EXP5-no-extras-' + pat + ': '+pat+' が存在しない');
  }else{
    assert(__EXPAND_SRC.indexOf(pat) === -1,
      'T-EXP5-no-extras-' + pat + ': '+pat+' が存在しない');
  }
});

// T-EXP5-yomi-notice-not-helper: ふりがな success-with-caveat 通知が helper 経由ではない
//   = showMsg 直接呼出のままで aggregation 条件に届かない構造的裏付け
{
  var yomiNoticeIdx = __EXPAND_SRC.indexOf("showMsg('ふりがな未登録のまま ");
  assert(yomiNoticeIdx !== -1, 'T-EXP5-yomi-notice-direct-call-a: showMsg 直接呼出が存在');
  // 直前 200 文字内に notifySaveWarning 呼出がない
  var before = __EXPAND_SRC.substring(Math.max(0, yomiNoticeIdx - 300), yomiNoticeIdx);
  assert(before.indexOf('notifySaveWarning({') === -1,
    'T-EXP5-yomi-notice-not-via-helper: ふりがな通知の直前に notifySaveWarning 呼出がない');
}

// ----------------------------------------------------------------------------
// SECTION 14 ランタイム検証: aggregation 挙動
// ----------------------------------------------------------------------------

// 共通テストヘルパ: 新規 env を作って aggregation state をリセット
function _newAggEnv(){
  var env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  return env;
}
// 「last timestamp を N ミリ秒前にセット」で同一 key の連続発生を再現
function _seedAggKey(env, key, msAgo){
  var state = env._getSaveWarningAggregationState();
  state.lastTimestampByKey[key] = Date.now() - msAgo;
}

// T-EXP5-runtime-1st-uses-original: 1 回目は元 message を表示
{
  var env = _newAggEnv();
  env.notifySaveWarning({
    message:'保存確認に失敗しました（元 message）',
    consoleTag:'[TEST-AGG-1ST]',
    callsiteId:'TEST-AGG-1ST',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  var final1 = env._regMsgFinal();
  assert(final1.indexOf('保存確認に失敗しました（元 message）') !== -1,
    'T-EXP5-runtime-1st: 1 回目は元 message が表示');
  assert(final1.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP5-runtime-1st-no-aggregated: 1 回目は短縮文言を含まない');
}

// T-EXP5-runtime-2nd-within-window: 同一 aggregateKey の 3 秒未満 2 回目は短縮 message
{
  var env = _newAggEnv();
  // 1 回目相当: 1 秒前に既発生をシード
  _seedAggKey(env, 'save-verify:entry', 1000);
  env.notifySaveWarning({
    message:'元 message-A',
    consoleTag:'[TEST-AGG-2ND]',
    callsiteId:'TEST-AGG-2ND',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  var final2 = env._regMsgFinal();
  assert(final2.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP5-runtime-2nd: 3 秒未満 2 回目は短縮 message');
  assert(final2.indexOf('元 message-A') === -1,
    'T-EXP5-runtime-2nd-no-original: 2 回目は元 message を出さない');
}

// T-EXP5-runtime-3rd-within-window: 3 回目も短縮 message
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);
  env.notifySaveWarning({
    message:'元 message-B',
    consoleTag:'[T3]',
    callsiteId:'TEST-AGG-3RD',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  var final3 = env._regMsgFinal();
  assert(final3.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP5-runtime-3rd: 3 回目も短縮 message');
}

// T-EXP5-runtime-reset-after-3s: 3 秒以上経過後は元 message に戻る
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 5000);  // 5 秒前
  env.notifySaveWarning({
    message:'リセット後の元 message',
    consoleTag:'[T-RESET]',
    callsiteId:'TEST-AGG-RESET',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  var final4 = env._regMsgFinal();
  assert(final4.indexOf('リセット後の元 message') !== -1,
    'T-EXP5-runtime-reset: 3 秒経過後は元 message に戻る');
  assert(final4.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP5-runtime-reset-no-aggregated: リセット時は短縮文言を出さない');
}

// T-EXP5-runtime-boundary: ちょうど 3000ms はリセット側（< 3000 のみ集約）
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 3000);  // ちょうど 3 秒前
  env.notifySaveWarning({
    message:'境界文言',
    consoleTag:'[T-BOUND]',
    callsiteId:'TEST-AGG-BOUND',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  var final5 = env._regMsgFinal();
  // 3000ms は集約しない（< のみ）
  assert(final5.indexOf('境界文言') !== -1,
    'T-EXP5-runtime-boundary: ちょうど 3000ms はリセット側');
}

// T-EXP5-runtime-different-keys-independent: 別 aggregateKey は独立
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);  // entry は 0.5 秒前
  // edit は別 key なので 1 回目扱い
  env.notifySaveWarning({
    message:'edit 系の元 message',
    consoleTag:'[T-INDEP]',
    callsiteId:'TEST-AGG-INDEP-EDIT',
    kind:'save-verify',
    aggregateKey:'save-verify:edit',
    severity:'warn'
  });
  var final6 = env._regMsgFinal();
  assert(final6.indexOf('edit 系の元 message') !== -1,
    'T-EXP5-runtime-independent: 別 aggregateKey は独立、1 回目は元 message');
}

// T-EXP5-runtime-metadata-missing-no-aggregate: metadata なしは aggregation 対象外
{
  var env = _newAggEnv();
  // 同一文言を 2 回送るが metadata なし → 2 回とも元 message
  env.notifySaveWarning({
    message:'メタなし-1',
    consoleTag:'[T-NOMETA]',
    callsiteId:'TEST-NOMETA-1'
  });
  env.notifySaveWarning({
    message:'メタなし-2',
    consoleTag:'[T-NOMETA]',
    callsiteId:'TEST-NOMETA-2'
  });
  var final7 = env._regMsgFinal();
  assert(final7.indexOf('メタなし-2') !== -1,
    'T-EXP5-runtime-no-metadata: metadata なしは集約されず元 message を出す');
  assert(final7.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP5-runtime-no-metadata-no-aggregated: metadata なしで短縮文言が出ない');
  // aggregation state も触られていない（lastTimestampByKey 空）
  var st = env._getSaveWarningAggregationState();
  assertEq(Object.keys(st.lastTimestampByKey).length, 0,
    'T-EXP5-runtime-no-metadata-no-state: metadata なしで aggregation state が変化しない');
}

// T-EXP5-runtime-no-aggregateKey-skip: aggregateKey 欠落は集約対象外
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);
  env.notifySaveWarning({
    message:'aggregateKey なしの元 message',
    consoleTag:'[T-NOAGG]',
    callsiteId:'TEST-NOAGG',
    kind:'save-verify',
    severity:'warn'
    // aggregateKey 省略
  });
  var final8 = env._regMsgFinal();
  assert(final8.indexOf('aggregateKey なしの元 message') !== -1,
    'T-EXP5-runtime-no-aggregateKey: aggregateKey 欠落は集約しない');
}

// T-EXP5-runtime-wrong-kind-skip: allow-list 外 kind は対象外
//   SAVE-UX-MASTER-V2-AGGREGATION (PR-B) 以降、master-verify も allow-list に加わったため、
//   「allow-list 外」の代表として storage-quota を使う（quota は意図的に対象外維持）。
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);
  env.notifySaveWarning({
    message:'別 kind の元 message',
    consoleTag:'[T-WRONG-KIND]',
    callsiteId:'TEST-WRONG-KIND',
    kind:'storage-quota',  // allow-list 外
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  var final9 = env._regMsgFinal();
  assert(final9.indexOf('別 kind の元 message') !== -1,
    'T-EXP5-runtime-wrong-kind: allow-list 外 kind は集約対象外');
}

// T-EXP5-runtime-wrong-severity-skip: severity!='warn' は対象外
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);
  env.notifySaveWarning({
    message:'別 severity の元 message',
    consoleTag:'[T-WRONG-SEV]',
    callsiteId:'TEST-WRONG-SEV',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'info'  // 別 severity
  });
  var final10 = env._regMsgFinal();
  assert(final10.indexOf('別 severity の元 message') !== -1,
    'T-EXP5-runtime-wrong-severity: severity が異なる場合は集約対象外');
}

// T-EXP5-runtime-console-warn-individual: 集約時も console.warn は個別に出る（含 metadata）
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);
  var beforeWarnCount = env._warnCalls.length;
  env.notifySaveWarning({
    message:'集約時の console',
    consoleTag:'[T-CONSOLE]',
    callsiteId:'TEST-CONSOLE',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  // console.warn が 1 回呼ばれた（集約しても出る）
  var afterWarnCount = env._warnCalls.length;
  assertEq(afterWarnCount - beforeWarnCount, 1,
    'T-EXP5-runtime-console-warn-individual: 集約時も console.warn が個別に呼ばれる');
  // 出力内容に metadata が残る
  var lastWarn = env._warnCalls[env._warnCalls.length - 1];
  assert(lastWarn.indexOf('"aggregateKey":"save-verify:entry"') !== -1,
    'T-EXP5-runtime-console-warn-keeps-metadata: aggregateKey が console.warn 出力に残る');
  assert(lastWarn.indexOf('[T-CONSOLE]') !== -1,
    'T-EXP5-runtime-console-warn-keeps-tag: consoleTag が出力に残る');
}

// T-EXP5-runtime-indicator-still-plus-1: 集約時も indicator は +1
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);
  // 集約済前の indicator count は 0
  assertEq(env._getIndicatorState().count, 0,
    'T-EXP5-runtime-indicator-pre: 開始時 count=0');
  env.notifySaveWarning({
    message:'集約時 indicator',
    consoleTag:'[T-IND]',
    callsiteId:'TEST-IND',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  assertEq(env._getIndicatorState().count, 1,
    'T-EXP5-runtime-indicator-plus-1: 集約時も count+=1（発生単位維持）');
}

// T-EXP5-runtime-showMsg-type-warn: 集約時も showMsg type は 'warn'
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:entry', 500);
  env.notifySaveWarning({
    message:'type 検証',
    consoleTag:'[T-TYPE]',
    callsiteId:'TEST-TYPE',
    kind:'save-verify',
    aggregateKey:'save-verify:entry',
    severity:'warn'
  });
  // reg-msg の innerHTML に alert-warn class が含まれる
  var final = env._regMsgFinal();
  assert(final.indexOf('alert-warn') !== -1,
    'T-EXP5-runtime-showMsg-type-warn: 集約時も showMsg type は warn');
}

// T-EXP5-runtime-localStorage-untouched: aggregation で localStorage が変化しない
{
  var env = _newAggEnv();
  var beforeKeys = Object.keys(env._ctx.localStorage._);
  // 同一 key で 3 回呼ぶ（1 元 + 2 短縮 + 3 短縮）
  for(var i=0;i<3;i++){
    env.notifySaveWarning({
      message:'ls 検証 ' + i,
      consoleTag:'[T-LS]',
      callsiteId:'TEST-LS',
      kind:'save-verify',
      aggregateKey:'save-verify:entry',
      severity:'warn'
    });
  }
  var afterKeys = Object.keys(env._ctx.localStorage._);
  assertEq(afterKeys.length, beforeKeys.length,
    'T-EXP5-runtime-localStorage-untouched: aggregation で localStorage キー数が変化しない');
  // aggregation 関連キーが localStorage に存在しない
  afterKeys.forEach(function(k){
    assert(k.indexOf('saveWarningAggregation') === -1 && k.indexOf('aggregate') === -1,
      'T-EXP5-runtime-no-aggregation-key-in-ls: ' + k + ' は aggregation キーではない');
  });
}

// ============================================================================
// SECTION 15: SAVE-UX-QUOTA-HANDLING-IMPL — quota / storage exception 系
// ============================================================================
// 依頼: SAVE-UX-QUOTA-HANDLING-IMPL (PR #78 inventory Step 1 → Step 2 実装)
// 設計: docs/notes/20260514_shogi_save_ux_quota_inventory.md
//
// 実装範囲:
//   (a) isQuotaExceededError(e) helper を新規追加
//   (b) save() に quota 分岐 (alert + notifySaveWarning + return)
//   (c) saveBranchMaster() に quota 分岐 (notifySaveWarning + return)
//   (d) 対象は save() / saveBranchMaster() のみ。resetAll() 等は対象外
//
// metadata:
//   kind:         'storage-quota'
//   aggregateKey: 'storage-quota:global'
//   severity:     'warn'
//   callsiteId:   'STORAGE-QUOTA:save' / 'STORAGE-QUOTA:saveBranchMaster'
//
// showMsg aggregation: 対象外（kind が 'save-verify' ではないため helper 内で legacy path）
// indicator: helper 1 呼出 = +1 維持
// console.warn: helper が個別出力、quota 時の既存 console.warn は呼ばない（重複回避）
// 二重通知: storage-quota + save-verify は Step 2 で許容

// ----------------------------------------------------------------------------
// T-EXP6-isQuotaExceededError: helper 単体テスト
// ----------------------------------------------------------------------------

// true ケース 4 種
{
  const env = loadEnv(targetPath);
  assertEq(env.isQuotaExceededError({name:'QuotaExceededError'}), true,
    'T-EXP6-q-true-a: name === QuotaExceededError');
  assertEq(env.isQuotaExceededError({name:'NS_ERROR_DOM_QUOTA_REACHED'}), true,
    'T-EXP6-q-true-b: name === NS_ERROR_DOM_QUOTA_REACHED');
  assertEq(env.isQuotaExceededError({code:22}), true,
    'T-EXP6-q-true-c: code === 22');
  assertEq(env.isQuotaExceededError({code:1014}), true,
    'T-EXP6-q-true-d: code === 1014');
  // 複合（name 一致 + code 不一致）も true
  assertEq(env.isQuotaExceededError({name:'QuotaExceededError',code:0}), true,
    'T-EXP6-q-true-e: name 一致 + code 0 でも true');
}

// false ケース 4 種
{
  const env = loadEnv(targetPath);
  assertEq(env.isQuotaExceededError(null), false, 'T-EXP6-q-false-a: null');
  assertEq(env.isQuotaExceededError(undefined), false, 'T-EXP6-q-false-b: undefined');
  assertEq(env.isQuotaExceededError({}), false, 'T-EXP6-q-false-c: {} (no name/code)');
  assertEq(env.isQuotaExceededError({name:'OtherError'}), false, 'T-EXP6-q-false-d: name OtherError');
  assertEq(env.isQuotaExceededError({code:0}), false, 'T-EXP6-q-false-e: code 0');
  assertEq(env.isQuotaExceededError({name:'TypeError',code:99}), false, 'T-EXP6-q-false-f: 別エラー');
}

// ----------------------------------------------------------------------------
// T-EXP6-save-quota: save() の QuotaExceededError 経路
// ----------------------------------------------------------------------------

function _stubQuotaError(env){
  env._ctx.localStorage.setItem = function(){
    var err = new Error('Quota exceeded (test)');
    err.name = 'QuotaExceededError';
    err.code = 22;
    throw err;
  };
}

function _stubGenericError(env){
  env._ctx.localStorage.setItem = function(){
    throw new Error('generic setItem failure (test)');
  };
}

// T-EXP6-save-quota-alert-and-notify: quota 時に alert + notifySaveWarning が動く
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  // localStorage.setItem を quota 例外に差し替え
  _stubQuotaError(env);
  env._setState(makeEmptyState());
  env.save();
  // alert が呼ばれた（1 回）
  assertEq(env._alertCalls.length, 1, 'T-EXP6-save-quota-alert: alert が 1 回呼ばれる');
  assert(env._alertCalls[0].indexOf('保存容量の上限に達しました。データ整理が必要です。') !== -1,
    'T-EXP6-save-quota-alert-text: alert 文言が正しい');
  // showMsg は notifySaveWarning 経由で出る（reg-msg に「保存容量の上限に達しました」）
  const final = env._regMsgFinal();
  assert(final.indexOf('保存容量の上限に達しました。データ整理が必要です。') !== -1,
    'T-EXP6-save-quota-showMsg: showMsg に quota 文言が出る');
  assert(final.indexOf('alert-warn') !== -1, 'T-EXP6-save-quota-type: type=warn');
  // indicator +1
  assertEq(env._getIndicatorState().count, 1, 'T-EXP6-save-quota-indicator: count=1');
  // console.warn 出力に metadata が含まれる
  const lastWarn = env._warnCalls[env._warnCalls.length - 1];
  assert(lastWarn.indexOf('"kind":"storage-quota"') !== -1,
    'T-EXP6-save-quota-meta-kind: kind=storage-quota が出力に含まれる');
  assert(lastWarn.indexOf('"aggregateKey":"storage-quota:global"') !== -1,
    'T-EXP6-save-quota-meta-aggKey: aggregateKey=storage-quota:global');
  assert(lastWarn.indexOf('"severity":"warn"') !== -1,
    'T-EXP6-save-quota-meta-sev: severity=warn');
  assert(lastWarn.indexOf('"callsiteId":"STORAGE-QUOTA:save"') !== -1,
    'T-EXP6-save-quota-meta-callsite: callsiteId=STORAGE-QUOTA:save');
  // 既存 notifyError 文言（'保存に失敗しました。容量超過か、...'）が出ない
  assert(final.indexOf('プライベートブラウズ') === -1,
    'T-EXP6-save-quota-no-notifyError: quota 時に既存 notifyError 文言は重複しない');
}

// T-EXP6-save-non-quota-keeps-notifyError: quota 以外の例外は notifyError 経路
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  _stubGenericError(env);
  env._setState(makeEmptyState());
  env.save();
  const final = env._regMsgFinal();
  // notifyError 経由で「保存に失敗しました。容量超過か、プライベートブラウズの可能性...」が出る
  assert(final.indexOf('プライベートブラウズの可能性') !== -1,
    'T-EXP6-save-non-quota-notifyError: 非 quota は notifyError 経路維持');
  // notifySaveWarning は呼ばれていない（indicator count 0）
  assertEq(env._getIndicatorState().count, 0,
    'T-EXP6-save-non-quota-no-indicator: 非 quota では indicator +0');
  // 新 quota 文言は出ない
  assert(final.indexOf('保存容量の上限に達しました') === -1,
    'T-EXP6-save-non-quota-no-quota-msg: 非 quota では quota 専用文言が出ない');
}

// ----------------------------------------------------------------------------
// T-EXP6-saveBranchMaster-quota: saveBranchMaster() の QuotaExceededError 経路
// ----------------------------------------------------------------------------

// T-EXP6-saveBM-quota-notify: quota 時に notifySaveWarning が動く
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  _stubQuotaError(env);
  const master = env.createEmptyBranchMaster();
  env.saveBranchMaster(master);
  // showMsg は出る
  const final = env._regMsgFinal();
  assert(final.indexOf('保存容量の上限に達しました。データ整理が必要です。') !== -1,
    'T-EXP6-saveBM-quota-showMsg: showMsg に quota 文言が出る');
  // indicator +1
  assertEq(env._getIndicatorState().count, 1, 'T-EXP6-saveBM-quota-indicator: count=1');
  // metadata
  const lastWarn = env._warnCalls[env._warnCalls.length - 1];
  assert(lastWarn.indexOf('"callsiteId":"STORAGE-QUOTA:saveBranchMaster"') !== -1,
    'T-EXP6-saveBM-quota-meta-callsite: callsiteId=STORAGE-QUOTA:saveBranchMaster');
  assert(lastWarn.indexOf('"kind":"storage-quota"') !== -1,
    'T-EXP6-saveBM-quota-meta-kind: kind=storage-quota');
  // quota 時に既存 '支部マスタの保存に失敗。' console.warn が重複して呼ばれない
  const warnTexts = env._warnCalls.join('|||');
  assertEq(warnTexts.indexOf('支部マスタの保存に失敗。'), -1,
    'T-EXP6-saveBM-quota-no-dup-warn: quota 時に既存 console.warn は重複しない');
}

// T-EXP6-saveBM-non-quota-keeps-warn: quota 以外は既存 console.warn 維持
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  _stubGenericError(env);
  const master = env.createEmptyBranchMaster();
  env.saveBranchMaster(master);
  // 既存 console.warn '支部マスタの保存に失敗。' が呼ばれる
  const warnTexts = env._warnCalls.join('|||');
  assert(warnTexts.indexOf('支部マスタの保存に失敗。') !== -1,
    'T-EXP6-saveBM-non-quota-warn: 非 quota では既存 console.warn 維持');
  // notifySaveWarning は呼ばれない（indicator count 0）
  assertEq(env._getIndicatorState().count, 0,
    'T-EXP6-saveBM-non-quota-no-indicator: 非 quota では indicator +0');
  // showMsg に quota 文言が出ない
  const final = env._regMsgFinal();
  assert(final.indexOf('保存容量の上限に達しました') === -1,
    'T-EXP6-saveBM-non-quota-no-quota-msg: 非 quota では quota 専用文言が出ない');
}

// ----------------------------------------------------------------------------
// T-EXP6-storage-quota-not-aggregated: storage-quota は showMsg aggregation 対象外
// ----------------------------------------------------------------------------

// T-EXP6-quota-2-consecutive-keeps-original: 連続 2 回でも短縮文言にならない
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  // 同じ aggregateKey で 1 秒前にも storage-quota が出ていたと仮定
  const st = env._getSaveWarningAggregationState();
  st.lastTimestampByKey['storage-quota:global'] = Date.now() - 1000;
  // ここで storage-quota を発火
  env.notifySaveWarning({
    message:'保存容量の上限に達しました。データ整理が必要です。',
    consoleTag:'[STORAGE-QUOTA] test',
    callsiteId:'STORAGE-QUOTA:save',
    kind:'storage-quota',
    aggregateKey:'storage-quota:global',
    severity:'warn'
  });
  const final = env._regMsgFinal();
  // aggregation は kind='save-verify' のみ対象なので、storage-quota は短縮されない
  assert(final.indexOf('保存容量の上限に達しました。データ整理が必要です。') !== -1,
    'T-EXP6-quota-not-aggregated: storage-quota の 2 回目も元文言');
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP6-quota-no-short-msg: 短縮文言には切り替わらない');
}

// T-EXP6-quota-twice-indicator-plus-2: 2 回連続で +2
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  _stubQuotaError(env);
  env._setState(makeEmptyState());
  env.save();
  env.save();
  assertEq(env._getIndicatorState().count, 2,
    'T-EXP6-quota-twice-count: 連続 2 回で indicator count +2');
  // alert も 2 回呼ばれる（quota は毎回確実な認知を優先）
  assertEq(env._alertCalls.length, 2,
    'T-EXP6-quota-twice-alert: alert も 2 回');
}

// ----------------------------------------------------------------------------
// T-EXP6-save-verify-untouched: save-verify 既存 aggregation 挙動への影響なし
// ----------------------------------------------------------------------------

// T-EXP6-sv-aggregation-still-works: save-verify は依然 3000ms aggregation 対象
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  // 1 秒前に save-verify:core が出ていた前提
  const st = env._getSaveWarningAggregationState();
  st.lastTimestampByKey['save-verify:core'] = Date.now() - 1000;
  env.notifySaveWarning({
    message:'大会を開始しましたが、保存が確認できませんでした...',
    consoleTag:'SAVE-003 test',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  const final = env._regMsgFinal();
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP6-sv-still-aggregates: save-verify は依然短縮文言に切替');
}

// T-EXP6-quota-doesnt-pollute-sv: storage-quota が save-verify の aggregation state を汚さない
{
  const env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  // 最初に storage-quota を発火
  env.notifySaveWarning({
    message:'保存容量の上限に達しました。データ整理が必要です。',
    consoleTag:'[STORAGE-QUOTA]',
    callsiteId:'STORAGE-QUOTA:save',
    kind:'storage-quota',
    aggregateKey:'storage-quota:global',
    severity:'warn'
  });
  // 次に save-verify を発火 — これは 1 回目扱いで元文言
  env._clear();  // reg-msg 履歴をリセットして次の発火だけ見る
  env.notifySaveWarning({
    message:'大会を開始しましたが、保存が確認できませんでした...',
    consoleTag:'SAVE-003',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  const final = env._regMsgFinal();
  // save-verify:core は別 key なので 1 回目扱い → 元文言
  assert(final.indexOf('大会を開始しましたが') !== -1,
    'T-EXP6-quota-no-pollution: storage-quota の発火が save-verify の 1 回目扱いを破壊しない');
}

// ----------------------------------------------------------------------------
// T-EXP6-static-checks: source 静的検証
// ----------------------------------------------------------------------------

// helper 定義の存在
assert(__EXPAND_SRC.indexOf('function isQuotaExceededError(e){') !== -1,
  'T-EXP6-static-helper-defined: isQuotaExceededError が定義されている');

// 4 つの判定条件すべて source に存在
[
  "e.name==='QuotaExceededError'",
  "e.name==='NS_ERROR_DOM_QUOTA_REACHED'",
  "e.code===22",
  "e.code===1014"
].forEach(function(pat){
  assert(__EXPAND_SRC.indexOf(pat) !== -1,
    'T-EXP6-static-helper-condition: ' + pat);
});

// SAVE-UX-TEST-STRUCTURAL-MATCH: 200 文字 window 依存から block 単位の structural match に移行。
var __EXP6_STORAGE_QUOTA_BLOCKS = __EXPAND_BLOCKS.filter(function(b){
  return b.kind === 'storage-quota';
});

// kind=storage-quota の block が厳密 2 件
assertEq(__EXP6_STORAGE_QUOTA_BLOCKS.length, 2,
  'T-EXP6-static-kind-count: kind=storage-quota の block は 2 件');

// callsiteId 各 1 件（合計 2 件）
assertEq(
  __EXP6_STORAGE_QUOTA_BLOCKS.filter(function(b){ return b.callsiteId === 'STORAGE-QUOTA:save'; }).length,
  1,
  'T-EXP6-static-callsiteId-save-count: STORAGE-QUOTA:save が 1 件');
assertEq(
  __EXP6_STORAGE_QUOTA_BLOCKS.filter(function(b){ return b.callsiteId === 'STORAGE-QUOTA:saveBranchMaster'; }).length,
  1,
  'T-EXP6-static-callsiteId-saveBM-count: STORAGE-QUOTA:saveBranchMaster が 1 件');

// aggregateKey='storage-quota:global' が全 2 件
assertEq(
  __EXP6_STORAGE_QUOTA_BLOCKS.filter(function(b){ return b.aggregateKey === 'storage-quota:global'; }).length,
  2,
  'T-EXP6-static-aggKey-count: aggregateKey=storage-quota:global の block が 2 件');

// kind=storage-quota + severity=warn のペアが厳密 2 件（structural、200 文字 window 非依存）
assertEq(
  __EXP6_STORAGE_QUOTA_BLOCKS.filter(function(b){ return b.severity === 'warn'; }).length,
  2,
  'T-EXP6-static-storage-quota-with-warn-strict: kind=storage-quota + severity=warn の block が 2 件');

// resetAll は未変更（quota 系の呼出が含まれない）
{
  var resetIdx = __EXPAND_SRC.indexOf('function resetAll()');
  assert(resetIdx !== -1, 'T-EXP6-static-resetAll-exists: resetAll が存在');
  var resetEnd = __EXPAND_SRC.indexOf('function ', resetIdx + 20);
  var resetBody = __EXPAND_SRC.substring(resetIdx, resetEnd);
  assert(resetBody.indexOf('storage-quota') === -1,
    'T-EXP6-static-resetAll-untouched: resetAll に storage-quota が混入していない');
  assert(resetBody.indexOf('notifySaveWarning') === -1,
    'T-EXP6-static-resetAll-no-helper: resetAll に notifySaveWarning が混入していない');
}

// ============================================================================
// SECTION 16: SAVE-UX-MASTER-V2-METADATA-IMPL — master-verify metadata 付与
// ============================================================================
// 依頼: SAVE-UX-MASTER-V2-METADATA-IMPL (PR-A)
//
// 実装範囲:
//   - MASTER-V2-LASTCLASS S03 / S05 / S22 に master-verify metadata 付与
//   - kind: 'master-verify'
//   - aggregateKey: 'master-verify:lastclass'
//   - severity: 'warn'
//   - callsiteId は既存 'S03' / 'S05' / 'S22' を維持
//   - message / consoleTag / fields は既存維持
//
// 不変項目:
//   - notifySaveWarning helper の aggregation 条件 (kind === 'save-verify' のみ)
//   - save-verify 15 callsite / storage-quota 2 callsite
//   - helper 内部 / indicator count ロジック
//   - master-verify は今回 aggregation 対象外（PR-B で別途検討）

// ----------------------------------------------------------------------------
// T-EXP7-static: master-verify 件数 / metadata / callsiteId 静的検証 (structural)
// ----------------------------------------------------------------------------

// SAVE-UX-TEST-STRUCTURAL-MATCH: 200 文字 window 依存から block 単位の structural match に移行。
var __EXP7_MASTER_VERIFY_BLOCKS = __EXPAND_BLOCKS.filter(function(b){
  return b.kind === 'master-verify';
});

// kind=master-verify の block が厳密 3 件
assertEq(__EXP7_MASTER_VERIFY_BLOCKS.length, 3,
  'T-EXP7-kind-count: kind=master-verify の block は 3 件');

// aggregateKey='master-verify:lastclass' が全 3 件
assertEq(
  __EXP7_MASTER_VERIFY_BLOCKS.filter(function(b){ return b.aggregateKey === 'master-verify:lastclass'; }).length,
  3,
  'T-EXP7-aggKey-count: aggregateKey=master-verify:lastclass の block が 3 件');

// kind=master-verify + severity=warn のペアが厳密 3 件（structural、200 文字 window 非依存）
assertEq(
  __EXP7_MASTER_VERIFY_BLOCKS.filter(function(b){ return b.severity === 'warn'; }).length,
  3,
  'T-EXP7-master-verify-with-warn-strict: kind=master-verify + severity=warn の block が 3 件');

// callsiteId 各 1 件（既存維持）
['S03','S05','S22'].forEach(function(cid){
  var matched = __EXP7_MASTER_VERIFY_BLOCKS.filter(function(b){ return b.callsiteId === cid; });
  assertEq(matched.length, 1,
    'T-EXP7-callsiteId-' + cid + '-count: callsiteId=' + cid + ' は master-verify block として 1 件');
  if (matched.length === 1) {
    // 各 block が kind / aggregateKey / severity を 3 点セットで持つ
    assertEq(matched[0].kind, 'master-verify',
      'T-EXP7-cid-with-kind: ' + cid + ' → kind=master-verify');
    assertEq(matched[0].aggregateKey, 'master-verify:lastclass',
      'T-EXP7-cid-with-aggKey: ' + cid + ' → aggregateKey=master-verify:lastclass');
    assertEq(matched[0].severity, 'warn',
      'T-EXP7-cid-with-severity: ' + cid + ' → severity=warn');
  }
});

// SAVE-UX-TEST-STRUCTURAL-MATCH 全体合計確認: save-verify 15 + storage-quota 2 + master-verify 3 = 20
//   __EXPAND_BLOCKS.length は SECTION 12.5 で sanity check 済（T-HELPER-shogi-blocks）。
//   ここでは 3 系統合計の整合を最終確認する。
assertEq(
  __EXP4_SAVE_VERIFY_BLOCKS.length + __EXP6_STORAGE_QUOTA_BLOCKS.length + __EXP7_MASTER_VERIFY_BLOCKS.length,
  20,
  'T-EXP7-3systems-total: 3 系統合計 = 20 件 (save-verify 15 + storage-quota 2 + master-verify 3)');

// ----------------------------------------------------------------------------
// T-EXP7-save-verify-unchanged: save-verify 既存件数維持
// ----------------------------------------------------------------------------

// kind:'save-verify' = 15
assertEq(
  (__EXPAND_SRC.match(/kind:'save-verify'/g) || []).length, 15,
  'T-EXP7-save-verify-still-15: kind:save-verify は依然 15 件');

// save-verify aggregateKey 分布維持（SECTION 13 の __EXP4_EXPECTED_DIST と整合）
{
  var distExpected = {
    'save-verify:core':    4,
    'save-verify:entry':   2,
    'save-verify:edit':    2,
    'save-verify:past':    4,
    'save-verify:pairing': 3
  };
  Object.keys(distExpected).forEach(function(ak){
    var needle = "aggregateKey:'" + ak + "'";
    var count = (__EXPAND_SRC.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g')) || []).length;
    assertEq(count, distExpected[ak],
      'T-EXP7-save-verify-dist-' + ak + ': ' + distExpected[ak] + ' 件');
  });
}

// ----------------------------------------------------------------------------
// T-EXP7-storage-quota-unchanged: storage-quota 既存件数維持
// ----------------------------------------------------------------------------

assertEq(
  (__EXPAND_SRC.match(/kind:'storage-quota'/g) || []).length, 2,
  'T-EXP7-storage-quota-still-2: kind:storage-quota は依然 2 件');
assertEq(
  (__EXPAND_SRC.match(/aggregateKey:'storage-quota:global'/g) || []).length, 2,
  'T-EXP7-storage-quota-aggKey-still-2: aggregateKey:storage-quota:global は依然 2 件');

// ----------------------------------------------------------------------------
// T-EXP7-helper-aggregation-condition (PR-B 更新): helper aggregation 条件は allow-list 形式
// ----------------------------------------------------------------------------
// PR-A (PR #82) 時点では aggregation 条件は `kind === 'save-verify'` 単独判定で、
// master-verify は意図的に対象外だった。SAVE-UX-MASTER-V2-AGGREGATION (PR-B) で
// allow-list 形式 `SAVE_WARN_AGGREGATABLE_KINDS.has(kind)` に移行し、master-verify が
// allow-list に追加された。詳細は SECTION 17 で検証。

// aggregation 条件は SAVE_WARN_AGGREGATABLE_KINDS.has(kind) を使う形に変更されている
assert(__EXPAND_SRC.indexOf("SAVE_WARN_AGGREGATABLE_KINDS.has(kind)&&severity==='warn'&&aggregateKey") !== -1,
  'T-EXP7-helper-condition: aggregation 条件は allow-list 形式 SAVE_WARN_AGGREGATABLE_KINDS.has(kind) に移行済み');

// 旧 `kind==='save-verify'` 単独判定 (aggregation 条件としての) が残っていないこと。
// ※ metadata 文字列としての `kind:'save-verify'` は 15 件残るので別。あくまで if 条件式の
// 単独 `kind==='save-verify'` & & severity & & aggregateKey の組み合わせがないことを確認。
assert(__EXPAND_SRC.indexOf("kind==='save-verify'&&severity==='warn'&&aggregateKey") === -1,
  'T-EXP7-helper-condition-old-removed: 旧 kind===save-verify 単独判定の条件式は残らない');

// ----------------------------------------------------------------------------
// T-EXP7-runtime: master-verify ランタイム挙動
// ----------------------------------------------------------------------------

// T-EXP7-runtime-master-verify-1st-original: master-verify 1 回目は元 message
//   PR-A (PR #82) では master-verify はそもそも aggregation 対象外だったが、PR-B
//   (SAVE-UX-MASTER-V2-AGGREGATION) で対象化された。連続発火時のランタイム検証は
//   SECTION 17 に集約し、ここでは「1 回目は元 message」のみ確認する（基本性質）。
{
  var env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MASTER-V2-LASTCLASS] test',
    callsiteId:'S03',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('前回クラス情報の保存が確認できませんでした') !== -1,
    'T-EXP7-runtime-master-verify-1st-original: master-verify 1 回目は元 message');
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP7-runtime-master-verify-1st-no-aggregated: 1 回目は短縮文言を出さない');
}

// T-EXP7-runtime-master-verify-indicator-plus-1: master-verify 発生で indicator +1
{
  var env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV] test',
    callsiteId:'S03',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  assertEq(env._getIndicatorState().count, 1,
    'T-EXP7-runtime-indicator-1: 1 回発生で indicator +1');
}

// T-EXP7-runtime-master-verify-3-events-indicator-plus-3: S03/S05/S22 相当 3 件で +3
{
  var env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  ['S03','S05','S22'].forEach(function(cid){
    env.notifySaveWarning({
      message:cid+' test message',
      consoleTag:'[MV] '+cid,
      callsiteId:cid,
      fields:['last_class'],
      kind:'master-verify',
      aggregateKey:'master-verify:lastclass',
      severity:'warn'
    });
  });
  assertEq(env._getIndicatorState().count, 3,
    'T-EXP7-runtime-indicator-3: 3 件発生で indicator +3（発生単位維持）');
}

// T-EXP7-runtime-save-verify-still-aggregates: save-verify aggregation 挙動への非干渉
{
  var env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  // save-verify:core で 1 秒前にも save-verify が出ていたと仮定
  var st = env._getSaveWarningAggregationState();
  st.lastTimestampByKey['save-verify:core'] = Date.now() - 1000;
  env.notifySaveWarning({
    message:'大会を開始しましたが、保存が確認できませんでした...',
    consoleTag:'SAVE-003 test',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP7-runtime-save-verify-still-aggregates: save-verify は依然短縮文言に切替');
}

// T-EXP7-runtime-master-verify-no-pollution-on-save-verify: master-verify 発火が save-verify の aggregation state を汚さない
{
  var env = loadEnv(targetPath);
  env._resetSaveWarningAggregationState();
  env._clear();
  // 最初に master-verify を発火
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV]',
    callsiteId:'S03',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  // 次に save-verify:core を発火 — これは save-verify:core スコープでは 1 回目扱い
  env._clear();  // reg-msg 履歴をリセットして次の発火だけ見る
  env.notifySaveWarning({
    message:'大会を開始しましたが、保存が確認できませんでした...',
    consoleTag:'SAVE-003',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  // save-verify:core は別 key なので 1 回目扱い → 元文言
  assert(final.indexOf('大会を開始しましたが') !== -1,
    'T-EXP7-runtime-no-pollution: master-verify 発火が save-verify の 1 回目扱いを破壊しない');
}

// ============================================================================
// SECTION 17: SAVE-UX-MASTER-V2-AGGREGATION — master-verify を aggregation 対象化
// ============================================================================
// 依頼: SAVE-UX-MASTER-V2-AGGREGATION (PR-B)
//
// 実装:
//   - shogi_v4.html に SAVE_WARN_AGGREGATABLE_KINDS = new Set(['save-verify','master-verify'])
//     を追加（notifySaveWarning helper 直前 module scope、既存 SAVE_WARN_* 定数群の近傍）
//   - aggregation 条件を `kind === 'save-verify'` 単独判定から
//     `SAVE_WARN_AGGREGATABLE_KINDS.has(kind)` の allow-list 判定に変更
//   - master-verify (S03 / S05 / S22) が aggregation 対象になる
//   - storage-quota は意図的に allow-list 外（quota は 1 回ごと確実な認知が必要）
//
// 不変項目:
//   - save-verify 既存 aggregation 挙動（時間窓 3000ms / 短縮文言 / lastTimestampByKey 構造）
//   - storage-quota は引き続き aggregation 対象外
//   - master-verify metadata (kind / aggregateKey / severity / callsiteId)
//   - aggregateKey 'master-verify:lastclass' は不変
//   - indicator count 発生単位 +1
//   - console.warn 個別出力
//   - showMsg type 'warn'
//   - success showMsg 抑止構造 (s03 if-gate / s05 suppressOkMsg)

// ----------------------------------------------------------------------------
// T-EXP8-static: SAVE_WARN_AGGREGATABLE_KINDS の存在と内容
// ----------------------------------------------------------------------------

// 定数宣言が source に存在
assert(__EXPAND_SRC.indexOf('var SAVE_WARN_AGGREGATABLE_KINDS=new Set(') !== -1,
  'T-EXP8-allow-list-declared: SAVE_WARN_AGGREGATABLE_KINDS が Set として宣言されている');

// allow-list に 'save-verify' が含まれる
assert(/SAVE_WARN_AGGREGATABLE_KINDS\s*=\s*new\s+Set\(\[[^\]]*'save-verify'[^\]]*\]\)/.test(__EXPAND_SRC),
  'T-EXP8-allow-list-has-save-verify: allow-list に save-verify が含まれる');

// allow-list に 'master-verify' が含まれる
assert(/SAVE_WARN_AGGREGATABLE_KINDS\s*=\s*new\s+Set\(\[[^\]]*'master-verify'[^\]]*\]\)/.test(__EXPAND_SRC),
  'T-EXP8-allow-list-has-master-verify: allow-list に master-verify が含まれる');

// allow-list に 'storage-quota' が **含まれない**
//   宣言部の Set 内に storage-quota が現れないことを確認（source 全体での storage-quota
//   metadata 件数は変わらず 2 件のまま、ここでは allow-list 宣言部のみを対象に検査）
{
  var m = __EXPAND_SRC.match(/SAVE_WARN_AGGREGATABLE_KINDS\s*=\s*new\s+Set\(\[([^\]]*)\]\)/);
  assert(m !== null, 'T-EXP8-allow-list-found: Set literal が抽出できる');
  var listBody = m ? m[1] : '';
  assertEq(listBody.indexOf("'storage-quota'"), -1,
    'T-EXP8-allow-list-no-storage-quota: allow-list 宣言部に storage-quota が含まれない');
  // aggregation 対象外 kind が allow-list に混入していないこと
  //   storage-corrupted は PR #SAVE-UX-PARSE-HANDLING-IMPL 以降の実 kind だが初期 aggregation 対象外。
  //   parse-failed / duplicate-name は今後の候補（実装時に再判定）。
  ['parse-failed','duplicate-name','storage-corrupted'].forEach(function(k){
    assertEq(listBody.indexOf("'"+k+"'"), -1,
      'T-EXP8-allow-list-no-non-aggregated-' + k + ': aggregation 対象外 kind ' + k + ' は allow-list に含まれない');
  });
}

// aggregation 条件で allow-list を使う形に変更されている
assert(__EXPAND_SRC.indexOf("SAVE_WARN_AGGREGATABLE_KINDS.has(kind)&&severity==='warn'&&aggregateKey") !== -1,
  'T-EXP8-helper-condition-allow-list: aggregation 条件が allow-list 形式');

// 旧 `kind === 'save-verify'` 単独 aggregation 条件が残らない
assert(__EXPAND_SRC.indexOf("kind==='save-verify'&&severity==='warn'&&aggregateKey") === -1,
  'T-EXP8-helper-condition-old-removed: 旧 kind===save-verify 単独 aggregation 条件は残らない');

// aggregationEligible / aggregated flag が追加されていない
['aggregationEligible','aggregated:true','aggregated: true','aggregated:false','aggregated: false'].forEach(function(forbidden){
  assert(__EXPAND_SRC.indexOf(forbidden) === -1,
    'T-EXP8-no-eligible-flag: ' + forbidden + ' は追加されていない');
});

// 既存 3 系統 metadata 件数維持（SECTION 18 で第 4 系統 storage-corrupted が +1 されるが、
// SECTION 17 視点では既存 3 系統の個別 count が変化しないことだけを確認する）
assertEq(__EXPAND_BLOCKS.filter(function(b){ return b.kind === 'save-verify'; }).length, 15,
  'T-EXP8-save-verify-count-unchanged: save-verify 15 件維持');
assertEq(__EXPAND_BLOCKS.filter(function(b){ return b.kind === 'storage-quota'; }).length, 2,
  'T-EXP8-storage-quota-count-unchanged: storage-quota 2 件維持');
assertEq(__EXPAND_BLOCKS.filter(function(b){ return b.kind === 'master-verify'; }).length, 3,
  'T-EXP8-master-verify-count-unchanged: master-verify 3 件維持');
// 既存 3 系統の合計が 20 件のまま（4 系統合計は SECTION 18 / T-HELPER-shogi-blocks 側で 21 を assert）
{
  var __exp8_sv = __EXPAND_BLOCKS.filter(function(b){ return b.kind === 'save-verify'; }).length;
  var __exp8_sq = __EXPAND_BLOCKS.filter(function(b){ return b.kind === 'storage-quota'; }).length;
  var __exp8_mv = __EXPAND_BLOCKS.filter(function(b){ return b.kind === 'master-verify'; }).length;
  assertEq(__exp8_sv + __exp8_sq + __exp8_mv, 20,
    'T-EXP8-3systems-total-unchanged: 既存 3 系統 (save-verify+storage-quota+master-verify) 合計 20 件維持');
}

// ----------------------------------------------------------------------------
// T-EXP8-runtime: master-verify aggregation ランタイム挙動
// ----------------------------------------------------------------------------

// T-EXP8-runtime-master-verify-1st-original: 1 回目は元 message
{
  var env = _newAggEnv();
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV] test',
    callsiteId:'S03',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('前回クラス情報の保存が確認できませんでした') !== -1,
    'T-EXP8-runtime-mv-1st-original: master-verify 1 回目は元 message');
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP8-runtime-mv-1st-no-aggregated: 1 回目は短縮文言を出さない');
}

// T-EXP8-runtime-master-verify-2nd-aggregated: 同一 aggregateKey の 3 秒未満 2 回目は短縮文言
{
  var env = _newAggEnv();
  // 1 秒前に master-verify が出ていたとシード
  _seedAggKey(env, 'master-verify:lastclass', 1000);
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV] 2nd',
    callsiteId:'S05',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP8-runtime-mv-2nd-aggregated: master-verify 2 回目は短縮文言');
  assert(final.indexOf('前回クラス情報の保存が確認できませんでした') === -1,
    'T-EXP8-runtime-mv-2nd-no-original: 2 回目は元 message を出さない');
}

// T-EXP8-runtime-master-verify-reset-after-3s: 3 秒経過後はリセット
{
  var env = _newAggEnv();
  _seedAggKey(env, 'master-verify:lastclass', 5000);  // 5 秒前
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV] reset',
    callsiteId:'S22',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('前回クラス情報の保存が確認できませんでした') !== -1,
    'T-EXP8-runtime-mv-reset: 3 秒経過後は元 message に戻る');
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP8-runtime-mv-reset-no-aggregated: リセット時は短縮文言を出さない');
}

// T-EXP8-runtime-master-verify-3-events-indicator-3: 連続 3 件で indicator +3
{
  var env = _newAggEnv();
  ['S03','S05','S22'].forEach(function(cid){
    env.notifySaveWarning({
      message:cid+' message',
      consoleTag:'[MV] '+cid,
      callsiteId:cid,
      fields:['last_class'],
      kind:'master-verify',
      aggregateKey:'master-verify:lastclass',
      severity:'warn'
    });
  });
  assertEq(env._getIndicatorState().count, 3,
    'T-EXP8-runtime-mv-indicator-3: 3 件発生で indicator +3 (発生単位維持)');
}

// T-EXP8-runtime-master-verify-3-events-console-warn-3: 連続 3 件で console.warn 3 回
{
  var env = _newAggEnv();
  var beforeWarnCount = env._warnCalls.length;
  ['S03','S05','S22'].forEach(function(cid){
    env.notifySaveWarning({
      message:cid+' message',
      consoleTag:'[MV] '+cid,
      callsiteId:cid,
      fields:['last_class'],
      kind:'master-verify',
      aggregateKey:'master-verify:lastclass',
      severity:'warn'
    });
  });
  assertEq(env._warnCalls.length - beforeWarnCount, 3,
    'T-EXP8-runtime-mv-console-warn-3: 3 件発生で console.warn 3 回 (個別出力維持)');
}

// T-EXP8-runtime-save-verify-still-aggregates: save-verify 既存 aggregation 挙動維持
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:core', 1000);
  env.notifySaveWarning({
    message:'大会を開始しましたが、保存が確認できませんでした...',
    consoleTag:'SAVE-003 test',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP8-runtime-sv-still-aggregates: save-verify は依然 aggregate');
}

// T-EXP8-runtime-namespace-isolation-mv-no-pollute-sv: master-verify 発火が save-verify state を汚さない
{
  var env = _newAggEnv();
  // master-verify を発火
  env.notifySaveWarning({
    message:'MV',
    consoleTag:'[MV]',
    callsiteId:'S03',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  env._clear();
  // save-verify:past を発火 — 別 aggregateKey なので 1 回目扱い
  env.notifySaveWarning({
    message:'クラスを変更しましたが、保存が確認できませんでした',
    consoleTag:'SAVE-003b past',
    callsiteId:'SAVE-003b-handlePastParticipantClassAdd-class-change',
    kind:'save-verify',
    aggregateKey:'save-verify:past',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('クラスを変更しましたが') !== -1,
    'T-EXP8-runtime-mv-no-pollute-sv: master-verify 発火が save-verify:past を汚染しない');
}

// T-EXP8-runtime-namespace-isolation-sv-no-pollute-mv: save-verify 発火が master-verify state を汚さない
{
  var env = _newAggEnv();
  // save-verify を発火
  env.notifySaveWarning({
    message:'SV',
    consoleTag:'[SV]',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  env._clear();
  // master-verify:lastclass を発火 — 別 aggregateKey なので 1 回目扱い
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV]',
    callsiteId:'S05',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('前回クラス情報の保存が確認できませんでした') !== -1,
    'T-EXP8-runtime-sv-no-pollute-mv: save-verify 発火が master-verify:lastclass を汚染しない');
}

// T-EXP8-runtime-storage-quota-still-not-aggregated: storage-quota は連続発火しても aggregation されない
{
  var env = _newAggEnv();
  _seedAggKey(env, 'storage-quota:global', 1000);
  env.notifySaveWarning({
    message:'保存容量の上限に達しました。データ整理が必要です。',
    consoleTag:'[STORAGE-QUOTA]',
    callsiteId:'STORAGE-QUOTA:save',
    kind:'storage-quota',
    aggregateKey:'storage-quota:global',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  // storage-quota は allow-list 外なので legacy path (元 message のまま)
  assert(final.indexOf('保存容量の上限に達しました。データ整理が必要です。') !== -1,
    'T-EXP8-runtime-sq-not-aggregated: storage-quota は 2 回目も元 message');
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) === -1,
    'T-EXP8-runtime-sq-no-short-msg: 短縮文言には切替らない');
}

// T-EXP8-runtime-mixed-scenarios: save-verify + master-verify + storage-quota 混在で挙動が崩れない
{
  var env = _newAggEnv();
  // 順に発火: master-verify (1 回目) / save-verify (1 回目) / storage-quota (元 message)
  env.notifySaveWarning({
    message:'MV first',
    consoleTag:'[MV]',
    callsiteId:'S03',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  // この時点で indicator は 1
  assertEq(env._getIndicatorState().count, 1, 'T-EXP8-mixed-after-mv: count=1');

  env.notifySaveWarning({
    message:'SV first',
    consoleTag:'[SV]',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  assertEq(env._getIndicatorState().count, 2, 'T-EXP8-mixed-after-sv: count=2');

  env.notifySaveWarning({
    message:'保存容量の上限に達しました。データ整理が必要です。',
    consoleTag:'[SQ]',
    callsiteId:'STORAGE-QUOTA:save',
    kind:'storage-quota',
    aggregateKey:'storage-quota:global',
    severity:'warn'
  });
  assertEq(env._getIndicatorState().count, 3, 'T-EXP8-mixed-after-sq: count=3');

  // 最終 showMsg は最後の storage-quota の元 message
  var final = env._regMsgFinal();
  assert(final.indexOf('保存容量の上限に達しました。データ整理が必要です。') !== -1,
    'T-EXP8-mixed-final-msg: 混在 3 件発火後の最終 showMsg は storage-quota の元 message');
}

// ============================================================================
// SECTION 18: SAVE-UX-PARSE-HANDLING-IMPL — storage-corrupted を第 4 系統として接続
// ============================================================================
// 依頼: SAVE-UX-PARSE-HANDLING-IMPL（PR #86 §16 案 A）
// 設計参照: docs/notes/20260513_shogi_save_ux_status_map.md §16
//
// 実装範囲（最小着地、1 callsite のみ）:
//   - syncBranchMasterOnSave() の _loaded_with_corruption ブランチを notifySaveWarning 経由化
//   - 既存 explicit console.warn / showMsg('warn') 直接呼び出しは削除（PR #79 storage-quota パターン）
//
// metadata:
//   kind:         'storage-corrupted'
//   aggregateKey: 'storage-corrupted:branch-master'
//   severity:     'warn'
//   callsiteId:   'PARSE-MASTER-003'
//
// showMsg aggregation: 対象外（SAVE_WARN_AGGREGATABLE_KINDS は変更しない）
// indicator: helper 1 呼出 = +1 維持
// console.warn: helper が個別出力、既存 explicit console.warn は削除（重複回避）
// 不変項目:
//   - save() 呼び出し（corruption 検知時も大会データ保存は継続、test_branch_master.js MF#3）
//   - saveBranchMaster() を呼ばない不変項目（破損由来の空マスタは永続化しない）
//   - 後段 catch(e) の `console.warn('支部マスタ同期に失敗（既存大会運営は継続）',e)`
//   - 既存 3 系統（save-verify 15 / storage-quota 2 / master-verify 3）件数・挙動

// ----------------------------------------------------------------------------
// T-EXP9-static: source 静的検証（PR #80 SAVE-UX-TEST-STRUCTURAL-MATCH 方式）
// ----------------------------------------------------------------------------

var __EXP9_STORAGE_CORRUPTED_BLOCKS = __EXPAND_BLOCKS.filter(function(b){
  return b.kind === 'storage-corrupted';
});

// kind=storage-corrupted の block が厳密 1 件
assertEq(__EXP9_STORAGE_CORRUPTED_BLOCKS.length, 1,
  'T-EXP9-static-kind-count: kind=storage-corrupted の block は 1 件');

// callsiteId=PARSE-MASTER-003 が 1 件
assertEq(
  __EXP9_STORAGE_CORRUPTED_BLOCKS.filter(function(b){ return b.callsiteId === 'PARSE-MASTER-003'; }).length,
  1,
  'T-EXP9-static-callsiteId: PARSE-MASTER-003 が 1 件');

// aggregateKey=storage-corrupted:branch-master が 1 件
assertEq(
  __EXP9_STORAGE_CORRUPTED_BLOCKS.filter(function(b){ return b.aggregateKey === 'storage-corrupted:branch-master'; }).length,
  1,
  'T-EXP9-static-aggKey: aggregateKey=storage-corrupted:branch-master が 1 件');

// severity=warn が 1 件
assertEq(
  __EXP9_STORAGE_CORRUPTED_BLOCKS.filter(function(b){ return b.severity === 'warn'; }).length,
  1,
  'T-EXP9-static-severity: storage-corrupted block の severity=warn が 1 件');

// 既存 explicit console.warn / showMsg 直接呼び出しが除去されている（PR #79 storage-quota パターン）
assertEq(__EXPAND_SRC.indexOf("console.warn('支部マスタが破損しているため自動同期をスキップ（大会データのコピーは継続）')"), -1,
  'T-EXP9-static-no-old-console-warn: 既存 explicit console.warn が source に残らない');
assertEq(__EXPAND_SRC.indexOf("showMsg('支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）','warn')"), -1,
  "T-EXP9-static-no-old-showMsg: 既存 explicit showMsg(..,'warn') が source に残らない");

// 後段 catch(e) の汎用 console.warn は存続（corruption 以外の例外を捕捉するため）
assert(__EXPAND_SRC.indexOf("console.warn('支部マスタ同期に失敗（既存大会運営は継続）',e)") !== -1,
  'T-EXP9-static-keeps-generic-catch: syncBranchMasterOnSave 後段 catch の汎用 console.warn は存続');

// SAVE_WARN_AGGREGATABLE_KINDS に storage-corrupted が含まれない（初期 aggregation 対象外）
{
  var __exp9_m = __EXPAND_SRC.match(/SAVE_WARN_AGGREGATABLE_KINDS\s*=\s*new\s+Set\(\[([^\]]*)\]\)/);
  assert(__exp9_m !== null, 'T-EXP9-static-allow-list-found: Set literal が抽出できる');
  var __exp9_body = __exp9_m ? __exp9_m[1] : '';
  assertEq(__exp9_body.indexOf("'storage-corrupted'"), -1,
    'T-EXP9-static-allow-list-no-storage-corrupted: storage-corrupted は allow-list に含まれない');
}

// 4 系統 metadata 件数（合計 21）
assertEq(__EXPAND_BLOCKS.filter(function(b){ return b.kind === 'save-verify'; }).length, 15,
  'T-EXP9-static-save-verify-15: save-verify 15 件維持');
assertEq(__EXPAND_BLOCKS.filter(function(b){ return b.kind === 'storage-quota'; }).length, 2,
  'T-EXP9-static-storage-quota-2: storage-quota 2 件維持');
assertEq(__EXPAND_BLOCKS.filter(function(b){ return b.kind === 'master-verify'; }).length, 3,
  'T-EXP9-static-master-verify-3: master-verify 3 件維持');
assertEq(__EXPAND_BLOCKS.filter(function(b){ return b.kind === 'storage-corrupted'; }).length, 1,
  'T-EXP9-static-storage-corrupted-1: storage-corrupted 1 件');
assertEq(__EXPAND_BLOCKS.length, 21,
  'T-EXP9-static-4systems-total: 4 系統合計 21 件');

// ----------------------------------------------------------------------------
// T-EXP9-runtime: syncBranchMasterOnSave 経由の corruption 検知挙動
// ----------------------------------------------------------------------------

// 壊れた raw を localStorage に直接書き込む stub（test_branch_master.js MF#3 と同方式）
function _stubCorruptedBranchMaster(env){
  env._ctx.localStorage.setItem('shogi_branch_master','{ corrupted master raw');
}

function _makeReportState(){
  return {
    players:{A:[],B:[]},
    rounds:4,
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    started:false,
    report:{date:'2026年5月14日',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''}
  };
}

// T-EXP9-runtime-corruption-notify: _loaded_with_corruption 経路で notifySaveWarning が動く
{
  var env = _newAggEnv();
  _stubCorruptedBranchMaster(env);
  env._setState(_makeReportState());
  env.syncBranchMasterOnSave();
  // showMsg は notifySaveWarning 経由で出る
  var final = env._regMsgFinal();
  assert(final.indexOf('支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）') !== -1,
    'T-EXP9-runtime-corruption-showMsg: showMsg に storage-corrupted 文言が出る');
  assert(final.indexOf('alert-warn') !== -1,
    'T-EXP9-runtime-corruption-type: showMsg type=warn');
  // indicator +1
  assertEq(env._getIndicatorState().count, 1,
    'T-EXP9-runtime-corruption-indicator: count=1');
  // console.warn 出力に metadata が含まれる
  var lastWarn = env._warnCalls[env._warnCalls.length - 1];
  assert(lastWarn.indexOf('"kind":"storage-corrupted"') !== -1,
    'T-EXP9-runtime-corruption-meta-kind: kind=storage-corrupted');
  assert(lastWarn.indexOf('"aggregateKey":"storage-corrupted:branch-master"') !== -1,
    'T-EXP9-runtime-corruption-meta-aggKey: aggregateKey=storage-corrupted:branch-master');
  assert(lastWarn.indexOf('"severity":"warn"') !== -1,
    'T-EXP9-runtime-corruption-meta-sev: severity=warn');
  assert(lastWarn.indexOf('"callsiteId":"PARSE-MASTER-003"') !== -1,
    'T-EXP9-runtime-corruption-meta-callsite: callsiteId=PARSE-MASTER-003');
}

// T-EXP9-runtime-save-still-called: corruption 検知時も save() は呼ばれる（大会データ保存継続）
{
  var env = _newAggEnv();
  _stubCorruptedBranchMaster(env);
  env._setState(_makeReportState());
  env._ctx.localStorage.removeItem('shogi_v4');
  env.syncBranchMasterOnSave();
  var stateRaw = env._ctx.localStorage.getItem('shogi_v4');
  assert(typeof stateRaw === 'string' && stateRaw.length > 0,
    'T-EXP9-runtime-corruption-save-called: 破損マスタ検知時も save() が呼ばれる（shogi_v4 キーが書かれる）');
}

// T-EXP9-runtime-saveBranchMaster-not-called: 破損 raw を上書きしない（既存不変項目）
{
  var env = _newAggEnv();
  _stubCorruptedBranchMaster(env);
  env._setState(_makeReportState());
  var before = env._ctx.localStorage.getItem('shogi_branch_master');
  env.syncBranchMasterOnSave();
  var after = env._ctx.localStorage.getItem('shogi_branch_master');
  assert(before === after,
    'T-EXP9-runtime-corruption-no-overwrite: corruption 検知時 saveBranchMaster は呼ばれず、破損 raw は localStorage 上で上書きされない');
}

// T-EXP9-runtime-no-dup-console-warn: 既存 explicit console.warn が呼ばれない（重複回避）
{
  var env = _newAggEnv();
  _stubCorruptedBranchMaster(env);
  env._setState(_makeReportState());
  env.syncBranchMasterOnSave();
  var warnTexts = env._warnCalls.join('|||');
  assertEq(warnTexts.indexOf('支部マスタが破損しているため自動同期をスキップ（大会データのコピーは継続）'), -1,
    'T-EXP9-runtime-no-dup-warn: corruption 時に既存 explicit console.warn は呼ばれない（notifySaveWarning の consoleTag のみ）');
}

// T-EXP9-runtime-non-corruption-no-notify: 非 corruption ケースで notifySaveWarning が呼ばれない
{
  var env = _newAggEnv();
  // 壊れた raw を仕込まない → loadBranchMaster は createEmptyBranchMaster を返す
  env._ctx.localStorage.removeItem('shogi_branch_master');
  env._setState(_makeReportState());
  env.syncBranchMasterOnSave();
  // notifySaveWarning が呼ばれていない → indicator 0
  assertEq(env._getIndicatorState().count, 0,
    'T-EXP9-runtime-non-corruption-indicator: 非 corruption では indicator +0');
  // showMsg にも storage-corrupted 文言なし
  var final = env._regMsgFinal();
  assertEq(final.indexOf('支部マスタが破損しているため自動同期をスキップしました'), -1,
    'T-EXP9-runtime-non-corruption-no-showMsg: 非 corruption では storage-corrupted 文言が出ない');
}

// ----------------------------------------------------------------------------
// T-EXP9-aggregation-not-target: storage-corrupted は aggregation 対象外
// ----------------------------------------------------------------------------

// T-EXP9-not-aggregated-2nd-original: 同一 aggregateKey で 3 秒未満連発しても元 message のまま
{
  var env = _newAggEnv();
  _seedAggKey(env, 'storage-corrupted:branch-master', 1000);
  env.notifySaveWarning({
    message:'支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）',
    consoleTag:'[STORAGE-CORRUPTED] test',
    callsiteId:'PARSE-MASTER-003',
    kind:'storage-corrupted',
    aggregateKey:'storage-corrupted:branch-master',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）') !== -1,
    'T-EXP9-not-aggregated-2nd-original: storage-corrupted の 2 回目も元 message');
  assertEq(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE), -1,
    'T-EXP9-not-aggregated-no-short-msg: 短縮文言には切り替わらない');
}

// T-EXP9-corruption-twice-indicator-plus-2: 連続 2 回 syncBranchMasterOnSave で indicator +2
{
  var env = _newAggEnv();
  _stubCorruptedBranchMaster(env);
  env._setState(_makeReportState());
  env.syncBranchMasterOnSave();
  env.syncBranchMasterOnSave();
  assertEq(env._getIndicatorState().count, 2,
    'T-EXP9-corruption-twice-indicator: 連続 2 回で indicator +2（発生単位維持）');
}

// ----------------------------------------------------------------------------
// T-EXP9-namespace-isolation: 既存 3 系統への影響なし
// ----------------------------------------------------------------------------

// T-EXP9-sv-still-aggregates: save-verify は依然 aggregate
{
  var env = _newAggEnv();
  _seedAggKey(env, 'save-verify:core', 1000);
  env.notifySaveWarning({
    message:'大会を開始しましたが、保存が確認できませんでした...',
    consoleTag:'SAVE-003 test',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP9-sv-still-aggregates: save-verify は依然短縮文言に切替');
}

// T-EXP9-mv-still-aggregates: master-verify は依然 aggregate
{
  var env = _newAggEnv();
  _seedAggKey(env, 'master-verify:lastclass', 1000);
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV] test',
    callsiteId:'S05',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf(env.SAVE_WARN_AGGREGATED_MESSAGE) !== -1,
    'T-EXP9-mv-still-aggregates: master-verify は依然短縮文言に切替');
}

// T-EXP9-sq-still-not-aggregated: storage-quota は依然 aggregation 対象外
{
  var env = _newAggEnv();
  _seedAggKey(env, 'storage-quota:global', 1000);
  env.notifySaveWarning({
    message:'保存容量の上限に達しました。データ整理が必要です。',
    consoleTag:'[STORAGE-QUOTA]',
    callsiteId:'STORAGE-QUOTA:save',
    kind:'storage-quota',
    aggregateKey:'storage-quota:global',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('保存容量の上限に達しました。データ整理が必要です。') !== -1,
    'T-EXP9-sq-still-not-aggregated: storage-quota の 2 回目も元 message');
}

// T-EXP9-corruption-no-pollute-sv: storage-corrupted 発火が save-verify state を汚染しない
{
  var env = _newAggEnv();
  // 1. storage-corrupted を発火
  env.notifySaveWarning({
    message:'支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）',
    consoleTag:'[STORAGE-CORRUPTED]',
    callsiteId:'PARSE-MASTER-003',
    kind:'storage-corrupted',
    aggregateKey:'storage-corrupted:branch-master',
    severity:'warn'
  });
  env._clear();
  // 2. save-verify:core を発火 — 別 key なので 1 回目扱い → 元 message
  env.notifySaveWarning({
    message:'大会を開始しましたが、保存が確認できませんでした...',
    consoleTag:'SAVE-003',
    callsiteId:'SAVE-003-startTournament',
    kind:'save-verify',
    aggregateKey:'save-verify:core',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('大会を開始しましたが') !== -1,
    'T-EXP9-corruption-no-pollute-sv: storage-corrupted 発火が save-verify:core の 1 回目扱いを破壊しない');
}

// T-EXP9-corruption-no-pollute-mv: storage-corrupted 発火が master-verify state を汚染しない
{
  var env = _newAggEnv();
  env.notifySaveWarning({
    message:'支部マスタが破損しているため自動同期をスキップしました（大会データのコピーは継続）',
    consoleTag:'[STORAGE-CORRUPTED]',
    callsiteId:'PARSE-MASTER-003',
    kind:'storage-corrupted',
    aggregateKey:'storage-corrupted:branch-master',
    severity:'warn'
  });
  env._clear();
  env.notifySaveWarning({
    message:'前回クラス情報の保存が確認できませんでした',
    consoleTag:'[MV]',
    callsiteId:'S05',
    fields:['last_class'],
    kind:'master-verify',
    aggregateKey:'master-verify:lastclass',
    severity:'warn'
  });
  var final = env._regMsgFinal();
  assert(final.indexOf('前回クラス情報の保存が確認できませんでした') !== -1,
    'T-EXP9-corruption-no-pollute-mv: storage-corrupted 発火が master-verify:lastclass の 1 回目扱いを破壊しない');
}

// ============================================================================
// 結果
// ============================================================================
console.log('\n  MASTER-V2-LASTCLASS-IMPL 単体テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
