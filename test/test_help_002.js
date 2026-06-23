#!/usr/bin/env node
// HELP-UX-002 (#322): 大会報告書画面の迷子防止 in-app ヘルプの単体テスト（#307 継続 / 第2スライス）。
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
if(!targetPath){console.error('Usage: node test_help_002.js <html>');process.exit(1);}
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
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('\n【HELP-UX-002 (#322) 大会報告書画面 in-app ヘルプ】');

// ───────────────────────────────────────────────────────────────────
// R レジストリ: HELP_TEXTS['report'] が承認済み title ＋ 本文6行
// ───────────────────────────────────────────────────────────────────
const env = loadEnv();
assert(env.HELP_TEXTS && typeof env.HELP_TEXTS==='object', 'R1 HELP_TEXTS レジストリが存在する');
const rep = env.HELP_TEXTS && env.HELP_TEXTS['report'];
assert(!!rep && typeof rep==='object', 'R2 report トピックが存在する');
assert(rep && rep.title==='報告書の作り方ヘルプ', 'R3 report の title が承認済み「報告書の作り方ヘルプ」');
assert(rep && Array.isArray(rep.lines) && rep.lines.length===6, 'R4 report の lines が承認済み6項目の配列');
const rj = rep ? rep.lines.join('\n') : '';
assert(rj.indexOf('空欄でも既定値')>=0, 'R5 (1)空欄でも既定値で出力される説明を含む');
assert(rj.indexOf('自動で「報告書」が付き')>=0 && rj.indexOf('二重')>=0, 'R6 (2)大会名に自動「報告書」付与・二重注意を含む');
assert(rj.indexOf('賞金額')>=0 && rj.indexOf('収支')>=0 && rj.indexOf('0 と入れて')>=0, 'R7 (3)賞金は収支連動・0で無し の説明を含む');
assert(rj.indexOf('担当役員')>=0 && rj.indexOf('申し送り')>=0, 'R8 (4)担当役員・申し送りは運営記録欄の説明を含む');
assert(rj.indexOf('PDFとして保存')>=0 && rj.indexOf('印刷用ページ')>=0, 'R9 (5)印刷/PDF保存の操作説明を含む');
assert(rj.indexOf('目で確認')>=0, 'R10 (6)出力後の目視確認を促す説明を含む');
// 第1スライス（first-round）を壊していない
assert(env.HELP_TEXTS && env.HELP_TEXTS['first-round'] && Array.isArray(env.HELP_TEXTS['first-round'].lines), 'R11 #309 first-round トピックは非劣化で残る');

// ───────────────────────────────────────────────────────────────────
// B buildHelpModalHtml('report'): ヘルプ文 present・閉じる・安全表示
// ───────────────────────────────────────────────────────────────────
const modalHtml = env.buildHelpModalHtml('report');
assert(typeof modalHtml==='string' && modalHtml.length>0, 'B1 buildHelpModalHtml(report) が文字列を返す');
assert(modalHtml.indexOf('報告書の作り方ヘルプ')>=0, 'B2 モーダルに report タイトルが入る');
let allLinesPresent = true;
for(let i=0;i<rep.lines.length;i++){ if(modalHtml.indexOf(rep.lines[i])<0) allLinesPresent=false; }
assert(allLinesPresent, 'B3 report の全ヘルプ文が present（ヘルプ文 present）');
assert(modalHtml.indexOf('id="help-modal-close"')>=0, 'B4 閉じるボタン(help-modal-close)を持つ');
assert(modalHtml.indexOf('閉じる')>=0, 'B5 「閉じる」ラベルがある');
// 本文は escapeHtml 経由（#309 と同じ XSS 安全方針）= ソース確認
assert(/function buildHelpModalHtml/.test(RAW), 'B6 buildHelpModalHtml が定義されている（#309 機構の流用）');
const bhmBody = RAW.slice(RAW.indexOf('function buildHelpModalHtml'), RAW.indexOf('function buildHelpModalHtml')+1200);
assert(bhmBody.indexOf('escapeHtml(title)')>=0 && bhmBody.indexOf('escapeHtml(lines[i])')>=0, 'B7 タイトル/本文ともに escapeHtml 経由（textContent 相当の安全表示）');

// ───────────────────────────────────────────────────────────────────
// X XSS: '<' 等を含むダミートピックを入れても innerHTML にタグが生で流れない
//   （issue #322 テスト方針: 既存 help テストの XSS 観点を踏襲・出力経路で実証）
// ───────────────────────────────────────────────────────────────────
const ex = loadEnv();
ex.HELP_TEXTS['__xss_probe__'] = { title:'<b>t&t</b>', lines:['<script>alert(1)</script> & "q" \'r\''] };
const xssHtml = ex.buildHelpModalHtml('__xss_probe__');
assert(xssHtml.indexOf('<script>alert(1)</script>')<0, 'X1 本文の生 <script> タグが innerHTML に流れない');
assert(xssHtml.indexOf('&lt;script&gt;')>=0, 'X2 本文の < > が &lt; &gt; にエスケープされる');
assert(xssHtml.indexOf('<b>t&t</b>')<0 && xssHtml.indexOf('&lt;b&gt;')>=0, 'X3 タイトルの生タグもエスケープされる');

// ───────────────────────────────────────────────────────────────────
// O open / close の DOM フロー
// ───────────────────────────────────────────────────────────────────
const eo = loadEnv();
eo.openHelpModal('report');
const body = eo._ctx.document.body;
assert(body.childNodes.length===1 && body.childNodes[0].id==='help-modal', 'O1 openHelpModal(report) で help-modal が body に追加される（開く）');
assert(body.childNodes[0].innerHTML.indexOf(rep.lines[0])>=0, 'O2 追加されたモーダルの中身に report のヘルプ文が入っている');
const closeNode = eo._ctx._elements['help-modal-close'];
assert(closeNode && closeNode._listeners.click && closeNode._listeners.click.length>0, 'O3 閉じるボタンに click ハンドラが結線されている');
closeNode._listeners.click[0]();
assert(eo._ctx.document.body.childNodes.length===0, 'O4 閉じるボタンでモーダルが除去される（閉じる）');

const eo2 = loadEnv();
eo2.openHelpModal('report');
const modalNode = eo2._ctx._elements['help-modal'];
assert(modalNode && modalNode._listeners.click && modalNode._listeners.click.length>0, 'O5 overlay に click ハンドラが結線されている');
modalNode._listeners.click[0]({ target:{} });        // カード内クリック相当（target≠modal）
assert(eo2._ctx.document.body.childNodes.length===1, 'O6 カード内クリック（target≠overlay）では閉じない');
modalNode._listeners.click[0]({ target:modalNode });  // 背景クリック相当
assert(eo2._ctx.document.body.childNodes.length===0, 'O7 背景クリック（target===overlay）で閉じる');

const eo3 = loadEnv();
eo3.openHelpModal('report');
eo3.openHelpModal('report');
assert(eo3._ctx.document.body.childNodes.length===1, 'O8 連続 open でもモーダルは1つだけ（多重生成しない）');

// ───────────────────────────────────────────────────────────────────
// H 大会報告書 見出し脇に「？ ヘルプ」ボタン（静的 HTML・id 固定）
// ───────────────────────────────────────────────────────────────────
assert(RAW.indexOf('id="helpBtnReport"')>=0, 'H1 「？ ヘルプ」ボタン(id=helpBtnReport)が静的 HTML に build される');
const headIdx = RAW.indexOf('大会報告書</h2>');
assert(headIdx>=0, 'H2 既存見出し pin「大会報告書」<h2> は維持');
const headWindow = headIdx>=0 ? RAW.slice(headIdx, headIdx+400) : '';
assert(headWindow.indexOf('id="helpBtnReport"')>=0, 'H3 ボタンは大会報告書見出しの直近脇に置かれる（見出し→ボタンの順）');
assert(headWindow.indexOf('class="btn-sm"')>=0, 'H4 ボタンは既存 btn-sm を流用（新規 CSS ルールを足さない）');
assert(headWindow.indexOf('？ ヘルプ')>=0, 'H5 ボタンラベルは「？ ヘルプ」（#309 と同型）');

// ───────────────────────────────────────────────────────────────────
// W build/bind 分離: click は bindReportEvents 側で openHelpModal('report') に結線
// ───────────────────────────────────────────────────────────────────
assert(RAW.indexOf("openHelpModal('report')")>=0, "W1 click が openHelpModal('report') に結線されている");
const breStart = RAW.indexOf('function bindReportEvents');
assert(breStart>=0, 'W2 bindReportEvents が定義されている（report 画面の bind 側）');
// 関数末尾（次の "\n}\n"）までを切り出す。bindReportEvents は長いので固定窓ではなく閉じ括弧まで取る。
const breEnd = breStart>=0 ? RAW.indexOf('\n}\n', breStart) : -1;
const breBody = breStart>=0 ? RAW.slice(breStart, breEnd>breStart ? breEnd : breStart+5000) : '';
assert(breBody.indexOf("getElementById('helpBtnReport')")>=0, 'W3 bindReportEvents が helpBtnReport を取得している');
assert(breBody.indexOf("openHelpModal('report')")>=0, 'W4 bindReportEvents 内で openHelpModal(\'report\') へ結線（build/bind 分離）');

// ───────────────────────────────────────────────────────────────────
console.log('\n  HELP-UX-002 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
