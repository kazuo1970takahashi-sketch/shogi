// @ts-check
// Hotfix Phase 4 e2e: 対戦相手の変更 UI を replace + swap 自動分岐に拡張
// spec: docs/specs/20260508_1907_phase4_pairing_swap_spec.md (v2, ChatGPT A 判定済)
// plan: docs/specs/20260508_1937_phase4_pairing_swap_plan.md
// 対象: bindChangePairingModalEvents (chg-save) / changePairing 入口
// 軽量通過 5 項目: P0 / raw click / force:true / factory / 代表 e2e
const { test, expect } = require('@playwright/test');

// ペア配列を順序非依存で比較しやすい形に整形(p1<p2 の組として set 化)
function pairKey(pair) {
  return pair.p1 < pair.p2 ? pair.p1 + '|' + pair.p2 : pair.p2 + '|' + pair.p1;
}

// state 初期化: 4 名 (A,B,C,D) のクラス A、現在ラウンド pairings = [{A,B},{C,D}]
// pastResults: 過去ラウンドに対戦履歴を載せたい場合に渡す配列(各要素は match 配列)
async function setupTwoPairs(page, options = {}) {
  await page.evaluate((opts) => {
    window.state.players = {
      A: [
        { id: 'pA', name: 'Aさん', cls: 'A', member: 'member', grade: 'ippan' },
        { id: 'pB', name: 'Bさん', cls: 'A', member: 'member', grade: 'ippan' },
        { id: 'pC', name: 'Cさん', cls: 'A', member: 'member', grade: 'ippan' },
        { id: 'pD', name: 'Dさん', cls: 'A', member: 'member', grade: 'ippan' },
      ],
      B: [],
    };
    window.state.pairings = {
      A: [
        { p1: 'pA', p2: 'pB', winner: opts.winner0 || null },
        { p1: 'pC', p2: 'pD', winner: opts.winner1 || null },
      ],
      B: [],
    };
    window.state.results = {
      A: opts.pastResultsA || [],
      B: [],
    };
    window.state.started = true;
    window.renderTournament('A');
    window.save();
  }, options);
}

// 単一ペア (replace 用): 3 名 (A,B,C) で pairings = [{A,B}] のみ。C は state.players にあるが pairings に居ない
async function setupSinglePairWithExtra(page) {
  await page.evaluate(() => {
    window.state.players = {
      A: [
        { id: 'pA', name: 'Aさん', cls: 'A', member: 'member', grade: 'ippan' },
        { id: 'pB', name: 'Bさん', cls: 'A', member: 'member', grade: 'ippan' },
        { id: 'pC', name: 'Cさん', cls: 'A', member: 'member', grade: 'ippan' },
      ],
      B: [],
    };
    window.state.pairings = { A: [{ p1: 'pA', p2: 'pB', winner: null }], B: [] };
    window.state.results = { A: [], B: [] };
    window.state.started = true;
    window.renderTournament('A');
    window.save();
  });
}

test.describe('Hotfix Phase 4: pairing change replace + swap', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.clear(); } catch (e) {}
    });
    await page.goto('/shogi_v4.html');
  });

  // §7 #1: swap 成功
  test('swap 成功: A-B / C-D で B → C 変更 → A-C / B-D に更新', async ({ page }) => {
    await setupTwoPairs(page);
    page.on('dialog', (d) => d.accept());
    await page.evaluate(() => window.changePairing('A', 0));
    await expect(page.locator('#chg-modal')).toBeVisible();
    await page.selectOption('#chg-p2', 'pC');
    await page.click('#chg-save');
    await expect(page.locator('#chg-modal')).toHaveCount(0);
    const pairings = await page.evaluate(() => window.state.pairings.A);
    const keys = pairings.map(pairKey).sort();
    expect(keys).toEqual(['pA|pC', 'pB|pD']);
    pairings.forEach((p) => expect(p.winner).toBeNull());
  });

  // §7 #2: swap で再戦衝突 → 候補フィルタが事前に disabled 化
  //  PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT (PR #109) で
  //  「選んでもエラーになる」候補は事前 disabled になる新仕様に更新。
  //  旧仕様の事後 alert は安全網としてコード上残存（run_tests.sh の静的検査で担保）。
  test('swap で再戦衝突: 過去 A-C 対戦済 → pC option が事前 disabled, 状態不変', async ({ page }) => {
    await setupTwoPairs(page, {
      pastResultsA: [[{ p1: 'pA', p2: 'pC', winner: 'pA' }, { p1: 'pB', p2: 'pD', winner: 'pB' }]],
    });
    await page.evaluate(() => window.changePairing('A', 0));
    await expect(page.locator('#chg-modal')).toBeVisible();
    // pC option が後手 select 内で disabled + data-reason-id="R-rematch-swap"
    const pcOption = page.locator('#chg-p2 option[value="pC"]');
    await expect(pcOption).toHaveCount(1);
    await expect(pcOption).toBeDisabled();
    await expect(pcOption).toHaveAttribute('data-reason-id', 'R-rematch-swap');
    await expect(pcOption).toContainText('入替で再戦');
    // 「選択できない候補」optgroup 配下にある
    const blockedGroup = page.locator('#chg-p2 optgroup[label="選択できない候補"]');
    await expect(blockedGroup).toHaveCount(1);
    await expect(blockedGroup.locator('option[value="pC"]')).toHaveCount(1);
    // state.pairings は不変
    const pairings = await page.evaluate(() => window.state.pairings.A);
    expect(pairings.map(pairKey).sort()).toEqual(['pA|pB', 'pC|pD']);
  });

  // §7 #3: replace 成功(従来動作維持)
  test('replace 成功: 単一ペア A-B の B を未所属 C に置換 → A-C', async ({ page }) => {
    await setupSinglePairWithExtra(page);
    await page.evaluate(() => window.changePairing('A', 0));
    await page.selectOption('#chg-p2', 'pC');
    await page.click('#chg-save');
    await expect(page.locator('#chg-modal')).toHaveCount(0);
    const pairings = await page.evaluate(() => window.state.pairings.A);
    expect(pairings).toHaveLength(1);
    expect(pairKey(pairings[0])).toBe('pA|pC');
  });

  // §7 #4: swap 確認ダイアログキャンセル → 状態変化なし
  test('swap 確認ダイアログ cancel: state 不変', async ({ page }) => {
    await setupTwoPairs(page);
    page.on('dialog', (d) => d.dismiss());
    await page.evaluate(() => window.changePairing('A', 0));
    await page.selectOption('#chg-p2', 'pC');
    await page.click('#chg-save');
    const pairings = await page.evaluate(() => window.state.pairings.A);
    expect(pairings.map(pairKey).sort()).toEqual(['pA|pB', 'pC|pD']);
    // modal は cancel 後も開いたままの仕様(再入力可能)
    await expect(page.locator('#chg-modal')).toBeVisible();
  });

  // §7 #5: swap で過去結果に影響なし
  test('swap で state.results は不変', async ({ page }) => {
    const past = [[{ p1: 'pA', p2: 'pD', winner: 'pA' }, { p1: 'pB', p2: 'pC', winner: 'pC' }]];
    await setupTwoPairs(page, { pastResultsA: past });
    page.on('dialog', (d) => d.accept());
    const before = await page.evaluate(() => JSON.stringify(window.state.results.A));
    await page.evaluate(() => window.changePairing('A', 0));
    await page.selectOption('#chg-p2', 'pC');
    await page.click('#chg-save');
    const after = await page.evaluate(() => JSON.stringify(window.state.results.A));
    expect(after).toBe(before);
  });

  // §7 #6: winner 入力済みペアで「変更」 → modal 開かず + alert
  test('winner 入力済みペア: changePairing 呼出で modal 開かずエラー', async ({ page }) => {
    await setupTwoPairs(page, { winner0: 'pA' });
    let alertMsg = null;
    page.on('dialog', async (d) => { alertMsg = d.message(); await d.accept(); });
    await page.evaluate(() => window.changePairing('A', 0));
    expect(alertMsg).toContain('結果入力済みのため変更できません');
    await expect(page.locator('#chg-modal')).toHaveCount(0);
    const pairings = await page.evaluate(() => window.state.pairings.A);
    expect(pairings[0].winner).toBe('pA');
  });

  // §7 #7: swap 相手ペアが winner 入力済み → 候補フィルタが事前に disabled 化
  //  PAIRING-UX-MANUAL-CHANGE-CANDIDATE-FILTER-IMPL-LIGHT (PR #109) で
  //  winner-locked 相手ペアの選手は事前 disabled になる新仕様に更新。
  //  旧仕様の事後 alert は安全網としてコード上残存（run_tests.sh の静的検査で担保）。
  test('相手ペア winner 入力済み: pC / pD option が事前 disabled, 状態不変', async ({ page }) => {
    await setupTwoPairs(page, { winner1: 'pC' });
    await page.evaluate(() => window.changePairing('A', 0));
    await expect(page.locator('#chg-modal')).toBeVisible();
    // pC option が後手 select 内で disabled + data-reason-id="R-winner-locked"
    const pcOption = page.locator('#chg-p2 option[value="pC"]');
    await expect(pcOption).toHaveCount(1);
    await expect(pcOption).toBeDisabled();
    await expect(pcOption).toHaveAttribute('data-reason-id', 'R-winner-locked');
    await expect(pcOption).toContainText('結果入力済');
    // 同じ winner-locked ペアの相手 pD も disabled になっているはず（同じ理由）
    const pdOption = page.locator('#chg-p2 option[value="pD"]');
    await expect(pdOption).toHaveCount(1);
    await expect(pdOption).toBeDisabled();
    await expect(pdOption).toHaveAttribute('data-reason-id', 'R-winner-locked');
    // 「選択できない候補」optgroup 配下にある
    const blockedGroup = page.locator('#chg-p2 optgroup[label="選択できない候補"]');
    await expect(blockedGroup).toHaveCount(1);
    await expect(blockedGroup.locator('option[value="pC"]')).toHaveCount(1);
    // state.pairings は不変、winner も保持
    const pairings = await page.evaluate(() => window.state.pairings.A);
    expect(pairings.map(pairKey).sort()).toEqual(['pA|pB', 'pC|pD']);
    expect(pairings[1].winner).toBe('pC');
  });

  // §7 #8: swap 後の同ラウンド重複 0 件(getDuplicatePlayersInPairings 検証)
  test('swap 後 getDuplicatePlayersInPairings === 0', async ({ page }) => {
    await setupTwoPairs(page);
    page.on('dialog', (d) => d.accept());
    await page.evaluate(() => window.changePairing('A', 0));
    await page.selectOption('#chg-p2', 'pC');
    await page.click('#chg-save');
    const dups = await page.evaluate(() => window.getDuplicatePlayersInPairings('A'));
    expect(dups).toEqual([]);
  });
});
