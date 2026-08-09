#!/usr/bin/env node
// HELP-UX-001 (#308): 対局画面の迷子防止 in-app ヘルプの単体テスト。
//   範囲（issue #308 の3点。※(1) は FIRSTROUND-ODD-001 で反転済み）:
//     (1) 旧: round-1 未割当アラートの文言 pin。FIRSTROUND-ODD-001（2026-08-09）で1回戦の
//         全員割当必須が廃止されアラートごと消えたため、現在は「再導入の禁止」と
//         「空回戦ガードの統一適用」を pin する（本文 (1) 節のコメント参照）。
//     (2) ヘルプモーダル（HELP_TEXTS レジストリ＋buildHelpModalHtml/openHelpModal/bindHelpModalEvents）が
//         三層パターンで存在し、open/close/ヘルプ文 present・本文は escapeHtml 経由（XSS 流入を増やさない）。
//         「？ ヘルプ」ボタンが対局画面の未割当セクション見出し脇に出て openHelpModal('first-round') に結線。
//     (3) 主要ボタン（1卓追加/まとめて作成/部分開始）の title= が承認済み1行ヒントになっていること。
//   既存挙動不変: 未割当セクションの既存ボタン・見出し pin・部分開始導線が壊れていないこと。
//   データは完全架空のみ（架空 …）。保存スキーマは増やさない。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_help_001.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock。既存テスト（test_frp_impl_002.js 等）方針に揃えつつ、ヘルプモーダルの open/close を
//   検証するため (a) appendChild が id を registry へ登録 (b) node.remove() が親 childNodes から外す
//   (c) addEventListener が実コールバックを保持（テストから click を発火できる）まで拡張する。
function makeContext(){
  var elements={};
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      disabled:false, type:'',
      style:{}, _attrs:{}, childNodes:[], _listeners:{}, _parent:null,
      appendChild:function(c){ c._parent=this; this.childNodes.push(c); if(c.id)elements[c.id]=c; return c; },
      remove:function(){
        if(this._parent){
          var arr=this._parent.childNodes;
          for(var i=0;i<arr.length;i++){ if(arr[i]===this){ arr.splice(i,1); break; } }
          this._parent=null;
        }
        if(this.id && elements[this.id]===this) delete elements[this.id];
      },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
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
  const warns = [];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){ warns.push(Array.prototype.slice.call(arguments)); } };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       HELP_TEXTS:HELP_TEXTS,
       buildHelpModalHtml:buildHelpModalHtml,
       openHelpModal:openHelpModal,
       bindHelpModalEvents:bindHelpModalEvents,
       buildFirstRoundPartialSectionHtml:buildFirstRoundPartialSectionHtml,
       buildClassActionBarHtml:buildClassActionBarHtml,
       startClassPartial:startClassPartial,
       isClassStarted:isClassStarted,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  api._warns = warns;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 架空 state：A=4名(偶数・未開始), B=3名(奇数・未開始)。pairings/results 空・rounds=4。
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
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}]
  };
}

console.log('\n【HELP-UX-001 (#308) 対局画面 in-app ヘルプ】');

// ───────────────────────────────────────────────────────────────────
// (2)-R レジストリ: HELP_TEXTS が固定文字列を1箇所集約
// ───────────────────────────────────────────────────────────────────
const env = loadEnv();
assert(env.HELP_TEXTS && typeof env.HELP_TEXTS==='object', 'R1 HELP_TEXTS レジストリが存在する');
const ht = env.HELP_TEXTS && env.HELP_TEXTS['first-round'];
assert(ht && typeof ht.title==='string' && ht.title.length>0, 'R2 first-round トピックに title がある');
assert(ht && Array.isArray(ht.lines) && ht.lines.length>=5, 'R3 first-round の lines が承認済み5項目以上の配列');
const joined = ht ? ht.lines.join('\n') : '';
assert(joined.indexOf('待機')>=0, 'R4 待機(leftover)の説明を含む');
assert(joined.indexOf('1卓追加')<0, 'R5 ①「1卓追加」の説明は撤去済み');
assert(joined.indexOf('選択した参加者')>=0, 'R5b ③「選択した参加者で」の説明を含む');
assert(joined.indexOf('まとめて')>=0, 'R6 「まとめて作成」の説明を含む');
assert(joined.indexOf('奇数')>=0, 'R7 奇数なら1人待機の説明を含む');
assert(joined.indexOf('勝敗')>=0 || joined.indexOf('再生成')>=0, 'R8 勝敗入力済みは不用意に再作成しない注意を含む');

// ───────────────────────────────────────────────────────────────────
// (2)-B buildHelpModalHtml: ヘルプ文 present・閉じるボタン・安全表示
// ───────────────────────────────────────────────────────────────────
const modalHtml = env.buildHelpModalHtml('first-round');
assert(typeof modalHtml==='string' && modalHtml.length>0, 'B1 buildHelpModalHtml が文字列を返す');
assert(modalHtml.indexOf(ht.title)>=0, 'B2 モーダルにタイトルが入る');
let allLinesPresent = true;
for(let i=0;i<ht.lines.length;i++){ if(modalHtml.indexOf(ht.lines[i])<0) allLinesPresent=false; }
assert(allLinesPresent, 'B3 全ヘルプ文が present（ヘルプ文 present）');
assert(modalHtml.indexOf('id="help-modal-close"')>=0, 'B4 閉じるボタン(help-modal-close)を持つ');
assert(modalHtml.indexOf('閉じる')>=0, 'B5 「閉じる」ラベルがある');
// 未知トピックは throw せず安全にフォールバック（card+閉じる）
let unknownOk=true, unknownHtml='';
try { unknownHtml = env.buildHelpModalHtml('no-such-topic'); } catch(e){ unknownOk=false; }
assert(unknownOk && unknownHtml.indexOf('id="help-modal-close"')>=0, 'B6 未知トピックでも throw せず閉じる付き card を返す');

// XSS 流入を増やさない: ヘルプ本文は escapeHtml 経由で埋め込む（innerHTML 自由文流し込みなし）
assert(/function buildHelpModalHtml/.test(RAW), 'B7 buildHelpModalHtml が定義されている');
const bhmBody = RAW.slice(RAW.indexOf('function buildHelpModalHtml'), RAW.indexOf('function buildHelpModalHtml')+1200);
assert(bhmBody.indexOf('escapeHtml(title)')>=0 && bhmBody.indexOf('escapeHtml(lines[i])')>=0, 'B8 タイトル/本文ともに escapeHtml 経由（textContent 相当の安全表示）');

// ───────────────────────────────────────────────────────────────────
// (2)-O open / close の DOM フロー
// ───────────────────────────────────────────────────────────────────
const eo = loadEnv();
eo.openHelpModal('first-round');
const body = eo._ctx.document.body;
assert(body.childNodes.length===1 && body.childNodes[0].id==='help-modal', 'O1 openHelpModal で help-modal が body に追加される（開く）');
assert(body.childNodes[0].innerHTML.indexOf(ht.lines[0])>=0, 'O2 追加されたモーダルの中身にヘルプ文が入っている');
// 閉じる: close ボタンの click ハンドラを発火 → モーダル除去
const closeNode = eo._ctx._elements['help-modal-close'];
assert(closeNode && closeNode._listeners.click && closeNode._listeners.click.length>0, 'O3 閉じるボタンに click ハンドラが結線されている');
closeNode._listeners.click[0]();
assert(eo._ctx.document.body.childNodes.length===0, 'O4 閉じるボタンでモーダルが除去される（閉じる）');

// overlay（背景）クリックで閉じる / カード内クリックでは閉じない
const eo2 = loadEnv();
eo2.openHelpModal('first-round');
const modalNode = eo2._ctx._elements['help-modal'];
assert(modalNode && modalNode._listeners.click && modalNode._listeners.click.length>0, 'O5 overlay に click ハンドラが結線されている');
modalNode._listeners.click[0]({ target:{} });   // カード内クリック相当（target≠modal）
assert(eo2._ctx.document.body.childNodes.length===1, 'O6 カード内クリック（target≠overlay）では閉じない');
modalNode._listeners.click[0]({ target:modalNode }); // 背景クリック相当
assert(eo2._ctx.document.body.childNodes.length===0, 'O7 背景クリック（target===overlay）で閉じる');

// 再 open は多重生成しない（既存を除去してから1つだけ）
const eo3 = loadEnv();
eo3.openHelpModal('first-round');
eo3.openHelpModal('first-round');
assert(eo3._ctx.document.body.childNodes.length===1, 'O8 連続 open でもモーダルは1つだけ（多重生成しない）');

// ───────────────────────────────────────────────────────────────────
// (2)-W 「？ ヘルプ」ボタンの配置 + 結線 + 既存操作不変
// ───────────────────────────────────────────────────────────────────
const ew = loadEnv(); ew._setState(ew.normalizeState(fxState()));
ew.startClassPartial('A');
const secA = ew.buildFirstRoundPartialSectionHtml('A');
assert(secA.indexOf('id="helpBtnFirstRound_A"')>=0, 'W1 未割当セクション見出し脇に「？ ヘルプ」ボタン(helpBtnFirstRound_A)が出る');
assert(secA.indexOf('1局目 未割当参加者')>=0, 'W2 既存見出し pin「1局目 未割当参加者」は維持（前方一致）');
assert(secA.indexOf('1局目 未割当参加者（4名）')>=0, 'W3 未割当人数併記（4名）も維持（FRP-UNASSIGNED-COUNT-001 非劣化）');
assert(secA.indexOf('id="addTableBtn_A"')<0, 'W4 ①「1卓追加」ボタンは撤去（addTableBtn_A 非出力）');
assert(secA.indexOf('id="addAllTablesBtn_A"')>=0, 'W4b ②「まとめて作成」ボタンは残る');
// build/bind 分離: click は bindClassActionBarEvents 側で openHelpModal に結線
assert(/helpBtnFirstRound_'\+cls/.test(RAW), 'W5 helpBtnFirstRound_ を bindClassActionBarEvents で取得している');
assert(RAW.indexOf("openHelpModal('first-round')")>=0, 'W6 click が openHelpModal(\'first-round\') に結線されている');

// ───────────────────────────────────────────────────────────────────
// (3) 主要ボタンの承認済み title=
// ───────────────────────────────────────────────────────────────────
const eb = loadEnv(); eb._setState(eb.normalizeState(fxState()));
const barB = eb.buildClassActionBarHtml('B');
assert(barB.indexOf('id="startBtnPartial_B"')>=0, 'T1 部分開始ボタン startBtnPartial_B は健在');
assert(barB.indexOf('来ている人だけで先に始めます。未到着者は未割当として残ります。')>=0, 'T2 部分開始 title が承認済み文言');
assert(secA.indexOf('今すぐ始める対局だけを1卓ずつ追加します。あとから残りを追加できます。')<0, 'T3 ①「1卓追加」title は撤去済み');
assert(secA.indexOf('未割当の参加者から、作れる対局をまとめて作成します。')>=0, 'T4 「まとめて作成」title が承認済み文言');

// ───────────────────────────────────────────────────────────────────
// (1) submitRound のアラート（FIRSTROUND-ODD-001 で反転）
//   旧 A1〜A4 は HELP-UX-001 (#308) の未割当アラート文言を pin していたが、
//   1回戦の全員割当必須の廃止（#272 ロックを Codex 2026-08-09 再評価で解除）に伴い
//   アラートごと消えたため、「再導入の禁止」と「統一後の空回戦ガード」を pin する。
// ───────────────────────────────────────────────────────────────────
assert(RAW.indexOf('次の参加者が対局に登録されていません')<0, 'A1 旧・未割当アラートは廃止済み（FIRSTROUND-ODD-001・再導入しない）');
assert(RAW.indexOf("missing.join('、')")<0, 'A2 未割当者名の missing 計算・表示は削除済み');
const srStart = RAW.indexOf('function submitRound');
const srBody = RAW.slice(srStart, srStart+4000);
const srCode = srBody.replace(/\/\/[^\n]*/g, '');
assert(srCode.indexOf('この回戦の組み合わせがありません')>=0, 'A3 空回戦ガード文言は維持（1回戦にも統一適用）');
assert(srCode.indexOf('results[cls].length===0')<0, 'A4 submitRound 本文（コメント除く）に1回戦専用分岐が無い（確定条件は全回戦統一）');

// ───────────────────────────────────────────────────────────────────
console.log('\n  HELP-UX-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
