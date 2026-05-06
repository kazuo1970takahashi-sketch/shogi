// @ts-check
// §5.1 expectClickable.test.js: 8 段階(段階 0〜7)の正常系・異常系
const { test, expect } = require('@playwright/test');
const { expectClickable } = require('./expectClickable');

// page.setContent で最小 HTML を流し込んで分離テスト
async function setHtml(page, body) {
  await page.setContent(`<!doctype html><html><body>${body}</body></html>`);
}

async function expectFails(fn) {
  let caught = null;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught, 'expectClickable は赤になるべきだが緑だった').not.toBeNull();
  return caught;
}

test.describe('expectClickable', () => {
  test('正常系: 通常の visible+enabled button で緑', async ({ page }) => {
    await setHtml(page, '<button id="b">OK</button>');
    await expectClickable(page.locator('#b'));
  });

  test('段階 1 赤: display:none で不可視', async ({ page }) => {
    await setHtml(page, '<button id="b" style="display:none">x</button>');
    await expectFails(() => expectClickable(page.locator('#b')));
  });

  test('段階 1 赤: disabled', async ({ page }) => {
    await setHtml(page, '<button id="b" disabled>x</button>');
    await expectFails(() => expectClickable(page.locator('#b')));
  });

  test('段階 3 赤: onclick も role もない div', async ({ page }) => {
    await setHtml(page, '<div id="b" style="width:50px;height:20px">x</div>');
    await expectFails(() => expectClickable(page.locator('#b')));
  });

  test('段階 4 赤: pointer-events: none', async ({ page }) => {
    await setHtml(page, '<button id="b" style="pointer-events:none">x</button>');
    await expectFails(() => expectClickable(page.locator('#b')));
  });

  test('段階 4 赤: opacity 0.3 (< 0.5)', async ({ page }) => {
    await setHtml(page, '<button id="b" style="opacity:0.3">x</button>');
    await expectFails(() => expectClickable(page.locator('#b')));
  });

  test('段階 5 赤: 祖先 inert', async ({ page }) => {
    await setHtml(page, '<div inert><button id="b">x</button></div>');
    await expectFails(() => expectClickable(page.locator('#b')));
  });

  test('段階 6 赤: overlay でブロック', async ({ page }) => {
    await setHtml(
      page,
      `<button id="b" style="position:absolute;left:10px;top:10px;width:80px;height:30px">x</button>
       <div id="ov" style="position:absolute;left:0;top:0;width:200px;height:200px;background:rgba(0,0,0,0.5);z-index:10"></div>`
    );
    await expectFails(() => expectClickable(page.locator('#b')));
  });

  test('段階 6 NH#2: 小要素(width<4)は中央 1 点のみ評価', async ({ page }) => {
    await setHtml(page, '<button id="b" style="width:2px;height:2px">.</button>');
    await expectClickable(page.locator('#b'));
  });

  test('段階 0 SF#1: viewport 外要素は scrollIntoViewIfNeeded で可視化される', async ({ page }) => {
    // viewport 高さの 5 倍下に置く → scroll なしでは hit-test 外
    await setHtml(
      page,
      `<div style="height:4000px"></div><button id="b">far</button>`
    );
    await expectClickable(page.locator('#b'));
  });
});
