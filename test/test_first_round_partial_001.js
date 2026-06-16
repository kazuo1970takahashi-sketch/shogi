#!/usr/bin/env node
// FRP-IMPL-001: 1局目部分手合いの土台（部分開始 + 1局目未割当一覧表示）単体テスト。
//   設計: docs/specs/20260617_frp_design_001_first_round_partial.md（FRP-DESIGN-001）
//   本 PR の範囲: 部分開始（startClassPartial）と未割当一覧の「表示」まで。
//                 選択者での append 作成（appendFirstRoundPairs）は実装しない（次 PR FRP-IMPL-002）。
//   観点:
//     V. validatePartialStartableClass: 未開始1名以上で ok / 偶数を要求しない / 開始済み・0名は拒否（pure）。
//     U. getUnassignedFirstRoundPlayers: pairings 在籍者を除外 / results 非空で空 / entry_no 昇順（派生・非保存）。
//     P. startClassPartial: started=true・pairings/results 空・generatePairing を呼ばない・保存検証。
//     D. 表示: 未開始 pane に部分開始ボタン / started+results空 pane に未割当一覧 / 受付タブに新ボタンを出さない。
//     S. 既存挙動不変の回帰: #startBtn / startBtnClass_ 導線 / submitRound の missing チェック。
//   データは完全架空のみ（架空 …）。readiness/未割当は派生値（保存しない）。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_first_round_partial_001.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath,'utf8');

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  let warnCount = 0;
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       validateStartableClass:validateStartableClass,
       validatePartialStartableClass:validatePartialStartableClass,
       startClassPartial:startClassPartial,
       getUnassignedFirstRoundPlayers:getUnassignedFirstRoundPlayers,
       buildClassActionBarHtml:buildClassActionBarHtml,
       bindClassActionBarEvents:bindClassActionBarEvents,
       buildFirstRoundPartialSectionHtml:buildFirstRoundPartialSectionHtml,
       isClassStarted:isClassStarted,
       generatePairing:generatePairing,
       renderRegList:renderRegList,
       renderTournament:renderTournament,
       save:save, load:load,
       STORAGE_KEY:STORAGE_KEY,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空 state：A=偶数(4名・未開始), B=奇数(3名・未開始)。pairings/results は空。rounds=4。
function fxState(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
      {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'b3',name:'架空梅子',cls:'B',member:'member',grade:'ippan',entry_no:3,yomi:''}
    ]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

// src からトップレベル関数の本体を粗くスライス（構造ガード用）
function fnBody(name){
  const i = RAW.indexOf('function '+name+'(');
  if(i<0) return '';
  const j = RAW.indexOf('\nfunction ', i+1);
  return RAW.slice(i, j<0?RAW.length:j);
}

// ============================================================
// V. validatePartialStartableClass（pure・偶数を要求しない）
// ============================================================
{
  const env = loadEnv();
  const f = env.validatePartialStartableClass;
  // 1. 未開始・1名以上で ok
  assert(f({id:'A',name:'Aクラス',started:false},[{id:'a1'}]).kind==='ok', 'V1 未開始・1名 → ok');
  assert(f({id:'A',name:'Aクラス',started:false},[{id:'a1'},{id:'a2'}]).kind==='ok', 'V1b 未開始・2名 → ok');
  // 2. 偶数を要求しない（奇数3名でも ok）
  assert(f({id:'A',name:'Aクラス',started:false},[{id:'a1'},{id:'a2'},{id:'a3'}]).kind==='ok', 'V2 未開始・奇数3名 → ok（偶数を要求しない）');
  // 3. 開始済みは拒否
  assert(f({id:'A',name:'Aクラス',started:true},[{id:'a1'},{id:'a2'}]).kind==='skip-already-started', 'V3 開始済み → skip-already-started');
  // 4. 0名は拒否
  assert(f({id:'A',name:'Aクラス',started:false},[]).kind==='skip-empty', 'V4 0名 → skip-empty');
  // pure: state を読まない（state 未設定でも分岐が安定）／既存 validateStartableClass と差が出る
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false},[{id:'a1'},{id:'a2'},{id:'a3'}]).kind==='odd', 'V5 参照: validateStartableClass は奇数3名で odd（一括開始の判定は不変）');
}

// ============================================================
// U. getUnassignedFirstRoundPlayers（派生・非保存）
// ============================================================
{
  const env = loadEnv();
  // 5. pairings 在籍者を除外
  const s5 = env.normalizeState(fxState());
  s5.classes[0].started=true;
  s5.pairings.A=[{p1:'a1',p2:'a2',winner:null,lastModifiedBy:'auto'}];
  env._setState(s5);
  const u5 = env.getUnassignedFirstRoundPlayers('A');
  assert(u5.length===2 && u5.map(function(p){return p.id;}).indexOf('a1')<0 && u5.map(function(p){return p.id;}).indexOf('a2')<0, 'U5 pairings 在籍者(a1,a2)を除外し a3,a4 を返す');
  // 6. results 非空 → 空配列
  const s6 = env.normalizeState(fxState());
  s6.classes[0].started=true;
  s6.results.A=[[{p1:'a1',p2:'a2',winner:'a1',lastModifiedBy:'auto'}]];
  env._setState(s6);
  assert(env.getUnassignedFirstRoundPlayers('A').length===0, 'U6 results 非空（1局目確定後/2回戦以降）→ 空配列（対象外）');
  // 7. entry_no 昇順
  const s7 = env.normalizeState(fxState());
  s7.classes[0].started=true;
  // 配列順をentry_noと逆に並べ替え、ソートで entry_no 昇順になることを確認
  s7.players.A=[
    {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3},
    {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1},
    {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4},
    {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2}
  ];
  env._setState(s7);
  const u7 = env.getUnassignedFirstRoundPlayers('A').map(function(p){return p.entry_no;});
  assert(JSON.stringify(u7)===JSON.stringify([1,2,3,4]), 'U7 entry_no 昇順で返す（配列順に依存しない）');
}

// ============================================================
// P. startClassPartial（部分開始：state 効果 + 保存検証 + generatePairing 非呼出）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState())); // A=4名(偶数), B=3名(奇数), 全未開始
  let threw=false; try{ env.startClassPartial('A'); }catch(e){ threw=true; console.error(e); }
  assert(!threw, 'P0 startClassPartial('+"'A'"+') が例外を投げない（render 込みで安全）');
  const st = env._getState();
  // 10. class started
  assert(env.isClassStarted('A')===true, 'P10 部分開始後 A は started=true');
  // 9. pairings/results 空配列
  assert(Array.isArray(st.pairings.A) && st.pairings.A.length===0, 'P9a 部分開始後 pairings.A は空配列');
  assert(Array.isArray(st.results.A) && st.results.A.length===0, 'P9b 部分開始後 results.A は空配列');
  // 8. generatePairing を呼ばない（偶数4名でもペアが生成されない＝全員一括ペアしていない proxy）
  assert(st.pairings.A.length===0, 'P8 偶数クラスでも pairings.A は空（generatePairing/startTournamentForClass を流用していない）');
  // 他クラス非破壊
  assert(env.isClassStarted('B')===false && st.pairings.B.length===0, 'P-iso A 部分開始で B は未開始・pairings 空（他クラス非破壊）');
  // 保存検証（SAVE-FRP-001 正常系）: persisted に started=true / pairings空 / results空 が反映
  const persisted = JSON.parse(env._ctx.localStorage.getItem('shogi_v4')||'{}');
  const pA = (persisted.classes||[]).find(function(c){return c.id==='A';});
  assert(pA && pA.started===true, 'P-save1 保存後 persisted.classes[A].started=true');
  assert(Array.isArray(persisted.pairings.A) && persisted.pairings.A.length===0, 'P-save2 保存後 persisted.pairings.A 空');
  assert(Array.isArray(persisted.results.A) && persisted.results.A.length===0, 'P-save3 保存後 persisted.results.A 空');
  // unknown class は mutate しない
  const env2 = loadEnv(); env2._setState(env2.normalizeState(fxState()));
  const before = JSON.stringify(env2._getState());
  env2.startClassPartial('ZZ');
  assert(JSON.stringify(env2._getState())===before, 'P-unknown 未知クラスは state を変更しない（拒否）');
  // 奇数クラスでも部分開始できる（偶数を要求しない）
  const env3 = loadEnv(); env3._setState(env3.normalizeState(fxState()));
  env3.startClassPartial('B'); // 3名・奇数
  assert(env3.isClassStarted('B')===true && env3._getState().pairings.B.length===0, 'P-odd 奇数クラス B も部分開始できる（started=true・pairings空）');
}

// ============================================================
// D. 表示（部分開始ボタン / 未割当一覧 / 受付タブに出さない）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  // 11. 未開始 pane（対局管理）に部分開始ボタンが出る（buildClassActionBarHtml）
  const barA = env.buildClassActionBarHtml('A'); // 未開始・4名
  assert(barA.indexOf('startBtnPartial_A')>=0, 'D11 未開始クラスの action bar に部分開始ボタン(startBtnPartial_A)が出る');
  assert(barA.indexOf('選んだ人から1局目を開始')>=0, 'D11b ボタン文言「選んだ人から1局目を開始」');
  // 15. 既存の一括開始導線(startBtnClass_)は残る（偶数4名）
  assert(barA.indexOf('startBtnClass_A')>=0 && barA.indexOf('Aクラスを開始')>=0, 'S15 既存一括開始ボタン(startBtnClass_A「Aクラスを開始」)も併存（無変更）');
  // 奇数クラス B（3名・未開始）: 一括開始は出ない・部分開始は出る
  const barB = env.buildClassActionBarHtml('B');
  assert(barB.indexOf('startBtnClass_B')<0, 'D11c 奇数クラスB: 既存一括開始ボタンは出ない（既存条件を変えていない）');
  assert(barB.indexOf('startBtnPartial_B')>=0, 'D11d 奇数クラスB: 部分開始ボタンは出る（奇数でも開始導線）');

  // 12. started かつ results 空 の pane に未割当一覧が出る
  const env12 = loadEnv(); env12._setState(env12.normalizeState(fxState()));
  env12.startClassPartial('A');
  const sec = env12.buildFirstRoundPartialSectionHtml('A');
  assert(sec.indexOf('1局目 未割当参加者')>=0, 'D12 部分開始中クラスの未割当セクション見出し「1局目 未割当参加者」');
  assert(sec.indexOf('このクラスは部分開始中です')>=0, 'D12b 説明文「このクラスは部分開始中です。…」');
  assert(sec.indexOf('架空太郎')>=0 && sec.indexOf('架空四郎')>=0, 'D12c 未割当の全4名が一覧に出る');
  // disabled な「選択者で1局目に追加」ボタン（次PR）。append イベントは未実装。
  assert(sec.indexOf('frpAddBtn_A')>=0 && /frpAddBtn_A[^>]*disabled/.test(sec), 'D12d 「選択者で1局目に追加」ボタンは disabled（append は次PR）');
  // render 経路でも pane に出る
  const paneA = env12._ctx._elements['pane-A'];
  assert(paneA && paneA.innerHTML.indexOf('1局目 未割当参加者')>=0, 'D12e renderTournament 経路でも pane-A に未割当一覧が描画される');
  // results 非空なら未割当セクションは出ない
  const env12b = loadEnv(); const s12b = env12b.normalizeState(fxState());
  s12b.classes[0].started=true; s12b.results.A=[[{p1:'a1',p2:'a2',winner:'a1'}]];
  env12b._setState(s12b);
  assert(env12b.buildFirstRoundPartialSectionHtml('A')==='', 'D12f results 非空（2回戦以降）では未割当セクションを出さない');

  // 13. 受付タブ（renderRegList）に新しい手合作成ボタンを出さない
  const env13 = loadEnv(); env13._setState(env13.normalizeState(fxState()));
  env13.renderRegList();
  let regHasNew=false;
  const els = env13._ctx._elements;
  for(const k in els){
    const h = (els[k] && els[k].innerHTML) || '';
    if(h.indexOf('startBtnPartial_')>=0 || h.indexOf('frpAddBtn_')>=0 || h.indexOf('1局目 未割当参加者')>=0){ regHasNew=true; break; }
  }
  assert(!regHasNew, 'D13 受付タブ(renderRegList)に部分開始/未割当の新導線を出さない（受付タブは無変更）');
}

// ============================================================
// S. 既存挙動不変の回帰（構造ガード）
// ============================================================
{
  // 14. 既存 #startBtn（登録完了・対局開始）は無変更
  assert(RAW.indexOf('id="startBtn"')>=0 && RAW.indexOf('登録完了・対局開始')>=0, 'S14a 受付一括開始ボタン #startBtn「登録完了・対局開始」が残る');
  const stb = fnBody('startTournament');
  assert(stb.indexOf('collectStartCandidates')>=0 && stb.indexOf('applyStartForCandidates')>=0, 'S14b startTournament の一括開始ロジック（collect/apply）が無変更で残る');
  assert(stb.indexOf('startClassPartial')<0 && stb.indexOf('startBtnPartial')<0, 'S14c 一括開始フローに部分開始を混入していない');
  // 16. submitRound の missing チェックは不変
  const srb = fnBody('submitRound');
  assert(srb.indexOf('全試合の結果を入力してください')>=0, 'S16a submitRound の全結果入力チェックが残る');
  assert(srb.indexOf('対局に登録されていません')>=0, 'S16b submitRound の全員在籍(missing)チェックが残る（緩和していない）');
  assert(srb.indexOf('startClassPartial')<0 && srb.indexOf('getUnassignedFirstRoundPlayers')<0, 'S16c submitRound に部分手合いを混ぜていない');
  // startTournamentForClass / generatePairing は本体無変更（部分開始から呼ばない）
  const scp = fnBody('startClassPartial');
  assert(scp.indexOf('generatePairing')<0, 'S-impl1 startClassPartial は generatePairing を呼ばない');
  assert(scp.indexOf('startTournamentForClass')<0 && scp.indexOf('applyStartForCandidates')<0, 'S-impl2 startClassPartial は startTournamentForClass/applyStartForCandidates を流用しない');
}

console.log('');
console.log('  FRP-IMPL-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
