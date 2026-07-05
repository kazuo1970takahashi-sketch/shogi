#!/usr/bin/env node
// HELP-UX-006 (STYLE-GUIDE §9 M2 / 監査 Step2): 対局管理タブ＋クラウドの迷子防止 in-app ヘルプの単体テスト（#307 継続）。
//   #309 (HELP-UX-001) で導入したモーダル三層（HELP_TEXTS レジストリ ＋ buildHelpModalHtml /
//   openHelpModal / bindHelpModalEvents ＋ fixed overlay）を**そのまま流用**し、'tournament'・'cloud' の
//   2 topic を追加した純追加スライス（表示のみ・既存ロジック/保存スキーマ不変）。
//   検証:
//     R: HELP_TEXTS['tournament'] / ['cloud'] が承認済み title ＋ 本文6行を持つ（既存 topic も非劣化）。
//     B: buildHelpModalHtml が両 topic の title ＋ 全本文を present・閉じる付き・本文は escapeHtml 経由。
//     X: '<' 等を含むダミートピックでも innerHTML にタグが生で流れない（#309 と同じ XSS 安全方針）。
//     O: openHelpModal('tournament') で open / 閉じる / 背景クリック close・多重生成なし。
//     H: 静的アンカー＝pane-tournament 上部（helpBtnTournament）と cloudSendBtn 脇（helpBtnCloud）に「？ ヘルプ」build。
//     W: 静的2ボタンは bindReportEvents 側で結線（build/bind 分離・#341 同型）。
//     D: renderHistoryList のクラウド見出し脇に history-cloud-help を出力し openHelpModal('cloud') へ結線（動的・描画直後 bind）。
//   データは完全架空のみ。HELP_TEXTS は script-global の固定文字列で state には持たない。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_help_006.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（test_help_004.js と同方針）。
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

console.log('\n【HELP-UX-006 (STYLE-GUIDE M2) 対局管理＋クラウド in-app ヘルプ】');

// R レジストリ
const env = loadEnv();
assert(env.HELP_TEXTS && typeof env.HELP_TEXTS==='object', 'R1 HELP_TEXTS レジストリが存在する');
const tt = env.HELP_TEXTS && env.HELP_TEXTS['tournament'];
assert(!!tt && tt.title==='対局管理の使い方ヘルプ', 'R2 tournament の title が「対局管理の使い方ヘルプ」');
assert(tt && Array.isArray(tt.lines) && tt.lines.length===6, 'R3 tournament の lines が6項目の配列');
const jt = tt ? tt.lines.join('\n') : '';
assert(jt.indexOf('全員で1局目を開始')>=0 && jt.indexOf('部分開始')>=0, 'R4 開始（全員/部分開始）の説明を含む');
assert(jt.indexOf('もう一度押すと取り消し')>=0, 'R5 勝敗入力の取り消し/変更の説明を含む');
assert(jt.indexOf('確定して次へ')>=0, 'R6 回戦確定の説明を含む');
assert(jt.indexOf('組み合わせを再生成')>=0 && jt.indexOf('消える')>=0, 'R7 再生成で入力済み勝敗が消える注意を含む');
assert(jt.indexOf('棄権')>=0 && jt.indexOf('成績は残ります')>=0, 'R8 途中棄権（成績は残る）の説明を含む');
assert(jt.indexOf('印刷')>=0, 'R9 組み合わせ印刷の説明を含む');
const ct = env.HELP_TEXTS && env.HELP_TEXTS['cloud'];
assert(!!ct && ct.title==='クラウド送信・取得ヘルプ', 'R10 cloud の title が「クラウド送信・取得ヘルプ」');
assert(ct && Array.isArray(ct.lines) && ct.lines.length===8, 'R11 cloud の lines が8項目の配列（ID共有説明＋キーなし合流 #588）');
const jc = ct ? ct.lines.join('\n') : '';
assert(jc.indexOf('運営共通キーを発行')>=0 && jc.indexOf('１つの大会にまとまります')>=0, 'R11b cloud ヘルプに2台分担の運営共通キー手順を含む');
assert(jc.indexOf('今日の大会に合流')>=0, 'R11c cloud ヘルプにキーなし合流の手順を含む（Phase D #588）');
assert(jc.indexOf('任意')>=0, 'R12 クラウドは任意（運営に影響しない）の説明を含む');
assert(jc.indexOf('ログイン')>=0, 'R13 送信にはログインが必要の説明を含む');
assert(jc.indexOf('二重にはなりません')>=0, 'R14 再送信しても二重にならない説明を含む');
assert(jc.indexOf('端末に残っています')>=0, 'R15 失敗しても当日データは端末に残る説明を含む');
assert(jc.indexOf('クラウドの過去大会')>=0 && jc.indexOf('読み込む')>=0, 'R16 大会履歴での取得の説明を含む');
assert(jc.indexOf('バックアップ')>=0, 'R17 クラウドはバックアップの代わりではない説明を含む');
// 既存 topic 非劣化
assert(env.HELP_TEXTS['first-round'] && env.HELP_TEXTS['report'] && env.HELP_TEXTS['reg'] && env.HELP_TEXTS['standings'] && env.HELP_TEXTS['master'] && env.HELP_TEXTS['save-warning'], 'R18 既存6 topic 非劣化');

// B buildHelpModalHtml
const mt = env.buildHelpModalHtml('tournament');
assert(typeof mt==='string' && mt.indexOf('対局管理の使い方ヘルプ')>=0, 'B1 buildHelpModalHtml(tournament) に title が入る');
let allT = !!tt; for(let i=0;tt&&i<tt.lines.length;i++){ if(mt.indexOf(tt.lines[i])<0) allT=false; }
assert(allT, 'B2 tournament の全ヘルプ文が present');
const mc = env.buildHelpModalHtml('cloud');
assert(typeof mc==='string' && mc.indexOf('クラウド送信・取得ヘルプ')>=0, 'B3 buildHelpModalHtml(cloud) に title が入る');
let allC = !!ct; for(let i=0;ct&&i<ct.lines.length;i++){ if(mc.indexOf(ct.lines[i])<0) allC=false; }
assert(allC, 'B4 cloud の全ヘルプ文が present');
assert(mt.indexOf('id="help-modal-close"')>=0 && mc.indexOf('id="help-modal-close"')>=0, 'B5 両 topic とも閉じるボタンを持つ');
const bhmBody = RAW.slice(RAW.indexOf('function buildHelpModalHtml'), RAW.indexOf('function buildHelpModalHtml')+1200);
assert(bhmBody.indexOf('escapeHtml(title)')>=0 && bhmBody.indexOf('escapeHtml(lines[i])')>=0, 'B6 タイトル/本文とも escapeHtml 経由（安全表示）');

// X XSS
const ex = loadEnv();
ex.HELP_TEXTS['__xss_probe__'] = { title:'<b>t</b>', lines:['<script>alert(1)</script>'] };
const xssHtml = ex.buildHelpModalHtml('__xss_probe__');
assert(xssHtml.indexOf('<script>alert(1)</script>')<0 && xssHtml.indexOf('&lt;script&gt;')>=0, 'X1 生 <script> が流れずエスケープされる');

// O open / close
const eo = loadEnv();
eo.openHelpModal('tournament');
const body = eo._ctx.document.body;
assert(body.childNodes.length===1 && body.childNodes[0].id==='help-modal', 'O1 openHelpModal(tournament) で help-modal が開く');
assert(!!tt && body.childNodes[0].innerHTML.indexOf(tt.lines[0])>=0, 'O2 モーダルに tournament のヘルプ文が入る');
const closeNode = eo._ctx._elements['help-modal-close'];
assert(closeNode && closeNode._listeners.click && closeNode._listeners.click.length>0, 'O3 閉じるボタンに click ハンドラ');
closeNode._listeners.click[0]();
assert(eo._ctx.document.body.childNodes.length===0, 'O4 閉じるで除去される');
const eo2 = loadEnv();
eo2.openHelpModal('cloud');
const modalNode = eo2._ctx._elements['help-modal'];
modalNode._listeners.click[0]({ target:{} });
assert(eo2._ctx.document.body.childNodes.length===1, 'O5 カード内クリックでは閉じない');
modalNode._listeners.click[0]({ target:modalNode });
assert(eo2._ctx.document.body.childNodes.length===0, 'O6 背景クリックで閉じる');

// H 静的アンカー
assert(RAW.indexOf('id="helpBtnTournament"')>=0, 'H1 helpBtnTournament が静的 HTML に build される');
const tAnchorIdx = RAW.indexOf('対局管理の使い方</span>');
assert(tAnchorIdx>=0, 'H2 「対局管理の使い方」アンカーが存在する');
const tHead = tAnchorIdx>=0 ? RAW.slice(tAnchorIdx, tAnchorIdx+300) : '';
assert(tHead.indexOf('id="helpBtnTournament"')>=0 && tHead.indexOf('class="btn-sm"')>=0 && tHead.indexOf('？ ヘルプ')>=0, 'H3 アンカー直近に btn-sm「？ ヘルプ」');
assert(RAW.indexOf('id="helpBtnTournament"') < RAW.indexOf('id="pane-tournament-grid"'), 'H4 tournament ヘルプは pane-tournament-grid（動的対局画面）の前の静的領域にある');
assert(RAW.indexOf('id="helpBtnCloud"')>=0, 'H5 helpBtnCloud が静的 HTML に build される');
const cBtnIdx = RAW.indexOf('id="helpBtnCloud"');
const cWin = RAW.slice(cBtnIdx, cBtnIdx+500);
assert(cWin.indexOf('id="cloudSendBtn"')>=0, 'H6 helpBtnCloud は cloudSendBtn の直近脇に置かれる');

// W 静的2ボタンの bind（bindReportEvents 集約・#341 同型）
const breStart = RAW.indexOf('function bindReportEvents');
assert(breStart>=0, 'W1 bindReportEvents が定義されている');
const breBody = breStart>=0 ? RAW.slice(breStart, breStart+10000) : '';
assert(breBody.indexOf("getElementById('helpBtnTournament')")>=0 && breBody.indexOf("openHelpModal('tournament')")>=0, "W2 bindReportEvents 内で helpBtnTournament → openHelpModal('tournament')");
assert(breBody.indexOf("getElementById('helpBtnCloud')")>=0 && breBody.indexOf("openHelpModal('cloud')")>=0, "W3 bindReportEvents 内で helpBtnCloud → openHelpModal('cloud')");

// D 大会履歴（動的）
const rhlStart = RAW.indexOf('function renderHistoryList');
assert(rhlStart>=0, 'D1 renderHistoryList が定義されている');
const rhlBody = rhlStart>=0 ? RAW.slice(rhlStart, rhlStart+8000) : '';
assert(rhlBody.indexOf('id="history-cloud-help"')>=0, 'D2 クラウド見出し脇に history-cloud-help を出力する');
assert(rhlBody.indexOf("getElementById('history-cloud-help')")>=0 && rhlBody.indexOf("openHelpModal('cloud')")>=0, "D3 描画直後に history-cloud-help → openHelpModal('cloud') を bind");
assert(rhlBody.indexOf('id="history-cloud-load"')>=0, 'D4 既存の「読み込む」ボタンは非劣化で残る');

console.log('\n  HELP-UX-006 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
