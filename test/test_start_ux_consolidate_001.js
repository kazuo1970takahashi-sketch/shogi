#!/usr/bin/env node
// START-UX-CONSOLIDATE-001: 開始導線を「対局管理」タブへ集約 単体テスト。
//   設計: docs/specs/20260617_start_ux_consolidate_001_design.md（§5 / §5.5 / §6 / §7 / §9）
//   観点（タスク test 要件 1–21）:
//     #startBtn ナビ専用化:
//       1  文言が「登録内容を確認して対局管理へ」
//       2  押下で対局管理タブへ移動
//       3  押下で pairings 不変 / 4 results 不変 / 5 classes[].started 不変 / 6 互換 state.started 不変
//       7  generatePairing() 非呼出 / 8 startTournament() 非呼出 / 9 startTournamentForClass() 非呼出
//       10 受付編集内容が失われない（save 反映）
//     reg-class-start 撤去:
//       11 受付タブに開始コントロールが存在しない / 12 reg-class-start 系ボタンが存在しない
//       13 readiness 表示は読み取り専用（開始 handler / 開始呼出を含まない）
//       14 受付タブから startTournamentForClass(cls) を呼ぶ導線がない
//     クラス別開始保持:
//       15 startBtnClass_{cls} が残存 / 16 startTournamentForClass('A')=A のみ / 17 ('B')=B のみ
//       18 validateStartableClass の 2名以上・偶数条件が維持
//       19 旧「#startBtn で1回戦生成」前提を新仕様（ナビのみ）へ更新（赤/skip 放置なし）
//     既存データ互換:
//       20 既存保存データでも nav で開始系 state を壊さない
//       21 production 由来 / orphan 由来データの差異があっても nav が開始状態を壊さない
//   開始状態は派生でなく state（既存 schema）。新 schema は足さない。データは完全架空のみ（架空 …）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_start_ux_consolidate_001.js <html>');process.exit(1);}

const HTML = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
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
      disabled:false, type:'',
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

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(HTML);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       goToTournamentFromReg:goToTournamentFromReg,
       showTab:showTab,
       save:save, load:load,
       validateStartableClass:validateStartableClass,
       startTournamentForClass:startTournamentForClass,
       renderRegList:renderRegList,
       describeClassReadiness:describeClassReadiness,
       renderClassReadiness:renderClassReadiness,
       regClassReadinessId:regClassReadinessId,
       STORAGE_KEY:STORAGE_KEY,
       _setState:function(s){state=s;},
       _getState:function(){return state;},
       // typeof は未宣言識別子でも throw しない（撤去済み関数の不在を実行時に確認できる）
       removedTypeofs:{
         describeClassStartButton: typeof describeClassStartButton,
         buildClassStartConfirmMessage: typeof buildClassStartConfirmMessage,
         renderClassStartButton: typeof renderClassStartButton,
         onClickClassStart: typeof onClickClassStart,
         bindClassStartHandlers: typeof bindClassStartHandlers,
         regClassStartBtnId: typeof regClassStartBtnId
       },
       keptTypeofs:{
         goToTournamentFromReg: typeof goToTournamentFromReg,
         startTournament: typeof startTournament,
         startTournamentForClass: typeof startTournamentForClass,
         validateStartableClass: typeof validateStartableClass,
         generatePairing: typeof generatePairing,
         describeClassReadiness: typeof describeClassReadiness,
         renderClassReadiness: typeof renderClassReadiness,
         regClassReadinessId: typeof regClassReadinessId,
         showTab: typeof showTab
       }
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

// 架空 state：A=偶数(4名・未開始・ready), B=奇数(3名・未開始)。nav の不変確認に「開始可能な A」を含める
// （nav が誤って開始系を呼んだら A の pairings/started が変化するため、検出力が高い）。
function fxState(){
  return {
    players:{A:[
      {id:'a1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくうたろう'},
      {id:'a2',name:'架空次郎',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'a3',name:'架空三郎',cls:'A',member:'member',grade:'ippan',entry_no:3,yomi:''},
      {id:'a4',name:'架空四郎',cls:'A',member:'member',grade:'ippan',entry_no:4,yomi:''}
    ],B:[
      {id:'b1',name:'架空花子',cls:'B',member:'member',grade:'ippan',entry_no:1,yomi:''},
      {id:'b2',name:'架空桃子',cls:'B',member:'member',grade:'ippan',entry_no:2,yomi:''},
      {id:'b3',name:'架空梅子',cls:'B',member:'member',grade:'ippan',entry_no:3,yomi:''}
    ]},
    rounds:0, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}
// A=4・B=4（両クラス偶数）。クラス別開始の B 単独開始を検証する用。
function fxStateBothEven(){
  var s=fxState();
  s.players.B.push({id:'b4',name:'架空松子',cls:'B',member:'member',grade:'ippan',entry_no:4,yomi:''});
  return s;
}

// 開始系 state のスナップショット（pairings / results / started / classes[].started）。
function startStateSnapshot(st){
  return JSON.stringify({
    pairings: st.pairings,
    results: st.results,
    started: st.started,
    classStarted: (st.classes||[]).map(function(c){return {id:c.id,started:c.started===true};})
  });
}

// goToTournamentFromReg の関数本体ソースを抽出（先頭の col0 の `}` まで）。
function goNavBody(){
  const m = /function goToTournamentFromReg\(\)\{([\s\S]*?)\n\}/.exec(HTML);
  return m ? m[1] : null;
}

// ============================================================
// SRC. ソースレベルの構造検査（#startBtn ナビ化 / reg-class-start 撤去 / 開始導線保持）
// ============================================================
{
  // 1. #startBtn の文言（ナビ）
  assert(HTML.indexOf('id="startBtn">登録内容を確認して対局管理へ')>=0, 'SRC1 #startBtn 文言が「登録内容を確認して対局管理へ」(要件1)');
  // 旧ボタン文言が「ボタンとして」残っていない（legacy startTournament 内の案内コメントの言及は対象外）。
  assert(HTML.indexOf('登録完了・対局開始</button>')<0, 'SRC2 旧ボタン文言「登録完了・対局開始」がボタンとして残っていない');
  // #startBtn id は短期互換で維持
  assert(HTML.indexOf('id="startBtn"')>=0, 'SRC3 #startBtn の id は維持（短期互換・設計 §5.4）');

  // 3. #startBtn の click は goToTournamentFromReg（startTournament ではない）
  assert(HTML.indexOf("getElementById('startBtn').addEventListener('click',goToTournamentFromReg)")>=0, 'SRC4 #startBtn は goToTournamentFromReg に bind（ナビ専用・要件8）');
  assert(HTML.indexOf("getElementById('startBtn').addEventListener('click',startTournament)")<0, 'SRC5 #startBtn は startTournament に bind されていない（開始副作用を外す・要件8）');

  // 4/5. goToTournamentFromReg 本体：showTab+save あり、開始系の呼出なし
  const body = goNavBody();
  assert(body!==null, 'SRC6 goToTournamentFromReg が定義されている');
  assert(body && body.indexOf("showTab('tournament')")>=0, 'SRC7 nav 本体に showTab(\'tournament\')（対局管理へ移動・要件2）');
  assert(body && body.indexOf('save(')>=0, 'SRC8 nav 本体に save()（受付入力の保存・要件10）');
  assert(body && body.indexOf('generatePairing')<0, 'SRC9 nav 本体に generatePairing 呼出なし（要件7）');
  assert(body && body.indexOf('startTournament')<0, 'SRC10 nav 本体に startTournament / startTournamentForClass 呼出なし（要件8/9）');

  // 11/12. reg-class-start 系の helper / DOM / CSS が撤去されている
  assert(HTML.indexOf('function regClassStartBtnId')<0, 'SRC11 regClassStartBtnId 撤去（要件12/17）');
  assert(HTML.indexOf('function describeClassStartButton')<0, 'SRC12 describeClassStartButton 撤去（要件17）');
  assert(HTML.indexOf('function buildClassStartConfirmMessage')<0, 'SRC13 buildClassStartConfirmMessage 撤去（要件17）');
  assert(HTML.indexOf('function renderClassStartButton')<0, 'SRC14 renderClassStartButton 撤去（要件17）');
  assert(HTML.indexOf('function onClickClassStart')<0, 'SRC15 onClickClassStart 撤去（受付→開始 handler を残さない・要件11/14）');
  assert(HTML.indexOf('function bindClassStartHandlers')<0, 'SRC16 bindClassStartHandlers 撤去（受付開始 bind を残さない・要件11）');
  assert(HTML.indexOf('id="a-start-btn"')<0 && HTML.indexOf('id="b-start-btn"')<0, 'SRC17 受付タブの開始ボタン DOM(a-start-btn/b-start-btn)が無い（要件12）');
  assert(HTML.indexOf("btn-primary btn-sm reg-class-start'")<0, 'SRC18 reg-class-start ボタン className 生成が無い（要件12）');
  assert(HTML.indexOf('.reg-class-start{')<0 && HTML.indexOf('.reg-class-start:disabled')<0, 'SRC19 .reg-class-start CSS ルールが無い（撤去）');
  assert(HTML.indexOf('data-regstart-bound')<0, 'SRC20 受付開始ボタンの bind 用属性(data-regstart-bound)が無い（handler 撤去）');

  // 14. renderRegList から受付開始の描画/bind 呼出が消えている
  assert(HTML.indexOf('renderClassStartButton(cls')<0, 'SRC21 renderRegList が renderClassStartButton を呼ばない（要件14）');
  assert(HTML.indexOf('bindClassStartHandlers()')<0, 'SRC22 renderRegList が bindClassStartHandlers を呼ばない（要件11/14）');

  // 13. readiness 表示は残置（読み取り専用）：DOM と helper はあるが、readiness 経路に開始呼出は無い
  assert(HTML.indexOf('id="a-readiness"')>=0 && HTML.indexOf('id="b-readiness"')>=0, 'SRC23 readiness バッジ DOM(a-readiness/b-readiness)は残置（読み取り専用・要件13）');
  assert(HTML.indexOf('function renderClassReadiness')>=0 && HTML.indexOf('function describeClassReadiness')>=0, 'SRC24 readiness helper は残置（要件13）');
  // renderClassReadiness 本体に開始呼出が無いこと（読み取り専用の担保）
  const rcr = /function renderClassReadiness\([\s\S]*?\n\}/.exec(HTML);
  assert(rcr && rcr[0].indexOf('startTournament')<0 && rcr[0].indexOf('addEventListener')<0, 'SRC25 renderClassReadiness は開始呼出/クリック bind を含まない（読み取り専用・要件13/16）');

  // 15/19. 対局管理タブの正規開始導線は保持
  assert(HTML.indexOf("id=\"startBtnClass_'+escapeHtml(cls)+'\"")>=0, 'SRC26 対局管理タブの startBtnClass_{cls} が残存（要件15）');
  assert(HTML.indexOf("startBtn.addEventListener('click',(function(c){return function(){startTournamentForClass(c);};})(cls))")>=0, 'SRC27 startBtnClass_{cls} は startTournamentForClass に bind（要件15）');
  assert(HTML.indexOf('function startTournamentForClass')>=0, 'SRC28 startTournamentForClass を削除していない（要件15/16/17 保持）');
  assert(HTML.indexOf('function generatePairing')>=0, 'SRC29 generatePairing を削除/変更していない（保持）');
  // 文言明確化：「全員で1局目を開始」
  assert(HTML.indexOf('全員で1局目を開始')>=0, 'SRC30 対局管理タブの開始ボタン文言を「○○全員で1局目を開始」に明確化（§7）');

  // startTournament は削除せず legacy として残す（UI からは bind しない＝SRC5 で担保済み）
  assert(HTML.indexOf('function startTournament(')>=0, 'SRC31 startTournament は削除せず legacy/deprecated helper として残置（設計 §6）');

  // 18. validateStartableClass の判定（2名以上・偶数）が維持（シグネチャ・ガード不変）
  const vsc = /function validateStartableClass\(classInfo,playersForClass\)\{[\s\S]*?\n\}/.exec(HTML);
  assert(vsc!==null, 'SRC32 validateStartableClass のシグネチャ不変（引数を増やしていない・要件18）');
  assert(vsc && vsc[0].indexOf("cnt===1)return {kind:'too-few'")>=0, 'SRC33 validateStartableClass: 1名 → too-few（2名以上条件を緩めない・要件18）');
  assert(vsc && vsc[0].indexOf("cnt%2!==0)return {kind:'odd'")>=0, 'SRC34 validateStartableClass: 奇数 → odd（偶数条件を緩めない・要件18）');
}

// ============================================================
// RUNTIME. 撤去関数は実行時に未定義 / 保持関数は function（型レベルの撤去・保持確認）
// ============================================================
{
  const env = loadEnv();
  const rm = env.removedTypeofs, kp = env.keptTypeofs;
  assert(rm.describeClassStartButton==='undefined', 'RT1 describeClassStartButton は実行時 undefined（撤去・要件17）');
  assert(rm.buildClassStartConfirmMessage==='undefined', 'RT2 buildClassStartConfirmMessage は undefined（撤去）');
  assert(rm.renderClassStartButton==='undefined', 'RT3 renderClassStartButton は undefined（撤去）');
  assert(rm.onClickClassStart==='undefined', 'RT4 onClickClassStart は undefined（受付→開始 handler 撤去・要件14）');
  assert(rm.bindClassStartHandlers==='undefined', 'RT5 bindClassStartHandlers は undefined（撤去・要件11）');
  assert(rm.regClassStartBtnId==='undefined', 'RT6 regClassStartBtnId は undefined（撤去・要件12）');

  assert(kp.goToTournamentFromReg==='function', 'RT7 goToTournamentFromReg は function（ナビ導線・要件2）');
  assert(kp.startTournament==='function', 'RT8 startTournament は function（legacy 温存・設計 §6）');
  assert(kp.startTournamentForClass==='function', 'RT9 startTournamentForClass は function（正規開始導線・要件15）');
  assert(kp.validateStartableClass==='function', 'RT10 validateStartableClass は function（保持・要件18）');
  assert(kp.generatePairing==='function', 'RT11 generatePairing は function（保持）');
  assert(kp.describeClassReadiness==='function' && kp.renderClassReadiness==='function', 'RT12 readiness helper は function（読み取り専用・残置・要件13）');
}

// ============================================================
// NAV. #startBtn 押下＝goToTournamentFromReg：開始系 state 不変・タブ移動・受付入力保存
//      （A は開始可能 ready 状態。誤って開始系を呼べば A の pairings/started が変化＝高い検出力）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  // ready 確認：A は ok（4名・偶数・未開始）＝もし開始が走れば必ず state が変わる状態
  assert(env.validateStartableClass(env._getState().classes[0], env._getState().players.A).kind==='ok', 'NAV0 前提：A は開始可能(ok)＝nav の不変検出力を担保');

  const before = startStateSnapshot(env._getState());
  const playersBefore = JSON.stringify(env._getState().players);

  let threw=false;
  try{ env.goToTournamentFromReg(); }catch(e){ threw=true; console.error('    nav threw: '+(e&&e.message)); }
  assert(!threw, 'NAV1 goToTournamentFromReg は例外なく実行（要件2）');

  const st = env._getState();
  // 2. タブ移動
  assert(env._ctx._elements['pane-tournament'].style.display==='block', 'NAV2 対局管理ペインが表示される（pane-tournament=block・要件2）');
  assert(env._ctx._elements['pane-reg'].style.display==='none', 'NAV3 受付ペインが非表示になる（pane-reg=none・要件2）');
  assert((env._ctx._elements['tab-tournament'].className||'').indexOf('active')>=0, 'NAV4 対局管理タブが active（要件2）');

  // 3/4/5/6. 開始系 state 不変
  assert(startStateSnapshot(st)===before, 'NAV5 開始系 state（pairings/results/classes[].started/started）が不変（要件3-6/14）');
  assert(st.pairings.A.length===0 && st.pairings.B.length===0, 'NAV6 pairings 不変（1回戦を作らない・要件3/7）');
  assert(st.results.A.length===0 && st.results.B.length===0, 'NAV7 results 不変（要件4）');
  assert(st.classes[0].started===false && st.classes[1].started===false, 'NAV8 classes[].started 不変（要件5）');
  assert(st.started===false, 'NAV9 互換 state.started 不変（要件6）');

  // 10. 受付入力（players）が失われない＋save で localStorage へ反映
  assert(JSON.stringify(st.players)===playersBefore, 'NAV10 受付の参加者(players)が nav で失われない（要件10）');
  const persisted = env._ctx.localStorage.getItem(env.STORAGE_KEY)||'';
  assert(persisted.indexOf('架空太郎')>=0 && persisted.indexOf('架空花子')>=0, 'NAV11 nav で現 state が localStorage に保存される（受付編集の保持・要件10）');
  // 保存 JSON に開始フラグの誤更新がない
  const pj = persisted?JSON.parse(persisted):{};
  assert(pj.started===false && (pj.classes||[]).every(function(c){return c.started===false;}), 'NAV12 保存 JSON でも started は false のまま（nav が開始フラグを書かない・要件6）');
}

// ============================================================
// NAV-EDIT. nav 直前の未保存の受付編集（name 変更）が nav の save で保持される（要件10/13）
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  env._setState(s);
  // 受付タブ上の編集を模擬：未保存のまま player 名を変更（localStorage には未反映）
  s.players.A[0].name = '架空太郎・改';
  assert((env._ctx.localStorage.getItem(env.STORAGE_KEY)||'').indexOf('架空太郎・改')<0, 'NE1 前提：編集は nav 前は未保存');
  env.goToTournamentFromReg();
  const persisted = env._ctx.localStorage.getItem(env.STORAGE_KEY)||'';
  assert(persisted.indexOf('架空太郎・改')>=0, 'NE2 nav の save で直前の受付編集（名前変更）が保存され失われない（要件10）');
  assert(env._getState().players.A[0].name==='架空太郎・改', 'NE3 編集後の名前が state に保持される（要件10）');
}

// ============================================================
// CLASS-START. 対局管理タブの正規開始導線：クラス別開始は当該クラスのみ（他クラス非破壊）
// ============================================================
{
  // 16. startTournamentForClass('A') は A だけ開始し B を破壊しない
  const env = loadEnv();
  env._setState(env.normalizeState(fxStateBothEven()));
  env.startTournamentForClass('A');
  const st = env._getState();
  assert(st.classes.find(function(c){return c.id==='A';}).started===true, 'CS1 startTournamentForClass(A) で A は started=true（要件16）');
  assert(st.classes.find(function(c){return c.id==='B';}).started===false, 'CS2 A 開始後も B は started=false（B 非破壊・要件16）');
  assert(st.pairings.A.length>0, 'CS3 A の 1局目 pairings が生成（要件16）');
  assert(st.pairings.B.length===0, 'CS4 B の pairings は空のまま（A 開始に巻き込まれない・要件16）');

  // 17. startTournamentForClass('B') は B だけ開始し A を破壊しない
  const env2 = loadEnv();
  env2._setState(env2.normalizeState(fxStateBothEven()));
  env2.startTournamentForClass('B');
  const st2 = env2._getState();
  assert(st2.classes.find(function(c){return c.id==='B';}).started===true, 'CS5 startTournamentForClass(B) で B は started=true（要件17）');
  assert(st2.classes.find(function(c){return c.id==='A';}).started===false, 'CS6 B 開始後も A は started=false（A 非破壊・要件17）');
  assert(st2.pairings.B.length>0, 'CS7 B の 1局目 pairings が生成（要件17）');
  assert(st2.pairings.A.length===0, 'CS8 A の pairings は空のまま（B 開始に巻き込まれない・要件17）');
}

// ============================================================
// VALIDATE. validateStartableClass の 2名以上・偶数条件が維持（緩めない・部分開始へ流用しない）
// ============================================================
{
  const env = loadEnv();
  const A = {id:'A',name:'Aクラス',started:false};
  assert(env.validateStartableClass(A,[1,2,3,4]).kind==='ok', 'VS1 偶数2名以上・未開始 → ok（要件18）');
  assert(env.validateStartableClass(A,[1,2,3]).kind==='odd', 'VS2 奇数 → odd（偶数条件維持・要件18）');
  assert(env.validateStartableClass(A,[1]).kind==='too-few', 'VS3 1名 → too-few（2名以上条件維持・要件18）');
  assert(env.validateStartableClass(A,[]).kind==='skip-empty', 'VS4 0名 → skip-empty（要件18）');
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:true},[1,2]).kind==='skip-already-started', 'VS5 started=true → skip-already-started（要件18）');
}

// ============================================================
// READINESS. readiness 表示は renderRegList で描画され、開始系 state を変えない（読み取り専用）
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  const before = startStateSnapshot(env._getState());
  env.renderRegList();
  const after = startStateSnapshot(env._getState());
  assert(env._ctx._elements['a-readiness'].textContent.indexOf('開始できます')>=0, 'RD1 受付タブに readiness 表示（A=「開始できます」）が残る（読み取り専用・要件13）');
  assert(env._ctx._elements['b-readiness'].textContent.indexOf('奇数')>=0, 'RD2 B(奇数) の readiness が表示される（要件13）');
  // 受付タブの開始ボタン DOM は描画されない（撤去済み）。mock は getElementById 参照時のみ要素を生成するため、
  // renderRegList が開始ボタンを一切参照しない＝_elements に a-start-btn/b-start-btn が現れない、で担保する。
  assert(env._ctx._elements['a-start-btn']===undefined && env._ctx._elements['b-start-btn']===undefined, 'RD3 受付タブの開始ボタン(a-start-btn/b-start-btn)は renderRegList で生成/参照されない（撤去・要件11/12）');
  assert(before===after, 'RD4 renderRegList（readiness 込み）は開始系 state を変えない（読み取り専用・要件13）');
}

// ============================================================
// EXISTING-DATA. 既存保存データを開いた状態でも nav が開始系 state を壊さない
//   20: orphan 形（classes[].started を持つ）・実 pairings を持つ「開始済み」データ
//   21: production/legacy 形（classes に started キーを持たない）でも nav が開始状態を壊さない
// ============================================================
{
  // 20. 開始済みデータ（A 開始済・pairings あり）を別 env で load → nav → 開始系 state 不変
  const seed = loadEnv();
  seed._setState(seed.normalizeState(fxStateBothEven()));
  seed.startTournamentForClass('A'); // A を実際に開始（started=true / pairings.A 生成）
  const savedJson = seed._ctx.localStorage.getItem(seed.STORAGE_KEY);
  assert(!!savedJson, 'ED0 前提：開始済みデータが保存されている');

  const env = loadEnv();
  env._ctx.localStorage.setItem(env.STORAGE_KEY, savedJson);
  env.load();
  const before = startStateSnapshot(env._getState());
  assert(env._getState().classes.find(function(c){return c.id==='A';}).started===true, 'ED1 前提：load 後 A は started=true（既存進行データ）');
  env.goToTournamentFromReg();
  const after = startStateSnapshot(env._getState());
  assert(before===after, 'ED2 既存保存データでも nav 押下で開始系 state が不変（要件20）');
  assert(env._getState().pairings.A.length>0, 'ED3 既存の A の pairings が nav で消えない（要件20）');

  // 21. production/legacy 形（classes[].started キー無し・state.started のみ）でも nav が壊さない
  // 注: normalizeState は pairings[cls] を「現ラウンドのマッチのフラット配列」として扱う（results はラウンド配列）。
  //     legacy データもこのフラット形で与える（旧データ互換の正常系）。
  const legacy = {
    players:{A:[
      {id:'la1',name:'架空甲',cls:'A'},{id:'la2',name:'架空乙',cls:'A'}
    ],B:[]},
    rounds:0,
    pairings:{A:[{p1:'la1',p2:'la2',winner:null}],B:[]},
    results:{A:[],B:[]},
    started:true,
    classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'}], // started キーを持たない（legacy 形）
    report:{}
  };
  const env2 = loadEnv();
  env2._ctx.localStorage.setItem(env2.STORAGE_KEY, JSON.stringify(legacy));
  env2.load(); // normalizeState が legacy 形を吸収
  const before2 = startStateSnapshot(env2._getState());
  let threw2=false;
  try{ env2.goToTournamentFromReg(); }catch(e){ threw2=true; console.error('    legacy nav threw: '+(e&&e.message)); }
  assert(!threw2, 'ED4 legacy/production 形データでも nav が例外なく動く（要件21）');
  const after2 = startStateSnapshot(env2._getState());
  assert(before2===after2, 'ED5 legacy/production 形でも nav 押下で開始系 state が不変（要件21）');
  assert(env2._getState().pairings.A.length>0 && env2._getState().started===true, 'ED6 legacy データの開始状態（pairings/started）が nav で壊れない（要件21）');
}

// ============================================================
// REGRESSION-NOTE（要件19）:
//   旧仕様「#startBtn 押下で1回戦が一括生成される」前提は本スライスで撤廃。
//   #startBtn はナビ専用化（SRC4/5・NAV5-9 が「押下で1回戦を作らない＝開始系不変」を担保）。
//   旧 START-003（受付クラス別開始）テスト test_start_003.js は撤去スタブ化し run_tests.sh から
//   登録解除済み（赤/skip 放置なし）。新仕様の確認は本ファイルが担保する。
// ============================================================
{
  // ダブルチェック：#startBtn 経路では「開始可能な A」があっても pairings を生成しない（旧仕様の撤廃確認）
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  env.goToTournamentFromReg();
  assert(env._getState().pairings.A.length===0, 'REG1 旧仕様撤廃：#startBtn(nav) は ready な A でも1回戦を生成しない（要件19）');
  assert(env._getState().started===false, 'REG2 旧仕様撤廃：#startBtn(nav) は state.started を立てない（要件19）');
}

console.log('');
console.log('  START-UX-CONSOLIDATE-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
