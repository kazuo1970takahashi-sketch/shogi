#!/usr/bin/env node
// CLUB-PROFILE-001: リセットを跨ぐ「クラブ設定」層の単体テスト。
//   設計 = 2026-08-09 設計 v2（反証パネル3体の指摘反映済み）。
//   検証する不変条件:
//     P1. 保存→resetAll→report/classes（クラス別 rounds 上書き含む）/rounds が profile 値
//     P2. 保存→同セッション即 resetAll→新値（read-at-use。起動時読みの stale を使わない）
//     P3. profile 無し→factory（従来挙動と同値。初期 state・resetAll とも沼津値/A,B/4回戦）
//     P4. 壊れた profile JSON / A/B 欠落 profile → fail-soft で factory
//     P5. シードは「キー不在」のときだけ1回（マーカー方式。2回目は走らない）
//     P6. resetAll→開始(started 直接代入)→resetAll で profile が汚染されない（deep copy）
//     P7. 保存→resetAll→再起動（別 env・同一 localStorage）でも同値（生成系の一貫）
//     P8. normalizeState は profile 存在下でも factory（snapshot 復元の歴史保護）
//     P9. resetAll に旧クラスの DOM 差分掃除（removeClassDomNodes）がある（構造 pin・
//         実描画は実ブラウザ検証で担保）
//   このファイルは shogi_v4.html を一切変更しない（test/ のみ）。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2] || path.join(__dirname, '..', 'shogi_v4.html');
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(src){
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(src))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- DOM/localStorage mock（test_pairing_odd_leftover_272.js の loadEnv と同型） ----
function makeCtx(){
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
      style:{}, _attrs:{}, childNodes:[], dataset:{},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
      remove:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
      classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;}},
      focus:function(){}, scrollIntoView:function(){}
    };
  }
  const elements={};
  const doc={
    getElementById:function(id){ if(!elements[id]){ const n=makeNode('div'); n.id=id; elements[id]=n; n.parentNode=makeNode('div'); n.parentNode.parentNode=makeNode('div'); } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'),
    documentElement:makeNode('html'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
    readyState:'complete'
  };
  return {doc:doc, elements:elements};
}

// store: {key: string} を共有できる localStorage mock（P7 の「再起動」用に外から渡す）
function makeStorage(store){
  return {
    getItem:function(k){ return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null; },
    setItem:function(k,v){ store[k]=String(v); },
    removeItem:function(k){ delete store[k]; },
    clear:function(){ for(const k in store)delete store[k]; }
  };
}

function loadEnv(store){
  const ctx=makeCtx();
  const ls=makeStorage(store||{});
  const js=extractScripts(RAW);
  const winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){}, location:{href:'',search:'',hash:'',protocol:'https:'} };
  const fn=new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','console','setTimeout','clearTimeout',
    `${js};
     return {
       normalizeState:normalizeState, resetAll:resetAll,
       factoryReport:factoryReport, profileReport:profileReport, profileClasses:profileClasses, profileRounds:profileRounds,
       readClubProfileRaw:readClubProfileRaw, saveClubProfile:saveClubProfile,
       buildClubProfileFromState:buildClubProfileFromState, seedClubProfileOnce:seedClubProfileOnce,
       CLUB_PROFILE_KEY:CLUB_PROFILE_KEY,
       __setAppModalTestResolver:(typeof __setAppModalTestResolver!=='undefined'?__setAppModalTestResolver:undefined),
       _setState:function(s){state=s;}, _getState:function(){return state;},
       _getClubProfileVar:function(){return clubProfile;}
     };`
  );
  const api=fn(
    ctx.doc, winMock, ls, {randomUUID(){return '00000000-0000-0000-0000-000000000000';}},
    function(){}, function(){return true;}, function(){return '';},
    {log:function(){},error:function(){},warn:function(){}},
    function(cb){}, function(){}
  );
  if(typeof api.__setAppModalTestResolver==='function'){
    api.__setAppModalTestResolver(function(){ return true; });
  }
  api._ls=ls; api._store=store;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('【CLUB-PROFILE-001: リセットを跨ぐクラブ設定層】');

// 松本クラブのサンプル profile を作る操作（state を松本値にして保存ボタン相当を呼ぶ）
function makeMatsumotoState(env){
  const s=env._getState();
  s.report.title='松本支部月例将棋大会';
  s.report.organizer='日本将棋連盟松本支部';
  s.report.place='松本市民会館';
  s.report.fax='000-1111';
  s.report.officeName='松本支部事務局';
  s.report.prize=5000;
  s.report.timeType='byoyomi';
  s.report.timeMain=20;
  s.report.timeByoyomi=40;
  s.classes.push({id:'C',name:'ジュニア',started:false,rounds:3});   // クラス別 rounds 上書き
  s.rounds=5;
  return s;
}

// ---- P3: profile 無し → factory（従来挙動と同値） ----
{
  const env=loadEnv({});
  const st=env._getState();
  const f=env.factoryReport();
  assert(JSON.stringify(st.report)===JSON.stringify(f), 'P3-1 profile 無しの初期 state.report は factory と同値');
  assert(st.classes.length===2&&st.classes[0].id==='A'&&st.classes[1].id==='B', 'P3-2 profile 無しの初期 classes は A/B');
  assert(st.rounds===4, 'P3-3 profile 無しの初期 rounds は 4');
  env.resetAll();
  const st2=env._getState();
  assert(st2.report.title==='沼津支部月例将棋大会'&&st2.report.place==='労政会館', 'P3-4 profile 無しの resetAll は沼津 factory 値');
  assert(st2.classes.length===2&&st2.rounds===4, 'P3-5 profile 無しの resetAll は A/B・4回戦');
}

// ---- P1: 保存 → resetAll → profile 値 ----
{
  const env=loadEnv({});
  makeMatsumotoState(env);
  assert(env.saveClubProfile(env.buildClubProfileFromState())===true, 'P1-1 明示保存が成功する');
  env.resetAll();
  const st=env._getState();
  assert(st.report.title==='松本支部月例将棋大会', 'P1-2 resetAll 後の大会名が profile 値');
  assert(st.report.place==='松本市民会館'&&st.report.fax==='000-1111'&&st.report.officeName==='松本支部事務局', 'P1-3 会場・FAX・事務局名が profile 値');
  assert(st.report.prize===5000&&st.report.timeType==='byoyomi'&&st.report.timeMain===20&&st.report.timeByoyomi===40, 'P1-4 賞金・持ち時間が profile 値');
  // date は resetAll 後段の populateReportFields→ensureReportDateTimeDefaults が「今日」を
  //   補完する既存挙動（REPORT-UX-001）のため「空 or ISO 形式」を許容。sei/note は空。
  assert(/^(\d{4}-\d{2}-\d{2})?$/.test(st.report.date)&&st.report.sei===''&&st.report.note==='', 'P1-5 大会ごとの値は profile から持ち越されない（date=空か今日・sei/note=空）');
  assert(st.classes.length===3&&st.classes[2].id==='C'&&st.classes[2].name==='ジュニア', 'P1-6 クラス構成（C=ジュニア）が profile 値');
  assert(st.classes[2].rounds===3, 'P1-7 クラス別回戦数上書き（C=3回戦）が保持される');
  assert(st.rounds===5, 'P1-8 全体回戦数が profile 値（5）');
  assert(st.players.C&&Array.isArray(st.players.C)&&st.players.C.length===0, 'P1-9 profile クラスの players dict が初期化される');
}

// ---- P2: 保存 → 同セッション即 resetAll → 新値（read-at-use） ----
{
  const env=loadEnv({});
  // 起動時は profile 無し（clubProfile=null で読まれている）
  assert(env._getClubProfileVar()===null, 'P2-1 起動時の clubProfile は null');
  makeMatsumotoState(env);
  env.saveClubProfile(env.buildClubProfileFromState());
  env.resetAll();   // 起動時の null ではなく、保存直後の値が使われること
  assert(env._getState().report.title==='松本支部月例将棋大会', 'P2-2 保存→即 resetAll で新しい既定が使われる（stale を使わない）');
}

// ---- P4: 壊れた profile → fail-soft factory ----
{
  const env=loadEnv({[ 'shogi_club_profile' ]: '{broken json'});
  assert(env._getState().report.title==='沼津支部月例将棋大会', 'P4-1 壊れた JSON は factory に fail-soft（初期 state）');
  env.resetAll();
  assert(env._getState().report.title==='沼津支部月例将棋大会', 'P4-2 壊れた JSON は factory に fail-soft（resetAll）');
  // A/B 欠落 profile（不変条件違反）→ classes は factory へ
  const env2=loadEnv({'shogi_club_profile': JSON.stringify({schema_version:1,report:{title:'X会'},classes:[{id:'C',name:'Cだけ'}],rounds:9})});
  const st2=env2._getState();
  assert(st2.classes.length===2&&st2.classes[0].id==='A', 'P4-3 A/B 欠落 profile の classes は factory（A/B）に fail-soft');
  assert(st2.report.title==='X会', 'P4-4 report 側の有効値は独立に生きる（フィールド単位の検証）');
  assert(st2.rounds===9, 'P4-5 rounds の有効値は独立に生きる');
}

// ---- P5: シードは「キー不在」のときだけ1回 ----
{
  const store={};
  const env=loadEnv(store);
  makeMatsumotoState(env);
  env.seedClubProfileOnce();
  const seeded=JSON.parse(store['shogi_club_profile']);
  assert(seeded&&seeded.report&&seeded.report.title==='松本支部月例将棋大会', 'P5-1 キー不在なら現 state からシードされる');
  assert(seeded.classes.length===3&&seeded.classes[2].rounds===3, 'P5-2 シードにクラス構成（rounds 上書き含む）が入る');
  // 2回目は走らない（他クラブ state に変えても上書きされない）
  env._getState().report.title='乗っ取りクラブ大会';
  env.seedClubProfileOnce();
  assert(JSON.parse(store['shogi_club_profile']).report.title==='松本支部月例将棋大会', 'P5-3 キーが在れば二度とシードしない（インポート乗っ取り防止）');
  // started は保存されない
  assert(!('started' in seeded.classes[0]), 'P5-4 シードの classes に started を含めない');
}

// ---- P6: resetAll→開始→resetAll で profile 汚染なし（deep copy） ----
{
  const env=loadEnv({});
  makeMatsumotoState(env);
  env.saveClubProfile(env.buildClubProfileFromState());
  env.resetAll();
  // 大会開始相当: class オブジェクトへ started 直接代入（ROUND-CLASS-START の実挙動）
  env._getState().classes.forEach(function(c){ c.started=true; });
  env._getState().classes[2].name='今月だけ改名';
  env.resetAll();
  const st=env._getState();
  assert(st.classes.every(function(c){ return c.started===false; }), 'P6-1 2度目の resetAll で started=false（参照共有汚染なし）');
  assert(st.classes[2].name==='ジュニア', 'P6-2 保存していない改名は既定化されない（deep copy）');
  const prof=env.readClubProfileRaw();
  assert(prof.classes.every(function(c){ return !('started' in c); }), 'P6-3 localStorage 上の profile にも started が混入しない');
}

// ---- P7: 保存→resetAll→再起動（別 env・同一 store）でも同値（生成系の一貫） ----
{
  const store={};
  const env=loadEnv(store);
  makeMatsumotoState(env);
  env.saveClubProfile(env.buildClubProfileFromState());
  env.resetAll();
  const afterReset=env._getState();
  // 「タブを閉じて翌月開く」= STORAGE_KEY 空のまま新しい env を同一 store で起動
  const env2=loadEnv(store);
  const booted=env2._getState();
  assert(booted.report.title===afterReset.report.title, 'P7-1 再起動後の大会名が resetAll 直後と同値');
  assert(JSON.stringify(booted.classes)===JSON.stringify(afterReset.classes), 'P7-2 再起動後の classes が同値（初期リテラルも profile 経由）');
  assert(booted.rounds===afterReset.rounds, 'P7-3 再起動後の rounds が同値');
}

// ---- P8: normalizeState は profile 存在下でも factory（歴史保護） ----
{
  const store={'shogi_club_profile': JSON.stringify({schema_version:1,report:{title:'三島支部月例将棋大会',organizer:'日本将棋連盟三島支部'},classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'}],rounds:4})};
  const env=loadEnv(store);
  // profile は生成系には効いている
  assert(env._getState().report.title==='三島支部月例将棋大会', 'P8-1 前提: profile は初期 state に効いている');
  // 過去 snapshot（report 欠落・旧版相当）の normalize → factory で埋まる（三島にならない）
  const ns=env.normalizeState({players:{A:[],B:[]},results:{A:[],B:[]},pairings:{A:[],B:[]}});
  assert(ns.report.title==='沼津支部月例将棋大会', 'P8-2 normalizeState の欠落補完は factory（今のクラブ値で歴史を書き換えない）');
  assert(ns.report.organizer==='日本将棋連盟沼津支部', 'P8-3 organizer も factory');
  // snapshot に実データがあればそのまま維持される
  const ns2=env.normalizeState({report:{title:'2025年特別大会'},players:{A:[],B:[]},results:{A:[],B:[]},pairings:{A:[],B:[]}});
  assert(ns2.report.title==='2025年特別大会', 'P8-4 snapshot の実データは維持される');
}

// ---- P9: resetAll の旧クラス DOM 差分掃除（構造 pin） ----
{
  const m=RAW.match(/function resetAll\(\)[\s\S]*?\n\}\n/);
  const body=m?m[0]:'';
  assert(body.indexOf('removeClassDomNodes')>=0, 'P9-1 resetAll に旧クラスの DOM 差分掃除（removeClassDomNodes）がある');
  assert(body.indexOf('_oldClasses')>=0, 'P9-2 差し替え前の旧クラス集合を控えてから差分を取る');
  assert(body.indexOf('readClubProfileRaw()')>=0, 'P9-3 resetAll は実行時に profile を読み直す（read-at-use）');
}

console.log('\n  CLUB-PROFILE-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
