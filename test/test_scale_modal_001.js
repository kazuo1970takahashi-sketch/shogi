#!/usr/bin/env node
// SCALE-MODAL-001 (#767): 汎用確認モーダルのスクロール＋部分開始（FRP append）確認文の要約（大人数で OK が押せない対策）。
//   背景（2026-07-13 スケール監査 S3・実測 375×667）: .app-modal-box に max-height/overflow が無く、
//   buildFrpAppendConfirmMessage が全組の氏名を列挙するため、24組＋待機1名でモーダル高 789px > 画面 667px
//   ＝ OK/キャンセルが画面外・スクロール不能で操作不能になった。
//   対策: ① .app-modal-box に max-height:85vh;overflow-y:auto（appConfirm/appAlert/appPrompt 全部に効く CSS 1行）。
//        ② buildFrpAppendConfirmMessage を「N組（2N名）＋先頭5組＋…ほかM組＋待機」の要約形へ（5組以下は従来どおり全列挙）。
//   観点:
//     CSS. .app-modal-box ルールに max-height:85vh / overflow-y:auto がピン留めされている（YOMI 上書き確認等の長文も同 CSS で救済）。
//     SUM. 要約挙動: 5組以下=全列挙・「ほか」行なし（少人数の見た目不変）／6組以上=先頭5組＋「…ほかM組」1行／
//          待機行・末尾の非破壊文言（「作成済みの対局・結果は変更されません」）は人数によらず不変。
//     PIN. 呼び出し3箇所（onClickAppendFirstRound / onClickAddOneTable / onClickAddAllTables）の
//          appConfirm(buildFrpAppendConfirmMessage(...)) 結線が不変（IN-APP-MODAL-001 #606 の構造を壊していない）。
//   データは完全架空のみ。
var fs = require('fs');
var targetPath = process.argv[2] || 'shogi_v4.html';
var RAW = fs.readFileSync(targetPath, 'utf8');
var pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function count(hay, needle){ return hay.split(needle).length - 1; }

// ---- CSS. 汎用モーダル箱の箱内スクロール（1ルールに max-height と overflow-y が同居していること） ----
var boxRuleStart = RAW.indexOf('.app-modal-box{');
assert(boxRuleStart >= 0, 'CSS0 .app-modal-box ルールが存在');
var boxRule = (boxRuleStart >= 0) ? RAW.slice(boxRuleStart, RAW.indexOf('}', boxRuleStart)) : '';
assert(boxRule.indexOf('max-height:85vh') >= 0, 'CSS1 .app-modal-box に max-height:85vh');
assert(boxRule.indexOf('overflow-y:auto') >= 0, 'CSS2 .app-modal-box に overflow-y:auto');

// ---- 関数抽出（brace matching で buildFrpAppendConfirmMessage 単体を取り出し、getName を stub して実行） ----
function extractFunction(src, name){
  var idx = src.indexOf('function ' + name + '(');
  if(idx < 0) return null;
  var i = src.indexOf('{', idx);
  var depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(idx, i + 1); }
  }
  return null;
}
var fnSrc = extractFunction(RAW, 'buildFrpAppendConfirmMessage');
assert(!!fnSrc, 'EX1 buildFrpAppendConfirmMessage を抽出できる');
assert(count(RAW, 'function buildFrpAppendConfirmMessage(') === 1, 'EX2 buildFrpAppendConfirmMessage 単一定義');

var buildMsg = null;
if(fnSrc){
  // 架空氏名 stub: getName(id, cls) → '架空' + id
  var stubGetName = function(id){ return '架空' + id; };
  try{
    buildMsg = new Function('getName', fnSrc + '\nreturn buildFrpAppendConfirmMessage;')(stubGetName);
  }catch(e){ buildMsg = null; console.log('  FAIL: EX3 抽出関数の評価に失敗: ' + e.message); fail++; }
}

function mkPairs(n){
  var out = [];
  for(var i = 0; i < n; i++) out.push({p1:'p' + (i * 2 + 1), p2:'p' + (i * 2 + 2)});
  return out;
}
function pairLines(msg){
  return msg.split('\n').filter(function(l){ return l.indexOf('　・') === 0 && l.indexOf('…ほか') < 0; });
}

if(buildMsg){
  // SUM-A. 3組（少人数）: 全列挙・「ほか」行なし＝従来の見た目不変
  var m3 = buildMsg('A', mkPairs(3), null);
  assert(m3.indexOf('3組（6名）を1局目に追加します。') === 0, 'SUM-A1 見出し「3組（6名）」');
  assert(pairLines(m3).length === 3, 'SUM-A2 3組は全列挙（氏名行3）');
  assert(m3.indexOf('…ほか') < 0, 'SUM-A3 3組に「…ほか」行なし');
  assert(m3.indexOf('架空p1 vs 架空p2') >= 0, 'SUM-A4 氏名は getName 解決で列挙');
  assert(m3.indexOf('待機（未割当のまま残します）') < 0, 'SUM-A5 偶数（leftover なし）は待機行なし');
  assert(m3.indexOf('作成済みの対局・結果は変更されません。よろしいですか？') >= 0, 'SUM-A6 末尾の非破壊文言 不変');

  // SUM-B. 5組=閾値ちょうど: 全列挙・「ほか」なし
  var m5 = buildMsg('A', mkPairs(5), null);
  assert(pairLines(m5).length === 5 && m5.indexOf('…ほか') < 0, 'SUM-B1 5組は全列挙・「ほか」なし');

  // SUM-C. 6組=閾値+1: 先頭5組＋「…ほか1組」
  var m6 = buildMsg('A', mkPairs(6), null);
  assert(pairLines(m6).length === 5, 'SUM-C1 6組は先頭5組のみ列挙');
  assert(m6.indexOf('　・…ほか1組') >= 0, 'SUM-C2 「…ほか1組」行あり');

  // SUM-D. 24組＋待機1名（監査 S3 の実測ケース）: 行数が定数上限に収まり要素が揃う
  var mBig = buildMsg('A', mkPairs(24), {id:'p49'});
  assert(mBig.indexOf('24組（48名）を1局目に追加します。') === 0, 'SUM-D1 見出し「24組（48名）」');
  assert(pairLines(mBig).length === 5, 'SUM-D2 24組でも氏名行は5行');
  assert(mBig.indexOf('　・…ほか19組') >= 0, 'SUM-D3 「…ほか19組」行あり');
  assert(mBig.indexOf('待機（未割当のまま残します）：架空p49 1名') >= 0, 'SUM-D4 待機行 不変（氏名＋1名）');
  assert(mBig.indexOf('作成済みの対局・結果は変更されません。よろしいですか？') >= 0, 'SUM-D5 末尾の非破壊文言 不変');
  assert(mBig.split('\n').length <= 10, 'SUM-D6 全体行数が10行以下（375×667 でもボタンが画面内）');
  assert(mBig.indexOf('架空p11 vs 架空p12') < 0, 'SUM-D7 6組目以降の氏名は列挙されない');

  // SUM-E. 1組（onClickAddOneTable 相当）: 従来どおり
  var m1 = buildMsg('B', mkPairs(1), null);
  assert(m1.indexOf('1組（2名）を1局目に追加します。') === 0 && pairLines(m1).length === 1 && m1.indexOf('…ほか') < 0, 'SUM-E1 1組は従来どおり全列挙');
}

// ---- PIN. 呼び出し結線 不変（#606 の appConfirm 化を壊していない） ----
assert(count(RAW, 'appConfirm(buildFrpAppendConfirmMessage(cls,built.pairs,built.leftover),function(_ok){') === 3, 'PIN1 3関数とも appConfirm(buildFrpAppendConfirmMessage(...)) のまま');

console.log('SCALE-MODAL-001: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail > 0 ? 1 : 0);
