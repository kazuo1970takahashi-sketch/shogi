#!/usr/bin/env node
// REG-ALERT-TOAST-001 (#740) ⑤d: 登録/受付系 blocking alert の非阻害トースト化。
//   検証:
//     S: showToast 拡張＝第2引数省略は従来（class 'app-toast show'・1.8秒）／{kind:'err'} は '.err' 付与＋3秒。
//     T: handlePpDenseTap のエラー経路＝alert 不使用・toast(err)＋#reg-msg(err) の両方に文言・連続受付が止まらない。
//     C: handlePastParticipantClassAdd ケース3（同クラス登録済）＝alert 不使用・toast 通知（文言不変）。
//     P: addSelectedPastParticipants の未選択バリデーション＝alert 不使用・toast 通知。
//     B: 仕分けB（blocking 残置）＝クラス変更失敗 alert・removePlayer ガード alert・notifyError の alert は不変（静的確認）。
//     R: 成功経路の従来トースト（成功色・1.8秒）は不変。
//   fixture は完全架空のみ。
const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_reg_alert_toast_001.js <html>');process.exit(1);}
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
  const timeoutDelays=[];
  const consoleMock = { log:function(){}, error:function(){}, warn:function(){} };
  const js = extractScripts(RAW);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    `${js};
     return {
       handlePpDenseTap:handlePpDenseTap,
       handlePastParticipantClassAdd:handlePastParticipantClassAdd,
       addSelectedPastParticipants:addSelectedPastParticipants,
       showToast:showToast,
       notifyRegTapErr:notifyRegTapErr,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       _get:function(){return state;},
       _setDenseCls:function(v){_ppDenseCls=v;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, {randomUUID:()=>'00000000-0000-0000-0000-000000000000'},
    function(m){alerts.push(String(m));}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:function(){}},
    consoleMock, Promise, function(cb,ms){timeoutDelays.push(ms); return timeoutDelays.length;}, {onLine:true}
  );
  api._ctx = ctx;
  api._alerts = alerts;
  api._timeoutDelays = timeoutDelays;
  return api;
}

const FIX=JSON.stringify({schema_version:1,members:[
  {id:'m-a1',name:'架空太郎',yomi:'かくうたろう',last_class:'A',last_attended:'2026-06-01',attend_count:3},
  {id:'m-a2',name:'安藤架空',yomi:'あんどうかくう',last_class:'B',last_attended:'2026-05-01',attend_count:2},
  {id:'m-d1',name:'削除架空',yomi:'さくじょかくう',last_class:'A',deleted:true}
]});

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}
function toastText(api){ return String(api._ctx._elements['app-toast']?api._ctx._elements['app-toast'].textContent:''); }
function toastClass(api){ return String(api._ctx._elements['app-toast']?api._ctx._elements['app-toast'].className:''); }
function regMsg(api){ return String(api._ctx._elements['reg-msg']?api._ctx._elements['reg-msg'].innerHTML:''); }

console.log('\n【REG-ALERT-TOAST-001 (#740) ⑤d】');

// ---- S: showToast 拡張 ----
assert(RAW.indexOf('.app-toast.err{background:#A32D2D}')>=0, 'S0 CSS .app-toast.err は danger 意味色（新色追加なし）');
const es=loadEnv();
es.showToast('成功テスト');
assert(toastClass(es)==='app-toast show', 'S1 第2引数省略＝従来 class（err なし・後方互換）');
assert(es._timeoutDelays[es._timeoutDelays.length-1]===1800, 'S2 従来トーストは 1.8 秒');
es.showToast('エラーテスト',{kind:'err'});
assert(toastClass(es)==='app-toast show err', 'S3 kind=err で .err 付与');
assert(es._timeoutDelays[es._timeoutDelays.length-1]===3000, 'S4 エラートーストは 3 秒（読ませる）');
assert(es._alerts.length===0, 'S5 showToast は alert を使わない');
es.notifyRegTapErr('二重通知テスト');
assert(toastClass(es)==='app-toast show err'&&toastText(es)==='二重通知テスト', 'S6 notifyRegTapErr は toast(err) に文言');
assert(regMsg(es).indexOf('alert-err')>=0&&regMsg(es).indexOf('二重通知テスト')>=0, 'S7 notifyRegTapErr は #reg-msg にも err で残す');
assert(es._alerts.length===0, 'S8 notifyRegTapErr は alert を使わない');

// ---- T: handlePpDenseTap エラー経路 ----
const et=loadEnv();
et._ctx.localStorage.setItem(et.BRANCH_MASTER_KEY,FIX);
et.handlePpDenseTap('m-zzz');
assert(et._alerts.length===0, 'T1 マスタ不在 id タップで alert なし');
assert(toastClass(et)==='app-toast show err'&&toastText(et)==='該当する参加者が見つかりません', 'T2 不在エラーは toast(err) に文言');
assert(regMsg(et).indexOf('該当する参加者が見つかりません')>=0, 'T3 不在エラーは #reg-msg にも残る');
et.handlePpDenseTap('m-d1');
assert(et._alerts.length===0&&toastText(et)==='この参加者は削除済みのため追加できません', 'T4 削除済みエラーも toast（alert なし）');
// duplicate_name: 手入力同名（member_id なし）が既登録 → m-a1 タップ
et._get().players.A.push({id:'p-manual',name:'架空太郎',cls:'A'});
et.handlePpDenseTap('m-a1');
assert(et._alerts.length===0&&toastText(et).indexOf('同じ名前の参加者がいます')===0, 'T5 同名エラーも toast（alert なし）');
assert((et._get().players.A||[]).length===1, 'T6 エラー経路では受付されない（state 不変）');
// 静的: handlePpDenseTap 本体に alert( が残っていない
const fnSrc=RAW.slice(RAW.indexOf('function handlePpDenseTap('),RAW.indexOf('function openPpDenseActionSheet('));
assert(fnSrc.indexOf('alert(')<0, 'T7 handlePpDenseTap 本体から alert を全廃（静的）');

// ---- C: handlePastParticipantClassAdd ケース3（同クラス登録済） ----
const ec=loadEnv();
ec._ctx.localStorage.setItem(ec.BRANCH_MASTER_KEY,FIX);
ec.handlePpDenseTap('m-a1'); // 正常受付（A）
assert((ec._get().players.A||[]).length===1, 'C0 前提: m-a1 を A へ受付');
ec.handlePastParticipantClassAdd('m-a1','A');
assert(ec._alerts.length===0, 'C1 同クラス登録済で alert なし');
assert(toastClass(ec)==='app-toast show err'&&toastText(ec)==='架空太郎さんは既に Aクラス に登録されています。', 'C2 文言不変で toast 通知');

// ---- P: addSelectedPastParticipants 未選択 ----
const ep=loadEnv();
ep._ctx.localStorage.setItem(ep.BRANCH_MASTER_KEY,FIX);
ep.addSelectedPastParticipants(); // querySelectorAll('.pp-check')=[] → 未選択
assert(ep._alerts.length===0, 'P1 未選択で alert なし');
assert(toastText(ep)==='追加する参加者を選択してください', 'P2 未選択バリデーションは toast 通知');

// ---- B: 仕分けB＝blocking 残置（静的確認） ----
assert(RAW.indexOf("alert('クラス変更に失敗しました')")>=0, 'B1 クラス変更失敗（全画面時）の blocking alert は残置（L3 P2 判断）');
assert(RAW.indexOf('は現在の組み合わせに登録されているため削除できません')>=0&&/alert\(name\+'は現在の組み合わせに登録されているため削除できません/.test(RAW), 'B2 removePlayer ガード（組み合わせ登録済）の alert は残置');
assert(RAW.indexOf('if(alwaysAlert||!regVisible)alert(text);')>=0, 'B3 notifyError ヘルパーは不変（対象外）');

// ---- R: 成功経路の従来トースト不変 ----
const er=loadEnv();
er._ctx.localStorage.setItem(er.BRANCH_MASTER_KEY,FIX);
er.handlePpDenseTap('m-a2');
assert((er._get().players.A||[]).length===1, 'R1 成功経路: 受付される');
assert(toastClass(er)==='app-toast show', 'R2 成功トーストに .err が付かない');
assert(er._timeoutDelays[er._timeoutDelays.length-1]===1800, 'R3 成功トーストは従来どおり 1.8 秒');
assert(er._alerts.length===0, 'R4 成功経路で alert/confirm ブロックなし');

console.log('\n  REG-ALERT-TOAST-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
if(fail>0){ process.exit(1); }
