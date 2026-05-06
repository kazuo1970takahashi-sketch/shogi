// @ts-check
// §3.2 拡張(Stage 2b): addEventListener-only 要素 / handler 不在の負動作テスト用。
// `expectClickable` の段階 3(handler 検出: tagName/role/inline onclick)のみ skip し、
// その他の到達性検証(段階 0/1/2/4/5/6)は維持する。
//
// 用途:
//   - production が `addEventListener('mousedown', ...)` 等で handler を登録する div/span
//     (Stage 2a `expectClickable` は inline `onclick` のみ検出のため誤判定する)
//   - クリックしても何も起こらないことを検証する負動作テスト(handler 不在が前提)
//
// Stage 2a helpers(`clickAndExpectChange` / `expectClickable`)は不変。本ファイルは
// Stage 2b で test/helpers/ に新規追加する(Stage 2b Mini 仕様書 §3 末尾 addendum)。

const { expect } = require('@playwright/test');
const { getStateSnapshot } = require('./getStateSnapshot');

async function expectClickableUnchecked(locator) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 1000 });
  } catch (e) {
    // viewport 外でない or 不可視 → 後続段階で判定
  }

  await expect(locator).toBeVisible({ timeout: 5000 });
  await expect(locator).toBeEnabled();

  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);

  // 段階 3 (handler 検出) は skip

  const handle = await locator.elementHandle();
  const styles = await handle.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      pointerEvents: cs.pointerEvents,
      opacity: parseFloat(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      borderRadius: parseFloat(cs.borderTopLeftRadius || '0'),
    };
  });
  expect(styles.pointerEvents, 'pointer-events: none').not.toBe('none');
  expect(styles.opacity, 'opacity 0.5 未満は不可').toBeGreaterThanOrEqual(0.5);
  expect(styles.visibility, 'visibility: hidden').not.toBe('hidden');
  expect(styles.display, 'display: none').not.toBe('none');

  const ancestorOk = await handle.evaluate((el) => {
    let cur = el.parentElement;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (cs.display === 'none') {
        return { ok: false, reason: 'ancestor display: none', tag: cur.tagName };
      }
      if (cur.hasAttribute && cur.hasAttribute('inert')) {
        return { ok: false, reason: 'ancestor inert', tag: cur.tagName };
      }
      cur = cur.parentElement;
    }
    return { ok: true, reason: '', tag: '' };
  });
  expect(ancestorOk.ok, `祖先 ${ancestorOk.tag} で ${ancestorOk.reason}`).toBe(true);

  const hitTestResult = await handle.evaluate((el, br) => {
    const rect = el.getBoundingClientRect();
    const isSmall = rect.width < 4 || rect.height < 4;
    const inset = isSmall ? 0 : Math.max(2, Math.ceil(br * 0.35));
    const points = isSmall
      ? [[rect.x + rect.width / 2, rect.y + rect.height / 2]]
      : [
          [rect.x + rect.width / 2, rect.y + rect.height / 2],
          [rect.x + inset, rect.y + inset],
          [rect.x + rect.width - inset, rect.y + inset],
          [rect.x + inset, rect.y + rect.height - inset],
          [rect.x + rect.width - inset, rect.y + rect.height - inset],
        ];
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (!top) return { ok: false, point: [x, y], reason: 'no element at point' };
      if (top !== el && !el.contains(top)) {
        return {
          ok: false,
          point: [x, y],
          reason: `blocked by ${top.tagName}${top.id ? '#' + top.id : ''}`,
        };
      }
    }
    return { ok: true, point: [0, 0], reason: '' };
  }, styles.borderRadius);
  expect(hitTestResult.ok, `hit-test 失敗: ${hitTestResult.reason}`).toBe(true);
}

/**
 * @param {import('@playwright/test').Locator} locator
 * @param {Function | object} expectedChange  factory 戻り値 or raw callback
 * @param {object} [options]
 * @param {Function} [options.beforeClick]
 * @param {Function} [options.afterClick]
 * @param {object} [options.snapshot]
 */
async function clickAndExpectChangeUnchecked(locator, expectedChange, options = {}) {
  await expectClickableUnchecked(locator);
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
      'clickAndExpectChangeUnchecked: expectedChange must be a function or factory result with { assertion, meta }'
    );
  }

  expect(
    primaryCount,
    `primary semantic assertion is required (>= 1), got ${primaryCount}. ` +
      `Use ctx.primary('description') in raw callback, or use a factory from shogi_assertions.js.`
  ).toBeGreaterThanOrEqual(1);
}

module.exports = { clickAndExpectChangeUnchecked, expectClickableUnchecked };
