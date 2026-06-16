#!/usr/bin/env node
// SHOGI-TOUR-START-003: 受付クラス別「1局目を作成」導線 単体テスト。
//   設計メモ: docs/notes/20260616_shogi_tour_first_round_fast_start_design.md（§4.3 / §4.4 / §6 / §11）
//   観点（タスク test 要件）:
//     B.  describeClassStartButton: validateStartableClass の各 kind → ボタン表示/活性への純粋写像（全分岐）。
//     M.  buildClassStartConfirmMessage: 誤開始防止の確認文言（クラス名・人数）を組む純関数。
//     I.  validateStartableClass → describeClassStartButton 連動（判定は validateStartableClass に一元化＝§6）。
//     R.  renderClassStartButton / renderRegList: ボタン表示/活性の派生描画で、state を mutate しない・保存しない。
//         START-001 readiness 表示が共存して残る。
//     C.  onClickClassStart: 押下で（確認後）既存 startTournamentForClass(classId) 経由になる。
//         ok 以外は確認を出さず既存 guard に委ねる。A だけ開始しても B は未開始のまま（class atomic）。
//     S.  既存開始ロジック不変の回帰（validateStartableClass の kind・bulk collectStartCandidates の
//         all-or-nothing＝#startBtn 経路・startTournament が存在し挙動不変）。
//   ボタン状態は派生値（保存しない）。データは完全架空のみ（架空 …）。

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

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_start_003.js <html>');process.exit(1);}

// opts.confirm: confirm の戻り値を制御（既定 true）。呼出回数は ctx._confirmCalls で参照可能。
function loadEnv(opts){
  opts = opts || {};
  const ctx = makeContext();
  ctx._confirmCalls = 0;
  const confirmFn = function(){ ctx._confirmCalls++; return (typeof opts.confirm==='boolean')?opts.confirm:true; };
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
       describeClassStartButton:describeClassStartButton,
       buildClassStartConfirmMessage:buildClassStartConfirmMessage,
       renderClassStartButton:renderClassStartButton,
       onClickClassStart:onClickClassStart,
       renderRegList:renderRegList,
       regClassStartBtnId:regClassStartBtnId,
       regClassReadinessId:regClassReadinessId,
       collectStartCandidateForClass:collectStartCandidateForClass,
       collectStartCandidates:collectStartCandidates,
       startTournamentForClass:startTournamentForClass,
       startTournament:startTournament,
       save:save, load:load,
       STORAGE_KEY:STORAGE_KEY,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, confirmFn, function(){return '';},
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

// 架空 state：A=偶数(4名・未開始), B=奇数(3名・未開始)。
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
// B. describeClassStartButton: kind → ボタン表示/活性への純粋写像（全分岐）
//    開始判定は再実装せず kind を入力に取る（§6）。
// ============================================================
{
  const env = loadEnv();
  const f = env.describeClassStartButton;
  const A = {id:'A',name:'Aクラス',started:false};

  const okv = f('ok', A);
  assert(okv.show===true && okv.enabled===true, 'B1 ok → 表示・活性');
  assert(okv.label.indexOf('Aクラス')>=0 && okv.label.indexOf('1局目を作成')>=0, 'B2 ok → 「Aクラスの1局目を作成」');

  const odd = f('odd', A);
  assert(odd.show===true && odd.enabled===false, 'B3 odd → 表示・非活性（押せない）');
  assert(odd.label.indexOf('1局目を作成')>=0, 'B4 odd → ラベルは「1局目を作成」（理由は readiness バッジ側）');

  const few = f('too-few', A);
  assert(few.show===true && few.enabled===false, 'B5 too-few → 表示・非活性');

  const started = f('skip-already-started', A);
  assert(started.show===true && started.enabled===false, 'B6 skip-already-started → 表示・非活性');
  assert(started.label.indexOf('開始済み')>=0, 'B7 skip-already-started → ラベル「開始済み」（押せない＝再作成しない）');
  assert(started.tone==='started', 'B8 skip-already-started → tone=started（情報表示の色）');

  const empty = f('skip-empty', A);
  assert(empty.show===false, 'B9 skip-empty(0名) → 非表示（参加者未登録のクラスにボタンを出さない）');

  const unknown = f('???', A);
  assert(unknown.show===false, 'B10 未知 kind → 非表示（安全既定）');

  // クラス名のフォールバック（name 不在 → id+クラス）／純粋関数
  assert(f('ok',{id:'C',started:false}).label.indexOf('Cクラス')>=0, 'B11 name 不在は id+クラスでラベル化');
  assert(JSON.stringify(f('ok',A))===JSON.stringify(env.describeClassStartButton('ok',A)), 'B12 純粋関数（同入力→同出力・副作用なし）');
}

// ============================================================
// M. buildClassStartConfirmMessage: 誤開始防止の確認文言（純関数）
// ============================================================
{
  const env = loadEnv();
  const m = env.buildClassStartConfirmMessage({id:'A',name:'Aクラス',started:false}, 4);
  assert(m.indexOf('Aクラス')>=0, 'M1 確認文言にクラス名を含む（別クラス誤開始防止）');
  assert(m.indexOf('4')>=0, 'M2 確認文言に人数を含む（人数の目視確認）');
  assert(m.indexOf('よろしいですか')>=0, 'M3 確認文言に「よろしいですか」を含む');
  assert(env.buildClassStartConfirmMessage({id:'A',name:'Aクラス',started:false}, -1).indexOf('0名')>=0, 'M4 count 異常値(-1)は 0名 として扱う（防御的）');
}

// ============================================================
// I. validateStartableClass → describeClassStartButton 連動
//    （ボタン状態は必ず validateStartableClass の kind を入力にする＝判定一元化 §6）
// ============================================================
{
  const env = loadEnv();
  function btnFor(classInfo, players){
    const r = env.validateStartableClass(classInfo, players);
    return { kind:r.kind, btn:env.describeClassStartButton(r.kind, classInfo) };
  }
  const s = fxState();
  const A = s.classes[0], B = s.classes[1];

  const a = btnFor(A, s.players.A); // 4名・偶数・未開始
  assert(a.kind==='ok' && a.btn.enabled===true, 'I1 A(4名/偶数/未開始) → ok → ボタン活性');

  const b = btnFor(B, s.players.B); // 3名・奇数
  assert(b.kind==='odd' && b.btn.enabled===false, 'I2 B(3名/奇数) → odd → ボタン非活性');

  const one = btnFor({id:'A',name:'Aクラス',started:false}, [s.players.A[0]]);
  assert(one.kind==='too-few' && one.btn.enabled===false, 'I3 1名 → too-few → 非活性');

  const none = btnFor({id:'A',name:'Aクラス',started:false}, []);
  assert(none.kind==='skip-empty' && none.btn.show===false, 'I4 0名 → skip-empty → 非表示');

  const run = btnFor({id:'A',name:'Aクラス',started:true}, s.players.A);
  assert(run.kind==='skip-already-started' && run.btn.enabled===false && run.btn.label.indexOf('開始済み')>=0, 'I5 started=true → skip-already-started → 非活性「開始済み」');
}

// ============================================================
// R. renderClassStartButton / renderRegList：派生描画・state 不変・保存しない
//    START-001 readiness 表示が共存して残る。
// ============================================================
{
  const env = loadEnv();
  env._setState(env.normalizeState(fxState()));
  const before = JSON.stringify(env._getState());
  env.renderRegList(); // readiness ＋ 開始ボタンをクラス見出し直下へ描画（save は呼ばない）
  const after = JSON.stringify(env._getState());

  const aBtn = env._ctx._elements['a-start-btn'];
  const bBtn = env._ctx._elements['b-start-btn'];

  // R1 A(偶数) は活性ボタン「Aクラスの1局目を作成」が DOM に出る
  assert(aBtn && aBtn.textContent.indexOf('1局目を作成')>=0, 'R1 A の開始ボタンが「1局目を作成」と出る');
  assert(aBtn.disabled===false && aBtn.style.display==='inline-block', 'R2 A(ok) のボタンは活性・表示される');
  // R3 B(奇数) は非活性ボタン
  assert(bBtn && bBtn.disabled===true && bBtn.style.display==='inline-block', 'R3 B(奇数) のボタンは非活性で表示（押せない）');

  // R4 START-001 readiness 表示が共存して残る（START-003 で消えない）
  const aBadge = env._ctx._elements['a-readiness'];
  assert(aBadge && aBadge.textContent.indexOf('開始できます')>=0, 'R4 START-001 readiness（A=「開始できます」）が共存して残る');

  // R5 描画は state を mutate しない（派生値＝保存対象にしない）
  assert(before===after, 'R5 renderRegList（開始ボタン込み）が state を変更しない（派生値）');

  // R6 renderRegList 単体は localStorage へ書かない
  assert(!('shogi_v4' in env._ctx.localStorage._), 'R6 ボタン描画だけでは localStorage(shogi_v4) に書き込まない');

  // R7 save()→ 保存 JSON にボタン状態フィールドが無い（state に新フィールドを足していない）
  env.save();
  const persisted = env._ctx.localStorage.getItem('shogi_v4') || '';
  assert(persisted.indexOf('reg-class-start')<0 && persisted.indexOf('"startButton"')<0 && persisted.indexOf('data-regstart-bound')<0, 'R7 保存 JSON にボタン状態フィールドが無い（派生値・非永続）');

  // R8 load 後も classes[A] にボタン関連キーが付かない（後方互換）
  env.load();
  const klass = (env._getState().classes||[]).find(function(c){return c.id==='A';});
  assert(klass && !('startButton' in klass) && !('receptionConfirmed' in klass), 'R8 load 後も classes[A] にボタン/受付確定キーが付かない（後方互換・START-006 未実装）');

  // R9 ボタン要素が無い classId でも例外を投げない（破損 DOM 耐性 / 実 DOM では if(!el)return の no-op）
  let threw=false; try{ env.renderClassStartButton('ZZ', {id:'ZZ',name:'ZZクラス',started:false}, []); }catch(e){ threw=true; }
  assert(!threw, 'R9 ボタン要素が無い classId でも例外なく描画スキップ');
}

// ============================================================
// C. onClickClassStart：押下で（確認後）既存 startTournamentForClass 経由になる
//    A だけ開始しても B は未開始（class atomic）。ok 以外は確認なしで既存 guard に委ねる。
// ============================================================
{
  // C1-C5: confirm=true → A だけ開始
  const env = loadEnv({confirm:true});
  env._setState(env.normalizeState(fxState()));
  env.onClickClassStart('A');
  const st = env._getState();
  assert(env._ctx._confirmCalls===1, 'C1 ok クラスの押下で確認ダイアログが出る（confirm 1回）');
  const aStarted = st.classes.find(function(c){return c.id==='A';}).started===true;
  const bStarted = st.classes.find(function(c){return c.id==='B';}).started===true;
  assert(aStarted===true, 'C2 confirm OK で A は started=true（既存 startTournamentForClass 経由）');
  assert(bStarted===false, 'C3 A 開始後も B は started=false（class atomic・他クラス非破壊）');
  assert(Array.isArray(st.pairings.A) && st.pairings.A.length>0, 'C4 A の 1局目（pairings）が生成される');
  assert(Array.isArray(st.pairings.B) && st.pairings.B.length===0, 'C5 B の pairings は空のまま（A 開始に巻き込まれない）');

  // C6-C7: confirm=false → 開始しない（誤開始防止）
  const env2 = loadEnv({confirm:false});
  env2._setState(env2.normalizeState(fxState()));
  env2.onClickClassStart('A');
  const st2 = env2._getState();
  assert(env2._ctx._confirmCalls===1, 'C6 confirm キャンセルでも確認は出ている（confirm 1回）');
  assert(st2.classes.find(function(c){return c.id==='A';}).started===false && st2.pairings.A.length===0, 'C7 confirm キャンセルで A は開始されない（誤開始防止）');

  // C8-C9: ok 以外（B=奇数）は確認を出さず既存 guard に委ねる（開始しない）
  const env3 = loadEnv({confirm:true});
  env3._setState(env3.normalizeState(fxState()));
  env3.onClickClassStart('B'); // B は odd
  const st3 = env3._getState();
  assert(env3._ctx._confirmCalls===0, 'C8 ok 以外（奇数 B）の押下では確認を出さない（既存 guard に委ねる）');
  assert(st3.classes.find(function(c){return c.id==='B';}).started===false, 'C9 奇数 B は開始されない（startTournamentForClass の既存 guard）');
}

// ============================================================
// S. 既存開始ロジック不変の回帰（START-003 は判定・開始・#startBtn を変えない）
// ============================================================
{
  const env = loadEnv();
  // S1 validateStartableClass の kind が従来どおり（判定意味の不変）
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false}, [1,2,3,4]).kind==='ok', 'S1 偶数2名以上・未開始 → ok');
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:false}, [1,2,3]).kind==='odd', 'S2 奇数 → odd');
  assert(env.validateStartableClass({id:'A',name:'Aクラス',started:true}, [1,2]).kind==='skip-already-started', 'S3 started=true → skip-already-started');

  // S4 collectStartCandidateForClass は class atomic（B が奇数でも A 単独は ok）
  const s = fxState();
  assert(env.collectStartCandidateForClass('A', s.classes, s.players).ok===true, 'S4 A 単独 collect は B(奇数) に引きずられず ok');

  // S5 bulk collectStartCandidates（#startBtn 経路）は B 奇数で all-or-nothing error（既存挙動維持）
  const bulk = env.collectStartCandidates(s.classes, s.players);
  assert(bulk.ok===false && bulk.errors.some(function(e){return e.kind==='odd';}), 'S5 一括 collect は B 奇数で error（#startBtn の all-or-nothing 維持）');

  // S6 一括開始 startTournament が存在する（#startBtn の bind 先・未変更）
  assert(typeof env.startTournament==='function', 'S6 startTournament（#startBtn 経路）が存在し未削除');

  // S7 START-001 の readiness 写像も不変（共存）
  assert(env.describeClassReadiness('ok',4).tone==='ready', 'S7 START-001 describeClassReadiness は不変（共存）');
}

console.log('');
console.log('  SHOGI-TOUR-START-003 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
