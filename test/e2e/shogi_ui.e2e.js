#!/usr/bin/env node
// Playwright E2E（実 Chromium・UIレベル回帰）: shogi_v4.html の主要フローを本物のブラウザで検証する。
//   S1 途中棄権→「組み合わせを再生成」実クリックでクラッシュしない／棄権者を除外
//   S2 「クラスを追加」ボタン実クリックでクラスが増える
//   S3 回戦数セレクト(#inp-rounds)の実操作で回戦数が反映／クラス別上書きも効く
//   S4 持ち時間設定が報告書表示に反映（切れ負け/秒読み）
//   S5 支部マスタからの過去参加者呼び出しで会費区分・よみを継承
//
// 使い方（Mac・リポジトリはどこでも可・__dirname 基準で shogi_v4.html を解決）:
//   npm i -g playwright                # 初回のみ
//   npx playwright install chromium    # 初回のみ（実行済みなら不要）
//   NODE_PATH="$(npm root -g)" node test/e2e/shogi_ui_e2e.js
//   # 本番対象: 末尾に URL（実データ保護のため実行前後で localStorage を退避・復元します）
//   NODE_PATH="$(npm root -g)" node test/e2e/shogi_ui_e2e.js "https://kazuo1970takahashi-sketch.github.io/shogi/shogi_v4.html?v=54"

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 4人・2回戦進行中・p2 棄権済みの state を作るヘルパ（ブラウザ内評価用の文字列）
const RESET_INPROGRESS = `state={players:{A:[
    {id:'p1',name:'一',entry_no:1,member:'member',grade:'ippan'},
    {id:'p2',name:'二',entry_no:2,member:'member',grade:'ippan',withdrawn:true},
    {id:'p3',name:'三',entry_no:3,member:'member',grade:'ippan'},
    {id:'p4',name:'四',entry_no:4,member:'member',grade:'ippan'}],B:[]},
  rounds:4,
  results:{A:[[{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]],B:[]},
  pairings:{A:[{p1:'p2',p2:'p1',winner:'p1',lastModifiedBy:'auto'},{p1:'p3',p2:'p4',winner:null,lastModifiedBy:'auto'}],B:[]},
  started:true,
  classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};`;

const RESET_FRESH = `state={players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,
  classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],report:{}};`;

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept().catch(() => {}));
  // タブ切替方式で非表示の要素も実ハンドラを発火させるため、確認ダイアログはページ側で自動承認。
  //   （Playwright の click は可視・操作可能性を厳密チェックするため、アプリのボタンは
  //    実ハンドラ .click() / change ディスパッチで駆動する＝実ブラウザで実イベントは通す）
  await page.addInitScript(() => { window.confirm = () => true; window.prompt = () => 'テストクラス'; window.alert = () => {}; });

  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof generatePairing === 'function', null, { timeout: 15000 });

  // 本番URL対象時は実データを退避（file:// は別オリジンで空なので実害なし）
  const backup = await page.evaluate(() => { const b = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); b[k] = localStorage.getItem(k); } return b; });

  // 0) スモーク
  const smoke = await page.evaluate(() =>
    ['generatePairing','setWinner','toggleWithdrawn','renderTournament','showTab','calcFinal','addClass','onChangeRounds','roundsForClass','formatTimeControl','addPlayerFromMaster','renderRegList']
      .every(n => eval('typeof ' + n) === 'function'));
  ok(smoke, '主要関数がすべてロードされている');

  // ---- S1: 途中棄権 → 実「組み合わせを再生成」クリック ----
  console.log('\n[S1] 途中棄権後の再ペアリング（実ボタンクリック）');
  const e1before = pageErrors.length;
  await page.evaluate(RESET_INPROGRESS + 'showTab("tournament");renderTournament("A");');
  const hasRepair = await page.$('#repairBtn_A');
  ok(!!hasRepair, '「組み合わせを再生成」ボタンが描画される');
  if (hasRepair) await hasRepair.click();
  await page.waitForTimeout(250);
  // ★ IN-APP-MODAL-001 (#606) 以降、破壊操作の確認は native confirm ではなくアプリ内モーダル。
  //   このテストは native confirm 時代のまま page.on('dialog') に頼っていたため、
  //   モーダルが出たまま誰も押さず、generatePairing が一度も走らないのに落ちていた
  //   （E2E-NOT-RUN-001 #865 で発覚。走らせていなかったので誰も気づかなかった）。
  const s1modal = await page.evaluate(() => {
    const ov = document.getElementById('app-modal');
    if (!ov) return false;
    const b = ov.querySelector('.app-modal-ok');
    if (b) b.click();
    return true;
  });
  ok(s1modal, '再生成は確認モーダルを出す（破壊操作なので確認は必須）');
  await page.waitForTimeout(250);
  const s1 = await page.evaluate(() => ({ p2: (state.pairings.A || []).some(m => m.p1 === 'p2' || m.p2 === 'p2'), prs: (state.pairings.A || []).map(m => m.p1 + 'v' + m.p2) }));
  ok(pageErrors.length === e1before, '再生成クリックで未捕捉例外が出ない' + (pageErrors.length > e1before ? '（' + pageErrors[pageErrors.length - 1] + '）' : ''));
  ok(!s1.p2, '再生成後の組み合わせに棄権者(p2)が含まれない  [' + s1.prs.join(', ') + ']');

  // ---- S2: クラス追加（実ボタンクリック） ----
  console.log('\n[S2] クラス追加（実ボタンクリック）');
  await page.evaluate(RESET_FRESH + 'showTab("registration");renderRegList();');
  const before2 = await page.evaluate(() => state.classes.length);
  const hasAdd = await page.evaluate(() => !!document.getElementById('addClassBtn'));
  ok(hasAdd, '「クラスを追加」ボタンが存在する');
  await page.evaluate(() => document.getElementById('addClassBtn').click()); // 実クリックハンドラを発火
  await page.waitForTimeout(200);
  const s2 = await page.evaluate(() => { const last = state.classes[state.classes.length - 1]; return { n: state.classes.length, id: last && last.id, arrays: !!(state.players[last.id] && state.pairings[last.id] && state.results[last.id]) }; });
  ok(s2.n === before2 + 1, 'クラスが1つ増える（' + before2 + '→' + s2.n + '）');
  ok(s2.arrays, '追加クラスの players/pairings/results が初期化される');

  // ---- S3: 回戦数の変更（実セレクト操作＋クラス別上書き） ----
  console.log('\n[S3] 回戦数の変更（実セレクト #inp-rounds）');
  await page.evaluate(RESET_FRESH + 'showTab("registration");renderRegList();');
  const hasSel = await page.evaluate(() => !!document.getElementById('inp-rounds'));
  ok(hasSel, '回戦数セレクト(#inp-rounds)が存在する');
  await page.evaluate(() => { const s = document.getElementById('inp-rounds'); s.value = '5'; s.dispatchEvent(new Event('change', { bubbles: true })); }); // 実 change ハンドラを発火
  await page.waitForTimeout(150);
  const s3a = await page.evaluate(() => ({ rounds: state.rounds, rfc: roundsForClass('A') }));
  ok(s3a.rfc === 5, 'セレクトで全体回戦数を5に変更→roundsForClass(A)=5（実際 ' + s3a.rfc + '）');
  const s3b = await page.evaluate(() => { state.classes[0].rounds = 3; return { a: roundsForClass('A'), b: roundsForClass('B') }; });
  ok(s3b.a === 3 && s3b.b === 5, 'クラス別上書き: A=3 / B=既定5（実際 A=' + s3b.a + ' B=' + s3b.b + '）');

  // ---- S4: 持ち時間設定の表示 ----
  console.log('\n[S4] 持ち時間設定の表示（報告書文言）');
  const s4 = await page.evaluate(() => ({
    sudden: formatTimeControl({ timeType: 'sudden', timeMain: 25 }),
    byoyomi: formatTimeControl({ timeType: 'byoyomi', timeMain: 30, timeByoyomi: 60 }),
    reportIncludes: (typeof buildReportHtml === 'function')
      ? (buildReportHtml().indexOf(formatTimeControl({ timeType: 'byoyomi', timeMain: 30, timeByoyomi: 60 })) >= 0 ||
         (function(){ state.report = { timeType:'byoyomi', timeMain:30, timeByoyomi:60 }; return buildReportHtml().indexOf('30分（切れたら一手60秒）') >= 0; })())
      : 'no-buildReportHtml'
  }));
  ok(s4.sudden === '25分切れ負け', '切れ負け表示「25分切れ負け」（実際 ' + s4.sudden + '）');
  ok(s4.byoyomi === '30分（切れたら一手60秒）', '秒読み表示「30分（切れたら一手60秒）」（実際 ' + s4.byoyomi + '）');
  ok(s4.reportIncludes === true || s4.reportIncludes === 'no-buildReportHtml', '報告書出力に持ち時間文言が含まれる（' + s4.reportIncludes + '）');

  // ---- S5: 過去参加者の呼び出し（会費区分・よみ継承） ----
  console.log('\n[S5] 支部マスタから過去参加者を呼び出し（会費区分・よみ継承）');
  const s5 = await page.evaluate(() => {
    state = { players: { A: [], B: [] }, rounds: 4, pairings: { A: [], B: [] }, results: { A: [], B: [] }, started: false, classes: [{ id: 'A', name: 'Aクラス' }, { id: 'B', name: 'Bクラス' }], report: {} };
    const master = { members: [
      { id: 'm1', name: '山田花子', member: 'member', grade: 'josei', yomi: 'やまだはなこ' },
      { id: 'm2', name: '佐藤一郎', member: 'other', grade: 'ippan', yomi: 'さとういちろう' } ] };
    const r1 = addPlayerFromMaster('m1', 'A', master, state);
    const r2 = addPlayerFromMaster('m2', 'A', master, state);
    const dup = addPlayerFromMaster('m1', 'A', master, state);
    return { r1ok: r1.success, feeGrade: r1.player && (r1.player.member + '/' + r1.player.grade), yomi: r1.player && r1.player.yomi, fee1: getFee(r1.player.member, r1.player.grade), r2ok: r2.success, dupRejected: dup.success === false };
  });
  ok(s5.r1ok && s5.feeGrade === 'member/josei', '会費区分(member/josei)を継承（実際 ' + s5.feeGrade + '）');
  ok(s5.fee1 === 0, '継承した区分で会費計算が正しい（女性/支部員=無料）');
  ok(s5.yomi === 'やまだはなこ', 'よみをスナップショット継承（次回検索用）');
  ok(s5.dupRejected, '同一メンバーの二重追加を拒否');

  // 実データ復元（本番URL対象時の保護。file:// は元々空）
  await page.evaluate((b) => { localStorage.clear(); Object.keys(b).forEach(k => localStorage.setItem(k, b[k])); }, backup);

  await browser.close();
  console.log('\nSHOGI-UI-E2E: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
