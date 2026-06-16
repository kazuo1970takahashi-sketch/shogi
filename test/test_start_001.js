#!/usr/bin/env node
// SHOGI-TOUR-START-001: クラス別「開始 readiness」表示 単体テスト。
//   設計メモ: docs/notes/20260616_shogi_tour_first_round_fast_start_design.md（§4.2 / §6 / §11）
//   観点（タスク test 要件）:
//     D.  describeClassReadiness: validateStartableClass の各 kind → バッジ文言/トーンへの純粋写像（全分岐）。
//     I.  validateStartableClass → describeClassReadiness 連動（判定は validateStartableClass に一元化＝§6）。
//     R.  renderClassReadiness / renderRegList: DOM へ描画する派生表示で、state を mutate しない・保存しない。
//     T.  開始済みクラスは「開始済み」と分かる（skip-already-started → started トーン）。
//     S.  既存開始ロジック不変の回帰（validateStartableClass の kind・collectStartCandidate*・
//         startTournamentForClass の class atomic 開始）。
//   readiness は派生値（保存しない）。データは完全架空のみ（架空 …）。

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
if(!targetPath){console.error('Usage: node test_start_001.js <html>');process.exit(1);}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       validateStartableClass:validateStartableClass,
       describeClassReadiness:describeClassReadiness,
       renderClassReadiness:renderClassReadiness,
       renderRegList:renderRegList,
       regClassReadinessId:regClassReadinessId,
       collectStartCandidateForClass:collectStartCandidateForClass,
       collectStartCandidates:collectStartCandidates,
       startTournamentForClass:startTournamentForClass,
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

// 架空 state：A=偶数(4名・未開始), B=奇数(3名・未開始)。readiness 判定用の最小データ。
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

// ============================================================
// D. describeClassReadiness: kind → バッジ文言/トーンへの純粋写像（全分岐）
//    開始判定は再実装せず kind を入力に取る（§6）。count は表示用。
// ============================================================
{
  const env = loadEnv();
  const f = env.describeClassReadiness;

  const ok4 = f('ok', 4);
  assert(ok4.tone==='ready', 'D1 ok → tone=ready');
  assert(ok4.label.indexOf('開始できます')>=0 && ok4.label.indexOf('4')>=0, 'D2 ok → 「開始できます（4名）」（人数を表示）');

  const odd = f('odd', 3);
  assert(odd.tone==='warn', 'D3 odd → tone=warn');
  assert(odd.label.indexOf('奇数')>=0, 'D4 odd → 文言に「奇数」を含む（押す前に不足が分かる）');

  const few = f('too-few', 1);
  assert(few.tone==='warn', 'D5 too-few → tone=warn');
  assert(few.label.indexOf('2名以上')>=0, 'D6 too-few → 「2名以上で開始できます」');

  const empty = f('skip-empty', 0);
  assert(empty.tone==='empty', 'D7 skip-empty → tone=empty');
  assert(empty.label.indexOf('参加者がいません')>=0, 'D8 skip-empty → 「参加者がいません」');

  const started = f('skip-already-started', 4);
  assert(started.tone==='started', 'D9 skip-already-started → tone=started');
  assert(started.label.indexOf('開始済み')>=0, 'D10 skip-already-started → 「開始済み」');

  const unknown = f('???', 2);
  assert(unknown.tone==='unknown' && unknown.label==='', 'D11 未知 kind → tone=unknown・空ラベル（バッジ非表示の安全既定）');

  // 純粋関数：同一入力で同一出力・引数の count 異常値は 0 名として扱う
  assert(f('ok', -1).label.indexOf('0')>=0, 'D12 count 異常値(-1)は 0 名として表示（防御的）');
  assert(JSON.stringify(f('ok',4))===JSON.stringify(env.describeClassReadiness('ok',4)), 'D13 純粋関数（同入力→同出力・副作用なし）');
}

// ============================================================
// I. validateStartableClass → describeClassReadiness 連動
//    （readiness は必ず validateStartableClass の kind を入力にする＝判定一元化 §6）
// ============================================================
{
  const env = loadEnv();
  function describeFor(classInfo, players){
    const r = env.validateStartableClass(classInfo, players);
    return { kind:r.kind, view:env.describeClassReadiness(r.kind, Array.isArray(players)?players.length:0) };
  }
  const s = fxState();
  const A = s.classes[0], B = s.classes[1];

  const a = describeFor(A, s.players.A); // 4名・偶数・未開始
  assert(a.kind==='ok' && a.view.tone==='ready', 'I1 A(4名/偶数/未開始) → kind=ok → ready');

  const b = describeFor(B, s.players.B); // 3名・奇数
  assert(b.kind==='odd' && b.view.tone==='warn', 'I2 B(3名/奇数) → kind=odd → warn');

  const one = describeFor({id:'A',name:'Aクラス',started:false}, [s.players.A[0]]);
  assert(one.kind==='too-few' && one.view.tone==='warn', 'I3 1名 → kind=too-few → warn');

  const none = describeFor({id:'A',name:'Aクラス',started:false}, []);
  assert(none.kind==='skip-empty' && none.view.tone==='empty', 'I4 0名 → kind=skip-empty → empty');

  const run = describeFor({id:'A',name:'Aクラス',started:true}, s.players.A);
  assert(run.kind==='skip-already-started' && run.view.tone==='started', 'I5 started=true → kind=skip-already-started → started');
}

// ============================================================
// R. renderClassReadiness / renderRegList：DOM 描画の派生表示・state 不変・保存しない
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  const before = JSON.stringify(env._getState());
  env.renderRegList(); // readiness をクラス見出し直下へ描画（save は呼ばない）
  const after = JSON.stringify(env._getState());

  // R1 受付一覧の描画で readiness バッジが DOM に出る（派生表示）
  const aBadge = env._ctx._elements['a-readiness'];
  const bBadge = env._ctx._elements['b-readiness'];
  assert(aBadge && aBadge.textContent.indexOf('開始できます')>=0, 'R1 A(偶数) の readiness が DOM に「開始できます」と出る');
  assert(aBadge.className.indexOf('class-readiness-ready')>=0, 'R2 A の readiness バッジに ready トーン class が付く');
  assert(bBadge && bBadge.textContent.indexOf('奇数')>=0 && bBadge.className.indexOf('class-readiness-warn')>=0, 'R3 B(奇数) は warn トーンで「奇数」と出る');

  // R4 readiness 描画は state を mutate しない（派生値＝保存対象にしない）
  assert(before===after, 'R4 renderRegList（readiness 込み）が state を変更しない（派生値）');

  // R5 renderRegList 単体は localStorage へ書かない（保存は呼び出し側の save() の責務）
  assert(!('shogi_v4' in env._ctx.localStorage._), 'R5 readiness 描画だけでは localStorage(shogi_v4) に書き込まない');

  // R6 save()→load() しても readiness/tone は永続化されない（state に新フィールドを足していない）
  env.save();
  const persisted = env._ctx.localStorage.getItem('shogi_v4') || '';
  assert(persisted.indexOf('"readiness"')<0 && persisted.indexOf('"tone"')<0, 'R6 保存 JSON に readiness/tone フィールドが無い（派生値・非永続）');
  const reloaded = env.load();
  const klass = (env._getState().classes||[]).find(function(c){return c.id==='A';});
  assert(klass && !('readiness' in klass) && !('tone' in klass), 'R7 load 後も classes[A] に readiness/tone キーが付かない（後方互換）');

  // R8 readiness 要素が無いクラスでも no-op（例外を投げない＝破損 DOM 耐性）
  let threw=false; try{ env.renderClassReadiness('ZZ', {id:'ZZ',name:'ZZクラス',started:false}, []); }catch(e){ threw=true; }
  assert(!threw, 'R8 readiness 要素が存在しない classId でも例外なく no-op');
}

// ============================================================
// T. 開始済みクラスは「開始済み」と分かる（renderClassReadiness 経由の DOM 表示）
// ============================================================
{
  const env = loadEnv();
  const s = env.normalizeState(fxState());
  s.classes[0].started = true;       // A を開始済みにする
  s.started = true;
  env._setState(s);
  env.renderClassReadiness('A', s.classes[0], s.players.A);
  const aBadge = env._ctx._elements['a-readiness'];
  assert(aBadge && aBadge.textContent.indexOf('開始済み')>=0, 'T1 開始済みクラスは readiness に「開始済み」と出る');
  assert(aBadge.className.indexOf('class-readiness-started')>=0, 'T2 開始済みは started トーン class が付く');
  assert(aBadge.style.display==='inline-block', 'T3 ラベルがあるバッジは表示される（display:inline-block）');
}

// ============================================================
// S. 既存開始ロジック不変の回帰（START-001 は判定・開始を変えない）
// ============================================================
{
  const env = loadEnv();
  // S1 validateStartableClass の kind が従来どおり（判定意味の不変）
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false}, [1,2,3,4]).kind==='ok', 'S1 偶数2名以上・未開始 → ok');
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false}, [1,2,3]).kind==='odd', 'S2 奇数 → odd');
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false}, [1]).kind==='too-few', 'S3 1名 → too-few');
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false}, []).kind==='skip-empty', 'S4 0名 → skip-empty');
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:true}, [1,2]).kind==='skip-already-started', 'S5 started=true → skip-already-started');

  // S6 collectStartCandidateForClass は class atomic（B が奇数でも A 単独の判定は ok）
  const s = fxState();
  const cA = env.collectStartCandidateForClass('A', s.classes, s.players);
  assert(cA.ok===true && cA.candidateClassId==='A', 'S6 A 単独 collect は B(奇数) に引きずられず ok');

  // S7 bulk collectStartCandidates は B の奇数 error を返す（一括は all-or-nothing）→ 既存挙動維持
  const bulk = env.collectStartCandidates(s.classes, s.players);
  assert(bulk.ok===false && bulk.errors.some(function(e){return e.kind==='odd';}), 'S7 一括 collect は B 奇数で error（既存 all-or-nothing 維持）');

  // S8 startTournamentForClass('A') は A だけ開始し B は未開始のまま（class atomic 開始の回帰）
  const env2 = loadEnv();
  env2._setState(env2.normalizeState(fxState()));
  env2.startTournamentForClass('A');
  const st = env2._getState();
  const aStarted = st.classes.find(function(c){return c.id==='A';}).started===true;
  const bStarted = st.classes.find(function(c){return c.id==='B';}).started===true;
  assert(aStarted===true, 'S8 startTournamentForClass(A) で A は started=true');
  assert(bStarted===false, 'S9 A 開始後も B は started=false（後追い開始＝他クラス非破壊）');
  assert(st.started===true, 'S10 state.started は all-class OR で同期（A 開始で true）');
  assert(Array.isArray(st.pairings.A) && st.pairings.A.length>0, 'S11 A の 1 局目（pairings）が生成される（既存 applyStart/generatePairing 経路）');
  assert(Array.isArray(st.pairings.B) && st.pairings.B.length===0, 'S12 B の pairings は空のまま（A 開始に巻き込まれない）');
}

console.log('');
console.log('  SHOGI-TOUR-START-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
