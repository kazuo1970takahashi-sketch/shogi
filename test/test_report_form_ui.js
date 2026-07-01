#!/usr/bin/env node
// REPORT-FORM-UI-001: 報告書設定フォームの統一スタイル化（見た目のみ・id/保存復元/出力は不変）。
//   全入力欄を .rep-form スコープ CSS で統一、持ち時間を .rep-tc ブロックに集約、数値欄は .rep-num。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== スコープCSS ===');
ok(/\.rep-form input,\.rep-form select,\.rep-form textarea\{[^}]*height:40px/.test(RAW),'C1 入力/選択/テキストエリアを高さ40pxで統一');
ok(RAW.indexOf('.rep-form .rep-num{width:80px')>=0,'C2 数値欄(.rep-num)は幅80px');
ok(RAW.indexOf('.rep-form .rep-tc{')>=0,'C3 持ち時間ブロック(.rep-tc)のCSS');
ok(RAW.indexOf('.rep-form .rep-g2{')>=0,'C4 2列グリッド(.rep-g2)のCSS');

console.log('=== マークアップ ===');
ok(/class="section no-print rep-form"/.test(RAW),'M1 報告書セクションに rep-form クラス');
ok(/<div class="rep-fld"><label>大会名<\/label><input type="text" id="rep-title"/.test(RAW),'M2 大会名は rep-fld＋クラス統一（inline width 撤去）');
ok(/<div class="rep-tc">[\s\S]{0,400}id="rep-time-type"/.test(RAW),'M3 持ち時間は .rep-tc ブロックに集約');
ok(RAW.indexOf('class="rep-num" id="rep-time-main"')>=0 && RAW.indexOf('class="rep-num" id="rep-time-byoyomi"')>=0,'M4 分/秒は .rep-num');
ok(RAW.indexOf('id="rep-time-preview"')>=0 && RAW.indexOf('class="rep-hint" id="rep-time-preview"')>=0,'M5 プレビューは .rep-hint');
ok(!/id="rep-title"[^>]*style="width:100%"/.test(RAW) && !/id="rep-prize"[^>]*style="width:100%"/.test(RAW),'M6 個別 inline width:100% を撤去（CSSに集約）');

console.log('=== id 温存（保存/復元/bind 不変の担保） ===');
['rep-title','rep-organizer','rep-date','rep-place','rep-start','rep-end','rep-sei','rep-fuku','rep-prize','rep-time-type','rep-time-main','rep-time-byoyomi','rep-time-byoyomi-wrap','rep-note','rep-fax','rep-office-name','rep-accounting-note','downloadReportBtn','rep-time-warning'].forEach(function(id){
  ok(RAW.indexOf('id="'+id+'"')>=0,'ID '+id+' 温存');
});

console.log('REPORT-FORM-UI: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
