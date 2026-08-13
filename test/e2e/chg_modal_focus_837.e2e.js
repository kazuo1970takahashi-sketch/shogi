#!/usr/bin/env node
// Playwright E2E: CHG-MODAL-FOCUS-TRAP-001 (#837)
//   対戦相手変更モーダル（#chg-modal）が背後の DOM をキーボードから触らせないこと、
//   多重に開かないこと、Escape で閉じてフォーカスが戻ることを実 Chromium で固定する。
//
// なぜ実ブラウザでしか測れないか:
//   フォーカスの移動・Tab の到達順・inert の効き・keydown の伝播順は DOM モックには無い。
//   直す前の実測（dev 1b5180c）は「Tab 1回 + Enter で背後の卓に勝敗が入り localStorage
//   まで保存される（画面はモーダルに覆われて見えない）」だった。
//
// ★ __setAppModalTestResolver は絶対に仕込まない。
//   仕込むと appConfirm が同期完走してこの種の不具合が隠れる（#271 で誤判定の前例あり）。
//
// 使い方:
//   node test/e2e/chg_modal_focus_837.e2e.js [shogi_v4.html or URL]
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 3卓（p1-p2 / p3-p4 / p5-p6）・勝敗未入力の1回戦。当日と同じ形。
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
  page.on('dialog', d => d.accept().catch(() => {}));   // 既存 alert 経路（同一選手選択など）

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof changePairing === 'function', null, { timeout: 15000 });

  const reset = async () => {
    // 前のケースで開いたモーダル／確認モーダルを持ち越さない（持ち越すと次の click が
    // オーバーレイに吸われ、原因の分からない Timeout になる）
    await page.evaluate(() => {
      try { closeChangePairingModal(); } catch (e) {}
      const am = document.getElementById('app-modal'); if (am && am.parentNode) am.parentNode.removeChild(am);
    });
    await page.evaluate(SETUP);
    await page.evaluate(() => { try { localStorage.removeItem('shogi_v4'); } catch (e) {} });
  };

  // ---------------------------------------------------------------- 0) 実装が載っているか
  const has = await page.evaluate(() => ({
    close: typeof closeChangePairingModal === 'function',
    open: typeof openChangePairingModalFocus === 'function'
  }));
  ok(has.close && has.open, '[A0] 閉じ口と focus trap の関数がロードされている');

  // ---------------------------------------------------------------- 1) 開いた直後のフォーカス
  await reset();
  await page.click('#chgbtn_A_2');
  await page.waitForTimeout(150);
  const opened = await page.evaluate(() => {
    const m = document.getElementById('chg-modal');
    const a = document.activeElement;
    return {
      shown: !!m,
      activeInside: !!(m && a && m.contains(a)),
      activeId: a ? a.id : null,
      ariaModal: m ? m.getAttribute('aria-modal') : null,
      role: m ? m.getAttribute('role') : null,
      backgroundInert: Array.from(document.body.children).filter(el => el.id !== 'chg-modal')
        .every(el => el.hasAttribute('inert'))
    };
  });
  ok(opened.shown, '[A1] モーダルが開く');
  ok(opened.activeInside, '[A2] ★ フォーカスがモーダルの中にある  [' + opened.activeId + ']');
  ok(opened.ariaModal === 'true' && opened.role === 'dialog', '[A3] role=dialog / aria-modal=true');
  ok(opened.backgroundInert, '[A4] 背後の body 直下がすべて inert');

  // ---------------------------------------------------------------- 2) ★ 本丸: Tab + Enter で背後に勝敗が入らない
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
  }
  const afterKeys = await page.evaluate(() => {
    let saved = null;
    try { saved = localStorage.getItem('shogi_v4'); } catch (e) {}
    return { winners: state.pairings.A.map(m => m.winner), saved: !!saved };
  });
  ok(afterKeys.winners.every(w => w === null), '[B1] ★ Tab+Enter を3回繰り返しても背後の卓に勝敗が入らない');
  ok(!afterKeys.saved, '[B2] ★ localStorage にも書かれない');

  // ---------------------------------------------------------------- 3) Tab を回してもモーダルの外へ出ない
  await reset();
  await page.click('#chgbtn_A_1');
  await page.waitForTimeout(150);
  let escaped = false, seen = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const st = await page.evaluate(() => {
      const m = document.getElementById('chg-modal'), a = document.activeElement;
      return { inside: !!(m && a && m.contains(a)), id: a ? (a.id || (a.textContent || '').trim().slice(0, 6)) : null };
    });
    seen.push(st.id);
    if (!st.inside) escaped = true;
  }
  ok(!escaped, '[C1] Tab を12回押してもフォーカスがモーダルの外へ出ない  [' + Array.from(new Set(seen)).join('/') + ']');
  const shiftBack = await (async () => {
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+Tab');
    return page.evaluate(() => {
      const m = document.getElementById('chg-modal'), a = document.activeElement;
      return !!(m && a && m.contains(a));
    });
  })();
  ok(shiftBack, '[C2] Shift+Tab で遡ってもモーダルの外へ出ない');

  // ---------------------------------------------------------------- 4) Escape で閉じ、フォーカスが戻る
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const closed = await page.evaluate(() => ({
    gone: !document.getElementById('chg-modal'),
    activeId: document.activeElement ? document.activeElement.id : null,
    inertLeft: Array.from(document.body.children).some(el => el.hasAttribute('inert'))
  }));
  ok(closed.gone, '[D1] Escape でモーダルが閉じる');
  ok(closed.activeId === 'chgbtn_A_1', '[D2] 閉じたら呼び出し元の「変更」ボタンにフォーカスが戻る  [' + closed.activeId + ']');
  ok(!closed.inertLeft, '[D3] 閉じたら inert が残らない');

  // ---------------------------------------------------------------- 5) 多重に開かない（2枚目で listener が死ぬ問題）
  await reset();
  await page.evaluate(() => { changePairing('A', 0); changePairing('A', 1); });
  await page.waitForTimeout(150);
  const stacked = await page.evaluate(() => ({
    modals: document.querySelectorAll('#chg-modal').length,
    saves: document.querySelectorAll('#chg-save').length
  }));
  ok(stacked.modals === 1 && stacked.saves === 1, '[E1] ★ 2回続けて開いてもモーダルは1枚（listener が積まない）');
  const liveSave = await page.evaluate(() => {
    // 2枚目（= idx 1・p3 vs p4）の select を操作して保存 → 確認モーダルが出れば listener は生きている
    document.getElementById('chg-p1').value = 'p5';
    document.getElementById('chg-save').click();
    return !!document.getElementById('app-modal');
  });
  ok(liveSave, '[E2] ★ 手前のモーダルの「変更を保存」が生きている（確認が出る）');

  // ---------------------------------------------------------------- 6) 確認モーダル表示中に割り込まない
  const escInConfirm = await page.evaluate(() => {
    const before = !!document.getElementById('app-modal');
    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, which: 27, key: 'Escape', bubbles: true }));
    return { before, appModalGone: !document.getElementById('app-modal'), chgStill: !!document.getElementById('chg-modal') };
  });
  ok(escInConfirm.before && escInConfirm.appModalGone, '[F1] 確認モーダル表示中の Escape は確認モーダル側が受ける');
  ok(escInConfirm.chgStill, '[F2] ★ そのとき変更モーダルは閉じない（横取りしていない）');

  // ---------------------------------------------------------------- 7) 対照: 通常の変更操作は従来どおり通る
  await reset();
  await page.evaluate(() => { changePairing('A', 0); });          // p1 vs p2 を開く
  await page.waitForTimeout(120);
  await page.evaluate(() => { document.getElementById('chg-p1').value = 'p3'; document.getElementById('chg-save').click(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { const b = document.querySelector('#app-modal .app-modal-ok'); if (b) b.click(); });
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => ({
    pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
    modalGone: !document.getElementById('chg-modal'),
    inertLeft: Array.from(document.body.children).some(el => el.hasAttribute('inert')),
    saved: (function () { try { const s = localStorage.getItem('shogi_v4'); return s ? JSON.parse(s).pairings.A.map(m => m.p1 + 'v' + m.p2) : null; } catch (e) { return 'ERR'; } })()
  }));
  ok(applied.pairs[0] === 'p3vp2', '[G1] 対照: 入れ替えは従来どおり適用される  [' + applied.pairs.join(', ') + ']');
  ok(applied.modalGone && !applied.inertLeft, '[G2] 対照: 保存後にモーダルも inert も残らない');
  ok(Array.isArray(applied.saved) && applied.saved[0] === 'p3vp2', '[G3] 対照: localStorage にも保存される');

  // ---------------------------------------------------------------- 8) 別経路で消されても inert が残らない（自己修復）
  await reset();
  await page.evaluate(() => { changePairing('A', 2); });
  await page.waitForTimeout(120);
  // 進行リセットは破壊操作なので確認モーダル（danger・既定キャンセル）が先に出る
  await page.evaluate(() => { resetTournamentProgressOnly(); });
  await page.waitForTimeout(150);
  const resetConfirm = await page.evaluate(() => !!document.querySelector('#app-modal .app-modal-ok'));
  ok(resetConfirm, '[H0] 進行リセットの確認モーダルが出る（変更モーダルが開いていても操作できる）');
  await page.evaluate(() => { const b = document.querySelector('#app-modal .app-modal-ok'); if (b) b.click(); });
  await page.waitForTimeout(300);
  const afterReset = await page.evaluate(() => {
    return {
      modalGone: !document.getElementById('chg-modal'),
      inertLeft: Array.from(document.body.children).some(el => el.hasAttribute('inert'))
    };
  });
  ok(afterReset.modalGone, '[H1] 進行リセットでモーダルが閉じる');
  ok(!afterReset.inertLeft, '[H2] ★ 進行リセット経由で閉じても inert が残らない（画面が操作不能にならない）');

  // ---------------------------------------------------------------- 8b) クラス単位のリセットでも同じ（受け入れ基準4）
  //   #837 本文の実測「resetClassForClass には後始末コードが存在しない → 残ったモーダルの
  //   保存で Cannot read properties of undefined (reading 'p1') が未捕捉で飛ぶ」を塞ぐ。
  await reset();
  await page.evaluate(() => { changePairing('A', 0); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { resetClassForClass('A'); });
  await page.waitForTimeout(150);
  const clsResetConfirm = await page.evaluate(() => !!document.querySelector('#app-modal .app-modal-ok'));
  ok(clsResetConfirm, '[I0] クラスのリセットの確認モーダルが出る');
  await page.evaluate(() => { const b = document.querySelector('#app-modal .app-modal-ok'); if (b) b.click(); });
  await page.waitForTimeout(300);
  const afterClsReset = await page.evaluate(() => ({
    modalGone: !document.getElementById('chg-modal'),
    inertLeft: Array.from(document.body.children).some(el => el.hasAttribute('inert')),
    pairings: (state.pairings.A || []).length
  }));
  ok(afterClsReset.modalGone, '[I1] ★ クラスのリセットでもモーダルが閉じる（残ると保存で未捕捉例外）');
  ok(!afterClsReset.inertLeft, '[I2] クラスのリセット経由でも inert が残らない');
  ok(afterClsReset.pairings === 0, '[I3] 対照: リセット自体は従来どおり効いている');

  // ---------------------------------------------------------------- 9) 未捕捉例外なし
  ok(pageErrors.length === 0, '未捕捉例外なし  ' + (pageErrors.length ? '[' + pageErrors[0] + ']' : ''));

  await browser.close();
  console.log('\nE2E-CHG-MODAL-FOCUS-837: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
