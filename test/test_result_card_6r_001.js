#!/usr/bin/env node
// RESULT-CARD-6R-001 (#769): 最終結果スマホカードの回戦セルはみ出し修正＋回戦数 6/7 解禁（50名1クラス対応）。
//   設計: Issue #769 設計完了 v1/v2（独立L3設計レビュー conditional-go 条件反映: minmax 56px・golden 再採取工程化）。
//   観点:
//     CARD.   回戦セル行= auto-fit grid（minmax(56px,1fr)）・両セルに min-width:0;overflow:hidden・旧 flex 行の撤去。
//     ROUNDS. 全体セレクタ renderRoundsControl が 3/4/5/6/7 を生成・既定 value=4 不変・開始後 disabled 不変・
//             選択肢外の現在値（旧データ）を必ず含める保険の不変。クラス別 renderClassManager の nums も 3〜7。
//   golden: buildResultsClassHtml__A_sp は本スライスで意図的更新（UPDATE_GOLDEN=1 再採取・diff は当該1ケースのみを確認済み）。
//   データは完全架空のみ。
var fs = require('fs');
var target = process.argv[2] || 'shogi_v4.html';
var RAW = fs.readFileSync(target, 'utf8');
var pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// ---- CARD. 行コンテナ grid 化＋セルの縮小許可 ----
ok(RAW.indexOf('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(56px,1fr));gap:4px">') >= 0,
  'CARD-1 回戦セル行は auto-fit grid（minmax(56px,1fr)・入る分は等分1行/入らない分は折り返し）');
ok(RAW.indexOf('<div style="display:flex;gap:4px">') < 0,
  'CARD-2 旧 flex 行（wrap なし・はみ出し源）は撤去');
ok(RAW.indexOf('text-align:center;flex:1;min-width:0;overflow:hidden;color:#ccc') >= 0,
  'CARD-3 未対局セルに min-width:0;overflow:hidden（ruby min-content の押し広げ防止）');
ok(RAW.indexOf('text-align:center;flex:1;min-width:0;overflow:hidden">') >= 0,
  'CARD-4 対局済セルに min-width:0 追加（overflow:hidden は既存維持）');

// ---- ROUNDS. セレクタ挙動（renderRoundsControl 抽出実行） ----
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {renderRoundsControl:renderRoundsControl,_get:function(){return state;},_set:function(v){state=v;}};');
  const env=fn(doc,win,ls,{randomUUID:()=>'0'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true,clipboard:null});
  return {env,els};
}
{
  const E=makeEnv();
  E.env.renderRoundsControl();
  const sel=E.els['inp-rounds'];
  ok(['3','4','5','6','7'].every(v=>sel.innerHTML.indexOf('value="'+v+'"')>=0), 'ROUNDS-1 選択肢に 3/4/5/6/7 を生成（6/7 解禁）');
  ok(sel.innerHTML.indexOf('value="8"')<0, 'ROUNDS-2 8 以上は出さない');
  ok(sel.innerHTML.indexOf('6回戦')>=0 && sel.innerHTML.indexOf('7回戦')>=0, 'ROUNDS-3 表示は「6回戦」「7回戦」');
  ok(sel.value==='4', 'ROUNDS-4 既定 value=4 不変');
  ok(sel.disabled===false, 'ROUNDS-5 未開始は変更可（不変）');
}
{
  // 開始後ロック不変
  const E=makeEnv();
  const st=E.env._get(); st.started=true;
  E.env.renderRoundsControl();
  ok(E.els['inp-rounds'].disabled===true, 'ROUNDS-6 開始後は disabled（不変）');
}
{
  // 選択肢外の現在値（旧データ互換）を必ず含める保険の不変
  const E=makeEnv();
  const st=E.env._get(); st.rounds=9;
  E.env.renderRoundsControl();
  const sel=E.els['inp-rounds'];
  ok(sel.innerHTML.indexOf('value="9"')>=0 && sel.value==='9', 'ROUNDS-7 選択肢外の現在値(9)も option に含め value 同期（保険不変）');
}

// ---- ROUNDS. クラス別（renderClassManager）はソースピン ----
ok(RAW.indexOf('var nums=[3,4,5,6,7];') >= 0, 'ROUNDS-8 クラス別セレクタも 3〜7（renderClassManager）');
ok(RAW.indexOf('var opts=[3,4,5,6,7];') >= 0, 'ROUNDS-9 全体セレクタのソースも 3〜7（renderRoundsControl）');
ok((RAW.match(/=\[3,4,5\];/g)||[]).length === 0, 'ROUNDS-10 [3,4,5] 固定の残存なし');

console.log('RESULT-CARD-6R-001: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
