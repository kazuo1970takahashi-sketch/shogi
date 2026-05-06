// @ts-check
// §5.1 getStateSnapshot.test.js (v1.3 新設、3 件以上必須)
const { test, expect } = require('@playwright/test');
const { getStateSnapshot } = require('./getStateSnapshot');

test.describe('getStateSnapshot', () => {
  test('state / master / localStorage / url / activeTab を返す', async ({ page }) => {
    // localStorage アクセスのため http origin を確立(about:blank では SecurityError)
    await page.goto('/index.html');
    await page.evaluate(() => {
      try { localStorage.clear(); } catch (e) {}
    });
    await page.setContent(`<!doctype html><html><body>
      <button class="tab" id="tab-reg">reg</button>
      <button class="tab active" id="tab-tournament">tournament</button>
      <button class="tab" id="tab-result">result</button>
    </body></html>`);
    await page.evaluate(() => {
      window.state = { players: { A: [], B: [] }, started: false };
      localStorage.setItem('shogi_v4', '{"x":1}');
      localStorage.setItem('shogi_branch_master', JSON.stringify({ schema_version: 1, members: [] }));
    });

    const snap = await getStateSnapshot(page);
    expect(snap.state).toEqual({ players: { A: [], B: [] }, started: false });
    expect(snap.master).toEqual({ schema_version: 1, members: [] });
    expect(snap.localStorage.shogi_v4).toBe('{"x":1}');
    expect(snap.localStorage.shogi_branch_master).toContain('schema_version');
    expect(snap.localStorage.shogi_v3).toBeNull();
    expect(snap.url).toMatch(/^http:\/\//);
    expect(snap.activeTab).toBe('tab-tournament');
  });

  test('options.selectors が指定された場合、dom フィールドに入る(NH#1)', async ({ page }) => {
    await page.setContent(`<!doctype html><html><body>
      <div id="x" data-foo="bar">hello</div>
      <div id="y" style="display:none">hidden</div>
    </body></html>`);

    const snap = await getStateSnapshot(page, { selectors: { x: '#x', y: '#y', missing: '#zzz' } });
    expect(snap.dom.x.exists).toBe(true);
    expect(snap.dom.x.text).toBe('hello');
    expect(snap.dom.x.attrs['data-foo']).toBe('bar');
    expect(snap.dom.y.exists).toBe(true);
    expect(snap.dom.y.visible).toBe(false);
    expect(snap.dom.missing.exists).toBe(false);
  });

  test('window.state が未定義の場合、state は null を返す', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    const snap = await getStateSnapshot(page);
    expect(snap.state).toBeNull();
    expect(snap.master).toBeNull();
    expect(snap.activeTab).toBeNull();
  });
});
