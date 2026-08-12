#!/usr/bin/env node
// Playwright E2E: NUMAZU-BEHAVIOR-001（Issue #840）
//   実 Chromium で、他クラブの端末として使ったときに沼津固有の「挙動」が出ないことを確認する。
//     ① クラウド過去大会の一覧が入力どおりの大会名で並ぶ（ローカル履歴と表記が揃う＝受け入れ基準7）
//     ② 会員名簿タブの利用目的が、主体を名指ししない固定文で出る（受け入れ基準4）
//        ★ 初版は「そのクラブの主催者名を差し込む」設計だったが、反証パネル1巡目＋Codex P1 の実測で
//          撤回した。normalizeReportOrganizer が空を factory（日本将棋連盟沼津支部）へ戻すため、
//          差し込む設計だと他クラブの端末で必ず沼津が主体になり、旧文言より悪化していたため。
//   純関数層は test/test_numazu_behavior_840.js。
//
// 使い方（Mac・リポジトリ直下で）:
//   npm i -D playwright && npx playwright install chromium   # 初回のみ
//   node test/e2e/numazu_behavior_840.e2e.js
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
  const errors = [];
  const pg = await browser.newPage();
  pg.on('pageerror', e => errors.push(String(e && e.message || e)));
  await pg.goto(TARGET, { waitUntil: 'domcontentloaded' });

  // 松本クラブの端末として設定する（クラブ設定＋報告書）
  await pg.evaluate(() => {
    localStorage.setItem('shogi_club_profile', JSON.stringify({
      schema_version: 1,
      report: { title: '松本支部月例将棋大会', organizer: '日本将棋連盟松本支部' }
    }));
    state.report.title = '松本支部月例将棋大会';
    state.report.organizer = '日本将棋連盟松本支部';
  });

  // ---- ① クラウド過去大会の一覧 ----
  const list = await pg.evaluate(() => {
    const html = buildCloudTournamentListHtml([
      { id: 't1', name: '松本支部月例将棋大会', date: '2026-08-09' },
      { id: 't2', name: '〇〇将棋クラブ月例会', date: '2026-07-12' },
      { id: 't3', name: '松本支部将棋大会', date: '2026-06-14' },
      { id: 't4', name: '', date: '2026-05-10' }
    ]);
    const host = document.createElement('div');
    host.innerHTML = html;
    return {
      texts: [...host.querySelectorAll('*')].map(e => e.textContent.trim())
        .filter(t => t.indexOf('年') >= 0 && t.indexOf('度') >= 0 && t.length < 60),
      hasNumazu: html.indexOf('沼津') >= 0
    };
  });
  const joined = list.texts.join(' | ');
  ok(joined.indexOf('2026年8月度 松本支部月例将棋大会') >= 0, '① 松本の大会名がそのまま並ぶ  [実測 ' + joined.slice(0, 120) + ']');
  ok(joined.indexOf('2026年7月度 〇〇将棋クラブ月例会') >= 0, '① 「月例会」を含む名前もそのまま');
  ok(joined.indexOf('2026年6月度 松本支部将棋大会') >= 0, '① 月例を含まない名前は従来どおり');
  // ★パネル1巡目の指摘を反映: 空名の既定は factory 固定に戻した（クラブ設定案は撤回）。
  //   したがって空名の行だけは沼津既定が出る。これは「入力された名前を勝手に置換しない」という
  //   ①の主張とは別の話（空名はそもそもアプリの送信経路では作られない）。
  ok(joined.indexOf('2026年5月度 沼津支部月例将棋大会') >= 0, '① 名前が空の行は factory 既定（クラブ設定に依存しない）');
  ok(list.hasNumazu === true, '① 沼津が出るのは空名の行だけ（入力された名前は置換されない）');
  ok(joined.split('松本支部月例将棋大会').length - 1 >= 1 && joined.indexOf('沼津支部月例将棋大会 開催日 2026-08-09') < 0,
    '① 入力された「松本支部月例将棋大会」の行は沼津に化けていない');

  // ローカル履歴（生名）とクラウド一覧の表記が揃う（受け入れ基準7）
  const same = await pg.evaluate(() => {
    const raw = '松本支部月例将棋大会';
    return canonicalizeCloudTournamentName(raw) === raw;
  });
  ok(same, '① ローカル履歴（生名）とクラウド一覧の表記が揃う＝同じ大会が上下で別名にならない');

  // ---- ② 会員名簿タブの利用目的 ----
  const consent = await pg.evaluate(() => {
    showTab('master');
    const el = document.getElementById('pane-master') || document.body;
    const t = el.textContent || '';
    const i = t.indexOf('本ツールは');
    return i >= 0 ? t.slice(i, i + 90) : null;
  });
  // ★パネル1巡目＋Codex P1 の指摘を反映: 主催者名の差し込みは撤回した。
  //   normalizeReportOrganizer が空を factory（日本将棋連盟沼津支部）へ戻すので、
  //   差し込む設計だと他クラブの端末で必ず沼津が主体になり、旧文言より悪化していた。
  ok(consent && consent.indexOf('この端末で運営する大会の運営目的') >= 0,
    '② 同意文は主体を名指ししない  [実測 ' + String(consent).slice(0, 70) + '…]');
  ok(consent && consent.indexOf('沼津') < 0, '② 同意文に沼津が出ない');

  // ★ 主催者欄を実際に空にして blur（＝正規化を通す実操作）しても文面が変わらないこと
  const afterClear = await pg.evaluate(() => {
    showTab('result');
    const inp = document.getElementById('rep-organizer');
    let normalized = null;
    if (inp) {
      inp.value = '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      normalized = inp.value;
    }
    showTab('master'); renderMasterTab();
    const t = (document.getElementById('pane-master') || document.body).textContent || '';
    const i = t.indexOf('本ツールは');
    return { normalized, consent: i >= 0 ? t.slice(i, i + 90) : null };
  });
  ok(afterClear.consent && afterClear.consent.indexOf('この端末で運営する大会の運営目的') >= 0,
    '② 主催者欄を空にして正規化を通しても文面は変わらない  [正規化後の欄 = "' + afterClear.normalized + '"]');
  ok(afterClear.consent && afterClear.consent.indexOf('沼津') < 0,
    '② ★このとき沼津が主体にならない（Codex P1・パネルB/C の指摘した経路）');

  ok(errors.length === 0, '未捕捉例外なし' + (errors.length ? '（実際: ' + errors[0] + '）' : ''));

  await pg.close();
  await browser.close();
  console.log('\nE2E-NUMAZU-BEHAVIOR-840: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E runner error:', e); process.exit(1); });
