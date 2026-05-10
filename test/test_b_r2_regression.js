#!/usr/bin/env node
// SHOGI-TOUR A-4: B級 R2 ペアリング品質回帰テスト
//
// 2026-05-10 実戦大会で発生した B級 R2 ミスマッチ:
//   R1 終了時点で 1勝者4名 / 0勝者4名（ともに偶数・再戦なし）。
//   理論上は同勝数完全マッチング可能だったが、実際の generatePairing は
//   1勝 vs 0勝 のミスマッチを 2 ペア生成した（実データ確認済み）。
//
// 本テストの目的:
//   evaluatePairingQuality が、ミスマッチが発生したペアリングに対して
//   avoidableWinDiffPairs > 0 を「正しく検出」することを確認する。
//   （generatePairing そのものの修正は仕様書 §8 に基づき A-5 以降）
//
// 引数: <target.html>

const fs = require('fs');
const path = require('path');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
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
       setState: function(s){ state = s; },
       getState: function(){ return state; },
       normalizeState: normalizeState,
       generatePairing: generatePairing,
       evaluatePairingQuality: evaluatePairingQuality
     };`
  );
  return factory(ctx.document, ctx.window, ctx.localStorage, ctx.alert, ctx.confirm, ctx.prompt, ctx.FileReader, ctx.Blob, ctx.URL);
}

const TARGET = process.argv[2] || 'shogi_v4.html';
const FIXTURE = path.join(__dirname, 'fixtures', 'b_class_r1_done.json');
const api = makeSandbox(extractScripts(TARGET));

let pass = 0, fail = 0;
function assert(cond, msg){ if(cond){pass++; console.log('  ✓ '+msg);} else {fail++; console.log('  ✗ '+msg);} }

console.log('\n=== B級 R2 ペアリング品質 回帰テスト ===');

const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const normalized = api.normalizeState(fixture);

// 前提確認: B級 8名・R1 終了済み・1勝者4 / 0勝者4
assert(normalized.players.B.length === 8, '前提: B級 8名');
assert(normalized.results.B.length === 1, '前提: R1 が完了済み');
const r1 = normalized.results.B[0];
assert(r1.length === 4, '前提: R1 に 4 試合');
const winsAfterR1 = {};
for(const p of normalized.players.B) winsAfterR1[p.id] = 0;
for(const m of r1) winsAfterR1[m.winner] = (winsAfterR1[m.winner]||0) + 1;
const oneWinCount = Object.values(winsAfterR1).filter(v=>v===1).length;
const zeroWinCount = Object.values(winsAfterR1).filter(v=>v===0).length;
assert(oneWinCount === 4, '前提: 1勝者 4名');
assert(zeroWinCount === 4, '前提: 0勝者 4名');

// 評価関数の単体検証: 実戦で発生したミスマッチ構成を再現
console.log('\n--- ケースA: 実戦再現（同勝数完全マッチ可能なのに 1v0 ミスマッチ 2ペア） ---');
{
  // 実データの R2 構成を再現
  // 鈴木 vs 森 (1v1 ✓)
  // すみれ vs ひろやす (1v0 ❌) ← 本来 すみれ vs わたなべ で組めた
  // わたなべ vs 暖和 (1v0 ❌)
  // 美由紀 vs 稜英 (0v0 ✓)
  const ids = {};
  for(const p of normalized.players.B) ids[p.name] = p.id;
  const buggyPairings = [
    {p1: ids['鈴木ひなの'],   p2: ids['森ゆかり'],     winner: null},  // 1v1
    {p1: ids['さとうすみれ'], p2: ids['さとうひろやす'], winner: null},  // 1v0
    {p1: ids['わたなべたいち'], p2: ids['大野暖和'],     winner: null},  // 1v0
    {p1: ids['佐藤美由紀'],   p2: ids['大野稜英'],     winner: null}   // 0v0
  ];
  const q = api.evaluatePairingQuality(buggyPairings, normalized.results.B, normalized.players.B);
  assert(q.maxWinDiff === 1, 'maxWinDiff=1 (期待: '+q.maxWinDiff+')');
  assert(q.avoidableWinDiffPairs === 2,
    'avoidableWinDiffPairs=2 を検出（実戦バグ再現） (実際: '+q.avoidableWinDiffPairs+')');
  assert(q.warningHit === true, 'warningHit=true');
  assert(q.rematchCount === 0, 'rematchCount=0 (実データに再戦なし)');
}

console.log('\n--- ケースB: 同勝数完全マッチング → avoidable=0 ---');
{
  // 鈴木 vs 森 (1v1)
  // すみれ vs わたなべ (1v1)
  // ひろやす vs 暖和 (0v0)
  // 美由紀 vs 稜英 (0v0)
  const ids = {};
  for(const p of normalized.players.B) ids[p.name] = p.id;
  const goodPairings = [
    {p1: ids['鈴木ひなの'],   p2: ids['森ゆかり'],     winner: null},
    {p1: ids['さとうすみれ'], p2: ids['わたなべたいち'], winner: null},
    {p1: ids['さとうひろやす'], p2: ids['大野暖和'],     winner: null},
    {p1: ids['佐藤美由紀'],   p2: ids['大野稜英'],     winner: null}
  ];
  const q = api.evaluatePairingQuality(goodPairings, normalized.results.B, normalized.players.B);
  assert(q.maxWinDiff === 0, 'maxWinDiff=0');
  assert(q.avoidableWinDiffPairs === 0, 'avoidableWinDiffPairs=0 (理想ペアリング)');
  assert(q.sameScorePairCount === 4, 'sameScorePairCount=4');
  assert(q.warningHit === false, 'warningHit=false');
}

console.log('\n--- ケースC: generatePairing 実行時の挙動観察（情報用・FAILにしない） ---');
{
  // generatePairing は乱数を含むため決定的ではない。複数回試行し、
  // 「ミスマッチが発生した場合 avoidable>0 が検出される」ことを統計的に確認する。
  api.setState(JSON.parse(JSON.stringify(normalized)));
  let mismatchSeen = 0;
  let cleanSeen = 0;
  let detectedAvoidable = 0;
  for(let i=0;i<50;i++){
    const s = api.getState();
    s.pairings = {A:[], B:[]};
    api.setState(s);
    api.generatePairing('B');
    const cur = api.getState();
    const q = api.evaluatePairingQuality(cur.pairings.B, cur.results.B, cur.players.B);
    if(q.maxWinDiff > 0){
      mismatchSeen++;
      if(q.avoidableWinDiffPairs > 0) detectedAvoidable++;
    } else {
      cleanSeen++;
    }
  }
  console.log('  - 50回試行: clean=' + cleanSeen + ', mismatch=' + mismatchSeen + ', detected avoidable=' + detectedAvoidable);
  // 統計的確認: ミスマッチが発生した試行では必ず avoidable が検出されること
  assert(mismatchSeen === 0 || detectedAvoidable === mismatchSeen,
    'ミスマッチ発生時は全て avoidable として検出される');
}

console.log('\n==========================================');
console.log(`  PASS=${pass}, FAIL=${fail}`);
console.log('==========================================');
process.exit(fail===0?0:1);
