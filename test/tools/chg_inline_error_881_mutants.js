#!/usr/bin/env node
// =============================================================================
// chg_inline_error_881_mutants.js — CHG-MODAL-INLINE-ERROR-001 (#881) の変異生成
//
//   test_chg_inline_error_pins_881.sh の ③（各変異に対して狙った pin が赤）で使う。
//   ★ 置換文字列の出現回数が 1 であることを assert してから当てる。
//     （#877 で同じ1行が #759 側にもあり、意図と違う場所を壊したまま緑になった反省）
//   ★ 変異ファイルは repo に置かない（1本 ~1.1MB × 19）。実行時に tmp へ生成する。
//
// 使い方: node test/tools/chg_inline_error_881_mutants.js <target.html> <outDir>
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
// 生成後にもう一段変形するもの
function tweak(name, old, neu) {
  const p = path.join(outDir, 'mut_' + name + '.html');
  const t = fs.readFileSync(p, 'utf8');
  const parts = t.split(old);
  if (parts.length - 1 !== 1) { console.error('!! ' + name + '(tweak) 出現回数=' + (parts.length - 1)); bad++; return; }
  fs.writeFileSync(p, parts[0] + neu + parts[1], 'utf8');
}

const SCROLL = "    try{ card.lastElementChild.scrollIntoView({block:'nearest'}); }catch(e){}\n";
const SLOT = '<div id="chg-err" class="chg-err" role="alert" aria-live="assertive" hidden>';
const CSS_ERR = '.chg-err{margin:0 0 12px;padding:8px 10px;border-radius:6px;font-size:13px;line-height:1.5;background:#fdecea;color:#a50e0e;border:1px solid #d93025}';
const CSS_CARD = '[data-chg-card="1"][data-chg-err="1"]{max-height:85vh;overflow-y:auto}';
const HEAD = '<strong class="chg-err-head">⚠ 変更を保存しませんでした</strong>';

// --- 静的 pin が殺すべきもの -------------------------------------------------
mut('X1', SCROLL, '');                                              // 送り先ごと消す
mut('X5', SCROLL, "    try{ el.scrollIntoView({block:'nearest'}); }catch(e){}\n"); // 送り先を警告に戻す
mut('X2', CSS_ERR, CSS_ERR.replace('#fdecea', '#fff7e6').replace('#a50e0e', '#7a4a00').replace('#d93025', '#f5d490'));
mut('X3', SLOT, '<div id="chg-err" class="chg-err" hidden>');        // role も aria-live も消す
mut('X3r', SLOT, '<div id="chg-err" class="chg-err" aria-live="assertive" hidden>'); // role だけ消す
//   ★ Codex P2 (r3790647891): X3・X3r はどちらも role を消すので、P3 から aria-live の grep を
//     取り除いても両方 role 条件で赤くなり、自己検査が気づけない（Codex が実測）。
//     → **role を残して aria-live だけを落とす**独立変異を足す。
mut('X3a', SLOT, '<div id="chg-err" class="chg-err" role="alert" hidden>'); // aria-live だけ消す
mut('X4', '  body.textContent=text;\n', '  body.innerHTML=text;\n');
mut('X4h', '  body.textContent=text;\n', "  el.querySelector('.chg-err-head').innerHTML='\\u26a0 '+text;\n  body.textContent='';\n");
mut('X7', "  if(card)card.removeAttribute('data-chg-err');\n", '');  // 属性を消さない
mut('M3b', CSS_CARD, '[data-chg-card="1"][data-chg-err="1"]{overflow-y:auto}');
mut('M3c', CSS_CARD, '[data-chg-card="1"][data-chg-err="1"]{max-height:100vh;max-height:100dvh;overflow-y:auto}');
mut('M7', HEAD, '');                                                 // 見出し語を消す

// --- 動的な検査が殺すもの（③では pin 対象外） --------------------------------
mut('M1', '  body.textContent=text;\n  el.hidden=false;\n', '  body.textContent=text;\n');
mut('M2', "  if(_chgSel1)_chgSel1.addEventListener('change',function(){ clearChangePairingError(); });\n", '');
mut('M2b', "  if(_chgSel2)_chgSel2.addEventListener('change',function(){ clearChangePairingError(); });\n", '');
mut('M4', '  if(!el){ alert(text); return; }\n', '  if(!el){ return; }\n');
mut('M5', '変更がありません。\\n', '変更がありません.\\n');
mut('M8', 'data-chg-empty-notice="1"', 'data-chg-empty-notice-removed="1"');
mut('N4', 'background:#fff7e6;border:1px solid #f5d490;border-radius:6px;font-size:12px;color:#7a4a00',
          'background:#fdecea;border:1px solid #d93025;border-radius:6px;font-size:12px;color:#a50e0e');
// X6: 器をカードの最上部へ移す（位置の pin が無いと生き残る）
mut('X6', '<h3 style="margin-bottom:12px;font-size:16px;color:#1F3864">対戦相手の変更</h3>',
          '<h3 style="margin-bottom:12px;font-size:16px;color:#1F3864">対戦相手の変更</h3>');
tweak('X6', "    +'" + SLOT + HEAD + '<span class="chg-err-body"></span></div>\'\n', '');
tweak('X6', "+'<h3 style=\"margin-bottom:12px;font-size:16px;color:#1F3864\">対戦相手の変更</h3>'\n",
            "+'<h3 style=\"margin-bottom:12px;font-size:16px;color:#1F3864\">対戦相手の変更</h3>'\n"
            + "    +'" + SLOT + HEAD + '<span class="chg-err-body"></span></div>\'\n');


// --- ★ Codex P2 (r3790501526): 9件の `return` を1つずつ落とす変異 -------------
//   「警告を出したまま処理が続行する」を殺せるのは動的検査だけ（appConfirm が非同期なので
//   state と modal の不変では殺せない）。R1〜R9 は e2e が赤になることで実証する。
const MSGS = [
  ['R1', "同じ参加者を先手・後手の両方には選べません。"],
  ['R2', "変更がありません。"],
  ['R3', "この変更では、2人を同時に入れ替える必要があります。"],
  ['R4', "この参加者は棄権しています。"],
  ['R5', "この対局には棄権した参加者が残ります。"],
  ['R6', "相手ペアが結果入力済みのため、入れ替えできません。"],
  ['R7', "この入れ替えでは、棄権した参加者が別の卓に移るだけです。"],
  ['R8', "入れ替え先の卓に棄権した参加者がいます。"],
  ['R9', "この変更を行うと、再戦になる組み合わせが発生します。"]
];
//   ★ Codex P2 (r3790541886): 「最初に見つかった位置から400文字以内の最初の return;」は
//     別 callback の return; を掴み得る。**呼び出し全体＋直後の return; を1つの文字列**にして
//     `mut()` に通す（＝出現回数1を assert する）。
MSGS.forEach(function (m) {
  const name = m[0], head = m[1];
  const i = base.indexOf("showChangePairingError('" + head);
  if (i < 0) { console.error('!! ' + name + ' 呼び出しが見つからない'); bad++; return; }
  // 呼び出しの終端（'); まで）を求める
  const end = base.indexOf("');", i);
  if (end < 0) { console.error('!! ' + name + ' 呼び出しの終端が見つからない'); bad++; return; }
  const callEnd = end + 3;
  // その直後の空白（改行・インデント）だけを跨いで return; が来ることを要求する
  const rest = base.slice(callEnd);
  const mm = rest.match(/^(\s*)return;/);
  if (!mm) {
    console.error('!! ' + name + ' 呼び出しの直後（空白のみ跨いだ位置）に return; が無い');
    bad++; return;
  }
  const whole = base.slice(i, callEnd) + mm[1] + 'return;';
  // ★ mut() が「この文字列が全体で1回だけ」を assert する
  mut(name, whole, base.slice(i, callEnd) + mm[1] + '/*R*/');
});

if (bad) { console.error('変異生成に失敗: ' + bad + ' 件'); process.exit(1); }
console.log('変異 ' + made + ' 本を生成: ' + outDir);
