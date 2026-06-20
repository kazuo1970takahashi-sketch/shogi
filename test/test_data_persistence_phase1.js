#!/usr/bin/env node
// DATA-PERSISTENCE Phase 1（JSON エクスポート/インポート）受入テスト。
//   正本仕様: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md §5 Phase 1。
//   スコープ＝ shogi_v4.html へ「大会データのバックアップ（schema_version 付き JSON
//   エクスポート/インポート）」を追加のみで実装した分の検証。既存 save/load/normalizeState/
//   saveData/loadData/applyLoadedJson は改変しない（後方互換 = 非回帰）。
//
//   受入条件（CONFIRMED §5 Phase 1）と対応テスト:
//     E. 大会終了時点の state を JSON で保存できる（schema_version 付き）……… E1..E6
//     R. JSON から大会状態を復元できる（既存 normalizeState 経路を再利用）……… R1..R4
//     P. 氏名を含むローカルデータと匿名データ(member_id＋成績)を分離できる構造 … P1..P3
//     V. import 時に schema_version を検証し、不一致/不正を安全に拒否 ………… V1..V5
//     M. 対局情報(matches 相当)を JSON に含める ……………………………… M1..M2
//     N. 既存 localStorage 運用(shogi_v4 等)を壊さない（追加のみ）………… N1..N3
//   データは完全架空のみ（架空 …）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_data_persistence_phase1.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（test_class_variable_001.js と同方針）。
function makeContext(){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function gatherText(node){
    if(node==null)return '';
    if(node.nodeType===3)return node.textContent;
    var s='', ch=node.childNodes||[];
    for(var i=0;i<ch.length;i++)s+=gatherText(ch[i]);
    return s;
  }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'',
      type:'', selected:false, checked:false, disabled:false, hidden:false,
      style:{}, _attrs:{}, _innerHTML:'', childNodes:[], parentNode:null, files:[],
      appendChild:function(c){ if(c)c.parentNode=this; this.childNodes.push(c); return c; },
      insertBefore:function(c){ if(c)c.parentNode=this; this.childNodes.unshift(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); if(c)c.parentNode=null; return c; },
      remove:function(){ if(this.parentNode){ var i=this.parentNode.childNodes.indexOf(this); if(i>=0)this.parentNode.childNodes.splice(i,1); this.parentNode=null; } },
      addEventListener:function(){}, removeEventListener:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      removeAttribute:function(k){ delete this._attrs[k]; },
      focus:function(){}, blur:function(){}, click:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
      get firstChild(){ return this.childNodes[0]||null; },
      get lastChild(){ return this.childNodes[this.childNodes.length-1]||null; },
      get children(){ return this.childNodes.filter(function(n){return n.nodeType===1;}); },
      get textContent(){ return gatherText(this); },
      set textContent(v){ this.childNodes=[makeText(v)]; },
      get innerHTML(){ return this._innerHTML; },
      set innerHTML(v){ this._innerHTML=String(v); if(v===''){ for(var i=0;i<this.childNodes.length;i++)this.childNodes[i].parentNode=null; this.childNodes=[]; } }
    };
  }
  var elements={};
  var docMock={
    _elements:elements,
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    location:{hash:''},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  function BlobMock(parts,opt){ return {_isMockBlob:true, _content:(parts&&parts[0])?String(parts[0]):'', type:opt&&opt.type}; }
  var urlMock={ createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){} };
  return { document:docMock, window:winMock, localStorage:localStorageMock, Blob:BlobMock, URL:urlMock };
}

function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  const alerts = [];
  const confirms = [];
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState, save:save, load:load,
       STORAGE_KEY:STORAGE_KEY, BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       getWins:getWins,
       applyLoadedJson:applyLoadedJson,
       BACKUP_SCHEMA_VERSION:BACKUP_SCHEMA_VERSION, BACKUP_KIND:BACKUP_KIND,
       buildBackupAnonymous:buildBackupAnonymous,
       buildTournamentBackupObject:buildTournamentBackupObject,
       serializeTournamentBackup:serializeTournamentBackup,
       parseTournamentBackup:parseTournamentBackup,
       exportTournamentBackup:exportTournamentBackup,
       importTournamentBackupFromText:importTournamentBackupFromText,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  // FileReader mock: readAsText を同期的に onload へ流す。
  function FileReaderMock(){ this.onload=null; }
  FileReaderMock.prototype.readAsText=function(file){
    var self=this;
    var text=(file&&typeof file._text==='string')?file._text:'';
    if(self.onload)self.onload({target:{result:text}});
  };
  const confirmFn = function(m){ confirms.push(m); return ('confirm' in opts) ? opts.confirm : true; };
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){} };
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(m){ alerts.push(m); }, confirmFn, function(){ return ''; },
    FileReaderMock, ctx.Blob, ctx.URL, consoleMock, Promise, function(){}
  );
  api._ctx = ctx;
  api._alerts = alerts;
  api._confirms = confirms;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空フル fixture：A=2名(うち1名 member_id 付)・B=2名、1回戦結果あり、報告書フォーム一部入力。
function fxFull(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくうたろう',member_id:'m-a1'},
      {id:'a2',name:'架空次郎',cls:'A',member:'other',grade:'chu',entry_no:2,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ]},
    rounds:4,
    pairings:{A:[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}],B:[]},
    results:{A:[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]],B:[[{p1:'b1',p2:'b2',winner:'b2',lastModifiedBy:'auto'}]]},
    started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    report:{date:'2026-05-18',place:'架空会館',sei:'架空優勝者',fuku:'架空準優勝',note:'架空メモ',prize:7000}
  };
}

function stable(x){ return JSON.stringify(x); }

// ============================================================
// E. エクスポート（schema_version 付き JSON 保存）
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxFull());
  const obj = env.buildTournamentBackupObject(s,'2026-06-20T00:00:00.000Z');
  assert(obj.schema_version===env.BACKUP_SCHEMA_VERSION && obj.schema_version===1, 'E1 export に schema_version(=1) を持つ');
  assert(obj.kind===env.BACKUP_KIND && obj.kind==='shogi_tour_backup', 'E2 export に kind=shogi_tour_backup を持つ');
  assert(obj.exported_at==='2026-06-20T00:00:00.000Z', 'E3 exported_at は注入された ISO 文字列');
  assert(obj.local && obj.local.state && stable(obj.local.state)===stable(s), 'E4 local.state は入力 state と一致（復元の正本）');
  assert(obj.anonymous && Array.isArray(obj.anonymous.entries) && Array.isArray(obj.anonymous.matches), 'E5 anonymous に entries/matches 配列を持つ');

  // serialize→parse して JSON 文字列経路でも schema_version/kind が保たれる
  const json = env.serializeTournamentBackup(s,'2026-06-20T00:00:00.000Z');
  const reparsed = JSON.parse(json);
  assert(reparsed.schema_version===1 && reparsed.kind==='shogi_tour_backup', 'E6 serialize した JSON 文字列にも schema_version/kind が残る');
}

// ============================================================
// P. ローカル（氏名あり）と匿名（member_id＋成績）の分離
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxFull());
  const obj = env.buildTournamentBackupObject(s,'2026-06-20T00:00:00.000Z');
  const anonStr = stable(obj.anonymous);
  const names = ['架空太郎','架空次郎','架空花子','架空桃子','架空優勝者','架空準優勝','かくうたろう'];
  let leaked=false;
  for(var i=0;i<names.length;i++){ if(anonStr.indexOf(names[i])>=0)leaked=true; }
  assert(!leaked, 'P1 anonymous セクションに氏名・ふりがな・報告書実名が一切含まれない');

  // anonymous.entries は member_id＋成績（氏名なし）
  const entA1 = obj.anonymous.entries.filter(function(e){return e.player_ref==='a1';})[0];
  assert(entA1 && entA1.member_id==='m-a1' && !('name' in entA1), 'P2 anonymous.entries は member_id を持ち name フィールドを持たない');
  // ローカル側には氏名が残る（分離であって欠落ではない）
  const localStr = stable(obj.local.state);
  assert(localStr.indexOf('架空太郎')>=0 && localStr.indexOf('架空優勝者')>=0, 'P3 local.state には氏名・報告書が保持される（分離＝両立）');
}

// ============================================================
// M. 対局情報（matches 相当）を JSON に含める
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxFull());
  const obj = env.buildTournamentBackupObject(s,'2026-06-20T00:00:00.000Z');
  // results は A 1局・B 1局 = 計2局。anonymous.matches に投影される。
  assert(obj.anonymous.matches.length===2, 'M1 anonymous.matches に results の全対局(2局)が投影される');
  const mA = obj.anonymous.matches.filter(function(m){return m.cls==='A';})[0];
  assert(mA && mA.round===1 && mA.p1_ref==='a1' && mA.p2_ref==='a2' && mA.winner_ref==='a1' && mA.p1_member_id==='m-a1', 'M2 match は round(1始まり)/対局者ref/勝者ref/member_id を匿名で含む');
  // local.state 側にも対局情報(pairings/results)がそのまま含まれる
  assert(Array.isArray(obj.local.state.results.A) && obj.local.state.results.A[0][0].winner==='a1' && Array.isArray(obj.local.state.pairings.A), 'M3 local.state に pairings/results（対局情報）が保持される');

  // 成績集計（wins/games）が results と整合（getWins と一致）
  env._setState(s);
  const winsA = env.getWins('A');
  const eA1 = obj.anonymous.entries.filter(function(e){return e.player_ref==='a1';})[0];
  assert(eA1.wins===winsA['a1'] && eA1.wins===1 && eA1.games===1, 'M4 anonymous.entries.wins/games が results 集計(getWins)と一致');
}

// ============================================================
// V. import 検証（schema_version 不一致 / 不正を安全に拒否）
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxFull());
  const json = env.serializeTournamentBackup(s,'2026-06-20T00:00:00.000Z');

  const okRes = env.parseTournamentBackup(json);
  assert(okRes.ok===true && stable(okRes.state)===stable(s), 'V1 正しい backup は ok:true で state を返す');

  const bad = JSON.parse(json); bad.schema_version=999;
  const v2 = env.parseTournamentBackup(JSON.stringify(bad));
  assert(v2.ok===false && v2.reason==='schema_mismatch' && /バージョン/.test(v2.message), 'V2 schema_version 不一致は reason=schema_mismatch で拒否+メッセージ');

  const v3 = env.parseTournamentBackup('{ this is not valid json ');
  assert(v3.ok===false && v3.reason==='invalid_json', 'V3 不正 JSON は reason=invalid_json で拒否');

  const wrongKind = JSON.parse(json); wrongKind.kind='something_else';
  const v4 = env.parseTournamentBackup(JSON.stringify(wrongKind));
  assert(v4.ok===false && v4.reason==='wrong_kind', 'V4 種別不一致は reason=wrong_kind で拒否');

  const noState = {schema_version:1, kind:'shogi_tour_backup', local:{}};
  const v5 = env.parseTournamentBackup(JSON.stringify(noState));
  assert(v5.ok===false && v5.reason==='no_state', 'V5 local.state 欠落は reason=no_state で拒否');

  // 旧 saveData 形式（生 state・schema 無し）は backup としては拒否される（混同防止）
  const rawState = JSON.stringify(s);
  const vRaw = env.parseTournamentBackup(rawState);
  assert(vRaw.ok===false, 'V6 旧 saveData 形式(生 state)は backup として拒否される（kind 不一致）');
}

// ============================================================
// R. 復元（既存 normalizeState 経路の再利用 / 上書き確認ガード）
// ============================================================
{
  // R1: serialize→parse の往復で normalize 恒等（フル fidelity）
  const env = loadEnv();
  const s = env.normalizeState(fxFull());
  const json = env.serializeTournamentBackup(s,'2026-06-20T00:00:00.000Z');
  const res = env.parseTournamentBackup(json);
  assert(stable(env.normalizeState(res.state))===stable(env.normalizeState(s)), 'R1 export→import 往復後 normalizeState が恒等（players/pairings/results/report 完全復元）');
}
{
  // R2: coordinator import（confirm=true）で global state を上書き復元・localStorage に保存
  const env = loadEnv({confirm:true});
  env._setState(env.normalizeState({players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]},classes:[{id:'A',name:'A',started:false},{id:'B',name:'B',started:false}],report:{}}));
  const s = env.normalizeState(fxFull());
  const json = env.serializeTournamentBackup(s,'2026-06-20T00:00:00.000Z');
  const ret = env.importTournamentBackupFromText(json);
  const after = env._getState();
  assert(ret===true, 'R2-1 import は true を返す');
  assert(after.players.A.length===2 && after.players.A[0].name==='架空太郎', 'R2-2 global state がバックアップ内容で上書き復元される');
  assert(env._confirms.length===1, 'R2-3 上書き前に confirm ガードを通る');
  // localStorage shogi_v4 にも保存される（applyLoadedJson 内 save() 再利用）
  const persisted = env._ctx.localStorage.getItem(env.STORAGE_KEY);
  assert(persisted && JSON.parse(persisted).players.A.length===2, 'R2-4 復元結果が localStorage(shogi_v4) に保存される');
}
{
  // R3: schema 不一致は復元せず state を変えない
  const env = loadEnv({confirm:true});
  const initial = env.normalizeState({players:{A:[{id:'x1',name:'架空既存',cls:'A',member:'member',grade:'ippan',entry_no:1}],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]},classes:[{id:'A',name:'A',started:false},{id:'B',name:'B',started:false}],report:{}});
  env._setState(initial);
  const before = stable(env._getState());
  const bad = JSON.parse(env.serializeTournamentBackup(env.normalizeState(fxFull()),'2026-06-20T00:00:00.000Z')); bad.schema_version=2;
  const ret = env.importTournamentBackupFromText(JSON.stringify(bad));
  assert(ret===false, 'R3-1 schema 不一致 import は false を返す');
  assert(stable(env._getState())===before, 'R3-2 拒否時は state を一切変更しない');
  assert(env._confirms.length===0, 'R3-3 拒否時は confirm すら出さない（検証失敗が先）');
}
{
  // R4: confirm=false（ユーザがキャンセル）なら復元しない
  const env = loadEnv({confirm:false});
  const initial = env.normalizeState({players:{A:[{id:'x1',name:'架空既存',cls:'A',member:'member',grade:'ippan',entry_no:1}],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]},classes:[{id:'A',name:'A',started:false},{id:'B',name:'B',started:false}],report:{}});
  env._setState(initial);
  const before = stable(env._getState());
  const json = env.serializeTournamentBackup(env.normalizeState(fxFull()),'2026-06-20T00:00:00.000Z');
  const ret = env.importTournamentBackupFromText(json);
  assert(ret===false, 'R4-1 confirm キャンセルで import は false');
  assert(stable(env._getState())===before, 'R4-2 confirm キャンセル時は state を変更しない（誤操作データ消失防止）');
}

// ============================================================
// N. 既存挙動の非回帰（追加のみ）
// ============================================================
{
  const env = loadEnv({confirm:true});
  // N1: 既存 applyLoadedJson は生 state を従来どおり復元できる（backup wrapper でなくても動く）
  env._setState(env.normalizeState({players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]},classes:[{id:'A',name:'A',started:false},{id:'B',name:'B',started:false}],report:{}}));
  env.applyLoadedJson(JSON.stringify(fxFull()));
  assert(env._getState().players.A.length===2, 'N1 既存 applyLoadedJson（生 state 取り込み）は従来どおり動作（非回帰）');
  // N2: localStorage キーは変更なし
  assert(env.STORAGE_KEY==='shogi_v4' && env.BRANCH_MASTER_KEY==='shogi_branch_master', 'N2 既存 localStorage キー(shogi_v4 / shogi_branch_master)は不変');
  // N3: 空/壊れ state でも anonymous builder は throw しない（堅牢）
  assert(stable(env.buildBackupAnonymous(null))==='{"classes":[],"entries":[],"matches":[]}', 'N3 buildBackupAnonymous(null) は空構造を返し throw しない');
  assert(stable(env.buildBackupAnonymous({classes:[{id:'A'}]}))==='{"classes":["A"],"entries":[],"matches":[]}', 'N3b players 欠落クラスでも空 entries/matches で堅牢');
}

console.log('');
console.log('  DATA-PERSISTENCE-PHASE1 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0)process.exit(1);
