#!/usr/bin/env node
// SCORE-GRID-FOLD-001 (#944) 受入テスト（構造＋純関数の実行）。
//   目的: 暫定成績を <details> に格納する（モバイル既定=畳む／PC=open）。
//   ★ 畳んでよい根拠: 同じ内容が最終結果タブと星取表にもある＝対局管理では参照系。
//     2026-08-24 に作者が「畳む」を承認済み（削り7件の1件目）。
//   ★ #661（MOBILE-PLAYED-LIST-COLLAPSE-001）と同じ型なので、判定も同じ流儀にしている。
//   不変条件: 中身（.score-grid の各カード）は1文字も変えない。順位計算・データ層は無改変。
//   データは完全架空のみ。shogi_v4.html 本体は変更しない（本ファイルは test/ のみ）。
//
// 使い方: node test/test_score_grid_fold_944.js shogi_v4.html

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
  const start = src.indexOf('function ' + name + '(');
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

const fn = extractFunction(code, 'buildScoreGridHtml');
const noSpace = (fn || '').replace(/\s+/g, '');
ok(!!fn, 'buildScoreGridHtml 関数が存在する');

// ---- A. 構造 ----
ok(noSpace.indexOf("<detailsclass=\"score-grid-details\"") >= 0, 'A1: details に格納（class=score-grid-details）');
ok(noSpace.indexOf('<summary') >= 0 && /暫定成績/.test(fn || ''), 'A2: summary の見出しは「暫定成績」');
ok(/タップで開閉/.test(fn || ''), 'A3: summary に開閉できることを書く（#661 と同じ文言の型）');
ok(noSpace.indexOf("(isSP?'':'open')") >= 0, 'A4: open 属性は isSP で条件化（PC のみ open）');
ok(/#1F3864/.test(fn || ''), 'A5: summary は primary #1F3864 を流用（新色を足さない）');
// ★ 見出しが二重にならないこと。summary が h3 の役目を引き継ぐ。
ok(!/<h3>/.test(fn || ''), 'A6: h3 の見出しは出さない（summary が引き継ぐ＝見出しが二重にならない）');
// ★ 開閉は native disclosure。JS の開閉ハンドラを足していない。
ok(!/addEventListener|onclick|\.open\s*=/.test(fn || ''), 'A7: 開閉の JS を足していない（native disclosure）');
ok(/class="score-grid"/.test(fn || ''), 'A8: 中身の .score-grid は残っている（CSS の当たり先を変えない）');

// ---- B. 組立順（#661 の C と同じ不変条件を壊していない） ----
const renderFn = extractFunction(code, 'renderTournament');
const iCurrent = (renderFn || '').indexOf('html+=buildCurrentPairingsHtml');
const iScore   = (renderFn || '').indexOf('html+=buildScoreGridHtml');
const iPlayed  = (renderFn || '').indexOf('html+=buildPlayedHistoryHtml');
ok(iCurrent > 0 && iScore > 0 && iPlayed > 0, 'B0: 組立が存在する');
ok(iCurrent < iScore, 'B1: 現在の組み合わせ < 暫定成績（#661 C1 の不変条件）');

// ---- C. 純関数として実行する（構造を読むだけにしない） ----
function run(isSP, win){
  const sandbox = {
    escapeHtml: function(x){ return String(x == null ? '' : x); },
    getName: function(id, cls){ return '氏名' + id; },
    entryNoOf: function(cls, id){ return id; },
    state: { results: { A: [ [ {p1:1,p2:2,winner:1} ] ] } }
  };
  if(win !== undefined) sandbox.window = win;
  vm.createContext(sandbox);
  const f = vm.runInContext('(' + fn + ')', sandbox);
  const sorted = [{ id: 1 }, { id: 2 }];
  const wins = { 1: 1, 2: 0 };
  const sBefore = JSON.stringify(sorted), wBefore = JSON.stringify(wins);
  const out = f('A', sorted, wins, isSP);
  return { out: out, mutated: (JSON.stringify(sorted) !== sBefore) || (JSON.stringify(wins) !== wBefore) };
}

let rSP, rPC, rDefSP, rDefPC;
try { rSP = run(true); } catch(e){ rSP = { out: '', err: e }; }
try { rPC = run(false); } catch(e){ rPC = { out: '', err: e }; }
try { rDefSP = run(undefined, { innerWidth: 500 }); } catch(e){ rDefSP = { out: '', err: e }; }
try { rDefPC = run(undefined, { innerWidth: 1024 }); } catch(e){ rDefPC = { out: '', err: e }; }

ok(!rSP.err && !rPC.err, 'C0: 純関数として実行できる' + (rSP.err ? '（' + rSP.err.message + '）' : ''));
ok(/^<details class="score-grid-details"[^>]*>/.test(rSP.out) && rSP.out.indexOf(' open>') < 0,
   'C1: isSP=true は畳んだ状態（open を付けない）');
ok(rPC.out.indexOf(' open>') >= 0, 'C2: isSP=false は open');
ok(rDefSP.out.indexOf(' open>') < 0, 'C3: isSP 省略＋幅500 は畳む（window 幅で判定）');
ok(rDefPC.out.indexOf(' open>') >= 0, 'C4: isSP 省略＋幅1024 は open');
ok(!rSP.mutated && !rPC.mutated, 'C5: sorted / wins を書き換えない（read-only）');

// ---- D. ★中身が1文字も変わっていない ----
//   畳みは「見せ方」だけの変更。.score-grid の中身が変わっていたら、
//   それは畳み以外のことをしている＝このスライスの範囲を出ている。
function inner(out){
  const i = out.indexOf('<div class="score-grid"');
  const j = out.lastIndexOf('</div></details>');
  if(i < 0 || j < 0) return null;
  return out.slice(out.indexOf('>', i) + 1, j);
}
const innerSP = inner(rSP.out), innerPC = inner(rPC.out);
ok(innerSP !== null && innerSP === innerPC, 'D1: 中身は isSP に関係なく同一（開閉だけの違い）');
ok(innerSP !== null && /<div class="score-card">/.test(innerSP), 'D2: 中身は従来どおり score-card の並び');
ok(innerSP !== null && (innerSP.match(/<div class="score-card">/g) || []).length === 2,
   'D3: 参加者2人ぶんのカードが出る（実測 ' + (innerSP ? (innerSP.match(/<div class="score-card">/g) || []).length : '-') + '件）');
ok(innerSP !== null && /<div class="sno">/.test(innerSP) && /<div class="snm">/.test(innerSP)
   && /<div class="swins">/.test(innerSP) && /1勝0敗/.test(innerSP),
   'D4: 番号・氏名・勝数・勝敗数の4要素が従来どおり出る');

console.log('SCORE-GRID-FOLD-001: PASS=' + PASS + ', FAIL=' + FAIL);
process.exit(FAIL > 0 ? 1 : 0);
