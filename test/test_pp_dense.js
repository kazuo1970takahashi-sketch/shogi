#!/usr/bin/env node
// PP-DENSE-MODE-001 (S2) + REG-TAB-IA-001 (S1): 登録タブ再配置＋全画面ピッカー高密度化（方式X「追加先モード」・作者承認済 2026-07-02）。
//   検証:
//     A: S1＝reg-setup-details（⚙ 大会の設定）にクラス管理＋回戦数を格納・「📋 名簿から受付」primary が登録セクション先頭。
//     M: モードバー＝クラス一覧から動的生成・既定は先頭クラス・active に ✓・sticky CSS。
//     B: ビルダー＝🔍 details に既存コントロール格納・50音見出し・2列グリッド・セル内容（氏名/ふりがな/前回/支部外バッジ）。
//     R: 受付済セル＝クラス色＋「✓ 受付済」・位置は変わらない（3セクション分割廃止＝ソートは常に yomi 昇順・ふりがな無しは「他」末尾）。
//     T: handlePpDenseTap＝未受付タップで confirm 無し即受付（state 反映・toast・再描画）・受付済タップでシート表示（silent toggle しない）。
//     G: 旧 buildPastParticipantsPanelHtml は無改変で温存（GOLDEN/回帰資産・UI 未結線化）。
//   fixture は完全架空のみ。
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_pp_dense.js <html>');process.exit(1);}
const RAW = fs.readFileSync(targetPath, 'utf8');

function extractScripts(html){
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  var elements={};
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
      disabled:false, type:'',
      style:{cssText:''}, _attrs:{}, childNodes:[], _listeners:{}, _parent:null,
      appendChild:function(c){ c._parent=this; this.childNodes.push(c); if(c.id)elements[c.id]=c; return c; },
      remove:function(){ if(this._parent){var a=this._parent.childNodes;for(var i=0;i<a.length;i++){if(a[i]===this){a.splice(i,1);break;}}this._parent=null;} if(this.id&&elements[this.id]===this)delete elements[this.id]; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      focus:function(){}, setSelectionRange:function(){}, click:function(){},
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
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){}, scrollTo:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock, _elements:elements };
}

function loadEnv(){
  const ctx = makeContext();
  const alerts=[];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){} };
  const js = extractScripts(RAW);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};
     return {
       buildPpDenseListHtml:buildPpDenseListHtml,
       _buildPpModeBarHtml:_buildPpModeBarHtml,
       _buildPpDenseCellHtml:_buildPpDenseCellHtml,
       ppDenseActiveCls:ppDenseActiveCls,
       ppDenseClsPalette:ppDenseClsPalette,
       handlePpDenseTap:handlePpDenseTap,
       openPpDenseActionSheet:openPpDenseActionSheet,
       renderPastParticipantsPanel:renderPastParticipantsPanel,
       buildPastParticipantsPanelHtml:buildPastParticipantsPanelHtml,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       _get:function(){return state;},
       _setDenseCls:function(v){_ppDenseCls=v;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, {randomUUID:()=>'00000000-0000-0000-0000-000000000000'},
    function(m){alerts.push(String(m));}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){}, {onLine:true}
  );
  api._ctx = ctx;
  api._alerts = alerts;
  return api;
}

const FIX=JSON.stringify({schema_version:1,members:[
  {id:'m-a1',name:'架空太郎',yomi:'かくうたろう',last_class:'A',last_attended:'2026-06-01',attend_count:3},
  {id:'m-a2',name:'安藤架空',yomi:'あんどうかくう',last_class:'B',last_attended:'2026-05-01',attend_count:2,member:'other'},
  {id:'m-n1',name:'読無架空',yomi:'',last_class:'',last_attended:'',attend_count:1}
]});

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('\n【PP-DENSE-MODE-001 (S2) + REG-TAB-IA-001 (S1)】');

// A: S1 配置替え
assert(RAW.indexOf('id="reg-setup-details"')>=0, 'A1 「⚙ 大会の設定」details が存在');
const setupBlock=RAW.slice(RAW.indexOf('id="reg-setup-details"'),RAW.indexOf('参加者を登録する'));
assert(setupBlock.indexOf('id="class-manager-section"')>=0&&setupBlock.indexOf('id="rounds-config-section"')>=0, 'A2 クラス管理＋回戦数が details 内に格納');
const regSecIdx=RAW.indexOf('参加者を登録する');
const regBlock=RAW.slice(regSecIdx,RAW.indexOf('id="suggest-list"'));
assert(regBlock.indexOf('id="ppToggleBtn"')>=0&&regBlock.indexOf('btn-primary')>=0&&regBlock.indexOf('名簿から受付')>=0, 'A3 「📋 名簿から受付」primary が登録セクション内');
assert(RAW.indexOf('id="reg-setup-details"')<regSecIdx, 'A4 設定 details は登録セクションより上（朝いち→受付の時系列）');

// M: モードバー
const em=loadEnv();
em._ctx.localStorage.setItem(em.BRANCH_MASTER_KEY,FIX);
assert(em.ppDenseActiveCls()==='A', 'M1 既定の追加先は先頭クラス（A）');
const bar=em._buildPpModeBarHtml();
assert(bar.indexOf('pp-mode-btn')>=0&&bar.indexOf('data-cls="A"')>=0&&bar.indexOf('data-cls="B"')>=0, 'M2 モードバーはクラス一覧から動的生成');
assert(bar.indexOf('Aクラス ✓')>=0, 'M3 active クラスに ✓');
em._setDenseCls('B');
assert(em.ppDenseActiveCls()==='B'&&em._buildPpModeBarHtml().indexOf('Bクラス ✓')>=0, 'M4 モード切替で active が変わる');
em._setDenseCls('ZZZ');
assert(em.ppDenseActiveCls()==='A', 'M5 不正クラスは先頭へフォールバック');
assert(/#pp-fullscreen \.pp-mode-bar\{[^}]*position:sticky/.test(RAW), 'M6 モードバーは overlay 内 sticky（scoped CSS）');

// M7/M8: L3 P1-a＝CV-2 未実装クラス（C 等）はモードバーに出さず手入力へ誘導
const ec=loadEnv();
ec._ctx.localStorage.setItem(ec.BRANCH_MASTER_KEY,FIX);
var stC=ec._get();stC.classes.push({id:'C',name:'Cクラス',started:false});
const barC=ec._buildPpModeBarHtml();
assert(barC.indexOf('data-cls="C"')<0, 'M7 受付不可クラス（C・CV-2未実装）はモードバーに出さない');
assert(barC.indexOf('手入力で受付')>=0, 'M8 A/B 以外があるときは手入力への誘導を明示');

// B: ビルダー
const eb=loadEnv();
eb._ctx.localStorage.setItem(eb.BRANCH_MASTER_KEY,FIX);
const h=eb.buildPpDenseListHtml(JSON.parse(FIX),'','all',null);
assert(h.indexOf('pp-search-details')>=0&&h.indexOf('id="pp-search"')>=0, 'B1 検索/絞り込みは 🔍 details に格納（既存 id 流用）');
assert(h.indexOf('pp-dense-grid')>=0&&h.indexOf('grid-template-columns:1fr 1fr')>=0, 'B2 2列グリッド');
const iA=h.indexOf('>あ<'),iKa=h.indexOf('>か<'),iOther=h.indexOf('>他<');
assert(iA>=0&&iKa>iA&&iOther>iKa, 'B3 50音見出しが あ→か→…→他 の順');
assert(h.indexOf('安藤架空')<h.indexOf('架空太郎'), 'B4 あ行（安藤）が か行（架空）より先＝ふりがな昇順');
assert(iOther<h.indexOf('読無架空'), 'B5 ふりがな無しは「他」見出しの下（末尾）');
assert(h.indexOf('前A')>=0&&h.indexOf('前B')>=0, 'B6 前回クラスバッジ');
assert(h.indexOf('支部外')>=0, 'B7 支部員以外バッジ');
// 作者FB: ふりがなはルビ位置＝氏名の上に表示する。
const cellY=eb._buildPpDenseCellHtml({id:'m-a1',name:'架空太郎',yomi:'かくうたろう'},null);
assert(cellY.indexOf('かくうたろう')>=0&&cellY.indexOf('かくうたろう')<cellY.indexOf('架空太郎</div>'), 'B8 ふりがなは氏名の上（ルビ位置）に表示');
assert(h.indexOf('pp-section-a-enrolled')<0&&h.indexOf('エントリー済')<0, 'B9 3セクション分割は廃止');
// L3 P1-b: 検索/フィルタ活性中は 🔍 details を open 維持（再描画で閉じない）
assert(h.indexOf('<details class="pp-search-details" style')>=0, 'B10 フィルタ非活性時は details 閉');
const hq=eb.buildPpDenseListHtml(JSON.parse(FIX),'かくう','all',null);
assert(hq.indexOf('<details class="pp-search-details" open')>=0, 'B11 検索クエリ活性中は details open 維持');

// R: 受付済セル
const cellReg=eb._buildPpDenseCellHtml({id:'m-a1',name:'架空太郎',yomi:'かくうたろう',last_class:'A'},'A');
assert(cellReg.indexOf('✓ 受付済（Aクラス）')>=0, 'R1 受付済セルは ✓ 受付済（クラス名）');
assert(cellReg.indexOf('#bbdefb')>=0, 'R2 受付済セルはクラス色（A=青系）');
const cellUn=eb._buildPpDenseCellHtml({id:'m-a1',name:'架空太郎',yomi:'かくうたろう'},null);
assert(cellUn.indexOf('受付済')<0&&cellUn.indexOf('background:#fff')>=0, 'R3 未受付セルは白');

// T: タップ処理（confirm 無し即受付→toast→受付済化・済タップはシート）
const et=loadEnv();
et._ctx.localStorage.setItem(et.BRANCH_MASTER_KEY,FIX);
et.handlePpDenseTap('m-a1');
const stA=et._get().players.A||[];
assert(stA.length===1&&stA[0].name==='架空太郎'&&stA[0].member_id==='m-a1', 'T1 未受付タップで先頭クラスへ即受付（state 反映）');
assert(String(et._ctx._elements['app-toast'].textContent).indexOf('架空太郎')>=0&&String(et._ctx._elements['app-toast'].textContent).indexOf('受付しました')>=0, 'T2 受付成功が toast に出る');
assert(et._alerts.length===0, 'T3 成功経路で alert/confirm ブロックなし');
assert(et._ctx._elements['ppPanel'].innerHTML.indexOf('✓ 受付済')>=0, 'T4 再描画で済セル化（同じ位置に残る）');
et.handlePpDenseTap('m-a1');
assert(et._ctx._elements['pp-dense-sheet']!=null&&et._ctx.document.body.childNodes.some(function(n){return n.id==='pp-dense-sheet';}), 'T5 受付済タップでシートが開く（silent toggle しない）');
const sheetHtml=et._ctx._elements['pp-dense-sheet'].innerHTML;
assert(sheetHtml.indexOf('Bクラスへ変更')>=0&&sheetHtml.indexOf('受付を取り消す')>=0&&sheetHtml.indexOf('キャンセル')>=0, 'T6 シートに 変更/取消/キャンセル');
const et2=loadEnv();
et2._ctx.localStorage.setItem(et2.BRANCH_MASTER_KEY,FIX);
et2._setDenseCls('B');
et2.handlePpDenseTap('m-a2');
assert((et2._get().players.B||[]).length===1&&(et2._get().players.B||[])[0].name==='安藤架空', 'T7 モードB では B クラスへ受付');

// G: 旧ビルダー温存（回帰資産）
const gOld=eb.buildPastParticipantsPanelHtml(JSON.parse(FIX),'','all',null);
assert(gOld.indexOf('pp-list-box')>=0&&gOld.indexOf('pp-add-btn')>=0, 'G1 旧ビルダーは無改変で温存（GOLDEN 資産）');
assert(RAW.indexOf('buildPpDenseListHtml(master,filter')>=0, 'G2 renderPastParticipantsPanel の描画先は dense ビルダー');

console.log('\n  PP-DENSE テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
