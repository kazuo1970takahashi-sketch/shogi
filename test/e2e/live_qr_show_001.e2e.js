#!/usr/bin/env node
// Playwright E2E: LIVE-QR-SHOW-001（#832 の続き・作者運用 2026-08-11）
//   受付で来た人にその場でQRを読ませる運用に合わせて
//     (1) 配信中の帯から **どのタブからでも1タップ** で全画面QRを出せる
//     (2) 最終結果タブの掲示用QRを畳んで **途中経過（順位表）が初期表示に入る**
//   ことを実ブラウザで測る。
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -D playwright && npx playwright install chromium   # 初回のみ
//   node test/e2e/live_qr_show_001.e2e.js
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

// 途中経過がある state（4名・1回戦確定・2回戦進行中）
const SETUP = () => {
  state.classes = [{ id:'A', name:'Aクラス' }];
  state.players = { A:[1,2,3,4].map(i => ({ id:'p'+i, name:'選手'+i, entry_no:i, member:'member' })) };
  state.results = { A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]] };
  state.pairings = { A:[{p1:'p1',p2:'p3'},{p1:'p2',p2:'p4'}] };
  state.rounds = 4;
  showTab('result'); renderResults();
};
// 配信中の見た目を作る（Supabase は使わない＝表示だけの検証）
const START_LIVE = () => {
  _liveSlug = 'live-demoDEMOdemo0123456789abcdef01';
  _liveClient = { rpc: function(){ return Promise.resolve({}); } };
  liveShowQr(_liveSlug);
  liveUpdateBar('最終送信 12:34（成功）');
  liveRefreshToggleUI();
};
const LIST_TOP = () => Math.round(document.getElementById('result-list').getBoundingClientRect().top + window.scrollY);

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  for (const vp of [{width:1440,height:900,name:'PC 1440x900'},{width:390,height:844,name:'スマホ 390x844'}]) {
    const pg = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    pg.on('pageerror', e => errors.push(String(e && e.message || e)));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });

    const r = await pg.evaluate(({ setup }) => {
      eval('(' + setup.SETUP + ')()');
      const listTop = () => Math.round(document.getElementById('result-list').getBoundingClientRect().top + window.scrollY);
      const off = listTop();
      eval('(' + setup.START_LIVE + ')()');
      const on = listTop();
      const box = document.getElementById('liveQrBox');
      return {
        off, on, vh: window.innerHeight,
        tag: box.tagName.toLowerCase(),
        openAttr: box.open === true,
        boxShown: getComputedStyle(box).display !== 'none',
        barShown: getComputedStyle(document.getElementById('live-bar')).display !== 'none'
      };
    }, { setup: { SETUP: SETUP.toString(), START_LIVE: START_LIVE.toString() } });

    ok(r.tag === 'details' && r.openAttr === false,
      `【${vp.name}】掲示用QRは <details> で既定は閉じている  [実測 ${r.tag} open=${r.openAttr}]`);
    ok(r.boxShown === true, `【${vp.name}】配信中はQRの見出し自体は出ている（存在に気づける）`);
    ok(r.barShown === true, `【${vp.name}】配信中バーが出ている`);
    ok(r.on < r.vh,
      `【${vp.name}】配信ONでも順位表が初期表示に入る  [実測 y=${r.on} < viewport ${r.vh}]`);
    ok(r.on - r.off <= 200,
      `【${vp.name}】配信ONによる押し下げが半分以下  [実測 +${r.on - r.off}px（修正前は PC +335px / スマホ +393px）]`);
    await pg.close();
  }

  // ---- 全画面QR ----
  const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pg.on('pageerror', e => errors.push(String(e && e.message || e)));
  await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });

  // 配信していないときは出さない
  const before = await pg.evaluate(() => ({
    opened: liveShowQrFullscreen(),
    display: getComputedStyle(document.getElementById('live-qr-fullscreen')).display
  }));
  ok(before.opened === false && before.display === 'none', '配信していないときは全画面QRを開かない（無効なURLを見せない）');

  await pg.evaluate(({ setup }) => { eval('(' + setup.SETUP + ')()'); eval('(' + setup.START_LIVE + ')()'); },
    { setup: { SETUP: SETUP.toString(), START_LIVE: START_LIVE.toString() } });

  // 対局管理タブに移動しても帯のボタンから開ける（どのタブからでも1タップ）
  const opened = await pg.evaluate(() => {
    showTab('tournament');
    const btn = document.getElementById('liveBarQrBtn');
    const visible = btn && getComputedStyle(btn).display !== 'none' && btn.offsetParent !== null;
    btn.click();
    const ov = document.getElementById('live-qr-fullscreen');
    return {
      btnVisibleOnOtherTab: !!visible,
      display: getComputedStyle(ov).display,
      ariaHidden: ov.getAttribute('aria-hidden'),
      bodyLocked: document.body.classList.contains('live-qr-open'),
      url: (document.getElementById('liveQrFsUrl') || {}).textContent || '',
      covers: (() => { const b = ov.getBoundingClientRect(); return Math.round(b.width) >= window.innerWidth && Math.round(b.height) >= window.innerHeight; })()
    };
  });
  ok(opened.btnVisibleOnOtherTab, '対局管理タブでも帯の「📱 QRを見せる」が見えている＝どのタブからでも1タップ');
  ok(opened.display === 'block' && opened.ariaHidden === 'false', '押すと全画面QRが開く');
  ok(opened.covers, '全画面（viewport 全体を覆う）');
  ok(opened.bodyLocked, '背面はスクロールしない');
  ok(opened.url.indexOf('?live=live-demoDEMOdemo0123456789abcdef01#scoreboard') >= 0,
    '配信URLが出ている  [実測 ' + opened.url.slice(-60) + ']');

  // QR 本体（CDN が無い環境では fail-soft の文言）
  const qrState = await pg.evaluate(() => {
    const el = document.getElementById('liveQrFs');
    return { hasSvg: !!el.querySelector('svg'), text: el.textContent.trim() };
  });
  ok(qrState.hasSvg || qrState.text.length > 0,
    'QR 本体または fail-soft の案内が出る  [実測 svg=' + qrState.hasSvg + ' text="' + qrState.text + '"]');

  // 閉じる（✕ と Esc）＋ 閉じても運営状態は変わらない
  const closed = await pg.evaluate(() => {
    const tabBefore = document.querySelector('.tab-bar .active') ? document.querySelector('.tab-bar .active').textContent : null;
    document.getElementById('liveQrFsCloseBtn').click();
    const ov = document.getElementById('live-qr-fullscreen');
    const afterClick = { display: getComputedStyle(ov).display, locked: document.body.classList.contains('live-qr-open') };
    document.getElementById('liveBarQrBtn').click();
    const reopened = getComputedStyle(ov).display;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const afterEsc = getComputedStyle(ov).display;
    const tabAfter = document.querySelector('.tab-bar .active') ? document.querySelector('.tab-bar .active').textContent : null;
    return { afterClick, reopened, afterEsc, tabSame: tabBefore === tabAfter, live: liveIsActive() };
  });
  ok(closed.afterClick.display === 'none' && closed.afterClick.locked === false, '✕ で閉じる（背面ロックも解除）');
  ok(closed.reopened === 'block', '再度開ける');
  ok(closed.afterEsc === 'none', 'Esc でも閉じる');
  ok(closed.tabSame && closed.live === true, '閉じても表示タブと配信状態は変わらない');

  // 配信停止で全画面QRも閉じる
  const stopped = await pg.evaluate(() => {
    document.getElementById('liveBarQrBtn').click();
    liveHideQr();
    return getComputedStyle(document.getElementById('live-qr-fullscreen')).display;
  });
  ok(stopped === 'none', '配信停止（liveHideQr）で全画面QRも閉じる＝古いURLを見せ続けない');

  await pg.close();
  ok(errors.length === 0, '未捕捉例外なし' + (errors.length ? '（実際: ' + errors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-LIVE-QR-SHOW-001: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
