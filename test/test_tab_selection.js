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
      started:true
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
      started:true
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
      started:true
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
      started:true
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
console.log(`\n結果: PASS=${pass}, FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
