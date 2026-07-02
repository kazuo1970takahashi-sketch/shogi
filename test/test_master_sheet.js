#!/usr/bin/env node
// MASTER-SHEET-001 (作者FB 2026-07-02・案1承認済): 会員名簿「簡易一覧」のスプレッドシート型刷新。
//   行の編集/削除ボタン全廃＝セルタップ直接編集（氏名/ふりがな・支部員・会費）＋行選択→ツールバーで削除/復元。
//   ふりがなは氏名の上（ルビ位置）で列復活。既定ソートはふりがな順（切替で最終参加順）。
//   検証:
//     B: build＝新ヘッダ列・旧ボタン撤去・ルビ行・未入力アンバー・ソート既定/切替・選択ツールバー・削除済み行。
//     C: coordinator＝cycleMember/cycleGrade/deleteSelected/restoreSelected/インライン編集 commit（既存 applyMasterMember* 流用）。
//     W: bindMasterTabEvents に新 bind が存在（build/bind 分離）。
//   fixture は完全架空のみ。
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_master_sheet.js <html>');process.exit(1);}
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
      disabled:false, type:'', checked:false,
      style:{cssText:''}, _attrs:{}, childNodes:[], _listeners:{}, _parent:null,
      appendChild:function(c){ c._parent=this; this.childNodes.push(c); if(c.id)elements[c.id]=c; return c; },
      remove:function(){ if(this._parent){var a=this._parent.childNodes;for(var i=0;i<a.length;i++){if(a[i]===this){a.splice(i,1);break;}}this._parent=null;} if(this.id&&elements[this.id]===this)delete elements[this.id]; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(ev,cb){ (this._listeners[ev]=this._listeners[ev]||[]).push(cb); },
      removeEventListener:function(){},
      focus:function(){}, click:function(){}, contains:function(){return false;},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'),
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
  const confirms=[];
  const js = extractScripts(RAW);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};
     return {
       buildMasterTabHtml:buildMasterTabHtml,
       renderMasterTab:renderMasterTab,
       masterSheetSelectedMids:masterSheetSelectedMids,
       masterSheetToggleSelect:masterSheetToggleSelect,
       masterSheetClearSelection:masterSheetClearSelection,
       masterSheetDeleteSelected:masterSheetDeleteSelected,
       masterSheetRestoreSelected:masterSheetRestoreSelected,
       masterSheetCycleMember:masterSheetCycleMember,
       masterSheetCycleGrade:masterSheetCycleGrade,
       masterSheetCommitNameEdit:masterSheetCommitNameEdit,
       pushMemberEditToCloud:pushMemberEditToCloud,
       pushMemberDeleteStateToCloud:pushMemberDeleteStateToCloud,
       pushAllMembersToCloud:pushAllMembersToCloud,
       mergeCloudMembersIntoMaster:mergeCloudMembersIntoMaster,
       _cloudMemberFieldCols:_cloudMemberFieldCols,
       loadBranchMaster:loadBranchMaster,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       _setSort:function(v){_masterSortMode=v;},
       _select:function(mid){_masterSelected[mid]=true;},
       _selected:function(){return _masterSelected;},
       _setEditingMid:function(v){_masterEditingMid=v;},
       _setShowDeleted:function(v){_masterShowDeleted=v;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, {randomUUID:()=>'00000000-0000-0000-0000-000000000000'},
    function(m){alerts.push(String(m));}, function(m){confirms.push(String(m));return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    {log:function(){},warn:function(){},error:function(){}}, Promise, function(cb){}, {onLine:true}
  );
  api._ctx = ctx;
  api._alerts = alerts;
  api._confirms = confirms;
  return api;
}

const FIX={schema_version:1,members:[
  {id:'m-ka',name:'架空太郎',yomi:'かくうたろう',member:'member',grade:'ippan',last_class:'A',last_attended:'2026-06-01',deleted:false},
  {id:'m-an',name:'安藤架空',yomi:'あんどうかくう',member:'other',grade:'chu',last_class:'B',last_attended:'2026-05-01',deleted:false},
  {id:'m-no',name:'読無架空',yomi:'',member:'member',grade:'josei',last_class:'',last_attended:'2026-04-01',deleted:false},
  {id:'m-dl',name:'削除架空',yomi:'さくじょかくう',member:'member',grade:'ippan',last_class:'A',last_attended:'2026-03-01',deleted:true,deleted_at:'2026-06-15'}
]};
function fixJson(){return JSON.stringify(FIX);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

console.log('\n【MASTER-SHEET-001 会員名簿 スプレッドシート型一覧】');

// B: build
const eb=loadEnv();
const h=eb.buildMasterTabHtml(JSON.parse(fixJson()));
assert(h.indexOf('氏名（ふりがな）')>=0&&h.indexOf('>支部員</th>')>=0&&h.indexOf('>会費</th>')>=0&&h.indexOf('>前回</th>')>=0&&h.indexOf('>最終参加</th>')>=0, 'B1 新ヘッダ列（氏名(ふりがな)/支部員/会費/前回/最終参加）');
assert(h.indexOf('master-edit-btn')<0&&h.indexOf('master-delete-btn')<0&&h.indexOf('master-restore-btn')<0, 'B2 行の編集/削除/復元ボタンは全廃');
assert(h.indexOf('master-row-check')>=0&&h.indexOf('data-mid="m-ka"')>=0, 'B3 行選択 checkbox（data-mid 付き）');
const iAn=h.indexOf('安藤架空'),iKa=h.indexOf('架空太郎'),iNo=h.indexOf('読無架空');
assert(iAn>=0&&iAn<iKa&&iKa<iNo, 'B4 既定はふりがな順（あんどう→かくう→ふりがな無しは末尾）');
assert(h.indexOf('あんどうかくう')>=0&&h.indexOf('あんどうかくう')<h.indexOf('安藤架空</span>'), 'B5 ふりがなは氏名の上（ルビ位置・checkbox aria-label は除外して比較）');
assert(h.indexOf('（ふりがな未入力）')>=0, 'B6 ふりがな未入力はその場で分かる表示');
assert(h.indexOf('master-cell-member')>=0&&h.indexOf('master-cell-grade')>=0&&h.indexOf('master-cell-name')>=0, 'B7 編集可能セルに class（bind 対象）');
assert(h.indexOf('master-sel-bar')<0, 'B8 未選択時はツールバー非表示');
const eb2=loadEnv();
eb2._select('m-ka');
const h2=eb2.buildMasterTabHtml(JSON.parse(fixJson()));
assert(h2.indexOf('master-sel-bar')>=0&&h2.indexOf('1名 選択中')>=0&&h2.indexOf('削除（1名）')>=0&&h2.indexOf('masterSelClearBtn')>=0, 'B9 選択時にツールバー（削除/選択解除）');
const eb3=loadEnv();
eb3._setSort('recent');
const h3=eb3.buildMasterTabHtml(JSON.parse(fixJson()));
assert(h3.indexOf('架空太郎')<h3.indexOf('安藤架空')&&h3.indexOf('安藤架空')<h3.indexOf('読無架空'), 'B10 最終参加順に切替可（新しい順）');
const eb4=loadEnv();
eb4._setShowDeleted(true);
eb4._select('m-dl');
const h4=eb4.buildMasterTabHtml(JSON.parse(fixJson()));
// MASTER-SHEET-002: 日付は短縮表示（今年=M/D・他年=YYYY/M/D）＝年に依存しない regex pin。
assert(h4.indexOf('master-row-deleted')>=0&&/削除:(2026\/)?6\/15/.test(h4), 'B11 削除済み行＝取り消し線系＋削除日（短縮表示）');
assert(h4.indexOf('復元（1名）')>=0, 'B12 削除済み行を選択すると復元ボタン');
assert(!/master-cell-name[^>]*data-mid="m-dl"/.test(h4), 'B13 削除済み行のセルは編集不可（class 非付与）');

// C: coordinator（storage 反映）
function envWithFix(){
  const e=loadEnv();
  e._ctx.localStorage.setItem(e.BRANCH_MASTER_KEY,fixJson());
  return e;
}
const c1=envWithFix();
c1.masterSheetCycleMember('m-ka');
assert(JSON.parse(c1._ctx.localStorage._[c1.BRANCH_MASTER_KEY]).members.filter(m=>m.id==='m-ka')[0].member==='other', 'C1 支部員セル＝タップで 支部員→他 が保存される');
c1.masterSheetCycleMember('m-ka');
assert(JSON.parse(c1._ctx.localStorage._[c1.BRANCH_MASTER_KEY]).members.filter(m=>m.id==='m-ka')[0].member==='member', 'C2 もう一度で 他→支部員（往復）');
const c2=envWithFix();
c2.masterSheetCycleGrade('m-ka');
assert(JSON.parse(c2._ctx.localStorage._[c2.BRANCH_MASTER_KEY]).members.filter(m=>m.id==='m-ka')[0].grade==='chu', 'C3 会費セル＝一般→中学');
c2.masterSheetCycleGrade('m-ka');c2.masterSheetCycleGrade('m-ka');
assert(JSON.parse(c2._ctx.localStorage._[c2.BRANCH_MASTER_KEY]).members.filter(m=>m.id==='m-ka')[0].grade==='ippan', 'C4 中学→女性→一般と循環');
const c3=envWithFix();
c3._select('m-ka');c3._select('m-an');
c3.masterSheetDeleteSelected();
const afterDel=JSON.parse(c3._ctx.localStorage._[c3.BRANCH_MASTER_KEY]).members;
assert(afterDel.filter(m=>m.id==='m-ka')[0].deleted===true&&afterDel.filter(m=>m.id==='m-an')[0].deleted===true, 'C5 選択削除＝confirm 経由で soft delete が保存される');
assert(c3._confirms.length===1&&c3._confirms[0].indexOf('2名')>=0, 'C6 削除 confirm は1回（まとめて・人数入り）');
assert(String(c3._ctx._elements['app-toast'].textContent).indexOf('2名を削除しました')>=0, 'C7 削除結果を toast 通知');
assert(Object.keys(c3._selected()).length===0, 'C8 削除後は選択解除');
const c4=envWithFix();
c4._select('m-dl');
c4.masterSheetRestoreSelected();
assert(JSON.parse(c4._ctx.localStorage._[c4.BRANCH_MASTER_KEY]).members.filter(m=>m.id==='m-dl')[0].deleted!==true, 'C9 選択復元が保存される');
const c5=envWithFix();
c5._setEditingMid('m-ka');
c5._ctx.document.getElementById('ms-edit-name').value='架空改名';
c5._ctx.document.getElementById('ms-edit-yomi').value='かくうかいめい';
c5.masterSheetCommitNameEdit();
const afterEdit=JSON.parse(c5._ctx.localStorage._[c5.BRANCH_MASTER_KEY]).members.filter(m=>m.id==='m-ka')[0];
assert(afterEdit.name==='架空改名'&&afterEdit.yomi==='かくうかいめい', 'C10 インライン編集 commit＝氏名・ふりがなが保存される');
assert(String(c5._ctx._elements['app-toast'].textContent).indexOf('更新しました')>=0, 'C11 更新を toast 通知');
const c6=envWithFix();
c6._setEditingMid('m-ka');
c6._ctx.document.getElementById('ms-edit-name').value='';
c6._ctx.document.getElementById('ms-edit-yomi').value='';
c6.masterSheetCommitNameEdit();
assert(c6._alerts.some(a=>a.indexOf('氏名を入力してください')>=0), 'C12 空氏名は alert で拒否（保存されない）');
assert(JSON.parse(c6._ctx.localStorage._[c6.BRANCH_MASTER_KEY]).members.filter(m=>m.id==='m-ka')[0].name==='架空太郎', 'C13 拒否時は元の氏名のまま');

// C14: L3 P2-1＝commit 失敗（空氏名）で編集継続中は、別セルの編集開始を拒否（二重エディタ・誤保存防止）
const c7=envWithFix();
c7._setEditingMid('m-ka');
c7._ctx.document.getElementById('ms-edit-name').value='';
const startSrc=RAW.slice(RAW.indexOf('function masterSheetStartNameEdit'),RAW.indexOf('function masterSheetStartNameEdit')+900);
assert(/masterSheetCommitNameEdit\(\);[\s\S]{0,300}if\(_masterEditingMid\)return;/.test(startSrc), 'C14 commit 失敗で編集継続中なら新規編集を開始しない（L3 P2-1 ガード）');

// W: bind（build/bind 分離）
const bmeStart=RAW.indexOf('function bindMasterTabEvents');
const bmeBody=RAW.slice(bmeStart,bmeStart+9000);
assert(bmeBody.indexOf("getElementById('master-sort')")>=0, 'W1 ソート切替を bind');
assert(bmeBody.indexOf("querySelectorAll('.master-row-check')")>=0, 'W2 行 checkbox を bind');
assert(bmeBody.indexOf('masterSheetDeleteSelected')>=0&&bmeBody.indexOf('masterSheetRestoreSelected')>=0&&bmeBody.indexOf('masterSheetClearSelection')>=0, 'W3 ツールバー3操作を bind');
assert(bmeBody.indexOf("querySelectorAll('.master-cell-name')")>=0&&bmeBody.indexOf("querySelectorAll('.master-cell-member')")>=0&&bmeBody.indexOf("querySelectorAll('.master-cell-grade')")>=0, 'W4 編集セル3種を bind');

// F: MASTER-SHEET-003（更新行の追跡＝ふりがな順ソートで行が飛んでも見失わない）
assert(h.indexOf('master-sheet-row" data-mid="')>=0||/master-sheet-row[^"]*" data-mid="/.test(h), 'F1 行 tr に data-mid（追跡フック）');
const flashSrc=RAW.slice(RAW.indexOf('function masterSheetFlashRow'),RAW.indexOf('function masterSheetFlashRow')+800);
assert(flashSrc.indexOf('scrollIntoView')>=0&&flashSrc.indexOf('backgroundColor')>=0&&flashSrc.indexOf('setTimeout')>=0, 'F2 更新行へスクロール＋一時ハイライト（自動解除）');
const commitSrc0=RAW.slice(RAW.indexOf('function masterSheetCommitNameEdit'),RAW.indexOf('function masterSheetCommitNameEdit')+2000);
assert(/renderMasterTab\(\);[\s\S]{0,200}masterSheetFlashRow\(mid\)/.test(commitSrc0), 'F3 commit 成功→再描画直後に追跡を呼ぶ');

// I: MASTER-SHEET-004（IME 変換ガード＝変換確定の Enter で更新しない）
const startSrc4=RAW.slice(RAW.indexOf('function masterSheetStartNameEdit'),RAW.indexOf('function masterSheetCommitNameEdit'));
assert(startSrc4.indexOf("addEventListener('compositionstart'")>=0&&startSrc4.indexOf("addEventListener('compositionend'")>=0, 'I1 両入力に composition イベントを結線');
assert(/if\(composing\|\|\(e&&e\.isComposing\)\|\|\(e&&e\.keyCode===229\)\)return;/.test(startSrc4), 'I2 変換中は Enter/Esc を無視（isComposing・keyCode 229 の後方互換込み）');
assert(/if\(composing\)return;[\s\S]{0,80}_masterEditingMid!==mid/.test(startSrc4), 'I3 変換中は focusout の自動確定も抑止');

// P: MASTER-CLOUD-PUSH-001（氏名・ふりがな編集のクラウド即時反映・fail-soft）
const commitSrc=RAW.slice(RAW.indexOf('function masterSheetCommitNameEdit'),RAW.indexOf('function masterSheetCommitNameEdit')+1800);
assert(commitSrc.indexOf('pushMemberEditToCloud')>=0, 'P1 commit 成功パスからクラウド push を呼ぶ');
const pushSrc=RAW.slice(RAW.indexOf('function pushMemberEditToCloud'),RAW.indexOf('function pushMemberEditToCloud')+3000);
assert(pushSrc.indexOf("onConflict:'club_id,member_id'")>=0, 'P2 upsert は club_id,member_id で冪等（既存 sync と同一）');
assert(!/branch\s*:/.test(pushSrc), 'P3 branch 列を送らない（クラウド側の値を保全）');
assert(pushSrc.indexOf('未反映')>=0, 'P4 未反映は status で明示（黙って巻き戻りリスクを残さない）');

const pOk=(function(){
  const e=envWithFix();
  let upserted=null;
  e._ctx.window.SHOGI_CLOUD_CONFIG={url:'https://kakuu.example',publishableKey:'pk_kakuu'};
  e._ctx.window.supabase={createClient:function(){return {
    auth:{getSession:function(){return Promise.resolve({data:{session:{user:{}}}});}},
    rpc:function(){return Promise.resolve({data:[{club_id:'club-kakuu',status:'active'}]});},
    from:function(){return {upsert:function(rows){upserted=rows;return {select:function(){return Promise.resolve({data:rows,error:null});}};}};}
  };}};
  const msgs=[];
  return e.pushMemberEditToCloud({id:'m-ka',name:'架空改名',yomi:'かくうかいめい'},function(m){msgs.push(String(m));}).then(function(res){
    assert(res&&res.ok===true, 'P5 ログイン中は push 成功');
    assert(upserted&&upserted[0].member_id==='m-ka'&&upserted[0].name==='架空改名'&&upserted[0].yomi==='かくうかいめい'&&upserted[0].club_id==='club-kakuu', 'P6 upsert 行＝member_id/name/yomi/club_id');
    assert(!('branch' in (upserted[0]||{})), 'P7 行に branch を含まない');
    assert(msgs.some(m=>m.indexOf('反映しました')>=0), 'P8 成功 status を通知');
  });
})();
const pAuth=(function(){
  const e=envWithFix();
  let upsertCalled=false;
  e._ctx.window.SHOGI_CLOUD_CONFIG={url:'https://kakuu.example',publishableKey:'pk_kakuu'};
  e._ctx.window.supabase={createClient:function(){return {
    auth:{getSession:function(){return Promise.resolve({data:{session:null}});}},
    rpc:function(){return Promise.resolve({data:[]});},
    from:function(){upsertCalled=true;return {upsert:function(){return {select:function(){return Promise.resolve({data:[],error:null});}};}};}
  };}};
  const msgs=[];
  return e.pushMemberEditToCloud({id:'m-ka',name:'x',yomi:''},function(m){msgs.push(String(m));}).then(function(res){
    assert(res&&res.ok===false&&res.step==='auth', 'P9 未ログインは fail-soft skip（例外なし）');
    assert(upsertCalled===false, 'P10 未ログインでは upsert を呼ばない');
    assert(msgs.some(m=>m.indexOf('未反映')>=0&&m.indexOf('保存済み')>=0), 'P11 「未反映・端末には保存済み」を明示');
  });
})();

// Q: MASTER-CLOUD-DELETE-001（選択削除/復元のクラウド反映）
const delSrc=RAW.slice(RAW.indexOf('function masterSheetDeleteSelected'),RAW.indexOf('function _masterCloudStatusFn'));
assert(delSrc.indexOf('pushMemberDeleteStateToCloud(doneMids,master,true')>=0&&delSrc.indexOf('pushMemberDeleteStateToCloud(doneMids,master,false')>=0, 'Q1 削除/復元とも成功分をクラウドへ push');
assert(delSrc.indexOf('クラウドの名簿からも削除され、全端末に反映')>=0&&delSrc.indexOf('クラウドの名簿でも復元され')>=0, 'Q2 confirm にクラウド波及を明示（N1）');
const pdSrc=RAW.slice(RAW.indexOf('function pushMemberDeleteStateToCloud'),RAW.indexOf('function pushMemberDeleteStateToCloud')+3600);
assert(pdSrc.indexOf("onConflict:'club_id,member_id'")>=0&&pdSrc.indexOf('deleted_at:deleted?nowIso:null')>=0, 'Q3 deleted_at＝削除は現在時刻・復元は null（冪等 upsert）');
assert(!/branch\s*:/.test(pdSrc), 'Q4 branch 列を送らない（クラウド値保全）');

function mockCloudEnv(e,capture){
  capture.calls=capture.calls||[];
  e._ctx.window.SHOGI_CLOUD_CONFIG={url:'https://kakuu.example',publishableKey:'pk_kakuu'};
  e._ctx.window.supabase={createClient:function(){return {
    auth:{getSession:function(){return Promise.resolve({data:{session:{user:{}}}});}},
    rpc:function(){return Promise.resolve({data:[{club_id:'club-kakuu',status:'active'}]});},
    from:function(){return {upsert:function(rows){capture.rows=rows;capture.calls.push(rows);return {select:function(){return Promise.resolve({data:rows,error:null});}};}};}
  };}};
}
const qDel=(function(){
  const e=envWithFix();
  const cap={rows:null};
  mockCloudEnv(e,cap);
  e._select('m-ka');e._select('m-an');
  return Promise.resolve(e.masterSheetDeleteSelected()).then(function(){
    assert(cap.rows&&cap.rows.length===2, 'Q5 削除2名分をまとめて upsert');
    assert(cap.rows.every(r=>typeof r.deleted_at==='string'&&r.deleted_at.length>0&&typeof r.name==='string'&&r.name.length>0), 'Q6 各行に deleted_at（時刻）と name（未存在会員の INSERT 対策）');
  });
})();
const qRes=(function(){
  const e=envWithFix();
  const cap={rows:null};
  mockCloudEnv(e,cap);
  e._setShowDeleted(true);
  e._select('m-dl');
  return Promise.resolve(e.masterSheetRestoreSelected()).then(function(){
    assert(cap.rows&&cap.rows.length===1&&cap.rows[0].member_id==='m-dl'&&cap.rows[0].deleted_at===null, 'Q7 復元は deleted_at=null を upsert');
  });
})();
const qAuth=(function(){
  const e=envWithFix();
  e._ctx.window.SHOGI_CLOUD_CONFIG={url:'https://kakuu.example',publishableKey:'pk_kakuu'};
  e._ctx.window.supabase={createClient:function(){return {
    auth:{getSession:function(){return Promise.resolve({data:{session:null}});}},
    rpc:function(){return Promise.resolve({data:[]});},
    from:function(){return {upsert:function(){return {select:function(){return Promise.resolve({data:[],error:null});}};}};}
  };}};
  const msgs=[];
  return e.pushMemberDeleteStateToCloud(['m-ka'],JSON.parse(fixJson())?{members:JSON.parse(fixJson()).members}:null,true,function(m){msgs.push(String(m));}).then(function(res){
    assert(res&&res.ok===false&&res.step==='auth', 'Q8 未ログインは fail-soft skip');
    assert(msgs.some(m=>m.indexOf('未反映')>=0&&m.indexOf('この端末のみ削除')>=0), 'Q9 「未反映・この端末のみ削除」を明示');
  });
})();

// S: CLOUD-MEMBER-FIELDS-001＋MASTER-BULK-PUSH-001＋MASTER-MIGRATE-RETIRE-001
const sEnv=loadEnv();
const fc=sEnv._cloudMemberFieldCols({member:'other',grade:'josei',city:'沼津市'});
assert(fc.member_kind==='other'&&fc.grade==='josei'&&fc.city==='沼津市', 'S1 区分・市町村の整形（other/josei/city）');
const fcDef=sEnv._cloudMemberFieldCols({});
assert(fcDef.member_kind==='member'&&fcDef.grade==='ippan'&&fcDef.city===null, 'S2 既定は member/ippan/city=null');
const mm={schema_version:1,members:[{id:'m-x',name:'架空太郎',yomi:'かくう',member:'member',grade:'ippan',city:'',tournament_ids:[]}]};
const mres=sEnv.mergeCloudMembersIntoMaster(mm,[{member_id:'m-x',name:'架空太郎',yomi:'かくう',member_kind:'other',grade:'josei',city:'三島市'}],{});
assert(mm.members[0].member==='other'&&mm.members[0].grade==='josei'&&mm.members[0].city==='三島市'&&mres.updated===1, 'S3 ☁取得で区分・市町村が下りる（非空値のみ）');
const mm2={schema_version:1,members:[{id:'m-x',name:'架空太郎',yomi:'かくう',member:'other',grade:'josei',city:'三島市',tournament_ids:[]}]};
const mres2=sEnv.mergeCloudMembersIntoMaster(mm2,[{member_id:'m-x',name:'架空太郎',yomi:'かくう',member_kind:null,grade:null,city:null}],{});
assert(mm2.members[0].member==='other'&&mm2.members[0].grade==='josei'&&mm2.members[0].city==='三島市'&&mres2.updated===0, 'S4 NULL（未設定の旧行）はローカルを壊さない');
assert(RAW.indexOf('id="masterMigrateBtn"')<0&&RAW.indexOf('function openMigrationWizard')>=0, 'S5 統合＝UI撤去・関数は温存（回帰資産）');
assert(RAW.indexOf('id="masterBulkPushBtn"')>=0, 'S6 一括送信ボタンが details 内に存在');
const bmeS=RAW.slice(RAW.indexOf('function bindMasterTabEvents'),RAW.indexOf('function bindMasterTabEvents')+12000);
assert(bmeS.indexOf('masterBulkPushBtn')>=0&&bmeS.indexOf('上書きされます')>=0, 'S7 一括送信は confirm（クラウド上書きの明示）付きで bind');
assert(RAW.indexOf('「📋 名簿を更新」を押してください')>=0, 'S8 大会形式ファイルの誘導は「復元→名簿を更新」へ更新');

const sBulk=(function(){
  const e=envWithFix();
  const cap={};
  mockCloudEnv(e,cap);
  const msgs=[];
  return e.pushAllMembersToCloud(function(m){msgs.push(String(m));}).then(function(res){
    assert(res&&res.ok===true&&res.alive===3&&res.dead===1, 'S9 一括送信＝生存3名＋削除済み1名');
    assert(cap.calls.length===2, 'S10 生存/削除済みの2回に分けて upsert');
    const aliveRows=cap.calls[0];
    assert(aliveRows.length===3&&aliveRows.every(r=>!('deleted_at' in r)), 'S11 生存行は deleted_at を送らない（クラウド tombstone 保全）');
    assert(aliveRows.every(r=>r.member_kind&&r.grade&&('city' in r)&&r.club_id==='club-kakuu'), 'S12 生存行に区分・市町村・club_id');
    const deadRows=cap.calls[1];
    assert(deadRows.length===1&&deadRows[0].member_id==='m-dl'&&deadRows[0].deleted_at==='2026-06-15', 'S13 削除済み行はローカル削除日を deleted_at に');
    assert(msgs.some(m=>m.indexOf('一括送信しました（4名・うち削除済み 1名）')>=0), 'S14 結果 status（人数内訳）');
  });
})();
const sEdit=(function(){
  const e=envWithFix();
  const cap={};
  mockCloudEnv(e,cap);
  return e.pushMemberEditToCloud({id:'m-ka',name:'架空太郎',yomi:'かくう',member:'other',grade:'chu',city:'沼津市'},function(){}).then(function(){
    assert(cap.rows&&cap.rows[0].member_kind==='other'&&cap.rows[0].grade==='chu'&&cap.rows[0].city==='沼津市', 'S15 編集 push にも区分・市町村が同乗');
  });
})();

function summary(){
  console.log('\n  MASTER-SHEET テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  if(fail>0){ process.exit(1); }
}
Promise.all([pOk,pAuth,qDel,qRes,qAuth,sBulk,sEdit]).then(summary).catch(function(e){ console.error('  ✗ 非同期テスト例外: '+((e&&e.message)||e)); fail++; summary(); });
