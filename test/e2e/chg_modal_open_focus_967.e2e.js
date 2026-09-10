#!/usr/bin/env node
// Playwright E2E: CHG-MODAL-OPEN-FOCUS-001 (#967)
//   対戦相手変更モーダル（#chg-modal）を開いた直後のフォーカスが **器（dialog 自身）** に在り、
//   先手の select には行かないことを実 Chromium で固定する。
//
// なぜ器なのか（#967 の事象）:
//   #837 は開いた直後に先頭の focusable（#chg-p1＝先手の select）へ focus していた。
//   iPhone Safari はクリック中の select.focus() でピッカーを開くため、「変更」を押した瞬間に
//   先手の候補が開き、後手を変えるには一度閉じてから後手の欄を押すしかなかった（作者の実機報告・v155）。
//   ピッカーそのものは Chromium では測れない。ここで固定するのは「開く過程で select が focus を
//   受けない」こと（focusin の記録）と、器からの Tab / Shift+Tab がモーダルの外へ出ないこと。
//
// ★ __setAppModalTestResolver は絶対に仕込まない（#837 と同じ理由・#271 に誤判定の前例）。
//
// 使い方:
//   node test/e2e/chg_modal_open_focus_967.e2e.js [shogi_v4.html or URL]
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 3卓（p1-p2 / p3-p4 / p5-p6）・勝敗未入力の1回戦（#837 の e2e と同じ形・架空名）。
const SETUP = `state = { players: { A: [
    { id:'p1', name:'一郎', entry_no:1, member:'member', grade:'ippan' },
    { id:'p2', name:'二郎', entry_no:2, member:'member', grade:'ippan' },
    { id:'p3', name:'三郎', entry_no:3, member:'member', grade:'ippan' },
    { id:'p4', name:'四郎', entry_no:4, member:'member', grade:'ippan' },
    { id:'p5', name:'五郎', entry_no:5, member:'member', grade:'ippan' },
    { id:'p6', name:'六郎', entry_no:6, member:'member', grade:'ippan' } ], B: [] },
  rounds: 4, results: { A: [], B: [] },
  pairings: { A: [ { p1:'p1', p2:'p2', winner:null, lastModifiedBy:'auto' },
                   { p1:'p3', p2:'p4', winner:null, lastModifiedBy:'auto' },
                   { p1:'p5', p2:'p6', winner:null, lastModifiedBy:'auto' } ], B: [] },
  started: true,
  classes: [{ id:'A', name:'Aクラス', started:true }, { id:'B', name:'Bクラス', started:false }],
  report: {} };
 if (typeof showTab === 'function') showTab('tournament');
 if (typeof renderTournament === 'function') renderTournament('A');`;

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept().catch(() => {}));

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof changePairing === 'function', null, { timeout: 15000 });

  // 開く過程で誰が focus を受けたかを記録する（capture・document に1回だけ付ける）
  await page.evaluate(() => {
    window.__focusLog = [];
    document.addEventListener('focusin', function (e) {
      const t = e.target;
      window.__focusLog.push((t && t.tagName ? t.tagName : '?') + '#' + (t && t.id ? t.id : ''));
    }, true);
  });

  const reset = async () => {
    await page.evaluate(() => {
      try { closeChangePairingModal(); } catch (e) {}
      const am = document.getElementById('app-modal'); if (am && am.parentNode) am.parentNode.removeChild(am);
    });
    await page.evaluate(SETUP);
    await page.evaluate(() => { try { localStorage.removeItem('shogi_v4'); } catch (e) {} window.__focusLog = []; });
  };

  // ---------------------------------------------------------------- 0) 実装が載っているか
  const has = await page.evaluate(() => ({
    open: typeof openChangePairingModalFocus === 'function',
    close: typeof closeChangePairingModalFocus === 'function' || typeof closeChangePairingModal === 'function'
  }));
  ok(has.open && has.close, '[A0] focus trap の関数がロードされている');

  // ---------------------------------------------------------------- 1) ★ 本丸: 実クリックで開いた直後のフォーカスは器
  await reset();
  await page.click('#chgbtn_A_1');
  await page.waitForTimeout(150);
  const opened = await page.evaluate(() => {
    const m = document.getElementById('chg-modal');
    const a = document.activeElement;
    return {
      shown: !!m,
      activeId: a ? a.id : null,
      activeTag: a ? a.tagName : null,
      activeIsModal: !!(m && a === m),
      tabindex: m ? m.getAttribute('tabindex') : null,
      role: m ? m.getAttribute('role') : null,
      focusLog: (window.__focusLog || []).slice()
    };
  });
  ok(opened.shown, '[A1] モーダルが開く');
  ok(opened.activeIsModal, '[A2] ★ 開いた直後の activeElement は器（#chg-modal）  [' + opened.activeTag + '#' + opened.activeId + ']');
  ok(opened.activeTag !== 'SELECT', '[A3] ★ 先手の select にフォーカスが行っていない');
  ok(opened.tabindex === '-1' && opened.role === 'dialog', '[A4] 器は tabindex=-1 / role=dialog（focus 可能な dialog）');
  ok(!opened.focusLog.some(s => s.indexOf('SELECT') === 0),
    '[A5] ★ 開く過程で select が一度も focus を受けていない（iPhone のピッカーが開く引き金を踏まない）  [' + opened.focusLog.join('/') + ']');
  ok(opened.focusLog.indexOf('DIV#chg-modal') >= 0, '[A6] 開く過程で器が focus を受けている');

  // ---------------------------------------------------------------- 2) 器からの Tab は先手（先頭）へ
  await page.keyboard.press('Tab');
  const tab1 = await page.evaluate(() => {
    const m = document.getElementById('chg-modal'), a = document.activeElement;
    return { inside: !!(m && a && m.contains(a)), id: a ? a.id : null };
  });
  ok(tab1.inside && tab1.id === 'chg-p1', '[B1] 器から Tab 1回で先手の select（#chg-p1）に届く  [' + tab1.id + ']');

  // ---------------------------------------------------------------- 3) ★ 器からの Shift+Tab は最後の要素へ（モーダルの外へ出ない）
  await reset();
  await page.click('#chgbtn_A_1');
  await page.waitForTimeout(150);
  await page.keyboard.press('Shift+Tab');
  const shift1 = await page.evaluate(() => {
    const m = document.getElementById('chg-modal'), a = document.activeElement;
    return { inside: !!(m && a && m.contains(a)), id: a ? a.id : null, isModal: !!(m && a === m) };
  });
  ok(shift1.inside && !shift1.isModal, '[C1] ★ 器から Shift+Tab してもモーダルの外へ出ない（器に留まりもしない）  [' + shift1.id + ']');
  ok(shift1.id === 'chg-save', '[C2] 器から Shift+Tab の行き先は最後の要素（変更を保存）  [' + shift1.id + ']');

  // ---------------------------------------------------------------- 4) 対照: 器にフォーカスがあっても Enter で背後に勝敗が入らない
  await reset();
  await page.click('#chgbtn_A_1');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const enterOnModal = await page.evaluate(() => ({
    winners: state.pairings.A.map(m => m.winner),
    modalStill: !!document.getElementById('chg-modal'),
    saved: (function () { try { return localStorage.getItem('shogi_v4'); } catch (e) { return 'ERR'; } })()
  }));
  ok(enterOnModal.winners.every(w => w === null) && enterOnModal.saved === null,
    '[D1] 対照: 器にフォーカスがある状態で Enter を押しても勝敗は入らず保存もされない  [' + enterOnModal.winners.join(',') + ']');
  ok(enterOnModal.modalStill, '[D2] 対照: そのときモーダルは開いたまま');

  // ---------------------------------------------------------------- 5) 対照: Escape で閉じて呼び出し元へ戻る（#837 の D 系が器 focus でも崩れない）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const closed = await page.evaluate(() => ({
    gone: !document.getElementById('chg-modal'),
    activeId: document.activeElement ? document.activeElement.id : null,
    inertLeft: Array.from(document.body.children).some(el => el.hasAttribute('inert'))
  }));
  ok(closed.gone && closed.activeId === 'chgbtn_A_1' && !closed.inertLeft,
    '[E1] 対照: Escape で閉じて「変更」ボタンへ戻り inert が残らない  [' + closed.activeId + ']');

  // ---------------------------------------------------------------- 6) 対照: 通常の変更操作は従来どおり通る
  await reset();
  await page.click('#chgbtn_A_0');
  await page.waitForTimeout(120);
  await page.evaluate(() => { document.getElementById('chg-p1').value = 'p3'; document.getElementById('chg-save').click(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { const b = document.querySelector('#app-modal .app-modal-ok'); if (b) b.click(); });
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => ({
    pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
    modalGone: !document.getElementById('chg-modal')
  }));
  ok(applied.pairs[0] === 'p3vp2' && applied.modalGone, '[F1] 対照: 入れ替えは従来どおり適用されモーダルも閉じる  [' + applied.pairs.join(', ') + ']');

  ok(pageErrors.length === 0, '[Z] 未捕捉の例外が無い  [' + pageErrors.join(' | ') + ']');

  await browser.close();
  console.log('\n結果: PASS=' + pass + ', FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E error:', e); process.exit(1); });
