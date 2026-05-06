// @ts-check
// §3.2: 標準クリック型操作専用。expectClickable + click + state 変化検証 + primary assertion 必須化。
// ファイル input 型操作は §3.2.5 triggerInputFileAndExpectChange を使うこと。

const { expect } = require('@playwright/test');
const { expectClickable } = require('./expectClickable');
const { getStateSnapshot } = require('./getStateSnapshot');

/**
 * @typedef {import('./shogi_assertions').ExpectedChangeFactory} ExpectedChangeFactory
 *   `clickAndExpectChange` および `triggerInputFileAndExpectChange` に渡す factory の戻り値型。
 *   両ヘルパで共通利用(§4.3 冒頭の typedef を参照)。
 */

/**
 * @param {import('@playwright/test').Locator} locator
 * @param {Function | object} expectedChange  factory 戻り値 or raw callback
 * @param {object} [options]
 * @param {Function} [options.beforeClick]
 * @param {Function} [options.afterClick]
 * @param {object} [options.snapshot]  getStateSnapshot に渡すオプション(NH#1)
 */
async function clickAndExpectChange(locator, expectedChange, options = {}) {
  await expectClickable(locator);
  const page = locator.page();

  if (expectedChange && typeof expectedChange === 'object' && expectedChange.beforeClick) {
    await expectedChange.beforeClick(page);
  }
  if (options.beforeClick) {
    await options.beforeClick(page);
  }

  const before = await getStateSnapshot(page, options.snapshot || {});

  await locator.click(); // force: true 禁止

  if (expectedChange && typeof expectedChange === 'object' && expectedChange.afterClick) {
    await expectedChange.afterClick(page);
  }
  if (options.afterClick) {
    await options.afterClick(page);
  }

  const after = await getStateSnapshot(page, options.snapshot || {});

  let primaryCount = 0;

  if (typeof expectedChange === 'function') {
    const ctx = {
      _primaryCount: 0,
      primary(description) {
        this._primaryCount += 1;
        return description;
      },
    };
    await expectedChange(before, after, ctx, page);
    primaryCount = ctx._primaryCount;
  } else if (
    expectedChange &&
    typeof expectedChange === 'object' &&
    typeof expectedChange.assertion === 'function'
  ) {
    await expectedChange.assertion(before, after, page);
    primaryCount = (expectedChange.meta && expectedChange.meta.primaryAssertions) || 0;
  } else {
    throw new Error(
      'clickAndExpectChange: expectedChange must be a function or factory result with { assertion, meta }'
    );
  }

  expect(
    primaryCount,
    `primary semantic assertion is required (>= 1), got ${primaryCount}. ` +
      `Use ctx.primary('description') in raw callback, or use a factory from shogi_assertions.js.`
  ).toBeGreaterThanOrEqual(1);
}

module.exports = { clickAndExpectChange };
