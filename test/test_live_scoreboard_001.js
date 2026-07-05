#!/usr/bin/env node
// LIVE-MOBILE-SCOREBOARD-001: スマホ閲覧専用 順位/星取表ビュー
//
// 本テストは「既存の運営画面を壊さず、閲覧専用ビューが仕様どおり起動・表示される」ことを保証する。
// 対象は既マージ済み機能（PR #200）に対する MVP 仕上げ分（?view=scoreboard 経路 + 最終更新時刻）。
//
// 観点:
//   A. 構造検査（HTML ソース）
//     A1. #scoreboard-view コンテナが存在し、既定で display:none（通常画面を壊さない）
//     A2. フルスクリーン固定（position:fixed; top/left/right/bottom:0）でオーバーレイ表示
//     A3. isScoreboardRoute が ?view= クエリ（location.search / view= トークン）を解釈する
//     A4. isScoreboardRoute が #hash（location.hash）も引き続き解釈する（後方互換）
//     A5. renderScoreboard が「最終更新」ラベルと sbFormatUpdateTime() を使う
//     A6. sbFormatUpdateTime / sbTouchUpdate / _sbLastUpdate が定義されている
//     A7. モバイル可読性: 横スクロール（.sb-scroll overflow-x）+ 氏名列 sticky 固定
//     A8. read-only: 閲覧ビュー描画関数が保存/読込/リセット/入力UIを生成しない
//
//   B. sbFormatUpdateTime 単体（純粋関数）
//   C. isScoreboardRoute 挙動（?view= / #hash / 否定ケース）
//   D. applyScoreboardRoute 挙動（ビュー切替 + 運営UI(.header/.container)を隠す）
//   E. renderScoreboard スモーク（実 state で必須表示項目が出る / 編集系UIが出ない）
//   F. 空 state（対局未開始）の案内表示
//
// 既存テスト同様、<script> を extractScripts + new Function サンドボックスで eval して実行する。

const fs = require('fs');

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_live_scoreboard_001.js <html>');
  process.exit(1);
}
const htmlSrc = fs.readFileSync(targetPath, 'utf8');

let pass=0, fail=0;
function ok(msg){pass++; /* 成功は静かに */ }
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg); else ng(msg);}
function assertEq(a,b,msg){
  if(JSON.stringify(a)===JSON.stringify(b))ok(msg);
  else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));
}

// ============================================================
// SECTION A: 構造検査（HTML ソース regex）
// ============================================================

// A1: コンテナ存在 + 既定 display:none（通常画面が従来どおり出るための前提）
assert(/<div[^>]*id="scoreboard-view"/.test(htmlSrc),
  'A1-1 #scoreboard-view コンテナが存在する');
assert(/#scoreboard-view\{[^}]*display:none/.test(htmlSrc),
  'A1-2 #scoreboard-view は既定 display:none');

// A2: フルスクリーン固定オーバーレイ
{
  const m = htmlSrc.match(/#scoreboard-view\{([^}]*)\}/);
  const css = m ? m[1] : '';
  assert(/position:fixed/.test(css), 'A2-1 position:fixed');
  assert(/top:0/.test(css)&&/left:0/.test(css)&&/right:0/.test(css)&&/bottom:0/.test(css),
    'A2-2 top/left/right/bottom:0 で全画面');
}

// A3 / A4: isScoreboardRoute が query と hash の両方を解釈する
{
  const m = htmlSrc.match(/function isScoreboardRoute\(\)\{[\s\S]*?\n\}/);
  const body = m ? m[0] : '';
  assert(/location\.search/.test(body), 'A3-1 isScoreboardRoute が location.search を参照（?view= 経路）');
  assert(/view=/.test(body), 'A3-2 isScoreboardRoute が view= トークンを解釈');
  assert(/location\.hash/.test(body), 'A4-1 isScoreboardRoute が location.hash を参照（#hash 後方互換）');
  assert(/scoreboard/.test(body), 'A4-2 scoreboard トークンを受理');
}

// A5: renderScoreboard が最終更新を描画する
{
  const m = htmlSrc.match(/function renderScoreboard\(\)\{[\s\S]*?\n\}/);
  const body = m ? m[0] : '';
  assert(/最終更新/.test(body), 'A5-1 renderScoreboard が「最終更新」ラベルを描画');
  assert(/sbFormatUpdateTime\s*\(/.test(body), 'A5-2 renderScoreboard が sbFormatUpdateTime() を使う');
}

// A6: ヘルパ定義
assert(/function sbFormatUpdateTime\s*\(/.test(htmlSrc), 'A6-1 sbFormatUpdateTime() 定義あり');
assert(/function sbTouchUpdate\s*\(/.test(htmlSrc), 'A6-2 sbTouchUpdate() 定義あり');
assert(/var _sbLastUpdate\s*=/.test(htmlSrc), 'A6-3 _sbLastUpdate 状態変数あり');

// A7: モバイル可読性（横スクロール + 氏名列 sticky）
assert(/\.sb-scroll\{[^}]*overflow-x:auto/.test(htmlSrc), 'A7-1 .sb-scroll に overflow-x:auto（横スクロール）');
assert(/\.sb-col-name\{[^}]*position:sticky/.test(htmlSrc), 'A7-2 氏名列 sticky 固定');

// A8: read-only — 閲覧ビュー描画関数が編集系UIを生成しない（静的検査）
{
  const r = htmlSrc.match(/function renderScoreboard\(\)\{[\s\S]*?\n\}/);
  const c = htmlSrc.match(/function buildScoreboardClassTableHtml\([\s\S]*?\n\}/);
  const viewCode = (r?r[0]:'') + (c?c[0]:'');
  assert(!/<input/.test(viewCode), 'A8-1 閲覧ビュー描画に <input> を含まない');
  assert(!/saveBtn|resetBtn|loadBtn|resetProgressBtn/.test(viewCode), 'A8-2 保存/読込/リセット系ボタンIDを含まない');
  // 注: 「運営画面へ」戻り導線の不在は、説明コメントとの誤検知を避けるため
  //     描画結果（innerHTML）に対して SECTION E (E13) で検証する。
}

// ============================================================
// サンドボックス
// ============================================================

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeLocalStorage(){
  return {
    _:{},
    getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;},
    setItem(k,v){this._[k]=String(v);},
    removeItem(k){delete this._[k];}
  };
}

function makeClassList(){
  const set={};
  return {
    add(c){set[c]=1;}, remove(c){delete set[c];},
    toggle(c){ if(set[c])delete set[c]; else set[c]=1; },
    contains(c){return !!set[c];}
  };
}

function makeElem(id){
  const handlers={}; const attrs={};
  const el={
    id:id||'', _innerHTML:'',
    style:{display:'', cssText:''},
    className:'', hidden:false, value:'', checked:false, type:'', textContent:'',
    classList:makeClassList(),
    get innerHTML(){return this._innerHTML;},
    set innerHTML(v){this._innerHTML=String(v==null?'':v);},
    appendChild(c){return c;}, removeChild(){}, remove(){},
    addEventListener(e,fn){(handlers[e]||(handlers[e]=[])).push(fn);},
    removeEventListener(){}, dispatchEvent(){},
    setAttribute(k,v){attrs[k]=String(v);},
    getAttribute(k){return Object.prototype.hasOwnProperty.call(attrs,k)?attrs[k]:null;},
    querySelector(){return null;}, querySelectorAll(){return [];},
    focus(){}, blur(){}, click(){}
  };
  return el;
}

function makeContext(){
  const byId={}; const bySel={};
  const body=makeElem('body');
  const doc={
    _byId:byId, _bySel:bySel,
    getElementById(id){return byId[id]||(byId[id]=makeElem(id));},
    // .header / .container などセレクタは安定したモック要素を返す（style.display を検証するため）。
    querySelector(sel){return bySel[sel]||(bySel[sel]=makeElem(sel));},
    querySelectorAll(){return [];},
    createElement(){return makeElem();},
    body:body,
    addEventListener(){}, removeEventListener(){}
  };
  const location={hash:'', search:'', pathname:'/shogi_v4.html', href:''};
  const win={
    innerWidth:390, // スマホ幅相当
    addEventListener(){}, removeEventListener(){},
    open(){return {focus(){}, close(){}};},
    location:location
  };
  return {
    document:doc, window:win, location:location,
    localStorage:makeLocalStorage(),
    crypto:{randomUUID(){return '00000000-0000-0000-0000-000000000000';}}
  };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const Blob = function(arr,opts){this.__src=(arr&&arr[0])||'';this.type=(opts&&opts.type)||'';};
  const URLMock = {createObjectURL(){return 'blob:mock';}, revokeObjectURL(){}};
  const fn = new Function(
    'document','window','location','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       _setState:function(s){state=s;},
       _getState:function(){return state;},
       isScoreboardRoute:isScoreboardRoute,
       applyScoreboardRoute:applyScoreboardRoute,
       renderScoreboard:renderScoreboard,
       sbFormatUpdateTime:sbFormatUpdateTime,
       sbTouchUpdate:sbTouchUpdate,
       normalizeState:(typeof normalizeState==='function'?normalizeState:null)
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.location, ctx.localStorage, ctx.crypto,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, Blob, URLMock,
    {log(){}, warn(){}, error(){}}, Promise
  );
  api._ctx = ctx;
  return api;
}

// 実 state（架空データのみ）。A 級 2 名・1 回戦・p1 勝ち。
function makeState(){
  return {
    classes:[{id:'A',name:'架空A級',started:true}],
    players:{A:[
      {id:'p1',name:'架空 太郎',cls:'A',member:'member',grade:'ippan',entry_no:1},
      {id:'p2',name:'架空 次郎',cls:'A',member:'member',grade:'ippan',entry_no:2}
    ]},
    pairings:{A:[]},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]]},
    rounds:1,
    started:true,
    report:{title:'架空将棋大会',date:'',place:'',start:'',end:'',sei:'',fuku:'',note:'',organizer:'架空連盟'}
  };
}

// ============================================================
// SECTION B: sbFormatUpdateTime 単体
// ============================================================
{
  const env = loadEnv(targetPath);
  // 2026/06/14 09:05:03 — 月/日/時/分/秒すべて 1 桁でゼロ詰めを確認
  assertEq(env.sbFormatUpdateTime(new Date(2026,5,14,9,5,3)), '2026/06/14 09:05:03', 'B1 ゼロ詰め整形');
  assertEq(env.sbFormatUpdateTime(new Date(2026,11,31,23,59,59)), '2026/12/31 23:59:59', 'B2 2桁値');
  assertEq(env.sbFormatUpdateTime(null), '', 'B3 null → 空文字');
  assertEq(env.sbFormatUpdateTime('2026-06-14'), '', 'B4 非Date → 空文字');
  assertEq(env.sbFormatUpdateTime(new Date('invalid')), '', 'B5 不正Date → 空文字');
}

// ============================================================
// SECTION C: isScoreboardRoute 挙動
// ============================================================
{
  const env = loadEnv(targetPath);
  const loc = env._ctx.location;
  loc.hash=''; loc.search='?view=scoreboard';
  assertEq(env.isScoreboardRoute(), true, 'C1 ?view=scoreboard → true（仕様の主経路）');
  loc.search='?view=viewer';
  assertEq(env.isScoreboardRoute(), true, 'C2 ?view=viewer → true');
  loc.search='?foo=1&view=mobile-standings';
  assertEq(env.isScoreboardRoute(), true, 'C3 ?...&view=mobile-standings → true');
  loc.search='?view=SCOREBOARD';
  assertEq(env.isScoreboardRoute(), true, 'C4 大文字 ?view=SCOREBOARD → true（大小無視）');
  loc.search='?view=admin';
  assertEq(env.isScoreboardRoute(), false, 'C5 ?view=admin → false');
  loc.search='';
  assertEq(env.isScoreboardRoute(), false, 'C6 クエリ/ハッシュ無し → false（通常画面）');
  loc.search=''; loc.hash='#scoreboard';
  assertEq(env.isScoreboardRoute(), true, 'C7 #scoreboard → true（後方互換）');
  loc.hash='#viewer';
  assertEq(env.isScoreboardRoute(), true, 'C8 #viewer → true');
  loc.hash='#report';
  assertEq(env.isScoreboardRoute(), false, 'C9 無関係 #report → false');
}

// ============================================================
// SECTION D: applyScoreboardRoute 挙動（ビュー切替 + 運営UI退避）
// ============================================================
{
  const env = loadEnv(targetPath);
  const ctx = env._ctx;
  ctx.location.hash=''; ctx.location.search='?view=scoreboard';
  env.applyScoreboardRoute();
  const view = ctx.document.getElementById('scoreboard-view');
  const header = ctx.document.querySelector('.header');
  const container = ctx.document.querySelector('.container');
  assertEq(view.style.display, 'block', 'D1 閲覧ビュー表示（display:block）');
  assertEq(view.getAttribute('aria-hidden'), 'false', 'D2 aria-hidden=false');
  assertEq(ctx.document.body.classList.contains('sb-active'), true, 'D3 body.sb-active 付与');
  assertEq(header.style.display, 'none', 'D4 運営ヘッダを隠す（編集系ボタンが見えない）');
  assertEq(container.style.display, 'none', 'D5 運営コンテナを隠す');
  assert(/最終更新/.test(view.innerHTML), 'D6 描画結果に最終更新時刻が含まれる');

  // 通常画面へ戻す（hash/search なし）
  ctx.location.search=''; ctx.location.hash='';
  env.applyScoreboardRoute();
  assertEq(view.style.display, 'none', 'D7 通常時は閲覧ビュー非表示');
  assertEq(view.getAttribute('aria-hidden'), 'true', 'D8 aria-hidden=true');
  assertEq(ctx.document.body.classList.contains('sb-active'), false, 'D9 body.sb-active 解除');
  assertEq(header.style.display, '', 'D10 運営ヘッダ復帰');
  assertEq(container.style.display, '', 'D11 運営コンテナ復帰');
}

// ============================================================
// SECTION E: renderScoreboard スモーク（実 state）
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeState());
  env.sbTouchUpdate();
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  // 必須表示項目（仕様 6）
  assert(/架空将棋大会/.test(html), 'E1 大会名が出る');
  assert(/星取表/.test(html), 'E2 表タイトル（星取表）が出る');
  assert(/架空A級/.test(html), 'E3 クラス名が出る');
  assert(/架空 太郎/.test(html)&&/架空 次郎/.test(html), 'E4 氏名が出る');
  assert(/順位/.test(html), 'E5 順位ヘッダが出る');
  assert(/最終更新/.test(html), 'E6 最終更新時刻が出る');
  assert(/<th>勝<\/th>/.test(html)&&/<th>負<\/th>/.test(html), 'E7 勝数・負数の列が出る');
  assert(/<th>B<\/th>/.test(html)&&/<th>C<\/th>/.test(html), 'E8 順位判定値（B/C）の列が出る');
  // read-only（仕様 5）: 編集系UIが描画されない
  // SCOREBOARD-MY-VIEW-001: 対局者検索の <input>（sb-search・表示フィルタのみ・state 非書込）だけを
  //   例外として許可する。編集系 input の禁止（read-only 徹底）は従来どおり検査する。
  assert(!/<input(?![^>]*sb-search)/.test(html), 'E9 入力欄が出ない（対局者検索 sb-search を除く）');
  assert(!/リセット/.test(html), 'E10 リセット系の文言が出ない');
  assert(!/大会データをコピー|読み込み/.test(html), 'E11 保存/読込ボタンが出ない');
  assert(!/saveBtn|resetBtn|loadBtn/.test(html), 'E12 運営ボタンIDが出ない');
  assert(!/運営画面へ/.test(html), 'E13 「運営画面へ」戻り導線が描画されない（read-only 徹底）');
}

// ============================================================
// SECTION F: 空 state（対局未開始）の案内
// ============================================================
{
  const env = loadEnv(targetPath);
  const st = makeState();
  st.players.A=[];           // 参加者なし
  st.results.A=[];
  env._setState(st);
  env.renderScoreboard();
  const html = env._ctx.document.getElementById('scoreboard-view').innerHTML;
  assert(/まだ星取表に表示できる対局がありません|参加者を登録/.test(html), 'F1 空時は案内メッセージを表示');
  assert(/最終更新/.test(html), 'F2 空時でもヘッダ（最終更新）は出る');
}

// ============================================================
// 結果出力
// ============================================================
console.log('LIVE-MOBILE-SCOREBOARD-001: pass='+pass+' fail='+fail);
process.exit(fail===0?0:1);
