#!/usr/bin/env node
// Playwright E2E: INDEX-ONBOARD-001（#841）— index.html の導入導線を**実ブラウザで**測る。
//
//   なぜ静的検査だけでは足りないか（Codex P2 r3800308124 の指摘）:
//     コントラストは cascade（詳細度）と**祖先の opacity**で決まる。CSS セレクタを
//     テスト側で部分的に再実装すると、`html body{opacity:.4}` のような書き方を取りこぼす。
//     タップ標的の実効サイズも、`contenteditable` や `audio[controls]` まで含めた
//     「対話要素」の列挙をテキストで完全にやるのは無理。
//     → **computed style と実際の矩形**を実ブラウザから取る。これが正本。
//     test/test_index_onboard_841.js 側の静的検査は「速い粗い網」として併存させる。
//
// 使い方: node test/e2e/index_onboard_841.e2e.js [index.html-or-url]
//   引数が shogi_v4.html を指す URL/パスでも、同じ場所の index.html に読み替える
//   （run_e2e.sh は全スイートへ同じ TARGET を渡すため）。
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
function toIndex(a) {
  if (!a) return 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
  const swapped = a.replace(/shogi_v4\.html/, 'index.html');
  return swapped.startsWith('http') ? swapped : 'file://' + path.resolve(swapped);
}
const TARGET = toIndex(arg);
const EXEC = process.env.PW_CHROME || undefined;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 本 PR 以前から存在する不適合（dev 58df479 の index.html:73 と同一）。別 issue 候補として記録済み。
const PREEXISTING_SMALL_TAPS = ['印刷用マニュアルはこちら'];

function relLum(rgb) {
  const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function parseRgb(s) { return (s.match(/\d+(\.\d+)?/g) || ['0', '0', '0']).slice(0, 3).map(Number); }
function ratio(fg, bg) {
  const [a, b] = [relLum(fg), relLum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
function over(fg, bg, alpha) { return [0, 1, 2].map(i => fg[i] * alpha + bg[i] * (1 - alpha)); }

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });

  // ---- A: 375×667（スマホ）------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(TARGET, { waitUntil: 'load' });

  // A1 全 .scope-note の実効コントラスト（computed style ＋ 祖先 opacity の積）
  const notes = await page.evaluate(() => Array.from(document.querySelectorAll('.scope-note')).map(el => {
    const cs = getComputedStyle(el);
    let op = 1, p = el;
    while (p && p !== document.documentElement) { op *= parseFloat(getComputedStyle(p).opacity || '1'); p = p.parentElement; }
    let bg = 'rgb(255, 255, 255)'; p = el;
    while (p) { const b = getComputedStyle(p).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)/.test(b)) { bg = b; break; } p = p.parentElement; }
    return { fg: cs.color, bg, op, t: (el.textContent || '').trim().slice(0, 14) };
  }));
  ok(notes.length >= 3, `A0 適用範囲の注記が3箇所以上ある（実測 ${notes.length}）`);
  const badNotes = notes.filter(n => ratio(over(parseRgb(n.fg), parseRgb(n.bg), n.op), parseRgb(n.bg)) < 4.5);
  ok(badNotes.length === 0,
     'A1 全 .scope-note が実効コントラスト 4.5:1 以上（cascade・祖先 opacity 込み）: ' +
     notes.map(n => `"${n.t}"@${n.op.toFixed(2)}=${ratio(over(parseRgb(n.fg), parseRgb(n.bg), n.op), parseRgb(n.bg)).toFixed(2)}`).join(' / '));

  // A2 導入カード内の全テキストが AA
  const cardTexts = await page.evaluate(() => {
    const card = document.querySelector('#for-other-clubs');
    if (!card) return null;
    return Array.from(card.querySelectorAll('*')).map(el => {
      const t = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (!t) return null;
      const cs = getComputedStyle(el);
      let op = 1, p = el;
      while (p && p !== document.documentElement) { op *= parseFloat(getComputedStyle(p).opacity || '1'); p = p.parentElement; }
      let bg = 'rgb(255, 255, 255)'; p = el;
      while (p) { const b = getComputedStyle(p).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)/.test(b)) { bg = b; break; } p = p.parentElement; }
      return { fg: cs.color, bg, op, t: t.slice(0, 18) };
    }).filter(Boolean);
  });
  ok(cardTexts !== null && cardTexts.length > 0, 'A2 導入カード #for-other-clubs が存在しテキストを持つ');
  const badCard = (cardTexts || []).filter(n => ratio(over(parseRgb(n.fg), parseRgb(n.bg), n.op), parseRgb(n.bg)) < 4.5);
  ok(badCard.length === 0,
     `A3 導入カード内の全テキストが AA 合格（${(cardTexts || []).length}要素）` +
     (badCard.length ? ': ' + badCard.map(b => `"${b.t}"`).join(',') : ''));

  // A4 タップ標的: フォーカス可能・クリック可能な要素を**実ブラウザで**列挙して実寸を測る
  const taps = await page.evaluate(() => {
    const SEL = 'a[href],button,input,select,textarea,summary,audio[controls],video[controls],' +
                '[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"]),' +
                '[role="button"],[role="link"],[role="checkbox"],[role="tab"],[onclick]';
    return Array.from(document.querySelectorAll(SEL)).map(e => {
      const r = e.getBoundingClientRect();
      return { t: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24),
               w: Math.round(r.width), h: Math.round(r.height) };
    });
  });
  ok(taps.length > 0, `A4 タップ標的を列挙できた（${taps.length}個）`);
  const small = taps.filter(t => t.h < 44 || t.w < 44);
  const smallNew = small.filter(t => !PREEXISTING_SMALL_TAPS.some(x => t.t.indexOf(x) !== -1));
  ok(smallNew.length === 0,
     'A5 本スライスのタップ標的が 44×44px 以上（§10.3）' +
     (smallNew.length ? ': ' + smallNew.map(t => `"${t.t}"=${t.w}x${t.h}`).join(' / ')
       : `（既存の不適合 ${small.length}件は別 issue: ` + small.map(t => `"${t.t}"=${t.w}x${t.h}`).join(' / ') + '）'));

  // A6 注記の中に対話要素が無い（44px を満たせないため置かない方針）
  const inNote = await page.evaluate(() => {
    const SEL = 'a[href],button,input,select,textarea,summary,audio[controls],video[controls],' +
                '[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex="-1"]),[role],[onclick]';
    return Array.from(document.querySelectorAll('.scope-note')).reduce(
      (acc, n) => acc.concat(Array.from(n.querySelectorAll(SEL)).map(e => e.tagName)), []);
  });
  ok(inNote.length === 0, `A6 適用範囲の注記の中に対話要素が無い（実測: ${inNote.join(',') || 'なし'}）`);

  // A7 導線アンカー: 第1画面にあり、押すと着地点へ飛び、フォーカスも移る
  const anchor = await page.evaluate(() => {
    const a = document.querySelector('a[href="#for-other-clubs"]');
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { top: Math.round(r.top), h: Math.round(r.height), vh: window.innerHeight };
  });
  ok(anchor !== null && anchor.top + anchor.h < anchor.vh,
     `A7 導線アンカーが第1画面にある（top=${anchor && anchor.top} h=${anchor && anchor.h} vh=${anchor && anchor.vh}）`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const landed = await page.evaluate(() => ({
    active: document.activeElement.id || document.activeElement.tagName,
    top: Math.round(document.querySelector('#for-other-clubs').getBoundingClientRect().top),
  }));
  ok(landed.active === 'for-other-clubs',
     `A8 Enter でフォーカスが着地点へ移る（active=${landed.active} top=${landed.top}）`);

  // A9 横スクロールが出ない（375px）
  const ov = await page.evaluate(() => ({ c: document.documentElement.clientWidth, s: document.documentElement.scrollWidth }));
  ok(ov.s <= ov.c, `A9 375px で横スクロールが出ない（client=${ov.c} scroll=${ov.s}）`);

  // A10 毎月使う役員の導線が第1画面に残る
  const appLink = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const a = document.querySelector('a.app-link');
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
  ok(appLink !== null && appLink.bottom < appLink.vh,
     `A10 「大会運営アプリを開く」が第1画面に残る（bottom=${appLink && appLink.bottom} vh=${appLink && appLink.vh}）`);

  ok(errs.length === 0, `A11 JS 例外なし（${errs.join(' / ') || 'なし'}）`);
  await ctx.close();

  // ---- B: 1366×657（ノートPC の実 innerHeight 相当）------------------------
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 657 } });
  const page2 = await ctx2.newPage();
  await page2.goto(TARGET, { waitUntil: 'load' });
  const pc = await page2.evaluate(() => {
    const a = document.querySelector('a[href="#for-other-clubs"]').getBoundingClientRect();
    const c = document.querySelector('#for-other-clubs').getBoundingClientRect();
    return { aTop: Math.round(a.top), aH: Math.round(a.height), cTop: Math.round(c.top), vh: window.innerHeight };
  });
  ok(pc.aTop + pc.aH < pc.vh,
     `B1 PC(1366×657) でもアンカーが第1画面にある（カードは top=${pc.cTop} で圏外＝アンカーが唯一の導線）`);
  ok(pc.aH >= 44, `B2 アンカーのタップ領域が 44px 以上（${pc.aH}px）`);
  await ctx2.close();

  await browser.close();
  console.log(`INDEX-ONBOARD-001 E2E: PASS=${pass} FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
