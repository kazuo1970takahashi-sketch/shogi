#!/usr/bin/env node
// RANK-TIE-001: 順位決定項目（A/B/C/直接対決）が完全同点の参加者を同順位表示する
//
// 検証観点:
//   1. isSameDisplayedRank: A/B/C/直接対決の判定
//   2. computeDisplayRanks: 欠番方式 (例: 12,12,14)
//   3. calcFinal は sort 構造を変更していないため従来通りソート結果を返す
//   4. 表示順位は保存されない（state.players / state.results に書き込みなし）
//   5. 3 表示サイト (mobile / desktop / print) が同じ表示順位を使う
//   6. 内部ソート用 tie-breaker（registration order / entry_no / name）は同順位判定に含まれない
//
// 既存 calcFinal sort 比較関数:
//   ① A 多い順 ② B 多い順 ③ C 多い順 ④ 直接対決 ⑤ 配列順（暗黙、stable sort）
//   本テストは ⑤（内部 tie-breaker）が同順位判定に含まれないこと、つまり
//   ①〜④全て同点なら同順位になることを確認する。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  const elements = {};
  function makeElem(id){
    return {
      id:id||'', _innerHTML:'', style:{cssText:'',display:''}, className:'',
      hidden:false,
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(){}, appendChild(){}, remove(){}, focus(){}, click(){},
      value:'', textContent:'', firstChild:null,
      getAttribute(){return null;}, setAttribute(){}
    };
  }
  const docMock = {
    _elements:elements,
    getElementById(id){if(!elements[id])elements[id]=makeElem(id);return elements[id];},
    createElement(){return makeElem();},
    body:{appendChild(){}, removeChild(){}},
    addEventListener(){}, removeEventListener(){}, querySelectorAll(){return [];}
  };
  const winMock = {innerWidth:1024};
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=String(v);}, removeItem(k){delete this._[k];}};
  return {document:docMock, window:winMock, localStorage:localStorageMock};
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       _setState:function(s){state=s;},
       _getState:function(){return state;},
       calcFinal:calcFinal,
       isSameDisplayedRank:isSameDisplayedRank,
       computeDisplayRanks:computeDisplayRanks,
       buildResultsMobileHtml:buildResultsMobileHtml,
       buildResultsDesktopHtml:buildResultsDesktopHtml,
       getTopPlayers:getTopPlayers
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}},
    {log(){},warn(){},error(){}}, Promise
  );
  api._ctx = ctx;
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_rank_tie_001.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(){pass++;}
function ng(msg){fail++;console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok();else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok();else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makePlayer(id,name,entryNo){
  return {id:id,name:name,cls:'A',member:'member',grade:'ippan',entry_no:entryNo};
}

function makeStateWithPlayers(players){
  return {
    players:{A:players,B:[]},
    rounds:4,
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    started:true,
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  };
}

// 任意の A/B/C を直接作るために、calcFinal が参照する results を生成するヘルパ。
// ただし B/C は計算で決まるため、構築は「想定通りの A/B/C を作る最小 results」を組む方が早い。
// 本テストでは calcFinal を経由せず、isSameDisplayedRank / computeDisplayRanks を直接呼ぶ。
function mkRow(id,name,A,B,C){
  return {p:{id:id,name:name,cls:'A'},A:A,B:B,C:C,played:A+1};
}

// ============================================================================
// SECTION 1: isSameDisplayedRank 単体
// ============================================================================

// 1-1: A/B/C 全一致 → 同順位
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','芹澤',12),makePlayer('p2','小坂',13)]));
  const a = mkRow('p1','芹澤',2,3,1);
  const b = mkRow('p2','小坂',2,3,1);
  assertEq(env.isSameDisplayedRank(a,b,'A'), true, '1-1: A/B/C 全一致は同順位');
}

// 1-2: A 異なる → 別順位
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','x',1),makePlayer('p2','y',2)]));
  const a = mkRow('p1','x',3,5,2);
  const b = mkRow('p2','y',2,5,2);
  assertEq(env.isSameDisplayedRank(a,b,'A'), false, '1-2: A 異なる → 別順位');
}

// 1-3: B 異なる → 別順位
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','x',1),makePlayer('p2','y',2)]));
  const a = mkRow('p1','x',2,5,2);
  const b = mkRow('p2','y',2,4,2);
  assertEq(env.isSameDisplayedRank(a,b,'A'), false, '1-3: B 異なる → 別順位');
}

// 1-4: C 異なる → 別順位
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','x',1),makePlayer('p2','y',2)]));
  const a = mkRow('p1','x',2,4,3);
  const b = mkRow('p2','y',2,4,2);
  assertEq(env.isSameDisplayedRank(a,b,'A'), false, '1-4: C 異なる → 別順位');
}

// 1-5: A/B/C 同点だが直接対決で決着 → 別順位
{
  const env = loadEnv(targetPath);
  const st = makeStateWithPlayers([makePlayer('p1','x',1),makePlayer('p2','y',2)]);
  st.results.A = [[{p1:'p1',p2:'p2',winner:'p1'}]];
  env._setState(st);
  const a = mkRow('p1','x',2,4,2);
  const b = mkRow('p2','y',2,4,2);
  assertEq(env.isSameDisplayedRank(a,b,'A'), false, '1-5: 直接対決で勝敗あり → 別順位');
}

// 1-6: A/B/C 同点で直接対決が draw (winner=null) → 同順位
{
  const env = loadEnv(targetPath);
  const st = makeStateWithPlayers([makePlayer('p1','x',1),makePlayer('p2','y',2)]);
  st.results.A = [[{p1:'p1',p2:'p2',winner:null}]];
  env._setState(st);
  const a = mkRow('p1','x',2,4,2);
  const b = mkRow('p2','y',2,4,2);
  assertEq(env.isSameDisplayedRank(a,b,'A'), true, '1-6: 直接対決 draw（winner=null）→ 同順位');
}

// 1-7: A/B/C 同点で直接対決なし → 同順位（くじ引き相当）
{
  const env = loadEnv(targetPath);
  const st = makeStateWithPlayers([makePlayer('p1','x',1),makePlayer('p2','y',2)]);
  st.results.A = [[{p1:'p1',p2:'p_other',winner:'p1'}]];  // 別の相手と対戦
  env._setState(st);
  const a = mkRow('p1','x',2,4,2);
  const b = mkRow('p2','y',2,4,2);
  assertEq(env.isSameDisplayedRank(a,b,'A'), true, '1-7: 直接対決なし → 同順位');
}

// 1-8: 内部 tie-breaker（entry_no / 氏名 / id）だけが異なっても同順位
// → 比較対象が A/B/C/直接対決 のみであることの裏付け
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p_zzz','zzz',999),makePlayer('p_aaa','aaa',1)]));
  const a = mkRow('p_zzz','zzz',1,1,0);
  const b = mkRow('p_aaa','aaa',1,1,0);
  assertEq(env.isSameDisplayedRank(a,b,'A'), true, '1-8: 内部 tie-breaker のみ異なる → 同順位');
}

// ============================================================================
// SECTION 2: computeDisplayRanks 単体（欠番方式）
// ============================================================================

// 2-1: 同点なし → 1,2,3,4
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3),makePlayer('p4','d',4)]));
  const finals = [mkRow('p1','a',4,8,6),mkRow('p2','b',3,7,5),mkRow('p3','c',2,6,4),mkRow('p4','d',1,5,3)];
  assertEq(env.computeDisplayRanks(finals,'A'), [1,2,3,4], '2-1: 同点なし → 1,2,3,4');
}

// 2-2: 2名タイ中位 → 1,2,3,3,5 形（依頼の 12位タイケース相当）
{
  const env = loadEnv(targetPath);
  // 13人並べて 12位タイ・13位タイを再現する
  const players = [];
  const finals = [];
  for(let i=0;i<13;i++){
    players.push(makePlayer('p'+i,'P'+i,i+1));
    // 11位までは A 異なる、12-13位は A/B/C 全同
    finals.push(mkRow('p'+i,'P'+i, i<11 ? (13-i) : 2, i<11 ? (20-i) : 5, i<11 ? (10-i) : 1));
  }
  env._setState(makeStateWithPlayers(players));
  const ranks = env.computeDisplayRanks(finals,'A');
  assertEq(ranks[10], 11, '2-2-a: 11位は 11');
  assertEq(ranks[11], 12, '2-2-b: 12位は 12');
  assertEq(ranks[12], 12, '2-2-c: 13位（タイ）は 12 ← 依頼の事例');
}

// 2-3: 14位は欠番方式で 14（タイ 2名後）
{
  const env = loadEnv(targetPath);
  // 14人並べて 12位タイ 2名 + 14位
  const players = [];
  const finals = [];
  for(let i=0;i<14;i++){
    players.push(makePlayer('p'+i,'P'+i,i+1));
    // 11位までは A 異なる、12-13位は A/B/C 全同、14位は A 一段下
    finals.push(mkRow('p'+i,'P'+i,
      i<11 ? (14-i) : (i<13 ? 2 : 1),
      i<11 ? (20-i) : (i<13 ? 5 : 4),
      i<11 ? (10-i) : (i<13 ? 1 : 0)));
  }
  env._setState(makeStateWithPlayers(players));
  const ranks = env.computeDisplayRanks(finals,'A');
  assertEq(ranks[11], 12, '2-3-a: タイ先頭 12');
  assertEq(ranks[12], 12, '2-3-b: タイ次 12');
  assertEq(ranks[13], 14, '2-3-c: タイ後は 13 でなく 14（欠番方式）');
}

// 2-4: 3名完全同点 → 11,12,12,12,15
{
  const env = loadEnv(targetPath);
  const players = [];
  const finals = [];
  for(let i=0;i<15;i++){
    players.push(makePlayer('p'+i,'P'+i,i+1));
    if(i<10)finals.push(mkRow('p'+i,'P'+i,15-i,20-i,10-i));
    else if(i===10)finals.push(mkRow('p'+i,'P'+i,4,8,3));    // 11位
    else if(i<14)finals.push(mkRow('p'+i,'P'+i,3,6,2));      // 12-14位 完全同点
    else finals.push(mkRow('p'+i,'P'+i,2,5,1));              // 15位
  }
  env._setState(makeStateWithPlayers(players));
  const ranks = env.computeDisplayRanks(finals,'A');
  assertEq(ranks[10], 11, '2-4-a: 11位');
  assertEq(ranks[11], 12, '2-4-b: 12位');
  assertEq(ranks[12], 12, '2-4-c: 13位 → 12');
  assertEq(ranks[13], 12, '2-4-d: 14位 → 12');
  assertEq(ranks[14], 15, '2-4-e: 15位（タイ3名後、欠番方式）');
}

// 2-5: 1位タイ → 1,1,3
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3)]));
  const finals = [mkRow('p1','a',3,5,2),mkRow('p2','b',3,5,2),mkRow('p3','c',2,4,1)];
  assertEq(env.computeDisplayRanks(finals,'A'), [1,1,3], '2-5: 1位タイ → 1,1,3');
}

// 2-6: 最下位タイ → 1,2,2
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3)]));
  const finals = [mkRow('p1','a',3,5,2),mkRow('p2','b',2,4,1),mkRow('p3','c',2,4,1)];
  assertEq(env.computeDisplayRanks(finals,'A'), [1,2,2], '2-6: 最下位タイ → 1,2,2');
}

// 2-7: 全員同点 → 全員 1位
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3),makePlayer('p4','d',4)]));
  const finals = [mkRow('p1','a',2,4,1),mkRow('p2','b',2,4,1),mkRow('p3','c',2,4,1),mkRow('p4','d',2,4,1)];
  assertEq(env.computeDisplayRanks(finals,'A'), [1,1,1,1], '2-7: 全員同点 → 全員 1位');
}

// 2-8: 空配列 → 空
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([]));
  assertEq(env.computeDisplayRanks([],'A'), [], '2-8: 空配列 → 空');
}

// 2-9: 1人 → [1]
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','a',1)]));
  assertEq(env.computeDisplayRanks([mkRow('p1','a',3,5,2)],'A'), [1], '2-9: 1人 → [1]');
}

// 2-10: 順位決定項目のうち 1 つでも異なれば別順位（B のみ違う隣接ケース）
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','a',1),makePlayer('p2','b',2)]));
  const finals = [mkRow('p1','a',2,5,1),mkRow('p2','b',2,4,1)];  // A同 / B違 / C同
  assertEq(env.computeDisplayRanks(finals,'A'), [1,2], '2-10: B のみ違う → 別順位');
}

// ============================================================================
// SECTION 3: 安定性 - 再計算で同じ順位
// ============================================================================

// 3-1: 同じ finals に対する computeDisplayRanks は 2 回呼んでも同じ結果
{
  const env = loadEnv(targetPath);
  env._setState(makeStateWithPlayers([makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3)]));
  const finals = [mkRow('p1','a',2,4,1),mkRow('p2','b',2,4,1),mkRow('p3','c',1,3,0)];
  const r1 = env.computeDisplayRanks(finals,'A');
  const r2 = env.computeDisplayRanks(finals,'A');
  assertEq(r1, r2, '3-1: 同じ入力で同じ結果（reload 相当）');
}

// 3-2: 表示順位は保存データに書き込まれない（state.players / state.results が不変）
{
  const env = loadEnv(targetPath);
  const players = [makePlayer('p1','a',1),makePlayer('p2','b',2)];
  const st = makeStateWithPlayers(players);
  env._setState(st);
  const before = JSON.stringify(env._getState());
  const finals = [mkRow('p1','a',2,4,1),mkRow('p2','b',2,4,1)];
  env.computeDisplayRanks(finals,'A');
  env.isSameDisplayedRank(finals[0],finals[1],'A');
  const after = JSON.stringify(env._getState());
  assertEq(before, after, '3-2: computeDisplayRanks/isSameDisplayedRank は state を変更しない');
  // finals オブジェクトにも rank プロパティが書き込まれていない
  assertEq(finals[0].rank, undefined, '3-2-a: finals[0] に rank が書き込まれない');
  assertEq(finals[0].displayRank, undefined, '3-2-b: finals[0] に displayRank が書き込まれない');
}

// ============================================================================
// SECTION 4: 既存 calcFinal sort 構造の維持確認 + 統合
// ============================================================================

// 4-1: calcFinal は依然として A/B/C/直接対決順でソートする（構造維持）
{
  const env = loadEnv(targetPath);
  const players = [
    makePlayer('p1','a',1),
    makePlayer('p2','b',2),
    makePlayer('p3','c',3)
  ];
  const st = makeStateWithPlayers(players);
  // p2 が 2 勝、p1/p3 が 1 勝ずつで p1 と p3 は直接対決で p1 勝ち
  st.results.A = [
    [{p1:'p1',p2:'p2',winner:'p2'}],
    [{p1:'p3',p2:'p2',winner:'p2'}],
    [{p1:'p1',p2:'p3',winner:'p1'}]
  ];
  env._setState(st);
  const finals = env.calcFinal('A');
  assertEq(finals.length, 3, '4-1-a: 3 人分');
  assertEq(finals[0].p.id, 'p2', '4-1-b: 2勝の p2 が1位');
  // p1 と p3 は 1勝同士、直接対決で p1 勝ち → p1 が上
  assertEq(finals[1].p.id, 'p1', '4-1-c: 直接対決で勝った p1 が2位');
  assertEq(finals[2].p.id, 'p3', '4-1-d: 直接対決で負けた p3 が3位');
}

// 4-2: calcFinal + computeDisplayRanks 統合 — 完全同点ケースで同順位表示
{
  const env = loadEnv(targetPath);
  // 4 人で 1勝 1敗 ラウンドロビン的な完全同点を作る
  // p1 vs p2 → p1 / p2 vs p3 → p2 / p3 vs p4 → p3 / p4 vs p1 → p4
  // この場合、勝数は全員 1、B/C も均衡（直接対決で循環）
  const players = [
    makePlayer('p1','a',1),
    makePlayer('p2','b',2),
    makePlayer('p3','c',3),
    makePlayer('p4','d',4)
  ];
  const st = makeStateWithPlayers(players);
  st.results.A = [
    [{p1:'p1',p2:'p3',winner:null},{p1:'p2',p2:'p4',winner:null}]  // 全 draw → A/B/C 全員 0 完全同点
  ];
  env._setState(st);
  const finals = env.calcFinal('A');
  const ranks = env.computeDisplayRanks(finals,'A');
  // 全員 A=0, B=0, C=0 で直接対決 draw → 全員同順位 = 1
  assertEq(ranks, [1,1,1,1], '4-2: 全 draw で全員同順位');
}

// ============================================================================
// SECTION 5: 表示 HTML への反映確認（mobile / desktop / print）
// ============================================================================

// 5-1: buildResultsMobileHtml が表示順位を反映している
{
  const env = loadEnv(targetPath);
  const players = [makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3)];
  const st = makeStateWithPlayers(players);
  env._setState(st);
  const finals = [mkRow('p1','a',2,4,1),mkRow('p2','b',2,4,1),mkRow('p3','c',1,3,0)];
  const wins = {p1:2,p2:2,p3:1};
  const html = env.buildResultsMobileHtml('A',finals,wins);
  // 期待順位: 1, 1, 3
  // 1位は badge b1、3位は素の "3位"（badge は 1〜3 位のみ b1/b2/b3）
  // 2 行目（同 1 位タイ）も badge b1 になることを確認
  const b1Count = (html.match(/badge b1/g) || []).length;
  assertEq(b1Count, 2, '5-1-a: mobile で 1位タイは b1 が 2 個');
  assert(html.indexOf('3位') !== -1, '5-1-b: mobile で 3位 表示あり');
  assert(html.indexOf('2位') === -1, '5-1-c: mobile で 2位 は表示されない（欠番）');
}

// 5-2: buildResultsDesktopHtml が表示順位を反映している
{
  const env = loadEnv(targetPath);
  const players = [makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3)];
  const st = makeStateWithPlayers(players);
  env._setState(st);
  const finals = [mkRow('p1','a',2,4,1),mkRow('p2','b',2,4,1),mkRow('p3','c',1,3,0)];
  const wins = {p1:2,p2:2,p3:1};
  const html = env.buildResultsDesktopHtml('A',finals,wins);
  const b1Count = (html.match(/badge b1/g) || []).length;
  assertEq(b1Count, 2, '5-2-a: desktop で 1位タイは b1 が 2 個');
  assert(html.indexOf('3位') !== -1, '5-2-b: desktop で 3位 表示あり');
  assert(html.indexOf('2位') === -1, '5-2-c: desktop で 2位 は表示されない（欠番）');
}

// 5-3: 中位タイ（例: 12位タイ）が mobile / desktop で同順位表示
{
  const env = loadEnv(targetPath);
  const players = [];
  const finals = [];
  for(let i=0;i<13;i++){
    players.push(makePlayer('p'+i,'P'+i,i+1));
    finals.push(mkRow('p'+i,'P'+i, i<11 ? (13-i) : 2, i<11 ? (20-i) : 5, i<11 ? (10-i) : 1));
  }
  const st = makeStateWithPlayers(players);
  env._setState(st);
  const wins = {};players.forEach(function(p){wins[p.id]=0;});
  const mobile = env.buildResultsMobileHtml('A',finals,wins);
  const desktop = env.buildResultsDesktopHtml('A',finals,wins);
  // 12位タイなので "12位" が 2 回出現、"13位" は 0 回
  const mobile12 = (mobile.match(/12位/g) || []).length;
  const desktop12 = (desktop.match(/12位/g) || []).length;
  assertEq(mobile12, 2, '5-3-a: mobile で "12位" 2 回');
  assertEq(desktop12, 2, '5-3-b: desktop で "12位" 2 回');
  assert(mobile.indexOf('13位') === -1, '5-3-c: mobile で "13位" 表示なし');
  assert(desktop.indexOf('13位') === -1, '5-3-d: desktop で "13位" 表示なし');
}

// ============================================================================
// SECTION 6: 表彰路 (getTopPlayers) は今回 scope 外（変更されていないこと）
// ============================================================================

// 6-1: getTopPlayers は従来通り idx+1 ベースで top 3 を返す
//   （表彰・賞品判定は今回扱わない。同順位導入は表示のみ）
{
  const env = loadEnv(targetPath);
  const players = [makePlayer('p1','a',1),makePlayer('p2','b',2),makePlayer('p3','c',3)];
  const st = makeStateWithPlayers(players);
  st.results.A = [
    [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p1',winner:'p1'}]  // p1 が 2 勝
  ];
  env._setState(st);
  const tops = env.getTopPlayers('A');
  // 表彰路は変更なし: rank は順位（1,2,3）が入る（厳密 idx+1 ベース）
  assertEq(tops.length <= 3, true, '6-1-a: top players は最大 3 件');
  // rank キーは現状の idx+1 のまま（表彰・賞品判定 scope 外）
  if(tops.length>=1)assertEq(tops[0].rank, 1, '6-1-b: 1番目は rank=1');
  if(tops.length>=2)assertEq(tops[1].rank, 2, '6-1-c: 2番目は rank=2（表彰路は idx+1 のまま）');
}

// ============================================================================
// 結果
// ============================================================================
console.log('\n  RANK-TIE-001 単体テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
