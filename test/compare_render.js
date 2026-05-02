#!/usr/bin/env node
// renderTournament の出力HTMLを before/after で実行比較
// 引数: <before.html> <after.html>
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
  // ブラウザDOMの最小モック
  const elements = {};
  const docMock = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          id, innerHTML: '', style: {display: ''}, className: '',
          addEventListener() {},
          appendChild() {}, removeChild() {}, remove() {},
        };
      }
      return elements[id];
    },
    createElement() {
      return { innerHTML: '', appendChild() {}, firstChild: null, style:{cssText:''} };
    },
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {}
  };
  const winMock = { innerWidth: 1024, location: {} };
  const localStorageMock = {
    _: {}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=v;}, removeItem(k){delete this._[k];}
  };
  return { document: docMock, window: winMock, localStorage: localStorageMock, alert(){}, confirm(){return true;}, prompt(){return null;}, FileReader: function(){}, Blob: function(){}, URL: {createObjectURL(){return'';}, revokeObjectURL(){}}, state: stateData, _elements: elements };
}

function runAndGetHtml(jsCode, stateData) {
  const ctx = makeContext(stateData);
  const fn = new Function('document', 'window', 'localStorage', 'alert', 'confirm', 'prompt', 'FileReader', 'Blob', 'URL',
    `${jsCode};
     // state を注入(load() で上書きされないように override)
     state = arguments[arguments.length-1];
     renderTournament('A');
     return document.getElementById('pane-A').innerHTML;`);
  return fn(ctx.document, ctx.window, ctx.localStorage, ctx.alert, ctx.confirm, ctx.prompt, ctx.FileReader, ctx.Blob, ctx.URL, stateData);
}

const beforePath = process.argv[2];
const afterPath = process.argv[3];
if (!beforePath || !afterPath) {
  console.error('Usage: node compare_render.js <before.html> <after.html>');
  process.exit(1);
}

const beforeJs = extractScripts(beforePath);
const afterJs = extractScripts(afterPath);

// テストケース: 4種類のstate
const testCases = [
  {
    name: '空の参加者',
    state: {players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false}
  },
  {
    name: '4名登録、対局未開始',
    state: {
      players:{A:[
        {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'鈴木',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'佐藤',cls:'A',member:'other',grade:'ippan'},
        {id:'p4',name:'高橋',cls:'A',member:'other',grade:'chu'}
      ], B:[]},
      rounds:4,
      pairings:{A:[{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null}], B:[]},
      results:{A:[],B:[]},
      started:true
    }
  },
  {
    name: '1回戦終了、2回戦進行中',
    state: {
      players:{A:[
        {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'鈴木',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'佐藤',cls:'A',member:'other',grade:'ippan'},
        {id:'p4',name:'高橋',cls:'A',member:'other',grade:'chu'}
      ], B:[]},
      rounds:4,
      pairings:{A:[{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:null}], B:[]},
      results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]], B:[]},
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
      rounds:4,
      pairings:{A:[{p1:'s1',p2:'s2',winner:null}], B:[]},
      results:{A:[],B:[]},
      started:true
    }
  }
];

let pass = 0, fail = 0;
for (const tc of testCases) {
  try {
    const beforeHtml = runAndGetHtml(beforeJs, JSON.parse(JSON.stringify(tc.state)));
    const afterHtml = runAndGetHtml(afterJs, JSON.parse(JSON.stringify(tc.state)));
    if (beforeHtml === afterHtml) {
      console.log(`  ✓ ${tc.name}: HTML完全一致 (${beforeHtml.length} chars)`);
      pass++;
    } else {
      console.log(`  ✗ ${tc.name}: 不一致`);
      console.log(`    before: ${beforeHtml.length} chars`);
      console.log(`    after:  ${afterHtml.length} chars`);
      // 差分の最初の差分位置を表示
      let i = 0;
      while (i < Math.min(beforeHtml.length, afterHtml.length) && beforeHtml[i] === afterHtml[i]) i++;
      console.log(`    最初の差分位置: ${i}`);
      console.log(`    before周辺: ...${JSON.stringify(beforeHtml.substring(Math.max(0,i-30), i+50))}`);
      console.log(`    after周辺:  ...${JSON.stringify(afterHtml.substring(Math.max(0,i-30), i+50))}`);
      fail++;
    }
  } catch (e) {
    console.log(`  ✗ ${tc.name}: 実行エラー`);
    console.log(`    ${e.message}`);
    fail++;
  }
}
console.log(`\n結果: PASS=${pass}, FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
