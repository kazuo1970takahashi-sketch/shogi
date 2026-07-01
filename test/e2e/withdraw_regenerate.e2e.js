#!/usr/bin/env node
// Playwright E2E: 実 Chromium で shogi_v4.html を開き、途中棄権後に
//   「組み合わせを再生成」ボタンを実クリックしてクラッシュ（未捕捉例外）しないことを検証する。
//   node/jsdom モックではなく本物のブラウザで DOM・イベント・ハンドラを通す UI レベルの回帰テスト。
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -D playwright            # 初回のみ（playwright 本体を node_modules に入れる）
//   npx playwright install chromium   # 初回のみ（Chromium 本体を取得。実行済みなら不要）
//   node test/e2e/withdraw_regenerate.e2e.js
//   # 本番を対象にする場合:
//   node test/e2e/withdraw_regenerate.e2e.js https://kazuo1970takahashi-sketch.github.io/shogi/shogi_v4.html?v=54
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

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 未捕捉例外（＝アプリのクラッシュ）を捕まえる
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  // confirm()/alert() は自動承認（「再生成すると勝敗が消えます。続けますか？」等）
  page.on('dialog', d => d.accept().catch(() => {}));

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof generatePairing === 'function', null, { timeout: 10000 });

  // 0) スモーク: 主要タブ／関数が存在
  const smoke = await page.evaluate(() => ({
    title: document.title,
    hasFns: ['generatePairing','setWinner','toggleWithdrawn','renderTournament','showTab','calcFinal','save']
      .every(n => typeof window[n] === 'function' || eval('typeof ' + n) === 'function'),
    guardInDeployed: (typeof generatePairing === 'function') && generatePairing.toString().indexOf('if(played[match.p1])') >= 0
  }));
  ok(smoke.hasFns, 'アプリの主要関数がロードされている');
  ok(smoke.guardInDeployed, 'generatePairing に棄権クラッシュ修正ガードが入っている');

  // 1) 途中棄権済みの2回戦進行中 state を構築して対局管理を描画
  await page.evaluate(() => {
    state = { players: { A: [
        { id:'p1', name:'一', entry_no:1, member:'member', grade:'ippan' },
        { id:'p2', name:'二', entry_no:2, member:'member', grade:'ippan', withdrawn:true },
        { id:'p3', name:'三', entry_no:3, member:'member', grade:'ippan' },
        { id:'p4', name:'四', entry_no:4, member:'member', grade:'ippan' } ], B: [] },
      rounds: 4,
      results: { A: [[{ p1:'p1', p2:'p2', winner:'p1' }, { p1:'p3', p2:'p4', winner:'p3' }]], B: [] },
      pairings: { A: [{ p1:'p2', p2:'p1', winner:'p1', lastModifiedBy:'auto' },
                       { p1:'p3', p2:'p4', winner:null, lastModifiedBy:'auto' }], B: [] },
      started: true,
      classes: [{ id:'A', name:'Aクラス', started:true }, { id:'B', name:'Bクラス', started:false }],
      report: {} };
    if (typeof showTab === 'function') showTab('tournament');
    if (typeof renderTournament === 'function') renderTournament('A');
  });

  const btn = await page.$('#repairBtn_A');
  ok(!!btn, '「組み合わせを再生成」ボタンが対局管理に描画される');

  // 2) 本物のボタンを実クリック（→ 実ハンドラ → generatePairing）
  if (btn) await btn.click();
  await page.waitForTimeout(300);

  // 3) 検証: クラッシュ無し／棄権者が新ペアリングから除外
  const after = await page.evaluate(() => ({
    pairings: (state.pairings.A || []).map(m => m.p1 + 'v' + m.p2),
    p2Included: (state.pairings.A || []).some(m => m.p1 === 'p2' || m.p2 === 'p2')
  }));
  ok(pageErrors.length === 0, '再生成クリックで未捕捉例外が出ない' + (pageErrors.length ? '（実際: ' + pageErrors[0] + '）' : ''));
  ok(!after.p2Included, '再生成後の組み合わせに棄権者(p2)が含まれない  [' + after.pairings.join(', ') + ']');

  await browser.close();

  console.log('\nE2E-WITHDRAW-REGENERATE: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
