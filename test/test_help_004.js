#!/usr/bin/env node
// HELP-UX-004 (#341): 順位タブの迷子防止 in-app ヘルプの単体テスト（#307 継続 / 第2スライス）。
//   #309 (HELP-UX-001) で導入したモーダル三層（HELP_TEXTS レジストリ ＋ buildHelpModalHtml /
//   openHelpModal / bindHelpModalEvents ＋ fixed overlay）を**そのまま流用**し、'report' トピックを
//   1つ追加した純追加スライス（表示のみ・既存ロジック/保存スキーマ不変）。
//   検証:
//     R: HELP_TEXTS['report'] が承認済み title ＋ 本文6行を持つ（first-round トピックも非劣化）。
//     B: buildHelpModalHtml('report') に title ＋ 全本文が present・閉じる付き・本文は escapeHtml 経由。
//     X: '<' 等を含むダミートピックでも innerHTML にタグが生で流れない（#309 と同じ XSS 安全方針）。
//     O: openHelpModal('report') で open / 閉じるボタン / 背景クリックで close・カード内クリックは非close・多重生成なし。
//     H: 大会報告書 見出し脇に「？ ヘルプ」ボタン（id=helpBtnReport・btn-sm）が静的 HTML に build される。
//     W: click が build/bind 分離で bindReportEvents 側から openHelpModal('report') に結線。
//   データは完全架空のみ。HELP_TEXTS は script-global の固定文字列で state には持たない。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_help_004.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（test_help_001.js と同方針）。ヘルプモーダルの open/close を検証するため
//   (a) appendChild が id を registry へ登録 (b) node.remove() が親 childNodes から外す
//   (c) addEventListener が実コールバックを保持（テストから click を発火できる）まで持つ。
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
       HELP_TEXTS:HELP_TEXTS,
       buildHelpModalHtml:buildHelpModalHtml,
       openHelpModal:openHelpModal,
       bindHelpModalEvents:bindHelpModalEvents
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
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  \u2713 '+msg);}
function ng(msg){fail++; console.error('  \u2717 '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('\n【HELP-UX-004 (#341) 順位タブ in-app ヘルプ】');

// R レジストリ: HELP_TEXTS['standings']
const env = loadEnv();
assert(env.HELP_TEXTS && typeof env.HELP_TEXTS==='object', 'R1 HELP_TEXTS レジストリが存在する');
const st = env.HELP_TEXTS && env.HELP_TEXTS['standings'];
assert(!!st && typeof st==='object', 'R2 standings トピックが存在する');
assert(st && st.title==='順位の見方ヘルプ', 'R3 standings の title が「順位の見方ヘルプ」');
assert(st && Array.isArray(st.lines) && st.lines.length===5, 'R4 standings の lines が5項目の配列');
const j = st ? st.lines.join('\n') : '';
assert(j.indexOf('勝数(A)')>=0 && j.indexOf('B（対戦相手の勝数合計）')>=0 && j.indexOf('C（勝った相手の勝数合計）')>=0, 'R5 (1)A→B→C の順位決定の説明を含む');
assert(j.indexOf('直接対決で勝った方が上位')>=0, 'R6 (2)A/B/C 同点は直接対決の勝者が上位の説明を含む');
assert(j.indexOf('1勝1敗')>=0 && j.indexOf('くじ引き')>=0, 'R7 (3)1勝1敗・未対戦は同順位→くじ引きの説明を含む（#331）');
assert(j.indexOf('途中経過')>=0 && j.indexOf('最終結果')>=0, 'R8 (4)途中経過→最終結果の説明を含む');
assert(j.indexOf('負数')>=0, 'R9 (5)負数の説明を含む');
assert(env.HELP_TEXTS && env.HELP_TEXTS['first-round'] && Array.isArray(env.HELP_TEXTS['first-round'].lines), 'R10 #309 first-round 非劣化');
assert(env.HELP_TEXTS && env.HELP_TEXTS['report'] && Array.isArray(env.HELP_TEXTS['report'].lines), 'R11 #323 report 非劣化');
assert(env.HELP_TEXTS && env.HELP_TEXTS['reg'] && Array.isArray(env.HELP_TEXTS['reg'].lines), 'R12 #338 reg 非劣化');

// B buildHelpModalHtml('standings')
const modalHtml = env.buildHelpModalHtml('standings');
assert(typeof modalHtml==='string' && modalHtml.length>0, 'B1 buildHelpModalHtml(standings) が文字列を返す');
assert(modalHtml.indexOf('順位の見方ヘルプ')>=0, 'B2 モーダルに standings タイトルが入る');
let allLines = !!st; for(let i=0;st&&i<st.lines.length;i++){ if(modalHtml.indexOf(st.lines[i])<0) allLines=false; }
assert(allLines, 'B3 standings の全ヘルプ文が present');
assert(modalHtml.indexOf('id="help-modal-close"')>=0, 'B4 閉じるボタンを持つ');
const bhmBody = RAW.slice(RAW.indexOf('function buildHelpModalHtml'), RAW.indexOf('function buildHelpModalHtml')+1200);
assert(bhmBody.indexOf('escapeHtml(title)')>=0 && bhmBody.indexOf('escapeHtml(lines[i])')>=0, 'B5 タイトル/本文とも escapeHtml 経由（安全表示）');

// X XSS
const ex = loadEnv();
ex.HELP_TEXTS['__xss_probe__'] = { title:'<b>t</b>', lines:['<script>alert(1)</script>'] };
const xssHtml = ex.buildHelpModalHtml('__xss_probe__');
assert(xssHtml.indexOf('<script>alert(1)</script>')<0 && xssHtml.indexOf('&lt;script&gt;')>=0, 'X1 生 <script> が流れずエスケープされる');

// O open / close
const eo = loadEnv();
eo.openHelpModal('standings');
const body = eo._ctx.document.body;
assert(body.childNodes.length===1 && body.childNodes[0].id==='help-modal', 'O1 openHelpModal(standings) で help-modal が開く');
assert(!!st && body.childNodes[0].innerHTML.indexOf(st.lines[0])>=0, 'O2 モーダルに standings のヘルプ文が入る');
const closeNode = eo._ctx._elements['help-modal-close'];
assert(closeNode && closeNode._listeners.click && closeNode._listeners.click.length>0, 'O3 閉じるボタンに click ハンドラ');
closeNode._listeners.click[0]();
assert(eo._ctx.document.body.childNodes.length===0, 'O4 閉じるで除去される');
const eo2 = loadEnv();
eo2.openHelpModal('standings');
const modalNode = eo2._ctx._elements['help-modal'];
modalNode._listeners.click[0]({ target:{} });
assert(eo2._ctx.document.body.childNodes.length===1, 'O5 カード内クリックでは閉じない');
modalNode._listeners.click[0]({ target:modalNode });
assert(eo2._ctx.document.body.childNodes.length===0, 'O6 背景クリックで閉じる');

// H 静的「？ ヘルプ」ボタン
assert(RAW.indexOf('id="helpBtnStandings"')>=0, 'H1 「？ ヘルプ」ボタン(id=helpBtnStandings)が静的 HTML に build される');
const anchorIdx = RAW.indexOf('順位の見方');
assert(anchorIdx>=0, 'H2 「順位の見方」アンカーが存在する');
const headWindow = anchorIdx>=0 ? RAW.slice(anchorIdx, anchorIdx+300) : '';
assert(headWindow.indexOf('id="helpBtnStandings"')>=0, 'H3 ボタンは「順位の見方」アンカーの直近脇に置かれる');
assert(headWindow.indexOf('class="btn-sm"')>=0, 'H4 ボタンは既存 btn-sm を流用（新規 CSS ルールなし）');
assert(headWindow.indexOf('？ ヘルプ')>=0, 'H5 ボタンラベルは「？ ヘルプ」');
// 順位表は pane-result の result-list より前にアンカーがある（静的・golden 非接触）
assert(RAW.indexOf('id="helpBtnStandings"') < RAW.indexOf('id="result-list"'), 'H6 standings ヘルプは result-list（動的順位表）の前の静的領域にある');

// W build/bind 分離: click は bindReportEvents 側で openHelpModal('standings')
assert(RAW.indexOf("openHelpModal('standings')")>=0, "W1 click が openHelpModal('standings') に結線");
const breStart = RAW.indexOf('function bindReportEvents');
assert(breStart>=0, 'W2 bindReportEvents が定義されている');
const breBody = breStart>=0 ? RAW.slice(breStart, breStart+8000) : '';
assert(breBody.indexOf("getElementById('helpBtnStandings')")>=0, 'W3 bindReportEvents が helpBtnStandings を取得している');
assert(breBody.indexOf("openHelpModal('standings')")>=0, "W4 bindReportEvents 内で openHelpModal('standings') へ結線（build/bind 分離）");

console.log('\n  HELP-UX-004 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
