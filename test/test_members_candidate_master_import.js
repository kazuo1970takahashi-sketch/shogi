#!/usr/bin/env node
// SHOGI-TOUR-APPHQ-003H-2-D — members 形式 参加者候補マスタ読込 単体テスト
//
// 目的（依頼書「テスト」節）:
//   完全架空の members 形式 JSON を「参加者候補マスタ」として読み込めること、
//   かつ大会進行データ（players/pairings/results/round/started）を一切変更せず、
//   localStorage に保存され、再読込で残ることを純関数レベルで検証する。
//
// このテストは test/fixtures/import/branch_master_candidate_synthetic.json
// （完全架空）のみを使う。実データ・実名・実マスタは一切参照しない。
//
// 検証観点:
//   G1 形式判定:     members 形式 → 'branch_master' / 大会データ(players) → 'tournament' は拒否
//   G2 読込先:       候補マスタ(shogi_branch_master)へ保存。大会state(shogi_v4)は不変
//   G3 フィールド保持: name/yomi/last_class/city/note/deleted 保持、member 真偽値変換、
//                    grade 段位は会費区分へ持ち込まない（既定 ippan）、attendance_count 非取込（再計算）
//   G4 deleted 除外:  deleted=true は墓石として保持されるが候補(findMemberCandidates)には出ない
//   G5 履歴非取込:    履歴欄を持たない member は安全既定（count=0 / tournament_ids=[]）
//   G6 マージ非破壊:  id 一致は既存側優先、未存在は追加
//   G7 禁止項目排除:  address/phone/email/birthday/paymentHistory/pastResults 等は保存 member に混入しない
//   G8 架空のみ:      保存 member は架空命名規則のみ（実データ風の固定値なし）
//   G9 確認ガード:    上書きインポートに confirm ガードが存在する（ページソース確認）

const fs = require('fs');
const path = require('path');

function extractScripts(p) {
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeLocalStorage() {
  return {
    _: {},
    getItem(k){ return Object.prototype.hasOwnProperty.call(this._, k) ? this._[k] : null; },
    setItem(k, v){ this._[k] = String(v); },
    removeItem(k){ delete this._[k]; }
  };
}

function makeContext() {
  function makeElem(id) {
    return {
      id: id || '', _innerHTML: '',
      style: { _cssText:'', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      className: '',
      get innerHTML(){return this._innerHTML;}, set innerHTML(v){this._innerHTML=v;},
      addEventListener(){}, appendChild(){}, remove(){}, focus(){}, blur(){}, click(){},
      value: '', firstChild: null, disabled: false, checked: false,
      getAttribute(){return null;}, setAttribute(){}, querySelector(){return null;}, querySelectorAll(){return [];}
    };
  }
  const elements = {};
  const docMock = {
    getElementById(id){ if(!elements[id]) elements[id]=makeElem(id); return elements[id]; },
    createElement(){ return makeElem(); },
    getElementsByName(){ return []; },
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){}, removeEventListener(){}, querySelectorAll(){return [];}
  };
  const winMock = { innerWidth: 1024 };
  const cryptoMock = {
    randomUUID(){
      const chars='abcdef0123456789'; let s='';
      for(let i=0;i<32;i++) s+=chars[Math.floor(Math.random()*chars.length)];
      return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20,32);
    }
  };
  return { document: docMock, window: winMock, localStorage: makeLocalStorage(), crypto: cryptoMock };
}

function loadEnv(p) {
  const ctx = makeContext();
  const js = extractScripts(p);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       STORAGE_KEY: STORAGE_KEY,
       BRANCH_MASTER_KEY: BRANCH_MASTER_KEY,
       createEmptyBranchMaster: createEmptyBranchMaster,
       normalizeBranchMaster: normalizeBranchMaster,
       detectImportFormat: detectImportFormat,
       applyOverwriteImport: applyOverwriteImport,
       applyMergeImport: applyMergeImport,
       loadBranchMaster: loadBranchMaster,
       saveBranchMaster: saveBranchMaster,
       findMemberCandidates: findMemberCandidates,
       todayYmd: todayYmd,
       _localStorage: localStorage
     };`
  );
  return fn(ctx.document, ctx.window, ctx.localStorage, ctx.crypto,
            ()=>{}, ()=>true, ()=>'', function(){}, function(){},
            {createObjectURL:()=>'',revokeObjectURL:()=>{}}, console, Promise);
}

const targetPath = process.argv[2];
if (!targetPath) { console.error('Usage: node test_members_candidate_master_import.js <html>'); process.exit(1); }

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'import', 'branch_master_candidate_synthetic.json');
const RAW_HTML = fs.readFileSync(targetPath, 'utf8');

let pass=0, fail=0;
function ok(){ pass++; }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(); else ng(msg); }
function assertEq(a, b, msg){ if(JSON.stringify(a)===JSON.stringify(b)) ok(); else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a)); }

const FORBIDDEN_KEYS = ['address','住所','phone','tel','電話','電話番号','email','mail','メール',
  'birthday','birthdate','生年月日','paymentHistory','支払履歴','pastResults','過去成績'];

function byId(members, id){ return members.filter(function(m){return m.id===id;})[0]||null; }

// ------------------------------------------------------------------
// Fixture self-check（fixture が members 形式・完全架空であること）
// ------------------------------------------------------------------
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
{
  assert(FIXTURE && Array.isArray(FIXTURE.members), 'F0 fixture は members 配列を持つ');
  assert(FIXTURE.members.length === 5, 'F0 fixture member 数 = 5');
  for (const m of FIXTURE.members) {
    assert(/^架空 /.test(m.name), 'F0 fixture name は架空命名: '+m.name);
  }
}

// ------------------------------------------------------------------
// G1 形式判定
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  assertEq(env.detectImportFormat(FIXTURE), 'branch_master', 'G1 members 形式 → branch_master');
  assertEq(env.detectImportFormat({players:{A:[],B:[]}}), 'tournament', 'G1 大会データ(players) → tournament');
  assertEq(env.detectImportFormat({foo:1}), 'unknown', 'G1 不明形式 → unknown');
  const rejected = env.applyOverwriteImport({players:{A:[],B:[]}});
  assert(rejected.success===false && rejected.error==='tournament_format', 'G1 大会データは上書きインポート拒否(tournament_format)');
}

// ------------------------------------------------------------------
// G2 読込先＝候補マスタ / 大会state不変 / 保存・再読込で残る
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  // 進行中の大会データを seed（players/pairings/results/started を含む）
  const tournamentState = {
    rounds:4, started:true,
    players:{A:[{id:'p1',name:'既存選手',cls:'A',member:'member',grade:'ippan',entry_no:1}],B:[]},
    pairings:{A:[{p1:'p1',p2:'p1',winner:null,lastModifiedBy:'auto'}],B:[]},
    results:{A:[[]],B:[]},
    classes:[{id:'A',label:'A級'},{id:'B',label:'B級'}]
  };
  env._localStorage.setItem(env.STORAGE_KEY, JSON.stringify(tournamentState));
  const stateSnapshot = env._localStorage.getItem(env.STORAGE_KEY);

  // 取込前は候補マスタ空
  const before = env.loadBranchMaster();
  assert(before.members.length===0, 'G2 取込前は候補マスタ空');

  // 上書きインポート → saveBranchMaster（UI handler が confirm 後に行う処理と同一）
  const res = env.applyOverwriteImport(FIXTURE);
  assert(res.success===true, 'G2 members 形式の上書きインポート成功');
  env.saveBranchMaster(res.newMaster);

  // 候補マスタ(shogi_branch_master)に保存された
  assert(env._localStorage.getItem(env.BRANCH_MASTER_KEY)!==null, 'G2 候補マスタが shogi_branch_master に保存される');

  // 大会state(shogi_v4)は完全に不変（byte identical）= pairings/results/round/started 非変更
  assertEq(env._localStorage.getItem(env.STORAGE_KEY), stateSnapshot, 'G2 大会state(shogi_v4)は不変（pairings/results/round/started 非変更）');

  // 当日参加者は自動登録されない（players は seed のまま 1 名、22→自動追加しない）
  const stateAfter = JSON.parse(env._localStorage.getItem(env.STORAGE_KEY));
  assert(stateAfter.players.A.length===1 && stateAfter.players.B.length===0, 'G2 当日参加者は自動登録されない（players 不変）');

  // 再読込で候補マスタが残る（永続）
  const reloaded = env.loadBranchMaster();
  const liveCount = reloaded.members.filter(function(m){return !m.deleted;}).length;
  assert(reloaded.members.length===5 && liveCount===4, 'G2 再読込で候補マスタが残る（5件 / 生存4 + 墓石1）');
}

// ------------------------------------------------------------------
// G3 フィールド保持・変換
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  const res = env.applyOverwriteImport(FIXTURE);
  env.saveBranchMaster(res.newMaster);
  const M = env.loadBranchMaster().members;

  const m1 = byId(M, 'synthetic-001');
  assert(!!m1, 'G3 synthetic-001 が保持される');
  assertEq(m1.name, '架空 太郎', 'G3 name 保持');
  assertEq(m1.yomi, 'かくう たろう', 'G3 yomi 保持');
  assertEq(m1.last_class, 'A', 'G3 last_class 保持(A)');
  assertEq(m1.city, '架空市', 'G3 city 保持');
  assertEq(m1.member, 'member', 'G3 member:true → 支部員(member)');

  const m2 = byId(M, 'synthetic-002');
  assertEq(m2.member, 'other', 'G3 member:false → 一般(other)【真偽値対応の要】');
  assertEq(m2.last_class, 'B', 'G3 last_class 保持(B)');

  const m3 = byId(M, 'synthetic-003');
  assertEq(m3.note, 'テスト用メモ', 'G3 note 保持');
  assertEq(m3.grade, 'ippan', 'G3 grade 段位"二段"は会費区分へ持込まず既定 ippan');
  assertEq(m3.attendance_count, 2, 'G3 attendance_count は入力(99)を取り込まず tournament_ids 長で再計算(=2)');
}

// ------------------------------------------------------------------
// G4 deleted=true は墓石保持・候補非表示
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  const res = env.applyOverwriteImport(FIXTURE);
  env.saveBranchMaster(res.newMaster);
  const master = env.loadBranchMaster();

  const m4 = byId(master.members, 'synthetic-004');
  assert(!!m4 && m4.deleted===true, 'G4 deleted member は墓石として保持される');

  // 候補検索: 削除済みの名前では候補に出ない
  const candDeleted = env.findMemberCandidates({name:'架空 三郎'}, master);
  assert(candDeleted.length===0, 'G4 deleted member は候補(findMemberCandidates)に出ない');
  // 生存 member は候補に出る
  const candLive = env.findMemberCandidates({name:'架空 太郎'}, master);
  assert(candLive.length===1 && candLive[0].id==='synthetic-001', 'G4 生存 member は候補に出る');
}

// ------------------------------------------------------------------
// G5 履歴欄を持たない member は安全既定（履歴を捏造・取込しない）
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  const res = env.applyOverwriteImport(FIXTURE);
  env.saveBranchMaster(res.newMaster);
  const m1 = byId(env.loadBranchMaster().members, 'synthetic-001');
  assertEq(m1.attendance_count, 0, 'G5 履歴なし member の attendance_count は 0');
  assertEq(m1.tournament_ids, [], 'G5 履歴なし member の tournament_ids は []');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(m1.last_attended), 'G5 last_attended は安全既定(YMD)');
  assertEq(m1.deleted_at, null, 'G5 非削除 member の deleted_at は null');
}

// ------------------------------------------------------------------
// G6 マージは非破壊（id 一致は既存側優先、未存在は追加）
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  // 既存マスタ: synthetic-001 を別名で保持
  const current = env.createEmptyBranchMaster();
  current.members.push(env.normalizeBranchMaster({
    schema_version:1, members:[{id:'synthetic-001', name:'既存 太郎', member:'member', last_class:'A'}]
  }).members[0]);

  const mr = env.applyMergeImport(FIXTURE, current);
  assert(mr.success===true, 'G6 マージ成功');
  const merged = byId(mr.newMaster.members, 'synthetic-001');
  assertEq(merged.name, '既存 太郎', 'G6 id 一致は既存側 name を維持（非破壊）');
  assert(!!byId(mr.newMaster.members, 'synthetic-002'), 'G6 未存在 member は追加される');
  assert(mr.summary.added>=1 && mr.summary.merged===1, 'G6 summary: 追加>=1 / 統合=1');
}

// ------------------------------------------------------------------
// G7 禁止項目は保存 member に混入しない（normalize ホワイトリスト）
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  const res = env.applyOverwriteImport(FIXTURE);
  env.saveBranchMaster(res.newMaster);
  const m5 = byId(env.loadBranchMaster().members, 'synthetic-005');
  assert(!!m5, 'G7 synthetic-005 が保持される');
  let leaked = [];
  for (const k of FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(m5, k)) leaked.push(k);
  }
  assertEq(leaked, [], 'G7 禁止項目が保存 member に混入しない');
  // 保存された JSON 文字列にも禁止値が残らない
  const persistedRaw = env._localStorage.getItem(env.BRANCH_MASTER_KEY);
  assert(persistedRaw.indexOf('example.invalid')<0 && persistedRaw.indexOf('paymentHistory')<0,
    'G7 保存 JSON に禁止項目の値/キーが残らない');
}

// ------------------------------------------------------------------
// G8 保存 member は架空命名のみ（実データ風の固定値が混ざらない）
// ------------------------------------------------------------------
{
  const env = loadEnv(targetPath);
  const res = env.applyOverwriteImport(FIXTURE);
  env.saveBranchMaster(res.newMaster);
  const M = env.loadBranchMaster().members;
  let allSynthetic = true;
  for (const m of M) { if (!/^架空 /.test(m.name)) allSynthetic = false; }
  assert(allSynthetic, 'G8 保存 member 名はすべて架空命名(架空 ...)');
}

// ------------------------------------------------------------------
// G9 上書きインポートに confirm ガードが存在する（ページソース確認）
// ------------------------------------------------------------------
{
  assert(RAW_HTML.indexOf('現在のマスタをすべて置き換えます')>=0,
    'G9 上書きインポートに confirm ガード文言が存在する');
  assert(RAW_HTML.indexOf('受付時に「過去参加者から選ぶ」で当日参加者を選択してください')>=0,
    'G9 読込完了メッセージに受付誘導（当日参加者は別途選択）が含まれる');
}

// ------------------------------------------------------------------
console.log('  members 候補マスタ取込テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if (fail>0) process.exit(1);
process.exit(0);
