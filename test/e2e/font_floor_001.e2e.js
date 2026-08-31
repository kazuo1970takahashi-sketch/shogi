#!/usr/bin/env node
// @suite: FONT-FLOOR-001 文字の床15px（実 Chromium で「描かれた文字」の computed font-size を数える）
//
// Playwright E2E: FONT-FLOOR-001
//   幹事が当日使う3画面（参加者登録・対局管理・最終結果）に、15px 未満の可視文字が
//   1つも無いことを **描画結果** で確かめる。CSS の宣言を数えるのではない。
//
//   なぜ実ブラウザか:
//     ① 宣言の grep では、ブラウザ既定値（UA stylesheet）で縮む文字を1文字も捕まえられない。
//        実際この検査を書いて初めて 2 箇所が見つかった:
//          - .winner-btn の <ruby> は app 側の rt 規則がどれも当たらず rt{font-size:50%} で
//            7.5px に描かれていた
//          - 最終結果 PC 表の <small>（font-size 未指定）が smaller = 12.5px で描かれていた
//        どちらも「15px 未満の font-size 宣言が無い」静的検査では緑のまま通る。
//     ② 継承・カスケード・@media・@container の効いた**最終値**は computed style でしか読めない。
//
//   ★ 場面を作るとき classes[].started = true を必須にすること。
//     入れないと対局管理が「未開始」画面になり、測定対象がまるごと変わる。
//
//   除外（ブリーフ §1・§4 の決定）:
//     - rt（ふりがな）= 10px。氏名より小さいことに意味がある
//     - #scoreboard-view 配下（星取表）= 実寸据え置き。横に列が多く、床を上げると右の列が
//       さらに画面外へ押し出されるため、列の見せ方を決める別スライスまで現状維持
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -g playwright && npx playwright install chromium   # 初回のみ
//   NODE_PATH="$(npm root -g)" node test/e2e/font_floor_001.e2e.js
//
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

const FLOOR = 15;          // 本文の既定と同値＝「本文より小さい文字を作らない」
const RUBY_PX = 10;        // ふりがなの床
const VIEWPORT = { width: 375, height: 812 };   // iPhone 幅（星取表の据え置き照合はこの幅で行う）
// ★ 幅を1つしか見ないと「緑だが何も測っていない」穴が開く。
//   最終結果タブはスマホ幅=カード / 広幅=PC表 と描画そのものが入れ替わり、
//   PC 表の <small>（font-size 未指定＝ブラウザ既定 smaller）は 375px では一度も描かれない。
//   実際 375px だけで測っていた版は、その <small> を 12.5px に戻す変異で緑のまま通った。
const SCREEN_VIEWPORTS = [
  { label: 'スマホ375', width: 375, height: 812 },
  { label: 'PC1024', width: 1024, height: 900 }
];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// 16名2クラス3回戦の架空データ（実データは使わない）。
// ふりがなは全員に入れる＝ルビ経路も必ず描画される。
const FIXTURE = () => {
  const NAMES = ['佐藤太郎', '鈴木一郎', '高橋次郎', '田中三郎', '伊藤四郎', '渡辺五郎', '山本六郎', '中村七郎',
                 '小林八郎', '加藤九郎', '吉田十郎', '山田花子', '佐々木桜', '山口美咲', '松本葵', '井上翔太'];
  const YOMI = ['さとうたろう', 'すずきいちろう', 'たかはしじろう', 'たなかさぶろう', 'いとうしろう', 'わたなべごろう', 'やまもとろくろう', 'なかむらしちろう',
                'こばやしはちろう', 'かとうくろう', 'よしだじゅうろう', 'やまだはなこ', 'ささきさくら', 'やまぐちみさき', 'まつもとあおい', 'いのうえしょうた'];
  const mk = (i, cls) => ({ id: 'p' + cls + i, name: NAMES[i], yomi: YOMI[i], cls: cls,
                            member: (i % 2 ? 'member' : 'guest'), grade: (i % 3 === 0 ? 'ippan' : (i % 3 === 1 ? 'chu' : 'josei')),
                            city: '沼津市', entry_no: i + 1 });
  const A = [], B = [];
  for (let i = 0; i < 8; i++) A.push(mk(i, 'A'));
  for (let i = 8; i < 16; i++) B.push(mk(i, 'B'));
  const rnd = (ps, off) => {
    const out = [];
    for (let i = 0; i < ps.length; i += 2) out.push({ p1: ps[(i + off) % ps.length].id, p2: ps[(i + 1 + off) % ps.length].id, winner: ps[(i + off) % ps.length].id });
    return out;
  };
  return {
    // ★ started:true が要る（無いと対局管理が未開始画面になり測定対象が変わる）
    classes: [{ id: 'A', name: 'Aクラス', started: true }, { id: 'B', name: 'Bクラス', started: true }],
    players: { A: A, B: B },
    results: { A: [rnd(A, 0), rnd(A, 1)], B: [rnd(B, 0), rnd(B, 1)] },
    pairings: { A: rnd(A, 2).map(m => ({ p1: m.p1, p2: m.p2, winner: null })), B: rnd(B, 2).map(m => ({ p1: m.p1, p2: m.p2, winner: null })) },
    rounds: 3, started: true,
    report: { date: '2026-08-24', name: '沼津支部月例大会', office: '沼津市' }
  };
};

// 描画された可視テキストノードを1つずつ辿り、その親の computed font-size を読む。
//   checkVisibility() と getBoundingClientRect() で不可視を落としてから測る。
const SCAN_SMALL = (floor) => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const small = [];
  let measured = 0, node;
  while ((node = w.nextNode())) {
    const txt = (node.nodeValue || '').replace(/\s/g, '');
    if (!txt) continue;
    const el = node.parentElement;
    if (!el) continue;
    if (el.tagName === 'RT') continue;                                  // ふりがなは別基準（後段で測る）
    if (el.closest && el.closest('#scoreboard-view')) continue;         // 星取表は据え置き（別途 実寸を照合）
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    measured += txt.length;
    const fs = parseFloat(cs.fontSize);
    if (fs < floor) {
      small.push({ fs: fs, tag: el.tagName, cls: String(el.className || '').slice(0, 30), id: el.id, txt: txt.slice(0, 16) });
    }
  }
  return { measured: measured, small: small.slice(0, 20), smallCount: small.length };
};

// ふりがな（rt）の実寸。星取表の中は据え置きなので除く。
const SCAN_RUBY = () => {
  const out = [];
  document.querySelectorAll('rt').forEach(e => {
    if (e.closest && e.closest('#scoreboard-view')) return;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    out.push(parseFloat(getComputedStyle(e).fontSize));
  });
  return out;
};

const OVERFLOW = () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth });

// 星取表の据え置き確認: 代表要素の実寸（据え置き前の値そのもの）
const SB_EXPECT = {
  '.sb-table': 13,       // 表本体（ここが動くと列幅が動く）
  '.sb-class-h': 14,
  '.sb-tab': 13,
  '.sb-meta': 12,
  '.sb-legend': 11,
  '.sb-opp': 10,         // セル内の対戦相手番号（表の中でいちばん小さい）
  '.sb-metric': 12,
  '.sb-wins': 15,
  '.sb-mark': 16
};
const SB_RT_EXPECT = 7.8;   // .sb-table rt = .6em × 13px

// 個人ビュー（行タップで開く画面）の据え置き確認（Codex P2-③）。
//   1巡目の pin は表モードの代表10点しか見ておらず、`.sb-pv-sub` を 12px→15px にしても緑のまま
//   通った（Codex が変異で実証）＝個人ビュー経路では1文字も測られていなかった。
//   期待値はすべて据え置き前（base 8aac743）の実測値。
const SB_PV_EXPECT = {
  '.sb-pv-back': 13,
  '.sb-pv-name': 17,
  '.sb-pv-sub': 12,      // ← Codex の変異が突いた点
  '.sb-pv-stats': 13,
  '.sb-next-h': 12,
  '.sb-history-h': 12,
  '.sb-hrow': 14,
  '.sb-hrow-r': 11,
  '.sb-hrow-no': 11
};
// 個人ビューの氏名ルビ: app 側の rt 規則がどれも当たらず UA 既定 50%（17px×50%=8.5px）。
//   床の対象外（星取表据え置き）だが、「変わっていないこと」の証拠として実寸を pin する。
const SB_PV_RT_EXPECT = 8.5;

const SB_READ = (sel) => {
  const e = document.querySelector('#scoreboard-view ' + sel);
  return e ? parseFloat(getComputedStyle(e).fontSize) : null;
};

(async () => {
  console.log('E2E target:', TARGET);
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];

  // ---- ① 幹事の3画面: 15px 未満の可視文字が1つも無い / 横あふれ 0 ----
  for (const vp of SCREEN_VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.goto(TARGET, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof showTab === 'function', null, { timeout: 15000 });
    await page.evaluate((s) => { Object.assign(state, s); }, FIXTURE());
    await page.evaluate(() => {
      try { renderClassManager(); } catch (e) {}
      try { renderRegList(); } catch (e) {}
      try { renderPastParticipantsPanel(); } catch (e) {}
      try { populateReportFields(); } catch (e) {}
    });

    for (const [label, tab] of [['参加者登録', 'reg'], ['対局管理', 'tournament'], ['最終結果', 'result']]) {
      const at = '[' + vp.label + '] ' + label;
      await page.evaluate((t) => showTab(t), tab);
      await page.waitForTimeout(120);
      const scan = await page.evaluate(SCAN_SMALL, FLOOR);
      const ruby = await page.evaluate(SCAN_RUBY);
      const ovf = await page.evaluate(OVERFLOW);

      // 「緑だが何も測っていない」を作らない: 測った文字数そのものを検査する
      ok(scan.measured > 300,
        at + ': 実際に文字を測っている（' + scan.measured + '文字）');
      ok(scan.smallCount === 0,
        at + ': ' + FLOOR + 'px 未満の可視文字が0（実測 ' + scan.smallCount + '件'
        + (scan.small.length ? ' 例=' + JSON.stringify(scan.small.slice(0, 3)) : '') + '）');
      ok(ruby.length > 0 && ruby.every(v => v === RUBY_PX),
        at + ': ふりがな(rt) は ' + RUBY_PX + 'px（' + ruby.length + '個・実測 ' + JSON.stringify([...new Set(ruby)]) + '）');
      ok(ovf.sw <= ovf.cw,
        at + ': 横あふれ 0（scrollWidth ' + ovf.sw + ' <= clientWidth ' + ovf.cw + '）');
    }
    await page.close();
  }

  // ---- ② 星取表(#scoreboard-view): 据え置き前と同じ実寸 ----
  const sb = await browser.newPage({ viewport: VIEWPORT });
  sb.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  await sb.goto(TARGET + '#scoreboard', { waitUntil: 'domcontentloaded' });
  await sb.waitForFunction(() => typeof renderScoreboard === 'function', null, { timeout: 15000 });
  await sb.evaluate((s) => { Object.assign(state, s); renderScoreboard(); }, FIXTURE());
  await sb.waitForTimeout(120);

  for (const sel of Object.keys(SB_EXPECT)) {
    const got = await sb.evaluate(SB_READ, sel);
    ok(got === SB_EXPECT[sel],
      '星取表 ' + sel + ' は据え置き ' + SB_EXPECT[sel] + 'px（実測 ' + got + '）');
  }
  const sbRt = await sb.evaluate(SB_READ, 'rt');
  ok(sbRt !== null && Math.abs(sbRt - SB_RT_EXPECT) < 0.05,
    '星取表 rt は据え置き ' + SB_RT_EXPECT + 'px（.6em × 13px・実測 ' + sbRt + '）');
  const sbOvf = await sb.evaluate(OVERFLOW);
  ok(sbOvf.sw <= sbOvf.cw, '星取表: ページの横あふれ 0（表自身は .sb-scroll の内側で横スクロール）');

  // ---- ②b クラス切替タブの経路（.sb-tab を実クリック）----
  //   タブ切替は表を描き直す＝動的に生成し直された要素も据え置きであることを確かめる。
  await sb.click('.sb-tab:nth-of-type(2)');
  await sb.waitForTimeout(150);
  const tabbedRows = await sb.evaluate(() => document.querySelectorAll('#scoreboard-view tr[data-sbpid]').length);
  ok(tabbedRows > 0, '星取表: クラス切替タブで表が描き直される（' + tabbedRows + '行）');
  const tabbedTable = await sb.evaluate(SB_READ, '.sb-table');
  ok(tabbedTable === SB_EXPECT['.sb-table'],
    '星取表: クラス切替後も .sb-table は据え置き ' + SB_EXPECT['.sb-table'] + 'px（実測 ' + tabbedTable + '）');

  // ---- ②c 個人ビュー（行タップ）の経路 ----
  await sb.click('#scoreboard-view tr[data-sbpid]');
  await sb.waitForTimeout(200);
  const pvOpen = await sb.evaluate(() => !!document.querySelector('#scoreboard-view .sb-pv-back'));
  ok(pvOpen, '星取表: 行タップで個人ビューが開く');
  for (const sel of Object.keys(SB_PV_EXPECT)) {
    const got = await sb.evaluate(SB_READ, sel);
    ok(got === SB_PV_EXPECT[sel],
      '個人ビュー ' + sel + ' は据え置き ' + SB_PV_EXPECT[sel] + 'px（実測 ' + got + '）');
  }
  const pvRt = await sb.evaluate(SB_READ, '.sb-pv-name rt');
  ok(pvRt !== null && Math.abs(pvRt - SB_PV_RT_EXPECT) < 0.05,
    '個人ビュー 氏名ルビは据え置き ' + SB_PV_RT_EXPECT + 'px（UA 既定 50%・実測 ' + pvRt + '）');
  await sb.close();

  ok(pageErrors.length === 0, '未捕捉例外が出ない' + (pageErrors.length ? '（実際: ' + pageErrors[0] + '）' : ''));

  await browser.close();
  console.log('\nE2E-FONT-FLOOR-001: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
