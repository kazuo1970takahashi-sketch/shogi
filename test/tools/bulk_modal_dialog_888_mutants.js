#!/usr/bin/env node
// bulk_modal_dialog_888_mutants.js — BULK-EDIT-DIALOG-001 (#888) の変異生成
//   狙った欠陥を1つだけ入れた shogi_v4.html を作る。mut() は置換元の出現回数が
//   1 でなければ失敗させる（黙って0本作らない）。#887/#889 の生成器と同じ規律。
// 使い方: node test/tools/bulk_modal_dialog_888_mutants.js <target.html> <outDir>
'use strict';
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'shogi_v4.html';
const outDir = process.argv[3];
if (!outDir) { console.error('使い方: node ' + path.basename(__filename) + ' <target.html> <outDir>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const base = fs.readFileSync(target, 'utf8');
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

// --- 錨（コード行のみ）--------------------------------------------------------
const ROLE   = "    modal.setAttribute('role','dialog');\n    modal.setAttribute('aria-modal','true');";
const LABEL  = "    if(head&&head.id)modal.setAttribute('aria-labelledby',head.id);";
const INERT  = "    try{ el.setAttribute('inert',''); _bulkModalInertedNodes.push(el); }catch(e){}";
const ESC    = "  if(k===27){ if(e.preventDefault)e.preventDefault(); requestCloseBulkEditModal(); return; }";
const TABWRAP= "  if(k!==9)return;\n  var items=_bulkModalFocusableIn(modal);";
const APPGUARD="  //   Escape を横取りすると確認ではなく一括編集が閉じ、Tab を巻き取ると「はい」に届かない。\n  if(document.getElementById('app-modal'))return;";
const TOUCH  = "    if(inp.value!==rec.name)return true;";
const NOFOCUS= "    var items=_bulkModalFocusableIn(m);\n    try{ if(items.length)items[0].focus(); }catch(e){}\n  });";
const UNINERT= "      try{ _bulkModalInertedNodes[i].removeAttribute('inert'); }catch(e){}";
const UNKEY  = "  try{ document.removeEventListener('keydown',_bulkModalKeydown,true); }catch(e){}";
// ★ 錨は **_bulk 側の直前行を含めて**一意にする。chg-modal 側に同じ1行があり、
//   素の1行だと「置換元の出現回数=2」で生成に失敗する（実測）。
const BACK   = "  _bulkModalFocusReturn=null;\n  // 戻し先が消えている（リセットで再描画された等）ときは何もしない＝例外にしない\n  try{ if(back&&document.body&&document.body.contains(back)&&back.focus)back.focus(); }catch(e){}";
const ORDER  = "  closeBulkEditModal();   // 開きっぱなしがあれば inert / keydown ごと畳んでから開く\n  _bulkModalFocusReturn=(document.activeElement&&document.activeElement!==document.body)?document.activeElement:null;";
const SAVECLOSE = "    closeBulkEditModal();   // ★ #888: 閉じ口を一本化（inert / keydown / vv 追従 / フォーカス戻し）";
const CANCELCLOSE = "    closeBulkEditModal();\n  });\n\n  document.getElementById('bulk-save')";

// --- 変異 ---------------------------------------------------------------------
mut('N1', ROLE, "");                                             // dialog セマンティクスを付けない
mut('N2', LABEL, "");                                            // aria-labelledby を付けない
mut('N3', INERT, "    void el;");                                // 背後を inert にしない
mut('N4', TABWRAP, "  if(k!==9)return;\n  return;\n  var items=_bulkModalFocusableIn(modal);"); // Tab の巻き取りをやめる
mut('N5', ESC, "  if(k===27){ return; }");                       // Esc を結線しない
mut('N6', TOUCH, "    if(false)return true;");                   // 触ったかを常に false ＝確認を挟まない
mut('N7', NOFOCUS, "  });");                                     // 「いいえ」でフォーカスを戻さない
mut('N8', UNINERT, "      void i;");                             // 閉じても inert を外さない
mut('N9', UNKEY, "  /* keydown を外さない */");                   // 閉じても keydown を外さない
mut('N10', BACK, "  _bulkModalFocusReturn=null;");               // 閉じてもフォーカスを戻さない
// ★ N11 は 2026-08-21 に実際に踏んだ順序バグ。掃除が戻し先を null に潰す。
mut('N11', ORDER, "  _bulkModalFocusReturn=(document.activeElement&&document.activeElement!==document.body)?document.activeElement:null;\n  closeBulkEditModal();");
mut('N12', APPGUARD, "  //   （割り込み回避を外した変異）");         // 確認が手前にあっても割り込む
mut('N13', SAVECLOSE, "    unbindBulkViewportFollow();\n    document.getElementById('bulk-edit-modal').remove();"); // 保存経路を remove() に戻す
mut('N14', CANCELCLOSE, "    unbindBulkViewportFollow();\n    document.getElementById('bulk-edit-modal').remove();\n  });\n\n  document.getElementById('bulk-save')"); // キャンセル経路を remove() に戻す

console.error('変異 ' + made + ' 本を生成: ' + outDir);
process.exit(bad > 0 ? 1 : 0);
