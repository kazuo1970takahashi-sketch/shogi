// @ts-check
// Layout Safety L-3 + L-4 ヘルパーの単体テスト
const { test, expect } = require('@playwright/test');
const {
  expectNoHorizontalOverflow,
  expectHeightInRange,
  expectLeftOf,
} = require('./layout-assertions');

async function setHtml(page, body) {
  await page.setContent(`<!doctype html><html><body style="margin:0;padding:0">${body}</body></html>`);
}

async function expectFails(fn) {
  let caught = null;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught, '失敗するべきだが緑になった').not.toBeNull();
  return caught;
}

// ============================================================
// expectNoHorizontalOverflow
// ============================================================
test.describe('expectNoHorizontalOverflow', () => {
  test('正常系: page で overflow なし → 緑', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await setHtml(page, '<div style="width:200px;height:50px">x</div>');
    await expectNoHorizontalOverflow(page);
  });

  test('正常系: locator で overflow なし → 緑', async ({ page }) => {
    await setHtml(page, '<div id="container" style="width:200px;overflow:hidden"><span style="display:inline-block;width:150px">x</span></div>');
    await expectNoHorizontalOverflow(page.locator('#container'));
  });

  test('異常系: page で要素が viewport を超える → 赤', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await setHtml(page, '<div style="width:600px;height:50px">x</div>');
    await expectFails(() => expectNoHorizontalOverflow(page));
  });

  test('異常系: locator で子要素が container を超える → 赤', async ({ page }) => {
    await setHtml(page, '<div id="container" style="width:100px;overflow:auto;white-space:nowrap"><span style="display:inline-block;width:300px">x</span></div>');
    await expectFails(() => expectNoHorizontalOverflow(page.locator('#container')));
  });

  test('edge: tolerance=1px の微小はみ出しは許容', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    // documentElement.scrollWidth が 401 = innerWidth(400) + 1 → tolerance 1 で pass
    await setHtml(page, '<div style="width:401px;height:50px">x</div>');
    await expectNoHorizontalOverflow(page, { tolerance: 1 });
  });

  test('edge: tolerance=0 ならば 1px はみ出しでも fail', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await setHtml(page, '<div style="width:401px;height:50px">x</div>');
    await expectFails(() => expectNoHorizontalOverflow(page, { tolerance: 0 }));
  });
});

// ============================================================
// expectHeightInRange
// ============================================================
test.describe('expectHeightInRange', () => {
  test('正常系: 高さが範囲内 → 緑', async ({ page }) => {
    await setHtml(page, '<div id="t" style="width:100px;height:30px;background:#ccc">x</div>');
    await expectHeightInRange(page.locator('#t'), { maxHeight: 50, minHeight: 10 });
  });

  test('異常系: maxHeight 超過 → 赤', async ({ page }) => {
    await setHtml(page, '<div id="t" style="width:100px;height:120px;background:#ccc">x</div>');
    await expectFails(() => expectHeightInRange(page.locator('#t'), { maxHeight: 60 }));
  });

  test('異常系: minHeight 未満 → 赤', async ({ page }) => {
    await setHtml(page, '<div id="t" style="width:100px;height:5px;background:#ccc"></div>');
    await expectFails(() => expectHeightInRange(page.locator('#t'), { maxHeight: 100, minHeight: 20 }));
  });

  test('異常系: maxHeight 未指定 → 即座にエラー', async ({ page }) => {
    await setHtml(page, '<div id="t" style="height:30px">x</div>');
    await expectFails(() => expectHeightInRange(page.locator('#t'), {}));
  });

  test('edge: 縦書き化検出のシナリオ(細い要素に多文字 → 高さ膨張)', async ({ page }) => {
    // 幅 30px に「あいうえおかきくけこ」を流すと折り返しで height が大きくなる
    await setHtml(page, '<div id="t" style="width:30px;font-size:14px;line-height:21px;overflow-wrap:anywhere">あいうえおかきくけこ</div>');
    // 5 行折り返しなら 105px。閾値 60px で fail を期待(=縦書き化検出)
    await expectFails(() => expectHeightInRange(page.locator('#t'), { maxHeight: 60 }));
  });
});

// ============================================================
// expectLeftOf
// ============================================================
test.describe('expectLeftOf', () => {
  test('正常系: A が B より左にある → 緑', async ({ page }) => {
    await setHtml(page, '<div style="display:flex"><span id="a" style="width:100px">A</span><span id="b" style="width:100px">B</span></div>');
    await expectLeftOf(page.locator('#a'), page.locator('#b'));
  });

  test('正常系: 隣接(A の右端 = B の左端)→ 緑', async ({ page }) => {
    await setHtml(page, '<div><span id="a" style="display:inline-block;width:50px">A</span><span id="b" style="display:inline-block;width:50px">B</span></div>');
    await expectLeftOf(page.locator('#a'), page.locator('#b'));
  });

  test('異常系: A が B より右にある → 赤', async ({ page }) => {
    await setHtml(page, '<div style="display:flex;flex-direction:row-reverse"><span id="a" style="width:100px">A</span><span id="b" style="width:100px">B</span></div>');
    await expectFails(() => expectLeftOf(page.locator('#a'), page.locator('#b')));
  });

  test('異常系: A が B にオーバーラップ → 赤', async ({ page }) => {
    await setHtml(page, '<div style="position:relative;height:30px"><span id="a" style="position:absolute;left:0;width:100px">A</span><span id="b" style="position:absolute;left:50px;width:100px">B</span></div>');
    await expectFails(() => expectLeftOf(page.locator('#a'), page.locator('#b')));
  });
});
