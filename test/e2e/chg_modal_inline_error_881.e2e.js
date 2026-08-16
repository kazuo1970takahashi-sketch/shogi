#!/usr/bin/env node
// Playwright E2E: CHG-MODAL-INLINE-ERROR-001 (#881)
//   対戦相手変更モーダルの入力エラー9件を native alert から画面内スロット（N5）へ移した。
//   STYLE-GUIDE v1.2 §3 N5「操作を止めた理由の提示」／§1 danger 面色／§3.1 見出し語／§3.2 置き場所。
//
// ★ 測り方の落とし穴（設計 v3 §1.8・実測で4つとも踏んだ）:
//   1. page.click() は Playwright が要素を自動スクロールするので、画面外でも成功する
//   2. overflow-y:auto を入れると rect も嘘をつく → クリップ判定（rect ⊂ カードの可視 rect）まで見る
//   3. elementFromPoint は inert のせいで #rotate-overlay を素通りする → 覆いは画素で見る
//   4. display:none / hidden の rect は 0×0 → 「クリップ内」を自明に満たす → 幅・高さ>0 も見る
//   ★ 667×375 は #rotate-overlay に覆われて見えないので測らない。
//
// ★ 9件のうち実 UI で素に踏めるのは3件だけ（#880 で候補が blocked になったため）。
//   残り6件は保存側の純 fail-safe で、option.disabled=false の細工が要る。
//
// 使い方: node test/e2e/chg_modal_inline_error_881.e2e.js [shogi_v4.html or URL]
// 終了コード 0=全PASS / 1=失敗。

const path = require('path');
const { chromium } = require('playwright');

const arg = process.argv[2];
const TARGET = arg
  ? (arg.startsWith('http') ? arg : 'file://' + path.resolve(arg))
  : 'file://' + path.resolve(__dirname, '..', '..', 'shogi_v4.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

// ---- 9件の期待文言（★ 実装から抽出せず、設計 v5 §4 の verbatim を持つ）--------
//   6件は現行のまま／3件（E1・E2・E6）は「次の行動」が無かったので v4/v5 で追記した
const MSG = {
  E1: '同じ参加者を先手・後手の両方には選べません。\n' +
      'どちらか一方を別の参加者に選び直してください。',
  E2: '変更がありません。\n先手か後手を選び直してください。',
  E3: 'この変更では、2人を同時に入れ替える必要があります。\n' +
      '現在は1人ずつの変更に対応しています。\n' +
      '選択を元に戻しました。もう一度、変更したい参加者を1人だけ選んでください。',
  E4: 'この参加者は棄権しています。\n棄権を取り消してから選び直してください。\n選択を元に戻しました。',
  E5: 'この対局には棄権した参加者が残ります。\n先に棄権した参加者のほうを入れ替えてください。\n選択を元に戻しました。',
  E6: '相手ペアが結果入力済みのため、入れ替えできません。\n' +
      '結果が入っていない別の対局の参加者を選んでください。',
  E7: 'この入れ替えでは、棄権した参加者が別の卓に移るだけです。\n' +
      '対局に入っていない参加者と入れ替えてください。\n選択を元に戻しました。',
  E8: '入れ替え先の卓に棄権した参加者がいます。\nその卓を先に直してください。\n選択を元に戻しました。',
  E9: 'この変更を行うと、再戦になる組み合わせが発生します。\n選択を元に戻しました。別の参加者を選び直してください。'
};

// ---- 場面（fixture）----------------------------------------------------------
const mk = (players, tables, withdrawn, winners) => `
  (function(){
    var P=[]; for(var i=1;i<=${players};i++)P.push({id:'p'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'});
    ${(withdrawn || []).map(id => `P.find(function(x){return x.id==='${id}';}).withdrawn=true;`).join('')}
    var T=${JSON.stringify(tables)}.map(function(t,i){
      return {p1:t[0],p2:t[1],winner:(${JSON.stringify(winners || {})})[i]||null,lastModifiedBy:'auto'};
    });
    state={players:{A:P,B:[]},rounds:4,results:{A:[],B:[]},pairings:{A:T,B:[]},started:true,
      classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};
    save(); showTab('tournament'); renderTournament('A');
  })();`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 440 } }); // ★ 最小画面で測る
  const page = await ctx.newPage();
  const alerts = [], pageErrors = [];
  page.on('dialog', d => { alerts.push(d.message()); d.accept().catch(() => {}); });
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof changePairing === 'function' && typeof showChangePairingError === 'function',
    null, { timeout: 20000 });

  const build = async (fix) => {
    await page.evaluate(() => { try { closeChangePairingModal(); } catch (e) {}
      var m = document.getElementById('app-modal'); if (m && m.parentNode) m.parentNode.removeChild(m); });
    await page.evaluate(fix); await page.waitForTimeout(90);
  };
  // ★ 見える＝rect が viewport 内 かつ カードの可視 rect 内 かつ 幅高さ>0
  const probe = () => page.evaluate(() => {
    const el = document.getElementById('chg-err');
    const card = document.querySelector('[data-chg-card="1"]');
    if (!el || !card) return { なし: true };
    const cr = card.getBoundingClientRect();
    const vis = (n) => { const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
          && r.top >= cr.top - 0.5 && r.bottom <= cr.bottom + 0.5; };
    const bodyEl = el.querySelector('.chg-err-body');
    const headEl = el.querySelector('.chg-err-head');
    const btnRow = card.lastElementChild;
    return {
      hidden: el.hidden, body: bodyEl ? bodyEl.textContent : null,
      head: headEl ? headEl.textContent : null,
      err見える: vis(el), 本文が切れていない: el.scrollHeight <= el.clientHeight + 1,
      保存見える: vis(document.getElementById('chg-save')),
      キャンセル見える: vis(btnRow.querySelector('button')),
      role: el.getAttribute('role'), live: el.getAttribute('aria-live'),
      次の兄弟がボタン行: el.nextElementSibling === btnRow,
      カード末尾がボタン行: card.lastElementChild === btnRow,
      attr: card.getAttribute('data-chg-err'),
      maxH: getComputedStyle(card).maxHeight, ovf: getComputedStyle(card).overflowY,
      bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color,
      modal: !!document.getElementById('chg-modal'), appModal: !!document.getElementById('app-modal'),
      pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2)
    };
  });

  // =====================================================================
  console.log('\n=== A. 実 UI から素に踏める3件（細工なし）===');
  const uiCases = [
    { id: 'E1', name: '同じ参加者を両方に', act: async () => {
        await page.selectOption('#chg-p1', 'p5'); await page.selectOption('#chg-p2', 'p5'); } },
    { id: 'E2', name: '変更がありません',   act: async () => {} },
    { id: 'E3', name: '2人を同時に',        act: async () => {
        await page.selectOption('#chg-p1', 'p5'); await page.selectOption('#chg-p2', 'p6'); } }
  ];
  for (const c of uiCases) {
    alerts.length = 0;
    await build(mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], [], {}));
    await page.click('#chgbtn_A_0'); await page.waitForTimeout(150);
    const before = await page.evaluate(() => state.pairings.A.map(m => m.p1 + 'v' + m.p2));
    await c.act();
    await page.click('#chg-save'); await page.waitForTimeout(250);
    const r = await probe();
    ok(alerts.length === 0, '[' + c.id + '-1] native alert が出ない（' + c.name + '）  [' + alerts.length + ']');
    ok(r.body === MSG[c.id], '[' + c.id + '-2] 文言が完全一致  [' + String(r.body).replace(/\n/g, '/').slice(0, 34) + ']');
    ok(r.err見える === true, '[' + c.id + '-3] ★ 375×440 でも警告が見える（クリップ・幅高0込み）');
    ok(r.本文が切れていない === true, '[' + c.id + '-3b] ★ 本文が箱の中で切れていない（N5 の必須条件）');
    ok(JSON.stringify(r.pairs) === JSON.stringify(before), '[' + c.id + '-4] state.pairings が変わらない');
    ok(r.modal === true, '[' + c.id + '-5] モーダルが残る');
    ok(r.appModal === false, '[' + c.id + '-6] ★ 確認モーダルが出ない（保存が本当に止まっている）');
    ok(r.保存見える === true && r.キャンセル見える === true,
       '[' + c.id + '-7] 保存・キャンセルも同時に見える（送り先がボタン行）');
  }

  // =====================================================================
  console.log('\n=== B. 保存側の fail-safe 6件（option の disabled を外して到達させる）===');
  const tamper = async (sel, val) => page.evaluate(({ sel, val }) => {
    const s = document.getElementById(sel);
    const o = Array.from(s.options).find(x => x.value === val);
    if (o) o.disabled = false;
    const b = document.getElementById('chg-save'); if (b) b.disabled = false;
    s.value = val;
  }, { sel, val });

  const fsCases = [
    { id: 'E4', fix: mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], ['p5'], {}), idx: 0, sel: 'chg-p1', val: 'p5' },
    { id: 'E5', fix: mk(7, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], ['p1'], {}), idx: 0, sel: 'chg-p2', val: 'p7' },
    { id: 'E6', fix: mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], [], { 1: 'p3' }), idx: 0, sel: 'chg-p1', val: 'p3' },
    { id: 'E7', fix: mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], ['p1'], {}), idx: 0, sel: 'chg-p1', val: 'p3' },
    { id: 'E8', fix: mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], ['p4'], {}), idx: 0, sel: 'chg-p1', val: 'p3' },
    { id: 'E9', fix: null, idx: 0, sel: 'chg-p1', val: 'p3' }   // 再戦は下で results を作る
  ];
  for (const c of fsCases) {
    alerts.length = 0;
    if (c.id === 'E9') {
      await build(`
        (function(){
          var P=[]; for(var i=1;i<=6;i++)P.push({id:'p'+i,name:'選手'+i,entry_no:i,member:'member',grade:'ippan'});
          state={players:{A:P,B:[]},rounds:4,
            results:{A:[[{p1:'p2',p2:'p3',winner:'p2'},{p1:'p1',p2:'p4',winner:'p1'},{p1:'p5',p2:'p6',winner:'p5'}]],B:[]},
            pairings:{A:[{p1:'p1',p2:'p2',winner:null,lastModifiedBy:'auto'},
                         {p1:'p3',p2:'p4',winner:null,lastModifiedBy:'auto'},
                         {p1:'p5',p2:'p6',winner:null,lastModifiedBy:'auto'}],B:[]},
            started:true,classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:false}],report:{}};
          save(); showTab('tournament'); renderTournament('A');
        })();`);
    } else {
      await build(c.fix);
    }
    await page.evaluate((i) => changePairing('A', i), c.idx);
    await page.waitForTimeout(120);
    const before = await page.evaluate(() => state.pairings.A.map(m => m.p1 + 'v' + m.p2));
    await tamper(c.sel, c.val);
    await page.evaluate(() => document.getElementById('chg-save').click());
    await page.waitForTimeout(250);
    const r = await probe();
    ok(alerts.length === 0, '[' + c.id + '-1] native alert が出ない  [' + alerts.length + ']');
    ok(r.body === MSG[c.id], '[' + c.id + '-2] 文言が完全一致  [' + String(r.body).replace(/\n/g, '/').slice(0, 30) + ']');
    ok(r.err見える === true && r.本文が切れていない === true, '[' + c.id + '-3] 警告が見えて本文が切れていない');
    ok(JSON.stringify(r.pairs) === JSON.stringify(before),
       '[' + c.id + '-4] state.pairings が変わらない  [' + (r.pairs ? r.pairs.join(',') : '(モーダルが消えた)') + ']');
    ok(r.appModal === false, '[' + c.id + '-6] ★ 確認モーダルが出ない');
  }

  // =====================================================================
  console.log('\n=== C. 器の作り（正本 v1.2 §1 / §3 N5 / §3.1 / §3.2）===');
  const c1 = await probe();
  ok(c1.head === '⚠ 変更を保存しませんでした', '[C1] 見出し語がある（色だけに意味を載せない・§3.1）  [' + c1.head + ']');
  ok(c1.role === 'alert' && c1.live === 'assertive', '[C2] role=alert / aria-live=assertive（§3 N5）');
  ok(c1.bg === 'rgb(253, 236, 234)' && c1.fg === 'rgb(165, 14, 14)',
     '[C3] danger の面色（§1）  [' + c1.bg + ' / ' + c1.fg + ']');
  ok(c1.次の兄弟がボタン行 === true && c1.カード末尾がボタン行 === true,
     '[C4] 器はボタン行の直前（§3.2 発生元と同じ面・押した場所の隣）');
  ok(c1.attr === '1' && c1.ovf === 'auto', '[C5] エラー表示中は data-chg-err が付きスクロール可能  [' + c1.maxH + ']');

  // =====================================================================
  console.log('\n=== D. 消えるタイミング（先手・後手の両方）===');
  for (const sel of ['chg-p1', 'chg-p2']) {
    await build(mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], [], {}));
    await page.click('#chgbtn_A_0'); await page.waitForTimeout(120);
    await page.click('#chg-save'); await page.waitForTimeout(200);   // 変更がありません
    const shown = await probe();
    await page.selectOption('#' + sel, sel === 'chg-p1' ? 'p5' : 'p6');
    await page.waitForTimeout(150);
    const after = await probe();
    ok(shown.hidden === false && after.hidden === true,
       '[D-' + sel + '] ' + (sel === 'chg-p1' ? '先手' : '後手') + '側を選び直すと消える');
    ok(after.attr === null && after.maxH === 'none',
       '[D-' + sel + '-attr] ★ data-chg-err も消える（消し忘れるとスクロール可能なまま残る）');
  }
  // 対照A: 放っておいても消えない（トーストと違う）
  await build(mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], [], {}));
  await page.click('#chgbtn_A_0'); await page.waitForTimeout(120);
  await page.click('#chg-save'); await page.waitForTimeout(3200);
  const d3 = await probe();
  ok(d3.hidden === false && d3.body === MSG.E2, '[D-対照A] 3秒後も残っている（時間で消えない）');

  // =====================================================================
  console.log('\n=== E. 対照: 既存の候補ゼロ案内（PR #108 §8.2 / info）は無改変 ===');
  await build(mk(2, [['p1', 'p2']], [], {}));
  await page.evaluate(() => changePairing('A', 0)); await page.waitForTimeout(120);
  const e1 = await page.evaluate(() => {
    const n = document.querySelector('[data-chg-empty-notice]');
    const card = document.querySelector('[data-chg-card="1"]');
    if (!n) return { なし: true };
    const cs = getComputedStyle(n);
    return { 文言: n.textContent.replace(/\s+/g, ' '), bg: cs.backgroundColor, fg: cs.color,
             saveDisabled: document.getElementById('chg-save').disabled,
             errHidden: document.getElementById('chg-err').hidden,
             cardMaxH: getComputedStyle(card).maxHeight };
  });
  ok(!e1.なし, '[E1] info の器が残っている（吸収していない）');
  ok(e1.bg === 'rgb(255, 247, 230)' && e1.fg === 'rgb(122, 74, 0)',
     '[E2] info の色が現行のまま（N5 の danger 面色とは別）  [' + e1.bg + ']');
  ok(!e1.なし && /1人だけ入れ替えできる候補がありません/.test(e1.文言 || ''),
     '[E3] info の文言が現行のまま  [' + String(e1.文言 || '(なし)').slice(0, 26) + ']');
  ok(e1.saveDisabled === true, '[E4] 保存ボタンの活殺は変えていない');
  ok(e1.errHidden === true && e1.cardMaxH === 'none',
     '[E5] ★ エラーを出していないので N5 の器は隠れ、max-height も効かない（＝ふだんの見え方は現行と同じ）');

  // =====================================================================
  console.log('\n=== F. fail-safe: 器が無ければ alert に落ちる ===');
  await build(mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], [], {}));
  await page.click('#chgbtn_A_0'); await page.waitForTimeout(120);
  const hadSlot = await page.evaluate(() => !!document.getElementById('chg-err'));
  ok(hadSlot === true, '[F0] ★ 先に器が「在る」ことを確かめる（無いのを確かめずに消さない）');
  alerts.length = 0;
  await page.evaluate(() => { const e = document.getElementById('chg-err'); if (e && e.parentNode) e.parentNode.removeChild(e); });
  await page.click('#chg-save'); await page.waitForTimeout(250);
  ok(alerts.length === 1 && alerts[0] === MSG.E2,
     '[F1] ★ 器が無ければ alert に落ちる（黙って続行しない）  [' + alerts.length + ']');

  // =====================================================================
  console.log('\n=== G. 対照: 普通の変更は従来どおり通る ===');
  alerts.length = 0;
  await build(mk(6, [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']], [], {}));
  await page.click('#chgbtn_A_0'); await page.waitForTimeout(120);
  await page.selectOption('#chg-p2', 'p5');
  await page.click('#chg-save'); await page.waitForTimeout(300);
  // ★ 別卓の参加者を選ぶ＝swap なので入れ替え確認（appConfirm）が出る。実クリックする
  const gConfirm = await page.evaluate(() => { const b = document.querySelector('#app-modal .app-modal-ok');
    if (!b) return false; b.click(); return true; });
  await page.waitForTimeout(350);
  ok(gConfirm === true, '[G0] 対照: swap では従来どおり入れ替え確認が出る');
  const g1 = await page.evaluate(() => ({
    pairs: state.pairings.A.map(m => m.p1 + 'v' + m.p2),
    modal: !!document.getElementById('chg-modal'),
    saved: (function () { try { const s = JSON.parse(localStorage.getItem('shogi_v4') || 'null');
      return s && s.pairings ? s.pairings.A.map(m => m.p1 + 'v' + m.p2) : null; } catch (e) { return null; } })()
  }));
  ok(g1.pairs[0] === 'p1vp5', '[G1] 普通の入れ替えは反映される  [' + g1.pairs.join(',') + ']');
  ok(g1.saved && g1.saved[0] === 'p1vp5', '[G2] localStorage にも保存される');
  ok(g1.modal === false, '[G3] 成功したらモーダルが閉じる');
  ok(alerts.length === 0, '[G4] 成功経路でも alert は出ない');

  // ★ Codex P2 (r3790501527): N5 スロットに出る文言は正本 §4.1 の「参加者」に統一する
  ok(Object.keys(MSG).every(k => !/選手/.test(MSG[k])),
     '[H1] ★ 9件の文言に禁止語「選手」が無い（STYLE-GUIDE §4.1）  [' +
     Object.keys(MSG).filter(k => /選手/.test(MSG[k])).join(',') + ']');

  ok(pageErrors.length === 0, '未捕捉例外なし  ' + (pageErrors.length ? '[' + pageErrors[0] + ']' : ''));

  await browser.close();
  console.log('\nE2E-CHG-MODAL-INLINE-ERROR-881: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
