// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('index.html - スマホレイアウト (375px)', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('「準優勝」が1行に収まる (折り返しなし)', async ({ page }) => {
    const cell = page.locator('td.cell-rank', { hasText: '準優勝' });
    await expect(cell).toBeVisible();
    const box = await cell.boundingBox();
    if (!box) throw new Error('boundingBox not available');
    // 1行 = font-size 14px * line-height 1.7 ≒ 24px (padding 8*2 込みで ~40px)
    expect(box.height).toBeLessThan(48);
    // テキストが省略されていない (DOM の text と表示が一致)
    expect(await cell.textContent()).toContain('準優勝');
  });

  test('「1,000円」が改行されない (white-space: nowrap)', async ({ page }) => {
    const cells = page.locator('td.cell-amt', { hasText: '1,000円' });
    const count = await cells.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      // CSS が nowrap であること
      const ws = await cells.nth(i).evaluate((el) => getComputedStyle(el).whiteSpace);
      expect(ws).toBe('nowrap');
      // セル内テキストの実描画幅が cell の clientWidth を超えていない (= 改行や省略が起きていない)
      const fits = await cells.nth(i).evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const tw = r.getBoundingClientRect().width;
        return tw <= el.clientWidth + 1;
      });
      expect(fits).toBe(true);
    }
  });

  test('金額セルが右揃え (text-align: right)', async ({ page }) => {
    const cells = page.locator('td.cell-amt');
    const count = await cells.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const ta = await cells.nth(i).evaluate((el) => getComputedStyle(el).textAlign);
      expect(['right', 'end']).toContain(ta);
    }
  });

  test('全カードが表示される', async ({ page }) => {
    const cards = page.locator('.card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).toBeVisible();
    }
  });

  test('テーブルが横スクロールを発生させない', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });
});
