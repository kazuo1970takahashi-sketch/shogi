#!/usr/bin/env node
// MEMBER-ATTR-SNAPSHOT-001 (#607) Phase 2-2: 当日 結果一覧/報告書への会員属性表示（§6/§8）。
//   当日 player レコード＝登録時点値＝当時値（＝現在値・注記なし）。
//   結果一覧タブ: buildPlayerAttrDisplayHtml(f.p) を Mobile/Desktop ビルダーへ結線（クラウドと同一の
//     buildEntryAttrDisplayHtml パーツを再利用）。3属性フル（支部員区分／会費区分／市町村）。
//   報告書: 入賞者の支部員区分/会費区分を氏名下補助行(buildReportWinnerKindGradeHtml)＋市町村を
//     既存「お住まい（市町村のみ）」列へ。getTopPlayers が member/grade/city を搬送。
//   静的: 結線アンカー。実行: 純関数 GOLDEN（会費語彙・空 city 非表示・city エスケープ・注記なし）。
var fs=require('fs');
var RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){var s=[];var re=/<script[^>]*>([\s\S]*?)<\/script>/g;var m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}

// ---- 静的アサート（結線） ----
ok(/function buildPlayerAttrDisplayHtml\(/.test(RAW),'S1 buildPlayerAttrDisplayHtml 定義');
ok(/function buildReportWinnerKindGradeHtml\(/.test(RAW),'S2 buildReportWinnerKindGradeHtml 定義');
ok(RAW.indexOf('html+=buildPlayerAttrDisplayHtml(f.p);')>=0,'S3 結果一覧(SP カード)へ結線');
ok(RAW.indexOf("withdrawMarkHtml(f.p.id,cls)+buildPlayerAttrDisplayHtml(f.p)+'</td>'")>=0,'S4 結果一覧(PC 表)氏名セルへ結線');
ok(RAW.indexOf('var attrHtml=buildReportWinnerKindGradeHtml(p);')>=0,'S5 報告書 rankRow が member/grade 補助行を使う');
ok(RAW.indexOf('var cityStr=p?buildEntryAttrSnapshot(p).city:'+"''"+';')>=0,'S6 報告書 rankRow が city を専用列へ');
ok(/result\.push\(\{rank:i\+1,name:finals\[i\]\.p\.name,yomi:[\s\S]{0,80}member:finals\[i\]\.p\.member,grade:finals\[i\]\.p\.grade,city:finals\[i\]\.p\.city\}\)/.test(RAW),'S7 getTopPlayers が member/grade/city を搬送');
ok(RAW.indexOf('buildEntryAttrDisplayHtml(buildEntryAttrSnapshot(player), null)')>=0,'S8 当日表示はクラウドと同一 HTML ヘルパ再利用');

// ---- 実行: 純関数 GOLDEN ----
function loadEnv(){
  var js=extractScripts(RAW);
  var fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    js+';return { buildPlayerAttrDisplayHtml:buildPlayerAttrDisplayHtml, buildReportWinnerKindGradeHtml:buildReportWinnerKindGradeHtml };');
  var noop=function(){};
  return fn({getElementById:function(){return null;},createElement:function(){return {style:{},appendChild:noop};},head:{},body:{},addEventListener:noop},
            {innerWidth:1024,addEventListener:noop},{getItem:function(){return null;},setItem:noop,removeItem:noop},
            {randomUUID:function(){return '0';}},noop,function(){return true;},function(){return '';},noop,noop,
            {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:noop},{log:noop,warn:noop,error:noop},Promise,function(){return 0;},{});
}
var E=loadEnv();

// buildPlayerAttrDisplayHtml: 当日は当時値＝現在値・注記なし・3属性フル
var h1=E.buildPlayerAttrDisplayHtml({member:'member',grade:'ippan',city:'沼津市'});
ok(h1.indexOf('沼津支部員 / 一般 / 沼津市')>=0,'E1 [GOLDEN] 当日3属性フル');
ok(h1.indexOf('現在値')<0,'E2 当日は「※現在値」注記が出ない');

var h2=E.buildPlayerAttrDisplayHtml({member:'other',grade:'chu',city:''});
ok(h2.indexOf('他 / 中学生以下')>=0 && h2.indexOf('中学生以下 /')<0,'E3 [GOLDEN] 空 city 非表示');

eq(E.buildPlayerAttrDisplayHtml(null),'','E4 player なし→空文字');

var h3=E.buildPlayerAttrDisplayHtml({member:'member',grade:'josei',city:'<x>'});
ok(h3.indexOf('&lt;x&gt;')>=0 && h3.indexOf('<x>')<0,'E5 city はエスケープ');
ok(h3.indexOf('沼津支部員 / 女性 / &lt;x&gt;')>=0,'E6 会費語彙=女性・パーツ順保持');

// buildReportWinnerKindGradeHtml: member/grade のみ（city は専用列）・空 player→空
var r1=E.buildReportWinnerKindGradeHtml({member:'other',grade:'josei',city:'三島市'});
ok(r1.indexOf('他 / 女性')>=0,'E7 [GOLDEN] 報告書 補助行は member/grade');
ok(r1.indexOf('三島市')<0,'E8 報告書 補助行に city を含めない（専用列へ）');
eq(E.buildReportWinnerKindGradeHtml(null),'','E9 入賞者なし→空文字');

// 既定フォールバック: member/grade 欠落 player はスナップショット既定（member/一般）
var r2=E.buildReportWinnerKindGradeHtml({name:'x'});
ok(r2.indexOf('沼津支部員 / 一般')>=0,'E10 属性欠落 player は既定 member/ippan');

console.log('MEMBER-ATTR-DISPLAY-DAYOF-607: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
