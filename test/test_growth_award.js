#!/usr/bin/env node
// 成長賞（#343 次の伸びしろ）: 前年度→今年度の勝率の伸び（aggregateGrowthAward / buildGrowthAwardHtml）。
//   read-only・既存 aggregateStandings/listSeasons の再利用・mock・架空のみ。
const fs=require('fs'), path=require('path');
const AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.error('  FAIL: '+m));};
function loadAuth(){const win={location:{origin:'https://app.test',pathname:'/app/'}};new Function('window',AUTH_JS)(win);return win.ShogiAuth;}
const A=loadAuth();
// row: 1大会 = 1 entry。member の年間集計は aggregateStandings が wins/losses/games を合算。
function row(season,mid,name,w,l){return A.shapeStandingRow({wins:w,losses:l,final_rank:null,class:'A',players:{member_id:mid,members:{name:name,branch:'沼津'}},tournaments:{season:season,date:season+'-01-01'}});}

console.log('=== aggregateGrowthAward ===');
// 甲: 2024=2勝2敗(50%)→2025=3勝1敗(75%) 伸び+25 / 乙: 2024=1勝3敗(25%)→2025=3勝1敗(75%) 伸び+50（最大）
// 3大会分を各年度に用意（minGames=3 を満たす）
var rows=[];
['2024年度','2025年度'].forEach(function(s){
  for(var i=0;i<3;i++){
    rows.push(row(s,'kou','甲', s==='2024年度'?2:3, s==='2024年度'?2:1));
    rows.push(row(s,'otsu','乙', s==='2024年度'?1:3, s==='2024年度'?3:1));
  }
});
var g=A.aggregateGrowthAward(rows,'2025年度');
ok(g.prevSeason==='2024年度','G1 前年度=2024年度（1つ前）');
ok(g.list.length===2,'G2 両年度3大会以上の2名');
ok(g.list[0].member_id==='otsu','G3 伸び最大は乙（+50pt）が先頭＝成長賞候補');
ok(g.list[0].delta===50&&g.list[0].prevWinRate===25&&g.list[0].curWinRate===75,'G4 乙 25%→75% 伸び+50');
ok(g.list[1].member_id==='kou'&&g.list[1].delta===25,'G5 甲 +25pt が2位');

console.log('=== 足切り（minGames）===');
var rows2=rows.concat([row('2024年度','spot','単発',9,0),row('2025年度','spot','単発',0,9)]); // 各年度1大会のみ
var g2=A.aggregateGrowthAward(rows2,'2025年度');
ok(g2.list.filter(function(x){return x.member_id==='spot';}).length===0,'G6 出場が少ない人(各年1大会)は対象外');
ok(A.aggregateGrowthAward(rows,'2025年度',{minGames:99}).list.length===0,'G7 minGames=99 で全員足切り');

console.log('=== 前年度なし ===');
ok(A.aggregateGrowthAward(rows,'2024年度').prevSeason===null,'G8 最古年度は前年度なし→prevSeason:null');

console.log('=== buildGrowthAwardHtml ===');
var html=A.buildGrowthAwardHtml('2025年度',g);
ok(html.indexOf('乙')>=0&&html.indexOf('🏅')>=0,'B1 候補(乙)に🏅');
ok(html.indexOf('+50pt')>=0,'B2 伸び表示(+50pt)');
ok(A.buildGrowthAwardHtml('2024年度',{prevSeason:null}).indexOf('前年度のデータがない')>=0,'B3 前年度なしの案内');
ok(A.buildGrowthAwardHtml('2025年度',{prevSeason:'2024年度',minGames:3,list:[]}).indexOf('出場した会員がいません')>=0,'B4 該当者なしの案内');

console.log('=== 配線（app/auth.js）===');
ok(AUTH_JS.indexOf('id="cloudGrowthView"')>=0,'W1 成長賞カードがビューにある');
ok(/byId\('cloudGrowth'\)[\s\S]{0,120}buildGrowthAwardHtml\(currentSeason, aggregateGrowthAward/.test(AUTH_JS),'W2 年度セレクタ再描画で成長賞も更新');
ok(/aggregateGrowthAward: aggregateGrowthAward/.test(AUTH_JS),'W3 ShogiAuth に公開');

console.log('GROWTH-AWARD: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
