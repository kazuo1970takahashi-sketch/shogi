#!/usr/bin/env node
// SHOGI-TOUR A-4: normalizeState の lastModifiedBy 補完テスト
// 仕様書 docs/specs/20260510_1904_shogi_a4_specs.md §4, §7 準拠
//
// 後方互換要件:
//   - lastModifiedBy 未定義の旧 JSON は "auto" に補完される
//   - "manual" は尊重される
//   - 不正値（null, undefined, 'foo', 数値等）は "auto" に正規化される
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
       normalizeState: normalizeState
     };`
  );
  return factory(ctx.document, ctx.window, ctx.localStorage, ctx.alert, ctx.confirm, ctx.prompt, ctx.FileReader, ctx.Blob, ctx.URL);
}

const TARGET = process.argv[2] || 'shogi_v4.html';
const api = makeSandbox(extractScripts(TARGET));

let pass = 0, fail = 0;
function assert(cond, msg){ if(cond){pass++; console.log('  ✓ '+msg);} else {fail++; console.log('  ✗ '+msg);} }
function eq(actual, expected, msg){ assert(actual===expected, msg+' (期待:'+JSON.stringify(expected)+' 実際:'+JSON.stringify(actual)+')'); }

console.log('\n=== normalizeState lastModifiedBy 補完 ===');

console.log('\n--- ケース1: lastModifiedBy 未定義 → "auto" 補完 ---');
{
  const raw = {
    players: {A: [{id:'p1',name:'A1'},{id:'p2',name:'A2'}], B: []},
    pairings: {A: [{p1:'p1',p2:'p2',winner:null}], B: []},
    results: {A: [], B: []}
  };
  const s = api.normalizeState(raw);
  eq(s.pairings.A[0].lastModifiedBy, 'auto', 'pairings: 未定義 → "auto"');
}

console.log('\n--- ケース2: lastModifiedBy="manual" → そのまま保持 ---');
{
  const raw = {
    players: {A: [{id:'p1',name:'A1'},{id:'p2',name:'A2'}], B: []},
    pairings: {A: [{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'manual'}], B: []},
    results: {A: [], B: []}
  };
  const s = api.normalizeState(raw);
  eq(s.pairings.A[0].lastModifiedBy, 'manual', 'pairings: "manual" → 保持');
}

console.log('\n--- ケース3: 不正値 → "auto" に正規化 ---');
{
  const raw = {
    players: {A: [{id:'p1',name:'A1'},{id:'p2',name:'A2'},{id:'p3',name:'A3'},{id:'p4',name:'A4'},{id:'p5',name:'A5'},{id:'p6',name:'A6'},{id:'p7',name:'A7'},{id:'p8',name:'A8'}], B: []},
    pairings: {A: [
      {p1:'p1',p2:'p2',winner:null,lastModifiedBy:null},
      {p1:'p3',p2:'p4',winner:null,lastModifiedBy:undefined},
      {p1:'p5',p2:'p6',winner:null,lastModifiedBy:'foo'},
      {p1:'p7',p2:'p8',winner:null,lastModifiedBy:42}
    ], B: []},
    results: {A: [], B: []}
  };
  const s = api.normalizeState(raw);
  eq(s.pairings.A[0].lastModifiedBy, 'auto', 'null → "auto"');
  eq(s.pairings.A[1].lastModifiedBy, 'auto', 'undefined → "auto"');
  eq(s.pairings.A[2].lastModifiedBy, 'auto', '"foo" → "auto"');
  eq(s.pairings.A[3].lastModifiedBy, 'auto', '42 → "auto"');
}

console.log('\n--- ケース4: results 内の過去ペアにも適用される ---');
{
  const raw = {
    players: {A: [{id:'p1',name:'A1'},{id:'p2',name:'A2'}], B: []},
    pairings: {A: [], B: []},
    results: {A: [
      [{p1:'p1',p2:'p2',winner:'p1'}]
    ], B: []}
  };
  const s = api.normalizeState(raw);
  eq(s.results.A[0][0].lastModifiedBy, 'auto', 'results: 未定義 → "auto"');
}

console.log('\n--- ケース5: 既存 fixture ファイル群がすべて読み込める（後方互換） ---');
{
  const dataFiles = fs.readdirSync(path.join(__dirname))
    .filter(f => f.startsWith('data_') && f.endsWith('.json'));
  for(const f of dataFiles){
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
      const s = api.normalizeState(raw);
      // 全 pairings/results 内ペアに lastModifiedBy が付与されている
      let allHaveFlag = true;
      for(const cls of ['A','B']){
        for(const m of (s.pairings[cls]||[])){
          if(m.lastModifiedBy !== 'auto' && m.lastModifiedBy !== 'manual'){ allHaveFlag = false; break; }
        }
        for(const round of (s.results[cls]||[])){
          for(const m of (round||[])){
            if(m.lastModifiedBy !== 'auto' && m.lastModifiedBy !== 'manual'){ allHaveFlag = false; break; }
          }
        }
      }
      assert(allHaveFlag, '既存 fixture ' + f + ': 全ペアに lastModifiedBy 付与');
    } catch(e){
      assert(false, '既存 fixture ' + f + ' の正規化に失敗: ' + e.message);
    }
  }
}

console.log('\n--- ケース6: B級R1 fixture が正常に正規化される ---');
{
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'b_class_r1_done.json'), 'utf8'));
  const s = api.normalizeState(raw);
  eq(s.players.B.length, 8, 'B級 8名');
  eq(s.results.B.length, 1, 'R1 が 1 回戦分');
  eq(s.results.B[0].length, 4, 'R1 に 4 試合');
  for(const m of s.results.B[0]){
    eq(m.lastModifiedBy, 'auto', 'R1 の各試合に lastModifiedBy="auto" 補完');
  }
}

console.log('\n==========================================');
console.log(`  PASS=${pass}, FAIL=${fail}`);
console.log('==========================================');
process.exit(fail===0?0:1);
