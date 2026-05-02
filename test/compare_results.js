#!/usr/bin/env node
// renderResults の出力HTMLを before/after で実行比較
// スマホ判定の両モード(width<600 と width>=600)で確認
const fs = require('fs');

function extractScripts(path) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(stateData, isSP) {
  const elements = {};
  const docMock = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = { id, innerHTML: '', style: {display: ''}, className: '', addEventListener() {}, appendChild() {}, remove() {} };
      }
      return elements[id];
    },
    createElement() { return { innerHTML: '', appendChild() {}, firstChild: null, style:{cssText:''} }; },
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {}
  };
  const winMock = { innerWidth: isSP ? 400 : 1024, location: {} };
  return { document: docMock, window: winMock, _elements: elements };
}

function runAndGetHtml(jsCode, stateData, isSP) {
  const ctx = makeContext(stateData, isSP);
  const fn = new Function('document', 'window', 'localStorage', 'alert', 'confirm', 'prompt', 'FileReader', 'Blob', 'URL',
    `${jsCode};
     state = arguments[arguments.length-1];
     renderResults();
     return document.getElementById('result-A').innerHTML + '|||' + document.getElementById('result-B').innerHTML;`);
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=v;}, removeItem(k){delete this._[k];}};
  return fn(ctx.document, ctx.window, localStorageMock, ()=>{}, ()=>true, ()=>null, function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}}, stateData);
}

const beforePath = process.argv[2];
const afterPath = process.argv[3];
if (!beforePath || !afterPath) {
  console.error('Usage: node compare_results.js <before.html> <after.html>');
  process.exit(1);
}

const beforeJs = extractScripts(beforePath);
const afterJs = extractScripts(afterPath);

const baseTestCases = [
  {
    name: '空(両クラスとも参加者なし)',
    state: {players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false}
  },
  {
    name: '4名Aクラス、対局未開始',
    state: {
      players:{A:[
        {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'鈴木',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'佐藤',cls:'A',member:'other',grade:'ippan'},
        {id:'p4',name:'高橋',cls:'A',member:'other',grade:'chu'}
      ], B:[]},
      rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:true
    }
  },
  {
    name: '1回戦終了の途中経過',
    state: {
      players:{A:[
        {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'鈴木',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'佐藤',cls:'A',member:'other',grade:'ippan'},
        {id:'p4',name:'高橋',cls:'A',member:'other',grade:'chu'}
      ], B:[]},
      rounds:4, pairings:{A:[],B:[]},
      results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]], B:[]},
      started:true
    }
  },
  {
    name: 'A4+B4 両クラス1回戦終了',
    state: {
      players:{
        A:[
          {id:'a1',name:'青木',cls:'A',member:'member',grade:'ippan'},
          {id:'a2',name:'伊藤',cls:'A',member:'member',grade:'ippan'},
          {id:'a3',name:'上田',cls:'A',member:'other',grade:'ippan'},
          {id:'a4',name:'江口',cls:'A',member:'other',grade:'chu'}
        ],
        B:[
          {id:'b1',name:'小野',cls:'B',member:'member',grade:'ippan'},
          {id:'b2',name:'加藤',cls:'B',member:'member',grade:'chu'},
          {id:'b3',name:'木村',cls:'B',member:'other',grade:'ippan'},
          {id:'b4',name:'小林',cls:'B',member:'other',grade:'chu'}
        ]
      },
      rounds:4, pairings:{A:[],B:[]},
      results:{
        A:[[{p1:'a1',p2:'a2',winner:'a1'},{p1:'a3',p2:'a4',winner:'a3'}]],
        B:[[{p1:'b1',p2:'b2',winner:'b1'},{p1:'b3',p2:'b4',winner:'b3'}]]
      },
      started:true
    }
  },
  {
    name: '4回戦完走、最終結果',
    state: {
      players:{A:[
        {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'鈴木',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'佐藤',cls:'A',member:'other',grade:'ippan'},
        {id:'p4',name:'高橋',cls:'A',member:'other',grade:'chu'}
      ], B:[]},
      rounds:4, pairings:{A:[],B:[]},
      results:{A:[
        [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}],
        [{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:'p2'}],
        [{p1:'p1',p2:'p4',winner:'p1'},{p1:'p2',p2:'p3',winner:'p3'}],
        [{p1:'p2',p2:'p3',winner:'p2'},{p1:'p1',p2:'p4',winner:'p4'}]
      ], B:[]},
      started:true
    }
  },
  {
    name: '特殊文字を含む名前',
    state: {
      players:{A:[
        {id:'s1',name:'<script>alert(1)</script>',cls:'A',member:'member',grade:'ippan'},
        {id:'s2',name:'田中"太郎"',cls:'A',member:'other',grade:'chu'}
      ], B:[]},
      rounds:4, pairings:{A:[],B:[]},
      results:{A:[[{p1:'s1',p2:'s2',winner:'s1'}]],B:[]},
      started:true
    }
  }
];

// 各テストケースを「スマホ」「PC」両モードで実行
const testCases = [];
for (const tc of baseTestCases) {
  testCases.push({name: tc.name + ' [スマホ]', state: tc.state, isSP: true});
  testCases.push({name: tc.name + ' [PC]', state: tc.state, isSP: false});
}

let pass = 0, fail = 0;
for (const tc of testCases) {
  try {
    const beforeHtml = runAndGetHtml(beforeJs, JSON.parse(JSON.stringify(tc.state)), tc.isSP);
    const afterHtml = runAndGetHtml(afterJs, JSON.parse(JSON.stringify(tc.state)), tc.isSP);
    if (beforeHtml === afterHtml) {
      console.log(`  ✓ ${tc.name}: HTML完全一致 (${beforeHtml.length} chars)`);
      pass++;
    } else {
      console.log(`  ✗ ${tc.name}: 不一致`);
      console.log(`    before: ${beforeHtml.length} chars, after: ${afterHtml.length} chars`);
      let i = 0;
      while (i < Math.min(beforeHtml.length, afterHtml.length) && beforeHtml[i] === afterHtml[i]) i++;
      console.log(`    最初の差分位置: ${i}`);
      console.log(`    before周辺: ${JSON.stringify(beforeHtml.substring(Math.max(0,i-30), i+50))}`);
      console.log(`    after周辺:  ${JSON.stringify(afterHtml.substring(Math.max(0,i-30), i+50))}`);
      fail++;
    }
  } catch (e) {
    console.log(`  ✗ ${tc.name}: 実行エラー - ${e.message}`);
    fail++;
  }
}
console.log(`\n結果: PASS=${pass}, FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
