#!/usr/bin/env node
// LAST-ATTENDED-YEAR-001 (#602) / CROSSTABLE-HEADER-INFO-001 (#603) 受入テスト（純関数）。
//   #602: _masterSheetFmtDate は当年短縮を廃止し常に年付き（YYYY/M/D）。不明/空は「－」。
//   #603: countTournamentParticipants は全登録クラスの参加者数合計。formatTimeControl の
//         持ち時間ラベルと合わせて対戦成績表ヘッダーの追加情報を支える。
//   データは完全架空のみ。shogi_v4.html は変更しない（test/ のみ）。

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
if(!targetPath){console.error('Usage: node test_crosstable_last_attended_602_603.js <html>');process.exit(1);}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  let _uuidSeq = 0;
  const cryptoMock = {randomUUID(){
    _uuidSeq++;
    const hex = ('00000000000' + _uuidSeq.toString(16)).slice(-12);
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-4000-8000-000000000000';
  }};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    js + `;
     return {
       _masterSheetFmtDate:_masterSheetFmtDate,
       countTournamentParticipants:countTournamentParticipants,
       formatTimeControl:formatTimeControl,
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

function fxState(playersA, playersB){
  return {
    players:{A:playersA||[], B:playersB||[]},
    rounds:0, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{}
  };
}

// #602 _masterSheetFmtDate: 常に年付き（当年短縮の廃止）
{
  const env = loadEnv();
  const f = env._masterSheetFmtDate;
  assert(f('2024-03-05')==='2024/3/5',  '#602-1 past year YYYY/M/D');
  assert(f('2026-06-14')==='2026/6/14', '#602-2 no zero-pad, year kept');
  assert(f('2020-12-31')==='2020/12/31','#602-3 two-digit m/d kept with year');
  const y = new Date().getFullYear();
  assert(env._masterSheetFmtDate(y+'-06-14') === (y+'/6/14'), '#602-4 current year still year-prefixed');
  assert(f('')==='－',    '#602-5 empty => dash');
  assert(f(null)==='－',  '#602-6 null => dash');
}

// #603 countTournamentParticipants: 全登録クラスの参加者数合計
{
  const env = loadEnv();
  env._setState(fxState([{id:'a1',name:'x'},{id:'a2',name:'y'}], [{id:'b1',name:'z'}]));
  assert(env.countTournamentParticipants()===3, '#603-1 A2+B1=3');
  env._setState(fxState([], []));
  assert(env.countTournamentParticipants()===0, '#603-2 zero participants => 0');
  env._setState(fxState([{id:'a1',name:'x'}], []));
  assert(env.countTournamentParticipants()===1, '#603-3 single class sum');
}

// #603 formatTimeControl: ヘッダーの持ち時間ラベル
{
  const env = loadEnv();
  assert(env.formatTimeControl({timeType:'sudden',timeMain:25})==='25分切れ負け', '#603-4 sudden label');
  assert(env.formatTimeControl({timeType:'byoyomi',timeMain:20,timeByoyomi:30})==='20分（切れたら一手30秒）', '#603-5 byoyomi label');
}

console.log('LAST-ATTENDED-YEAR/CROSSTABLE-HEADER: PASS='+pass+' FAIL='+fail);
process.exit(fail>0?1:0);
