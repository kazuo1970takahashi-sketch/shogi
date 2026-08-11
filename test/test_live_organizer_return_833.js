#!/usr/bin/env node
// @suite: LIVE-ORGANIZER-RETURN-001（#833）復帰導線の述語と記録点の構造ピン
// LIVE-ORGANIZER-RETURN-001（Issue #833）
//   閲覧専用ビュー → 運営画面の復帰導線。read-only 原則を壊さないための「構造」を固定する。
//
//   ★ 本ファイルは DOM を持たない層だけを測る:
//       - 述語 sbCanReturnToOrganizer が既定（実績なし）で false であること
//       - 記録点 sbMarkOrganizerContext が運営画面の分岐にしか無いこと（ソース構造ピン）
//     実際に「どの画面にボタンが出て、参加者には出ないか」は実ブラウザで測る:
//       test/e2e/live_organizer_return_833.e2e.js
//     （sessionStorage / window.opener / 可視性は DOM モックでは正しく再現できないため）
//
//   入力は完全架空。shogi_v4.html は読むだけ。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_live_organizer_return_833.js <html>'); process.exit(1); }
const ABS = path.resolve(targetPath);
const RAW = fs.readFileSync(ABS, 'utf8');

let pass=0, fail=0;
function assert(cond, msg){ if(cond){ pass++; console.log('  ✓ '+msg); } else { fail++; console.log('  ✗ '+msg); } }

console.log('\n[S] ソース構造ピン');
(function(){
  assert(/function sbCanReturnToOrganizer\(\)/.test(RAW), 'S-1 述語 sbCanReturnToOrganizer が存在する');
  assert(/if\(window\.opener&&window\.opener!==window\)return false;/.test(RAW),
    'S-2 述語に opener 条項がある（sessionStorage は window.open の子タブへコピーされるため必須）');
  assert(/sessionStorage\.getItem\(SB_ORG_CTX_KEY\)==='1'/.test(RAW),
    'S-3 述語はタブ単位の実績（sessionStorage）を見る＝localStorage を見ない（resetAll の影響を受けない）');
  assert(RAW.indexOf("localStorage.getItem(SB_ORG_CTX_KEY)") < 0,
    'S-4 実績を localStorage で持っていない');

  const marks = RAW.match(/sbMarkOrganizerContext\(\)/g) || [];
  assert(marks.length === 2, 'S-5 sbMarkOrganizerContext は「定義1＋呼出1」の計2箇所だけ（実測 '+marks.length+'）');

  // 記録点が applyScoreboardRoute の else 分岐（＝運営画面を出す側）にあること
  const ar = RAW.slice(RAW.indexOf('function applyScoreboardRoute(){'));
  const body = ar.slice(0, ar.indexOf('\n}\n'));
  const elseIdx = body.indexOf('}else{');
  const markIdx = body.indexOf('sbMarkOrganizerContext();');
  assert(elseIdx >= 0 && markIdx > elseIdx,
    'S-6 記録点は applyScoreboardRoute の else 分岐（運営画面側）にある＝閲覧ルートでは絶対に立たない');
  assert(body.slice(0, elseIdx).indexOf('sbMarkOrganizerContext') < 0,
    'S-7 閲覧ルート側（if 分岐）に記録点が無い');

  const appends = RAW.match(/sbAppendOrganizerReturn\(view\)/g) || [];
  assert(appends.length === 4, 'S-8 sbAppendOrganizerReturn は「定義1＋呼出3」の計4箇所（終了画面・待機画面・通常描画）（実測 '+appends.length+'）');

  const btnIds = RAW.match(/sb-org-return-btn/g) || [];
  assert(btnIds.length === 2, 'S-9 ボタン id の出現は「既存を消す querySelector」と「生成時の id 代入」の2箇所だけ＝到達点は1箇所（実測 '+btnIds.length+'）');
  assert(/btn\.textContent='▶ 運営画面へ戻る'/.test(RAW), 'S-10 ラベルは textContent で入れる（innerHTML を使わない）');
  assert(/location\.href=location\.pathname/.test(RAW), 'S-11 遷移は location.pathname のみ（search / hash を落とす）');
})();

console.log('\n[F] 述語の既定値（実績なし＝参加者と同じ条件）');
(function(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
      style:{cssText:''}, _attrs:{}, childNodes:[], disabled:false, type:'',
      appendChild:function(c){ this.childNodes.push(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  const scripts=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(RAW))!==null)scripts.push(m[1]);
  var elements={};
  const doc={ getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:makeNode, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  const win={ innerWidth:1024, addEventListener:function(){}, open:function(){ return null; } };
  const ls={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  const fn = new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${scripts.join('\n')};
     return { sbCanReturnToOrganizer:sbCanReturnToOrganizer, sbAppendOrganizerReturn:sbAppendOrganizerReturn };`);
  const env = fn(doc, win, ls, {randomUUID(){return '0';}}, function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL(){return 'b';},revokeObjectURL(){}}, console, Promise, function(){return 0;});

  assert(env.sbCanReturnToOrganizer()===false,
    'F-1 sessionStorage が無い/実績が無い文脈では false（＝既存の node テストは追随不要のまま緑）');
  const view = makeNode('div');
  env.sbAppendOrganizerReturn(view);
  assert(view.childNodes.length===0, 'F-2 述語が false ならボタンを一切生成しない');
  assert(function(){ try{ env.sbAppendOrganizerReturn(null); env.sbAppendOrganizerReturn(undefined); return true; }catch(e){ return false; } }(),
    'F-3 view が null / undefined でも例外を投げない（fail-soft）');
})();

console.log('\n  LIVE-ORGANIZER-RETURN-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
