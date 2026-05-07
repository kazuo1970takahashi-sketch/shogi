// @ts-check
// Layout Safety L-3 + L-4 ヘルパー(DevSecOps v2.0 §3.1 Layout Safety)
//
// 提供関数:
// - expectNoHorizontalOverflow(target, options): 水平 overflow(scrollWidth > clientWidth)を検出
// - expectHeightInRange(locator, options): 要素高さが指定範囲内であることを assert(縦書き化等の検出)
// - expectLeftOf(leftLocator, rightLocator): 要素 A が要素 B より左にあることを assert(横並び制約)
//
// 設計方針: shogi 専用ではなく汎用設計(将来 monorepo 化時に切り出し可能)。

const { expect } = require('@playwright/test');

/**
 * target に水平 overflow(scrollWidth > clientWidth)が無いことを assert。
 * Page を渡すと documentElement の scrollWidth と innerWidth を比較する。
 * Locator を渡すとその要素の scrollWidth と clientWidth を比較する。
 *
 * @param {import('@playwright/test').Locator | import('@playwright/test').Page} target
 * @param {object} [options]
 * @param {number} [options.tolerance=1] - 許容誤差 px(scrollbar の微小誤差吸収)
 * @param {string} [options.label] - 失敗時メッセージに含めるラベル
 */
async function expectNoHorizontalOverflow(target, options = {}) {
  const tolerance = typeof options.tolerance === 'number' ? options.tolerance : 1;
  const label = options.label || '';

  // Locator か Page かを判定: Locator は evaluate を要素に対して呼ぶ。Page は evaluate でグローバル window から取得。
  const isLocator = typeof target.evaluate === 'function' && typeof target.locator === 'function' && typeof target.page !== 'undefined';

  let scrollW, clientW;
  if (isLocator) {
    const m = await target.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    scrollW = m.scrollWidth;
    clientW = m.clientWidth;
  } else {
    // Page: documentElement.scrollWidth と window.innerWidth を比較
    const m = await target.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: window.innerWidth,
    }));
    scrollW = m.scrollWidth;
    clientW = m.clientWidth;
  }

  const overflow = scrollW - clientW;
  expect(
    overflow,
    `[${label || (isLocator ? 'locator' : 'page')}] horizontal overflow detected: scrollWidth(${scrollW}) - clientWidth(${clientW}) = ${overflow}px (tolerance ${tolerance}px)`
  ).toBeLessThanOrEqual(tolerance);
}

/**
 * 要素の高さが指定範囲内であることを assert(行高さ制約)。
 * 縦書き化検出(maxHeight 超過で fail)等に使う。
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {object} options
 * @param {number} options.maxHeight - 高さの上限 px(これを超えると fail)
 * @param {number} [options.minHeight=0] - 高さの下限 px(これ未満で fail)
 * @param {string} [options.label]
 */
async function expectHeightInRange(locator, options) {
  if (!options || typeof options.maxHeight !== 'number') {
    throw new Error('expectHeightInRange: options.maxHeight (number) is required');
  }
  const maxHeight = options.maxHeight;
  const minHeight = typeof options.minHeight === 'number' ? options.minHeight : 0;
  const label = options.label || 'element';

  const box = await locator.boundingBox();
  expect(box, `[${label}] boundingBox returned null (element not visible?)`).not.toBeNull();

  expect(
    box.height,
    `[${label}] height ${box.height}px is below minHeight ${minHeight}px`
  ).toBeGreaterThanOrEqual(minHeight);
  expect(
    box.height,
    `[${label}] height ${box.height}px exceeds maxHeight ${maxHeight}px (vertical overflow / 縦書き化 suspect)`
  ).toBeLessThanOrEqual(maxHeight);
}

/**
 * 要素 A が要素 B より左にあることを assert(横並び制約)。
 * leftLocator の右端 (x + width) <= rightLocator の左端 (x) を満たす。
 *
 * @param {import('@playwright/test').Locator} leftLocator
 * @param {import('@playwright/test').Locator} rightLocator
 * @param {object} [options]
 * @param {string} [options.label]
 */
async function expectLeftOf(leftLocator, rightLocator, options = {}) {
  const label = options.label || 'leftLocator vs rightLocator';
  const leftBox = await leftLocator.boundingBox();
  const rightBox = await rightLocator.boundingBox();
  expect(leftBox, `[${label}] left boundingBox returned null`).not.toBeNull();
  expect(rightBox, `[${label}] right boundingBox returned null`).not.toBeNull();
  const leftRight = leftBox.x + leftBox.width;
  expect(
    leftRight,
    `[${label}] left element right-edge (${leftRight.toFixed(1)}px) is not <= right element left-edge (${rightBox.x.toFixed(1)}px)`
  ).toBeLessThanOrEqual(rightBox.x);
}

module.exports = {
  expectNoHorizontalOverflow,
  expectHeightInRange,
  expectLeftOf,
};
