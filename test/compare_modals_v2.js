#!/usr/bin/env node
// モーダルの最終的なDOMツリーを比較(appendChild + innerHTML 両方を扱う)
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
  const elements = {};
  let bodyChildren = [];
  
  function makeElem(tag) {
    const el = {
      tagName: (tag || 'div').toUpperCase(),
      id: '',
      _innerHTML: '',
      _children: [],
      _attrs: {},
      _styleText: '',
      style: {
        get cssText() { return el._styleText; },
        set cssText(v) { el._styleText = v; }
      },
      className: '',
      get innerHTML() { return el._innerHTML; },
      set innerHTML(v) {
        el._innerHTML = v;
        // HTMLに含まれる id をスキャンして elements に登録(ボタン等を後で参照可能に)
        const idRe = /id="([^"]+)"/g;
        let m;
        while ((m = idRe.exec(v)) !== null) {
          elements[m[1]] = makeElem('div');
          elements[m[1]].id = m[1];
        }
        // firstChild サポート(changePairing で使用)
        const firstId = v.match(/<div[^>]*id="([^"]+)"/);
        if (firstId) {
          el.firstChild = elements[firstId[1]] || makeElem('div');
          el.firstChild.id = firstId[1];
          // firstChild にも innerHTML をセット(ネストされたHTML)
          const inner = v.replace(/^<div[^>]*>/,'').replace(/<\/div>$/,'');
          el.firstChild._innerHTML = inner;
        }
      },
      addEventListener() {},
      appendChild(child) {
        el._children.push(child);
        if (child.id) elements[child.id] = child;
      },
      removeChild() {},
      remove() {},
      focus() {},
      click() {},
      value: '',
      firstChild: null
    };
    return el;
  }
  
  const docMock = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElem('div');
      return elements[id];
    },
    createElement(tag) { return makeElem(tag); },
    body: {
      appendChild(child) {
        bodyChildren.push(child);
        if (child.id) elements[child.id] = child;
      },
      removeChild(child) { bodyChildren = bodyChildren.filter(c => c !== child); }
    },
    addEventListener() {},
    _bodyChildren: () => bodyChildren
  };
  
  // 再帰シリアライズ: タグ、ID、style、子要素、innerHTML を順にシリアライズ
  function serialize(node) {
    if (!node) return '';
    let s = '<' + node.tagName.toLowerCase();
    if (node.id) s += ' id="' + node.id + '"';
    if (node._styleText) s += ' style="' + node._styleText + '"';
    s += '>';
    // 子要素を再帰
    if (node._children && node._children.length > 0) {
      node._children.forEach(c => { s += serialize(c); });
    }
    // innerHTML がある場合(モーダル本体のHTML)
    if (node._innerHTML) s += node._innerHTML;
    s += '</' + node.tagName.toLowerCase() + '>';
    return s;
  }
  
  docMock._serialize = function() {
    return bodyChildren.map(serialize).join('|');
  };
  
  const winMock = { innerWidth: 1024 };
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=v;}, removeItem(k){delete this._[k];}};
  return { document: docMock, window: winMock, localStorage: localStorageMock };
}

function runAndGetDom(jsCode, stateData, openCall) {
  const ctx = makeContext(stateData);
  const fn = new Function('document', 'window', 'localStorage', 'alert', 'confirm', 'prompt', 'FileReader', 'Blob', 'URL',
    `${jsCode};
     state = arguments[arguments.length-1];
     ${openCall};
     return document._serialize();`);
  return fn(ctx.document, ctx.window, ctx.localStorage, ()=>{}, ()=>true, ()=>null, function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}}, stateData);
}

const beforePath = process.argv[2];
const afterPath = process.argv[3];
if (!beforePath || !afterPath) {
  console.error('Usage: node compare_modals_v2.js <before.html> <after.html>');
  process.exit(1);
}

const beforeJs = extractScripts(beforePath);
const afterJs = extractScripts(afterPath);

const baseState = {
  players:{A:[
    {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan'},
    {id:'p2',name:'鈴木',cls:'A',member:'member',grade:'ippan'},
    {id:'p3',name:'佐藤',cls:'A',member:'other',grade:'ippan'},
    {id:'p4',name:'高橋<太郎>&"test"',cls:'A',member:'other',grade:'chu'}
  ], B:[]},
  rounds:4,
  pairings:{A:[{p1:'p1',p2:'p2',winner:null}, {p1:'p3',p2:'p4',winner:null}], B:[]},
  results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]], B:[]},
  started:true
};

const testCases = [
  {name: 'bulkEditNames(A)', call: "bulkEditNames('A')"},
  {name: "changePairing(A,0)", call: "changePairing('A',0)"},
  {name: "changePairing(A,1) [特殊文字含む選手]", call: "changePairing('A',1)"},
  {name: "editPastResult(A,0,0)", call: "editPastResult('A',0,0)"},
  {name: "editPastResult(A,0,1) [特殊文字含む選手]", call: "editPastResult('A',0,1)"}
];

let pass = 0, fail = 0;
for (const tc of testCases) {
  try {
    const beforeDom = runAndGetDom(beforeJs, JSON.parse(JSON.stringify(baseState)), tc.call);
    const afterDom = runAndGetDom(afterJs, JSON.parse(JSON.stringify(baseState)), tc.call);
    if (beforeDom === afterDom) {
      console.log(`  ✓ ${tc.name}: DOMツリー完全一致 (${beforeDom.length} chars)`);
      pass++;
    } else {
      console.log(`  ✗ ${tc.name}: 不一致`);
      console.log(`    before: ${beforeDom.length} chars, after: ${afterDom.length} chars`);
      let i = 0;
      while (i < Math.min(beforeDom.length, afterDom.length) && beforeDom[i] === afterDom[i]) i++;
      console.log(`    最初の差分位置: ${i}`);
      console.log(`    before周辺: ${JSON.stringify(beforeDom.substring(Math.max(0,i-30), i+50))}`);
      console.log(`    after周辺:  ${JSON.stringify(afterDom.substring(Math.max(0,i-30), i+50))}`);
      fail++;
    }
  } catch (e) {
    console.log(`  ✗ ${tc.name}: 実行エラー - ${e.message.substring(0,200)}`);
    fail++;
  }
}
console.log(`\n結果: PASS=${pass}, FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
