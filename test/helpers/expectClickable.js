// @ts-check
// §3.1: 要素がユーザー視点で実際にクリック可能であることを 8 段階で検証する。
// 段階 0  scrollIntoViewIfNeeded(v1.3 SF#1)
// 段階 1  toBeVisible / toBeEnabled
// 段階 2  width/height > 0
// 段階 3  クリック可能要素種別(button/a/input/role/onclick)
// 段階 4  pointer-events / opacity / visibility / display
// 段階 5  祖先 display:none / inert
// 段階 6  hit-test(中央 + 角 4 点、small 要素は中央のみ、self-or-descendant のみ許容、v1.3 SF#2)
// 段階 7  focus 可能性(任意、options.requireFocusable)

const { expect } = require('@playwright/test');

async function expectClickable(locator, options = {}) {
  // 段階 0: viewport 外要素を可視化(SF#1)。display:none / detached の場合は
  // scrollIntoViewIfNeeded が auto-wait で hang するため timeout を短く取り、
  // 失敗は握りつぶして段階 1 toBeVisible で正しく赤にする。
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

  const handle = await locator.elementHandle();
  const tagName = await handle.evaluate((el) => el.tagName.toLowerCase());
  const role = await handle.evaluate((el) => el.getAttribute('role'));
  const hasOnclick = await handle.evaluate((el) => typeof el.onclick === 'function');
  const isClickable =
    ['button', 'a', 'input'].includes(tagName) ||
    role === 'button' ||
    role === 'link' ||
    hasOnclick;
  expect(isClickable, `要素 ${tagName} はクリック可能でない`).toBe(true);

  const styles = await handle.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      pointerEvents: cs.pointerEvents,
      opacity: parseFloat(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      // 段階 6 hit-test で border-radius に応じた inset を計算するために使う。
      // getBoundingClientRect は矩形を返すが border-radius で角が削れているため、
      // 固定 inset=2 だと border-radius >= 4px の要素で角が親要素に当たる。
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

  // 段階 6: hit-test (NH#2 small 要素対応 + v1.3 SF#2 self-or-descendant のみ許容)
  // inset は border-radius を考慮して動的計算: 円弧 (1 - 1/√2) ≈ 0.293 のため
  // 0.35 倍を使えば border-radius 8px でも角が要素内部に確実に入る。
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

  if (options.requireFocusable) {
    await locator.focus();
    const isFocused = await handle.evaluate((el) => document.activeElement === el);
    expect(isFocused, 'focus できない').toBe(true);
  }
}

module.exports = { expectClickable };
