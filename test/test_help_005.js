#!/usr/bin/env node
// HELP-UX-005 (#342): 支部マスタタブの迷子防止 in-app ヘルプの単体テスト（#307 継続 / 第2スライス）。
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
if(!targetPath){console.error('Usage: node test_help_005.js <html>');process.exit(1);}
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

console.log('\n【HELP-UX-005 (#342) 支部マスタタブ in-app ヘルプ】');

const env = loadEnv();
assert(env.HELP_TEXTS && typeof env.HELP_TEXTS==='object', 'R1 HELP_TEXTS レジストリが存在する');
const ms = env.HELP_TEXTS && env.HELP_TEXTS['master'];
assert(!!ms && typeof ms==='object', 'R2 master トピックが存在する');
assert(ms && ms.title==='支部マスタの使い方ヘルプ', 'R3 master の title が「支部マスタの使い方ヘルプ」');
assert(ms && Array.isArray(ms.lines) && ms.lines.length===6, 'R4 master の lines が6項目の配列');
const j = ms ? ms.lines.join('\n') : '';
assert(j.indexOf('名簿')>=0 && j.indexOf('大会データとは別物')>=0, 'R5 (1)支部マスタは名簿・大会データと別物の説明を含む');
assert(j.indexOf('統合')>=0, 'R6 (2)過去大会の統合の説明を含む');
assert(j.indexOf('名簿に反映')>=0 && j.indexOf('同期')>=0, 'R7 (3)「名簿に反映＋コピー」時の自動同期の説明を含む');
assert(j.indexOf('エクスポート')>=0 && j.indexOf('インポート')>=0 && j.indexOf('保管')>=0, 'R8 (4)エクスポート/インポート・保管推奨の説明を含む');
assert(j.indexOf('壊れている')>=0 && j.indexOf('黙って消えません')>=0, 'R9 (5)破損/未対応版は取り込み中止・既存温存の説明を含む');
assert(j.indexOf('リセット')>=0 && j.indexOf('退避')>=0, 'R10 (6)リセットは全消去・事前退避の説明を含む');
assert(env.HELP_TEXTS && env.HELP_TEXTS['first-round'] && env.HELP_TEXTS['report'] && env.HELP_TEXTS['reg'] && env.HELP_TEXTS['standings'], 'R11 既存4トピック(first-round/report/reg/standings)は非劣化で残る');

const modalHtml = env.buildHelpModalHtml('master');
assert(typeof modalHtml==='string' && modalHtml.indexOf('支部マスタの使い方ヘルプ')>=0, 'B1 buildHelpModalHtml(master) に master タイトルが入る');
let allLines = !!ms; for(let i=0;ms&&i<ms.lines.length;i++){ if(modalHtml.indexOf(ms.lines[i])<0) allLines=false; }
assert(allLines, 'B2 master の全ヘルプ文が present');
assert(modalHtml.indexOf('id="help-modal-close"')>=0, 'B3 閉じるボタンを持つ');
const bhmBody = RAW.slice(RAW.indexOf('function buildHelpModalHtml'), RAW.indexOf('function buildHelpModalHtml')+1200);
assert(bhmBody.indexOf('escapeHtml(title)')>=0 && bhmBody.indexOf('escapeHtml(lines[i])')>=0, 'B4 タイトル/本文とも escapeHtml 経由（安全表示）');

const ex = loadEnv();
ex.HELP_TEXTS['__xss_probe__'] = { title:'<b>t</b>', lines:['<script>alert(1)</script>'] };
const xssHtml = ex.buildHelpModalHtml('__xss_probe__');
assert(xssHtml.indexOf('<script>alert(1)</script>')<0 && xssHtml.indexOf('&lt;script&gt;')>=0, 'X1 生 <script> が流れずエスケープされる');

const eo = loadEnv();
eo.openHelpModal('master');
const body = eo._ctx.document.body;
assert(body.childNodes.length===1 && body.childNodes[0].id==='help-modal', 'O1 openHelpModal(master) で help-modal が開く');
assert(!!ms && body.childNodes[0].innerHTML.indexOf(ms.lines[0])>=0, 'O2 モーダルに master のヘルプ文が入る');
const closeNode = eo._ctx._elements['help-modal-close'];
assert(closeNode && closeNode._listeners.click && closeNode._listeners.click.length>0, 'O3 閉じるボタンに click ハンドラ');
closeNode._listeners.click[0]();
assert(eo._ctx.document.body.childNodes.length===0, 'O4 閉じるで除去される');
const eo2 = loadEnv();
eo2.openHelpModal('master');
const modalNode = eo2._ctx._elements['help-modal'];
modalNode._listeners.click[0]({ target:{} });
assert(eo2._ctx.document.body.childNodes.length===1, 'O5 カード内クリックでは閉じない');
modalNode._listeners.click[0]({ target:modalNode });
assert(eo2._ctx.document.body.childNodes.length===0, 'O6 背景クリックで閉じる');

// H 「？ ヘルプ」ボタン（buildMasterTabHtml 内の動的 string・見出し脇）
assert(RAW.indexOf('id="helpBtnMaster"')>=0, 'H1 「？ ヘルプ」ボタン(id=helpBtnMaster)が build される');
const anchorIdx = RAW.indexOf('沼津支部 参加者マスタ');
assert(anchorIdx>=0, 'H2 「沼津支部 参加者マスタ」見出しが存在する');
const headWindow = anchorIdx>=0 ? RAW.slice(anchorIdx, anchorIdx+300) : '';
assert(headWindow.indexOf('id="helpBtnMaster"')>=0, 'H3 ボタンは「沼津支部 参加者マスタ」見出しの直近脇に置かれる');
assert(headWindow.indexOf('class="btn-sm"')>=0, 'H4 ボタンは既存 btn-sm を流用（新規 CSS ルールなし）');
assert(headWindow.indexOf('？ ヘルプ')>=0, 'H5 ボタンラベルは「？ ヘルプ」');

// W build/bind 分離: click は bindMasterTabEvents 側で openHelpModal('master')
assert(RAW.indexOf("openHelpModal('master')")>=0, "W1 click が openHelpModal('master') に結線");
const bmStart = RAW.indexOf('function bindMasterTabEvents');
assert(bmStart>=0, 'W2 bindMasterTabEvents が定義されている');
const bmBody = bmStart>=0 ? RAW.slice(bmStart, bmStart+3000) : '';
assert(bmBody.indexOf("getElementById('helpBtnMaster')")>=0, 'W3 bindMasterTabEvents が helpBtnMaster を取得している');
assert(bmBody.indexOf("openHelpModal('master')")>=0, "W4 bindMasterTabEvents 内で openHelpModal('master') へ結線（build/bind 分離）");

console.log('\n  HELP-UX-005 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
