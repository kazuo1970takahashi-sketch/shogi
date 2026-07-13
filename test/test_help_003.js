#!/usr/bin/env node
// HELP-UX-003 (#338): 登録受付タブの迷子防止 in-app ヘルプの単体テスト（#307 継続 / 第2スライス）。
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
if(!targetPath){console.error('Usage: node test_help_003.js <html>');process.exit(1);}
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

console.log('\n【HELP-UX-003 (#338) 登録受付タブ in-app ヘルプ】');

// R レジストリ: HELP_TEXTS['reg'] が title ＋ 本文6行
const env = loadEnv();
assert(env.HELP_TEXTS && typeof env.HELP_TEXTS==='object', 'R1 HELP_TEXTS レジストリが存在する');
const reg = env.HELP_TEXTS && env.HELP_TEXTS['reg'];
assert(!!reg && typeof reg==='object', 'R2 reg トピックが存在する');
assert(reg && reg.title==='登録・受付ヘルプ', 'R3 reg の title が「登録・受付ヘルプ」');
assert(reg && Array.isArray(reg.lines) && reg.lines.length===7, 'R4 reg の lines が7項目の配列（GUEST-TOURNAMENT-MODE-001 #760 でゲスト大会の案内を追加）');
const j = reg ? reg.lines.join('\n') : '';
assert(j.indexOf('受付番号は自動')>=0, 'R5 (1)受付番号は自動採番の説明を含む');
assert(j.indexOf('ふりがな')>=0 && j.indexOf('50音')>=0 && j.indexOf('後から編集')>=0, 'R6 (2)ふりがなの説明（50音・編集可）を含む');
assert(j.indexOf('会費区分')>=0 && j.indexOf('一般')>=0 && j.indexOf('中学生以下')>=0 && j.indexOf('女性')>=0, 'R7 (3)会費区分（一般/中学生以下/女性）の説明を含む');
assert(j.indexOf('A・Bは削除できません')>=0, 'R8 (4)クラス管理・A・Bは削除不可の説明を含む');
assert(j.indexOf('名簿から受付')>=0 && j.indexOf('名前をタップ')>=0 && j.indexOf('手入力')>=0, 'R9 (5)名簿からのタップ受付＋手入力の説明を含む（DOC-SYNC-001 意図保持追随・旧文言=一括追加）');
assert(j.indexOf('編集で直せます')>=0, 'R10 (6)登録後も編集で直せる説明を含む');
assert(j.indexOf('ゲスト大会')>=0 && j.indexOf('名簿（会員マスタ）に記録されなくなります')>=0, 'R10b (7)ゲスト大会（大会の種類）の説明を含む（GUEST-TOURNAMENT-MODE-001 #760）');
assert(env.HELP_TEXTS && env.HELP_TEXTS['first-round'] && Array.isArray(env.HELP_TEXTS['first-round'].lines), 'R11 #309 first-round トピックは非劣化で残る');
assert(env.HELP_TEXTS && env.HELP_TEXTS['report'] && Array.isArray(env.HELP_TEXTS['report'].lines), 'R12 #323 report トピックは非劣化で残る');

// B buildHelpModalHtml('reg')
const modalHtml = env.buildHelpModalHtml('reg');
assert(typeof modalHtml==='string' && modalHtml.length>0, 'B1 buildHelpModalHtml(reg) が文字列を返す');
assert(modalHtml.indexOf('登録・受付ヘルプ')>=0, 'B2 モーダルに reg タイトルが入る');
let allLines = !!reg; for(let i=0;reg&&i<reg.lines.length;i++){ if(modalHtml.indexOf(reg.lines[i])<0) allLines=false; }
assert(allLines, 'B3 reg の全ヘルプ文が present');
assert(modalHtml.indexOf('id="help-modal-close"')>=0, 'B4 閉じるボタンを持つ');
assert(/function buildHelpModalHtml/.test(RAW), 'B5 buildHelpModalHtml が定義されている（#309 機構流用）');
const bhmBody = RAW.slice(RAW.indexOf('function buildHelpModalHtml'), RAW.indexOf('function buildHelpModalHtml')+1200);
assert(bhmBody.indexOf('escapeHtml(title)')>=0 && bhmBody.indexOf('escapeHtml(lines[i])')>=0, 'B6 タイトル/本文とも escapeHtml 経由（安全表示）');

// X XSS
const ex = loadEnv();
ex.HELP_TEXTS['__xss_probe__'] = { title:'<b>t&t</b>', lines:['<script>alert(1)</script> & "q"'] };
const xssHtml = ex.buildHelpModalHtml('__xss_probe__');
assert(xssHtml.indexOf('<script>alert(1)</script>')<0, 'X1 生 <script> が innerHTML に流れない');
assert(xssHtml.indexOf('&lt;script&gt;')>=0, 'X2 < > が &lt; &gt; にエスケープされる');

// O open / close
const eo = loadEnv();
eo.openHelpModal('reg');
const body = eo._ctx.document.body;
assert(body.childNodes.length===1 && body.childNodes[0].id==='help-modal', 'O1 openHelpModal(reg) で help-modal が開く');
assert(!!reg && body.childNodes[0].innerHTML.indexOf(reg.lines[0])>=0, 'O2 モーダルに reg のヘルプ文が入る');
const closeNode = eo._ctx._elements['help-modal-close'];
assert(closeNode && closeNode._listeners.click && closeNode._listeners.click.length>0, 'O3 閉じるボタンに click ハンドラ');
closeNode._listeners.click[0]();
assert(eo._ctx.document.body.childNodes.length===0, 'O4 閉じるで除去される');
const eo2 = loadEnv();
eo2.openHelpModal('reg');
const modalNode = eo2._ctx._elements['help-modal'];
modalNode._listeners.click[0]({ target:{} });
assert(eo2._ctx.document.body.childNodes.length===1, 'O5 カード内クリックでは閉じない');
modalNode._listeners.click[0]({ target:modalNode });
assert(eo2._ctx.document.body.childNodes.length===0, 'O6 背景クリックで閉じる');
const eo3 = loadEnv();
eo3.openHelpModal('reg'); eo3.openHelpModal('reg');
assert(eo3._ctx.document.body.childNodes.length===1, 'O7 連続 open でもモーダルは1つ');

// H 登録見出し脇に「？ ヘルプ」（静的 HTML・id 固定）
assert(RAW.indexOf('id="helpBtnReg"')>=0, 'H1 「？ ヘルプ」ボタン(id=helpBtnReg)が静的 HTML に build される');
const headIdx = RAW.indexOf('参加者を登録する</h2>');
assert(headIdx>=0, 'H2 既存見出し pin「参加者を登録する」<h2> は維持');
const headWindow = headIdx>=0 ? RAW.slice(headIdx, headIdx+400) : '';
assert(headWindow.indexOf('id="helpBtnReg"')>=0, 'H3 ボタンは登録見出しの直近脇に置かれる');
assert(headWindow.indexOf('class="btn-sm"')>=0, 'H4 ボタンは既存 btn-sm を流用（新規 CSS ルールなし）');
assert(headWindow.indexOf('？ ヘルプ')>=0, 'H5 ボタンラベルは「？ ヘルプ」');

// W build/bind 分離: click は bindRegistrationEvents 側で openHelpModal('reg')
assert(RAW.indexOf("openHelpModal('reg')")>=0, "W1 click が openHelpModal('reg') に結線");
const brStart = RAW.indexOf('function bindRegistrationEvents');
assert(brStart>=0, 'W2 bindRegistrationEvents が定義されている');
const brBody = brStart>=0 ? RAW.slice(brStart, brStart+6000) : '';
assert(brBody.indexOf("getElementById('helpBtnReg')")>=0, 'W3 bindRegistrationEvents が helpBtnReg を取得している');
assert(brBody.indexOf("openHelpModal('reg')")>=0, "W4 bindRegistrationEvents 内で openHelpModal('reg') へ結線（build/bind 分離）");

console.log('\n  HELP-UX-003 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
