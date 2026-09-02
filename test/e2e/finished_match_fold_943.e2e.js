#!/usr/bin/env node
// Playwright E2E: FINISHED-MATCH-FOLD-001（Issue #943）— 終わった対局を下段へ畳む
//
//   出どころ: 実測で「大会が進んでも画面は短くならず、むしろ伸びる」ことが分かった
//   （30名2クラス・375px で進行 0%→100% が 12,905px→13,565px）。終わった対局が終わる前と
//   同じ大きさで残るため。いちばん疲れている終盤にいちばん長い、という作りだった。
//
//   ★ 作者裁定（2026-09-01）: 押した瞬間には畳まない。
//     「次の対局を操作するまでは畳まない」＝いま自分がいじった1件だけは上段に大きいまま残す。
//     すぐ畳むと押し間違いにその場で気づけなくなるため。
//
//   何を測るか: **どちらの段に描かれているか**。開閉の見た目ではない。
//   ★ details の open/closed を見るだけだと「畳んだつもりで上段に残っている」を通してしまう。
//   実際にクリックして段が移ることまで見る（3・5 は実操作）。
//
// 使い方（Mac・リポジトリ直下で）:
//   node test/e2e/finished_match_fold_943.e2e.js
//   node test/e2e/finished_match_fold_943.e2e.js <html-or-url>
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

// 6名1クラス＝3対局。少人数にして「どの対局がどちらの段に居るか」を目で追える大きさにする。
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

// 上段（.pairing-card として描かれている idx）と下段（畳まれている idx）を読む。
const SNAP = `(function(){
  var upper=[], lower=[];
  var cards=document.querySelectorAll('.pairing-card');
  for(var i=0;i<cards.length;i++){
    var b=cards[i].querySelector('button[id^="wb_A_"]');
    if(b)upper.push(parseInt(b.id.split('_')[2],10));
  }
  var det=document.querySelector('.finished-matches-details');
  if(det){
    var fx=det.querySelectorAll('button[id^="fixbtn_A_"]');
    for(var j=0;j<fx.length;j++)lower.push(parseInt(fx[j].id.split('_')[2],10));
  }
  var counter=document.querySelector('.alert-warn,.alert-ok');
  return {
    upper:upper, lower:lower,
    hasDetails:!!det, detailsOpen:det?det.open:null,
    summary:det?det.querySelector('summary').textContent.replace(/\\s+/g,''):null,
    counterText:counter?counter.textContent.replace(/\\s+/g,''):null,
    stateKeys:Object.keys(state).sort().join(','),
    pairingKeys:[...new Set(state.pairings.A.reduce(function(a,m){return a.concat(Object.keys(m));},[]))].sort().join(',')
  };
})()`;

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof renderTournament === 'function', null, { timeout: 15000 });

  const snap = () => page.evaluate(SNAP);
  const setup = () => page.evaluate((s) => { Object.assign(state, s); document.getElementById('tab-tournament').click(); }, FIXTURE());
  const click = (id) => page.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); return !!b; }, id);

  await setup();
  let S = await snap();

  // ---- F0: 出発点。3対局とも未入力＝全部上段・下段は無い
  ok(S.upper.join(',') === '0,1,2', 'F0 未入力3件は全部上段（実測 上段=[' + S.upper + ']）');
  ok(!S.hasDetails, 'F0b 畳むものが無いので details 自体を出さない');

  // ---- F1: 未入力の対局は必ず上段
  await click('wb_A_0_p1');                       // 0番の勝者を入れる
  S = await snap();
  ok(S.upper.indexOf(1) >= 0 && S.upper.indexOf(2) >= 0,
    'F1 未入力（1・2）は上段のまま（実測 上段=[' + S.upper + ']）');

  // ---- F2: 直前に操作した対局は、終わっていても上段
  ok(S.upper.indexOf(0) >= 0, 'F2 直前に操作した 0 は終わっていても上段（実測 上段=[' + S.upper + ']）');
  ok(!S.hasDetails, 'F2b このとき畳まれたものはまだ無い');

  // ---- F3: 次に別の対局を操作すると、前のものが下段へ落ちる
  await click('wb_A_1_p1');                       // 1番の勝者を入れる
  S = await snap();
  ok(S.lower.join(',') === '0', 'F3 前に操作した 0 が下段へ落ちた（実測 下段=[' + S.lower + ']）');
  ok(S.upper.indexOf(1) >= 0, 'F3b いま操作した 1 は上段に残る（実測 上段=[' + S.upper + ']）');
  ok(S.upper.indexOf(2) >= 0, 'F3c 未入力の 2 は上段のまま');
  ok(S.hasDetails && S.detailsOpen === false, 'F3d 下段は既定で閉じている（native disclosure）');
  // ★ Codex 2巡目 P2 の余波: 「match にキーを足していない」は**勝敗を入れた直後**に見ないと
  //   意味がない。回戦確定のあとは generatePairing が match を作り直すので、
  //   足したキーが消えていて変異を捕まえられなかった（実際に緑を通した）。
  const CANON = ['p1', 'p2', 'winner', 'lastModifiedBy'];
  const extraOf = keys => keys.split(',').filter(k => k && CANON.indexOf(k) < 0);
  ok(extraOf(S.pairingKeys).length === 0,
    'F3f 勝敗を入れた直後の match に正準形の外のキーが無い（実測 ' + S.pairingKeys +
    ' / はみ出し: ' + (extraOf(S.pairingKeys).join(',') || 'なし') + '）');
  ok(/終わった対局（1）/.test(S.summary || ''), 'F3e 見出しに件数が出る（実測 ' + S.summary + '）');

  // ---- F4: 下段の「直す」でその対局が上段へ戻る
  await click('fixbtn_A_0');
  S = await snap();
  ok(S.upper.indexOf(0) >= 0, 'F4 「直す」で 0 が上段へ戻った（実測 上段=[' + S.upper + ']）');
  ok(S.lower.join(',') === '1', 'F4b 入れ替わりに 1 が下段へ（実測 下段=[' + S.lower + ']）');
  const hasWb0 = await page.evaluate(() => !!document.getElementById('wb_A_0_p1'));
  ok(hasWb0, 'F4c 上段へ戻った 0 には勝者ボタンがある＝勝敗を入れ直せる（新しいモーダルは足していない）');

  // ---- F5: カウンタは畳んでも全対局を数える（DAYOF-UNENTERED-COUNTER を壊していない）
  ok(/残り1卓未入力です（全3卓）/.test(S.counterText || ''),
    'F5 カウンタは畳んだぶんも含めて全3卓を数える（実測 ' + S.counterText + '）');

  // ---- F6: 回戦を確定すると下段が空になる
  await click('wb_A_2_p1');                       // 残り1件を入れて全部入力済みに
  await click('submitBtn_A');
  await page.waitForTimeout(200);
  S = await snap();
  ok(S.lower.length === 0 && !S.hasDetails,
    'F6 回戦を確定すると下段が空になる（実測 下段=[' + S.lower + '] details=' + S.hasDetails + '）');
  ok(S.upper.length > 0, 'F6b 次の回戦の対局が上段に出ている（実測 上段=[' + S.upper + ']）');

  // ---- F7: ★保存しない。state にも match にも新しいキーを足していない
  ok(S.stateKeys.indexOf('lastTouched') < 0 && S.stateKeys.indexOf('folded') < 0,
    'F7 state に畳み用のキーを足していない（実測 ' + S.stateKeys + '）');
  // ★ Codex 2巡目 P2: 元は `=== 'p1,p2,winner' || indexOf('touched') < 0` と書いていた。
  //   || のせいで「touched という文字を含まない任意のキー」が素通りする＝
  //   folded / lastTouched 等を足しても緑のままだった。**正準形と完全一致**で見る。
  //   正準形は docs/REFERENCE.md の {p1, p2, winner, lastModifiedBy}。
  ok(extraOf(S.pairingKeys).length === 0,
    'F7b 回戦確定後の match にも正準形の外のキーが無い（実測 ' + S.pairingKeys +
    ' / はみ出し: ' + (extraOf(S.pairingKeys).join(',') || 'なし') + '）');

  // ---- F8: ★setWinner を経ずに「別の顔ぶれ」に差し替わったら、触った記憶は効かない
  //   バックアップ復元・取り込み・組み合わせの作り直しでは、勝敗の入った pairings が丸ごと差し替わる。
  //   「直前に操作した対局」を **index** で覚えていると、触ってもいない対局が上段に居座る。
  //   ★ index を忘れる処理をあちこちに置く手もあるが、それは変異で赤にできない（setWinner が
  //     必ず上書きするため）＝[[redundant-guards-are-untestable]] の型。だから覚え方を
  //     「回戦＋対戦の顔ぶれ」にして、忘れる処理そのものを不要にした。ここはその根拠。
  await setup();
  await click('wb_A_0_p1');                       // a0 vs a1 を触る
  await page.evaluate(() => {                     // 同じ index に**別の顔ぶれ**を入れる（作り直し相当）
    state.pairings.A = [{ p1: 'a0', p2: 'a2', winner: 'a0' },
                        { p1: 'a1', p2: 'a3', winner: 'a1' },
                        { p1: 'a4', p2: 'a5', winner: null }];
    renderTournament('A');
  });
  S = await snap();
  ok(S.lower.indexOf(0) >= 0 && S.lower.indexOf(1) >= 0,
    'F8 顔ぶれが変われば「触った」記憶は効かず両方とも下段（実測 下段=[' + S.lower + ']）');
  ok(S.upper.join(',') === '2', 'F8b 上段は未入力の 2 だけ（実測 上段=[' + S.upper + ']）');

  // ---- F9: 回戦が変われば、同じ顔ぶれでも触った記憶は効かない
  await setup();
  await click('wb_A_0_p1');                       // 1回戦の a0 vs a1 を触る
  await page.evaluate(() => {                     // 2回戦で同じ顔ぶれが再戦する場面
    state.results.A = [[{ p1: 'a0', p2: 'a1', winner: 'a0' }]];
    state.pairings.A = [{ p1: 'a0', p2: 'a1', winner: 'a1' },
                        { p1: 'a2', p2: 'a3', winner: 'a2' },
                        { p1: 'a4', p2: 'a5', winner: null }];
    renderTournament('A');
  });
  S = await snap();
  ok(S.lower.indexOf(0) >= 0, 'F9 回戦が変われば同じ顔ぶれでも下段（実測 下段=[' + S.lower + ']）');
  ok(S.upper.join(',') === '2', 'F9b 上段は未入力の 2 だけ（実測 上段=[' + S.upper + ']）');

  // ---- F10: ★色・フォント・枠は class で持つ（STYLE-GUIDE §1 / §2.2-4・Codex 1巡目 P2）
  //   インライン style は position/margin 等のレイアウト微調整のみ許容。
  //   ここは「class が付いているか」ではなく**実際に効いている値**を読む（宣言の grep にしない）。
  await setup();
  await click('wb_A_0_p1');
  await click('wb_A_1_p1');
  const style = await page.evaluate(() => {
    const det = document.querySelector('.finished-matches-details');
    const sum = det.querySelector('summary');
    const row = det.querySelector('.fm-row');
    const fix = det.querySelector('button[id^="fixbtn_"]');
    const cs = e => getComputedStyle(e);
    return {
      sumInline: sum.getAttribute('style'), rowInline: row.getAttribute('style'),
      fixInline: fix.getAttribute('style'),
      sumColor: cs(sum).color, sumBg: cs(sum).backgroundColor,
      fixH: Math.round(fix.getBoundingClientRect().height),
      sumH: Math.round(sum.getBoundingClientRect().height),
      winColor: cs(row.querySelector('.fm-win')).color
    };
  });
  ok(!style.sumInline && !style.rowInline && !style.fixInline,
    'F10 畳んだ行・summary・「直す」に inline style を持たせていない（実測 ' +
    JSON.stringify([style.sumInline, style.rowInline, style.fixInline]) + '）');
  ok(style.sumColor === 'rgb(31, 56, 100)', 'F10b summary の文字色は primary #1F3864 が効いている（実測 ' + style.sumColor + '）');
  ok(style.winColor === 'rgb(39, 80, 10)', 'F10c ○ は ok 色 #27500A が効いている（実測 ' + style.winColor + '）');
  ok(style.fixH >= 44, 'F10d class 化しても「直す」は 44px 以上（実測 ' + style.fixH + 'px）');
  // ★ Codex 2巡目 P2: summary は「終わった対局」を開く**唯一の操作**なのに 44px を測っていなかった。
  //   15px の文字＋10px の padding＋1px の枠で 39〜40px にしかならず §10.3 を満たさない。
  ok(style.sumH >= 44, 'F10e summary も 44px 以上（開く唯一の操作・実測 ' + style.sumH + 'px）');

  // ---- F11: ★新色を足していないこと（STYLE-GUIDE §1・Codex 2巡目 P2）
  //   「グレー系の補助色は既存値を流用」。cowork は #e4eaf1 という**既存にない値**を書いて
  //   おきながら「新色を足していない」とコメントしていた。**自己申告を検査に変える**。
  //   .fm-* の CSS ブロックに出てくる色が、それ以外の場所にも出てくることを確かめる。
  const colors = await page.evaluate(() => {
    // ★ コメントを先に落とす。落とさないと「#e4eaf1 は既存にない」と**書いた説明文**自体が
    //   「他所にも出てくる色」として数えられ、検査が自分の説明で緑になる（実際に踏んだ）。
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const block = css.split(/\n/).filter(l => /^\.fm-/.test(l.trim())).join('\n');
    const rest = css.split(/\n/).filter(l => !/^\.fm-/.test(l.trim())).join('\n');
    const used = [...new Set((block.match(/#[0-9a-fA-F]{3,6}\b/g) || []).map(x => x.toLowerCase()))];
    return { used: used, novel: used.filter(c => rest.toLowerCase().indexOf(c) < 0) };
  });
  ok(colors.used.length > 0, 'F11 .fm-* の CSS から色を採取できた（実測 ' + colors.used.join(' ') + '）');
  ok(colors.novel.length === 0,
    'F11b .fm-* に新色を足していない（他所に無い色: ' + (colors.novel.join(' ') || 'なし') + '）');

  ok(pageErrors.length === 0, '未捕捉例外が出ない' + (pageErrors.length ? '（実際: ' + pageErrors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-FINISHED-MATCH-FOLD-943: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
