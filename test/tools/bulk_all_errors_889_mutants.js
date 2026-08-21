#!/usr/bin/env node
// bulk_all_errors_889_mutants.js — BULK-EDIT-ALL-ERRORS-001 (#889) の変異生成
//
//   test_bulk_all_errors_pins_889.sh の③が使う。「pin が素で赤いだけ」を落とすため、
//   **狙った欠陥を1つだけ入れた** shogi_v4.html を作る。
//
//   ★ mut() は置換元の出現回数が 1 でなければ失敗させる（黙って0本作らない）。
//     #887 の生成器と同じ規律。錨は実装のコメント行を含めず、コード行だけで一意にする。
//
// 使い方: node test/tools/bulk_all_errors_889_mutants.js <target.html> <outDir>
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

// --- 錨（コード行のみ・コメントは含めない）-----------------------------------
const COLLECT = "        emptyIds[players[i].id]=1;\n        continue;";
const JOIN    = "emptyNos.join(' / ')+' の名前が空です。";
const DUPPUSH = "          dupMsgs.push(lo+' と '+hi+' の \"'+newName+'\" が重複しています。');";
const DUPKEY  = "          var lo=(me<you?me:you), hi=(me<you?you:me);\n          var key=lo+'|'+hi;\n          if(dupSeen[key])continue;\n          dupSeen[key]=1;";
const SKIP_I  = "      if(!newName)continue;   ";
const SKIP_J  = "        if(emptyIds[all[j].id])continue;\n";
const LABELFN = "function registeredPlayerLabels(){";
const GUARD   = "      showBulkEditError(blocks.join('\\n'));\n      return;\n";

// --- 変異 ---------------------------------------------------------------------
// M1: 1件目で走査を止める（#889 以前の挙動へ戻す）
mut('M1', COLLECT, "        emptyIds[players[i].id]=1;\n        break;");
// M2: 集めても1件目しか出さない
mut('M2', JOIN, "emptyNos[0]+' の名前が空です。");
// M3: 重複で行を名指ししない（#889 以前の文言へ戻す）
mut('M3', DUPPUSH, "          dupMsgs.push('\"'+newName+'\"が重複しています。');");
// M4: 同じ組の重複排除をやめる（入れ替えで2回出る）
mut('M4', DUPKEY, "          var lo=me, hi=you;\n          var key=lo+'|'+hi;");
// M5: 空欄の行を「自分側」で外すのをやめる（undefined と照合しに行く）
mut('M5', SKIP_I, "         ");
// M8: 空欄の行を「相手側」で外すのをやめる（★片側だけ外しても偽の重複は残る）
mut('M8', SKIP_J, "");
// M6: ラベル表を消す（他クラスの行が '--' になる）
mut('M6', LABELFN, "function registeredPlayerLabels_removed(){");
// M9: 文面を innerHTML で流し込む（氏名が入る＝実 XSS。run_tests.sh の除外の前提を壊す）
mut('M9', GUARD, "      var _s=document.querySelector('#bulk-err .bulk-err-body');\n      if(_s)_s.innerHTML=blocks.join('\\n');\n      document.getElementById('bulk-err').hidden=false;\n      return;\n");
// M7: 拒否をやめる（エラーは出すが保存が通る）
mut('M7', GUARD, "      showBulkEditError(blocks.join('\\n'));\n");

console.error('変異 ' + made + ' 本を生成: ' + outDir);
process.exit(bad > 0 ? 1 : 0);
