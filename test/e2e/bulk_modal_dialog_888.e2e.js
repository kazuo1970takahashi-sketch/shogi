#!/usr/bin/env node
// Playwright E2E: BULK-EDIT-DIALOG-001 (#888)
//   一括編集モーダルに dialog の作法と閉じ口を入れた便。#837 (chg-modal) の移植。
//
// ★ 実測で確かめること（ソース検査ではなく実ブラウザで）:
//   1. role=dialog / aria-modal=true / aria-labelledby が見出しを指す
//   2. 背後（body 直下の兄弟）が inert。モーダル自身には付かない
//   3. Tab / Shift+Tab が**モーダル内で循環する**（改修前は6回で外へ出た）
//   4. Esc … 触っていなければ閉じる／触っていれば確認を挟む（作者裁定 2026-08-21）
//   5. 背景クリックでは閉じない（同上）
//   6. 閉じたら inert も keydown も残らない・フォーカスが呼び出し元へ戻る
//   7. リセット経路・保存経路で閉じても同じ（閉じ口の一本化）
//
// ★ 測り方の注意:
//   - 「listener が残っていないか」は、閉じたあと **Tab が巻き取られないこと**で測る
//     （関数の有無を見ても、外し忘れは検出できない）
//   - 確認（appConfirm）が手前にある間は #888 の keydown が割り込まないことも測る
//
// 使い方: node test/e2e/bulk_modal_dialog_888.e2e.js [shogi_v4.html or URL]
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

const seed = (n) => `(function(){
  var A=[];
  for(var i=1;i<=${n};i++)A.push({id:'a'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'});
  state={players:{A:A,B:[]},rounds:4,results:{A:[],B:[]},pairings:{A:[],B:[]},started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],report:{}};
  save(); showTab('reg'); renderRegList();
})();`;

const probe = `(function(){
  var m=document.getElementById('bulk-edit-modal');
  var head=m?m.querySelector('h3'):null;
  return {
    開いている: !!m,
    role: m?m.getAttribute('role'):null,
    ariaModal: m?m.getAttribute('aria-modal'):null,
    labelledby: m?m.getAttribute('aria-labelledby'):null,
    見出しid: head?head.id:null,
    見出し文: head?head.textContent:null,
    inert数: document.querySelectorAll('[inert]').length,
    モーダルにinert: !!(m&&m.hasAttribute('inert')),
    確認: !!document.getElementById('app-modal'),
    フォーカス: document.activeElement?(document.activeElement.id||document.activeElement.tagName):null,
    フォーカスは内: (function(){ var a=document.activeElement; return !!(m&&a&&m.contains(a)); })()
  };
})()`;

async function open(page, n) {
  await page.goto(TARGET);
  await page.waitForFunction(() => typeof save === 'function');
  await page.evaluate(seed(n || 4));
  await page.evaluate(() => document.getElementById('bulkEditA').focus());
  await page.evaluate(() => bulkEditNames('A'));
  await page.waitForTimeout(100);
}
async function tabTimes(page, n) {
  const seen = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(`(function(){
      var a=document.activeElement,m=document.getElementById('bulk-edit-modal');
      return { id:a?(a.id||a.tagName):null, 内: !!(m&&a&&m.contains(a)) };
    })()`));
  }
  return seen;
}

(async () => {
  const browser = await chromium.launch();
  const errs = [], dialogs = [];
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  ctx.on('page', p => {
    p.on('pageerror', e => errs.push(String(e)));
    p.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
  });
  const page = await ctx.newPage();

  console.log('E2E-BULK-EDIT-DIALOG-888');
  console.log('  対象: ' + TARGET);

  // ---- D1/D2 セマンティクスと inert -----------------------------------------
  await open(page, 4);
  let r = await page.evaluate(probe);
  ok(r.role === 'dialog' && r.ariaModal === 'true', '[D1] role=dialog / aria-modal=true: ' + r.role + ' / ' + r.ariaModal);
  ok(!!r.labelledby && r.labelledby === r.見出しid && /一括編集/.test(r.見出し文 || ''),
     '[D2] aria-labelledby が見出しを指す: ' + JSON.stringify([r.labelledby, r.見出し文]));
  ok(r.inert数 > 0 && !r.モーダルにinert, '[D3] 背後が inert・モーダル自身には付かない: ' + r.inert数 + ' 要素');

  // ---- D4 Tab がモーダル内で循環する（改修前は6回で外へ出た）----------------
  let seen = await tabTimes(page, 14);
  ok(seen.every(x => x.内), '[D4] ★Tab 14回すべてモーダル内: ' + seen.filter(x => !x.内).length + ' 回だけ外へ出た');
  ok(seen.map(x => x.id).indexOf('bulk-save') >= 0 && seen.map(x => x.id).indexOf('bulk-name-a1') >= 0,
     '[D5] 循環に入力欄と保存ボタンの両方が含まれる');

  // Shift+Tab も巻き取る
  await page.evaluate(`document.getElementById('bulk-name-a1').focus()`);
  await page.keyboard.press('Shift+Tab');
  r = await page.evaluate(probe);
  ok(r.フォーカスは内 && r.フォーカス === 'bulk-save', '[D6] ★Shift+Tab で先頭から末尾へ巻き取る: ' + r.フォーカス);

  // ---- D7 背景クリックでは閉じない ------------------------------------------
  await page.mouse.click(6, 6);
  await page.waitForTimeout(120);
  r = await page.evaluate(probe);
  ok(r.開いている === true, '[D7] ★背景クリックでは閉じない（未保存の入力を守る）');

  // ---- D8/D9 Esc（触っていない）→ そのまま閉じ、後片付けも済む ---------------
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  r = await page.evaluate(probe);
  ok(r.開いている === false && r.確認 === false, '[D8] ★触っていなければ Esc で確認なしに閉じる');
  ok(r.inert数 === 0, '[D9] ★閉じたら inert が1つも残らない: ' + r.inert数);
  ok(r.フォーカス === 'bulkEditA', '[D10] ★フォーカスが呼び出し元のボタンへ戻る: ' + r.フォーカス);

  // 閉じたあと Tab が巻き取られない ＝ keydown が外れている
  seen = await tabTimes(page, 3);
  //   ★ 主張は「巻き取りが止まっている」まで。listener が外れたこと自体はここでは測れない
  //     （_bulkModalKeydown は modal 不在なら自己修復して素通りするため、残っていても挙動が同じ）。
  ok(seen.some(x => !x.内), '[D11] ★閉じたあと Tab が巻き取られない（外へ抜けられる）: ' + JSON.stringify(seen.map(x => x.id)));

  // ---- D12〜D15 Esc（触った）→ 確認を挟む ------------------------------------
  await open(page, 4);
  await page.evaluate(`(function(){ var i=document.getElementById('bulk-name-a2'); i.value='書き換え'; })()`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  r = await page.evaluate(probe);
  ok(r.確認 === true, '[D12] ★触っていれば Esc で確認が出る');
  ok(r.開いている === true, '[D13] 確認が出ている間モーダルは残っている');

  // 確認が手前にある間は #888 の keydown が割り込まない
  const beforeEsc = await page.evaluate(probe);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  r = await page.evaluate(probe);
  ok(r.開いている === true, '[D14] ★確認中の Esc で一括編集が閉じない（確認を横取りしない）: 確認=' + r.確認 + ' / 直前=' + beforeEsc.確認);

  // ★ 直前の Esc で確認は閉じている（showAppModal 自身が Esc を持つ）。
  //   「いいえ」の枝を**実際に通す**ため、もう一度 Esc を押して確認を出し直す。
  //   これをしないと __resolveAppModal(false) が「保留なし」で空振りし、D15/D16 が
  //   「確認を一度も操作していないのに緑」になる。
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok((await page.evaluate(probe)).確認 === true, '[D14b] 確認を出し直せる');
  const resolved = await page.evaluate(`__resolveAppModal(false)`);
  ok(resolved === true, '[D14c] ★「いいえ」を実際に押した（保留中の確認があった）: ' + resolved);
  await page.waitForTimeout(150);
  r = await page.evaluate(probe);
  const kept = await page.evaluate(`document.getElementById('bulk-name-a2').value`);
  ok(r.開いている === true && kept === '書き換え', '[D15] ★「いいえ」なら閉じず入力も残る: ' + JSON.stringify(kept));
  ok(r.フォーカスは内, '[D16] 「いいえ」のあとフォーカスがモーダル内に戻る: ' + r.フォーカス);

  // 「はい」＝ 破棄して閉じる
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.evaluate(`__resolveAppModal(true)`);
  await page.waitForTimeout(150);
  r = await page.evaluate(probe);
  ok(r.開いている === false && r.inert数 === 0, '[D17] ★「はい」なら閉じ、inert も残らない');
  const notSaved = await page.evaluate(`state.players.A[1].name`);
  ok(notSaved === '選手2', '[D18] 破棄したので state は書き換わっていない: ' + notSaved);

  // ---- D19 保存で閉じたときも後片付けが済む ---------------------------------
  await open(page, 4);
  await page.evaluate(`(function(){ var i=document.getElementById('bulk-name-a3'); i.value='保存太郎'; })()`);
  await page.click('#bulk-save');
  await page.waitForTimeout(200);
  r = await page.evaluate(probe);
  ok(r.開いている === false && r.inert数 === 0, '[D19] ★保存で閉じても inert が残らない: ' + r.inert数);
  const savedName = await page.evaluate(`state.players.A[2].name`);
  ok(savedName === '保存太郎', '[D20] 保存は従来どおり効く: ' + savedName);

  // ---- D21 キャンセルボタンは従来どおり確認なしで閉じる ---------------------
  await open(page, 4);
  await page.evaluate(`(function(){ document.getElementById('bulk-name-a1').value='捨てる'; })()`);
  await page.click('#bulk-cancel');
  await page.waitForTimeout(150);
  r = await page.evaluate(probe);
  ok(r.開いている === false && r.確認 === false, '[D21] ★キャンセルは確認なしで閉じる（この便で挙動を変えていない）');
  ok(r.inert数 === 0, '[D22] キャンセルでも inert が残らない: ' + r.inert数);

  // ---- D23 開き直しても inert が積み上がらない ------------------------------
  await open(page, 4);
  const inert1 = (await page.evaluate(probe)).inert数;
  await page.evaluate(() => bulkEditNames('A'));   // 開いたまま開き直す
  await page.waitForTimeout(120);
  const inert2 = (await page.evaluate(probe)).inert数;
  ok(inert1 === inert2, '[D23] ★開き直しても inert が積み上がらない: ' + inert1 + ' → ' + inert2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok((await page.evaluate(probe)).inert数 === 0, '[D24] 開き直したあとも Esc 1回で全部外れる');

  // ---- D25 リセット経路で閉じても残骸が無い ---------------------------------
  await open(page, 4);
  await page.evaluate(`(function(){ closeBulkEditModal(); })()`);
  await page.waitForTimeout(120);
  r = await page.evaluate(probe);
  ok(r.開いている === false && r.inert数 === 0, '[D25] 専用の閉じ口を直接呼んでも後片付けが済む');
  seen = await tabTimes(page, 3);
  ok(seen.some(x => !x.内), '[D26] そのあと Tab が巻き取られない');

  // ---- D27 自己修復: DOM だけ消されても、次のキーで inert が片付く ----------
  //   リセットの一括除去（['bulk-edit-modal',...].forEach(m.remove())）は専用の閉じ口を
  //   通らない経路として今も残っている。_bulkModalKeydown の先頭ガードがその後始末を担う。
  //   ★ これが効いているので「閉じても keydown を外さない」変異は挙動として観測できない。
  //     その事実は PR の反証パネルに明記してある（空振りを隠さない）。
  await open(page, 4);
  await page.evaluate(`document.getElementById('bulk-edit-modal').remove()`);
  const 残骸 = (await page.evaluate(probe)).inert数;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  r = await page.evaluate(probe);
  ok(残骸 > 0 && r.inert数 === 0, '[D27] ★DOM だけ消されても次のキーで inert が片付く: ' + 残骸 + ' → ' + r.inert数);

  ok(dialogs.length === 0, '[D28] native dialog は1件も出ない: ' + JSON.stringify(dialogs));
  ok(errs.length === 0, '[D29] 未捕捉例外なし: ' + JSON.stringify(errs));

  await browser.close();
  console.log('  結果: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('E2E ERROR: ' + e); process.exit(1); });
