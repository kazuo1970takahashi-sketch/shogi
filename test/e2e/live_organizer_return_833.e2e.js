#!/usr/bin/env node
// Playwright E2E: LIVE-ORGANIZER-RETURN-001（Issue #833）
//   閲覧専用ビューから運営画面へ戻る導線が「運営 state を持つブラウザ文脈」にだけ出ることを、
//   実 Chromium で受け入れ基準1〜4・6 に沿って測る。
//
//   述語（作者決定 2026-08-11）:
//     (1) このタブで運営画面を描いた実績（sessionStorage・タブ単位）
//     (2) window.opener が無い（別タブとして開かれた文脈ではない）
//   (2) が必要なのは sessionStorage が window.open の子タブへコピーされるため（本テスト E-9 で実測）。
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -D playwright && npx playwright install chromium   # 初回のみ
//   node test/e2e/live_organizer_return_833.e2e.js
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

const BTN_ID = '#sb-org-return-btn';

// 画面上の「見えている」ボタン/リンクを全列挙する（受け入れ基準3 は sb-head だけの比較を禁じている）。
const ENUM = () => Array.from(document.querySelectorAll('button,a'))
  .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
  .filter(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
  .map(e => (e.textContent || '').trim() + (e.tagName === 'A' ? '[a:' + (e.getAttribute('href') || '') + ']' : ''));

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  // ---- 運営文脈（同一タブで運営画面 → 閲覧ルートへ遷移）----
  const org = await browser.newContext();

  async function organizerTabAt(url, prep) {
    const pg = await org.newPage();
    pg.on('pageerror', e => errors.push(String(e && e.message || e)));
    await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });          // まず運営画面を描く
    if (prep) await pg.evaluate(prep);
    await pg.goto(url, { waitUntil: 'domcontentloaded' });             // 同一タブで閲覧ルートへ
    await pg.waitForTimeout(150);
    return pg;
  }

  // 基準1-① live ルート（envelope 受信済み）
  let pg = await organizerTabAt(TARGET + '?live=demo#scoreboard');
  await pg.evaluate(() => {
    _sbLiveViewState = { classes:[{id:'A',name:'Aクラス'}], players:{A:[{id:'p1',name:'甲',entry_no:1},{id:'p2',name:'乙',entry_no:2}]},
      pairings:{A:[]}, results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]]}, rounds:4, report:{} };
    _sbLiveEnvelope = { updated_at: '2026-08-11T00:00:00Z' };
    renderScoreboard();
  });
  ok(await pg.locator(BTN_ID).count() === 1, '基準1-① live（envelope 受信済み）に導線が1つ出る');
  ok(await pg.locator(BTN_ID).innerText() === '▶ 運営画面へ戻る', '  文言は「▶ 運営画面へ戻る」');
  await pg.close();

  // 基準1-② live 待機画面（envelope 未受信）
  pg = await organizerTabAt(TARGET + '?live=demo#scoreboard');
  ok(await pg.locator(BTN_ID).count() === 1, '基準1-② live 待機画面に導線が出る');
  await pg.close();

  // 基準1-③ live 終了画面
  pg = await organizerTabAt(TARGET + '?live=demo#scoreboard');
  await pg.evaluate(() => sbLiveShowDoneView());
  await pg.waitForTimeout(150);
  ok(await pg.locator(BTN_ID).count() === 1, '基準1-③ live 終了画面に導線が出る');
  await pg.close();

  // 基準1-④ 非 live #scoreboard（URL 直接・opener なし）＋ 実際に復帰できること
  pg = await organizerTabAt(TARGET + '#scoreboard');
  ok(await pg.locator(BTN_ID).count() === 1, '基準1-④ 非 live #scoreboard に導線が出る');
  await pg.locator(BTN_ID).click();
  await pg.waitForTimeout(400);
  const back = await pg.evaluate(() => ({
    sbActive: document.body.classList.contains('sb-active'),
    header: getComputedStyle(document.querySelector('.header')).display,
    hash: location.hash, search: location.search
  }));
  ok(back.sbActive === false && back.header !== 'none' && back.hash === '' && back.search === '',
    '押下で運営画面へ実際に復帰する（search/hash が落ちる）  [実測 ' + JSON.stringify(back) + ']');
  await pg.close();

  // 基準2 全リセット直後（localStorage 消去後）の運営タブでも出る
  pg = await organizerTabAt(TARGET + '?live=demo#scoreboard', () => { localStorage.removeItem('shogi_v4'); });
  ok(await pg.locator(BTN_ID).count() === 1, '基準2 全リセット直後の運営タブでも導線が出る（localStorage を見ない述語）');
  await pg.close();

  // 基準4-a 据置き: 運営タブから「📱スマホ星取表」で開いた子タブには出さない
  const parent = await org.newPage();
  await parent.goto(TARGET, { waitUntil: 'domcontentloaded' });
  const [popup] = await Promise.all([parent.waitForEvent('popup'), parent.evaluate(() => openScoreboardWindow())]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForTimeout(150);
  const inherited = await popup.evaluate(() => sessionStorage.getItem('shogi_v4_org_ctx'));
  ok(inherited === '1', 'E-9 実測: sessionStorage は window.open の子タブへコピーされる（＝opener 条項が必要な理由）');
  ok(await popup.locator(BTN_ID).count() === 0, '基準4-a 据置き用の子タブ（opener あり）には導線を出さない');
  await popup.close(); await parent.close();

  // 基準4-b 同一ブラウザの別タブで #scoreboard を直接開いた据置きにも出さない
  const standalone = await org.newPage();
  await standalone.goto(TARGET + '#scoreboard', { waitUntil: 'domcontentloaded' });
  await standalone.waitForTimeout(150);
  ok(await standalone.locator(BTN_ID).count() === 0, '基準4-b 同一ブラウザでも別タブ直接 #scoreboard には出さない');
  await standalone.close();
  await org.close();

  // ---- 基準3 参加者不変（クリーンプロファイル）----
  const guest = await browser.newContext();
  const g1 = await guest.newPage();
  g1.on('pageerror', e => errors.push(String(e && e.message || e)));
  await g1.goto(TARGET + '?live=demo#scoreboard', { waitUntil: 'domcontentloaded' });
  await g1.waitForTimeout(150);
  const waitBtns = await g1.evaluate(ENUM);
  ok(await g1.locator(BTN_ID).count() === 0, '基準3-a 参加者の live 待機画面に導線なし');
  ok(JSON.stringify(waitBtns) === JSON.stringify(['✕ 閉じる']),
    '基準3-b 待機画面の可視ボタン/リンク全列挙が現行どおり  [実測 ' + JSON.stringify(waitBtns) + ']');

  await g1.evaluate(() => {
    _sbLiveViewState = { classes:[{id:'A',name:'Aクラス'}], players:{A:[{id:'p1',name:'甲',entry_no:1},{id:'p2',name:'乙',entry_no:2}]},
      pairings:{A:[]}, results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]]}, rounds:4, report:{} };
    _sbLiveEnvelope = { updated_at: '2026-08-11T00:00:00Z' };
    renderScoreboard();
  });
  ok(await g1.locator(BTN_ID).count() === 0, '基準3-c 参加者の live（受信済み）にも導線なし');

  await g1.evaluate(() => sbLiveShowDoneView());
  await g1.waitForTimeout(150);
  const doneBtns = await g1.evaluate(ENUM);
  ok(JSON.stringify(doneBtns) === JSON.stringify(['▶ 星取表に戻る']),
    '基準3-d 参加者の終了画面は「▶ 星取表に戻る」1件のまま  [実測 ' + JSON.stringify(doneBtns) + ']');
  await g1.close();

  const g2 = await guest.newPage();
  await g2.goto(TARGET + '#scoreboard', { waitUntil: 'domcontentloaded' });
  await g2.waitForTimeout(150);
  ok(await g2.locator(BTN_ID).count() === 0, '基準3-e 参加者の非 live #scoreboard にも導線なし');
  await g2.close();
  await guest.close();

  // ---- 基準6 到達点は1箇所 ----
  const org2 = await browser.newContext();
  const p6 = await org2.newPage();
  await p6.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await p6.goto(TARGET + '#scoreboard', { waitUntil: 'domcontentloaded' });
  await p6.waitForTimeout(150);
  const organizerLinks = await p6.evaluate(() =>
    Array.from(document.querySelectorAll('#scoreboard-view button,#scoreboard-view a'))
      .map(e => (e.textContent || '').trim()).filter(t => t.indexOf('運営') >= 0));
  ok(JSON.stringify(organizerLinks) === JSON.stringify(['▶ 運営画面へ戻る']),
    '基準6 閲覧ビュー内の運営導線はこの1件だけ  [実測 ' + JSON.stringify(organizerLinks) + ']');
  // 再描画しても増殖しない
  await p6.evaluate(() => { renderScoreboard(); renderScoreboard(); renderScoreboard(); });
  await p6.waitForTimeout(100);
  ok(await p6.locator(BTN_ID).count() === 1, '再描画3回でも導線は1つのまま（idempotent）');
  await p6.close(); await org2.close();

  ok(errors.length === 0, '未捕捉例外なし' + (errors.length ? '（実際: ' + errors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-LIVE-ORGANIZER-RETURN-833: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
