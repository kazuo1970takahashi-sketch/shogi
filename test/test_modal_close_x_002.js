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
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){} };
  const js = extractScripts(RAW);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       buildBackupModalHtml:buildBackupModalHtml,
       openBackupModal:openBackupModal,
       buildHelpModalHtml:buildHelpModalHtml
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('\n【MODAL-CLOSE-X-002 バックアップ画面の見出し右端「✕ 閉じる」（作者報告 2026-09-14）】');

// B 見出し行（初期表示で見える位置）に ✕ 閉じるがある
const env = loadEnv();
const h = env.buildBackupModalHtml();
const ix = h.indexOf('id="backup-close-x"');
assert(ix>=0, 'B1 backup-close-x が存在する');
assert(ix>=0 && ix<h.indexOf('id="backup-export"'), 'B2 backup-close-x は保存ボタンより前（見出し行）にある');
assert(h.indexOf('id="backup-cancel"')>h.indexOf('id="backup-paste-btn"'), 'B3 下の「閉じる」（backup-cancel）も残る＝両端から閉じられる');
const btn = h.slice(h.lastIndexOf('<button', ix), h.indexOf('</button>', ix));
assert(btn.indexOf('btn-outline-primary')>=0 && !/style="[^"]*(background|color):/.test(btn), 'B4 ✕ 閉じるの色は class（btn-outline-primary）で、inline は layout のみ（STYLE-GUIDE §2.2(4)）');
assert(btn.indexOf('✕ 閉じる')>=0, 'B5 ラベルは既存の「✕ 閉じる」と同じ');

// O 開いて ✕ で閉じる
const eo = loadEnv();
eo.openBackupModal();
assert(eo._ctx.document.body.childNodes.length===1 && eo._ctx.document.body.childNodes[0].id==='backup-modal', 'O1 openBackupModal で backup-modal が body に付く');
const closeX = eo._ctx._elements['backup-close-x'];
assert(closeX && closeX._listeners.click && closeX._listeners.click.length>0, 'O2 見出し右端の ✕ 閉じるに click ハンドラ');
closeX._listeners.click[0]();
assert(eo._ctx.document.body.childNodes.length===0, 'O3 ✕ 閉じるで backup-modal が除去される');
const eo2 = loadEnv();
eo2.openBackupModal();
const cancel = eo2._ctx._elements['backup-cancel'];
assert(cancel && cancel._listeners.click && cancel._listeners.click.length>0, 'O4 下の「閉じる」の click ハンドラは非劣化');
cancel._listeners.click[0]();
assert(eo2._ctx.document.body.childNodes.length===0, 'O5 下の「閉じる」でも除去される');

// H ヘルプ側の ✕ も色は class（#982 Codex P2 の解消）
const hh = loadEnv().buildHelpModalHtml('cloud');
const hx = hh.indexOf('id="help-modal-close-x"');
const hbtn = hh.slice(hh.lastIndexOf('<button', hx), hh.indexOf('</button>', hx));
assert(hx>=0 && hbtn.indexOf('btn-outline-primary')>=0 && !/style="[^"]*(background|color):/.test(hbtn), 'H1 ヘルプの ✕ 閉じるも色は class・inline は layout のみ');

console.log('  MODAL-CLOSE-X-002 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
