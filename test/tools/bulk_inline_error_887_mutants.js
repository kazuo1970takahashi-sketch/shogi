#!/usr/bin/env node
// =============================================================================
// bulk_inline_error_887_mutants.js — BULK-EDIT-INLINE-ERROR-001 (#887) の変異生成
//
//   test_bulk_inline_error_pins_887.sh の ③ と
//   test/tools/bulk_inline_error_887_mutation_check.sh が使う。
//   ★ 置換文字列の出現回数が 1 であることを assert してから当てる。
//   ★ 変異ファイルは repo に置かない（1本 ~1.1MB）。実行時に tmp へ生成する。
//
// 使い方: node test/tools/bulk_inline_error_887_mutants.js <target.html> <outDir>
// 終了コード: 0=全変異を生成 / 1=置換元が一意でない等
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const outDir = process.argv[3];
if (!target || !outDir) { console.error('usage: node ' + path.basename(__filename) + ' <target.html> <outDir>'); process.exit(1); }
const base = fs.readFileSync(target, 'utf8');
fs.mkdirSync(outDir, { recursive: true });

let made = 0, bad = 0;
function mut(name, old, neu) {
  const parts = base.split(old);
  if (parts.length - 1 !== 1) {
    console.error('!! ' + name + ' 置換元の出現回数=' + (parts.length - 1) + '（1でない）');
    bad++; return;
  }
  fs.writeFileSync(path.join(outDir, 'mut_' + name + '.html'), parts[0] + neu + parts[1], 'utf8');
  made++;
}

const SCROLL_SHOW = "  var cardEl=slot.parentNode;\n  if(cardEl){\n    fitBulkCardToViewport();\n    try{ cardEl.lastElementChild.scrollIntoView({block:'nearest'}); }catch(e){}\n  }\n";
const SLOT = '<div id="bulk-err" class="bulk-err" role="alert" aria-live="assertive" hidden>';
const CSS_ERR = '.bulk-err{margin:0 0 12px;padding:8px 10px;border-radius:6px;font-size:13px;line-height:1.5;background:#fdecea;color:#a50e0e;border:1px solid #d93025}';
const CSS_BODY = '.bulk-err-body{white-space:pre-line;overflow-wrap:anywhere}';
const CSS_CARD = '.bulk-card{max-height:80vh;overflow-y:auto}';
const CARD_TAG = 'return \'<div class="bulk-card" style="background:#fff;border-radius:12px;padding:24px;width:360px;">\'';
const HEAD = '<strong class="bulk-err-head">\\u26a0 変更を保存しませんでした</strong>';
const MSG1 = "showBulkEditError(cls+entryNoOf(cls,players[i].id)+' の名前が空です。\\n名前を入力してから保存してください。')";
const MSG2 = "showBulkEditError('\"'+newName+'\"が重複しています。\\n別の名前に直してください。')";
const KBD_RESET = "    if(!isBulkKbdActive()){ cardEl.style.alignSelf=''; cardEl.style.marginTop=''; cardEl.style.maxHeight=''; return; }\n";

// --- 静的 pin が殺すべきもの -------------------------------------------------
mut('S1', SCROLL_SHOW, "  var cardEl=slot.parentNode;\n  if(cardEl){\n    fitBulkCardToViewport();\n  }\n");           // 送り先ごと消す
mut('S6', SCROLL_SHOW, "  var cardEl=slot.parentNode;\n  if(cardEl){\n    fitBulkCardToViewport();\n    try{ cardEl.firstElementChild.scrollIntoView({block:'nearest'}); }catch(e){}\n  }\n"); // 送り先をカード先頭へ
mut('S2', CSS_ERR, CSS_ERR.replace('#fdecea', '#fff7e6').replace('#a50e0e', '#7a4a00').replace('#d93025', '#f5d490'));
mut('S3', SLOT, '<div id="bulk-err" class="bulk-err" hidden>');                              // role も aria-live も消す
mut('S3r', SLOT, '<div id="bulk-err" class="bulk-err" aria-live="assertive" hidden>');       // role だけ消す
mut('S3a', SLOT, '<div id="bulk-err" class="bulk-err" role="alert" hidden>');                // ★ aria-live だけ消す（#881 4巡目の学び）
mut('S4', '  slotBody.textContent=msg;', '  slotBody.innerHTML=msg;');
mut('S4h', '  slotBody.textContent=msg;', "  slot.querySelector('.bulk-err-body').innerHTML=msg;");
// ★ S4hh は実 XSS（氏名が .bulk-err-head の innerHTML に流れる）。Q4 の否定項が head を含まないと素通りする
mut('S4hh', '  slotBody.textContent=msg;', "  slot.querySelector('.bulk-err-head').innerHTML='\\u26a0 '+msg;\n  slotBody.textContent='';");
mut('S5', HEAD, '');                                                                          // 見出し語を消す
mut('S8', 'function clearBulkEditError(){', 'function clearBulkEditError_removed(){');         // clear の定義を消す
mut('S18', 'function showBulkEditError(msg){\n  var slot=', 'function showBulkEditError(msg){\n  alert(msg); return;\n  var slot=');  // show を alert に戻す
mut('S9', MSG1, "showBulkEditError(cls+entryNoOf(cls,players[i].id)+' の名前が空です。')");     // 次の行動を消す
mut('S9b', MSG1, "showBulkEditError((i+1)+'番目の名前が空です。\\n名前を入力してから保存してください。')"); // ★ entry_no を配列 index に戻す(=S13 相当)
mut('S10', MSG2, "showBulkEditError('\"'+newName+'\"が重複しています。')");                    // 次の行動を消す
mut('S10b', MSG2, "showBulkEditError('\"'+newName+'\"が重なっています。\\n別の名前に直してください。')"); // 主文を壊す
mut('S11', CSS_CARD, '.bulk-card{overflow-y:auto}');                                          // クラスから max-height を消す
mut('S11b', CARD_TAG, 'return \'<div class="bulk-card" style="background:#fff;border-radius:12px;padding:24px;width:360px;max-height:80vh;">\''); // inline へ書き戻す
mut('S12b', KBD_RESET, '');                                                                   // 非活性時のリセットを消す
mut('S12c', 'function isBulkKbdActive(){', 'function isBulkKbdActive_removed(){');             // 判定ごと消す
mut('S15', CSS_BODY, '.bulk-err-body{white-space:pre-line}');                                  // overflow-wrap を消す

// --- 動的な検査が殺すもの（③では pin 対象外） --------------------------------
mut('D1', '\n  slot.hidden=false;\n', '\n');
mut('D2', "      inp.addEventListener('input',function(){ clearBulkEditError(); });\n", '');
mut('D3', '  if(!slot){ alert(msg); return; }\n', '  if(!slot){ return; }\n');
mut('D4', '    fitBulkCardToViewport();\n    try{ cardEl.lastElementChild', '    try{ cardEl.lastElementChild');
mut('D5', "  bindBulkViewportFollow();   // ★ STYLE-GUIDE §10.4「表示直後＋visualViewport の resize/scroll」\n", '');
mut('S12', 'return (window.innerHeight-vv.height*(vv.scale||1))>BULK_KBD_SHRINK_PX;', 'return true;');
// ★ ガードが止めなくなる変異（保存を拒否しなくなる）。静的 pin では殺せない。
mut('R1', "名前を入力してから保存してください。');hasError=true;break;}", "名前を入力してから保存してください。');break;}");
mut('R2', "別の名前に直してください。');hasError=true;break;", "別の名前に直してください。');break;");

// ★ ⑤（担当変異ゼロの pin を落とす段）が要求した追加分。
//   これらが無いと Q4a / Q13a / Q13b は「一度も試されていない項」になる。
mut('S4b', "  var slotBody=slot.querySelector('.bulk-err-body');\n  if(!slotBody){ alert(msg); return; }\n",
           "  var slotBody=slot.lastElementChild;\n  if(!slotBody){ alert(msg); return; }\n");  // 本文の掴み方をセレクタ以外に
mut('S21', "    vv.addEventListener('resize',_bulkVvHandler);\n", '');   // resize だけ外す
mut('S22', "    vv.addEventListener('scroll',_bulkVvHandler);\n", '');   // scroll だけ外す

// ★★ 「検査を壊す実験」が要求した追加分（実測）:
//   Q4 は否定項を2本持つが、S4hh は**両方**で赤くなるので、どちらか一方を消しても4段が緑のままだった
//   （#881 の X3 / X3r と同じ型＝2本の変異が同じ条件で赤くなると、その条件の一部が守られない）。
//   → 各否定項を**単独で**赤にする変異を1本ずつ持つ。
// S4x: API の**外**からセレクタ経由で innerHTML に流す（scope_api の否定は見えない。将来スライスの実リスク）
mut('S4x', "      inp.addEventListener('input',function(){ clearBulkEditError(); });\n",
           "      inp.addEventListener('input',function(){ clearBulkEditError(); document.querySelector('.bulk-err-body').innerHTML=''; });\n");
// S4y: API の**中**でセレクタを経由せず innerHTML を触る（ファイル全体の否定は見えない）
mut('S4y', "  slot.hidden=false;\n  var cardEl=slot.parentNode;",
           "  slot.hidden=false;\n  slot.innerHTML=slot.innerHTML;\n  var cardEl=slot.parentNode;");

// ★ 3巡目パネルの実測で足した2本:
//   S4hh2: S4hh は肯定項（slotBody.textContent=msg）でも死ぬため、Q4 の否定項 head 側の
//          **単独の kill 証拠が無かった**。textContent を保持したまま API の外から head へ流す
//          （input リスナー経由・実 XSS の形）。
mut('S4hh2', "      inp.addEventListener('input',function(){ clearBulkEditError(); });\n",
             "      inp.addEventListener('input',function(){ clearBulkEditError(); document.querySelector('.bulk-err-head').innerHTML=inp.value; });\n");
//   S6b: scrollIntoView の値 nearest→center。値を守る kill 証拠が無く、center はスクロール位置が
//        毎回ジャンプする UX 劣化なのに e2e も 51/0 素通りだった。
mut('S6b', "cardEl.lastElementChild.scrollIntoView({block:'nearest'}); }catch(e){}\n  }\n}\n\nfunction clearBulkEditError",
           "cardEl.lastElementChild.scrollIntoView({block:'center'}); }catch(e){}\n  }\n}\n\nfunction clearBulkEditError");

if (bad) { console.error('変異生成に失敗: ' + bad + ' 件'); process.exit(1); }
console.log('変異 ' + made + ' 本を生成: ' + outDir);
