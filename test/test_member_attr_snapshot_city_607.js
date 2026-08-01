#!/usr/bin/env node
// MEMBER-ATTR-SNAPSHOT-001 (#607) Phase 1-0: 登録時に city を当日 player へ写す（member/grade と対称）。
//   対象: addPlayerFromMaster（単発・master member 由来）／finalizeAddPastParticipants（一括）／addPlayer（手動・一致サジェスト由来）。
//   検証: (a)静的=3経路に city 写しがある (b)実行=addPlayerFromMaster が master.city を player.city へ写し既存 member/grade を壊さない・fail-soft。
// 読込は共通ヘルパへ集約 [PHASE1-LOADER-001]（同じ全束を1コンテキストで評価する・意味論不変）
var {loadApp,readHtml}=require('./lib/app_harness');
var RAW=readHtml();
var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}

// ---- 静的アサート: city スナップショットが3登録経路に存在 ----
ok(RAW.indexOf('city:normalizeCity(member.city)')>=0,'S1 addPlayerFromMaster(単発) が master member の city を写す');
ok(RAW.indexOf('city:normalizeCity(m.city)')>=0,'S2 finalizeAddPastParticipants(一括) が city を写す');
ok(RAW.indexOf('newPlayer.city=normalizeCity(suggestSelected&&suggestSelected.city)')>=0,'S3 手動 addPlayer が一致サジェストから city を写す');
ok(/function normalizeCity\(/.test(RAW),'S4 normalizeCity 基盤が存在');

// ---- 実行: addPlayerFromMaster ----
function loadEnv(){return loadApp().ctx;}
var E=loadEnv();

function freshState(){return {players:{A:[],B:[]}};}

// city を master から写す＋既存 member/grade 不変
var m1={members:[{id:'m1',name:'山田太郎',yomi:'やまだたろう',member:'other',grade:'chu',city:'沼津市'}]};
var s1=freshState();
var r1=E.addPlayerFromMaster('m1','A',m1,s1);
ok(r1&&r1.success,'E1 addPlayerFromMaster 成功');
eq(r1.player.city,'沼津市','E2 city が master から写る');
eq(r1.player.member,'other','E3 member 保持（既存不変）');
eq(r1.player.grade,'chu','E4 grade 保持（既存不変）');
eq(s1.players.A.length,1,'E5 player が追加される');

// normalizeCity 適用（trim + maxlen20）
var long='　　'+Array(31).join('x')+'  ';
var m2={members:[{id:'m2',name:'A',city:long}]};
var r2=E.addPlayerFromMaster('m2','A',m2,freshState());
eq(r2.player.city.length,20,'E6 city は normalizeCity で20文字上限');

// city 欠損は '' （fail-soft）
var m3={members:[{id:'m3',name:'B'}]};
var r3=E.addPlayerFromMaster('m3','A',m3,freshState());
eq(r3.player.city,'','E7 master に city 無し→空（fail-soft・例外なし）');

console.log('MEMBER-ATTR-SNAPSHOT-CITY-607: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
