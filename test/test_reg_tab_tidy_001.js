#!/usr/bin/env node
// REG-TAB-TIDY-001 (#743) ⑤b: 登録タブのボタン整理（案B・モック承認済 2026-07-10）。
//   検証:
//     A: 参加者カード＝操作は「⋯ 編集」1ボタンに集約（未開始時）。シート（openPlayerEditSheet）は
//        名前編集/ふりがな編集/削除/キャンセルを常設・クラス変更は member_id 連携者のみ・
//        呼び先は既存関数（editPlayer/editPlayerYomi/removePlayer/toggleWithdrawn/handlePastParticipantClassAdd）。
//     B: 0名クラスの「名前を一括編集」非表示（regClassBulkEditId 経由・静的）。
//     C: 手入力欄は details#reg-manual-details へ格納・#reg-msg は details 外・名簿0名で自動 open。
//   fixture は完全架空のみ。
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_reg_tab_tidy_001.js <html>');process.exit(1);}
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
      disabled:false, type:'', open:false,
      style:{cssText:'',display:''}, _attrs:{}, childNodes:[], _listeners:{}, _parent:null,
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
       makePlayerRow:makePlayerRow,
       openPlayerEditSheet:openPlayerEditSheet,
       renderPastParticipantsPanel:renderPastParticipantsPanel,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       _get:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, {randomUUID:()=>'00000000-0000-0000-0000-000000000000'},
    function(m){alerts.push(String(m));}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb){return 1;}, {onLine:true}
  );
  api._ctx = ctx;
  api._alerts = alerts;
  return api;
}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}
function collectText(node,out){ out.push(String(node.textContent||'')); for(var i=0;i<(node.childNodes||[]).length;i++)collectText(node.childNodes[i],out); return out; }
function findButtons(node,acc){ if(node.tagName==='button')acc.push(node); for(var i=0;i<(node.childNodes||[]).length;i++)findButtons(node.childNodes[i],acc); return acc; }

console.log('\n【REG-TAB-TIDY-001 (#743) ⑤b】');

// ---- A: カード集約 ----
const ea=loadEnv();
var stA=ea._get();
var pMember={id:'p1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'かくうたろう',member_id:'m-a1'};
var pManual={id:'p2',name:'試験花子',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''};
stA.players.A.push(pMember,pManual);
var row=ea.makePlayerRow(pMember,'A',0);
var btns=findButtons(row,[]);
assert(btns.length===1&&btns[0].textContent==='⋯ 編集', 'A1 未開始カードの操作ボタンは「⋯ 編集」1個のみ');
ea.openPlayerEditSheet('p1','A');
var sheet=ea._ctx._elements['player-edit-sheet'];
assert(!!sheet, 'A2 「⋯ 編集」相当の openPlayerEditSheet でシートが開く');
var sh=String(sheet?sheet.innerHTML:'');
assert(sh.indexOf('✏️ 名前を編集')>=0&&sh.indexOf('ふりがなを編集')>=0&&sh.indexOf('受付を取り消す（一覧から削除）')>=0&&sh.indexOf('キャンセル')>=0, 'A3 シートに 名前/ふりがな/削除/キャンセル');
assert(sh.indexOf('架空太郎')>=0, 'A4 シート見出しに氏名');
assert(sh.indexOf('へ変更')>=0, 'A5 member_id 連携者にはクラス変更項目が出る');
assert(sh.indexOf('棄権')<0, 'A6 未開始クラスでは棄権項目を出さない（従来ボタンと同条件）');
ea.openPlayerEditSheet('p2','A');
var sh2=String(ea._ctx._elements['player-edit-sheet'].innerHTML);
assert(sh2.indexOf('へ変更')<0, 'A7 手入力（member_id 無し）にはクラス変更項目を出さない');
assert(ea._alerts.length===0, 'A8 シート表示で alert/confirm ブロックなし');
// L2 P3-2: シート innerHTML の XSS 動的検証（escapeHtml がコード上あるだけでなく実際に効くこと）
stA.players.A.push({id:'p9',name:'<script>x</script>',cls:'A',member:'member',grade:'ippan',entry_no:9,yomi:''});
ea.openPlayerEditSheet('p9','A');
var sh9=String(ea._ctx._elements['player-edit-sheet'].innerHTML);
assert(sh9.indexOf('<script>')<0&&sh9.indexOf('&lt;script&gt;')>=0, 'A8b シート見出しの氏名は escape される（XSS 安全・動的検証）');
// 委譲（静的）: 既存関数へそのまま委譲＝挙動不変
assert(RAW.indexOf('editPlayer(playerId,cls)')>=0, 'A9 名前編集→editPlayer（既存関数へ委譲）');
assert(RAW.indexOf('editPlayerYomi(playerId,cls)')>=0, 'A10 ふりがな→editPlayerYomi');
assert(RAW.indexOf('removePlayer(playerId,cls);')>=0, 'A11 削除→removePlayer 2引数（confirm/ガード不変）');
assert(RAW.indexOf('toggleWithdrawn(playerId,cls)')>=0, 'A12 棄権/復帰→toggleWithdrawn');
assert(/isClassStarted\(cls\)\)\{[\s\S]{0,600}pes-withdraw/.test(RAW), 'A13 棄権項目は isClassStarted ゲート内（開始後のみ）');
assert(/pes-change[\s\S]{0,400}handlePastParticipantClassAdd\(mid,c\)/.test(RAW), 'A14 クラス変更→handlePastParticipantClassAdd（confirm/master 更新は既存フロー）');
assert(/p\.member_id&&curSelectable/.test(RAW), 'A15 クラス変更は member_id×selectable の二重ガード（手入力者には出さない・#768 で全クラス化）');

// ---- B: 0名クラスの一括編集非表示（静的） ----
assert(/regClassBulkEditId\(cls\)\);\s*\n\s*if\(bulkBtn\)bulkBtn\.style\.display=players\.length>0\?'':'none';/.test(RAW), 'B1 renderRegList が bulkEdit を人数で表示切替（A/B 静的・C+ 動的とも同経路）');

// ---- C: 手入力 details ----
var detIdx=RAW.indexOf('id="reg-manual-details"');
assert(detIdx>=0, 'C1 details#reg-manual-details が存在');
var detEnd=RAW.indexOf('</details>',detIdx);
var detBody=RAW.slice(detIdx,detEnd);
assert(detBody.indexOf('id="inp-name"')>=0&&detBody.indexOf('id="addBtn"')>=0&&detBody.indexOf('id="inp-yomi"')>=0&&detBody.indexOf('id="suggest-list"')>=0, 'C2 手入力欄一式（inp-name/addBtn/inp-yomi/suggest-list）が details 内・id 不変');
assert(detBody.indexOf('id="reg-msg"')<0&&RAW.indexOf('id="reg-msg"',detEnd)>=0, 'C3 #reg-msg は details の外（閉でも通知が見える・⑤d 基盤）');
assert(detBody.indexOf('＋ 名簿にない新規の方（手入力）')>=0, 'C4 summary 文言');
// 名簿0名 → 自動 open（動的）
const ec=loadEnv();
var det=ec._ctx.document.getElementById('reg-manual-details');
det.open=false;
ec.renderPastParticipantsPanel('');
assert(det.open===true, 'C5 名簿未取込/0名なら手入力 details を自動 open');
// 名簿ありなら強制しない（open のまま/閉のままを尊重: open を触らない）
const ed=loadEnv();
ed._ctx.localStorage.setItem(ed.BRANCH_MASTER_KEY,JSON.stringify({schema_version:1,members:[{id:'m-a1',name:'架空太郎',yomi:'かくうたろう'}]}));
var det2=ed._ctx.document.getElementById('reg-manual-details');
det2.open=false;
ed.renderPastParticipantsPanel('');
assert(det2.open===false, 'C6 名簿ありのときは details を勝手に開かない（既定閉を維持）');

console.log('\n  REG-TAB-TIDY-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
