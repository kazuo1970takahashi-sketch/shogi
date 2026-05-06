// @ts-check
// §3.2.5 (v1.3 で新設、Codex MF#2 解決): ファイル input 型操作専用。
// expectClickable をスキップ + setInputFiles 直接実行。change イベントは Playwright が自動発火。

const { expect } = require('@playwright/test');
const { getStateSnapshot } = require('./getStateSnapshot');

/**
 * @param {import('@playwright/test').Locator} fileInputLocator
 * @param {string | string[]} filePath
 * @param {Function | object} expectedChange  factory 戻り値 or raw callback(両ヘルパ共通形式)
 * @param {object} [options]
 * @param {Function} [options.beforeSetFiles]
 * @param {Function} [options.afterSetFiles]
 * @param {object} [options.snapshot]
 */
async function triggerInputFileAndExpectChange(fileInputLocator, filePath, expectedChange, options = {}) {
  const page = fileInputLocator.page();

  // 軽量検証: <input type="file"> であること
  const inputType = await fileInputLocator.evaluate((el) => el.getAttribute('type'));
  expect(
    inputType,
    'triggerInputFileAndExpectChange: locator must be <input type="file">'
  ).toBe('file');

  // factory beforeClick / options.beforeSetFiles を順に実行
  if (expectedChange && typeof expectedChange === 'object' && expectedChange.beforeClick) {
    await expectedChange.beforeClick(page);
  }
  if (options.beforeSetFiles) {
    await options.beforeSetFiles(page);
  }

  const before = await getStateSnapshot(page, options.snapshot || {});

  await fileInputLocator.setInputFiles(filePath);

  if (expectedChange && typeof expectedChange === 'object' && expectedChange.afterClick) {
    await expectedChange.afterClick(page);
  }
  if (options.afterSetFiles) {
    await options.afterSetFiles(page);
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
      'triggerInputFileAndExpectChange: expectedChange must be a function or factory result with { assertion, meta }'
    );
  }

  expect(
    primaryCount,
    `primary semantic assertion is required (>= 1), got ${primaryCount}. ` +
      `Use ctx.primary('description') in raw callback, or use a factory from shogi_assertions.js.`
  ).toBeGreaterThanOrEqual(1);
}

module.exports = { triggerInputFileAndExpectChange };
