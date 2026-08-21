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

// ★ 行単位のアンカー（if ブロック全体だと Codex P2 の追記で count=0 になった）。
//   onBulkViewportChange 側は `if(cardEl){ try{` の1行書きなので、4空白+try 始まりのこの行は一意。
const SCROLL_SHOW = "    try{ cardEl.lastElementChild.scrollIntoView({block:'nearest'}); }catch(e){}\n";
const SLOT = '<div id="bulk-err" class="bulk-err" role="alert" aria-live="assertive" hidden>';
const CSS_ERR = '.bulk-err{margin:0 0 12px;padding:8px 10px;border-radius:6px;font-size:13px;line-height:1.5;background:#fdecea;color:#a50e0e;border:1px solid #d93025}';
const CSS_BODY = '.bulk-err-body{white-space:pre-line;overflow-wrap:anywhere}';
const CSS_CARD = '.bulk-card{max-height:80vh;overflow-y:auto}';
const CARD_TAG = 'return \'<div class="bulk-card" style="background:#fff;border-radius:12px;padding:24px;width:360px;">\'';
const HEAD = '<strong class="bulk-err-head">\\u26a0 変更を保存しませんでした</strong>';
// ★ #889 で報告が「全件を集めて1回で出す」に変わり、文言は組み立ての中へ移った。
//   #887 の変異が見る性質（entry_no で名指し／次の行動／主文）は同じなので、錨だけ張り替える。
const MSG1_NO = "        emptyNos.push(cls+entryNoOf(cls,players[i].id));";
const MSG1_ACT = "emptyNos.join(' / ')+' の名前が空です。\\n名前を入力してから保存してください。'";
const MSG2_ACT = "dupMsgs.join('\\n')+'\\n別の名前に直してください。'";
const MSG2_HEAD = "dupMsgs.push(lo+' と '+hi+' の \"'+newName+'\" が重複しています。');";
const KBD_RESET = "    if(!isBulkKbdActive()){ cardEl.style.alignSelf=''; cardEl.style.marginTop=''; cardEl.style.maxHeight=''; return; }\n";

// --- 静的 pin が殺すべきもの -------------------------------------------------
mut('S1', SCROLL_SHOW, "");           // 送り先ごと消す
mut('S6', SCROLL_SHOW, "    try{ cardEl.firstElementChild.scrollIntoView({block:'nearest'}); }catch(e){}\n"); // 送り先をカード先頭へ
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
mut('S9', MSG1_ACT, "emptyNos.join(' / ')+' の名前が空です。'");                  // 次の行動を消す
mut('S9b', MSG1_NO, "        emptyNos.push((i+1)+'番目');");                      // ★ entry_no を配列 index に戻す(=S13 相当)
mut('S10', MSG2_ACT, "dupMsgs.join('\\n')");                                     // 次の行動を消す
mut('S10b', MSG2_HEAD, "dupMsgs.push(lo+' と '+hi+' の \"'+newName+'\" が重なっています。');"); // 主文を壊す
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
// ★ #889 でガードが1か所（空欄・重複をまとめて拒否する if）に集約された。
//   R1 = 拒否そのものをやめる（空欄でも保存が通る）／R2 = 重複だけ拒否条件から外す。
//   ガードが2つあった頃と同じ2方向（B1 側・B2 側）を保つ。
mut('R1', "      showBulkEditError(blocks.join('\\n'));\n      return;\n", "      showBulkEditError(blocks.join('\\n'));\n");
mut('R2', "    if(emptyNos.length||dupMsgs.length){", "    if(emptyNos.length){");

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
mut('S6b', SCROLL_SHOW, "    try{ cardEl.lastElementChild.scrollIntoView({block:'center'}); }catch(e){}\n");

// ★ Codex P2 (r3791051326) の直しを守る変異: フォーカス欄への nearest 戻しを消す。
//   可視域140pxの場面でしか差が出ないので動的担当（e2e [I1] が殺す）。
mut('D6', "    if(isBulkKbdActive()&&ae&&ae.id&&ae.id.indexOf('bulk-name-')===0)ae.scrollIntoView({block:'nearest'});\n", "\n");
// ★ Codex 2巡目 P2 (r3791152825): 追従ハンドラ側のフォーカス戻しを消す（vv イベントで -11..33 が再発）
mut('D7', "    restoreBulkFocusedInput();\n  }catch(e){}\n}\nfunction _bulkVvHandler", "  }catch(e){}\n}\nfunction _bulkVvHandler");
// ★ Codex 2巡目 P2 (r3791152831): 開いた時点でキーボードが既に出ている場合の fit を消す
// ★ 最初の D8 は**コメントだけ書き換えて呼び出しを残す**「変異になっていない変異」で、
//   e2e 57/0 素通りだった（このチェック自体が捕まえた）。呼び出しの行を消す形に直した。
mut('D8', "。表示直後に1回自分で回す。\n  fitBulkCardToViewport();\n", "。表示直後に1回自分で回す。\n");

if (bad) { console.error('変異生成に失敗: ' + bad + ' 件'); process.exit(1); }
console.log('変異 ' + made + ' 本を生成: ' + outDir);
