#!/usr/bin/env node
// RESET-MENU (当日第2弾⑩後半) → HEADER-TIDY-001 (#746 / ⑤c) で置き場所を追随。
//   意図（不変）: 危険な全リセット/進行リセットは常時表示せず1段深く置き、誤タップを防ぐ。
//   id は不変＝既存 resetAll/resetTournamentProgressOnly 結線を温存。
//   旧: ⋯ドロップダウン（dangerMenu）配下 → 新: ☰ボトムシート（#header-menu-sheet）配下。
// 読込は共通ヘルパへ集約 [PHASE1-LOADER-001]（同じ全束を1コンテキストで評価する・意味論不変）
const {loadApp,readHtml}=require('./lib/app_harness');
const RAW=readHtml();
function makeEnv(){const app=loadApp();return {env:app.ctx,els:app.els};}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== マークアップ（RAW） ===');
ok(RAW.indexOf('id="headerMenuBtn"')>=0,'M1 ☰メニュー開閉ボタン');
ok(/id="header-menu-sheet"[^>]*style="display:none"/.test(RAW),'M2 シートは既定で非表示');
ok(/id="header-menu-sheet"[\s\S]*?id="resetProgressBtn"[\s\S]*?id="resetBtn"/.test(RAW),'M3 シート内に両リセットを内包（id 不変）');
ok(RAW.indexOf('id="resetBtn"')>=0 && RAW.indexOf('id="resetProgressBtn"')>=0,'M4 既存 id を保持（resetAll/resetProgress 結線温存）');
// ヘッダ常時表示に裸の危険ボタンが残っていない（1段深く）= シートより前に resetBtn が出ない
ok(RAW.indexOf('id="header-menu-sheet"')>=0 && RAW.indexOf('id="header-menu-sheet"')<RAW.indexOf('id="resetBtn"'),'M5 危険ボタンは header-menu-sheet 配下に退避');
var hmBtnTag=(function(){var p=RAW.indexOf('id="headerMenuBtn"');if(p<0)return '';return RAW.slice(RAW.lastIndexOf('<button',p),RAW.indexOf('>',p)+1);})();
ok(hmBtnTag.indexOf('aria-haspopup="dialog"')>=0&&hmBtnTag.indexOf('aria-expanded=')>=0,'M6 a11y 属性（haspopup=dialog/expanded）');
// 危険グループの説明文言（誤タップ防止の教育文言）を維持
ok(RAW.indexOf('危険な操作（元に戻すで1回分復旧できます）')>=0,'M7 危険グループの説明文言を維持');
// 旧⋯ドロップダウンの残骸が無い（二重メニュー禁止）
ok(RAW.indexOf('id="dangerMenuWrap"')<0 && RAW.indexOf('id="dangerMenuBtn"')<0 && RAW.indexOf('id="dangerMenu"')<0,'M8 旧 dangerMenu 系が撤去済み');

console.log('=== 開閉ロジック ===');
ok(/function toggleHeaderMenu\(/.test(RAW)&&/function bindHeaderMenuEvents\(/.test(RAW),'L1 開閉/結線関数');
ok(/function bindHeaderEvents\(\)\{[\s\S]*?bindHeaderMenuEvents\(\)/.test(RAW),'L2 bindHeaderEvents から結線呼び出し');
ok(!/function toggleDangerMenu\(/.test(RAW)&&!/function bindDangerMenuEvents\(/.test(RAW),'L2b 旧 toggleDangerMenu/bindDangerMenuEvents が撤去済み');
var E=makeEnv();
E.env.toggleHeaderMenu();   // 既定 display='' は閉扱い→開く（getElementById が遅延生成）
ok(E.els['header-menu-sheet'].style.display==='block','L3 初回トグルで開く');
ok(E.els['headerMenuBtn'].getAttribute('aria-expanded')==='true','L4 aria-expanded=true');
E.env.toggleHeaderMenu();
ok(E.els['header-menu-sheet'].style.display==='none','L5 再トグルで閉じる');
E.env.toggleHeaderMenu(true);
ok(E.els['header-menu-sheet'].style.display==='none'&&E.els['headerMenuBtn'].getAttribute('aria-expanded')==='false','L6 forceClose で確実に閉じる');

console.log('RESET-MENU(HEADER-TIDY-001): PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
