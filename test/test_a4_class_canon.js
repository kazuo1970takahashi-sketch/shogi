#!/usr/bin/env node
// A-4 (SYSTEM-REVIEW #377 follow): クラス集計キーの正規化（app/auth.js・読み取り側）。
//   canonicalizeClass（少→B・A/B/C 恒等・trim）＋ shape*（cls 読取）適用＋ 年度横断集計の安定化。
//   read-only・mock・架空データのみ・shogi_v4.html 非接触。
const fs=require('fs'), path=require('path');
const AUTH_JS=fs.readFileSync(path.join(__dirname,'..','app','auth.js'),'utf8');
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.error('  FAIL: '+m));};
function loadAuth(){const win={location:{origin:'https://app.test',pathname:'/app/'}};new Function('window',AUTH_JS)(win);return win.ShogiAuth;}
const A=loadAuth();
function srow(season,mid,name,cls,rank){return A.shapeStandingRow({wins:1,losses:0,final_rank:rank,class:cls,players:{member_id:mid,members:{name:name,branch:'沼津'}},tournaments:{season:season,date:season+'-01-01'}});}

console.log('=== canonicalizeClass（純）===');
ok(A.canonicalizeClass('少')==='B','C1 少→B');
ok(A.canonicalizeClass('少年')==='B','C2 少年→B');
ok(A.canonicalizeClass('A')==='A','C3 A 恒等');
ok(A.canonicalizeClass('B')==='B','C4 B 恒等');
ok(A.canonicalizeClass('C')==='C','C5 C 恒等');
ok(A.canonicalizeClass(' B ')==='B','C6 trim');
ok(A.canonicalizeClass('')==='','C7 空→空');
ok(A.canonicalizeClass(null)==='','C8 null→空');
ok(A.canonicalizeClass('上級')==='上級','C9 未知ラベルは恒等（誤統合しない）');

console.log('=== shape*（cls 読取で正規化）===');
ok(A.shapeStandingRow({class:'少',players:null,tournaments:null}).cls==='B','S1 shapeStandingRow 少→B');
ok(A.shapeEntryRow({class:'少',players:null}).cls==='B','S2 shapeEntryRow 少→B');
ok(A.shapeStandingRow({class:'A',players:null,tournaments:null}).cls==='A','S3 A は不変');

console.log('=== 年度横断集計の安定化（少と B が同一クラス扱い）===');
// 2024年度=少 / 2025年度=B の同一会員が、クラス B フィルタで両方拾われる
var rows=[ srow('2024年度','m1','甲','少',1), srow('2025年度','m1','甲','B',2), srow('2025年度','m2','乙','A',1) ];
var lc=A.listClasses(rows,'2024年度');
ok(lc.length===1&&lc[0]==='B','L1 2024年度のクラス一覧は[B]（少→B）');
var g2025=A.aggregateStandings(rows,'2025年度','B');
ok(g2025.length===1&&g2025[0].member_id==='m1','G1 2025年度 B フィルタで甲が拾える');
var g2024=A.aggregateStandings(rows,'2024年度','B');
ok(g2024.length===1&&g2024[0].member_id==='m1','G2 2024年度 B フィルタ（旧「少」）で甲が拾える＝年度横断で同一クラス');

console.log('A4-CLASS-CANON: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
