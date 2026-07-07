#!/usr/bin/env node
// MEMBER-ATTR-SNAPSHOT-001 (#607) Phase 2: 会員属性の表示結線（クラウド過去大会ビュー）。
//   memberKindLabelJa/gradeLabelJa/buildEntryAttrDisplay=表示ラベル純関数（会費語彙=一般/中学生以下/女性・
//   支部員区分=沼津支部員/他・空 city 非表示・当時値 null は現在値フォールバック＋「※現在値」注記）。
//   静的: buildEntryAttrDisplayHtml がクラウド結果カード/表の両ビルダーへ結線されている。実行: 純関数 GOLDEN。
var fs=require('fs');
var RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){var s=[];var re=/<script[^>]*>([\s\S]*?)<\/script>/g;var m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}

// ---- 静的アサート ----
ok(/function memberKindLabelJa\(/.test(RAW),'S1 memberKindLabelJa 定義');
ok(/function gradeLabelJa\(/.test(RAW),'S2 gradeLabelJa 定義');
ok(/function buildEntryAttrDisplay\(/.test(RAW),'S3 buildEntryAttrDisplay 定義');
ok(/function buildEntryAttrDisplayHtml\(/.test(RAW),'S4 buildEntryAttrDisplayHtml 定義');
ok(RAW.indexOf('html+=buildEntryAttrDisplayHtml(e, m);')>=0,'S5 クラウド結果カード(SP)へ結線');
ok(RAW.indexOf("playerNameRubyHtml(nm,ym)+buildEntryAttrDisplayHtml(e,m)+'</td>'")>=0,'S6 クラウド結果表(PC)氏名セルへ結線');
ok(/buildEntryAttrDisplayHtml[\s\S]{0,400}escapeHtml\(d\.parts\[i\]\)/.test(RAW),'S7 表示 HTML は escapeHtml 経由');

// ---- 実行: 純関数 GOLDEN ----
function loadEnv(){
  var js=extractScripts(RAW);
  var fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    js+';return { memberKindLabelJa:memberKindLabelJa, gradeLabelJa:gradeLabelJa, buildEntryAttrDisplay:buildEntryAttrDisplay, buildEntryAttrDisplayHtml:buildEntryAttrDisplayHtml };');
  var noop=function(){};
  return fn({getElementById:function(){return null;},createElement:function(){return {style:{},appendChild:noop};},head:{},body:{},addEventListener:noop},
            {innerWidth:1024,addEventListener:noop},{getItem:function(){return null;},setItem:noop,removeItem:noop},
            {randomUUID:function(){return '0';}},noop,function(){return true;},function(){return '';},noop,noop,
            {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:noop},{log:noop,warn:noop,error:noop},Promise,function(){return 0;},{});
}
var E=loadEnv();

eq(E.memberKindLabelJa('member'),'沼津支部員','E1 member→沼津支部員');
eq(E.memberKindLabelJa('other'),'他','E2 other→他');
eq(E.memberKindLabelJa(''),'','E3 未知→空');
eq(E.gradeLabelJa('ippan'),'一般','E4 ippan→一般');
eq(E.gradeLabelJa('chu'),'中学生以下','E5 chu→中学生以下');
eq(E.gradeLabelJa('josei'),'女性','E6 josei→女性');
eq(E.gradeLabelJa('dan'),'','E7 未知→空');

var cur={member_kind:'other',grade:'josei',city:'三島市'};
var d1=E.buildEntryAttrDisplay({member_kind:'member',grade:'ippan',city:'沼津市'}, cur);
eq(d1.text,'沼津支部員 / 一般 / 沼津市','E8 [GOLDEN] 当時値3属性');
eq(d1.fromCurrent,false,'E9 当時値あり→注記なし');

var d2=E.buildEntryAttrDisplay({member_kind:'other',grade:'chu',city:''}, cur);
eq(d2.text,'他 / 中学生以下','E10 [GOLDEN] 空 city 非表示');
eq(d2.parts.length,2,'E11 city 抜き2パーツ');

var d3=E.buildEntryAttrDisplay({member_kind:null,grade:null,city:null}, cur);
eq(d3.text,'他 / 女性 / 三島市（※現在値）','E12 [GOLDEN] 旧行→現在値＋注記');
eq(d3.fromCurrent,true,'E13 フォールバック→fromCurrent');

var h1=E.buildEntryAttrDisplayHtml({member_kind:'member',grade:'ippan',city:'<x>'}, null);
ok(h1.indexOf('&lt;x&gt;')>=0 && h1.indexOf('<x>')<0,'E14 city はエスケープ');
ok(h1.indexOf('沼津支部員 / 一般 / &lt;x&gt;')>=0,'E15 パーツ順保持＋エスケープ');
var h2=E.buildEntryAttrDisplayHtml({member_kind:'',grade:'',city:''}, {});
eq(h2,'','E16 表示対象なし→空文字');

console.log('MEMBER-ATTR-DISPLAY-607: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
