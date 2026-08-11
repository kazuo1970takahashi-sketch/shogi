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
       verifyWholeStatePersisted:verifyWholeStatePersisted,
       restoreClubProfileRaw:restoreClubProfileRaw, restoreTournamentRaw:restoreTournamentRaw,
       buildTournamentBackupObject:buildTournamentBackupObject, serializeTournamentBackup:serializeTournamentBackup,
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
  // 実装パネル指摘の3穴: 重複 id・不正 id（isSafeClassId 違反）・schema_version 不一致
  const env3=loadEnv({'shogi_club_profile': JSON.stringify({schema_version:1,report:{},classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'},{id:'C',name:'C1'},{id:'C',name:'C2'},{id:'C X"',name:'不正'}],rounds:4})});
  const ids3=env3._getState().classes.map(function(c){return c.id;});
  assert(JSON.stringify(ids3)===JSON.stringify(['A','B','C']), 'P4-6 重複 id は初出のみ・不正 id は除外（実測 '+ids3.join(',')+'）');
  assert(env3._getState().classes[2].name==='C1', 'P4-7 重複 id は初出のエントリが勝つ');
  const env4=loadEnv({'shogi_club_profile': JSON.stringify({schema_version:2,report:{title:'未来クラブ大会'},classes:[{id:'A',name:'A'},{id:'B',name:'B'}],rounds:9})});
  assert(env4._getState().report.title==='沼津支部月例将棋大会'&&env4._getState().rounds===4, 'P4-8 schema_version≠1 は全体を factory に fail-soft');
  // 保存側の防御: 重複 id 入り state を保存しても profile は汚れない
  const env5=loadEnv({});
  env5._getState().classes.push({id:'C',name:'C甲',started:false});
  env5._getState().classes.push({id:'C',name:'C乙',started:false});
  const built=env5.buildClubProfileFromState();
  assert(built.classes.map(function(c){return c.id;}).join(',')==='A,B,C', 'P4-9 buildClubProfileFromState も重複 id を初出のみ採用');
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

// ---- P10: 書き込みが黙って捨てられる storage（Codex P1・PR #845） ----
{
  const store={};
  const env=loadEnv(store);
  makeMatsumotoState(env);
  assert(env.saveClubProfile(env.buildClubProfileFromState())===true, 'P10-1 正常 storage では保存成功');
  // setItem が受理される（throw しない）が値を保持しない storage を再現
  env._ls.setItem=function(){ /* 受理するが保持しない */ };
  env._getState().report.title='保存されない新値';
  const ok=env.saveClubProfile(env.buildClubProfileFromState());
  assert(ok===false, 'P10-2 読み戻し検証で失敗を検知し false を返す（成功と偽らない）');
  env.resetAll();
  assert(env._getState().report.title==='松本支部月例将棋大会', 'P10-3 失敗後もメモリ/storage 上の直前の既定が生きている');
}

// ---- P11: 保存 UI の構造 pin（Codex P2・PR #845） ----
{
  assert(/<details[^>]*id="club-profile-details"/.test(RAW), 'P11-1 保存操作は <details> 格納（低頻度の準備操作・STYLE-GUIDE §7）');
  assert(/id="saveClubProfileBtn"[^>]*class="btn-outline-primary"|class="btn-outline-primary"[^>]*id="saveClubProfileBtn"/.test(RAW), 'P11-2 ボタンの色・枠は class 系（§1-2）');
  assert(RAW.indexOf('.btn-outline-primary{')>=0, 'P11-3 .btn-outline-primary が class として定義されている');
  const saveFn=RAW.slice(RAW.indexOf('function onSaveClubProfileClick'), RAW.indexOf('function onSaveClubProfileClick')+1600);
  assert(saveFn.indexOf('appAlert(')>=0, 'P11-4 保存失敗はブロッキング通知（§3・一過性 toast にしない）');
  // Codex 2巡目 P2×2: disclosure の色は class 側（§1）・タップ目標 44px 以上（§10.3）
  assert(/<summary class="club-profile-summary"/.test(RAW), 'P11-5 summary は class 指定（inline に色を書かない）');
  const sumCss=RAW.slice(RAW.indexOf('.club-profile-summary{'), RAW.indexOf('.club-profile-summary{')+200);
  assert(sumCss.indexOf('min-height:44px')>=0, 'P11-6 summary のタップ目標が 44px 以上（§10.3）');
  assert(sumCss.indexOf('color:#666')>=0, 'P11-7 summary の色は class 側で定義');
}

// ---- P12: start/end もクラブ既定（CLUB-PROFILE-002・#839 受け入れ基準1） ----
{
  const env=loadEnv({});
  const s=env._getState();
  s.report.start='09:30'; s.report.end='12:00'; s.report.title='松本支部月例将棋大会';
  env.saveClubProfile(env.buildClubProfileFromState());
  env.resetAll();
  const st=env._getState();
  assert(st.report.start==='09:30'&&st.report.end==='12:00', 'P12-1 resetAll 後も開始/終了時刻が profile 値（13:00/17:00 に戻らない）');
  assert(/^(\d{4}-\d{2}-\d{2})?$/.test(st.report.date), 'P12-2 date は profile に載せない（#804 と同じ向き＝前月の実施日を残さない）');
  // 不正な時刻は保存しない（factory へ）
  const env2=loadEnv({'shogi_club_profile': JSON.stringify({schema_version:1,report:{start:'25:99',end:'ほげ'},classes:[{id:'A',name:'A'},{id:'B',name:'B'}],rounds:4})});
  const st2=env2._getState();
  assert(st2.report.start===''&&st2.report.end==='', 'P12-3 不正な時刻文字列は profile に採用しない');
}

// ---- P13: 空欄をクラブ既定として保存できる（CLUB-PROFILE-002・#839 論点6・作者決定） ----
{
  const env=loadEnv({});
  const s=env._getState();
  s.report.fax=''; s.report.accountingNote=''; s.report.officeName='松本支部事務局';
  const prof=env.buildClubProfileFromState();
  assert(prof.report.fax===''&&prof.report.accountingNote==='', 'P13-1 空欄が「明示的な空」として profile に保存される');
  env.saveClubProfile(prof);
  env.resetAll();
  const st=env._getState();
  assert(st.report.fax===''&&st.report.accountingNote==='', 'P13-2 resetAll 後も空欄のまま（factory 値が復活しない）');
  assert(st.report.officeName==='松本支部事務局', 'P13-3 空にしていないキーは通常どおり保持');
  // ★歴史保護: 正規化系（normalizeState）は空宣言に影響されず factory のまま
  const ns=env.normalizeState({players:{A:[],B:[]},results:{A:[],B:[]},pairings:{A:[],B:[]}});
  assert(ns.report.accountingNote==='※役員会で会計長へ収支報告書として提出ください。', 'P13-4 normalizeState は空宣言に影響されず factory（過去 snapshot の歴史保護）');
  // 帳票は空の行を畳む（構造 pin）
  const brm=RAW.match(/function buildReportFooterHtml\(\)[\s\S]*?\n  \}/);
  const brBody=brm?brm[0]:'';
  assert(brBody.indexOf("officeName!==''")>=0&&brBody.indexOf("accountingNote!==''")>=0, 'P13-5 帳票 footer は空の事務局名・会計提出文の行を出さない');
}

// ---- P14: バックアップにクラブ既定を同梱（CLUB-PROFILE-002・#839 制約5/基準11） ----
{
  const bm=RAW.match(/function buildTournamentBackupObject\([\s\S]*?\n\}/);
  const bBody=bm?bm[0]:'';
  assert(/club_profile\s*:/.test(bBody), 'P14-1 バックアップ JSON にクラブ既定を同梱する');
  assert(bBody.indexOf('BACKUP_SCHEMA_VERSION')>=0&&!/BACKUP_SCHEMA_VERSION\s*=\s*2/.test(RAW), 'P14-2 BACKUP_SCHEMA_VERSION は上げない（制約4）');
  const pm=RAW.match(/function parseTournamentBackup\([\s\S]*?\n\}/);
  const pBody=pm?pm[0]:'';
  assert(/club_profile/.test(pBody), 'P14-3 復元側が club_profile を読む（無ければ null＝旧バックアップ互換）');
  const im=RAW.match(/function importTournamentBackupFromText\([\s\S]*?\n\}/);
  const iBody=im?im[0]:'';
  assert(/saveClubProfile\s*\(\s*res\.club_profile\s*\)/.test(iBody), 'P14-4 復元時にクラブ既定も書き戻す');
  assert(/if\s*\(\s*res\.club_profile\s*\)/.test(iBody), 'P14-5 バックアップに無ければ既定を触らない（この端末の設定を消さない）');
}

// ---- P15: Codex 指摘（PR #847）の回帰 ----
{
  // P15-1/2: 明示的な空はリロード（normalizeState）を越えて保たれる ★これが無いと空はリロードで消える
  const store={};
  const env=loadEnv(store);
  const s=env._getState();
  s.report.fax=''; s.report.accountingNote=''; s.report.title='松本支部月例将棋大会';
  env.saveClubProfile(env.buildClubProfileFromState());
  env.resetAll();
  env._ls.setItem('shogi_v4',JSON.stringify(env._getState()));   // save() 相当
  const env2=loadEnv(store);                                     // 「タブを閉じて開き直す」
  assert(env2._getState().report.fax==='', 'P15-1 空にした FAX がリロード後も空（normalizeState が factory に戻さない）');
  assert(env2._getState().report.accountingNote==='', 'P15-2 空にした会計提出文がリロード後も空');
  // 未指定（キー欠落）は従来どおり factory へ＝歴史保護は不変
  const ns=env2.normalizeState({players:{A:[],B:[]},results:{A:[],B:[]},pairings:{A:[],B:[]}});
  assert(ns.report.fax==='943-9443'&&ns.report.accountingNote==='※役員会で会計長へ収支報告書として提出ください。', 'P15-3 キー欠落（未指定）は従来どおり factory 補完（過去 snapshot の歴史保護）');

  // P15-4/5: 不正な profile を保存しようとしても、既存の有効な既定を壊さない
  const env3=loadEnv({});
  env3._getState().report.title='松本支部月例将棋大会';
  env3.saveClubProfile(env3.buildClubProfileFromState());
  const before=env3.readClubProfileRaw();
  assert(before&&before.report.title==='松本支部月例将棋大会', 'P15-4 前提: 有効な既定が保存されている');
  const bad=env3.saveClubProfile({schema_version:2,report:{title:'壊れた'},classes:[],rounds:0});
  assert(bad===false, 'P15-5a 不正な profile の保存は false を返す');
  const after=env3.readClubProfileRaw();
  assert(after&&after.report.title==='松本支部月例将棋大会', 'P15-5b 不正な保存で既存の既定が壊れない（書く前に検証）');

  // P15-6: 復元確認文がクラブ既定の置き換えを明示する
  const im=RAW.match(/function importTournamentBackupFromText\([\s\S]*?\n\}/);
  const iBody=im?im[0]:'';
  assert(/res\.club_profile\s*\n?\s*\?/.test(iBody)&&iBody.indexOf('この端末の既定も置き換わります')>=0, 'P15-6 クラブ既定を含むバックアップの復元確認文が既定の置き換えを明示する');

  // P15-7: 保存ボタンの説明文が start/end を含む（実装と食い違わない）
  assert(RAW.indexOf('会場・開始/終了時刻・FAX')>=0, 'P15-7 説明文に開始/終了時刻が含まれる');
  assert(!/開催日・開始\/終了時刻・正副役員・申し送りは保存されません/.test(RAW), 'P15-8 「開始/終了時刻は保存されません」の古い記述が残っていない');

  // ---- Codex 2巡目（PR #847）の回帰 ----
  // P15-9: 空欄保存の説明が対象3項目に限定されている（全項目が空欄保存できると読めない）
  assert(RAW.indexOf('空欄のまま保存できるのは FAX・事務局名・会計提出文の3つです')>=0, 'P15-9 空欄保存の説明を対象3項目に限定している');
  assert(RAW.indexOf('大会名・主催・会場・賞金は空欄にすると既定値に戻ります')>=0, 'P15-10 空欄にすると既定へ戻る項目も明記している');
  // P15-11/12: 復元は部分適用を作らない（既定が書けなければ大会を取り込まない／逆向きも検知）
  const im2=RAW.match(/function importTournamentBackupFromText\([\s\S]*?\n\}/);
  const iBody2=im2?im2[0]:'';
  assert(/if\s*\(\s*!cpRestored\s*\)/.test(iBody2)&&iBody2.indexOf('復元を中止しました')>=0, 'P15-11 クラブ既定を保存できなければ復元を中止する（大会データに触れない）');
  assert(/if\s*\(\s*!verifyWholeStatePersisted\(\)\s*\)/.test(iBody2), 'P15-12 大会データの保存失敗も検知して明示する（逆向きの分裂）');
  assert(RAW.indexOf('function verifyWholeStatePersisted()')>=0, 'P15-13 verifyWholeStatePersisted が定義されている（save() は失敗を飲み込むため）');
}

// ---- P16: verifyWholeStatePersisted の挙動（Codex 2巡目 P1） ----
{
  const store={};
  const env=loadEnv(store);
  env._getState().report.title='松本支部月例将棋大会';
  env._ls.setItem('shogi_v4',JSON.stringify(env._getState()));
  assert(env.verifyWholeStatePersisted()===true, 'P16-1 保存済みなら true');
  env._getState().report.title='保存していない変更';
  assert(env.verifyWholeStatePersisted()===false, 'P16-2 state と localStorage がずれていれば false（save() の飲み込みを検知）');
  // P16-3: 同名衝突の再発防止。既存 verifyStatePersisted(playerId,expectedName) と同名にすると
  //   後方の関数宣言で上書きされ、無引数呼び出しが常に false になる（実装中に実際に踏んだ）。
  assert(RAW.indexOf('function verifyStatePersisted()')<0, 'P16-3 無引数版 verifyStatePersisted() を再定義していない（既存2引数版と衝突するため）');
  assert(RAW.indexOf('function verifyStatePersisted(playerId,expectedName)')>=0, 'P16-4 既存の氏名保存確認 verifyStatePersisted(playerId,expectedName) は残っている');
  // P16-5: applyLoadedJson は save 後に再描画し ensureReportDateTimeDefaults が date を補完するため、
  //   照合の直前に save() を挟まないと「保存できていない」と必ず誤検知する（実装中に踏んだ）。
  assert(/applyLoadedJson\(JSON\.stringify\(res\.state\)\);[\s\S]{0,600}?\n\s*save\(\);\s*\n\s*if\s*\(\s*!verifyWholeStatePersisted\(\)\s*\)/.test(RAW),
    'P16-5 復元後の照合は save() を挟んでから行う（再描画による date 補完で誤検知しない）');
}

// ---- P17: 大会データの保存に失敗したらクラブ既定を巻き戻す（Codex 3巡目 P1） ----
{
  const env=loadEnv({});
  // 松本を既定として保存 → その生バイトを控える → 別クラブの既定で上書き → 巻き戻す
  makeMatsumotoState(env);
  assert(env.saveClubProfile(env.buildClubProfileFromState())===true, 'P17-0 前提: 松本の既定を保存できる');
  const prevRaw=env._ls.getItem(env.CLUB_PROFILE_KEY);
  const s=env._getState();
  s.report.title='甲府支部月例将棋大会';
  assert(env.saveClubProfile(env.buildClubProfileFromState())===true, 'P17-1 上書き保存が成功する（巻き戻し前の状態を作る）');
  assert(env.restoreClubProfileRaw(prevRaw)===true, 'P17-2 巻き戻しが成功する');
  assert(env._ls.getItem(env.CLUB_PROFILE_KEY)===prevRaw, 'P17-3 localStorage の生バイトが復元前と一致する');
  assert(env._getClubProfileVar().report.title==='松本支部月例将棋大会', 'P17-4 メモリ上の clubProfile も巻き戻る（localStorage と食い違わない）');
  env.resetAll();
  assert(env._getState().report.title==='松本支部月例将棋大会', 'P17-5 巻き戻し後の全リセットは元の既定に戻る');
}
{
  // 既定が「無かった」端末では、巻き戻しはキーの削除でなければならない（空文字を書くと壊れた profile が残る）
  const env=loadEnv({});
  assert(env._ls.getItem(env.CLUB_PROFILE_KEY)===null||env._ls.getItem(env.CLUB_PROFILE_KEY)===undefined, 'P17-6 前提: 既定が無い端末');
  makeMatsumotoState(env);
  assert(env.saveClubProfile(env.buildClubProfileFromState())===true, 'P17-7 前提: 既定を書ける');
  assert(env.restoreClubProfileRaw(null)===true, 'P17-8 既定が無かった端末では null を渡して巻き戻せる');
  assert(!env._ls.getItem(env.CLUB_PROFILE_KEY), 'P17-9 キーごと削除される');
  assert(env._getClubProfileVar()===null, 'P17-10 メモリ上の clubProfile も null に戻る');
  env.resetAll();
  assert(env._getState().report.title==='沼津支部月例将棋大会', 'P17-11 巻き戻し後の全リセットは factory に戻る');
}
{
  // 構造 pin: 保存失敗の分岐で「既定の巻き戻し」と「メモリ上の大会データの巻き戻し」を両方やる
  const im3=RAW.match(/function importTournamentBackupFromText\([\s\S]*?\n\}/);
  const b3=im3?im3[0]:'';
  assert(/prevProfileRaw\s*=\s*localStorage\.getItem\(CLUB_PROFILE_KEY\)/.test(b3), 'P17-12 既定を書く前に生バイトを控えている');
  assert(/prevStateJson\s*=\s*JSON\.stringify\(state\)/.test(b3), 'P17-13 復元前の大会データも控えている');
  assert(/if\s*\(\s*!verifyWholeStatePersisted\(\)\s*\)\s*\{[\s\S]{0,900}?restoreClubProfileRaw\(prevProfileRaw\)/.test(b3),
    'P17-14 大会データを保存できなければクラブ既定を巻き戻す');
  assert(/if\s*\(\s*!verifyWholeStatePersisted\(\)\s*\)\s*\{[\s\S]{0,900}?applyLoadedJson\(prevStateJson\)/.test(b3),
    'P17-15 メモリ上の state も復元前に戻す（localStorage と食い違わせない）');
  assert(b3.indexOf('クラブ既定も元に戻したので、この端末は復元前のままです')>=0, 'P17-16 巻き戻せた場合は「元のまま」と伝える');
  assert(b3.indexOf('元の状態に戻すこともできませんでした')>=0, 'P17-17 巻き戻せなかった場合は正直に伝える（別文言）');
}

// ---- P18: 巻き戻し自体の検証と、builder の純粋性（Codex 4巡目 P1×2） ----
{
  // 大会データ側の巻き戻しも「書いて読み戻して照合」できたときだけ true
  const store={};
  const env=loadEnv(store);
  env._getState().report.title='復元前の大会';
  const prevRaw=JSON.stringify(env._getState());
  env._ls.setItem('shogi_v4',prevRaw);
  env._getState().report.title='取り込んだ大会';
  env._ls.setItem('shogi_v4',JSON.stringify(env._getState()));
  assert(env.restoreTournamentRaw(prevRaw)===true, 'P18-1 復元前の生バイトへ戻せたら true');
  assert(env._ls.getItem('shogi_v4')===prevRaw, 'P18-2 localStorage が復元前とバイト一致する');
  assert(env.restoreTournamentRaw(null)===true, 'P18-3 元が「大会データ無し」なら削除で戻せる');
  assert(!env._ls.getItem('shogi_v4'), 'P18-4 キーごと削除される');
}
{
  // 書き込みが通らない端末では巻き戻し失敗を false で返す（成功と偽らない）
  const store={};
  const env=loadEnv(store);
  const prevRaw=JSON.stringify(env._getState());
  env._ls.setItem('shogi_v4','取り込んだ別の中身');
  env._ls.setItem=function(){ throw new Error('QuotaExceeded(mock)'); };
  assert(env.restoreTournamentRaw(prevRaw)===false, 'P18-5 書き戻せなければ false（「戻したつもり」で成功を報告しない）');
}
{
  // 既に復元前と同じなら書かずに true（取り込みの setItem が throw して旧バイトが残った場合。
  //   ここで書きに行くと同じ故障で失敗し、実際は無傷なのに「中途半端かもしれない」と誤警告する）
  const store={};
  const env=loadEnv(store);
  const prevRaw=JSON.stringify(env._getState());
  env._ls.setItem('shogi_v4',prevRaw);
  env._ls.setItem=function(){ throw new Error('QuotaExceeded(mock)'); };
  assert(env.restoreTournamentRaw(prevRaw)===true, 'P18-18 既に復元前と同じなら書かずに true（書けない端末でも誤警告しない）');
  assert(env._ls.getItem('shogi_v4')===prevRaw, 'P18-19 中身は変わらない');
}
{
  const im4=RAW.match(/function importTournamentBackupFromText\([\s\S]*?\n\}/);
  const b4=im4?im4[0]:'';
  assert(/prevStateRaw\s*=\s*localStorage\.getItem\(STORAGE_KEY\)/.test(b4), 'P18-6 照合対象として localStorage の生バイトを控えている');
  assert(/restoreTournamentRaw\(prevStateRaw\)/.test(b4), 'P18-7 大会データ側も巻き戻す');
  assert(/rolledBack\s*=\s*cpRolledBack\s*&&\s*stRolledBack/.test(b4), 'P18-8 「元のまま」と言えるのは両方戻せたときだけ');
  assert(b4.indexOf('applyLoadedJson(prevStateJson)')<b4.indexOf('restoreTournamentRaw(prevStateRaw)'),
    'P18-9 生バイトの書き戻しは applyLoadedJson の後（その save() に上書きされないため）');
  // builder は localStorage を読まない（pure）。読むのは bind 層だけ。
  const bb=RAW.match(/function buildTournamentBackupObject\([\s\S]*?\n\}/);
  const bbody=bb?bb[0]:'';
  assert(/function buildTournamentBackupObject\(s,nowIso,clubProfile\)/.test(RAW), 'P18-10 clubProfile は引数注入');
  assert(bbody.indexOf('readClubProfileRaw')<0&&bbody.indexOf('localStorage')<0, 'P18-11 builder は localStorage を読まない（同じ引数なら同じ結果）');
  assert(/function serializeTournamentBackup\(s,nowIso,clubProfile\)/.test(RAW), 'P18-12 serialize も clubProfile を受け取って渡すだけ');
  const ex=RAW.match(/function exportTournamentBackup\(\)[\s\S]*?\n\}/);
  assert(/serializeTournamentBackup\(state,now\.toISOString\(\),readClubProfileRaw\(\)\)/.test(ex?ex[0]:''), 'P18-13 読むのは bind 層（exportTournamentBackup）だけ');
}
{
  // 機能: 渡さなければ club_profile は null（端末の既定が snapshot に紛れ込まない）
  const env=loadEnv({});
  makeMatsumotoState(env);
  assert(env.saveClubProfile(env.buildClubProfileFromState())===true, 'P18-14 前提: 端末に既定がある');
  const snap=env.normalizeState(JSON.parse(JSON.stringify(env._getState())));
  const noProf=env.buildTournamentBackupObject(snap,'2026-08-11T00:00:00.000Z');
  assert(noProf.local.club_profile===null, 'P18-15 渡さなければ club_profile は null（端末の既定を勝手に付けない）');
  const withProf=env.buildTournamentBackupObject(snap,'2026-08-11T00:00:00.000Z',env.readClubProfileRaw());
  assert(withProf.local.club_profile&&withProf.local.club_profile.report.title==='松本支部月例将棋大会', 'P18-16 渡せば同梱される');
  assert(JSON.stringify(env.buildTournamentBackupObject(snap,'2026-08-11T00:00:00.000Z'))===JSON.stringify(noProf), 'P18-17 同じ引数なら同じ結果（pure）');
}

// ---- P9: resetAll の旧クラス DOM 差分掃除（構造 pin） ----
{
  const m=RAW.match(/function resetAll\(\)[\s\S]*?\n\}\n/);
  const body=m?m[0]:'';
  assert(body.indexOf('cleanupStaleClassDom')>=0, 'P9-1 resetAll に旧クラスの DOM 差分掃除（cleanupStaleClassDom）がある');
  assert(body.indexOf('_oldClasses')>=0, 'P9-2 差し替え前の旧クラス集合を控えてから差分を取る');
  assert(body.indexOf('readClubProfileRaw()')>=0, 'P9-3 resetAll は実行時に profile を読み直す（read-at-use）');
  // 実装パネル指摘: 「集合が増える resetAll → undo」で幽霊 section が残る新規経路への対応
  const um=RAW.match(/function undoLastReset\(\)[\s\S]*?\n\}\n/);
  const ubody=um?um[0]:'';
  assert(ubody.indexOf('cleanupStaleClassDom')>=0, 'P9-4 undoLastReset にも DOM 差分掃除がある（増える reset→undo の幽霊防止）');
}

console.log('\n  CLUB-PROFILE-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
