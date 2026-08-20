#!/usr/bin/env node
// Playwright E2E: MEMBER-CITY-EDIT-001（#906 市町村を編集できる UI）
//   なぜ実ブラウザで測るか: #906 の元になった事故がまさに「**UI から到達できない**退役モーダルの中に
//   唯一の市町村入力がある」というもので、DOM モックはそれを一つも検出しなかった
//   （app_harness の getElementById は未知 id でもノードを自動生成する）。
//   ここでは **名簿タブの氏名セルをタップ → 編集パネル → 市町村を入力 → 保存** まで人間と同じ経路を通し、
//   欄が本当に開くこと・候補一覧が本当に出ること・クラウドへ実際に届くことを見る。
//
//   supabase は addInitScript で差し替える（ネットワークアクセスなし）。
//
// 使い方: node test/e2e/member_city_edit_906.e2e.js [html-or-url]
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');
const EXEC = process.env.PW_CHROME || undefined;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

const MID = 'm-kakuu-906';
const MASTER = {
  schema_version: 1,
  members: [
    { id: MID, name: '架空太郎', yomi: 'かくうたろ', member: 'member', grade: 'ippan', city: '',
      last_class: 'A', last_attended: '2026-06-01', deleted: false, tournament_ids: [] },
    { id: 'm-906-b', name: '安藤架空', yomi: 'あんどうかくう', member: 'member', grade: 'ippan', city: '三島市',
      last_class: 'A', last_attended: '2026-06-01', deleted: false, tournament_ids: [] },
    { id: 'm-906-c', name: '甲斐架空', yomi: 'かいかくう', member: 'member', grade: 'ippan', city: '沼津市',
      last_class: 'A', last_attended: '2026-06-01', deleted: false, tournament_ids: [] },
  ],
};
// クラウド側は市町村を持っている（＝端末は取り込み前）。触らない保存でこれが消えないことも見る。
const CLOUD_ROW = { member_id: MID, name: '架空太郎', yomi: 'かくうたろ', member_kind: 'member', grade: 'ippan', city: '長泉町' };

function initScript(cloudRow) {
  return `(function(){
    window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
    window.__e2e906 = { rpcs: [], cloud: ${JSON.stringify(cloudRow)} };
    function applyRow(r){
      var c = window.__e2e906.cloud;
      if (!c) {
        c = window.__e2e906.cloud = { member_id: r.member_id, name: r.name, yomi: r.yomi,
          member_kind: r.member_kind == null ? null : r.member_kind,
          grade: r.grade == null ? null : r.grade,
          city: r.city == null ? null : r.city, deleted_at: null };
        return { inserted: true, member_kind: c.member_kind, grade: c.grade, city: c.city, deleted_at: null };
      }
      c.name = r.name; c.yomi = r.yomi;
      if (r.set_member_kind) c.member_kind = r.member_kind == null ? null : r.member_kind;
      if (r.set_grade) c.grade = r.grade == null ? null : r.grade;
      if (r.set_city) c.city = r.city == null ? null : r.city;
      return { inserted: false, member_kind: c.member_kind, grade: c.grade, city: c.city, deleted_at: c.deleted_at || null };
    }
    window.supabase = { createClient: function(){ return {
      auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: {} } } }); },
              onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; },
              signOut: function(){ return Promise.resolve({ error: null }); } },
      rpc: function(name, args){
        window.__e2e906.rpcs.push({ name: String(name), args: args });
        if (name === 'claim_organizer_seat') return Promise.resolve({ data: [{ club_id: 'club-kakuu', status: 'active' }], error: null });
        if (name === 'app_upsert_member_edit') {
          return Promise.resolve({ data: applyRow({ member_id: args.p_member_id, name: args.p_name, yomi: args.p_yomi,
            member_kind: args.p_member_kind, grade: args.p_grade, city: args.p_city,
            set_member_kind: args.p_set_member_kind, set_grade: args.p_set_grade, set_city: args.p_set_city }), error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from: function(){ return {
        select: function(){ return { eq: function(){ return { in: function(){ return Promise.resolve({ data: [], error: null }); } }; } }; },
        upsert: function(rows){ return { select: function(){ return Promise.resolve({ data: rows, error: null }); } }; }
      }; }
    }; } };
  })();`;
}

async function openPanel(page) {
  await page.waitForFunction(() => typeof showTab === 'function' && typeof renderMasterTab === 'function');
  await page.evaluate((m) => {
    localStorage.setItem('shogi_branch_master', JSON.stringify(m));
    showTab('master');
    renderMasterTab();
  }, MASTER);
  await page.waitForSelector('.master-sheet-row[data-mid="' + MID + '"] .master-cell-name', { timeout: 5000 });
  await page.locator('.master-sheet-row[data-mid="' + MID + '"] .master-cell-name').click();
  await page.waitForSelector('#ms-edit-save', { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

  // ---- A: 欄が本当に開き、候補が本当に出る --------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await page.addInitScript(initScript(CLOUD_ROW));
    await page.goto(TARGET);
    await openPanel(page);

    ok(await page.locator('#ms-edit-city').count() === 1,
       '★A1 市町村の入力欄が実際の編集パネルに出る（#906 の本体・退役モーダルではなく生きている経路）');
    ok(await page.locator('#ms-edit-city').isVisible(),
       'A1a しかも実際に見えている（display:none の幽霊欄ではない）');
    const listAttr = await page.getAttribute('#ms-edit-city', 'list');
    ok(listAttr === 'ms-edit-city-list' && await page.locator('#ms-edit-city-list').count() === 1,
       '★A2 候補一覧（datalist）が実際に結線されている  [list=' + listAttr + ']');
    const opts = await page.$$eval('#ms-edit-city-list option', (os) => os.map((o) => o.value).sort());
    ok(JSON.stringify(opts) === JSON.stringify(['三島市', '沼津市']),
       '★A3 名簿に実在する市町村が候補になっている（呼び出し側が候補を渡している）  [' + opts.join(',') + ']');
    ok(await page.getAttribute('#ms-edit-city', 'maxlength') === '20',
       'A4 maxlength は normalizeCity の上限 20 と揃っている');
    ok(await page.inputValue('#ms-edit-city') === '',
       'A5 この会員の現在値（空）が初期表示に入る');
    ok(errs.length === 0, 'A6 未捕捉の JS 例外なし  [' + (errs.join(' / ') || 'なし') + ']');
    await page.close();
  }

  // ---- B: 入力 → 保存 → 端末とクラウドの両方に届く ------------------------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.addInitScript(initScript(CLOUD_ROW));
    await page.goto(TARGET);
    await openPanel(page);

    const before = await page.evaluate(() => document.getElementById('ms-edit-city').getAttribute('data-touched'));
    await page.fill('#ms-edit-city', '裾野市');
    const after = await page.evaluate(() => document.getElementById('ms-edit-city').getAttribute('data-touched'));
    ok(before === null && after === '1', '★B1 市町村欄に打つと「操作した」印が実際に立つ');

    await page.click('#ms-edit-save');
    await page.waitForFunction(() => window.__e2e906.rpcs.some((r) => r.name === 'app_upsert_member_edit'),
                               null, { timeout: 8000 });
    const cap = await page.evaluate(() => window.__e2e906);
    const args = cap.rpcs.filter((r) => r.name === 'app_upsert_member_edit')[0].args;
    ok(args.p_city === '裾野市' && args.p_set_city === true,
       '★B2 入力した市町村が set_city=true でクラウドへ届く  [' + args.p_city + '/' + args.p_set_city + ']');
    ok(cap.cloud.city === '裾野市', 'B3 クラウド側の行が実際に書き変わる（長泉町 → 裾野市）  [' + cap.cloud.city + ']');
    const local = await page.evaluate((id) => {
      const ms = JSON.parse(localStorage.getItem('shogi_branch_master')).members;
      for (const m of ms) if (m.id === id) return m.city;
      return null;
    }, MID);
    ok(local === '裾野市', 'B4 端末の名簿にも入る  [' + local + ']');
    await page.close();
  }

  // ---- C: 触らない保存では、クラウドの市町村を消さない --------------------
  //   ★ #901 の実害はここだった。欄が生えたことで「空を触っていないのに送る」に戻ると、
  //     編集のたびにクラウドの市町村が消える。
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.addInitScript(initScript(CLOUD_ROW));
    await page.goto(TARGET);
    await openPanel(page);

    await page.fill('#ms-edit-yomi', 'かくうたろう');     // ふりがなだけ直す。市町村には触らない。
    await page.click('#ms-edit-save');
    await page.waitForFunction(() => window.__e2e906.rpcs.some((r) => r.name === 'app_upsert_member_edit'),
                               null, { timeout: 8000 });
    const cap = await page.evaluate(() => window.__e2e906);
    const args = cap.rpcs.filter((r) => r.name === 'app_upsert_member_edit')[0].args;
    ok(args.p_set_city === false,
       '★C1 市町村を触っていない保存では set_city=false  [' + args.p_set_city + ']');
    ok(cap.cloud.city === '長泉町',
       '★C2 クラウドの市町村が編集のたびに消えない（#901 の実害が欄の追加で戻っていない）  [' + cap.cloud.city + ']');
    await page.close();
  }

  await browser.close();
  console.log(`\n  #906 実ブラウザ検証: ${pass}/${pass + fail} PASS`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('  ✗ 例外: ' + ((e && e.stack) || e)); process.exit(1); });
