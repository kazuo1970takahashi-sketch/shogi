#!/usr/bin/env node
// Playwright E2E: MEMBER-EDIT-TOUCHED-COLS-001（#901）／ MEMBER-UPSERT-RPC-001（#909 便2）
//   なぜ実ブラウザで測るか: このスライスの直前、わたしは **UI から到達できない退役モーダル**
//   （openMasterEditModal・#798）に修正を書き、DOM モックのテストは全緑になってその誤りを
//   一つも検出しなかった。app_harness の getElementById は未知 id でもノードを自動生成するため、
//   「その画面が本当に開くのか」「そのボタンが本当に押せるのか」はモックでは測れない。
//   ここでは実ブラウザで **名簿タブの氏名セルをタップ → 編集パネル → セグメントを押す → 保存**
//   まで人間と同じ経路を通し、クラウドへ実際に送られた行を捕まえる。
//
//   supabase は addInitScript で差し替える（ネットワークアクセスなし・実 CDN も叩かない）。
//
// 使い方: node test/e2e/member_edit_touched_cols_901.e2e.js [html-or-url]
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

const MID = 'm-kakuu-e2e';
const MASTER = {
  schema_version: 1,
  members: [{ id: MID, name: '架空太郎', yomi: 'かくうたろ', member: 'member', grade: 'ippan', city: '',
              last_class: 'A', last_attended: '2026-06-01', deleted: false, tournament_ids: [] }],
};
// クラウド側は「その他・女性・沼津市」を持っている（＝端末は取り込み前で既定値のまま）
const CLOUD_ROW = { member_id: MID, name: '架空太郎', yomi: 'かくうたろ', member_kind: 'other', grade: 'josei', city: '沼津市' };

// #909: supabase の rpc を **名前で分岐する mock** に差し替え、app_upsert_member_edit の契約
//   （insert ... on conflict do update set＝set_* が false の列は既存値をそのまま残す）を実装する。
//   クラウド側の行はブラウザ内の変数で保持し、押した後の実値を testcase から読む。
//   ★ 名前を見ずに常に club 行を返す mock だと、会員 upsert の戻りまで club 行になって
//     「⚠ が出ない」縮退パスで緑になる。ゼロ回答ほど手を抜くと落ちる。
function initScript(cloudRow) {
  return `(function(){
    window.__e2e901 = { rpcs: [], selects: 0, upserts: [], cloud: ${JSON.stringify(cloudRow)} };
    function applyRow(r){
      var c = window.__e2e901.cloud;
      var inserted = !c;
      if (inserted) {
        c = window.__e2e901.cloud = { member_id: r.member_id, name: r.name, yomi: r.yomi,
          member_kind: r.member_kind == null ? null : r.member_kind,
          grade: r.grade == null ? null : r.grade,
          city: r.city == null ? null : r.city,
          deleted_at: r.touch_deleted_at ? (r.deleted_at || null) : null };
      } else {
        c.name = r.name; c.yomi = r.yomi;
        if (r.set_member_kind) c.member_kind = r.member_kind == null ? null : r.member_kind;
        if (r.set_grade) c.grade = r.grade == null ? null : r.grade;
        if (r.set_city) c.city = r.city == null ? null : r.city;
        if (r.touch_deleted_at) c.deleted_at = r.deleted_at || null;
      }
      return { inserted: inserted, member_kind: c.member_kind, grade: c.grade, city: c.city, deleted_at: c.deleted_at || null };
    }
    window.SHOGI_CLOUD_CONFIG = { url: 'https://kakuu.example', publishableKey: 'pk_kakuu' };
    window.supabase = { createClient: function(){ return {
      auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: {} } } }); } },
      rpc: function(name, args){
        window.__e2e901.rpcs.push({ name: String(name), args: args });
        if (name === 'claim_organizer_seat') return Promise.resolve({ data: [{ club_id: 'club-kakuu', status: 'active' }] });
        if (name === 'app_upsert_member_edit') return Promise.resolve({ data: applyRow({
          member_id: args.p_member_id, name: args.p_name, yomi: args.p_yomi,
          member_kind: args.p_member_kind, grade: args.p_grade, city: args.p_city,
          set_member_kind: args.p_set_member_kind, set_grade: args.p_set_grade, set_city: args.p_set_city,
          deleted_at: args.p_deleted_at, touch_deleted_at: args.p_touch_deleted_at }), error: null });
        if (name === 'app_upsert_member_edits_bulk') {
          var rows = (args && args.p_rows) || [], ins = 0;
          rows.forEach(function(r){ if (applyRow(r).inserted) ins++; });
          return Promise.resolve({ data: { count: rows.length, inserted: ins }, error: null });
        }
        return Promise.resolve({ data: null, error: { message: '想定外の RPC: ' + name } });
      },
      from: function(t){ return {
        select: function(){ return { eq: function(){ return { in: function(){
          window.__e2e901.selects++;
          return Promise.resolve({ data: [], error: null });
        } }; } }; },
        upsert: function(rows){ window.__e2e901.upserts.push(rows); return { select: function(){
          return Promise.resolve({ data: rows, error: null }); } }; }
      }; }
    }; } };
  })();`;
}

async function openMasterTab(page) {
  await page.waitForFunction(() => typeof showTab === 'function' && typeof renderMasterTab === 'function');
  await page.evaluate((m) => {
    localStorage.setItem('shogi_branch_master', JSON.stringify(m));
    showTab('master');
    renderMasterTab();
  }, MASTER);
  await page.waitForSelector('.master-cell-name', { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

  // ---- A: 名簿タブ → 氏名セルをタップ → 編集パネルが実際に開く -------------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await page.addInitScript(initScript(CLOUD_ROW));
    await page.goto(TARGET);
    await openMasterTab(page);

    ok(await page.locator('#masterCloudPullStatus').count() === 1, 'A1 クラウド結果を出す status 行が実在する');
    await page.locator('.master-cell-name').first().click();
    await page.waitForSelector('#ms-edit-save', { timeout: 5000 });
    ok(await page.locator('#ms-edit-name').count() === 1, 'A2 氏名セルのタップで編集パネルが実際に開く（氏名入力が出る）');
    ok(await page.locator('#ms-edit-member').count() === 1 && await page.locator('#ms-edit-grade').count() === 1,
       'A3 支部員区分・級のセグメントが出る');
    // ★ Codex P2 (r3801845101): 「市町村欄が無いこと」を assert すると、#906 で正しく足したときに
    //   赤くなる change detector になる。ここでは氏名/ふりがなの欄が実在することだけを見て、
    //   市町村の有無は記録に留める（欄と touched の対応は単体テストの R6 が見る）。
    ok(await page.locator('#ms-edit-yomi').count() === 1, 'A4 ふりがなの入力欄が実在する');
    const hasCity = await page.locator('#ms-edit-city').count() > 0;
    console.log('  ・（記録）このパネルの市町村欄: ' + (hasCity ? 'あり' : 'なし（#906）'));

    // ふりがなの誤字だけ直す。区分・級には触らない。
    await page.fill('#ms-edit-yomi', 'かくうたろう');
    await page.click('#ms-edit-save');
    await page.waitForFunction(() => window.__e2e901.rpcs.some((r) => r.name === 'app_upsert_member_edit'),
                               null, { timeout: 8000 });
    const cap = await page.evaluate(() => window.__e2e901);
    const args = cap.rpcs.filter((r) => r.name === 'app_upsert_member_edit')[0].args;
    ok(cap.selects === 0 && cap.upserts.length === 0,
       '★A5 送信前に members を読まない・直接 upsert もしない（#909＝読み取り失敗も競合窓も原理的に生じない）');
    // ★ 実ブラウザでは起動時の認証確認でも claim_organizer_seat が飛ぶ（実測）。
    //   ここで測りたいのは「この保存が会員の行を何回書いたか」なので、その名前だけを数える。
    //   往復が「クラブ特定 → upsert」の 2 回で済むことは単体テスト P9 が隔離環境で見ている。
    ok(cap.rpcs.filter((r) => r.name === 'app_upsert_member_edit').length === 1,
       'A5a 会員 upsert の RPC はちょうど 1 回（保存 1 回につきクラウドへの書き込みは 1 文）  [' + cap.rpcs.map((r) => r.name).join(',') + ']');
    ok(args.p_set_member_kind === false && args.p_set_grade === false && args.p_set_city === false,
       'A5b 触っていない欄は set_* が false（＝既存行のその列を 1 バイトも変えない）');
    ok(cap.cloud.yomi === 'かくうたろう', 'A6 直したふりがなが実際にクラウドへ届く');
    ok(cap.cloud.member_kind === 'other' && cap.cloud.grade === 'josei' && cap.cloud.city === '沼津市',
       '★A7 触っていない区分・級・市町村はクラウドの実値のまま（従来は member/ippan/null で潰していた）');
    const st = await page.locator('#masterCloudPullStatus').innerText();
    ok(/反映しました/.test(st) && /⚠/.test(st) && /市町村/.test(st),
       '★A8 クラウドに残った実値が端末の表示と違うことを status 行の ⚠ で名指しする（RPC の戻り＝推測ではなく実測）  [' + st.replace(/\s+/g, ' ').slice(0, 70) + ']');
    ok(errs.length === 0, 'A9 未捕捉の JS 例外なし  [' + (errs.join(' / ') || 'なし') + ']');
    await page.close();
  }

  // ---- B: 同じ値を押し直した保存は「操作した」として届く -------------------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.addInitScript(initScript(CLOUD_ROW));
    await page.goto(TARGET);
    await openMasterTab(page);
    await page.locator('.master-cell-name').first().click();
    await page.waitForSelector('#ms-edit-save', { timeout: 5000 });

    // ローカルは既に「支部員・一般」。クラウドだけ古い。利用者は同じ値のボタンを押し直す。
    const before = await page.evaluate(() =>
      document.getElementById('ms-edit-grade').getAttribute('data-touched'));
    await page.locator('#ms-edit-member button[data-val="member"]').click();
    await page.locator('#ms-edit-grade button[data-val="ippan"]').click();
    const after = await page.evaluate(() =>
      document.getElementById('ms-edit-grade').getAttribute('data-touched'));
    ok(before === null && after === '1', '★B1 初期値と同じ値を押し直しても「操作した」印が実際に立つ（差分ゼロでも訂正を送れる）');

    await page.click('#ms-edit-save');
    await page.waitForFunction(() => window.__e2e901.rpcs.some((r) => r.name === 'app_upsert_member_edit'),
                               null, { timeout: 8000 });
    const cap2 = await page.evaluate(() => window.__e2e901);
    const args2 = cap2.rpcs.filter((r) => r.name === 'app_upsert_member_edit')[0].args;
    ok(args2.p_set_member_kind === true && args2.p_set_grade === true,
       'B1a 押した欄は set_* が true で渡る（touched がそのまま写る）');
    ok(cap2.cloud.member_kind === 'member' && cap2.cloud.grade === 'ippan',
       '★B2 押し直した区分・級は既定値方向でもクラウドへ届く（#901 の本題）');
    ok(cap2.cloud.city === '沼津市', 'B3 同じ保存でも欄の無い市町村はクラウドの実値のまま（欄ごとに独立）');
    await page.close();
  }

  await browser.close();
  console.log(`\n  #901 実ブラウザ検証: ${pass}/${pass + fail} PASS`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('  ✗ 例外: ' + ((e && e.stack) || e)); process.exit(1); });
