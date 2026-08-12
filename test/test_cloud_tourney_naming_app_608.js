#!/usr/bin/env node
// CLOUD-TOURNEY-NAMING-001 (#608) app 鏡写し: app/auth.js のクラウド過去大会一覧/詳細の表記統一を検証。
//   当日 shogi_v4.html の buildMonthlyPeriodLabel/canonicalizeCloudTournamentName/buildCloudTournamentDisplayTitle を
//   app/auth.js へ逐語移植し、一覧 buildTournamentListHtml と詳細見出し buildTournamentHeadHtml の両方へ結線したことを確認。
//   観点: 静的(定義/結線/export)＋純関数 GOLDEN(shogi_v4 と同一)＋一覧⇔詳細の単一ソース end-to-end。実データ不使用(架空のみ)。
//   shogi_v4.html は触らない。
var fs=require('fs');
var path=require('path');
var AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');

var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}

// ---- 静的アサート（定義・結線・export） ----
ok(/function buildMonthlyPeriodLabel\(/.test(AUTH_JS),'S1 buildMonthlyPeriodLabel 定義');
ok(/function canonicalizeCloudTournamentName\(/.test(AUTH_JS),'S2 canonicalizeCloudTournamentName 定義');
ok(/function buildCloudTournamentDisplayTitle\(/.test(AUTH_JS),'S3 buildCloudTournamentDisplayTitle 定義');
ok(/tnt-name[\s\S]{0,120}buildCloudTournamentDisplayTitle\(\(t && t\.name\) \|\| '', \(t && t\.date\) \|\| ''\)/.test(AUTH_JS),'S4 一覧 .tnt-name へ結線');
ok(/sb-tnt-head[\s\S]{0,120}buildCloudTournamentDisplayTitle\(t\.name, t\.date\)/.test(AUTH_JS),'S5 詳細見出し sb-tnt-head へ結線');
ok(/buildCloudTournamentDisplayTitle: buildCloudTournamentDisplayTitle,/.test(AUTH_JS),'S6 export に追加');

// ---- 実行: ShogiAuth ロード ----
function loadAuth(){
  var win={location:{origin:'https://app.test',pathname:'/app/'}};
  new Function('window',AUTH_JS)(win);
  return win.ShogiAuth;
}
var A=loadAuth();

// ---- 純関数 GOLDEN（当日 shogi_v4.html と同一・test_cloud_tourney_naming_001.js の鏡）----
console.log('=== M: buildMonthlyPeriodLabel ===');
eq(A.buildMonthlyPeriodLabel('2026-04-15'),'2026年4月度','M1 4月度（先頭ゼロ無し）');
eq(A.buildMonthlyPeriodLabel('2026-12-01'),'2026年12月度','M2 12月度');
eq(A.buildMonthlyPeriodLabel('2026-01-31'),'2026年1月度','M3 1月度');
eq(A.buildMonthlyPeriodLabel(''),'','M4 空→空');
eq(A.buildMonthlyPeriodLabel('bad'),'','M5 パース不可→空');
eq(A.buildMonthlyPeriodLabel('2026-13-01'),'','M6 13月→空（範囲外）');
eq(A.buildMonthlyPeriodLabel('2026-00-01'),'','M7 0月→空（範囲外）');
eq(A.buildMonthlyPeriodLabel(null),'','M8 null→空');
eq(A.buildMonthlyPeriodLabel('2026-4-5'),'','M9 0詰め無し→空');

console.log('=== C: canonicalizeCloudTournamentName ===');
eq(A.canonicalizeCloudTournamentName('月例将棋大会2026-04'),'沼津支部月例将棋大会','C1 埋込日付除去→月例→正規名');
eq(A.canonicalizeCloudTournamentName('沼津支部月例将棋大会'),'沼津支部月例将棋大会','C2 既に正規名→同');
eq(A.canonicalizeCloudTournamentName(''),'沼津支部月例将棋大会','C3 空→既定');
eq(A.canonicalizeCloudTournamentName('月例将棋大会 報告書'),'沼津支部月例将棋大会','C4 報告書除去→月例→正規名');
eq(A.canonicalizeCloudTournamentName('第10回沼津竜王戦'),'第10回沼津竜王戦','C5 非月例固有名→温存');
eq(A.canonicalizeCloudTournamentName('○○杯2026-04'),'○○杯','C6 固有名＋末尾日付→末尾除去して温存');
eq(A.canonicalizeCloudTournamentName('沼津支部月例将棋大会 2026年4月'),'沼津支部月例将棋大会','C7 末尾「YYYY年M月」除去→正規名');
eq(A.canonicalizeCloudTournamentName('月例大会（2026-04）'),'沼津支部月例将棋大会','C8 全角括弧日付除去→月例→正規名');
eq(A.canonicalizeCloudTournamentName('支部対抗戦2025'),'支部対抗戦2025','C9 [P1] 裸4桁は日付でない→温存');
eq(A.canonicalizeCloudTournamentName('○○杯2026'),'○○杯2026','C10 [P1] 裸4桁は日付でない→温存');
eq(A.canonicalizeCloudTournamentName('2026-04'),'沼津支部月例将棋大会','C11 [P2] 日付のみ→空化→月例既定');
eq(A.canonicalizeCloudTournamentName('   '),'沼津支部月例将棋大会','C12 空白のみ→既定');

console.log('=== T: buildCloudTournamentDisplayTitle ===');
eq(A.buildCloudTournamentDisplayTitle('月例将棋大会2026-04','2026-04-15'),'2026年4月度 沼津支部月例将棋大会','T1 合成（GOLDEN）');
eq(A.buildCloudTournamentDisplayTitle('沼津支部月例将棋大会','2026-04-15'),'2026年4月度 沼津支部月例将棋大会','T2 正規名＋period');
eq(A.buildCloudTournamentDisplayTitle('第10回沼津竜王戦','2026-05-10'),'2026年5月度 第10回沼津竜王戦','T3 特別名は温存し前に月度');
eq(A.buildCloudTournamentDisplayTitle('沼津支部月例将棋大会',''),'沼津支部月例将棋大会','T4 日付欠損→base のみ（fail-soft）');
eq(A.buildCloudTournamentDisplayTitle('○○杯2026','2026-07-05'),'2026年7月度 ○○杯2026','T5 裸4桁温存＋月度');
eq(A.buildCloudTournamentDisplayTitle('2026年4月度 特別戦','2026-04-15'),'2026年4月度 特別戦','T6 [P2] 先頭 period 重複を防ぐ');
eq(A.buildCloudTournamentDisplayTitle('','2026-04-15'),'2026年4月度 沼津支部月例将棋大会','T7 空名→月例既定＋月度');

// ---- end-to-end: 一覧と詳細が同一 display title を出す（単一ソース・#657 P1）----
console.log('=== E2E: 一覧⇔詳細の単一ソース ===');
var listHtml=A.buildTournamentListHtml([{id:'t1',name:'月例将棋大会2026-04',date:'2026-04-15',season:'2026年度',status:'confirmed'}]);
ok(listHtml.indexOf('2026年4月度 沼津支部月例将棋大会')>=0,'L1 一覧タイトルが正規化表示');
ok(listHtml.indexOf('data-id="t1"')>=0&&listHtml.indexOf('2026-04-15')>=0,'L2 date/id は温存（情報を減らさない）');
var headHtml=A.buildTournamentHeadHtml({name:'月例将棋大会2026-04',date:'2026-04-15',season:'2026年度',status:'confirmed'});
ok(headHtml.indexOf('2026年4月度 沼津支部月例将棋大会')>=0,'L3 詳細見出しも同一正規化表示（単一ソース）');
// 特別名は温存（一覧・詳細とも）
var listHtml2=A.buildTournamentListHtml([{id:'t2',name:'第10回沼津竜王戦',date:'2026-05-10',season:'2026年度',status:'synced'}]);
ok(listHtml2.indexOf('2026年5月度 第10回沼津竜王戦')>=0,'L4 特別名は温存＋月度（一覧）');
// fail-soft: 名前・日付が空でも例外なく既定表示
var headHtml3=A.buildTournamentHeadHtml({name:'',date:'',season:'',status:''});
ok(headHtml3.indexOf('沼津支部月例将棋大会')>=0,'L5 fail-soft（空→月例既定）');
// XSS: 特別名に含まれる HTML は esc される（app は esc 経由）
var listHtml3=A.buildTournamentListHtml([{id:'t3',name:'<b>杯',date:'2026-06-01',season:'',status:''}]);
ok(listHtml3.indexOf('&lt;b&gt;杯')>=0&&listHtml3.indexOf('<b>杯')<0,'L6 表示名は esc 経由（XSS 安全）');

console.log('\nCLOUD-TOURNEY-NAMING-APP-608: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
