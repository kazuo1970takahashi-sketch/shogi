#!/usr/bin/env node
// Playwright E2E: DISCLOSURE-STATE-001（Issue #950）— <details> の開閉を再描画をまたいで保つ
//
//   出どころ: PR #949 の Codex 1巡目。対戦済みリスト（#661）・暫定成績（#944）・終わった対局（#943）は
//   renderTournament が innerHTML を組み直すたびに open を決め直すので、利用者が開いた一覧が
//   勝敗を1つ入れるたびに閉じていた（いちばん見たいタイミングで閉じる）。
//
//   何を測るか: **利用者が実際に summary をクリックして開いた（閉じた）あと、renderTournament を
//   起こす操作（勝者ボタン・「直す」）をまたいで、その details が同じ開閉のままか**。
//   ★ 既定（初回は畳む／PC は開く）を変えていないことを対照として先に測る。
//   ★ 回戦確定では既定へ戻る（覚え方が「種別＋クラス＋回戦」なので）＝設計判断をここで固定する。
//   ★ state と保存データに新しいキーが増えていないことも測る（メモリ上だけ）。
//
// 使い方（Mac・リポジトリ直下で）:
//   node test/e2e/disclosure_state_950.e2e.js
//   node test/e2e/disclosure_state_950.e2e.js <html-or-url>
//
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 6名1クラス＝3対局（#943 の e2e と同じ大きさ）。
function FIXTURE() {
  const NAMES = ['佐藤太郎', '鈴木一郎', '高橋次郎', '田中三郎', '伊藤四郎', '渡辺五郎'];
  const A = NAMES.map((n, i) => ({ id: 'a' + i, name: n, cls: 'A', entry_no: i + 1 }));
  return {
    classes: [{ id: 'A', name: 'Aクラス', started: true }],
    players: { A: A },
    results: { A: [] },
    pairings: { A: [{ p1: 'a0', p2: 'a1', winner: null },
                    { p1: 'a2', p2: 'a3', winner: null },
                    { p1: 'a4', p2: 'a5', winner: null }] },
    rounds: 2, started: true,
    report: { date: '2026-09-01', name: '沼津支部月例大会', office: '沼津市' }
  };
}

// 3つの details の open を読む（無ければ null）。
const SNAP = `(function(){
  function o(sel){ var d=document.querySelector(sel); return d?d.open:null; }
  return {
    score: o('.score-grid-details'),
    played: o('.played-history-details'),
    finished: o('.finished-matches-details'),
    stateKeys: Object.keys(state).sort().join(','),
    memKeys: (typeof _dsOpen==='object' && _dsOpen) ? Object.keys(_dsOpen).sort().join(',') : null,
    roundCount: (state.results.A||[]).length
  };
})()`;

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });

  // ======== 375px（スマホ・既定は畳む） ========
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof renderTournament === 'function', null, { timeout: 15000 });

    const snap = () => page.evaluate(SNAP);
    const click = (id) => page.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); return !!b; }, id);
    // 実クリックで summary を叩く（native disclosure を通す＝toggle イベントが発火する経路）
    const tapSummary = async (sel) => { await page.click(sel + ' > summary'); await page.waitForTimeout(50); };

    const stateKeysBefore = await page.evaluate(() => Object.keys(state).sort().join(','));
    await page.evaluate((s) => { Object.assign(state, s); document.getElementById('tab-tournament').click(); }, FIXTURE());
    let S = await snap();

    // ---- G0: 既定は変えていない（対照）
    ok(S.score === false, 'G0 375px: 暫定成績は既定で閉じている（実測 open=' + S.score + '）');
    ok(S.played === false, 'G0b 375px: 対戦済みリストは既定で閉じている（実測 open=' + S.played + '）');
    ok(S.finished === null, 'G0c 畳むものが無いので「終わった対局」はまだ無い');
    ok(S.memKeys === '', 'G0d 描画しただけでは何も覚えていない（toggle は利用者の操作でだけ起きる・実測 keys=' + JSON.stringify(S.memKeys) + '）');

    // ---- G1: 利用者が暫定成績を開く → 勝敗を入れる（renderTournament）→ 開いたまま
    await tapSummary('.score-grid-details');
    S = await snap();
    ok(S.score === true, 'G1 summary をタップすると暫定成績が開く（実測 open=' + S.score + '）');
    await click('wb_A_0_p1');
    S = await snap();
    ok(S.score === true, 'G1b 勝敗を入れて再描画しても暫定成績は開いたまま（★#950 の本題・実測 open=' + S.score + '）');
    ok(S.played === false, 'G1c 触っていない対戦済みリストは既定（閉）のまま');

    // ---- G2: 対戦済みリストも同じ
    await tapSummary('.played-history-details');
    await click('wb_A_1_p1');
    S = await snap();
    ok(S.played === true, 'G2 対戦済みリストを開いてから勝敗を入れても開いたまま（実測 open=' + S.played + '）');
    ok(S.score === true, 'G2b 暫定成績も開いたまま（複数を独立に覚える）');

    // ---- G3: 終わった対局（#943）も同じ。開いて「直す」（renderTournament）をまたぐ
    ok(S.finished === false, 'G3 「終わった対局」は既定で閉じている（実測 open=' + S.finished + '）');
    await tapSummary('.finished-matches-details');
    S = await snap();
    ok(S.finished === true, 'G3b タップで開く');
    await click('fixbtn_A_0');                     // 0 を上段へ戻す＝再描画。1 が下段へ落ちるので details は残る
    S = await snap();
    ok(S.finished === true, 'G3c 「直す」で再描画しても「終わった対局」は開いたまま（実測 open=' + S.finished + '）');

    // ---- G4: 閉じる操作も覚える（開く方向だけの特別扱いではない）
    await tapSummary('.score-grid-details');       // 閉じる
    S = await snap();
    ok(S.score === false, 'G4 もう一度タップすると閉じる');
    await click('wb_A_2_p1');
    S = await snap();
    ok(S.score === false, 'G4b 閉じたあとの再描画でも閉じたまま（実測 open=' + S.score + '）');
    ok(S.played === true, 'G4c 対戦済みリストは開いたまま（他の details に影響しない）');

    // ---- G5: state と保存データに新しいキーが増えていない
    ok(S.stateKeys === stateKeysBefore, 'G5 state のキーは増えていない（実測 ' + S.stateKeys + '）');
    const saved = await page.evaluate(() => {
      try { if (typeof save === 'function') save(); } catch (e) {}
      var out = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); out.push(k + '=' + (localStorage.getItem(k) || '')); }
      return out.join('\n');
    });
    ok(saved.indexOf('_dsOpen') < 0 && saved.indexOf('dsOpen') < 0, 'G5b 保存データ（localStorage）に開閉の記憶は入らない');
    ok(S.memKeys.split(',').every(k => /^(score|played|finished)\|A\|0$/.test(k)), 'G5c 覚えているキーは 種別|クラス|回戦 の形（実測 ' + S.memKeys + '）');

    // ---- G6: 回戦を確定すると既定へ戻る（覚え方が回戦を含む＝設計判断をここで固定）
    await page.evaluate(() => { document.getElementById('wb_A_0_p1') && document.getElementById('wb_A_0_p1').click(); });
    S = await snap();
    await click('submitBtn_A');
    await page.waitForTimeout(200);
    S = await snap();
    ok(S.roundCount === 1, 'G6 回戦が確定した（実測 results=' + S.roundCount + '）');
    ok(S.played === false, 'G6b 回戦が変わると対戦済みリストは既定（閉）へ戻る（実測 open=' + S.played + '）');
    ok(S.score === false, 'G6c 暫定成績も既定（閉）（実測 open=' + S.score + '）');

    ok(pageErrors.length === 0, 'G7 未捕捉例外なし' + (pageErrors.length ? '（' + pageErrors[0] + '）' : ''));
    await ctx.close();
  }

  // ======== 1024px（PC・既定は開く） ========
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 } });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof renderTournament === 'function', null, { timeout: 15000 });
    const snap = () => page.evaluate(SNAP);
    const click = (id) => page.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); return !!b; }, id);
    await page.evaluate((s) => { Object.assign(state, s); document.getElementById('tab-tournament').click(); }, FIXTURE());
    let S = await snap();
    ok(S.score === true && S.played === true, 'P0 1024px: 暫定成績・対戦済みリストは既定で開いている（対照・実測 ' + S.score + '/' + S.played + '）');
    // ★ Chromium は open 付きで挿入した details にも toggle を1回投げる。それを覚えてしまうと
    //   描画時の幅の既定が固定される。利用者が触るまでは何も覚えていないことを PC 側でも測る。
    await page.waitForTimeout(100);
    S = await snap();
    ok(S.memKeys === '', 'P0b 1024px でも描画しただけでは何も覚えていない（挿入時の toggle を利用者の操作と混同しない・実測 keys=' + JSON.stringify(S.memKeys) + '）');
    await page.click('.score-grid-details > summary');   // 閉じる
    await page.waitForTimeout(50);
    await click('wb_A_0_p1');
    S = await snap();
    ok(S.score === false, 'P1 PC で閉じたあと再描画しても閉じたまま（実測 open=' + S.score + '）');
    ok(S.played === true, 'P1b 触っていない対戦済みリストは既定（開）のまま');

    // ---- 幅が変わったとき（#950 の 2 件目の実測）: 覚えていなければ次の再描画で新しい幅の既定に従う
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForTimeout(100);
    S = await snap();
    ok(S.played === true, 'P2 幅を 375 に変えただけでは描き直さない＝開いたまま（実測 open=' + S.played + '）');
    await click('wb_A_1_p1');
    S = await snap();
    ok(S.played === false, 'P2b 次の再描画で 375px の既定（閉）に従う＝触っていない details は幅の既定に収束する（実測 open=' + S.played + '）');
    ok(S.score === false, 'P2c 閉じる操作を覚えた暫定成績は閉じたまま');
    await ctx.close();
  }

  await browser.close();
  console.log('\nE2E-DISCLOSURE-STATE-950: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
