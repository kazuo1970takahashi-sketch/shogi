#!/usr/bin/env node
// 当日UX 即効1: ①タブ切替で先頭スクロール ②保存成功トースト(showToast) ④storage.persist 起動時
//   ⑦タブ名「会員名簿」 ⑧使い捨て「22名取込」ボタン撤去。挙動追加/文言/UI のみ・ロジック本体不変。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function extractScripts(p){const html=fs.readFileSync(p,'utf8');const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
function loadEnv(){
  const js=extractScripts(target);const noop=function(){};
  var toastEl={id:'app-toast',className:'',textContent:''};
  var doc={getElementById:function(i){return i==='app-toast'?toastEl:null;},createElement:function(){return{};},addEventListener:noop,body:{},head:{appendChild:noop}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    `${js};return {showToast:typeof showToast!=='undefined'?showToast:null};`);
  var env=fn(doc,{addEventListener:noop,scrollTo:noop},{getItem:()=>null,setItem:noop,removeItem:noop},{randomUUID:()=>'0'},noop,()=>true,()=>'',{log:noop,warn:noop,error:noop},Promise,function(cb){return 0;},{onLine:true});
  return {env:env,toastEl:toastEl};
}
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== ① タブ切替で先頭スクロール ===');
ok(/function showTab\(t\)\{[\s\S]*?window\.scrollTo\(0,0\)/.test(RAW),'①showTab 内に window.scrollTo(0,0)');

console.log('=== ② 保存成功トースト ===');
ok(RAW.indexOf('id="app-toast"')>=0,'②a トースト要素 #app-toast');
ok(/\.app-toast\{/.test(RAW)&&/\.app-toast\.show\{/.test(RAW),'②b トースト CSS');
// REG-ALERT-TOAST-001 (#740) ⑤d: showToast は opts 第2引数（kind='err'）対応＝省略時は従来挙動（②e/②f で実挙動を検証済）。
ok(/function showToast\(text(,opts)?\)\{/.test(RAW),'②c showToast 関数');
ok(/showToast\('[\\\\u0-9a-fA-F]*\s*結果を保存しました'\)/.test(RAW)||RAW.indexOf('結果を保存しました')>=0,'②d submitRound 成功でトースト');
var L=loadEnv();
ok(typeof L.env.showToast==='function','②e showToast 取得');
L.env.showToast('テスト');
ok(L.toastEl.textContent==='テスト'&&/show/.test(L.toastEl.className),'②f showToast で textContent＋show 反映');

console.log('=== ④ storage.persist 起動時 ===');
ok(/navigator\.storage&&navigator\.storage\.persist\)navigator\.storage\.persist\(\)/.test(RAW),'④ 起動時に navigator.storage.persist 要求');
ok(/typeof navigator!=='undefined'&&navigator\.storage/.test(RAW),'④ typeof navigator ガード（ハーネス移植性）');

console.log('=== ⑦ タブ名 会員名簿 ===');
// TAB-LABEL-WRAP-001: ラベルは折れ位置を決めるため span で2つに割った（文字そのものは不変）。
//   生文字列の完全一致だと「割り方」の変更で偽の赤になるので、tab-master のボタンから
//   タグを剥がした可視文字列で照合する。
const tabMasterLabel = (function(){
  const m = /id="tab-master"[^>]*>([\s\S]*?)<\/button>/.exec(RAW);
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : null;
})();
ok(tabMasterLabel === '会員名簿','⑦ タブ名「会員名簿」（実測: '+tabMasterLabel+'）');
ok(tabMasterLabel !== 'マスタ','⑦ 旧「マスタ」タブ名は撤去');

console.log('=== ⑧ 22名取込ボタン撤去 ===');
ok(RAW.indexOf('masterPhase2ImportBtn')<0,'⑧ masterPhase2ImportBtn の参照なし（ボタン＋bind 撤去）');
ok(/id="masterPhase2ImportBtn"/.test(RAW)===false,'⑧ 22名取込ボタンは撤去（未使用モーダル関数の残置は無害）');

console.log('DAYOF-QUICKWINS: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
