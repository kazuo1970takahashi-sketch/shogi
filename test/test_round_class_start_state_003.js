#!/usr/bin/env node
// SHOGI-TOUR ROUND-CLASS-START-003: state/helper/normalize 単体テスト
//
// 対象: spec docs/specs/20260517_round_class_start_state_spec.md §8 / §9 / §10 / §12
//   - normalizeClasses(raw)                       — §9.2 / §9.3
//   - emptyClassDict(classes, initialValue)       — §7.3 / §10.1
//   - isClassStarted(classId)                     — §10.1
//   - setClassStarted(classId, value)             — §8.2
//   - syncGlobalStartedFromClasses()              — §8.2
//   - classStartedInPersisted(persisted, classId) — §12.7
//   - normalizeState(raw) の classes 補完 / 互換  — §9.4 / §8.3
//   - readPersistedState() が normalized state を返す — §12.6
//
// 引数: <target.html>

const fs = require('fs');
const path = require('path');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeElem(){return{_innerHTML:'',style:{cssText:'',display:''},className:'',
    get innerHTML(){return this._innerHTML;},set innerHTML(v){this._innerHTML=v;},
    addEventListener(){},appendChild(){},remove(){},focus(){},click(){},value:'',firstChild:null};}
  return {
    document:{getElementById(){return makeElem();},createElement(){return makeElem();},body:{appendChild(){},removeChild(){}},addEventListener(){}},
    window:{innerWidth:1024},
    localStorage:{_:{},getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;},setItem(k,v){this._[k]=String(v);},removeItem(k){delete this._[k];}},
    alert(){},confirm(){return true;},prompt(){return null;},
    FileReader:function(){},Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}}
  };
}

function makeSandbox(jsCode){
  const ctx = makeContext();
  const warnCalls = [];
  const consoleMock = {log:function(){},error:function(){},warn:function(){warnCalls.push(Array.prototype.slice.call(arguments).map(String).join(' '));}};
  const factory = new Function(
    'document','window','localStorage','alert','confirm','prompt','FileReader','Blob','URL','console',
    `${jsCode}
     return {
       normalizeClasses: normalizeClasses,
       emptyClassDict: emptyClassDict,
       normalizeState: normalizeState,
       syncGlobalStartedFromClasses: syncGlobalStartedFromClasses,
       isClassStarted: isClassStarted,
       setClassStarted: setClassStarted,
       classStartedInPersisted: classStartedInPersisted,
       readPersistedState: readPersistedState,
       resetTournamentProgressOnly: resetTournamentProgressOnly,
       _setState: function(s){state = s;},
       _getState: function(){return state;},
       _localStorage: localStorage,
       STORAGE_KEY: STORAGE_KEY
     };`
  );
  return {
    api: factory(ctx.document, ctx.window, ctx.localStorage, ctx.alert, ctx.confirm, ctx.prompt, ctx.FileReader, ctx.Blob, ctx.URL, consoleMock),
    ctx,
    warnCalls
  };
}

const TARGET = process.argv[2] || 'shogi_v4.html';
const env = makeSandbox(extractScripts(TARGET));
const api = env.api;

let pass = 0, fail = 0;
function ok(){pass++;}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond, msg){if(cond)ok(); else ng(msg);}
function eq(actual, expected, msg){
  if(JSON.stringify(actual)===JSON.stringify(expected))ok();
  else ng(msg+' (期待:'+JSON.stringify(expected)+' 実際:'+JSON.stringify(actual)+')');
}

console.log('\n=== ROUND-CLASS-START-003 state/helper/normalize ===');

// ============================================================
// 1. normalizeClasses(raw)
// ============================================================
console.log('\n--- 1. normalizeClasses(raw) ---');
{
  // 1-1. classes 無し旧データ → A/B 補完 (started=false)
  const c1 = api.normalizeClasses({});
  eq(c1.length, 2, '1-1a 旧データ(classes 無): 2 件返る');
  eq(c1[0].id, 'A', '1-1b A クラスが補完される');
  eq(c1[1].id, 'B', '1-1c B クラスが補完される');
  eq(c1[0].name, 'Aクラス', '1-1d A の name 既定');
  eq(c1[1].name, 'Bクラス', '1-1e B の name 既定');
  eq(c1[0].started, false, '1-1f A started=false');
  eq(c1[1].started, false, '1-1g B started=false');

  // 1-2. classes あり: id/name/started を正規化
  const c2 = api.normalizeClasses({classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}]});
  eq(c2.length, 2, '1-2a classes ありデータ: 2 件返る');
  eq(c2[0].id, 'A', '1-2b id 維持');
  eq(c2[0].started, true, '1-2c started=true 維持');
  eq(c2[1].started, false, '1-2d started=false 維持');

  // 1-3. classes に name 欠落 → id+'クラス' で補完
  const c3 = api.normalizeClasses({classes:[{id:'A',started:false}]});
  eq(c3.length, 2, '1-3a A しか無い classes でも B 補完');
  eq(c3[0].name, 'Aクラス', '1-3b name 欠落は id+"クラス" 補完');

  // 1-4. classes に C が含まれる → C 追加 + A/B 補完
  const c4 = api.normalizeClasses({classes:[{id:'C',name:'Cクラス',started:false}]});
  eq(c4.length, 3, '1-4a C を含む classes: A/B も補完 → 3 件');
  assert(c4.find(c=>c.id==='C') !== undefined, '1-4b C エントリが残る');
  assert(c4.find(c=>c.id==='A') !== undefined, '1-4c A 補完');
  assert(c4.find(c=>c.id==='B') !== undefined, '1-4d B 補完');

  // 1-5. raw.players に未知 classId → classes に補完
  const c5 = api.normalizeClasses({players:{A:[],B:[],C:[]}});
  eq(c5.length, 3, '1-5a players dict から C 補完 → 3 件');
  assert(c5.find(c=>c.id==='C') !== undefined, '1-5b C が補完される');
  eq(c5.find(c=>c.id==='C').started, false, '1-5c 補完 C の started=false');

  // 1-6. 不正な classes エントリは drop
  const c6 = api.normalizeClasses({classes:[{id:'A',started:true},null,{name:'no-id'},{id:''}]});
  eq(c6.length, 2, '1-6 不正エントリ drop → A/B のみ');
  eq(c6[0].started, true, '1-6b A の started 維持');
}

// ============================================================
// 2. emptyClassDict(classes, initialValue)
// ============================================================
console.log('\n--- 2. emptyClassDict(classes, initialValue) ---');
{
  const classes = [{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false},{id:'C',name:'Cクラス',started:false}];

  // 2-1. factory で配列を生成、参照非共有
  const d1 = api.emptyClassDict(classes, function(){return [];});
  eq(Object.keys(d1).sort(), ['A','B','C'], '2-1a classId ごとに key が生成される');
  assert(Array.isArray(d1.A) && d1.A.length===0, '2-1b A は空配列');
  d1.A.push('x');
  eq(d1.B.length, 0, '2-1c factory: A への push が B に波及しない（参照非共有）');

  // 2-2. boolean 値 (primitive) は単純共有でも問題ない
  const d2 = api.emptyClassDict(classes, false);
  eq(d2.A, false, '2-2a A=false');
  eq(d2.B, false, '2-2b B=false');
  eq(d2.C, false, '2-2c C=false');

  // 2-3. 空 classes
  const d3 = api.emptyClassDict([], function(){return [];});
  eq(Object.keys(d3).length, 0, '2-3 空 classes は空 dict');

  // 2-4. classes が配列でない場合は空 dict
  const d4 = api.emptyClassDict(null, function(){return [];});
  eq(Object.keys(d4).length, 0, '2-4 classes 非配列は空 dict');
}

// ============================================================
// 3. syncGlobalStartedFromClasses()
// ============================================================
console.log('\n--- 3. syncGlobalStartedFromClasses() ---');
{
  // 3-1. 全 class 未開始 → state.started = false
  api._setState({
    classes:[{id:'A',started:false},{id:'B',started:false}],
    started:true  // 初期は意図的に true にして同期されることを確認
  });
  api.syncGlobalStartedFromClasses();
  eq(api._getState().started, false, '3-1 全 class 未開始 → state.started=false に同期');

  // 3-2. 1 class でも started → state.started = true
  api._setState({
    classes:[{id:'A',started:true},{id:'B',started:false}],
    started:false
  });
  api.syncGlobalStartedFromClasses();
  eq(api._getState().started, true, '3-2 1 class started → state.started=true に同期');

  // 3-3. 全 class started → state.started = true
  api._setState({
    classes:[{id:'A',started:true},{id:'B',started:true}],
    started:false
  });
  api.syncGlobalStartedFromClasses();
  eq(api._getState().started, true, '3-3 全 class started → state.started=true');

  // 3-4. 全 class false に戻す → state.started = false
  api._setState({
    classes:[{id:'A',started:false},{id:'B',started:false}],
    started:true
  });
  api.syncGlobalStartedFromClasses();
  eq(api._getState().started, false, '3-4 全 class false に戻す → state.started=false');
}

// ============================================================
// 4. isClassStarted / setClassStarted
// ============================================================
console.log('\n--- 4. isClassStarted / setClassStarted ---');
{
  api._setState({
    classes:[{id:'A',started:false},{id:'B',started:false}],
    started:false
  });
  eq(api.isClassStarted('A'), false, '4-1 初期 A=false');
  eq(api.isClassStarted('B'), false, '4-2 初期 B=false');
  eq(api.isClassStarted('X'), false, '4-3 未知 classId は false');

  api.setClassStarted('A', true);
  eq(api.isClassStarted('A'), true, '4-4 setClassStarted で A=true');
  eq(api._getState().started, true, '4-5 setClassStarted は state.started を同期書き込み');
  eq(api.isClassStarted('B'), false, '4-6 B は影響なし');

  api.setClassStarted('A', false);
  eq(api.isClassStarted('A'), false, '4-7 false に戻せる');
  eq(api._getState().started, false, '4-8 同期書き込みで state.started=false');

  api.setClassStarted('X', true); // 未知 classId は無視
  eq(api._getState().started, false, '4-9 未知 classId 経由でも state.started 変化なし');
}

// ============================================================
// 5. 旧データ互換: state.started:true かつ classes なし
// ============================================================
console.log('\n--- 5. 旧データ互換 (state.started + classes 無し) ---');
{
  // 5-1. started:true かつ classes 無し → A/B 両方 started:true (保守的展開)
  const s1 = api.normalizeState({started:true,players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  eq(s1.classes.length, 2, '5-1a classes 2 件補完');
  eq(s1.classes[0].started, true, '5-1b A started=true (保守的展開)');
  eq(s1.classes[1].started, true, '5-1c B started=true (保守的展開)');
  eq(s1.started, true, '5-1d 互換フィールド state.started=true');

  // 5-2. started:false かつ classes 無し → A/B 両方 started:false
  const s2 = api.normalizeState({started:false,players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  eq(s2.classes[0].started, false, '5-2a A started=false');
  eq(s2.classes[1].started, false, '5-2b B started=false');
  eq(s2.started, false, '5-2c state.started=false');

  // 5-3. 過渡期データ: classes 既存 (started:false) + raw.started:true
  //   003 以前の startTournament は state.started のみ更新するため、save 後の state は
  //   classes:[A:false,B:false] + started:true という不整合になる。normalize は raw.started を
  //   OR して classes に保守的展開する (spec §9.3)。
  const s3 = api.normalizeState({started:true,classes:[{id:'A',started:false},{id:'B',started:false}],players:{A:[],B:[]},pairings:{A:[],B:[]},results:{A:[],B:[]}});
  eq(s3.classes[0].started, true, '5-3a 過渡期: A 保守的展開 true');
  eq(s3.classes[1].started, true, '5-3b 過渡期: B 保守的展開 true');
  eq(s3.started, true, '5-3c 互換フィールド state.started=true');
}

// ============================================================
// 6. readPersistedState() が normalized state を返す
// ============================================================
console.log('\n--- 6. readPersistedState() normalized state ---');
{
  // 6-1. 旧データ (classes 未定義) → normalized で classes 補完
  env.ctx.localStorage._[api.STORAGE_KEY] = JSON.stringify({
    players:{A:[{id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan',entry_no:1}],B:[]},
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    started:false
  });
  const p1 = api.readPersistedState();
  assert(p1 !== null, '6-1a 旧データを読める');
  assert(Array.isArray(p1.classes), '6-1b classes 配列が補完される');
  eq(p1.classes.length, 2, '6-1c A/B が補完される');
  eq(p1.classes[0].id, 'A', '6-1d A が含まれる');
  eq(p1.classes[1].id, 'B', '6-1e B が含まれる');

  // 6-2. players/pairings/results は classId-keyed object として補完
  assert(typeof p1.players === 'object' && Array.isArray(p1.players.A), '6-2a players.A が配列');
  assert(Array.isArray(p1.players.B), '6-2b players.B が配列');
  assert(Array.isArray(p1.pairings.A), '6-2c pairings.A が配列');
  assert(Array.isArray(p1.pairings.B), '6-2d pairings.B が配列');
  assert(Array.isArray(p1.results.A), '6-2e results.A が配列');
  assert(Array.isArray(p1.results.B), '6-2f results.B が配列');

  // 6-3. 新形式データ (classes あり) も読める
  env.ctx.localStorage._[api.STORAGE_KEY] = JSON.stringify({
    players:{A:[],B:[]},
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],
    started:true
  });
  const p2 = api.readPersistedState();
  assert(p2 !== null, '6-3a 新形式データを読める');
  eq(p2.classes[0].started, true, '6-3b A started=true 維持');
  eq(p2.classes[1].started, false, '6-3c B started=false 維持');
  eq(p2.started, true, '6-3d state.started=true');

  // 6-4. classStartedInPersisted で classId 単位検査
  eq(api.classStartedInPersisted(p2, 'A'), true, '6-4a classStartedInPersisted(A)=true');
  eq(api.classStartedInPersisted(p2, 'B'), false, '6-4b classStartedInPersisted(B)=false');
  eq(api.classStartedInPersisted(p2, 'X'), false, '6-4c 未知 classId は false');
  eq(api.classStartedInPersisted(null, 'A'), false, '6-4d null persisted は false');

  // 6-5. 破損 / null は readPersistedState で null
  //   壊れた JSON は SAVE-003 console.warn を 1 回出す（sandbox の console mock に蓄積、stderr へは出さない）。
  env.ctx.localStorage._[api.STORAGE_KEY] = '{ broken json';
  eq(api.readPersistedState(), null, '6-5a 壊れた JSON は null');
  env.ctx.localStorage._[api.STORAGE_KEY] = 'null';
  eq(api.readPersistedState(), null, '6-5b parsed null は null');
}

// ============================================================
// 7. resetTournamentProgressOnly が classes[i].started も false に戻すこと
//    (Codex Must Fix / spec §8.2 例外 / §12.2)
//    過去バグ: state.started=false 直接代入だけだと classes[i].started=true のまま保存され、
//    再ロード時に normalizeState の保守的展開で state.started=true に戻る経路があった。
//    classes をループで false に戻して syncGlobalStartedFromClasses() で同期書き込みする必要がある。
// ============================================================
console.log('\n--- 7. resetTournamentProgressOnly が classes も false に戻す ---');
{
  // started=true の進行中データを直接組み立て
  api._setState({
    players:{A:[{id:'p1',name:'田中',cls:'A'},{id:'p2',name:'佐藤',cls:'A'}],B:[]},
    rounds:4,
    pairings:{A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'}],B:[]},
    results:{A:[],B:[]},
    started:true,
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:''},
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}]
  });

  api.resetTournamentProgressOnly(); // confirm/save/render は sandbox の mock 経由（confirm=true 既定）

  const after = api._getState();
  eq(after.started, false, '7-1 state.started=false にリセット');
  eq(after.classes[0].started, false, '7-2 classes[A].started=false にリセット');
  eq(after.classes[1].started, false, '7-3 classes[B].started=false にリセット');
  eq(after.pairings.A.length, 0, '7-4 pairings.A 空');
  eq(after.pairings.B.length, 0, '7-5 pairings.B 空');
  eq(after.results.A.length, 0, '7-6 results.A 空');
  eq(after.players.A.length, 2, '7-7 players.A は維持（部分リセット）');

  // 再ロード経路の確認: 保存された state を normalize しても started=false が維持される
  const reloaded = api.normalizeState(JSON.parse(JSON.stringify(after)));
  eq(reloaded.started, false, '7-8 保存 → normalize 再ロードでも state.started=false（保守的展開で復活しない）');
  eq(reloaded.classes[0].started, false, '7-9 reload 後 classes[A].started=false');
  eq(reloaded.classes[1].started, false, '7-10 reload 後 classes[B].started=false');
}

console.log('\n==========================================');
console.log(`  ROUND-CLASS-START-003 単体テスト: PASS ${pass}件 / FAIL ${fail}件`);
console.log('==========================================');
process.exit(fail===0?0:1);
