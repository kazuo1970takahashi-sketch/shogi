#!/usr/bin/env node
// SAVE-STATUS-BAR-001 (STYLE-GUIDE §9 M3 / 監査 🟡-2・🔵-2): 保存状態バーの単体テスト。
//   保存4系統（自動保存/📋名簿を更新/バックアップ/☁クラウドへ送信）の最終実行時刻を
//   localStorage 別キー SAVE_STATUS_KEY に記録し、ヘッダ直下バーに textContent で1行表示する純追加スライス。
//   検証:
//     R: loadSaveStatus（空/破損→{}）・markSaveStatus（記録）・formatSaveStatusTime（未/当日/別日）・buildSaveStatusBarText。
//     S: save() 成功で autosave が記録される（STORAGE_KEY 保存は非劣化）・markSaveStatus は fail-soft。
//     D: renderSaveStatusBar が #save-status-bar の textContent に4系統を書く（innerHTML 不使用）。
//     H: 静的 HTML＝id/role=button/tabindex/no-print・ヘッダと backup-nudge の間。
//     W: bindHeaderEvents で click/keydown → openHelpModal('save-systems') 結線＋初期描画。実クリックでモーダル open。
//     K: 4フック（save/syncBranchMasterOnSave/exportTournamentBackup/sendTournamentToCloud）がソース上に存在。
//     T: HELP_TEXTS['save-systems'] が承認済み title＋本文6行・buildHelpModalHtml で全行 present。
//   データは完全架空のみ。state スキーマには何も追加しない（別キー保存）。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_save_status_bar.js <html>');process.exit(1);}
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
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
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
       HELP_TEXTS:HELP_TEXTS,
       buildHelpModalHtml:buildHelpModalHtml,
       openHelpModal:openHelpModal,
       loadSaveStatus:loadSaveStatus,
       markSaveStatus:markSaveStatus,
       markAutosaveStatus:markAutosaveStatus,
       formatSaveStatusTime:formatSaveStatusTime,
       buildSaveStatusBarText:buildSaveStatusBarText,
       renderSaveStatusBar:renderSaveStatusBar,
       bindHeaderEvents:bindHeaderEvents,
       save:save,
       SAVE_STATUS_KEY:SAVE_STATUS_KEY,
       STORAGE_KEY:STORAGE_KEY
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

console.log('\n【SAVE-STATUS-BAR-001 (STYLE-GUIDE M3) 保存状態バー】');

// R レジストリ/ヘルパ
const env = loadEnv();
assert(env.SAVE_STATUS_KEY==='shogi_save_status_v1', 'R1 SAVE_STATUS_KEY が専用キー（state 別キー）');
assert(JSON.stringify(env.loadSaveStatus())==='{}', 'R2 未保存時 loadSaveStatus は {}');
env._ctx.localStorage.setItem(env.SAVE_STATUS_KEY,'{broken json');
assert(JSON.stringify(env.loadSaveStatus())==='{}', 'R3 破損 JSON でも {} を返す（fail-soft）');
env._ctx.localStorage.setItem(env.SAVE_STATUS_KEY,'[1,2]');
assert(JSON.stringify(env.loadSaveStatus())==='{}', 'R4 配列など object 以外も {} に落とす');
env._ctx.localStorage.removeItem(env.SAVE_STATUS_KEY);
env.markSaveStatus('backup');
const st1=env.loadSaveStatus();
assert(typeof st1.backup==='number'&&st1.backup>0, 'R5 markSaveStatus(backup) が epoch ms を記録');
assert(env.formatSaveStatusTime(undefined)==='未'&&env.formatSaveStatusTime(0)==='未'&&env.formatSaveStatusTime('x')==='未', 'R6 未実行/不正値は「未」');
const nowT=Date.now();
assert(/^\d{2}:\d{2}$/.test(env.formatSaveStatusTime(nowT)), 'R7 当日は HH:MM');
const past=new Date(new Date().getFullYear()-1,0,5,9,7,0).getTime();
assert(env.formatSaveStatusTime(past)===(new Date().getFullYear()-1)+'/01/05 09:07', 'R8 別日は YYYY/MM/DD HH:MM（年つき8桁・ゼロ埋め）');
const txtEmpty=env.buildSaveStatusBarText({});
assert(txtEmpty.indexOf('💾 自動保存 未')>=0&&txtEmpty.indexOf('📋 名簿 未')>=0&&txtEmpty.indexOf('バックアップ 未')>=0&&txtEmpty.indexOf('☁ 送信 未')>=0, 'R9 全未実行で4系統とも「未」');
assert(txtEmpty.split('｜').length===4, 'R10 区切りは ｜ で4要素');
const txtPart=env.buildSaveStatusBarText({autosave:nowT});
assert(/自動保存 \d{2}:\d{2}/.test(txtPart)&&txtPart.indexOf('バックアップ 未')>=0, 'R11 一部のみ記録なら該当だけ時刻表示');

// S save() フック（非劣化＋autosave 記録）
const es = loadEnv();
es.save();
assert(!!es._ctx.localStorage._[es.STORAGE_KEY], 'S1 save() が STORAGE_KEY へ保存（非劣化）');
const stS=es.loadSaveStatus();
assert(typeof stS.autosave==='number'&&stS.autosave>0, 'S2 save() 成功で autosave が記録される');
let threwS=false; try{ es.save(); es.save(); }catch(e){ threwS=true; }
assert(!threwS, 'S3 連続 save()（分単位スロットル経路）でも例外なし');

// D 描画（textContent・innerHTML 不使用）
const ed = loadEnv();
ed.markSaveStatus('meibo');
const barEl=ed._ctx.document.getElementById('save-status-bar');
assert(typeof barEl.textContent==='string'&&barEl.textContent.indexOf('📋 名簿 ')>=0&&barEl.textContent.indexOf('自動保存')>=0, 'D1 renderSaveStatusBar が textContent に4系統を書く');
assert(barEl.innerHTML==='', 'D2 バーへ innerHTML を使わない（textContent のみ）');
const rsbSrc=RAW.slice(RAW.indexOf('function renderSaveStatusBar'),RAW.indexOf('function renderSaveStatusBar')+400);
assert(rsbSrc.indexOf('textContent')>=0&&rsbSrc.indexOf('innerHTML')<0, 'D3 renderSaveStatusBar 実装も textContent 経由');

// H 静的 HTML
assert(RAW.indexOf('id="save-status-bar"')>=0, 'H1 #save-status-bar が静的 HTML に存在');
const barIdx=RAW.indexOf('id="save-status-bar"');
const barTag=RAW.slice(RAW.lastIndexOf('<div',barIdx),RAW.indexOf('>',barIdx)+1);
assert(barTag.indexOf('role="button"')>=0&&barTag.indexOf('tabindex="0"')>=0, 'H2 role=button＋tabindex=0（キーボード到達可）');
assert(barTag.indexOf('no-print')>=0, 'H3 no-print（印刷に出さない）');
assert(barTag.indexOf('aria-label')>=0, 'H4 aria-label あり');
assert(barIdx>RAW.indexOf('class="header"')&&barIdx<RAW.indexOf('id="backup-nudge"'), 'H5 ヘッダと backup-nudge の間に配置');

// W bind（bindHeaderEvents 結線＋実クリックでモーダル open）
const bheStart=RAW.indexOf('function bindHeaderEvents');
const bheBody=RAW.slice(bheStart,RAW.indexOf('function bindRegistrationEvents'));
assert(bheBody.indexOf("getElementById('save-status-bar')")>=0&&bheBody.indexOf("openHelpModal('save-systems')")>=0, 'W1 bindHeaderEvents で save-status-bar → save-systems ヘルプ結線');
assert(bheBody.indexOf('renderSaveStatusBar()')>=0, 'W2 bindHeaderEvents で初期描画');
const ew = loadEnv();
let threwW=false; try{ ew.bindHeaderEvents(); }catch(e){ threwW=true; }
assert(!threwW, 'W3 bindHeaderEvents が mock DOM で例外なく実行される');
const barW=ew._ctx._elements['save-status-bar'];
assert(barW&&barW._listeners.click&&barW._listeners.click.length>0, 'W4 バーに click ハンドラ');
barW._listeners.click[0]();
assert(ew._ctx.document.body.childNodes.length===1&&ew._ctx.document.body.childNodes[0].innerHTML.indexOf('保存の仕組み')>=0, 'W5 クリックで「保存の仕組み」モーダルが開く');
assert(barW._listeners.keydown&&barW._listeners.keydown.length>0, 'W6 keydown（Enter/Space）ハンドラあり');

// K 4フックの存在（ソース検証）
const saveSrc=RAW.slice(RAW.indexOf('function save()'),RAW.indexOf('function save()')+900);
assert(saveSrc.indexOf('markAutosaveStatus()')>=0, 'K1 save() 成功パスで markAutosaveStatus');
const syncSrc=RAW.slice(RAW.indexOf('function syncBranchMasterOnSave'),RAW.indexOf('function saveData'));  // YOMI-SYNC-OVERWRITE-001 で関数が伸びたため関数全体を対象に
assert(/masterSaved!==false\)\{[\s\S]{0,1200}markSaveStatus\('meibo'\)/.test(syncSrc), 'K2 名簿同期成功時のみ meibo 記録');  // YOMI-SYNC-OVERWRITE-001 で成功分岐に yomiDirty 解除が入り窓を拡張
const expSrc=RAW.slice(RAW.indexOf('function exportTournamentBackup'),RAW.indexOf('function exportTournamentBackup')+1400);
assert(expSrc.indexOf("markSaveStatus('backup')")>=0&&expSrc.indexOf("markSaveStatus('backup')")<expSrc.indexOf('return true;')+30, 'K3 バックアップ成功時に backup 記録');
// SEND-DATE-CONFIRM-002 (#622)/SEND-DATE-GUARD-001 (#600): 冒頭の日付確認ガードで関数が伸びたため窓を 3600→5200 に拡大（チェック内容は不変）。
const cloudSrc=RAW.slice(RAW.indexOf('function sendTournamentToCloud'),RAW.indexOf('function sendTournamentToCloud')+5200);
assert(/res&&res\.ok[\s\S]{0,900}markSaveStatus\('cloud'\)/.test(cloudSrc), 'K4 送信 res.ok 時に cloud 記録');

// T ヘルプ topic
const hs=env.HELP_TEXTS&&env.HELP_TEXTS['save-systems'];
assert(!!hs&&hs.title==='保存の仕組み（4系統）', 'T1 save-systems の title');
assert(hs&&Array.isArray(hs.lines)&&hs.lines.length===6, 'T2 本文6行');
const jh=hs?hs.lines.join('\n'):'';
assert(jh.indexOf('自動保存')>=0&&jh.indexOf('名簿を更新')>=0&&jh.indexOf('バックアップ')>=0&&jh.indexOf('クラウドへ送信')>=0, 'T3 4系統すべての説明を含む');
assert(jh.indexOf('復旧ができるのはこれだけ')>=0, 'T4 復旧はバックアップのみの説明を含む');
assert(jh.indexOf('「未」')>=0, 'T5 「未」の意味の説明を含む');
const mh=env.buildHelpModalHtml('save-systems');
let allH=!!hs; for(let i=0;hs&&i<hs.lines.length;i++){ if(mh.indexOf(hs.lines[i])<0) allH=false; }
assert(allH&&mh.indexOf('保存の仕組み（4系統）')>=0, 'T6 buildHelpModalHtml に title＋全行 present');
assert(env.HELP_TEXTS['tournament']&&env.HELP_TEXTS['cloud']&&env.HELP_TEXTS['save-warning'], 'T7 既存 topic 非劣化');

console.log('\n  SAVE-STATUS-BAR テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
