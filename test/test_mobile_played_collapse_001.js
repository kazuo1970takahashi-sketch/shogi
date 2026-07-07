#!/usr/bin/env node
// MOBILE-PLAYED-LIST-COLLAPSE-001 (#661) 受入テスト（静的構造＋純関数）。
//   目的: モバイルで「現在の組み合わせ」を上部・無スクロールで見せるための
//         (1) 対戦済みリストの <details> 折りたたみ（既定=畳む／PC=open）と
//         (2) renderTournament の組立順（現在の組み合わせを参照系より前）を固定する。
//   不変条件: データ層・state.results・順位計算は無改変（表示の並び/開閉のみ）。
//   データは完全架空のみ。shogi_v4.html 本体は変更しない（本ファイルは test/ のみ）。
//
// 使い方: node test/test_mobile_played_collapse_001.js shogi_v4.html

const fs = require('fs');
const vm = require('vm');

const target = process.argv[2] || 'shogi_v4.html';
const html = fs.readFileSync(target, 'utf8');

function extractScripts(src){
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m, out = [];
  while((m = re.exec(src)) !== null) out.push(m[1]);
  return out.join('\n');
}
const code = extractScripts(html);

function extractFunction(src, name){
  const start = src.indexOf('function ' + name);
  if(start < 0) return null;
  let i = src.indexOf('{', start), depth = 0;
  for(; i < src.length; i++){
    const ch = src[i];
    if(ch === '{') depth++;
    else if(ch === '}'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

let PASS = 0, FAIL = 0;
function ok(cond, label){ if(cond){ PASS++; } else { FAIL++; console.error('  x ' + label); } }

// ---- A. 対戦済みリストの折りたたみ（構造） ----
const playedFn = extractFunction(code, 'buildPlayedHistoryHtml');
const playedNoSpace = (playedFn || '').replace(/\s+/g, '');
ok(!!playedFn, 'buildPlayedHistoryHtml 関数が存在する');
ok(/function buildPlayedHistoryHtml\(cls, sorted, played, isSP\)/.test(playedFn || ''), 'A1: isSP 引数を受け取る');
ok(/<details/.test(playedFn || ''), 'A2: <details> で折りたたむ');
ok(/<summary/.test(playedFn || ''), 'A3: <summary> を持つ');
ok(/対戦済みリスト/.test(playedFn || ''), 'A4: summary に「対戦済みリスト」を含む');
ok(playedNoSpace.indexOf("(isSP?'':'open')") >= 0, 'A5: open 属性は isSP で条件化（PC のみ open）');
ok(/#1F3864/.test(playedFn || ''), 'A6: summary は primary #1F3864 を流用（新色を足さない）');

// ---- B. データ非改変（read-only） ----
ok(!/\bstate\b/.test(playedFn || ''), 'B1: 本体は state を参照しない（表示のみ）');
ok(!/sorted\s*(\[[^\]]*\]|\.\w+)\s*=(?!=)/.test(playedFn || ''), 'B2: sorted を書き換えない');
ok(!/played\s*(\[[^\]]*\]|\.\w+)\s*=(?!=)/.test(playedFn || ''), 'B3: played を書き換えない');

// ---- C. 組立順（現在の組み合わせを参照系より前） ----
const renderFn = extractFunction(code, 'renderTournament');
ok(!!renderFn, 'renderTournament 関数が存在する');
const iCurrent = (renderFn || '').indexOf('html+=buildCurrentPairingsHtml');
const iScore   = (renderFn || '').indexOf('html+=buildScoreGridHtml');
const iPlayed  = (renderFn || '').indexOf('html+=buildPlayedHistoryHtml');
const iPast    = (renderFn || '').indexOf('html+=buildPastResultsHtml');
ok(iCurrent > 0 && iScore > 0 && iPlayed > 0 && iPast > 0, 'C0: 4 セクションの組立が存在する');
ok(iCurrent < iScore,  'C1: 現在の組み合わせ < 暫定成績');
ok(iCurrent < iPlayed, 'C2: 現在の組み合わせ < 対戦済みリスト');
ok(iCurrent < iPast,   'C3: 現在の組み合わせ < 過去の結果');

// ---- D. 純関数動作（既定折りたたみ／PC open／データ不変） ----
function runPlayed(isSP, win){
  const sandbox = {
    escapeHtml: function(x){ return String(x == null ? '' : x); },
    getNameWithNo: function(id, cls){ return cls + '-' + id; }
  };
  if(win !== undefined) sandbox.window = win;
  vm.createContext(sandbox);
  const fn = vm.runInContext('(' + playedFn + ')', sandbox);
  const sorted = [{ id: 1 }, { id: 2 }];
  const played = { 1: [2], 2: [1] };
  const sBefore = JSON.stringify(sorted), pBefore = JSON.stringify(played);
  const out = fn('A', sorted, played, isSP);
  return { out: out, mutated: (JSON.stringify(sorted) !== sBefore) || (JSON.stringify(played) !== pBefore) };
}

let rSP, rPC, rDefSP, rDefPC;
try { rSP = runPlayed(true); } catch(e){ rSP = { out: '', err: e }; }
try { rPC = runPlayed(false); } catch(e){ rPC = { out: '', err: e }; }
try { rDefSP = runPlayed(undefined, { innerWidth: 500 }); } catch(e){ rDefSP = { out: '', err: e }; }
try { rDefPC = runPlayed(undefined, { innerWidth: 1024 }); } catch(e){ rDefPC = { out: '', err: e }; }

ok(!rSP.err && !rPC.err, 'D0: buildPlayedHistoryHtml が例外なく評価できる');
ok(/^<details/.test(rSP.out) && !/ open>/.test(rSP.out), 'D1: isSP=true は既定折りたたみ（open なし）');
ok(/ open>/.test(rPC.out), 'D2: isSP=false（PC）は open で従来展開');
ok(/history-tag/.test(rSP.out), 'D3: 展開時の中身（history-tag）は保持');
ok(!rSP.mutated && !rPC.mutated, 'D4: 入力 sorted/played を書き換えない（データ不変）');
ok(!/ open>/.test(rDefSP.out), 'D5: isSP 省略＋innerWidth<600 は折りたたみ');
ok(/ open>/.test(rDefPC.out), 'D6: isSP 省略＋innerWidth>=600 は open');

console.log('MOBILE-PLAYED-LIST-COLLAPSE-001 テスト: PASS ' + PASS + '件 / FAIL ' + FAIL + '件');
process.exit(FAIL === 0 ? 0 : 1);
