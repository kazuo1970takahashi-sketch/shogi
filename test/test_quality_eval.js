#!/usr/bin/env node
// SHOGI-TOUR A-4: ペアリング品質評価関数 evaluatePairingQuality の単体テスト
// 仕様書 docs/specs/20260510_1904_shogi_a4_specs.md §1, §2, §5 準拠
// 引数: <target.html>
const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeElem(){return{_innerHTML:'',style:{cssText:'',display:''},className:'',
    get innerHTML(){return this._innerHTML;},set innerHTML(v){this._innerHTML=v;},
    addEventListener(){},appendChild(){},remove(){},focus(){},click(){},value:'',firstChild:null};}
  return {
    document:{getElementById(){return makeElem();},createElement(){return makeElem();},body:{appendChild(){},removeChild(){}},addEventListener(){}},
    window:{innerWidth:1024},
    localStorage:{_:{},getItem(k){return this._[k]||null;},setItem(k,v){this._[k]=v;},removeItem(k){delete this._[k];}},
    alert(){},confirm(){return true;},prompt(){return null;},
    FileReader:function(){},Blob:function(){},URL:{createObjectURL(){return'';},revokeObjectURL(){}}
  };
}

function makeSandbox(jsCode){
  const ctx = makeContext();
  const factory = new Function(
    'document','window','localStorage','alert','confirm','prompt','FileReader','Blob','URL',
    `${jsCode}
     return {
       evaluatePairingQuality: evaluatePairingQuality
     };`
  );
  return factory(ctx.document, ctx.window, ctx.localStorage, ctx.alert, ctx.confirm, ctx.prompt, ctx.FileReader, ctx.Blob, ctx.URL);
}

const TARGET = process.argv[2] || 'shogi_v4.html';
const api = makeSandbox(extractScripts(TARGET));

let pass = 0, fail = 0;
function assert(cond, msg){ if(cond){pass++; console.log('  ✓ '+msg);} else {fail++; console.log('  ✗ '+msg);} }
function eq(actual, expected, msg){ assert(actual===expected, msg+' (期待:'+expected+' 実際:'+actual+')'); }

// 共通ヘルパー
function players(n){
  const arr=[];
  for(let i=1;i<=n;i++) arr.push({id:'p'+i, name:'P'+i, cls:'A', member:'member', grade:'ippan'});
  return arr;
}

console.log('\n=== C1: 4人全員同勝数・再戦なし ===');
{
  const ps = players(4);
  // R1: p1 win vs p2, p3 win vs p4 → wins: p1=1, p2=0, p3=1, p4=0
  const results = [[
    {p1:'p1',p2:'p2',winner:'p1'},
    {p3:'p3',p4:'p4'}.p3, // dummy
  ]];
  // Use clean R1
  const cleanResults = [[
    {p1:'p1',p2:'p2',winner:'p1'},
    {p1:'p3',p2:'p4',winner:'p3'}
  ]];
  // R2 pairings: (p1 vs p3) (p2 vs p4) → 同勝数, 再戦なし
  const pairings = [
    {p1:'p1',p2:'p3',winner:null},
    {p1:'p2',p2:'p4',winner:null}
  ];
  const q = api.evaluatePairingQuality(pairings, cleanResults, ps);
  eq(q.sameScorePairCount, 2, 'sameScorePairCount=2');
  eq(q.totalWinDiff, 0, 'totalWinDiff=0');
  eq(q.maxWinDiff, 0, 'maxWinDiff=0');
  eq(q.rematchCount, 0, 'rematchCount=0');
  eq(q.avoidableWinDiffPairs, 0, 'avoidableWinDiffPairs=0');
  eq(q.warningHit, false, 'warningHit=false');
  eq(q.pairDetails.length, 2, 'pairDetails.length=2');
  assert(q.pairDetails[0].labels.indexOf('同勝数')>=0, 'labels に [同勝数]');
  assert(q.pairDetails[0].labels.indexOf('再戦なし')>=0, 'labels に [再戦なし]');
  assert(q.pairDetails[0].labels.indexOf('要確認')<0, '[要確認] なし');
}

console.log('\n=== C2: B級R2 再現相当（同勝数で組めるのに mixed pair が発生） ===');
{
  const ps = players(8);
  // R1: p1-p2 (p1 win), p3-p4 (p3 win), p5-p6 (p5 win), p7-p8 (p7 win)
  // wins: p1,p3,p5,p7 = 1勝; p2,p4,p6,p8 = 0勝
  const results = [[
    {p1:'p1',p2:'p2',winner:'p1'},
    {p1:'p3',p2:'p4',winner:'p3'},
    {p1:'p5',p2:'p6',winner:'p5'},
    {p1:'p7',p2:'p8',winner:'p7'}
  ]];
  // R2 pairings: (p1 vs p3) 同勝, (p5 vs p2) 1v0, (p7 vs p4) 1v0, (p6 vs p8) 同勝
  const pairings = [
    {p1:'p1',p2:'p3',winner:null},
    {p1:'p5',p2:'p2',winner:null},
    {p1:'p7',p2:'p4',winner:null},
    {p1:'p6',p2:'p8',winner:null}
  ];
  const q = api.evaluatePairingQuality(pairings, results, ps);
  eq(q.sameScorePairCount, 2, 'sameScorePairCount=2');
  eq(q.maxWinDiff, 1, 'maxWinDiff=1');
  eq(q.totalWinDiff, 2, 'totalWinDiff=2');
  eq(q.rematchCount, 0, 'rematchCount=0');
  eq(q.avoidableWinDiffPairs, 2, 'avoidableWinDiffPairs=2 (同勝数完全マッチング可能だった)');
  eq(q.warningHit, true, 'warningHit=true');
}

console.log('\n=== C3: 再戦を含む構成 ===');
{
  const ps = players(4);
  // R1: p1-p2 (p1 win), p3-p4 (p3 win)
  const results = [[
    {p1:'p1',p2:'p2',winner:'p1'},
    {p1:'p3',p2:'p4',winner:'p3'}
  ]];
  // R2: (p1 vs p2) 再戦！ (p3 vs p4) 再戦！
  const pairings = [
    {p1:'p1',p2:'p2',winner:null},
    {p1:'p3',p2:'p4',winner:null}
  ];
  const q = api.evaluatePairingQuality(pairings, results, ps);
  eq(q.rematchCount, 2, 'rematchCount=2');
  eq(q.warningHit, true, 'warningHit=true');
  assert(q.pairDetails[0].labels.indexOf('再戦')>=0, 'pair0 labels に [再戦]');
  assert(q.pairDetails[0].labels.indexOf('要確認')>=0, 'pair0 labels に [要確認]');
}

console.log('\n=== C4: 奇数グループ（1勝3名・0勝3名）→ forced cross-group ペアあり ===');
{
  const ps = players(6);
  // R1: p1-p2 (p1 win), p3-p4 (p3 win), p5-p6 (p5 win)
  // wins: p1,p3,p5 = 1勝(3名); p2,p4,p6 = 0勝(3名)
  const results = [[
    {p1:'p1',p2:'p2',winner:'p1'},
    {p1:'p3',p2:'p4',winner:'p3'},
    {p1:'p5',p2:'p6',winner:'p5'}
  ]];
  // R2: (p1 vs p3) 同勝, (p5 vs p2) 1v0 必然, (p4 vs p6) 同勝
  // 奇数群が2つ → forced=1 (ceil(2/2))。currentMixed=1 → avoidable=0
  const pairings = [
    {p1:'p1',p2:'p3',winner:null},
    {p1:'p5',p2:'p2',winner:null},
    {p1:'p4',p2:'p6',winner:null}
  ];
  const q = api.evaluatePairingQuality(pairings, results, ps);
  eq(q.maxWinDiff, 1, 'maxWinDiff=1');
  eq(q.avoidableWinDiffPairs, 0, 'avoidableWinDiffPairs=0 (奇数群は不可避な mixed)');
}

console.log('\n=== C5: 勝数差2 で警告対象（maxWinDiff>=2） ===');
{
  const ps = players(4);
  // 2回戦消化: p1=2勝, p2=1勝, p3=1勝, p4=0勝
  const results = [
    [{p1:'p1',p2:'p4',winner:'p1'},{p1:'p2',p2:'p3',winner:'p2'}],
    [{p1:'p1',p2:'p3',winner:'p1'},{p1:'p2',p2:'p4',winner:'p3'}]
  ];
  // R3 (架空): (p1 vs p4) → 2勝 vs 0勝, winDiff=2
  const pairings = [
    {p1:'p1',p2:'p4',winner:null},
    {p1:'p2',p2:'p3',winner:null}
  ];
  const q = api.evaluatePairingQuality(pairings, results, ps);
  eq(q.maxWinDiff, 2, 'maxWinDiff=2');
  eq(q.warningHit, true, 'warningHit=true (maxWinDiff>=2)');
  assert(q.pairDetails[0].labels.indexOf('要確認')>=0, '勝数差2 ペアに [要確認]');
}

console.log('\n=== C6: 空入力での堅牢性 ===');
{
  const q = api.evaluatePairingQuality([], [], []);
  eq(q.sameScorePairCount, 0, '空: sameScorePairCount=0');
  eq(q.rematchCount, 0, '空: rematchCount=0');
  eq(q.warningHit, false, '空: warningHit=false');
  eq(q.pairDetails.length, 0, '空: pairDetails=[]');

  const q2 = api.evaluatePairingQuality(null, null, null);
  eq(q2.sameScorePairCount, 0, 'null: sameScorePairCount=0');
  eq(q2.warningHit, false, 'null: warningHit=false');
}

console.log('\n=== C7: lastModifiedBy=manual で [手動変更] ラベル ===');
{
  const ps = players(2);
  const pairings = [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'manual'}];
  const q = api.evaluatePairingQuality(pairings, [], ps);
  assert(q.pairDetails[0].labels.indexOf('手動変更')>=0, '[手動変更] ラベル付与');
}

console.log('\n==========================================');
console.log(`  PASS=${pass}, FAIL=${fail}`);
console.log('==========================================');
process.exit(fail===0?0:1);
