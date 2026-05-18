#!/usr/bin/env node
// initApp と loadData のタブ選択ロジックを検証
const fs = require('fs');

function extractScripts(path) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(stateData) {
  let activeTab = null;
  const elements = {};
  function makeElem(id) {
    return {
      id: id || '',
      _innerHTML: '',
      style: { _cssText: '', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      className: '',
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(){},
      appendChild(){},
      remove(){},
      focus(){},
      click(){},
      value: '',
      firstChild: null
    };
  }
  const docMock = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElem(id);
      return elements[id];
    },
    createElement(tag){return makeElem();},
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){}
  };
  const winMock = { innerWidth: 1024 };
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=v;}, removeItem(k){delete this._[k];}};
  return { document: docMock, window: winMock, localStorage: localStorageMock, _state: stateData };
}

function runInitAppAndGetActiveTab(jsCode, stateData) {
  const ctx = makeContext(stateData);
  const fn = new Function('document', 'window', 'localStorage', 'alert', 'confirm', 'prompt', 'FileReader', 'Blob', 'URL',
    `${jsCode};
     // load() が localStorage を見ないよう state を直接注入
     state = arguments[arguments.length-1];
     // initApp の中の load() を空にして、注入した state を使う
     load = function(){};
     initApp();
     // どのpane が block かを返す
     var panes = ['reg','tournament','result'];
     for (var i=0;i<panes.length;i++){
       var el = document.getElementById('pane-'+panes[i]);
       if (el && el.style && el.style.display === 'block') return panes[i];
     }
     return null;`);
  return fn(ctx.document, ctx.window, ctx.localStorage, ()=>{}, ()=>true, ()=>null, function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}}, stateData);
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_tab_selection.js <html>');
  process.exit(1);
}

const js = extractScripts(targetPath);

const testCases = [
  {
    name: '未開始(参加者なし、started=false) → タブ選択なし(初期表示regのまま)',
    state: {players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false},
    expected: null
  },
  // ROUND-CLASS-START-005 (spec §15.1 row 3): isTournamentDone は state.classes 駆動に置換。
  //   post-005 では state.classes が必ず存在する前提（normalizeState が保証）。
  //   この test は normalizeState を経由せず state を直接注入するため、
  //   各 fixture に classes を明示する必要がある。
  {
    name: '開始済み・1回戦のみ終了(進行中) → tournament',
    state: {
      players:{A:[
        {id:'p1',name:'a',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'b',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'c',cls:'A',member:'member',grade:'ippan'},
        {id:'p4',name:'d',cls:'A',member:'member',grade:'ippan'}
      ],B:[]},
      rounds:4,
      pairings:{A:[{p1:'p1',p2:'p3',winner:null},{p1:'p2',p2:'p4',winner:null}],B:[]},
      results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]],B:[]},
      started:true,
      classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}]
    },
    expected: 'tournament'
  },
  {
    name: '開始済み・全4回戦終了(完了) → result',
    state: {
      players:{A:[
        {id:'p1',name:'a',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'b',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'c',cls:'A',member:'member',grade:'ippan'},
        {id:'p4',name:'d',cls:'A',member:'member',grade:'ippan'}
      ],B:[]},
      rounds:4,
      pairings:{A:[],B:[]},
      results:{A:[
        [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}],
        [{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:'p2'}],
        [{p1:'p1',p2:'p4',winner:'p1'},{p1:'p2',p2:'p3',winner:'p3'}],
        [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]
      ],B:[]},
      started:true,
      classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}]
    },
    expected: 'result'
  },
  {
    name: 'A完了+B進行中 → tournament(まだ完了していないクラスがある)',
    state: {
      players:{
        A:[{id:'a1',name:'a',cls:'A',member:'member',grade:'ippan'},{id:'a2',name:'b',cls:'A',member:'member',grade:'ippan'}],
        B:[{id:'b1',name:'c',cls:'B',member:'member',grade:'ippan'},{id:'b2',name:'d',cls:'B',member:'member',grade:'ippan'}]
      },
      rounds:4,
      pairings:{A:[],B:[{p1:'b1',p2:'b2',winner:null}]},
      results:{
        A:[
          [{p1:'a1',p2:'a2',winner:'a1'}],
          [{p1:'a1',p2:'a2',winner:'a1'}],
          [{p1:'a1',p2:'a2',winner:'a1'}],
          [{p1:'a1',p2:'a2',winner:'a1'}]
        ],
        B:[]
      },
      started:true,
      classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}]
    },
    expected: 'tournament'
  },
  {
    name: 'A+B両クラス完了 → result',
    state: {
      players:{
        A:[{id:'a1',name:'a',cls:'A',member:'member',grade:'ippan'},{id:'a2',name:'b',cls:'A',member:'member',grade:'ippan'}],
        B:[{id:'b1',name:'c',cls:'B',member:'member',grade:'ippan'},{id:'b2',name:'d',cls:'B',member:'member',grade:'ippan'}]
      },
      rounds:4,
      pairings:{A:[],B:[]},
      results:{
        A:[[{p1:'a1',p2:'a2',winner:'a1'}],[{p1:'a1',p2:'a2',winner:'a1'}],[{p1:'a1',p2:'a2',winner:'a1'}],[{p1:'a1',p2:'a2',winner:'a1'}]],
        B:[[{p1:'b1',p2:'b2',winner:'b1'}],[{p1:'b1',p2:'b2',winner:'b1'}],[{p1:'b1',p2:'b2',winner:'b1'}],[{p1:'b1',p2:'b2',winner:'b1'}]]
      },
      started:true,
      classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}]
    },
    expected: 'result'
  },
  {
    name: 'started=false で参加者あり(登録途中) → タブ選択なし',
    state: {
      players:{A:[{id:'p1',name:'a',cls:'A',member:'member',grade:'ippan'}],B:[]},
      rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},
      started:false
    },
    expected: null
  }
];

let pass=0, fail=0;
for (const tc of testCases) {
  try {
    const result = runInitAppAndGetActiveTab(js, JSON.parse(JSON.stringify(tc.state)));
    if (result === tc.expected) {
      console.log(`  ✓ ${tc.name} (実際: ${result || '初期表示'})`);
      pass++;
    } else {
      console.log(`  ✗ ${tc.name}`);
      console.log(`    期待: ${tc.expected || '初期表示(null)'}, 実際: ${result || '初期表示(null)'}`);
      fail++;
    }
  } catch (e) {
    console.log(`  ✗ ${tc.name}: 実行エラー - ${e.message.substring(0,200)}`);
    fail++;
  }
}
// ============================================================
// T02: localStorage フォールバック・sanitizeMatch テスト
// ============================================================

// localStorage に値を仕込んで initApp() を実行し、最終的な state を取得
function runInitAppFromLocalStorage(jsCode, lsData) {
  const ctx = makeContext(null);
  for (const k in lsData) ctx.localStorage._[k] = lsData[k];
  const fn = new Function(
    'document', 'window', 'localStorage', 'alert', 'confirm', 'prompt',
    'FileReader', 'Blob', 'URL',
    `${jsCode}
     initApp();
     return state;`
  );
  return fn(ctx.document, ctx.window, ctx.localStorage,
    () => {}, () => true, () => null,
    function(){}, function(){},
    {createObjectURL: () => '', revokeObjectURL: () => {}});
}

// rawState を normalizeState に通し、sanitize 後の状態と calcFinal 例外有無を返す
function runNormalizeAndCalcFinal(jsCode, rawState) {
  const ctx = makeContext(null);
  const fn = new Function(
    'document', 'window', 'localStorage', 'alert', 'confirm', 'prompt',
    'FileReader', 'Blob', 'URL', 'rawState',
    `${jsCode}
     var normalized = normalizeState(rawState);
     state = normalized;
     var crashed = false;
     var err = null;
     try { calcFinal('A'); } catch(e) { crashed = true; err = String(e.message || e); }
     return { state: normalized, crashed: crashed, err: err };`
  );
  return fn(ctx.document, ctx.window, ctx.localStorage,
    () => {}, () => true, () => null,
    function(){}, function(){},
    {createObjectURL: () => '', revokeObjectURL: () => {}}, rawState);
}

console.log('\n--- T02: localStorage フォールバック・sanitizeMatch ---');

// シナリオ1: shogi_v4 が壊れたJSON、shogi_v3 が正常 → v3 のデータで initApp 成功
try {
  const v3Data = JSON.stringify({
    players: { A: [{ id: 'v3p1', name: 'V3プレイヤー', cls: 'A', member: 'member', grade: 'ippan' }], B: [] },
    rounds: 4, pairings: { A: [], B: [] }, results: { A: [], B: [] }, started: false
  });
  const result = runInitAppFromLocalStorage(js, {
    shogi_v4: '{ this is broken json',
    shogi_v3: v3Data
  });
  if (result.players.A.length === 1 && result.players.A[0].name === 'V3プレイヤー') {
    console.log('  ✓ シナリオ1: v4破損→v3正常 で v3データロード'); pass++;
  } else {
    console.log('  ✗ シナリオ1: v3 にフォールバックされていない', JSON.stringify(result.players.A));
    fail++;
  }
} catch (e) {
  console.log('  ✗ シナリオ1: 実行エラー -', e.message.substring(0, 200));
  fail++;
}

// シナリオ2: shogi_v4・shogi_v3 両方が壊れている → 初期state(空・未開始)
try {
  const result = runInitAppFromLocalStorage(js, {
    shogi_v4: '{{{ totally broken',
    shogi_v3: '~~~ also broken'
  });
  if (result.players.A.length === 0 && result.players.B.length === 0 && result.started === false) {
    console.log('  ✓ シナリオ2: 両方破損→初期state'); pass++;
  } else {
    console.log('  ✗ シナリオ2: 初期stateになっていない', 'A=', result.players.A.length, 'B=', result.players.B.length, 'started=', result.started);
    fail++;
  }
} catch (e) {
  console.log('  ✗ シナリオ2: 実行エラー -', e.message.substring(0, 200));
  fail++;
}

// シナリオ3: 不明なplayer idを含む pairings/results を normalizeState に渡す → sanitizeMatchで除去、calcFinalがクラッシュしない
try {
  const rawState = {
    players: { A: [
      { id: 'p1', name: '実在A', cls: 'A', member: 'member', grade: 'ippan' },
      { id: 'p2', name: '実在B', cls: 'A', member: 'member', grade: 'ippan' }
    ], B: [] },
    rounds: 4,
    // pairings に未登録の id 'pX', 'pY' を混入
    pairings: { A: [
      { p1: 'pX', p2: 'pY', winner: 'pX' },
      { p1: 'p1', p2: 'pZ', winner: 'pZ' }
    ], B: [] },
    // results にも未登録 id を混入。winner も p1/p2 と無関係なケース
    results: { A: [
      [
        { p1: 'pA', p2: 'pB', winner: 'pA' },
        { p1: 'p1', p2: 'p2', winner: 'pBOGUS' }
      ]
    ], B: [] },
    started: true
  };
  const result = runNormalizeAndCalcFinal(js, rawState);
  // sanitizeMatch でpairings/resultsの不正エントリは除去される
  const okPairings = result.state.pairings.A.length === 0;
  const r0 = result.state.results.A[0] || [];
  // r0 内: pA/pB は除去、p1/p2 は残るが winner は pBOGUS で null 化
  const okResults = r0.length === 1 && r0[0].p1 === 'p1' && r0[0].p2 === 'p2' && r0[0].winner === null;
  const okNoCrash = !result.crashed;
  if (okPairings && okResults && okNoCrash) {
    console.log('  ✓ シナリオ3: sanitizeMatch で不正id除去・calcFinal非クラッシュ'); pass++;
  } else {
    console.log('  ✗ シナリオ3: sanitize結果が想定外',
      'pairings=', JSON.stringify(result.state.pairings.A),
      'results[0]=', JSON.stringify(r0),
      'crashed=', result.crashed, 'err=', result.err);
    fail++;
  }
} catch (e) {
  console.log('  ✗ シナリオ3: 実行エラー -', e.message.substring(0, 200));
  fail++;
}

console.log(`\n結果: PASS=${pass}, FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
