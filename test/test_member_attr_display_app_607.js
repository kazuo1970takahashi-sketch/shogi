#!/usr/bin/env node
// MEMBER-ATTR-SNAPSHOT-001 (#607) Phase3: app/ 大会結果への会員属性表示（当日 shogi_v4.html と鏡写し）。
//   当日側 memberKindLabelJa/gradeLabelJa/buildEntryAttrDisplay/buildEntryAttrDisplayHtml を app/auth.js へ移植し、
//   fetchEntries(SELECT に member_kind/grade/city＋members 現在値埋め込み)→shapeEntryRow(attrHtml 搬送)→
//   buildEntryTableHtml(氏名セルへ補助行)まで結線したことを検証する。
//   観点: 静的(定義/SELECT/結線)＋実行 GOLDEN(純関数語彙・当時値/現在値フォールバック・エスケープ・表 end-to-end)。
//   実データ不使用（架空のみ）。shogi_v4.html は触らない。
var fs=require('fs');
var path=require('path');
var AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');

var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}

// ---- 静的アサート（定義・SELECT・結線） ----
ok(/function memberKindLabelJa\(/.test(AUTH_JS),'S1 memberKindLabelJa 定義');
ok(/function gradeLabelJa\(/.test(AUTH_JS),'S2 gradeLabelJa 定義');
ok(/function resolveEntryAttr\(/.test(AUTH_JS),'S3 resolveEntryAttr 定義');
ok(/function buildEntryAttrDisplay\(/.test(AUTH_JS),'S4 buildEntryAttrDisplay 定義');
ok(/function buildEntryAttrDisplayHtml\(/.test(AUTH_JS),'S5 buildEntryAttrDisplayHtml 定義');
ok(AUTH_JS.indexOf("'final_rank,class,wins,losses,sos,sodos,participated,member_kind,grade,city,player_id'")>=0,'S6 fetchEntries entries SELECT に3属性追加');
ok(AUTH_JS.indexOf('members(name,yomi,member_kind,grade,city)')>=0,'S7 fetchEntries members 現在値埋め込みに3属性追加');
ok(/attrHtml: buildEntryAttrDisplayHtml\(e, m\)/.test(AUTH_JS),'S8 shapeEntryRow が attrHtml を搬送');
ok(/_entryNameRubyHtml\(r\.name, r\.yomi\) \+ \(r\.attrHtml \|\| ''\)/.test(AUTH_JS),'S9 buildEntryTableHtml 氏名セルへ補助行を結線');
ok(/buildEntryAttrDisplayHtml[\s\S]{0,400}esc\(d\.parts\[i\]\)/.test(AUTH_JS),'S10 表示 HTML は esc 経由');

// ---- 実行: ShogiAuth ロード ----
function loadAuth(){
  var win={location:{origin:'https://app.test',pathname:'/app/'}};
  new Function('window',AUTH_JS)(win);
  return win.ShogiAuth;
}
var A=loadAuth();

// 純関数 GOLDEN（当日と同一語彙・挙動）
eq(A.memberKindLabelJa('member'),'沼津支部員','E1 member→沼津支部員');
eq(A.memberKindLabelJa('other'),'他','E2 other→他');
eq(A.memberKindLabelJa(''),'','E3 未知→空');
eq(A.gradeLabelJa('ippan'),'一般','E4 ippan→一般');
eq(A.gradeLabelJa('chu'),'中学生以下','E5 chu→中学生以下');
eq(A.gradeLabelJa('josei'),'女性','E6 josei→女性');
eq(A.gradeLabelJa('dan'),'','E7 未知→空');

var cur={member_kind:'other',grade:'josei',city:'三島市'};
var d1=A.buildEntryAttrDisplay({member_kind:'member',grade:'ippan',city:'沼津市'},cur);
eq(d1.text,'沼津支部員 / 一般 / 沼津市','E8 [GOLDEN] 当時値3属性');
eq(d1.fromCurrent,false,'E9 当時値あり→注記なし');
var d2=A.buildEntryAttrDisplay({member_kind:'other',grade:'chu',city:''},cur);
eq(d2.text,'他 / 中学生以下','E10 [GOLDEN] 空 city 非表示');
eq(d2.parts.length,2,'E11 city 抜き2パーツ');
var d3=A.buildEntryAttrDisplay({member_kind:null,grade:null,city:null},cur);
eq(d3.text,'他 / 女性 / 三島市（※現在値）','E12 [GOLDEN] 旧行→現在値＋注記');
eq(d3.fromCurrent,true,'E13 フォールバック→fromCurrent');

var h1=A.buildEntryAttrDisplayHtml({member_kind:'member',grade:'ippan',city:'<x>'},null);
ok(h1.indexOf('&lt;x&gt;')>=0&&h1.indexOf('<x>')<0,'E14 city はエスケープ');
ok(h1.indexOf('沼津支部員 / 一般 / &lt;x&gt;')>=0,'E15 パーツ順保持＋エスケープ');
var h2=A.buildEntryAttrDisplayHtml({member_kind:'',grade:'',city:''},{});
eq(h2,'','E16 表示対象なし→空文字');

// shapeEntryRow が attrHtml を搬送（当時値スナップショット優先）
var row=A.shapeEntryRow({final_rank:1,'class':'A',wins:3,losses:0,sos:5,sodos:4,
  member_kind:'member',grade:'ippan',city:'沼津市',
  players:{member_id:'m1',members:{name:'甲野太郎',yomi:'こうの',member_kind:'other',grade:'josei',city:'三島市'}}});
ok(typeof row.attrHtml==='string'&&row.attrHtml.indexOf('沼津支部員 / 一般 / 沼津市')>=0,'E17 shapeEntryRow.attrHtml=当時値');
ok(row.attrHtml.indexOf('現在値')<0,'E18 当時値あり→現在値注記なし');

// buildEntryTableHtml end-to-end（氏名セルに補助行が出る／当時値・旧行フォールバックの両経路）
var entries=[
  {final_rank:1,'class':'A',wins:3,losses:0,sos:5,sodos:4,
    member_kind:'member',grade:'ippan',city:'沼津市',
    players:{member_id:'m1',members:{name:'甲野太郎',yomi:'こうの',member_kind:'other',grade:'josei',city:'三島市'}}},
  {final_rank:2,'class':'A',wins:2,losses:1,sos:4,sodos:3,
    member_kind:null,grade:null,city:null,
    players:{member_id:'m2',members:{name:'乙山花子',yomi:'おつやま',member_kind:'other',grade:'josei',city:'裾野市'}}}
];
var thtml=A.buildEntryTableHtml(entries);
ok(thtml.indexOf('甲野太郎')>=0&&thtml.indexOf('沼津支部員 / 一般 / 沼津市')>=0,'E19 [GOLDEN] 1位=当時値の補助行');
ok(thtml.indexOf('他 / 女性 / 裾野市')>=0&&thtml.indexOf('（※現在値）')>=0,'E20 [GOLDEN] 旧行=現在値フォールバック＋注記');
ok(thtml.indexOf('font-size:11px;color:#777;margin-top:2px')>=0,'E21 補助行の見た目は当日と同一スタイル');
var thtml2=A.buildEntryTableHtml([{final_rank:1,'class':'A',wins:1,losses:0,sos:0,sodos:0,
  member_kind:'',grade:'',city:'',players:{member_id:'m3',members:{name:'無属性',yomi:''}}}]);
ok(thtml2.indexOf('無属性')>=0&&thtml2.indexOf('margin-top:2px')<0,'E22 属性なし→補助行を出さない');

console.log('MEMBER-ATTR-DISPLAY-APP-607: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
