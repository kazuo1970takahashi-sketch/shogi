#!/usr/bin/env node
// Playwright E2E: ROUNDS-PER-CLASS-UI-001（Issue #844）
//   実 Chromium で shogi_v4.html を開き、renderClassManager() が実際に描いた
//   <select> の「選ばれている項目」を読む。
//
//   なぜ実ブラウザか: DOM モックの select.value は合致する option が無くても代入できるため、
//   壊れた実装（rounds が落ちる実装）でもモックでは緑になる。option と value の突き合わせは
//   本物の HTMLSelectElement でしか測れない。純関数層は test/test_rounds_per_class_ui_844.js。
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -D playwright                # 初回のみ
//   npx playwright install chromium    # 初回のみ
//   node test/e2e/rounds_per_class_ui_844.e2e.js
//   # 本番を対象にする場合は URL を引数に渡す
//
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept().catch(() => {}));

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof renderClassManager === 'function', null, { timeout: 10000 });

  const res = await page.evaluate(() => {
    function readRows(){
      var host = document.getElementById('class-manager-list');
      var rows = host ? host.querySelectorAll('.class-manager-row') : [];
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var sel = rows[i].querySelector('select');
        if (!sel) { out.push(null); continue; }
        out.push({
          value: sel.value,
          selectedText: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : null,
          optionTexts: Array.prototype.map.call(sel.options, function (o) { return o.text; }),
          disabled: sel.disabled,
          ariaLabel: sel.getAttribute('aria-label')
        });
      }
      return out;
    }
    function setClasses(classes, rounds){
      state.rounds = rounds;
      state.classes = classes;
      state.players = {}; state.pairings = {}; state.results = {};
      for (var i = 0; i < classes.length; i++) {
        state.players[classes[i].id] = []; state.pairings[classes[i].id] = []; state.results[classes[i].id] = [];
      }
      renderClassManager();
      return readRows();
    }
    return {
      normal: setClasses([{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス',rounds:6},{id:'C',name:'Cクラス',rounds:9}], 4),
      started: setClasses([{id:'A',name:'Aクラス',started:true,rounds:5}], 4),
      gdef7:   setClasses([{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス',rounds:3}], 7)
    };
  });

  const A = res.normal[0], B = res.normal[1], C = res.normal[2];
  ok(A && A.value === '' && A.selectedText === '既定(4)',
    '対照: 上書きの無い A は「既定(4)」のまま  [実測 ' + (A && A.selectedText) + ']');
  ok(B && B.value === '6' && B.selectedText === '6回戦',
    'B の上書き 6 がセレクタに表示される  [実測 ' + (B && B.selectedText) + ']');
  ok(C && C.value === '9' && C.selectedText === '9回戦',
    '選択肢外の上書き 9 も option に足された上で選択される  [実測 ' + (C && C.selectedText) + ']');
  ok(C && C.optionTexts.join(',') === '既定(4),3回戦,4回戦,5回戦,6回戦,7回戦,9回戦',
    'option の並びは昇順で 9 が末尾  [実測 ' + (C && C.optionTexts.join(',')) + ']');
  ok(B && B.ariaLabel === 'Bクラスの回戦数', 'aria-label は従来どおり');
  ok(res.started[0] && res.started[0].disabled === true && res.started[0].value === '5',
    '開始済みクラスは disabled のまま、かつ上書き値 5 を表示  [実測 disabled=' + (res.started[0] && res.started[0].disabled) + ' value=' + (res.started[0] && res.started[0].value) + ']');
  ok(res.gdef7[0] && res.gdef7[0].selectedText === '既定(7)' && res.gdef7[1] && res.gdef7[1].value === '3',
    '全体既定が 7 でも「既定(7)」表示と上書き 3 の表示が両立  [実測 ' + (res.gdef7[0] && res.gdef7[0].selectedText) + ' / ' + (res.gdef7[1] && res.gdef7[1].value) + ']');
  ok(pageErrors.length === 0, '未捕捉例外が出ない' + (pageErrors.length ? '（実際: ' + pageErrors[0] + '）' : ''));

  await browser.close();

  console.log('\nE2E-ROUNDS-PER-CLASS-UI-844: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
