#!/usr/bin/env node
// START-FRP-UX-002: 未開始で「全員で1局目を開始」が出せない（奇数 or 1名）とき、理由＋対処の案内を出す。
//   一括開始ボタンが黙って消えないようにする。既存の開始/部分開始/リセットの id・文言・条件は不変。
// 読込は共通ヘルパへ集約 [PHASE1-LOADER-001]（同じ全束を1コンテキストで評価する・意味論不変）
const {loadApp,readHtml}=require('./lib/app_harness');
const RAW=readHtml();
function makeEnv(){return loadApp().ctx;}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function players(n){var a=[];for(var i=0;i<n;i++)a.push({id:'p'+i,name:'選手'+i});return a;}

var E=makeEnv();
function setA(n,started){var s=E.state;s.players=s.players||{};s.players.A=players(n);for(var i=0;i<s.classes.length;i++)if(s.classes[i].id==='A')s.classes[i].started=!!started;E.state=s;}

console.log('=== 偶数（4名・未開始）: 全員開始ボタン・案内なし ===');
setA(4,false);
var h4=E.buildClassActionBarHtml('A');
ok(h4.indexOf('id="startBtnClass_A"')>=0,'E1 偶数は「全員で1局目を開始」ボタンあり');
ok(h4.indexOf('class-start-note')<0,'E2 偶数は奇数案内を出さない');
// START-FRP-UX-003: 縦積みの開始ボタンは全幅で揃える（全員/部分開始）。partial の btn-sm は撤去。
ok(h4.indexOf('id="startBtnClass_A" style="width:100%"')>=0,'E3 全員開始ボタンは全幅(width:100%)');
ok(h4.indexOf('id="startBtnPartial_A" style="width:100%"')>=0,'E4 部分開始ボタンも全幅(width:100%)');
ok(h4.indexOf('btn-sm" id="startBtnPartial_A"')<0,'E5 部分開始ボタンから btn-sm を撤去（全員開始と同格化）');

console.log('=== 奇数（7名・未開始）: 全員開始ボタン無し＋理由案内 ===');
setA(7,false);
var h7=E.buildClassActionBarHtml('A');
ok(h7.indexOf('id="startBtnClass_A"')<0,'O1 奇数は「全員で1局目を開始」ボタンを出さない（既存条件）');
ok(h7.indexOf('class-start-note')>=0 && h7.indexOf('奇数（7名）')>=0,'O2 奇数は理由（奇数7名）を明示');
ok(h7.indexOf('部分開始')>=0,'O3 対処として部分開始へ誘導（部分開始ボタンは併置）');
ok(h7.indexOf('id="startBtnPartial_A"')>=0,'O4 部分開始ボタンは従来通り出る');

console.log('=== 1名（未開始）: もう1名案内 ===');
setA(1,false);
var h1=E.buildClassActionBarHtml('A');
ok(h1.indexOf('id="startBtnClass_A"')<0,'S1 1名は一括開始ボタン無し');
ok(h1.indexOf('class-start-note')>=0 && h1.indexOf('まだ1名')>=0,'S2 1名は「もう1名で開始できる」案内');

console.log('=== 開始済み: 案内を出さない（状態ラベル＋リセット） ===');
setA(7,true);
var hs=E.buildClassActionBarHtml('A');
ok(hs.indexOf('class-start-note')<0,'D1 開始済みは開始案内を出さない');
ok(hs.indexOf('開始済み')>=0,'D2 開始済みは状態ラベル');

console.log('START-ODD-NOTE: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
