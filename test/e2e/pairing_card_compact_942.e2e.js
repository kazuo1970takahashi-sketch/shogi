#!/usr/bin/env node
// Playwright E2E: PAIRING-CARD-COMPACT-001（Issue #942）— 対局カードの高さ
//
//   出どころ: 作者「スクロールが延々と続く（ページが長い）」。実測すると対局管理の 42% が対局カード。
//
//   何を測るか: **実際に描かれたカードの高さ**と**行の本数**。
//   ★ CSS の宣言や HTML の構造だけでは高さは分からない。高さは font / ふりがな / 幅 / flex の
//     相互作用で決まる。実際、#941 では「卓番バッジを消せばヘッダ行 44px が減る」という
//     見込みが外れて 0px だった（行の高さを決めていたのはボタンの min-height だった）。
//     以後この面は**実ブラウザで実寸を読む**。
//
//   なぜ実ブラウザか: DOM モックには行box もレイアウトも無く、壊れた実装でも緑になる。
//   構造側（どの行にボタンが居るか）は test/test_tap_target_dense_001.js S2 が静的に見ている。
//
// 使い方（Mac・リポジトリ直下で）:
//   node test/e2e/pairing_card_compact_942.e2e.js
//   node test/e2e/pairing_card_compact_942.e2e.js <html-or-url>
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

// 30名×2クラス。名前・読みは font_floor_001.e2e.js の FIXTURE と同じ並びを使う。
function FIXTURE() {
  const NAMES = ['佐藤太郎','鈴木一郎','高橋次郎','田中三郎','伊藤四郎','渡辺五郎','山本六郎','中村七郎',
                 '小林八郎','加藤九郎','吉田十郎','山田花子','佐々木桜','山口美咲','松本葵','井上翔太'];
  const YOMI  = ['さとうたろう','すずきいちろう','たかはしじろう','たなかさぶろう','いとうしろう','わたなべごろう','やまもとろくろう','なかむらしちろう',
                 'こばやしはちろう','かとうくろう','よしだじゅうろう','やまだはなこ','ささきさくら','やまぐちみさき','まつもとあおい','いのうえしょうた'];
  const N = 30;
  const mk = (i, cls) => ({ id: 'p' + cls + i, name: NAMES[i % NAMES.length], yomi: YOMI[i % YOMI.length], cls: cls,
                            member: (i % 2 ? 'member' : 'guest'), grade: (i % 3 === 0 ? 'ippan' : (i % 3 === 1 ? 'chu' : 'josei')),
                            city: '沼津市', entry_no: i + 1 });
  const A = [], B = [];
  for (let i = 0; i < N; i++) A.push(mk(i, 'A'));
  for (let i = 0; i < N; i++) B.push(mk(i, 'B'));
  const rnd = (ps, off) => { const out = [];
    for (let i = 0; i < ps.length; i += 2) out.push({ p1: ps[(i + off) % ps.length].id, p2: ps[(i + 1 + off) % ps.length].id, winner: ps[(i + off) % ps.length].id });
    return out; };
  return {
    // ★ started:true が要る（無いと対局管理が未開始画面になり測定対象が変わる）
    classes: [{ id: 'A', name: 'Aクラス', started: true }, { id: 'B', name: 'Bクラス', started: true }],
    players: { A: A, B: B },
    results: { A: [rnd(A, 0), rnd(A, 1)], B: [rnd(B, 0), rnd(B, 1)] },
    pairings: { A: rnd(A, 2).map(m => ({ p1: m.p1, p2: m.p2, winner: null })), B: rnd(B, 2).map(m => ({ p1: m.p1, p2: m.p2, winner: null })) },
    rounds: 3, started: true,
    report: { date: '2026-09-01', name: '沼津支部月例大会', office: '沼津市' }
  };
}

// カードの実寸と行構成を読む。emptyLabels=true なら理由ラベルを1つも出さない場面にする。
function readCards(s, emptyLabels) {
  if (emptyLabels && typeof evaluatePairingQuality === 'function') {
    const orig = evaluatePairingQuality;
    window.evaluatePairingQuality = function (a, b, c) {
      const q = orig(a, b, c);
      (q.pairDetails || []).forEach(function (d) { d.labels = []; });
      return q;
    };
  }
  Object.assign(state, s);
  document.getElementById('tab-tournament').click();
  const H = e => Math.round(e.getBoundingClientRect().height);
  const cards = [...document.querySelectorAll('.pairing-card')];
  const hs = cards.map(H);
  const c = cards[0];
  const rows = [...c.children].map(x => ({ h: H(x), hasChg: !!x.querySelector('button[id^=chgbtn]'),
                                           isWinnerRow: x.classList.contains('winner-row') }));
  const chg = c.querySelector('button[id^=chgbtn]');
  return {
    n: cards.length,
    avg: Math.round(hs.reduce((a, x) => a + x, 0) / cards.length),
    max: Math.max(...hs),
    rowCount: rows.length,
    rows: rows,
    chgH: chg ? H(chg) : null,
    chgW: chg ? Math.round(chg.getBoundingClientRect().width) : null,
    chgId: chg ? chg.id : null,
    padTop: getComputedStyle(c).paddingTop,
    padBottom: getComputedStyle(c).paddingBottom,
    marginBottom: getComputedStyle(c).marginBottom,
    minChgH: Math.min(...cards.map(x => { const b = x.querySelector('button[id^=chgbtn]'); return b ? H(b) : 0; })),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    page: Math.round(document.documentElement.scrollHeight)
  };
}

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  // Playwright の evaluate は引数1つなので、2引数版はラップして渡す
  const measure = async (emptyLabels) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof renderTournament === 'function', null, { timeout: 15000 });
    const r = await page.evaluate(([fn, s, el]) => (new Function('return ' + fn))()(s, el),
                                  [readCards.toString(), FIXTURE(), emptyLabels]);
    await ctx.close();
    return r;
  };
  const N = await measure(false);
  const E = await measure(true);

  ok(N.n === 30, 'P0 対局カードが30枚（測定対象の確認・実測 ' + N.n + '枚）');

  // ---- C1: 専用のヘッダ行が無い（カード直下は「対戦行」と「理由ラベル＋変更の行」の2本）
  ok(N.rowCount === 2, 'C1 カード直下の行は2本（専用ヘッダ行が無い・実測 ' + N.rowCount + '本）');
  ok(N.rows[0] && N.rows[0].isWinnerRow, 'C1b 1本目が対戦行');
  ok(N.rows[1] && N.rows[1].hasChg, 'C1c 2本目（理由ラベルの行）に「変更」が同居している');
  ok(N.rows[0] && !N.rows[0].hasChg, 'C1d 「変更」は対戦行の中には居ない（入れると名前が折り返して逆に伸びる）');

  // ---- C2: 高さ。★ヘッダ行が戻ると 182px になるので、その手前で落ちる上限を置く
  ok(N.avg <= 160, 'C2 カード平均が 160px 以下（実測 ' + N.avg + 'px／旧構成は 182px）');
  ok(N.avg >= 120, 'C2b 逆に潰れていない（120px 以上・実測 ' + N.avg + 'px）');
  ok(N.max <= 160, 'C2c いちばん高いカードでも 160px 以下（実測 ' + N.max + 'px）');

  // ---- C3: タップ標的（STYLE-GUIDE §10.3）を縮めていない
  ok(N.minChgH >= 44, 'C3 「変更」の高さは全カードで 44px 以上（実測 最小 ' + N.minChgH + 'px）');
  ok(N.chgW >= 64, 'C3b 「変更」の幅は 64px 以上（実測 ' + N.chgW + 'px）');
  ok(N.chgId === 'chgbtn_A_0', 'C3c id は不変（bind を壊していない・実測 ' + N.chgId + '）');

  // ---- C4: 横あふれ 0
  ok(N.overflow === 0, 'C4 ページの横あふれ 0（実測 ' + N.overflow + 'px）');

  // ---- C5: ★理由ラベルが1つも無い場面でも「変更」が消えない
  //   旧実装は理由ラベルの行を `labelsHtml ? ... : ''` で出し分けていた。同居させたので、
  //   その出し分けが残っていると**ラベルが無いカードから「変更」が消える**。
  ok(E.rowCount === 2, 'C5 ラベルが空でも行は2本のまま（実測 ' + E.rowCount + '本）');
  ok(E.rows[1] && E.rows[1].hasChg, 'C5b ラベルが空でも「変更」が描かれる');
  ok(E.minChgH >= 44, 'C5c ラベルが空でも「変更」は 44px 以上（実測 最小 ' + E.minChgH + 'px）');
  ok(E.overflow === 0, 'C5d ラベルが空でも横あふれ 0');

  // ---- C6: 余白そのもの。★C2 の上限（160px）はヘッダ行の復活（182px）を捕まえるための網で、
  //   余白を 8px→12px に戻す退行（147px→155px）は素通りしてしまう（変異で実測）。
  //   詰めた余白は**カスケード解決後の実効値**で押さえる（宣言の grep ではなく getComputedStyle）。
  ok(N.padTop === '8px' && N.padBottom === '8px',
    'C6 カードの上下 padding は 8px（実測 ' + N.padTop + ' / ' + N.padBottom + '）');
  ok(N.marginBottom === '6px', 'C6b カードの下マージンは 6px（実測 ' + N.marginBottom + '）');

  ok(pageErrors.length === 0, '未捕捉例外が出ない' + (pageErrors.length ? '（実際: ' + pageErrors[0] + '）' : ''));

  console.log('\n  参考実測: カード ' + N.avg + 'px ／ ページ ' + N.page + 'px（30名2クラス・375px）');
  await browser.close();
  console.log('\nE2E-PAIRING-CARD-COMPACT-942: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
