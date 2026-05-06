// @ts-check
// §5.1 clickAndExpectChange.test.js: factory + raw callback 両形式の primary assertion 必須化を検証
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('./clickAndExpectChange');

const HTML = `<!doctype html><html><body>
  <button id="inc">+1</button>
  <span id="out">0</span>
  <span id="msg" style="display:none">done</span>
  <script>
    window.__counter = 0;
    document.getElementById('inc').addEventListener('click', () => {
      window.__counter += 1;
      document.getElementById('out').textContent = String(window.__counter);
      document.getElementById('msg').style.display = '';
    });
  </script>
</body></html>`;

async function setup(page) {
  await page.setContent(HTML);
}

async function expectFails(fn) {
  let caught = null;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).not.toBeNull();
  return caught;
}

test.describe('clickAndExpectChange', () => {
  test('factory 戻り値 + meta.primaryAssertions=1 で緑', async ({ page }) => {
    await setup(page);
    const factory = {
      assertion: async (before, after, p) => {
        const counter = await p.evaluate(() => window.__counter);
        expect(counter).toBe(1);
      },
      meta: { primaryAssertions: 1, primaryTypes: ['state'], operation: 'inc', description: 'inc' },
    };
    await clickAndExpectChange(page.locator('#inc'), factory);
  });

  test('factory 戻り値 + meta.primaryAssertions=0 で赤', async ({ page }) => {
    await setup(page);
    const factory = {
      assertion: async () => {},
      meta: { primaryAssertions: 0, primaryTypes: [], operation: 'noop', description: 'noop' },
    };
    const err = await expectFails(() => clickAndExpectChange(page.locator('#inc'), factory));
    expect(err.message).toMatch(/primary semantic assertion is required/);
  });

  test('raw callback + ctx.primary() 1 回で緑', async ({ page }) => {
    await setup(page);
    await clickAndExpectChange(page.locator('#inc'), async (before, after, ctx, p) => {
      ctx.primary('counter increased');
      const counter = await p.evaluate(() => window.__counter);
      expect(counter).toBe(1);
    });
  });

  test('raw callback + ctx.primary() 0 回で赤', async ({ page }) => {
    await setup(page);
    const err = await expectFails(() =>
      clickAndExpectChange(page.locator('#inc'), async () => {
        // ctx.primary() を呼ばない
      })
    );
    expect(err.message).toMatch(/primary semantic assertion is required/);
  });

  test('raw callback + 通知のみ確認 + ctx.primary() なしで赤', async ({ page }) => {
    await setup(page);
    const err = await expectFails(() =>
      clickAndExpectChange(page.locator('#inc'), async (before, after, ctx, p) => {
        // 通知が見えるかだけ確認(primary を呼ばない)
        await expect(p.locator('#msg')).toBeVisible();
      })
    );
    expect(err.message).toMatch(/primary semantic assertion is required/);
  });

  test('expectClickable 失敗時、expectedChange は呼ばれない', async ({ page }) => {
    await page.setContent('<button id="x" disabled>x</button>');
    let called = false;
    const err = await expectFails(() =>
      clickAndExpectChange(page.locator('#x'), async (before, after, ctx) => {
        called = true;
        ctx.primary('would be ignored');
      })
    );
    expect(called).toBe(false);
    expect(err).not.toBeNull();
  });

  test('options.beforeClick / afterClick が順序通り実行される', async ({ page }) => {
    await setup(page);
    const log = [];
    await clickAndExpectChange(
      page.locator('#inc'),
      async (before, after, ctx, p) => {
        ctx.primary('counter');
        const counter = await p.evaluate(() => window.__counter);
        expect(counter).toBe(1);
      },
      {
        beforeClick: async () => log.push('before'),
        afterClick: async () => log.push('after'),
      }
    );
    expect(log).toEqual(['before', 'after']);
  });

  test('factory の beforeClick / afterClick も自動拾われる', async ({ page }) => {
    await setup(page);
    const log = [];
    const factory = {
      assertion: async () => {},
      meta: { primaryAssertions: 1, primaryTypes: ['state'], operation: 'x', description: 'x' },
      beforeClick: async () => log.push('factory-before'),
      afterClick: async () => log.push('factory-after'),
    };
    await clickAndExpectChange(page.locator('#inc'), factory);
    expect(log).toEqual(['factory-before', 'factory-after']);
  });

  test('options.snapshot.selectors が getStateSnapshot に伝播する(NH#1)', async ({ page }) => {
    await setup(page);
    const captured = { before: null, after: null };
    await clickAndExpectChange(
      page.locator('#inc'),
      async (before, after, ctx) => {
        ctx.primary('check dom');
        captured.before = before.dom;
        captured.after = after.dom;
      },
      { snapshot: { selectors: { msg: '#msg' } } }
    );
    expect(captured.before).toHaveProperty('msg');
    expect(captured.after).toHaveProperty('msg');
    // before は display:none で不可視、after は表示済
    expect(captured.before.msg.visible).toBe(false);
    expect(captured.after.msg.visible).toBe(true);
  });
});
