#!/usr/bin/env node
// PP-FULLSCREEN-001: 「過去参加者から選ぶ」全画面ビュー化の単体テスト（作者FB 2026-07-02＝登録タブ内の
//   入れ子スクロール(280px箱)が使いづらい → fixed overlay でスクロール1本化・検索/50音は sticky）。
//   検証:
//     H: 静的 HTML＝#pp-fullscreen overlay（no-print・fixed）・sticky ヘッダ・✕閉じる・#ppPanel は overlay 内へ移動
//        （登録タブ側 section には残らない）・#ppToggleBtn は id 温存でラベル「全画面で開く」。
//     C: ビルダー＝.pp-controls ラッパー＋.pp-list-box class 付与（inline 280px は通常フロー用に維持）。
//        scoped CSS＝#pp-fullscreen .pp-list-box の max-height 解除・.pp-controls sticky。
//     O: openPpFullscreen で overlay 表示＋body スクロール停止＋一覧描画、closePpFullscreen で復帰。
//        bindPastParticipantsToggle が open/close を結線（実クリックで動作）。
//     F: 検索再描画後の focus/caret 復元コードが input/compositionend 両ハンドラに存在。
//     T: 追加/クラス変更の成功時、全画面ビュー中は showToast でも通知（isPpFullscreenOpen ガード）。
//     N: renderPastParticipantsPanel が #pp-summary-fs にも件数を同期。マスタ空なら section 非表示（既存非劣化）。
//   fixture は完全架空のみ。
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_pp_fullscreen.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（test_help_004.js 系＋querySelectorAll/クラス走査を最小追加）。
function makeContext(){
  var elements={};
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
      disabled:false, type:'',
      style:{}, _attrs:{}, childNodes:[], _listeners:{}, _parent:null, _focused:false,
      appendChild:function(c){ c._parent=this; this.childNodes.push(c); if(c.id)elements[c.id]=c; return c; },
      remove:function(){ if(this._parent){var a=this._parent.childNodes;for(var i=0;i<a.length;i++){if(a[i]===this){a.splice(i,1);break;}}this._parent=null;} if(this.id&&elements[this.id]===this)delete elements[this.id]; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      focus:function(){ this._focused=true; },
      setSelectionRange:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var bodyNode=makeNode('body');
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:bodyNode,
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
       openPpFullscreen:openPpFullscreen,
       closePpFullscreen:closePpFullscreen,
       isPpFullscreenOpen:isPpFullscreenOpen,
       bindPastParticipantsToggle:bindPastParticipantsToggle,
       renderPastParticipantsPanel:renderPastParticipantsPanel,
       buildPastParticipantsPanelHtml:buildPastParticipantsPanelHtml,
       _buildPpControlsHtml:_buildPpControlsHtml,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY
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

const FIX_MASTER=JSON.stringify({schema_version:1,members:[
  {id:'m-kaku-1',name:'架空太郎',yomi:'かくうたろう',last_class:'A',last_attended:'2026-06-01',attend_count:3},
  {id:'m-kaku-2',name:'架空花子',yomi:'かくうはなこ',last_class:'B',last_attended:'2026-06-01',attend_count:5}
]});

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('\n【PP-FULLSCREEN-001 過去参加者から選ぶ 全画面ビュー】');

// H 静的 HTML
assert(RAW.indexOf('id="pp-fullscreen"')>=0, 'H1 #pp-fullscreen overlay が静的 HTML に存在');
const ovIdx=RAW.indexOf('id="pp-fullscreen"');
const ovTag=RAW.slice(RAW.lastIndexOf('<div',ovIdx),RAW.indexOf('>',ovIdx)+1);
assert(ovTag.indexOf('no-print')>=0&&ovTag.indexOf('position:fixed')>=0&&ovTag.indexOf('display:none')>=0, 'H2 overlay は no-print・fixed・既定非表示');
const ovBlock=RAW.slice(ovIdx,ovIdx+2200);
assert(ovBlock.indexOf('position:sticky')>=0&&ovBlock.indexOf('id="ppFullscreenCloseBtn"')>=0, 'H3 sticky ヘッダ＋✕閉じるボタン');
assert(ovBlock.indexOf('id="ppPanel"')>=0, 'H4 #ppPanel は overlay 内に移動');
const secIdx=RAW.indexOf('id="past-participants-section"');
const secBlock=RAW.slice(secIdx,RAW.indexOf('id="class-manager-section"'));
assert(secBlock.indexOf('id="ppPanel"')<0, 'H5 登録タブ section 側に #ppPanel は残らない（入れ子スクロール撤去）');
assert(secBlock.indexOf('id="ppToggleBtn"')>=0&&secBlock.indexOf('全画面で開く')>=0, 'H6 #ppToggleBtn は id 温存・ラベル「全画面で開く」');
assert(ovBlock.indexOf('id="pp-summary-fs"')>=0, 'H7 overlay ヘッダに件数表示 #pp-summary-fs');

// C ビルダー＋scoped CSS
const env=loadEnv();
const controls=env._buildPpControlsHtml('',
 'all',null);
assert(controls.indexOf('class="pp-controls"')===controls.indexOf('<div class="pp-controls"')+5&&controls.indexOf('<div class="pp-controls">')===0, 'C1 コントロール群は .pp-controls で包まれる');
env._ctx.localStorage.setItem(env.BRANCH_MASTER_KEY,FIX_MASTER);
const panelHtml=env.buildPastParticipantsPanelHtml(JSON.parse(FIX_MASTER),'','all',null);
assert(panelHtml.indexOf('class="pp-list-box"')>=0&&panelHtml.indexOf('max-height:280px')>=0, 'C2 一覧箱に .pp-list-box 付与（通常フローの inline 280px は維持）');
assert(/#pp-fullscreen \.pp-list-box\{[^}]*max-height:none!important/.test(RAW), 'C3 scoped CSS が全画面時のみ内側スクロールを解除');
assert(/#pp-fullscreen \.pp-controls\{[^}]*position:sticky/.test(RAW), 'C4 scoped CSS で検索/50音がヘッダ直下に sticky');

// O open/close（bind 経由の実クリック）
const eo=loadEnv();
eo._ctx.localStorage.setItem(eo.BRANCH_MASTER_KEY,FIX_MASTER);
const ov=eo._ctx.document.getElementById('pp-fullscreen');
ov.style.display='none';
eo.bindPastParticipantsToggle();
const tbtn=eo._ctx._elements['ppToggleBtn'];
assert(tbtn&&tbtn._listeners.click&&tbtn._listeners.click.length>0, 'O1 #ppToggleBtn に click 結線');
tbtn._listeners.click[0]();
assert(ov.style.display==='block', 'O2 クリックで overlay 表示');
assert(eo.isPpFullscreenOpen()===true, 'O3 isPpFullscreenOpen が true');
assert(eo._ctx.document.body.style.overflow==='hidden', 'O4 背面ページのスクロールを停止');
const panelEl=eo._ctx._elements['ppPanel'];
assert(panelEl&&panelEl.innerHTML.indexOf('架空太郎')>=0&&panelEl.innerHTML.indexOf('pp-list-box')>=0, 'O5 open 時に一覧を描画（架空 fixture）');
const cbtn=eo._ctx._elements['ppFullscreenCloseBtn'];
cbtn._listeners.click[0]();
assert(ov.style.display==='none'&&eo.isPpFullscreenOpen()===false, 'O6 ✕閉じるで非表示');
assert(eo._ctx.document.body.style.overflow==='', 'O7 閉じると背面スクロール復帰');

// F focus 復元（ソース検証＝input/compositionend の両経路）
const bindSrc=RAW.slice(RAW.indexOf('function bindPastParticipantsPanelEvents'),RAW.indexOf('function bindPastParticipantsPanelEvents')+2200);
assert(bindSrc.indexOf('refocusPpSearch')>=0&&bindSrc.indexOf('setSelectionRange')>=0, 'F1 再描画後の focus/caret 復元 helper が存在');
assert(/input'.{0,200}renderPastParticipantsPanel\(input\.value\);refocusPpSearch\(\)/s.test(bindSrc)||bindSrc.indexOf('renderPastParticipantsPanel(input.value);refocusPpSearch()')>=0, 'F2 input 経路で復元を呼ぶ');
assert(bindSrc.indexOf("composing=false;renderPastParticipantsPanel(input.value);refocusPpSearch()")>=0, 'F3 compositionend 経路でも復元を呼ぶ');

// T 全画面中の toast 鏡映（ソース検証）
const addSrc=RAW.slice(RAW.indexOf('function handlePastParticipantClassAdd'),RAW.indexOf('function handlePastParticipantClassAdd')+6500);
assert(/showMsg\('\['\+r\.player\.name[\s\S]{0,300}isPpFullscreenOpen\(\)\)showToast\('\['\+r\.player\.name/.test(addSrc), 'T1 追加成功時に全画面中は toast でも通知');
assert(/showMsg\('\['\+memberName[\s\S]{0,300}isPpFullscreenOpen\(\)\)showToast\('\['\+memberName/.test(addSrc), 'T2 クラス変更成功時に全画面中は toast でも通知');

// N 件数同期・非劣化
const en=loadEnv();
en._ctx.localStorage.setItem(en.BRANCH_MASTER_KEY,FIX_MASTER);
en.renderPastParticipantsPanel('');
assert(en._ctx._elements['pp-summary-fs']&&en._ctx._elements['pp-summary-fs'].textContent==='登録 2名', 'N1 #pp-summary-fs に件数同期');
assert(en._ctx._elements['pp-summary']&&en._ctx._elements['pp-summary'].textContent==='登録 2名', 'N2 既存 #pp-summary も従来どおり');
const en2=loadEnv();
en2.renderPastParticipantsPanel('');
assert(en2._ctx._elements['past-participants-section'].style.display==='none', 'N3 マスタ空なら section 非表示（既存非劣化）');

console.log('\n  PP-FULLSCREEN テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
