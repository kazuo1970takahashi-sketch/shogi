// @ts-check
// §5.2 サンプル e2e: A-T Stage 2a sanity
// 正常系 3 件 + 異常系 2 件 = 計 5 件、全件緑。
// raw click の使用ゼロ(Codex MF#1 反映、grep 検証対象)

const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../../helpers/clickAndExpectChange');
const { triggerInputFileAndExpectChange } = require('../../helpers/triggerInputFileAndExpectChange');
const { shogiAssertions } = require('../../helpers/shogi_assertions');

test.describe('A-T Stage 2a sanity', () => {
  test('正常系: 参加者追加が factory で緑になる', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    await page.locator('#inp-name').fill('テスト 太郎');
    await page.locator('#inp-yomi').fill('テスト タロウ');
    await page.locator('#inp-class').selectOption('A');

    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));

    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
  });

  test('異常系: primary assertion 0 件の expectedChange は必ず赤になる', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    await page.locator('#inp-name').fill('テスト 次郎');
    await page.locator('#inp-yomi').fill('テスト ジロウ');
    await page.locator('#inp-class').selectOption('A');

    let errorCaught = null;
    try {
      await clickAndExpectChange(page.locator('#addBtn'), async (before, after, ctx) => {
        // ctx.primary() を呼ばない = primary assertion 0 件
      });
    } catch (e) {
      errorCaught = e;
    }
    expect(errorCaught, 'primary assertion 0 件で必ずエラーになるべき').not.toBeNull();
    expect(errorCaught.message).toMatch(/primary semantic assertion is required/);
  });

  test('異常系: 通知のみの expectedChange も赤になる', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    await page.locator('#inp-name').fill('テスト 三郎');
    await page.locator('#inp-yomi').fill('テスト サブロウ');
    await page.locator('#inp-class').selectOption('A');

    let errorCaught = null;
    try {
      await clickAndExpectChange(page.locator('#addBtn'), async (before, after, ctx, p) => {
        await expect(p.locator('#reg-msg')).toBeVisible();
      });
    } catch (e) {
      errorCaught = e;
    }
    expect(errorCaught, '通知のみ確認では必ずエラーになるべき').not.toBeNull();
    expect(errorCaught.message).toMatch(/primary semantic assertion is required/);
  });

  test('正常系: 大会データコピーが clipboard primary で緑になる(v1.2 SF#2)', async ({ page, context }) => {
    const factory = shogiAssertions.tournamentDataCopied();
    const requiredPermissions = factory.meta.requiredPermissions || [];
    if (requiredPermissions.length > 0) {
      await context.grantPermissions(requiredPermissions);
    }

    await page.goto('/shogi_v4.html');
    // 事前準備も clickAndExpectChange 経由(raw click 排除、Codex MF#1)
    await page.locator('#inp-name').fill('テスト 四郎');
    await page.locator('#inp-yomi').fill('テスト シロウ');
    await page.locator('#inp-class').selectOption('A');
    await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'));

    // 本検証: tournamentDataCopied
    await clickAndExpectChange(page.locator('#saveBtn'), factory);

    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test('正常系: ファイル読込が triggerInputFileAndExpectChange で緑になる(v1.4 Codex MF#1/#2)', async ({ page }, testInfo) => {
    // v1.4: stateLoadedFromFile factory が beforeClick で dialog auto-accept、
    //        afterClick で FileReader.onload 完了 + state 反映を waitForFunction で待つ。
    //        テスト側はこの factory を渡すだけで confirm + FileReader + alert の 3 段に対応できる
    await page.goto('/shogi_v4.html');

    // テスト用の state JSON ファイルを生成
    const sampleState = {
      players: { A: [{ name: 'ファイル太郎', yomi: 'ファイルタロウ', cls: 'A' }], B: [] },
      pairings: { A: [], B: [] },
      results: { A: [], B: [] },
      started: false,
      rounds: 3,
    };
    const tmpFilePath = testInfo.outputPath('sample_state.json');
    require('fs').writeFileSync(tmpFilePath, JSON.stringify(sampleState));

    // triggerInputFileAndExpectChange + factory の 7 段:
    //   1. setInputFiles(#loadFile, filePath) → change イベント発火 → loadData(e) 呼出
    //   2. factory.beforeClick: page.on('dialog') で confirm/alert を計 2 回 auto-accept
    //   3. confirm 受諾 → FileReader.readAsText 開始(非同期)
    //   4. FileReader.onload で applyLoadedJson(state 復元、同期)
    //   5. alert('データを読み込みました') → auto-accept
    //   6. factory.afterClick: page.waitForFunction で state.players 反映を待つ
    //   7. assertion: state 変化 + expectedPlayersA/B 件数を検証
    await triggerInputFileAndExpectChange(
      page.locator('#loadFile'),
      tmpFilePath,
      shogiAssertions.stateLoadedFromFile(1, 0)
    );

    // 補助 assertion: UI 反映確認
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
  });
});
