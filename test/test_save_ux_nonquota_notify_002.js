#!/usr/bin/env node
// SAVE-UX-NONQUOTA-NOTIFY-001 (Issue #260) — Codex Conditional GO P2 追補（P2-A / P2-B）の回帰テスト。
//
// 背景:
//   先行コミット b95fc67 で saveBranchMaster() の失敗シグナル return ＋ 代表経路の成功バナー抑止を入れた。
//   続く Codex レビューが 2 件の P2 を指摘:
//     P2-A: 過去大会統合（マイグレ）で saveBranchMaster(master) が false のとき、in-memory の統合結果は
//           localStorage に書かれていないのに、ステータスが「マスタをエクスポート」へ誘導する。しかし
//           エクスポートボタンは loadBranchMaster() で統合前データを再読込して書き出すため、ユーザは
//           古いデータをバックアップして統合結果を失う（誤誘導）。
//     P2-B: yomi バックフィル経路（サジェスト由来 yomi 補完 ~5116 / syncBranchMasterOnSave 内の
//           updateBranchMasterFromTournament 後 saveBranchMaster ~7902）で saveBranchMaster の false が
//           無視され、直後の参加者登録 showMsg('ok') で警告が握り潰される。参加者登録自体は成功するが、
//           ふりがなのマスタ反映が保存されなかったことが操作者に伝わらない。
//
// 観点:
//   A 文言（P2-A）: 統合保存失敗時のステータスは「マスタをエクスポート」を復旧策として案内しない（誤誘導の除去）。
//      かつ「統合内容は保存されていない／マスタは変更前のまま」を明示する。保存成功時は従来どおりサマリを出す。
//   B1 addPlayer yomi バックフィル（P2-B 5116）: サジェスト由来 yomi 補完の master 保存が失敗したとき、
//      参加者登録の成功表示の後に保存失敗の警告が残る（reg-msg に warn）。成功時は warn を出さない。
//      旧コードの空 catch（握り潰し）が是正されていること（保存成功時の正常動作の非回帰）。
//   B2 syncBranchMasterOnSave（P2-B 7902）: master 保存が失敗したとき、未反映の _pendingNewYomi を破棄しない
//      （次回再試行に備える）。成功時は従来どおり _pendingNewYomi をクリアする。

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
  function gatherText(node){
    if(node==null)return '';
    if(node.nodeType===3)return node.textContent;
    var s='', ch=node.childNodes||[];
    for(var i=0;i<ch.length;i++)s+=gatherText(ch[i]);
    return s;
  }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'',
      type:'', selected:false, checked:false, disabled:false, hidden:false,
      style:{}, _attrs:{}, _innerHTML:'', childNodes:[], _listeners:{},
      appendChild:function(c){ this.childNodes.push(c); return c; },
      insertBefore:function(c){ this.childNodes.unshift(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
      remove:function(){},
      addEventListener:function(ev,fn){ (this._listeners[ev]=this._listeners[ev]||[]).push(fn); },
      removeEventListener:function(){},
      _fire:function(ev){ var ls=this._listeners[ev]||[]; for(var i=0;i<ls.length;i++)ls[i].call(this,{}); },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      removeAttribute:function(k){ delete this._attrs[k]; },
      focus:function(){}, blur:function(){}, click:function(){ this._fire('click'); },
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
      get firstChild(){ return this.childNodes[0]||null; },
      get lastChild(){ return this.childNodes[this.childNodes.length-1]||null; },
      get children(){ return this.childNodes.filter(function(n){return n.nodeType===1;}); },
      get textContent(){ return gatherText(this); },
      set textContent(v){ this.childNodes=[makeText(v)]; },
      get innerHTML(){ return this._innerHTML; },
      set innerHTML(v){ this._innerHTML=String(v); if(v==='')this.childNodes=[]; }
    };
  }
  var elements={};
  var docMock={
    _elements:elements,
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
  function BlobMock(parts,opt){ return {_isMockBlob:true, _content:(parts&&parts[0])?String(parts[0]):'', type:opt&&opt.type}; }
  var urlMock={ createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){} };
  return { document:docMock, window:winMock, localStorage:localStorageMock, Blob:BlobMock, URL:urlMock };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const warnCalls = [];
  const consoleMock = { log:function(){}, warn:function(){ warnCalls.push([].slice.call(arguments)); }, error:function(){} };
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const navigatorMock = {};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};
     return {
       saveBranchMaster:saveBranchMaster,
       loadBranchMaster:loadBranchMaster,
       addPlayer:addPlayer,
       syncBranchMasterOnSave:syncBranchMasterOnSave,
       bindMigrationModalEvents:bindMigrationModalEvents,
       mergeTournamentParticipantsIntoMaster:mergeTournamentParticipantsIntoMaster,
       _branchMasterKey:BRANCH_MASTER_KEY,
       _getState:function(){ return state; },
       _setState:function(s){ state=s; },
       _getPendingNewYomi:function(){ return _pendingNewYomi; },
       _setPendingNewYomi:function(o){ _pendingNewYomi=o; },
       _getSuggestState:function(){ return _suggestState; },
       _getIndicatorCount:function(){ return saveWarningIndicatorState.count; },
       _getRegMsgHtml:function(){ return document.getElementById('reg-msg').innerHTML; },
       _reset:function(){
         saveWarningIndicatorState.count=0;
         if(typeof _resetSaveWarningAggregationState==='function')_resetSaveWarningAggregationState();
         if(typeof updateSaveWarningIndicator==='function')updateSaveWarningIndicator();
         document.getElementById('reg-msg').innerHTML='';
       }
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, consoleMock, Promise, function(){}, navigatorMock
  );
  api._ctx = ctx;
  api._warnCalls = warnCalls;
  api._clearWarn = function(){ warnCalls.length=0; };
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_save_ux_nonquota_notify_002.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

const env = loadEnv(targetPath);
const ls = env._ctx.localStorage;
const origSetItem = ls.setItem;
function failSetItem(name){ ls.setItem = function(){ var e=new Error('blocked'); e.name=name||'SecurityError'; throw e; }; }
function okSetItem(){ ls.setItem = origSetItem; }
function clearStorage(){ for(var k in ls._){ if(Object.prototype.hasOwnProperty.call(ls._,k))delete ls._[k]; } }
function setMaster(master){ ls._[env._branchMasterKey]=JSON.stringify(master); }

function masterWith(memberYomi){
  return { schema_version:1, updated_at:'', members:[
    { id:'m1', name:'架空花子', yomi:(memberYomi||''), member:'member', grade:'ippan' }
  ] };
}

function migrationTournamentText(){
  return JSON.stringify({
    tournament_id:'t-2026-0101',
    tournament_date:'2026-01-01',
    players:{ A:[ { id:'px', name:'統合太郎', cls:'A', member:'member', grade:'ippan' } ] },
    pairings:{ A:[] }, results:{ A:[] }, report:{ date:'2026年1月1日' }
  });
}

// ============================================================
// A. マイグレ統合 保存失敗時のステータス文言（P2-A）
// ============================================================
function runMigration(text){
  var d=env._ctx.document;
  d.getElementById('mig-cancel');
  var runBtn=d.getElementById('mig-run');
  var area=d.getElementById('mig-paste-area');
  var status=d.getElementById('mig-status');
  area.value=text;
  status.textContent='';
  env.bindMigrationModalEvents();
  runBtn._fire('click');
  return status.textContent;
}

env._reset(); env._clearWarn(); clearStorage(); setMaster(masterWith('')); failSetItem('SecurityError');
const aFail = runMigration(migrationTournamentText());
assert(aFail.indexOf('マスタをエクスポート')<0, 'A1 統合保存失敗時は「マスタをエクスポート」を復旧策として案内しない(P2-A 誤誘導除去)');
assert(aFail.indexOf('保存されません')>=0 || aFail.indexOf('保存されていない')>=0 || aFail.indexOf('保存できません')>=0, 'A2 統合保存失敗時は「保存されていない」ことを明示');
assert(aFail.indexOf('統合前')>=0 || aFail.indexOf('変更前')>=0 || aFail.indexOf('変更されていません')>=0, 'A3 マスタが統合前(変更前)のままであることを明示');

env._reset(); env._clearWarn(); clearStorage(); setMaster(masterWith('')); okSetItem();
const aOk = runMigration(migrationTournamentText());
assert(aOk.indexOf('大会を読込')>=0 && aOk.indexOf('新規追加')>=0, 'A4 統合保存成功時は従来どおり読込サマリを出す(非回帰)');

// ============================================================
// B1. addPlayer yomi バックフィル（サジェスト由来）保存失敗の握り潰し是正（P2-B 5116）
// ============================================================
function runAddPlayerSuggest(){
  var d=env._ctx.document;
  d.getElementById('inp-name').value='架空花子';
  var yomi=d.getElementById('inp-yomi'); yomi.value='かくうはなこ';
  d.getElementById('inp-class').value='A';
  var ss=env._getSuggestState();
  ss.selectedMemberId='m1';
  ss.selectedNormalizedName='架空花子';
}

env._reset(); env._clearWarn(); clearStorage(); setMaster(masterWith(''));
env._setState({ players:{A:[],B:[]}, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false, report:{} });
env._setPendingNewYomi({});
runAddPlayerSuggest();
failSetItem('SecurityError');
env.addPlayer();
const b1Fail = env._getRegMsgHtml();
const b1State = env._getState();
const registered = b1State.players.A.some(function(p){return p.name==='架空花子';});
assert(registered, 'B1-pre 参加者登録自体は成功する(players に追加される)');
assert(b1Fail.indexOf('alert-warn')>=0, 'B1 yomi バックフィル保存失敗で warn が残る(成功 showMsg で握り潰されない)');
// reg-msg の最終表示は同一 aggregateKey の SAVE-002 verify warn に集約され得る（warn 自体は残る＝B1 で実証済）。
// master 保存失敗そのものの可視化は専用 consoleTag で固定する（握り潰し是正の芯）。
const b1YomiWarnLogged = env._warnCalls.some(function(c){
  return c && c[0] && String(c[0]).indexOf('addPlayer yomi backfill saveBranchMaster failed')>=0;
});
assert(b1YomiWarnLogged, 'B2 yomi バックフィル保存失敗が専用 consoleTag で記録される(master 保存失敗の明示・握り潰し是正)');
assert(env._getIndicatorCount()>=1, 'B3 yomi バックフィル保存失敗で indicator が立つ(ユーザー可視)');

env._reset(); env._clearWarn(); clearStorage(); setMaster(masterWith(''));
env._setState({ players:{A:[],B:[]}, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false, report:{} });
env._setPendingNewYomi({});
runAddPlayerSuggest();
okSetItem();
env.addPlayer();
const b1Ok = env._getRegMsgHtml();
assert(b1Ok.indexOf('alert-ok')>=0, 'B4 yomi バックフィル保存成功で参加者登録の成功バナーが出る(非回帰)');
assert(b1Ok.indexOf('alert-warn')<0, 'B5 yomi バックフィル保存成功で保存失敗 warn は出ない');
const savedMaster = env.loadBranchMaster();
const m1 = savedMaster.members.filter(function(x){return x.id==='m1';})[0];
assert(m1 && m1.yomi==='かくうはなこ', 'B6 保存成功時は master.yomi が補完される(バックフィル本来の動作の非回帰)');

// ============================================================
// B2. syncBranchMasterOnSave 保存失敗時の _pendingNewYomi 保持（P2-B 7902）
// ============================================================
env._reset(); env._clearWarn(); clearStorage(); setMaster(masterWith(''));
env._setState({ players:{A:[{id:'px',name:'同期太郎',cls:'A',member:'member',grade:'ippan',entry_no:1}],B:[]},
  pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false, report:{date:'2026年2月2日'}, tournament_id:'' });
env._setPendingNewYomi({ px:'どうきたろう' });
failSetItem('SecurityError');
env.syncBranchMasterOnSave();
const pendFail = env._getPendingNewYomi();
assert(pendFail && pendFail.px==='どうきたろう', 'B7 syncBranchMasterOnSave 保存失敗時は _pendingNewYomi を破棄しない(次回再試行に備える)');

env._reset(); env._clearWarn(); clearStorage(); setMaster(masterWith(''));
env._setState({ players:{A:[{id:'px',name:'同期太郎',cls:'A',member:'member',grade:'ippan',entry_no:1}],B:[]},
  pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false, report:{date:'2026年2月2日'}, tournament_id:'' });
env._setPendingNewYomi({ px:'どうきたろう' });
okSetItem();
env.syncBranchMasterOnSave();
const pendOk = env._getPendingNewYomi();
assert(pendOk && Object.keys(pendOk).length===0, 'B8 syncBranchMasterOnSave 保存成功時は _pendingNewYomi をクリアする(非回帰)');

console.log('');
console.log('  SAVE-UX-NONQUOTA-NOTIFY-001 P2 追補(P2-A/P2-B) テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
