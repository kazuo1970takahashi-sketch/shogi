// @ts-check
// §5.1 triggerInputFileAndExpectChange.test.js (v1.3 新設、Codex MF#2)
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { triggerInputFileAndExpectChange } = require('./triggerInputFileAndExpectChange');

const HTML = `<!doctype html><html><body>
  <input type="file" id="hidden-file" style="display:none">
  <input type="file" id="visible-file">
  <button id="not-file">x</button>
  <span id="size">0</span>
  <script>
    window.__lastFileSize = null;
    function attach(id) {
      document.getElementById(id).addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) {
          window.__lastFileSize = f.size;
          document.getElementById('size').textContent = String(f.size);
        }
      });
    }
    attach('hidden-file');
    attach('visible-file');
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

test.describe('triggerInputFileAndExpectChange', () => {
  test('factory 戻り値 + setInputFiles 成功で緑', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{"x":1}');

    const factory = {
      assertion: async (before, after, p) => {
        const size = await p.evaluate(() => window.__lastFileSize);
        expect(size).toBeGreaterThan(0);
      },
      meta: { primaryAssertions: 1, primaryTypes: ['state'], operation: 'fileLoaded', description: '' },
    };
    await triggerInputFileAndExpectChange(page.locator('#visible-file'), tmp, factory);
  });

  test('factory 戻り値 + meta.primaryAssertions=0 で赤', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{}');
    const factory = {
      assertion: async () => {},
      meta: { primaryAssertions: 0, primaryTypes: [], operation: 'noop', description: '' },
    };
    const err = await expectFails(() =>
      triggerInputFileAndExpectChange(page.locator('#visible-file'), tmp, factory)
    );
    expect(err.message).toMatch(/primary semantic assertion is required/);
  });

  test('対象が <input type="file"> でない場合に赤', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{}');
    const factory = {
      assertion: async () => {},
      meta: { primaryAssertions: 1, primaryTypes: ['state'], operation: 'x', description: '' },
    };
    const err = await expectFails(() =>
      triggerInputFileAndExpectChange(page.locator('#not-file'), tmp, factory)
    );
    expect(err.message).toMatch(/locator must be <input type="file">/);
  });

  test('raw callback + ctx.primary() 1 回で緑', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{"x":1}');
    await triggerInputFileAndExpectChange(
      page.locator('#visible-file'),
      tmp,
      async (before, after, ctx, p) => {
        ctx.primary('file uploaded');
        const size = await p.evaluate(() => window.__lastFileSize);
        expect(size).toBeGreaterThan(0);
      }
    );
  });

  test('raw callback + ctx.primary() 0 回で赤', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{}');
    const err = await expectFails(() =>
      triggerInputFileAndExpectChange(page.locator('#visible-file'), tmp, async () => {})
    );
    expect(err.message).toMatch(/primary semantic assertion is required/);
  });

  test('expectClickable がスキップされ display:none の file input でも緑', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{"x":1}');
    const factory = {
      assertion: async (before, after, p) => {
        const size = await p.evaluate(() => window.__lastFileSize);
        expect(size).toBeGreaterThan(0);
      },
      meta: { primaryAssertions: 1, primaryTypes: ['state'], operation: 'x', description: '' },
    };
    await triggerInputFileAndExpectChange(page.locator('#hidden-file'), tmp, factory);
  });

  test('factory の beforeClick / afterClick が呼ばれる(setInputFiles の前後)', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{"x":1}');
    const log = [];
    const factory = {
      assertion: async () => {},
      meta: { primaryAssertions: 1, primaryTypes: ['state'], operation: 'x', description: '' },
      beforeClick: async () => log.push('factory-before'),
      afterClick: async () => log.push('factory-after'),
    };
    await triggerInputFileAndExpectChange(page.locator('#visible-file'), tmp, factory);
    expect(log).toEqual(['factory-before', 'factory-after']);
  });

  test('options.beforeSetFiles / afterSetFiles が順序通り実行される', async ({ page }, testInfo) => {
    await setup(page);
    const tmp = testInfo.outputPath('a.json');
    fs.writeFileSync(tmp, '{"x":1}');
    const log = [];
    await triggerInputFileAndExpectChange(
      page.locator('#visible-file'),
      tmp,
      async (before, after, ctx) => {
        ctx.primary('uploaded');
      },
      {
        beforeSetFiles: async () => log.push('before'),
        afterSetFiles: async () => log.push('after'),
      }
    );
    expect(log).toEqual(['before', 'after']);
  });
});
